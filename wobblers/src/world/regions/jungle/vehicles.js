// Tiki Jungle vehicles: an open safari jeep, a two-seat canoe and a log raft
// (both paddled boats: slow, quiet). Registered on import; the jeep and the
// canoe are on the phone.
import { registerVehicle } from '../../../vehicles.js';
import { registerCallable } from '../../../phone.js';

const PI = Math.PI;
export const QUIET = { w1: 'sine', w2: 'sine', base: 20, range: 1, ratio: 1, lp: 120, vol: 0.002, am: 0 };

registerVehicle('jeep', {
  mass: 1250, half: [0.95, 0.34, 2.0], open: true,
  axles: [
    { z: 1.35, x: 0.92, y: -0.12, r: 0.5, rest: 0.45, steer: 1, drive: 0.5 },
    { z: -1.3, x: 0.92, y: -0.12, r: 0.5, rest: 0.45, steer: 0, drive: 0.5, hand: true },
  ],
  accel: 9, maxSpeed: 23, rev: 9, brakeDecel: 12, steer: 0.6, grip: 1.55,
  susp: { k: 17, c: 1.5 }, com: [0, -0.35, 0],
  seats: [{ pos: [0.42, 0.22, 0.15], kind: 'driver' }, { pos: [-0.42, 0.22, 0.15] }, { pos: [0.42, 0.32, -0.95] }, { pos: [-0.42, 0.32, -0.95] }],
  camH: 1.7, camDist: 8.5, horn: 'truck', voice: 'pickup', lights: { head: [0.12, 2.02], tail: [0.1, -2.02] },
  mesh(b, def, c, P, v) {
    const h = def.half, dark = P.dark, trim = P.trim;
    b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.16, c, [0, 0, 0], null, 3);
    b.rbox(h[0] * 2 + 0.04, 0.16, h[2] * 2 + 0.06, 0.08, dark, [0, -h[1] + 0.06, 0]);
    b.rbox(h[0] * 2 - 0.2, 0.22, 1.0, 0.1, c, [0, h[1] + 0.05, 1.45]); // hood
    // grille + bumpers
    b.box(1.1, 0.42, 0.06, dark, [0, 0.05, h[2] + 0.02]);
    for (let i = -3; i <= 3; i++) b.box(0.05, 0.36, 0.08, 0x8a8f96, [i * 0.14, 0.05, h[2] + 0.04]);
    b.rbox(h[0] * 2 + 0.1, 0.16, 0.16, 0.05, 0x3a3a40, [0, -0.2, h[2] + 0.1]);
    b.rbox(h[0] * 2 + 0.1, 0.16, 0.16, 0.05, 0x3a3a40, [0, -0.2, -h[2] - 0.1]);
    // arches
    for (const a of def.axles) for (const sx of [-1, 1]) b.cyl(a.r + 0.08, a.r + 0.08, 0.1, trim, [sx * (h[0] - 0.02), a.y + 0.04, a.z], [0, 0, PI / 2], 14);
    // windscreen frame (folded up) + roll cage
    for (const sx of [-1, 1]) b.box(0.07, 0.62, 0.07, dark, [sx * 0.85, h[1] + 0.32, 0.92], [-0.2, 0, 0]);
    b.box(1.76, 0.07, 0.07, dark, [0, h[1] + 0.62, 0.86]);
    P.glass.box(1.6, 0.5, 0.03, 0, [0, h[1] + 0.33, 0.93], [-0.2, 0, 0]);
    for (const sx of [-1, 1]) { b.box(0.08, 1.05, 0.08, dark, [sx * 0.86, h[1] + 0.52, -0.45]); b.box(0.08, 0.08, 1.4, dark, [sx * 0.86, h[1] + 1.03, -1.12]); b.box(0.08, 1.0, 0.08, dark, [sx * 0.86, h[1] + 0.52, -1.8]); }
    b.box(1.8, 0.08, 0.08, dark, [0, h[1] + 1.05, -0.45]);
    b.box(1.8, 0.08, 0.08, dark, [0, h[1] + 1.03, -1.8]);
    // roof light bar, spare wheel, jerry can, bench seats
    b.box(1.2, 0.1, 0.12, dark, [0, h[1] + 1.12, -0.45]);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) P.lights.sphere(0.07, 0xffffff, [x, h[1] + 1.16, -0.38], [1, 1, 0.5]);
    b.cyl(0.42, 0.42, 0.26, 0x1e1e24, [0, 0.25, -h[2] - 0.2], [PI / 2, 0, 0], 14);
    b.cyl(0.24, 0.24, 0.28, 0xdddddd, [0, 0.25, -h[2] - 0.2], [PI / 2, 0, 0], 10);
    b.rbox(0.22, 0.36, 0.14, 0.04, 0xc8343c, [0.7, h[1] + 0.2, -h[2] + 0.12]);
    b.rbox(1.7, 0.12, 0.5, 0.05, 0x6b4a2a, [0, 0.12, 0.12]);
    b.rbox(1.7, 0.5, 0.1, 0.04, 0x6b4a2a, [0, 0.42, -0.14]);
    b.rbox(1.7, 0.12, 0.5, 0.05, 0x6b4a2a, [0, 0.22, -0.98]);
    v.dash(b, 0.42, h[1], 0.75);
    b.cyl(0.18, 0.18, 0.04, 0x222228, [0.42, h[1] + 0.12, 0.62], [-0.9, 0, 0], 12); // steering wheel
    b.cyl(0.03, 0.03, 0.5, 0x222228, [0.42, h[1] - 0.05, 0.78], [-0.9, 0, 0], 5);
  },
});

