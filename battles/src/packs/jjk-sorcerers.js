// Jujutsu Kaisen: more sorcerers (faction 'jjk', side 'sorcerer', on jjk-core.js).
//  - Ryu Ishigori: heavy fists; Granite Blast - a long charge, then the thickest beam
//    of cursed energy there is, through everyone on the line
//  - Takako Uro: Sky Manipulation - Thin Ice Breaker folds the sky over everyone in front
//    of her and flings them away; while the sky is bent round her, shots come back
//  - Hajime Kashimo: the nyoi staff; his cursed energy is lightning (every blow arcs on
//    to the enemies nearby and can't be parried; bolts from range); badly hurt, Mythical
//    Beast Amber - glowing, faster, lightning everywhere - until his body burns out
//  - Hiromi Higuruma: the gavel; Domain: Deadly Sentencing - no violence in the court,
//    Judgeman tries the strongest enemy inside: GUILTY means Confiscation (no technique
//    for a long while) and the Executioner's Sword (the convict dies at a touch)
//  - Yuki Tsukumo: Star Rage (blows with virtual mass bowl over everyone round the one
//    she hits), Garuda thrown from range, and at death's door a Black Hole
//  - Mei Mei: a great battle-axe; Bird Strike - homing crows, and now and then one that
//    flies in to die
//  - Noritoshi Kamo: Blood Manipulation archer (blood arrows that curve onto the
//    target); hurt, Flowing Red Scale: faster, and two arrows a shot
//  - Naoya Zen'in: Projection Sorcery - 24-frame dashes from foe to foe; whoever he
//    touches is frozen in a frame for a moment
//  - Ultimate Mechamaru: a puppet robot; blade arm, Ultra Cannon beam, thruster dashes;
//    once, Absolute Mode - it flies and rains missiles
//  - Atsuya Kusakabe: katana; Simple Domain - a circle where every enemy who steps in
//    meets a quick-draw, and sure-hits don't land on him
// Everything drawn is a unit part, a projectile or a marker, so replays show it.
import { register, EXT } from '../ext.js';
import { ATTACKS } from '../pose.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, aimPoint, launchVel, addProjectile,
  strike, handPos, torus, dome, tcol, tdark, chestShell, blast, lightning,
} from './common.js';
import { UPY, STANCE, setArmKey, refreshBeam, endBeam, hover } from './ges-core.js';
import {
  FACTION, jk, announce, burntOut, openDomain, domainAt, domeMesh, markerAt, markerOn,
} from './jjk-core.js';

const FAC = FACTION.id, SIDE = 'sorcerer';
const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _A = new THREE.Vector3();
const _e = new THREE.Euler();
export const HIG_R = 7; // Deadly Sentencing's radius (its marker is built at this size)
const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const foe = (u, v) => v && v.alive && !v.dormant && v.team !== u.team;

// ------------------------------------------------------------------ animations
// Ryu charging Granite Blast: both palms out in front, braced
STANCE.jk_charge = (st, pose) => { setArmKey(pose, -1, [0.55, 0.1, -1.35, -1.5]); setArmKey(pose, 1, [0.55, 0.1, -1.35, -1.5]); };
// a quick-draw: the hand at the hip whips across
ATTACKS.jk_batto = [
  [0.0, null, null, 0, 0, 0],
  [0.25, [0.2, 0.2, 0.3, -0.6], null, 0, -0.2, 0.1],
  [0.45, [-0.6, 1.3, -1.3, -0.3], null, 0, 0.35, 0.1],
  [0.75, [-0.6, 1.25, -1.25, -0.3], null, 0, 0.3, 0.1],
  [1.0, null, null, 0, 0, 0],
];

// ------------------------------------------------------------------ helpers
function techBanner(b, text, pos, gap = 7) {
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
function markSpin(b, type, pos, t) {
  const s = markerAt(b, type, pos, t);
  s.quat.setFromEuler(_e.set(rand(-1.2, 1.2), rand(0, Math.PI * 2), rand(-1.2, 1.2)));
  return s;
}
function enemiesNear(u, p, R) {
  const out = [];
  u.battle.grid.query(p.x, p.z, R + 1, (v) => { if (foe(u, v) && flat(v.pos, p) < R + v.skel.radius) out.push(v); });
  return out;
}
const busy = (u) => !!u.st.attack || u.stun > 0.2 || u.isDown() || u.jkSealedT > u.battle.time;
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
// a straight line of cursed energy from A along dir (unit) for up to `range` (stops at
// the ground); fn(v) for every enemy within `width` of it. Returns the end point in B.
function lineHits(u, A, dir, range, width, B, fn) {
  const b = u.battle;
  B.copy(A).addScaledVector(dir, range);
  for (let k = 1; k <= 24; k++) {
    _o.copy(A).addScaledVector(dir, (range * k) / 24);
    if (_o.y < b.terrain.height(_o.x, _o.z)) { B.copy(_o); break; }
  }
  const L = A.distanceTo(B);
  b.grid.query((A.x + B.x) / 2, (A.z + B.z) / 2, L / 2 + 2, (v) => {
    if (!foe(u, v)) return;
    const vc = v.chestPos;
    _o.copy(vc).sub(A);
    const s = clamp(_o.dot(dir), 0, L);
    _o.copy(A).addScaledVector(dir, s);
    if (_o.distanceTo(vc) > width + v.skel.radius) return;
    fn(v);
  });
  return B;
}
// the direction a caster's beam goes: at the aimed target, or the crosshair
function beamDir(u, A, out) {
  aimPoint(u, _p, 0.2, 0.15);
  if (!u.aimAt && u.control && !u.control.aimPt) _p.y = A.y + Math.tan(u.control.aimPitch) * 14;
  out.copy(_p).sub(A);
  if (out.lengthSq() < 1e-4) out.set(Math.sin(u.heading), 0, Math.cos(u.heading));
  return out.normalize();
}
// a lightning arc from A to B: a few jagged segment markers
function arc(b, A, B, t = 0.2) {
  const d = A.distanceTo(B), n = clamp(Math.ceil(d / 0.9), 1, 10);
  let px = A.x, py = A.y, pz = A.z;
  for (let i = 1; i <= n; i++) {
    const f = i / n, end = i === n, j = end ? 0 : 0.25;
    const x = A.x + (B.x - A.x) * f + rand(-j, j), y = A.y + (B.y - A.y) * f + rand(-j, j), z = A.z + (B.z - A.z) * f + rand(-j, j);
    _v.set(x - px, y - py, z - pz);
    const L = _v.length() || 1;
    const s = markerAt(b, 'jk_arcseg', _o.set((px + x) / 2, (py + y) / 2, (pz + z) / 2), t);
    s.quat.setFromUnitVectors(UPY, _v.multiplyScalar(1 / L));
    px = x; py = y; pz = z;
  }
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

// ------------------------------------------------------------------ domains
const myDomain = (u) => (u.jkDom && jk(u.battle).domains.includes(u.jkDom) ? u.jkDom : null);
function wantDomain(u, dt) {
  const b = u.battle, w = u.def.weapon;
  u.jkDomCD -= dt;
  if (u.jkDomCD > 0 || b.over || burntOut(u) || myDomain(u) || u.stun > 0.3 || u.jkSealedT > b.time || u.st.attack || u.isDown()) return false;
  for (const d of jk(b).domains) if (d.team !== u.team && flat(u.pos, d.pos) < d.R) return true;
  let n = 0, big = 0, left = 0;
  for (const v of b.foes(u.team)) {
    if (!v.alive) continue;
    left++;
    if (flat(v.pos, u.pos) > w.domR * 0.7) continue;
    n++;
    if (v.def.cost >= 900) big++;
  }
  if (n >= Math.min(w.domMin, left) || big || (u.control && n > 0)) return true;
  u.jkDomCD = 0.4;
  return false;
}

// ------------------------------------------------------------------ Ryu Ishigori
// Heavy punches up close. Granite Blast: he plants his feet and charges (a growing
// sphere of cursed energy in his palms), then lets go a beam as thick as a man that
// ploughs through everyone on the line.
const ryu = {
  melee: true,
  init(u) { u.jkGB = u.def.weapon.gbFirst; u.jkChg = 0; u.jkBeam = {}; u.jkBeamT = 0; u.jkChgMk = null; },
  think(u, dt, c) {
    const w = u.def.weapon;
    if (u.jkChg > 0) { u.desired.set(0, 0, 0); u.aimAt = c.t; return c.t; }
    const t = meleeThink(u, dt, c);
    if (u.jkGB <= 0 && !busy(u) && c.dist > w.gbMin && c.dist < w.gbRange * 0.9 && !burntOut(u)) {
      u.jkGB = w.gbCD * rand(0.9, 1.1);
      u.jkChg = w.gbCharge;
      u.aimAt = c.t;
      u.st.style = 'jk_charge';
      u.jkChgMk = markerOn(u.battle, u, 'jk_gbcharge', PART.chest, w.gbCharge + 0.1, new THREE.Vector3(0, 0.05, u.skel.rChest * 2.6));
      u.battle.sound('magic', u.chestPos, 0.7, 0.6);
      techBanner(u.battle, 'Granite Blast!', u.headPos);
    }
    return t;
  },
  event(u, t0, t1) { castEvent(u, t0, t1, { granite: graniteBlast }); },
  step(u, dt) {
    const b = u.battle;
    if (!u.st.attack) u.jkCast = null;
    u.jkGB -= dt;
    if (u.jkChg > 0) {
      u.jkChg -= dt;
      if (u.stun > 0.4 || !u.alive) { u.jkChg = 0; endCharge(u); }
      else if (u.jkChg <= 0) { endCharge(u); castPose(u, 'jk_push', 'granite'); }
      else if (Math.random() < dt * 10) { const c = u.chestPos; b.emit('spark', c.x, c.y, c.z, 1); }
    }
    if (u.jkBeamT > 0) {
      u.jkBeamT -= dt;
      if (u.jkBeamT <= 0 || !u.alive) endBeam(u.jkBeam);
      else refreshBeam(b, u.jkBeam, u, u.jkBA, u.jkBB, 'jk_gbseg', 1.0);
    }
  },
  die(u) { endBeam(u.jkBeam); endCharge(u); },
};
function endCharge(u) {
  u.st.style = u.def.weapon.style;
  if (u.jkChgMk) { u.jkChgMk.t = 0; u.jkChgMk = null; }
}
function graniteBlast(u) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const A = new THREE.Vector3(c.x + fx * 0.7 * u.s, c.y + 0.1, c.z + fz * 0.7 * u.s);
  beamDir(u, A, _d);
  const B = new THREE.Vector3();
  lineHits(u, A, _d, w.gbRange, w.gbWidth, B, (v) => {
    _v.set(_d.x, 0.35, _d.z).normalize();
    strike(b, v, w.gbDmg, _v, Math.min(w.gbForce, v.M * 16), u, 'jk_granite', PART.chest, 'crunch');
    if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 1.2 * (v.def.stagger ?? 1));
  });
  u.jkBA = A; u.jkBB = B; u.jkBeamT = 0.5;
  refreshBeam(b, u.jkBeam, u, A, B, 'jk_gbseg', 1.0);
  b.emit('explode', B.x, B.y, B.z, 2.2, 0);
  b.sound('boom', A, 1.4, 0.55);
  b.sound('flyby', A, 1.0, 0.6);
  u.rag.impulseAll(-_d.x * u.M * 3, 0, -_d.z * u.M * 3); // the recoil
}

// ------------------------------------------------------------------ Takako Uro
// Kicks up close. Thin Ice Breaker: she takes hold of the sky's surface in front of her
// and folds it, scooping everyone there up and away. When shots come at her she bends
// the sky round herself for a moment, and they go back where they came from.
const uro = {
  melee: true,
  init(u) { u.jkSky = u.def.weapon.skyFirst; u.jkDefCD = 0; u.jkDefT = 0; u.jkDefMk = null; u.jkScan = 0; },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, c);
    if (u.jkSky <= 0 && !busy(u) && !burntOut(u)) {
      const n = enemiesNear(u, u.pos, w.skyR * 0.8).filter((v) => inCone(u, v, 0.35)).length;
      if (n >= 2 || (n >= 1 && c.gap < 2.5)) { u.jkSky = w.skyCD * rand(0.9, 1.1); castPose(u, 'jk_push', 'sky'); }
      else u.jkSky = 0.25;
    }
    return t;
  },
  event(u, t0, t1) { castEvent(u, t0, t1, { sky: thinIce }); },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkSky -= dt; u.jkDefCD -= dt;
    const c = u.chestPos;
    if (u.jkDefT > b.time) {
      // the sky bent round her: enemy shots that reach it turn back
      for (const pr of b.projectiles) {
        if (pr.team === u.team || pr.sure || pr.uroK) continue;
        if (pr.pos.distanceTo(c) > w.defR) continue;
        pr.uroK = true;
        // a pack's own projectile reads its owner's technique when it lands (an ice block's
        // radius, a fish's bite...), so it can't change hands: the bent sky just stops it
        if (EXT.proj[pr.type]) {
          pr.life = -1;
          b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 4);
          b.sound('whoosh', pr.pos, 0.6, 1.8);
          techBanner(b, 'Uro bends the sky: the attack slides off!', c, 10);
          continue;
        }
        const back = pr.owner && pr.owner.alive && pr.owner !== u ? pr.owner : null;
        pr.team = u.team; pr.owner = u; pr.hits.clear(); pr.aim = null; pr.tgt = back;
        if (back) { _v.copy(back.chestPos).sub(pr.pos).normalize().multiplyScalar(Math.max(10, pr.vel.length())); pr.vel.copy(_v); }
        else { pr.vel.multiplyScalar(-1); pr.vel.y = Math.abs(pr.vel.y) * 0.3 + 1; }
        if (pr.life < 1.5) pr.life = 1.5;
        b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 3);
        b.sound('whoosh', pr.pos, 0.6, 1.8);
        techBanner(b, 'Uro bends the sky: the shot flies back!', c, 10);
      }
    } else if (u.jkDefMk) { u.jkDefMk.t = 0; u.jkDefMk = null; }
    // shots on the way in: bend the sky
    u.jkScan -= dt;
    if (u.jkScan <= 0 && u.jkDefCD <= 0 && !burntOut(u) && u.stun <= 0.5) {
      u.jkScan = 0.1;
      for (const pr of b.projectiles) {
        if (pr.team === u.team || pr.sure) continue;
        _v.copy(c).sub(pr.pos);
        const d = _v.length();
        if (d > 7 || d < 0.1 || pr.vel.dot(_v) < pr.vel.length() * d * 0.6) continue;
        u.jkDefCD = w.defCD; u.jkDefT = b.time + w.defT;
        u.jkDefMk = markerOn(b, u, 'jk_skywall', PART.chest, w.defT + 0.1);
        b.sound('whoosh', c, 0.9, 0.7);
        break;
      }
    }
  },
  die(u) { if (u.jkDefMk) { u.jkDefMk.t = 0; u.jkDefMk = null; } },
};
function inCone(u, v, k) {
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
  return (dx * fx + dz * fz) / d > k;
}
function thinIce(u) {
  const b = u.battle, w = u.def.weapon;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const at = _p.set(u.pos.x + fx * 2.5, 0, u.pos.z + fz * 2.5);
  at.y = b.terrain.height(at.x, at.z);
  markerAt(b, 'jk_skyfold', at, 0.7, u.heading);
  for (const v of enemiesNear(u, u.pos, w.skyR)) {
    if (!inCone(u, v, 0.25)) continue;
    const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    v.hit(w.skyDmg, PART.chest, 0, 0, 0, u, 'jk_sky');
    if (!v.alive || v.parriedAt === b.time) continue;
    const k = Math.min(1, 160 / v.M) * v.M;
    v.rag.impulseAll(dx / d * w.skyOut * k, w.skyUp * k, dz / d * w.skyOut * k);
    v.stun = Math.max(v.stun, w.skyStun * (v.def.stagger ?? 1));
  }
  b.emit('dust', at.x, at.y, at.z, 6);
  b.sound('whoosh', at, 1.3, 0.5);
  b.sound('crash', at, 0.5, 1.6);
  techBanner(b, 'Sky Manipulation: Thin Ice Breaker!', u.headPos, 9);
}

