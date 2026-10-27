// Sculpted animal models (sculpt.js): one smooth rubber-toy surface each, painted with colour
// functions, eyes added as glossy beads. Facing +z, feet at y = 0, about 1 unit = 1 m.
// Each export returns { shapes, opts } (opts.extras: Builder parts for eyes, teeth, smiles).
// This file imports nothing that needs a page: the animal worker (animalworker.js) runs it to
// mesh the shapes off the main thread; animalgeo.js adds the extras. Used through
// animalgeo.js modelGeometry(name, ...args) by world/sealife.js and regions/jungle/animals.js.
import { FL, FR, BL, BR, TAIL, HEAD, WING_L, WING_R, JAW, TENT } from './rigparts.js';

// eyes / smiles are marks (snapped onto the surface in the worker, drawn by animalgeo.js MARKS)
const sculpt = (shapes, opts = {}) => {
  const ex = opts.extras || [];
  return { shapes, opts: { ...opts, marks: [...(opts.marks || []), ...ex.filter((e) => e.draw)], extras: ex.filter((e) => !e.draw) } };
};

// ---- helpers ------------------------------------------------------------------------------------
const INK = 0x16161e;
// a pair of glossy eyes on a surface point (x, y, z) mirrored in x, looking along +z (or `dir`)
function eyes(part, pivot, x, y, z, r, opts = {}) {
  // glossy cartoon eyes on the surface nearest (±x, y, z): opts.iris (coloured ring), opts.white
  // (eyeball), opts.brow (eyebrow tilt, angry > 0), opts.look (pupil toward the nose)
  return { draw: 'eye', at: [x, y, z], r: r * 1.15, part, pivot, iris: opts.iris, white: opts.white, brow: opts.brow, look: opts.look };
}
// a smile: half a torus, curving down
const smile = (part, pivot, r, t, pos) => ({ draw: 'smile', at: pos, mirror: false, w: r, t, curve: 0.35, part, pivot });
const hash3 = (a, b, c) => { const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); };
// spots: a jittered 3D cell pattern; returns 0 (no spot) .. 1 (spot centre)
function spots(x, y, z, cell, rad) {
  const ix = Math.floor(x / cell), iy = Math.floor(y / cell), iz = Math.floor(z / cell);
  let best = 9;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    const cx = (ix + a + 0.2 + hash3(ix + a, iy + b, iz + c) * 0.6) * cell, cy = (iy + b + 0.2 + hash3(iz + c, ix + a, iy + b) * 0.6) * cell, cz = (iz + c + 0.2 + hash3(iy + b, iz + c, ix + a) * 0.6) * cell;
    best = Math.min(best, Math.hypot(x - cx, y - cy, z - cz));
  }
  return best < rad ? 1 - best / rad : 0;
}
const lerpHex = (a, b, t) => { let o = 0; for (const sh of [16, 8, 0]) o |= Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh; return o; };
// four legs: hip (x, y, z) to foot, with a rounded paw
function legs4(front, back, top, w, r0, r1, color, paw) {
  const out = [];
  for (const [part, s, z, rr] of [[FL, 1, front, r0], [FR, -1, front, r0], [BL, 1, back, r0 * 1.15], [BR, -1, back, r0 * 1.15]]) {
    const pivot = [s * w, top, z];
    out.push({ s: 'limb', a: [s * w, top, z], b: [s * w * 1.05, r1 * 1.2, z + 0.02], ra: rr, rb: r1, color, part, pivot, k: 0.07 });
    out.push({ s: 'egg', c: [s * w * 1.05, r1 * 0.75, z + r1 * 0.5], r: [r1 * 1.15, r1 * 0.75, r1 * 1.45], color: paw ?? color, part, pivot, k: 0.05 });
  }
  return out;
}

// ---- big cats ---------------------------------------------------------------------------------------
export function bigCat(kind) {
  const tiger = kind === 'tiger';
  const BASE = tiger ? 0xf08a2a : 0xf0c868, CREAM = 0xfff3df, DARK = tiger ? 0x2a1c1c : 0x3a2818;
  const coat = (x, y, z) => {
    if (y > 0.42 && y < 0.6 && Math.abs(x) < 0.13 && z > -0.5 && z < 0.55) return CREAM; // belly
    if (tiger) { const st = Math.sin(z * 15 + Math.abs(x) * 4 + y * 3.5); return st > 0.72 && y > 0.3 ? DARK : BASE; }
    const sp = spots(x, y, z, 0.15, 0.065);
    return sp > 0.4 ? DARK : sp > 0.05 ? lerpHex(BASE, 0xc88a3a, 0.7) : BASE;
  };
  const face = (x, y, z) => (tiger && y > 1.16 && z > 0.8 && Math.sin(Math.abs(x) * 34 + 1) > 0.75 ? DARK : BASE);
  const hp = [0, 0.9, 0.62];
  return sculpt([
    { s: 'egg', c: [0, 0.72, 0.02], r: [0.3, 0.29, 0.62], color: coat, k: 0.12 },
    { s: 'egg', c: [0, 0.75, 0.38], r: [0.29, 0.31, 0.32], color: coat, k: 0.12 },
    { s: 'egg', c: [0, 0.73, -0.38], r: [0.28, 0.29, 0.3], color: coat, k: 0.12 },
    // neck + head
    { s: 'limb', a: [0, 0.82, 0.5], b: [0, 0.96, 0.76], ra: 0.2, rb: 0.17, color: coat, part: HEAD, pivot: hp, k: 0.1 },
    { s: 'ball', c: [0, 1.02, 0.86], r: 0.3, color: face, part: HEAD, pivot: hp, k: 0.08 },
    ...[1, -1].map((s) => ({ s: 'egg', c: [s * 0.15, 0.93, 0.98], r: [0.13, 0.1, 0.1], color: CREAM, part: HEAD, pivot: hp, k: 0.06 })), // cheeks
    { s: 'egg', c: [0, 0.93, 1.1], r: [0.12, 0.09, 0.09], color: CREAM, part: HEAD, pivot: hp, k: 0.06 },
    { s: 'egg', c: [0, 0.99, 1.18], r: [0.05, 0.035, 0.03], color: 0x5a2a3a, part: HEAD, pivot: hp, k: 0.02 },
    ...[1, -1].map((s) => ({ s: 'egg', c: [s * 0.18, 1.27, 0.8], r: [0.085, 0.09, 0.045], color: (x, y) => (y > 1.31 ? DARK : BASE), part: HEAD, pivot: hp, k: 0.04 })),
    // tail
    { s: 'chain', pts: [[0, 0.82, -0.6, 0.075], [0, 0.72, -0.95, 0.065], [0, 0.66, -1.25, 0.06], [0, 0.78, -1.5, 0.055]], color: (x, y, z) => (z < -1.38 || (tiger && Math.sin(z * 18) > 0.5) ? DARK : BASE), part: TAIL, pivot: [0, 0.8, -0.6], k: 0.06 },
    ...legs4(0.42, -0.44, 0.72, 0.17, 0.1, 0.075, coat, CREAM),
  ], { res: 84, colorSharp: 0.006, extras: [eyes(HEAD, hp, 0.11, 1.08, 1.13, 0.055)] });
}

