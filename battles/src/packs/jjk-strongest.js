// Jujutsu Kaisen: the strongest (built on jjk-core.js).
//  - Satoru Gojo (jk_gojo): Infinity (on, with short gaps; off while he charges Purple
//    and while burnt out after his domain), Blue (a point that drags enemies in), Red
//    (a blast that throws them out), Hollow Purple (a huge orb that erases a line).
//    Domain: Unlimited Void (power 12, barrier): everyone inside is frozen, overwhelmed
//    (it beats the Shrine's 10 + 1 for having no barrier: the Strongest wins that clash).
//    Teleports clear of a blow he can't stop (Infinity down, or Toji's spear) and floats
//    straight back up when knocked down.
//  - Ryomen Sukuna (jk_sukuna): Dismantle (invisible cuts at range), Cleave (a cut that
//    scales with the target's toughness), Fuga (a fire arrow drawn on a bow of flame).
//    Domain: Malevolent Shrine (power 10, NO barrier, bigger): cuts everything inside,
//    his own side too (less). His finger count grows with kills, up to twenty.
//  - Megumi Fushiguro (jk_megumi): a shadow blade, and the Ten Shadows: Divine Dogs
//    (white and black), Nue (an owl that flies and shocks), Toad (tongue pull), Max
//    Elephant (floods). Shikigami are reserves (jjk-core summon/dismiss). Domain:
//    Chimera Shadow Garden (power 4, incomplete): shadows sink and bite. Badly hurt, he
//    may perform the ritual: Mahoraga appears and its first blow is for him.
//  - Mahoraga (jk_mahoraga): the Divine General. Huge, the Sword of Extermination on its
//    arm, the eight-handled wheel over its head. Each kind of harm turns the wheel (a
//    visible click) and hurts it less from then on. It adapts to Infinity too, but
//    Gojo and Sukuna change their technique faster than the wheel turns (adaptTop).
// Secrets: Meguna (an enemy Sukuna near Megumi's ritual may take his body: Megumi
// changes sides with Sukuna's tattoos, techniques and domain, and all his shikigami);
// Gojo vs Sukuna domain clash; "Nah, I'd win"; "Throughout heaven and earth..." (Gojo
// awakens, badly hurt); "Stand proud" (Sukuna kills Gojo); all twenty fingers; Mahoraga
// adapts to Infinity and its side's Sukuna learns the World-Cutting Slash; the King of
// Curses exorcises Mahoraga.
// Everything drawn is a unit part, an extra body (the wheel), a projectile or a marker,
// so setup previews, battles and replays all show it.
import { register } from '../ext.js';
import { ATTACKS } from '../pose.js';
import { RAPIER } from '../physics.js';
import { makeSkeleton } from '../body.js';
import { FIELD } from '../world.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, crossed, aimPoint, launchVel, addProjectile, strike, handPos,
  torus, dome, headBand, tcol, tdark, chestShell, blast, addStatus,
} from './common.js';
import { UPY, markAt, STANCE, setArmKey, hover, refreshBeam, endBeam } from './ges-core.js';
import { placeExtra } from './sm-core.js';
import {
  jk, openDomain, domeMesh, summon, dismiss, switchTeam, onSecret, announce, isA, burntOut, ensureHitHook,
  markerAt, markerOn, enemyOf,
} from './jjk-core.js';
// (no static import of battle.js here: see jjk-core.js; this is battle.js park())
function park(u) {
  u.dormant = true;
  u.alive = false;
  for (const bd of u.rag.bodies) bd.setEnabled(false);
  for (const e of u.extras) e.body?.setEnabled(false);
}

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const sealed = (u) => u.jkSealedT > u.battle.time;
const sukunaLike = (v) => isA(v, 'jk_sukuna') || (!!v && v.alive && !!v.jkMeguna);
// tuning the balance harness (and tests) can override
export const TUNE = { megunaChance: 0.5, ritualChance: 0.85 };

// domain radii (the dome markers are built at these sizes)
const VOID_R = 8, SHRINE_R = 11, GARDEN_R = 7;

// ------------------------------------------------------------------ animations
// Hollow Purple: hands out wide (blue in the left, red in the right), then brought
// together and pushed at the target
ATTACKS.jk_purple = [
  [0.0, null, null, 0, 0, 0],
  [0.25, [-0.3, 1.25, -0.9, -1.4], [-0.3, 1.25, -0.9, -1.4], 0, -0.1, 0.05],
  [0.6, [-0.25, 1.1, -1.0, -1.5], [-0.25, 1.1, -1.0, -1.5], 0, -0.12, 0.08],
  [0.72, [0.55, 0.15, -1.35, -1.6], [0.55, 0.15, -1.35, -1.6], 0, 0.15, 0.1],
  [0.85, [0.3, 0.1, -1.5, -1.55], [0.3, 0.1, -1.5, -1.55], -0.15, 0.3, 0.1],
  [1.0, null, null, 0, 0, 0],
];
// Gojo's flick: one hand up, two fingers out (Red / Blue)
ATTACKS.jk_flick = [
  [0.0, null, null, 0, 0, 0],
  [0.35, null, [0.4, 0.2, -1.3, -2.3], 0.15, -0.05, 0],
  [0.55, null, [0.2, 0.1, -1.55, -1.6], -0.2, 0.2, 0],
  [0.8, null, [0.2, 0.1, -1.5, -1.55], -0.2, 0.18, 0],
  [1.0, null, null, 0, 0, 0],
];
// shikigami stances: dogs reach forward like front legs; the toad squats; Mahoraga
// holds the blade arm out
STANCE.jk_dog = (st, pose) => { setArmKey(pose, -1, [0.15, 0.1, -0.75, -0.9]); setArmKey(pose, 1, [0.15, 0.1, -0.75, -0.9]); };
STANCE.jk_wings = (st, pose) => { const f = Math.sin((st.t || 0) * 9) * 0.45; setArmKey(pose, -1, [0, 1.35 + f, -0.2, -0.2]); setArmKey(pose, 1, [0, 1.35 + f, -0.2, -0.2]); };
STANCE.jk_toad = (st, pose) => { setArmKey(pose, -1, [0.3, 0.5, -0.5, -0.5]); setArmKey(pose, 1, [0.3, 0.5, -0.5, -0.5]); };
STANCE.jk_blade = (st, pose) => { setArmKey(pose, -1, [-0.1, 0.4, -0.3, -0.7]); setArmKey(pose, 1, [0.2, 0.25, -0.7, -0.9]); };

// ------------------------------------------------------------------ helpers
function enemiesIn(b, u, p, R) {
  const out = [];
  b.grid.query(p.x, p.z, R + 1, (v) => { if (enemyOf(u, v) && flat(v.pos, p) < R) out.push(v); });
  return out;
}
function nearestEnemyTo(b, u, p, R) {
  let best = null, bd = R;
  for (const v of b.teams[1 - u.team]) { if (!v.alive) continue; const d = flat(v.pos, p); if (d < bd) { bd = d; best = v; } }
  return best;
}
function markSpin(b, type, pos, t) {
  const s = markAt(b, type, pos, t);
  s.quat.setFromEuler(_e.set(rand(-1.2, 1.2), rand(0, Math.PI * 2), rand(-1.2, 1.2)));
  return s;
}
// an invisible cut (Dismantle, Cleave, the shrine's sure-hit)
function cut(b, v, dmg, force, att, kind, mk = true, sound = 'slash') {
  const a = rand(0, Math.PI * 2);
  _d.set(Math.cos(a), 0.3, Math.sin(a)).normalize();
  strike(b, v, dmg, _d, Math.min(force, v.M * 8), att, kind, PART.chest, sound);
  if (mk && v.parriedAt !== b.time) markSpin(b, 'jj_cut', v.chestPos, 0.22);
}
// worth a domain: enough enemies inside it, or one strong one (a hero or a boss)
function domainWorth(b, u, R, min) {
  const list = enemiesIn(b, u, u.pos, R);
  return list.length >= min || (list.length > 0 && list.some((v) => v.maxHp >= 600)) || (!!u.control && list.length > 0);
}
// the special banner when the Strongest and the King of Curses expand at once
function clashBanner(b, u, R) {
  for (const d of jk(b).domains) {
    if (d.team === u.team || flat(d.pos, u.pos) > d.R + R) continue;
    const gs = (isA(u, 'jk_gojo') && sukunaLike(d.owner)) || (sukunaLike(u) && isA(d.owner, 'jk_gojo'));
    if (gs) announce(b, 'SECRET: The Strongest vs the King of Curses - domain clash!', d.pos, 'gsclash');
  }
}

