// Siege & mounts pack: mounts (horse, mammoth).
// The unit is the rider ragdoll. The mount is one dynamic rigid body (torso + head
// colliders) held up and steered by velocity servos, with kinematic legs (and head) that
// animate on top of it. The rider's pelvis hangs on a ball joint at the saddle and its
// colliders are moved to a group that ignores the mount. Mount hp is separate: melee,
// projectiles and blasts hit the body through the big-target registry (sm-core.js),
// and part of the damage aimed at the rider goes to the mount. When the mount dies or the
// rider is knocked off, the joint is removed and the rider fights on foot.
import { THREE, clamp, rand } from '../util.js';
import { RAPIER } from '../physics.js';
import { PART } from '../body.js';
import { FIELD } from '../world.js';
import {
  V3, Q4, GR, S, addBig, updateBig, hurtBig, placeExtra, yawOf, upOf, qPitch, qRoll, moveRag, setRiderGroups,
  footMelee, footRanged, rangedEvent, RIDE, EXPR, setArm, closestOnSeg, shoveBig, angleDiff,
} from './sm-core.js';
import * as M from './sm-meshes.js';

const V = (x, y, z) => new V3(x, y, z);
const Q0 = new Q4();
const ROT_Z = new Q4().setFromAxisAngle(V(1, 0, 0), Math.PI / 2); // capsule Y axis -> Z

const K = M.HORSE_SCALE, VK = (x, y, z) => V(x * K, y * K, z * K);
export const HORSE = {
  torso: VK(0, 1.22, 0.1), r: 0.36 * K, hh: 0.55 * K, mass: 480, head: VK(0, 0.62, 1.12), headR: 0.2 * K, headMass: 30,
  H0: 1.22 * K, saddle: VK(0, 0.47, -0.1),
  hips: [VK(0.2, -0.22, 0.52), VK(-0.2, -0.22, 0.52), VK(0.2, -0.22, -0.55), VK(-0.2, -0.22, -0.55)],
  legOff: [0, 0.6, Math.PI, Math.PI + 0.6], legAmp: 0.62, stride: 2.6,
  speed: 9.5, accel: 7, turn: 1.7, turnSlow: 0.45, grip: 14, alpha: 22,
  seg: [VK(0, 0, -0.62), VK(0, 0.2, 0.85)], segR: 0.42 * K, hp: 400,
  front: 0.95 * K, trR: 0.8, trDmg: 15, trK: 1, knock: 0.5, share: 0.5, combatR: 0.65, pitch: 1.0, lance: true,
  torsoMesh: M.horseTorso, legMesh: (H, t, i) => M.horseLeg(H, t, i < 2),
};
export const MAMMOTH = {
  torso: V(0, 2.55, 0.5), r: 1.35, hh: 1.2, mass: 4000, head: V(0, 0.2, 2.6), headR: 0.85, headMass: 300,
  H0: 2.55, saddle: V(0, 1.62, -0.5),
  hips: [V(0.8, -0.55, 1.15), V(-0.8, -0.55, 1.15), V(0.8, -0.55, -1.15), V(-0.8, -0.55, -1.15)],
  legOff: [0, Math.PI, Math.PI, 0], legAmp: 0.36, stride: 3.6,
  speed: 3.6, accel: 2.4, turn: 0.9, turnSlow: 1, grip: 6, alpha: 3,
  seg: [V(0, 0, -1.7), V(0, 0.3, 2.6)], segR: 1.45, hp: 2600,
  front: 2.4, trR: 1.6, trDmg: 34, trK: 0.8, knock: 0.2, share: 0.8, combatR: 1.6, pitch: 0.5,
  headPivot: V(0, 0.45, 1.85), seat2: V(0, 1.42, -1.6), tusk: 3.3, tuskR: 2.5,
  torsoMesh: M.mammothTorso, legMesh: (H, t) => M.mammothLeg(H, t), headMesh: M.mammothHead, r2Mesh: M.drummer,
};

