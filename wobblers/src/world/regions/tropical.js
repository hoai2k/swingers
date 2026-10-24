// COCONUT COVE — tropical islets south-east of home, in a shallow turquoise
// lagoon (sea bed ~ -2.5 between them, deep sea outside the reef).
//
// Islets: A "Harbour Isle" (470, 620), B "Little Key" (630, 605),
// C "Resort Isle" (600, 760, the biggest, with a low hill), D "Palm Rock" (445, 780).
// Flat plots: resort (y = 2) on C, fishing harbour (y = 1.5) on A.
import { fbm, smooth, blobDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';
import { registerVehicle } from '../../vehicles.js';
import { registerCallable } from '../../phone.js';

// Example of a new vehicle type registered from a region file: a jet ski (a
// small, quick boat with its own look), callable from the phone.
registerVehicle('jetski', {
  mass: 260, half: [0.55, 0.3, 1.35], boat: true, engine: 3900, maxSpeed: 19, steer: 1.3,
  seats: [{ pos: [0, 0.42, -0.25], kind: 'driver' }, { pos: [0, 0.48, -0.8] }],
  camH: 1.3, camDist: 7, horn: 'kart', voice: 'scooter',
  mesh(b, def, color, P) {
    const h = def.half;
    b.rbox(h[0] * 2, 0.42, h[2] * 2, 0.18, 0xffffff, [0, -0.12, 0]);
    b.rbox(h[0] * 2 + 0.04, 0.16, h[2] * 2 + 0.04, 0.08, color, [0, -0.3, 0]);
    b.cone(h[0], 0.8, 0xffffff, [0, -0.12, h[2] + 0.35], [Math.PI / 2, 0, 0], 6);
    b.rbox(0.5, 0.3, 0.6, 0.12, color, [0, 0.2, 0.55]);
    b.rbox(0.42, 0.14, 1.1, 0.06, 0x222228, [0, 0.2, -0.5]);
    b.cyl(0.025, 0.025, 0.7, 0x888888, [0, 0.48, 0.45], [0, 0, Math.PI / 2], 6);
    P.glass.box(0.45, 0.22, 0.03, 0, [0, 0.45, 0.78], [-0.5, 0, 0]);
  },
});
registerCallable({ id: 'jetski', type: 'jetski', name: 'Jet ski', icon: 'boat' }, 'heli');

const ISLETS = [[470, 620, 70, 52], [640, 600, 56, 44], [605, 772, 95, 66], [438, 792, 48, 40]];
const SHELF = ISLETS.map(([x, z, rx, rz]) => [x, z, rx + 45, rz + 45]);
export const RESORT = { x0: 565, x1: 645, z0: 735, z1: 790, y: 2 };
export const HARBOUR = { x0: 440, x1: 500, z0: 598, z1: 640, y: 1.5 };

function height(x, z) {
  const d = blobDist(x, z, ISLETS, 10, 31);
  const sd = blobDist(x, z, SHELF, 18, 37);
  const bed = -2.6 + (-8 + 2.6) * smooth(-15, 25, sd) - 0.6 * fbm(x / 25, z / 25);
  const hd = Math.hypot(x - 625, z - 775);
  const land = 1.5 + 1.8 * fbm(x / 35 + 2, z / 35) + 9 * Math.exp(-(hd * hd) / (45 * 45));
  return coastBlend(land, d, 34, bed);
}

function color(x, z, h, slope, out) {
  out.copy(B.palmGrass).lerp(B.palmGrass2, smooth(0.4, 0.7, fbm(x / 15, z / 15)) * 0.7);
  const sandy = smooth(2.6, 2.0, h) + smooth(0.55, 0.75, fbm(x / 18 + 5, z / 18)) * 0.6;
  out.lerp(B.white, Math.min(1, sandy));
  if (h < 0.4 && h > -2.8) out.lerp(B.white, 0.5); // bright sand under the lagoon
  return waterTint(h, out);
}

export const region = {
  id: 'tropical', name: 'Coconut Cove', biome: 'tropical', signText: 'COCONUT COVE',
  centre: [560, 700],
  bounds: [300, 810, 480, 921], step: 3,
  height, color,
  sand: (x, z, h) => h < 2.4 || fbm(x / 18 + 5, z / 18) > 0.62,
  flats: [[RESORT.x0, RESORT.x1, RESORT.z0, RESORT.z1, RESORT.y, 14], [HARBOUR.x0, HARBOUR.x1, HARBOUR.z0, HARBOUR.z1, HARBOUR.y, 12]],
  roads: [], pits: [],
  labels: [{ name: 'Harbour Isle', x: 470, z: 650 }, { name: 'Little Key', x: 630, z: 590 }, { name: 'Resort Isle', x: 600, z: 800 }, { name: 'Palm Rock', x: 445, z: 800 }],
  docks: [{ id: 'cove', name: 'Coconut Cove', x: 452, z: 572, yaw: Math.PI }],
};

export function prepare(T) {}

export function build(game, kit, R) {
  R.welcomeSign(470, 585, Math.PI);
  // placeholder beach bar on the resort plot
  const y = RESORT.y;
  kit.box(600, y + 0.6, 760, 8, 1.2, 3, 0xd8a868);
  for (const [ox, oz] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) kit.cyl(600 + ox, y + 1.6, 760 + oz, 0.12, 3.2, 0x8a6a4a, { collide: false });
  kit.cone(600, y + 3.8, 760, 6, 1.6, 0xe8c66a, { seg: 6 });
  for (const [x, z] of [[540, 740], [660, 770], [470, 640], [500, 610], [630, 610], [445, 780], [580, 800]]) R.tree(x, z, 2, 1);
  R.npc('surfer', 590, 735);
  R.npc('fisherman', 465, 600);
}