// ------------------------------------------------------------------ Hajime Kashimo
// The nyoi staff. Every blow is lightning: extra damage that no blade can catch, and an
// arc that jumps on to up to two enemies nearby. Enemies out of reach get a bolt.
// Badly hurt (once): Mythical Beast Amber - healed, glowing, faster and stronger,
// lightning falling all round him... and his body burns out at the end of it.
const amberOn = (u) => (u.jkAmber || 0) > u.battle.time;
const kashimo = {
  melee: true,
  init(u) { u.jkBolt = rand(1, 3); u.jkAmber = 0; u.jkAmberUsed = false; u.jkAmberMk = null; u.jkStrike = 0; },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, amberOn(u) ? { ...c, spd: c.spd * w.amberSpeed } : c);
    if (u.jkBolt <= 0 && !busy(u) && c.gap > 3 && c.dist < w.boltRange && !burntOut(u)) {
      u.jkBolt = w.boltCD * rand(0.85, 1.15) * (amberOn(u) ? 0.5 : 1);
      u.jkBoltT = c.t;
      castPose(u, 'jk_push', 'bolt');
    }
    return t;
  },
  event(u, t0, t1) { castEvent(u, t0, t1, { bolt: kashimoBolt }); },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkBolt -= dt;
    const am = amberOn(u);
    newVictims(u, (v) => {
      if (!v.alive) return;
      v.hit(w.arcDmg * (am ? w.amberDmg : 1), PART.chest, 0, 0, 0, u, 'jk_volt'); // (lightning: no blade catches it)
      v.stun = Math.max(v.stun, 0.35 * (v.def.stagger ?? 1));
      const c = v.chestPos;
      b.emit('spark', c.x, c.y, c.z, 4);
      let n = 0;
      for (const o of enemiesNear(u, c, w.arcR)) {
        if (o === v || n >= w.arcN) continue;
        n++;
        arc(b, c, o.chestPos, 0.2);
        o.hit(w.arcDmg * 0.7 * (am ? w.amberDmg : 1), PART.chest, 0, 0, 0, u, 'jk_volt');
        o.stun = Math.max(o.stun, 0.3 * (o.def.stagger ?? 1));
      }
      if (n) b.sound('clang', c, 0.5, 2.4);
    });
    if (!u.jkAmberUsed && u.hp < u.maxHp * w.amberAt && !b.over && u.stun < 1) {
      u.jkAmberUsed = true;
      u.jkAmber = b.time + w.amberT;
      u.hp = u.maxHp;
      u.stun = 0;
      u.jkAmberMk = markerOn(b, u, 'jk_amber', PART.chest, w.amberT + 0.5);
      const h = u.headPos;
      lightning(b, h.x, h.z, u, 0, 0.1, 0);
      b.sound('boom', h, 1.2, 0.8);
      b.voice(u, 'cry', true);
      announce(b, 'Kashimo: Mythical Beast Amber!', h, 'amber' + u.id);
    }
    if (u.jkAmberUsed && !am && u.alive && u.jkAmberMk) {
      // the transformation is done: his body has burnt out
      u.jkAmberMk.t = 0; u.jkAmberMk = null;
      announce(b, "Kashimo's body burns out after Mythical Beast Amber", u.headPos);
      u.die(null);
      return;
    }
    if (am) {
      u.buff = Math.max(u.buff, 0.2);
      u.stun = Math.min(u.stun, 0.4);
      u.jkStrike -= dt;
      if (u.jkStrike <= 0) {
        u.jkStrike = w.amberEvery;
        const near = enemiesNear(u, u.pos, w.amberR);
        for (let i = 0; i < Math.min(2, near.length); i++) {
          const v = near[(Math.random() * near.length) | 0];
          lightning(b, v.pos.x, v.pos.z, u, w.amberBolt, 1.6, 500);
        }
      }
      if (Math.random() < dt * 10) { const c = u.chestPos; b.emit('spark', c.x + rand(-0.4, 0.4), c.y + rand(-0.5, 0.6), c.z + rand(-0.4, 0.4), 1); }
    }
  },
  hit(u, amount) { return amberOn(u) ? amount * u.def.weapon.amberArmor : amount; },
  die(u) { if (u.jkAmberMk) { u.jkAmberMk.t = 0; u.jkAmberMk = null; } },
};
function kashimoBolt(u) {
  const b = u.battle, w = u.def.weapon, t = u.jkBoltT;
  if (!t || !t.alive) return;
  arc(b, handPos(u, _A), t.chestPos, 0.25);
  lightning(b, t.pos.x, t.pos.z, u, w.boltDmg, w.boltR, 450);
}

// ------------------------------------------------------------------ Hiromi Higuruma
// The gavel. His domain, Deadly Sentencing, does no harm: there is no violence in the
// court. Judgeman puts the strongest enemy inside on trial. GUILTY: Confiscation (no
// technique and no domain for a long while) and Higuruma's gavel becomes the
// Executioner's Sword - one touch on the convict is death, and it cuts deep into anyone
// else. NOT GUILTY: the court is adjourned.
const swordOn = (u) => (u.jkSword || 0) > u.battle.time;
const higuruma = {
  melee: true,
  init(u) { u.jkDomCD = u.def.weapon.domFirst; u.jkSword = 0; u.jkSwordMk = null; u.jkConvict = null; u.jkCourt = false; },
  think(u, dt, c) {
    if (u.jkCourt) { u.desired.set(0, 0, 0); return c.t; }
    return meleeThink(u, dt, c);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    const sw = swordOn(u);
    if (!sw && u.jkSwordMk) { u.jkSwordMk.t = 0; u.jkSwordMk = null; }
    newVictims(u, (v) => {
      if (!sw || !v.alive) return;
      const c = v.chestPos;
      if (v === u.jkConvict && v.def.cost < w.topCost) {
        announce(b, "The Executioner's Sword: sentence carried out", c);
        v.hit(v.hp + 9999, PART.chest, 0, 0, 0, u, 'jk_execute');
        b.sound('slash', c, 1.2, 0.6);
      } else v.hit(w.swordDmg * (v === u.jkConvict ? 3 : 1), PART.chest, 0, 0, 0, u, 'jk_execute'); // (the very strongest survive it)
      markSpin(b, 'jk_xcut', c, 0.3);
    });
    if (!u.jkCourt && wantDomain(u, dt)) {
      castPose(u, 'jk_sign', null);
      u.jkDomCD = w.domCD;
      const d = openDomain(b, u, {
        name: 'Deadly Sentencing', radius: w.domR, duration: w.domDur, power: w.domPow, tick: 99, marker: 'jk_dom_higuruma',
        step(b, dom, dt) { courtStep(u, dom, dt); },
        onClose() { u.jkCourt = false; if (u.jkJudgeMk) { u.jkJudgeMk.t = 0; u.jkJudgeMk = null; } },
      });
      u.jkDom = d;
      if (d) { u.jkCourt = true; d.data.t = 0; d.data.phase = 0; }
    }
  },
  die(u) { if (u.jkSwordMk) { u.jkSwordMk.t = 0; u.jkSwordMk = null; } },
};
function courtStep(u, dom, dt) {
  const b = u.battle, w = u.def.weapon, D = dom.data;
  D.t += dt;
  // no violence in the courtroom
  for (const v of dom.inside) if (v.alive && v.team !== u.team) { v.stun = Math.max(v.stun, 0.25); v.st.attack = null; }
  if (D.phase === 0 && D.t > 0.7) {
    D.phase = 1;
    let best = null;
    for (const v of dom.inside) {
      if (!foe(u, v) || v.jkNoCE || flat(v.pos, dom.pos) > dom.R) continue;
      if (!best || v.def.cost > best.def.cost || (v.def.cost === best.def.cost && v.hp > best.hp)) best = v;
    }
    if (!best) { announce(b, 'Judgeman finds no one to put on trial', dom.pos); dom.t = 0; return; }
    D.def = best;
    u.jkJudgeMk = markerOn(b, best, 'jk_trial', PART.head, w.trialT + 0.5, new THREE.Vector3(0, best.skel.rHead * 2.2, 0));
    announce(b, `Deadly Sentencing: Judgeman puts ${best.def.name} on trial`, best.headPos);
    b.sound('gong', dom.pos, 0.9, 0.7);
    return;
  }
  if (D.phase === 1 && D.t > 0.7 + w.trialT) {
    D.phase = 2;
    const v = D.def;
    if (u.jkJudgeMk) { u.jkJudgeMk.t = 0; u.jkJudgeMk = null; }
    if (!v || !v.alive) { dom.t = 0; return; }
    const guilty = Math.random() < w.guilty + 0.08 * Math.min(4, v.kills || 0);
    if (guilty) {
      announce(b, `GUILTY: ${v.def.name}'s cursed technique is confiscated!`, v.headPos);
      const ct = w.confT * (v.def.cost >= w.topCost ? 0.35 : 1);
      v.jkBurnout = Math.max(v.jkBurnout || 0, b.time + ct);
      v.jkConfiscated = b.time + ct;
      v.stun = Math.max(v.stun, 1.5);
      markerOn(b, v, 'jk_confisc', PART.head, ct, new THREE.Vector3(0, v.skel.rHead * 1.9, 0));
      u.jkConvict = v;
      u.jkSword = b.time + w.swordT;
      if (u.jkSwordMk) u.jkSwordMk.t = 0;
      u.jkSwordMk = markerOn(b, u, 'jk_xsword', PART.farmR, w.swordT, new THREE.Vector3(0, -u.skel.handOffset, 0));
      b.sound('gong', v.headPos, 1.3, 0.5);
      b.sound('clang', u.chestPos, 1.0, 0.6);
      u.expr = EXPR.angry;
    } else {
      announce(b, `NOT GUILTY: ${v.def.name} walks free. Court adjourned.`, v.headPos);
      b.sound('click', dom.pos, 1.0, 0.7);
    }
    dom.t = Math.min(dom.t, 0.6); // the domain closes after the verdict
  }
}

