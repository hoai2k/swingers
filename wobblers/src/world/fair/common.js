// Shared bits for the fair rides: a FairRides bag (one scene group for every
// moving ride part, far-culled like the kit chunks; kinematic bodies with
// their own mesh or drawn together as one InstancedMesh; seats), ride signs
// and the timing helpers the ride animators use.
//
// Rides only animate while a player is within ACTIVE_R of the fair (checked
// every 30 steps); far away they just stand still where they stopped.
import * as THREE from 'three';
import { kinematic, setPose } from '../park.js';
import { addSeat } from '../playground.js';
import { matVC, GLOW, Builder, RoundedBoxGeometry } from '../../mesh.js';
import { CENTRE } from './layout.js';

export { setPose };
export const ACTIVE_R = 400;

// colours that light up at night (string lights, ride bulbs, neon); unique to the fair
export const BULB = 0xffd27a, BULB2 = 0xff7b3a, NEON_CYAN = 0x6ff6ff, NEON_PURPLE = 0xc77dff, NEON_PINK = 0xff6ad5;
GLOW.set(BULB, 2); GLOW.set(BULB2, 2); GLOW.set(NEON_CYAN, 2); GLOW.set(NEON_PURPLE, 2); GLOW.set(NEON_PINK, 2);

export const AUTUMN = [0xe8742a, 0xc8402a, 0xf2b631, 0x9c3a1e, 0xd9a03a, 0x7a2e2a];

export class FairRides {
  constructor(game, kit, R) {
    this.game = game; this.kit = kit; this.R = R;
    this.group = new THREE.Group();
    this.group.userData.noCull = true;
    game.scene.add(this.group);
    // hidden with the far kit chunks by game.farCull (an entry like kit.finish makes)
    (game.staticChunks ||= []).push({ mesh: this.group, x: CENTRE.x, z: CENTRE.z, r: 135, tall: false });
    this.active = false;
    this.inst = [];
    this.seats = [];
    this.rides = {};
    let k = 0;
    game.steppers.push(() => {
      if (k++ % 30) return;
      this.active = game.players.some((p) => { const t = p.chest.translation(); return Math.hypot(t.x - CENTRE.x, t.z - CENTRE.z) < ACTIVE_R; });
    });
    const dummy = new THREE.Object3D();
    game.updaters.push(() => {
      if (!this.active) return;
      const ph = game.physics;
      for (const it of this.inst) {
        for (let i = 0; i < it.recs.length; i++) {
          ph.pose(it.recs[i], dummy);
          dummy.updateMatrix();
          for (const m of it.meshes) m.setMatrixAt(i, dummy.matrix);
        }
        for (const m of it.meshes) m.instanceMatrix.needsUpdate = true;
      }
    });
  }

  // A kinematic body at pos {x, y, z} with colliders and (optionally) its own mesh.
  body(pos, descs = [], mesh = null) {
    if (mesh) mesh.castShadow = true;
    return kinematic(this.game, pos, descs, mesh, this.group);
  }

  // One draw call for many bodies with the same look: builders = [{ b: Builder, tint: bool }],
  // tints[i] = instance colour for tinted builders (vertex colours x instance colour).
  instanced(builders, bodies, tints) {
    const meshes = [];
    for (const { b, tint } of builders) {
      const g = b.geometry();
      const m = new THREE.InstancedMesh(g, matVC, bodies.length);
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
      if (tint) for (let i = 0; i < bodies.length; i++) m.setColorAt(i, new THREE.Color(tints[i % tints.length]));
      this.group.add(m);
      meshes.push(m);
    }
    const recs = bodies.map((b) => this.game.physics.track(b));
    this.inst.push({ recs, meshes });
    // place them once now (before any player comes near)
    const dummy = new THREE.Object3D();
    bodies.forEach((b, i) => {
      const t = b.translation(), r = b.rotation();
      dummy.position.set(t.x, t.y, t.z); dummy.quaternion.set(r.x, r.y, r.z, r.w); dummy.updateMatrix();
      for (const m of meshes) m.setMatrixAt(i, dummy.matrix);
    });
    // cull by a sphere round the whole ride (its parts' reach + room to swing), so a
    // view or shadow pass that can't see the ride skips it (they were drawn always)
    for (const m of meshes) { m.computeBoundingSphere(); m.boundingSphere.radius += 25; m.frustumCulled = true; }
    return meshes;
  }

  // A ride seat (Y to sit); getting off mid-ride uses exitPush.
  seat(body, pos, yaw, label, hint, exit, extra = {}) {
    const s = addSeat(this.game, { body, pos, yaw, label, hint: hint + ' · Y exit', exit, exitPush: 1.5, fair: true, ...extra });
    this.seats.push(s);
    return s;
  }

  // An animator that only runs while someone is near the fair; runs once now to pose the ride.
  animate(name, fn) {
    this.rides[name] = { fn };
    fn(0, 1 / 60);
    this.game.physics.animators.push((t, dt) => { if (this.active) fn(t, dt); });
  }

