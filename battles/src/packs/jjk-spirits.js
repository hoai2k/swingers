// Jujutsu Kaisen: more curses and their allies (faction JJK Curses, side 'curse', on jjk-core.js),
// and three of Suguru Geto's spirits (summons: faction 'jjk_summon', no tab, cost 0 - Geto
// calls them out in battle, see jjk-curses.js).
//  - Kurourushi: the cockroach curse of the Sendai colony - a hard shell, bites that chew
//    (flesh-eating damage over time) and swarms of cockroaches that crawl over enemies
//  - Uraume: Sukuna's servant - Ice Formation: Frost Calm (a cold wave that freezes
//    everyone in front of them solid) and Icefall (ice dropped on a target; a frozen
//    victim shatters for double damage)
//  - Smallpox Deity: Kenjaku's disease curse - a pox cloud that sickens, and the grave:
//    a victim shut in a coffin while it counts to three, then buried
//  - Rainbow Dragon (Geto's spirit): a serpent with a near-unbreakable hide; it rams through lines
//  - Finger Bearer: the special grade of the detention centre - long arms, many eyes;
//    badly hurt, it swallows a Sukuna finger (heals, grows stronger)
//  - Kuchisake-onna (Geto's spirit): "Am I beautiful?" - the question dazes whoever it asks, then the
//    scissors cut deep
//  - Grasshopper Curse (Geto's spirit): huge leaps that land in a kick
//  - Yorozu: Sukuna's admirer - Construction: liquid metal blades, insect armour with
//    wings, and once a battle the True Sphere (a perfect sphere of mass) at the strongest
//    enemy
// Secret: Yorozu meets her beloved Sukuna on her own side.
// Everything drawn is a unit part, a projectile or a marker, so replays show it.
import { register } from '../ext.js';
import { aimTarget, leapSkill } from '../skills.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, aimPoint, launchVel, addProjectile,
  strike, handPos, torus, dome, tcol, tdark, chestShell, blast, addStatus, tube, slowBeast,
} from './common.js';
import { UPY } from './ges-core.js';
import { isJJK, jk, onSecret, announce, isA, burntOut, markerAt, markerOn } from './jjk-core.js';

const SUMMON = 'jjk_summon'; // Geto's spirits: not sold, they come out of Geto
const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Euler();
const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const foe = (u, v) => v && v.alive && !v.dormant && v.team !== u.team;
const ns = (m) => { m.castShadow = false; return m; };

// ------------------------------------------------------------------ helpers
// (copies of jjk-curses.js's private helpers)
function techBanner(b, text, pos, gap = 6) {
  const s = jk(b);
  s.jksT ??= {};
  if ((s.jksT[text] ?? -99) > b.time - gap) return;
  s.jksT[text] = b.time;
  announce(b, text, pos);
}
function castPose(u, anim, what = null) {
  u.st.attack = anim; u.st.attackT = 0; u.hitSet.clear(); u.released = false; u.jkCast = what;
}
function castEvent(u, t0, t1, table) {
  if (!u.jkCast || !crossed(t0, t1, 0.55)) return false;
  const w = u.jkCast;
  u.jkCast = null;
  u.released = true;
  table[w]?.(u);
  return true;
}
function newVictims(u, fn) {
  const st = u.st;
  if (!st.attack) { u.jkHN = 0; u.jkAT = 0; return; }
  if (st.attackT < (u.jkAT || 0)) u.jkHN = 0;
  u.jkAT = st.attackT;
  const n0 = u.jkHN || 0;
  if (u.hitSet.size <= n0) return;
  let i = 0;
  for (const v of u.hitSet) { if (i++ < n0) continue; if (v && v.rag) fn(v); }
  u.jkHN = u.hitSet.size;
}
function enemiesNear(u, p, R) {
  const out = [];
  u.battle.grid.query(p.x, p.z, R + 1, (v) => { if (foe(u, v) && flat(v.pos, p) < R + v.skel.radius) out.push(v); });
  return out;
}
function markSpin(b, type, pos, t) {
  const s = markerAt(b, type, pos, t);
  s.quat.setFromEuler(_e.set(rand(-1.2, 1.2), rand(0, Math.PI * 2), rand(-1.2, 1.2)));
  return s;
}
function home(pr, dt, speed, turn) {
  const t = pr.tgt;
  if (!t || !t.alive) return;
  const c = t.chestPos;
  _d.set(c.x - pr.pos.x, c.y - pr.pos.y, c.z - pr.pos.z);
  const L = _d.length();
  if (L < 1e-3) return;
  _d.multiplyScalar(speed / L);
  pr.vel.lerp(_d, Math.min(1, turn * dt));
}
const busy = (u) => u.st.attack || u.stun > 0.2 || u.isDown() || u.battle.over || u.jkSealedT > u.battle.time;
// a leap at (dirx, dirz): k forward, up upward (both per unit of mass)
function leap(u, dirx, dirz, k, up) {
  u.rag.impulseAll(dirx * u.M * k, u.M * up, dirz * u.M * k);
  u.battle.emit('dust', u.pos.x, u.pos.y - u.skel.standHeight, u.pos.z, 2);
  u.battle.sound('whoosh', u.pos, 0.7, 0.9);
}
// the finger: extra damage on every blow that lands
const buffed = (u) => (u.jkBuffT || 0) > u.battle.time;
function bonusBlows(u, k, kind) {
  newVictims(u, (v) => { if (k > 0 && v.alive) v.hit(u.def.weapon.damage * k, PART.chest, 0, 0, 0, u, kind); });
}
// freeze v solid for t seconds (Uraume): stunned, slowed, an ice block round it
function freeze(b, v, t, owner) {
  if (!v.alive || v.jkSealedT > b.time) return;
  t *= 0.5 + 0.5 * clamp(v.def.stagger ?? 1, 0, 1);
  v.stun = Math.max(v.stun, t);
  v.st.attack = null;
  v.jkFrozeT = Math.max(v.jkFrozeT || 0, b.time + t);
  addStatus(b, v, 'slow', t + 1.5, 0, owner);
  slowBeast(v, 0.15, t);
  if (!v.jkIceMk || v.jkIceMk.t <= 0) v.jkIceMk = markerOn(b, v, 'jk_iceblock', PART.chest, t);
  else v.jkIceMk.t = Math.max(v.jkIceMk.t, t);
}
const frozen = (v) => (v.jkFrozeT || 0) > v.battle.time;

// ------------------------------------------------------------------ Kurourushi
// Melee. Its bites chew (rot that eats flesh over time, roaches left crawling on the
// wound); every few seconds it lets loose a swarm of cockroaches that home in on the
// nearest enemies and nibble. The shell takes the edge off blows (armor).
const kurourushi = {
  melee: true,
  init(u) { u.jkSw = u.def.weapon.swFirst; },
  think: meleeThink,
  event(u, t0, t1) { castEvent(u, t0, t1, { swarm: roachSwarm }); },
  // possessed (src/skills.js): RT bites; the swarm and a leap on buttons
  basic: 'Chew',
  skills: [
    { key: 'rb', name: 'The Swarm', icon: '🪳', cd: (u) => u.jkSw, max: (u) => u.def.weapon.swCD,
      use(u) { u.jkSw = u.def.weapon.swCD; castPose(u, 'jj_shout', 'swarm'); techBanner(u.battle, 'Kurourushi: the swarm!', u.headPos, 10); return true; } },
    leapSkill('lb'),
  ],
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    newVictims(u, (v) => { if (u.jkCast) return; addStatus(b, v, 'poison', w.chewT, w.chewDps, u); crawl(b, v, w.chewT); });
    u.jkSw -= dt;
    if (u.jkSw > 0 || u.control) return;
    u.cooldown = Math.max(u.cooldown, 0.2); // (holds the next bite so the swarm gets a window)
    if (busy(u)) return;
    const t = u.target && u.target.alive ? u.target : null;
    if (t && flat(t.pos, u.pos) < w.swRange) {
      u.jkSw = w.swCD * rand(0.85, 1.15);
      castPose(u, 'jj_shout', 'swarm');
      techBanner(b, 'Kurourushi: the swarm!', u.headPos, 10);
    } else u.jkSw = 0.4;
  },
};
function crawl(b, v, t) {
  if (!v.alive) return;
  if (v.jkRoachMk && v.jkRoachMk.t > 0) { v.jkRoachMk.t = Math.max(v.jkRoachMk.t, t); return; }
  v.jkRoachMk = markerOn(b, v, 'jk_roaches', PART.chest, t);
}
function roachSwarm(u) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos;
  const foes = enemiesNear(u, u.pos, w.swRange);
  foes.sort((a, z) => flat(a.pos, u.pos) - flat(z.pos, u.pos));
  if (!foes.length && u.target?.alive) foes.push(u.target);
  if (!foes.length) return;
  for (let i = 0; i < w.roaches; i++) {
    const tgt = foes[i % Math.min(foes.length, 4)];
    _o.set(c.x + rand(-0.5, 0.5), c.y + rand(-0.2, 0.5), c.z + rand(-0.5, 0.5));
    _v.set(rand(-3, 3), rand(3, 6), rand(-3, 3));
    addProjectile(b, 'jk_roach', _o, _v, u, { life: 4, tgt, spd: w.swSpeed, damage: w.roachDmg, force: 30 });
  }
  b.sound('pop', c, 0.8, 1.6);
  b.sound('whoosh', c, 0.6, 1.8);
  b.emit('dust', c.x, c.y - 0.6, c.z, 2);
}