// ------------------------------------------------------------------ Yuki Tsukumo
// Star Rage: her blows carry virtual mass - a shockwave round the one she hits that
// bowls over everyone close. Garuda, her shikigami, is thrown at enemies out of reach.
// The blow that would kill her instead sets off a Black Hole: for a few seconds it
// drags everyone round her in and crushes them, and it takes her with it.
const yuki = {
  melee: true,
  init(u) { u.jkGar = rand(1.5, 3); u.jkBH = null; u.jkBHused = false; },
  think(u, dt, c) {
    const w = u.def.weapon;
    if (u.jkBH) { u.desired.set(0, 0, 0); return c.t; }
    const t = meleeThink(u, dt, c);
    if (u.jkGar <= 0 && !busy(u) && c.gap > 4 && c.dist < w.garRange) {
      u.jkGar = w.garCD * rand(0.85, 1.15);
      u.aimAt = c.t;
      castPose(u, 'throw', 'garuda');
    }
    return t;
  },
  event(u, t0, t1) {
    if (castEvent(u, t0, t1, { garuda: throwGaruda })) return;
    // a blow with that much mass behind it doesn't miss what is right in front of her
    if (u.st.attack !== u.anim || !crossed(t0, t1, 0.5) || u.hitSet.size) return;
    const b = u.battle, w = u.def.weapon;
    let best = null, bd = u.reachDist + 0.7;
    for (const v of enemiesNear(u, u.pos, bd + 1)) { const d = flat(v.pos, u.pos) - v.skel.radius; if (d < bd && inCone(u, v, 0.2)) { bd = d; best = v; } }
    if (!best) return;
    u.hitSet.add(best);
    const c = best.chestPos;
    _d.set(c.x - u.pos.x, 0.35, c.z - u.pos.z).normalize();
    strike(b, best, w.damage, _d, Math.min(w.force, best.M * 15), u, 'melee', PART.chest, 'punch');
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkGar -= dt;
    if (u.jkBH) { blackHole(u, dt); return; }
    newVictims(u, (v) => {
      // Star Rage: the mass of the blow lands on everyone round the target
      const c = v.chestPos;
      _o.copy(c);
      blast(b, _o, w.starR, w.starDmg, w.starForce, u, { fx: -1, friendly: 0, sound: 'thump', pitch: 0.6, vol: 0.8 });
      markerAt(b, 'jk_starwave', _p.set(c.x, b.terrain.height(c.x, c.z) + 0.05, c.z), 0.35);
      b.emit('dust', c.x, b.terrain.height(c.x, c.z), c.z, 3);
    });
  },
  hit(u, amount, part, attacker) {
    if (u.jkBH) return 0;
    if (!u.jkBHused && u.hp - amount < u.maxHp * u.def.weapon.bhAt && !u.battle.over) {
      u.jkBHused = true;
      const b = u.battle, w = u.def.weapon;
      u.hp = 1;
      u.jkBH = { t: w.bhT, at: u.chestPos.clone(), killer: attacker || null };
      u.jkBH.at.y += 0.6;
      u.jkBH.mk = markerAt(b, 'jk_bhole', u.jkBH.at, w.bhT + 0.2);
      u.st.attack = null;
      announce(b, 'Yuki Tsukumo: Black Hole!', u.headPos);
      b.sound('boom', u.jkBH.at, 1.3, 0.3);
      b.voice(u, 'cry', true);
      return 0;
    }
    return amount;
  },
  die(u) { if (u.jkBH && u.jkBH.mk) u.jkBH.mk.t = 0; },
};
function blackHole(u, dt) {
  const b = u.battle, w = u.def.weapon, H = u.jkBH, at = H.at;
  H.t -= dt;
  u.stun = Math.max(u.stun, 0.3);
  // she hangs in the middle of it
  u.rag.impulseAll((at.x - u.chestPos.x) * u.M * 2 * dt, u.M * 9.81 * dt + (at.y - u.chestPos.y) * u.M * 2 * dt, (at.z - u.chestPos.z) * u.M * 2 * dt);
  H.tick = (H.tick || 0) - dt;
  const pulse = H.tick <= 0;
  if (pulse) H.tick = 0.25;
  b.grid.query(at.x, at.z, w.bhR + 2, (v) => {
    if (!foe(u, v)) return;
    const c = v.chestPos;
    _v.copy(at).sub(c);
    const d = _v.length();
    if (d > w.bhR || d < 0.01) return;
    const k = v.M * w.bhPull * (1 - d / w.bhR * 0.6) * dt;
    v.rag.impulseAll(_v.x / d * k, (_v.y / d) * k + v.M * 4 * dt, _v.z / d * k);
    v.stun = Math.max(v.stun, 0.3);
    if (pulse && d < w.bhCore) v.hit(w.bhDps * 0.25, PART.chest, 0, 0, 0, u, 'jk_bhole');
  });
  if (Math.random() < dt * 20) b.emit('dust', at.x + rand(-3, 3), at.y + rand(-1, 1), at.z + rand(-3, 3), 0.6);
  if (H.t <= 0) {
    if (H.mk) H.mk.t = 0;
    blast(b, at, w.bhCore + 1, w.bhEnd, 1600, u, { fx: 0, friendly: 0, vol: 1.6, pitch: 0.35 });
    const k = H.killer && H.killer.alive ? H.killer : null;
    u.jkBH = null;
    u.die(k);
  }
}
function throwGaruda(u) {
  const b = u.battle, w = u.def.weapon;
  const hand = handPos(u, _o);
  const tgt = u.aimAt && u.aimAt.alive ? u.aimAt : null;
  aimPoint(u, _p, 0.4, 0.6);
  launchVel(hand, _p, w.garSpeed, 0, false, 0.02, _v);
  const pr = addProjectile(b, 'jk_garuda', hand, _v, u, { life: 2.5, tgt, spd: w.garSpeed, damage: w.garDmg, force: w.garForce });
  if (!tgt) pr.aim = _p.clone();
  b.sound('throw', hand, 0.9, 0.7);
}

// ------------------------------------------------------------------ Mei Mei
// A great battle-axe. Bird Strike: she sends crows after her target, and every so often
// one that flies in to die - a hit as hard as a cannon.
const meimei = {
  melee: true,
  init(u) { const w = u.def.weapon; u.jkCrow = rand(0.5, 1.5); u.jkKami = w.kamiFirst; },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, c);
    if (busy(u) || c.dist > w.crowRange) return t;
    if (u.jkKami <= 0 && c.gap > 2) { u.jkKami = w.kamiCD; u.aimAt = c.t; castPose(u, 'jk_push', 'kami'); }
    else if (u.jkCrow <= 0 && c.gap > 2.5) { u.jkCrow = w.crowCD * rand(0.85, 1.15); u.aimAt = c.t; castPose(u, 'cast', 'crows'); }
    return t;
  },
  event(u, t0, t1) { castEvent(u, t0, t1, { crows: (x) => crows(x, false), kami: (x) => crows(x, true) }); },
  step(u, dt) { if (!u.st.attack) u.jkCast = null; u.jkCrow -= dt; u.jkKami -= dt; },
};
function crows(u, kami) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos;
  const tgt = u.aimAt && u.aimAt.alive ? u.aimAt : null;
  aimPoint(u, _p, 0.3, 0.6);
  const n = kami ? 1 : w.crowN;
  for (let i = 0; i < n; i++) {
    _o.set(c.x + rand(-0.5, 0.5), c.y + rand(0.4, 1.0), c.z + rand(-0.5, 0.5));
    launchVel(_o, _p, w.crowSpeed, 0, false, 0.4, _v);
    _v.y += rand(2, 4);
    const pr = addProjectile(b, kami ? 'jk_kamicrow' : 'jk_crow', _o, _v, u, {
      life: 3.5, tgt, spd: kami ? w.crowSpeed * 1.4 : w.crowSpeed, damage: kami ? w.kamiDmg : w.crowDmg, force: kami ? w.kamiForce : 120, kami,
    });
    if (!tgt) pr.aim = _p.clone();
  }
  b.sound('whoosh', c, 0.8, 1.3);
  if (kami) techBanner(b, 'Bird Strike!', u.headPos, 12);
}

// ------------------------------------------------------------------ Noritoshi Kamo
// Blood arrows that curve onto their target. Hurt badly (once), Flowing Red Scale: his
// blood runs faster - he moves and draws faster and looses two arrows a shot.
const scaleOn = (u) => (u.jkScale || 0) > u.battle.time;
const kamo = {
  aim: true,
  init(u) { u.attackDur = u.def.weapon.windup; u.jkScale = 0; u.jkScaleUsed = false; },
  think(u, dt, c) { return rangedThink(u, dt, scaleOn(u) ? { ...c, spd: c.spd * 1.3 } : c); },
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (u.st.attack !== u.anim || !crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    const hand = handPos(u, _A);
    const tgt = u.aimAt && u.aimAt.alive ? u.aimAt : null;
    const n = scaleOn(u) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      aimPoint(u, _p, 0.6, 0.6);
      launchVel(hand, _p, w.speed, 3, false, w.spread + i * 0.05, _v);
      const pr = addProjectile(b, 'jk_bloodarrow', hand, _v, u, { life: 3, tgt, spd: w.speed, damage: w.damage, force: w.force });
      if (!tgt) pr.aim = _p.clone();
    }
    b.sound('bow', hand, 0.7, 1.1);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.jkScaleUsed && u.hp < u.maxHp * w.scaleAt) {
      u.jkScaleUsed = true;
      u.jkScale = b.time + w.scaleT;
      u.attackDur = w.windup * 0.65;
      markerOn(b, u, 'jk_redscale', PART.chest, w.scaleT);
      announce(b, 'Kamo: Flowing Red Scale!', u.headPos, 'scale' + u.id);
      b.sound('magic', u.chestPos, 0.6, 1.4);
    }
    if (u.jkScaleUsed && !scaleOn(u) && u.attackDur !== w.windup) u.attackDur = w.windup;
    if (scaleOn(u)) u.buff = Math.max(u.buff, 0.1);
  },
};

// ------------------------------------------------------------------ Naoya Zen'in
// Projection Sorcery: he plans a move in 24 frames, then his body follows it - an
// almost instant dash to the next enemy (afterimages along the way). Anyone he touches
// who can't keep up with the frames freezes in a pane for a moment, and a blow on a
// frozen victim lands hard.
const naoya = {
  melee: true,
  init(u) { u.jkDash = rand(0.3, 1); },
  think(u, dt, c) {
    const w = u.def.weapon, b = u.battle;
    const t = meleeThink(u, dt, c);
    if (u.jkDash <= 0 && !busy(u) && u.airT <= 0 && c.dist < w.dashMax && !burntOut(u) && domainAt(b, u.pos) === domainAt(b, c.t.pos)) {
      u.jkDash = w.dashCD * rand(0.85, 1.15);
      projDash(u, c.t);
    }
    return t;
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.jkDash -= dt;
    newVictims(u, (v) => {
      if (!v.alive) return;
      if ((v.jkFrozen || 0) > b.time) { // the frozen frame shatters
        v.hit(w.damage * w.frameBonus, PART.chest, 0, 0, 0, u, 'jk_frame');
        v.jkFrozen = 0;
        b.sound('crash', v.chestPos, 0.6, 1.8);
        return;
      }
      if ((v.jkFrameCD || 0) > b.time || v.bc || v.s > 2.2) return;
      freeze(b, v, w.freezeT);
    });
  },
};
// (from afar he stops just short of the target; up close he steps round behind it) and
// the frame ends in a blow
function projDash(u, t) {
  const b = u.battle, w = u.def.weapon;
  const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
  const stop = (t.skel.radius + u.skel.radius + 0.5) * (d < w.dashMin ? -1 : 1);
  const x = t.pos.x - dx / d * stop, z = t.pos.z - dz / d * stop;
  const yaw = Math.atan2(t.pos.x - x, t.pos.z - z);
  for (let i = 0; i < 4; i++) { // afterimages: the 24 frames
    const f = i / 4;
    const px = u.pos.x + (x - u.pos.x) * f, pz = u.pos.z + (z - u.pos.z) * f;
    markerAt(b, 'jk_frame', _p.set(px, b.terrain.height(px, pz) + 0.05, pz), 0.25 + i * 0.05, yaw);
  }
  moveUnit(b, u, x, z);
  u.heading = yaw;
  u.cooldown = 0;
  const c = t.chestPos;
  _d.set(Math.sin(yaw), 0.2, Math.cos(yaw)).normalize();
  strike(b, t, w.dashDmg, _d, Math.min(w.force, t.M * 8), u, 'jk_frame', PART.chest, 'punch');
  if (t.alive && t.parriedAt !== b.time && !t.bc && t.s <= 2.2) freeze(b, t, w.freezeT);
  b.sound('whoosh', u.pos, 0.9, 2.0);
  techBanner(b, 'Projection Sorcery: 24 frames a second', u.headPos, 14);
}
function freeze(b, v, t) {
  v.jkFrozen = b.time + t;
  v.jkFrameCD = b.time + t + 1.5;
  v.stun = Math.max(v.stun, t);
  v.st.attack = null;
  const vel = v.rag.vel[PART.pelvis];
  v.rag.impulseAll(-vel.x * v.M * 0.8, 0, -vel.z * v.M * 0.8);
  markerOn(b, v, 'jk_pane', PART.chest, t);
  b.sound('click', v.chestPos, 0.8, 1.5);
}

