// The wild jungle: dense merged foliage (jungle trees, palms on the coast,
// bananas, ferns, elephant ears, flowering shrubs, reeds by the river) kept
// clear of paths, buildings, the river and the zip lines; the Mushroom Grove
// of giant bouncy mushrooms and leaves; scattered coins.
import { Flora } from './flora.js';
import { VILLAGE, LAGOON, TEMPLE, RIVER, CLIFF, POOL, TRAIL, TRACK, VOLCANO, LAVA, polyDist } from '../jungle.js';

export const GROVE = { x: -492, z: 882, r: 22 };

function segDist(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

export function buildWild(game, kit, R) {
  const rnd = R.rng(77);
  const F = new Flora(game, 96);
  const zips = (game.jungleZips || []).map((z) => [{ x: z.C0.x, z: z.C0.z }, { x: z.E.x, z: z.E.z }]);
  const [bx0, bx1, bz0, bz1] = R.bounds;
  const clear = (x, z, pad = 0) => {
    if (x > VILLAGE.x0 - 6 - pad && x < LAGOON.x1 + 4 && z > VILLAGE.z0 - 8 - pad && z < VILLAGE.z1 + 26) return false; // village, lagoon, dock
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 27 + pad) return false;
    if (x > CLIFF.x0 - 4 && x < CLIFF.x1 + 8 && z > CLIFF.z0 - 14 && z < CLIFF.z1 + 4) return false;
    if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 6) return false;
    if (polyDist(x, z, RIVER)[0] < 14 + pad) return false;
    if (polyDist(x, z, TRAIL)[0] < 6 + pad || polyDist(x, z, TRACK)[0] < 6 + pad) return false;
    if (Math.hypot(x - GROVE.x, z - GROVE.z) < GROVE.r) return false;
    for (const [a, b] of zips) if (segDist(x, z, a, b) < 7) return false;
    for (const [tx, tz] of [[-449, 746], [-455, 781], [-459, 822], [-462, 866]]) if (Math.hypot(x - tx, z - tz) < 8) return false;
    return true;
  };
  // trees on a jittered grid
  const G = 13;
  for (let gx = bx0; gx < bx1; gx += G) for (let gz = bz0; gz < bz1; gz += G) {
    const x = gx + rnd() * G, z = gz + rnd() * G;
    const h = R.groundAt(x, z);
    if (h < 1.6) continue;
    const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (h > 52 || vd < 40) continue;
    if (!clear(x, z, 2)) continue;
    const thin = h > 30 ? 0.45 : 0.82; // sparser up the volcano
    if (rnd() > thin) continue;
    const coast = h < 4.5;
    const r = rnd(), s = 0.85 + rnd() * 0.45, yaw = rnd() * 6.28, tint = 0.85 + rnd() * 0.3;
    if (coast) F.add(r < 0.75 ? 'palm' : 'banana', x, h - 0.1, z, s * (r < 0.75 ? 1.05 : 1), yaw, tint);
    else if (r < 0.52) F.add('jtree', x, h - 0.2, z, s, yaw, tint);
    else if (r < 0.8) F.add('jtree2', x, h - 0.1, z, s, yaw, tint);
    else if (r < 0.9) F.add('palm', x, h - 0.1, z, s, yaw, tint);
    else F.add('banana', x, h - 0.1, z, s, yaw, tint);
  }
  // undergrowth
  const U = 7.5;
  for (let gx = bx0; gx < bx1; gx += U) for (let gz = bz0; gz < bz1; gz += U) {
    if (rnd() > 0.42) continue;
    const x = gx + rnd() * U, z = gz + rnd() * U;
    const h = R.groundAt(x, z);
    if (h < 1.0 || h > 45) continue;
    const rd = polyDist(x, z, RIVER)[0];
    if (rd > 9 && rd < 18 && h < 6) { F.add('reed', x, h - 0.1, z, 0.9 + rnd() * 0.5, rnd() * 6, 1, false); continue; }
    if (!clear(x, z, -3)) continue;
    const r = rnd(), s = 0.8 + rnd() * 0.6, yaw = rnd() * 6.28;
    F.add(r < 0.35 ? 'fern' : r < 0.55 ? 'bush' : r < 0.75 ? 'bigleaf' : r < 0.88 ? 'flowers' : 'rock', x, h - 0.1, z, s, yaw, 0.85 + rnd() * 0.3, false);
  }
  // palms round the village (decorative, a few)
  for (const [x, z, s] of [[-440, 720], [-436, 800, 1.1], [-392, 728, 1.2], [-382, 806, 1.1], [-432, 732, 0.95], [-386, 722, 1]]) F.add('palm', x, R.groundAt(x, z) - 0.1, z, s || 1, rnd() * 6, 1);
  F.finish();
  game.jungleFlora = F.count;
  game.jungleTrees = F.trees;

  // ---- Mushroom Grove: bounce up the giant caps to the top -------------------------------
  const caps = [[-505, 888, 3.0, 2.6], [-498, 877, 5.0, 2.9], [-488, 870, 7.2, 3.0], [-478, 878, 9.4, 3.2], [-482, 891, 11.6, 3.0], [-494, 897, 14, 3.4]];
  const g0 = R.groundAt(GROVE.x, GROVE.z);
  caps.forEach(([x, z, hh, r], i) => {
    const g = R.groundAt(x, z), top = g0 + hh;
    kit.cyl(x, (g + top) / 2, z, r * 0.22, top - g, 0xf2e6c4, { seg: 8 });
    kit.sphere(x, top, z, r, i % 2 ? 0xe8322b : 0xff7a2a, { scale: [1, 0.42, 1], seg: 10 });
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + i; kit.sphere(x + Math.cos(a) * r * 0.55, top + r * 0.3, z + Math.sin(a) * r * 0.55, r * 0.14, 0xffffff, { scale: [1, 0.5, 1], seg: 6 }); }
    kit.cyl(x, top + r * 0.3, z, r * 0.92, 0.3, 0xe8322b, { bounce: 13 + i, collide: true, seg: 10 });
    R.coins(x, z, top + 3, 'one', 1, 0, { lift: 0.6 });
  });
  const last = caps[caps.length - 1];
  R.coins(last[0], last[1], null, 'one', 1, 0, { big: true, y: g0 + last[2] + 6 });
  // giant leaves you bounce off
  for (const [x, z, yaw] of [[-470, 892, 0.4], [-512, 872, 2.2], [-500, 904, 3.6]]) {
    const g = R.groundAt(x, z);
    kit.cyl(x, g + 0.8, z, 0.12, 1.6, 0x4f8a2a, { seg: 5 });
    kit.box(x, g + 1.7, z, 3.4, 0.25, 4.6, 0x3fa83f, { yaw, bounce: 14, round: 0.1 });
    kit.deco(x, g + 1.86, z, 0.12, 0.05, 4.4, 0x2f8a35, { yaw });
  }
  // small mushrooms + ferns around the grove
  for (let i = 0; i < 30; i++) {
    const a = rnd() * 6.28, r = rnd() * GROVE.r, x = GROVE.x + Math.cos(a) * r, z = GROVE.z + Math.sin(a) * r, g = R.groundAt(x, z);
    if (rnd() < 0.5) { kit.cyl(x, g + 0.3, z, 0.08, 0.6, 0xf2e6c4, { seg: 5, collide: false }); kit.sphere(x, g + 0.62, z, 0.35, [0xe8322b, 0xffd23f, 0xb46cff][i % 3], { scale: [1, 0.5, 1], seg: 6 }); }
  }
  R.label('Mushroom Grove', GROVE.x, GROVE.z);
  // ---- scattered coins ------------------------------------------------------------------
  R.coins(-470, 760, null, 'ring', 6, 5);
  R.coins(-520, 760, null, 'line', 6, 24);
  R.coins(-640, 760, null, 'ring', 6, 6);
  R.coins(-760, 700, null, 'ring', 8, 7);
  R.coins(-850, 860, null, 'line', 6, 20, { yaw: Math.PI / 2 });
  R.coins(-700, 1060, null, 'ring', 6, 6);
  R.coins(-560, 980, null, 'line', 6, 24);
  void LAVA;
}