// ------------------------------------------------------------------ Uraume
// Ranged. Icefall drops a block of ice out of the sky on its target (a frozen victim
// shatters for double damage); Frost Calm, a cold wave in front of it, freezes everyone
// it catches solid for a couple of seconds.
const uraume = {
  aim: true,
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.jkFC = w.fcFirst; },
  think: rangedThink,
  basic: 'Shove', ranged: 'Icefall',
  skills: [
    { key: 'rb', name: 'Frost Calm', icon: '❄', cd: (u) => u.jkFC, max: (u) => u.def.weapon.fcCD, ready: (u) => !burntOut(u) || 'burnt out',
      use(u) { u.jkFC = u.def.weapon.fcCD; castPose(u, 'jk_push', 'frost'); techBanner(u.battle, 'Ice Formation: Frost Calm', u.headPos, 8); return true; } },
  ],
  event(u, t0, t1) {
    if (castEvent(u, t0, t1, { frost: frostCalm })) return;
    const w = u.def.weapon, b = u.battle;
    if (u.st.attack !== u.anim || !crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    aimPoint(u, _p, 0.8, 1.1);
    _p.y = b.terrain.height(_p.x, _p.z);
    _o.set(_p.x + rand(-0.4, 0.4), _p.y + w.dropH, _p.z + rand(-0.4, 0.4));
    addProjectile(b, 'jk_icefall', _o, _v.set(0, -w.dropV, 0), u, { life: 3, spin: new THREE.Vector3(rand(-1, 1), rand(-2, 2), rand(-1, 1)) });
    const h = handPos(u, _o);
    b.emit('spark', h.x, h.y, h.z, 3);
    b.sound('magic', h, 0.6, 1.5);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkFC -= dt;
    if (u.jkFC > 0 || u.control || busy(u) || burntOut(u)) return;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    let n = 0;
    for (const v of enemiesNear(u, u.pos, w.fcR)) {
      const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
      if ((dx * fx + dz * fz) / d > w.fcCos) n++;
    }
    if (n >= 1) {
      u.jkFC = w.fcCD * rand(0.9, 1.1);
      castPose(u, 'jk_push', 'frost');
      techBanner(b, 'Ice Formation: Frost Calm', u.headPos, 8);
    } else u.jkFC = 0.3;
  },
};
function frostCalm(u) {
  const b = u.battle, w = u.def.weapon, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  for (const v of enemiesNear(u, u.pos, w.fcR)) {
    const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    if ((dx * fx + dz * fz) / d <= w.fcCos) continue;
    v.hit(w.fcDmg, PART.chest, fx * 30, 10, fz * 30, u, 'jk_frost');
    freeze(b, v, w.fcFreeze, u);
  }
  _o.copy(u.pos); _o.y = b.terrain.height(_o.x, _o.z) + 0.05;
  markerAt(b, 'jk_frostwave', _o, 0.9, u.heading);
  const c = u.chestPos;
  b.emit('spark', c.x + fx * 2, c.y, c.z + fz * 2, 8);
  b.sound('whoosh', c, 1.1, 0.6);
  b.sound('magic', c, 0.9, 0.7);
}
function iceImpact(b, pr) {
  if (pr.done) return;
  pr.done = true;
  const o = pr.owner, w = o.def.weapon;
  const gy = b.terrain.height(pr.pos.x, pr.pos.z);
  _o.set(pr.pos.x, Math.max(pr.pos.y, gy + 0.4), pr.pos.z);
  blast(b, _o, w.iceR, w.damage, w.force, o.alive ? o : null, {
    fx: -1, friendly: 0.2, sound: 'crash', vol: 0.7, pitch: 1.5,
    onUnit: (v) => {
      if (frozen(v)) { // the ice block shatters, and the victim with it
        v.hit(w.damage * w.shatter, PART.chest, 0, 0, 0, o.alive ? o : null, 'jk_shatter');
        v.jkFrozeT = 0;
        if (v.jkIceMk) v.jkIceMk.t = 0;
        b.emit('spark', v.chestPos.x, v.chestPos.y, v.chestPos.z, 6);
      }
      addStatus(b, v, 'slow', 2, 0, o);
    },
  });
  markSpin(b, 'jk_iceshards', _o.set(pr.pos.x, gy + 0.1, pr.pos.z), 0.8).quat.setFromAxisAngle(UPY, rand(0, 6));
  b.emit('dust', pr.pos.x, gy, pr.pos.z, 2);
}

// ------------------------------------------------------------------ Smallpox Deity
// A slow, heavy grave of a curse. A pox cloud sickens enemies around it. Its technique
// shuts its target in a coffin and counts to three: unless the victim breaks out (a
// strong one may; a blow that knocks the curse down sets it free), the lid closes and
// the victim is buried. Sorcerers without cursed energy are never caught.
const smallpox = {
  melee: true,
  init(u) { u.jkPox = 1; u.jkGrave = u.def.weapon.graveFirst; u.jkCof = null; },
  think: meleeThink,
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.jkPox -= dt;
    if (u.jkPox <= 0) {
      u.jkPox = 1;
      for (const v of enemiesNear(u, u.pos, w.poxR)) addStatus(b, v, 'poison', 3, w.poxDps, u);
      if (Math.random() < 0.5) { const c = u.chestPos; b.emit('dust', c.x + rand(-1, 1), c.y, c.z + rand(-1, 1), 1); }
    }
    if (u.jkCof) { stepCoffin(u, dt); return; }
    u.jkGrave -= dt;
    if (u.jkGrave > 0 || u.control || busy(u) || burntOut(u)) return;
    // the strongest enemy in reach that has cursed energy
    let best = null;
    for (const v of enemiesNear(u, u.pos, w.graveR)) {
      if (!coffinable(b, v)) continue;
      if (!best || v.def.cost > best.def.cost) best = v;
    }
    if (!best) { u.jkGrave = 0.5; return; }
    grave(u, best);
  },
  // possessed (src/skills.js): the coffin for the enemy under the crosshair
  basic: 'Slam',
  skills: [
    { key: 'lb', name: 'The Grave', icon: '⚰', cd: (u) => (u.jkCof ? 99 : u.jkGrave), max: (u) => u.def.weapon.graveCD,
      ready: (u) => (burntOut(u) ? 'burnt out' : graveTarget(u) ? true : 'no one to bury'),
      use(u) { const v = graveTarget(u); if (!v) return false; grave(u, v); return true; } },
  ],
  hit(u, amount) {
    if (u.jkCof) u.jkCof.dmg += amount;
    return amount;
  },
  die(u) { releaseCoffin(u, false); },
};
// (no cursed energy, Infinity, the Prison Realm or a coffin already: it can't be buried)
const coffinable = (b, v) => !(v.jkNoCE || v.jkInfinity || isA(v, 'jk_gojo') || v.jkSealedT > b.time || v.jkCoffin);
function graveTarget(u) {
  const v = aimTarget(u, u.def.weapon.graveR, 4);
  return v && coffinable(u.battle, v) ? v : null;
}
function grave(u, best) {
  const b = u.battle, w = u.def.weapon;
  u.jkGrave = w.graveCD;
  castPose(u, 'jk_sign', null);
  const strong = clamp((best.maxHp - w.breakHp) / 1500, 0, 0.6);
  u.jkCof = { v: best, t: 0, n: 0, dmg: 0, breaks: Math.random() < strong, mk: markerOn(b, best, 'jk_coffin', PART.pelvis, w.countT + 0.6) };
  best.jkCoffin = true;
  techBanner(b, 'Smallpox Deity: the grave!', best.headPos, 4);
  b.sound('gong', best.chestPos, 0.8, 0.5);
  b.sound('thump', best.chestPos, 1.0, 0.6);
}
function stepCoffin(u, dt) {
  const b = u.battle, w = u.def.weapon, cf = u.jkCof, v = cf.v;
  if (!v.alive || !u.alive) { releaseCoffin(u, false); return; }
  // shut in: no moving, no fighting
  v.stun = Math.max(v.stun, 0.3);
  v.st.attack = null;
  v.desired?.set(0, 0, 0);
  cf.t += dt;
  const step = w.countT / 3;
  if (cf.t >= step * (cf.n + 1) && cf.n < 3) {
    cf.n++;
    techBanner(b, ['One...', 'Two...', 'Three!'][cf.n - 1], v.headPos, 0.5);
    b.sound('tick', v.headPos, 1.0, 0.7);
    if (cf.n === 2 && cf.breaks) { breakOut(u, `${v.def.name} breaks out of the coffin!`); return; }
  }
  if (cf.dmg > w.breakDmg || u.stun > 0.6) { breakOut(u, 'The coffin cracks open!'); return; }
  if (cf.n >= 3) {
    // the lid comes down: buried
    const c = v.chestPos;
    markerOn(b, v, 'jk_coffinlid', PART.pelvis, 0.8);
    b.sound('crash', c, 1.0, 0.5);
    b.emit('dust', c.x, c.y - 0.6, c.z, 5);
    v.hit(w.buryDmg, PART.chest, 0, -v.M * 0.5, 0, u, 'domain');
    releaseCoffin(u, true);
  }
}
function breakOut(u, text) {
  const b = u.battle, v = u.jkCof.v;
  techBanner(b, text, v.headPos, 3);
  b.sound('debris', v.chestPos, 0.9, 0.9);
  b.emit('spark', v.chestPos.x, v.chestPos.y, v.chestPos.z, 6);
  releaseCoffin(u, true);
}
function releaseCoffin(u) {
  const cf = u.jkCof;
  if (!cf) return;
  u.jkCof = null;
  cf.v.jkCoffin = false;
  cf.v.stun = Math.min(cf.v.stun, 0.3);
  if (cf.mk) cf.mk.t = 0;
}

// ------------------------------------------------------------------ Rainbow Dragon
// A tank: rainbow scales shrug off most of every blow (armor). It bites up close and,
// every few seconds, rams at a target some way off, bowling over everyone on the way.
const dragon = {
  melee: true,
  init(u) { u.jkRam = rand(1, 2.5); u.jkRamT = 0; u.jkRamHit = new Set(); },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, c);
    if (u.jkRam <= 0 && c.gap > w.ramMin && c.gap < w.ramMax && !busy(u) && u.airT <= 0) ram(u, c.dirx, c.dirz);
    if (u.jkRamT > 0) u.desired.set(u.jkRamDx * c.spd * 1.6, 0, u.jkRamDz * c.spd * 1.6);
    return t;
  },
  // possessed (src/skills.js): the ram, where it's looking
  basic: 'Claws & jaws',
  skills: [
    { key: 'lb', name: 'Ram', icon: '🐉', cd: (u) => u.jkRam, max: (u) => u.def.weapon.ramCD, ready: (u) => (u.airT > 0 ? 'in the air' : true),
      use(u) { const a = u.control?.aimYaw ?? u.heading; ram(u, Math.sin(a), Math.cos(a)); return true; } },
  ],
  // the bite: whatever the claws missed, the jaws find (a target close in front)
  event(u, t0, t1) {
    if (u.st.attack !== u.anim || !crossed(t0, t1, 0.55)) return;
    const b = u.battle, w = u.def.weapon, v = u.target;
    if (!foe(u, v) || u.hitSet.has(v) || flat(v.pos, u.pos) > u.reachDist + v.skel.radius + w.biteR) return;
    if (!(Math.sin(u.heading) * (v.pos.x - u.pos.x) + Math.cos(u.heading) * (v.pos.z - u.pos.z) > 0)) return;
    u.hitSet.add(v);
    _d.set(v.pos.x - u.pos.x, 0.3, v.pos.z - u.pos.z).normalize();
    strike(b, v, w.damage, _d, Math.min(w.force, v.M * 8), u, 'jk_bite', PART.chest, 'crunch');
  },
  step(u, dt) {
    u.jkRam -= dt;
    if (u.jkRamT <= 0) return;
    u.jkRamT -= dt;
    const b = u.battle, w = u.def.weapon, c = u.chestPos;
    b.grid.query(c.x, c.z, 3, (v) => {
      if (!foe(u, v) || u.jkRamHit.has(v) || v.chestPos.distanceTo(c) > w.ramR + v.skel.radius) return;
      u.jkRamHit.add(v);
      const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
      const sd = (dx * -u.jkRamDz + dz * u.jkRamDx) >= 0 ? 1 : -1; // thrown aside
      _d.set(u.jkRamDx * 0.6 - u.jkRamDz * sd * 0.5 + dx / d * 0.2, 0.55, u.jkRamDz * 0.6 + u.jkRamDx * sd * 0.5 + dz / d * 0.2).normalize();
      strike(b, v, w.ramDmg, _d, Math.min(w.ramForce, v.M * 13), u, 'jk_ram', PART.chest, 'crunch');
      if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 0.9 * (v.def.stagger ?? 1));
      b.sound('thump', c, 0.9, 0.6);
    });
    if (Math.random() < 0.5) b.emit('dust', u.pos.x, u.pos.y - u.skel.standHeight, u.pos.z, 1);
  },
};

function ram(u, dx, dz) {
  const w = u.def.weapon;
  u.jkRam = w.ramCD * rand(0.85, 1.15);
  u.jkRamT = w.ramT;
  u.jkRamDx = dx; u.jkRamDz = dz;
  u.jkRamHit.clear();
  leap(u, dx, dz, w.ramV, 1.2);
  u.battle.voice(u, 'cry', true);
  u.battle.sound('charge', u.pos, 0.8, 0.6);
}