// ------------------------------------------------------------------ Ultimate Mechamaru
// Kokichi Muta's puppet: a blade arm up close, the Ultra Cannon (a beam from its palm)
// at range, thrusters to close the gap. Once, when badly damaged: Absolute Mode - it
// takes off and rains missiles on everything below for a while.
const absOn = (u) => (u.jkAbs || 0) > u.battle.time;
const mecha = {
  melee: true,
  aim: true,
  init(u) { const w = u.def.weapon; u.jkCan = w.canFirst; u.jkThr = rand(1, 3); u.jkAbs = 0; u.jkAbsUsed = false; u.jkMis = 0; u.jkBeam = {}; u.jkBeamT = 0; },
  think(u, dt, c) {
    const w = u.def.weapon, b = u.battle;
    if (absOn(u)) { // flying: keep at a distance from the fight
      if (c.dist > 10) u.desired.set(c.dirx * c.spd, 0, c.dirz * c.spd);
      else if (c.dist < 6) u.desired.set(-c.dirx * c.spd * 0.6, 0, -c.dirz * c.spd * 0.6);
      return c.t;
    }
    const t = meleeThink(u, dt, c);
    if (busy(u)) return t;
    if (u.jkCan <= 0 && c.gap > 3.5 && c.dist < w.canRange) { u.jkCan = w.canCD * rand(0.9, 1.1); u.aimAt = c.t; castPose(u, 'jk_push', 'cannon'); }
    else if (u.jkThr <= 0 && c.gap > 3 && c.gap < 12 && u.airT <= 0) {
      u.jkThr = w.thrCD;
      const k = u.M * w.thrV;
      u.rag.impulseAll(c.dirx * k, u.M * 2.2, c.dirz * k);
      markerOn(b, u, 'jk_thrust', PART.chest, 0.5, new THREE.Vector3(0, -0.1, -u.skel.rChest * 1.3));
      b.sound('fire', u.pos, 0.8, 0.6);
    }
    return t;
  },
  event(u, t0, t1) { castEvent(u, t0, t1, { cannon: ultraCannon }); },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkCan -= dt; u.jkThr -= dt;
    if (u.jkBeamT > 0) {
      u.jkBeamT -= dt;
      if (u.jkBeamT <= 0 || !u.alive) endBeam(u.jkBeam);
      else refreshBeam(b, u.jkBeam, u, u.jkBA, u.jkBB, 'jk_mcseg', 1.0);
    }
    if (!u.jkAbsUsed && u.hp < u.maxHp * w.absAt && !b.over) {
      u.jkAbsUsed = true;
      u.jkAbs = b.time + w.absT;
      u.st.attack = null;
      u.jkAbsMk = markerOn(b, u, 'jk_thrust', PART.chest, w.absT, new THREE.Vector3(0, -0.1, -u.skel.rChest * 1.3));
      announce(b, 'Mechamaru: Absolute Mode!', u.headPos, 'abs' + u.id);
      b.sound('fire', u.chestPos, 1.2, 0.5);
    }
    if (absOn(u)) {
      u.st.gsFly = true;
      hover(u, dt, w.absAlt);
      u.stun = Math.min(u.stun, 0.2);
      u.jkMis -= dt;
      if (u.jkMis <= 0) {
        u.jkMis = w.misEvery;
        const near = enemiesNear(u, u.pos, w.misRange);
        if (near.length) {
          const v = near[(Math.random() * near.length) | 0];
          const c = u.chestPos;
          _o.set(c.x + rand(-0.4, 0.4), c.y + 0.4, c.z + rand(-0.4, 0.4));
          _v.set(rand(-3, 3), 6, rand(-3, 3));
          addProjectile(b, 'jk_missile', _o, _v, u, { life: 4, tgt: v, spd: 18, damage: w.misDmg, force: w.misForce });
          b.sound('whoosh', c, 0.5, 1.5);
        }
      }
    } else if (u.st.gsFly) { u.st.gsFly = false; if (u.jkAbsMk) { u.jkAbsMk.t = 0; u.jkAbsMk = null; } }
  },
  die(u) { endBeam(u.jkBeam); u.st.gsFly = false; if (u.jkAbsMk) { u.jkAbsMk.t = 0; u.jkAbsMk = null; } },
};
function ultraCannon(u) {
  const b = u.battle, w = u.def.weapon;
  const A = handPos(u, new THREE.Vector3());
  beamDir(u, A, _d);
  const B = new THREE.Vector3();
  lineHits(u, A, _d, w.canRange, w.canWidth, B, (v) => {
    strike(b, v, w.canDmg, _d, Math.min(w.canForce, v.M * 9), u, 'jk_cannon', PART.chest, 'crunch');
  });
  u.jkBA = A; u.jkBB = B; u.jkBeamT = 0.3;
  refreshBeam(b, u.jkBeam, u, A, B, 'jk_mcseg', 1.0);
  b.emit('spark', B.x, B.y, B.z, 6);
  b.sound('boom', A, 0.7, 1.4);
  b.sound('flyby', A, 0.8, 1.2);
}

// ------------------------------------------------------------------ Atsuya Kusakabe
// Katana. Simple Domain: he plants his feet in a small circle and every enemy who comes
// into it meets a quick-draw (Batto Sword Drawing). While it is up, a domain's sure-hit
// finds nothing to land on.
const sdOn = (u) => !!u.jkSD && u.jkSD.t > 0;
const kusakabe = {
  melee: true,
  init(u) { u.jkSDCD = rand(0.5, 1.5); u.jkSD = null; },
  think(u, dt, c) {
    const w = u.def.weapon, b = u.battle;
    if (sdOn(u)) { u.desired.set(0, 0, 0); return c.t; }
    const t = meleeThink(u, dt, c);
    if (u.jkSDCD <= 0 && u.stun <= 0.2 && !u.isDown() && u.airT <= 0) {
      const inDom = jk(b).domains.some((d) => d.team !== u.team && flat(u.pos, d.pos) < d.R);
      if (inDom || enemiesNear(u, u.pos, w.sdR + 1.2).length) {
        u.jkSDCD = w.sdCD;
        const at = u.pos.clone(); at.y = b.terrain.height(at.x, at.z) + 0.03;
        u.jkSD = { t: w.sdT, at, cut: 0, mk: markerAt(b, 'jk_simpledom', at, w.sdT) };
        u.st.attack = null;
        techBanner(b, 'Simple Domain: Batto Sword Drawing', u.headPos, 12);
        b.sound('click', u.pos, 0.8, 0.8);
      }
    }
    return t;
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.jkSDCD -= dt;
    if (!u.jkSD) return;
    const S = u.jkSD;
    S.t -= dt;
    // knocked out of his circle (or down): it breaks
    if (S.t <= 0 || flat(u.pos, S.at) > 1.0 || u.stun > 0.6) { S.mk.t = 0; u.jkSD = null; return; }
    S.cut -= dt;
    if (S.cut > 0) return;
    let best = null, bd = 1e9;
    for (const v of enemiesNear(u, S.at, w.sdR)) { const d = flat(v.pos, u.pos); if (d < bd) { bd = d; best = v; } }
    if (!best) return;
    S.cut = w.sdEvery;
    u.heading = Math.atan2(best.pos.x - u.pos.x, best.pos.z - u.pos.z);
    castPose(u, 'jk_batto', null);
    const c = best.chestPos;
    _d.set(c.x - u.pos.x, 0.2, c.z - u.pos.z).normalize();
    strike(b, best, w.sdDmg, _d, Math.min(w.force, best.M * 8), u, 'jk_batto', PART.chest, 'slash');
    markSpin(b, 'jk_xcut', c, 0.25);
  },
  hit(u, amount, part, attacker, kind) {
    if (kind === 'domain' && sdOn(u)) {
      techBanner(u.battle, "Kusakabe's Simple Domain: the sure-hit can't land", u.headPos, 15);
      return 0;
    }
    return amount;
  },
  die(u) { if (u.jkSD) { u.jkSD.mk.t = 0; u.jkSD = null; } },
};

