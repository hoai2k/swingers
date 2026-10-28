// Big creatures: shared plumbing for beasts with no visible rider (raptors, T-Rex,
// pterodactyl, dragon). Ridden beasts (elephants, the raptor rider) use the mount code
// in sm-mounts.js instead.
//
// A beast is one dynamic rigid body (the torso: capsule + optional extra colliders)
// held up and steered by velocity servos - on legs, or on wings at an altitude - with
// kinematic parts (legs, neck, head, jaw, tail, wings) placed on it every step in a
// small parent chain. Its hp lives on a "big target" (sm-core.js), so melee swings,
// projectiles and blasts hit the body itself.
//
// The unit's ragdoll is a hidden "pilot": its bodies are made kinematic, collide with
// nothing and sit at the torso's centre (so unit.pos / chestPos, which the rest of the
// game aims at, are the beast's body). Damage that reaches the pilot through unit.hit
// (status effects, stomps, pack blasts...) is passed on to the body; the pilot's hp
// mirrors the body's for the HUD and replay, and the two die together.
import { register } from '../ext.js';
import { THREE, clamp, rand } from '../util.js';
import { RAPIER, groups } from '../physics.js';
import { PART, NPARTS } from '../body.js';
import { FIELD } from '../world.js';
import {
  V3, Q4, GR, S, addBig, updateBig, hurtBig, placeExtra, yawOf, upOf, qPitch, qYaw, qRoll, closestOnSeg, shoveBig,
  angleDiff, EXPR,
} from './sm-core.js';

export { V3, Q4, S, hurtBig, shoveBig, closestOnSeg, yawOf, upOf, qPitch, qYaw, qRoll, angleDiff, EXPR, placeExtra };
export const V = (x, y, z) => new V3(x, y, z);
const Q0 = new Q4();
const ROT_Z = new Q4().setFromAxisAngle(new V3(1, 0, 0), Math.PI / 2); // capsule Y axis -> Z
// the pilot touches nothing at all
export const GR_GHOST = groups(0x20, 0);
const G = 9.81;

// per-battle state: beasts, units falling after a drop, carried units
export function BC(b) {
  if (!b._bc) b._bc = { beasts: [], falls: [] };
  return b._bc;
}

// ------------------------------------------------------------------ layout
// cfg.parts: [{ at: V3 (in the parent's frame), parent: index | -1 (torso), mesh(H, team),
//               rest: Q4 (local rotation in the setup pose), leg: phase offset (walk swing) }]
// Returns the extra bodies in creation order with their rest pose in the unit frame:
// [{pos, quat, mesh}] (torso first).
export function beastLayout(cfg) {
  return [{ pos: cfg.torso.clone(), quat: Q0.clone(), mesh: cfg.torsoMesh }, ...chainLayout(cfg.torso, Q0, cfg.parts)];
}
// rest poses of a chain of parts hanging off a root at (rootPos, rootQuat)
export function chainLayout(rootPos, rootQuat, parts) {
  const wp = [], wq = [];
  return parts.map((p, i) => {
    const pp = p.parent >= 0 ? wp[p.parent] : rootPos, pq = p.parent >= 0 ? wq[p.parent] : rootQuat;
    wp[i] = p.at.clone().applyQuaternion(pq).add(pp);
    wq[i] = pq.clone().multiply(p.rest || Q0);
    return { pos: wp[i].clone(), quat: wq[i].clone(), mesh: p.mesh };
  });
}
// kinematic bodies for a chain (call in layout order); returns [{def, e, q}]
export function chainInit(u, layout, parts) {
  return parts.map((p, i) => ({
    def: p, e: u.addExtraBody(RAPIER.RigidBodyDesc.kinematicPositionBased(), [], layout[i].pos, layout[i].quat),
    q: (p.rest || Q0).clone(),
  }));
}

