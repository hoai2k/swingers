// Shared helpers for the faction packs: default melee/ranged AI for pack-defined
// weapon kinds, status effects (frost slow, poison, burning), ropes that pull a
// victim in, lightning bolts, extra projectile spawning, falling-apart skeletons
// and a few mesh helpers. Status effects and ropes are drawn with "stuck" entries
// (battle.stuck) of pack projectile types, so they show up in replays too.
import { register } from '../ext.js';
import { THREE, clamp, rand, ballisticAngle, segSegDist2 } from '../util.js';
import { PART, NPARTS } from '../body.js';
import { FIELD } from '../world.js';

export { THREE, clamp, rand, PART, NPARTS };
export const EXPR = { normal: 0, angry: 1, scared: 2, dead: 3, happy: 4, hurt: 5 };

// ids for pack-made projectiles and markers (well clear of battle.js's counter; the
// replay stores ids as float32, exact up to 2^24)
let nextId = 3e6;
export const newId = () => (nextId = nextId >= 16e6 ? 3e6 : nextId + 1);

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const UPY = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ AI
// The core melee behaviour (unit.js think), for pack kinds that fight in melee.
export function meleeThink(u, dt, c) {
  const b = u.battle, pers = u.def.personality, p = u.pos;
  const { t, dist, gap, dirx, dirz, spd } = c;
  u.expr = gap < 6 ? EXPR.angry : EXPR.normal;
  const near = dist - t.skel.radius;
  let pace = 1;
  if (gap > 8 && pers.aggro < 1) {
    const f = b.front[u.team];
    if (f && (p.x - f.x) * f.dx + (p.z - f.z) * f.dz > 2.5) pace = 0.65;
  }
  if (near > u.reachDist * 0.8) u.desired.set(dirx * spd * pace, 0, dirz * spd * pace);
  else if (near < u.reachDist * 0.4) u.desired.set(-dirx * spd * 0.3, 0, -dirz * spd * 0.3);
  if (near < u.reachDist + 0.35 && u.cooldown <= 0 && !u.st.attack && !u.isDown()) u.startAttack();
  if (u.st.attack) u.desired.multiplyScalar(0.35);
  return t;
}

// The core ranged behaviour: close to range, shy units kite melee for a while.
export function rangedThink(u, dt, c) {
  const w = u.def.weapon, pers = u.def.personality, p = u.pos;
  const { t, dist, dirx, dirz, spd } = c;
  u.expr = EXPR.normal;
  const shy = pers.aggro < 0.5;
  u.kiteT = Math.min(3, (u.kiteT ?? 3) + dt * 0.4);
  const cornered = Math.abs(p.x) > FIELD.x - 2 || Math.abs(p.z) > FIELD.z - 2;
  const kiting = shy && dist < w.minRange * 0.6 && u.kiteT > 0 && !cornered && t.def.weapon.kind !== 'ranged';
  if (dist > w.range * 0.85) u.desired.set(dirx * spd, 0, dirz * spd);
  else if (kiting) { u.desired.set(-dirx * spd * 0.75, 0, -dirz * spd * 0.75); u.kiteT -= dt * 1.4; }
  if (dist < w.range && !u.st.attack && u.cooldown <= 0 && (dist > w.minRange * 0.4 || !kiting)) {
    u.startAttack();
    u.aimAt = t;
  }
  if (u.st.attack) u.desired.multiplyScalar(0.1);
  return t;
}

// attack-animation event helper: true when the animation passed `at`
export const crossed = (t0, t1, at) => t0 < at && t1 >= at;

// Front test: is point (x, z) in front of unit u (within ~+-80 degrees)?
export function inFront(u, x, z, k = 0.15) {
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const dx = x - u.pos.x, dz = z - u.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  return (fx * dx + fz * dz) / d > k;
}