// ------------------------------------------------------------------ projectiles
const PJ = {
  // Garuda: Yuki's shikigami bird, thrown like a fastball (it homes in)
  jk_garuda: {
    g: 0, len: 0.5, r: 0.35, life: 3,
    step(b, pr, dt) {
      if (pr.tgt) home(pr, dt, pr.spd || 16, 4);
      else if (pr.aim) { _d.copy(pr.aim).sub(pr.pos).normalize().multiplyScalar(pr.spd || 16); pr.vel.lerp(_d, Math.min(1, 3 * dt)); }
    },
    hit(b, pr, v) {
      _d.copy(pr.vel).normalize(); _d.y = Math.max(_d.y, 0) + 0.3; _d.normalize();
      strike(b, v, pr.damage, _d, Math.min(pr.force, v.M * 12), pr.owner, 'jk_garuda', PART.chest, 'crunch');
      if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 0.9 * (v.def.stagger ?? 1));
      b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 5);
      return true;
    },
    ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 2); b.sound('thump', pr.pos, 0.8, 0.7); return true; },
  },
  // Mei Mei's crows (and the one that flies in to die)
  jk_crow: {
    g: 0, len: 0.4, r: 0.3, life: 3.5,
    step(b, pr, dt) {
      if (pr.tgt) home(pr, dt, pr.spd || 15, 3.5);
      else if (pr.aim) { _d.copy(pr.aim).sub(pr.pos).normalize().multiplyScalar(pr.spd || 15); pr.vel.lerp(_d, Math.min(1, 3 * dt)); }
    },
    hit(b, pr, v) {
      _d.copy(pr.vel).normalize();
      strike(b, v, pr.damage, _d, pr.force, pr.owner, 'jk_crow', PART.head, 'stab');
      return true;
    },
    ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 0.6); return true; },
  },
  jk_kamicrow: {
    g: 0, len: 0.5, r: 0.4, life: 3.5,
    step(b, pr, dt) {
      if (pr.tgt) home(pr, dt, pr.spd || 20, 4);
      else if (pr.aim) { _d.copy(pr.aim).sub(pr.pos).normalize().multiplyScalar(pr.spd || 20); pr.vel.lerp(_d, Math.min(1, 3 * dt)); }
      if (Math.random() < dt * 20) b.emit('trail', pr.pos.x, pr.pos.y, pr.pos.z, 0);
    },
    hit(b, pr, v) {
      _d.copy(pr.vel).normalize(); _d.y = Math.max(0, _d.y) + 0.3; _d.normalize();
      strike(b, v, pr.damage, _d, Math.min(pr.force, v.M * 14), pr.owner, 'jk_birdstrike', PART.chest, 'crunch');
      blast(b, pr.pos, 1.6, pr.damage * 0.25, pr.force * 0.4, pr.owner, { fx: 0, friendly: 0, vol: 0.9, pitch: 1.2 });
      return true;
    },
    ground(b, pr) { blast(b, pr.pos, 1.6, pr.damage * 0.25, pr.force * 0.4, pr.owner, { fx: 0, friendly: 0, vol: 0.9, pitch: 1.2 }); return true; },
  },
  // Kamo's blood arrow: curves onto its target
  jk_bloodarrow: {
    g: 3, len: 0.8, r: 0.25, life: 3,
    step(b, pr, dt) { if (pr.tgt) home(pr, dt, pr.spd || 30, 1.6); },
    hit(b, pr, v) {
      _d.copy(pr.vel).normalize();
      strike(b, v, pr.damage, _d, pr.force, pr.owner, 'jk_blood', PART.chest, 'stab');
      return true;
    },
    ground(b, pr) { b.emit('blood', pr.pos.x, pr.pos.y, pr.pos.z, 3, 0, 0); return true; },
  },
  // Mechamaru's missiles (Absolute Mode)
  jk_missile: {
    g: 0, len: 0.5, r: 0.3, life: 4,
    step(b, pr, dt) { home(pr, dt, pr.spd || 18, 2.5); if (Math.random() < dt * 30) b.emit('trail', pr.pos.x, pr.pos.y, pr.pos.z, 1); },
    hit(b, pr) { blast(b, pr.pos, 1.8, pr.damage, pr.force, pr.owner, { fx: 2, friendly: 0.2, vol: 0.6, pitch: 1.3 }); return true; },
    ground(b, pr) { blast(b, pr.pos, 1.8, pr.damage, pr.force, pr.owner, { fx: 2, friendly: 0.2, vol: 0.6, pitch: 1.3 }); return true; },
  },
};
for (const k of ['jk_gbseg', 'jk_gbcharge', 'jk_mcseg', 'jk_arcseg', 'jk_amber', 'jk_skyfold', 'jk_skywall', 'jk_trial', 'jk_confisc', 'jk_xsword',
  'jk_xcut', 'jk_starwave', 'jk_bhole', 'jk_redscale', 'jk_frame', 'jk_pane', 'jk_thrust', 'jk_simpledom', 'jk_dom_higuruma']) PJ[k] = { g: 0, len: 0, r: 0, life: 1 };

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'jk_ryu', name: 'Ryu Ishigori', faction: FAC, side: SIDE, cost: 1100, hp: 900, speed: 4.8,
    build: { scale: 1.16, girth: 1.12, arms: 1.05, armThick: 1.3, mass: 1.2 },
    weapon: {
      line: 'Powerhouse · heavy fists · Granite Blast: a long charge, then the thickest beam of all',
      kind: 'jk_ryu', style: 'fists', anim: 'punch', item: 'jk_fist', damage: 62, reach: 1.0, cooldown: 0.8, force: 600,
      gbCD: 7, gbFirst: 1.5, gbCharge: 0.9, gbMin: 0, gbRange: 30, gbWidth: 1.0, gbDmg: 190, gbForce: 1500,
    },
    look: { skin: '#e6b48e', hat: 'jk_ryu_hair', top: 'jk_ryu', legs: '#1c1c24', accent: '#141418' },
    personality: { aggro: 0.85, bravery: 0, voice: 0.7, chatter: 0.6, cry: 'roar', idle: 'brace' },
    armor: 0.08, stagger: 0.35,
    desc: 'A sorcerer from four hundred years ago with more cursed energy output than anyone. Mind the hair.',
  },
  {
    id: 'jk_uro', name: 'Takako Uro', faction: FAC, side: SIDE, cost: 750, hp: 900, speed: 5.6,
    build: { scale: 1.02, girth: 0.92, legs: 1.08 },
    weapon: {
      line: 'Sky Manipulation · Thin Ice Breaker folds the sky and flings enemies · bends shots back · kicks',
      kind: 'jk_uro', style: 'fists', anim: 'punch', item: 'jk_fist', damage: 55, reach: 1.0, cooldown: 0.6, force: 450,
      skyCD: 4.5, skyFirst: 1.5, skyR: 6.5, skyDmg: 90, skyUp: 9, skyOut: 8, skyStun: 1.3, defCD: 6, defT: 2.5, defR: 2.4,
    },
    look: { skin: '#f2d4bc', hat: 'jk_uro_hair', top: 'jk_uro', legs: '#1a1a22', accent: '#121218' },
    personality: { aggro: 0.85, bravery: 0, voice: 1.25, chatter: 0.7, cry: 'hey', idle: 'shift' },
    stagger: 0.5,
    desc: 'Captain of the Sun-Moon Corps a thousand years ago. Treats the sky like a sheet of paper.',
  },
  {
    id: 'jk_kashimo', name: 'Hajime Kashimo', faction: FAC, side: SIDE, cost: 1300, hp: 800, speed: 6.0,
    build: { scale: 1.02, girth: 0.95, arms: 1.05 },
    weapon: {
      line: 'Lightning · staff blows arc to nearby foes and can\'t be parried · bolts · Mythical Beast Amber (then he burns out)',
      kind: 'jk_kashimo', style: 'sword', anim: 'overhead', item: 'jk_nyoibo', damage: 50, reach: 1.5, cooldown: 0.7, force: 450,
      arcDmg: 24, arcR: 4.5, arcN: 2, boltCD: 5, boltRange: 14, boltDmg: 55, boltR: 1.6,
      amberAt: 0.3, amberT: 15, amberSpeed: 1.3, amberDmg: 1.8, amberEvery: 1.0, amberR: 12, amberBolt: 75, amberArmor: 0.6,
    },
    look: { skin: '#f0d0b6', hat: 'jk_kashimo_hair', top: 'jk_kashimo', legs: '#2a2a3a', accent: '#1a1a24' },
    personality: { aggro: 1, bravery: 0, voice: 1.1, chatter: 0.8, cry: 'charge', idle: 'bounce' },
    stagger: 0.4,
    desc: 'Four hundred years of looking for someone strong enough. Electric. Has exactly one trump card.',
  },
  {
    id: 'jk_higuruma', name: 'Hiromi Higuruma', faction: FAC, side: SIDE, cost: 1100, hp: 700, speed: 5.0,
    build: { scale: 1.06, girth: 0.95, legs: 1.04 },
    weapon: {
      line: "Domain: Deadly Sentencing - GUILTY: Confiscation and the Executioner's Sword · the gavel",
      kind: 'jk_higuruma', style: 'sword', anim: 'overhead', item: 'jk_gavel', damage: 46, reach: 1.1, cooldown: 0.85, force: 380,
      domR: HIG_R, domDur: 6, domPow: 7, domCD: 24, domFirst: 4, domMin: 2,
      trialT: 1.6, guilty: 0.6, confT: 25, swordT: 20, swordDmg: 90, topCost: 3000,
    },
    look: { skin: '#e8c0a0', hat: 'jk_higuruma_hair', top: 'jk_higuruma', legs: '#22232c', accent: '#141418' },
    personality: { aggro: 0.8, bravery: 0, voice: 0.85, chatter: 0.4, cry: 'hey', idle: 'lean' },
    stagger: 0.55,
    desc: 'A defence lawyer who gave up on the law. In his court, the verdict is final.',
  },
  {
    id: 'jk_yuki', name: 'Yuki Tsukumo', faction: FAC, side: SIDE, cost: 1900, hp: 1300, speed: 5.4,
    build: { scale: 1.12, girth: 0.98, arms: 1.04, armThick: 1.1, legs: 1.08 },
    weapon: {
      line: 'Special grade · Star Rage: blows with virtual mass bowl over crowds · Garuda · last stand: Black Hole',
      kind: 'jk_yuki', style: 'fists', anim: 'punch', item: 'jk_fist', sweep: true, damage: 80, reach: 1.05, cooldown: 0.9, force: 900,
      starR: 2.4, starDmg: 35, starForce: 650, garCD: 6, garRange: 18, garSpeed: 16, garDmg: 70, garForce: 700,
      bhAt: 0.25, bhT: 3.5, bhR: 11, bhCore: 3.5, bhPull: 26, bhDps: 90, bhEnd: 160,
    },
    look: { skin: '#f2d2b8', hat: 'jk_yuki_hair', top: 'jk_yuki', legs: '#3a5a8a', accent: '#1a1a1e' },
    personality: { aggro: 0.9, bravery: 0, voice: 1.15, chatter: 0.8, cry: 'charge', idle: 'shift' },
    stagger: 0.3,
    desc: '"What kind of man is your type?" One of the special grades. Hits like a falling star.',
  },
  {
    id: 'jk_meimei', name: 'Mei Mei', faction: FAC, side: SIDE, cost: 850, hp: 650, speed: 4.9,
    build: { scale: 1.06, girth: 0.92, legs: 1.06 },
    weapon: {
      line: 'Battle-axe · Bird Strike: homing crows, and now and then one that flies in to die',
      kind: 'jk_meimei', style: 'sword', anim: 'overhead', item: 'jk_meiaxe', damage: 54, reach: 1.45, cooldown: 0.95, force: 700,
      crowCD: 3.2, crowN: 3, crowRange: 22, crowSpeed: 15, crowDmg: 18, kamiCD: 11, kamiFirst: 5, kamiDmg: 150, kamiForce: 1000,
    },
    look: { skin: '#f4dccc', hat: 'jk_meimei_hair', top: 'jk_meimei', legs: '#1a1a20', accent: '#101014' },
    personality: { aggro: 0.75, bravery: 0, voice: 1.2, chatter: 0.4, cry: 'royal', idle: 'regal' },
    stagger: 0.5,
    desc: 'Works for money, and her crows see everything. The axe is not for show.',
  },
  {
    id: 'jk_kamo', name: 'Noritoshi Kamo', faction: FAC, side: SIDE, cost: 500, hp: 450, speed: 4.9,
    build: { scale: 1.0, girth: 0.9, legs: 1.04 },
    weapon: {
      line: 'Archer · Blood Manipulation: blood arrows that curve onto the target · Flowing Red Scale',
      kind: 'jk_kamo', style: 'bow', anim: 'bow', item: 'bow', damage: 46, speed: 30, range: 24, minRange: 6, cooldown: 1.4, force: 180,
      windup: 0.8, releaseAt: 0.7, spread: 0.02, scaleAt: 0.6, scaleT: 14,
    },
    look: { skin: '#f0d0b8', hat: 'jk_kamo_hair', top: 'jk_kamo', legs: '#3a3a44', accent: '#1a1a20' },
    personality: { aggro: 0.4, bravery: 0, voice: 0.95, chatter: 0.3, cry: 'hey', idle: 'regal' },
    stagger: 0.7,
    desc: 'Heir of the Kamo clan, bow in hand. His arrows are his own blood.',
  },
  {
    id: 'jk_naoya', name: "Naoya Zen'in", faction: FAC, side: SIDE, cost: 950, hp: 620, speed: 7.6,
    build: { scale: 1.02, girth: 0.9, legs: 1.06 },
    weapon: {
      line: 'Projection Sorcery · 24-frame dashes · his touch freezes you in a frame · very fast',
      kind: 'jk_naoya', style: 'fists', anim: 'punch', item: 'jk_fist', damage: 40, reach: 0.95, cooldown: 0.5, force: 400,
      dashCD: 1.6, dashMin: 3, dashMax: 14, dashDmg: 45, freezeT: 0.9, frameBonus: 1.0,
    },
    look: { skin: '#f2d2bc', hat: 'jk_naoya_hair', top: 'jk_naoya', legs: '#24283a', accent: '#16161c' },
    personality: { aggro: 1, bravery: 0, voice: 1.0, chatter: 0.9, cry: 'cackle', idle: 'bounce' },
    stagger: 0.3,
    desc: "Second fastest sorcerer alive, as he will tell you. Can't keep up? Then freeze.",
  },
  {
    id: 'jk_mechamaru', name: 'Ultimate Mechamaru', faction: FAC, side: SIDE, cost: 750, hp: 620, speed: 4.7,
    build: { scale: 1.14, girth: 1.12, arms: 1.05, armThick: 1.25, legs: 0.95, mass: 1.25 },
    weapon: {
      line: 'Puppet robot · blade arm · Ultra Cannon beam · thrusters · once: Absolute Mode (flies, rains missiles)',
      kind: 'jk_mechamaru', style: 'sword', anim: 'overhead', item: 'jk_mechblade', damage: 44, reach: 1.2, cooldown: 0.85, force: 380,
      canCD: 4.5, canFirst: 1.5, canRange: 20, canWidth: 0.55, canDmg: 55, canForce: 600, thrCD: 5, thrV: 7,
      absAt: 0.45, absT: 8, absAlt: 4.5, misEvery: 0.45, misRange: 20, misDmg: 32, misForce: 420,
    },
    look: { skin: '#b8bec8', hat: 'jk_mecha_head', top: 'jk_mecha', legs: '#6a707a', accent: '#3a3e46' },
    personality: { aggro: 0.8, bravery: 0, voice: 0.6, chatter: 0.4, cry: 'hey', idle: 'brace' },
    armor: 0.15, stagger: 0.4,
    desc: 'Kokichi Muta pilots it from far away. Every gun it has, at once.',
  },
  {
    id: 'jk_kusakabe', name: 'Atsuya Kusakabe', faction: FAC, side: SIDE, cost: 700, hp: 600, speed: 4.8,
    build: { scale: 1.08, girth: 1.0, legs: 1.02 },
    weapon: {
      line: 'Swordsman · Simple Domain: quick-draw on anyone who steps in · sure-hits can\'t land on him',
      kind: 'jk_kusakabe', style: 'sword', anim: 'overhead', item: 'jk_katana', damage: 48, reach: 1.3, cooldown: 0.85, force: 380,
      sdCD: 6, sdT: 4, sdR: 2.9, sdEvery: 0.7, sdDmg: 50,
    },
    look: { skin: '#e8c4a4', hat: 'jk_kusakabe_hair', top: 'jk_kusakabe', legs: '#2a2a30', accent: '#16161a' },
    personality: { aggro: 0.6, bravery: 0, voice: 0.8, chatter: 0.3, cry: 'hey', idle: 'lean' },
    stagger: 0.5,
    desc: 'The strongest first-grade sorcerer without a cursed technique. Would rather not be here.',
  },
];

