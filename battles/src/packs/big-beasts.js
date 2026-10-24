// Big beasts for the Ancient and Dynasty factions:
//   War Elephant (Ancient)    an armoured elephant with a howdah of two archers: tramples,
//                             swipes its trunk, tosses units with its tusks; when it falls
//                             the archers tumble out and fight on
//   Battle Elephant (Dynasty) charges with a spiked head-plate that rams units into the air;
//                             the mahout on its neck fights on if it falls
//   Dragon (Dynasty)          flies, breathes a cone of fire that sets units burning and
//                             flailing, and lands with a stomp to fight on foot for a while
// Elephants use the mount code of sm-mounts.js (unit = rider); the dragon is a bc-core.js
// beast (rigid body + kinematic parts + hidden pilot).
import { register } from '../ext.js';
import { makeSkeleton } from '../body.js';
import { GUARD } from '../pose.js';
import { THREE, clamp, rand, PART, EXPR, addStatus, addProjectile, launchVel } from './common.js';
import {
  V, V3, Q4, BC, beastLayout, beastInit, beastUnitStep, beastHit, beastDie, animLegs, setRot, partPoint, footfalls,
  onFoot, fling, quake, inField, S, hurtBig, shoveBig, closestOnSeg, yawOf, angleDiff,
  placeExtra, qYaw, qPitch, qRoll, unmountedRadius,
} from './bc-core.js';
import { mountLayout, mountInit, mammothThink, riderHit, riderDie, riderStep, setupRidePoses } from './sm-mounts.js';
import { RIDE, setArm, addBig, updateBig, rangedEvent, footMelee } from './sm-core.js';
import * as M from './bc-meshes.js';

const PI = Math.PI;
const _p = new V3(), _a = new V3(), _b = new V3(), _q = new Q4(), _q2 = new Q4(), _q3 = new Q4();
const STAND = makeSkeleton({ scale: 1 }).standHeight;

// ======================================================================= elephants
const ELE_BASE = {
  r: 1.3, hh: 1.15, head: V(0, 0.2, 2.5), headR: 0.85, headMass: 300, H0: 2.6,
  hips: [V(0.8, -0.55, 1.1), V(-0.8, -0.55, 1.1), V(0.8, -0.55, -1.1), V(-0.8, -0.55, -1.1)],
  legOff: [0, PI, PI, 0], legAmp: 0.34, stride: 3.6, turnSlow: 1, grip: 6,
  seg: [V(0, 0, -1.7), V(0, 0.3, 2.6)], segR: 1.45,
  front: 2.4, trR: 1.6, trK: 0.8, combatR: 1.6, pitch: 0.55, headPivot: V(0, 0.45, 1.8), tusk: 3.2, tuskR: 2.4,
};
const WAR_ELE = {
  ...ELE_BASE, torso: V(0, 2.6, 0.3), mass: 4200, saddle: V(0.32, 1.45 + STAND, 0.05), seat2: V(-0.32, 1.45 + STAND, -1.15),
  speed: 3.4, accel: 2.2, turn: 0.85, alpha: 3, hp: 2400, trDmg: 30, knock: 0.05, share: 0.8,
  torsoMesh: (H, t) => M.elephantTorso(H, t, true), legMesh: (H, t) => M.elephantLeg(H, t, true),
  headMesh: (H, t) => M.elephantHead(H, t, true), r2Mesh: M.howdahArcher,
};
const BATTLE_ELE = {
  ...ELE_BASE, torso: V(0, 2.6, 0.3), mass: 4800, saddle: V(0, 1.12, 1.45),
  speed: 5.6, accel: 3.2, turn: 0.95, alpha: 3.2, hp: 2800, trDmg: 34, knock: 0.04, share: 0.8,
  torsoMesh: (H, t) => M.elephantTorso(H, t, false), legMesh: (H, t) => M.elephantLeg(H, t, false),
  headMesh: (H, t) => M.elephantHead(H, t, false),
};

// The second archer: shoots from the howdah, tumbles out when the elephant falls, then
// stands where it landed and keeps shooting (a rigid figure with hp of its own).
const ARCHER2 = { range: 34, speed: 34, damage: 34, force: 90, cooldown: 2.1, hp: 90 };
function eleInit(u, cfg) {
  const m = mountInit(u, cfg);
  m.bb = { trunkT: -1, trunkCd: rand(1, 2), trunkSd: 1, a2: cfg.r2Mesh ? { cd: rand(0.5, 1.5), yaw: 0, ground: false, dead: false } : null, ramT: new Map(), charging: false };
  (BC(u.battle).eles ??= []).push(m);
}