// ------------------------------------------------------------------ Gojo
const HAND_LP = (u) => V(0, -u.skel.handOffset * 1.15, 0);
const gojo = {
  aim: true,
  init(u) {
    ensureHitHook(u);
    const w = u.def.weapon;
    u.attackDur = w.windup;
    u.infOn = true; u.infT = w.infUp * rand(0.6, 1); u.rippleT = 0;
    u.blinkCD = 1; u.blueCD = rand(1.5, 3); u.purpleCD = w.purpleFirst * rand(0.8, 1.2); u.domCD = w.domFirst * rand(0.85, 1.15);
    u.jkInfinity = true; u.jkTech = 'red'; u.infMk = null;
  },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, gap, dirx, dirz, spd } = c;
    if (sealed(u)) { u.desired.set(0, 0, 0); return null; }
    u.expr = u.jkInfinity ? EXPR.happy : EXPR.normal;
    if (burntOut(u)) { // no technique (and no Infinity) for a while: keep away
      if (gap < 6) u.desired.set(-dirx * spd * 0.8, 0, -dirz * spd * 0.8);
      u.expr = EXPR.scared;
      return t;
    }
    // domain ready: stroll in among them (Infinity on); otherwise keep at range (and
    // well away from anything that cuts through Infinity)
    const stroll = u.domCD <= 0 && u.jkInfinity && !t.jkPierce;
    if (stroll ? gap > 2 : dist > w.range * 0.8) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (gap < 2.5 && !u.jkInfinity) u.desired.set(-dirx * spd * 0.8, 0, -dirz * spd * 0.8);
    if (!u.st.attack && u.cooldown <= 0 && u.stun <= 0 && !u.isDown() && dist < w.range) {
      gojoCast(u, gojoPick(u, t));
      u.aimAt = t;
    }
    if (u.st.attack) u.desired.multiplyScalar(0.15);
    return t;
  },
  // possessed: RT Red; Blue, Purple and the Void on their own buttons (src/skills.js)
  control(u, dt, c) {
    if (c.attack && !u.st.attack && u.cooldown <= 0 && !sealed(u) && !burntOut(u)) { gojoCast(u, 'red'); u.aimAt = null; }
    return true;
  },
  basic: 'Red',
  skills: [
    { key: 'x', name: 'Blue', icon: '🔵', cd: (u) => u.blueCD, max: (u) => u.def.weapon.blueCD, ready: (u) => !burntOut(u) || 'burnt out',
      use(u) { gojoCast(u, 'blue'); u.aimAt = null; return true; } },
    { key: 'lb', name: 'Hollow Purple', icon: '🟣', cd: (u) => u.purpleCD, max: (u) => u.def.weapon.purpleCD, ready: (u) => !burntOut(u) || 'burnt out',
      use(u) { gojoCast(u, 'purple'); u.aimAt = null; return true; } },
    { key: 'rb', name: 'Unlimited Void', icon: '♾', cd: (u) => u.domCD, max: (u) => u.def.weapon.domCD, ready: (u) => !burntOut(u) || 'burnt out',
      use(u) { u.domCD = u.def.weapon.domCD; openVoid(u.battle, u); return true; } },
  ],
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle, tech = u.jkTech;
    if (tech === 'purple' && crossed(t0, t1, 0.08)) {
      // Blue in the left hand, Red in the right
      const life = u.attackDur * 0.65;
      u.jkOrbs = [markerOn(b, u, 'jk_handblue', PART.farmL, life, HAND_LP(u)), markerOn(b, u, 'jk_handred', PART.farmR, life, HAND_LP(u))];
      b.sound('magic', u.chestPos, 0.8, 0.5);
      b.voice(u, 'cry', true);
    }
    const at = tech === 'purple' ? 0.74 : w.releaseAt;
    if (!crossed(t0, t1, at)) return;
    u.released = true;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), c = u.chestPos;
    const from = _o.set(c.x + fx * 0.9 * u.s, c.y + 0.1, c.z + fz * 0.9 * u.s);
    aimPoint(u, _p, 0.4, 0.6);
    if (!u.aimAt && u.control && !u.control.aimPt) _p.y = from.y + Math.tan(u.control.aimPitch) * 14;
    if (tech === 'red') {
      launchVel(from, _p, w.speed, 0, false, 0.02, _v);
      addProjectile(b, 'jk_red', from, _v, u, { life: (w.range / w.speed) * 1.4, damage: w.damage, force: w.force, blast: w.blast });
      b.sound('boom', from, 0.6, 1.4);
      b.emit('spark', from.x, from.y, from.z, 3);
      u.rag.impulseAll(-fx * u.M * 0.6, 0, -fz * u.M * 0.6);
    } else if (tech === 'blue') {
      const goal = _p.clone();
      goal.y = b.terrain.height(goal.x, goal.z) + 1.1;
      launchVel(from, goal, w.blueSpeed, 0, false, 0, _v);
      const travel = from.distanceTo(goal) / w.blueSpeed;
      addProjectile(b, 'jk_blue', from, _v, u, { life: travel + w.blueT, goal, pullT: w.blueT, damage: w.blueDmg, force: 0, tickT: 0 });
      b.sound('whoosh', from, 0.9, 0.5);
      u.blueCD = w.blueCD;
    } else { // Hollow Purple
      const big = !!u.jkAwake;
      launchVel(from, _p, w.purpleSpeed, 0, false, 0, _v);
      _v.y = clamp(_v.y, -1.5, 1.5);
      addProjectile(b, big ? 'jk_purple2' : 'jk_purple', from, _v, u, {
        life: (w.range + 14) / w.purpleSpeed, damage: w.purpleDmg * (big ? 1.25 : 1), force: w.force * 1.4, R: w.purpleR * (big ? 1.5 : 1),
        spin: new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2)),
      });
      announce(b, 'Hollow Technique: Purple', from);
      b.sound('boom', from, 1.4, 0.4);
      b.sound('magic', from, 1.0, 0.35);
      b.emit('spark', from.x, from.y, from.z, 12);
      u.rag.impulseAll(-fx * u.M * 1.5, 0, -fz * u.M * 1.5);
      u.purpleCD = w.purpleCD;
      if (u.jkOrbs) { for (const m of u.jkOrbs) m.t = 0; u.jkOrbs = null; }
    }
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.blueCD -= dt; u.purpleCD -= dt; u.domCD -= dt; u.rippleT -= dt;
    const sl = sealed(u);
    u.infT -= dt;
    if (u.infT <= 0) { u.infOn = !u.infOn; u.infT = u.infOn ? w.infUp * rand(0.85, 1.15) : w.infDown * rand(0.85, 1.15); }
    const casting = u.st.attack === 'jk_purple';
    const on = u.infOn && !sl && !burntOut(u) && !casting;
    if (on !== u.jkInfinity) {
      u.jkInfinity = on;
      const c = u.chestPos;
      if (on) { b.sound('heal', c, 0.4, 1.8); if (!u.infMk || u.infMk.t <= 0) u.infMk = markerOn(b, u, 'jk_inf', PART.pelvis, 9999); }
      else { b.emit('spark', c.x, c.y, c.z, 3); b.sound('click', c, 0.6, 0.6); dropHeld(b, u); if (u.infMk) { u.infMk.t = 0; u.infMk = null; } }
    }
    if (u.jkOrbs && !u.st.attack) { for (const m of u.jkOrbs) m.t = 0; u.jkOrbs = null; }
    // badly hurt: the awakening (Reverse Cursed Technique, a bigger Purple at once)
    if (!u.jkAwake && !sl && u.hp < u.maxHp * w.awakeAt) {
      u.jkAwake = true;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * w.rct);
      u.purpleCD = Math.min(u.purpleCD, 0.5);
      u.stun = 0;
      announce(b, 'SECRET: "Throughout heaven and earth, I alone am the honored one."', u.headPos, 'awake' + u.id);
      markerOn(b, u, 'jk_awake', PART.chest, 2.5);
      b.voice(u, 'cry', true);
      b.sound('heal', u.chestPos, 1.0, 0.8);
    }
    if (on && u.stun < 0.5) holdShots(b, u, dt);
    if (!sl) getUp(u, dt);
    // a blow he can't stop is coming (Infinity down, or a weapon that cuts through it):
    // he teleports clear
    u.blinkCD -= dt;
    if (u.blinkCD <= 0 && !sl && !burntOut(u) && !b.over) {
      const v = nearestEnemyTo(b, u, u.pos, w.blinkR + u.skel.radius);
      if (v && v.def.weapon.range === undefined && (v.jkPierce || !u.jkInfinity)) blink(b, u, v);
    }
    // Unlimited Void (possessed: the player opens it)
    if (u.domCD <= 0 && !u.control && !sl && !burntOut(u) && !u.st.attack && u.stun <= 0.3 && !b.over) {
      if (!domainWorth(b, u, w.domR * 0.9, w.domMin)) u.domCD = 0.3;
      else { u.domCD = w.domCD; openVoid(b, u); }
    }
  },
  parry(u, attacker, kind) {
    if (!u.jkInfinity || u.stun > 0.5 || kind === 'domain' || (attacker && attacker.jkPierce) || kind === 'poison' || kind === 'burn') return false;
    const b = u.battle;
    u.parriedAt = b.time;
    if (u.rippleT <= 0) {
      u.rippleT = 0.12;
      const c = u.chestPos;
      if (attacker && attacker.chestPos) _p.lerpVectors(c, attacker.chestPos, 0.35); else _p.copy(c);
      markAt(b, 'jj_ripple', _p, 0.35);
      b.sound('tick', _p, 0.6, 1.3);
    }
    return true;
  },
  die(u, killer) {
    const b = u.battle;
    dropHeld(b, u);
    if (u.infMk) { u.infMk.t = 0; u.infMk = null; }
    if (sukunaLike(killer)) announce(b, 'SECRET: "Stand proud. You are strong." - Sukuna', u.headPos, 'standproud');
  },
};
// back on his feet at once (he floats up)
function getUp(u, dt) {
  const w = u.def.weapon;
  if (!w.rise || u.stun > 0.05 || !u.isDown() || u.airT > 0.1) { u.jkDownT = 0; if (!u.isDown()) u.jkUps = 0; return; }
  u.jkDownT = (u.jkDownT || 0) + dt;
  if (u.jkDownT < w.rise) return;
  u.jkDownT = 0;
  u.jkUps = (u.jkUps || 0) + 1;
  const k = Math.min(2, 1 + u.jkUps * 0.25);
  u.rag.impulse(PART.chest, 0, u.M * 2.4 * k, 0);
  u.rag.impulse(PART.head, 0, u.M * 0.7 * k, 0);
  u.rag.impulseAll(0, u.M * 1.6, 0);
}
// teleport w.blinkD away from v (staying on the field, and inside any domain he is in)
function blink(b, u, v) {
  const w = u.def.weapon;
  const dx = u.pos.x - v.pos.x, dz = u.pos.z - v.pos.z, L = Math.hypot(dx, dz) || 1;
  const dom = jk(b).domains.find((d) => d.barrier && d.inside.has(u));
  let best = null;
  for (const a of [0, 0.6, -0.6, 1.2, -1.2]) {
    const c = Math.cos(a), sn = Math.sin(a), fx = (dx * c - dz * sn) / L, fz = (dx * sn + dz * c) / L;
    const x = u.pos.x + fx * w.blinkD, z = u.pos.z + fz * w.blinkD;
    if (Math.abs(x) > FIELD.x - 2 || Math.abs(z) > FIELD.z - 2) continue;
    if (dom && flat({ x, z }, dom.pos) > dom.R - 1.2) continue;
    best = [x, z]; break;
  }
  u.blinkCD = best ? w.blinkCD : 0.5;
  if (!best) return;
  const p = u.pos;
  markAt(b, 'jj_ripple', _p.set(p.x, p.y, p.z), 0.35);
  b.emit('spark', p.x, p.y, p.z, 4);
  const gy = b.terrain.height(best[0], best[1]), ddx = best[0] - p.x, ddz = best[1] - p.z, ddy = gy + u.skel.standHeight + 0.05 - p.y;
  for (const bd of u.rag.bodies) {
    const t = bd.translation();
    bd.setTranslation({ x: t.x + ddx, y: t.y + ddy, z: t.z + ddz }, true);
    bd.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
  u.rag.read();
  for (const l of u.legs || []) l.state = 'free';
  u.stun = 0;
  markAt(b, 'jj_ripple', u.chestPos, 0.35);
  b.sound('whoosh', u.pos, 0.8, 1.8);
  if (v.jkPierce) announce(b, 'Gojo teleports out of reach', u.headPos, 'blink' + u.id);
}
function gojoPick(u, t) {
  const b = u.battle, w = u.def.weapon;
  if (u.purpleCD <= 0 && (t.maxHp >= 700 || lineCount(u, t) >= 3)) return 'purple';
  if (u.blueCD <= 0 && enemiesIn(b, u, t.pos, w.blueR).length >= 3) return 'blue';
  return 'red';
}
function gojoCast(u, tech) {
  const w = u.def.weapon;
  u.jkTech = tech;
  u.attackDur = tech === 'purple' ? w.purpleWind : w.windup;
  u.startAttack();
  u.st.attack = tech === 'purple' ? 'jk_purple' : 'jk_flick';
  if (tech === 'purple') u.cooldown = w.purpleWind + 0.6;
}
// enemies near the line from u through t (to range)
function lineCount(u, t) {
  const b = u.battle, w = u.def.weapon, p = u.pos;
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, L = Math.hypot(dx, dz) || 1, fx = dx / L, fz = dz / L;
  let n = 0;
  for (const v of b.teams[1 - u.team]) {
    if (!v.alive) continue;
    const rx = v.pos.x - p.x, rz = v.pos.z - p.z, along = rx * fx + rz * fz;
    if (along < 0 || along > w.range + 6) continue;
    if (Math.abs(rx * fz - rz * fx) < w.purpleR + v.skel.radius) n++;
  }
  return n;
}
// Infinity: enemy shots slow down and hang in the air short of him; enemies can't push
// in closer than arm's length
const PASS = new Set(['jj_word', 'ev_gust', 'jk_water', 'jk_purple', 'jk_purple2']);
function holdShots(b, u, dt) {
  const c = u.chestPos, R2 = (1.9 * u.s) ** 2;
  for (const pr of b.projectiles) {
    if (pr.team === u.team || PASS.has(pr.type) || (pr.owner && pr.owner.jkPierce)) continue;
    const dx = pr.pos.x - c.x, dy = pr.pos.y - c.y, dz = pr.pos.z - c.z;
    if (dx * dx + dy * dy + dz * dz > R2) continue;
    if (!pr.jjHeld) {
      pr.jjHeld = u;
      if (u.rippleT <= 0) { u.rippleT = 0.12; markAt(b, 'jj_ripple', pr.pos, 0.35); }
      b.sound('tick', pr.pos, 0.5, 1.6);
    }
    pr.vel.multiplyScalar(1 - Math.min(0.95, 16 * dt));
    pr.vel.y += b.projGravity(pr.type) * dt;
    pr.life = Math.max(pr.life, 0.6);
    if (pr.fuse > 0) pr.fuse += dt * 0.9;
  }
  b.grid.query(c.x, c.z, 2.5 * u.s, (v) => {
    if (!enemyOf(u, v) || v.bc || v.jkPierce) return;
    const dx = v.pos.x - c.x, dz = v.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
    if (d > u.skel.radius + v.skel.radius + 0.5) return;
    const vel = v.rag.vel[PART.pelvis], inward = -(vel.x * dx + vel.z * dz) / d;
    if (inward > 0) v.rag.impulseAll(dx / d * inward * v.M * 0.3, 0, dz / d * inward * v.M * 0.3);
  });
}
function dropHeld(b, u) {
  for (const pr of b.projectiles) if (pr.jjHeld === u) { pr.jjHeld = null; pr.vel.set(rand(-0.3, 0.3), -0.5, rand(-0.3, 0.3)); }
}
function openVoid(b, u) {
  const w = u.def.weapon;
  clashBanner(b, u, w.domR);
  const mks = [];
  const dom = openDomain(b, u, {
    name: 'Unlimited Void', radius: w.domR, duration: w.domDur, power: w.domPow, tick: 0.25, marker: 'jk_void', burnout: w.burnout,
    step(b, d) { d.data.k = enemiesIn(b, u, d.pos, d.R).length; },
    sureHit(b, d, v) {
      // infinite information: frozen where they stand
      v.stun = Math.max(v.stun, 0.45);
      v.st.attack = null;
      v.expr = EXPR.scared;
      const vel = v.rag.vel[PART.pelvis];
      if (!v.bc) v.rag.impulseAll(-vel.x * v.M * 0.25, 0, -vel.z * v.M * 0.25);
      d.data.n = (d.data.n || 0) + 1;
      // the overload is shared out: one victim takes it all, a crowd a share each
      if (d.data.n % 2 === 0) v.hit(w.voidDmg / Math.max(1, d.data.k || 1) ** w.voidSplit, PART.head, 0, 0, 0, u.alive ? u : null, 'domain');
      if ((!v.jkVoidMk || v.jkVoidMk.t <= 0) && mks.length < 24) {
        v.jkVoidMk = markerOn(b, v, 'jk_overload', PART.head, d.t + 0.3, V(0, v.skel.rHead * 2.2, 0));
        mks.push(v.jkVoidMk);
      }
    },
    onClose() { for (const m of mks) m.t = 0; },
  });
  if (dom) b.voice(u, 'cry', true);
}

// ------------------------------------------------------------------ Sukuna
// (Meguna runs the same code with Sukuna's numbers)
let SKW = null; // jk_sukuna's weapon (set below)
function skInit(u) {
  ensureHitHook(u);
  u.fugaCD = SKW.fugaFirst * rand(0.8, 1.2);
  u.skDomCD = SKW.domFirst * rand(0.85, 1.15);
  u.jkPow = u.jkPow || 1;
  u.jkFingers = u.jkFingers || 15;
}
function skThink(u, dt, c) {
  const w = SKW, { t, dist, gap, dirx, dirz, spd } = c;
  if (sealed(u)) { u.desired.set(0, 0, 0); return null; }
  u.expr = gap < 8 ? EXPR.angry : EXPR.happy;
  if (gap > w.range * 0.45) u.desired.set(dirx * spd, 0, dirz * spd);
  if (!u.st.attack && u.cooldown <= 0 && u.stun <= 0 && !u.isDown()) {
    if (u.fugaCD <= 0 && dist > 5 && dist < w.fugaRange && enemiesIn(u.battle, u, t.pos, w.fugaBlast).length >= 2) skCast(u, 'fuga', t);
    else if (gap < w.range) skCast(u, 'cut', t);
  }
  if (u.st.attack) u.desired.multiplyScalar(u.jkTech === 'fuga' ? 0.1 : 0.5);
  return t;
}
function skCast(u, tech, t) {
  u.jkTech = tech;
  u.attackDur = tech === 'fuga' ? 1.1 : 0.8;
  u.startAttack();
  u.st.attack = tech === 'fuga' ? 'bow' : 'dual';
  u.cooldown = tech === 'fuga' ? 1.6 : SKW.cooldown * rand(0.85, 1.15);
  u.aimAt = t;
  if (tech === 'fuga') u.fugaCD = SKW.fugaCD;
}
function skControl(u, dt, c) {
  if (c.attack && !u.st.attack && u.cooldown <= 0 && !sealed(u)) skCast(u, u.fugaCD <= 0 && c.block ? 'fuga' : 'cut', null);
  return true;
}
function skEvent(u, t0, t1) {
  const b = u.battle, w = SKW;
  if (u.jkTech === 'fuga') {
    if (crossed(t0, t1, 0.15)) {
      markerOn(b, u, 'jk_firebow', PART.farmL, u.attackDur * 0.6, HAND_LP(u));
      b.sound('fire', u.chestPos, 0.8, 0.8);
    }
    if (!crossed(t0, t1, 0.68)) return;
    u.released = true;
    const from = handPos(u, _o);
    aimPoint(u, _p, 0.3, 0.5);
    if (!u.aimAt && u.control && !u.control.aimPt) _p.y = from.y + Math.tan(u.control.aimPitch) * 14;
    launchVel(from, _p, w.fugaSpeed, 0, false, 0.01, _v);
    addProjectile(b, 'jk_fuga', from, _v, u, { life: w.fugaRange / w.fugaSpeed * 1.5, damage: w.fugaDmg * u.jkPow, force: w.force * 1.6, blast: w.fugaBlast });
    announce(b, 'Fuga: "Open."', from, 'fuga' + u.id);
    b.sound('whoosh', from, 1.0, 0.6);
    b.sound('fire', from, 1.0, 1.0);
    return;
  }
  for (const at of [0.42, 0.62]) if (crossed(t0, t1, at)) dismantle(u, w.cuts / 2);
}
function dismantle(u, n) {
  const b = u.battle, w = SKW, p = u.pos, R = w.range + u.skel.radius;
  const list = [];
  b.grid.query(p.x, p.z, R + 1, (v) => {
    if (!enemyOf(u, v)) return;
    const d = flat(v.pos, p) - v.skel.radius;
    if (d < R) list.push([d + rand(0, 1.5), v, d]);
  });
  list.sort((a, c) => a[0] - c[0]);
  for (let i = 0; i < Math.min(n, list.length); i++) {
    const [, v, d] = list[i];
    // Cleave: up close, a cut that adjusts to how tough the target is
    if (d < 1.6 && i === 0) cut(b, v, Math.min(w.cleaveMax, (w.cleaveDmg + v.maxHp * w.cleaveK) * u.jkPow), w.force * 1.4, u, 'jk_cleave');
    else cut(b, v, w.damage * u.jkPow, w.force, u, 'jk_dismantle');
  }
  b.sound('whoosh', u.chestPos, 0.9, 1.6);
}
function skStep(u, dt) {
  const b = u.battle, w = SKW;
  u.fugaCD -= dt; u.skDomCD -= dt;
  // fingers: one more for every two kills (twenty in all)
  const f = Math.min(20, 15 + Math.floor(u.kills / 4));
  if (f > u.jkFingers) {
    u.jkFingers = f;
    if (f === 20) {
      u.jkPow = 1.3;
      u.hp = u.maxHp;
      announce(b, 'SECRET: All twenty fingers - the King of Curses at full power!', u.headPos, 'fingers' + u.id);
      markerOn(b, u, 'jk_awake', PART.chest, 2);
      b.voice(u, 'cry', true);
    }
  }
  if (u.skDomCD <= 0 && !sealed(u) && !burntOut(u) && !u.st.attack && u.stun <= 0.3 && !b.over) {
    if (!domainWorth(b, u, w.domR * 0.8, w.domMin)) u.skDomCD = 0.3;
    else { u.skDomCD = w.domCD; openShrine(b, u); }
  }
}
function openShrine(b, u) {
  const w = SKW;
  clashBanner(b, u, w.domR);
  let marks = 0;
  openDomain(b, u, {
    name: 'Malevolent Shrine', radius: w.domR, duration: w.domDur, power: w.domPow, barrier: false, tick: w.shrineTick, marker: 'jk_shrine', burnout: 5,
    sureHit(b, d, v) {
      // Gojo meets it with Domain Amplification: half
      const dmg = w.shrineDmg * u.jkPow * (isA(v, 'jk_gojo') ? 0.5 : 1);
      cut(b, v, dmg, w.force * 0.4, u.alive ? u : null, 'domain', (marks++ & 3) === 0, (marks & 3) === 0 ? 'slash' : null);
    },
    step(b, d, dt) {
      // it cuts everything: his own side too (less)
      d.data.at = (d.data.at ?? w.shrineTick * 2) - dt;
      if (d.data.at > 0) return;
      d.data.at = w.shrineTick * 2;
      for (const v of b.teams[u.team]) {
        if (!v.alive || v === u || flat(v.pos, d.pos) > d.R) continue;
        cut(b, v, w.shrineDmg * w.allyK, w.force * 0.2, null, 'domain', false, null);
      }
    },
  });
}
const sukuna = {
  aim: true,
  init(u) { skInit(u); },
  think: skThink, control: skControl, event: skEvent,
  step: skStep,
};

// ------------------------------------------------------------------ Megumi
let MGW = null; // jk_megumi's weapon
const SHIKI = ['jk_dog_white', 'jk_dog_black', 'jk_nue', 'jk_toad', 'jk_elephant'];
const outOf = (b, u, type) => b.units.find((s) => s.reserveOf === u && s.def.id === type && s.alive && !s.dormant);
const readyOf = (b, u, type) => b.units.find((s) => s.reserveOf === u && s.def.id === type && s.dormant);
const megumi = {
  melee: true,
  init(u) {
    const w = u.def.weapon;
    skInit(u);
    u.nueCD = rand(2, 4); u.toadCD = rand(5, 8); u.eleCD = w.eleFirst * rand(0.8, 1.2); u.domCD = w.domFirst * rand(0.8, 1.2);
  },
  think(u, dt, c) {
    if (sealed(u)) { u.desired.set(0, 0, 0); return null; }
    if (u.jkMeguna) return skThink(u, dt, c);
    const r = meleeThink(u, dt, c);
    if (u.st.attack === u.anim && u.st.attackT === 0) u.jkTech = 'melee';
    return r;
  },
  control(u, dt, c) { return u.jkMeguna ? skControl(u, dt, c) : false; },
  event(u, t0, t1) {
    if (u.st.attack === 'jj_sign') { if (crossed(t0, t1, 0.55)) mgSummon(u, u.jkSign); return; }
    if (u.jkMeguna) skEvent(u, t0, t1);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.nueCD -= dt; u.toadCD -= dt; u.eleCD -= dt; u.domCD -= dt;
    // shikigami out for a while melt back into the shadows
    for (const s of b.units) {
      if (s.reserveOf !== u || !s.alive || s.dormant || s.jkLife === undefined || s.def.id === 'jk_mahoraga') continue;
      s.jkLife -= dt;
      if (s.jkLife <= 0) { shadowPool(b, s.pos, 1.2); dismiss(b, s); }
    }
    if (sealed(u) || b.over) return;
    if (u.jkMeguna) { skStep(u, dt); megunaStep(u, dt); return; }
    const t = u.target;
    // the ritual
    if (!u.jkRitual && u.hp < u.maxHp * w.ritualHp && readyOf(b, u, 'jk_mahoraga')) {
      u.jkRitual = true;
      if (Math.random() < TUNE.ritualChance) { ritual(u); return; }
    }
    // Chimera Shadow Garden
    if (u.domCD <= 0 && !burntOut(u) && u.stun <= 0.3 && !u.st.attack) {
      const n = enemiesIn(b, u, u.pos, w.domR * 0.85).length;
      if (n >= w.domMin && (u.hp < u.maxHp * 0.8 || n >= w.domMin + 2)) { u.domCD = w.domCD; openGarden(b, u); }
      else u.domCD = 0.5;
    }
    if (u.st.attack || u.stun > 0 || u.isDown() || !t || !t.alive || burntOut(u)) return;
    const dist = flat(t.pos, u.pos);
    if (dist < w.summonR && (readyOf(b, u, 'jk_dog_white') || readyOf(b, u, 'jk_dog_black'))) sign(u, 'dogs');
    else if (u.nueCD <= 0 && dist < w.summonR && readyOf(b, u, 'jk_nue')) sign(u, 'jk_nue');
    else if (u.toadCD <= 0 && dist < 15 && readyOf(b, u, 'jk_toad')) sign(u, 'jk_toad');
    else if (u.eleCD <= 0 && dist < 14 && readyOf(b, u, 'jk_elephant') && enemiesIn(b, u, t.pos, 5).length >= 3) sign(u, 'jk_elephant');
  },
  die(u) {
    // his shikigami melt away with him (Mahoraga stays: it answers to no one)
    const b = u.battle;
    for (const s of b.units) if (s.reserveOf === u && s.alive && !s.dormant && s.def.id !== 'jk_mahoraga') { shadowPool(b, s.pos, 1.2); dismiss(b, s); }
  },
};
function sign(u, type) {
  u.jkTech = 'sign'; u.jkSign = type;
  u.attackDur = 0.7;
  u.startAttack();
  u.st.attack = 'jj_sign';
  u.cooldown = Math.max(u.cooldown, 0.9);
}
function shadowPool(b, p, t) { markAt(b, 'jj_pool', _p.set(p.x, b.terrain.height(p.x, p.z) + 0.03, p.z), t); }
// bring a shikigami out of Megumi's shadow in front of him
function mgSummon(u, type, life = true) {
  const b = u.battle, w = MGW;
  u.released = true;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const types = type === 'dogs' ? ['jk_dog_white', 'jk_dog_black'] : [type];
  let n = 0;
  for (const ty of types) {
    const side = ty === 'jk_dog_black' ? -1 : 1, fwd = ty === 'jk_elephant' ? 3.2 : 1.8;
    const at = V(u.pos.x + fx * fwd - fz * side * (types.length > 1 ? 0.9 : 0), 0, u.pos.z + fz * fwd + fx * side * (types.length > 1 ? 0.9 : 0));
    const s = summon(b, u, ty, at, u.heading);
    if (!s) continue;
    n++;
    s.jkOwner = u;
    if (u.jkMeguna) teamRing(b, s);
    s.jkLife = !life ? undefined : ty === 'jk_nue' ? w.nueLife : ty === 'jk_toad' ? w.toadLife : ty === 'jk_elephant' ? w.eleLife : undefined;
    shadowPool(b, at, 1.3);
  }
  if (type === 'jk_nue') u.nueCD = w.nueCD;
  if (type === 'jk_toad') u.toadCD = w.toadCD;
  if (type === 'jk_elephant') u.eleCD = w.eleCD;
  if (n) {
    b.sound('whoosh', u.pos, 1.0, 0.4);
    b.sound('thump', u.pos, 0.7, 0.5);
    if (Math.random() < 0.7) b.voice(u, 'cry', true);
  }
  return n;
}
function openGarden(b, u) {
  const w = u.def.weapon;
  openDomain(b, u, {
    name: 'Chimera Shadow Garden', radius: w.domR, duration: w.domDur, power: w.domPow, tick: 0.4, marker: 'jk_garden', burnout: 5,
    sureHit(b, d, v) {
      // sinking into the shadows; now and then something bites from below
      v.stun = Math.max(v.stun, 0.5);
      const vel = v.rag.vel[PART.pelvis];
      if (!v.bc) v.rag.impulseAll(-vel.x * v.M * 0.2, -v.M * 0.6, -vel.z * v.M * 0.2);
      v.hit(w.gardenDmg, PART.pelvis, 0, 0, 0, u.alive ? u : null, 'domain');
      if (Math.random() < 0.22) {
        _d.set(0, 1, 0);
        strike(b, v, w.gardenBite, _d, Math.min(300, v.M * 4), u.alive ? u : null, 'domain', PART.thighL, 'crunch');
        shadowPool(b, v.pos, 0.8);
      }
    },
  });
}
// the ritual: with this treasure, I summon...
function ritual(u) {
  const b = u.battle;
  // an enemy Sukuna close by may take his body instead
  let sk = null;
  for (const v of b.teams[1 - u.team]) if (isA(v, 'jk_sukuna') && !sealed(v) && flat(v.pos, u.pos) < 16) { sk = v; break; }
  if (sk && Math.random() < TUNE.megunaChance) { meguna(b, sk, u); return; }
  sign(u, 'none');
  announce(b, 'With this treasure, I summon...', u.headPos);
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const at = V(u.pos.x + fx * 2.8, 0, u.pos.z + fz * 2.8);
  markerAt(b, 'jk_ritual', _p.set(at.x, b.terrain.height(at.x, at.z) + 0.04, at.z), 2.2, u.heading);
  b.sound('gong', u.pos, 1.2, 0.3);
  b.delayed.push([0.9, () => {
    const m = summon(b, u, 'jk_mahoraga', at, u.heading);
    if (!m) return;
    m.jkLife = MGW.ritualLife; // the ritual runs its course, then it is gone
    announce(b, 'Eight-Handled Sword Divergent Sila Divine General Mahoraga!', m.headPos);
    b.sound('boom', m.pos, 1.4, 0.4);
    b.emit('dust', m.pos.x, m.pos.y - 1, m.pos.z, 8);
    // its first blow is for the one who summoned it
    b.delayed.push([0.7, () => {
      if (!m.alive || !u.alive || u.jkMeguna) return;
      m.startAttack();
      const c = u.chestPos;
      _d.set(c.x - m.pos.x, 0.4, c.z - m.pos.z).normalize();
      u.hit(u.hp + 50, PART.chest, _d.x * 300, 200, _d.z * 300, m, 'jk_exterminate');
      u.rag.impulseAll(_d.x * u.M * 6, u.M * 4, _d.z * u.M * 6);
      markSpin(b, 'jj_cut', c, 0.3);
      b.emit('blood', c.x, c.y, c.z, 14, _d.x, _d.z);
      b.sound('slash', c, 1.4, 0.6);
    }]);
  }]);
}
// SECRET: Sukuna takes Megumi's body
export function meguna(b, sk, mg) {
  if (!sk || !mg || !sk.alive || !mg.alive || mg.jkMeguna) return false;
  const c = mg.chestPos;
  announce(b, 'SECRET: Meguna! Sukuna takes Megumi\'s body', mg.headPos);
  b.emit('spark', sk.chestPos.x, sk.chestPos.y, sk.chestPos.z, 16);
  b.emit('spark', c.x, c.y, c.z, 20);
  markAt(b, 'jj_flash', c, 0.4);
  b.sound('gong', c, 1.4, 0.25);
  b.sound('boom', c, 1.0, 0.5);
  // Sukuna's own body vanishes into him
  for (const t of b.teams) { const i = t.indexOf(sk); if (i >= 0) t.splice(i, 1); }
  park(sk);
  switchTeam(b, mg, sk.team);
  Object.assign(mg, { jkMeguna: true, jkAs: 'jk_meguna', jkRitual: true, jkFingers: sk.jkFingers || 15, jkPow: sk.jkPow || 1, jkPierce: !!sk.jkPierce });
  mg.maxHp = Math.max(mg.maxHp, SK_HP * 0.7);
  mg.hp = mg.maxHp;
  Object.assign(mg, { stun: 0, fled: false, fleeT: 0, target: null, cooldown: 0.3, fugaCD: 3, skDomCD: 2.5, expr: EXPR.happy });
  mg.st.attack = null;
  // tattoos, and an armband in his new colour
  markerOn(b, mg, 'jk_meguna_face', PART.head, 9999);
  markerOn(b, mg, 'jk_meguna_body', PART.chest, 9999);
  for (const p of [PART.farmL, PART.farmR]) markerOn(b, mg, 'jk_meguna_ink', p, 9999);
  markerOn(b, mg, 'jk_meguna_band' + mg.team, PART.uarmL, 9999);
  b.voice(mg, 'cry', true);
  // and all of Megumi's shikigami, for the new side
  for (const s of b.units) if (s.reserveOf === mg && !s.dormant && s.alive) switchTeam(b, s, mg.team);
  for (const s of b.units) if (s.reserveOf === mg) { s.jkLife = undefined; if (s.alive && !s.dormant) teamRing(b, s); }
  b.delayed.push([0.6, () => { if (mg.alive) for (const ty of SHIKI) mgSummon(mg, ty, false); }]);
  return true;
}
// a ring in the new side's colour over a shikigami that changed sides with Meguna
function teamRing(b, s) { if (!s.jkRing) s.jkRing = markerOn(b, s, 'jk_teamring' + s.team, PART.head, 9999, V(0, s.skel.rHead * 1.7, 0)); }
function megunaStep(u, dt) {
  const b = u.battle;
  // Sukuna calls Mahoraga against the Strongest (or when the vessel is failing)
  if (!u.jkMahoraga && readyOf(b, u, 'jk_mahoraga')) {
    const g = b.teams[1 - u.team].find((v) => isA(v, 'jk_gojo') && flat(v.pos, u.pos) < 24);
    if (g || u.hp < u.maxHp * 0.35) {
      u.jkMahoraga = true;
      const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      const at = V(u.pos.x + fx * 2.8, 0, u.pos.z + fz * 2.8);
      markerAt(b, 'jk_ritual', _p.set(at.x, b.terrain.height(at.x, at.z) + 0.04, at.z), 2, u.heading);
      const m = summon(b, u, 'jk_mahoraga', at, u.heading);
      if (m) teamRing(b, m);
      if (m) announce(b, g ? 'SECRET: Sukuna summons Mahoraga against the Strongest!' : 'Sukuna summons Mahoraga!', m.headPos);
    }
  }
}
const SK_HP = 1700;

// ------------------------------------------------------------------ Mahoraga
// adaptation numbers live on its weapon: adaptAt (harm of one kind per click), adaptStep
// (less harm per click), adaptMax; adaptTop caps what it can adapt to the Strongest
// and the King of Curses (they change their technique faster than the wheel turns)
function adaptKey(kind) {
  if (!kind || kind === 'melee') return 'melee';
  if (kind === 'blast' || kind === 'poison' || kind === 'domain' || kind === 'thorns') return kind;
  if (kind === 'burn' || kind === 'fire' || kind.includes('fire') || kind === 'jk_fuga') return 'fire';
  if (kind.includes('cut') || kind === 'jk_dismantle' || kind === 'jk_cleave') return 'cut';
  if (kind === 'jk_red' || kind === 'jk_blue' || kind.startsWith('jk_purple')) return 'limitless';
  return 'shot:' + kind;
}
const WHEEL_UP = 2.0; // wheel centre above the head centre, in head radii
const mahoraga = {
  melee: true,
  init(u) {
    ensureHitHook(u);
    Object.assign(u, { jkAdapt: {}, jkAdaptDmg: {}, jkClicks: 0, jkWheelA: 0, jkWheelT: 0, jkInfHits: 0, jkSeenAt: 0, jkSeenN: 0 });
    const hp = u.skel.parts[PART.head];
    u.jkWheel = u.addExtraBody(RAPIER.RigidBodyDesc.kinematicPositionBased(), [], V(0, hp.pos.y + hp.r * WHEEL_UP, 0), new THREE.Quaternion());
  },
  think: meleeThink,
  step(u, dt) {
    // summoned by the ritual: when it has run its course, Mahoraga leaves
    if (u.jkLife !== undefined && (u.jkLife -= dt) <= 0) {
      const b = u.battle;
      announce(b, 'The ritual ends: Mahoraga returns to the shadows', u.headPos, 'ritualEnd' + u.id);
      shadowPool(b, u.pos, 2);
      dismiss(b, u);
      return;
    }
    // Infinity stops its blows... until it has adapted (2 clicks): then it cuts through
    const st = u.st;
    if (st.attack && st.attackT < u.jkSeenAt) u.jkSeenN = 0;
    u.jkSeenAt = st.attack ? st.attackT : 0;
    if (!st.attack) { u.jkSeenN = 0; return; }
    let i = 0;
    for (const v of u.hitSet) {
      if (i++ < u.jkSeenN) continue;
      if (v.jkInfinity && !u.jkPierce) {
        u.jkInfHits++;
        if (u.jkInfHits % 2 === 0) adaptClick(u, 'infinity');
        if (u.jkInfHits >= 4) {
          u.jkPierce = true;
          announce(u.battle, 'SECRET: Mahoraga has adapted to Infinity!', u.headPos, 'mahoInf' + u.id);
        }
      }
    }
    u.jkSeenN = u.hitSet.size;
  },
  hit(u, amount, part, att, kind) {
    const w = u.def.weapon, k = adaptKey(kind);
    let r = u.jkAdapt[k] || 0;
    if (r > w.adaptTop && (isA(att, 'jk_gojo') || sukunaLike(att))) {
      r = w.adaptTop;
      announce(u.battle, isA(att, 'jk_gojo') ? 'SECRET: The Strongest hits harder than the wheel can turn' : 'SECRET: The King of Curses cuts faster than the wheel can turn', u.headPos, 'outpace' + u.id);
    }
    const a = amount * (1 - r);
    u.jkAdaptDmg[k] = (u.jkAdaptDmg[k] || 0) + a;
    if (u.jkAdaptDmg[k] >= w.adaptAt && (u.jkAdapt[k] || 0) < w.adaptMax) {
      u.jkAdaptDmg[k] = 0;
      u.jkAdapt[k] = Math.min(w.adaptMax, (u.jkAdapt[k] || 0) + w.adaptStep);
      adaptClick(u, k);
    }
    return a;
  },
  die(u, killer) {
    if (sukunaLike(killer)) announce(u.battle, 'SECRET: The King of Curses exorcises Mahoraga!', u.headPos, 'exorcise');
  },
};
function adaptClick(u, k) {
  const b = u.battle;
  u.jkClicks++;
  u.jkWheelT += Math.PI / 4;
  u.hp = Math.min(u.maxHp, u.hp + u.maxHp * u.def.weapon.adaptHeal); // it heals as it adapts
  const hp = u.skel.parts[PART.head];
  markerOn(b, u, 'jk_wheelflash', PART.head, 0.45, V(0, hp.r * WHEEL_UP, 0));
  const p = u.headPos;
  b.emit('spark', p.x, p.y + hp.r * WHEEL_UP, p.z, 6);
  b.sound('clang', p, 1.0, 0.45);
  b.sound('gong', p, 0.5, 0.9);
  if (u.jkClicks === 1) announce(b, 'The wheel turns: Mahoraga adapts', p, 'wheel' + u.id);
}
// the wheel rides over the head, turning by an eighth with each adaptation
function stepWheels(b, dt) {
  for (const u of b.units) {
    if (!u.jkWheel || u.dormant) continue;
    u.jkWheelA += clamp(u.jkWheelT - u.jkWheelA, -dt * 5, dt * 5);
    const hq = u.rag.quat[PART.head], r = u.skel.parts[PART.head].r;
    _p.set(0, r * WHEEL_UP, 0).applyQuaternion(hq).add(u.rag.pos[PART.head]);
    _q.setFromAxisAngle(_v.set(0, 0, 1), u.jkWheelA);
    placeExtra(u.jkWheel, _p, _q.premultiply(hq));
  }
}

// ------------------------------------------------------------------ shikigami
// Divine Dogs: fast biters
const dog = { melee: true, init() {}, think: meleeThink };
// Nue: flies over the fight and shocks whoever is below
const nue = {
  init(u) { u.zapCD = rand(0.5, 1.5); u.rag.impulseAll(0, u.M * 3, 0); },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, dirx, dirz } = c, spd = u.def.speed;
    u.expr = EXPR.angry;
    if (dist > 1.2) u.desired.set(dirx * spd, 0, dirz * spd);
    if (dist < 2.6 && u.zapCD <= 0 && u.stun <= 0.3) {
      u.zapCD = w.cooldown * rand(0.85, 1.15);
      const b = u.battle;
      for (const v of enemiesIn(b, u, t.pos, 1.8)) {
        _d.set(0, -1, 0);
        strike(b, v, w.damage, _d, Math.min(w.force, v.M * 4), u, 'jk_shock', PART.chest, null);
        if (v.parriedAt !== b.time) { v.stun = Math.max(v.stun, w.stun * (v.def.stagger ?? 1)); markerOn(b, v, 'jk_shock', PART.chest, 0.45); }
      }
      const p = u.pos;
      b.emit('spark', p.x, p.y - 0.4, p.z, 8);
      b.sound('clang', p, 0.8, 2.4);
      b.sound('crash', p, 0.4, 2.0);
      if (Math.random() < 0.5) b.voice(u, 'cry');
    }
    return t;
  },
  step(u, dt) {
    u.zapCD -= dt;
    if (u.stun > 0.3) { u.rag.impulseAll(0, u.M * 9.81 * 0.6 * dt, 0); u.st.gsFly = false; return; }
    hover(u, dt, u.def.weapon.alt, 5, 16);
    u.st.gsFly = true;
  },
};
// Toad: catches an enemy with its tongue and reels it in
const toad = {
  init(u) { u.attackDur = 0.6; u.tongue = null; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, gap, dirx, dirz, spd } = c, b = u.battle;
    u.expr = EXPR.normal;
    if (u.tongue) { u.desired.set(0, 0, 0); return u.tongue.v; }
    if (dist > w.range * 0.8) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (gap < 1.5) u.desired.set(-dirx * spd * 0.5, 0, -dirz * spd * 0.5);
    if (u.cooldown <= 0 && u.stun <= 0 && !u.isDown()) {
      // prefer a shooter at the back
      let v = t;
      for (const o of b.teams[1 - u.team]) if (o.alive && o.def.weapon.kind !== 'melee' && flat(o.pos, u.pos) < w.range && !o.bc && o.s < 1.6) { v = o; break; }
      if (flat(v.pos, u.pos) < w.range && !v.bc) {
        u.cooldown = w.cooldown * rand(0.85, 1.15);
        u.tongue = { v, t: 0, beam: {} };
        b.sound('whoosh', u.headPos, 0.8, 1.6);
        if (Math.random() < 0.5) b.voice(u, 'cry');
      }
    }
    return t;
  },
  step(u, dt) {
    const g = u.tongue;
    if (!g) return;
    const b = u.battle, w = u.def.weapon, v = g.v;
    g.t += dt;
    const A = _o.copy(u.headPos), hd = u.skel.parts[PART.head].r;
    A.x += Math.sin(u.heading) * hd; A.z += Math.cos(u.heading) * hd; A.y -= hd * 0.3;
    const out = Math.min(1, g.t / 0.2);
    _p.lerpVectors(A, v.chestPos, out);
    if (!v.alive || g.t > w.pullT + 0.2 || u.stun > 0.3 || u.isDown() || A.distanceTo(v.chestPos) > w.range + 3) { endBeam(g.beam); u.tongue = null; return; }
    refreshBeam(b, g.beam, u, A, _p, 'jk_tongue', 0.45);
    if (out < 1) return;
    if (!g.hit) {
      g.hit = true;
      if (enemyOf(u, v)) v.hit(w.damage, PART.chest, 0, 0, 0, u, 'jk_tongue');
      b.sound('stab', v.chestPos, 0.7, 1.6);
    }
    // reel it in
    const c = v.chestPos, d = A.distanceTo(c);
    if (d < 1.4) { endBeam(g.beam); u.tongue = null; return; }
    v.stun = Math.max(v.stun, 0.3);
    const k = w.pull * dt * v.M * clamp(d / 3, 0.4, 1);
    v.rag.impulseAll((A.x - c.x) / d * k, v.M * 2.5 * dt, (A.z - c.z) / d * k);
  },
  die(u) { if (u.tongue) { endBeam(u.tongue.beam); u.tongue = null; } },
};
// Max Elephant: floods the field in front of it
const elephant = {
  init(u) { u.attackDur = 1.0; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, gap, dirx, dirz, spd } = c;
    u.expr = EXPR.angry;
    if (gap > w.range * 0.6) u.desired.set(dirx * spd, 0, dirz * spd);
    if (dist < w.range && u.cooldown <= 0 && !u.st.attack && u.stun <= 0 && !u.isDown()) u.startAttack();
    if (u.st.attack) u.desired.multiplyScalar(0.2);
    return t;
  },
  event(u, t0, t1) {
    if (!crossed(t0, t1, 0.55)) return;
    const b = u.battle, w = u.def.weapon;
    u.released = true;
    const h = u.heading, hp = u.headPos;
    const set = new Set();
    for (let i = 0; i < 7; i++) {
      const a = h + (i - 3) * 0.13;
      _o.set(hp.x + Math.sin(a) * 1.2, b.terrain.height(hp.x, hp.z) + 0.6, hp.z + Math.cos(a) * 1.2);
      _v.set(Math.sin(a) * w.speed, 0, Math.cos(a) * w.speed);
      addProjectile(b, 'jk_water', _o, _v, u, { life: w.range / w.speed, hits: set, spin: new THREE.Vector3(0, 0, 0) });
    }
    b.sound('crash', hp, 0.8, 0.5);
    b.sound('whoosh', hp, 1.0, 0.4);
    b.voice(u, 'cry', true);
  },
};

