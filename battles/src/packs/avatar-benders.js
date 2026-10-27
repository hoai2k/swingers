// Avatar: Team Avatar, the Earth Kingdom and the Kyoshi Warriors (built on avatar-core.js).
//  - Aang (hero): airbending. Air blasts that burst and throw groups back and up, an air
//    scooter dash (he rides a spinning ball of air up to far targets) and his glider staff
//    in melee. Once, when badly hurt, the Avatar State: he rises and hovers, his arrows and
//    eyes glow, four elemental orbs whirl round him and every beat one element hits all
//    around (fire burns, water shoves, earth throws up, air blows everyone away); he takes
//    little damage while it lasts, then floats back down.
//  - Katara: waterbending. A water whip at mid range, a fan of ice spikes (they slow) and
//    healing: glowing water on hurt allies near her.
//  - Sokka: no bending. Throws his boomerang (it curves out and comes back, hitting on the
//    way out and on the way back), then fights with his black space sword.
//  - Toph: earthbending. Rock pillars erupt under enemies and launch them (the landing
//    hurts), she rips up and throws boulders, brawls with rock fists, and once, when hurt,
//    pulls on earth armour.
//  - Earthbender (Earth Kingdom soldier): pops a rock disc out of the ground and hurls it.
//  - Kyoshi Warrior: twin metal fans; fan strikes knock back, and she turns blows aside
//    with a fan and a quick sidestep.
// Everything drawn is a unit part, a projectile or a marker (battle.stuck), and every
// effect goes through battle.emit, so replays show it all.
import { register } from '../ext.js';
import { ATTACKS } from '../pose.js';
import { makeSkeleton } from '../body.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, aimPoint, launchVel, addProjectile,
  handPos, arrowProj, pushUnit, newId, addStatus, groundEnemy, airborne, torus, dome, chestShell, headBand, tcol, tdark,
} from './common.js';
import { UPY, mark, markAt, hover, setArmKey, STANCE } from './ges-core.js';
import { trackFall } from './bc-core.js';
import { FAC, fx } from './avatar-core.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

