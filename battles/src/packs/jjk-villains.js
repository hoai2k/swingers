// Jujutsu Kaisen: the curse users (faction JJK Curses, side 'curse', on jjk-core.js) -
// humans who sided with the curses in Shibuya and the Culling Game.
//  - Shigemo Haruta (Shibuya): a weak knife fighter whose technique, Miracles, stores up
//    small lucky breaks (one every few seconds, up to three, the gold stars over his head)
//    and spends one to survive a blow that should have killed him
//  - Jiro Awasaka (Shibuya): a tough brawler whose technique weakens any attack above a
//    threshold - the stronger the blow, the less it does (small hits land normally)
//  - Reggie Star (Culling Game): Contract Re-creation - he spends the receipts fluttering
//    round him to re-create what he bought: knives to throw, and a car he rams through a line
//  - Ogi Zen'in: the Zen'in clan swordsman, his blade wreathed in flame (burning slashes,
//    and a sweeping flame arc)
//  - Ogami: an old woman with the Séance technique - weak herself, she chants and calls
//    Toji Fushiguro's body down onto her grandson (a reserve: jk_toji_seance, the Toji kit
//    from jjk-curses.js), once a battle
// Everything drawn is a unit part, a projectile or a marker, so replays show it.
import { register } from '../ext.js';
import { aimTarget, leapSkill } from '../skills.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, aimPoint, launchVel, addProjectile,
  strike, handPos, torus, dome, tcol, tdark, chestShell, blast, addStatus,
} from './common.js';
import { UPY } from './ges-core.js';
import { isJJK, jk, onSecret, announce, isA, markerAt, markerOn, summon } from './jjk-core.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Euler();
const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const foe = (u, v) => v && v.alive && !v.dormant && v.team !== u.team;
const ns = (m) => { m.castShadow = false; return m; };

// ------------------------------------------------------------------ helpers
// (copies of jjk-curses.js's private helpers)
function techBanner(b, text, pos, gap = 6) {
  const s = jk(b);
  s.jkvT ??= {};
  if ((s.jkvT[text] ?? -99) > b.time - gap) return;
  s.jkvT[text] = b.time;
  announce(b, text, pos);
}
function castPose(u, anim, what = null) {
  u.st.attack = anim; u.st.attackT = 0; u.hitSet.clear(); u.released = false; u.jkCast = what;
}
function castEvent(u, t0, t1, table, at = 0.55) {
  if (!u.jkCast || !crossed(t0, t1, at)) return false;
  const w = u.jkCast;
  u.jkCast = null;
  u.released = true;
  table[w]?.(u);
  return true;
}
// victims the core melee sweep found since the last call (each once per swing)
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
// enemies within R in front of u (cos of the half-angle: k)
function enemiesInFront(u, R, k) {
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  return enemiesNear(u, u.pos, R).filter((v) => {
    const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    return (dx * fx + dz * fz) / d > k || d < v.skel.radius + 0.5;
  });
}
const busy = (u) => u.st.attack || u.stun > 0.2 || u.isDown() || u.battle.over || u.jkSealedT > u.battle.time;
const endMark = (m) => { if (m) m.t = 0; return null; };

// ------------------------------------------------------------------ Shigemo Haruta
// Miracles: every few seconds a little luck piles up (gold stars round his head, up to
// three at a time and `mirTotal` in a battle); a blow that would kill him spends one instead - he is left standing on a sliver
// of health, with a moment of grace so the rest of the volley can't finish him. A poor
// fighter otherwise: a knife and a quick jab.
const luckType = (n) => (n > 0 ? 'jk_luck' + Math.min(3, n) : null);
function setLuck(u, n) {
  const b = u.battle;
  u.jkMir = n;
  u.jkLuckMk = endMark(u.jkLuckMk);
  const t = luckType(n);
  if (t && u.alive) u.jkLuckMk = markerOn(b, u, t, PART.head, 9999, new THREE.Vector3(0, u.skel.rHead * 1.9, 0));
}
function miracle(u, text) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos;
  u.jkMirSafe = b.time + w.mirGrace;
  markerOn(b, u, 'jk_miracle', PART.chest, 1.2);
  b.emit('heal', c.x, c.y, c.z, 10);
  b.emit('spark', c.x, c.y + 0.4, c.z, 8);
  b.sound('gong', c, 0.9, 1.6);
  b.sound('heal', c, 0.9, 1.2);
  techBanner(b, text, u.headPos, 3);
}
const haruta = {
  melee: true,
  init(u) { const w = u.def.weapon; u.jkMirT = w.mirEvery; u.jkMirBank = w.mirTotal - w.mirStart; u.jkMirSafe = 0; u.jkLuckMk = null; setLuck(u, w.mirStart); },
  think: meleeThink,
  basic: 'Knife',
  skills: (u) => [
    { key: 'lb', name: `Miracle ×${u.jkMir || 0}`, icon: '🍀', cd: () => 0, max: () => 1,
      ready: (x) => ((x.jkMir || 0) > 0 ? (x.hp < x.maxHp ? true : 'unhurt') : 'none stored'),
      free: true,
      use(x) { // spend a stored miracle now: patched up and back on his feet
        if (!(x.jkMir > 0)) return false;
        const w = x.def.weapon;
        setLuck(x, x.jkMir - 1);
        x.hp = Math.min(x.maxHp, x.hp + x.maxHp * w.mirHeal);
        x.stun = 0;
        miracle(x, 'Miracle!');
        return true;
      } },
    leapSkill('rb', 4, 'Knife lunge'),
  ],
  step(u, dt) {
    const w = u.def.weapon;
    if (u.jkMir < w.mirMax && u.jkMirBank > 0) {
      u.jkMirT -= dt;
      if (u.jkMirT <= 0) {
        u.jkMirT = w.mirEvery;
        u.jkMirBank--;
        setLuck(u, u.jkMir + 1);
        const h = u.headPos;
        u.battle.emit('spark', h.x, h.y + 0.4, h.z, 2);
        u.battle.sound('tick', h, 0.4, 1.8);
      }
    }
  },
  hit(u, amount) {
    const b = u.battle, w = u.def.weapon;
    if (amount < u.hp) return amount;
    // a moment of grace after a miracle: the rest of the volley can't finish him
    if (u.jkMirSafe > b.time) return Math.max(0, u.hp - 1);
    if (!(u.jkMir > 0)) return amount;
    setLuck(u, u.jkMir - 1);
    u.hp = Math.max(u.hp, u.maxHp * w.mirHp);
    miracle(u, 'Miracle! Haruta should be dead');
    return 0;
  },
  die(u) { u.jkLuckMk = endMark(u.jkLuckMk); },
};

