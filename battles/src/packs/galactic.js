// Galactic: a space-opera faction (all names and designs original).
//  - Battle Droid: a cheap, skinny tin robot with a weak blaster; falls apart.
//  - Blaster Trooper: white plastic armour, a blaster rifle that sprays glowing bolts
//    in bursts (and famously misses a lot).
//  - Laser Knight: a robed knight with a glowing energy sword: fast swings, catches
//    blows, deflects blaster bolts back at the shooter and knocks arrows aside.
//  - Space Furball: a huge hairy giant with a crossbow-blaster; swats anyone who gets
//    close and roars into a rage when hurt.
//  - Jetpack Hunter: armoured bounty hunter; jetpack hops over the line and hovers,
//    blaster pistol and wrist rockets.
//  - Dark Lord: black armour and cape, a red energy sword; a force push that throws
//    a crowd back and a force choke that lifts one enemy off the ground.
//  - Walker: a four-legged walker mech with twin heavy cannons (a bc-core.js beast:
//    one rigid hull with kinematic legs and head, the pilot ragdoll hidden inside).
// Everything drawn is a projectile, a stuck entry or an fx event, so replays show it.
import { register, EXT } from '../ext.js';
import { aimTarget } from '../skills.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, inFront, aimPoint, launchVel,
  addProjectile, sweepParts, strike, shieldBlocks, newId, blast, torus, tube, tcol, tdark, chestShell, hoodGeo,
} from './common.js';
import {
  V, V3, Q4, beastLayout, beastInit, beastUnitStep, beastHit, beastDie, setRot, partPoint, footfalls,
  nearestEnemy, trampleBeast, onFoot, small, carry, trackFall, fling, quake, inField, yawOf, angleDiff,
  S, hurtBig, shoveBig, closestOnSeg,
} from './bc-core.js';
import { setArm } from './sm-core.js';
import { FIELD } from '../world.js';

const PI = Math.PI;
const _o = new V3(), _p = new V3(), _v = new V3(), _d = new V3(), _a = new V3(), _b = new V3();
const handAt = (u, part, out, extra = 0) => u.rag.worldPoint(part, 0, -u.skel.handOffset - extra, 0, out);

// ------------------------------------------------------------------ bolts
// Blaster bolts fly straight (no gravity) and glow in the shooter's team colour:
// cyan for Blue, red for Red. Heavy bolts (Furball, Walker) are bigger and may burst.
const boltType = (team, heavy) => (heavy ? 'ga_heavy' : 'ga_bolt') + (team ? 1 : 0);
const isBolt = (type) => typeof type === 'string' && type.startsWith('ga_bolt');

// Fire one bolt (or a few pellets) from `from` toward the aim point.
function boltFrom(u, from, to, w, heavy = !!w.heavy) {
  const b = u.battle;
  for (let i = 0; i < (w.pellets || 1); i++) {
    launchVel(from, to, w.speed * rand(0.97, 1.03), 0, false, w.spread, _v);
    addProjectile(b, boltType(u.team, heavy), from, _v, u, { life: (w.range / w.speed) * 1.4, damage: w.damage, force: w.force, blast: w.blast || 0 });
  }
  b.emit('spark', from.x, from.y, from.z, heavy ? 2 : 0.8);
  b.sound('ga_blaster', from, heavy ? 0.55 : 0.32, heavy ? 0.54 : rand(0.92, 1.08));
}

// A hand-held blaster shot: from the muzzle toward the aimed target (led a little), or
// the crosshair when possessed.
function shoot(u, part = PART.farmR, w = u.def.weapon) {
  const hand = handAt(u, part, _o);
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  hand.x += fx * w.barrel * u.s; hand.z += fz * w.barrel * u.s; hand.y += 0.03 * u.s;
  const t = u.aimAt, dist = t && t.alive ? hand.distanceTo(t.chestPos) : 14;
  aimPoint(u, _p, 0.6, dist / w.speed);
  if (!t && u.control && !u.control.aimPt) _p.y = hand.y + Math.tan(u.control.aimPitch) * 14;
  boltFrom(u, hand, _p, w);
  u.rag.impulse(part, -fx * u.M * 0.05, u.M * 0.04, -fz * u.M * 0.05);
  if (w.heavy) u.rag.impulseAll(-fx * u.M * 0.12, 0, -fz * u.M * 0.12);
}

// Burst at pos: units through common.blast (allies take a little), big bodies directly.
function burst(b, pos, r, dmg, force, owner) {
  blast(b, pos, r, dmg, force, owner, { fx: 2, friendly: 0.3, vol: 0.7, pitch: 1.4 });
  for (const g of S(b).bigs) {
    if (!g.alive || g.team === owner.team) continue;
    closestOnSeg(g.A, g.B, pos, _b);
    const d = Math.max(0, _b.distanceTo(pos) - g.r);
    if (d < r) hurtBig(b, g, dmg * clamp(1 - d / r, 0.2, 1) * (g.blastK ?? 1), owner.alive ? owner : null);
  }
}

function boltHit(b, pr, v, part) {
  pr.hits.add(v);
  pr.life = -1;
  const dir = _d.copy(pr.vel).normalize();
  // a laser knight in the way bats it back (kind.deflect)
  if (v.kind?.deflect && v.kind.deflect(v, pr)) return true;
  if (shieldBlocks(b, v, dir, 0.6)) return true;
  strike(b, v, pr.damage, dir, pr.force, pr.owner, 'ga_bolt', part, 'thud');
  const c = v.rag.pos[part];
  b.emit('spark', c.x, c.y, c.z, 1.2);
  if (pr.blast > 0) burst(b, pr.pos, pr.blast, pr.damage * 0.5, pr.force * 0.6, pr.owner);
  return true;
}
const boltProj = (heavy) => ({
  g: 0, len: heavy ? 1.0 : 0.65, r: heavy ? 0.08 : 0.04, life: 1.5,
  step(b, pr) {
    const h = sweepParts(b, pr, heavy ? 0.1 : 0.05);
    if (h) boltHit(b, pr, h.v, h.part);
  },
  hit: (b, pr, v) => boltHit(b, pr, v, PART.chest),
  bigHit: heavy ? (b, pr, g) => {
    hurtBig(b, g, pr.damage, pr.owner.alive ? pr.owner : null);
    shoveBig(g, pr.vel.x * pr.force * 0.02, pr.force * 0.1, pr.vel.z * pr.force * 0.02, pr.pos, 3);
    b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 4);
    if (pr.blast > 0) burst(b, pr.pos, pr.blast, pr.damage * 0.5, pr.force * 0.6, pr.owner);
    return true;
  } : undefined,
  ground(b, pr) {
    b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, heavy ? 2 : 0.6);
    if (heavy) b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 1.5);
    if (pr.blast > 0) burst(b, pr.pos, pr.blast, pr.damage * 0.5, pr.force * 0.6, pr.owner);
    return true;
  },
});

// Wrist rocket: a short smoky flight, then a bang.
function rocketBoom(b, pr) {
  pr.life = -1;
  burst(b, pr.pos, pr.blast, pr.damage, pr.force, pr.owner);
  b.sound('boom', pr.pos, 0.6, 1.5);
  return true;
}
const rocket = {
  g: 2, len: 0.4, r: 0.06, life: 3,
  step(b, pr) {
    if (!pr.snd) { pr.snd = true; b.sound('fire', pr.pos, 0.4, 1.7); }
    pr.trailT = (pr.trailT || 0) - 1;
    if (pr.trailT <= 0) { pr.trailT = 2; b.emit('trail', pr.pos.x, pr.pos.y, pr.pos.z, Math.random() < 0.5 ? 1 : 0); }
    if (sweepParts(b, pr, 0.1)) rocketBoom(b, pr);
  },
  hit: (b, pr) => rocketBoom(b, pr),
  bigHit: (b, pr) => rocketBoom(b, pr),
  ground: (b, pr) => rocketBoom(b, pr),
};

// The force push's shock ring: harmless, it only shows the push travelling out.
const wave = { g: 0, len: 0.01, r: 0.01, life: 0.45, hit: () => false, bigHit: () => false, ground: () => false };

// ------------------------------------------------------------------ deflecting
// Which incoming hits an energy sword can catch: blows, bolts, bullets, arrows and
// spears (not blasts, boulders, cannonballs, poison, fire...).
const CATCH = new Set(['arrow', 'spear', 'shot', 'bullet', 'ga_bolt', 'pr_shot']);
const catchable = (kind) => kind === 'melee' || CATCH.has(kind) || isBolt(kind) || !!(EXT.proj[kind]?.stick && !EXT.proj[kind].explode);

function swordTip(u, out) { return u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset - 0.45 * u.s, 0.25 * u.s, out); }
function ready(u) { return u.alive && (u.gaParryT || 0) <= 0 && u.stun <= 0 && !u.isDown() && !(u.ga && u.ga.choke); }
function flashBlade(u, k = 1) {
  const b = u.battle, h = swordTip(u, _a);
  b.emit('spark', h.x, h.y, h.z, 5 * k);
  b.sound('ga_clash', h, 0.7, 1);
  b.sound('whoosh', h, 0.5, 0.7);
  // the sword arm snaps across to make the catch
  const sd = Math.random() < 0.5 ? -1 : 1;
  u.rag.impulse(PART.farmR, Math.cos(u.heading) * sd * u.M * 0.08, u.M * 0.05, -Math.sin(u.heading) * sd * u.M * 0.08);
}

const saber = {
  melee: true,
  init(u) { u.gaParryT = 0; u.gaHum = rand(0, 2); },
  think: meleeThink,
  step(u, dt) {
    u.gaParryT -= dt;
    // a low hum now and then
    if ((u.gaHum -= dt) <= 0 && u.alive) { u.gaHum = rand(2.5, 4.5); if (u.battle.started) u.battle.sound('ga_hum', u.chestPos, 0.12, 1); }
  },
  // the swing: a deep "vwoom"
  event(u, t0, t1) { if (crossed(t0, t1, 0.3)) { const h = swordTip(u, _a); u.battle.sound('ga_saber', h, 0.75, 1); } },
  // a light bolt from the front: batted back at the shooter (or off to the side)
  deflect(u, pr) {
    const w = u.def.weapon, b = u.battle;
    if (!ready(u) || pr.type.startsWith('ga_heavy')) return false;
    _d.copy(pr.vel).normalize();
    if (-(_d.x * Math.sin(u.heading) + _d.z * Math.cos(u.heading)) < 0.25 || Math.random() > w.deflect) return false;
    u.gaParryT = 0.12;
    const tip = swordTip(u, _o);
    const o = pr.owner;
    if (o && o.alive && Math.random() < w.reflect) _p.copy(o.chestPos);
    else { const a = u.heading + rand(0.6, 1.6) * (Math.random() < 0.5 ? -1 : 1); _p.set(tip.x + Math.sin(a) * 10, tip.y + rand(-1, 3), tip.z + Math.cos(a) * 10); }
    launchVel(tip, _p, pr.vel.length(), 0, false, 0.05, _v);
    addProjectile(b, boltType(u.team, false), tip, _v, u, { life: 1.2, damage: pr.damage, force: pr.force });
    flashBlade(u, 0.6);
    return true;
  },
  // blows and other missiles from the front land on the blade (see dynasty.js parry)
  parry(u, att, kind) {
    const b = u.battle, w = u.def.weapon;
    u.parryAsk = att; u.parryAskT = b.time;
    if (!att || !ready(u) || !catchable(kind) || isBolt(kind)) return false;
    const melee = kind === 'melee';
    if (!inFront(u, att.pos.x, att.pos.z, 0.2) || Math.random() > (melee ? w.parry : w.deflect)) return false;
    u.gaParryT = melee ? 0.4 : 0.15;
    u.parriedAt = b.time;
    if (melee) u.cooldown = Math.min(u.cooldown, 0.08);
    else if (kind === 'arrow' && Math.random() < 0.5) {
      // an arrow knocked aside keeps flying
      const tip = swordTip(u, _o), a = u.heading + rand(0.8, 1.8) * (Math.random() < 0.5 ? -1 : 1);
      _v.set(Math.sin(a) * 14, rand(2, 5), Math.cos(a) * 14);
      addProjectile(b, 'arrow', tip, _v, u, { life: 4, damage: 15, force: 40 });
    }
    flashBlade(u, melee ? 1 : 0.6);
    return true;
  },
  hit(u, amount, part, att, kind) {
    const t = u.battle.time;
    if (u.parriedAt === t) return kind === 'melee' ? amount * 0.1 : 0;
    if (u.parryAskT === t && u.parryAsk === att) return amount; // (asked already: not caught)
    return saber.parry(u, att, kind) ? (kind === 'melee' ? amount * 0.1 : 0) : amount;
  },
};