// Where a ranged unit wants its shot to land (the aimed target, led a little), or
// for a possessed unit the crosshair point (control.aimPt, set by game.js), else a
// point ahead of it.
export function aimPoint(u, out, lead = 0.6, tof = 0.6) {
  const t = u.aimAt;
  if (t && t.alive) {
    const c = t.chestPos, v = t.rag.vel[PART.chest];
    return out.set(c.x + v.x * tof * lead, c.y, c.z + v.z * tof * lead);
  }
  if (u.control && u.control.aimPt) return out.copy(u.control.aimPt);
  const d = 14;
  return out.set(u.pos.x + Math.sin(u.heading) * d, u.pos.y, u.pos.z + Math.cos(u.heading) * d);
}

// Launch velocity from `from` to `to` at `speed` (gravity g), with spread.
export function launchVel(from, to, speed, g, high, spread, out) {
  const dx = Math.hypot(to.x - from.x, to.z - from.z), dy = to.y - from.y;
  let ang = g <= 0.01 ? Math.atan2(dy, dx) : ballisticAngle(dx, dy, speed, g, high);
  if (ang === null) ang = Math.PI / 4;
  const yaw = Math.atan2(to.x - from.x, to.z - from.z) + rand(-1, 1) * spread;
  ang += rand(-1, 1) * spread;
  return out.set(Math.sin(yaw) * Math.cos(ang), Math.sin(ang), Math.cos(yaw) * Math.cos(ang)).multiplyScalar(speed);
}

// Push a projectile without battle.spawnProjectile's throw sound (volleys, pellets).
export function addProjectile(b, type, pos, vel, owner, over = {}) {
  const w = owner.def.weapon;
  const pr = {
    id: newId(), type, pos: pos.clone(), vel: vel.clone(), prev: pos.clone(), team: owner.team, owner,
    damage: w.damage, force: w.force, blast: w.blast || 0, life: 6, fuse: -1,
    spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), quat: new THREE.Quaternion(), hits: new Set(),
    ...over,
  };
  if (pr.vel.lengthSq() > 0) pr.quat.setFromUnitVectors(UPY, _v.copy(pr.vel).normalize());
  b.projectiles.push(pr);
  return pr;
}

export const handPos = (u, out = new THREE.Vector3()) => u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0, out);

// ------------------------------------------------------------------ hits
// Hit a victim from a pack projectile/effect: damage, push, blood or sparks.
export function strike(b, v, dmg, dir, force, attacker, kind, part = PART.chest, sound = 'stab') {
  const c = v.rag.pos[part];
  // parried (kind.parry): the hit lands on the blade, no blood or push
  if (v.kind?.parry && v.kind.parry(v, attacker, kind)) { v.hit(dmg, part, 0, 0, 0, attacker, kind); return; }
  v.hit(dmg, part, dir.x * force * 0.5, dir.y * force * 0.5 + force * 0.1, dir.z * force * 0.5, attacker, kind);
  v.rag.impulseAll(dir.x * force * 0.5, dir.y * force * 0.5, dir.z * force * 0.5);
  if (v.def.armor > 0.3) { b.emit('spark', c.x, c.y, c.z, 4); b.sound('clang', c, 0.5, 1.3); }
  else { b.emit('blood', c.x, c.y, c.z, 6, dir.x, dir.z); if (sound) b.sound(sound, c, 0.7, 1); }
}

// A raised shield in front catches it (for arrow-like pack projectiles).
export function shieldBlocks(b, v, dir, chance = 0.85) {
  const vw = v.def.weapon;
  if (!vw.shield || v.stun > 0 || v.isDown()) return false;
  if (-(dir.x * Math.sin(v.heading) + dir.z * Math.cos(v.heading)) <= 0.3 || Math.random() > chance) return false;
  const p = v.rag.pos[PART.farmL];
  b.emit('spark', p.x, p.y, p.z, 4);
  b.sound('block', p, 0.7, 1);
  return true;
}

// Stick a projectile (as drawn) to a part of a unit.
export function stickTo(b, pr, v, part, t = 25) {
  const rag = v.rag;
  _v.copy(pr.vel).normalize();
  const lp = pr.pos.clone().addScaledVector(_v, -0.1).sub(rag.pos[part]).applyQuaternion(_q.copy(rag.quat[part]).invert());
  const lq = _q.clone().multiply(pr.quat);
  b.stuck.push({ type: pr.type, unit: v, part, lp, lq, pos: pr.pos.clone(), quat: pr.quat.clone(), t, id: pr.id });
}

