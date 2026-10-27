// Jungle animals (critters.js species: one draw call each): monkey troops scampering about
// and monkeys swinging from the tree vines, tigers and leopards prowling and lying down,
// river hogs rooting in a line, capybaras lazing on the river banks and paddling in the
// river, tapirs, snakes, crocodiles drifting down the river or basking on the banks with
// their jaws open, and parrots and toucans circling over the canopy.
//
// Each land animal walks a closed loop of waypoints round its home, picked at load where the
// ground is clear (no village, temple, river, trail, steep slopes or lava) and densified with
// the ground height, so a frame costs no terrain queries. Where it is on its loop is a
// function of time (walk for a while, rest, walk on), so nothing is stepped while nobody is
// near: only animals within SEE m of a camera are posed, and they make their noise (growl,
// chatter, grunt, hiss, snap, squawk) when a player comes close. They are scenery: no
// physics, you walk through them.
import * as THREE from 'three';
import { SEA_LEVEL } from '../../../config.js';
import { Species, rig, hash, rng, BODY, FL, FR, BL, BR, TAIL, HEAD, WING_L, WING_R, JAW } from '../../critters.js';
import { VILLAGE, LAGOON, TEMPLE, RIVER, CLIFF, POOL, TRAIL, TRACK, VOLCANO, polyDist } from '../jungle.js';
import { GROVE } from './wild.js';

const SEE = 170;
const EYE = 0x1c1c28;
const eyes = (b, x, y, z, r = 0.035) => { for (const s of [-1, 1]) { b.sphere(r * 1.5, 0xffffff, [s * x, y, z], null, 8); b.sphere(r, EYE, [s * (x + r * 0.5), y, z + r * 0.6], null, 6); } };
const legs = (h, w, z0, z1, r, color, foot) => [[FL, 1, z0], [FR, -1, z0], [BL, 1, z1], [BR, -1, z1]].map(([p, s, z]) => ({ part: p, pivot: [s * w, h, z], build: (b) => { b.cyl(r, r * 0.85, h, color, [s * w, h / 2, z], null, 7); if (foot) b.sphere(r * 1.15, foot, [s * w, r * 0.6, z + r * 0.3], [1, 0.6, 1.3], 7); } }));

