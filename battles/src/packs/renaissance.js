// Renaissance: Halberd (long reach, chops), Fencer (very fast, lunging thrusts),
// Musketeer (holds fire for a volley with the rest of the line), Balloon Archer (hangs
// under a balloon above the battle; when the balloon pops it drops and fights on foot),
// Painter (throws paint: painted enemies are slowed) and the Da Vinci Tank: a wooden
// cone on wheels (an extra rigid body) with its engineer in the hatch; it rolls slowly
// at the enemy firing a ripple of cannons all round. Wreck it and the engineer climbs
// out; kill the engineer and it stops. The Jouster is a tournament knight on a horse
// (the mount code of sm-mounts.js) with a shield: he picks the most valuable enemy,
// takes a long run-up and charges it; his lance knocks riders out of the saddle.
// Shared guns, cannonballs and paint: pr-shared.js.
import { register, EXT } from '../ext.js';
import { RAPIER } from '../physics.js';
import { makeSkeleton } from '../body.js';
import {
  THREE, clamp, rand, PART, EXPR, rangedThink, crossed, addProjectile, sweepParts,
  torus, dome, headBand, tcol, tdark, chestShell, hoodGeo,
} from './common.js';
import {
  S as SM, GR, RIDE, addBig, updateBig, hurtBig, shoveBig, placeExtra, yawOf, upOf, moveRag, setRiderGroups, footMelee,
  setArm, angleDiff, qYaw, rangedEvent,
} from './sm-core.js';
import { FIELD } from '../world.js';
import { PR, PROJ as PRP, paint, paintCol, barrel as gunBarrel } from './pr-shared.js';
import { ballisticAngle } from '../util.js';
import { HORSE, mountLayout, mountInit, riderHit, riderDie, riderStep, setupRidePoses, dismount } from './sm-mounts.js';
import * as SMM from './sm-meshes.js';

const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const V = (x, y, z) => new V3(x, y, z);
const Q0 = new Q4();
const _p = new V3(), _q = new Q4(), _q2 = new Q4(), _a = new V3(), _f = new V3(), _l = new V3();

// ------------------------------------------------------------------ fencer
const fencer = {
  melee: true,
  think(u, dt, c) {
    const { t, dist, dirx, dirz, spd } = c;
    const near = dist - t.skel.radius;
    u.expr = near < 5 ? EXPR.angry : EXPR.normal;
    if (u.st.attack) {
      // the lunge carries him in, then he springs back out of reach
      const at = u.st.attackT;
      if (at > 0.25 && at < 0.62) u.desired.set(u.lx * spd * 1.5, 0, u.lz * spd * 1.5);
      else if (at >= 0.72) u.desired.set(-dirx * spd * 0.7, 0, -dirz * spd * 0.7);
      else u.desired.set(dirx * spd * 0.3, 0, dirz * spd * 0.3);
      return t;
    }
    const L = u.reachDist + 1.5;
    if (near > L) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (near < u.reachDist * 0.5) u.desired.set(-dirx * spd * 0.6, 0, -dirz * spd * 0.6);
    else { // circle at the edge of lunging range, light on his feet
      const sd = u.id % 2 ? 1 : -1;
      u.desired.set((-dirz * sd * 0.4 + dirx * 0.25) * spd, 0, (dirx * sd * 0.4 + dirz * 0.25) * spd);
    }
    if (near < L && u.cooldown <= 0 && !u.isDown() && u.stun <= 0) { u.startAttack(); u.lx = dirx; u.lz = dirz; }
    return t;
  },
  event(u, t0, t1) {
    if (!crossed(t0, t1, 0.32)) return;
    u.rag.impulseAll(u.lx * u.M * 2.6, u.M * 0.35, u.lz * u.M * 2.6);
    u.battle.sound('whoosh', u.pos, 0.55, 1.6);
  },
};

// ------------------------------------------------------------------ jouster
// A caparisoned horse; the rider is a cavalry rider with a different eye for targets.
const JHORSE = { ...HORSE, hp: 420, torsoMesh: (H, t) => joustHorse(H, t) };
function jousterThink(u, dt, ctx) {
  const m = u.sm;
  if (!m.mounted) return footMelee(u, ctx, u.def.weapon.cooldown);
  const b = u.battle, cfg = m.cfg, p = m.torso.pos;
  m.thinkT = b.time;
  // the champion: the enemy worth the most (nearer and healthier ones preferred)
  u.jPick = (u.jPick ?? 0) - dt;
  if (!u.jFoe || !u.jFoe.alive || u.jPick <= 0) {
    u.jPick = 2.5;
    let best = null, bv = -1;
    for (const o of b.teams[1 - u.team]) {
      if (!o.alive) continue;
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      const v = (o.def.cost * (0.4 + 0.6 * o.hp / o.maxHp)) / (1 + d / 25);
      if (v > bv) { bv = v; best = o; }
    }
    if (best && best !== u.jFoe && Math.random() < 0.5) b.voice(u, 'cry', true);
    u.jFoe = best || ctx.t;
  }
  const t = u.jFoe;
  const yaw = yawOf(m.torso.quat);
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, dist = Math.hypot(dx, dz);
  const bear = angleDiff(yaw, Math.atan2(dx, dz));
  // tilt: ride straight through, keep going for a long run-up, wheel round, charge again
  if (m.pass) { if (b.time > m.passT || (dist > 14 && b.time > m.passT - 1)) m.pass = false; }
  else if (dist < 5.5 && Math.abs(bear) > 1.2) { m.pass = true; m.passT = b.time + 2.6; }
  const goal = m.pass ? yaw : Math.atan2(dx, dz);
  m.goalYaw = Math.abs(p.x) > FIELD.x + 5 || Math.abs(p.z) > FIELD.z + 4 ? Math.atan2(-p.x, -p.z) : goal;
  m.goalSpeed = m.pass ? cfg.speed : Math.abs(bear) > 1.2 ? cfg.speed * 0.45 : cfg.speed;
  u.expr = dist < 18 ? EXPR.angry : EXPR.normal;
  // stuck next to someone: a stab with the lance
  const lv = m.torso.body.linvel();
  if (Math.hypot(lv.x, lv.z) < 3 && ctx.dist - ctx.t.skel.radius < u.reachDist + 0.4 && u.cooldown <= 0 && !u.st.attack && u.stun <= 0) u.startAttack();
  m.ahead.pos.set(p.x + Math.sin(yaw) * 10, p.y, p.z + Math.cos(yaw) * 10);
  return m.ahead;
}
// lance hits: riders are knocked out of the saddle, the champion takes a heavier blow
function jousterStep(u, dt) {
  riderStep(u);
  const b = u.battle, w = u.def.weapon;
  u.jSeen ??= new Set();
  if (u.hitSet.size === 0) u.jSeen.clear();
  for (const v of u.hitSet) {
    if (u.jSeen.has(v) || !u.sm || !v.rag) continue; // (the set also holds big bodies)
    u.jSeen.add(v);
    const c = v.chestPos;
    b.emit('spark', c.x, c.y, c.z, 3);
    b.emit('dust', c.x, c.y, c.z, 1);
    b.sound('debris', c, 0.6, 1.5);
    if (v.sm && v.sm.mounted && v.alive) dismount(b, v.sm);
    if (v === u.jFoe && v.alive && u.sm.mounted) {
      v.hit(w.damage * w.champion, PART.chest, 0, 0, 0, u, 'lance');
      b.sound('crowd', c, 0.5, 1.2); // the crowd goes wild
    }
  }
}
const jouster = {
  melee: true, init: (u) => mountInit(u, JHORSE), think: jousterThink, step: jousterStep, hit: riderHit, die: riderDie,
};

