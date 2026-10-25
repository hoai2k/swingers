// Water surfaces: one shader for the sea (which also fills the lake) and for
// boxed water (pool, fountain). Two scrolling normal-map layers make the
// ripples; colour runs from bright turquoise in the shallows to deep blue,
// with sky reflection (fresnel), a sun glint and animated foam where the
// water meets the shore or a pool wall. The sea knows its depth from a small
// texture baked from the analytic terrain height, so no depth pre-pass is
// needed and it stays cheap in every split-screen view.
import * as THREE from 'three';
import { SEA_LEVEL } from '../config.js';
import { terrainGrids, REGIONS, WORLD, SEA_FLOOR } from '../terrain.js';

let normalTex = null;
function waveNormals() {
  if (normalTex) return normalTex;
  const N = 256, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N);
  const waves = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) waves.push([((rnd() * 9) | 0) - 4, ((rnd() * 9) | 0) - 4, rnd() * 6.28, 0.3 + rnd()]);
  const h = (x, y) => {
    let s = 0;
    for (const [a, b, p, amp] of waves) s += Math.sin(2 * Math.PI * (a * x + b * y) / N + p) * amp / (1 + Math.hypot(a, b) * 0.3);
    return s;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const nx = -dx * 0.6, ny = -dy * 0.6, nz = 1, l = Math.hypot(nx, ny, nz);
    const k = (y * N + x) * 4;
    img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  normalTex = new THREE.CanvasTexture(cv);
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  return normalTex;
}

// Sea depth below SEA_LEVEL over the whole archipelago (WORLD, square around
// the origin), encoded (depth + 2) / 14 in a byte, read from the terrain mesh.
const DEPTH_EXT = WORLD.x1, DEPTH_N = 2048;
let depthTex = null;
function seaDepthTexture() {
  if (depthTex) return depthTex;
  const N = DEPTH_N, data = new Uint8Array(N * N), texel = 2 * DEPTH_EXT / N;
  const enc = (d) => Math.max(0, Math.min(255, Math.round((d + 2) / 14 * 255)));
  data.fill(enc(SEA_LEVEL - SEA_FLOOR));
  const pits = REGIONS.flatMap((r) => r.pits || []);
  // only texels over a terrain grid differ from the open sea: sample those grids directly
  for (const g of terrainGrids) {
    const i0 = Math.max(0, Math.ceil((g.x0 + DEPTH_EXT) / texel - 0.5)), i1 = Math.min(N - 1, Math.floor((g.x1 + DEPTH_EXT) / texel - 0.5));
    const j0 = Math.max(0, Math.ceil((g.z0 + DEPTH_EXT) / texel - 0.5)), j1 = Math.min(N - 1, Math.floor((g.z1 + DEPTH_EXT) / texel - 0.5));
    const { pos, nx, nz, step } = g;
    for (let j = j0; j <= j1; j++) {
      const z = -DEPTH_EXT + (j + 0.5) * texel, gz = (z - g.z0) / step;
      const jj = Math.max(0, Math.min(nz - 2, Math.floor(gz))), fz = gz - jj;
      for (let i = i0; i <= i1; i++) {
        const x = -DEPTH_EXT + (i + 0.5) * texel, gx = (x - g.x0) / step;
        const ii = Math.max(0, Math.min(nx - 2, Math.floor(gx))), fx = gx - ii;
        const k = (jj * nx + ii) * 3 + 1;
        const a = pos[k], b = pos[k + 3], d = pos[k + nx * 3];
        const h = fx + fz <= 1 ? a + (b - a) * fx + (d - a) * fz : pos[k + nx * 3 + 3] + (d - pos[k + nx * 3 + 3]) * (1 - fx) + (b - pos[k + nx * 3 + 3]) * (1 - fz);
        data[j * N + i] = enc(SEA_LEVEL - h);
      }
    }
  }
  for (const p of pits) { // inside a pit: no sea surface (the pool has its own water)
    for (let j = Math.max(0, Math.floor((p[2] - 3 + DEPTH_EXT) / texel)); j <= Math.min(N - 1, Math.ceil((p[3] + 3 + DEPTH_EXT) / texel)); j++)
      for (let i = Math.max(0, Math.floor((p[0] - 3 + DEPTH_EXT) / texel)); i <= Math.min(N - 1, Math.ceil((p[1] + 3 + DEPTH_EXT) / texel)); i++) {
        const x = -DEPTH_EXT + (i + 0.5) * texel, z = -DEPTH_EXT + (j + 0.5) * texel;
        if (x >= p[0] - 3 && x <= p[1] + 3 && z >= p[2] - 3 && z <= p[3] + 3) data[j * N + i] = enc(-2);
      }
  }
  depthTex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;
  return depthTex;
}

// Shared by every water material; updated once a frame from the sky.
export const waterShared = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
  uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  uAmb: { value: new THREE.Color(0.8, 0.9, 1) },
  uSkyTop: { value: new THREE.Color(0x2f8cf5) },
  uHorizon: { value: new THREE.Color(0xbfe6ff) },
};

const vert = `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = `
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uSkyTop; uniform vec3 uHorizon;
uniform vec3 uShallow; uniform vec3 uDeep; uniform float uDeepAt; uniform float uOpacity; uniform float uScale;
uniform sampler2D uNormal; uniform sampler2D uDepthTex; uniform float uMode; uniform float uDepth; uniform vec4 uRect;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5), b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5),
        c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5), d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
