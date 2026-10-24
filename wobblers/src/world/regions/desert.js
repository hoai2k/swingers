// DUSTY DUNES — the desert island west of home.
//
// Terrain: sand at y ~ 3 with rolling dunes to the west, a layered red-rock
// plateau along the north coast cut by a winding canyon (floor y ~ 3), two
// free-standing mesas in the south-west, an oasis pond (sea-level water) at
// (-935, 165) and a flat plot for the wild-west town at y = 4.
import { fbm, smooth, blobDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';

const BLOBS = [[-1060, 0, 320, 350], [-860, 60, 120, 120], [-1180, -230, 160, 120]];
export const TOWN = { x0: -1020, x1: -900, z0: -100, z1: 40, y: 4 };
export const OASIS = { x: -935, z: 165, r: 26 };
const MESAS = [[-1235, 120, 48, 30], [-1150, 250, 38, 22]];
const canyonZ = (x) => -232 + 28 * Math.sin(x / 55);

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

function color(x, z, h, slope, out) {
  out.copy(B.sand).lerp(B.sand2, smooth(0.35, 0.7, fbm(x / 28, z / 28)) * 0.7);
  const rock = rockMask(x, z);
  if (rock > 0.5 && h > 5) {
    out.lerp(B.mesaTop, smooth(5, 9, h));
    const band = 0.5 + 0.5 * Math.sin(h * 1.6);
    out.lerp(B.redRock, smooth(0.35, 0.8, slope)).lerp(B.redRock2, smooth(0.35, 0.8, slope) * band * 0.6);
  } else if (slope > 0.9) out.lerp(B.redRock, 0.5);
  if (Math.abs(z - canyonZ(x)) < 14 && h < 6 && z < -150) out.lerp(B.canyon, 0.6);
  const od = Math.hypot(x - OASIS.x, z - OASIS.z);
  if (od < OASIS.r + 22 && h > 0.2) out.lerp(B.oasis, smooth(OASIS.r + 22, OASIS.r + 6, od));
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
  labels: [{ name: 'Oasis', x: OASIS.x, z: OASIS.z }, { name: 'Red Rock Canyon', x: -1120, z: -235 }, { name: 'Dune Sea', x: -1250, z: 20 }],
  docks: [{ id: 'desert', name: 'Dusty Dunes', x: -760, z: 40, yaw: Math.PI / 2 }],
};

export function prepare(T) {}

export function build(game, kit, R) {
  R.welcomeSign(-790, 55, Math.PI / 2);
  // placeholder saloon front on the town plot
  const y = TOWN.y;
  kit.box(-960, y + 3, -30, 14, 6, 9, 0xb07a48);
  kit.deco(-960, y + 6.6, -25.4, 14, 1.4, 0.3, 0x8a5a32);
  R.sign('SALOON', -960, y + 4.6, -25.3, 0, 6, '#8a5a32', '#ffe8b0');
  for (const [x, z] of [[-925, 150], [-948, 182], [-920, 178]]) R.tree(x, z, 2, 1);
  R.npc('cowboy', -950, -10);
}
