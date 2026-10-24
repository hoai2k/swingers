// FROSTPEAK — the icy mountain island north of home.
//
// Terrain: a big snowy massif (main peak ~150 m at (-40, -1170)) with lower
// peaks east and west, rolling snowy foothills to the south and a flat shelf
// for the ski village at (0, -800), y = 8. Shingle beaches; the ferry from the
// home island's north coast docks on the south shore.
import { fbm, ridged, smooth, blobDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';

const BLOBS = [[0, -1090, 360, 270], [-10, -830, 190, 110], [230, -1000, 150, 140], [-250, -1060, 150, 170]];
const PEAKS = [[-40, -1170, 150, 190], [150, -1110, 95, 130], [-230, -1060, 75, 120], [70, -985, 45, 90]];
export const VILLAGE = { x0: -80, x1: 80, z0: -845, z1: -755, y: 8 };

function height(x, z) {
  const d = blobDist(x, z, BLOBS, 22, 3);
  let land = 3 + 7 * fbm(x / 90 + 4, z / 90 - 2) * smooth(-10, -80, d);
  let m = 0;
  for (const [px, pz, ph, pr] of PEAKS) { const q = Math.hypot(x - px, z - pz) / pr; m += ph * Math.exp(-q * q); }
  land += m * (0.82 + 0.3 * fbm(x / 40, z / 40)) + (ridged(x / 55 + 7, z / 55) - 0.45) * 26 * smooth(15, 90, m);
  return coastBlend(land, d, 45);
}

function color(x, z, h, slope, out) {
  const n = fbm(x / 22 + 9, z / 22 - 3);
  // low ground: pines and grass under patchy snow; everything else white
  out.copy(B.pine).lerp(B.snow, smooth(0.35, 0.65, n + smooth(4, 16, h) * 0.6));
  out.lerp(B.snowShade, smooth(0.4, 0.8, fbm(x / 9, z / 9)) * 0.35);
  const rn = (fbm(x / 13 + 50, z / 13 + 9) - 0.5) * 0.5;
  out.lerp(B.frostRock, smooth(0.75, 1.15, slope + rn) * 0.9);
  if (h > 95) out.lerp(B.ice, smooth(95, 140, h) * 0.35);
  if (h < 2.2) out.lerp(B.shingle, smooth(2.2, 1.2, h));
  return waterTint(h, out);
}

export const region = {
  id: 'snow', name: 'Frostpeak', biome: 'snow', signText: 'FROSTPEAK',
  centre: [0, -1050],
  bounds: [-480, 480, -1440, -640], step: 4,
  height, color,
  sand: (x, z, h) => h < 2.2,
  flats: [[VILLAGE.x0, VILLAGE.x1, VILLAGE.z0, VILLAGE.z1, VILLAGE.y, 40]],
  roads: [], pits: [],
  labels: [{ name: 'Frostpeak Summit', x: -40, z: -1170 }, { name: 'Ski Village', x: 0, z: -815 }],
  // ferry dock: land end of the pier and the direction it points out to sea
  docks: [{ id: 'snow', name: 'Frostpeak', x: 75, z: -735, yaw: 0, reach: 12 }],
};

export function prepare(T) {}

export function build(game, kit, R) {
  R.welcomeSign(40, -760, 0);
  // placeholder ski lodge on the village shelf
  const y = VILLAGE.y;
  kit.box(-20, y + 3, -810, 16, 6, 10, 0x9a6a42);
  kit.wedge(-20, y + 6, -812.5, 17, 5, 2.6, 0xe8eef5, { yaw: 0 });
  kit.wedge(-20, y + 6, -807.5, 17, 5, 2.6, 0xe8eef5, { yaw: Math.PI });
  for (const [x, z] of [[30, -800], [45, -830], [-55, -790], [60, -790]]) R.tree(x, z, 1, 1.1);
  R.npc('skier', 10, -800);
  R.npc('skier', -30, -805, { colors: { shirt: 0x3f8cff } });
}