void main() {
  vec2 wp = vWorld.xz;
  vec3 a = texture2D(uNormal, wp * uScale + uTime * vec2(0.021, 0.013)).xyz * 2.0 - 1.0;
  vec3 b = texture2D(uNormal, wp * uScale * 1.73 + uTime * vec2(-0.017, 0.022)).xyz * 2.0 - 1.0;
  vec2 slope = (a.xy + b.xy) * 0.5;
  vec3 N = normalize(vec3(slope.x * 0.55, 1.0, slope.y * 0.55));
  float depth, edge = 99.0;
  if (uMode > 0.5) {
    depth = texture2D(uDepthTex, (wp + ${DEPTH_EXT.toFixed(1)}) / ${(2 * DEPTH_EXT).toFixed(1)}).r * 14.0 - 2.0;
    if (depth < -0.35) discard;   // inside a pit (the pool has its own water)
  } else {
    depth = uDepth;
    edge = min(min(wp.x - uRect.x, uRect.y - wp.x), min(wp.y - uRect.z, uRect.w - wp.y));
  }
  vec3 V = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) N = -N;
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  float dk = smoothstep(0.0, uDeepAt, depth);
  vec3 base = mix(uShallow, uDeep, dk);
  vec3 lit = base * (uAmb * 0.75 + uSunCol * max(uSunDir.y, 0.0) * 0.35);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uSkyTop, clamp(R.y * 1.6, 0.0, 1.0));
  vec3 col = mix(lit, sky, fres * 0.55);
  float spec = pow(max(dot(R, uSunDir), 0.0), 240.0);
  col += uSunCol * spec * 2.5;
  // foam: a solid lip at the shore / walls plus soft bands rolling in
  float nz = n2(wp * 0.9 + uTime * 0.15) * 0.6 + n2(wp * 2.3 - uTime * 0.2) * 0.4;
  float foam;
  if (uMode > 0.5) {
    float lip = 1.0 - smoothstep(0.05, 0.32 + nz * 0.2, depth);
    float band = smoothstep(0.82, 0.97, sin(depth * 7.0 - uTime * 1.3 + nz * 2.5) * 0.5 + 0.5) * (1.0 - smoothstep(0.2, 1.4, depth));
    foam = max(lip, band * 0.8) * smoothstep(0.25, 0.5, nz + 0.15);
  } else {
    foam = (1.0 - smoothstep(0.0, 0.18 + nz * 0.12, edge)) * 0.75;
  }
  if (!gl_FrontFacing) { col = mix(uDeep * uAmb, uHorizon, 0.25 + 0.5 * pow(ndv, 2.0)); foam = 0.0; }
  col = mix(col, uAmb * 1.05 + uSunCol * 0.2, foam);
  float alpha = mix(uOpacity * 0.6, min(1.0, uOpacity + 0.12), smoothstep(0.0, uDeepAt * 0.7, depth));
  alpha = max(alpha, foam);
  alpha = mix(alpha, 1.0, fres * 0.5);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function makeMaterial(opts) {
  const u = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  Object.assign(u, {
    uShallow: { value: new THREE.Color(opts.shallow) }, uDeep: { value: new THREE.Color(opts.deep) },
    uDeepAt: { value: opts.deepAt }, uOpacity: { value: opts.opacity }, uScale: { value: opts.scale },
    uNormal: { value: waveNormals() }, uDepthTex: { value: opts.mode ? seaDepthTexture() : null },
    uMode: { value: opts.mode }, uDepth: { value: opts.depth || 2 }, uRect: { value: new THREE.Vector4(...(opts.rect || [0, 0, 0, 0])) },
  });
  Object.assign(u, waterShared);
  const m = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: vert, fragmentShader: frag, fog: true,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return m;
}

// Kept for callers that want a generic water material (colour, opacity, normal-map repeats per 100 m).
export function waterMaterial(color, opacity, repeat) {
  const c = new THREE.Color(color);
  return makeMaterial({ shallow: c.clone().lerp(new THREE.Color(0xffffff), 0.25), deep: c.clone().multiplyScalar(0.6), deepAt: 2.5, opacity, scale: repeat / 100, mode: 0, depth: 2, rect: [-1e5, 1e5, -1e5, 1e5] });
}

export function seaMaterial() {
  return makeMaterial({ shallow: 0x2fd2dc, deep: 0x0a62c4, deepAt: 4.5, opacity: 0.86, scale: 0.09, mode: 1 });
}

export function animateWater(game) {
  game.updaters.push((dt) => {
    const sky = game.skyRig;
    waterShared.uTime.value += dt;
    if (!sky) return;
    waterShared.uSunDir.value.copy(sky.sunDir);
    waterShared.uSunCol.value.copy(sky.sun.color).multiplyScalar(sky.sun.intensity / 2.4);
    waterShared.uAmb.value.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity / 1.2);
    waterShared.uSkyTop.value.copy(sky.u.top.value);
    waterShared.uHorizon.value.copy(sky.u.horizon.value);
  });
}

// A rectangular body of water (pool, fountain) with physics volume.
export function addWater(game, x0, x1, z0, z1, floorY, level, color = 0x4fd0ff, opacity = 0.7) {
  game.physics.addWaterBox(x0, x1, z0, z1, floorY, level);
  const c = new THREE.Color(color);
  const mat = makeMaterial({
    shallow: c.clone().lerp(new THREE.Color(0xc8fbff), 0.35), deep: c.clone().lerp(new THREE.Color(0x0a5ed0), 0.55),
    deepAt: 3.2, opacity: Math.max(opacity, 0.6), scale: 0.16, mode: 0, depth: level - floorY, rect: [x0, x1, z0, z1],
  });
  game.waterMats.push(mat);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat);
  m.position.set((x0 + x1) / 2, level, (z0 + z1) / 2);
  m.renderOrder = 1;
  game.scene.add(m);
  return m;
}