// Find the first enemy part the projectile's last move passed through (like the core
// test for arrows; the core only tests the chest for projectiles with a hit()).
// A beast (bc-core.js) is hit on its body capsule and reported as its chest.
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
export function sweepParts(b, pr, r) {
  let best = null;
  b.grid.query(pr.pos.x, pr.pos.z, 8, (v) => {
    if (best || !v.alive || v.team === pr.team || pr.hits.has(v)) return;
    if (v.bc) {
      const g = v.bc.big, rr = g.r + r;
      if (g.alive && segSegDist2(pr.prev, pr.pos, g.A, g.B) < rr * rr) best = { v, part: PART.chest };
      return;
    }
    for (let i = 0; i < NPARTS; i++) {
      const part = v.skel.parts[i], c = v.rag.pos[i];
      if (part.shape === 'ball') { _a.copy(c); _b.copy(c); }
      else {
        _a.set(0, part.hh, 0).applyQuaternion(v.rag.quat[i]).add(c);
        _b.set(0, -part.hh, 0).applyQuaternion(v.rag.quat[i]).add(c);
      }
      const rr = part.r + r;
      if (segSegDist2(pr.prev, pr.pos, _a, _b) < rr * rr) { best = { v, part: i }; return; }
    }
  });
  return best;
}

// An arrow-like projectile that sticks and then applies `onHit(b, v, pr, dir)`.
// Hits are found in step() against every part (pr.life = -1 ends it).
export function arrowProj(over) {
  const hitUnit = (b, pr, v, part) => {
    pr.hits.add(v);
    const dir = _w.copy(pr.vel).normalize();
    if (shieldBlocks(b, v, dir)) { stickTo(b, pr, v, PART.farmL); return true; }
    strike(b, v, pr.damage, dir, pr.force, pr.owner, pr.type, part, 'stab');
    stickTo(b, pr, v, part);
    if (over.onHit) over.onHit(b, v, pr, dir);
    return true;
  };
  return {
    g: 9.81, len: 0.85, r: 0.05, stick: true, life: 8,
    step(b, pr) {
      if (!pr.snd) { pr.snd = true; b.sound('bow', pr.pos, 0.5, rand(0.9, 1.1)); }
      const h = sweepParts(b, pr, 0.05);
      if (h && hitUnit(b, pr, h.v, h.part)) pr.life = -1;
    },
    hit: (b, pr, v, part) => hitUnit(b, pr, v, part),
    ...over,
  };
}

// ------------------------------------------------------------------ beasts
// A beast (bc-core.js) is a rigid body steered by velocity servos with a kinematic
// pilot ragdoll hidden inside, so impulses on the pilot do nothing. Drags (ropes,
// reels) go to the body as the same change of velocity, less for heavy beasts.
export function pushUnit(v, ix, iy, iz) {
  const m = v.bc;
  if (!m) { v.rag.impulseAll(ix, iy, iz); return; }
  const k = (m.cfg.mass / v.M) * clamp(250 / m.cfg.mass, 0.08, 1);
  m.torso.body.applyImpulse({ x: ix * k, y: iy * k, z: iz * k }, true);
}
// Slows (frost, paint, a rope) hold a beast's goal speed down to k for t seconds.
export function slowBeast(v, k = 0.5, t = 0.1) {
  const m = v.bc;
  if (!m) return false;
  if (!(m.slowT > 0)) m.slowK = k; else m.slowK = Math.min(m.slowK, k);
  m.slowT = Math.max(m.slowT || 0, t);
  return true;
}

