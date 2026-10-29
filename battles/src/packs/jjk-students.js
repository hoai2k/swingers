// Jujutsu Kaisen faction (jjk): the Tokyo / Kyoto students and Nanami.
// Built on jjk-core.js (domains, reserves, secrets, banners).
//  - Yuji Itadori: fists. Divergent Fist (every blow lands twice: the cursed energy
//    hits a beat later) and Black Flash (a crit with black-red lightning; after one he
//    is "in the zone" and lands more for a while). Very tough and fast.
//  - Aoi Todo: huge brawler. Boogie Woogie: he claps and two units swap places - he
//    drops himself into the enemy's backline (the shooter lands among his friends),
//    or takes the place of a friend in trouble.
//  - Nobara Kugisaki: hammers three nails at a time. Hairpin: nails that hit (or land)
//    blow up a moment later. Resonance: her straw doll hurts whoever she nailed.
//  - Kento Nanami: wrapped cleaver. Ratio Technique (a strike at the 7:3 point is a
//    big crit), Overtime (after 30 s of battle he loosens his tie and gets stronger).
//  - Maki Zen'in: Heavenly Restriction (no cursed energy: sure-hits don't find her),
//    very strong and fast; naginata, and the Split Soul Katana on her back cuts
//    through armour every third hit. Below 30% hp her glasses break: awakened.
//  - Panda: big punches; when the Panda core is knocked out the Gorilla core takes
//    over (once): Drumming Beat punches go through guards into whoever stands behind.
//  - Toge Inumaki: Cursed Speech in a cone: "Don't move!" (frozen), "Blast away!"
//    (knocked flying), and rarely "Die" (heavy damage, costs him a lot of hp, then a
//    sore throat). Otherwise he only says onigiri ingredients.
//  - Yuta Okkotsu: katana, Rika (a reserve: summoned when he is in trouble; full
//    manifestation when he drops low), Copy (techniques of nearby allies: Inumaki's
//    speech, Todo's clap, Yuji's black flash, Nanami's ratio, Nobara's resonance) and
//    the domain Authentic Mutual Love (a field of swords; the sure-hit is a random
//    copied technique).
// Secrets: "Brother!" (Todo claps Yuji next to his enemy for a sure Black Flash),
// Black Flash x Resonance (Yuji hits a target Nobara nailed), Yuta's copies, "Rika!"
// (full manifestation), Nanami's last words (Yuji is enraged), Panda's Gorilla Core,
// Maki's awakening.
// Everything drawn is a unit part, a projectile or a marker, so replays show it.
import { register } from '../ext.js';
import { aimTarget, leapSkill } from '../skills.js';
import { ATTACKS } from '../pose.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, crossed, aimPoint, launchVel, addProjectile,
  strike, arrowProj, handPos, torus, dome, headBand, tcol, tdark, chestShell, blast, tube, hoodGeo,
} from './common.js';
import { UPY, mark, markAt, setArmKey, STANCE } from './ges-core.js';
import {
  isJJK, onSecret, announce, enemyOf, isA, burntOut, openDomain, domainAt, domeMesh, summon, dismiss,
} from './jjk-core.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Euler();
const UNI = '#191a24', GOLDB = '#d8b04a', CE = '#5aa8ff';
export const AML_R = 9; // Authentic Mutual Love's radius (its marker is built at this size)

// ------------------------------------------------------------------ animations
ATTACKS.jk_clap = [ // arms flung wide, then a big clap in front of the chest
  [0.0, null, null, 0, 0, 0],
  [0.32, [-0.4, 0.75, -1.25, -1.35], [-0.4, 0.75, -1.25, -1.35], 0, -0.15, 0.05],
  [0.5, [0.95, 0.05, -1.35, -1.6], [0.95, 0.05, -1.35, -1.6], 0, 0.15, 0.12],
  [0.8, [0.95, 0.05, -1.3, -1.55], [0.95, 0.05, -1.3, -1.55], 0, 0.1, 0.1],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.jk_shout = [ // draw breath leaning back, then lean into the word
  [0.0, null, null, 0, 0, 0],
  [0.35, [0.3, 0.25, -0.3, -1.4], [0.6, 0.1, -1.2, -2.4], 0, -0.3, 0.1], // (right hand pulls the collar down)
  [0.5, [-0.2, 0.9, 0.55, 0.3], [-0.2, 0.9, 0.55, 0.3], 0, 0.45, 0.15],
  [0.75, [-0.2, 0.85, 0.5, 0.25], [-0.2, 0.85, 0.5, 0.25], 0, 0.4, 0.15],
  [1.0, null, null, 0, 0, 0],
];
STANCE.jk_cleaver = (st, pose) => { setArmKey(pose, 1, [0.1, 0.2, 0.1, -0.35]); }; // Nanami: the free hand hangs, unbothered
STANCE.jk_inumaki = (st, pose) => { setArmKey(pose, -1, [-0.15, 0.32, 0.3, -0.35]); setArmKey(pose, 1, [-0.15, 0.32, 0.3, -0.35]); }; // hands in pockets

// ------------------------------------------------------------------ per-battle state
const STATE = new WeakMap();
function S(b) {
  let s = STATE.get(b);
  if (!s) STATE.set(b, (s = { frozen: [] }));
  return s;
}
const markSpin = (b, type, pos, t) => {
  const s = markAt(b, type, pos, t);
  s.quat.setFromEuler(_e.set(rand(-1.2, 1.2), rand(0, Math.PI * 2), rand(-1.2, 1.2)));
  return s;
};
const ally = (u, v) => v && v.alive && v !== u && v.team === u.team;
const flatD = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function nearestWhere(b, p, r, f) {
  let best = null, bd = r * r;
  for (const v of b.units) {
    if (!v.alive || v.dormant) continue;
    const d = (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2;
    if (d < bd && f(v)) { bd = d; best = v; }
  }
  return best;
}
const countEnemies = (u, p, r) => {
  let n = 0;
  u.battle.grid.query(p.x, p.z, r, (v) => { if (enemyOf(u, v) && flatD(v.pos, p) < r) n++; });
  return n;
};

// New victims of the current melee swing (the core sweep fills u.hitSet; kind.step
// runs before it each step, so a victim shows up here the step after it was hit).
// sw.fresh is true on the first step of a new swing of the unit's own animation.
function swing(u) {
  const st = u.st, r = u.jkSw || (u.jkSw = { on: false, at: 0, n: 0, fresh: false, list: [] });
  r.fresh = false; r.list.length = 0;
  const own = st.attack && st.attack === u.anim;
  if (!own) { r.on = false; r.n = 0; r.at = 0; return r; }
  if (!r.on || st.attackT < r.at) { r.fresh = true; r.n = 0; }
  r.on = true; r.at = st.attackT;
  let i = 0;
  for (const v of u.hitSet) { if (i++ >= r.n && v.rag && !v.bc) r.list.push(v); }
  r.n = u.hitSet.size;
  return r;
}

// Tough fighters (Yuji, Todo, Maki, Panda) don't stay down: back on their feet quickly.
function toughUp(u, dt, k = 1) {
  if (u.stun > 0.05 || !u.isDown() || u.airT > 0.1) { u.jkDownT = 0; return; }
  u.jkDownT = (u.jkDownT || 0) + dt;
  if (u.jkDownT < 0.3 / k) return;
  u.jkDownT = 0;
  u.rag.impulse(PART.chest, 0, u.M * 2.2, 0);
  u.rag.impulse(PART.head, 0, u.M * 0.6, 0);
  u.rag.impulseAll(0, u.M * 1.6, 0);
}

// Move a unit (its whole ragdoll) to stand at (x, z).
function moveUnit(b, u, x, z) {
  const gy = b.terrain.height(x, z), p = u.pos;
  const dx = x - p.x, dz = z - p.z, dy = gy + u.skel.standHeight + 0.05 - p.y;
  for (const bd of u.rag.bodies) {
    const t = bd.translation();
    bd.setTranslation({ x: t.x + dx, y: t.y + dy, z: t.z + dz }, true);
    bd.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
  u.rag.read();
  for (const l of u.legs || []) l.state = 'free';
}
// can Boogie Woogie move this unit? (people only: no mounts, beasts, engines or summons
// with extra bodies; not sealed; and both on the same side of any domain barrier)
const swappable = (v) => v && v.alive && !v.dormant && !v.extras.length && !v.bc && !v.sm && !(v.jkSealedT > v.battle.time) && v.s < 2.6;
function swapUnits(b, a, c) {
  if (!swappable(a) || !swappable(c) || domainAt(b, a.pos) !== domainAt(b, c.pos)) return false;
  const ax = a.pos.x, az = a.pos.z, cx = c.pos.x, cz = c.pos.z;
  for (const v of [a, c]) {
    const gy = b.terrain.height(v.pos.x, v.pos.z);
    markAt(b, 'jk_swap', _p.set(v.pos.x, gy + 0.05, v.pos.z), 0.45);
    b.emit('dust', v.pos.x, gy, v.pos.z, 2);
  }
  moveUnit(b, a, cx, cz);
  moveUnit(b, c, ax, az);
  for (const v of [a, c]) { const gy = b.terrain.height(v.pos.x, v.pos.z); markAt(b, 'jk_swap', _p.set(v.pos.x, gy + 0.05, v.pos.z), 0.45); }
  b.sound('whoosh', a.pos, 0.8, 1.6);
  b.sound('whoosh', c.pos, 0.8, 1.6);
  return true;
}

// ------------------------------------------------------------------ Yuji Itadori
function yujiFlashChance(u) {
  const w = u.def.weapon, b = u.battle;
  return w.flash + (u.jkZone > b.time ? w.zone : 0) + (u.jkRage ? w.rage : 0);
}
function chargeFlash(u) {
  const b = u.battle;
  u.jkFlash = true;
  if (u.jkGlow) for (const g of u.jkGlow) g.t = 0;
  u.jkGlow = [PART.farmL, PART.farmR].map((p) => mark(b, u, 'jk_fistbf', p, u.attackDur + 0.2, new THREE.Vector3(0, -u.skel.handOffset * 1.15, 0)));
}
function clearGlow(u) { if (u.jkGlow) { for (const g of u.jkGlow) g.t = 0; u.jkGlow = null; } }
// Black Flash: cursed energy within a millionth of a second of the blow; the space
// bends, it hits 2.5 times as hard and sparks black and red
export function blackFlash(b, u, v, dmg, force) {
  const c = v.chestPos;
  _d.set(c.x - u.pos.x, 0, c.z - u.pos.z).normalize();
  _d.y = 0.5; _d.normalize();
  const f = Math.min(force, v.M * 18);
  v.hit(dmg, PART.chest, _d.x * f * 0.3, _d.y * f * 0.3, _d.z * f * 0.3, u, 'jk_blackflash');
  if (v.parriedAt !== b.time) {
    v.rag.impulseAll(_d.x * f * 0.7, _d.y * f * 0.7, _d.z * f * 0.7);
    v.stun = Math.max(v.stun, 1.3 * (v.def.stagger ?? 1));
  }
  _p.lerpVectors(u.chestPos, c, 0.7);
  markSpin(b, 'jk_bf', _p, 0.4);
  markSpin(b, 'jk_bf', _p, 0.25);
  b.emit('spark', _p.x, _p.y, _p.z, 14);
  b.emit('blood', c.x, c.y, c.z, 10, _d.x, _d.z);
  b.sound('punch', _p, 1.6, 0.55);
  b.sound('crash', _p, 0.8, 1.5);
  b.sound('clang', _p, 0.6, 0.5);
  b.sound('jk_black_flash', _p, 1.2, 1);
  u.expr = EXPR.happy;
  announce(b, 'Black Flash!', _p, 'jk_bf');
}
// Divergent Fist: the cursed energy lands a beat after the fist
function divergent(b, u, v, dmg) {
  b.delayed.push([0.18, () => {
    if (!v.alive || !v.rag) return;
    const c = v.chestPos;
    _d.set(c.x - u.pos.x, 0.3, c.z - u.pos.z).normalize();
    strike(b, v, dmg, _d, Math.min(u.def.weapon.force * 0.6, v.M * 6), u.alive ? u : null, 'jk_divergent', PART.chest, null);
    mark(b, v, 'jk_div', PART.chest, 0.3);
    b.sound('thud', c, 0.8, 0.7);
  }]);
}
const BF_CD = 10;
const yuji = {
  melee: true,
  init(u) { u.jkZone = 0; u.jkFlash = false; u.jkSure = false; u.jkGlow = null; u.bfCD = 3; },
  think: meleeThink,
  // possessed (src/skills.js): a Black Flash on demand, and a leap
  basic: 'Divergent Fist',
  skills: [
    { key: 'lb', name: 'Black Flash', icon: '⚡', free: true, cd: (u) => u.bfCD, max: () => BF_CD,
      use(u) { u.bfCD = BF_CD; u.jkSure = true; if (u.cooldown > 0.2) u.cooldown = 0.2; return true; } },
    leapSkill('rb'),
  ],
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (u.jkRage) u.buff = Math.max(u.buff, 0.1);
    u.bfCD -= dt;
    toughUp(u, dt, 1.5);
    const sw = swing(u);
    if (sw.fresh) {
      u.jkFlash = false;
      clearGlow(u);
      if (u.jkSure || Math.random() < yujiFlashChance(u)) { chargeFlash(u); if (Math.random() < 0.6) b.voice(u, 'cry', true); }
    }
    for (const v of sw.list) {
      if (!v.alive) continue;
      // Black Flash x Resonance: a target Nobara nailed in the last few seconds
      const nob = v.jkNailBy;
      const combo = nob && ally(u, nob) && b.time - v.jkNailT < 4 && b.time > (u.jkComboT || 0);
      if (combo) { u.jkComboT = b.time + 6; if (!u.jkFlash) chargeFlash(u); }
      if (u.jkFlash) {
        blackFlash(b, u, v, w.damage * w.flashMul, w.flashForce);
        u.jkFlash = false; u.jkSure = false; u.jkZone = b.time + w.zoneT;
        clearGlow(u);
        if (combo) {
          resonate(b, nob, v, 1.5, true);
          announce(b, 'Black Flash × Resonance!', v.chestPos, 'jk_bfreso');
        }
      } else divergent(b, u, v, w.damage * w.divK);
    }
    if (!u.st.attack) clearGlow(u);
  },
  die(u) { clearGlow(u); },
};

// ------------------------------------------------------------------ Aoi Todo
// Boogie Woogie: a clap, and two units with cursed energy swap places. He plans the
// clap first (what it is for), then claps; the swap happens on the clap.
function bwPlan(u, R = u.def.weapon.bwRange, snipeOnly = false) {
  const b = u.battle, p = u.pos;
  // "Brother!": his best friend (in his head) is here and someone is in front of one of them
  const yu = !snipeOnly && nearestWhere(b, p, R, (v) => ally(u, v) && isA(v, 'jk_yuji'));
  if (yu) {
    const e1 = nearestWhere(b, p, 2.6 + u.skel.radius, (v) => enemyOf(u, v));
    if (e1 && flatD(yu.pos, p) > 3.5 && swappable(yu)) return { k: 'brother', a: yu, e: e1 };
    const e2 = nearestWhere(b, yu.pos, 2.2 + yu.skel.radius, (v) => enemyOf(u, v));
    if (e2 && !yu.jkSure) return { k: 'feint', a: yu, e: e2 };
  }
  // a friend in trouble: take his place
  const hurt = !snipeOnly && nearestWhere(b, p, R, (v) => ally(u, v) && v.hp < v.maxHp * 0.3 && countEnemies(u, v.pos, 2.5) >= 2 && swappable(v) && flatD(v.pos, p) > 4);
  if (hurt && u.hp > u.maxHp * 0.4) return { k: 'rescue', a: hurt };
  // the enemy's backline: a shooter or caster well behind their front
  let best = null, bs = 0;
  b.grid.query(p.x, p.z, R, (v) => {
    if (!enemyOf(u, v) || !swappable(v)) return;
    const d = flatD(v.pos, p);
    const vw = v.def.weapon;
    const backline = vw.kind === 'ranged' || (vw.range || 0) >= 8 || vw.kind === 'heal' || vw.kind === 'bard';
    if (!backline || d < 6 || d > R) return;
    const sc = d + (v.def.cost || 0) / 200;
    if (sc > bs) { bs = sc; best = v; }
  });
  if (best) return { k: 'snipe', a: best };
  return null;
}
function doClap(u, plan) {
  const b = u.battle, w = u.def.weapon;
  const c = u.chestPos, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  markAt(b, 'jk_clap', _p.set(c.x + fx * 0.45 * u.s, c.y + 0.1 * u.s, c.z + fz * 0.45 * u.s), 0.35, u.heading);
  b.sound('punch', c, 1.3, 1.9);
  b.sound('click', c, 1.0, 0.6);
  b.sound('jk_boogie', c, 1.1, 1);
  if (!plan) return;
  const { k, a, e } = plan;
  if (!a.alive) return;
  if (k === 'brother') {
    if (!swapUnits(b, u, a)) return;
    a.jkSure = true;
    if (a.st.attack) chargeFlash(a);
    if (e.alive) { a.target = e; a.heading = a.faceYaw = Math.atan2(e.pos.x - a.pos.x, e.pos.z - a.pos.z); }
    a.cooldown = 0;
    b.voice(u, 'cry', true);
    announce(b, 'Brother! Boogie Woogie → Black Flash!', a.chestPos, 'jk_brother');
  } else if (k === 'feint') { // he claps and nothing moves: the enemy flinches anyway
    if (e.alive) { e.stun = Math.max(e.stun, 0.6); e.expr = EXPR.scared; if (e.st.attack) { e.st.attack = null; e.st.attackT = 0; } }
    a.jkSure = true;
    if (a.st.attack) chargeFlash(a);
    a.cooldown = 0;
    b.voice(u, 'cry', true);
    announce(b, 'Brother! Boogie Woogie → Black Flash!', a.chestPos, 'jk_brother');
  } else if (k === 'snipe') {
    if (!swapUnits(b, u, a)) return;
    a.stun = Math.max(a.stun, (w.bwStun ?? 0.9) * (a.def.stagger ?? 1));
    a.target = null; a.expr = EXPR.scared;
    u.target = a;
    announce(b, 'Boogie Woogie!', u.chestPos, 'jk_bw');
  } else if (k === 'rescue') {
    if (!swapUnits(b, u, a)) return;
    a.stun = 0;
    announce(b, 'Boogie Woogie!', u.chestPos, 'jk_bw');
  }
}
const todo = {
  melee: true,
  init(u) { u.bwCD = rand(1.5, 3); u.bwPlan = null; },
  think(u, dt, c) {
    const t = meleeThink(u, dt, c);
    if (u.bwCD <= 0 && !u.st.attack && u.stun <= 0 && !u.isDown() && !u.control) {
      const plan = bwPlan(u);
      if (plan) {
        u.bwPlan = plan;
        u.st.attack = 'jk_clap'; u.st.attackT = 0; u.hitSet.clear();
        u.bwCD = plan.k === 'brother' || plan.k === 'feint' ? u.def.weapon.bwCD * 0.8 : u.def.weapon.bwCD;
      } else u.bwCD = 0.5;
    }
    return t;
  },
  step(u, dt) { u.bwCD -= dt; toughUp(u, dt, 1); },
  event(u, t0, t1) {
    if (u.st.attack === 'jk_clap' && crossed(t0, t1, 0.5)) { doClap(u, u.bwPlan); u.bwPlan = null; }
  },
  // possessed (src/skills.js): RT punches; the clap swaps with the enemy under the
  // crosshair (or does what the AI would: Brother!, a rescue)
  basic: 'Punch',
  skills: [
    { key: 'lb', name: 'Boogie Woogie', icon: '👏', cd: (u) => u.bwCD, max: (u) => u.def.weapon.bwCD,
      ready: (u) => (bwAim(u) ? true : 'no one to swap'),
      use(u) {
        const plan = bwAim(u);
        if (!plan) return false;
        u.bwPlan = plan; u.st.attack = 'jk_clap'; u.st.attackT = 0; u.hitSet.clear(); u.bwCD = u.def.weapon.bwCD;
        return true;
      } },
    leapSkill('rb'),
  ],
};
function bwAim(u) {
  const v = aimTarget(u, u.def.weapon.bwRange, 3);
  if (v && swappable(v) && flatD(v.pos, u.pos) > 3) return { k: 'snipe', a: v };
  return bwPlan(u);
}

// ------------------------------------------------------------------ Nobara Kugisaki
function resonate(b, nob, v, k = 1, combo = false) {
  const w = nob.def.weapon;
  if (!v.alive) return;
  const doll = nob.rag.worldPoint(PART.farmL, 0, -nob.skel.handOffset * 1.2, 0, _o);
  b.emit('spark', doll.x, doll.y, doll.z, 4);
  markAt(b, 'jk_reso', doll, 0.25);
  b.sound('clang', doll, 0.7, 1.4);
  b.delayed.push([0.12, () => {
    if (!v.alive) return;
    v.hit(w.reso * k, PART.chest, 0, v.M * 0.4, 0, nob.alive ? nob : null, 'jk_reso');
    if (v.parriedAt === b.time) return;
    v.stun = Math.max(v.stun, w.resoStun * (combo ? 1.6 : 1) * (v.def.stagger ?? 1));
    mark(b, v, 'jk_reso', PART.chest, 0.6);
    const c = v.chestPos;
    b.emit('blood', c.x, c.y, c.z, 8, 0, 0);
    b.sound('stab', c, 1.0, 0.65);
    v.expr = EXPR.hurt;
  }]);
  if (!combo) announce(b, 'Resonance!', v.chestPos, 'jk_reso');
}
// Hairpin: a nail she put into something (or the ground) blows up a moment later
function hairpin(b, owner, id, dmg) {
  b.delayed.push([0.75, () => {
    const s = b.stuck.find((x) => x.id === id);
    if (!s || s.t <= 0) return;
    s.t = 0;
    blast(b, s.pos, 1.3, dmg, 260, owner, { fx: 0, friendly: 0, vol: 0.5, pitch: 1.6 });
    markSpin(b, 'jk_pin', s.pos, 0.3);
  }]);
}
const nobara = {
  aim: true,
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.resoCD = w.resoCD * 0.5; },
  think(u, dt, c) {
    // like the core shooters, but she doesn't run from melee for long: she's no coward
    const w = u.def.weapon, { t, dist, dirx, dirz, spd } = c;
    u.expr = c.gap < 5 ? EXPR.angry : EXPR.normal;
    if (dist > w.range * 0.8) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (c.gap < 2.2) u.desired.set(-dirx * spd * 0.6, 0, -dirz * spd * 0.6);
    if (dist < w.range && !u.st.attack && u.cooldown <= 0 && !u.isDown()) { u.startAttack(); u.aimAt = t; }
    if (u.st.attack) u.desired.multiplyScalar(0.15);
    return t;
  },
  step(u, dt) { u.resoCD -= dt; },
  // possessed (src/skills.js): RT nails, X a shove, LB the doll's Resonance
  basic: 'Hammer shove', ranged: 'Nails',
  skills: [
    { key: 'lb', name: 'Resonance', icon: '🪆', free: true, cd: (u) => u.resoCD, max: (u) => u.def.weapon.resoCD,
      ready: (u) => (nailedNow(u) ? true : 'nail someone first'),
      use(u) { const v = nailedNow(u); if (!v) return false; u.resoCD = u.def.weapon.resoCD; resonate(u.battle, u, v); return true; } },
  ],
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    const hand = handPos(u, _o);
    hand.y += 0.1 * u.s;
    aimPoint(u, _p, 0.5, 0.6);
    if (!u.aimAt && u.control && !u.control.aimPt) _p.y = hand.y + Math.tan(u.control.aimPitch) * 14;
    // three nails, fanned
    for (let i = -1; i <= 1; i++) {
      launchVel(hand, _p, w.speed, PJ.jk_nail.g, false, w.spread, _v);
      const a = i * w.fan, cs = Math.cos(a), sn = Math.sin(a);
      _v.set(_v.x * cs + _v.z * sn, _v.y, -_v.x * sn + _v.z * cs);
      addProjectile(b, 'jk_nail', hand, _v, u, { life: (w.range / w.speed) * 1.6, snd: true });
    }
    b.emit('spark', hand.x, hand.y, hand.z, 3);
    b.sound('clang', hand, 0.7, 2.0);
    b.sound('flyby', hand, 0.5, 1.8);
    // the doll: hurt the last one she nailed, wherever they are
    const v = u.jkNailed;
    if (!u.control && v && v.alive && v.team !== u.team && b.time - u.jkNailedAt < w.resoKeep && u.resoCD <= 0) {
      u.resoCD = w.resoCD;
      resonate(b, u, v);
    }
  },
};

