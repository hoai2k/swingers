// Sculpted animal models (sculpt.js): one smooth rubber-toy surface each, painted with colour
// functions, eyes added as glossy beads. Facing +z, feet at y = 0, about 1 unit = 1 m.
// Each export returns { shapes, opts } (opts.extras: Builder parts for eyes, teeth, smiles).
// This file imports nothing that needs a page: the animal worker (animalworker.js) runs it to
// mesh the shapes off the main thread; animalgeo.js adds the extras. Used through
// animalgeo.js modelGeometry(name, ...args) by world/sealife.js and regions/jungle/animals.js.
import { FL, FR, BL, BR, TAIL, HEAD, WING_L, WING_R, JAW, TENT } from './rigparts.js';

const sculpt = (shapes, opts = {}) => ({ shapes, opts });

// ---- helpers ------------------------------------------------------------------------------------
const INK = 0x16161e;
// a pair of glossy eyes on a surface point (x, y, z) mirrored in x, looking along +z (or `dir`)
function eyes(part, pivot, x, y, z, r, opts = {}) {
  // glossy black cartoon eyes (taller than wide) with a white sparkle, like the Wobblers' faces
  const out = opts.out ?? 0.3;
  return { part, pivot, build: (b) => {
    for (const s of [-1, 1]) {
      const px = s * x;
      b.sphere(r, INK, [px, y, z], [0.85 + out * 0.1, 1.15, 0.6], 14);
      b.sphere(r * 0.3, 0xffffff, [px + s * r * 0.25, y + r * 0.45, z + r * 0.5], [1, 1, 0.5], 8);
      if (opts.sparkle !== false) b.sphere(r * 0.14, 0xffffff, [px - s * r * 0.25, y - r * 0.35, z + r * 0.52], [1, 1, 0.5], 6);
    }
  } };
}
// a smile: half a torus, curving down
const smile = (part, pivot, r, t, pos, tilt = 0) => ({ part, pivot, build: (b) => b.arc(r, t, INK, pos, [tilt, 0, Math.PI]) });
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
export function clownfish() {
  const O = 0xff7a1a, W = 0xffffff, K = 0x1c1c22;
  const stripe = (x, y, z) => { for (const [a, b] of [[0.07, 0.11], [-0.07, -0.03], [-0.19, -0.17]]) { if (z > a - 0.008 && z < b + 0.008) return z > a && z < b ? W : K; } return O; };
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.06, 0.1, 0.17], color: stripe, k: 0.04 },
    { s: 'egg', c: [0, 0, -0.2], r: [0.02, 0.07, 0.05], color: O, k: 0.05 },
    { s: 'egg', c: [0, 0.09, -0.03], r: [0.02, 0.04, 0.08], color: O, k: 0.04 },
  ], { cell: 0.02, colorSharp: 0.004, extras: [eyes(0, [0, 0, 0], 0.045, 0.03, 0.12, 0.02, { sparkle: false })] });
}
export function angelfish() {
  const Yl = 0xffd23f, B = 0x2a5cd8;
  const paint = (x, y, z) => (Math.sin(z * 30 + 1) > 0.55 ? B : Yl);
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.04, 0.16, 0.15], color: paint, k: 0.04 },
    { s: 'egg', c: [0, 0.2, -0.1], r: [0.012, 0.12, 0.05], rot: [-0.6, 0, 0], color: Yl, k: 0.05 },
    { s: 'egg', c: [0, -0.2, -0.1], r: [0.012, 0.12, 0.05], rot: [0.6, 0, 0], color: Yl, k: 0.05 },
    { s: 'egg', c: [0, 0, -0.18], r: [0.012, 0.07, 0.05], color: B, k: 0.04 },
  ], { cell: 0.02, colorSharp: 0.004, extras: [eyes(0, [0, 0, 0], 0.035, 0.04, 0.1, 0.02, { sparkle: false })] });
}
export function puffer() {
  const sh = [
    { s: 'ball', c: [0, 0, 0], r: 0.23, color: (x, y) => (y < -0.06 ? 0xfff4d8 : 0xf2cf6a), k: 0.03 },
    { s: 'egg', c: [0, 0, -0.27], r: [0.015, 0.09, 0.06], color: 0xf2cf6a, k: 0.06 },
    ...[1, -1].map((s) => ({ s: 'egg', c: [s * 0.21, -0.02, 0.06], r: [0.012, 0.05, 0.04], color: 0xf2cf6a, k: 0.03 })),
  ];
  for (let i = 0; i < 18; i++) { const yv = 1 - (i + 0.5) / 9; if (Math.abs(yv) > 0.92) continue; const a = i * 2.4, rr = Math.sqrt(1 - yv * yv), d = [Math.cos(a) * rr, yv, Math.sin(a) * rr]; if (d[2] > 0.7) continue; sh.push({ s: 'limb', a: d.map((v) => v * 0.2), b: d.map((v) => v * 0.29), ra: 0.022, rb: 0.004, color: 0xc89a4a, k: 0.015 }); }
  return sculpt(sh, { cell: 0.024, extras: [eyes(0, [0, 0, 0], 0.1, 0.07, 0.2, 0.035)] });
}