function nearestFrom(b, team, p, range) {
  let best = null, bd = range * range;
  for (const o of b.teams[1 - team]) {
    if (!o.alive) continue;
    const d = (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function stepArcher2(b, m, dt) {
  const a = m.bb.a2, e = m.r2, u = m.u;
  if (a.dead) return;
  if (m.r2fly && !a.ground) {
    if (!m.r2fly.down) return;
    // landed: get up and fight on
    a.ground = true;
    const gy = b.terrain.height(e.pos.x, e.pos.z);
    a.pos = new V3(e.pos.x, gy + STAND, e.pos.z);
    a.big = addBig(b, {
      u, e, a: V(0, -0.5, 0), b: V(0, 0.9, 0), r: 0.32, hp: ARCHER2.hp, mass: 70, flesh: true, blastK: 1, pitch: 1.1,
      onDie: () => {
        a.dead = true;
        b.emit('blood', e.pos.x, e.pos.y + 0.4, e.pos.z, 8, 0, 0);
        b.sound('thud', e.pos, 0.7, 1.1);
        placeExtra(e, _p.set(e.pos.x, b.terrain.height(e.pos.x, e.pos.z) + 0.25, e.pos.z), _q.setFromEuler(new THREE.Euler(-PI / 2, a.yaw, 0, 'YXZ')));
      },
    });
    a.yaw = yawOf(e.quat);
  }
  const from = a.ground ? _a.copy(a.pos) : _a.copy(e.pos);
  from.y += 0.6;
  a.cd -= dt;
  const t = !b.over && nearestFrom(b, u.team, from, ARCHER2.range);
  if (t) {
    const goal = Math.atan2(t.pos.x - from.x, t.pos.z - from.z);
    const base = a.ground ? 0 : yawOf(m.torso.quat);
    a.yaw += clamp(angleDiff(base + a.yaw, goal), -3 * dt, 3 * dt);
    if (a.cd <= 0 && Math.abs(angleDiff(base + a.yaw, goal)) < 0.25) {
      a.cd = ARCHER2.cooldown * rand(0.85, 1.15);
      const c = t.chestPos, tv = t.rag.vel[PART.chest];
      const tof = Math.hypot(c.x - from.x, c.z - from.z) / ARCHER2.speed;
      _b.set(c.x + tv.x * tof * 0.7, c.y, c.z + tv.z * tof * 0.7);
      launchVel(from, _b, ARCHER2.speed, 9.81, false, 0.035, _p);
      addProjectile(b, 'arrow', from, _p, u, { damage: ARCHER2.damage, force: ARCHER2.force, life: 8 });
      b.sound('bow', from, 0.6, rand(0.95, 1.1));
    }
  }
  // turn the figure toward its target
  if (a.ground) { placeExtra(e, a.pos, qYaw(a.yaw, _q)); updateBig(a.big); }
  else placeExtra(e, e.pos, _q.copy(m.torso.quat).multiply(qYaw(a.yaw, _q2)));
}

// trunk swipe: the head swings from one side to the other, batting units away
function trunkZone(b, m, test) {
  const q = m.torso.quat, yw = yawOf(q), fx = Math.sin(yw), fz = Math.cos(yw), u = m.u;
  const hp = _a.copy(m.cfg.headPivot).applyQuaternion(q).add(m.torso.pos);
  let n = 0, sd = 0;
  b.grid.query(hp.x + fx * 1.8, hp.z + fz * 1.8, 4, (o) => {
    if (!o.alive || o.team === u.team || !onFoot(o)) return;
    const dx = o.pos.x - hp.x, dz = o.pos.z - hp.z, along = dx * fx + dz * fz, side = dx * fz - dz * fx;
    if (along < -0.5 || along > 3.6 || Math.abs(side) > 2.4) return;
    n++; sd += side;
    if (test) return;
    const s = m.bb.trunkSd, lx = fz * s, lz = -fx * s; // (batted the way the trunk sweeps)
    o.hit(35, PART.chest, 0, 0, 0, u, 'trunk');
    fling(o, lx * 8 + fx * 2, 3.5, lz * 8 + fz * 2, 1.5);
    b.emit('dust', o.pos.x, o.pos.y - 0.5, o.pos.z, 1);
    b.sound('thud', o.chestPos, 0.9, 0.7);
  });
  if (test && n) m.bb.trunkSd = sd >= 0 ? -1 : 1; // swing from the side they are on, across
  return n;
}
function stepTrunk(b, m, dt) {
  const bb = m.bb;
  bb.trunkCd -= dt;
  if (bb.trunkT < 0) {
    if (bb.trunkCd <= 0 && m.tossT < 0 && trunkZone(b, m, true) > 0) { bb.trunkT = 0; b.sound('whoosh', m.torso.pos, 0.9, 0.5); }
    else return;
  }
  const t0 = bb.trunkT;
  bb.trunkT += dt / 0.8;
  if (t0 < 0.5 && bb.trunkT >= 0.5) trunkZone(b, m, false);
  if (bb.trunkT >= 1) { bb.trunkT = -1; bb.trunkCd = rand(2.2, 3); return; }
  // re-place the head with the swing (stepMount placed it with its own pitch this step)
  const t = bb.trunkT, s = bb.trunkSd;
  const yaw = s * (t < 0.35 ? -0.55 * (t / 0.35) : t < 0.6 ? -0.55 + 1.2 * ((t - 0.35) / 0.25) : 0.65 * (1 - (t - 0.6) / 0.4));
  const q = m.torso.quat;
  _p.copy(m.cfg.headPivot).applyQuaternion(q).add(m.torso.pos);
  placeExtra(m.head, _p, _q.copy(q).multiply(qYaw(yaw, _q2)).multiply(qPitch(m.headPitch + 0.15, _q3)).multiply(qRoll(-yaw * 0.4, _q2)));
}

// the battle elephant's spiked head-plate: anything it charges into goes flying
function stepRam(b, m) {
  const u = m.u, q = m.torso.quat, yw = yawOf(q), fx = Math.sin(yw), fz = Math.cos(yw);
  const v = m.torso.body.linvel(), vf = v.x * fx + v.z * fz;
  if (vf < 2.8) return;
  const k = clamp((vf - 2.8) / (m.cfg.speed - 2.8), 0.3, 1);
  const c = _a.set(0, -0.6, m.cfg.front + 1.1).applyQuaternion(q).add(m.torso.pos);
  const R = 1.8;
  let hits = 0;
  b.grid.query(c.x, c.z, R + 1.5, (o) => {
    if (!o.alive || o.team === u.team) return;
    const tt = m.bb.ramT.get(o);
    if (tt !== undefined && b.time < tt) return;
    const q2 = o.sm && o.sm.big && o.sm.mounted ? closestOnSeg(o.sm.big.A, o.sm.big.B, c, _b) : o.pos;
    const dx = q2.x - c.x, dz = q2.z - c.z;
    if (Math.hypot(dx, dz) > R + (o.bc ? o.skel.radius : 0.3)) return;
    m.bb.ramT.set(o, b.time + 1.4);
    hits++;
    const sd = (dx * fz - dz * fx) >= 0 ? 1 : -1;
    o.hit(95 * k, PART.chest, 0, 0, 0, u, 'ram');
    if (onFoot(o)) fling(o, fx * 9 * k + fz * sd * 3, 6 * k + 2, fz * 9 * k - fx * sd * 3, 2);
    else if (o.sm && o.sm.big) { hurtBig(b, o.sm.big, 60 * k, u); shoveBig(o.sm.big, fx * o.sm.big.mass * 4 * k, o.sm.big.mass * 2 * k, fz * o.sm.big.mass * 4 * k, c, 5); }
    const cp = o.chestPos;
    b.emit(o.def.armor > 0.3 ? 'spark' : 'blood', cp.x, cp.y, cp.z, 10, fx, fz);
    b.sound('crunch', cp, 1.2, 0.7);
  });
  // big targets (carts, other beasts) in the way take the plate too
  for (const g of S(b).bigs) {
    if (!g.alive || g.team === u.team || g === m.big || (g.u && g.u.sm === m)) continue;
    if (m.bb.ramT.has(g) && b.time < m.bb.ramT.get(g)) continue;
    closestOnSeg(g.A, g.B, c, _b);
    if (Math.hypot(_b.x - c.x, _b.z - c.z) > R + g.r) continue;
    m.bb.ramT.set(g, b.time + 1.4);
    hits++;
    hurtBig(b, g, 120 * k, u);
    shoveBig(g, fx * g.mass * 3 * k, g.mass * 1.5 * k, fz * g.mass * 3 * k, _b, 4);
  }
  if (hits) {
    b.sound('thump', c, 1, 0.5);
    const vv = m.torso.body.linvel();
    m.torso.body.setLinvel({ x: vv.x * 0.9, y: vv.y, z: vv.z * 0.9 }, true);
  }
}

// charge through the line, brawl with tusks for a few seconds, back off for a run-up, again
function battleEleThink(u, dt, ctx) {
  const m = u.sm;
  if (!m.mounted) return footMeleeK(u, ctx);
  const b = u.battle, cfg = m.cfg, p = m.torso.pos, bb = m.bb;
  m.thinkT = b.time;
  bb.t = (bb.t || 0) + dt;
  bb.mode ??= 'charge';
  const t = nearestFrom(b, u.team, p, 999) || ctx.t;
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
  const yaw = yawOf(m.torso.quat), bear = angleDiff(yaw, Math.atan2(dx, dz));
  u.expr = EXPR.angry;
  switch (bb.mode) {
    case 'charge':
      if (!bb.through && (d < 3.5 || (d < 7 && Math.abs(bear) > 1.2))) { bb.through = true; bb.t = 0; }
      if (bb.through) { m.goalYaw = yaw; m.goalSpeed = cfg.speed; if (bb.t > 1.0) { bb.mode = 'brawl'; bb.t = 0; bb.through = false; } }
      else { m.goalYaw = inField(p, Math.atan2(dx, dz)); m.goalSpeed = Math.abs(bear) > 0.8 ? cfg.speed * 0.4 : cfg.speed; }
      break;
    case 'brawl':
      m.goalYaw = inField(p, Math.atan2(dx, dz));
      m.goalSpeed = d < 6 && Math.abs(bear) > 0.7 ? 0.5 : Math.abs(bear) > 0.9 ? 1.6 : d > 4.5 ? 2.4 : 0.6;
      if (m.tossT < 0 && m.tossCd <= 0 && tuskZone(b, m)) { m.tossT = 0; m.tossCd = rand(2.2, 3); }
      if (bb.t > 5) { bb.mode = 'back'; bb.t = 0; }
      break;
    case 'back': default:
      // walk away from the enemy for a run-up, then wheel round
      m.goalYaw = inField(p, Math.atan2(-dx, -dz));
      m.goalSpeed = cfg.speed * 0.8;
      if (bb.t > 2.2 || d > 14) { bb.mode = 'charge'; bb.t = 0; b.sound('horn', p, 0.7, 1.8); }
      break;
  }
  // the mahout jabs with his glaive whenever someone is in reach
  if (ctx.dist - ctx.t.skel.radius < u.reachDist + 0.8 && u.cooldown <= 0 && !u.st.attack && u.stun <= 0) u.startAttack();
  return ctx.t;
}
function tuskZone(b, m) {
  const c = _a.set(0, 0, m.cfg.tusk).applyQuaternion(m.torso.quat).add(m.torso.pos), R = m.cfg.tuskR * 0.8;
  let hit = false;
  b.grid.query(c.x, c.z, R + 1, (o) => { if (!hit && o.alive && o.team !== m.u.team && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < R + o.skel.radius) hit = true; });
  return hit;
}
const footMeleeK = (u, ctx) => footMelee(u, ctx, u.def.weapon.cooldown);

function stepEles(b, dt) {
  for (const m of BC(b).eles || []) {
    unmountedRadius(m);
    // a dead elephant goes all the way over onto its side
    if (!m.alive && !m.bb.toppled) {
      m.bb.toppled = true;
      const f = V(0, 0, 1).applyQuaternion(m.torso.quat), w = m.torso.body.angvel();
      const sd = Math.sign(f.x * w.x + f.z * w.z) || 1;
      m.torso.body.setAngvel({ x: f.x * 1.15 * sd, y: w.y, z: f.z * 1.15 * sd }, true);
    }
    if (!m.alive && m.torso.body.isSleeping()) { if (m.bb.a2 && !m.bb.a2.dead && m.bb.a2.ground) stepArcher2(b, m, dt); continue; }
    if (m.bb.a2) stepArcher2(b, m, dt);
    if (!m.alive || !m.mounted || !m.u.alive || b.over) { m.bb.trunkT = -1; continue; }
    if (m.cfg === WAR_ELE) stepTrunk(b, m, dt);
    else stepRam(b, m);
  }
}

// ======================================================================= Dragon
// wing rotation: sweep back (yaw) and raise (roll), mirrored for the right side
const wingQ = (sd, sweep, raise, out = new Q4()) => out.setFromEuler(new THREE.Euler(0, sd * sweep, sd * raise, 'YXZ'));
// folded on the ground: inner wing swept back and up, outer folded back along it
const FOLD = [wingQ(1, 1.25, 0.45), wingQ(1, 2.7, -0.15), wingQ(-1, 1.25, 0.45), wingQ(-1, 2.7, -0.15)];
const DRAGON = {
  torso: V(0, 2.35, 0), r: 0.85, hh: 1.25, mass: 3500, fly: true, startFlying: true, cols: [{ at: V(0, 0.4, 1.6), r: 0.6, mass: 200 }],
  alt: 8.5, cruise: 10, climb: 7, sink: 8, accel: 7, turn: 1.4, alpha: 6, flap: 3.4,
  H0: 2.35, speed: 3.4, grip: 8, stride: 3.2, legAmp: 0.4, tuck: 1.1, turnSlow: 0.8, getUp: 2.5,
  seg: [V(0, 0, -1.7), V(0, 0.7, 2.3)], segR: 1.15, combatR: 1.4, pitch: 0.5, shoveK: 0.4, blastK: 0.7,
  torsoMesh: M.dragonTorso,
  parts: [
    { at: V(0, 0.5, 1.45), parent: -1, mesh: M.dragonNeck, rest: qPitch(-0.1) },
    { at: V(0, 1.05, 1.1), parent: 0, mesh: M.dragonHead, rest: qPitch(0.3) },
    { at: V(0, -0.05, 0.4), parent: 1, mesh: M.dragonJaw },
    { at: V(0.7, 0.6, 0.4), parent: -1, mesh: (H, t) => M.dragonWing(H, t, 1, 0), rest: wingQ(1, 0.25, 0.55) },
    { at: V(2.2, 0.3, -0.2), parent: 3, mesh: (H, t) => M.dragonWing(H, t, 1, 1), rest: wingQ(1, 0.35, -0.25) },
    { at: V(-0.7, 0.6, 0.4), parent: -1, mesh: (H, t) => M.dragonWing(H, t, -1, 0), rest: wingQ(-1, 0.25, 0.55) },
    { at: V(-2.2, 0.3, -0.2), parent: 5, mesh: (H, t) => M.dragonWing(H, t, -1, 1), rest: wingQ(-1, 0.35, -0.25) },
    { at: V(0, 0.1, -1.55), parent: -1, mesh: (H, t) => M.dragonTail(H, t, 0) },
    { at: V(0, -0.05, -1.6), parent: 7, mesh: (H, t) => M.dragonTail(H, t, 1) },
    { at: V(0, -0.05, -1.6), parent: 8, mesh: (H, t) => M.dragonTail(H, t, 2) },
    { at: V(0.6, -0.5, 0.95), parent: -1, leg: 0, front: true, len: 1.8, mesh: (H, t) => M.dragonLeg(H, t, true) },
    { at: V(-0.6, -0.5, 0.95), parent: -1, leg: PI, front: true, len: 1.8, mesh: (H, t) => M.dragonLeg(H, t, true) },
    { at: V(0.65, -0.5, -0.85), parent: -1, leg: PI, len: 1.8, mesh: (H, t) => M.dragonLeg(H, t, false) },
    { at: V(-0.65, -0.5, -0.85), parent: -1, leg: 0, len: 1.8, mesh: (H, t) => M.dragonLeg(H, t, false) },
  ],
};
const NECK = 0, DHEAD = 1, DJAW = 2, WL = 3, WR = 5, DTAIL = 7;
const FIRE = { range: 12.5, cos: 0.94, dps: 13, burn: 4, tick: 0.12 };
const mouthD = (m, out) => partPoint(m, DHEAD, 0, -0.05, 1.35, out);

function dragonAnim(b, m, dt) {
  const P = m.parts, t = m.t;
  animLegs(m);
  if (!m.alive) {
    for (const [i, sd] of [[WL, 1], [WR, -1]]) { setRot(P[i].q, 0, sd * 0.3, sd * -0.1); setRot(P[i + 1].q, 0, sd * 0.4, sd * -0.2); }
    setRot(P[NECK].q, 0.5, 0.4); setRot(P[DHEAD].q, 0.4); setRot(P[DJAW].q, 0.4);
    for (let i = DTAIL; i < DTAIL + 3; i++) setRot(P[i].q, 0, 0.3);
    return;
  }
  // wings: big slow beats in the air (faster when hovering to breathe), folded on the ground
  const fl = Math.sin(m.phase), fl2 = Math.sin(m.phase - 0.9);
  const hover = m.state === 'breathe' || m.state === 'land';
  for (const [i, sd] of [[WL, 1], [WR, -1]]) {
    if (m.flying) {
      setRot(P[i].q, 0, sd * (hover ? 0.15 : 0.05), sd * (0.15 + fl * (hover ? 0.75 : 0.6)));
      setRot(P[i + 1].q, 0, sd * 0.1, sd * (fl2 * 0.45 - 0.05));
    } else {
      const k = i === WL ? 0 : 2;
      P[i].q.slerp(FOLD[k], 0.1); P[i + 1].q.slerp(FOLD[k + 1], 0.1);
    }
  }
  // neck and head: track the target; rear back to inhale, jaws wide to breathe
  let np = -0.1, hp = 0.3, ny = 0, jaw = 0.05;
  if (m.aim) {
    const hpos = P[NECK].e.pos, tp = m.aim.chestPos;
    const el = Math.atan2(tp.y - hpos.y, Math.hypot(tp.x - hpos.x, tp.z - hpos.z));
    ny = clamp(angleDiff(yawOf(m.torso.quat), Math.atan2(tp.x - hpos.x, tp.z - hpos.z)), -0.8, 0.8);
    np = clamp(-el * 0.5, -0.4, 0.8); hp = clamp(-el * 0.5 + 0.1, -0.4, 0.9);
  }
  if (m.state === 'breathe') {
    if (t < 0.5) { np -= 0.3 * (t / 0.5); hp -= 0.3 * (t / 0.5); jaw = 0.1; }
    else { jaw = 0.75 + Math.sin(t * 20) * 0.05; }
  } else if (m.state === 'bite') {
    const k = Math.sin(clamp(t / 0.6, 0, 1) * PI);
    np += 0.5 * k; jaw = 0.7 * k;
  }
  setRot(P[NECK].q, np, ny * 0.6);
  setRot(P[DHEAD].q, hp, ny * 0.4);
  setRot(P[DJAW].q, jaw);
  const sw = Math.sin(b.time * 1.6 + m.u.id) * 0.18;
  for (let i = 0; i < 3; i++) setRot(P[DTAIL + i].q, m.flying ? 0.05 : -0.05, sw * (1 + i * 0.4) + Math.sin(b.time * 2.4 + i) * 0.05);
}

function dragonThink(u, dt, ctx) {
  const m = u.bc, b = u.battle, p = m.torso.pos;
  m.thinkT = b.time;
  u.expr = EXPR.angry;
  const t = ctx.t;
  m.aim = t;
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz) || 1, rx = dx / d, rz = dz / d;
  m.goalYaw = inField(p, Math.atan2(dx, dz));
  if (m.state === 'idle') { m.state = 'fly'; m.t = 0; }
  switch (m.state) {
    case 'fly': {
      m.alt = DRAGON.alt;
      const sd = u.id % 2 ? 1 : -1;
      if (d > 14) m.goalVel.set(rx * DRAGON.cruise, 0, rz * DRAGON.cruise);
      else m.goalVel.set(rx * (d - 10) * 1.0 - rz * sd * 2.5, 0, rz * (d - 10) * 1.0 + rx * sd * 2.5);
      if (m.breathCd <= 0 && d < 16) { m.state = 'breathe'; m.t = 0; b.sound('whoosh', p, 1, 0.4); }
      else if (m.landCd <= 0 && d < 16) { m.state = 'land'; m.t = 0; }
      break;
    }
    case 'breathe': {
      m.alt = 6.5;
      m.goalVel.set(rx * clamp((d - 9) * 0.8, -3, 3), 0, rz * clamp((d - 9) * 0.8, -3, 3));
      break;
    }
    case 'land': {
      // come down on top of them
      m.alt = d < 5 ? 0 : 5;
      const sp = clamp((d - 2) * 1.6, 0, 9);
      m.goalVel.set(rx * sp, 0, rz * sp);
      if (m.t > 5) { m.state = 'fly'; m.landCd = rand(4, 6); }
      break;
    }
    case 'ground': {
      const yaw = yawOf(m.torso.quat), bear = angleDiff(yaw, Math.atan2(dx, dz));
      const near = d - t.skel.radius;
      m.goalSpeed = near < 3 ? (Math.abs(bear) > 0.5 ? 0.6 : 0) : Math.abs(bear) > 0.9 ? 1.2 : DRAGON.speed;
      break;
    }
  }
  return t;
}

function fireCone(b, m) {
  const u = m.u, o = mouthD(m, _p);
  const dir = _a.set(0, 0, 1).applyQuaternion(m.parts[DHEAD].e.quat);
  // a stream of flame along the cone, and fire splashing where it meets the ground
  for (let i = 0; i < 8; i++) {
    const s = Math.random() ** 0.6 * FIRE.range, w = s * 0.3;
    const x = o.x + dir.x * s + rand(-w, w), y = o.y + dir.y * s + rand(-w, w) * 0.6, z = o.z + dir.z * s + rand(-w, w);
    const gy = b.terrain.height(x, z);
    b.emit('trail', x, Math.max(y, gy + 0.15), z, Math.random() < 0.4 ? 1 : 0);
  }
  m.fxT = (m.fxT || 0) - 1;
  if (m.fxT <= 0) {
    m.fxT = 22;
    // where does the cone hit the ground?
    const k = dir.y < -0.05 ? Math.min(FIRE.range, (o.y - b.terrain.height(o.x, o.z)) / -dir.y) : FIRE.range;
    const gx = o.x + dir.x * k, gz = o.z + dir.z * k;
    b.emit('explode', gx, b.terrain.height(gx, gz), gz, 1.1, 2);
    b.sound('fire', o, 1.1, rand(0.55, 0.7));
  }
  m.tick = (m.tick || 0) - 1 / 60;
  if (m.tick > 0) return;
  m.tick = FIRE.tick;
  const cx = o.x + dir.x * FIRE.range * 0.5, cz = o.z + dir.z * FIRE.range * 0.5;
  b.grid.query(cx, cz, FIRE.range * 0.6 + 2, (v) => {
    if (!v.alive || v.team === u.team) return;
    const c = v.bc ? v.pos : v.chestPos;
    const rx = c.x - o.x, ry = c.y - o.y, rz = c.z - o.z, L = Math.hypot(rx, ry, rz);
    const along = rx * dir.x + ry * dir.y + rz * dir.z;
    if (along <= 0 || along > FIRE.range + (v.bc ? v.skel.radius : 0)) return;
    if (along / L < FIRE.cos - (v.bc ? 0.1 : 0)) return;
    addStatus(b, v, 'burn', FIRE.burn, FIRE.dps, u);
    v.hit(FIRE.dps * FIRE.tick, PART.chest, 0, 0, 0, u, 'fire');
    // (on fire: arms windmilling)
    if (onFoot(v)) { v.stun = Math.max(v.stun, 0.45 * (v.def.stagger ?? 1) + 0.1); v.st.attack = null; }
  });
}

function dragonAct(b, m, dt) {
  const u = m.u, p = m.torso.pos;
  m.t += dt;
  m.breathCd = (m.breathCd ?? rand(0.5, 1.5)) - dt;
  m.landCd = (m.landCd ?? rand(7, 9)) - dt;
  m.biteCd = (m.biteCd ?? 0) - dt;
  const h = p.y - b.terrain.height(p.x, p.z);
  switch (m.state) {
    case 'breathe':
      if (m.t > 0.5 && m.t < 2.8) fireCone(b, m);
      if (m.t > 3.0) { m.state = 'fly'; m.t = 0; m.breathCd = rand(5, 7); }
      break;
    case 'land':
      if (m.alt === 0 && h < DRAGON.H0 + 0.35) {
        // touchdown: a stomp that knocks everyone around flat
        m.flying = false; m.state = 'ground'; m.t = 0;
        const gy = b.terrain.height(p.x, p.z);
        _a.set(p.x, gy, p.z);
        quake(b, u, _a, 4.5, 80, 9, { up: 0.9 });
        b.emit('dust', p.x, gy, p.z, 12);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; b.emit('dust', p.x + Math.cos(a) * 3, gy, p.z + Math.sin(a) * 3, 2); }
        b.sound('boom', _a, 1.2, 0.45);
        b.sound('thump', _a, 1.4, 0.4);
      }
      break;
    case 'ground': {
      footfalls(m, (i, at) => {
        at.y = b.terrain.height(at.x, at.z);
        b.emit('dust', at.x, at.y, at.z, 2);
        b.sound('thump', at, 0.5, 0.55);
        quake(b, u, at, 1.6, 22, 5);
      });
      // snap at whatever is right in front
      if (m.biteCd <= 0) {
        const c = mouthD(m, _p);
        let hit = null;
        b.grid.query(c.x, c.z, 3, (o) => {
          if (hit || !o.alive || o.team === u.team) return;
          const q = o.bc ? o.pos : o.chestPos, r = o.bc ? o.skel.radius + 0.8 : 1.6;
          if ((q.x - c.x) ** 2 + ((q.y - c.y) * 0.5) ** 2 + (q.z - c.z) ** 2 < r * r) hit = o;
        });
        if (hit) {
          m.state = 'bite'; m.t = 0; m.biteCd = rand(1.2, 1.6); m.victim = hit;
        }
      }
      if (m.t > 6) takeoff(b, m);
      break;
    }
    case 'bite': {
      if (m.t - dt < 0.3 && m.t >= 0.3 && m.victim && m.victim.alive) {
        const v = m.victim, c = v.chestPos, yw = yawOf(m.torso.quat);
        v.hit(90, PART.chest, 0, 0, 0, u, 'bite');
        if (onFoot(v)) fling(v, Math.sin(yw) * 7, 5, Math.cos(yw) * 7, 1.6);
        b.emit('blood', c.x, c.y, c.z, 10, 0, 0);
        b.sound('crunch', c, 1.2, 0.7);
      }
      if (m.t > 0.7) { m.state = 'ground'; m.t = Math.max(0, m.groundT ?? 0); }
      m.groundT = (m.groundT ?? 0) + dt;
      if ((m.groundT ?? 0) > 6) takeoff(b, m);
      break;
    }
  }
  if (m.state === 'ground') m.groundT = m.t;
}
function takeoff(b, m) {
  m.flying = true; m.state = 'fly'; m.t = 0; m.groundT = 0;
  m.landCd = rand(7, 9);
  m.breathCd = Math.min(m.breathCd, 1.5);
  const v = m.torso.body.linvel();
  m.torso.body.setLinvel({ x: v.x, y: 6, z: v.z }, true);
  b.sound('whoosh', m.torso.pos, 1.3, 0.35);
  const p = m.torso.pos, gy = b.terrain.height(p.x, p.z);
  b.emit('dust', p.x, gy, p.z, 8);
}
Object.assign(DRAGON, {
  anim: dragonAnim, act: dragonAct,
  init: (m) => { m.state = 'fly'; m.alt = DRAGON.alt; },
  onDie: (b, m) => { b.sound('horn', m.torso.pos, 1, 0.3); },
  command: (b, m) => { if (m.flying && m.state === 'fly' && m.breathCd <= 0) { m.state = 'breathe'; m.t = 0; } },
});

// ======================================================================= units
const units = [
  {
    id: 'bb_war_elephant', name: 'War Elephant', faction: 'ancient', cost: 2200, hp: 230, speed: 4.2,
    build: { scale: 1, girth: 0.98, radius: 3.0 },
    weapon: { line: 'Mount · two howdah archers · tramples, trunk-swipes, tusk-tosses',
      kind: 'bb_welephant', style: 'bb_wbow', footStyle: 'bow', anim: 'bow', item: 'none', proj: 'arrow', speed: 34, arc: 'low',
      range: 36, minRange: 3, cooldown: 2.0, damage: 34, force: 90, spread: 0.035, releaseAt: 0.78, windup: 1.0, reach: 4,
    },
    look: { skin: '#e6b48c', hat: 'an_phrygian', top: 'an_linen', legs: '#e6b48c', quiver: true },
    personality: { aggro: 1, bravery: 0, voice: 1.0, chatter: 0.5, cry: 'charge', idle: 'shift' },
    desc: 'An armoured elephant with two archers in its howdah. Tramples, swipes and tosses.',
  },
  {
    id: 'bb_battle_elephant', name: 'Battle Elephant', faction: 'dynasty', cost: 1800, hp: 260, speed: 4.4,
    build: { scale: 1, girth: 1.0, radius: 3.0 },
    weapon: { line: 'Mount · charges through lines with a spiked head-plate · mahout fights on',
      kind: 'bb_belephant', style: 'bb_mahout', footStyle: 'spear', anim: 'stab', item: 'bb_glaive', damage: 42, reach: 2.4, cooldown: 1.4, force: 380,
    },
    look: { skin: '#f0c8a0', hat: 'dy_jingasa', top: 'dy_robe', legs: '#3a3a5a' },
    personality: { aggro: 1, bravery: 0, voice: 0.95, chatter: 0.6, cry: 'charge', idle: 'shift' },
    desc: 'A lacquered war elephant with a spiked head-plate. Charges through lines and wheels round.',
  },
  {
    id: 'bb_dragon', name: 'Dragon', faction: 'dynasty', cost: 3200, hp: 3400, speed: 3.4,
    build: { scale: 1, radius: 3.2 },
    weapon: { line: 'Flying · breathes fire that sets units burning · lands with a stomp', kind: 'bb_dragon', style: 'none', anim: 'punch', item: 'none', damage: 90, reach: 2, cooldown: 2, force: 400 },
    look: { skin: '#e2556b', hat: 'none', top: 'none', legs: '#e2556b' },
    personality: { aggro: 1, bravery: 0, voice: 0.4, chatter: 0.5, cry: 'roar', idle: 'thump' },
    desc: 'A sky-serpent of the Dynasty. Breathes fire on whole squads, then lands on them.',
  },
];

setupRidePoses({
  bb_wbow: { cfg: WAR_ELE, standHeight: STAND },
  bb_mahout: { cfg: BATTLE_ELE, standHeight: STAND },
});
// the howdah archer stands (legs straight, hidden by the howdah walls) with his bow up
RIDE.bb_wbow = { lift: RIDE.bb_wbow.lift, roll: 0.06, pitch: 0, bend: 0.12, arms: (pose) => { setArm(pose, 1, GUARD.bow.L); setArm(pose, -1, GUARD.bow.R); } };
RIDE.bb_mahout.arms = (pose) => { setArm(pose, 1, GUARD.spear.L); setArm(pose, -1, GUARD.spear.R); };

const eleLayout = (def) => mountLayout(def.id === 'bb_war_elephant' ? WAR_ELE : BATTLE_ELE);

register({
  units,
  items: { bb_glaive: { len: 2.3, r: 0.09, grip: 90, back: 0.4, metal: true, mass: 3 } },
  kinds: {
    bb_welephant: { init: (u) => eleInit(u, WAR_ELE), think: mammothThink, step: riderStep, hit: riderHit, die: riderDie, event: rangedEvent },
    bb_belephant: { melee: true, init: (u) => eleInit(u, BATTLE_ELE), think: battleEleThink, step: riderStep, hit: riderHit, die: riderDie },
    bb_dragon: { init: (u) => beastInit(u, DRAGON), think: dragonThink, step: beastUnitStep, hit: beastHit, die: beastDie },
  },
  buildItem(name, s, team, g, H) {
    if (name !== 'bb_glaive') return false;
    // a guandao: long haft, broad curved blade with a team tassel
    const L = 2.3 * s, back = 0.4 * L;
    M.put(H, g, H.cyl(0.026 * s, 0.03 * s, L, 7), H.mat('#5a2a1a'), [0, -back + L / 2, 0]);
    const bl = M.put(H, g, H.box(0.02 * s, 0.5 * s, 0.14 * s), H.metal(), [0, L - back + 0.2 * s, 0.05 * s]);
    bl.rotation.x = 0.12;
    M.put(H, g, H.cone(0.07 * s, 0.2 * s, 4), H.metal(), [0, L - back + 0.5 * s, 0.08 * s], null, [0.3, 1, 1]);
    M.put(H, g, H.cyl(0.04 * s, 0.04 * s, 0.06 * s, 8), H.gold(), [0, L - back - 0.04 * s, 0]);
    M.put(H, g, H.sphere(0.06 * s, 6, 5), H.mat(H.TEAM_COLORS[team]), [0, L - back - 0.12 * s, 0], null, [1, 1.6, 1]);
    return true;
  },
  decorate(def, team, vis, H) {
    if (def.id === 'bb_dragon') {
      for (const g of vis.parts) g.clear();
      for (const l of beastLayout(DRAGON)) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
      return;
    }
    if (def.id !== 'bb_war_elephant' && def.id !== 'bb_battle_elephant') return;
    for (const l of eleLayout(def)) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
    if (def.id === 'bb_war_elephant') {
      // the howdah archer's bow, strapped to the left forearm (he keeps it if he falls out)
      const s = vis.skel.scale, g = new THREE.Group(), fa = vis.parts[PART.farmL];
      const bw = H.mat('#6b4426', { spec: 0.25 });
      g.add(M.put(H, new THREE.Group(), H.geo('bbbow', () => new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.68, 0), new THREE.Vector3(0, 0, 0.36), new THREE.Vector3(0, 0.68, 0)), 10, 0.025, 6)), bw).parent);
      M.put(H, g, H.cyl(0.006, 0.006, 1.36, 4), H.mat('#f4f4f4'), [0, 0, 0]);
      M.put(H, g, H.cyl(0.032, 0.032, 0.16, 6), H.leather(), [0, 0, 0.17]);
      g.position.set(0, -vis.skel.handOffset, 0);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
      g.scale.setScalar(s);
      fa.add(g);
    }
  },
  battleStep(b, dt) { if (b._bc) stepEles(b, dt); },
});