// ------------------------------------------------------------------ Jiro Awasaka
// His technique weakens any attack above a threshold: up to `cap` a blow does what it
// does, past it the stronger the blow the less gets through (cap * sqrt(cap / amount)) -
// a Hollow Purple barely scratches him, a schoolboy's jab still hurts. A brawler who
// leaps in and bowls people over with a shoulder tackle.
const awasaka = {
  melee: true,
  init(u) { u.jkTk = rand(1, 3); u.jkTkT = 0; u.jkTkHit = null; },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, c);
    if (u.jkTk <= 0 && !u.control && c.gap > w.tkMin && c.gap < w.tkMax && !busy(u) && u.airT <= 0) tackle(u, c.dirx, c.dirz);
    if (u.jkTkT > 0) u.desired.set(u.jkTkDx * c.spd * 1.5, 0, u.jkTkDz * c.spd * 1.5);
    return t;
  },
  basic: 'Fists',
  skills: [
    leapSkill('lb', 4, 'Leap in'),
    { key: 'rb', name: 'Shoulder tackle', icon: '🐂', cd: (u) => u.jkTk, max: (u) => u.def.weapon.tkCD, ready: (u) => (u.airT > 0 ? 'in the air' : true),
      use(u) { const a = u.control?.aimYaw ?? u.heading; tackle(u, Math.sin(a), Math.cos(a)); return true; } },
  ],
  step(u, dt) {
    u.jkTk -= dt;
    if (u.jkTkT <= 0) return;
    u.jkTkT -= dt;
    const b = u.battle, w = u.def.weapon, c = u.chestPos;
    b.grid.query(c.x, c.z, 3, (v) => {
      if (u.jkTkHit || !foe(u, v) || v.chestPos.distanceTo(c) > 1.0 + v.skel.radius) return;
      u.jkTkHit = v;
      _d.set(u.jkTkDx, 0.5, u.jkTkDz).normalize();
      strike(b, v, w.tkDmg, _d, Math.min(w.tkForce, v.M * 12), u, 'jk_tackle', PART.chest, 'crunch');
      if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 1.0 * (v.def.stagger ?? 1));
      b.sound('thump', c, 1.0, 0.6);
      u.jkTkT = Math.min(u.jkTkT, 0.1);
    });
  },
  hit(u, amount, part, attacker, kind) {
    const w = u.def.weapon, cap = w.cap;
    if (amount <= cap || attacker === u) return amount;
    const b = u.battle, c = u.chestPos;
    // the bigger it was, the more of it his technique swallows
    if (!(u.jkDampT > b.time)) {
      u.jkDampT = b.time + 0.3;
      markerOn(b, u, 'jk_dampen', PART.chest, 0.45);
      b.emit('spark', c.x, c.y, c.z, 3);
      b.sound('thump', c, 0.6, 0.5);
    }
    if (amount > cap * 2.5) announce(b, "Awasaka's technique: the stronger the blow, the less it does!", u.headPos, 'awasaka');
    return cap * Math.sqrt(cap / amount);
  },
};
function tackle(u, dx, dz) {
  const w = u.def.weapon;
  u.jkTk = w.tkCD * rand(0.85, 1.15);
  u.jkTkT = w.tkT;
  u.jkTkDx = dx; u.jkTkDz = dz;
  u.jkTkHit = null;
  u.heading = u.faceYaw = Math.atan2(dx, dz);
  u.rag.impulseAll(dx * u.M * w.tkV, u.M * 1.2, dz * u.M * w.tkV);
  u.battle.emit('dust', u.pos.x, u.pos.y - u.skel.standHeight, u.pos.z, 2);
  u.battle.sound('charge', u.pos, 0.7, 0.8);
  if (Math.random() < 0.5) u.battle.voice(u, 'attack', true);
}

// ------------------------------------------------------------------ Reggie Star
// Contract Re-creation: the receipts round him are things he once bought. A throw spends
// one on a re-created knife; four buy back a car that he rams through a line of enemies.
// The wad is all he has: out of receipts, he can only shove.
const receipts = (u) => Math.floor(u.jkRc || 0);
function spendReceipts(u, n) {
  const b = u.battle, h = handPos(u, _o);
  u.jkRc -= n;
  for (let i = 0; i < Math.min(5, n + 1); i++) {
    addProjectile(b, 'jk_receipt', h, _v.set(rand(-1.5, 1.5), rand(1.5, 3.2), rand(-1.5, 1.5)), u, { life: 2.6, damage: 0, force: 0, spin: new THREE.Vector3(rand(-4, 4), rand(-6, 6), rand(-4, 4)), sway: rand(0, 6) });
  }
  b.emit('spark', h.x, h.y, h.z, 2);
  b.sound('magic', h, 0.5, 1.7);
  if (receipts(u) <= 0) u.jkRcMk = endMark(u.jkRcMk);
}
const reggie = {
  aim: true,
  init(u) {
    const w = u.def.weapon;
    u.attackDur = w.windup; u.jkRc = w.rcStart; u.jkCar = w.carFirst * rand(0.8, 1.2); u.jkRcSpin = rand(0, 6);
    u.jkRcMk = markerOn(u.battle, u, 'jk_receipts', PART.chest, 9999);
  },
  think: rangedThink,
  basic: 'Shove', ranged: 'Re-created knife',
  skills: (u) => [
    { key: 'lb', name: `Re-create: car (${receipts(u)} receipts)`, icon: '🚗', cd: (x) => x.jkCar, max: (x) => x.def.weapon.carCD,
      ready: (x) => (receipts(x) >= x.def.weapon.carCost ? true : 'receipts'),
      use(x) { x.jkCar = x.def.weapon.carCD; x.aimAt = aimTarget(x, x.def.weapon.carRange, 4); castPose(x, 'jk_push', 'car'); techBanner(x.battle, 'Contract Re-creation: car!', x.headPos, 4); return true; } },
  ],
  event(u, t0, t1) {
    if (castEvent(u, t0, t1, { car: rideCar })) return;
    const w = u.def.weapon, b = u.battle;
    if (u.st.attack !== u.anim || !crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    if (receipts(u) < 1) { // out of receipts: a plain shove at whoever is close
      const v = u.target;
      if (foe(u, v) && flat(v.pos, u.pos) < u.reachDist + v.skel.radius + 0.6) {
        _d.set(v.pos.x - u.pos.x, 0.3, v.pos.z - u.pos.z).normalize();
        strike(b, v, w.shoveDmg, _d, Math.min(w.force, v.M * 5), u, 'melee', PART.chest, 'punch');
      }
      return;
    }
    spendReceipts(u, 1);
    const h = handPos(u, _o).clone();
    aimPoint(u, _p, 0.5, 0.5);
    for (let i = 0; i < w.knives; i++) {
      launchVel(h, _p, w.speed, 9.81 * 0.4, false, 0.04, _v);
      addProjectile(b, 'jk_rknife', h, _v, u, { life: 3, spin: new THREE.Vector3(0, 0, 0) });
    }
    b.sound('throw', h, 0.6, 1.3);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkCar -= dt;
    if (w.rcEvery > 0 && u.jkRc < w.rcMax) {
      const had = receipts(u);
      u.jkRc = Math.min(w.rcMax, u.jkRc + dt / w.rcEvery);
      if (!had && receipts(u) > 0 && !u.jkRcMk) u.jkRcMk = markerOn(b, u, 'jk_receipts', PART.chest, 9999);
    }
    // the receipts flutter round him
    if (u.jkRcMk) { u.jkRcSpin += dt * 2.2; u.jkRcMk.lq.setFromEuler(_e.set(Math.sin(u.jkRcSpin * 1.7) * 0.15, u.jkRcSpin, Math.cos(u.jkRcSpin * 1.3) * 0.12)); }
    if (u.jkCar > 0 || u.control || busy(u) || receipts(u) < w.carCost) return;
    const t = u.target && u.target.alive ? u.target : null;
    if (!t || flat(t.pos, u.pos) > w.carRange || flat(t.pos, u.pos) < 3) { u.jkCar = 0.4; return; }
    u.jkCar = w.carCD * rand(0.9, 1.1);
    u.aimAt = t;
    castPose(u, 'jk_push', 'car');
    techBanner(b, 'Contract Re-creation: car!', u.headPos, 4);
  },
  die(u) { u.jkRcMk = endMark(u.jkRcMk); },
};
// a re-created car, launched along the ground at the target: it ploughs through
// everyone on the way and crashes at the end of its run
function rideCar(u) {
  const b = u.battle, w = u.def.weapon;
  if (receipts(u) < w.carCost) return;
  spendReceipts(u, w.carCost);
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  aimPoint(u, _p, 0.3, 0.5);
  let dx = _p.x - u.pos.x, dz = _p.z - u.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) { dx = fx; dz = fz; } else { dx /= d; dz /= d; }
  _o.set(u.pos.x + dx * 1.8, 0, u.pos.z + dz * 1.8);
  _o.y = b.terrain.height(_o.x, _o.z) + 0.75;
  const pr = addProjectile(b, 'jk_car', _o, _v.set(dx * w.carSpeed, 0, dz * w.carSpeed), u, { life: w.carRange * 1.1 / w.carSpeed, damage: w.carDmg, force: w.carForce, spin: new THREE.Vector3(0, 0, 0) });
  pr.quat.setFromAxisAngle(UPY, Math.atan2(dx, dz));
  b.emit('spark', _o.x, _o.y, _o.z, 10);
  b.sound('charge', _o, 1.0, 0.6);
  b.sound('whoosh', _o, 1.2, 0.4);
}
function carHit(b, pr, v) {
  if (!foe(pr, v) || pr.hits.has(v)) return;
  pr.hits.add(v);
  _d.copy(pr.vel).normalize();
  const c = v.chestPos;
  _v.set(c.x - pr.pos.x, 0, c.z - pr.pos.z);
  const sd = _v.x * -_d.z + _v.z * _d.x >= 0 ? 1 : -1; // thrown over the bonnet, to the side
  _v.set(_d.x * 0.7 - _d.z * sd * 0.5, 0.6, _d.z * 0.7 + _d.x * sd * 0.5).normalize();
  strike(b, v, pr.damage, _v, Math.min(pr.force, v.M * 14), pr.owner, 'jk_car', PART.chest, 'crunch');
  if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 1.1 * (v.def.stagger ?? 1));
  b.sound('crash', c, 0.8, 1.1);
}
function carCrash(b, pr) {
  if (pr.done) return;
  pr.done = true;
  blast(b, pr.pos, 2.6, pr.damage * 0.45, pr.force * 0.5, pr.owner, { fx: 0, friendly: 0.25, sound: 'crash', pitch: 0.8 });
  b.emit('dust', pr.pos.x, pr.pos.y - 0.5, pr.pos.z, 5);
}

