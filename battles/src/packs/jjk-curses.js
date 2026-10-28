// Jujutsu Kaisen: the curses and the sorcerer killers (faction 'jjk', on jjk-core.js).
//  - Toji Fushiguro: Heavenly Restriction (no cursed energy: sure-hits can't find him),
//    blindingly fast leaps, the Inverted Spear of Heaven (cuts through Infinity and
//    barriers), the Playful Cloud flurry, the Inventory Curse wrapped round him
//  - Dagon: shikigami fish swarms; Horizon of the Captivating Skandha (a beach)
//  - Mahito: Idle Transfiguration (his touch reshapes souls: victims become his
//    transfigured humans); Self-Embodiment of Perfection (hands everywhere)
//  - Jogo: Ember Insects, Maximum: Meteor; Coffin of the Iron Mountain (volcanic)
//  - Hanami: wooden balls, roots out of the ground, a flower field that saps
//  - Suguru Geto (Kenjaku): Cursed Spirit Manipulation (stored curses come out) and
//    Maximum: Uzumaki (the curses compressed into one spiral blast)
//  - Choso: Blood Manipulation - Convergence, Piercing Blood, Supernova
//  - Kinji Hakari: Idle Death Gamble (pachinko): a JACKPOT makes him all but immortal
//  - Fly Heads: cheap swarm curses
// Secrets: Prison Realm (Geto near an enemy Gojo), the Inverted Spear of Heaven cuts
// through Infinity, Toji cuts a domain open (the sure-hit can't find him), Mahito can't
// reshape Yuji, Yuji's blows hurt Mahito's soul, Choso meets his little brother.
// Summons (Geto's curses, Mahito's transfigured humans) are jjk-core reserves of
// summon-only units (faction 'jjk_summon': no tab, cost 0).
// Everything drawn is a unit part, a projectile or a marker, so replays show it.
import { register } from '../ext.js';
import { ATTACKS } from '../pose.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, aimPoint, launchVel, addProjectile,
  strike, handPos, torus, dome, tcol, tdark, chestShell, blast, addStatus, tube, slowBeast,
} from './common.js';
import { UPY, STANCE, setArmKey, refreshBeam, endBeam } from './ges-core.js';
import {
  FACTION, jk, onSecret, announce, isA, burntOut, openDomain, closeDomain, domeMesh, markerAt, markerOn,
  summon, dismiss, switchTeam, seal, ensureHitHook,
} from './jjk-core.js';

const FAC = FACTION.id, SUMMON = 'jjk_summon';
const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Euler();
// domain radii (the dome meshes are built at these sizes)
export const DOM_R = { dagon: 9, mahito: 7, jogo: 8, hakari: 7.5 };
// a body out of play (battle.js park(); a copy: importing battle.js from a pack would
// build its projectile table before the later packs register)
function park(u) {
  u.dormant = true;
  u.alive = false;
  for (const bd of u.rag.bodies) bd.setEnabled(false);
  for (const e of u.extras) e.body?.setEnabled(false);
}
const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const foe = (u, v) => v && v.alive && !v.dormant && v.team !== u.team;

// ------------------------------------------------------------------ animations
// domain expansion: the hand sign held up in front of the face
ATTACKS.jk_sign = [
  [0.0, null, null, 0, 0, 0],
  [0.3, [0.85, 0.05, -1.3, -2.5], [0.85, 0.05, -1.3, -2.5], 0, -0.1, 0.05],
  [0.85, [0.9, 0.0, -1.45, -2.45], [0.9, 0.0, -1.45, -2.45], 0, 0.05, 0.12],
  [1.0, null, null, 0, 0, 0],
];
// both palms pushed out (Uzumaki, Piercing Blood, a meteor called down)
ATTACKS.jk_push = [
  [0.0, null, null, 0, 0, 0],
  [0.45, [0.6, 0.2, -1.2, -2.4], [0.6, 0.2, -1.2, -2.4], 0.3, -0.15, 0.1],
  [0.6, [0.3, 0.1, -1.5, -1.55], [0.3, 0.1, -1.5, -1.55], -0.2, 0.3, 0.08],
  [0.85, [0.3, 0.1, -1.45, -1.5], [0.3, 0.1, -1.45, -1.5], -0.2, 0.3, 0.08],
  [1.0, null, null, 0, 0, 0],
];
// Geto: hands tucked into his sleeves; Choso: palms together (Convergence)
STANCE.jk_sleeves = (st, pose) => { setArmKey(pose, -1, [0.95, 0.05, -0.75, -1.95]); setArmKey(pose, 1, [0.95, 0.05, -0.75, -1.95]); };
STANCE.jk_blood = (st, pose) => { setArmKey(pose, -1, [0.75, 0.1, -0.85, -1.85]); setArmKey(pose, 1, [0.75, 0.1, -0.85, -1.85]); };

// ------------------------------------------------------------------ helpers
// a short banner for a named technique, at most once every `gap` seconds per name
function techBanner(b, text, pos, gap = 6) {
  const s = jk(b);
  s.jkcT ??= {};
  if ((s.jkcT[text] ?? -99) > b.time - gap) return;
  s.jkcT[text] = b.time;
  announce(b, text, pos);
}
// play an animation for a technique; event() runs CAST[what] at its release point
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
// steer a homing projectile at pr.tgt
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

// ------------------------------------------------------------------ domains
const myDomain = (u) => (u.jkDom && jk(u.battle).domains.includes(u.jkDom) ? u.jkDom : null);
// The AI opens its domain once enough enemies (or an elite) are close, or at once to
// answer an enemy domain it stands in (a clash).
function wantDomain(u, dt) {
  const b = u.battle, w = u.def.weapon;
  u.jkDomCD -= dt;
  if (u.jkDomCD > 0 || b.over || burntOut(u) || myDomain(u) || u.stun > 0.3 || u.jkSealedT > b.time || u.st.attack || u.fleeT > 0 || u.isDown()) return false;
  for (const d of jk(b).domains) if (d.team !== u.team && flat(u.pos, d.pos) < d.R) return true;
  let n = 0, big = 0, left = 0;
  for (const v of b.foes(u.team)) {
    if (!v.alive) continue;
    left++;
    if (flat(v.pos, u.pos) > w.domR * 0.7) continue;
    n++;
    if (v.def.cost >= 900) big++;
  }
  // enough of them close, an elite, or everyone still standing (to finish a duel)
  if (n >= Math.min(w.domMin, left) || big || (u.control && n > 0)) return true;
  u.jkDomCD = 0.4;
  return false;
}
function expand(u, o) {
  const b = u.battle, w = u.def.weapon;
  u.jkDomCD = w.domCD;
  castPose(u, 'jk_sign', null);
  const d = openDomain(b, u, { radius: w.domR, duration: w.domDur, power: w.domPow, tick: w.domTick, ...o });
  u.jkDom = d;
  if (d) u.expr = EXPR.happy;
  return d;
}
const sureHit = (v, dmg, att) => v.hit(dmg, PART.chest, 0, v.M * 0.3, 0, att, 'domain');

// ------------------------------------------------------------------ Toji Fushiguro
// Fast melee killer with the Inverted Spear of Heaven. Heavenly Restriction: no cursed
// energy (jkNoCE: sure-hits miss him), the spear pierces Infinity (jkPierce). Leaps at
// enemies 4-10 m away; every few seconds the Inventory Curse coughs up the Playful
// Cloud for a three-blow flurry that bowls over everyone in front of him.
const toji = {
  melee: true,
  init(u) {
    ensureHitHook(u);
    u.jkNoCE = true; u.jkPierce = true;
    u.jkPC = rand(2, 4); u.jkDash = rand(0.3, 1.2); u.jkFl = 0; u.jkCloud = null;
  },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, c);
    if (u.jkDash <= 0 && c.gap > 3.5 && c.gap < 10 && !u.st.attack && u.stun <= 0 && u.airT <= 0 && !u.isDown()) {
      u.jkDash = w.dashCD * rand(0.8, 1.2);
      const k = u.M * w.dashV * clamp(c.gap / 7, 0.6, 1.1);
      u.rag.impulseAll(c.dirx * k, u.M * 2.6, c.dirz * k);
      u.battle.emit('dust', u.pos.x, u.pos.y - u.skel.standHeight, u.pos.z, 2);
      u.battle.sound('whoosh', u.pos, 0.7, 0.8);
    }
    return t;
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.jkDash -= dt; u.jkPC -= dt;
    newVictims(u, (v) => {
      if (v.jkInfinity) announce(b, 'SECRET: The Inverted Spear of Heaven cuts through Infinity!', v.chestPos, 'toji_inf');
      if (u.jkFl <= 0) markSpin(b, 'jk_cut', v.chestPos, 0.2);
    });
    if (u.jkFl > 0) { // the Playful Cloud flurry
      const t0 = w.pcDur - u.jkFl;
      u.jkFl -= dt;
      const t1 = w.pcDur - u.jkFl;
      for (const at of [0.12, 0.42, 0.72]) if (crossed(t0, t1, at)) cloudBlow(u);
      if (u.jkFl <= 0 && u.jkCloud) { u.jkCloud.t = 0; u.jkCloud = null; }
      return;
    }
    if (u.jkPC <= 0 && !u.st.attack && u.stun <= 0 && !u.isDown()) {
      if (enemiesNear(u, u.pos, w.pcR).length) {
        u.jkPC = w.pcCD * rand(0.85, 1.15);
        u.jkFl = w.pcDur;
        castPose(u, 'slam', null);
        u.jkCloud = markerOn(b, u, 'jk_cloud', PART.farmL, w.pcDur + 0.1, new THREE.Vector3(0, -u.skel.handOffset, 0));
        b.sound('whoosh', u.chestPos, 1.0, 0.6);
        if (Math.random() < 0.5) b.voice(u, 'attack', true);
      } else u.jkPC = 0.3;
    }
  },
  die(u) { if (u.jkCloud) { u.jkCloud.t = 0; u.jkCloud = null; } },
};
function cloudBlow(u) {
  const b = u.battle, w = u.def.weapon, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  for (const v of enemiesNear(u, u.pos, w.pcR)) {
    const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    if ((dx * fx + dz * fz) / d < -0.2) continue;
    _d.set(dx / d, 0.45, dz / d).normalize();
    strike(b, v, w.pcDmg, _d, Math.min(w.pcForce, v.M * 13), u, 'jk_cloud', PART.chest, 'crunch');
    if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 0.8 * (v.def.stagger ?? 1));
  }
  const c = u.chestPos;
  b.emit('spark', c.x + fx, c.y, c.z + fz, 3);
  b.sound('whoosh', c, 1.1, 0.45);
}

// ------------------------------------------------------------------ Dagon
// A slow, tough curse that sends shikigami fish swarming at its target. Its domain is
// a beach where the fish find everyone inside.
const dagon = {
  aim: true,
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.jkDomCD = w.domFirst; },
  think: rangedThink,
  event(u, t0, t1) {
    if (castEvent(u, t0, t1, {})) return;
    const w = u.def.weapon, b = u.battle;
    if (u.st.attack !== u.anim || !crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    const c = u.chestPos;
    const tgt = u.aimAt && u.aimAt.alive ? u.aimAt : null;
    aimPoint(u, _p, 0.4, 0.8);
    for (let i = 0; i < w.fish; i++) {
      _o.set(c.x + rand(-0.6, 0.6), c.y + rand(0.2, 0.9), c.z + rand(-0.6, 0.6));
      launchVel(_o, _p, w.speed, 0, false, 0.5, _v);
      _v.y += rand(2, 5);
      const pr = addProjectile(b, 'jk_fish', _o, _v, u, { life: (w.range / w.speed) * 2.2, tgt, spd: w.speed, damage: w.damage, force: w.force });
      if (!tgt) pr.aim = _p.clone();
    }
    b.emit('spark', c.x, c.y + 0.5, c.z, 3);
    b.sound('whoosh', c, 0.9, 0.7);
    b.sound('pop', c, 0.6, 0.6);
  },
  step(u, dt) {
    if (!u.st.attack) u.jkCast = null;
    if (wantDomain(u, dt)) {
      expand(u, {
        name: 'Horizon of the Captivating Skandha', marker: 'jk_dom_dagon',
        sureHit(b, dom, v) {
          sureHit(v, u.def.weapon.domDmg, u);
          if ((dom.data.n = (dom.data.n || 0) + 1) % 2 === 0 || dom.data.n < 12) swarmAt(b, dom, v, u);
        },
        step(b, dom, dt) { // fish leap out of the sea now and then
          dom.data.jt = (dom.data.jt || 0) - dt;
          if (dom.data.jt > 0) return;
          dom.data.jt = 0.35;
          const a = rand(0, Math.PI * 2), r = dom.R * rand(0.7, 0.92);
          _o.set(dom.pos.x + Math.sin(a) * r, dom.pos.y + 0.2, dom.pos.z + Math.cos(a) * r);
          _v.set(-Math.sin(a) * 2, rand(5, 7), -Math.cos(a) * 2);
          addProjectile(b, 'jk_fish', _o, _v, u, { life: 1.6, sure: true, damage: 0, force: 0, grav: true });
        },
      });
    }
  },
};
// two fish of the sure-hit swarm dart in from the dome's wall at a victim
function swarmAt(b, dom, v, owner) {
  const c = v.chestPos;
  for (let i = 0; i < 2; i++) {
    const a = rand(0, Math.PI * 2);
    _o.set(dom.pos.x + Math.sin(a) * dom.R * 0.85, dom.pos.y + rand(1, 4), dom.pos.z + Math.cos(a) * dom.R * 0.85);
    _v.copy(c).sub(_o).normalize().multiplyScalar(14);
    addProjectile(b, 'jk_fish', _o, _v, owner, { life: 1.4, tgt: v, spd: 14, sure: true, damage: 0, force: 0 });
  }
  b.emit('blood', c.x, c.y, c.z, 3, 0, 0);
}

// ------------------------------------------------------------------ Mahito
// Melee: every touch is Idle Transfiguration - extra damage straight to the soul, and a
// victim left too weak (or killed) is reshaped into a transfigured human that fights
// for him. He reshapes his own body too (steady regeneration), unless Yuji has hurt his
// soul. His domain lays hands on everyone inside.
const mahito = {
  melee: true,
  init(u) { u.jkDomCD = u.def.weapon.domFirst; u.jkSoulT = -99; },
  think: meleeThink,
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    newVictims(u, (v) => transfigure(u, v, w.tfDmg, 'jk_soul'));
    if (b.time > u.jkSoulT && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + w.regen * dt);
    if (wantDomain(u, dt)) {
      expand(u, {
        name: 'Self-Embodiment of Perfection', marker: 'jk_dom_mahito',
        sureHit(b, dom, v) { transfigure(u, v, u.def.weapon.domDmg, 'domain'); },
      });
    }
  },
  hit(u, amount, part, attacker) {
    if (attacker && isA(attacker, 'jk_yuji')) {
      const b = u.battle;
      announce(b, "SECRET: Yuji's fists strike Mahito's soul!", u.headPos, 'yuji_mahito');
      u.jkSoulT = b.time + 6;
      return amount * 1.5;
    }
    return amount;
  },
};
// a victim can be reshaped (its body becomes one of Mahito's transfigured humans)
const reshapable = (v) => !v.bc && !v.sm && v.s <= 1.6 && !v.extras.length && v.def.id !== 'jk_transfig' && !v.dormant;
function transfigure(u, v, dmg, kind) {
  const b = u.battle, w = u.def.weapon;
  if (!v.alive || v.team === u.team) return;
  if (isA(v, 'jk_yuji')) { // Sukuna's soul is in there with him
    announce(b, "SECRET: Mahito can't reshape Yuji's soul!", v.headPos, 'yuji_soul');
    markerOn(b, v, 'jk_soulfail', PART.chest, 0.5);
    return;
  }
  markerOn(b, v, 'jk_soul', PART.chest, 0.55);
  const c = v.chestPos;
  b.emit('spark', c.x, c.y, c.z, 2);
  b.sound('crunch', c, 0.5, 0.7);
  v.hit(dmg, PART.chest, 0, v.M * 0.4, 0, u, kind);
  if (v.alive && v.hp > v.maxHp * w.tfAt) return;
  if (!reshapable(v)) return;
  if (v.alive) {
    if (v.jkInfinity && !(v.jkSealedT > b.time)) return; // (he never touched Gojo's soul)
    v.die(u);
  }
  reshape(u, v);
}
function reshape(u, v) {
  const b = u.battle;
  const at = v.pos.clone();
  const s = summon(b, u, 'jk_transfig', at, v.heading);
  if (!s) return;
  park(v); // the body is gone: it stands back up as something else
  s.stun = 0.6;
  b.emit('blood', at.x, at.y + 0.3, at.z, 8, 0, 0);
  b.sound('crunch', at, 0.9, 0.5);
  b.sound('jk_soul', at, 1.1, 1);
  b.voice(s, 'cry', true);
}

