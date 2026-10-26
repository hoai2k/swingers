// Jujutsu: cursed-energy sorcerers and the curses they fight.
//  - Cursed Brawler: fists wrapped in cursed energy; now and then a "black flash", a
//    critical blow with a black-and-red spark burst that sends the victim flying
//  - Nail Witch: hammers nails at range; each blow also strikes her straw doll, which
//    hurts whoever she nailed last ("resonance", on a cooldown)
//  - Shadow Summoner: two shadow wolves rise out of his shadow, hunt for a while and
//    melt back into the ground (kinematic extra bodies, hittable as sm-core "bigs")
//  - Cursed Spirit: a cheap, many-eyed blob that comes in swarms
//  - Cursed Speaker: one loud word knocks down every enemy in a cone (it hurts his
//    throat a little every time)
//  - Blindfolded Sorcerer: "infinity" stops shots and blows just short of him, on and
//    off; fires a void orb that ploughs through a whole line
//  - Four-Armed King: invisible cuts all around him, and now and then a domain: a dark
//    dome where cuts rain on everyone inside (his own side takes half)
// Everything drawn is a unit part, an extra body, a projectile or a battle.stuck entry
// (markers), so setup previews, live battles and replays all show it.
import { register } from '../ext.js';
import { ATTACKS } from '../pose.js';
import { RAPIER } from '../physics.js';
import { FIELD } from '../world.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, aimPoint, launchVel, addProjectile,
  strike, arrowProj, handPos, torus, dome, headBand, tcol, tdark, chestShell,
} from './common.js';
import { UPY, mark, markAt, STANCE, setArmKey } from './ges-core.js';
import { addBig, updateBig, placeExtra } from './sm-core.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const NAVY = '#1c2030', GOLD = '#d8b04a', CURSE = '#6a7cff', VOIDC = '#8a4cff';
export const DOMAIN_R = 8; // the domain dome's radius (its mesh is built at this size)

// ------------------------------------------------------------------ animations
// shout: draw breath leaning back, then lean into the word with the arms flung back
ATTACKS.jj_shout = [
  [0.0, null, null, 0, 0, 0],
  [0.35, [0.3, 0.25, -0.3, -1.4], [0.3, 0.25, -0.3, -1.4], 0, -0.3, 0.1],
  [0.5, [-0.2, 0.9, 0.55, 0.3], [-0.2, 0.9, 0.55, 0.3], 0, 0.45, 0.15],
  [0.75, [-0.2, 0.85, 0.5, 0.25], [-0.2, 0.85, 0.5, 0.25], 0, 0.4, 0.15],
  [1.0, null, null, 0, 0, 0],
];
// hand sign: both hands meet in front of the chest (thumbs locked: a wolf's head)
ATTACKS.jj_sign = [
  [0.0, null, null, 0, 0, 0],
  [0.3, [0.9, 0.05, -1.0, -2.3], [0.9, 0.05, -1.0, -2.3], 0, -0.05, 0.05],
  [0.6, [0.95, 0.0, -1.25, -2.2], [0.95, 0.0, -1.25, -2.2], 0, 0.15, 0.2],
  [0.85, [0.95, 0.0, -1.25, -2.2], [0.95, 0.0, -1.25, -2.2], 0, 0.15, 0.2],
  [1.0, null, null, 0, 0, 0],
];
// void orb: both palms pushed out at the target
ATTACKS.jj_push = [
  [0.0, null, null, 0, 0, 0],
  [0.45, [0.6, 0.2, -1.2, -2.4], [0.6, 0.2, -1.2, -2.4], 0.3, -0.15, 0.1],
  [0.6, [0.3, 0.1, -1.5, -1.55], [0.3, 0.1, -1.5, -1.55], -0.2, 0.3, 0.08],
  [0.8, [0.3, 0.1, -1.45, -1.5], [0.3, 0.1, -1.45, -1.5], -0.2, 0.3, 0.08],
  [1.0, null, null, 0, 0, 0],
];
// guards: summoner keeps his hands half-raised, the sorcerer strolls with his hands in
// his pockets, the king lets his arms hang wide and lazy
STANCE.jj_sign = (st, pose) => { setArmKey(pose, -1, [0.6, 0.15, -0.6, -1.9]); setArmKey(pose, 1, [0.6, 0.15, -0.6, -1.9]); };
STANCE.jj_pockets = (st, pose) => { setArmKey(pose, -1, [-0.15, 0.32, 0.3, -0.35]); setArmKey(pose, 1, [-0.15, 0.32, 0.3, -0.35]); };
STANCE.jj_king = (st, pose) => { setArmKey(pose, -1, [-0.1, 0.55, -0.2, -0.6]); setArmKey(pose, 1, [-0.1, 0.55, -0.2, -0.6]); };

// ------------------------------------------------------------------ per-battle state
const STATE = new WeakMap();
function S(b) {
  let s = STATE.get(b);
  if (!s) STATE.set(b, (s = { dogs: [], domains: [] }));
  return s;
}
const enemyOf = (u, v) => v.alive && v.team !== u.team;
// a marker at a world point, turned any which way (cuts, sparks of a black flash)
function markSpin(b, type, pos, t) {
  const s = markAt(b, type, pos, t);
  s.quat.setFromEuler(_e.set(rand(-1.2, 1.2), rand(0, Math.PI * 2), rand(-1.2, 1.2)));
  return s;
}

// ------------------------------------------------------------------ Cursed Brawler
// Melee with fists. Each swing has a chance to be a black flash: the fist flickers
// black and red, and when it lands the victim takes bonus damage and is blown away.
// The core melee sweep does the normal hit; step() sees new victims in u.hitSet and
// adds the flash on top.
const brawler = {
  melee: true,
  init(u) { u.jjAt = 0; u.jjN = 0; u.jjFlash = false; u.jjGlow = null; },
  think: meleeThink,
  step(u, dt) {
    const b = u.battle, w = u.def.weapon, st = u.st;
    // a new swing (startAttack resets attackT and clears hitSet)
    if (st.attack && st.attackT < u.jjAt) u.jjN = -1;
    if (st.attack && u.jjN < 0) {
      u.jjN = 0;
      u.jjFlash = Math.random() < w.flash;
      if (u.jjFlash) {
        u.jjGlow = mark(b, u, 'jj_fistglow', PART.farmR, u.attackDur, new THREE.Vector3(0, -u.skel.handOffset * 1.1, 0));
        if (Math.random() < 0.6) b.voice(u, 'cry', true);
      }
    }
    u.jjAt = st.attack ? st.attackT : 0;
    if (!st.attack) {
      u.jjN = -1;
      if (u.jjGlow) { u.jjGlow.t = 0; u.jjGlow = null; }
      return;
    }
    // victims of this swing that we haven't looked at yet
    let i = 0;
    for (const v of u.hitSet) {
      if (i++ < u.jjN) continue;
      if (!u.jjFlash || !v.rag) continue;
      blackFlash(b, u, v);
      u.jjFlash = false;
      if (u.jjGlow) { u.jjGlow.t = 0; u.jjGlow = null; }
    }
    u.jjN = u.hitSet.size;
  },
  die(u) { if (u.jjGlow) { u.jjGlow.t = 0; u.jjGlow = null; } },
};
function blackFlash(b, u, v) {
  const w = u.def.weapon;
  const c = v.chestPos;
  _d.set(c.x - u.pos.x, 0, c.z - u.pos.z).normalize();
  _d.y = 0.55; _d.normalize();
  const f = Math.min(w.flashForce, v.M * 16);
  v.hit(w.damage * w.flashMul, PART.chest, _d.x * f * 0.3, _d.y * f * 0.3, _d.z * f * 0.3, u, 'jj_flash');
  if (v.parriedAt !== b.time) {
    v.rag.impulseAll(_d.x * f * 0.7, _d.y * f * 0.7, _d.z * f * 0.7);
    v.stun = Math.max(v.stun, 1.2 * (v.def.stagger ?? 1));
  }
  _p.lerpVectors(u.rag.pos[PART.farmR], c, 0.7);
  markSpin(b, 'jj_flash', _p, 0.32);
  b.emit('spark', _p.x, _p.y, _p.z, 10);
  b.emit('blood', c.x, c.y, c.z, 10, _d.x, _d.z);
  b.sound('punch', _p, 1.4, 0.6);
  b.sound('crash', _p, 0.7, 1.6);
  u.expr = EXPR.happy;
}

