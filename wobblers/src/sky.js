// Sky, clouds and the day/night cycle.
//
// Game-facing values (read them, don't write them except via setTimeOfDay):
//   game.timeOfDay   hours, 0..24 (12 = noon)
//   game.dayLight    0 at night .. 1 in full day (smooth)
//   game.isNight     true between dusk and dawn (lamps, windows, headlights on)
//   game.nightLight  0..1, the inverse of dayLight with a softer ramp; use it to fade lights in
//   game.daySpeed    in-game hours per real second (default: a 16-minute day); 0 freezes time
//   game.setTimeOfDay(h)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { glowUniform } from './look.js';

const DAY_MINUTES = 16;
const C = (h) => new THREE.Color(h);
const sat = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// Palette keyed by sun height: night / twilight (sun at the horizon) / day.
const PAL = {
  top:     [C(0x0a1238), C(0x3a5aa8), C(0x2f8cf5)],
  horizon: [C(0x1c2c5c), C(0xffa070), C(0xbfe6ff)],
  sun:     [C(0x8fa8ff), C(0xff9a50), C(0xfff0d0)],
  hemiSky: [C(0x6a80c8), C(0xc0a8c8), C(0xd4ecff)],
  hemiGnd: [C(0x28344c), C(0x6a5a50), C(0x6f9a4c)],
  cloud:   [C(0x3a4670), C(0xffb08a), C(0xffffff)],
  cloudSh: [C(0x1c2240), C(0x8a6a8a), C(0xb8cce0)],
};

function blend3(arr, night, twi, out) {
  // night weight, twilight weight; day = remainder
  const day = Math.max(0, 1 - night - twi);
  out.setRGB(
    arr[0].r * night + arr[1].r * twi + arr[2].r * day,
    arr[0].g * night + arr[1].g * twi + arr[2].g * day,
    arr[0].b * night + arr[1].b * twi + arr[2].b * day);
  return out;
}

