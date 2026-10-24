// The wobbly character: an active ragdoll of 11 rigid bodies held upright by
// "magic" balance forces (a hover spring under the hips and world-space
// upright torques on hips and chest) while every joint is driven toward an
// animated pose by PD torques. Turning the forces down makes it go limp.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { DT, ALL, groups, playerBit, G_VEH, HATS, PLAYER_COLORS } from './config.js';
import { Builder, faceMaterials, matVC } from './mesh.js';

export const S = 0.8; // overall character scale
const UP = new THREE.Vector3(0, 1, 0);

// Rest pose, standing on y = 0, facing +Z. Left is +X.
const PARTS = [
  { n: 'hips', shape: 'ball', r: 0.22, pos: [0, 0.6, 0], m: 9 },
  { n: 'chest', parent: 'hips', shape: 'cap', r: 0.27, hh: 0.1, pos: [0, 0.93, 0], joint: [0, 0.72, 0], m: 13 },
  { n: 'head', parent: 'chest', shape: 'ball', r: 0.28, pos: [0, 1.52, 0], joint: [0, 1.24, 0], m: 4 },
  { n: 'uArmL', parent: 'chest', shape: 'cap', r: 0.07, hh: 0.06, pos: [0.34, 0.99, 0], joint: [0.34, 1.12, 0], m: 1.4 },
  { n: 'lArmL', parent: 'uArmL', shape: 'cap', r: 0.065, hh: 0.05, pos: [0.34, 0.745, 0], joint: [0.34, 0.86, 0], m: 1.1, hand: true },
  { n: 'uArmR', parent: 'chest', shape: 'cap', r: 0.07, hh: 0.06, pos: [-0.34, 0.99, 0], joint: [-0.34, 1.12, 0], m: 1.4 },
  { n: 'lArmR', parent: 'uArmR', shape: 'cap', r: 0.065, hh: 0.05, pos: [-0.34, 0.745, 0], joint: [-0.34, 0.86, 0], m: 1.1, hand: true },
  { n: 'uLegL', parent: 'hips', shape: 'cap', r: 0.085, hh: 0.035, pos: [0.12, 0.36, 0], joint: [0.12, 0.48, 0], m: 3 },
  { n: 'lLegL', parent: 'uLegL', shape: 'cap', r: 0.085, hh: 0.035, pos: [0.12, 0.12, 0], joint: [0.12, 0.24, 0], m: 2.4, foot: true },
  { n: 'uLegR', parent: 'hips', shape: 'cap', r: 0.085, hh: 0.035, pos: [-0.12, 0.36, 0], joint: [-0.12, 0.48, 0], m: 3 },
  { n: 'lLegR', parent: 'uLegR', shape: 'cap', r: 0.085, hh: 0.035, pos: [-0.12, 0.12, 0], joint: [-0.12, 0.24, 0], m: 2.4, foot: true },
];
const HAND_OFF = -0.13 * S;   // hand centre below the lower-arm centre
const HAND_R = 0.1 * S;
const STAND_H = 0.62 * S;     // hover height of the hips centre above ground
const RAY_LEN = 1.05 * S;

const WALK = 3.4, RUN = 6.2, SWIM = 2.6, JUMP_V = 5.6;

// scratch
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qd = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
const _e = new THREE.Euler();
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const qeul = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
const toQ = (r, q = _qa) => q.set(r.x, r.y, r.z, r.w);
const toV = (r, v = _va) => v.set(r.x, r.y, r.z);

// Error rotation (as a scaled axis) that turns q into target.
function rotError(target, q, out) {
  _qd.copy(target).multiply(_qc.copy(q).invert());
  if (_qd.w < 0) { _qd.x = -_qd.x; _qd.y = -_qd.y; _qd.z = -_qd.z; _qd.w = -_qd.w; }
  const w = Math.min(1, _qd.w), ang = 2 * Math.acos(w), s = Math.sqrt(1 - w * w);
  if (s < 1e-5) return out.set(0, 0, 0);
  return out.set(_qd.x / s, _qd.y / s, _qd.z / s).multiplyScalar(ang);
}

export class Player {
  constructor(game, index, deviceId) {
    this.game = game;
    this.physics = game.physics;
    this.world = game.physics.world;
    this.index = index;
    this.deviceId = deviceId;
    this.colorIndex = index % PLAYER_COLORS.length;
    this.color = PLAYER_COLORS[this.colorIndex];
    this.hat = index % HATS.length === 0 ? 1 : index % HATS.length;
    this.bit = playerBit(index);
    this.groupsNormal = groups(this.bit, ALL & ~this.bit);
    this.groupsSeated = groups(this.bit, ALL & ~this.bit & ~G_VEH);
    this.queryGroups = groups(ALL, ALL & ~this.bit);
    this.yaw = 0;
    this.state = 'normal'; // normal | limp | seated
    this.limpTimer = 0;    // >0: knocked out (auto recover)
    this.recover = 1;      // 0..1 ramp after limp
    this.phase = 0;
    this.grounded = false;
    this.groundBody = null;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.swimming = false;
    this.hands = { L: { joint: null, body: null, cool: 0 }, R: { joint: null, body: null, cool: 0 } };
    this.punch = { t: 0, hand: 'L', hit: false };
    this.seat = null;
    this.seatJoint = null;
    this.jumpCool = 0;
    this.airTime = 0;
    this.prevChestVel = new THREE.Vector3();
    this.impactGrace = 0;
    this.cam = null;
    this.lastInput = null;
    this.parts = {};
    this.bodies = [];
    this.build();
  }