// ------------------------------------------------------------------ Nail Witch
// Hammers a nail at the target. The same blow strikes the straw doll in her other
// hand: if she has nailed someone in the last few seconds, they take resonance damage
// wherever they are (on a cooldown).
const nailWitch = {
  aim: true,
  init(u) { u.attackDur = u.def.weapon.windup; u.resoCD = 0; u.jjNailed = null; u.jjNailedAt = -99; },
  think: rangedThink,
  step(u, dt) { u.resoCD -= dt; },
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    const hand = handPos(u, _o);
    hand.y += 0.1 * u.s;
    aimPoint(u, _p, 0.5, 0.6);
    if (!u.aimAt && u.control && !u.control.aimPt) _p.y = hand.y + Math.tan(u.control.aimPitch) * 14;
    launchVel(hand, _p, w.speed, PJ.jj_nail.g, false, w.spread, _v);
    addProjectile(b, 'jj_nail', hand, _v, u, { life: (w.range / w.speed) * 1.6, snd: true });
    b.emit('spark', hand.x, hand.y, hand.z, 2);
    b.sound('clang', hand, 0.6, 2.2);
    b.sound('flyby', hand, 0.4, 1.8);
    // resonance through the doll
    const v = u.jjNailed;
    if (v && v.alive && v.team !== u.team && b.time - u.jjNailedAt < w.resoKeep && u.resoCD <= 0) {
      u.resoCD = w.resoCD;
      const doll = u.rag.worldPoint(PART.farmL, 0, -u.skel.handOffset * 1.2, 0, _o);
      b.emit('spark', doll.x, doll.y, doll.z, 3);
      b.delayed.push([0.12, () => {
        if (!v.alive) return;
        v.hit(w.reso, PART.chest, 0, v.M * 0.4, 0, u.alive ? u : null, 'jj_reso');
        if (v.parriedAt === b.time) return;
        v.stun = Math.max(v.stun, w.resoStun * (v.def.stagger ?? 1));
        mark(b, v, 'jj_reso', PART.chest, 0.5);
        const c = v.chestPos;
        b.emit('blood', c.x, c.y, c.z, 6, 0, 0);
        b.sound('stab', c, 0.9, 0.7);
      }]);
    }
  },
};

// ------------------------------------------------------------------ Shadow Summoner
// Two shadow wolves are kinematic extra bodies of the summoner. Between summons they
// wait under the ground beneath him; a hand sign raises them out of a pool of shadow in
// front of him, they hunt the nearest enemies for dogLife seconds (or until killed:
// they are "big targets" that blows, shots and blasts can hit) and sink back down.
const DOG_R = 0.3, DOG_Y = 0.45, RISE = 0.45, SINK = 0.5;
const DOG_REST = [-1, 1].map((sd) => ({ pos: new THREE.Vector3(sd * 0.85, DOG_Y, -0.35), quat: new THREE.Quaternion() }));
const summoner = {
  aim: false,
  init(u) {
    const b = u.battle, w = u.def.weapon, s = S(b);
    u.attackDur = w.windup;
    u.summonCD = rand(0.2, 0.8);
    u.dogs = DOG_REST.map((l, i) => {
      const e = u.addExtraBody(RAPIER.RigidBodyDesc.kinematicPositionBased(), [], l.pos, l.quat);
      const d = { u, e, i, side: i ? 1 : -1, state: 'sink', t: 0, x: e.pos.x, z: e.pos.z, y: e.pos.y, y0: e.pos.y, yaw: u.spawnYaw, vx: 0, vz: 0, hop: 0, hopV: 0, bite: 0, target: null, retarget: 0, life: 0 };
      d.g = addBig(b, { u, e, a: new THREE.Vector3(0, 0, -0.35), b: new THREE.Vector3(0, 0.05, 0.35), r: DOG_R, hp: w.dogHp, mass: 30, flesh: true, blastK: 1, onDie: () => dogGone(b, d, true) });
      d.g.alive = false; // only while out
      s.dogs.push(d);
      return d;
    });
  },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, dirx, dirz, spd } = c;
    u.expr = EXPR.normal;
    const out = u.dogs.some((d) => d.state !== 'hidden');
    // hang back at range; hold the sign while the wolves are out
    if (dist > w.range * 0.85) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (c.gap < 4) u.desired.set(-dirx * spd * 0.7, 0, -dirz * spd * 0.7);
    if (!out && u.summonCD <= 0 && dist < w.range + 4 && !u.st.attack && u.stun <= 0 && !u.isDown()) u.startAttack();
    if (u.st.attack) u.desired.multiplyScalar(0.2);
    return t;
  },
  control(u, dt, c) {
    if (c.attack && !u.st.attack && u.summonCD <= 0 && u.dogs.every((d) => d.state === 'hidden')) u.startAttack();
    return true;
  },
  step(u, dt) {
    if (u.dogs.every((d) => d.state === 'hidden')) u.summonCD -= dt;
  },
  event(u, t0, t1) {
    if (!crossed(t0, t1, u.def.weapon.releaseAt)) return;
    const b = u.battle, w = u.def.weapon;
    u.released = true;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    for (const d of u.dogs) {
      if (d.state !== 'hidden') continue;
      d.x = u.pos.x + fx * 1.5 - fz * d.side * 0.8;
      d.z = u.pos.z + fz * 1.5 + fx * d.side * 0.8;
      d.yaw = u.heading; d.vx = d.vz = 0; d.hop = 0; d.hopV = 0;
      d.state = 'rise'; d.t = 0; d.life = w.dogLife; d.bite = 0.3; d.target = null;
      const gy = b.terrain.height(d.x, d.z);
      markAt(b, 'jj_pool', _p.set(d.x, gy + 0.03, d.z), RISE + 0.9);
      b.emit('dust', d.x, gy, d.z, 2);
    }
    u.summonCD = w.dogCD;
    b.sound('whoosh', u.pos, 1.0, 0.4);
    b.sound('thump', u.pos, 0.7, 0.5);
    if (Math.random() < 0.7) b.voice(u, 'cry', true);
  },
  die(u) { for (const d of u.dogs) if (d.state !== 'hidden') dogGone(u.battle, d, false); },
};
function dogGone(b, d, killed) {
  if (d.state === 'hidden' || d.state === 'sink') return;
  d.state = 'sink'; d.t = 0; d.y0 = d.y; d.g.alive = false;
  const gy = b.terrain.height(d.x, d.z);
  markAt(b, 'jj_pool', _p.set(d.x, gy + 0.03, d.z), SINK + 0.6);
  if (killed) { b.emit('dust', d.x, gy + 0.3, d.z, 3); b.sound('crunch', _p, 0.6, 1.4); }
}
function nearestEnemyTo(b, team, x, z, range) {
  let best = null, bd = range * range;
  for (const o of b.teams[1 - team]) {
    if (!o.alive) continue;
    const dd = (o.pos.x - x) ** 2 + (o.pos.z - z) ** 2;
    if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}
function stepDog(b, d, dt) {
  const u = d.u, w = u.def.weapon, e = d.e;
  if (d.state !== 'hidden' && d.state !== 'sink' && (!u.alive || b.over)) dogGone(b, d, false);
  if (d.state === 'hidden') { // waiting in his shadow, under the ground
    _p.set(u.pos.x, b.terrain.height(u.pos.x, u.pos.z) - 3, u.pos.z);
    placeExtra(e, _p, e.quat);
    return;
  }
  d.t += dt;
  const gy = b.terrain.height(d.x, d.z);
  let y = gy + DOG_Y, pitch = 0;
  if (d.state === 'rise') {
    const k = clamp(d.t / RISE, 0, 1);
    y = gy - 0.9 + (DOG_Y + 0.9) * k;
    pitch = -0.5 * (1 - k);
    if (k >= 1) { d.state = 'hunt'; d.g.alive = true; d.g.hp = d.g.maxHp; }
  } else if (d.state === 'sink') {
    const k = clamp(d.t / SINK, 0, 1);
    y = d.y0 - (d.y0 - gy + 0.9) * k;
    if (k >= 1) { d.state = 'hidden'; d.g.alive = false; }
  } else {
    // hunt: run at the nearest enemy, bite on a cooldown, a bounding gait
    d.life -= dt; d.bite -= dt; d.retarget -= dt;
    if (d.life <= 0) { dogGone(b, d, false); return stepDog(b, d, 0); }
    if (!d.target || !d.target.alive || d.retarget <= 0) { d.target = nearestEnemyTo(b, u.team, d.x, d.z, 40); d.retarget = rand(0.4, 0.8); }
    const t = d.target;
    let gx = 0, gz = 0, sp = w.dogSpeed;
    if (t) {
      const dx = t.pos.x - d.x, dz = t.pos.z - d.z, dist = Math.hypot(dx, dz) || 1;
      const reach = t.skel.radius + DOG_R + 0.45;
      d.yaw = Math.atan2(dx, dz);
      if (dist > reach) { gx = dx / dist; gz = dz / dist; }
      else if (dist < reach * 0.6) { gx = -dx / dist * 0.4; gz = -dz / dist * 0.4; }
      if (dist < reach + 0.35 && d.bite <= 0) {
        d.bite = w.dogBite * rand(0.85, 1.15);
        d.hopV = 3.2;
        _d.set(dx / dist, 0.25, dz / dist).normalize();
        strike(b, t, w.dogDmg, _d, w.dogForce, u, 'jj_bite', PART.chest, 'crunch');
      }
    } else { // nobody left: trot back to the summoner
      const dx = u.pos.x - d.x, dz = u.pos.z - d.z, dist = Math.hypot(dx, dz) || 1;
      if (dist > 2) { gx = dx / dist; gz = dz / dist; d.yaw = Math.atan2(dx, dz); }
      sp *= 0.5;
    }
    // keep apart from the other wolves
    for (const o of S(b).dogs) {
      if (o === d || o.state !== 'hunt') continue;
      const dx = d.x - o.x, dz = d.z - o.z, dd = Math.hypot(dx, dz);
      if (dd < 0.9 && dd > 1e-4) { gx += dx / dd * (0.9 - dd) * 2; gz += dz / dd * (0.9 - dd) * 2; }
    }
    const k = Math.min(1, dt * 8);
    d.vx += (gx * sp - d.vx) * k; d.vz += (gz * sp - d.vz) * k;
    d.x = clamp(d.x + d.vx * dt, -FIELD.x - 6, FIELD.x + 6);
    d.z = clamp(d.z + d.vz * dt, -FIELD.z - 5, FIELD.z + 5);
    const hs = Math.hypot(d.vx, d.vz);
    // bounding: a hop every stride while running, plus the lunge of a bite
    d.hopV -= 14 * dt;
    d.hop = Math.max(0, d.hop + d.hopV * dt);
    if (d.hop <= 0) d.hopV = hs > 1.5 ? 2.2 : 0;
    y = b.terrain.height(d.x, d.z) + DOG_Y + d.hop;
    pitch = clamp(-d.hopV * 0.12, -0.35, 0.35);
    if (hs > 2 && Math.random() < dt * 3) b.emit('dust', d.x, y - DOG_Y, d.z, 0.5);
  }
  d.y = y;
  _q.setFromEuler(_e.set(pitch, d.yaw, 0, 'YXZ'));
  placeExtra(e, _p.set(d.x, y, d.z), _q);
  updateBig(d.g);
}

// ------------------------------------------------------------------ Cursed Speaker
// A support unit: closes to range and, on a long cooldown, says one word. Every enemy
// in a cone in front is knocked off its feet (big units only stagger). The word costs
// him a little hp (a sore throat).
const speaker = {
  aim: false,
  init(u) { u.attackDur = u.def.weapon.windup; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, dirx, dirz, spd } = c;
    u.expr = EXPR.normal;
    if (dist > w.range * 0.7) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (c.gap < 2.5) u.desired.set(-dirx * spd * 0.6, 0, -dirz * spd * 0.6);
    if (dist < w.range * 0.9 && u.cooldown <= 0 && !u.st.attack && u.stun <= 0 && !u.isDown()) u.startAttack();
    if (u.st.attack) u.desired.multiplyScalar(0.15);
    return t;
  },
  event(u, t0, t1) {
    const w = u.def.weapon;
    if (!crossed(t0, t1, w.releaseAt)) return;
    const b = u.battle, h = u.heading, fx = Math.sin(h), fz = Math.cos(h);
    const p = u.chestPos, R = w.range;
    u.released = true;
    b.voice(u, 'cry', true);
    b.sound('boom', p, 0.7, 0.45);
    b.sound('gong', p, 0.5, 0.35);
    b.grid.query(p.x, p.z, R + 1, (v) => {
      if (!enemyOf(u, v)) return;
      const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > R + v.skel.radius || (dx * fx + dz * fz) < d * w.cone) return;
      const k = 1 - (d / R) * 0.4, big = v.s > 1.6;
      v.hit(w.damage * k, PART.chest, 0, 0, 0, u, 'jj_word');
      if (v.parriedAt === b.time) return;
      // pushed over backwards: the chest goes back, the feet stay
      const f = v.M * (big ? 1.2 : 3.2) * k;
      v.rag.impulse(PART.chest, dx / (d || 1) * f, -f * 0.2, dz / (d || 1) * f);
      v.rag.impulse(PART.head, dx / (d || 1) * f * 0.3, 0, dz / (d || 1) * f * 0.3);
      v.stun = Math.max(v.stun, w.stun * k * (big ? 0.4 : 1) * (v.def.stagger ?? 1));
      if (v.st.attack && !big) { v.st.attack = null; v.st.attackT = 0; }
      v.expr = EXPR.scared;
    });
    // the word itself: rings flying out, dust kicked up along the cone
    for (let i = 0; i < 3; i++) {
      _o.set(p.x + fx * 0.5, p.y + 0.35 * u.s, p.z + fz * 0.5);
      _v.set(fx * (12 + i * 3), 0, fz * (12 + i * 3));
      addProjectile(b, 'jj_word', _o, _v, u, { life: R / (12 + i * 3), damage: 0, force: 0 });
    }
    for (let i = 1; i <= 3; i++) {
      const x = p.x + fx * i * R / 3.3, z = p.z + fz * i * R / 3.3;
      b.emit('dust', x, b.terrain.height(x, z), z, 1.5);
    }
    // a sore throat
    u.hp = Math.max(1, u.hp - w.selfCost);
    b.delayed.push([0.5, () => { if (u.alive) { const hd = u.headPos; b.emit('blood', hd.x, hd.y - 0.1, hd.z, 1, fx, fz); b.voice(u, 'hurt'); } }]);
  },
};