// ------------------------------------------------------------------ init
export function beastInit(u, cfg) {
  const b = u.battle, s = S(b), bc = BC(b);
  const lay = beastLayout(cfg);
  const bd = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.1).setAngularDamping(0.8).setCcdEnabled(false);
  const cols = [
    RAPIER.ColliderDesc.capsule(cfg.hh, cfg.r).setRotation({ x: ROT_Z.x, y: ROT_Z.y, z: ROT_Z.z, w: ROT_Z.w })
      .setMass(cfg.mass).setFriction(0.6).setRestitution(0).setCollisionGroups(GR.mount),
  ];
  for (const c of cfg.cols || []) {
    cols.push(RAPIER.ColliderDesc.ball(c.r).setTranslation(c.at.x, c.at.y, c.at.z).setMass(c.mass).setFriction(0.6).setRestitution(0).setCollisionGroups(GR.mount));
  }
  const torso = u.addExtraBody(bd, cols, lay[0].pos, lay[0].quat);
  const parts = chainInit(u, lay.slice(1), cfg.parts);
  const m = {
    u, cfg, torso, parts, alive: true, fallen: false, fallT: 0, phase: rand(0, 6), deadT: 0,
    goalYaw: u.spawnYaw, goalSpeed: 0, goalVel: new V3(), alt: 0, flying: !!cfg.fly && !!cfg.startFlying,
    thinkT: -1, free: 0, hpSeen: u.hp, state: 'idle', t: 0, vf: 0, stepSnd: 0, look: { pos: new V3() },
  };
  m.big = addBig(b, {
    u, e: torso, a: cfg.seg[0], b: cfg.seg[1], r: cfg.segR, hp: u.def.hp, mass: cfg.mass * (cfg.shoveK ?? 0.5), flesh: true,
    blastK: cfg.blastK ?? 0.7, pitch: cfg.pitch ?? 0.6, onDie: (att) => beastKill(b, m, att, false),
  });
  // the pilot: kinematic, touching nothing, parked inside the body
  const r = u.rag;
  for (let i = 0; i < NPARTS; i++) {
    r.bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    r.colliders[i].setCollisionGroups(GR_GHOST);
  }
  u.skel.radius = cfg.combatR;
  u.bc = m;
  placePilot(m);
  bc.beasts.push(m);
  cfg.init?.(m);
  return m;
}

const _pp = new V3();
function placePilot(m) {
  const u = m.u, r = u.rag, e = m.torso, q = e.quat;
  const v = e.body.linvel();
  for (let i = 0; i < NPARTS; i++) {
    const dy = i === PART.chest ? 0.25 : i === PART.head ? 0.5 : 0;
    _pp.set(0, dy, 0).applyQuaternion(q).add(e.pos);
    r.bodies[i].setTranslation(_pp, false);
    r.bodies[i].setRotation(q, false);
    r.pos[i].copy(_pp); r.quat[i].copy(q);
    r.vel[i].set(v.x, v.y, v.z); r.angvel[i].set(0, 0, 0);
  }
}

// ------------------------------------------------------------------ unit kind glue
// kind.step: the pilot never flails, staggers or wants to steer
export function beastUnitStep(u) {
  u.airT = 0;
  u.stun = 0;
  u.downT = 0;
  u.st.attack = null;
  const m = u.bc;
  if (!m) return;
  u.heading = yawOf(m.torso.quat);
  // taken control of (camera X): steer with the stick, attack with RT
  const c = u.control;
  if (c && m.alive) {
    m.thinkT = u.battle.time;
    const mv = Math.hypot(c.mx, c.mz);
    if (m.flying) {
      m.goalVel.set(c.mx * m.cfg.cruise, 0, c.mz * m.cfg.cruise);
      m.alt = m.cfg.alt;
      m.goalYaw = c.aimYaw;
    } else {
      m.goalYaw = mv > 0.2 ? Math.atan2(c.mx, c.mz) : c.aimYaw;
      m.goalSpeed = Math.min(1, mv) * m.cfg.speed;
    }
    if (c.attack && m.cfg.command) m.cfg.command(u.battle, m);
  }
}
// kind.hit: damage aimed at the pilot goes to the body
export function beastHit(u, amount, part, att, kind) {
  const m = u.bc;
  if (!m || !m.alive) return 0;
  if (kind === 'melee' && att) {
    // the same swing also tests the body itself: count it once
    if (att.hitSet.has(m.big)) return 0;
    att.hitSet.add(m.big);
  }
  // (core blasts also hit the body through the big-target registry)
  const k = kind === 'blast' ? 0.5 : 1;
  hurtBig(u.battle, m.big, amount * k * (1 - (m.cfg.armor || 0)), att && att.alive ? att : null);
  return 0;
}
export function beastDie(u, killer) { if (u.bc) beastKill(u.battle, u.bc, killer, true); }