// ---- sea: big swimmers ----------------------------------------------------------------------------
export function shark() { // ~2.8 m, nose at z +1.4
  const TOP = 0x7d8ea8, BEL = 0xf0f4f8;
  const paint = (x, y, z) => (y < -0.06 - Math.abs(x) * 0.2 ? BEL : TOP);
  return sculpt([
    { s: 'egg', c: [0, 0, 0.1], r: [0.32, 0.36, 1.3], color: paint, k: 0.1 },
    { s: 'egg', c: [0, 0.48, -0.05], r: [0.045, 0.3, 0.22], rot: [-0.5, 0, 0], color: TOP, k: 0.12 },                   // dorsal fin
    { s: 'limb', a: [0, 0.02, -1.0], b: [0, 0.04, -1.38], ra: 0.13, rb: 0.06, color: paint, k: 0.1 },
    { s: 'egg', c: [0, 0.32, -1.55], r: [0.035, 0.3, 0.12], rot: [-0.7, 0, 0], color: TOP, k: 0.08 },                    // tail top
    { s: 'egg', c: [0, -0.2, -1.47], r: [0.035, 0.18, 0.09], rot: [0.6, 0, 0], color: TOP, k: 0.08 },                    // tail bottom
    { s: 'egg', c: [0.42, -0.2, 0.32], r: [0.32, 0.035, 0.15], rot: [0, 0.4, -0.35], color: TOP, part: WING_L, pivot: [0.25, -0.12, 0.4], k: 0.1 },
    { s: 'egg', c: [-0.42, -0.2, 0.32], r: [0.32, 0.035, 0.15], rot: [0, -0.4, 0.35], color: TOP, part: WING_R, pivot: [-0.25, -0.12, 0.4], k: 0.1 },
  ], { res: 64, extras: [eyes(0, [0, 0, 0], 0.2, 0.12, 0.98, 0.05), { build: (b) => { b.box(0.3, 0.02, 0.03, 0x3a2a3a, [0, -0.15, 1.15], [0.3, 0, 0]); for (let i = -3; i <= 3; i++) b.cone(0.016, 0.04, 0xffffff, [i * 0.04, -0.17, 1.16], [Math.PI, 0, 0], 4); } }] });
}
export function dolphin() { // ~2.2 m
  const TOP = 0x6fa3d8, BEL = 0xe6f2ff;
  const paint = (x, y) => (y < -0.08 ? BEL : TOP);
  return sculpt([
    { s: 'egg', c: [0, 0, 0], r: [0.29, 0.31, 0.95], color: paint, k: 0.1 },
    { s: 'ball', c: [0, 0.05, 0.75], r: 0.25, color: paint, k: 0.15 },                                                    // melon
    { s: 'limb', a: [0, -0.05, 0.9], b: [0, -0.08, 1.14], ra: 0.1, rb: 0.075, color: paint, k: 0.08 },                   // beak
    { s: 'egg', c: [0, 0.36, -0.12], r: [0.04, 0.2, 0.17], rot: [-0.6, 0, 0], color: TOP, k: 0.1 },
    { s: 'limb', a: [0, 0, -0.8], b: [0, 0, -1.05], ra: 0.12, rb: 0.06, color: TOP, k: 0.08 },
    { s: 'egg', c: [0, 0, -1.12], r: [0.32, 0.03, 0.12], color: TOP, k: 0.06 },                                          // flukes
    { s: 'egg', c: [0.32, -0.18, 0.3], r: [0.2, 0.03, 0.1], rot: [0, 0.4, -0.5], color: TOP, part: WING_L, pivot: [0.2, -0.12, 0.35], k: 0.08 },
    { s: 'egg', c: [-0.32, -0.18, 0.3], r: [0.2, 0.03, 0.1], rot: [0, -0.4, 0.5], color: TOP, part: WING_R, pivot: [-0.2, -0.12, 0.35], k: 0.08 },
  ], { res: 60, extras: [eyes(0, [0, 0, 0], 0.235, 0.09, 0.7, 0.045), smile(0, [0, 0, 0], 0.08, 0.012, [0, -0.04, 1.02], -0.4)] });
}
export function whale() { // humpback ~9 m
  const TOP = 0x2c3e66, BEL = 0xdce4f0;
  const paint = (x, y, z) => (y < -0.4 ? (Math.sin(x * 9) > 0.6 && z > 0 ? 0xaab6cc : BEL) : TOP);
  return sculpt([
    { s: 'egg', c: [0, 0, 0.3], r: [1.45, 1.3, 3.4], color: paint, k: 0.4 },
    { s: 'egg', c: [0, -0.2, 2.6], r: [1.2, 1.0, 1.6], color: paint, k: 0.5 },
    { s: 'egg', c: [0, 1.0, -1.1], r: [0.15, 0.35, 0.6], color: TOP, k: 0.4 },
    { s: 'limb', a: [0, 0.1, -2.6], b: [0, 0.15, -4.0], ra: 0.75, rb: 0.3, color: TOP, k: 0.4 },
    { s: 'egg', c: [0, 0.15, -4.4], r: [1.7, 0.13, 0.55], color: (x, y) => (y < 0.12 ? BEL : TOP), k: 0.3 },
    { s: 'egg', c: [2.3, -0.8, 1.2], r: [1.6, 0.14, 0.38], rot: [0, 0.35, -0.3], color: BEL, part: WING_L, pivot: [1.2, -0.5, 1.4], k: 0.35 },
    { s: 'egg', c: [-2.3, -0.8, 1.2], r: [1.6, 0.14, 0.38], rot: [0, -0.35, 0.3], color: BEL, part: WING_R, pivot: [-1.2, -0.5, 1.4], k: 0.35 },
    ...[[0.5, 3.4], [-0.4, 3.7], [0.15, 4.0], [-0.2, 3.2]].map(([x, z]) => ({ s: 'ball', c: [x, 0.95, z], r: 0.13, color: 0x46588a, k: 0.15 })),
  ], { res: 64, extras: [eyes(0, [0, 0, 0], 1.12, 0.05, 2.75, 0.13)] });
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