// Extra bodies in creation order, with their rest pose in the unit frame.
export function mountLayout(cfg) {
  const out = [{ pos: cfg.torso.clone(), quat: Q0.clone(), mesh: cfg.torsoMesh }];
  cfg.hips.forEach((h, i) => out.push({ pos: cfg.torso.clone().add(h), quat: Q0.clone(), mesh: (H, t) => cfg.legMesh(H, t, i) }));
  if (cfg.headMesh) out.push({ pos: cfg.torso.clone().add(cfg.headPivot), quat: Q0.clone(), mesh: cfg.headMesh });
  if (cfg.r2Mesh) out.push({ pos: cfg.torso.clone().add(cfg.seat2), quat: Q0.clone(), mesh: cfg.r2Mesh });
  return out;
}

export function mountInit(u, cfg) {
  const b = u.battle, s = S(b);
  const lay = mountLayout(cfg);
  const bd = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.1).setAngularDamping(0.6).setCcdEnabled(false);
  const cols = [
    RAPIER.ColliderDesc.capsule(cfg.hh, cfg.r).setRotation({ x: ROT_Z.x, y: ROT_Z.y, z: ROT_Z.z, w: ROT_Z.w })
      .setMass(cfg.mass).setFriction(0.6).setRestitution(0).setCollisionGroups(GR.mount),
    RAPIER.ColliderDesc.ball(cfg.headR).setTranslation(cfg.head.x, cfg.head.y, cfg.head.z)
      .setMass(cfg.headMass).setFriction(0.6).setRestitution(0).setCollisionGroups(GR.mount),
  ];
  const torso = u.addExtraBody(bd, cols, lay[0].pos, lay[0].quat);
  const kin = (l) => u.addExtraBody(RAPIER.RigidBodyDesc.kinematicPositionBased(), [], l.pos, l.quat);
  const legs = cfg.hips.map((h, i) => kin(lay[1 + i]));
  let k = 1 + cfg.hips.length;
  const head = cfg.headMesh ? kin(lay[k++]) : null;
  const r2 = cfg.r2Mesh ? kin(lay[k++]) : null;
  const m = {
    u, cfg, torso, legs, head, r2, alive: true, mounted: true, restored: true, phase: rand(0, 6), headPitch: 0,
    goalYaw: u.spawnYaw, goalSpeed: 0, thinkT: -1, tr: new Map(), tossT: -1, tossCd: 1, fallen: false, fallT: 0,
    lanceClear: 0, lanceB: null, deadT: 0, ahead: { pos: new V3() }, stepSnd: 0,
  };
  m.big = addBig(b, {
    u, e: torso, a: cfg.seg[0], b: cfg.seg[1], r: cfg.segR, hp: cfg.hp, mass: cfg.mass, flesh: true, blastK: 0.6,
    pitch: cfg.pitch, onDie: (att) => mountDie(b, m, att),
  });
  // sit the rider on the saddle and pin its pelvis there
  const seat = cfg.saddle.clone().applyQuaternion(torso.quat).add(torso.pos);
  const p = u.rag.pos[PART.pelvis];
  moveRag(u, seat.x - p.x, seat.y - p.y, seat.z - p.z);
  setRiderGroups(u, true);
  const jd = RAPIER.JointData.spherical({ x: cfg.saddle.x, y: cfg.saddle.y, z: cfg.saddle.z }, { x: 0, y: 0, z: 0 });
  m.joint = b.world.createImpulseJoint(jd, torso.body, u.rag.bodies[PART.pelvis], true);
  m.footRadius = u.skel.radius;
  u.skel.radius = cfg.combatR;
  u.sm = m;
  s.mounts.push(m);
  return m;
}

function forEachCollider(body, f) { for (let i = 0; i < body.numColliders(); i++) f(body.collider(i)); }

