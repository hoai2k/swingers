// Big creatures: meshes. Every builder returns a THREE.Group in its body's local frame
// (+Z forward, +Y up, +X left); the visual baker merges each group into one mesh.
import { THREE } from '../util.js';
import { tube, twoSided, lathe } from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _up = V(0, 1, 0);
// mesh with rotation / scale
function put(H, g, geo, m, p = [0, 0, 0], r = null, s = null) {
  const o = H.mesh(geo, m, p[0], p[1], p[2], g);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  if (s) o.scale.set(s[0], s[1], s[2]);
  return o;
}
// a cylinder from a to b (arrays or vectors)
function beam(H, g, a, b, r0, m, n = 8, r1 = r0) {
  a = a.isVector3 ? a : V(...a); b = b.isVector3 ? b : V(...b);
  const d = b.clone().sub(a), L = d.length();
  const o = H.mesh(H.cyl(r1, r0, L, n), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, g);
  o.quaternion.setFromUnitVectors(_up, d.normalize());
  return o;
}
// a flat two-sided membrane from an outline in the XZ plane ([x, z] points)
function sheet(H, key, pts) {
  return H.geo('bcsh' + key, () => {
    const sh = new THREE.Shape();
    pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(Math.PI / 2);
    return twoSided(g);
  });
}
const tc = (H, t) => H.mat(H.TEAM_COLORS[t]);
const td = (H, t) => H.mat(H.TEAM_DARK[t]);
const k3 = (k) => k.toFixed(3);
const eye = (H, g, x, y, z, r, iris = '#1b1410') => {
  put(H, g, H.sphere(r, 10, 8), H.mat('#f7f2df', { spec: 0.4 }), [x, y, z]);
  put(H, g, H.sphere(r * 0.55, 8, 6), H.mat(iris, { spec: 0.9 }), [x + Math.sign(x) * r * 0.25, y, z + r * 0.55]);
};
const teeth = (H, g, n, x0, z0, z1, y, r, flip = false) => {
  const ivory = H.mat('#f4efdc', { spec: 0.4 });
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1), z = z0 + (z1 - z0) * t;
    for (const sd of [-1, 1]) put(H, g, H.cone(r, r * 2.6, 4), ivory, [sd * x0 * (1 - t * 0.45), y, z], flip ? null : [Math.PI, 0, 0]);
  }
};

