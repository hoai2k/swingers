// Shared by the Pirate and Renaissance packs (pirate.js, renaissance.js):
//  - 'pr_gun' kind: flintlocks, pistols and muskets (one shot or a burst, then a
//    reload; muskets wait for each other and fire in volleys)
//  - projectiles: pr_shot (lead ball), pr_cannonball (flies flat, ploughs through a
//    rank, bounces and rolls on), pr_line (a rope segment marker)
//  - reels: a line from the owner's hand to a harpooned victim that drags it in
//  - paint: a status that slows a unit (drawn with rn_splat markers)
//  - a pose hook (st.prHang: legs dangling under a balloon; st.prAimL: left arm aims)
// Everything drawn is a projectile or a stuck entry of a pack type, so replays show it.
import { register, EXT } from '../ext.js';
import {
  THREE, clamp, rand, PART, EXPR, rangedThink, crossed, aimPoint, launchVel, addProjectile, sweepParts, strike,
  shieldBlocks, newId, torus,
} from './common.js';
import { eulerYZX } from '../util.js';
import { S as SM, hurtBig, shoveBig, setArm } from './sm-core.js';

export const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const UPY = new V3(0, 1, 0);
const _o = new V3(), _p = new V3(), _v = new V3(), _d = new V3(), _w = new V3();

// per-battle state of these packs
export function PR(b) {
  return b._pr || (b._pr = { reels: [], painted: [], volley: [-9, -9], balloons: [], tanks: [] });
}

// ------------------------------------------------------------------ guns
const handOf = (u, part, out) => u.rag.worldPoint(part, 0, -u.skel.handOffset, 0, out);

// Fire weapon w from a hand: lead ball(s), muzzle flash, smoke, bang and recoil.
export function shoot(u, part = PART.farmR, w = u.def.weapon, target = u.aimAt) {
  const b = u.battle;
  const hand = handOf(u, part, _o);
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  hand.x += fx * w.barrel * u.s; hand.z += fz * w.barrel * u.s; hand.y += 0.03 * u.s;
  const keep = u.aimAt;
  u.aimAt = target;
  aimPoint(u, _p, 0.4, 0.25);
  u.aimAt = keep;
  if (!target && u.control) _p.y = hand.y + Math.tan(u.control.aimPitch) * 14;
  for (let i = 0; i < (w.pellets || 1); i++) {
    launchVel(hand, _p, w.speed * rand(0.96, 1.04), PROJ.pr_shot.g, false, w.spread, _v);
    addProjectile(b, 'pr_shot', hand, _v, u, { life: (w.range / w.speed) * 1.5, damage: w.damage, force: w.force });
  }
  muzzle(b, hand, fx, fz, w.big ? 1.6 : 1);
  b.sound('boom', hand, w.big ? 0.55 : 0.36, w.big ? 1.7 : 2.4);
  u.rag.impulse(part, -fx * u.M * 0.09, u.M * 0.07, -fz * u.M * 0.09);
  if (w.big) u.rag.impulseAll(-fx * u.M * 0.25, 0, -fz * u.M * 0.25);
}
export function muzzle(b, p, fx, fz, k = 1) {
  b.emit('spark', p.x, p.y, p.z, 1.5 * k);
  b.emit('trail', p.x + fx * 0.15, p.y, p.z + fz * 0.15, 1);
  b.emit('trail', p.x + fx * 0.35 * k, p.y + 0.05, p.z + fz * 0.35 * k, 0);
  if (k > 1.2) b.emit('dust', p.x + fx * 0.6, p.y - 0.3, p.z + fz * 0.6, 1);
}

