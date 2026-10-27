// Desert landmarks: the stepped pyramid (stairs to a shrine on top, a hidden
// corridor on the west face into a treasure chamber), sphinx + ruins, the
// dinosaur dig site (a pit with a skeleton, throwable bones, tent and tools),
// the oasis (palms, a deck, a rubber ring, camels), the big mesa's scaffold
// ladder, the gas station + diner on the highway, dune-buggy ramps in the
// dunes, telegraph poles along the highway and parked desert vehicles.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder, matVC } from '../../../mesh.js';
import { lfurn } from '../../furniture.js';
import { jukebox } from '../../music.js';
import { shell } from '../../interiors.js';
import { PYRAMID, DIG, OASIS, MESAS, GAS, HIGHWAY, HIGHWAY_W, TOWN } from './layout.js';
import { WOOD, WOOD2, WOOD3, DARKWOOD, CREAM, barrel, crate } from './town.js';
import { redRock } from './nature.js';

const PI = Math.PI, SAND1 = 0xe8c27a, SAND2 = 0xd8ac62, BONE = 0xf2ead8;

// rect [x0, x1, z0, z1] minus holes -> list of rects
function subtract(rects, h) {
  const out = [];
  for (const r of rects) {
    const [a0, a1, b0, b1] = r, [h0, h1, k0, k1] = h;
    if (h1 <= a0 || h0 >= a1 || k1 <= b0 || k0 >= b1) { out.push(r); continue; }
    if (h0 > a0) out.push([a0, h0, b0, b1]);
    if (h1 < a1) out.push([h1, a1, b0, b1]);
    const x0 = Math.max(a0, h0), x1 = Math.min(a1, h1);
    if (k0 > b0) out.push([x0, x1, b0, k0]);
    if (k1 < b1) out.push([x0, x1, k1, b1]);
  }
  return out;
}

