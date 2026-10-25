// Drivable vehicles: ray-cast wheeled cars (Rapier's vehicle controller) with
// arcade assists, buoyant boats and an arcade helicopter. Every vehicle carries
// seats players can hop into with Y.
//
// Handling model (wheeled): Rapier does suspension + tyre contact; on top of it
// we add a toy-car layer so driving feels like Wobbly Life rather than a sim:
//   - punchy engine curve (accel is m/s², independent of mass and riders)
//   - brake / coast / parked assists that act directly on the velocity
//   - yaw-rate assist toward a bicycle-model target, capped by `grip` (in g):
//     responsive, never spins out from small steering; handbrake raises the
//     target and drops the side grip for a controlled drift
//   - anti-roll toward the ground normal (a little visible roll is allowed),
//     levelling in the air so jumps land on the wheels, self-righting flip
//   - a sprung visual "shell" that wobbles with acceleration (toy bounce)
import * as THREE from 'three';
import { RAPIER, yawQuat } from './physics.js';
import { DT, VEH_GROUPS, WHEEL_QUERY, G_STATIC, G_VEH, G_PROP, groups } from './config.js';
import { Builder, matVC, matGlass, signMesh } from './mesh.js';

const CAR_COLORS = [0xff4d4d, 0x3d7dff, 0xffd23f, 0x4fd16a, 0xff8a3d, 0xb46cff, 0xffffff, 0x2bc4c4, 0xff7fc8, 0x444455];
const PI = Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Two axles: front steers, `fd` = share of drive on the front axle.
const axles2 = (x, y, zf, zr, r, rest, fd = 0.4) => [
  { z: zf, x, y, r, rest, steer: 1, drive: fd },
  { z: zr, x, y, r, rest, steer: 0, drive: 1 - fd, hand: true },
];

// Vehicle definitions. Dimensions in metres, body frame: +Z forward, +X left.
// Seat pos is the hips centre (a seated character's head top is ~0.96 above it).
// accel: m/s² at standstill; brakeDecel: m/s²; grip: max lateral g; steer: rad.
// susp: k (per-wheel stiffness per kg), c (damping); com: centre-of-mass offset.
export const VEHICLES = {
  car: {
    mass: 1000, half: [0.95, 0.32, 2.05], cabin: { half: [0.88, 0.47, 1.1], off: [0, 0.78, -0.3] },
    axles: axles2(0.86, -0.1, 1.35, -1.3, 0.4, 0.34), accel: 9.5, maxSpeed: 25, rev: 10, brakeDecel: 13, steer: 0.62, grip: 1.6,
    susp: { k: 22, c: 1.9 }, com: [0, -0.25, 0],
    seats: [{ pos: [0.4, 0.14, 0.05], kind: 'driver' }, { pos: [-0.4, 0.14, 0.05] }, { pos: [0.4, 0.14, -0.95] }, { pos: [-0.4, 0.14, -0.95] }],
    camH: 1.5, camDist: 8.5, horn: 'car', lights: { head: [0.05, 2.03], tail: [0.08, -2.05] },
  },
  police: {
    mass: 1050, half: [0.95, 0.32, 2.1], cabin: { half: [0.88, 0.47, 1.1], off: [0, 0.78, -0.3] },
    axles: axles2(0.86, -0.1, 1.38, -1.32, 0.4, 0.34), accel: 11, maxSpeed: 29, rev: 10, brakeDecel: 14, steer: 0.62, grip: 1.7,
    susp: { k: 24, c: 2.0 }, com: [0, -0.25, 0], siren: 'police', lightbar: [0, 1.31, -0.3, 1.2],
    seats: [{ pos: [0.4, 0.14, 0.05], kind: 'driver' }, { pos: [-0.4, 0.14, 0.05] }, { pos: [0.4, 0.14, -0.95] }, { pos: [-0.4, 0.14, -0.95] }],
    camH: 1.5, camDist: 8.5, lights: { head: [0.05, 2.08], tail: [0.08, -2.1] },
  },
  sports: {
    mass: 1100, half: [1.0, 0.27, 2.2], open: false, convertible: true,
    axles: axles2(0.9, -0.05, 1.45, -1.4, 0.38, 0.28, 0.2), accel: 12, maxSpeed: 34, rev: 10, brakeDecel: 16, steer: 0.55, grip: 1.9,
    susp: { k: 30, c: 2.4 }, com: [0, -0.2, -0.1],
    seats: [{ pos: [0.42, 0.04, -0.2], kind: 'driver' }, { pos: [-0.42, 0.04, -0.2] }],
    camH: 1.3, camDist: 8, horn: 'sports', lights: { head: [0.0, 2.18], tail: [0.05, -2.2] },
  },
  pickup: {
    mass: 1300, half: [1.0, 0.36, 2.5], cabin: { half: [0.92, 0.5, 0.8], off: [0, 0.86, 0.5] }, bed: true,
    axles: axles2(0.92, -0.12, 1.7, -1.6, 0.48, 0.42, 0.5), accel: 8.5, maxSpeed: 23, rev: 9, brakeDecel: 12, steer: 0.58, grip: 1.45,
    susp: { k: 18, c: 1.6 }, com: [0, -0.3, 0.2],
    seats: [{ pos: [0.42, 0.18, 0.5], kind: 'driver' }, { pos: [-0.42, 0.18, 0.5] }, { pos: [0.5, 0.5, -1.4], yaw: PI / 2 }, { pos: [-0.5, 0.5, -1.4], yaw: -PI / 2 }],
    camH: 1.8, camDist: 9.5, horn: 'truck', lights: { head: [0.1, 2.48], tail: [0.1, -2.5] },
  },
  van: {
    mass: 1500, half: [1.05, 0.38, 2.4], cabin: { half: [1.0, 0.75, 1.75], off: [0, 1.1, -0.45] },
    axles: axles2(0.95, -0.12, 1.6, -1.55, 0.45, 0.4, 0.5), accel: 7.5, maxSpeed: 21, rev: 9, brakeDecel: 11, steer: 0.58, grip: 1.3,
    susp: { k: 18, c: 1.6 }, com: [0, -0.35, 0],
    seats: [{ pos: [0.45, 0.32, 0.95], kind: 'driver' }, { pos: [-0.45, 0.32, 0.95] }, { pos: [0.45, 0.32, -0.4] }, { pos: [-0.45, 0.32, -0.4] }, { pos: [0.45, 0.32, -1.5] }, { pos: [-0.45, 0.32, -1.5] }],
    camH: 2.2, camDist: 10, horn: 'truck', lights: { head: [0.1, 2.38], tail: [0.1, -2.4] },
  },
  bus: {
    mass: 5500, half: [1.25, 0.4, 5.0], cabin: { half: [1.25, 1.0, 5.0], off: [0, 1.4, 0] },
    axles: axles2(1.05, -0.12, 3.5, -3.2, 0.55, 0.42, 0), accel: 7.5, maxSpeed: 25, rev: 7, brakeDecel: 9, steer: 0.62, grip: 1.15,
    susp: { k: 16, c: 1.5 }, com: [0, -0.3, 0],
    seats: [{ pos: [0.72, 0.86, 4.15], kind: 'driver' },
      ...[2.75, 1.55, 0.35, -0.85, -2.05, -3.25].flatMap((z) => [{ pos: [0.72, 0.86, z] }, { pos: [-0.72, 0.86, z] }])],
    camH: 3.0, camDist: 15, horn: 'bus', lights: { head: [0.05, 5.0], tail: [0.15, -5.0] },
  },
  firetruck: {
    mass: 5000, half: [1.15, 0.45, 3.4], cabin: { half: [1.12, 0.75, 0.95], off: [0, 1.2, 2.35] }, fire: true,
    axles: [
      { z: 2.4, x: 1.0, y: -0.12, r: 0.55, rest: 0.42, steer: 1, drive: 0 },
      { z: -1.5, x: 1.0, y: -0.12, r: 0.55, rest: 0.42, steer: 0, drive: 0.5, hand: true },
      { z: -2.65, x: 1.0, y: -0.12, r: 0.55, rest: 0.42, steer: -0.25, drive: 0.5, hand: true },
    ],
    accel: 6.5, maxSpeed: 22, rev: 8, brakeDecel: 10, steer: 0.6, grip: 1.25,
    susp: { k: 17, c: 1.6 }, com: [0, -0.35, 0], siren: 'fire', lightbar: [0, 1.99, 2.35, 1.5],
    seats: [{ pos: [0.5, 0.78, 2.3], kind: 'driver' }, { pos: [-0.5, 0.78, 2.3] },
      { pos: [0.72, 1.86, -0.6], yaw: PI / 2 }, { pos: [-0.72, 1.86, -0.6], yaw: -PI / 2 },
      { pos: [0.72, 1.86, -2.0], yaw: PI / 2 }, { pos: [-0.72, 1.86, -2.0], yaw: -PI / 2 }],
    camH: 3.0, camDist: 13.5, lights: { head: [0.05, 3.38], tail: [0.15, -3.4] },
  },
  tractor: {
    mass: 1800, half: [0.55, 0.3, 1.45], tractor: true,
    axles: [
      { z: 1.15, x: 0.62, y: 0.0, r: 0.42, rest: 0.3, steer: 1, drive: 0.2 },
      { z: -0.65, x: 0.86, y: 0.32, r: 0.74, rest: 0.3, steer: 0, drive: 0.8, hand: true, wide: 0.42 },
    ],
    accel: 6.5, maxSpeed: 14, rev: 6, brakeDecel: 10, steer: 0.7, grip: 1.3,
    susp: { k: 20, c: 1.8 }, com: [0, -0.15, -0.2],
    seats: [{ pos: [0, 1.02, -0.62], kind: 'driver' }, { pos: [0.86, 1.28, -0.62] }, { pos: [-0.86, 1.28, -0.62] }],
    camH: 2.0, camDist: 8.5, horn: 'tractor', lights: { head: [0.62, 1.45], tail: [0.55, -1.25] },
  },
  kart: {
    mass: 220, half: [0.62, 0.12, 1.0], open: true, kart: true,
    axles: axles2(0.62, -0.02, 0.72, -0.68, 0.22, 0.14, 0), accel: 12, maxSpeed: 26, rev: 7, brakeDecel: 14, steer: 0.6, grip: 1.9,
    susp: { k: 30, c: 2.6 }, com: [0, -0.1, -0.1],
    seats: [{ pos: [0, 0.12, -0.2], kind: 'driver' }], camH: 1.1, camDist: 5.8, horn: 'kart',
  },
  bumper: {
    mass: 260, half: [0.75, 0.18, 0.95], open: true, bumper: true,
    axles: axles2(0.5, -0.05, 0.55, -0.55, 0.16, 0.12, 0.5), accel: 7, maxSpeed: 6.5, rev: 5, brakeDecel: 10, steer: 0.9, grip: 1.6,
    susp: { k: 34, c: 3 }, com: [0, -0.15, 0], spin: 2.6,
    seats: [{ pos: [0, 0.18, -0.15], kind: 'driver' }], camH: 1.2, camDist: 6, horn: 'bumper',
  },
  quad: {
    mass: 300, half: [0.55, 0.2, 0.9], open: true, quad: true,
    axles: axles2(0.6, -0.05, 0.68, -0.66, 0.34, 0.28, 0.4), accel: 10, maxSpeed: 20, rev: 8, brakeDecel: 13, steer: 0.62, grip: 1.6,
    susp: { k: 20, c: 1.7 }, com: [0, -0.2, 0],
    seats: [{ pos: [0, 0.45, -0.25], kind: 'driver' }, { pos: [0, 0.5, -0.75] }], camH: 1.3, camDist: 6.5, horn: 'quad',
    lights: { head: [0.1, 0.9] },
  },
  scooter: {
    mass: 150, half: [0.24, 0.22, 0.8], open: true, bike: true,
    axles: axles2(0.3, -0.02, 0.62, -0.58, 0.28, 0.24, 0), accel: 10.5, maxSpeed: 25, rev: 5, brakeDecel: 12, steer: 0.55, grip: 1.1,
    susp: { k: 22, c: 2.2 }, com: [0, -0.3, 0], tipH: 0.15,
    seats: [{ pos: [0, 0.5, -0.28], kind: 'driver' }, { pos: [0, 0.6, -0.72] }], camH: 1.3, camDist: 6.5, horn: 'quad',
    lights: { head: [0.62, 0.85] },
  },
  boat: {
    mass: 420, half: [1.0, 0.35, 2.4], boat: true, engine: 4600, maxSpeed: 15, steer: 1,
    seats: [{ pos: [0, 0.3, -1.4], kind: 'driver' }, { pos: [0.42, 0.3, 0.1] }, { pos: [-0.42, 0.3, 0.1] }, { pos: [0, 0.3, 1.2] }],
    camH: 1.6, camDist: 9, horn: 'boat',
  },
  heli: {
    mass: 900, half: [0.85, 0.75, 1.45], heli: true, maxSpeed: 22,
    seats: [{ pos: [0.36, -0.44, 0.35], kind: 'driver' }, { pos: [-0.36, -0.44, 0.35] }, { pos: [0.36, -0.44, -0.6] }, { pos: [-0.36, -0.44, -0.6] }],
    camH: 1.6, camDist: 13, horn: 'heli',
  },
};