// ======================================================================= raptor
export const RAPTOR_C = { skin: '#8f8a46', dark: '#4f4a24', belly: '#ddd2a0', claw: '#2a241c' };
// k = scale (the ridden raptor is a little bigger)
export function raptorTorso(H, team, k = 1) {
  const g = new THREE.Group(), G = new THREE.Group(); G.scale.setScalar(k); g.add(G);
  const sk = H.mat(RAPTOR_C.skin, { spec: 0.2 }), dk = H.mat(RAPTOR_C.dark, { spec: 0.1 }), be = H.mat(RAPTOR_C.belly, { spec: 0.1 });
  put(H, G, H.sphere(0.3, 16, 12), sk, [0, 0, 0], null, [0.85, 0.9, 1.45]);
  put(H, G, H.sphere(0.24, 14, 10), sk, [0, 0.04, 0.3], null, [0.95, 1.0, 1.0]);
  put(H, G, H.sphere(0.25, 14, 10), be, [0, -0.08, 0.08], null, [0.8, 0.75, 1.3]);
  // team-coloured stripes and feather tufts down the back
  for (let i = 0; i < 4; i++) put(H, G, H.box(0.42, 0.06, 0.08), i % 2 ? td(H, team) : dk, [0, 0.23 - i * 0.01, 0.2 - i * 0.16], [0.1 * i, 0, 0], [1 - i * 0.08, 1, 1]);
  for (let i = 0; i < 5; i++) put(H, G, H.cone(0.06, 0.2, 5), tc(H, team), [0, 0.26, 0.28 - i * 0.14], [-1.1, 0, 0]);
  // little clawed arms
  for (const sd of [-1, 1]) {
    beam(H, G, [sd * 0.17, -0.02, 0.32], [sd * 0.2, -0.16, 0.44], 0.035, sk, 6);
    beam(H, G, [sd * 0.2, -0.16, 0.44], [sd * 0.18, -0.12, 0.56], 0.028, sk, 6);
    put(H, G, H.cone(0.045, 0.14, 5), tc(H, team), [sd * 0.22, -0.06, 0.38], [-2.2, 0, sd * 0.3]); // arm feathers
    for (const dx of [-0.02, 0.02]) put(H, G, H.cone(0.012, 0.06, 4), H.mat(RAPTOR_C.claw), [sd * 0.18 + dx, -0.13, 0.6], [1.9, 0, 0]);
  }
  return g;
}
// head on a neck (pivot at the base of the neck); the jaw is a separate part
export function raptorHead(H, team, k = 1) {
  const g = new THREE.Group(), G = new THREE.Group(); G.scale.setScalar(k); g.add(G);
  const sk = H.mat(RAPTOR_C.skin, { spec: 0.2 }), dk = H.mat(RAPTOR_C.dark, { spec: 0.1 });
  beam(H, G, [0, 0, 0], [0, 0.3, 0.22], 0.1, sk, 10, 0.075);
  put(H, G, H.sphere(0.13, 14, 10), sk, [0, 0.33, 0.32], null, [0.85, 0.8, 1.15]);
  put(H, G, H.sphere(0.1, 12, 8), sk, [0, 0.33, 0.48], null, [0.7, 0.55, 1.5]);
  put(H, G, H.box(0.12, 0.03, 0.3), dk, [0, 0.38, 0.46], [0.15, 0, 0]);
  for (const sd of [-1, 1]) {
    eye(H, G, sd * 0.085, 0.38, 0.37, 0.03, '#e8b020');
    put(H, G, H.box(0.05, 0.02, 0.07), dk, [sd * 0.08, 0.415, 0.37], [0, 0, sd * 0.4]); // mean brow
    put(H, G, H.sphere(0.012, 5, 4), H.mat('#1b1410'), [sd * 0.035, 0.36, 0.63]);
  }
  teeth(H, G, 5, 0.05, 0.4, 0.6, 0.29, 0.012);
  // team crest of feathers along the head and neck
  for (let i = 0; i < 5; i++) put(H, G, H.cone(0.04, 0.17, 5), tc(H, team), [0, 0.42 + i * -0.05, 0.36 - i * 0.09], [-1.2 - i * 0.12, 0, 0]);
  return g;
}
export function raptorJaw(H, team, k = 1) {
  const g = new THREE.Group(), G = new THREE.Group(); G.scale.setScalar(k); g.add(G);
  const be = H.mat(RAPTOR_C.belly, { spec: 0.1 });
  put(H, G, H.sphere(0.075, 10, 8), be, [0, -0.02, 0.12], null, [0.85, 0.45, 2.0]);
  put(H, G, H.box(0.07, 0.02, 0.06), H.mat('#b2464a'), [0, 0.005, 0.12]); // tongue
  teeth(H, G, 4, 0.045, 0.04, 0.24, 0.025, 0.01, true);
  return g;
}
export function raptorTail(H, team, k = 1, tip = false) {
  const g = new THREE.Group(), G = new THREE.Group(); G.scale.setScalar(k); g.add(G);
  const sk = H.mat(RAPTOR_C.skin, { spec: 0.2 }), dk = H.mat(RAPTOR_C.dark, { spec: 0.1 });
  if (!tip) {
    put(H, G, tube(H, 'rpt1', [[0, 0, 0], [0, 0.04, -0.35], [0, 0.05, -0.7]], 0.16, 0.085), sk);
    for (let i = 0; i < 3; i++) put(H, G, H.box(0.26 - i * 0.05, 0.04, 0.06), dk, [0, 0.12 - i * 0.02, -0.15 - i * 0.2]);
  } else {
    put(H, G, tube(H, 'rpt2', [[0, 0, 0], [0, 0.02, -0.4], [0, 0.06, -0.75]], 0.085, 0.02), sk);
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) put(H, G, H.cone(0.035, 0.22, 4), tc(H, team), [sd * 0.05, 0.04, -0.4 - i * 0.1], [-1.75, sd * 0.5, 0]);
  }
  return g;
}
// digitigrade leg hanging from the hip (+Y up), foot on the ground at y = -0.87 k
export function raptorLeg(H, team, k = 1) {
  const g = new THREE.Group(), G = new THREE.Group(); G.scale.setScalar(k); g.add(G);
  const sk = H.mat(RAPTOR_C.skin, { spec: 0.2 }), cl = H.mat(RAPTOR_C.claw, { spec: 0.5 });
  put(H, G, H.sphere(0.11, 12, 8), sk, [0, -0.15, 0.05], [-0.4, 0, 0], [0.85, 1.8, 1.05]);
  beam(H, G, [0, -0.32, 0.13], [0, -0.68, -0.07], 0.045, sk, 8, 0.035);
  beam(H, G, [0, -0.68, -0.07], [0, -0.84, 0.02], 0.03, sk, 6);
  for (const dx of [-0.03, 0.03]) {
    beam(H, G, [dx, -0.84, 0.02], [dx * 1.4, -0.86, 0.14], 0.022, sk, 5);
    put(H, G, H.cone(0.018, 0.06, 4), cl, [dx * 1.5, -0.86, 0.17], [Math.PI / 2, 0, 0]);
  }
  // the sickle claw, held up
  put(H, G, tube(H, 'sickle', [[0, -0.82, 0.04], [0, -0.74, 0.1], [0, -0.75, 0.17]], 0.022, 0.004, 6), cl);
  return g;
}