// ---- pyramid -----------------------------------------------------------------------
function pyramid(game, kit, R) {
  const { x, z, y, half } = PYRAMID, LH = 1.2, IN = 1.5;
  const L = new R.Local(kit, x, z, PI / 2, y); // local +z = east (front, stairs), -z = west (secret door)
  const CH = [-3.5, 3.5, -3.5, 3.5], COR = [-0.9, 0.9, -half - 1, -3]; // chamber, corridor (local x, z)
  let top = 0, i = 0;
  for (let hh = half; hh >= 2.8; hh -= IN, i++) {
    const y0 = i * LH;
    let rects = [[-hh, hh, -hh, hh]];
    if (y0 < 3.6) rects = subtract(rects, CH);
    if (y0 < 2.4) rects = subtract(rects, COR);
    for (const [a0, a1, b0, b1] of rects) L.box((a0 + a1) / 2, y0 + LH / 2, (b0 + b1) / 2, a1 - a0, LH, b1 - b0, i % 2 ? SAND2 : SAND1);
    top = y0 + LH;
  }
  // grand stairs up the east face
  L.stairs(0, half + 3.5, 0, 0, 3.2, top, 3.2, 0xf0d08a, 0xe2bc74, 0.3);
  // shrine on top: four columns, a slab roof, a golden cat statue
  for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) L.cyl(lx, top + 1.5, lz, 0.32, 3, 0xf0d08a, { seg: 10 });
  L.box(0, top + 3.15, 0, 5.4, 0.3, 5.4, SAND2);
  L.box(0, top + 3.6, 0, 3.6, 0.6, 3.6, SAND1);
  L.box(0, top + 0.5, -1, 0.8, 1.0, 0.8, 0xe8c27a);
  L.sphere(0, top + 1.3, -1, 0.35, 0xffd23f, { scale: [0.8, 1.2, 0.8] });
  L.sphere(0, top + 1.8, -1, 0.22, 0xffd23f);
  // hidden west entrance: a narrow door behind a toppled column and a sand drift
  L.deco(0, 1.2, -half - 0.02, 2.2, 2.6, 0.1, 0x6b5a3a);
  L.cyl(3.0, 0.6, -half - 2.0, 0.55, 3.4, 0xf0d08a, { euler: [0, 0.4, PI / 2], seg: 10 });
  L.box(-2.9, 0.5, -half - 1.6, 2.4, 1.0, 1.6, SAND1, { euler: [0, 0.3, 0.2] });
  // chamber: sarcophagus, gold, torches (pool lights), hieroglyph bands
  L.box(0, 0.45, 1.2, 1.2, 0.9, 2.4, 0xd8b45a, { round: 0.1 });
  L.deco(0, 0.95, 1.2, 0.9, 0.1, 2.0, 0x3f8cff);
  L.sphere(0, 1.05, 2.0, 0.28, 0xffd23f);
  for (let k = 0; k < 8; k++) L.sphere(-2.6 + (k % 4) * 0.3, 0.2 + (k > 3 ? 0.25 : 0), -2.6 + (k % 3) * 0.3, 0.2, 0xffd23f);
  for (const s of [-1, 1]) L.deco(s * 3.45, 2.2, 0, 0.05, 0.5, 6.6, 0x3f8cff);
  const lp = L.v3(0, 3.6, 0);
  game.interiorLights.add(lp.x, lp.y, lp.z, { color: 0xffa040, intensity: 8, range: 9, fixture: false });
  const cp = L.v3(0, 2.4, -half + 2);
  game.interiorLights.add(cp.x, cp.y, cp.z, { color: 0xffa040, intensity: 5, range: 6, fixture: false });
  for (const [lx, lz] of [[-3.2, 3.2], [3.2, 3.2], [-3.2, -3.2], [3.2, -3.2]]) { L.cyl(lx, 1.6, lz, 0.06, 0.6, DARKWOOD, { collide: false }); L.sphere(lx, 2.0, lz, 0.12, 0xfff4c2); }
  // sphinx guarding the stairs (to the south-east) + broken columns, obelisks
  const S = new R.Local(kit, x + half + 12, z + 16, -PI / 2 + 0.3, R.groundAt(x + half + 12, z + 16) - 0.2);
  S.box(0, 1.6, -1.5, 3.4, 3.2, 7, SAND1, { round: 0.6 });
  for (const s of [-1, 1]) S.box(s * 1.2, 0.5, 3.3, 1.0, 1.0, 3.2, SAND2, { round: 0.3 });
  S.box(0, 4.3, 2.0, 2.0, 2.2, 2.0, SAND1, { round: 0.4 });
  S.box(0, 5.55, 1.8, 2.4, 0.7, 2.3, 0x3f8cff, { round: 0.25 });
  for (const s of [-1, 1]) { S.box(s * 1.15, 4.1, 1.9, 0.45, 2.2, 1.2, 0x3f8cff); for (let k = 0; k < 4; k++) S.deco(s * 1.15, 3.3 + k * 0.5, 1.9, 0.5, 0.18, 1.25, 0xffd23f); }
  S.deco(0, 5.25, 2.98, 2.2, 0.18, 0.1, 0xffd23f);
  for (const s of [-1, 1]) S.sphere(s * 0.45, 4.6, 3.02, 0.14, 0x2a2a33);
  S.box(0, 3.4, 2.9, 0.6, 0.9, 0.5, SAND2); // beard
  S.deco(0, 3.95, 3.02, 0.5, 0.12, 0.06, 0x6b4a2a);
  for (const [lx, lz, broken] of [[-30, -8, 0], [-30, 8, 1], [-34, -16, 1], [-34, 16, 0], [26, -10, 1]]) {
    const [wx, wz] = L.w(lz, lx), g = R.groundAt(wx, wz);
    const hh = broken ? 2.2 : 5.5;
    kit.cyl(wx, g + hh / 2, wz, 0.6, hh, 0xf0d08a, { seg: 10 });
    if (!broken) kit.box(wx, g + hh + 0.25, wz, 1.6, 0.5, 1.6, SAND2);
    else kit.cyl(wx + 2.2, g + 0.6, wz + 0.5, 0.55, 3.0, 0xf0d08a, { euler: [0, 0.7, PI / 2], seg: 10 });
  }
  for (const [ox, oz] of [[half + 6, -9], [half + 6, 9]]) {
    const wx = x + ox, wz = z + oz, g = R.groundAt(wx, wz);
    kit.box(wx, g + 4, wz, 1.2, 8, 1.2, 0xf0d08a);
    kit.cone(wx, g + 8.5, wz, 0.85, 1.0, 0xffd23f, { seg: 4 });
  }
  for (const [ox, oz] of [[half + 10, -16], [half + 12, 22], [-half - 9, 14], [-half - 7, -18], [6, half + 9]]) R.tree(x + ox, z + oz, 2, 1.05);
  return { top: y + top, chamber: L.v3(0, 0, 0) };
}