// ---- extending: new vehicle types and handling models without editing this file
//
// registerVehicle(type, def): adds/replaces VEHICLES[type]. def has the fields
// above (mass, half, axles, accel, maxSpeed, rev, brakeDecel, steer, grip,
// susp, com, seats, camH, camDist, lights, horn, cabin...), plus optionally
//   boat: true          buoyant hull (no wheels); engine (N), maxSpeed, steer; buoy: { points, r, volume } (default from half / mass)
//   heli: true          the arcade helicopter model
//   handling: 'name'    a model registered with registerHandling (replaces the wheel / boat / heli update)
//   mesh(b, def, color, P, vehicle)   custom look: add primitives to Builder b (body frame, +Z forward,
//                       +X left); P = { b, glass, lights, tail, c, dark, trim } builders/colours, P.shell the
//                       wobbling group (add extra meshes to it)
//   colliders(add, C, def, vehicle)   custom hull: add(RAPIER.ColliderDesc) for each shape (C = ColliderDesc)
//   voice: engine sound of another type ('car', 'bus', 'boat', 'kart', 'heli'...) or engineVoice: { w1, w2, base, range, ratio, lp, vol, am }
//   horn: horn of another type ('car', 'sports', 'truck', 'bus', 'boat', 'kart', 'heli', 'bumper')
// registerHandling(name, { update(vehicle, driver, vel, fwd, up, side), wheels: bool }):
//   update runs every physics step (vehicle.throttle / steer / handbrake / lift / fly are set from the
//   driver's input by control()); wheels: true keeps the ray-cast wheels (def.axles) and their controller.
// Make it callable from the phone with registerCallable (phone.js).
export const HANDLING = {};
export function registerVehicle(type, def) {
  if (!def || !def.seats?.length || !def.half) throw new Error('registerVehicle ' + type + ': needs half and seats');
  def.mass ??= 1000;
  VEHICLES[type] = def;
  return def;
}
export function registerHandling(name, h) { HANDLING[name] = h; return h; }

// Horn sounds: [wave, [freqs], duration, volume]
const HORNS = {
  car: ['square', [392, 494], 0.32, 0.07], sports: ['sawtooth', [523, 659], 0.25, 0.05], truck: ['sawtooth', [233, 294], 0.45, 0.06],
  bus: ['sawtooth', [185, 233], 0.6, 0.07], tractor: ['square', [300], 0.4, 0.07], kart: ['square', [880], 0.14, 0.05],
  quad: ['triangle', [660], 0.12, 0.12], bumper: ['triangle', [1046, 1318], 0.2, 0.1], boat: ['sawtooth', [110, 138], 0.9, 0.08],
  heli: ['square', [740], 0.1, 0.05],
};

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _side = new THREE.Vector3(), _gUp = new THREE.Vector3(), _e = new THREE.Euler();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const matHead = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
const EXIT_QUERY = groups(0xffff, G_STATIC | G_VEH | G_PROP);
let exitShape = null;