// ------------------------------------------------------------------ projectiles
function redBurst(b, pr) {
  const p = pr.pos;
  blast(b, p, pr.blast, pr.damage, pr.force, pr.owner, { fx: -1, friendly: 0, sound: 'boom', pitch: 0.8 });
  markAt(b, 'jk_redburst', p, 0.35);
  b.emit('spark', p.x, p.y, p.z, 10);
  b.emit('dust', p.x, b.terrain.height(p.x, p.z), p.z, 4);
}
function fugaBurst(b, pr) {
  const p = pr.pos, o = pr.owner;
  blast(b, p, pr.blast, pr.damage, pr.force, o, { fx: 2, friendly: 0.3, sound: 'boom', pitch: 0.7, onUnit: (v) => addStatus(b, v, 'burn', 4, SKW.fugaBurn, o) });
  markAt(b, 'jk_fugaburst', _p.set(p.x, b.terrain.height(p.x, p.z), p.z), 0.8);
  b.sound('fire', p, 1.2, 0.7);
}
function purpleStep(b, pr) {
  const R = pr.R, gy = b.terrain.height(pr.pos.x, pr.pos.z);
  if (pr.pos.y < gy + 1.0) { pr.pos.y = gy + 1.0; pr.vel.y = Math.max(0, pr.vel.y); }
  b.grid.query(pr.pos.x, pr.pos.z, R + 2, (v) => {
    if (!enemyOf(pr, v) || pr.hits.has(v)) return;
    const c = v.chestPos;
    _o.copy(c).sub(pr.prev);
    _v.copy(pr.pos).sub(pr.prev);
    const L2 = _v.lengthSq(), k = L2 > 1e-9 ? clamp(_o.dot(_v) / L2, 0, 1) : 0;
    _o.copy(pr.prev).addScaledVector(_v, k);
    if (_o.distanceTo(c) > R + v.skel.radius) return;
    pr.hits.add(v);
    _d.copy(pr.vel).normalize(); _d.y = 0.5; _d.normalize();
    strike(b, v, pr.damage, _d, Math.min(pr.force, v.M * 16), pr.owner, pr.type, PART.chest, 'crunch');
    if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 1.5 * (v.def.stagger ?? 1));
    b.emit('spark', c.x, c.y, c.z, 5);
  });
  if (Math.random() < 0.6) b.emit('spark', pr.pos.x + rand(-R, R) * 0.5, pr.pos.y + rand(-R, R) * 0.5, pr.pos.z + rand(-R, R) * 0.5, 0.6);
  if (pr.pos.y - gy < R + 0.6 && Math.random() < 0.5) b.emit('dust', pr.pos.x, gy, pr.pos.z, 1.5);
}
const PJ = {
  jk_red: { g: 0, len: 0, r: 0.35, life: 3, hit(b, pr) { redBurst(b, pr); return true; }, ground(b, pr) { redBurst(b, pr); return true; } },
  jk_blue: {
    g: 0, len: 0, r: 0.4, life: 4,
    step(b, pr, dt) {
      const gy = b.terrain.height(pr.pos.x, pr.pos.z);
      if (pr.pos.y < gy + 0.8) pr.pos.y = gy + 0.8;
      if (!pr.pulling && (pr.pos.distanceTo(pr.goal) < 0.6 || pr.life <= pr.pullT)) { pr.pulling = true; pr.vel.set(0, 0, 0); b.sound('magic', pr.pos, 0.9, 0.4); }
      if (!pr.pulling) return;
      const R = pr.owner.def.weapon.blueR || 4.5;
      pr.tickT -= dt;
      const tick = pr.tickT <= 0;
      if (tick) pr.tickT = 0.3;
      b.grid.query(pr.pos.x, pr.pos.z, R + 1, (v) => {
        if (!enemyOf(pr, v)) return;
        const c = v.chestPos, d = c.distanceTo(pr.pos);
        if (d > R || d < 0.05) return;
        if (v.jkInfinity && !(pr.owner && pr.owner.jkPierce)) return;
        const k = v.M * 14 * dt * clamp(d / 2, 0.3, 1) / Math.max(1, v.s);
        v.rag.impulseAll((pr.pos.x - c.x) / d * k, (pr.pos.y - c.y) / d * k * 0.5 + v.M * 4 * dt, (pr.pos.z - c.z) / d * k);
        v.stun = Math.max(v.stun, 0.35);
        if (tick) v.hit(pr.damage, PART.chest, 0, 0, 0, pr.owner, 'jk_blue');
      });
      if (pr.life < 0.05) { b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 8); b.sound('thump', pr.pos, 0.9, 0.6); }
    },
    hit: () => false, ground: () => false,
  },
  jk_purple: { g: 0, len: 0, r: 1.2, life: 5, step: purpleStep, hit: () => false, ground: () => false },
  jk_purple2: { g: 0, len: 0, r: 1.8, life: 5, step: purpleStep, hit: () => false, ground: () => false },
  jk_fuga: { g: 0, len: 1.4, r: 0.25, life: 3, hit(b, pr) { fugaBurst(b, pr); return true; }, ground(b, pr) { fugaBurst(b, pr); return true; }, step(b, pr) { if (Math.random() < 0.7) b.emit('trail', pr.pos.x, pr.pos.y, pr.pos.z, 1); } },
  jk_water: {
    g: 0, len: 0, r: 0.6, life: 2,
    step(b, pr) {
      pr.pos.y = b.terrain.height(pr.pos.x, pr.pos.z) + 0.6;
      if (Math.random() < 0.3) b.emit('dust', pr.pos.x, pr.pos.y - 0.5, pr.pos.z, 0.6);
      b.grid.query(pr.pos.x, pr.pos.z, 2, (v) => {
        if (!enemyOf(pr, v) || pr.hits.has(v) || flat(v.pos, pr.pos) > 1.0 + v.skel.radius) return;
        pr.hits.add(v);
        _d.copy(pr.vel).normalize(); _d.y = 0.35;
        strike(b, v, pr.damage, _d, Math.min(pr.force, v.M * 9), pr.owner, 'jk_water', PART.chest, null);
        if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 1.0 * (v.def.stagger ?? 1));
        b.sound('thump', v.chestPos, 0.6, 1.2);
      });
    },
    hit: () => false, ground: () => false,
  },
  // markers
  jk_redburst: { g: 0, len: 0, r: 0, life: 1 },
  jk_handblue: { g: 0, len: 0, r: 0, life: 1 },
  jk_handred: { g: 0, len: 0, r: 0, life: 1 },
  jk_inf: { g: 0, len: 0, r: 0, life: 1 },
  jk_awake: { g: 0, len: 0, r: 0, life: 1 },
  jk_overload: { g: 0, len: 0, r: 0, life: 1 },
  jk_void: { g: 0, len: 0, r: 0, life: 1 },
  jk_shrine: { g: 0, len: 0, r: 0, life: 1 },
  jk_garden: { g: 0, len: 0, r: 0, life: 1 },
  jk_firebow: { g: 0, len: 0, r: 0, life: 1 },
  jk_fugaburst: { g: 0, len: 0, r: 0, life: 1 },
  jk_ritual: { g: 0, len: 0, r: 0, life: 1 },
  jk_wheelflash: { g: 0, len: 0, r: 0, life: 1 },
  jk_shock: { g: 0, len: 0, r: 0, life: 1 },
  jk_tongue: { g: 0, len: 0, r: 0, life: 1 },
  jk_meguna_face: { g: 0, len: 0, r: 0, life: 1 },
  jk_meguna_body: { g: 0, len: 0, r: 0, life: 1 },
  jk_meguna_ink: { g: 0, len: 0, r: 0, life: 1 },
  jk_meguna_band0: { g: 0, len: 0, r: 0, life: 1 },
  jk_teamring0: { g: 0, len: 0, r: 0, life: 1 },
  jk_teamring1: { g: 0, len: 0, r: 0, life: 1 },
  jk_meguna_band1: { g: 0, len: 0, r: 0, life: 1 },
};

