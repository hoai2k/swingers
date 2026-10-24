// Siege & mounts pack: the Valkyrie, a flyer. Her ragdoll is held up by lift on every
// part (weightless, so the muscles keep her pose) plus an altitude and speed servo; she
// cruises above the fight, dives at a target, swings as she passes and climbs away.
// A hard hit stuns her and she drops; killed, she falls. The wings are kinematic extra
// bodies stuck to her chest that flap while she flies.
import { clamp, rand } from '../util.js';
import { RAPIER } from '../physics.js';
import { PART, NPARTS, forwardKinematics } from '../body.js';
import { computePose, newPose } from '../pose.js';
import { V3, Q4, S, placeExtra, qYaw, qRoll, EXPR } from './sm-core.js';
import * as M from './sm-meshes.js';

const _Y = new V3(0, 1, 0);
export const VALK = { alt: 4.2, cruise: 7, dive: 12, climb: 8 };
const REST = [0.45, 0.75]; // folded wings: sweep back, raise

// wing root on the chest (chest-local), and its orientation for a flap state
function wingRoot(skel, sd, out) {
  const c = skel.parts[PART.chest];
  return out.set(sd * 0.09 * skel.scale, c.hh * 0.55, -c.r * 0.78);
}
const _q = new Q4(), _q2 = new Q4();
function wingQuat(chestQ, sd, sweep, raise, out) {
  return out.copy(chestQ).multiply(qYaw(sd * sweep, _q)).multiply(qRoll(sd * raise, _q2));
}

// rest pose (standing, wings folded) in the unit frame
export function wingLayout(skel, styleSt) {
  const pose = newPose();
  computePose(styleSt, pose);
  const pos = Array.from({ length: NPARTS }, () => new V3());
  forwardKinematics(skel, new V3(0, skel.standHeight, 0), pose, pos);
  const cq = pose[PART.chest], cp = pos[PART.chest];
  return [1, -1].map((sd) => ({
    pos: wingRoot(skel, sd, new V3()).applyQuaternion(cq).add(cp),
    quat: wingQuat(cq, sd, REST[0], REST[1], new Q4()),
    mesh: (H, team) => M.wing(H, team, sd),
  }));
}
export const restSt = (def) => ({ phase: 0, amp: 0, style: def.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0, mode: 'normal', t: 0 });

export function valkInit(u) {
  const b = u.battle, s = S(b);
  const lay = wingLayout(u.skel, restSt(u.def));
  const wings = lay.map((l) => u.addExtraBody(RAPIER.RigidBodyDesc.kinematicPositionBased(), [], l.pos, l.quat));
  const f = { u, wings, state: 'cruise', t: 0, flap: rand(0, 6), alt: VALK.alt, flying: true, look: { pos: new V3() }, swoop: 0 };
  u.sm = f;
  s.flyers.push(f);
  // take off
  u.rag.impulseAll(0, u.M * 4, 0);
}

