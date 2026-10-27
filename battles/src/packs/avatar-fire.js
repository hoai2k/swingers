// Avatar: the Fire Nation (built on avatar-core.js: the faction and its elemental effects).
//  - Fire Nation Soldier: cheap rank and file in red-and-black armour with a skull-like
//    mask. Spear in melee; at a few metres he jabs short-range fireballs.
//  - Zuko: twin dao broadswords wreathed in fire (every cut sets the victim alight),
//    fire daggers thrown two at a time, and a spinning fire kick that throws a ring of
//    flame round him into everyone close.
//  - Azula: blue fire. Fast twin jets, a blue-fire dash that ends in a burst, burning
//    fists up close, and lightning: she circles her arms charging it (interrupted if
//    knocked about) and lets go a long bolt that hits very hard.
//  - Iroh: the Dragon of the West. Fire punches, a big fire blast, fire breath (a cone
//    of flame), and lightning redirection: lightning that hits him (Azula's, Zeus's,
//    the Lightning Gun's, Nue's) is taken in, led down through his stomach and sent
//    back at whoever threw it (or the nearest enemy).
//  - Combustion Man: a big slow brute with a metal arm and leg. He fires an explosive
//    beam from the third eye on his forehead that blows up where it lands.
// Fireballs leave flame trails and burst on impact (and set the victim burning); a
// fireball that meets water or ice fizzles out in a puff of steam.
import { register } from '../ext.js';
import { ATTACKS } from '../pose.js';
import {
  THREE, rand, clamp, PART, EXPR, meleeThink, addProjectile, launchVel, aimPoint, strike, blast,
  addStatus, crossed, tcol, tdark, chestShell, dome, torus, hoodGeo,
} from './common.js';
import { refreshBeam, mark } from './ges-core.js';
import { FAC, fx, boltLine } from './avatar-core.js';

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();
const V3 = () => new THREE.Vector3();
const RED = '#8e1c18', MAROON = '#5a1412', BLACK = '#211616', GOLD = '#d8a838';

