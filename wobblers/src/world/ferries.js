// Ferries ("water with boats you can ride"): big kinematic boats that sail a
// closed route between docks, wait at each one, and carry whoever stands on
// the deck (players use the deck's velocity as ground velocity, player.js) or
// sits on a bench.
//
//  - Docks are region data: `region.docks = [{ id, name, x, z, yaw }]` (the land
//    end of the pier and the direction it points out to sea). buildDock() lays a
//    pier from there out to deep water with a T-shaped head and a framed
//    'FERRY' sign; the ferry berths alongside the head, parallel to the coast.
//  - A route is a list of stops { dock, dir } (dir: +1 / -1 = which way along the
//    coast the ferry faces at that berth; it sails off the way it faces) plus
//    optional waypoints per leg to steer round headlands: ROUTES below.
//  - new Ferry(game, { name, color, stops, waypoints }) — game.ferries lists them
//    (pos, yaw, state, next stop name for the map / UI).
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { DT, SEA_LEVEL, VEH_GROUPS } from '../config.js';
import { meshHeight, REGIONS } from '../terrain.js';
import { Builder, matVC, signMesh } from '../mesh.js';

export const PIER_TOP = 1.4;            // pier deck height = ferry deck height
const PIER_W = 4, HEAD_L = 30, HEAD_D = 5;
export const FERRY = { L: 24, W: 8, deck: PIER_TOP - SEA_LEVEL, draft: 1.7, speed: 9, accel: 0.55, turnAcc: 0.5, wait: 14, gateZ: -4 };
const GAP = 0.35;
const MAX_TURN = 0.16;                  // rad/s                       // between the pier head and the hull

// ---- docks ----------------------------------------------------------------------
export const DOCKS = new Map();          // id -> dock (with .berth once built)

