// TIKI JUNGLE — the jungle island south-west of home.
//
// Terrain: green hills around a ~90 m volcano with a crater at (-690, 900); a
// gully runs down its south-east flank into a lowland river at sea level
// (waterfall-friendly drop where the gully meets the lowland), sandy beaches
// all round, a flat shelf for the stilt village on the east shore (y = 1.5)
// with a shallow lagoon in front of it (y = -1.6, for stilts / huts on water).
import { fbm, ridged, smooth, blobDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';

const BLOBS = [[-640, 850, 280, 250], [-470, 765, 120, 90], [-770, 690, 120, 100]];
export const VOLCANO = { x: -690, z: 900, r: 165, h: 92 };
export const VILLAGE = { x0: -430, x1: -385, z0: 735, z1: 795, y: 1.5 };
export const LAGOON = { x0: -385, x1: -350, z0: 730, z1: 800, y: -1.6 };
const RIVER = [[-640, 860], [-560, 800], [-500, 830], [-445, 840], [-395, 860]];

function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best + (fbm(x / 30, z / 30) - 0.5) * 8;
}

function height(x, z) {
  const d = blobDist(x, z, BLOBS, 20, 21);
  let land = 2.2 + 12 * fbm(x / 70 - 6, z / 70 + 2) * smooth(-15, -90, d);
  const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  const cone = VOLCANO.h * Math.pow(Math.max(0, 1 - vd / VOLCANO.r), 1.7);
  land += cone * (0.9 + 0.2 * fbm(x / 30, z / 30)) + (ridged(x / 35, z / 35 + 4) - 0.5) * 10 * smooth(5, 40, cone);
  land -= smooth(26, 10, vd) * 24; // crater
  // gully down the flank, then a river at sea level through the lowland
  const rd = riverDist(x, z);
  const lowland = smooth(16, 6, land);
  land -= smooth(14, 4, rd) * (5 * (1 - lowland));
  land = land + (-1.3 - land) * smooth(11, 5, rd) * lowland;
  return coastBlend(land, d, 50);
}

function color(x, z, h, slope, out) {
  out.copy(B.jungle).lerp(B.jungle2, smooth(0.35, 0.7, fbm(x / 20, z / 20)) * 0.8);
  out.lerp(B.jungle3, smooth(0.6, 0.8, fbm(x / 8 + 3, z / 8)) * 0.5);
  const rn = (fbm(x / 13 + 50, z / 13 + 9) - 0.5) * 0.5;
  out.lerp(B.mud, smooth(0.6, 1.0, slope + rn) * 0.75);
  const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  out.lerp(B.lava, smooth(50, 72, h) * 0.9).lerp(B.lava2, smooth(40, 20, vd) * 0.8);
  if (riverDist(x, z) < 13 && h < 3) out.lerp(B.mud, 0.5);
  if (h < 2.6 && slope < 0.5) out.lerp(B.jsand, smooth(2.6, 1.8, h));
  return waterTint(h, out);
}

export const region = {
  id: 'jungle', name: 'Tiki Jungle', biome: 'jungle', signText: 'TIKI JUNGLE',
  centre: [-620, 830],
  bounds: [-960, -300, 520, 1140], step: 4,
  height, color,
  sand: (x, z, h) => h < 2.2,
  flats: [[VILLAGE.x0, VILLAGE.x1, VILLAGE.z0, VILLAGE.z1, VILLAGE.y, 18], [LAGOON.x0, LAGOON.x1, LAGOON.z0, LAGOON.z1, LAGOON.y, 25]],
  roads: [], pits: [],
  labels: [{ name: 'Volcano', x: VOLCANO.x, z: VOLCANO.z - 25 }, { name: 'Stilt Village', x: -405, z: 765 }],
  docks: [{ id: 'jungle', name: 'Tiki Jungle', x: -405, z: 815, yaw: Math.PI / 2 }],
};

export function prepare(T) {}

export function build(game, kit, R) {
  R.welcomeSign(-418, 805, Math.PI / 2);
  // placeholder tiki hut on the village shelf
  const y = VILLAGE.y;
  for (const [ox, oz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) kit.cyl(-410 + ox, y + 1.5, 760 + oz, 0.18, 3, 0x7a5032);
  kit.box(-410, y + 3.1, 760, 7, 0.3, 7, 0xb98a5a);
  kit.cone(-410, y + 4.6, 760, 5.2, 3, 0xd8b45a, { seg: 8 });
  for (const [x, z] of [[-440, 720], [-455, 790], [-470, 750], [-430, 830]]) R.tree(x, z, 2, 1.1);
  R.npc('explorer', -415, 775);
}