// Muskets hold their fire until the line is ready (or they have waited a moment),
// then everyone loaded fires together.
function volleyThink(u, dt, c) {
  const w = u.def.weapon, b = u.battle, s = PR(b);
  const { t, dist, dirx, dirz, spd } = c;
  u.expr = EXPR.normal;
  if (dist > w.range * 0.85) u.desired.set(dirx * spd, 0, dirz * spd);
  const ready = dist < w.range && !u.st.attack && u.cooldown <= 0 && u.stun <= 0 && !u.isDown();
  if (!ready) { u.prWait = 0; if (u.st.attack) u.desired.multiplyScalar(0.1); return t; }
  u.desired.multiplyScalar(0.15);
  u.prWait = (u.prWait || 0) + dt;
  const called = b.time - s.volley[u.team] < 0.3;
  if (!called && u.prWait > (w.wait || 0.9)) {
    s.volley[u.team] = b.time;
    if (Math.random() < 0.6) b.voice(u, 'cry', true);
  }
  if (called || b.time - s.volley[u.team] < 0.01) {
    u.prWait = 0;
    u.aimAt = t;
    // a ragged volley: a few hundredths of a second between muskets
    b.delayed.push([rand(0, 0.12), () => { if (u.alive && !u.st.attack && u.stun <= 0) u.startAttack(); }]);
    u.cooldown = 0.2;
  }
  return t;
}

export const gun = {
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.ammo = w.ammo || 1; u.prHand = 0; },
  think(u, dt, c) { return u.def.weapon.volley ? volleyThink(u, dt, c) : rangedThink(u, dt, c); },
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    // dual pistols fire right, left, right...
    const part = w.dual && (u.prHand ^= 1) === 0 ? PART.farmL : PART.farmR;
    shoot(u, part);
    if (--u.ammo <= 0) {
      u.ammo = w.ammo || 1;
      u.cooldown = w.reload * rand(0.92, 1.08) * (u.buff > 0 ? 0.85 : 1);
      // ramrod and powder
      b.delayed.push([0.6, () => u.alive && b.sound('click', u.pos, 0.4, 0.7)]);
      b.delayed.push([w.reload * 0.75, () => u.alive && b.sound('click', u.pos, 0.5, 1.2)]);
    }
  },
};

// ------------------------------------------------------------------ cannonballs
// One cannonball: smashes through a rank (loses some speed per body), bounces and
// rolls on. Allies are passed through. Damage and knockback scale with speed.
function ballHit(b, pr, v, part) {
  if (v === pr.owner || v.team === pr.team) return;
  pr.hits.add(v);
  const sp = pr.vel.length();
  if (sp < 3) return;
  const k = clamp(sp / 24, 0.3, 1.2);
  _d.copy(pr.vel).normalize();
  const sz = Math.min(2, v.s), imp = (v.M * (3 + 6 * k)) / sz;
  v.hit(pr.damage * k, part ?? PART.chest, _d.x * imp * 0.3, imp * 0.1, _d.z * imp * 0.3, pr.owner, 'cannonball');
  v.rag.impulseAll(_d.x * imp, imp * 0.35 + Math.max(0, _d.y) * imp, _d.z * imp);
  v.stun = Math.max(v.stun, 1.4 * k * (v.def.stagger ?? 1));
  const c = v.chestPos;
  if (v.def.armor > 0.3) { b.emit('spark', c.x, c.y, c.z, 6); b.sound('clang', c, 0.9, 0.7); }
  b.emit('blood', c.x, c.y, c.z, 6 + 6 * k, _d.x, _d.z);
  b.sound('crunch', c, 0.6 + 0.6 * k, 0.85);
  pr.vel.multiplyScalar(0.8 / Math.min(1.6, Math.max(1, v.s)));
}
const cannonball = {
  g: 9.81, len: 0, r: 0.2, roll: true, life: 7,
  step(b, pr) {
    if (pr.vel.lengthSq() < 9) return;
    const h = sweepParts(b, pr, 0.22);
    if (h) ballHit(b, pr, h.v, h.part);
  },
  hit(b, pr, v) { ballHit(b, pr, v, PART.chest); return false; },
  bigHit(b, pr, g) {
    if (g.team === pr.team) return false;
    const sp = pr.vel.length(), k = clamp(sp / 24, 0.2, 1.1);
    hurtBig(b, g, pr.damage * k * 0.9, pr.owner);
    shoveBig(g, pr.vel.x * g.mass * 0.08 * k, g.mass * 0.4 * k, pr.vel.z * g.mass * 0.08 * k, pr.pos, 3);
    b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 3);
    b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 3);
    b.sound('crunch', pr.pos, 1.0, 0.6);
    pr.vel.multiplyScalar(0.35);
    return false;
  },
  ground(b, pr) {
    // skip off the ground: bounce while it's fast, then roll (the core's roll)
    const vn = -pr.vel.y;
    if (vn > 2.2) {
      const gy = b.terrain.height(pr.pos.x, pr.pos.z);
      pr.pos.y = gy + 0.11;
      pr.vel.y = vn * 0.42;
      pr.vel.x *= 0.86; pr.vel.z *= 0.86;
      b.emit('dust', pr.pos.x, gy, pr.pos.z, Math.min(4, vn * 0.6));
      b.sound('thump', pr.pos, clamp(vn / 10, 0.25, 0.9), 0.7);
    }
    return false;
  },
};

