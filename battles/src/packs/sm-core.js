// Siege & mounts pack: shared plumbing.
//  - per-battle state (battle._sm) and the "big targets" registry: horse, mammoth and
//    siege-cart bodies that melee swings, projectiles and blasts can hit (the core only
//    tests ragdoll parts, so the battle's meleeSweep / projectileHits / explode methods
//    are wrapped per battle instance, never on the prototype)
//  - collision groups for mounts and riders
//  - the pose hook for riders and flyers (EXT.pose)
//  - simple on-foot AI for riders that lost their mount and crews that lost their engine
import { THREE, clamp, segSegDist2, eulerYZX, angleDiff } from '../util.js';
import { groups, G_GROUND, G_BODY, G_PROP, G_DEAD, GROUPS } from '../physics.js';
import { PART, NPARTS } from '../body.js';

export const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const UP = new V3(0, 1, 0), AX = new V3(1, 0, 0), AZ = new V3(0, 0, 1);
export const EXPR = { normal: 0, angry: 1, scared: 2, dead: 3, happy: 4, hurt: 5 };

// A rider sitting on a mount is in its own group: it touches the ground and scenery but
// not its mount (or other units), so the two can overlap without fighting each other.
export const G_RIDER = 0x20;
export const GR = {
  mount: groups(G_BODY, G_GROUND | G_BODY | G_PROP), // shoves living bodies, ignores limbs
  rider: groups(G_RIDER, G_GROUND | G_PROP),
  dead: groups(G_DEAD, G_GROUND | G_PROP),
  cart: GROUPS.prop,
};

export const qYaw = (yaw, out = new Q4()) => out.setFromAxisAngle(UP, yaw);
export const qPitch = (a, out = new Q4()) => out.setFromAxisAngle(AX, a);
export const qRoll = (a, out = new Q4()) => out.setFromAxisAngle(AZ, a);
const _f = new V3(), _u = new V3();
export function yawOf(q) { _f.set(0, 0, 1).applyQuaternion(q); return Math.atan2(_f.x, _f.z); }
export function upOf(q, out = _u) { return out.set(0, 1, 0).applyQuaternion(q); }

// Kinematic extra bodies (legs, heads, arms, wings) are placed after the physics step, so
// what is drawn and recorded matches the dynamic body they hang off this very frame.
export function placeExtra(e, pos, quat) {
  e.pos.copy(pos); e.quat.copy(quat);
  e.body.setTranslation(pos, false);
  e.body.setRotation(quat, false);
}

// ---------------------------------------------------------------- per-battle state
export function S(b) {
  if (!b._sm) {
    b._sm = { bigs: [], mounts: [], sieges: [], flyers: [], stuck: [] };
    patchBattle(b, b._sm);
  }
  return b._sm;
}

// ---------------------------------------------------------------- big targets
// g = { u (owner unit), e (extra entry), a, b (local segment), r, hp, mass, flesh, blastK, onDie }
export function addBig(b, g) {
  const s = S(b);
  g.A = new V3(); g.B = new V3();
  g.alive = true; g.maxHp = g.hp; g.team = g.u.team; g.body = g.e.body;
  updateBig(g);
  s.bigs.push(g);
  return g;
}
export function updateBig(g) {
  g.A.copy(g.a).applyQuaternion(g.e.quat).add(g.e.pos);
  g.B.copy(g.b).applyQuaternion(g.e.quat).add(g.e.pos);
}
export function hurtBig(b, g, dmg, att) {
  if (!g.alive) return;
  g.hp -= dmg;
  if (att && att.alive) att.damageDealt += dmg;
  if (g.hp <= 0) { g.hp = 0; g.alive = false; g.onDie?.(att); }
}
const _cp = new V3(), _d = new V3(), _j = new V3();
export function closestOnSeg(a, b, p, out) {
  _d.copy(b).sub(a);
  const L2 = _d.lengthSq();
  const t = L2 > 1e-9 ? clamp(_j.copy(p).sub(a).dot(_d) / L2, 0, 1) : 0;
  return out.copy(a).addScaledVector(_d, t);
}
// Push a big body at a world point, with the shove capped so nothing explodes.
export function shoveBig(g, jx, jy, jz, at, cap = 6) {
  const m = Math.hypot(jx, jy, jz), lim = g.mass * cap;
  if (m > lim) { const k = lim / m; jx *= k; jy *= k; jz *= k; }
  g.body.applyImpulseAtPoint({ x: jx, y: jy, z: jz }, { x: at.x, y: at.y, z: at.z }, true);
}