const nailedNow = (u) => { const v = u.jkNailed; return v && v.alive && v.team !== u.team && u.battle.time - u.jkNailedAt < u.def.weapon.resoKeep ? v : null; };

// ------------------------------------------------------------------ Kento Nanami
// Ratio: he divides his target in a 7:3 ratio and strikes the point: a crit.
function ratioHit(b, u, v, mul) {
  const w = u.def.weapon;
  const c = v.chestPos;
  _d.set(c.x - u.pos.x, 0.2, c.z - u.pos.z).normalize();
  strike(b, v, w.damage * mul, _d, Math.min(w.force, v.M * 10), u, 'jk_ratio', PART.chest, 'crunch');
  if (v.parriedAt === b.time) return;
  v.stun = Math.max(v.stun, 0.9 * (v.def.stagger ?? 1));
  const m = mark(b, v, 'jk_ratio', PART.chest, 0.8, new THREE.Vector3(0, 0.05, v.skel.rChest * 1.2));
  m.lq.setFromAxisAngle(UPY, Math.atan2(u.pos.x - c.x, u.pos.z - c.z) - Math.atan2(Math.sin(v.heading), Math.cos(v.heading)));
  b.emit('spark', c.x, c.y, c.z, 6);
  b.sound('clang', c, 0.8, 0.7);
  b.sound('jk_seam', c, 1.0, 1);
  announce(b, 'Ratio Technique: 7:3', c, 'jk_ratio');
}
const RATIO_CD = 8;
const nanami = {
  melee: true,
  init(u) { u.jkOT = false; u.jkRatio = false; u.ratioCD = 2; },
  think: meleeThink,
  // possessed (src/skills.js): the 7:3 strike on demand, and clocking into Overtime early
  basic: 'Cleaver',
  skills: [
    { key: 'lb', name: 'Ratio 7:3', icon: '📐', free: true, cd: (u) => u.ratioCD, max: () => RATIO_CD,
      use(u) { u.ratioCD = RATIO_CD; u.jkRatioNext = true; if (u.cooldown > 0.2) u.cooldown = 0.2; return true; } },
    { key: 'rb', name: 'Overtime', icon: '⌚', free: true, ready: (u) => !u.jkOT || 'on overtime', use(u) { u.jkOTnow = true; return true; } },
  ],
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.ratioCD -= dt;
    if (!u.jkOT && (b.time >= w.otAt || u.jkOTnow)) {
      u.jkOT = true;
      u.jkOTmk = mark(b, u, 'jk_ot', PART.chest, 9999);
      const c = u.chestPos;
      b.emit('spark', c.x, c.y, c.z, 8);
      b.sound('gong', c, 0.6, 1.2);
      b.voice(u, 'cry', true);
      announce(b, 'Nanami: Overtime.', c, 'jk_ot' + u.team);
    }
    if (u.jkOT) u.buff = Math.max(u.buff, 0.1);
    const sw = swing(u);
    if (sw.fresh) {
      u.jkRatio = u.jkRatioNext || Math.random() < (u.jkOT ? w.ratioOT : w.ratio);
      u.jkRatioNext = false;
    }
    for (const v of sw.list) {
      if (u.jkRatio) { ratioHit(b, u, v, w.ratioMul - 1); u.jkRatio = false; }
      else if (u.jkOT && v.alive) v.hit(w.damage * w.otBonus, PART.chest, 0, 0, 0, u, 'jk_overtime');
    }
  },
  die(u) {
    if (u.jkOTmk) u.jkOTmk.t = 0;
    // his last words, to Yuji
    const b = u.battle;
    const yu = nearestWhere(b, u.pos, 30, (v) => ally(u, v) && isA(v, 'jk_yuji'));
    if (yu) {
      yu.jkRage = true;
      yu.hp = Math.min(yu.maxHp, yu.hp + yu.maxHp * 0.25);
      mark(b, yu, 'jk_rage', PART.chest, 9999);
      b.voice(yu, 'cry', true);
      announce(b, 'Nanami: "Itadori-kun... the rest is up to you."', u.chestPos, 'jk_nanami');
    }
  },
};

// ------------------------------------------------------------------ Maki Zen'in
const SOUL_CD = 6;
const maki = {
  melee: true,
  init(u) { u.jkNoCE = true; u.jkN = 0; u.jkAwake = false; u.soulCD = 2; },
  think: meleeThink,
  // possessed (src/skills.js): the Split Soul Katana's cut on demand, and a leap
  basic: 'Naginata',
  skills: [
    { key: 'lb', name: 'Split Soul Katana', icon: '🗡', free: true, cd: (u) => u.soulCD, max: () => SOUL_CD,
      use(u) { u.soulCD = SOUL_CD; u.jkSoulNext = true; if (u.cooldown > 0.2) u.cooldown = 0.2; return true; } },
    leapSkill('rb', 3.5),
  ],
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.soulCD -= dt;
    u.jkNoCE = true;
    if (!u.jkAwake && u.hp < u.maxHp * w.awakeAt) {
      u.jkAwake = true;
      u.hp = Math.max(u.hp, u.maxHp * w.awakeHp);
      const h = u.headPos;
      markSpin(b, 'jk_glass', _p.copy(h), 0.7);
      mark(b, u, 'jk_awake', PART.chest, 9999);
      b.emit('spark', h.x, h.y, h.z, 8);
      b.sound('crash', h, 0.5, 2.2);
      b.voice(u, 'cry', true);
      announce(b, 'Maki: Heavenly Restriction, awakened!', h, 'jk_maki' + u.team);
    }
    if (u.jkAwake) u.buff = Math.max(u.buff, 0.1);
    toughUp(u, dt, 1.2);
    const sw = swing(u);
    for (const v of sw.list) {
      if (!v.alive) continue;
      u.jkN++;
      if (u.jkSoulNext || u.jkN % 3 === 0 || u.jkAwake && u.jkN % 2 === 0) {
        u.jkSoulNext = false; // the Split Soul Katana: cuts the soul, armour or not
        const arm = v.def.armor || 0;
        v.hit(w.damage * w.soul / Math.max(0.2, 1 - arm), PART.chest, 0, 0, 0, u, 'jk_splitsoul');
        markSpin(b, 'jk_soul', v.chestPos, 0.3);
        b.sound('slash', v.chestPos, 0.9, 0.8);
      }
    }
  },
};