// ------------------------------------------------------------------ animations
ATTACKS.avb_push = [ // both palms pulled back to the hips, then thrust forward (air / earth)
  [0.0, null, null, 0, 0, 0],
  [0.38, [0.25, 0.35, 0.45, -1.3], [0.25, 0.35, 0.45, -1.3], 0.25, -0.2, 0.2],
  [0.58, [0.1, 0.1, -1.5, -1.55], [0.1, 0.1, -1.5, -1.55], -0.15, 0.4, 0.1],
  [0.8, [0.1, 0.1, -1.45, -1.5], [0.1, 0.1, -1.45, -1.5], -0.1, 0.35, 0.12],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avb_whip = [ // right arm swept up behind, then lashed forward and down
  [0.0, null, null, 0, 0, 0],
  [0.3, [0.1, 0.4, -1.0, -1.4], [-0.3, 0.6, -2.4, -2.7], 0.45, -0.2, 0.1],
  [0.5, [0.1, 0.4, -1.1, -1.4], [0.35, 0.1, -1.4, -1.3], -0.35, 0.35, 0.12],
  [0.75, [0.1, 0.4, -1.0, -1.3], [0.5, 0.0, -0.8, -0.6], -0.5, 0.4, 0.15],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avb_stomp = [ // arms flung up, then both fists driven down at the ground
  [0.0, null, null, 0, 0, 0],
  [0.35, [-0.1, 0.5, -2.6, -2.9], [-0.1, 0.5, -2.6, -2.9], 0, -0.3, 0.0],
  [0.55, [0.35, 0.2, -0.2, -0.3], [0.35, 0.2, -0.2, -0.3], 0, 0.55, 0.45],
  [0.8, [0.35, 0.2, -0.15, -0.25], [0.35, 0.2, -0.15, -0.25], 0, 0.5, 0.4],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avb_heave = [ // scoop low, heave a boulder overhead, then hurl it forward
  [0.0, null, null, 0, 0, 0],
  [0.3, [0.3, 0.2, -0.6, -0.8], [0.3, 0.2, -0.6, -0.8], 0, 0.45, 0.4],
  [0.55, [-0.1, 0.4, -2.6, -2.8], [-0.1, 0.4, -2.6, -2.8], 0, -0.3, 0.05],
  [0.72, [0.2, 0.1, -1.3, -1.4], [0.2, 0.1, -1.3, -1.4], 0, 0.45, 0.1],
  [1.0, null, null, 0, 0, 0],
];
// a throw with the left hand (Sokka keeps his sword in the right)
ATTACKS.avb_throwL = ATTACKS.throw.map(([t, L, R, tw, le, cr]) => [t, R, L, -tw, le, cr]);
STANCE.avb_state = (st, pose) => { setArmKey(pose, 1, [0, 1.15, -0.35, -0.5]); setArmKey(pose, -1, [0, 1.15, -0.35, -0.5]); }; // Avatar State: arms out
STANCE.avb_scoot = (st, pose) => { setArmKey(pose, 1, [0.1, 0.5, -0.6, -1.2]); setArmKey(pose, -1, [0.1, 0.5, -0.6, -1.2]); }; // riding the air scooter

// ------------------------------------------------------------------ shared helpers
const flatD = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const foe = (u, v) => v && v.alive && !v.dormant && v.team !== u.team;
function enemiesNear(b, u, p, r) {
  const out = [];
  b.grid.query(p.x, p.z, r + 2, (v) => { if (foe(u, v) && flatD(v.pos, p) < r + v.skel.radius) out.push(v); });
  return out;
}
// Start one of a unit's own actions: `anim` for `dur` seconds, tagged so event() knows it.
function act(u, anim, dur, tag, cd) {
  u.avTag = tag;
  u.startAttack();
  u.st.attack = anim;
  u.attackDur = dur;
  if (cd !== undefined) u.cooldown = cd;
}
// at the end of an action the unit's own swing timing comes back
function endAct(u, t1) { if (t1 >= 1) { u.attackDur = u.avDur; u.avTag = null; } }
const busy = (u) => u.st.attack || u.isDown() || u.stun > 0.05;

// A bending hit: damage, a push as a change of velocity (less for big units), a stun.
function bend(b, v, dmg, dvx, dvy, dvz, u, kind, stun = 0.8) {
  if (v.kind?.parry && v.kind.parry(v, u, kind)) { v.hit(dmg, PART.chest, 0, 0, 0, u, kind); return false; }
  v.hit(dmg, PART.chest, 0, 0, 0, u, kind);
  const k = clamp(1 / Math.max(1, v.s), 0.3, 1) * clamp(150 / v.M, 0.25, 1);
  pushUnit(v, v.M * dvx * k, v.M * dvy * k, v.M * dvz * k);
  if (v.alive) v.stun = Math.max(v.stun, stun * (v.def.stagger ?? 1));
  return true;
}
// a burst of wind at p: everyone near is blown outward and up
function gust(b, u, p, R, dmg, out, up, kind = 'avb_air') {
  for (const v of enemiesNear(b, u, p, R)) {
    _d.set(v.pos.x - p.x, 0, v.pos.z - p.z);
    const d = _d.length();
    if (d > 1e-3) _d.multiplyScalar(1 / d); else _d.set(Math.sin(u.heading), 0, Math.cos(u.heading));
    const f = clamp(1 - d / (R + 1), 0.35, 1);
    if (bend(b, v, dmg * f, _d.x * out * f, up * f, _d.z * out * f, u, kind, 1.1 * f)) trackFall(b, v, u, 9);
  }
}

// curved beams: a chain of markers along points pts (each marker's shaft is +Y, `seg`
// long), riding on the owner so the replay records them while it lives (like ges-core's
// refreshBeam, but along a curve)
function curveBeam(b, beam, owner, pts, type) {
  beam.segs ??= [];
  const S = beam.segs, n = pts.length - 1;
  while (S.length < n) {
    const s = { type, unit: owner, part: PART.chest, lp: new THREE.Vector3(), lq: new THREE.Quaternion(), pos: new THREE.Vector3(), quat: new THREE.Quaternion(), t: 0.5, id: newId() };
    S.push(s); b.stuck.push(s);
  }
  while (S.length > n) S.pop().t = 0;
  const rq = owner.rag.quat[PART.chest], rp = owner.rag.pos[PART.chest];
  _q.copy(rq).invert();
  for (let j = 0; j < n; j++) {
    const s = S[j], A = pts[j], B = pts[j + 1];
    s.pos.lerpVectors(A, B, 0.5);
    _v.subVectors(B, A);
    const L = _v.length() || 1;
    s.quat.setFromUnitVectors(UPY, _v.multiplyScalar(1 / L));
    s.lp.copy(s.pos).sub(rp).applyQuaternion(_q);
    s.lq.copy(_q).multiply(s.quat);
    s.t = 0.5;
  }
}
function endBeamL(beam) { if (beam.segs) { for (const s of beam.segs) s.t = 0; beam.segs = []; } }
// a world marker that we move ourselves every step (recorded every frame)
function liveMark(b, type, pos, t) { const s = markAt(b, type, pos, t); s.dyn = true; return s; }

// ------------------------------------------------------------------ Aang
// Air blast: a ball of wind that bursts where it reaches (or on the first enemy it meets).
function airBurst(b, pr) {
  if (pr.burst) return;
  pr.burst = true;
  const o = pr.owner, w = o.def.weapon;
  fx(b, 'av_air', pr.pos, w.blastR);
  fx(b, 'av_air', pr.pos, w.blastR * 0.55);
  b.sound('av_air', pr.pos, 1.2, 1);
  b.sound('thump', pr.pos, 0.6, 1.4);
  gust(b, o, pr.pos, w.blastR, pr.damage, w.blastOut, w.blastUp);
}
const AIRBALL = {
  g: 0, len: 0, r: 0.35, life: 2,
  step(b, pr, dt) {
    pr.k = (pr.k || 0) + 1;
    if (pr.k % 2 === 0) b.emit('av_atrail', pr.pos.x + rand(-0.15, 0.15), pr.pos.y + rand(-0.15, 0.15), pr.pos.z + rand(-0.15, 0.15));
    pr.go -= pr.vel.length() * dt;
    if (pr.go <= 0) { airBurst(b, pr); pr.life = -1; }
  },
  hit(b, pr) { airBurst(b, pr); return true; },
  ground(b, pr) { airBurst(b, pr); return true; },
};
function aangBlast(u) {
  const b = u.battle, w = u.def.weapon;
  const h = _o.copy(u.chestPos);
  h.x += Math.sin(u.heading) * 0.4; h.z += Math.cos(u.heading) * 0.4;
  aimPoint(u, _p, 0.4, 0.4);
  _p.y = Math.max(_p.y, b.terrain.height(_p.x, _p.z) + 0.6);
  const d = Math.max(2, h.distanceTo(_p));
  _v.subVectors(_p, h).normalize().multiplyScalar(w.blastSpeed);
  addProjectile(b, 'avb_airball', h, _v, u, { damage: w.blastDmg, life: 2, go: d + 0.3 });
  fx(b, 'av_atrail', h);
  b.sound('av_air', h, 1.0, 1.45);
}
function startScoot(u) {
  const b = u.battle;
  u.avScoot = u.def.weapon.scootT;
  u.avScootCd = u.def.weapon.scootCd;
  const g = b.terrain.height(u.pos.x, u.pos.z);
  u.avBall = liveMark(b, 'avb_scooter', _p.set(u.pos.x, g + 0.35 * u.s, u.pos.z), 99);
  u.st.style = 'avb_scoot';
  u.rag.impulseAll(0, u.M * 2.5, 0);
  b.sound('av_air', u.pos, 1.0, 1.1);
}
function endScoot(u) {
  u.avScoot = 0;
  if (u.avBall) { fx(u.battle, 'av_air', u.avBall.pos, 0.8); u.avBall.t = 0; u.avBall = null; }
  if (!u.avState) u.st.style = u.def.weapon.style;
}
// The Avatar State: glow, hover, elemental orbs and pulses
const ORBS = ['avb_orb_fire', 'avb_orb_water', 'avb_orb_earth', 'avb_orb_air'];
function enterState(u) {
  const b = u.battle, w = u.def.weapon;
  if (u.avScoot > 0) endScoot(u);
  u.avState = w.stateT;
  u.avStateDone = true;
  u.avPulse = 0.5;
  u.avPulseN = 0;
  u.st.attack = null;
  u.attackDur = u.avDur;
  u.st.style = 'avb_state';
  u.stun = 0;
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp * w.stateHeal);
  const hl = new THREE.Vector3(0, 0, 0);
  u.avGlow = [mark(b, u, 'avb_astate', PART.head, w.stateT + 0.3, hl)];
  for (const p of [PART.farmL, PART.farmR]) u.avGlow.push(mark(b, u, 'avb_ahand', p, w.stateT + 0.3, new THREE.Vector3(0, -u.skel.handOffset, 0)));
  u.avOrbs = ORBS.map((t) => liveMark(b, t, u.chestPos, w.stateT + 0.3));
  const c = u.chestPos;
  fx(b, 'av_aura', c, 2);
  fx(b, 'av_air', u.pos, 3);
  b.emit('explode', c.x, c.y, c.z, 2.5, 2);
  b.sound('av_state', c, 1.2, 1);
  b.sound('boom', c, 0.8, 0.6);
  b.voice(u, 'cry', true);
  u.expr = EXPR.angry;
}
function endState(u) {
  u.avState = 0;
  u.st.style = u.def.weapon.style;
  u.st.gsFly = false;
  for (const m of u.avGlow || []) m.t = 0;
  for (const m of u.avOrbs || []) m.t = 0;
  u.avGlow = u.avOrbs = null;
  fx(u.battle, 'av_aura', u.chestPos, 1.5);
}
const PULSE = ['fire', 'water', 'earth', 'air'];
function statePulse(u) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos;
  const kind = PULSE[u.avPulseN++ % 4];
  const g = b.terrain.height(u.pos.x, u.pos.z);
  const at = _p.set(u.pos.x, g + 0.2, u.pos.z);
  const R = w.stateR, D = w.stateDmg;
  const vs = enemiesNear(b, u, at, R);
  fx(b, 'av_aura', c, 1.6);
  if (kind === 'fire') {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.emit('av_fire', at.x + Math.cos(a) * 2.2, g + 0.6, at.z + Math.sin(a) * 2.2, 1.1); }
    for (const v of vs) { const vc = v.chestPos; fx(b, 'av_fire', vc, 1.2); bend(b, v, D, 0, 2, 0, u, 'avb_fire', 0.6); addStatus(b, v, 'burn', 3, 12, u); }
    b.sound('av_fire', c, 1.2, 0.67);
  } else if (kind === 'water') {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.emit('av_water', at.x + Math.cos(a) * 2.5, g + 0.4, at.z + Math.sin(a) * 2.5, 1.2); }
    for (const v of vs) {
      _d.set(v.pos.x - at.x, 0, v.pos.z - at.z).normalize();
      fx(b, 'av_water', v.chestPos, 1);
      bend(b, v, D, _d.x * 8, 2.5, _d.z * 8, u, 'avb_water', 1.0);
    }
    b.sound('av_water', c, 0.9, 1);
    b.sound('whoosh', c, 1.0, 0.5);
  } else if (kind === 'earth') {
    for (const v of vs) {
      if (airborne(b, v)) continue;
      const vg = b.terrain.height(v.pos.x, v.pos.z);
      b.emit('av_earth', v.pos.x, vg + 0.1, v.pos.z, 1.3);
      pillar(b, u, v.pos.x, v.pos.z, 0.9);
      if (bend(b, v, D, 0, w.stateLaunch, 0, u, 'avb_earth', 1.3)) trackFall(b, v, u, 11);
    }
    fx(b, 'av_earth', at, 1.5);
    b.sound('av_earth', c, 1.1, 1);
    b.sound('crunch', c, 0.8, 0.6);
  } else {
    fx(b, 'av_air', at, R * 0.7);
    fx(b, 'av_air', at, R * 0.4);
    gust(b, u, at, R, D, 11, 5);
    b.sound('av_air', c, 1.4, 0.73);
  }
}
function stepOrbs(u) {
  if (!u.avOrbs) return;
  const c = u.chestPos, t = u.battle.time;
  u.avOrbs.forEach((m, i) => {
    const a = t * 4.2 + (i / 4) * Math.PI * 2, R = 1.25 * u.s + 0.25 * Math.sin(t * 3 + i);
    m.pos.set(c.x + Math.cos(a) * R, c.y + Math.sin(t * 5 + i * 1.7) * 0.35, c.z + Math.sin(a) * R);
    m.quat.setFromEuler(_e.set(t * 3 + i, t * 5, 0));
  });
  u.avOrbK = (u.avOrbK || 0) + 1;
  if (u.avOrbK % 3 === 0) {
    const [f, wt, e, ai] = u.avOrbs.map((m) => m.pos);
    u.battle.emit('av_ftrail', f.x, f.y, f.z, 0, 0);
    u.battle.emit('av_wtrail', wt.x, wt.y, wt.z);
    u.battle.emit('av_atrail', ai.x, ai.y, ai.z);
    if (u.avOrbK % 6 === 0) u.battle.emit('dust', e.x, e.y, e.z, 1);
  }
}
const aang = {
  melee: true,
  init(u) { u.avDur = u.attackDur; u.avBlastCd = rand(0.5, 1.5); u.avScootCd = 0; u.avScoot = 0; u.avState = 0; },
  think(u, dt, c) {
    const w = u.def.weapon, b = u.battle, { t, dist, gap, dirx, dirz, spd } = c;
    if (u.avState > 0) { // hover over the fight, close enough for the pulses to reach
      u.expr = EXPR.angry;
      const want = w.stateR * 0.45;
      if (gap > want) u.desired.set(dirx * spd * 0.8, 0, dirz * spd * 0.8);
      else u.desired.set(-dirx * spd * 0.2, 0, -dirz * spd * 0.2);
      return t;
    }
    if (u.avScoot > 0) {
      u.expr = EXPR.happy;
      u.desired.set(dirx * w.scootSpeed, 0, dirz * w.scootSpeed);
      if (gap < 1.8) { endScoot(u); u.avBlastCd = Math.min(u.avBlastCd, 0.1); }
      return t;
    }
    if (!busy(u)) {
      if (u.avScootCd <= 0 && gap > w.scootMin) { startScoot(u); return t; }
      if (u.avBlastCd <= 0 && dist < w.blastRange && gap > 0.8) {
        u.avBlastCd = w.blastCd * rand(0.85, 1.15);
        u.aimAt = t;
        act(u, 'avb_push', 0.55, 'blast', 0.4);
        return t;
      }
    }
    return meleeThink(u, dt, c);
  },
  event(u, t0, t1) {
    if (u.avTag === 'blast' && crossed(t0, t1, 0.55)) aangBlast(u);
    endAct(u, t1);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.avBlastCd -= dt; u.avScootCd -= dt;
    if (u.avScoot > 0) {
      u.avScoot -= dt;
      if (u.stun > 0.3 || u.avScoot <= 0) endScoot(u);
      else {
        hover(u, dt, u.skel.standHeight + 0.45 * u.s, 6, 30);
        const g = b.terrain.height(u.pos.x, u.pos.z);
        u.avBall.pos.set(u.pos.x, g + 0.4 * u.s, u.pos.z);
        u.avBall.quat.setFromEuler(_e.set(b.time * 14, b.time * 6, 0));
        u.avK = (u.avK || 0) + 1;
        if (u.avK % 3 === 0) b.emit('av_atrail', u.pos.x, g + 0.3, u.pos.z);
      }
    }
    if (u.avState > 0) {
      u.avState -= dt;
      if (u.stun > 0.4) u.stun = 0.4;
      hover(u, dt, w.stateAlt, 5, 18);
      u.st.gsFly = true;
      stepOrbs(u);
      u.avK = (u.avK || 0) + 1;
      if (u.avK % 2 === 0) fx(b, 'av_aura', u.chestPos, 1.2);
      u.avPulse -= dt;
      if (u.avPulse <= 0) { u.avPulse = w.statePulse; statePulse(u); }
      if (u.avState <= 0) endState(u);
    }
  },
  hit(u, amount, part, att, kind) {
    const w = u.def.weapon;
    if (u.avState > 0) return amount * w.stateArmor;
    if (!u.avStateDone && u.hp - amount < u.maxHp * w.stateAt && kind !== 'fall') {
      amount = Math.min(amount, Math.max(0, u.hp - u.maxHp * 0.1));
      u.battle.delayed.push([0, () => { if (u.alive && !u.avState) enterState(u); }]);
    }
    return amount;
  },
  die(u) { if (u.avScoot > 0) endScoot(u); if (u.avState > 0) endState(u); },
};