function hitFx(b, g, at, dmg, dx, dz) {
  if (g.flesh) {
    b.emit('blood', at.x, at.y, at.z, Math.min(14, 4 + dmg / 10), dx, dz);
    b.sound(dmg > 60 ? 'crunch' : 'thud', at, clamp(dmg / 40, 0.4, 1.4), g.pitch || 0.8);
  } else {
    b.emit('spark', at.x, at.y, at.z, 3);
    b.emit('dust', at.x, at.y, at.z, 1);
    b.sound('thud', at, clamp(dmg / 40, 0.4, 1.3), 0.55);
  }
}

function patchBattle(b, s) {
  const melee = b.meleeSweep.bind(b), proj = b.projectileHits.bind(b), boom = b.explode.bind(b);
  b.meleeSweep = (att, A, B, r, tipVel, tipSpeed) => {
    melee(att, A, B, r, tipVel, tipSpeed);
    const w = att.def.weapon;
    for (const g of s.bigs) {
      if (!g.alive || g.team === att.team || att.hitSet.has(g)) continue;
      const rr = r + g.r;
      if (segSegDist2(A, B, g.A, g.B) > rr * rr) continue;
      att.hitSet.add(g);
      const k = clamp(tipSpeed / 7, 0.55, 1.4) * (att.buff > 0 ? 1.15 : 1);
      const dmg = w.damage * k;
      _j.copy(tipVel).normalize(); _j.y = Math.max(_j.y, 0) + 0.25; _j.normalize();
      const f = (w.force || 200) * k * 0.5;
      shoveBig(g, _j.x * f, _j.y * f, _j.z * f, B, 5);
      hitFx(b, g, B, dmg, _j.x, _j.z);
      hurtBig(b, g, dmg, att);
    }
  };
  b.projectileHits = (pr, P) => {
    if (proj(pr, P)) return true;
    for (const g of s.bigs) {
      if (!g.alive || pr.hits.has(g) || g.u === pr.owner) continue;
      if (g.team === pr.team && !P.roll) continue;
      const rr = g.r + P.r;
      if (segSegDist2(pr.prev, pr.pos, g.A, g.B) > rr * rr) continue;
      pr.hits.add(g);
      if (P.bigHit) { if (P.bigHit(b, pr, g)) return true; continue; }
      if (P.explode) { b.explode(pr.pos, pr.blast, pr.damage, pr.force, pr.owner, P.explode); return true; }
      const speed = pr.vel.length();
      const k = P.roll ? clamp(speed / 10, 0.3, 1.3) : 1;
      _j.copy(pr.vel).normalize();
      shoveBig(g, _j.x * pr.force * k * 0.5, _j.y * pr.force * k * 0.5, _j.z * pr.force * k * 0.5, pr.pos, 3);
      hitFx(b, g, pr.pos, pr.damage * k, _j.x, _j.z);
      hurtBig(b, g, pr.damage * k, pr.owner);
      if (P.stick) { stickInto(b, s, g, pr); return true; }
      if (P.roll) { pr.vel.multiplyScalar(-0.35); return false; }
      return true;
    }
    return false;
  };
  b.explode = (pos, radius, damage, force, owner, kind) => {
    boom(pos, radius, damage, force, owner, kind);
    for (const g of s.bigs) {
      closestOnSeg(g.A, g.B, pos, _cp);
      const dist = _cp.distanceTo(pos), d = Math.max(0, dist - g.r);
      if (d > radius) continue;
      const f = clamp(1 - d / radius, 0.15, 1);
      if (g.alive) hurtBig(b, g, damage * f * (g.blastK ?? 1), owner);
      _j.copy(_cp).sub(pos); _j.y = Math.max(_j.y, 0) + 0.8; _j.normalize();
      const J = force * f * 1.3;
      // push at the near surface, so a blast to one side rocks or tips the body
      if (dist > 1e-3) _cp.addScaledVector(_d.copy(pos).sub(_cp).normalize(), Math.min(g.r, dist) * 0.8);
      shoveBig(g, _j.x * J, _j.y * J, _j.z * J, _cp, 6);
    }
  };
}

// Arrows and spears stick in horses and carts and ride along with them.
export function stickInto(b, s, g, pr) {
  _j.copy(pr.vel).normalize();
  const pos = pr.pos.clone().addScaledVector(_j, -0.15);
  const inv = g.e.quat.clone().invert();
  const lp = pos.clone().sub(g.e.pos).applyQuaternion(inv);
  // pull the point back onto the body surface (the hit test is generous)
  closestOnSeg(g.a, g.b, lp, _cp);
  if (lp.distanceTo(_cp) > g.r * 0.9) lp.sub(_cp).setLength(g.r * 0.9).add(_cp);
  const lq = inv.multiply(pr.quat);
  const st = { type: pr.type, unit: null, part: -1, pos, quat: pr.quat.clone(), t: 25, id: pr.id };
  b.stuck.push(st);
  s.stuck.push({ st, g, lp, lq });
}
export function stepStuck(s) {
  for (let i = s.stuck.length - 1; i >= 0; i--) {
    const k = s.stuck[i];
    if (k.st.t <= 0) { s.stuck.splice(i, 1); continue; }
    k.st.pos.copy(k.lp).applyQuaternion(k.g.e.quat).add(k.g.e.pos);
    k.st.quat.copy(k.g.e.quat).multiply(k.lq);
  }
}