export class Vehicle {
  constructor(game, type, x, y, z, yaw, color, opts = {}) {
    this.opts = opts;
    this.game = game;
    this.type = type;
    const def = this.def = VEHICLES[type];
    this.color = color ?? (type === 'police' ? 0xffffff : type === 'firetruck' ? 0xe8322b : CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
    this.home = { x, y, z, yaw };
    const world = game.physics.world;
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(yawQuat(yaw))
      .setLinearDamping(def.boat ? 0.15 : def.heli ? 0.1 : 0.02).setAngularDamping(def.boat ? 1.2 : def.heli ? 1.0 : 0.5).setCcdEnabled(true);
    this.body = world.createRigidBody(bd);
    this.buildColliders();
    this.handling = def.handling ? HANDLING[def.handling] : null;
    if (def.handling && !this.handling) throw new Error('unknown handling ' + def.handling);
    this.wheeled = this.handling ? (this.handling.wheels ?? !!def.axles) : !def.boat && !def.heli;
    if (this.wheeled) this.buildWheels();
    else if (def.boat) {
      // buoyancy samples around the hull (the default boat: half [1, 0.35, 2.4], 420 kg)
      const pts = [], h = def.half;
      for (const sx of [-(h[0] - 0.15), h[0] - 0.15]) for (const sz of [-(h[2] - 0.4), -(h[2] - 0.4) * 0.35, (h[2] - 0.4) * 0.35, h[2] - 0.4]) pts.push([sx, -0.25, sz]);
      this.buoy = def.buoy ? { ...def.buoy } : { points: pts, r: 0.35, volume: 2.6 * def.mass / 420 };
      game.physics.objects.push({ body: this.body, mesh: null, buoy: this.buoy, kind: 'vehicle' });
    }
    if (!def.boat) game.physics.objects.push({ body: this.body, mesh: null, buoy: { r: 0.6, volume: 0.25 * def.mass / 400, drag: 1.2 }, kind: 'vehicle' });

    const h = def.half;
    this.seats = def.seats.map((s) => {
      const seat = {
        body: this.body, pos: s.pos, yaw: s.yaw || 0, kind: s.kind || 'passenger', vehicle: this, occupant: null,
        label: s.kind === 'driver' ? (def.heli ? 'Fly' : 'Drive') : 'Sit',
      };
      // exit spot is picked when leaving, so nobody is dropped into a wall
      Object.defineProperty(seat, 'exit', { get: () => this.exitFor(seat), enumerable: true });
      return seat;
    });
    for (const s of this.seats) game.seats.push(s);

    this.steer = 0;
    this.speed = 0;
    this.throttle = 0;
    this.handbrake = false;
    this.flipTimer = 0;
    this.flipping = 0;
    this.idleTimer = 0;
    this.airTime = 0;
    this.siren = false;
    this.rpm = 0;
    this.lift = 0; this.fly = { x: 0, y: 0 };
    this.lean = { r: 0, p: 0, vr: 0, vp: 0 };
    this.prevVel = new THREE.Vector3();
    this.braking = false; this.reversing = false;
    this.buildMesh();
    game.scene.add(this.mesh);
    this.rec = game.physics.track(this.body);
  }

  // ---- physics setup ------------------------------------------------------------
  buildColliders() {
    const def = this.def, h = def.half, world = this.game.physics.world;
    const cols = [];
    const add = (desc) => {
      desc.setCollisionGroups(VEH_GROUPS).setDensity(0).setFriction(def.bumper ? 0.1 : 0.5).setRestitution(def.bumper ? 0.8 : 0.15);
      const c = world.createCollider(desc, this.body);
      cols.push(c);
      this.game.physics.handleOwner.set(c.handle, this);
      return c;
    };
    const C = RAPIER.ColliderDesc;
    if (def.colliders) def.colliders(add, C, def, this);
    else if (def.boat) {
      add(C.cuboid(h[0], 0.18, h[2]).setTranslation(0, -0.15, 0));
      add(C.cuboid(0.1, 0.3, h[2]).setTranslation(h[0] - 0.1, 0.2, 0));
      add(C.cuboid(0.1, 0.3, h[2]).setTranslation(-h[0] + 0.1, 0.2, 0));
      add(C.cuboid(h[0], 0.3, 0.1).setTranslation(0, 0.2, -h[2] + 0.1));
      add(C.cuboid(h[0] * 0.7, 0.3, 0.3).setTranslation(0, 0.15, h[2] - 0.2));
    } else if (def.heli) {
      add(C.roundCuboid(h[0] - 0.2, h[1] - 0.2, h[2] - 0.2, 0.2));
      add(C.cuboid(0.16, 0.18, 1.5).setTranslation(0, 0.35, -2.8));
      for (const s of [-1, 1]) add(C.cuboid(0.07, 0.07, 1.35).setTranslation(s * 0.78, -1.08, 0.05));
    } else if (def.bumper) {
      add(C.roundCylinder(h[1], 0.85, 0.12));
    } else if (def.bed) {
      add(C.cuboid(h[0], h[1], h[2]));
      add(C.cuboid(...def.cabin.half).setTranslation(...def.cabin.off));
      add(C.cuboid(0.08, 0.25, 1.15).setTranslation(h[0] - 0.08, h[1] + 0.25, -1.3));
      add(C.cuboid(0.08, 0.25, 1.15).setTranslation(-h[0] + 0.08, h[1] + 0.25, -1.3));
      add(C.cuboid(h[0], 0.25, 0.08).setTranslation(0, h[1] + 0.25, -h[2] + 0.08));
    } else if (def.fire) {
      add(C.roundCuboid(h[0] - 0.08, h[1] - 0.08, h[2] - 0.08, 0.08));
      add(C.roundCuboid(...def.cabin.half.map((v) => v - 0.1), 0.1).setTranslation(...def.cabin.off));
      add(C.cuboid(1.1, 0.55, 2.0).setTranslation(0, 1.0, -1.3));
    } else if (def.tractor) {
      add(C.roundCuboid(0.42, 0.28, 1.35, 0.08).setTranslation(0, 0.38, 0.05));
      add(C.cuboid(0.62, 0.05, 0.62).setTranslation(0, 2.05, -0.62)); // canopy
    } else if (def.bike) {
      add(C.roundCuboid(h[0] - 0.06, h[1] - 0.06, h[2] - 0.06, 0.06).setTranslation(0, 0.05, 0));
    } else {
      add(C.roundCuboid(h[0] - 0.08, h[1] - 0.08, h[2] - 0.08, 0.08));
      if (def.cabin) add(C.roundCuboid(def.cabin.half[0] - 0.1, def.cabin.half[1] - 0.1, def.cabin.half[2] - 0.1, 0.1).setTranslation(...def.cabin.off));
      if (def.convertible) add(C.cuboid(0.85, 0.2, 0.05).setTranslation(0, h[1] + 0.2, 0.55));
    }
    this.colliders = cols;
    // mass lives on the body: lowered centre of mass, box inertia of the hull
    const m = def.mass, com = def.com || [0, -0.2, 0];
    const W = h[0] * 2, H = (def.cabin ? def.cabin.off[1] + def.cabin.half[1] + h[1] : h[1] * 2), D = h[2] * 2;
    const k = def.heli ? 0.8 : 1;
    this.body.setAdditionalMassProperties(m, { x: com[0], y: com[1], z: com[2] },
      { x: k * m / 12 * (H * H + D * D), y: k * m / 12 * (W * W + D * D), z: k * m / 12 * (W * W + H * H) }, { x: 0, y: 0, z: 0, w: 1 }, true);
  }

  buildWheels() {
    const def = this.def, world = this.game.physics.world;
    const vc = this.ctrl = world.createVehicleController(this.body);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    this.wheels = [];
    for (const a of def.axles) for (const s of [1, -1]) {
      const i = this.wheels.length;
      vc.addWheel({ x: s * a.x, y: a.y, z: a.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, a.rest, a.r);
      vc.setWheelSuspensionStiffness(i, def.susp.k);
      vc.setWheelSuspensionCompression(i, def.susp.c);
      vc.setWheelSuspensionRelaxation(i, def.susp.c * 1.15);
      vc.setWheelMaxSuspensionForce(i, def.mass * 60);
      vc.setWheelMaxSuspensionTravel(i, a.rest * 1.1);
      vc.setWheelFrictionSlip(i, 2.4);
      vc.setWheelSideFrictionStiffness(i, 1.0);
      this.wheels.push({ ...a, side: s });
    }
    const zs = def.axles.map((a) => a.z);
    this.wheelbase = Math.max(0.8, Math.max(...zs) - Math.min(...zs));
    const drives = this.wheels.reduce((t, w) => t + w.drive, 0);
    this.driveNorm = drives > 0 ? 1 / drives : 0;
  }

  driver() { return this.seats.find((s) => s.kind === 'driver')?.occupant || null; }
  yaw() {
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _v.set(0, 0, 1).applyQuaternion(_q);
    return Math.atan2(_v.x, _v.z);
  }
  riders() { let n = 0; for (const s of this.seats) if (s.occupant) n++; return n; }

  // Clear spot (seat-local coords) for a player getting out of `seat`.
  exitFor(seat) {
    const def = this.def, h = def.half, world = this.game.physics.world;
    const p = seat.pos, sx = p[0] >= 0 ? 1 : -1;
    const halfW = def.heli ? 1.0 : h[0];
    const top = def.cabin ? def.cabin.off[1] + def.cabin.half[1] : h[1] + 0.5;
    const len = def.heli ? 3.8 : h[2];
    const cands = [
      [sx * (halfW + 0.85), p[1] + 0.2, p[2]], [-sx * (halfW + 0.85), p[1] + 0.2, p[2]],
      [p[0], p[1] + 0.2, -len - 1.0], [p[0], p[1] + 0.2, h[2] + 1.0],
      [sx * (halfW + 0.85), p[1] + 0.2, p[2] + 1.6], [sx * (halfW + 0.85), p[1] + 0.2, p[2] - 1.6],
      [p[0], top + 0.6, p[2]],
    ];
    exitShape ||= new RAPIER.Capsule(0.45, 0.28);
    const r = this.body.rotation(), t = this.body.translation();
    _q.set(r.x, r.y, r.z, r.w);
    for (const c of cands) {
      _v.set(c[0], c[1], c[2]).applyQuaternion(_q).add(t);
      const gy = this.game.groundHeight(_v.x, _v.z, _v.y + 2);
      const fy = Math.max(_v.y - 0.3, gy + 0.05);
      if (fy - _v.y > 1.6) continue; // a wall or ledge right there
      const hit = world.intersectionWithShape({ x: _v.x, y: fy + 0.85, z: _v.z }, { x: 0, y: 0, z: 0, w: 1 }, exitShape,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, EXIT_QUERY, undefined, this.body);
      if (hit) continue;
      // step down to the ground from high seats (fire truck roof, bus) when upright
      const drop = _v.y - (fy + 0.35);
      return drop > 0 && _q.w * _q.w + _q.y * _q.y > 0.9 ? [c[0], c[1] - drop, c[2]] : c;
    }
    return cands[0];
  }

  // ---- input --------------------------------------------------------------------
  control(inp) {
    const def = this.def;
    const gas = inp.gas || 0, brake = inp.brake || 0;
    const steerIn = -(inp.steer || 0); // +X is left
    if (def.heli) {
      // keyboards drive gas/brake from W/S; then Space rises and Shift sinks
      const my = inp.moveY || 0;
      const kb = Math.abs(gas - Math.max(0, my)) < 1e-6 && Math.abs(brake - Math.max(0, -my)) < 1e-6;
      this.lift = clamp((inp.jump ? 1 : 0) - (inp.sprint ? 1 : 0) + (kb ? 0 : gas - brake), -1, 1);
      this.fly.x = steerIn; this.fly.y = my;
      this.steer = steerIn;
      this.throttle = Math.max(Math.abs(this.lift), Math.abs(my));
      return;
    }
    const sp = Math.abs(this.speed);
    const lim = def.boat ? def.steer : def.steer / (1 + sp * (def.bumper ? 0 : 0.02));
    const rate = Math.abs(steerIn * lim) > Math.abs(this.steer) ? 7 : 10; // centres a bit faster
    this.steer += (steerIn * lim - this.steer) * Math.min(1, DT * rate);
    this.throttle = gas - brake;
    this.handbrake = !!inp.jump;
  }

  honk() {
    const def = this.def;
    if (def.siren) {
      this.siren = !this.siren;
      this.sirenT = 0;
      if (!this.siren) this.sound('square', [700, 500], 0.12, 0.05);
      return;
    }
    // ordinary horns (and the ice-cream chimes) come from the audio module
    if (this.game.audio?.horn) { this.game.audio.play('horn', this.body.translation()); return; }
    const hn = HORNS[def.horn] || HORNS.car;
    this.sound(hn[0], hn[1], hn[2], hn[3]);
    if (def.horn === 'quad' || def.horn === 'bumper') this.sound(hn[0], hn[1], hn[2], hn[3], hn[2] + 0.05);
  }

  sound(wave, freqs, dur, vol, when = 0, f1) {
    const a = this.game.audio;
    if (!a || !a.ctx || a.ctx.state !== 'running') return;
    const v = a.gainAt(this.body.translation());
    if (v < 0.02) return;
    for (const f of freqs) a.tone(wave, f, f1 ?? f, dur, vol * v, when);
  }

  // ---- simulation ---------------------------------------------------------------------
  update() {
    const def = this.def;
    const drv = this.driver();
    if (!drv) { this.throttle = 0; this.steer *= 0.9; this.handbrake = true; this.lift = 0; this.fly.x = this.fly.y = 0; }
    const v = this.body.linvel();
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const fwd = _fwd.set(0, 0, 1).applyQuaternion(_q);
    const up = _up.set(0, 1, 0).applyQuaternion(_q);
    const side = _side.set(1, 0, 0).applyQuaternion(_q);
    this.speed = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
    this.massEff = def.mass + this.riders() * 45;

    if (this.handling) this.handling.update(this, drv, v, fwd, up, side);
    else if (def.boat) this.updateBoat(drv, v, fwd, side);
    else if (def.heli) this.updateHeli(drv, v, fwd, up, side);
    else this.updateWheels(drv, v, fwd, up, side);

    this.selfRight(drv, v, up, fwd);
    // no climbing into a vehicle lying on its roof (the seat is under the ground)
    const tipped = up.y < 0.3;
    if (tipped !== this.tipped) { this.tipped = tipped; for (const s of this.seats) s.disabled = tipped; }
    this.updateLean(v, fwd, side);
    if (this.siren) {
      if (!drv) this.siren = false;
      this.sirenT = (this.sirenT || 0) - DT;
      if (this.sirenT <= 0) {
        const fire = def.siren === 'fire';
        this.sirenT = fire ? 1.3 : 0.9;
        const lo = fire ? 480 : 640, hi = fire ? 760 : 1020, d = this.sirenT / 2;
        this.sound('sawtooth', [lo], d, 0.035, 0, hi); this.sound('sawtooth', [hi], d, 0.035, d, lo);
      }
    }

    // lost vehicles go home
    const p = this.body.translation();
    const occupied = this.seats.some((s) => s.occupant);
    if (!occupied) {
      const sunk = !def.boat && this.game.physics.waterLevel(p.x, p.y, p.z) != null && p.y < -1.2;
      this.idleTimer = (sunk || p.y < -20) ? this.idleTimer + DT : 0;
      if (this.idleTimer > 4) this.respawn();
    } else this.idleTimer = 0;
  }

  updateWheels(drv, v, fwd, up, side) {
    const def = this.def, vc = this.ctrl, n = this.wheels.length, m = this.massEff;
    const t = this.throttle, sp = this.speed, hb = this.handbrake && !!drv && !def.bike;
    const bikeBrake = def.bike && this.handbrake && !!drv;

    // engine / brake decisions
    let drive = 0, brake = 0;
    if (t > 0.05) { if (sp < -1) brake = t; else drive = t; }
    else if (t < -0.05) { if (sp > 1) brake = -t; else drive = t; }
    this.braking = brake > 0.05 || hb || bikeBrake;
    this.reversing = drive < -0.05 && sp < 0.3;
    let acc = 0;
    if (drive > 0) {
      const x = clamp(sp / def.maxSpeed, 0, 1);
      acc = def.accel * drive * (1 - x ** 3) * (1.15 - 0.25 * x);
    } else if (drive < 0) {
      const x = clamp(-sp / def.rev, 0, 1);
      acc = def.accel * 0.8 * drive * (1 - x * x);
    }
    const parked = !drv;
    // steering angle limited so the kinematic turn rate stays within grip
    const vabs = Math.max(3, Math.abs(sp));
    const smax = def.spin ? def.steer : Math.atan((def.grip * 9.81 * (hb ? 2.4 : 1.9)) / (vabs * vabs) * this.wheelbase);
    const st = this.steer / def.steer * Math.min(def.steer, smax);
    this.steerEff = st;
    for (let i = 0; i < n; i++) {
      const w = this.wheels[i];
      vc.setWheelSteering(i, st * w.steer);
      vc.setWheelEngineForce(i, acc * m * w.drive * this.driveNorm);
      vc.setWheelBrake(i, parked ? 30 : (hb && w.hand ? def.mass * 0.02 : 0));
      vc.setWheelFrictionSlip(i, hb && w.hand ? 1.2 : 2.4);
      vc.setWheelSideFrictionStiffness(i, (hb && w.hand ? 0.45 : 1.0) * (def.sideFric ?? 1));
    }
    vc.updateVehicle(DT, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WHEEL_QUERY, (col) => col.parent() !== this.body);

    // ground contact + averaged ground normal
    let contact = 0;
    _gUp.set(0, 0, 0);
    for (let i = 0; i < n; i++) if (vc.wheelIsInContact(i)) {
      contact++;
      const nn = vc.wheelContactNormal(i);
      if (nn) _gUp.x += nn.x, _gUp.y += nn.y, _gUp.z += nn.z;
    }
    const gf = contact / n;
    if (contact && _gUp.lengthSq() > 0.01) _gUp.normalize(); else _gUp.copy(WORLD_UP);
    this.airTime = contact ? 0 : this.airTime + DT;
    this.grounded = gf;
    const av = this.body.angvel();
    const w = _v.set(av.x, av.y, av.z);
    const imp = _v2.set(0, 0, 0), tq = _v3.set(0, 0, 0);

    if (gf > 0 && up.y > 0.4) {
      // brakes, coasting and parked: straight on the velocity, as much as grip allows
      let dec = 0;
      if (brake > 0 || bikeBrake) dec = def.brakeDecel * Math.max(brake, bikeBrake ? 0.7 : 0);
      else if (parked) dec = 7;
      else if (hb) dec = 1.5;
      else if (Math.abs(t) < 0.05) dec = 1.6;
      if (dec > 0) {
        const dv = Math.min(Math.abs(sp), dec * DT * gf) * Math.sign(sp);
        imp.addScaledVector(fwd, -dv * m);
      }
      // yaw-rate assist toward a bicycle-model target, capped by grip
      let cap = def.grip * 9.81 / Math.max(3, Math.abs(sp));
      let target = sp * Math.tan(st) / this.wheelbase;
      if (def.spin) target = this.steer / def.steer * def.spin * (Math.abs(sp) > 0.4 || Math.abs(t) > 0.05 ? 1 : 0.4) * (sp < -0.3 ? -1 : 1);
      if (hb && Math.abs(sp) > 4) { target *= 1.35; cap *= 1.6; }
      target = clamp(target, -cap, cap);
      if (parked) target = 0;
      const yr = w.dot(_gUp);
      const k = Math.min(1, (hb ? 4 : 9) * DT * gf);
      w.addScaledVector(_gUp, (target - yr) * k);
      // side grip: kill sideways slide (low on the handbrake: drift)
      const vs = v.x * side.x + v.y * side.y + v.z * side.z;
      const g = Math.min(1, (hb ? 1.6 : def.bumper ? 6 : 7) * DT * gf);
      imp.addScaledVector(side, -vs * g * m);
      // anti-tip: cancel most of the rolling moment of the cornering force (tyres
      // push at ground level, riders sit high), so it never tips from steering
      const aSide = yr * sp;
      tq.copy(fwd).multiplyScalar(-(def.tipH || 0) * m * aSide * DT * gf);
      if (hb) imp.addScaledVector(fwd, Math.abs(vs) * g * m * 0.35 * Math.sign(sp)); // keep some drive through the drift
      // downforce keeps tyres planted at speed
      imp.addScaledVector(_gUp, -0.004 * sp * sp * m * DT * gf);
      // anti-roll toward the ground normal (a little visible roll allowed)
      const roll = side.dot(_gUp), wf = w.dot(fwd);
      const rollE = Math.sign(roll) * Math.max(0, Math.abs(roll) - (def.bike ? 0 : 0.05));
      const leanT = def.bike ? clamp(-yr * sp / 9.81 * 0.5, -0.4, 0.4) : 0;
      w.addScaledVector(fwd, -((rollE - leanT) * (def.bike ? 140 : 30) + wf * (def.bike ? 14 : 2.5)) * DT * Math.max(gf, 0.5));
    } else if (contact === 0 && this.airTime > 0.08 && up.y > 0) {
      // air: level out so landings are on the wheels; steer still twists a bit
      const hs = Math.hypot(v.x, v.z);
      const pitchT = clamp(Math.atan2(v.y, Math.max(hs, 2)) * 0.6, -0.5, 0.35);
      const pitch = Math.asin(clamp(fwd.y, -1, 1)), roll = side.y;
      const wf = w.dot(fwd), ws = w.dot(side);
      w.addScaledVector(fwd, -(roll * 7 + wf * 1.6) * DT);
      w.addScaledVector(side, ((pitch - pitchT) * 6 - ws * 1.6) * DT);
      if (drv) w.y += (this.steer * 2.2 - w.y) * Math.min(1, 1.5 * DT);
    }
    this.body.setAngvel(w, true);
    if (imp.lengthSq() > 0) this.body.applyImpulse(imp, true);
    if (tq.lengthSq() > 0) this.body.applyTorqueImpulse(tq, true);
  }

  updateBoat(drv, v, fwd, side) {
    const def = this.def;
    const wet = this.game.physics.objects.find((o) => o.body === this.body)?.wet || 0;
    this.grounded = wet;
    if (wet > 0.05 && drv) {
      const t = this.throttle;
      const x = clamp(this.speed / def.maxSpeed, 0, 1);
      const f = (t > 0 ? def.engine * (1 - x * x) : def.engine * 0.5 * (this.speed > -5 ? 1 : 0)) * t;
      const p = this.body.translation();
      const sb = def.half[2] - 0.1, stern = { x: p.x - fwd.x * sb, y: p.y - 0.2, z: p.z - fwd.z * sb };
      this.body.applyImpulseAtPoint({ x: fwd.x * f * DT, y: 0, z: fwd.z * f * DT }, stern, true);
      // turn rate follows the stick, more authority with speed or throttle
      const av = this.body.angvel();
      const target = this.steer * 1.25 * clamp(Math.abs(this.speed) / 4 + Math.abs(t) * 0.5, 0, 1) * (this.speed < -0.5 ? -1 : 1);
      this.body.setAngvel({ x: av.x, y: av.y + (target - av.y) * Math.min(1, 7 * DT * Math.min(1, wet * 3)), z: av.z }, true);
      // keel: kill sideways drift, lean into the turn a little
      const sv = v.x * side.x + v.z * side.z;
      this.body.applyImpulse({ x: -side.x * sv * def.mass * 1.6 * DT * wet, y: 0, z: -side.z * sv * def.mass * 1.6 * DT * wet }, true);
      // planing: bow lifts with speed
      this.body.applyTorqueImpulse({ x: side.x * -x * def.mass * 0.9 * DT, y: 0, z: side.z * -x * def.mass * 0.9 * DT }, true);
    }
  }

  updateHeli(drv, v, fwd, up, side) {
    const def = this.def, m = this.massEff;
    this.rpm += ((drv ? 1 : 0) - this.rpm) * DT * (drv ? 0.9 : 0.35);
    const rpm = this.rpm;
    this.grounded = 0;
    if (rpm < 0.05) return;
    const p = this.body.translation();
    const ground = this.game.groundHeight(p.x, p.z, p.y);
    const agl = p.y - 1.15 - ground;
    // vertical: hold altitude, stick/triggers set climb rate
    const vyT = this.lift * (this.lift > 0 ? 6 : 5);
    const ay = clamp((vyT - v.y) * 2.5, -8, 10);
    const lift = rpm < 0.75 ? rpm / 0.75 * (agl < 0.3 ? 0.9 : 1) : 1;
    const fy = m * (9.81 + ay) * lift * Math.min(1, rpm * 1.2);
    // horizontal: accelerate toward stick velocity along the heading
    const fx = fwd.x, fz = fwd.z, fl = Math.hypot(fx, fz) || 1;
    const air = agl > 0.4 ? 1 : 0.15;
    const tvx = fx / fl * this.fly.y * def.maxSpeed, tvz = fz / fl * this.fly.y * def.maxSpeed;
    const k = 1.1 * air * rpm;
    const ix = clamp((tvx - v.x) * k, -9, 9) * m * DT, iz = clamp((tvz - v.z) * k, -9, 9) * m * DT;
    this.body.applyImpulse({ x: ix, y: fy * DT, z: iz }, true);
    // attitude: nose down to go forward, bank into turns, yaw from the stick
    const yaw = Math.atan2(fx, fz);
    const yawRate = this.fly.x * 1.7;
    const pitchT = clamp(this.fly.y * 0.28 + (v.x * fx + v.z * fz) / fl * 0.006, -0.35, 0.4) * air;
    const rollT = -this.fly.x * 0.22 * air * clamp(Math.abs(this.fly.y) + 0.4, 0, 1);
    _e.set(pitchT, yaw + yawRate * 0.25, rollT, 'YXZ');
    _q2.setFromEuler(_e);
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const qe = _q2.multiply(_q.invert());
    if (qe.w < 0) { qe.x = -qe.x; qe.y = -qe.y; qe.z = -qe.z; qe.w = -qe.w; }
    const ang = 2 * Math.acos(clamp(qe.w, -1, 1)), s = Math.sqrt(Math.max(1e-9, 1 - qe.w * qe.w));
    const wx = qe.x / s * ang / 0.25, wy = qe.y / s * ang / 0.25, wz = qe.z / s * ang / 0.25;
    const av = this.body.angvel(), b = Math.min(1, 10 * DT) * clamp((rpm - 0.3) / 0.5, 0, 1);
    this.body.setAngvel({ x: av.x + (wx - av.x) * b, y: av.y + (wy - av.y) * b, z: av.z + (wz - av.z) * b }, true);
  }

  // Upside down or on its side and slow: hop and roll back onto the wheels.
  selfRight(drv, v, up, fwd) {
    if (this.flipping > 0) {
      this.flipping -= DT;
      const axis = _v3.crossVectors(up, WORLD_UP);
      const s = axis.length();
      if (s < 0.05 && up.y < 0) axis.copy(fwd); else axis.divideScalar(s || 1);
      const ang = Math.acos(clamp(up.y, -1, 1));
      const av = this.body.angvel();
      this.body.setAngvel({ x: axis.x * Math.min(7, ang * 6), y: av.y * 0.8, z: axis.z * Math.min(7, ang * 6) }, true);
      if (up.y > 0.93 || this.flipping <= 0) {
        this.flipping = 0;
        const a = this.body.angvel();
        this.body.setAngvel({ x: a.x * 0.2, y: a.y * 0.5, z: a.z * 0.2 }, true);
      }
      return;
    }
    const sp = Math.hypot(v.x, v.y, v.z);
    if (up.y < 0.45 && sp < 3) {
      this.flipTimer += DT;
      const wait = drv ? (Math.abs(this.throttle) > 0.05 || Math.abs(this.steer) > 0.05 ? 0.6 : 1.2) : 6;
      if (this.flipTimer > wait) {
        this.flipTimer = 0;
        if (this.flipCount > 2) { // stuck: just put it back on its wheels
          const p = this.body.translation();
          this.body.setTranslation({ x: p.x, y: p.y + 1.5, z: p.z }, true);
          this.body.setRotation(yawQuat(this.yaw()), true);
          this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          this.flipCount = 0;
          return;
        }
        this.flipCount = (this.flipCount || 0) + 1;
        this.flipping = 0.9;
        this.body.setLinvel({ x: v.x, y: Math.max(v.y, 4.2 + (this.def.mass > 3000 ? 1 : 0)), z: v.z }, true);
      }
    } else { this.flipTimer = 0; if (up.y > 0.9) this.flipCount = 0; }
  }

  // Toy wobble: the visual shell lags behind accelerations on a spring.
  updateLean(v, fwd, side) {
    const pv = this.prevVel;
    const ax = (v.x - pv.x) / DT, ay = (v.y - pv.y) / DT, az = (v.z - pv.z) / DT;
    pv.set(v.x, v.y, v.z);
    const L = this.lean;
    if (this.def.heli || this.def.boat) { L.r = L.p = L.vr = L.vp = 0; return; }
    const along = clamp(ax * fwd.x + ay * fwd.y + az * fwd.z, -30, 30), lat = clamp(ax * side.x + ay * side.y + az * side.z, -30, 30);
    const soft = this.def.bike ? 0.3 : 1;
    const tr = clamp(lat * 0.006 * soft, -0.07, 0.07), tp = clamp(-along * 0.0045, -0.06, 0.06);
    L.vr += ((tr - L.r) * 160 - L.vr * 9) * DT; L.r += L.vr * DT;
    L.vp += ((tp - L.p) * 140 - L.vp * 8) * DT; L.p += L.vp * DT;
    L.r = clamp(L.r, -0.12, 0.12); L.p = clamp(L.p, -0.1, 0.1);
  }

  respawn() {
    for (const s of this.seats) if (s.occupant) s.occupant.leaveSeat();
    const hm = this.home;
    this.body.setTranslation({ x: hm.x, y: hm.y, z: hm.z }, true);
    this.body.setRotation(yawQuat(hm.yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.idleTimer = 0;
    this.flipping = 0;
    this.siren = false;
    this.rpm = 0;
    this.rec.snap = true;
  }

  // Remove this vehicle from the game for good (phone-called vehicles): riders
  // and grabbing hands let go, then the body (with its colliders), the wheel
  // controller, seats, buoyancy, interpolation record, meshes and engine sound go.
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const g = this.game, ph = g.physics, world = ph.world;
    for (const s of this.seats) if (s.occupant) s.occupant.leaveSeat();
    for (const p of g.players) for (const h of ['L', 'R']) if (p.hands?.[h]?.body === this.body) p.releaseHand(h);
    const drop = (arr, pred) => { for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) arr.splice(i, 1); };
    const seats = new Set(this.seats);
    drop(g.seats, (s) => seats.has(s));
    for (const s of this.seats) s.disabled = true;
    drop(ph.objects, (o) => o.body === this.body);
    for (const c of this.colliders) ph.handleOwner.delete(c.handle);
    if (this.ctrl) { world.removeVehicleController(this.ctrl); this.ctrl = null; }
    world.removeRigidBody(this.body);
    ph.untrack(this.rec);
    g.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      if (o.material !== matVC && o.material !== matGlass && o.material !== matHead) o.material?.dispose?.();
    });
    const e = g.audio?.engines?.get(this);
    if (e) {
      try { e.g.gain.value = 0; for (const n of e.stops) n.stop(); } catch (err) { /* already stopped */ }
      g.audio.engines.delete(this);
    }
    drop(g.vehicles, (v) => v === this);
  }