// ------------------------------------------------------------------ lead shot
const shot = {
  g: 2, len: 0.18, r: 0.03, life: 1.5,
  step(b, pr) {
    const h = sweepParts(b, pr, 0.04);
    if (!h) return;
    const dir = _d.copy(pr.vel).normalize();
    if (!shieldBlocks(b, h.v, dir, 0.6)) strike(b, h.v, pr.damage, dir, pr.force, pr.owner, 'shot', h.part, 'thud');
    pr.life = -1;
  },
  hit(b, pr, v) {
    strike(b, v, pr.damage, _d.copy(pr.vel).normalize(), pr.force, pr.owner, 'shot', PART.chest, 'thud');
    return true;
  },
  ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 0.5); return true; },
};

// ------------------------------------------------------------------ reels (harpoon line)
const SEG = 0.8;
export function addReel(b, owner, victim, dur, pull) {
  const s = PR(b);
  for (const r of s.reels) if (r.victim === victim && r.owner === owner) { r.t = dur; return r; }
  const r = { owner, victim, t: dur, pull, segs: [] };
  s.reels.push(r);
  owner.prReel = r;
  return r;
}
export const reeling = (u) => !!(u.prReel && u.prReel.t > 0);
function endReel(r) { r.t = 0; for (const s of r.segs) s.t = 0; r.segs.length = 0; if (r.owner.prReel === r) r.owner.prReel = null; }
function stepReels(b, dt) {
  const list = PR(b).reels;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i], o = r.owner, v = r.victim;
    r.t -= dt;
    const A = handOf(o, PART.farmR, _v), B = _w.copy(v.chestPos);
    const d = A.distanceTo(B);
    if (r.t <= 0 || !o.alive || d < 1.3 * Math.max(1, v.s) || d > 34) { endReel(r); list.splice(i, 1); continue; }
    // reel the victim in (a big one is barely budged)
    if (v.alive) v.stun = Math.max(v.stun, 0.25);
    const k = (r.pull * dt * v.M * clamp(d / 3, 0.5, 1)) / Math.max(1, v.s * v.s * v.s);
    v.rag.impulseAll(((A.x - B.x) / d) * k, Math.max(0, (A.y - B.y) / d) * k + v.M * 2.2 * dt / Math.max(1, v.s), ((A.z - B.z) / d) * k);
    // the harpooner leans back on the line
    o.rag.impulseAll(((B.x - A.x) / d) * -o.M * 0.6 * dt, 0, ((B.z - A.z) / d) * -o.M * 0.6 * dt);
    const n = Math.min(40, Math.ceil(d / SEG));
    while (r.segs.length < n) {
      // attached to the owner (alive) so the recorder keeps it moving; placed below
      const s = { type: 'pr_line', unit: o, part: 0, lp: new V3(), lq: new Q4(), pos: new V3(), quat: new Q4(), t: 99, id: newId() };
      r.segs.push(s); b.stuck.push(s);
    }
    while (r.segs.length > n) r.segs.pop().t = 0;
    const sag = Math.min(0.5, d * 0.025) * (r.t > 0.3 ? 0.4 : 1);
    for (let j = 0; j < n; j++) {
      const s = r.segs[j], f0 = j / n, f1 = (j + 1) / n;
      const y0 = A.y + (B.y - A.y) * f0 - sag * 4 * f0 * (1 - f0), y1 = A.y + (B.y - A.y) * f1 - sag * 4 * f1 * (1 - f1);
      const x0 = A.x + (B.x - A.x) * f0, z0 = A.z + (B.z - A.z) * f0, x1 = A.x + (B.x - A.x) * f1, z1 = A.z + (B.z - A.z) * f1;
      s.pos.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      s.quat.setFromUnitVectors(UPY, _d.set(x1 - x0, y1 - y0, z1 - z0).normalize());
      s.t = 99;
    }
  }
}