// ------------------------------------------------------------------ animations
// arm keys: [inward yaw, outward roll, upper pitch, fore pitch]; rows [t, L, R, twist, lean, crouch]
const FWD = [0.25, 0.05, -1.5, -1.55], CHAMBER = [0.05, 0.2, 0.3, -0.9];
ATTACKS.avf_jab = [ // a left-handed fire jab (the right hand keeps its weapon)
  [0.0, null, null, 0, 0, 0],
  [0.3, CHAMBER, null, -0.4, -0.08, 0.1],
  [0.45, FWD, null, 0.4, 0.3, 0.05],
  [0.65, [0.3, 0.05, -1.55, -1.6], null, 0.5, 0.35, 0.1],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avf_jab2 = [ // one-two: left jab then right jab
  [0.0, null, null, 0, 0, 0],
  [0.2, CHAMBER, null, -0.35, -0.05, 0.1],
  [0.32, FWD, CHAMBER, 0.4, 0.25, 0.05],
  [0.62, [0.05, 0.2, 0.2, -1.0], FWD, -0.4, 0.3, 0.1],
  [0.8, null, [0.3, 0.05, -1.5, -1.55], -0.3, 0.2, 0.05],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avf_spin = [ // spinning fire kick: arms flung wide, low and turning
  [0.0, null, null, 0, 0, 0],
  [0.25, [-0.3, 1.2, -0.3, -0.4], [-0.3, 1.2, -0.3, -0.4], 0.6, -0.1, 0.25],
  [0.5, [-0.3, 1.45, -0.2, -0.2], [-0.3, 1.45, -0.2, -0.2], -0.5, 0.15, 0.3],
  [0.72, [-0.3, 1.3, -0.3, -0.3], [-0.3, 1.3, -0.3, -0.3], -0.6, 0.2, 0.25],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avf_dash = [ // fire-propelled dash: arms swept back, leaning in; palms thrust at the end
  [0.0, null, null, 0, 0, 0],
  [0.15, [0.1, 0.3, 0.9, 0.6], [0.1, 0.3, 0.9, 0.6], 0, 0.5, 0.2],
  [0.75, [0.1, 0.3, 0.9, 0.6], [0.1, 0.3, 0.9, 0.6], 0, 0.5, 0.15],
  [0.85, FWD, FWD, 0, 0.3, 0.1],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avf_charge = [ // lightning: the arms circle round, then the right arm drives forward
  [0.0, null, null, 0, 0, 0],
  [0.15, [0.0, 0.6, -1.2, -1.8], [0.0, 0.6, -0.4, -0.9], 0.2, -0.1, 0.15],
  [0.3, [0.0, 0.6, -0.4, -0.9], [0.0, 0.6, -1.2, -1.8], -0.2, -0.1, 0.18],
  [0.45, [0.0, 0.9, -2.0, -2.4], [0.0, 0.6, -0.3, -0.8], 0.3, -0.15, 0.2],
  [0.6, [0.0, 0.6, -0.4, -0.9], [0.0, 0.9, -2.0, -2.4], -0.3, -0.15, 0.2],
  [0.74, [0.1, 0.4, -0.2, -0.6], [0.0, 0.3, -2.6, -3.0], 0.5, -0.25, 0.15],
  [0.84, [0.2, 0.3, 0.2, -0.3], [0.25, 0.05, -1.55, -1.55], -0.5, 0.3, 0.1],
  [0.95, [0.2, 0.3, 0.2, -0.3], [0.25, 0.05, -1.55, -1.55], -0.5, 0.3, 0.1],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avf_redirect = [ // left hand takes the lightning in, down through the stomach, out the right
  [0.0, null, null, 0, 0, 0],
  [0.18, FWD, [0.3, 0.4, 0.2, -0.4], 0.35, -0.1, 0.2],
  [0.45, [0.6, 0.2, -0.3, -1.6], [0.6, 0.2, -0.3, -1.6], 0, 0, 0.28],
  [0.65, [0.3, 0.4, 0.2, -0.4], [0.3, 0.3, -1.0, -1.2], -0.3, 0.1, 0.25],
  [0.75, [0.3, 0.4, 0.2, -0.4], FWD, -0.5, 0.25, 0.2],
  [0.92, [0.3, 0.4, 0.2, -0.4], FWD, -0.5, 0.25, 0.2],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avf_breath = [ // a deep breath, fists at the hips, then lean in and breathe fire
  [0.0, null, null, 0, 0, 0],
  [0.2, [0.4, 0.3, 0.4, -1.4], [0.4, 0.3, 0.4, -1.4], 0, -0.3, 0.15],
  [0.3, [0.4, 0.3, 0.5, -1.2], [0.4, 0.3, 0.5, -1.2], 0, 0.25, 0.15],
  [0.85, [0.4, 0.3, 0.5, -1.2], [0.4, 0.3, 0.5, -1.2], 0, 0.3, 0.15],
  [1.0, null, null, 0, 0, 0],
];
ATTACKS.avf_eye = [ // Combustion Man: fists back, rear back... and nod the third eye forward
  [0.0, null, null, 0, 0, 0],
  [0.5, [0.1, 0.5, 0.6, -0.8], [0.1, 0.5, 0.6, -0.8], 0, -0.35, 0.2],
  [0.72, [0.1, 0.5, 0.6, -0.8], [0.1, 0.5, 0.6, -0.8], 0, -0.4, 0.25],
  [0.8, [0.2, 0.6, 0.7, -0.6], [0.2, 0.6, 0.7, -0.6], 0, 0.35, 0.15],
  [1.0, null, null, 0, 0, 0],
];

// ------------------------------------------------------------------ helpers
const handAt = (u, part, out, k = 1.25) => u.rag.worldPoint(part, 0, -u.skel.handOffset * k, 0, out);
const ready = (u) => !u.st.attack && !u.isDown() && u.stun <= 0 && u.airT <= 0.2;
// start one of a unit's moves: animation `anim` lasting `dur` seconds
function begin(u, anim, dur, cd = null) {
  u.startAttack();
  u.st.attack = anim;
  u.attackDur = dur;
  if (cd !== null) u.cooldown = cd;
}
// the target for an aimed move: the AI's target, or (possessed) the nearest enemy roughly
// where the unit faces
function pick(u, range) {
  if (u.aimAt && u.aimAt.alive) return u.aimAt;
  let best = null, bd = range * range;
  const fx0 = Math.sin(u.heading), fz0 = Math.cos(u.heading);
  for (const v of u.battle.teams[1 - u.team]) {
    if (!v.alive) continue;
    const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = dx * dx + dz * dz;
    if (d < bd && fx0 * dx + fz0 * dz > Math.sqrt(d) * 0.7) { bd = d; best = v; }
  }
  return best;
}
function nearestEnemy(u, p, range) {
  let best = null, bd = range * range;
  for (const v of u.battle.teams[1 - u.team]) {
    if (!v.alive) continue;
    const d = v.chestPos.distanceToSquared(p);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
const countNear = (u, r) => { let n = 0; u.battle.grid.query(u.pos.x, u.pos.z, r + 1, (v) => { if (v.alive && v.team !== u.team && Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z) < r + v.skel.radius) n++; }); return n; };
const burn = (b, v, t, dps, src) => { if (dps > 0 && v.alive) addStatus(b, v, 'burn', t, dps, src); };

// a fireball from `part`'s hand at the aimed target
function shootFire(u, part, o) {
  const b = u.battle;
  const from = handAt(u, part, V3(), 1.35);
  const tof = (u.aimAt && u.aimAt.alive ? from.distanceTo(u.aimAt.chestPos) : 10) / o.speed;
  const to = aimPoint(u, _p, 0.7, tof);
  if (Math.hypot(to.x - from.x, to.z - from.z) < 0.5) to.set(from.x + Math.sin(u.heading) * 5, from.y, from.z + Math.cos(u.heading) * 5);
  const vel = launchVel(from, to, o.speed, 0, false, o.spread ?? 0.03, _v);
  addProjectile(b, o.type, from, vel, u, {
    damage: o.damage, force: o.force, life: (o.range * 1.3) / o.speed,
    blue: o.blue ? 1 : 0, size: o.size ?? 0.7, burnT: o.burnT ?? 2, burnDps: o.burnDps ?? 0,
  });
  fx(b, 'av_fire', from, 0.3, o.blue ? 1 : 0);
  b.sound('av_fire', from, 0.55, o.blue ? 1.25 : 1);
}

// what puts fire out: water / ice / bubble projectiles of the other side
const WET = /wat|ice|wave|whip|frost|snow|bubble|splash|wtr/i;
function fizzle(b, pr) {
  for (const q of b.projectiles) {
    if (q === pr || q.team === pr.team || typeof q.type !== 'string' || !WET.test(q.type)) continue;
    if (q.pos.distanceToSquared(pr.pos) < 0.9) {
      fx(b, 'av_steam', pr.pos, 1.4);
      b.sound('fire', pr.pos, 0.5, 0.55);
      return true;
    }
  }
  return false;
}
// a water unit (or one dripping wet) struck by fire steams
const steamy = (v) => /water|katara|wave|ice/i.test(v.def.id) || (v.status?.wet?.t > 0);

function fireHit(b, pr, v) {
  _d.copy(pr.vel).normalize();
  const c = v.chestPos;
  strike(b, v, pr.damage, _d, pr.force, pr.owner, 'av_fire', PART.chest, null);
  burn(b, v, pr.burnT, pr.burnDps, pr.owner);
  b.emit('av_fire', c.x, c.y, c.z, pr.size, pr.blue);
  if (steamy(v)) fx(b, 'av_steam', c, 1);
  b.sound('av_fire', c, 0.6, pr.blue ? 1.25 : 0.96);
}
const fireballProj = (r, big) => ({
  g: 0, len: 0, r, life: 3,
  step(b, pr) {
    pr.tk = (pr.tk || 0) + 1;
    b.emit('av_ftrail', pr.pos.x, pr.pos.y, pr.pos.z, 0, pr.blue);
    if (big || pr.tk % 2) b.emit('av_ftrail', pr.pos.x - pr.vel.x * 0.008, pr.pos.y - pr.vel.y * 0.008, pr.pos.z - pr.vel.z * 0.008, 0, pr.blue);
    if (pr.tk % 3 === 0 && fizzle(b, pr)) pr.life = -1;
  },
  hit(b, pr, v) { fireHit(b, pr, v); return true; },
  ground(b, pr) { b.emit('av_fire', pr.pos.x, pr.pos.y + 0.1, pr.pos.z, pr.size * 0.6, pr.blue); return true; },
});

// lightning from `from` into v: a jagged double arc, crackle along it, a hard hit
const LIGHTNING = new Set(['av_lightning', 'zap', 'jk_shock']);
const isLightning = (kind, att) => LIGHTNING.has(kind) || (kind === 'blast' && att?.def?.weapon?.kind === 'an_zeus');
function bolt(u, from, v, dmg, force, stun) {
  const b = u.battle, to = v.chestPos.clone();
  for (const [wob, t] of [[0.32, 0.24], [0.5, 0.14]]) {
    const beam = {};
    refreshBeam(b, beam, u, from, to, 'avf_arc', 0.75, wob);
    for (const s of beam.segs) s.t = t;
  }
  boltLine(b, from, to, 1.1);
  b.sound('av_bolt', to, 1.1, 1);
  b.sound('fire', from, 0.7, 2.1);
  b.sound('boom', to, 0.45, 1.9);
  _d.copy(to).sub(from).normalize();
  // Iroh takes it in instead (no shove)
  if (v.kind?.redirects?.(v)) { v.hit(dmg, PART.chest, 0, 0, 0, u, 'av_lightning'); return; }
  strike(b, v, dmg, _d, force, u, 'av_lightning', PART.chest, null);
  if (v.alive) v.stun = Math.max(v.stun, stun * (v.def.stagger ?? 1));
}

// melee hits set the victim alight (and burst into flame on them)
function fireOnHit(u, blue, burnT, burnDps, size = 0.55) {
  if (!u.st.attack) { if (u.avLit.size) u.avLit.clear(); return; }
  for (const v of u.hitSet) {
    if (u.avLit.has(v) || !v.rag || !v.def) continue;
    u.avLit.add(v);
    const c = v.chestPos;
    u.battle.emit('av_fire', c.x, c.y, c.z, size, blue ? 1 : 0);
    burn(u.battle, v, burnT, burnDps, u);
    if (steamy(v)) fx(u.battle, 'av_steam', c, 0.8);
  }
}

// possession: the attack button picks melee up close, else the ranged move
function controlWith(ranged) {
  return (u, dt, c) => {
    if (!c.attack || u.st.attack || u.cooldown > 0) return true;
    const near = nearestEnemy(u, u.chestPos, u.reachDist + 1.2);
    if (near || !ranged) { u.attackDur = u.avDur0; u.startAttack(); return true; }
    u.aimAt = null;
    ranged(u);
    return true;
  };
}
function initCommon(u) {
  u.avDur0 = u.attackDur;
  u.avLit = new Set();
  u.avTk = 0;
}
// the default melee behaviour, with the melee animation's duration restored
function melee(u, dt, c) {
  if (!u.st.attack) u.attackDur = u.avDur0;
  return meleeThink(u, dt, c);
}

// ------------------------------------------------------------------ Fire Nation Soldier
const soldierJab = (u) => begin(u, 'avf_jab', u.def.weapon.jabDur, 0.5);
const soldier = {
  melee: true, aim: true,
  init(u) { initCommon(u); u.avFire = rand(0.5, 2.5); },
  think(u, dt, c) {
    const w = u.def.weapon;
    u.avFire -= dt;
    if (u.avFire <= 0 && ready(u) && c.gap > 1.6 && c.dist < w.fireRange) {
      u.avFire = w.fireCd * rand(0.85, 1.15);
      u.aimAt = c.t;
      soldierJab(u);
    }
    return melee(u, dt, c);
  },
  event(u, t0, t1) {
    if (u.st.attack === 'avf_jab' && crossed(t0, t1, 0.45)) {
      const w = u.def.weapon;
      shootFire(u, PART.farmL, { type: 'avf_fire', speed: w.fireSpeed, damage: w.fireDmg, force: w.fireForce, range: w.fireRange, size: 0.6, burnDps: w.burnDps, burnT: 2 });
    }
  },
  step(u) { fireOnHit(u, false, 0, 0); },
  control: controlWith(soldierJab),
};

// ------------------------------------------------------------------ Zuko
const zukoDaggers = (u) => begin(u, 'avf_jab2', u.def.weapon.jabDur, 0.4);
const spinMove = (u) => { begin(u, 'avf_spin', u.def.weapon.spinDur, 0.35); u.avSpinCd = u.def.weapon.spinCd; u.battle.sound('whoosh', u.pos, 0.9, 0.7); };
// the spin kick lands: a ring of fire into everyone close (Zuko; Azula's is blue)
function fireRing(u, blue = 0) {
  const b = u.battle, w = u.def.weapon, p = u.pos, R = w.spinR;
  const gy = b.terrain.height(p.x, p.z);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.emit('av_fire', p.x + Math.sin(a) * R * 0.6, gy + 0.5, p.z + Math.cos(a) * R * 0.6, 0.5, blue);
  }
  b.sound('av_fire', p, 1.0, blue ? 1.17 : 0.75);
  b.sound('whoosh', p, 0.8, 0.6);
  b.grid.query(p.x, p.z, R + 2, (v) => {
    if (!v.alive || v.team === u.team) return;
    const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d > R + v.skel.radius) return;
    const f = clamp(1.2 - d / R, 0.4, 1);
    _d.set(dx / (d || 1), 0.45, dz / (d || 1)).normalize();
    strike(b, v, w.spinDmg * f, _d, w.spinForce * f, u, 'av_fire', PART.chest, null);
    burn(b, v, 3, w.burnDps, u);
    v.stun = Math.max(v.stun, 0.8 * (v.def.stagger ?? 1));
  });
}
// while spinning: turn round once, a trail of fire off the kicking foot
function spinStep(u, dt, blue = 0) {
  const t = u.st.attackT, b = u.battle;
  if (u.st.attack !== 'avf_spin' || t <= 0.2 || t >= 0.75) return;
  u.heading += ((Math.PI * 2) / (0.55 * u.attackDur)) * dt;
  u.faceYaw = u.heading;
  u.rag.worldPoint(PART.shinR, 0, -u.skel.parts[PART.shinR].hh, 0, _o);
  b.emit('av_ftrail', _o.x, _o.y, _o.z, 0, blue);
  if (u.avTk % 2) b.emit('av_fire', _o.x, _o.y, _o.z, 0.22, blue);
}
const zuko = {
  melee: true, aim: true,
  init(u) { initCommon(u); u.avFire = rand(1, 3); u.avSpinCd = rand(1, 3); },
  think(u, dt, c) {
    const w = u.def.weapon;
    u.avFire -= dt; u.avSpinCd -= dt;
    if (ready(u)) {
      const crowd = c.gap < 1.6 ? countNear(u, w.spinR) : 0;
      if (u.avSpinCd <= 0 && (crowd >= 2 || (crowd >= 1 && Math.random() < dt * 0.8))) { spinMove(u); return c.t; }
      if (u.avFire <= 0 && c.gap > 3.5 && c.dist < w.fireRange) {
        u.avFire = w.fireCd * rand(0.85, 1.15);
        u.aimAt = c.t;
        zukoDaggers(u);
        return c.t;
      }
    }
    return melee(u, dt, c);
  },
  event(u, t0, t1) {
    const w = u.def.weapon, a = u.st.attack;
    if (a === 'avf_jab2') {
      const o = { type: 'avf_fire', speed: w.fireSpeed, damage: w.fireDmg, force: w.fireForce, range: w.fireRange, size: 0.7, burnDps: w.burnDps, burnT: 2 };
      if (crossed(t0, t1, 0.32)) shootFire(u, PART.farmL, o);
      if (crossed(t0, t1, 0.62)) shootFire(u, PART.farmR, o);
    }
    if (a === 'avf_spin' && crossed(t0, t1, 0.5)) fireRing(u);
  },
  step(u, dt) {
    fireOnHit(u, false, 2.5, u.def.weapon.burnDps);
    const a = u.st.attack, b = u.battle;
    u.avTk++;
    if (a === 'dual' && u.avTk % 2 === 0) { // the blades burn as they swing
      for (const p of [PART.farmL, PART.farmR]) {
        u.rag.worldPoint(p, 0, -u.skel.handOffset - 0.32 * u.s, 0.55 * u.s, _o);
        b.emit('av_ftrail', _o.x, _o.y, _o.z, 0, 0);
      }
    }
    spinStep(u, dt, 0);
  },
  control: controlWith(zukoDaggers),
};

// ------------------------------------------------------------------ Azula
const azJets = (u) => begin(u, 'avf_jab2', u.def.weapon.jabDur, 0.35);
const azCharge = (u) => {
  begin(u, 'avf_charge', u.def.weapon.boltDur, 0.6);
  u.avBoltCd = u.def.weapon.boltCd;
  u.battle.sound('av_charge', u.chestPos, 0.6, 1);
  const lp = new THREE.Vector3(0, -u.skel.handOffset * 1.3, 0);
  u.avOrbs = [PART.farmL, PART.farmR].map((p) => mark(u.battle, u, 'avf_orb', p, u.attackDur * 0.85, lp.clone()));
};
const dropOrbs = (u) => { if (u.avOrbs) { for (const o of u.avOrbs) o.t = 0; u.avOrbs = null; } };
const azDash = (u, v) => {
  begin(u, 'avf_dash', u.def.weapon.dashDur, 0.3);
  u.avDashCd = u.def.weapon.dashCd;
  const p = u.pos, t = v ? v.pos : _p.set(p.x + Math.sin(u.heading) * 6, p.y, p.z + Math.cos(u.heading) * 6);
  const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
  u.avDash = { x: dx / d, z: dz / d, go: false };
};
const azula = {
  melee: true, aim: true,
  init(u) { initCommon(u); u.avFire = rand(0.5, 2); u.avBoltCd = rand(1.5, 3.5); u.avDashCd = rand(2, 4); u.avSpinCd = rand(0, 2); },
  think(u, dt, c) {
    const w = u.def.weapon;
    u.avFire -= dt; u.avBoltCd -= dt; u.avDashCd -= dt; u.avSpinCd -= dt;
    if (u.st.attack === 'avf_dash' && u.avDash) { // fly at them
      u.desired.set(u.avDash.x * w.dashSpeed, 0, u.avDash.z * w.dashSpeed);
      return c.t;
    }
    if (ready(u)) {
      u.aimAt = c.t;
      // mobbed: a spinning kick of blue fire throws them off her
      if (u.avSpinCd <= 0 && c.gap < 1.6 && countNear(u, w.spinR) >= (u.hp < u.maxHp * 0.6 ? 1 : 2)) { spinMove(u); return c.t; }
      if (u.avBoltCd <= 0 && c.gap > 4 && c.dist < w.boltRange) { azCharge(u); return c.t; }
      if (u.avDashCd <= 0 && c.gap > 3 && c.gap < w.dashRange) { azDash(u, c.t); return c.t; }
      if (u.avFire <= 0 && c.gap > 2.5 && c.dist < w.fireRange) { u.avFire = w.fireCd * rand(0.85, 1.15); azJets(u); return c.t; }
    }
    if (u.st.attack === 'avf_charge') { u.desired.set(0, 0, 0); return c.t; }
    return melee(u, dt, c);
  },
  event(u, t0, t1) {
    const w = u.def.weapon, a = u.st.attack, b = u.battle;
    if (a === 'avf_jab2') {
      const o = { type: 'avf_bfire', speed: w.fireSpeed, damage: w.fireDmg, force: w.fireForce, range: w.fireRange, size: 0.8, blue: true, burnDps: w.burnDps, burnT: 2.5, spread: 0.02 };
      if (crossed(t0, t1, 0.32)) shootFire(u, PART.farmL, o);
      if (crossed(t0, t1, 0.62)) shootFire(u, PART.farmR, o);
    }
    if (a === 'avf_dash' && u.avDash) {
      if (crossed(t0, t1, 0.15)) { // blue fire from the feet launches her
        const k = u.M * w.dashSpeed * 0.6;
        u.rag.impulseAll(u.avDash.x * k, u.M * 2.2, u.avDash.z * k);
        fx(b, 'av_fire', u.pos, 0.8, 1);
        b.sound('av_fire', u.pos, 0.9, 1.33);
        b.sound('whoosh', u.pos, 0.8, 1.2);
      }
      if (crossed(t0, t1, 0.85)) { // and a burst of blue fire where she lands
        const p = _p.set(u.chestPos.x + u.avDash.x * 0.9, u.chestPos.y, u.chestPos.z + u.avDash.z * 0.9);
        blast(b, p, w.dashR, w.dashDmg, w.dashForce, u, { fx: -1, friendly: 0, sound: 'fire', pitch: 1.5, onUnit: (v) => burn(b, v, 3, w.burnDps, u) });
        b.emit('av_fire', p.x, p.y, p.z, 1.6, 1);
        u.avDash = null;
      }
    }
    if (a === 'avf_spin' && crossed(t0, t1, 0.5)) fireRing(u, 1);
    if (a === 'avf_charge' && crossed(t0, t1, 0.82)) {
      dropOrbs(u);
      const v = pick(u, w.boltRange * 1.15);
      const from = handAt(u, PART.farmR, V3(), 1.4);
      if (v) bolt(u, from, v, w.boltDmg, w.boltForce, w.boltStun);
      else { boltLine(b, from, _p.copy(from).add(_v.set(Math.sin(u.heading) * 12, 0, Math.cos(u.heading) * 12)), 1); b.sound('av_bolt', from, 0.9, 1); }
    }
  },
  step(u, dt) {
    fireOnHit(u, true, 2.5, u.def.weapon.burnDps, 0.6);
    const a = u.st.attack, b = u.battle, t = u.st.attackT;
    u.avTk++;
    if (a === 'avf_charge') {
      // knocked about while charging: the lightning gets away from her
      if (u.stun > 0.4 || u.isDown()) {
        u.st.attack = null; u.st.attackT = 0;
        dropOrbs(u);
        fx(b, 'av_bolt', u.chestPos, 0.8);
        b.sound('clang', u.chestPos, 0.6, 3);
        return;
      }
      if (t < 0.8 && u.avTk % 3 === 0) {
        for (const p of [PART.farmL, PART.farmR]) { handAt(u, p, _o); b.emit('av_bolt', _o.x, _o.y, _o.z, 0.45); }
        if (u.avTk % 6 === 0) b.emit('avf_charge', u.chestPos.x, u.chestPos.y, u.chestPos.z, 1.3, 0);
      }
    } else if (u.avOrbs) dropOrbs(u);
    spinStep(u, dt, 1);
    if (a === 'avf_dash' && t > 0.12 && t < 0.85) { // blue fire jets off her feet and hands
      for (const p of [PART.shinL, PART.shinR]) { u.rag.worldPoint(p, 0, -u.skel.parts[p].hh, 0, _o); b.emit('av_ftrail', _o.x, _o.y, _o.z, 0, 1); }
      if (u.avTk % 2) for (const p of [PART.farmL, PART.farmR]) { handAt(u, p, _o); b.emit('av_ftrail', _o.x, _o.y, _o.z, 0, 1); }
    }
    if (a === 'dual' && u.avTk % 2 === 0) for (const p of [PART.farmL, PART.farmR]) { handAt(u, p, _o, 1.1); b.emit('av_ftrail', _o.x, _o.y, _o.z, 0, 1); }
  },
  die(u) { dropOrbs(u); },
  control: controlWith((u) => { if (u.avBoltCd <= 0) azCharge(u); else azJets(u); }),
};

// ------------------------------------------------------------------ Iroh
const irohBlast = (u) => begin(u, 'avf_jab', u.def.weapon.jabDur, 0.5);
const irohBreath = (u) => { begin(u, 'avf_breath', u.def.weapon.breathDur, 0.5); u.avBreathCd = u.def.weapon.breathCd; u.avTick = 0; };
function redirect(u) {
  const b = u.battle, w = u.def.weapon, r = u.avRedir;
  u.avRedir = null;
  const from = handAt(u, PART.farmR, V3(), 1.4);
  let v = r.src && r.src.alive && r.src.team !== u.team && r.src.pos.distanceTo(u.pos) < w.redirRange ? r.src : null;
  if (!v) v = nearestEnemy(u, u.chestPos, w.redirRange);
  const dmg = clamp(r.dmg * w.redirMul, w.redirMin, w.redirMax);
  if (v) bolt(u, from, v, dmg, w.redirForce, 1.2);
  else boltLine(b, from, _p.copy(from).add(_v.set(0, 14, 0)), 1); // nothing in reach: up into the sky
}
const iroh = {
  melee: true, aim: true,
  init(u) { initCommon(u); u.avFire = rand(1, 3); u.avBreathCd = rand(0.5, 2); u.avRedir = null; u.avRedirCd = 0; },
  redirects: (u) => u.alive && !u.isDown() && (u.avRedirCd <= 0 || !!u.avRedir),
  think(u, dt, c) {
    const w = u.def.weapon;
    u.avFire -= dt; u.avBreathCd -= dt;
    if (u.avRedir) { u.desired.set(0, 0, 0); return c.t; }
    if (ready(u)) {
      if (u.avBreathCd <= 0 && c.gap < w.breathLen - 1.2) { u.aimAt = c.t; irohBreath(u); return c.t; }
      if (u.avFire <= 0 && c.gap > 3.5 && c.dist < w.fireRange) { u.avFire = w.fireCd * rand(0.85, 1.15); u.aimAt = c.t; irohBlast(u); return c.t; }
    }
    if (u.st.attack === 'avf_breath') { u.desired.multiplyScalar(0.2); return c.t; }
    return melee(u, dt, c);
  },
  hit(u, amount, part, att, kind) {
    if (!isLightning(kind, att) || !iroh.redirects(u)) return amount;
    const b = u.battle, w = u.def.weapon;
    if (!u.avRedir) {
      u.avRedir = { dmg: 0, src: null, t: w.redirDelay };
      u.st.attack = 'avf_redirect'; u.st.attackT = 0; u.attackDur = w.redirDelay / 0.72;
      u.hitSet.clear();
      b.sound('clang', u.chestPos, 0.8, 1.8);
    }
    u.avRedir.dmg += amount;
    if (att && att.alive) u.avRedir.src = att;
    u.avRedirCd = w.redirCd;
    fx(b, 'av_bolt', u.chestPos, 0.8);
    return amount * w.redirTake;
  },
  event(u, t0, t1) {
    const w = u.def.weapon;
    if (u.st.attack === 'avf_jab' && crossed(t0, t1, 0.45)) {
      shootFire(u, PART.farmL, { type: 'avf_bigfire', speed: w.fireSpeed, damage: w.fireDmg, force: w.fireForce, range: w.fireRange, size: 1.3, burnDps: w.burnDps, burnT: 3 });
    }
  },
  step(u, dt) {
    const w = u.def.weapon, b = u.battle, a = u.st.attack, t = u.st.attackT;
    u.avTk++;
    u.avRedirCd -= dt;
    fireOnHit(u, false, 2, w.burnDps);
    if (u.avRedir) {
      u.stun = 0; // the lightning doesn't knock him about: he guides it
      if (a !== 'avf_redirect') { u.st.attack = 'avf_redirect'; u.st.attackT = 0.4; }
      // the arc runs in the left hand, down through the stomach and out the right
      if (u.avTk % 2 === 0) {
        const pts = [handAt(u, PART.farmL, _o), u.rag.pos[PART.uarmL], u.rag.pos[PART.pelvis], u.rag.pos[PART.uarmR], handAt(u, PART.farmR, _v)];
        const p = pts[Math.min(4, Math.floor(clamp(1 - u.avRedir.t / w.redirDelay, 0, 0.999) * 5))];
        b.emit('av_bolt', p.x, p.y, p.z, 0.4);
      }
      u.avRedir.t -= dt;
      if (u.avRedir.t <= 0) redirect(u);
      return;
    }
    if (a === 'avf_breath' && t > 0.28 && t < 0.86) { // the dragon's breath: a cone of flame
      const h = u.headPos, fx0 = Math.sin(u.heading), fz0 = Math.cos(u.heading), r = u.skel.rHead;
      const mx = h.x + fx0 * r * 1.1, my = h.y - r * 0.25, mz = h.z + fz0 * r * 1.1;
      for (let i = 0; i < 2; i++) {
        const sp = w.breathLen * rand(1.6, 2.1), a2 = rand(-0.45, 0.45);
        const cx = Math.cos(a2), sx = Math.sin(a2);
        b.emit('avf_jet', mx, my, mz, (fx0 * cx + fz0 * sx) * sp, (fz0 * cx - fx0 * sx) * sp, rand(-0.25, 0.1) * sp);
      }
      if (u.avTk % 2) b.emit('av_ftrail', mx + fx0 * 0.3, my, mz + fz0 * 0.3, 0, 0);
      if (u.avTk % 20 === 0) b.sound('av_breath', h, 0.9, 1);
      u.avTick -= dt;
      if (u.avTick <= 0) {
        u.avTick = 0.15;
        b.grid.query(mx, mz, w.breathLen + 2, (v) => {
          if (!v.alive || v.team === u.team) return;
          const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz);
          if (d > w.breathLen + v.skel.radius || (dx * fx0 + dz * fz0) < d * 0.8) return;
          _d.set(fx0, 0.2, fz0).normalize();
          strike(b, v, w.breathDps * 0.15, _d, w.breathForce, u, 'av_fire', PART.chest, null);
          burn(b, v, 2.5, w.burnDps, u);
          if (steamy(v)) fx(b, 'av_steam', v.chestPos, 0.6);
        });
      }
    }
  },
  control: controlWith((u) => { if (u.avBreathCd <= 0) irohBreath(u); else irohBlast(u); }),
};

// ------------------------------------------------------------------ Combustion Man
const sparkyShot = (u) => { begin(u, 'avf_eye', u.def.weapon.windup, 0.5); u.avBeam = u.def.weapon.beamCd * rand(0.9, 1.1); };
const eyePos = (u, out) => u.rag.worldPoint(PART.head, 0, u.skel.rHead * 0.62, u.skel.rHead * 0.95, out);
function sparkBoom(b, pr) {
  const p = pr.pos;
  blast(b, p, pr.blast, pr.damage, pr.force, pr.owner, { fx: 2, friendly: 0.4, vol: 1.4 });
  b.emit('av_fire', p.x, p.y, p.z, 2.2, 0);
  b.emit('avf_boom', p.x, p.y, p.z, pr.blast, 0);
  b.sound('debris', p, 0.7, 0.9);
}
const sparky = {
  melee: true, aim: true,
  init(u) { initCommon(u); u.avEye = null; u.avBeam = rand(0.3, 1.5); },
  think(u, dt, c) {
    const w = u.def.weapon;
    u.expr = c.gap < 8 ? EXPR.angry : EXPR.normal;
    u.avBeam -= dt;
    if (u.st.attack === 'avf_eye') { u.desired.set(0, 0, 0); return c.t; }
    if (c.gap < w.minRange) return melee(u, dt, c); // too close for the eye: the metal fist
    if (c.dist > w.range * 0.85) u.desired.set(c.dirx * c.spd, 0, c.dirz * c.spd);
    else u.desired.set(0, 0, 0);
    if (c.dist < w.range && ready(u) && u.avBeam <= 0) { u.aimAt = c.t; sparkyShot(u); }
    return c.t;
  },
  event(u, t0, t1) {
    if (u.st.attack !== 'avf_eye') return;
    const w = u.def.weapon, b = u.battle;
    if (crossed(t0, t1, 0.05)) { u.avEye = mark(b, u, 'avf_eye', PART.head, u.attackDur * 0.8, new THREE.Vector3(0, u.skel.rHead * 0.62, u.skel.rHead * 0.98)); b.sound('fire', u.headPos, 0.5, 0.6); }
    if (crossed(t0, t1, 0.78)) {
      if (u.avEye) { u.avEye.t = 0; u.avEye = null; }
      const from = eyePos(u, V3());
      const tgt = u.aimAt && u.aimAt.alive ? u.aimAt : pick(u, w.range);
      const tof = (tgt ? from.distanceTo(tgt.chestPos) : 14) / w.speed;
      const to = aimPoint(u, _p, 0.6, tof);
      if (tgt) to.y = tgt.chestPos.y - 0.3; // aim at their feet-ish: the blast catches the crowd
      const vel = launchVel(from, to, w.speed, 0, false, w.spread, _v);
      const dist = from.distanceTo(to);
      const pr = addProjectile(b, 'avf_spark', from, vel, u, { damage: w.beamDmg, force: w.beamForce, blast: w.blast, life: (w.range * 1.4) / w.speed });
      pr.tleft = dist / w.speed + 0.02;
      b.emit('av_fire', from.x, from.y, from.z, 0.5, 0);
      b.sound('av_blast', from, 1.0, 1);
      b.sound('whoosh', from, 0.8, 0.5);
    }
  },
  step(u) {
    u.avTk++;
    const b = u.battle;
    if (u.st.attack === 'avf_eye' && u.st.attackT < 0.78 && u.avTk % 3 === 0) { eyePos(u, _o); b.emit('avf_charge', _o.x, _o.y, _o.z, 0.5, 1); }
    if (!u.alive || (u.st.attack !== 'avf_eye' && u.avEye)) { if (u.avEye) u.avEye.t = 0; u.avEye = null; }
  },
  die(u) { if (u.avEye) { u.avEye.t = 0; u.avEye = null; } },
  control: controlWith(sparkyShot),
};

// ------------------------------------------------------------------ effects
const FX = {
  // one tongue of flame flying along (vx, vy, vz): the fire breath
  avf_jet(f, x, y, z, vx, vz, vy, T) {
    const r = Math.random();
    f.bb(f.gs, x, y, z, vx * rand(0.8, 1.05), vy + rand(-0.2, 0.5), vz * rand(0.8, 1.05), rand(0.22, 0.38), rand(0.42, 0.55), r < 0.3 ? '#ffe080' : r < 0.75 ? '#ff7a20' : '#e8401a', { tile: T.flame, drag: 1.6, grow: 2.2, vr: rand(-4, 4) });
    if (Math.random() < 0.18) f.bb(f.ss, x + vx * 0.25, y + 0.2, z + vz * 0.25, vx * 0.4, rand(0.6, 1.2), vz * 0.4, rand(0.3, 0.5), rand(0.7, 1.0), '#4a4440', { tile: T.smoke, grow: 1.8, alpha: 0.35, fadeIn: 0.2 });
  },
  // sparks drawn in toward a point (charging lightning; b = 1 orange: the third eye)
  avf_charge(f, x, y, z, a, orange, c, T) {
    const k = a || 1;
    for (let i = 0; i < 5; i++) {
      _d.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      const R = rand(0.5, 0.8) * k, sp = R / 0.22;
      f.bb(f.gs, x + _d.x * R, y + _d.y * R, z + _d.z * R, -_d.x * sp, -_d.y * sp, -_d.z * sp, rand(0.06, 0.11) * k, 0.22, orange ? (i % 2 ? '#ffb040' : '#fff0b0') : (i % 2 ? '#bfe0ff' : '#ffffff'), { tile: orange ? T.flame : T.star, drag: 0, shrink: true, vr: rand(-6, 6) });
    }
    f.bb(f.gs, x, y, z, 0, 0, 0, 0.35 * k, 0.12, orange ? '#ffd080' : '#e8f4ff', { tile: T.puff, shrink: true });
  },
  // Combustion Man's blast: a shockwave ring, a column of fire, a shower of embers
  avf_boom(f, x, y, z, a, b, c, T) {
    const R = a || 3, gy = f.terrain.height(x, z);
    f.ring(x, gy + 0.08, z, R * 1.5, 0.5, '#ffb050');
    f.ring(x, gy + 0.12, z, R * 0.9, 0.35, '#fff0c0');
    for (let i = 0; i < 8; i++) f.bb(f.gs, x + rand(-0.4, 0.4), y + i * 0.25, z + rand(-0.4, 0.4), rand(-0.5, 0.5), rand(3, 6), rand(-0.5, 0.5), rand(0.6, 1.0), rand(0.5, 0.8), i % 3 ? '#ff6a1a' : '#ffd060', { tile: T.flame, drag: 2.5, shrink: true, vr: rand(-2, 2) });
    for (let i = 0; i < 16; i++) f.bb(f.gs, x, y + 0.3, z, rand(-7, 7), rand(3, 9), rand(-7, 7), rand(0.05, 0.1), rand(0.6, 1.2), i % 2 ? '#ffe090' : '#ff8a30', { tile: T.flame, g: 9.81, drag: 0.8, shrink: true });
    for (let i = 0; i < 5; i++) f.bb(f.ss, x + rand(-1, 1), y + rand(0.5, 1.5), z + rand(-1, 1), rand(-0.6, 0.6), rand(1, 2.2), rand(-0.6, 0.6), rand(0.9, 1.4), rand(1.4, 2.2), '#3a3430', { tile: T.smoke, grow: 2.2, alpha: 0.55, fadeIn: 0.1 });
    f.flash(x, y + 0.5, z, '#ff9a40', 22);
  },
};

// ------------------------------------------------------------------ units
const P = (aggro, bravery, voice, cry, idle, chatter = 0.5) => ({ aggro, bravery, voice, chatter, cry, idle });
const units = [
  {
    id: 'av_fn_soldier', name: 'Fire Nation Soldier', faction: FAC, cost: 68, hp: 130, speed: 4.3,
    build: { scale: 1, girth: 1.0 },
    weapon: {
      line: 'Spear · jabs short-range fireballs that set you burning', kind: 'avf_soldier', style: 'spear', anim: 'stab', item: 'avf_spear',
      damage: 26, reach: 1.8, cooldown: 1.15, force: 230,
      fireDmg: 20, fireForce: 140, fireSpeed: 19, fireRange: 9, fireCd: 3.2, burnDps: 6, jabDur: 0.6,
    },
    look: { skin: '#e8b890', hat: 'avf_helmet', top: 'avf_soldier', legs: '#2e1e1c', accent: '#1a1212' },
    personality: P(0.9, 0.2, 0.95, 'charge', 'shift', 0.4),
    desc: 'Rank and file of the Fire Nation army. Spear, armour, and a fist full of fire.',
  },
  {
    id: 'av_zuko', name: 'Zuko', faction: FAC, cost: 600, hp: 520, speed: 5.2,
    build: { scale: 1, girth: 0.98 },
    weapon: {
      line: 'Twin flaming dao · fire daggers · spinning fire kick', kind: 'avf_zuko', style: 'dual', anim: 'dual', item: 'avf_dao', item2: 'avf_dao',
      damage: 34, reach: 1.25, cooldown: 0.72, force: 320,
      fireDmg: 26, fireForce: 160, fireSpeed: 22, fireRange: 13, fireCd: 3.6, jabDur: 0.65, burnDps: 9,
      spinDmg: 55, spinForce: 520, spinR: 3.2, spinCd: 6, spinDur: 0.75,
    },
    look: { skin: '#f0c8a0', hat: 'avf_zuko', top: 'avf_zuko', legs: '#241a1a', accent: '#151010' },
    personality: P(1, 0, 1.0, 'charge', 'shift', 0.6),
    stagger: 0.6,
    desc: 'The banished prince. Twin broadswords, fire from his fists and his feet, and a lot to prove.',
  },
  {
    id: 'av_azula', name: 'Azula', faction: FAC, cost: 1000, hp: 600, speed: 5.6,
    build: { scale: 0.97, girth: 0.9 },
    weapon: {
      line: 'Blue fire jets · blue-fire dash · charges and fires lightning', kind: 'avf_azula', style: 'dual', anim: 'dual', item: 'avf_fist', item2: 'avf_fist',
      damage: 30, reach: 1.0, cooldown: 0.6, force: 320, burnDps: 12,
      fireDmg: 34, fireForce: 200, fireSpeed: 30, fireRange: 16, fireCd: 2.6, jabDur: 0.5,
      dashSpeed: 15, dashRange: 11, dashCd: 7, dashDur: 0.75, dashDmg: 60, dashR: 2.4, dashForce: 420,
      spinDmg: 50, spinForce: 560, spinR: 3.0, spinCd: 5, spinDur: 0.7,
      boltDmg: 220, boltForce: 650, boltStun: 1.6, boltRange: 34, boltCd: 7.5, boltDur: 1.6,
    },
    look: { skin: '#f4d4b4', hat: 'avf_azula', top: 'avf_azula', legs: '#221616', accent: '#151010' },
    personality: P(0.95, 0, 1.25, 'cackle', 'shift', 0.6),
    stagger: 0.5,
    desc: 'The crown princess. Blue fire, perfect form, and lightning. Almost always lucky.',
  },
  {
    id: 'av_iroh', name: 'Iroh', faction: FAC, cost: 1150, hp: 950, speed: 4.0,
    build: { scale: 1.02, girth: 1.25, head: 1.08, neck: 0.3 },
    weapon: {
      line: 'Fire punches · fire breath · redirects lightning back at its thrower', kind: 'avf_iroh', style: 'dual', anim: 'dual', item: 'avf_fist', item2: 'avf_fist',
      damage: 38, reach: 1.05, cooldown: 0.8, force: 460, burnDps: 10,
      fireDmg: 60, fireForce: 380, fireSpeed: 20, fireRange: 12, fireCd: 4.5, jabDur: 0.7,
      breathDps: 90, breathLen: 5.5, breathForce: 60, breathCd: 6, breathDur: 1.7,
      redirDelay: 0.55, redirTake: 0.08, redirMul: 1.0, redirMin: 120, redirMax: 400, redirRange: 40, redirForce: 600, redirCd: 0.4,
    },
    look: { skin: '#eac09a', hat: 'avf_iroh', top: 'avf_iroh', legs: '#4a3626', accent: '#2a1e16', beard: '#ecebe6' },
    personality: P(0.8, 0, 0.8, 'hey', 'shift', 0.7),
    stagger: 0.4,
    desc: 'The Dragon of the West. Breathes fire, sends lightning back where it came from, and would rather be having tea.',
  },
  {
    id: 'av_sparky', name: 'Combustion Man', faction: FAC, cost: 700, hp: 620, speed: 3.4,
    build: { scale: 1.25, girth: 1.2, head: 1.0, armThick: 1.25, neck: 0.25 },
    weapon: {
      line: 'Explosive beam from his third eye · metal fist up close', kind: 'avf_sparky', style: 'fists', anim: 'dual', item: 'none',
      damage: 45, force: 480, cooldown: 1.1, reach: 1.1, // (his fists)
      beamDmg: 130, beamForce: 700, blast: 3.6, speed: 42, range: 34, minRange: 4, spread: 0.03, beamCd: 4.4, windup: 1.4,
    },
    look: { skin: '#c8946a', hat: 'avf_sparky', top: 'avf_sparky', legs: '#2a2220', accent: '#1a1414', bare: true },
    personality: P(0.6, 0, 0.6, 'roar', 'thump', 0.05),
    stagger: 0.45,
    desc: 'Sparky Sparky Boom Man. Never says a word; blows things up from very far away.',
  },
];

// ------------------------------------------------------------------ visuals
const UPY = new THREE.Vector3(0, 1, 0);
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
function limbs(H, vis, list, m, k = 1.12) {
  for (const p of list) { const sp = vis.skel.parts[p]; H.mesh(H.capsule(sp.r * k, sp.hh * 2), m, 0, 0, 0, vis.parts[p]); }
}
const ARMS = [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR];
function skirt(H, vis, m, k = 2.0, flare = 1.5) {
  const pel = vis.skel.parts[PART.pelvis];
  const sk = H.mesh(H.cyl(pel.r * 1.12, pel.r * flare, pel.r * k, 16), m, 0, -pel.r * k * 0.42, 0, vis.parts[PART.pelvis]);
  sk.scale.set(1, 1, 0.95);
  return sk;
}
// layered shoulder plates
function pauldrons(H, vis, m, trim, k = 1) {
  const ch = vis.skel.parts[PART.chest], r = ch.r, hh = ch.hh, C = vis.parts[PART.chest];
  for (const sd of [-1, 1]) for (let i = 0; i < 2; i++) {
    const o = H.mesh(H.sphere(r * (0.58 - i * 0.06) * k, 12, 8), i ? trim : m, sd * r * (0.98 + i * 0.12), hh + r * (0.28 - i * 0.28), 0, C);
    o.scale.set(1, 0.42, 1.05);
    o.rotation.z = sd * (0.35 + i * 0.25);
  }
}
const belt = (H, vis, m, buckle) => {
  const ch = vis.skel.parts[PART.chest], r = ch.r, hh = ch.hh, C = vis.parts[PART.chest];
  H.mesh(H.cyl(r * 1.16, r * 1.18, r * 0.26, 16), m, 0, -hh - r * 0.38, 0, C);
  if (buckle) H.mesh(H.box(r * 0.3, r * 0.22, r * 0.08), buckle, 0, -hh - r * 0.38, r * 1.15, C);
};
const armband = (H, vis, m, p = PART.uarmL) => { const sp = vis.skel.parts[p]; H.mesh(H.cyl(sp.r * 1.3, sp.r * 1.3, sp.hh * 0.45, 10), m, 0, sp.hh * 0.15, 0, vis.parts[p]); };
const bracers = (H, vis, m, k = 1.3) => { for (const p of [PART.farmL, PART.farmR]) { const sp = vis.skel.parts[p]; H.mesh(H.cyl(sp.r * k, sp.r * k * 1.08, sp.hh * 1.1, 10), m, 0, -sp.hh * 0.2, 0, vis.parts[p]); } };

function buildHat(kind, r, team, g, H) {
  const { mesh, sphere, box, cyl, cone, mat, glow } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'avf_helmet': { // the Fire Nation infantry helmet and its skull-like mask
      const dk = mat('#2a1414', { spec: 0.45 }), red = mat(MAROON, { spec: 0.4 }), bone = mat('#ece4d0', { spec: 0.25 }), hole = mat('#120a0a');
      mesh(sphere(r * 1.0, 18, 14), bone, 0, -r * 0.02, r * 0.06, g).scale.set(0.94, 1.0, 0.95); // the mask over the face
      for (const sd of [-1, 1]) { const e = mesh(sphere(r * 0.2, 10, 8), hole, sd * r * 0.32, r * 0.14, r * 0.9, g); e.scale.set(1.1, 0.85, 0.5); e.rotation.z = sd * 0.35; }
      mesh(cone(r * 0.09, r * 0.16, 3), hole, 0, -r * 0.1, r * 0.98, g).rotation.x = Math.PI + 0.3; // nose hole
      mesh(box(r * 0.62, r * 0.05, r * 0.06), hole, 0, -r * 0.48, r * 0.86, g);
      for (let i = -2; i <= 2; i++) mesh(box(r * 0.03, r * 0.2, r * 0.05), hole, i * r * 0.12, -r * 0.48, r * 0.87 - Math.abs(i) * r * 0.03, g); // the teeth
      const cap = mesh(dome(H, r * 1.13, 0.52), dk, 0, r * 0.06, -r * 0.02, g); cap.rotation.x = -0.12;
      mesh(hoodGeo(H, r, 1.14, 0.95), dk, 0, -r * 0.05, 0, g); // neck guard and cheek flaps
      mesh(torus(H, r * 1.12, r * 0.06, Math.PI * 2, 24), red, 0, r * 0.42, 0, g).rotation.x = Math.PI / 2 - 0.12; // the rim
      mesh(box(r * 0.14, r * 0.5, r * 1.5), red, 0, r * 1.08, -r * 0.1, g); // the crest
      const sp = mesh(cone(r * 0.1, r * 0.55, 4), red, 0, r * 0.98, r * 0.7, g); sp.rotation.x = 1.0; // its point at the front
      mesh(box(r * 0.16, r * 0.14, r * 0.9), tc, 0, r * 1.36, -r * 0.2, g); // team plume along the top
      g.userData.hidesFace = true;
      return true;
    }
    case 'avf_zuko': { // shaggy black hair (third season) and the scar round his left eye
      const hair = mat('#141012', { spec: 0.2 }), scar = mat('#b4553e', { spec: 0.1 }), scar2 = mat('#d07a5e', { spec: 0.1 });
      hairCap(H, g, r, hair, 1.07, 0.42, -0.25);
      for (let i = 0; i < 9; i++) { // the fringe hanging over the brow
        const x = (i - 4) * 0.18;
        lock(H, g, r, hair, x, 0.78, 0.55 - Math.abs(x) * 0.25, [x * 0.5, -1, 0.55], 0.5 + (i % 3) * 0.08, 0.17);
      }
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) lock(H, g, r, hair, sd * 0.9, 0.45 - i * 0.2, -0.05 - i * 0.18, [sd * 0.3, -1, -0.15], 0.5, 0.18); // over the ears
      for (let i = 0; i < 5; i++) lock(H, g, r, hair, (i - 2) * 0.25, 0.4, -0.85, [(i - 2) * 0.2, -1, -0.4], 0.55, 0.2); // the back
      // the burn scar (his left: +X): a raw patch round the eye out to the ear
      const s1 = mesh(sphere(r * 0.34, 12, 10), scar, r * 0.42, r * 0.18, r * 0.8, g); s1.scale.set(1.15, 1.0, 0.42); s1.rotation.y = 0.5;
      const s2 = mesh(sphere(r * 0.2, 10, 8), scar2, r * 0.66, r * 0.28, r * 0.62, g); s2.scale.set(1, 1.1, 0.5); s2.rotation.y = 0.9;
      mesh(sphere(r * 0.1, 8, 6), scar, r * 0.9, r * 0.1, r * 0.25, g).scale.set(0.5, 1, 1);
      return true;
    }
    case 'avf_azula': { // black topknot with the gold flame crown, bangs and two long locks
      const hair = mat('#120e10', { spec: 0.35 }), gold = mat(GOLD, { spec: 1 });
      hairCap(H, g, r, hair, 1.07, 0.45, -0.18);
      mesh(sphere(r * 0.34, 12, 10), hair, 0, r * 1.06, -r * 0.18, g).scale.set(1, 0.85, 1.15); // the knot
      mesh(cyl(r * 0.24, r * 0.28, r * 0.12, 10), gold, 0, r * 0.93, -r * 0.16, g);
      // the crown: a gold flame standing up at the front of the knot
      const fl = new THREE.Group(); fl.position.set(0, r * 1.16, r * 0.1); fl.rotation.x = -0.2; fl.scale.setScalar(1.5); g.add(fl);
      mesh(box(r * 0.3, r * 0.12, r * 0.08), gold, 0, -r * 0.05, 0, fl);
      mesh(cone(r * 0.1, r * 0.42, 4), gold, 0, r * 0.2, 0, fl).scale.set(1, 1, 0.45);
      for (const sd of [-1, 1]) { const p = mesh(cone(r * 0.06, r * 0.26, 4), gold, sd * r * 0.12, r * 0.1, 0, fl); p.rotation.z = -sd * 0.45; p.scale.set(1, 1, 0.45); }
      for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 0.17; lock(H, g, r, hair, x, 0.82, 0.52 - Math.abs(x) * 0.2, [x * 0.3, -1, 0.5], 0.36, 0.16); } // short bangs
      for (const sd of [-1, 1]) { // two long locks framing the face
        lock(H, g, r, hair, sd * 0.72, 0.5, 0.48, [sd * 0.05, -1, 0.05], 1.15, 0.13);
      }
      for (const sd of [-1, 1]) { const ey = mesh(box(r * 0.32, r * 0.055, r * 0.05), mat('#1a0e10'), sd * r * 0.34, r * 0.5, r * 0.88, g); ey.rotation.z = sd * 0.4; ey.rotation.y = sd * 0.35; ey.rotation.x = -0.5; } // sharp, arched brows
      return true;
    }
    case 'avf_iroh': { // bald on top, white hair round the back and sides, a little white topknot
      const hair = mat('#ecebe6', { spec: 0.1 }), gold = mat(GOLD, { spec: 1 });
      mesh(hoodGeo(H, r, 1.06, 1.5), hair, 0, -r * 0.08, 0, g);
      mesh(sphere(r * 0.2, 10, 8), hair, 0, r * 1.02, -r * 0.12, g).scale.set(1, 0.8, 1.1);
      mesh(cyl(r * 0.13, r * 0.16, r * 0.12, 8), gold, 0, r * 0.9, -r * 0.1, g);
      mesh(sphere(r * 0.5, 12, 10), hair, 0, -r * 0.8, r * 0.5, g).scale.set(1.25, 0.95, 0.75); // a full white beard
      for (const sd of [-1, 1]) { // sideburns into the beard, and bushy white brows
        mesh(sphere(r * 0.22, 8, 6), hair, sd * r * 0.85, -r * 0.15, r * 0.3, g).scale.set(0.6, 1.4, 0.9);
        const br = mesh(H.capsule(r * 0.08, r * 0.3), hair, sd * r * 0.36, r * 0.5, r * 0.88, g); br.rotation.z = Math.PI / 2 + sd * 0.25;
      }
      return true;
    }
    case 'avf_sparky': { // bald, and the third eye tattooed on his forehead
      const ink = mat('#2a1c22', { spec: 0.1 });
      const eye = new THREE.Group(); eye.position.set(0, r * 0.7, r * 0.74); eye.rotation.x = -0.76; g.add(eye); // (on the forehead, facing out)
      const ring = mesh(torus(H, r * 0.14, r * 0.035, Math.PI * 2, 14), ink, 0, 0, 0, eye); ring.scale.set(1, 1.45, 1);
      mesh(sphere(r * 0.065, 8, 6), ink, 0, 0, 0, eye).scale.set(1, 1.3, 0.5);
      for (const sd of [-1, 1]) mesh(box(r * 0.025, r * 0.16, r * 0.03), ink, 0, sd * r * 0.3, 0, eye);
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== FAC || !def.look?.top?.startsWith?.('avf_')) return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, metal } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], Pv = parts[PART.pelvis];
  const gold = mat(GOLD, { spec: 1 });
  const top = def.look.top;
  if (top === 'avf_soldier') { // red-and-black lamellar armour
    const red = mat(RED, { spec: 0.3 }), dk = mat(BLACK, { spec: 0.35 }), sleeve = mat('#3a2020', { spec: 0.15 });
    chestShell(H, ch, dk, C);
    const plate = mesh(H.capsule(r * 1.08, hh * 1.3), red, 0, hh * 0.05, r * 0.12, C); plate.scale.set(0.95, 1, 0.93);
    for (const y of [0.45, 0.05, -0.35]) mesh(box(r * 1.5, r * 0.05, r * 0.06), dk, 0, y * hh + r * 0.1, r * 1.12, C); // lamellar rows
    mesh(box(r * 0.5, r * 0.4, r * 0.08), dk, 0, hh * 0.65, r * 1.12, C); // breast badge...
    mesh(cone(r * 0.1, r * 0.28, 5), gold, 0, hh * 0.68, r * 1.17, C); // ...with a gold flame
    pauldrons(H, vis, red, dk);
    belt(H, vis, tc, gold);
    const sk = skirt(H, vis, red, 1.9, 1.55);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const st = mesh(box(pel.r * 0.06, pel.r * 1.7, pel.r * 0.08), dk, Math.sin(a) * pel.r * 1.38, -pel.r * 0.8, Math.cos(a) * pel.r * 1.3, Pv); st.rotation.y = a; }
    limbs(H, vis, ARMS, sleeve, 1.1);
    bracers(H, vis, red);
    armband(H, vis, td);
    sk.castShadow = true;
    return;
  }
  if (top === 'avf_zuko') { // a red tunic with gold trim, black under-sleeves, team sash
    const red = mat('#9a2018', { spec: 0.15 }), dkred = mat('#5e1210', { spec: 0.15 }), blk = mat('#1c1414', { spec: 0.15 });
    chestShell(H, ch, red, C);
    for (const sd of [-1, 1]) { const tr = mesh(box(r * 0.1, hh * 1.7, r * 0.05), gold, sd * r * 0.3, hh * 0.4, r * 1.08, C); tr.rotation.z = sd * 0.42; tr.rotation.x = -0.1; } // the V of the collar
    mesh(cyl(r * 0.6, r * 0.66, r * 0.28, 14), dkred, 0, hh + r * 0.6, 0, C);
    belt(H, vis, tc, gold);
    const tail = mesh(box(r * 0.3, r * 0.9, r * 0.06), td, r * 0.5, -hh - r * 0.9, r * 1.0, C); tail.rotation.z = 0.15; // the sash's end
    const sk = skirt(H, vis, red, 1.7, 1.45);
    sk.castShadow = true;
    limbs(H, vis, [PART.uarmL, PART.uarmR], red, 1.12);
    limbs(H, vis, [PART.farmL, PART.farmR], blk, 1.08);
    bracers(H, vis, dkred, 1.22);
    armband(H, vis, td);
    return;
  }
  if (top === 'avf_azula') { // her armour: dark red plates with black and gold, pointed shoulders
    const red = mat('#7a1614', { spec: 0.45 }), dk = mat('#1e1416', { spec: 0.5 });
    chestShell(H, ch, dk, C);
    const plate = mesh(H.capsule(r * 1.06, hh * 1.25), red, 0, hh * 0.1, r * 0.12, C); plate.scale.set(0.9, 1, 0.92);
    for (const sd of [-1, 1]) { const tr = mesh(box(r * 0.07, hh * 1.5, r * 0.05), gold, sd * r * 0.28, hh * 0.35, r * 1.07, C); tr.rotation.z = sd * 0.38; }
    mesh(cyl(r * 0.55, r * 0.64, r * 0.3, 14), dk, 0, hh + r * 0.6, 0, C); // high collar
    pauldrons(H, vis, red, dk, 1.05);
    for (const sd of [-1, 1]) { const pt = mesh(cone(r * 0.16, r * 0.42, 4), red, sd * r * 1.35, hh + r * 0.45, 0, C); pt.rotation.z = -sd * 0.9; } // the points
    belt(H, vis, tc, gold);
    const sk = skirt(H, vis, red, 1.9, 1.6);
    sk.castShadow = true;
    mesh(cyl(pel.r * 1.6, pel.r * 1.62, pel.r * 0.12, 16), gold, 0, -pel.r * 1.22, 0, Pv); // gold hem
    limbs(H, vis, ARMS, dk, 1.1);
    bracers(H, vis, red, 1.25);
    armband(H, vis, td);
    return;
  }
  if (top === 'avf_iroh') { // a green-and-brown robe (the Jasmine Dragon), team sash; a teacup
    const green = mat('#4a6e3c', { spec: 0.1 }), dkgreen = mat('#33502a', { spec: 0.1 }), brown = mat('#6a4a2c', { spec: 0.1 });
    chestShell(H, ch, green, C, 1.02);
    for (const sd of [-1, 1]) { const lp = mesh(box(r * 0.42, hh * 1.9, r * 0.06), brown, sd * r * 0.28, hh * 0.2, r * 1.12, C); lp.rotation.z = sd * 0.4; lp.rotation.x = -0.08; } // crossed robe front
    mesh(cyl(r * 1.2, r * 1.22, r * 0.36, 16), tc, 0, -hh - r * 0.32, 0, C); // team sash round the belly
    mesh(box(r * 0.32, r * 0.3, r * 0.1), td, 0, -hh - r * 0.32, r * 1.18, C);
    const sk = skirt(H, vis, green, 2.9, 1.55);
    sk.castShadow = true;
    mesh(cyl(pel.r * 1.55, pel.r * 1.57, pel.r * 0.22, 16), brown, 0, -pel.r * 2.35, 0, Pv); // brown hem
    limbs(H, vis, ARMS, green, 1.14);
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.4, sp.r * 1.9, sp.hh * 1.2, 10), dkgreen, 0, -sp.hh * 0.15, 0, parts[p]); } // wide sleeves
    // the teacup in his left hand (a pai sho tile on the sash, for luck)
    const sp = skel.parts[PART.farmL], hy = -sp.hh - sp.r * 1.6;
    const cup = mesh(cyl(sp.r * 0.75, sp.r * 0.5, sp.r * 0.85, 10), mat('#f4f0e6', { spec: 0.6 }), 0, hy, sp.r * 1.3, parts[PART.farmL]);
    cup.rotation.x = Math.PI / 2;
    mesh(cyl(sp.r * 0.6, sp.r * 0.6, sp.r * 0.06, 10), mat('#8a5a2a'), 0, hy, sp.r * 1.72, parts[PART.farmL]).rotation.x = Math.PI / 2;
    const tile = mesh(cyl(r * 0.16, r * 0.16, r * 0.05, 10), mat('#e8dcc0'), -r * 0.6, -hh - r * 0.3, r * 1.12, C); tile.rotation.x = Math.PI / 2;
    return;
  }
  if (top === 'avf_sparky') { // sleeveless dark tunic, a metal left arm and left leg
    const tun = mat('#3a2422', { spec: 0.1 }), met = metal(), dark = mat('#3c4048', { spec: 0.8 }), skin = mat(def.look.skin, { spec: 0.18 });
    chestShell(H, ch, tun, C);
    for (const sd of [-1, 1]) { const o = mesh(sphere(r * 0.5, 10, 8), skin, sd * r * 0.98, hh + r * 0.15, 0, C); o.scale.set(0.9, 0.7, 0.9); } // bare shoulders
    mesh(cyl(r * 0.62, r * 0.7, r * 0.22, 14), mat('#24181a'), 0, hh + r * 0.55, 0, C);
    belt(H, vis, tc, mat('#5a4a3a'));
    const sk = skirt(H, vis, tun, 1.5, 1.4); sk.castShadow = true;
    // the metal arm (his left, +X): plated tubes, a ball elbow and a big metal fist
    for (const p of [PART.uarmL, PART.farmL]) {
      const sp = skel.parts[p];
      mesh(H.capsule(sp.r * 1.15, sp.hh * 2), met, 0, 0, 0, parts[p]);
      for (const y of [-0.5, 0, 0.5]) mesh(cyl(sp.r * 1.22, sp.r * 1.22, sp.r * 0.18, 10), dark, 0, y * sp.hh, 0, parts[p]);
    }
    { const sp = skel.parts[PART.farmL]; mesh(sphere(sp.r * 1.75, 12, 10), met, 0, -sp.hh - sp.r * 0.3, 0, parts[PART.farmL]).scale.set(1, 1.05, 1.1); mesh(sphere(skel.parts[PART.uarmL].r * 1.45, 10, 8), dark, 0, -skel.parts[PART.uarmL].hh, 0, parts[PART.uarmL]); }
    // the metal left leg
    for (const p of [PART.thighL, PART.shinL]) { const sp = skel.parts[p]; mesh(H.capsule(sp.r * 1.12, sp.hh * 2), met, 0, 0, 0, parts[p]); mesh(cyl(sp.r * 1.18, sp.r * 1.18, sp.r * 0.2, 10), dark, 0, -sp.hh * 0.3, 0, parts[p]); }
    { const sp = skel.parts[PART.shinL]; mesh(sphere(sp.r * 1.35, 10, 8), dark, 0, sp.hh, 0, parts[PART.shinL]); }
    // the right arm: bare, with a wrapped wrist; a team band
    { const sp = skel.parts[PART.farmR]; mesh(cyl(sp.r * 1.25, sp.r * 1.25, sp.hh * 0.6, 10), mat('#5a4636'), 0, -sp.hh * 0.45, 0, parts[PART.farmR]); }
    armband(H, vis, td, PART.uarmR);
  }
}

