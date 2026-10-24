// Evil: Mace Spinner (spins with flails out and hits everything around, then gets
// dizzy), Fan Bearer (gusts of wind blow enemies and their arrows back), Necromancer
// (raises the dead of either side as zombies on its own team), Chronomancer (slows
// time in a bubble: enemies inside crawl, swing slowly and their shots hang in the
// air), Tree Giant (huge and slow; uproots a tree and throws it, then slaps).
import { register, EXT } from '../ext.js';
import { ATTACKS } from '../pose.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, inFront, aimPoint, launchVel,
  addProjectile, sweepParts, strike, torus, tube, dome, headBand, tcol, tdark, chestShell, hoodGeo, twoSided,
} from './common.js';
import { UPY, revivable, revive, fists, mark, markAt, nearest, STANCE, setArmKey } from './ges-core.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const PURPLE = '#5a2a8a', IRON = '#4a4652', VOID = '#2a1838';

// ------------------------------------------------------------------ animations
// fan: swept from out to the side, across the front and through
ATTACKS.ev_fan = [
  [0.0, null, null, 0, 0, 0],
  [0.35, null, [-0.5, 1.25, -1.0, -1.2], 0.55, -0.15, 0.1],
  [0.5, null, [0.55, 0.35, -1.45, -1.5], -0.2, 0.25, 0.05],
  [0.65, null, [0.95, 0.15, -1.3, -1.35], -0.55, 0.3, 0.1],
  [1.0, null, null, 0, 0, 0],
];
STANCE.ev_fan = (st, pose) => { setArmKey(pose, -1, [-0.3, 0.6, -0.35, -1.3]); setArmKey(pose, 1, [0.1, 0.2, 0.05, -0.4]); };

// ------------------------------------------------------------------ per-battle state
const STATE = new WeakMap();
function S(b) {
  let s = STATE.get(b);
  if (!s) STATE.set(b, (s = { bubbles: [] }));
  return s;
}

// ------------------------------------------------------------------ zombies
// A raised unit keeps its body (and its team colours: the soul-flame above its head
// shows which side it fights for now), loses its weapon and fights with its fists.
const ZOMBIE = {
  kind: 'ev_zombie', style: 'fists', anim: 'punch', item: 'none', damage: 22, reach: 1.0, cooldown: 1.0, force: 220,
  line: 'Zombie · raised by a Necromancer',
};
export function zombify(b, u, team, necro) {
  const d0 = u.def;
  revive(b, u, team, 0.75);
  const s = Math.max(1, u.s);
  u.def = {
    ...d0, name: 'Zombie ' + d0.name, speed: Math.max(2.6, d0.speed * 0.75),
    weapon: { ...ZOMBIE, damage: ZOMBIE.damage * s, force: ZOMBIE.force * s, sweep: s > 1.6 },
    personality: { ...d0.personality, aggro: 1, bravery: 0, cry: 'magic', chatter: 0.4 },
    frenzy: false, deathBomb: false, armor: (d0.armor || 0) * 0.5,
  };
  u.kind = EXT.kinds.ev_zombie;
  u.zombie = true;
  u.evSlowed = 0;
  u.necro = necro;
  u.status = null;
  fists(u);
  u.zmark = mark(b, u, team ? 'ev_zombie1' : 'ev_zombie0', PART.head, 9999, new THREE.Vector3(0, Math.max(0, u.skel.rHead - 0.22) * 1.5, 0));
  const c = u.chestPos;
  b.emit('ptrail', c.x, c.y, c.z);
  b.emit('heal', c.x, c.y, c.z, 6);
  b.voice(u, 'cry', true);
  return u;
}
const zombie = {
  melee: true,
  think: meleeThink,
  step(u, dt) {
    if (Math.random() < dt * 1.5) { const h = u.headPos; u.battle.emit('ptrail', h.x, h.y + u.skel.rHead, h.z); }
  },
  die(u) { if (u.zmark) u.zmark.t = 0; },
};

// ------------------------------------------------------------------ kinds
// Mace Spinner: closes in, then spins on the spot with both flails out, hitting
// everyone in reach every few tenths of a second; afterwards it staggers about dizzy.
const spinner = {
  melee: true,
  init(u) { u.spinT = 0; u.spinCD = rand(0, 1); u.spinHit = new Map(); },
  think(u, dt, c) {
    u.spinCD -= dt;
    if (u.spinT > 0) {
      u.expr = EXPR.angry;
      u.desired.set(c.dirx * c.spd * 0.45, 0, c.dirz * c.spd * 0.45);
      u.faceYaw = u.heading + 2;
      return null;
    }
    if (u.spinCD <= 0 && c.gap < 1.6 * u.s && u.stun <= 0 && !u.isDown() && !u.st.attack) {
      u.spinT = u.def.weapon.spin;
      u.battle.voice(u, 'cry', true);
      return null;
    }
    return meleeThink(u, dt, c);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    if (u.control) {
      // possessed: the attack button starts a spin when it is ready
      u.spinCD -= dt;
      if (u.st.attack && u.spinT <= 0 && u.spinCD <= 0) { u.st.attack = null; u.spinT = w.spin; b.voice(u, 'cry', true); }
    }
    u.st.evSpin = u.spinT > 0 && u.stun <= 0;
    if (u.spinT <= 0) return;
    if (u.stun > 0.3) { u.spinT = 0; u.st.evSpin = false; return; } // knocked over: stops
    u.spinT -= dt;
    u.st.attack = null;
    u.faceYaw = u.heading + 2;
    u.spinSnd = (u.spinSnd || 0) - dt;
    if (u.spinSnd <= 0) { u.spinSnd = 0.28; b.sound('whoosh', u.pos, 0.8, 0.85); }
    // the flail heads sweep a ring around the spinner
    const p = u.chestPos, R = 1.75 * u.s, now = b.time;
    b.grid.query(p.x, p.z, R + 1.5, (v) => {
      if (v.team === u.team || !v.alive) return;
      const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > R + v.skel.radius || Math.abs(v.chestPos.y - p.y) > 1.4 * v.s + 0.5) return;
      if ((u.spinHit.get(v) || -9) > now - 0.5) return;
      u.spinHit.set(v, now);
      const k = u.buff > 0 ? 1.15 : 1;
      // pushed along the swing (tangent) and outward
      const tx = -dz / (d || 1), tz = dx / (d || 1);
      _d.set(tx * 0.7 + dx / (d || 1) * 0.6, 0.35, tz * 0.7 + dz / (d || 1) * 0.6).normalize();
      const f = Math.min(w.force * k, v.M * 9);
      v.hit(w.damage * k, PART.chest, _d.x * f * 0.3, _d.y * f * 0.3, _d.z * f * 0.3, u, 'melee');
      v.rag.impulseAll(_d.x * f * 0.7, _d.y * f * 0.7, _d.z * f * 0.7);
      const c = v.chestPos;
      b.emit(v.def.armor > 0.3 ? 'spark' : 'blood', c.x, c.y, c.z, 6, _d.x, _d.z);
      b.sound(v.def.armor > 0.3 ? 'clang' : 'crunch', c, 0.8, 1.1);
    });
    if (u.spinT <= 0) {
      // dizzy
      u.st.evSpin = false;
      u.stun = Math.max(u.stun, w.dizzy);
      u.spinCD = w.cooldown * 2.5;
      u.expr = EXPR.hurt;
      u.spinHit.clear();
    }
  },
};