// ------------------------------------------------------------------ Finger Bearer
// A brute with long arms. Every few seconds a two-handed smash shakes the ground round
// whoever it hits; badly hurt, it swallows its Sukuna finger once a battle: it heals,
// and its blows land harder for the rest of the fight.
const fingerBearer = {
  melee: true,
  init(u) { u.jkSmash = rand(2, 4); u.jkAte = false; },
  think: meleeThink,
  event(u, t0, t1) { castEvent(u, t0, t1, { smash: groundSmash, finger: eatFinger }); },
  basic: 'Long arms',
  skills: [
    { key: 'rb', name: 'Ground Smash', icon: '💢', cd: (u) => u.jkSmash, max: (u) => u.def.weapon.smashCD,
      use(u) { u.jkSmash = u.def.weapon.smashCD; castPose(u, 'slam', 'smash'); return true; } },
    { key: 'lb', name: 'Swallow the Finger', icon: '☝', ready: (u) => (u.jkAte ? 'eaten' : true), use(u) { u.jkAte = true; castPose(u, 'cast', 'finger'); return true; } },
  ],
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    bonusBlows(u, buffed(u) ? w.fingerDmg : 0, 'jk_finger');
    u.jkSmash -= dt;
    if (busy(u) || u.control) return;
    if (!u.jkAte && u.hp < u.maxHp * w.fingerAt) {
      u.jkAte = true;
      castPose(u, 'cast', 'finger');
      return;
    }
    if (u.jkSmash <= 0) {
      if (enemiesNear(u, u.pos, w.smashR).length >= 2) { u.jkSmash = w.smashCD; castPose(u, 'slam', 'smash'); }
      else u.jkSmash = 0.4;
    }
  },
};
function groundSmash(u) {
  const b = u.battle, w = u.def.weapon, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  _o.set(u.pos.x + fx * 1.4, 0, u.pos.z + fz * 1.4);
  _o.y = b.terrain.height(_o.x, _o.z) + 0.3;
  blast(b, _o, w.smashR, w.smashDmg * (buffed(u) ? 1 + w.fingerDmg : 1), w.smashForce, u, { fx: -1, friendly: 0.2, sound: 'thump', pitch: 0.5 });
  b.emit('dust', _o.x, _o.y, _o.z, 6);
  b.sound('crash', _o, 0.7, 0.6);
  markerAt(b, 'jk_crack', _o.set(_o.x, _o.y - 0.27, _o.z), 1.5, rand(0, 6));
}
function eatFinger(u) {
  const b = u.battle, w = u.def.weapon, p = u.headPos;
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp * w.fingerHeal);
  u.jkBuffT = b.time + 9999;
  markerOn(b, u, 'jk_fingeraura', PART.chest, 9999);
  announce(b, 'The Finger Bearer swallows a Sukuna finger!', p);
  b.sound('crunch', p, 1.0, 0.6);
  b.sound('gong', p, 0.8, 0.4);
  b.voice(u, 'cry', true);
  b.emit('spark', p.x, p.y, p.z, 10);
}

// ------------------------------------------------------------------ Kuchisake-onna
// "Am I beautiful?" - when it gets close it asks its target, and the question is a rule:
// the victim stands dazed a moment, and the scissors cut a dazed victim twice as deep.
const kuchisake = {
  melee: true,
  init(u) { u.jkAsk = rand(0.2, 1); },
  think: meleeThink,
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    newVictims(u, (v) => {
      if (!v.alive || !((v.jkDazedT || 0) > b.time)) return;
      v.hit(w.damage * w.cutK, PART.chest, 0, 0, 0, u, 'jk_scissors');
      markSpin(b, 'jk_cut', v.chestPos, 0.25);
      b.emit('blood', v.chestPos.x, v.chestPos.y, v.chestPos.z, 6, 0, 0);
    });
    u.jkAsk -= dt;
    if (u.jkAsk > 0 || u.control || busy(u)) return;
    const t = u.target && u.target.alive ? u.target : null;
    if (!t || flat(t.pos, u.pos) > w.askR || t.jkNoCE) { u.jkAsk = 0.3; return; }
    ask(u, t);
  },
  basic: 'Scissors',
  skills: [
    { key: 'lb', name: 'Am I beautiful?', icon: '😷', cd: (u) => u.jkAsk, max: (u) => u.def.weapon.askCD,
      ready: (u) => (askTarget(u) ? true : 'no one close'),
      use(u) { const v = askTarget(u); if (!v) return false; ask(u, v); return true; } },
    leapSkill('rb'),
  ],
};
function askTarget(u) { const v = aimTarget(u, u.def.weapon.askR, 3); return v && !v.jkNoCE ? v : null; }
function ask(u, t) {
  const b = u.battle, w = u.def.weapon;
  u.jkAsk = w.askCD;
  castPose(u, 'jj_shout', null);
  techBanner(b, '"Am I beautiful?"', u.headPos, 8);
  t.stun = Math.max(t.stun, w.askDaze);
  t.st.attack = null;
  t.jkDazedT = b.time + w.askDaze + 1.2;
  const h = t.headPos;
  markerAt(b, 'jk_question', _o.set(h.x, h.y + 0.7, h.z), w.askDaze + 0.4, 0);
  b.sound('tick', h, 0.7, 0.6);
}

// ------------------------------------------------------------------ Grasshopper Curse
// Cheap and springy: it leaps at anyone a few metres off and lands feet first.
const grasshopper = {
  melee: true,
  init(u) { u.jkLeap = rand(0.3, 1.5); u.jkFly = 0; },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, c);
    if (u.jkLeap <= 0 && c.gap > w.leapMin && c.gap < w.leapMax && !busy(u) && u.airT <= 0) {
      u.jkLeap = w.leapCD * rand(0.8, 1.2);
      u.jkFly = 1.1;
      leap(u, c.dirx, c.dirz, w.leapV * clamp(c.gap / 6, 0.6, 1.3), w.leapUp);
    }
    return t;
  },
  // possessed (src/skills.js): the leap kick at the enemy under the crosshair
  basic: 'Kick',
  skills: [
    { key: 'lb', name: 'Leap Kick', icon: '🦗', cd: (u) => u.jkLeap, max: (u) => u.def.weapon.leapCD,
      ready: (u) => (u.airT > 0 ? 'in the air' : aimTarget(u, u.def.weapon.leapMax, 4) ? true : 'no target'),
      use(u) {
        const w = u.def.weapon, v = aimTarget(u, w.leapMax, 4);
        if (!v) return false;
        const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
        u.jkLeap = w.leapCD; u.jkFly = 1.1;
        leap(u, dx / d, dz / d, w.leapV * clamp(d / 6, 0.6, 1.3), w.leapUp);
        return true;
      } },
  ],
  step(u, dt) {
    u.jkLeap -= dt;
    if (u.jkFly <= 0) return;
    u.jkFly -= dt;
    const b = u.battle, w = u.def.weapon, c = u.chestPos;
    let hit = null;
    b.grid.query(c.x, c.z, 2.5, (v) => { if (!hit && foe(u, v) && v.chestPos.distanceTo(c) < 1.1 + v.skel.radius) hit = v; });
    if (!hit) return;
    u.jkFly = 0;
    const dx = hit.pos.x - u.pos.x, dz = hit.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    _d.set(dx / d, 0.35, dz / d).normalize();
    strike(b, hit, w.kickDmg, _d, Math.min(w.kickForce, hit.M * 12), u, 'jk_kick', PART.chest, 'thump');
    if (hit.parriedAt !== b.time) hit.stun = Math.max(hit.stun, 0.7 * (hit.def.stagger ?? 1));
    u.rag.impulseAll(-_d.x * u.M * 2, u.M * 2, -_d.z * u.M * 2); // bounces off
  },
};

// ------------------------------------------------------------------ Yorozu
// Construction: fights with a blade of liquid metal; badly pressed, she builds insect
// armour (cuts most of the damage, wings for leaps at her target). Once a battle she
// builds the True Sphere - a perfect sphere of mass that homes in on the strongest
// enemy in reach and hits like nothing else.
const yorozu = {
  melee: true,
  init(u) { const w = u.def.weapon; u.jkArm = 0; u.jkArmCD = w.armFirst; u.jkSph = w.sphFirst; u.jkWing = 0; u.jkArmMk = null; },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, c);
    if (u.jkArm > u.battle.time && u.jkWing <= 0 && c.gap > 4 && c.gap < 14 && !busy(u) && u.airT <= 0) {
      u.jkWing = w.wingCD;
      leap(u, c.dirx, c.dirz, w.wingV, 4.5);
      u.battle.sound('flyby', u.chestPos, 0.8, 1.2);
    }
    return t;
  },
  event(u, t0, t1) { castEvent(u, t0, t1, { sphere: trueSphere }); },
  // possessed (src/skills.js): the armour, a wing leap while it's on, the True Sphere
  basic: 'Liquid-metal blade',
  skills: [
    { key: 'lb', name: 'Insect Armour', icon: '🪲', cd: (u) => u.jkArmCD, max: (u) => u.def.weapon.armCD, ready: (u) => (burntOut(u) ? 'burnt out' : true),
      use(u) { insectArmour(u); return true; } },
    { key: 'rb', name: 'Wing Leap', icon: '🪽', cd: (u) => u.jkWing, max: (u) => u.def.weapon.wingCD,
      ready: (u) => (!(u.jkArm > u.battle.time) ? 'needs the armour' : u.airT > 0 ? 'in the air' : aimTarget(u, 14) ? true : 'no target'),
      use(u) {
        const v = aimTarget(u, 14);
        if (!v) return false;
        const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
        u.jkWing = u.def.weapon.wingCD;
        leap(u, dx / d, dz / d, u.def.weapon.wingV, 4.5);
        u.battle.sound('flyby', u.chestPos, 0.8, 1.2);
        return true;
      } },
    { key: 'rt', name: 'True Sphere', icon: '⚪', ready: (u) => (u.jkSphDone ? 'used' : burntOut(u) ? 'burnt out' : true),
      use(u) {
        u.jkSphDone = true;
        u.aimAt = aimTarget(u, u.def.weapon.sphRange, 5);
        castPose(u, 'jk_push', 'sphere');
        announce(u.battle, 'Construction: the True Sphere!', u.headPos);
        return true;
      } },
  ],
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkWing -= dt; u.jkArmCD -= dt; u.jkSph -= dt;
    if (u.jkArmMk && u.jkArm <= b.time) { u.jkArmMk.t = 0; u.jkArmMk = null; }
    if (busy(u) || burntOut(u) || u.control) return;
    if (u.jkSph <= 0 && !u.jkSphDone) {
      let best = null;
      for (const v of b.foes(u.team)) {
        if (!foe(u, v) || flat(v.pos, u.pos) > w.sphRange) continue;
        if (!best || v.def.cost > best.def.cost) best = v;
      }
      if (best && (best.def.cost >= w.sphMinCost || u.jkSph < -w.sphWait || u.hp < u.maxHp * 0.4)) {
        u.jkSphDone = true;
        u.aimAt = best;
        castPose(u, 'jk_push', 'sphere');
        announce(b, 'Construction: the True Sphere!', u.headPos);
        return;
      }
    }
    if (u.jkArmCD <= 0 && u.hp < u.maxHp * w.armAt && u.target) insectArmour(u);
  },
  hit(u, amount) { return u.jkArm > u.battle.time ? amount * (1 - u.def.weapon.armK) : amount; },
  die(u) { if (u.jkArmMk) { u.jkArmMk.t = 0; u.jkArmMk = null; } },
};
function insectArmour(u) {
  const b = u.battle, w = u.def.weapon;
  u.jkArmCD = w.armCD;
  u.jkArm = b.time + w.armDur;
  castPose(u, 'jk_sign', null);
  if (u.jkArmMk) u.jkArmMk.t = 0;
  u.jkArmMk = markerOn(b, u, 'jk_insectarmor', PART.chest, w.armDur);
  techBanner(b, 'Construction: Insect Armour', u.headPos, 8);
  b.sound('clang', u.chestPos, 0.8, 0.7);
}
function trueSphere(u) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  _o.set(c.x + fx * 1.2, c.y + 0.5, c.z + fz * 1.2);
  aimPoint(u, _p, 0.3, 0.6);
  launchVel(_o, _p, w.sphSpeed, 0, false, 0, _v);
  const tgt = u.aimAt && u.aimAt.alive ? u.aimAt : null;
  addProjectile(b, 'jk_sphere', _o, _v, u, { life: w.sphRange / w.sphSpeed * 1.6, tgt, spd: w.sphSpeed, damage: w.sphDmg, force: w.sphForce, spin: new THREE.Vector3(0, 0, 0) });
  b.sound('magic', _o, 1.2, 0.4);
  b.sound('whoosh', _o, 1.2, 0.5);
}
function sphereImpact(b, pr, v) {
  if (pr.done) return;
  pr.done = true;
  const o = pr.owner;
  if (v) {
    _d.copy(pr.vel).normalize(); _d.y += 0.3; _d.normalize();
    strike(b, v, pr.damage, _d, Math.min(pr.force, v.M * 20), o, 'jk_sphere', PART.chest, 'crunch');
  }
  blast(b, pr.pos, 3, pr.damage * 0.2, pr.force * 0.4, o, { fx: 0, friendly: 0.3, vol: 1.4, pitch: 0.5 });
  b.emit('dust', pr.pos.x, pr.pos.y - 0.5, pr.pos.z, 6);
}

