// COCONUT COVE — tropical islets south-east of home, in a shallow turquoise
// lagoon (sea bed ~ -2.5 between them, deep sea outside the reef).
//
// Islets: A "Harbour Isle" (470, 620), B "Little Key" (640, 600, lighthouse),
// C "Resort Isle" (605, 772, the biggest, with a low hill), D "Palm Rock"
// (438, 792), and a sandbar you can walk along between C and D.
// Flat plots: resort (y = 2) on C (hotel, pool + pool bar, volleyball), fishing
// harbour (y = 1.5) on A (piers, boat hire). The snorkel reef with fish sits in
// the lagoon between A, C and D; a pirate shipwreck lies west of the reef;
// the surf beach is on C's east shore.
//
// Content lives in tropical/ (vehicles, resort, harbour, sea); shared helpers
// (foliage, rides, NPC roles) come from jungle/.
import { fbm, smooth, blobDist, coastBlend, waterTint, BIOME_COLORS as B } from '../../terrain.js';
import { registerVehicle } from '../../vehicles.js';
import { registerCallable } from '../../phone.js';
import './jungle/npcs.js';
import './tropical/vehicles.js';
import { buildResort } from './tropical/resort.js';
import { buildHarbour } from './tropical/harbour.js';
import { buildSea } from './tropical/sea.js';
import { buildTropicalAnimals } from './tropical/animals.js';

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
export const POOL = { x0: 578, x1: 600, z0: 747, z1: 764, floor: 0.4, level: 1.75 };
export const SANDBAR = [[484, 790], [497, 786], [512, 779]];
export const REEF = { x: 512, z: 688, r: 26 };
export const WRECK = { x: 382, z: 702, yaw: 0.6 };
export const SURF = { x0: 700, x1: 752, z: 772 };
export const LIGHTHOUSE = { x: 678, z: 596 };

function sandbarDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < SANDBAR.length - 1; i++) {
    const [ax, az] = SANDBAR[i], [bx, bz] = SANDBAR[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

function height(x, z) {
  const d = blobDist(x, z, ISLETS, 10, 31);
  const sd = blobDist(x, z, SHELF, 18, 37);
  const bed = -2.6 + (-8 + 2.6) * smooth(-15, 25, sd) - 0.6 * fbm(x / 25, z / 25);
  const hd = Math.hypot(x - 625, z - 775);
  const land = 1.5 + 1.8 * fbm(x / 35 + 2, z / 35) + 9 * Math.exp(-(hd * hd) / (45 * 45));
  let h = coastBlend(land, d, 34, bed);
  // sandbar between Resort Isle and Palm Rock: a low strip of sand just above the water
  const sb = sandbarDist(x, z);
  if (sb < 12) h = Math.max(h, 0.15 - smooth(2.5, 12, sb) * 3.2 + (fbm(x / 6, z / 6) - 0.5) * 0.2);
  // reef: coral heads a little shallower
  const rd = Math.hypot(x - REEF.x, z - REEF.z);
  if (rd < REEF.r + 6) h += smooth(REEF.r + 6, REEF.r - 6, rd) * 0.6 * fbm(x / 5, z / 5);
  return h;
}

function color(x, z, h, slope, out) {
  out.copy(B.palmGrass).lerp(B.palmGrass2, smooth(0.4, 0.7, fbm(x / 15, z / 15)) * 0.7);
  const sandy = smooth(2.6, 2.0, h) + smooth(0.55, 0.75, fbm(x / 18 + 5, z / 18)) * 0.6;
  out.lerp(B.white, Math.min(1, sandy));
  if (h < 0.4 && h > -2.8) out.lerp(B.white, 0.5); // bright sand under the lagoon
  if (Math.hypot(x - REEF.x, z - REEF.z) < REEF.r && h < -1) out.lerp(B.mud, 0.25 * fbm(x / 4, z / 4));
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
  labels: [{ name: 'Harbour Isle', x: 470, z: 650 }, { name: 'Little Key', x: 630, z: 585 }, { name: 'Resort Isle', x: 600, z: 805 }, { name: 'Palm Rock', x: 445, z: 810 }],
  docks: [{ id: 'cove', name: 'Coconut Cove', x: 452, z: 572, yaw: Math.PI }],
};

export function prepare(T) {
  T.addPit(POOL.x0, POOL.x1, POOL.z0, POOL.z1, POOL.floor);
}

export function build(game, kit, R) {
  const t = {};
  const T = (n, f) => { const t0 = performance.now(); f(); t[n] = Math.round(performance.now() - t0); };
  R.welcomeSign(470, 585, Math.PI);
  T('harbour', () => buildHarbour(game, kit, R));
  T('resort', () => buildResort(game, kit, R));
  T('sea', () => buildSea(game, kit, R));
  T('animals', () => buildTropicalAnimals(game, R));
  (game.buildTimes ||= {}).tropicalParts = t;
  R.label('Snorkel Reef', REEF.x, REEF.z);
  R.label('Shipwreck', WRECK.x, WRECK.z + 14);
  R.label('Surf Beach', SURF.x0 + 10, SURF.z + 18);
  R.label('Sandbar', 498, 795);
  R.label('Lighthouse', LIGHTHOUSE.x, LIGHTHOUSE.z - 14);
}
