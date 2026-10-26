// More units for the core factions (src/units.js):
//  Tribal: Bone Mage (bone spikes burst out of the ground under the enemy and toss
//          them up, after a telegraph ring), Stoner (cheap rock thrower: a stone to the
//          head leaves the target dazed).
//  Farmer: Scarecrow (throws crows that home in and peck: the target panics and runs),
//          Harvester (scythe sweeps through everything in a wide arc in front and
//          trips it), Wheelbarrow (bulldozes through the line with a barrow that also
//          catches arrows from the front).
//  Legacy: Peasant (cheap; bold in a crowd, runs when left alone), Barbarian (grabs
//          an enemy and hurls it into its friends), Poacher (bolas tangle the legs:
//          the target can only shuffle, a running one trips).
// Everything drawn is a projectile or a battle.stuck marker of a pack type, and every
// effect is an emitted event, so the replay shows it all.
import { register } from '../ext.js';
import { ATTACKS, GUARD } from '../pose.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, crossed, inFront, aimPoint, sweepParts, strike, shieldBlocks,
  pushUnit, slowBeast, torus, tube, dome, headBand, tcol, tdark, chestShell, hoodGeo, airborne, groundEnemy,
} from './common.js';
import { mark, markAt } from './ges-core.js';

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3();

// per-battle state
const STATE = new WeakMap();
function S(b) {
  let s = STATE.get(b);
  if (!s) STATE.set(b, (s = { thrown: [], tangled: [] }));
  return s;
}
const isFoe = (u, v) => v.alive && v.team !== u.team;

// ------------------------------------------------------------------ effects
// Panic: the target drops what it is doing and runs for a while (big ones less).
// After a fright a unit is steady for a few seconds (no endless panic).
export function scare(b, v, dur) {
  if (!v.alive || v.control || b.time < (v.fearFree || 0)) return;
  const t = dur / Math.max(1, v.s * 0.8);
  v.fearFree = b.time + t + 4;
  v.fleeT = Math.max(v.fleeT, t);
  v.st.attack = null;
  if (!v.crowMark || v.crowMark.t <= 0) v.crowMark = mark(b, v, 'cl_crows', PART.head, t, new THREE.Vector3(0, v.skel.rHead * 1.1, 0));
  else v.crowMark.t = Math.max(v.crowMark.t, t);
  b.voice(v, 'scream', true);
}

// Tangled legs: only a shuffle for dur seconds; a running unit trips over.
export function entangle(b, v, dur) {
  if (!v.alive) return;
  const s = S(b);
  let e = s.tangled.find((x) => x.v === v);
  const run = Math.hypot(v.rag.vel[PART.pelvis].x, v.rag.vel[PART.pelvis].z);
  if (!v.bc && run > 2.6) v.stun = Math.max(v.stun, 1.0 * (v.def.stagger ?? 1));
  if (e) { e.t = Math.max(e.t, dur); e.m.t = e.t; return; }
  const m = v.bc ? null : mark(b, v, 'cl_tangle', PART.pelvis, dur, new THREE.Vector3(0, -v.skel.parts[PART.pelvis].r * 2.6 * Math.max(0.8, v.s), 0));
  s.tangled.push({ v, t: dur, m: m || { t: 0 } });
}

// ------------------------------------------------------------------ animations
// two-handed scythe sweep: wound up over the right shoulder, swept across the front
ATTACKS.cl_reap = [
  [0.0, null, null, 0, 0, 0],
  [0.36, [0.85, 0.0, -0.9, -1.2], [-0.45, 1.0, -0.85, -1.1], 0.75, -0.15, 0.15],
  [0.52, [0.15, 0.35, -1.2, -1.3], [0.55, 0.25, -1.3, -1.4], 0.0, 0.2, 0.2],
  [0.68, [-0.35, 0.9, -1.0, -1.2], [0.95, 0.1, -1.2, -1.3], -0.75, 0.3, 0.2],
  [1.0, null, null, 0, 0, 0],
];
// pushing a wheelbarrow: both hands low and forward on the handles
GUARD.cl_barrow = { L: [0.25, 0.05, -0.55, -0.75], R: [0.25, 0.05, -0.55, -0.75] };

// ------------------------------------------------------------------ kinds
// Bone Mage: a ring marks the spot (where the target will be), then spikes erupt.
const boneMage = {
  init(u) { u.attackDur = u.def.weapon.windup; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, dirx, dirz, spd } = c;
    u.expr = EXPR.normal;
    if (dist > w.range * 0.85) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (dist < w.minRange * 0.7) u.desired.set(-dirx * spd * 0.7, 0, -dirz * spd * 0.7);
    // spikes come out of the ground: a flyer can't be hit, so pick someone standing
    const g = t && airborne(u.battle, t) ? groundEnemy(u.battle, u, w.range) : t;
    if (g && dist < w.range && dist > w.minRange * 0.5 && !u.st.attack && u.cooldown <= 0 && u.stun <= 0) { u.startAttack(); u.aimAt = g; }
    if (u.st.attack) u.desired.multiplyScalar(0.1);
    return t;
  },
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    aimPoint(u, _p, 1, w.delay);
    const k = w.spread * Math.hypot(_p.x - u.pos.x, _p.z - u.pos.z);
    const x = _p.x + rand(-k, k), z = _p.z + rand(-k, k), gy = b.terrain.height(x, z);
    const h = u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0, _v);
    b.emit('ptrail', h.x, h.y + 0.6 * u.s, h.z);
    b.emit('spark', h.x, h.y + 0.6 * u.s, h.z, 3);
    b.sound('heal', h, 0.5, 0.6);
    markAt(b, 'cl_bonering', _w.set(x, gy + 0.04, z), w.delay + 0.1);
    b.emit('dust', x, gy, z, 1);
    b.delayed.push([w.delay, () => erupt(b, x, z, u, w)]);
  },
};
function erupt(b, x, z, u, w) {
  const gy = b.terrain.height(x, z), R = w.blast;
  const pos = new THREE.Vector3(x, gy, z);
  markAt(b, 'cl_spikes', pos, 2.4);
  b.emit('dust', x, gy, z, 6);
  b.emit('dust', x, gy + 0.6, z, 3);
  b.sound('crunch', pos, 1.2, 0.65);
  b.sound('thump', pos, 1.0, 0.8);
  b.grid.query(x, z, R + 3, (v) => {
    if (!isFoe(u, v)) return;
    const dx = v.pos.x - x, dz = v.pos.z - z, d = Math.hypot(dx, dz);
    if (d > R + v.skel.radius * 0.5 || v.pos.y - gy > 2.5 * Math.max(1, v.s)) return;
    const f = clamp(1 - d / (R + 0.6), 0.35, 1);
    v.hit(w.damage * f, PART.pelvis, 0, 0, 0, u, 'bones');
    const imp = Math.min(v.M * 9, w.force) * f;
    pushUnit(v, (dx / (d || 1)) * imp * 0.3, imp, (dz / (d || 1)) * imp * 0.3);
    v.stun = Math.max(v.stun, 1.1 * f * (v.def.stagger ?? 1));
    const c = v.chestPos;
    b.emit(v.def.armor > 0.3 ? 'spark' : 'blood', c.x, c.y - 0.3, c.z, 6, 0, 0);
  });
}

