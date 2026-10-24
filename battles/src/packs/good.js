// Good: Shield Bearer (a huge tower shield that blocks and bulldozes), Cleric (a heal
// beam on the most hurt ally), Angel (flies, holy sword dives, brings one fallen ally
// back to life), Phoenix (flies, dives in a fiery explosion and rises from its ashes
// once), Super Peasant (flies about and punches people into orbit).
import { register } from '../ext.js';
import { ATTACKS } from '../pose.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, crossed, inFront, blast, addStatus,
  torus, tube, dome, headBand, tcol, tdark, chestShell, hoodGeo,
} from './common.js';
import { valkInit, valkThink, valkStep, wingLayout, restSt, VALK } from './sm-valkyrie.js';
import {
  UPY, revivable, keepsKind, revive, reequip, markAt, refreshBeam, endBeam, supportMove, hover, STANCE, setArmKey,
} from './ges-core.js';

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _o = new THREE.Vector3();
const GOLD = '#f0c03c', WHITE = '#f8f5ec', HOLY = '#fff3b0';

// ------------------------------------------------------------------ animations
ATTACKS.gd_bash = [ // shield arm pulled back, then rammed forward with the body behind it
  [0.0, null, null, 0, 0, 0],
  [0.3, [0.85, 0.1, -0.85, -1.9], null, 0.35, -0.2, 0.18],
  [0.45, [0.75, 0.05, -1.5, -1.6], null, -0.25, 0.5, 0.05],
  [0.72, [0.75, 0.05, -1.45, -1.6], null, -0.2, 0.4, 0.1],
  [1.0, null, null, 0, 0, 0],
];
// Super Peasant hovering: fists on the hips, chest out
STANCE.gd_super = (st, pose) => {
  for (const sd of [1, -1]) setArmKey(pose, sd, [1.1, 0.85, 0.45, -1.6]);
};

// ------------------------------------------------------------------ kinds
// Shield Bearer: the tower shield takes most frontal hits (the core blocks melee;
// this blocks shots and blasts from the front too), bashes, and shoves enemies
// out of its way as it walks.
const shieldBearer = {
  melee: true,
  init(u) {
    // a bigger board than the core shields
    const h = u.shield(), s = u.s;
    if (!h) return;
    u.battle.world.removeCollider(h.collider, true);
    h.shape = { box: [0.05 * s, 0.62 * s, 0.4 * s], cy: 0 };
    h.mass = 8 * s * s * s;
    h.collider = u.rag.attach(h.part, u.heldCollider(h, true), h.mass, h.lp);
    u.reachDist = 1.15 * s;
  },
  think(u, dt, c) { return meleeThink(u, dt, c); },
  event(u, t0, t1) {
    const b = u.battle, w = u.def.weapon, h = u.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    if (crossed(t0, t1, 0.32)) u.rag.impulseAll(fx * u.M * 3, 0, fz * u.M * 3);
    if (!crossed(t0, t1, 0.45)) return;
    const p = u.pos, R = 1.9 * u.s;
    let any = false;
    b.grid.query(p.x, p.z, R + 1, (v) => {
      if (v.team === u.team || !v.alive) return;
      const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > R + v.skel.radius || !inFront(u, v.pos.x, v.pos.z, 0.35)) return;
      any = true;
      const k = u.buff > 0 ? 1.15 : 1;
      const f = Math.min(w.force * k, v.M * 11);
      _d.set(fx * 0.8 + dx / (d || 1) * 0.2, 0.35, fz * 0.8 + dz / (d || 1) * 0.2).normalize();
      v.hit(w.damage * k, PART.chest, _d.x * f * 0.3, _d.y * f * 0.3, _d.z * f * 0.3, u, 'melee');
      v.rag.impulseAll(_d.x * f * 0.7, _d.y * f * 0.7, _d.z * f * 0.7);
      v.stun = Math.max(v.stun, 0.9 * (v.def.stagger ?? 1));
    });
    const sh = u.shield();
    if (any && sh) { b.emit('spark', sh.pos.x, sh.pos.y, sh.pos.z, 6); b.sound('shield', sh.pos, 1.0, 0.75); }
  },
  step(u, dt) {
    // bulldoze: enemies right in front get pushed along while it walks
    if (u.st.attack || u.stun > 0 || u.isDown()) return;
    const b = u.battle, p = u.pos, h = u.heading, fx = Math.sin(h), fz = Math.cos(h);
    const v0 = u.rag.vel[PART.pelvis], fwd = v0.x * fx + v0.z * fz;
    if (fwd < 0.8) return;
    b.grid.query(p.x, p.z, 2.5, (v) => {
      if (v.team === u.team || !v.alive || v.s > u.s * 1.4) return;
      const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > u.skel.radius + v.skel.radius + 0.75 * u.s || (dx * fx + dz * fz) < d * 0.6) return;
      const k = v.M * 7 * dt;
      v.rag.impulseAll(fx * k, k * 0.1, fz * k);
    });
  },
  hit(u, amount, part, att, kind) {
    if (kind === 'melee' || kind === 'burn' || kind === 'poison' || kind === 'slow' || kind === 'time' || kind === 'wind' || u.stun > 0 || u.isDown() || !u.shield()) return amount;
    if (!att || !inFront(u, att.pos.x, att.pos.z, 0.3)) return amount;
    if (kind === 'blast') return amount * 0.55;
    const sh = u.shield();
    u.battle.emit('spark', sh.pos.x, sh.pos.y, sh.pos.z, 3);
    u.battle.sound('block', sh.pos, 0.6, 0.8);
    return amount * 0.2;
  },
};

