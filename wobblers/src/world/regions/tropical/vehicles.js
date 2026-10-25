// Coconut Cove vehicles: beach buggy, golf cart, speedboat, sailboat, pedalo
// and a banana boat (a slow, wobbly boat with five saddles). Registered on
// import; the buggy and the speedboat are on the phone.
import { registerVehicle } from '../../../vehicles.js';
import { registerCallable } from '../../../phone.js';
import { QUIET } from '../jungle/vehicles.js';

const PI = Math.PI;
const axles = (x, y, zf, zr, r, rest, fd = 0.4) => [
  { z: zf, x, y, r, rest, steer: 1, drive: fd },
  { z: zr, x, y, r, rest, steer: 0, drive: 1 - fd, hand: true },
];

registerVehicle('beachbuggy', {
  mass: 520, half: [0.8, 0.22, 1.5], open: true,
  axles: axles(0.86, -0.02, 1.05, -1.0, 0.44, 0.38, 0.35), accel: 11, maxSpeed: 24, rev: 8, brakeDecel: 13, steer: 0.62, grip: 1.6,
  susp: { k: 18, c: 1.5 }, com: [0, -0.3, -0.1],
  seats: [{ pos: [0.3, 0.2, -0.15], kind: 'driver' }, { pos: [-0.3, 0.2, -0.15] }],
  camH: 1.4, camDist: 7, horn: 'kart', voice: 'quad', lights: { head: [0.2, 1.5] },
  mesh(b, def, c, P) {
    const h = def.half, dark = P.dark;
    b.rbox(1.3, 0.22, 2.6, 0.08, dark, [0, -0.08, 0]);
    b.rbox(1.2, 0.3, 0.9, 0.12, c, [0, 0.06, 1.05]);                  // nose
    b.rbox(1.1, 0.35, 0.5, 0.1, c, [0, 0.12, -1.2]);                  // engine cover
    for (const sx of [-1, 1]) {
      b.cyl(0.04, 0.04, 1.6, c, [sx * 0.6, 0.9, -0.3], [0, 0, sx * 0.08], 6);   // roll cage
      b.cyl(0.04, 0.04, 1.3, c, [sx * 0.58, 0.75, 0.55], [0.75, 0, 0], 6);
      b.cyl(0.04, 0.04, 1.2, c, [sx * 0.58, 0.85, -0.95], [-0.55, 0, 0], 6);
    }
    b.cyl(0.04, 0.04, 1.2, c, [0, 1.68, -0.3], [0, 0, PI / 2], 6);
    for (const sx of [-1, 1]) b.rbox(0.48, 0.12, 0.5, 0.05, 0x222228, [sx * 0.3, 0.1, -0.15]), b.rbox(0.48, 0.55, 0.1, 0.04, 0x222228, [sx * 0.3, 0.4, -0.42]);
    b.cyl(0.16, 0.16, 0.03, 0x222228, [0.3, 0.6, 0.35], [-1.0, 0, 0], 10);
    for (const a of def.axles) for (const sx of [-1, 1]) b.rbox(0.36, 0.06, 0.7, 0.03, c, [sx * 0.86, 0.5, a.z]);
    b.cyl(0.03, 0.03, 0.9, 0x888888, [-0.5, 1.0, -1.35], null, 4); b.box(0.02, 0.3, 0.45, 0xff5a8a, [-0.5, 1.4, -1.15]); // flag
    void h;
  },
});

registerVehicle('golfcart', {
  mass: 450, half: [0.65, 0.22, 1.25], open: true,
  axles: axles(0.6, -0.05, 0.85, -0.85, 0.26, 0.2, 0), accel: 5.5, maxSpeed: 10, rev: 4, brakeDecel: 9, steer: 0.6, grip: 1.3,
  susp: { k: 22, c: 2 }, com: [0, -0.2, 0],
  seats: [{ pos: [0.27, 0.32, 0.05], kind: 'driver' }, { pos: [-0.27, 0.32, 0.05] }, { pos: [0.27, 0.32, -0.95], yaw: PI }, { pos: [-0.27, 0.32, -0.95], yaw: PI }],
  camH: 1.5, camDist: 6.5, horn: 'bumper', engineVoice: { w1: 'triangle', w2: 'sine', base: 120, range: 1.4, ratio: 0.5, lp: 800, vol: 0.03, am: 0 },
  lights: { head: [0.1, 1.27] },
  mesh(b, def, c, P) {
    const h = def.half;
    b.rbox(h[0] * 2, 0.3, h[2] * 2, 0.1, c, [0, 0, 0]);
    b.rbox(h[0] * 2, 0.35, 0.5, 0.12, c, [0, 0.2, h[2] - 0.25]);
    for (const z of [0.05, -0.95]) { b.rbox(1.1, 0.12, 0.5, 0.05, 0xffffff, [0, 0.22, z]); b.rbox(1.1, 0.42, 0.1, 0.04, 0xffffff, [0, 0.45, z + (z > -0.5 ? -0.27 : 0.27)]); }
    for (const sx of [-1, 1]) for (const z of [0.55, -1.05]) b.cyl(0.03, 0.03, 1.55, 0xdddddd, [sx * 0.55, 1.0, z], null, 5);
    b.rbox(1.35, 0.08, 2.0, 0.04, 0x3fae5a, [0, 1.8, -0.25]);         // canopy
    for (let i = -3; i <= 3; i++) b.box(0.1, 0.02, 2.02, i % 2 ? 0xffffff : 0x3fae5a, [i * 0.19, 1.85, -0.25]);
    P.glass.box(1.1, 0.7, 0.03, 0, [0, 1.25, 0.56], [-0.1, 0, 0]);
    b.cyl(0.15, 0.15, 0.03, 0x222228, [0.27, 0.75, 0.45], [-0.9, 0, 0], 10);
    b.box(0.5, 0.5, 0.3, 0x2a2a33, [0, 0.45, -1.3]);                   // golf bag rack
    for (const x of [-0.12, 0, 0.12]) b.cyl(0.02, 0.02, 0.5, 0xbbbbbb, [x, 0.9, -1.3], null, 4);
  },
});

