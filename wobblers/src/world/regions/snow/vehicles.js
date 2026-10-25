// Frostpeak vehicles: the snowmobile, the snowcat (piste basher, with a blade
// that shoves snowmen and snowballs about) and the wooden sled. All three use
// the ray-cast wheel controller with hidden wheels (skis, tracks and runners
// are drawn instead) and a snow handling layer on top: hill-climb assist for
// the motor vehicles, gravity sledding with a kick-start for the sled.
import { registerVehicle, registerHandling } from '../../../vehicles.js';
import { registerCallable } from '../../../phone.js';
import { DT } from '../../../config.js';

const PI = Math.PI;
const hideWheels = (v) => {
  if (v._snowWheels) return;
  v._snowWheels = true;
  for (const m of v.wheelMeshes || []) if (m) m.visible = false;
};

// ---- handling ------------------------------------------------------------------------
// climb: share of the slope's gravity pull cancelled while driving uphill on the throttle
function snowHandling(climb, drag = 0) {
  return {
    wheels: true,
    update(v, drv, vel, fwd, up, side) {
      hideWheels(v);
      v.updateWheels(drv, vel, fwd, up, side);
      if (!v.grounded) return;
      const m = v.massEff, t = v.throttle;
      if (drv && climb && Math.abs(t) > 0.05 && Math.abs(fwd.y) > 0.08) {
        const uphill = Math.sign(t) * fwd.y > 0;
        if (uphill) v.body.applyImpulse({ x: fwd.x * Math.sign(t) * 9.81 * Math.abs(fwd.y) * climb * m * DT * v.grounded, y: 0, z: fwd.z * Math.sign(t) * 9.81 * Math.abs(fwd.y) * climb * m * DT * v.grounded }, true);
      }
      if (drag) { // air drag on fast sleds: keeps them a thrill, not a missile
        const s = Math.hypot(vel.x, vel.y, vel.z);
        if (s > drag) { const k = (s - drag) * 1.2 * DT / s; v.body.applyImpulse({ x: -vel.x * k * m, y: -vel.y * k * m * 0.3, z: -vel.z * k * m }, true); }
      }
    },
  };
}
registerHandling('snowmobile', snowHandling(0.55));
registerHandling('snowcat', snowHandling(0.95));
registerHandling('sled', snowHandling(0, 15));

// ---- snowmobile -------------------------------------------------------------------------
registerVehicle('snowmobile', {
  mass: 260, half: [0.5, 0.22, 1.25], open: true, handling: 'snowmobile',
  axles: [
    { z: 0.95, x: 0.48, y: -0.12, r: 0.2, rest: 0.26, steer: 1, drive: 0.1 },
    { z: -0.75, x: 0.3, y: -0.12, r: 0.26, rest: 0.24, steer: 0, drive: 0.9, hand: true },
  ],
  accel: 10.5, maxSpeed: 22, rev: 6, brakeDecel: 10, steer: 0.6, grip: 1.35, sideFric: 0.85, tipH: 0.25,
  susp: { k: 22, c: 2.0 }, com: [0, -0.22, 0],
  seats: [{ pos: [0, 0.42, -0.3], kind: 'driver' }, { pos: [0, 0.48, -0.85] }],
  camH: 1.3, camDist: 6.8, horn: 'quad', voice: 'quad', lights: { head: [0.25, 1.22], tail: [0.1, -1.2] },
  colliders(add, C, def) {
    const h = def.half;
    add(C.roundCuboid(h[0] - 0.06, h[1] - 0.06, h[2] - 0.06, 0.06));
  },
  mesh(b, def, color, P) {
    const dark = 0x22232a;
    b.rbox(0.98, 0.42, 1.05, 0.16, color, [0, 0.12, 0.72]);                 // hood
    b.rbox(0.8, 0.26, 0.5, 0.12, color, [0, 0.0, 1.22], [0.35, 0, 0]);       // nose
    b.rbox(0.96, 0.22, 1.3, 0.08, color, [0, -0.02, -0.45]);                 // side panels
    b.rbox(0.48, 0.2, 1.05, 0.08, dark, [0, 0.27, -0.5]);                    // seat
    b.rbox(0.72, 0.3, 1.55, 0.1, dark, [0, -0.2, -0.55]);                    // track tunnel
    for (let i = 0; i < 9; i++) b.box(0.62, 0.05, 0.08, 0x111114, [0, -0.38, -1.25 + i * 0.17]); // tread
    for (const sx of [-1, 1]) {
      b.box(0.15, 0.05, 1.05, 0x2a2a33, [sx * 0.48, -0.47, 0.95]);           // ski
      b.box(0.15, 0.05, 0.3, 0x2a2a33, [sx * 0.48, -0.39, 1.55], [-0.6, 0, 0]); // upturned tip
      b.cyl(0.035, 0.035, 0.45, 0x888888, [sx * 0.45, -0.25, 0.95], [0, 0, sx * 0.25], 6); // strut
      b.box(0.04, 0.12, 0.7, 0xffffff, [sx * 0.49, 0.06, 0.6]);              // racing stripe
    }
    b.cyl(0.03, 0.03, 0.75, 0x777777, [0, 0.55, 0.28], [0, 0, PI / 2], 6);   // handlebar
    b.box(0.06, 0.25, 0.06, 0x777777, [0, 0.42, 0.32]);
    P.glass.box(0.78, 0.34, 0.03, 0, [0, 0.52, 0.48], [-0.45, 0, 0]);
  },
});
registerCallable({ id: 'snowmobile', type: 'snowmobile', name: 'Snowmobile', color: 0xe8322b,
  svg: '<path d="M4 7 L8 4 L15 4 L19 7 L19 9 L4 9 Z"/><path d="M2 12 L13 12 L13 11 L3 11 Z"/><path d="M14 11.2 L22 11.2 L23 10 L23 12.4 L14 12.4 Z"/><path d="M3 9 L13 9 L13 11 L3 11 Z" opacity=".6"/>' }, 'heli');