  // ---- rendering ------------------------------------------------------------------------------
  sync() {
    this.game.physics.pose(this.rec, this.mesh);
    const L = this.lean;
    this.shell.rotation.set(L.p, 0, L.r);
    const time = this.game.time || 0;
    // lights
    if (this.tailMat) {
      const c = this.reversing ? 0xffffff : this.braking && this.driver() ? 0xff1a1a : 0x7a1010;
      if (this.tailCol !== c) { this.tailMat.color.setHex(c); this.tailCol = c; }
    }
    if (this.barMats) {
      const on = this.siren, ph = Math.floor(time * 6) % 2;
      this.barMats[0].color.setHex(on && ph ? 0xff2020 : 0x5a1010);
      this.barMats[1].color.setHex(on && !ph ? 0x3060ff : 0x10205a);
    }
    if (this.rotor) {
      const dt = Math.max(0, time - (this.lastT ?? time));
      this.rotor.rotation.y += this.rpm * dt * 28;
      this.tailRotor.rotation.x += this.rpm * dt * 40;
    }
    this.lastT = time;
    if (!this.ctrl) return;
    const vc = this.ctrl;
    for (let i = 0; i < this.wheels.length; i++) {
      const m = this.wheelMeshes[i];
      if (!m) continue;
      const cp = vc.wheelChassisConnectionPointCs(i);
      const len = vc.wheelSuspensionLength(i) ?? this.wheels[i].rest;
      m.position.set(this.def.bike ? 0 : cp.x, cp.y - len, cp.z);
      m.rotation.set(0, 0, 0);
      m.rotateY(vc.wheelSteering(i) || 0);
      m.rotateX(vc.wheelRotation(i) || 0);
    }
  }