// ------------------------------------------------------------------ Ogi Zen'in
// A Zen'in swordsman whose blade burns: every cut sets the victim alight, and every few
// seconds a wide flaming slash sweeps the ground in front of him.
const ogi = {
  melee: true,
  init(u) { const w = u.def.weapon; u.jkFS = w.fsFirst * rand(0.8, 1.2); },
  think: meleeThink,
  basic: 'Flaming blade',
  skills: [
    leapSkill('lb', 4, 'Close in'),
    { key: 'rb', name: 'Blazing slash', icon: '🔥', cd: (u) => u.jkFS, max: (u) => u.def.weapon.fsCD,
      use(u) { flameSlashCast(u); return true; } },
  ],
  event(u, t0, t1) { castEvent(u, t0, t1, { slash: flameSlash }, 0.45); },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    newVictims(u, (v) => { if (v.alive) addStatus(b, v, 'burn', w.burnT, w.burnDps, u); });
    if (u.st.attack === u.anim && Math.random() < dt * 8) { const h = handPos(u, _o); b.emit('spark', h.x, h.y + 0.4, h.z, 1); }
    u.jkFS -= dt;
    if (u.jkFS > 0 || u.control || busy(u)) return;
    if (enemiesInFront(u, w.fsR, w.fsCos).length) flameSlashCast(u);
    else u.jkFS = 0.3;
  },
};
function flameSlashCast(u) {
  const w = u.def.weapon;
  u.jkFS = w.fsCD * rand(0.9, 1.1);
  castPose(u, 'slam', 'slash');
  techBanner(u.battle, 'Blazing slash!', u.headPos, 6);
  u.battle.sound('fire', u.chestPos, 0.8, 0.9);
}
function flameSlash(u) {
  const b = u.battle, w = u.def.weapon, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  for (const v of enemiesInFront(u, w.fsR, w.fsCos)) {
    const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    _d.set(dx / d, 0.35, dz / d).normalize();
    strike(b, v, w.fsDmg, _d, Math.min(w.fsForce, v.M * 9), u, 'jk_flame', PART.chest, 'slash');
    addStatus(b, v, 'burn', w.burnT * 1.5, w.burnDps, u);
  }
  _o.copy(u.pos); _o.y = b.terrain.height(_o.x, _o.z) + 0.9;
  markerAt(b, 'jk_fireslash', _o, 0.4, u.heading);
  const c = u.chestPos;
  b.emit('explode', c.x + fx * 1.8, c.y - 0.2, c.z + fz * 1.8, 1.4, 2);
  b.sound('whoosh', c, 1.1, 0.7);
}

// ------------------------------------------------------------------ Ogami
// Séance: she chants with her hands raised (a few seconds, rooted to the spot; knocked
// down or badly dazed, she has to start again) and calls Toji Fushiguro's body down onto her grandson -
// the Toji reserve steps out beside her and fights for her side. Once a battle. As in
// Shibuya, the body remembers who it was: Toji's first blow kills Ogami, then he fights on.
// Weak herself: she slaps whoever gets too close and keeps her distance.
const OGAMI_TOJI = 'jk_toji_seance';
const tojiReady = (u) => u.battle.units.some((s) => s.reserveOf === u && s.dormant && s.def.id === OGAMI_TOJI);
const ogami = {
  melee: true,
  init(u) { const w = u.def.weapon; u.jkSe = w.seFirst * rand(0.8, 1.2); u.jkChant = 0; u.jkChantMk = null; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, gap, dirx, dirz, spd } = c;
    if (u.jkChant > 0) { u.desired.set(0, 0, 0); return t; }
    // she hangs back (behind Toji once he is out), slapping whoever reaches her
    if (gap > w.keep) u.desired.set(dirx * spd * 0.8, 0, dirz * spd * 0.8);
    else if (gap < w.keep * 0.6 && gap > 1.2) u.desired.set(-dirx * spd * 0.6, 0, -dirz * spd * 0.6);
    if (c.dist - t.skel.radius < u.reachDist + 0.35 && u.cooldown <= 0 && !u.st.attack && !u.isDown()) u.startAttack();
    if (u.st.attack) u.desired.multiplyScalar(0.35);
    return t;
  },
  basic: 'Slap',
  skills: [
    { key: 'lb', name: 'Séance: Toji', icon: '🕯️', cd: (u) => (u.jkChant > 0 ? 99 : u.jkSe), max: (u) => u.def.weapon.seCD,
      ready: (u) => (!tojiReady(u) ? 'done' : u.jkChant > 0 ? 'chanting' : true),
      use(u) { startChant(u); return true; } },
  ],
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.jkSe -= dt;
    if (u.jkChant > 0) {
      // knocked about mid-chant: it breaks off
      if (u.stun > 0.9 || u.isDown() || u.jkSealedT > b.time || b.over) { stopChant(u, true); return; }
      u.jkChant -= dt;
      if (u.st.attack !== 'jk_sign') castPose(u, 'jk_sign', null);
      u.st.attackT = Math.min(u.st.attackT, 0.7); // (hands held up)
      if (Math.random() < dt * 5) { const h = u.headPos; b.emit('spark', h.x + rand(-0.6, 0.6), h.y + rand(0, 0.6), h.z + rand(-0.6, 0.6), 1); }
      if (u.jkChant <= 0) { stopChant(u, false); seance(u); }
      return;
    }
    if (u.jkSe > 0 || u.control || busy(u) || !tojiReady(u)) return;
    const t = u.target && u.target.alive ? u.target : null;
    if (t && flat(t.pos, u.pos) < w.seRange) startChant(u);
    else u.jkSe = 0.5;
  },
  die(u) { stopChant(u, false); },
};
function startChant(u) {
  const b = u.battle, w = u.def.weapon;
  u.jkChant = w.chantT;
  u.jkSe = w.seCD;
  castPose(u, 'jk_sign', null);
  u.jkChantMk = endMark(u.jkChantMk);
  _o.copy(u.pos); _o.y = b.terrain.height(_o.x, _o.z) + 0.04;
  u.jkChantMk = markerAt(b, 'jk_seance', _o, w.chantT + 0.2, u.heading);
  techBanner(b, 'Séance...', u.headPos, 4);
  b.sound('gong', u.chestPos, 0.6, 0.6);
  b.voice(u, 'sing', true);
}
function stopChant(u, broken) {
  u.jkChant = 0;
  u.jkChantMk = endMark(u.jkChantMk);
  if (u.st.attack === 'jk_sign') u.st.attack = null;
  if (broken) { u.jkSe = u.def.weapon.seRetry; const h = u.headPos; u.battle.emit('dust', h.x, h.y, h.z, 1); }
}
function seance(u) {
  const b = u.battle, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  _p.set(u.pos.x + fx * 1.8 + fz * 0.8, 0, u.pos.z + fz * 1.8 - fx * 0.8);
  _p.y = b.terrain.height(_p.x, _p.z);
  const s = summon(b, u, OGAMI_TOJI, _p, u.heading);
  if (!s) return;
  s.stun = 0.4;
  markerAt(b, 'jk_seburst', _p.clone().setY(_p.y + 0.04), 1.4, rand(0, 6));
  b.emit('spark', _p.x, _p.y + 1, _p.z, 16);
  b.sound('gong', _p, 1.2, 0.5);
  b.sound('boom', _p, 0.8, 0.6);
  announce(b, 'Séance: Toji Fushiguro descends!', s.headPos);
  b.voice(s, 'cry', true);
  s.jkSeEnd = b.time + u.def.weapon.seLife; s.jkSeMeg = 0;
  // ...and the body remembers who it was: his first blow is for Ogami
  b.delayed.push([u.def.weapon.turnT, () => {
    if (!u.alive || !s.alive || b.over) return;
    s.heading = s.faceYaw = Math.atan2(u.pos.x - s.pos.x, u.pos.z - s.pos.z);
    s.startAttack();
    _d.set(u.pos.x - s.pos.x, 0.4, u.pos.z - s.pos.z).normalize();
    strike(b, u, u.hp + 100, _d, 500, s, 'jk_seance', PART.chest, 'crunch');
    announce(b, 'Toji turns on Ogami: the body remembers who it was', s.headPos);
  }]);
}