// ---- monkey (on all fours, or hanging from a vine by one hand: the hand is the origin) ------------
export function monkey(hang) {
  const FUR = 0x7a4a2a, SKIN = 0xf0cfa4, hp = [0, 0.56, 0.18];
  const dy = hang ? -1.05 : 0, Y = (p) => [p[0], p[1] + dy, p[2]];
  const face = (x, y, z) => (z > 0.27 && y < 0.74 + dy ? SKIN : FUR);
  const sh = [
    { s: 'egg', c: Y([0, 0.44, 0]), r: [0.16, 0.19, 0.19], color: (x, y, z) => (z > 0.1 && Math.abs(x) < 0.1 ? SKIN : FUR), k: 0.08 },
    { s: 'ball', c: Y([0, 0.68, 0.2]), r: 0.17, color: face, part: HEAD, pivot: Y(hp), k: 0.06 },
    { s: 'egg', c: Y([0, 0.65, 0.31]), r: [0.12, 0.1, 0.07], color: SKIN, part: HEAD, pivot: Y(hp), k: 0.05 },
    { s: 'egg', c: Y([0, 0.6, 0.36]), r: [0.07, 0.05, 0.04], color: SKIN, part: HEAD, pivot: Y(hp), k: 0.03 },
    ...[1, -1].map((s) => ({ s: 'egg', c: Y([s * 0.18, 0.7, 0.18]), r: [0.035, 0.06, 0.055], color: SKIN, part: HEAD, pivot: Y(hp), k: 0.03 })),
    { s: 'chain', pts: [[0, 0.36, -0.16, 0.035], [0, 0.42, -0.4, 0.03], [0, 0.66, -0.5, 0.028], [0, 0.78, -0.38, 0.026], [0, 0.7, -0.3, 0.024]].map((p) => [p[0], p[1] + dy, p[2], p[3]]), color: FUR, part: TAIL, pivot: Y([0, 0.38, -0.16]), k: 0.04 },
  ];
  const limb = (part, a, b, ra, rb, hand) => { sh.push({ s: 'limb', a: Y(a), b: Y(b), ra, rb, color: FUR, part, pivot: Y(a), k: 0.06 }); sh.push({ s: 'ball', c: Y(b), r: rb * 1.25, color: hand ? SKIN : FUR, part, pivot: Y(a), k: 0.04 }); };
  if (!hang) {
    limb(FL, [0.11, 0.52, 0.1], [0.13, 0.05, 0.16], 0.055, 0.045, true);
    limb(FR, [-0.11, 0.52, 0.1], [-0.13, 0.05, 0.16], 0.055, 0.045, true);
    limb(BL, [0.1, 0.36, -0.08], [0.12, 0.05, -0.06], 0.065, 0.05, true);
    limb(BR, [-0.1, 0.36, -0.08], [-0.12, 0.05, -0.06], 0.065, 0.05, true);
  } else {
    sh.push({ s: 'limb', a: [-0.1, 0.55 + dy, 0.06], b: [-0.02, -0.05, 0], ra: 0.055, rb: 0.045, color: FUR, k: 0.06 }); // the arm up to the vine
    sh.push({ s: 'ball', c: [0, 0, 0], r: 0.055, color: SKIN, k: 0.04 });
    limb(FL, [0.11, 0.52, 0.1], [0.2, 0.18, 0.18], 0.055, 0.045, true);
    limb(BL, [0.1, 0.36, -0.08], [0.12, 0.02, 0.06], 0.065, 0.05, true);
    limb(BR, [-0.1, 0.36, -0.08], [-0.12, 0.02, 0.08], 0.065, 0.05, true);
  }
  return sculpt(sh, { res: 56, colorSharp: 0.006, extras: [eyes(HEAD, Y(hp), 0.055, 0.7 + dy, 0.345, 0.032)] });
}

export const monkeyHang = () => monkey(true);
export const tiger = () => bigCat('tiger');
export const leopard = () => bigCat('leopard');

// ---- river hog ------------------------------------------------------------------------------------
export function hog() {
  const RED = 0xd0602e, DARK = 0x2a1c1c, hp = [0, 0.48, 0.32];
  const coat = (x, y, z) => (Math.abs(x) < 0.035 && y > 0.6 ? 0xf6f2ea : RED);
  return sculpt([
    { s: 'egg', c: [0, 0.44, -0.02], r: [0.25, 0.26, 0.42], color: coat, k: 0.1 },
    { s: 'egg', c: [0, 0.45, 0.42], r: [0.17, 0.18, 0.2], color: (x, y, z) => (z > 0.42 && Math.abs(x) < 0.12 ? DARK : RED), part: HEAD, pivot: hp, k: 0.08 },
    { s: 'limb', a: [0, 0.4, 0.55], b: [0, 0.36, 0.72], ra: 0.09, rb: 0.08, color: DARK, part: HEAD, pivot: hp, k: 0.05 },
    { s: 'egg', c: [0, 0.36, 0.78], r: [0.075, 0.065, 0.025], color: 0xe89a9a, part: HEAD, pivot: hp, k: 0.02 },
    ...[1, -1].flatMap((s) => [
      { s: 'limb', a: [s * 0.1, 0.58, 0.38], b: [s * 0.17, 0.74, 0.34], ra: 0.05, rb: 0.015, color: RED, part: HEAD, pivot: hp, k: 0.03 },
      { s: 'ball', c: [s * 0.18, 0.77, 0.34], r: 0.025, color: 0xffffff, part: HEAD, pivot: hp, k: 0.02 },
      { s: 'limb', a: [s * 0.075, 0.34, 0.66], b: [s * 0.1, 0.4, 0.7], ra: 0.014, rb: 0.008, color: 0xfff8e8, part: HEAD, pivot: hp, k: 0.01 },
    ]),
    { s: 'chain', pts: [[0, 0.5, -0.42, 0.03], [0, 0.38, -0.5, 0.02]], color: RED, part: TAIL, pivot: [0, 0.5, -0.42], k: 0.03 },
    ...legs4(0.25, -0.26, 0.38, 0.14, 0.06, 0.045, (x, y) => (y < 0.24 ? DARK : RED)),
  ], { res: 60, colorSharp: 0.006, extras: [eyes(HEAD, hp, 0.09, 0.55, 0.6, 0.032)] });
}

