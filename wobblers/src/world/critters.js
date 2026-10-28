// Animals (world/sealife.js, regions/jungle/animals.js): every species is ONE InstancedMesh
// (one draw call however many are about) whose legs, tail, head, fins / wings, jaw and
// tentacles are animated in the vertex shader, so moving a creature costs one matrix and two
// floats a frame. Nothing here has physics: animals are scenery you can't bump into.
//
// Build a species from rig parts: rig([{ part, pivot: [x, y, z], build: (b) => b.sphere(...) }])
// (Builder primitives, model facing +z, feet at y = 0). Parts and what the shader does to them:
//   BODY 0 (still)  LEGS 1-4 (front-left, front-right, back-left, back-right: swing about x,
//   diagonal pairs together)  TAIL 5 (sways about y)  HEAD 6 (bobs)  WING_L 7 / WING_R 8 (flap
//   about z)  JAW 9 (opens about x)  TENTACLE 10+i (wave, more toward the tip below the pivot).
// Each instance carries a phase (advance it with time, faster = quicker gait) and an amount
// (0 = standing still). Whole-body modes (opts.mode): 'swim' (side-to-side tail wave, fish /
// sharks), 'swimv' (up-and-down, dolphins / whales), 'slither' (snakes), 'pulse' (jellyfish).
import * as THREE from 'three';
import { Builder } from '../mesh.js';

export { BODY, FL, FR, BL, BR, TAIL, HEAD, WING_L, WING_R, JAW, TENT } from './rigparts.js';

export function rig(parts) {
  const geos = [];
  for (const p of parts) {
    const b = new Builder();
    p.build(b);
    const g = b.geometry();
    if (!g) continue;
    const n = g.attributes.position.count, a = new Float32Array(n * 4);
    const [x, y, z] = p.pivot || [0, 0, 0];
    for (let i = 0; i < n; i++) a.set([p.part || 0, x, y, z], i * 4);
    g.setAttribute('aRig', new THREE.BufferAttribute(a, 4));
    g.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1)); // moves fully with its part
    if (g.attributes.glow) g.deleteAttribute('glow');
    geos.push(g);
  }
  const b = new Builder(); // reuse its merge
  b.parts = geos;
  return b.geometry();
}

const GLSL_HEAD = `
attribute vec4 aRig;
attribute float aW;
attribute vec2 aAnim;
mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
mat3 rigRot() {
  float part = aRig.x, ph = aAnim.x, amp = aAnim.y;
  if (part > 0.5 && part < 4.5) { float off = (part < 1.5 || part > 3.5) ? 0. : 3.14159; return rX(sin(ph + off) * amp * LEG); }
  if (part > 4.5 && part < 5.5) return rY(sin(ph * 0.5) * TAILA * (0.35 + amp));
  if (part > 5.5 && part < 6.5) return rX(sin(ph * 2.) * 0.07 * amp);
  if (part > 6.5 && part < 7.5) return rZ(sin(ph) * FLAP);
  if (part > 7.5 && part < 8.5) return rZ(-sin(ph) * FLAP);
  if (part > 8.5 && part < 9.5) return rX(max(0., sin(ph * 0.37)) * JAWA);
  return mat3(1.);
}
`;

const BODY_MODES = {
  swim: 'transformed.x += sin(aAnim.x - transformed.z * WAVEK) * aAnim.y * WAVEA * pow(clamp((TAILZ * 0.5 - transformed.z) / TAILZ, 0., 1.), 2.);',
  swimv: 'transformed.y += sin(aAnim.x - transformed.z * WAVEK) * aAnim.y * WAVEA * pow(clamp((TAILZ * 0.5 - transformed.z) / TAILZ, 0., 1.), 2.);',
  slither: 'transformed.x += sin(aAnim.x + transformed.z * WAVEK) * aAnim.y * WAVEA;', // waves run head to tail (phase = distance x WAVEK: still on the ground)
  pulse: 'if (aRig.x < 0.5) { float k = sin(aAnim.x); transformed.xz *= 1. + k * 0.14 * aAnim.y; transformed.y *= 1. - k * 0.1 * aAnim.y; }',
};