// Fan Bearer: a gust in a cone in front blows enemies back (and knocks the lighter
// ones over), and turns enemy arrows and shots back toward their shooters.
const fanBearer = {
  init(u) { u.attackDur = 0.9; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist, dirx, dirz, spd } = c;
    u.expr = EXPR.normal;
    if (dist > w.range * 0.75) u.desired.set(dirx * spd, 0, dirz * spd);
    else if (c.gap < 2) u.desired.set(-dirx * spd * 0.5, 0, -dirz * spd * 0.5);
    if (dist < w.range && u.cooldown <= 0 && !u.st.attack && u.stun <= 0) u.startAttack();
    if (u.st.attack) u.desired.multiplyScalar(0.2);
    return t;
  },
  event(u, t0, t1) {
    if (!crossed(t0, t1, 0.5)) return;
    const b = u.battle, w = u.def.weapon, h = u.heading, fx = Math.sin(h), fz = Math.cos(h);
    const p = u.chestPos, R = w.range;
    b.sound('whoosh', p, 1.3, 0.55);
    b.sound('flyby', p, 0.6, 0.5);
    b.grid.query(p.x, p.z, R + 1, (v) => {
      if (v.team === u.team || !v.alive) return;
      const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > R || (dx * fx + dz * fz) < d * 0.55) return;
      const k = 1 - (d / R) * 0.55;
      const f = Math.min(w.force * k, v.M * 12) / Math.max(1, v.s * v.s);
      _d.set(dx / (d || 1) * 0.6 + fx * 0.4, 0.3, dz / (d || 1) * 0.6 + fz * 0.4).normalize();
      v.hit(w.damage * k, PART.chest, _d.x * f * 0.3, _d.y * f * 0.3, _d.z * f * 0.3, u, 'wind');
      v.rag.impulseAll(_d.x * f * 0.7, _d.y * f * 0.7, _d.z * f * 0.7);
      if (v.s < 1.5 && k > 0.65) v.stun = Math.max(v.stun, 0.35 * (v.def.stagger ?? 1));
    });
    // shots in the gust are blown back
    for (const pr of b.projectiles) {
      if (pr.team === u.team || PROJ_SKIP.has(pr.type)) continue;
      const dx = pr.pos.x - p.x, dz = pr.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > R || (dx * fx + dz * fz) < d * 0.5) continue;
      const sp = Math.max(6, pr.vel.length() * 0.6);
      pr.vel.set(fx * sp, Math.abs(pr.vel.y) * 0.3 + 2, fz * sp);
      pr.team = u.team; pr.owner = u; pr.hits.clear();
    }
    // the gust itself: swirls of air flying out, and dust kicked up
    for (let i = 0; i < 5; i++) {
      const a = h + (i - 2) * 0.22;
      _o.set(p.x + Math.sin(a) * 0.6, p.y + rand(-0.2, 0.3), p.z + Math.cos(a) * 0.6);
      _v.set(Math.sin(a) * 15, rand(-0.5, 0.8), Math.cos(a) * 15);
      addProjectile(b, 'ev_gust', _o, _v, u, { life: 0.6, damage: 0, force: 0 });
    }
    for (let i = 1; i <= 3; i++) {
      const x = p.x + fx * i * 2.4, z = p.z + fz * i * 2.4;
      b.emit('dust', x, b.terrain.height(x, z), z, 1);
    }
  },
};
const PROJ_SKIP = new Set(['ev_gust']);

// Necromancer: casts hexes at enemies and every few seconds raises a nearby corpse,
// of either side, as a zombie on its team.
const necro = {
  init(u) { u.raiseCD = 1.5; u.raised = []; u.attackDur = u.def.weapon.windup; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0.85 * u.s, _o);
    aimPoint(u, _p, 0.6, 0.7);
    launchVel(_o, _p, w.speed, 0.5, false, w.spread, _v);
    addProjectile(b, 'ev_hex', _o, _v, u, { life: 3 });
    b.sound('pop', _o, 0.6, 0.6);
  },
  step(u, dt) {
    const b = u.battle, w = u.def.weapon;
    u.raiseCD -= dt;
    if (u.raiseCD > 0 || u.stun > 0 || b.over) return;
    u.raiseCD = 0.4;
    u.raised = u.raised.filter((z) => z.alive);
    if (u.raised.length >= w.maxRaised) return;
    const v = nearest(b, u.pos, w.raiseRange, (o) => !o.zombie && revivable(o, b));
    if (!v) return;
    u.raiseCD = w.raiseCD;
    // a soul beam from the staff to the corpse, then it gets up
    u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0.85 * u.s, _o);
    _p.copy(v.chestPos);
    const n = Math.ceil(_o.distanceTo(_p) / 0.8);
    for (let i = 0; i < n; i++) { _v.lerpVectors(_o, _p, (i + 0.5) / n); b.emit('ptrail', _v.x, _v.y, _v.z); }
    const gy = b.terrain.height(v.pos.x, v.pos.z);
    b.emit('healring', v.pos.x, gy + 0.1, v.pos.z, 1.6);
    b.sound('heal', v.pos, 0.8, 0.45);
    b.sound('crunch', v.pos, 0.5, 0.6);
    u.st.attack = 'cast'; u.st.attackT = 0.5;
    zombify(b, v, u.team, u);
    u.raised.push(v);
  },
};