// ---- dig site ------------------------------------------------------------------------------
function digSite(game, kit, R) {
  const { x0, x1, z0, z1, y, around } = DIG, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // ramp down into the pit (east side) and a ladder on the west wall
  kit.wedge(x1 - 3.4, y, cz + 5, 2.4, 6.8, around - y, WOOD3, { yaw: PI / 2 });
  // rope fence on posts around the rim (gap at the ramp)
  const pb = new Builder();
  const posts = [];
  for (let x = x0 - 1; x <= x1 + 1; x += 3) posts.push([x, z0 - 1], [x, z1 + 1]);
  for (let z = z0 + 2; z <= z1 - 1; z += 3) posts.push([x0 - 1, z]);
  for (const [px, pz] of posts) pb.cyl(0.05, 0.05, 1.0, WOOD3, [px, around + 0.5, pz], null, 5);
  pb.box(x1 - x0 + 2, 0.04, 0.04, 0xd84a3a, [cx, around + 0.85, z0 - 1]);
  pb.box(x1 - x0 + 2, 0.04, 0.04, 0xd84a3a, [cx, around + 0.85, z1 + 1]);
  pb.box(0.04, 0.04, z1 - z0 + 2, 0xd84a3a, [x0 - 1, around + 0.85, cz]);
  // the skeleton: spine, ribs, skull, tail, legs (half dug out of the floor)
  const sx = cx - 2, sz = cz - 1;
  for (let k = 0; k < 14; k++) pb.sphere(0.22 - k * 0.006, BONE, [sx - 4 + k * 0.65, y + 0.9 + Math.sin(k / 13 * PI) * 0.8, sz], [1.2, 0.8, 0.8], 7);
  for (let k = 0; k < 6; k++) pb.add(new THREE.TorusGeometry(0.85 - Math.abs(k - 2.5) * 0.08, 0.06, 5, 12, PI), BONE, [sx - 1.3 + k * 0.62, y + 1.35, sz], [0, PI / 2, PI]);
  pb.rbox(1.1, 0.6, 0.7, 0.2, BONE, [sx + 5.4, y + 1.0, sz]);
  pb.rbox(0.8, 0.25, 0.5, 0.1, BONE, [sx + 5.9, y + 0.65, sz]);
  for (const s of [-1, 1]) { pb.sphere(0.12, 0x2a2a33, [sx + 5.6, y + 1.15, sz + s * 0.36], null, 6); pb.cone(0.05, 0.18, BONE, [sx + 6.1, y + 0.85, sz + s * 0.18], [PI, 0, 0], 5); }
  for (let k = 0; k < 8; k++) pb.sphere(0.18 - k * 0.015, BONE, [sx - 4.6 - k * 0.6, y + 0.6 - k * 0.05, sz + Math.sin(k * 0.5) * 0.4], [1.3, 0.8, 0.8], 6);
  for (const [lx, s] of [[-2.4, 1], [-2.4, -1], [1.8, 1], [1.8, -1]]) pb.capsule(0.1, 1.0, BONE, [sx + lx, y + 0.5, sz + s * 0.6], [0, 0, s * 0.3]);
  // grid strings, tools, buckets, sieve, wheelbarrow
  for (let k = 0; k <= 4; k++) pb.box(x1 - x0, 0.02, 0.02, 0xffffff, [cx, y + 0.05, z0 + 2 + k * 3.5]);
  pb.box(0.6, 0.06, 0.6, 0xc8a46a, [cx + 4, y + 0.5, cz + 5]);
  const mesh = pb.mesh(matVC); game.scene.add(mesh);
  for (const [bx, bz] of [[cx + 5, cz - 5], [cx + 5.6, cz - 4.4]]) kit.cyl(bx, y + 0.25, bz, 0.25, 0.5, 0x8a8f96, { seg: 8 });
  // tent + table above the pit
  const tx = x0 - 6, tz = cz - 4, g = around;
  for (const [ox, oz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) kit.cyl(tx + ox, g + 1.1, tz + oz, 0.07, 2.2, WOOD2, { seg: 5 });
  kit.box(tx - 1, g + 2.6, tz, 2.2, 0.08, 4.0, 0xe8dcc0, { euler: [0, 0, -0.5], collide: false });
  kit.box(tx + 1, g + 2.6, tz, 2.2, 0.08, 4.0, 0xe8dcc0, { euler: [0, 0, 0.5], collide: false });
  kit.box(tx, g + 0.75, tz + 0.2, 1.6, 0.08, 0.9, WOOD3);
  for (const [ox, oz] of [[-0.7, -0.2], [0.7, -0.2], [-0.7, 0.6], [0.7, 0.6]]) kit.deco(tx + ox, g + 0.37, tz + oz, 0.06, 0.74, 0.06, WOOD2);
  kit.deco(tx, g + 0.8, tz + 0.2, 0.5, 0.02, 0.35, 0xf2e6c4);
  crate(kit, tx + 3, tz + 3, g); crate(kit, tx + 3.2, tz + 4, g, 0.7, 0.4);
  R.sign('DIG SITE', x1 + 3, g + 1.9, z1 + 3.5, PI / 4, 3.4, '#c8a46a', '#4a2a1a');
  kit.cyl(x1 + 3, g + 0.8, z1 + 3.5, 0.08, 1.6, WOOD2, { seg: 5 });
  // loose bones to throw about (dogs love them)
  for (const [bx, bz] of [[cx + 3, cz + 3], [cx - 5, cz + 4]]) {
    const b = new Builder();
    b.capsule(0.06, 0.5, BONE, [0, 0, 0], [0, 0, PI / 2]);
    for (const s of [-1, 1]) for (const t of [-1, 1]) b.sphere(0.08, BONE, [s * 0.32, 0, t * 0.05], null, 6);
    const o = game.physics.dynamic({ x: bx, y: y + 0.4, z: bz }, [RAPIER.ColliderDesc.capsule(0.3, 0.08).setRotation({ x: 0, y: 0, z: Math.sin(PI / 4), w: Math.cos(PI / 4) }).setMass(1)], b.mesh(matVC), { angDamp: 0.5 });
    game.scene.add(o.mesh);
    R.common.throwable(game, o, { speed: 9 });
  }
  return { cx, cz };
}

// ---- oasis ---------------------------------------------------------------------------------
function oasis(game, kit, R) {
  const { x, z, r } = OASIS, rng = R.rng(11);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * PI * 2 + rng() * 0.3, d = r + 4 + rng() * 9;
    if (Math.abs(a - 0.2) < 0.25) continue; // keep the deck side open (north)
    R.tree(x + Math.sin(a) * d, z + Math.cos(a) * d, 2, 0.85 + rng() * 0.45);
  }
  for (let i = 0; i < 12; i++) { const a = rng() * PI * 2, d = r - 1 + rng() * 5; redRock(kit, x + Math.sin(a) * d, z + Math.cos(a) * d, R.groundAt(x + Math.sin(a) * d, z + Math.cos(a) * d) - 0.3, 0.6 + rng() * 0.9, rng); }
  for (let i = 0; i < 14; i++) { const a = rng() * PI * 2, d = r + 6 + rng() * 10, bx = x + Math.sin(a) * d, bz = z + Math.cos(a) * d; kit.bush(bx, bz, R.groundAt(bx, bz) - 0.1, 0.7 + rng() * 0.4); }
  // wooden deck out over the water from the north shore
  const L = new R.Local(kit, x + 3, z - r + 2, 0, 0.9);
  L.box(0, 0, 3, 3, 0.25, 12, WOOD3);
  for (let lz = -2; lz <= 8; lz += 2.5) for (const s of [-1, 1]) L.cyl(s * 1.4, -1.6, lz, 0.12, 3.2, WOOD2, { seg: 6 });
  L.rail(-1.5, 8.9, 1.5, 8.9, 0.12, 0.9, WOOD2);
  // nomad tent with rugs and cushions
  const T = new R.Local(kit, x - r - 12, z - 10, 0.9, R.groundAt(x - r - 12, z - 10));
  for (const [lx, lz] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5], [0, -2.5], [0, 2.5]]) T.cyl(lx, 1.3, lz, 0.08, 2.6, WOOD2, { seg: 5, collide: false });
  T.box(0, 2.7, 0, 6.6, 0.1, 5.6, 0xc8343c, { collide: false, euler: [0, 0, 0] });
  T.deco(0, 2.4, -2.75, 6.6, 0.7, 0.05, 0xffd23f);
  T.deco(0, 0.03, 0, 5, 0.04, 4, 0x3f6aaa);
  for (const lx of [-1.6, 0, 1.6]) T.box(lx, 0.2, -1.6, 1.0, 0.4, 0.7, 0xff8a3d, { round: 0.15 });
  // a floating rubber ring
  const rb = new Builder(); rb.torus(0.55, 0.2, 0xff5a8a, [0, 0, 0], [PI / 2, 0, 0], 18);
  for (let k = 0; k < 4; k++) rb.torus(0.55, 0.205, 0xffffff, [0, 0, 0], [PI / 2, 0, k * PI / 2], 2);
  const ring = game.physics.dynamic({ x: x - 4, y: 0.2, z: z + 4 }, [RAPIER.ColliderDesc.cylinder(0.18, 0.72).setMass(4)], rb.mesh(matVC), { angDamp: 0.8, linDamp: 0.6, buoy: { r: 0.6, volume: 0.06 } });
  game.scene.add(ring.mesh);
  R.vehicle('camel', x + r + 8, z - 6, -2.4);
  R.vehicle('camel', x + r + 11, z + 2, -1.6);
  return { tentX: x - r - 12, tentZ: z - 10 };
}