export function beastKill(b, m, att, fromDie) {
  if (!m.alive) return;
  m.alive = false;
  m.big.alive = false;
  m.big.hp = 0;
  const u = m.u, cfg = m.cfg;
  const p = m.torso.pos, gy = b.terrain.height(p.x, p.z), big = cfg.mass > 1000;
  if (cfg.metal) b.emit('spark', p.x, p.y, p.z, big ? 12 : 5); // a machine (cfg.metal): sparks, no blood
  else b.emit('blood', p.x, p.y, p.z, big ? 16 : 6, 0, 0);
  b.emit('dust', p.x, gy, p.z, big ? 8 : 2);
  b.sound('crunch', p, big ? 1.4 : 0.7, cfg.pitch ?? 0.6);
  for (let i = 0; i < m.torso.body.numColliders(); i++) m.torso.body.collider(i).setCollisionGroups(GR.dead);
  // topple onto one side (a flyer just drops)
  const f = V(0, 0, 1).applyQuaternion(m.torso.quat), sd = Math.random() < 0.5 ? -1 : 1, w = big ? 0.9 : 2.2;
  const v = m.torso.body.linvel();
  m.torso.body.setLinvel({ x: v.x * 0.5, y: Math.min(v.y, 1), z: v.z * 0.5 }, true);
  m.torso.body.setAngvel({ x: f.x * w * sd, y: 0, z: f.z * w * sd }, true);
  m.flying = false;
  cfg.onDie?.(b, m, att);
  if (!fromDie && u.alive) u.die(att);
}

// ------------------------------------------------------------------ physics, every step
const _f = new V3(), _l = new V3(), _a = new V3(), _w = new V3(), _ut = new V3(), _c = new V3(), _q = new Q4(), _q2 = new Q4();

export function stepBeast(b, m, dt) {
  const cfg = m.cfg, e = m.torso, body = e.body, u = m.u;
  if (!m.alive) {
    m.deadT += dt;
    if (m.deadT > 2 && !body.isSleeping()) {
      const v = body.linvel(), w = body.angvel();
      if (Math.hypot(v.x, v.y, v.z) < 0.3 && Math.hypot(w.x, w.y, w.z) < 0.3) body.sleep();
    }
  }
  const sleeping = body.isSleeping();
  if (sleeping && m.parked) return;
  m.parked = sleeping && !m.alive;
  const q = e.quat, pos = e.pos;
  const yaw = yawOf(q), up = upOf(q, _a);
  const tilt = Math.acos(clamp(up.y, -1, 1));
  const v = body.linvel();
  _f.set(Math.sin(yaw), 0, Math.cos(yaw));
  _l.set(_f.z, 0, -_f.x);
  m.vf = v.x * _f.x + v.z * _f.z;
  m.free = Math.max(0, m.free - dt);
  if (m.slowT > 0) m.slowT -= dt;
  if (m.alive && !sleeping && m.free <= 0) {
    const fresh = b.time - m.thinkT < 0.15 && !b.over && u.alive;
    if (m.flying) flySupport(b, m, dt, fresh, yaw, up, v);
    else {
      if (!m.fallen && tilt > 0.95) { m.fallen = true; m.fallT = 0; }
      if (m.fallen) { m.fallT += dt; if (m.fallT > (cfg.getUp ?? 2.5) && tilt < 0.35) m.fallen = false; }
      if (!m.fallen || m.fallT > (cfg.getUp ?? 2.5)) walkSupport(b, m, dt, fresh, yaw, up, tilt, v);
    }
  }
  if (!sleeping || !m.alive) {
    cfg.anim(b, m, dt);
    placeChain(m.torso, m.parts);
  }
  placePilot(m);
  updateBig(m.big);
  if (m.alive && u.alive) {
    // the pilot's hp mirrors the body's (heals land on the pilot)
    if (u.hp > m.hpSeen + 1e-6) m.big.hp = Math.min(m.big.maxHp, m.big.hp + (u.hp - m.hpSeen));
    u.hp = m.big.hp;
    m.hpSeen = u.hp;
    if (!b.over) cfg.act?.(b, m, dt);
  }
}