// ------------------------------------------------------------------ Jogo
// A short volcano-headed caster: Ember Insects (homing flames that burst and set fire),
// on a long cooldown Maximum: Meteor on the thickest knot of enemies, and a volcanic
// domain that burns everyone inside.
const jogo = {
  aim: true,
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.jkMet = w.metFirst; u.jkDomCD = w.domFirst; },
  think: rangedThink,
  event(u, t0, t1) {
    if (castEvent(u, t0, t1, { meteor: callMeteor })) return;
    const w = u.def.weapon, b = u.battle;
    if (u.st.attack !== u.anim || !crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    const hand = handPos(u, _o);
    const tgt = u.aimAt && u.aimAt.alive ? u.aimAt : null;
    aimPoint(u, _p, 0.4, 0.8);
    for (let i = 0; i < w.embers; i++) {
      launchVel(hand, _p, w.speed, 0, false, 0.6, _v);
      _v.y += rand(1, 4);
      const pr = addProjectile(b, 'jk_ember', hand, _v, u, { life: (w.range / w.speed) * 2, tgt, spd: w.speed });
      if (!tgt) pr.aim = _p.clone();
    }
    b.emit('trail', hand.x, hand.y, hand.z, 1);
    b.sound('fire', hand, 0.7, 1.3);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkMet -= dt;
    if (u.jkMet <= 0 && !u.st.attack && u.stun <= 0 && !burntOut(u) && !b.over) {
      // the densest knot of enemies in range
      let best = null, bn = 0;
      for (const v of b.foes(u.team)) {
        if (!v.alive || flat(v.pos, u.pos) > w.metRange) continue;
        let n = v.def.cost >= 600 ? 2 : 0;
        b.grid.query(v.pos.x, v.pos.z, 3.5, (o) => { if (foe(u, o) && flat(o.pos, v.pos) < 3.5) n++; });
        if (n > bn) { bn = n; best = v; }
      }
      if (best && bn >= w.metMin) {
        u.jkMet = w.metCD;
        u.jkMetAt = best.pos.clone();
        castPose(u, 'jk_push', 'meteor');
        techBanner(b, 'Maximum: Meteor!', u.headPos);
      } else u.jkMet = 0.5;
    }
    if (wantDomain(u, dt)) {
      expand(u, {
        name: 'Coffin of the Iron Mountain', marker: 'jk_dom_jogo',
        sureHit(b, dom, v) {
          sureHit(v, u.def.weapon.domDmg, u);
          addStatus(b, v, 'burn', 1.6, u.def.weapon.domBurn, u);
          const c = v.chestPos;
          b.emit('trail', c.x, c.y, c.z, 0);
        },
        step(b, dom, dt) { // eruptions all over the floor
          dom.data.et = (dom.data.et || 0) - dt;
          if (dom.data.et > 0) return;
          dom.data.et = 0.3;
          const a = rand(0, Math.PI * 2), r = dom.R * Math.sqrt(rand(0.05, 0.9));
          _o.set(dom.pos.x + Math.sin(a) * r, 0, dom.pos.z + Math.cos(a) * r);
          _o.y = b.terrain.height(_o.x, _o.z);
          markerAt(b, 'jk_lava', _o, 0.7, rand(0, 6));
          b.emit('trail', _o.x, _o.y + 0.5, _o.z, 1);
          if (Math.random() < 0.3) b.sound('fire', _o, 0.5, 0.7);
        },
      });
    }
  },
};
function callMeteor(u) {
  const b = u.battle, w = u.def.weapon, at = u.jkMetAt;
  if (!at) return;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const gy = b.terrain.height(at.x, at.z);
  _o.set(at.x - fx * 9, gy + 30, at.z - fz * 9);
  _v.set(at.x, gy, at.z).sub(_o).normalize().multiplyScalar(w.metSpeed);
  addProjectile(b, 'jk_meteor', _o, _v, u, { life: 6, damage: w.metDmg, force: w.metForce, blast: w.metR, spin: new THREE.Vector3(0.6, 0.3, 0.4) });
  b.sound('boom', u.chestPos, 0.6, 0.35);
  b.voice(u, 'cry', true);
}
function meteorImpact(b, pr) {
  const p = pr.pos, o = pr.owner, burn = o?.def.weapon.metBurn ?? 10;
  const gy = b.terrain.height(p.x, p.z);
  _o.set(p.x, Math.max(p.y, gy + 0.6), p.z);
  blast(b, _o, pr.blast, pr.damage, pr.force, o, { fx: 2, friendly: 0.3, vol: 1.6, pitch: 0.5, onUnit: (v) => addStatus(b, v, 'burn', 4, burn, o) });
  b.emit('explode', _o.x, _o.y + 1.5, _o.z, pr.blast * 0.8, 2);
  b.emit('dust', _o.x, gy, _o.z, 8);
  markerAt(b, 'jk_crater', _o.set(p.x, gy + 0.02, p.z), 7, rand(0, 6));
  b.sound('crash', p, 1.4, 0.4);
}

// ------------------------------------------------------------------ Hanami
// A tree curse that fights in melee with wooden fists, shoots wooden balls at enemies
// out of reach, makes roots burst out of the ground under a target, and grows a field
// of flowers around itself that saps (and slows) every enemy in it.
const hanami = {
  melee: true,
  init(u) { const w = u.def.weapon; u.jkSeed = rand(0.5, 1.5); u.jkRoot = rand(2, 4); u.jkField = w.fieldFirst; },
  think(u, dt, c) {
    const w = u.def.weapon;
    const t = meleeThink(u, dt, c);
    if (u.st.attack || u.stun > 0 || u.isDown()) return t;
    if (u.jkField <= 0 && enemiesNear(u, u.pos, w.fieldR * 0.75).length >= 2) {
      u.jkField = w.fieldCD; castPose(u, 'jk_sign', 'field');
    } else if (u.jkRoot <= 0 && c.gap > 1.5 && c.dist < w.rootRange && c.t.alive) {
      u.jkRoot = w.rootCD; u.jkRootT = c.t; castPose(u, 'jk_push', 'roots');
    } else if (u.jkSeed <= 0 && c.gap > 3.5 && c.dist < w.seedRange) {
      u.jkSeed = w.seedCD; u.aimAt = c.t; castPose(u, 'throw', 'seed');
    }
    return t;
  },
  event(u, t0, t1) { castEvent(u, t0, t1, { field: flowerField, roots: rootsUnder, seed: woodBall }); },
  step(u, dt) { if (!u.st.attack) u.jkCast = null; u.jkSeed -= dt; u.jkRoot -= dt; u.jkField -= dt; },
};
function woodBall(u) {
  const b = u.battle, w = u.def.weapon;
  const hand = handPos(u, _o);
  aimPoint(u, _p, 0.5, 0.7);
  launchVel(hand, _p, w.seedSpeed, 4, false, 0.03, _v);
  addProjectile(b, 'jk_seed', hand, _v, u, { life: 3, damage: w.seedDmg, force: w.seedForce });
  b.sound('throw', hand, 0.7, 0.8);
}
function rootsUnder(u) {
  const b = u.battle, w = u.def.weapon, t = u.jkRootT;
  if (!t || !t.alive) return;
  const at = t.pos.clone();
  at.y = b.terrain.height(at.x, at.z);
  b.delayed.push([0.25, () => {
    markerAt(b, 'jk_roots', at, 1.4, rand(0, 6));
    b.emit('dust', at.x, at.y, at.z, 4);
    b.sound('crunch', at, 1.0, 0.5);
    b.sound('thump', at, 0.9, 0.6);
    for (const v of enemiesNear(u, at, w.rootR)) {
      v.hit(w.rootDmg, PART.pelvis, 0, 0, 0, u.alive ? u : null, 'jk_roots');
      if (v.parriedAt === b.time) continue;
      v.rag.impulseAll(rand(-0.5, 0.5) * v.M, v.M * w.rootUp, rand(-0.5, 0.5) * v.M);
      v.stun = Math.max(v.stun, w.rootStun * (v.def.stagger ?? 1));
      slowBeast(v, 0.2, w.rootStun);
    }
  }]);
}
function flowerField(u) {
  const b = u.battle, w = u.def.weapon;
  const at = u.pos.clone();
  at.y = b.terrain.height(at.x, at.z);
  const mk = markerAt(b, 'jk_flowers', at, w.fieldDur, rand(0, 6));
  S(b).fields.push({ owner: u, team: u.team, pos: at, t: w.fieldDur, R: w.fieldR, tick: 0.5, mk });
  b.sound('heal', at, 0.8, 0.6);
  b.emit('heal', at.x, at.y + 0.5, at.z, 6);
}
const STATE = new WeakMap();
function S(b) {
  let s = STATE.get(b);
  if (!s) STATE.set(b, (s = { fields: [] }));
  return s;
}
function stepFields(b, dt) {
  const s = STATE.get(b);
  if (!s || !s.fields.length) return;
  for (let i = s.fields.length - 1; i >= 0; i--) {
    const f = s.fields[i], o = f.owner, w = o.def.weapon;
    f.t -= dt;
    if (f.t <= 0) { f.mk.t = 0; s.fields.splice(i, 1); continue; }
    f.tick -= dt;
    const pulse = f.tick <= 0;
    if (pulse) f.tick = 0.5;
    let sapped = 0;
    for (const v of b.foes(f.team)) {
      if (!v.alive || flat(v.pos, f.pos) > f.R) continue;
      // a calm, heavy drowsiness: feet drag, arms are slow to swing
      if (!slowBeast(v, 0.55) && v.airT <= 0) {
        const v0 = v.rag.vel[PART.pelvis];
        v.rag.impulseAll(-v0.x * v.M * 0.1, 0, -v0.z * v.M * 0.1);
      }
      v.cooldown += dt * 0.45;
      if (pulse) { v.hit(w.fieldSap * 0.5, PART.chest, 0, 0, 0, o.alive ? o : null, 'jk_sap'); sapped++; }
    }
    if (sapped && o.alive) {
      o.hp = Math.min(o.maxHp, o.hp + sapped * w.fieldSap * 0.5 * w.fieldHeal);
      if (Math.random() < 0.5) { const c = o.chestPos; b.emit('heal', c.x, c.y, c.z, 2); }
    }
  }
}

// ------------------------------------------------------------------ Suguru Geto (Kenjaku)
// Cursed Spirit Manipulation: brings out the curses he has swallowed (reserves), two at
// a time; Maximum: Uzumaki compresses every curse he has out into one spiral blast that
// ploughs through a line (more curses, more damage). Fights with his fists up close.
const geto = {
  melee: true,
  init(u) { const w = u.def.weapon; u.jkSum = rand(0.2, 0.6); u.jkUzu = w.uzuFirst; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, gap, dirx, dirz, spd } = c;
    u.expr = gap < 5 ? EXPR.angry : EXPR.normal;
    const out = curses(u).length;
    // hang back behind his curses, step in to punch whatever reaches him
    const keep = out ? w.keep : 1.0;
    if (gap > keep) u.desired.set(dirx * spd * (out ? 0.7 : 1), 0, dirz * spd * (out ? 0.7 : 1));
    else if (out && gap < keep * 0.5 && gap > 1.2) u.desired.set(-dirx * spd * 0.5, 0, -dirz * spd * 0.5);
    if (dist - t.skel.radius < u.reachDist + 0.35 && u.cooldown <= 0 && !u.st.attack && !u.isDown()) u.startAttack();
    if (u.st.attack) u.desired.multiplyScalar(0.35);
    return t;
  },
  event(u, t0, t1) { castEvent(u, t0, t1, { summon: releaseCurses, uzumaki: uzumaki }); },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    u.jkSum -= dt; u.jkUzu -= dt;
    if (u.st.attack || u.stun > 0.3 || b.over || u.isDown()) return;
    const out = curses(u), left = b.units.filter((s) => s.reserveOf === u && s.dormant && s.def.id === 'jk_gcurse').length;
    const tgt = u.target && u.target.alive ? u.target : null;
    if (u.jkUzu <= 0 && tgt && !burntOut(u) && flat(tgt.pos, u.pos) < w.uzuRange && out.length >= w.uzuMin) {
      u.jkUzu = w.uzuCD; u.aimAt = tgt;
      castPose(u, 'jk_push', 'uzumaki');
      // the curses are drawn back into him and compressed
      for (const s of out) { const c = s.chestPos; markerAt(b, 'jk_vortex', c, 0.6, rand(0, 6)); }
      techBanner(b, 'Maximum: Uzumaki!', u.headPos);
      return;
    }
    if (u.jkSum <= 0 && out.length < w.sumMax && left > 0 && tgt && flat(tgt.pos, u.pos) < w.sumRange) {
      u.jkSum = w.sumCD;
      castPose(u, 'jk_sign', 'summon');
    }
  },
};
const curses = (u) => u.battle.units.filter((s) => s.reserveOf === u && !s.dormant && s.alive && s.def.id === 'jk_gcurse');
function releaseCurses(u) {
  const b = u.battle, w = u.def.weapon, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  for (let i = 0; i < w.sumN; i++) {
    const sd = i ? 1 : -1;
    _p.set(u.pos.x + fx * 2 - fz * sd * 1.2, 0, u.pos.z + fz * 2 + fx * sd * 1.2);
    _p.y = b.terrain.height(_p.x, _p.z);
    const s = summon(b, u, 'jk_gcurse', _p, u.heading);
    if (!s) break;
    markerAt(b, 'jk_vortex', _p.clone().setY(_p.y + 0.05), 1.0, rand(0, 6));
    s.stun = 0.3;
  }
  b.sound('magic', u.chestPos, 0.8, 0.5);
  b.sound('whoosh', u.chestPos, 0.8, 0.4);
}
function uzumaki(u) {
  const b = u.battle, w = u.def.weapon;
  const out = curses(u);
  const k = Math.max(1, out.length);
  for (const s of out) dismiss(b, s); // consumed (they can be brought out again later)
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading), c = u.chestPos;
  _o.set(c.x + fx * 1.0, c.y + 0.1, c.z + fz * 1.0);
  aimPoint(u, _p, 0.3, 0.8);
  launchVel(_o, _p, w.uzuSpeed, 0, false, 0.01, _v);
  addProjectile(b, 'jk_uzumaki', _o, _v, u, { life: w.uzuRange * 1.15 / w.uzuSpeed, damage: w.uzuDmg + w.uzuPer * k, force: w.uzuForce, k, spin: new THREE.Vector3(0, 0, 9) });
  b.sound('boom', _o, 1.1, 0.4);
  b.sound('whoosh', _o, 1.3, 0.3);
  b.emit('spark', _o.x, _o.y, _o.z, 6);
  u.rag.impulseAll(-fx * u.M * 1.2, 0, -fz * u.M * 1.2);
}
function uzuHit(b, pr, v) {
  if (!foe(pr, v) || pr.hits.has(v)) return;
  pr.hits.add(v);
  const c = v.chestPos;
  _d.copy(pr.vel).normalize();
  _v.set(c.x - pr.pos.x, 0, c.z - pr.pos.z);
  const side = _v.x * -_d.z + _v.z * _d.x >= 0 ? 1 : -1;
  _v.set(_d.x * 0.7 - _d.z * side * 0.6, 0.5, _d.z * 0.7 + _d.x * side * 0.6).normalize();
  strike(b, v, pr.damage, _v, Math.min(pr.force, v.M * 14), pr.owner, 'jk_uzumaki', PART.chest, 'crunch');
  if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 1.0 * (v.def.stagger ?? 1));
  b.emit('spark', c.x, c.y, c.z, 3);
}
function uzuEnd(b, pr) {
  if (pr.done) return;
  pr.done = true;
  blast(b, pr.pos, 2.5 + pr.k * 0.4, pr.damage * 0.4, pr.force * 0.6, pr.owner, { fx: 0, friendly: 0.3, pitch: 0.6 });
}