registerVehicle('canoe', {
  mass: 110, half: [0.42, 0.22, 2.2], boat: true, engine: 900, maxSpeed: 6.5, steer: 1.5,
  seats: [{ pos: [0, 0.05, -1.1], kind: 'driver' }, { pos: [0, 0.05, 0.6] }],
  camH: 1.3, camDist: 7, horn: 'boat', engineVoice: QUIET,
  buoy: { points: [[0.25, -0.15, 1.6], [-0.25, -0.15, 1.6], [0.25, -0.15, 0], [-0.25, -0.15, 0], [0.25, -0.15, -1.6], [-0.25, -0.15, -1.6]], r: 0.25, volume: 0.75 },
  colliders(add, C, def) {
    const h = def.half;
    add(C.cuboid(h[0], 0.1, h[2] - 0.2).setTranslation(0, -0.12, 0));
    for (const s of [-1, 1]) add(C.cuboid(0.05, 0.16, h[2] - 0.3).setTranslation(s * (h[0] - 0.05), 0.08, 0));
  },
  mesh(b, def, c) {
    const h = def.half;
    b.sphere(1, c, [0, -0.02, 0], [h[0], 0.3, h[2]], 14);
    b.sphere(1, 0x6b4a2a, [0, 0.08, 0], [h[0] * 0.82, 0.08, h[2] * 0.86], 12);
    for (const z of [-1.1, 0.6]) b.box(h[0] * 1.9, 0.05, 0.22, 0xb98a5a, [0, 0.0, z]);
    b.cyl(0.03, 0.03, 1.5, 0xb98a5a, [0.36, 0.25, -1.0], [0, 0, 1.1], 5); // paddles resting on the gunwales
    b.box(0.16, 0.03, 0.34, 0xb98a5a, [0.98, -0.1, -1.0], [0, 0, 1.1]);
    b.cyl(0.03, 0.03, 1.5, 0xb98a5a, [-0.36, 0.25, 0.6], [0, 0, -1.1], 5);
    b.box(0.16, 0.03, 0.34, 0xb98a5a, [-0.98, -0.1, 0.6], [0, 0, -1.1]);
    for (const z of [-1, 1]) b.cone(0.12, 0.3, 0xffffff, [0, 0.18, z * (h[2] - 0.15)], null, 6);
  },
});

registerVehicle('lograft', {
  mass: 320, half: [1.3, 0.25, 1.6], boat: true, engine: 1700, maxSpeed: 4.5, steer: 1,
  seats: [{ pos: [0, 0.45, -1.0], kind: 'driver' }, { pos: [0.6, 0.45, 0.2] }, { pos: [-0.6, 0.45, 0.2] }, { pos: [0, 0.45, 1.0] }],
  camH: 1.5, camDist: 8, horn: 'boat', engineVoice: QUIET,
  colliders(add, C, def) { add(C.cuboid(def.half[0], 0.22, def.half[2]).setTranslation(0, 0, 0)); },
  mesh(b, def) {
    const h = def.half;
    for (let i = 0; i < 7; i++) b.cyl(0.2, 0.2, h[2] * 2, [0x9a6a3a, 0x8a5a36][i % 2], [-h[0] + 0.2 + i * (h[0] * 2 - 0.4) / 6, 0, 0], [PI / 2, 0, 0], 8);
    for (const z of [-1, 0, 1]) b.box(h[0] * 2 + 0.1, 0.08, 0.16, 0x6b4a2a, [0, 0.2, z * (h[2] - 0.3)]);
    b.cyl(0.06, 0.06, 2.2, 0x6b4a2a, [0, 1.3, 0.5], null, 5); // little mast with a leaf flag
    b.box(0.03, 0.6, 0.8, 0x3cae4a, [0, 2.05, 0.15]);
  },
});

registerCallable({ id: 'jeep', type: 'jeep', name: 'Safari jeep', icon: 'pickup', color: 0x5a7a3a }, 'boat');
registerCallable({ id: 'canoe', type: 'canoe', name: 'Canoe', icon: 'boat', color: 0xd9542b }, 'heli');