// ---------------------------------------------------------------- ragdoll helpers
export function moveRag(u, dx, dy, dz) {
  const r = u.rag;
  for (let i = 0; i < NPARTS; i++) {
    const t = r.bodies[i].translation();
    r.bodies[i].setTranslation({ x: t.x + dx, y: t.y + dy, z: t.z + dz }, true);
  }
  r.read();
}
export function setRiderGroups(u, riding) {
  const r = u.rag;
  for (let i = 0; i < NPARTS; i++) {
    r.colliders[i].setCollisionGroups(riding ? GR.rider : r.skel.parts[i].limb ? GROUPS.limb : GROUPS.body);
  }
}

// ---------------------------------------------------------------- on-foot AI
export function footMelee(u, ctx, cooldown) {
  const { t, dist, dirx, dirz, spd } = ctx;
  u.expr = ctx.gap < 6 ? EXPR.angry : EXPR.normal;
  const near = dist - t.skel.radius;
  if (near > u.reachDist * 0.8) u.desired.set(dirx * spd, 0, dirz * spd);
  else if (near < u.reachDist * 0.4) u.desired.set(-dirx * spd * 0.3, 0, -dirz * spd * 0.3);
  if (near < u.reachDist + 0.35 && u.cooldown <= 0 && !u.st.attack && !u.isDown()) {
    u.startAttack();
    if (cooldown) u.cooldown = cooldown * (0.85 + Math.random() * 0.3);
    u.battle.sound('whoosh', u.pos, 0.5, 1);
  }
  if (u.st.attack) u.desired.multiplyScalar(0.35);
  return t;
}
export function footRanged(u, ctx) {
  const { t, dist, dirx, dirz, spd } = ctx, w = u.def.weapon;
  u.expr = EXPR.normal;
  if (dist > w.range * 0.85) u.desired.set(dirx * spd, 0, dirz * spd);
  if (dist < w.range && !u.st.attack && u.cooldown <= 0) { u.startAttack(); u.aimAt = t; }
  if (u.st.attack) u.desired.multiplyScalar(0.1);
  return t;
}
// Ranged release on the standard schedule (kinds that define event() replace the core's).
export function rangedEvent(u, t0, t1) {
  const at = u.def.weapon.releaseAt || 0.7;
  if (t0 < at && t1 >= at) u.release();
}

// ---------------------------------------------------------------- poses
// RIDE[style] = { lift, roll, pitch, bend, arms(pose, st) } : sitting riders. lift is the
// pelvis height above standing (written to st.bob, which poseVisual adds for previews).
export const RIDE = {};
export function setArm(pose, side, k) {
  const yaw = -side * k[0], roll = side * k[1];
  eulerYZX(pose[side > 0 ? PART.uarmL : PART.uarmR], yaw, roll, k[2]);
  eulerYZX(pose[side > 0 ? PART.farmL : PART.farmR], yaw, roll, Math.min(k[3], k[2]));
}
const SWORD_L = [0.1, 0.25, 0.1, -0.5], SWORD_R = [0.15, 0.15, -0.35, -1.45];
export function smPose(st, pose) {
  const calm = st.mode === 'normal' || (st.mode === 'flail' && !st.smStun);
  const r = RIDE[st.style];
  if (r) {
    st.bob = r.lift;
    eulerYZX(pose[PART.thighL], 0, r.roll, r.pitch);
    eulerYZX(pose[PART.shinL], 0, r.roll * 0.5, r.pitch + r.bend);
    eulerYZX(pose[PART.thighR], 0, -r.roll, r.pitch);
    eulerYZX(pose[PART.shinR], 0, -r.roll * 0.5, r.pitch + r.bend);
    if (!st.attack && calm && r.arms) r.arms(pose, st);
  } else if (st.smFly) {
    // flying: legs trail a little behind, knees bent; sword held ready
    const sw = Math.sin(st.t * 3) * 0.12;
    eulerYZX(pose[PART.thighL], 0, 0.12, 0.25 + sw);
    eulerYZX(pose[PART.shinL], 0, 0.06, 0.95 + sw);
    eulerYZX(pose[PART.thighR], 0, -0.12, 0.15 - sw);
    eulerYZX(pose[PART.shinR], 0, -0.06, 0.8 - sw);
    if (!st.attack && calm) { setArm(pose, 1, SWORD_L); setArm(pose, -1, SWORD_R); }
  }
}

export { angleDiff };