// ------------------------------------------------------------------ Blindfolded Sorcerer
// Infinity is on for infUp seconds, then off for infDown. While on, enemy shots that
// come within reach slow down and hang in the air (and drop when it goes off), blows
// are stopped short (kind.parry), blasts only do a third, and enemies can't push in
// closer than arm's length. Attack: a slow void orb that ploughs through a line.
const INF_R = 1.9;
const sorcerer = {
  aim: true,
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.infOn = true; u.infT = w.infUp * rand(0.6, 1); u.rippleT = 0; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (crossed(t0, t1, 0.25)) { const c = u.chestPos; b.sound('magic', c, 0.5, 0.6); }
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    const c = u.chestPos;
    _o.set(c.x + fx * 0.9 * u.s, c.y + 0.05, c.z + fz * 0.9 * u.s);
    aimPoint(u, _p, 0.3, 0.8);
    if (!u.aimAt && u.control && !u.control.aimPt) _p.y = _o.y + Math.tan(u.control.aimPitch) * 14;
    launchVel(_o, _p, w.speed, 0, false, 0.01, _v);
    addProjectile(b, 'jj_orb', _o, _v, u, { life: w.range / w.speed, spin: new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)) });
    b.sound('boom', _o, 0.9, 0.5);
    b.sound('whoosh', _o, 1.2, 0.35);
    b.emit('spark', _o.x, _o.y, _o.z, 4);
    u.rag.impulseAll(-fx * u.M * 0.8, 0, -fz * u.M * 0.8);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.infT -= dt;
    u.rippleT -= dt;
    if (u.infT <= 0) {
      u.infOn = !u.infOn;
      u.infT = u.infOn ? w.infUp : w.infDown;
      const c = u.chestPos;
      if (!u.infOn) { b.emit('spark', c.x, c.y, c.z, 3); b.sound('click', c, 0.6, 0.6); dropHeld(b, u); }
      else b.sound('heal', c, 0.4, 1.8);
    }
    if (!u.infOn || u.stun > 0.5) return;
    const c = u.chestPos, R2 = (INF_R * u.s) ** 2;
    // shots hang in the air
    for (const pr of b.projectiles) {
      if (pr.team === u.team || PASS.has(pr.type)) continue;
      const dx = pr.pos.x - c.x, dy = pr.pos.y - c.y, dz = pr.pos.z - c.z;
      if (dx * dx + dy * dy + dz * dz > R2) continue;
      if (!pr.jjHeld) {
        pr.jjHeld = u;
        if (u.rippleT <= 0) { u.rippleT = 0.12; markAt(b, 'jj_ripple', pr.pos, 0.35); }
        b.sound('tick', pr.pos, 0.5, 1.6);
      }
      pr.vel.multiplyScalar(1 - Math.min(0.95, 16 * dt));
      pr.vel.y += b.projGravity(pr.type) * dt; // (cancels this step's gravity: it hangs)
      pr.life = Math.max(pr.life, 0.6);
      if (pr.fuse > 0) pr.fuse += dt * 0.9;
    }
    // enemies can't push in closer
    b.grid.query(c.x, c.z, 2.5 * u.s, (v) => {
      if (!enemyOf(u, v) || v.bc) return;
      const dx = v.pos.x - c.x, dz = v.pos.z - c.z, d = Math.hypot(dx, dz) || 1;
      if (d > u.skel.radius + v.skel.radius + 0.5) return;
      const vel = v.rag.vel[PART.pelvis], inward = -(vel.x * dx + vel.z * dz) / d;
      if (inward > 0) v.rag.impulseAll(dx / d * inward * v.M * 0.3, 0, dz / d * inward * v.M * 0.3);
    });
  },
  parry(u, attacker, kind) {
    if (!u.infOn || u.stun > 0.5 || kind === 'poison' || kind === 'burn' || kind === 'blast' || kind === 'thorns') return false;
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
  hit(u, amount, part, attacker, kind) {
    const t = u.battle.time;
    if (u.parriedAt === t) return 0;
    if (!u.infOn) return amount;
    if (kind === 'blast') return amount * 0.33;
    if (kind === 'poison' || kind === 'burn') return amount;
    return sorcerer.parry(u, attacker, kind) ? 0 : amount;
  },
  die(u) { dropHeld(u.battle, u); },
};
const PASS = new Set(['jj_word', 'ev_gust']); // things that aren't really shots
function dropHeld(b, u) {
  for (const pr of b.projectiles) if (pr.jjHeld === u) { pr.jjHeld = null; pr.vel.set(rand(-0.3, 0.3), -0.5, rand(-0.3, 0.3)); }
}
// the orb: anyone along its path is ploughed aside (each victim once)
function orbHit(b, pr, v) {
  if (!enemyOf(pr, v) || pr.hits.has(v)) return;
  pr.hits.add(v);
  const c = v.chestPos;
  _d.copy(pr.vel).normalize();
  // aside, away from the line, and up
  _v.set(c.x - pr.pos.x, 0, c.z - pr.pos.z);
  const side = _v.x * -_d.z + _v.z * _d.x >= 0 ? 1 : -1;
  _v.set(_d.x * 0.7 - _d.z * side * 0.6, 0.45, _d.z * 0.7 + _d.x * side * 0.6).normalize();
  strike(b, v, pr.damage, _v, Math.min(pr.force, v.M * 14), pr.owner, 'jj_orb', PART.chest, 'crunch');
  if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 1.0 * (v.def.stagger ?? 1));
  b.emit('spark', c.x, c.y, c.z, 3);
}