// ------------------------------------------------------------------ Panda
function gorilla(u) {
  const b = u.battle;
  u.jkCore = true;
  u.hp = u.maxHp * u.def.weapon.coreHp;
  u.stun = Math.max(u.stun, 0.7);
  u.jkGmk = [mark(b, u, 'jk_gorilla_head', PART.head, 9999), mark(b, u, 'jk_gorilla_body', PART.chest, 9999)];
  const c = u.chestPos;
  b.emit('spark', c.x, c.y, c.z, 12);
  b.emit('dust', c.x, c.y - 1, c.z, 4);
  b.sound('boom', c, 0.7, 0.6);
  b.delayed.push([0.5, () => { if (u.alive) b.voice(u, 'cry', true); }]);
  announce(b, 'Panda: Gorilla Core!', c, 'jk_gorilla');
}
const panda = {
  melee: true,
  init(u) { u.jkCore = false; },
  think: meleeThink,
  // possessed (src/skills.js): switch to the Gorilla Core when he likes (once)
  basic: 'Punch',
  skills: [
    { key: 'lb', name: 'Gorilla Core', icon: '🦍', free: true, ready: (u) => !u.jkCore || 'core on', use(u) { const h = u.hp; gorilla(u); u.hp = Math.max(h, u.hp); u.stun = 0; return true; } },
    leapSkill('rb'),
  ],
  hit(u, amount) {
    if (!u.jkCore && amount * (1 - (u.def.armor || 0)) >= u.hp) { gorilla(u); return 0; }
    return amount;
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (u.jkCore) u.buff = Math.max(u.buff, 0.1);
    toughUp(u, dt, 1);
    const sw = swing(u);
    if (!u.jkCore) return;
    for (const v of sw.list) {
      // Drumming Beat: the shock goes through a guard and on into whoever is behind
      const c = v.chestPos;
      _d.set(c.x - u.pos.x, 0.25, c.z - u.pos.z).normalize();
      if (v.alive) v.hit(w.damage * w.drum, PART.chest, 0, 0, 0, u, 'jk_drum');
      if (v.alive) v.rag.impulseAll(_d.x * v.M * 2.5, v.M * 0.8, _d.z * v.M * 2.5);
      mark(b, v, 'jk_drum', PART.chest, 0.3);
      _p.copy(c).addScaledVector(_d, 1.4);
      const behind = nearestWhere(b, _p, 1.3, (o) => enemyOf(u, o) && o !== v);
      if (behind) strike(b, behind, w.damage * w.drumBehind, _d, Math.min(w.force * 0.6, behind.M * 8), u, 'jk_drum', PART.chest, 'thud');
      b.sound('thump', c, 1.0, 0.7);
    }
  },
  die(u) { if (u.jkGmk) for (const m of u.jkGmk) m.t = 0; },
};

// ------------------------------------------------------------------ Cursed Speech
// word: 'stop' (Don't move!), 'blast' (Blast away!), 'die' (Die). The speaker's
// weapon gives range/cone/stun/damage; o.self scales the throat cost (Yuta: none).
const WORD = { stop: "Don't move!", blast: 'Blast away!', die: 'Die.' };
function speak(u, word, o = {}) {
  const b = u.battle, w = u.def.weapon;
  const h = u.heading, fx = Math.sin(h), fz = Math.cos(h);
  const p = u.chestPos, R = o.range ?? w.range, cone = o.cone ?? w.cone;
  u.released = true;
  // Inumaki says the word itself (his recorded line, from jjkbrawler); Yuta's copy
  // through Rika keeps the gibberish cry - it isn't Inumaki's voice
  if (isA(u, 'jk_inumaki')) b.sound('vo_inumaki_' + word, p, 1.0, 1);
  else b.voice(u, 'cry', true);
  b.sound('boom', p, word === 'die' ? 1.2 : 0.7, word === 'die' ? 0.3 : 0.45);
  b.sound('gong', p, 0.5, word === 'stop' ? 0.5 : 0.35);
  let n = 0;
  b.grid.query(p.x, p.z, R + 1, (v) => {
    if (!enemyOf(u, v) || v.dormant) return;
    const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d > R + v.skel.radius || (dx * fx + dz * fz) < d * cone) return;
    n++;
    const k = 1 - (d / R) * 0.3, big = v.s > 1.6 || v.maxHp > 1000;
    if (word === 'stop') {
      const t = (o.stop ?? w.stopT) * k * (big ? 0.5 : 1);
      freeze(b, v, t);
      v.hit(1, PART.chest, 0, 0, 0, u, 'jk_speech');
    } else if (word === 'blast') {
      v.hit((o.dmg ?? w.damage) * k, PART.chest, 0, 0, 0, u, 'jk_speech');
      if (v.parriedAt === b.time) return;
      const f = v.M * (big ? 1.5 : 4.0) * k;
      v.rag.impulseAll(dx / (d || 1) * f, f * 0.55, dz / (d || 1) * f);
      v.stun = Math.max(v.stun, (o.blastStun ?? w.blastStun) * k * (big ? 0.4 : 1) * (v.def.stagger ?? 1));
      if (v.st.attack && !big) { v.st.attack = null; v.st.attackT = 0; }
      v.expr = EXPR.scared;
    } else {
      v.hit(w.dieDmg * (big ? 0.4 : 1), PART.chest, 0, 0, 0, u, 'jk_speech');
      if (v.parriedAt === b.time) return;
      v.stun = Math.max(v.stun, 1.0);
      const c = v.chestPos;
      b.emit('blood', c.x, c.y, c.z, 12, fx, fz);
      mark(b, v, 'jk_diemark', PART.chest, 0.6);
    }
  });
  // the word flies out (text and rings), dust along the cone
  _o.set(p.x + fx * 0.6, p.y + 0.55 * u.s, p.z + fz * 0.6);
  addProjectile(b, 'jk_w_' + word, _o, _v.set(fx * 9, 0.6, fz * 9), u, { life: Math.min(1.1, R / 9), damage: 0, force: 0 });
  for (let i = 0; i < 3; i++) {
    _o.set(p.x + fx * 0.5, p.y + 0.35 * u.s, p.z + fz * 0.5);
    _v.set(fx * (12 + i * 3), 0, fz * (12 + i * 3));
    addProjectile(b, word === 'die' ? 'jk_wave_die' : 'jk_wave', _o, _v, u, { life: R / (12 + i * 3), damage: 0, force: 0 });
  }
  for (let i = 1; i <= 3; i++) {
    const x = p.x + fx * i * R / 3.3, z = p.z + fz * i * R / 3.3;
    b.emit('dust', x, b.terrain.height(x, z), z, word === 'die' ? 3 : 1.5);
  }
  // the throat
  const self = o.self ?? 1;
  if (self > 0) {
    const cost = word === 'die' ? u.maxHp * w.dieSelf : word === 'blast' ? w.selfCost * 1.5 : w.selfCost;
    u.hp = Math.max(1, u.hp - cost * self);
    b.delayed.push([0.5, () => { if (u.alive) { const hd = u.headPos; b.emit('blood', hd.x, hd.y - 0.1, hd.z, word === 'die' ? 6 : 1, fx, fz); b.voice(u, 'hurt'); } }]);
  }
  return n;
}
function freeze(b, v, t) {
  const s = S(b);
  if (!(v.jkFreezeT > b.time)) s.frozen.push(v);
  v.jkFreezeT = Math.max(v.jkFreezeT || 0, b.time + t);
  if (v.jkBindMk) v.jkBindMk.t = 0;
  v.jkBindMk = mark(b, v, 'jk_bind', PART.pelvis, t);
  v.st.attack = null; v.st.attackT = 0;
  v.expr = EXPR.scared;
}
function stepFrozen(b, dt) {
  const s = STATE.get(b);
  if (!s || !s.frozen.length) return;
  for (let i = s.frozen.length - 1; i >= 0; i--) {
    const v = s.frozen[i];
    if (!v.alive || !(v.jkFreezeT > b.time)) { if (v.jkBindMk) v.jkBindMk.t = 0; s.frozen.splice(i, 1); continue; }
    // rooted on the spot: no steps, no swings, no shots
    if (v.st.attack) { v.st.attack = null; v.st.attackT = 0; }
    v.cooldown = Math.max(v.cooldown, 0.3);
    const vel = v.rag.vel[PART.pelvis];
    if (v.bc) continue;
    v.rag.impulseAll(-vel.x * v.M * 0.5, 0, -vel.z * v.M * 0.5);
  }
}
const BLAST_CD = 3;
const SNACKS = 4; // onigiri ingredients he says instead of talking (speech bubbles)
const inumaki = {
  aim: false,
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.dieCD = w.dieFirst; u.soreT = 0; u.snackT = rand(2, 6); u.jkWord = null; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, dirx, dirz, spd } = c;
    u.expr = EXPR.normal;
    if (dist > w.range * 0.7) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (c.gap < 2.5) u.desired.set(-dirx * spd * 0.6, 0, -dirz * spd * 0.6);
    if (dist < w.range * 0.85 && u.cooldown <= 0 && u.soreT <= 0 && !u.st.attack && u.stun <= 0 && !u.isDown()) u.startAttack();
    if (u.st.attack) u.desired.multiplyScalar(0.15);
    return t;
  },
  // possessed (src/skills.js): RT "Don't move!", LB "Die.", RB "Blast away!" (a cone), X a shove
  control(u, dt, c) {
    if (c.shoot && !u.st.attack && u.cooldown <= 0 && u.soreT <= 0) { u.jkWordNext = 'stop'; u.startAttack(); }
    return 'shoot';
  },
  basic: 'Shove', ranged: "Don't move!",
  skills: [
    { key: 'rb', name: 'Blast away!', icon: '💥', cd: (u) => Math.max(u.blastCD || 0, u.soreT), max: () => BLAST_CD,
      use(u) { u.jkWordNext = 'blast'; u.startAttack(); u.blastCD = BLAST_CD; return true; } },
    { key: 'lb', name: 'Die.', icon: '💀', cd: (u) => Math.max(u.dieCD, u.soreT), max: (u) => u.def.weapon.dieCD,
      ready: (u) => (u.hp > u.maxHp * 0.25 ? true : 'throat too sore'),
      use(u) { u.jkWordNext = 'die'; u.startAttack(); return true; } },
  ],
  step(u, dt) {
    const b = u.battle;
    u.dieCD -= dt; u.soreT -= dt; u.blastCD = (u.blastCD || 0) - dt;
    u.snackT -= dt;
    if (u.snackT <= 0 && b.started) {
      u.snackT = rand(5, 11);
      if (!u.st.attack) mark(b, u, 'jk_bub' + Math.floor(rand(0, SNACKS)), PART.head, 1.4, new THREE.Vector3(0, u.skel.rHead * 3.2, 0));
    }
  },
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (crossed(t0, t1, 0.3)) { // pick the word as he pulls the collar down
      const p = u.pos, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      let n = 0, near = 0;
      b.grid.query(p.x, p.z, w.range + 1, (v) => {
        if (!enemyOf(u, v)) return;
        const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
        if (d > w.range + v.skel.radius || (dx * fx + dz * fz) < d * w.cone) return;
        n++; if (d < 3.8) near++;
      });
      u.jkWord = u.dieCD <= 0 && n >= w.dieMin && u.hp > u.maxHp * 0.6 ? 'die' : near ? 'blast' : 'stop';
      if (u.control) u.jkWord = u.jkWordNext || 'stop';
      u.jkWordNext = null;
      mark(b, u, 'jk_collar_open', PART.head, 0.6);
    }
    if (!crossed(t0, t1, w.releaseAt)) return;
    const word = u.jkWord || 'stop';
    speak(u, word);
    if (word === 'die') {
      u.dieCD = w.dieCD;
      u.soreT = w.soreT;
      // a sore throat: he pulls out the cough syrup
      mark(b, u, 'jk_syrup', PART.farmR, w.soreT * 0.5, new THREE.Vector3(0, -u.skel.handOffset * 1.2, 0));
      b.delayed.push([2, () => { if (u.alive) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.15); b.emit('heal', u.headPos.x, u.headPos.y, u.headPos.z, 3); } }]);
      announce(b, 'Inumaki: "Die."', u.chestPos, 'jk_die');
    } else if (word === 'stop') announce(b, `Inumaki: "Don't move!"`, u.chestPos, 'jk_stop');
    else announce(b, 'Inumaki: "Blast away!"', u.chestPos, 'jk_blast');
  },
};