// ---- models (facing +z, feet at y = 0) --------------------------------------------------------
function cat(body, dark, belly, spots) { // tiger (stripes) / leopard (spots), ~1.9 m
  return rig([
    { build: (b) => {
      b.sphere(0.4, body, [0, 0.72, 0], [0.85, 0.8, 1.9], 14);
      b.sphere(0.34, belly, [0, 0.6, 0.05], [0.8, 0.6, 1.7], 10);
      if (spots === 'stripes') for (let i = 0; i < 6; i++) for (const s of [-1, 1]) b.sphere(0.25, dark, [s * 0.215, 0.8, 0.5 - i * 0.2], [0.28, 0.85, 0.13], 8); // stripes over the back
      else for (let i = 0; i < 22; i++) { const a = i * 2.39, z = 0.6 - (i / 22) * 1.3, y = 0.72 + Math.cos(a) * 0.24, x = Math.sin(a) * 0.3; if (y > 0.56) b.sphere(0.045, dark, [x, y, z], [1, 1, 1], 5); }
    } },
    { part: HEAD, pivot: [0, 0.95, 0.65], build: (b) => {
      b.sphere(0.27, body, [0, 1.0, 0.85], [1.05, 0.95, 1], 12);
      b.sphere(0.15, belly, [0, 0.92, 1.05], [1.1, 0.8, 0.9], 10);
      b.sphere(0.04, 0x3a2a2a, [0, 0.98, 1.17], null, 6);
      for (const s of [-1, 1]) { b.sphere(0.08, body, [s * 0.17, 1.22, 0.82], [1, 1, 0.5], 8); b.sphere(0.04, dark, [s * 0.17, 1.23, 0.84], [1, 1, 0.5], 6); }
      if (spots === 'stripes') for (const s of [-1, 1]) b.box(0.02, 0.1, 0.03, dark, [s * 0.12, 1.2, 0.98], [0, 0, s * 0.3]);
      eyes(b, 0.1, 1.06, 1.06, 0.035);
    } },
    { part: TAIL, pivot: [0, 0.82, -0.7], build: (b) => { for (let i = 0; i < 7; i++) b.sphere(0.065, i % 2 && spots === 'stripes' ? dark : body, [0, 0.82 - i * 0.03 + (i > 4 ? (i - 4) * 0.06 : 0), -0.75 - i * 0.12], null, 6); } },
    ...legs(0.62, 0.17, 0.5, -0.5, 0.08, body, belly),
  ]);
}
function monkeyParts(hang) {
  const F = 0x7a4a2a, T = 0xe8c49a;
  const head = { part: HEAD, pivot: [0, 0.55, 0.2], build: (b) => {
    b.sphere(0.17, F, [0, 0.66, 0.24], null, 12);
    b.sphere(0.12, T, [0, 0.63, 0.34], [1.1, 0.9, 0.7], 10);
    for (const s of [-1, 1]) { b.sphere(0.06, T, [s * 0.17, 0.68, 0.22], [0.5, 1, 1], 8); }
    eyes(b, 0.05, 0.69, 0.39, 0.025);
    b.box(0.06, 0.012, 0.01, 0x5a2a2a, [0, 0.6, 0.42]);
  } };
  const body = { build: (b) => { b.sphere(0.2, F, [0, 0.45, 0], [0.9, 1.05, 1.0], 12); b.sphere(0.14, T, [0, 0.43, 0.09], [0.9, 1, 0.7], 10); } };
  const tail = { part: TAIL, pivot: [0, 0.35, -0.15], build: (b) => { for (let i = 0; i < 9; i++) { const a = i / 8 * 2.4; b.sphere(0.035, F, [0, 0.35 + Math.sin(a) * 0.32, -0.18 - Math.sin(a * 0.6) * 0.32 + (i > 6 ? (i - 6) * 0.05 : 0)], null, 5); } } };
  if (!hang) return [body, head, tail,
    { part: FL, pivot: [0.12, 0.5, 0.1], build: (b) => b.cyl(0.055, 0.045, 0.46, F, [0.13, 0.27, 0.12], null, 7) },
    { part: FR, pivot: [-0.12, 0.5, 0.1], build: (b) => b.cyl(0.055, 0.045, 0.46, F, [-0.13, 0.27, 0.12], null, 7) },
    { part: BL, pivot: [0.1, 0.3, -0.05], build: (b) => b.cyl(0.06, 0.05, 0.3, F, [0.11, 0.15, -0.05], null, 7) },
    { part: BR, pivot: [-0.1, 0.3, -0.05], build: (b) => b.cyl(0.06, 0.05, 0.3, F, [-0.11, 0.15, -0.05], null, 7) }];
  // hanging by its right hand: the hand is the origin, everything hangs below it
  const down = (p) => ({ ...p, pivot: p.pivot && [p.pivot[0], p.pivot[1] - 1.25, p.pivot[2]], build: (b) => p.build(shift(b, -1.25)) });
  return [down(body), down(head), down(tail),
    { build: (b) => { b.cyl(0.04, 0.035, 0.55, F, [-0.1, -0.3, 0], [0, 0, 0.15], 6); b.sphere(0.05, T, [0, 0, 0], null, 6); } }, // the arm up to the vine
    { part: FL, pivot: [0.12, -0.75, 0.05], build: (b) => b.cyl(0.04, 0.035, 0.45, F, [0.16, -0.95, 0.08], [0.3, 0, 0.3], 6) },
    { part: BL, pivot: [0.1, -0.95, -0.05], build: (b) => b.cyl(0.045, 0.04, 0.32, F, [0.1, -1.1, 0.0], [0.6, 0, 0], 6) },
    { part: BR, pivot: [-0.1, -0.95, -0.05], build: (b) => b.cyl(0.045, 0.04, 0.32, F, [-0.1, -1.1, 0.0], [0.6, 0, 0], 6) }];
}
// a Builder that adds everything dy lower
function shift(b, dy) {
  return new Proxy(b, { get(t, k) {
    const f = t[k];
    if (typeof f !== 'function') return f;
    const posArg = { box: 4, rbox: 5, cyl: 4, sphere: 2, cone: 3, torus: 3, capsule: 3, add: 2 }[k];
    if (posArg === undefined) return f.bind(t);
    return (...a) => { const p = a[posArg] || [0, 0, 0]; a[posArg] = [p[0], p[1] + dy, p[2]]; return f.apply(t, a); };
  } });
}
function hog() { // red river hog ~1.1 m
  const C = 0xc8562a, D = 0x2a1a1a;
  return rig([
    { build: (b) => { b.sphere(0.3, C, [0, 0.42, 0], [0.9, 0.85, 1.5], 12); b.sphere(0.3, 0xf2f2f2, [0, 0.66, -0.05], [0.08, 0.06, 0.95], 6); } },
    { part: HEAD, pivot: [0, 0.45, 0.35], build: (b) => {
      b.sphere(0.2, D, [0, 0.42, 0.5], [0.9, 0.9, 1.1], 10);
      b.cyl(0.08, 0.1, 0.18, D, [0, 0.36, 0.7], [Math.PI / 2, 0, 0], 8); b.sphere(0.08, 0xd88a8a, [0, 0.36, 0.79], [1, 0.9, 0.4], 8);
      for (const s of [-1, 1]) { b.cone(0.06, 0.16, C, [s * 0.13, 0.62, 0.43], [0, 0, -s * 0.4], 5); b.cone(0.03, 0.12, 0xffffff, [s * 0.16, 0.71, 0.42], [0, 0, -s * 0.4], 4); }
      for (const s of [-1, 1]) b.box(0.02, 0.02, 0.18, 0xffffff, [s * 0.11, 0.48, 0.56]);
      eyes(b, 0.1, 0.5, 0.62, 0.025);
    } },
    { part: TAIL, pivot: [0, 0.45, -0.42], build: (b) => b.cyl(0.015, 0.015, 0.2, C, [0, 0.4, -0.47], [0.4, 0, 0], 4) },
    ...legs(0.28, 0.14, 0.24, -0.24, 0.05, D),
  ]);
}
function capybara() { // ~1.1 m, sits low
  const C = 0x9a6a3a, D = 0x6a4a2a;
  return rig([
    { build: (b) => { b.sphere(0.32, C, [0, 0.45, 0], [0.95, 0.85, 1.45], 12); } },
    { part: HEAD, pivot: [0, 0.55, 0.35], build: (b) => {
      b.rbox(0.28, 0.3, 0.36, 0.11, C, [0, 0.6, 0.55]);
      b.sphere(0.07, D, [0, 0.58, 0.74], [1.6, 0.8, 0.6], 8);
      for (const s of [-1, 1]) b.sphere(0.045, D, [s * 0.1, 0.78, 0.45], null, 6);
      eyes(b, 0.12, 0.68, 0.62, 0.025);
    } },
    ...legs(0.24, 0.16, 0.25, -0.22, 0.06, C),
  ]);
}
function tapir() { // ~1.9 m, dark with a white saddle
  const D = 0x2a2a30, W = 0xf2f0ea;
  return rig([
    { build: (b) => { b.sphere(0.42, D, [0, 0.8, 0.25], [0.8, 0.85, 0.9], 12); b.sphere(0.45, W, [0, 0.82, -0.2], [0.82, 0.86, 0.8], 12); b.sphere(0.38, D, [0, 0.78, -0.55], [0.8, 0.85, 0.75], 12); } },
    { part: HEAD, pivot: [0, 0.85, 0.6], build: (b) => {
      b.sphere(0.24, D, [0, 0.85, 0.8], [0.85, 0.95, 1.2], 10);
      b.cyl(0.05, 0.08, 0.3, D, [0, 0.72, 1.08], [1.9, 0, 0], 7);
      for (const s of [-1, 1]) { b.sphere(0.07, D, [s * 0.14, 1.07, 0.7], [1, 1, 0.5], 6); b.sphere(0.04, W, [s * 0.14, 1.09, 0.72], [1, 1, 0.4], 5); }
      eyes(b, 0.12, 0.94, 0.94, 0.025);
    } },
    ...legs(0.6, 0.18, 0.45, -0.5, 0.08, D),
  ]);
}
function snake() { // python ~2.6 m, flat on the ground, nose at +1.3
  return rig([{ build: (b) => {
    const n = 22;
    for (let i = 0; i < n; i++) { const u = i / (n - 1), r = 0.075 * Math.sin(Math.PI * (0.15 + u * 0.75)) + 0.02; b.sphere(r, i % 4 < 2 ? 0x5aa83a : 0xe8c84a, [0, r, 1.15 - u * 2.5], [1, 0.8, 1.6], 7); }
    b.sphere(0.08, 0x5aa83a, [0, 0.07, 1.25], [1.2, 0.7, 1.4], 9);
    eyes(b, 0.06, 0.12, 1.31, 0.022);
    b.box(0.015, 0.006, 0.12, 0xe2304a, [0, 0.05, 1.42]);
  } }]);
}
function croc() { // ~3 m
  const G = 0x4f7a3a, L = 0xc8d48a, Wt = 0xffffff;
  return rig([
    { build: (b) => {
      b.sphere(0.36, G, [0, 0.3, 0], [0.95, 0.5, 2.0], 12);
      b.sphere(0.32, L, [0, 0.22, 0.05], [0.9, 0.35, 1.8], 10);
      for (let i = 0; i < 7; i++) for (const s of [-1, 1]) b.sphere(0.05, 0x3c6a2c, [s * 0.12, 0.47, 0.5 - i * 0.18], null, 5);
      b.rbox(0.36, 0.14, 0.75, 0.06, G, [0, 0.33, 0.95]);                 // upper jaw
      for (const s of [-1, 1]) { b.sphere(0.08, G, [s * 0.1, 0.45, 0.68], null, 8); b.sphere(0.05, 0xffe24a, [s * 0.1, 0.49, 0.72], null, 6); b.sphere(0.025, EYE, [s * 0.1, 0.5, 0.76], null, 5); }
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.cone(0.02, 0.06, Wt, [s * 0.15, 0.24, 0.72 + i * 0.12], [Math.PI, 0, 0], 4);
    } },
    { part: JAW, pivot: [0, 0.26, 0.6], build: (b) => b.rbox(0.34, 0.08, 0.72, 0.04, L, [0, 0.22, 0.96]) },
    { part: TAIL, pivot: [0, 0.3, -0.6], build: (b) => { for (let i = 0; i < 8; i++) b.sphere(0.2 - i * 0.022, G, [0, 0.28, -0.7 - i * 0.2], [0.8, 0.7, 1.3], 8); for (let i = 0; i < 6; i++) b.cone(0.04, 0.1, 0x3c6a2c, [0, 0.42 - i * 0.015, -0.7 - i * 0.22], null, 4); } },
    ...[[FL, 1, 0.45], [FR, -1, 0.45], [BL, 1, -0.45], [BR, -1, -0.45]].map(([p, s, z]) => ({ part: p, pivot: [s * 0.25, 0.25, z], build: (b) => b.cyl(0.06, 0.05, 0.3, G, [s * 0.38, 0.13, z], [0, 0, s * 0.9], 6) })),
  ]);
}
function bird(body, wing, beak, big) { // parrot / toucan, ~0.5 m
  return rig([
    { build: (b) => {
      b.sphere(0.12, body, [0, 0, 0], [0.85, 0.85, 1.6], 10);
      b.sphere(0.1, body, [0, 0.06, 0.2], null, 10);
      if (big) { b.sphere(0.07, 0xffffff, [0, 0.04, 0.27], [1.1, 1, 0.6], 8); b.cone(0.06, 0.3, beak, [0, 0.05, 0.42], [Math.PI / 2, 0, 0], 8); b.box(0.03, 0.02, 0.2, 0x2a2a2a, [0, 0.0, 0.42]); }
      else b.cone(0.04, 0.09, beak, [0, 0.03, 0.31], [Math.PI / 2 + 0.4, 0, 0], 6);
      b.box(0.1, 0.02, 0.28, wing, [0, 0, -0.3]); // tail feathers
      eyes(b, 0.06, 0.1, 0.24, 0.02);
    } },
    { part: WING_L, pivot: [0.08, 0.04, 0], build: (b) => b.sphere(0.2, wing, [0.24, 0.04, -0.03], [1, 0.12, 0.45], 8) },
    { part: WING_R, pivot: [-0.08, 0.04, 0], build: (b) => b.sphere(0.2, wing, [-0.24, 0.04, -0.03], [1, 0.12, 0.45], 8) },
  ]);
}

