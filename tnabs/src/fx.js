// Particles and one-shot effects, driven by battle events. Everything is pooled and
// instanced: lit chunks (blood drops, debris), camera-facing billboards from one
// texture atlas (dust, smoke, fire, sparks, sparkles, notes), ground decals and a few
// pooled shockwave rings. FX also watches live unit visuals to kick up dust when
// they run, stomp or hit the ground.
import { THREE, rand, clamp } from './util.js';
import { LIVE_VIS } from './visual.js';

const MAX_SOLID = 1800, MAX_SOFT = 1600, MAX_GLOW = 1400, MAX_SPLAT = 600, NRING = 10;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

// atlas tiles
const T_PUFF = 0, T_SMOKE = 1, T_STAR = 2, T_NOTE = 3, T_NOTE2 = 4, T_PLUS = 5, T_FLAME = 6, T_DUST = 7;
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 128 + 64, Math.floor(i / 4) * 128 + 64); fn(); g.restore(); };
  const radial = (r, stops) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };
  cell(T_PUFF, () => { g.fillStyle = radial(62, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128); });
  const lumps = (seed, shade) => {
    const pts = [[0, 4, 34], [-22, 12, 24], [22, 10, 26], [-10, -14, 26], [14, -16, 22], [0, -26, 18]];
    for (const [x, y, r] of pts) {
      const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.1, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.7, `rgba(${shade},${shade},${shade},0.95)`);
      gr.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  };
  cell(T_SMOKE, () => lumps(1, 205));
  cell(T_DUST, () => { g.globalAlpha = 0.85; lumps(2, 225); });
  cell(T_STAR, () => {
    g.fillStyle = radial(40, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128);
    g.fillStyle = '#fff'; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 11 : 52; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  const note = (two) => {
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(40,30,60,0.9)'; g.lineWidth = 5;
    const head = (x, y) => { g.beginPath(); g.ellipse(x, y, 16, 12, -0.4, 0, 7); g.fill(); g.stroke(); };
    g.beginPath();
    if (two) { g.rect(-20, -40, 8, 62); g.rect(24, -46, 8, 62); g.moveTo(-20, -40); g.lineTo(32, -50); g.lineTo(32, -36); g.lineTo(-20, -26); }
    else { g.rect(6, -46, 8, 66); g.moveTo(14, -46); g.quadraticCurveTo(40, -36, 34, -8); g.quadraticCurveTo(30, -26, 14, -28); }
    g.fill(); g.stroke(); g.fill();
    if (two) { head(-28, 24); head(16, 18); } else head(-2, 22);
  };
  cell(T_NOTE, () => note(false));
  cell(T_NOTE2, () => note(true));
  cell(T_PLUS, () => {
    g.fillStyle = radial(50, [[0, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128);
    g.fillStyle = '#fff'; g.fillRect(-10, -36, 20, 72); g.fillRect(-36, -10, 72, 20);
  });
  cell(T_FLAME, () => { g.fillStyle = radial(62, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128); });
  ATLAS = new THREE.CanvasTexture(c);
  ATLAS.colorSpace = THREE.SRGBColorSpace;
  return ATLAS;
}

// Camera-facing instanced quads; per instance: matrix (position + size), colour,
// iData = (alpha, atlas tile, rotation).
function billboards(max, additive) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const data = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  data.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iData', data);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { map: { value: atlas() } },
    vertexShader: `attribute vec3 iData; varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        float c = cos(iData.z), sn = sin(iData.z);
        mv.xy += mat2(c, sn, -sn, c) * position.xy * s;
        gl_Position = projectionMatrix * mv;
        float col = mod(iData.y, 4.0), row = floor(iData.y / 4.0);
        vUv = vec2((uv.x + col) * 0.25, (uv.y + 1.0 - row) * 0.5);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        vA = iData.x;
      }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vCol * t.rgb, a); }`,
  });
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color(1, 1, 1));
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.count = 0;
  m.renderOrder = additive ? 6 : 5;
  m.userData.data = data;
  return m;
}

function splatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(64, 64, 38, 0, 7); g.fill();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28 + Math.sin(i * 3.1) * 0.3, d = 34 + (i % 3) * 8, r = 8 + (i * 7 % 5) * 2;
    g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); g.fill();
    g.beginPath(); g.arc(64 + Math.cos(a) * (d + r + 6), 64 + Math.sin(a) * (d + r + 6), r * 0.45, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.72, 'rgba(255,255,255,0.25)');
  gr.addColorStop(0.9, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    const map = terrain.map || {};
    this.dustCol = new THREE.Color(map.snow ? '#f4f8fc' : map.dirt || '#b9a68a').lerp(new THREE.Color('#f2ead8'), map.snow ? 0 : 0.45);
    this.chunkCol = new THREE.Color(map.dirt || '#7a5a3a').multiplyScalar(0.8);
    this.grassCol = new THREE.Color((map.ground && map.ground[2]) || '#4f9a2c');
    // lit chunks
    this.solid = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), MAX_SOLID);
    this.solid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.solid.setColorAt(0, _c.set('#ffffff'));
    this.solid.frustumCulled = false;
    this.solid.count = 0;
    this.solid.castShadow = false;
    scene.add(this.solid);
    this.soft = billboards(MAX_SOFT, false);
    this.glow = billboards(MAX_GLOW, true);
    scene.add(this.soft, this.glow);
    this.ps = []; this.ss = []; this.gs = [];
    // ground splats
    const sg = new THREE.PlaneGeometry(2, 2);
    sg.rotateX(-Math.PI / 2);
    this.splats = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: '#ffffff', map: splatTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX_SPLAT);
    this.splats.setColorAt(0, _c.set('#ffffff'));
    this.splats.count = 0;
    this.splats.receiveShadow = true;
    this.splats.frustumCulled = false;
    this.splats.renderOrder = 1;
    this.splatI = 0;
    scene.add(this.splats);
    // rings (heal, shockwave): a small pool of flat textured discs
    const rg = new THREE.PlaneGeometry(2, 2);
    rg.rotateX(-Math.PI / 2);
    const rt = ringTexture();
    this.rings = [];
    for (let i = 0; i < NRING; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = false; m.renderOrder = 4;
      scene.add(m);
      this.rings.push({ m, r: 1, life: 0, max: 1 });
    }
    this.ringI = 0;
    // flash light
    this.light = new THREE.PointLight('#ffb050', 0, 18, 2);
    scene.add(this.light);
    this.lightT = 0;
    this.blood = true;
  }

  clear() {
    this.ps.length = 0; this.ss.length = 0; this.gs.length = 0;
    this.splats.count = 0; this.splatI = 0;
    for (const r of this.rings) { r.life = 0; r.m.visible = false; }
    this.lightT = 0; this.light.intensity = 0;
    for (const v of LIVE_VIS) v._fx = null;
  }

  // ---- particle spawners
  // solid chunk
  chunk(x, y, z, vx, vy, vz, size, life, color, g = 9.81, drag = 0.4) {
    if (this.ps.length >= MAX_SOLID) return;
    this.ps.push({ x, y, z, vx, vy, vz, size, life, max: life, c: new THREE.Color(color), g, drag, rx: rand(0, 6), vr: rand(-12, 12), bounce: 0.3 });
  }
  // billboard: o = {grow, alpha, tile, g, drag, ground, rot, vr, fadeIn, wob, shrink}
  bb(list, x, y, z, vx, vy, vz, size, life, color, o = {}) {
    if (list.length >= (list === this.ss ? MAX_SOFT : MAX_GLOW)) return;
    list.push({ x, y, z, vx, vy, vz, size, life, max: life, c: color.isColor ? color.clone() : new THREE.Color(color),
      grow: o.grow ?? 0, a: o.alpha ?? 1, tile: o.tile ?? T_PUFF, g: o.g ?? 0, drag: o.drag ?? 1, ground: o.ground ?? false,
      rot: o.rot ?? rand(0, 6.28), vr: o.vr ?? 0, fadeIn: o.fadeIn ?? 0.08, wob: o.wob ?? 0, ph: rand(0, 6.28), shrink: o.shrink ?? false });
  }
  dust(x, y, z, n, size = 0.35, spread = 0.3, up = 0.8) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), sp = rand(0.4, 1.4) * spread * 3;
      this.bb(this.ss, x + Math.cos(a) * spread, y + 0.08, z + Math.sin(a) * spread, Math.cos(a) * sp, rand(0.2, 1) * up, Math.sin(a) * sp,
        size * rand(0.7, 1.3), rand(0.6, 1.1), _c.copy(this.dustCol).multiplyScalar(rand(0.92, 1.05)),
        { tile: Math.random() < 0.5 ? T_DUST : T_SMOKE, grow: 1.6, alpha: 0.75, drag: 3, vr: rand(-1, 1) });
    }
  }

  event(e) {
    const [k, x, y, z, a, b, c] = e;
    switch (k) {
      case 'blood': {
        if (!this.blood) { // no gore: a comic burst of little stars
          for (let i = 0; i < Math.min(6, a / 2); i++) this.bb(this.gs, x, y, z, rand(-2, 2), rand(1, 3), rand(-2, 2), rand(0.12, 0.2), rand(0.25, 0.45), '#fff3b0', { tile: T_STAR, g: 4, drag: 2, vr: rand(-6, 6), shrink: true });
          this.bb(this.ss, x, y, z, 0, 0.3, 0, 0.35, 0.3, '#ffffff', { tile: T_PUFF, grow: 1.5, alpha: 0.5 });
          break;
        }
        for (let i = 0; i < a; i++) {
          this.chunk(x, y, z, b * rand(1, 4) + rand(-1.5, 1.5), rand(0.5, 4.5), c * rand(1, 4) + rand(-1.5, 1.5), rand(0.025, 0.07), rand(0.5, 1.2), i % 3 ? '#c41414' : '#8a0b0b');
        }
        this.bb(this.ss, x, y, z, b * 0.6, 0.3, c * 0.6, rand(0.25, 0.4), rand(0.25, 0.4), '#b01010', { tile: T_PUFF, grow: 2, alpha: 0.55, drag: 4 });
        if (Math.random() < 0.7) this.splat(x + b * rand(0.3, 1.2), z + c * rand(0.3, 1.2), rand(0.15, 0.4));
        break;
      }
      case 'spark':
        for (let i = 0; i < a * 1.5; i++) this.bb(this.gs, x, y, z, rand(-5, 5), rand(0, 6), rand(-5, 5), rand(0.05, 0.1), rand(0.15, 0.35), i % 2 ? '#ffe9a0' : '#ffb040', { tile: T_FLAME, g: 9.81, drag: 1.5, shrink: true });
        this.bb(this.gs, x, y, z, 0, 0, 0, 0.55, 0.12, '#fff6d0', { tile: T_STAR, rot: rand(0, 1), shrink: true });
        break;
      case 'dust':
        this.dust(x, y, z, Math.ceil(a * 2), 0.4, 0.25, 1);
        for (let i = 0; i < a * 2; i++) this.chunk(x, y + 0.1, z, rand(-2, 2), rand(1, 3), rand(-2, 2), rand(0.03, 0.06), rand(0.4, 0.8), Math.random() < 0.5 ? this.chunkCol : this.grassCol);
        break;
      case 'explode': this.explode(x, y, z, a, b); break;
      case 'heal':
        for (let i = 0; i < a; i++) {
          const plus = i % 2 === 0;
          this.bb(this.gs, x + rand(-0.35, 0.35), y + rand(-0.4, 0.3), z + rand(-0.35, 0.35), rand(-0.2, 0.2), rand(0.8, 1.8), rand(-0.2, 0.2),
            plus ? rand(0.14, 0.2) : rand(0.1, 0.16), rand(0.7, 1.1), plus ? '#7dff8a' : '#e8ffd0', { tile: plus ? T_PLUS : T_STAR, drag: 1, fadeIn: 0.2, vr: plus ? 0 : rand(-3, 3), rot: plus ? 0 : rand(0, 6) });
        }
        break;
      case 'healring': {
        this.ring(x, y + 0.05, z, a, 0.8, '#7dff8a');
        for (let i = 0; i < 18; i++) {
          const t = (i / 18) * 6.28, rr = a * rand(0.3, 1);
          const gx = x + Math.cos(t) * rr, gz = z + Math.sin(t) * rr;
          this.bb(this.gs, gx, this.terrain.height(gx, gz) + 0.1, gz, 0, rand(1, 2.2), 0, rand(0.08, 0.14), rand(0.6, 1), '#b8ffb0', { tile: T_STAR, fadeIn: 0.3, vr: 2 });
        }
        break;
      }
      case 'note': {
        const cols = ['#ffd84a', '#ff7ad9', '#6ad0ff', '#ffffff'];
        this.bb(this.ss, x, y, z, rand(-0.4, 0.4), 1.0, rand(-0.4, 0.4), 0.3, 1.4, cols[a | 0] || '#ffffff', { tile: Math.random() < 0.5 ? T_NOTE : T_NOTE2, drag: 0.6, wob: 1.2, rot: rand(-0.3, 0.3), fadeIn: 0.15 });
        break;
      }
      case 'death': {
        // a soft poof, a little dust where they drop and a team-coloured spark
        for (let i = 0; i < 9; i++) {
          const t = (i / 9) * 6.28;
          this.bb(this.ss, x, y, z, Math.cos(t) * 1.4, rand(0.3, 1.2), Math.sin(t) * 1.4, rand(0.3, 0.45), rand(0.5, 0.8), '#f4f4f4', { tile: T_SMOKE, grow: 1.4, alpha: 0.85, drag: 3.5, vr: rand(-1, 1) });
        }
        const tc = a ? '#ff8a7a' : '#8ab4ff';
        for (let i = 0; i < 3; i++) this.bb(this.gs, x, y + 0.2, z, rand(-0.5, 0.5), rand(1.5, 2.5), rand(-0.5, 0.5), rand(0.16, 0.24), rand(0.6, 0.9), tc, { tile: T_STAR, drag: 1.5, vr: rand(-4, 4), shrink: true });
        this.dust(x, this.terrain.height(x, z), z, 4, 0.45, 0.4, 0.6);
        break;
      }
      case 'trail': // fireball trail: flame + a wisp of smoke
        this.bb(this.gs, x, y, z, rand(-0.3, 0.3), rand(0, 0.6), rand(-0.3, 0.3), rand(0.25, 0.45), rand(0.2, 0.35), a ? '#ffcc44' : '#ff6a1a', { tile: T_FLAME, drag: 2, shrink: true });
        if (Math.random() < 0.5) this.bb(this.ss, x, y, z, 0, 0.6, 0, 0.25, rand(0.6, 0.9), '#5a5550', { tile: T_SMOKE, grow: 2, alpha: 0.45, fadeIn: 0.2 });
        break;
      case 'atrail': // arrow / spear streak
        this.bb(this.ss, x, y, z, 0, 0, 0, a || 0.12, 0.25, '#ffffff', { tile: T_PUFF, alpha: 0.35, grow: -0.5 });
        break;
      case 'ptrail': // potion fizz
        this.bb(this.gs, x, y, z, rand(-0.3, 0.3), rand(0.2, 0.8), rand(-0.3, 0.3), rand(0.06, 0.12), rand(0.3, 0.5), '#9cff6a', { tile: T_STAR, drag: 1, shrink: true, vr: 4 });
        break;
      case 'fuse': // bomb fuse sparks
        this.bb(this.gs, x, y, z, rand(-1, 1), rand(0.5, 2), rand(-1, 1), rand(0.04, 0.08), rand(0.1, 0.25), '#ffd040', { tile: T_FLAME, g: 6, drag: 1, shrink: true });
        break;
    }
  }

  explode(x, y, z, r, kind) { // kind: 0 bomb, 1 potion, 2 fire
    const k = r / 3;
    const potion = kind === 1;
    const gy = this.terrain.height(x, z);
    const hot = potion ? ['#d8ff9a', '#7be05a', '#3fae3a'] : ['#fff2b0', '#ffa020', '#ff5010'];
    // flash
    this.bb(this.gs, x, y + 0.3, z, 0, 0, 0, r * 1.5, 0.16, potion ? '#d8ffc0' : '#fff4d0', { tile: T_PUFF, shrink: true });
    // fireball: expanding hot blobs
    for (let i = 0; i < 22; i++) {
      _v.set(rand(-1, 1), rand(-0.1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.5, 6) * k);
      this.bb(i % 3 ? this.ss : this.gs, x + _v.x * 0.1, y + 0.3 + _v.y * 0.1, z + _v.z * 0.1, _v.x, _v.y + 1, _v.z, rand(0.55, 0.95) * k, rand(0.3, 0.55), hot[i % 3], { tile: i % 3 ? T_SMOKE : T_FLAME, drag: 3.5, grow: 1.1, vr: rand(-2, 2), g: -1.5, fadeIn: 0.02 });
    }
    // sparks
    for (let i = 0; i < 26; i++) {
      _v.set(rand(-1, 1), rand(0.1, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(6, 14) * Math.sqrt(k));
      this.bb(this.gs, x, y + 0.3, z, _v.x, _v.y, _v.z, rand(0.06, 0.12), rand(0.3, 0.7), hot[0], { tile: T_FLAME, g: 9.81, drag: 1.2, shrink: true });
    }
    // smoke column
    for (let i = 0; i < 16; i++) {
      const sh = potion ? rand(0.55, 0.75) : rand(0.25, 0.5);
      const col = potion ? _c.setRGB(sh * 0.7, sh, sh * 0.6) : _c.setRGB(sh, sh * 0.97, sh * 0.94);
      this.bb(this.ss, x + rand(-0.6, 0.6) * k, y + rand(0.2, 1.2) * k, z + rand(-0.6, 0.6) * k, rand(-1.5, 1.5) * k, rand(1.2, 3.2), rand(-1.5, 1.5) * k,
        rand(0.6, 1.0) * k, rand(1.6, 2.8), col, { tile: T_SMOKE, grow: 2.2, alpha: potion ? 0.6 : 0.8, drag: 1.4, fadeIn: 0.12, vr: rand(-0.6, 0.6) });
    }
    // dust skirt along the ground
    for (let i = 0; i < 14; i++) {
      const t = (i / 14) * 6.28;
      this.bb(this.ss, x + Math.cos(t) * 0.5, gy + 0.2, z + Math.sin(t) * 0.5, Math.cos(t) * 7 * k, rand(0.2, 0.8), Math.sin(t) * 7 * k, rand(0.5, 0.8) * k, rand(0.7, 1.1), this.dustCol, { tile: T_DUST, grow: 1.8, alpha: 0.7, drag: 3 });
    }
    // debris
    for (let i = 0; i < 18; i++) {
      this.chunk(x, y + 0.2, z, rand(-6, 6) * k, rand(4, 10) * Math.sqrt(k), rand(-6, 6) * k, rand(0.05, 0.13) * Math.sqrt(k), rand(1, 1.8), i % 3 === 0 ? this.grassCol : i % 3 === 1 ? this.chunkCol : '#4a3c30', 9.81, 0.2);
    }
    if (potion) for (let i = 0; i < 14; i++) this.bb(this.gs, x + rand(-1, 1) * k, gy + 0.2, z + rand(-1, 1) * k, 0, rand(0.6, 1.6), 0, rand(0.08, 0.16), rand(0.8, 1.5), '#a8ff7a', { tile: T_PUFF, fadeIn: 0.3, wob: 0.6 });
    this.ring(x, gy + 0.12, z, r * 1.4, 0.4, potion ? '#b0ff90' : '#ffe2a0');
    this.ring(x, gy + 0.1, z, r * 0.9, 0.6, potion ? '#5aa04a' : '#ff9a4a');
    this.light.position.set(x, y + 1.5, z);
    this.light.color.set(potion ? '#7dff6a' : '#ffaa44');
    this.light.distance = 10 + r * 3;
    this.lightT = 0.22;
    this.splat(x, z, r * 0.3, potion ? '#4a6a2a' : '#2e2a22');
  }

  splat(x, z, r, color) {
    const i = this.splatI++ % MAX_SPLAT;
    const y = this.terrain.height(x, z) + 0.03;
    _q.setFromAxisAngle(_p.set(0, 1, 0), rand(0, 6.28));
    _m.compose(_s.set(x, y, z), _q, _v.set(r * rand(0.9, 1.3), 1, r));
    this.splats.setMatrixAt(i, _m);
    this.splats.setColorAt(i, _c.set(color || (Math.random() < 0.5 ? '#9c1010' : '#7a0c0c')));
    this.splats.count = Math.min(MAX_SPLAT, Math.max(this.splats.count, i + 1));
    this.splats.instanceMatrix.needsUpdate = true;
    this.splats.instanceColor.needsUpdate = true;
  }

  ring(x, y, z, r, life, color) {
    const R = this.rings[this.ringI++ % NRING];
    R.m.position.set(x, y, z);
    R.m.material.color.set(color);
    R.m.visible = true;
    R.r = r; R.life = life; R.max = life;
  }

  // ---- unit-driven dust: footfalls while running, and thumps when a body lands
  trackUnits(dt) {
    const T = this.terrain;
    for (const vis of LIVE_VIS) {
      const root = vis.root;
      if (root.parent !== this.scene || !root.visible) { if (!root.parent) LIVE_VIS.delete(vis); continue; }
      const P = vis.parts;
      const pel = P[0].position, head = P[2].position;
      let st = vis._fx;
      if (!st) { st = vis._fx = { x: pel.x, y: pel.y, z: pel.z, hy: head.y, vy: 0, hvy: 0, cd: 0, stride: 0 }; continue; }
      const dx = pel.x - st.x, dy = pel.y - st.y, dz = pel.z - st.z;
      const hdy = head.y - st.hy;
      st.x = pel.x; st.y = pel.y; st.z = pel.z; st.hy = head.y;
      if (dx * dx + dy * dy + dz * dz > 9) { st.vy = 0; st.hvy = 0; continue; } // teleport / replay seek
      const vy = dy / dt, hvy = hdy / dt, hs = Math.hypot(dx, dz) / dt;
      const s = vis.skel.scale;
      st.cd -= dt;
      const gyP = T.height(pel.x, pel.z), gyH = T.height(head.x, head.z);
      // landing: a part that was falling fast is suddenly stopped near the ground
      const landP = st.vy < -3 && vy > st.vy * 0.4 && pel.y - gyP < vis.skel.standHeight * 0.75;
      const landH = st.hvy < -3.5 && hvy > st.hvy * 0.4 && head.y - gyH < vis.skel.rHead * 1.8;
      if ((landP || landH) && st.cd <= 0) {
        const imp = Math.min(3, -(landP ? st.vy : st.hvy) / 4);
        const px = landH && !landP ? head.x : pel.x, pz = landH && !landP ? head.z : pel.z;
        this.dust(px, T.height(px, pz), pz, Math.ceil(3 + imp * 3 * Math.min(2.5, s)), 0.3 * Math.sqrt(s) + 0.1 * imp, 0.25 * s, 0.8);
        st.cd = 0.35;
      }
      st.vy = vy; st.hvy = hvy;
      // running: a small puff every stride from the lowest foot
      if (hs > 2.6 && pel.y - gyP < vis.skel.standHeight * 1.25) {
        st.stride += hs * dt;
        const L = 0.95 * s;
        if (st.stride > L) {
          st.stride -= L;
          const sl = P[4], sr = P[6];
          const foot = sl.position.y < sr.position.y ? sl : sr;
          _v.set(0, -vis.skel.parts[4].hh, 0).applyQuaternion(foot.quaternion).add(foot.position);
          const gy = T.height(_v.x, _v.z);
          if (_v.y - gy < 0.3 * s) {
            const n = s > 1.6 ? 5 : Math.random() < 0.6 ? 1 : 2;
            this.dust(_v.x, gy, _v.z, n, s > 1.6 ? 0.55 : 0.2 + 0.03 * hs, 0.1 * s, 0.5);
          }
        }
      } else st.stride = 0;
    }
  }

  update(dt) {
    if (dt > 0) this.trackUnits(Math.min(dt, 0.1));
    this.stepSolid(dt);
    this.stepBB(this.ss, this.soft, dt);
    this.stepBB(this.gs, this.glow, dt);
    for (const R of this.rings) {
      if (R.life <= 0) continue;
      R.life -= dt;
      const t = 1 - R.life / R.max;
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      R.m.scale.setScalar(Math.max(0.01, R.r * (0.15 + e * 0.9)));
      R.m.material.opacity = clamp(1 - t, 0, 1) * 0.65;
      if (R.life <= 0) R.m.visible = false;
    }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT / 0.22) * 120; }
    else this.light.intensity = 0;
  }

  stepSolid(dt) {
    const list = this.ps, mesh = this.solid;
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
      p.vy -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.vr * dt;
      const gy = this.terrain.height(p.x, p.z);
      if (p.y < gy + p.size * 0.5) { p.y = gy + p.size * 0.5; p.vy *= -p.bounce; p.vx *= 0.5; p.vz *= 0.5; p.vr *= 0.5; }
    }
    for (let i = 0; i < list.length && n < MAX_SOLID; i++) {
      const p = list[i];
      const s = p.size * Math.min(1, (p.life / p.max) * 4);
      _q.setFromEuler(_e.set(p.rx, p.rx * 1.3, 0));
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
      mesh.setMatrixAt(n, _m);
      mesh.setColorAt(n, p.c);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  stepBB(list, mesh, dt) {
    const data = mesh.userData.data.array;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
      p.vy -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.wob) p.x += Math.sin(p.life * 7 + p.ph) * p.wob * dt;
      p.rot += p.vr * dt;
      if (p.ground) { const gy = this.terrain.height(p.x, p.z); if (p.y < gy + p.size * 0.3) { p.y = gy + p.size * 0.3; p.vy = Math.abs(p.vy) * 0.2; } }
    }
    let n = 0;
    const max = mesh.instanceMatrix.count;
    for (let i = 0; i < list.length && n < max; i++) {
      const p = list[i];
      const t = 1 - p.life / p.max;
      let s = p.size * (1 + p.grow * t);
      let a = p.a * Math.min(1, t / Math.max(1e-3, p.fadeIn));
      if (p.shrink) s *= Math.min(1, (1 - t) * 2.5);
      else a *= Math.min(1, (1 - t) * 2.2);
      _m.makeScale(s, s, s);
      _m.setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(n, _m);
      mesh.setColorAt(n, p.c);
      data[n * 3] = a; data[n * 3 + 1] = p.tile; data[n * 3 + 2] = p.rot;
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.userData.data.needsUpdate = true;
  }
}
