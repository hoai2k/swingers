// Frostpeak wildlife (world/wildlife.js): mountain goats on the high slopes (they stop to stare at
// you), arctic foxes that bolt off through the snow, snowy owls sitting on the snow that take off and
// circle when you come close. Models are round-18 stand-ins until their reference sheets arrive.
import { wildlife } from '../../wildlife.js';
import { VILLAGE, HAMLET, LIFT, TOP, SUMMIT, LAKE, CABIN, JUMP, CAVE, pisteDist } from './layout.js';

export function buildSnowAnimals(game, R) {
  const box = (x, z, b, m) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m;
  const ok = (x, z, strict) => {
    const [bx0, bx1, bz0, bz1] = R.bounds;
    if (x < bx0 + 40 || x > bx1 - 40 || z < bz0 + 40 || z > bz1 - 40) return false;
    if (box(x, z, VILLAGE, 20) || box(x, z, HAMLET, 15) || box(x, z, TOP, 15)) return false;
    if (Math.abs(x - LIFT.x) < 14 && z < LIFT.zb + 10 && z > LIFT.zt - 10) return false;
    if (Math.abs(x - JUMP.x) < 18 && z > JUMP.zTop - 15 && z < JUMP.zLip + 30) return false;
    if (pisteDist(x, z) < 14 || Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT.r + 12 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 6) return false;
    if (Math.hypot(x - CABIN.x, z - CABIN.z) < 18 || Math.hypot(x - CAVE.x, z - CAVE.z) < 30) return false;
    const h = R.groundAt(x, z);
    if (h < 2) return false;
    if (!strict && Math.abs(R.groundAt(x + 2, z) - h) + Math.abs(R.groundAt(x, z + 2) - h) > 2.4) return false;
    return true;
  };
  const W = wildlife(game, R, { seed: 2828, ok });
  W.mk('goat', 'goat', 8, { k: { LEG: 0.6 } });
  W.mk('arcticFox', 'arcticFox', 5, { k: { LEG: 0.8, TAILA: 0.4 } });
  W.mk('owl', 'snowyOwl', 4, { k: { FLAP: 0, LEG: 0.2 } });
  W.mk('owlFly', 'owlFly', 4, { k: { FLAP: 0.8 }, shadow: false });
  W.place('goat', 3, 12, 0.7, 12, 12, { group: 2, gap: 2, young: true, near: (x, z) => R.groundAt(x, z) > 50, look: 9, sound: 'bleat', hear: 10, stride: 1.0, see: 350 });
  W.place('arcticFox', 4, 10, 1.3, 10, 8, { flee: 9, fleeV: 7, sound: 'yip', hear: 8, stride: 0.6 });
  for (let n = 0, tries = 0; n < 4 && tries < 300; tries++) {
    const x = R.bounds[0] + 60 + W.rnd() * (R.bounds[1] - R.bounds[0] - 120), z = R.bounds[2] + 60 + W.rnd() * (R.bounds[3] - R.bounds[2] - 120);
    if (!ok(x, z)) continue;
    W.add({ kind: 'owl', flyKind: 'owlFly', perch: true, px: x, py: R.groundAt(x, z), pz: z, x, z, yaw: W.rnd() * 6.283, shy: 8, alt: 12, circle: 14, sound: 'hoot', hear: 12, see: 250 });
    n++;
  }
  W.start('snowAnimals', {
    grab: {
      goat: { r: 0.24, len: 0.4, y: 0.75, kg: 60, run: 4.5 },
      arcticFox: { r: 0.12, len: 0.18, y: 0.3, kg: 5, run: 6, pick: true },
    },
  });
}