function walkSupport(b, m, dt, fresh, yaw, up, tilt, v) {
  const cfg = m.cfg, body = m.torso.body, pos = m.torso.pos;
  const goalSpeed = (fresh ? m.goalSpeed : 0) * (m.slowT > 0 ? m.slowK : 1); // (frost, paint, ropes)
  const goalYaw = fresh ? m.goalYaw : yaw;
  const gy = b.terrain.height(pos.x, pos.z);
  const amp = clamp(Math.abs(m.vf) / cfg.speed, 0, 1);
  const H0 = (m.H0 ?? cfg.H0) + Math.sin(m.phase * 2) * (cfg.bob ?? 0.05) * amp;
  const h = pos.y - gy;
  let vy = v.y;
  if (h < H0 + 0.9) vy += clamp(G + (H0 - h) * 55 - vy * 11, 0, 40) * dt;
  let vf = m.vf, vl = v.x * _l.x + v.z * _l.z;
  vf += clamp((goalSpeed - vf) * 3, -cfg.accel * 1.6, cfg.accel) * dt;
  vl -= clamp(vl, -cfg.grip * dt, cfg.grip * dt);
  body.setLinvel({ x: _f.x * vf + _l.x * vl, y: vy, z: _f.z * vf + _l.z * vl }, true);
  const turn = cfg.turn * ((cfg.turnSlow ?? 1) + (1 - (cfg.turnSlow ?? 1)) * clamp(Math.abs(vf) / 4, 0, 1));
  upright(m, dt, _ut.set(0, 1, 0), clamp(angleDiff(yaw, goalYaw) * 2.5, -turn, turn), up, m.fallen ? cfg.alpha * 0.5 : cfg.alpha);
  m.phase += dt * (Math.abs(vf) / cfg.stride) * Math.PI * 2;
}

function flySupport(b, m, dt, fresh, yaw, up, v) {
  const cfg = m.cfg, body = m.torso.body, pos = m.torso.pos;
  const gy = b.terrain.height(pos.x, pos.z);
  const h = pos.y - gy;
  const alt = fresh ? m.alt : Math.max(m.alt, cfg.alt * 0.6);
  const vyGoal = clamp((alt - h) * 1.8, -cfg.sink, cfg.climb);
  const vy = v.y + clamp((vyGoal - v.y) * 4, -16, 16) * dt + G * dt;
  const gv = fresh ? _c.copy(m.goalVel).multiplyScalar(m.slowT > 0 ? m.slowK : 1) : _c.set(0, 0, 0);
  let ax = (gv.x - v.x) * 2.5, az = (gv.z - v.z) * 2.5;
  const am = Math.hypot(ax, az), cap = cfg.accel;
  if (am > cap) { ax *= cap / am; az *= cap / am; }
  body.setLinvel({ x: v.x + ax * dt, y: vy, z: v.z + az * dt }, true);
  const goalYaw = fresh ? m.goalYaw : yaw;
  const wy = clamp(angleDiff(yaw, goalYaw) * 2.2, -cfg.turn, cfg.turn);
  // bank into turns and pitch with the acceleration
  _ut.set(ax * 0.03 - _l.x * wy * 0.25, 1, az * 0.03 - _l.z * wy * 0.25).normalize();
  upright(m, dt, _ut, wy, up, cfg.alpha);
  m.phase += dt * (cfg.flap ?? 6);
}