// ======================================================================= T-Rex
export const REX_C = { skin: '#6b7a3c', dark: '#3e4a22', belly: '#cdbd8a', claw: '#2a241c' };
export function rexTorso(H, team) {
  const g = new THREE.Group();
  const sk = H.mat(REX_C.skin, { spec: 0.18 }), dk = H.mat(REX_C.dark, { spec: 0.1 }), be = H.mat(REX_C.belly, { spec: 0.1 });
  put(H, g, H.sphere(1.1, 22, 16), sk, [0, 0, 0], null, [0.95, 1.0, 1.65]);
  put(H, g, H.sphere(0.95, 18, 14), sk, [0, 0.25, 1.05], null, [0.95, 1.0, 1.0]);
  put(H, g, H.sphere(0.95, 18, 14), be, [0, -0.3, 0.45], null, [0.82, 0.78, 1.5]);
  // war paint: team bands over the back, a team blanket with gold rings
  for (let i = 0; i < 4; i++) {
    const z = 0.9 - i * 0.65;
    put(H, g, H.geo('rexband' + i, () => new THREE.CylinderGeometry(1.0, 1.0, 0.24, 18, 1, true, Math.PI - 1.0, 2.0)), i % 2 ? td(H, team) : tc(H, team), [0, 0.05, z], [Math.PI / 2, 0, 0], [1.05 - i * 0.02, 1, 1.08 - i * 0.03]);
  }
  for (const sd of [-1, 1]) put(H, g, H.sphere(0.07, 6, 5), H.gold(), [sd * 0.98, 0.25, 0.1]);
  // back ridge
  for (let i = 0; i < 7; i++) put(H, g, H.cone(0.12, 0.3, 5), dk, [0, 1.08 - i * 0.03, 1.2 - i * 0.42], [-0.4, 0, 0]);
  // the famous little arms
  for (const sd of [-1, 1]) {
    beam(H, g, [sd * 0.6, -0.3, 1.45], [sd * 0.68, -0.62, 1.7], 0.12, sk, 8);
    beam(H, g, [sd * 0.68, -0.62, 1.7], [sd * 0.62, -0.58, 2.0], 0.09, sk, 8);
    for (const dx of [-0.05, 0.05]) put(H, g, H.cone(0.035, 0.14, 4), H.mat(REX_C.claw), [sd * 0.62 + dx, -0.6, 2.08], [1.8, 0, 0]);
  }
  return g;
}
export function rexHead(H, team) {
  const g = new THREE.Group();
  const sk = H.mat(REX_C.skin, { spec: 0.2 }), dk = H.mat(REX_C.dark, { spec: 0.1 }), be = H.mat(REX_C.belly);
  put(H, g, tube(H, 'rexneck', [[0, -0.35, -0.6], [0, 0.1, 0.2], [0, 0.5, 0.85]], 0.74, 0.56, 8), sk);
  put(H, g, H.sphere(0.72, 18, 14), sk, [0, 0.62, 1.05], null, [0.85, 0.85, 1.0]);
  put(H, g, H.sphere(0.6, 18, 12), sk, [0, 0.55, 1.85], null, [0.8, 0.58, 1.5]);
  put(H, g, H.sphere(0.6, 14, 10), be, [0, 0.33, 1.85], null, [0.74, 0.22, 1.42]);
  for (let i = 0; i < 4; i++) put(H, g, H.sphere(0.09, 8, 6), dk, [0, 0.86 - i * 0.02, 1.35 + i * 0.32], null, [1.4, 0.6, 1.6]);
  for (const sd of [-1, 1]) {
    eye(H, g, sd * 0.4, 0.84, 1.22, 0.11, '#d8a018');
    const br = put(H, g, H.box(0.3, 0.11, 0.36), dk, [sd * 0.37, 0.98, 1.22], [0.25, 0, sd * -0.35]);
    br.castShadow = true;
    put(H, g, H.sphere(0.05, 6, 5), H.mat('#1b1410'), [sd * 0.17, 0.66, 2.7]);
    // team war paint: three claw stripes down each cheek
    for (let k = 0; k < 3; k++) put(H, g, H.box(0.03, 0.34, 0.07), tc(H, team), [sd * (0.5 - k * 0.025), 0.58, 1.45 + k * 0.17], [0.35, 0, sd * 0.15]);
  }
  teeth(H, g, 8, 0.4, 1.15, 2.55, 0.25, 0.055);
  return g;
}
export function rexJaw(H, team) {
  const g = new THREE.Group();
  const sk = H.mat(REX_C.skin, { spec: 0.2 }), be = H.mat(REX_C.belly);
  put(H, g, H.sphere(0.9, 16, 10), be, [0, -0.12, 0.85], null, [0.52, 0.24, 0.98]);
  put(H, g, H.sphere(0.9, 16, 10), sk, [0, -0.2, 0.75], null, [0.5, 0.2, 0.92]);
  put(H, g, H.sphere(0.6, 10, 8), H.mat('#9c3a3e'), [0, 0.0, 0.8], null, [0.55, 0.12, 1.0]); // tongue
  teeth(H, g, 7, 0.38, 0.35, 1.55, 0.08, 0.05, true);
  return g;
}
export function rexTail(H, team, i) {
  const g = new THREE.Group();
  const sk = H.mat(REX_C.skin, { spec: 0.18 }), dk = H.mat(REX_C.dark, { spec: 0.1 });
  const R = [[0.72, 0.45], [0.45, 0.22], [0.22, 0.04]][i], L = [1.8, 1.7, 1.5][i];
  put(H, g, tube(H, 'rext' + i, [[0, 0, 0], [0, -0.03, -L / 2], [0, -0.08, -L]], R[0], R[1], 8), sk);
  for (let j = 0; j < 3; j++) put(H, g, H.cone(R[0] * 0.18 + 0.03, R[0] * 0.4 + 0.08, 5), dk, [0, R[0] * (1 - j * 0.18) + 0.02, -0.25 - j * L * 0.3], [-0.5, 0, 0]);
  if (i === 0) put(H, g, H.geo('rexbandt', () => new THREE.CylinderGeometry(0.66, 0.6, 0.22, 16, 1, true, Math.PI - 1.0, 2.0)), tc(H, team), [0, 0, -0.55], [Math.PI / 2, 0, 0]);
  return g;
}
export function rexLeg(H, team) {
  const g = new THREE.Group();
  const sk = H.mat(REX_C.skin, { spec: 0.18 }), cl = H.mat(REX_C.claw, { spec: 0.5 }), dk = H.mat(REX_C.dark);
  put(H, g, H.sphere(0.62, 16, 12), sk, [0, -0.55, 0.1], [-0.25, 0, 0], [0.75, 1.45, 1.1]);
  beam(H, g, [0, -1.25, 0.35], [0, -2.25, -0.3], 0.3, sk, 12, 0.22);
  put(H, g, H.sphere(0.25, 12, 8), sk, [0, -2.28, -0.28]);
  for (const dx of [-0.17, 0, 0.17]) {
    beam(H, g, [dx * 0.5, -2.35, -0.25], [dx * 1.5, -2.62, 0.35], 0.11, sk, 8, 0.09);
    put(H, g, H.cone(0.09, 0.25, 5), cl, [dx * 1.6, -2.65, 0.48], [Math.PI / 2 + 0.3, 0, 0]);
  }
  put(H, g, H.box(0.3, 0.5, 0.06), dk, [0, -0.6, 0.62], [0.3, 0, 0]);
  return g;
}