// Cleric: a beam of light from the staff heals the most hurt ally in range, all the
// time; it hides behind the line and only punches when cornered.
const cleric = {
  melee: true,
  init(u) { u.beam = {}; u.healSnd = 0; },
  think(u, dt, c) {
    const b = u.battle, w = u.def.weapon;
    const friend = b.mostHurtAlly(u, w.range + 4);
    const alone = !b.allyAnchor(u) && !friend;
    if (alone) {
      u.patient = null;
      if (u.cooldown <= 0 && !u.st.attack && c.dist - c.t.skel.radius < u.reachDist + 0.3) u.startAttack('punchy');
      if (c.dist - c.t.skel.radius > u.reachDist * 0.8) u.desired.set(c.dirx * c.spd, 0, c.dirz * c.spd);
      return c.t;
    }
    supportMove(u, c);
    u.patient = null;
    if (friend) {
      const d = Math.hypot(friend.pos.x - u.pos.x, friend.pos.z - u.pos.z);
      if (d < w.range) u.patient = friend;
      else u.desired.set((friend.pos.x - u.pos.x) / d * c.spd, 0, (friend.pos.z - u.pos.z) / d * c.spd);
    }
    return u.patient || (c.gap < 10 ? c.t : null);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (u.control) u.patient = b.mostHurtAlly(u, w.range);
    const f = u.patient;
    const on = f && f.alive && f.hp < f.maxHp && u.stun <= 0 && !u.isDown() && !u.st.attack;
    u.st.gdBeam = !!on;
    if (!on) { endBeam(u.beam); return; }
    f.hp = Math.min(f.maxHp, f.hp + w.heal * dt);
    // from the sun on top of the staff (held pointing forward) to the patient's chest
    u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0.85 * u.s, _o);
    refreshBeam(b, u.beam, u, _o, f.chestPos, 'gd_beam', 0.8);
    u.healSnd -= dt;
    if (u.healSnd <= 0) {
      u.healSnd = 1.2;
      const c = f.chestPos;
      b.emit('heal', c.x, c.y, c.z, 4);
      b.sound('heal', c, 0.35, 1.25);
    }
  },
  die(u) { endBeam(u.beam); u.st.gdBeam = false; },
};

// Angel: a Valkyrie-style flyer (src/packs/sm-valkyrie.js) with a holy sword; once per
// battle she lands by a fallen ally and raises it, weapons and all, at full health.
function angelCorpse(u) {
  const b = u.battle;
  let best = null, bd = 35 * 35;
  for (const v of b.teams[u.team]) {
    if (v === u || v.zombie || !revivable(v, b) || !keepsKind(v)) continue;
    const d = (v.pos.x - u.pos.x) ** 2 + (v.pos.z - u.pos.z) ** 2;
    // the most valuable ally first, if it is not much further away
    const score = d / Math.max(1, v.def.cost / 150);
    if (score < bd) { bd = score; best = v; }
  }
  return best;
}
const angel = {
  melee: true,
  init(u) { valkInit(u); u.revives = u.def.weapon.revives; u.lookR = 0; },
  think(u, dt, c) {
    const f = u.sm, b = u.battle;
    u.lookR -= dt;
    if (u.revives > 0 && !u.raise && u.lookR <= 0 && u.stun <= 0 && f.state !== 'dive' && f.state !== 'strike') {
      u.lookR = 0.5;
      const v = angelCorpse(u);
      if (v) { u.raise = v; f.state = 'gd_raise'; f.t = 0; }
    }
    if (u.raise) {
      const v = u.raise;
      if (v.alive || !revivable(v, b) || f.t > 9) { u.raise = null; f.state = 'climb'; f.t = 0; return c.t; }
      f.t += dt;
      const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz);
      f.alt = d < 6 ? 1.0 : VALK.alt;
      const sp = clamp(d * 1.2, 1.5, VALK.cruise);
      u.desired.set(dx / (d || 1) * sp, 0, dz / (d || 1) * sp);
      u.expr = EXPR.happy;
      if (d < 1.8 && u.groundGap() < 1.4) {
        revive(b, v, v.team, 1);
        reequip(b, v);
        u.revives--;
        u.raise = null;
        f.state = 'climb'; f.t = 0; f.cx = -dx / (d || 1); f.cz = -dz / (d || 1);
        const gy = b.terrain.height(v.pos.x, v.pos.z);
        markAt(b, 'gd_light', _p.set(v.pos.x, gy, v.pos.z), 1.4);
        b.emit('healring', v.pos.x, gy + 0.1, v.pos.z, 3);
        b.emit('heal', v.chestPos.x, v.chestPos.y, v.chestPos.z, 14);
        b.sound('heal', v.pos, 1.2, 0.7);
        b.sound('gong', v.pos, 0.5, 1.6);
        b.voice(v, 'cheer', true);
      }
      return v;
    }
    return valkThink(u, dt, c);
  },
  event(u, t0, t1) {
    // a flash of holy light as the blade comes down
    if (!crossed(t0, t1, 0.55)) return;
    u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset - 0.9 * u.s, 0, _o);
    u.battle.emit('spark', _o.x, _o.y, _o.z, 5);
    u.battle.sound('clang', _o, 0.5, 1.8);
  },
  step: valkStep,
};