// ------------------------------------------------------------------ Four-Armed King
// Walks into the enemy and cuts: each attack sends invisible slashes at the nearest
// enemies around him (one per arm). On a long cooldown, with enough enemies close, he
// opens a domain: a dark dome where cuts hit everyone inside every few tenths of a
// second for a few seconds (his own side takes half).
const king = {
  aim: false,
  init(u) { u.domCD = u.def.weapon.domFirst; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, dirx, dirz, spd } = c;
    u.expr = c.gap < 6 ? EXPR.angry : EXPR.normal;
    if (c.gap > w.range * 0.45) u.desired.set(dirx * spd, 0, dirz * spd);
    if (c.gap < w.range && u.cooldown <= 0 && !u.st.attack && u.stun <= 0) u.startAttack();
    if (u.st.attack) u.desired.multiplyScalar(0.5);
    return t;
  },
  event(u, t0, t1) {
    const w = u.def.weapon;
    for (const at of [0.42, 0.62]) if (crossed(t0, t1, at)) slashes(u, w.cuts / 2);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.domCD -= dt;
    if (u.domCD > 0 || u.stun > 0.3 || b.over) return;
    let n = 0;
    const p = u.pos, R = w.domR * 0.8;
    b.grid.query(p.x, p.z, R, (v) => { if (enemyOf(u, v) && (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2 < R * R) n++; });
    if (n < w.domMin && !(u.control && n > 0)) { u.domCD = 0.5; return; }
    u.domCD = w.domCD;
    const gy = b.terrain.height(p.x, p.z);
    const pos = new THREE.Vector3(p.x, gy, p.z);
    S(b).domains.push({ pos, t: w.domDur, owner: u, team: u.team, tick: 0.3, mk: markAt(b, 'jj_domain', pos, w.domDur) });
    b.emit('dust', pos.x, gy, pos.z, 6);
    b.emit('spark', pos.x, gy + 1, pos.z, 8);
    b.sound('gong', pos, 1.2, 0.3);
    b.sound('boom', pos, 0.8, 0.4);
    b.voice(u, 'cry', true);
  },
};
function slashes(u, n) {
  const b = u.battle, w = u.def.weapon, p = u.pos, R = w.range + u.skel.radius;
  const list = [];
  b.grid.query(p.x, p.z, R + 1, (v) => {
    if (!enemyOf(u, v)) return;
    const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - v.skel.radius;
    if (d < R) list.push([d + rand(0, 1.5), v]);
  });
  list.sort((a, c) => a[0] - c[0]);
  for (let i = 0; i < Math.min(n, list.length); i++) cut(b, list[i][1], w.damage, w.force, u);
  b.sound('whoosh', u.chestPos, 0.9, 1.6);
}
function cut(b, v, dmg, force, att) {
  const c = v.chestPos;
  const a = rand(0, Math.PI * 2);
  _d.set(Math.cos(a), 0.3, Math.sin(a)).normalize();
  strike(b, v, dmg, _d, Math.min(force, v.M * 8), att, 'jj_cut', PART.chest, 'slash');
  if (v.parriedAt !== b.time) markSpin(b, 'jj_cut', c, 0.22);
}
function stepDomains(b, dt) {
  const s = STATE.get(b);
  if (!s || !s.domains.length) return;
  for (let i = s.domains.length - 1; i >= 0; i--) {
    const dm = s.domains[i];
    dm.t -= dt;
    dm.tick -= dt;
    if (dm.t <= 0 || !dm.owner.alive) { dm.mk.t = 0; s.domains.splice(i, 1); continue; }
    if (dm.tick > 0) continue;
    dm.tick = 0.4;
    const w = dm.owner.def.weapon, R = DOMAIN_R;
    let marks = 0;
    b.grid.query(dm.pos.x, dm.pos.z, R + 1, (v) => {
      if (!v.alive || v === dm.owner) return;
      const c = v.chestPos;
      if ((c.x - dm.pos.x) ** 2 + (c.z - dm.pos.z) ** 2 > R * R || c.y - dm.pos.y > R) return;
      const ally = v.team === dm.team;
      const dmg = w.domDmg * (ally ? 0.5 : 1);
      _d.set(rand(-1, 1), 0.3, rand(-1, 1)).normalize();
      strike(b, v, dmg, _d, Math.min(w.force * 0.5, v.M * 5), dm.owner, 'jj_cut', PART.chest, marks < 4 ? 'slash' : null);
      if (marks++ < 8 && v.parriedAt !== b.time) markSpin(b, 'jj_cut', c, 0.2);
    });
  }
}

// ------------------------------------------------------------------ projectiles
const PJ = {
  jj_nail: arrowProj({
    g: 3, len: 0.3, r: 0.03, life: 3,
    onHit(b, v, pr) { if (pr.owner) { pr.owner.jjNailed = v; pr.owner.jjNailedAt = b.time; } },
  }),
  jj_orb: {
    g: 0, len: 0, r: 0.7, life: 3,
    step(b, pr) {
      const R = 0.85;
      b.grid.query(pr.pos.x, pr.pos.z, R + 2, (v) => {
        if (!enemyOf(pr, v) || pr.hits.has(v)) return;
        const c = v.chestPos;
        // distance from the orb's last move to the chest
        _o.copy(c).sub(pr.prev);
        _v.copy(pr.pos).sub(pr.prev);
        const L2 = _v.lengthSq(), k = L2 > 1e-9 ? clamp(_o.dot(_v) / L2, 0, 1) : 0;
        _o.copy(pr.prev).addScaledVector(_v, k);
        if (_o.distanceTo(c) < R + v.skel.radius) orbHit(b, pr, v);
      });
      // it shoves corpses aside too
      if (Math.random() < 0.5) b.emit('spark', pr.pos.x + rand(-0.3, 0.3), pr.pos.y + rand(-0.3, 0.3), pr.pos.z + rand(-0.3, 0.3), 0.4);
      const gy = b.terrain.height(pr.pos.x, pr.pos.z);
      if (pr.pos.y - gy < 1.2 && Math.random() < 0.3) b.emit('dust', pr.pos.x, gy, pr.pos.z, 0.6);
    },
    hit(b, pr, v) { orbHit(b, pr, v); return false; },
    ground(b, pr) { b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 6); b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 3); b.sound('thump', pr.pos, 0.8, 0.5); return true; },
  },
  jj_word: { g: 0, len: 0.01, r: 0.3, life: 0.7, hit: () => false, ground: () => true },
  // markers
  jj_flash: { g: 0, len: 0, r: 0, life: 1 },
  jj_fistglow: { g: 0, len: 0, r: 0, life: 1 },
  jj_reso: { g: 0, len: 0, r: 0, life: 1 },
  jj_pool: { g: 0, len: 0, r: 0, life: 1 },
  jj_ripple: { g: 0, len: 0, r: 0, life: 1 },
  jj_cut: { g: 0, len: 0, r: 0, life: 1 },
  jj_domain: { g: 0, len: 0, r: 0, life: 1 },
};