// ======================================================================= pterodactyl
export const PTERO_C = { skin: '#b9805a', dark: '#6e4430', beak: '#e8c890' };
export function pteroTorso(H, team) {
  const g = new THREE.Group();
  const sk = H.mat(PTERO_C.skin, { spec: 0.2 }), dk = H.mat(PTERO_C.dark);
  put(H, g, H.sphere(0.2, 14, 10), sk, [0, 0, 0], null, [0.9, 0.85, 1.6]);
  put(H, g, H.sphere(0.16, 12, 8), sk, [0, 0.03, 0.22]);
  put(H, g, H.box(0.16, 0.05, 0.4), td(H, team), [0, 0.17, 0]);
  put(H, g, H.cone(0.05, 0.3, 5), dk, [0, 0, -0.42], [-Math.PI / 2, 0, 0]);
  return g;
}
export function pteroHead(H, team) {
  const g = new THREE.Group();
  const sk = H.mat(PTERO_C.skin, { spec: 0.2 }), bk = H.mat(PTERO_C.beak, { spec: 0.5 });
  beam(H, g, [0, 0, 0], [0, 0.2, 0.18], 0.07, sk, 8, 0.055);
  put(H, g, H.sphere(0.11, 12, 8), sk, [0, 0.24, 0.24], null, [0.85, 0.9, 1.2]);
  put(H, g, H.cone(0.075, 0.62, 8), bk, [0, 0.2, 0.62], [Math.PI / 2 - 0.12, 0, 0], [1, 1, 0.75]);
  put(H, g, H.cone(0.06, 0.5, 8), bk, [0, 0.16, 0.56], [Math.PI / 2 - 0.02, 0, 0], [1, 1, 0.5]);
  // big team-coloured head crest
  // (sheet x -> up, z -> forward once turned on its side)
  put(H, g, sheet(H, 'crest2', [[0, 0.1], [0.08, -0.12], [0.5, -0.55], [0.36, -0.22], [0.12, 0.12]]), tc(H, team), [0, 0.28, 0.22], [0, 0, Math.PI / 2]);
  for (const sd of [-1, 1]) eye(H, g, sd * 0.075, 0.28, 0.3, 0.028, '#c83018');
  return g;
}
// wing (sd +1 left, -1 right): arm bone out along +-X with a team membrane behind it
export function pteroWing(H, team, sd) {
  const g = new THREE.Group();
  const sk = H.mat(PTERO_C.skin, { spec: 0.2 }), dk = H.mat(PTERO_C.dark);
  beam(H, g, [0, 0, 0], [sd * 0.75, 0.02, 0.12], 0.04, sk, 6);
  beam(H, g, [sd * 0.75, 0.02, 0.12], [sd * 1.25, 0.02, 0.08], 0.03, sk, 6);
  beam(H, g, [sd * 1.25, 0.02, 0.08], [sd * 2.05, 0, -0.32], 0.02, dk, 5);
  put(H, g, H.cone(0.02, 0.08, 4), dk, [sd * 1.27, 0.02, 0.15], [Math.PI / 2, 0, 0]);
  const pts = [[0, 0.04], [sd * 0.75, 0.12], [sd * 1.25, 0.08], [sd * 2.05, -0.32], [sd * 1.2, -0.5], [sd * 0.5, -0.55], [0, -0.38]];
  put(H, g, sheet(H, 'pw' + sd, pts), td(H, team), [0, 0, 0]);
  put(H, g, sheet(H, 'pws' + sd, [[sd * 0.6, -0.05], [sd * 1.25, 0.04], [sd * 1.75, -0.2], [sd * 1.0, -0.3]]), tc(H, team), [0, 0.006, 0]);
  return g;
}
export function pteroFeet(H, team) {
  const g = new THREE.Group();
  const sk = H.mat(PTERO_C.skin, { spec: 0.2 }), cl = H.mat('#2a241c', { spec: 0.5 });
  for (const sd of [-1, 1]) {
    beam(H, g, [sd * 0.08, 0, 0], [sd * 0.1, -0.35, -0.05], 0.035, sk, 6);
    beam(H, g, [sd * 0.1, -0.35, -0.05], [sd * 0.1, -0.62, 0.02], 0.025, sk, 6);
    for (const dx of [-0.03, 0, 0.03]) put(H, g, H.cone(0.014, 0.08, 4), cl, [sd * 0.1 + dx, -0.66, 0.06], [2.0, 0, 0]);
  }
  return g;
}