// keep a beast upright while its support is off (leaping, pinning), turning toward yaw
export function holdUpright(m, dt, yaw, alpha = 12) {
  const q = m.torso.quat, cy = yawOf(q);
  upright(m, dt, _ut.set(0, 1, 0), clamp(angleDiff(cy, yaw) * 3, -4, 4), upOf(q, new V3()), alpha);
}
// angular velocity servo: up -> upT, yaw rate wy, capped angular acceleration
function upright(m, dt, upT, wy, up, alpha) {
  const body = m.torso.body;
  _c.crossVectors(up, upT);
  const w = body.angvel();
  _w.set(_c.x * 6 - w.x, wy - w.y, _c.z * 6 - w.z).multiplyScalar(1 - Math.exp(-10 * dt));
  const cap = alpha * dt;
  if (_w.length() > cap) _w.setLength(cap);
  body.setAngvel({ x: w.x + _w.x, y: w.y + _w.y, z: w.z + _w.z }, true);
}

const _pq = new Q4();
export function placeChain(e, parts) {
  for (const p of parts) {
    const par = p.def.parent >= 0 ? parts[p.def.parent].e : e;
    _a.copy(p.def.at).applyQuaternion(par.quat).add(par.pos);
    _pq.copy(par.quat).multiply(p.q);
    placeExtra(p.e, _a, _pq);
  }
}