function buildItem(name, s, team, g, H) {
  const { mesh, box, cyl, cone, mat, metal } = H;
  if (name === 'avf_fist') return true; // (bare hands: the forearm's own hand is the fist)
  if (name === 'avf_dao') { // a dao broadsword: wide single-edged blade swelling to the tip
    const steel = metal(), dk = mat('#2a1a14'), brass = mat(GOLD, { spec: 1 });
    mesh(cyl(0.022 * s, 0.024 * s, 0.17 * s, 8), dk, 0, 0.0, 0, g);
    mesh(cyl(0.032 * s, 0.032 * s, 0.03 * s, 8), brass, 0, -0.09 * s, 0, g);
    mesh(box(0.14 * s, 0.025 * s, 0.05 * s), brass, 0, 0.095 * s, 0, g); // guard
    const b1 = mesh(box(0.075 * s, 0.42 * s, 0.016 * s), steel, 0.005 * s, 0.32 * s, 0, g);
    const b2 = mesh(box(0.105 * s, 0.26 * s, 0.016 * s), steel, 0.02 * s, 0.62 * s, 0, g);
    const tip = mesh(cone(0.065 * s, 0.14 * s, 4), steel, 0.02 * s, 0.81 * s, 0, g); tip.scale.set(1, 1, 0.22); tip.rotation.z = 0.3;
    mesh(box(0.012 * s, 0.6 * s, 0.02 * s), mat('#8a9098', { spec: 0.8 }), -0.03 * s, 0.45 * s, 0, g); // the back of the blade
    b1.castShadow = b2.castShadow = true;
    return true;
  }
  if (name === 'avf_spear') { // a Fire Nation spear: dark shaft, leaf blade, red tassel
    // (held 55% of the way up: it spans y = -1.05 .. 0.86 at scale 1)
    mesh(cyl(0.022 * s, 0.022 * s, 1.75 * s, 6), mat('#4a2e1c'), 0, -0.17 * s, 0, g);
    const bl = mesh(cone(0.06 * s, 0.3 * s, 4), metal(), 0, 0.82 * s, 0, g); bl.scale.set(1, 1, 0.3);
    mesh(cyl(0.03 * s, 0.03 * s, 0.06 * s, 6), mat(GOLD, { spec: 1 }), 0, 0.67 * s, 0, g);
    mesh(cone(0.05 * s, 0.14 * s, 6), mat('#c0201a'), 0, 0.59 * s, 0, g).rotation.x = Math.PI;
    return true;
  }
  return false;
}