const skyVert = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.99999; }`;
const skyFrag = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 moonDir;
uniform float night; uniform float sunset; uniform float time; uniform float under; uniform vec3 underCol;
varying vec3 vP;
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vP);
  float y = d.y;
  float h = clamp(y*1.25+0.04, 0.0, 1.0);
  vec3 c = mix(horizon, top, pow(h, 0.62));
  // below the horizon: a little darker so the sea line reads
  c = mix(c, horizon*0.85, smoothstep(0.0, -0.2, y));
  float s = max(dot(d, sunDir), 0.0);
  // warm glow around the sun, wide at sunset
  c += sunCol * (pow(s, 6.0) * (0.15 + 0.55*sunset) + pow(s, 64.0) * 0.35);
  // sun disc
  c += sunCol * smoothstep(0.9993, 0.9996, s) * 3.0 * (1.0 - night);
  // moon + stars
  float m = max(dot(d, moonDir), 0.0);
  c += vec3(0.85,0.9,1.0) * smoothstep(0.9990, 0.9993, m) * 1.6 * night + vec3(0.25,0.3,0.5) * pow(m, 40.0) * night * 0.6;
  if (night > 0.01 && y > 0.0) {
    vec3 g = floor(d * 160.0);
    float st = h31(g);
    float tw = 0.6 + 0.4*sin(time*3.0 + st*60.0);
    vec3 f = fract(d*160.0) - 0.5;
    c += vec3(1.0) * step(0.985, st) * smoothstep(0.25, 0.0, length(f)) * night * tw * smoothstep(0.0, 0.25, y);
  }
  // written raw, like three's fog colour, so distant fogged things melt into the sky
  if (under > 0.5) c = underCol * (0.8 + 0.4 * clamp(y + 0.3, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

// A fluffy cloud: flattened low-poly spheres with vertex shading baked in
// (white tops, cool grey bellies). One geometry, instanced.
function cloudGeometry() {
  const parts = [];
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blobs = [[0, 0, 0, 1], [1.1, -0.15, 0.2, 0.75], [-1.05, -0.2, -0.1, 0.7], [0.45, 0.35, -0.3, 0.7], [-0.4, 0.25, 0.35, 0.65], [1.9, -0.35, 0, 0.45], [-1.8, -0.35, 0.15, 0.45]];
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(x, y, z);
    parts.push(g);
  }
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let y = pos.getY(i);
    if (y < -0.25) { y = -0.25 - (y + 0.25) * 0.25; pos.setY(i, y); } // flat bottom
    const t = sat((y + 0.4) / 1.1) * (0.85 + rnd() * 0.15);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = t;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.scale(1, 0.62, 0.8);
  g.computeVertexNormals();
  return g;
}

export class Sky {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    game.daySpeed = 24 / (DAY_MINUTES * 60);
    game.timeOfDay = 10.5;
    game.setTimeOfDay = (h) => { game.timeOfDay = ((h % 24) + 24) % 24; this.update(0); };

    this.hemi = new THREE.HemisphereLight(0xcfeaff, 0x6a8a4a, 1.2);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();  // direction the shadow light comes from
    this.trueSun = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();

    this.u = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: this.trueSun }, moonDir: { value: this.moonDir }, sunCol: { value: new THREE.Color() },
      night: { value: 0 }, sunset: { value: 0 }, time: { value: 0 }, under: { value: 0 }, underCol: { value: new THREE.Color() },
    };
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.u, vertexShader: skyVert, fragmentShader: skyFrag });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), skyMat);
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // clouds: one instanced mesh drifting with the wind, wrapped round the island
    const N = 34;
    this.cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.cloudMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTop = { value: this.cloudTop = new THREE.Color() };
      sh.uniforms.uBot = { value: this.cloudBot = new THREE.Color() };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uTop; uniform vec3 uBot;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(uBot, uTop, vColor.r);');
    };
    this.cloudTop = new THREE.Color(); this.cloudBot = new THREE.Color();
    this.clouds = new THREE.InstancedMesh(cloudGeometry(), this.cloudMat, N);
    this.clouds.frustumCulled = false;
    this.cloudData = [];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const s = 9 + rnd() * 12;
      this.cloudData.push({ x: (rnd() * 2 - 1) * 650, z: (rnd() * 2 - 1) * 650, y: 110 + rnd() * 70, s, yaw: rnd() * 6.28, sy: s * (0.8 + rnd() * 0.5) });
    }
    scene.add(this.clouds);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.wind = new THREE.Vector2(2.2, 0.9);
    this.fogColor = new THREE.Color(0xbfe6ff);
    this.fogFar = 650;
    this.update(0);
  }

  update(dt) {
    const g = this.game;
    if (dt) g.timeOfDay = (g.timeOfDay + dt * g.daySpeed) % 24;
    this.u.time.value += dt;
    const h = g.timeOfDay;
    // sun arc: rises in the east (+x) at 6:00, sets in the west at 18:00, tilted south
    const a = (h - 6) / 12 * Math.PI;
    this.trueSun.set(Math.cos(a) * 0.86, Math.sin(a) * 0.72 + 0.08, 0.42).normalize();
    this.moonDir.copy(this.trueSun).multiplyScalar(-1);
    this.moonDir.y = Math.abs(this.moonDir.y) * 0.9 + 0.12; this.moonDir.normalize();
    const sy = this.trueSun.y;
    const dayLight = smooth(-0.12, 0.28, sy);
    const night = 1 - smooth(-0.22, -0.02, sy);
    const twi = Math.max(0, 1 - night - smooth(0.05, 0.35, sy)) ; // twilight weight
    g.dayLight = dayLight;
    g.nightLight = 1 - smooth(-0.15, 0.08, sy);
    g.isNight = g.nightLight > 0.5;
    glowUniform.value = g.nightLight;

    const sunset = Math.max(0, 1 - Math.abs(sy - 0.04) / 0.22);
    blend3(PAL.top, night, twi, this.u.top.value);
    blend3(PAL.horizon, night, twi, this.u.horizon.value);
    blend3(PAL.sun, night, twi, this.u.sunCol.value);
    this.u.night.value = night;
    this.u.sunset.value = sunset;

    // shadow light: the sun by day, the moon by night, crossing over at the horizon
    const sunUp = sy > -0.04;
    const src = sunUp ? this.trueSun : this.moonDir;
    this.sunDir.copy(src);
    if (this.sunDir.y < 0.18) { this.sunDir.y = 0.18; this.sunDir.normalize(); } // keep shadows a sane length
    const fade = sunUp ? smooth(-0.04, 0.12, sy) : smooth(-0.04, -0.2, sy);
    blend3(PAL.sun, night, twi, this.sun.color);
    if (!sunUp) this.sun.color.set(0x9fb4ff);
    this.sun.intensity = fade * (sunUp ? 1.0 + 1.9 * dayLight : 0.85);
    this.hemi.intensity = 0.85 + 0.23 * dayLight;
    blend3(PAL.hemiSky, night, twi, this.hemi.color);
    blend3(PAL.hemiGnd, night, twi, this.hemi.groundColor);
    blend3(PAL.cloud, night, twi, this.cloudTop);
    blend3(PAL.cloudSh, night, twi, this.cloudBot);
    // the fog melts into the horizon
    this.fogColor.copy(this.u.horizon.value).lerp(this.u.top.value, 0.12);
    this.fogFar = 420 + 260 * dayLight;
    g.renderer.toneMappingExposure = 1.0 + 0.15 * (1 - dayLight);

    // clouds drift and wrap
    const W = 650;
    this.clouds.instanceMatrix.needsUpdate = true;
    this.cloudData.forEach((c, i) => {
      c.x += this.wind.x * dt; c.z += this.wind.y * dt;
      if (c.x > W) c.x -= 2 * W; if (c.z > W) c.z -= 2 * W;
      this._q.setFromAxisAngle(this._v.set(0, 1, 0), c.yaw);
      this._m.compose(this._v.set(c.x, c.y, c.z), this._q, this._s.set(c.s, c.sy, c.s));
      this.clouds.setMatrixAt(i, this._m);
    });
  }

  // per view: keep the dome round the camera
  view(cam, under = false, underCol = null) {
    this.dome.position.copy(cam.position);
    this.u.under.value = under ? 1 : 0;
    if (underCol) this.u.underCol.value.copy(underCol);
  }
}