// ------------------------------------------------------------------ Katara
function handR(u, out) { return u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0, out); }
const _pts = Array.from({ length: 24 }, () => new THREE.Vector3());
function whipStep(u, dt) {
  const W = u.avWhip, b = u.battle, w = u.def.weapon;
  W.t += dt;
  const v = W.v;
  const T = W.t / w.whipT; // 0..1: out (0..0.45), lash, back (0.6..1)
  if (T >= 1 || !u.alive || u.stun > 0.3) { endBeamL(W.beam); u.avWhip = null; return; }
  const A = handR(u, _o);
  if (v.alive) W.end.copy(v.chestPos);
  const f = T < 0.45 ? T / 0.45 : T < 0.6 ? 1 : 1 - (T - 0.6) / 0.4;
  const L = A.distanceTo(W.end) * f;
  const n = clamp(Math.ceil(L / 0.32), 2, 23);
  _d.subVectors(W.end, A);
  const side = _v.set(-_d.z, 0, _d.x).normalize();
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * f;
    const wave = Math.sin(s * Math.PI) * (0.9 - f * 0.5) * Math.sin(W.t * 18 + s * 7) * 0.6;
    _pts[i].copy(A).addScaledVector(_d, s).addScaledVector(side, wave);
    _pts[i].y += Math.sin(s * Math.PI) * 0.6 * (1 - f * 0.6);
  }
  curveBeam(b, W.beam, u, _pts.slice(0, n + 1), 'avb_wseg');
  W.k++;
  if (W.k % 3 === 0) { const q = _pts[Math.floor(rand(1, n))]; b.emit('av_wtrail', q.x, q.y, q.z); }
  if (!W.hit && T >= 0.45) {
    W.hit = true;
    const tip = _pts[n];
    fx(b, 'av_water', tip, 0.9);
    b.sound('av_water', tip, 0.9, 1);
    b.sound('heal', tip, 0.4, 1.8);
    for (const o of enemiesNear(b, u, tip, 1.0)) {
      _d.set(o.pos.x - u.pos.x, 0, o.pos.z - u.pos.z).normalize();
      bend(b, o, w.damage, _d.x * w.whipPush, 2, _d.z * w.whipPush, u, 'avb_whip', 0.9);
    }
  }
}
function iceVolley(u) {
  const b = u.battle, w = u.def.weapon;
  const h = handR(u, _o);
  h.y += 0.25 * u.s;
  aimPoint(u, _p, 0.6, 0.5);
  if (!u.aimAt && u.control && !u.control.aimPt) _p.y = h.y + Math.tan(u.control.aimPitch) * 14;
  for (let i = 0; i < w.iceN; i++) {
    launchVel(h, _p, w.iceSpeed, ICICLE.g, false, w.iceSpread, _v);
    const a = (i - (w.iceN - 1) / 2) * w.iceFan, cs = Math.cos(a), sn = Math.sin(a);
    _v.set(_v.x * cs + _v.z * sn, _v.y, -_v.x * sn + _v.z * cs);
    addProjectile(b, 'avb_icicle', _d.copy(h).addScaledVector(_v, 0.02 * i), _v, u, { damage: w.iceDmg, force: 60, life: 3, snd: true });
  }
  fx(b, 'av_ice', h, 0.5);
  b.sound('av_ice', h, 0.5, 1);
  b.sound('whoosh', h, 0.8, 1.6);
}
const ICICLE = arrowProj({
  g: 4, len: 0.55, r: 0.05, life: 3,
  onHit(b, v, pr) { fx(b, 'av_ice', v.chestPos, 0.45); addStatus(b, v, 'slow', pr.owner.def.weapon.iceSlow, 0, pr.owner); },
  ground(b, pr) { fx(b, 'av_ice', pr.pos, 0.4); b.sound('av_ice', pr.pos, 0.3, 1.08); return true; },
});
{ // add a frost trail to the arrow step
  const st = ICICLE.step;
  ICICLE.step = (b, pr, dt) => { pr.k = (pr.k || 0) + 1; if (pr.k % 3 === 0) b.emit('avb_frost', pr.pos.x, pr.pos.y, pr.pos.z); st(b, pr, dt); };
}
function heal(u) {
  const b = u.battle, w = u.def.weapon, p = u.pos;
  const g = b.terrain.height(p.x, p.z);
  b.emit('healring', p.x, g + 0.1, p.z, w.healR);
  fx(b, 'av_water', _p.set(p.x, g + 0.2, p.z), 0.6);
  b.sound('av_heal', p, 0.8, 1);
  for (const o of b.teams[u.team]) {
    if (!o.alive || o.dormant || flatD(o.pos, p) > w.healR || o.hp >= o.maxHp) continue;
    o.hp = Math.min(o.maxHp, o.hp + w.heal * (o === u ? 0.5 : 1));
    const c = o.chestPos;
    b.emit('heal', c.x, c.y, c.z, 6);
    mark(b, o, 'avb_healwater', PART.chest, 1.3);
    for (let i = 0; i < 3; i++) b.emit('av_wtrail', c.x + rand(-0.3, 0.3), c.y + rand(-0.2, 0.4), c.z + rand(-0.3, 0.3));
  }
}
const katara = {
  aim: true,
  init(u) { u.avDur = u.attackDur; u.avWhip = null; u.avIceCd = rand(1, 2); u.avHealCd = 1; u.kiteT = 3; },
  think(u, dt, c) {
    const w = u.def.weapon, b = u.battle, { t, dist, gap, dirx, dirz, spd } = c;
    u.expr = gap < 4 ? EXPR.angry : EXPR.normal;
    // hold her ground at whip range; back off from a rush only for a while
    u.kiteT = Math.min(3, u.kiteT + dt * 0.4);
    if (dist > w.whipRange * 0.9) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (gap < 1.8 && u.kiteT > 0) { u.desired.set(-dirx * spd * 0.6, 0, -dirz * spd * 0.6); u.kiteT -= dt * 2.2; }
    if (!busy(u) && !u.avWhip) {
      const hurt = b.mostHurtAlly(u, w.healR);
      if (u.avHealCd <= 0 && ((hurt && hurt.hp < hurt.maxHp * 0.75) || u.hp < u.maxHp * 0.6)) {
        u.avHealCd = w.healCd * rand(0.9, 1.1);
        act(u, 'heal', 0.8, 'heal');
        return hurt || t;
      }
      if (u.avIceCd <= 0 && dist < w.iceRange && dist > 3) {
        u.avIceCd = w.iceCd * rand(0.85, 1.15);
        u.aimAt = t;
        act(u, 'cast', 0.7, 'ice');
        return t;
      }
      if (u.cooldown <= 0 && dist < w.whipRange) {
        u.aimAt = t;
        act(u, 'avb_whip', 0.6, 'whip', w.cooldown * rand(0.85, 1.15));
        return t;
      }
    }
    if (u.st.attack) u.desired.multiplyScalar(0.2);
    return t;
  },
  event(u, t0, t1) {
    const b = u.battle;
    if (u.avTag === 'whip' && crossed(t0, t1, 0.4)) {
      const v = u.aimAt && u.aimAt.alive ? u.aimAt : null;
      if (v || u.control) {
        const end = v ? v.chestPos.clone() : aimPoint(u, new THREE.Vector3(), 0, 0);
        u.avWhip = { t: 0, v: v || { alive: false }, end, beam: {}, hit: false, k: 0 };
        b.sound('whoosh', u.pos, 0.8, 1.3);
      }
    }
    if (u.avTag === 'ice' && crossed(t0, t1, 0.62)) iceVolley(u);
    if (u.avTag === 'heal' && crossed(t0, t1, 0.5)) heal(u);
    endAct(u, t1);
  },
  step(u, dt) {
    u.avIceCd -= dt; u.avHealCd -= dt;
    if (u.avWhip) whipStep(u, dt);
  },
  die(u) { if (u.avWhip) { endBeamL(u.avWhip.beam); u.avWhip = null; } },
};

// ------------------------------------------------------------------ Sokka
// The boomerang: curves out past the target, turns and homes back to Sokka's hand.
const BOOM = {
  g: 0, len: 0, r: 0.22, life: 7,
  step(b, pr, dt) {
    const o = pr.owner;
    pr.k = (pr.k || 0) + 1;
    if (pr.k % 9 === 0) b.sound('av_boomerang', pr.pos, 0.35, 1);
    if (pr.k % 3 === 0) b.emit('av_atrail', pr.pos.x, pr.pos.y, pr.pos.z);
    const gy = b.terrain.height(pr.pos.x, pr.pos.z);
    if (pr.drop) { pr.vel.y -= 9.81 * dt; return; }
    if (!o.alive) { pr.drop = true; return; }
    const sp = pr.speed;
    if (!pr.back) {
      // curve: turn the velocity a little to one side each step
      const a = pr.curl * dt, cs = Math.cos(a), sn = Math.sin(a);
      pr.vel.set(pr.vel.x * cs + pr.vel.z * sn, pr.vel.y, -pr.vel.x * sn + pr.vel.z * cs);
      pr.go -= sp * dt;
      if (pr.go <= 0) { pr.back = true; pr.hits.clear(); }
    } else {
      const h = handPos(o, _o);
      _d.subVectors(h, pr.pos);
      const d = _d.length();
      if (d < 0.7 || pr.life < 0.3) { // caught
        pr.life = -1;
        o.avBoomOut = false;
        b.sound('click', h, 0.6, 0.8);
        return;
      }
      _d.multiplyScalar(sp / d);
      pr.vel.lerp(_d, clamp(dt * 5, 0, 1));
    }
    if (pr.pos.y < gy + 0.45) { pr.pos.y = gy + 0.45; pr.vel.y = Math.max(0, pr.vel.y); }
  },
  hit(b, pr, v) {
    if (pr.drop) return false;
    _d.copy(pr.vel).normalize();
    const hp = v.headPos;
    b.emit('spark', hp.x, hp.y, hp.z, 4);
    b.sound('thud', hp, 0.9, 1.4);
    bend(b, v, pr.damage, _d.x * 3, 1.5, _d.z * 3, pr.owner, 'avb_boomerang', pr.owner.def.weapon.boomStun);
    return false; // keeps flying
  },
  ground(b, pr) { if (pr.drop) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 2); pr.owner.avBoomOut = false; return true; } return false; },
};
function throwBoom(u) {
  const b = u.battle, w = u.def.weapon;
  const h = u.rag.worldPoint(PART.farmL, 0, -u.skel.handOffset, 0, _o);
  aimPoint(u, _p, 0.5, 0.6);
  _p.y = Math.max(_p.y, b.terrain.height(_p.x, _p.z) + 0.9);
  const d = Math.max(3, flatD(h, _p));
  const side = Math.random() < 0.5 ? -1 : 1;
  // aim off to one side so that the curl brings it round onto the target
  const turn = w.boomCurl * side, aim = Math.atan2(_p.x - h.x, _p.z - h.z) - turn * (d / w.boomSpeed) * 0.5;
  const dy = (_p.y - h.y) / (d / w.boomSpeed);
  _v.set(Math.sin(aim) * w.boomSpeed, dy, Math.cos(aim) * w.boomSpeed);
  const pr = addProjectile(b, 'avb_boomerang', h, _v, u, { damage: w.boomDmg, life: 7, speed: w.boomSpeed, curl: turn, go: d + 2, back: false });
  pr.spin.set(0, 24 * side, 0);
  u.avBoomOut = true;
  b.sound('throw', h, 0.8, 1.2);
}
const sokka = {
  melee: true,
  init(u) { u.avDur = u.attackDur; u.avBoomCd = rand(0.3, 1.2); u.avBoomOut = false; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, gap } = c;
    if (!busy(u) && !u.avBoomOut && u.avBoomCd <= 0 && dist < w.boomRange && gap > w.boomMin) {
      u.avBoomCd = w.boomCd * rand(0.85, 1.15);
      u.aimAt = t;
      act(u, 'avb_throwL', 0.6, 'boom', 0.3);
      return t;
    }
    return meleeThink(u, dt, c);
  },
  event(u, t0, t1) {
    if (u.avTag === 'boom' && crossed(t0, t1, 0.62)) throwBoom(u);
    endAct(u, t1);
  },
  step(u, dt) { u.avBoomCd -= dt; },
};