// unlit (always bright) materials for flames and lightning, like the core fireball's
const BASIC = new Map();
function basic(color, opacity = 1, add = false) {
  const k = color + opacity + add;
  if (!BASIC.has(k)) BASIC.set(k, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  return BASIC.get(k);
}
function buildProj(type, g, H) {
  const { mesh, sphere, cyl } = H;
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = mesh(geo, m, x, y, z, g); o.castShadow = false; return o; };
  const ball = (core, mid, out, k) => {
    add(sphere(0.15 * k, 12, 10), basic(core));
    const b = add(sphere(0.25 * k, 12, 10), basic(mid, 0.6));
    const c = add(sphere(0.38 * k, 10, 8), basic(out, 0.3, true));
    g.userData.flicker = [b, c];
  };
  switch (type) {
    case 'avf_fire': ball('#fff0b0', '#ffa030', '#ff5a1a', 0.8); return true;
    case 'avf_bigfire': ball('#fff4c8', '#ffa030', '#ff5a1a', 1.35); return true;
    case 'avf_bfire': ball('#f4fcff', '#6ab8ff', '#2a6aff', 0.85); return true;
    case 'avf_spark': { // Combustion Man's beam: a white-hot streak
      add(cyl(0.06, 0.06, 0.9, 6), basic('#fff8e0'));
      const b = add(cyl(0.17, 0.11, 1.1, 8), basic('#ff9a3a', 0.55), 0, -0.1, 0);
      const c = add(sphere(0.24, 10, 8), basic('#ffb040', 0.45, true), 0, 0.42, 0);
      g.userData.flicker = [b, c];
      return true;
    }
    case 'avf_arc': { // a lightning segment (shaft along +Y, 0.75 long)
      add(cyl(0.035, 0.035, 0.8, 5), basic('#ffffff'));
      add(cyl(0.13, 0.13, 0.8, 6), basic('#8ac8ff', 0.4, true));
      return true;
    }
    case 'avf_eye': { // the third eye glowing as it charges
      const a = add(sphere(0.05, 8, 6), basic('#fff4c0'));
      const b = add(sphere(0.13, 10, 8), basic('#ff8a2a', 0.55, true));
      g.userData.flicker = [b, a];
      return true;
    }
    case 'avf_orb': { // lightning gathering in a hand
      const a = add(sphere(0.07, 8, 6), basic('#ffffff'));
      const b = add(sphere(0.17, 10, 8), basic('#7ab8ff', 0.5, true));
      g.userData.flicker = [b, a];
      return true;
    }
  }
  return false;
}

