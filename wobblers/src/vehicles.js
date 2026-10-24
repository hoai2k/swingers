// Drivable vehicles: ray-cast wheeled cars (Rapier's vehicle controller) and
// buoyant boats. Every vehicle carries seats players can hop into with Y.
import * as THREE from 'three';
import { RAPIER, yawQuat } from './physics.js';
import { DT, VEH_GROUPS, WHEEL_QUERY } from './config.js';
import { Builder, matVC, matGlass } from './mesh.js';

const CAR_COLORS = [0xff4d4d, 0x3d7dff, 0xffd23f, 0x4fd16a, 0xff8a3d, 0xb46cff, 0xffffff, 0x2bc4c4, 0xff7fc8, 0x444455];

// Vehicle definitions. Dimensions in metres, body frame: +Z forward, +X left.
export const VEHICLES = {
  car: {
    mass: 1000, half: [0.95, 0.32, 2.05], cabin: { half: [0.85, 0.38, 1.05], off: [0, 0.68, -0.25] },
    wheels: { x: 0.86, y: -0.1, zf: 1.35, zr: -1.3, r: 0.4, rest: 0.32 }, engine: 5200, brake: 90, maxSpeed: 27, steer: 0.55,
    seats: [{ pos: [0.38, 0.32, -0.15], kind: 'driver' }, { pos: [-0.38, 0.32, -0.15] }, { pos: [0.38, 0.32, -1.05] }, { pos: [-0.38, 0.32, -1.05] }],
    camH: 1.5, camDist: 8.5,
  },
  pickup: {
    mass: 1300, half: [1.0, 0.36, 2.5], cabin: { half: [0.9, 0.42, 0.75], off: [0, 0.78, 0.55] }, bed: true,
    wheels: { x: 0.92, y: -0.12, zf: 1.7, zr: -1.6, r: 0.48, rest: 0.38 }, engine: 6600, brake: 110, maxSpeed: 25, steer: 0.5,
    seats: [{ pos: [0.4, 0.38, 0.5], kind: 'driver' }, { pos: [-0.4, 0.38, 0.5] }, { pos: [0.5, 0.45, -1.4], yaw: Math.PI / 2 }, { pos: [-0.5, 0.45, -1.4], yaw: -Math.PI / 2 }],
    camH: 1.8, camDist: 9.5,
  },
  van: {
    mass: 1500, half: [1.05, 0.38, 2.4], cabin: { half: [1.0, 0.75, 1.75], off: [0, 1.1, -0.45] }, icecream: false,
    wheels: { x: 0.95, y: -0.12, zf: 1.6, zr: -1.55, r: 0.45, rest: 0.36 }, engine: 7000, brake: 120, maxSpeed: 22, steer: 0.5,
    seats: [{ pos: [0.42, 0.42, 1.0], kind: 'driver' }, { pos: [-0.42, 0.42, 1.0] }, { pos: [0.42, 0.42, -0.4] }, { pos: [-0.42, 0.42, -0.4] }, { pos: [0.42, 0.42, -1.4] }, { pos: [-0.42, 0.42, -1.4] }],
    camH: 2.2, camDist: 10,
  },
  kart: {
    mass: 220, half: [0.62, 0.12, 1.0], cabin: null, open: true,
    wheels: { x: 0.62, y: -0.02, zf: 0.72, zr: -0.68, r: 0.22, rest: 0.12 }, engine: 1500, brake: 25, maxSpeed: 21, steer: 0.6,
    seats: [{ pos: [0, 0.12, -0.2], kind: 'driver' }], camH: 1.1, camDist: 5.8,
  },
  bumper: {
    mass: 260, half: [0.75, 0.18, 0.95], cabin: null, open: true, bumper: true,
    wheels: { x: 0.5, y: -0.05, zf: 0.55, zr: -0.55, r: 0.16, rest: 0.1 }, engine: 1100, brake: 25, maxSpeed: 6.5, steer: 0.9,
    seats: [{ pos: [0, 0.18, -0.15], kind: 'driver' }], camH: 1.2, camDist: 6,
  },
  quad: {
    mass: 300, half: [0.55, 0.2, 0.9], cabin: null, open: true, quad: true,
    wheels: { x: 0.6, y: -0.05, zf: 0.68, zr: -0.66, r: 0.34, rest: 0.25 }, engine: 2000, brake: 30, maxSpeed: 20, steer: 0.6,
    seats: [{ pos: [0, 0.45, -0.25], kind: 'driver' }, { pos: [0, 0.5, -0.75] }], camH: 1.3, camDist: 6.5,
  },
  boat: {
    mass: 420, half: [1.0, 0.35, 2.4], boat: true, engine: 3800, maxSpeed: 14, steer: 1,
    seats: [{ pos: [0, 0.3, -1.4], kind: 'driver' }, { pos: [0.42, 0.3, 0.1] }, { pos: [-0.42, 0.3, 0.1] }, { pos: [0, 0.3, 1.2] }],
    camH: 1.6, camDist: 9,
  },
};

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class Vehicle {
  constructor(game, type, x, y, z, yaw, color) {
    this.game = game;
    this.type = type;
    const def = this.def = VEHICLES[type];
    this.color = color ?? CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0];
    this.home = { x, y, z, yaw };
    const world = game.physics.world;
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(yawQuat(yaw))
      .setLinearDamping(def.boat ? 0.15 : 0.02).setAngularDamping(def.boat ? 1.2 : 0.6).setCcdEnabled(true);
    this.body = world.createRigidBody(bd);
    const h = def.half;
    const cols = [];
    const add = (desc, mass) => {
      desc.setCollisionGroups(VEH_GROUPS).setMass(mass).setFriction(def.bumper ? 0.1 : 0.5).setRestitution(def.bumper ? 0.8 : 0.15);
      const c = world.createCollider(desc, this.body);
      cols.push(c);
      game.physics.handleOwner.set(c.handle, this);
      return c;
    };
    if (def.boat) {
      add(RAPIER.ColliderDesc.cuboid(h[0], 0.18, h[2]).setTranslation(0, -0.15, 0), def.mass * 0.8);
      add(RAPIER.ColliderDesc.cuboid(0.1, 0.3, h[2]).setTranslation(h[0] - 0.1, 0.2, 0), def.mass * 0.05);
      add(RAPIER.ColliderDesc.cuboid(0.1, 0.3, h[2]).setTranslation(-h[0] + 0.1, 0.2, 0), def.mass * 0.05);
      add(RAPIER.ColliderDesc.cuboid(h[0], 0.3, 0.1).setTranslation(0, 0.2, -h[2] + 0.1), def.mass * 0.05);
      add(RAPIER.ColliderDesc.cuboid(h[0] * 0.7, 0.3, 0.3).setTranslation(0, 0.15, h[2] - 0.2), def.mass * 0.05);
    } else if (def.bumper) {
      add(RAPIER.ColliderDesc.roundCylinder(h[1], 0.85, 0.12).setTranslation(0, 0, 0), def.mass);
    } else if (def.bed) {
      add(RAPIER.ColliderDesc.cuboid(h[0], h[1], h[2]), def.mass * 0.85);
      add(RAPIER.ColliderDesc.cuboid(...def.cabin.half).setTranslation(...def.cabin.off), def.mass * 0.1);
      add(RAPIER.ColliderDesc.cuboid(0.08, 0.25, 1.15).setTranslation(h[0] - 0.08, h[1] + 0.25, -1.3), def.mass * 0.01);
      add(RAPIER.ColliderDesc.cuboid(0.08, 0.25, 1.15).setTranslation(-h[0] + 0.08, h[1] + 0.25, -1.3), def.mass * 0.01);
      add(RAPIER.ColliderDesc.cuboid(h[0], 0.25, 0.08).setTranslation(0, h[1] + 0.25, -h[2] + 0.08), def.mass * 0.01);
    } else {
      add(RAPIER.ColliderDesc.roundCuboid(h[0] - 0.08, h[1] - 0.08, h[2] - 0.08, 0.08), def.mass * 0.9);
      if (def.cabin) add(RAPIER.ColliderDesc.roundCuboid(def.cabin.half[0] - 0.1, def.cabin.half[1] - 0.1, def.cabin.half[2] - 0.1, 0.1).setTranslation(...def.cabin.off), def.mass * 0.1);
    }
    this.colliders = cols;

    if (!def.boat) {
      const vc = this.ctrl = world.createVehicleController(this.body);
      vc.indexUpAxis = 1;
      vc.setIndexForwardAxis = 2;
      const w = def.wheels;
      const pts = [[w.x, w.y, w.zf], [-w.x, w.y, w.zf], [w.x, w.y, w.zr], [-w.x, w.y, w.zr]];
      for (const p of pts) vc.addWheel({ x: p[0], y: p[1], z: p[2] }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, w.rest, w.r);
      for (let i = 0; i < 4; i++) {
        vc.setWheelSuspensionStiffness(i, def.bumper ? 60 : 32);
        vc.setWheelSuspensionCompression(i, 2.6);
        vc.setWheelSuspensionRelaxation(i, 3.2);
        vc.setWheelMaxSuspensionForce(i, def.mass * 40);
        vc.setWheelMaxSuspensionTravel(i, w.rest * 1.2);
        vc.setWheelFrictionSlip(i, def.bumper ? 1.4 : 2.6);
        vc.setWheelSideFrictionStiffness(i, def.bumper ? 0.7 : 1.0);
      }
    } else {
      // buoyancy samples around the hull
      const pts = [];
      for (const sx of [-0.85, 0.85]) for (const sz of [-2.0, -0.7, 0.7, 2.0]) pts.push([sx, -0.25, sz]);
      this.buoy = { points: pts, r: 0.35, volume: 2.6 };
      game.physics.objects.push({ body: this.body, mesh: null, buoy: this.buoy, kind: 'vehicle' });
    }
    if (!def.boat) game.physics.objects.push({ body: this.body, mesh: null, buoy: { r: 0.6, volume: 0.25 * def.mass / 400, drag: 1.2 }, kind: 'vehicle' });

    this.seats = def.seats.map((s, i) => ({
      body: this.body, pos: s.pos, yaw: s.yaw || 0, kind: s.kind || 'passenger', vehicle: this, occupant: null,
      exit: [s.pos[0] >= 0 ? h[0] + 0.9 : -h[0] - 0.9, s.pos[1] + 0.2, s.pos[2]],
      label: s.kind === 'driver' ? 'Drive' : 'Sit',
    }));
    for (const s of this.seats) game.seats.push(s);

    this.steer = 0;
    this.speed = 0;
    this.flipTimer = 0;
    this.idleTimer = 0;
    this.buildMesh();
    game.scene.add(this.mesh);
  }

  driver() { return this.seats.find((s) => s.kind === 'driver')?.occupant || null; }
  yaw() {
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _v.set(0, 0, 1).applyQuaternion(_q);
    return Math.atan2(_v.x, _v.z);
  }

  buildMesh() {
    const def = this.def, h = def.half, c = this.color;
    const g = this.mesh = new THREE.Group();
    const b = new Builder();
    const dark = 0x2a2a33, trim = new THREE.Color(c).multiplyScalar(0.7).getHex();
    if (def.boat) {
      b.rbox(h[0] * 2, 0.5, h[2] * 2, 0.2, 0xffffff, [0, -0.1, 0]);
      b.rbox(h[0] * 2 + 0.06, 0.18, h[2] * 2 + 0.06, 0.09, c, [0, -0.28, 0]);
      b.box(0.18, 0.5, h[2] * 2, c, [h[0] - 0.09, 0.3, 0]);
      b.box(0.18, 0.5, h[2] * 2, c, [-h[0] + 0.09, 0.3, 0]);
      b.box(h[0] * 2, 0.5, 0.18, c, [0, 0.3, -h[2] + 0.09]);
      b.cone(h[0], 1.0, 0xffffff, [0, -0.1, h[2] + 0.45], [Math.PI / 2, 0, 0], 4);
      b.box(1.2, 0.08, 0.5, 0xc8a06a, [0, 0.25, 0.1]);
      b.box(1.2, 0.08, 0.5, 0xc8a06a, [0, 0.25, 1.2]);
      b.box(0.5, 0.6, 0.5, dark, [0, 0.2, -h[2] - 0.15]);
      b.box(0.9, 0.5, 0.05, 0x9fd8ff, [0, 0.75, 0.6], [-0.4, 0, 0]);
      b.cyl(0.04, 0.04, 0.9, 0x888888, [0, 0.4, -h[2] - 0.15]);
    } else if (def.bumper) {
      b.cyl(0.95, 0.95, 0.32, 0x333333, [0, 0, 0], null, 20);
      b.cyl(0.88, 0.9, 0.42, c, [0, 0.25, 0], null, 20);
      b.rbox(0.8, 0.5, 0.6, 0.15, trim, [0, 0.55, -0.45]);
      b.cyl(0.03, 0.03, 2.2, 0x888888, [0, 1.4, -0.6]);
      b.cyl(0.18, 0.18, 0.3, dark, [0, 0.6, 0.35], [0.9, 0, 0]);
    } else if (def.quad) {
      b.rbox(h[0] * 2, 0.35, h[2] * 2, 0.12, c, [0, 0.05, 0]);
      b.rbox(0.6, 0.25, 0.9, 0.1, dark, [0, 0.33, -0.35]);
      b.box(1.3, 0.06, 0.5, dark, [0, 0.3, 0.85]);
      b.box(1.3, 0.06, 0.4, dark, [0, 0.35, -0.95]);
      b.cyl(0.03, 0.03, 0.8, 0x777777, [0, 0.62, 0.35], [0, 0, Math.PI / 2]);
    } else if (def.open) {
      // go-kart
      b.rbox(h[0] * 2, 0.16, h[2] * 2, 0.06, c, [0, 0, 0]);
      b.rbox(0.6, 0.45, 0.2, 0.08, dark, [0, 0.3, -0.45]);
      b.box(1.4, 0.15, 0.25, trim, [0, 0.0, 1.05]);
      b.box(1.4, 0.15, 0.25, trim, [0, 0.0, -1.0]);
      b.cyl(0.18, 0.18, 0.04, dark, [0, 0.42, 0.3], [1.1, 0, 0], 14);
      b.cyl(0.03, 0.03, 0.4, 0x777777, [0, 0.27, 0.42], [1.1, 0, 0]);
    } else {
      b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.22, c, [0, 0, 0], null, 3);
      b.rbox(h[0] * 2 + 0.04, 0.16, h[2] * 2 + 0.06, 0.08, dark, [0, -h[1] + 0.06, 0]);
      // lights
      for (const sx of [-1, 1]) {
        b.sphere(0.13, 0xfff6c0, [sx * (h[0] - 0.25), 0.05, h[2] - 0.02], [1, 0.8, 0.5]);
        b.box(0.28, 0.12, 0.05, 0xff3030, [sx * (h[0] - 0.25), 0.08, -h[2] + 0.0]);
      }
      if (def.cabin) {
        const ch = def.cabin.half, co = def.cabin.off;
        b.rbox(ch[0] * 2, ch[1] * 2, ch[2] * 2, 0.2, c, co, null, 3);
        if (def.icecream || this.type === 'van') {
          b.box(ch[0] * 2 + 0.02, 0.18, ch[2] * 2 + 0.02, 0xffffff, [co[0], co[1] - 0.15, co[2]]);
        }
      }
      if (def.bed) {
        b.box(0.16, 0.5, 2.3, trim, [h[0] - 0.08, h[1] + 0.25, -1.3]);
        b.box(0.16, 0.5, 2.3, trim, [-h[0] + 0.08, h[1] + 0.25, -1.3]);
        b.box(h[0] * 2, 0.5, 0.16, trim, [0, h[1] + 0.25, -h[2] + 0.08]);
      }
    }
    const body = b.mesh(matVC);
    g.add(body);
    // windows (separate glass material)
    if (def.cabin && !def.boat) {
      const ch = def.cabin.half, co = def.cabin.off;
      const gb = new Builder();
      gb.box(ch[0] * 2 + 0.04, ch[1] * 1.1, ch[2] * 2 - 0.3, 0, [co[0], co[1] + 0.05, co[2]]);
      gb.box(ch[0] * 2 - 0.25, ch[1] * 1.1, ch[2] * 2 + 0.04, 0, [co[0], co[1] + 0.05, co[2]]);
      const gm = new THREE.Mesh(gb.geometry(), matGlass);
      g.add(gm);
    }
    // wheels
    this.wheelMeshes = [];
    if (this.ctrl) {
      const w = def.wheels;
      for (let i = 0; i < 4; i++) {
        const wb = new Builder();
        const tw = def.open ? 0.28 : 0.3;
        wb.cyl(w.r, w.r, tw, 0x1e1e24, [0, 0, 0], [0, 0, Math.PI / 2], 16);
        wb.cyl(w.r * 0.58, w.r * 0.58, tw + 0.02, 0xdddddd, [0, 0, 0], [0, 0, Math.PI / 2], 10);
        wb.box(tw + 0.04, w.r * 0.2, w.r * 0.9, 0x999999, [0, 0, 0]);
        const wm = wb.mesh(matVC);
        g.add(wm);
        this.wheelMeshes.push(wm);
      }
    }
    if (this.type === 'van' && this.game.iceCreamVans < 2) {
      this.game.iceCreamVans = (this.game.iceCreamVans || 0) + 1;
      const ib = new Builder(), co = def.cabin.off, ch = def.cabin.half;
      ib.cone(0.45, 1.1, 0xe0a860, [0, co[1] + ch[1] + 0.55, co[2] - 0.6], [Math.PI, 0, 0]);
      ib.sphere(0.5, 0xffb7d5, [0, co[1] + ch[1] + 1.15, co[2] - 0.6]);
      ib.sphere(0.12, 0xff3355, [0, co[1] + ch[1] + 1.65, co[2] - 0.6]);
      g.add(ib.mesh(matVC));
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  control(inp) {
    const def = this.def;
    const gas = inp.gas || 0, brake = inp.brake || 0;
    const steerIn = -(inp.steer || 0); // +X is left
    const lim = def.steer * (def.boat ? 1 : 1 / (1 + Math.abs(this.speed) * 0.035));
    this.steer += (steerIn * lim - this.steer) * Math.min(1, DT * 8);
    this.throttle = gas - brake;
    this.handbrake = !!inp.jump;
  }

  update() {
    const def = this.def;
    const drv = this.driver();
    if (!drv) { this.throttle = 0; this.steer *= 0.9; this.handbrake = true; }
    const v = this.body.linvel();
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const fwd = _v.set(0, 0, 1).applyQuaternion(_q);
    this.speed = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
    const up = _v2.set(0, 1, 0).applyQuaternion(_q);

    if (def.boat) {
      const wet = this.game.physics.objects.find((o) => o.body === this.body)?.wet || 0;
      if (wet > 0.05 && drv) {
        const t = this.throttle;
        const f = (t > 0 ? def.engine : def.engine * 0.5) * t * (Math.abs(this.speed) < def.maxSpeed ? 1 : 0);
        const p = this.body.translation();
        const stern = { x: p.x - fwd.x * 2.3, y: p.y - 0.3, z: p.z - fwd.z * 2.3 };
        this.body.applyImpulseAtPoint({ x: fwd.x * f * DT, y: 0, z: fwd.z * f * DT }, stern, true);
        const turn = this.steer * Math.max(-1, Math.min(1, this.speed / 4 + t * 0.6)) * 4200;
        this.body.applyTorqueImpulse({ x: 0, y: turn * DT, z: 0 }, true);
        // keel: kill sideways drift
        const side = _v2.set(1, 0, 0).applyQuaternion(_q);
        const sv = v.x * side.x + v.z * side.z;
        this.body.applyImpulse({ x: -side.x * sv * def.mass * 1.5 * DT * wet, y: 0, z: -side.z * sv * def.mass * 1.5 * DT * wet }, true);
      }
    } else {
      const vc = this.ctrl;
      const t = this.throttle;
      let eng = 0, brk = 0;
      if (t > 0.02) eng = this.speed < def.maxSpeed ? def.engine * t : 0;
      else if (t < -0.02) {
        if (this.speed > 1.0) brk = def.brake * -t;
        else eng = this.speed > -def.maxSpeed * 0.4 ? def.engine * 0.6 * t : 0;
      }
      const hb = this.handbrake ? def.brake * 0.6 : 0;
      for (let i = 0; i < 4; i++) {
        const front = i < 2;
        vc.setWheelSteering(i, front ? this.steer : 0);
        vc.setWheelEngineForce(i, eng * 0.25 * (front ? 0.8 : 1.2));
        vc.setWheelBrake(i, brk * 0.25 + (front ? 0 : hb) + (t === 0 && drv ? 0.4 : 0));
        vc.setWheelFrictionSlip(i, this.handbrake && !front ? 1.1 : (def.bumper ? 1.4 : 2.6));
      }
      vc.updateVehicle(DT, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WHEEL_QUERY, (col) => col.parent() !== this.body);
      // a little arcade: downforce + air control
      let inContact = 0;
      for (let i = 0; i < 4; i++) if (vc.wheelIsInContact(i)) inContact++;
      if (inContact === 0 && drv) {
        this.body.applyTorqueImpulse({ x: 0, y: -this.steer * def.mass * 0.6 * DT, z: 0 }, true);
      }
      if (def.bumper) {
        // bumper cars can spin on the spot
        this.body.applyTorqueImpulse({ x: 0, y: this.steer * def.mass * 1.4 * DT * (Math.abs(t) > 0.05 ? 1 : 0.3), z: 0 }, true);
      }
    }

    // self-righting
    if (up.y < 0.35 && Math.hypot(v.x, v.y, v.z) < 3) {
      this.flipTimer += DT;
      if (this.flipTimer > (drv ? 1.5 : 6)) {
        const p = this.body.translation();
        this.body.setTranslation({ x: p.x, y: p.y + 1.2, z: p.z }, true);
        this.body.setRotation(yawQuat(this.yaw()), true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.flipTimer = 0;
      }
    } else this.flipTimer = 0;

    // lost vehicles go home
    const p = this.body.translation();
    const occupied = this.seats.some((s) => s.occupant);
    if (!occupied) {
      const sunk = !def.boat && this.game.physics.waterLevel(p.x, p.y, p.z) != null && p.y < -1.2;
      this.idleTimer = (sunk || p.y < -20) ? this.idleTimer + DT : 0;
      if (this.idleTimer > 4) this.respawn();
    } else this.idleTimer = 0;
  }

  respawn() {
    for (const s of this.seats) if (s.occupant) s.occupant.leaveSeat();
    const hm = this.home;
    this.body.setTranslation({ x: hm.x, y: hm.y, z: hm.z }, true);
    this.body.setRotation(yawQuat(hm.yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.idleTimer = 0;
  }

  sync() {
    const t = this.body.translation(), r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    if (!this.ctrl) return;
    const vc = this.ctrl;
    for (let i = 0; i < 4; i++) {
      const cp = vc.wheelChassisConnectionPointCs(i);
      const len = vc.wheelSuspensionLength(i) ?? this.def.wheels.rest;
      const m = this.wheelMeshes[i];
      m.position.set(cp.x, cp.y - len, cp.z);
      m.rotation.set(0, 0, 0);
      m.rotateY(vc.wheelSteering(i) || 0);
      m.rotateX(vc.wheelRotation(i) || 0);
    }
  }
}
