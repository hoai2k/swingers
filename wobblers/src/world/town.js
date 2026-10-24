// Town centre shops, town hall, apartments and the suburbs.
import * as THREE from 'three';
import { signMesh } from '../mesh.js';
import { interiorShop, interiorHouse } from './interiors.js';

// Shops you can walk into (first occurrence of each name) and the house with an upstairs.
const ENTERABLE = new Set(['CAFE', 'MARKET', 'ARCADE']);

const WALLS = [0xfff1d6, 0xffd6d6, 0xd6ecff, 0xe2ffd6, 0xfff7b0, 0xf0dcff, 0xffe2c4, 0xd9f7f2];
const ROOFS = [0xd9534f, 0x5b7fd6, 0x4a9f5a, 0x8a5a44, 0xe08a3a, 0x7a5aa8];
const SHOPS = [
  ['BURGERS', '#ff5a3c'], ['PIZZA', '#e8a12a'], ['ICE CREAM', '#ff7fc8'], ['TOYS', '#3f8cff'], ['CAFE', '#8a5a3a'],
  ['BANK', '#2a8a5a'], ['GYM', '#444a6a'], ['MARKET', '#4fae45'], ['BAKERY', '#d9824a'], ['ARCADE', '#b46cff'],
  ['DONUTS', '#ff6fae'], ['POST', '#d9534f'],
];

let rngSeed = 1234;
const rnd = () => (rngSeed = (rngSeed * 16807) % 2147483647) / 2147483647;
const pick = (a) => a[(rnd() * a.length) | 0];

// Local->world transform helper for a building facing `yaw` (front = local +Z).
function frame(x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
}

function windows(kit, P, yaw, w, d, h, floors, color = 0x8fcfff, skipDoor = true) {
  for (let f = 0; f < floors; f++) {
    const y = 1.6 + f * 3;
    const n = Math.max(1, Math.floor(w / 3.2));
    for (let i = 0; i < n; i++) {
      const lx = -w / 2 + (i + 0.5) * (w / n);
      if (skipDoor && f === 0 && Math.abs(lx) < 1.6) continue;
      for (const side of [1, -1]) {
        const [x, z] = P(lx, side * (d / 2 + 0.03));
        kit.deco(x, y, z, 1.4, 1.5, 0.08, 0xffffff, { yaw });
        const [x2, z2] = P(lx, side * (d / 2 + 0.07));
        kit.deco(x2, y, z2, 1.15, 1.25, 0.04, color, { yaw });
      }
    }
    const m = Math.max(1, Math.floor(d / 3.5));
    for (let i = 0; i < m; i++) {
      const lz = -d / 2 + (i + 0.5) * (d / m);
      for (const side of [1, -1]) {
        const [x, z] = P(side * (w / 2 + 0.05), lz);
        kit.deco(x, y, z, 0.1, 1.25, 1.15, color, { yaw });
      }
    }
  }
}

export function house(kit, x, z, yaw, opts = {}) {
  const w = opts.w || 9 + rnd() * 2, d = opts.d || 8 + rnd() * 2, h = opts.h || (rnd() < 0.4 ? 6 : 3.4);
  const wall = opts.wall || pick(WALLS), roof = opts.roof || pick(ROOFS);
  if (opts.interior) { // same random draws as below so the other houses don't change
    const doorCol = pick([0x8a4a2a, 0x2a62c9, 0xd9534f, 0x3a8a4a]);
    return interiorHouse(opts.interior, kit, x, z, yaw, wall, roof, doorCol);
  }
  const P = frame(x, z, yaw);
  kit.box(x, h / 2, z, w, h, d, wall, { yaw });
  // gable roof: two slabs + gable ends
  const rh = 2.6, slope = Math.atan2(rh, d / 2), sl = Math.hypot(rh, d / 2) + 0.5;
  for (const s of [1, -1]) {
    const [rx, rz] = P(0, s * d / 4);
    kit.box(rx, h + rh / 2, rz, w + 0.8, 0.25, sl, roof, { euler: [s * slope, yaw, 0] });
  }
  for (const s of [1, -1]) {
    const [gx, gz] = P(s * (w / 2 - 0.05), 0);
    // stepped gable fill
    for (let i = 0; i < 4; i++) {
      const t = (i + 0.5) / 4;
      kit.deco(gx, h + rh * t * 0.95, gz, 0.1, rh / 4, d * (1 - t) + 0.2, wall, { yaw });
    }
  }
  // chimney
  const [cx, cz] = P(w * 0.28, -d * 0.15);
  kit.box(cx, h + rh * 0.9, cz, 0.7, 1.8, 0.7, 0xa0583a, { yaw });
  // door + step
  const [dx, dz] = P(0, d / 2 + 0.04);
  kit.deco(dx, 1.05, dz, 1.2, 2.1, 0.1, pick([0x8a4a2a, 0x2a62c9, 0xd9534f, 0x3a8a4a]), { yaw });
  const [sx, sz] = P(0, d / 2 + 0.6);
  kit.box(sx, 0.1, sz, 2, 0.2, 1.1, 0xcfcfcf, { yaw });
  windows(kit, P, yaw, w, d, h, h > 5 ? 2 : 1);
  // front garden + fence
  if (opts.garden !== false) {
    const [g1x, g1z] = P(-w / 2 - 1, d / 2 + 4.5), [g2x, g2z] = P(-2, d / 2 + 4.5);
    const [g3x, g3z] = P(2, d / 2 + 4.5), [g4x, g4z] = P(w / 2 + 1, d / 2 + 4.5);
    kit.fence(g1x, g1z, g2x, g2z, 0xffffff, 0.8);
    kit.fence(g3x, g3z, g4x, g4z, 0xffffff, 0.8);
    const [bx, bz] = P(-w / 2 + 1, d / 2 + 2);
    kit.bush(bx, bz);
    const [tx, tz] = P(w / 2 + 2, -1);
    kit.tree(tx, tz, 0, rnd() < 0.3 ? 1 : 0, 0.8 + rnd() * 0.3);
    const [mx, mz] = P(2.8, d / 2 + 4.2);
    kit.box(mx, 0.6, mz, 0.1, 1.2, 0.1, 0x666666, { yaw });
    kit.deco(mx, 1.25, mz, 0.35, 0.3, 0.5, 0x3f8cff, { yaw, round: 0.1 });
  }
}