register({
  units,
  items: {
    avf_fist: { len: 0.42, r: 0.11, grip: 90, phys: false }, // bare fists (hit geometry only)
    avf_dao: { len: 0.85, r: 0.07, grip: 30, metal: true, mass: 1.2 },
    avf_spear: { len: 1.9, r: 0.06, grip: 95, back: 0.55, metal: true, mass: 2.0 },
  },
  kinds: { avf_soldier: soldier, avf_zuko: zuko, avf_azula: azula, avf_iroh: iroh, avf_sparky: sparky },
  proj: {
    avf_fire: fireballProj(0.14, false),
    avf_bigfire: fireballProj(0.22, true),
    avf_bfire: fireballProj(0.15, false),
    avf_spark: {
      g: 0, len: 0.9, r: 0.14, life: 3,
      step(b, pr, dt) {
        pr.tk = (pr.tk || 0) + 1;
        for (let k = 0; k < 3; k++) { // a continuous streak (it moves ~0.7 m a step)
          const f = k / 3;
          b.emit('av_ftrail', pr.pos.x - pr.vel.x * dt * f, pr.pos.y - pr.vel.y * dt * f, pr.pos.z - pr.vel.z * dt * f, 0, 0);
        }
        pr.tleft -= dt;
        if (pr.tleft <= 0) { sparkBoom(b, pr); pr.life = -1; }
      },
      hit(b, pr) { sparkBoom(b, pr); return true; },
      ground(b, pr) { sparkBoom(b, pr); return true; },
    },
    avf_arc: { g: 0, len: 0, r: 0, life: 1 },
    avf_eye: { g: 0, len: 0, r: 0, life: 1 },
    avf_orb: { g: 0, len: 0, r: 0, life: 1 },
  },
  buildItem, buildHat, decorate, buildProj,
  fx: FX,
});