// Harvester: one sweep cuts everything in a wide arc in front, and trips it.
const reap = {
  melee: true,
  init(u) { u.reachDist = u.def.weapon.reach * u.s * 0.8; },
  think: meleeThink,
  event(u, t0, t1) {
    if (!crossed(t0, t1, 0.5)) return;
    const b = u.battle, w = u.def.weapon, p = u.pos, h = u.heading;
    const fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h); // forward, left
    const R = w.reach * u.s, k = u.buff > 0 ? 1.15 : 1;
    let n = 0;
    b.grid.query(p.x, p.z, R + 2, (v) => {
      if (!isFoe(u, v) || n >= w.maxHits) return;
      const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d - v.skel.radius > R || (dx * fx + dz * fz) < Math.cos(w.arc) * d) return;
      if (v.pos.y - p.y > 1.6 * u.s) return;
      n++;
      if (v.kind?.parry && v.kind.parry(v, u, 'melee')) { v.hit(w.damage * k, PART.farmR, 0, 0, 0, u, 'melee'); return; }
      const f = Math.min(w.force, v.M * 9) * k;
      _d.set(lx * 0.75 + fx * 0.4, 0.35, lz * 0.75 + fz * 0.4).normalize();
      const leg = Math.random() < 0.5 ? PART.shinL : PART.shinR;
      v.hit(w.damage * k, leg, _d.x * f * 0.3, f * 0.2, _d.z * f * 0.3, u, 'melee');
      v.rag.impulse(leg, _d.x * f * 0.4, 0, _d.z * f * 0.4); // the legs go out from under it
      pushUnit(v, _d.x * f * 0.5, _d.y * f * 0.4, _d.z * f * 0.5);
      v.stun = Math.max(v.stun, w.trip * (v.def.stagger ?? 1));
      const c = v.rag.pos[leg];
      b.emit(v.def.armor > 0.3 ? 'spark' : 'blood', c.x, c.y, c.z, 7, _d.x, _d.z);
    });
    const tip = u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0, _v);
    b.sound(n ? 'slash' : 'whoosh', tip, n ? 1.1 : 0.7, 0.8);
    if (n >= 3 && Math.random() < 0.5) b.voice(u, 'cry', true);
  },
};

// Wheelbarrow: never stops; the barrow shoves whatever is in front of it along,
// knocks it over, and catches shots from the front.
const barrow = {
  melee: true,
  init(u) { u.bumped = new Map(); },
  think(u, dt, c) {
    const { t, gap, dirx, dirz, spd } = c;
    u.expr = gap < 6 ? EXPR.angry : EXPR.normal;
    u.desired.set(dirx * spd, 0, dirz * spd);
    return t;
  },
  step(u, dt) {
    if (u.stun > 0 || u.isDown()) return;
    const b = u.battle, w = u.def.weapon, h = u.heading, s = u.s;
    const fx = Math.sin(h), fz = Math.cos(h);
    const vel = u.rag.vel[PART.pelvis], along = vel.x * fx + vel.z * fz;
    const bx = u.pos.x + fx * 1.05 * s, bz = u.pos.z + fz * 1.05 * s, R = 0.75 * s;
    b.grid.query(bx, bz, R + 2, (v) => {
      if (!isFoe(u, v)) return;
      const dx = v.pos.x - bx, dz = v.pos.z - bz;
      if (Math.hypot(dx, dz) > R + v.skel.radius || v.pos.y - u.pos.y > 1.2 * s) return;
      // carry it along, faster than we walk (less for heavy things)
      const k = clamp(u.M * 1.6 / v.M, 0, 1);
      const vv = v.rag.vel[PART.pelvis], va = vv.x * fx + vv.z * fz;
      const dv = Math.max(0, Math.max(along, 1.5) + 2.2 - va) * k;
      if (dv > 0) pushUnit(v, fx * dv * v.M * 0.35, v.M * 0.6 * dt * 9.81 * k, fz * dv * v.M * 0.35);
      if (k < 0.5) u.rag.impulseAll(-fx * u.M * 0.6 * (1 - k), 0, -fz * u.M * 0.6 * (1 - k)); // a wall: it stalls
      const last = u.bumped.get(v);
      if (last !== undefined && b.time - last < w.cooldown) return;
      u.bumped.set(v, b.time);
      const f = Math.min(w.force, v.M * 10) * k * (u.buff > 0 ? 1.15 : 1);
      v.hit(w.damage * (u.buff > 0 ? 1.15 : 1), PART.thighL, fx * f * 0.3, f * 0.25, fz * f * 0.3, u, 'melee');
      pushUnit(v, fx * f * 0.5, f * 0.45, fz * f * 0.5);
      v.stun = Math.max(v.stun, w.knock * k * (v.def.stagger ?? 1));
      const c = v.rag.pos[PART.thighL];
      b.emit('dust', c.x, c.y - 0.2, c.z, 2);
      b.sound('thump', c, 0.9, 0.9);
      b.sound('crunch', c, 0.5, 1.2);
    });
  },
  hit(u, amount, part, attacker, kind) {
    if (!attacker || kind === 'blast' || kind === 'poison' || kind === 'burn' || kind === 'stomp' || kind === 'thorns') return amount;
    if (u.stun > 0 || u.isDown() || !inFront(u, attacker.pos.x, attacker.pos.z, 0.35)) return amount;
    if (kind === 'melee') return amount * (1 - u.def.weapon.guard * 0.5);
    const b = u.battle, c = u.chestPos, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    b.emit('spark', c.x + fx * 0.9 * u.s, c.y - 0.3 * u.s, c.z + fz * 0.9 * u.s, 4);
    b.sound('clang', c, 0.5, 1.5);
    return amount * (1 - u.def.weapon.guard);
  },
};