// ------------------------------------------------------------------ blasters
// Bursts of `ammo` shots `cooldown` apart, then a reload. Options read from the weapon:
// swat {reach, damage, fling} (a backhand for anyone who gets close), rage (roars into
// faster reloads below half health).
const blaster = {
  aim: true,
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.ammo = w.ammo || 1; u.gaSwatCd = rand(0, 1); },
  think(u, dt, c) {
    const w = u.def.weapon, b = u.battle;
    if (!u.st.attack) u.gaSwat = false;
    if (w.rage && !u.gaRaged && u.hp < u.maxHp * 0.5 && u.alive) {
      u.gaRaged = true;
      b.voice(u, 'cry', true);
      b.sound('horn', u.chestPos, 0.7, 0.42);
      b.emit('dust', u.pos.x, u.pos.y - 0.5, u.pos.z, 3);
    }
    if (w.swat) {
      u.gaSwatCd -= dt;
      const near = c.dist - c.t.skel.radius;
      if (near < w.swat.reach * u.s && u.gaSwatCd <= 0 && !u.st.attack && u.stun <= 0 && !u.isDown()) {
        u.gaSwat = true; u.gaSwatAt = c.t; u.gaSwatCd = w.swat.cd;
        const keep = u.cooldown;
        u.startAttack('punchy');
        u.cooldown = Math.max(keep, 0.2);
        u.expr = EXPR.angry;
        u.desired.multiplyScalar(0.2);
        return c.t;
      }
    }
    return rangedThink(u, dt, c);
  },
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (u.gaSwat) { if (crossed(t0, t1, 0.48)) { u.gaSwat = false; swat(u, u.gaSwatAt); } return; }
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    shoot(u);
    if (--u.ammo <= 0) {
      u.ammo = w.ammo || 1;
      u.cooldown = w.reload * rand(0.9, 1.1) * (u.gaRaged ? 0.65 : 1) * (u.buff > 0 ? 0.85 : 1);
      b.delayed.push([0.4, () => u.alive && b.sound('click', u.pos, 0.35, 1.6)]);
      b.delayed.push([w.reload * 0.8, () => u.alive && b.sound('click', u.pos, 0.4, 2.0)]);
    }
  },
};
function swat(u, t) {
  const b = u.battle, w = u.def.weapon.swat;
  if (!t || !t.alive || !u.alive) return;
  _d.set(t.pos.x - u.pos.x, 0, t.pos.z - u.pos.z);
  const d = _d.length();
  if (d - t.skel.radius > w.reach * u.s * 1.25) { b.sound('whoosh', u.chestPos, 0.8, 0.5); return; }
  _d.divideScalar(d || 1);
  t.hit(w.damage, PART.chest, 0, 0, 0, u, 'swat');
  if (onFoot(t)) fling(t, _d.x * w.fling, w.fling * 0.45, _d.z * w.fling, 1.3);
  const c = t.chestPos;
  b.emit('blood', c.x, c.y, c.z, 5, _d.x, _d.z);
  b.sound('thud', c, 1.1, 0.6);
}

// ------------------------------------------------------------------ jetpack hunter
// Pistol bursts as a blaster; a wrist rocket every few seconds; and the jetpack: when
// melee closes in, or the target is out of range, it takes off, hovers over the fight
// for a few seconds (shooting all the while) and comes down again.
function startJet(u) {
  const g = u.ga, b = u.battle, w = u.def.weapon;
  g.jet = w.hover; g.land = false;
  g.flame = { type: 'ga_flame', unit: u, part: PART.chest, lp: new V3(0, -u.skel.parts[PART.chest].hh * 0.4, -u.skel.parts[PART.chest].r * 1.55), lq: new Q4(), pos: u.chestPos.clone(), quat: new Q4(), t: w.hover + 3, id: newId() };
  b.stuck.push(g.flame);
  u.rag.impulseAll(0, u.M * 5.5, 0);
  b.sound('fire', u.pos, 0.8, 0.8);
  b.emit('dust', u.pos.x, u.pos.y - 0.6, u.pos.z, 3);
}
function endJet(u) {
  const g = u.ga;
  g.jet = 0; g.land = false; g.jetCd = u.def.weapon.jetCd * rand(0.9, 1.15);
  u.st.prHang = false;
  if (g.flame) { g.flame.t = 0; g.flame = null; }
}
const hunter = {
  aim: true,
  init(u) { blaster.init(u); u.ga = { jet: 0, land: false, jetCd: rand(0.5, 2), rocketCd: rand(2, 4), flame: null }; },
  think(u, dt, c) {
    const g = u.ga, w = u.def.weapon, b = u.battle;
    g.jetCd -= dt; g.rocketCd -= dt;
    const { t, dist } = c;
    if (g.jet <= 0 && !g.land && g.jetCd <= 0 && u.stun <= 0 && !u.isDown() && u.airT <= 0) {
      const rush = dist < 6 && t.def.weapon.kind !== 'ranged';
      if (rush || dist > w.range * 1.05) startJet(u);
    }
    // wrist rocket (left arm, no wind-up)
    if (g.rocketCd <= 0 && dist > 5 && dist < w.rocketRange && u.stun <= 0 && !u.isDown()) {
      g.rocketCd = w.rocketCd * rand(0.9, 1.1);
      const hand = handAt(u, PART.farmL, _o, -0.05 * u.s);
      _p.set(t.chestPos.x + t.rag.vel[PART.chest].x * dist / 30, t.chestPos.y, t.chestPos.z + t.rag.vel[PART.chest].z * dist / 30);
      launchVel(hand, _p, 22, 2, false, 0.03, _v);
      addProjectile(b, 'ga_rocket', hand, _v, u, { life: 3, damage: w.rocket, force: 420, blast: w.rocketBlast });
      b.emit('spark', hand.x, hand.y, hand.z, 1.5);
    }
    if (g.jet > 0) {
      // over the fight: hold off at blaster range, sliding sideways
      const { dirx, dirz } = c, sp = w.jetSpeed, sd = u.id % 2 ? 1 : -1;
      const want = w.range * 0.55;
      const k = clamp((dist - want) / 4, -1, 1);
      u.desired.set(dirx * sp * k - dirz * sd * sp * 0.35, 0, dirz * sp * k + dirx * sd * sp * 0.35);
      u.expr = EXPR.happy;
      if (dist < w.range && !u.st.attack && u.cooldown <= 0 && u.stun <= 0) { u.startAttack(); u.aimAt = t; }
      return t;
    }
    return blaster.think(u, dt, c);
  },
  event: blaster.event,
  // possessed (src/skills.js): RT the pistol, X a shove, LB the wrist rocket, RB the jetpack
  basic: 'Shove', ranged: 'Blaster pistol',
  skills: [
    { key: 'lb', name: 'Wrist Rocket', icon: '🚀', cd: (u) => u.ga.rocketCd, max: (u) => u.def.weapon.rocketCd,
      use(u) {
        const b = u.battle, w = u.def.weapon, g = u.ga, v = aimTarget(u, w.rocketRange, 4);
        const at = v ? v.chestPos : u.control?.aimPt;
        if (!at) return false;
        g.rocketCd = w.rocketCd;
        const hand = handAt(u, PART.farmL, _o, -0.05 * u.s);
        launchVel(hand, _p.copy(at), 22, 2, false, 0.03, _v);
        addProjectile(b, 'ga_rocket', hand, _v, u, { life: 3, damage: w.rocket, force: 420, blast: w.rocketBlast });
        b.emit('spark', hand.x, hand.y, hand.z, 1.5);
        return true;
      } },
    { key: 'rb', name: 'Jetpack', icon: '🔥', cd: (u) => (u.ga.jet > 0 || u.ga.land ? 99 : u.ga.jetCd), max: (u) => u.def.weapon.jetCd, ready: (u) => (u.airT > 0 && !(u.ga.jet > 0) ? 'in the air' : true),
      use(u) { startJet(u); return true; } },
  ],
  step(u, dt) {
    const g = u.ga, b = u.battle, rag = u.rag, p = u.pos, v = rag.vel[PART.pelvis], w = u.def.weapon;
    if (u.control) { g.jetCd -= dt; g.rocketCd -= dt; } // (think counts them down; possessed, think doesn't run)
    if (!(g.jet > 0) && !g.land) return;
    if (!u.alive) { endJet(u); return; }
    u.st.prHang = true;
    u.airT = 0; // hovering is not falling: keep the core out of 'flail' so the arms aim
    const gy = b.terrain.height(p.x, p.z), h = p.y - gy;
    rag.impulseAll(0, u.M * 9.81 * dt, 0);
    let ay;
    if (g.jet > 0) {
      g.jet -= dt;
      if (g.jet <= 0) g.land = true;
      ay = clamp((w.alt - h) * 2.8 - v.y * 2.4, -6, 7);
    } else {
      // down again, gently
      ay = clamp((-1.8 - v.y) * 3, -6, 6);
      if (h < u.skel.standHeight + 0.15) { endJet(u); return; }
    }
    let ax = (u.desired.x - v.x) * 2.2, az = (u.desired.z - v.z) * 2.2;
    const am = Math.hypot(ax, az), cap = 7;
    if (am > cap) { ax *= cap / am; az *= cap / am; }
    rag.impulseAll(u.M * ax * dt, u.M * ay * dt, u.M * az * dt);
    // the jets
    if ((g.puffT = (g.puffT || 0) - 1) <= 0) {
      g.puffT = 3;
      const f = g.flame;
      if (f) b.emit('trail', f.pos.x, f.pos.y - 0.35, f.pos.z, Math.random() < 0.5 ? 1 : 0);
    }
  },
  die(u) { if (u.ga) endJet(u); },
};