// ------------------------------------------------------------------ units
const STUDENT = { aggro: 0.9, bravery: 0.1, voice: 1.0, chatter: 0.7 };
const units = [
  {
    id: 'jj_spirit', name: 'Cursed Spirit', faction: 'jujutsu', cost: 35, hp: 80, speed: 4.9,
    build: { scale: 0.78, girth: 1.45, head: 1.55, legs: 0.6, arms: 0.85, mass: 1.1 },
    weapon: { line: 'Melee · a cheap many-eyed blob, comes in swarms', kind: 'melee', style: 'none', anim: 'punch', item: 'jj_claw', damage: 24, reach: 0.9, cooldown: 0.8, force: 200 },
    look: { skin: '#9d8fb8', hat: 'jj_eyes', top: 'jj_blob', legs: '#8a7ca6', accent: '#6a5a88', bare: true },
    personality: { aggro: 1, bravery: 0, voice: 1.75, chatter: 1, cry: 'cackle', idle: 'hop' },
    desc: 'Too many eyes, not enough brains.',
  },
  {
    id: 'jj_brawler', name: 'Cursed Brawler', faction: 'jujutsu', cost: 125, hp: 160, speed: 5.3,
    build: { scale: 1.0, girth: 1.02, arms: 1.05, armThick: 1.15 },
    weapon: { line: 'Melee · cursed fists, sometimes a black flash', kind: 'jj_brawler', style: 'none', anim: 'punch', item: 'jj_fist', damage: 30, reach: 1.0, cooldown: 0.7, force: 360, flash: 0.2, flashMul: 2.5, flashForce: 1500 },
    look: { skin: '#eab896', hat: 'jj_hair_brawler', top: 'jj_uniform', legs: NAVY, accent: '#2a2420' },
    personality: { ...STUDENT, aggro: 1, bravery: 0, cry: 'charge', idle: 'bounce', chatter: 0.8 },
    desc: 'Punches with cursed energy. Every so often the punch lands a black flash.',
  },
  {
    id: 'jj_nail', name: 'Nail Witch', faction: 'jujutsu', cost: 160, hp: 95, speed: 4.5,
    build: { scale: 0.95, girth: 0.92, head: 1.05 },
    weapon: { line: 'Ranged · hammers nails; her straw doll hurts the last one nailed', kind: 'jj_nail', style: 'sword', anim: 'overhead', item: 'jj_hammer', damage: 30, speed: 30, range: 22, minRange: 6, cooldown: 2.9, force: 120, spread: 0.035, releaseAt: 0.55, windup: 0.75, reso: 30, resoCD: 5, resoKeep: 12, resoStun: 0.5 },
    look: { skin: '#f0c8a8', hat: 'jj_hair_witch', top: 'jj_uniform_skirt', legs: '#2a2a38', accent: '#2a2420' },
    personality: { ...STUDENT, aggro: 0.4, bravery: 0.2, voice: 1.4, cry: 'hey', idle: 'shift' },
    desc: 'Hammers nails at range. The straw doll makes the last one nailed feel it again.',
  },
  {
    id: 'jj_shadow', name: 'Shadow Summoner', faction: 'jujutsu', cost: 420, hp: 120, speed: 4.6,
    build: { scale: 1.0, girth: 0.95 },
    weapon: { line: 'Summoner · two shadow wolves rise from his shadow and hunt', kind: 'jj_shadow', style: 'jj_sign', anim: 'jj_sign', item: 'none', damage: 0, range: 14, minRange: 4, cooldown: 1, windup: 1.0, releaseAt: 0.6, dogHp: 90, dogDmg: 20, dogForce: 160, dogBite: 0.85, dogSpeed: 8, dogLife: 11, dogCD: 4 },
    look: { skin: '#e8c0a0', hat: 'jj_hair_shadow', top: 'jj_uniform', legs: NAVY, accent: '#2a2420' },
    personality: { ...STUDENT, aggro: 0.3, bravery: 0.25, voice: 0.95, chatter: 0.5, cry: 'magic', idle: 'brace' },
    desc: 'Makes a hand sign and two shadow wolves climb out of his shadow.',
  },
  {
    id: 'jj_speaker', name: 'Cursed Speaker', faction: 'jujutsu', cost: 200, hp: 105, speed: 4.6,
    build: { scale: 0.97, girth: 0.95 },
    weapon: { line: 'Support · one word knocks down every enemy in a cone', kind: 'jj_speaker', style: 'none', anim: 'jj_shout', item: 'none', damage: 10, range: 9, cooldown: 7, windup: 0.9, releaseAt: 0.5, cone: 0.55, stun: 1.8, selfCost: 6 },
    look: { skin: '#f0d0b8', hat: 'jj_collar', top: 'jj_uniform', legs: NAVY, accent: '#2a2420' },
    personality: { ...STUDENT, aggro: 0.45, bravery: 0.25, voice: 0.85, chatter: 0.15, cry: 'roar', idle: 'lean' },
    desc: 'Hardly ever talks. When he does, everyone in front of him falls over.',
  },
  {
    id: 'jj_sorcerer', name: 'Blindfolded Sorcerer', faction: 'jujutsu', cost: 1450, hp: 460, speed: 4.8,
    build: { scale: 1.12, girth: 0.92, legs: 1.08 },
    weapon: { line: 'Hero · infinity stops shots and blows short of him · void orb ploughs a line', kind: 'jj_sorcerer', style: 'jj_pockets', anim: 'jj_push', item: 'none', damage: 110, speed: 12, range: 26, minRange: 5, cooldown: 5.5, force: 900, windup: 1.2, releaseAt: 0.6, infUp: 6, infDown: 3 },
    look: { skin: '#f4d8c4', hat: 'jj_blindfold', top: 'jj_uniform_long', legs: NAVY, accent: '#1a1a22' },
    personality: { aggro: 0.6, bravery: 0, voice: 1.05, chatter: 0.9, cry: 'la', idle: 'regal' },
    armor: 0.05, stagger: 0.5,
    desc: 'Nothing quite reaches him. Then a purple orb flattens the whole line.',
  },
  {
    id: 'jj_king', name: 'Four-Armed King', faction: 'jujutsu', cost: 2800, hp: 2000, speed: 4.6,
    build: { scale: 1.35, girth: 1.08, arms: 1.1, armThick: 1.1, mass: 1.3 },
    weapon: { line: 'Boss · invisible cuts all around · a domain where cuts hit everyone inside', kind: 'jj_king', style: 'jj_king', anim: 'dual', item: 'none', damage: 50, range: 6.5, cooldown: 1.4, force: 420, cuts: 4, domR: DOMAIN_R, domDur: 4, domDmg: 12, domCD: 14, domFirst: 5, domMin: 4 },
    look: { skin: '#e8b898', hat: 'jj_king_hair', top: 'jj_kimono', legs: '#2a1e2a', accent: '#1a1418' },
    personality: { aggro: 0.9, bravery: 0, voice: 0.55, chatter: 0.8, cry: 'cackle', idle: 'regal' },
    armor: 0.1, stagger: 0.25,
    desc: 'Four arms, no manners. Cuts everything near him, and sometimes everything at all.',
  },
];