  // The ride's name board on two posts, facing `yaw`, at height y (sign centre).
  sign(text, x, z, yaw, y, bg, fg = '#ffffff', w = 6, post = 0x5a3a24) {
    const kit = this.kit, c = Math.cos(yaw), s = Math.sin(yaw);
    for (const k of [-1, 1]) kit.cyl(x + c * k * (w / 2 + 0.15), y / 2, z - s * k * (w / 2 + 0.15), 0.12, y + w / 8, post, { seg: 8 });
    kit.box(x - s * 0.07, y, z - c * 0.07, w + 0.4, w / 4 + 0.4, 0.12, post, { yaw, collide: false });
    for (let i = 0; i < 9; i++) { // bulbs round the board
      const lx = (i / 8 - 0.5) * (w + 0.2);
      kit.sphere(x + c * lx + s * 0.05, y + w / 8 + 0.2, z - s * lx + c * 0.05, 0.08, BULB, { seg: 6 });
    }
    return this.R.sign(text, x + s * 0.02, y, z + c * 0.02, yaw, w, bg, fg);
  }
}

// ---- timing ---------------------------------------------------------------------
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const sstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
// Ride power 0..1 within a cycle time c: off for `wait`, smooth ramp `up`, full for `run`, ramp `down`.
export function power(c, wait, up, run, down) {
  if (c < wait) return 0;
  c -= wait;
  if (c < up) return sstep(c / up);
  c -= up;
  if (c < run) return 1;
  c -= run;
  return c < down ? 1 - sstep(c / down) : 0;
}
// Distance travelled at top speed vmax under power(): the closed-form integral,
// so a ride can end each cycle exactly where it started (see spinTotal).
export function travel(c, wait, up, run, down, vmax) {
  if (c < wait) return 0;
  c -= wait;
  const I = (u) => u * u * u - u * u * u * u / 2; // integral of smoothstep
  if (c < up) return vmax * up * I(c / up);
  let a = vmax * up * 0.5;
  c -= up;
  if (c < run) return a + vmax * c;
  a += vmax * run;
  c -= run;
  const d = Math.min(1, c / down);
  return a + vmax * down * (d - I(d));
}
// Top speed that makes one cycle travel exactly `total` (e.g. N full turns).
export const vmaxFor = (total, up, run, down) => total / (up / 2 + run + down / 2);

// ---- geometry -------------------------------------------------------------------
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _sq = new THREE.Quaternion();
// A cylinder (builder) from point a to point c ([x, y, z]).
const _cyl = {}, _sph = {};
const unitCyl = (seg) => (_cyl[seg] ||= new THREE.CylinderGeometry(1, 1, 1, seg));
export const unitSphere = (seg) => (_sph[seg] ||= new THREE.SphereGeometry(1, seg, Math.max(4, seg * 0.75 | 0)));
export function strut(b, a, c, r, color, seg = 6) {
  _d.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = _d.length();
  _sq.setFromUnitVectors(_up, _d.normalize());
  return b.add(unitCyl(seg).clone(), color, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], _sq.clone(), [r, len, r]);
}
// A small sphere from a cached geometry (bulbs and the like).
export function ball(b, r, color, pos, seg = 6) { return b.add(unitSphere(seg).clone(), color, pos, null, [r, r, r]); }
// Pre-merged, pre-coloured pieces stamped many times (trees, pumpkins): template(build) -> geometry,
// stamp(builder, template, x, y, z, scale, yaw) adds a moved copy without re-colouring it.
export function template(build) { const t = new Builder(); build(t); return t.geometry(); }
const _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _qq = new THREE.Quaternion(), _yax = new THREE.Vector3(0, 1, 0);
export function stamp(b, tpl, x, y, z, s = 1, yaw = 0) {
  _m4.compose(_p3.set(x, y, z), _qq.setFromAxisAngle(_yax, yaw), _s3.set(s, s, s));
  const g = tpl.clone();
  g.applyMatrix4(_m4);
  b.parts.push(g);
  return b;
}
// The same as static scenery (merged kit chunk + collider unless opts.collide === false).
export function kitStrut(kit, a, c, r, color, opts = {}) {
  _d.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = _d.length();
  _sq.setFromUnitVectors(_up, _d.normalize());
  return kit.cyl((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, r, len, color, { seg: 8, ...opts, rot: { x: _sq.x, y: _sq.y, z: _sq.z, w: _sq.w } });
}
// Adds parts built in a local frame (build(tmpBuilder)) to builder b, moved by matrix m.
export function place(b, m, build) {
  const t = new Builder();
  build(t);
  for (const g of t.parts) { g.applyMatrix4(m); b.parts.push(g); }
  return b;
}
// Builder.rbox with the rounded-box geometry cached per size (making one is slow; cloning is cheap).
const _rbCache = new Map();
export function rb(b, w, h, d, r, color, pos, rot) {
  r = Math.min(r, w / 2, h / 2, d / 2) * 0.999;
  const key = w + ',' + h + ',' + d + ',' + r;
  let g = _rbCache.get(key);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, r); _rbCache.set(key, g); }
  return b.add(g.clone(), color, pos, rot);
}
export const mat4 =(x, y, z, q = null) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q || new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
export const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
// quaternion = rotY(yaw) * rotX(pitch) * rotZ(roll) (written into out)
export function ypr(out, yaw, pitch = 0, roll = 0) {
  out.setFromAxisAngle(AX.y, yaw);
  if (pitch) out.multiply(_q1.setFromAxisAngle(AX.x, pitch));
  if (roll) out.multiply(_q2.setFromAxisAngle(AX.z, roll));
  return out;
}
