// Shared plumbing for the Good, Evil and Secret packs (good.js, evil.js, secret.js):
//  - reviving dead units (the Angel brings an ally back; the Necromancer raises the dead
//    of either side as zombies on its own team; the Phoenix rises from its ashes)
//  - beams drawn as chains of "stuck" segments (heal beam, lightning gun arcs)
//  - support-unit positioning, a simple flight controller, pose hooks for custom stances
// Everything visible is a unit part, an extra body, a projectile or a battle.stuck entry,
// so it shows up in setup previews, live battles and replays alike.
import { EXT } from '../ext.js';
import { THREE, clamp, rand, PART, NPARTS, EXPR, newId } from './common.js';
import { GROUPS } from '../physics.js';
import { eulerYZX } from '../util.js';
// (not importing ../items.js: it imports the packs, so it would run before they register)
const NONE = { len: 0.22, r: 0.12 }; // ITEMS.none

export const UPY = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

// ------------------------------------------------------------------ revival
// Units with pack behaviours that keep extra bodies or other per-unit state (mounts,
// flyers, siege crews) and skeletons that fell apart can't be brought back.
const CORE_KINDS = new Set(['melee', 'ranged', 'heal', 'bard']);
export function revivable(u, b) {
  if (u.alive || u.brokenApart || u.def.fallApart || u.extras.length || u.sm || u.gesNoRevive) return false;
  if (u.pos.y < b.terrain.height(u.pos.x, u.pos.z) - 2 || u.deadT < 0.6) return false;
  return true;
}
// the unit's own behaviour survives a revival (core weapon kinds and simple pack kinds)
export const keepsKind = (u) => CORE_KINDS.has(u.def.weapon.kind) || (u.kind && !u.kind.init);

// Bring a dead unit back to life (optionally on another team). The ragdoll is woken,
// made solid again and helped back to its feet by the normal balance controller.
export function revive(b, u, team = u.team, hpFrac = 1) {
  if (team !== u.team) {
    const a = b.teams[u.team], i = a.indexOf(u);
    if (i >= 0) a.splice(i, 1);
    b.teams[team].push(u);
    u.team = team;
  }
  const rag = u.rag;
  Object.assign(u, {
    alive: true, hp: u.maxHp * hpFrac, deadT: 0, settled: false, restT: 0, awakeT: 0, expr: EXPR.hurt,
    stun: 0.7, recover: 0, fleeT: 0, fled: false, target: null, retarget: 0, cooldown: rand(0.6, 1.2),
    killer: null, lastHitBy: null, hasPrev: false, airT: 0, downT: 0, buff: 0,
  });
  u.st.attack = null; u.st.attackT = 0; u.st.mode = 'normal';
  u.st.gsFly = false; u.st.gsSuper = 0; u.st.gdBeam = false; u.st.evSpin = false; u.st.smFly = false; u.st.smStun = false;
  rag.setDamping(0.15, 1.0);
  for (let i = 0; i < NPARTS; i++) {
    rag.colliders[i].setCollisionGroups(u.skel.parts[i].limb ? GROUPS.limb : GROUPS.body);
    rag.bodies[i].wakeUp();
  }
  rag.read();
  rag.impulseAll(0, u.M * 3.5, 0);
  return u;
}

// Pick the weapons dropped at death back up (a revived ally fights as before).
export function reequip(b, u) {
  for (const h of u.held) {
    if (!h.dropped) continue;
    if (h.body) { b.world.removeRigidBody(h.body); h.body = null; }
    if (h.rec) { if (h.rec.t1 === Infinity) h.rec.t1 = b.time; h.rec = null; }
    h.dropped = false;
    if (h.phys) {
      const at = new THREE.Vector3(0, h.shape.cy, 0).applyQuaternion(h.lq).add(h.lp);
      h.collider = u.rag.attach(h.part, u.heldCollider(h, true), h.mass, at);
    }
  }
  u.readHeld();
}

// Fist hit geometry (as the core builds it for item 'none'), for units that lost
// their weapon.
export function fists(u) {
  const hand = new THREE.Vector3(0, -u.skel.handOffset, 0);
  const r = Math.max(0.08, NONE.r * u.s);
  const mk = (part) => ({ part, a: new THREE.Vector3(), b: hand.clone().multiplyScalar(1.4), r, prevTip: new THREE.Vector3(), tipVel: new THREE.Vector3(), first: true });
  u.weapons = [mk(PART.farmR), mk(PART.farmL)];
  const arm = 0.54 * (u.def.build.arms || 1);
  u.reachDist = (0.3 + 0.55 * arm + 0.6 * NONE.len) * u.s;
  u.anim = 'punch';
  u.st.style = 'fists';
  u.attackDur = clamp(u.def.weapon.cooldown * 0.75, 0.45, 1.1) * Math.sqrt(Math.max(1, u.s));
}