// Phoenix: circles high, then dives on a group and bursts into flames. The first time
// it "dies" (in a dive or from wounds) it falls as a pile of embers, then rises again
// at full health; the second time is for good.
const PHX = { alt: 5.5, cruise: 7.5, dive: 15, ash: 3.5 };
const phoenix = {
  init(u) { valkInit(u); u.sm.alt = PHX.alt; u.trailT = 0; },
  think(u, dt, c) {
    const f = u.sm, b = u.battle, t = c.t;
    if (u.ash > 0) { u.expr = EXPR.dead; return null; }
    f.t += dt;
    u.expr = EXPR.angry;
    const { dist, dirx, dirz } = c;
    if (f.state === 'dive') {
      const tc = t.chestPos, tgy = b.terrain.height(t.pos.x, t.pos.z);
      const low = Math.max(0.4, tc.y - tgy - (u.chestPos.y - u.pos.y));
      f.alt = low + (PHX.alt - low) * clamp((dist - 2) / 9, 0, 1);
      u.desired.set(dirx * PHX.dive, 0, dirz * PHX.dive);
      const d3 = u.chestPos.distanceTo(tc);
      if (d3 < 1.6 * Math.max(1, t.s * 0.8) || (f.t > 0.5 && u.groundGap() < 0.25 && dist < 4)) { phoenixBurst(u); return t; }
      if (f.t > 4) { f.state = 'climb'; f.t = 0; f.cx = dirx; f.cz = dirz; }
      return t;
    }
    if (f.state === 'climb') {
      f.alt = PHX.alt + 1;
      u.desired.set((f.cx ?? 0) * PHX.cruise, 0, (f.cz ?? 0) * PHX.cruise);
      if (f.t > 1.5) { f.state = 'cruise'; f.t = 0; }
      return null;
    }
    f.state = 'cruise';
    f.alt = PHX.alt + Math.sin(b.time * 0.8 + u.id) * 0.4;
    if (dist > 9) u.desired.set(dirx * PHX.cruise, 0, dirz * PHX.cruise);
    else { const sd = u.id % 2 ? 1 : -1; u.desired.set(dirx * (dist - 7) * 0.5 - dirz * sd * 4, 0, dirz * (dist - 7) * 0.5 + dirx * sd * 4); }
    if (dist < 16 && u.cooldown <= 0 && u.stun <= 0) {
      f.state = 'dive'; f.t = 0; u.cooldown = u.def.weapon.cooldown;
      b.sound('fire', u.pos, 1.0, 0.6); b.sound('whoosh', u.pos, 0.9, 0.6);
    }
    return t;
  },
  step(u, dt) {
    const b = u.battle;
    if (u.ash > 0) {
      u.ash -= dt;
      u.stun = Math.max(u.stun, 0.5);
      u.sm.flying = false; u.st.smFly = false;
      if (u.ash <= 0) phoenixRise(u);
      return;
    }
    if (u.control) {
      // possessed: skim low; the attack button bursts into flame where it is
      u.sm.alt = 1.4; u.sm.state = 'cruise';
      if (u.st.attack) { u.st.attack = null; phoenixBurst(u); if (!u.alive || u.ash > 0) return; }
    }
    valkStep(u, dt);
    u.trailT -= dt;
    if (u.trailT <= 0) {
      u.trailT = u.sm.state === 'dive' ? 0.03 : 0.09;
      const c = u.chestPos;
      b.emit('trail', c.x + rand(-0.3, 0.3), c.y + rand(-0.2, 0.3), c.z + rand(-0.3, 0.3), Math.random() < 0.5 ? 1 : 0);
    }
  },
  hit(u, amount) {
    if (u.ash > 0) return 0;
    if (!u.reborn && amount >= u.hp) { phoenixAsh(u); return 0; }
    return amount;
  },
};
function phoenixBurst(u) {
  const b = u.battle, w = u.def.weapon, c = u.chestPos.clone();
  blast(b, c, w.blast, w.damage, w.force, u, {
    fx: 2, friendly: 0.25, sound: 'boom', vol: 1.3, pitch: 0.8,
    onUnit: (v) => addStatus(b, v, 'burn', w.burnTime, w.burn, u),
  });
  b.sound('fire', c, 1.4, 0.7);
  if (!u.reborn) phoenixAsh(u);
  else { u.hp = 0; u.die(null); }
}
function phoenixAsh(u) {
  const b = u.battle, p = u.pos;
  u.reborn = true;
  u.ash = PHX.ash;
  u.hp = 1;
  u.st.attack = null;
  u.sm.state = 'cruise'; u.sm.t = 0;
  u.stun = 1;
  const gy = b.terrain.height(p.x, p.z);
  markAt(b, 'gd_embers', _p.set(p.x, gy, p.z), PHX.ash + 0.3);
  b.emit('explode', p.x, p.y, p.z, 1.6, 2);
  b.sound('fire', p, 1.0, 0.5);
  b.voice(u, 'die', true);
}
function phoenixRise(u) {
  const b = u.battle, p = u.pos;
  u.ash = 0;
  u.stun = 0;
  u.hp = u.maxHp;
  u.sm.state = 'climb'; u.sm.t = 0; u.sm.cx = 0; u.sm.cz = 0;
  b.emit('explode', p.x, p.y + 0.4, p.z, 2.6, 2);
  b.emit('heal', p.x, p.y + 0.5, p.z, 10);
  b.sound('fire', p, 1.3, 1.2);
  b.sound('whoosh', p, 1.0, 0.7);
  b.voice(u, 'cry', true);
  u.rag.impulseAll(0, u.M * 6, 0);
}