export class Species {
  // opts: max, name, mode, tint (instances get their own colour), shadow, k: shader constants
  // { LEG, TAILA, FLAP, JAWA, WAVEK, WAVEA, TAILZ, TENTW, TENTA, TENTK, TENTS } (TAILZ: nose-to-tail
  // length, nose at z = TAILZ / 2: the wave grows toward the tail; TENTW 1: tentacles wiggle in
  // travelling waves (octopus arms) instead of swaying)
  // geo: a BufferGeometry, or a Promise of one (animalgeo.js): until it arrives the species
  // draws nothing and put() is ignored
  constructor(game, geo, opts = {}) {
    const max = opts.max || 32;
    const k = { LEG: 0.7, TAILA: 0.35, FLAP: 0.6, JAWA: 0.5, WAVEK: 2, WAVEA: 0.15, TAILZ: 1, TENTW: 0, TENTA: 0.4, TENTK: 9, TENTS: 1, ...(opts.k || {}) };
    this.anim = new Float32Array(max * 2);
    this.animAttr = new THREE.InstancedBufferAttribute(this.anim, 2);
    this.animAttr.setUsage(THREE.DynamicDrawUsage);
    this.animFar = new Float32Array(max * 2);
    this.animFarAttr = new THREE.InstancedBufferAttribute(this.animFar, 2);
    this.animFarAttr.setUsage(THREE.DynamicDrawUsage);
    const attach = (g) => { g.setAttribute('aAnim', this.animAttr); return g; };
    this.ready = !(geo instanceof Promise);
    this.game = game; this.lodOn = opts.lod !== false;
    const g = this.ready ? attach(geo.clone()) : new THREE.BufferGeometry();
    if (!this.ready) geo.then((real) => { this.mesh.geometry.dispose(); this.mesh.geometry = attach(real); this.useProj(real.userData.proj); this.makeLod(real); this.ready = true; }).catch((e) => console.warn('animal model', opts.name, e));
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 28, specular: 0x262626, ...(opts.material || {}) });
    const consts = Object.entries(k).map(([n, v]) => `#define ${n} ${Number(v).toFixed(4)}`).join('\n');
    const mode = BODY_MODES[opts.mode] || '';
    // painted by projection (models built from a reference sheet): the side view on z / y, the
    // top view on z / x, blended by how much the surface faces up (object space, before the rig)
    const PU = this.projU = { uSide: { value: null }, uTop: { value: null }, uSideBox: { value: new THREE.Vector4() }, uTopBox: { value: new THREE.Vector4() } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, PU);
      if (mat.defines?.USE_PROJ) {
        // (USE_PAINT: limbs posed away from where the sheet draws them carry their sheet position)
        // (WING_TOP: wings and flippers (WING_L / WING_R) take the top view all over: seen from below
        // or edge-on too, it is the only picture of them; SIDE_ONLY: the side view alone, for
        // animals the sheet draws in another orientation than the model's)
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vObjN; varying float vWing;\n#ifdef USE_PAINT\nattribute vec3 aPaint;\n#endif')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_PAINT\nvObjP = aPaint;\n#else\nvObjP = position;\n#endif\nvObjN = normal; vWing = (aRig.x > 6.5 && aRig.x < 8.5) ? 1. : 0.;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vObjP; varying vec3 vObjN; varying float vWing;
uniform sampler2D uSide; uniform sampler2D uTop; uniform vec4 uSideBox; uniform vec4 uTopBox;`)
          .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 su = vec2((vObjP.z - uSideBox.x) / (uSideBox.y - uSideBox.x), (vObjP.y - uSideBox.z) / (uSideBox.w - uSideBox.z));
  vec2 tu = vec2((vObjP.z - uTopBox.x) / (uTopBox.y - uTopBox.x), (vObjP.x - uTopBox.w) / (uTopBox.z - uTopBox.w));
  vec3 n = normalize(vObjN);
  float wt = smoothstep(0.3, 0.8, n.y);
#ifdef WING_TOP
  wt = mix(wt, 1., vWing);
#endif
#ifdef SIDE_ONLY
  wt = 0.;
#endif
  vec3 c = mix(texture2D(uSide, su).rgb, texture2D(uTop, tu).rgb, wt);
  diffuseColor.rgb *= c * 1.05;
}`).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.22; // the paint already has its own shading: lift the shadow side');
      }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${consts}\n${GLSL_HEAD}`)
        .replace('#include <beginnormal_vertex>', 'mat3 rigR = rigRot();\nvec3 objectNormal = normalize(mix(vec3(normal), rigR * vec3(normal), aW));')
        .replace('#include <begin_vertex>', `vec3 transformed = mix(vec3(position), rigR * (vec3(position) - aRig.yzw) + aRig.yzw, aW);