// Chronomancer: drops a bubble of slow time on the enemy: inside it everyone of the
// other side moves at a crawl, attacks at a third of the speed, and shots hang.
const chrono = {
  init(u) { u.attackDur = u.def.weapon.windup; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    // centre it a little behind the target, toward its friends (possessed: ahead)
    aimPoint(u, _o, 0, 0);
    const gy = b.terrain.height(_o.x, _o.z);
    _p.set(_o.x + Math.sin(u.heading) * 1.2, gy, _o.z + Math.cos(u.heading) * 1.2);
    const s = S(b);
    s.bubbles.push({ pos: _p.clone(), r: w.radius, t: w.duration, team: u.team, owner: u, mk: markAt(b, 'ev_bubble', _p, w.duration), tick: 0 });
    b.emit('healring', _p.x, gy + 0.1, _p.z, w.radius);
    b.emit('spark', _p.x, gy + 1.5, _p.z, 10);
    b.sound('gong', _p, 0.8, 0.6);
  },
};
function stepBubbles(b, dt) {
  const s = STATE.get(b);
  if (!s || !s.bubbles.length) return;
  for (const u of b.units) u.evSlowNow = false;
  for (let i = s.bubbles.length - 1; i >= 0; i--) {
    const bb = s.bubbles[i];
    bb.t -= dt;
    if (bb.t <= 0) { s.bubbles.splice(i, 1); continue; }
    const r2 = bb.r * bb.r;
    bb.tick -= dt;
    const tick = bb.tick <= 0;
    if (tick) bb.tick = 0.5;
    b.grid.query(bb.pos.x, bb.pos.z, bb.r + 1, (v) => {
      if (v.team === bb.team || !v.alive) return;
      const c = v.chestPos;
      if ((c.x - bb.pos.x) ** 2 + (c.z - bb.pos.z) ** 2 > r2 || c.y - bb.pos.y > bb.r) return;
      v.evSlowNow = true;
      // crawl: most of the velocity is taken away each step (also slows the fall)
      for (let k = 0; k < v.rag.bodies.length; k++) {
        const lv = v.rag.vel[k], m = v.skel.parts[k].mass;
        v.rag.impulse(k, -lv.x * m * 0.12, -lv.y * m * 0.08, -lv.z * m * 0.12);
      }
      v.cooldown += dt * 0.65;
      if (tick) { v.hit(bb.owner.def.weapon.damage * 0.5, PART.chest, 0, 0, 0, bb.owner.alive ? bb.owner : null, 'time'); }
    });
    // shots of the other side hang in the air
    for (const pr of b.projectiles) {
      if (pr.team === bb.team) continue;
      const dx = pr.pos.x - bb.pos.x, dz = pr.pos.z - bb.pos.z;
      if (dx * dx + dz * dz > r2 || pr.pos.y - bb.pos.y > bb.r) continue;
      const g = b.projGravity(pr.type);
      pr.vel.multiplyScalar(1 - Math.min(0.9, 6 * dt));
      pr.vel.y += g * dt * 0.85;
      pr.life += dt * 0.8;
    }
  }
  // attack animations play at a third of the speed in slow time
  for (const u of b.units) {
    if (u.evSlowNow && !u.evSlowed) { u.evSlowed = u.attackDur; u.attackDur *= 3; }
    else if (!u.evSlowNow && u.evSlowed) { u.attackDur = u.evSlowed; u.evSlowed = 0; }
  }
}

// Tree Giant: slaps with huge fists; every so often it rips a tree out of the ground
// and hurls it, the trunk rolling on through the enemy line.
const treeGiant = {
  melee: true,
  init(u) { u.treeCD = rand(0, 1); u.dur0 = u.attackDur; },
  think(u, dt, c) {
    const w = u.def.weapon, { t, dist } = c;
    u.treeCD -= dt;
    if (u.throwing) { u.expr = EXPR.angry; u.aimAt = t; return t; }
    if (u.treeCD <= 0 && dist > 6 && dist < w.range && !u.st.attack && u.stun <= 0 && !u.isDown()) {
      // uproot: a tree comes out of the ground into the giant's hand
      u.throwing = true;
      u.aimAt = t;
      u.st.attack = 'throw'; u.st.attackT = 0; u.attackDur = 1.7;
      u.hitSet.clear();
      u.treeCD = w.treeCD;
      const b = u.battle, p = u.pos, h = u.heading;
      const x = p.x - Math.cos(h) * 1.2 * u.s / 2, z = p.z + Math.sin(h) * 1.2 * u.s / 2;
      const gy = b.terrain.height(x, z);
      b.emit('dust', x, gy, z, 6);
      b.sound('crunch', _p.set(x, gy, z), 1.0, 0.5);
      b.sound('debris', _p, 0.8, 0.6);
      u.tree = mark(b, u, 'ev_tree_held', PART.farmR, 9999, new THREE.Vector3(0, -u.skel.handOffset, 0));
      u.tree.lq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI); // the trunk in the fist, crown out past the hand
      return t;
    }
    return meleeThink(u, dt, c);
  },
  event(u, t0, t1) {
    if (!u.throwing || !crossed(t0, t1, 0.66)) return;
    const b = u.battle, w = u.def.weapon;
    if (u.tree) { u.tree.t = 0; u.tree = null; }
    u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0, _o);
    aimPoint(u, _p, 0.3, 1.0);
    _p.y = b.terrain.height(_p.x, _p.z) + 0.5;
    launchVel(_o, _p, w.treeSpeed, 9.81, false, 0.04, _v);
    addProjectile(b, 'ev_tree', _o, _v, u, { life: 6, damage: w.treeDamage, force: w.treeForce, spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(4, 7) * (Math.random() < 0.5 ? -1 : 1)) });
    b.sound('whoosh', _o, 1.6, 0.4);
    b.sound('throw', _o, 1.0, 0.5);
  },
  step(u) {
    if (u.throwing && !u.st.attack) { u.throwing = false; u.attackDur = u.dur0; if (u.tree) { u.tree.t = 0; u.tree = null; } }
    if (u.throwing && u.stun > 0.3) { u.throwing = false; u.st.attack = null; u.attackDur = u.dur0; if (u.tree) { u.tree.t = 0; u.tree = null; } }
  },
  die(u) { if (u.tree) { u.tree.t = 0; u.tree = null; } },
};