export function valkThink(u, dt, ctx) {
  const f = u.sm, b = u.battle, t = ctx.t, p = u.pos;
  const gy = b.terrain.height(p.x, p.z);
  const tc = t.chestPos;
  const { dist, dirx, dirz } = ctx;
  f.t += dt;
  u.expr = EXPR.angry;
  switch (f.state) {
    case 'cruise': {
      f.alt = VALK.alt + Math.sin(b.time * 0.9 + u.id) * 0.3;
      if (dist > 8) u.desired.set(dirx * VALK.cruise, 0, dirz * VALK.cruise);
      else {
        // circle the target while the sword is not ready
        const sd = u.id % 2 ? 1 : -1;
        u.desired.set((dirx * (dist - 6) * 0.5 - dirz * sd * 4), 0, (dirz * (dist - 6) * 0.5 + dirx * sd * 4));
      }
      if (dist < 13 && u.cooldown <= 0 && u.stun <= 0) { f.state = 'dive'; f.t = 0; }
      return t;
    }
    case 'dive': {
      // come down to the target's chest height, fast
      const tgy = b.terrain.height(t.pos.x, t.pos.z);
      // glide down along a slope that meets the target's chest height
      const low = Math.max(0.5, tc.y - tgy - (u.chestPos.y - p.y) - 0.1);
      f.alt = low + (VALK.alt - low) * clamp((dist - 3.5) / 7, 0, 1);
      const d3 = u.chestPos.distanceTo(tc);
      // brake into the strike so the blade comes down on the target, not behind it
      const sp = clamp((d3 - 1.5) * 2.2, 3.5, VALK.dive);
      u.desired.set(dirx * sp, 0, dirz * sp);
      const vh = Math.hypot(u.rag.vel[PART.pelvis].x, u.rag.vel[PART.pelvis].z);
      if (d3 < u.reachDist + 0.5 + vh * 0.35 && !u.st.attack) { u.startAttack(); b.sound('whoosh', p, 0.8, 0.8); f.state = 'strike'; f.t = 0; }
      if (f.t > 3.5) { f.state = 'climb'; f.t = 0; }
      return t;
    }
    case 'strike': {
      // swoop through: keep some speed so she is not mobbed at the bottom
      u.desired.set(dirx * 5, 0, dirz * 5);
      if (!u.st.attack || u.st.attackT > 0.82 || f.t > 1.4) { f.state = 'climb'; f.t = 0; f.cx = Math.sin(u.heading); f.cz = Math.cos(u.heading); }
      return t;
    }
    case 'climb': default: {
      f.alt = VALK.alt + 1;
      u.desired.set((f.cx ?? 0) * VALK.climb, 0, (f.cz ?? 0) * VALK.climb);
      if (f.t > 1.3) { f.state = 'cruise'; f.t = 0; }
      f.look.pos.set(p.x + (f.cx ?? 0) * 10, gy + f.alt, p.z + (f.cz ?? 0) * 10);
      return f.look;
    }
  }
}

// Possessed (kind.control): the stick flies her about at cruise height; the attack
// button dives on the crosshair point (control.aimPt, at most 14 m off) and swings
// as she gets there, then she climbs away as the AI does.
export function diveTarget(u, c, out, maxD = 14) {
  const p = u.pos;
  if (c.aimPt) out.copy(c.aimPt);
  else out.set(p.x + Math.sin(u.heading) * 8, u.battle.terrain.height(p.x, p.z), p.z + Math.cos(u.heading) * 8);
  const dx = out.x - p.x, dz = out.z - p.z, d = Math.hypot(dx, dz);
  if (d > maxD) { out.x = p.x + dx / d * maxD; out.z = p.z + dz / d * maxD; out.y = Math.min(out.y, u.battle.terrain.height(out.x, out.z) + 1.5); }
  return out;
}
export function valkControl(u, dt, c) {
  const f = u.sm, b = u.battle, p = u.pos;
  f.t += dt;
  // the dive follows the crosshair (taken over mid-dive too)
  if (f.state === 'dive' || f.state === 'strike') { f.diveAt = diveTarget(u, c, f.diveAt || new V3()); }
  if (f.state === 'dive') {
    const at = f.diveAt, dx = at.x - p.x, dz = at.z - p.z, dist = Math.hypot(dx, dz) || 1;
    const gy = b.terrain.height(at.x, at.z);
    const low = Math.max(0.5, at.y - gy - (u.chestPos.y - p.y) - 0.1);
    f.alt = low + (VALK.alt - low) * clamp((dist - 3.5) / 7, 0, 1);
    const d3 = u.chestPos.distanceTo(at);
    // (close in but still high above it: hold back and drop onto it)
    const dy = u.chestPos.y - at.y;
    const sp = clamp((d3 - 1.5) * 2.2, 3.5, VALK.dive) * (dist < 6 ? clamp(1 - (dy - 0.8) / 2.5, 0.3, 1) : 1);
    u.desired.set(dx / dist * sp, 0, dz / dist * sp);
    u.faceYaw = Math.atan2(dx, dz);
    const vh = Math.hypot(u.rag.vel[PART.pelvis].x, u.rag.vel[PART.pelvis].z);
    // swing once down at the target's height and about to reach it
    if (((dist < u.reachDist + 0.5 + vh * 0.3 && dy < 1.0) || f.t > 3) && !u.st.attack) {
      u.startAttack(); b.sound('whoosh', p, 0.8, 0.8); f.state = 'strike'; f.t = 0;
    }
    return true;
  }
  if (f.state === 'strike') {
    // swoop through toward the target
    const dx = f.diveAt.x - p.x, dz = f.diveAt.z - p.z, d = Math.hypot(dx, dz) || 1;
    u.desired.set(dx / d * 5, 0, dz / d * 5);
    if (!u.st.attack || u.st.attackT > 0.82 || f.t > 1.4) { f.state = 'climb'; f.t = 0; }
    return true;
  }
  if (f.state === 'climb' && f.t < 1) f.alt = VALK.alt + 1;
  else { f.state = 'cruise'; f.alt = VALK.alt; }
  if (c.attack && f.state === 'cruise' && u.cooldown <= 0 && u.stun <= 0 && !u.st.attack) {
    f.state = 'dive'; f.t = 0;
    f.diveAt = diveTarget(u, c, f.diveAt || new V3());
    b.sound('whoosh', p, 0.7, 0.7);
  }
  return true;
}

