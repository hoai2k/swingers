// The MINI TRAIN: a little steam engine and three open coaches running round
// an oval track (straights along z joined by semicircles) with a station on
// the midway side. Each car is a kinematic body placed along the track; the
// train stops at the station for a while every lap.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder } from '../../../mesh.js';
import { FAIR, MIDWAY, RIDES } from './layout.js';
import { setPose, travel, vmaxFor, ypr, rb, BULB } from './common.js';

const Y = FAIR.y;
const _q = new THREE.Quaternion();

export function buildTrain(game, kit, R, F) {
  const { x, z } = RIDES.train, side = Math.sign(MIDWAY.z - z);
  const RR = 8.5, HS = 11, LT = 4 * HS + 2 * Math.PI * RR, GAP = 2.9;
  // stadium path: s = 0 at the station (x + RR, z + side * 2), running along +z first
  const at = (s) => {
    s = ((s % LT) + LT) % LT;
    if (s < 2 * HS) return [x + RR, z - HS + s, 0];                                    // east straight, +z
    s -= 2 * HS;
    if (s < Math.PI * RR) { const a = s / RR; return [x + RR * Math.cos(a), z + HS + RR * Math.sin(a), a]; }
    s -= Math.PI * RR;
    if (s < 2 * HS) return [x - RR, z + HS - s, Math.PI];                               // west straight, -z
    s -= 2 * HS;
    const a = Math.PI + s / RR;
    return [x + RR * Math.cos(a), z - HS + RR * Math.sin(a), a];
  };
  // heading (yaw) along the track at s: tangent of the path
  const yawAt = (s) => { const p = at(s - 0.3), q = at(s + 0.3); return Math.atan2(q[0] - p[0], q[1] - p[1]); };
  const S0 = HS + side * 2; // station position along the east straight (nearer the midway)
  // track: sleepers + rails, a station platform, a tunnel, a sign
  const b = kit.b(x, z);
  for (let s = 0; s < LT; s += 0.9) {
    const [px, pz] = at(s), yaw = yawAt(s);
    b.box(1.5, 0.1, 0.3, 0x6b4426, [px, Y + 0.05, pz], [0, yaw, 0]);
  }
  for (const off of [-0.5, 0.5]) for (let s = 0; s < LT; s += 1.2) {
    const [px, pz] = at(s + 0.6), yaw = yawAt(s + 0.6), c = Math.cos(yaw), sn = Math.sin(yaw);
    b.box(0.08, 0.1, 1.25, 0x8a8f96, [px + c * off, Y + 0.14, pz - sn * off], [0, yaw, 0]);
  }
  const sx = x + RR + 2.0, sz = z + side * 2;
  kit.box(sx, Y + 0.25, sz, 2.2, 0.5, 10, 0xb98a5a);
  for (const dz of [-4.5, 4.5]) kit.cyl(sx + 0.8, Y + 1.9, sz + dz, 0.1, 3.2, 0xffffff, { seg: 8 });
  kit.deco(sx + 0.3, Y + 3.55, sz, 3.2, 0.2, 10.6, 0x3c8a3c);
  for (let i = 0; i < 8; i++) kit.deco(sx - 1.1 + 0.01, Y + 3.3, sz - 4.5 + i * 1.3, 0.05, 0.3, 0.65, i % 2 ? 0xffd23f : 0x3c8a3c);
  F.sign('MINI TRAIN', sx + 1.5, z + side * 9.5, side > 0 ? 0 : Math.PI, 3.2, '#3c8a3c', '#ffd23f', 5);
  // a little tunnel on the far straight
  const tz = z - side * 1, tx = x - RR;
  for (const k of [-1, 1]) kit.box(tx + k * 1.35, Y + 1.2, tz, 0.5, 2.4, 6, 0x8a6a4a);
  kit.profile(tx, Y + 2.3, tz, Math.PI / 2, 6, [[-1.6, 0], [-1.2, 0.6], [0, 0.9], [1.2, 0.6], [1.6, 0]], 0x8a6a4a, { side: 0x7a5a3a });
  for (let i = 0; i < 6; i++) kit.sphere(tx + (i % 3 - 1) * 0.9, Y + 3.1 + (i % 2) * 0.1, tz - 2 + i * 0.8, 0.35, i % 2 ? 0xe8742a : 0xd8a03a, { seg: 6 });

  // cars: engine + 3 coaches
  const cars = [];
  const mk = (engine, color) => {
    const cb = new Builder();
    rb(cb, 1.3, 0.35, 2.4, 0.1, 0x222228, [0, 0.35, 0]);
    for (const wx of [-0.62, 0.62]) for (const wz of [-0.75, 0.75]) cb.cyl(0.28, 0.28, 0.12, 0xd8321e, [wx, 0.28, wz], [0, 0, Math.PI / 2], 10);
    if (engine) {
      cb.cyl(0.5, 0.5, 1.5, color, [0, 1.0, 0.45], [Math.PI / 2, 0, 0], 14);
      cb.cyl(0.52, 0.52, 0.1, 0xffd23f, [0, 1.0, 1.0], [Math.PI / 2, 0, 0], 14);
      cb.cyl(0.15, 0.22, 0.7, 0x222228, [0, 1.75, 0.85], null, 10);
      cb.sphere(0.12, BULB, [0, 1.0, 1.22], null, 8);
      rb(cb, 1.2, 1.3, 0.9, 0.08, color, [0, 1.15, -0.65]);
      rb(cb, 1.35, 0.12, 1.1, 0.04, 0xffd23f, [0, 1.86, -0.65]);
      cb.box(0.8, 0.3, 0.05, 0x9fd8ff, [0, 1.45, -0.18]);
      cb.cone(0.5, 0.4, 0x6b4426, [0, 0.35, 1.3], [Math.PI / 2, 0, 0], 4);
    } else {
      rb(cb, 1.3, 0.55, 2.3, 0.1, color, [0, 0.75, 0]);
      cb.box(1.1, 0.3, 2.0, 0x6b4426, [0, 0.82, 0]);
      for (const bz of [-0.5, 0.6]) { rb(cb, 1.1, 0.2, 0.45, 0.05, 0xf6ead0, [0, 0.95, bz]); rb(cb, 1.1, 0.45, 0.1, 0.04, 0xf6ead0, [0, 1.2, bz - 0.22]); }
      for (const cx of [-0.6, 0.6]) for (const cz of [-1.05, 1.05]) cb.cyl(0.04, 0.04, 1.3, 0xffd23f, [cx, 1.6, cz], null, 6);
      rb(cb, 1.45, 0.1, 2.4, 0.04, color, [0, 2.25, 0]);
    }
    const body = F.body({ x: x + RR, y: Y + 0.2, z }, [RAPIER.ColliderDesc.cuboid(0.65, 0.2, 1.2).setTranslation(0, 0.4, 0)], cb.mesh());
    cars.push(body);
    if (engine) F.seat(body, [0, 1.0, -0.6], 0, 'Ride the engine', 'Choo choo!', [side * 1.6, 0.3, -0.6]);
    else for (const bz of [-0.5, 0.6]) for (const sxx of [-0.27, 0.27]) F.seat(body, [sxx, 1.13, bz], 0, 'Ride Mini Train', 'All aboard!', [side * 1.6, 0.3, bz]);
  };
  mk(true, 0x2f8a3a);
  mk(false, 0xd8321e); mk(false, 0xffd23f); mk(false, 0x3f8cff);
  // one lap per cycle: wait at the station, chug round, slow into the station again
  const W = 9, UP = 3, DOWN = 4, VM = 3.6, RUN = LT / VM - (UP + DOWN) / 2, P = W + UP + RUN + DOWN;
  F.animate('train', (t) => {
    const c = (t + 3) % P, s = S0 + travel(c, W, UP, RUN, DOWN, VM);
    cars.forEach((body, i) => {
      const si = s - i * GAP, [px, pz] = at(si), yaw = yawAt(si);
      ypr(_q, yaw);
      setPose(body, { x: px, y: Y + 0.2, z: pz }, _q);
    });
  });
}
