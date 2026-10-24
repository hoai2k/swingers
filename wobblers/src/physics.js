// Rapier world wrapper: static scenery colliders, dynamic object registry
// (mesh sync + buoyancy), kinematic animators and water volumes.
import RAPIER from 'rapier';
import * as THREE from 'three';
import { DT, GRAVITY, STATIC_GROUPS, PROP_GROUPS, SEA_LEVEL } from './config.js';

export { RAPIER };

const WATER_DENSITY = 1000;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export const yawQuat = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
export const eulerQuat = (x, y, z, order = 'YXZ') => {
  _q.setFromEuler(new THREE.Euler(x, y, z, order));
  return { x: _q.x, y: _q.y, z: _q.z, w: _q.w };
};

export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.world.numSolverIterations = 6;
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.objects = [];        // {body, mesh, buoy}
    this.animators = [];      // fn(t, dt)
    this.bouncy = new Map();  // collider handle -> bounce speed
    this.slippery = new Set();// collider handle
    this.waterBoxes = [];     // {minX,maxX,minZ,maxZ,minY,level}
    this.handleOwner = new Map(); // collider handle -> owner object (player/vehicle/prop)
    this.time = 0;
    this.records = new Set(); // render interpolation between physics steps
    this.alpha = 1;
    this.events = new RAPIER.EventQueue(true);
    this.onContactForce = null;
  }

  // ---- static scenery -------------------------------------------------
  addStatic(desc, opts = {}) {
    desc.setCollisionGroups(STATIC_GROUPS);
    if (opts.friction != null) desc.setFriction(opts.friction);
    if (opts.restitution != null) desc.setRestitution(opts.restitution);
    if (opts.bounce) desc.setRestitution(0.85).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    if (opts.slippery) desc.setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
    const c = this.world.createCollider(desc, opts.body || this.staticBody);
    if (opts.bounce) this.bouncy.set(c.handle, opts.bounce);
    if (opts.slippery) this.slippery.add(c.handle);
    return c;
  }
  // Axis-aligned box given centre + full size, optional yaw or quaternion.
  box(cx, cy, cz, w, h, d, opts = {}) {
    const desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(cx, cy, cz);
    if (opts.rot) desc.setRotation(opts.rot);
    else if (opts.yaw) desc.setRotation(yawQuat(opts.yaw));
    return this.addStatic(desc, opts);
  }
  cylinder(cx, cy, cz, r, h, opts = {}) {
    const desc = RAPIER.ColliderDesc.cylinder(h / 2, r).setTranslation(cx, cy, cz);
    if (opts.rot) desc.setRotation(opts.rot);
    return this.addStatic(desc, opts);
  }
  ball(cx, cy, cz, r, opts = {}) {
    return this.addStatic(RAPIER.ColliderDesc.ball(r).setTranslation(cx, cy, cz), opts);
  }
  trimesh(vertices, indices, opts = {}) {
    return this.addStatic(RAPIER.ColliderDesc.trimesh(vertices, indices), opts);
  }

  // ---- dynamic objects --------------------------------------------------
  // Creates a dynamic body at pos with one collider; registers mesh sync.
  dynamic(pos, colliderDesc, mesh, opts = {}) {
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(opts.linDamp ?? 0.05).setAngularDamping(opts.angDamp ?? 0.2);
    if (opts.rot) bd.setRotation(opts.rot);
    if (opts.ccd) bd.setCcdEnabled(true);
    const body = this.world.createRigidBody(bd);
    const descs = Array.isArray(colliderDesc) ? colliderDesc : [colliderDesc];
    const colliders = descs.map((d) => {
      d.setCollisionGroups(opts.groups ?? PROP_GROUPS);
      if (opts.friction != null) d.setFriction(opts.friction);
      if (opts.restitution != null) d.setRestitution(opts.restitution);
      return this.world.createCollider(d, body);
    });
    const obj = { body, colliders, mesh, buoy: opts.buoy || null, kind: opts.kind || 'prop', home: { ...pos }, homeRot: opts.rot || { x: 0, y: 0, z: 0, w: 1 } };
    if (opts.buoy === undefined) {
      // default: sphere approx of the body volume
      let vol = 0; for (const c of colliders) vol += c.volume();
      obj.buoy = { r: Math.cbrt(vol * 3 / (4 * Math.PI)), volume: vol };
    }
    for (const c of colliders) this.handleOwner.set(c.handle, obj);
    if (mesh) { mesh.position.set(pos.x, pos.y, pos.z); if (opts.rot) mesh.quaternion.set(opts.rot.x, opts.rot.y, opts.rot.z, opts.rot.w); }
    this.objects.push(obj);
    return obj;
  }

  addWaterBox(minX, maxX, minZ, maxZ, minY, level) {
    this.waterBoxes.push({ minX, maxX, minZ, maxZ, minY, level });
  }
  // Water surface height covering point, or null.
  waterLevel(x, y, z) {
    for (const w of this.waterBoxes) {
      if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ && y > w.minY - 1) return w.level;
    }
    if (y < SEA_LEVEL + 3) return SEA_LEVEL;
    return null;
  }

  applyBuoyancy(obj) {
    const b = obj.body;
    if (!b.isDynamic() || b.isSleeping()) return;
    const bu = obj.buoy;
    if (!bu) return;
    const t = b.translation();
    if (bu.points) {
      const rot = b.rotation();
      _q.set(rot.x, rot.y, rot.z, rot.w);
      let wet = 0;
      for (const p of bu.points) {
        _v.set(p[0], p[1], p[2]).applyQuaternion(_q).add(t);
        const lvl = this.waterLevel(_v.x, _v.y, _v.z);
        if (lvl == null) continue;
        const depth = lvl - _v.y;
        if (depth <= -bu.r) continue;
        const f = Math.min(1, (depth + bu.r) / (2 * bu.r));
        wet += f / bu.points.length;
        const up = f * bu.volume / bu.points.length * WATER_DENSITY * 9.81 * DT;
        const pv = b.linvel();
        b.applyImpulseAtPoint({ x: -pv.x * 0.02 * f * b.mass() * DT * 10 / bu.points.length, y: up - pv.y * f * b.mass() * 0.8 * DT / bu.points.length, z: -pv.z * 0.02 * f * b.mass() * DT * 10 / bu.points.length }, _v, true);
      }
      obj.wet = wet;
      if (wet > 0) {
        const av = b.angvel(), k = Math.max(0, 1 - 1.2 * wet * DT);
        b.setAngvel({ x: av.x * k, y: av.y * (1 - 0.5 * wet * DT), z: av.z * k }, true);
      }
      return;
    }
    const lvl = this.waterLevel(t.x, t.y, t.z);
    if (lvl == null) { obj.wet = 0; return; }
    const depth = lvl - t.y;
    if (depth <= -bu.r) { obj.wet = 0; return; }
    const f = Math.min(1, (depth + bu.r) / (2 * bu.r));
    obj.wet = f;
    const m = b.mass();
    const up = f * bu.volume * WATER_DENSITY * 9.81 * DT * (bu.scale ?? 1);
    const v = b.linvel();
    const drag = Math.min(1, f * (bu.drag ?? 2.0) * DT);
    b.applyImpulse({ x: -v.x * m * drag, y: up - v.y * m * drag, z: -v.z * m * drag }, true);
    const av = b.angvel(), k = 1 - Math.min(1, f * 2 * DT);
    b.setAngvel({ x: av.x * k, y: av.y * k, z: av.z * k }, true);
  }

  step() {
    this.time += DT;
    for (const a of this.animators) a(this.time, DT);
    for (const o of this.objects) this.applyBuoyancy(o);
    this.world.step(this.events);
    this.capture();
    if (this.onContactForce) {
      this.events.drainContactForceEvents((e) => this.onContactForce(e));
    } else this.events.drainContactForceEvents(() => {});
    this.events.clear?.();
  }

  // ---- render interpolation ------------------------------------------------
  track(body) {
    const t = body.translation(), r = body.rotation();
    const rec = { body, p0: new THREE.Vector3(t.x, t.y, t.z), q0: new THREE.Quaternion(r.x, r.y, r.z, r.w), snap: false };
    rec.p1 = rec.p0.clone(); rec.q1 = rec.q0.clone();
    this.records.add(rec);
    return rec;
  }
  untrack(rec) { this.records.delete(rec); }
  capture() {
    for (const r of this.records) {
      r.p0.copy(r.p1); r.q0.copy(r.q1);
      const t = r.body.translation(), q = r.body.rotation();
      r.p1.set(t.x, t.y, t.z); r.q1.set(q.x, q.y, q.z, q.w);
      if (r.snap) { r.p0.copy(r.p1); r.q0.copy(r.q1); r.snap = false; }
    }
  }
  // Interpolated pose of a tracked body onto an Object3D.
  pose(rec, obj) {
    obj.position.lerpVectors(rec.p0, rec.p1, this.alpha);
    obj.quaternion.slerpQuaternions(rec.q0, rec.q1, this.alpha);
  }
  ipos(rec, out) { return out.lerpVectors(rec.p0, rec.p1, this.alpha); }

  sync() {
    for (const o of this.objects) {
      if (!o.mesh) continue;
      if (!o.rec) o.rec = this.track(o.body);
      this.pose(o.rec, o.mesh);
    }
  }

  // Reset props that fell out of the world.
  recover() {
    for (const o of this.objects) {
      if (o.kind !== 'prop') continue;
      const t = o.body.translation();
      if (t.y < -30 || Math.abs(t.x) > 420 || Math.abs(t.z) > 420) {
        o.body.setTranslation(o.home, true); o.body.setRotation(o.homeRot, true);
        o.body.setLinvel({ x: 0, y: 0, z: 0 }, true); o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }
}
