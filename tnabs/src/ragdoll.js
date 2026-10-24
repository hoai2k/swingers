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

export class Ragdoll {
  // restQuats: unit-frame orientations for the spawn pose (array of NPARTS)
  constructor(world, skel, groundPos, yaw, restQuats) {
    this.world = world;
    this.skel = skel;
    this.bodies = [];
    this.colliders = [];
    this.inertia = new Float32Array(NPARTS);
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
    }
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
  muscle(i, target, gain, rate, maxT, dt, maxW = 14) {
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
    let ix = (_qt.x * k - av.x) * f, iy = (_qt.y * k - av.y) * f, iz = (_qt.z * k - av.z) * f;
    const I = this.inertia[i];
    ix *= I; iy *= I; iz *= I;
    const m = Math.hypot(ix, iy, iz), cap = maxT * dt;
    if (m > cap) { const sc = cap / m; ix *= sc; iy *= sc; iz *= sc; }
    this.bodies[i].applyTorqueImpulse({ x: ix, y: iy, z: iz }, true);
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