// ------------------------------------------------------------------ units
const UNIFORM = '#1b1d2a';
const SUMMON = 'jjk_shiki'; // shikigami: not a shop faction (they come from Megumi's shadow)
const MEGUMI_BUILD = { scale: 1.0, girth: 0.92, legs: 1.04 };
const units = [
  {
    id: 'jk_gojo', name: 'Satoru Gojo', faction: 'jjk', side: 'sorcerer', cost: 6000, hp: 900, speed: 5.0,
    build: { scale: 1.16, girth: 0.86, legs: 1.25, arms: 1.08 },
    weapon: {
      line: 'Hero · Infinity · Red blasts, Blue drags, Hollow Purple erases a line · Domain: Unlimited Void', kind: 'jk_gojo', style: 'jj_pockets', anim: 'jk_flick', item: 'none',
      damage: 60, speed: 18, range: 22, minRange: 3, cooldown: 2.4, force: 850, windup: 0.8, releaseAt: 0.55, blast: 2.4,
      blueCD: 7, blueR: 4.5, blueDmg: 7, blueT: 1.6, blueSpeed: 16,
      purpleCD: 15, purpleFirst: 9, purpleDmg: 200, purpleR: 1.4, purpleSpeed: 11, purpleWind: 1.8,
      infUp: 6, infDown: 2.8, awakeAt: 0.4, rct: 0.3, blinkCD: 12, blinkR: 2.5, blinkD: 7, rise: 0.2,
      domR: VOID_R, domPow: 12, domDur: 3.5, domCD: 26, domFirst: 8, domMin: 6, voidDmg: 20, voidSplit: 1, burnout: 3,
    },
    look: { skin: '#f4d8c4', hat: 'jk_gojo_hair', top: 'jk_gojo_uniform', legs: UNIFORM, accent: '#141418' },
    personality: { aggro: 0.6, bravery: 0, voice: 1.05, chatter: 1.0, cry: 'la', idle: 'regal' },
    armor: 0.05, stagger: 0.45,
    desc: 'The Strongest. Nothing reaches him through Infinity - except in the gaps. "Nah, I\'d win."',
  },
  {
    id: 'jk_sukuna', name: 'Ryomen Sukuna', faction: 'jjk', side: 'curse', cost: 3300, hp: SK_HP, speed: 4.9,
    build: { scale: 1.12, girth: 1.0, arms: 1.05, armThick: 1.1 },
    weapon: {
      line: 'Boss · Dismantle and Cleave cut unseen · Fuga fire arrow · Domain: Malevolent Shrine (no barrier)', kind: 'jk_sukuna', style: 'jj_king', anim: 'dual', item: 'none',
      damage: 38, range: 7, cooldown: 1.5, force: 380, cuts: 4, cleaveDmg: 50, cleaveK: 0.06, cleaveMax: 180,
      fugaCD: 16, fugaFirst: 8, fugaDmg: 130, fugaBlast: 4, fugaSpeed: 24, fugaRange: 24, fugaBurn: 14,
      domR: SHRINE_R, domPow: 10, domDur: 4.5, domCD: 28, domFirst: 9, domMin: 3, shrineDmg: 11, shrineTick: 0.35, allyK: 0.35,
    },
    look: { skin: '#eebd9e', hat: 'jk_sukuna_hair', top: 'jk_sukuna_kimono', legs: '#ece6d6', accent: '#1a1418' },
    personality: { aggro: 0.95, bravery: 0, voice: 0.6, chatter: 0.9, cry: 'cackle', idle: 'regal' },
    armor: 0.1, stagger: 0.3,
    desc: 'The King of Curses. Cuts you without moving a finger - and he has fifteen of them. So far.',
  },
  {
    id: 'jk_megumi', name: 'Megumi Fushiguro', faction: 'jjk', side: 'sorcerer', cost: 1200, hp: 380, speed: 5.1,
    build: MEGUMI_BUILD,
    reserve: [{ type: 'jk_dog_white' }, { type: 'jk_dog_black' }, { type: 'jk_nue' }, { type: 'jk_toad' }, { type: 'jk_elephant' }, { type: 'jk_mahoraga' }],
    weapon: {
      line: 'Summoner · Ten Shadows: Divine Dogs, Nue, Toad, Max Elephant · Domain: Chimera Shadow Garden · the Mahoraga ritual', kind: 'jk_megumi', style: 'jj_sign', anim: 'overhead', item: 'jk_shadow_blade',
      damage: 34, reach: 1.1, cooldown: 1.0, force: 260,
      summonR: 22, nueLife: 14, nueCD: 12, toadLife: 12, toadCD: 14, eleLife: 9, eleCD: 22, eleFirst: 8,
      domR: GARDEN_R, domPow: 4, domDur: 6, domCD: 30, domFirst: 10, domMin: 3, gardenDmg: 5, gardenBite: 22, ritualHp: 0.3, ritualLife: 20,
    },
    look: { skin: '#f0d0b8', hat: 'jk_megumi_hair', top: 'jk_megumi_uniform', legs: UNIFORM, accent: '#121218' },
    personality: { aggro: 0.55, bravery: 0, voice: 0.95, chatter: 0.5, cry: 'magic', idle: 'brace' },
    desc: 'Ten Shadows: his shikigami climb out of his shadow. If it all goes wrong, there is always the ritual.',
  },
  {
    id: 'jk_mahoraga', name: 'Mahoraga', faction: 'jjk', side: 'curse', cost: 2600, hp: 1500, speed: 4.7,
    build: { scale: 1.75, girth: 1.12, head: 0.95, arms: 1.12, armThick: 1.35, legs: 1.05, mass: 1.3 },
    weapon: {
      line: 'Divine General · Sword of Extermination · adapts: every kind of harm turns the wheel and hurts it less', kind: 'jk_mahoraga', style: 'jk_blade', anim: 'overhead', item: 'jk_exterminate',
      damage: 115, reach: 1.9, cooldown: 1.5, force: 900, sweep: true,
      adaptAt: 140, adaptStep: 0.3, adaptMax: 0.85, adaptTop: 0.2, adaptHeal: 0.03,
    },
    look: { skin: '#ebe6da', hat: 'jk_mahoraga_head', top: 'jk_mahoraga_body', legs: '#3a3a40', accent: '#d8d2c4' },
    personality: { aggro: 1, bravery: 0, voice: 0.4, chatter: 0.25, cry: 'roar', idle: 'thump' },
    armor: 0.1, stagger: 0.2,
    desc: 'Eight-Handled Sword Divergent Sila Divine General Mahoraga. Hit it once, fine. Hit it the same way again...',
  },
  // the shikigami (summoned from Megumi's shadow; not sold in the shop)
  {
    id: 'jk_dog_white', name: 'Divine Dog (White)', faction: SUMMON, cost: 120, hp: 170, speed: 7.2,
    build: { scale: 0.85, girth: 1.05, head: 1.2, legs: 0.85, arms: 1.15 },
    weapon: { line: 'Shikigami · fast biter', kind: 'jk_dog', style: 'jk_dog', anim: 'punch', item: 'jk_fangs', damage: 24, reach: 0.9, cooldown: 0.75, force: 220 },
    look: { skin: '#f2f2ee', hat: 'jk_dog_head_w', top: 'jk_fur_w', legs: '#e8e8e2', accent: '#d8d8d0' },
    personality: { aggro: 1, bravery: 0, voice: 1.5, chatter: 0.8, cry: 'yip', idle: 'bounce' },
    desc: 'Megumi\'s white Divine Dog. A good boy, unless you are the enemy.',
  },
  {
    id: 'jk_dog_black', name: 'Divine Dog (Black)', faction: SUMMON, cost: 120, hp: 170, speed: 7.2,
    build: { scale: 0.85, girth: 1.05, head: 1.2, legs: 0.85, arms: 1.15 },
    weapon: { line: 'Shikigami · fast biter', kind: 'jk_dog', style: 'jk_dog', anim: 'punch', item: 'jk_fangs', damage: 24, reach: 0.9, cooldown: 0.75, force: 220 },
    look: { skin: '#24242a', hat: 'jk_dog_head_b', top: 'jk_fur_b', legs: '#202024', accent: '#18181c' },
    personality: { aggro: 1, bravery: 0, voice: 1.4, chatter: 0.8, cry: 'yip', idle: 'bounce' },
    desc: 'Megumi\'s black Divine Dog. Bites first, sniffs later.',
  },
  {
    id: 'jk_nue', name: 'Nue', faction: SUMMON, cost: 260, hp: 150, speed: 6.5,
    build: { scale: 0.95, girth: 0.95, legs: 0.8 },
    weapon: { line: 'Shikigami · flies, shocks whoever is below', kind: 'jk_nue', style: 'jk_wings', anim: 'punch', item: 'none', damage: 30, cooldown: 2.2, force: 200, stun: 1.0, alt: 3.2 },
    look: { skin: '#e8e4dc', hat: 'jk_nue_head', top: 'jk_nue_body', legs: '#3a3640', accent: '#e0b030' },
    personality: { aggro: 1, bravery: 0, voice: 1.8, chatter: 0.6, cry: 'yip', idle: 'float' },
    desc: 'A masked owl of shadow. Flies over the fight and drops lightning on it.',
  },
  {
    id: 'jk_toad', name: 'Toad', faction: SUMMON, cost: 200, hp: 260, speed: 3.6,
    build: { scale: 0.9, girth: 1.6, head: 1.5, legs: 0.6, arms: 0.85, mass: 1.2 },
    weapon: { line: 'Shikigami · tongue grabs a shooter and reels it in', kind: 'jk_toad', style: 'jk_toad', anim: 'punch', item: 'none', damage: 16, range: 11, cooldown: 4, force: 100, pull: 34, pullT: 1.4 },
    look: { skin: '#3a3f46', hat: 'jk_toad_head', top: 'jk_toad_body', legs: '#343940', accent: '#2a2e34' },
    personality: { aggro: 0.6, bravery: 0, voice: 0.5, chatter: 0.5, cry: 'roar', idle: 'thump' },
    desc: 'Ribbit. Its tongue drags archers out of the back row.',
  },
  {
    id: 'jk_elephant', name: 'Max Elephant', faction: SUMMON, cost: 700, hp: 900, speed: 3.4,
    build: { scale: 1.9, girth: 1.45, head: 1.25, legs: 0.85, arms: 1.0, armThick: 1.6, mass: 1.4 },
    weapon: { line: 'Shikigami · floods the field in front of it', kind: 'jk_elephant', style: 'none', anim: 'jj_shout', item: 'none', damage: 30, range: 10, cooldown: 3.6, force: 900, speed: 9 },
    look: { skin: '#8d97a8', hat: 'jk_ele_head', top: 'jk_ele_body', legs: '#7e8798', accent: '#6e7788' },
    personality: { aggro: 0.8, bravery: 0, voice: 0.35, chatter: 0.4, cry: 'roar', idle: 'thump' },
    armor: 0.15, stagger: 0.3,
    desc: 'Very big, very heavy, and full of water.',
  },
];
SKW = units[1].weapon;
MGW = units[2].weapon;
const MG_SKEL = makeSkeleton(MEGUMI_BUILD);