// ------------------------------------------------------------------ Toph
// A rock pillar erupting at (x, z): rises fast, stands a moment, sinks back.
const PILLARS = new WeakMap();
function pillar(b, u, x, z, k = 1) {
  let list = PILLARS.get(b);
  if (!list) PILLARS.set(b, (list = []));
  const g = b.terrain.height(x, z);
  const m = liveMark(b, k < 1 ? 'avb_pillar_s' : 'avb_pillar', _p.set(x, g - 0.3, z), 3, rand(0, 6.28));
  list.push({ m, x, z, g, t: 0, h: 1.4 * k });
  b.emit('av_earth', x, g + 0.2, z, 1.2 * k);
  b.sound('av_earth', m.pos, 0.9 * k, 1.43);
}
function stepPillars(b, dt) {
  const list = PILLARS.get(b);
  if (!list) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const P = list[i];
    P.t += dt;
    const f = P.t < 0.15 ? P.t / 0.15 : P.t < 1.6 ? 1 : Math.max(0, 1 - (P.t - 1.6) / 0.6);
    P.m.pos.y = P.g - 0.3 + (P.h + 0.3) * f;
    if (P.t > 0.15 && P.t < 0.17) b.emit('dust', P.x, P.g, P.z, 3);
    if (P.t >= 2.2) { P.m.t = 0; list.splice(i, 1); }
  }
}
function tophPillar(u, v) {
  const b = u.battle, w = u.def.weapon;
  const x = v.pos.x, z = v.pos.z;
  // the ground ripples from her feet to the target
  const n = Math.min(6, Math.ceil(flatD(u.pos, v.pos) / 1.6));
  for (let i = 1; i < n; i++) {
    const s = i / n, px = u.pos.x + (x - u.pos.x) * s, pz = u.pos.z + (z - u.pos.z) * s;
    b.delayed.push([s * 0.2, () => b.emit('dust', px, b.terrain.height(px, pz), pz, 2)]);
  }
  b.delayed.push([0.22, () => {
    if (!u.alive && !u.def) return;
    pillar(b, u, x, z, 1);
    const at = _p.set(x, b.terrain.height(x, z), z);
    for (const o of enemiesNear(b, u, at, w.pillarR)) {
      if (airborne(b, o)) continue;
      const k = clamp(160 / o.M, 0.15, 1);
      _d.set(o.pos.x - x, 0, o.pos.z - z).normalize();
      o.hit(w.pillarDmg, PART.pelvis, 0, 0, 0, u.alive ? u : null, 'avb_pillar');
      pushUnit(o, o.M * _d.x * 1.5 * k, o.M * w.pillarLaunch * k, o.M * _d.z * 1.5 * k);
      o.stun = Math.max(o.stun, 1.2 * (o.def.stagger ?? 1));
      trackFall(b, o, u.alive ? u : null, 12);
    }
  }]);
}
const BOULDER = {
  g: 9.81, len: 0, r: 0.32, life: 5,
  step(b, pr) { pr.k = (pr.k || 0) + 1; if (pr.k % 3 === 0) b.emit('avb_rtrail', pr.pos.x, pr.pos.y, pr.pos.z, 1); },
  hit(b, pr, v) {
    _d.copy(pr.vel).normalize();
    fx(b, 'av_earth', pr.pos, 1.0);
    b.sound('av_rock', pr.pos, 1.0, 1);
    bend(b, v, pr.damage, _d.x * pr.push, 3, _d.z * pr.push, pr.owner, 'avb_boulder', 1.2);
    for (const o of enemiesNear(b, pr.owner, pr.pos, 1.3)) if (o !== v) bend(b, o, pr.damage * 0.4, _d.x * 4, 2, _d.z * 4, pr.owner, 'avb_boulder', 0.6);
    return true;
  },
  ground(b, pr) {
    fx(b, 'av_earth', pr.pos, 1.0);
    b.sound('thump', pr.pos, 0.9, 0.7);
    for (const o of enemiesNear(b, pr.owner, pr.pos, 1.5)) {
      _d.set(o.pos.x - pr.pos.x, 0, o.pos.z - pr.pos.z).normalize();
      bend(b, o, pr.damage * 0.5, _d.x * 5, 2.5, _d.z * 5, pr.owner, 'avb_boulder', 0.7);
    }
    return true;
  },
};
function throwBoulder(u, k = 1) {
  const b = u.battle, w = u.def.weapon;
  const h = _o.copy(u.headPos);
  h.y += 0.35 * u.s;
  aimPoint(u, _p, 0.6, 0.6);
  if (!u.aimAt && u.control && !u.control.aimPt) _p.y = h.y + Math.tan(u.control.aimPitch) * 14;
  launchVel(h, _p, w.rockSpeed, BOULDER.g, false, 0.04, _v);
  addProjectile(b, 'avb_boulder', h, _v, u, { damage: w.rockDmg * k, force: 0, push: w.rockPush, life: 5 });
  b.sound('throw', h, 0.9, 0.6);
}
const toph = {
  melee: true, aim: true,
  init(u) { u.avDur = u.attackDur; u.avPillarCd = rand(0.5, 1.5); u.avRockCd = rand(1.5, 2.5); u.avArmor = 0; u.avArmorDone = false; },
  think(u, dt, c) {
    const w = u.def.weapon, b = u.battle, { t, dist, gap } = c;
    if (!busy(u)) {
      if (u.avPillarCd <= 0 && gap > 1.2) {
        const v = !airborne(b, t) && dist < w.pillarRange ? t : groundEnemy(b, u, w.pillarRange);
        if (v) {
          u.avPillarCd = w.pillarCd * rand(0.85, 1.15);
          u.aimAt = v; u.avPillarV = v;
          act(u, 'avb_stomp', 0.6, 'pillar', 0.3);
          return v;
        }
      }
      if (u.avRockCd <= 0 && dist < w.rockRange && dist > 4) {
        u.avRockCd = w.rockCd * rand(0.85, 1.15);
        u.aimAt = t;
        act(u, 'avb_heave', 0.8, 'rock', 0.3);
        return t;
      }
    }
    return meleeThink(u, dt, c);
  },
  event(u, t0, t1) {
    const b = u.battle;
    if (u.avTag === 'pillar' && crossed(t0, t1, 0.55)) {
      const g = b.terrain.height(u.pos.x, u.pos.z);
      b.emit('av_earth', u.pos.x, g + 0.1, u.pos.z, 0.5);
      b.sound('thump', u.pos, 1.0, 0.6);
      const v = u.avPillarV;
      if (v && v.alive) tophPillar(u, v);
      else if (u.control && u.control.aimPt) tophPillar(u, { pos: u.control.aimPt });
    }
    if (u.avTag === 'rock') {
      if (crossed(t0, t1, 0.28)) {
        const fwd = _p.set(u.pos.x + Math.sin(u.heading) * 0.7, 0, u.pos.z + Math.cos(u.heading) * 0.7);
        fwd.y = b.terrain.height(fwd.x, fwd.z) + 0.1;
        fx(b, 'av_earth', fwd, 0.8);
        b.sound('debris', fwd, 0.7, 1.2);
        u.avRock = liveMark(b, 'avb_boulder', fwd, 0.6);
      }
      if (u.avRock && u.avRock.t > 0) { // the boulder rises with her arms
        const k = clamp((t1 - 0.28) / 0.42, 0, 1);
        const g = b.terrain.height(u.pos.x, u.pos.z);
        u.avRock.pos.set(u.pos.x + Math.sin(u.heading) * 0.6 * (1 - k), g + 0.2 + (u.headPos.y + 0.35 * u.s - g - 0.2) * k, u.pos.z + Math.cos(u.heading) * 0.6 * (1 - k));
      }
      if (crossed(t0, t1, 0.7)) { if (u.avRock) { u.avRock.t = 0; u.avRock = null; } throwBoulder(u); }
    }
    endAct(u, t1);
  },
  step(u, dt) {
    const w = u.def.weapon;
    u.avPillarCd -= dt; u.avRockCd -= dt;
    if (u.avArmor > 0) {
      u.avArmor -= dt;
      if (u.avArmor <= 0) { for (const m of u.avArmorM || []) m.t = 0; fx(u.battle, 'av_earth', u.chestPos, 0.8); }
    } else if (!u.avArmorDone && u.hp < u.maxHp * w.armorAt) {
      u.avArmorDone = true;
      u.avArmor = w.armorT;
      const b = u.battle;
      u.avArmorM = [mark(b, u, 'avb_rockarmor', PART.chest, w.armorT), mark(b, u, 'avb_rockhelm', PART.head, w.armorT)];
      fx(b, 'av_earth', u.chestPos, 1.2);
      b.sound('av_earth', u.chestPos, 1.0, 1.14);
      b.sound('crunch', u.chestPos, 0.7, 0.7);
    }
  },
  hit(u, amount) { return u.avArmor > 0 ? amount * u.def.weapon.armorK : amount; },
  die(u) { if (u.avRock) { u.avRock.t = 0; u.avRock = null; } for (const m of u.avArmorM || []) m.t = 0; },
};

// ------------------------------------------------------------------ Earthbender
const DISC = {
  g: 3.5, len: 0, r: 0.22, life: 4,
  step(b, pr) { pr.k = (pr.k || 0) + 1; if (pr.k % 3 === 0) b.emit('avb_rtrail', pr.pos.x, pr.pos.y, pr.pos.z, 0.6); },
  hit(b, pr, v) {
    _d.copy(pr.vel).normalize();
    fx(b, 'av_earth', pr.pos, 0.5);
    b.sound('av_rock', pr.pos, 0.8, 1.37);
    bend(b, v, pr.damage, _d.x * pr.push, 1.5, _d.z * pr.push, pr.owner, 'avb_disc', 0.7);
    return true;
  },
  ground(b, pr) { fx(b, 'av_earth', pr.pos, 0.4); b.sound('thump', pr.pos, 0.6, 1.1); return true; },
};
const ebender = {
  aim: true,
  init(u) { u.attackDur = u.def.weapon.windup; },
  think: rangedThink,
  event(u, t0, t1) {
    const b = u.battle, w = u.def.weapon;
    if (crossed(t0, t1, 0.3)) { // stamp: a disc of rock pops out of the ground in front
      const fp = _p.set(u.pos.x + Math.sin(u.heading) * 0.6, 0, u.pos.z + Math.cos(u.heading) * 0.6);
      fp.y = b.terrain.height(fp.x, fp.z) + 0.1;
      b.emit('av_earth', fp.x, fp.y, fp.z, 0.45);
      b.sound('thump', fp, 0.6, 1.2);
    }
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    const h = _o.copy(u.chestPos);
    h.x += Math.sin(u.heading) * 0.5; h.z += Math.cos(u.heading) * 0.5;
    aimPoint(u, _p, 0.6, 0.6);
    if (!u.aimAt && u.control && !u.control.aimPt) _p.y = h.y + Math.tan(u.control.aimPitch) * 14;
    launchVel(h, _p, w.speed, DISC.g, false, w.spread, _v);
    const pr = addProjectile(b, 'avb_disc', h, _v, u, { push: w.push, life: 4 });
    pr.spin.set(rand(-2, 2), rand(-14, 14), rand(-2, 2));
    b.sound('throw', h, 0.7, 0.8);
  },
};