// ------------------------------------------------------------------ Choso
// Ranged: Convergence (blood compressed between his palms) fires Piercing Blood, a
// near-instant beam through everyone on the line. Enemies that crowd him get
// Supernova: blood orbs around him that burst.
const choso = {
  aim: true,
  init(u) { const w = u.def.weapon; u.attackDur = w.windup; u.jkNova = rand(1, 3); u.jkBeam = {}; u.jkBeamT = 0; },
  think: rangedThink,
  event(u, t0, t1) {
    if (castEvent(u, t0, t1, { nova: supernova })) return;
    const w = u.def.weapon, b = u.battle;
    if (u.st.attack !== u.anim) return;
    if (crossed(t0, t1, 0.2)) { // Convergence
      u.jkConv = markerOn(b, u, 'jk_converge', PART.chest, u.attackDur * (w.releaseAt - 0.2) + 0.05, new THREE.Vector3(0, 0, u.skel.rChest * 2.2));
      b.sound('magic', u.chestPos, 0.4, 1.5);
    }
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    if (u.jkConv) { u.jkConv.t = 0; u.jkConv = null; }
    piercingBlood(u);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) { u.jkCast = null; if (u.jkConv) { u.jkConv.t = 0; u.jkConv = null; } }
    if (u.jkBeamT > 0) {
      u.jkBeamT -= dt;
      if (u.jkBeamT <= 0 || !u.alive) endBeam(u.jkBeam);
      else refreshBeam(b, u.jkBeam, u, u.jkBA, u.jkBB, 'jk_bloodseg', 1.0);
    }
    u.jkNova -= dt;
    if (u.jkNova <= 0 && !u.st.attack && u.stun <= 0 && !u.isDown()) {
      const n = enemiesNear(u, u.pos, w.novaR * 0.8).length;
      if (n >= 2 || (n >= 1 && u.hp < u.maxHp * 0.6)) {
        u.jkNova = w.novaCD;
        castPose(u, 'jk_sign', 'nova');
        const c = u.chestPos;
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; markerAt(b, 'jk_bloodorb', _p.set(c.x + Math.sin(a) * 1.1, c.y + rand(-0.2, 0.4), c.z + Math.cos(a) * 1.1), u.attackDur * 0.55); }
      } else u.jkNova = 0.3;
    }
  },
  die(u) { endBeam(u.jkBeam); if (u.jkConv) u.jkConv.t = 0; },
};
function piercingBlood(u) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const A = new THREE.Vector3(c.x + fx * 0.6 * u.s, c.y + 0.1, c.z + fz * 0.6 * u.s);
  aimPoint(u, _p, 0.2, 0.15);
  if (!u.aimAt && u.control && !u.control.aimPt) _p.y = A.y + Math.tan(u.control.aimPitch) * 14;
  _d.copy(_p).sub(A);
  if (_d.lengthSq() < 1e-4) _d.set(fx, 0, fz);
  _d.normalize();
  _d.x += rand(-1, 1) * w.spread; _d.z += rand(-1, 1) * w.spread;
  _d.normalize();
  const B = A.clone().addScaledVector(_d, w.range);
  // stop at the ground
  for (let k = 1; k <= 24; k++) {
    _o.copy(A).addScaledVector(_d, (w.range * k) / 24);
    if (_o.y < b.terrain.height(_o.x, _o.z)) { B.copy(_o); break; }
  }
  const L = A.distanceTo(B);
  b.grid.query((A.x + B.x) / 2, (A.z + B.z) / 2, L / 2 + 2, (v) => {
    if (!foe(u, v)) return;
    const vc = v.chestPos;
    _o.copy(vc).sub(A);
    const s = clamp(_o.dot(_d), 0, L);
    _o.copy(A).addScaledVector(_d, s);
    if (_o.distanceTo(vc) > w.width + v.skel.radius) return;
    strike(b, v, w.damage, _d, Math.min(w.force, v.M * 8), u, 'jk_blood', PART.chest, 'stab');
  });
  u.jkBA = A; u.jkBB = B; u.jkBeamT = 0.22;
  refreshBeam(b, u.jkBeam, u, A, B, 'jk_bloodseg', 1.0);
  b.sound('flyby', A, 0.9, 1.6);
  b.sound('stab', A, 0.6, 0.6);
  b.emit('blood', A.x, A.y, A.z, 3, _d.x, _d.z);
}
function supernova(u) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos;
  blast(b, c, w.novaR, w.novaDmg, w.novaForce, u, { fx: -1, friendly: 0, sound: 'boom', pitch: 1.3 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; markSpin(b, 'jk_bloodburst', _p.set(c.x + Math.sin(a) * 1.4, c.y, c.z + Math.cos(a) * 1.4), 0.35); }
  b.emit('blood', c.x, c.y, c.z, 14, 0, 0);
  b.sound('stab', c, 1.0, 0.5);
}

// ------------------------------------------------------------------ Kinji Hakari
// A brawler. His domain, Idle Death Gamble, doesn't hurt: the pachinko rules are forced
// on everyone inside (a dazed moment every spin) while he spins for a JACKPOT. A jackpot
// ends the domain and for a while he regenerates faster than anything can hurt him,
// shrugs off knockdowns, hits harder and moves faster. If the domain is broken open (or
// loses a clash), the reel already spinning may still pay out.
const jackpotOn = (u) => (u.jkJack || 0) > u.battle.time;
const hakari = {
  melee: true,
  init(u) { u.jkDomCD = u.def.weapon.domFirst; u.jkJack = 0; u.jkAura = null; },
  think(u, dt, c) { return meleeThink(u, dt, jackpotOn(u) ? { ...c, spd: c.spd * u.def.weapon.jackSpeed } : c); },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (!u.st.attack) u.jkCast = null;
    const jp = jackpotOn(u);
    newVictims(u, (v) => {
      if (!jp || !v.alive) return;
      v.hit(w.damage * w.jackDmg, PART.chest, 0, 0, 0, u, 'jk_jackpot');
      const c = v.chestPos;
      b.emit('spark', c.x, c.y, c.z, 4);
    });
    if (jp) {
      u.hp = Math.min(u.maxHp, u.hp + w.jackRegen * dt);
      u.stun = Math.min(u.stun, w.jackStun); // knocked about, he is straight back up
      if (!u.jkAura) u.jkAura = markerOn(b, u, 'jk_jackpot', PART.chest, w.jackDur + 1);
      if (Math.random() < dt * 6) { const c = u.chestPos; b.emit('heal', c.x, c.y, c.z, 1); }
    } else if (u.jkAura) { u.jkAura.t = 0; u.jkAura = null; }
    if (!jp && wantDomain(u, dt)) {
      expand(u, {
        name: 'Idle Death Gamble', marker: 'jk_dom_hakari',
        sureHit(b, dom, v) {
          // the rules of the game are forced on them: a dazed moment and a rain of balls
          sureHit(v, w.domDmg, u);
          v.stun = Math.max(v.stun, w.domDaze * (v.def.stagger ?? 1));
          if (Math.random() < 0.6) {
            const c = v.headPos;
            addProjectile(b, 'jk_pball', _o.set(c.x + rand(-0.4, 0.4), c.y + 2.5, c.z + rand(-0.4, 0.4)), _v.set(0, -2, 0), u, { life: 2, damage: 0, force: 0 });
          }
        },
        step(b, dom, dt) {
          dom.data.spin = (dom.data.spin ?? 1.0) - dt;
          if (dom.data.spin > 0 || !u.alive) return;
          dom.data.spin = w.spin;
          const p = u.headPos;
          b.sound('tick', p, 0.8, 1.6);
          markerAt(b, 'jk_reel', _o.set(p.x, p.y + 1.1, p.z), w.spin * 0.8, u.heading);
          if (Math.random() < w.jackP) { jackpot(u); dom.t = 0; } // the domain ends with the payout
        },
        // broken open (or overwhelmed in a clash): the reel already spinning still pays out
        onClose(b, dom, why) {
          if ((why === 'broken' || why === 'clash') && u.alive && !jackpotOn(u) && Math.random() < w.jackP) jackpot(u, 'JACKPOT! The last spin pays out');
        },
      });
    }
  },
  hit(u, amount) {
    // during a jackpot his cursed energy rebuilds his body as fast as it breaks
    if (jackpotOn(u) && amount >= u.hp) return Math.max(0, u.hp - 1);
    return amount;
  },
  die(u) { if (u.jkAura) { u.jkAura.t = 0; u.jkAura = null; } },
};

function jackpot(u, text = 'JACKPOT!') {
  const b = u.battle, w = u.def.weapon, p = u.headPos;
  u.jkJack = b.time + w.jackDur;
  u.hp = u.maxHp;
  announce(b, text, p);
  b.sound('gong', p, 1.2, 1.2);
  b.sound('heal', p, 1.0, 0.8);
  b.voice(u, 'cheer', true);
  b.emit('heal', p.x, p.y, p.z, 12);
}

// ------------------------------------------------------------------ secrets
onSecret((b, dt) => {
  if (b.over) return;
  for (const u of b.units) {
    if (!u.alive || u.dormant) continue;
    const id = u.def.id;
    // Prison Realm: Geto (Kenjaku) and an enemy Gojo close by
    if (id === 'jk_geto' && !jk(b).secrets.has('prison') && !burntOut(u) && u.stun <= 0) {
      for (const v of b.foes(u.team)) {
        if (!isA(v, 'jk_gojo') || flat(v.pos, u.pos) > u.def.weapon.prisonR) continue;
        announce(b, 'SECRET: Prison Realm!', v.headPos, 'prison');
        seal(b, v, u.def.weapon.prisonT);
        castPose(u, 'jk_sign', null);
        b.voice(u, 'cackle', true);
        break;
      }
    }
    // Choso meets his little brother
    if (id === 'jk_choso' && !u.jkBro) {
      let near = null;
      for (const v of b.foes(u.team)) if (isA(v, 'jk_yuji') && flat(v.pos, u.pos) < u.def.weapon.broR) { near = v; break; }
      u.jkBroT = near ? (u.jkBroT || 0) + dt : 0;
      if (near && u.jkBroT > u.def.weapon.broT) {
        u.jkBro = true;
        switchTeam(b, u, near.team); // (to Yuji's side, whichever army that is)
        announce(b, 'SECRET: Big brother!', u.headPos, 'bro' + u.id);
        u.hp = u.maxHp; u.st.attack = null; u.expr = EXPR.happy;
        b.voice(u, 'cheer', true);
        b.emit('heal', u.headPos.x, u.headPos.y, u.headPos.z, 8);
      }
    }
    // Toji in (or at the wall of) an enemy domain: the sure-hit can't find him, and the
    // Inverted Spear of Heaven cuts the barrier open
    if (id === 'jk_toji') {
      let dom = null;
      for (const d of jk(b).domains) if (d.team !== u.team && flat(u.pos, d.pos) < d.R + (d.barrier ? 1.2 : 0)) { dom = d; break; }
      if (!dom) { u.jkCutT = 0; continue; }
      if (flat(u.pos, dom.pos) < dom.R) announce(b, "SECRET: Heavenly Restriction - the sure-hit can't find Toji!", u.headPos, 'toji_ce');
      u.jkCutT = (u.jkCutT || 0) + dt;
      if (u.jkCutT > u.def.weapon.cutT && dom.barrier && u.stun <= 0) {
        u.jkCutT = 0;
        const dagonDom = dom.owner.def.id === 'jk_dagon';
        announce(b, dagonDom ? "SECRET: Toji crashes Dagon's beach!" : `SECRET: The Inverted Spear of Heaven cuts ${dom.name} open!`, u.headPos);
        castPose(u, 'overhead', null);
        markSpin(b, 'jk_cut', u.chestPos, 0.4);
        closeDomain(b, dom, 'broken');
      }
    }
  }
});

// ------------------------------------------------------------------ projectiles
const PJ = {
  // a shikigami fish: homes in, bites (sure-hit fish only look the part)
  jk_fish: {
    g: 0, len: 0.4, r: 0.3, life: 3,
    step(b, pr, dt) {
      if (pr.grav) { pr.vel.y -= 9.81 * dt; return; }
      if (pr.tgt) home(pr, dt, pr.spd || 12, 3.5);
      else if (pr.aim) { _d.copy(pr.aim).sub(pr.pos).normalize().multiplyScalar(pr.spd || 12); pr.vel.lerp(_d, Math.min(1, 3 * dt)); }
      if (pr.sure && pr.tgt && pr.pos.distanceTo(pr.tgt.chestPos) < 0.6) pr.life = -1;
    },
    hit(b, pr, v) {
      if (pr.sure) return false;
      _d.copy(pr.vel).normalize();
      strike(b, v, pr.damage, _d, pr.force, pr.owner, 'jk_fish', PART.chest, 'crunch');
      return true;
    },
    ground(b, pr) { markerAt(b, 'jk_splash', pr.pos, 0.45, rand(0, 6)); b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 0.6); return true; },
  },
  // Ember Insects: flame bugs that home in and burst
  jk_ember: {
    g: 0, len: 0.3, r: 0.25, life: 3,
    step(b, pr, dt) {
      if (pr.tgt) home(pr, dt, pr.spd || 13, 3);
      else if (pr.aim) { _d.copy(pr.aim).sub(pr.pos).normalize().multiplyScalar(pr.spd || 13); pr.vel.lerp(_d, Math.min(1, 3 * dt)); }
      if (Math.random() < dt * 25) b.emit('trail', pr.pos.x, pr.pos.y, pr.pos.z, Math.random() < 0.5 ? 1 : 0);
    },
    hit(b, pr, v) { emberBurst(b, pr); return true; },
    ground(b, pr) { emberBurst(b, pr); return true; },
  },
  jk_meteor: {
    g: 0, len: 0, r: 1.2, life: 6,
    step(b, pr) { if (Math.random() < 0.8) b.emit('trail', pr.pos.x + rand(-1, 1), pr.pos.y + rand(-1, 1), pr.pos.z + rand(-1, 1), Math.random() < 0.5 ? 1 : 0); },
    hit(b, pr) { meteorImpact(b, pr); return true; },
    ground(b, pr) { meteorImpact(b, pr); return true; },
  },
  // Hanami's wooden ball
  jk_seed: {
    g: 4, len: 0, r: 0.25, life: 3,
    hit(b, pr, v) {
      _d.copy(pr.vel).normalize(); _d.y = Math.max(_d.y, 0) + 0.3; _d.normalize();
      strike(b, v, pr.damage, _d, Math.min(pr.force, v.M * 10), pr.owner, 'jk_seed', PART.chest, 'thud');
      if (v.parriedAt !== b.time) v.stun = Math.max(v.stun, 0.5 * (v.def.stagger ?? 1));
      b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 1);
      return true;
    },
    ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 1.5); b.sound('thump', pr.pos, 0.6, 0.8); return true; },
  },
  // Maximum: Uzumaki - a swirling black spiral that ploughs a line, then bursts
  jk_uzumaki: {
    g: 0, len: 0, r: 1.0, life: 2,
    step(b, pr) {
      const R = 1.1 + (pr.k || 1) * 0.1;
      b.grid.query(pr.pos.x, pr.pos.z, R + 2, (v) => {
        if (!foe(pr, v) || pr.hits.has(v)) return;
        const c = v.chestPos;
        _o.copy(c).sub(pr.prev); _v.copy(pr.pos).sub(pr.prev);
        const L2 = _v.lengthSq(), k = L2 > 1e-9 ? clamp(_o.dot(_v) / L2, 0, 1) : 0;
        _o.copy(pr.prev).addScaledVector(_v, k);
        if (_o.distanceTo(c) < R + v.skel.radius) uzuHit(b, pr, v);
      });
      if (Math.random() < 0.6) b.emit('dust', pr.pos.x + rand(-0.5, 0.5), b.terrain.height(pr.pos.x, pr.pos.z), pr.pos.z + rand(-0.5, 0.5), 0.6);
      if (pr.life <= 0) uzuEnd(b, pr);
    },
    hit(b, pr, v) { uzuHit(b, pr, v); return false; },
    ground(b, pr) { uzuEnd(b, pr); return true; },
  },
  // a pachinko ball falling in Idle Death Gamble (just for show)
  jk_pball: { g: 9.81, len: 0, r: 0.08, life: 2, hit: () => false, ground: (b, pr) => { b.sound('click', pr.pos, 0.3, 2); return true; } },
  // markers
  jk_cut: { g: 0, len: 0, r: 0, life: 1 },
  jk_cloud: { g: 0, len: 0, r: 0, life: 1 },
  jk_splash: { g: 0, len: 0, r: 0, life: 1 },
  jk_soul: { g: 0, len: 0, r: 0, life: 1 },
  jk_soulfail: { g: 0, len: 0, r: 0, life: 1 },
  jk_lava: { g: 0, len: 0, r: 0, life: 1 },
  jk_crater: { g: 0, len: 0, r: 0, life: 1 },
  jk_roots: { g: 0, len: 0, r: 0, life: 1 },
  jk_flowers: { g: 0, len: 0, r: 0, life: 1 },
  jk_vortex: { g: 0, len: 0, r: 0, life: 1 },
  jk_converge: { g: 0, len: 0, r: 0, life: 1 },
  jk_bloodseg: { g: 0, len: 0, r: 0, life: 1 },
  jk_bloodorb: { g: 0, len: 0, r: 0, life: 1 },
  jk_bloodburst: { g: 0, len: 0, r: 0, life: 1 },
  jk_jackpot: { g: 0, len: 0, r: 0, life: 1 },
  jk_reel: { g: 0, len: 0, r: 0, life: 1 },
  jk_dom_dagon: { g: 0, len: 0, r: 0, life: 1 },
  jk_dom_mahito: { g: 0, len: 0, r: 0, life: 1 },
  jk_dom_jogo: { g: 0, len: 0, r: 0, life: 1 },
  jk_dom_hakari: { g: 0, len: 0, r: 0, life: 1 },
};
function emberBurst(b, pr) {
  const o = pr.owner, w = o?.def.weapon;
  blast(b, pr.pos, w?.emberR ?? 1.3, pr.damage, pr.force, o, { fx: 2, friendly: 0.25, vol: 0.5, pitch: 1.4, onUnit: (v) => addStatus(b, v, 'burn', 3, w?.emberBurn ?? 6, o) });
}