// ---- paths ---------------------------------------------------------------------------------------
// A closed loop round (hx, hz) of about radius r through clear ground, densified every ~1 m with
// the ground height: { pts: Float32Array [x, y, z]*, len } or null if no clear loop fits there.
function loop(R, rnd, hx, hz, r, ok, n = 9) {
  const wp = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, rr = r * (0.6 + rnd() * 0.5), x = hx + Math.cos(a) * rr, z = hz + Math.sin(a) * rr;
    if (!ok(x, z)) return null;
    wp.push([x, z]);
  }
  const pts = [];
  let prevY = null;
  for (let i = 0; i < n; i++) {
    const [ax, az] = wp[i], [bx, bz] = wp[(i + 1) % n], L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(L));
    for (let j = 0; j < k; j++) {
      const x = ax + (bx - ax) * j / k, z = az + (bz - az) * j / k, y = R.groundAt(x, z);
      if (prevY !== null && Math.abs(y - prevY) > 1.2) return null; // a cliff edge
      if (!ok(x, z, true)) return null;
      pts.push(x, y, z); prevY = y;
    }
  }
  return { pts: new Float32Array(pts), n: pts.length / 3 };
}
const _o = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
function along(path, s) { // position + heading at distance s (1 m spacing)
  const n = path.n, f = ((s % n) + n) % n, i = Math.floor(f), j = (i + 1) % n, k = f - i, P = path.pts;
  const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[j * 3], by = P[j * 3 + 1], bz = P[j * 3 + 2];
  _o.x = ax + (bx - ax) * k; _o.y = ay + (by - ay) * k; _o.z = az + (bz - az) * k;
  const dx = bx - ax, dz = bz - az;
  _o.yaw = Math.atan2(dx, dz); _o.pitch = Math.atan2(by - ay, Math.hypot(dx, dz) || 1);
  return _o;
}
// distance travelled by time t: walk for `walk` s, rest for `rest` s, at v m/s (phase-shifted)
function travelled(t, v, walk, rest, off) {
  const P = walk + rest, tt = t + off, c = Math.floor(tt / P), u = tt - c * P;
  return { s: v * (c * walk + Math.min(u, walk)), moving: u < walk, rest: u - walk };
}