// ------------------------------------------------------------------ projectiles
const PJ = {
  ev_gust: { g: 0, len: 0, r: 0.3, life: 0.6, hit: () => false, ground: () => true, step(b, pr, dt) { pr.vel.multiplyScalar(1 - 1.5 * dt); } },
  ev_hex: {
    g: 0.5, len: 0, r: 0.18, life: 3,
    step(b, pr) {
      if (Math.random() < 0.5) b.emit('ptrail', pr.pos.x, pr.pos.y, pr.pos.z);
      const h = sweepParts(b, pr, 0.18);
      if (h) { hexHit(b, pr, h.v, h.part); pr.life = -1; }
    },
    hit(b, pr, v) { hexHit(b, pr, v, PART.chest); return true; },
    ground(b, pr) { b.emit('ptrail', pr.pos.x, pr.pos.y, pr.pos.z); return true; },
  },
  ev_tree: {
    g: 9.81, len: 0, r: 0.6, roll: true, life: 6,
    hit(b, pr, v) {
      if (v.team === pr.team) return false;
      const sp = pr.vel.length(), k = clamp(sp / 10, 0.35, 1.3);
      _d.copy(pr.vel).normalize(); _d.y = Math.max(_d.y, 0) + 0.4; _d.normalize();
      const f = Math.min(pr.force * k, v.M * 14);
      v.hit(pr.damage * k, PART.chest, _d.x * f * 0.3, _d.y * f * 0.3, _d.z * f * 0.3, pr.owner, 'ev_tree');
      v.rag.impulseAll(_d.x * f * 0.7, _d.y * f * 0.7, _d.z * f * 0.7);
      v.stun = Math.max(v.stun, 1.3 * k * (v.def.stagger ?? 1));
      const c = v.chestPos;
      b.emit('dust', c.x, c.y, c.z, 2);
      b.sound('crunch', c, 1.0, 0.7);
      pr.vel.multiplyScalar(0.8);
      return false;
    },
  },
  // markers
  ev_zombie0: { g: 0, len: 0, r: 0, life: 1 },
  ev_zombie1: { g: 0, len: 0, r: 0, life: 1 },
  ev_bubble: { g: 0, len: 0, r: 0, life: 1 },
  ev_tree_held: { g: 0, len: 0, r: 0, life: 1 },
};
function hexHit(b, pr, v, part) {
  _d.copy(pr.vel).normalize();
  strike(b, v, pr.damage, _d, pr.force, pr.owner, 'ev_hex', part, 'pop');
  b.emit('ptrail', v.chestPos.x, v.chestPos.y, v.chestPos.z);
}

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'ev_fan_bearer', name: 'Fan Bearer', faction: 'evil', cost: 170, hp: 110, speed: 4.3,
    build: { scale: 0.98, girth: 0.98 },
    weapon: { line: 'Support · gusts blow enemies and their shots back', kind: 'ev_fan', style: 'ev_fan', anim: 'ev_fan', item: 'ev_fan', damage: 6, range: 9, cooldown: 3.0, force: 460, reach: 1.0 },
    look: { skin: '#e6d2c0', hat: 'ev_fan_hat', top: 'ev_silk', legs: '#2a2032' },
    personality: { aggro: 0.4, bravery: 0.3, voice: 1.25, chatter: 0.6, cry: 'cackle', idle: 'regal' },
    desc: 'Waves a giant fan: blows enemies off their feet and their arrows back.',
  },
  {
    id: 'ev_mace_spinner', name: 'Mace Spinner', faction: 'evil', cost: 300, hp: 260, speed: 4.6,
    build: { scale: 1.08, girth: 1.08, arms: 1.1 },
    weapon: { line: 'Melee · spins with flails out, hits everything around · dizzy after', kind: 'ev_spinner', style: 'dual', anim: 'dual', item: 'ev_flail', item2: 'ev_flail', damage: 15, reach: 1.5, cooldown: 1.0, force: 380, spin: 3, dizzy: 2.0 },
    look: { skin: '#c9b8ae', hat: 'ev_spike_helm', top: 'ev_chain', legs: '#2e2a34', bare: true },
    personality: { aggro: 1, bravery: 0, voice: 0.8, chatter: 0.6, cry: 'roar', idle: 'thump' },
    stagger: 0.7,
    desc: 'Spins like a top with a flail in each hand. Then falls over, dizzy.',
  },
  {
    id: 'ev_necromancer', name: 'Necromancer', faction: 'evil', cost: 450, hp: 150, speed: 3.9,
    build: { scale: 1.0, girth: 0.92, head: 1.02 },
    weapon: { line: 'Magic · raises the dead of either side as zombies', kind: 'ev_necro', style: 'staff', anim: 'cast', item: 'ev_skull_staff', damage: 26, speed: 18, range: 22, minRange: 6, cooldown: 2.2, force: 140, spread: 0.04, releaseAt: 0.62, windup: 0.9, raiseRange: 16, raiseCD: 1.6, maxRaised: 8 },
    look: { skin: '#b9c8ae', hat: 'ev_necro_hood', top: 'ev_robe', legs: '#1e1a22' },
    personality: { aggro: 0.3, bravery: 0.3, voice: 0.85, chatter: 0.8, cry: 'cackle', idle: 'float' },
    desc: 'The fallen get back up and fight for it, whichever side they died on.',
  },
  {
    id: 'ev_chronomancer', name: 'Chronomancer', faction: 'evil', cost: 1000, hp: 300, speed: 3.8,
    build: { scale: 1.02, girth: 0.95, head: 1.05 },
    weapon: { line: 'Magic · bubbles of slow time cripple enemies inside', kind: 'ev_chrono', style: 'staff', anim: 'cast', item: 'ev_hourglass', damage: 12, range: 24, minRange: 6, cooldown: 5.5, force: 0, spread: 0, releaseAt: 0.62, windup: 1.1, radius: 4.2, duration: 5 },
    look: { skin: '#d8c8d8', hat: 'ev_chrono', top: 'ev_robe_chrono', legs: '#20182a', beard: '#cfcfe0' },
    personality: { aggro: 0.3, bravery: 0.25, voice: 0.8, chatter: 0.6, cry: 'magic', idle: 'float' },
    armor: 0.1,
    desc: 'Bends time: everything inside its bubbles slows to a crawl.',
  },
  {
    id: 'ev_tree_giant', name: 'Tree Giant', faction: 'evil', cost: 1500, hp: 1600, speed: 2.7,
    build: { scale: 2.4, girth: 1.25, head: 0.85, legs: 1.0, arms: 1.2, armThick: 1.45, mass: 1.5 },
    weapon: { line: 'Giant · uproots and throws trees, slaps the rest', kind: 'ev_treegiant', style: 'fists', anim: 'slam', item: 'none', damage: 110, reach: 1.9, cooldown: 2.2, force: 1500, sweep: true, fistHit: true, range: 30, treeCD: 5.5, treeSpeed: 17, treeDamage: 120, treeForce: 1500 },
    look: { skin: '#7a5a3a', hat: 'ev_tree_crown', top: 'ev_bark', legs: '#6a4a2e', bare: true },
    personality: { aggro: 0.9, bravery: 0, voice: 0.4, chatter: 0.4, cry: 'roar', idle: 'thump' },
    armor: 0.15, stagger: 0.1,
    desc: 'A walking oak. Throws trees. Slowly.',
  },
];