// ------------------------------------------------------------------ units
const CURSE = { aggro: 1, bravery: 0, voice: 0.7, chatter: 0.8, cry: 'cackle', idle: 'shift' };
const units = [
  {
    id: 'jk_toji', name: 'Toji Fushiguro', faction: FAC, side: 'curse', cost: 1400, hp: 950, speed: 7.4,
    build: { scale: 1.08, girth: 1.0, arms: 1.05, armThick: 1.15, legs: 1.04 },
    weapon: {
      line: 'Assassin · Inverted Spear of Heaven cuts through Infinity · Playful Cloud flurry · no cursed energy: sure-hits miss him',
      kind: 'jk_toji', style: 'sword', anim: 'overhead', item: 'jk_isoh', damage: 70, reach: 1.1, cooldown: 0.5, force: 420,
      dashCD: 1.6, dashV: 8, pcCD: 6.5, pcDur: 0.95, pcR: 2.9, pcDmg: 48, pcForce: 900, cutT: 1.6,
    },
    look: { skin: '#e8b48c', hat: 'jk_toji_hair', top: 'jk_toji', legs: '#ece6d6', accent: '#24222c' },
    personality: { aggro: 1, bravery: 0, voice: 0.85, chatter: 0.35, cry: 'roar', idle: 'brace' },
    armor: 0.1, stagger: 0.2,
    desc: 'The Sorcerer Killer. No cursed energy at all: just speed, strength and a worm full of weapons.',
  },
  {
    id: 'jk_dagon', name: 'Dagon', faction: FAC, side: 'curse', cost: 1050, hp: 1200, speed: 3.7,
    build: { scale: 1.32, girth: 1.3, head: 1.5, legs: 0.85, arms: 1.0, mass: 1.35 },
    weapon: {
      line: 'Curse · shikigami fish swarms · Domain: Horizon of the Captivating Skandha (sure-hit fish)',
      kind: 'jk_dagon', style: 'none', anim: 'cast', item: 'none', damage: 15, speed: 12, range: 19, minRange: 5, cooldown: 3.2, force: 90,
      windup: 0.9, releaseAt: 0.6, fish: 6,
      domR: DOM_R.dagon, domDur: 7, domPow: 6, domTick: 0.5, domDmg: 14, domCD: 22, domFirst: 6, domMin: 4,
    },
    look: { skin: '#d9542a', hat: 'jk_dagon_head', top: 'jk_dagon', legs: '#c24a24', accent: '#a83a1a' },
    personality: { ...CURSE, aggro: 0.5, voice: 0.55, chatter: 0.4, cry: 'roar', idle: 'regal' },
    armor: 0.1, stagger: 0.3,
    desc: 'A sea of shikigami fish at its beck and call. In its domain the fish always find you.',
  },
  {
    id: 'jk_mahito', name: 'Mahito', faction: FAC, side: 'curse', cost: 850, hp: 470, speed: 5.4,
    build: { scale: 0.98, girth: 0.9, arms: 1.06 },
    weapon: {
      line: 'Curse · Idle Transfiguration: his touch reshapes souls · Domain: Self-Embodiment of Perfection',
      kind: 'jk_mahito', style: 'none', anim: 'punch', item: 'jk_palm', damage: 26, reach: 0.9, cooldown: 0.75, force: 220,
      tfDmg: 42, tfAt: 0.3, regen: 9,
      domR: DOM_R.mahito, domDur: 4.5, domPow: 7, domTick: 0.6, domDmg: 34, domCD: 24, domFirst: 6, domMin: 4,
    },
    reserve: [{ type: 'jk_transfig', n: 5 }],
    look: { skin: '#e2d8cf', hat: 'jk_mahito_hair', top: 'jk_mahito', legs: '#3b4152', accent: '#d8c8bc' },
    personality: { aggro: 0.95, bravery: 0, voice: 1.1, chatter: 1, cry: 'cackle', idle: 'bounce' },
    stagger: 0.4,
    desc: 'Touches your soul and kneads it into something new. Patches himself up the same way.',
  },
  {
    id: 'jk_jogo', name: 'Jogo', faction: FAC, side: 'curse', cost: 1250, hp: 430, speed: 4.5,
    build: { scale: 0.86, girth: 1.12, head: 1.3, legs: 0.82 },
    weapon: {
      line: 'Curse · Ember Insects · Maximum: Meteor · Domain: Coffin of the Iron Mountain',
      kind: 'jk_jogo', style: 'none', anim: 'cast', item: 'none', damage: 20, speed: 13, range: 20, minRange: 6, cooldown: 3.0, force: 160,
      windup: 0.8, releaseAt: 0.62, embers: 4, emberR: 1.3, emberBurn: 6,
      metCD: 15, metFirst: 6, metRange: 24, metMin: 3, metDmg: 170, metForce: 1300, metR: 4.6, metSpeed: 24, metBurn: 10,
      domR: DOM_R.jogo, domDur: 6, domPow: 6, domTick: 0.5, domDmg: 12, domBurn: 14, domCD: 22, domFirst: 8, domMin: 4,
    },
    look: { skin: '#ebdfc6', hat: 'jk_jogo_head', top: 'jk_jogo', legs: '#3a2c28', accent: '#241a16' },
    personality: { ...CURSE, aggro: 0.55, voice: 1.25, chatter: 1, cry: 'cackle', idle: 'shift' },
    armor: 0.05,
    desc: 'Short temper, shorter fuse. Insects of fire, and when that bores him, a meteor.',
  },
  {
    id: 'jk_hanami', name: 'Hanami', faction: FAC, side: 'curse', cost: 1150, hp: 1000, speed: 4.3,
    build: { scale: 1.2, girth: 1.15, head: 1.08, arms: 1.15, armThick: 1.2, mass: 1.25 },
    weapon: {
      line: 'Curse · wooden fists, wooden balls, roots out of the ground · a flower field that saps',
      kind: 'jk_hanami', style: 'none', anim: 'punch', item: 'jk_woodfist', damage: 42, reach: 1.0, cooldown: 1.0, force: 480,
      seedCD: 2.8, seedRange: 16, seedSpeed: 17, seedDmg: 40, seedForce: 380,
      rootCD: 7, rootRange: 12, rootR: 1.8, rootDmg: 46, rootUp: 6, rootStun: 1.2,
      fieldCD: 13, fieldFirst: 3, fieldR: 5, fieldDur: 6, fieldSap: 9, fieldHeal: 0.6,
    },
    look: { skin: '#e8e4da', hat: 'jk_hanami_head', top: 'jk_hanami', legs: '#e2ddd0', accent: '#5e5040' },
    personality: { ...CURSE, aggro: 0.8, voice: 0.6, chatter: 0.3, cry: 'roar', idle: 'brace' },
    armor: 0.22, stagger: 0.35,
    desc: 'A curse of the forest. Calm, polite, and made of very hard wood.',
  },
  {
    id: 'jk_geto', name: 'Suguru Geto (Kenjaku)', faction: FAC, side: 'curse', cost: 700, hp: 650, speed: 4.7,
    build: { scale: 1.08, girth: 0.98, legs: 1.05 },
    weapon: {
      line: 'Summoner · Cursed Spirit Manipulation releases his stored curses · Maximum: Uzumaki',
      kind: 'jk_geto', style: 'jk_sleeves', anim: 'punch', item: 'jk_palm', damage: 30, reach: 0.9, cooldown: 0.9, force: 300, keep: 6,
      sumCD: 3.5, sumN: 2, sumMax: 4, sumRange: 26,
      uzuCD: 14, uzuFirst: 9, uzuMin: 2, uzuRange: 16, uzuSpeed: 15, uzuDmg: 70, uzuPer: 35, uzuForce: 1100,
      prisonR: 10, prisonT: 15,
    },
    reserve: [{ type: 'jk_gcurse', n: 6 }],
    look: { skin: '#eccaaa', hat: 'jk_geto_hair', top: 'jk_geto', legs: '#1c1c24', accent: '#141418' },
    personality: { aggro: 0.5, bravery: 0, voice: 0.95, chatter: 0.7, cry: 'royal', idle: 'regal' },
    stagger: 0.7,
    desc: 'Swallows curses and lets them out again. Mind the stitches across his forehead.',
  },
  {
    id: 'jk_choso', name: 'Choso', faction: FAC, side: 'curse', cost: 800, hp: 520, speed: 4.8,
    build: { scale: 1.02, girth: 0.95 },
    weapon: {
      line: 'Ranged · Blood Manipulation: Convergence, Piercing Blood (pierces a line), Supernova',
      kind: 'jk_choso', style: 'jk_blood', anim: 'jk_push', item: 'none', damage: 70, range: 22, minRange: 5, cooldown: 3.2, force: 260,
      windup: 1.0, releaseAt: 0.62, width: 0.45, spread: 0.03,
      novaCD: 6, novaR: 3.4, novaDmg: 70, novaForce: 520,
      broR: 7, broT: 1.5,
    },
    look: { skin: '#e9c6aa', hat: 'jk_choso_hair', top: 'jk_choso', legs: '#2a2630', accent: '#1d1a20' },
    personality: { aggro: 0.35, bravery: 0, voice: 0.9, chatter: 0.4, cry: 'hey', idle: 'lean' },
    stagger: 0.6,
    desc: 'The eldest of the Death Painting brothers. His blood flies faster than a bullet.',
  },
  {
    id: 'jk_hakari', name: 'Kinji Hakari', faction: FAC, side: 'sorcerer', cost: 1500, hp: 900, speed: 5.4,
    build: { scale: 1.07, girth: 1.05, armThick: 1.15 },
    weapon: {
      line: 'Brawler · Domain: Idle Death Gamble - hit the JACKPOT and he is all but immortal',
      kind: 'jk_hakari', style: 'fists', anim: 'punch', item: 'jk_fist', damage: 55, reach: 1.0, cooldown: 0.62, force: 400,
      domR: DOM_R.hakari, domDur: 8, domPow: 8, domTick: 0.7, domDmg: 3, domDaze: 0.5, domCD: 18, domFirst: 1.5, domMin: 1,
      spin: 0.7, jackP: 0.3, jackDur: 20, jackRegen: 200, jackDmg: 1.3, jackSpeed: 1.25, jackStun: 0.25,
    },
    look: { skin: '#e6c0a0', hat: 'jk_hakari_hair', top: 'jk_hakari', legs: '#1c1c22', accent: '#141418' },
    personality: { aggro: 1, bravery: 0, voice: 1.0, chatter: 1, cry: 'charge', idle: 'bounce' },
    stagger: 0.3,
    desc: 'Lives for the gamble. When the jackpot hits, nothing can put him down.',
  },
  {
    id: 'jk_flyhead', name: 'Fly Head', faction: FAC, side: 'curse', cost: 22, hp: 58, speed: 5.9,
    build: { scale: 0.7, girth: 1.0, head: 1.9, legs: 0.85, arms: 0.85 },
    weapon: { line: 'Swarm · a low-grade curse, comes in clouds', kind: 'melee', style: 'none', anim: 'punch', item: 'jj_claw', damage: 17, reach: 0.8, cooldown: 0.7, force: 140 },
    look: { skin: '#3a3836', hat: 'jk_flyhead', top: 'jk_fly', legs: '#2a2a30', accent: '#1a1a1a' },
    personality: { ...CURSE, voice: 1.9, chatter: 1, idle: 'hop' },
    desc: 'Buzz. Bite. Buzz.',
  },
  // summons (no tab, no cost: they come out of Geto and Mahito)
  {
    id: 'jk_gcurse', name: 'Stored Curse', faction: SUMMON, cost: 0, hp: 170, speed: 5.1,
    build: { scale: 1.05, girth: 1.4, head: 1.5, legs: 0.7, arms: 1.1, mass: 1.1 },
    weapon: { line: "Summon · one of Geto's curses", kind: 'melee', style: 'none', anim: 'punch', item: 'jj_claw', damage: 30, reach: 0.95, cooldown: 0.8, force: 260 },
    look: { skin: '#7c8a6a', hat: 'jk_curse_head', top: 'jk_gcurse', legs: '#5e6a50', accent: '#3a4232' },
    personality: { ...CURSE, voice: 0.6, cry: 'roar' },
    desc: 'Swallowed, stored, and let out to fight.',
  },
  {
    id: 'jk_transfig', name: 'Transfigured Human', faction: SUMMON, cost: 0, hp: 75, speed: 4.7,
    build: { scale: 0.95, girth: 1.1, head: 1.25, arms: 1.3, legs: 0.9 },
    weapon: { line: 'Summon · a soul Mahito reshaped', kind: 'melee', style: 'none', anim: 'punch', item: 'jj_claw', damage: 18, reach: 0.95, cooldown: 0.8, force: 180 },
    look: { skin: '#cbbfb4', hat: 'jk_tf_head', top: 'jk_tf', legs: '#8a8078', accent: '#6a6058' },
    personality: { ...CURSE, voice: 1.3, cry: 'cackle', idle: 'hop' },
    desc: 'It used to be somebody.',
  },
];