export function shop(game, kit, x, z, yaw, name, color, opts = {}) {
  const w = opts.w || 14, d = opts.d || 11, h = opts.h || 5.5;
  const P = frame(x, z, yaw);
  const wall = opts.wall || pick(WALLS);
  if (opts.interior) return interiorShop(game, kit, x, z, yaw, name, color, wall, { w, d, h });
  kit.box(x, h / 2, z, w, h, d, wall, { yaw });
  kit.deco(x, h + 0.25, z, w + 0.4, 0.5, d + 0.4, 0xffffff, { yaw });
  // shop window
  const [wx, wz] = P(-w * 0.2, d / 2 + 0.05);
  kit.deco(wx, 1.8, wz, w * 0.45, 2.2, 0.1, 0x9fd8ff, { yaw });
  const [dx, dz] = P(w * 0.25, d / 2 + 0.05);
  kit.deco(dx, 1.2, dz, 1.8, 2.4, 0.1, 0x5a3a2a, { yaw });
  // striped awning
  const c = new THREE.Color(color).getHex();
  const n = Math.round(w / 1.2);
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (i + 0.5) * (w / n);
    const [ax, az] = P(lx, d / 2 + 1.0);
    kit.box(ax, 3.35, az, w / n + 0.01, 0.12, 2.1, i % 2 ? 0xffffff : c, { euler: [0.35, yaw, 0] });
  }
  if (opts.floors) windows(kit, P, yaw, w, d, h, opts.floors, 0x8fcfff, false);
  const sign = signMesh(name, Math.min(w * 0.8, 9), color);
  const [sx, sz] = P(0, d / 2 + 0.2);
  sign.position.set(sx, h - 0.9, sz);
  sign.rotation.y = yaw;
  game.scene.add(sign);
}

function townHall(game, kit, x, z, yaw) {
  const P = frame(x, z, yaw);
  kit.box(x, 5, z, 22, 10, 14, 0xf3ead8, { yaw });
  for (let i = 0; i < 6; i++) {
    const [cx, cz] = P(-8.75 + i * 3.5, 8);
    kit.cyl(cx, 4, cz, 0.45, 8, 0xffffff);
  }
  const [px, pz] = P(0, 8);
  kit.box(px, 8.5, pz, 22, 1, 3, 0xffffff, { yaw });
  for (let i = 0; i < 4; i++) {
    const [sx, sz] = P(0, 7.3 + i * 0.6);
    kit.box(sx, 0.15 * (4 - i), sz, 10, 0.3 * (4 - i), 0.6, 0xe0e0e0, { yaw });
  }
  // clock tower
  kit.box(x, 13, z, 5, 6, 5, 0xf3ead8, { yaw });
  const [kx, kz] = P(0, 2.55);
  kit.cyl(kx, 13.5, kz, 1.6, 0.12, 0xffffff, { euler: [Math.PI / 2, yaw, 0], collide: false, seg: 20 });
  kit.cone(x, 17.5, z, 3.8, 3.5, 0x5b7fd6, { seg: 4, euler: [0, Math.PI / 4 + yaw, 0] });
  windows(kit, P, yaw, 22, 14, 10, 3, 0x9fd8ff);
  const sign = signMesh('TOWN HALL', 8, '#2a62c9');
  const [sx, sz] = P(0, 9.6);
  sign.position.set(sx, 9.5, sz); sign.rotation.y = yaw;
  game.scene.add(sign);
}