// Peasant: bold in a crowd (inspired), runs for it when left alone near an enemy.
const mob = {
  melee: true,
  init(u) { u.mobT = rand(0, 0.3); u.aloneT = rand(0, 3); },
  think: meleeThink,
  step(u, dt) {
    u.mobT -= dt; u.aloneT -= dt;
    if (u.mobT > 0) return;
    u.mobT = 0.3;
    const b = u.battle, w = u.def.weapon, p = u.pos;
    let n = 0;
    for (const o of b.teams[u.team]) if (o !== u && o.alive && (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < w.crowdR * w.crowdR) n++;
    if (n >= w.crowd) { u.buff = Math.max(u.buff, 0.4); if (!u.bold && Math.random() < 0.3) b.voice(u, 'cry', true); u.bold = true; return; }
    u.bold = false;
    const t = u.target;
    if (n === 0 && t && t.alive && u.aloneT <= 0 && u.fleeT <= 0 && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 5) {
      u.aloneT = rand(7, 10);
      u.fleeT = rand(1.4, 2.2);
      b.voice(u, 'scream', true);
    }
  },
};

// Barbarian: grabs the enemy in front and hurls it at the next one along.
const hurl = {
  melee: true,
  think: meleeThink,
  event(u, t0, t1) {
    const w = u.def.weapon;
    if (!crossed(t0, t1, w.grabAt)) return;
    const b = u.battle, p = u.pos, h = u.heading, R = u.reachDist + 0.5 * u.s;
    let v = null, bd = Infinity;
    b.grid.query(p.x, p.z, R + 2, (o) => {
      if (!isFoe(u, o) || o.bc || o.extras.length || o.M > u.M * w.maxMass) return;
      const dx = o.pos.x - p.x, dz = o.pos.z - p.z, d = Math.hypot(dx, dz) - o.skel.radius;
      if (d > R || !inFront(u, o.pos.x, o.pos.z, 0.2) || d >= bd) return;
      bd = d; v = o;
    });
    if (!v) return;
    if (v.kind?.parry && v.kind.parry(v, u, 'melee')) return;
    // throw it toward the nearest other enemy behind it (else straight on)
    let tx = v.pos.x + Math.sin(h) * 6, tz = v.pos.z + Math.cos(h) * 6, td = 144;
    for (const o of b.teams[v.team]) {
      if (o === v || !o.alive) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < td && d2 > 2 && dx * Math.sin(h) + dz * Math.cos(h) > 0) { td = d2; tx = o.pos.x; tz = o.pos.z; }
    }
    const dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.max(2, Math.hypot(dx, dz));
    const T = 0.55 + d * 0.03, vy = 9.81 * T / 2 + 1, vh = d / T;
    const v0 = v.rag.vel[PART.pelvis];
    v.hit(w.damage * (u.buff > 0 ? 1.15 : 1), PART.chest, 0, 0, 0, u, 'melee');
    v.rag.impulseAll(((dx / d) * vh - v0.x) * v.M, (vy - v0.y) * v.M, ((dz / d) * vh - v0.z) * v.M);
    v.stun = Math.max(v.stun, 2.0);
    S(b).thrown.push({ v, by: u, t: 0, hit: new Set([v]) });
    const c = v.chestPos;
    b.emit('dust', c.x, c.y, c.z, 2);
    b.sound('whoosh', c, 1.1, 0.7);
    b.voice(u, 'cry', true);
  },
};
function stepThrown(b, dt) {
  const list = S(b).thrown;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i], v = e.v, u = e.by, w = u.def.weapon;
    e.t += dt;
    const c = v.chestPos, vel = v.rag.vel[PART.chest], sp = Math.hypot(vel.x, vel.y, vel.z);
    if (e.t > 2 || (e.t > 0.3 && sp < 3)) { list.splice(i, 1); continue; }
    if (sp < 4) continue;
    b.grid.query(c.x, c.z, 3, (o) => {
      if (e.hit.has(o) || !o.alive || o.team !== v.team) return;
      const rr = o.skel.radius + v.skel.radius + 0.25;
      if ((o.chestPos.x - c.x) ** 2 + (o.chestPos.y - c.y) ** 2 + (o.chestPos.z - c.z) ** 2 > rr * rr * 1.4) return;
      e.hit.add(o);
      const f = Math.min(v.M * sp * 0.8, o.M * 12);
      _d.set(vel.x / sp, 0.4, vel.z / sp);
      o.hit(w.bowl, PART.chest, _d.x * f * 0.3, f * 0.2, _d.z * f * 0.3, u.alive ? u : null, 'melee');
      pushUnit(o, _d.x * f * 0.6, f * 0.35, _d.z * f * 0.6);
      o.stun = Math.max(o.stun, 1.3 * (o.def.stagger ?? 1));
      b.emit('dust', o.chestPos.x, o.chestPos.y, o.chestPos.z, 3);
      b.sound('thump', o.chestPos, 1.0, 0.8);
      b.sound('crunch', o.chestPos, 0.6, 1.0);
    });
  }
}

function stepTangled(b, dt) {
  const list = S(b).tangled;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i], v = e.v;
    e.t -= dt;
    if (e.t <= 0 || !v.alive) { e.m.t = 0; list.splice(i, 1); continue; }
    if (slowBeast(v, 0.2)) continue;
    if (v.airT > 0 || v.control) continue;
    const v0 = v.rag.vel[PART.pelvis];
    v.rag.impulseAll(-v0.x * v.M * 0.4, 0, -v0.z * v.M * 0.4);
  }
}

// ------------------------------------------------------------------ projectiles
// Stoner's stone: bounces on after landing; a hit on the head dazes.
function stoneHit(b, pr, v, part) {
  pr.hits.add(v);
  const dir = _d.copy(pr.vel).normalize();
  if (shieldBlocks(b, v, dir, 0.7)) { pr.vel.multiplyScalar(-0.2); return; }
  const head = part === PART.head;
  strike(b, v, pr.damage * (head ? 1.3 : 1), dir, pr.force, pr.owner, 'stone', part, 'thud');
  if (head && v.alive && !v.bc) {
    const t = pr.owner.def.weapon.daze * (v.def.stagger ?? 1);
    v.stun = Math.max(v.stun, t);
    mark(b, v, 'cl_dizzy', PART.head, t, new THREE.Vector3(0, v.skel.rHead * 1.35, 0));
    const h = v.headPos;
    b.emit('spark', h.x, h.y + 0.2, h.z, 5);
    b.sound('clang', h, 0.6, 2.2);
  }
  pr.life = -1;
}
const stone = {
  g: 9.81, len: 0, r: 0.1, life: 3,
  step(b, pr) {
    const h = sweepParts(b, pr, 0.1);
    if (h) stoneHit(b, pr, h.v, h.part);
  },
  hit(b, pr, v) { stoneHit(b, pr, v, PART.chest); return true; },
};

// Scarecrow's crow: flies slowly, steers after its target and pecks at the face.
function crowHit(b, pr, v) {
  pr.hits.add(v);
  const dir = _d.copy(pr.vel).normalize();
  strike(b, v, pr.damage, dir, pr.force, pr.owner, 'crow', PART.head, 'stab');
  scare(b, v, pr.owner.def.weapon.fear);
  b.sound('whoosh', v.headPos, 0.8, 2.4);
  pr.life = -1;
}
const crow = {
  g: 0, len: 0.3, r: 0.18, life: 5,
  step(b, pr, dt) {
    if (pr.tgt === undefined) pr.tgt = pr.owner.aimAt || null;
    if (!pr.snd) { pr.snd = true; b.sound('whoosh', pr.pos, 0.5, 1.9); }
    let t = pr.tgt;
    if (!t || !t.alive) {
      // the target died: go for whoever is nearest ahead
      t = null; let bd = 144;
      b.grid.query(pr.pos.x, pr.pos.z, 12, (v) => {
        if (!v.alive || v.team === pr.team) return;
        const d2 = v.headPos.distanceToSquared(pr.pos);
        if (d2 < bd) { bd = d2; t = v; }
      });
      pr.tgt = t;
    }
    const sp = pr.vel.length() || 1;
    if (t) {
      _v.copy(t.headPos).sub(pr.pos).normalize().multiplyScalar(sp);
      pr.vel.lerp(_v, clamp(dt * 3.2, 0, 1)).setLength(sp);
    }
    // a little flutter
    pr.vel.y += Math.sin((pr.life || 0) * 22) * 0.6;
    const h = sweepParts(b, pr, 0.18);
    if (h) crowHit(b, pr, h.v);
  },
  hit(b, pr, v) { crowHit(b, pr, v); return true; },
  ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 0.5); return true; },
};