// ------------------------------------------------------------------ Yuta Okkotsu
// Copy (through Rika): techniques of the allies he fights beside.
const COPY = {
  jk_inumaki: { k: 'speech', name: 'Cursed Speech' },
  jk_todo: { k: 'bw', name: 'Boogie Woogie' },
  jk_yuji: { k: 'flash', name: 'Black Flash' },
  jk_nanami: { k: 'ratio', name: 'Ratio Technique' },
  jk_nobara: { k: 'reso', name: 'Resonance' },
};
function rikaOut(u) { return u.rika && u.rika.alive && !u.rika.dormant; }
function callRika(u, full) {
  const b = u.battle;
  if (!u.rika) u.rika = b.reservesOf(u, 'jk_rika')[0] || null;
  if (!u.rika) return null;
  if (!rikaOut(u)) {
    if (!u.rika.dormant) return null; // she was destroyed
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    const s = summon(b, u, 'jk_rika', _p.set(u.pos.x - fx * 1.6, 0, u.pos.z - fz * 1.6));
    if (!s) return null;
    if (u.rikaHp != null) s.hp = Math.min(s.maxHp, u.rikaHp + s.maxHp * 0.3);
    s.jkOwner = u;
    markAt(b, 'jk_rikarise', _p.set(s.pos.x, b.terrain.height(s.pos.x, s.pos.z) + 0.05, s.pos.z), 1.0);
    b.sound('gong', s.pos, 0.8, 0.45);
    b.sound('boom', s.pos, 0.6, 0.4);
    b.voice(s, 'cry', true);
  }
  u.rikaT = full ? Infinity : u.def.weapon.rikaT;
  return u.rika;
}
function sendRika(u) {
  const b = u.battle;
  if (!rikaOut(u)) return;
  u.rikaHp = u.rika.hp;
  const p = u.rika.pos;
  markAt(b, 'jk_rikarise', _p.set(p.x, b.terrain.height(p.x, p.z) + 0.05, p.z), 0.8);
  dismiss(b, u.rika);
}
const COPY_ANIM = { speech: 'jk_shout', bw: 'jk_clap' };
function useCopy(u, k) {
  const b = u.battle, w = u.def.weapon;
  const t = u.target;
  if (k === 'flash') { u.jkSure = true; mark(b, u, 'jk_copy', PART.farmR, 0.8, new THREE.Vector3(0, -u.skel.handOffset, 0)); return true; }
  if (k === 'ratio') { u.jkRatioNext = true; mark(b, u, 'jk_copy', PART.farmR, 0.8, new THREE.Vector3(0, -u.skel.handOffset, 0)); return true; }
  if (k === 'reso') {
    if (!t || !t.alive || flatD(t.pos, u.pos) > 20) return false;
    mark(b, u, 'jk_copy', PART.farmL, 0.6, new THREE.Vector3(0, -u.skel.handOffset, 0));
    b.delayed.push([0.15, () => {
      if (!t.alive) return;
      t.hit(w.copyReso, PART.chest, 0, t.M * 0.4, 0, u.alive ? u : null, 'jk_reso');
      if (t.parriedAt !== b.time) { t.stun = Math.max(t.stun, 0.6 * (t.def.stagger ?? 1)); mark(b, t, 'jk_reso', PART.chest, 0.6); }
      b.sound('stab', t.chestPos, 1.0, 0.65);
    }]);
    return true;
  }
  if (k === 'speech') {
    if (!t || flatD(t.pos, u.pos) > 8) return false;
    u.jkCast = 'speech'; u.st.attack = 'jk_shout'; u.st.attackT = 0; u.hitSet.clear();
    return true;
  }
  if (k === 'bw') {
    const plan = bwPlan(u, 16, true);
    if (!plan) return false;
    u.jkCast = 'bw'; u.jkBwPlan = plan; u.st.attack = 'jk_clap'; u.st.attackT = 0; u.hitSet.clear();
    return true;
  }
  return false;
}
// the sure-hit of Authentic Mutual Love: a random technique from his copies
function amlHit(b, dom, v) {
  const u = dom.owner, w = u.def.weapon;
  const list = ['cut', 'cut', ...(u.jkCopies || []).map((c) => c.k)];
  const k = list[Math.floor(rand(0, list.length))];
  const c = v.chestPos;
  _d.set(rand(-1, 1), 0.4, rand(-1, 1)).normalize();
  const dmg = w.domDmg;
  if (k === 'speech') { freeze(b, v, 1.2); v.hit(dmg * 0.5, PART.chest, 0, 0, 0, u, 'domain'); }
  else if (k === 'flash') { v.hit(dmg * 1.6, PART.chest, 0, 0, 0, u, 'domain'); if (v.alive) v.rag.impulseAll(_d.x * v.M * 3, v.M * 2, _d.z * v.M * 3); markSpin(b, 'jk_bf', c, 0.3); }
  else if (k === 'reso') { v.hit(dmg * 1.2, PART.chest, 0, 0, 0, u, 'domain'); mark(b, v, 'jk_reso', PART.chest, 0.5); }
  else if (k === 'ratio') { v.hit(dmg * 1.4, PART.chest, 0, 0, 0, u, 'domain'); mark(b, v, 'jk_ratio', PART.chest, 0.5, new THREE.Vector3(0, 0, v.skel.rChest * 1.2)); }
  else if (k === 'bw') { // swapped with another enemy in the domain, dizzy
    const o = nearestWhere(b, dom.pos, dom.R, (x) => enemyOf(u, x) && x !== v && swappable(x));
    if (o && swappable(v)) swapUnits(b, v, o);
    v.hit(dmg * 0.6, PART.chest, 0, 0, 0, u, 'domain');
    v.stun = Math.max(v.stun, 0.5);
  } else { // a sword from the field
    v.hit(dmg, PART.chest, 0, 0, 0, u, 'domain');
    if (v.alive) v.rag.impulseAll(_d.x * v.M * 1.5, v.M * 0.5, _d.z * v.M * 1.5);
    markSpin(b, 'jk_cut', c, 0.25);
  }
  if (Math.random() < 0.4) b.sound('slash', c, 0.6, rand(0.9, 1.3));
}
const yuta = {
  melee: true,
  // possessed (src/skills.js): LB Copy, RB the domain, Y Rika (out / back again; her full
  // manifestation when he's badly hurt stays automatic)
  basic: 'Katana',
  skills: [
    { key: 'lb', name: 'Copy', icon: '💍', cd: (u) => u.copyCD, max: (u) => u.def.weapon.copyCD,
      ready: (u) => (u.jkCopies.length ? true : 'no one to copy'),
      use(u) {
        u.target = aimTarget(u, 20) || u.target;
        const order = [...u.jkCopies].sort(() => Math.random() - 0.5);
        for (const c of order) if (useCopy(u, c.k)) { u.copyCD = u.def.weapon.copyCD; announce(u.battle, `Copy: ${c.name}`, u.chestPos); return true; }
        return false;
      } },
    { key: 'y', name: 'Rika', icon: '👹', cd: (u) => (rikaOut(u) ? 0 : u.rikaCD), max: (u) => u.def.weapon.rikaCD,
      ready: (u) => (u.jkFull ? 'fully manifested' : !rikaOut(u) && u.rika && !u.rika.dormant ? 'Rika is gone' : true),
      use(u) {
        if (rikaOut(u)) { sendRika(u); u.rikaCD = u.def.weapon.rikaCD * 0.5; return true; } // (a second press sends her back)
        if (callRika(u, false)) { u.rikaCD = u.def.weapon.rikaCD; return true; }
        return false;
      } },
    { key: 'rb', name: 'Authentic Mutual Love', icon: '⚔', cd: (u) => u.domCD, max: (u) => u.def.weapon.domCD, ready: (u) => !burntOut(u) || 'burnt out',
      use(u) {
        const w = u.def.weapon;
        u.domCD = w.domCD;
        openDomain(u.battle, u, { name: 'Authentic Mutual Love', radius: AML_R, duration: w.domDur, power: w.domPow, tick: w.domTick, marker: 'jk_aml', sureHit: amlHit, burnout: 5 });
        return true;
      } },
  ],
  init(u) {
    const w = u.def.weapon;
    u.jkCopies = []; u.copyScan = 0.5; u.copyCD = 3; u.rika = null; u.rikaT = 0; u.rikaCD = 2; u.rikaHp = null;
    u.domCD = w.domFirst; u.jkFull = false; u.jkSure = false; u.jkRatioNext = false;
  },
  think: meleeThink,
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.copyScan -= dt; u.copyCD -= dt; u.domCD -= dt; u.rikaCD -= dt;
    // Copy: allies with a technique he can take
    if (u.copyScan <= 0) {
      u.copyScan = 1;
      for (const v of b.teams[u.team]) {
        const c = COPY[v.def.id];
        if (!c || !v.alive || flatD(v.pos, u.pos) > w.copyR || u.jkCopies.some((x) => x.k === c.k)) continue;
        u.jkCopies.push(c);
        mark(b, u, 'jk_copy', PART.chest, 1.0);
        mark(b, v, 'jk_copy', PART.chest, 0.6);
        b.sound('heal', u.chestPos, 0.6, 1.6);
        announce(b, `Copy: Yuta takes ${c.name}!`, u.chestPos, 'jk_copy_' + c.k);
        break;
      }
    }
    // Rika
    if (rikaOut(u)) {
      u.rikaT -= dt;
      if (u.rikaT <= 0) { sendRika(u); u.rikaCD = w.rikaCD; }
    }
    if (!u.jkFull && u.hp < u.maxHp * w.fullAt) {
      u.jkFull = true;
      if (callRika(u, true)) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * w.rct); // reverse cursed technique
        b.emit('heal', u.chestPos.x, u.chestPos.y, u.chestPos.z, 8);
        mark(b, u, 'jk_ring', PART.farmR, 9999, new THREE.Vector3(0, -u.skel.handOffset * 1.05, 0));
        announce(b, 'Yuta: "Rika!" — Full manifestation', u.chestPos, 'jk_rika');
      }
    } else if (!u.control && !rikaOut(u) && u.rikaCD <= 0 && !u.jkFull && (u.hp < u.maxHp * w.rikaAt || countEnemies(u, u.pos, 6) >= 3)) {
      if (callRika(u, false)) u.rikaCD = w.rikaCD;
      else u.rikaCD = 99;
    }
    // Domain Expansion: Authentic Mutual Love
    if (u.domCD <= 0 && !u.control && !burntOut(u) && !b.over && u.stun <= 0.3) {
      const n = countEnemies(u, u.pos, AML_R * 0.85);
      const boss = nearestWhere(b, u.pos, AML_R * 0.7, (v) => enemyOf(u, v) && v.maxHp >= 1000);
      if (n >= w.domMin || boss || (u.control && n > 0)) {
        u.domCD = w.domCD;
        openDomain(b, u, { name: 'Authentic Mutual Love', radius: AML_R, duration: w.domDur, power: w.domPow, tick: w.domTick, marker: 'jk_aml', sureHit: amlHit, burnout: 5 });
      } else u.domCD = 0.5;
    }
    // copied techniques, now and then
    if (u.copyCD <= 0 && !u.control && u.jkCopies.length && !u.st.attack && u.target && u.stun <= 0) {
      const c = u.jkCopies[Math.floor(rand(0, u.jkCopies.length))];
      u.copyCD = useCopy(u, c.k) ? w.copyCD : 1;
    }
    const sw = swing(u);
    for (const v of sw.list) {
      if (u.jkSure) { blackFlash(b, u, v, w.damage * 2.2, w.force * 2.5); u.jkSure = false; }
      else if (u.jkRatioNext) { ratioHit(b, u, v, 1.3); u.jkRatioNext = false; }
    }
  },
  event(u, t0, t1) {
    if (u.jkCast === 'speech' && u.st.attack === 'jk_shout' && crossed(t0, t1, 0.5)) {
      const word = Math.random() < 0.5 ? 'stop' : 'blast';
      speak(u, word, { range: 8, cone: 0.55, stop: 1.6, dmg: 25, blastStun: 1.4, self: 0 });
      announce(u.battle, `Yuta: "${WORD[word]}"`, u.chestPos, 'jk_yutaspeech');
      u.jkCast = null;
    }
    if (u.jkCast === 'bw' && u.st.attack === 'jk_clap' && crossed(t0, t1, 0.5)) { doClap(u, u.jkBwPlan); u.jkBwPlan = null; u.jkCast = null; }
  },
  die(u) {
    const b = u.battle;
    if (rikaOut(u)) { // without him she fades
      const r = u.rika;
      b.delayed.push([0.8, () => { if (r.alive && !r.dormant) { markAt(b, 'jk_rikarise', _p.set(r.pos.x, b.terrain.height(r.pos.x, r.pos.z) + 0.05, r.pos.z), 0.8); dismiss(b, r); } }]);
    }
  },
};
// Rika fights like a curse: long arms, huge sweeping slaps
const rika = {
  melee: true,
  init(u) { u.jkRikaRoar = rand(3, 6); },
  think(u, dt, c) {
    const o = u.reserveOf;
    // stays near Yuta when he is far behind
    if (o && o.alive && flatD(o.pos, u.pos) > 14 && c.gap > 3) {
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
      u.desired.set(dx / d * c.spd, 0, dz / d * c.spd);
      return o;
    }
    return meleeThink(u, dt, c);
  },
  step(u, dt) {
    u.jkRikaRoar -= dt;
    if (u.jkRikaRoar <= 0) { u.jkRikaRoar = rand(5, 9); u.battle.voice(u, 'cry', true); }
  },
};

// ------------------------------------------------------------------ secrets
onSecret((b, dt) => {
  stepFrozen(b, dt);
});

// ------------------------------------------------------------------ projectiles
const PJ = {
  jk_nail: arrowProj({
    g: 3, len: 0.3, r: 0.03, life: 3,
    onHit(b, v, pr) {
      const o = pr.owner;
      if (o) { o.jkNailed = v; o.jkNailedAt = b.time; }
      v.jkNailBy = o; v.jkNailT = b.time;
      hairpin(b, o, pr.id, o?.def.weapon.pin ?? 12);
    },
    ground(b, pr) { // into the ground, then Hairpin
      const gy = b.terrain.height(pr.pos.x, pr.pos.z);
      _v.copy(pr.vel).normalize();
      pr.pos.y = gy + 0.02 - _v.y * 0.08;
      b.stuck.push({ type: 'jk_nail', unit: null, part: -1, pos: pr.pos.clone(), quat: pr.quat.clone(), t: 3, id: pr.id });
      hairpin(b, pr.owner, pr.id, (pr.owner?.def.weapon.pin ?? 12) * 0.7);
      return true;
    },
  }),
  jk_w_stop: { g: 0, len: 0, r: 0.2, life: 1, hit: () => false, ground: () => false },
  jk_w_blast: { g: 0, len: 0, r: 0.2, life: 1, hit: () => false, ground: () => false },
  jk_w_die: { g: 0, len: 0, r: 0.2, life: 1, hit: () => false, ground: () => false },
  jk_wave: { g: 0, len: 0.01, r: 0.3, life: 0.7, hit: () => false, ground: () => true },
  jk_wave_die: { g: 0, len: 0.01, r: 0.3, life: 0.7, hit: () => false, ground: () => true },
};
for (const k of ['jk_bf', 'jk_fistbf', 'jk_div', 'jk_swap', 'jk_clap', 'jk_reso', 'jk_pin', 'jk_ratio', 'jk_ot', 'jk_rage', 'jk_glass', 'jk_awake',
  'jk_soul', 'jk_gorilla_head', 'jk_gorilla_body', 'jk_drum', 'jk_bind', 'jk_diemark', 'jk_syrup', 'jk_collar_open', 'jk_copy', 'jk_ring',
  'jk_rikarise', 'jk_cut', 'jk_aml', 'jk_bub0', 'jk_bub1', 'jk_bub2', 'jk_bub3']) PJ[k] = { g: 0, len: 0, r: 0, life: 1 };

