// BIGTOWN — the city island east of home, reached over the suspension bridge
// (world/bridge.js lands on the west shore at x = 740, z = 118, onto Bridge Street).
//
// Terrain: one flat plate at y = 2 (a seawall all round) painted with the
// street grid (city/layout.js), a grassy park with a hill in the north-east,
// a pond, and a sandy beach on the south-east shore. Content lives in city/:
//   layout.js     street grid, blocks, park / pond / beach rects
//   streets.js    pavements, markings, crossings, cycling traffic lights, lamps
//   buildings.js  towers, mid-rises, row houses, shops, billboards
//   downtown.js   Bigtown Tower (lobby, glass elevator, roof deck), lobby tower with
//                 a revolving door, bank, hotels, offices, cinema, diner, police, bus depot
//   districts.js  Brick Row (+ fire-escape walk-up), Market Street, apartments, terraces
//   landmarks.js  stadium, building site + tower crane, City Park, parking garage, harbour
//   props.js      plaza (fountain, piano, hot-dog cart, news stands), crash mat, court
//   people.js     city NPC roles, city vehicles (taxi, limo, trucks, city bus), placement
import { fbm, smooth, rrectDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';
import * as THREE from 'three';
import { FUN_DX, FUN_DZ } from '../../config.js';
import { Y, BLOCKS, PARK, POND, onRoad } from './city/layout.js';
import { buildStreets } from './city/streets.js';
import { buildDowntown, BIG } from './city/downtown.js';
import { buildDistricts } from './city/districts.js';
import { stadium, constructionSite, cityPark, parkingGarage, harbour } from './city/landmarks.js';
import { buildPlaza, crashMat, busStop, cones } from './city/props.js';
import { buildPeople } from './city/people.js';
import { Quads } from './city/quads.js';
import { autoTypes, makeRoute, placeOnRoute, addAutoDriver } from './city/traffic.js';
import { useQuads } from './city/buildings.js';

const CX = 895, CZ = 0, HX = 245, HZ = 262;      // land: x 650..1140, z -262..262
export const CITY_Y = Y;                          // ground height of the city plate
const BUS_STOPS = [[778.5, -12, -Math.PI / 2], [875, -66.5, Math.PI], [860, 51, 0], [972.5, 150, Math.PI / 2]];
const HILL = { x: 1055, z: -175, r: 55, h: 15 };  // Bigtown Hill (in City Park)
// The Fun Park's ground (world/park.js, shifted by FUN_DX / FUN_DZ): a grassy shelf at y = 0 off
// the west shore, x 500..660, z -140..100, joined to the plate by a grass bank and a ramp road
// up from the park gate (x 632) to Brick Row avenue (x 700) along z = FUN_DZ.
export const FUN_LAND = { x: 580, z: -20, hx: 80, hz: 120, y: 0, bank: [634, 660] };
const FUN_ROAD = { x0: 628, x1: 700, z: FUN_DZ, hw: 5 };
const funDist = (x, z) => rrectDist(x, z, FUN_LAND.x, FUN_LAND.z, FUN_LAND.hx, FUN_LAND.hz, 30);
const onFunRoad = (x, z) => x > FUN_ROAD.x0 && x < FUN_ROAD.x1 && Math.abs(z - FUN_ROAD.z) < FUN_ROAD.hw;

const beachMask = (x, z) => smooth(1054, 1068, x) * smooth(118, 132, z);
const parkMask = (x, z) => smooth(PARK.x0 - 2, PARK.x0 + 2, x) * smooth(PARK.z1 + 2, PARK.z1 - 2, z)
  + smooth(984, 990, x) * smooth(184, 190, z) * smooth(1060, 1054, x);   // Harbour Green (lawn by the beach)

function height(x, z) {
  const fd = funDist(x, z), rd0 = rrectDist(x, z, CX, CZ, HX, HZ, 45);
  if (fd < rd0) { // the Fun Park shelf, rising to the plate along the bank
    const land = FUN_LAND.y + (CITY_Y - FUN_LAND.y) * smooth(FUN_LAND.bank[0], FUN_LAND.bank[1], x);
    return coastBlend(land, fd, 9);
  }
  const beach = beachMask(x, z);
  const rd = rd0;
  const d = rd + (fbm(x / 50, z / 50) - 0.5) * 6 * beach;
  const hd = Math.hypot(x - HILL.x, z - HILL.z);
  let land = CITY_Y + HILL.h * Math.exp(-(hd * hd) / (HILL.r * HILL.r)) * (0.85 + 0.3 * fbm(x / 20, z / 20));
  land -= beach * 2.6 * smooth(-55, 0, rd); // beach slopes down to the sea
  return coastBlend(land, d, 9 + 50 * beach);
}

const ASPHALT = new THREE.Color(0x5a5d66), ASPHALT2 = new THREE.Color(0x50535b);
function color(x, z, h, slope, out) {
  out.copy(B.concrete).lerp(B.concrete2, smooth(0.35, 0.7, fbm(x / 30, z / 30)) * 0.6);
  if (onRoad(x, z) || onFunRoad(x, z)) out.copy(ASPHALT).lerp(ASPHALT2, fbm(x / 9, z / 9));
  else if (funDist(x, z) < rrectDist(x, z, CX, CZ, HX, HZ, 45) && x < 662) { // Fun Park lawns and the bank
    out.copy(B.park).lerp(B.park2, smooth(0.4, 0.7, fbm(x / 12, z / 12)) * 0.6);
    if (h < FUN_LAND.y - 0.1) out.lerp(B.sand, 0.7);
    return waterTint(h, out);
  }
  else if (x > 736 && x < 764 && z > 66 && z < 112) out.copy(ASPHALT);             // taxi rank / bridge landing
  const park = Math.min(1, parkMask(x, z));
  if (park > 0) out.lerp(B.park, park).lerp(B.park2, park * smooth(0.4, 0.7, fbm(x / 12, z / 12)) * 0.6);
  const hill = smooth(CITY_Y + 0.15, CITY_Y + 1.2, h);
  if (hill > 0) out.lerp(B.park, hill).lerp(B.park2, hill * smooth(0.4, 0.7, fbm(x / 12, z / 12)) * 0.6);
  if (x > POND.x0 - 3 && x < POND.x1 + 3 && z > POND.z0 - 3 && z < POND.z1 + 3 && h < CITY_Y - 0.1) out.lerp(B.sand, 0.5);
  const beach = beachMask(x, z);
  if (beach > 0.05 && h < CITY_Y + 0.1) out.lerp(B.sand, smooth(0.05, 0.4, beach));
  else if (h < CITY_Y - 0.05 && slope > 0.3 && park < 0.5) out.lerp(B.seawall, 0.8);
  return waterTint(h, out);
}

export const region = {
  id: 'city', name: 'Bigtown', biome: 'city', signText: 'BIGTOWN',
  centre: [CX, CZ],
  bounds: [460, 1200, -321, 321], step: 3,
  height, color,
  sand: (x, z, h) => beachMask(x, z) > 0.2 && h < CITY_Y + 0.1,
  flats: [], roads: [], pits: [],
  labels: [
    { name: 'Downtown', x: 870, z: -50, big: true },
    { name: 'Bigtown Tower', x: BIG.x, z: BIG.z - 22 },
    { name: 'City Park', x: 1060, z: -215 },
    { name: 'Bigtown Hill', x: HILL.x, z: HILL.z + 18 },
    { name: 'Stadium', x: 840, z: -240 },
    { name: 'Building Site', x: 945, z: -245 },
    { name: 'Brick Row', x: 735, z: -200 },
    { name: 'Central Plaza', x: 875, z: -14 },
    { name: 'Parking Garage', x: 1015, z: -2 },
    { name: 'Market Street', x: 870, z: 196 },
    { name: 'Seaside Terraces', x: 735, z: 196 },
    { name: 'Bus Depot', x: 1015, z: 112 },
    { name: 'Harbour', x: 1105, z: 262 },
    { name: 'City Beach', x: 1100, z: 150 },
    { name: 'Fun Park', x: 578, z: -30, big: true },
    { name: 'Magic Tent', x: -277 + FUN_DX, z: -38 + FUN_DZ },
  ],
  docks: [],
};

// Called before the terrain is built: T = { addFlat, addRoadFlat, addPit } bound to this region.
export function prepare(T) {
  T.addPit(POND.x0, POND.x1, POND.z0, POND.z1, POND.floor);
}

// Called after the terrain (and the home island) exist. R: see regions/helpers.js.
export function build(game, kit, R) {
  game.cityR = R;
  const Q = kit.cityQ = new Quads(kit);
  useQuads(Q);
  lazySpawns(game, R);
  // per-part build times (ms) for probes: game.buildTimes.cityParts
  const parts = game.buildTimes.cityParts = {};
  let t0 = performance.now();
  const lap = (name) => { const t = performance.now(); parts[name] = Math.round(t - t0); t0 = t; };
  const of = (...kinds) => BLOCKS.filter((b) => kinds.includes(b[4]));
  buildStreets(game, kit, R);
  lap('streets');
  buildDowntown(game, kit, R, of('bigtower', 'towers2', 'tower', 'lobbytower', 'bank', 'hotel', 'tallhotel', 'offices', 'cinema', 'diner', 'police', 'depot', 'landing'));
  lap('downtown');
  buildDistricts(game, kit, R, of('rowhouses', 'terraces', 'shops', 'market', 'apartments', 'beachshops', 'court'));
  lap('districts');
  const plaza = of('plaza')[0];
  buildPlaza(game, kit, R, { x0: plaza[0], x1: plaza[1], z0: plaza[2], z1: plaza[3], cx: (plaza[0] + plaza[1]) / 2, cz: (plaza[2] + plaza[3]) / 2, w: plaza[1] - plaza[0], d: plaza[3] - plaza[2] });
  crashMat(kit, BIG.x + 11, BIG.z + BIG.d / 2 + 9, 14, 15);
  lap('plaza');
  stadium(game, kit, R, of('stadium')[0]);
  lap('stadium');
  constructionSite(game, kit, R, of('construction')[0]);
  lap('site');
  cityPark(game, kit, R);
  lap('park');
  parkingGarage(game, kit, R, of('garage')[0]);
  lap('garage');
  harbour(game, kit, R);
  harbourGreen(kit, R);
  lap('harbour');
  for (const [x, z, yaw] of BUS_STOPS) busStop(game, kit, R, x, z, yaw);
  cones(game, 925, -146, 945, -146, 4);
  // coin trails along the main streets
  R.coins(800, 0, 6, 'line', 8, 60);
  R.coins(910, 80, 6, 'line', 8, 60, { yaw: Math.PI / 2 });
  R.coins(880, 118, 6, 'line', 8, 70);
  buildPeople(game, R);
  // self-driving city bus (clockwise round downtown, stopping at the bus stops) and taxi
  autoTypes();
  const busLoop = makeRoute([[770, 60], [770, -75], [980, -75], [980, 60]], BUS_STOPS.map(([x, z]) => [x, z]));
  const taxiLoop = makeRoute([[840, -150], [840, 180], [910, 180], [910, -150]]);
  for (const [type, route, s, col, drv] of [['autobus', busLoop, 30, 0xf4f4f4, 0x3f8cff], ['autotaxi', taxiLoop, 60, 0xffc81e, 0xffd23f], ['autotaxi', taxiLoop, 400, 0xffc81e, 0xff5a5a]]) {
    R.later(() => { const v = R.vehicle(type, 800, 0, 0, col); v.route = route; v.home = placeOnRoute(v, s); addAutoDriver(v, drv); });
  }
  game.cityRoutes = { busLoop, taxiLoop };
  lap('people');
  Q.flush();
  lap('flush');
}

// Vehicles and people are spawned the first time a player heads for Bigtown (one per
// physics step), not at load: R.later(fn) queues a spawn.
function lazySpawns(game, R) {
  const queue = [];
  R.later = (fn) => queue.push(fn);
  let k = 0, go = false;
  const [x0, x1, z0, z1] = region.bounds, M = 320;
  game.steppers.push(() => {
    if (!queue.length) return;
    if (!go && ++k % 30 === 0) go = game.players.some((p) => { const t = p.chest.translation(); return t.x > x0 - M && t.x < x1 + M && t.z > z0 - M && t.z < z1 + M; });
    if (go) queue.shift()();
  });
  game.citySpawnQueue = queue;
}

// Lawn between Market Street's east end and the beach: palms, picnic tables, an ice-cream stand.
function harbourGreen(kit, R) {
  for (const [x, z] of [[995, 200], [1010, 230], [1030, 205], [1045, 240], [1020, 250], [1050, 195]]) R.tree(x, z, 2, 1);
  for (const [x, z] of [[1000, 215], [1035, 225]]) { kit.box(x, Y + 0.75, z, 2.2, 0.08, 0.9, 0xb5773d); for (const s of [-1, 1]) kit.box(x, Y + 0.45, z + s * 0.75, 2.2, 0.06, 0.3, 0xb5773d); }
  R.coins(1020, 215, 6, 'ring', 6, 5);
}