export function dismount(b, m) {
  if (!m.mounted) return;
  m.mounted = false;
  m.restored = false;
  if (m.joint) { b.world.removeImpulseJoint(m.joint, true); m.joint = null; }
  const u = m.u;
  if (m.footRadius) u.skel.radius = m.footRadius; // fight on foot at a person's size
  if (!u.alive) return;
  u.st.style = u.def.weapon.footStyle;
  u.stun = Math.max(u.stun, 1.1);
  const q = m.torso.quat, f = V(0, 0, 1).applyQuaternion(q), sd = Math.random() < 0.5 ? -1 : 1;
  u.rag.impulseAll((f.x * 1.2 + f.z * sd * 2.2) * u.M, 2.2 * u.M, (f.z * 1.2 - f.x * sd * 2.2) * u.M);
  b.voice(u, 'scream', true);
}

function mountDie(b, m, att) {
  m.alive = false;
  const p = m.torso.pos, gy = b.terrain.height(p.x, p.z);
  b.emit('blood', p.x, p.y, p.z, 14, 0, 0);
  b.emit('dust', p.x, gy, p.z, m.cfg.mass > 1000 ? 8 : 4);
  b.sound('crunch', p, 1.3, m.cfg.pitch * 0.7);
  if (m.cfg.mass > 1000) b.sound('horn', p, 0.5, 1.5);
  dismount(b, m);
  forEachCollider(m.torso.body, (c) => c.setCollisionGroups(GR.dead));
  // topple onto one side
  const f = V(0, 0, 1).applyQuaternion(m.torso.quat), sd = Math.random() < 0.5 ? -1 : 1, w = m.cfg.mass > 1000 ? 0.9 : 1.6;
  const v = m.torso.body.linvel();
  m.torso.body.setLinvel({ x: v.x * 0.5, y: v.y, z: v.z * 0.5 }, true);
  m.torso.body.setAngvel({ x: f.x * w * sd, y: 0, z: f.z * w * sd }, true);
  if (m.r2) m.r2fly = { pos: m.r2.pos.clone(), vel: V(rand(-2, 2), 3.5, rand(-2, 2)), quat: m.r2.quat.clone(), spin: V(rand(-4, 4), rand(-2, 2), rand(-4, 4)), down: false };
}

// ------------------------------------------------------------------ physics, every step
const _p = new V3(), _f = new V3(), _l = new V3(), _q = new Q4(), _q2 = new Q4(), _a = new V3(), _b = new V3(), _w = new V3();
const G = 9.81;