// ------------------------------------------------------------------ visuals
// spiky hair: n cones from the scalp (dirs fanned over the top and back of the head)
function spikes(H, g, r, m, n, len, upK = 0.5, seed = 1) {
  const { mesh, cone } = H;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed, el = 0.35 + ((i * 7 + seed * 3) % 5) / 5 * 0.9;
    const dx = Math.sin(a) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(a) * Math.cos(el) - 0.35;
    if (dz > 0.45 && dy < 0.75) continue; // keep the face clear
    const dir = new THREE.Vector3(dx, dy + upK, dz).normalize();
    const L = r * len * (0.8 + ((i * 5) % 3) * 0.15);
    const c = mesh(cone(r * 0.2, L, 5), m, dir.x * r * 0.8, dir.y * r * 0.8 + r * 0.1, dir.z * r * 0.8, g);
    c.quaternion.setFromUnitVectors(UPY, dir);
    c.position.addScaledVector(dir, L * 0.4);
  }
}
// a cap of hair over the top and back of the head (forehead edge tilted up)
function hairCap(H, g, r, m, k = 1.07, frac = 0.36) {
  const c = H.mesh(dome(H, r * k, frac), m, 0, r * 0.04, -r * 0.05, g);
  c.rotation.x = -0.35;
  return c;
}

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, octa, mat, wood, metal } = H;
  if (name === 'jj_fist') { // (the fist itself: a wrap of cursed energy round the knuckles)
    const m = mesh(octa(0.06 * s), mat('#b8c4ff', { emit: 1, transparent: true, opacity: 0.7, depthWrite: false }), 0, 0.05 * s, 0.04 * s, g);
    m.castShadow = false;
    return true;
  }
  if (name === 'jj_claw') return true; // (the spirit's claws are part of its body: decorate)
  if (name === 'jj_hammer') { // a carpenter's hammer: wooden handle, iron head across it
    mesh(cyl(0.025 * s, 0.03 * s, 0.42 * s, 8), wood(), 0, 0.14 * s, 0, g);
    mesh(cyl(0.032 * s, 0.032 * s, 0.08 * s, 8), tcol(H, team), 0, -0.02 * s, 0, g);
    const hd = mesh(box(0.06 * s, 0.07 * s, 0.22 * s), mat('#4a4c56', { spec: 0.9 }), 0, 0.37 * s, 0.02 * s, g); void hd;
    mesh(cyl(0.04 * s, 0.035 * s, 0.05 * s, 8), metal(), 0, 0.37 * s, 0.15 * s, g).rotation.x = Math.PI / 2; // the face
    for (const sd of [-1, 1]) { const cl = mesh(box(0.02 * s, 0.05 * s, 0.07 * s), mat('#4a4c56', { spec: 0.9 }), sd * 0.015 * s, 0.37 * s, -0.11 * s, g); cl.rotation.x = 0.5; } // claw
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'jj_hair_brawler': { // short messy brown hair
      const hair = mat('#5a3a26', { spec: 0.15 });
      hairCap(H, g, r, hair, 1.07, 0.36);
      spikes(H, g, r, hair, 15, 0.6, 0.35, 0.4);
      return true;
    }
    case 'jj_hair_shadow': { // a big shock of black spikes
      const hair = mat('#16161e', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.07, 0.38);
      spikes(H, g, r, hair, 16, 0.85, 0.55, 1.3);
      return true;
    }
    case 'jj_hair_witch': { // an auburn bob with a nail for a hairpin
      const hair = mat('#a8522a', { spec: 0.15 });
      hairCap(H, g, r, hair, 1.08, 0.4);
      const back = mesh(sphere(r * 1.08, 16, 10), hair, 0, r * 0.05, -r * 0.18, g); back.scale.set(1.04, 0.95, 0.85);
      for (const sd of [-1, 1]) { const s = mesh(capsule(r * 0.32, r * 0.75), hair, sd * r * 0.8, -r * 0.25, r * 0.1, g); s.rotation.z = sd * 0.12; }
      for (let i = -2; i <= 2; i++) mesh(sphere(r * 0.24, 8, 6), hair, i * r * 0.22, r * 0.7, r * 0.62 - Math.abs(i) * r * 0.08, g).scale.set(1, 0.6, 0.7); // fringe
      const nail = mesh(cyl(r * 0.035, r * 0.02, r * 0.9, 5), mat('#b8bcc6', { spec: 1 }), r * 0.75, r * 0.55, r * 0.1, g); nail.rotation.z = 1.0;
      mesh(cyl(r * 0.09, r * 0.09, r * 0.04, 8), mat('#b8bcc6', { spec: 1 }), r * 1.12, r * 0.8, r * 0.1, g).rotation.z = 1.0;
      mesh(sphere(r * 0.1, 6, 5), tc, -r * 0.7, r * 0.6, r * 0.35, g); // team hair clip
      return true;
    }
    case 'jj_collar': { // ash hair, and a tall zipped collar up over the mouth
      const hair = mat('#c8ccd4', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.07, 0.38);
      spikes(H, g, r, hair, 9, 0.35, 0.1, 2.2);
      const uni = mat(NAVY, { spec: 0.2 });
      headBand(H, r, -0.5, 0.66, uni, g, 0.16);
      headBand(H, r, -0.19, 0.06, mat('#3a3f58'), g, 0.17); // the collar's rim, just under the nose
      mesh(box(r * 0.1, r * 0.16, r * 0.05), mat(GOLD, { spec: 1 }), 0, -r * 0.32, r * 1.13, g); // zip pull
      // a curse seal on each cheek above the collar
      for (const sd of [-1, 1]) { const m = mesh(torus(H, r * 0.09, r * 0.025, Math.PI * 2, 10), mat('#1a1420'), sd * r * 0.55, -r * 0.08, r * 0.82, g); m.rotation.y = sd * 0.6; }
      return true;
    }
    case 'jj_blindfold': { // white hair standing straight up, a black blindfold
      const hair = mat('#f2f4f8', { spec: 0.3 });
      hairCap(H, g, r, hair, 1.08, 0.38);
      spikes(H, g, r, hair, 18, 0.8, 1.6, 0.7);
      for (let i = -2; i <= 2; i++) { const c = mesh(cone(r * 0.16, r * 0.55, 5), hair, i * r * 0.2, r * 0.95, r * 0.45, g); c.rotation.x = -0.35; } // upswept fringe
      headBand(H, r, 0.04, 0.44, mat('#14141a', { spec: 0.2 }), g, 0.08);
      return true;
    }
    case 'jj_king_hair': { // swept-back dark crimson spikes, black tattoo lines on the face
      const hair = mat('#7a2232', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.07, 0.36);
      spikes(H, g, r, hair, 13, 0.6, -0.1, 0.2);
      const ink = mat('#141016');
      for (const sd of [-1, 1]) {
        for (const [y, w, a] of [[0.45, 0.32, 0.25], [-0.15, 0.4, -0.15], [-0.35, 0.3, 0.1]]) {
          const zz = Math.sqrt(Math.max(0.05, 1 - y * y - 0.3)) * r * 1.02;
          const l = mesh(box(r * w, r * 0.06, r * 0.04), ink, sd * r * 0.55, y * r, zz, g);
          l.rotation.set(0, sd * 0.55, sd * a);
        }
      }
      mesh(box(r * 0.07, r * 0.25, r * 0.04), ink, 0, r * 0.62, r * 0.82, g); // a mark on the brow
      return true;
    }
    case 'jj_eyes': { // the cursed spirit's head: a lumpy blob of eyes and teeth
      g.userData.hidesFace = true;
      const skin = mat('#9d8fb8', { spec: 0.2 }), white = mat('#f4f0e2'), pupil = mat('#16101a');
      for (const [x, y, z, k] of [[0.5, 0.75, -0.3, 0.45], [-0.6, 0.6, -0.4, 0.4], [0.1, 0.95, -0.1, 0.35], [-0.2, 0.5, -0.8, 0.5]]) mesh(sphere(r * k, 10, 8), skin, x * r, y * r, z * r, g); // lumps
      const eyes = [[0, 0.25, 0.9, 0.3], [-0.45, 0.42, 0.78, 0.2], [0.45, 0.45, 0.76, 0.22], [-0.68, 0.05, 0.68, 0.14], [0.7, 0.1, 0.66, 0.15], [0.2, 0.72, 0.62, 0.13], [-0.25, 0.75, 0.6, 0.11], [0.0, 1.05, 0.25, 0.16]];
      for (const [x, y, z, k] of eyes) {
        const n = new THREE.Vector3(x, y, z).normalize();
        mesh(sphere(r * k, 10, 8), white, n.x * r * 0.96, n.y * r * 0.96, n.z * r * 0.96, g);
        mesh(sphere(r * k * 0.5, 8, 6), pupil, n.x * r * (0.96 + k * 0.62), n.y * r * (0.96 + k * 0.62), n.z * r * (0.96 + k * 0.62), g);
      }
      // a wide grin full of teeth
      const mouth = mesh(sphere(r * 0.52, 14, 8), mat('#3a1424'), 0, -r * 0.42, r * 0.66, g); mouth.scale.set(1.25, 0.42, 0.6);
      for (let i = -4; i <= 4; i++) {
        const a = i * 0.16;
        for (const up of [1, -1]) { const t = mesh(cone(r * 0.06, r * 0.16, 4), white, Math.sin(a) * r * 0.6, -r * 0.42 + up * r * 0.12, Math.cos(a) * r * 0.86, g); t.rotation.x = up > 0 ? Math.PI : 0; }
      }
      mesh(sphere(r * 0.16, 8, 6), tc, 0, -r * 0.5, r * 0.85, g).scale.set(1, 0.5, 1.2); // a team-coloured tongue
      for (const sd of [-1, 1]) { const h = mesh(cone(r * 0.14, r * 0.5, 5), mat('#5a4a72'), sd * r * 0.55, r * 1.0, -r * 0.1, g); h.rotation.z = -sd * 0.5; } // little horns
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'jujutsu') return;
  const { parts, skel, extraParts } = vis;
  const { mesh, sphere, box, cyl, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const sleeves = (m) => { for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) { const sp = skel.parts[p]; mesh(capsule(sp.r * 1.15, sp.hh * 2 * (p === PART.farmL || p === PART.farmR ? 0.85 : 1)), m, 0, p === PART.farmL || p === PART.farmR ? sp.hh * 0.15 : 0, 0, parts[p]); } };
  if (top === 'jj_uniform' || top === 'jj_uniform_skirt' || top === 'jj_uniform_long') {
    // the school uniform: a dark high-collared jacket, a row of gold swirl buttons,
    // a team armband and belt
    const uni = mat(NAVY, { spec: 0.2 }), gold = mat(GOLD, { spec: 1 });
    chestShell(H, ch, uni, C);
    sleeves(uni);
    mesh(cyl(r * 0.62, r * 0.7, r * 0.55, 14), uni, 0, hh + r * 0.62, 0, C); // high collar
    mesh(cyl(r * 0.64, r * 0.64, r * 0.08, 14), td, 0, hh + r * 0.9, 0, C);
    for (const y of [0.55, 0.15, -0.25, -0.65]) {
      const z = r * 1.08 * Math.sqrt(Math.max(0.2, 1 - (y * 0.6) ** 2));
      mesh(cyl(r * 0.09, r * 0.09, r * 0.04, 10), gold, 0, y * hh + r * 0.05, z, C).rotation.x = Math.PI / 2;
      mesh(torus(H, r * 0.05, r * 0.012, Math.PI * 1.4, 8), mat('#8a6a20'), 0, y * hh + r * 0.05, z + r * 0.025, C);
    }
    mesh(cyl(r * 1.12, r * 1.14, r * 0.18, 14), tc, 0, -hh - r * 0.38, 0, C); // belt
    mesh(box(r * 0.22, r * 0.16, r * 0.06), gold, 0, -hh - r * 0.38, r * 1.12, C);
    const ua = skel.parts[PART.uarmL];
    mesh(cyl(ua.r * 1.3, ua.r * 1.3, ua.hh * 0.45, 10), tc, 0, ua.hh * 0.2, 0, parts[PART.uarmL]); // armband
    if (top === 'jj_uniform_skirt') { // pleated skirt
      const sk = mesh(cyl(pel.r * 1.15, pel.r * 1.6, pel.r * 1.7, 16), uni, 0, -pel.r * 0.6, 0, P); sk.scale.set(1, 1, 0.92);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const pl = mesh(box(pel.r * 0.08, pel.r * 1.6, pel.r * 0.1), mat('#262a3c'), Math.sin(a) * pel.r * 1.38, -pel.r * 0.62, Math.cos(a) * pel.r * 1.28, P); pl.rotation.y = a; pl.rotation.x = Math.cos(a) * 0.15; pl.rotation.z = -Math.sin(a) * 0.15; }
      // a pouch of nails on the belt
      const pouch = mesh(box(r * 0.4, r * 0.42, r * 0.3), mat('#6b4426'), r * 0.95, -hh - r * 0.6, r * 0.25, C); void pouch;
      for (let i = 0; i < 4; i++) mesh(cyl(r * 0.02, r * 0.02, r * 0.3, 4), mat('#b8bcc6', { spec: 1 }), r * (0.85 + i * 0.06), -hh - r * 0.32, r * 0.25, C);
    }
    if (top === 'jj_uniform_long') { // long coat tails
      const coat = mesh(cyl(pel.r * 1.15, pel.r * 1.45, pel.r * 2.6, 16), uni, 0, -pel.r * 1.0, -pel.r * 0.1, P); coat.scale.set(1, 1, 0.9);
      mesh(box(pel.r * 0.25, pel.r * 2.4, pel.r * 0.05), td, 0, -pel.r * 1.0, pel.r * 1.3, P);
    }
  }
  if (def.weapon.kind === 'jj_brawler') { // cursed energy wrapped round the forearms and fists
    const aura = mat(CURSE, { emit: 0.9, transparent: true, opacity: 0.45, depthWrite: false });
    for (const p of [PART.farmL, PART.farmR]) {
      const sp = skel.parts[p];
      for (let k = 0; k < 3; k++) { const t = mesh(torus(H, sp.r * 1.55, sp.r * 0.18, Math.PI * 1.5, 10), aura, 0, -sp.hh * (0.1 + k * 0.45), 0, parts[p]); t.rotation.set(Math.PI / 2 + (k - 1) * 0.3, k * 2, 0); t.castShadow = false; }
      const f = mesh(sphere(sp.r * 1.6, 10, 8), mat(CURSE, { emit: 0.9, transparent: true, opacity: 0.25, depthWrite: false }), 0, -sp.hh - sp.r * 0.3, 0, parts[p]); f.castShadow = false;
    }
  }
  if (def.weapon.kind === 'jj_nail') { // a little straw doll in the left hand, a nail in its chest
    const sp = skel.parts[PART.farmL], F = parts[PART.farmL], hy = -sp.hh - sp.r * 1.6;
    const straw = mat('#d8b860', { spec: 0.05 }), twine = mat('#8a3a2a');
    mesh(capsule(sp.r * 0.55, sp.r * 1.1), straw, 0, hy - sp.r * 0.6, sp.r * 0.9, F);
    mesh(sphere(sp.r * 0.55, 8, 6), straw, 0, hy + sp.r * 0.55, sp.r * 0.9, F);
    const arms = mesh(capsule(sp.r * 0.22, sp.r * 1.6), straw, 0, hy - sp.r * 0.15, sp.r * 0.9, F); arms.rotation.z = Math.PI / 2;
    mesh(cyl(sp.r * 0.6, sp.r * 0.6, sp.r * 0.15, 8), twine, 0, hy + sp.r * 0.05, sp.r * 0.9, F);
    const nl = mesh(cyl(sp.r * 0.05, sp.r * 0.03, sp.r * 1.4, 4), mat('#b8bcc6', { spec: 1 }), 0, hy - sp.r * 0.4, sp.r * 1.4, F); nl.rotation.x = Math.PI / 2;
  }
  if (top === 'jj_blob') { // the spirit's body: lumpy, with team-coloured warts and stubby claws
    const skin = mat(def.look.skin, { spec: 0.2 }), dark = mat('#6a5a88');
    chestShell(H, ch, skin, C, 1.05);
    for (let i = 0; i < 7; i++) { const a = i * 2.3, y = ((i * 5) % 7 / 6 - 0.5) * hh * 2; mesh(sphere(r * (0.14 + (i % 3) * 0.05), 8, 6), i % 2 ? tc : dark, Math.sin(a) * r * 1.13, y, Math.cos(a) * r * 1.05, C); }
    const eye = mesh(sphere(r * 0.25, 10, 8), mat('#f4f0e2'), r * 0.3, -hh * 0.2, r * 1.1, C); void eye; // an eye on the belly too
    mesh(sphere(r * 0.12, 8, 6), mat('#16101a'), r * 0.33, -hh * 0.2, r * 1.32, C);
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; for (let k = -1; k <= 1; k++) { const cl = mesh(cone(sp.r * 0.3, sp.r * 1.2, 4), mat('#2a2032'), k * sp.r * 0.6, -sp.hh - sp.r * 1.6, sp.r * 0.6, parts[p]); cl.rotation.x = Math.PI; } }
    mesh(cyl(pel.r * 1.1, pel.r * 1.2, pel.r * 0.5, 12), td, 0, -pel.r * 0.2, 0, P);
  }
  if (top === 'jj_kimono') { // pale kimono, dark sash, wide sleeves; a second pair of arms; tattoos
    const silk = mat('#e8e2d2', { spec: 0.15 }), sash = mat('#2a1a2a'), ink = mat('#141016');
    const skin = mat(def.look.skin, { spec: 0.18 });
    chestShell(H, ch, silk, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.2, (hh + r) * 1.25, r * 0.05), sash, sd * r * 0.3, hh * 0.35, r * 1.06, C); l.rotation.z = -sd * 0.38; } // lapels meeting in a V
    mesh(cyl(r * 1.15, r * 1.17, r * 0.42, 14), sash, 0, -hh - r * 0.3, 0, C);
    mesh(sphere(r * 0.22, 8, 6), tc, r * 0.4, -hh - r * 0.3, r * 1.05, C).scale.set(1.4, 1, 0.6); // team knot
    const robe = mesh(cyl(pel.r * 1.15, pel.r * 1.7, pel.r * 2.8, 16), silk, 0, -pel.r * 1.25, 0, P); robe.scale.set(1, 1, 0.95);
    mesh(cyl(pel.r * 1.72, pel.r * 1.72, pel.r * 0.14, 16), sash, 0, -pel.r * 2.6, 0, P).scale.set(1, 1, 0.95);
    for (const p of [PART.uarmL, PART.uarmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.3, sp.r * 1.9, sp.hh * 2.1, 10), silk, 0, -sp.hh * 0.1, 0, parts[p]); }
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; for (const y of [-0.25, -0.05]) mesh(cyl(sp.r * 1.12, sp.r * 1.12, sp.r * 0.25, 10), ink, 0, y * sp.hh * 2, 0, parts[p]); }
    // the lower pair of arms grows from the sides of the chest, bent forward, fists ready
    for (const sd of [-1, 1]) {
      const sh = new THREE.Group(); C.add(sh);
      sh.position.set(sd * r * 0.92, -hh * 0.35, r * 0.1);
      sh.rotation.set(-0.5, 0, sd * 0.35);
      const ua = skel.parts[PART.uarmL], fa = skel.parts[PART.farmL];
      mesh(cyl(ua.r * 1.2, ua.r * 1.6, ua.hh * 1.6, 10), silk, 0, -ua.hh * 0.5, 0, sh);
      mesh(capsule(ua.r, ua.hh * 2), skin, 0, -ua.hh, 0, sh);
      const el = new THREE.Group(); sh.add(el);
      el.position.set(0, -ua.hh * 2, 0); el.rotation.set(-1.2, 0, -sd * 0.2);
      mesh(capsule(fa.r, fa.hh * 2), skin, 0, -fa.hh, 0, el);
      for (const y of [-0.55, -0.75]) mesh(cyl(fa.r * 1.12, fa.r * 1.12, fa.r * 0.25, 10), ink, 0, y * fa.hh * 2, 0, el);
      mesh(sphere(fa.r * 1.45, 10, 8), skin, 0, -fa.hh * 2 - fa.r * 0.3, 0, el).scale.set(1, 1.05, 1.1);
    }
    // tattoo bands across the chest where the kimono opens
    mesh(box(r * 0.4, r * 0.06, r * 0.04), ink, 0, hh * 0.75, r * 1.0, C);
  }
  if (def.weapon.kind === 'jj_shadow') { // the two wolves (extra bodies), resting at his sides
    for (const l of DOG_REST) {
      const grp = new THREE.Group();
      wolf(H, grp, team);
      extraParts.push({ group: grp, pos: l.pos.clone(), quat: l.quat.clone() });
    }
  }
}

