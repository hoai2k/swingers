// Roads, sidewalks and the central plaza with its fountain.
import { addWater } from './water.js';

export const ROADS = [
  // ring road
  [-150, -150, 150, -150, 10], [150, -150, 150, 150, 10], [150, 150, -150, 150, 10], [-150, 150, -150, -150, 10],
  // avenues
  [0, -150, 0, -18, 10], [0, 18, 0, 150, 10], [0, 150, 0, 298, 10],
  [-195, 0, -18, 0, 10], [18, 0, 195, 0, 10],
  // farm lane from the ring road to the Pooh Berry Farm gate (world/farmland.js)
  [-190, 60, -150, 60, 8],
  // east road to the Bigtown bridge (world/bridge.js)
  [155, 118, 236, 118, 10],
  // town grid
  [-60, -60, 60, -60, 8], [-60, 60, 60, 60, 8], [-60, -60, -60, 60, 8], [60, -60, 60, 60, 8],
];

export function onRoad(x, z, margin = 0) {
  for (const [x0, z0, x1, z1, w] of ROADS) {
    const minX = Math.min(x0, x1) - w / 2 - margin, maxX = Math.max(x0, x1) + w / 2 + margin;
    const minZ = Math.min(z0, z1) - w / 2 - margin, maxZ = Math.max(z0, z1) + w / 2 + margin;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
  }
  return Math.abs(x) < 20 + margin && Math.abs(z) < 20 + margin;
}

export function buildRoads(game, kit) {
  const asphalt = 0x4d5058, line = 0xf4f4f4, walk = 0xc9c3b8;
  for (const [x0, z0, x1, z1, w] of ROADS) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const horiz = z0 === z1;
    // split long roads so chunks stay local
    const pieces = Math.ceil(len / 40);
    for (let i = 0; i < pieces; i++) {
      const a = i / pieces, b2 = (i + 1) / pieces;
      const px = x0 + (x1 - x0) * (a + b2) / 2, pz = z0 + (z1 - z0) * (a + b2) / 2;
      const pl = len / pieces + w;
      kit.deco(px, 0.035, pz, horiz ? pl : w, 0.07, horiz ? w : pl, asphalt);
      const town = Math.abs(px) <= 66 && Math.abs(pz) <= 66;
      if (town) {
        for (const s of [-1, 1]) {
          kit.deco(px + (horiz ? 0 : s * (w / 2 + 1.4)), 0.03, pz + (horiz ? s * (w / 2 + 1.4) : 0), horiz ? pl : 2.8, 0.06, horiz ? 2.8 : pl, walk);
        }
      }
    }
    // dashed centre line
    for (let d = 3; d < len - 3; d += 6) {
      const t = d / len;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      if (Math.abs(px) < 22 && Math.abs(pz) < 22) continue;
      kit.deco(px, 0.075, pz, horiz ? 2.6 : 0.22, 0.01, horiz ? 0.22 : 2.6, line);
    }
  }

  // plaza
  kit.deco(0, 0.04, 0, 40, 0.08, 40, 0xe6d6b8);
  for (let i = -3; i <= 3; i++) {
    kit.deco(i * 5.5, 0.085, 0, 0.3, 0.01, 40, 0xd2bf9c);
    kit.deco(0, 0.085, i * 5.5, 40, 0.01, 0.3, 0xd2bf9c);
  }
  // fountain: a round basin approximated by a ring of wall segments
  const R = 5.2, n = 20;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    kit.box(Math.sin(a) * R, 0.35, Math.cos(a) * R, 0.6, 0.7, 2 * R * Math.sin(Math.PI / n) + 0.1, 0xf0ece4, { yaw: a });
  }
  kit.cyl(0, 0.06, 0, R - 0.2, 0.12, 0x5ab8e0, { collide: false, seg: 24 });
  kit.cyl(0, 1.2, 0, 0.5, 2.4, 0xf0ece4);
  kit.cyl(0, 2.4, 0, 1.8, 0.25, 0xf0ece4, { seg: 18 });
  kit.cyl(0, 3.3, 0, 0.3, 1.6, 0xf0ece4);
  kit.sphere(0, 4.2, 0, 0.55, 0xffd23f, { collide: true });
  addWater(game, -4.9, 4.9, -4.9, 4.9, 0, 0.55, 0x6fdcff, 0.65);
  game.physics.cylinder(0, 0.05, 0, 4.9, 0.1, {});
  // planters + benches around the plaza
  for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
    kit.box(x, 0.4, z, 4, 0.8, 4, 0xb8a58a);
    kit.tree(x, z, 0.8, 0, 0.8);
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    kit.bench(Math.sin(a) * 9.5, Math.cos(a) * 9.5, a + Math.PI);
  }
}