// ------------------------------------------------------------------ painter
// A blob of paint: splats on whoever (or wherever) it hits; everyone splashed is slowed.
function splash(b, pr, at) {
  const R = pr.blast || 1.6, w = pr.owner.def.weapon;
  b.sound('pop', at, 0.7, rand(1.5, 1.9));
  b.emit('ptrail', at.x, at.y, at.z);
  b.emit('spark', at.x, at.y, at.z, 1);
  b.grid.query(at.x, at.z, R + 2, (v) => {
    if (!v.alive || v.team === pr.team) return;
    if (v.chestPos.distanceTo(at) > R + v.skel.radius) return;
    _a.set(v.pos.x - at.x, 0, v.pos.z - at.z).normalize();
    v.hit(pr.damage, PART.chest, _a.x * v.M * 0.3, 0, _a.z * v.M * 0.3, pr.owner, 'paint');
    paint(b, v, w.slow);
  });
}
const paintBlob = {
  g: 9.81, len: 0, r: 0.14, life: 5,
  step(b, pr) { const h = sweepParts(b, pr, 0.15); if (h) { splash(b, pr, h.v.chestPos); pr.life = -1; } },
  hit(b, pr, v) { splash(b, pr, v.chestPos); return true; },
  ground(b, pr) { splash(b, pr, pr.pos); return true; },
};

// ------------------------------------------------------------------ balloon archer
const BAL = { up: V(0, 1.93, -0.1), alt: 4.0, minAlt: 1.7, leakAfter: 8, leak: 0.12, speed: 2.8, hp: 30, R: 0.8 };
function balloonLayout(skel) {
  return [{ pos: V(0, skel.parts[PART.chest].pos.y, 0).add(BAL.up), quat: Q0.clone(), mesh: balloonMesh }];
}
const balloon = {
  init(u) {
    const b = u.battle, s = PR(b);
    const l = balloonLayout(u.skel)[0];
    const e = u.addExtraBody(RAPIER.RigidBodyDesc.kinematicPositionBased(), [], l.pos, l.quat);
    const k = { u, e, flying: true, popped: false, free: false, falling: false, alt: BAL.alt, t: 0, freeT: 0, fallV: 0, vel: new V3() };
    k.big = addBig(b, { u, e, a: V(0, -0.15, 0), b: V(0, 0.2, 0), r: BAL.R, hp: BAL.hp, mass: 8, flesh: false, blastK: 1, onDie: () => pop(b, k) });
    u.pr = k;
    s.balloons.push(k);
    u.rag.impulseAll(0, u.M * 2.5, 0);
  },
  think(u, dt, c) {
    const k = u.pr;
    if (!k.flying) return rangedThink(u, dt, c);
    const w = u.def.weapon;
    const { t, dist, dirx, dirz } = c;
    k.t += dt;
    if (k.t > BAL.leakAfter) k.alt = Math.max(BAL.minAlt, k.alt - BAL.leak * dt); // slowly losing air
    const sp = BAL.speed, sd = u.id % 2 ? 1 : -1;
    // float up to bow range and hang there, drifting; nothing on the ground reaches him
    if (dist > 16) u.desired.set(dirx * sp, 0, dirz * sp);
    else u.desired.set(-dirz * sd * sp * 0.3, 0, dirx * sd * sp * 0.3);
    u.expr = EXPR.normal;
    if (dist < w.range && !u.st.attack && u.cooldown <= 0 && u.stun <= 0) { u.startAttack(); u.aimAt = t; }
    return t;
  },
  event: rangedEvent,
  step(u, dt) {
    const k = u.pr, b = u.battle, rag = u.rag, p = u.pos, v = rag.vel[PART.pelvis];
    if (!k.flying) {
      u.st.prHang = false;
      if (k.falling) {
        k.fallV = Math.max(k.fallV, -v.y);
        if (u.groundGap() < 0.3 || u.airT <= 0) {
          k.falling = false;
          const dmg = clamp((k.fallV - 4) * 9, 0, 45);
          if (dmg > 0) { u.hit(dmg, PART.pelvis, 0, 0, 0, null, 'fall'); u.stun = Math.max(u.stun, 1.0); b.emit('dust', p.x, p.y - 0.6, p.z, 3); b.sound('thud', p, 0.8, 0.9); }
        }
      }
      return;
    }
    u.st.prHang = true;
    u.airT = 0; // hanging is not falling: keep the core out of 'flail' so the bow animates
    // the balloon carries his weight; a servo holds the height and drifts him along
    rag.impulseAll(0, u.M * 9.81 * dt, 0);
    const gy = b.terrain.height(p.x, p.z);
    const ay = clamp((k.alt - (p.y - gy)) * 2.5 - v.y * 2.2, -5, 5);
    let ax = (u.desired.x - v.x) * 2, az = (u.desired.z - v.z) * 2;
    const am = Math.hypot(ax, az), cap = 5;
    if (am > cap) { ax *= cap / am; az *= cap / am; }
    rag.impulseAll(u.M * ax * dt, u.M * ay * dt, u.M * az * dt);
  },
  die(u) {
    const k = u.pr;
    if (!k || !k.flying) return;
    // the balloon floats off without him
    k.flying = false; k.free = true; k.big.alive = false;
    k.vel.set(rand(-0.6, 0.6), 1.6, rand(-0.6, 0.6));
  },
};
function pop(b, k) {
  const u = k.u, e = k.e;
  k.flying = false; k.popped = true;
  b.sound('pop', e.pos, 1.5, 0.7);
  b.emit('spark', e.pos.x, e.pos.y, e.pos.z, 5);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.emit('atrail', e.pos.x + Math.cos(a) * 0.7, e.pos.y + rand(-0.4, 0.4), e.pos.z + Math.sin(a) * 0.7, 0.35); }
  if (u.alive) { k.falling = true; k.fallV = 0; b.voice(u, 'scream', true); }
  placeExtra(e, _p.set(e.pos.x, e.pos.y - 40, e.pos.z), e.quat);
}
function stepBalloon(b, k, dt) {
  const u = k.u, e = k.e;
  if (k.popped) return;
  if (k.free) {
    k.freeT += dt;
    if (k.freeT > 7) { k.popped = true; placeExtra(e, _p.set(e.pos.x, e.pos.y - 60, e.pos.z), e.quat); return; }
    _p.copy(e.pos).addScaledVector(k.vel, dt);
    placeExtra(e, _p, e.quat);
    return;
  }
  if (!k.flying) return;
  // follow the harness on his back; sway a little with his drift
  const yq = qYaw(u.heading, _q);
  _p.copy(BAL.up).applyQuaternion(yq).add(u.chestPos);
  const v = u.rag.vel[PART.chest];
  const tilt = _q2.setFromEuler(new THREE.Euler(clamp(v.z * 0.04, -0.15, 0.15), 0, clamp(-v.x * 0.04, -0.15, 0.15)));
  placeExtra(e, _p, tilt.multiply(yq));
  updateBig(k.big);
}