// ------------------------------------------------------------------ Kyoshi Warrior
const kyoshi = {
  melee: true,
  init(u) { u.avDodgeCd = 0; u.avHits = new Set(); },
  think: meleeThink,
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.avDodgeCd -= dt;
    if (!u.st.attack) { if (u.avHits.size) u.avHits.clear(); return; }
    for (const v of u.hitSet) { // fan strikes knock back with a gust
      if (u.avHits.has(v) || !v.rag || !v.def) continue;
      u.avHits.add(v);
      _d.set(v.pos.x - u.pos.x, 0, v.pos.z - u.pos.z).normalize();
      const k = clamp(120 / v.M, 0.2, 1);
      pushUnit(v, v.M * _d.x * w.fanPush * k, v.M * 1.5 * k, v.M * _d.z * w.fanPush * k);
      const c = v.chestPos;
      for (let i = 0; i < 3; i++) b.emit('av_atrail', c.x - _d.x * 0.3 * i, c.y, c.z - _d.z * 0.3 * i);
    }
  },
  // the fan turns a blow aside, and she sidesteps
  parry(u, att, kind) {
    const b = u.battle, w = u.def.weapon;
    if (kind !== 'melee' || u.avDodgeCd > 0 || u.isDown() || u.stun > 0 || Math.random() > w.dodge) return false;
    u.avDodgeCd = w.dodgeCd;
    u.parriedAt = b.time;
    const sd = Math.random() < 0.5 ? -1 : 1, hx = Math.sin(u.heading), hz = Math.cos(u.heading);
    u.rag.impulseAll((hz * sd - hx * 0.6) * u.M * 3, u.M * 1.5, (-hx * sd - hz * 0.6) * u.M * 3);
    const c = u.rag.pos[PART.farmL];
    b.emit('spark', c.x, c.y, c.z, 5);
    b.emit('av_atrail', c.x, c.y, c.z);
    b.sound('block', c, 0.8, 1.4);
    return true;
  },
  hit(u, amount) { return u.parriedAt === u.battle.time ? amount * 0.15 : amount; },
};

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'av_aang', name: 'Aang', faction: FAC, cost: 1450, hp: 520, speed: 6.0,
    build: { scale: 0.84, girth: 0.9, head: 1.12, legs: 0.98 },
    weapon: { line: 'Airbender · air blasts, air scooter, glider staff · Avatar State once', kind: 'av_aang', style: 'sword', anim: 'overhead', item: 'av_glider', damage: 34, reach: 1.5, cooldown: 0.85, force: 320,
      blastRange: 10, blastCd: 3.2, blastSpeed: 20, blastR: 2.6, blastDmg: 26, blastOut: 9, blastUp: 5,
      scootMin: 10, scootCd: 8, scootT: 1.8, scootSpeed: 13,
      stateAt: 0.35, stateT: 8, statePulse: 0.85, stateR: 6.5, stateDmg: 36, stateLaunch: 9, stateAlt: 2.8, stateArmor: 0.25, stateHeal: 0.25 },
    look: { skin: '#f2c8a0', hat: 'avb_aang', top: 'avb_aang', legs: '#e8a23a', accent: '#a07a50' },
    personality: { aggro: 0.9, bravery: 0, voice: 1.45, chatter: 0.8, cry: 'yip', idle: 'bounce' },
    stagger: 0.5,
    desc: 'The last airbender. Twelve years old, a hundred and twelve years late, and very hard to pin down.',
  },
  {
    id: 'av_katara', name: 'Katara', faction: FAC, cost: 500, hp: 260, speed: 4.9, face: 2,
    build: { scale: 0.93, girth: 0.9, head: 1.05 },
    weapon: { line: 'Waterbender · water whip, ice spikes (slow), heals allies', kind: 'av_katara', style: 'none', anim: 'avb_whip', item: 'none', damage: 26, cooldown: 1.4, force: 0,
      whipRange: 7.5, whipT: 0.55, whipPush: 4, iceRange: 16, iceCd: 5.5, iceN: 5, iceFan: 0.09, iceSpeed: 24, iceSpread: 0.03, iceDmg: 14, iceSlow: 1.5,
      heal: 40, healR: 6, healCd: 5.5 },
    look: { skin: '#c8906a', hat: 'avb_katara', top: 'avb_katara', legs: '#24304a', accent: '#6a4a2e' },
    personality: { aggro: 0.6, bravery: 0, voice: 1.35, chatter: 0.7, cry: 'hey', idle: 'shift' },
    desc: 'A master waterbender. Whips, ice, and the only healer for a thousand miles.',
  },
  {
    id: 'av_sokka', name: 'Sokka', faction: FAC, cost: 140, hp: 150, speed: 4.8,
    build: { scale: 0.97, girth: 0.92 },
    weapon: { line: 'No bending · a boomerang that comes back, then the space sword', kind: 'av_sokka', style: 'sword', anim: 'overhead', item: 'av_sword', damage: 30, reach: 1.3, cooldown: 0.95, force: 220,
      boomRange: 17, boomMin: 3, boomCd: 4.5, boomSpeed: 16, boomCurl: 0.9, boomDmg: 16, boomStun: 0.8 },
    look: { skin: '#c8906a', hat: 'avb_sokka', top: 'avb_sokka', legs: '#3a4a6a', accent: '#6a4a2e' },
    personality: { aggro: 0.9, bravery: 0.15, voice: 1.1, chatter: 1, cry: 'charge', idle: 'shift' },
    desc: 'Meat and sarcasm guy. Boomerang always comes back.',
  },
  {
    id: 'av_toph', name: 'Toph', faction: FAC, cost: 580, hp: 380, speed: 4.6, face: 2,
    build: { scale: 0.8, girth: 0.95, head: 1.12, armThick: 1.1 },
    weapon: { line: 'Earthbender · rock pillars launch enemies, boulders, rock fists · earth armour', kind: 'av_toph', style: 'dual', anim: 'dual', item: 'av_fist', damage: 30, reach: 1.0, cooldown: 0.8, force: 380,
      pillarRange: 14, pillarCd: 4, pillarR: 1.5, pillarDmg: 34, pillarLaunch: 9,
      rockRange: 16, rockCd: 3.6, rockSpeed: 17, rockDmg: 48, rockPush: 7,
      armorAt: 0.5, armorT: 8, armorK: 0.45 },
    look: { skin: '#f2d2b8', hat: 'avb_toph', top: 'avb_toph', legs: '#3d6a30', accent: '#f2d2b8' },
    personality: { aggro: 1, bravery: 0, voice: 1.4, chatter: 0.8, cry: 'hey', idle: 'thump' },
    stagger: 0.4,
    desc: 'The greatest earthbender in the world. Blind, barefoot, and she can see you just fine.',
  },
  {
    id: 'av_earthbender', name: 'Earthbender', faction: FAC, cost: 170, hp: 110, speed: 4.2,
    build: { scale: 1.0 },
    weapon: { line: 'Ranged · hurls rock discs pulled from the ground', kind: 'av_ebender', style: 'none', anim: 'avb_push', item: 'none', proj: 'avb_disc', speed: 21, range: 22, minRange: 5, cooldown: 2.6, damage: 34, force: 0, push: 4.5, spread: 0.04, releaseAt: 0.6, windup: 0.9 },
    look: { skin: '#e8b48a', hat: 'avb_ekhat', top: 'avb_ek', legs: '#5a4a32', accent: '#3a2a1e' },
    personality: { aggro: 0.4, bravery: 0.2, voice: 0.95, chatter: 0.4, cry: 'hey', idle: 'brace' },
    desc: 'An Earth Kingdom soldier. Stamps, punches, and a rock flies at you.',
  },
  {
    id: 'av_kyoshi', name: 'Kyoshi Warrior', faction: FAC, cost: 95, hp: 190, speed: 5.5, face: 2,
    build: { scale: 0.97, girth: 0.92, legs: 1.04 },
    weapon: { line: 'Melee · twin war fans knock back · turns blows aside', kind: 'av_kyoshi', style: 'dual', anim: 'dual', item: 'av_fan', damage: 26, reach: 1.1, cooldown: 0.7, force: 220, fanPush: 3.5, dodge: 0.35, dodgeCd: 1.8 },
    look: { skin: '#f4f1ea', hat: 'avb_kyoshi', top: 'avb_kyoshi', legs: '#2e4a26', accent: '#1e1e1e' },
    personality: { aggro: 1, bravery: 0, voice: 1.3, chatter: 0.5, cry: 'hey', idle: 'shift' },
    stagger: 0.7,
    desc: 'Defender of Kyoshi Island. Fans, face paint and footwork.',
  },
];

// ------------------------------------------------------------------ visuals
const RHEAD = {}, RCHEST = {};
for (const d of units) { const sk = makeSkeleton(d.build); RHEAD[d.id] = sk.rHead; RCHEST[d.id] = sk.rChest; }
const ARROW = '#3a8ae0';