// ---- snowcat (piste basher) -------------------------------------------------------------
registerVehicle('snowcat', {
  mass: 2600, half: [1.25, 0.42, 2.2], cabin: { half: [0.95, 0.7, 0.85], off: [0, 1.12, 0.35] }, handling: 'snowcat',
  axles: [1.7, 0.0, -1.7].map((z, i) => ({ z, x: 1.0, y: -0.15, r: 0.5, rest: 0.4, steer: [1, 0, -0.6][i], drive: 1 / 3, hand: i > 0 })),
  accel: 5.5, maxSpeed: 11, rev: 5, brakeDecel: 9, steer: 0.75, grip: 2.4, tipH: 0.4,
  susp: { k: 20, c: 2.2 }, com: [0, -0.45, 0],
  seats: [{ pos: [0.42, 0.66, 0.4], kind: 'driver' }, { pos: [-0.42, 0.66, 0.4] }],
  camH: 3.0, camDist: 11, horn: 'truck', voice: 'tractor', lights: { head: [1.62, 1.22], tail: [0.4, -2.2] },
  colliders(add, C, def) {
    const h = def.half, c = def.cabin;
    // hull kept clear of the snow (the ray-cast wheels carry it; tracks are visual)
    add(C.roundCuboid(h[0] - 0.1, h[1] - 0.25, h[2] - 0.3, 0.1).setTranslation(0, 0.15, 0));
    add(C.roundCuboid(c.half[0] - 0.1, c.half[1] - 0.1, c.half[2] - 0.1, 0.1).setTranslation(...c.off));
    add(C.cuboid(1.7, 0.3, 0.08).setTranslation(0, 0.15, h[2] + 0.75)); // blade (pushes snowmen and snowballs)
  },
  mesh(b, def, color, P) {
    const h = def.half, c = def.cabin, dark = 0x1e1e24;
    b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.12, color, [0, 0, 0]);
    // cabin with pillars and glass
    const top = c.off[1] + c.half[1];
    b.rbox(c.half[0] * 2 + 0.1, 0.14, c.half[2] * 2 + 0.1, 0.05, 0xffffff, [0, top, c.off[2]]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, c.half[1] * 2, 0.1, color, [sx * c.half[0], c.off[1], c.off[2] + sz * c.half[2]]);
    P.glass.box(c.half[0] * 2 - 0.1, c.half[1] * 2 - 0.15, 0.03, 0, [0, c.off[1], c.off[2] + c.half[2]]);
    P.glass.box(c.half[0] * 2 - 0.1, c.half[1] * 2 - 0.15, 0.03, 0, [0, c.off[1], c.off[2] - c.half[2]]);
    for (const sx of [-1, 1]) P.glass.box(0.03, c.half[1] * 2 - 0.15, c.half[2] * 2 - 0.1, 0, [sx * c.half[0], c.off[1], c.off[2]]);
    b.cyl(0.12, 0.12, 0.18, 0xff8a1a, [0.6, top + 0.15, c.off[2] - 0.4], null, 10);   // beacon
    b.box(0.6, 0.12, 0.3, 0x2a2a33, [0, top + 0.12, c.off[2] + 0.6]);                 // light bar
    // tracks: belts with grousers and road wheels
    for (const sx of [-1, 1]) {
      b.rbox(0.6, 0.72, h[2] * 2 + 0.5, 0.3, dark, [sx * 1.25, -0.35, 0]);
      for (let i = 0; i < 14; i++) b.box(0.64, 0.06, 0.12, 0x33343c, [sx * 1.25, 0.03, -h[2] - 0.05 + i * 0.35]);
      for (const z of [-1.6, -0.55, 0.55, 1.6]) b.cyl(0.26, 0.26, 0.64, 0x8a8f96, [sx * 1.25, -0.42, z], [0, 0, PI / 2], 10);
      b.box(0.06, 0.18, h[2] * 1.6, 0xffffff, [sx * (h[0] + 0.0), 0.15, 0]);      // stripe
    }
    // front blade on two arms
    b.rbox(3.4, 0.75, 0.16, 0.05, 0x3a3f4a, [0, 0.1, h[2] + 0.75], [0.25, 0, 0]);
    b.box(3.4, 0.12, 0.2, 0xffd23f, [0, 0.48, h[2] + 0.66], [0.25, 0, 0]);
    for (const sx of [-1, 1]) b.box(0.12, 0.12, 0.8, 0x555a64, [sx * 0.8, -0.1, h[2] + 0.35]);
    // rear tiller (the comb that grooms the piste)
    b.rbox(2.6, 0.3, 0.6, 0.08, 0x3a3f4a, [0, -0.35, -h[2] - 0.45]);
    for (let i = 0; i < 12; i++) b.box(0.05, 0.12, 0.4, 0x22232a, [-1.2 + i * 0.22, -0.5, -h[2] - 0.72]);
  },
});
registerCallable({ id: 'snowcat', type: 'snowcat', name: 'Snowcat', color: 0xd9342b,
  svg: '<path d="M6 8 L6 2.5 L13 2.5 L15 5 L19 5 L19 8 Z"/><path d="M3 8 L20 8 Q22 8 22 10 Q22 12 20 12 L5 12 Q3 12 3 10 Z" opacity=".7"/><path d="M21 6 L23.5 6 L23.5 12 L21 12 Z"/>' }, 'heli');