// A marker that rides on a unit part (drawn as a pack projectile type).
export function mark(b, u, type, part = PART.head, t = 9999, lp = null) {
  const s = { type, unit: u, part, lp: lp || new THREE.Vector3(), lq: new THREE.Quaternion(), pos: u.rag.pos[part].clone(), quat: u.rag.quat[part].clone(), t, id: newId() };
  b.stuck.push(s);
  return s;
}
// A marker at a fixed spot in the world (recorded once while it lasts).
export function markAt(b, type, pos, t, yaw = rand(0, Math.PI * 2)) {
  const s = { type, unit: null, part: -1, pos: pos.clone(), quat: new THREE.Quaternion().setFromAxisAngle(UPY, yaw), t, id: newId() };
  b.stuck.push(s);
  return s;
}

// ------------------------------------------------------------------ beams
// A beam from A to B drawn as segments of a pack projectile type (shaft along +Y,
// `seg` long). The segments ride on `owner` (so the recorder treats them as moving
// while the owner lives) but are placed by refreshBeam every step, after the core
// moved them. Call refreshBeam each step while the beam is on, endBeam when done.
export function refreshBeam(b, beam, owner, A, B, type, seg, wob = 0) {
  beam.segs ??= [];
  const d = A.distanceTo(B);
  const n = clamp(Math.ceil(d / seg), 1, 40);
  const S = beam.segs;
  while (S.length < n) {
    const s = { type, unit: owner, part: PART.chest, lp: new THREE.Vector3(), lq: new THREE.Quaternion(), pos: new THREE.Vector3(), quat: new THREE.Quaternion(), t: 0.5, id: newId() };
    S.push(s); b.stuck.push(s);
  }
  while (S.length > n) S.pop().t = 0;
  let px = A.x, py = A.y, pz = A.z;
  for (let j = 0; j < n; j++) {
    const f = (j + 1) / n, end = j === n - 1;
    const jx = end ? 0 : rand(-1, 1) * wob, jy = end ? 0 : rand(-1, 1) * wob, jz = end ? 0 : rand(-1, 1) * wob;
    const x = A.x + (B.x - A.x) * f + jx, y = A.y + (B.y - A.y) * f + jy, z = A.z + (B.z - A.z) * f + jz;
    const s = S[j];
    s.pos.set((px + x) / 2, (py + y) / 2, (pz + z) / 2);
    _v.set(x - px, y - py, z - pz);
    const L = _v.length() || 1;
    s.quat.setFromUnitVectors(UPY, _v.multiplyScalar(1 / L));
    // keep the core's follow-the-part update from moving it: express pos in the
    // owner's chest frame too (so the next step's core update lands it in place)
    const rq = owner.rag.quat[PART.chest];
    s.lp.copy(s.pos).sub(owner.rag.pos[PART.chest]).applyQuaternion(_q.copy(rq).invert());
    s.lq.copy(_q).multiply(s.quat);
    s.t = 0.5;
    px = x; py = y; pz = z;
  }
}
export function endBeam(beam) {
  if (!beam.segs) return;
  for (const s of beam.segs) s.t = 0;
  beam.segs = [];
}

// ------------------------------------------------------------------ AI helpers
// Support units: stay behind the nearest fighting ally, away from enemies. Returns
// true while it is busy keeping away (so the caller should not start an action).
export function supportMove(u, c, keepBack = 2.5) {
  const b = u.battle, p = u.pos;
  const { t, gap, dirx, dirz, spd } = c;
  const anchor = b.allyAnchor(u);
  if (gap < 3.5) {
    u.desired.set(-dirx * spd, 0, -dirz * spd);
    u.expr = EXPR.scared;
    return true;
  }
  if (anchor) {
    _v.set(anchor.pos.x - dirx * keepBack - p.x, 0, anchor.pos.z - dirz * keepBack - p.z);
    const d = _v.length();
    if (d > 2.5) u.desired.copy(_v).multiplyScalar(spd / d * clamp(d / 3, 0.3, 1));
  } else if (gap > 6) u.desired.set(dirx * spd * 0.6, 0, dirz * spd * 0.6);
  u.expr = EXPR.normal;
  return false;
}