// ------------------------------------------------------------------ da Vinci tank
const TANK = {
  pos: V(0, 0.45, 0), mass: 2600, R: 1.75, seat: V(0, 1.04, 0),
  hp: 3000, speed: 1.5, turn: 0.4, share: 0.85, combatR: 1.95, N: 8, muzzleR: 2.0, muzzleY: 0.02,
};
const LEVER = [0.35, 0.1, -0.85, -1.35];
function tankLayout() { return [{ pos: TANK.pos.clone(), quat: Q0.clone(), mesh: tankMesh }]; }
const tank = {
  melee: true,
  init(u) {
    const b = u.battle, s = PR(b);
    const l = tankLayout()[0], M = TANK.mass;
    const bd = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.4).setAngularDamping(1.5).setCcdEnabled(false);
    const cols = [
      RAPIER.ColliderDesc.cylinder(0.3, TANK.R).setMass(M * 0.72).setFriction(0.4).setRestitution(0).setCollisionGroups(GR.mount),
      RAPIER.ColliderDesc.cone(0.72, 1.55).setTranslation(0, 1.02, 0).setMass(M * 0.2).setFriction(0.4).setRestitution(0).setCollisionGroups(GR.mount),
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cols.push(RAPIER.ColliderDesc.ball(0.18).setTranslation(Math.sin(a) * 1.25, -0.27, Math.cos(a) * 1.25).setMass(M * 0.013).setFriction(0.02).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0).setCollisionGroups(GR.mount));
    }
    const hull = u.addExtraBody(bd, cols, l.pos, l.quat);
    const k = { u, hull, mounted: true, broken: false, thinkT: -1, reload: 0.55, ripple: -1, rippleT: 0, start: 0, goalYaw: u.spawnYaw, goalSpeed: 0, ejectT: -1 };
    k.big = addBig(b, { u, e: hull, a: V(0, -0.1, 0), b: V(0, 0.95, 0), r: 1.65, hp: TANK.hp, mass: M, flesh: false, blastK: 0.8, onDie: (att) => wreck(b, k, att) });
    // the engineer sits in the hatch, pinned at the hips
    const seat = TANK.seat.clone().applyQuaternion(hull.quat).add(hull.pos);
    const p = u.rag.pos[PART.pelvis];
    moveRag(u, seat.x - p.x, seat.y - p.y, seat.z - p.z);
    setRiderGroups(u, true);
    const jd = RAPIER.JointData.spherical({ x: TANK.seat.x, y: TANK.seat.y, z: TANK.seat.z }, { x: 0, y: 0, z: 0 });
    k.joint = b.world.createImpulseJoint(jd, hull.body, u.rag.bodies[PART.pelvis], true);
    u.skel.radius = TANK.combatR;
    u.pr = k;
    s.tanks.push(k);
  },
  think(u, dt, c) {
    const k = u.pr;
    if (!k.mounted) return footMelee(u, c, u.def.weapon.cooldown);
    const b = u.battle, t = c.t, p = k.hull.pos;
    k.thinkT = b.time;
    u.desired.set(0, 0, 0);
    const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz);
    k.goalYaw = Math.abs(p.x) > FIELD.x + 4 || Math.abs(p.z) > FIELD.z + 3 ? Math.atan2(-p.x, -p.z) : Math.atan2(dx, dz);
    const bear = angleDiff(yawOf(k.hull.quat), k.goalYaw);
    k.goalSpeed = d - t.skel.radius < TANK.R + 1.2 ? 0 : Math.abs(bear) > 0.9 ? 0.3 : TANK.speed;
    u.expr = d < 12 ? EXPR.angry : EXPR.normal;
    return t;
  },
  step(u) {
    const k = u.pr, c = u.control;
    u.st.smStun = u.stun > 0.3;
    if (!k.mounted) return;
    u.airT = 0;
    if (c) { // possessed: the stick drives the tank, attack fires a ripple when loaded
      const m = Math.hypot(c.mx, c.mz);
      k.thinkT = u.battle.time;
      if (m > 0.2) k.goalYaw = Math.atan2(c.mx, c.mz);
      k.goalSpeed = TANK.speed * clamp(m, 0, 1);
      if (c.attack) k.fireNow = true;
    }
    u.desired.set(0, 0, 0);
  },
  hit(u, amount, part, attacker, kind) {
    const k = u.pr;
    if (!k || !k.mounted || !k.big.alive) return amount;
    // the planks soak up most of it; shot and arrows barely scratch them
    const small = kind === 'arrow' || kind === 'shot' || kind === 'bullet' || kind === 'spear';
    const k2 = small ? 0.5 : 1;
    hurtBig(u.battle, k.big, amount * TANK.share * k2, attacker);
    return amount * (1 - TANK.share) * k2;
  },
  die(u) {
    const k = u.pr;
    if (k && k.joint) { u.battle.world.removeImpulseJoint(k.joint, true); k.joint = null; }
    if (k) k.mounted = false;
  },
};
function wreck(b, k) {
  k.broken = true;
  const u = k.u, h = k.hull, p = h.pos;
  b.emit('dust', p.x, p.y, p.z, 8);
  b.emit('dust', p.x + 0.9, p.y + 0.6, p.z - 0.5, 4);
  b.emit('spark', p.x, p.y + 1, p.z, 6);
  b.sound('crunch', p, 1.4, 0.45);
  b.sound('debris', p, 1.0, 0.7);
  // the wreck sags over onto one side; everyone walks over the planks
  for (let i = 0; i < h.body.numColliders(); i++) h.body.collider(i).setCollisionGroups(GR.dead);
  const sd = Math.random() < 0.5 ? -1 : 1;
  shoveBig(k.big, 0, TANK.mass * 1.2, 0, V(p.x + sd * 1.2, p.y + 0.5, p.z), 3);
  if (k.joint) { b.world.removeImpulseJoint(k.joint, true); k.joint = null; }
  if (k.mounted && u.alive) {
    // the engineer is thrown out of the hatch and fights on with his fists
    k.mounted = false;
    k.ejectT = 0;
    u.st.style = 'fists';
    u.skel.radius = Math.max(u.skel.rChest, 0.25 * u.s);
    u.stun = Math.max(u.stun, 1.2);
    const a = rand(0, Math.PI * 2);
    u.rag.impulseAll(Math.sin(a) * u.M * 3.2, u.M * 5.5, Math.cos(a) * u.M * 3.2);
    b.voice(u, 'scream', true);
  }
  k.mounted = false;
}
function stepTank(b, k, dt) {
  const u = k.u, e = k.hull, body = e.body, q = e.quat, w = u.def.weapon;
  if (k.ejectT >= 0) { k.ejectT += dt; if (k.ejectT > 0.9) { if (u.alive) setRiderGroups(u, false); k.ejectT = -1; } }
  const up = upOf(q);
  const crewing = k.mounted && u.alive && !k.broken && b.time - k.thinkT < 0.1 && !b.over && up.y > 0.6;
  if (crewing) {
    // roll along the hull's heading; side slip is gripped away; turn slowly
    const yaw = yawOf(q);
    _f.set(Math.sin(yaw), 0, Math.cos(yaw)); _l.set(_f.z, 0, -_f.x);
    const v = body.linvel();
    let vf = v.x * _f.x + v.z * _f.z, vl = v.x * _l.x + v.z * _l.z;
    vf += clamp(k.goalSpeed - vf, -2 * dt, 1.2 * dt);
    vl *= 1 - Math.min(1, 5 * dt);
    body.setLinvel({ x: _f.x * vf + _l.x * vl, y: v.y, z: _f.z * vf + _l.z * vl }, true);
    const av = body.angvel();
    body.setAngvel({ x: av.x, y: clamp(angleDiff(yaw, k.goalYaw) * 1.2, -TANK.turn, TANK.turn), z: av.z }, true);

    // reload, then a ripple of shots all the way round
    k.reload += dt / w.reload;
    if (k.ripple < 0 && k.reload >= 1 && (k.fireNow || enemyNear(b, u, e.pos, w.range))) {
      k.ripple = 0; k.rippleT = 0; k.reload = 0; k.start = Math.floor(rand(0, TANK.N)); k.fireNow = false;
      b.sound('click', e.pos, 0.6, 0.6);
    }
  }
  else if (!body.isSleeping()) {
    // unmanned: the wheels are chocked
    const v = body.linvel(), d = 1 - Math.min(1, 3 * dt);
    body.setLinvel({ x: v.x * d, y: v.y, z: v.z * d }, true);
  }
  if (k.ripple >= 0) {
    k.rippleT -= dt;
    if (k.rippleT <= 0) {
      if (u.alive && !k.broken) fireBarrel(b, k, (k.start + k.ripple) % TANK.N);
      k.ripple++; k.rippleT = 0.13;
      if (k.ripple >= TANK.N) k.ripple = -1;
    }
  }
  updateBig(k.big);
}
function enemyNear(b, u, p, R) {
  for (const o of b.teams[1 - u.team]) if (o.alive && (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < R * R) return true;
  return false;
}
function fireBarrel(b, k, i) {
  const u = k.u, w = u.def.weapon, e = k.hull;
  const a = (i / TANK.N) * Math.PI * 2 + Math.PI / TANK.N;
  const from = _p.set(Math.sin(a) * TANK.muzzleR, TANK.muzzleY, Math.cos(a) * TANK.muzzleR).applyQuaternion(e.quat).add(e.pos);
  _a.set(Math.sin(a), 0, Math.cos(a)).applyQuaternion(e.quat);
  _a.y = 0; _a.normalize();
  // each gun lays itself on the nearest enemy in its arc (or just fires flat)
  let yaw = Math.atan2(_a.x, _a.z), ang = 0.07, best = null, bd = w.range;
  for (const o of b.teams[1 - u.team]) {
    if (!o.alive) continue;
    const dx = o.pos.x - from.x, dz = o.pos.z - from.z, d = Math.hypot(dx, dz);
    if (d < bd && Math.abs(angleDiff(yaw, Math.atan2(dx, dz))) < 0.6) { bd = d; best = o; }
  }
  if (best) {
    const a2 = ballisticAngle(bd, best.pos.y - 0.25 - from.y, w.ballSpeed, PRP.pr_cannonball.g, false);
    if (a2 !== null) ang = clamp(a2, -0.12, 0.35);
    yaw += clamp(angleDiff(yaw, Math.atan2(best.pos.x - from.x, best.pos.z - from.z)), -0.3, 0.3);
  }
  ang += rand(-0.02, 0.02); yaw += rand(-0.03, 0.03);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const vel = V(fx * Math.cos(ang), Math.sin(ang), fz * Math.cos(ang)).multiplyScalar(w.ballSpeed * rand(0.95, 1.05));
  addProjectile(b, 'pr_cannonball', from, vel, u, { life: 6 });
  b.emit('explode', from.x + fx * 0.25, from.y, from.z + fz * 0.25, 0.55, 0);
  b.sound('boom', from, 0.95, 0.9 + rand(-0.05, 0.05));
  // each shot rocks the hull a little
  shoveBig(k.big, -fx * TANK.mass * 0.12, 0, -fz * TANK.mass * 0.12, _a.copy(from).setY(from.y + 0.5), 1);
}

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'rn_halberd', name: 'Halberd', faction: 'renaissance', cost: 140, hp: 150, speed: 4.0,
    build: { scale: 1.03, girth: 1.05 },
    weapon: { line: 'Melee · long-reach halberd chops through a line', kind: 'melee', style: 'twohand', anim: 'slam', item: 'rn_halberd', damage: 60, reach: 2.2, cooldown: 1.5, force: 380, sweep: true },
    look: { skin: '#f0c8a0', hat: 'rn_morion', top: 'rn_doublet', legs: '#e9dcc0', cuirass: true },
    personality: { aggro: 0.85, bravery: 0.1, voice: 0.9, chatter: 0.4, cry: 'charge', idle: 'brace' },
    armor: 0.15,
    desc: 'Keeps the enemy at a halberd\'s length. Then chops.',
  },
  {
    id: 'rn_fencer', name: 'Fencer', faction: 'renaissance', cost: 140, hp: 100, speed: 7.0,
    build: { scale: 0.97, girth: 0.88, legs: 1.06 },
    weapon: { line: 'Melee · very fast, lunging rapier thrusts', kind: 'rn_fencer', style: 'sword', anim: 'stab', item: 'rn_rapier', damage: 38, reach: 1.45, cooldown: 0.55, force: 130 },
    look: { skin: '#f2c8a0', hat: 'rn_plume', top: 'rn_doublet', legs: '#2a2630', capelet: true },
    personality: { aggro: 1, bravery: 0.15, voice: 1.15, chatter: 0.8, cry: 'la', idle: 'bounce' },
    desc: 'En garde! Darts in, lunges, springs back.',
  },
  {
    id: 'rn_musketeer', name: 'Musketeer', faction: 'renaissance', cost: 125, hp: 95, speed: 4.2,
    build: { scale: 1.0, girth: 1.0 },
    weapon: { line: 'Ranged · musket volleys: waits for the line, then all fire', kind: 'pr_gun', volley: true, wait: 0.6, big: true, style: 'spear', anim: 'punch', item: 'rn_musket', damage: 70, speed: 85, range: 32, minRange: 6, cooldown: 0.5, reload: 5.0, ammo: 1, force: 260, spread: 0.022, releaseAt: 0.5, windup: 0.55, barrel: 1.05 },
    look: { skin: '#f0c8a0', hat: 'rn_cavalier', top: 'rn_tabard', legs: '#3a3440', beard: '#6a4a2a' },
    personality: { aggro: 0.35, bravery: 0.2, voice: 0.95, chatter: 0.5, cry: 'charge', idle: 'shift' },
    desc: 'Ready... aim... FIRE! Always together.',
  },
  {
    id: 'rn_balloon', name: 'Balloon Archer', faction: 'renaissance', cost: 230, hp: 90, speed: 4.0,
    build: { scale: 0.96, girth: 0.95 },
    weapon: { line: 'Flying · shoots arrows from under a balloon · drops if it pops', kind: 'rn_balloon', style: 'bow', anim: 'bow', item: 'bow', proj: 'arrow', speed: 34, arc: 'low', range: 32, minRange: 3, cooldown: 2.7, damage: 36, force: 90, spread: 0.035, releaseAt: 0.78, windup: 1.0 },
    look: { skin: '#f2c8a0', hat: 'rn_aviator', top: 'rn_doublet', legs: '#4a3a2e', quiver: true },
    personality: { aggro: 0.3, bravery: 0, voice: 1.2, chatter: 0.6, cry: 'yip', idle: 'float' },
    desc: 'Floats over the fight shooting arrows. Pop the balloon and down he comes.',
  },
  {
    id: 'rn_painter', name: 'Painter', faction: 'renaissance', cost: 200, hp: 80, speed: 4.2,
    build: { scale: 0.95, girth: 1.05, head: 1.08 },
    weapon: { line: 'Support · flings paint: splashed enemies are slowed', kind: 'ranged', style: 'throw', anim: 'throw', item: 'rn_brush', proj: 'rn_paint', speed: 14, arc: 'low', range: 18, minRange: 4, cooldown: 2.2, damage: 8, force: 40, spread: 0.06, releaseAt: 0.7, windup: 0.8, blast: 1.7, slow: 5 },
    look: { skin: '#f2c8a0', hat: 'rn_beret', top: 'rn_smock', legs: '#3a3a48', beard: '#4a2e1e' },
    personality: { aggro: 0.2, bravery: 0.4, voice: 1.3, chatter: 1, cry: 'la', idle: 'play' },
    desc: 'A true artist. His masterpieces slow the enemy down.',
  },
  {
    id: 'rn_davinci', name: 'Da Vinci Tank', faction: 'renaissance', cost: 1550, hp: 300, speed: 3.6,
    build: { scale: 1.0, girth: 1.0, legs: 0.62, radius: 2.15 },
    weapon: { line: 'Vehicle · rolls slowly, firing cannons all round · crewed', kind: 'rn_davinci', style: 'rn_tank', anim: 'slam', item: 'none', damage: 90, ballSpeed: 26, range: 34, reload: 2.5, cooldown: 1.0, reach: 1.0, force: 400 },
    look: { skin: '#f0c8a0', hat: 'rn_leo', top: 'rn_smock', legs: '#4a3a2e', beard: '#e8e4dc' },
    personality: { aggro: 0.6, bravery: 0, voice: 0.75, chatter: 0.6, cry: 'magic', idle: 'regal' },
    desc: 'Leonardo\'s wooden war machine. Cannons on every side.',
  },
  {
    id: 'rn_jouster', name: 'Jouster', faction: 'renaissance', cost: 950, hp: 260, speed: 4.0,
    build: { scale: 1, girth: 1.05, mass: 1.3, radius: 1.25 },
    weapon: { line: 'Mounted · charges the most valuable enemy · shield · lance unhorses riders', kind: 'rn_jouster', style: 'rn_joust', footStyle: 'spear', anim: 'stab', item: 'sm_lance', shield: 'round', blockMelee: 0.3, damage: 85, reach: 2.6, cooldown: 1.3, force: 950, champion: 0.6 },
    look: { skin: '#f0c8a0', hat: 'rn_tilt', top: 'armor', legs: '#8d939c', armor: true },
    personality: { aggro: 1, bravery: 0, voice: 0.9, chatter: 0.6, cry: 'royal', idle: 'regal' },
    armor: 0.3, stagger: 0.6,
    desc: 'A tournament champion. Picks the finest knight on the field and rides him down.',
  },
];
const DEF = Object.fromEntries(units.map((d) => [d.id, d]));