function apartments(kit, x, z, yaw, floors = 5) {
  const w = 14, d = 12, h = floors * 3;
  const P = frame(x, z, yaw);
  kit.box(x, h / 2, z, w, h, d, pick(WALLS), { yaw });
  kit.deco(x, h + 0.3, z, w + 0.3, 0.6, d + 0.3, 0x8a8a9a, { yaw });
  windows(kit, P, yaw, w, d, h, floors, 0x8fcfff);
  // balconies
  for (let f = 1; f < floors; f++) {
    for (const lx of [-4, 4]) {
      const [bx, bz] = P(lx, d / 2 + 0.7);
      kit.box(bx, f * 3 + 0.1, bz, 3, 0.2, 1.4, 0xdddddd, { yaw });
      const [rx, rz] = P(lx, d / 2 + 1.35);
      kit.deco(rx, f * 3 + 0.6, rz, 3, 0.8, 0.08, 0xffffff, { yaw });
    }
  }
  const [dx, dz] = P(0, d / 2 + 0.05);
  kit.deco(dx, 1.2, dz, 2.4, 2.4, 0.1, 0x3a5a8a, { yaw });
}

export function buildTown(game, kit) {
  const shops = SHOPS.slice();
  // four central blocks: interior roughly 8..52 from the centre lines
  const blocks = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  let si = 0;
  for (const [bx, bz] of blocks) {
    // shops facing the avenue (x = 0 side), shops facing z = 0 side
    const facingX = bx > 0 ? -Math.PI / 2 : Math.PI / 2; // front toward x = 0
    const facingZ = bz > 0 ? Math.PI : 0;                 // front toward z = 0
    // along the N/S avenue
    for (const d of [30, 46]) {
      const [name, col] = shops[si++ % shops.length];
      shop(game, kit, bx * 15.5, bz * d, facingX, name, col, { w: 13, d: 10, interior: si <= 12 && ENTERABLE.has(name) });
    }
    // along the E/W avenue
    for (const d of [32, 47]) {
      const [name, col] = shops[si++ % shops.length];
      shop(game, kit, bx * d, bz * 15.5, facingZ, name, col, { w: 13, d: 10, interior: si <= 12 && ENTERABLE.has(name) });
    }
    // back corner: town hall, apartments or houses facing the outer town roads
    const cx = bx * 40, cz = bz * 40;
    if (bx < 0 && bz < 0) townHall(game, kit, -42, -38, 0);
    else if (bx > 0 && bz < 0) { apartments(kit, 42, -42, 0, 6); }
    else if (bx < 0 && bz > 0) { house(kit, -38, 47, 0, { garden: false, interior: game }); house(kit, -48, 34, Math.PI / 2, { garden: false }); kit.tree(cx + 6, cz - 8); kit.tree(cx - 8, cz - 10, 0, 1); }
    else { apartments(kit, 42, 42, Math.PI, 5); kit.tree(28, 30); kit.tree(52, 26, 0, 1); }
    // street trees + lamps along the sidewalks of the outer town roads
    for (let t = -50; t <= 50; t += 16) {
      kit.lamp(bx * 64.5, t + 8); kit.lamp(t + 8, bz * 64.5);
    }
  }
  // lamps along the avenues inside town
  for (let t = 24; t <= 56; t += 16) for (const s of [-1, 1]) for (const k of [-1, 1]) {
    kit.lamp(s * 6.2, k * t); kit.lamp(k * t, s * 6.2);
  }

  // suburbs along the avenues between the town and the ring road
  const sub = [];
  for (let t = 78; t <= 140; t += 18) sub.push(t);
  for (const t of sub) {
    for (const s of [-1, 1]) {
      // east and west avenue (z = 0): houses at z = ±16 facing the road
      house(kit, t, s * 17, s > 0 ? Math.PI : 0);
      house(kit, -t, s * 17, s > 0 ? Math.PI : 0);
      // north and south avenue (x = 0)
      house(kit, s * 17, -t, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      house(kit, s * 17, t, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  }
  // street trees along the suburbs
  for (let t = 72; t <= 132; t += 12) for (const s of [-1, 1]) {
    kit.tree(t + 6, s * 7.8, 0, 0, 0.7); kit.tree(-t - 6, s * 7.8, 0, 0, 0.7);
    kit.tree(s * 7.8, t + 6, 0, 0, 0.7); kit.tree(s * 7.8, -t - 6, 0, 0, 0.7);
  }
  // trees lining the ring road
  for (let t = -140; t <= 140; t += 14) {
    for (const s of [-1, 1]) {
      if (Math.abs(t) > 10) { kit.tree(s * 157, t, 0, (t / 14) & 1, 0.9); kit.tree(t, s * 157, 0, (t / 14) & 1, 0.9); }
    }
  }
}