// ------------------------------------------------------------------ units
const STUDENT = { aggro: 0.9, bravery: 0, voice: 1.0, chatter: 0.7 };
const units = [
  {
    id: 'jk_yuji', name: 'Yuji Itadori', faction: 'jjk_sorcerers', side: 'sorcerer', cost: 430, hp: 520, speed: 6.1,
    build: { scale: 1.02, girth: 1.02, arms: 1.03, armThick: 1.12 },
    weapon: { line: 'Brawler · Divergent Fist hits twice · Black Flash crits', kind: 'jk_yuji', style: 'dual', anim: 'dual', item: 'jk_fist', damage: 30, reach: 1.0, cooldown: 0.62, force: 380, divK: 0.45, flash: 0.12, zone: 0.25, zoneT: 6, rage: 0.15, flashMul: 2.5, flashForce: 1700 },
    look: { skin: '#f2c8a6', hat: 'jk_hair_yuji', top: 'jk_yuji', legs: UNI, accent: '#c8322e' },
    personality: { ...STUDENT, aggro: 1, voice: 1.05, chatter: 0.9, cry: 'charge', idle: 'bounce' },
    stagger: 0.45,
    desc: 'Inhumanly tough and fast. His punches land twice, and sometimes they flash black.',
  },
  {
    id: 'jk_todo', name: 'Aoi Todo', faction: 'jjk_sorcerers', side: 'sorcerer', cost: 680, hp: 1100, speed: 5.0, face: 1,
    build: { scale: 1.38, girth: 1.12, head: 0.95, arms: 1.05, armThick: 1.4, mass: 1.35 },
    weapon: { line: 'Brawler · Boogie Woogie: a clap and two units swap places', kind: 'jk_todo', style: 'dual', anim: 'dual', item: 'jk_fist', sweep: true, damage: 52, reach: 1.1, cooldown: 1.0, force: 650, bwRange: 18, bwCD: 7, bwStun: 0.9 },
    look: { skin: '#d9a07a', hat: 'jk_hair_todo', top: 'jk_todo', legs: '#24252e', accent: '#1a1a1e' },
    personality: { aggro: 1, bravery: 0, voice: 0.6, chatter: 1, cry: 'roar', idle: 'thump' },
    armor: 0.05, stagger: 0.35,
    desc: '"What kind of woman is your type?" Claps, and you are somewhere else.',
  },
  {
    id: 'jk_nobara', name: 'Nobara Kugisaki', faction: 'jjk_sorcerers', side: 'sorcerer', cost: 310, hp: 150, speed: 4.8, face: 2,
    build: { scale: 0.95, girth: 0.92, head: 1.05 },
    weapon: { line: 'Ranged · three nails a blow · Hairpin blows them up · Resonance', kind: 'jk_nobara', style: 'sword', anim: 'overhead', item: 'jk_hammer', damage: 20, speed: 30, range: 21, minRange: 5, cooldown: 2.7, force: 110, spread: 0.035, fan: 0.07, releaseAt: 0.55, windup: 0.75, pin: 14, reso: 40, resoCD: 5.5, resoKeep: 12, resoStun: 0.7 },
    look: { skin: '#f4cdb0', hat: 'jk_hair_nobara', top: 'jk_nobara', legs: '#2a2a38', accent: '#5a3020' },
    personality: { ...STUDENT, aggro: 0.6, voice: 1.4, cry: 'hey', idle: 'shift' },
    desc: 'A hammer, a pouch of nails and a straw doll. Nails she hits explode.',
  },
  {
    id: 'jk_nanami', name: 'Kento Nanami', faction: 'jjk_sorcerers', side: 'sorcerer', cost: 400, hp: 520, speed: 4.7,
    build: { scale: 1.1, girth: 1.0, legs: 1.06 },
    weapon: { line: 'Melee · Ratio 7:3 crits · Overtime after 30 s: stronger', kind: 'jk_nanami', style: 'jk_cleaver', anim: 'overhead', item: 'jk_cleaver', damage: 52, reach: 1.25, cooldown: 1.0, force: 320, ratio: 0.22, ratioOT: 0.55, ratioMul: 2.0, otAt: 30, otBonus: 0.35 },
    look: { skin: '#f0caa8', hat: 'jk_hair_nanami', top: 'jk_nanami', legs: '#c9b48a', accent: '#5a3a24' },
    personality: { aggro: 0.8, bravery: 0, voice: 0.85, chatter: 0.3, cry: 'charge', idle: 'shift' },
    armor: 0.08, stagger: 0.55,
    desc: 'Works by the clock. Hits the 7:3 point. After thirty seconds, he is on overtime.',
  },
  {
    id: 'jk_maki', name: "Maki Zen'in", faction: 'jjk_sorcerers', side: 'sorcerer', cost: 580, hp: 560, speed: 6.5,
    build: { scale: 1.0, girth: 0.95, legs: 1.05 },
    weapon: { line: 'Melee · no cursed energy (sure-hits miss her) · Split Soul Katana', kind: 'jk_maki', style: 'spear', anim: 'stab', item: 'jk_naginata', damage: 56, reach: 2.0, cooldown: 0.8, force: 360, soul: 0.7, awakeAt: 0.4, awakeHp: 0.8 },
    look: { skin: '#f2cdb2', hat: 'jk_hair_maki', top: 'jk_maki', legs: '#22242c', accent: '#16161a' },
    personality: { ...STUDENT, aggro: 1, voice: 1.25, chatter: 0.5, cry: 'hey', idle: 'shift' },
    stagger: 0.35,
    desc: 'No cursed energy at all. Doesn\'t need it. Cursed tools and a lot of anger.',
  },
  {
    id: 'jk_panda', name: 'Panda', faction: 'jjk_sorcerers', side: 'sorcerer', cost: 420, hp: 560, speed: 4.8, face: 2,
    build: { scale: 1.25, girth: 1.42, head: 1.6, legs: 0.85, arms: 1.0, armThick: 1.4, mass: 1.2, neck: 0.1 },
    weapon: { line: 'Brawler · knocked out once, the Gorilla Core takes over', kind: 'jk_panda', style: 'dual', anim: 'dual', item: 'jk_fist', damage: 34, reach: 1.0, cooldown: 0.9, force: 600, coreHp: 0.55, drum: 0.6, drumBehind: 0.5 },
    look: { skin: '#f2f0ea', hat: 'jk_panda', top: 'jk_panda', legs: '#1c1c20', accent: '#1c1c20' },
    personality: { aggro: 0.9, bravery: 0, voice: 0.8, chatter: 0.8, cry: 'roar', idle: 'bounce' },
    stagger: 0.4,
    desc: 'Not a panda. Well, mostly a panda. He has a spare core.',
  },
  {
    id: 'jk_inumaki', name: 'Toge Inumaki', faction: 'jjk_sorcerers', side: 'sorcerer', cost: 560, hp: 150, speed: 4.9,
    build: { scale: 0.96, girth: 0.92, neck: 0.1 },
    weapon: { line: 'Support · Cursed Speech: "Don\'t move!", "Blast away!", rarely "Die"', kind: 'jk_inumaki', style: 'jk_inumaki', anim: 'jk_shout', item: 'none', damage: 22, range: 10, cone: 0.5, cooldown: 5.5, windup: 0.9, releaseAt: 0.5, stopT: 2.0, blastStun: 1.8, selfCost: 5, dieDmg: 140, dieSelf: 0.3, dieMin: 3, dieFirst: 10, dieCD: 30, soreT: 8 },
    look: { skin: '#f2d6c2', hat: 'jk_hair_inumaki', top: 'jk_inumaki', legs: UNI, accent: '#16161a' },
    personality: { ...STUDENT, aggro: 0.45, bravery: 0, voice: 0.95, chatter: 0.25, cry: 'hey', idle: 'lean' },
    desc: 'Only says onigiri ingredients. Until he says "Don\'t move."',
  },
  {
    id: 'jk_yuta', name: 'Yuta Okkotsu', faction: 'jjk_sorcerers', side: 'sorcerer', cost: 1700, hp: 850, speed: 5.6,
    build: { scale: 1.02, girth: 0.92, legs: 1.04 },
    weapon: { line: 'Special grade · katana, Rika, Copy · Domain: Authentic Mutual Love', kind: 'jk_yuta', style: 'sword', anim: 'overhead', item: 'jk_katana', damage: 58, reach: 1.3, cooldown: 0.85, force: 420,
      copyR: 14, copyCD: 6, copyReso: 35, rikaT: 12, rikaCD: 12, rikaAt: 0.8, fullAt: 0.3, rct: 0.3, domFirst: 8, domCD: 30, domPow: 9, domDur: 6, domTick: 0.8, domDmg: 22, domMin: 3 },
    look: { skin: '#f2d2bc', hat: 'jk_hair_yuta', top: 'jk_yuta', legs: '#e8e6e0', accent: '#2a2a30' },
    personality: { aggro: 0.8, bravery: 0, voice: 1.0, chatter: 0.4, cry: 'charge', idle: 'shift' },
    reserve: [{ type: 'jk_rika', n: 1 }],
    stagger: 0.5,
    desc: 'Polite, a little gloomy, special grade. Rika will not let anyone hurt him.',
  },
  {
    // Yuta's Rika: a reserve (summoned by him; not in any setup tab)
    id: 'jk_rika', name: 'Rika', faction: 'jjk_summon', cost: 0, hp: 950, speed: 5.6,
    build: { scale: 1.9, girth: 1.05, head: 1.5, legs: 0.85, arms: 1.75, armThick: 1.15, mass: 1.0, radius: 0.55 },
    weapon: { line: 'Cursed spirit · long arms, huge slaps', kind: 'jk_rika', style: 'fists', anim: 'slam', item: 'none', damage: 55, reach: 2.2, cooldown: 1.25, force: 1300, sweep: true },
    look: { skin: '#e2ddd6', hat: 'jk_rika', top: 'jk_rika', legs: '#cfc8c0', accent: '#2a2430' },
    personality: { aggro: 1, bravery: 0, voice: 1.6, chatter: 1, cry: 'cackle', idle: 'thump' },
    armor: 0.1, stagger: 0.2,
    desc: 'Queen of Curses. Loves Yuta.',
  },
];