  build() {
    const scene = this.game.scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    for (const p of PARTS) {
      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.pos[0] * S, p.pos[1] * S + 2, p.pos[2] * S)
        .setLinearDamping(0.05).setAngularDamping(1.5).setCanSleep(false);
      if (p.n === 'hips' || p.n === 'chest') bd.setCcdEnabled(true);
      const body = this.world.createRigidBody(bd);
      const cd = p.shape === 'ball' ? RAPIER.ColliderDesc.ball(p.r * S) : RAPIER.ColliderDesc.capsule(p.hh * S, p.r * S);
      cd.setMass(p.m).setFriction(p.foot ? 0.15 : 0.6).setRestitution(0.05).setCollisionGroups(this.groupsNormal)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1500);
      const cols = [this.world.createCollider(cd, body)];
      if (p.hand) {
        const hd = RAPIER.ColliderDesc.ball(HAND_R).setTranslation(0, HAND_OFF, 0).setMass(0.4).setFriction(1.0).setCollisionGroups(this.groupsNormal);
        cols.push(this.world.createCollider(hd, body));
      }
      for (const c of cols) this.physics.handleOwner.set(c.handle, this);
      const part = { def: p, body, cols, mesh: this.partMesh(p), target: new THREE.Quaternion(), kp: 0, kd: 0, maxT: 1e9, rec: this.physics.track(body),
        rest: new THREE.Vector3(p.pos[0] * S, p.pos[1] * S, p.pos[2] * S) };
      const I = body.principalInertia();
      part.I = (I.x + I.y + I.z) / 3;
      this.group.add(part.mesh);
      this.parts[p.n] = part;
      this.bodies.push(body);
    }
    for (const p of PARTS) {
      if (!p.parent) continue;
      const a = this.parts[p.parent], b = this.parts[p.n];
      const j = p.joint.map((v) => v * S);
      const pa = a.def.pos.map((v) => v * S), pb = p.pos.map((v) => v * S);
      const data = RAPIER.JointData.spherical(
        { x: j[0] - pa[0], y: j[1] - pa[1], z: j[2] - pa[2] },
        { x: j[0] - pb[0], y: j[1] - pb[1], z: j[2] - pb[2] });
      b.joint = this.world.createImpulseJoint(data, a.body, b.body, true);
      b.joint.setContactsEnabled(false);
      b.parent = a;
    }
    this.totalMass = PARTS.reduce((s, p) => s + p.m, 0) + 0.8;
    // Effective inertia each joint has to swing: the whole limb below it,
    // about the joint. Twist about the bone axis only sees the part itself.
    const kids = (n) => PARTS.filter((q) => q.parent === n).flatMap((q) => [q.n, ...kids(q.n)]);
    for (const p of PARTS) {
      if (!p.parent) continue;
      const part = this.parts[p.n];
      const J = new THREE.Vector3(p.joint[0] * S, p.joint[1] * S + 2, p.joint[2] * S);
      const b = part.body, c = b.worldCom(), I = b.principalInertia();
      part.Iswing = (I.x + I.z) / 2 + b.mass() * J.distanceToSquared(new THREE.Vector3(c.x, c.y, c.z)) * 0.25;
      part.Itwist = I.y;
      part.sub = [p.n, ...kids(p.n)].map((n) => this.parts[n]);
      part.anchor = new THREE.Vector3(p.joint[0] - p.pos[0], p.joint[1] - p.pos[1], p.joint[2] - p.pos[2]).multiplyScalar(S);
    }
  }

  partMesh(p) {
    const b = new Builder();
    const shirt = this.color;
    const pants = new THREE.Color(this.color).multiplyScalar(0.55).getHex();
    const skin = 0xffd9b8;
    const shoe = 0x3a3340;
    let mat = matVC;
    const g = new THREE.Group();
    if (p.n === 'hips') {
      b.sphere(0.235 * S, pants, [0, 0, 0], [1, 0.9, 0.95], 16);
      b.box(0.2 * S, 0.05 * S, 0.1 * S, 0x2b2b2b, [0, 0.12 * S, 0.17 * S]);
    } else if (p.n === 'chest') {
      b.capsule(0.27 * S, 0.24 * S, shirt, [0, 0, 0]);
      b.sphere(0.06 * S, 0xffffff, [0, 0.03 * S, 0.255 * S], [1, 1, 0.4]);
      b.sphere(0.04 * S, 0xffffff, [0, -0.12 * S, 0.25 * S], [1, 1, 0.4]);
    } else if (p.n === 'head') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28 * S, 24, 18), faceMaterials().normal);
      m.castShadow = true;
      this.headMesh = m;
      g.add(m);
      this.hatMesh = new THREE.Group();
      g.add(this.hatMesh);
      this.buildHat();
      return g;
    } else if (p.n.startsWith('uArm')) {
      b.capsule(0.075 * S, 0.12 * S, shirt, [0, 0, 0]);
    } else if (p.n.startsWith('lArm')) {
      b.capsule(0.065 * S, 0.1 * S, skin, [0, 0, 0]);
      b.sphere(HAND_R * 1.05, 0xffffff, [0, HAND_OFF, 0], [1, 1.05, 0.9]);
      b.sphere(0.045 * S, 0xffffff, [p.n.endsWith('L') ? -0.06 * S : 0.06 * S, HAND_OFF + 0.03 * S, 0.04 * S]);
    } else if (p.n.startsWith('uLeg')) {
      b.capsule(0.09 * S, 0.1 * S, pants, [0, 0, 0]);
    } else if (p.n.startsWith('lLeg')) {
      b.capsule(0.085 * S, 0.08 * S, pants, [0, 0.02 * S, 0]);
      b.sphere(0.1 * S, shoe, [0, -0.08 * S, 0.05 * S], [1, 0.7, 1.45]);
    }
    const m = b.mesh(mat);
    g.add(m);
    return g;
  }

  buildHat() {
    const hm = this.hatMesh;
    while (hm.children.length) { const c = hm.children.pop(); c.geometry?.dispose(); }
    const kind = HATS[this.hat];
    if (kind === 'none') return;
    const b = new Builder(), R = 0.28 * S, c = this.color;
    const dark = new THREE.Color(c).multiplyScalar(0.6).getHex();
    if (kind === 'cap') {
      b.sphere(R * 1.02, c, [0, R * 0.35, 0], [1, 0.62, 1], 16);
      b.cyl(R * 0.75, R * 0.75, 0.02, dark, [0, R * 0.42, R * 0.55], [0.2, 0, 0], 16);
    } else if (kind === 'tophat') {
      b.cyl(R * 0.9, R * 0.9, 0.03, 0x222222, [0, R * 0.8, 0], null, 18);
      b.cyl(R * 0.58, R * 0.6, R * 0.95, 0x222222, [0, R * 1.3, 0], null, 18);
      b.cyl(R * 0.61, R * 0.61, R * 0.18, c, [0, R * 0.95, 0], null, 18);
    } else if (kind === 'beanie') {
      b.sphere(R * 1.04, c, [0, R * 0.3, 0], [1, 0.7, 1], 16);
      b.sphere(R * 0.25, 0xffffff, [0, R * 1.05, 0]);
    } else if (kind === 'crown') {
      b.cyl(R * 0.6, R * 0.55, R * 0.4, 0xffd23f, [0, R * 1.0, 0], null, 10);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.cone(R * 0.12, R * 0.3, 0xffd23f, [Math.sin(a) * R * 0.55, R * 1.32, Math.cos(a) * R * 0.55]); }
      b.sphere(R * 0.09, 0xff3355, [0, R * 1.0, R * 0.6]);
    } else if (kind === 'party') {
      b.cone(R * 0.45, R * 1.1, c, [0, R * 1.35, 0], [-0.1, 0, 0]);
      b.sphere(R * 0.14, 0xffffff, [0, R * 1.93, -0.04]);
    } else if (kind === 'cowboy') {
      b.cyl(R * 1.35, R * 1.35, 0.03, 0x9a6232, [0, R * 0.7, 0], null, 20);
      b.cyl(R * 0.6, R * 0.68, R * 0.6, 0x9a6232, [0, R * 1.0, 0], null, 16);
      b.cyl(R * 0.69, R * 0.69, R * 0.12, 0x4a2a12, [0, R * 0.8, 0], null, 16);
    } else if (kind === 'bucket') {
      b.cyl(R * 0.78, R * 1.05, R * 0.55, c, [0, R * 0.75, 0], null, 18);
      b.cyl(R * 1.25, R * 1.25, 0.02, c, [0, R * 0.5, 0], null, 18);
    }
    hm.add(b.mesh());
  }

  setColor(ci) {
    this.colorIndex = (ci + PLAYER_COLORS.length) % PLAYER_COLORS.length;
    this.color = PLAYER_COLORS[this.colorIndex];
    for (const n in this.parts) {
      const part = this.parts[n];
      if (n === 'head') { this.buildHat(); continue; }
      this.group.remove(part.mesh);
      part.mesh = this.partMesh(part.def);
      this.group.add(part.mesh);
    }
    this.game.ui?.refreshTags();
  }

  // ---- helpers ----------------------------------------------------------
  pos() { return this.parts.chest.body.translation(); }
  get chest() { return this.parts.chest.body; }
  get hips() { return this.parts.hips.body; }

  setGroups(g) {
    for (const n in this.parts) for (const c of this.parts[n].cols) c.setCollisionGroups(g);
  }

  // Places the ragdoll in its rest pose at a position (feet) and facing.
  teleport(x, y, z, yaw = this.yaw) {
    this.yaw = yaw;
    _qa.setFromAxisAngle(UP, yaw);
    const rot = { x: _qa.x, y: _qa.y, z: _qa.z, w: _qa.w };
    for (const n in this.parts) {
      const p = this.parts[n];
      _vb.copy(p.rest).applyQuaternion(_qa);
      p.body.setTranslation({ x: x + _vb.x, y: y + _vb.y, z: z + _vb.z }, true);
      p.body.setRotation(rot, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      p.rec.snap = true;
    }
    this.prevChestVel.set(0, 0, 0);
    this.impactGrace = 0.3;
  }

  setVelocity(v) {
    for (const b of this.bodies) b.setLinvel(v, true);
  }

  knockOut(t) {
    if (this.state === 'seated') return;
    this.releaseAll();
    this.state = 'limp';
    this.limpTimer = Math.max(this.limpTimer, t);
    this.headMesh.material = faceMaterials().ko;
    this.game.audio?.play('ko', this.pos());
  }

  wake() {
    this.state = 'normal';
    this.limpTimer = 0;
    this.recover = 0;
    this.headMesh.material = faceMaterials().normal;
  }

  releaseHand(h) {
    const hand = this.hands[h];
    if (hand.joint) {
      if (hand.joint.isValid()) this.world.removeImpulseJoint(hand.joint, true);
      hand.joint = null; hand.body = null;
    }
  }
  releaseAll() { this.releaseHand('L'); this.releaseHand('R'); }

  handPos(h, out) {
    const b = this.parts['lArm' + h].body;
    toQ(b.rotation(), _qb);
    out.set(0, HAND_OFF, 0).applyQuaternion(_qb).add(toV(b.translation(), _vc));
    return out;
  }

  // ---- seats ------------------------------------------------------------
  sitIn(seat) {
    this.releaseAll();
    if (this.state === 'limp') this.wake();
    this.seat = seat;
    seat.occupant = this;
    this.state = 'seated';
    this.setGroups(this.groupsSeated);
    // put hips at the seat, then lock them there
    const sb = seat.body;
    toQ(sb.rotation(), _qa);
    _e.setFromQuaternion(_qa.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, seat.yaw || 0)), 'YXZ');
    const p = _vb.set(seat.pos[0], seat.pos[1], seat.pos[2]).applyQuaternion(_qa).add(toV(sb.translation(), _vc));
    this.teleport(p.x, p.y - this.parts.hips.rest.y, p.z, _e.y);
    const lq = new THREE.Quaternion().setFromAxisAngle(UP, seat.yaw || 0);
    const data = RAPIER.JointData.fixed({ x: seat.pos[0], y: seat.pos[1], z: seat.pos[2] }, { x: lq.x, y: lq.y, z: lq.z, w: lq.w },
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    this.seatJoint = this.world.createImpulseJoint(data, sb, this.hips, true);
    this.game.audio?.play('seat', this.pos());
    seat.onEnter?.(this);
  }

  leaveSeat() {
    const seat = this.seat;
    if (!seat) return;
    if (this.seatJoint && this.seatJoint.isValid()) this.world.removeImpulseJoint(this.seatJoint, true);
    this.seatJoint = null;
    seat.occupant = null;
    this.seat = null;
    this.state = 'normal';
    this.recover = 0.4;
    this.setGroups(this.groupsNormal);
    const sb = seat.body;
    toQ(sb.rotation(), _qa);
    const ex = seat.exit || [seat.pos[0] + (seat.pos[0] >= 0 ? 1.2 : -1.2), seat.pos[1] + 0.3, seat.pos[2]];
    const p = seat.exitWorld ? _vb.set(seat.exitWorld.x, seat.exitWorld.y, seat.exitWorld.z)
      : _vb.set(ex[0], ex[1], ex[2]).applyQuaternion(_qa).add(toV(sb.translation(), _vc));
    // make sure we don't drop out under the ground
    const gy = this.game.groundHeight(p.x, p.z, p.y + 2);
    const y = Math.max(p.y - 0.3, gy + 0.05);
    const v = sb.linvel();
    this.teleport(p.x, y, p.z, this.yaw);
    this.setVelocity({ x: v.x * 0.8, y: v.y * 0.8 + 1, z: v.z * 0.8 });
    seat.onExit?.(this);
  }

  // ---- control ------------------------------------------------------------
  // Drives the joint `part` toward `target` (relative to its parent).
  drive(part, kp, kd, maxT = 1e9) {
    const b = part.body, pb = part.parent.body;
    toQ(pb.rotation(), _qa);
    _qb.copy(_qa).multiply(part.target);
    rotError(_qb, toQ(b.rotation(), _qc.clone()), _va);
    const w = b.angvel(), pw = pb.angvel();
    _vb.set(w.x - pw.x, w.y - pw.y, w.z - pw.z);
    // split into twist (about the bone) and swing
    const ax = _vc.set(0, 1, 0).applyQuaternion(toQ(b.rotation(), _qd));
    const et = _va.dot(ax), wt = _vb.dot(ax);
    _va.addScaledVector(ax, -et); _vb.addScaledVector(ax, -wt);
    // implicit PD: relative angular velocity we want after this step
    const sI = 1 / (1 + DT * kd);
    _va.multiplyScalar(DT * kp * sI).addScaledVector(_vb, sI - 1).multiplyScalar(part.Iswing)
      .addScaledVector(ax, ((wt + DT * kp * et) * sI - wt) * part.Itwist);
    const l = _va.length(), lim = maxT * DT;
    if (l > lim) _va.multiplyScalar(lim / l);
    b.applyTorqueImpulse({ x: _va.x, y: _va.y, z: _va.z }, true);
    pb.applyTorqueImpulse({ x: -_va.x, y: -_va.y, z: -_va.z }, true);
  }

  // Raised limbs float (their weight moves onto the torso) so the joint drives
  // only handle motion and can stay soft and stable. Hanging arms keep their
  // weight and swing like pendulums.
  gravityComp(limp) {
    const w = -9.81 * DT;
    let hipsW = 0, chestW = 0;
    for (const n in this.parts) {
      const p = this.parts[n];
      if (!p.parent) continue;
      const float = !limp && (p.float !== false);
      if (p.gs !== float) { p.gs = float; p.body.setGravityScale(float ? 0 : 1, true); }
      if (float) { if (n.includes('Leg')) hipsW += p.body.mass(); else chestW += p.body.mass(); }
    }
    if (hipsW) this.hips.applyImpulse({ x: 0, y: hipsW * w, z: 0 }, true);
    if (chestW) this.chest.applyImpulse({ x: 0, y: chestW * w, z: 0 }, true);
  }

  // World-space upright/facing torque on a root body.
  upright(body, target, kp, kd, I) {
    rotError(target, toQ(body.rotation(), _qc.clone()), _va);
    const w = body.angvel();
    _va.multiplyScalar(kp * I).addScaledVector(_vb.set(w.x, w.y, w.z), -kd * I).multiplyScalar(DT);
    body.applyTorqueImpulse({ x: _va.x, y: _va.y, z: _va.z }, true);
  }

  probeGround() {
    const hp = this.hips.translation();
    const ray = new RAPIER.Ray({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, RAY_LEN, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
    if (!hit) { this.grounded = false; this.groundBody = null; this.groundCollider = null; this.groundDist = 99; return; }
    this.groundDist = hit.timeOfImpact;
    this.grounded = hit.timeOfImpact < STAND_H + 0.2 * S;
    this.groundCollider = hit.collider;
    this.groundBody = hit.collider.parent();
    this.groundNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    this.groundPoint = { x: hp.x, y: hp.y - hit.timeOfImpact, z: hp.z };
  }

  groundVelocity(out) {
    out.set(0, 0, 0);
    const gb = this.groundBody;
    if (!gb || gb.isFixed()) return out;
    const v = gb.linvel(), w = gb.angvel(), c = gb.worldCom(), p = this.groundPoint;
    _vc.set(p.x - c.x, p.y - c.y, p.z - c.z);
    out.set(w.x, w.y, w.z).cross(_vc).add(_vb.set(v.x, v.y, v.z));
    return out;
  }

  // Called every physics step before world.step.
  step(inp, pressed) {
    const parts = this.parts;
    const chest = parts.chest.body, hips = parts.hips.body;
    this.jumpCool -= DT; this.impactGrace -= DT;
    this.hands.L.cool -= DT; this.hands.R.cool -= DT;
    if (this.punch.t > 0) this.punch.t -= DT;

    // --- state transitions
    if (this.state === 'limp') {
      if (this.limpTimer > 0) { this.limpTimer -= DT; if (this.limpTimer <= 0) this.wake(); }
      else if (pressed.ragdoll || pressed.jump) this.wake();
    } else if (this.state === 'normal' && pressed.ragdoll) {
      this.state = 'limp'; this.limpTimer = 0; this.releaseAll();
    }
    if (this.recover < 1) this.recover = Math.min(1, this.recover + DT * 1.6);

    const cam = this.cam;
    const camYaw = cam ? cam.yaw : this.yaw;
    // camera-relative stick: forward is away from camera
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let mx = inp.moveX, my = inp.moveY;
    const mvx = fx * my - fz * mx, mvz = fz * my + fx * mx;
    const mag = Math.min(1, Math.hypot(mx, my));

    const cp = chest.translation();
    this.probeGround();
    const water = this.physics.waterLevel(cp.x, cp.y, cp.z);
    // wading is not swimming: needs about a metre of water over the ground
    const floorY = this.groundDist < 50 ? this.hips.translation().y - this.groundDist : -1e9;
    const wasSwimming = this.swimming;
    this.swimming = water != null && cp.y < water + 0.05 && water - floorY > 0.85 && this.state !== 'seated';
    if (this.swimming && !wasSwimming && chest.linvel().y < -2) this.game.audio?.play('splash', cp, Math.min(1.5, -chest.linvel().y / 6));
    this.waterLevel = water;

    const limp = this.state === 'limp';
    const seated = this.state === 'seated';

    // --- grabbing
    if (!seated && !limp) this.updateHands(inp);

    // --- facing
    if (!limp && !seated && mag > 0.1) {
      const want = Math.atan2(mvx, mvz);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const rate = (this.grounded || this.swimming ? 9 : 4) * DT;
      this.yaw += Math.max(-rate, Math.min(rate, d));
    }
    if (seated) {
      toQ(this.seat.body.rotation(), _qa);
      _e.setFromQuaternion(_qa, 'YXZ');
      this.yaw = _e.y + (this.seat.yaw || 0);
    }

    // --- balance
    const v = hips.linvel();
    const gv = this.groundVelocity(new THREE.Vector3());
    const strength = limp ? 0 : this.recover;
    let lean = 0;
    const speed = this.swimming ? SWIM : (inp.sprint ? RUN : WALK);
    const hv = _vc.set(v.x - gv.x, 0, v.z - gv.z);
    const fwdSpeed = hv.x * Math.sin(this.yaw) + hv.z * Math.cos(this.yaw);
    if (!limp && !seated) lean = this.swimming ? (mag > 0.1 ? 1.15 : 0.5) : Math.max(-0.15, Math.min(0.3, fwdSpeed * 0.045));
    const hanging = !this.grounded && (this.hands.L.joint || this.hands.R.joint);

    if (!limp) {
      const yq = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw);
      const chestT = yq.clone().multiply(qx(lean));
      const hipsT = yq.clone().multiply(qx(lean * 0.4));
      const air = this.grounded || this.swimming || seated ? 1 : 0.55;
      const k = strength * air * (hanging ? 0.35 : 1);
      this.upright(chest, chestT, 260 * k, 26 * Math.sqrt(k), parts.chest.I * 4.5);
      this.upright(hips, hipsT, 200 * k, 22 * Math.sqrt(k), parts.hips.I * 4.5);
    }

    // --- limp bodies float: per-part buoyancy and water drag
    if (limp && water != null) {
      for (const n in parts) {
        const p = parts[n], b = p.body, t = b.translation();
        const r = p.def.r * S, depth = water - t.y;
        if (depth <= -r) continue;
        const k = Math.min(1, (depth + r) / (2 * r)), m = b.mass(), bv = b.linvel();
        const drag = Math.min(1, k * 2.5 * DT);
        b.applyImpulse({ x: -bv.x * m * drag, y: k * m * 9.81 * 1.3 * DT - bv.y * m * drag, z: -bv.z * m * drag }, true);
      }
    }

    // --- trampolines and bouncy castles
    if (this.grounded && !seated && this.groundCollider && this.jumpCool <= 0) {
      const bounce = this.physics.bouncy.get(this.groundCollider.handle);
      if (bounce && v.y < -1.2) {
        const up = Math.max(-v.y * 0.92, inp.jump ? bounce : bounce * 0.55);
        for (const b of this.bodies) { const bv = b.linvel(); b.applyImpulse({ x: 0, y: (up - bv.y) * b.mass(), z: 0 }, true); }
        this.jumpCool = 0.25;
        this.impactGrace = 0.3;
        this.game.audio?.play('boing', cp, Math.min(1, -v.y / 8));
      }
    }

    // --- hover spring / swimming lift
    if (!limp && !seated) {
      if (this.swimming) {
        const target = water - 0.12;
        const err = target - cp.y;
        const cv = chest.linvel();
        const a = Math.max(-5, Math.min(25, 40 * err - 6 * cv.y + 9.81));
        chest.applyImpulse({ x: 0, y: a * this.totalMass * DT * 0.75, z: 0 }, true);
        hips.applyImpulse({ x: 0, y: a * this.totalMass * DT * 0.25, z: 0 }, true);
      } else if (this.grounded && this.jumpCool <= 0) {
        const err = STAND_H - this.groundDist;
        const vy = v.y - gv.y;
        let a = 140 * err - 16 * vy + 9.81;
        a = Math.max(0, Math.min(45, a)) * strength;
        const imp = a * this.totalMass * DT;
        hips.applyImpulse({ x: 0, y: imp * 0.7, z: 0 }, true);
        chest.applyImpulse({ x: 0, y: imp * 0.3, z: 0 }, true);
        // equal and opposite push on whatever we stand on (boats, see-saws...)
        const gb = this.groundBody;
        if (gb && gb.isDynamic()) gb.applyImpulseAtPoint({ x: 0, y: -imp * 0.8, z: 0 }, this.groundPoint, true);
      }
    }

    // --- locomotion
    if (!limp && !seated) {
      const slippery = this.grounded && this.groundCollider && this.physics.slippery.has(this.groundCollider.handle);
      let ctrl = this.swimming ? 6 : this.grounded ? (slippery ? 0.6 : 14) : (hanging ? 1.5 : 6.0);
      const tvx = mvx * speed + gv.x, tvz = mvz * speed + gv.z;
      let dvx = (mag > 0.05 ? tvx : (this.grounded ? gv.x : v.x)) - v.x;
      let dvz = (mag > 0.05 ? tvz : (this.grounded ? gv.z : v.z)) - v.z;
      if (slippery) {
        // slide down the slope: tangential part of gravity
        const n = this.groundNormal;
        const gx = n.x * n.y * 9.81, gz = n.z * n.y * 9.81;
        hips.applyImpulse({ x: gx * this.totalMass * DT * 0.55, y: 0, z: gz * this.totalMass * DT * 0.55 }, true);
        chest.applyImpulse({ x: gx * this.totalMass * DT * 0.45, y: 0, z: gz * this.totalMass * DT * 0.45 }, true);
        if (mag < 0.05) { dvx = 0; dvz = 0; }
      }
      if (this.punch.t > 0.12 && mag < 0.05) { dvx = 0; dvz = 0; } // don't brake the lunge
      const maxDv = ctrl * DT * (this.grounded ? 1.6 : 1);
      const dl = Math.hypot(dvx, dvz);
      if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
      const M = this.totalMass * strength;
      hips.applyImpulse({ x: dvx * M * 0.55, y: 0, z: dvz * M * 0.55 }, true);
      chest.applyImpulse({ x: dvx * M * 0.45, y: 0, z: dvz * M * 0.45 }, true);

      // jump
      if (pressed.jump && this.jumpCool <= 0) {
        if (this.grounded || this.swimming) {
          const jv = this.swimming ? 4.2 : JUMP_V;
          for (const b of this.bodies) {
            const bv = b.linvel();
            b.applyImpulse({ x: 0, y: (gv.y + jv - bv.y) * b.mass(), z: 0 }, true);
          }
          this.jumpCool = 0.35;
          this.game.audio?.play('jump', cp);
        } else if (hanging) {
          // pull up and over the ledge
          this.releaseAll();
          this.hands.L.cool = this.hands.R.cool = 0.4;
          for (const b of this.bodies) b.applyImpulse({ x: Math.sin(this.yaw) * 2.5 * b.mass(), y: 6.5 * b.mass(), z: Math.cos(this.yaw) * 2.5 * b.mass() }, true);
          this.jumpCool = 0.35;
          this.game.audio?.play('jump', cp);
        }
      }
      if (pressed.punch && this.punch.t <= 0) {
        this.punch.hand = this.punch.hand === 'L' ? 'R' : 'L';
        if (inp.grabL > 0.5 && inp.grabR <= 0.5) this.punch.hand = 'R';
        if (inp.grabR > 0.5 && inp.grabL <= 0.5) this.punch.hand = 'L';
        this.punch.t = 0.32; this.punch.hit = false;
        const la = parts['lArm' + this.punch.hand].body;
        la.applyImpulse({ x: Math.sin(this.yaw) * 1.5, y: 0, z: Math.cos(this.yaw) * 1.5 }, true);
        // lunge into the punch
        const lv = this.grounded ? 2.2 : 1.0;
        chest.applyImpulse({ x: Math.sin(this.yaw) * lv * this.totalMass * 0.5, y: 0, z: Math.cos(this.yaw) * lv * this.totalMass * 0.5 }, true);
        hips.applyImpulse({ x: Math.sin(this.yaw) * lv * this.totalMass * 0.3, y: 0, z: Math.cos(this.yaw) * lv * this.totalMass * 0.3 }, true);
        this.game.audio?.play('swish', cp);
      }
    }
    if (this.punch.t > 0.08 && this.punch.t < 0.26 && !this.punch.hit && !limp) this.punchHit();

    // --- pose
    this.animate(inp, fwdSpeed, limp, seated, mag);
    const kLimb = limp ? 0.06 : strength * 0.85 + 0.15;
    this.gravityComp(limp);
    for (const n in parts) {
      const p = parts[n];
      if (!p.parent) continue;
      let kp = p.kp * kLimb, kd = p.kd * Math.sqrt(kLimb);
      if (limp) { kp = Math.max(kp, 4); kd = Math.max(kd, 1.2); }
      this.drive(p, kp, kd, p.maxT);
    }

    // --- impacts knock you out
    const cv = chest.linvel();
    _va.set(cv.x, cv.y, cv.z);
    const dv = _va.distanceTo(this.prevChestVel);
    this.prevChestVel.copy(_va);
    if (!seated && this.impactGrace <= 0 && dv > 9) this.knockOut(Math.min(4, 1.2 + (dv - 9) * 0.25));

    // respawn if lost
    if (cp.y < -25) this.respawn();
  }

  animate(inp, fwdSpeed, limp, seated, mag) {
    const P = this.parts;
    const set = (n, q, kp, kd, maxT = 1e9, float = true) => { const p = P[n]; p.target.copy(q); p.kp = kp; p.kd = kd; p.maxT = maxT; p.float = float; };
    const sp = Math.abs(fwdSpeed);
    if (this.grounded && !limp && !seated) this.phase += DT * (sp * 2.6 + (mag > 0.1 ? 1.5 : 0));
    else if (this.swimming) this.phase += DT * 5;
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    const amp = Math.min(1, sp / 4) * 0.75;
    const camPitch = this.cam ? this.cam.pitch : 0.2;

    // head bobbles on a soft spring
    set('head', qx(this.swimming ? -0.7 : 0), 70, 7);

    if (seated) {
      set('uLegL', qeul(-1.45, 0, 0.08), 120, 12); set('uLegR', qeul(-1.45, 0, -0.08), 120, 12);
      set('lLegL', qx(1.35), 100, 10); set('lLegR', qx(1.35), 100, 10);
      if (this.seat.kind === 'driver') {
        const st = (this.seat.vehicle?.steer || 0) * 0.5;
        set('uArmL', qeul(-1.15 - st * 0.3, 0, -0.25), 440, 22); set('uArmR', qeul(-1.15 + st * 0.3, 0, 0.25), 440, 22);
        set('lArmL', qeul(-0.35, 0, -0.35), 360, 18); set('lArmR', qeul(-0.35, 0, 0.35), 360, 18);
      } else {
        const up = inp.grabL > 0.5 || inp.grabR > 0.5;
        set('uArmL', up && inp.grabL > 0.5 ? qeul(-2.9, 0, 0.3) : qeul(-0.35, 0, 0.12), 360, 18);
        set('uArmR', up && inp.grabR > 0.5 ? qeul(-2.9, 0, -0.3) : qeul(-0.35, 0, -0.12), 360, 18);
        set('lArmL', qx(-0.4), 280, 14); set('lArmR', qx(-0.4), 280, 14);
      }
      return;
    }

    // legs
    if (this.swimming) {
      const k = Math.sin(ph * 2) * 0.45;
      set('uLegL', qx(-0.15 + k), 90, 9); set('uLegR', qx(-0.15 - k), 90, 9);
      set('lLegL', qx(0.3), 70, 7); set('lLegR', qx(0.3), 70, 7);
    } else if (this.grounded) {
      set('uLegL', qx(-s * amp * 1.1), 160, 14); set('uLegR', qx(s * amp * 1.1), 160, 14);
      set('lLegL', qx(Math.max(0, c) * amp * 1.4 + 0.05), 130, 12); set('lLegR', qx(Math.max(0, -c) * amp * 1.4 + 0.05), 130, 12);
    } else {
      // tucked, slightly flailing in the air
      const f = Math.sin(this.game.time * 9) * 0.25;
      set('uLegL', qx(-0.55 + f), 90, 9); set('uLegR', qx(-0.3 - f), 90, 9);
      set('lLegL', qx(0.9), 80, 8); set('lLegR', qx(0.6), 80, 8);
    }

    // arms
    const reach = -(Math.PI / 2 + 0.25 - camPitch * 0.9);
    for (const h of ['L', 'R']) {
      const sign = h === 'L' ? 1 : -1;
      const grab = (h === 'L' ? inp.grabL : inp.grabR) > 0.3 && !limp;
      const punching = this.punch.t > 0 && this.punch.hand === h && !limp;
      if (punching) {
        const ext = this.punch.t > 0.12;
        set('uArm' + h, qeul(ext ? -1.55 : -0.9, 0, -sign * 0.45), 1000, 30);
        set('lArm' + h, qx(ext ? -0.05 : -1.2), 800, 26);
      } else if (grab) {
        const held = this.hands[h].joint;
        set('uArm' + h, qeul(Math.max(-3.0, reach), 0, -sign * 0.12), held ? 660 : 540, 36, 600);
        set('lArm' + h, qx(-0.1), held ? 540 : 420, 30, 500);
      } else if (this.swimming) {
        const a = ph + (h === 'L' ? 0 : Math.PI);
        set('uArm' + h, qeul(-1.6 + Math.sin(a) * 1.1, 0, sign * (0.6 + Math.cos(a) * 0.5)), 480, 20);
        set('lArm' + h, qx(-0.3), 320, 16);
      } else if (this.grounded) {
        const sw = (h === 'L' ? s : -s) * amp * 0.9;
        set('uArm' + h, qeul(sw, 0, sign * 0.12), 200, 10, 1e9, false);
        set('lArm' + h, qx(-0.25 - Math.abs(sw) * 0.3), 160, 8, 1e9, false);
      } else {
        // flail
        const f = Math.sin(this.game.time * 11 + (h === 'L' ? 0 : 2)) * 0.5;
        set('uArm' + h, qeul(-0.6 + f, 0, sign * 1.2), 240, 12);
        set('lArm' + h, qx(-0.4), 180, 10);
      }
    }
  }

  updateHands(inp) {
    for (const h of ['L', 'R']) {
      const hand = this.hands[h];
      const want = (h === 'L' ? inp.grabL : inp.grabR) > 0.5;
      if (hand.joint && (!want || !hand.joint.isValid())) this.releaseHand(h);
      if (want && !hand.joint && hand.cool <= 0) {
        const hp = this.handPos(h, new THREE.Vector3());
        let found = null;
        this.world.intersectionsWithShape({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(HAND_R * 1.35),
          (col) => { found = col; return false; }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
        if (found) {
          const tb = found.parent();
          if (!tb) continue;
          // pull the grab point onto the surface
          const proj = found.projectPoint({ x: hp.x, y: hp.y, z: hp.z }, false);
          const gp = proj ? proj.point : hp;
          toQ(tb.rotation(), _qa).invert();
          const t = tb.translation();
          _vb.set(gp.x - t.x, gp.y - t.y, gp.z - t.z).applyQuaternion(_qa);
          const data = RAPIER.JointData.spherical({ x: 0, y: HAND_OFF, z: 0 }, { x: _vb.x, y: _vb.y, z: _vb.z });
          hand.joint = this.world.createImpulseJoint(data, this.parts['lArm' + h].body, tb, true);
          hand.joint.setContactsEnabled(false);
          hand.body = tb;
          hand.owner = this.physics.handleOwner.get(found.handle) || null;
          this.game.audio?.play('grab', hp);
          // grabbing another player's chest/head makes them easier to drag
        }
      }
    }
  }

  punchHit() {
    const h = this.punch.hand;
    const hp = this.handPos(h, new THREE.Vector3());
    hp.x += Math.sin(this.yaw) * 0.12; hp.z += Math.cos(this.yaw) * 0.12;
    let hit = null;
    this.world.intersectionsWithShape({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(HAND_R * 2.4),
      (col) => { hit = col; return false; }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_FIXED, this.queryGroups);
    if (!hit) return;
    this.punch.hit = true;
    const owner = this.physics.handleOwner.get(hit.handle);
    const dir = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const body = hit.parent();
    if (owner && owner instanceof Player) {
      if (owner.state !== 'seated') {
        for (const b of owner.bodies) b.applyImpulse({ x: dir.x * 4 * b.mass(), y: 2.2 * b.mass(), z: dir.z * 4 * b.mass() }, true);
        owner.knockOut(1.4);
        owner.impactGrace = 0.2;
      }
    } else if (body && body.isDynamic()) {
      const m = Math.min(body.mass(), 80);
      body.applyImpulseAtPoint({ x: dir.x * m * 4, y: m * 1.5, z: dir.z * m * 4 }, hp, true);
    }
    this.game.audio?.play('punch', hp);
  }

  respawn() {
    if (this.seat) this.leaveSeat();
    this.releaseAll();
    this.wake();
    const sp = this.game.spawnPoint(this.index);
    this.teleport(sp.x, sp.y, sp.z, sp.yaw);
  }

  sync() {
    for (const n in this.parts) { const p = this.parts[n]; this.physics.pose(p.rec, p.mesh); }
  }
  // Interpolated chest position (for cameras and tags).
  viewPos(out, part = 'chest') { return this.physics.ipos(this.parts[part].rec, out); }

  destroy() {
    if (this.seat) this.leaveSeat();
    this.releaseAll();
    for (const n in this.parts) {
      const p = this.parts[n];
      for (const c of p.cols) this.physics.handleOwner.delete(c.handle);
      this.physics.untrack(p.rec);
      this.world.removeRigidBody(p.body);
    }
    this.game.scene.remove(this.group);
  }
}