// ------------------------------------------------------------------ visuals
function spikes(H, g, r, m, n, len, upK = 0.5, seed = 1, faceClear = 0.45) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed, el = 0.35 + ((i * 7 + seed * 3) % 5) / 5 * 0.9;
    const dx = Math.sin(a) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(a) * Math.cos(el) - 0.35;
    if (dz > faceClear && dy < 0.75) continue;
    const dir = new THREE.Vector3(dx, dy + upK, dz).normalize();
    const L = r * len * (0.8 + ((i * 5) % 3) * 0.15);
    const c = H.mesh(H.cone(r * 0.2, L, 5), m, dir.x * r * 0.8, dir.y * r * 0.8 + r * 0.1, dir.z * r * 0.8, g);
    c.quaternion.setFromUnitVectors(UPY, dir);
    c.position.addScaledVector(dir, L * 0.4);
  }
}
function hairCap(H, g, r, m, k = 1.07, frac = 0.36, tilt = -0.35) {
  const c = H.mesh(dome(H, r * k, frac), m, 0, r * 0.04, -r * 0.05, g);
  c.rotation.x = tilt;
  return c;
}
// a cone pointing along dir from p (fringe locks, spikes)
function lock(H, g, m, p, dir, rad, len) {
  const d = new THREE.Vector3(...dir).normalize();
  const c = H.mesh(H.cone(rad, len, 6), m, p[0] + d.x * len * 0.5, p[1] + d.y * len * 0.5, p[2] + d.z * len * 0.5, g);
  c.quaternion.setFromUnitVectors(UPY, d);
  return c;
}
const onHead = (r, x, y, k = 1.0) => { const z = Math.sqrt(Math.max(0.02, 1 - x * x - y * y)); return [x * r * k, y * r * k, z * r * k]; };
const ns = (m) => { m.castShadow = false; return m; };

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, metal } = H;
  if (name === 'jk_nyoibo') { // Kashimo's nyoi staff: a long red-lacquered pole, gold rings at the ends
    const red = mat('#a0262a', { spec: 0.5 }), gold = mat('#d8b04a', { spec: 1 });
    mesh(cyl(0.028 * s, 0.028 * s, 1.55 * s, 8), red, 0, 0.6 * s, 0, g);
    for (const y of [-0.15, 0.0, 1.25, 1.36]) mesh(cyl(0.036 * s, 0.036 * s, 0.05 * s, 10), gold, 0, y * s, 0, g);
    mesh(sphere(0.04 * s, 8, 6), gold, 0, 1.4 * s, 0, g);
    mesh(cyl(0.032 * s, 0.032 * s, 0.06 * s, 8), tcol(H, team), 0, 0.3 * s, 0, g);
    return true;
  }
  if (name === 'jk_gavel') { // a judge's gavel
    const wood = mat('#6a3e22', { spec: 0.35 });
    mesh(cyl(0.022 * s, 0.026 * s, 0.4 * s, 8), wood, 0, 0.14 * s, 0, g);
    const head = mesh(cyl(0.07 * s, 0.07 * s, 0.24 * s, 12), wood, 0, 0.37 * s, 0, g); head.rotation.z = Math.PI / 2;
    for (const sd of [-1, 1]) mesh(cyl(0.074 * s, 0.074 * s, 0.025 * s, 12), mat('#d8b04a', { spec: 1 }), sd * 0.09 * s, 0.37 * s, 0, g).rotation.z = Math.PI / 2;
    mesh(cyl(0.028 * s, 0.028 * s, 0.05 * s, 8), tcol(H, team), 0, -0.04 * s, 0, g);
    return true;
  }
  if (name === 'jk_meiaxe') { // Mei Mei's great axe: a long haft and a wide crescent blade
    mesh(cyl(0.03 * s, 0.034 * s, 1.35 * s, 8), mat('#2a2024', { spec: 0.3 }), 0, 0.45 * s, 0, g);
    for (const y of [-0.15, 0.3, 0.75]) mesh(cyl(0.038 * s, 0.038 * s, 0.04 * s, 8), mat('#8a8a90', { spec: 0.9 }), 0, y * s, 0, g);
    const bl = mesh(sphere(0.2 * s, 14, 10), metal(), 0, 1.0 * s, 0.13 * s, g); bl.scale.set(0.12, 1.05, 0.8); // the wide blade
    mesh(box(0.03 * s, 0.4 * s, 0.03 * s), mat('#f2f4f8', { spec: 1 }), 0, 1.0 * s, 0.28 * s, g); // its bright edge
    mesh(box(0.06 * s, 0.22 * s, 0.05 * s), mat('#3a3a42', { spec: 0.6 }), 0, 1.0 * s, 0, g);
    mesh(cone(0.035 * s, 0.14 * s, 4), metal(), 0, 1.18 * s, 0, g);
    mesh(cyl(0.035 * s, 0.035 * s, 0.05 * s, 8), tcol(H, team), 0, -0.12 * s, 0, g);
    return true;
  }
  if (name === 'jk_mechblade') { // a blade that slides out of Mechamaru's forearm
    mesh(box(0.1 * s, 0.14 * s, 0.1 * s), mat('#5a606a', { spec: 0.8 }), 0, 0.02 * s, 0, g);
    const bl = mesh(box(0.02 * s, 0.75 * s, 0.09 * s), mat('#d8e8f4', { spec: 1, emit: 0.15 }), 0, 0.45 * s, 0, g); void bl;
    mesh(cone(0.045 * s, 0.14 * s, 4), mat('#d8e8f4', { spec: 1 }), 0, 0.88 * s, 0, g).scale.set(0.4, 1, 1);
    mesh(box(0.024 * s, 0.6 * s, 0.02 * s), H.glow('#4ad8ff'), 0, 0.42 * s, 0.04 * s, g);
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'jk_ryu_hair': { // a towering black pompadour jutting out over the brow; sideburns
      const hair = mat('#16141a', { spec: 0.45 });
      hairCap(H, g, r, hair, 1.07, 0.42, -0.15);
      const pomp = mesh(capsule(r * 0.5, r * 2.0), hair, 0, r * 0.98, r * 0.75, g); pomp.rotation.x = 1.3; pomp.scale.set(1.2, 1, 1);
      mesh(sphere(r * 0.55, 12, 10), hair, 0, r * 1.02, r * 1.75, g).scale.set(1.15, 0.85, 0.9); // the curl at the front
      mesh(sphere(r * 0.62, 12, 10), hair, 0, r * 0.75, -r * 0.2, g).scale.set(1.25, 0.9, 1.1);
      for (let i = -2; i <= 2; i++) { const s = mesh(box(r * 0.06, r * 0.04, r * 1.5), mat('#3a3640', { spec: 0.6 }), i * r * 0.17, r * 1.5, r * 0.8, g); s.rotation.x = -0.25; } // comb lines
      for (const sd of [-1, 1]) mesh(capsule(r * 0.1, r * 0.35), hair, sd * r * 0.93, -r * 0.05, -r * 0.2, g); // sideburns
      mesh(box(r * 0.5, r * 0.05, r * 0.04), mat('#2a2228'), 0, r * 0.38, r * 0.97, g); // heavy brow line
      return true;
    }
    case 'jk_uro_hair': { // long straight black hair, blunt bangs, a gold hair ornament
      const hair = mat('#141218', { spec: 0.35 });
      hairCap(H, g, r, hair, 1.08, 0.44, -0.2);
      const back = mesh(capsule(r * 0.95, r * 1.7), hair, 0, -r * 0.75, -r * 0.42, g); back.scale.set(1.05, 1, 0.55);
      for (const sd of [-1, 1]) { const s = mesh(capsule(r * 0.3, r * 1.5), hair, sd * r * 0.85, -r * 0.55, r * 0.15, g); s.scale.set(0.7, 1, 0.8); } // side locks
      const fr = mesh(box(r * 1.5, r * 0.32, r * 0.25), hair, 0, r * 0.62, r * 0.76, g); fr.rotation.x = -0.3; // blunt bangs
      mesh(cyl(r * 0.05, r * 0.05, r * 0.8, 6), mat('#d8b04a', { spec: 1 }), r * 0.55, r * 0.75, -r * 0.35, g).rotation.z = 1.0; // hairpin
      mesh(sphere(r * 0.12, 8, 6), tc, r * 0.85, r * 0.92, -r * 0.4, g);
      return true;
    }
    case 'jk_kashimo_hair': { // pale blue hair swept up into a tall top-knot
      const hair = mat('#a8d8f0', { spec: 0.35 });
      hairCap(H, g, r, hair, 1.07, 0.4, -0.25);
      for (let i = 0; i < 5; i++) lock(H, g, hair, [0, r * 1.05, -r * 0.1], [Math.sin(i * 1.26) * 0.35, 1, Math.cos(i * 1.26) * 0.35 - 0.1], r * 0.16, r * (0.75 + (i % 2) * 0.25)); // the spiky top-knot
      mesh(cyl(r * 0.3, r * 0.3, r * 0.14, 10), tc, 0, r * 1.05, -r * 0.1, g); // the tie
      spikes(H, g, r, hair, 10, 0.4, 0.2, 2.1, 0.5);
      for (const [x, a] of [[-0.35, 0.4], [0.0, 0], [0.35, -0.4]]) lock(H, g, hair, onHead(r, x, 0.62, 1.02), [a, -0.9, 0.5], r * 0.14, r * 0.45);
      return true;
    }
    case 'jk_higuruma_hair': { // short black hair, a little messy; stubble on the chin; tired eyes
      const hair = mat('#18161c', { spec: 0.25 });
      hairCap(H, g, r, hair, 1.07, 0.4, -0.25);
      spikes(H, g, r, hair, 12, 0.32, 0.0, 0.4, 0.5);
      for (const [x, a] of [[-0.3, 0.3], [0.05, -0.1], [0.32, -0.4]]) lock(H, g, hair, onHead(r, x, 0.66, 1.02), [a, -0.8, 0.6], r * 0.13, r * 0.36);
      const st = mat('#4a3a34', { transparent: true, opacity: 0.45 });
      const p = onHead(r, 0, -0.62, 1.0);
      mesh(sphere(r * 0.42, 10, 8), st, p[0], p[1], p[2] - r * 0.22, g).scale.set(1, 0.6, 0.5);
      for (const sd of [-1, 1]) { const bag = mesh(box(r * 0.22, r * 0.04, r * 0.03), mat('#8a6a6a'), sd * r * 0.3, -r * 0.03, r * 0.96, g); bag.rotation.y = sd * 0.3; }
      return true;
    }
    case 'jk_yuki_hair': { // long blonde hair down her back, a fringe swept to one side
      const hair = mat('#f0d070', { spec: 0.35 });
      hairCap(H, g, r, hair, 1.08, 0.44, -0.2);
      const back = mesh(capsule(r * 0.9, r * 2.1), hair, 0, -r * 1.0, -r * 0.5, g); back.scale.set(1.1, 1, 0.55);
      for (const sd of [-1, 1]) lock(H, g, hair, [sd * r * 0.85, r * 0.3, r * 0.1], [sd * 0.15, -1, -0.05], r * 0.28, r * 1.6);
      lock(H, g, hair, onHead(r, -0.25, 0.7, 1.03), [0.9, -0.55, 0.35], r * 0.24, r * 0.95);
      lock(H, g, hair, onHead(r, 0.25, 0.72, 1.03), [0.55, -0.7, 0.4], r * 0.2, r * 0.7);
      return true;
    }
    case 'jk_meimei_hair': { // long white hair in one thick braid over the right shoulder; bangs over one eye
      const hair = mat('#ece8ee', { spec: 0.35 });
      hairCap(H, g, r, hair, 1.08, 0.44, -0.25);
      const fr = mesh(sphere(r * 0.5, 12, 8), hair, -r * 0.3, r * 0.3, r * 0.68, g); fr.scale.set(1.0, 1.3, 0.5); fr.rotation.z = -0.3; // over her right eye
      for (let i = 0; i < 7; i++) mesh(sphere(r * (0.3 - i * 0.02), 10, 8), hair, -r * (0.75 + i * 0.05), -r * (0.3 + i * 0.36), r * (0.15 + i * 0.12), g).scale.set(1, 1.2, 1);
      mesh(cyl(r * 0.16, r * 0.16, r * 0.1, 8), tc, -r * 1.1, -r * 2.85, r * 0.98, g);
      return true;
    }
    case 'jk_kamo_hair': { // long black hair tied back, narrow eyes
      const hair = mat('#16141a', { spec: 0.3 });
      hairCap(H, g, r, hair, 1.07, 0.42, -0.3);
      mesh(sphere(r * 0.3, 10, 8), hair, 0, r * 0.75, -r * 0.65, g);
      const tail = mesh(capsule(r * 0.2, r * 1.4), hair, 0, -r * 0.1, -r * 1.0, g); tail.rotation.x = 0.15;
      mesh(cyl(r * 0.22, r * 0.22, r * 0.12, 10), mat('#f2efe6'), 0, r * 0.62, -r * 0.88, g).rotation.x = 0.8;
      for (const sd of [-1, 1]) lock(H, g, hair, onHead(r, sd * 0.55, 0.55, 1.02), [sd * 0.2, -1, 0.3], r * 0.13, r * 0.7); // side strands
      return true;
    }
    case 'jk_naoya_hair': { // blond swept back with dark roots, pierced ears
      const hair = mat('#e8d070', { spec: 0.35 }), root = mat('#2a2420');
      hairCap(H, g, r, hair, 1.08, 0.4, -0.35);
      mesh(dome(H, r * 1.075, 0.2), root, 0, r * 0.06, -r * 0.02, g).rotation.x = -0.45;
      for (let i = -3; i <= 3; i++) lock(H, g, hair, onHead(r, i * 0.14, 0.68, 1.02), [i * 0.08, 0.35, -1], r * 0.14, r * 0.85); // swept back
      for (const sd of [-1, 1]) for (const y of [0.0, -0.15]) mesh(torus(H, r * 0.07, r * 0.018, Math.PI * 2, 10), mat('#d8d8e0', { spec: 1 }), sd * r * 0.98, y * r, r * 0.05, g).rotation.y = Math.PI / 2;
      return true;
    }
    case 'jk_mecha_head': { // a robot head: angular helmet, a dark visor with a red eye slit, an antenna
      g.userData.hidesFace = true;
      const plate = mat('#c8cdd6', { spec: 0.8 }), dark = mat('#2a2e36', { spec: 0.6 });
      mesh(box(r * 1.8, r * 1.6, r * 1.8), plate, 0, r * 0.05, 0, g);
      mesh(box(r * 1.5, r * 0.55, r * 0.2), dark, 0, r * 0.15, r * 0.88, g);
      ns(mesh(box(r * 1.2, r * 0.12, r * 0.05), glow('#ff3a3a'), 0, r * 0.15, r * 0.99, g));
      mesh(box(r * 1.0, r * 0.35, r * 0.2), dark, 0, -r * 0.5, r * 0.85, g); // mouth grille
      for (let i = -2; i <= 2; i++) mesh(box(r * 0.06, r * 0.28, r * 0.05), plate, i * r * 0.18, -r * 0.5, r * 0.96, g);
      for (const sd of [-1, 1]) { mesh(cyl(r * 0.3, r * 0.3, r * 0.2, 12), dark, sd * r * 0.98, 0, 0, g).rotation.z = Math.PI / 2; mesh(cyl(r * 0.18, r * 0.18, r * 0.22, 10), tc, sd * r * 1.0, 0, 0, g).rotation.z = Math.PI / 2; }
      mesh(box(r * 1.9, r * 0.25, r * 0.4), tc, 0, r * 0.82, r * 0.2, g); // crest
      mesh(cyl(r * 0.04, r * 0.04, r * 0.8, 6), dark, r * 0.55, r * 1.25, -r * 0.3, g);
      ns(mesh(sphere(r * 0.09, 8, 6), glow('#ff3a3a'), r * 0.55, r * 1.65, -r * 0.3, g));
      return true;
    }
    case 'jk_kusakabe_hair': { // dark hair combed back, long sideburns and a short goatee
      const hair = mat('#1e1a1c', { spec: 0.35 });
      hairCap(H, g, r, hair, 1.07, 0.38, -0.4);
      for (let i = -2; i <= 2; i++) lock(H, g, hair, onHead(r, i * 0.18, 0.66, 1.02), [i * 0.06, 0.25, -1], r * 0.14, r * 0.7);
      for (const sd of [-1, 1]) mesh(capsule(r * 0.1, r * 0.4), hair, sd * r * 0.93, -r * 0.08, -r * 0.2, g);
      const p = onHead(r, 0, -0.75, 1.0);
      mesh(cone(r * 0.13, r * 0.28, 6), hair, p[0], p[1] - r * 0.08, p[2] - r * 0.05, g).rotation.x = Math.PI;
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== FAC || def.side !== SIDE) return;
  const id = def.id;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, capsule } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const skin = mat(def.look.skin, { spec: 0.18 });
  const limb = (p) => skel.parts[p];
  const ARMS = [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR], LEGS = [PART.thighL, PART.shinL, PART.thighR, PART.shinR];
  const isFore = (p) => p === PART.farmL || p === PART.farmR;
  const cover = (p, m, k = 1.15, f = 1, y = 0) => { const sp = limb(p); return mesh(capsule(sp.r * k, sp.hh * 2 * f), m, 0, sp.hh * y, 0, parts[p]); };
  const sleeves = (m, k = 1.18) => { for (const p of ARMS) cover(p, m, k, isFore(p) ? 0.85 : 1, isFore(p) ? 0.15 : 0); };
  const wide = (m) => { for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); mesh(cyl(sp.r * 1.6, sp.r * 2.4, sp.hh * 1.5, 10), m, 0, -sp.hh * 0.1, 0, parts[p]); } };
  const skirt = (m, top0, bot, len) => mesh(cyl(pel.r * top0, pel.r * bot, pel.r * len, 16), m, 0, -pel.r * len * 0.42, 0, P);
  const belt = (m, y = -hh - r * 0.38, k = 1.12) => mesh(cyl(r * k, r * (k + 0.02), r * 0.2, 16), m, 0, y, 0, C);
  const collar = (m, h = 0.35) => mesh(cyl(r * 0.58, r * 0.66, r * h, 14), m, 0, hh + r * 0.55, 0, C);
  const longCoat = (m, len = 2.0) => { // a coat's skirt from the waist, open at the front
    const cg = mesh(cyl(pel.r * 1.22, pel.r * 1.6, pel.r * len, 16, 1, true, 0.5, Math.PI * 2 - 1.0), m, 0, -pel.r * len * 0.4, 0, P);
    cg.material.side = THREE.DoubleSide;
    return cg;
  };
  const lapels = (m, w = 0.3) => { for (const sd of [-1, 1]) { const l = mesh(box(r * w, hh * 1.6 + r * 0.4, r * 0.06), m, sd * r * 0.4, hh * 0.35, r * 1.1, C); l.rotation.z = sd * 0.32; l.rotation.x = -0.1; } };
  const kimonoV = (m) => { for (const sd of [-1, 1]) { const l = mesh(box(r * 0.22, hh * 1.1 + r * 0.3, r * 0.05), m, -sd * r * 0.18, hh * 0.55, r * 1.02, C); l.rotation.z = sd * 0.4; l.rotation.x = -0.25; } };

  if (id === 'jk_ryu') { // a long dark coat, open over a white shirt, team scarf
    const coat = mat('#1e2030', { spec: 0.2 }), shirt = mat('#ecebe4');
    chestShell(H, ch, coat, C);
    const V = mesh(box(r * 0.65, hh * 1.5, r * 0.06), shirt, 0, hh * 0.45, r * 1.08, C); V.rotation.x = -0.12;
    lapels(coat, 0.34);
    collar(coat, 0.45);
    sleeves(coat, 1.22);
    mesh(torus(H, r * 0.62, r * 0.12, Math.PI * 2, 14), tc, 0, hh + r * 0.62, 0, C).rotation.x = Math.PI / 2;
    const sc = mesh(box(r * 0.25, r * 0.9, r * 0.06), tc, r * 0.3, hh * 0.3, r * 1.14, C); sc.rotation.z = 0.15;
    belt(mat('#3a2a1e'), -hh - r * 0.38, 1.14);
    longCoat(coat, 2.5);
  }
  if (id === 'jk_uro') { // a dark Heian-style robe: wide sleeves, a team obi, a pale under-collar, hakama
    const robe = mat('#22243a', { spec: 0.2 }), pale = mat('#e8e2d4'), hak = mat('#1a1a22');
    chestShell(H, ch, robe, C);
    kimonoV(pale);
    sleeves(robe, 1.25); wide(robe);
    belt(tc, -hh - r * 0.3, 1.18);
    mesh(box(r * 0.5, r * 0.3, r * 0.2), td, 0, -hh - r * 0.3, -r * 1.15, C); // the bow at the back
    skirt(hak, 1.18, 1.7, 2.4);
  }
  if (id === 'jk_kashimo') { // a pale robe open on the chest, dark hakama, team sash; a lightning glow
    const robe = mat('#d8dce6', { spec: 0.1 }), hak = mat('#2a2a3a');
    chestShell(H, ch, robe, C);
    const V = mesh(cone(r * 0.45, r * 1.5, 3), skin, 0, hh - r * 0.1, r * 1.04, C); V.rotation.set(-0.12, 0, Math.PI); V.scale.set(1, 1, 0.25); // open on the chest
    kimonoV(mat('#a8b0c0'));
    sleeves(robe, 1.22); wide(robe);
    belt(tc, -hh - r * 0.35, 1.16);
    skirt(hak, 1.15, 1.7, 2.3);
  }
  if (id === 'jk_higuruma') { // dark suit, white shirt, dark tie, the gold lawyer's badge
    const suit = mat('#24262f', { spec: 0.2 }), shirt = mat('#ecebe4'), tie = mat('#2a2e44');
    chestShell(H, ch, suit, C);
    sleeves(suit);
    collar(shirt);
    const V = mesh(box(r * 0.6, hh * 1.4, r * 0.06), shirt, 0, hh * 0.45, r * 1.08, C); V.rotation.x = -0.12;
    lapels(suit);
    const t = mesh(box(r * 0.2, hh * 1.5, r * 0.05), tie, 0, hh * 0.25, r * 1.16, C); t.rotation.x = -0.1;
    mesh(cyl(r * 0.1, r * 0.1, r * 0.04, 12), mat('#e2b43a', { spec: 1 }), -r * 0.5, hh * 0.65, r * 1.12, C).rotation.x = Math.PI / 2; // badge
    mesh(box(r * 0.22, r * 0.12, r * 0.04), tc, r * 0.55, hh * 0.55, r * 1.06, C); // pocket square
    belt(mat('#141418'), -hh - r * 0.38, 1.13);
    const coat = mesh(cyl(pel.r * 1.12, pel.r * 1.25, pel.r * 1.2, 16), suit, 0, -pel.r * 0.35, -pel.r * 0.05, P); coat.scale.set(1, 1, 0.92);
  }
  if (id === 'jk_yuki') { // a black biker jacket over a white top, blue jeans, team scarf
    const jacket = mat('#1a1a20', { spec: 0.45 }), top = mat('#f2f0ea');
    chestShell(H, ch, jacket, C);
    const V = mesh(box(r * 0.75, hh * 1.6, r * 0.06), top, 0, hh * 0.3, r * 1.08, C); V.rotation.x = -0.1;
    lapels(jacket, 0.36);
    sleeves(jacket, 1.2);
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); mesh(cyl(sp.r * 1.3, sp.r * 1.3, sp.r * 0.5, 10), mat('#c8ccd4', { spec: 1 }), 0, -sp.hh * 0.6, 0, parts[p]); } // zip cuffs
    mesh(torus(H, r * 0.6, r * 0.14, Math.PI * 2, 14), tc, 0, hh + r * 0.62, 0, C).rotation.x = Math.PI / 2;
    belt(mat('#3a2a1e'), -hh - r * 0.38, 1.13);
    mesh(box(r * 0.2, r * 0.14, r * 0.06), mat('#c8ccd4', { spec: 1 }), 0, -hh - r * 0.38, r * 1.13, C);
  }
  if (id === 'jk_meimei') { // a black dress with a long skirt, white collar, team ribbon
    const dress = mat('#16161c', { spec: 0.3 });
    chestShell(H, ch, dress, C);
    sleeves(dress, 1.18);
    mesh(torus(H, r * 0.6, r * 0.08, Math.PI * 2, 14), mat('#f2efe6'), 0, hh + r * 0.55, 0, C).rotation.x = Math.PI / 2;
    belt(tc, -hh - r * 0.38, 1.12).scale.set(1, 0.6, 1);
    const sk = skirt(dress, 1.15, 1.75, 2.6); sk.scale.set(1, 1, 0.95);
  }
  if (id === 'jk_kamo') { // the Kyoto school's dark uniform, worn like a robe; a white sash; a quiver
    const uni = mat('#2a2a36', { spec: 0.2 }), wht = mat('#f2efe6');
    chestShell(H, ch, uni, C);
    kimonoV(wht);
    sleeves(uni, 1.22); wide(uni);
    belt(wht, -hh - r * 0.35, 1.15);
    mesh(box(r * 0.3, r * 0.18, r * 0.06), tc, 0, -hh - r * 0.35, r * 1.15, C);
    skirt(mat('#3a3a44'), 1.15, 1.6, 2.2);
    const q = mesh(cyl(r * 0.22, r * 0.18, r * 2.2, 10), mat('#5a3a24'), r * 0.4, r * 0.3, -r * 1.15, C); q.rotation.z = -0.4; // quiver
    for (let i = 0; i < 3; i++) mesh(cone(r * 0.06, r * 0.25, 4), mat('#b01828', { emit: 0.3 }), r * (0.85 + i * 0.07), r * (1.35 + i * 0.03), -r * 1.15, C).rotation.z = -0.4;
  }
  if (id === 'jk_naoya') { // a dark kimono under a pale haori, team obi, hakama
    const kim = mat('#1e2236', { spec: 0.2 }), haori = mat('#c8ccd4', { spec: 0.1 });
    chestShell(H, ch, haori, C);
    const V = mesh(cone(r * 0.5, hh * 2 + r * 0.6, 3), kim, 0, hh * 0.05, r * 1.0, C); V.rotation.set(-0.08, 0, Math.PI); V.scale.set(1, 1, 0.3); // the kimono under the open haori
    kimonoV(mat('#f2efe6'));
    sleeves(haori, 1.24); wide(haori);
    belt(tc, -hh - r * 0.32, 1.16);
    skirt(mat('#24283a'), 1.15, 1.6, 2.3);
  }
  if (id === 'jk_mechamaru') { // armour plates: chest plate with a glowing core, shoulder pads, segmented limbs
    const plate = mat('#c8cdd6', { spec: 0.8 }), dark = mat('#3a3e46', { spec: 0.6 });
    chestShell(H, ch, dark, C);
    const fr = mesh(box(r * 1.7, hh * 2 + r * 0.6, r * 0.5), plate, 0, hh * 0.15, r * 0.75, C); void fr;
    ns(mesh(cyl(r * 0.28, r * 0.28, r * 0.08, 16), H.glow('#4ad8ff'), 0, hh * 0.45, r * 1.02, C)).rotation.x = Math.PI / 2;
    mesh(torus(H, r * 0.3, r * 0.05, Math.PI * 2, 16), dark, 0, hh * 0.45, r * 1.04, C);
    for (const sd of [-1, 1]) { const pd = mesh(box(r * 0.8, r * 0.5, r * 1.3), tc, sd * r * 1.15, hh + r * 0.35, 0, C); pd.rotation.z = -sd * 0.25; }
    for (const p of ARMS) { cover(p, dark, 1.2); const sp = limb(p); mesh(box(sp.r * 2.6, sp.hh * 1.4, sp.r * 2.6), plate, 0, isFore(p) ? -sp.hh * 0.1 : 0, 0, parts[p]); }
    for (const p of LEGS) { cover(p, dark, 1.2); const sp = limb(p); mesh(box(sp.r * 2.6, sp.hh * 1.5, sp.r * 2.6), plate, 0, 0, 0, parts[p]); }
    mesh(box(pel.r * 2.3, pel.r * 1.3, pel.r * 2.0), plate, 0, -pel.r * 0.1, 0, P);
    mesh(box(pel.r * 0.8, pel.r * 0.6, pel.r * 0.2), tc, 0, -pel.r * 0.1, pel.r * 1.05, P);
    for (const sd of [-1, 1]) mesh(cyl(r * 0.22, r * 0.3, r * 0.6, 10), dark, sd * r * 0.45, hh * 0.2, -r * 1.2, C).rotation.x = -0.2; // thrusters
  }
  if (id === 'jk_kusakabe') { // a long grey coat over a dark suit, team scarf
    const coat = mat('#5a5e66', { spec: 0.15 }), suit = mat('#22232a'), shirt = mat('#e8e6de');
    chestShell(H, ch, coat, C);
    const V = mesh(box(r * 0.7, hh * 1.5, r * 0.06), suit, 0, hh * 0.4, r * 1.08, C); V.rotation.x = -0.12;
    mesh(box(r * 0.25, hh * 0.9, r * 0.05), shirt, 0, hh * 0.8, r * 1.12, C);
    lapels(coat, 0.34);
    collar(coat, 0.5);
    sleeves(coat, 1.22);
    mesh(torus(H, r * 0.62, r * 0.12, Math.PI * 2, 14), tc, 0, hh + r * 0.6, 0, C).rotation.x = Math.PI / 2;
    belt(mat('#141418'), -hh - r * 0.38, 1.14);
    longCoat(coat, 2.6);
    const sheath = mesh(cyl(r * 0.07, r * 0.07, r * 3.0, 6), mat('#1a1418', { spec: 0.3 }), r * 0.95, -hh - r * 0.6, r * 0.2, C); sheath.rotation.x = 1.2; // the scabbard at his hip
  }
}

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, mat, glow, capsule } = H;
  const T = THREE;
  switch (type) {
    case 'jk_gbseg': { // a segment of Granite Blast (along +Y, 1 m): thick and blinding
      ns(mesh(cyl(0.3, 0.3, 1.02, 10), glow('#f0fbff'), 0, 0, 0, g));
      ns(mesh(cyl(0.6, 0.6, 1.02, 12), mat('#7ad8ff', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g));
      ns(mesh(cyl(0.9, 0.9, 1.02, 12), mat('#3a8aff', { emit: 0.8, transparent: true, opacity: 0.2, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_gbcharge': { // the charge between his palms
      ns(mesh(sphere(0.25, 12, 10), glow('#f0fbff'), 0, 0, 0, g));
      ns(mesh(sphere(0.55, 14, 10), mat('#7ad8ff', { emit: 1, transparent: true, opacity: 0.4, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 0.6 + i * 0.12, 0.02, Math.PI * 2, 18), glow('#a8e8ff'), 0, 0, 0, g)).rotation.set(i * 1.1, i * 0.6, 0);
      return true;
    }
    case 'jk_mcseg': { // the Ultra Cannon (along +Y, 1 m)
      ns(mesh(cyl(0.08, 0.08, 1.02, 8), glow('#e8fbff'), 0, 0, 0, g));
      ns(mesh(cyl(0.22, 0.22, 1.02, 10), mat('#4ad8ff', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_arcseg': { // a jagged segment of lightning (along +Y)
      ns(mesh(cyl(0.035, 0.035, 0.95, 5), glow('#e8f6ff'), 0, 0, 0, g));
      ns(mesh(cyl(0.1, 0.1, 0.95, 6), mat('#6ac8ff', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_amber': { // Mythical Beast Amber: a crackling blue-white aura
      ns(mesh(sphere(0.85, 14, 10), mat('#8ad8ff', { emit: 1, transparent: true, opacity: 0.2, depthWrite: false }), 0, 0.1, 0, g)).scale.set(1, 1.5, 1);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        const s = ns(mesh(cyl(0.025, 0.025, 0.9, 4), glow('#e8f6ff'), Math.sin(a) * 0.6, Math.cos(a * 1.7) * 0.5, Math.cos(a) * 0.6, g));
        s.rotation.set(a, a * 2, a * 0.5);
      }
      return true;
    }
    case 'jk_skyfold': { // Thin Ice Breaker: the sky peeled up in front of her like a sheet
      const sheet = ns(mesh(H.geo('jksky', () => new T.CylinderGeometry(3.4, 3.4, 4.2, 24, 1, true, -0.9, 1.8)), mat('#9ad8ff', { emit: 0.6, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false }), 0, 2.1, -1.6, g));
      void sheet;
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 3.4, 0.03, 1.8, 18), glow('#e8f8ff'), 0, 0.6 + i * 1.5, -1.6, g)).rotation.set(Math.PI / 2, 0, Math.PI / 2 - 0.9);
      for (let i = 0; i < 4; i++) ns(mesh(sphere(0.4, 8, 6), mat('#ffffff', { transparent: true, opacity: 0.7, depthWrite: false }), (i - 1.5) * 1.0, 3.5 + (i % 2) * 0.4, 1.4, g)).scale.set(1.6, 0.6, 1); // clouds caught in it
      return true;
    }
    case 'jk_skywall': { // the sky bent round her: a pale shell
      ns(mesh(sphere(1.25, 16, 12), mat('#bfe8ff', { emit: 0.5, transparent: true, opacity: 0.22, depthWrite: false }), 0, 0, 0, g)).scale.set(1, 1.3, 1);
      for (let i = 0; i < 2; i++) ns(mesh(torus(H, 1.25, 0.02, Math.PI * 2, 24), glow('#e8f8ff'), 0, 0, 0, g)).rotation.set(i * 1.2 + 0.3, 0.5, 0);
      return true;
    }
    case 'jk_trial': { // the trial: Judgeman's scales over the defendant
      const gold = mat('#e2b43a', { spec: 1, emit: 0.3 });
      ns(mesh(cyl(0.02, 0.02, 0.5, 6), gold, 0, 0, 0, g));
      ns(mesh(box(0.7, 0.03, 0.03), gold, 0, 0.25, 0, g));
      for (const sd of [-1, 1]) { ns(mesh(cyl(0.12, 0.08, 0.05, 10), gold, sd * 0.33, 0.05, 0, g)); ns(mesh(cyl(0.005, 0.005, 0.2, 3), gold, sd * 0.33, 0.15, 0, g)); }
      return true;
    }
    case 'jk_confisc': { // Confiscation: a red stamp over the convict's head
      ns(mesh(cyl(0.32, 0.32, 0.04, 20), mat('#d82030', { emit: 0.8 }), 0, 0, 0, g)).rotation.x = Math.PI / 2;
      ns(mesh(torus(H, 0.32, 0.04, Math.PI * 2, 20), glow('#ff5060'), 0, 0, 0, g));
      const x1 = ns(mesh(box(0.42, 0.07, 0.06), mat('#fff0f0', { emit: 1 }), 0, 0, 0.03, g)); x1.rotation.z = 0.785;
      const x2 = ns(mesh(box(0.42, 0.07, 0.06), mat('#fff0f0', { emit: 1 }), 0, 0, 0.03, g)); x2.rotation.z = -0.785;
      return true;
    }
    case 'jk_xsword': { // the Executioner's Sword: a long, plain blade (pointing on from the hand, -Y)
      ns(mesh(box(0.04, 1.2, 0.16), mat('#f2f0f8', { spec: 1, emit: 0.35 }), 0, -0.68, 0, g));
      ns(mesh(cone(0.08, 0.2, 4), mat('#f2f0f8', { spec: 1, emit: 0.35 }), 0, -1.38, 0, g)).rotation.x = Math.PI;
      ns(mesh(box(0.3, 0.05, 0.07), mat('#2a2a30'), 0, -0.06, 0, g));
      ns(mesh(box(0.06, 1.15, 0.2), mat('#ff3a4a', { emit: 1, transparent: true, opacity: 0.25, depthWrite: false }), 0, -0.68, 0, g));
      return true;
    }
    case 'jk_xcut': { // a clean slash
      const c = ns(mesh(sphere(0.5, 10, 6), glow('#ffffff'), 0, 0, 0, g)); c.scale.set(1.7, 0.05, 0.04);
      const h = ns(mesh(sphere(0.5, 10, 6), mat('#a8d0ff', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g)); h.scale.set(1.6, 0.15, 0.08);
      return true;
    }
    case 'jk_starwave': { // Star Rage: a ring of force along the ground
      ns(mesh(torus(H, 2.0, 0.12, Math.PI * 2, 32), mat('#ffe08a', { emit: 1, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0.1, 0, g)).rotation.x = Math.PI / 2;
      ns(mesh(cyl(2.0, 2.0, 0.03, 28), mat('#fff4c8', { emit: 0.6, transparent: true, opacity: 0.25, depthWrite: false }), 0, 0.05, 0, g));
      return true;
    }
    case 'jk_bhole': { // the Black Hole: a black sphere in a bright accretion disc
      ns(mesh(sphere(1.4, 20, 16), mat('#020104'), 0, 0, 0, g));
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 2.0 + i * 0.6, 0.18 - i * 0.04, Math.PI * 2, 32), mat(i === 0 ? '#ffd08a' : i === 1 ? '#ff7a3a' : '#8a3aff', { emit: 1, transparent: true, opacity: 0.75 - i * 0.2, depthWrite: false }), 0, 0, 0, g)).rotation.set(Math.PI / 2 + 0.35, 0, 0);
      ns(mesh(sphere(2.6, 20, 14), mat('#5a2a8a', { emit: 0.6, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_redscale': { // Flowing Red Scale: red marks and a red haze
      ns(mesh(sphere(0.7, 12, 10), mat('#ff2a3a', { emit: 1, transparent: true, opacity: 0.14, depthWrite: false }), 0, 0.15, 0, g)).scale.set(1, 1.4, 1);
      for (const sd of [-1, 1]) ns(mesh(box(0.05, 0.4, 0.04), glow('#ff2a3a'), sd * 0.2, 0.2, 0.5, g));
      return true;
    }
    case 'jk_frame': { // a frame of Projection Sorcery: a pale afterimage panel
      ns(mesh(box(0.9, 1.9, 0.03), mat('#e8f4ff', { emit: 0.5, transparent: true, opacity: 0.25, depthWrite: false }), 0, 1.0, 0, g));
      const fm = mat('#ffffff', { emit: 1, transparent: true, opacity: 0.7, depthWrite: false });
      for (const y of [0.05, 1.95]) ns(mesh(box(0.95, 0.04, 0.04), fm, 0, y, 0, g));
      for (const x of [-0.46, 0.46]) ns(mesh(box(0.04, 1.9, 0.04), fm, x, 1.0, 0, g));
      return true;
    }
    case 'jk_pane': { // frozen in a frame: a flat pane round the victim
      ns(mesh(box(1.2, 1.6, 0.05), mat('#d8eeff', { emit: 0.4, transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0.45, g));
      const fm = glow('#ffffff');
      for (const y of [-0.8, 0.8]) ns(mesh(box(1.24, 0.04, 0.05), fm, 0, y, 0.45, g));
      for (const x of [-0.6, 0.6]) ns(mesh(box(0.04, 1.6, 0.05), fm, x, 0, 0.45, g));
      return true;
    }
    case 'jk_thrust': { // thruster flames from the back
      for (const sd of [-1, 1]) {
        ns(mesh(cone(0.18, 0.9, 8), mat('#ffa03a', { emit: 1, transparent: true, opacity: 0.75, depthWrite: false }), sd * 0.2, -0.3, -0.1, g)).rotation.x = Math.PI;
        ns(mesh(cone(0.08, 0.55, 6), glow('#fff4c8'), sd * 0.2, -0.2, -0.1, g)).rotation.x = Math.PI;
      }
      return true;
    }
    case 'jk_simpledom': { // Simple Domain: a pale circle on the ground with a ring of light
      ns(mesh(cyl(2.9, 2.9, 0.02, 32), mat('#d8e8ff', { emit: 0.5, transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.02, 0, g));
      ns(mesh(torus(H, 2.9, 0.05, Math.PI * 2, 40), glow('#e8f4ff'), 0, 0.04, 0, g)).rotation.x = Math.PI / 2;
      ns(mesh(torus(H, 0.7, 0.03, Math.PI * 2, 20), glow('#e8f4ff'), 0, 0.04, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_garuda': { // Garuda: a stubby black-and-white bird shikigami, beak first (+Y)
      ns(mesh(sphere(0.25, 12, 10), mat('#1a1a20', { spec: 0.4 }), 0, 0, 0, g)).scale.set(0.9, 1.3, 0.9);
      ns(mesh(sphere(0.16, 10, 8), mat('#f2efe6'), 0, 0.05, 0.12, g)).scale.set(1, 1.3, 0.6);
      ns(mesh(cone(0.07, 0.2, 5), mat('#f2c030'), 0, 0.38, 0, g));
      for (const sd of [-1, 1]) { const w = ns(mesh(sphere(0.2, 8, 6), mat('#1a1a20'), sd * 0.28, -0.02, 0, g)); w.scale.set(1.2, 0.4, 0.2); }
      for (const sd of [-1, 1]) ns(mesh(sphere(0.04, 6, 5), mat('#ffffff'), sd * 0.09, 0.22, 0.15, g));
      return true;
    }
    case 'jk_crow': case 'jk_kamicrow': { // a crow, beak first (+Y)
      const blk = mat('#121218', { spec: 0.5 });
      const k = type === 'jk_kamicrow' ? 1.4 : 1;
      ns(mesh(sphere(0.12 * k, 10, 8), blk, 0, 0, 0, g)).scale.set(0.8, 1.6, 0.8);
      ns(mesh(cone(0.04 * k, 0.14 * k, 4), mat('#2a2a30'), 0, 0.25 * k, 0, g));
      for (const sd of [-1, 1]) { const w = ns(mesh(sphere(0.16 * k, 8, 6), blk, sd * 0.2 * k, 0.0, 0, g)); w.scale.set(1.4, 0.6, 0.12); }
      ns(mesh(cone(0.09 * k, 0.16 * k, 4), blk, 0, -0.24 * k, 0, g)).rotation.x = Math.PI;
      if (type === 'jk_kamicrow') ns(mesh(sphere(0.3, 10, 8), mat('#ff3a2a', { emit: 1, transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_bloodarrow': { // a blood arrow: a dark red shaft with a glowing tip (along +Y)
      ns(mesh(cyl(0.02, 0.02, 0.75, 5), mat('#8a0818', { spec: 0.8 }), 0, 0, 0, g));
      ns(mesh(cone(0.05, 0.14, 5), glow('#ff2a3a'), 0, 0.42, 0, g));
      ns(mesh(cyl(0.06, 0.06, 0.75, 6), mat('#ff2a3a', { emit: 1, transparent: true, opacity: 0.25, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_missile': { // a small missile (along +Y)
      ns(mesh(cyl(0.06, 0.06, 0.4, 8), mat('#c8cdd6', { spec: 0.8 }), 0, 0, 0, g));
      ns(mesh(cone(0.06, 0.12, 8), mat('#d8303a'), 0, 0.26, 0, g));
      ns(mesh(cone(0.07, 0.25, 6), glow('#ffb040'), 0, -0.3, 0, g)).rotation.x = Math.PI;
      return true;
    }
    case 'jk_dom_higuruma': { // Deadly Sentencing: a dark courtroom; the bench, two lecterns, Judgeman
      const R = HIG_R;
      domeMesh(H, g, R, '#1a1418', 0.62, '#e2b43a');
      ns(mesh(H.geo('jkhg-floor', () => new T.CircleGeometry(R, 40).rotateX(-Math.PI / 2)), mat('#2a1e18', { transparent: true, opacity: 0.9, depthWrite: false }), 0, 0.05, 0, g));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ns(mesh(box(0.06, 0.03, R * 1.8), mat('#4a3628'), 0, 0.07, 0, g)).rotation.y = a; }
      const wood = mat('#5a3a22', { spec: 0.3 });
      const bench = new T.Group(); bench.position.set(0, 0, -R * 0.72); g.add(bench);
      ns(mesh(box(4.4, 2.4, 1.0), wood, 0, 1.2, 0, bench));
      ns(mesh(box(4.6, 0.12, 1.1), mat('#e2b43a', { spec: 1 }), 0, 2.45, 0, bench));
      // Judgeman: a pale, bandaged shikigami with a tall hat, over the bench
      ns(mesh(capsule(0.7, 1.4), mat('#e8e2d0'), 0, 3.3, -0.2, bench));
      ns(mesh(sphere(0.6, 12, 10), mat('#e8e2d0'), 0, 4.6, -0.2, bench));
      ns(mesh(box(1.25, 0.25, 0.1), mat('#141010'), 0, 4.7, 0.38, bench)); // the blindfold
      ns(mesh(cyl(0.45, 0.55, 0.9, 12), mat('#141418'), 0, 5.4, -0.2, bench));
      for (const sd of [-1, 1]) { // the two lecterns
        ns(mesh(box(1.0, 1.2, 0.6), wood, sd * 2.6, 0.6, R * 0.2, g));
        ns(mesh(box(1.1, 0.06, 0.7), mat('#e2b43a', { spec: 1 }), sd * 2.6, 1.22, R * 0.2, g));
      }
      ns(mesh(torus(H, R, 0.07, Math.PI * 2, 56), glow('#e2b43a'), 0, 0.1, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
  }
  return false;
}

register({
  units,
  items: {
    jk_nyoibo: { len: 1.4, r: 0.06, grip: 30, mass: 1.6 },
    jk_gavel: { len: 0.48, r: 0.1, grip: 30, mass: 0.9 },
    jk_meiaxe: { len: 1.25, r: 0.18, grip: 25, heavy: true, blade: 'axe', metal: true, mass: 4.5 },
    jk_mechblade: { len: 0.95, r: 0.07, grip: 30, metal: true, mass: 1.4 },
  },
  kinds: {
    jk_ryu: ryu, jk_uro: uro, jk_kashimo: kashimo, jk_higuruma: higuruma, jk_yuki: yuki,
    jk_meimei: meimei, jk_kamo: kamo, jk_naoya: naoya, jk_mechamaru: mecha, jk_kusakabe: kusakabe,
  },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
});