// Super Peasant: hovers at head height with fists on hips, then shoots fist first at
// a target (body flat out, superman style) and punches it into the distance.
const SP = { alt: 0.35, cruise: 6.5, zoom: 17 };
// zoom at target t (and the recoil after the punch); shared by the AI and possession
function zoomTick(u, dt, t) {
  const s = u.sp;
  if (!t || !t.alive) { s.state = 'hover'; s.t = 0; return; }
  const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
  if (s.state === 'zoom') {
    u.desired.set(dx / d * SP.zoom, 0, dz / d * SP.zoom);
    u.faceYaw = Math.atan2(dx, dz);
    if (u.headPos.distanceTo(t.chestPos) < 1.0 + t.skel.radius) { superPunch(u, t); s.state = 'recoil'; s.t = 0; s.rx = -dx / d; s.rz = -dz / d; }
    else if (s.t > 2.2) { s.state = 'hover'; s.t = 0; }
  } else if (s.state === 'recoil') {
    u.desired.set(s.rx * 5, 0, s.rz * 5);
    if (s.t > 0.55) { s.state = 'hover'; s.t = 0; }
  }
}
function startZoom(u, t) {
  const s = u.sp, b = u.battle;
  s.state = 'zoom'; s.t = 0; s.zt = t;
  u.cooldown = u.def.weapon.cooldown * rand(0.85, 1.15);
  b.sound('whoosh', u.pos, 1.0, 0.7);
  if (Math.random() < 0.6) b.voice(u, 'cry');
}
const superPeasant = {
  init(u) { u.sp = { state: 'hover', t: 0, zt: null }; u.rag.impulseAll(0, u.M * 3, 0); },
  think(u, dt, c) {
    const s = u.sp, t = c.t;
    const { dist, dirx, dirz } = c;
    s.t += dt;
    u.expr = s.state === 'zoom' ? EXPR.angry : EXPR.happy;
    if (s.state !== 'hover') { zoomTick(u, dt, s.zt); return s.zt || t; }
    const want = 6;
    if (dist > want + 1.5) u.desired.set(dirx * SP.cruise, 0, dirz * SP.cruise);
    else if (dist < want - 1.5) u.desired.set(-dirx * 3, 0, -dirz * 3);
    if (dist < 13 && u.cooldown <= 0 && u.stun <= 0) startZoom(u, t);
    return t;
  },
  step(u, dt) {
    const s = u.sp, b = u.battle;
    if (u.control) {
      // possessed: the attack button launches a zoom at the enemy most in front
      s.t += dt;
      if (u.st.attack && s.state === 'hover') {
        u.st.attack = null;
        let best = null, bs = -Infinity;
        const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
        for (const v of b.units) {
          if (!v.alive || v.team === u.team) continue;
          const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz);
          if (d > 14 || (dx * fx + dz * fz) < d * 0.7) continue;
          const sc = (dx * fx + dz * fz) / d - d * 0.03;
          if (sc > bs) { bs = sc; best = v; }
        }
        if (best) startZoom(u, best);
      }
      if (s.state !== 'hover') zoomTick(u, dt, s.zt);
    }
    const stunned = u.stun > 0.3;
    // a stunned super peasant drops a bit, then flies on (he is very hard to keep down)
    if (stunned) { u.rag.impulseAll(0, u.M * 9.81 * 0.6 * dt, 0); u.st.gsSuper = 0; u.st.gsFly = false; return; }
    u.stun = Math.min(u.stun, 0.3);
    let alt = u.skel.standHeight + SP.alt;
    if (s.state === 'zoom' && s.zt) {
      // fly at the target's chest, head first
      const tc = s.zt.chestPos, gy = b.terrain.height(u.pos.x, u.pos.z);
      alt = clamp(tc.y - gy - (u.headPos.y - u.pos.y) * 0.25, 0.4, 4);
    }
    hover(u, dt, alt, s.state === 'zoom' ? 9 : 5, s.state === 'zoom' ? 40 : 20);
    u.st.gsSuper = s.state === 'zoom' ? 1 : 0;
    u.st.gsFly = true;
  },
};
function superPunch(u, v) {
  const b = u.battle, w = u.def.weapon, c = v.chestPos;
  _d.set(c.x - u.pos.x, 0, c.z - u.pos.z).normalize();
  _d.y = 0.45; _d.normalize();
  const k = u.buff > 0 ? 1.15 : 1;
  const f = Math.min(w.force * k, v.M * 30);
  v.hit(w.damage * k, PART.chest, _d.x * f * 0.3, _d.y * f * 0.3, _d.z * f * 0.3, u, 'melee');
  v.rag.impulseAll(_d.x * f * 0.7, _d.y * f * 0.7, _d.z * f * 0.7);
  v.stun = Math.max(v.stun, 1.4 * (v.def.stagger ?? 1));
  // the shockwave knocks the people around the target over too
  b.grid.query(c.x, c.z, 3, (o) => {
    if (o === v || o.team === u.team || !o.alive) return;
    const dx = o.pos.x - c.x, dz = o.pos.z - c.z, d = Math.hypot(dx, dz);
    if (d > 2.2) return;
    const g = Math.min(w.force * 0.3, o.M * 9) * (1 - d / 2.4);
    o.hit(w.damage * 0.25 * k, PART.chest, 0, 0, 0, u, 'melee');
    o.rag.impulseAll(dx / (d || 1) * g, g * 0.5, dz / (d || 1) * g);
    o.stun = Math.max(o.stun, 0.8);
  });
  b.emit(v.def.armor > 0.3 ? 'spark' : 'blood', c.x, c.y, c.z, 10, _d.x, _d.z);
  b.emit('dust', c.x, c.y - 0.5, c.z, 3);
  b.sound('punch', c, 1.6, 0.6);
  b.sound('boom', c, 0.5, 1.6);
  u.rag.impulseAll(-_d.x * u.M * 4, u.M * 2, -_d.z * u.M * 4);
}

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'gd_shield_bearer', name: 'Shield Bearer', faction: 'good', cost: 180, hp: 190, speed: 3.9,
    build: { scale: 1.08, girth: 1.15, mass: 1.35 },
    weapon: { line: 'Defender · huge shield blocks from the front, bashes and shoves', kind: 'gd_shield', style: 'shield', anim: 'gd_bash', item: 'none', shield: 'wood', damage: 10, reach: 1.1, cooldown: 1.5, force: 560, blockMelee: 0.6 },
    look: { skin: '#f2c8a0', hat: 'gd_helm', top: 'gd_tabard', legs: '#8d939c' },
    personality: { aggro: 0.95, bravery: 0, voice: 0.85, chatter: 0.4, cry: 'charge', idle: 'brace' },
    stagger: 0.55,
    desc: 'A wall on legs. Blocks almost anything from the front and shoves enemies back.',
  },
  {
    id: 'gd_cleric', name: 'Cleric', faction: 'good', cost: 220, hp: 110, speed: 4.2,
    build: { scale: 0.98, girth: 1.02, head: 1.02 },
    weapon: { line: 'Support · a beam of light heals the most hurt ally', kind: 'gd_cleric', style: 'staff', anim: 'cast', item: 'gd_sun_staff', heal: 32, range: 11, damage: 10, reach: 1.0, cooldown: 1.1, force: 90 },
    look: { skin: '#f2c8a0', hat: 'gd_mitre', top: 'gd_vestment', legs: '#f0ece0' },
    personality: { aggro: 0.05, bravery: 0.45, voice: 1.2, chatter: 0.6, cry: 'la', idle: 'pray' },
    desc: 'Keeps a beam of holy light on whoever is hurt the most.',
  },
  {
    id: 'gd_angel', name: 'Angel', faction: 'good', cost: 900, hp: 540, speed: 6.5,
    build: { scale: 1.05, girth: 0.95 },
    weapon: { line: 'Flying · holy sword dives · revives one fallen ally', kind: 'gd_angel', style: 'sword', anim: 'overhead', item: 'gd_holy_sword', damage: 85, reach: 1.45, cooldown: 1.4, force: 480, sweep: true, revives: 1 },
    look: { skin: '#f6d8bc', hat: 'gd_halo', top: 'gd_robe', legs: '#f4f0e4' },
    personality: { aggro: 1, bravery: 0, voice: 1.35, chatter: 0.5, cry: 'la', idle: 'float' },
    armor: 0.2, stagger: 0.45,
    desc: 'Swoops down with a holy blade, and raises one fallen friend back to the fight.',
  },
  {
    id: 'gd_phoenix', name: 'Phoenix', faction: 'good', cost: 950, hp: 380, speed: 7,
    build: { scale: 1.05, girth: 0.9, head: 1.0, mass: 0.9 },
    weapon: { line: 'Flying · fiery dive explosion · rises from its ashes once', kind: 'gd_phoenix', style: 'none', anim: 'punch', item: 'none', damage: 170, blast: 4.2, force: 950, cooldown: 1.2, reach: 1.0, burn: 9, burnTime: 4 },
    look: { skin: '#ff9a3a', hat: 'gd_phoenix', top: 'gd_feathers', legs: '#e8572a' },
    personality: { aggro: 1, bravery: 0, voice: 1.5, chatter: 0.6, cry: 'magic', idle: 'float' },
    stagger: 0.6,
    desc: 'Dives into the enemy in a burst of flame, and is reborn from the embers once.',
  },
  {
    id: 'gd_super_peasant', name: 'Super Peasant', faction: 'good', cost: 2700, hp: 1100, speed: 8,
    build: { scale: 1.0, girth: 1.05, head: 1.05, mass: 1.6 },
    weapon: { line: 'Flying · supersonic punches send units into orbit', kind: 'gd_super', style: 'gd_super', anim: 'punch', item: 'none', damage: 120, force: 2600, reach: 1.2, cooldown: 1.25 },
    look: { skin: '#f0c49a', hat: 'gd_super_hair', top: 'gd_super', legs: '#6e5235', cape: true },
    personality: { aggro: 1, bravery: 0, voice: 0.9, chatter: 0.8, cry: 'hey', idle: 'regal' },
    armor: 0.1, stagger: 0.15,
    desc: 'Just a peasant. Who can fly. And punch through walls.',
  },
];