// ---- capybara ---------------------------------------------------------------------------------------
export function capybara() {
  const C = 0xa8743e, D = 0x7a5230, hp = [0, 0.58, 0.32];
  return sculpt([
    { s: 'egg', c: [0, 0.45, 0], r: [0.26, 0.27, 0.42], color: C, k: 0.1 },
    { s: 'egg', c: [0, 0.6, 0.46], r: [0.15, 0.17, 0.22], color: C, part: HEAD, pivot: hp, k: 0.1 },
    { s: 'egg', c: [0, 0.56, 0.64], r: [0.13, 0.13, 0.1], color: C, part: HEAD, pivot: hp, k: 0.07 },
    { s: 'egg', c: [0, 0.58, 0.73], r: [0.07, 0.035, 0.02], color: D, part: HEAD, pivot: hp, k: 0.02 },
    ...[1, -1].map((s) => ({ s: 'ball', c: [s * 0.1, 0.78, 0.4], r: 0.04, color: D, part: HEAD, pivot: hp, k: 0.025 })),
    ...legs4(0.25, -0.24, 0.34, 0.15, 0.065, 0.05, C, D),
  ], { res: 56, extras: [eyes(HEAD, hp, 0.115, 0.69, 0.6, 0.026)] });
}

// ---- tapir --------------------------------------------------------------------------------------------
export function tapir() {
  const D = 0x2a2a32, W = 0xf4f2ec, hp = [0, 0.85, 0.58];
  const coat = (x, y, z) => (z > -0.5 && z < 0.08 && y > 0.5 ? W : D);
  return sculpt([
    { s: 'egg', c: [0, 0.8, 0.28], r: [0.32, 0.35, 0.42], color: coat, k: 0.14 },
    { s: 'egg', c: [0, 0.83, -0.32], r: [0.36, 0.38, 0.44], color: coat, k: 0.14 },
    { s: 'egg', c: [0, 0.84, 0.82], r: [0.17, 0.22, 0.26], color: D, part: HEAD, pivot: hp, k: 0.1 },
    { s: 'chain', pts: [[0, 0.8, 1.0, 0.1], [0, 0.72, 1.14, 0.075], [0, 0.6, 1.2, 0.06]], color: D, part: HEAD, pivot: hp, k: 0.06 },
    ...[1, -1].map((s) => ({ s: 'egg', c: [s * 0.14, 1.07, 0.7], r: [0.06, 0.08, 0.035], color: (x, y) => (y > 1.12 ? W : D), part: HEAD, pivot: hp, k: 0.03 })),
    ...legs4(0.42, -0.48, 0.62, 0.18, 0.085, 0.07, D),
  ], { res: 60, extras: [eyes(HEAD, hp, 0.12, 0.93, 0.98, 0.03)] });
}

// ---- python (lies along z, nose at +1.3) ------------------------------------------------------------
export function snake() {
  const G = 0x5aa83a, Yl = 0xf0d24a;
  const pts = [];
  for (let i = 0; i <= 16; i++) { const u = i / 16, r = 0.02 + 0.065 * Math.sin(Math.PI * Math.min(1, 0.1 + u * 0.95)); pts.push([0, r * 0.85, 1.12 - u * 2.45, r]); }
  return sculpt([
    { s: 'chain', pts, color: (x, y, z) => (Math.sin(z * 9) > 0.35 ? Yl : y < 0.04 ? 0xd8e8a0 : G), k: 0.04 },
    { s: 'egg', c: [0, 0.075, 1.2], r: [0.085, 0.06, 0.12], color: G, k: 0.05 },
  ], { cell: 0.016, extras: [eyes(0, [0, 0, 0], 0.05, 0.12, 1.27, 0.022), { build: (b) => { b.box(0.012, 0.005, 0.1, 0xe2304a, [0, 0.06, 1.36]); b.box(0.03, 0.005, 0.03, 0xe2304a, [0, 0.06, 1.42], [0, 0.78, 0]); } }] });
}

// ---- crocodile ---------------------------------------------------------------------------------------
export function croc() {
  const G = 0x4f8a3a, L = 0xd8e08a, B = 0x3c6e2c;
  const back = (x, y) => (y < 0.2 ? L : G);
  const sh = [
    { s: 'egg', c: [0, 0.28, 0], r: [0.3, 0.17, 0.72], color: back, k: 0.1 },
    { s: 'slab', c: [0, 0.3, 0.92], h: [0.12, 0.04, 0.3], r: 0.05, color: G, k: 0.1 },
    ...[1, -1].map((s) => ({ s: 'ball', c: [s * 0.1, 0.4, 0.65], r: 0.075, color: G, k: 0.05 })),
    { s: 'chain', pts: [[0, 0.28, -0.62, 0.2], [0, 0.26, -1.0, 0.14], [0, 0.24, -1.4, 0.08], [0, 0.23, -1.75, 0.03]], color: back, part: TAIL, pivot: [0, 0.28, -0.6], k: 0.1 },
    { s: 'slab', c: [0, 0.2, 0.92], h: [0.11, 0.025, 0.29], r: 0.04, color: L, part: JAW, pivot: [0, 0.24, 0.6], k: 0.03 },
  ];
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) sh.push({ s: 'ball', c: [s * 0.11, 0.43 - Math.max(0, i - 4) * 0.03, 0.45 - i * 0.2], r: 0.045, color: B, k: 0.03, ...(i > 5 ? { part: TAIL, pivot: [0, 0.28, -0.6] } : {}) });
  for (const [part, s, z] of [[FL, 1, 0.42], [FR, -1, 0.42], [BL, 1, -0.42], [BR, -1, -0.42]]) {
    sh.push({ s: 'limb', a: [s * 0.22, 0.25, z], b: [s * 0.4, 0.06, z + 0.05], ra: 0.075, rb: 0.055, color: G, part, pivot: [s * 0.22, 0.25, z], k: 0.06 });
    sh.push({ s: 'egg', c: [s * 0.42, 0.04, z + 0.1], r: [0.07, 0.035, 0.08], color: G, part, pivot: [s * 0.22, 0.25, z], k: 0.04 });
  }
  return sculpt(sh, { cell: 0.03, extras: [
    { build: (b) => { for (const s of [-1, 1]) { b.sphere(0.04, 0xffe24a, [s * 0.1, 0.45, 0.69], null, 10); b.sphere(0.022, INK, [s * 0.1, 0.46, 0.725], [0.6, 1.2, 0.6], 8); b.sphere(0.008, 0xffffff, [s * 0.108, 0.475, 0.735], null, 5); } for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.cone(0.018, 0.05, 0xffffff, [s * 0.14, 0.24, 0.75 + i * 0.1], [Math.PI, 0, 0], 5); } },
  ] });
}