// ------------------------------------------------------------------ dark lord
// The red sword fights like the knight's (catches blows, bats bolts back). Between
// swings: a force push when two or more enemies crowd its front, and a force choke
// that lifts the most valuable enemy within reach off the ground, chokes it and drops it.
const REACH_L = [0.1, 0.12, -1.55, -1.62];
function crowd(u, R) {
  let n = 0;
  u.battle.grid.query(u.pos.x, u.pos.z, R + 1, (o) => {
    if (!o.alive || o.team === u.team) return;
    if ((o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2 < R * R && inFront(u, o.pos.x, o.pos.z, 0.3)) n++;
  });
  return n;
}
function forcePush(u) {
  const b = u.battle, w = u.def.weapon, P = w.push, g = u.ga;
  g.pushCd = P.cd * rand(0.9, 1.1);
  u.st.gaReach = 0.6;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading), c = u.chestPos;
  b.voice(u, 'attack', true);
  b.sound('whoosh', c, 1.4, 0.32);
  b.sound('thump', c, 0.8, 0.5);
  for (const y of [-0.5, 0.15]) {
    _o.set(c.x + fx * 0.6, c.y + y, c.z + fz * 0.6);
    addProjectile(b, 'ga_wave', _o, _v.set(fx * 13, 0, fz * 13), u, { life: 0.42, damage: 0, force: 0 });
  }
  for (let i = 1; i <= 3; i++) { const x = u.pos.x + fx * i * 1.6, z = u.pos.z + fz * i * 1.6; b.emit('dust', x, b.terrain.height(x, z), z, 2); }
  b.grid.query(u.pos.x, u.pos.z, P.r + 2, (o) => {
    if (!o.alive || o.team === u.team) return;
    const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz);
    if (d > P.r + o.skel.radius || (fx * dx + fz * dz) / (d || 1) < 0.25) return;
    const f = clamp(1.15 - d / P.r, 0.35, 1);
    o.hit(P.damage * f, PART.chest, 0, 0, 0, u, 'push');
    if (onFoot(o)) { fling(o, (dx / d) * P.fling * f, P.fling * 0.42 * f, (dz / d) * P.fling * f, 1.4); trackFall(b, o, u, 6); }
    else if (o.sm && o.sm.big) shoveBig(o.sm.big, (dx / d) * o.sm.big.mass * 3 * f, o.sm.big.mass * f, (dz / d) * o.sm.big.mass * 3 * f, o.sm.big.A, 3);
  });
}
function chokeTarget(u, R) {
  let best = null, bv = -1;
  u.battle.grid.query(u.pos.x, u.pos.z, R + 1, (o) => {
    if (!o.alive || o.team === u.team || o.gaChoked || !small(o, 1.6)) return;
    const d2 = (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2;
    if (d2 > R * R || d2 < 4) return;
    const v = (o.def.cost || 50) / (1 + Math.sqrt(d2) * 0.05);
    if (v > bv) { bv = v; best = o; }
  });
  return best;
}
// the enemy under the crosshair, if it can be choked (on foot, not too big, not too close)
function chokeAim(u) {
  const C = u.def.weapon.choke, v = aimTarget(u, C.range, 3);
  if (!v || v.gaChoked || !small(v, 1.6)) return null;
  return (v.pos.x - u.pos.x) ** 2 + (v.pos.z - u.pos.z) ** 2 < 4 ? null : v;
}
function startChoke(u, v) {
  const b = u.battle, C = u.def.weapon.choke;
  const r = v.skel.rHead;
  const mark = { type: 'ga_grip', unit: v, part: PART.head, lp: new V3(0, -r * 0.85, 0), lq: new Q4(), pos: v.headPos.clone(), quat: new Q4(), t: C.dur + 0.3, id: newId() };
  b.stuck.push(mark);
  u.ga.choke = { v, t: 0, tick: 0.5, base: new V3(v.pos.x, b.terrain.height(v.pos.x, v.pos.z), v.pos.z), mark };
  v.gaChoked = true;
  u.st.attack = null;
  b.sound('flyby', v.headPos, 0.6, 0.3);
  b.voice(v, 'scream', true);
}
function endChoke(u) {
  const k = u.ga.choke;
  if (!k) return;
  u.ga.choke = null;
  u.ga.chokeCd = u.def.weapon.choke.cd * rand(0.9, 1.1);
  k.mark.t = 0;
  k.v.gaChoked = false;
  if (k.v.alive) trackFall(u.battle, k.v, u.alive ? u : null, 9);
}
const lord = {
  melee: true,
  init(u) { saber.init(u); u.ga = { pushCd: rand(1, 2), chokeCd: rand(2, 4), choke: null }; },
  think(u, dt, c) {
    const g = u.ga;
    g.pushCd -= dt; if (!g.choke) g.chokeCd -= dt;
    if (g.choke) { u.desired.set(0, 0, 0); u.expr = EXPR.angry; return g.choke.v; }
    const f = meleeThink(u, dt, c);
    if (u.stun > 0 || u.isDown() || u.st.attack) return f;
    if (g.pushCd <= 0 && crowd(u, u.def.weapon.push.r * 0.8) >= 2) forcePush(u);
    else if (g.chokeCd <= 0) {
      const v = chokeTarget(u, u.def.weapon.choke.range);
      if (v) startChoke(u, v); else g.chokeCd = 0.5;
    }
    return f;
  },
  event: saber.event,
  // possessed (src/skills.js): X the red blade, LB Force Choke, RB Force Push (a cone)
  basic: 'Red energy sword',
  skills: [
    { key: 'rb', name: 'Force Push', icon: '🫸', cd: (u) => u.ga.pushCd, max: (u) => u.def.weapon.push.cd, use(u) { forcePush(u); return true; } },
    { key: 'lb', name: 'Force Choke', icon: '✊', cd: (u) => (u.ga.choke ? 99 : u.ga.chokeCd), max: (u) => u.def.weapon.choke.cd,
      ready: (u) => (chokeAim(u) ? true : 'no one to choke'),
      use(u) { const v = chokeAim(u); if (!v) return false; startChoke(u, v); return true; } },
  ],
  step(u, dt) {
    saber.step(u, dt);
    if (u.control) { u.ga.pushCd -= dt; if (!u.ga.choke) u.ga.chokeCd -= dt; }
    u.st.gaReach = Math.max(0, (u.st.gaReach || 0) - dt);
    const k = u.ga.choke;
    if (!k) return;
    const b = u.battle, v = k.v, C = u.def.weapon.choke;
    k.t += dt;
    const far = (v.pos.x - u.pos.x) ** 2 + (v.pos.z - u.pos.z) ** 2 > (C.range + 4) ** 2;
    if (!u.alive || !v.alive || u.stun > 0.25 || u.isDown() || k.t > C.dur || far) { endChoke(u); return; }
    u.st.gaReach = 0.2;
    // lifted up off the ground, kicking
    _p.copy(k.base); _p.y += v.skel.standHeight + 0.3 + Math.min(1, k.t / 0.7) * C.lift;
    carry(v, _p, dt, null, 5);
    if ((k.tick -= dt) <= 0) {
      k.tick = 0.5;
      v.hit(C.dps * 0.5, PART.head, 0, 0, 0, u, 'choke');
      if (Math.random() < 0.4) b.voice(v, 'hurt', true);
    }
  },
  die(u) { if (u.ga) endChoke(u); },
  deflect: saber.deflect,
  parry: saber.parry,
  hit(u, amount, part, att, kind) {
    const t = u.battle.time;
    if (u.parriedAt === t) return kind === 'melee' ? amount * 0.1 : 0;
    if (u.parryAskT === t && u.parryAsk === att) return amount;
    return lord.parry(u, att, kind) ? (kind === 'melee' ? amount * 0.1 : 0) : amount;
  },
};
EXT.pose.push((st, pose) => {
  if (st.gaReach > 0 && !st.attack && st.mode === 'normal') setArm(pose, 1, REACH_L);
});

// ------------------------------------------------------------------ walker
const WK_C = { hull: '#9a9ea6', dark: '#5f646c', light: '#c4c8ce', glass: '#ffcf70' };
const thighQ = setRot(new Q4(), -0.35), shinQ = setRot(new Q4(), 0.7);
const WALKER = {
  torso: V(0, 2.85, 0), r: 0.78, hh: 1.15, mass: 6000, cols: [{ at: V(0, 0.1, 1.95), r: 0.6, mass: 300 }],
  H0: 2.85, speed: 2.6, accel: 1.6, turn: 0.7, turnSlow: 0.6, grip: 6, alpha: 3, stride: 3.0, bob: 0.035, getUp: 3,
  seg: [V(0, -0.1, -1.5), V(0, 0.05, 2.3)], segR: 1.3, combatR: 1.8, pitch: 0.5, shoveK: 0.35, blastK: 0.6, armor: 0.3,
  metal: true,
  torsoMesh: (H, t) => walkerHull(H, t),
  parts: [
    { at: V(0.98, -0.3, 1.05), parent: -1, leg: 0, len: 2.75, rest: thighQ, front: true, mesh: (H, t) => walkerThigh(H, t) },
    { at: V(-0.98, -0.3, 1.05), parent: -1, leg: PI, len: 2.75, rest: thighQ, front: true, mesh: (H, t) => walkerThigh(H, t) },
    { at: V(0.98, -0.3, -1.05), parent: -1, leg: PI, len: 2.75, rest: thighQ, mesh: (H, t) => walkerThigh(H, t) },
    { at: V(-0.98, -0.3, -1.05), parent: -1, leg: 0, len: 2.75, rest: thighQ, mesh: (H, t) => walkerThigh(H, t) },
    { at: V(0, -1.15, 0), parent: 0, rest: shinQ, mesh: (H, t) => walkerShin(H, t) },
    { at: V(0, -1.15, 0), parent: 1, rest: shinQ, mesh: (H, t) => walkerShin(H, t) },
    { at: V(0, -1.15, 0), parent: 2, rest: shinQ, mesh: (H, t) => walkerShin(H, t) },
    { at: V(0, -1.15, 0), parent: 3, rest: shinQ, mesh: (H, t) => walkerShin(H, t) },
    { at: V(0, 0.05, 1.45), parent: -1, mesh: (H, t) => walkerHead(H, t) },
  ],
};
const HEAD = 8;
function walkerAnim(b, m) {
  const P = m.parts;
  const amp = 0.3 * clamp(Math.abs(m.vf) / 1.4, 0, 1);
  for (let i = 0; i < 4; i++) {
    const ph = m.phase + P[i].def.leg;
    if (!m.alive) { setRot(P[i].q, -0.35 + (i % 2 ? 0.25 : -0.25), 0, i % 2 ? -0.3 : 0.3); setRot(P[i + 4].q, 0.2); continue; }
    // a stomp: the leg lifts high and slams down
    const st = m.stomp && m.stomp.leg === i ? m.stomp.t : -1;
    const lift = st < 0 ? 0 : st < 0.45 ? st / 0.45 : st < 0.6 ? 1 - (st - 0.45) / 0.15 : 0;
    setRot(P[i].q, -0.35 + Math.sin(ph) * amp * (1 - lift) - lift * 0.75);
    // the knee lifts the foot on the forward swing
    setRot(P[i + 4].q, 0.7 + Math.max(0, Math.cos(ph)) * amp * 1.4 + lift * 0.9);
  }
  setRot(P[HEAD].q, m.alive ? m.headPitch || 0 : 0.35, m.alive ? m.headYaw || 0 : 0.3);
}
function walkerThink(u, dt, ctx) {
  const m = u.bc, b = u.battle, p = m.torso.pos, w = u.def.weapon;
  m.thinkT = b.time;
  const t = nearestEnemy(b, u.team, p) || ctx.t;
  // the cannons want something out beyond the legs; the feet deal with the rest
  m.tgt = nearestEnemy(b, u.team, p, (o) => (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 > 30) || t;
  walkerSight(b, m, dt);
  u.expr = EXPR.angry;
  // with no clear shot: walk to a spot that has one, else close in on the cannon target
  const go = m.noLos ? (m.detour ? { pos: m.detour } : m.tgt?.alive ? m.tgt : t) : t;
  const dx = go.pos.x - p.x, dz = go.pos.z - p.z, d = Math.hypot(dx, dz);
  m.goalYaw = inField(p, Math.atan2(dx, dz));
  const bear = Math.abs(angleDiff(yawOf(m.torso.quat), m.goalYaw));
  // stride up to range, stand and shoot; trample through anything that gets close
  m.goalSpeed = bear > 0.9 ? 0.4 : m.noLos || d > w.range * 0.8 ? WALKER.speed : d < 9 ? WALKER.speed * 0.75 : 0;
  return t;
}
// Line of sight from the cannons (checked a few times a second): a target behind a wall,
// a mesa or a kiosk is swapped for the nearest enemy in range the cannons can see. With
// none, m.detour is the nearest spot it can walk to in a straight line (through a gateway,
// round the end of a wall) with a clear shot at the target: m.noLos holds fire while
// walkerThink walks there. With no such spot it fires anyway (the blast splashes over
// low cover).
function walkerSight(b, m, dt) {
  if (m.detour && Math.hypot(m.detour.x - m.torso.pos.x, m.detour.z - m.torso.pos.z) < 2.5) m.detour = null;
  if ((m.losT = (m.losT ?? 0) - dt) > 0) return;
  m.losT = rand(0.35, 0.5);
  const T = b.terrain, t = m.tgt;
  // how long its shots have done nothing to this target (stuck firing into cover)
  m.noDmgT = t && t === m.lastTgt && t.hp >= m.lastTgtHp - 1 ? (m.noDmgT || 0) + 0.42 : 0;
  m.lastTgt = t; m.lastTgtHp = t?.hp;
  m.noLos = false;
  if (!T.losBlocked || !t?.alive) { m.detour = null; return; }
  const head = partPoint(m, HEAD, 0, -0.3, 1.95, new V3());
  if (!T.losBlocked(b, head, t.chestPos)) { m.detour = null; return; }
  const range = m.u.def.weapon.range, p = m.torso.pos;
  const near = b.foes(m.u.team).filter((o) => o.alive && o !== t && !o.dormant)
    .map((o) => [o, (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2])
    .filter(([, d2]) => d2 > 30 && d2 < range * range).sort((x, y) => x[1] - y[1]).slice(0, 6);
  for (const [o] of near) if (!T.losBlocked(b, head, o.chestPos)) { m.tgt = o; m.detour = null; return; }
  if (m.detour && (m.detourT = (m.detourT || 0) - 0.4) > 0) { m.noLos = true; return; } // keep heading for it a while
  // spots on rings round the target that see it and that the walker can walk to in a
  // straight line (through a gateway, round the end of a wall): the shortest walk wins
  const up = head.y - T.height(p.x, p.z), at = new V3(), seen = [];
  let best = null, bd = Infinity;
  for (const R of [9, 14, 20, 27]) for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, x = t.pos.x + Math.cos(a) * R, z = t.pos.z + Math.sin(a) * R;
    if (Math.abs(x) > FIELD.x - 3 || Math.abs(z) > FIELD.z - 3 || T.blocked?.(x, z, 2.5)) continue;
    at.set(x, T.height(x, z) + up, z);
    if (T.losBlocked(b, at, t.chestPos)) continue;
    const walk = Math.hypot(x - p.x, z - p.z);
    seen.push({ x, z, walk });
    if (walk < bd && walkable(T, p.x, p.z, x, z)) { best = { x, z }; bd = walk; }
  }
  // none in one straight walk: go via a waypoint near the walker (out through its own
  // gateway first), then look again from there
  if (!best && seen.length) {
    seen.sort((u, v) => u.walk - v.walk);
    let wb = Infinity;
    for (const R of [6, 10, 14, 18, 23]) for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, x = p.x + Math.cos(a) * R, z = p.z + Math.sin(a) * R;
      if (Math.abs(x) > FIELD.x - 3 || Math.abs(z) > FIELD.z - 3 || !walkable(T, p.x, p.z, x, z)) continue;
      for (const c of seen.slice(0, 12)) {
        const tot = R + Math.hypot(c.x - x, c.z - z);
        if (tot < wb && walkable(T, x, z, c.x, c.z)) { wb = tot; best = { x, z }; }
      }
    }
  }
  // still nothing, and its shots have been hitting cover for a while: wander to a random
  // spot it can reach for a new view, then look again
  if (!best && m.noDmgT > 8) {
    for (let k = 0; k < 24 && !best; k++) {
      const a = rand(0, Math.PI * 2), R = rand(8, 20), x = p.x + Math.cos(a) * R, z = p.z + Math.sin(a) * R;
      if (Math.abs(x) < FIELD.x - 3 && Math.abs(z) < FIELD.z - 3 && walkable(T, p.x, p.z, x, z)) best = { x, z };
    }
    if (best) m.noDmgT = 0;
  }
  m.detour = best;
  if (best) { m.detourT = 6; m.noLos = true; }
}
// can the walker stride straight from (x0, z0) to (x1, z1) without meeting an obstacle?
function walkable(T, x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 1.5);
  for (let k = 2; k <= n; k++) if (T.blocked?.(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, 1.6)) return false;
  return true;
}
function walkerFire(b, m) {
  const u = m.u, w = u.def.weapon;
  m.fireCd = w.cooldown * rand(0.9, 1.1);
  for (const k of [-1, 1]) {
    b.delayed.push([k > 0 ? 0.18 : 0, () => {
      if (!m.alive || !u.alive) return;
      const from = partPoint(m, HEAD, k * 0.3, -0.3, 1.95, new V3());
      const t = m.tgt;
      if (t && t.alive) {
        const c = t.chestPos, tv = t.rag.vel[PART.chest], tof = from.distanceTo(c) / w.speed;
        _p.set(c.x + tv.x * tof * 0.6, c.y, c.z + tv.z * tof * 0.6);
      } else partPoint(m, HEAD, k * 0.3, -1.2, 14, _p);
      boltFrom(u, from, _p, w, true);
      b.sound('boom', from, 0.45, 2.0);
      shoveBig(m.big, -Math.sin(yawOf(m.torso.quat)) * WALKER.mass * 0.05, 0, -Math.cos(yawOf(m.torso.quat)) * WALKER.mass * 0.05, from, 1);
    }]);
  }
}
function walkerAct(b, m, dt) {
  const u = m.u, w = u.def.weapon;
  footfalls(m, (i, at) => {
    const gy = b.terrain.height(at.x, at.z);
    at.y = gy;
    b.emit('dust', at.x, gy, at.z, 2.5);
    b.sound('thump', at, 0.55, 0.5);
    quake(b, u, at, 1.3, 24, 4);
  });
  if (Math.abs(m.vf) > 0.5) trampleBeast(b, m, 1.4, 22);
  walkerStomp(b, m, dt);
  m.fireCd = (m.fireCd ?? rand(0.5, 1.5)) - dt;
  const t = m.tgt;
  if (!t || !t.alive) return;
  // the head turns toward the target (only so far round), then the cannons fire
  const head = partPoint(m, HEAD, 0, 0, 0.6, _a), c = t.chestPos;
  const rel = angleDiff(yawOf(m.torso.quat), Math.atan2(c.x - head.x, c.z - head.z));
  const want = clamp(rel, -1.1, 1.1);
  m.headYaw = (m.headYaw || 0) + clamp(want - (m.headYaw || 0), -1.4 * dt, 1.4 * dt);
  const dh = Math.hypot(c.x - head.x, c.z - head.z);
  m.headPitch = clamp(-Math.atan2(c.y - head.y, dh) * 0.8, -0.35, 0.6);
  if (m.fireCd <= 0 && !m.noLos && Math.abs(rel - m.headYaw) < 0.2 && dh < w.range && dh > 3) walkerFire(b, m);
}
// Anything in among the legs gets a foot: the leg nearest to it lifts and slams down.
function walkerStomp(b, m, dt) {
  const u = m.u, p = m.torso.pos, S = u.def.weapon.stomp;
  if (m.stomp) {
    const k = m.stomp, t0 = k.t;
    k.t += dt;
    if (t0 < 0.55 && k.t >= 0.55) {
      const at = partPoint(m, k.leg + 4, 0, -1.45, 0, _b);
      at.y = b.terrain.height(at.x, at.z);
      quake(b, u, at, S.r, S.damage, S.fling);
      b.emit('dust', at.x, at.y, at.z, 5);
      b.sound('thump', at, 1.2, 0.35);
      b.sound('crunch', at, 0.6, 0.5);
    }
    if (k.t > 0.9) m.stomp = null;
    return;
  }
  if ((m.stompCd = (m.stompCd ?? 1) - dt) > 0) return;
  let best = null, bd = S.reach * S.reach;
  b.grid.query(p.x, p.z, S.reach + 1, (o) => {
    if (!o.alive || o.team === u.team || o.bc || o.pos.y > p.y) return;
    const d = (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  });
  if (!best) return;
  let leg = 0, ld = Infinity;
  for (let i = 0; i < 4; i++) {
    const f = partPoint(m, i + 4, 0, -1.45, 0, _b), d = (f.x - best.pos.x) ** 2 + (f.z - best.pos.z) ** 2;
    if (d < ld) { ld = d; leg = i; }
  }
  m.stomp = { leg, t: 0 };
  m.stompCd = S.cd * rand(0.9, 1.1);
}
function walkerDie(b, m) {
  const p = m.torso.pos;
  b.emit('explode', p.x, p.y, p.z, 3, 0);
  b.sound('boom', p, 1.3, 0.7);
  for (let i = 0; i < 3; i++) b.delayed.push([0.3 + i * 0.35, () => b.emit('trail', p.x + rand(-1, 1), p.y + 0.6, p.z + rand(-1, 1), 0)]);
}
Object.assign(WALKER, {
  anim: walkerAnim, act: walkerAct, onDie: walkerDie,
  init: (m) => { m.big.flesh = false; m.headYaw = 0; m.headPitch = 0; },
  command: (b, m) => { if ((m.fireCd ?? 0) <= 0) walkerFire(b, m); },
});
const walker = { init: (u) => beastInit(u, WALKER), think: walkerThink, step: beastUnitStep, hit: beastHit, die: beastDie };

// ------------------------------------------------------------------ units
const DROID = '#cdb98c', ARMOR = '#f2f2ee';
const units = [
  {
    id: 'ga_droid', name: 'Battle Droid', faction: 'galactic', cost: 55, hp: 55, speed: 4.4,
    build: { scale: 0.96, girth: 0.62, head: 0.78, arms: 1.05, armThick: 0.55, legs: 1.06, mass: 0.6 },
    weapon: { line: 'Ranged · cheap and many · weak blaster, falls apart', kind: 'ga_blaster', style: 'sword', anim: 'punch', item: 'ga_droid_gun', damage: 13, speed: 36, range: 24, minRange: 4, cooldown: 0.7, reload: 3.4, ammo: 3, force: 50, spread: 0.08, releaseAt: 0.5, windup: 0.4, barrel: 0.55 },
    look: { skin: DROID, hat: 'ga_droid', top: 'ga_droid', legs: DROID, accent: '#a89466' },
    personality: { aggro: 0.6, bravery: 0, voice: 1.75, chatter: 1, cry: 'yip', idle: 'shift' },
    fallApart: true,
    desc: 'Cheap, skinny and terrible at aiming. Comes in bulk and falls to bits.',
  },
  {
    id: 'ga_trooper', name: 'Blaster Trooper', faction: 'galactic', cost: 175, hp: 110, speed: 4.5,
    build: { scale: 1, girth: 1.0 },
    weapon: { line: 'Ranged · rifle bursts of glowing bolts · not very accurate', kind: 'ga_blaster', style: 'spear', anim: 'punch', item: 'ga_rifle', damage: 17, speed: 42, range: 28, minRange: 6, cooldown: 0.32, reload: 4.4, ammo: 5, force: 70, spread: 0.07, releaseAt: 0.5, windup: 0.35, barrel: 0.75 },
    look: { skin: '#f0c8a0', hat: 'ga_trooper', top: 'ga_trooper', legs: ARMOR, accent: '#26262a' },
    personality: { aggro: 0.45, bravery: 0.2, voice: 0.95, chatter: 0.7, cry: 'hey', idle: 'shift' },
    armor: 0.1,
    desc: 'Shiny white armour and a lot of bolts. Some of them even hit.',
  },
  {
    id: 'ga_knight', name: 'Laser Knight', faction: 'galactic', cost: 300, hp: 260, speed: 5.6,
    build: { scale: 1.02, girth: 0.98 },
    weapon: { line: 'Melee · fast energy sword · deflects bolts back, catches blows and arrows', kind: 'ga_saber', style: 'sword', anim: 'overhead', item: 'ga_esword', damage: 44, reach: 1.3, cooldown: 0.6, force: 260, parry: 0.35, deflect: 0.6, reflect: 0.55 },
    look: { skin: '#e8b890', hat: 'ga_knight', top: 'ga_robe', legs: '#5a4430', accent: '#3a2a1e', cape: true },
    personality: { aggro: 1, bravery: 0, voice: 0.95, chatter: 0.4, cry: 'charge', idle: 'regal' },
    stagger: 0.7,
    desc: 'A humming energy sword: quick cuts, and blaster bolts go back where they came from.',
  },
  {
    id: 'ga_furball', name: 'Space Furball', faction: 'galactic', cost: 520, hp: 480, speed: 4.4,
    build: { scale: 1.38, girth: 1.12, head: 1.02, arms: 1.12, mass: 1.25, neck: 0.15 },
    weapon: { line: 'Ranged · heavy crossbow-blaster bolts · swats anyone close · roars into a rage', kind: 'ga_blaster', style: 'spear', anim: 'punch', item: 'ga_xbow', heavy: true, damage: 62, speed: 34, range: 26, minRange: 4, cooldown: 0.6, reload: 2.6, ammo: 1, force: 480, spread: 0.035, releaseAt: 0.5, windup: 0.55, barrel: 0.75, swat: { reach: 1.1, damage: 45, fling: 9, cd: 1.6 }, rage: true },
    look: { skin: '#7a5232', hat: 'ga_fur', top: 'ga_fur', legs: '#6a4628', bare: true, accent: '#4a3020' },
    personality: { aggro: 0.75, bravery: 0, voice: 0.55, chatter: 0.8, cry: 'roar', idle: 'thump' },
    stagger: 0.5,
    desc: 'Big, hairy and loud. Hits like a truck with its crossbow-blaster, or its fists.',
  },
  {
    id: 'ga_hunter', name: 'Jetpack Hunter', faction: 'galactic', cost: 570, hp: 220, speed: 5.0,
    build: { scale: 1.0, girth: 1.02 },
    weapon: { line: 'Ranged · jetpack hops over the line · blaster pistol and wrist rockets', kind: 'ga_hunter', style: 'sword', anim: 'punch', item: 'ga_pistol', damage: 24, speed: 44, range: 26, minRange: 5, cooldown: 0.4, reload: 3.0, ammo: 4, force: 90, spread: 0.04, releaseAt: 0.5, windup: 0.35, barrel: 0.35, hover: 3.6, jetCd: 6.5, alt: 3.2, jetSpeed: 5, rocket: 50, rocketBlast: 2.2, rocketCd: 6.5, rocketRange: 22 },
    look: { skin: '#e0b088', hat: 'ga_hunter', top: 'ga_hunter', legs: '#5a5e48', accent: '#3a3226' },
    personality: { aggro: 0.4, bravery: 0.15, voice: 0.8, chatter: 0.4, cry: 'hey', idle: 'lean' },
    armor: 0.25,
    desc: 'Flies over the fight on a jetpack, peppering it with bolts and rockets.',
  },
  {
    id: 'ga_lord', name: 'Dark Lord', faction: 'galactic', cost: 1500, hp: 1100, speed: 4.6,
    build: { scale: 1.25, girth: 1.08, mass: 1.25 },
    weapon: {
      line: 'Elite · red energy sword · force push throws crowds back · force choke lifts one enemy', kind: 'ga_lord', style: 'twohand', anim: 'slam', item: 'ga_esword_red', damage: 75, reach: 1.6, cooldown: 0.85, force: 420, sweep: true, parry: 0.35, deflect: 0.55, reflect: 0.6,
      push: { r: 6.5, damage: 28, fling: 11, cd: 7 }, choke: { range: 13, dur: 2.6, dps: 34, lift: 1.5, cd: 9 },
    },
    look: { skin: '#d8c0b0', hat: 'ga_lord', top: 'ga_lord', legs: '#151517', accent: '#0e0e10', cape: true },
    personality: { aggro: 0.85, bravery: 0, voice: 0.55, chatter: 0.5, cry: 'magic', idle: 'regal' },
    armor: 0.3, stagger: 0.35,
    desc: 'Black armour, a red sword and a very bad temper. Throws people about without touching them.',
  },
  {
    id: 'ga_walker', name: 'Walker', faction: 'galactic', cost: 2600, hp: 4400, speed: 2.6,
    build: { scale: 1, radius: 2.6 },
    weapon: { line: 'Vehicle · four-legged walker · twin heavy cannons · tramples what gets underneath', kind: 'ga_walker', style: 'none', anim: 'punch', item: 'none', damage: 85, speed: 36, range: 34, minRange: 4, cooldown: 2.4, force: 700, spread: 0.025, blast: 2.0, reach: 2, heavy: true, stomp: { reach: 4.2, r: 2.2, damage: 60, fling: 7, cd: 1.6 } },
    look: { skin: WK_C.hull, hat: 'none', top: 'none', legs: WK_C.hull },
    personality: { aggro: 1, bravery: 0, voice: 0.4, chatter: 0.2, cry: 'charge', idle: 'thump' },
    armor: 0.35,
    desc: 'A slow four-legged war machine. Thick armour, big guns, heavy feet.',
  },
];

// ------------------------------------------------------------------ visuals: items
const BLADE = ['#9ff4ff', '#a8ff9a', '#fff27a', '#7affb0'], BLADE_RED = '#ff5a4a';
function energyBlade(H, s, g, col, L) {
  const { mesh, cyl, sphere, mat, glow } = H;
  const steel = mat('#b8bec6', { spec: 1 }), grip = mat('#26262a', { spec: 0.4 });
  // the hilt
  mesh(cyl(0.032 * s, 0.03 * s, 0.26 * s, 10), steel, 0, 0.06 * s, 0, g);
  for (const y of [-0.02, 0.03, 0.08]) mesh(cyl(0.035 * s, 0.035 * s, 0.018 * s, 10), grip, 0, y * s, 0, g);
  mesh(cyl(0.042 * s, 0.034 * s, 0.05 * s, 10), steel, 0, 0.2 * s, 0, g);
  mesh(sphere(0.014 * s, 6, 4), glow('#ff4a3a'), 0.03 * s, 0.12 * s, 0.012 * s, g).castShadow = false;
  // the blade: a bright core in a glowing sleeve, rounded at the tip
  const y0 = 0.23 * s, len = L * s - y0;
  const b0 = mesh(cyl(0.034 * s, 0.034 * s, len, 10), mat(col, { emit: 1, spec: 0.2 }), 0, y0 + len / 2, 0, g); b0.castShadow = false;
  const b1 = mesh(sphere(0.034 * s, 10, 6), mat(col, { emit: 1, spec: 0.2 }), 0, y0 + len, 0, g); b1.castShadow = false;
  const c0 = mesh(cyl(0.016 * s, 0.016 * s, len * 1.01, 6), mat('#ffffff', { emit: 1, spec: 0 }), 0, y0 + len / 2, 0.022 * s, g); c0.castShadow = false;
}
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, glow } = H;
  const blk = mat('#2a2b30', { spec: 0.5 }), dk = mat('#47494f', { spec: 0.7 });
  switch (name) {
    case 'ga_esword': energyBlade(H, s, g, BLADE[team], 1.15); return true;
    case 'ga_esword_red': energyBlade(H, s, g, BLADE_RED, 1.3); return true;
    case 'ga_droid_gun': { // along +Y: barrel forward, grip down (-Z)
      const tan = mat('#a89466', { spec: 0.4 });
      mesh(cyl(0.018 * s, 0.02 * s, 0.5 * s, 6), dk, 0, 0.2 * s, 0.03 * s, g);
      mesh(box(0.04 * s, 0.22 * s, 0.06 * s), tan, 0, 0.0, 0.02 * s, g);
      mesh(box(0.03 * s, 0.14 * s, 0.05 * s), tan, 0, -0.14 * s, 0.0, g).rotation.x = -0.25;
      mesh(box(0.03 * s, 0.05 * s, 0.1 * s), dk, 0, -0.01 * s, -0.05 * s, g).rotation.x = 0.3;
      mesh(cyl(0.024 * s, 0.024 * s, 0.03 * s, 6), dk, 0, 0.45 * s, 0.03 * s, g);
      return true;
    }
    case 'ga_rifle': {
      mesh(box(0.06 * s, 0.42 * s, 0.09 * s), blk, 0, 0.08 * s, 0.01 * s, g); // body
      mesh(cyl(0.024 * s, 0.024 * s, 0.32 * s, 8), blk, 0, 0.44 * s, 0.03 * s, g); // barrel
      for (const y of [0.33, 0.4, 0.47]) mesh(cyl(0.032 * s, 0.032 * s, 0.02 * s, 8), dk, 0, y * s, 0.03 * s, g); // cooling rings
      mesh(cyl(0.02 * s, 0.02 * s, 0.16 * s, 8), dk, 0, 0.12 * s, 0.08 * s, g); // sight
      mesh(box(0.04 * s, 0.16 * s, 0.06 * s), blk, 0, -0.22 * s, -0.01 * s, g); // stock
      mesh(box(0.035 * s, 0.05 * s, 0.11 * s), blk, 0, -0.01 * s, -0.07 * s, g).rotation.x = 0.35; // grip
      mesh(box(0.025 * s, 0.07 * s, 0.07 * s), dk, 0, 0.12 * s, -0.06 * s, g); // power cell
      mesh(sphere(0.02 * s, 6, 4), glow('#ff7a5a'), 0, 0.6 * s, 0.03 * s, g).castShadow = false;
      return true;
    }
    case 'ga_pistol': {
      mesh(box(0.05 * s, 0.2 * s, 0.07 * s), blk, 0, 0.08 * s, 0.03 * s, g);
      mesh(cyl(0.022 * s, 0.026 * s, 0.18 * s, 8), dk, 0, 0.24 * s, 0.04 * s, g);
      mesh(cone(0.034 * s, 0.05 * s, 8), dk, 0, 0.34 * s, 0.04 * s, g).rotation.x = PI;
      mesh(box(0.04 * s, 0.05 * s, 0.13 * s), blk, 0, -0.01 * s, -0.04 * s, g).rotation.x = 0.3;
      mesh(sphere(0.015 * s, 6, 4), glow('#ff7a5a'), 0, 0.15 * s, 0.075 * s, g).castShadow = false;
      return true;
    }
    case 'ga_xbow': { // a crossbow-shaped blaster: wooden stock, metal limbs, a glowing coil
      const wd = mat('#6a4a2e', { spec: 0.1 }), mt = mat('#8a8e96', { spec: 0.8 });
      mesh(box(0.07 * s, 0.75 * s, 0.1 * s), wd, 0, 0.12 * s, 0, g);
      mesh(box(0.06 * s, 0.2 * s, 0.14 * s), wd, 0, -0.32 * s, -0.03 * s, g);
      mesh(cyl(0.03 * s, 0.03 * s, 0.35 * s, 8), mt, 0, 0.6 * s, 0.04 * s, g);
      for (const sd of [-1, 1]) {
        const l = mesh(box(0.34 * s, 0.035 * s, 0.035 * s), mt, sd * 0.18 * s, 0.55 * s, 0.04 * s, g); l.rotation.z = sd * -0.35;
        mesh(sphere(0.03 * s, 6, 4), mt, sd * 0.34 * s, 0.49 * s, 0.04 * s, g);
      }
      mesh(cyl(0.004 * s, 0.004 * s, 0.66 * s, 3), mat('#d8d8d0'), 0, 0.49 * s, 0.04 * s, g).rotation.z = PI / 2;
      for (const y of [0.2, 0.28, 0.36]) mesh(cyl(0.04 * s, 0.04 * s, 0.03 * s, 8), glow('#ffb04a'), 0, y * s, 0.07 * s, g).castShadow = false;
      mesh(box(0.05 * s, 0.06 * s, 0.13 * s), wd, 0, -0.02 * s, -0.08 * s, g).rotation.x = 0.35;
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ visuals: heads
function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'ga_droid': { // a long narrow snout of a head, little dark eyes, team stripe
      const tan = mat(DROID, { spec: 0.45 }), dk = mat('#6e5e3e', { spec: 0.4 });
      mesh(sphere(r * 1.04, 14, 10), tan, 0, r * 0.1, -r * 0.1, g).scale.set(0.9, 0.95, 1.1);
      const sn = mesh(H.capsule(r * 0.5, r * 1.7), tan, 0, -r * 0.25, r * 1.05, g); sn.rotation.x = PI / 2 + 0.45;
      mesh(sphere(r * 0.38, 10, 8), dk, 0, -r * 0.7, r * 1.75, g).scale.set(1.1, 0.7, 0.8); // the muzzle
      for (const sd of [-1, 1]) {
        mesh(sphere(r * 0.24, 8, 6), dk, sd * r * 0.42, r * 0.22, r * 0.78, g);
        mesh(sphere(r * 0.12, 6, 5), glow('#ffb03a'), sd * r * 0.47, r * 0.24, r * 0.95, g).castShadow = false;
      }
      mesh(box(r * 0.3, r * 0.08, r * 2.0), tc, 0, r * 0.98, r * 0.15, g).rotation.x = -0.2;
      mesh(cyl(r * 0.05, r * 0.05, r * 0.6, 4), dk, -r * 0.45, r * 0.9, -r * 0.3, g);
      g.userData.hidesFace = true;
      return true;
    }
    case 'ga_trooper': { // round white helmet: dark visor band, brow ridge, team stripe
      const wh = mat(ARMOR, { spec: 0.75 }), bk = mat('#1d1e22', { spec: 0.9 });
      mesh(sphere(r * 1.1, 18, 14), wh, 0, r * 0.05, 0, g);
      const vis = mesh(H.geo('gavisor' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.13, 18, 6, PI / 2 - 0.95, 1.9, PI * 0.4, PI * 0.17)), bk, 0, r * 0.05, 0, g);
      vis.castShadow = false;
      mesh(box(r * 1.5, r * 0.16, r * 0.4), wh, 0, r * 0.55, r * 0.85, g).rotation.x = 0.35;
      mesh(box(r * 0.22, r * 0.12, r * 1.9), tc, 0, r * 1.13, 0, g).rotation.x = 0.05;
      for (const sd of [-1, 1]) {
        const e = mesh(cyl(r * 0.32, r * 0.32, r * 0.14, 12), wh, sd * r * 1.06, -r * 0.05, -r * 0.05, g); e.rotation.z = PI / 2;
        mesh(cyl(r * 0.16, r * 0.16, r * 0.16, 8), bk, sd * r * 1.12, -r * 0.05, -r * 0.05, g).rotation.z = PI / 2;
      }
      for (let i = -1; i <= 1; i++) mesh(box(r * 0.08, r * 0.28, r * 0.08), bk, i * r * 0.18, -r * 0.62, r * 0.88, g); // breath vents
      mesh(box(r * 0.9, r * 0.12, r * 0.3), wh, 0, -r * 0.82, r * 0.62, g).rotation.x = -0.4;
      g.userData.hidesFace = true;
      return true;
    }
    case 'ga_knight': { // short brown hair, a little braid behind one ear
      const hair = mat('#5a3a22', { spec: 0.15 });
      mesh(H.geo('gahair' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.05, 18, 10, PI / 2 + 1.1, PI * 2 - 2.2, 0, PI * 0.6)), hair, 0, r * 0.05, -r * 0.02, g);
      mesh(sphere(r * 0.75, 12, 8), hair, 0, r * 0.62, r * 0.02, g).scale.set(1.3, 0.48, 1.25);
      const br = mesh(H.capsule(r * 0.07, r * 0.7), hair, -r * 0.62, -r * 0.45, -r * 0.55, g); br.rotation.x = 0.3;
      mesh(sphere(r * 0.08, 6, 5), tc, -r * 0.62, -r * 0.92, -r * 0.42, g);
      return true;
    }
    case 'ga_fur': { // fur all round the face, tufts on top
      const f1 = mat('#7a5232', { spec: 0 }), f2 = mat('#5e3e24', { spec: 0 });
      mesh(hoodGeo(H, r, 1.14, 1.15), f1, 0, r * 0.05, -r * 0.06, g);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * PI * 2, y = Math.sin(i * 1.7) * 0.4;
        const t = mesh(cone(r * 0.2, r * 0.45, 5), i % 2 ? f1 : f2, Math.sin(a) * r * 1.02, r * (0.35 + y * 0.5), Math.cos(a) * r * 0.9 - r * 0.15, g);
        t.lookAt(Math.sin(a) * 9, (0.35 + y) * 6, Math.cos(a) * 9); t.rotateX(PI / 2);
      }
      for (const sd of [-1, 0, 1]) { const t = mesh(cone(r * 0.22, r * 0.55, 5), f2, sd * r * 0.35, r * 1.05, -r * 0.1, g); t.rotation.z = -sd * 0.5; }
      for (const sd of [-1, 1]) { const m = mesh(sphere(r * 0.3, 8, 6), f1, sd * r * 0.42, -r * 0.62, r * 0.68, g); m.scale.set(1, 0.7, 0.7); } // fluffy cheeks
      return true;
    }
    case 'ga_hunter': { // dented metal helmet, a narrow visor slit, team stripe, a lamp
      const hm = mat('#6e7a6a', { spec: 0.8 }), bk = mat('#141518', { spec: 1 });
      mesh(sphere(r * 1.1, 18, 14), hm, 0, r * 0.05, 0, g);
      mesh(H.geo('gahvis' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.13, 18, 4, PI / 2 - 0.7, 1.4, PI * 0.43, PI * 0.1)), bk, 0, r * 0.05, 0, g).castShadow = false;
      for (const sd of [-1, 1]) mesh(box(r * 0.5, r * 0.1, r * 0.1), mat('#4a5246', { spec: 0.6 }), sd * r * 0.4, -r * 0.45, r * 0.95, g).rotation.z = sd * 0.3; // cheek plates
      mesh(box(r * 0.3, r * 0.14, r * 2.1), tc, 0, r * 1.08, -r * 0.05, g).rotation.x = 0.1;
      mesh(cyl(r * 0.14, r * 0.14, r * 0.3, 8), hm, r * 1.05, r * 0.2, r * 0.2, g).rotation.z = PI / 2;
      mesh(sphere(r * 0.1, 6, 5), glow('#ff4a3a'), r * 1.2, r * 0.2, r * 0.2, g).castShadow = false;
      mesh(octa(r * 0.12), hm, -r * 0.7, r * 0.75, r * 0.6, g); // a dent
      g.userData.hidesFace = true;
      return true;
    }
    case 'ga_lord': { // glossy black helm with a crest of spikes and red eye slits
      const bk = mat('#151517', { spec: 1 }), dk = mat('#2a2a30', { spec: 0.9 });
      mesh(sphere(r * 1.1, 18, 14), bk, 0, r * 0.05, 0, g).scale.set(1, 1.05, 1.05);
      mesh(cyl(r * 0.95, r * 1.05, r * 0.5, 16), dk, 0, -r * 0.85, -r * 0.05, g); // high collar
      const vz = mesh(H.geo('galvis' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.14, 18, 4, PI / 2 - 0.8, 1.6, PI * 0.46, PI * 0.07)), glow('#ff2a20'), 0, r * 0.05, 0, g);
      vz.castShadow = false;
      mesh(box(r * 0.14, r * 0.55, r * 0.12), dk, 0, -r * 0.25, r * 1.08, g); // nose guard
      mesh(box(r * 0.1, r * 0.22, r * 1.3), dk, 0, r * 1.07, -r * 0.1, g); // crest
      for (const sd of [-1, 1]) { // swept-back horns
        mesh(tube(H, 'galh' + r.toFixed(3) + sd, [[sd * 0.8, 0.45, 0.25], [sd * 1.25, 0.95, 0.0], [sd * 1.35, 1.6, -0.45]].map((q) => q.map((x) => x * r)), r * 0.2, r * 0.03), bk, 0, 0, 0, g);
      }
      g.userData.hidesFace = true;
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ visuals: bodies
// limb overlays: a capsule over each listed part, optional joint balls
function limbs(H, vis, list, m, k = 1.12, balls = null) {
  for (const p of list) {
    const sp = vis.skel.parts[p];
    H.mesh(H.capsule(sp.r * k, sp.hh * 2), m, 0, 0, 0, vis.parts[p]);
    if (balls) H.mesh(H.sphere(sp.r * k * 1.2, 8, 6), balls, 0, sp.hh, 0, vis.parts[p]);
  }
}
const ARMS = [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR];
const LEGS = [PART.thighL, PART.shinL, PART.thighR, PART.shinR];
const glove = (H, vis, m) => { for (const p of [PART.farmL, PART.farmR]) { const sp = vis.skel.parts[p]; H.mesh(H.sphere(sp.r * 1.55, 10, 8), m, 0, -sp.hh - sp.r * 0.25, 0, vis.parts[p]).scale.set(1, 1.05, 1.1); } };
function skirt(H, vis, m, k = 2.6, flare = 1.6) {
  const pel = vis.skel.parts[PART.pelvis];
  const sk = H.mesh(H.cyl(pel.r * 1.12, pel.r * flare, pel.r * k, 16), m, 0, -pel.r * k * 0.42, 0, vis.parts[PART.pelvis]);
  sk.scale.set(1, 1, 0.95);
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'galactic') return;
  if (def.id === 'ga_walker') {
    // the pilot ragdoll is hidden inside the hull
    for (const g of vis.parts) g.clear();
    for (const l of beastLayout(WALKER)) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
    return;
  }
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, glow, leather } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  if (top === 'ga_droid') { // a thin tin frame: narrow chest box, team plate, backpack, bony limbs
    const tan = mat(DROID, { spec: 0.45 }), dk = mat('#8a7a56', { spec: 0.4 });
    chestShell(H, ch, dk, C, 1.02);
    mesh(box(r * 1.9, (hh + r) * 1.15, r * 1.3), tan, 0, hh * 0.35, 0, C);
    mesh(box(r * 1.1, r * 0.8, r * 0.1), tc, 0, hh * 0.45, r * 0.7, C);
    for (const sd of [-1, 1]) mesh(sphere(r * 0.42, 8, 6), tan, sd * r * 1.05, hh + r * 0.1, 0, C);
    mesh(box(r * 1.2, (hh + r) * 0.9, r * 0.5), tan, 0, hh * 0.25, -r * 0.85, C);
    mesh(cyl(r * 0.25, r * 0.25, (hh + r) * 1.2, 6), dk, 0, -hh * 0.6, 0, C); // the spine
    limbs(H, vis, ARMS, tan, 1.25, dk);
    limbs(H, vis, LEGS, tan, 1.0, dk);
    return;
  }
  if (top === 'ga_trooper') { // white plates over a black suit, team pauldron on one shoulder
    const wh = mat(ARMOR, { spec: 0.75 }), bk = mat('#1d1e22', { spec: 0.4 });
    chestShell(H, ch, bk, C);
    mesh(H.capsule(r * 1.2, hh * 1.4), wh, 0, hh * 0.25, r * 0.08, C).scale.set(1, 0.9, 0.85);
    mesh(box(r * 0.5, r * 0.3, r * 0.08), bk, 0, -hh * 0.2, r * 1.06, C);
    mesh(cyl(r * 1.16, r * 1.16, r * 0.24, 16), wh, 0, -hh - r * 0.38, 0, C);
    for (const x of [-0.55, 0, 0.55]) mesh(box(r * 0.3, r * 0.22, r * 0.2), wh, x * r, -hh - r * 0.38, r * 1.0, C);
    const pd = mesh(sphere(r * 0.5, 12, 8), tc, r * 0.98, hh + r * 0.15, 0, C); pd.scale.set(1, 0.6, 1);
    limbs(H, vis, ARMS, wh, 1.14);
    for (const p of [PART.uarmL, PART.uarmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.2, sp.r * 1.2, sp.r * 0.6, 10), bk, 0, -sp.hh, 0, parts[p]); }
    for (const p of [PART.shinL, PART.shinR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.12, sp.r * 1.12, sp.r * 0.6, 10), bk, 0, sp.hh, 0, parts[p]); }
    glove(H, vis, bk);
    return;
  }
  if (top === 'ga_robe') { // cream tunic, brown crossed wraps, a long brown robe skirt
    const cream = mat('#e0d2b0', { spec: 0.05 }), brown = mat('#6a4a2e', { spec: 0.05 });
    chestShell(H, ch, cream, C);
    for (const sd of [-1, 1]) { const w = mesh(box(r * 0.55, (hh + r) * 1.9, r * 0.06), brown, sd * r * 0.25, hh * 0.1, r * 1.08, C); w.rotation.z = sd * 0.42; }
    mesh(cyl(r * 1.15, r * 1.15, r * 0.3, 16), leather(), 0, -hh - r * 0.38, 0, C);
    mesh(box(r * 0.3, r * 0.22, r * 0.08), tc, 0, -hh - r * 0.38, r * 1.12, C);
    mesh(torus(H, r * 0.75, r * 0.2, PI * 2, 16), brown, 0, hh + r * 0.45, -r * 0.1, C).rotation.x = PI / 2; // hood down
    limbs(H, vis, ARMS, cream, 1.14);
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.4, sp.r * 1.8, sp.hh * 1.3, 10), brown, 0, -sp.hh * 0.2, 0, parts[p]); }
    skirt(H, vis, brown, 2.9, 1.7);
    return;
  }
  if (top === 'ga_fur') { // shaggy tufts everywhere, a bandolier with team pouches
    const f1 = mat('#7a5232', { spec: 0 }), f2 = mat('#5e3e24', { spec: 0 }), f3 = mat('#94683e', { spec: 0 });
    chestShell(H, ch, f1, C, 1.05);
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39996, y = (((i * 7) % 11) / 10 - 0.5) * (hh * 2 + r * 1.4);
      const t = mesh(cone(r * 0.2, r * 0.42, 5), [f1, f2, f3][i % 3], Math.sin(a) * r * 1.18, y, Math.cos(a) * r * 1.1, C);
      t.lookAt(Math.sin(a) * 9, y - 2, Math.cos(a) * 9); t.rotateX(PI / 2);
    }
    const band = mesh(box(r * 0.3, (hh + r) * 2.3, r * 0.08), leather(), 0, 0, r * 1.18, C); band.rotation.z = 0.6;
    const back = mesh(box(r * 0.3, (hh + r) * 2.3, r * 0.08), leather(), 0, 0, -r * 1.18, C); back.rotation.z = -0.6;
    for (const k of [-1, 0, 1]) mesh(box(r * 0.26, r * 0.22, r * 0.14), tc, -Math.sin(0.6) * k * r * 0.65, Math.cos(0.6) * k * r * 0.65, r * 1.26, C);
    for (const p of [...ARMS, ...LEGS, PART.pelvis]) {
      const sp = skel.parts[p];
      mesh(p === PART.pelvis ? sphere(sp.r * 1.12, 12, 8) : H.capsule(sp.r * 1.18, sp.hh * 2), f1, 0, 0, 0, parts[p]);
      for (let k = 0; k < (p === PART.pelvis ? 8 : 5); k++) {
        const a = k * 2.2 + p, y = p === PART.pelvis ? -sp.r * 0.3 : (k / 4 - 0.5) * sp.hh * 1.8;
        const t = mesh(cone(sp.r * 0.45, sp.r * 0.9, 4), [f1, f2, f3][k % 3], Math.sin(a) * sp.r * 1.15, y, Math.cos(a) * sp.r * 1.15, parts[p]);
        t.lookAt(Math.sin(a) * 9, y - 3, Math.cos(a) * 9); t.rotateX(PI / 2);
      }
    }
    return;
  }
  if (top === 'ga_hunter') { // dull armour plates, team pauldrons, a jetpack, a wrist launcher
    const ol = mat('#6e7a6a', { spec: 0.7 }), gr = mat('#4a4e44', { spec: 0.3 }), mt = mat('#8a8e96', { spec: 0.9 });
    chestShell(H, ch, gr, C);
    mesh(H.capsule(r * 1.18, hh * 1.2), ol, 0, hh * 0.3, r * 0.15, C).scale.set(1, 0.9, 0.8);
    for (const sd of [-1, 1]) { const pd = mesh(sphere(r * 0.52, 12, 8), tc, sd * r * 0.98, hh + r * 0.1, 0, C); pd.scale.set(1, 0.6, 1); }
    mesh(cyl(r * 1.16, r * 1.16, r * 0.24, 16), leather(), 0, -hh - r * 0.38, 0, C);
    for (const x of [-0.6, -0.2, 0.6]) mesh(box(r * 0.26, r * 0.26, r * 0.2), leather(), x * r, -hh - r * 0.42, r * 1.0, C);
    // jetpack: twin tanks, a nose cone each, nozzles under
    for (const sd of [-1, 1]) {
      mesh(cyl(r * 0.3, r * 0.3, (hh + r) * 1.4, 10), mt, sd * r * 0.38, hh * 0.1, -r * 1.35, C);
      mesh(cone(r * 0.3, r * 0.5, 10), tc, sd * r * 0.38, hh * 0.1 + (hh + r) * 0.7 + r * 0.25, -r * 1.35, C);
      mesh(cyl(r * 0.18, r * 0.26, r * 0.3, 8), mat('#2a2b30', { spec: 0.8 }), sd * r * 0.38, hh * 0.1 - (hh + r) * 0.7 - r * 0.12, -r * 1.35, C);
    }
    mesh(box(r * 0.5, (hh + r) * 1.1, r * 0.4), gr, 0, hh * 0.1, -r * 1.2, C);
    limbs(H, vis, ARMS, gr, 1.12);
    for (const p of [PART.uarmL, PART.uarmR, PART.thighL, PART.thighR, PART.shinL, PART.shinR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.3, sp.r * 1.25, sp.hh * 1.0, 10), ol, 0, 0, sp.r * 0.15, parts[p]); }
    const fl = skel.parts[PART.farmL];
    mesh(cyl(fl.r * 1.45, fl.r * 1.35, fl.hh * 1.3, 10), ol, 0, -fl.hh * 0.2, 0, parts[PART.farmL]);
    mesh(cyl(fl.r * 0.45, fl.r * 0.45, fl.hh * 1.2, 8), mat('#2a2b30'), fl.r * 0.9, -fl.hh * 0.2, fl.r * 0.9, parts[PART.farmL]); // rocket tube
    glove(H, vis, gr);
    return;
  }
  if (top === 'ga_lord') { // glossy black armour, a chest box with little lights, long robe
    const bk = mat('#151517', { spec: 1 }), mt = mat('#2a2a30', { spec: 0.9 }), cl = mat('#1d1d20', { spec: 0.1 });
    chestShell(H, ch, bk, C);
    mesh(box(r * 0.75, r * 0.5, r * 0.14), mt, 0, -hh * 0.05, r * 1.05, C);
    for (const [x, c] of [[-0.22, '#ff3a30'], [0, '#4aff6a'], [0.22, '#4ab8ff']]) mesh(box(r * 0.11, r * 0.09, r * 0.05), glow(c), x * r, -hh * 0.05, r * 1.13, C).castShadow = false;
    for (const sd of [-1, 1]) { const pd = mesh(sphere(r * 0.55, 12, 8), bk, sd * r * 0.98, hh + r * 0.12, 0, C); pd.scale.set(1, 0.65, 1); }
    mesh(cyl(r * 1.16, r * 1.16, r * 0.24, 16), mt, 0, -hh - r * 0.38, 0, C);
    mesh(box(r * 0.45, r * 0.3, r * 0.12), mat('#b8bec6', { spec: 1 }), 0, -hh - r * 0.38, r * 1.12, C);
    limbs(H, vis, ARMS, bk, 1.14);
    glove(H, vis, bk);
    skirt(H, vis, cl, 3.1, 1.75);
  }
}