// ------------------------------------------------------------------ visuals
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, wood, leather, glow } = H;
  const tc = tcol(H, team);
  if (name === 'gd_sun_staff') { // white staff with a golden sun on top (held centred)
    const L = 1.8 * s;
    mesh(cyl(0.03 * s, 0.035 * s, L, 8), mat(WHITE), 0, 0, 0, g);
    for (const y of [-0.3, 0.25]) mesh(cyl(0.042 * s, 0.042 * s, 0.05 * s, 8), gold(), 0, y * L, 0, g);
    mesh(cyl(0.05 * s, 0.05 * s, 0.12 * s, 8), tc, 0, 0.05 * L, 0, g);
    const top = L / 2 + 0.1 * s;
    mesh(sphere(0.1 * s, 12, 10), glow(HOLY), 0, top, 0, g);
    const ring = mesh(torus(H, 0.15 * s, 0.022 * s, Math.PI * 2, 16), gold(), 0, top, 0, g); ring.rotation.y = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = mesh(cone(0.03 * s, 0.12 * s, 4), gold(), 0, top + Math.cos(a) * 0.21 * s, Math.sin(a) * 0.21 * s, g);
      r.rotation.x = a;
    }
    return true;
  }
  if (name === 'gd_holy_sword') { // a long shining blade with gold wings on the guard
    const L = 1.25 * s, bw = 0.1 * s;
    mesh(box(0.024 * s, L * 0.78, bw), mat('#eef4ff', { spec: 1, emit: 0.35 }), 0, L * 0.6, 0, g);
    mesh(cone(bw * 0.72, bw * 1.3, 4), mat('#eef4ff', { spec: 1, emit: 0.35 }), 0, L * 0.99 + bw * 0.3, 0, g).scale.set(0.2, 1, 1);
    mesh(box(0.03 * s, L * 0.62, bw * 0.22), glow(HOLY), 0, L * 0.58, 0, g);
    for (const sd of [-1, 1]) { const wv = mesh(sphere(0.1 * s, 8, 6), gold(), 0, L * 0.2 + 0.03 * s, sd * 0.13 * s, g); wv.scale.set(0.3, 0.6, 1.4); wv.rotation.x = sd * 0.5; }
    mesh(cyl(0.03 * s, 0.03 * s, L * 0.17, 8), mat(WHITE), 0, L * 0.1, 0, g);
    mesh(sphere(0.05 * s, 10, 8), tc, 0, 0, 0, g);
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'gd_helm': { // round white-and-gold helmet, face open, team plume
      mesh(dome(H, r * 1.1, 0.55), mat('#e8ecf0', { spec: 0.9 }), 0, r * 0.25, 0, g).scale.set(1, 1.05, 1.02);
      headBand(H, r, 0.3, 0.2, gold(), g, 0.12);
      for (const sd of [-1, 1]) { const ch = mesh(box(r * 0.12, r * 0.75, r * 0.5), mat('#e8ecf0', { spec: 0.9 }), sd * r * 0.93, -r * 0.2, r * 0.18, g); ch.rotation.z = sd * 0.1; }
      mesh(box(r * 0.1, r * 0.5, r * 0.06), gold(), 0, r * 0.75, r * 0.95, g);
      for (let i = 0; i < 5; i++) { const p = mesh(sphere(r * 0.22, 8, 6), i % 2 ? WHITE_M(H) : tc, 0, r * (1.4 + Math.sin(i / 4 * Math.PI) * 0.22), r * (0.3 - i * 0.24), g); p.scale.set(0.45, 1, 1); }
      return true;
    }
    case 'gd_mitre': { // a tall bishop's mitre with a team cross
      const m = mesh(cyl(r * 0.55, r * 0.9, r * 1.3, 16), mat(WHITE), 0, r * 1.2, -r * 0.05, g); m.scale.set(1, 1, 0.75);
      mesh(cone(r * 0.56, r * 0.55, 16), mat(WHITE), 0, r * 2.12, -r * 0.05, g).scale.set(1, 1, 0.5);
      headBand(H, r, 0.62, 0.18, gold(), g, 0.08);
      mesh(box(r * 0.14, r * 0.85, r * 0.06), tc, 0, r * 1.35, r * 0.62, g);
      mesh(box(r * 0.55, r * 0.14, r * 0.06), tc, 0, r * 1.5, r * 0.6, g);
      return true;
    }
    case 'gd_halo': { // golden curls and a floating halo
      const hair = mat('#f2d06a', { spec: 0.25 });
      mesh(sphere(r * 1.04, 16, 12), hair, 0, r * 0.2, -r * 0.14, g).scale.set(1.03, 0.92, 1.0);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; mesh(sphere(r * 0.26, 8, 6), hair, Math.sin(a) * r * 0.85, r * (0.45 + Math.cos(a * 2) * 0.08), Math.cos(a) * r * 0.75 - r * 0.15, g); }
      const h = mesh(torus(H, r * 0.75, r * 0.09, Math.PI * 2, 24), glow('#ffe36a'), 0, r * 1.55, -r * 0.05, g); h.rotation.x = Math.PI / 2 - 0.25;
      return true;
    }
    case 'gd_phoenix': { // bird head: golden beak, glowing eyes, a crest of flame
      g.userData.hidesFace = true;
      const fe = mat('#ff8a2a'), fe2 = mat('#ffcf3a');
      mesh(sphere(r * 1.04, 16, 12), fe, 0, 0, 0, g);
      const bk = mesh(cone(r * 0.32, r * 0.9, 8), mat('#f6c23a', { spec: 0.7 }), 0, -r * 0.12, r * 1.25, g); bk.rotation.x = Math.PI / 2 + 0.25;
      const lo = mesh(cone(r * 0.22, r * 0.5, 8), mat('#d8962a', { spec: 0.5 }), 0, -r * 0.35, r * 1.05, g); lo.rotation.x = Math.PI / 2 + 0.6;
      for (const sd of [-1, 1]) {
        mesh(sphere(r * 0.22, 10, 8), mat('#fff8e0'), sd * r * 0.45, r * 0.22, r * 0.8, g);
        mesh(sphere(r * 0.11, 8, 6), mat('#2a1408'), sd * r * 0.5, r * 0.24, r * 0.98, g);
        const br = mesh(box(r * 0.4, r * 0.08, r * 0.06), mat('#a02010'), sd * r * 0.45, r * 0.5, r * 0.88, g); br.rotation.z = sd * 0.35;
      }
      for (let i = 0; i < 5; i++) {
        const f = mesh(cone(r * 0.2, r * (0.9 - Math.abs(i - 2) * 0.12), 6), i % 2 ? glow('#ffd84a') : glow('#ff6a1a'), 0, r * (1.05 + Math.sin(i / 4 * Math.PI) * 0.3), r * (0.4 - i * 0.32), g);
        f.rotation.x = -0.5 - i * 0.25; f.castShadow = false;
      }
      mesh(sphere(r * 0.2, 8, 6), tc, 0, -r * 0.85, r * 0.25, g).scale.set(1.6, 0.6, 1.2);
      return true;
    }
    case 'gd_super_hair': { // a peasant's mop of hair with a heroic curl
      const hair = mat('#6a4428', { spec: 0.15 });
      mesh(sphere(r * 1.05, 16, 12), hair, 0, r * 0.18, -r * 0.12, g).scale.set(1.04, 0.92, 1.0);
      mesh(tube(H, 'gdcurl' + r.toFixed(3), [[0, 0.95, 0.6], [0.05, 0.8, 0.95], [-0.08, 0.5, 1.0], [0.06, 0.38, 0.9]].map((p) => p.map((q) => q * r)), r * 0.12, r * 0.03), hair, 0, 0, 0, g);
      headBand(H, r, 0.5, 0.16, tc, g, 0.06);
      return true;
    }
  }
  return false;
}
const WHITE_M = (H) => H.mat(WHITE);