// the séance doesn't last: after a while the borrowed body gives out - sooner if Toji
// meets an enemy Megumi (in Shibuya he asked the boy's name, said "Good for you", and
// ended it himself)
function endSeance(b, s, text) {
  s.jkSeEnd = 0;
  const c = s.chestPos;
  markerAt(b, 'jk_seburst', _p.set(s.pos.x, b.terrain.height(s.pos.x, s.pos.z) + 0.04, s.pos.z), 1.2, rand(0, 6));
  b.emit('spark', c.x, c.y, c.z, 10);
  b.sound('gong', c, 0.9, 0.45);
  announce(b, text, s.headPos);
  s.die(null);
}
onSecret((b, dt) => {
  if (b.over) return;
  for (const s of b.units) {
    if (!s.jkSeEnd || !s.alive || s.dormant) continue;
    if (b.time > s.jkSeEnd) { endSeance(b, s, "The séance wears off: Toji's borrowed body gives out"); continue; }
    let meg = false;
    for (const v of b.foes(s.team)) if (isA(v, 'jk_megumi') && flat(v.pos, s.pos) < 6) { meg = true; break; }
    s.jkSeMeg = meg ? s.jkSeMeg + dt : 0;
    if (s.jkSeMeg > 2) endSeance(b, s, 'SECRET: "Fushiguro? ...Good for you." Toji ends the séance himself');
  }
});

// ------------------------------------------------------------------ projectiles
const PJ = {
  // a re-created kitchen knife, point first (+Y)
  jk_rknife: { g: 9.81 * 0.4, len: 0.3, r: 0.12, life: 3, stick: true },
  // a receipt fluttering down (just for show: it hits nothing)
  jk_receipt: {
    g: 1.6, len: 0, r: 0.05, life: 2.6,
    step(b, pr, dt) { pr.sway += dt * 5; pr.vel.x += Math.sin(pr.sway) * dt * 4; pr.vel.z += Math.cos(pr.sway * 0.8) * dt * 4; pr.vel.multiplyScalar(1 - dt * 1.4); },
    hit: () => false,
    ground: () => true,
  },
  // the re-created car: drives straight through a line and crashes
  jk_car: {
    g: 0, len: 0, r: 1.1, life: 2,
    step(b, pr, dt) {
      const gy = b.terrain.height(pr.pos.x, pr.pos.z);
      pr.pos.y += (gy + 0.75 - pr.pos.y) * Math.min(1, dt * 10);
      b.grid.query(pr.pos.x, pr.pos.z, 3.5, (v) => { if (foe(pr, v) && !pr.hits.has(v) && flat(v.pos, pr.pos) < 1.3 + v.skel.radius) carHit(b, pr, v); });
      if (Math.random() < 0.7) b.emit('dust', pr.pos.x + rand(-0.6, 0.6), gy, pr.pos.z + rand(-0.6, 0.6), 0.8);
      if (pr.life <= dt) carCrash(b, pr);
    },
    hit(b, pr, v) { carHit(b, pr, v); return false; },
    ground(b, pr) { carCrash(b, pr); return true; },
  },
  // markers
  jk_luck1: { g: 0, len: 0, r: 0, life: 1 },
  jk_luck2: { g: 0, len: 0, r: 0, life: 1 },
  jk_luck3: { g: 0, len: 0, r: 0, life: 1 },
  jk_miracle: { g: 0, len: 0, r: 0, life: 1 },
  jk_dampen: { g: 0, len: 0, r: 0, life: 1 },
  jk_receipts: { g: 0, len: 0, r: 0, life: 1 },
  jk_fireslash: { g: 0, len: 0, r: 0, life: 1 },
  jk_seance: { g: 0, len: 0, r: 0, life: 1 },
  jk_seburst: { g: 0, len: 0, r: 0, life: 1 },
};