// ---- build ---------------------------------------------------------------------------------------
export function buildAnimals(game, R) {
  const rnd = R.rng(404), S = {};
  const mk = (name, geo, max, opts = {}) => (S[name] = new Species(game, geo, { max, name, shadow: true, ...opts }));
  mk('tiger', cat(0xf08a2a, 0x2a1a1a, 0xfff2e0, 'stripes'), 4, { k: { LEG: 0.6 } });
  mk('leopard', cat(0xe8c060, 0x3a2a1a, 0xfff4dc, 'spots'), 4, { k: { LEG: 0.6 } });
  mk('monkey', rig(monkeyParts(false)), 16, { k: { LEG: 0.8, TAILA: 0.5 } });
  mk('monkeyHang', rig(monkeyParts(true)), 10, { k: { LEG: 0.4, TAILA: 0.5 } });
  mk('hog', hog(), 12, { k: { LEG: 0.7 } });
  mk('capybara', capybara(), 14, { k: { LEG: 0.6 } });
  mk('tapir', tapir(), 4, { k: { LEG: 0.5 } });
  mk('snake', snake(), 8, { mode: 'slither', k: { WAVEK: 4.5, WAVEA: 0.16 } });
  mk('croc', croc(), 8, { k: { LEG: 0.5, TAILA: 0.4, JAWA: 0.55 } });
  mk('parrot', bird(0xe8322b, 0x2a6ae8, 0xf2e6c4, false), 8, { k: { FLAP: 0.8 }, shadow: false });
  mk('toucan', bird(0x1c1c22, 0x1c1c22, 0xff9a1a, true), 6, { k: { FLAP: 0.8 }, shadow: false });
  const list = Object.values(S);

  // where land animals may walk
  const [bx0, bx1, bz0, bz1] = R.bounds;
  const land = (x, z, strict) => {
    if (x < bx0 + 30 || x > bx1 - 30 || z < bz0 + 30 || z > bz1 - 30) return false;
    if (x > VILLAGE.x0 - 8 && x < LAGOON.x1 + 6 && z > VILLAGE.z0 - 10 && z < VILLAGE.z1 + 28) return false;
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 30) return false;
    if (x > CLIFF.x0 - 6 && x < CLIFF.x1 + 10 && z > CLIFF.z0 - 16 && z < CLIFF.z1 + 6) return false;
    if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 5 || Math.hypot(x - GROVE.x, z - GROVE.z) < GROVE.r + 3) return false;
    if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 60) return false;
    if (polyDist(x, z, RIVER)[0] < 11 || polyDist(x, z, TRACK)[0] < 4 || polyDist(x, z, TRAIL)[0] < 4) return false;
    const h = R.groundAt(x, z);
    if (h < 1.0 || h > 24) return false;
    if (!strict && Math.abs(R.groundAt(x + 2, z) - h) + Math.abs(R.groundAt(x, z + 2) - h) > 1.6) return false;
    return true;
  };
  const animals = [];
  const place = (kind, count, r, v, walk, rest, opts = {}) => {
    for (let k = 0, tries = 0; k < count && tries < 400; tries++) {
      const hx = bx0 + 40 + rnd() * (bx1 - bx0 - 80), hz = bz0 + 40 + rnd() * (bz1 - bz0 - 80);
      if (opts.near && !opts.near(hx, hz)) continue;
      const path = loop(R, rnd, hx, hz, r, opts.ok || land);
      if (!path) continue;
      const group = opts.group || 1;
      for (let g = 0; g < group; g++) animals.push({ kind, path, v, walk, rest, off: rnd() * 100, back: g * (opts.gap || 1.4), side: g ? (rnd() - 0.5) * 0.8 : 0, x: hx, z: hz, s: (opts.size || 1) * (g && opts.young ? 0.75 : 1) * (0.92 + rnd() * 0.16), sound: opts.sound, hear: opts.hear || 10 });
      k++;
    }
  };
  const nearRiver = (x, z) => { const d = polyDist(x, z, RIVER)[0]; return d > 12 && d < 30; };
  const riverSide = (x, z) => polyDist(x, z, RIVER)[0] < 70;
  place('tiger', 2, 22, 1.5, 22, 16, { sound: 'growl', hear: 12 });
  place('leopard', 3, 18, 1.7, 18, 14, { sound: 'growl', hear: 10 });
  place('monkey', 4, 9, 1.8, 6, 5, { group: 3, gap: 1.1, young: true, sound: 'monkey', hear: 14 });
  place('hog', 2, 12, 1.1, 10, 6, { group: 4, gap: 1.2, young: true, sound: 'grunt', hear: 8 });
  place('capybara', 2, 6, 0.6, 6, 14, { group: 4, gap: 1.5, young: true, near: nearRiver, sound: 'squeak', hear: 6 });
  place('tapir', 3, 10, 0.9, 14, 10, { near: riverSide, sound: 'grunt', hear: 7 });
  place('snake', 5, 5, 0.5, 20, 12, { sound: 'hiss', hear: 5 });
  // crocodiles: drifting on the river (back and forth along a stretch) and basking on the banks
  const riverPts = (s0, s1) => { const pts = []; for (let s = s0; s <= s1; s += 1) pts.push(riverAt(s)); for (let s = s1; s >= s0; s -= 1) pts.push(riverAt(s, 2.5)); return { pts: new Float32Array(pts.flat()), n: pts.length }; };
  for (const [s0, s1] of [[60, 120], [150, 210], [230, 280]]) animals.push({ kind: 'croc', swim: true, path: riverPts(s0, s1), v: 0.7, walk: 40, rest: 12, off: rnd() * 50, back: 0, side: 0, s: 1.1, sound: 'snap', hear: 6 });
  for (const s of [95, 185, 262]) {
    const [x, , z] = riverAt(s, 0), [x2, , z2] = riverAt(s + 1, 0), nx = -(z2 - z), nz = x2 - x, l = Math.hypot(nx, nz) || 1, side = s % 2 ? 1 : -1;
    const bx = x + nx / l * 9 * side, bz = z + nz / l * 9 * side;
    animals.push({ kind: 'croc', bask: true, x: bx, z: bz, y: R.groundAt(bx, bz), yaw: Math.atan2(-nx * side, -nz * side), off: rnd() * 30, s: 1.2, sound: 'snap', hear: 6 });
  }
  function riverAt(s, lane = -2.5) { // point on the river centre line at arc length s (+ a lane offset), y at the water
    let acc = 0;
    for (let i = 0; i < RIVER.length - 1; i++) {
      const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (acc + L >= s || i === RIVER.length - 2) { const t = Math.min(1, (s - acc) / L), tx = (bx - ax) / L, tz = (bz - az) / L; return [ax + (bx - ax) * t - tz * lane, SEA_LEVEL - 0.18, az + (bz - az) * t + tx * lane]; }
      acc += L;
    }
  }
  // capybaras paddling in the river
  animals.push({ kind: 'capybara', swim: true, path: riverPts(20, 60), v: 0.45, walk: 60, rest: 0, off: 0, back: 0, side: 0, s: 1, sound: 'squeak', hear: 6 });
  animals.push({ kind: 'capybara', swim: true, path: riverPts(20, 60), v: 0.45, walk: 60, rest: 0, off: 0, back: 1.4, side: 0.4, s: 0.7 });
  // monkeys swinging on the vines of the round jungle trees
  const vines = [[1.6, 0.9, 3.2], [-1.5, -1.1, 2.6], [0.4, -1.9, 3.6]];
  const trees = (game.jungleTrees || []).filter(([k, x, , z]) => k === 'jtree2' && land(x, z, true));
  for (let i = 0; i < 8 && trees.length; i++) {
    const [, x, y, z, sc, co, si] = trees[(rnd() * trees.length) | 0], [lx, lz, l] = vines[(rnd() * 3) | 0];
    const hx = x + (lx * co + lz * si) * sc, hz = z + (-lx * si + lz * co) * sc, hy = y + (6.2 - l) * sc;
    animals.push({ kind: 'monkeyHang', x: hx, y: hy, z: hz, yaw: rnd() * 6.3, off: rnd() * 20, s: 1, sound: 'monkey', hear: 14 });
  }
  // birds circling over the canopy
  for (let i = 0; i < 12; i++) {
    const kind = i % 3 === 2 ? 'toucan' : 'parrot', a = rnd() * 6.3, d = rnd() * 220;
    const x = -560 + Math.cos(a) * d, z = 840 + Math.sin(a) * d;
    animals.push({ kind, fly: true, x, z, y: R.groundAt(x, z), r: 10 + rnd() * 18, w: (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.2), off: rnd() * 50, s: 1, sound: 'squawk', hear: 25 });
  }
  for (const a of animals) if (a.x === undefined) { a.x = a.path.pts[0]; a.z = a.path.pts[2]; }

  // ---- per frame ---------------------------------------------------------------------------------
  const cams = [], heard = new Map();
  const [cx, cz] = [(bx0 + bx1) / 2, (bz0 + bz1) / 2], span = Math.hypot(bx1 - bx0, bz1 - bz0) / 2 + SEE;
  const stats = game.jungleAnimals = { count: animals.length, shown: 0, species: S, list: animals };
  game.updaters.push((dt, t) => {
    cams.length = 0;
    for (const p of game.players) { const c = p.camera?.cam?.position; if (c && Math.hypot(c.x - cx, c.z - cz) < span) cams.push(c); }
    if (!cams.length && game.idleCam && !game.players.length) { const c = game.idleCam.position; if (Math.hypot(c.x - cx, c.z - cz) < span) cams.push(c); }
    if (!cams.length) { if (stats.shown) { for (const s of list) { s.begin(); s.end(); s.mesh.visible = false; } stats.shown = 0; } return; }
    for (const s of list) s.begin();
    let shown = 0;
    for (const a of animals) {
      let vis = false;
      for (const c of cams) if ((c.x - a.x) ** 2 + (c.z - a.z) ** 2 < (SEE + 40) ** 2) { vis = true; break; }
      if (!vis) continue;
      pose(a, t);
      shown++;
    }
    for (const s of list) { s.end(); s.mesh.visible = s.n > 0; }
    stats.shown = shown;
    // noises when a player comes close
    for (const p of game.players) {
      if (p.seat) continue;
      const c = p.chest.translation();
      for (const a of animals) {
        if (!a.sound || (c.x - a.x) ** 2 + (c.z - a.z) ** 2 > a.hear * a.hear) continue;
        const last = heard.get(a) || -99;
        if (t - last > 6 + hash(a.off) * 6) { heard.set(a, t); game.audio?.play(a.sound, { x: a.x, y: c.y, z: a.z }); a.startle = t; }
      }
    }
  });

  function pose(a, t) {
    const sp = S[a.kind];
    if (a.fly) { // birds: circles over the canopy, flapping, gliding now and then
      const ang = t * a.w + a.off, x = a.x + Math.cos(ang) * a.r, z = a.z + Math.sin(ang) * a.r, glide = Math.sin(t * 0.7 + a.off) > 0.4;
      const y = Math.max(a.y, R.groundAt(x, z)) + 15 + Math.sin(t * 0.5 + a.off) * 2;
      sp.put(x, y, z, Math.atan2(-Math.sin(ang) * a.w, Math.cos(ang) * a.w), 0, -Math.sign(a.w) * 0.35, a.s, glide ? 0.4 : t * 14 + a.off, glide ? 0.2 : 1);
      a.cur = [x, z];
      return;
    }
    if (a.kind === 'monkeyHang') { // swinging from the vine (the model's origin is its hand)
      const sw = Math.sin(t * 1.6 + a.off) * 0.45, kick = Math.sin(t * 3.2 + a.off);
      sp.put(a.x, a.y, a.z, a.yaw, 0, sw, a.s, t * 3 + a.off, 0.6 + 0.4 * kick);
      return;
    }
    if (a.bask) { // crocodile on the bank, jaws slowly opening (snaps when startled)
      const st = a.startle && t - a.startle < 1.2;
      sp.put(a.x, a.y, a.z, a.yaw, 0, 0, a.s, st ? (t - a.startle) * 30 : t * 0.4 + a.off, 0);
      return;
    }
    const tr = travelled(t, a.v, a.walk, a.rest, a.off);
    const o = along(a.path, tr.s - a.back);
    let y = o.y, pitch = o.pitch * 0.7, yaw = o.yaw, amp = tr.moving ? 1 : 0, ph = t * (a.v * 5 + 3) + a.off, roll = 0, sc = a.s;
    // walking side by side in a group
    if (a.side) { const cs = Math.cos(yaw), sn = Math.sin(yaw); o.x += cs * a.side; o.z -= sn * a.side; }
    if (a.swim) { y = SEA_LEVEL - (a.kind === 'croc' ? 0.36 : 0.42) * sc; pitch = 0; amp = 0.4; ph = t * 1.5 + a.off; }
    else if (!tr.moving) {
      // resting: big cats lie down, the others look about / root about
      if (a.kind === 'tiger' || a.kind === 'leopard') { const k = Math.min(1, tr.rest * 1.5); y -= 0.32 * k * sc; pitch = 0; }
      if (a.kind === 'capybara') y -= 0.12 * sc;
      yaw += Math.sin(t * 0.6 + a.off) * 0.25; ph = t * 1.4 + a.off; amp = a.kind === 'hog' ? 0.6 : 0.15;
    }
    if (a.kind === 'monkey' && tr.moving) y += Math.abs(Math.sin(ph)) * 0.18; // bounding gait
    if (a.kind === 'croc' && a.startle && t - a.startle < 1) ph = (t - a.startle) * 30; // snap!
    sp.put(o.x, y, o.z, yaw, pitch, roll, sc, ph, amp);
    a.x = o.x; a.z = o.z;
  }
}