// ------------------------------------------------------------------ paint
// A painted unit is slowed (drag on its feet, slower attacks) until the paint dries.
export function paint(b, v, dur) {
  if (!v.alive) return;
  const s = PR(b);
  let p = v.prPaint;
  if (!p) { p = v.prPaint = { t: 0, marks: [] }; s.painted.push(v); }
  p.t = Math.max(p.t, dur);
  if (p.marks.length < 3) {
    const part = [PART.chest, PART.head, PART.pelvis][p.marks.length];
    const r = v.skel.parts[part].r;
    const lp = new V3(rand(-0.5, 0.5) * r, rand(-0.3, 0.5) * r, r * 0.7);
    const lq = new Q4().setFromEuler(new THREE.Euler(rand(-0.4, 0.4), rand(-1.2, 1.2), rand(0, 6)));
    const m = { type: 'rn_splat', unit: v, part, lp, lq, pos: v.rag.pos[part].clone(), quat: new Q4(), t: dur, id: newId() };
    p.marks.push(m);
    b.stuck.push(m);
  }
  for (const m of p.marks) m.t = Math.max(m.t, p.t);
}
function stepPaint(b, dt) {
  const list = PR(b).painted;
  for (let i = list.length - 1; i >= 0; i--) {
    const u = list[i], p = u.prPaint;
    p.t -= dt;
    if (p.t <= 0 || !u.alive) {
      for (const m of p.marks) m.t = Math.min(m.t, u.alive ? 0 : 20);
      u.prPaint = null; list.splice(i, 1); continue;
    }
    if (u.airT <= 0) {
      const v0 = u.rag.vel[PART.pelvis];
      u.rag.impulseAll(-v0.x * u.M * 0.1, 0, -v0.z * u.M * 0.1);
    }
    u.cooldown += dt * 0.4;
  }
}

// ------------------------------------------------------------------ poses
// (in setup previews these flags are unset: the units stand normally)
const AIM_L = [0.12, 0.1, -1.45, -1.55];
function prPose(st, pose) {
  if (st.prHang) {
    const sw = Math.sin((st.t || 0) * 1.7) * 0.12;
    // legs hang, a little forward, swinging gently
    eulerYZX(pose[PART.thighL], 0, 0.08, -0.28 + sw); eulerYZX(pose[PART.shinL], 0, 0.05, 0.15 + sw);
    eulerYZX(pose[PART.thighR], 0, -0.08, -0.15 - sw); eulerYZX(pose[PART.shinR], 0, -0.05, 0.3 - sw);
  }
  if (st.prAimL > 0 && !st.attack && st.mode === 'normal') setArm(pose, 1, AIM_L);
}