export function valkStep(u, dt) {
  const f = u.sm, b = u.battle, rag = u.rag, p = u.pos, v = rag.vel[PART.pelvis];
  const stunned = u.stun > 0.3;
  u.st.smStun = stunned;
  f.flying = !stunned || u.groundGap() > 0.4;
  u.st.smFly = f.flying;
  // flying is not falling: keep the core out of its 'flail' mode so attack swings play
  if (!stunned) u.airT = 0;
  // lift: weightless while flying; a stunned valkyrie only half holds herself up
  const lift = stunned ? 0.55 : 1;
  rag.impulseAll(0, u.M * 9.81 * lift * dt, 0);
  if (!stunned) {
    const gy = b.terrain.height(p.x, p.z);
    const h = p.y - gy;
    const dive = f.state === 'dive' || f.state === 'strike';
    const ay = clamp((f.alt - h) * (dive ? 11 : 5) - v.y * (dive ? 4.5 : 3.2), -18, 12);
    let ax = (u.desired.x - v.x) * 3, az = (u.desired.z - v.z) * 3;
    const am = Math.hypot(ax, az), cap = 16;
    if (am > cap) { ax *= cap / am; az *= cap / am; }
    rag.impulseAll(u.M * ax * dt, u.M * ay * dt, u.M * az * dt);
  }
  f.flap += dt * (stunned ? 4 : f.state === 'dive' ? 5 : 9);
}

// wings follow the chest after the physics step
const _p = new V3(), _wq = new Q4();
export function stepFlyer(b, f) {
  const u = f.u, rag = u.rag;
  if (!u.alive && rag.bodies[0].isSleeping() && f.parked) return;
  f.parked = !u.alive && rag.bodies[0].isSleeping();
  const cq = rag.quat[PART.chest], cp = rag.pos[PART.chest];
  let sweep, raise;
  if (!u.alive) { sweep = 0.7; raise = -0.15; }
  else if (f.flying) {
    const dive = f.state === 'dive';
    sweep = dive ? 0.75 : 0.25;
    raise = (dive ? 0.5 : 0.3) + Math.sin(f.flap) * (dive ? 0.15 : 0.6);
  } else { sweep = REST[0]; raise = REST[1]; }
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1;
    wingRoot(u.skel, sd, _p).applyQuaternion(cq).add(cp);
    placeExtra(f.wings[i], _p, wingQuat(cq, sd, sweep, raise, _wq));
  }
}
