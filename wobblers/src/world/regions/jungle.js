// TIKI JUNGLE — the jungle island south-west of home.
//
// Terrain: green hills round a ~90 m volcano with a lava crater at (-690, 900)
// and a switchback trail spiralling up to its rim; a gully runs down the
// north-east flank to a rock cliff with a waterfall (and a cave behind it)
// that drops into a plunge pool, and the river winds from there to the sea
// (bed below sea level, so canoes can paddle in from the coast). The stilt
// village sits on a shelf on the east shore (y = 1.5) with a shallow lagoon in
// front (y = -1.6); temple ruins on a terrace west of the village.
//
// Content lives in jungle/: flora (instanced-ish merged foliage), rides (zip
// lines, vines, rope bridges, path rides), vehicles (jeep, canoe, log raft),
// npcs (roles), volcano, river (waterfall, cave, raft ride, current), village,
// temple, wild (mushrooms, vines, scattered foliage).
import { fbm, ridged, smooth, blobDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';
import './jungle/vehicles.js';
import './jungle/npcs.js';
import { buildVolcano } from './jungle/volcano.js';
import { buildRiver } from './jungle/river.js';
import { buildVillage } from './jungle/village.js';
import { buildTemple } from './jungle/temple.js';
import { buildWild } from './jungle/wild.js';

const BLOBS = [[-640, 850, 280, 250], [-470, 765, 120, 90], [-770, 690, 120, 100]];
export const VOLCANO = { x: -690, z: 900, r: 165, h: 92, rim: 22 };
export const LAVA = { x: -690, z: 900, r: 13, y: 56 };
export const VILLAGE = { x0: -430, x1: -385, z0: 735, z1: 795, y: 1.5 };
export const LAGOON = { x0: -385, x1: -350, z0: 730, z1: 800, y: -1.6 };
export const TEMPLE = { x: -540, z: 710, y: 9 };
// gully from the crater flank down to the top of the waterfall cliff
export const GULLY = [[-664, 880], [-641, 861], [-622, 845]];
// the rock block the waterfall falls from (cave inside), its face at x = x1
export const CLIFF = { x0: -606, x1: -586, z0: 799, z1: 833, top: 14 };
export const POOL = { x: -569, z: 816, r: 13 };
// lowland river from the plunge pool to the sea
export const RIVER = [[-569, 816], [-540, 820], [-505, 829], [-462, 840], [-420, 853], [-385, 866], [-350, 880], [-315, 894]];
export const RIVER_BED = -2.4;
// jeep track from the village to the foot of the volcano trail
export const TRACK = [[-436, 770], [-482, 776], [-540, 786], [-605, 784], [-662, 776], [-722, 779]];

export function polyDist(x, z, P) {
  let best = 1e9, bs = 0, acc = 0, s = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) { best = d; bs = acc + t * L; }
    acc += L;
  }
  s = bs;
  return [best, s, acc];
}
const riverDist = (x, z) => polyDist(x, z, RIVER)[0] + (fbm(x / 30, z / 30) - 0.5) * 5;

// natural ground (no flats / trail): also used to lay the trail and the track
export function natural(x, z) {
  const d = blobDist(x, z, BLOBS, 20, 21);
  let land = 2.2 + 12 * fbm(x / 70 - 6, z / 70 + 2) * smooth(-15, -90, d);
  const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  const cone = VOLCANO.h * Math.pow(Math.max(0, 1 - Math.max(vd, VOLCANO.rim) / VOLCANO.r), 1.7);
  land += cone * (0.9 + 0.2 * fbm(x / 30, z / 30)) + (ridged(x / 35, z / 35 + 4) - 0.5) * 10 * smooth(5, 40, cone) * smooth(14, 30, vd);
  // crater bowl with a flat lava floor
  land -= smooth(VOLCANO.rim + 1, 9, vd) * 18;
  land = land + (LAVA.y - 1 - land) * smooth(LAVA.r + 1, LAVA.r - 3, vd);
  // gully down the flank (above the lowland)
  const gd = polyDist(x, z, GULLY)[0];
  land -= smooth(11, 3, gd) * 4.5 * smooth(6, 14, land);
  // lowland river + plunge pool (beds below sea level: real water, boats float)
  const rd = riverDist(x, z);
  land = land + (RIVER_BED - land) * smooth(15, 7, rd) * (land > RIVER_BED ? 1 : 0);
  const pd = Math.hypot(x - POOL.x, z - POOL.z) - POOL.r;
  if (land > RIVER_BED - 0.4) land = land + (RIVER_BED - 0.4 - land) * smooth(5, -2, pd);
  // under the cliff block (its rocks are kit geometry): flat, low
  if (x > CLIFF.x0 + 1 && x < CLIFF.x1 + 4.5 && z > CLIFF.z0 + 1 && z < CLIFF.z1 - 1) land = Math.min(land, 0.4);
  return coastBlend(land, d, 50);
}