// ------------------------------------------------------------------ units
const VILLAIN = { aggro: 0.9, bravery: 0, voice: 1.0, chatter: 0.7, cry: 'cackle', idle: 'shift' };
const units = [
  {
    id: 'jk_haruta', name: 'Shigemo Haruta', faction: 'jjk_curses', side: 'curse', cost: 280, hp: 300, speed: 5.2,
    build: { scale: 0.98, girth: 0.9, arms: 1.0 },
    weapon: {
      line: 'Curse user · a knife · Miracles: stores up lucky breaks and spends them to survive what should be fatal',
      kind: 'jk_haruta', style: 'sword', anim: 'punch', item: 'jk_knife', damage: 26, reach: 0.85, cooldown: 0.6, force: 140,
      mirStart: 1, mirMax: 3, mirTotal: 3, mirEvery: 7, mirHp: 0.3, mirGrace: 0.6, mirHeal: 0.35,
    },
    look: { skin: '#e8c4a4', hat: 'jk_haruta_hair', top: 'jk_haruta', legs: '#3a4458', accent: '#2a2a30' },
    personality: { ...VILLAIN, aggro: 0.75, voice: 1.15, chatter: 0.9, cry: 'cackle', idle: 'shift' },
    stagger: 0.9,
    desc: 'A Shibuya curse user with a knife and the luck of the devil. Kill him once, and he gets back up.',
  },
  {
    id: 'jk_awasaka', name: 'Jiro Awasaka', faction: 'jjk_curses', side: 'curse', cost: 550, hp: 950, speed: 4.9,
    build: { scale: 1.12, girth: 1.15, arms: 1.05, armThick: 1.25, mass: 1.15 },
    weapon: {
      line: 'Curse user · brawler · his technique weakens big attacks: the stronger the blow, the less it does',
      kind: 'jk_awasaka', style: 'fists', anim: 'punch', item: 'jk_fist', damage: 58, reach: 1.0, cooldown: 0.7, force: 420,
      cap: 32, tkCD: 6, tkMin: 3, tkMax: 9, tkT: 0.7, tkV: 8, tkDmg: 50, tkForce: 900,
    },
    look: { skin: '#d8a888', hat: 'jk_awasaka_hair', top: 'jk_awasaka', legs: '#22222a', accent: '#18181e' },
    personality: { ...VILLAIN, aggro: 1, voice: 0.8, chatter: 0.5, cry: 'roar', idle: 'brace' },
    stagger: 0.3,
    desc: "A Shibuya curse user built like a wall. Hit him hard and it barely lands; hit him softly and it does.",
  },
  {
    id: 'jk_reggie', name: 'Reggie Star', faction: 'jjk_curses', side: 'curse', cost: 650, hp: 480, speed: 5.0,
    build: { scale: 1.04, girth: 0.95, legs: 1.04 },
    weapon: {
      line: 'Culling Game player · Contract Re-creation: spends his 16 receipts on re-created knives to throw and a car to ram a line',
      kind: 'jk_reggie', style: 'throw', anim: 'throw', item: 'none', damage: 30, speed: 17, range: 18, minRange: 5, cooldown: 1.6, force: 200,
      windup: 0.6, releaseAt: 0.6, knives: 2, shoveDmg: 12,
      rcStart: 16, rcMax: 16, rcEvery: 0,
      carCost: 4, carCD: 9, carFirst: 3, carRange: 18, carSpeed: 15, carDmg: 120, carForce: 1100,
    },
    look: { skin: '#eac8ac', hat: 'jk_reggie_hair', top: 'jk_reggie', legs: '#2a3448', accent: '#1e2430' },
    personality: { ...VILLAIN, aggro: 0.5, voice: 1.0, chatter: 0.9, cry: 'hey', idle: 'lean' },
    stagger: 0.6,
    desc: 'A Culling Game player who keeps every receipt. Anything he ever bought, he can have again - a car included.',
  },
  {
    id: 'jk_ogi', name: "Ogi Zen'in", faction: 'jjk_curses', side: 'curse', cost: 700, hp: 620, speed: 5.0,
    build: { scale: 1.06, girth: 1.0, arms: 1.02 },
    weapon: {
      line: "Zen'in clan swordsman · a blade wreathed in flame: burning cuts · Blazing slash sweeps a wide arc",
      kind: 'jk_ogi', style: 'twohand', anim: 'slam', item: 'jk_ogiblade', damage: 50, reach: 1.45, cooldown: 0.85, force: 320,
      burnT: 3, burnDps: 9, fsCD: 6, fsFirst: 2.5, fsR: 3.4, fsCos: 0.2, fsDmg: 62, fsForce: 600,
    },
    look: { skin: '#e2b896', hat: 'jk_ogi_hair', top: 'jk_ogi', legs: '#1e2422', accent: '#14181a' },
    personality: { ...VILLAIN, aggro: 1, voice: 0.85, chatter: 0.5, cry: 'charge', idle: 'regal' },
    stagger: 0.55,
    desc: "Maki's father, a Zen'in through and through. His sword burns as hot as his pride.",
  },
  {
    id: 'jk_ogami', name: 'Ogami', faction: 'jjk_curses', side: 'curse', cost: 550, hp: 220, speed: 4.0, face: 2,
    build: { scale: 0.84, girth: 0.92, head: 1.05, legs: 0.92 },
    weapon: {
      line: "Curse user · Séance: chants Toji Fushiguro's body down onto her grandson (a Toji on her side for 30 s, once a battle) - and Toji's first blow is for her",
      kind: 'jk_ogami', style: 'none', anim: 'punch', item: 'jk_beads', damage: 12, reach: 0.8, cooldown: 1.0, force: 120, keep: 7,
      chantT: 3.0, seFirst: 0.3, seCD: 6, seRetry: 3, seRange: 30, turnT: 1.2, seLife: 30,
    },
    reserve: [{ type: 'jk_toji_seance' }],
    look: { skin: '#e4c4a8', hat: 'jk_ogami_hair', top: 'jk_ogami', legs: '#2a2230', accent: '#1e1824' },
    personality: { ...VILLAIN, aggro: 0.3, voice: 1.3, chatter: 0.6, cry: 'royal', idle: 'regal' },
    stagger: 1.0,
    desc: "An old woman who talks to the dead. Give her a few seconds and she'll bring one back: Toji Fushiguro. He won't thank her.",
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

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, cone, sphere, mat, glow } = H;
  if (name === 'jk_knife') { // a combat knife: dark grip, a short clip-point blade
    const steel = mat('#c8ccd4', { spec: 1 });
    mesh(cyl(0.022 * s, 0.026 * s, 0.12 * s, 8), mat('#1e1e22'), 0, 0.0, 0, g);
    mesh(box(0.07 * s, 0.014 * s, 0.03 * s), mat('#3a3a40', { spec: 0.6 }), 0, 0.065 * s, 0, g); // guard
    mesh(box(0.012 * s, 0.2 * s, 0.045 * s), steel, 0, 0.17 * s, 0, g);
    mesh(cone(0.032 * s, 0.07 * s, 4), steel, 0, 0.3 * s, 0, g).scale.set(0.35, 1, 1);
    mesh(sphere(0.02 * s, 6, 5), tcol(H, team), 0, -0.065 * s, 0, g);
    return true;
  }
  if (name === 'jk_ogiblade') { // a katana wreathed in flame
    const steel = mat('#d8dce4', { spec: 1 });
    mesh(cyl(0.024 * s, 0.026 * s, 0.26 * s, 8), mat('#2a1a14'), 0, 0.0, 0, g); // tsuka
    for (let i = 0; i < 4; i++) mesh(box(0.05 * s, 0.012 * s, 0.05 * s), mat('#c8b070'), 0, (-0.09 + i * 0.06) * s, 0, g).rotation.y = i * 0.8; // wrap
    mesh(cyl(0.06 * s, 0.06 * s, 0.014 * s, 12), mat('#b89040', { spec: 0.8 }), 0, 0.14 * s, 0, g); // tsuba
    const bl = mesh(box(0.014 * s, 0.86 * s, 0.05 * s), steel, 0, 0.58 * s, 0.006 * s, g); bl.rotation.x = -0.04;
    mesh(cone(0.026 * s, 0.1 * s, 4), steel, 0, 1.05 * s, -0.012 * s, g).scale.set(0.5, 1, 1);
    // the flame along the edge (orange outside, yellow core)
    const fo = mat('#ff5a10', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), fm = mat('#ffa020', { emit: 1, transparent: true, opacity: 0.6, depthWrite: false }), fi = glow('#ffe070');
    for (let i = 0; i < 9; i++) { // tongues of flame licking up both edges of the blade
      const y = (0.22 + i * 0.095) * s, k = 1 - i * 0.05, sd = i % 2 ? 1 : -1;
      ns(mesh(cone(0.032 * s * k, 0.17 * s, 6), i % 3 ? fm : fo, 0, y, sd * 0.045 * s, g)).rotation.x = sd * 0.3;
      ns(mesh(cone(0.014 * s * k, 0.09 * s, 5), fi, 0, y - 0.02 * s, sd * 0.04 * s, g)).rotation.x = sd * 0.25;
    }
    ns(mesh(cone(0.035 * s, 0.16 * s, 6), fm, 0, 1.16 * s, -0.01 * s, g)); // flame off the tip
    return true;
  }
  if (name === 'jk_beads') { // Ogami's prayer beads, looped over her hand
    const bead = mat('#4a2a1e', { spec: 0.5 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mesh(sphere(0.018 * s, 6, 5), bead, Math.sin(a) * 0.06 * s, 0.05 * s + Math.cos(a) * 0.08 * s, 0.02 * s, g); }
    mesh(sphere(0.03 * s, 8, 6), tcol(H, team), 0, -0.04 * s, 0.02 * s, g);
    mesh(cone(0.02 * s, 0.07 * s, 6), mat('#c84a2a'), 0, -0.09 * s, 0.02 * s, g).rotation.x = Math.PI; // tassel
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'jk_haruta_hair': { // messy shoulder-length dark hair parted in the middle, stubble
      const hair = mat('#2a2220', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.08, 0.42, -0.25);
      const back = mesh(sphere(r * 1.08, 14, 10), hair, 0, -r * 0.3, -r * 0.32, g); back.scale.set(1.08, 1.25, 0.85);
      for (const sd of [-1, 1]) {
        lock(H, g, hair, onHead(r, sd * 0.12, 0.72, 1.03), [sd * 1, -0.55, 0.3], r * 0.22, r * 0.75); // the middle parting
        for (const [x, z, L] of [[0.95, 0.2, 1.15], [0.85, -0.25, 1.3], [0.6, -0.7, 1.2]]) lock(H, g, hair, [sd * x * r, r * 0.25, z * r], [sd * 0.25, -1, -0.05], r * 0.2, r * L);
      }
      const st = mat('#6a5446', { transparent: true, opacity: 0.45, depthWrite: false });
      mesh(H.geo('hr-stub' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.01, 14, 6, Math.PI / 2 - 0.8, 1.6, 1.95, 0.6)), st, 0, 0, 0, g); // stubble round the jaw
      return true;
    }
    case 'jk_awasaka_hair': { // a short crew cut, heavy brows, a broad jaw line
      const hair = mat('#1c1a1c', { spec: 0.15 });
      hairCap(H, g, r, hair, 1.04, 0.36, -0.15);
      const nape = mesh(sphere(r * 1.035, 14, 10), hair, 0, r * 0.08, -r * 0.2, g); nape.scale.set(1.0, 0.92, 0.84); // cropped short at the back
      for (const sd of [-1, 1]) { const br = mesh(box(r * 0.36, r * 0.09, r * 0.08), hair, ...onHead(r, sd * 0.33, 0.24, 1.03), g); br.rotation.z = -sd * 0.18; }
      const jaw = mesh(sphere(r * 0.62, 12, 8), mat('#d8a888', { spec: 0.15 }), 0, -r * 0.55, r * 0.25, g); jaw.scale.set(1.35, 0.6, 1.0);
      return true;
    }
    case 'jk_reggie_hair': { // long blond hair slicked straight back, stubble on the chin
      const hair = mat('#c8a050', { spec: 0.45 });
      hairCap(H, g, r, hair, 1.08, 0.44, -0.05);
      for (let i = -2; i <= 2; i++) lock(H, g, hair, [i * r * 0.22, r * 0.85, r * 0.3], [i * 0.08, 0.15, -1], r * 0.2, r * 1.15); // swept back
      const back = mesh(sphere(r * 1.0, 12, 10), hair, 0, -r * 0.3, -r * 0.45, g); back.scale.set(1.05, 1.15, 0.8);
      for (const sd of [-1, 1]) lock(H, g, hair, [sd * r * 0.7, -r * 0.2, -r * 0.6], [sd * 0.1, -1, -0.3], r * 0.2, r * 0.7);
      mesh(H.geo('rg-stub' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.01, 14, 6, Math.PI / 2 - 0.45, 0.9, 2.15, 0.45)), mat('#a8884a', { transparent: true, opacity: 0.55, depthWrite: false }), 0, 0, 0, g);
      return true;
    }
    case 'jk_ogi_hair': { // greying black hair slicked back, a moustache and a short beard
      const hair = mat('#1e1c1e', { spec: 0.35 }), grey = mat('#6a6668', { spec: 0.3 });
      hairCap(H, g, r, hair, 1.08, 0.42, -0.4);
      const back = mesh(sphere(r * 1.06, 14, 10), hair, 0, r * 0.05, -r * 0.25, g); back.scale.set(1.03, 0.98, 0.85);
      for (let i = -3; i <= 3; i++) lock(H, g, i % 2 ? grey : hair, onHead(r, i * 0.17, 0.72, 1.02), [i * 0.05, 0.25, -1], r * 0.14, r * 1.1); // combed straight back
      const knot = mesh(sphere(r * 0.24, 10, 8), hair, 0, r * 0.55, -r * 1.0, g); knot.scale.set(1, 0.8, 1); // a small topknot at the back
      for (const sd of [-1, 1]) { const m = mesh(box(r * 0.32, r * 0.07, r * 0.07), hair, ...onHead(r, sd * 0.17, -0.3, 1.04), g); m.rotation.z = sd * 0.35; } // moustache
      const bd = mesh(sphere(r * 0.24, 10, 8), hair, ...onHead(r, 0, -0.68, 0.95), g); bd.scale.set(1, 1.3, 0.7); // beard
      return true;
    }
    case 'jk_ogami_hair': { // white hair pulled back into a tight bun, a wrinkled brow
      const hair = mat('#dcd8d4', { spec: 0.3 }), wr = mat('#b89478');
      hairCap(H, g, r, hair, 1.07, 0.42, -0.1);
      const bun = mesh(sphere(r * 0.42, 12, 10), hair, 0, r * 0.62, -r * 0.82, g); bun.scale.set(1.1, 0.9, 0.9);
      mesh(cyl(r * 0.03, r * 0.03, r * 1.1, 6), mat('#3a2418'), 0, r * 0.66, -r * 0.82, g).rotation.z = 1.3; // a kanzashi through the bun
      mesh(sphere(r * 0.07, 6, 5), tc, -r * 0.55, r * 0.78, -r * 0.82, g);
      for (const y of [0.42, 0.52]) { const l = mesh(box(r * 0.5, r * 0.025, r * 0.03), wr, ...onHead(r, 0, y, 1.0), g); l.rotation.x = -0.4; } // wrinkles
      for (const sd of [-1, 1]) { const l = mesh(box(r * 0.2, r * 0.025, r * 0.03), wr, ...onHead(r, sd * 0.35, -0.3, 1.0), g); l.rotation.z = sd * 0.8; }
      return true;
    }
  }
  return false;
}

