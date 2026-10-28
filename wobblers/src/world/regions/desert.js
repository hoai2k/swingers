// DUSTY DUNES — the desert island west of home.
//
// Terrain: sand at y ~ 3 with rolling dunes to the west, a layered red-rock
// plateau (y 27) along the north coast cut by a winding canyon, two mesas in
// the south-west, an oasis pond (sea-level water) at (-935, 165) and a flat
// plot for the wild-west town at y = 4. On top of that (prepare): a flattened
// canyon floor for the mine-cart track, a pass from town down into the canyon,
// a ramp road up the plateau, the highway from the dock, plazas for the
// pyramid and gas station, the dig-site pit and the mine tunnel (a pit under a
// rock lid). Layout constants: desert/layout.js. Content: desert/*.js.
import { fbm, smooth, blobDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';
import * as THREE from 'three';
import {
  TOWN, OASIS, MESAS, canyonZ, CANYON_Y, CANYON_X, MINE, PASS, RAMP, PYRAMID, DIG, GAS,
  HIGHWAY, HIGHWAY_W, DIRT, ROAD_W, DIRT_W, PLATEAU_Y, polyDist,
} from './desert/layout.js';
import './desert/vehicles.js'; // dune buggy, monster truck, camel, horse (registerVehicle at import)
import { buildTown } from './desert/town.js';
import { buildCanyon } from './desert/canyon.js';
import { buildSites } from './desert/sites.js';
import { buildNature } from './desert/nature.js';
import { buildPeople } from './desert/people.js';
import { buildLoot } from './desert/loot.js';
import { buildDesertAnimals } from './desert/animals.js';

export { TOWN, OASIS };

const BLOBS = [[-1060, 0, 320, 350], [-860, 60, 120, 120], [-1180, -230, 160, 120]];

function terrace(h, step = 6) { // layered rock: steps with soft risers
  const k = h / step, f = k - Math.floor(k);
  return (Math.floor(k) + smooth(0.55, 1, f)) * step;
}
function rockMask(x, z) {
  // plateau along the north coast (z < ~-150), minus the canyon
  let p = smooth(-130, -170, z + 22 * Math.sin(x / 80));
  p *= 1 - smooth(18, 8, Math.abs(z - canyonZ(x))) * smooth(-1330, -1280, x) * smooth(-860, -900, x);
  let top = 24 * p;
  for (const [mx, mz, r, h] of MESAS) {
    const d = Math.hypot(x - mx, z - mz) + (fbm(x / 25, z / 25) - 0.5) * 16;
    top = Math.max(top, h * smooth(r + 10, r - 6, d));
  }
  return top;
}

function height(x, z) {
  const d = blobDist(x, z, BLOBS, 20, 11);
  let land = 3 + 1.5 * fbm(x / 60, z / 60);
  // dunes: long crests, taller to the west
  const u = (x * 0.8 + z * 0.6) / 22 + fbm(x / 120 + 3, z / 120) * 7;
  land += 7 * Math.pow(0.5 + 0.5 * Math.sin(u), 2) * smooth(-1000, -1130, x) * smooth(-10, -70, d);
  const rock = rockMask(x, z);
  if (rock > 0.5) land = Math.max(land, 3 + terrace(rock + 3 * fbm(x / 30, z / 30)));
  // oasis pond
  const od = Math.hypot(x - OASIS.x, z - OASIS.z);
  land = land + (-2.4 - land) * smooth(OASIS.r, OASIS.r * 0.5, od);
  return coastBlend(land, d, 55);
}

const ASPHALT = new THREE.Color(0x5a5650), LINE = new THREE.Color(0xf2d24a), DIRTC = new THREE.Color(0xc89a62);
const HW = [HIGHWAY, HIGHWAY_W];
function color(x, z, h, slope, out) {
  out.copy(B.sand).lerp(B.sand2, smooth(0.35, 0.7, fbm(x / 28, z / 28)) * 0.7);
  const rock = rockMask(x, z);
  if (rock > 0.5 && h > 5) {
    out.lerp(B.mesaTop, smooth(5, 9, h));
    const band = 0.5 + 0.5 * Math.sin(h * 1.6);
    out.lerp(B.redRock, smooth(0.35, 0.8, slope)).lerp(B.redRock2, smooth(0.35, 0.8, slope) * band * 0.6);
  } else if (slope > 0.9) out.lerp(B.redRock, 0.5);
  if (Math.abs(z - canyonZ(x)) < 14 && h < 9 && z < -150) out.lerp(B.canyon, 0.6);
  const od = Math.hypot(x - OASIS.x, z - OASIS.z);
  if (od < OASIS.r + 22 && h > 0.2) out.lerp(B.oasis, smooth(OASIS.r + 22, OASIS.r + 6, od));
  // roads painted into the ground (they show on the map too)
  for (const p of HW) {
    const d = polyDist(x, z, p);
    if (d < ROAD_W / 2 + 1) out.lerp(ASPHALT, smooth(ROAD_W / 2 + 1, ROAD_W / 2 - 0.5, d));
  }
  if (x > TOWN.x0 - 2 && x < TOWN.x1 + 2 && Math.abs(z - TOWN.street) < 7) out.lerp(DIRTC, 0.75); // main street
  for (const p of DIRT) { const d = polyDist(x, z, p); if (d < DIRT_W / 2 + 1.5) out.lerp(DIRTC, smooth(DIRT_W / 2 + 1.5, DIRT_W / 2 - 0.5, d) * 0.8); }
  if (x > RAMP.a[0] - RAMP.w / 2 && x < RAMP.a[0] + RAMP.w / 2 && z < RAMP.a[1] + 2 && z > RAMP.b[1] - 2) out.lerp(DIRTC, 0.7);
  return waterTint(h, out);
}

export const region = {
  id: 'desert', name: 'Dusty Dunes', biome: 'desert', signText: 'DUSTY DUNES',
  centre: [-1050, 0],
  bounds: [-1440, -680, -440, 440], step: 4,
  height, color,
  sand: (x, z, h) => Math.hypot(x - OASIS.x, z - OASIS.z) > OASIS.r + 12,
  flats: [[TOWN.x0, TOWN.x1, TOWN.z0, TOWN.z1, TOWN.y, 22]],
  roads: [], pits: [],
  labels: [
    { name: 'Dustville', x: -960, z: -45, big: true }, { name: 'Oasis', x: OASIS.x, z: OASIS.z + 35 },
    { name: 'Red Rock Canyon', x: -1150, z: -205 }, { name: 'Dune Sea', x: -1330, z: 20 },
    { name: 'Gold Mine', x: -1270, z: -230 }, { name: 'Rope Bridge', x: -1100, z: -290 },
    { name: 'Old Pyramid', x: PYRAMID.x, z: PYRAMID.z - 30 }, { name: 'Dig Site', x: -1082, z: 130 },
    { name: 'Big Mesa', x: -1235, z: 175 }, { name: 'Gas & Diner', x: GAS.x, z: GAS.z - 22 },
  ],
  docks: [{ id: 'desert', name: 'Dusty Dunes', x: -760, z: 40, yaw: Math.PI / 2 }],
};

export function prepare(T) {
  // highway + dirt tracks (sloped flat strips between the polyline points)
  const strip = (pts, w, blend) => { for (let i = 0; i < pts.length - 1; i++) T.addRoadFlat([pts[i][0], pts[i][1]], [pts[i + 1][0], pts[i + 1][1]], w, pts[i][2], pts[i + 1][2], blend); };
  strip(HIGHWAY, ROAD_W + 1, 10);
  strip(HIGHWAY_W, ROAD_W + 1, 12);
  for (const p of DIRT) strip(p, DIRT_W + 1, 8);
  // canyon floor (flat for the mine track and for driving), the pass and the plateau ramp
  for (let x = CANYON_X[0]; x < CANYON_X[1]; x += 12) T.addRoadFlat([x, canyonZ(x)], [x + 12, canyonZ(x + 12)], 13, CANYON_Y, CANYON_Y, 6);
  T.addRoadFlat(PASS.a, PASS.b, PASS.w, TOWN.y, CANYON_Y, 7);
  T.addRoadFlat(RAMP.a, RAMP.b, RAMP.w, TOWN.y, PLATEAU_Y, 5);
  // plazas
  const P = PYRAMID;
  T.addFlat(P.x - P.half - 8, P.x + P.half + 8, P.z - P.half - 8, P.z + P.half + 8, P.y, 18);
  T.addFlat(GAS.x - 22, GAS.x + 16, GAS.z - 16, GAS.z + 10, GAS.y, 10);
  T.addFlat(DIG.x0 - 8, DIG.x1 + 8, DIG.z0 - 8, DIG.z1 + 8, DIG.around, 10);
  T.addPit(DIG.x0, DIG.x1, DIG.z0, DIG.z1, DIG.y);
  // mine tunnel: a flat pit into the plateau (canyon.js puts timber walls and a rock lid on it)
  T.addPit(MINE.x0, MINE.x1, MINE.z0, MINE.z1, MINE.y);
}

export function build(game, kit, R) {
  R.welcomeSign(-790, 55, Math.PI / 2);
  const t = {}, T = (n, f) => { const t0 = performance.now(); f(); t[n] = Math.round(performance.now() - t0); };
  T('town', () => buildTown(game, kit, R));
  T('canyon', () => buildCanyon(game, kit, R));
  T('sites', () => buildSites(game, kit, R));
  T('nature', () => buildNature(game, kit, R));
  T('people', () => buildPeople(game, kit, R));
  T('loot', () => buildLoot(game, kit, R));
  T('animals', () => buildDesertAnimals(game, R));
  game.desertTimes = t; // per-part build ms (probes)
}