// the engineer sits in the hatch (also in setup previews: st.bob lifts him)
{
  const sk = makeSkeleton(DEF.rn_davinci.build);
  RIDE.rn_tank = { lift: TANK.pos.y + TANK.seat.y - sk.standHeight, roll: 0.25, pitch: -1.25, bend: 1.35, arms: (pose) => { setArm(pose, 1, LEVER); setArm(pose, -1, LEVER); } };
}

setupRidePoses({ rn_joust: { cfg: HORSE, standHeight: makeSkeleton(DEF.rn_jouster.build).standHeight } });

// ------------------------------------------------------------------ visuals
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, metal, wood, darkWood, leather, gold } = H;
  const tc = tcol(H, team);
  const steel = mat('#c8ced6', { spec: 1 }), iron = mat('#4a4e56', { spec: 0.8 });
  if (name === 'rn_halberd') {
    const L = 2.4 * s, c = -0.35 * L, top = c + L;
    mesh(cyl(0.024 * s, 0.028 * s, L, 7), darkWood(), 0, c + L / 2, 0, g);
    mesh(cone(0.035 * s, 0.38 * s, 4), steel, 0, top + 0.17 * s, 0, g); // spike
    const ax = mesh(box(0.018 * s, 0.34 * s, 0.26 * s), steel, 0, top - 0.17 * s, 0.15 * s, g); ax.rotation.x = 0.08; // axe blade
    mesh(box(0.02 * s, 0.4 * s, 0.035 * s), steel, 0, top - 0.17 * s, 0.29 * s, g).rotation.x = 0.08; // edge
    const hk = mesh(cone(0.03 * s, 0.22 * s, 4), steel, 0, top - 0.12 * s, -0.12 * s, g); hk.rotation.x = -Math.PI / 2 - 0.3; // back hook
    mesh(box(0.04 * s, 0.42 * s, 0.04 * s), iron, 0, top - 0.3 * s, 0, g); // langets
    mesh(cyl(0.04 * s, 0.04 * s, 0.05 * s, 8), tc, 0, top - 0.55 * s, 0, g);
    for (let i = 0; i < 4; i++) { const t = mesh(box(0.012 * s, 0.14 * s, 0.012 * s), tc, Math.sin(i * 1.6) * 0.035 * s, top - 0.64 * s, Math.cos(i * 1.6) * 0.035 * s, g); t.rotation.z = Math.sin(i) * 0.2; }
    return true;
  }
  if (name === 'rn_rapier') {
    const L = 1.2 * s;
    mesh(box(0.012 * s, L * 0.82, 0.026 * s), steel, 0, L * 0.18 + L * 0.41, 0, g);
    mesh(cone(0.014 * s, 0.06 * s, 4), steel, 0, L * 1.0 + 0.0, 0, g);
    mesh(cyl(0.024 * s, 0.024 * s, L * 0.14, 8), leather(), 0, L * 0.07, 0, g);
    const cg = mesh(H.capsule(0.014 * s, 0.26 * s), gold(), 0, L * 0.16, 0, g); cg.rotation.z = Math.PI / 2; // quillons
    const cup = mesh(dome(H, 0.07 * s, 0.45), gold(), 0, L * 0.2, 0, g); cup.rotation.x = Math.PI;
    for (const sd of [-1, 1]) { const lp = mesh(torus(H, 0.07 * s, 0.008 * s, Math.PI, 10), gold(), 0, L * 0.1, sd * 0.02 * s, g); lp.rotation.z = Math.PI / 2; lp.rotation.y = sd * 0.5; }
    mesh(sphere(0.035 * s, 8, 6), gold(), 0, -0.02 * s, 0, g);
    return true;
  }
  if (name === 'rn_musket') {
    const L = 1.6 * s, back = 0.3 * L;
    const st = mesh(box(0.05 * s, L * 0.36, 0.09 * s), wood(), 0, -back + L * 0.14, -0.02 * s, g); st.rotation.x = 0.12; // stock
    mesh(box(0.045 * s, L * 0.5, 0.05 * s), wood(), 0, -back + L * 0.52, 0.01 * s, g); // fore-end
    mesh(cyl(0.017 * s, 0.02 * s, L * 0.72, 8), iron, 0, -back + L * 0.62, 0.04 * s, g); // barrel
    mesh(cyl(0.022 * s, 0.022 * s, 0.03 * s, 8), mat('#c89a3a', { spec: 0.9 }), 0, -back + L * 0.98, 0.04 * s, g);
    mesh(cyl(0.006 * s, 0.006 * s, L * 0.6, 4), darkWood(), 0, -back + L * 0.6, -0.025 * s, g); // ramrod
    mesh(box(0.04 * s, 0.07 * s, 0.03 * s), iron, 0.015 * s, -back + L * 0.3, 0.04 * s, g); // lock
    mesh(box(0.05 * s, 0.04 * s, 0.1 * s), mat('#c89a3a', { spec: 0.9 }), 0, -back - 0.02 * s, -0.03 * s, g); // butt plate
    return true;
  }
  if (name === 'rn_brush') {
    mesh(cyl(0.014 * s, 0.02 * s, 0.42 * s, 6), wood(), 0, 0.2 * s, 0, g);
    mesh(cyl(0.022 * s, 0.018 * s, 0.06 * s, 8), metal(), 0, 0.43 * s, 0, g);
    mesh(cone(0.026 * s, 0.1 * s, 8), mat(paintCol(), { spec: 0.5 }), 0, 0.5 * s, 0, g);
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const plume = (col, x, y, z, rx, rz, k = 1) => { const f = mesh(sphere(r * 0.5 * k, 10, 6), col, x, y, z, g); f.scale.set(0.25, 1.3, 0.5); f.rotation.set(rx, 0, rz); return f; };
  switch (kind) {
    case 'rn_morion': { // crested helmet with a boat-shaped brim
      const st = metal();
      mesh(dome(H, r * 1.07, 0.5), st, 0, r * 0.28, 0, g).scale.set(1, 0.95, 1.05);
      mesh(cyl(r * 1.32, r * 1.32, r * 0.05, 20), st, 0, r * 0.3, 0, g).scale.set(0.82, 1, 1.18);
      for (const sd of [-1, 1]) { const pk = mesh(box(r * 0.8, r * 0.05, r * 0.45), st, 0, r * 0.42, sd * r * 1.42, g); pk.rotation.x = sd * -0.55; }
      const comb = mesh(cyl(r * 0.62, r * 0.62, r * 0.06, 18), st, 0, r * 0.72, 0, g); comb.rotation.z = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mesh(sphere(r * 0.05, 5, 4), gold(), Math.sin(a) * r * 1.06, r * 0.36, Math.cos(a) * r * 1.1, g); }
      plume(tc, -r * 0.3, r * 1.0, -r * 0.65, -0.7, 0.3, 0.9);
      return true;
    }
    case 'rn_plume': case 'rn_beret': { // a floppy beret (the fencer's with a big feather)
      const fencer = kind === 'rn_plume';
      const m = fencer ? tc : mat('#2a2430', { spec: 0.05 });
      const b = mesh(sphere(r * 1.15, 16, 8), m, -r * 0.12, r * 0.72, -r * 0.05, g); b.scale.set(1.12, 0.32, 1.08); b.rotation.z = 0.18;
      headBand(H, r, 0.52, 0.18, fencer ? td : mat('#1a161e'), g, 0.04);
      if (fencer) { plume(mat('#f6f2ea'), r * 0.5, r * 1.05, -r * 0.5, -0.9, -0.7, 1.1); plume(mat('#f6f2ea'), r * 0.62, r * 0.95, -r * 0.3, -0.5, -0.9, 0.9); }
      else mesh(cyl(r * 0.04, r * 0.04, r * 0.18, 5), m, -r * 0.1, r * 1.0, 0, g);
      return true;
    }
    case 'rn_cavalier': { // wide-brimmed musketeer hat, one side pinned up, big plume
      const felt = mat('#2e2a26', { spec: 0.1 });
      const br = mesh(cyl(r * 1.8, r * 1.8, r * 0.06, 22), felt, 0, r * 0.66, 0, g); br.rotation.z = -0.2;
      mesh(cyl(r * 0.78, r * 0.86, r * 0.55, 16), felt, 0, r * 0.95, 0, g);
      mesh(cyl(r * 0.88, r * 0.88, r * 0.14, 16), tc, 0, r * 0.75, 0, g);
      plume(tc, r * 0.6, r * 1.15, -r * 0.3, -0.5, -1.0, 1.25);
      plume(mat('#f6f2ea'), r * 0.75, r * 1.0, -r * 0.1, -0.3, -1.2, 1.0);
      mesh(sphere(r * 0.1, 6, 5), gold(), r * 0.86, r * 0.82, r * 0.1, g);
      return true;
    }
    case 'rn_aviator': { // leather cap with ear flaps and goggles
      const lth = mat('#7a5232', { spec: 0.2 });
      mesh(dome(H, r * 1.07, 0.55), lth, 0, r * 0.1, 0, g);
      for (const sd of [-1, 1]) { const f = mesh(box(r * 0.12, r * 0.6, r * 0.42), lth, sd * r * 0.98, -r * 0.2, -r * 0.05, g); f.rotation.z = sd * 0.1; }
      headBand(H, r, 0.45, 0.2, tc, g, 0.06);
      for (const sd of [-1, 1]) {
        const l = mesh(cyl(r * 0.22, r * 0.22, r * 0.16, 12), metal(), sd * r * 0.3, r * 0.62, r * 0.85, g); l.rotation.x = Math.PI / 2 - 0.5;
        const gl = mesh(cyl(r * 0.17, r * 0.17, r * 0.02, 12), glow('#bfe8ff'), sd * r * 0.3, r * 0.66, r * 0.93, g); gl.rotation.x = Math.PI / 2 - 0.5; gl.castShadow = false;
      }
      return true;
    }
    case 'rn_tilt': { // a frog-mouthed jousting helm with a crest, plumes and mantling
      const st = metal();
      const hm = mesh(sphere(r * 1.12, 18, 14), st, 0, r * 0.12, -r * 0.05, g); hm.scale.set(1, 1.05, 1.12);
      const beak = mesh(cone(r * 0.8, r * 0.9, 4), st, 0, -r * 0.05, r * 0.85, g); beak.rotation.x = Math.PI / 2; beak.scale.set(1.15, 1, 0.55);
      mesh(box(r * 1.3, r * 0.07, r * 0.2), mat('#121214'), 0, r * 0.38, r * 0.98, g); // the sight
      mesh(box(r * 1.6, r * 0.12, r * 1.1), st, 0, -r * 0.62, r * 0.1, g); // the bevor
      mesh(box(r * 0.12, r * 0.5, r * 1.3), gold(), 0, r * 1.15, -r * 0.05, g); // crest
      plume(tc, 0, r * 1.5, -r * 0.2, -0.3, 0, 1.2);
      plume(mat('#f6f2ea'), r * 0.2, r * 1.42, -r * 0.45, -0.6, -0.3, 1.0);
      plume(td, -r * 0.2, r * 1.42, -r * 0.45, -0.6, 0.3, 1.0);
      for (const sd of [-1, 1]) { const mt = mesh(box(r * 0.08, r * 1.3, r * 0.9), sd > 0 ? tc : mat('#f6f2ea'), sd * r * 0.6, -r * 0.2, -r * 1.05, g); mt.rotation.set(0.35, 0, sd * 0.3); }
      g.userData.hidesFace = true;
      return true;
    }
    case 'rn_leo': { // the master's soft cap and long white hair
      const cap = mat('#6a2830', { spec: 0.05 });
      const c = mesh(sphere(r * 1.1, 16, 8), cap, 0, r * 0.55, -r * 0.05, g); c.scale.set(1.05, 0.55, 1.05);
      headBand(H, r, 0.42, 0.22, mat('#4a1a22'), g, 0.07);
      const hair = mat('#e8e4dc', { spec: 0.05 });
      mesh(hoodGeo(H, r, 1.05, 1.3), hair, 0, -r * 0.1, 0, g);
      const h1 = mesh(H.capsule(r * 0.5, r * 0.6), hair, 0, -r * 0.6, -r * 0.5, g); h1.scale.set(1.3, 1, 0.6);
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'renaissance') return;
  // extra bodies first, in the order init() makes them
  if (def.id === 'rn_davinci') for (const l of tankLayout()) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
  if (def.id === 'rn_balloon') for (const l of balloonLayout(vis.skel)) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
  if (def.id === 'rn_jouster') for (const l of mountLayout(JHORSE)) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, leather, metal } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  const pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const white = mat('#f4f0e6', { spec: 0.1 });
  const ruff = () => {
    const rf = mesh(torus(H, r * 0.62, r * 0.2, Math.PI * 2, 18), white, 0, hh + r * 0.52, 0, C); rf.rotation.x = Math.PI / 2; rf.scale.set(1, 1, 0.65);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mesh(sphere(r * 0.12, 5, 4), white, Math.sin(a) * r * 0.8, hh + r * 0.52, Math.cos(a) * r * 0.78, C); }
  };
  if (top === 'rn_doublet') { // slashed doublet, ruff, puffed sleeves and trunk hose
    chestShell(H, ch, tc, C);
    for (let i = -2; i <= 2; i++) { const s = mesh(box(r * 0.08, (hh + r) * 1.5, r * 0.05), gold(), i * r * 0.26, -hh * 0.1, r * 1.04 - Math.abs(i) * r * 0.06, C); s.rotation.y = i * 0.25; }
    mesh(cyl(r * 1.21, r * 1.21, r * 0.2, 16), leather(), 0, -hh - r * 0.38, 0, C).scale.set(1, 1, 0.95);
    ruff();
    for (const p of [PART.uarmL, PART.uarmR]) {
      const ap = skel.parts[p];
      const puff = mesh(sphere(ap.r * 1.9, 12, 8), td, 0, ap.hh * 0.35, 0, parts[p]); puff.scale.set(1, 1.35, 1);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const s = mesh(box(ap.r * 0.35, ap.r * 3.2, ap.r * 0.3), gold(), Math.sin(a) * ap.r * 1.75, ap.hh * 0.35, Math.cos(a) * ap.r * 1.75, parts[p]); s.rotation.y = a; }
    }
    const hose = mesh(sphere(pel.r * 1.42, 14, 10), td, 0, -pel.r * 0.35, 0, P); hose.scale.set(1.12, 0.85, 1.02);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const s = mesh(box(pel.r * 0.18, pel.r * 1.6, pel.r * 0.12), i % 2 ? gold() : tc, Math.sin(a) * pel.r * 1.5, -pel.r * 0.35, Math.cos(a) * pel.r * 1.38, P); s.rotation.y = a; }
    if (def.look.cuirass) { // halberdier's breastplate
      const cu = mesh(H.capsule(r * 1.26, hh * 2), metal(), 0, -hh * 0.05, r * 0.3, C); cu.scale.set(1, 0.85, 0.62);
      mesh(box(r * 0.06, (hh + r) * 1.4, r * 0.06), gold(), 0, -hh * 0.05, r * 1.12, C);
    }
    if (def.look.capelet) { // a short cape over one shoulder
      const cp = mesh(box(r * 1.5, (hh + r) * 1.45, r * 0.07), td, r * 0.35, -hh * 0.1, -r * 1.08, C); cp.rotation.set(0.12, 0, 0.18);
      mesh(sphere(r * 0.12, 6, 5), gold(), r * 0.85, hh + r * 0.2, r * 0.3, C);
    }
  }
  if (def.id === 'rn_jouster') { // a quartered surcoat over the plate
    for (const z of [1, -1]) {
      for (const sd of [-1, 1]) mesh(box(r * 0.75, (hh + r) * 1.05, r * 0.05), sd * z > 0 ? tc : white, sd * r * 0.37, hh * 0.35, z * r * 1.12, C);
      for (const sd of [-1, 1]) mesh(box(r * 0.75, (hh + r) * 1.05, r * 0.05), sd * z > 0 ? white : tc, sd * r * 0.37, -hh * 0.65 - r * 0.2, z * r * 1.12, C);
    }
    mesh(cyl(r * 1.24, r * 1.24, r * 0.18, 16), gold(), 0, -hh - r * 0.38, 0, C).scale.set(1, 1, 0.95);
    for (const sd of [-1, 1]) { const pa = mesh(sphere(r * 0.55, 10, 8), metal(), sd * r * 1.05, hh + r * 0.3, 0, C); pa.scale.set(1, 0.6, 1); }
  }
  if (top === 'rn_tabard') { // musketeer's tabard with a cross, bandolier of powder charges
    chestShell(H, ch, td, C);
    for (const z of [1, -1]) {
      mesh(box(r * 1.5, (hh + r) * 2.1, r * 0.05), tc, 0, -hh * 0.3, z * r * 1.0, C);
      mesh(box(r * 0.22, (hh + r) * 1.5, r * 0.06), white, 0, -hh * 0.2, z * r * 1.03, C);
      mesh(box(r * 1.0, r * 0.22, r * 0.06), white, 0, hh * 0.25, z * r * 1.03, C);
    }
    const band = mesh(box(r * 0.16, (hh + r) * 2.1, r * 0.05), leather(), 0, 0, r * 1.09, C); band.rotation.z = 0.6;
    for (const k of [-1, -0.33, 0.33, 1]) mesh(cyl(r * 0.08, r * 0.08, r * 0.24, 6), H.wood(), Math.sin(0.6) * k * r * 0.6, -k * r * 0.6 * Math.cos(0.6), r * 1.14, C);
    mesh(cyl(r * 1.21, r * 1.21, r * 0.2, 16), leather(), 0, -hh - r * 0.38, 0, C).scale.set(1, 1, 0.95);
    for (const p of [PART.farmL, PART.farmR]) { const fp = skel.parts[p]; mesh(cyl(fp.r * 1.8, fp.r * 1.4, fp.hh * 0.6, 10), white, 0, -fp.hh * 0.45, 0, parts[p]); }
  }
  if (top === 'rn_smock') { // artist's smock, paint everywhere, a floppy bow at the neck
    const sm = mat('#efe8da', { spec: 0.05 });
    chestShell(H, ch, sm, C);
    for (let i = 0; i < 9; i++) { const a = rand(-1.2, 1.2), y = rand(-hh - r * 0.5, hh + r * 0.3); const d = mesh(sphere(r * rand(0.08, 0.16), 6, 5), mat(paintCol(), { spec: 0.5 }), Math.sin(a) * r * 1.1, y, Math.cos(a) * r * 1.02, C); d.scale.set(1, 1, 0.4); d.lookAt(Math.sin(a) * 9, y, Math.cos(a) * 9); }
    for (const sd of [-1, 1]) { const bw = mesh(cone(r * 0.22, r * 0.45, 6), tc, sd * r * 0.22, hh + r * 0.25, r * 0.92, C); bw.rotation.z = sd * Math.PI / 2; }
    mesh(sphere(r * 0.1, 6, 5), td, 0, hh + r * 0.25, r * 0.96, C);
    const sk = mesh(cyl(pel.r * 1.2, pel.r * 1.55, pel.r * 1.6, 16), sm, 0, -pel.r * 0.6, 0, P); sk.scale.set(1, 1, 0.92);
    for (const p of [PART.uarmL, PART.uarmR]) mesh(H.capsule(skel.parts[p].r * 1.25, skel.parts[p].hh * 2), sm, 0, 0, 0, parts[p]);
    if (def.id === 'rn_painter') { // the palette, on the left hand
      const pg = new THREE.Group();
      pg.position.set(0, -skel.handOffset - 0.02, 0.06 * skel.scale);
      const s = skel.scale;
      const pal = mesh(cyl(0.2 * s, 0.2 * s, 0.02 * s, 16), H.wood(), 0, 0, 0, pg); pal.scale.set(1, 1, 0.75); pal.rotation.x = Math.PI / 2 - 0.3;
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 1.5 + 0.4; const d = mesh(sphere(0.035 * s, 6, 5), mat(['#e8342a', '#2a6ee8', '#f4c81e', '#34b04a', '#f4f0e6', '#8a4ae8'][i], { spec: 0.6 }), Math.cos(a) * 0.13 * s, Math.sin(a) * 0.1 * s * Math.cos(0.3), 0.03 * s, pg); d.scale.set(1, 1, 0.5); }
      parts[PART.farmL].add(pg);
    }
  }
}

