// Active ragdoll: Rapier bodies + joints for one skeleton, with "muscles" that
// pull each part toward a target world orientation and a balance force that
// holds the pelvis up off the ground (the classic wobbly-battle-sim recipe).
import { THREE, clamp } from './util.js';
import { RAPIER, GROUPS } from './physics.js';
import { NPARTS, PART, forwardKinematics } from './body.js';

const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _yawQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _lim = new THREE.Vector3(), _ax = new THREE.Vector3();
const NECK_MAX = 0.75; // rad (~43 degrees): how far a head may lean from the chest's axis

export class Ragdoll {
  // restQuats: unit-frame orientations for the spawn pose (array of NPARTS)
  constructor(world, skel, groundPos, yaw, restQuats) {
    this.world = world;
    this.skel = skel;
    this.bodies = [];
    this.colliders = [];
    this.inertia = new Float32Array(NPARTS);
    this.axial = new Float32Array(NPARTS);
    this.pos = Array.from({ length: NPARTS }, () => new THREE.Vector3());
    this.quat = Array.from({ length: NPARTS }, () => new THREE.Quaternion());
    this.vel = Array.from({ length: NPARTS }, () => new THREE.Vector3());
    this.angvel = Array.from({ length: NPARTS }, () => new THREE.Vector3());

    _yawQ.setFromAxisAngle(UP, yaw);
    const quats = restQuats.map((q) => _yawQ.clone().multiply(q));
    const pelvisPos = new THREE.Vector3(0, skel.standHeight, 0);
    const local = Array.from({ length: NPARTS }, () => new THREE.Vector3());
    // FK in unit frame with unrotated quats, then rotate positions by yaw
    forwardKinematics(skel, pelvisPos, restQuats, local);
    for (let i = 0; i < NPARTS; i++) {
      const p = skel.parts[i];
      const wp = local[i].clone().applyQuaternion(_yawQ).add(groundPos);
      const q = quats[i];
      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(wp.x, wp.y, wp.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.15)
        .setAngularDamping(1.0)
        .setCcdEnabled(false);
      const body = world.createRigidBody(bd);
      const cd = (p.shape === 'ball' ? RAPIER.ColliderDesc.ball(p.r) : RAPIER.ColliderDesc.capsule(p.hh, p.r))
        .setMass(p.mass)
        .setFriction(p.limb ? 0.7 : 0.4)
        .setRestitution(0.05)
        .setCollisionGroups(p.limb ? GROUPS.limb : GROUPS.body);
      const col = world.createCollider(cd, body);
      this.bodies.push(body);
      this.colliders.push(col);
      const I = body.principalInertia();
      this.inertia[i] = (I.x + I.y + I.z) / 3;
      // inertia about the part's own long axis (local Y): a limb twisting about
      // itself is much lighter than one swinging about its joint
      this.axial[i] = (p.shape === 'ball' ? 0.4 : 0.5) * p.mass * p.r * p.r;
    }
    // Legs swing about their joint and drag the shin along, so their muscles work
    // against (part of) the inertia about the joint, not the part's own. Using all
    // of it makes the servo overshoot and buzz; 0.3 tracks well and stays calm.
    const P = PART, parts = skel.parts;
    const about = (i, d) => this.inertia[i] + parts[i].mass * d * d;
    for (const [up, lo] of [[P.thighL, P.shinL], [P.thighR, P.shinR]]) {
      const iu = about(up, parts[up].hh), il = about(lo, parts[lo].hh);
      this.inertia[up] = (iu + parts[lo].mass * (2 * parts[up].hh + parts[lo].hh) ** 2 * 0.6) * 0.3;
      this.inertia[lo] = il * 0.3;
    }
    // The head swings about the neck too: its muscle must work against the inertia
    // about the joint, or (a small head is a light ball on a long lever) it can't
    // hold itself up and flops into the chest.
    const jn = skel.parentJoint[P.head];
    if (jn) this.inertia[P.head] += parts[P.head].mass * jn.anchorB.lengthSq() * 0.7;
    this.joints = [];
    for (const j of skel.joints) {
      const a = { x: j.anchorA.x, y: j.anchorA.y, z: j.anchorA.z };
      const b = { x: j.anchorB.x, y: j.anchorB.y, z: j.anchorB.z };
      let data;
      if (j.type === 'knee' || j.type === 'elbow') data = RAPIER.JointData.revolute(a, b, { x: 1, y: 0, z: 0 });
      else data = RAPIER.JointData.spherical(a, b);
      // Revolute frames are relative to the bodies' frames at creation; bodies
      // were created already rotated, so the joint reference frames line up
      // because both bodies share the same rest rotation about X here.
      const joint = world.createImpulseJoint(data, this.bodies[j.a], this.bodies[j.b], true);
      joint.setContactsEnabled(false);
      if (j.type === 'knee') joint.setLimits(-0.05, 2.5);
      if (j.type === 'elbow') joint.setLimits(-2.6, 0.05);
      this.joints.push(joint);
    }
    this.read();
  }

