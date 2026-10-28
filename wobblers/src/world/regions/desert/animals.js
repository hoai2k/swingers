// Dusty Dunes wildlife (world/wildlife.js): camel caravans plodding over the dunes, fennec foxes and
// roadrunners that dash off when you come near, rattlesnakes slithering by the rocks (they rear up and
// rattle), scorpions scuttling about, slow tortoises, vultures circling over the canyon and mesas.
// Models are round-18 stand-ins until their reference sheets arrive (image-requests.md).
import { wildlife } from '../../wildlife.js';
import { TOWN, OASIS, PYRAMID, MESAS, DIG, GAS, HIGHWAY, HIGHWAY_W, DIRT, canyonZ, polyDist } from './layout.js';

export function buildDesertAnimals(game, R) {
  const roads = [HIGHWAY, HIGHWAY_W, ...DIRT];
  const ok = (x, z, strict) => {
    const [bx0, bx1, bz0, bz1] = R.bounds;
    if (x < bx0 + 40 || x > bx1 - 40 || z < bz0 + 40 || z > bz1 - 40) return false;
    if (x > TOWN.x0 - 15 && x < TOWN.x1 + 15 && z > TOWN.z0 - 15 && z < TOWN.z1 + 15) return false;
    if (Math.hypot(x - OASIS.x, z - OASIS.z) < OASIS.r + 6 || Math.hypot(x - PYRAMID.x, z - PYRAMID.z) < PYRAMID.half * 1.6) return false;
    if (Math.hypot(x - GAS.x, z - GAS.z) < 25 || (x > DIG.x0 - 6 && x < DIG.x1 + 6 && z > DIG.z0 - 6 && z < DIG.z1 + 6)) return false;
    if (roads.some((r) => polyDist(x, z, r)[0] < 7)) return false;
    const h = R.groundAt(x, z);
    if (h < 1.2) return false;
    if (!strict && Math.abs(R.groundAt(x + 2, z) - h) + Math.abs(R.groundAt(x, z + 2) - h) > 1.4) return false;
    return true;
  };
  const W = wildlife(game, R, { seed: 1818, ok });
  W.mk('camel', 'camel', 8, { k: { LEG: 0.45 } });
  W.mk('fennec', 'fennec', 6, { k: { LEG: 0.8, TAILA: 0.4 } });
  W.mk('roadrunner', 'roadrunner', 5, { k: { LEG: 1.0, FLAP: 0 } });
  W.mk('rattlesnake', 'rattlesnake', 6, { mode: 'slither', k: { WAVEK: 11, WAVEA: 0.1 } }); // windy: ~0.57 m waves, 0.1 m to each side
  W.mk('scorpion', 'scorpion', 10, { k: { LEG: 0.6, TAILA: 0.2 }, shadow: false });
  W.mk('tortoise', 'tortoise', 5, { k: { LEG: 0.4 } });
  W.mk('vulture', 'vulture', 8, { k: { FLAP: 0.5 }, shadow: false });
  const dunes = (x, z) => x < -1150 || z > 60;
  W.place('camel', 2, 30, 0.9, 30, 14, { group: 3, gap: 3.2, young: true, near: dunes, sound: 'grunt', hear: 10, stride: 2.2, see: 400 });
  W.place('fennec', 5, 8, 1.2, 8, 8, { flee: 8, fleeV: 6.5, sound: 'yip', hear: 7, stride: 0.45 });
  W.place('roadrunner', 4, 16, 2.6, 6, 4, { flee: 9, fleeV: 9, sound: 'chirp', hear: 9, stride: 0.55 });
  W.place('scorpion', 8, 3, 0.35, 5, 7, { size: 1.6, flee: 2.5, fleeV: 1.6, stride: 0.15 });
  W.place('tortoise', 4, 5, 0.15, 20, 30, { size: 1.2, stride: 0.25 });
  // rattlesnakes slither about near the rocks (canyon rims, the mesas' feet); one that notices you stops,
  // rears and rattles (slither phase = distance x WAVEK: stride 2 pi / 11)
  const rocky = (x, z) => Math.abs(z - canyonZ(x)) < 45 || MESAS.some(([mx, mz, r]) => Math.hypot(x - mx, z - mz) < r + 25);
  W.place('rattlesnake', 5, 7, 0.35, 16, 22, { near: rocky, look: 5, rear: true, sound: 'rattle', hear: 6, stride: 2 * Math.PI / 11 });
  // vultures circling over the canyon and the mesas
  for (let i = 0; i < 6; i++) {
    const [x, z] = i < 3 ? [-1250 + i * 110, canyonZ(-1250 + i * 110)] : [MESAS[i % 2][0], MESAS[i % 2][1]];
    W.add({ kind: 'vulture', fly: true, x0: x, z0: z, x, z, y: R.groundAt(x, z), alt: 26 + W.rnd() * 14, r: 18 + W.rnd() * 14, w: (W.rnd() < 0.5 ? -1 : 1) * (0.18 + W.rnd() * 0.1), s: 1.2, see: 500 });
  }
  W.start('desertAnimals', {
    grab: {
      camel: { r: 0.45, len: 0.7, y: 1.25, kg: 450, run: 3 },
      fennec: { r: 0.1, len: 0.12, y: 0.22, kg: 3, run: 6, pick: true },
      roadrunner: { r: 0.1, len: 0.12, y: 0.32, kg: 2, run: 8, pick: true },
      tortoise: { r: 0.22, len: 0.08, y: 0.2, kg: 18, run: 0.5, pick: true },
      scorpion: { r: 0.08, len: 0.08, y: 0.08, kg: 1, run: 2, pick: true },
    },
  });
}