// ------------------------------------------------------------------ meshes
const _up = V(0, 1, 0);
function beam(H, g, a, b, r, m, n = 5) {
  const d = b.clone().sub(a), L = d.length();
  const o = H.mesh(H.cyl(r, r, L, n), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, g);
  o.quaternion.setFromUnitVectors(_up, d.normalize());
  return o;
}
// The balloon (origin at its centre): striped envelope, load ring, ropes to the harness.
function balloonMesh(H, team) {
  const g = new THREE.Group();
  const { mesh, mat, gold, box, cyl, sphere } = H;
  const R = 0.78, tc = mat(H.TEAM_COLORS[team], { spec: 0.35 }), cream = mat('#f4ecd8', { spec: 0.35 });
  for (let i = 0; i < 8; i++) {
    const gore = H.geo('rnbal' + i, () => new THREE.SphereGeometry(R, 4, 14, (i / 8) * Math.PI * 2, Math.PI / 4));
    mesh(gore, i % 2 ? cream : tc, 0, 0, 0, g).scale.set(1, 1.15, 1);
  }
  const eq = mesh(torus(H, R * 1.0, 0.025, Math.PI * 2, 24), gold(), 0, -0.05, 0, g); eq.rotation.x = Math.PI / 2;
  mesh(cyl(0.14, 0.24, 0.16, 12), tc, 0, -R * 1.1, 0, g);
  const ring = mesh(torus(H, 0.22, 0.02, Math.PI * 2, 14), H.darkWood(), 0, -1.05, 0, g); ring.rotation.x = Math.PI / 2;
  const rope = mat('#c8b07a'), hp = V(0, -1.81, -0.14);
  for (const [x, z] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) {
    beam(H, g, V(x * 1.8, -0.72, z * 1.8), V(x, -1.05, z), 0.01, rope);
    beam(H, g, V(x, -1.05, z), hp, 0.012, rope);
  }
  const bag = mesh(box(0.12, 0.16, 0.1), mat('#9a7a4a'), 0.22, -1.22, 0.05, g); bag.rotation.z = 0.1;
  mesh(box(0.012, 0.14, 0.22), tc, -0.2, -1.2, -0.1, g);
  return g;
}
// The jouster's horse: the cavalry horse under a long striped caparison, a chanfron
// on its head and a plume.
function joustHorse(H, team) {
  const out = SMM.horseTorso(H, team);
  const g = new THREE.Group(); g.scale.setScalar(SMM.HORSE_SCALE); out.add(g);
  const { mesh, box, cyl, sphere, cone, mat, metal, gold } = H;
  const tc = mat(H.TEAM_COLORS[team]), wh = mat('#f4f0e6', { spec: 0.05 });
  // stripes down each flank to a gold hem, a cloth over the back and the rump
  for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) {
    const z = 0.5 - i * 0.18;
    mesh(box(0.03, 0.46, 0.18), i % 2 ? wh : tc, sd * 0.47, 0.0, z, g).rotation.z = sd * 0.08;
    mesh(box(0.035, 0.06, 0.18), gold(), sd * 0.49, -0.24, z, g);
  }
  mesh(box(0.8, 0.42, 0.03), tc, 0, 0.02, -0.74, g);
  mesh(box(0.84, 0.04, 1.3), tc, 0, 0.385, -0.1, g);
  // chanfron: a steel plate down the face, a spike and a plume
  const ch = mesh(box(0.2, 0.06, 0.42), metal(), 0, 0.74, 1.3, g); ch.rotation.x = 1.0;
  const sp = mesh(cone(0.03, 0.18, 6), metal(), 0, 0.86, 1.32, g); sp.rotation.x = 0.6;
  for (const k of [-1, 0, 1]) { const f = mesh(sphere(0.07, 8, 6), k ? wh : tc, k * 0.05, 1.02, 1.02, g); f.scale.set(0.6, 1.8, 0.8); f.rotation.x = -0.4; }
  mesh(sphere(0.05, 6, 5), gold(), 0, 0.72, 1.12, g);
  return out;
}