// ------------------------------------------------------------------ visuals: walker
function wput(H, g, geo, m, p, r = null, s = null) {
  const o = H.mesh(geo, m, p[0], p[1], p[2], g);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  if (s) o.scale.set(s[0], s[1], s[2]);
  return o;
}
function walkerHull(H, team) {
  const g = new THREE.Group();
  const hl = H.mat(WK_C.hull, { spec: 0.55 }), dk = H.mat(WK_C.dark, { spec: 0.6 }), lt = H.mat(WK_C.light, { spec: 0.6 });
  const tc = tcol(H, team), td = tdark(H, team);
  wput(H, g, H.box(1.9, 0.95, 3.0), hl, [0, 0, -0.1]);
  wput(H, g, H.box(1.55, 0.32, 2.4), lt, [0, 0.6, -0.15]);
  wput(H, g, H.box(1.7, 0.28, 2.6), dk, [0, -0.58, -0.1]);
  wput(H, g, H.box(1.96, 0.16, 0.5), tc, [0, 0.18, -0.55]);
  wput(H, g, H.box(1.96, 0.16, 0.5), td, [0, 0.18, 0.15]);
  for (const sd of [-1, 1]) {
    wput(H, g, H.box(0.08, 0.5, 2.2), dk, [sd * 0.99, -0.05, -0.15]);
    for (const z of [-1.05, 1.05]) wput(H, g, H.cyl(0.3, 0.3, 0.42, 14), dk, [sd * 0.98, -0.3, z], [0, 0, PI / 2]); // hip joints
  }
  for (const x of [-0.45, 0.45]) { wput(H, g, H.cyl(0.16, 0.2, 0.3, 10), dk, [x, 0.1, -1.68], [PI / 2, 0, 0]); wput(H, g, H.cyl(0.11, 0.11, 0.05, 10), H.glow('#ff9a3a'), [x, 0.1, -1.84], [PI / 2, 0, 0]); }
  for (let i = 0; i < 4; i++) wput(H, g, H.box(0.3, 0.12, 0.18), dk, [-0.5 + (i % 2) * 0.9, 0.82, -0.9 + i * 0.4]); // vents
  wput(H, g, H.cyl(0.02, 0.02, 0.9, 4), dk, [0.6, 1.2, -1.0]);
  wput(H, g, H.sphere(0.05, 6, 4), H.glow('#ff4a3a'), [0.6, 1.66, -1.0]);
  wput(H, g, H.cyl(0.38, 0.45, 0.35, 14), dk, [0, 0.08, 1.35], [PI / 2, 0, 0]); // neck collar
  return g;
}
function walkerHead(H, team) {
  const g = new THREE.Group();
  const hl = H.mat(WK_C.hull, { spec: 0.55 }), dk = H.mat(WK_C.dark, { spec: 0.6 }), lt = H.mat(WK_C.light, { spec: 0.6 });
  wput(H, g, H.box(1.05, 0.78, 1.25), hl, [0, 0, 0.62]);
  wput(H, g, H.box(0.95, 0.25, 1.1), lt, [0, 0.45, 0.55]);
  const nose = wput(H, g, H.box(0.95, 0.5, 0.45), hl, [0, -0.08, 1.3]); nose.rotation.x = -0.35;
  wput(H, g, H.box(0.8, 0.09, 0.05), H.glow(WK_C.glass), [0, 0.12, 1.27]); // viewport slit
  wput(H, g, H.box(0.18, 0.1, 1.2), tcol(H, team), [0, 0.6, 0.5]);
  for (const sd of [-1, 1]) {
    wput(H, g, H.cyl(0.075, 0.09, 1.2, 10), dk, [sd * 0.3, -0.3, 1.35], [PI / 2, 0, 0]); // twin cannons
    wput(H, g, H.cyl(0.11, 0.11, 0.12, 10), dk, [sd * 0.3, -0.3, 1.9], [PI / 2, 0, 0]);
    wput(H, g, H.cyl(0.05, 0.05, 0.02, 8), H.glow('#ffd27a'), [sd * 0.3, -0.3, 1.97], [PI / 2, 0, 0]);
    wput(H, g, H.cyl(0.04, 0.04, 0.5, 8), dk, [sd * 0.58, 0.05, 1.05], [PI / 2, 0, 0]); // side guns
  }
  return g;
}
function walkerThigh(H) {
  const g = new THREE.Group();
  const hl = H.mat(WK_C.hull, { spec: 0.55 }), dk = H.mat(WK_C.dark, { spec: 0.6 });
  wput(H, g, H.box(0.3, 1.15, 0.42), hl, [0, -0.55, 0]);
  wput(H, g, H.cyl(0.06, 0.06, 0.9, 8), dk, [0, -0.55, 0.28]);
  wput(H, g, H.sphere(0.22, 12, 8), dk, [0, -1.15, 0]);
  return g;
}
function walkerShin(H, team) {
  const g = new THREE.Group();
  const hl = H.mat(WK_C.hull, { spec: 0.55 }), dk = H.mat(WK_C.dark, { spec: 0.6 });
  wput(H, g, H.box(0.26, 1.35, 0.34), hl, [0, -0.68, 0]);
  wput(H, g, H.box(0.28, 0.2, 0.36), tcol(H, team), [0, -0.3, 0]);
  // the foot stays roughly level: undo the leg's mean tilt
  const foot = new THREE.Group(); foot.position.set(0, -1.42, 0); foot.rotation.x = -0.35; g.add(foot);
  wput(H, foot, H.cyl(0.36, 0.42, 0.16, 14), dk, [0, -0.02, 0.05]);
  for (const x of [-0.18, 0, 0.18]) wput(H, foot, H.box(0.12, 0.08, 0.3), dk, [x, -0.06, 0.4]);
  return g;
}