const TOPS = new Set(['jk_haruta', 'jk_awasaka', 'jk_reggie', 'jk_ogi', 'jk_ogami']);
function decorate(def, team, vis, H) {
  if (!isJJK(def.faction) || !TOPS.has(def.look.top)) return;
  const top = def.look.top;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, capsule } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const skin = mat(def.look.skin, { spec: 0.18 });
  const limb = (p) => skel.parts[p];
  const cover = (p, m, k = 1.15, f = 1, y = 0) => { const sp = limb(p); return mesh(capsule(sp.r * k, sp.hh * 2 * f), m, 0, sp.hh * y, 0, parts[p]); };
  const skirt = (m, top0, bot, len) => mesh(cyl(pel.r * top0, pel.r * bot, pel.r * len, 16), m, 0, -pel.r * len * 0.42, 0, P);
  const belt = (m, y = -hh - r * 0.38, k = 1.12) => mesh(cyl(r * k, r * (k + 0.02), r * 0.2, 16), m, 0, y, 0, C);
  const UA = [PART.uarmL, PART.uarmR], FA = [PART.farmL, PART.farmR], TH = [PART.thighL, PART.thighR], SH = [PART.shinL, PART.shinR];

  if (top === 'jk_haruta') {
    // a dark zip-up jacket over a grey shirt, a team scarf, jeans
    const jk0 = mat('#2c2e36', { spec: 0.2 }), shirt = mat('#8a8c90'), jeans = mat('#3a4458', { spec: 0.1 });
    chestShell(H, ch, jk0, C, 1.04);
    mesh(box(r * 0.45, (hh + r) * 1.7, r * 0.05), shirt, 0, 0, r * 1.15, C);
    mesh(box(r * 0.03, (hh + r) * 1.7, r * 0.06), mat('#9a9ca4', { spec: 1 }), r * 0.25, 0, r * 1.16, C); // the zip
    mesh(cyl(r * 0.58, r * 0.68, r * 0.3, 14), tc, 0, hh + r * 0.6, 0, C); // scarf
    for (const p of UA) cover(p, jk0, 1.25, 1);
    for (const p of FA) { cover(p, jk0, 1.22, 0.85, 0.15); }
    belt(mat('#1a1a1a'), -hh - r * 0.38, 1.12);
    for (const p of TH) cover(p, jeans, 1.35, 1);
    for (const p of SH) cover(p, jeans, 1.3, 0.85, 0.12);
  }
  if (top === 'jk_awasaka') {
    // a tight white vest showing his arms, a dark open shirt tied round the waist, dark trousers
    const vest = mat('#ece8e0', { spec: 0.1 }), dark = mat('#22222a', { spec: 0.15 });
    chestShell(H, ch, vest, C, 1.02);
    for (const sd of [-1, 1]) { const st = mesh(box(r * 0.22, r * 0.5, r * 0.05), vest, sd * r * 0.45, hh + r * 0.35, r * 0.3, C); st.rotation.x = -0.2; }
    for (const p of [...UA, ...FA]) cover(p, skin, 1.18, 1);
    belt(dark, -hh - r * 0.3, 1.18);
    for (const sd of [-1, 1]) { const sl = mesh(box(r * 0.28, r * 0.9, r * 0.1), dark, sd * r * 0.45, -hh - r * 0.85, r * 1.0, C); sl.rotation.z = sd * 0.2; } // the sleeves knotted in front
    mesh(box(r * 0.3, r * 0.22, r * 0.14), dark, 0, -hh - r * 0.36, r * 1.2, C);
    mesh(torus(H, r * 0.6, r * 0.035, Math.PI * 2, 16), mat('#c8a040', { spec: 1 }), 0, hh + r * 0.45, r * 0.12, C).rotation.x = Math.PI / 2 + 0.35; // a gold chain
    mesh(box(r * 0.5, r * 0.15, r * 0.1), tc, 0, -hh - r * 0.3, -r * 1.18, C);
    for (const p of TH) cover(p, dark, 1.4, 1);
    for (const p of SH) cover(p, dark, 1.35, 0.85, 0.12);
  }
  if (top === 'jk_reggie') {
    // a long dark coat over a white T-shirt, jeans; receipts stuffed in the coat pocket
    const coat = mat('#3a3028', { spec: 0.15 }), tee = mat('#f0eee8'), jeans = mat('#2a3448');
    chestShell(H, ch, coat, C, 1.05);
    mesh(box(r * 0.6, hh * 2 + r * 0.7, r * 0.05), tee, 0, r * 0.05, r * 1.12, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.2, (hh + r) * 1.0, r * 0.06), mat('#2a221c'), sd * r * 0.38, hh * 0.45, r * 1.13, C); l.rotation.z = sd * 0.2; } // lapels
    for (const p of UA) cover(p, coat, 1.28, 1);
    for (const p of FA) cover(p, coat, 1.25, 0.85, 0.15);
    const tails = mesh(cyl(pel.r * 1.25, pel.r * 1.55, pel.r * 2.6, 16), coat, 0, -pel.r * 1.0, -pel.r * 0.1, P); tails.scale.set(1, 1, 0.9);
    mesh(box(pel.r * 0.95, pel.r * 2.5, pel.r * 0.05), jeans, 0, -pel.r * 1.0, pel.r * 1.42, P);
    const paper = mat('#f6f4ec');
    for (let i = 0; i < 3; i++) { const rc = mesh(box(r * 0.22, r * 0.4, r * 0.01), paper, r * (0.55 + i * 0.06), -hh * 0.55 + i * r * 0.05, r * 1.12, C); rc.rotation.set(-0.2, 0.2, -0.3 + i * 0.3); }
    mesh(box(r * 0.5, r * 0.12, r * 0.06), tc, -r * 0.5, hh * 0.55, r * 1.12, C); // team pocket square
    for (const p of TH) cover(p, jeans, 1.35, 1);
    for (const p of SH) cover(p, jeans, 1.3, 0.85, 0.12);
  }
  if (top === 'jk_ogi') {
    // a black haori worn open over a dark green kimono (white under-collar), a team obi
    // with a gold cord, wide black hakama
    const kim = mat('#2a3430', { spec: 0.15 }), haori = mat('#141618', { spec: 0.2 }), hak = mat('#1e2422', { spec: 0.1 }), under = mat('#d8d4c8');
    chestShell(H, ch, haori, C, 1.04);
    mesh(box(r * 0.62, hh * 2 + r * 0.8, r * 0.05), kim, 0, r * 0.05, r * 1.12, C); // the kimono in the haori's opening
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.1, (hh + r) * 0.95, r * 0.05), under, sd * r * 0.14, hh * 0.45, r * 1.15, C); l.rotation.z = -sd * 0.3; }
    for (const sd of [-1, 1]) mesh(box(r * 0.1, hh * 2 + r * 0.8, r * 0.07), mat('#2a2c30'), sd * r * 0.33, r * 0.05, r * 1.13, C); // the haori's edges
    mesh(cyl(r * 0.56, r * 0.66, r * 0.3, 14), haori, 0, hh + r * 0.6, 0, C);
    for (const p of UA) { const sp = limb(p); cover(p, haori, 1.22, 1); mesh(cyl(sp.r * 1.5, sp.r * 2.2, sp.hh * 2.2, 10), haori, 0, -sp.hh * 0.1, 0, parts[p]); }
    for (const p of FA) { const sp = limb(p); mesh(cyl(sp.r * 1.9, sp.r * 2.2, sp.hh * 1.0, 10), haori, 0, sp.hh * 0.5, 0, parts[p]); cover(p, skin, 1.08, 0.55, -0.35); }
    belt(tc, -hh - r * 0.32, 1.15);
    mesh(cyl(r * 1.17, r * 1.17, r * 0.06, 16), mat('#c8b070'), 0, -hh - r * 0.2, 0, C); // gold cord
    skirt(hak, 1.15, 1.85, 2.5);
  }
  if (top === 'jk_ogami') {
    // a dark purple kimono with a pale collar, a team obi, a shawl over her shoulders
    const kim = mat('#3a2a44', { spec: 0.12 }), shawl = mat('#5a4a5e', { spec: 0.1 }), col = mat('#e8e2d6');
    chestShell(H, ch, kim, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.16, (hh + r) * 1.0, r * 0.05), col, sd * r * 0.22, hh * 0.4, r * 1.06, C); l.rotation.z = -sd * 0.42; }
    mesh(cyl(r * 0.55, r * 0.66, r * 0.28, 14), shawl, 0, hh + r * 0.6, 0, C);
    for (const p of UA) { const sp = limb(p); cover(p, kim, 1.25, 1); mesh(cyl(sp.r * 1.4, sp.r * 2.3, sp.hh * 2.3, 10), kim, 0, -sp.hh * 0.2, 0, parts[p]); }
    for (const p of FA) { const sp = limb(p); mesh(cyl(sp.r * 2.0, sp.r * 2.4, sp.hh * 1.1, 10), kim, 0, sp.hh * 0.45, 0, parts[p]); cover(p, skin, 1.05, 0.5, -0.4); }
    belt(tc, -hh - r * 0.25, 1.16);
    belt(td, -hh - r * 0.08, 1.17).scale.set(1, 0.3, 1);
    skirt(kim, 1.15, 1.45, 2.9);
  }
}

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, mat, glow } = H;
  const T = THREE;
  const star = (m, x, y, z, s) => { // a little four-point star (two crossed flat diamonds)
    for (const a of [0, Math.PI / 2]) { const d = ns(mesh(cone(s * 0.35, s * 2, 4), m, x, y, z, g)); d.scale.set(1, 1, 0.25); d.rotation.y = a; const e = ns(mesh(cone(s * 0.35, s * 2, 4), m, x, y, z, g)); e.scale.set(1, 1, 0.25); e.rotation.set(0, a, Math.PI); }
  };
  switch (type) {
    case 'jk_rknife': { // a re-created kitchen knife, point first (+Y), a shimmer of re-creation
      ns(mesh(box(0.012, 0.2, 0.05), mat('#d8dce4', { spec: 1, emit: 0.15 }), 0, 0.04, 0, g));
      ns(mesh(cone(0.03, 0.08, 4), mat('#d8dce4', { spec: 1 }), 0, 0.18, 0, g)).scale.set(0.4, 1, 1);
      ns(mesh(cyl(0.02, 0.022, 0.11, 8), mat('#2a1e18'), 0, -0.11, 0, g));
      ns(mesh(sphere(0.09, 8, 6), mat('#f6f0c8', { emit: 0.8, transparent: true, opacity: 0.2, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_receipt': { // a little paper receipt with printed lines
      ns(mesh(box(0.09, 0.16, 0.004), mat('#f6f4ec', { spec: 0.05 }), 0, 0, 0, g));
      for (let i = 0; i < 4; i++) ns(mesh(box(0.06, 0.008, 0.006), mat('#8a8a8a'), 0, 0.05 - i * 0.03, 0, g));
      return true;
    }
    case 'jk_receipts': { // receipts fluttering round Reggie (the marker turns)
      const paper = mat('#f6f4ec', { spec: 0.05 }), ink = mat('#8a8a8a');
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, R = 0.62 + (i % 2) * 0.12, y = -0.25 + ((i * 3) % 5) * 0.14;
        const p = new T.Group(); p.position.set(Math.sin(a) * R, y, Math.cos(a) * R); p.rotation.set(0.3 * Math.sin(i * 2), a + 1.2, 0.4 * Math.cos(i * 3)); g.add(p);
        ns(mesh(box(0.09, 0.16, 0.004), paper, 0, 0, 0, p));
        for (let k = 0; k < 3; k++) ns(mesh(box(0.06, 0.008, 0.006), ink, 0, 0.04 - k * 0.03, 0, p));
      }
      return true;
    }
    case 'jk_car': { // the re-created car, nose along +Z: a red hatchback, glowing faintly
      const body = mat('#c8282a', { spec: 0.8 }), dark = mat('#1a1a20', { spec: 0.4 }), glass = mat('#9ac8e8', { spec: 1, transparent: true, opacity: 0.75 });
      ns(mesh(box(1.5, 0.55, 3.0), body, 0, 0, 0, g));
      ns(mesh(box(1.36, 0.5, 1.7), body, 0, 0.5, -0.25, g));
      ns(mesh(box(1.38, 0.38, 1.5), glass, 0, 0.52, -0.25, g));
      for (const sx of [-0.72, 0.72]) for (const sz of [-0.95, 0.95]) { const w = ns(mesh(cyl(0.3, 0.3, 0.22, 12), dark, sx, -0.28, sz, g)); w.rotation.z = Math.PI / 2; }
      for (const sx of [-0.5, 0.5]) ns(mesh(box(0.3, 0.14, 0.04), glow('#fff6c8'), sx, 0.05, 1.51, g));
      ns(mesh(box(1.6, 1.3, 3.2), mat('#fff6c8', { emit: 0.8, transparent: true, opacity: 0.12, depthWrite: false }), 0, 0.2, 0, g));
      return true;
    }
    case 'jk_luck1': case 'jk_luck2': case 'jk_luck3': { // Haruta's stored miracles: gold stars over his head
      const n = +type.slice(-1), m = glow('#ffd84a');
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3; star(m, Math.sin(a) * 0.22 * (n > 1), Math.cos(i * 2) * 0.03, Math.cos(a) * 0.22 * (n > 1), 0.07); }
      return true;
    }
    case 'jk_miracle': { // a miracle: a burst of golden light and rings
      ns(mesh(sphere(0.75, 14, 10), mat('#fff0a0', { emit: 1, transparent: true, opacity: 0.3, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 0.7 + i * 0.15, 0.025, Math.PI * 2, 24), glow('#ffd84a'), 0, -0.3 + i * 0.3, 0, g)).rotation.x = Math.PI / 2 + i * 0.25;
      const m = glow('#fff6c8');
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; star(m, Math.sin(a) * 0.8, 0.5 + (i % 2) * 0.25, Math.cos(a) * 0.8, 0.09); }
      return true;
    }
    case 'jk_dampen': { // Awasaka's technique soaking up a big blow: a dull grey ripple
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 0.45 + i * 0.18, 0.03, Math.PI * 2, 20), mat('#b8bcc8', { emit: 0.4, transparent: true, opacity: 0.6 - i * 0.15, depthWrite: false }), 0, 0, 0.1, g));
      ns(mesh(sphere(0.6, 12, 8), mat('#c8ccd8', { transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, g)).scale.set(1, 1.2, 0.6);
      return true;
    }
    case 'jk_fireslash': { // Ogi's blazing slash: a crescent of flame in front (+Z)
      const fo = mat('#ff6a1a', { emit: 1, transparent: true, opacity: 0.65, depthWrite: false, side: T.DoubleSide });
      const arc = ns(mesh(torus(H, 2.4, 0.22, 2.4, 20), fo, 0, 0, 0, g)); arc.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.2); arc.scale.set(1, 1, 0.35);
      const core = ns(mesh(torus(H, 2.4, 0.08, 2.2, 20), glow('#ffe080'), 0, 0, 0, g)); core.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.1);
      for (let i = 0; i < 7; i++) { const a = -1.0 + (i / 6) * 2.0; ns(mesh(cone(0.18, 0.6, 6), fo, Math.sin(a) * 2.4, 0.2, Math.cos(a) * 2.4, g)); }
      return true;
    }
    case 'jk_seance': { // Ogami's chant: a ring of candles and pale spirit fire round her feet
      ns(mesh(cyl(1.3, 1.3, 0.02, 24), mat('#3a1a4a', { transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.01, 0, g));
      ns(mesh(torus(H, 1.3, 0.03, Math.PI * 2, 32), glow('#c8a0ff'), 0, 0.03, 0, g)).rotation.x = Math.PI / 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ns(mesh(cyl(0.05, 0.05, 0.3, 8), mat('#f2ead8'), Math.sin(a) * 1.3, 0.15, Math.cos(a) * 1.3, g));
        ns(mesh(cone(0.05, 0.14, 6), glow('#ffd06a'), Math.sin(a) * 1.3, 0.37, Math.cos(a) * 1.3, g));
        ns(mesh(sphere(0.18, 8, 6), mat('#b890ff', { emit: 1, transparent: true, opacity: 0.25, depthWrite: false }), Math.sin(a + 0.5) * 0.9, 0.9 + (i % 3) * 0.4, Math.cos(a + 0.5) * 0.9, g)).scale.set(1, 1.8, 1);
      }
      return true;
    }
    case 'jk_seburst': { // Toji's body called down: a pillar of pale spirit light
      ns(mesh(cyl(0.9, 1.2, 4, 20, 1, true), mat('#d8c0ff', { emit: 1, transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide }), 0, 2, 0, g));
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 1.0 + i * 0.3, 0.04, Math.PI * 2, 24), glow('#e8d8ff'), 0, 0.1 + i * 0.9, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
  }
  return false;
}

register({
  units,
  items: {
    jk_knife: { len: 0.34, r: 0.06, grip: 90, metal: true, mass: 0.3 },
    jk_ogiblade: { len: 1.15, r: 0.07, grip: 25, metal: true, mass: 1.1 },
    jk_beads: { len: 0.3, r: 0.1, grip: 90, phys: false },
  },
  kinds: { jk_haruta: haruta, jk_awasaka: awasaka, jk_reggie: reggie, jk_ogi: ogi, jk_ogami: ogami },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
});