// ------------------------------------------------------------------ secrets
onSecret((b) => {
  if (b.over || b.time > 3) return;
  for (const u of b.units) {
    if (!u.alive || u.def.id !== 'jk_yorozu' || u.jkYs) continue;
    u.jkYs = true;
    if (b.teams[u.team].some((v) => isA(v, 'jk_sukuna'))) {
      announce(b, 'SECRET: Yorozu fights at her beloved Sukuna\'s side', u.headPos, 'yorozu');
      u.expr = EXPR.happy;
    }
  }
});

// ------------------------------------------------------------------ projectiles
const PJ = {
  // a cockroach: scuttles up, homes in, nibbles and keeps crawling on the victim
  jk_roach: {
    g: 0, len: 0.2, r: 0.2, life: 4,
    step(b, pr, dt) {
      if (pr.tgt && pr.tgt.alive) home(pr, dt, pr.spd || 11, 4);
      else pr.vel.y -= 9.81 * dt;
    },
    hit(b, pr, v) {
      v.hit(pr.damage, PART.chest, 0, 0, 0, pr.owner, 'jk_roach');
      addStatus(b, v, 'poison', 2.5, pr.owner?.def.weapon.roachDps ?? 5, pr.owner);
      crawl(b, v, 2.5);
      return true;
    },
    ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 0.4); return true; },
  },
  jk_icefall: { g: 9.81, len: 0, r: 0.6, life: 3, hit(b, pr) { iceImpact(b, pr); return true; }, ground(b, pr) { iceImpact(b, pr); return true; } },
  jk_sphere: {
    g: 0, len: 0, r: 0.7, life: 4,
    step(b, pr, dt) { if (pr.tgt) home(pr, dt, pr.spd, 2.5); if (pr.life <= 0) sphereImpact(b, pr, null); },
    hit(b, pr, v) { sphereImpact(b, pr, v); return true; },
    ground(b, pr) { sphereImpact(b, pr, null); return true; },
  },
  // markers
  jk_roaches: { g: 0, len: 0, r: 0, life: 1 },
  jk_iceblock: { g: 0, len: 0, r: 0, life: 1 },
  jk_iceshards: { g: 0, len: 0, r: 0, life: 1 },
  jk_frostwave: { g: 0, len: 0, r: 0, life: 1 },
  jk_coffin: { g: 0, len: 0, r: 0, life: 1 },
  jk_coffinlid: { g: 0, len: 0, r: 0, life: 1 },
  jk_crack: { g: 0, len: 0, r: 0, life: 1 },
  jk_fingeraura: { g: 0, len: 0, r: 0, life: 1 },
  jk_question: { g: 0, len: 0, r: 0, life: 1 },
  jk_insectarmor: { g: 0, len: 0, r: 0, life: 1 },
};

// ------------------------------------------------------------------ units
const CURSE = { aggro: 1, bravery: 0, voice: 0.7, chatter: 0.8, cry: 'cackle', idle: 'shift' };
const units = [
  {
    id: 'jk_kurourushi', name: 'Kurourushi', faction: 'jjk_curses', side: 'curse', cost: 900, hp: 1000, speed: 5.4,
    build: { scale: 1.15, girth: 1.15, head: 1.15, arms: 1.1, legs: 0.95, mass: 1.2 },
    weapon: {
      line: 'Curse · chewing bites eat flesh · cockroach swarms crawl over enemies · a hard shell',
      kind: 'jk_kurourushi', style: 'none', anim: 'punch', item: 'jj_claw', damage: 40, reach: 1.0, cooldown: 0.7, force: 220,
      chewT: 4, chewDps: 16, swCD: 7, swFirst: 2.5, swRange: 16, roaches: 12, roachDmg: 7, roachDps: 6, swSpeed: 11,
    },
    look: { skin: '#5a3418', hat: 'jk_roach_head', top: 'jk_roach', legs: '#3a2210', accent: '#2a1808' },
    personality: { ...CURSE, aggro: 1, voice: 1.5, chatter: 0.6, cry: 'cackle', idle: 'hop' },
    armor: 0.25, stagger: 0.4,
    desc: 'The special-grade cockroach of the Sendai colony. Where there is one, there are thousands.',
  },
  {
    id: 'jk_uraume', name: 'Uraume', faction: 'jjk_curses', side: 'curse', cost: 1100, hp: 640, speed: 4.8,
    build: { scale: 0.98, girth: 0.9 },
    weapon: {
      line: 'Ice Formation · Icefall drops ice on a target (frozen victims shatter) · Frost Calm freezes everyone in front',
      kind: 'jk_uraume', style: 'jj_sign', anim: 'cast', item: 'none', damage: 46, range: 20, minRange: 5, cooldown: 2.2, force: 260,
      windup: 0.7, releaseAt: 0.6, dropH: 9, dropV: 10, iceR: 1.8, shatter: 1.0,
      fcCD: 8, fcFirst: 2, fcR: 8, fcCos: 0.5, fcDmg: 28, fcFreeze: 2.6,
    },
    look: { skin: '#f2e2d6', hat: 'jk_uraume_hair', top: 'jk_uraume', legs: '#e8e4ec', accent: '#a8b8d8' },
    personality: { aggro: 0.45, bravery: 0, voice: 1.1, chatter: 0.3, cry: 'royal', idle: 'regal' },
    stagger: 0.5,
    desc: "Sukuna's loyal servant, a thousand years on. Cold manners, colder technique.",
  },
  {
    id: 'jk_smallpox', name: 'Smallpox Deity', faction: 'jjk_curses', side: 'curse', cost: 1100, hp: 950, speed: 3.6,
    build: { scale: 1.35, girth: 1.2, head: 1.4, legs: 0.85, arms: 1.1, mass: 1.5 },
    weapon: {
      line: 'Disease curse · a pox cloud that sickens · the grave: shut in a coffin, it counts to three, then buries you',
      kind: 'jk_smallpox', style: 'none', anim: 'slam', item: 'jk_fist', damage: 38, reach: 1.0, cooldown: 1.3, force: 420,
      poxR: 3.6, poxDps: 7, graveR: 10, graveCD: 13, graveFirst: 2.5, countT: 3.0, buryDmg: 420, breakDmg: 200, breakHp: 700,
    },
    look: { skin: '#b8b0a4', hat: 'jk_smallpox_head', top: 'jk_smallpox', legs: '#6e665c', accent: '#3a342e' },
    personality: { ...CURSE, aggro: 0.7, voice: 0.6, chatter: 0.3, cry: 'roar', idle: 'brace' },
    armor: 0.15, stagger: 0.25,
    desc: "A walking grave from Kenjaku's collection. Count with it: one... two...",
  },
  {
    id: 'jk_rainbowdragon', name: 'Rainbow Dragon', faction: SUMMON, cost: 0, hp: 1100, speed: 5.0,
    build: { scale: 1.45, girth: 1.15, head: 1.3, legs: 0.7, arms: 0.8, mass: 1.6 },
    weapon: {
      line: "Summon · Geto's dragon: rainbow scales shrug off most blows · rams through lines · bites",
      kind: 'jk_rainbowdragon', style: 'none', anim: 'slam', item: 'jj_claw', damage: 42, reach: 1.15, cooldown: 1.0, force: 380,
      biteR: 0.5, ramCD: 5, ramMin: 4, ramMax: 14, ramT: 0.9, ramV: 10, ramR: 1.3, ramDmg: 60, ramForce: 1000,
    },
    look: { skin: '#3a8ad0', hat: 'jk_dragon_head', top: 'jk_dragon', legs: '#2a6aa8', accent: '#e8c040' },
    personality: { ...CURSE, aggro: 1, voice: 0.45, chatter: 0.3, cry: 'roar', idle: 'brace' },
    armor: 0.45, stagger: 0.2,
    desc: "One of Geto's prized curses. Its hide is the hardest thing in the Jujutsu world, almost.",
  },
  {
    id: 'jk_fingerbearer', name: 'Finger Bearer', faction: 'jjk_curses', side: 'curse', cost: 750, hp: 900, speed: 4.6,
    build: { scale: 1.4, girth: 1.1, head: 1.25, arms: 1.4, armThick: 1.2, legs: 0.95, mass: 1.4 },
    weapon: {
      line: 'Special grade · long-armed smashes that shake the ground · swallows a Sukuna finger when badly hurt',
      kind: 'jk_fingerbearer', style: 'none', anim: 'overhead', item: 'jj_claw', damage: 48, reach: 1.35, cooldown: 1.0, force: 460,
      smashCD: 6, smashR: 3, smashDmg: 50, smashForce: 700, fingerAt: 0.4, fingerHeal: 0.6, fingerDmg: 0.6,
    },
    look: { skin: '#8a92a8', hat: 'jk_fbearer_head', top: 'jk_fbearer', legs: '#5a6070', accent: '#3a3e4a' },
    personality: { ...CURSE, aggro: 1, voice: 0.5, chatter: 0.5, cry: 'roar', idle: 'brace' },
    stagger: 0.35,
    desc: 'It grew up around a finger of the King of Curses. It would like the rest of them.',
  },
  {
    id: 'jk_kuchisake', name: 'Kuchisake-onna', faction: SUMMON, cost: 0, hp: 600, speed: 5.4, face: 2,
    build: { scale: 1.06, girth: 0.88, legs: 1.08 },
    weapon: {
      line: 'Summon · "Am I beautiful?" - the question dazes its target, then giant scissors cut a dazed victim twice as deep',
      kind: 'jk_kuchisake', style: 'sword', anim: 'overhead', item: 'jk_scissors', damage: 52, reach: 1.15, cooldown: 0.85, force: 260,
      askR: 5, askCD: 5, askDaze: 1.6, cutK: 1.0,
    },
    look: { skin: '#eedad0', hat: 'jk_kuchi_hair', top: 'jk_kuchi', legs: '#c8b490', accent: '#8a7050' },
    personality: { ...CURSE, aggro: 1, voice: 1.4, chatter: 0.8, cry: 'cackle', idle: 'shift' },
    stagger: 0.6,
    desc: "One of Geto's curses. There is only one right answer, and it isn't either of them.",
  },
  {
    id: 'jk_grasshopper', name: 'Grasshopper Curse', faction: SUMMON, cost: 0, hp: 210, speed: 6.0,
    build: { scale: 1.0, girth: 0.9, head: 1.15, legs: 1.15, arms: 0.95 },
    weapon: {
      line: "Summon · one of Geto's curses: huge leaps that land feet first",
      kind: 'jk_grasshopper', style: 'none', anim: 'punch', item: 'jj_claw', damage: 22, reach: 0.95, cooldown: 0.7, force: 180,
      leapCD: 3, leapMin: 3, leapMax: 10, leapV: 7, leapUp: 4.5, kickDmg: 38, kickForce: 520,
    },
    look: { skin: '#5aa83a', hat: 'jk_hopper_head', top: 'jk_hopper', legs: '#3e8a2a', accent: '#2a5a1a' },
    personality: { ...CURSE, aggro: 1, voice: 1.5, chatter: 0.9, cry: 'cackle', idle: 'hop' },
    stagger: 0.8,
    desc: 'The Shibuya grasshopper. Boing.',
  },
  {
    id: 'jk_yorozu', name: 'Yorozu', faction: 'jjk_curses', side: 'curse', cost: 1200, hp: 700, speed: 5.4, face: 2,
    build: { scale: 0.96, girth: 0.9 },
    weapon: {
      line: 'Construction · liquid metal blade · Insect Armour (wings, takes less harm) · once: the True Sphere at the strongest enemy',
      kind: 'jk_yorozu', style: 'sword', anim: 'overhead', item: 'jk_ylblade', damage: 50, reach: 1.15, cooldown: 0.7, force: 320,
      armAt: 0.8, armFirst: 1, armCD: 22, armDur: 14, armK: 0.45, wingCD: 2.6, wingV: 6,
      sphFirst: 6, sphWait: 14, sphMinCost: 900, sphRange: 26, sphSpeed: 11, sphDmg: 620, sphForce: 1600,
    },
    look: { skin: '#f0d0b8', hat: 'jk_yorozu_hair', top: 'jk_yorozu', legs: '#1e2030', accent: '#c0c4d0' },
    personality: { aggro: 0.9, bravery: 0, voice: 1.3, chatter: 0.8, cry: 'cackle', idle: 'bounce' },
    stagger: 0.5,
    desc: 'A Heian-era sorcerer back for one thing: Sukuna. Builds whatever she needs out of cursed energy.',
  },
];