// ------------------------------------------------------------------ status effects
// kind: 'slow' (frost), 'poison', 'burn'. dps for damage over time; src gets the kill.
const MARK = { slow: ['st_frost', PART.chest], poison: ['st_venom', PART.head], burn: null };
export function addStatus(b, v, kind, dur, dps = 0, src = null) {
  if (!v.alive) return;
  v.status ??= {};
  let s = v.status[kind];
  if (!s) s = v.status[kind] = { t: 0, dps: 0, tick: 0.5, src: null, mark: null };
  s.t = Math.max(s.t, dur);
  s.dps = Math.max(s.dps, dps);
  s.src = src || s.src;
  const m = MARK[kind];
  if (m && (!s.mark || s.mark.t <= 0)) {
    const rag = v.rag;
    const lp = new THREE.Vector3(0, m[1] === PART.head ? v.skel.rHead * 1.25 : 0, 0);
    s.mark = { type: m[0], unit: v, part: m[1], lp, lq: new THREE.Quaternion(), pos: rag.pos[m[1]].clone(), quat: rag.quat[m[1]].clone(), t: dur, id: newId() };
    b.stuck.push(s.mark);
  }
  if (s.mark) s.mark.t = Math.max(s.mark.t, s.t);
}

function stepStatus(b, u, dt) {
  const S = u.status;
  for (const k in S) {
    const s = S[k];
    if (s.t <= 0) continue;
    s.t -= dt;
    if (!u.alive) { s.t = 0; if (s.mark) s.mark.t = 0; continue; }
    if (k === 'slow') {
      // drag on the feet and slower attacks
      if (slowBeast(u, 0.5)) { /* a beast's legs (or wings) slow down */ }
      else if (u.airT <= 0) {
        const v0 = u.rag.vel[PART.pelvis];
        u.rag.impulseAll(-v0.x * u.M * 0.12, 0, -v0.z * u.M * 0.12);
      }
      u.cooldown += dt * 0.5;
    }
    if (s.dps > 0) {
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.5;
        u.hit(s.dps * 0.5, PART.chest, 0, 0, 0, s.src && s.src.alive ? s.src : null, k);
        if (u.alive) u.lastHitBy = s.src;
      }
      if (k === 'burn' && Math.random() < dt * 14) {
        const c = u.chestPos;
        b.emit('trail', c.x + rand(-0.2, 0.2), c.y + rand(-0.2, 0.4), c.z + rand(-0.2, 0.2), Math.random() < 0.5 ? 1 : 0);
      }
    }
    if (s.t <= 0 && s.mark) s.mark.t = 0;
  }
}

// ------------------------------------------------------------------ ropes
// A rope from the owner's hand to a victim's chest that drags the victim in.
const ropes = new WeakMap(); // battle -> [rope]
export function addRope(b, owner, victim, dur, pull) {
  let list = ropes.get(b);
  if (!list) ropes.set(b, (list = []));
  for (const r of list) if (r.victim === victim) { r.t = dur; return r; }
  const r = { owner, victim, t: dur, pull, segs: [] };
  list.push(r);
  return r;
}
const SEG = 0.9;
function stepRopes(b, dt) {
  const list = ropes.get(b);
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    r.t -= dt;
    const o = r.owner, v = r.victim;
    const A = handPos(o, _v);
    const B = _w.copy(v.chestPos);
    const d = A.distanceTo(B);
    const done = r.t <= 0 || !o.alive || d < 1.2 * Math.max(1, v.s) || d > 30;
    if (done) {
      for (const s of r.segs) s.t = 0;
      list.splice(i, 1);
      continue;
    }
    // drag the victim (living or dead) toward the owner
    if (v.alive) v.stun = Math.max(v.stun, 0.3);
    if (v.alive) slowBeast(v, 0.35);
    const k = r.pull * dt * v.M * clamp(d / 3, 0.4, 1) / Math.max(1, v.s * v.s);
    pushUnit(v, (A.x - B.x) / d * k, Math.max(0, (A.y - B.y) / d) * k + v.M * 2.5 * dt, (A.z - B.z) / d * k);
    // segments
    const n = Math.min(40, Math.ceil(d / SEG));
    while (r.segs.length < n) { const s = { type: 'rope', unit: null, part: -1, dyn: true, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), t: 99, id: newId() }; r.segs.push(s); b.stuck.push(s); }
    while (r.segs.length > n) r.segs.pop().t = 0;
    const sag = Math.min(0.6, d * 0.03);
    for (let j = 0; j < n; j++) {
      const s = r.segs[j];
      const f0 = j / n, f1 = (j + 1) / n;
      const y0 = -sag * 4 * f0 * (1 - f0), y1 = -sag * 4 * f1 * (1 - f1);
      const x0 = A.x + (B.x - A.x) * f0, z0 = A.z + (B.z - A.z) * f0, yy0 = A.y + (B.y - A.y) * f0 + y0;
      const x1 = A.x + (B.x - A.x) * f1, z1 = A.z + (B.z - A.z) * f1, yy1 = A.y + (B.y - A.y) * f1 + y1;
      s.pos.set((x0 + x1) / 2, (yy0 + yy1) / 2, (z0 + z1) / 2);
      const dir = new THREE.Vector3(x1 - x0, yy1 - yy0, z1 - z0).normalize();
      s.quat.setFromUnitVectors(UPY, dir);
      s.t = 99;
    }
  }
}