registerVehicle('speedboat', {
  mass: 520, half: [1.0, 0.35, 2.6], boat: true, engine: 7600, maxSpeed: 24, steer: 1.1,
  seats: [{ pos: [0.38, 0.32, -0.2], kind: 'driver' }, { pos: [-0.38, 0.32, -0.2] }, { pos: [0.38, 0.32, -1.4] }, { pos: [-0.38, 0.32, -1.4] }],
  camH: 1.7, camDist: 10, horn: 'boat', voice: 'sports',
  mesh(b, def, c, P) {
    const h = def.half;
    b.rbox(h[0] * 2, 0.55, h[2] * 2, 0.22, 0xffffff, [0, -0.1, 0]);
    b.rbox(h[0] * 2 + 0.06, 0.16, h[2] * 2 + 0.06, 0.08, c, [0, -0.32, 0]);
    b.cone(h[0], 1.4, 0xffffff, [0, -0.1, h[2] + 0.62], [PI / 2, 0, 0], 4);
    b.box(h[0] * 2 - 0.1, 0.06, 1.3, c, [0, 0.21, 1.6]);               // bow deck stripe
    for (const z of [-0.2, -1.4]) { b.rbox(1.6, 0.14, 0.55, 0.06, 0xf2e6c4, [0, 0.2, z]); b.rbox(1.6, 0.5, 0.12, 0.05, 0xf2e6c4, [0, 0.42, z - 0.3]); }
    P.glass.box(1.7, 0.45, 0.04, 0, [0, 0.6, 0.55], [-0.6, 0, 0]);
    b.rbox(0.42, 0.65, 0.42, 0.08, 0x2a2a33, [0, 0.1, -h[2] - 0.15]); // outboard motor
    b.cyl(0.14, 0.14, 0.03, 0x222228, [0.38, 0.62, 0.3], [-0.9, 0, 0], 10);
    for (const s of [-1, 1]) b.box(0.05, 0.05, 3.5, 0xdddddd, [s * (h[0] - 0.04), 0.3, -0.2]);
  },
});

registerVehicle('sailboat', {
  mass: 600, half: [1.05, 0.35, 2.8], boat: true, engine: 3800, maxSpeed: 12, steer: 0.9,
  seats: [{ pos: [0.4, 0.3, -2.0], kind: 'driver' }, { pos: [-0.4, 0.3, -2.0] }, { pos: [0.5, 0.3, -0.8] }, { pos: [-0.5, 0.3, -0.8] }],
  camH: 2.4, camDist: 12, horn: 'boat', engineVoice: QUIET,
  mesh(b, def, c, P) {
    const h = def.half;
    b.rbox(h[0] * 2, 0.6, h[2] * 2, 0.25, 0xffffff, [0, -0.08, 0]);
    b.rbox(h[0] * 2 + 0.06, 0.14, h[2] * 2 + 0.06, 0.07, c, [0, -0.32, 0]);
    b.cone(h[0], 1.3, 0xffffff, [0, -0.08, h[2] + 0.6], [PI / 2, 0, 0], 4);
    b.box(h[0] * 2 - 0.12, 0.06, h[2] * 2 - 0.4, 0xc8a06a, [0, 0.24, 0]);
    b.rbox(1.2, 0.5, 1.4, 0.1, 0xffffff, [0, 0.45, 0.9]);               // cabin
    for (const s of [-1, 1]) P.glass.box(0.03, 0.18, 0.5, 0, [s * 0.61, 0.55, 0.9]);
    b.cyl(0.07, 0.07, 7, 0xdddddd, [0, 3.7, 0.4], null, 6);             // mast
    b.cyl(0.05, 0.05, 2.7, 0xdddddd, [0, 1.25, -0.95], [PI / 2, 0, 0], 5); // boom
    // main sail and jib (thin boxes so both sides draw)
    const sail = (pts, color) => { for (let i = 0; i < 8; i++) { const t0 = i / 8; const w = pts.w * (1 - t0), y = pts.y0 + (pts.y1 - pts.y0) * (t0 + 1 / 16); b.box(0.02, (pts.y1 - pts.y0) / 8 + 0.01, w, color(i), [0, y, pts.z - w / 2]); } };
    sail({ w: 2.6, y0: 1.35, y1: 6.9, z: 0.3 }, (i) => (i % 3 === 1 ? c : 0xffffff));
    sail({ w: 1.7, y0: 0.6, y1: 6.2, z: 2.2 }, () => 0xffffff);
    b.cyl(0.015, 0.015, 6.0, 0x888888, [0, 3.7, 1.6], [0.3, 0, 0], 3);
  },
});