// ------------------------------------------------------------------ visuals
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, wood, darkWood, leather, glow } = H;
  const tc = tcol(H, team);
  if (name === 'ev_flail') { // short haft, a chain and a spiked ball
    const L = 1.1 * s;
    mesh(cyl(0.03 * s, 0.035 * s, 0.4 * s, 8), darkWood(), 0, 0.2 * s, 0, g);
    mesh(cyl(0.04 * s, 0.04 * s, 0.06 * s, 8), tc, 0, 0.36 * s, 0, g);
    for (let i = 0; i < 5; i++) { const l = mesh(torus(H, 0.035 * s, 0.01 * s, Math.PI * 2, 8), mat(IRON, { spec: 0.8 }), 0, (0.43 + i * 0.07) * s, 0, g); l.rotation.y = i % 2 ? Math.PI / 2 : 0; }
    const ball = mat('#5a5660', { spec: 0.9 });
    mesh(sphere(0.14 * s, 12, 10), ball, 0, L - 0.12 * s, 0, g);
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4, e = Math.acos(1 - 2 * (i + 0.5) / 10);
      const dx = Math.sin(e) * Math.cos(a), dy = Math.cos(e), dz = Math.sin(e) * Math.sin(a);
      const sp = mesh(cone(0.04 * s, 0.12 * s, 5), mat('#8a8690', { spec: 1 }), dx * 0.15 * s, L - 0.12 * s + dy * 0.15 * s, dz * 0.15 * s, g);
      sp.quaternion.setFromUnitVectors(UPY, new THREE.Vector3(dx, dy, dz));
    }
    return true;
  }
  if (name === 'ev_fan') { // a huge folding fan, purple silk with a team rim
    const R = 0.75 * s;
    mesh(cyl(0.025 * s, 0.03 * s, 0.32 * s, 8), mat('#2a2032'), 0, 0.12 * s, 0, g);
    const silk = H.geo('evfan' + s.toFixed(3), () => twoSided(new THREE.CircleGeometry(R, 14, Math.PI / 2 - 0.95, 1.9).rotateY(Math.PI / 2).translate(0, 0.2 * s, 0)));
    mesh(silk, mat(PURPLE), 0, 0, 0, g);
    const rim = H.geo('evfanr' + s.toFixed(3), () => new THREE.TorusGeometry(R, 0.03 * s, 5, 14, 1.9).rotateZ(Math.PI / 2 - 0.95).rotateY(Math.PI / 2).translate(0, 0.2 * s, 0));
    mesh(rim, tc, 0, 0, 0, g);
    for (let i = 0; i < 7; i++) {
      const a = -0.95 + (i / 6) * 1.9;
      const r = mesh(cyl(0.01 * s, 0.012 * s, R, 4), mat('#1a1420'), 0, 0.2 * s + Math.cos(a) * R / 2, Math.sin(a) * R / 2, g);
      r.rotation.x = a;
    }
    for (const a of [-0.5, 0.45]) mesh(sphere(0.07 * s, 8, 6), gold(), 0.01 * s, 0.2 * s + Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, g).scale.set(0.3, 1, 1);
    return true;
  }
  if (name === 'ev_skull_staff') { // gnarled staff with a skull and a green soul-fire
    const L = 1.8 * s;
    mesh(cyl(0.028 * s, 0.035 * s, L, 7), mat('#3a2a22'), 0, 0, 0, g);
    for (const y of [-0.2, 0.15]) mesh(sphere(0.045 * s, 6, 5), mat('#3a2a22'), 0.01 * s, y * L, 0.01 * s, g);
    const top = L / 2 + 0.1 * s;
    mesh(sphere(0.12 * s, 12, 10), mat('#ece4cc'), 0, top, 0, g);
    mesh(sphere(0.08 * s, 10, 8), mat('#ece4cc'), 0, top - 0.08 * s, 0.05 * s, g).scale.set(1, 0.7, 1);
    for (const sd of [-1, 1]) mesh(sphere(0.03 * s, 6, 5), glow('#7dff5a'), sd * 0.045 * s, top + 0.01 * s, 0.1 * s, g);
    const f = mesh(cone(0.07 * s, 0.25 * s, 7), mat('#8cff5a', { emit: 1, transparent: true, opacity: 0.75 }), 0, top + 0.2 * s, 0, g); f.castShadow = false;
    mesh(cyl(0.04 * s, 0.04 * s, 0.1 * s, 8), tc, 0, L * 0.25, 0, g);
    return true;
  }
  if (name === 'ev_hourglass') { // a staff topped with a gold hourglass in a ring
    const L = 1.8 * s;
    mesh(cyl(0.03 * s, 0.032 * s, L, 8), mat(VOID), 0, 0, 0, g);
    const top = L / 2 + 0.2 * s;
    for (const sd of [-1, 1]) {
      mesh(cyl(0.11 * s, 0.11 * s, 0.03 * s, 10), gold(), 0, top + sd * 0.17 * s, 0, g);
      const gl = mesh(cone(0.09 * s, 0.15 * s, 10), mat('#cfe8ff', { spec: 1, transparent: true, opacity: 0.6 }), 0, top + sd * 0.08 * s, 0, g);
      if (sd > 0) gl.rotation.x = Math.PI;
    }
    mesh(cone(0.06 * s, 0.08 * s, 8), mat('#ffd86a', { emit: 0.4 }), 0, top - 0.11 * s, 0, g);
    for (const a of [0, Math.PI]) mesh(cyl(0.012 * s, 0.012 * s, 0.34 * s, 5), gold(), Math.cos(a) * 0.1 * s, top, Math.sin(a) * 0.1 * s, g);
    const ring = mesh(torus(H, 0.25 * s, 0.018 * s, Math.PI * 2, 18), glow('#b98aff'), 0, top, 0, g); ring.rotation.y = Math.PI / 2;
    mesh(cyl(0.045 * s, 0.045 * s, 0.1 * s, 8), tc, 0, L * 0.3, 0, g);
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'ev_spike_helm': { // a black iron bucket with spikes and slit eyes
      g.userData.hidesFace = true;
      const iron = mat(IRON, { spec: 0.7 });
      mesh(cyl(r * 1.08, r * 1.1, r * 1.9, 16), iron, 0, r * 0.05, 0, g);
      mesh(dome(H, r * 1.08, 0.5), iron, 0, r * 0.98, 0, g).scale.set(1, 0.5, 1);
      for (const sd of [-1, 1]) mesh(box(r * 0.55, r * 0.1, r * 0.1), mat('#100c12'), sd * r * 0.35, r * 0.2, r * 1.06, g);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sp = mesh(cone(r * 0.12, r * 0.5, 5), mat('#8a8690', { spec: 1 }), Math.sin(a) * r * 0.75, r * 1.3, Math.cos(a) * r * 0.75, g); sp.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }
      headBand(H, r, -0.55, 0.22, tc, g, 0.14);
      for (let i = 0; i < 5; i++) mesh(sphere(r * 0.06, 6, 5), mat('#8a8690', { spec: 1 }), (i - 2) * r * 0.25, -r * 0.35, r * 1.08, g);
      return true;
    }
    case 'ev_necro_hood': { // deep black hood, a bone mask and glowing green eyes
      g.userData.hidesFace = true;
      const cloth = mat('#16121a');
      mesh(sphere(r * 1.0, 16, 12), mat('#ece4cc'), 0, 0, 0.02 * r, g);
      for (const sd of [-1, 1]) { mesh(sphere(r * 0.22, 8, 6), mat('#140c10'), sd * r * 0.33, r * 0.1, r * 0.82, g).scale.set(1, 1.1, 0.5); mesh(sphere(r * 0.1, 6, 5), glow('#7dff5a'), sd * r * 0.33, r * 0.1, r * 0.92, g); }
      mesh(box(r * 0.6, r * 0.05, r * 0.05), mat('#140c10'), 0, -r * 0.45, r * 0.88, g);
      mesh(H.geo('evnhood' + r.toFixed(3), () => twoSided(new THREE.SphereGeometry(r * 1.32, 18, 12, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.82))), cloth, 0, r * 0.1, -r * 0.08, g);
      mesh(tube(H, 'evntip' + r.toFixed(3), [[0, 1.25, -0.3], [0, 1.6, -0.6], [0, 1.6, -1.05]].map((p) => p.map((q) => q * r)), r * 0.45, r * 0.06), cloth, 0, 0, 0, g);
      headBand(H, r, 0.55, 0.14, tc, g, 0.35);
      return true;
    }
    case 'ev_fan_hat': { // a tall black court hat with a team tassel
      const blk = mat('#1a1420', { spec: 0.4 });
      mesh(cyl(r * 0.75, r * 0.85, r * 0.7, 16), blk, 0, r * 0.95, -r * 0.05, g);
      mesh(cyl(r * 1.25, r * 1.25, r * 0.06, 18), blk, 0, r * 0.62, -r * 0.05, g).scale.set(1, 1, 0.55);
      headBand(H, r, 0.5, 0.2, mat(PURPLE), g, 0.08);
      mesh(sphere(r * 0.16, 8, 6), tc, 0, r * 1.36, -r * 0.05, g);
      for (const sd of [-1, 1]) { const w = mesh(box(r * 0.9, r * 0.05, r * 0.12), blk, sd * r * 1.05, r * 0.7, -r * 0.4, g); w.rotation.z = sd * 0.15; }
      // thin moustache
      for (const sd of [-1, 1]) { const m = mesh(H.capsule(r * 0.04, r * 0.45), mat('#1a1420'), sd * r * 0.3, -r * 0.3, r * 0.93, g); m.rotation.z = sd * (Math.PI / 2 + 0.6); }
      return true;
    }
    case 'ev_chrono': { // violet hood with a ring of clock numerals floating above
      const cloth = mat('#3a2458');
      mesh(hoodGeo(H, r, 1.2, 1.0), cloth, 0, r * 0.08, -r * 0.06, g);
      headBand(H, r, 0.58, 0.14, gold(), g, 0.24);
      const ring = mesh(torus(H, r * 0.95, r * 0.05, Math.PI * 2, 24), glow('#b98aff'), 0, r * 1.6, 0, g); ring.rotation.x = Math.PI / 2 - 0.2;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mesh(box(r * 0.08, r * (i % 3 ? 0.12 : 0.22), r * 0.04), gold(), Math.sin(a) * r * 0.95, r * 1.6 + Math.cos(a) * r * 0.2, Math.cos(a) * r * 0.95, g); }
      mesh(sphere(r * 0.15, 8, 6), tc, 0, r * 1.15, r * 0.25, g);
      return true;
    }
    case 'ev_tree_crown': { // a leafy crown and bare branches; mossy beard
      g.userData.hidesFace = false;
      const leaf = mat('#3f7a2a'), leaf2 = mat('#5a9a34'), bark = mat('#5a4028');
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; mesh(sphere(r * 0.55, 10, 8), i % 2 ? leaf : leaf2, Math.sin(a) * r * 0.7, r * (0.95 + (i % 3) * 0.12), Math.cos(a) * r * 0.6 - r * 0.2, g); }
      mesh(sphere(r * 0.7, 12, 10), leaf2, 0, r * 1.35, -r * 0.2, g);
      for (const sd of [-1, 1]) mesh(tube(H, 'evbr' + sd + r.toFixed(3), [[sd * 0.6, 0.7, -0.1], [sd * 1.1, 1.2, -0.1], [sd * 1.35, 1.75, 0.1], [sd * 1.6, 1.95, 0.0]].map((p) => p.map((q) => q * r)), r * 0.14, r * 0.03), bark, 0, 0, 0, g);
      mesh(sphere(r * 0.45, 10, 8), mat('#5a7a3a'), 0, -r * 0.75, r * 0.45, g).scale.set(1.3, 0.8, 0.8);
      const brow = mesh(H.capsule(r * 0.13, r * 0.9), bark, 0, r * 0.42, r * 0.85, g); brow.rotation.z = Math.PI / 2;
      mesh(sphere(r * 0.18, 8, 6), tc, r * 0.7, r * 1.25, r * 0.45, g); // a team-coloured blossom
      mesh(sphere(r * 0.18, 8, 6), tc, -r * 0.55, r * 1.45, r * 0.3, g);
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'evil') return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, metal, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const robe = (m, len = 2.9, flare = 1.7) => { const k = mesh(cyl(pel.r * 1.12, pel.r * flare, pel.r * len, 16), m, 0, -pel.r * (len / 2 - 0.15), 0, P); k.scale.set(1, 1, 0.95); };
  const sleeves = (m, wide = 1.5) => {
    for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) {
      const sp = skel.parts[p], fore = p === PART.farmL || p === PART.farmR;
      mesh(cyl(sp.r * 1.25, sp.r * (fore ? wide * 1.3 : 1.3), sp.hh * (fore ? 1.6 : 2.0), 10), m, 0, fore ? sp.hh * 0.2 : 0, 0, parts[p]);
    }
  };
  if (top === 'ev_chain') { // bare chest crossed with chains, studded team belt, iron bracers
    const iron = mat(IRON, { spec: 0.7 });
    for (const sd of [-1, 1]) { const c = mesh(box(r * 0.16, (hh + r) * 2.0, r * 0.08), iron, 0, 0, r * 1.02, C); c.rotation.z = sd * 0.6; const c2 = mesh(box(r * 0.16, (hh + r) * 2.0, r * 0.08), iron, 0, 0, -r * 1.02, C); c2.rotation.z = sd * 0.6; }
    mesh(cyl(r * 1.15, r * 1.17, r * 0.26, 14), tc, 0, -hh - r * 0.38, 0, C);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mesh(sphere(r * 0.06, 6, 5), mat('#8a8690', { spec: 1 }), Math.sin(a) * r * 1.17, -hh - r * 0.38, Math.cos(a) * r * 1.03, C); }
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.35, sp.r * 1.35, sp.hh * 1.0, 10), iron, 0, -sp.hh * 0.2, 0, parts[p]); }
    for (const sd of [-1, 1]) { const pd = mesh(sphere(r * 0.45, 10, 8), iron, sd * r * 0.95, hh + r * 0.2, 0, C); pd.scale.set(1, 0.6, 1); for (let k = 0; k < 2; k++) mesh(cone(r * 0.08, r * 0.3, 5), mat('#8a8690', { spec: 1 }), sd * r * (0.85 + k * 0.25), hh + r * 0.5, (k - 0.5) * r * 0.3, C); }
  }
  if (top === 'ev_robe' || top === 'ev_robe_chrono') {
    const chrono = top === 'ev_robe_chrono';
    const cloth = mat(chrono ? '#3a2458' : '#1e1a22');
    chestShell(H, ch, cloth, C);
    robe(cloth);
    sleeves(cloth);
    mesh(cyl(r * 1.13, r * 1.15, r * 0.14, 14), chrono ? gold() : tc, 0, -hh - r * 0.38, 0, C);
    mesh(box(r * 0.3, (hh + r) * 1.8, r * 0.05), td, 0, -r * 0.1, r * 1.0, C);
    mesh(box(r * 0.3, pel.r * 2.5, r * 0.05), td, 0, -pel.r * 1.4, pel.r * 1.3, P);
    if (chrono) { // a clock face on the chest
      mesh(cyl(r * 0.4, r * 0.4, r * 0.05, 18), mat('#f4ecd8'), 0, hh * 0.25, r * 1.02, C).rotation.x = Math.PI / 2;
      mesh(torus(H, r * 0.4, r * 0.04, Math.PI * 2, 18), gold(), 0, hh * 0.25, r * 1.04, C);
      const h1 = mesh(box(r * 0.04, r * 0.28, r * 0.03), mat('#1a1420'), 0, hh * 0.25 + r * 0.12, r * 1.07, C); void h1;
      const h2 = mesh(box(r * 0.04, r * 0.2, r * 0.03), mat('#1a1420'), r * 0.08, hh * 0.25 + r * 0.04, r * 1.07, C); h2.rotation.z = -1.2;
    } else { // bone necklace
      for (let k = -3; k <= 3; k++) { const a = k * 0.3; mesh(sphere(r * 0.08, 6, 5), mat('#ece4cc'), Math.sin(a) * r * 0.9, hh + r * 0.25 - Math.abs(k) * r * 0.05, Math.cos(a) * r * 0.85, C); }
    }
  }
  if (top === 'ev_silk') { // a long purple silk coat with team trim, gold buttons
    const silk = mat(PURPLE, { spec: 0.4 });
    chestShell(H, ch, silk, C);
    robe(silk, 2.5, 1.55);
    sleeves(silk, 1.6);
    mesh(box(r * 0.2, (hh + r) * 1.9, r * 0.05), tc, 0, -r * 0.1, r * 1.02, C);
    for (const y of [-0.4, 0, 0.4]) mesh(sphere(r * 0.07, 6, 5), gold(), r * 0.18, y * r, r * 1.05, C);
    mesh(cyl(r * 1.13, r * 1.15, r * 0.14, 14), tc, 0, -hh - r * 0.38, 0, C);
  }
  if (top === 'ev_bark') { // bark plates, moss, roots for toes
    const bark = mat('#5a4028'), moss = mat('#4f7a2e');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, y = ((i * 7) % 5 - 2) * hh * 0.45;
      const pl = mesh(box(r * 0.5, r * 0.9, r * 0.12), bark, Math.sin(a) * r * 1.02, y, Math.cos(a) * r * 0.92, C); pl.rotation.y = a;
    }
    for (let i = 0; i < 4; i++) mesh(sphere(r * 0.22, 8, 6), moss, Math.sin(i * 1.7) * r * 0.9, hh + r * 0.4, Math.cos(i * 1.7) * r * 0.8, C).scale.set(1.3, 0.6, 1);
    mesh(cyl(r * 1.15, r * 1.17, r * 0.2, 14), tc, 0, -hh - r * 0.38, 0, C);
    for (const p of [PART.shinL, PART.shinR]) { const sp = skel.parts[p]; for (let k = -1; k <= 1; k++) { const t = mesh(cone(sp.r * 0.35, sp.r * 1.8, 5), bark, k * sp.r * 0.6, -sp.hh - sp.r * 0.5, sp.r * 1.3, parts[p]); t.rotation.x = Math.PI / 2 + 0.5; } }
    for (const p of [PART.uarmL, PART.uarmR]) { const sp = skel.parts[p]; mesh(sphere(sp.r * 0.6, 8, 6), moss, sp.r * 0.7, sp.hh * 0.6, 0, parts[p]).scale.set(1, 0.6, 1.2); }
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; for (let k = 0; k < 2; k++) { const tw = mesh(cone(sp.r * 0.25, sp.r * 1.4, 4), bark, (k - 0.5) * sp.r * 0.9, sp.hh * 0.2, sp.r * 0.9, parts[p]); tw.rotation.x = 0.9; } }
  }
}