// Poacher's bola: wraps round the legs.
function bolaHit(b, pr, v) {
  pr.hits.add(v);
  const dir = _d.copy(pr.vel).normalize();
  strike(b, v, pr.damage, dir, pr.force, pr.owner, 'bola', PART.thighL, 'thud');
  entangle(b, v, pr.owner.def.weapon.tangle);
  b.sound('whoosh', v.pos, 0.7, 1.4);
  pr.life = -1;
}
const bola = {
  g: 9.81, len: 0, r: 0.25, life: 4,
  step(b, pr) {
    const h = sweepParts(b, pr, 0.25);
    if (h) bolaHit(b, pr, h.v);
  },
  hit(b, pr, v) { bolaHit(b, pr, v); return true; },
  ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 1); return true; },
};

// ------------------------------------------------------------------ units
const units = [
  // ---------------- Tribal
  {
    id: 'tb_stoner', name: 'Stoner', faction: 'tribal', cost: 105, hp: 90, speed: 4.4,
    build: { scale: 0.96, girth: 1.12, head: 1.05 },
    weapon: { line: 'Ranged · cheap stones · a head hit dazes', kind: 'ranged', style: 'throw', anim: 'throw', item: 'cl_stone_hand', proj: 'cl_stone', speed: 17, arc: 'low', range: 20, minRange: 5, cooldown: 3.0, damage: 24, force: 260, spread: 0.05, releaseAt: 0.7, windup: 0.8, daze: 1.8 },
    look: { skin: '#e2ae84', hat: 'cl_tuft', top: 'loincloth', legs: '#6b4a2b', bare: true, paint: true },
    personality: { aggro: 0.45, bravery: 0.25, voice: 1.1, chatter: 0.8, cry: 'ooga', idle: 'bounce' },
    desc: 'Chucks rocks. Aims for the head.',
  },
  {
    id: 'tb_bone_mage', name: 'Bone Mage', faction: 'tribal', cost: 300, hp: 120, speed: 3.8,
    build: { scale: 0.98, girth: 0.95, head: 1.05 },
    weapon: { line: 'Magic · bone spikes burst from the ground and toss enemies', kind: 'cl_bonemage', style: 'staff', anim: 'cast', item: 'cl_bonestaff', range: 28, minRange: 6, cooldown: 4.2, windup: 1.1, releaseAt: 0.6, delay: 0.75, damage: 60, force: 700, blast: 2.5, spread: 0.04 },
    look: { skin: '#d9a173', hat: 'cl_bonemask', top: 'fur', legs: '#4a321c', bare: true, paint: true },
    personality: { aggro: 0.3, bravery: 0.3, voice: 0.8, chatter: 0.6, cry: 'magic', idle: 'pray' },
    desc: 'A ring of runes, then the ground grows teeth.',
  },
  // ---------------- Farmer
  {
    id: 'fm_scarecrow', name: 'Scarecrow', faction: 'farmer', cost: 105, hp: 110, speed: 3.9,
    build: { scale: 1.02, girth: 0.9, head: 1.1, arms: 1.1 },
    weapon: { line: 'Ranged · homing crows make their target panic and run', kind: 'ranged', style: 'throw', anim: 'throw', item: 'cl_crow_hand', proj: 'cl_crow', speed: 10, arc: 'low', range: 24, minRange: 5, cooldown: 3.6, damage: 10, force: 40, spread: 0.08, releaseAt: 0.7, windup: 0.8, fear: 3.0 },
    look: { skin: '#d8c49a', hat: 'cl_scare', top: 'cl_scare', legs: '#5a5038' },
    personality: { aggro: 0.35, bravery: 0, voice: 0.7, chatter: 0.4, cry: 'cackle', idle: 'shake' },
    desc: 'Its crows chase enemies off. Nobody likes crows.',
  },
  {
    id: 'fm_harvester', name: 'Harvester', faction: 'farmer', cost: 200, hp: 170, speed: 4.2,
    build: { scale: 1.06, girth: 1.12 },
    weapon: { line: 'Melee · scythe sweeps a wide arc and trips everyone in it', kind: 'cl_reap', style: 'twohand', anim: 'cl_reap', item: 'cl_scythe', damage: 34, reach: 2.2, arc: 1.25, maxHits: 6, trip: 0.9, cooldown: 1.7, force: 380 },
    look: { skin: '#eebf94', hat: 'cl_sunhat', top: 'overalls', legs: '#6a5a3a' },
    personality: { aggro: 0.9, bravery: 0.15, voice: 0.85, chatter: 0.5, cry: 'hey', idle: 'lean' },
    desc: 'Mows down a whole row with each swing.',
  },
  {
    id: 'fm_wheelbarrow', name: 'Wheelbarrow', faction: 'farmer', cost: 320, hp: 210, speed: 4.4,
    build: { scale: 1.04, girth: 1.18, mass: 1.35 },
    weapon: { line: 'Ram · shoves through the line, barrow blocks shots from the front', kind: 'cl_barrow', style: 'cl_barrow', anim: 'punch', item: 'none', damage: 20, cooldown: 0.9, force: 520, knock: 0.6, guard: 0.6, reach: 1.0 },
    look: { skin: '#f0c49a', hat: 'cap', top: 'overalls', legs: '#7d6040' },
    personality: { aggro: 1, bravery: 0, voice: 0.9, chatter: 0.7, cry: 'hey', idle: 'lean' },
    stagger: 0.6,
    desc: 'Coming through! Mind your toes.',
  },
  // ---------------- Legacy
  {
    id: 'lg_peasant', name: 'Peasant', faction: 'legacy', cost: 30, hp: 55, speed: 4.6,
    build: { scale: 0.94, girth: 1.0, head: 1.05 },
    weapon: { line: 'Melee · cheap · bold in a crowd, runs when alone', kind: 'cl_mob', style: 'sword', anim: 'overhead', item: 'cl_pan', damage: 15, reach: 1.1, cooldown: 0.95, force: 140, crowd: 3, crowdR: 3.5 },
    look: { skin: '#f2c8a0', hat: 'cl_coif', top: 'tunic', legs: '#7a6a50' },
    personality: { aggro: 0.9, bravery: 0.3, voice: 1.2, chatter: 1, cry: 'yip', idle: 'shift' },
    desc: 'Brave with friends around. Very brave. Mostly.',
  },
  {
    id: 'lg_poacher', name: 'Poacher', faction: 'legacy', cost: 120, hp: 90, speed: 4.5,
    build: { scale: 0.97, girth: 0.98 },
    weapon: { line: 'Ranged · bolas tangle the legs, runners trip', kind: 'ranged', style: 'throw', anim: 'throw', item: 'cl_bola_hand', proj: 'cl_bola', speed: 16, arc: 'low', range: 22, minRange: 5, cooldown: 3.4, damage: 14, force: 80, spread: 0.05, releaseAt: 0.7, windup: 0.8, tangle: 3.2 },
    look: { skin: '#e8bc94', hat: 'cl_poacher', top: 'cl_coat', legs: '#4e4a32', beard: '#6a4a2a' },
    personality: { aggro: 0.35, bravery: 0.3, voice: 0.95, chatter: 0.6, cry: 'hey', idle: 'shift' },
    desc: 'Ties up anything with legs. Big game preferred.',
  },
  {
    id: 'lg_barbarian', name: 'Barbarian', faction: 'legacy', cost: 280, hp: 400, speed: 4.8,
    build: { scale: 1.25, girth: 1.2, head: 1.0, arms: 1.15, armThick: 1.3, mass: 1.3 },
    weapon: { line: 'Melee · grabs enemies and hurls them into their friends', kind: 'cl_hurl', style: 'fists', anim: 'slam', item: 'none', damage: 34, bowl: 30, grabAt: 0.48, maxMass: 1.7, reach: 1.3, cooldown: 1.7, force: 420, fistHit: true },
    look: { skin: '#e8b48a', hat: 'cl_mane', top: 'fur', legs: '#4a3a2a', bare: true, beard: '#3a2a1a', paint: true },
    personality: { aggro: 1, bravery: 0, voice: 0.6, chatter: 0.8, cry: 'roar', idle: 'thump' },
    stagger: 0.4,
    desc: 'Picks people up and throws them at other people.',
  },
];