// ------------------------------------------------------------------ meshes
// A spoked cart wheel (axis along X), radius R.
export function wheel(H, g, x, y, z, R, rimMat, spokeMat, n = 8) {
  const rim = H.mesh(torus(H, R * 0.92, R * 0.09, Math.PI * 2, 20), rimMat, x, y, z, g);
  rim.rotation.y = Math.PI / 2;
  const hub = H.mesh(H.cyl(R * 0.2, R * 0.2, R * 0.38, 10), H.metal(), x, y, z, g);
  hub.rotation.z = Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const s = H.mesh(H.box(R * 0.06, R * 1.75, R * 0.08), spokeMat, x, y, z, g);
    s.rotation.x = (i / n) * Math.PI;
  }
}
// An iron gun barrel along +Z from z0 (breech) to z1 (muzzle), at height y.
export function barrel(H, g, x, y, z0, z1, r, iron, ring) {
  const L = z1 - z0;
  const b0 = H.mesh(H.cyl(r * 0.8, r, L, 14), iron, x, y, z0 + L / 2, g);
  b0.rotation.x = Math.PI / 2;
  for (const f of [0.08, 0.42, 0.62]) { const o = H.mesh(H.cyl(r * 1.12, r * 1.12, L * 0.05, 14), ring, x, y, z0 + L * f, g); o.rotation.x = Math.PI / 2; }
  const m = H.mesh(H.cyl(r * 1.08, r * 0.86, L * 0.09, 14), ring, x, y, z1 - L * 0.04, g); m.rotation.x = Math.PI / 2;
  const bore = H.mesh(H.cyl(r * 0.55, r * 0.55, 0.01, 12), H.mat('#0d0d0d'), x, y, z1 + 0.003, g); bore.rotation.x = Math.PI / 2;
  H.mesh(H.sphere(r * 0.9, 12, 8), iron, x, y, z0, g).scale.set(1, 1, 0.7);
  H.mesh(H.sphere(r * 0.38, 8, 6), iron, x, y, z0 - r * 0.75, g);
}
export function ballMesh(H, g, r = 0.2) {
  H.mesh(H.sphere(r, 14, 10), H.mat('#26262a', { spec: 0.5 }), 0, 0, 0, g);
  H.mesh(H.sphere(r * 0.3, 6, 5), H.mat('#5a5a62', { spec: 0.8 }), r * 0.45, r * 0.55, r * 0.45, g).castShadow = false;
}

const PAINTS = ['#e8342a', '#2a6ee8', '#f4c81e', '#34b04a', '#e85aa8', '#ff8a1e', '#8a4ae8'];
export const paintCol = () => PAINTS[Math.floor(Math.random() * PAINTS.length)];

// ------------------------------------------------------------------ register
export const PROJ = { pr_shot: shot, pr_cannonball: cannonball, pr_line: { g: 0, len: 0, r: 0, life: 1 }, rn_splat: { g: 0, len: 0, r: 0, life: 1 } };
EXT.pose.push(prPose);
register({
  kinds: { pr_gun: gun },
  proj: PROJ,
  buildProj(type, g, H) {
    const { mesh, cyl, sphere, mat } = H;
    if (type === 'pr_shot') {
      mesh(sphere(0.035, 8, 6), mat('#8a8e96', { spec: 0.9 }), 0, 0, 0, g).castShadow = false;
      const st = mesh(cyl(0.01, 0.03, 0.5, 5), mat('#fff6d0', { emit: 1, transparent: true, opacity: 0.45 }), 0, -0.28, 0, g);
      st.castShadow = false;
      return true;
    }
    if (type === 'pr_cannonball') { ballMesh(H, g, 0.2); return true; }
    if (type === 'pr_line') { mesh(cyl(0.018, 0.018, SEG * 1.08, 5), mat('#c8b07a'), 0, 0, 0, g).castShadow = false; return true; }
    if (type === 'rn_splat') {
      // a few blobs of paint, flattened onto the body
      for (let i = 0; i < 4; i++) {
        const o = mesh(sphere(0.06 + Math.random() * 0.06, 8, 6), mat(paintCol(), { spec: 0.6 }), rand(-0.1, 0.1), rand(-0.1, 0.1), 0, g);
        o.scale.set(1.2, 1, 0.35); o.castShadow = false;
      }
      return true;
    }
    return false;
  },
  battleStep(b, dt) {
    const s = b._pr;
    if (!s) return;
    if (s.reels.length) stepReels(b, dt);
    if (s.painted.length) stepPaint(b, dt);
  },
});

export { SM, EXPR, PART, THREE, clamp, rand };