function color(x, z, h, slope, out) {
  out.copy(B.jungle).lerp(B.jungle2, smooth(0.35, 0.7, fbm(x / 20, z / 20)) * 0.8);
  out.lerp(B.jungle3, smooth(0.6, 0.8, fbm(x / 8 + 3, z / 8)) * 0.5);
  const rn = (fbm(x / 13 + 50, z / 13 + 9) - 0.5) * 0.5;
  out.lerp(B.mud, smooth(0.6, 1.0, slope + rn) * 0.75);
  const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  out.lerp(B.lava, smooth(48, 66, h) * 0.9).lerp(B.lava2, smooth(VOLCANO.rim + 8, VOLCANO.rim - 4, vd) * 0.85);
  if (vd < LAVA.r + 4) out.lerp(B.lava, 1).multiplyScalar(0.7 + 0.3 * smooth(LAVA.r + 4, LAVA.r, vd));
  if (riverDist(x, z) < 15 && h < 3) out.lerp(B.mud, 0.5);
  if (polyDist(x, z, TRACK)[0] < 3.2 || trailDist(x, z) < 3) out.lerp(B.mud, 0.85);
  if (h < 2.6 && slope < 0.5) out.lerp(B.jsand, smooth(2.6, 1.8, h));
  return waterTint(h, out);
}

// ---- volcano trail: a spiral of road flats from the north foot up to the rim -------
export const TRAIL = [];
{
  const a0 = -105, a1 = -372, n = 22;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (a0 + (a1 - a0) * t) * Math.PI / 180, r = 125 + (31 - 125) * Math.pow(t, 0.85);
    TRAIL.push([VOLCANO.x + r * Math.cos(a), VOLCANO.z + r * Math.sin(a)]);
  }
}
let trailH = null;
function trailDist(x, z) { return polyDist(x, z, TRAIL)[0]; }

export const region = {
  id: 'jungle', name: 'Tiki Jungle', biome: 'jungle', signText: 'TIKI JUNGLE',
  centre: [-620, 830],
  bounds: [-960, -300, 520, 1140], step: 4,
  height: natural, color,
  sand: (x, z, h) => h < 2.2 && polyDist(x, z, TRACK)[0] > 4,
  flats: [[VILLAGE.x0, VILLAGE.x1, VILLAGE.z0, VILLAGE.z1, VILLAGE.y, 18], [LAGOON.x0, LAGOON.x1, LAGOON.z0, LAGOON.z1, LAGOON.y, 25]],
  roads: [], pits: [],
  labels: [{ name: 'Volcano', x: VOLCANO.x, z: VOLCANO.z - 25, big: true }, { name: 'Stilt Village', x: -405, z: 765 }],
  docks: [{ id: 'jungle', name: 'Tiki Jungle', x: -405, z: 815, yaw: Math.PI / 2 }],
};

export function prepare(T) {
  T.addFlat(TEMPLE.x - 22, TEMPLE.x + 22, TEMPLE.z - 22, TEMPLE.z + 22, TEMPLE.y, 14);
  // trail: heights follow the natural slope, smoothed and never going down
  const hs = TRAIL.map(([x, z]) => natural(x, z));
  for (let i = 1; i < hs.length; i++) hs[i] = Math.max(hs[i], hs[i - 1] + 0.4);
  const sm = hs.map((h, i) => (hs[Math.max(0, i - 1)] + h * 2 + hs[Math.min(hs.length - 1, i + 1)]) / 4);
  trailH = sm;
  for (let i = 0; i < TRAIL.length - 1; i++) T.addRoadFlat(TRAIL[i], TRAIL[i + 1], 5.5, sm[i], sm[i + 1], 9);
  // jeep track
  const th = TRACK.map(([x, z]) => Math.max(1.6, natural(x, z)));
  th[0] = VILLAGE.y; th[th.length - 1] = sm[0];
  for (let i = 0; i < TRACK.length - 1; i++) T.addRoadFlat(TRACK[i], TRACK[i + 1], 6, th[i], th[i + 1], 10);
}
export const trailHeights = () => trailH;

export function build(game, kit, R) {
  const t = {};
  const T = (n, f) => { const t0 = performance.now(); f(); t[n] = Math.round(performance.now() - t0); };
  R.welcomeSign(-418, 805, Math.PI / 2);
  T('village', () => buildVillage(game, kit, R));
  T('river', () => buildRiver(game, kit, R));
  T('volcano', () => buildVolcano(game, kit, R));
  T('temple', () => buildTemple(game, kit, R));
  T('wild', () => buildWild(game, kit, R));
  (game.buildTimes ||= {}).jungleParts = t;
  R.label('Waterfall', CLIFF.x1, CLIFF.z0 - 8);
  R.label('Temple Ruins', TEMPLE.x, TEMPLE.z - 26);
}
