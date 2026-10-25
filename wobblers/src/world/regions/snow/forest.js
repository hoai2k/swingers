// Snowy pine forests on Frostpeak's lower slopes (the terrain colour paints the
// same belts dark green, so the forest reads from across the sea even where
// the kit chunks are culled), plus boulders on the steep faces.
import * as THREE from 'three';
import { fbm, smooth } from '../../../terrain.js';
import { Builder } from '../../../mesh.js';
import { VILLAGE, TOP, SUMMIT, LAKE, CAVE, CABIN, HAMLET, JUMP, LIFT, pisteDist } from './layout.js';

const KEEP_OUT = [ // [x0, x1, z0, z1] + margin
  [VILLAGE.x0, VILLAGE.x1, VILLAGE.z0, VILLAGE.z1 + 30], [TOP.x0, TOP.x1, TOP.z0, TOP.z1],
  [SUMMIT.x - SUMMIT.r, SUMMIT.x + SUMMIT.r, SUMMIT.z - SUMMIT.r, SUMMIT.z + SUMMIT.r],
  [LAKE.x - LAKE.r, LAKE.x + LAKE.r, LAKE.z - LAKE.r, LAKE.z + LAKE.r], [CAVE.x - 14, CAVE.x + 14, CAVE.z - 16, CAVE.z + 22],
  [CABIN.x - 12, CABIN.x + 12, CABIN.z - 10, CABIN.z + 10], [HAMLET.x0, HAMLET.x1 + 30, HAMLET.z0, HAMLET.z1 + 40],
  [JUMP.x - 12, JUMP.x + 12, JUMP.zTop - 10, -846], [LIFT.x - 9, LIFT.x + 9, LIFT.zt, LIFT.zb], [40, 110, -760, -700],
];
function keepOut(x, z, m = 6) {
  for (const [x0, x1, z0, z1] of KEEP_OUT) if (x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m) return true;
  return false;
}

// 0..1: how much pine forest grows here.
export function forestMask(x, z, h, slope) {
  if (h < 3 || h > 95 || slope > 0.75) return 0;
  const n0 = fbm(x / 70 + 11, z / 70 - 4);
  if (n0 < 0.33) return 0;
  const n = n0 + (fbm(x / 18, z / 18) - 0.5) * 0.25;
  let m = smooth(0.47, 0.6, n) * smooth(3, 8, h) * smooth(95, 65, h) * smooth(0.75, 0.45, slope);
  if (m <= 0) return 0;
  if (keepOut(x, z, 2)) return 0;
  return m * smooth(12, 20, pisteDist(x, z));
}

// A snow-laden pine (kit builder geometry + a trunk collider). The two looks
// are built once as unit-size templates; each tree clones one and moves it
// into its kit chunk (much cheaper than building seven primitives per tree).
const PINES = [];
function pineTemplate(dark) {
  const b = new Builder();
  const g = dark ? [0x2f5a45, 0x356a4e, 0x3d7a56] : [0x2f7a4a, 0x37894f, 0x419a5a];
  b.cyl(0.25, 0.32, 2, 0x6a4a32, [0, 1, 0], null, 6);
  [[2.3, 3.0, 3.0], [1.75, 2.5, 4.4], [1.15, 2.0, 5.6]].forEach(([r, h, cy], i) => {
    b.cone(r, h, g[i], [0, cy, 0], null, 7);
    b.cone(r * 0.78, h * 0.5, 0xf6f9ff, [0, cy + h * 0.28, 0], null, 7); // snow cap on each tier
  });
  return b.geometry();
}
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
export function snowPine(kit, x, z, y, s = 1, dark = false) {
  const k = dark ? 1 : 0;
  PINES[k] ||= pineTemplate(dark);
  const g = PINES[k].clone();
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_Y, (x * 7.3 + z * 3.1) % 6.28), _s.set(s, s, s)));
  kit.b(x, z).parts.push(g);
  kit.phys.cylinder(x, y + 1.5 * s, z, 0.3 * s, 3 * s, {});
}

export function buildForest(game, kit, R) {
  const rnd = R.rng(41), [x0, x1, z0, z1] = R.bounds;
  let n = 0;
  const STEP = 8.5;
  for (let z = z0 + 30; z < z1 - 20 && n < 520; z += STEP) {
    for (let x = x0 + 30; x < x1 - 30 && n < 520; x += STEP) {
      const px = x + (rnd() - 0.5) * STEP * 0.9, pz = z + (rnd() - 0.5) * STEP * 0.9;
      const r0 = rnd();
      if (r0 > 0.75 || fbm(px / 70 + 11, pz / 70 - 4) < 0.4) continue;
      const h = R.groundAt(px, pz);
      if (h < 3 || h > 95) continue;
      const sl = Math.hypot(R.groundAt(px + 2, pz) - R.groundAt(px - 2, pz), R.groundAt(px, pz + 2) - R.groundAt(px, pz - 2)) / 4;
      const m = forestMask(px, pz, h, sl);
      if (r0 > m * 0.75) continue;
      snowPine(kit, px, pz, h - 0.15, 0.8 + rnd() * 0.7, rnd() < 0.5);
      n++;
    }
  }
  // lone pines dotted on the open snow fields (not on the runs)
  for (let i = 0; i < 90; i++) {
    const px = x0 + 40 + rnd() * (x1 - x0 - 80), pz = z0 + 60 + rnd() * (z1 - z0 - 90);
    const h = R.groundAt(px, pz);
    if (h < 4 || h > 110 || keepOut(px, pz) || pisteDist(px, pz) < 16) continue;
    snowPine(kit, px, pz, R.groundAt(px, pz) - 0.15, 0.7 + rnd() * 0.6, true);
    n++;
  }
  // boulders on the steeper faces
  let rocks = 0;
  for (let i = 0; i < 220 && rocks < 45; i++) {
    const px = x0 + 60 + rnd() * (x1 - x0 - 120), pz = z0 + 60 + rnd() * (z1 - z0 - 120);
    const h = R.groundAt(px, pz);
    if (h < 10 || keepOut(px, pz) || pisteDist(px, pz) < 14) continue;
    const sl = Math.hypot(R.groundAt(px + 2, pz) - R.groundAt(px - 2, pz), R.groundAt(px, pz + 2) - R.groundAt(px, pz - 2)) / 4;
    if (sl < 0.45 || sl > 1.1) continue;
    kit.rock(px, pz, R.groundAt(px, pz) - 0.6, 1.2 + rnd() * 1.8);
    rocks++;
  }
  game.snowTrees = n;
}