export function buildDock(game, kit, d) {
  const dx = Math.sin(d.yaw), dz = Math.cos(d.yaw), tx = dz, tz = -dx; // out to sea / along the coast
  const at = (s) => meshHeight(d.x + dx * s, d.z + dz * s);
  let s0 = -40;
  while (s0 < 80 && at(s0) > PIER_TOP - 0.15) s0 += 0.5;
  let s1 = s0 + 6;
  while (s1 < s0 + 140 && at(s1) > -5) s1 += 1;
  s1 += 6 + (d.reach || 0); // reach: extra pier length where the coast curves away
  const P = (s, l = 0) => [d.x + dx * s + tx * l, d.z + dz * s + tz * l];
  const wood = 0xb98a5a, post = 0x8a6a4a, y = PIER_TOP - 0.125;
  // walkway
  const len = s1 - s0, [mx, mz] = P((s0 + s1) / 2);
  kit.box(mx, y, mz, PIER_W, 0.25, len, wood, { yaw: d.yaw });
  // land ramp if the shore at the start is low
  const g0 = at(s0 - 0.5);
  if (PIER_TOP - g0 > 0.35) { const [rx, rz] = P(s0 - 3); kit.wedge(rx, g0, rz, PIER_W, 6, PIER_TOP - g0, wood, { yaw: d.yaw }); }
  for (let s = s0 + 2; s < s1; s += 5) for (const l of [-1, 1]) {
    const [px, pz] = P(s, l * (PIER_W / 2 - 0.15)), gy = Math.max(meshHeight(px, pz), -9);
    if (PIER_TOP - gy > 0.6) kit.cyl(px, (PIER_TOP + gy) / 2 - 0.2, pz, 0.2, PIER_TOP - gy - 0.2, post, { seg: 8 });
    kit.cyl(px, PIER_TOP + 0.5, pz, 0.07, 1.0, post, { collide: false, seg: 6 });
  }
  for (const l of [-1, 1]) { const [rx, rz] = P((s0 + s1 - HEAD_D) / 2, l * (PIER_W / 2 - 0.15)); kit.box(rx, PIER_TOP + 0.95, rz, 0.1, 0.12, len - HEAD_D, post, { yaw: d.yaw }); }
  // T head, parallel to the coast
  const [hx, hz] = P(s1 - HEAD_D / 2);
  kit.box(hx, y, hz, HEAD_L, 0.25, HEAD_D, wood, { yaw: d.yaw });
  for (const l of [-HEAD_L / 2 + 1, -5, 5, HEAD_L / 2 - 1]) for (const e of [s1 - HEAD_D + 0.4, s1 - 0.4]) {
    const [px, pz] = P(e, l), gy = Math.max(meshHeight(px, pz), -9);
    kit.cyl(px, (PIER_TOP + gy) / 2 - 0.2, pz, 0.24, PIER_TOP - gy - 0.2, post, { seg: 8 });
  }
  // railing along the head's land side (either side of the walkway)
  for (const k of [-1, 1]) {
    const lm = k * (PIER_W / 2 + (HEAD_L / 2 - PIER_W / 2) / 2), [rx, rz] = P(s1 - HEAD_D + 0.1, lm);
    kit.box(rx, PIER_TOP + 0.5, rz, HEAD_L / 2 - PIER_W / 2, 1.0, 0.1, post, { yaw: d.yaw });
  }
  // bollards along the berth edge, a lamp and the framed FERRY sign at the head
  for (const l of [-13, -8.5, 8.5, 13]) { const [bx, bz] = P(s1 - 0.4, l); kit.cyl(bx, PIER_TOP + 0.25, bz, 0.18, 0.5, 0x333a44, { seg: 8 }); }
  { const [lx, lz] = P(s1 - HEAD_D + 0.5, HEAD_L / 2 - 1.2); kit.lamp(lx, lz, PIER_TOP); }
  {
    const [sx, sz] = P(s1 - HEAD_D + 0.6, -HEAD_L / 2 + 4), face = d.yaw + Math.PI; // reads from the walkway
    for (const k of [-1, 1]) kit.cyl(sx + tx * k * 2.1, PIER_TOP + 1.4, sz + tz * k * 2.1, 0.1, 2.8, 0x2a62c9, { seg: 8 });
    kit.box(sx + dx * 0.06, PIER_TOP + 2.35, sz + dz * 0.06, 4.3, 1.3, 0.12, 0x2a62c9, { yaw: face });
    const sign = signMesh('FERRY', 4, '#2a62c9', '#ffffff');
    sign.position.set(sx - dx * 0.02, PIER_TOP + 2.35, sz - dz * 0.02); sign.rotation.y = face;
    game.scene.add(sign);
  }
  // berth: hull centre beside the head, ferry heading along the coast (dir +1 = +t)
  const off = HEAD_D / 2 + GAP + FERRY.W / 2;
  const [bx, bz] = P(s1 - HEAD_D / 2 + off);
  d.pier = { s0, s1, start: P(s0), head: [hx, hz] };
  d.berth = { x: bx, z: bz, tx, tz, out: [dx, dz] };
  DOCKS.set(d.id, d);
  return d;
}

// ---- routes ---------------------------------------------------------------------
// stops: [dockId, dir]; at a berth the ferry faces along the coast: dir +1 is the
// direction (dz, -dx) for a dock pointing out to sea along (dx, dz) (i.e. the
// coast on the ferry's right... e.g. a south-facing dock: +1 = east), -1 the
// other way. waypoints[i] steer leg i (stop i -> stop i+1), [x, z] each.
// Check new routes with a probe: sample meshHeight under the hull along each leg.
export const ROUTES = [
  { name: 'Island Hopper', color: 0xff5a5a, stops: [['home_south', 1], ['cove', -1], ['jungle', 1]],
    waypoints: [[[60, 430], [300, 470]], [[800, 560], [840, 760], [730, 960], [400, 960], [-150, 930], [-300, 900]], [[-330, 640], [-260, 470], [-200, 395]]] },
  { name: 'Frostpeak Ferry', color: 0x3f8cff, stops: [['home_north', 1], ['snow', 1]],
    waypoints: [[[-260, -480], [-170, -620]], [[220, -640], [150, -470]]] },
  { name: 'Desert Ferry', color: 0xffc233, stops: [['home_west', -1], ['desert', -1]],
    waypoints: [[[-400, 60], [-600, -120]], [[-640, 180], [-420, 250]]] },
  { name: 'Fair Ferry', color: 0xe8742a, stops: [['home_ne', 1], ['fair', -1]],
    waypoints: [[[360, -470], [480, -640]], [[480, -720], [400, -420]]] },
];

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();