// a group sitting on a sphere of radius r at polar angle phi (0 = top, +PI/2 = the face)
// and turned about the vertical by yaw; its local XY plane lies on the surface, +Y up
// the head, +Z outward
function onSphere(g, r, phi, yaw = 0, out = 0) {
  const s = new THREE.Group();
  const n = new THREE.Vector3(Math.sin(phi) * Math.sin(yaw), Math.cos(phi), Math.sin(phi) * Math.cos(yaw));
  const up = new THREE.Vector3(-Math.cos(phi) * Math.sin(yaw), Math.sin(phi), -Math.cos(phi) * Math.cos(yaw)); // toward the top
  const x = new THREE.Vector3().crossVectors(up, n);
  s.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, n));
  s.position.copy(n).multiplyScalar(r + out);
  g.add(s);
  return s;
}
// a flat arrowhead (triangle pointing down local -Y), w wide and h tall, extruded thin
const triGeo = (H, w, h, t) => H.geo(`avb-tri${w.toFixed(3)}:${h.toFixed(3)}:${t.toFixed(3)}`, () => {
  const s = new H.THREE.Shape();
  s.moveTo(-w / 2, h / 2); s.lineTo(w / 2, h / 2); s.lineTo(0, -h / 2); s.lineTo(-w / 2, h / 2);
  const g = new H.THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
});
// Aang's arrow: a stripe from the back of the neck over the top of the head, ending in
// an arrowhead on the forehead
function headArrow(H, g, r, m, out = 0.01) {
  const { mesh, box } = H;
  const p0 = -2.1, p1 = 0.86, n = 14;
  for (let i = 0; i < n; i++) {
    const phi = p0 + ((i + 0.5) / n) * (p1 - p0);
    const s = onSphere(g, r, phi, 0, r * out);
    mesh(box(r * 0.2, r * ((p1 - p0) / n) * 1.12, r * 0.05), m, 0, 0, 0, s);
  }
  const tip = onSphere(g, r, 1.02, 0, r * (out + 0.005));
  mesh(triGeo(H, r * 0.46, r * 0.36, r * 0.05), m, 0, 0, 0, tip);
}
function handArrow(H, g, sp, m) { // on the back of a forearm and hand: a stripe and a point
  const { mesh, box } = H;
  mesh(box(sp.r * 0.45, sp.hh * 1.6, sp.r * 0.15), m, 0, -sp.hh * 0.25, -sp.r * 1.12, g);
  const t = mesh(triGeo(H, sp.r * 1.1, sp.r * 0.9, sp.r * 0.15), m, 0, -sp.hh - sp.r * 0.5, -sp.r * 1.5, g);
  t.rotation.y = Math.PI;
}
function hairCap(H, g, r, m, k = 1.07, frac = 0.36, tilt = -0.35) {
  const c = H.mesh(dome(H, r * k, frac), m, 0, r * 0.04, -r * 0.05, g);
  c.rotation.x = tilt;
  return c;
}
function lock(H, g, r, m, x, y, z, dir, len, thick = 0.18) {
  const d = new THREE.Vector3(...dir).normalize();
  const c = H.mesh(H.cone(r * thick, r * len, 5), m, x * r, y * r, z * r, g);
  c.quaternion.setFromUnitVectors(UPY, d);
  c.position.addScaledVector(d, r * len * 0.4);
  return c;
}
const sleeves = (H, skel, parts, m, k = 1.15, cuff = null, hands = null) => {
  for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) {
    const sp = skel.parts[p], fore = p === PART.farmL || p === PART.farmR;
    H.mesh(H.capsule(sp.r * k, sp.hh * 2 * (fore ? 0.85 : 1)), m, 0, fore ? sp.hh * 0.15 : 0, 0, parts[p]);
    if (fore) H.mesh(H.cyl(sp.r * 1.3, sp.r * 1.3, sp.r * 0.7, 10), cuff || m, 0, -sp.hh * 0.62, 0, parts[p]);
    if (fore && hands) H.mesh(H.sphere(sp.r * 1.55, 12, 10), hands, 0, -sp.hh - sp.r * 0.25, 0, parts[p]).scale.set(1, 1.05, 1.1);
  }
};
const legs = (H, skel, parts, m, k = 1.1, which = [PART.thighL, PART.thighR, PART.shinL, PART.shinR]) => {
  for (const p of which) { const sp = skel.parts[p]; H.mesh(H.capsule(sp.r * k, sp.hh * 2), m, 0, 0, 0, parts[p]); }
};
// a skirt / tunic hem hanging from the pelvis
function skirt(H, pel, P, m, top, bot, len, y = -0.3) {
  const o = H.mesh(H.cyl(pel.r * top, pel.r * bot, pel.r * len, 16), m, 0, pel.r * (y - len / 2 + 0.6), 0, P);
  o.scale.set(1, 1, 0.92);
  return o;
}
const belt = (H, ch, C, m, k = 1.13, h = 0.2) => H.mesh(H.cyl(ch.r * k, ch.r * (k + 0.02), ch.r * h, 16), m, 0, -ch.hh - ch.r * 0.38, 0, C);
function fur(H, g, R, y, m, tube = 0.16, rot = Math.PI / 2) { const t = H.mesh(torus(H, R, R * tube, Math.PI * 2, 18), m, 0, y, 0, g); t.rotation.x = rot; return t; }

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, capsule } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'avb_aang': { // bald, with the blue arrow
      headArrow(H, g, r, mat(ARROW, { spec: 0.15 }));
      for (const sd of [-1, 1]) mesh(sphere(r * 0.2, 10, 8), mat('#f2c8a0', { spec: 0.18 }), sd * r * 0.98, 0, 0, g).scale.set(0.45, 1, 0.75); // ears
      return true;
    }
    case 'avb_katara': { // brown hair: loopies at the front, swept back, a long braid
      const hair = mat('#3a2216', { spec: 0.15 });
      hairCap(H, g, r, hair, 1.07, 0.42, -0.3);
      const back = mesh(sphere(r * 1.02, 16, 10), hair, 0, r * 0.08, -r * 0.2, g); back.scale.set(1.02, 0.95, 0.85);
      for (let i = 0; i < 7; i++) mesh(sphere(r * (0.22 - i * 0.012), 8, 6), hair, 0, -r * (0.55 + i * 0.3), -r * (0.95 + i * 0.02), g); // braid
      mesh(cyl(r * 0.12, r * 0.12, r * 0.12, 8), mat('#3a8ae0'), 0, -r * 2.6, -r * 1.06, g); // its blue bead
      for (const sd of [-1, 1]) { // the hair loopies, hanging by the cheeks
        const lp = mesh(torus(H, r * 0.2, r * 0.07, Math.PI * 2, 12), hair, sd * r * 0.98, -r * 0.35, r * 0.32, g);
        lp.rotation.y = sd * 1.25;
        mesh(sphere(r * 0.08, 6, 5), mat('#5aa0e8'), sd * r * 0.97, -r * 0.12, r * 0.36, g); // beads at the top
      }
      for (const sd of [-1, 1]) lock(H, g, r, hair, sd * 0.3, 0.8, 0.5, [sd * 0.6, -0.4, 0.7], 0.4, 0.2); // parted at the front
      mesh(sphere(r * 0.28, 10, 8), hair, 0, r * 0.4, -r * 0.92, g).scale.set(1.2, 0.8, 0.7); // the tie at the back
      return true;
    }
    case 'avb_sokka': { // shaved sides and the wolf tail
      const hair = mat('#1e140e', { spec: 0.15 }), stub = mat('#4a3426', { spec: 0.05 });
      hairCap(H, g, r, stub, 1.015, 0.5, -0.15); // the shaved sides
      const top = mesh(sphere(r * 0.66, 12, 8), hair, 0, r * 0.6, -r * 0.2, g); top.scale.set(0.62, 0.6, 1.3); // strip of hair on top
      mesh(sphere(r * 0.24, 8, 6), hair, 0, r * 0.72, -r * 0.82, g);
      const tail = mesh(cone(r * 0.2, r * 0.75, 6), hair, 0, r * 0.95, -r * 1.12, g); tail.rotation.x = -2.0; // the wolf tail, sticking up and back
      mesh(cyl(r * 0.15, r * 0.15, r * 0.1, 8), tc, 0, r * 0.82, -r * 0.92, g).rotation.x = 0.9; // tie
      for (const sd of [-1, 1]) mesh(sphere(r * 0.18, 8, 6), mat('#c8906a'), sd * r * 0.98, 0, 0, g).scale.set(0.45, 1, 0.75);
      return true;
    }
    case 'avb_toph': { // black hair in a bun, a green-yellow headband with pom-poms, bangs over the eyes
      const hair = mat('#121216', { spec: 0.25 }), band = mat('#c8d860', { spec: 0.15 });
      hairCap(H, g, r, hair, 1.08, 0.45, -0.15);
      const back = mesh(sphere(r * 1.04, 16, 10), hair, 0, r * 0.05, -r * 0.2, g); back.scale.set(1.04, 0.95, 0.85);
      mesh(sphere(r * 0.45, 12, 10), hair, 0, r * 0.72, -r * 0.62, g).scale.set(1.15, 0.85, 0.9); // the bun
      headBand(H, r, 0.52, 0.12, band, g, 0.1);
      for (const sd of [-1, 1]) mesh(sphere(r * 0.17, 8, 6), band, sd * r * 0.78, r * 0.62, -r * 0.35, g); // pom-poms
      mesh(sphere(r * 0.1, 6, 5), tc, 0, r * 0.98, -r * 0.55, g); // team pin in the bun
      for (let i = -3; i <= 3; i++) lock(H, g, r, hair, i * 0.17, 0.72, 0.66, [i * 0.15, -1, 0.5], 0.62, 0.16); // bangs over her eyes
      return true;
    }
    case 'avb_ekhat': { // the Earth Kingdom soldier's round hat: a low dome with a wide brim
      const grn = mat('#4a6a34', { spec: 0.15 }), dk = mat('#2e4422', { spec: 0.1 }), gold = mat('#c8a040', { spec: 0.6 });
      hairCap(H, g, r, mat('#2a1a10'), 1.04, 0.34, -0.3);
      const brim = mesh(cyl(r * 1.55, r * 1.62, r * 0.08, 20), grn, 0, r * 0.62, 0, g); brim.rotation.x = -0.08;
      mesh(dome(H, r * 0.98, 0.5, 18), grn, 0, r * 0.62, 0, g).scale.set(1, 0.62, 1);
      mesh(cyl(r * 0.99, r * 1.0, r * 0.14, 18), dk, 0, r * 0.7, 0, g);
      mesh(cyl(r * 0.18, r * 0.22, r * 0.12, 8), gold, 0, r * 1.25, 0, g); // the knob
      mesh(box(r * 0.25, r * 0.1, r * 0.06), tc, 0, r * 0.7, r * 1.0, g); // team badge
      return true;
    }
    case 'avb_kyoshi': { // black hair, the gold headpiece, red eyeshadow and lips on white paint
      const hair = mat('#16141a', { spec: 0.2 }), gold = mat('#d8b04a', { spec: 0.9 }), red = mat('#c8202a', { spec: 0.1 });
      hairCap(H, g, r, hair, 1.07, 0.44, -0.2);
      const back = mesh(sphere(r * 1.03, 16, 10), hair, 0, r * 0.02, -r * 0.22, g); back.scale.set(1.03, 0.95, 0.82);
      headBand(H, r, 0.5, 0.2, gold, g, 0.08); // the crown band
      const front = mesh(box(r * 0.7, r * 0.5, r * 0.06), gold, 0, r * 0.9, r * 0.72, g); front.rotation.x = -0.5; // its tall front plate
      mesh(sphere(r * 0.1, 8, 6), red, 0, r * 0.95, r * 0.8, g);
      for (const sd of [-1, 1]) { // side wings and tassels
        const wg = mesh(box(r * 0.08, r * 0.45, r * 0.4), gold, sd * r * 1.0, r * 0.62, r * 0.1, g); wg.rotation.z = -sd * 0.3;
        mesh(capsule(r * 0.04, r * 0.5), gold, sd * r * 1.05, r * 0.1, r * 0.1, g);
        // red eyeshadow swept out from each eye, and blush
        const sh = mesh(sphere(r * 0.2, 10, 6), red, sd * r * 0.42, r * 0.32, r * 0.86, g); sh.scale.set(1.4, 0.5, 0.35); sh.rotation.z = sd * 0.35;
      }
      mesh(sphere(r * 0.12, 10, 6), red, 0, -r * 0.5, r * 0.88, g).scale.set(1.2, 0.5, 0.4); // lips
      mesh(box(r * 0.3, r * 0.1, r * 0.06), tc, 0, r * 0.62, -r * 1.02, g); // team ribbon at the back
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== FAC || !def.look.top?.startsWith('avb_')) return;
  const id = def.id, top = def.look.top;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, capsule } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const skin = mat(def.look.skin, { spec: 0.18 });
  if (top === 'avb_aang') { // yellow shirt, orange shawl, team sash; arrows on the hands
    const yel = mat('#f0b42a', { spec: 0.12 }), org = mat('#e2701c', { spec: 0.12 }), arrow = mat(ARROW, { spec: 0.15 });
    chestShell(H, ch, yel, C);
    sleeves(H, skel, parts, yel, 1.12, org);
    const shawl = mesh(dome(H, r * 1.3, 0.42, 20), org, 0, hh * 0.15, 0, C); shawl.scale.set(1.0, 1.1, 0.95); // over the shoulders
    fur(H, C, r * 0.62, hh + r * 0.6, org, 0.3); // its collar
    const flap = mesh(box(r * 1.1, hh * 2.6, r * 0.08), org, r * 0.15, -hh * 0.2, -r * 1.12, C); flap.rotation.z = 0.15; // hanging down the back
    belt(H, ch, C, tc, 1.14, 0.24);
    mesh(box(r * 0.22, r * 0.5, r * 0.06), tc, r * 0.5, -hh - r * 0.75, r * 1.0, C); // sash end
    skirt(H, pel, P, mat('#e8a23a', { spec: 0.1 }), 1.12, 1.3, 0.9, 0.1);
    for (const p of [PART.farmL, PART.farmR]) handArrow(H, parts[p], skel.parts[p], arrow);
  }
  if (top === 'avb_katara') { // the blue Water Tribe tunic dress with white fur trim, necklace, water pouch
    const blu = mat('#3462aa', { spec: 0.12 }), dk = mat('#22386a', { spec: 0.1 }), wht = mat('#eef2f4', { spec: 0.05 });
    chestShell(H, ch, blu, C);
    sleeves(H, skel, parts, dk, 1.1, wht);
    mesh(cyl(r * 0.58, r * 0.64, r * 0.3, 14), dk, 0, hh + r * 0.6, 0, C); // high collar
    fur(H, C, r * 0.42, hh + r * 0.78, mat('#1e2a5a'), 0.18); // choker
    mesh(cyl(r * 0.12, r * 0.12, r * 0.05, 10), mat('#7ac0f0', { spec: 0.6 }), 0, hh + r * 0.5, r * 0.62, C).rotation.x = Math.PI / 2 - 0.4; // the pendant
    const v = mesh(box(r * 0.08, hh * 2.4, r * 0.05), wht, r * 0.35, -hh * 0.1, r * 1.1, C); v.rotation.z = 0.2; // trim down the front
    belt(H, ch, C, tc, 1.14, 0.22);
    skirt(H, pel, P, blu, 1.15, 1.55, 2.4, 0.0); // the dress to the knees
    fur(H, P, pel.r * 1.53, -pel.r * 1.78, wht, 0.1).scale.set(1, 0.92, 1); // fur hem
    const pouch = mesh(cyl(r * 0.22, r * 0.2, r * 0.55, 10), mat('#7a6a58'), r * 1.12, -hh - r * 0.75, -r * 0.2, C); pouch.rotation.z = 0.15; // the water skin
    mesh(cyl(r * 0.08, r * 0.08, r * 0.12, 6), mat('#5a3a20'), r * 1.15, -hh - r * 0.42, -r * 0.2, C);
  }
  if (top === 'avb_sokka') { // blue tunic with fur collar and a belt; the boomerang on his back
    const blu = mat('#2f5c9a', { spec: 0.12 }), dk = mat('#1e3460', { spec: 0.1 }), fr = mat('#d8d4cc', { spec: 0.05 });
    chestShell(H, ch, blu, C);
    sleeves(H, skel, parts, blu, 1.12, dk, mat('#3a2a20'));
    fur(H, C, r * 0.66, hh + r * 0.5, fr, 0.32); // fur collar
    const v = mesh(box(r * 0.08, hh * 2.6, r * 0.05), dk, -r * 0.3, 0, r * 1.12, C); v.rotation.z = -0.25; // wrap seam
    belt(H, ch, C, mat('#4a3020'), 1.14, 0.22);
    mesh(box(r * 0.25, r * 0.22, r * 0.08), tc, 0, -hh - r * 0.38, r * 1.14, C); // team buckle
    skirt(H, pel, P, blu, 1.12, 1.35, 1.3, 0.1);
    // the boomerang strapped across his back, and a strap
    const bm = new THREE.Group(); bm.position.set(0, hh * 0.3, -r * 1.2); bm.rotation.z = 0.5; C.add(bm);
    boomMesh(H, bm, r * 2.2);
    const st = mesh(box(r * 0.14, (hh + r) * 2.2, r * 0.05), mat('#4a3020'), 0, 0, r * 1.1, C); st.rotation.z = -0.6;
    for (const p of [PART.shinL, PART.shinR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.35, sp.r * 1.3, sp.hh * 0.5, 10), fr, 0, -sp.hh * 0.45, 0, parts[p]); } // fur-topped boots
  }
  if (top === 'avb_toph') { // green tunic with yellow trim, a wrap belt, rolled-up trousers, bare feet
    const grn = mat('#4a7a36', { spec: 0.12 }), yel = mat('#d8c050', { spec: 0.12 }), dk = mat('#2e5222', { spec: 0.1 });
    chestShell(H, ch, grn, C);
    sleeves(H, skel, parts, grn, 1.12, yel, skin);
    mesh(cyl(r * 0.6, r * 0.66, r * 0.25, 14), yel, 0, hh + r * 0.62, 0, C); // collar trim
    const v = mesh(box(r * 0.1, hh * 2.6, r * 0.05), yel, -r * 0.35, 0, r * 1.1, C); v.rotation.z = -0.3; // front wrap trim
    belt(H, ch, C, yel, 1.15, 0.32);
    mesh(box(r * 0.25, r * 0.6, r * 0.06), tc, r * 0.55, -hh - r * 0.8, r * 0.95, C); // team sash end
    skirt(H, pel, P, dk, 1.12, 1.3, 1.1, 0.1);
    for (const p of [PART.shinL, PART.shinR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.3, sp.r * 1.25, sp.r * 0.6, 10), dk, 0, sp.hh * 0.05, 0, parts[p]); mesh(capsule(sp.r * 1.06, sp.hh * 0.9), skin, 0, -sp.hh * 0.55, 0, parts[p]); } // rolled-up cuffs, bare calves
  }
  if (top === 'avb_ek') { // green tunic with brown shoulder plates, yellow belt and the Earth Kingdom emblem
    const grn = mat('#3e6a32', { spec: 0.12 }), br = mat('#6a4a2a', { spec: 0.15 }), gold = mat('#c8a040', { spec: 0.6 });
    chestShell(H, ch, grn, C);
    sleeves(H, skel, parts, grn, 1.12, br, mat('#3a2a1e'));
    for (const sd of [-1, 1]) { const sh = mesh(sphere(r * 0.55, 12, 8), br, sd * r * 0.92, hh + r * 0.15, 0, C); sh.scale.set(1, 0.55, 1.05); }
    mesh(box(r * 1.1, hh * 1.6, r * 0.06), br, 0, hh * 0.1, r * 1.08, C); // chest panel
    mesh(cyl(r * 0.25, r * 0.25, r * 0.05, 4), gold, 0, hh * 0.2, r * 1.13, C).rotation.x = Math.PI / 2; // emblem
    belt(H, ch, C, gold, 1.14, 0.22);
    mesh(box(r * 0.3, r * 0.22, r * 0.08), tc, 0, -hh - r * 0.38, r * 1.15, C);
    skirt(H, pel, P, grn, 1.14, 1.42, 1.6, 0.1);
  }
  if (top === 'avb_kyoshi') { // green kimono-armour: plates, gold trim, layered skirt, gloves
    const grn = mat('#4a7e3c', { spec: 0.15 }), dk = mat('#2a4a24', { spec: 0.2 }), gold = mat('#d8b04a', { spec: 0.9 }), red = mat('#b02028');
    chestShell(H, ch, grn, C);
    sleeves(H, skel, parts, grn, 1.12, dk, mat('#2a3a22'));
    mesh(cyl(r * 0.6, r * 0.68, r * 0.3, 14), gold, 0, hh + r * 0.6, 0, C); // collar
    for (const y of [0.55, 0.05, -0.45]) mesh(cyl(r * 1.16, r * 1.18, r * 0.12, 16), gold, 0, y * hh + r * 0.05, 0, C); // gold bands
    const plate = mesh(box(r * 1.0, hh * 1.6, r * 0.08), dk, 0, hh * 0.05, r * 1.08, C); void plate; // breastplate
    for (const sd of [-1, 1]) { // shoulder guards
      const sh = mesh(dome(H, r * 0.6, 0.5, 12), dk, sd * r * 0.95, hh + r * 0.25, 0, C); sh.rotation.z = sd * -0.5;
      mesh(torus(H, r * 0.58, r * 0.04, Math.PI * 2, 14), gold, sd * r * 0.98, hh + r * 0.12, 0, C).rotation.x = Math.PI / 2;
    }
    belt(H, ch, C, red, 1.15, 0.3);
    mesh(box(r * 0.25, r * 0.25, r * 0.08), tc, 0, -hh - r * 0.38, r * 1.16, C); // team knot
    skirt(H, pel, P, dk, 1.15, 1.5, 1.8, 0.1);
    skirt(H, pel, P, grn, 1.2, 1.45, 1.0, 0.25); // over-layer
    fur(H, P, pel.r * 1.48, -pel.r * 1.08, gold, 0.05).scale.set(1, 0.92, 1);
    for (const p of [PART.uarmL, PART.uarmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.4, sp.r * 1.3, sp.hh * 0.9, 10), dk, 0, sp.hh * 0.45, 0, parts[p]); } // arm guards
  }
  void sphere; void cone; void td;
}