// ======================================================================= dragon (Dynasty)
export const DRAGON_C = { belly: '#f0c050', horn: '#f6e6b4', mane: '#ff9a2a', claw: '#3a2a1a', gold: '#f0c03c' };
export function dragonTorso(H, team) {
  const g = new THREE.Group();
  const sc = tc(H, team), dk = td(H, team), be = H.mat(DRAGON_C.belly, { spec: 0.6 }), mn = H.mat(DRAGON_C.mane, { emit: 0.15 });
  put(H, g, H.sphere(1.0, 20, 14), sc, [0, 0, 0], null, [0.9, 0.85, 1.6]);
  put(H, g, H.sphere(0.8, 16, 12), sc, [0, 0.15, 1.0]);
  for (let i = 0; i < 6; i++) put(H, g, H.box(1.0 - Math.abs(i - 2) * 0.08, 0.1, 0.36), be, [0, -0.72 + Math.abs(i - 2.5) * 0.04, 1.1 - i * 0.42], [0.08 * (i - 2.5), 0, 0]);
  // scale rows and a flame mane down the spine
  for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) put(H, g, H.sphere(0.2, 8, 6), dk, [sd * 0.62, 0.42, 0.9 - i * 0.42], null, [0.6, 0.35, 1]);
  for (let i = 0; i < 8; i++) {
    put(H, g, H.cone(0.13, 0.5, 5), mn, [0, 0.84 - Math.abs(i - 2) * 0.03, 1.2 - i * 0.36], [-0.55, 0, 0]);
    if (i % 2) put(H, g, H.cone(0.06, 0.3, 4), H.mat(DRAGON_C.gold, { spec: 1 }), [0, 0.86, 1.05 - i * 0.36], [-0.3, 0, 0]);
  }
  return g;
}
export function dragonNeck(H, team) {
  const g = new THREE.Group();
  const sc = tc(H, team), be = H.mat(DRAGON_C.belly, { spec: 0.6 }), mn = H.mat(DRAGON_C.mane, { emit: 0.15 });
  put(H, g, tube(H, 'dnk', [[0, 0, 0], [0, 0.55, 0.45], [0, 1.05, 1.1]], 0.55, 0.36, 8), sc);
  for (let i = 0; i < 4; i++) put(H, g, H.box(0.5 - i * 0.04, 0.1, 0.3), be, [0, 0.05 + i * 0.3, 0.42 + i * 0.22], [-0.7 + i * 0.1, 0, 0]);
  for (let i = 0; i < 4; i++) put(H, g, H.cone(0.12, 0.45, 5), mn, [0, 0.55 + i * 0.22, -0.02 + i * 0.32], [-1.0, 0, 0]);
  return g;
}
export function dragonHead(H, team) {
  const g = new THREE.Group();
  const sc = tc(H, team), dk = td(H, team), hn = H.mat(DRAGON_C.horn, { spec: 0.6 }), mn = H.mat(DRAGON_C.mane, { emit: 0.15 }), gd = H.mat(DRAGON_C.gold, { spec: 1 });
  put(H, g, H.sphere(0.5, 16, 12), sc, [0, 0.1, 0.25], null, [0.95, 0.85, 1.05]);
  put(H, g, H.box(0.62, 0.36, 0.8), sc, [0, 0.05, 0.8], [0.12, 0, 0]);
  put(H, g, H.sphere(0.3, 12, 10), sc, [0, 0.08, 1.2], null, [1.05, 0.65, 0.7]);
  put(H, g, H.box(0.6, 0.06, 0.95), H.mat(DRAGON_C.belly), [0, -0.12, 0.75]);
  for (const sd of [-1, 1]) {
    // glowing eyes under heavy brows
    put(H, g, H.sphere(0.07, 8, 6), H.glow('#ffe14a'), [sd * 0.3, 0.27, 0.6]);
    put(H, g, H.sphere(0.035, 6, 5), H.mat('#1b1410'), [sd * 0.33, 0.27, 0.65]);
    put(H, g, H.box(0.24, 0.07, 0.24), dk, [sd * 0.28, 0.36, 0.6], [0.3, 0, sd * -0.3]);
    // swept-back golden-ivory horns
    put(H, g, tube(H, 'dhorn' + sd, [[sd * 0.2, 0.35, 0.3], [sd * 0.32, 0.7, -0.05], [sd * 0.38, 0.85, -0.55], [sd * 0.32, 1.0, -0.85]], 0.08, 0.015, 8), hn);
    // long whiskers
    put(H, g, tube(H, 'dwh' + sd, [[sd * 0.2, -0.02, 1.32], [sd * 0.55, 0.0, 1.35], [sd * 0.95, -0.25, 1.1], [sd * 1.2, -0.6, 0.85], [sd * 1.15, -0.85, 0.6]], 0.025, 0.006, 12), gd);
    put(H, g, H.sphere(0.04, 6, 5), H.mat('#1b1410'), [sd * 0.13, 0.15, 1.42]);
    // mane behind the jaw
    for (let i = 0; i < 3; i++) put(H, g, H.cone(0.1, 0.42, 5), mn, [sd * 0.38, -0.02 - i * 0.14, 0.05 - i * 0.05], [-1.9, 0, sd * (0.6 + i * 0.2)]);
  }
  put(H, g, H.sphere(0.09, 8, 6), gd, [0, 0.42, 0.42]); // pearl
  teeth(H, g, 5, 0.25, 0.65, 1.3, -0.18, 0.03);
  return g;
}
export function dragonJaw(H, team) {
  const g = new THREE.Group();
  const sc = tc(H, team), be = H.mat(DRAGON_C.belly);
  put(H, g, H.box(0.52, 0.16, 0.9), be, [0, -0.06, 0.45]);
  put(H, g, H.sphere(0.22, 10, 8), sc, [0, -0.08, 0.86], null, [1.1, 0.5, 0.6]);
  put(H, g, H.sphere(0.12, 8, 6), H.gold(), [0, -0.2, 0.75], null, [1, 1.6, 1]); // beard tuft
  teeth(H, g, 4, 0.22, 0.25, 0.85, 0.04, 0.028, true);
  return g;
}
// inner (o = 0) and outer (o = 1) wing segments, sd +1 left / -1 right
export function dragonWing(H, team, sd, o) {
  const g = new THREE.Group();
  const sc = tc(H, team), dk = td(H, team), gd = H.mat(DRAGON_C.gold, { spec: 1 });
  if (!o) {
    beam(H, g, [0, 0, 0], [sd * 2.2, 0.3, -0.2], 0.16, sc, 8, 0.11);
    put(H, g, H.sphere(0.16, 8, 6), gd, [sd * 2.2, 0.3, -0.2]);
    put(H, g, sheet(H, 'dwi' + sd, [[0, 0.3], [sd * 2.2, -0.2], [sd * 2.1, -1.6], [sd * 1.0, -1.9], [0, -1.6]]), dk);
  } else {
    const tips = [[sd * 2.1, -0.4, -0.8], [sd * 1.6, -0.3, -1.6], [sd * 0.9, -0.2, -2.0]];
    for (const t of tips) beam(H, g, [0, 0, 0], t, 0.07, sc, 6, 0.035);
    put(H, g, H.cone(0.1, 0.35, 5), gd, [sd * 0.05, 0.12, 0.05], [0, 0, sd * -0.3]); // thumb claw
    put(H, g, sheet(H, 'dwo' + sd, [[0, 0], [sd * 2.1, -0.8], [sd * 1.75, -1.25], [sd * 1.6, -1.6], [sd * 1.15, -1.75], [sd * 0.9, -2.0], [sd * 0.2, -1.95], [sd * -0.1, -1.7]]), dk);
    put(H, g, sheet(H, 'dwos' + sd, [[sd * 0.3, -0.3], [sd * 1.6, -0.8], [sd * 1.0, -1.3]]), gd, [0, 0.01, 0]);
  }
  return g;
}
export function dragonTail(H, team, i) {
  const g = new THREE.Group();
  const sc = tc(H, team), mn = H.mat(DRAGON_C.mane, { emit: 0.15 }), gd = H.mat(DRAGON_C.gold, { spec: 1 });
  const R = [[0.58, 0.38], [0.38, 0.2], [0.2, 0.06]][i], L = 1.6;
  put(H, g, tube(H, 'dtl' + i, [[0, 0, 0], [0, -0.02, -L / 2], [0, -0.05, -L]], R[0], R[1], 8), sc);
  for (let j = 0; j < 3; j++) put(H, g, H.cone(R[0] * 0.25, R[0] * 0.7, 5), i === 2 ? mn : gd, [0, R[0] - j * 0.05, -0.3 - j * 0.5], [-0.6, 0, 0]);
  if (i === 2) for (let j = 0; j < 5; j++) put(H, g, H.cone(0.1, 0.55, 5), mn, [Math.sin(j * 1.3) * 0.1, Math.cos(j * 1.3) * 0.1, -1.55], [-Math.PI / 2 + Math.sin(j * 1.3) * 0.5, 0, Math.cos(j * 1.3) * 0.5]);
  return g;
}
export function dragonLeg(H, team, front) {
  const g = new THREE.Group();
  const sc = tc(H, team), cl = H.mat(DRAGON_C.horn, { spec: 0.6 }), be = H.mat(DRAGON_C.belly);
  put(H, g, H.sphere(0.42, 14, 10), sc, [0, -0.35, 0], null, [0.8, 1.3, 1.0]);
  beam(H, g, [0, -0.7, front ? 0.12 : -0.15], [0, -1.55, front ? 0.05 : 0.1], 0.18, sc, 10, 0.14);
  put(H, g, H.sphere(0.2, 10, 8), be, [0, -1.62, 0.12], null, [1, 0.7, 1.3]);
  for (const dx of [-0.12, 0, 0.12]) put(H, g, H.cone(0.06, 0.22, 5), cl, [dx, -1.75, 0.36], [Math.PI / 2 + 0.4, 0, 0]);
  return g;
}