export function stepMount(b, m, dt) {
  const cfg = m.cfg, e = m.torso, body = e.body, u = m.u;
  if (!m.alive) {
    m.deadT += dt;
    if (m.deadT > 2 && !body.isSleeping()) {
      const v = body.linvel(), w = body.angvel();
      if (Math.hypot(v.x, v.y, v.z) < 0.3 && Math.hypot(w.x, w.y, w.z) < 0.3) body.sleep();
    }
  }
  const sleeping = body.isSleeping();
  const q = e.quat, pos = e.pos;
  const yaw = yawOf(q), up = upOf(q, _a);
  const tilt = Math.acos(clamp(up.y, -1, 1));
  const v = body.linvel();
  _f.set(Math.sin(yaw), 0, Math.cos(yaw));
  _l.set(_f.z, 0, -_f.x);
  let vf = v.x * _f.x + v.z * _f.z;

  if (m.alive && !sleeping) {
    if (!m.fallen && tilt > 0.95) { m.fallen = true; m.fallT = 0; if (m.mounted) dismount(b, m); }
    if (m.fallen) {
      m.fallT += dt;
      if (m.fallT > 2.5 && tilt < 0.35) m.fallen = false;
    }
    const support = !m.fallen || m.fallT > 2.5;
    // a horse (or raptor) that lost its rider bolts from the fight, then wanders about
    const loose = (!m.mounted || !u.alive) && cfg.mass < 1000;
    if (support && loose) looseThink(b, m, dt, yaw);
    if (support) {
      const fresh = loose || (b.time - m.thinkT < 0.1 && !b.over && m.mounted && u.alive);
      const goalSpeed = fresh ? m.goalSpeed : 0;
      const goalYaw = fresh ? m.goalYaw : yaw;
      const gy = b.terrain.height(pos.x, pos.z);
      const amp = clamp(Math.abs(vf) / cfg.speed, 0, 1);
      const H0 = cfg.H0 + Math.sin(m.phase * 2) * 0.05 * amp * (cfg.mass > 1000 ? 1.5 : 1);
      const h = pos.y - gy;
      let vy = v.y;
      if (h < H0 + 0.9) vy += clamp(G + (H0 - h) * 55 - vy * 11, 0, 40) * dt;
      // drive along the body's own heading; lateral slip is gripped away
      let vl = v.x * _l.x + v.z * _l.z;
      const dv = clamp((goalSpeed - vf) * 3, -cfg.accel * 1.6, cfg.accel) * dt;
      vf += dv;
      vl -= clamp(vl, -cfg.grip * dt, cfg.grip * dt);
      body.setLinvel({ x: _f.x * vf + _l.x * vl, y: vy, z: _f.z * vf + _l.z * vl }, true);
      // yaw toward the goal, and stay upright (capped angular acceleration: big hits still rock it)
      const turn = cfg.turn * (cfg.turnSlow + (1 - cfg.turnSlow) * clamp(Math.abs(vf) / 4, 0, 1));
      const wy = clamp(angleDiff(yaw, goalYaw) * 2.5, -turn, turn);
      const sinT = Math.hypot(up.x, up.z);
      const k = sinT > 1e-4 ? (tilt * 5) / sinT : 0;
      const w = body.angvel();
      _w.set(-up.z * k - w.x, wy - w.y, up.x * k - w.z).multiplyScalar(1 - Math.exp(-10 * dt));
      const cap = (m.fallen ? 4 : cfg.alpha) * dt;
      if (_w.length() > cap) _w.setLength(cap);
      body.setAngvel({ x: w.x + _w.x, y: w.y + _w.y, z: w.z + _w.z }, true);
      m.phase += dt * (Math.abs(vf) / cfg.stride) * Math.PI * 2;
      if (cfg.mass > 1000 && Math.abs(vf) > 0.8) footfalls(b, m);
    }
  }
  // legs, head, second rider
  if (!sleeping) {
    const amp = m.alive && !m.fallen ? cfg.legAmp * clamp(Math.abs(vf) / 2.5, 0, 1) : 0;
    for (let i = 0; i < m.legs.length; i++) {
      const a = m.alive && !m.fallen ? Math.sin(m.phase + cfg.legOff[i]) * amp : (i < 2 ? -0.35 : 0.35);
      _p.copy(cfg.hips[i]).applyQuaternion(q).add(pos);
      placeExtra(m.legs[i], _p, _q.copy(q).multiply(qPitch(a, _q2)));
    }
    if (m.head) {
      let hp = Math.sin(m.phase * 2) * 0.04;
      if (m.tossT >= 0) {
        const t = m.tossT;
        hp = t < 0.45 ? 0.38 * (t / 0.45) : t < 0.62 ? 0.38 - 0.95 * ((t - 0.45) / 0.17) : -0.57 * (1 - (t - 0.62) / 0.38);
      }
      if (!m.alive) hp = 0.3;
      m.headPitch = hp;
      _p.copy(cfg.headPivot).applyQuaternion(q).add(pos);
      placeExtra(m.head, _p, _q.copy(q).multiply(qPitch(hp, _q2)));
    }
  }
  if (m.r2) stepRider2(b, m, dt);
  // fresh corpses stop colliding with a running mount (no limbs pinned under it)
  if (m.alive && Math.abs(vf) > 2) {
    for (const o of b.units) {
      if (o.alive || o.settled || o.smGhost || o.deadT > 1.5) continue;
      if (Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < cfg.hh + cfg.r + 2) { o.rag.corpse(); o.smGhost = true; }
    }
  }
  updateBig(m.big);
  if (m.alive && m.tossT >= 0) stepToss(b, m, dt);
  m.tossCd -= dt;
  if (m.alive && !m.fallen && m.mounted && u.alive) {
    if (Math.abs(vf) > (cfg.mass > 1000 ? 1.2 : 3)) trample(b, m, vf);
    if (cfg.lance) lance(b, m, dt);
    // knocked out of the saddle: a big stun, or the joint got yanked far
    if (u.stun > 1.3 && !m.stunRoll) { m.stunRoll = true; if (Math.random() < cfg.knock) dismount(b, m); }
    if (u.stun <= 0) m.stunRoll = false;
    _p.copy(cfg.saddle).applyQuaternion(q).add(pos);
    if (m.mounted && _p.distanceTo(u.pos) > 1.0) dismount(b, m);
  } else m.lanceB = null;
  // a rider that fell off collides with the world again once clear of the mount
  if (!m.mounted && !m.restored) {
    if (!u.alive) m.restored = true;
    else {
      closestOnSeg(m.big.A, m.big.B, u.pos, _p);
      closestOnSeg(m.big.A, m.big.B, u.chestPos, _b);
      const clear = Math.min(_p.distanceTo(u.pos), _b.distanceTo(u.chestPos)) > m.big.r + 0.45;
      if (!m.alive || clear || b.time - m.offT > 6) { setRiderGroups(u, false); m.restored = true; }
    }
  }
}