  // Add a collider (a held weapon, a shield) to part i's body. The part's muscle
  // works against the combined inertia about its joint, so a heavy weapon is held
  // steadily but swings no faster than the arm's torque cap allows.
  // The parent part (the upper arm) has to swing the load too, so its muscle gets
  // the load's inertia about the shoulder as well.
  // loadK[i] scales part i's torque cap with its load (the unit is strong enough to
  // wield its weapon, but not by much: a heavy one still lags and overshoots).
  attach(i, colliderDesc, mass, at) {
    if (!this.inertia0) { this.inertia0 = Float32Array.from(this.inertia); this.loadK = new Float32Array(NPARTS).fill(1); }
    const col = this.world.createCollider(colliderDesc, this.bodies[i]);
    const b = this.bodies[i];
    const I = b.principalInertia(), m = b.mass(), c = b.localCom();
    const j = this.skel.parentJoint[i];
    const d2 = j ? (c.x - j.anchorB.x) ** 2 + (c.y - j.anchorB.y) ** 2 + (c.z - j.anchorB.z) ** 2 : 0;
    this.inertia[i] = (I.x + I.y + I.z) / 3 + m * d2 * 0.5;
    if (mass > 0) this.axial[i] += mass * (at.x * at.x + at.z * at.z);
    const jp = j && this.skel.parentJoint[j.a];
    if (jp && mass > 0) {
      // load position relative to the shoulder, arm hanging straight
      _v.set(at.x - j.anchorB.x + j.anchorA.x - jp.anchorB.x, at.y - j.anchorB.y + j.anchorA.y - jp.anchorB.y, at.z - j.anchorB.z + j.anchorA.z - jp.anchorB.z);
      this.inertia[j.a] += mass * _v.lengthSq() * 0.12;
    }
    for (const k of [i, j ? j.a : i]) this.loadK[k] = Math.min(6, (this.inertia[k] / this.inertia0[k]) ** 0.8);
    return col;
  }

  read() {
    for (let i = 0; i < NPARTS; i++) {
      const b = this.bodies[i];
      const t = b.translation(), r = b.rotation(), lv = b.linvel(), av = b.angvel();
      this.pos[i].set(t.x, t.y, t.z);
      this.quat[i].set(r.x, r.y, r.z, r.w);
      this.vel[i].set(lv.x, lv.y, lv.z);
      this.angvel[i].set(av.x, av.y, av.z);
    }
  }

  // Drive part i toward world quaternion target with a velocity servo.
  // gain: rad/s per rad of error; rate: how quickly (1/s) the servo acts; maxT: torque cap (N·m).
  // ff: optional feed-forward angular velocity (how fast the target itself turns).
  muscle(i, target, gain, rate, maxT, dt, maxW = 14, ff = null) {
    const q = this.quat[i];
    _qi.copy(q).invert();
    _qt.copy(target).multiply(_qi);
    if (_qt.w < 0) { _qt.x = -_qt.x; _qt.y = -_qt.y; _qt.z = -_qt.z; _qt.w = -_qt.w; }
    const w = clamp(_qt.w, -1, 1);
    const ang = 2 * Math.acos(w);
    const s = Math.sqrt(Math.max(1e-9, 1 - w * w));
    const k = Math.min(ang * gain, maxW) / s;
    const av = this.angvel[i];
    const f = 1 - Math.exp(-rate * dt);
    let tx = _qt.x * k, ty = _qt.y * k, tz = _qt.z * k;
    if (ff) { tx += ff.x; ty += ff.y; tz += ff.z; }
    let ix = (tx - av.x) * f, iy = (ty - av.y) * f, iz = (tz - av.z) * f;
    const I = this.inertia[i];
    ix *= I; iy *= I; iz *= I;
    // the twist about the part's own axis only has the (small) axial inertia to
    // move: using the full one there overshoots into a 30 Hz buzz
    const ka = this.axial[i] / I;
    if (ka < 1) {
      _v.set(0, 1, 0).applyQuaternion(q);
      const d = (ix * _v.x + iy * _v.y + iz * _v.z) * (1 - ka);
      ix -= _v.x * d; iy -= _v.y * d; iz -= _v.z * d;
    }
    const m = Math.hypot(ix, iy, iz), cap = maxT * dt;
    if (m > cap) { const sc = cap / m; ix *= sc; iy *= sc; iz *= sc; }
    this.bodies[i].applyTorqueImpulse({ x: ix, y: iy, z: iz }, true);
  }