// ------------------------------------------------------------------ visuals
// spiky hair: n cones from the scalp (fanned over the top and back of the head)
function spikes(H, g, r, m, n, len, upK = 0.5, seed = 1, front = 0.45) {
  const { mesh, cone } = H;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed, el = 0.35 + ((i * 7 + seed * 3) % 5) / 5 * 0.9;
    const dx = Math.sin(a) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(a) * Math.cos(el) - 0.35;
    if (dz > front && dy < 0.75) continue; // keep the face clear
    const dir = new THREE.Vector3(dx, dy + upK, dz).normalize();
    const L = r * len * (0.8 + ((i * 5) % 3) * 0.15);
    const c = mesh(cone(r * 0.2, L, 5), m, dir.x * r * 0.8, dir.y * r * 0.8 + r * 0.1, dir.z * r * 0.8, g);
    c.quaternion.setFromUnitVectors(UPY, dir);
    c.position.addScaledVector(dir, L * 0.4);
  }
}
function hairCap(H, g, r, m, k = 1.07, frac = 0.36, tilt = -0.35) {
  const c = H.mesh(dome(H, r * k, frac), m, 0, r * 0.04, -r * 0.05, g);
  c.rotation.x = tilt;
  return c;
}
// a lock of hair: a cone from (x, y, z) (head radii) pointing along dir
function lock(H, g, r, m, x, y, z, dir, len, thick = 0.18) {
  const d = new THREE.Vector3(...dir).normalize();
  const c = H.mesh(H.cone(r * thick, r * len, 5), m, x * r, y * r, z * r, g);
  c.quaternion.setFromUnitVectors(UPY, d);
  c.position.addScaledVector(d, r * len * 0.4);
  return c;
}
// glasses: two lenses on the face at eye height (head radii)
// glasses in front of the (googly) eyes: two framed lenses, a bridge and the arms
function glasses(H, g, r, frame, lens, o = {}) {
  const { mesh, box } = H;
  const y = (o.y ?? 0.2) * r, w = (o.w ?? 0.78) * r, h = (o.h ?? 0.6) * r, z = (o.z ?? 1.3) * r, sep = (o.sep ?? 0.42) * r, t = 0.07 * r;
  for (const sd of [-1, 1]) {
    const lg = new H.THREE.Group(); g.add(lg);
    lg.position.set(sd * sep, y, z - Math.abs(sd) * 0.04 * r); lg.rotation.y = sd * 0.28;
    mesh(box(w, h, t * 0.5), lens, 0, 0, 0, lg).castShadow = false;
    mesh(box(w + t * 2, t, t), frame, 0, h / 2, 0, lg); mesh(box(w + t * 2, t, t), frame, 0, -h / 2, 0, lg);
    mesh(box(t, h, t), frame, -w / 2, 0, 0, lg); mesh(box(t, h, t), frame, w / 2, 0, 0, lg);
    const arm = mesh(box(t * 0.7, t * 0.7, z * 0.95), frame, sd * (sep + w * 0.5), y + h * 0.35, z * 0.5, g); arm.rotation.y = -sd * 0.12;
  }
  mesh(box(sep * 2 - w * 0.9, t * 0.8, t), frame, 0, y + h * 0.2, z + 0.02 * r, g);
}
const sleeves = (H, skel, parts, m, k = 1.15, hands = false) => {
  for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) {
    const sp = skel.parts[p], fore = p === PART.farmL || p === PART.farmR;
    H.mesh(H.capsule(sp.r * k, sp.hh * 2 * (fore ? 0.85 : 1)), m, 0, fore ? sp.hh * 0.15 : 0, 0, parts[p]);
    if (fore) H.mesh(H.cyl(sp.r * 1.3, sp.r * 1.3, sp.r * 0.7, 10), m, 0, -sp.hh * 0.62, 0, parts[p]); // (covers the core's cuff)
    if (fore && hands) H.mesh(H.sphere(sp.r * 1.55, 12, 10), m, 0, -sp.hh - sp.r * 0.25, 0, parts[p]).scale.set(1, 1.05, 1.1);
  }
};
// the jujutsu high uniform jacket: high collar, gold swirl buttons, team belt + armband
function uniform(H, def, skel, parts, team, col = UNI, o = {}) {
  const { mesh, cyl, box, mat } = H;
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, C = parts[PART.chest];
  const uni = mat(col, { spec: 0.2 }), gold = mat(GOLDB, { spec: 1 });
  const tc = tcol(H, team);
  chestShell(H, ch, uni, C);
  if (!o.noSleeves) sleeves(H, skel, parts, uni);
  if (!o.noCollar) {
    mesh(cyl(r * 0.62, r * 0.7, r * (o.collarH ?? 0.55), 14), uni, 0, hh + r * 0.62, 0, C);
    mesh(cyl(r * 0.64, r * 0.64, r * 0.08, 14), mat(o.trim || '#0c0c12'), 0, hh + r * (0.62 + (o.collarH ?? 0.55) / 2), 0, C);
  }
  for (const y of [0.55, 0.15, -0.25, -0.65]) {
    const z = r * 1.08 * Math.sqrt(Math.max(0.2, 1 - (y * 0.6) ** 2));
    mesh(cyl(r * 0.09, r * 0.09, r * 0.04, 10), gold, 0, y * hh + r * 0.05, z, C).rotation.x = Math.PI / 2;
    mesh(torus(H, r * 0.05, r * 0.012, Math.PI * 1.4, 8), mat('#8a6a20'), 0, y * hh + r * 0.05, z + r * 0.025, C);
  }
  mesh(cyl(r * 1.12, r * 1.14, r * 0.18, 14), tc, 0, -hh - r * 0.38, 0, C); // team belt
  mesh(box(r * 0.22, r * 0.16, r * 0.06), gold, 0, -hh - r * 0.38, r * 1.12, C);
  const ua = skel.parts[PART.uarmL];
  mesh(cyl(ua.r * 1.3, ua.r * 1.3, ua.hh * 0.45, 10), tc, 0, ua.hh * 0.2, 0, parts[PART.uarmL]); // armband
  return { uni, r, hh, C };
}

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, wood, metal } = H;
  if (name === 'jk_fist') return true; // (bare hands: the forearm's own hand is the fist)
  if (name === 'jk_hammer') { // a carpenter's hammer
    mesh(cyl(0.025 * s, 0.03 * s, 0.42 * s, 8), wood(), 0, 0.14 * s, 0, g);
    mesh(cyl(0.032 * s, 0.032 * s, 0.08 * s, 8), tcol(H, team), 0, -0.02 * s, 0, g);
    mesh(box(0.06 * s, 0.07 * s, 0.22 * s), mat('#4a4c56', { spec: 0.9 }), 0, 0.37 * s, 0.02 * s, g);
    mesh(cyl(0.04 * s, 0.035 * s, 0.05 * s, 8), metal(), 0, 0.37 * s, 0.15 * s, g).rotation.x = Math.PI / 2;
    for (const sd of [-1, 1]) { const cl = mesh(box(0.02 * s, 0.05 * s, 0.07 * s), mat('#4a4c56', { spec: 0.9 }), sd * 0.015 * s, 0.37 * s, -0.11 * s, g); cl.rotation.x = 0.5; }
    return true;
  }
  if (name === 'jk_cleaver') { // Nanami's blunt blade, wrapped in a polka-dot cloth
    const cloth = mat('#f0ece0', { spec: 0.05 }), dot = mat('#24242c');
    mesh(cyl(0.028 * s, 0.03 * s, 0.24 * s, 8), mat('#2a2a30'), 0, 0.06 * s, 0, g); // grip
    mesh(cyl(0.045 * s, 0.045 * s, 0.03 * s, 10), mat('#6a6a72', { spec: 0.8 }), 0, 0.19 * s, 0, g);
    const bl = mesh(box(0.05 * s, 0.7 * s, 0.17 * s), cloth, 0, 0.55 * s, 0.03 * s, g); void bl;
    mesh(box(0.052 * s, 0.06 * s, 0.172 * s), mat('#d8d0bc'), 0, 0.88 * s, 0.03 * s, g);
    for (let i = 0; i < 9; i++) for (const sd of [-1, 1]) {
      const y = 0.26 + i * 0.07, z = ((i % 3) - 1) * 0.05 + 0.03;
      mesh(sphere(0.014 * s, 6, 4), dot, sd * 0.026 * s, y * s, z * s, g);
    }
    for (const y of [0.3, 0.5, 0.7]) mesh(box(0.056 * s, 0.012 * s, 0.176 * s), mat('#d8d0bc'), 0, y * s, 0.03 * s, g); // wraps
    return true;
  }
  if (name === 'jk_naginata') { // Maki's polearm: a long dark shaft, a curved blade, a team tassel
    mesh(cyl(0.024 * s, 0.026 * s, 2.0 * s, 8), mat('#2a2018', { spec: 0.2 }), 0, 0.1 * s, 0, g);
    for (const y of [-0.55, 0.0, 0.55]) mesh(cyl(0.03 * s, 0.03 * s, 0.05 * s, 8), mat('#8a7a5a'), 0, y * s, 0, g);
    const bl = mesh(cone(0.05 * s, 0.5 * s, 4), metal(), 0, 1.33 * s, 0.03 * s, g); bl.scale.set(0.35, 1, 1.2); bl.rotation.x = 0.12;
    mesh(cyl(0.05 * s, 0.05 * s, 0.03 * s, 10), mat('#b8a060', { spec: 1 }), 0, 1.09 * s, 0, g);
    for (let i = 0; i < 3; i++) mesh(cyl(0.008 * s, 0.004 * s, 0.18 * s, 4), tcol(H, team), (i - 1) * 0.012 * s, 0.98 * s, -0.03 * s, g).rotation.x = 0.4;
    return true;
  }
  if (name === 'jk_katana') { // Yuta's katana: white-wrapped hilt, round guard, bright blade
    mesh(cyl(0.024 * s, 0.026 * s, 0.26 * s, 8), mat('#eae6dc'), 0, 0.06 * s, 0, g);
    for (let i = 0; i < 4; i++) mesh(box(0.05 * s, 0.012 * s, 0.05 * s), mat('#2a2a34'), 0, (-0.03 + i * 0.06) * s, 0, g).rotation.y = 0.8;
    mesh(cyl(0.06 * s, 0.06 * s, 0.015 * s, 12), mat('#3a3428', { spec: 0.8 }), 0, 0.2 * s, 0, g);
    const bl = mesh(box(0.012 * s, 0.9 * s, 0.045 * s), metal(), 0, 0.66 * s, 0.006 * s, g); bl.rotation.x = -0.04;
    mesh(cone(0.024 * s, 0.07 * s, 4), metal(), 0, 1.14 * s, -0.012 * s, g).scale.set(0.5, 1, 1);
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, capsule } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'jk_hair_yuji': { // pink spikes on top, a dark undercut, two bangs
      const pink = mat('#f4909e', { spec: 0.18 }), dark = mat('#3a2422', { spec: 0.1 });
      hairCap(H, g, r, dark, 1.05, 0.45, -0.1); // the undercut
      const top = mesh(sphere(r * 0.86, 14, 10), pink, 0, r * 0.52, -r * 0.05, g); top.scale.set(1.12, 0.62, 1.12);
      for (let i = 0; i < 14; i++) { // spiky on top, swept up and back
        const a = (i / 14) * Math.PI * 2, k = 0.25 + (i % 3) * 0.15;
        lock(H, g, r, pink, Math.sin(a) * k, 0.9, Math.cos(a) * k - 0.05, [Math.sin(a) * 0.6, 1, Math.cos(a) * 0.6 - 0.35], 0.62 + (i % 2) * 0.18, 0.2);
      }
      for (const sd of [-1, 1]) lock(H, g, r, pink, sd * 0.2, 0.78, 0.6, [sd * 0.4, -0.55, 0.9], 0.72, 0.2); // the two bangs
      return true;
    }
    case 'jk_hair_todo': { // slicked black hair in a topknot ponytail; a scar over the left eye
      const hair = mat('#18161a', { spec: 0.25 });
      hairCap(H, g, r, hair, 1.06, 0.4, -0.2);
      mesh(sphere(r * 0.32, 10, 8), hair, 0, r * 0.9, -r * 0.55, g); // the knot
      const tail = mesh(capsule(r * 0.2, r * 0.9), hair, 0, r * 0.55, -r * 1.05, g); tail.rotation.x = 0.55;
      mesh(cyl(r * 0.22, r * 0.22, r * 0.12, 10), tc, 0, r * 0.82, -r * 0.7, g).rotation.x = 0.9; // team hair tie
      const scarM = mat('#8a3428');
      for (const [y, z, l] of [[0.66, 0.78, 0.3], [-0.3, 0.92, 0.32]]) { const sc = mesh(box(r * 0.08, r * l, r * 0.05), scarM, r * 0.44 - y * r * 0.12, y * r, z * r, g); sc.rotation.z = 0.3; sc.rotation.x = -y * 0.6; } // the scar through his left eye
      for (const sd of [-1, 1]) { const brow = mesh(box(r * 0.4, r * 0.11, r * 0.08), hair, sd * r * 0.36, r * 0.58, r * 0.86, g); brow.rotation.z = sd * -0.25; brow.rotation.x = -0.4; }
      mesh(box(r * 0.05, r * 0.12, r * 0.03), mat('#a8704e'), 0, -r * 0.82, r * 0.55, g); // the cleft chin
      return true;
    }
    case 'jk_hair_nobara': { // an orange-brown bob, a side fringe, a nail hairpin
      const hair = mat('#c26a32', { spec: 0.15 });
      hairCap(H, g, r, hair, 1.08, 0.4);
      const back = mesh(sphere(r * 1.08, 16, 10), hair, 0, r * 0.05, -r * 0.18, g); back.scale.set(1.05, 0.95, 0.85);
      for (const sd of [-1, 1]) { const s = mesh(capsule(r * 0.34, r * 0.6), hair, sd * r * 0.82, -r * 0.2, r * 0.12, g); s.rotation.z = sd * 0.1; }
      for (let i = -2; i <= 2; i++) mesh(sphere(r * 0.26, 8, 6), hair, i * r * 0.22 - r * 0.08, r * 0.72 - (i + 2) * r * 0.035, r * 0.6 - Math.abs(i) * r * 0.08, g).scale.set(1, 0.6, 0.7); // fringe, swept
      for (const [x, y] of [[0.62, 0.62], [0.72, 0.42]]) { const n = mesh(cyl(r * 0.03, r * 0.018, r * 0.6, 5), mat('#b8bcc6', { spec: 1 }), r * x, r * y, r * 0.35, g); n.rotation.z = 1.1; }
      mesh(sphere(r * 0.1, 6, 5), tc, -r * 0.72, r * 0.55, r * 0.35, g); // team hair clip
      return true;
    }
    case 'jk_hair_nanami': { // neat blond side part; goggle-like tinted glasses
      const hair = mat('#e8cf78', { spec: 0.25 });
      hairCap(H, g, r, hair, 1.07, 0.4, -0.25);
      const fr = mesh(sphere(r * 0.5, 12, 8), hair, -r * 0.3, r * 0.68, r * 0.55, g); fr.scale.set(1.3, 0.5, 0.7); fr.rotation.z = 0.35; // swept fringe
      mesh(sphere(r * 0.35, 10, 8), hair, r * 0.5, r * 0.62, r * 0.45, g).scale.set(1, 0.55, 0.8);
      for (const sd of [-1, 1]) mesh(capsule(r * 0.18, r * 0.35), hair, sd * r * 0.88, r * 0.1, r * 0.05, g); // sideburns
      glasses(H, g, r, mat('#3a3a40', { spec: 0.6 }), mat('#3aa89a', { spec: 1, transparent: true, opacity: 0.6 }), { h: 0.5, w: 0.84 }); // his goggle-like shades
      return true;
    }
    case 'jk_hair_maki': { // dark green hair in a high ponytail, black-rimmed glasses
      const hair = mat('#2c5236', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.07, 0.42, -0.3);
      mesh(sphere(r * 0.24, 8, 6), hair, 0, r * 0.95, -r * 0.45, g);
      const tail = mesh(capsule(r * 0.2, r * 1.0), hair, 0, r * 0.45, -r * 1.05, g); tail.rotation.x = 0.4;
      mesh(cyl(r * 0.2, r * 0.2, r * 0.1, 10), tc, 0, r * 0.88, -r * 0.62, g).rotation.x = 0.9;
      for (let i = -2; i <= 2; i++) lock(H, g, r, hair, i * 0.2, 0.78, 0.55, [i * 0.15, -0.8, 0.6], 0.42, 0.16); // bangs
      glasses(H, g, r, mat('#141418', { spec: 0.5 }), mat('#d8eef0', { spec: 1, transparent: true, opacity: 0.25 }), {});
      return true;
    }
    case 'jk_hair_inumaki': { // soft ash-blond hair; the zipped collar up over his mouth
      const hair = mat('#ece6d4', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.08, 0.4);
      spikes(H, g, r, hair, 12, 0.42, 0.05, 2.2);
      for (let i = -2; i <= 2; i++) lock(H, g, r, hair, i * 0.2, 0.75, 0.58, [i * 0.2, -0.9, 0.5], 0.42, 0.18);
      const uni = mat(UNI, { spec: 0.2 });
      headBand(H, r, -0.5, 0.66, uni, g, 0.16);
      headBand(H, r, -0.19, 0.06, mat('#0c0c12'), g, 0.17);
      mesh(box(r * 0.1, r * 0.16, r * 0.05), mat(GOLDB, { spec: 1 }), 0, -r * 0.32, r * 1.13, g); // zip pull
      // the Inumaki crest: a snake's eye and fangs, on each cheek just above the collar
      const ink = mat('#2a1a2a');
      for (const sd of [-1, 1]) {
        const m = mesh(torus(H, r * 0.08, r * 0.022, Math.PI * 2, 10), ink, sd * r * 0.56, -r * 0.08, r * 0.82, g); m.rotation.y = sd * 0.6;
        mesh(sphere(r * 0.035, 6, 5), ink, sd * r * 0.56, -r * 0.08, r * 0.85, g);
        for (const k of [-1, 1]) { const f = mesh(cone(r * 0.03, r * 0.12, 4), ink, sd * r * 0.56 + k * r * 0.05, -r * 0.2, r * 0.8, g); f.rotation.x = Math.PI; f.rotation.y = sd * 0.6; }
      }
      return true;
    }
    case 'jk_hair_yuta': { // messy dark hair over the eyes, tired shadows under them
      const hair = mat('#1c1c26', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.08, 0.42, -0.2);
      spikes(H, g, r, hair, 14, 0.5, -0.15, 0.9);
      for (let i = -3; i <= 3; i++) lock(H, g, r, hair, i * 0.15, 0.72, 0.62, [i * 0.25, -0.9, 0.55], 0.55, 0.15);
      for (const sd of [-1, 1]) { const bag = mesh(box(r * 0.2, r * 0.04, r * 0.03), mat('#8a6a74'), sd * r * 0.3, -r * 0.05, r * 0.95, g); bag.rotation.y = sd * 0.3; }
      return true;
    }
    case 'jk_panda': { // a panda's head: white, black ears and eye patches, black nose
      g.userData.hidesFace = true;
      const blk = mat('#1a1a1e', { spec: 0.15 }), wht = mat('#f2f0ea', { spec: 0.1 });
      for (const sd of [-1, 1]) {
        mesh(sphere(r * 0.34, 10, 8), blk, sd * r * 0.72, r * 0.72, -r * 0.05, g).scale.set(1, 1, 0.6); // ears
        const patch = mesh(sphere(r * 0.28, 10, 8), blk, sd * r * 0.36, r * 0.1, r * 0.82, g); patch.scale.set(0.85, 1.15, 0.5); patch.rotation.z = sd * 0.5;
        mesh(sphere(r * 0.12, 8, 6), wht, sd * r * 0.34, r * 0.16, r * 0.95, g);
        mesh(sphere(r * 0.07, 8, 6), blk, sd * r * 0.33, r * 0.15, r * 1.05, g);
      }
      mesh(sphere(r * 0.42, 12, 8), wht, 0, -r * 0.32, r * 0.72, g).scale.set(1.1, 0.75, 0.75); // muzzle
      mesh(sphere(r * 0.13, 8, 6), blk, 0, -r * 0.18, r * 1.02, g).scale.set(1.3, 0.8, 0.8); // nose
      const m = mesh(box(r * 0.22, r * 0.035, r * 0.04), blk, 0, -r * 0.45, r * 1.0, g); void m;
      return true;
    }
    case 'jk_rika': { // Rika: pale, a huge grin of teeth, little dark eyes, wild hair
      g.userData.hidesFace = true;
      const skin = mat('#e2ddd6', { spec: 0.1 }), dark = mat('#14101a'), white = mat('#f8f6ee');
      const hair = mat('#3a3448', { spec: 0.1 });
      for (let i = 0; i < 14; i++) { // hair strands hanging down the back and sides
        const a = (i / 13) * Math.PI * 1.1 + Math.PI * 0.45;
        const t = tube(H, 'rika' + i + ':' + r.toFixed(3), [[Math.sin(a) * 0.8, 0.5, Math.cos(a) * 0.8], [Math.sin(a) * 1.05, -0.2, Math.cos(a) * 1.05], [Math.sin(a) * 1.2, -1.2 - (i % 3) * 0.3, Math.cos(a) * 1.15]].map(([x, y, z]) => [x * r, y * r, z * r]), r * 0.12, r * 0.04, 8);
        mesh(t, hair, 0, 0, 0, g);
      }
      hairCap(H, g, r, hair, 1.05, 0.3, -0.5);
      for (const sd of [-1, 1]) { // small black eyes with a glint
        mesh(sphere(r * 0.13, 8, 6), dark, sd * r * 0.3, r * 0.28, r * 0.88, g).scale.set(1, 1.3, 0.6);
        mesh(sphere(r * 0.035, 6, 4), mat('#ffe0f0', { emit: 1 }), sd * r * 0.28, r * 0.33, r * 0.97, g);
      }
      const mouth = mesh(sphere(r * 0.62, 16, 10), mat('#3a0e1a'), 0, -r * 0.3, r * 0.6, g); mouth.scale.set(1.25, 0.55, 0.62);
      for (let i = -6; i <= 6; i++) {
        const a = i * 0.12;
        for (const up of [1, -1]) { const t = mesh(cone(r * 0.055, r * 0.2, 4), white, Math.sin(a) * r * 0.72, -r * 0.3 + up * r * 0.18, Math.cos(a) * r * 0.92, g); t.rotation.x = up > 0 ? Math.PI : 0; }
      }
      for (const sd of [-1, 1]) { const h = mesh(cone(r * 0.12, r * 0.55, 5), skin, sd * r * 0.5, r * 0.9, -r * 0.1, g); h.rotation.z = -sd * 0.4; } // little horns
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (!isJJK(def.faction) && def.faction !== 'jjk_summon') return;
  const id = def.id;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, capsule } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis], HD = parts[PART.head];
  const rH = skel.parts[PART.head].r;
  const skin = mat(def.look.skin, { spec: 0.18 });
  if (id === 'jk_yuji') { // black uniform with the red hood
    uniform(H, def, skel, parts, team, UNI, { noCollar: true });
    const red = mat('#d0322c', { spec: 0.15 });
    // the red hood: a thick rolled collar round the neck and the hood lying on his back
    const roll = mesh(torus(H, r * 0.5, r * 0.22, Math.PI * 2, 16), red, 0, hh + r * 0.98, -r * 0.04, C); roll.rotation.x = Math.PI / 2 + 0.15;
    const hood = mesh(sphere(r * 0.62, 14, 10), red, 0, hh + r * 0.2, -r * 1.1, C); hood.scale.set(1.2, 0.85, 0.42);
    mesh(sphere(r * 0.42, 12, 8), mat('#8a1e1a'), 0, hh + r * 0.38, -r * 1.02, C).scale.set(1.0, 0.7, 0.3); // its opening
    for (const sd of [-1, 1]) { const v = mesh(box(r * 0.3, r * 0.75, r * 0.05), red, sd * r * 0.2, hh + r * 0.35, r * 1.02, C); v.rotation.z = sd * 0.5; v.rotation.x = -0.35; } // the hoodie at the neck
  }
  if (id === 'jk_todo') { // a white tank top over huge arms, dark trousers, team belt
    const top = mat('#ecebe4', { spec: 0.1 });
    chestShell(H, ch, skin, C, 1.06); // bare chest and shoulders...
    const tank = mesh(H.capsule(r * 1.27, hh * 1.2), top, 0, -hh * 0.55, 0, C); tank.scale.set(1.0, 1.0, 0.94); // ...a tank top over the belly
    for (const sd of [-1, 1]) for (const z of [-1, 1]) { const st = mesh(box(r * 0.3, hh * 1.6, r * 0.12), top, sd * r * 0.5, hh * 0.5, z * r * 1.08, C); st.rotation.x = -z * 0.25; } // straps
    for (const sd of [-1, 1]) { const pec = mesh(sphere(r * 0.42, 10, 8), skin, sd * r * 0.42, hh * 0.75, r * 0.72, C); pec.scale.set(1.1, 0.75, 0.6); }
    sleeves(H, skel, parts, skin, 1.12, false);
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.35, sp.r * 1.35, sp.r * 0.6, 10), tc, 0, -sp.hh * 0.55, 0, parts[p]); } // team wristbands
    mesh(cyl(r * 1.12, r * 1.14, r * 0.2, 14), mat('#3a2a1e'), 0, -hh - r * 0.38, 0, C);
    mesh(box(r * 0.25, r * 0.18, r * 0.06), tc, 0, -hh - r * 0.38, r * 1.13, C);
  }
  if (id === 'jk_nobara') { // uniform, pleated skirt, a pouch of nails; the straw doll in her left hand
    uniform(H, def, skel, parts, team, UNI);
    const sk = mesh(cyl(pel.r * 1.15, pel.r * 1.6, pel.r * 1.6, 16), mat(UNI, { spec: 0.2 }), 0, -pel.r * 0.55, 0, P); sk.scale.set(1, 1, 0.92);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const pl = mesh(box(pel.r * 0.08, pel.r * 1.5, pel.r * 0.1), mat('#262a3c'), Math.sin(a) * pel.r * 1.38, -pel.r * 0.58, Math.cos(a) * pel.r * 1.28, P); pl.rotation.y = a; pl.rotation.x = Math.cos(a) * 0.15; pl.rotation.z = -Math.sin(a) * 0.15; }
    mesh(box(r * 0.42, r * 0.44, r * 0.3), mat('#6b4426'), r * 0.95, -hh - r * 0.6, r * 0.25, C);
    for (let i = 0; i < 5; i++) mesh(cyl(r * 0.02, r * 0.02, r * 0.32, 4), mat('#b8bcc6', { spec: 1 }), r * (0.82 + i * 0.06), -hh - r * 0.32, r * 0.25, C);
    const sp = skel.parts[PART.farmL], Fa = parts[PART.farmL], hy = -sp.hh - sp.r * 1.6;
    const straw = mat('#d8b860', { spec: 0.05 }), twine = mat('#8a3a2a');
    mesh(capsule(sp.r * 0.6, sp.r * 1.2), straw, 0, hy - sp.r * 0.6, sp.r * 0.9, Fa);
    mesh(sphere(sp.r * 0.6, 8, 6), straw, 0, hy + sp.r * 0.6, sp.r * 0.9, Fa);
    const arms = mesh(capsule(sp.r * 0.24, sp.r * 1.7), straw, 0, hy - sp.r * 0.15, sp.r * 0.9, Fa); arms.rotation.z = Math.PI / 2;
    mesh(cyl(sp.r * 0.64, sp.r * 0.64, sp.r * 0.15, 8), twine, 0, hy + sp.r * 0.05, sp.r * 0.9, Fa);
    const nl = mesh(cyl(sp.r * 0.05, sp.r * 0.03, sp.r * 1.4, 4), mat('#b8bcc6', { spec: 1 }), 0, hy - sp.r * 0.4, sp.r * 1.4, Fa); nl.rotation.x = Math.PI / 2;
  }
  if (id === 'jk_nanami') { // beige suit, blue shirt, leopard tie, team pocket square
    const suit = mat('#d6c39a', { spec: 0.15 }), shirt = mat('#a8c4dc'), tie = mat('#e2b43a'), spot = mat('#3a2a1a');
    chestShell(H, ch, suit, C);
    sleeves(H, skel, parts, suit);
    mesh(cyl(r * 0.58, r * 0.66, r * 0.35, 14), shirt, 0, hh + r * 0.55, 0, C); // collar
    const shirtV = mesh(box(r * 0.62, hh * 1.4, r * 0.06), shirt, 0, hh * 0.45, r * 1.08, C); shirtV.rotation.x = -0.12;
    for (const sd of [-1, 1]) { const lap = mesh(box(r * 0.3, hh * 1.6 + r * 0.4, r * 0.06), suit, sd * r * 0.38, hh * 0.35, r * 1.1, C); lap.rotation.z = sd * 0.32; lap.rotation.x = -0.1; }
    const tieM = mesh(box(r * 0.2, hh * 1.5, r * 0.05), tie, 0, hh * 0.25, r * 1.16, C); tieM.rotation.x = -0.1;
    mesh(box(r * 0.22, r * 0.14, r * 0.06), tie, 0, hh + r * 0.38, r * 0.98, C); // knot
    for (let i = 0; i < 6; i++) mesh(sphere(r * 0.035, 5, 4), spot, ((i % 2) - 0.5) * r * 0.1, hh * (0.85 - i * 0.25), r * 1.2 - i * 0.004, C);
    mesh(box(r * 0.22, r * 0.12, r * 0.04), tc, r * 0.55, hh * 0.55, r * 1.06, C); // pocket square
    mesh(cyl(r * 1.13, r * 1.14, r * 0.14, 14), mat('#5a3a24'), 0, -hh - r * 0.38, 0, C);
    mesh(box(r * 0.16, r * 0.12, r * 0.05), tc, 0, -hh - r * 0.38, r * 1.13, C);
    const coat = mesh(cyl(pel.r * 1.12, pel.r * 1.25, pel.r * 1.2, 16), suit, 0, -pel.r * 0.35, -pel.r * 0.05, P); coat.scale.set(1, 1, 0.92);
    const ua = skel.parts[PART.uarmL];
    mesh(cyl(ua.r * 1.3, ua.r * 1.3, ua.hh * 0.4, 10), tc, 0, ua.hh * 0.2, 0, parts[PART.uarmL]);
    // a wristwatch (he works by the clock)
    const fl = skel.parts[PART.farmL];
    mesh(cyl(fl.r * 1.3, fl.r * 1.3, fl.r * 0.4, 10), mat('#c8a050', { spec: 1 }), 0, -fl.hh * 0.6, 0, parts[PART.farmL]);
  }
  if (id === 'jk_maki') { // uniform with loose trousers, the Split Soul Katana across her back
    uniform(H, def, skel, parts, team, '#1f2230');
    for (const p of [PART.thighL, PART.thighR]) { const sp = skel.parts[p]; mesh(capsule(sp.r * 1.3, sp.hh * 2), mat('#22242c'), 0, 0, 0, parts[p]); }
    const sheath = mesh(cyl(r * 0.07, r * 0.07, r * 4.2, 6), mat('#2a1a1a', { spec: 0.3 }), 0, 0, -r * 1.1, C); sheath.rotation.z = 0.75;
    const hilt = mesh(cyl(r * 0.06, r * 0.06, r * 1.0, 6), mat('#e8e2d0'), -Math.sin(0.75) * r * 2.5, Math.cos(0.75) * r * 2.5, -r * 1.1, C); hilt.rotation.z = 0.75;
    const strap = mesh(box(r * 0.14, (hh + r) * 2.2, r * 0.05), mat('#3a2a1e'), 0, 0, r * 1.1, C); strap.rotation.z = -0.65;
  }
  if (id === 'jk_inumaki') { // uniform with an extra high collar (the head band covers the rest)
    uniform(H, def, skel, parts, team, UNI, { collarH: 0.7 });
    const sp = skel.parts[PART.farmR]; void sp;
  }
  if (id === 'jk_yuta') { // the white uniform, a sword bag on his back, Rika's ring
    uniform(H, def, skel, parts, team, '#eceae4', { trim: '#c8c4bc' });
    const bag = mesh(cyl(r * 0.16, r * 0.14, r * 4.0, 8), mat('#2a2a34'), 0, 0, -r * 1.15, C); bag.rotation.z = -0.6;
    mesh(cyl(r * 0.17, r * 0.17, r * 0.15, 8), tc, Math.sin(0.6) * r * 1.6, Math.cos(0.6) * r * 1.6, -r * 1.15, C).rotation.z = -0.6;
    const fl = skel.parts[PART.farmL];
    mesh(torus(H, fl.r * 0.55, fl.r * 0.14, Math.PI * 2, 12), mat('#c0c4cc', { spec: 1 }), fl.r * 0.9, -fl.hh - fl.r * 1.2, fl.r * 0.5, parts[PART.farmL]).rotation.y = 1.2;
  }
  if (id === 'jk_panda') { // white belly, black arms, legs and shoulders, team scarf
    const blk = mat('#1a1a1e', { spec: 0.15 }), wht = mat('#f2f0ea', { spec: 0.1 });
    chestShell(H, ch, wht, C, 1.02);
    const band = mesh(dome(H, r * 1.25, 0.32, 20), blk, 0, hh * 0.35, 0, C); band.scale.set(1, 1.1, 0.95); // the black shoulders
    sleeves(H, skel, parts, blk, 1.18, true);
    mesh(cyl(r * 0.7, r * 0.82, r * 0.28, 14), tc, 0, hh + r * 0.62, 0, C); // team scarf
    const knot = mesh(box(r * 0.25, r * 0.5, r * 0.08), tc, r * 0.3, hh + r * 0.2, r * 0.75, C); knot.rotation.z = 0.2;
    for (const p of [PART.thighL, PART.thighR, PART.shinL, PART.shinR]) { const sp = skel.parts[p]; mesh(capsule(sp.r * 1.12, sp.hh * 2), blk, 0, 0, 0, parts[p]); }
    mesh(sphere(pel.r * 1.08, 12, 10), blk, 0, 0, 0, P).scale.set(1.1, 0.95, 1);
    mesh(sphere(pel.r * 0.3, 8, 6), wht, 0, -pel.r * 0.1, -pel.r * 1.05, P); // tail
  }
  if (id === 'jk_rika') { // pale long arms, a ragged dark dress of shadow, a team-coloured ring collar
    const pale = mat(def.look.skin, { spec: 0.1 }), rag = mat('#2a2430', { spec: 0.1 });
    chestShell(H, ch, pale, C);
    sleeves(H, skel, parts, pale, 1.1, false);
    for (const p of [PART.farmL, PART.farmR]) { // claws
      const sp = skel.parts[p];
      mesh(sphere(sp.r * 1.7, 10, 8), pale, 0, -sp.hh - sp.r * 0.3, 0, parts[p]).scale.set(1.1, 1.0, 1.2);
      for (let k = -1; k <= 1; k++) { const cl = mesh(cone(sp.r * 0.3, sp.r * 1.6, 4), mat('#1a1420'), k * sp.r * 0.6, -sp.hh - sp.r * 1.9, sp.r * 0.5, parts[p]); cl.rotation.x = Math.PI + 0.3; }
    }
    const skirt = mesh(cyl(pel.r * 1.1, pel.r * 1.9, pel.r * 2.4, 14), rag, 0, -pel.r * 1.0, 0, P); skirt.scale.set(1, 1, 0.9);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const t = mesh(cone(pel.r * 0.3, pel.r * 0.8, 4), rag, Math.sin(a) * pel.r * 1.7, -pel.r * 2.4, Math.cos(a) * pel.r * 1.6, P); t.rotation.x = Math.PI; }
    mesh(torus(H, r * 0.75, r * 0.12, Math.PI * 2, 18), tc, 0, hh + r * 0.6, 0, C).rotation.x = Math.PI / 2;
    // ridged spine and shoulder lumps
    for (let i = 0; i < 4; i++) mesh(cone(r * 0.14, r * 0.4, 4), pale, 0, hh - i * r * 0.45, -r * 1.1, C).rotation.x = -1.2;
    for (const sd of [-1, 1]) mesh(sphere(r * 0.42, 10, 8), pale, sd * r * 0.9, hh + r * 0.35, -r * 0.1, C);
  }
  void HD; void rH; void td;
}