// wings for the flyers, at the Valkyrie's wing roots (sm-valkyrie.js)
function angelWing(H, team, sd) {
  const g = new THREE.Group(), { mesh, sphere, capsule, mat, gold } = H;
  const w = mat('#ffffff', { spec: 0.25 }), f2 = mat('#f2eee0', { spec: 0.2 }), tip = mat(team ? '#ffd8cc' : '#d8e6ff');
  mesh(sphere(0.08, 8, 6), gold(), 0, 0, 0, g);
  const bone = mesh(capsule(0.05, 0.85), w, sd * 0.45, 0.1, 0, g); bone.rotation.z = Math.PI / 2;
  mesh(sphere(0.5, 14, 8), w, sd * 0.5, 0.05, -0.12, g).scale.set(1.05, 0.12, 0.45);
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const o = mesh(sphere(0.36, 10, 6), i > 4 ? tip : i % 2 ? f2 : w, sd * (0.72 + k * 0.28), 0.02 - k * 0.06, -0.2 - k * 0.38, g);
    o.scale.set(1.3, 0.08, 0.22); o.rotation.y = sd * (0.12 + k * 0.75);
  }
  mesh(sphere(0.12, 8, 6), gold(), sd * 0.9, 0.12, 0, g).scale.set(1.2, 0.5, 0.6);
  return g;
}
function fireWing(H, team, sd) {
  const g = new THREE.Group(), { mesh, sphere, capsule, cone, mat, glow } = H;
  const red = mat('#e8452a', { emit: 0.3 }), org = glow('#ff9a2a'), yel = glow('#ffe060');
  mesh(sphere(0.08, 8, 6), red, 0, 0, 0, g);
  const bone = mesh(capsule(0.05, 0.8), red, sd * 0.42, 0.08, 0, g); bone.rotation.z = Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const o = mesh(sphere(0.34, 10, 6), i % 3 === 0 ? yel : i % 3 === 1 ? org : red, sd * (0.55 + k * 0.4), 0.02 - k * 0.06, -0.15 - k * 0.35, g);
    o.scale.set(1.3, 0.08, 0.2); o.rotation.y = sd * (0.1 + k * 0.8);
  }
  for (let i = 0; i < 4; i++) { const f = mesh(cone(0.07, 0.4, 5), yel, sd * (0.4 + i * 0.22), 0.12, -0.15 - i * 0.12, g); f.rotation.set(-0.6, 0, sd * -0.9); f.castShadow = false; }
  mesh(sphere(0.1, 8, 6), H.mat(H.TEAM_COLORS[team]), sd * 0.3, 0.12, 0, g).scale.set(1.2, 0.5, 0.6);
  return g;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'good') return;
  const { parts, skel, extraParts } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, metal, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team), wh = mat(WHITE);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const skirt = (m, len = 2.6, flare = 1.6) => { const k = mesh(cyl(pel.r * 1.12, pel.r * flare, pel.r * len, 16), m, 0, -pel.r * (len / 2 - 0.15), 0, P); k.scale.set(1, 1, 0.95); return k; };
  const sleeves = (m, wide = 1.3) => {
    for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) {
      const sp = skel.parts[p], fore = p === PART.farmL || p === PART.farmR;
      mesh(cyl(sp.r * 1.2, sp.r * (fore ? wide * 1.35 : 1.25), sp.hh * (fore ? 1.6 : 2.0), 10), m, 0, fore ? sp.hh * 0.2 : 0, 0, parts[p]);
    }
  };
  if (top === 'gd_tabard') { // mail shirt under a white tabard with a team sun
    chestShell(H, ch, mat('#a9b0b8', { spec: 0.8 }), C);
    const t = mesh(box(r * 1.5, (hh + r) * 1.9, r * 0.06), wh, 0, -r * 0.2, r * 1.0, C);
    t.rotation.x = -0.05;
    mesh(box(r * 1.5, (hh + r) * 1.9, r * 0.06), wh, 0, -r * 0.2, -r * 1.0, C);
    mesh(cyl(r * 0.36, r * 0.36, r * 0.05, 14), tc, 0, hh * 0.1, r * 1.04, C).rotation.x = Math.PI / 2;
    mesh(cyl(r * 0.18, r * 0.18, r * 0.06, 10), gold(), 0, hh * 0.1, r * 1.06, C).rotation.x = Math.PI / 2;
    mesh(cyl(r * 1.13, r * 1.15, r * 0.16, 14), leather(), 0, -hh - r * 0.38, 0, C);
    for (const sd of [-1, 1]) { const pd = mesh(sphere(r * 0.48, 12, 8), metal(), sd * r * 0.95, hh + r * 0.2, 0, C); pd.scale.set(1, 0.6, 1); }
    // the tower shield: replace the core board (the shield object on the left forearm)
    const sh = parts[PART.farmL].children.find((o) => o.isGroup && o.position.x > 0.01);
    if (sh) {
      for (const o of [...sh.children]) sh.remove(o);
      const s = skel.scale, W = 0.82 * s, Hh = 1.28 * s;
      mesh(box(0.08 * s, Hh, W), wh, 0, 0, 0, sh);
      mesh(box(0.1 * s, Hh + 0.06 * s, 0.06 * s), gold(), 0, 0, W / 2, sh);
      mesh(box(0.1 * s, Hh + 0.06 * s, 0.06 * s), gold(), 0, 0, -W / 2, sh);
      mesh(box(0.1 * s, 0.06 * s, W), gold(), 0, Hh / 2, 0, sh);
      mesh(box(0.1 * s, 0.06 * s, W), gold(), 0, -Hh / 2, 0, sh);
      mesh(box(0.06 * s, Hh * 0.8, W * 0.22), tc, 0.03 * s, 0, 0, sh);
      mesh(box(0.06 * s, Hh * 0.2, W * 0.75), tc, 0.03 * s, Hh * 0.12, 0, sh);
      mesh(sphere(0.11 * s, 12, 8), gold(), 0.06 * s, Hh * 0.12, 0, sh).scale.set(0.5, 1, 1);
      for (const [y, z] of [[0.42, 0.3], [-0.42, 0.3], [0.42, -0.3], [-0.42, -0.3]]) mesh(sphere(0.03 * s, 6, 5), gold(), 0.045 * s, y * Hh, z * W, sh);
    }
  }
  if (top === 'gd_vestment') { // white robe, gold stole with a team cross
    chestShell(H, ch, wh, C);
    skirt(wh, 2.8, 1.65);
    for (const sd of [-1, 1]) {
      const st = mesh(box(r * 0.28, (hh + r) * 2.2, r * 0.05), gold(), sd * r * 0.42, -r * 0.3, r * 1.0, C); st.rotation.z = sd * 0.06;
      mesh(box(r * 0.28, pel.r * 2.2, pel.r * 0.05), gold(), sd * pel.r * 0.42, -pel.r * 1.5, pel.r * 1.25, P);
    }
    mesh(box(r * 0.1, r * 0.5, r * 0.06), tc, r * 0.42, -r * 0.0, r * 1.04, C);
    mesh(box(r * 0.3, r * 0.1, r * 0.06), tc, r * 0.42, r * 0.1, r * 1.04, C);
    mesh(box(r * 0.1, r * 0.5, r * 0.06), tc, -r * 0.42, -r * 0.0, r * 1.04, C);
    mesh(box(r * 0.3, r * 0.1, r * 0.06), tc, -r * 0.42, r * 0.1, r * 1.04, C);
    mesh(cyl(r * 1.13, r * 1.15, r * 0.14, 14), tc, 0, -hh - r * 0.38, 0, C);
    sleeves(wh);
  }
  if (top === 'gd_robe') { // flowing white robe, gold belt, team sash
    chestShell(H, ch, wh, C);
    skirt(wh, 3.0, 1.75);
    const sash = mesh(box(r * 0.3, (hh + r) * 2.3, r * 0.06), tc, 0, 0, r * 1.02, C); sash.rotation.z = 0.55;
    const sb = mesh(box(r * 0.3, (hh + r) * 2.3, r * 0.06), tc, 0, 0, -r * 1.02, C); sb.rotation.z = -0.55;
    mesh(cyl(r * 1.14, r * 1.16, r * 0.15, 14), gold(), 0, -hh - r * 0.38, 0, C);
    mesh(H.geo('gdrobehem' + pel.r.toFixed(3), () => new THREE.TorusGeometry(pel.r * 1.72, pel.r * 0.08, 6, 20)), gold(), 0, -pel.r * 2.82, 0, P).rotation.x = Math.PI / 2;
    sleeves(wh, 1.4);
  }
  if (top === 'gd_feathers') { // flame-feathered body with a team sash
    chestShell(H, ch, mat('#e8572a'), C);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, y = (i % 3 - 1) * hh * 0.8;
      const f = mesh(sphere(r * 0.35, 8, 6), i % 2 ? mat('#ff9a2a') : mat('#ffc23a'), Math.sin(a) * r * 1.05, y, Math.cos(a) * r * 0.95, C);
      f.scale.set(0.7, 1.1, 0.25); f.rotation.y = a;
    }
    const sash = mesh(box(r * 0.32, (hh + r) * 2.3, r * 0.06), tc, 0, 0, r * 1.06, C); sash.rotation.z = 0.5;
    mesh(cyl(r * 1.14, r * 1.16, r * 0.14, 14), td, 0, -hh - r * 0.38, 0, C);
    // a tail of flame feathers
    for (let i = 0; i < 5; i++) { const f = mesh(cone(pel.r * 0.3, pel.r * 2.2, 6), i % 2 ? glow('#ffd84a') : glow('#ff6a1a'), (i - 2) * pel.r * 0.3, -pel.r * 0.4, -pel.r * 1.6, P); f.rotation.set(-2.2, 0, (i - 2) * 0.25); f.castShadow = false; }
    // talons
    for (const p of [PART.shinL, PART.shinR]) { const sp = skel.parts[p]; for (let k = -1; k <= 1; k++) { const t = mesh(cone(sp.r * 0.3, sp.r * 1.4, 5), mat('#f6c23a'), k * sp.r * 0.6, -sp.hh - sp.r * 0.6, sp.r * 1.4, parts[p]); t.rotation.x = Math.PI / 2 + 0.4; } }
  }
  if (top === 'gd_super') { // sack tunic with a big team "P" and a rope belt; the cape is core
    const sack = mat('#b8925a', { spec: 0 });
    chestShell(H, ch, sack, C);
    mesh(cyl(r * 0.5, r * 0.5, r * 0.05, 18), tc, 0, hh * 0.15, r * 1.02, C).rotation.x = Math.PI / 2;
    mesh(box(r * 0.12, r * 0.6, r * 0.06), mat('#fff6d8'), -r * 0.08, hh * 0.1, r * 1.06, C);
    mesh(torus(H, r * 0.13, r * 0.05, Math.PI * 1.4, 10), mat('#fff6d8'), r * 0.03, hh * 0.15 + r * 0.14, r * 1.06, C).rotation.z = -Math.PI * 0.7;
    mesh(cyl(r * 1.13, r * 1.15, r * 0.12, 14), mat('#d8b878'), 0, -hh - r * 0.38, 0, C);
    for (const p of [PART.farmL, PART.farmR]) mesh(cyl(skel.parts[p].r * 1.3, skel.parts[p].r * 1.3, skel.parts[p].hh * 0.6, 10), tc, 0, -skel.parts[p].hh * 0.35, 0, parts[p]);
  }
  // flyers' wings ride on extra bodies (see sm-valkyrie.js)
  if (def.id === 'gd_angel' || def.id === 'gd_phoenix') {
    const make = def.id === 'gd_angel' ? angelWing : fireWing;
    for (const l of wingLayout(skel, restSt(def))) {
      const sd = l.pos.x > 0 ? 1 : -1;
      extraParts.push({ group: make(H, team, sd), pos: l.pos, quat: l.quat });
    }
  }
}