// ------------------------------------------------------------------ animation helpers
// walking legs: swing with the gait (tucked back when flying, splayed when dead)
export function animLegs(m, amp = 1) {
  const cfg = m.cfg, a0 = (cfg.legAmp ?? 0.5) * clamp(Math.abs(m.vf) / 2.5, 0, 1) * amp;
  for (const p of m.parts) {
    if (p.def.leg === undefined) continue;
    let a;
    if (!m.alive) a = p.def.front ? -0.4 : 0.4;
    else if (m.flying) a = cfg.tuck ?? 0.9;
    else if (m.fallen) a = Math.sin(m.u.battle.time * 9 + p.def.leg) * 0.5;
    else a = Math.sin(m.phase + p.def.leg) * a0;
    qPitch(a, p.q);
  }
}
// a local rotation from pitch (X), yaw (Y), roll (Z), applied yaw -> pitch -> roll
const _e = new THREE.Euler();
export function setRot(q, pitch, yaw = 0, roll = 0) { return q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')); }

// world position of a point in a part's frame
export function partPoint(m, i, x, y, z, out = new V3()) {
  const e = m.parts[i].e;
  return out.set(x, y, z).applyQuaternion(e.quat).add(e.pos);
}

// footfalls: fn(i, worldPos) each time leg part i passes the bottom of its swing
export function footfalls(m, fn) {
  for (let k = 0; k < m.parts.length; k++) {
    const p = m.parts[k];
    if (p.def.leg === undefined) continue;
    const ph = ((m.phase + p.def.leg) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const was = p.ph;
    p.ph = ph;
    if (was === undefined || !(was < Math.PI / 2 && ph >= Math.PI / 2)) continue;
    fn(k, partPoint(m, k, 0, -(p.def.len || 1), 0, _a));
  }
}

// ------------------------------------------------------------------ AI helpers
export function inField(p, goal) {
  if (Math.abs(p.x) > FIELD.x + 5 || Math.abs(p.z) > FIELD.z + 4) return Math.atan2(-p.x, -p.z);
  return goal;
}
export function nearestEnemy(b, team, p, ok = null) {
  let best = null, bd = Infinity;
  for (const o of b.foes(team)) {
    if (!o.alive || (ok && !ok(o))) continue;
    const d = (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
export function countEnemies(b, team, p, r) {
  let n = 0;
  b.grid.query(p.x, p.z, r, (o) => { if (o.alive && o.team !== team && (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < r * r) n++; });
  return n;
}
// height of a unit above the ground under it
export const heightOf = (b, o) => o.pos.y - b.terrain.height(o.pos.x, o.pos.z);
// is o an ordinary ragdoll on foot (not a beast, a rider on a mount or a crewed engine)?
export const onFoot = (o) => !o.bc && !(o.sm && (o.sm.mounted || o.sm.cart || o.sm.flying));
// small enough to be picked up / pinned
export const small = (o, k = 1.35) => onFoot(o) && o.s <= k && o.M <= 110 * (k / 1.35) ** 3;

// ------------------------------------------------------------------ grabbing and dropping
// Pull a held unit's chest to a point (velocity servo through impulses, weight carried).
const _h = new V3();
export function carry(v, point, dt, vel = null, k = 9) {
  const c = v.chestPos, cv = v.rag.vel[PART.chest];
  _h.copy(point).sub(c).multiplyScalar(k);
  if (_h.length() > 14) _h.setLength(14);
  if (vel) _h.add(vel);
  const f = Math.min(1, 12 * dt);
  v.rag.impulseAll(v.M * (_h.x - cv.x) * f, v.M * ((_h.y - cv.y) * f + G * dt), v.M * (_h.z - cv.z) * f);
  v.stun = Math.max(v.stun, 0.5);
  // (and it cannot fight back while dangling)
  v.st.attack = null;
  v.cooldown = Math.max(v.cooldown, 0.4);
}
// a unit let go of in the air takes damage when it hits the ground
export function trackFall(b, v, by, k = 13) {
  const bc = BC(b);
  for (const f of bc.falls) if (f.v === v) { f.t = 0; f.by = by; return; }
  bc.falls.push({ v, by, k, t: 0, vmin: 0 });
}
function stepFalls(b, dt) {
  const fs = BC(b).falls;
  for (let i = fs.length - 1; i >= 0; i--) {
    const f = fs[i], v = f.v;
    f.t += dt;
    const vy = v.rag.vel[PART.pelvis].y;
    f.vmin = Math.min(f.vmin, vy);
    const low = v.pos.y - b.terrain.height(v.pos.x, v.pos.z) < v.skel.standHeight * 1.1;
    if (low && f.t > 0.15 && vy > f.vmin * 0.4) {
      const sp = -f.vmin;
      if (sp > 6 && v.alive) {
        v.hit((sp - 5.5) * f.k, PART.pelvis, 0, 0, 0, f.by && f.by.alive ? f.by : null, 'fall');
        b.emit('dust', v.pos.x, b.terrain.height(v.pos.x, v.pos.z), v.pos.z, 3);
        b.sound(sp > 11 ? 'crunch' : 'thud', v.pos, clamp(sp / 10, 0.5, 1.4), 0.9);
        v.stun = Math.max(v.stun, 1.2);
      }
      fs.splice(i, 1);
    } else if (f.t > 5) fs.splice(i, 1);
  }
}

// Throw / knock a unit: impulse in world units of velocity (dvx, dvy, dvz), scaled down
// for big units.
export function fling(v, dvx, dvy, dvz, stun = 1.2) {
  const k = 1 / Math.max(1, Math.min(2, v.s));
  v.rag.impulseAll(v.M * dvx * k, v.M * dvy * k, v.M * dvz * k);
  v.stun = Math.max(v.stun, stun * (v.def.stagger ?? 1));
}

// Hit everything (units and big bodies) in a circle on the ground: a stomp or landing.
// (`at` may be a shared scratch vector, e.g. the point footfalls() hands out, so the
// closest point on each big body goes in a vector of its own.)
const _qc = new V3();
export function quake(b, u, at, R, dmg, kv, opts = {}) {
  const team = u.team;
  b.grid.query(at.x, at.z, R + 1.5, (o) => {
    if (o.team === team || !o.alive || o.bc) return;
    const dx = o.pos.x - at.x, dz = o.pos.z - at.z, d = Math.hypot(dx, dz);
    if (d > R + o.skel.radius || o.pos.y - at.y > (opts.h ?? 2.5)) return;
    const f = clamp(1 - d / (R + o.skel.radius), 0.25, 1);
    o.hit(dmg * f, PART.pelvis, 0, 0, 0, u, 'stomp');
    fling(o, (dx / (d || 1)) * kv * f, kv * f * (opts.up ?? 0.7), (dz / (d || 1)) * kv * f, 0.6 + f * 0.8);
  });
  for (const g of S(b).bigs) {
    if (!g.alive || g.team === team || g.u === u) continue;
    closestOnSeg(g.A, g.B, at, _qc);
    const d = Math.hypot(_qc.x - at.x, _qc.z - at.z);
    if (d > R + g.r) continue;
    const f = clamp(1 - d / (R + g.r), 0.25, 1);
    hurtBig(b, g, dmg * f * 0.6, u);
    shoveBig(g, (_qc.x - at.x) / (d || 1) * g.mass * f, g.mass * 1.5 * f, (_qc.z - at.z) / (d || 1) * g.mass * f, _qc, 3);
  }
}

// Anything on foot under or against a walking beast's body is shoved out sideways and
// knocked down (each unit at most every `every` seconds).
export function trampleBeast(b, m, R, dmg, every = 1.2) {
  const u = m.u, q = m.torso.quat, p = m.torso.pos;
  const yw = yawOf(q), fx = Math.sin(yw), fz = Math.cos(yw);
  m.tr ??= new Map();
  const k = clamp(Math.abs(m.vf) / m.cfg.speed, 0.3, 1);
  b.grid.query(p.x, p.z, R + m.cfg.hh + 1.5, (o) => {
    if (o.team === u.team || !o.alive || o.bc) return;
    const t = m.tr.get(o);
    if (t !== undefined && b.time < t) return;
    const dx = o.pos.x - p.x, dz = o.pos.z - p.z;
    const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
    if (Math.abs(along) > m.cfg.hh + R * 0.6 || Math.abs(side) > R + o.skel.radius || o.pos.y > p.y) return;
    m.tr.set(o, b.time + every);
    const sd = side >= 0 ? 1 : -1, lx = fz * sd, lz = -fx * sd, sg = Math.sign(m.vf) || 1;
    o.hit(dmg * k, PART.pelvis, 0, 0, 0, u, 'trample');
    if (onFoot(o)) fling(o, lx * (3 + 3 * k) + fx * sg * 2 * k, 2.5 + k, lz * (3 + 3 * k) + fz * sg * 2 * k, 0.5 + 0.6 * k);
    b.emit('dust', o.pos.x, o.pos.y - 0.5, o.pos.z, 2);
    b.sound('thud', o.pos, 0.5 + 0.4 * k, 0.6);
  });
}

// A rider who lost its mount is an ordinary target again (mountInit set its combat
// radius to the mount's; enemies would otherwise swing at the air around it).
export function unmountedRadius(m) {
  if (m.mounted || m.radiusReset) return;
  m.radiusReset = true;
  const u = m.u;
  u.skel.radius = Math.max(u.skel.rChest, 0.25 * u.s);
}

// ------------------------------------------------------------------ register (once)
register({
  battleStep(b, dt) {
    const s = b._bc;
    if (!s) return;
    for (const m of s.beasts) stepBeast(b, m, dt);
    if (s.falls.length) stepFalls(b, dt);
  },
});