  buildMesh() {
    const def = this.def;
    const g = this.mesh = new THREE.Group();
    const shell = this.shell = new THREE.Group();
    g.add(shell);
    const b = new Builder(), glass = new Builder(), lights = new Builder(), tail = new Builder();
    const P = { b, glass, lights, tail, c: this.color, dark: 0x2a2a33, trim: new THREE.Color(this.color).multiplyScalar(0.7).getHex() };
    const fn = def.boat ? 'meshBoat' : def.heli ? 'meshHeli' : def.bumper ? 'meshBumper' : def.quad ? 'meshQuad' : def.bike ? 'meshScooter'
      : def.kart ? 'meshKart' : def.tractor ? 'meshTractor' : def.fire ? 'meshFire' : this.type === 'bus' ? 'meshBus'
      : def.convertible ? 'meshSports' : 'meshCar';
    P.shell = shell;
    if (def.mesh) def.mesh(b, def, this.color, P, this); else this[fn](P);
    if (def.lights && !def.boat && !def.heli) {
      const h = def.half, [hy, hz] = def.lights.head;
      const lx = def.bike || def.tractor ? [0] : [-1, 1];
      for (const sx of lx) lights.sphere(def.bike ? 0.1 : 0.13, 0xffffff, [sx * (h[0] - 0.25), hy, hz], [1, 0.8, 0.45]);
      if (def.lights.tail) for (const sx of [-1, 1]) {
        const [ty, tz] = def.lights.tail, tx = def.tractor ? 0.4 : h[0] - 0.25;
        tail.box(0.28, 0.12, 0.05, 0xffffff, [sx * tx, ty, tz]);
      }
    }
    shell.add(b.mesh(matVC));
    const gg = glass.geometry();
    if (gg) { const gm = new THREE.Mesh(gg, matGlass); gm.renderOrder = 2; shell.add(gm); }
    const lg = lights.geometry();
    if (lg) shell.add(new THREE.Mesh(lg, matHead));
    const tg = tail.geometry();
    if (tg) { this.tailMat = new THREE.MeshBasicMaterial({ color: 0x7a1010 }); shell.add(new THREE.Mesh(tg, this.tailMat)); }
    if (def.lightbar) this.buildLightbar(shell, ...def.lightbar);
    if (this.opts.icecream && def.cabin) {
      const ib = new Builder(), co = def.cabin.off, ch = def.cabin.half;
      ib.cone(0.45, 1.1, 0xe0a860, [0, co[1] + ch[1] + 0.55, co[2] - 0.6], [PI, 0, 0]);
      ib.sphere(0.5, 0xffb7d5, [0, co[1] + ch[1] + 1.15, co[2] - 0.6]);
      ib.sphere(0.12, 0xff3355, [0, co[1] + ch[1] + 1.65, co[2] - 0.6]);
      shell.add(ib.mesh(matVC));
    }
    // wheels
    this.wheelMeshes = [];
    if (this.wheels) {
      for (let i = 0; i < this.wheels.length; i++) {
        const w = this.wheels[i];
        if (def.bike && w.side < 0) { this.wheelMeshes.push(null); continue; }
        const wb = new Builder();
        const tw = w.wide || (def.bike ? 0.16 : def.open ? 0.28 : w.r > 0.5 ? 0.38 : 0.3);
        wb.cyl(w.r, w.r, tw, 0x1e1e24, [0, 0, 0], [0, 0, PI / 2], 18);
        wb.cyl(w.r * 0.58, w.r * 0.58, tw + 0.02, def.tractor ? 0xffd23f : 0xdddddd, [0, 0, 0], [0, 0, PI / 2], 12);
        wb.box(tw + 0.04, w.r * 0.2, w.r * 0.9, 0x999999, [0, 0, 0]);
        if (def.tractor && w.r > 0.6) for (let k = 0; k < 14; k++) {
          const a = k / 14 * PI * 2;
          wb.box(tw + 0.02, 0.09, 0.14, 0x1e1e24, [0, Math.cos(a) * w.r, Math.sin(a) * w.r], [a, 0, 0]);
        }
        const wm = wb.mesh(matVC);
        g.add(wm);
        this.wheelMeshes.push(wm);
      }
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  buildLightbar(parent, x, y, z, w) {
    const base = new Builder();
    base.rbox(w, 0.08, 0.3, 0.03, 0x222228, [x, y, z]);
    parent.add(base.mesh(matVC));
    this.barMats = [new THREE.MeshBasicMaterial({ color: 0x5a1010 }), new THREE.MeshBasicMaterial({ color: 0x10205a })];
    for (let k = 0; k < 2; k++) {
      const lb = new Builder();
      lb.rbox(w * 0.46, 0.14, 0.26, 0.05, 0xffffff, [x + (k ? -1 : 1) * w * 0.25, y + 0.1, z]);
      parent.add(new THREE.Mesh(lb.geometry(), this.barMats[k]));
    }
  }

  // ---- per-type meshes ------------------------------------------------------------------
  // cabin with pillars + roof + glass, between y = bot and the cabin top
  cabinFrame({ b, glass, c }, ch, co, bot, slant = 0.12, roofCol = c) {
    const top = co[1] + ch[1];
    b.rbox(ch[0] * 2, 0.12, ch[2] * 2, 0.05, roofCol, [co[0], top - 0.06, co[2]]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.09, top - bot, 0.09, c, [sx * (ch[0] - 0.05), (top + bot) / 2, co[2] + sz * (ch[2] - 0.05)], [sz * -slant, 0, 0]);
    }
    const wh = top - bot - 0.12, wy = (top + bot) / 2 - 0.03;
    glass.box(ch[0] * 2 - 0.12, wh, 0.03, 0, [co[0], wy, co[2] + ch[2] - 0.05]);
    glass.box(ch[0] * 2 - 0.12, wh, 0.03, 0, [co[0], wy, co[2] - ch[2] + 0.05]);
    for (const sx of [-1, 1]) glass.box(0.03, wh, ch[2] * 2 - 0.12, 0, [sx * (ch[0] - 0.04), wy, co[2]]);
  }
  dash(b, x, y, z, w = 1.6) {
    b.rbox(w, 0.16, 0.3, 0.06, 0x33333a, [0, y, z]);
    b.cyl(0.17, 0.17, 0.04, 0x22222a, [x, y + 0.26, z - 0.25], [1.1, 0, 0], 14);
  }
  meshCar(P) {
    const { b, c } = P, def = this.def, h = def.half, dark = P.dark;
    const police = this.type === 'police';
    b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.22, police ? 0x1f2b5c : c, [0, 0, 0], null, 3);
    if (police) {
      b.box(h[0] * 2 + 0.02, h[1] * 0.9, 1.9, 0xffffff, [0, 0.03, -0.25]);
      for (const sx of [-1, 1]) {
        const s = signMesh('POLICE', 1.5, '#ffffff', '#1f2b5c');
        s.position.set(sx * (h[0] + 0.015), 0.03, -0.25); s.rotation.y = sx * PI / 2;
        this.shell.add(s);
      }
    } else b.box(h[0] * 2 + 0.02, 0.06, h[2] * 2 - 0.5, P.trim, [0, 0.12, 0]);
    b.rbox(h[0] * 2 + 0.04, 0.16, h[2] * 2 + 0.06, 0.08, dark, [0, -h[1] + 0.06, 0]);
    // bumpers + grille
    b.rbox(h[0] * 2 - 0.1, 0.14, 0.12, 0.05, 0xd8d8de, [0, -0.12, h[2] + 0.02]);
    b.rbox(h[0] * 2 - 0.1, 0.14, 0.12, 0.05, 0xd8d8de, [0, -0.12, -h[2] - 0.02]);
    b.box(0.7, 0.12, 0.04, dark, [0, 0.04, h[2] + 0.01]);
    // wheel arches
    for (const a of def.axles) for (const sx of [-1, 1]) b.cyl(a.r + 0.06, a.r + 0.06, 0.08, dark, [sx * (h[0] - 0.02), a.y + 0.02, a.z], [0, 0, PI / 2], 14);
    const ch = def.cabin.half, co = def.cabin.off;
    this.cabinFrame(P, ch, co, h[1], 0.12, police ? 0xffffff : c);
    this.dash(b, 0.4, h[1], co[2] + ch[2] - 0.1);
    // mirrors
    for (const sx of [-1, 1]) b.rbox(0.18, 0.12, 0.08, 0.03, police ? 0xffffff : c, [sx * (h[0] + 0.06), h[1] + 0.2, co[2] + ch[2] - 0.2]);
  }
  meshSports(P) {
    const { b, glass, c, dark } = P, def = this.def, h = def.half;
    b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.24, c, [0, 0, 0], null, 3);
    b.rbox(1.5, 0.16, 1.5, 0.08, c, [0, h[1] + 0.02, 1.25]); // hood bulge
    for (const sx of [-1, 1]) b.box(0.22, 0.02, h[2] * 2 - 0.1, 0xffffff, [sx * 0.25, h[1] + 0.005, 0]); // racing stripes
    b.rbox(h[0] * 2 + 0.04, 0.14, h[2] * 2 + 0.06, 0.07, dark, [0, -h[1] + 0.05, 0]);
    for (const a of def.axles) for (const sx of [-1, 1]) b.cyl(a.r + 0.06, a.r + 0.06, 0.08, dark, [sx * (h[0] - 0.02), a.y + 0.02, a.z], [0, 0, PI / 2], 14);
    // cockpit tub, seats, windscreen frame, roll hoops, spoiler
    b.box(1.5, 0.05, 1.5, 0x1a1a20, [0, h[1] - 0.01, -0.3]);
    for (const sx of [-1, 1]) {
      b.rbox(0.5, 0.55, 0.16, 0.06, 0x222228, [sx * 0.42, h[1] + 0.2, -0.55]);
      b.cyl(0.05, 0.05, 0.42, 0xcccccc, [sx * 0.42, h[1] + 0.35, -0.75]);
    }
    b.box(1.7, 0.05, 0.08, dark, [0, h[1] + 0.42, 0.56], [-0.5, 0, 0]);
    glass.box(1.6, 0.4, 0.03, 0, [0, h[1] + 0.2, 0.6], [-0.5, 0, 0]);
    this.dash(b, 0.42, h[1], 0.45, 1.6);
    b.box(1.9, 0.06, 0.38, dark, [0, h[1] + 0.32, -h[2] + 0.2]);
    for (const sx of [-1, 1]) b.box(0.06, 0.3, 0.2, dark, [sx * 0.7, h[1] + 0.15, -h[2] + 0.22]);
    b.rbox(h[0] * 2 - 0.2, 0.12, 0.1, 0.04, 0xd8d8de, [0, -0.1, h[2] + 0.02]);
  }
  meshBus(P) {
    const { b, glass, c, dark } = P, def = this.def, h = def.half, ch = def.cabin.half, co = def.cabin.off;
    const top = co[1] + ch[1], winB = 1.32, winT = top - 0.22;
    b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.15, c, [0, 0, 0]);
    b.rbox(h[0] * 2 + 0.04, 0.16, h[2] * 2 + 0.04, 0.08, dark, [0, -h[1] + 0.06, 0]);
    b.box(ch[0] * 2, winB - h[1], ch[2] * 2, c, [0, (winB + h[1]) / 2, 0]);
    b.rbox(ch[0] * 2, top - winT, ch[2] * 2, 0.12, 0xffffff, [0, (top + winT) / 2, 0]);
    b.box(ch[0] * 2 + 0.02, 0.12, ch[2] * 2 + 0.02, 0xffffff, [0, winB - 0.1, 0]); // stripe
    for (const sx of [-1, 1]) for (let k = 0; k <= 7; k++) b.box(0.08, winT - winB, 0.14, c, [sx * (ch[0] - 0.04), (winT + winB) / 2, -ch[2] + 0.07 + k * (ch[2] * 2 - 0.14) / 7]);
    for (const sz of [-1, 1]) for (const sx of [-1, 0, 1]) b.box(0.14, winT - winB, 0.08, c, [sx * (ch[0] - 0.07), (winT + winB) / 2, sz * (ch[2] - 0.04)]);
    glass.box(ch[0] * 2 - 0.08, winT - winB, ch[2] * 2 - 0.08, 0, [0, (winT + winB) / 2, 0]);
    // door on the right (-X), destination board, bumpers, seats inside
    b.box(0.04, 1.75, 1.0, 0x333a44, [-ch[0] - 0.01, 1.25, 3.7]);
    const s = signMesh('TOWN LOOP', 1.9, '#222228', '#ffd23f');
    s.position.set(0, top - 0.11, ch[2] + 0.01); this.shell.add(s);
    b.rbox(h[0] * 2 - 0.1, 0.18, 0.14, 0.05, 0xd8d8de, [0, -0.15, h[2] + 0.03]);
    b.rbox(h[0] * 2 - 0.1, 0.18, 0.14, 0.05, 0xd8d8de, [0, -0.15, -h[2] - 0.03]);
    for (const st of def.seats) if (st.kind !== 'driver') b.rbox(0.62, 0.62, 0.14, 0.05, 0x3f8cff, [st.pos[0], st.pos[1] + 0.12, st.pos[2] - 0.36]);
    this.dash(b, 0.72, 0.78, 4.6, 2.3);
    for (const a of def.axles) for (const sx of [-1, 1]) b.cyl(a.r + 0.07, a.r + 0.07, 0.08, dark, [sx * (h[0] - 0.02), a.y + 0.05, a.z], [0, 0, PI / 2], 14);
  }
  meshFire(P) {
    const { b, glass, c, dark } = P, def = this.def, h = def.half, ch = def.cabin.half, co = def.cabin.off;
    b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.12, c, [0, 0, 0]);
    b.rbox(h[0] * 2 + 0.04, 0.16, h[2] * 2 + 0.04, 0.08, dark, [0, -h[1] + 0.06, 0]);
    // cab: solid lower half, glass upper
    const mid = co[1] - 0.05, top = co[1] + ch[1];
    b.box(ch[0] * 2, mid - h[1], ch[2] * 2, c, [0, (mid + h[1]) / 2, co[2]]);
    this.cabinFrame(P, ch, [co[0], co[1], co[2]], mid, 0.05);
    b.box(ch[0] * 2 + 0.02, 0.1, ch[2] * 2 + 0.02, 0xffffff, [0, mid - 0.05, co[2]]);
    // equipment body with roller doors + white stripe
    b.rbox(2.2, 1.1, 4.0, 0.08, c, [0, 1.0, -1.3]);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) b.box(0.03, 0.8, 1.15, 0xb8bcc4, [sx * 1.105, 0.95, -2.75 + k * 1.3]);
    b.box(2.24, 0.1, 4.02, 0xffffff, [0, 0.5, -1.3]);
    // ladder on top
    for (const sx of [-1, 1]) b.box(0.07, 0.07, 4.6, 0xd8d8de, [sx * 0.32, 1.7, -0.9], [-0.06, 0, 0]);
    for (let k = 0; k < 13; k++) b.cyl(0.025, 0.025, 0.64, 0xd8d8de, [0, 1.7 + (k - 6) * 0.35 * 0.06, -0.9 + (k - 6) * 0.35], [0, 0, PI / 2], 6);
    b.box(0.5, 0.3, 0.5, 0x888888, [0, 1.7, -3.0]);
    // hose reel, bumpers, grille
    b.cyl(0.25, 0.25, 0.6, 0xffd23f, [0, 0.55, -h[2] - 0.05], [0, 0, PI / 2], 12);
    b.rbox(h[0] * 2 - 0.1, 0.2, 0.15, 0.05, 0xd8d8de, [0, -0.15, h[2] + 0.04]);
    b.box(1.2, 0.4, 0.04, 0xb8bcc4, [0, 0.2, h[2] + 0.01]);
    this.dash(b, 0.5, mid - 0.05, co[2] + ch[2] - 0.15, 2.0);
    for (const a of def.axles) for (const sx of [-1, 1]) b.cyl(a.r + 0.07, a.r + 0.07, 0.08, dark, [sx * (h[0] - 0.02), a.y + 0.05, a.z], [0, 0, PI / 2], 14);
  }
  meshTractor(P) {
    const { b, c, dark } = P;
    const body = c, yel = 0xffd23f;
    b.rbox(0.8, 0.62, 1.2, 0.1, body, [0, 0.5, 0.75]);           // hood
    b.box(0.82, 0.08, 1.22, dark, [0, 0.83, 0.75]);
    for (let k = 0; k < 5; k++) b.box(0.62, 0.04, 0.03, dark, [0, 0.3 + k * 0.08, 1.36]); // grille
    b.rbox(0.9, 0.5, 0.9, 0.08, body, [0, 0.45, -0.55]);          // seat box
    b.cyl(0.06, 0.06, 1.0, 0x444444, [0.28, 1.25, 1.0]);          // exhaust
    b.rbox(0.5, 0.12, 0.45, 0.05, 0x222228, [0, 0.92, -0.62]);    // seat
    b.rbox(0.5, 0.45, 0.1, 0.05, 0x222228, [0, 1.15, -0.88]);
    b.cyl(0.17, 0.17, 0.04, 0x22222a, [0, 1.25, -0.15], [0.7, 0, 0], 14);
    b.cyl(0.03, 0.03, 0.5, 0x777777, [0, 1.05, -0.05], [0.7, 0, 0]);
    for (const sx of [-1, 1]) {
      b.box(0.36, 0.06, 1.2, body, [sx * 0.86, 1.1, -0.62]); // fenders
      b.box(0.36, 0.5, 0.06, body, [sx * 0.86, 0.85, -0.02]);
      b.box(0.06, 1.2, 0.06, dark, [sx * 0.58, 1.5, -0.08]);
      b.box(0.06, 1.2, 0.06, dark, [sx * 0.58, 1.5, -1.18]);
    }
    b.rbox(1.3, 0.1, 1.3, 0.04, yel, [0, 2.1, -0.62]);           // canopy
    b.box(0.6, 0.1, 0.25, dark, [0, 0.35, -1.3]);                 // hitch
  }
  meshKart(P) {
    const { b, c, dark, trim } = P, h = this.def.half;
    b.rbox(h[0] * 2, 0.16, h[2] * 2, 0.06, c, [0, 0, 0]);
    b.rbox(0.6, 0.45, 0.2, 0.08, dark, [0, 0.3, -0.45]);
    b.box(1.4, 0.15, 0.25, trim, [0, 0.0, 1.05]);
    b.box(1.4, 0.15, 0.25, trim, [0, 0.0, -1.0]);
    b.rbox(0.7, 0.2, 0.5, 0.08, c, [0, 0.14, 0.75]);
    b.cyl(0.18, 0.18, 0.04, dark, [0, 0.42, 0.3], [1.1, 0, 0], 14);
    b.cyl(0.03, 0.03, 0.4, 0x777777, [0, 0.27, 0.42], [1.1, 0, 0]);
    b.cyl(0.05, 0.05, 0.3, 0x777777, [0.2, 0.2, -0.95], [PI / 2, 0, 0]);
  }
  meshBumper(P) {
    const { b, c, dark, trim } = P;
    b.cyl(0.95, 0.95, 0.32, 0x333333, [0, 0, 0], null, 20);
    b.cyl(0.88, 0.9, 0.42, c, [0, 0.25, 0], null, 20);
    b.rbox(0.8, 0.5, 0.6, 0.15, trim, [0, 0.55, -0.45]);
    b.cyl(0.03, 0.03, 2.2, 0x888888, [0, 1.4, -0.6]);
    b.sphere(0.06, 0xffd23f, [0, 2.5, -0.6]);
    b.cyl(0.18, 0.18, 0.3, dark, [0, 0.6, 0.35], [0.9, 0, 0]);
  }
  meshQuad(P) {
    const { b, c, dark } = P, h = this.def.half;
    b.rbox(h[0] * 2, 0.35, h[2] * 2, 0.12, c, [0, 0.05, 0]);
    b.rbox(0.6, 0.25, 0.9, 0.1, dark, [0, 0.33, -0.35]);
    b.box(1.3, 0.06, 0.5, dark, [0, 0.3, 0.85]);
    b.box(1.3, 0.06, 0.4, dark, [0, 0.35, -0.95]);
    for (const sz of [0.68, -0.66]) for (const sx of [-1, 1]) b.rbox(0.4, 0.08, 0.7, 0.04, c, [sx * 0.6, 0.38, sz]); // mudguards
    b.cyl(0.03, 0.03, 0.8, 0x777777, [0, 0.62, 0.35], [0, 0, PI / 2]);
  }
  meshScooter(P) {
    const { b, c, dark } = P;
    b.rbox(0.36, 0.12, 1.0, 0.05, dark, [0, 0.02, -0.05]);       // deck
    b.rbox(0.42, 0.42, 0.75, 0.15, c, [0, 0.28, -0.45]);           // rear body
    b.rbox(0.36, 0.12, 0.6, 0.05, 0x222228, [0, 0.52, -0.42]);    // seat
    b.rbox(0.42, 0.75, 0.22, 0.1, c, [0, 0.38, 0.5], [-0.25, 0, 0]); // front shield
    b.cyl(0.035, 0.035, 0.75, 0x999999, [0, 0.62, 0.6], [-0.3, 0, 0]);
    b.cyl(0.03, 0.03, 0.75, 0x777777, [0, 0.98, 0.68], [0, 0, PI / 2]);
    for (const sx of [-1, 1]) b.cyl(0.04, 0.04, 0.12, 0x222228, [sx * 0.36, 0.98, 0.68], [0, 0, PI / 2]);
    b.rbox(0.2, 0.06, 0.4, 0.03, c, [0, 0.28, 0.66]);              // front mudguard
    b.box(0.18, 0.1, 0.05, 0xff3030, [0, 0.42, -0.83]);
  }
  meshBoat(P) {
    const { b, c, dark, glass } = P, h = this.def.half;
    b.rbox(h[0] * 2, 0.5, h[2] * 2, 0.2, 0xffffff, [0, -0.1, 0]);
    b.rbox(h[0] * 2 + 0.06, 0.18, h[2] * 2 + 0.06, 0.09, c, [0, -0.28, 0]);
    b.box(0.18, 0.5, h[2] * 2, c, [h[0] - 0.09, 0.3, 0]);
    b.box(0.18, 0.5, h[2] * 2, c, [-h[0] + 0.09, 0.3, 0]);
    b.box(h[0] * 2, 0.5, 0.18, c, [0, 0.3, -h[2] + 0.09]);
    b.cone(h[0], 1.0, 0xffffff, [0, -0.1, h[2] + 0.45], [PI / 2, 0, 0], 4);
    b.box(1.2, 0.08, 0.5, 0xc8a06a, [0, 0.25, 0.1]);
    b.box(1.2, 0.08, 0.5, 0xc8a06a, [0, 0.25, 1.2]);
    b.box(0.5, 0.6, 0.5, dark, [0, 0.2, -h[2] - 0.15]);
    glass.box(0.9, 0.5, 0.05, 0, [0, 0.75, 0.6], [-0.4, 0, 0]);
    b.cyl(0.04, 0.04, 0.9, 0x888888, [0, 0.4, -h[2] - 0.15]);
    b.torus(0.25, 0.07, 0xff5a3a, [h[0] + 0.02, 0.3, -0.8], [0, PI / 2, 0], 12); // life ring
  }
  meshHeli(P) {
    const { b, glass, c, dark } = P;
    b.rbox(1.7, 0.75, 2.6, 0.3, c, [0, -0.4, -0.05]);              // lower body
    b.rbox(1.6, 0.25, 1.6, 0.12, c, [0, 0.62, -0.35]);             // roof
    for (const sx of [-1, 1]) for (const z of [0.95, -1.05]) b.box(0.08, 0.95, 0.08, c, [sx * 0.76, 0.15, z]);
    glass.rbox(1.6, 0.85, 2.3, 0.3, 0, [0, 0.12, 0.05]);
    b.rbox(0.9, 0.4, 0.4, 0.1, dark, [0, 0.82, -0.4]);             // engine
    b.cyl(0.08, 0.08, 0.4, 0x777777, [0, 1.05, -0.35]);
    b.cyl(0.17, 0.08, 3.2, c, [0, 0.35, -2.8], [PI / 2, 0, 0], 10); // tail boom
    b.box(0.08, 0.8, 0.5, c, [0, 0.75, -4.3]);
    b.box(0.9, 0.06, 0.35, c, [0, 0.4, -3.9]);
    for (const sx of [-1, 1]) {
      b.cyl(0.06, 0.06, 2.7, 0x555560, [sx * 0.78, -1.08, 0.05], [PI / 2, 0, 0], 8); // skids
      b.cyl(0.04, 0.04, 0.4, 0x555560, [sx * 0.7, -0.9, 0.7], [0, 0, sx * 0.4]);
      b.cyl(0.04, 0.04, 0.4, 0x555560, [sx * 0.7, -0.9, -0.6], [0, 0, sx * 0.4]);
    }
    for (const st of this.def.seats) b.rbox(0.5, 0.12, 0.45, 0.04, 0x222228, [st.pos[0], st.pos[1] - 0.18, st.pos[2]]);
    const rb = new Builder();
    rb.cyl(0.14, 0.14, 0.12, 0x333333, [0, 0, 0]);
    for (const a of [0, PI / 2]) rb.box(7.6, 0.04, 0.26, 0x2a2a30, [0, 0, 0], [0, a, 0]);
    this.rotor = rb.mesh(matVC); this.rotor.position.set(0, 1.27, -0.35); this.shell.add(this.rotor);
    const tb = new Builder();
    tb.box(0.04, 1.1, 0.14, 0x2a2a30, [0, 0, 0]); tb.box(0.04, 0.14, 1.1, 0x2a2a30, [0, 0, 0]);
    this.tailRotor = tb.mesh(matVC); this.tailRotor.position.set(0.1, 0.8, -4.35); this.shell.add(this.tailRotor);
  }
}