function footfalls(b, m) {
  // a footfall each time a leg passes the bottom of its swing
  const cfg = m.cfg;
  for (let i = 0; i < 4; i++) {
    const ph = (m.phase + cfg.legOff[i]) % (Math.PI * 2);
    const was = m['ph' + i];
    m['ph' + i] = ph;
    if (was === undefined || !(was < Math.PI / 2 && ph >= Math.PI / 2)) continue;
    const lp = _a.copy(cfg.hips[i]).applyQuaternion(m.torso.quat).add(m.torso.pos);
    const gy = b.terrain.height(lp.x, lp.z);
    b.emit('dust', lp.x, gy, lp.z, 2);
    if (i % 2 === 0) b.sound('thump', lp, 0.45, 0.5);
  }
}

function trample(b, m, vf) {
  const cfg = m.cfg, u = m.u, q = m.torso.quat, pos = m.torso.pos;
  const big = cfg.mass > 1000;
  // horse: the chest ploughs into whoever is ahead; mammoth: anyone under or before it
  const fp = _b.set(0, 0, big ? 0.6 : cfg.front).applyQuaternion(q).add(pos);
  const R = big ? 2.6 : cfg.trR;
  const k = clamp((Math.abs(vf) - (big ? 1 : 2)) / (cfg.speed - (big ? 1 : 2)), 0.2, 1);
  b.grid.query(fp.x, fp.z, R + 1, (o) => {
    if (o.team === u.team || !o.alive) return;
    const t = m.tr.get(o);
    if (t !== undefined && b.time < t) return;
    const dx = o.pos.x - fp.x, dz = o.pos.z - fp.z, d = Math.hypot(dx, dz);
    if (d > R + o.skel.radius || o.pos.y > pos.y + cfg.r * 0.8 + 0.4) return;
    m.tr.set(o, b.time + (big ? 1.3 : 0.9));
    const fx = Math.sin(yawOf(q)), fz = Math.cos(yawOf(q));
    // away from the mount's centre line, forward and up
    const side = (dx * fz - dz * fx) >= 0 ? 1 : -1;
    const lx = fz * side, lz = -fx * side;
    const sz = Math.min(1.5, o.s);
    const imp = o.M * (big ? 3 + 3 * k : 2 + 5 * k) / sz;
    const ix = (fx * (big ? 0.5 : 0.8) + lx * (big ? 0.8 : 0.5)) * imp, iz = (fz * (big ? 0.5 : 0.8) + lz * (big ? 0.8 : 0.5)) * imp;
    o.hit(cfg.trDmg * k, PART.pelvis, 0, 0, 0, u, 'trample');
    o.rag.impulseAll(ix, imp * 0.55, iz);
    o.stun = Math.max(o.stun, (big ? 0.3 + 0.6 * k : 0.5 + 0.7 * k) * (o.def.stagger ?? 1));
    b.emit('dust', o.pos.x, o.pos.y - 0.5, o.pos.z, 2);
    b.sound('thud', o.pos, 0.5 + 0.5 * k, big ? 0.6 : 0.9);
    if (!big) slow(m, 0.8);
  });
}