// The tank hull (origin at the body centre, 0.45 above the ground at rest).
function tankMesh(H, team) {
  const g = new THREE.Group();
  const { mesh, mat, cyl, box, sphere, wood, darkWood, gold } = H;
  const tc = mat(H.TEAM_COLORS[team]), td = mat(H.TEAM_DARK[team]);
  const bronze = mat('#b08a40', { spec: 0.85 }), iron = mat('#3a3a40', { spec: 0.6 });
  mesh(cyl(1.76, 1.79, 0.6, 28), wood(), 0, 0, 0, g);
  mesh(cyl(1.8, 1.8, 0.16, 28), tc, 0, 0.14, 0, g);
  mesh(cyl(1.81, 1.81, 0.05, 28), iron, 0, -0.27, 0, g);
  mesh(cyl(0.42, 1.6, 1.15, 28), wood(), 0, 0.875, 0, g);
  const slope = Math.atan((1.6 - 0.42) / 1.15), sl = Math.hypot(1.6 - 0.42, 1.15);
  for (let i = 0; i < 16; i++) { // planks up the cone
    const a = (i / 16) * Math.PI * 2;
    const p = mesh(box(0.09, sl, 0.04), i % 4 ? darkWood() : td, Math.sin(a) * 1.02, 0.875, Math.cos(a) * 1.02, g);
    p.rotation.order = 'YXZ'; p.rotation.y = a; p.rotation.x = -slope;
  }
  for (let i = 0; i < 8; i++) { // gun ports and bronze barrels, all the way round
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const bg = new THREE.Group(); bg.rotation.y = a; g.add(bg);
    gunBarrel(H, bg, 0, 0.02, 1.45, 2.0, 0.09, bronze, iron);
    mesh(box(0.34, 0.22, 0.08), mat('#1a1410'), 0, 0.02, 1.77, bg);
    const port = mesh(box(0.2, 0.12, 0.06), mat('#1a1410'), 0, 0.62, 1.28, bg); port.rotation.x = -slope;
  }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const w = mesh(cyl(0.2, 0.2, 0.08, 12), darkWood(), Math.sin(a) * 1.25, -0.27, Math.cos(a) * 1.25, g); w.rotation.z = Math.PI / 2; }
  // the hatch, a team flag
  const hr = mesh(torus(H, 0.42, 0.06, Math.PI * 2, 18), tc, 0, 1.45, 0, g); hr.rotation.x = Math.PI / 2;
  const hg = mesh(torus(H, 0.47, 0.025, Math.PI * 2, 18), gold(), 0, 1.4, 0, g); hg.rotation.x = Math.PI / 2;
  mesh(cyl(0.025, 0.025, 1.1, 6), darkWood(), 0.34, 1.75, -0.3, g);
  mesh(box(0.015, 0.3, 0.46), tc, 0.34, 2.15, -0.55, g);
  mesh(box(0.016, 0.08, 0.46), gold(), 0.34, 2.04, -0.55, g);
  mesh(sphere(0.04, 6, 5), gold(), 0.34, 2.32, -0.3, g);
  return g;
}