// Nearest unit (callback filter) within r of point p.
export function nearest(b, p, r, filter) {
  let best = null, bd = r * r;
  for (const v of b.units) {
    const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = dx * dx + dz * dz;
    if (d < bd && filter(v)) { bd = d; best = v; }
  }
  return best;
}

// ------------------------------------------------------------------ flight
// Weightless flight with an altitude servo (like the Valkyrie's), for flyers without
// wings: hold height `alt` above the ground and steer the body toward u.desired.
export function hover(u, dt, alt, kUp = 5, cap = 18) {
  const b = u.battle, rag = u.rag, p = u.pos, v = rag.vel[PART.pelvis];
  rag.impulseAll(0, u.M * 9.81 * dt, 0);
  const h = p.y - b.terrain.height(p.x, p.z);
  const ay = clamp((alt - h) * kUp - v.y * 3.2, -18, 14);
  let ax = (u.desired.x - v.x) * 3, az = (u.desired.z - v.z) * 3;
  const am = Math.hypot(ax, az);
  if (am > cap) { ax *= cap / am; az *= cap / am; }
  rag.impulseAll(u.M * ax * dt, u.M * ay * dt, u.M * az * dt);
  u.airT = 0; // not falling: keep attack animations playing
}

// ------------------------------------------------------------------ poses
// Stances keyed on st flags (set by the kinds) or on the weapon style (so the setup
// preview shows them too). Arm keys as in src/pose.js: [inward yaw, roll, pitch, fore].
function arm(pose, side, k) {
  const yaw = -side * k[0], roll = side * k[1];
  eulerYZX(pose[side > 0 ? PART.uarmL : PART.uarmR], yaw, roll, k[2]);
  eulerYZX(pose[side > 0 ? PART.farmL : PART.farmR], yaw, roll, Math.min(k[3], k[2]));
}
export const STANCE = {}; // style -> fn(st, pose) for the guard (no attack playing)
const _tilt = new THREE.Quaternion(), _ax = new THREE.Vector3(1, 0, 0);
function gesPose(st, pose) {
  const calm = st.mode === 'normal' || st.mode === 'play';
  const f = STANCE[st.style];
  if (f && !st.attack && calm) f(st, pose);
  if (st.evSpin) { // arms straight out to the sides, flails flying
    const w = Math.sin((st.t || 0) * 20) * 0.08;
    arm(pose, 1, [0, 1.45 + w, -0.1, -0.1]);
    arm(pose, -1, [0, 1.45 - w, -0.1, -0.1]);
  }
  if (st.gdBeam) arm(pose, -1, [0.1, 0.1, -1.55, -1.6]); // staff pointed at the patient
  if (st.gsFly && !st.gsSuper) { // hovering: legs dangle, one knee bent
    const sw = Math.sin((st.t || 0) * 2.5) * 0.1;
    eulerYZX(pose[PART.thighL], 0, 0.1, -0.15 + sw); eulerYZX(pose[PART.shinL], 0, 0.06, 0.25 + sw);
    eulerYZX(pose[PART.thighR], 0, -0.1, -0.55 - sw); eulerYZX(pose[PART.shinR], 0, -0.06, 0.6 - sw);
  }
  if (st.gsSuper) {
    // superman: body flat out along the flight, right fist forward, left at the side
    const k = st.gsSuper;
    arm(pose, -1, [0.12, 0.05, -3.05, -3.1]);
    arm(pose, 1, k > 0.5 ? [0.05, 0.25, 0.25, 0.2] : [0.12, 0.05, -3.05, -3.1]);
    eulerYZX(pose[PART.thighL], 0, 0.08, 0.1); eulerYZX(pose[PART.shinL], 0, 0.08, 0.35);
    eulerYZX(pose[PART.thighR], 0, -0.08, 0.05); eulerYZX(pose[PART.shinR], 0, -0.08, 0.15);
    eulerYZX(pose[PART.head], 0, 0, -1.0);
    _tilt.setFromAxisAngle(_ax, 0.9 - (st.lean || 0) * 0.5);
    for (let i = 0; i < NPARTS; i++) pose[i].premultiply(_tilt);
  }
}
EXT.pose.push(gesPose);

export { arm as setArmKey };