// ---- sled --------------------------------------------------------------------------------
registerVehicle('sled', {
  mass: 120, half: [0.42, 0.1, 0.9], open: true, handling: 'sled',
  axles: [
    { z: 0.6, x: 0.32, y: -0.04, r: 0.11, rest: 0.12, steer: 1, drive: 0.5 },
    { z: -0.6, x: 0.32, y: -0.04, r: 0.11, rest: 0.12, steer: -0.35, drive: 0.5, hand: true },
  ],
  accel: 2.4, maxSpeed: 4.5, rev: 1.6, brakeDecel: 5, steer: 0.5, grip: 1.25, tipH: 0.2,
  susp: { k: 32, c: 2.6 }, com: [0, -0.12, 0],
  seats: [{ pos: [0, 0.32, -0.2], kind: 'driver' }, { pos: [0, 0.34, -0.72] }],
  camH: 1.2, camDist: 6.2, horn: 'kart', engineVoice: { w1: 'triangle', w2: 'sine', base: 110, range: 1.2, ratio: 0.5, lp: 500, vol: 0.004, am: 0 },
  colliders(add, C, def) { add(C.roundCuboid(def.half[0] - 0.05, def.half[1] - 0.04, def.half[2] - 0.05, 0.04).setTranslation(0, 0.05, 0)); },
  mesh(b, def, color, P) {
    for (let i = 0; i < 5; i++) b.rbox(0.82, 0.05, 0.3, 0.02, i % 2 ? 0xc89058 : 0xb47a42, [0, 0.12, -0.72 + i * 0.36]); // slats
    for (const sx of [-1, 1]) {
      b.rbox(0.07, 0.07, 1.85, 0.03, color, [sx * 0.34, -0.12, 0]);                     // runner
      b.torus(0.18, 0.035, color, [sx * 0.34, 0.02, 0.92], [0, PI / 2, 0], 10);          // curled tip
      for (const z of [-0.55, 0, 0.55]) b.box(0.05, 0.22, 0.05, 0x7a5032, [sx * 0.34, 0.0, z]);
      b.box(0.04, 0.04, 1.4, 0x7a5032, [sx * 0.4, 0.22, -0.1]);                          // side rail
    }
    b.box(0.8, 0.05, 0.08, 0x7a5032, [0, 0.2, 0.62]);
    b.torus(0.12, 0.012, 0xffd23f, [0, 0.22, 0.85], [PI / 2, 0, 0], 10);                  // pull rope
  },
});
registerCallable({ id: 'sled', type: 'sled', name: 'Sled', color: 0xe8322b,
  svg: '<path d="M3 7 L18 7 L18 9 L3 9 Z"/><path d="M2 11 L19 11 Q23 11 22 7 L21 7 Q21.5 10 19 10 L2 10 Z"/><path d="M5 9 L6 9 L6 10.5 L5 10.5 Z M15 9 L16 9 L16 10.5 L15 10.5 Z"/>' }, 'heli');