function buildProj(type, g, H) {
  if (type !== 'rn_paint') return false;
  const c = paintCol();
  H.mesh(H.sphere(0.13, 10, 8), H.mat(c, { spec: 0.6 }), 0, 0, 0, g);
  for (let i = 0; i < 3; i++) H.mesh(H.sphere(0.05, 6, 5), H.mat(c, { spec: 0.6 }), rand(-0.12, 0.12), rand(-0.12, 0.12), rand(-0.15, -0.05), g).castShadow = false;
  return true;
}

register({
  factions: [{ id: 'renaissance', name: 'Renaissance', color: '#d0503c' }],
  units,
  items: {
    rn_halberd: { len: 2.4, r: 0.07, grip: 20, back: 0.35, metal: true, mass: 3.2 },
    rn_rapier: { len: 1.2, r: 0.04, grip: 85, metal: true, mass: 0.9 },
    rn_musket: { len: 1.6, r: 0.06, grip: 90, back: 0.3, mass: 2.6 },
    rn_brush: { len: 0.55, r: 0.04, grip: 40, mass: 0.3 },
  },
  kinds: { rn_fencer: fencer, rn_balloon: balloon, rn_davinci: tank, rn_jouster: jouster },
  proj: { rn_paint: paintBlob },
  buildItem, buildHat, decorate, buildProj,
  battleStep(b, dt) {
    const s = b._pr;
    if (!s) return;
    for (const k of s.balloons) stepBalloon(b, k, dt);
    for (const k of s.tanks) stepTank(b, k, dt);
  },
});

export { DEF as RN_DEF, SM, EXT };