// ------------------------------------------------------------------ visuals
const BONE = '#efe6cf', STRAW = '#e2c45c', CROW = '#26222a';

function crowMesh(H, g, k, x, y, z, ry = 0) {
  const { mesh, sphere, cone, box, mat } = H;
  const blk = mat(CROW, { spec: 0.3 });
  const G = new THREE.Group(); G.position.set(x, y, z); G.rotation.y = ry; g.add(G);
  mesh(sphere(0.07 * k, 8, 6), blk, 0, 0, 0, G).scale.set(0.8, 0.8, 1.4);
  mesh(sphere(0.045 * k, 8, 6), blk, 0, 0.04 * k, 0.09 * k, G);
  mesh(cone(0.018 * k, 0.06 * k, 4), mat('#e8b030'), 0, 0.035 * k, 0.15 * k, G).rotation.x = Math.PI / 2;
  for (const sd of [-1, 1]) { const wg = mesh(box(0.13 * k, 0.012 * k, 0.07 * k), blk, sd * 0.09 * k, 0.02 * k, 0, G); wg.rotation.z = sd * 0.35; }
  mesh(box(0.05 * k, 0.01 * k, 0.07 * k), blk, 0, 0, -0.11 * k, G);
  return G;
}

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, wood, darkWood, leather, glow } = H;
  switch (name) {
    case 'cl_stone_hand':
      mesh(sphere(0.1 * s, 8, 6), mat('#8a8478'), 0, 0, 0.1 * s, g).scale.set(1, 0.8, 0.9);
      return true;
    case 'cl_bonestaff': { // a long bone with a horned skull on top, feathers
      const L = 1.6 * s, bone = mat(BONE, { spec: 0.2 });
      mesh(cyl(0.028 * s, 0.032 * s, L, 7), mat('#8a6a48'), 0, 0, 0, g);
      for (const y of [-0.3, 0.3]) mesh(sphere(0.045 * s, 8, 6), bone, 0, y * L, 0, g);
      const sk = mesh(sphere(0.11 * s, 10, 8), bone, 0, L * 0.5 + 0.08 * s, 0.02 * s, g); sk.scale.set(0.9, 1, 1.1);
      mesh(box(0.12 * s, 0.05 * s, 0.1 * s), bone, 0, L * 0.5 - 0.01 * s, 0.07 * s, g);
      for (const sd of [-1, 1]) {
        mesh(sphere(0.03 * s, 6, 5), glow('#9cff7a'), sd * 0.045 * s, L * 0.5 + 0.09 * s, 0.11 * s, g);
        const hn = mesh(cone(0.025 * s, 0.16 * s, 5), bone, sd * 0.1 * s, L * 0.5 + 0.17 * s, 0, g); hn.rotation.z = -sd * 0.6;
      }
      for (const [c, a] of [['#c84a2a', 0.4], ['#e8d040', -0.3], [H.TEAM_COLORS[team], 0]]) {
        const f = mesh(box(0.012 * s, 0.2 * s, 0.05 * s), mat(c), 0.03 * s * Math.sign(a), L * 0.38, -0.05 * s, g); f.rotation.z = a;
      }
      return true;
    }
    case 'cl_crow_hand': crowMesh(H, g, 1.1 * s, 0, 0.02 * s, 0.1 * s); return true;
    case 'cl_scythe': { // long snath, two grips, a curved blade at the top
      const L = 1.9 * s;
      mesh(cyl(0.025 * s, 0.03 * s, L, 7), wood(), 0, L * 0.5 - 0.15 * s, 0, g);
      mesh(cyl(0.02 * s, 0.02 * s, 0.18 * s, 6), darkWood(), 0, L * 0.4, 0.08 * s, g).rotation.x = Math.PI / 2;
      const B = new THREE.Group(); B.position.set(0, L * 0.85 - 0.15 * s, 0); g.add(B);
      const steel = mat('#b8c0c8', { spec: 1 });
      const bl = mesh(tube(H, 'clscy' + s.toFixed(3), [[0, 0, 0.03], [0, -0.03, 0.28], [0, -0.12, 0.55], [0, -0.3, 0.78]].map((p) => p.map((q) => q * s)), 0.06 * s, 0.008 * s, 12), steel, 0, 0, 0, B);
      bl.scale.x = 0.22;
      mesh(box(0.03 * s, 0.06 * s, 0.06 * s), metal(), 0, 0, 0.02 * s, B);
      mesh(cyl(0.032 * s, 0.032 * s, 0.05 * s, 7), tcol(H, team), 0, L * 0.1, 0, g);
      return true;
    }
    case 'cl_pan': { // a frying pan: handle along +Y, the flat faces forward
      mesh(cyl(0.02 * s, 0.024 * s, 0.42 * s, 7), darkWood(), 0, 0.18 * s, 0, g);
      const pan = mesh(cyl(0.17 * s, 0.15 * s, 0.05 * s, 16), mat('#3a3a40', { spec: 0.7 }), 0, 0.55 * s, 0, g);
      pan.rotation.x = Math.PI / 2;
      const in2 = mesh(cyl(0.14 * s, 0.14 * s, 0.052 * s, 16), mat('#55555c', { spec: 0.9 }), 0, 0.55 * s, 0.003 * s, g);
      in2.rotation.x = Math.PI / 2;
      return true;
    }
    case 'cl_bola_hand': {
      const cord = mat('#c8a46a');
      for (const [x, y] of [[0.06, -0.12], [-0.06, -0.14], [0, 0.16]]) {
        mesh(sphere(0.055 * s, 8, 6), mat('#6b4426', { spec: 0.3 }), x * s, y * s, 0.1 * s, g);
        const c = mesh(cyl(0.006 * s, 0.006 * s, Math.hypot(x, y) * s, 3), cord, x * s / 2, y * s / 2, 0.1 * s, g);
        c.rotation.z = Math.atan2(-x, y);
      }
      return true;
    }
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'cl_tuft': { // a topknot of wild hair tied with a team band, a bone through it
      const hair = mat('#3a2616', { spec: 0.05 });
      mesh(dome(H, r * 1.04, 0.42), hair, 0, r * 0.18, -r * 0.05, g);
      mesh(sphere(r * 0.42, 10, 8), hair, 0, r * 1.2, -r * 0.1, g).scale.set(1, 1.2, 1);
      mesh(cyl(r * 0.3, r * 0.32, r * 0.18, 10), tc, 0, r * 0.95, -r * 0.08, g);
      mesh(cyl(r * 0.06, r * 0.06, r * 1.1, 6), mat(BONE), 0, r * 1.25, -r * 0.1, g).rotation.z = Math.PI / 2;
      return true;
    }
    case 'cl_bonemask': { // a skull mask with glowing eyes and a crest of feathers
      const bone = mat(BONE, { spec: 0.2 });
      mesh(sphere(r * 1.06, 16, 12), bone, 0, r * 0.12, r * 0.04, g).scale.set(1, 1.02, 1.04);
      for (const sd of [-1, 1]) {
        mesh(sphere(r * 0.24, 10, 8), mat('#1e1512'), sd * r * 0.38, r * 0.22, r * 0.86, g).scale.set(1, 0.9, 0.45);
        mesh(sphere(r * 0.09, 6, 5), glow('#9cff7a'), sd * r * 0.38, r * 0.22, r * 0.96, g);
        const hn = mesh(tube(H, 'clbh' + sd + r.toFixed(3), [[sd * 0.75, 0.75, 0], [sd * 1.2, 1.05, -0.1], [sd * 1.35, 1.55, 0.05]].map((p) => p.map((q) => q * r)), r * 0.18, r * 0.03), bone, 0, 0, 0, g);
        void hn;
      }
      mesh(cone(r * 0.12, r * 0.2, 3), mat('#1e1512'), 0, -r * 0.08, r * 1.02, g).rotation.x = Math.PI;
      for (let i = 0; i < 5; i++) mesh(box(r * 0.1, r * 0.14, r * 0.05), bone, (i - 2) * r * 0.15, -r * 0.48, r * 0.9, g);
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32, f = mesh(box(r * 0.08, r * 0.8, r * 0.25), mat(i % 2 ? '#c84a2a' : H.TEAM_COLORS[team]), Math.sin(a) * r * 0.5, r * 1.35, -r * 0.35 + Math.cos(a) * r * 0.1, g);
        f.rotation.z = -a; f.rotation.x = -0.3;
      }
      g.userData.hidesFace = true;
      return true;
    }
    case 'cl_scare': { // a stitched sack head under a battered straw hat
      const sack = mat('#c8b07a', { spec: 0 }), straw = mat(STRAW, { spec: 0 }), stitch = mat('#3a2a1a');
      mesh(sphere(r * 1.04, 14, 10), sack, 0, 0, 0, g);
      for (const sd of [-1, 1]) {
        for (const a of [0.7, -0.7]) { const x = mesh(box(r * 0.3, r * 0.06, r * 0.04), stitch, sd * r * 0.35, r * 0.18, r * 0.98, g); x.rotation.z = a; }
      }
      for (let i = 0; i < 5; i++) { const m2 = mesh(box(r * 0.04, r * 0.18, r * 0.04), stitch, (i - 2) * r * 0.14, -r * 0.35 - Math.abs(i - 2) * r * -0.04, r * 0.95, g); m2.rotation.z = (i - 2) * 0.1; }
      mesh(box(r * 0.75, r * 0.04, r * 0.04), stitch, 0, -r * 0.33, r * 0.97, g);
      mesh(cyl(r * 1.6, r * 1.7, r * 0.06, 18), straw, 0, r * 0.62, 0, g).rotation.x = 0.12;
      mesh(cyl(r * 0.7, r * 0.85, r * 0.6, 14), straw, 0, r * 0.95, 0, g).rotation.z = 0.15;
      mesh(cyl(r * 0.86, r * 0.86, r * 0.12, 14), tc, 0, r * 0.72, 0, g);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const s2 = mesh(box(r * 0.03, r * 0.35, r * 0.03), straw, Math.sin(a) * r * 0.95, -r * 0.85, Math.cos(a) * r * 0.85, g); s2.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }
      g.userData.hidesFace = true;
      return true;
    }
    case 'cl_sunhat': { // wide floppy sun hat with a team band, and a neckerchief
      const straw = mat('#d8b870', { spec: 0 });
      mesh(cyl(r * 1.85, r * 1.95, r * 0.05, 20), straw, 0, r * 0.62, -r * 0.05, g).rotation.x = -0.08;
      mesh(dome(H, r * 0.92, 0.5), straw, 0, r * 0.64, -r * 0.05, g).scale.set(1, 0.85, 1);
      mesh(cyl(r * 0.94, r * 0.94, r * 0.14, 16), tc, 0, r * 0.7, -r * 0.05, g);
      mesh(sphere(r * 0.15, 6, 5), mat('#e05040'), r * 0.85, r * 0.75, r * 0.2, g);
      return true;
    }
    case 'cl_coif': { // a simple cloth coif tied under the chin, a straw stalk
      const cloth = mat('#d8ccb0', { spec: 0 });
      mesh(hoodGeo(H, r, 1.07, 1.15), cloth, 0, r * 0.05, -r * 0.03, g);
      headBand(H, r, 0.58, 0.12, td, g, 0.09);
      mesh(cyl(r * 0.025, r * 0.025, r * 0.8, 4), mat(STRAW), r * 0.3, -r * 0.55, r * 1.25, g).rotation.set(Math.PI / 2 - 0.3, 0, 0.4);
      return true;
    }
    case 'cl_poacher': { // a deerstalker with ear flaps and a feather
      const tw = mat('#7a6a48', { spec: 0 }), dk = mat('#5a4c32');
      mesh(dome(H, r * 1.07, 0.5), tw, 0, r * 0.38, 0, g).scale.set(1, 0.95, 1);
      for (const sd of [-1, 1]) { const bb = mesh(cyl(r * 0.6, r * 0.6, r * 0.05, 12, 1), tw, 0, r * 0.42, sd * r * 1.0, g); bb.scale.set(1, 1, 0.6); }
      for (const sd of [-1, 1]) { const ef = mesh(box(r * 0.08, r * 0.45, r * 0.5), dk, sd * r * 1.0, r * 0.15, 0, g); ef.rotation.z = sd * 0.2; }
      mesh(cyl(r * 1.08, r * 1.08, r * 0.1, 16), tc, 0, r * 0.45, 0, g);
      const f = mesh(box(r * 0.04, r * 0.7, r * 0.18), mat('#8a3a2a'), r * 0.85, r * 0.9, -r * 0.3, g); f.rotation.z = -0.5;
      return true;
    }
    case 'cl_mane': { // a great shaggy mane and a horned band
      const hair = mat('#3a2a1a', { spec: 0.05 });
      mesh(sphere(r * 1.1, 14, 10), hair, 0, r * 0.25, -r * 0.25, g).scale.set(1.1, 1.0, 1.0);
      for (let i = 0; i < 11; i++) { const a = Math.PI + (i / 10 - 0.5) * 3.6; mesh(sphere(r * 0.34, 8, 6), hair, Math.sin(a) * r * 1.0, -r * 0.2 - (i % 3) * r * 0.15, Math.cos(a) * r * 0.85, g); }
      headBand(H, r, 0.5, 0.18, leather(), g, 0.14);
      for (const sd of [-1, 1]) mesh(tube(H, 'clmh' + sd + r.toFixed(3), [[sd * 0.9, 0.55, 0.1], [sd * 1.45, 0.75, 0.05], [sd * 1.6, 1.3, 0.1]].map((p) => p.map((q) => q * r)), r * 0.2, r * 0.03), mat(BONE), 0, 0, 0, g);
      mesh(sphere(r * 0.16, 8, 6), tc, 0, r * 0.62, r * 1.02, g);
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'tribal' && def.faction !== 'farmer' && def.faction !== 'legacy') return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, leather, wood, darkWood, metal } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  const pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  if (top === 'cl_scare') { // patched shirt stuffed with straw, a pole across the shoulders
    const straw = mat(STRAW, { spec: 0 });
    chestShell(H, ch, mat('#7a8a5a', { spec: 0 }), C);
    mesh(box(r * 0.7, r * 0.7, r * 0.05), tc, r * 0.35, hh * 0.2, r * 1.08, C).rotation.z = 0.2;
    mesh(box(r * 0.5, r * 0.5, r * 0.05), mat('#a0603a'), -r * 0.4, -hh * 0.4, r * 1.06, C).rotation.z = -0.3;
    mesh(cyl(r * 0.1, r * 0.1, r * 4.2, 6), wood(), 0, hh + r * 0.2, -r * 0.6, C).rotation.z = Math.PI / 2;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const s2 = mesh(box(r * 0.05, r * 0.4, r * 0.05), straw, Math.sin(a) * r * 1.05, -hh - r * 0.5, Math.cos(a) * r * 1.0, C); s2.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4); }
    for (const p of [PART.farmL, PART.farmR]) for (let k = 0; k < 4; k++) { const s2 = mesh(box(skel.parts[p].r * 0.3, skel.parts[p].r * 2.2, skel.parts[p].r * 0.3), straw, (k - 1.5) * skel.parts[p].r * 0.5, -skel.parts[p].hh - skel.parts[p].r * 1.2, 0, parts[p]); s2.rotation.z = (k - 1.5) * 0.3; }
  }
  if (top === 'cl_coat') { // a long waxed coat with a cartridge strap of bolas
    const coat = mat('#5a5a3a', { spec: 0.25 });
    chestShell(H, ch, coat, C);
    const sk = mesh(cyl(pel.r * 1.2, pel.r * 1.5, pel.r * 2.0, 14), coat, 0, -pel.r * 0.7, -pel.r * 0.1, P); sk.scale.set(1, 1, 0.9);
    const st = mesh(box(r * 0.25, (hh + r) * 2.3, r * 0.06), leather(), 0, 0, r * 1.02, C); st.rotation.z = 0.6;
    for (let k = 0; k < 3; k++) mesh(sphere(r * 0.13, 8, 6), mat('#6b4426'), -r * 0.4 + k * r * 0.35, hh * 0.5 - k * r * 0.3, r * 1.1, C);
    mesh(box(r * 0.55, r * 0.6, r * 0.05), tc, -r * 0.45, -hh * 0.1, r * 1.04, C); // a patch pocket
  }
  if (def.id === 'tb_stoner') { // a pouch of stones on the belt
    mesh(sphere(pel.r * 0.45, 8, 6), leather(), pel.r * 0.95, -pel.r * 0.2, pel.r * 0.3, P).scale.set(1, 1.1, 0.8);
    for (let k = 0; k < 3; k++) mesh(sphere(pel.r * 0.16, 6, 5), mat('#8a8478'), pel.r * (0.85 + k * 0.12), pel.r * 0.2, pel.r * (0.25 + (k % 2) * 0.15), P);
  }
  if (def.id === 'tb_bone_mage') { // a necklace of bones and teeth
    for (let k = -4; k <= 4; k++) { const a = k * 0.26; const t = mesh(cone(r * 0.06, r * 0.22, 4), mat(BONE), Math.sin(a) * r * 0.85, hh + r * 0.25 - Math.abs(k) * r * 0.05, Math.cos(a) * r * 0.82, C); t.rotation.x = Math.PI; }
  }
  if (def.id === 'fm_harvester') { // a sheaf of wheat tucked in the overalls
    for (let k = 0; k < 5; k++) { const s2 = mesh(cyl(r * 0.025, r * 0.025, r * 1.6, 4), mat(STRAW), -r * 0.6 + k * r * 0.05, hh + r * 0.3, -r * 0.9, C); s2.rotation.z = (k - 2) * 0.12; mesh(sphere(r * 0.08, 6, 5), mat('#c8a040'), -r * 0.6 + k * r * 0.05 - (k - 2) * 0.1 * r, hh + r * 1.1, -r * 0.9, C).scale.set(0.7, 1.6, 0.7); }
  }
  if (def.id === 'fm_wheelbarrow') { // the barrow, carried in front at the hips
    const B = new THREE.Group();
    B.position.set(0, -pel.r * 0.5, pel.r * 2.6);
    P.add(B);
    const tub = mat('#7a8a96', { spec: 0.6 }), rim = mat('#5a646e', { spec: 0.6 });
    const L = pel.r * 3.2, W = pel.r * 2.4, D = pel.r * 1.2;
    mesh(box(W, D * 0.18, L), tub, 0, -D * 0.4, 0, B);
    for (const sd of [-1, 1]) { const sw = mesh(box(D * 0.12, D, L), tub, sd * W * 0.5, 0, 0, B); sw.rotation.z = -sd * 0.25; }
    mesh(box(W * 1.2, D, D * 0.12), tc, 0, 0, L * 0.5, B).rotation.x = 0.35;
    mesh(box(W * 0.9, D * 0.8, D * 0.1), tub, 0, -D * 0.05, -L * 0.5, B);
    mesh(box(W * 1.25, D * 0.1, L * 1.0), rim, 0, D * 0.5, 0, B).scale.set(1, 1, 1);
    for (const sd of [-1, 1]) mesh(box(D * 0.12, D * 0.12, L * 1.5), darkWood(), sd * W * 0.42, -D * 0.5, -L * 0.15, B); // handles back to the hands
    const wh = mesh(torus(H, D * 0.55, D * 0.16, Math.PI * 2, 14), mat('#2a2a2a'), 0, -D * 0.95, L * 0.42, B); wh.rotation.y = Math.PI / 2;
    mesh(cyl(D * 0.15, D * 0.15, W * 0.35, 8), metal(), 0, -D * 0.95, L * 0.42, B).rotation.z = Math.PI / 2;
    for (let k = 0; k < 4; k++) mesh(sphere(D * 0.28, 8, 6), mat(k % 2 ? '#c8302a' : '#7ab83a'), (k - 1.5) * W * 0.2, D * 0.05, (k % 2 - 0.5) * L * 0.3, B); // a load of apples and cabbages
  }
  if (def.id === 'lg_barbarian') { // spiked arm rings and a big belt
    for (const p of [PART.farmL, PART.farmR]) {
      const sp = skel.parts[p];
      mesh(cyl(sp.r * 1.25, sp.r * 1.25, sp.hh * 0.7, 10), leather(), 0, -sp.hh * 0.2, 0, parts[p]);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; const s2 = mesh(cone(sp.r * 0.22, sp.r * 0.6, 4), metal(), Math.sin(a) * sp.r * 1.3, -sp.hh * 0.2, Math.cos(a) * sp.r * 1.3, parts[p]); s2.rotation.set(Math.cos(a) * Math.PI / 2, 0, -Math.sin(a) * Math.PI / 2); }
    }
    mesh(cyl(r * 1.15, r * 1.17, r * 0.4, 16), leather(), 0, -hh - r * 0.35, 0, C);
    mesh(cyl(r * 0.35, r * 0.35, r * 0.12, 12), gold(), 0, -hh - r * 0.35, r * 1.1, C).rotation.x = Math.PI / 2;
  }
  if (def.id === 'lg_peasant') { // a patched apron
    mesh(box(r * 1.2, (hh + r) * 1.4, r * 0.05), mat('#c8b890', { spec: 0 }), 0, -hh * 0.3, r * 1.02, C);
    mesh(box(r * 0.4, r * 0.4, r * 0.06), td, r * 0.25, -hh * 0.6, r * 1.06, C);
  }
}

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, octa, mat, glow } = H;
  switch (type) {
    case 'cl_stone':
      mesh(sphere(0.11, 7, 5), mat('#8a8478'), 0, 0, 0, g).scale.set(1, 0.8, 0.9);
      return true;
    case 'cl_crow': {
      const G = crowMesh(H, g, 1.6, 0, 0, 0);
      G.rotation.x = -Math.PI / 2; // body along +Y (the flight direction)
      return true;
    }
    case 'cl_bola': {
      const cord = mat('#c8a46a');
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        mesh(sphere(0.07, 8, 6), mat('#6b4426'), Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, g);
        const c = mesh(cyl(0.008, 0.008, 0.3, 3), cord, Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15, g);
        c.rotation.set(0, -a, Math.PI / 2);
      }
      return true;
    }
    case 'cl_tangle': { // cords wound round the knees, a ball hanging off
      const cord = mat('#c8a46a');
      for (let i = 0; i < 3; i++) { const t = mesh(torus(H, 0.3 - i * 0.02, 0.022, Math.PI * 2, 14), cord, 0, i * 0.08, 0, g); t.rotation.x = Math.PI / 2 + (i - 1) * 0.15; t.scale.set(1, 0.7, 1); t.castShadow = false; }
      for (const [x, z] of [[0.28, 0.1], [-0.2, -0.22]]) mesh(sphere(0.07, 8, 6), mat('#6b4426'), x, -0.12, z, g).castShadow = false;
      return true;
    }
    case 'cl_dizzy': { // stars circling over the head
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const o = mesh(octa(0.06), glow('#ffe14a'), Math.cos(a) * 0.25, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.25, g); o.castShadow = false; }
      return true;
    }
    case 'cl_crows': { // crows flapping round the head
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; crowMesh(H, g, 1.2, Math.cos(a) * 0.35, (i - 1) * 0.08, Math.sin(a) * 0.35, -a); }
      return true;
    }
    case 'cl_bonering': { // the telegraph: a ring of glowing runes on the ground
      const gl = mat('#9cff7a', { emit: 0.9, transparent: true, opacity: 0.7 });
      const t = mesh(torus(H, 2.3, 0.05, Math.PI * 2, 32), gl, 0, 0.02, 0, g); t.rotation.x = Math.PI / 2; t.castShadow = false;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const o = mesh(box(0.18, 0.02, 0.06), gl, Math.cos(a) * 1.9, 0.02, Math.sin(a) * 1.9, g); o.rotation.y = -a; o.castShadow = false; }
      return true;
    }
    case 'cl_spikes': { // bone spikes bursting out of the ground
      const bone = mat(BONE, { spec: 0.25 });
      for (let i = 0; i < 13; i++) {
        const a = i * 2.4, d = i === 0 ? 0 : 0.55 + (i % 3) * 0.6, hgt = i === 0 ? 1.6 : 1.3 - (i % 3) * 0.3;
        const o = mesh(cone(0.11 + (i % 2) * 0.04, hgt, 5), bone, Math.cos(a) * d, hgt * 0.4, Math.sin(a) * d, g);
        o.rotation.set(Math.sin(a) * d * 0.25, 0, -Math.cos(a) * d * 0.25);
      }
      for (let i = 0; i < 6; i++) { const a = i * 1.05; mesh(sphere(0.12, 6, 5), mat('#7a6a50'), Math.cos(a) * 1.0, 0.02, Math.sin(a) * 1.0, g).scale.set(1.4, 0.4, 1.4); }
      return true;
    }
  }
  return false;
}