export class Ferry {
  constructor(game, route) {
    this.game = game;
    this.name = route.name;
    this.color = route.color ?? 0xff5a5a;
    this.stops = route.stops.map(([id, dir]) => ({ dock: DOCKS.get(id), dir }));
    if (this.stops.some((s) => !s.dock)) throw new Error('ferry ' + route.name + ': unknown dock');
    this.legs = this.stops.map((s, i) => this.makeLeg(s, this.stops[(i + 1) % this.stops.length], route.waypoints?.[i] || []));
    this.leg = 0; this.s = 0; this.v = 0;
    this.state = 'wait'; this.timer = FERRY.wait * 0.5;
    this.t = Math.random() * 10;
    this.pos = new THREE.Vector3(); this.yaw = 0; this.yawRate = 0;
    const p0 = this.legs[0].curve.getPointAt(0), t0 = this.legs[0].curve.getTangentAt(0);
    this.pos.set(p0.x, SEA_LEVEL, p0.z); this.yaw = Math.atan2(t0.x, t0.z);
    this.build();
    game.physics.animators.push((t, dt) => this.tick(dt));
    (game.ferries ||= []).push(this);
    // route on the map
    const pts = [];
    for (const l of this.legs) for (let u = 0; u <= 1.0001; u += 12 / l.length) { const p = l.curve.getPointAt(Math.min(1, u)); pts.push([p.x, p.z]); }
    (game.mapFeatures ||= []).push({ pts, w: 1.2, minPx: 1.5, color: 'rgba(255,255,255,.75)', dash: [8, 7] });
  }

  // Where the hull centre stops at a berth: shifted along the coast so the side
  // gate (FERRY.gateZ from the centre) lines up with the pier walkway.
  static berthAt(stop) {
    const B = stop.dock.berth, k = -FERRY.gateZ * stop.dir;
    return { x: B.x + B.tx * k, z: B.z + B.tz * k, tx: B.tx, tz: B.tz, out: B.out };
  }

  makeLeg(a, b, wps) {
    const A = Ferry.berthAt(a), B = Ferry.berthAt(b);
    const ha = [A.tx * a.dir, A.tz * a.dir], hb = [B.tx * b.dir, B.tz * b.dir];
    const pts = [[A.x, A.z], [A.x + ha[0] * 45 + A.out[0] * 6, A.z + ha[1] * 45 + A.out[1] * 6], [A.x + ha[0] * 90 + A.out[0] * 30, A.z + ha[1] * 90 + A.out[1] * 30],
      ...wps, [B.x - hb[0] * 90 + B.out[0] * 30, B.z - hb[1] * 90 + B.out[1] * 30], [B.x - hb[0] * 45 + B.out[0] * 6, B.z - hb[1] * 45 + B.out[1] * 6], [B.x, B.z]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    curve.arcLengthDivisions = 600;
    const length = curve.getLength();
    // speed limit from the curvature (gentle on whoever stands on deck), with braking ahead
    const N = Math.max(2, Math.ceil(length / 5)), cap = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const u0 = Math.max(0, (i * 5 - 6) / length), u1 = Math.min(1, (i * 5 + 6) / length);
      const t0 = curve.getTangentAt(u0), t1 = curve.getTangentAt(u1);
      const ang = Math.acos(Math.max(-1, Math.min(1, t0.x * t1.x + t0.z * t1.z))) || 1e-4;
      cap[i] = Math.min(FERRY.speed, Math.sqrt(FERRY.turnAcc * (u1 - u0) * length / ang));
    }
    for (let i = N - 1; i >= 0; i--) cap[i] = Math.min(cap[i], Math.sqrt(cap[i + 1] ** 2 + 2 * FERRY.accel * 5));
    return { curve, length, cap, to: b };
  }