// ---- big mesa: scaffold tower with a ladder and a plank walkway to the top --------------------
function mesaClimb(game, kit, R) {
  const [mx, mz] = MESAS[0], topY = R.groundAt(mx, mz);
  let rim = mx;
  while (R.groundAt(rim + 1, mz) > topY - 0.6 && rim < mx + 80) rim += 1;
  let tx = rim + 2;
  while (R.groundAt(tx, mz) > topY - 22 && tx < rim + 30) tx += 1;
  tx += 1.5;
  const g = R.groundAt(tx, mz), deck = topY + 0.4, H = deck - g;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(tx + sx * 1.2, g + H / 2, mz + sz * 1.2, 0.12, H, WOOD2, { seg: 6 });
  for (let y = 3; y < H; y += 3) for (const s of [-1, 1]) { kit.deco(tx, g + y, mz + s * 1.2, 2.4, 0.1, 0.1, WOOD3); kit.deco(tx + s * 1.2, g + y, mz, 0.1, 0.1, 2.4, WOOD3); }
  kit.box(tx, deck - 0.1, mz, 3, 0.2, 3, WOOD2);
  const wlen = tx - 1.5 - (rim - 1);
  kit.box(tx - 1.5 - wlen / 2, deck - 0.1, mz, wlen, 0.2, 1.6, WOOD3);
  const L = new R.Local(kit, 0, 0, 0, deck);
  L.rail(rim - 1, mz - 0.8, tx - 1.5, mz - 0.8, 0, 0.9, WOOD3);
  L.rail(rim - 1, mz + 0.8, tx - 1.5, mz + 0.8, 0, 0.9, WOOD3);
  // ladder on the tower's east face
  const lx = tx + 1.45;
  for (const s of [-0.35, 0.35]) kit.cyl(lx, g + (H + 1) / 2, mz + s, 0.05, H + 1, WOOD3, { collide: false, seg: 5 });
  for (let y = 0.4; y < H + 0.9; y += 0.4) kit.deco(lx, g + y, mz, 0.05, 0.05, 0.7, WOOD3);
  kit.box(lx - 0.2, g + (H - 0.3) / 2, mz, 0.1, H - 0.3, 1.0, WOOD2); // backboard
  R.common.ladder(game, lx, mz, g, deck, -1, 0, 0.45);
  // flag on the mesa top
  kit.cyl(mx + 10, topY + 3, mz, 0.06, 6, 0xdddddd, { seg: 5 });
  kit.deco(mx + 10, topY + 5.4, mz + 0.8, 0.04, 1.0, 1.6, 0xff5a3a);
  return { topY, rim, tx };
}