// ---- birds ------------------------------------------------------------------------------------------
export function bird(kind) {
  const toucan = kind === 'toucan';
  const BODY = toucan ? 0x1c1c24 : 0xe8322b, WING = toucan ? 0x1c1c24 : 0x2f6ae8, WTIP = toucan ? 0x1c1c24 : 0xffd23f;
  const wing = (s, part) => ({ s: 'egg', c: [s * 0.2, 0.03, -0.03], r: [0.2, 0.022, 0.1], rot: [0, s * -0.25, 0], color: (x) => (Math.abs(x) > 0.3 ? WTIP : WING), part, pivot: [s * 0.07, 0.04, 0], k: 0.05 });
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.1, 0.1, 0.17], color: BODY, k: 0.07 },
    { s: 'ball', c: [0, 0.07, 0.15], r: 0.09, color: (x, y, z) => (toucan && z > 0.17 && y < 0.1 ? 0xffffff : BODY), k: 0.06 },
    toucan ? { s: 'egg', c: [0, 0.05, 0.36], r: [0.045, 0.065, 0.16], color: (x, y, z) => (z > 0.47 ? 0x1c1c24 : z > 0.3 ? 0xff9a1a : 0xffd23f), k: 0.03 }
      : { s: 'egg', c: [0, 0.03, 0.25], r: [0.03, 0.045, 0.045], color: 0xf2e6c4, k: 0.02 },
    { s: 'egg', c: [0, -0.01, -0.3], r: [0.05, 0.015, 0.16], color: toucan ? BODY : (x, y, z) => (z < -0.36 ? 0x2f6ae8 : BODY), k: 0.05 },
    wing(1, WING_L), wing(-1, WING_R),
  ], { cell: 0.012, extras: [eyes(0, [0, 0, 0], 0.07, 0.1, 0.215, 0.018)] });
}