// ploughing into people costs a horse its momentum (and gets it stuck in a crowd)
function slow(m, k) {
  const v = m.torso.body.linvel();
  m.torso.body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
}
function lance(b, m, dt) {
  const u = m.u, w = u.weapons[0];
  if (!w || u.stun > 0.3 || u.st.attack) { m.lanceB = null; return; }
  const A = u.rag.worldPoint(w.part, w.a.x, w.a.y, w.a.z, _a);
  const B = u.rag.worldPoint(w.part, w.b.x, w.b.y, w.b.z, _b);
  if (b.time > m.lanceClear) { u.hitSet.clear(); m.lanceClear = b.time + 1.0; }
  if (m.lanceB) {
    const tv = _p.copy(B).sub(m.lanceB).divideScalar(Math.max(dt, 1e-4));
    const sp = tv.length();
    const n0 = u.hitSet.size;
    if (sp > 4.5 && sp < 40) b.meleeSweep(u, A, B, w.r, tv.clone(), sp);
    if (u.hitSet.size > n0) slow(m, 0.85);
  } else m.lanceB = new V3();
  m.lanceB.copy(B);
}

function stepToss(b, m, dt) {
  const t0 = m.tossT;
  m.tossT += dt / 1.1;
  if (t0 < 0.55 && m.tossT >= 0.55) {
    const cfg = m.cfg, u = m.u, q = m.torso.quat;
    const c = _b.set(0, 0, cfg.tusk).applyQuaternion(q).add(m.torso.pos);
    const fx = Math.sin(yawOf(q)), fz = Math.cos(yawOf(q));
    let n = 0;
    b.grid.query(c.x, c.z, cfg.tuskR + 1.5, (o) => {
      if (o.team === u.team || !o.alive) return;
      const dx = o.pos.x - c.x, dz = o.pos.z - c.z;
      if (Math.hypot(dx, dz) > cfg.tuskR + o.skel.radius) return;
      const side = (dx * fz - dz * fx) >= 0 ? 1 : -1;
      const sz = Math.min(2, o.s);
      const imp = o.M * rand(7, 9.5) / sz;
      o.hit(90, PART.chest, 0, 0, 0, u, 'tusk');
      o.rag.impulseAll((fx * 0.45 + fz * side * 0.55) * imp, imp, (fz * 0.45 - fx * side * 0.55) * imp);
      o.stun = Math.max(o.stun, 1.6 * (o.def.stagger ?? 1));
      b.emit('blood', o.chestPos.x, o.chestPos.y, o.chestPos.z, 8, fx, fz);
      n++;
    });
    // tusks also flip carts and horses
    for (const g of S(b).bigs) {
      if (!g.alive || g.team === u.team) continue;
      closestOnSeg(g.A, g.B, c, _p);
      if (Math.hypot(_p.x - c.x, _p.z - c.z) > cfg.tuskR + g.r) continue;
      hurtBig(b, g, 90, u);
      shoveBig(g, fx * g.mass * 2, g.mass * 4, fz * g.mass * 2, _p, 6);
      n++;
    }
    if (n) b.sound('crunch', c, 1.2, 0.7);
    b.sound('whoosh', c, 0.9, 0.45);
  }
  if (m.tossT >= 1) m.tossT = -1;
}

function stepRider2(b, m, dt) {
  if (!m.r2fly) {
    const q = m.torso.quat;
    _p.copy(m.cfg.seat2).applyQuaternion(q).add(m.torso.pos);
    _p.y += Math.abs(Math.sin(m.phase * 2)) * 0.05;
    placeExtra(m.r2, _p, q);
    return;
  }
  const f = m.r2fly;
  if (f.down) return;
  f.vel.y -= G * dt;
  f.pos.addScaledVector(f.vel, dt);
  _q.setFromEuler(new THREE.Euler(f.spin.x * dt, f.spin.y * dt, f.spin.z * dt));
  f.quat.multiply(_q);
  const gy = b.terrain.height(f.pos.x, f.pos.z);
  if (f.pos.y < gy + 0.25) {
    f.pos.y = gy + 0.25;
    f.down = true;
    f.quat.setFromEuler(new THREE.Euler(-Math.PI / 2, rand(0, 6), 0, 'YXZ'));
    b.emit('dust', f.pos.x, gy, f.pos.z, 3);
    b.sound('thud', f.pos, 0.6, 1.1);
  }
  placeExtra(m.r2, f.pos, f.quat);
}

