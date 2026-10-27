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
  slither: 'transformed.x += sin(aAnim.x - transformed.z * WAVEK) * aAnim.y * WAVEA;',
  pulse: 'if (aRig.x < 0.5) { float k = sin(aAnim.x); transformed.xz *= 1. + k * 0.14 * aAnim.y; transformed.y *= 1. - k * 0.1 * aAnim.y; }',
};

export class Species {
  // opts: max, name, mode, tint (instances get their own colour), shadow, k: shader constants
  // { LEG, TAILA, FLAP, JAWA, WAVEK, WAVEA, TAILZ } (TAILZ: nose-to-tail length, nose at z = TAILZ / 2: the wave grows toward the tail)
  // geo: a BufferGeometry, or a Promise of one (animalgeo.js): until it arrives the species
  // draws nothing and put() is ignored
  constructor(game, geo, opts = {}) {
    const max = opts.max || 32;
    const k = { LEG: 0.7, TAILA: 0.35, FLAP: 0.6, JAWA: 0.5, WAVEK: 2, WAVEA: 0.15, TAILZ: 1, ...(opts.k || {}) };
    this.anim = new Float32Array(max * 2);
    this.animAttr = new THREE.InstancedBufferAttribute(this.anim, 2);
    this.animAttr.setUsage(THREE.DynamicDrawUsage);
    const attach = (g) => { g.setAttribute('aAnim', this.animAttr); return g; };
    this.ready = !(geo instanceof Promise);
    const g = this.ready ? attach(geo.clone()) : new THREE.BufferGeometry();
    if (!this.ready) geo.then((real) => { this.mesh.geometry.dispose(); this.mesh.geometry = attach(real); this.ready = true; }).catch((e) => console.warn('animal model', opts.name, e));
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 28, specular: 0x262626, ...(opts.material || {}) });
    const consts = Object.entries(k).map(([n, v]) => `#define ${n} ${Number(v).toFixed(4)}`).join('\n');
    const mode = BODY_MODES[opts.mode] || '';
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${consts}\n${GLSL_HEAD}`)
        .replace('#include <beginnormal_vertex>', 'mat3 rigR = rigRot();\nvec3 objectNormal = normalize(mix(vec3(normal), rigR * vec3(normal), aW));')
        .replace('#include <begin_vertex>', `vec3 transformed = mix(vec3(position), rigR * (vec3(position) - aRig.yzw) + aRig.yzw, aW);
if (aRig.x > 9.5) { float d = length(position - aRig.yzw); float i = aRig.x - 10.;
  transformed.xz += vec2(sin(aAnim.x * 0.8 + i * 1.7 + d * 2.5), cos(aAnim.x * 0.7 + i * 1.3 + d * 2.)) * 0.16 * d * (0.3 + aAnim.y) * aW; }
${mode}`);
    };
    mat.customProgramCacheKey = () => 'critter:' + (opts.name || '') + consts + (opts.mode || '');
    const mesh = this.mesh = new THREE.InstancedMesh(g, mat, max);
    mesh.name = 'critters_' + (opts.name || 'x');
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // they move about; counts are small and only near cameras
    mesh.castShadow = !!opts.shadow; mesh.receiveShadow = true;
    mesh.userData.noCull = true;
    mesh.count = 0;
    if (opts.tint) { mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    game.scene.add(mesh);
    this.max = max; this.n = 0;
  }
  begin() { this.n = 0; }
  // position, yaw (0 faces +z), pitch (nose up > 0), roll, uniform scale, anim phase / amount, colour
  put(x, y, z, yaw, pitch, roll, s, phase, amp, color) {
    if (this.n >= this.max || !this.ready) return;
    const i = this.n++;
    _e.set(-pitch, yaw, roll, 'YXZ');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(s, s, s));
    this.mesh.setMatrixAt(i, _m);
    this.anim[i * 2] = phase; this.anim[i * 2 + 1] = amp;
    if (color !== undefined && this.mesh.instanceColor) this.mesh.setColorAt(i, _c.set(color));
  }
  end() {
    const m = this.mesh;
    m.count = this.n;
    m.instanceMatrix.needsUpdate = true;
    this.animAttr.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

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