function boomMesh(H, g, L) { // a flat V of carved wood, in the XZ plane
  const { mesh, box, mat } = H;
  const wd = mat('#c8a46a', { spec: 0.2 }), dk = mat('#7a5a3a');
  for (const sd of [-1, 1]) {
    const a = mesh(box(L * 0.5, L * 0.04, L * 0.12), wd, sd * L * 0.2, 0, -L * 0.08, g); a.rotation.y = sd * 0.5;
    const s = mesh(box(L * 0.1, L * 0.045, L * 0.125), dk, sd * L * 0.3, 0, -L * 0.13, g); s.rotation.y = sd * 0.5;
  }
}

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, mat, glow } = H;
  if (name === 'av_glider') { // Aang's staff: wood, with the folded orange wings at the head
    const wd = mat('#a8763a', { spec: 0.2 }), org = mat('#e2701c', { spec: 0.1 }), red = mat('#b8361e');
    mesh(cyl(0.028 * s, 0.03 * s, 1.55 * s, 8), wd, 0, 0.55 * s, 0, g);
    for (const sd of [-1, 1]) { const w = mesh(box(0.03 * s, 0.55 * s, 0.07 * s), org, sd * 0.045 * s, 1.0 * s, 0, g); w.rotation.z = sd * 0.04; }
    mesh(box(0.1 * s, 0.05 * s, 0.075 * s), red, 0, 1.3 * s, 0, g);
    mesh(cyl(0.035 * s, 0.035 * s, 0.05 * s, 8), red, 0, 0.7 * s, 0, g);
    mesh(sphere(0.04 * s, 8, 6), wd, 0, 1.33 * s, 0, g);
    return true;
  }
  if (name === 'av_sword') { // the space sword: a black meteorite blade
    const blk = mat('#1c1c26', { spec: 0.9 }), edge = mat('#8a8aa0', { spec: 1 }), grip = mat('#e8e2d4'), gd = mat('#3a3a44', { spec: 0.6 });
    mesh(cyl(0.022 * s, 0.022 * s, 0.24 * s, 6), grip, 0, 0.04 * s, 0, g);
    mesh(cyl(0.06 * s, 0.06 * s, 0.03 * s, 10), gd, 0, 0.17 * s, 0, g);
    mesh(box(0.065 * s, 0.75 * s, 0.022 * s), blk, 0, 0.56 * s, 0, g);
    mesh(box(0.012 * s, 0.72 * s, 0.024 * s), edge, 0.036 * s, 0.56 * s, 0, g);
    const tip = mesh(box(0.06 * s, 0.06 * s, 0.022 * s), blk, 0.012 * s, 0.94 * s, 0, g); tip.rotation.z = 0.785;
    return true;
  }
  if (name === 'av_fan') { // a Kyoshi war fan, open: gold blades on dark ribs
    const gold = mat('#e8c25a', { spec: 0.9 }), dk = mat('#4a3a20');
    mesh(cyl(0.025 * s, 0.025 * s, 0.14 * s, 6), dk, 0, 0.05 * s, 0, g);
    const f = mesh(H.geo(`avb-fan${s.toFixed(3)}`, () => new H.THREE.CylinderGeometry(0.26 * s, 0.26 * s, 0.015 * s, 14, 1, false, -1.1, 2.2)), gold, 0, 0.1 * s, 0, g);
    f.rotation.x = Math.PI / 2; f.rotation.z = Math.PI; // opens upward (along +Y), flat face sideways
    f.rotation.order = 'ZXY';
    mesh(cyl(0.03 * s, 0.03 * s, 0.02 * s, 8), mat('#b02028'), 0, 0.12 * s, 0.012 * s, g).rotation.x = Math.PI / 2;
    void glow;
    return true;
  }
  if (name === 'av_fist') return true; // (bare hands)
  return false;
}