function buildProj(type, g, H) {
  const { mesh, cyl, sphere, cone, mat, glow } = H;
  if (type === 'gd_beam') {
    mesh(cyl(0.05, 0.05, 0.9, 6), glow('#fff2a0'), 0, 0, 0, g).castShadow = false;
    mesh(cyl(0.14, 0.14, 0.9, 8), mat('#ffd84a', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g).castShadow = false;
    return true;
  }
  if (type === 'gd_light') { // a column of light where an ally is raised
    const a = mesh(cyl(0.35, 0.5, 9, 14, true), mat('#fff6c0', { emit: 1, transparent: true, opacity: 0.35, depthWrite: false }), 0, 4.5, 0, g);
    const b = mesh(cyl(0.9, 1.2, 9, 16, true), mat('#ffe36a', { emit: 1, transparent: true, opacity: 0.12, depthWrite: false }), 0, 4.5, 0, g);
    a.castShadow = b.castShadow = false;
    return true;
  }
  if (type === 'gd_embers') { // the Phoenix's ash pile, glowing
    mesh(sphere(0.55, 14, 8), mat('#4a3a34'), 0, 0.05, 0, g).scale.set(1, 0.3, 1);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, rr = 0.15 + (i % 3) * 0.13;
      const o = mesh(sphere(0.07 + (i % 2) * 0.03, 6, 5), glow(i % 2 ? '#ff7a2a' : '#ffd84a'), Math.cos(a) * rr, 0.16, Math.sin(a) * rr, g); o.castShadow = false;
    }
    const f = mesh(cone(0.2, 0.6, 7), mat('#ff9a2a', { emit: 1, transparent: true, opacity: 0.7, depthWrite: false }), 0, 0.4, 0, g); f.castShadow = false;
    return true;
  }
  return false;
}

register({
  factions: [{ id: 'good', name: 'Good', color: '#ffe680' }],
  units,
  items: {
    gd_sun_staff: { len: 1.8, r: 0.05, grip: 0, center: true, mass: 1.5 },
    gd_holy_sword: { len: 1.25, r: 0.09, grip: 25, metal: true, mass: 2.0 },
  },
  kinds: { gd_shield: shieldBearer, gd_cleric: cleric, gd_angel: angel, gd_phoenix: phoenix, gd_super: superPeasant },
  proj: {
    gd_beam: { g: 0, len: 0, r: 0, life: 1 },
    gd_light: { g: 0, len: 0, r: 0, life: 1 },
    gd_embers: { g: 0, len: 0, r: 0, life: 1 },
  },
  buildItem, buildHat, decorate, buildProj,
});