// ---- sea: fish -------------------------------------------------------------------------------------
// tintable reef fish (the instance colour tints the white parts)
export function reefFish() {
  return sculpt([
    { s: 'egg', c: [0, 0, 0.02], r: [0.055, 0.13, 0.19], color: 0xffffff, k: 0.04 },
    { s: 'egg', c: [0, 0, -0.22], r: [0.022, 0.09, 0.06], color: 0xffffff, k: 0.05 },
    { s: 'egg', c: [0, 0.12, -0.02], r: [0.022, 0.05, 0.1], color: 0xffffff, k: 0.04 },
  ], { cell: 0.024, extras: [eyes(0, [0, 0, 0], 0.048, 0.035, 0.13, 0.022, { sparkle: false })] });
}
export function jelly() { // tinted
  const sh = [
    { s: 'egg', c: [0, 0.05, 0], r: [0.42, 0.32, 0.42], color: 0xffffff, k: 0.05 },
    { s: 'egg', c: [0, -0.18, 0], r: [0.36, 0.08, 0.36], color: 0xffffff, k: 0.08 },
  ];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = Math.cos(a) * 0.25, z = Math.sin(a) * 0.25; sh.push({ s: 'chain', pts: [[x, -0.2, z, 0.03], [x * 1.1, -0.55, z * 1.1, 0.022], [x * 0.9, -0.9, z * 0.9, 0.016], [x, -1.25, z, 0.01]], color: 0xffffff, part: TENT + i, pivot: [x, -0.2, z], k: 0.03 }); }
  sh.push({ s: 'chain', pts: [[0, -0.2, 0, 0.07], [0.04, -0.5, 0, 0.05], [-0.03, -0.8, 0.02, 0.03]], color: 0xffffff, part: TENT + 6, pivot: [0, -0.2, 0], k: 0.04 });
  return sculpt(sh, { cell: 0.04, extras: [eyes(0, [0, 0, 0], 0.11, 0.12, 0.38, 0.035)] });
}
export function octopus() {
  const C = 0xe0587e, L = 0xf6a0b8;
  const sh = [
    { s: 'egg', c: [0, 0.68, -0.1], r: [0.38, 0.46, 0.4], color: (x, y, z) => (spots(x, y, z, 0.24, 0.075) > 0.25 ? L : C), k: 0.12 },
    { s: 'egg', c: [0, 0.32, 0.02], r: [0.34, 0.2, 0.34], color: C, k: 0.15 },
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a), pts = [];
    for (let k = 0; k <= 6; k++) { const u = k / 6, out = 0.22 + u * 0.75, y = Math.max(0.07, 0.3 - u * 0.5) + Math.max(0, u - 0.7) * 0.6; pts.push([dx * out + Math.cos(a) * Math.max(0, u - 0.7) * 0.25, y, dz * out - Math.sin(a) * Math.max(0, u - 0.7) * 0.25, 0.09 - u * 0.065]); }
    sh.push({ s: 'chain', pts, color: (x, y) => (y < 0.06 ? L : C), part: TENT + i, pivot: [dx * 0.22, 0.3, dz * 0.22], k: 0.08 });
  }
  return sculpt(sh, { cell: 0.04, extras: [eyes(0, [0, 0, 0], 0.14, 0.52, 0.32, 0.06)] });
}
export function turtle() {
  const SH = 0x5f8a3a, SH2 = 0x7aa64a, SK = 0x9ac46a, PL = 0xe8d898;
  const shell = (x, y, z) => (y < -0.04 ? PL : spots(x, y * 0.4, z, 0.26, 0.11) > 0.15 ? SH2 : SH);
  return sculpt([
    { s: 'egg', c: [0, 0.02, 0], r: [0.58, 0.24, 0.7], color: shell, k: 0.06 },
    { s: 'egg', c: [0, -0.07, 0.02], r: [0.52, 0.12, 0.64], color: PL, k: 0.06 },
    { s: 'limb', a: [0, 0, 0.6], b: [0, 0.05, 0.82], ra: 0.12, rb: 0.13, color: SK, part: HEAD, pivot: [0, 0, 0.6], k: 0.08 },
    { s: 'ball', c: [0, 0.07, 0.92], r: 0.17, color: SK, part: HEAD, pivot: [0, 0, 0.6], k: 0.08 },
    { s: 'egg', c: [0.72, -0.04, 0.38], r: [0.35, 0.04, 0.14], rot: [0, 0.5, 0], color: SK, part: WING_L, pivot: [0.45, 0, 0.4], k: 0.08 },
    { s: 'egg', c: [-0.72, -0.04, 0.38], r: [0.35, 0.04, 0.14], rot: [0, -0.5, 0], color: SK, part: WING_R, pivot: [-0.45, 0, 0.4], k: 0.08 },
    { s: 'egg', c: [0.42, -0.05, -0.62], r: [0.15, 0.04, 0.12], rot: [0, -0.5, 0], color: SK, part: BL, pivot: [0.35, 0, -0.5], k: 0.06 },
    { s: 'egg', c: [-0.42, -0.05, -0.62], r: [0.15, 0.04, 0.12], rot: [0, 0.5, 0], color: SK, part: BR, pivot: [-0.35, 0, -0.5], k: 0.06 },
  ], { cell: 0.04, extras: [eyes(HEAD, [0, 0, 0.6], 0.1, 0.13, 1.04, 0.035)] });
}
export function manta() { // ~3 m span
  const TOP = 0x2e3550, BEL = 0xf0f0f8;
  const paint = (x, y) => (y < -0.01 ? BEL : TOP);
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.42, 0.13, 0.55], color: paint, k: 0.12 },
    { s: 'egg', c: [0.95, 0, -0.1], r: [0.7, 0.075, 0.32], rot: [0, -0.35, 0], color: paint, part: WING_L, pivot: [0.35, 0, 0], k: 0.2 },
    { s: 'egg', c: [-0.95, 0, -0.1], r: [0.7, 0.075, 0.32], rot: [0, 0.35, 0], color: paint, part: WING_R, pivot: [-0.35, 0, 0], k: 0.2 },
    ...[1, -1].map((s) => ({ s: 'egg', c: [s * 0.24, -0.02, 0.6], r: [0.05, 0.035, 0.16], rot: [0, s * 0.3, 0], color: TOP, k: 0.06 })),
    { s: 'chain', pts: [[0, 0, -0.5, 0.04], [0, 0, -1.2, 0.02], [0, 0, -1.8, 0.008]], color: TOP, part: TAIL, pivot: [0, 0, -0.5], k: 0.04 },
  ], { cell: 0.032, extras: [eyes(0, [0, 0, 0], 0.36, 0.06, 0.46, 0.035)] });
}
export function seaStar() { // tinted
  const sh = [{ s: 'egg', c: [0, 0.04, 0], r: [0.1, 0.045, 0.1], color: 0xffffff, k: 0.05 }];
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; sh.push({ s: 'limb', a: [0, 0.04, 0], b: [Math.sin(a) * 0.27, 0.025, Math.cos(a) * 0.27], ra: 0.07, rb: 0.025, color: 0xffffff, k: 0.05 }); }
  return sculpt(sh, { cell: 0.022, extras: [{ build: (b) => { for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; for (const d of [0.1, 0.17]) b.sphere(0.012, 0xfff2d8, [Math.sin(a) * d, 0.08 - d * 0.15, Math.cos(a) * d], null, 5); } } }] });
}
export function crab() {
  const R = 0xe2452f, D = 0xc8361f;
  const sh = [
    { s: 'egg', c: [0, 0.17, 0], r: [0.22, 0.1, 0.16], color: R, k: 0.05 },
    ...[1, -1].flatMap((s) => [
      { s: 'limb', a: [s * 0.07, 0.24, 0.1], b: [s * 0.07, 0.34, 0.12], ra: 0.016, rb: 0.016, color: R, k: 0.02 },
      { s: 'limb', a: [s * 0.15, 0.15, 0.1], b: [s * 0.27, 0.16, 0.24], ra: 0.035, rb: 0.03, color: R, k: 0.04 },
      { s: 'egg', c: [s * 0.3, 0.17, 0.31], r: [0.06, 0.05, 0.08], color: R, k: 0.03 },
    ]),
  ];
  for (const [part, s] of [[FL, 1], [FR, -1], [BL, 1], [BR, -1]]) for (const z of (part === FL || part === FR ? [0.06, -0.02] : [-0.08])) sh.push({ s: 'chain', pts: [[s * 0.18, 0.14, z, 0.02], [s * 0.3, 0.2, z - 0.02, 0.017], [s * 0.38, 0.02, z - 0.04, 0.012]], color: D, part, pivot: [s * 0.18, 0.14, z], k: 0.025 });
  return sculpt(sh, { cell: 0.018, extras: [{ build: (b) => { for (const s of [-1, 1]) { b.sphere(0.026, 0xffffff, [s * 0.07, 0.36, 0.125], null, 10); b.sphere(0.015, INK, [s * 0.07, 0.365, 0.145], null, 8); } } }] });
}
export function seahorse() {
  const C = 0xff9a3f, pts = [];
  for (let i = 0; i <= 10; i++) { const u = i / 10, a = u * 2.2; pts.push([0, 0.26 - u * 0.42 - Math.max(0, u - 0.7) * 0.1, Math.sin(a) * 0.05 + (u > 0.7 ? (u - 0.7) * 0.25 : 0), 0.07 * (1 - u * 0.75)]); }
  return sculpt([
    { s: 'chain', pts, color: (x, y, z) => (z > 0.04 && y > -0.05 ? 0xffc06a : C), k: 0.04 },
    { s: 'egg', c: [0, 0.33, 0.03], r: [0.055, 0.07, 0.07], color: C, k: 0.04 },
    { s: 'limb', a: [0, 0.33, 0.07], b: [0, 0.31, 0.17], ra: 0.025, rb: 0.022, color: C, k: 0.02 },
    { s: 'egg', c: [0, 0.16, -0.08], r: [0.01, 0.05, 0.04], color: 0xffc06a, k: 0.02 },
  ], { cell: 0.014, extras: [eyes(0, [0, 0, 0], 0.045, 0.35, 0.06, 0.016, { sparkle: false })] });
}
export function plesiosaur() { // ~7 m
  const G = 0x4f9a7a, L = 0xc8ebd2, hp = [0, 0.3, 1.4];
  const paint = (x, y) => (y < -0.25 ? L : G);
  const neck = [];
  for (let i = 0; i <= 8; i++) { const k = i / 8; neck.push([0, 0.3 + Math.sin(k * 1.6) * 1.9, 1.3 + k * 2.0, 0.42 - k * 0.2]); }
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [1.0, 0.7, 1.6], color: (x, y, z) => (y < -0.25 ? L : spots(x, y, z, 0.6, 0.2) > 0.2 ? 0x3c7a5e : G), k: 0.2 },
    { s: 'chain', pts: [[0, 0.05, -1.4, 0.4], [0, 0.05, -2.2, 0.22], [0, 0.1, -2.9, 0.06]], color: paint, k: 0.2 },
    { s: 'chain', pts: neck, color: paint, part: HEAD, pivot: hp, k: 0.15 },
    { s: 'egg', c: [0, 2.3, 3.5], r: [0.3, 0.27, 0.42], color: paint, part: HEAD, pivot: hp, k: 0.12 },
    { s: 'egg', c: [1.45, -0.35, 0.55], r: [0.75, 0.08, 0.28], rot: [0, -0.35, -0.15], color: G, part: WING_L, pivot: [0.8, -0.2, 0.6], k: 0.2 },
    { s: 'egg', c: [-1.45, -0.35, 0.55], r: [0.75, 0.08, 0.28], rot: [0, 0.35, 0.15], color: G, part: WING_R, pivot: [-0.8, -0.2, 0.6], k: 0.2 },
    { s: 'egg', c: [1.15, -0.35, -0.9], r: [0.55, 0.07, 0.22], rot: [0, 0.4, -0.15], color: G, part: BL, pivot: [0.7, -0.2, -0.8], k: 0.18 },
    { s: 'egg', c: [-1.15, -0.35, -0.9], r: [0.55, 0.07, 0.22], rot: [0, -0.4, 0.15], color: G, part: BR, pivot: [-0.7, -0.2, -0.8], k: 0.18 },
  ], { res: 72, extras: [eyes(HEAD, hp, 0.2, 2.42, 3.82, 0.06), smile(HEAD, hp, 0.12, 0.018, [0, 2.26, 3.87], -0.3)] });
}