// ------------------------------------------------------------------ projectile / marker meshes
function buildProj(type, g, H) {
  const { mesh, sphere, box, cyl, cone, octa, mat, glow } = H;
  const T = H.THREE;
  const noShadow = (o) => { o.castShadow = false; return o; };
  switch (type) {
    case 'avb_airball': {
      noShadow(mesh(sphere(0.3, 14, 10), mat('#ffffff', { emit: 0.7, transparent: true, opacity: 0.32, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 3; i++) { const t = noShadow(mesh(torus(H, 0.32 + i * 0.06, 0.03, Math.PI * 1.4, 16), mat('#f4f8ff', { emit: 0.8, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0, 0, g)); t.rotation.set(i * 1.1, i * 0.7, 0); }
      return true;
    }
    case 'avb_scooter': {
      noShadow(mesh(sphere(0.42, 16, 12), mat('#eef6ff', { emit: 0.6, transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 4; i++) { const t = noShadow(mesh(torus(H, 0.44, 0.035, Math.PI * 1.2, 16), mat('#ffffff', { emit: 0.8, transparent: true, opacity: 0.7, depthWrite: false }), 0, 0, 0, g)); t.rotation.set(i * 0.8, i * 1.3, 0); }
      return true;
    }
    case 'avb_wseg': { // one link of a water whip (shaft along +Y)
      noShadow(mesh(cyl(0.12, 0.12, 0.36, 8), mat('#2a90f0', { emit: 0.5, spec: 1, transparent: true, opacity: 0.7, depthWrite: false }), 0, 0, 0, g));
      noShadow(mesh(sphere(0.12, 8, 6), mat('#2a90f0', { emit: 0.5, spec: 1, transparent: true, opacity: 0.7, depthWrite: false }), 0, 0.18, 0, g));
      noShadow(mesh(cyl(0.055, 0.055, 0.38, 6), glow('#c8f0ff'), 0, 0, 0, g));
      return true;
    }
    case 'avb_icicle': { // tip along +Y
      const ice = mat('#d8f4ff', { emit: 0.5, spec: 1, transparent: true, opacity: 0.85 });
      noShadow(mesh(cone(0.06, 0.42, 6), ice, 0, 0.12, 0, g));
      const b = noShadow(mesh(cone(0.06, 0.16, 6), ice, 0, -0.17, 0, g)); b.rotation.x = Math.PI;
      return true;
    }
    case 'avb_healwater': { // glowing water wrapped round a patient's chest
      const wtr = mat('#7ad0ff', { emit: 0.9, transparent: true, opacity: 0.7, depthWrite: false });
      for (let i = 0; i < 2; i++) { const t = noShadow(mesh(torus(H, 0.38 - i * 0.06, 0.05, Math.PI * 1.6, 18), wtr, 0, i * 0.18 - 0.05, 0, g)); t.rotation.set(Math.PI / 2 + (i ? 0.3 : -0.2), 0, i * 2); }
      for (let i = 0; i < 4; i++) noShadow(mesh(sphere(0.06, 8, 6), glow('#d8f4ff'), Math.cos(i * 1.6) * 0.42, i * 0.08, Math.sin(i * 1.6) * 0.42, g));
      return true;
    }
    case 'avb_disc': {
      const rk = mat('#8a7a64', { spec: 0.1 });
      mesh(cyl(0.22, 0.24, 0.12, 9), rk, 0, 0, 0, g);
      mesh(cyl(0.15, 0.22, 0.04, 9), mat('#6a5c4a'), 0, 0.07, 0, g);
      return true;
    }
    case 'avb_boulder': {
      const rk = mat('#857664', { spec: 0.1 }), dk = mat('#665848');
      mesh(H.geo('avb-ico0.32', () => new T.IcosahedronGeometry(0.32, 0)), rk, 0, 0, 0, g);
      for (const [x, y, z] of [[0.2, 0.12, 0.1], [-0.15, -0.15, 0.18], [0.05, 0.2, -0.2]]) mesh(octa(0.13), dk, x, y, z, g);
      return true;
    }
    case 'avb_pillar': case 'avb_pillar_s': { // a rock column; the marker is its top
      const k = type === 'avb_pillar' ? 1 : 0.7, rk = mat('#8a7a66', { spec: 0.08 }), dk = mat('#6a5c4c', { spec: 0.05 });
      mesh(cyl(0.55 * k, 0.75 * k, 2.2 * k, 7), rk, 0, -1.1 * k, 0, g);
      mesh(cyl(0.45 * k, 0.56 * k, 0.12, 7), dk, 0, -0.03, 0, g);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; mesh(octa(0.18 * k), dk, Math.cos(a) * 0.6 * k, -0.4 - (i % 3) * 0.45, Math.sin(a) * 0.6 * k, g); }
      return true;
    }
    case 'avb_rockarmor': case 'avb_rockhelm': { // Toph's earth armour (sized for her)
      const rc = type === 'avb_rockarmor' ? RCHEST.av_toph : RHEAD.av_toph;
      const rk = mat('#857664', { spec: 0.1 }), dk = mat('#6a5c4c');
      const n = type === 'avb_rockarmor' ? 9 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        for (const y of type === 'avb_rockarmor' ? [-0.5, 0.35] : [0.3]) {
          const o = mesh(box(rc * 0.75, rc * 0.7, rc * 0.25), i % 2 ? rk : dk, Math.sin(a) * rc * 1.12, y * rc, Math.cos(a) * rc * 1.12, g);
          o.rotation.y = a; o.rotation.x = y > 0 ? -0.3 : 0.15;
        }
      }
      if (type === 'avb_rockhelm') mesh(dome(H, rc * 1.2, 0.3, 10), rk, 0, rc * 0.25, 0, g);
      return true;
    }
    case 'avb_astate': { // Aang's arrow and eyes glowing in the Avatar State (on his head)
      const r = RHEAD.av_aang, gl = glow('#bff8ff');
      headArrow(H, g, r, gl, 0.04);
      for (const sd of [-1, 1]) { const e = noShadow(mesh(sphere(r * 0.16, 10, 8), glow('#ffffff'), sd * r * 0.34, r * 0.08, r * 0.95, g)); e.scale.set(1, 1.2, 0.4); }
      noShadow(mesh(sphere(r * 1.25, 16, 12), mat('#8af0ff', { emit: 1, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, g));
      g.traverse((o) => { o.castShadow = false; });
      return true;
    }
    case 'avb_ahand': {
      const r = RHEAD.av_aang;
      noShadow(mesh(sphere(r * 0.38, 10, 8), mat('#8af0ff', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0, 0, g));
      noShadow(mesh(sphere(r * 0.16, 8, 6), glow('#ffffff'), 0, 0, 0, g));
      return true;
    }
    case 'avb_orb_fire': {
      noShadow(mesh(sphere(0.17, 12, 8), glow('#ff7a20'), 0, 0, 0, g));
      noShadow(mesh(sphere(0.25, 12, 8), mat('#ffb040', { emit: 1, transparent: true, opacity: 0.4, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 4; i++) { const c = noShadow(mesh(cone(0.07, 0.22, 5), glow('#ffd060'), Math.cos(i * 1.57) * 0.13, 0.12, Math.sin(i * 1.57) * 0.13, g)); c.rotation.z = Math.cos(i * 1.57) * -0.5; c.rotation.x = Math.sin(i * 1.57) * 0.5; }
      return true;
    }
    case 'avb_orb_water': {
      noShadow(mesh(sphere(0.2, 12, 8), mat('#3aa0ff', { emit: 0.6, spec: 1, transparent: true, opacity: 0.75 }), 0, 0, 0, g));
      noShadow(mesh(torus(H, 0.26, 0.04, Math.PI * 1.5, 14), mat('#bfe8ff', { emit: 0.8, transparent: true, opacity: 0.8 }), 0, 0, 0, g));
      return true;
    }
    case 'avb_orb_earth': {
      mesh(H.geo('avb-ico0.2', () => new T.IcosahedronGeometry(0.2, 0)), mat('#8a6a45', { spec: 0.1 }), 0, 0, 0, g);
      mesh(octa(0.1), mat('#6a5c4c'), 0.14, 0.08, 0.05, g);
      return true;
    }
    case 'avb_orb_air': {
      noShadow(mesh(sphere(0.18, 12, 8), mat('#ffffff', { emit: 0.8, transparent: true, opacity: 0.4, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 2; i++) { const t = noShadow(mesh(torus(H, 0.24, 0.03, Math.PI * 1.5, 14), mat('#ffffff', { emit: 0.9, transparent: true, opacity: 0.75 }), 0, 0, 0, g)); t.rotation.set(i * 1.4, i, 0); }
      return true;
    }
    case 'avb_boomerang': {
      boomMesh(H, g, 0.55);
      return true;
    }
  }
  void box;
  return false;
}

// ------------------------------------------------------------------ effects
const FX = {
  // frost behind an icicle
  avb_frost(fx, x, y, z, a, b, c, T) {
    fx.bb(fx.gs, x, y, z, rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2), rand(0.08, 0.14), rand(0.25, 0.4), Math.random() < 0.5 ? '#eafaff' : '#9fd8ff', { tile: T.star, vr: rand(-4, 4), shrink: true });
  },
  // grit and dust behind a thrown rock (a = size)
  avb_rtrail(fx, x, y, z, a) {
    const k = a || 1;
    fx.chunk(x, y, z, rand(-0.6, 0.6), rand(-0.2, 0.8), rand(-0.6, 0.6), rand(0.03, 0.06) * k, rand(0.4, 0.7), Math.random() < 0.5 ? '#7a7268' : '#8a6a45');
    if (Math.random() < 0.6) fx.dust(x, y, z, 1, 0.3 * k, 0.1, 0.2);
  },
};

const MARK = { g: 0, len: 0, r: 0, life: 1 };
register({
  units,
  items: {
    av_glider: { len: 1.4, r: 0.06, grip: 30, mass: 1.1 },
    av_sword: { len: 0.98, r: 0.07, grip: 30, metal: true, mass: 1.5 },
    av_fan: { len: 0.45, r: 0.12, grip: 30, phys: false },
    av_fist: { len: 0.42, r: 0.11, grip: 90, phys: false },
  },
  kinds: { av_aang: aang, av_katara: katara, av_sokka: sokka, av_toph: toph, av_ebender: ebender, av_kyoshi: kyoshi },
  proj: {
    avb_airball: AIRBALL, avb_icicle: ICICLE, avb_boomerang: BOOM, avb_boulder: BOULDER, avb_disc: DISC,
    avb_scooter: MARK, avb_wseg: MARK, avb_healwater: MARK, avb_pillar: MARK, avb_pillar_s: MARK,
    avb_rockarmor: MARK, avb_rockhelm: MARK, avb_astate: MARK, avb_ahand: MARK,
    avb_orb_fire: MARK, avb_orb_water: MARK, avb_orb_earth: MARK, avb_orb_air: MARK,
  },
  fx: FX,
  buildItem, buildHat, decorate, buildProj,
  battleStep(b, dt) { stepPillars(b, dt); },
});