// ---- gas station + diner -------------------------------------------------------------------
function gasStation(game, kit, R) {
  const { x, z, y } = GAS;
  kit.deco(x - 2, y + 0.03, z - 3, 36, 0.06, 24, 0xb8b2a6);
  // canopy over two pumps
  const cx = x + 6, cz = z + 2;
  for (const [ox, oz] of [[-4, -2.5], [4, -2.5], [-4, 2.5], [4, 2.5]]) kit.cyl(cx + ox, y + 2.4, cz + oz, 0.18, 4.8, 0xffffff, { seg: 8 });
  kit.box(cx, y + 5.0, cz, 11, 0.5, 7.5, 0xe8322b);
  kit.deco(cx, y + 5.3, cz, 11.2, 0.12, 7.7, 0xffffff);
  for (const ox of [-2, 2]) {
    kit.box(cx + ox, y + 0.15, cz, 1.2, 0.3, 3.4, 0xcfcfcf);
    kit.box(cx + ox, y + 1.0, cz, 0.7, 1.5, 0.5, 0xff8a3d, { round: 0.1 });
    kit.deco(cx + ox, y + 1.45, cz + 0.26, 0.5, 0.35, 0.02, 0x9fd8ff);
    kit.deco(cx + ox + 0.38, y + 1.0, cz, 0.06, 0.5, 0.06, 0x222222);
  }
  // tall GAS sign by the road
  kit.cyl(x + 14, y + 4, z + 9, 0.2, 8, 0x8a8f96, { seg: 8 });
  R.sign('GAS', x + 14, y + 8.4, z + 9.15, 0.2, 4, '#e8322b', '#ffffff');
  R.sign('GAS', x + 14, y + 8.4, z + 8.85, 0.2 + PI, 4, '#e8322b', '#ffffff');
  // diner: a shell with a glass door, counter + stools, booths, jukebox
  const L = new R.Local(kit, x - 9, z - 6, 0, y + 0.05);
  const w = 14, d = 9, h = 4.0;
  shell(game, L, {
    w, d, h, wall: 0x9fe0d8, floor: 0xf2f2f2, roofColor: 0xe8e8e8, business: 'diner',
    door: { lx: 3.5, w: 1.6, h: 2.4, color: 0xd8d8de, glass: true },
    windows: [{ side: 'f', at: -3.2, y: 2.0, w: 5.5, h: 1.6 }, { side: 'l', at: 0, y: 2.0, w: 4, h: 1.4 }],
    lights: [[-4, 0, { fixture: 'panel' }], [2, 0, { fixture: 'panel' }]],
  });
  L.deco(0, 0.75, d / 2 + 0.02, w, 0.25, 0.06, 0xe8322b);
  L.deco(0, h - 0.2, d / 2 + 0.03, w, 0.3, 0.06, 0xd8d8de);
  const sp = L.v3(0, h + 0.9, d / 2 - 0.6);
  R.sign('DINER', sp.x, sp.y, sp.z, 0, 5, '#2ab5a5', '#ffffff');
  L.box(0, h + 0.5, d / 2 - 0.7, 5.4, 1.2, 0.12, 0xd8d8de);
  // counter along the back, stools in front, kitchen hatch
  L.box(-1.5, 0.55, -2.2, 8, 1.1, 0.7, 0xd8d8de);
  L.deco(-1.5, 1.12, -2.2, 8.2, 0.05, 0.85, 0xe8322b);
  L.box(-1.5, 1.6, -4.25, 8, 0.6, 0.3, 0xcfcfcf);
  for (let k = 0; k < 4; k++) L.deco(-4.5 + k * 2, 2.6, -4.32, 1.2, 0.8, 0.04, [0xffd23f, 0xff8a3d, 0xe8322b, 0x55a84a][k]);
  for (let k = 0; k < 6; k++) lfurn(game, L, 'stool', -5 + k * 1.4, 0, -1.3, 0, 0xe8322b);
  for (const lx of [-4.5, -1.5]) {
    lfurn(game, L, 'table', lx, 0, 2.6, 0, 0xffffff, 1.2, 0.8);
    lfurn(game, L, 'chair', lx, 0, 1.75, 0, 0xe8322b);
    lfurn(game, L, 'chair', lx, 0, 3.45, PI, 0xe8322b);
  }
  jukebox(game, L, w / 2 - 0.25 - 0.45, 1.5, -PI / 2);
  // parked: a pickup, the monster truck, a buggy
  R.vehicle('pickup', x + 6, z + 7.5, PI / 2, 0x3f8cff);
  R.vehicle('monster', x - 8, z + 6, PI / 2 + 0.2, 0x3f8cff);
  R.vehicle('buggy', x + 14, z - 2, -PI / 2, 0xff4d3d);
  return { dinerL: L, cook: L.v3(-1.5, 0, -3.2) };
}

