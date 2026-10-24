// BIGTOWN — the city island east of home, reached over the suspension bridge
// (world/bridge.js lands on the west shore at x = 740, z = 118).
//
// Terrain: one big flat concrete plate at y = 2 (a seawall all round), a sandy
// beach on the south-east shore and a grassy park hill in the north-east.
// Everything a city builder needs is flat already; add flats (plazas at other
// heights, ramps) in `region.terrain`-style fields or prepare(T) below.
import { fbm, smooth, rrectDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';

const CX = 895, CZ = 0, HX = 245, HZ = 262;      // land: x 650..1140, z -262..262
export const CITY_Y = 2;                          // ground height of the city plate
const HILL = { x: 1055, z: -175, r: 55, h: 15 };  // Bigtown Hill (park)

const beachMask = (x, z) => smooth(960, 1070, x) * smooth(70, 170, z);

function height(x, z) {
  const beach = beachMask(x, z);
  const d = rrectDist(x, z, CX, CZ, HX, HZ, 45) + (fbm(x / 50, z / 50) - 0.5) * 6 * beach;
  const hd = Math.hypot(x - HILL.x, z - HILL.z);
  let land = CITY_Y + HILL.h * Math.exp(-(hd * hd) / (HILL.r * HILL.r)) * (0.85 + 0.3 * fbm(x / 20, z / 20));
  land -= beach * 1.2 * smooth(-60, 0, rrectDist(x, z, CX, CZ, HX, HZ, 45)); // beach slopes down to the sea
  return coastBlend(land, d, 9 + 60 * beach);
}

function color(x, z, h, slope, out) {
  out.copy(B.concrete).lerp(B.concrete2, smooth(0.35, 0.7, fbm(x / 30, z / 30)) * 0.6);
  const hill = smooth(CITY_Y + 0.15, CITY_Y + 1.2, h);
  if (hill > 0) out.lerp(B.park, hill).lerp(B.park2, hill * smooth(0.4, 0.7, fbm(x / 12, z / 12)) * 0.6);
  const beach = beachMask(x, z);
  if (beach > 0.05 && h < CITY_Y + 0.1) out.lerp(B.sand, smooth(0.05, 0.4, beach));
  else if (h < CITY_Y - 0.05 && slope > 0.3) out.lerp(B.seawall, 0.8);
  return waterTint(h, out);
}

export const region = {
  id: 'city', name: 'Bigtown', biome: 'city', signText: 'BIGTOWN',
  centre: [CX, CZ],
  bounds: [600, 1200, -321, 321], step: 3,
  height, color,
  sand: (x, z, h) => beachMask(x, z) > 0.2 && h < CITY_Y + 0.1,
  flats: [], roads: [], pits: [],
  labels: [{ name: 'Bigtown Hill', x: HILL.x, z: HILL.z + 20 }, { name: 'City Beach', x: 1090, z: 215 }],
  docks: [],
};

// Called before the terrain is built: T = { addFlat, addRoadFlat, addPit } bound to this region.
export function prepare(T) {}

// Called after the terrain (and the home island) exist. R: see regions/helpers.js.
export function build(game, kit, R) {
  // placeholder landmarks: welcome sign at the bridge landing, a few towers
  R.welcomeSign(768, 132, -Math.PI / 2);
  const towers = [[820, -60, 60, 0x9fb7d0], [860, -40, 85, 0xc9d3dc], [900, -70, 110, 0x7f9bb8], [940, -30, 75, 0xb8c4cf], [880, 40, 50, 0xd8cdbf]];
  for (const [x, z, h, c] of towers) {
    kit.box(x, CITY_Y + h / 2, z, 22, h, 22, c);
    for (let y = 4; y < h - 2; y += 4) kit.deco(x, CITY_Y + y, z, 22.2, 1.6, 22.2, 0x3a5a7a); // window bands
    kit.deco(x, CITY_Y + h + 0.5, z, 16, 1, 16, 0x8a8f96);
  }
  R.label('Downtown', 880, -50, true);
  R.npc('businessman', 790, 140);
  R.npc('taxi', 800, 100);
  R.vehicle('car', 790, 110, Math.PI / 2, 0xffd23f);
}