  // A soft neck limit, alive or dead: when the head leans more than NECK_MAX from the
  // chest's axis, a torque (and its reaction on the chest) pushes it back, so a head
  // never folds down into the body.
  limits(dt) {
    const hb = this.bodies[PART.head];
    if (hb.isSleeping()) return;
    _v.set(0, 1, 0).applyQuaternion(this.quat[PART.chest]);
    _lim.set(0, 1, 0).applyQuaternion(this.quat[PART.head]);
    const c = clamp(_v.dot(_lim), -1, 1), ang = Math.acos(c);
    if (ang < NECK_MAX) return;
    _ax.crossVectors(_lim, _v); // turns the head's axis back toward the chest's
    const n = _ax.length();
    if (n < 1e-6) _ax.set(1, 0, 0).applyQuaternion(this.quat[PART.chest]); else _ax.multiplyScalar(1 / n);
    // a stiff spring past the limit, damped by the head's swing rate about that axis
    const av = this.angvel[PART.head], cv = this.angvel[PART.chest];
    const rel = (av.x - cv.x) * _ax.x + (av.y - cv.y) * _ax.y + (av.z - cv.z) * _ax.z;
    const I = this.inertia[PART.head];
    const imp = Math.max(0, (ang - NECK_MAX) * 60 - rel * 0.5) * I * dt * 60;
    hb.applyTorqueImpulse({ x: _ax.x * imp, y: _ax.y * imp, z: _ax.z * imp }, true);
    this.bodies[PART.chest].applyTorqueImpulse({ x: -_ax.x * imp, y: -_ax.y * imp, z: -_ax.z * imp }, true);
  }

  impulse(i, x, y, z) {
    this.bodies[i].applyImpulse({ x, y, z }, true);
  }

  impulseAll(x, y, z) {
    const M = this.skel.totalMass;
    for (let i = 0; i < NPARTS; i++) {
      const f = this.skel.parts[i].mass / M;
      this.bodies[i].applyImpulse({ x: x * f, y: y * f, z: z * f }, true);
    }
  }

  // Point on a part, in world space (local offset along the part's Y axis etc.)
  worldPoint(i, lx, ly, lz, out) {
    return out.set(lx, ly, lz).applyQuaternion(this.quat[i]).add(this.pos[i]);
  }

  maxSpeed() {
    let m = 0;
    for (let i = 0; i < NPARTS; i++) {
      const v = this.vel[i];
      m = Math.max(m, v.x * v.x + v.y * v.y + v.z * v.z);
    }
    return Math.sqrt(m);
  }

  corpse() {
    for (let i = 0; i < NPARTS; i++) this.colliders[i].setCollisionGroups(this.skel.parts[i].limb ? GROUPS.deadLimb : GROUPS.dead);
  }

  sleep() {
    for (const b of this.bodies) b.sleep();
  }

  setDamping(lin, ang) {
    for (const b of this.bodies) { b.setLinearDamping(lin); b.setAngularDamping(ang); }
  }

  destroy() {
    for (const j of this.joints) this.world.removeImpulseJoint(j, false);
    for (const b of this.bodies) this.world.removeRigidBody(b);
    this.bodies = [];
  }

  centerOfMass(out) {
    out.set(0, 0, 0);
    const M = this.skel.totalMass;
    for (let i = 0; i < NPARTS; i++) out.addScaledVector(this.pos[i], this.skel.parts[i].mass / M);
    return out;
  }
}

export { PART };