if (aRig.x > 9.5) { float d = length(position - aRig.yzw); float i = aRig.x - 10.;
  if (TENTW > 0.5) {
    // arms: waves running out along each arm, sideways to it and growing toward the tip, plus a
    // slow lift and curl (TENTA: bend per metre out, TENTK: waves per metre, TENTS: speed)
    vec2 dir = position.xz - aRig.yw; float l = length(dir); dir = l > 1e-4 ? dir / l : vec2(0., 1.);
    float ph = aAnim.x * TENTS + i * 1.9, a = TENTA * d * (0.35 + aAnim.y) * aW;
    float w = sin(ph - d * TENTK) + 0.45 * sin(ph * 1.7 + 1.3 - d * TENTK * 1.9);
    transformed.xz += vec2(-dir.y, dir.x) * w * a;
    transformed.y += (0.55 + 0.45 * sin(ph * 0.6 + i * 2.3 - d * TENTK * 0.5)) * a * 0.9;
  } else
  transformed.xz += vec2(sin(aAnim.x * 0.8 + i * 1.7 + d * 2.5), cos(aAnim.x * 0.7 + i * 1.3 + d * 2.)) * 0.16 * d * (0.3 + aAnim.y) * aW; }
${mode}`);
    };
    mat.customProgramCacheKey = () => 'critter:' + (opts.name || '') + consts + (opts.mode || '') + (mat.defines?.USE_PROJ ? ':proj' : '') + (mat.defines?.USE_PAINT ? ':paint' : '') + (mat.defines?.WING_TOP ? ':wt' : '') + (mat.defines?.SIDE_ONLY ? ':so' : '');
    const mesh = this.mesh = new THREE.InstancedMesh(g, mat, max);
    mesh.name = 'critters_' + (opts.name || 'x');
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // they move about; counts are small and only near cameras
    mesh.castShadow = !!opts.shadow; mesh.receiveShadow = true;
    mesh.userData.noCull = true;
    mesh.count = 0;
    if (opts.tint) { mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    game.scene.add(mesh);
    this.max = max; this.n = 0; this.nFar = 0; this.far = null; this.tint = !!opts.tint;
    if (this.ready) this.makeLod(geo);
  }
  // The far version (see lodGeometry): its own InstancedMesh with the same material, a child of the
  // near one so whatever shows / hides `mesh` (view hooks, wildlife) does the far one too. An animal
  // switches to it beyond lodD = max(LOD_MIN, LOD_K x its radius x scale) from the nearest camera.
  makeLod(src) {
    if (!this.lodOn || !src.index) return;
    const lg = lodGeometry(src, LOD_RATIO);
    if (lg === src) return;
    lg.setAttribute('aAnim', this.animFarAttr);
    const m = this.mesh, far = this.far = new THREE.InstancedMesh(lg, m.material, this.max);
    far.name = m.name + '_far';
    far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    far.frustumCulled = false; far.castShadow = m.castShadow; far.receiveShadow = true; far.userData.noCull = true; far.count = 0;
    if (this.tint) { far.setColorAt(0, new THREE.Color(1, 1, 1)); far.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    m.add(far);
    src.computeBoundingSphere();
    this.lodR = src.boundingSphere.radius;
  }
  useProj(p) {
    if (!p?.side || !p?.top) return;
    const U = this.projU;
    U.uSide.value = p.side; U.uTop.value = p.top;
    U.uSideBox.value.set(...p.sideBox); U.uTopBox.value.set(...p.topBox);
    this.mesh.material.defines = { ...(this.mesh.material.defines || {}), USE_PROJ: 1, ...(p.paint ? { USE_PAINT: 1 } : {}), ...(p.wingTop ? { WING_TOP: 1 } : {}), ...(p.sideOnly ? { SIDE_ONLY: 1 } : {}) };
    this.mesh.material.needsUpdate = true;
  }
  begin() {
    this.n = 0; this.nNear = 0; this.nFar = 0;
    const c = this.cams ||= [];
    c.length = 0;
    if (this.far) { for (const p of this.game.players) if (p.camera?.cam) c.push(p.camera.cam.position); if (!c.length && this.game.idleCam) c.push(this.game.idleCam.position); }
  }
  // position, yaw (0 faces +z), pitch (nose up > 0), roll, uniform scale, anim phase / amount, colour
  put(x, y, z, yaw, pitch, roll, s, phase, amp, color) {
    if (this.n >= this.max || !this.ready) return;
    this.n++;
    let m = this.mesh, anim = this.anim, i;
    if (this.far) {                                            // far from every camera: the light version
      const d = Math.max(LOD_MIN, LOD_K * this.lodR * s), d2 = d * d;
      let far = true;
      for (const c of this.cams) if ((c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2 < d2) { far = false; break; }
      if (far) { m = this.far; anim = this.animFar; i = this.nFar++; } else i = this.nNear++;
    } else i = this.nNear++;
    _e.set(-pitch, yaw, roll, 'YXZ');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(s, s, s));
    m.setMatrixAt(i, _m);
    anim[i * 2] = phase; anim[i * 2 + 1] = amp;
    if (color !== undefined && m.instanceColor) m.setColorAt(i, _c.set(color));
  }
  end() {
    for (const [m, n, a] of [[this.mesh, this.nNear ?? this.n, this.animAttr], [this.far, this.nFar, this.animFarAttr]]) {
      if (!m) continue;
      m.count = n;
      if (!n) continue;
      m.instanceMatrix.needsUpdate = true;
      a.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// ---- level of detail ------------------------------------------------------------------------------
// Far away an animal is drawn from a lighter copy of its mesh made here when the model loads:
// vertex clustering on a grid sized to keep ~LOD_RATIO of the triangles. A cluster never joins
// two rig parts (legs, tail, wings keep animating apart) nor surfaces facing opposite ways (the
// normal's dominant axis and sign: thin wings, fins and ears stay two-sided). Each cluster becomes
// one vertex with its members' averaged attributes; triangles that collapse are dropped.
const LOD_RATIO = 0.25, LOD_MIN = 18, LOD_K = 30;
export function lodGeometry(g, ratio = LOD_RATIO, minTris = 400) {
  const idx = g.index.array, tris = idx.length / 3;
  if (tris * ratio < minTris) return g;
  const P = g.attributes.position.array, N = g.attributes.normal.array, rig = g.attributes.aRig?.array, n = P.length / 3;
  g.computeBoundingBox();
  const lo = g.boundingBox.min, sz = g.boundingBox.getSize(new THREE.Vector3()), diag = sz.length();
  const bucket = new Uint8Array(n), part = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = N[i * 3], y = N[i * 3 + 1], z = N[i * 3 + 2], ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    bucket[i] = ax >= ay && ax >= az ? (x > 0 ? 0 : 1) : ay >= az ? (y > 0 ? 2 : 3) : (z > 0 ? 4 : 5);
    part[i] = rig ? rig[i * 4] : 0;
  }
  const rep = new Int32Array(n);
  const cluster = (cell) => {
    const map = new Map(); let k = 0;
    for (let i = 0; i < n; i++) {
      const ix = Math.floor((P[i * 3] - lo.x) / cell), iy = Math.floor((P[i * 3 + 1] - lo.y) / cell), iz = Math.floor((P[i * 3 + 2] - lo.z) / cell);
      const key = ((part[i] * 6 + bucket[i]) * 1024 + ix) * 1048576 + iy * 1024 + iz;
      let c = map.get(key); if (c === undefined) { c = k++; map.set(key, c); }
      rep[i] = c;
    }
    let t = 0;
    for (let j = 0; j < tris; j++) { const a = rep[idx[j * 3]], b = rep[idx[j * 3 + 1]], c = rep[idx[j * 3 + 2]]; if (a !== b && b !== c && a !== c) t++; }
    return [k, t];
  };
  // the cell size that keeps ~ratio of the triangles (bisection on a log scale)
  let a = diag / 600, b = diag / 6, nc = 0, want = tris * ratio;
  for (let it = 0; it < 14; it++) { const m = Math.sqrt(a * b), [, t] = cluster(m); if (t > want) a = m; else b = m; }
  [nc] = cluster(b);
  const out = {}, cnt = new Float32Array(nc);
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (attr.isInstancedBufferAttribute) continue;
    const s = attr.itemSize, src = attr.array, dst = new Float32Array(nc * s);
    if (name === 'aRig') { for (let i = 0; i < n; i++) dst.set(src.subarray(i * s, i * s + s), rep[i] * s); }   // one part, one pivot per cluster
    else for (let i = 0; i < n; i++) for (let q = 0; q < s; q++) dst[rep[i] * s + q] += src[i * s + q];
    out[name] = [dst, s];
  }
  for (let i = 0; i < n; i++) cnt[rep[i]]++;
  for (const [name, [dst, s]] of Object.entries(out)) {
    if (name === 'aRig') continue;
    for (let c = 0; c < nc; c++) for (let q = 0; q < s; q++) dst[c * s + q] /= cnt[c];
    if (name === 'normal') for (let c = 0; c < nc; c++) { const l = Math.hypot(dst[c * 3], dst[c * 3 + 1], dst[c * 3 + 2]) || 1; dst[c * 3] /= l; dst[c * 3 + 1] /= l; dst[c * 3 + 2] /= l; }
  }
  const ix = [], seen = new Set();
  for (let j = 0; j < tris; j++) {
    const A = rep[idx[j * 3]], B = rep[idx[j * 3 + 1]], C = rep[idx[j * 3 + 2]];
    if (A === B || B === C || A === C) continue;
    const s0 = Math.min(A, B, C), s2 = Math.max(A, B, C), key = s0 * 4294967296 + (A + B + C - s0 - s2) * 65536 + s2;
    if (seen.has(key)) continue;
    seen.add(key); ix.push(A, B, C);
  }
  const lg = new THREE.BufferGeometry();
  for (const [name, [dst, s]] of Object.entries(out)) lg.setAttribute(name, new THREE.BufferAttribute(dst, s));
  lg.setIndex(nc > 65535 ? new THREE.Uint32BufferAttribute(ix, 1) : new THREE.Uint16BufferAttribute(ix, 1));
  lg.computeBoundingSphere();
  lg.userData = g.userData;
  return lg;
}

// Small deterministic hash -> 0..1 (cells and animals keep the same contents every visit)
export function hash(a, b = 0, c = 0) {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
export function rng(seed) {
  let s = (Math.floor(seed * 2147483646) % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
// The cameras of players in a given state: under(cam) tells a view hook whether that camera is
// under water (sea life is drawn only in those views).
export function cameraUnder(game, cam) {
  for (const p of game.players) if (p.camera?.cam === cam) return !!p.camera.underwater;
  return false;
}
