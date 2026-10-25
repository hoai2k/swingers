// Dusty Dunes layout: every place on the desert island in one spot, shared by
// the terrain descriptor (desert.js) and the builders in this folder.
//
//          plateau (y 27) ─ rope bridge over the canyon at x -1100
//   mine tunnel ═╗ canyon floor (y 5) + mine-cart track ═══ pass ═ town
//   pyramid (W)        town (y 4, main street z -30) ── highway ── gas/diner ── dock
//   dunes + jumps      dig site       oasis (S of town)
//   mesas (SW, ladder up the big one)
export const TOWN = { x0: -1020, x1: -900, z0: -100, z1: 40, y: 4, street: -30 };
export const OASIS = { x: -935, z: 165, r: 26 };
export const MESAS = [[-1235, 120, 48, 30], [-1150, 250, 38, 22]];
export const canyonZ = (x) => -232 + 28 * Math.sin(x / 55);
export const CANYON_Y = 5;              // flattened canyon floor (the mine track runs on it)
export const CANYON_X = [-1296, -1010];  // floor road from the mine tunnel to the pass
export const PLATEAU_Y = 27;

// Mine: tunnel dug into the plateau at the canyon's west end (a pit + a rock lid)
export const MINE = { x0: -1312, x1: -1268, z0: -214, z1: -196, y: CANYON_Y, tunnelX: -1270, station: -1072 };
// Pass from the town's NW corner down into the canyon
export const PASS = { a: [-1012, -100], b: [-1016, -213], w: 10 };
// Ramp road up onto the plateau, east end
export const RAMP = { a: [-880, -116], b: [-880, -193], w: 9 };
// Rope bridge across the canyon (north-south) on the plateau top
export const BRIDGE = { x: -1100, z0: -241.5, z1: -279.5, y: PLATEAU_Y + 0.15 };

export const PYRAMID = { x: -1240, z: -40, y: 8, half: 21 };
export const DIG = { x0: -1092, x1: -1072, z0: 96, z1: 114, y: 1.2, around: 3.6 };
export const GAS = { x: -848, z: -12, y: 3.6 };     // gas station + diner, north of the highway
export const DOCK = { x: -760, z: 40 };

// Highway (asphalt) and dirt tracks: [[x, z, y], ...] polylines
export const HIGHWAY = [[-766, 39, 2.2], [-805, 26, 3.2], [-836, 13, 3.6], [-870, -6, 3.9], [-900, -30, 4]];
export const HIGHWAY_W = [[-1020, -30, 4], [-1070, -34, 4.6], [-1130, -38, 6.4], [-1196, -40, 8]];
export const DIRT = [
  [[-950, 40, 4], [-948, 80, 3.7], [-944, 130, 3.4]],          // town -> oasis
  [[-1020, 20, 4], [-1050, 60, 3.8], [-1082, 92, 3.6]],        // town -> dig site
];
export const ROAD_W = 9, DIRT_W = 5;

// distance from (x, z) to a polyline [[x, z, ...], ...]
export function polyDist(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
