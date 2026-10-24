// Siege & mounts pack: meshes. Every builder returns a THREE.Group in its body's local
// frame (+Z forward, +Y up, +X left); the visual baker merges each group into one mesh.
import { THREE } from '../util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// mesh with rotation / scale: put(H, g, geo, mat, [x,y,z], [rx,ry,rz], [sx,sy,sz])
function put(H, g, geo, m, p = [0, 0, 0], r = null, s = null) {
  const o = H.mesh(geo, m, p[0], p[1], p[2], g);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  if (s) o.scale.set(s[0], s[1], s[2]);
  return o;
}
// a cylinder from a to b
const _up = V(0, 1, 0);
function beam(H, g, a, b, r, m, n = 8) {
  const d = b.clone().sub(a), L = d.length();
  const o = H.mesh(H.cyl(r, r, L, n), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, g);
  o.quaternion.setFromUnitVectors(_up, d.normalize());
  return o;
}
// tube along a curve tapering r0 -> r1 (tusks, trunks, bow limbs)
function taper(H, key, pts, r0, r1, n = 14) {
  return H.geo('smt' + key, () => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, n, 1, 8, false);
    const p = g.attributes.position, c = V(0, 0, 0), v = V(0, 0, 0);
    for (let i = 0; i <= n; i++) {
      curve.getPointAt(i / n, c);
      const k = r0 + (r1 - r0) * (i / n);
      for (let j = 0; j <= 8; j++) {
        const idx = i * 9 + j;
        v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c);
        p.setXYZ(idx, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

const C = {
  horse: '#8a5a34', horseDark: '#3e2716', hoof: '#2a2119', fur: '#7a5236', furDark: '#4b3020', ivory: '#f1e8cf',
  rock: '#8d8882', rope: '#6a5236', white: '#f6f3ea', feather: '#e9e3d6',
};

// ---------------------------------------------------------------- horse
export const HORSE_SCALE = 1.12;
function scaled(k) { const o = new THREE.Group(), g = new THREE.Group(); g.scale.setScalar(k); o.add(g); return [o, g]; }
export function horseTorso(H, team) {
  const [out, g] = scaled(HORSE_SCALE);
  const hide = H.mat(C.horse, { spec: 0.15 }), dark = H.mat(C.horseDark), tc = H.mat(H.TEAM_COLORS[team]), td = H.mat(H.TEAM_DARK[team]);
  put(H, g, H.sphere(0.4, 16, 12), hide, [0, 0, 0], null, [0.95, 0.95, 1.6]);
  put(H, g, H.sphere(0.38, 14, 10), hide, [0, 0.04, 0.5], null, [0.95, 1.0, 1.0]);
  put(H, g, H.sphere(0.4, 14, 10), hide, [0, 0.05, -0.5], null, [1.0, 1.0, 1.0]);
  // neck and head
  put(H, g, H.cyl(0.16, 0.25, 0.78, 12), hide, [0, 0.42, 0.78], [0.62, 0, 0]);
  put(H, g, H.capsule(0.13, 0.36), hide, [0, 0.69, 1.19], [1.95, 0, 0]);
  put(H, g, H.sphere(0.125, 12, 10), hide, [0, 0.56, 1.37], null, [0.95, 0.85, 1.15]);
  put(H, g, H.sphere(0.03, 6, 5), H.mat('#151010'), [0.06, 0.55, 1.5]);
  put(H, g, H.sphere(0.03, 6, 5), H.mat('#151010'), [-0.06, 0.55, 1.5]);
  for (const sd of [-1, 1]) {
    put(H, g, H.sphere(0.036, 8, 6), H.mat('#120c08', { spec: 0.8 }), [sd * 0.115, 0.76, 1.18]);
    put(H, g, H.cone(0.045, 0.15, 6), hide, [sd * 0.07, 0.92, 1.06], [-0.3, 0, sd * -0.25]);
  }
  // mane and tail
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    put(H, g, H.box(0.07, 0.14, 0.12), dark, [0, 0.32 + t * 0.56, 0.5 + t * 0.48], [0.62, 0, 0]);
  }
  put(H, g, H.box(0.07, 0.12, 0.1), dark, [0, 0.9, 1.08], [0.9, 0, 0]);
  put(H, g, H.cone(0.1, 0.66, 8), dark, [0, -0.15, -1.0], [-2.55, 0, 0]);
  // caparison, saddle, plume
  put(H, g, H.box(0.84, 0.05, 0.78), tc, [0, 0.385, -0.08]);
  for (const sd of [-1, 1]) {
    put(H, g, H.box(0.04, 0.44, 0.8), tc, [sd * 0.42, 0.13, -0.08]);
    put(H, g, H.box(0.045, 0.06, 0.82), H.gold(), [sd * 0.425, -0.1, -0.08]);
    put(H, g, H.box(0.05, 0.16, 0.16), td, [sd * 0.43, 0.15, -0.08]);
  }
  put(H, g, H.box(0.36, 0.1, 0.44), H.leather(), [0, 0.43, -0.08]);
  put(H, g, H.box(0.3, 0.12, 0.06), H.leather(), [0, 0.5, 0.13]);
  put(H, g, H.box(0.34, 0.15, 0.06), H.leather(), [0, 0.52, -0.29]);
  put(H, g, H.box(0.05, 0.05, 0.3), H.leather(), [0, 0.7, 1.22], [1.95, 0, 0]);
  put(H, g, H.sphere(0.08, 8, 6), tc, [0, 0.93, 1.1], null, [0.6, 1.4, 0.8]);
  return out;
}
export function horseLeg(H, team, front) {
  const [out, g] = scaled(HORSE_SCALE);
  const hide = H.mat(C.horse, { spec: 0.15 });
  put(H, g, H.sphere(0.15, 12, 8), hide, [0, -0.12, 0], null, [0.75, 1.7, 1.05]);
  put(H, g, H.cyl(0.08, 0.06, 0.46, 8), hide, [0, -0.45, front ? 0 : -0.03]);
  put(H, g, H.cyl(0.055, 0.05, 0.34, 8), hide, [0, -0.76, 0]);
  put(H, g, H.sphere(0.065, 8, 6), hide, [0, -0.9, 0]);
  put(H, g, H.cyl(0.07, 0.085, 0.1, 10), H.mat(C.hoof), [0, -0.96, 0.01]);
  return out;
}

// ---------------------------------------------------------------- mammoth
export function mammothTorso(H, team) {
  const g = new THREE.Group();
  const fur = H.mat(C.fur, { spec: 0.05 }), dark = H.mat(C.furDark, { spec: 0 }), tc = H.mat(H.TEAM_COLORS[team]), td = H.mat(H.TEAM_DARK[team]);
  put(H, g, H.sphere(1.4, 20, 14), fur, [0, 0, 0], null, [1.0, 0.98, 1.55]);
  put(H, g, H.sphere(1.0, 16, 12), fur, [0, 0.85, 0.85], null, [1.0, 0.8, 1.1]);
  put(H, g, H.sphere(1.15, 16, 12), fur, [0, -0.1, -1.3]);
  // shaggy fringe under the belly
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    put(H, g, H.cone(0.24, 0.75, 5), dark, [Math.cos(a) * 1.25, -0.82, Math.sin(a) * 1.95], [Math.PI, a, 0]);
  }
  // war blanket over the back, with tassels
  const bl = H.geo('smmblanket', () => new THREE.CylinderGeometry(1.47, 1.47, 2.3, 18, 1, true, Math.PI - 1.05, 2.1));
  put(H, g, bl, tc, [0, 0.05, -0.35], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 7; i++) {
    for (const sd of [-1, 1]) put(H, g, H.sphere(0.07, 6, 5), H.gold(), [sd * 1.27, 0.75, -1.4 + i * 0.35]);
  }
  put(H, g, H.box(0.6, 0.06, 2.3), td, [0, 1.5, -0.35]);
  // rider seat and rear seat
  put(H, g, H.box(0.62, 0.16, 0.6), H.leather(), [0, 1.48, -0.5]);
  put(H, g, H.box(0.5, 0.14, 0.5), H.leather(), [0, 1.33, -1.6], [-0.3, 0, 0]);
  // bone ornaments and tail
  for (const sd of [-1, 1]) put(H, g, H.cone(0.08, 0.5, 6), H.mat(C.ivory), [sd * 0.75, 1.25, 0.55], [0.3, 0, sd * -0.6]);
  put(H, g, H.cone(0.12, 0.6, 6), dark, [0, -0.2, -2.25], [-2.3, 0, 0]);
  return g;
}
export function mammothHead(H, team) {
  const g = new THREE.Group();
  const fur = H.mat(C.fur, { spec: 0.05 }), dark = H.mat(C.furDark, { spec: 0 }), tc = H.mat(H.TEAM_COLORS[team]);
  const ivory = H.mat(C.ivory, { spec: 0.4 });
  put(H, g, H.sphere(0.95, 18, 12), fur, [0, 0.2, 0.55], null, [0.95, 1.05, 0.95]);
  put(H, g, H.sphere(0.62, 14, 10), dark, [0, 0.95, 0.4]);
  for (const sd of [-1, 1]) {
    put(H, g, H.sphere(0.46, 12, 8), dark, [sd * 0.85, 0.22, 0.32], [0, sd * 0.3, 0], [0.25, 1.0, 0.8]);
    put(H, g, H.sphere(0.075, 8, 6), H.mat('#120c08', { spec: 0.8 }), [sd * 0.52, 0.42, 1.2]);
    put(H, g, H.sphere(0.03, 5, 4), H.mat('#ffffff'), [sd * 0.55, 0.45, 1.25]);
    const pts = [V(sd * 0.42, -0.45, 1.15), V(sd * 0.56, -1.1, 1.7), V(sd * 0.64, -1.35, 2.35), V(sd * 0.52, -1.02, 2.95), V(sd * 0.36, -0.6, 3.2)];
    put(H, g, taper(H, 'tusk' + sd, pts, 0.14, 0.03), ivory);
    put(H, g, H.cyl(0.16, 0.16, 0.12, 10), tc, [sd * 0.5, -0.8, 1.42], [-0.7, 0, 0]);
  }
  const trunk = [V(0, -0.05, 1.3), V(0, -0.8, 1.55), V(0, -1.6, 1.58), V(0, -2.2, 1.62), V(0, -2.45, 1.9)];
  put(H, g, taper(H, 'trunk', trunk, 0.34, 0.13), fur);
  put(H, g, H.box(0.8, 0.5, 0.06), tc, [0, 0.55, 1.42], [-0.35, 0, 0]);
  put(H, g, H.sphere(0.09, 8, 6), H.gold(), [0, 0.55, 1.47]);
  return g;
}
export function mammothLeg(H, team) {
  const g = new THREE.Group();
  const fur = H.mat(C.fur, { spec: 0.05 }), dark = H.mat(C.furDark, { spec: 0 });
  put(H, g, H.sphere(0.62, 14, 10), fur, [0, -0.3, 0], null, [1, 1.3, 1]);
  put(H, g, H.cyl(0.45, 0.4, 1.5, 12), fur, [0, -1.15, 0]);
  put(H, g, H.cyl(0.5, 0.56, 0.32, 12), dark, [0, -1.55, 0]);
  put(H, g, H.cyl(0.46, 0.48, 0.26, 12), H.mat('#5e4a3a'), [0, -1.87, 0]);
  for (let i = -1; i <= 1; i++) put(H, g, H.sphere(0.09, 6, 5), H.mat(C.ivory), [i * 0.2, -1.92, 0.42]);
  return g;
}
// the second mammoth rider: a tribal drummer, a rigid little figure
export function drummer(H, team) {
  const g = new THREE.Group();
  const skin = H.mat('#e8b48a', { spec: 0.18 }), tc = H.mat(H.TEAM_COLORS[team]), td = H.mat(H.TEAM_DARK[team]);
  for (const sd of [-1, 1]) {
    put(H, g, H.capsule(0.08, 0.3), skin, [sd * 0.17, 0.08, 0.16], [1.45, 0, sd * 0.2]);
    put(H, g, H.capsule(0.07, 0.28, 0.0), skin, [sd * 0.2, -0.12, 0.33], [0.2, 0, 0]);
    put(H, g, H.capsule(0.06, 0.3), skin, [sd * 0.24, 0.42, 0.14], [1.0, 0, sd * 0.25]);
  }
  put(H, g, H.sphere(0.24, 14, 10), td, [0, 0.12, 0], null, [1.1, 0.7, 1.0]);
  put(H, g, H.sphere(0.26, 14, 10), tc, [0, 0.42, 0], null, [1.0, 1.15, 0.9]);
  put(H, g, H.sphere(0.21, 14, 10), skin, [0, 0.82, 0.02]);
  for (const sd of [-1, 1]) put(H, g, H.sphere(0.035, 6, 5), H.mat('#151010'), [sd * 0.08, 0.86, 0.2]);
  put(H, g, H.cyl(0.215, 0.215, 0.06, 14), td, [0, 0.9, 0.02]);
  put(H, g, H.cone(0.05, 0.4, 6), H.mat('#f4f0e0'), [0.12, 1.12, -0.1], [-0.3, 0, -0.3]);
  put(H, g, H.cyl(0.2, 0.2, 0.26, 14), H.wood(), [0, 0.32, 0.36]);
  put(H, g, H.cyl(0.205, 0.205, 0.03, 14), H.mat('#efe0c0'), [0, 0.46, 0.36]);
  return g;
}

// ---------------------------------------------------------------- catapult
function wheels(H, g, xs, y, zs, r) {
  for (const x of xs) for (const z of zs) {
    put(H, g, H.cyl(r, r, 0.12, 14), H.darkWood(), [x, y, z], [0, 0, Math.PI / 2]);
    put(H, g, H.cyl(r * 0.3, r * 0.3, 0.17, 8), H.metal(), [x, y, z], [0, 0, Math.PI / 2]);
    for (const a of [0, Math.PI / 2]) put(H, g, H.box(0.035, r * 1.85, 0.05), H.wood(), [x, y, z], [a, 0, 0]);
  }
}
export function catapultCart(H, team) {
  const g = new THREE.Group();
  const wd = H.wood(), dw = H.darkWood(), tc = H.mat(H.TEAM_COLORS[team]);
  for (const sd of [-1, 1]) {
    put(H, g, H.box(0.16, 0.2, 2.4), wd, [sd * 0.62, 0, 0]);
    put(H, g, H.box(0.17, 0.07, 2.0), tc, [sd * 0.62, 0.11, 0]);
    // A-frame uprights holding the axle and the stop beam
    put(H, g, H.box(0.13, 1.15, 0.13), dw, [sd * 0.42, 0.55, -0.02], [-0.32, 0, 0]);
    put(H, g, H.box(0.13, 1.15, 0.13), dw, [sd * 0.42, 0.55, 0.62], [0.32, 0, 0]);
    put(H, g, H.box(0.16, 0.12, 0.6), wd, [sd * 0.62, 0.15, 0.3]);
  }
  for (const z of [-1.05, -0.3, 0.45, 1.05]) put(H, g, H.box(1.4, 0.14, 0.16), dw, [0, 0.03, z]);
  put(H, g, H.box(1.1, 0.06, 1.05), wd, [0, 0.1, -0.62]);
  wheels(H, g, [0.8, -0.8], -0.22, [0.75, -0.75], 0.34);
  // stop beam with team padding, axle with torsion ropes, rear winch
  put(H, g, H.box(1.0, 0.15, 0.15), dw, [0, 1.08, 0.44]);
  put(H, g, H.box(0.55, 0.22, 0.2), tc, [0, 1.08, 0.33]);
  put(H, g, H.cyl(0.06, 0.06, 1.0, 8), H.metal(), [0, 0.62, 0.2], [0, 0, Math.PI / 2]);
  for (const sd of [-1, 1]) put(H, g, H.cyl(0.17, 0.17, 0.26, 10), H.mat(C.rope), [sd * 0.24, 0.62, 0.2], [0, 0, Math.PI / 2]);
  put(H, g, H.cyl(0.1, 0.1, 1.0, 10), wd, [0, 0.32, -0.98], [0, 0, Math.PI / 2]);
  for (const sd of [-1, 1]) put(H, g, H.box(0.05, 0.36, 0.05), dw, [sd * 0.55, 0.32, -0.98]);
  beam(H, g, V(0, 0.32, -0.98), V(0, 0.55, 0.02), 0.02, H.mat(C.rope), 5);
  // banner
  put(H, g, H.cyl(0.03, 0.03, 1.7, 6), wd, [0.62, 0.9, -1.12]);
  put(H, g, H.box(0.025, 0.42, 0.55), tc, [0.62, 1.48, -1.4]);
  put(H, g, H.sphere(0.05, 6, 5), H.gold(), [0.62, 1.77, -1.12]);
  return g;
}
export const ARM_LEN = 2.25;
export function catapultArm(H, team) {
  const g = new THREE.Group();
  put(H, g, H.box(0.15, 2.4, 0.15), H.wood(), [0, 1.0, 0]);
  for (const y of [0.25, 1.2, 1.95]) put(H, g, H.box(0.18, 0.06, 0.18), H.metal(), [0, y, 0]);
  put(H, g, H.cyl(0.33, 0.27, 0.18, 14), H.darkWood(), [0, ARM_LEN, 0.08], [Math.PI / 2, 0, 0]);
  put(H, g, H.cyl(0.34, 0.34, 0.04, 14), H.metal(), [0, ARM_LEN, 0.16], [Math.PI / 2, 0, 0]);
  return g;
}
export function rock(H) {
  const g = new THREE.Group();
  const m = H.mat(C.rock, { spec: 0.05 });
  put(H, g, H.geo('smrock', () => new THREE.DodecahedronGeometry(0.45, 0)), m, [0, 0, 0], [0.3, 0.5, 0.2], [1.05, 0.92, 1.0]);
  put(H, g, H.geo('smrock2', () => new THREE.DodecahedronGeometry(0.22, 0)), H.mat('#7a756f', { spec: 0.05 }), [0.25, 0.2, 0.1], [1, 0, 0.4]);
  put(H, g, H.geo('smrock2', () => null), m, [-0.2, -0.18, 0.2], [0.2, 1, 0]);
  return g;
}

// ---------------------------------------------------------------- ballista
export function ballistaCart(H, team) {
  const g = new THREE.Group();
  const wd = H.wood(), dw = H.darkWood(), tc = H.mat(H.TEAM_COLORS[team]);
  for (const sd of [-1, 1]) put(H, g, H.box(0.14, 0.16, 1.7), wd, [sd * 0.5, 0, 0]);
  for (const z of [-0.7, 0, 0.7]) put(H, g, H.box(1.14, 0.12, 0.14), dw, [0, 0.02, z]);
  wheels(H, g, [0.64, -0.64], -0.16, [0.55, -0.55], 0.26);
  put(H, g, H.cyl(0.1, 0.14, 0.42, 10), dw, [0, 0.26, 0.1]);
  // the giant crossbow
  put(H, g, H.box(0.22, 0.16, 2.0), wd, [0, 0.55, 0.25]);
  put(H, g, H.box(0.24, 0.05, 1.7), tc, [0, 0.64, 0.2]);
  for (const sd of [-1, 1]) {
    const pts = [V(sd * 0.1, 0.58, 1.12), V(sd * 0.55, 0.6, 1.02), V(sd * 0.95, 0.62, 0.78), V(sd * 1.12, 0.63, 0.55)];
    put(H, g, taper(H, 'bow' + sd, pts, 0.075, 0.035), dw);
    put(H, g, H.sphere(0.05, 6, 5), H.metal(), [sd * 1.12, 0.63, 0.55]);
    beam(H, g, V(sd * 1.12, 0.63, 0.55), V(0, 0.66, -0.25), 0.012, H.mat('#e8dcc0'), 4);
    put(H, g, H.cyl(0.08, 0.08, 0.24, 8), H.metal(), [sd * 0.13, 0.58, 1.1], [0, 0, Math.PI / 2]);
  }
  put(H, g, H.cyl(0.08, 0.08, 0.5, 8), wd, [0, 0.5, -0.65], [0, 0, Math.PI / 2]);
  for (const sd of [-1, 1]) put(H, g, H.box(0.04, 0.3, 0.04), dw, [sd * 0.28, 0.5, -0.65]);
  // mantlet: a team-painted shield board in front
  put(H, g, H.box(1.05, 0.5, 0.06), tc, [0, 0.12, 0.92]);
  put(H, g, H.box(1.1, 0.06, 0.08), H.metal(), [0, 0.38, 0.92]);
  put(H, g, H.sphere(0.1, 8, 6), H.gold(), [0, 0.12, 0.96], null, [1, 1, 0.4]);
  return g;
}
export function bolt(H, along = 'z') {
  const g = new THREE.Group();
  const r = along === 'z' ? [Math.PI / 2, 0, 0] : null;
  const inner = new THREE.Group();
  g.add(inner);
  if (r) inner.rotation.set(r[0], r[1], r[2]);
  put(H, inner, H.cyl(0.035, 0.035, 1.6, 6), H.wood(), [0, 0, 0]);
  put(H, inner, H.cone(0.075, 0.26, 4), H.metal(), [0, 0.92, 0]);
  for (let i = 0; i < 3; i++) {
    const f = put(H, inner, H.box(0.006, 0.26, 0.09), H.mat(i ? '#f4f0e6' : '#c0392b'), [0, -0.66, 0]);
    f.rotation.y = (i / 3) * Math.PI * 2; f.translateZ(0.05);
  }
  return g;
}

// ---------------------------------------------------------------- valkyrie wing (sd +1 left, -1 right)
export function wing(H, team, sd) {
  const g = new THREE.Group();
  const w = H.mat(C.white, { spec: 0.2 }), f2 = H.mat(C.feather, { spec: 0.15 }), tl = H.mat(team ? '#ffd2c8' : '#d2e2ff', { spec: 0.15 });
  put(H, g, H.sphere(0.09, 8, 6), H.gold(), [0, 0, 0]);
  put(H, g, H.capsule(0.05, 0.8), w, [sd * 0.45, 0.05, 0], [0, 0, Math.PI / 2]);
  put(H, g, H.sphere(0.45, 14, 8), w, [sd * 0.48, 0.0, -0.1], [0, 0, 0], [1.05, 0.12, 0.42]);
  for (let i = 0; i < 6; i++) {
    const k = i / 5;
    const o = put(H, g, H.sphere(0.34, 10, 6), i > 3 ? tl : i % 2 ? f2 : w, [sd * (0.72 + k * 0.2), -0.04 - k * 0.05, -0.18 - k * 0.32], null, [1.25, 0.08, 0.22]);
    o.rotation.y = sd * (0.15 + k * 0.7);
  }
  return g;
}

// ---------------------------------------------------------------- items & hats
export function lance(H, s, team, g, L, back) {
  const tc = H.mat(H.TEAM_COLORS[team]), wh = H.mat('#f4f0e6');
  const y0 = -back, y1 = L - back;
  const n = 6, seg = (y1 - 0.3 - y0) / n;
  for (let i = 0; i < n; i++) {
    const r0 = 0.07 * s - (i / n) * 0.035 * s, r1 = 0.07 * s - ((i + 1) / n) * 0.035 * s;
    put(H, g, H.cyl(r1, r0, seg, 8), i % 2 ? tc : wh, [0, y0 + seg * (i + 0.5), 0]);
  }
  put(H, g, H.cone(0.15 * s, 0.32 * s, 12), H.metal(), [0, 0.22 * s, 0]);
  put(H, g, H.cone(0.045 * s, 0.32 * s, 6), H.metal(), [0, y1 - 0.14 * s, 0]);
  put(H, g, H.box(0.012, 0.13 * s, 0.26 * s), tc, [0, y1 - 0.5 * s, -0.14 * s]);
}
export function mallet(H, s, team, g) {
  put(H, g, H.cyl(0.028 * s, 0.032 * s, 0.72 * s, 6), H.wood(), [0, 0.36 * s, 0]);
  put(H, g, H.cyl(0.1 * s, 0.1 * s, 0.3 * s, 10), H.darkWood(), [0, 0.7 * s, 0], [0, 0, Math.PI / 2]);
  for (const x of [-0.11, 0.11]) put(H, g, H.cyl(0.105 * s, 0.105 * s, 0.04 * s, 10), H.metal(), [x * s, 0.7 * s, 0], [0, 0, Math.PI / 2]);
}
export function valkHelm(H, r, team, g) {
  const dome = H.geo('smvdome' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.06, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  put(H, g, dome, H.metal(), [0, r * 0.36, 0], null, [1, 0.88, 1]);
  put(H, g, H.cyl(r * 1.08, r * 1.08, r * 0.16, 18), H.gold(), [0, r * 0.4, 0]);
  put(H, g, H.box(r * 0.14, r * 0.45, r * 0.08), H.metal(), [0, r * 0.2, r * 1.0]);
  const w = H.mat(C.white, { spec: 0.2 });
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      put(H, g, H.sphere(r * 0.45, 8, 6), w, [sd * r * (1.0 + i * 0.12), r * (0.75 + i * 0.22), -r * (0.1 + i * 0.18)], [0.5 + i * 0.25, 0, sd * (0.5 - i * 0.2)], [0.18, 1.0, 0.4]);
    }
  }
  // blond braids
  const hair = H.mat('#e8c46a', { spec: 0.1 });
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) put(H, g, H.sphere(r * 0.17, 8, 6), hair, [sd * r * 0.85, -r * (0.2 + i * 0.3), -r * 0.25]);
}