// ------------------------------------------------------------------ visuals
// spiky hair: n cones from the scalp (fanned over the top and back of the head)
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
// a row of stitches: a dark line from a to b with small cross ticks
function stitches(H, g, a, b, w, m, ticks = 4) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
  const line = H.mesh(H.box(L, w, w * 0.6), m, mid.x, mid.y, mid.z, g); line.quaternion.copy(q);
  for (let i = 0; i < ticks; i++) {
    const p = A.clone().lerp(B, (i + 0.5) / ticks);
    const t = H.mesh(H.box(w * 0.8, w * 3.2, w * 0.6), m, p.x, p.y, p.z, g); t.quaternion.copy(q);
  }
}
// a point on the head sphere (unit-frame direction), for face details
const onHead = (r, x, y, k = 1.0) => { const z = Math.sqrt(Math.max(0.02, 1 - x * x - y * y)); return [x * r * k, y * r * k, z * r * k]; };
const ns = (m) => { m.castShadow = false; return m; };

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal } = H;
  if (name === 'jk_isoh') { // the Inverted Spear of Heaven: a straight blade with a side prong, round guard, chain
    const steel = mat('#c8ccd4', { spec: 1 }), dark = mat('#2a2830', { spec: 0.4 });
    mesh(cyl(0.024 * s, 0.028 * s, 0.17 * s, 8), mat('#3a2c26'), 0, 0.02 * s, 0, g); // grip
    for (const y of [-0.03, 0.02, 0.07]) mesh(cyl(0.03 * s, 0.03 * s, 0.012 * s, 8), mat('#d8cfb8'), 0, y * s, 0, g); // wrap
    mesh(cyl(0.065 * s, 0.065 * s, 0.022 * s, 14), dark, 0, 0.115 * s, 0, g); // round guard
    const bl = mesh(box(0.016 * s, 0.5 * s, 0.07 * s), steel, 0, 0.37 * s, 0, g); void bl;
    const tip = mesh(cone(0.05 * s, 0.13 * s, 4), steel, 0, 0.68 * s, 0, g); tip.scale.set(0.35, 1, 1);
    const pr = mesh(box(0.014 * s, 0.16 * s, 0.03 * s), steel, 0, 0.2 * s, 0.06 * s, g); pr.rotation.x = -0.45; // side prong
    mesh(box(0.018 * s, 0.22 * s, 0.012 * s), mat('#8a9098', { spec: 0.8 }), 0, 0.35 * s, 0.03 * s, g); // fuller
    // a short length of chain from the pommel, and a team tassel
    for (let i = 0; i < 4; i++) { const l = mesh(torus(H, 0.022 * s, 0.006 * s, Math.PI * 2, 8), dark, 0, -0.09 * s - i * 0.035 * s, 0.01 * s * i, g); l.rotation.y = i % 2 ? Math.PI / 2 : 0; }
    mesh(cone(0.03 * s, 0.1 * s, 6), tcol(H, team), 0, -0.1 * s, -0.03 * s, g).rotation.x = 2.6;
    return true;
  }
  if (name === 'jk_palm') { // an open hand of cursed energy (Mahito's touch, Geto's palm)
    ns(mesh(octa(0.07 * s), mat('#9adfe0', { emit: 0.9, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0.03 * s, 0.03 * s, g));
    return true;
  }
  if (name === 'jk_fist') { // knuckle tape
    mesh(cyl(0.07 * s, 0.07 * s, 0.06 * s, 10), mat('#f2efe6'), 0, -0.02 * s, 0, g);
    return true;
  }
  if (name === 'jk_woodfist') { // a fist of bark and knots
    const bark = mat('#7a5a3a', { spec: 0.05 });
    mesh(sphere(0.1 * s, 8, 6), bark, 0, 0.02 * s, 0.01 * s, g).scale.set(1, 0.9, 1.1);
    for (let i = 0; i < 3; i++) mesh(cone(0.025 * s, 0.07 * s, 4), bark, (i - 1) * 0.05 * s, 0.09 * s, 0.03 * s, g);
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team);
  switch (kind) {
    case 'jk_toji_hair': { // short messy black hair falling over the brow; the scar at the mouth
      const hair = mat('#141218', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.08, 0.4, -0.25);
      spikes(H, g, r, hair, 15, 0.45, -0.15, 0.9, 0.5);
      // bangs: messy locks over the forehead
      for (const [x, ang, L] of [[-0.42, 0.35, 0.55], [-0.15, 0.1, 0.62], [0.12, -0.15, 0.58], [0.38, -0.35, 0.5], [0.6, -0.6, 0.42], [-0.62, 0.6, 0.42]]) {
        const p = onHead(r, x, 0.62, 1.02);
        lock(H, g, hair, p, [ang * 0.6, -1, 0.55], r * 0.17, r * L);
      }
      for (const sd of [-1, 1]) lock(H, g, hair, onHead(r, sd * 0.88, 0.25, 1.0), [sd * 0.3, -1, 0.1], r * 0.14, r * 0.45); // sideburn locks
      // the scar at the right corner of his mouth
      const scar = mat('#c88a82');
      const p = onHead(r, -0.27, -0.33, 1.01);
      const sc = mesh(box(r * 0.05, r * 0.24, r * 0.04), scar, p[0], p[1], p[2], g); sc.rotation.set(-0.3, -0.3, 0.25);
      return true;
    }
    case 'jk_dagon_head': { // an octopus head: a tall bulbous mantle, round eyes, tentacles round the mouth
      g.userData.hidesFace = true;
      const skin = mat('#d9542a', { spec: 0.3 }), spot = mat('#a8341a'), pale = mat('#f2a070');
      const mantle = mesh(sphere(r * 1.12, 18, 14), skin, 0, r * 0.75, -r * 0.35, g); mantle.scale.set(1, 1.45, 1.15);
      for (const [x, y, z, k] of [[0.55, 1.25, 0.35, 0.16], [-0.45, 1.55, 0.25, 0.13], [0.25, 1.85, -0.2, 0.12], [-0.85, 1.0, -0.2, 0.14], [0.9, 0.7, -0.5, 0.12], [-0.15, 1.2, 0.72, 0.1]]) { const n = new THREE.Vector3(x, (y - 0.75) / 1.45, (z + 0.35) / 1.15).normalize(); mesh(sphere(r * k, 8, 6), spot, n.x * r * 1.12, r * 0.75 + n.y * r * 1.12 * 1.45, -r * 0.35 + n.z * r * 1.12 * 1.15, g).scale.set(1, 1, 1); }
      for (const sd of [-1, 1]) { // big round eyes with a slit pupil
        const p = onHead(r, sd * 0.42, 0.12, 1.0);
        mesh(sphere(r * 0.26, 12, 10), mat('#f6e9a0'), p[0], p[1], p[2] - r * 0.05, g);
        mesh(box(r * 0.22, r * 0.08, r * 0.06), mat('#141010'), p[0], p[1], p[2] + r * 0.19, g);
        const lid = mesh(torus(H, r * 0.26, r * 0.05, Math.PI, 12), skin, p[0], p[1] + r * 0.02, p[2] - r * 0.02, g); lid.rotation.y = sd * 0.35;
      }
      // a round puckered mouth
      const mp = onHead(r, 0, -0.35, 1.0);
      mesh(torus(H, r * 0.14, r * 0.07, Math.PI * 2, 12), pale, mp[0], mp[1], mp[2], g);
      mesh(sphere(r * 0.1, 8, 6), mat('#4a1410'), mp[0], mp[1], mp[2] - r * 0.02, g);
      // tentacles hanging round the mouth like a beard, curling up at the tips
      for (let i = 0; i < 8; i++) {
        const a = -1.25 + (i / 7) * 2.5, x = Math.sin(a) * r * 0.72, z = Math.cos(a) * r * 0.7;
        const L = r * (0.5 + (i % 3) * 0.18), cx = (i % 2 ? 1 : -1) * r * 0.12;
        mesh(tube(H, `dg${i}:${r.toFixed(3)}`, [[x, -r * 0.45, z], [x * 1.25, -r * 0.85, z * 1.3 + r * 0.2], [x * 1.3 + cx, -r * 0.95 - L, z * 1.35 + r * 0.32], [x * 1.25 + cx, -r * 1.05 - L, z * 1.5 + r * 0.5]], r * 0.15, r * 0.05, 10), skin, 0, 0, 0, g);
      }
      return true;
    }
    case 'jk_mahito_hair': { // long grey-blue hair parted over the brow; stitched patchwork face
      const hair = mat('#8fa6bd', { spec: 0.25 });
      hairCap(H, g, r, hair, 1.08, 0.42, -0.2);
      const back = mesh(sphere(r * 1.12, 14, 10), hair, 0, -r * 0.45, -r * 0.35, g); back.scale.set(1.1, 1.5, 0.85);
      for (const sd of [-1, 1]) {
        for (const [x, z, L, a] of [[0.95, 0.15, 1.9, 0.12], [0.8, -0.35, 2.0, 0.2], [0.55, -0.75, 1.9, 0.1], [0.75, 0.45, 1.4, 0.05]]) lock(H, g, hair, [sd * x * r, r * 0.45, z * r], [sd * a, -1, z > 0.3 ? 0.1 : -0.1], r * 0.28, r * L); // long locks to the shoulders
        lock(H, g, hair, onHead(r, sd * 0.2, 0.7, 1.03), [sd * 0.95, -0.5, 0.35], r * 0.22, r * 0.85); // parted fringe
      }
      // patches of skin in another shade, stitched on
      const patch = mat('#c9c0b8', { spec: 0.15 }), st = mat('#3a3038');
      mesh(H.geo('mh-patch' + r.toFixed(3), () => new THREE.SphereGeometry(r * 1.006, 12, 8, 0.25, 0.75, 1.15, 0.85)), patch, 0, 0, 0, g);
      stitches(H, g, onHead(r, -0.75, 0.0, 1.03), onHead(r, 0.75, -0.02, 1.03), r * 0.035, st, 6); // across the nose
      stitches(H, g, onHead(r, 0.38, 0.55, 1.03), onHead(r, 0.38, -0.6, 1.03), r * 0.035, st, 5); // down through his left eye
      stitches(H, g, onHead(r, -0.55, -0.2, 1.03), onHead(r, -0.25, -0.7, 1.03), r * 0.03, st, 3);
      return true;
    }
    case 'jk_jogo_head': { // a volcano for a head, one big eye, black-lipped grin
      g.userData.hidesFace = true;
      const skin = mat('#ebdfc6', { spec: 0.2 }), rock = mat('#4a3a32', { spec: 0.1 }), ink = mat('#141010');
      // the cone of the volcano rising from the skull
      const H0 = r * 1.5, yb = r * 0.25, R0 = r * 0.98, R1 = r * 0.42;
      mesh(cyl(R1, R0, H0, 18), skin, 0, yb + H0 / 2, -r * 0.04, g);
      mesh(cyl(R1 * 1.06, R1 * 1.15, r * 0.25, 14), rock, 0, yb + H0 - r * 0.1, -r * 0.04, g); // dark crater rim
      ns(mesh(torus(H, R1 * 0.95, r * 0.07, Math.PI * 2, 16), glow('#ff7a20'), 0, yb + H0 + r * 0.03, -r * 0.04, g)).rotation.x = Math.PI / 2;
      ns(mesh(cyl(R1 * 0.85, R1 * 0.85, r * 0.04, 16), glow('#ff5a10'), 0, yb + H0 + r * 0.01, -r * 0.04, g)); // lava
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const c = mesh(cone(r * 0.12, r * 0.28, 4), rock, Math.sin(a) * R1 * 1.1, yb + H0 + r * 0.06, Math.cos(a) * R1 * 1.1 - r * 0.04, g); c.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); }
      for (let i = 0; i < 3; i++) ns(mesh(sphere(r * (0.3 + i * 0.1), 8, 6), mat('#5e5650', { transparent: true, opacity: 0.6 - i * 0.15, depthWrite: false }), r * 0.12 * i, yb + H0 + r * (0.35 + i * 0.42), -r * 0.15 * i, g));
      for (let i = 0; i < 5; i++) { // lava trickling down the cone
        const a = 0.5 + i * 1.25, k = 0.35 + (i % 2) * 0.2, y = yb + H0 * (1 - k * 0.5), rr = R1 + (R0 - R1) * (k * 0.5);
        const t = ns(mesh(box(r * 0.08, H0 * k, r * 0.05), glow('#ff8a20'), Math.sin(a) * rr * 1.02, y, Math.cos(a) * rr * 1.02 - r * 0.04, g)); t.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
      }
      // the single eye
      const ep = onHead(r, 0, 0.08, 1.0);
      mesh(sphere(r * 0.4, 14, 12), mat('#fbf6ea'), ep[0], ep[1], ep[2] - r * 0.15, g).scale.set(1.15, 0.9, 0.7);
      mesh(sphere(r * 0.17, 10, 8), mat('#1a1414'), ep[0], ep[1] - r * 0.02, ep[2] + r * 0.1, g);
      mesh(sphere(r * 0.05, 6, 5), mat('#ffffff'), ep[0] + r * 0.05, ep[1] + r * 0.04, ep[2] + r * 0.2, g);
      const lid = mesh(torus(H, r * 0.4, r * 0.05, Math.PI, 14), ink, ep[0], ep[1] + r * 0.03, ep[2] - r * 0.12, g); lid.scale.set(1.12, 1, 1);
      for (const sd of [-1, 1]) { const m = mesh(box(r * 0.05, r * 0.32, r * 0.04), ink, sd * r * 0.32, -r * 0.22, r * 0.9, g); m.rotation.z = sd * 0.25; } // the marks under the eye
      // a black-lipped mouth with teeth
      const mp = onHead(r, 0, -0.52, 1.0);
      mesh(box(r * 0.62, r * 0.16, r * 0.1), ink, mp[0], mp[1], mp[2] - r * 0.02, g);
      for (let i = -2; i <= 2; i++) mesh(box(r * 0.08, r * 0.08, r * 0.05), mat('#f4efe0'), i * r * 0.11, mp[1] + r * 0.02, mp[2] + r * 0.03, g);
      return true;
    }
    case 'jk_hanami_head': { // white face, black markings, branches growing out of the eye sockets
      g.userData.hidesFace = true;
      const ink = mat('#1c1a1c'), bark = mat('#6e5034', { spec: 0.05 }), leaf = mat('#5aa040'), bloom = mat('#f4a8c8');
      const cap = mesh(dome(H, r * 1.03, 0.3), mat('#2a2628'), 0, r * 0.05, 0, g); cap.rotation.x = -0.15; // dark crown
      for (const sd of [-1, 1]) {
        // a black stripe from the crown down each side of the face
        const st = mesh(box(r * 0.12, r * 0.95, r * 0.05), ink, sd * r * 0.28, r * 0.15, r * 0.93, g); st.rotation.set(-0.2, sd * 0.25, 0);
        const p = onHead(r, sd * 0.38, 0.12, 1.0);
        mesh(sphere(r * 0.17, 10, 8), ink, p[0], p[1], p[2] - r * 0.06, g); // the socket
        // the branch: out of the socket, forward and up, forking
        const pts = [[p[0], p[1], p[2] - r * 0.05], [p[0] + sd * r * 0.3, p[1] + r * 0.3, p[2] + r * 0.55], [p[0] + sd * r * 0.7, p[1] + r * 1.0, p[2] + r * 0.7], [p[0] + sd * r * 0.85, p[1] + r * 1.75, p[2] + r * 0.5]];
        mesh(tube(H, `hn${sd}:${r.toFixed(3)}`, pts, r * 0.16, r * 0.05, 10), bark, 0, 0, 0, g);
        mesh(tube(H, `hnf${sd}:${r.toFixed(3)}`, [pts[1], [pts[1][0] + sd * r * 0.6, pts[1][1] + r * 0.45, pts[1][2] + r * 0.3], [pts[1][0] + sd * r * 1.05, pts[1][1] + r * 0.75, pts[1][2] + r * 0.05]], r * 0.09, r * 0.03, 6), bark, 0, 0, 0, g);
        for (const [x, y, z, m] of [[0.85, 1.75, 0.5, leaf], [0.7, 1.0, 0.7, bloom], [1.05, 1.2, 0.35, leaf], [0.45, 0.6, 0.9, leaf], [0.95, 1.55, 0.75, bloom], [1.3, 1.05, 0.2, leaf], [0.6, 1.35, 0.3, leaf]]) {
          const lf = mesh(H.octa(r * 0.17), m, p[0] + sd * x * r, p[1] + y * r - r * 0.12, p[2] + z * r * 0.6, g); lf.scale.set(1, 0.5, 1.4); lf.rotation.y = sd * x;
        }
      }
      // a thin, closed mouth
      const mp = onHead(r, 0, -0.45, 1.0);
      mesh(box(r * 0.4, r * 0.04, r * 0.04), ink, mp[0], mp[1], mp[2], g);
      return true;
    }
    case 'jk_geto_hair': { // black hair in a bun, one long lock hanging over the brow, stitches across the forehead, big earrings
      const hair = mat('#16141a', { spec: 0.25 });
      hairCap(H, g, r, hair, 1.07, 0.38, -0.3);
      const bun = mesh(sphere(r * 0.42, 12, 10), hair, 0, r * 0.82, -r * 0.6, g); bun.scale.set(1.1, 0.9, 1);
      mesh(cyl(r * 0.2, r * 0.3, r * 0.2, 10), hair, 0, r * 0.62, -r * 0.45, g).rotation.x = -0.9;
      mesh(torus(H, r * 0.22, r * 0.05, Math.PI * 2, 10), tc, 0, r * 0.68, -r * 0.52, g).rotation.x = 0.7; // team hair tie
      // the long fringe lock on his right, down past the eye
      mesh(tube(H, 'gt' + r.toFixed(3), [[-r * 0.2, r * 0.85, r * 0.55], [-r * 0.45, r * 0.55, r * 0.95], [-r * 0.55, r * 0.0, r * 1.0], [-r * 0.6, -r * 0.45, r * 0.85]], r * 0.13, r * 0.05, 10), hair, 0, 0, 0, g);
      // Kenjaku's stitches across the forehead
      stitches(H, g, onHead(r, -0.62, 0.5, 1.03), onHead(r, 0.62, 0.5, 1.03), r * 0.04, mat('#5a1e22'), 7);
      for (const sd of [-1, 1]) { // stretched lobes with big plugs
        const e = mesh(cyl(r * 0.16, r * 0.16, r * 0.06, 12), mat('#1a1a1a', { spec: 0.6 }), sd * r * 1.0, -r * 0.18, -r * 0.02, g); e.rotation.z = Math.PI / 2;
        mesh(torus(H, r * 0.16, r * 0.035, Math.PI * 2, 12), mat('#c8a040', { spec: 1 }), sd * r * 1.02, -r * 0.18, -r * 0.02, g).rotation.y = Math.PI / 2;
      }
      return true;
    }
    case 'jk_choso_hair': { // black hair tied into two spiky tufts, the dark band across his nose
      const hair = mat('#141216', { spec: 0.2 });
      hairCap(H, g, r, hair, 1.07, 0.38, -0.3);
      for (const sd of [-1, 1]) {
        mesh(cyl(r * 0.14, r * 0.14, r * 0.1, 10), mat('#2a1a22'), sd * r * 0.55, r * 0.95, -r * 0.05, g).rotation.z = sd * 0.5; // the ties
        for (const [dx, dy, dz, L] of [[0.55, 1, 0, 0.75], [0.8, 0.7, -0.2, 0.6], [0.4, 1, -0.4, 0.62], [0.9, 0.9, 0.3, 0.5]]) lock(H, g, hair, [sd * r * 0.58, r * 1.0, -r * 0.05], [sd * dx, dy, dz], r * 0.14, r * L);
      }
      for (const [x, L] of [[-0.3, 0.4], [0.0, 0.45], [0.3, 0.4]]) lock(H, g, hair, onHead(r, x, 0.66, 1.02), [x * 0.4, -1, 0.5], r * 0.15, r * L);
      // the band across the bridge of the nose (Death Painting blood)
      mesh(box(r * 1.15, r * 0.13, r * 0.3), mat('#3a0e1c'), 0, -r * 0.03, r * 0.98, g);
      return true;
    }
    case 'jk_hakari_hair': { // a big swept-up pompadour, short sides, hoop earrings
      const hair = mat('#3a3034', { spec: 0.35 });
      hairCap(H, g, r, hair, 1.06, 0.4, -0.15);
      const pomp = mesh(sphere(r * 0.62, 14, 10), hair, 0, r * 0.95, r * 0.42, g); pomp.scale.set(1.25, 0.72, 1.55); pomp.rotation.x = -0.3; // the quiff, out over the brow
      const curl = mesh(torus(H, r * 0.3, r * 0.17, Math.PI * 1.3, 12), hair, 0, r * 0.98, r * 1.12, g); curl.rotation.set(0, Math.PI / 2, 0.9);
      for (const sd of [-1, 1]) { const sw = mesh(sphere(r * 0.5, 10, 8), hair, sd * r * 0.55, r * 0.75, r * 0.1, g); sw.scale.set(0.6, 0.7, 1.3); } // swept sides
      mesh(sphere(r * 0.18, 8, 6), mat('#7a6a6e', { spec: 0.7 }), r * 0.15, r * 1.25, r * 0.6, g).scale.set(1, 0.5, 1.6); // shine
      for (const y of [0.15, -0.05]) mesh(torus(H, r * 0.09, r * 0.022, Math.PI * 2, 10), mat('#d8dce4', { spec: 1 }), r * 1.0, y * r - r * 0.12, r * 0.05, g).rotation.y = Math.PI / 2;
      return true;
    }
    case 'jk_flyhead': { // huge red compound eyes on a big grey face, a little human mouth
      g.userData.hidesFace = true;
      const eye = mat('#c8201a', { spec: 0.8 }), dot = mat('#7a0e0a');
      for (const sd of [-1, 1]) {
        const e = mesh(sphere(r * 0.62, 14, 12), eye, sd * r * 0.5, r * 0.3, r * 0.45, g); e.scale.set(1, 1.1, 0.9);
        for (let i = 0; i < 6; i++) mesh(sphere(r * 0.08, 6, 5), dot, sd * r * (0.5 + Math.sin(i * 2) * 0.3), r * (0.3 + Math.cos(i * 2.3) * 0.35), r * 1.0, g);
        const an = mesh(cyl(r * 0.03, r * 0.03, r * 0.7, 4), mat('#1a1a1a'), sd * r * 0.25, r * 1.1, r * 0.3, g); an.rotation.set(0.6, 0, -sd * 0.4);
      }
      const mp = onHead(r, 0, -0.45, 1.0);
      mesh(box(r * 0.4, r * 0.14, r * 0.08), mat('#2a0e0e'), mp[0], mp[1], mp[2], g);
      for (let i = -1; i <= 1; i++) mesh(box(r * 0.09, r * 0.07, r * 0.05), mat('#f2ecd8'), i * r * 0.12, mp[1] + r * 0.03, mp[2] + r * 0.03, g);
      mesh(sphere(r * 0.1, 6, 5), tc, 0, r * 0.95, -r * 0.3, g);
      return true;
    }
    case 'jk_curse_head': { // a stored curse: a lumpy head that is mostly mouth, eyes all over
      g.userData.hidesFace = true;
      const skin = mat('#7c8a6a', { spec: 0.2 }), white = mat('#f2eedc'), pupil = mat('#1a1414');
      for (const [x, y, z, k] of [[0.55, 0.7, -0.3, 0.45], [-0.6, 0.55, -0.35, 0.42], [0.0, 0.95, -0.2, 0.4]]) mesh(sphere(r * k, 10, 8), skin, x * r, y * r, z * r, g);
      const mouth = mesh(sphere(r * 0.62, 14, 8), mat('#3a1018'), 0, -r * 0.3, r * 0.6, g); mouth.scale.set(1.2, 0.6, 0.6);
      for (let i = -4; i <= 4; i++) for (const up of [1, -1]) { const t = mesh(cone(r * 0.07, r * 0.2, 4), white, Math.sin(i * 0.17) * r * 0.66, -r * 0.3 + up * r * 0.17, Math.cos(i * 0.17) * r * 0.86, g); t.rotation.x = up > 0 ? Math.PI : 0; }
      for (const [x, y, z, k] of [[-0.35, 0.45, 0.82, 0.22], [0.4, 0.5, 0.8, 0.18], [0.1, 0.78, 0.6, 0.14], [-0.75, 0.2, 0.6, 0.13], [0.75, 0.15, 0.6, 0.15]]) {
        const n = new THREE.Vector3(x, y, z).normalize();
        mesh(sphere(r * k, 10, 8), white, n.x * r, n.y * r, n.z * r, g);
        mesh(sphere(r * k * 0.5, 8, 6), pupil, n.x * r * (1 + k * 0.6), n.y * r * (1 + k * 0.6), n.z * r * (1 + k * 0.6), g);
      }
      mesh(sphere(r * 0.13, 8, 6), tc, 0, -r * 0.4, r * 0.9, g).scale.set(1, 0.5, 1); // team tongue
      return true;
    }
    case 'jk_tf_head': { // a transfigured human: a misshapen head, mismatched eyes, a gaping mouth
      g.userData.hidesFace = true;
      const skin = mat('#cbbfb4', { spec: 0.15 }), st = mat('#3a3038'), white = mat('#f4efe4'), pupil = mat('#1a1414');
      mesh(sphere(r * 0.6, 10, 8), skin, r * 0.45, r * 0.55, -r * 0.1, g);
      mesh(sphere(r * 0.45, 10, 8), skin, -r * 0.55, r * 0.2, -r * 0.3, g);
      for (const [x, y, k] of [[0.35, 0.25, 0.3], [-0.3, 0.1, 0.16]]) { const p = onHead(r, x, y, 1.0); mesh(sphere(r * k, 10, 8), white, p[0], p[1], p[2] - r * 0.05, g); mesh(sphere(r * k * 0.45, 8, 6), pupil, p[0], p[1], p[2] + r * k * 0.5, g); }
      const mp = onHead(r, 0.05, -0.42, 1.0);
      const m = mesh(sphere(r * 0.28, 10, 8), mat('#2a0e12'), mp[0], mp[1], mp[2] - r * 0.05, g); m.scale.set(1.2, 0.8, 0.5);
      stitches(H, g, onHead(r, -0.7, 0.45, 1.03), onHead(r, 0.1, 0.75, 1.03), r * 0.035, st, 4);
      mesh(sphere(r * 0.12, 6, 5), tc, -r * 0.75, -r * 0.2, r * 0.4, g);
      return true;
    }
  }
  return false;
}