registerVehicle('pedalo', {
  mass: 160, half: [0.9, 0.3, 1.3], boat: true, engine: 900, maxSpeed: 4, steer: 1.2,
  seats: [{ pos: [0.38, 0.32, -0.1], kind: 'driver' }, { pos: [-0.38, 0.32, -0.1] }],
  camH: 1.4, camDist: 6.5, horn: 'bumper', engineVoice: QUIET,
  buoy: { points: [[0.65, -0.2, 1], [-0.65, -0.2, 1], [0.65, -0.2, -1], [-0.65, -0.2, -1]], r: 0.3, volume: 0.9 },
  mesh(b, def, c) {
    for (const s of [-1, 1]) { b.capsule(0.3, 2.1, c, [s * 0.65, -0.15, 0], [PI / 2, 0, 0]); b.cone(0.3, 0.5, c, [s * 0.65, -0.15, 1.3], [PI / 2, 0, 0], 10); }
    b.rbox(1.6, 0.14, 1.6, 0.05, 0xffffff, [0, 0.12, 0]);
    for (const s of [-1, 1]) { b.rbox(0.62, 0.12, 0.55, 0.05, 0xffd23f, [s * 0.38, 0.24, -0.1]); b.rbox(0.62, 0.55, 0.1, 0.04, 0xffd23f, [s * 0.38, 0.5, -0.38]); }
    b.cyl(0.32, 0.32, 0.12, 0xffffff, [0, 0.05, -0.85], [0, 0, PI / 2], 12); // paddle wheel
    b.rbox(0.9, 0.5, 0.35, 0.12, 0xffffff, [0, 0.28, 0.85]);
    b.sphere(0.32, c, [0, 0.62, 1.0], [1, 0.9, 1.1], 10);                    // swan-ish head
    b.cone(0.1, 0.25, 0xff8a1a, [0, 0.6, 1.36], [PI / 2, 0, 0], 6);
  },
});

registerVehicle('bananaboat', {
  mass: 260, half: [0.55, 0.35, 2.4], boat: true, engine: 2600, maxSpeed: 9, steer: 1.1,
  seats: [{ pos: [0, 0.48, -1.7], kind: 'driver' }, { pos: [0, 0.5, -0.85] }, { pos: [0, 0.52, 0] }, { pos: [0, 0.5, 0.85] }, { pos: [0, 0.48, 1.6] }],
  camH: 1.8, camDist: 9, horn: 'kart', voice: 'scooter',
  colliders(add, C, def) { add(C.capsule(def.half[2] - 0.4, 0.42).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })); },
  buoy: { points: [[0, -0.15, 1.8], [0.3, -0.15, 0], [-0.3, -0.15, 0], [0, -0.15, -1.8]], r: 0.38, volume: 0.9 },
  mesh(b, def) {
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1), z = -2.1 + t * 4.2, y = 0.25 * Math.pow(Math.abs(t - 0.5) * 2, 2), r = 0.45 * (1 - Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.6);
      b.sphere(r, 0xffd23f, [0, y, z], [1, 1, 0.9], 10);
    }
    b.cone(0.18, 0.5, 0x6b4a2a, [0, 0.55, 2.4], [-0.9, 0, 0], 6);
    for (const z of [-1.7, -0.85, 0, 0.85, 1.6]) for (const s of [-1, 1]) b.torus(0.08, 0.025, 0x3a3a40, [s * 0.38, 0.65, z + 0.25], [0, PI / 2, 0], 8); // grab handles
    for (const s of [-1, 1]) b.capsule(0.16, 3.2, 0xff5a3a, [s * 0.62, -0.12, 0], [PI / 2, 0, 0]);
  },
});

registerCallable({ id: 'beachbuggy', type: 'beachbuggy', name: 'Beach buggy', icon: 'quad', color: 0xff5a8a }, 'boat');
registerCallable({ id: 'speedboat', type: 'speedboat', name: 'Speedboat', icon: 'boat', color: 0xff3a5a }, 'heli');