// ======================================================================= elephants
export const ELE_C = { hide: '#8e8b8f', dark: '#69666b', ivory: '#f2ead2', bronze: '#c9923a', wood: '#8a5a2e' };
// war = Ancient war elephant (howdah of archers) / battle = Dynasty battle elephant
export function elephantTorso(H, team, war) {
  const g = new THREE.Group();
  const hide = H.mat(ELE_C.hide, { spec: 0.12 }), dark = H.mat(ELE_C.dark), c = tc(H, team), d = td(H, team), gd = H.gold();
  const trim = war ? H.mat(ELE_C.bronze, { spec: 0.9 }) : gd;
  put(H, g, H.sphere(1.35, 20, 14), hide, [0, 0, 0], null, [1.0, 0.95, 1.45]);
  put(H, g, H.sphere(1.05, 16, 12), hide, [0, 0.35, 0.9], null, [1.0, 0.9, 1.0]);
  put(H, g, H.sphere(1.15, 16, 12), hide, [0, -0.05, -1.15]);
  put(H, g, H.cone(0.08, 0.9, 6), dark, [0, -0.35, -2.05], [-2.6, 0, 0]);
  put(H, g, H.sphere(0.12, 6, 5), dark, [0, -0.75, -2.25]);
  // caparison: team cloth down both flanks with a trim and tassels
  const bl = H.geo('bceblanket', () => new THREE.CylinderGeometry(1.43, 1.43, 2.4, 20, 1, true, Math.PI - 1.15, 2.3));
  put(H, g, bl, c, [0, 0.02, -0.2], [Math.PI / 2, 0, 0]);
  for (const sd of [-1, 1]) {
    put(H, g, H.box(0.06, 0.09, 2.4), trim, [sd * 1.3, -0.55, -0.2]);
    for (let i = 0; i < 8; i++) put(H, g, H.cone(0.06, 0.2, 5), trim, [sd * 1.31, -0.68, -1.25 + i * 0.3], [Math.PI, 0, 0]);
    put(H, g, H.sphere(0.25, 10, 8), d, [sd * 1.35, 0.05, -0.2], null, [0.25, 1, 1]); // flank medallion
    put(H, g, H.sphere(0.12, 8, 6), trim, [sd * 1.42, 0.05, -0.2], null, [0.4, 1, 1]);
  }
  if (war) {
    // howdah: a box for the two archers, team walls with bronze trim, banner poles
    const wd = H.mat(ELE_C.wood, { spec: 0.08 });
    put(H, g, H.box(1.45, 0.14, 2.1), wd, [0, 1.38, -0.55]);
    for (const sd of [-1, 1]) {
      put(H, g, H.box(0.08, 0.6, 2.1), c, [sd * 0.72, 1.72, -0.55]);
      put(H, g, H.box(0.1, 0.07, 2.15), trim, [sd * 0.72, 2.04, -0.55]);
      put(H, g, H.box(1.45, 0.6, 0.08), c, [0, 1.72, -0.55 + sd * 1.05]);
      put(H, g, H.box(1.5, 0.07, 0.1), trim, [0, 2.04, -0.55 + sd * 1.05]);
      for (const z of [-1, 1]) put(H, g, H.cyl(0.05, 0.05, 1.55, 6), wd, [sd * 0.72, 2.1, -0.55 + z * 1.05]);
      for (let i = 0; i < 3; i++) put(H, g, H.sphere(0.07, 6, 5), trim, [sd * 0.77, 1.72, -1.2 + i * 0.65]);
    }
    put(H, g, H.box(0.04, 0.42, 0.6), d, [0.72, 2.6, -1.9]);
    put(H, g, H.box(0.04, 0.42, 0.6), d, [-0.72, 2.6, 0.2]);
    // girth straps
    for (const z of [-1.2, 0.1]) put(H, g, H.geo('bcestrap', () => new THREE.TorusGeometry(1.39, 0.05, 5, 24, Math.PI)), H.leather(), [0, 0, z], [0, Math.PI / 2, 0], [1, 0.97, 1]);
  } else {
    // lacquered armour plates with gold studs, a mahout's saddle cloth on the neck, flags
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
      put(H, g, H.box(0.08, 0.55, 0.5), i % 2 ? d : c, [sd * 1.28, 0.55, 0.6 - i * 0.55], [0, 0, sd * -0.35]);
      put(H, g, H.sphere(0.06, 6, 5), gd, [sd * 1.33, 0.55, 0.6 - i * 0.55]);
    }
    put(H, g, H.box(1.1, 0.1, 0.9), d, [0, 1.02, 1.4], [0.3, 0, 0]);
    put(H, g, H.box(1.2, 0.05, 0.95), gd, [0, 0.98, 1.4], [0.3, 0, 0]);
    for (const sd of [-1, 1]) {
      put(H, g, H.cyl(0.04, 0.04, 2.2, 6), H.darkWood(), [sd * 0.5, 1.9, -1.1]);
      put(H, g, H.box(0.03, 0.55, 0.75), c, [sd * 0.5, 2.6, -1.5]);
      put(H, g, H.box(0.035, 0.08, 0.78), gd, [sd * 0.5, 2.32, -1.5]);
      put(H, g, H.cone(0.07, 0.2, 6), gd, [sd * 0.5, 3.08, -1.1]);
    }
    put(H, g, H.box(0.9, 0.2, 1.4), H.leather(), [0, 1.3, -0.5]);
    put(H, g, H.box(0.95, 0.06, 1.45), gd, [0, 1.42, -0.5]);
  }
  return g;
}
// head on its pivot (the trunk, ears and tusks move with it)
export function elephantHead(H, team, war) {
  const g = new THREE.Group();
  const hide = H.mat(ELE_C.hide, { spec: 0.12 }), dark = H.mat(ELE_C.dark), ivory = H.mat(ELE_C.ivory, { spec: 0.4 });
  const metal = war ? H.mat(ELE_C.bronze, { spec: 0.9 }) : H.metal();
  put(H, g, H.sphere(0.95, 18, 12), hide, [0, 0.2, 0.55], null, [0.95, 1.05, 0.95]);
  for (const sd of [-1, 1]) {
    // big flapping ears
    put(H, g, H.sphere(0.85, 14, 10), dark, [sd * 0.95, 0.2, 0.15], [0, sd * 0.35, sd * -0.15], [0.12, 1.05, 0.9]);
    put(H, g, H.sphere(0.7, 12, 8), H.mat('#b08a8c'), [sd * 0.99, 0.2, 0.2], [0, sd * 0.35, sd * -0.15], [0.08, 0.85, 0.72]);
    put(H, g, H.sphere(0.075, 8, 6), H.mat('#120c08', { spec: 0.8 }), [sd * 0.55, 0.38, 1.2]);
    put(H, g, H.box(0.26, 0.06, 0.12), dark, [sd * 0.55, 0.5, 1.18], [0, 0, sd * -0.35]); // stern brow
    const pts = [[sd * 0.38, -0.45, 1.15], [sd * 0.5, -0.95, 1.65], [sd * 0.52, -1.05, 2.25], [sd * 0.42, -0.75, 2.7]];
    put(H, g, tube(H, 'etusk' + sd, pts, 0.13, 0.035, 10), ivory);
    put(H, g, H.cyl(0.15, 0.15, 0.14, 10), metal, [sd * 0.44, -0.8, 1.42], [-0.7, 0, 0]);
    if (!war) put(H, g, H.cone(0.07, 0.32, 6), H.metal(), [sd * 0.42, -0.72, 2.85], [1.0, 0, 0]); // blade tips
  }
  put(H, g, tube(H, 'etrunk', [[0, -0.05, 1.3], [0, -0.75, 1.6], [0, -1.55, 1.68], [0, -2.15, 1.75], [0, -2.35, 2.05]], 0.33, 0.12, 14), hide);
  for (let i = 0; i < 5; i++) put(H, g, H.cyl(0.3 - i * 0.04, 0.3 - i * 0.04, 0.03, 12), dark, [0, -0.6 - i * 0.35, 1.58 + i * 0.03]);
  if (war) {
    // bronze chamfron with a team plume
    put(H, g, H.box(0.8, 0.85, 0.08), metal, [0, 0.55, 1.33], [-0.25, 0, 0]);
    put(H, g, H.sphere(0.14, 8, 6), H.mat(H.TEAM_COLORS[team]), [0, 1.05, 1.2], null, [0.7, 1.6, 0.9]);
    put(H, g, H.box(0.06, 0.3, 0.06), metal, [0, 0.95, 1.25]);
  } else {
    // spiked head-plate: lacquered team plate, steel rim and spikes
    put(H, g, H.box(0.95, 1.0, 0.1), H.mat(H.TEAM_DARK[team]), [0, 0.5, 1.36], [-0.25, 0, 0]);
    put(H, g, H.box(1.02, 0.08, 0.14), H.gold(), [0, 1.0, 1.24], [-0.25, 0, 0]);
    for (const [x, y] of [[0, 0.75], [0.3, 0.5], [-0.3, 0.5], [0, 0.25], [0.3, 0.9], [-0.3, 0.9]]) {
      put(H, g, H.cone(0.08, 0.45, 6), H.metal(), [x, y, 1.6 - (y - 0.5) * 0.25], [Math.PI / 2 - 0.25, 0, 0]);
    }
    put(H, g, H.sphere(0.12, 8, 6), H.gold(), [0, 0.5, 1.45]);
  }
  return g;
}
export function elephantLeg(H, team, war) {
  const g = new THREE.Group();
  const hide = H.mat(ELE_C.hide, { spec: 0.12 }), dark = H.mat(ELE_C.dark);
  put(H, g, H.sphere(0.6, 14, 10), hide, [0, -0.3, 0], null, [1, 1.3, 1]);
  put(H, g, H.cyl(0.46, 0.42, 1.5, 12), hide, [0, -1.15, 0]);
  put(H, g, H.cyl(0.47, 0.47, 0.14, 12), war ? H.mat(ELE_C.bronze, { spec: 0.9 }) : H.gold(), [0, -1.45, 0]);
  put(H, g, H.cyl(0.46, 0.5, 0.3, 12), dark, [0, -1.85, 0]);
  for (let i = -1; i <= 1; i++) put(H, g, H.sphere(0.09, 6, 5), H.mat(ELE_C.ivory), [i * 0.2, -1.93, 0.42]);
  return g;
}
// the second archer in the howdah: a rigid little figure, origin at the pelvis
export function howdahArcher(H, team) {
  const g = new THREE.Group();
  const skin = H.mat('#e6b48c', { spec: 0.18 }), c = tc(H, team), d = td(H, team), bronze = H.mat(ELE_C.bronze, { spec: 0.9 });
  put(H, g, H.sphere(0.2, 12, 10), d, [0, 0, 0], null, [1.1, 0.95, 1]);
  for (const sd of [-1, 1]) beam(H, g, [sd * 0.11, -0.05, 0], [sd * 0.12, -0.85, 0], 0.085, d, 8);
  put(H, g, H.capsule(0.24, 0.24), c, [0, 0.38, 0], null, [1, 1, 0.92]);
  put(H, g, H.sphere(0.25, 10, 8), H.mat('#efe6cf'), [0, 0.52, 0], null, [1.0, 0.45, 0.92]);
  put(H, g, H.sphere(0.22, 14, 10), skin, [0, 0.86, 0.02]);
  for (const sd of [-1, 1]) put(H, g, H.sphere(0.03, 6, 5), H.mat('#151010'), [sd * 0.08, 0.9, 0.21]);
  put(H, g, H.geo('bcdomeh', () => new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), bronze, [0, 0.92, 0]);
  for (let i = 0; i < 5; i++) put(H, g, H.sphere(0.06, 6, 5), c, [0, 1.17 + Math.sin(i / 4 * Math.PI) * 0.1, -0.2 + i * 0.1], null, [0.5, 1, 1]);
  // left arm holds the bow out in front, right arm drawing
  beam(H, g, [0.28, 0.55, 0], [0.22, 0.6, 0.5], 0.06, skin, 6);
  beam(H, g, [-0.28, 0.55, 0], [-0.05, 0.62, 0.2], 0.06, skin, 6);
  const bw = H.mat('#6b4426', { spec: 0.25 });
  put(H, g, tube(H, 'hbow', [[0.22, 0.05, 0.42], [0.22, 0.35, 0.58], [0.22, 0.62, 0.62], [0.22, 0.9, 0.58], [0.22, 1.2, 0.42]], 0.025, 0.02, 10), bw);
  beam(H, g, [0.22, 0.05, 0.42], [0.22, 1.2, 0.42], 0.006, H.mat('#f4f4f4'), 4);
  return g;
}