// a shadow wolf, facing +Z, its body centre at the origin (DOG_Y above the ground)
function wolf(H, g, team) {
  const { mesh, sphere, cone, cyl, capsule, mat, glow } = H;
  const ink = mat('#1a1428', { spec: 0.3 }), rim = mat('#3a2a5a', { spec: 0.3 });
  const body = mesh(capsule(0.2, 0.42), ink, 0, 0, 0, g); body.rotation.x = Math.PI / 2;
  mesh(sphere(0.23, 10, 8), rim, 0, 0.06, 0.18, g).scale.set(1, 1, 1.2); // shoulders
  mesh(sphere(0.16, 10, 8), ink, 0, 0.18, 0.46, g); // head
  const sn = mesh(cone(0.09, 0.34, 8), ink, 0, 0.13, 0.68, g); sn.rotation.x = Math.PI / 2;
  mesh(sphere(0.04, 6, 5), mat('#0a0810'), 0, 0.13, 0.85, g);
  const jaw = mesh(cone(0.06, 0.26, 6), rim, 0, 0.06, 0.64, g); jaw.rotation.x = Math.PI / 2 + 0.15;
  for (const sd of [-1, 1]) {
    const ear = mesh(cone(0.045, 0.14, 4), ink, sd * 0.08, 0.33, 0.4, g); ear.rotation.set(-0.35, 0, -sd * 0.25);
    mesh(sphere(0.03, 6, 5), glow('#c8a8ff'), sd * 0.07, 0.22, 0.6, g).castShadow = false;
    for (const z of [0.22, -0.22]) { const leg = mesh(capsule(0.05, 0.3), ink, sd * 0.11, -0.25, z, g); leg.rotation.x = z > 0 ? 0.35 : -0.35; }
  }
  const tail = mesh(cone(0.07, 0.4, 6), rim, 0, 0.1, -0.42, g); tail.rotation.x = -2.1;
  const collar = mesh(torus(H, 0.15, 0.03, Math.PI * 2, 12), tcol(H, team), 0, 0.12, 0.34, g); collar.rotation.x = 1.2;
  // wisps of shadow trailing off the back
  for (let i = 0; i < 3; i++) { const w = mesh(cone(0.06, 0.25, 5), mat('#2a1e48', { transparent: true, opacity: 0.6, depthWrite: false }), (i - 1) * 0.08, 0.2, -0.1 - i * 0.08, g); w.rotation.x = -1.9; w.castShadow = false; }
}

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, octa, mat, glow } = H;
  const ns = (m) => { m.castShadow = false; return m; };
  if (type === 'jj_nail') { // a long iron nail, point first (+Y)
    const iron = mat('#b8bcc6', { spec: 1 });
    mesh(cyl(0.012, 0.012, 0.26, 5), iron, 0, 0, 0, g);
    mesh(cone(0.013, 0.05, 5), iron, 0, 0.15, 0, g);
    mesh(cyl(0.03, 0.03, 0.012, 8), iron, 0, -0.13, 0, g);
    ns(mesh(cyl(0.006, 0.02, 0.4, 4), mat('#ffe6c0', { emit: 1, transparent: true, opacity: 0.4, depthWrite: false }), 0, -0.32, 0, g));
    return true;
  }
  if (type === 'jj_orb') { // a void orb: dark heart, violet glow, rings
    ns(mesh(sphere(0.32, 14, 10), mat('#14081e', { spec: 0.5 }), 0, 0, 0, g));
    ns(mesh(sphere(0.5, 16, 12), mat(VOIDC, { emit: 1, transparent: true, opacity: 0.55, depthWrite: false }), 0, 0, 0, g));
    ns(mesh(sphere(0.75, 16, 12), mat('#c8a0ff', { emit: 1, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, g));
    for (let i = 0; i < 3; i++) { const t = ns(mesh(torus(H, 0.62 + i * 0.06, 0.025, Math.PI * 2, 24), glow(i === 1 ? '#ff6ad8' : '#b48aff'), 0, 0, 0, g)); t.rotation.set(i * 1.1, i * 0.7, 0); }
    return true;
  }
  if (type === 'jj_word') { // a ring of sound flying out (faces its direction of travel, +Y)
    const m = mat('#e8dcff', { emit: 0.7, transparent: true, opacity: 0.45, depthWrite: false });
    for (let i = 0; i < 2; i++) { const t = ns(mesh(torus(H, 0.45 + i * 0.3, 0.035, Math.PI * 2, 18), m, 0, -i * 0.3, 0, g)); t.rotation.x = Math.PI / 2; }
    return true;
  }
  if (type === 'jj_flash') { // black flash: black jagged spikes round a red-hot core
    const blk = mat('#0c0610', { emit: 0.1 }), red = glow('#ff2440');
    ns(mesh(sphere(0.16, 8, 6), glow('#fff0f0'), 0, 0, 0, g));
    ns(mesh(sphere(0.42, 12, 8), mat('#ff2040', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g));
    ns(mesh(sphere(0.62, 12, 8), mat('#100008', { transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0, g));
    for (let i = 0; i < 14; i++) {
      const dir = new THREE.Vector3(Math.sin(i * 2.4) * Math.cos(i), Math.cos(i * 1.7), Math.cos(i * 2.4) * Math.sin(i + 1)).normalize();
      const L = 0.7 + (i % 3) * 0.3;
      const sp = ns(mesh(cone(0.09, L, 4), i % 3 ? blk : red, dir.x * L * 0.5, dir.y * L * 0.5, dir.z * L * 0.5, g));
      sp.quaternion.setFromUnitVectors(UPY, dir);
    }
    return true;
  }
  if (type === 'jj_fistglow') { // a fist charged for a black flash
    ns(mesh(sphere(0.17, 10, 8), mat('#200814', { emit: 0.3, transparent: true, opacity: 0.7, depthWrite: false }), 0, 0, 0, g));
    for (let i = 0; i < 5; i++) { const sp = ns(mesh(octa(0.05), glow('#ff2440'), Math.sin(i * 1.3) * 0.17, Math.cos(i * 2.1) * 0.17, Math.sin(i * 0.7) * 0.17, g)); sp.scale.set(0.5, 1.8, 0.5); sp.rotation.z = i; }
    return true;
  }
  if (type === 'jj_reso') { // resonance: a red throb and a phantom nail through the chest
    for (let i = 0; i < 2; i++) { const t = ns(mesh(torus(H, 0.32 + i * 0.12, 0.03, Math.PI * 2, 16), glow(i ? '#ff6a8a' : '#ff2a4a'), 0, 0, 0, g)); t.rotation.set(Math.PI / 2 + i * 0.6, i * 1.2, 0); }
    const nl = ns(mesh(cyl(0.02, 0.012, 0.7, 5), glow('#ffd0d8'), 0, 0, 0.1, g)); nl.rotation.x = Math.PI / 2;
    return true;
  }
  if (type === 'jj_pool') { // a pool of shadow on the ground
    ns(mesh(cyl(0.85, 0.85, 0.02, 20), mat('#120a1e', { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0, 0, g));
    ns(mesh(torus(H, 0.85, 0.04, Math.PI * 2, 24), glow('#6a4aa8'), 0, 0.01, 0, g)).rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const a = i * 1.26; const w = ns(mesh(cone(0.08, 0.5, 5), mat('#2a1e48', { transparent: true, opacity: 0.6, depthWrite: false }), Math.cos(a) * 0.55, 0.25, Math.sin(a) * 0.55, g)); w.rotation.z = Math.cos(a) * 0.3; }
    return true;
  }
  if (type === 'jj_ripple') { // infinity: a pale ripple in the air where something stopped
    ns(mesh(sphere(0.32, 12, 10), mat('#d8eeff', { emit: 0.8, transparent: true, opacity: 0.3, depthWrite: false }), 0, 0, 0, g));
    for (let i = 0; i < 2; i++) { const t = ns(mesh(torus(H, 0.36 + i * 0.16, 0.012, Math.PI * 2, 20), mat('#f0f8ff', { emit: 1, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0, 0, g)); t.rotation.set(i * 1.2, 0.4, 0.3); }
    return true;
  }
  if (type === 'jj_cut') { // an invisible blade's cut: a thin white streak with a red edge
    for (const [w, y] of [[1.6, 0], [1.1, 0.12]]) { // two parallel cuts, thin at the ends
      const c = ns(mesh(sphere(0.5, 10, 6), glow('#ffffff'), 0, y, 0, g)); c.scale.set(w / 1, 0.06, 0.04);
      const h = ns(mesh(sphere(0.5, 10, 6), mat('#ff2a3a', { emit: 1, transparent: true, opacity: 0.55, depthWrite: false }), 0, y, 0, g)); h.scale.set(w * 0.95, 0.2, 0.1);
    }
    return true;
  }
  if (type === 'jj_domain') { // the domain: a dark dome with a red rim and a ring of teeth
    const R = DOMAIN_R;
    const d = ns(mesh(H.geo('jjdom', () => new THREE.SphereGeometry(R, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#3a0818', { emit: 0.25, transparent: true, opacity: 0.4, depthWrite: false }), 0, 0, 0, g));
    d.renderOrder = 4;
    ns(mesh(torus(H, R, 0.09, Math.PI * 2, 56), glow('#ff2a3a'), 0, 0.08, 0, g)).rotation.x = Math.PI / 2;
    ns(mesh(H.geo('jjdomf', () => new THREE.CircleGeometry(R, 40).rotateX(-Math.PI / 2)), mat('#2a0814', { transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.05, 0, g));
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; const t = ns(mesh(cone(0.18, 0.7, 4), mat('#f0e8d8'), Math.sin(a) * (R - 0.3), 0.3, Math.cos(a) * (R - 0.3), g)); t.rotation.set(Math.cos(a) * -0.4, 0, Math.sin(a) * 0.4); }
    return true;
  }
  return false;
}

register({
  factions: [{ id: 'jujutsu', name: 'Jujutsu', color: '#6a5cff' }],
  units,
  items: {
    jj_hammer: { len: 0.45, r: 0.06, grip: 30, mass: 0.9 },
    jj_fist: { len: 0.4, r: 0.11, grip: 90, phys: false },
    jj_claw: { len: 0.38, r: 0.1, grip: 90, phys: false },
  },
  kinds: { jj_brawler: brawler, jj_nail: nailWitch, jj_shadow: summoner, jj_speaker: speaker, jj_sorcerer: sorcerer, jj_king: king },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
  battleStep(b, dt) {
    const s = STATE.get(b);
    if (!s) return;
    for (const d of s.dogs) stepDog(b, d, dt);
    stepDomains(b, dt);
  },
});