// ------------------------------------------------------------------ visuals
function hairCap(H, g, r, m, k = 1.07, frac = 0.36, tilt = -0.35) {
  const c = H.mesh(dome(H, r * k, frac), m, 0, r * 0.04, -r * 0.05, g);
  c.rotation.x = tilt;
  return c;
}
function lock(H, g, m, p, dir, rad, len) {
  const d = new THREE.Vector3(...dir).normalize();
  const c = H.mesh(H.cone(rad, len, 6), m, p[0] + d.x * len * 0.5, p[1] + d.y * len * 0.5, p[2] + d.z * len * 0.5, g);
  c.quaternion.setFromUnitVectors(UPY, d);
  return c;
}
const onHead = (r, x, y, k = 1.0) => { const z = Math.sqrt(Math.max(0.02, 1 - x * x - y * y)); return [x * r * k, y * r * k, z * r * k]; };
// a stalk from p along dir (antennae, legs)
function stalk(H, g, m, p, dir, rad, len) {
  const d = new THREE.Vector3(...dir).normalize();
  const c = H.mesh(H.cyl(rad * 0.6, rad, len, 5), m, p[0] + d.x * len * 0.5, p[1] + d.y * len * 0.5, p[2] + d.z * len * 0.5, g);
  c.quaternion.setFromUnitVectors(UPY, d);
  return c;
}

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, cone, mat } = H;
  if (name === 'jk_scissors') { // giant shears: two long blades, two big ring handles
    const steel = mat('#c8ccd4', { spec: 1 }), dark = mat('#2a2830');
    for (const sd of [-1, 1]) {
      const bl = mesh(box(0.02 * s, 0.62 * s, 0.07 * s), steel, sd * 0.02 * s, 0.38 * s, 0, g); bl.rotation.z = sd * 0.08;
      const ring = mesh(torus(H, 0.06 * s, 0.014 * s, Math.PI * 2, 12), dark, sd * 0.06 * s, -0.04 * s, 0, g); ring.rotation.y = Math.PI / 2;
    }
    mesh(cyl(0.025 * s, 0.025 * s, 0.05 * s, 8), mat('#8a2020'), 0, 0.07 * s, 0, g).rotation.x = Math.PI / 2;
    mesh(cone(0.035 * s, 0.1 * s, 4), steel, 0, 0.73 * s, 0, g).scale.set(0.5, 1, 1);
    return true;
  }
  if (name === 'jk_ylblade') { // a curved blade of liquid metal, beading at the edge
    const liq = mat('#d8dce8', { spec: 1, emit: 0.1 });
    mesh(cyl(0.025 * s, 0.03 * s, 0.14 * s, 8), mat('#2a2a34'), 0, 0.02 * s, 0, g);
    for (let i = 0; i < 6; i++) {
      const y = 0.12 + i * 0.1, k = 1 - i * 0.12;
      const sg = mesh(H.sphere(0.05 * s * k, 8, 6), liq, Math.sin(i * 0.35) * 0.05 * s, y * s, 0, g); sg.scale.set(0.5, 1.6, 1.3);
    }
    mesh(cone(0.03 * s, 0.12 * s, 6), liq, 0.11 * s, 0.73 * s, 0, g).rotation.z = -0.4;
    mesh(H.sphere(0.03 * s, 6, 5), tcol(H, team), 0, -0.07 * s, 0, g);
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'jk_roach_head': { // a cockroach's head: glossy brown, black eyes, long antennae, mandibles
      g.userData.hidesFace = true;
      const shell = mat('#5a3418', { spec: 0.9 }), dark = mat('#1a0e06', { spec: 1 }), pale = mat('#a87a48', { spec: 0.4 });
      const hd = mesh(sphere(r * 1.0, 16, 12), shell, 0, -r * 0.05, r * 0.1, g); hd.scale.set(1.0, 0.9, 1.15);
      // the pronotum shield over the top and back of the head
      const sh = mesh(dome(H, r * 1.25, 0.32), mat('#6a3e1c', { spec: 0.9 }), 0, r * 0.2, -r * 0.2, g); sh.rotation.x = -0.4;
      mesh(torus(H, r * 1.0, r * 0.06, Math.PI * 2, 18), pale, 0, r * 0.35, -r * 0.3, g).rotation.x = Math.PI / 2 - 0.4;
      for (const sd of [-1, 1]) {
        const e = mesh(sphere(r * 0.3, 12, 10), dark, sd * r * 0.55, r * 0.15, r * 0.75, g); e.scale.set(0.8, 1.2, 0.7);
        mesh(sphere(r * 0.07, 6, 5), mat('#ffffff'), sd * r * 0.5, r * 0.28, r * 0.97, g);
        const pts = [[sd * r * 0.35, r * 0.45, r * 0.95], [sd * r * 0.8, r * 1.4, r * 1.6], [sd * r * 1.6, r * 2.2, r * 1.1], [sd * r * 2.4, r * 2.5, r * 0.2]];
        mesh(tube(H, `ra${sd}:${r.toFixed(3)}`, pts, r * 0.05, r * 0.02, 12), dark, 0, 0, 0, g);
        const md = mesh(cone(r * 0.1, r * 0.45, 5), mat('#2a1808'), sd * r * 0.2, -r * 0.62, r * 0.95, g); md.rotation.set(1.9, 0, -sd * 0.6); // mandibles
        const pp = mesh(capsule(r * 0.05, r * 0.4), pale, sd * r * 0.42, -r * 0.7, r * 0.75, g); pp.rotation.x = 0.6; // palps
      }
      return true;
    }
    case 'jk_uraume_hair': { // a pale, almost white bob: a blunt fringe straight across the brow, sides cut level at the jaw
      const hair = mat('#f4eef2', { spec: 0.35 });
      hairCap(H, g, r, hair, 1.08, 0.45, -0.15);
      const back = mesh(sphere(r * 1.12, 16, 12), hair, 0, -r * 0.15, -r * 0.2, g); back.scale.set(1.06, 1.0, 0.88);
      // the fringe: a shell over the forehead, cut straight just above the eyes
      mesh(H.geo('ur-fringe' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.07, 18, 8, Math.PI / 2 - 1.1, 2.2, 0.15, 1.0)), hair, 0, 0, 0, g);
      for (let i = -4; i <= 4; i++) { const p = onHead(r, i * 0.11, 0.38, 1.07); mesh(box(r * 0.03, r * 0.1, r * 0.03), mat('#e2dae2'), p[0], p[1] + r * 0.03, p[2], g); } // strands at the cut
      for (const sd of [-1, 1]) { // the sides of the bob, straight down to the jaw
        const sdH = mesh(capsule(r * 0.3, r * 0.75), hair, sd * r * 0.82, -r * 0.2, r * 0.12, g); sdH.scale.set(0.7, 1, 1.25);
      }
      mesh(sphere(r * 0.07, 6, 5), tc, -r * 0.82, r * 0.42, r * 0.5, g); // a team hair clip
      return true;
    }
    case 'jk_smallpox_head': { // a gravestone rising behind a pale sunken face, long black hair hanging down
      g.userData.hidesFace = true;
      const stone = mat('#9a948a', { spec: 0.1 }), hair = mat('#0e0c10', { spec: 0.3 }), face = mat('#e8e0d4'), cut = mat('#5a544c');
      mesh(box(r * 1.5, r * 1.6, r * 0.45), stone, 0, r * 0.95, -r * 0.75, g);
      const arch = mesh(cyl(r * 0.75, r * 0.75, r * 0.45, 20), stone, 0, r * 1.75, -r * 0.75, g); arch.rotation.x = Math.PI / 2;
      mesh(box(r * 0.55, r * 0.08, r * 0.05), cut, 0, r * 1.85, -r * 0.5, g); // carved cross
      mesh(box(r * 0.08, r * 0.75, r * 0.05), cut, 0, r * 1.7, -r * 0.5, g);
      for (let i = 0; i < 5; i++) mesh(sphere(r * 0.13, 6, 5), mat('#6a8a4a'), (i - 2) * r * 0.32, r * 0.2 + (i % 2) * r * 0.12, -r * 0.55, g); // moss
      const fc = mesh(sphere(r * 0.98, 16, 12), face, 0, -r * 0.05, r * 0.02, g); fc.scale.set(0.9, 1.1, 0.9);
      hairCap(H, g, r, hair, 1.03, 0.42, -0.15);
      for (let i = 0; i < 12; i++) { // long hair down the sides and back
        const a = -2.6 + (i / 11) * 5.2, x = Math.sin(a) * r * 0.95, z = Math.cos(a) * r * 0.8;
        if (Math.abs(a) < 0.55) continue;
        lock(H, g, hair, [x, r * 0.35, z], [x * 0.15, -1, z * 0.05], r * 0.2, r * 2.0);
      }
      lock(H, g, hair, onHead(r, -0.35, 0.65, 1.03), [-0.2, -1, 0.5], r * 0.18, r * 1.3); // strands over the face
      lock(H, g, hair, onHead(r, 0.3, 0.65, 1.03), [0.25, -1, 0.45], r * 0.16, r * 1.1);
      for (const sd of [-1, 1]) { // hollow black eyes with a yellow glint
        mesh(sphere(r * 0.18, 8, 6), mat('#140c10'), sd * r * 0.3, r * 0.08, r * 0.82, g).scale.set(1, 1.3, 0.5);
        mesh(sphere(r * 0.045, 5, 4), glow('#e8e070'), sd * r * 0.3, r * 0.06, r * 0.9, g);
      }
      mesh(box(r * 0.34, r * 0.07, r * 0.05), mat('#3a1a20'), 0, -r * 0.45, r * 0.85, g);
      return true;
    }
    case 'jk_dragon_head': { // a dragon's head: long snout, horns, gold eyes, fangs, a mane of rainbow scales
      g.userData.hidesFace = true;
      const sc = mat('#3a8ad0', { spec: 0.8 }), belly = mat('#e8d8a0', { spec: 0.4 }), horn = mat('#e8e0c8', { spec: 0.4 });
      mesh(sphere(r * 1.0, 16, 12), sc, 0, 0, -r * 0.1, g).scale.set(1, 0.9, 1.1);
      const sn = mesh(capsule(r * 0.48, r * 1.0), sc, 0, -r * 0.2, r * 0.95, g); sn.rotation.x = Math.PI / 2; sn.scale.set(1.1, 1, 0.75);
      const jaw = mesh(capsule(r * 0.38, r * 0.85), belly, 0, -r * 0.55, r * 0.85, g); jaw.rotation.x = Math.PI / 2 - 0.15;
      for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) mesh(cone(r * 0.05, r * 0.18, 4), mat('#ffffff'), sd * r * 0.32, -r * 0.42, r * (0.6 + i * 0.22), g).rotation.x = Math.PI;
      for (const sd of [-1, 1]) {
        mesh(sphere(r * 0.2, 10, 8), glow('#ffd040'), sd * r * 0.5, r * 0.25, r * 0.65, g).scale.set(1, 0.7, 0.6);
        mesh(box(r * 0.05, r * 0.2, r * 0.05), mat('#1a1010'), sd * r * 0.52, r * 0.25, r * 0.77, g);
        stalk(H, g, horn, [sd * r * 0.45, r * 0.6, -r * 0.2], [sd * 0.4, 1, -1.0], r * 0.14, r * 1.3);
        stalk(H, g, mat('#e8c040'), [sd * r * 0.4, -r * 0.3, r * 1.6], [sd * 1, -0.2, 0.6], r * 0.04, r * 0.9); // whiskers
        mesh(sphere(r * 0.06, 6, 5), mat('#1a1010'), sd * r * 0.2, -r * 0.05, r * 1.75, g); // nostrils
      }
      const cols = ['#e83a3a', '#f08a2a', '#f6d84a', '#4ac85a', '#3a8ad0', '#8a4ad0'];
      for (let i = 0; i < 6; i++) { const f = mesh(cone(r * 0.2, r * 0.55, 4), mat(cols[i], { spec: 0.6 }), 0, r * (0.8 - i * 0.28), -r * (0.6 + i * 0.12), g); f.rotation.x = -0.8; }
      return true;
    }
    case 'jk_fbearer_head': { // a smooth bald head covered in eyes, a wide grin
      g.userData.hidesFace = true;
      const skin = mat('#8a92a8', { spec: 0.4 });
      const hd = mesh(sphere(r * 1.1, 16, 12), skin, 0, r * 0.15, 0, g); hd.scale.set(0.95, 1.2, 1.0);
      const eyes = [[0, 0.05, 0.3], [-0.55, 0.15, 0.24], [0.55, 0.15, 0.24], [-0.3, 0.6, 0.2], [0.32, 0.62, 0.22], [0, 0.95, 0.16], [-0.75, -0.25, 0.16], [0.75, -0.25, 0.17], [0.05, 0.42, 0.14]];
      for (const [x, y, k] of eyes) {
        const p = onHead(r * 1.1, x * 0.8, y * 0.7, 1.0);
        p[1] = p[1] * 1.2 + r * 0.15;
        mesh(sphere(r * k, 10, 8), mat('#f6f0e0'), p[0], p[1], p[2] * 0.95, g);
        mesh(sphere(r * k * 0.5, 8, 6), mat('#a01818'), p[0], p[1], p[2] * 0.95 + r * k * 0.6, g);
        mesh(sphere(r * k * 0.22, 6, 5), mat('#0a0a0a'), p[0], p[1], p[2] * 0.95 + r * k * 0.95, g);
      }
      const mp = onHead(r * 1.1, 0, -0.45, 1.0);
      mesh(box(r * 1.1, r * 0.24, r * 0.15), mat('#2a0a10'), mp[0], mp[1], mp[2] - r * 0.1, g);
      for (let i = -4; i <= 4; i++) mesh(box(r * 0.08, r * 0.12, r * 0.06), mat('#f2ead0'), i * r * 0.12, mp[1] + r * 0.06, mp[2] - r * 0.02, g);
      return true;
    }
    case 'jk_kuchi_hair': { // long black hair, a white surgical mask, the slit grin peeking out at its edges
      const hair = mat('#0e0c12', { spec: 0.4 }), red = mat('#a01820');
      hairCap(H, g, r, hair, 1.08, 0.42, -0.2);
      const back = mesh(sphere(r * 1.12, 14, 10), hair, 0, -r * 0.7, -r * 0.4, g); back.scale.set(1.1, 1.9, 0.8);
      for (const sd of [-1, 1]) {
        for (const [z, L] of [[0.4, 2.2], [0.0, 2.5], [-0.4, 2.4]]) lock(H, g, hair, [sd * r * 0.92, r * 0.3, z * r], [sd * 0.05, -1, -0.05], r * 0.26, r * L);
        lock(H, g, hair, onHead(r, sd * 0.25, 0.7, 1.03), [sd * 0.9, -0.6, 0.4], r * 0.2, r * 0.8);
        const sl = mesh(box(r * 0.25, r * 0.04, r * 0.04), red, ...onHead(r, sd * 0.68, -0.35, 1.02), g); sl.rotation.set(0, sd * 0.6, sd * 0.35); // the slit
      }
      mesh(H.geo('kc-mask' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.04, 16, 10, Math.PI / 2 - 0.9, 1.8, 1.75, 0.8)), mat('#f4f6f8', { spec: 0.15 }), 0, 0, 0, g);
      for (const sd of [-1, 1]) { const st = mesh(box(r * 0.6, r * 0.03, r * 0.03), mat('#e0e2e6'), sd * r * 0.75, -r * 0.05, r * 0.25, g); st.rotation.y = sd * 1.0; } // ear loops
      return true;
    }
    case 'jk_hopper_head': { // a grasshopper's long green head: big side eyes, antennae, mandibles
      g.userData.hidesFace = true;
      const skin = mat('#5aa83a', { spec: 0.5 }), dark = mat('#2a4a1a', { spec: 0.8 });
      const hd = mesh(sphere(r * 0.95, 16, 12), skin, 0, -r * 0.1, r * 0.15, g); hd.scale.set(0.85, 1.25, 1.0);
      for (const sd of [-1, 1]) {
        const e = mesh(sphere(r * 0.38, 12, 10), mat('#3a2a10', { spec: 1 }), sd * r * 0.62, r * 0.35, r * 0.25, g); e.scale.set(0.7, 1.1, 1);
        mesh(sphere(r * 0.08, 6, 5), mat('#ffffff'), sd * r * 0.82, r * 0.5, r * 0.45, g);
        mesh(tube(H, `ha${sd}:${r.toFixed(3)}`, [[sd * r * 0.2, r * 0.8, r * 0.6], [sd * r * 0.5, r * 1.6, r * 0.6], [sd * r * 0.9, r * 2.3, -r * 0.1], [sd * r * 1.1, r * 2.6, -r * 0.9]], r * 0.05, r * 0.02, 12), dark, 0, 0, 0, g);
        const md = mesh(cone(r * 0.1, r * 0.35, 5), dark, sd * r * 0.18, -r * 1.0, r * 0.7, g); md.rotation.set(2.2, 0, -sd * 0.5);
      }
      mesh(box(r * 0.5, r * 0.1, r * 0.05), mat('#8ac85a'), 0, -r * 0.55, r * 0.95, g); // the face plate
      return true;
    }
    case 'jk_yorozu_hair': { // short dark hair, a blunt fringe, a team hair band
      const hair = mat('#1a1a24', { spec: 0.3 });
      hairCap(H, g, r, hair, 1.08, 0.45, -0.2);
      const back = mesh(sphere(r * 1.08, 14, 10), hair, 0, -r * 0.05, -r * 0.3, g); back.scale.set(1.04, 0.95, 0.85);
      for (let i = -3; i <= 3; i++) lock(H, g, hair, onHead(r, i * 0.15, 0.6, 1.04), [i * 0.05, -1, 0.35], r * 0.14, r * 0.45);
      for (const sd of [-1, 1]) lock(H, g, hair, [sd * r * 0.9, r * 0.2, r * 0.2], [sd * 0.1, -1, 0.1], r * 0.22, r * 0.85);
      const band = mesh(torus(H, r * 1.0, r * 0.05, Math.PI * 2, 20), tc, 0, r * 0.45, -r * 0.1, g); band.rotation.x = Math.PI / 2 - 0.5;
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if ((!isJJK(def.faction) && def.faction !== SUMMON) || !def.id.startsWith('jk_')) return;
  const top = def.look.top;
  if (!TOPS.has(top)) return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const skin = mat(def.look.skin, { spec: 0.18 });
  const limb = (p) => skel.parts[p];
  const ARMS = [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR], LEGS = [PART.thighL, PART.shinL, PART.thighR, PART.shinR];
  const cover = (p, m, k = 1.15, f = 1, y = 0) => { const sp = limb(p); return mesh(capsule(sp.r * k, sp.hh * 2 * f), m, 0, sp.hh * y, 0, parts[p]); };
  const skirt = (m, top0, bot, len) => mesh(cyl(pel.r * top0, pel.r * bot, pel.r * len, 16), m, 0, -pel.r * len * 0.42, 0, P);
  const belt = (m, y = -hh - r * 0.38, k = 1.12) => mesh(cyl(r * k, r * (k + 0.02), r * 0.2, 16), m, 0, y, 0, C);
  // little jointed legs out of the sides of the body (insects)
  const bugLegs = (m, n, y0, y1) => {
    for (let i = 0; i < n; i++) for (const sd of [-1, 1]) {
      const y = y0 + (y1 - y0) * (i / Math.max(1, n - 1));
      stalk(H, C, m, [sd * r * 1.0, y, r * 0.3], [sd * 1, 0.25, 0.4], r * 0.07, r * 0.75);
      stalk(H, C, m, [sd * r * 1.55, y + r * 0.18, r * 0.62], [sd * 0.3, -1, 0.4], r * 0.05, r * 0.7);
    }
  };

  if (top === 'jk_roach') {
    // a glossy brown shell: wing covers down the back, a ribbed pale belly, little legs
    const shell = mat('#5a3418', { spec: 0.9 }), wing = mat('#7a4a22', { spec: 1 }), belly = mat('#a87a48', { spec: 0.3 }), dark = mat('#2a1808', { spec: 0.6 });
    chestShell(H, ch, shell, C, 1.05);
    for (let i = 0; i < 4; i++) mesh(cyl(r * 0.95, r * 0.95, r * 0.1, 14), belly, 0, hh * (0.4 - i * 0.4), r * 0.25, C).scale.set(1, 1, 0.9);
    for (const sd of [-1, 1]) {
      const wc = mesh(sphere(r * 0.9, 14, 10), wing, sd * r * 0.42, -hh * 0.2, -r * 0.75, C); wc.scale.set(0.6, 1.9, 0.45); wc.rotation.z = -sd * 0.08;
    }
    mesh(box(r * 0.04, (hh + r) * 1.9, r * 0.05), dark, 0, -hh * 0.2, -r * 1.15, C);
    bugLegs(dark, 2, -hh * 0.2, -hh * 0.9);
    for (const p of ARMS) cover(p, dark, 1.15, 1);
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); for (let k = 0; k < 3; k++) mesh(cone(sp.r * 0.25, sp.r * 0.8, 4), mat('#1a0e06'), 0, sp.hh * (0.5 - k * 0.5), -sp.r * 1.1, parts[p]).rotation.x = -2.2; }
    for (const p of LEGS) cover(p, dark, 1.12, 1);
    belt(tc, -hh - r * 0.3, 1.14);
  }
  if (top === 'jk_uraume') {
    // a white kimono with long, wide sleeves, the collar crossed left over right with a
    // pale lilac under-collar, a team obi, a long white hakama
    const robe = mat('#f4f1f4', { spec: 0.1 }), lil = mat('#c8b8d8', { spec: 0.1 }), fold = mat('#dcd6e0');
    chestShell(H, ch, robe, C);
    for (const [sd, w0] of [[-1, 0.2], [1, 0.14]]) { const l = mesh(box(r * w0, (hh + r) * 1.15, r * 0.05), sd < 0 ? lil : fold, sd * r * 0.22, hh * 0.35, r * 1.07, C); l.rotation.z = -sd * 0.42; }
    mesh(cyl(r * 0.55, r * 0.64, r * 0.28, 14), robe, 0, hh + r * 0.6, 0, C);
    for (const p of [PART.uarmL, PART.uarmR]) { const sp = limb(p); cover(p, robe, 1.25, 1); mesh(cyl(sp.r * 1.45, sp.r * 2.4, sp.hh * 2.3, 12), robe, 0, -sp.hh * 0.2, 0, parts[p]); }
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); mesh(cyl(sp.r * 2.1, sp.r * 2.5, sp.hh * 1.2, 12), robe, 0, sp.hh * 0.4, 0, parts[p]); mesh(cyl(sp.r * 2.52, sp.r * 2.52, sp.hh * 0.1, 12), lil, 0, -sp.hh * 0.2, 0, parts[p]); cover(p, skin, 1.1, 0.5, -0.4); }
    belt(tc, -hh - r * 0.3, 1.16);
    belt(td, -hh - r * 0.12, 1.17).scale.set(1, 0.3, 1);
    skirt(robe, 1.15, 1.8, 2.5);
    mesh(cyl(pel.r * 1.82, pel.r * 1.82, pel.r * 0.12, 16), lil, 0, -pel.r * 2.05, 0, P); // a lilac hem
  }
  if (top === 'jk_smallpox') {
    // a body of grave stone: a tomb base for a skirt, pox spots, a team shroud
    const stone = mat('#9a948a', { spec: 0.1 }), dk = mat('#6e665c', { spec: 0.05 }), pox = mat('#a84a3a');
    chestShell(H, ch, stone, C, 1.08);
    for (let i = 0; i < 10; i++) { const a = i * 2.4, y = ((i * 7) % 9 / 8 - 0.5) * hh * 2; mesh(sphere(r * (0.1 + (i % 3) * 0.04), 6, 5), pox, Math.sin(a) * r * 1.2, y, Math.cos(a) * r * 1.1, C); }
    mesh(cyl(r * 0.7, r * 1.0, r * 0.4, 14), tc, 0, hh + r * 0.45, 0, C); // a team shroud at the neck
    for (const p of ARMS) cover(p, skin, 1.15, 1);
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); for (let k = 0; k < 3; k++) mesh(sphere(sp.r * 0.35, 6, 5), pox, sp.r * (k - 1) * 0.6, sp.hh * (0.4 - k * 0.4), sp.r * 1.05, parts[p]); }
    mesh(box(pel.r * 2.9, pel.r * 1.9, pel.r * 2.5), dk, 0, -pel.r * 0.8, 0, P); // the tomb base
    mesh(box(pel.r * 3.1, pel.r * 0.3, pel.r * 2.7), stone, 0, -pel.r * 1.75, 0, P);
    for (const p of LEGS) cover(p, dk, 1.25, 1);
  }
  if (top === 'jk_dragon') {
    // rainbow-banded scales, a cream belly, a long serpent tail coiling behind it, little claws
    const cols = ['#e83a3a', '#f08a2a', '#f6d84a', '#4ac85a', '#3a8ad0', '#8a4ad0'];
    const belly = mat('#e8d8a0', { spec: 0.4 });
    chestShell(H, ch, skin, C, 1.05);
    for (let i = 0; i < 6; i++) mesh(cyl(r * 1.24, r * 1.24, (hh * 2 + r) / 6.5, 14), mat(cols[i], { spec: 0.7 }), 0, hh + r * 0.4 - (i + 0.5) * (hh * 2 + r) / 6, -r * 0.05, C).scale.set(1, 1, 0.95);
    for (let i = 0; i < 5; i++) mesh(box(r * 0.9, hh * 0.32, r * 0.1), belly, 0, hh * (0.75 - i * 0.38), r * 1.13, C);
    for (let i = 0; i < 6; i++) { const f = mesh(cone(r * 0.2, r * 0.5, 4), mat(cols[i]), 0, hh + r * 0.3 - i * hh * 0.4, -r * 1.2, C); f.rotation.x = -0.6; } // back fins
    // the tail: from the hips, back and round in a coil on the ground
    const segs = 16;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const x = Math.sin(t * 4.5) * pel.r * 2.0 * t, z = -pel.r * (1.0 + t * 5.5), y = -pel.r * (0.3 + Math.min(1, t * 3) * 1.6);
      const k = pel.r * (1.15 - t * 0.75);
      mesh(sphere(k, 10, 8), mat(cols[i % 6], { spec: 0.7 }), x, y, z, P);
    }
    mesh(cone(pel.r * 0.35, pel.r * 1.2, 6), mat('#8a4ad0'), Math.sin(4.5) * pel.r * 2.0, -pel.r * 1.9, -pel.r * 7.0, P).rotation.x = -Math.PI / 2;
    for (const p of ARMS) cover(p, skin, 1.15, 1);
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); for (let k = -1; k <= 1; k++) { const cl = mesh(cone(sp.r * 0.25, sp.r * 1.2, 4), mat('#e8e0c8'), k * sp.r * 0.5, -sp.hh - sp.r * 1.4, sp.r * 0.5, parts[p]); cl.rotation.x = Math.PI; } }
    for (const p of LEGS) cover(p, skin, 1.2, 1);
    belt(tc, -hh - r * 0.3, 1.2).scale.set(1, 0.6, 1);
  }
  if (top === 'jk_fbearer') {
    // a hulking grey body, bony ridges down the back, more eyes on the chest, long bare arms
    const bone = mat('#d8d2c0', { spec: 0.3 });
    chestShell(H, ch, skin, C, 1.06);
    for (let i = 0; i < 5; i++) mesh(cone(r * 0.18, r * 0.5, 5), bone, 0, hh * (0.8 - i * 0.4), -r * 1.15, C).rotation.x = -1.3;
    for (const [x, y, k] of [[-0.45, 0.4, 0.2], [0.5, 0.1, 0.16], [0.05, -0.5, 0.22]]) {
      mesh(sphere(r * k, 10, 8), mat('#f6f0e0'), x * r, y * hh, r * 1.0, C);
      mesh(sphere(r * k * 0.5, 8, 6), mat('#a01818'), x * r, y * hh, r * (1.0 + k * 0.6), C);
    }
    for (const p of ARMS) cover(p, skin, 1.18, 1);
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); for (let k = -1; k <= 1; k++) { const cl = mesh(cone(sp.r * 0.3, sp.r * 1.5, 4), mat('#2a2a30'), k * sp.r * 0.6, -sp.hh - sp.r * 1.6, sp.r * 0.4, parts[p]); cl.rotation.x = Math.PI; } }
    for (const p of LEGS) cover(p, skin, 1.2, 1);
    belt(tc, -hh - r * 0.35, 1.16);
    mesh(cyl(pel.r * 1.2, pel.r * 1.35, pel.r * 0.9, 12), td, 0, -pel.r * 0.3, 0, P);
  }
  if (top === 'jk_kuchi') {
    // a long belted beige trench coat with a team scarf
    const coat = mat('#c8b490', { spec: 0.12 }), dk = mat('#8a7050');
    chestShell(H, ch, coat, C, 1.04);
    const col = mesh(cyl(r * 0.6, r * 0.85, r * 0.45, 14), tc, 0, hh + r * 0.45, 0, C); void col;
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.3, (hh + r) * 0.9, r * 0.06), dk, sd * r * 0.3, hh * 0.3, r * 1.05, C); l.rotation.z = -sd * 0.3; } // lapels
    for (const y of [0.2, -0.3]) mesh(sphere(r * 0.07, 6, 5), mat('#3a2a1a'), r * 0.2, y * hh, r * 1.1, C);
    belt(dk, -hh - r * 0.3, 1.12);
    for (const p of [PART.uarmL, PART.uarmR]) cover(p, coat, 1.3, 1);
    for (const p of [PART.farmL, PART.farmR]) { cover(p, coat, 1.3, 0.8, 0.2); cover(p, skin, 1.0, 0.3, -0.75); }
    skirt(coat, 1.15, 1.55, 3.0);
  }
  if (top === 'jk_hopper') {
    // a segmented green body, folded wings down the back, thick spiny legs
    const dark = mat('#3e8a2a', { spec: 0.5 }), pale = mat('#8ac85a', { spec: 0.4 }), spine = mat('#2a4a1a');
    chestShell(H, ch, skin, C);
    for (let i = 0; i < 4; i++) mesh(cyl(r * 1.0, r * 1.0, r * 0.1, 14), pale, 0, hh * (0.5 - i * 0.4), r * 0.2, C).scale.set(1, 1, 0.92);
    for (const sd of [-1, 1]) { const w = mesh(sphere(r * 0.8, 12, 8), mat('#6a8a3a', { spec: 0.6 }), sd * r * 0.3, -hh * 0.5, -r * 0.9, C); w.scale.set(0.45, 2.3, 0.3); w.rotation.z = -sd * 0.06; }
    bugLegs(spine, 1, -hh * 0.3, -hh * 0.3);
    for (const p of ARMS) cover(p, dark, 1.12, 1);
    for (const p of LEGS) cover(p, dark, 1.45, 1);
    for (const p of [PART.shinL, PART.shinR]) { const sp = limb(p); for (let k = 0; k < 4; k++) mesh(cone(sp.r * 0.2, sp.r * 0.9, 4), spine, 0, sp.hh * (0.6 - k * 0.4), -sp.r * 1.3, parts[p]).rotation.x = -2.3; }
    belt(tc, -hh - r * 0.3, 1.14);
  }
  if (top === 'jk_yorozu') {
    // a dark fitted top with a high collar, silver lines of construction metal, a team sash
    const top0 = mat('#1e2030', { spec: 0.25 }), metal = mat('#c0c4d0', { spec: 1 });
    chestShell(H, ch, top0, C);
    mesh(cyl(r * 0.55, r * 0.65, r * 0.35, 14), top0, 0, hh + r * 0.6, 0, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.06, (hh + r) * 1.4, r * 0.04), metal, sd * r * 0.35, 0, r * 1.07, C); l.rotation.z = sd * 0.15; }
    for (const p of [PART.uarmL, PART.uarmR]) cover(p, top0, 1.2, 1);
    for (const p of [PART.farmL, PART.farmR]) { cover(p, skin, 1.1, 0.85, 0.12); const sp = limb(p); mesh(cyl(sp.r * 1.3, sp.r * 1.3, sp.hh * 0.3, 10), metal, 0, -sp.hh * 0.6, 0, parts[p]); }
    const sash = mesh(box(r * 0.3, (hh + r) * 2.1, r * 0.06), tc, 0, 0, r * 1.1, C); sash.rotation.z = 0.6;
    belt(td, -hh - r * 0.35, 1.13);
    skirt(top0, 1.1, 1.35, 1.5);
  }
}
const TOPS = new Set(['jk_roach', 'jk_uraume', 'jk_smallpox', 'jk_dragon', 'jk_fbearer', 'jk_kuchi', 'jk_hopper', 'jk_yorozu']);

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, octa, mat, glow, capsule } = H;
  const T = THREE;
  switch (type) {
    case 'jk_roach': { // a cockroach, head first (+Y)
      const b0 = ns(mesh(sphere(0.09, 8, 6), mat('#4a2a10', { spec: 0.9 }), 0, 0, 0, g)); b0.scale.set(0.8, 1.6, 0.5);
      ns(mesh(sphere(0.05, 6, 5), mat('#2a1808'), 0, 0.15, 0, g));
      for (const sd of [-1, 1]) {
        const a = ns(mesh(cyl(0.006, 0.006, 0.25, 3), mat('#1a0e06'), sd * 0.05, 0.27, 0.02, g)); a.rotation.z = -sd * 0.4;
        for (let k = -1; k <= 1; k++) { const l = ns(mesh(cyl(0.006, 0.006, 0.12, 3), mat('#1a0e06'), sd * 0.08, k * 0.06, -0.02, g)); l.rotation.z = sd * 1.2; }
      }
      return true;
    }
    case 'jk_roaches': { // cockroaches crawling over a victim
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39996, y = ((i * 5) % 7 / 6 - 0.5) * 0.7;
        const rr = ns(mesh(sphere(0.06, 6, 5), mat(i % 2 ? '#4a2a10' : '#2a1808', { spec: 0.9 }), Math.sin(a) * 0.32, y, Math.cos(a) * 0.3, g));
        rr.scale.set(0.8, 1.7, 0.5); rr.rotation.set(a, 0, a * 0.7);
      }
      return true;
    }
    case 'jk_icefall': { // a jagged block of ice
      ns(mesh(H.geo('jkice', () => new T.IcosahedronGeometry(0.75, 0)), mat('#c8ecff', { spec: 1, emit: 0.2, transparent: true, opacity: 0.85 }), 0, 0, 0, g)).scale.set(1, 1.4, 1);
      for (let i = 0; i < 5; i++) { const a = i * 1.26; const s = ns(mesh(cone(0.18, 0.8, 5), mat('#e8f8ff', { spec: 1, emit: 0.3 }), Math.sin(a) * 0.45, -0.4, Math.cos(a) * 0.45, g)); s.rotation.set(Math.PI + Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); }
      return true;
    }
    case 'jk_iceshards': { // ice spikes left where an icefall landed
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, d = 0.3 + (i % 3) * 0.35; const s = ns(mesh(cone(0.12, 0.6 + (i % 2) * 0.4, 5), mat('#d8f4ff', { spec: 1, emit: 0.3, transparent: true, opacity: 0.85 }), Math.sin(a) * d, 0.3, Math.cos(a) * d, g)); s.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }
      ns(mesh(cyl(1.3, 1.3, 0.03, 18), mat('#e8f8ff', { transparent: true, opacity: 0.6, depthWrite: false }), 0, 0.02, 0, g));
      return true;
    }
    case 'jk_iceblock': { // a victim frozen solid
      ns(mesh(box(1.1, 1.9, 1.1), mat('#bfe8ff', { spec: 1, emit: 0.25, transparent: true, opacity: 0.4, depthWrite: false }), 0, -0.2, 0, g));
      for (let i = 0; i < 4; i++) { const s = ns(mesh(cone(0.12, 0.45, 4), mat('#e8f8ff', { spec: 1, emit: 0.3 }), (i % 2 ? 0.5 : -0.5), 0.6 - i * 0.35, (i < 2 ? 0.5 : -0.5), g)); s.rotation.set(i * 0.8, 0, i * 1.1); }
      return true;
    }
    case 'jk_frostwave': { // Frost Calm: a fan of frost across the ground and cold mist (along +Z)
      const R = 8;
      ns(mesh(H.geo('jkfw', () => new T.CircleGeometry(R, 24, Math.PI / 2 - 1.05, 2.1).rotateX(-Math.PI / 2)), mat('#e0f6ff', { emit: 0.4, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.03, 0, g));
      for (let i = 0; i < 14; i++) { const a = -0.95 + (i / 13) * 1.9, d = 2 + (i % 4) * 1.5; ns(mesh(sphere(0.6 + (i % 3) * 0.2, 8, 6), mat('#f4fbff', { transparent: true, opacity: 0.4, depthWrite: false }), Math.sin(a) * d, 0.6, Math.cos(a) * d, g)); }
      return true;
    }
    case 'jk_coffin': { // the Smallpox Deity's coffin round a victim (lid open)
      const wood = mat('#4a3424', { spec: 0.15 }), dk = mat('#2a1c14');
      ns(mesh(box(1.1, 0.12, 1.0), wood, 0, -0.75, 0, g));
      for (const sd of [-1, 1]) { ns(mesh(box(0.08, 2.1, 1.0), wood, sd * 0.55, 0.25, 0, g)); ns(mesh(box(1.1, 2.1, 0.08), wood, 0, 0.25, sd * 0.5, g)).visible = sd < 0; }
      const lid = ns(mesh(box(1.15, 2.2, 0.08), dk, 0.85, 0.3, 0.75, g)); lid.rotation.y = -1.2;
      ns(mesh(box(0.08, 0.6, 0.02), mat('#e8e0c8'), 0.95, 0.5, 0.9, g)).rotation.y = -1.2;
      return true;
    }
    case 'jk_coffinlid': { // the lid slammed shut
      const dk = mat('#2a1c14');
      ns(mesh(box(1.2, 2.2, 1.1), dk, 0, 0.25, 0, g));
      ns(mesh(box(0.12, 0.7, 0.05), mat('#e8e0c8'), 0, 0.5, 0.57, g));
      ns(mesh(box(0.45, 0.12, 0.05), mat('#e8e0c8'), 0, 0.65, 0.57, g));
      return true;
    }
    case 'jk_crack': { // the ground cracked by a smash
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const c = ns(mesh(box(0.1, 0.03, 1.5 + (i % 3) * 0.5), mat('#2a2018'), Math.sin(a) * 0.8, 0.02, Math.cos(a) * 0.8, g)); c.rotation.y = a; }
      ns(mesh(cyl(0.7, 0.7, 0.03, 12), mat('#3a2e22', { transparent: true, opacity: 0.8, depthWrite: false }), 0, 0.01, 0, g));
      return true;
    }
    case 'jk_fingeraura': { // a swallowed finger: dark red cursed energy and Sukuna's marks
      ns(mesh(sphere(0.85, 12, 8), mat('#5a0a18', { emit: 0.8, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 0.7 + i * 0.1, 0.02, Math.PI * 2, 18), glow('#d01a3a'), 0, -0.4 + i * 0.4, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_question': { // a "?" over the victim's head
      const m = glow('#ffe8f0');
      ns(mesh(torus(H, 0.16, 0.05, Math.PI * 1.3, 12), m, 0, 0.2, 0, g)).rotation.z = -0.6;
      ns(mesh(cyl(0.05, 0.05, 0.18, 6), m, 0, -0.04, 0, g));
      ns(mesh(sphere(0.06, 6, 5), m, 0, -0.25, 0, g));
      return true;
    }
    case 'jk_insectarmor': { // Yorozu's insect armour: a carapace and four glassy wings
      const sh = mat('#2a3a4a', { spec: 1 });
      ns(mesh(sphere(0.48, 14, 10), sh, 0, 0.05, -0.08, g)).scale.set(1, 1.15, 0.95);
      for (const sd of [-1, 1]) for (const [k, a] of [[1, 0.45], [0.75, 1.05]]) {
        const w = ns(mesh(sphere(0.55 * k, 12, 8), mat('#d8eef8', { transparent: true, opacity: 0.5, depthWrite: false, spec: 1 }), sd * 0.55, 0.3 - (a - 0.45) * 0.5, -0.55, g));
        w.scale.set(1, 0.08, 2.0); w.rotation.set(0.6, sd * 0.6, sd * a);
      }
      return true;
    }
    case 'jk_sphere': { // the True Sphere: a perfect black sphere ringed in light
      ns(mesh(sphere(0.65, 24, 18), mat('#0c0c12', { spec: 1 }), 0, 0, 0, g));
      ns(mesh(sphere(0.85, 20, 14), mat('#c0d0ff', { emit: 1, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, g));
      ns(mesh(torus(H, 0.8, 0.03, Math.PI * 2, 32), glow('#e8f0ff'), 0, 0, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
  }
  return false;
}

register({
  units,
  items: {
    jk_scissors: { len: 0.8, r: 0.07, grip: 30, metal: true, mass: 1.0 },
    jk_ylblade: { len: 0.78, r: 0.07, grip: 30, metal: true, mass: 0.9 },
  },
  kinds: {
    jk_kurourushi: kurourushi, jk_uraume: uraume, jk_smallpox: smallpox,
    jk_rainbowdragon: dragon, jk_fingerbearer: fingerBearer, jk_kuchisake: kuchisake, jk_grasshopper: grasshopper, jk_yorozu: yorozu,
  },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
});