// text on a sprite (the cursed speech words, onigiri bubbles) - only in a browser
function textSprite(H, g, text, o = {}) {
  if (typeof document === 'undefined') return null;
  const T = H.THREE, c = document.createElement('canvas'), x = c.getContext('2d');
  const fs = 88, font = `900 ${fs}px "Arial Black", Impact, Arial, sans-serif`;
  x.font = font;
  const w = Math.ceil(x.measureText(text).width) + (o.bubble ? 80 : 40);
  c.width = w; c.height = Math.ceil(fs * (o.bubble ? 1.9 : 1.4));
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (o.bubble) {
    x.fillStyle = '#ffffff'; x.strokeStyle = '#1a1a22'; x.lineWidth = 8;
    const R = 40, W = c.width - 8, Hh = fs * 1.35;
    x.beginPath(); x.roundRect(4, 4, W, Hh, R); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(c.width / 2 - 20, Hh + 2); x.lineTo(c.width / 2, c.height - 4); x.lineTo(c.width / 2 + 20, Hh + 2); x.fill(); x.stroke();
    x.fillStyle = '#1a1a22'; x.fillText(text, c.width / 2, Hh / 2 + 6);
  } else {
    x.lineWidth = 14; x.strokeStyle = o.stroke || '#120a18'; x.lineJoin = 'round';
    x.strokeText(text, c.width / 2, c.height / 2);
    x.fillStyle = o.color || '#ffffff'; x.fillText(text, c.width / 2, c.height / 2);
  }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: !o.top }));
  const h = o.h || 0.6;
  sp.scale.set(h * c.width / c.height, h, 1);
  sp.renderOrder = 12; sp.castShadow = false;
  g.add(sp);
  return sp;
}
const BUBBLES = ['Salmon!', 'Tuna mayo!', 'Kelp!', 'Bonito flakes!'];

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, octa, mat, glow } = H;
  const ns = (m) => { m.castShadow = false; return m; };
  const add = (m) => ns(m);
  switch (type) {
    case 'jk_nail': {
      const iron = mat('#b8bcc6', { spec: 1 });
      mesh(cyl(0.012, 0.012, 0.26, 5), iron, 0, 0, 0, g);
      mesh(cone(0.013, 0.05, 5), iron, 0, 0.15, 0, g);
      mesh(cyl(0.03, 0.03, 0.012, 8), iron, 0, -0.13, 0, g);
      add(mesh(cyl(0.006, 0.02, 0.4, 4), mat('#8ad0ff', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), 0, -0.32, 0, g));
      return true;
    }
    case 'jk_pin': { // Hairpin: a burst of blue cursed energy
      add(mesh(sphere(0.35, 10, 8), mat('#bfe4ff', { emit: 1, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 6; i++) { const s = add(mesh(octa(0.07), glow('#4aa0ff'), Math.sin(i * 1.1) * 0.4, Math.cos(i * 2.3) * 0.4, Math.sin(i * 0.7 + 1) * 0.4, g)); s.scale.set(0.5, 2, 0.5); s.rotation.z = i; }
      return true;
    }
    case 'jk_bf': { // Black Flash: black lightning round a red core
      const blk = mat('#0a0408', { emit: 0.05 }), red = glow('#ff1c3a');
      add(mesh(sphere(0.18, 10, 8), glow('#fff2f4'), 0, 0, 0, g));
      add(mesh(sphere(0.5, 12, 8), mat('#ff1a36', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g));
      add(mesh(sphere(0.8, 12, 8), mat('#08000a', { transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 9; i++) { // jagged bolts: three zig-zag segments each
        let p0 = new THREE.Vector3(0, 0, 0);
        const dir = new THREE.Vector3(Math.sin(i * 2.4) * Math.cos(i), Math.cos(i * 1.7) * 0.8, Math.cos(i * 2.4) * Math.sin(i + 1)).normalize();
        for (let k = 0; k < 3; k++) {
          const off = new THREE.Vector3(Math.sin(i * 3 + k * 5), Math.cos(i * 7 + k), Math.sin(i + k * 3)).multiplyScalar(0.25);
          const p1 = p0.clone().addScaledVector(dir, 0.42).add(off);
          const len = p0.distanceTo(p1);
          const s = add(mesh(box(k === 0 ? 0.07 : 0.05, len, 0.035), i % 3 === 0 ? red : blk, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, g));
          s.quaternion.setFromUnitVectors(UPY, p1.clone().sub(p0).normalize());
          p0 = p1;
        }
      }
      return true;
    }
    case 'jk_fistbf': { // a fist about to land a black flash
      add(mesh(sphere(0.16, 10, 8), mat('#16040a', { emit: 0.2, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 5; i++) { const sp = add(mesh(octa(0.05), glow('#ff2440'), Math.sin(i * 1.3) * 0.16, Math.cos(i * 2.1) * 0.16, Math.sin(i * 0.7) * 0.16, g)); sp.scale.set(0.5, 1.8, 0.5); sp.rotation.z = i; }
      return true;
    }
    case 'jk_div': { // Divergent Fist's second impact: a blue ring burst
      for (let i = 0; i < 2; i++) { const t = add(mesh(torus(H, 0.3 + i * 0.14, 0.03, Math.PI * 2, 16), glow(i ? '#9ad4ff' : '#4a9cff'), 0, 0, 0.15, g)); t.rotation.y = i * 0.5; }
      add(mesh(sphere(0.22, 10, 8), mat('#bfe0ff', { emit: 1, transparent: true, opacity: 0.4, depthWrite: false }), 0, 0, 0.15, g));
      return true;
    }
    case 'jk_swap': { // Boogie Woogie: a pop of air where someone was / now is
      for (let i = 0; i < 3; i++) { const t = add(mesh(torus(H, 0.4 + i * 0.22, 0.035, Math.PI * 2, 20), mat(i % 2 ? '#ffe9a8' : '#ffffff', { emit: 1, transparent: true, opacity: 0.7 - i * 0.15, depthWrite: false }), 0, 0.1 + i * 0.5, 0, g)); t.rotation.x = Math.PI / 2; }
      for (let i = 0; i < 6; i++) { const a = i * 1.05; const s = add(mesh(octa(0.08), glow('#fff4c8'), Math.cos(a) * 0.55, 0.9, Math.sin(a) * 0.55, g)); s.scale.set(0.4, 1.6, 0.4); }
      return true;
    }
    case 'jk_clap': { // the clap: a flat shockwave in front of the hands
      for (let i = 0; i < 3; i++) { const t = add(mesh(torus(H, 0.25 + i * 0.2, 0.03, Math.PI * 2, 18), mat('#ffffff', { emit: 1, transparent: true, opacity: 0.75 - i * 0.2, depthWrite: false }), 0, 0, i * 0.08, g)); void t; }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const s = add(mesh(box(0.03, 0.25, 0.03), glow('#fff2b0'), Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.05, g)); s.rotation.z = a - Math.PI / 2; }
      return true;
    }
    case 'jk_reso': { // Resonance: a red throb and a phantom nail through the chest
      for (let i = 0; i < 2; i++) { const t = add(mesh(torus(H, 0.32 + i * 0.12, 0.03, Math.PI * 2, 16), glow(i ? '#7ac0ff' : '#ff2a4a'), 0, 0, 0, g)); t.rotation.set(Math.PI / 2 + i * 0.6, i * 1.2, 0); }
      const nl = add(mesh(cyl(0.025, 0.012, 0.8, 5), glow('#e0f0ff'), 0, 0, 0.1, g)); nl.rotation.x = Math.PI / 2;
      add(mesh(cyl(0.06, 0.06, 0.02, 8), glow('#e0f0ff'), 0, 0, 0.5, g)).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_ratio': { // 7:3: a line across the target, the weak point marked
      add(mesh(box(1.0, 0.025, 0.02), mat('#101014', { emit: 0.2 }), 0, 0, 0, g));
      for (const x of [-0.5, 0.5]) add(mesh(box(0.025, 0.12, 0.02), mat('#101014'), x, 0, 0, g));
      add(mesh(box(0.04, 0.22, 0.03), glow('#ffd23a'), 0.2, 0, 0.01, g));
      add(mesh(sphere(0.07, 8, 6), glow('#fff0a0'), 0.2, 0, 0.02, g));
      return true;
    }
    case 'jk_ot': { // Overtime: the tie loosened over his shoulder, a faint golden heat
      add(mesh(sphere(0.55, 12, 8), mat('#ffc84a', { emit: 1, transparent: true, opacity: 0.12, depthWrite: false }), 0, 0, 0, g));
      const tie = add(mesh(box(0.07, 0.55, 0.02), mat('#e2b43a'), 0.12, 0.15, 0.27, g)); tie.rotation.z = -0.9;
      for (let i = 0; i < 3; i++) add(mesh(sphere(0.02, 5, 4), mat('#3a2a1a'), 0.12 + (i - 1) * 0.12, 0.15 + (1 - i) * 0.09, 0.285, g));
      return true;
    }
    case 'jk_rage': { // Yuji, enraged: red cursed energy flickering off him
      for (let i = 0; i < 5; i++) { const a = i * 1.26; const f = add(mesh(cone(0.08, 0.4, 5), mat('#ff3040', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3, g)); f.rotation.z = Math.cos(a) * 0.3; }
      return true;
    }
    case 'jk_glass': { // her glasses shatter
      for (let i = 0; i < 8; i++) { const s = add(mesh(octa(0.04), mat('#e8f8ff', { emit: 0.6, transparent: true, opacity: 0.8 }), Math.sin(i * 2) * 0.25, Math.cos(i * 1.3) * 0.2, 0.1 + Math.sin(i) * 0.1, g)); s.scale.set(1, 0.3, 1); }
      return true;
    }
    case 'jk_awake': { // awakened: a dark green heat haze
      for (let i = 0; i < 4; i++) { const a = i * 1.57; const f = add(mesh(cone(0.07, 0.35, 5), mat('#5adc8a', { emit: 1, transparent: true, opacity: 0.35, depthWrite: false }), Math.cos(a) * 0.3, 0.25, Math.sin(a) * 0.3, g)); f.rotation.z = Math.cos(a) * 0.3; }
      return true;
    }
    case 'jk_soul': { // Split Soul: a pale cut that goes right through
      for (const [w, y] of [[1.4, 0], [0.9, 0.1]]) { const c = add(mesh(sphere(0.5, 10, 6), glow('#d0f0ff'), 0, y, 0, g)); c.scale.set(w, 0.05, 0.04); }
      return true;
    }
    case 'jk_gorilla_head': { // Gorilla core: a heavy dark brow and muzzle over the panda face
      const fur = mat('#2a2a30', { spec: 0.1 }), face = mat('#4a4048');
      add(mesh(sphere(0.2, 12, 8), fur, 0, 0.06, 0.02, g)).scale.set(1.25, 1.0, 1.2);
      add(mesh(box(0.3, 0.06, 0.08), face, 0, 0.1, 0.2, g));
      add(mesh(sphere(0.12, 10, 8), face, 0, -0.06, 0.18, g)).scale.set(1.2, 0.8, 0.9);
      for (const sd of [-1, 1]) add(mesh(sphere(0.03, 6, 5), glow('#ff3a2a'), sd * 0.07, 0.06, 0.24, g));
      return true;
    }
    case 'jk_gorilla_body': { // ...and a hulking dark-grey back and shoulders
      const fur = mat('#2a2a30', { spec: 0.1 });
      add(mesh(sphere(0.45, 12, 8), fur, 0, 0.18, -0.12, g)).scale.set(1.35, 0.85, 1.0);
      for (const sd of [-1, 1]) add(mesh(sphere(0.22, 10, 8), fur, sd * 0.42, 0.25, 0, g));
      add(mesh(sphere(0.18, 8, 6), mat('#9a9aa0'), 0, 0.05, -0.5, g)).scale.set(1.2, 0.9, 0.4); // silverback
      return true;
    }
    case 'jk_drum': { // Drumming Beat: shock rings going through
      for (let i = 0; i < 3; i++) { const t = add(mesh(torus(H, 0.28 + i * 0.16, 0.035, Math.PI * 2, 16), mat('#fff0d0', { emit: 1, transparent: true, opacity: 0.75 - i * 0.2, depthWrite: false }), 0, 0, -0.2 - i * 0.25, g)); void t; }
      return true;
    }
    case 'jk_bind': { // "Don't move!": rings of cursed speech binding the legs
      for (let i = 0; i < 3; i++) { const t = add(mesh(torus(H, 0.32, 0.025, Math.PI * 2, 18), mat('#e0c8ff', { emit: 1, transparent: true, opacity: 0.7, depthWrite: false }), 0, -0.2 - i * 0.22, 0, g)); t.rotation.x = Math.PI / 2 + (i - 1) * 0.15; }
      return true;
    }
    case 'jk_diemark': { // "Die": a dark burst
      add(mesh(sphere(0.45, 10, 8), mat('#2a0010', { transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 6; i++) { const s = add(mesh(cone(0.06, 0.5, 4), glow('#ff2a4a'), Math.sin(i) * 0.3, Math.cos(i * 1.7) * 0.3, Math.sin(i * 2.3) * 0.3, g)); s.rotation.set(i, i * 2, 0); }
      return true;
    }
    case 'jk_syrup': { // cough syrup, for the throat
      add(mesh(cyl(0.05, 0.05, 0.16, 8), mat('#8a2a3a', { spec: 0.8, transparent: true, opacity: 0.85 }), 0, 0, 0.05, g));
      add(mesh(cyl(0.025, 0.03, 0.05, 8), mat('#f2f2f2'), 0, 0.1, 0.05, g));
      add(mesh(box(0.08, 0.06, 0.005), mat('#f4e8c8'), 0, 0, 0.1, g));
      return true;
    }
    case 'jk_collar_open': { // the collar pulled down: his mouth and the snake-fangs mark on his tongue
      add(mesh(sphere(0.06, 8, 6), mat('#3a0e1a'), 0, -0.05, 0.115, g)).scale.set(1.4, 0.7, 0.4);
      add(mesh(torus(H, 0.035, 0.008, Math.PI * 2, 8), mat('#1a1018'), 0, -0.06, 0.135, g));
      return true;
    }
    case 'jk_copy': { // Copy: Rika's ring glows, rings of light
      for (let i = 0; i < 2; i++) { const t = add(mesh(torus(H, 0.35 + i * 0.15, 0.02, Math.PI * 2, 18), glow(i ? '#ffd8f0' : '#e080ff'), 0, 0, 0, g)); t.rotation.set(Math.PI / 2 + i * 0.4, i, 0); }
      add(mesh(sphere(0.12, 8, 6), mat('#ffe0ff', { emit: 1, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_ring': { // the ring, lit (full manifestation)
      add(mesh(torus(H, 0.035, 0.012, Math.PI * 2, 12), glow('#ff80e0'), 0.06, -0.02, 0.03, g)).rotation.y = 1.2;
      add(mesh(sphere(0.1, 8, 6), mat('#ff9ae8', { emit: 1, transparent: true, opacity: 0.35, depthWrite: false }), 0.06, -0.02, 0.03, g));
      return true;
    }
    case 'jk_rikarise': { // Rika appears / goes: a ring of dark cursed energy on the ground
      add(mesh(cyl(1.4, 1.4, 0.02, 24), mat('#1a0a1e', { transparent: true, opacity: 0.75, depthWrite: false }), 0, 0, 0, g));
      add(mesh(torus(H, 1.4, 0.06, Math.PI * 2, 32), glow('#e070ff'), 0, 0.02, 0, g)).rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = i * 0.785; const w = add(mesh(cone(0.12, 1.2, 5), mat('#3a1a48', { transparent: true, opacity: 0.6, depthWrite: false }), Math.cos(a) * 1.0, 0.6, Math.sin(a) * 1.0, g)); w.rotation.z = Math.cos(a) * 0.3; }
      return true;
    }
    case 'jk_cut': { // a sword cut in the domain
      for (const [w, y] of [[1.4, 0], [1.0, 0.12]]) {
        const c = add(mesh(sphere(0.5, 10, 6), glow('#ffffff'), 0, y, 0, g)); c.scale.set(w, 0.05, 0.04);
        const h = add(mesh(sphere(0.5, 10, 6), mat('#ff9ae8', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, y, 0, g)); h.scale.set(w * 0.95, 0.18, 0.1);
      }
      return true;
    }
    case 'jk_aml': { // Authentic Mutual Love: a pale dome over a field of swords stuck in the ground
      const R = AML_R;
      domeMesh(H, g, R, '#f6e6f2', 0.3, '#c890d8');
      add(mesh(H.geo('jkamlf', () => new THREE.CircleGeometry(R, 40).rotateX(-Math.PI / 2)), mat('#efe2ea', { transparent: true, opacity: 0.5, depthWrite: false }), 0, 0.04, 0, g));
      const blade = mat('#e8eef4', { spec: 1 }), hilt = mat('#2a2430'), guard = mat('#b8a060', { spec: 1 });
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 46; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (R - 0.6), big = i < 6;
        const k = big ? 2.4 : 1;
        const sw = new THREE.Group(); g.add(sw);
        sw.position.set(Math.sin(a) * d, 0, Math.cos(a) * d);
        sw.rotation.set(rand(-0.35, 0.35), rnd() * 6.3, rand(-0.35, 0.35));
        add(mesh(box(0.025 * k, 0.9 * k, 0.07 * k), blade, 0, 0.35 * k, 0, sw));
        add(mesh(box(0.14 * k, 0.025 * k, 0.1 * k), guard, 0, 0.8 * k, 0, sw));
        add(mesh(cyl(0.025 * k, 0.025 * k, 0.28 * k, 6), hilt, 0, 0.95 * k, 0, sw));
      }
      // a ring of hands (Rika's) round the inside of the barrier
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const h = add(mesh(cone(0.25, 1.4, 5), mat('#e2ddd6'), Math.sin(a) * (R - 0.4), 0.6, Math.cos(a) * (R - 0.4), g)); h.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); }
      return true;
    }
    case 'jk_w_stop': textSprite(H, g, "DON'T MOVE!", { color: '#f0e0ff', h: 0.7 }); return true;
    case 'jk_w_blast': textSprite(H, g, 'BLAST AWAY!', { color: '#ffe8c8', h: 0.7 }); return true;
    case 'jk_w_die': textSprite(H, g, 'DIE.', { color: '#ff3a4a', h: 1.0 }); return true;
    case 'jk_wave': case 'jk_wave_die': {
      const m = mat(type === 'jk_wave' ? '#e8dcff' : '#ff4a5a', { emit: 0.7, transparent: true, opacity: 0.45, depthWrite: false });
      for (let i = 0; i < 2; i++) { const t = add(mesh(torus(H, 0.45 + i * 0.3, 0.035, Math.PI * 2, 18), m, 0, -i * 0.3, 0, g)); t.rotation.x = Math.PI / 2; }
      return true;
    }
  }
  if (type.startsWith('jk_bub')) { textSprite(H, g, BUBBLES[+type.slice(6)] || 'Salmon!', { bubble: true, h: 0.42 }); return true; }
  return false;
}

register({
  units,
  items: {
    jk_hammer: { len: 0.45, r: 0.06, grip: 30, mass: 0.9 },
    jk_fist: { len: 0.42, r: 0.11, grip: 90, phys: false }, // bare fists (hit geometry only)
    jk_cleaver: { len: 0.95, r: 0.1, grip: 30, mass: 2.0 },
    jk_naginata: { len: 2.1, r: 0.07, grip: 95, back: 0.45, metal: true, mass: 2.2 },
    jk_katana: { len: 1.2, r: 0.07, grip: 25, metal: true, mass: 1.3 },
  },
  kinds: { jk_yuji: yuji, jk_todo: todo, jk_nobara: nobara, jk_nanami: nanami, jk_maki: maki, jk_panda: panda, jk_inumaki: inumaki, jk_yuta: yuta, jk_rika: rika },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
});