// ---- dunes: buggy ramps + parked buggies ------------------------------------------------------
function dunes(game, kit, R) {
  const jumps = [];
  for (const [x, z, yaw] of [[-1150, -20, -PI / 2 - 0.3], [-1300, 30, -PI / 2], [-1180, 50, PI + 0.6], [-1330, -80, -PI / 2 + 0.4]]) {
    const g = R.groundAt(x, z), gb = R.groundAt(x - Math.sin(yaw) * 4, z - Math.cos(yaw) * 4);
    kit.wedge(x, Math.min(g, gb) - 0.4, z, 4.2, 7, 2.6, WOOD3, { yaw });
    for (const s of [-1, 1]) {
      const c = Math.cos(yaw), sn = Math.sin(yaw), px = x + s * 2.3 * c + sn * 3.6, pz = z - s * 2.3 * sn + Math.cos(yaw) * 3.6;
      kit.cyl(px, R.groundAt(px, pz) + 0.9, pz, 0.06, 1.8, 0xffffff, { seg: 5 });
      kit.deco(px, R.groundAt(px, pz) + 1.7, pz + 0.3, 0.02, 0.4, 0.6, s > 0 ? 0xff5a3a : 0xffd23f);
    }
    jumps.push([x, z, yaw, Math.min(g, gb) + 2.2]);
  }
  R.vehicle('buggy', -1112, -14, -PI / 2, 0xffd23f);
  R.vehicle('buggy', -1112, -9, -PI / 2, 0x55d85a);
  R.vehicle('buggy', -785, 52, -PI / 2, 0xff4d3d);
  return jumps;
}

// telegraph poles along the highway, a cactus-shaped mailbox, road signs
function highway(game, kit, R) {
  const line = (pts, side) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let t = 0; t < len; t += 26) {
        const x = ax + (bx - ax) * t / len + nx * side, z = az + (bz - az) * t / len + nz * side, g = R.groundAt(x, z);
        kit.cyl(x, g + 3.5, z, 0.12, 7, WOOD2, { seg: 6 });
        kit.deco(x, g + 6.6, z, 1.6, 0.12, 0.12, WOOD2, { yaw: Math.atan2(nx, nz) });
      }
    }
  };
  line(HIGHWAY, -7);
  line(HIGHWAY_W, 7);
  void TOWN;
}

export function buildSites(game, kit, R) {
  const out = {};
  out.pyramid = pyramid(game, kit, R);
  out.dig = digSite(game, kit, R);
  out.oasis = oasis(game, kit, R);
  out.mesa = mesaClimb(game, kit, R);
  out.gas = gasStation(game, kit, R);
  out.jumps = dunes(game, kit, R);
  highway(game, kit, R);
  game.desertSites = out;
  return out;
}
export { WOOD, CREAM, barrel };