// a hand with fingers along +Y from the wrist (Mahito's domain)
function hand(H, g, skin, pos, dir, s, curl = 0.3) {
  const grp = new THREE.Group();
  grp.position.copy(pos);
  grp.quaternion.setFromUnitVectors(UPY, dir.clone().normalize());
  g.add(grp);
  const { mesh, sphere, capsule } = H;
  ns(mesh(capsule(s * 0.13, s * 1.4), skin, 0, -s * 0.75, 0, grp)); // forearm
  const palm = ns(mesh(sphere(s * 0.28, 8, 6), skin, 0, 0, 0, grp)); palm.scale.set(1, 1.15, 0.45);
  for (let i = 0; i < 4; i++) {
    const f = ns(mesh(capsule(s * 0.055, s * 0.32), skin, (i - 1.5) * s * 0.13, s * 0.45, 0, grp));
    f.rotation.x = curl * (0.6 + (i % 2) * 0.4);
  }
  const th = ns(mesh(capsule(s * 0.06, s * 0.25), skin, s * 0.3, s * 0.1, 0, grp)); th.rotation.z = -0.8;
}

function decorate(def, team, vis, H) {
  if (def.faction !== FAC && def.faction !== SUMMON) return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, glow, capsule } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const skin = mat(def.look.skin, { spec: 0.18 });
  const limb = (p) => skel.parts[p];
  const ARMS = [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR], LEGS = [PART.thighL, PART.shinL, PART.thighR, PART.shinR];
  const isFore = (p) => p === PART.farmL || p === PART.farmR;
  // cover a limb part (k: radius factor, f: share of its length, y: offset in its own length)
  const cover = (p, m, k = 1.15, f = 1, y = 0) => { const sp = limb(p); return mesh(capsule(sp.r * k, sp.hh * 2 * f), m, 0, sp.hh * y, 0, parts[p]); };
  const bareArms = (k = 1.3) => { for (const p of ARMS) cover(p, skin, isFore(p) ? k : 1.12, isFore(p) ? 0.86 : 1, isFore(p) ? 0.12 : 0); };
  // wide trousers/ robe skirt from the pelvis
  const skirt = (m, top0, bot, len) => mesh(cyl(pel.r * top0, pel.r * bot, pel.r * len, 16), m, 0, -pel.r * len * 0.42, 0, P);
  const belt = (m, y = -hh - r * 0.38, k = 1.12) => mesh(cyl(r * k, r * (k + 0.02), r * 0.2, 16), m, 0, y, 0, C);

  if (top === 'jk_toji') {
    // black tight shirt with short sleeves, bare forearms (team wristbands), a dark belt
    // knotted in front, baggy white trousers gathered at the ankle, and the Inventory
    // Curse wound round him with its head on his left shoulder
    const blk = mat('#1d1c22', { spec: 0.25 }), pants = mat('#ece6d6', { spec: 0.05 }), sash = mat('#202028');
    chestShell(H, ch, blk, C);
    for (const p of [PART.uarmL, PART.uarmR]) cover(p, blk, 1.17, 0.9, 0.12);
    for (const p of [PART.farmL, PART.farmR]) cover(p, skin, 1.1, 0.8, 0.2);
    mesh(cyl(r * 0.55, r * 0.62, r * 0.25, 14), blk, 0, hh + r * 0.6, 0, C); // collar
    belt(sash, -hh - r * 0.42, 1.16);
    mesh(box(r * 0.3, r * 0.22, r * 0.12), sash, -r * 0.05, -hh - r * 0.42, r * 1.17, C); // the knot
    for (const sd of [-1, 1]) { const t = mesh(box(r * 0.13, r * 1.05, r * 0.05), sash, -r * 0.05 + sd * r * 0.1, -hh - r * 0.95, r * 1.2, C); t.rotation.z = sd * 0.12; }
    const hip = mesh(sphere(pel.r * 1.32, 14, 10), pants, 0, -pel.r * 0.1, 0, P); hip.scale.set(1.12, 0.95, 1.05);
    for (const p of [PART.thighL, PART.thighR]) { const sp = limb(p); mesh(capsule(sp.r * 1.85, sp.hh * 2), pants, 0, -sp.hh * 0.1, 0, parts[p]).scale.set(1, 1, 1.08); }
    for (const p of [PART.shinL, PART.shinR]) {
      const sp = limb(p), L = sp.hh * 2;
      const b = mesh(sphere(sp.r * 2.0, 12, 10), pants, 0, -L * 0.05, sp.r * 0.15, parts[p]); b.scale.set(1, 1.75, 1.05); // the balloon of the leg
      mesh(cyl(sp.r * 1.3, sp.r * 1.25, L * 0.12, 12), pants, 0, -L * 0.36, 0, parts[p]); // gathered at the ankle
    }
    // the Inventory Curse: a fat purple worm wound round his neck and body
    const worm = mat('#6e3e7e', { spec: 0.3 }), belly = mat('#8e5a9a', { spec: 0.3 });
    // (from its head on the left shoulder, behind the neck, over the right shoulder,
    // across the chest to the left hip, round the back and out at the right hip)
    const path = new THREE.CatmullRomCurve3([
      [0.85, hh / r + 0.8, -0.1], [0.25, hh / r + 0.72, -0.78], [-0.6, hh / r + 0.62, -0.62], [-1.0, hh / r + 0.35, 0.25],
      [-0.5, 0.25, 1.12], [0.35, -hh / r * 0.6, 1.15], [1.12, -hh / r - 0.15, 0.3], [0.55, -hh / r - 0.3, -1.05],
      [-0.55, -hh / r - 0.35, -1.0], [-1.1, -hh / r - 0.4, 0.35],
    ].map(([x, y, z]) => new THREE.Vector3(x * r, y * r, z * r)));
    const N = 30;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = path.getPointAt(t);
      const k = r * (0.34 - t * 0.14);
      mesh(sphere(k, 10, 8), i % 2 ? worm : belly, p.x, p.y, p.z, C);
    }
    const hp = [r * 1.0, hh + r * 1.05, -r * 0.02];
    mesh(sphere(r * 0.5, 14, 12), worm, ...hp, C).scale.set(1, 0.92, 1.08);
    for (const sd of [-1, 1]) mesh(box(r * 0.15, r * 0.035, r * 0.035), mat('#2a1430'), hp[0] + sd * r * 0.15, hp[1] + r * 0.08, hp[2] + r * 0.5, C); // sleepy shut eyes
    mesh(box(r * 0.14, r * 0.045, r * 0.035), mat('#3a1a3e'), hp[0], hp[1] - r * 0.17, hp[2] + r * 0.48, C);
    mesh(sphere(r * 0.07, 6, 5), mat('#7e4a8e'), hp[0], hp[1] - r * 0.03, hp[2] + r * 0.52, C);
  }
  if (top === 'jk_dagon') {
    // red-orange body, a paler belly, suckers on the forearms, a team loincloth
    const pale = mat('#f0a070', { spec: 0.25 });
    chestShell(H, ch, skin, C);
    const bl = mesh(sphere(r * 0.8, 14, 10), pale, 0, -hh * 0.35, r * 0.55, C); bl.scale.set(1, 1.25, 0.75);
    bareArms(1.32);
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); for (let k = 0; k < 4; k++) mesh(cyl(sp.r * 0.3, sp.r * 0.3, sp.r * 0.12, 8), pale, 0, sp.hh * (0.5 - k * 0.38), sp.r * 1.2, parts[p]).rotation.x = Math.PI / 2; }
    for (const p of LEGS) cover(p, skin, 1.1, 1);
    belt(td, -hh - r * 0.35, 1.14);
    mesh(box(r * 0.8, pel.r * 1.5, r * 0.08), tc, 0, -pel.r * 0.55, pel.r * 1.05, P);
    mesh(box(r * 0.8, pel.r * 1.3, r * 0.08), tc, 0, -pel.r * 0.5, -pel.r * 1.05, P);
  }
  if (top === 'jk_mahito') {
    // a loose dark shirt open at the neck, stitched patchwork skin, baggy patched trousers
    const shirt = mat('#2b3048', { spec: 0.2 }), patch = mat('#c9c0b8'), st = mat('#3a3038'), pants = mat('#3b4152');
    chestShell(H, ch, shirt, C, 1.05);
    const V = mesh(cone(r * 0.32, r * 0.95, 3), skin, 0, hh + r * 0.05, r * 1.06, C); V.rotation.set(-0.15, 0, Math.PI); V.scale.set(1, 1, 0.25);
    stitches(H, C, [-r * 0.2, hh * 0.9, r * 1.15], [r * 0.15, hh * 0.1, r * 1.17], r * 0.05, st, 4);
    for (const [x, y, c] of [[0.6, 0.3, '#3e4462'], [-0.5, -0.5, '#4a3a52'], [0.2, -0.8, '#2a3a40']]) { const pt = mesh(box(r * 0.5, r * 0.45, r * 0.05), mat(c), x * r, y * hh, r * 1.08, C); pt.rotation.y = x * 0.6; }
    for (const p of [PART.uarmL, PART.uarmR]) cover(p, shirt, 1.3, 1);
    for (const p of [PART.farmL, PART.farmR]) {
      cover(p, skin, 1.1, 0.75, 0.25);
      const sp = limb(p);
      mesh(cyl(sp.r * 1.45, sp.r * 1.3, sp.hh * 0.6, 10), shirt, 0, sp.hh * 0.7, 0, parts[p]); // rolled sleeve
      stitches(H, parts[p], [0, -sp.hh * 0.1, sp.r * 1.12], [0, -sp.hh * 0.9, sp.r * 1.12], sp.r * 0.12, st, 3);
      mesh(cyl(sp.r * 1.13, sp.r * 1.13, sp.r * 0.12, 10), st, 0, -sp.hh * 0.95, 0, parts[p]); // stitched wrist
      mesh(capsule(sp.r * 1.12, sp.hh * 0.4), patch, 0, -sp.hh * 0.5, 0, parts[p]);
    }
    belt(tc, -hh - r * 0.38, 1.14);
    skirt(pants, 1.15, 1.35, 1.0);
    for (const p of [PART.thighL, PART.thighR]) cover(p, pants, 1.5, 1);
    for (const p of [PART.shinL, PART.shinR]) { cover(p, pants, 1.45, 0.8, 0.15); const sp = limb(p); mesh(box(sp.r * 1.4, sp.r * 1.6, sp.r * 0.2), mat('#5a6070'), 0, 0, sp.r * 1.4, parts[p]); }
  }
  if (top === 'jk_jogo') {
    // a pale robe with dark stripes, a team sash, dark hakama
    const robe = mat('#d8d0bc', { spec: 0.1 }), stripe = mat('#2a2420'), hak = mat('#3a2c28');
    chestShell(H, ch, robe, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.18, (hh + r) * 1.2, r * 0.05), stripe, sd * r * 0.3, hh * 0.35, r * 1.06, C); l.rotation.z = -sd * 0.38; }
    for (const p of [PART.uarmL, PART.uarmR]) { const sp = limb(p); mesh(cyl(sp.r * 1.4, sp.r * 2.0, sp.hh * 2.2, 10), robe, 0, -sp.hh * 0.1, 0, parts[p]); mesh(cyl(sp.r * 2.02, sp.r * 2.02, sp.hh * 0.2, 10), stripe, 0, -sp.hh * 1.1, 0, parts[p]); }
    bareArms(1.25);
    belt(tc, -hh - r * 0.3, 1.16);
    mesh(sphere(r * 0.22, 8, 6), tc, r * 0.45, -hh - r * 0.3, r * 1.05, C).scale.set(1.4, 1, 0.6);
    skirt(hak, 1.15, 1.75, 2.4);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const pl = mesh(box(pel.r * 0.06, pel.r * 2.2, pel.r * 0.06), mat('#2a201c'), Math.sin(a) * pel.r * 1.48, -pel.r * 1.0, Math.cos(a) * pel.r * 1.48, P); pl.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2); }
  }
  if (top === 'jk_hanami') {
    // pale body with black markings like bark; white cloth wrapped over the left shoulder
    // and round the waist (team hem); a white skirt-wrap; wooden forearms
    const ink = mat('#1c1a1c'), cloth = mat('#f4f1ea', { spec: 0.08 }), bark = mat('#7a5a3a', { spec: 0.05 });
    chestShell(H, ch, skin, C);
    for (const [x, y, a] of [[-0.55, 0.3, 0.3], [-0.45, -0.4, -0.2], [0.1, -0.7, 0.5]]) { const m = mesh(box(r * 0.08, r * 0.7, r * 0.05), ink, x * r, y * hh, r * 1.06, C); m.rotation.z = a; }
    for (const sg of [1, -1]) { const w = mesh(box(r * 0.42, (hh + r) * 2.0, r * 0.07), cloth, r * 0.25, hh * 0.05, sg * r * 1.08, C); w.rotation.z = sg * 0.6; } // a sash over the left shoulder
    const sh = mesh(sphere(r * 0.62, 12, 10), cloth, r * 0.9, hh + r * 0.3, 0, C); sh.scale.set(1, 0.75, 1.15); // the cloth over the shoulder
    belt(cloth, -hh - r * 0.35, 1.18);
    belt(tc, -hh - r * 0.2, 1.2).scale.set(1, 0.4, 1);
    for (const p of [PART.uarmL, PART.uarmR]) { cover(p, skin, 1.12); const sp = limb(p); for (const y of [0.3, -0.3]) mesh(box(sp.r * 0.25, sp.hh * 0.5, sp.r * 0.25), ink, 0, sp.hh * y, sp.r * 1.05, parts[p]); }
    for (const p of [PART.farmL, PART.farmR]) { cover(p, skin, 1.3, 0.86, 0.12); const sp = limb(p); for (const y of [0.4, -0.2]) mesh(box(sp.r * 0.25, sp.hh * 0.5, sp.r * 0.25), ink, 0, sp.hh * y, sp.r * 1.25, parts[p]); }
    mesh(cyl(limb(PART.uarmL).r * 1.5, limb(PART.uarmL).r * 1.7, limb(PART.uarmL).hh * 1.4, 10), cloth, 0, limb(PART.uarmL).hh * 0.3, 0, parts[PART.uarmL]); // the cloth wraps the left arm
    void bark;
    skirt(cloth, 1.2, 1.5, 2.3);
    mesh(cyl(pel.r * 1.52, pel.r * 1.52, pel.r * 0.18, 16), tc, 0, -pel.r * 1.92, 0, P);
  }
  if (top === 'jk_geto') {
    // a black monk's robe with wide sleeves; the kesa (patched gold-brown cloth) slung
    // over his left shoulder; a team cord at the waist
    const robe = mat('#1e1e26', { spec: 0.15 }), kesa = mat('#c49a3e', { spec: 0.3 }), kline = mat('#8a6a2a');
    chestShell(H, ch, robe, C);
    mesh(cyl(r * 0.55, r * 0.66, r * 0.3, 14), robe, 0, hh + r * 0.58, 0, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.16, (hh + r) * 1.15, r * 0.05), mat('#3a3a46'), sd * r * 0.28, hh * 0.4, r * 1.05, C); l.rotation.z = -sd * 0.35; }
    for (const sgn of [1, -1]) { // front and back of the kesa, from the left shoulder down to the right hip
      const k = mesh(box(r * 0.55, (hh + r) * 2.15, r * 0.06), kesa, r * 0.1, -hh * 0.05, sgn * r * 1.07, C); k.rotation.z = sgn * 0.6;
      for (let i = -2; i <= 2; i++) { const l = mesh(box(r * 0.58, r * 0.03, r * 0.065), kline, r * 0.1 - Math.sin(0.6) * i * r * 0.4 * sgn, -hh * 0.05 + Math.cos(0.6) * i * r * 0.4, sgn * r * 1.08, C); l.rotation.z = sgn * 0.6; }
      const l2 = mesh(box(r * 0.03, (hh + r) * 2.1, r * 0.065), kline, r * 0.1, -hh * 0.05, sgn * r * 1.09, C); l2.rotation.z = sgn * 0.6;
    }
    mesh(torus(H, r * 0.16, r * 0.04, Math.PI * 2, 12), mat('#d8b860', { spec: 1 }), r * 0.55, hh * 0.65, r * 1.1, C); // the kesa ring
    belt(tc, -hh - r * 0.38, 1.13);
    for (const p of [PART.uarmL, PART.uarmR]) { const sp = limb(p); cover(p, robe, 1.2, 1); mesh(cyl(sp.r * 1.4, sp.r * 2.2, sp.hh * 2.0, 10), robe, 0, -sp.hh * 0.2, 0, parts[p]); }
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); mesh(cyl(sp.r * 2.0, sp.r * 2.5, sp.hh * 1.5, 10), robe, 0, sp.hh * 0.2, 0, parts[p]); }
    skirt(robe, 1.15, 1.8, 2.7);
  }
  if (top === 'jk_choso') {
    // a pale robe top with a dark purple overlap and sash, dark trousers, blood rings at the wrists
    const robe = mat('#e9e3d8', { spec: 0.1 }), plum = mat('#3e2a44'), blood = glow('#c0102a');
    chestShell(H, ch, robe, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.35, (hh + r) * 1.2, r * 0.05), plum, sd * r * 0.32, hh * 0.3, r * 1.05, C); l.rotation.z = -sd * 0.38; }
    mesh(cyl(r * 0.58, r * 0.64, r * 0.25, 14), plum, 0, hh + r * 0.58, 0, C);
    belt(plum, -hh - r * 0.36, 1.14);
    mesh(box(r * 0.3, r * 0.2, r * 0.08), tc, r * 0.4, -hh - r * 0.36, r * 1.1, C);
    for (const p of [PART.uarmL, PART.uarmR]) cover(p, robe, 1.3, 1);
    for (const p of [PART.farmL, PART.farmR]) {
      const sp = limb(p);
      mesh(cyl(sp.r * 1.55, sp.r * 1.75, sp.hh * 1.3, 10), robe, 0, sp.hh * 0.3, 0, parts[p]);
      ns(mesh(torus(H, sp.r * 1.7, sp.r * 0.22, Math.PI * 2, 14), blood, 0, -sp.hh * 0.6, 0, parts[p])).rotation.x = Math.PI / 2;
    }
    skirt(mat('#2a2630'), 1.15, 1.4, 1.2);
    for (const p of [PART.thighL, PART.thighR]) cover(p, mat('#2a2630'), 1.4, 1);
  }
  if (top === 'jk_hakari') {
    // a long white jacket with a tall collar, open over a black shirt; team armband
    const coat = mat('#efede6', { spec: 0.12 }), blk = mat('#1a1a20'), trim = mat('#c8c4b8');
    chestShell(H, ch, coat, C, 1.04);
    mesh(box(r * 0.55, (hh + r) * 1.7, r * 0.05), blk, 0, 0, r * 1.15, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.12, (hh + r) * 1.75, r * 0.06), trim, sd * r * 0.3, 0, r * 1.15, C); l.rotation.z = sd * 0.05; }
    const col = mesh(cyl(r * 0.6, r * 0.72, r * 0.62, 14, ), coat, 0, hh + r * 0.68, -r * 0.08, C); void col;
    for (const p of [PART.uarmL, PART.uarmR]) cover(p, coat, 1.25, 1);
    for (const p of [PART.farmL, PART.farmR]) { cover(p, coat, 1.25, 0.85, 0.15); }
    const ua = limb(PART.uarmL);
    mesh(cyl(ua.r * 1.35, ua.r * 1.35, ua.hh * 0.45, 10), tc, 0, ua.hh * 0.2, 0, parts[PART.uarmL]);
    belt(blk, -hh - r * 0.38, 1.13);
    const tails = mesh(cyl(pel.r * 1.2, pel.r * 1.5, pel.r * 2.4, 16, ), coat, 0, -pel.r * 0.95, -pel.r * 0.1, P); tails.scale.set(1, 1, 0.9);
    mesh(box(pel.r * 0.9, pel.r * 2.3, pel.r * 0.05), blk, 0, -pel.r * 0.95, pel.r * 1.38, P);
  }
  if (top === 'jk_fly') {
    // a dark striped body and two glassy wings
    const dark = mat('#2a2a30', { spec: 0.4 });
    chestShell(H, ch, dark, C);
    for (const y of [0.3, -0.2, -0.7]) mesh(cyl(r * 1.17, r * 1.17, r * 0.15, 14), mat('#5a4a2a'), 0, y * hh, 0, C);
    for (const sd of [-1, 1]) {
      const w = ns(mesh(sphere(r * 1.1, 12, 8), mat('#d8e8f0', { transparent: true, opacity: 0.45, depthWrite: false, spec: 0.8 }), sd * r * 0.9, hh + r * 0.2, -r * 1.3, C));
      w.scale.set(0.9, 0.12, 1.6); w.rotation.set(0.5, sd * 0.5, sd * 0.4);
    }
    belt(tc, -hh - r * 0.3, 1.14);
    for (const p of ARMS) cover(p, dark, 1.1, 1);
  }
  if (top === 'jk_gcurse') {
    // a stored curse: lumpy, more eyes on its belly, team warts
    chestShell(H, ch, skin, C, 1.06);
    for (let i = 0; i < 6; i++) { const a = i * 2.3, y = ((i * 5) % 7 / 6 - 0.5) * hh * 2; mesh(sphere(r * (0.16 + (i % 3) * 0.05), 8, 6), i % 2 ? tc : mat('#5e6a50'), Math.sin(a) * r * 1.15, y, Math.cos(a) * r * 1.05, C); }
    mesh(sphere(r * 0.3, 10, 8), mat('#f2eedc'), -r * 0.3, -hh * 0.2, r * 1.1, C);
    mesh(sphere(r * 0.14, 8, 6), mat('#1a1414'), -r * 0.33, -hh * 0.2, r * 1.36, C);
    for (const p of ARMS) cover(p, skin, 1.15, 1);
    for (const p of [PART.farmL, PART.farmR]) { const sp = limb(p); for (let k = -1; k <= 1; k++) { const cl = mesh(cone(sp.r * 0.3, sp.r * 1.4, 4), mat('#2a2a22'), k * sp.r * 0.6, -sp.hh - sp.r * 1.7, sp.r * 0.6, parts[p]); cl.rotation.x = Math.PI; } }
    mesh(cyl(pel.r * 1.1, pel.r * 1.2, pel.r * 0.5, 12), td, 0, -pel.r * 0.2, 0, P);
  }
  if (top === 'jk_tf') {
    // a transfigured human: grey lumps, one swollen arm, stitches, a scrap of team cloth
    const st = mat('#3a3038');
    chestShell(H, ch, skin, C, 1.04);
    mesh(sphere(r * 0.55, 10, 8), skin, r * 0.7, hh * 0.6, -r * 0.4, C);
    stitches(H, C, [-r * 0.6, hh, r * 1.0], [r * 0.4, -hh, r * 1.1], r * 0.05, st, 4);
    for (const p of ARMS) cover(p, skin, 1.12, 1);
    const fr = limb(PART.farmR);
    mesh(sphere(fr.r * 2.2, 10, 8), skin, 0, -fr.hh * 0.3, 0, parts[PART.farmR]).scale.set(1, 1.6, 1);
    belt(tc, -hh - r * 0.3, 1.12);
    mesh(cyl(pel.r * 1.1, pel.r * 1.3, pel.r * 0.9, 12), mat('#7a7068'), 0, -pel.r * 0.3, 0, P);
  }
}

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, octa, mat, glow, capsule } = H;
  const T = THREE;
  switch (type) {
    case 'jk_fish': { // a shikigami fish, nose first (+Y)
      const col = ['#f08a3a', '#3ab8c8', '#e85a8a'][(Math.random() * 3) | 0];
      const body = ns(mesh(sphere(0.16, 10, 8), mat(col, { spec: 0.6 }), 0, 0, 0, g)); body.scale.set(0.75, 1.5, 1);
      const tail = ns(mesh(cone(0.13, 0.18, 4), mat(col), 0, -0.27, 0, g)); tail.scale.set(0.3, 1, 1); tail.rotation.x = Math.PI;
      for (const sd of [-1, 1]) ns(mesh(sphere(0.035, 6, 5), mat('#141010'), sd * 0.1, 0.12, 0.05, g));
      ns(mesh(cone(0.06, 0.14, 4), mat('#ffffff'), 0, 0.03, 0.15, g)).scale.set(0.3, 1, 1);
      return true;
    }
    case 'jk_ember': { // an ember insect: a glowing bug with flame wings
      ns(mesh(sphere(0.1, 8, 6), glow('#ffd040'), 0, 0, 0, g)).scale.set(0.8, 1.4, 0.8);
      ns(mesh(sphere(0.2, 10, 8), mat('#ff6a10', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), 0, -0.05, 0, g));
      for (const sd of [-1, 1]) { const w = ns(mesh(sphere(0.12, 6, 4), mat('#ff3a10', { emit: 1, transparent: true, opacity: 0.7, depthWrite: false }), sd * 0.13, -0.02, 0, g)); w.scale.set(1.2, 0.5, 0.15); }
      ns(mesh(cone(0.05, 0.25, 5), glow('#ff8a20'), 0, -0.2, 0, g)).rotation.x = Math.PI;
      return true;
    }
    case 'jk_meteor': { // Maximum: Meteor - a huge molten rock
      ns(mesh(H.geo('jkmet', () => new T.IcosahedronGeometry(1.6, 1)), mat('#4a2a1a', { spec: 0.1 }), 0, 0, 0, g));
      ns(mesh(H.geo('jkmet2', () => new T.IcosahedronGeometry(1.75, 1)), mat('#ff5a10', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0, 0, g));
      ns(mesh(H.geo('jkmet3', () => new T.IcosahedronGeometry(2.3, 1)), mat('#ffa030', { emit: 1, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 8; i++) { const a = i * 0.8; ns(mesh(box(0.08, 1.2, 0.08), glow('#ffb040'), Math.sin(a) * 1.55, Math.cos(a * 1.3) * 0.8, Math.cos(a) * 1.5, g)).rotation.set(a, a * 2, 0); }
      return true;
    }
    case 'jk_seed': { // a wooden ball
      ns(mesh(sphere(0.22, 12, 10), mat('#8a6238', { spec: 0.1 }), 0, 0, 0, g));
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 0.222, 0.012, Math.PI * 2, 14), mat('#5a3e22'), 0, 0, 0, g)).rotation.set(i * 1.1, i * 0.7, 0);
      return true;
    }
    case 'jk_uzumaki': { // a black spiral of compressed curses
      ns(mesh(sphere(0.55, 14, 10), mat('#0c0810', { spec: 0.4 }), 0, 0, 0, g));
      for (let i = 0; i < 4; i++) { const t = ns(mesh(torus(H, 0.7 + i * 0.22, 0.07 - i * 0.012, Math.PI * 1.5, 20), mat(i % 2 ? '#3a1a5a' : '#140a1e', { emit: 0.3 }), 0, 0, 0, g)); t.rotation.set(Math.PI / 2, 0, i * 1.6); }
      ns(mesh(sphere(1.3, 16, 12), mat('#5a2a8a', { emit: 0.8, transparent: true, opacity: 0.22, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ns(mesh(sphere(0.12, 6, 5), mat('#f2eedc'), Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95, g)); }
      return true;
    }
    case 'jk_pball': ns(mesh(sphere(0.08, 10, 8), mat('#e8ecf2', { spec: 1 }), 0, 0, 0, g)); return true;
    case 'jk_cut': { // a clean white slash with a red edge
      const c = ns(mesh(sphere(0.5, 10, 6), glow('#ffffff'), 0, 0, 0, g)); c.scale.set(1.8, 0.05, 0.04);
      const h = ns(mesh(sphere(0.5, 10, 6), mat('#ff3a3a', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g)); h.scale.set(1.7, 0.16, 0.08);
      return true;
    }
    case 'jk_cloud': { // the Playful Cloud: three red-brown staff sections joined by chain, swinging out
      const wood = mat('#8a2a1e', { spec: 0.3 }), band = mat('#d8b860', { spec: 1 });
      const sec = (x, y, z, rx, rz) => { const grp = new T.Group(); grp.position.set(x, y, z); grp.rotation.set(rx, 0, rz); g.add(grp); ns(mesh(cyl(0.045, 0.045, 0.62, 8), wood, 0, 0.31, 0, grp)); for (const yy of [0.02, 0.6]) ns(mesh(cyl(0.05, 0.05, 0.04, 8), band, 0, yy, 0, grp)); return grp; };
      sec(0, -0.1, 0, 0.3, 0);
      sec(0, 0.56, 0.2, 1.3, 0.2);
      sec(0.12, 0.78, 0.82, 2.4, 0.5);
      for (const [x, y, z] of [[0, 0.52, 0.17], [0.05, 0.75, 0.75]]) ns(mesh(torus(H, 0.035, 0.01, Math.PI * 2, 8), mat('#3a3a3a', { spec: 0.8 }), x, y, z, g));
      return true;
    }
    case 'jk_splash': { // water bursting up
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const d = ns(mesh(cone(0.08, 0.5, 5), mat('#8ad0f0', { transparent: true, opacity: 0.7, depthWrite: false }), Math.sin(a) * 0.2, 0.25, Math.cos(a) * 0.2, g)); d.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }
      ns(mesh(torus(H, 0.35, 0.04, Math.PI * 2, 16), mat('#d8f0ff', { transparent: true, opacity: 0.7, depthWrite: false }), 0, 0.05, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_soul': { // Idle Transfiguration: a pale hand-print of soul light, warping rings
      ns(mesh(sphere(0.3, 12, 8), mat('#9adfe0', { emit: 1, transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0.1, g)).scale.set(1, 1.2, 0.5);
      for (let i = 0; i < 2; i++) { const t = ns(mesh(torus(H, 0.32 + i * 0.12, 0.025, Math.PI * 2, 16), glow(i ? '#6a8aff' : '#b0f0f0'), 0, 0, 0, g)); t.rotation.set(Math.PI / 2 + i * 0.7, i * 1.2, 0.3); }
      for (let i = 0; i < 5; i++) ns(mesh(capsule(0.03, 0.18), glow('#d8ffff'), (i - 2) * 0.07, 0.24, 0.22, g));
      return true;
    }
    case 'jk_soulfail': { // a soul that won't bend: a red shell
      ns(mesh(sphere(0.45, 14, 10), mat('#ff3a4a', { emit: 1, transparent: true, opacity: 0.3, depthWrite: false }), 0, 0, 0, g));
      ns(mesh(torus(H, 0.45, 0.03, Math.PI * 2, 18), glow('#ff6a7a'), 0, 0, 0, g));
      return true;
    }
    case 'jk_lava': { // an eruption out of the domain floor
      ns(mesh(cyl(0.25, 0.5, 2.2, 8), mat('#ff6a10', { emit: 1, transparent: true, opacity: 0.7, depthWrite: false }), 0, 1.1, 0, g));
      ns(mesh(cyl(0.12, 0.25, 2.6, 8), glow('#ffd040'), 0, 1.3, 0, g));
      ns(mesh(cyl(0.6, 0.6, 0.05, 12), glow('#ff4a10'), 0, 0.03, 0, g));
      return true;
    }
    case 'jk_crater': { // the meteor's scorched crater, still glowing
      ns(mesh(cyl(3.2, 3.2, 0.04, 24), mat('#1e140e', { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0, 0, g));
      ns(mesh(cyl(1.8, 1.8, 0.05, 18), mat('#ff5a10', { emit: 1, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0.01, 0, g));
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const r0 = ns(mesh(H.geo('jkrock', () => new T.DodecahedronGeometry(0.35, 0)), mat('#3a2a22'), Math.sin(a) * 3.1, 0.1, Math.cos(a) * 3.1, g)); r0.rotation.set(a, a * 2, 0); }
      return true;
    }
    case 'jk_roots': { // roots bursting up out of the ground
      const bark = mat('#6e5034', { spec: 0.05 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, d = 0.4 + (i % 3) * 0.35;
        const rt = ns(mesh(cone(0.14, 1.5 + (i % 2) * 0.6, 5), bark, Math.sin(a) * d, 0.6, Math.cos(a) * d, g));
        rt.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      }
      ns(mesh(cyl(1.3, 1.3, 0.04, 16), mat('#4a3420', { transparent: true, opacity: 0.8, depthWrite: false }), 0, 0.02, 0, g));
      return true;
    }
    case 'jk_flowers': { // Hanami's flower field (radius 5)
      const R = 5;
      ns(mesh(cyl(R, R, 0.03, 32), mat('#6aa848', { transparent: true, opacity: 0.55, depthWrite: false }), 0, 0.02, 0, g));
      const cols = ['#f4a8c8', '#ffffff', '#f6d84a', '#c8a0f0'];
      for (let i = 0; i < 70; i++) {
        const a = i * 2.39996, d = Math.sqrt((i + 0.5) / 70) * (R - 0.2);
        const x = Math.sin(a) * d, z = Math.cos(a) * d;
        ns(mesh(cyl(0.012, 0.012, 0.35, 3), mat('#3a7a2a'), x, 0.17, z, g));
        const f = ns(mesh(sphere(0.09, 6, 4), mat(cols[i % 4], { emit: 0.25 }), x, 0.36, z, g)); f.scale.set(1, 0.45, 1);
        ns(mesh(sphere(0.035, 4, 3), mat('#f6c030'), x, 0.39, z, g));
      }
      ns(mesh(torus(H, R, 0.05, Math.PI * 2, 48), mat('#f4a8c8', { emit: 0.6 }), 0, 0.05, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_vortex': { // a swirl of cursed energy (curses coming out of / going into Geto)
      for (let i = 0; i < 3; i++) { const t = ns(mesh(torus(H, 0.5 + i * 0.25, 0.06, Math.PI * 1.6, 18), mat(i % 2 ? '#2a0e3a' : '#5a2a8a', { emit: 0.5, transparent: true, opacity: 0.8, depthWrite: false }), 0, 0.05 + i * 0.1, 0, g)); t.rotation.set(Math.PI / 2, 0, i * 2); }
      ns(mesh(cyl(0.6, 0.6, 0.03, 18), mat('#0c0610', { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0.02, 0, g));
      return true;
    }
    case 'jk_converge': { // Convergence: blood pressed into a hard glowing bead between the palms
      ns(mesh(sphere(0.1, 10, 8), glow('#ff2a3a'), 0, 0, 0, g));
      ns(mesh(sphere(0.2, 12, 8), mat('#a00818', { emit: 0.8, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g));
      for (let i = 0; i < 3; i++) ns(mesh(torus(H, 0.25 + i * 0.05, 0.012, Math.PI * 2, 14), glow('#ff4a5a'), 0, 0, 0, g)).rotation.set(i * 1.1, i * 0.6, 0);
      return true;
    }
    case 'jk_bloodseg': { // a segment of Piercing Blood (along +Y, 1 m)
      ns(mesh(cyl(0.045, 0.045, 1.02, 6), glow('#ff3040'), 0, 0, 0, g));
      ns(mesh(cyl(0.11, 0.11, 1.02, 8), mat('#a00818', { emit: 0.8, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_bloodorb': { // a Supernova orb about to burst
      ns(mesh(sphere(0.2, 12, 10), mat('#b00818', { spec: 0.9, emit: 0.4 }), 0, 0, 0, g));
      ns(mesh(sphere(0.06, 6, 5), mat('#ffffff'), 0.07, 0.08, 0.1, g));
      return true;
    }
    case 'jk_bloodburst': { // red spikes of a burst
      for (let i = 0; i < 9; i++) {
        const dir = new T.Vector3(Math.sin(i * 2.4), Math.cos(i * 1.7), Math.cos(i * 2.4)).normalize();
        const sp = ns(mesh(cone(0.07, 0.8, 4), glow(i % 2 ? '#ff2a3a' : '#8a0010'), dir.x * 0.4, dir.y * 0.4, dir.z * 0.4, g));
        sp.quaternion.setFromUnitVectors(UPY, dir);
      }
      return true;
    }
    case 'jk_jackpot': { // the jackpot aura: gold rings and green light
      for (let i = 0; i < 3; i++) { const t = ns(mesh(torus(H, 0.55 + i * 0.12, 0.025, Math.PI * 2, 20), glow(i === 1 ? '#3affa0' : '#ffd84a'), 0, -0.3 + i * 0.35, 0, g)); t.rotation.x = Math.PI / 2 + (i - 1) * 0.2; }
      ns(mesh(sphere(0.75, 14, 10), mat('#7affc0', { emit: 1, transparent: true, opacity: 0.16, depthWrite: false }), 0, 0, 0, g));
      return true;
    }
    case 'jk_reel': { // the three pachinko reels over his head
      for (let i = -1; i <= 1; i++) {
        ns(mesh(box(0.34, 0.42, 0.08), mat('#1a1420', { spec: 0.4 }), i * 0.38, 0, 0, g));
        ns(mesh(box(0.28, 0.36, 0.085), mat('#f4f0e8', { emit: 0.5 }), i * 0.38, 0, 0.005, g));
        sevenAt(H, g, i * 0.38, 0, 0.05, 0.3, glow('#e8202a'));
      }
      ns(mesh(box(1.25, 0.06, 0.1), glow('#ffd84a'), 0, 0.25, 0, g));
      ns(mesh(box(1.25, 0.06, 0.1), glow('#ffd84a'), 0, -0.25, 0, g));
      return true;
    }
    case 'jk_dom_dagon': { // a sunny beach under a blue sky: sand, the sea at the horizon, palms, fish
      const R = DOM_R.dagon;
      domeMesh(H, g, R, '#5ab8e8', 0.3, '#1a6fb0');
      ns(mesh(H.geo('jkdg-sand', () => new T.CircleGeometry(R * 0.62, 40).rotateX(-Math.PI / 2)), mat('#f2dca0', { transparent: true, opacity: 0.92, depthWrite: false }), 0, 0.05, 0, g));
      ns(mesh(H.geo('jkdg-sea', () => new T.RingGeometry(R * 0.62, R, 48, 1).rotateX(-Math.PI / 2)), mat('#2a86c8', { emit: 0.2, transparent: true, opacity: 0.85, depthWrite: false }), 0, 0.06, 0, g));
      ns(mesh(torus(H, R * 0.62, 0.08, Math.PI * 2, 56), mat('#ffffff', { emit: 0.6 }), 0, 0.08, 0, g)).rotation.x = Math.PI / 2;
      ns(mesh(torus(H, R * 0.8, 0.05, Math.PI * 2, 56), mat('#d8f0ff', { emit: 0.4, transparent: true, opacity: 0.7, depthWrite: false }), 0, 0.08, 0, g)).rotation.x = Math.PI / 2;
      ns(mesh(sphere(0.55, 14, 10), glow('#fff2a0'), 0, R * 0.5, -R * 0.84, g));
      for (const [a, d] of [[0.6, 0.45], [2.6, 0.5], [4.4, 0.4]]) {
        const x = Math.sin(a) * R * d, z = Math.cos(a) * R * d;
        const tr = ns(mesh(cyl(0.12, 0.2, 3.2, 6), mat('#8a6a3a'), x, 1.6, z, g)); tr.rotation.z = 0.15;
        for (let i = 0; i < 6; i++) { const lf = ns(mesh(box(0.25, 0.04, 1.5), mat('#3a9a3a'), x + 0.25 + Math.sin(i) * 0.5, 3.15, z + Math.cos(i) * 0.5, g)); lf.rotation.set(0.45, (i / 6) * Math.PI * 2, 0); }
        ns(mesh(sphere(0.18, 6, 5), mat('#6a4a2a'), x + 0.22, 3.0, z, g));
      }
      const cols = ['#f08a3a', '#3ab8c8', '#e85a8a', '#f6d84a'];
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39996, el = 0.25 + (i % 5) * 0.2, rr = R * 0.93;
        const x = Math.sin(a) * Math.cos(el) * rr, y = Math.sin(el) * rr, z = Math.cos(a) * Math.cos(el) * rr;
        const f = ns(mesh(sphere(0.25, 8, 6), mat(cols[i % 4], { spec: 0.6 }), x, y, z, g)); f.scale.set(1.6, 0.8, 0.5); f.rotation.y = a;
        const t = ns(mesh(cone(0.2, 0.3, 4), mat(cols[i % 4]), x - Math.cos(a) * 0.45, y, z + Math.sin(a) * 0.45, g)); t.rotation.set(0, a, Math.PI / 2);
      }
      return true;
    }
    case 'jk_dom_mahito': { // darkness, and hands everywhere
      const R = DOM_R.mahito;
      domeMesh(H, g, R, '#24182e', 0.6, '#6a3a8a');
      ns(mesh(H.geo('jkmh-floor', () => new T.CircleGeometry(R, 40).rotateX(-Math.PI / 2)), mat('#140e1a', { transparent: true, opacity: 0.8, depthWrite: false }), 0, 0.05, 0, g));
      const skin = mat('#e2d6cc', { spec: 0.15 }), pale = mat('#c9c0b8', { spec: 0.15 });
      for (let i = 0; i < 22; i++) { // out of the dome, reaching in
        const a = i * 2.39996, el = 0.15 + (i % 6) * 0.22, rr = R - 1.7;
        const p = new T.Vector3(Math.sin(a) * Math.cos(el) * rr, Math.sin(el) * rr, Math.cos(a) * Math.cos(el) * rr);
        hand(H, g, i % 3 ? skin : pale, p, p.clone().multiplyScalar(-1).add(new T.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1))), 1.1 + (i % 3) * 0.3, 0.2 + (i % 4) * 0.2);
      }
      for (let i = 0; i < 12; i++) { // out of the floor, grabbing up
        const a = i * 2.1 + 0.4, d = R * (0.3 + (i % 4) * 0.17);
        hand(H, g, i % 2 ? skin : pale, new T.Vector3(Math.sin(a) * d, 0.5, Math.cos(a) * d), new T.Vector3(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)), 0.9 + (i % 3) * 0.2, 0.5);
      }
      ns(mesh(torus(H, R, 0.08, Math.PI * 2, 56), glow('#9a6aff'), 0, 0.1, 0, g)).rotation.x = Math.PI / 2;
      return true;
    }
    case 'jk_dom_jogo': { // inside a volcano: black rock, rivers of lava, smoking cones
      const R = DOM_R.jogo;
      domeMesh(H, g, R, '#8a2008', 0.42, '#ff6a1a');
      ns(mesh(H.geo('jkjg-floor', () => new T.CircleGeometry(R, 40).rotateX(-Math.PI / 2)), mat('#2a1a14', { transparent: true, opacity: 0.9, depthWrite: false }), 0, 0.05, 0, g));
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3; const L = R * (0.4 + (i % 3) * 0.15); const c = ns(mesh(box(0.18, 0.04, L), glow('#ff6a10'), Math.sin(a) * L * 0.5, 0.08, Math.cos(a) * L * 0.5, g)); c.rotation.y = a; }
      for (const [x, z, k] of [[1.5, 1.0, 1.2], [-2.0, -1.5, 1.0], [0.5, -3.0, 0.9], [-3.0, 2.5, 0.8]]) ns(mesh(cyl(k, k, 0.06, 14), glow('#ff8a20'), x, 0.07, z, g));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, d = R * 0.78, h = 2.4 + (i % 3) * 0.7;
        const x = Math.sin(a) * d, z = Math.cos(a) * d;
        ns(mesh(cone(1.3, h, 9), mat('#3a2620', { spec: 0.05 }), x, h / 2, z, g));
        ns(mesh(cyl(0.35, 0.35, 0.1, 10), glow('#ff6a10'), x, h - 0.35, z, g));
        for (let k = 0; k < 2; k++) ns(mesh(sphere(0.45 + k * 0.2, 8, 6), mat('#5a504a', { transparent: true, opacity: 0.45, depthWrite: false }), x, h + 0.4 + k * 0.7, z, g));
      }
      return true;
    }
    case 'jk_dom_hakari': { // Idle Death Gamble: a neon pachinko parlour
      const R = DOM_R.hakari;
      domeMesh(H, g, R, '#ff3ab0', 0.24, '#3affd8');
      ns(mesh(H.geo('jkhk-floor', () => new T.CircleGeometry(R, 40).rotateX(-Math.PI / 2)), mat('#2a1038', { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0.05, 0, g));
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ns(mesh(box(0.6, 0.04, 0.6), mat(i % 2 ? '#ffd84a' : '#3affd8', { emit: 0.8 }), Math.sin(a) * R * 0.5, 0.08, Math.cos(a) * R * 0.5, g)).rotation.y = a; }
      for (const [y, c] of [[2.0, '#ffd84a'], [3.6, '#3affd8'], [4.8, '#ff6ad8']]) { const rr = Math.sqrt(R * R - y * y) * 0.98; ns(mesh(torus(H, rr, 0.06, Math.PI * 2, 48), glow(c), 0, y, 0, g)).rotation.x = Math.PI / 2; }
      for (let i = 0; i < 6; i++) { // pachinko machines round the wall, facing in
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6, d = R * 0.8;
        const m = new T.Group(); m.position.set(Math.sin(a) * d, 0, Math.cos(a) * d); m.rotation.y = a + Math.PI; g.add(m);
        ns(mesh(box(1.4, 2.6, 0.5), mat('#c8c0d8', { spec: 0.8 }), 0, 1.3, 0, m));
        ns(mesh(cyl(0.55, 0.55, 0.05, 20), mat('#f4f0f8', { emit: 0.3 }), 0, 1.65, 0.26, m)).rotation.x = Math.PI / 2;
        for (let k = 0; k < 12; k++) ns(mesh(sphere(0.04, 4, 3), mat('#d8c060', { spec: 1 }), Math.sin(k * 2.4) * 0.42, 1.65 + Math.cos(k * 1.9) * 0.42, 0.3, m));
        ns(mesh(box(1.5, 0.12, 0.55), glow(i % 2 ? '#ff3ab0' : '#3affd8'), 0, 2.62, 0, m));
        ns(mesh(box(1.0, 0.25, 0.3), mat('#2a2a34'), 0, 0.7, 0.3, m));
        if (i === 0) for (let k = -1; k <= 1; k++) sevenAt(H, m, k * 0.32, 1.65, 0.31, 0.28, glow('#e8202a'));
      }
      return true;
    }
  }
  return false;
}
// a red "7" (a bar and a slanted stroke), size s, facing +Z
function sevenAt(H, g, x, y, z, s, m) {
  ns(H.mesh(H.box(s * 0.6, s * 0.14, s * 0.06), m, x, y + s * 0.36, z, g));
  const d = ns(H.mesh(H.box(s * 0.14, s * 0.78, s * 0.06), m, x + s * 0.05, y - s * 0.05, z, g)); d.rotation.z = -0.35;
}

register({
  units,
  items: {
    jk_isoh: { len: 0.75, r: 0.07, grip: 30, metal: true, mass: 1.2 },
    jk_palm: { len: 0.32, r: 0.12, grip: 90, phys: false },
    jk_fist: { len: 0.36, r: 0.11, grip: 90, phys: false },
    jk_woodfist: { len: 0.42, r: 0.13, grip: 90, phys: false },
  },
  kinds: { jk_toji: toji, jk_dagon: dagon, jk_mahito: mahito, jk_jogo: jogo, jk_hanami: hanami, jk_geto: geto, jk_choso: choso, jk_hakari: hakari },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
  battleStep(b, dt) { stepFields(b, dt); },
});