// ------------------------------------------------------------------ visuals: projectiles
function buildProj(type, g, H) {
  const { mesh, cyl, sphere, cone, mat } = H;
  const bolt = /^ga_(bolt|heavy)([01])$/.exec(type);
  if (bolt) { // along +Y: a white-hot core in a team-coloured glow
    const heavy = bolt[1] === 'heavy', col = bolt[2] === '1' ? '#ff3a2a' : '#3ae0ff';
    const L = heavy ? 1.0 : 0.65, R = heavy ? 0.075 : 0.04;
    mesh(cyl(R * 0.45, R * 0.45, L, 6), mat('#ffffff', { emissive: '#ffffff' }), 0, 0, 0, g).castShadow = false;
    mesh(sphere(R * 0.5, 6, 4), mat('#ffffff', { emissive: '#ffffff' }), 0, L / 2, 0, g).castShadow = false;
    mesh(cyl(R, R, L * 1.05, 8), mat(col, { emissive: col, transparent: true, opacity: 0.75, depthWrite: false }), 0, 0, 0, g).castShadow = false;
    mesh(cyl(R * 2.2, R * 2.2, L * 1.2, 8), mat(col, { emissive: col, transparent: true, opacity: 0.22, depthWrite: false }), 0, -L * 0.05, 0, g).castShadow = false;
    return true;
  }
  if (type === 'ga_rocket') {
    mesh(cyl(0.035, 0.035, 0.3, 8), mat('#d8d8d0', { spec: 0.6 }), 0, 0, 0, g);
    mesh(cone(0.035, 0.1, 8), mat('#c8302a'), 0, 0.2, 0, g);
    for (let i = 0; i < 3; i++) { const f = mesh(H.box(0.004, 0.08, 0.05), mat('#4a4e54'), 0, -0.13, 0, g); f.rotation.y = (i / 3) * PI * 2; f.translateZ(0.035); }
    const fl = mesh(cone(0.05, 0.22, 8), mat('#ffb040', { emissive: '#ff8020', transparent: true, opacity: 0.8 }), 0, -0.26, 0, g); fl.rotation.x = PI; fl.castShadow = false;
    return true;
  }
  if (type === 'ga_wave') { // a pale ring travelling out from the outstretched hand
    const o = mesh(torus(H, 0.9, 0.09, PI * 2, 24), mat('#cfe6ff', { emissive: '#8fb8ff', transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0, g);
    o.rotation.x = PI / 2; o.castShadow = false;
    const o2 = mesh(torus(H, 0.55, 0.06, PI * 2, 20), mat('#e8f2ff', { emissive: '#bcd6ff', transparent: true, opacity: 0.25, depthWrite: false }), 0, -0.25, 0, g);
    o2.rotation.x = PI / 2; o2.castShadow = false;
    return true;
  }
  if (type === 'ga_flame') { // jetpack flames under the two nozzles (stuck to the chest)
    for (const sd of [-1, 1]) {
      const a = mesh(cone(0.08, 0.5, 8), mat('#ffb040', { emissive: '#ff7a20', transparent: true, opacity: 0.85, depthWrite: false }), sd * 0.09, -0.3, 0, g);
      a.rotation.x = PI; a.castShadow = false;
      const c = mesh(cone(0.04, 0.3, 6), mat('#fff2c0', { emissive: '#ffe6a0' }), sd * 0.09, -0.2, 0, g);
      c.rotation.x = PI; c.castShadow = false;
    }
    return true;
  }
  if (type === 'ga_grip') { // the force choke: a dark red glow round the neck
    const o = mesh(torus(H, 0.15, 0.035, PI * 2, 16), mat('#ff3a3a', { emissive: '#c01010', transparent: true, opacity: 0.8, depthWrite: false }), 0, 0, 0, g);
    o.rotation.x = PI / 2; o.castShadow = false;
    const o2 = mesh(torus(H, 0.2, 0.02, PI * 2, 16), mat('#ff8a8a', { emissive: '#ff4040', transparent: true, opacity: 0.4, depthWrite: false }), 0, 0.05, 0, g);
    o2.rotation.x = PI / 2; o2.castShadow = false;
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ register
// tab emblem until assets/ui/faction-galactic.png is delivered: a ringed planet behind
// a glowing energy sword
const ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="12" r="6.2" fill="#1d2a5a" stroke="#fff" stroke-width="1.2"/>'
  + '<ellipse cx="13" cy="12" rx="10.5" ry="3" fill="none" stroke="#fff" stroke-width="1.2" transform="rotate(-18 13 12)"/>'
  + '<line x1="6.5" y1="17.5" x2="20" y2="3.5" stroke="#4fe3ff" stroke-width="3" stroke-linecap="round"/><line x1="6.5" y1="17.5" x2="20" y2="3.5" stroke="#fff" stroke-width="1" stroke-linecap="round"/>'
  + '<line x1="3" y1="21" x2="6.6" y2="17.4" stroke="#2a2b30" stroke-width="3.2" stroke-linecap="round"/><circle cx="3.5" cy="4" r="1" fill="#fff"/><circle cx="21" cy="20" r="0.8" fill="#fff"/></svg>';
const BOLT = boltProj(false), HEAVY = boltProj(true);
register({
  factions: [{ id: 'galactic', name: 'Galactic', color: '#38b8e0', icon: ICON }],
  units,
  items: {
    ga_esword: { len: 1.15, r: 0.06, grip: 30, metal: true, mass: 1.0 },
    ga_esword_red: { len: 1.3, r: 0.07, grip: 25, metal: true, mass: 1.3 },
    ga_droid_gun: { len: 0.6, r: 0.04, grip: 90, back: 0.25, mass: 0.8 },
    ga_rifle: { len: 0.9, r: 0.05, grip: 90, back: 0.3, mass: 2.2 },
    ga_pistol: { len: 0.36, r: 0.05, grip: 90 },
    ga_xbow: { len: 1.0, r: 0.07, grip: 90, back: 0.35, mass: 4 },
  },
  kinds: { ga_blaster: blaster, ga_saber: saber, ga_hunter: hunter, ga_lord: lord, ga_walker: walker },
  proj: { ga_bolt0: BOLT, ga_bolt1: BOLT, ga_heavy0: HEAVY, ga_heavy1: HEAVY, ga_rocket: rocket, ga_wave: wave, ga_flame: { g: 0, len: 0, r: 0, life: 1 }, ga_grip: { g: 0, len: 0, r: 0, life: 1 } },
  buildItem, buildHat, decorate, buildProj,
});
