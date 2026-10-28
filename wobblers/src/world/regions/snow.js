// FROSTPEAK — the icy mountain island north of home.
//
// Terrain: a big snowy massif (summit ~170 m around (-40, -1165), with the
// observatory on a little plateau) with lower peaks east and west and snowy
// foothills to the south. The ski village sits on a flat shelf at y = 8
// (x -80..80, z -845..-755); the Frostpeak Ferry docks at (75, -735) beside a
// little fishing hamlet. A chairlift climbs from the village to a shelf below
// the summit (y = 132); a groomed piste winds back down. West of the village:
// the frozen lake, the ski jump, the ice cave and (higher up) a mountain cabin.
// Positions live in snow/layout.js; the builders are in snow/*.js.
import { fbm, ridged, smooth, blobDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';
import * as THREE from 'three';
import { VILLAGE, TOP, SUMMIT, LAKE, CAVE, CABIN, HAMLET, JUMP, PISTE_W, pisteAt, SUMMIT_TRACK, LIFT } from './snow/layout.js';
import './snow/vehicles.js';
import './snow/npcs.js';
import { buildVillage, buildHamlet } from './snow/village.js';
import { buildLift } from './snow/lift.js';
import { buildSlopes, snowSurfaces } from './snow/slopes.js';
import { buildPeak } from './snow/peak.js';
import { buildFun } from './snow/fun.js';
import { buildForest, forestMask } from './snow/forest.js';
import { spawnFolk } from './snow/npcs.js';
import { buildSnowAnimals } from './snow/animals.js';

export { VILLAGE };

const BLOBS = [[0, -1090, 360, 270], [-10, -830, 190, 110], [230, -1000, 150, 140], [-250, -1060, 150, 170],
  [-150, -830, 80, 58], [122, -790, 52, 40]];
const PEAKS = [[-40, -1170, 150, 190], [150, -1110, 95, 130], [-230, -1060, 75, 120], [70, -985, 45, 90]];

function baseHeight(x, z) {
  const d = blobDist(x, z, BLOBS, 22, 3);
  let land = 3 + 7 * fbm(x / 90 + 4, z / 90 - 2) * smooth(-10, -80, d);
  let m = 0;
  for (const [px, pz, ph, pr] of PEAKS) { const q = Math.hypot(x - px, z - pz) / pr; m += ph * Math.exp(-q * q); }
  land += m * (0.82 + 0.3 * fbm(x / 40, z / 40)) + (ridged(x / 55 + 7, z / 55) - 0.45) * 26 * smooth(15, 90, m);
  return coastBlend(land, d, 45);
}

// Colours. From afar the massif must not read as one white blob: grey rock
// bands on the steep faces (strata with snow lying on their ledges), dark
// pine forest belts on the lower slopes, blue shade on the north-facing
// (away from the sun) flanks, wind-scoured ridges and bright snow fields.
const C = (h) => new THREE.Color(h);
const K = {
  rockA: C(0x575a68), rockB: C(0x40424e), rockC: C(0x6e6258), forest: C(0x24503a), forest2: C(0x1c4030),
  shadeSnow: C(0xbccfe8), brightSnow: C(0xfbfdff), packed: C(0xe2dfe0), groomed: C(0xf4f8ff),
};
const _t = new THREE.Color();
// baseHeight on the region's 4 m grid, cached (the colour pass reads neighbours)
const GX0 = -480, GZ0 = -1440, GNX = 241, GNZ = 201, _bc = new Float32Array(GNX * GNZ).fill(NaN);
function cachedBase(x, z) {
  const i = Math.round((x - GX0) / 4), j = Math.round((z - GZ0) / 4);
  if (i < 0 || j < 0 || i >= GNX || j >= GNZ || Math.abs(GX0 + i * 4 - x) > 0.01 || Math.abs(GZ0 + j * 4 - z) > 0.01) return baseHeight(x, z);
  const k = j * GNX + i;
  let v = _bc[k];
  if (v !== v) v = _bc[k] = baseHeight(x, z);
  return v;
}
function color(x, z, h, slope, out) {
  // snow base with soft drifts
  out.copy(B.snow).lerp(K.brightSnow, smooth(0.45, 0.8, fbm(x / 30 + 3, z / 30)) * 0.6);
  // aspect: slopes facing north (-z, away from the sun) sit in blue shade
  const e = 4, gz = (cachedBase(x, z + e) - cachedBase(x, z - e)) / (2 * e), gx = (cachedBase(x + e, z) - cachedBase(x - e, z)) / (2 * e);
  const north = gz > 0 ? 0 : -gz; // ground rising toward +z faces -z (north)
  out.lerp(K.shadeSnow, smooth(0.05, 0.6, north + gx * 0.15) * 0.75);
  out.lerp(B.snowShade, smooth(0.45, 0.85, fbm(x / 9, z / 9)) * 0.25);
  // pine forest belts on the lower slopes (trees planted to match, snow/forest.js)
  const fm = forestMask(x, z, h, slope);
  if (fm > 0) out.lerp(_t.copy(K.forest).lerp(K.forest2, fbm(x / 7, z / 7)), fm * 0.9);
  // rock: steep faces show strata bands, snow on the ledges between them
  const rn = (fbm(x / 13 + 50, z / 13 + 9) - 0.5) * 0.5;
  const steep = smooth(0.36, 0.85, slope + rn);
  if (steep > 0) {
    const band = Math.sin(h * 0.42 + fbm(x / 35, z / 35) * 5);
    _t.copy(K.rockA).lerp(K.rockB, smooth(-0.2, 0.6, band)).lerp(K.rockC, smooth(0.55, 0.9, fbm(x / 18 - 7, z / 18)) * 0.5);
    const ledge = smooth(0.55, 0.95, band) * smooth(1.3, 0.7, slope); // snow lies on the flatter band tops
    out.lerp(_t, steep * (1 - ledge * 0.7));
  }
  // wind-scoured ridges and crags high up
  if (h > 60) out.lerp(K.rockB, smooth(0.62, 0.8, ridged(x / 40 + 7, z / 40)) * smooth(60, 110, h) * smooth(0.25, 0.5, slope) * 0.8);
  if (h > 120) out.lerp(B.ice, smooth(120, 170, h) * 0.25 * (1 - steep));
  // pistes and the summit track are groomed bright; the village is trodden
  if (h < 2.2) out.lerp(B.shingle, smooth(2.2, 1.2, h));
  return waterTint(h, out);
}

// The groomed piste is carved here (not as road strips: overlapping strips
// would step it): the nearest point of the centre line sets its height.
function height(x, z) {
  const h = baseHeight(x, z), p = pisteAt(x, z);
  if (p.d > 26) return h;
  return p.y + (h - p.y) * smooth(PISTE_W / 2 + 1, PISTE_W / 2 + 16, p.d);
}

const roads = [];
{
  for (let i = 0; i < SUMMIT_TRACK.length - 1; i++) {
    const a = SUMMIT_TRACK[i], b = SUMMIT_TRACK[i + 1];
    roads.push({ a: [a[0], a[1]], b: [b[0], b[1]], w: 7, h0: a[2], h1: b[2], blend: 10 });
  }
  // ski jump in-run and landing hill
  roads.push({ a: [JUMP.x, JUMP.zTop], b: [JUMP.x, JUMP.zLip], w: JUMP.w + 2, h0: JUMP.yTop, h1: JUMP.yLip, blend: 10 });
  roads.push({ a: [JUMP.x, JUMP.zLip + 6], b: [JUMP.x, -856], w: 18, h0: JUMP.yLip - 4, h1: VILLAGE.y + 1, blend: 12 });
}

export const region = {
  id: 'snow', name: 'Frostpeak', biome: 'snow', signText: 'FROSTPEAK',
  centre: [0, -1050],
  bounds: [-480, 480, -1440, -640], step: 4,
  height, color,
  sand: (x, z, h) => h < 2.2,
  flats: [
    [VILLAGE.x0, VILLAGE.x1, VILLAGE.z0, VILLAGE.z1, VILLAGE.y, 40],
    [TOP.x0, TOP.x1, TOP.z0, TOP.z1, TOP.y, 18],
    [SUMMIT.x - SUMMIT.r, SUMMIT.x + SUMMIT.r, SUMMIT.z - SUMMIT.r, SUMMIT.z + SUMMIT.r, SUMMIT.y, 16],
    [LAKE.x - LAKE.r - 3, LAKE.x + LAKE.r + 3, LAKE.z - LAKE.r - 3, LAKE.z + LAKE.r + 3, LAKE.y, 16],
    [CAVE.x - CAVE.w / 2, CAVE.x + CAVE.w / 2, CAVE.z - CAVE.d / 2, CAVE.z + CAVE.d / 2, CAVE.y, 5],
    [CABIN.x - 12, CABIN.x + 12, CABIN.z - 10, CABIN.z + 10, CABIN.y, 12],
    [HAMLET.x0, HAMLET.x1, HAMLET.z0, HAMLET.z1, HAMLET.y, 12],
    [JUMP.x - 6, JUMP.x + 6, JUMP.zTop - 8, JUMP.zTop, JUMP.yTop, 8], // start platform
  ],
  roads, pits: [],
  labels: [
    { name: 'Frostpeak Summit', x: -40, z: -1185 }, { name: 'Observatory', x: SUMMIT.x + 22, z: SUMMIT.z + 6 },
    { name: 'Ski Village', x: 0, z: -800 }, { name: 'Chairlift', x: LIFT.x - 14, z: -960 },
    { name: 'Blue Run', x: 108, z: -985 }, { name: 'Frozen Lake', x: LAKE.x, z: LAKE.z + 32 },
    { name: 'Ski Jump', x: JUMP.x + 16, z: JUMP.zLip - 20 }, { name: 'Ice Cave', x: CAVE.x, z: CAVE.z + 24 },
    { name: 'Mountain Cabin', x: CABIN.x, z: CABIN.z + 18 }, { name: 'Fisher\'s Cove', x: 125, z: -748 },
  ],
  // ferry dock: land end of the pier and the direction it points out to sea
  docks: [{ id: 'snow', name: 'Frostpeak', x: 75, z: -735, yaw: 0, reach: 12 }],
};

export function prepare(T) {}

export function build(game, kit, R) {
  const t = {}, T = (k, fn) => { const t0 = performance.now(); fn(); t[k] = Math.round(performance.now() - t0); };
  T('slopes', () => buildSlopes(game, kit, R));
  T('lift', () => buildLift(game, kit, R));
  T('village', () => buildVillage(game, kit, R));
  T('hamlet', () => buildHamlet(game, kit, R));
  T('peak', () => buildPeak(game, kit, R));
  T('fun', () => buildFun(game, kit, R));
  T('forest', () => buildForest(game, kit, R));
  T('folk', () => spawnFolk(game, R));
  T('animals', () => buildSnowAnimals(game, R));
  game.snow = { times: t, surfaces: snowSurfaces };
}