// ---- sea, matched to assets/reference/animals/ (round 16 turnarounds) ----------------------------
// fins are inflated triangles ('tri'), blended into the body with a small k

// shark.png: ~2.8 m, nose at z +1.4. Deep chest tapering hard to the tail, pointed snout, slate
// top over a white belly with a ragged edge up to mid-flank, tall swept dorsal, crescent tail
// (upper lobe longer), long swept pectorals, gill slits, angry brows and a toothy grin.
export function shark() {
  const TOP = 0x7189a8, BEL = 0xf8f6f0, FIN = 0x637c9c;
  const paint = (x, y, z) => (y < 0.02 + 0.05 * Math.sin(z * 13) + 0.03 * Math.sin(z * 29) - Math.max(0, z - 0.9) * 0.25 ? BEL : TOP);
  return sculpt([
    { s: 'egg', c: [0, 0, 0.32], r: [0.37, 0.45, 1.0], color: paint, k: 0.12 },
    { s: 'egg', c: [0, 0.02, 1.0], r: [0.27, 0.28, 0.48], color: paint, k: 0.22 },                                     // snout
    { s: 'limb', a: [0, 0.02, -0.25], b: [0, 0.08, -1.22], ra: 0.32, rb: 0.075, color: paint, k: 0.2 },
    { s: 'tri', pts: [[0, 0.32, 0.42], [0, 0.34, -0.12], [0, 0.95, -0.22]], r: 0.054, color: FIN, k: 0.12 },          // dorsal
    { s: 'tri', pts: [[0, 0.08, -1.12], [0, 0.12, -1.3], [0, 0.85, -1.62]], r: 0.047, color: FIN, k: 0.06 },     // tail, upper lobe
    { s: 'tri', pts: [[0, 0.04, -1.12], [0, 0.06, -1.3], [0, -0.48, -1.5]], r: 0.047, color: FIN, k: 0.06 },     // lower lobe
    { s: 'tri', pts: [[0, 0.2, -0.82], [0, 0.2, -0.96], [0, 0.36, -1.0]], r: 0.027, color: FIN, k: 0.04 },             // 2nd dorsal
    { s: 'tri', pts: [[0, -0.18, -0.8], [0, -0.18, -0.94], [0, -0.32, -0.98]], r: 0.027, color: FIN, k: 0.04 },         // anal
    ...[1, -1].map((s) => ({ s: 'tri', pts: [[s * 0.24, -0.2, 0.68], [s * 0.24, -0.24, 0.36], [s * 0.88, -0.72, -0.02]], r: 0.043, color: FIN, part: s > 0 ? WING_L : WING_R, pivot: [s * 0.24, -0.22, 0.52], k: 0.09 })),
    ...[1, -1].map((s) => ({ s: 'tri', pts: [[s * 0.12, -0.3, -0.35], [s * 0.12, -0.3, -0.52], [s * 0.32, -0.5, -0.62]], r: 0.027, color: FIN, k: 0.04 })),
  ], { res: 96, colorSharp: 0.008, marks: [
    { draw: 'eye', at: [0.2, 0.17, 1.02], r: 0.075, white: true, brow: 0.45, look: 0.25 },
    { draw: 'smile', at: [0, -0.12, 1.28], mirror: false, w: 0.2, t: 0.018, curve: 0.2, lift: 0.25, color: 0x6a2030 },
    { draw: 'teeth', at: [0, -0.12, 1.28], mirror: false, w: 0.2, n: 10, s: 0.022, curve: 0.2, lift: 0.25 },
    { draw: 'gills', at: [0.33, 0.06, 0.62], n: 4, gap: 0.065, l: 0.15, t: 0.009, color: 0x4d6282 },
  ] });
}


// dolphin.png: ~2.2 m. Grey top, lighter wavy band along the flank, cream belly and chin, round
// melon, short beak, curved dorsal, swept flukes, big friendly eyes and a smile.
export function dolphin() {
  const TOP = 0x7a8ea2, BAND = 0xb0c2d0, BEL = 0xf6f0e4, FIN = 0x718599;
  const paint = (x, y, z) => (y < -0.1 + 0.06 * Math.sin(z * 3.5 + 0.5) ? BEL : y < 0.07 + 0.07 * Math.sin(z * 4 + 1) && Math.abs(x) > 0.12 ? BAND : TOP);
  return sculpt([
    { s: 'egg', c: [0, 0, 0.05], r: [0.29, 0.31, 0.82], color: paint, k: 0.1 },
    { s: 'ball', c: [0, 0.06, 0.6], r: 0.27, color: paint, k: 0.22 },                                        // melon
    { s: 'limb', a: [0, -0.07, 0.78], b: [0, -0.09, 1.1], ra: 0.12, rb: 0.075, color: (x, y) => (y < -0.1 ? BEL : 0x7d91a5), k: 0.08 },
    { s: 'limb', a: [0, 0, -0.5], b: [0, 0.03, -0.95], ra: 0.2, rb: 0.065, color: paint, k: 0.14 },
    ...[1, -1].map((s) => ({ s: 'tri', pts: [[0, 0.03, -0.88], [s * 0.42, 0.03, -1.1], [s * 0.1, 0.03, -1.14]], r: 0.034, color: FIN, k: 0.05 })),
    { s: 'tri', pts: [[0, 0.24, 0.14], [0, 0.26, -0.22], [0, 0.58, -0.28]], r: 0.041, color: FIN, k: 0.09 },
    ...[1, -1].map((s) => ({ s: 'tri', pts: [[s * 0.2, -0.16, 0.44], [s * 0.21, -0.18, 0.24], [s * 0.6, -0.44, 0.08]], r: 0.034, color: FIN, part: s > 0 ? WING_L : WING_R, pivot: [s * 0.2, -0.16, 0.34], k: 0.07 })),
  ], { res: 96, colorSharp: 0.008, marks: [
    { draw: 'eye', at: [0.22, 0.07, 0.74], r: 0.07, white: true, iris: 0x6a3a1a, look: 0.25 },
    { draw: 'smile', at: [0, -0.07, 1.02], mirror: false, w: 0.12, t: 0.012, curve: 0.35 },
  ] });
}