// ======================================================================= cavemen
export function femur(H, s, g) {
  const b = H.mat('#efe6cf', { spec: 0.15 });
  const L = 1.05 * s;
  put(H, g, H.cyl(0.045 * s, 0.05 * s, L, 8), b, [0, L / 2, 0]);
  for (const y of [0, L]) for (const x of [-0.06, 0.06]) put(H, g, H.sphere(0.085 * s * (y ? 1.15 : 1), 8, 6), b, [x * s * (y ? 1.2 : 1), y, 0]);
  put(H, g, H.cyl(0.06 * s, 0.06 * s, 0.22 * s, 8), H.leather(), [0, 0.1 * s, 0]);
}
// shaggy hair with a bone through it (r = head radius)
export function shag(H, r, team, g, bone = true) {
  const hair = H.mat('#4a3020', { spec: 0.05 });
  put(H, g, H.sphere(r * 1.05, 14, 10), hair, [0, r * 0.3, -r * 0.15], null, [1.08, 0.9, 1.05]);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (i / 10 - 0.5) * 3.6;
    put(H, g, H.cone(r * 0.22, r * 0.6, 5), hair, [Math.sin(a) * r * 0.95, r * (0.2 + (i % 3) * 0.12), Math.cos(a) * r * 0.9], [Math.cos(a) * 0.9 + 0.2, 0, -Math.sin(a) * 0.9]);
  }
  for (let i = 0; i < 5; i++) put(H, g, H.cone(r * 0.18, r * 0.42, 5), hair, [(i - 2) * r * 0.28, r * 0.85, r * 0.55], [1.2, 0, (i - 2) * 0.25]);
  if (bone) {
    const b = H.mat('#efe6cf');
    put(H, g, H.cyl(r * 0.07, r * 0.07, r * 1.1, 6), b, [r * 0.3, r * 1.05, 0], [0, 0, 1.2]);
    for (const sd of [-1, 1]) put(H, g, H.sphere(r * 0.11, 6, 5), b, [r * 0.3 + sd * r * 0.5, r * 1.05 - sd * r * 0.2, 0]);
  }
  // team-coloured headband
  put(H, g, H.cyl(r * 1.04, r * 1.06, r * 0.18, 16), H.mat(H.TEAM_COLORS[team]), [0, r * 0.38, 0]);
}

export { put, beam, sheet, k3 };