// ------------------------------------------------------------------ lightning
export function lightning(b, x, z, owner, damage, radius, force) {
  const gy = b.terrain.height(x, z);
  const pos = new THREE.Vector3(x, gy, z);
  const q = new THREE.Quaternion().setFromAxisAngle(UPY, rand(0, Math.PI * 2));
  b.stuck.push({ type: 'zbolt', unit: null, part: -1, pos: pos.clone(), quat: q, t: 0.3, id: newId() });
  b.emit('spark', x, gy + 0.3, z, 14);
  b.emit('spark', x, gy + 3, z, 6);
  blast(b, pos.setY(gy + 0.4), radius, damage, force, owner, { fx: 2, friendly: 0.5 });
  b.sound('clang', pos, 1.2, 2.2);
}

// An explosion like battle.explode, but it spares its owner, allies take `friendly`
// of the damage, and `fx` picks the look (0 bomb, 1 potion, 2 fire, -1 none).
// onUnit(v, f) runs for each enemy caught (f = 1 at the centre).
export function blast(b, pos, radius, damage, force, owner, o = {}) {
  const p = pos.clone();
  const fx = o.fx ?? 0, friendly = o.friendly ?? 1;
  if (fx >= 0) b.emit('explode', p.x, p.y, p.z, radius, fx);
  if (o.sound !== null) b.sound(o.sound || 'boom', p, clamp(radius / 3, 0.5, 1.6) * (o.vol ?? 1), o.pitch ?? 1);
  b.grid.query(p.x, p.z, radius + 3, (v) => {
    if (v === owner) return;
    const c = v.chestPos;
    const d = c.distanceTo(p);
    if (d > radius + v.skel.radius) return;
    const ally = owner && v.team === owner.team;
    const k = ally ? friendly : 1;
    if (k <= 0) return;
    const f = clamp(1 - d / (radius + v.skel.radius), 0.15, 1);
    _v.copy(c).sub(p);
    _v.y = Math.max(_v.y, 0) + 0.8;
    _v.normalize();
    const imp = force * f * Math.min(1.5, v.M / 80) * (ally ? 0.6 : 1);
    v.hit(damage * f * k, PART.chest, 0, 0, 0, owner, 'blast');
    v.rag.impulseAll(_v.x * imp, _v.y * imp, _v.z * imp);
    v.stun = Math.max(v.stun, 1.2 * f * (v.def.stagger ?? 1) * (ally ? 0.5 : 1));
    if (!ally && o.onUnit) o.onUnit(v, f);
  });
  for (const v of b.units) {
    if (v.alive) continue;
    const c = v.chestPos, d = c.distanceTo(p);
    if (d > radius) continue;
    const f = 1 - d / radius;
    _v.copy(c).sub(p); _v.y = Math.max(_v.y, 0) + 0.8; _v.normalize();
    v.rag.impulseAll(_v.x * force * f * 0.6, _v.y * force * f * 0.6, _v.z * force * f * 0.6);
  }
}

