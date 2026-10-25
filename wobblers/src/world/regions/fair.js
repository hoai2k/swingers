// STRATFORD FALL FAIR — an autumn fairground island north-east of home (in the
// open sea between Frostpeak and Bigtown), reached by the Fair Ferry from the
// home island's north-east dock.
//
// Terrain: an oval island with golden-green grass, maple-leaf litter patches
// and an orchard hill on the north-east lobe; the fairground is one flat plot
// (layout.js FAIR, y = 2.2) with a dirt midway from the entrance arch (west)
// to the east fence. Fourteen rides line the midway (fair/rides*.js: kinematic
// bodies animated in physics.animators, seats in game.seats); autumn decor,
// stalls and falling leaves are fair/decor.js; teenagers fair/npcs.js.
import { fbm, smooth, blobDist, coastBlend, waterTint } from '../../terrain.js';
import * as THREE from 'three';
import { FAIR, MIDWAY, DOCK, HILL, PATCH, ORCHARD, RIDES, CENTRE } from './fair/layout.js';
import { BIOME_CSS } from '../../regionbanner.js';
import './fair/npcs.js';
import { FairRides } from './fair/common.js';
import { buildRidesA } from './fair/rides-a.js';
import { buildRidesB } from './fair/rides-b.js';
import { buildTrain } from './fair/train.js';
import { buildDecor, buildLeaves } from './fair/decor.js';
import { spawnTeens } from './fair/npcs.js';

BIOME_CSS.fair = '#e0702a'; // "Welcome to Stratford Fall Fair!" banner colour

const BLOBS = [[840, -845, 222, 178], [1000, -985, 78, 62], [700, -930, 60, 50]];

function height(x, z) {
  const d = blobDist(x, z, BLOBS, 12, 11);
  const hd = Math.hypot(x - HILL.x, z - HILL.z);
  const land = 2.4 + 2.6 * fbm(x / 60 + 3, z / 60 - 8) + HILL.h * Math.exp(-(hd * hd) / (HILL.r * HILL.r)) * (0.85 + 0.3 * fbm(x / 20, z / 20));
  return coastBlend(land, d, 44);
}

const C = (h) => new THREE.Color(h);
const K = {
  grass: C(0x8fb64c), grass2: C(0x7aa844), gold: C(0xc9a64a), litter: C(0xd8782f), litter2: C(0xb84a2a),
  dirt: C(0xc9a374), straw: C(0xdcc488), sand: C(0xf0dca4), orchard: C(0x86a446),
};
const _t = new THREE.Color();
function color(x, z, h, slope, out) {
  out.copy(K.grass).lerp(K.grass2, smooth(0.35, 0.75, fbm(x / 22, z / 22)));
  // golden autumn grass in broad patches, maple-leaf litter in small ones
  out.lerp(K.gold, smooth(0.55, 0.78, fbm(x / 40 + 9, z / 40 - 3)) * 0.75);
  out.lerp(K.litter, smooth(0.58, 0.8, fbm(x / 30 - 11, z / 30 + 2)) * 0.45);
  const lit = smooth(0.56, 0.72, fbm(x / 9 - 4, z / 9 + 6));
  out.lerp(_t.copy(K.litter).lerp(K.litter2, fbm(x / 4, z / 4)), lit * 0.9);
  // the fairground: trodden straw-and-dirt midway and paths, grass between the rides
  const inFair = x > FAIR.x0 - 2 && x < FAIR.x1 + 2 && z > FAIR.z0 - 2 && z < FAIR.z1 + 2;
  if (inFair) {
    out.lerp(K.straw, 0.25 * smooth(0.4, 0.7, fbm(x / 7, z / 7)));
    const mid = Math.abs(z - MIDWAY.z);
    if (mid < MIDWAY.w / 2 + 1) out.lerp(_t.copy(K.dirt).lerp(K.straw, fbm(x / 3, z / 3) * 0.6), smooth(MIDWAY.w / 2 + 1, MIDWAY.w / 2 - 1, mid));
  }
  // the path from the dock to the arch
  if (x > DOCK.x - 6 && x < FAIR.x0 + 2 && Math.abs(z - (DOCK.z + (x - DOCK.x) / (FAIR.x0 - DOCK.x) * (MIDWAY.z - DOCK.z))) < 3.2) out.lerp(K.dirt, 0.85);
  if (slope > 0.6) out.lerp(K.litter2, smooth(0.6, 1.1, slope) * 0.4);
  if (h < 2.0) out.lerp(K.sand, smooth(2.0, 1.2, h));
  return waterTint(h, out);
}

export const region = {
  id: 'fair', name: 'Stratford Fall Fair', biome: 'fair', signText: 'STRATFORD FALL FAIR',
  centre: [CENTRE.x, CENTRE.z],
  bounds: [540, 1150, -1110, -590], step: 4,
  height, color,
  sand: (x, z, h) => h < 1.7,
  flats: [[FAIR.x0, FAIR.x1, FAIR.z0, FAIR.z1, FAIR.y, 18]],
  roads: [{ a: [DOCK.x - 4, DOCK.z], b: [FAIR.x0, MIDWAY.z], w: 6, h0: FAIR.y, h1: FAIR.y, blend: 10 }],
  pits: [],
  labels: [
    { name: 'Stratford Fall Fair', x: CENTRE.x, z: CENTRE.z - 10, big: true },
    { name: 'Midway', x: CENTRE.x + 30, z: MIDWAY.z + 9 },
    { name: 'Pumpkin Patch', x: PATCH.x, z: PATCH.z + 26 },
    { name: 'Orchard Hill', x: ORCHARD.x, z: ORCHARD.z - 30 },
    { name: 'Ferris Wheel', x: RIDES.ferris.x, z: RIDES.ferris.z - 16 },
    { name: 'Drop Tower', x: RIDES.droptower.x, z: RIDES.droptower.z - 12 },
  ],
  docks: [{ id: 'fair', name: 'Stratford Fall Fair', x: DOCK.x, z: DOCK.z, yaw: -Math.PI / 2 }],
};

export function prepare(T) {}

export function build(game, kit, R) {
  const t = {}, T = (k, fn) => { const t0 = performance.now(); fn(); t[k] = Math.round(performance.now() - t0); };
  const F = new FairRides(game, kit, R);
  T('decor', () => buildDecor(game, kit, R, F));
  T('ridesA', () => buildRidesA(game, kit, R, F));
  T('ridesB', () => buildRidesB(game, kit, R, F));
  T('train', () => buildTrain(game, kit, R, F));
  T('leaves', () => buildLeaves(game, F));
  T('teens', () => spawnTeens(game, R, F));
  game.fair = { times: t, rides: F };
}