function tree(H, g, k = 1) {
  const { mesh, cyl, sphere, mat } = H;
  const bark = mat('#6a4a2e'), leaf = mat('#3f7a2a'), leaf2 = mat('#5a9a34');
  mesh(cyl(0.16 * k, 0.24 * k, 2.4 * k, 9), bark, 0, 0, 0, g);
  for (let i = 0; i < 4; i++) { const rt = mesh(cyl(0.03 * k, 0.09 * k, 0.6 * k, 5), bark, Math.sin(i * 1.6) * 0.2 * k, -1.25 * k, Math.cos(i * 1.6) * 0.2 * k, g); rt.rotation.set(Math.cos(i * 1.6) * 0.9, 0, -Math.sin(i * 1.6) * 0.9); }
  mesh(sphere(0.25 * k, 8, 6), mat('#4a3a24'), 0, -1.25 * k, 0, g).scale.set(1, 0.5, 1); // clump of earth
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mesh(sphere(0.55 * k, 10, 8), i % 2 ? leaf : leaf2, Math.sin(a) * 0.45 * k, 1.4 * k + (i % 3) * 0.15 * k, Math.cos(a) * 0.45 * k, g); }
  mesh(sphere(0.7 * k, 12, 10), leaf2, 0, 1.9 * k, 0, g);
}