// ------------------------------------------------------------------ visuals
// spiky hair: n cones fanned over the scalp
function spikes(H, g, r, m, n, len, upK = 0.5, seed = 1, w = 0.2, faceClear = true) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed, el = 0.35 + ((i * 7 + seed * 3) % 5) / 5 * 0.9;
    const dx = Math.sin(a) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(a) * Math.cos(el) - 0.35;
    if (faceClear && dz > 0.45 && dy < 0.75) continue;
    const dir = new THREE.Vector3(dx, dy + upK, dz).normalize();
    const L = r * len * (0.8 + ((i * 5) % 3) * 0.15);
    const c = H.mesh(H.cone(r * w, L, 5), m, dir.x * r * 0.8, dir.y * r * 0.8 + r * 0.1, dir.z * r * 0.8, g);
    c.quaternion.setFromUnitVectors(UPY, dir);
    c.position.addScaledVector(dir, L * 0.4);
  }
}
function hairCap(H, g, r, m, k = 1.07, frac = 0.36, tilt = -0.35) {
  const c = H.mesh(dome(H, r * k, frac), m, 0, r * 0.04, -r * 0.05, g);
  c.rotation.x = tilt;
  return c;
}
// a spike in a given direction from the head centre
function spike(H, g, r, m, dir, len, w) {
  const d = dir.clone().normalize();
  const c = H.mesh(H.cone(r * w, r * len, 5), m, d.x * r * 0.85, d.y * r * 0.85, d.z * r * 0.85, g);
  c.quaternion.setFromUnitVectors(UPY, d);
  c.position.addScaledVector(d, r * len * 0.4);
  return c;
}

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, cone, sphere, mat, glow } = H;
  if (name === 'jk_shadow_blade') { // a short straight blade drawn from his shadow
    const blk = mat('#16141e', { spec: 0.6 });
    mesh(cyl(0.025 * s, 0.028 * s, 0.2 * s, 8), mat('#2a2a34'), 0, 0.02 * s, 0, g);
    mesh(box(0.13 * s, 0.025 * s, 0.05 * s), tcol(H, team), 0, 0.13 * s, 0, g);
    mesh(box(0.045 * s, 0.6 * s, 0.012 * s), blk, 0, 0.45 * s, 0, g);
    mesh(cone(0.032 * s, 0.1 * s, 4), blk, 0, 0.8 * s, 0, g).scale.set(1, 1, 0.3);
    const wisp = mesh(box(0.06 * s, 0.55 * s, 0.02 * s), mat('#5a3a9a', { emit: 0.7, transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.45 * s, 0, g); wisp.castShadow = false;
    return true;
  }
  if (name === 'jk_fangs') return true; // (the dog bites with its head: decorate)
  if (name === 'jk_exterminate') { // the Sword of Extermination, along the forearm and past the fist
    const steel = mat('#7c8894', { spec: 1 }), edge = mat('#dfe6ee', { spec: 1 }), gold = mat('#d8b04a', { spec: 1 });
    mesh(cyl(0.06 * s, 0.07 * s, 0.22 * s, 10), gold, 0, -0.02 * s, 0, g);
    mesh(box(0.2 * s, 0.05 * s, 0.09 * s), gold, 0, 0.1 * s, 0, g);
    mesh(box(0.1 * s, 1.0 * s, 0.03 * s), steel, 0, 0.62 * s, 0, g);
    for (const sd of [-1, 1]) mesh(box(0.025 * s, 1.0 * s, 0.018 * s), edge, sd * 0.06 * s, 0.62 * s, 0, g);
    mesh(cone(0.07 * s, 0.2 * s, 4), edge, 0, 1.22 * s, 0, g).scale.set(1, 1, 0.25);
    mesh(box(0.025 * s, 0.9 * s, 0.04 * s), gold, 0, 0.6 * s, 0, g); // a gold line down the middle
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'jk_gojo_hair': { // a crown of white spikes, a black blindfold over the eyes
      const hair = mat('#f4f5fa', { spec: 0.35 });
      hairCap(H, g, r, hair, 1.09, 0.4, -0.2);
      for (let ring = 0; ring < 3; ring++) {
        const n = [11, 8, 5][ring], el = [0.5, 0.9, 1.3][ring];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring * 0.4;
          const dir = new THREE.Vector3(Math.sin(a) * Math.cos(el), Math.sin(el) + 0.35, Math.cos(a) * Math.cos(el) - 0.1);
          spike(H, g, r, hair, dir, [1.35, 1.45, 1.3][ring], 0.27);
        }
      }
      // the fringe sweeps up off the blindfold
      for (let i = -2; i <= 2; i++) { const c = mesh(cone(r * 0.2, r * 0.95, 5), hair, i * r * 0.22, r * 0.95, r * 0.5, g); c.rotation.x = -0.35; c.rotation.z = -i * 0.18; }
      headBand(H, r, 0.12, 0.46, mat('#121216', { spec: 0.25 }), g, 0.07);
      const knot = mesh(sphere(r * 0.13, 8, 6), mat('#121216'), 0, r * 0.12, -r * 1.05, g); void knot;
      return true;
    }
    case 'jk_sukuna_hair': { // pink hair swept up and back over a dark undercut; tattoos, extra eyes
      const pink = mat('#f0a0b4', { spec: 0.2 }), under = mat('#3a2a2e', { spec: 0.1 }), ink = mat('#121014');
      for (const sd of [-1, 1]) { const u = mesh(sphere(r * 1.03, 14, 10), under, sd * r * 0.06, r * 0.12, -r * 0.12, g); u.scale.set(1, 0.6, 0.85); } // the undercut on the sides
      hairCap(H, g, r, pink, 1.12, 0.32, -0.3);
      // swept up and back
      for (let i = 0; i < 13; i++) {
        const x = ((i % 5) - 2) * 0.24, row = Math.floor(i / 5);
        spike(H, g, r, pink, V(x, 0.95 - row * 0.2, -0.3 - row * 0.5), 1.45 - row * 0.2, 0.3);
      }
      for (let i = -2; i <= 2; i++) { const c = mesh(cone(r * 0.22, r * 1.0, 5), pink, i * r * 0.22, r * 1.0, r * 0.3, g); c.rotation.x = -0.75; c.rotation.z = -i * 0.15; }
      // two marks under each eye, a band on the brow
      for (const sd of [-1, 1]) {
        for (const [y, w, a] of [[-0.5, 0.34, 0.25], [-0.64, 0.28, 0.25]]) {
          const z = Math.sqrt(Math.max(0.05, 1 - y * y - 0.2)) * r * 1.02;
          const l = mesh(box(r * w, r * 0.11, r * 0.06), ink, sd * r * 0.45, y * r, z, g);
          l.rotation.set(0, sd * 0.45, sd * a);
        }
        // the second pair of eyes, just under the first
        const ex = sd * r * 0.36, ey = -r * 0.33, ez = r * 0.9;
        const eye = mesh(sphere(r * 0.12, 10, 8), mat('#f4ecdc'), ex, ey, ez, g); eye.scale.set(1.4, 0.6, 0.5); eye.rotation.y = sd * 0.5;
        mesh(sphere(r * 0.055, 8, 6), mat('#c01020'), ex + sd * r * 0.01, ey, ez + r * 0.05, g);
      }
      mesh(box(r * 0.5, r * 0.07, r * 0.04), ink, 0, r * 0.55, r * 0.86, g);
      return true;
    }
    case 'jk_megumi_hair': { // a big shock of black spikes in every direction
      const hair = mat('#14141c', { spec: 0.25 });
      hairCap(H, g, r, hair, 1.09, 0.42, -0.25);
      spikes(H, g, r, hair, 24, 1.4, 0.75, 1.3, 0.27);
      spikes(H, g, r, hair, 14, 1.05, 0.25, 2.6, 0.25);
      for (let i = -2; i <= 2; i++) { const c = mesh(cone(r * 0.14, r * 0.5, 5), hair, i * r * 0.21, r * 0.72, r * 0.6, g); c.rotation.x = 0.9 + Math.abs(i) * 0.1; c.rotation.z = -i * 0.25; } // fringe falls over the brow
      return true;
    }
    case 'jk_mahoraga_head': { // four white wings over the eyes; a heavy brow; the mouth
      g.userData.hidesFace = true;
      const pale = mat('#ebe6da', { spec: 0.2 }), wing = mat('#f6f3ea', { spec: 0.15 }), dark = mat('#2a2628');
      for (const sd of [-1, 1]) {
        for (const [y, k, tilt] of [[0.25, 1.0, 0.45], [-0.1, 0.8, -0.15]]) {
          // a wing over the eye: feathers fanning out sideways from the face
          const wg = new THREE.Group(); g.add(wg);
          wg.position.set(sd * r * 0.25, y * r, r * 0.8);
          wg.rotation.set(0, -sd * 0.35, sd * tilt);
          for (let f = 0; f < 5; f++) {
            const L = r * (1.5 - f * 0.18) * k;
            const fe = mesh(capsule(r * 0.13 * k, L), wing, sd * L * 0.45, f * r * 0.1 * k, -f * r * 0.06, wg);
            fe.rotation.z = sd * (Math.PI / 2 - f * 0.16);
            fe.scale.set(1, 1, 0.5);
          }
        }
      }
      mesh(box(r * 0.5, r * 0.07, r * 0.05), dark, 0, -r * 0.5, r * 0.88, g); // mouth
      for (const sd of [-1, 1]) mesh(sphere(r * 0.3, 10, 8), pale, sd * r * 0.75, -r * 0.35, r * 0.4, g).scale.set(0.6, 0.8, 0.8); // cheeks
      return true;
    }
    case 'jk_dog_head_w': case 'jk_dog_head_b': {
      g.userData.hidesFace = true;
      const white = kind === 'jk_dog_head_w';
      const fur = mat(white ? '#f2f2ee' : '#24242a', { spec: 0.15 }), dark = mat(white ? '#c8c8c0' : '#121216'), nose = mat('#141414');
      mesh(sphere(r * 1.08, 14, 10), fur, 0, 0, 0, g).scale.set(1, 0.95, 1.05);
      const sn = mesh(capsule(r * 0.45, r * 1.1), fur, 0, -r * 0.2, r * 1.2, g); sn.rotation.x = Math.PI / 2;
      mesh(sphere(r * 0.2, 8, 6), nose, 0, -r * 0.02, r * 2.05, g);
      const jaw = mesh(capsule(r * 0.32, r * 0.8), dark, 0, -r * 0.55, r * 1.05, g); jaw.rotation.x = Math.PI / 2 + 0.25;
      for (let i = -1; i <= 1; i += 2) mesh(cone(r * 0.07, r * 0.22, 4), mat('#f8f4ea'), i * r * 0.26, -r * 0.48, r * 1.7, g).rotation.x = Math.PI;
      for (const sd of [-1, 1]) {
        const ear = mesh(cone(r * 0.3, r * 0.95, 4), fur, sd * r * 0.55, r * 0.95, -r * 0.05, g); ear.rotation.z = -sd * 0.3;
        mesh(sphere(r * 0.15, 8, 6), mat('#f6e070', { emit: 0.4 }), sd * r * 0.38, r * 0.2, r * 0.88, g);
        mesh(sphere(r * 0.08, 6, 5), nose, sd * r * 0.4, r * 0.2, r * 1.0, g);
        // the shikigami marks on the brow
        mesh(box(r * 0.3, r * 0.06, r * 0.04), mat(white ? '#3a3a44' : '#d8d8d0'), sd * r * 0.35, r * 0.48, r * 0.92, g).rotation.z = sd * 0.35;
      }
      mesh(torus(H, r * 0.75, r * 0.1, Math.PI * 2, 14), tc, 0, -r * 0.75, 0, g).rotation.x = Math.PI / 2; // team collar
      return true;
    }
    case 'jk_nue_head': { // an owl with a pale human-like mask and feathered horns
      g.userData.hidesFace = true;
      const feather = mat('#2a2830', { spec: 0.15 }), mask = mat('#f2eee2', { spec: 0.3 }), gold = mat('#e0b030', { spec: 0.6 });
      mesh(sphere(r * 1.1, 14, 10), feather, 0, 0, -r * 0.1, g);
      const m = mesh(sphere(r * 0.95, 14, 10), mask, 0, 0, r * 0.25, g); m.scale.set(1, 1.05, 0.7);
      for (const sd of [-1, 1]) {
        mesh(sphere(r * 0.13, 8, 6), mat('#101010'), sd * r * 0.32, r * 0.15, r * 0.88, g).scale.set(1.4, 0.6, 0.5);
        const horn = mesh(cone(r * 0.2, r * 0.9, 5), feather, sd * r * 0.6, r * 1.0, -r * 0.1, g); horn.rotation.z = -sd * 0.4;
      }
      const beak = mesh(cone(r * 0.14, r * 0.45, 4), gold, 0, -r * 0.2, r * 1.0, g); beak.rotation.x = Math.PI / 2 + 0.6;
      mesh(torus(H, r * 0.8, r * 0.08, Math.PI * 2, 14), tc, 0, -r * 0.7, 0, g).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_toad_head': { // wide and flat, big eyes on top, a huge mouth
      g.userData.hidesFace = true;
      const skin = mat('#3a3f46', { spec: 0.35 }), spot = mat('#c8ccd2'), eye = mat('#f0d860', { emit: 0.3 });
      const h = mesh(sphere(r * 1.15, 16, 10), skin, 0, -r * 0.1, r * 0.1, g); h.scale.set(1.35, 0.7, 1.15);
      for (const sd of [-1, 1]) {
        mesh(sphere(r * 0.35, 10, 8), skin, sd * r * 0.62, r * 0.45, r * 0.45, g);
        mesh(sphere(r * 0.27, 10, 8), eye, sd * r * 0.66, r * 0.55, r * 0.6, g);
        mesh(box(r * 0.3, r * 0.08, r * 0.05), mat('#101010'), sd * r * 0.68, r * 0.55, r * 0.86, g);
      }
      mesh(box(r * 2.2, r * 0.07, r * 0.4), mat('#1a1418'), 0, -r * 0.35, r * 1.05, g); // mouth line
      for (const [x, z] of [[0.3, 0.9], [-0.5, 0.6], [0.7, 0.2], [-0.2, 1.0], [0, 0.4]]) mesh(sphere(r * 0.1, 6, 5), spot, x * r, r * 0.38, z * r * 0.8, g);
      mesh(torus(H, r * 0.9, r * 0.09, Math.PI * 2, 14), tc, 0, -r * 0.6, 0, g).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_ele_head': { // trunk, great ears, tusks
      g.userData.hidesFace = true;
      const skin = mat('#8d97a8', { spec: 0.15 }), ivory = mat('#f2ead6'), dark = mat('#1a1a20');
      mesh(sphere(r * 1.12, 16, 12), skin, 0, 0, 0, g);
      for (let i = 0; i < 7; i++) { const t = mesh(cyl(r * (0.3 - i * 0.03), r * (0.32 - i * 0.03), r * 0.5, 10), skin, 0, -r * (0.1 + i * 0.3), r * (1.1 + i * 0.32 - i * i * 0.035), g); t.rotation.x = 1.1 - i * 0.12; }
      for (const sd of [-1, 1]) {
        const ear = mesh(sphere(r * 1.1, 12, 8), skin, sd * r * 1.1, r * 0.05, -r * 0.1, g); ear.scale.set(0.16, 1.15, 0.95); ear.rotation.y = -sd * 0.4;
        const tusk = mesh(cone(r * 0.12, r * 1.0, 6), ivory, sd * r * 0.4, -r * 0.55, r * 1.25, g); tusk.rotation.x = 1.6;
        mesh(sphere(r * 0.1, 8, 6), dark, sd * r * 0.42, r * 0.25, r * 0.95, g);
      }
      mesh(box(r * 0.4, r * 0.08, r * 0.04), dark, 0, r * 0.62, r * 0.92, g); // shikigami mark
      mesh(torus(H, r * 0.95, r * 0.09, Math.PI * 2, 16), tc, 0, -r * 0.75, 0, g).rotation.x = Math.PI / 2;
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'jjk' && def.faction !== SUMMON) return;
  const { parts, skel, extraParts } = vis;
  const { mesh, sphere, box, cyl, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const sleeves = (m, k = 1.15) => { for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) { const sp = skel.parts[p]; const fore = p === PART.farmL || p === PART.farmR; mesh(capsule(sp.r * k, sp.hh * 2 * (fore ? 0.85 : 1)), m, 0, fore ? sp.hh * 0.15 : 0, 0, parts[p]); } };
  const cuffs = (m) => { for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.3, sp.r * 1.3, sp.r * 0.5, 10), m, 0, -sp.hh * 0.62, 0, parts[p]); } };
  if (top === 'jk_gojo_uniform' || top === 'jk_megumi_uniform') {
    // the Jujutsu High uniform: dark, a tall collar, a seam down the front
    const uni = mat(UNIFORM, { spec: 0.2 });
    chestShell(H, ch, uni, C);
    sleeves(uni);
    const gojo = top === 'jk_gojo_uniform';
    mesh(cyl(r * 0.6, r * 0.68, r * (gojo ? 0.8 : 0.55), 14), uni, 0, hh + r * (gojo ? 0.72 : 0.62), 0, C); // the high collar
    mesh(cyl(r * 0.61, r * 0.61, r * 0.06, 14), tc, 0, hh + r * (gojo ? 1.1 : 0.9), 0, C); // team rim
    mesh(box(r * 0.05, (hh + r) * 1.7, r * 0.04), mat('#2c2f40'), 0, 0, r * 1.1, C); // seam
    if (!gojo) for (const y of [0.55, 0.15, -0.25, -0.65]) { // Megumi's gold swirl buttons
      const z = r * 1.08 * Math.sqrt(Math.max(0.2, 1 - (y * 0.6) ** 2));
      mesh(cyl(r * 0.08, r * 0.08, r * 0.04, 10), mat('#d8b04a', { spec: 1 }), 0, y * hh + r * 0.05, z, C).rotation.x = Math.PI / 2;
    }
    cuffs(td);
    // loose trousers
    for (const p of [PART.thighL, PART.thighR]) { const sp = skel.parts[p]; mesh(capsule(sp.r * 1.25, sp.hh * 2), uni, 0, 0, 0, parts[p]); }
    if (gojo) { // the jacket hangs past the hips
      const coat = mesh(cyl(pel.r * 1.12, pel.r * 1.3, pel.r * 1.4, 16), uni, 0, -pel.r * 0.35, 0, P); coat.scale.set(1, 1, 0.92);
    } else {
      mesh(cyl(pel.r * 1.1, pel.r * 1.12, pel.r * 0.3, 14), mat('#2a2a34'), 0, pel.r * 0.2, 0, P); // belt
    }
  }
  if (top === 'jk_sukuna_kimono' || top === 'jk_mahoraga_body') {
    const ink = mat('#121014');
    if (top === 'jk_sukuna_kimono') {
      // a white kimono, dark sash, tattoo bands on the forearms and chest
      const silk = mat('#f0ece2', { spec: 0.15 }), sash = mat('#1e1a20'), skin = mat(def.look.skin, { spec: 0.18 });
      chestShell(H, ch, silk, C);
      for (const sd of [-1, 1]) { const l = mesh(box(r * 0.2, (hh + r) * 1.25, r * 0.05), sash, sd * r * 0.3, hh * 0.35, r * 1.06, C); l.rotation.z = -sd * 0.38; }
      mesh(cyl(r * 1.15, r * 1.17, r * 0.42, 14), sash, 0, -hh - r * 0.3, 0, C);
      mesh(sphere(r * 0.22, 8, 6), tc, r * 0.4, -hh - r * 0.3, r * 1.05, C).scale.set(1.4, 1, 0.6); // team knot
      const robe = mesh(cyl(pel.r * 1.15, pel.r * 1.7, pel.r * 2.8, 16), silk, 0, -pel.r * 1.25, 0, P); robe.scale.set(1, 1, 0.95);
      mesh(cyl(pel.r * 1.72, pel.r * 1.72, pel.r * 0.14, 16), tc, 0, -pel.r * 2.6, 0, P).scale.set(1, 1, 0.95);
      for (const p of [PART.uarmL, PART.uarmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.3, sp.r * 2.0, sp.hh * 2.1, 10), silk, 0, -sp.hh * 0.1, 0, parts[p]); mesh(sphere(sp.r * 1.4, 10, 8), silk, 0, sp.hh * 0.9, 0, parts[p]); }
      for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; mesh(capsule(sp.r * 1.32, sp.hh * 1.7), skin, 0, sp.hh * 0.15, 0, parts[p]); } // bare forearms
      // a dark scarf round the neck
      mesh(torus(H, r * 0.62, r * 0.16, Math.PI * 2, 14), sash, 0, hh + r * 0.45, 0, C).rotation.x = Math.PI / 2;
    } else {
      // Mahoraga: a broad pale torso with grooves, a dark skirt, gold cuffs
      const pale = mat(def.look.skin, { spec: 0.2 }), cloth = mat('#3a3a40', { spec: 0.1 }), gold = mat('#d8b04a', { spec: 1 });
      chestShell(H, ch, pale, C, 1.08);
      sleeves(pale, 1.12);
      const groove = mat('#cfc8b8', { spec: 0.2 });
      for (const sd of [-1, 1]) { const pec = mesh(sphere(r * 0.5, 12, 8), pale, sd * r * 0.45, hh * 0.55, r * 0.95, C); pec.scale.set(1, 0.62, 0.55); }
      mesh(box(r * 0.06, (hh + r) * 1.3, r * 0.06), groove, 0, -hh * 0.2, r * 1.24, C);
      const skirt = mesh(cyl(pel.r * 1.15, pel.r * 1.7, pel.r * 2.6, 16), cloth, 0, -pel.r * 1.1, 0, P); skirt.scale.set(1, 1, 0.92);
      mesh(cyl(pel.r * 1.18, pel.r * 1.18, pel.r * 0.35, 16), tc, 0, pel.r * 0.1, 0, P); // team sash
      for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.25, sp.r * 1.25, sp.r * 0.9, 10), gold, 0, -sp.hh * 0.35, 0, parts[p]); }
      for (const p of [PART.uarmL, PART.uarmR]) { const sp = skel.parts[p]; mesh(sphere(sp.r * 1.6, 10, 8), pale, 0, sp.hh * 0.8, 0, parts[p]); }
      // the wheel (an extra body over the head, turned by the adaptations)
      const hd = skel.parts[PART.head];
      const grp = new THREE.Group();
      wheel(H, grp, hd.r);
      extraParts.push({ group: grp, pos: V(0, hd.pos.y + hd.r * WHEEL_UP, 0), quat: new THREE.Quaternion() });
    }
  }
  if (top === 'jk_fur_w' || top === 'jk_fur_b') { // a shaggy shikigami dog: fur, tail, claws
    const w = top === 'jk_fur_w';
    const fur = mat(w ? '#f2f2ee' : '#24242a', { spec: 0.1 }), tuft = mat(w ? '#dcdcd4' : '#36363e');
    chestShell(H, ch, fur, C, 1.1);
    for (let i = 0; i < 8; i++) { const a = i * 0.8; const t = mesh(cone(r * 0.2, r * 0.5, 4), tuft, Math.sin(a) * r * 0.9, hh + r * 0.35, Math.cos(a) * r * 0.9, C); t.rotation.x = Math.cos(a) * 0.9; t.rotation.z = -Math.sin(a) * 0.9; } // ruff
    const tail = mesh(cone(r * 0.25, r * 1.6, 6), fur, 0, -hh, -r * 1.4, C); tail.rotation.x = -2.2;
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; for (let k = -1; k <= 1; k++) { const cl = mesh(cone(sp.r * 0.25, sp.r * 1.0, 4), mat('#101010'), k * sp.r * 0.5, -sp.hh - sp.r * 1.5, sp.r * 0.6, parts[p]); cl.rotation.x = Math.PI; } }
    sleeves(fur, 1.25);
  }
  if (top === 'jk_nue_body') { // feathered body; the arms are wings
    const feather = mat('#2a2830', { spec: 0.15 }), light = mat('#4a4654');
    chestShell(H, ch, feather, C, 1.08);
    mesh(sphere(r * 0.7, 12, 8), light, 0, -hh * 0.2, r * 0.55, C).scale.set(1, 1.3, 0.5);
    for (const [p, sd] of [[PART.uarmL, 1], [PART.farmL, 1], [PART.uarmR, -1], [PART.farmR, -1]]) {
      const sp = skel.parts[p], fore = p === PART.farmL || p === PART.farmR;
      mesh(capsule(sp.r * 1.2, sp.hh * 2), feather, 0, 0, 0, parts[p]);
      const span = sp.hh * (fore ? 2.8 : 2.1), deep = r * (fore ? 1.5 : 1.2);
      mesh(box(r * 0.05, span, deep), feather, 0, fore ? -sp.hh * 0.3 : 0, -deep * 0.45, parts[p]);
      for (let f = 0; f < 4; f++) mesh(box(r * 0.07, span * 0.22, deep * 0.5), f % 2 ? light : feather, 0, (fore ? -sp.hh * 0.3 : 0) + (f - 1.5) * span * 0.24, -deep * 0.95, parts[p]);
    }
    const tail = mesh(cone(r * 0.5, r * 1.2, 6), feather, 0, -hh - r * 0.6, -r * 0.9, C); tail.rotation.x = -2.4;
    mesh(cyl(pel.r * 1.1, pel.r * 1.15, pel.r * 0.6, 12), td, 0, 0, 0, P);
  }
  if (top === 'jk_toad_body') { // a squat, warty body
    const skin = mat(def.look.skin, { spec: 0.35 }), belly = mat('#c8ccd2');
    chestShell(H, ch, skin, C, 1.1);
    mesh(sphere(r * 0.85, 12, 8), belly, 0, -hh * 0.3, r * 0.5, C).scale.set(1.1, 1.1, 0.55);
    for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.4; mesh(sphere(r * 0.12, 6, 5), belly, Math.sin(a) * r * 1.15, ((i * 3) % 5 / 4 - 0.5) * hh * 2, -Math.abs(Math.cos(a)) * r * 1.0, C); }
    sleeves(skin, 1.15);
  }
  if (top === 'jk_ele_body') { // a vast grey body, a saddle-cloth in the team colour
    const skin = mat(def.look.skin, { spec: 0.15 });
    chestShell(H, ch, skin, C, 1.12);
    const cl = mesh(box(r * 1.6, r * 0.9, r * 0.1), tc, 0, hh * 0.2, -r * 1.12, C); void cl;
    mesh(box(r * 1.7, r * 0.1, r * 0.12), mat('#d8b04a'), 0, hh * 0.2 - r * 0.45, -r * 1.13, C);
    sleeves(skin, 1.2);
    for (const p of [PART.shinL, PART.shinR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.7, sp.r * 1.9, sp.hh * 0.7, 12), skin, 0, -sp.hh * 0.75, 0, parts[p]); }
  }
  // Sukuna's tattoo bands on the forearms
  if (top === 'jk_sukuna_kimono') {
    const ink = mat('#121014');
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; for (const y of [-0.3, -0.12]) mesh(cyl(sp.r * 1.36, sp.r * 1.36, sp.r * 0.3, 10), ink, 0, y * sp.hh * 2, 0, parts[p]); }
  }
}