// whale.png: humpback ~9 m. Broad flat knobbly head, girth well forward, a long taper to the
// flukes; navy top, cream grooved throat and belly with navy blotches, small dorsal hump, very
// long white flippers with dark spots, flukes white underneath.
export function whale() {
  const TOP = 0x3e5b86, CR = 0xf2ecde, DK = 0x2f4468;
  const belly = (x, y, z) => {
    if (y > -0.2 + 0.18 * Math.sin(z * 1.3 + 1) - Math.max(0, -z - 1) * 0.15) return TOP;
    if (z < 1.6 && spots(x, y, z, 0.75, 0.24) > 0.15) return DK;
    return z > 0.6 && Math.sin(x * 10) > 0.6 ? 0xcfc6b4 : CR; // throat grooves
  };
  const flip = (x, y, z) => (spots(x, y, z, 0.55, 0.16) > 0.2 || (Math.abs(x) < 1.6 && y > -0.85) ? DK : CR);
  const quad = (A, B, C, D, o) => [{ s: 'tri', pts: [A, B, C], ...o }, { s: 'tri', pts: [A, C, D], ...o }];
  const sh = [
    { s: 'egg', c: [0, 0, 0.9], r: [1.1, 0.98, 3.2], color: belly, k: 0.5 },
    { s: 'egg', c: [0, 0.0, 3.35], r: [1.0, 0.62, 1.45], color: belly, k: 0.6 },                                 // long flat head
    { s: 'egg', c: [0, -0.35, 2.4], r: [0.98, 0.72, 2.2], color: belly, k: 0.5 },                                // throat
    { s: 'limb', a: [0, 0.0, -1.2], b: [0, 0.22, -4.1], ra: 0.85, rb: 0.2, color: belly, k: 0.6 },
    { s: 'tri', pts: [[0, 0.68, -1.5], [0, 0.68, -2.2], [0, 1.08, -2.25]], r: 0.09, color: TOP, k: 0.3 },        // dorsal hump
    ...[1, -1].flatMap((s) => quad([0, 0.22, -3.9], [s * 0.9, 0.26, -4.2], [s * 2.5, 0.28, -4.75], [s * 0.5, 0.22, -4.95], { r: 0.1, color: (x, y) => (y < 0.2 ? CR : TOP), k: 0.2 })), // flukes
    ...[1, -1].flatMap((s) => quad([s * 0.85, -0.45, 2.3], [s * 0.85, -0.62, 1.2], [s * 3.3, -1.75, -0.65], [s * 3.6, -1.62, 0.25], { r: 0.13, color: flip, part: s > 0 ? WING_L : WING_R, pivot: [s * 0.85, -0.55, 1.75], k: 0.3 })),
  ];
  for (let i = 0; i < 16; i++) { const z = 2.6 + (i % 8) * 0.28, x = (i < 8 ? 1 : -1) * (0.2 + ((i * 5) % 3) * 0.24); sh.push({ s: 'ball', c: [x, 0.6 - (z - 2.6) * 0.06, z], r: 0.11, color: DK, k: 0.1 }); }
  return sculpt(sh, { res: 96, colorSharp: 0.03, marks: [
    { draw: 'eye', at: [0.9, 0.0, 2.75], r: 0.18, white: true, iris: 0x9a6a1a, look: 0.15 },
    { draw: 'smile', at: [0.75, -0.2, 3.6], w: 0.9, t: 0.035, curve: -0.05, color: 0x22324e },
  ] });
}


// pufferfish.png: puffed ball, golden top with brown spots, cream belly, little cream spikes,
// fan fins and tail, big amber eyes, puckered lips
export function puffer() {
  const GOLD = 0xe8b44a, CR = 0xf6ead0, SPOT = 0xa8783a, FINC = 0xf0c45a;
  const skin = (x, y, z) => (y < -0.05 + 0.03 * Math.sin(z * 20) ? CR : spots(x, y, z, 0.085, 0.032) > 0.15 ? SPOT : GOLD);
  const sh = [
    { s: 'egg', c: [0, 0, 0], r: [0.22, 0.21, 0.25], color: skin, k: 0.04 },
    { s: 'limb', a: [0, 0, -0.2], b: [0, 0, -0.3], ra: 0.08, rb: 0.05, color: skin, k: 0.05 },
    { s: 'ball', c: [0, -0.02, 0.255], r: 0.035, color: 0xe8a84a, k: 0.03 },                                    // lips
    { s: 'tri', pts: [[0, 0, -0.29], [0, 0.13, -0.42], [0, -0.13, -0.42]], r: 0.012, color: FINC, k: 0.03 },    // tail fan
    { s: 'tri', pts: [[0, 0.17, -0.06], [0, 0.17, -0.16], [0, 0.3, -0.16]], r: 0.01, color: FINC, k: 0.03 },
    { s: 'tri', pts: [[0, -0.17, -0.06], [0, -0.17, -0.16], [0, -0.28, -0.16]], r: 0.01, color: FINC, k: 0.03 },
    ...[1, -1].map((s) => ({ s: 'tri', pts: [[s * 0.2, -0.02, 0.04], [s * 0.2, -0.05, -0.02], [s * 0.3, -0.08, -0.06]], r: 0.012, color: FINC, part: s > 0 ? WING_L : WING_R, pivot: [s * 0.2, -0.03, 0.02], k: 0.03 })),
  ];
  for (let i = 0; i < 40; i++) { // spikes on a Fibonacci sphere, not on the face
    const yv = 1 - (i + 0.5) / 20, rr = Math.sqrt(Math.max(0, 1 - yv * yv)), a = i * 2.39996;
    const d = [Math.cos(a) * rr, yv, Math.sin(a) * rr];
    if (d[2] > 0.75 || Math.abs(yv) > 0.97) continue;
    sh.push({ s: 'limb', a: [d[0] * 0.2, d[1] * 0.19, d[2] * 0.23], b: [d[0] * 0.28, d[1] * 0.27, d[2] * 0.31], ra: 0.016, rb: 0.003, color: CR, k: 0.01 });
  }
  return sculpt(sh, { cell: 0.016, colorSharp: 0.004, extras: [eyes(0, [0, 0, 0], 0.105, 0.07, 0.205, 0.038, { white: true, iris: 0xe0a020 })] });
}