function buildProj(type, g, H) {
  const { mesh, cyl, sphere, cone, box, mat, glow } = H;
  if (type === 'ev_tree') { tree(H, g, 1); return true; }
  if (type === 'ev_tree_held') { const t = new THREE.Group(); tree(H, t, 1); t.position.y = 1.0; g.add(t); return true; }
  if (type === 'ev_gust') { // a swirl of air
    const m = mat('#eef4ff', { emit: 0.6, transparent: true, opacity: 0.45, depthWrite: false });
    for (let i = 0; i < 3; i++) { const t = mesh(torus(H, 0.25 + i * 0.12, 0.03, Math.PI * 1.3, 12), m, 0, 0, i * 0.12, g); t.rotation.set(Math.PI / 2, i * 1.3, 0); t.castShadow = false; }
    return true;
  }
  if (type === 'ev_hex') {
    const a = mesh(sphere(0.13, 10, 8), glow('#c6ff9a'), 0, 0, 0, g); a.castShadow = false;
    const b = mesh(sphere(0.24, 10, 8), mat('#5ad83a', { emit: 1, transparent: true, opacity: 0.45, depthWrite: false }), 0, 0, 0, g); b.castShadow = false;
    const sk = mesh(sphere(0.08, 8, 6), mat('#ece4cc'), 0, 0.02, 0.06, g); sk.castShadow = false;
    return true;
  }
  if (type === 'ev_zombie0' || type === 'ev_zombie1') { // a sickly green glow round the head, the new side's soul-flame above
    const tc = H.TEAM_COLORS[type === 'ev_zombie1' ? 1 : 0];
    const aura = mesh(sphere(0.34, 12, 10), mat('#7dff5a', { emit: 0.8, transparent: true, opacity: 0.28, depthWrite: false }), 0, 0, 0, g); aura.castShadow = false;
    const f = mesh(cone(0.17, 0.55, 8), mat(tc, { emit: 0.9, transparent: true, opacity: 0.85 }), 0, 0.62, 0, g); f.castShadow = false;
    const c = mesh(sphere(0.17, 10, 8), mat(tc, { emit: 1 }), 0, 0.45, 0, g); c.castShadow = false;
    const r = mesh(torus(H, 0.3, 0.035, Math.PI * 2, 16), glow('#8cff5a'), 0, 0.38, 0, g); r.rotation.x = Math.PI / 2; r.castShadow = false;
    for (let i = 0; i < 3; i++) { const w = mesh(sphere(0.06, 6, 5), glow('#8cff5a'), Math.cos(i * 2.1) * 0.3, 0.45 + i * 0.07, Math.sin(i * 2.1) * 0.3, g); w.castShadow = false; }
    return true;
  }
  if (type === 'ev_bubble') { // a dome of slow time with a clock ring
    const d = mesh(H.geo('evbub', () => new THREE.SphereGeometry(4.2, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#b98aff', { emit: 0.6, transparent: true, opacity: 0.3, depthWrite: false }), 0, 0, 0, g);
    d.castShadow = false; d.renderOrder = 4;
    const ring = mesh(torus(H, 4.2, 0.06, Math.PI * 2, 48), glow('#d8c0ff'), 0, 0.08, 0, g); ring.rotation.x = Math.PI / 2; ring.castShadow = false;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const t = mesh(box(0.12, 0.05, i % 3 ? 0.4 : 0.8), glow('#f0c03c'), Math.sin(a) * 3.7, 0.06, Math.cos(a) * 3.7, g); t.rotation.y = a; t.castShadow = false; }
    const h1 = mesh(box(0.14, 0.05, 2.6), glow('#f0c03c'), 0, 0.08, 1.3, g); h1.castShadow = false;
    const h2 = mesh(box(0.14, 0.05, 1.8), glow('#f0c03c'), 0.9 * Math.sin(2), 0.08, 0.9 * Math.cos(2), g); h2.rotation.y = 2; h2.castShadow = false;
    return true;
  }
  return false;
}

register({
  factions: [{ id: 'evil', name: 'Evil', color: '#8e4fd6' }],
  units,
  items: {
    ev_flail: { len: 1.1, r: 0.14, grip: 90, heavy: true, mass: 2.2 },
    ev_fan: { len: 0.95, r: 0.2, grip: 80, mass: 0.8, phys: false },
    ev_skull_staff: { len: 1.8, r: 0.05, grip: 0, center: true, mass: 1.4 },
    ev_hourglass: { len: 1.8, r: 0.05, grip: 0, center: true, mass: 1.4 },
  },
  kinds: { ev_spinner: spinner, ev_fan: fanBearer, ev_necro: necro, ev_chrono: chrono, ev_treegiant: treeGiant, ev_zombie: zombie },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
  battleStep: stepBubbles,
});