register({
  units,
  items: {
    cl_stone_hand: { len: 0, r: 0, grip: 90 },
    cl_bonestaff: { len: 1.6, r: 0.05, grip: 0, center: true, mass: 1.4 },
    cl_crow_hand: { len: 0, r: 0, grip: 90 },
    cl_scythe: { len: 1.9, r: 0.1, grip: 30, mass: 3.0, back: 0.08 },
    cl_pan: { len: 0.72, r: 0.15, grip: 30, mass: 1.4, metal: true },
    cl_bola_hand: { len: 0, r: 0, grip: 90 },
  },
  kinds: { cl_bonemage: boneMage, cl_reap: reap, cl_barrow: barrow, cl_mob: mob, cl_hurl: hurl },
  proj: {
    cl_stone: stone, cl_crow: crow, cl_bola: bola,
    // markers
    cl_tangle: { g: 0, len: 0, r: 0, life: 1 },
    cl_dizzy: { g: 0, len: 0, r: 0, life: 1 },
    cl_crows: { g: 0, len: 0, r: 0, life: 1 },
    cl_bonering: { g: 0, len: 0, r: 0, life: 1 },
    cl_spikes: { g: 0, len: 0, r: 0, life: 1 },
  },
  buildItem, buildHat, decorate, buildProj,
  battleStep(b, dt) {
    const s = STATE.get(b);
    if (!s) return;
    if (s.thrown.length) stepThrown(b, dt);
    if (s.tangled.length) stepTangled(b, dt);
  },
});