  nextStop() { return this.legs[this.leg].to.dock; }

  // ---- body + look ------------------------------------------------------------------
  build() {
    const game = this.game, W = game.physics.world, F = FERRY, L = F.L, Wd = F.W, D = F.deck;
    const body = this.body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z));
    const cols = this.colliders = [];
    const add = (desc) => { desc.setCollisionGroups(VEH_GROUPS).setFriction(1.0); const c = W.createCollider(desc, body); cols.push(c); game.physics.handleOwner.set(c.handle, this); return c; };
    const C = RAPIER.ColliderDesc;
    // hull up to the deck
    add(C.cuboid(Wd / 2, (D + F.draft) / 2, L / 2).setTranslation(0, (D - F.draft) / 2, 0));
    // railings with a boarding gate on each side (open deck behind the seats), bow and stern rails
    const rh = 1.05, gate = 5, GZ = FERRY.gateZ;
    const SEGS = [[-L / 2 + 0.4, GZ - gate / 2], [GZ + gate / 2, L / 2 - 0.4]];
    for (const sx of [-1, 1]) for (const [z0, z1] of SEGS) add(C.cuboid(0.22, rh / 2, (z1 - z0) / 2).setTranslation(sx * (Wd / 2 - 0.22), D + rh / 2, (z0 + z1) / 2));
    for (const sz of [-1, 1]) add(C.cuboid(Wd / 2, rh / 2, 0.22).setTranslation(0, D + rh / 2, sz * (L / 2 - 0.22)));
    // gates: closed (chain + collider) while sailing, open at the docks
    this.gates = [-1, 1].map((sx) => add(C.cuboid(0.22, rh / 2, gate / 2).setTranslation(sx * (Wd / 2 - 0.22), D + rh / 2, GZ)));
    // covered seating: roof on posts
    const RZ = 5.5, RL = 10, RY = D + 2.7;
    add(C.cuboid(Wd / 2 - 0.4, 0.12, RL / 2).setTranslation(0, RY, RZ));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(C.cylinder(1.35, 0.1).setTranslation(sx * (Wd / 2 - 0.6), D + 1.35, RZ + sz * (RL / 2 - 0.3)));
    add(C.cylinder(1.3, 0.68).setTranslation(0, D + 1.3, -L / 2 + 4)); // funnel
    // benches: 3 rows x 2, facing forward (+z)
    this.seats = [];
    for (const bz of [RZ - 3, RZ, RZ + 3]) for (const sx of [-1, 1]) {
      const bx = sx * 1.55;
      add(C.cuboid(1.0, 0.26, 0.28).setTranslation(bx, D + 0.26, bz));
      add(C.cuboid(1.0, 0.3, 0.05).setTranslation(bx, D + 0.82, bz - 0.27));
      for (const lx of [-0.45, 0.45]) {
        const seat = { body, pos: [bx + lx, D + 0.71, bz + 0.02], yaw: 0, kind: 'passenger', label: 'Sit', hint: 'All aboard! · Y Get up', exit: [bx + lx, D + 0.75, bz + 0.95], occupant: null, ferry: this };
        this.seats.push(seat); game.seats.push(seat);
      }
    }
    // mesh
    const b = new Builder(), c = this.color, white = 0xf6f6f2, wood = 0xc8975f, dark = 0x2a2f3a;
    b.rbox(Wd, F.draft + D - 0.3, L, 0.5, white, [0, (D - F.draft) / 2 - 0.15, 0]);
    b.rbox(Wd + 0.08, 0.7, L + 0.08, 0.3, c, [0, -0.25, 0]);                  // waterline stripe
    b.cone(Wd / 2, 4, white, [0, D / 2 - 0.4, L / 2 + 1.5], [Math.PI / 2, 0, 0], 4); // bow
    b.box(Wd - 0.3, 0.12, L - 0.3, wood, [0, D - 0.04, 0]);                     // deck planks
    for (let z = -L / 2 + 1; z < L / 2; z += 1.2) b.box(Wd - 0.35, 0.01, 0.04, 0x9a7048, [0, D + 0.025, z]);
    for (const sx of [-1, 1]) for (const [z0, z1] of SEGS) {
      const zc = (z0 + z1) / 2, seg = z1 - z0;
      b.box(0.1, 0.1, seg, c, [sx * (Wd / 2 - 0.1), D + rh, zc]);
      b.box(0.06, 0.06, seg, white, [sx * (Wd / 2 - 0.1), D + rh * 0.5, zc]);
      for (let k = 0; k <= seg; k += 1.5) b.box(0.07, rh, 0.07, white, [sx * (Wd / 2 - 0.1), D + rh / 2, zc - seg / 2 + k]);
    }
    for (const sz of [-1, 1]) b.box(Wd, 0.1, 0.1, c, [0, D + rh, sz * (L / 2 - 0.1)]);
    b.box(Wd - 0.6, 0.24, RL, c, [0, RY, RZ]);                                   // roof
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.1, 0.1, 2.7, white, [sx * (Wd / 2 - 0.6), D + 1.35, RZ + sz * (RL / 2 - 0.3)], null, 8);
    for (const bz of [RZ - 3, RZ, RZ + 3]) for (const sx of [-1, 1]) {
      b.rbox(2.0, 0.12, 0.55, 0.04, 0x3f8cff, [sx * 1.55, D + 0.5, bz]);
      b.rbox(2.0, 0.55, 0.1, 0.04, 0x3f8cff, [sx * 1.55, D + 0.85, bz - 0.27]);
      b.box(1.8, 0.45, 0.4, dark, [sx * 1.55, D + 0.22, bz]);
    }
    // wheelhouse on the roof, funnel, mast and flag, life rings
    b.rbox(3.2, 1.8, 2.6, 0.15, white, [0, RY + 1.0, RZ + 2.4]);
    b.box(3.25, 0.7, 2.65, 0x8fcfff, [0, RY + 1.3, RZ + 2.4]);
    b.rbox(3.5, 0.2, 2.9, 0.08, c, [0, RY + 2.0, RZ + 2.4]);
    b.cyl(0.6, 0.7, 2.6, c, [0, D + 1.3, -L / 2 + 4], null, 12);
    b.cyl(0.62, 0.62, 0.5, dark, [0, D + 2.7, -L / 2 + 4], null, 12);
    b.cyl(0.05, 0.05, 3, 0x888888, [0, RY + 2.9, RZ - 1]);
    b.box(0.03, 0.7, 1.1, 0xffd23f, [0, RY + 4.0, RZ - 1.6]);
    for (const sx of [-1, 1]) for (const z of [-6, 8]) b.torus(0.35, 0.09, 0xff5a3a, [sx * (Wd / 2 + 0.02), D - 0.3, z], [0, Math.PI / 2, 0], 12);
    const mesh = this.mesh = b.mesh(matVC);
    const gb = new Builder();
    for (const sx of [-1, 1]) for (const y of [0.55, 1.0]) gb.box(0.05, 0.05, gate, 0xffd23f, [sx * (Wd / 2 - 0.1), D + y, GZ]);
    this.gateMesh = gb.mesh(matVC);
    mesh.add(this.gateMesh);
    this.setGates(false);
    for (const sx of [-1, 1]) {
      const s = signMesh(this.name.toUpperCase(), 5, '#ffffff', '#2a3550');
      s.position.set(sx * (Wd / 2 + 0.03), D - 0.65, -2); s.rotation.y = sx * Math.PI / 2;
      mesh.add(s);
    }
    mesh.castShadow = true; mesh.userData.noCull = true;
    game.scene.add(mesh);
    game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  }

  setGates(closed) {
    for (const c of this.gates) c.setCollisionGroups(closed ? VEH_GROUPS : 0); // (toggling setEnabled on a moving kinematic body misbehaves)
    if (this.gateMesh) this.gateMesh.visible = closed;
    this.gatesClosed = closed;
  }

  // ---- motion ------------------------------------------------------------------------
  tick(dt) {
    const F = FERRY;
    this.t += dt;
    const leg = this.legs[this.leg];
    if (this.state === 'wait') {
      this.timer -= dt;
      if (this.timer < 3 && !this.tooted) { this.tooted = true; this.horn(); this.announce(`Ferry to ${leg.to.dock.name} departing!`); }
      if (this.timer < 1.5 && !this.gatesClosed) this.setGates(true);
      if (this.timer <= 0) { this.state = 'sail'; this.s = 0; this.v = 0; this.tooted = false; }
    } else {
      const rem = leg.length - this.s;
      const ci = Math.min(leg.cap.length - 1, Math.round(this.s / 5));
      this.v = Math.min(this.v + F.accel * dt, F.speed, leg.cap[ci] + 0.15, Math.sqrt(2 * F.accel * Math.max(0, rem)) + 0.25);
      this.s = Math.min(leg.length, this.s + this.v * dt);
      if (rem < 0.05) {
        this.state = 'wait'; this.timer = F.wait; this.v = 0; this.s = leg.length;
        this.setGates(false);
        const arrived = leg.to.dock;
        this.horn(0.6);
        this.announce(`Arriving at ${arrived.name}`, true);
        this.leg = (this.leg + 1) % this.legs.length;
        this.s = 0;
      }
    }
    const L2 = this.legs[this.leg], u = Math.min(1, this.s / L2.length);
    const p = L2.curve.getPointAt(u), tg = L2.curve.getTangentAt(u);
    // heading follows the path, turning at most MAX_TURN rad/s (no flinging at kinks)
    let dy = Math.atan2(tg.x, tg.z) - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    dy = Math.max(-MAX_TURN * dt, Math.min(MAX_TURN * dt, dy));
    this.yawRate += (dy / dt - this.yawRate) * Math.min(1, dt * 3);
    this.yaw += dy;
    this.pos.set(p.x, SEA_LEVEL + 0.06 * Math.sin(this.t * 0.9) + 0.03 * Math.sin(this.t * 1.7 + 1), p.z);
    // gentle roll / pitch, leaning out of turns
    const roll = 0.012 * Math.sin(this.t * 0.7) - this.yawRate * this.v * 0.004, pitch = 0.008 * Math.sin(this.t * 0.53 + 2);
    _q.setFromEuler(_e.set(pitch, this.yaw, roll, 'YXZ'));
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
  }

  // Is this player aboard (standing on the deck or sitting on a bench)?
  aboard(p) { return p.groundBody === this.body || p.seat?.ferry === this; }

  announce(text, onlyAboard = false) {
    const g = this.game;
    const near = g.players.some((p) => this.aboard(p) || (!onlyAboard && p.chest && _v.copy(p.chest.translation()).distanceTo(this.pos) < 45));
    if (near) g.ui?.toast(text);
  }

  horn(k = 1) {
    const a = this.game.audio;
    if (!a?.ctx || a.ctx.state !== 'running') return;
    const v = (a.gainAt ? a.gainAt(this.pos) : 1) * k;
    if (v < 0.02) return;
    for (const f of [98, 123]) a.tone('sawtooth', f, f * 0.98, 1.4, 0.07 * v, 0);
  }
}

export function buildFerries(game, kit) {
  for (const r of REGIONS) for (const d of r.docks || []) buildDock(game, kit, d);
  for (const route of ROUTES) new Ferry(game, route);
}