// the eight-handled wheel (disc in the XY plane, facing +Z), centred on the origin
function wheel(H, g, r) {
  const { mesh, cyl, sphere, mat } = H;
  const gold = mat('#d8b04a', { spec: 1 }), dark = mat('#8a6a20', { spec: 0.6 });
  const R = r * 1.25;
  const rim = mesh(torus(H, R, r * 0.09, Math.PI * 2, 32), gold, 0, 0, 0, g); void rim;
  const hub = mesh(cyl(r * 0.22, r * 0.22, r * 0.18, 12), dark, 0, 0, 0, g); hub.rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = mesh(cyl(r * 0.05, r * 0.05, R, 6), gold, Math.sin(a) * R * 0.5, Math.cos(a) * R * 0.5, 0, g); sp.rotation.z = -a;
    // the handles sticking out past the rim
    const hd = mesh(cyl(r * 0.07, r * 0.05, r * 0.45, 6), gold, Math.sin(a) * (R + r * 0.25), Math.cos(a) * (R + r * 0.25), 0, g); hd.rotation.z = -a;
    mesh(sphere(r * 0.09, 6, 5), dark, Math.sin(a) * (R + r * 0.5), Math.cos(a) * (R + r * 0.5), 0, g);
  }
  // the stem down to the crown of the head
  mesh(cyl(r * 0.07, r * 0.09, r * 0.8, 6), dark, 0, -R - r * 0.1, 0, g);
}

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, octa, mat, glow } = H;
  const ns = (m) => { m.castShadow = false; return m; };
  const tr = (c, o, e = 1) => mat(c, { emit: e, transparent: true, opacity: o, depthWrite: false });
  switch (type) {
    case 'jk_red': {
      ns(mesh(sphere(0.2, 12, 10), glow('#fff0f0'), 0, 0, 0, g));
      ns(mesh(sphere(0.38, 14, 10), tr('#ff2030', 0.65), 0, 0, 0, g));
      ns(mesh(sphere(0.55, 14, 10), tr('#ff6040', 0.2), 0, 0, 0, g));
      for (let i = 0; i < 2; i++) ns(mesh(torus(H, 0.45 + i * 0.08, 0.02, Math.PI * 2, 20), glow('#ff4050'), 0, 0, 0, g)).rotation.set(i * 1.3, 0.4, 0);
      return true;
    }
    case 'jk_redburst': {
      ns(mesh(sphere(1.0, 16, 12), tr('#ff2a30', 0.45), 0, 0, 0, g));
      ns(mesh(sphere(1.8, 16, 12), tr('#ff8060', 0.15), 0, 0, 0, g));
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 1.3 + i * 0.4, 0.04, Math.PI * 2, 28), glow('#ff5050'), 0, 0, 0, g)).rotation.set(Math.PI / 2 + i * 0.4, i, 0);
      return true;
    }
    case 'jk_blue': case 'jk_handblue': {
      const k = type === 'jk_blue' ? 1 : 0.4;
      ns(mesh(sphere(0.18 * k, 12, 10), glow('#f0f8ff'), 0, 0, 0, g));
      ns(mesh(sphere(0.42 * k, 14, 10), tr('#2a7cff', 0.6), 0, 0, 0, g));
      ns(mesh(sphere(0.7 * k, 14, 10), tr('#6ab4ff', 0.18), 0, 0, 0, g));
      for (let i = 0; i < 4; i++) ns(mesh(torus(H, (0.5 + i * 0.18) * k, 0.02 * k, Math.PI * 1.4, 20), glow(i % 2 ? '#8ac8ff' : '#3a8aff'), 0, 0, 0, g)).rotation.set(1.2 + i * 0.3, i * 1.6, i * 0.5);
      return true;
    }
    case 'jk_handred': {
      ns(mesh(sphere(0.08, 10, 8), glow('#fff0f0'), 0, 0, 0, g));
      ns(mesh(sphere(0.18, 12, 10), tr('#ff2030', 0.6), 0, 0, 0, g));
      ns(mesh(sphere(0.3, 12, 10), tr('#ff6040', 0.2), 0, 0, 0, g));
      return true;
    }
    case 'jk_purple': case 'jk_purple2': {
      const k = type === 'jk_purple2' ? 1.5 : 1;
      ns(mesh(sphere(0.55 * k, 16, 12), mat('#12061e', { spec: 0.5 }), 0, 0, 0, g));
      ns(mesh(sphere(0.95 * k, 18, 14), tr('#9a3cff', 0.6), 0, 0, 0, g));
      ns(mesh(sphere(1.4 * k, 18, 14), tr('#d090ff', 0.2), 0, 0, 0, g));
      for (let i = 0; i < 4; i++) ns(mesh(torus(H, (1.15 + i * 0.1) * k, 0.035 * k, Math.PI * 2, 28), glow(i % 2 ? '#ff6ad8' : '#b48aff'), 0, 0, 0, g)).rotation.set(i * 0.8, i * 0.5, 0);
      return true;
    }
    case 'jk_inf': { // Infinity on: a faint shimmer ring around him and a few motes
      ns(mesh(torus(H, 0.75, 0.012, Math.PI * 2, 32), tr('#e8f6ff', 0.55), 0, 0.1, 0, g)).rotation.x = Math.PI / 2;
      ns(mesh(torus(H, 0.68, 0.01, Math.PI * 2, 32), tr('#a8d8ff', 0.4), 0, 0.55, 0, g)).rotation.x = Math.PI / 2 + 0.15;
      for (let i = 0; i < 6; i++) { const a = i * 1.05; ns(mesh(octa(0.025), glow('#dff2ff'), Math.sin(a) * 0.72, 0.2 + (i % 3) * 0.25, Math.cos(a) * 0.72, g)); }
      return true;
    }
    case 'jk_awake': { // a burst of white and blue light
      ns(mesh(sphere(0.9, 16, 12), tr('#e8f4ff', 0.3), 0, 0, 0, g));
      for (let i = 0; i < 10; i++) {
        const dir = new THREE.Vector3(Math.sin(i * 2.4), Math.cos(i * 1.7) * 0.6 + 0.3, Math.cos(i * 2.4)).normalize();
        const sp = ns(mesh(cone(0.05, 1.2, 4), glow(i % 2 ? '#ffffff' : '#7ac8ff'), dir.x * 0.9, dir.y * 0.9, dir.z * 0.9, g));
        sp.quaternion.setFromUnitVectors(UPY, dir);
      }
      return true;
    }
    case 'jk_overload': { // overwhelmed: rings of information spinning over the head
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 0.22 + i * 0.07, 0.012, Math.PI * 2, 20), glow(i === 1 ? '#ffffff' : '#7ad8ff'), 0, i * 0.04, 0, g)).rotation.set(Math.PI / 2 + i * 0.3, i, 0);
      for (let i = 0; i < 6; i++) { const a = i * 1.05; ns(mesh(box(0.05, 0.05, 0.01), glow('#e0f4ff'), Math.sin(a) * 0.3, 0.05 + (i % 2) * 0.08, Math.cos(a) * 0.3, g)); }
      return true;
    }
    case 'jk_void': { // Unlimited Void: a black dome full of stars, a white horizon
      const R = VOID_R;
      domeMesh(H, g, R, '#0a0c2c', 0.55, '#7ad8ff');
      // faint lines of latitude and longitude so it reads as a dome
      for (const el of [0.3, 0.65, 1.0]) ns(mesh(torus(H, R * Math.cos(el), 0.035, Math.PI * 2, 48), tr('#9ad8ff', 0.45), 0, R * Math.sin(el), 0, g)).rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const m = ns(mesh(torus(H, R * 1.002, 0.03, Math.PI, 40), tr('#9ad8ff', 0.3), 0, 0, 0, g)); m.rotation.y = (i / 8) * Math.PI; }
      ns(mesh(H.geo('jkvoidf', () => new THREE.CircleGeometry(R, 48).rotateX(-Math.PI / 2)), tr('#02020a', 0.75, 0), 0, 0.04, 0, g));
      ns(mesh(torus(H, R * 0.999, 0.08, Math.PI * 2, 64), glow('#f4fbff'), 0, 0.07, 0, g)).rotation.x = Math.PI / 2;
      // stars on the inside of the shell
      for (let i = 0; i < 70; i++) {
        const a = i * 2.39996, el = Math.asin(((i * 37) % 70) / 70 * 0.95 + 0.03);
        const rr = R * 0.97;
        ns(mesh(octa(0.05 + (i % 4) * 0.03), glow(i % 5 ? '#ffffff' : '#9ad8ff'), Math.sin(a) * Math.cos(el) * rr, Math.sin(el) * rr, Math.cos(a) * Math.cos(el) * rr, g));
      }
      // a swirl of light overhead (the "galaxy")
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, R * (0.25 + i * 0.12), 0.05, Math.PI * 1.3, 32), tr(i === 1 ? '#c8a8ff' : '#7ad8ff', 0.5), 0, R * 0.8 - i * 0.2, 0, g)).rotation.set(Math.PI / 2, 0, i * 1.7);
      return true;
    }
    case 'jk_shrine': { // Malevolent Shrine: no dome, a bloody field and the shrine of mouths
      const R = SHRINE_R;
      ns(mesh(H.geo('jkshrf', () => new THREE.CircleGeometry(R, 56).rotateX(-Math.PI / 2)), tr('#3a0610', 0.55, 0.2), 0, 0.04, 0, g));
      ns(mesh(torus(H, R, 0.1, Math.PI * 2, 72), glow('#ff2030'), 0, 0.08, 0, g)).rotation.x = Math.PI / 2;
      ns(mesh(H.geo('jkshrd', () => new THREE.SphereGeometry(R, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2)), tr('#ff2040', 0.06, 0.4), 0, 0, 0, g)).renderOrder = 4;
      const wood = mat('#2a1418', { spec: 0.2 }), bone = mat('#ece2cc'), maw = mat('#4a0812'), roof = mat('#1a0e12', { spec: 0.3 });
      // platform and pillars
      mesh(box(3.2, 0.5, 3.2), wood, 0, 0.25, 0, g);
      for (const x of [-1.3, 1.3]) for (const z of [-1.3, 1.3]) mesh(cyl(0.16, 0.18, 2.8, 8), wood, x, 1.9, z, g);
      // the roof: two sweeping tiers with horns at the corners
      const r1 = mesh(cone(2.8, 1.1, 4), roof, 0, 3.75, 0, g); r1.rotation.y = Math.PI / 4;
      const r2 = mesh(cone(1.7, 1.2, 4), roof, 0, 4.7, 0, g); r2.rotation.y = Math.PI / 4;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; const h = mesh(cone(0.18, 1.6, 6), bone, Math.sin(a) * 2.1, 3.6, Math.cos(a) * 2.1, g); h.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9); }
      for (const sd of [-1, 1]) { const h = mesh(cone(0.2, 2.0, 6), bone, sd * 0.7, 5.6, 0, g); h.rotation.z = -sd * 0.5; }
      // mouths full of teeth on each face of the shrine
      for (let f = 0; f < 4; f++) {
        const a = f * Math.PI / 2, fx = Math.sin(a), fz = Math.cos(a);
        const m = mesh(sphere(0.7, 14, 8), maw, fx * 1.35, 1.6, fz * 1.35, g); m.scale.set(fz ? 1.1 : 0.4, 0.55, fz ? 0.4 : 1.1);
        for (let i = -3; i <= 3; i++) for (const up of [1, -1]) {
          const t = mesh(cone(0.07, 0.22, 4), bone, fx * 1.55 + fz * i * 0.17, 1.6 + up * 0.2, fz * 1.55 - fx * i * 0.17, g);
          t.rotation.x = up > 0 ? Math.PI : 0;
        }
      }
      // skulls piled round the platform
      for (let i = 0; i < 14; i++) { const a = i * 0.9, rr = 2.0 + (i % 3) * 0.25; mesh(sphere(0.2, 8, 6), bone, Math.sin(a) * rr, 0.15 + (i % 2) * 0.15, Math.cos(a) * rr, g); }
      // ribs rising out of the ground around the edge
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const rb = mesh(cone(0.15, 1.4, 5), bone, Math.sin(a) * (R - 0.6), 0.5, Math.cos(a) * (R - 0.6), g); rb.rotation.set(-Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5); }
      return true;
    }
    case 'jk_garden': { // Chimera Shadow Garden: a black-violet dome, the floor a pool of shadow
      const R = GARDEN_R;
      domeMesh(H, g, R, '#140a24', 0.5, '#6a4aa8');
      ns(mesh(H.geo('jkgardf', () => new THREE.CircleGeometry(R, 40).rotateX(-Math.PI / 2)), tr('#0a0612', 0.85, 0), 0, 0.04, 0, g));
      for (let i = 0; i < 18; i++) { const a = i * 2.1, rr = (i % 6) / 6 * R * 0.9 + 0.5; const sp = ns(mesh(cone(0.12, 0.6 + (i % 3) * 0.4, 5), tr('#2a1e48', 0.75, 0), Math.sin(a) * rr, 0.3, Math.cos(a) * rr, g)); sp.rotation.z = Math.sin(a) * 0.3; }
      for (let i = 0; i < 6; i++) { const a = i * 1.05; ns(mesh(sphere(0.06, 6, 5), glow('#c8a8ff'), Math.sin(a) * R * 0.5, 0.12, Math.cos(a) * R * 0.5, g)); }
      return true;
    }
    case 'jk_firebow': { // a bow of flame in the left hand
      const f = glow('#ffb040'), h = tr('#ff6020', 0.6);
      const b = ns(mesh(torus(H, 0.55, 0.035, Math.PI * 0.9, 20), f, 0, 0, 0, g)); b.rotation.set(0, Math.PI / 2, Math.PI / 2 - Math.PI * 0.45);
      ns(mesh(torus(H, 0.55, 0.08, Math.PI * 0.9, 20), h, 0, 0, 0, g)).rotation.set(0, Math.PI / 2, Math.PI / 2 - Math.PI * 0.45);
      return true;
    }
    case 'jk_fuga': { // the fire arrow (+Y forward)
      ns(mesh(cyl(0.05, 0.05, 1.2, 6), glow('#ffe0a0'), 0, 0, 0, g));
      ns(mesh(cone(0.14, 0.4, 6), glow('#fff4d0'), 0, 0.75, 0, g));
      ns(mesh(cone(0.3, 1.6, 8), tr('#ff5010', 0.55), 0, -0.2, 0, g)).rotation.x = Math.PI;
      ns(mesh(cone(0.45, 1.0, 8), tr('#ffa020', 0.3), 0, -0.6, 0, g)).rotation.x = Math.PI;
      return true;
    }
    case 'jk_fugaburst': { // a pillar of fire
      ns(mesh(cyl(1.4, 2.4, 5, 16, 1, true), tr('#ff5010', 0.45), 0, 2.5, 0, g));
      ns(mesh(cyl(0.7, 1.4, 7, 14, 1, true), tr('#ffb030', 0.5), 0, 3.5, 0, g));
      ns(mesh(torus(H, 2.6, 0.12, Math.PI * 2, 32), glow('#ff8020'), 0, 0.1, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_ritual': { // the wheel of the ritual on the ground
      const g2 = new THREE.Group(); g.add(g2);
      g2.rotation.x = -Math.PI / 2;
      wheel(H, g2, 1.4);
      ns(mesh(cyl(2.6, 2.6, 0.02, 32), tr('#fff2c0', 0.3), 0, 0.01, 0, g));
      return true;
    }
    case 'jk_wheelflash': {
      ns(mesh(sphere(0.9, 14, 10), tr('#fff6d0', 0.35), 0, 0, 0, g));
      ns(mesh(torus(H, 1.0, 0.05, Math.PI * 2, 28), glow('#ffe080'), 0, 0, 0, g));
      return true;
    }
    case 'jk_shock': {
      for (let i = 0; i < 8; i++) {
        const dir = new THREE.Vector3(Math.sin(i * 2.4), Math.cos(i * 1.9), Math.cos(i * 2.4)).normalize();
        const sp = ns(mesh(cyl(0.02, 0.02, 0.7, 4), glow(i % 2 ? '#fff8a0' : '#a8e0ff'), dir.x * 0.3, dir.y * 0.3, dir.z * 0.3, g));
        sp.quaternion.setFromUnitVectors(UPY, dir);
      }
      ns(mesh(sphere(0.35, 10, 8), tr('#e8f4ff', 0.3), 0, 0, 0, g));
      return true;
    }
    case 'jk_tongue': { // a tongue segment (+Y along the beam)
      ns(mesh(cyl(0.06, 0.06, 0.5, 6), mat('#d86a7a', { spec: 0.5 }), 0, 0, 0, g));
      return true;
    }
    case 'jk_water': { // a churning wall of water
      ns(mesh(sphere(0.7, 12, 8), tr('#4aa8e8', 0.6, 0.2), 0, 0, 0, g)).scale.set(1, 0.8, 1);
      ns(mesh(sphere(0.45, 10, 8), tr('#e8f6ff', 0.6, 0.5), 0, 0.4, 0, g));
      return true;
    }
    case 'jk_meguna_face': { // Sukuna's marks on Megumi's face: lines under the eyes, the second pair of eyes
      const r = MG_SKEL.rHead, ink = mat('#121014');
      for (const sd of [-1, 1]) {
        for (const y of [-0.02, -0.17]) {
          const z = Math.sqrt(Math.max(0.05, 1 - y * y - 0.25)) * r * 1.03;
          ns(mesh(box(r * 0.34, r * 0.07, r * 0.04), ink, sd * r * 0.5, y * r, z, g)).rotation.set(0, sd * 0.55, 0);
        }
        mesh(sphere(r * 0.08, 8, 6), mat('#f4ecdc'), sd * r * 0.27, -r * 0.05, r * 0.98, g).scale.set(1.4, 0.55, 0.5);
        mesh(sphere(r * 0.04, 6, 5), mat('#b01020'), sd * r * 0.27, -r * 0.05, r * 1.01, g);
      }
      mesh(box(r * 0.5, r * 0.07, r * 0.04), ink, 0, r * 0.52, r * 0.9, g);
      return true;
    }
    case 'jk_meguna_body': {
      const ch = MG_SKEL.parts[PART.chest], r = ch.r, ink = mat('#121014');
      for (const y of [0.4, 0.0, -0.4]) ns(mesh(box(r * 0.9, r * 0.06, r * 0.05), ink, 0, y * ch.hh * 2, r * 1.2, g));
      ns(mesh(torus(H, r * 1.3, r * 0.02, Math.PI * 2, 24), tr('#ff3048', 0.4), 0, 0, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_meguna_ink': {
      const sp = MG_SKEL.parts[PART.farmL], ink = mat('#121014');
      for (const y of [-0.3, -0.1, 0.15]) mesh(cyl(sp.r * 1.45, sp.r * 1.45, sp.r * 0.25, 10), ink, 0, y * sp.hh * 2, 0, g);
      return true;
    }
    case 'jk_teamring0': case 'jk_teamring1': { // a switched shikigami's new side: a ring over its head
      const m = mesh(torus(H, 0.22, 0.035, Math.PI * 2, 20), tcol(H, type.endsWith('1') ? 1 : 0), 0, 0, 0, g); m.rotation.x = Math.PI / 2; m.castShadow = false;
      return true;
    }
    case 'jk_meguna_band0': case 'jk_meguna_band1': {
      const sp = MG_SKEL.parts[PART.uarmL];
      mesh(cyl(sp.r * 1.5, sp.r * 1.5, sp.hh * 0.6, 10), tcol(H, type.endsWith('1') ? 1 : 0), 0, sp.hh * 0.2, 0, g);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------------ secrets
const LAST = new WeakMap();
onSecret((b, dt) => {
  const t = (LAST.get(b) || 0) + dt;
  if (t < 0.25) { LAST.set(b, t); return; }
  LAST.set(b, 0);
  for (const u of b.units) {
    if (!u.alive) continue;
    // "Nah, I'd win."
    if (isA(u, 'jk_gojo') && !jk(b).secrets.has('nah')) {
      for (const v of b.teams[1 - u.team]) if (sukunaLike(v) && flat(v.pos, u.pos) < 16) { announce(b, 'SECRET: "Nah, I\'d win." - Gojo', u.headPos, 'nah'); break; }
    }
    // a Sukuna who saw Mahoraga adapt to Infinity learns the World-Cutting Slash
    if (sukunaLike(u) && !u.jkPierce) {
      for (const m of b.teams[u.team]) if (m.alive && m.jkPierce && m.def.id === 'jk_mahoraga') {
        u.jkPierce = true;
        announce(b, 'SECRET: World-Cutting Slash! Sukuna learned from Mahoraga\'s adaptation', u.headPos, 'wcs' + u.id);
        break;
      }
    }
  }
});

register({
  units,
  items: {
    jk_shadow_blade: { len: 0.85, r: 0.06, grip: 30, metal: true, mass: 1.2 },
    jk_fangs: { len: 0.3, r: 0.12, grip: 90, phys: false },
    jk_exterminate: { len: 1.3, r: 0.11, grip: 70, metal: true, mass: 3.5 },
  },
  kinds: { jk_gojo: gojo, jk_sukuna: sukuna, jk_megumi: megumi, jk_mahoraga: mahoraga, jk_dog: dog, jk_nue: nue, jk_toad: toad, jk_elephant: elephant },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
  battleStep(b, dt) { stepWheels(b, dt); },
});