// reef_fish.png (each ~0.4 m long, nose at +0.2)
const fishEyes = (x, y, z, r = 0.02) => eyes(0, [0, 0, 0], x, y, z, r, { white: true, iris: 0x9a5a1a, sparkle: false });
export function clownfish() {
  const O = 0xff7a1a, W = 0xffffff, K = 0x1c1c22;
  const bands = (x, y, z) => { for (const [a, b] of [[0.075, 0.115], [-0.04, 0.0], [-0.16, -0.14]]) { if (z > a - 0.01 && z < b + 0.01) return z > a && z < b ? W : K; } return O; };
  const rim = (cy, cz, R) => (x, y, z) => (Math.hypot((y - cy) * 1.2, z - cz) > R ? K : O); // rounded fins with black rims
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.055, 0.085, 0.16], color: bands, k: 0.03 },
    { s: 'egg', c: [0, 0.095, 0.02], r: [0.014, 0.045, 0.05], rot: [-0.3, 0, 0], color: rim(0.08, 0.02, 0.05), k: 0.025 },     // front dorsal
    { s: 'egg', c: [0, 0.085, -0.085], r: [0.014, 0.045, 0.055], rot: [-0.5, 0, 0], color: rim(0.07, -0.08, 0.05), k: 0.025 }, // back dorsal
    { s: 'egg', c: [0, -0.08, -0.07], r: [0.014, 0.04, 0.045], rot: [0.5, 0, 0], color: rim(-0.07, -0.07, 0.04), k: 0.025 },   // anal
    { s: 'egg', c: [0, 0, -0.205], r: [0.015, 0.075, 0.06], color: rim(0, -0.19, 0.06), k: 0.03 },                             // tail
    ...[1, -1].map((s) => ({ s: 'egg', c: [s * 0.065, -0.03, 0.02], r: [0.012, 0.03, 0.045], rot: [0.3, s * 0.4, 0], color: rim(-0.03, 0.02, 0.035), k: 0.02 })),
  ], { cell: 0.01, colorSharp: 0.003, extras: [fishEyes(0.042, 0.025, 0.11)] });
}
export function blueTang() {
  const B = 0x2a5ae0, K = 0x16182a, Y = 0xffd400;
  const body = (x, y, z) => {
    if (z < -0.13) return Y;
    // the black 'palette': a band from the eye curving back along the top, with a blue patch inside
    const d = Math.abs(y - (0.035 + 0.05 * Math.sin((z + 0.05) * 9)));
    return d < 0.028 && z < 0.08 && !(Math.abs(y - 0.035) < 0.012 && z < -0.02 && z > -0.08) ? K : B;
  };
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.05, 0.11, 0.16], color: body, k: 0.03 },
    { s: 'egg', c: [0, -0.01, 0.13], r: [0.04, 0.06, 0.06], color: B, k: 0.04 },
    { s: 'tri', pts: [[0, 0.09, 0.08], [0, 0.07, -0.13], [0, 0.15, -0.05]], r: 0.01, color: (x, y) => (y > 0.13 ? K : B), k: 0.02 },
    { s: 'tri', pts: [[0, -0.08, 0.02], [0, -0.06, -0.13], [0, -0.13, -0.07]], r: 0.01, color: (x, y) => (y < -0.115 ? K : B), k: 0.02 },
    { s: 'tri', pts: [[0, 0, -0.14], [0, 0.09, -0.26], [0, -0.09, -0.26]], r: 0.012, color: (x, y, z) => (z < -0.235 ? K : Y), k: 0.02 },
    ...[1, -1].map((s) => ({ s: 'tri', pts: [[s * 0.045, -0.01, 0.04], [s * 0.045, -0.04, 0.0], [s * 0.09, -0.04, -0.05]], r: 0.009, color: Y, k: 0.02 })),
  ], { cell: 0.012, colorSharp: 0.003, extras: [fishEyes(0.038, 0.025, 0.115)] });
}
export function yellowTang() {
  const Y = 0xffde1a, Wt = 0xffffff;
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.045, 0.12, 0.13], color: Y, k: 0.03 },
    { s: 'limb', a: [0, 0.0, 0.1], b: [0, -0.01, 0.2], ra: 0.045, rb: 0.022, color: Y, k: 0.04 },         // snout
    { s: 'tri', pts: [[0, 0.1, 0.07], [0, 0.07, -0.12], [0, 0.22, -0.04]], r: 0.01, color: Y, k: 0.02 },
    { s: 'tri', pts: [[0, -0.1, 0.03], [0, -0.07, -0.12], [0, -0.2, -0.06]], r: 0.01, color: Y, k: 0.02 },
    { s: 'tri', pts: [[0, 0, -0.12], [0, 0.09, -0.24], [0, -0.09, -0.24]], r: 0.012, color: Y, k: 0.02 },
    ...[1, -1].map((s) => ({ s: 'tri', pts: [[s * 0.04, -0.01, 0.04], [s * 0.04, -0.04, 0.0], [s * 0.085, -0.04, -0.05]], r: 0.009, color: Y, k: 0.02 })),
    { s: 'ball', c: [0.04, 0.0, -0.1], r: 0.008, color: Wt, k: 0.005 }, { s: 'ball', c: [-0.04, 0.0, -0.1], r: 0.008, color: Wt, k: 0.005 }, // tail spine
  ], { cell: 0.012, colorSharp: 0.003, extras: [fishEyes(0.033, 0.035, 0.085)] });
}
export function moorishIdol() { // the striped 'angelfish' with the long trailing dorsal
  const C = 0xf6eccb, K = 0x16161e, Y = 0xffd23f;
  const bands = (x, y, z) => { const u = z + y * 0.25; return (u > 0.03 && u < 0.08) || (u > -0.1 && u < -0.04) || z < -0.16 ? K : (u > -0.04 && u < -0.02 && y > 0.05 ? Y : C); };
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.035, 0.13, 0.12], color: bands, k: 0.03 },
    { s: 'limb', a: [0, -0.01, 0.09], b: [0, -0.02, 0.19], ra: 0.035, rb: 0.015, color: C, k: 0.03 },       // snout
    { s: 'tri', pts: [[0, 0.1, 0.06], [0, 0.11, -0.05], [0, 0.32, -0.3]], r: 0.009, color: (x, y) => (y > 0.22 ? Y : bands(x, y, 0.05)), k: 0.02 }, // trailing dorsal
    { s: 'tri', pts: [[0, -0.1, 0.03], [0, -0.09, -0.08], [0, -0.22, -0.12]], r: 0.009, color: K, k: 0.02 },
    { s: 'tri', pts: [[0, 0, -0.12], [0, 0.07, -0.22], [0, -0.07, -0.22]], r: 0.011, color: K, k: 0.02 },
    ...[1, -1].map((s) => ({ s: 'tri', pts: [[s * 0.03, -0.02, 0.03], [s * 0.03, -0.05, -0.01], [s * 0.07, -0.05, -0.05]], r: 0.008, color: K, k: 0.02 })),
  ], { cell: 0.012, colorSharp: 0.003, extras: [fishEyes(0.03, 0.035, 0.07)] });
}