// A riderless mount: gallops away from the nearest enemy for a few seconds, shies away
// from anyone who comes close, and otherwise ambles about the field.
function looseThink(b, m, dt, yaw) {
  const p = m.torso.pos, cfg = m.cfg;
  const L = m.loose || (m.loose = { t: 0, flee: rand(3, 5), turnT: rand(1, 3), yaw });
  L.t += dt; L.turnT -= dt;
  let near = null, nd = 6 * 6;
  for (const o of b.foes(m.u.team)) {
    if (!o.alive) continue;
    const d = (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2;
    if (d < nd) { nd = d; near = o; }
  }
  let goal = L.yaw, speed = cfg.speed * 0.22;
  if (near && (L.t < L.flee || nd < 3.5 * 3.5)) {
    goal = Math.atan2(p.x - near.pos.x, p.z - near.pos.z) + Math.sin(L.t * 0.7) * 0.4;
    speed = cfg.speed * (L.t < L.flee ? 0.8 : 0.5);
    L.yaw = goal;
  } else if (L.turnT <= 0) {
    L.turnT = rand(2, 5);
    L.yaw = yaw + rand(-1.3, 1.3);
  }
  m.goalYaw = steerInField(m, p, goal);
  m.goalSpeed = L.turnT > 4.2 ? 0 : speed; // (stops to graze now and then)
}

// ------------------------------------------------------------------ AI (rider think)
function steerInField(m, p, goal) {
  if (Math.abs(p.x) > FIELD.x + 5 || Math.abs(p.z) > FIELD.z + 4) return Math.atan2(-p.x, -p.z);
  return goal;
}

export function cavalryThink(u, dt, ctx) {
  const m = u.sm;
  if (!m.mounted) return footMelee(u, ctx, u.def.weapon.cooldown);
  const b = u.battle, cfg = m.cfg, t = ctx.t, p = m.torso.pos;
  m.thinkT = b.time;
  const yaw = yawOf(m.torso.quat);
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, dist = Math.hypot(dx, dz);
  const bear = angleDiff(yaw, Math.atan2(dx, dz));
  // charge through the target, ride on, wheel round and charge again
  if (m.pass) { if (dist > 9 || b.time > m.passT) m.pass = false; }
  else if (dist < 5.5 && Math.abs(bear) > 1.3) { m.pass = true; m.passT = b.time + 1.6; }
  m.goalYaw = steerInField(m, p, m.pass ? yaw : Math.atan2(dx, dz));
  m.goalSpeed = m.pass ? cfg.speed : Math.abs(bear) > 1.2 ? cfg.speed * 0.45 : cfg.speed;
  u.expr = dist < 15 ? EXPR.angry : EXPR.normal;
  // stopped next to someone (blocked, or just recovered): stab with the lance
  const vf = Math.hypot(m.torso.body.linvel().x, m.torso.body.linvel().z);
  if (vf < 3 && ctx.dist - t.skel.radius < u.reachDist + 0.4 && u.cooldown <= 0 && !u.st.attack && u.stun <= 0) u.startAttack();
  m.ahead.pos.set(p.x + Math.sin(yaw) * 10, p.y, p.z + Math.cos(yaw) * 10);
  return m.ahead;
}

export function mammothThink(u, dt, ctx) {
  const m = u.sm;
  if (!m.mounted) return footRanged(u, ctx);
  const b = u.battle, cfg = m.cfg, t = ctx.t, p = m.torso.pos;
  m.thinkT = b.time;
  const yaw = yawOf(m.torso.quat);
  // the mammoth goes for the nearest enemy to itself (the rider may be shooting someone else)
  const mt = nearestTo(b, u, p) || t;
  const dx = mt.pos.x - p.x, dz = mt.pos.z - p.z, dist = Math.hypot(dx, dz);
  const bear = angleDiff(yaw, Math.atan2(dx, dz));
  m.goalYaw = steerInField(m, p, Math.atan2(dx, dz));
  m.goalSpeed = dist < 7 && Math.abs(bear) > 0.7 ? 0.5 : Math.abs(bear) > 0.9 ? 1.8 : dist > 5 ? cfg.speed : 2.0;
  if (m.tossT < 0 && m.tossCd <= 0 && inTuskZone(b, m)) {
    m.tossT = 0;
    m.tossCd = rand(2.6, 3.4);
    if (Math.random() < 0.5) b.sound('horn', m.torso.pos, 0.55, 1.9);
  }
  // the rider throws spears from up top
  const w = u.def.weapon;
  if (ctx.dist < w.range && ctx.dist > 1.5 && !u.st.attack && u.cooldown <= 0 && u.stun <= 0) { u.startAttack(); u.aimAt = t; }
  u.expr = EXPR.angry;
  return t;
}
function inTuskZone(b, m) {
  const c = _b.set(0, 0, m.cfg.tusk).applyQuaternion(m.torso.quat).add(m.torso.pos), R = m.cfg.tuskR;
  let hit = false;
  b.grid.query(c.x, c.z, R + 1, (o) => {
    if (!hit && o.team !== m.u.team && o.alive && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < R * 0.8 + o.skel.radius) hit = true;
  });
  return hit;
}
function nearestTo(b, u, p) {
  let best = null, bd = Infinity;
  for (const o of b.foes(u.team)) {
    if (!o.alive) continue;
    const d = (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// Damage aimed at a mounted rider is partly taken by the mount.
export function riderHit(u, amount, part, attacker, kind) {
  const m = u.sm;
  if (!m || !m.mounted || !m.alive) return amount;
  hurtBig(u.battle, m.big, amount * m.cfg.share, attacker);
  return amount * (1 - m.cfg.share);
}
export function riderDie(u) {
  const m = u.sm;
  if (m && m.mounted) dismount(u.battle, m);
}
export function riderStep(u) {
  const m = u.sm;
  // taken control of: the stick steers the mount (the rider's think, which normally
  // drives it, does not run); RT is still the rider's attack, tusks toss on their own
  const c = u.control;
  if (c && m.mounted && m.alive && !u.battle.over) {
    m.thinkT = u.battle.time;
    const mv = Math.hypot(c.mx, c.mz);
    m.goalYaw = mv > 0.2 ? Math.atan2(c.mx, c.mz) : yawOf(m.torso.quat);
    m.goalSpeed = Math.min(1, mv) * m.cfg.speed;
    if (m.cfg.tusk && m.tossT < 0 && m.tossCd <= 0 && inTuskZone(u.battle, m)) { m.tossT = 0; m.tossCd = rand(2.6, 3.4); }
  }
  u.st.smStun = u.stun > 0.3;
  // sitting in the saddle is not falling: no 'flail' mode, so attacks animate
  if (u.sm.mounted && !u.st.smStun) u.airT = 0;
}

// ------------------------------------------------------------------ rider poses
const LANCE_R = [0.26, 0.08, -0.4, -1.55], REINS_L = [0.5, 0.12, -0.6, -1.05];
export function setupRidePoses(styles) {
  // styles: { style: {standHeight, cfg} }
  for (const [style, o] of Object.entries(styles)) {
    const pelvisY = o.cfg.torso.y + o.cfg.saddle.y;
    RIDE[style] = o.cfg === HORSE
      ? { lift: pelvisY - o.standHeight, roll: 0.42, pitch: -1.15, bend: 1.45, arms: (pose) => { setArm(pose, 1, REINS_L); setArm(pose, -1, LANCE_R); } }
      : { lift: pelvisY - o.standHeight, roll: 0.75, pitch: -1.2, bend: 1.2, arms: null };
  }
}

export { rangedEvent };