// ------------------------------------------------------------------ falling apart
// Units with def.fallApart lose their joints when they die and scatter.
function breakApart(b, u) {
  u.brokenApart = true;
  const rag = u.rag;
  for (const j of rag.joints) b.world.removeImpulseJoint(j, true);
  rag.joints = [];
  for (let i = 0; i < NPARTS; i++) {
    const m = u.skel.parts[i].mass;
    rag.impulse(i, rand(-1.5, 1.5) * m, rand(0.5, 2.5) * m, rand(-1.5, 1.5) * m);
  }
  const c = u.chestPos;
  b.emit('dust', c.x, c.y, c.z, 2);
  b.sound('crunch', c, 0.6, 1.6);
}

// ------------------------------------------------------------------ meshes
// Extra geometry helpers (cached through H.geo).
const f3 = (v) => (+v).toFixed(3);
export const torus = (H, R, t, arc = Math.PI * 2, n = 16) => H.geo(`pk-t${f3(R)}:${f3(t)}:${f3(arc)}:${n}`, () => new H.THREE.TorusGeometry(R, t, 6, n, arc));
export const lathe = (H, key, pts, n = 16) => H.geo('pk-l' + key, () => new H.THREE.LatheGeometry(pts.map(([x, y]) => new H.THREE.Vector2(Math.max(1e-4, x), y)), n));
// a tapered tube along points (horns, tails, snakes)
export function tube(H, key, pts, r0, r1, n = 10) {
  return H.geo('pk-tb' + key, () => {
    const T = H.THREE;
    const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p)));
    const g = new T.TubeGeometry(curve, n, 1, 7, false);
    const p = g.attributes.position, c = new T.Vector3(), v = new T.Vector3();
    for (let i = 0; i <= n; i++) {
      curve.getPointAt(i / n, c);
      const k = r0 + (r1 - r0) * (i / n);
      for (let j = 0; j <= 7; j++) {
        const idx = i * 8 + j;
        v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c);
        p.setXYZ(idx, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}
// a dome (upper part of a sphere), opening downward
export const dome = (H, r, frac = 0.5, n = 16) => H.geo(`pk-dm${f3(r)}:${f3(frac)}:${n}`, () => new H.THREE.SphereGeometry(r, n, 8, 0, Math.PI * 2, 0, Math.PI * frac));
// Make an open surface two-sided by appending a flipped copy (baked meshes are
// front-side only).
export function twoSided(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = g.attributes.normal, N = p.count;
  const pos = new Float32Array(N * 6), nor = new Float32Array(N * 6);
  pos.set(p.array); nor.set(n.array);
  for (let i = 0; i < N; i += 3) for (let k = 0; k < 3; k++) {
    const src = i + (2 - k), dst = N + i + k;
    for (let c = 0; c < 3; c++) {
      pos[dst * 3 + c] = p.array[src * 3 + c] - n.array[src * 3 + c] * 0.002;
      nor[dst * 3 + c] = -n.array[src * 3 + c];
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
// a garment covering the whole chest bean (chest part p = skel.parts[PART.chest])
export function chestShell(H, p, m, parent, k = 1) {
  const o = H.mesh(H.capsule(p.r * 1.17 * k, p.hh * 2), m, 0, 0, 0, parent);
  o.scale.set(1, 0.92, 0.92);
  return o;
}
// a hood: the back and top of a sphere of radius r*k, open at the face
export const hoodGeo = (H, r, k, open = 1.0) => H.geo(`pk-hood${f3(r)}:${f3(k)}:${f3(open)}`, () => twoSided(new H.THREE.SphereGeometry(r * k, 18, 12, Math.PI / 2 + open, Math.PI * 2 - 2 * open, 0, Math.PI * 0.78)));
// a band around the head sphere at height y (head radii), h tall
export function headBand(H, r, y, h, m, g, out = 0.04) {
  const R = (yy) => r * (Math.sqrt(Math.max(0.02, 1 - yy * yy)) + out);
  return H.mesh(H.cyl(R(y + h / 2), R(y - h / 2), r * h, 20), m, 0, r * y, 0, g);
}
export const tcol = (H, team) => H.mat(H.TEAM_COLORS[team]);
export const tdark = (H, team) => H.mat(H.TEAM_DARK[team]);

// Arrow-shaped projectile mesh (shaft along +Y, tip at +0.44)
export function arrowMesh(H, g, tip, fletch, glowTip) {
  const { mesh, cyl, cone, box, mat, glow } = H;
  mesh(cyl(0.013, 0.013, 0.8, 5), mat('#9a6332'), 0, 0, 0, g);
  mesh(cone(0.034, 0.12, 5), glowTip ? glow(tip) : mat(tip, { spec: 0.8 }), 0, 0.44, 0, g);
  for (let i = 0; i < 3; i++) {
    const f = mesh(box(0.004, 0.14, 0.05), mat(i ? fletch : '#f4f0e6'), 0, -0.33, 0, g);
    f.rotation.y = (i / 3) * Math.PI * 2; f.translateZ(0.025);
  }
}

// ------------------------------------------------------------------ register
register({
  proj: {
    // markers drawn on units with a status effect, a rope segment, a lightning bolt
    st_frost: { g: 0, len: 0, r: 0, life: 1 },
    st_venom: { g: 0, len: 0, r: 0, life: 1 },
    rope: { g: 0, len: 0, r: 0, life: 1 },
    zbolt: { g: 0, len: 0, r: 0, life: 1 },
  },
  buildProj(type, g, H) {
    const { mesh, box, sphere, octa, cyl, mat, glow } = H;
    if (type === 'st_frost') {
      const ice = mat('#bff4ff', { emit: 0.45, spec: 1, transparent: true, opacity: 0.8 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const o = mesh(octa(0.11), ice, Math.cos(a) * 0.3, (i % 3 - 1) * 0.12, Math.sin(a) * 0.3, g);
        o.scale.set(0.6, 1.6, 0.6);
        o.rotation.set(rand(-0.5, 0.5), a, rand(-0.5, 0.5));
        o.castShadow = false;
      }
      return true;
    }
    if (type === 'st_venom') {
      const gr = glow('#8cff5a');
      for (let i = 0; i < 4; i++) { const o = mesh(sphere(0.05 + i * 0.012, 8, 6), gr, Math.cos(i * 2.2) * 0.12, i * 0.07, Math.sin(i * 2.2) * 0.12, g); o.castShadow = false; }
      const sk = mesh(sphere(0.07, 8, 6), mat('#4a8a2a'), 0, 0.33, 0, g); sk.castShadow = false;
      return true;
    }
    if (type === 'rope') {
      mesh(cyl(0.022, 0.022, SEG * 1.08, 5), mat('#c8a46a'), 0, 0, 0, g).castShadow = false;
      return true;
    }
    if (type === 'zbolt') {
      const core = glow('#f4fbff'), halo = mat('#8fd0ff', { emit: 1, transparent: true, opacity: 0.55 });
      let x = 0, z = 0, y = 0;
      for (let i = 0; i < 9; i++) {
        const nx = i === 8 ? 0 : rand(-0.6, 0.6), nz = i === 8 ? 0 : rand(-0.6, 0.6), ny = y + 1.8;
        const a = new H.THREE.Vector3(x, y, z), b2 = new H.THREE.Vector3(nx, ny, nz);
        const len = a.distanceTo(b2);
        for (const [m, r] of [[core, 0.07], [halo, 0.2]]) {
          const o = mesh(cyl(r, r, len, 5), m, (x + nx) / 2, (y + ny) / 2, (z + nz) / 2, g);
          o.quaternion.setFromUnitVectors(UPY, b2.clone().sub(a).normalize());
          o.castShadow = false;
        }
        x = nx; y = ny; z = nz;
      }
      g.rotation.x = 0;
      return true;
    }
    return false;
  },
  battleStep(b, dt) {
    for (const u of b.units) {
      if (u.status) stepStatus(b, u, dt);
      if (!u.alive && u.def.fallApart && !u.brokenApart) breakApart(b, u);
    }
    stepRopes(b, dt);
  },
});
