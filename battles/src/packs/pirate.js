// Pirate: Flintlock Pirate (one shot, then a long reload), Harpooner (harpoons an
// enemy and reels it in), Bomb Thrower (lit bombs), Pirate Captain (cutlass and a
// pistol; his shout rallies the crew around him), Pirate Queen (rapid volleys from two
// pistols) and the Cannon: a crewed gun on a wheeled carriage (an extra rigid body, see
// sm-siege.js) whose cannonballs plough through ranks and bounce on; it recoils, needs
// its gunner, and can be blown over. The Powder Monkey runs a lit powder keg into the
// enemy line, drops it and scurries back for another (the keg in his arms is a stuck
// marker, the dropped keg a projectile, so both show in replays).
// Shared guns, cannonballs and reels: pr-shared.js.
import { register, EXT } from '../ext.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, addProjectile, sweepParts, strike, stickTo,
  shieldBlocks, blast, newId, torus, dome, headBand, tcol, tdark, chestShell, hoodGeo,
} from './common.js';
import { ballisticAngle } from '../util.js';
import { yawOf, shoveBig, angleDiff, rangedEvent, setArm } from './sm-core.js';
import { siegeLayout, siegeInit, siegeThink, siegeControl, siegeCrewDie } from './sm-siege.js';
import { PROJ as PRP, shoot, addReel, reeling, wheel, barrel, ballMesh } from './pr-shared.js';

const V3 = THREE.Vector3;
const V = (x, y, z) => new V3(x, y, z);
const _d = new V3();

// ------------------------------------------------------------------ cannon
const CANNON = {
  cart: V(0, 0.42, 1.55), half: [0.34, 0.15, 0.7], mass: 520, wheel: 0.42,
  wheels: [[0.58, 0, 0.3], [-0.58, 0, 0.3], [0, 0, -0.78]],
  frame: { at: V(0, 0.32, 0.25), half: [0.16, 0.16, 0.78], mass: 150 },
  ammoLocal: V(0, 0.32, 1.0), muzzle: V(0, 0.32, 1.18),
  station: V(0, 0, -1.55), hp: 450, seg: [V(0, 0.1, -0.9), V(0, 0.32, 1.0)], segR: 0.55,
  reload: 3.8, proj: 'pr_cannonball', arm: false,
  cartMesh: (H, team) => cannonCart(H, team), ammoMesh: (H) => { const g = new THREE.Group(); ballMesh(H, g, 0.12); return g; },
};

// the gunner pulls the release (siegeThink starts a 'punch'); the gun fires at once
function cannonEvent(u, t0, t1) {
  const c = u.sm;
  if (!(c.pull && t0 < 0.45 && t1 >= 0.45)) return;
  c.pull = false;
  if (!c.loaded || c.broken || c.tipped) return;
  c.loaded = false; c.fire = 0; c.released = true; c.hitStop = true;
  fireCannon(u.battle, c);
}
function fireCannon(b, c) {
  const cfg = c.cfg, u = c.u, w = u.def.weapon, q = c.cart.quat;
  const from = cfg.muzzle.clone().applyQuaternion(q).add(c.cart.pos);
  const t = c.aimT && c.aimT.alive ? c.aimT : c.target && c.target.alive ? c.target : null;
  const yaw0 = yawOf(q), sp = w.speed, g = PRP.pr_cannonball.g;
  let yaw = yaw0, ang = 0.03;
  if (t) {
    // aim at the waist and lead a little: a short ball skips on into them
    const tp = t.pos, tv = t.rag.vel[PART.pelvis];
    const tof = Math.hypot(tp.x - from.x, tp.z - from.z) / sp;
    const px = tp.x + tv.x * tof * 0.6, pz = tp.z + tv.z * tof * 0.6;
    const a = ballisticAngle(Math.hypot(px - from.x, pz - from.z), tp.y - 0.2 - from.y, sp, g, false);
    if (a !== null) ang = clamp(a, -0.12, 0.4);
    yaw = yaw0 + clamp(angleDiff(yaw0, Math.atan2(px - from.x, pz - from.z)), -0.1, 0.1);
  } else if (c.aimPt) {
    // a possessed gunner fires at the crosshair point
    const tp = c.aimPt;
    const a = ballisticAngle(Math.hypot(tp.x - from.x, tp.z - from.z), tp.y - from.y, sp, g, false);
    if (a !== null) ang = clamp(a, -0.12, 0.4);
    yaw = yaw0 + clamp(angleDiff(yaw0, Math.atan2(tp.x - from.x, tp.z - from.z)), -0.1, 0.1);
  }
  yaw += rand(-1, 1) * w.spread; ang += rand(-1, 1) * w.spread * 0.4;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const vel = V(fx * Math.cos(ang), Math.sin(ang), fz * Math.cos(ang)).multiplyScalar(sp);
  addProjectile(b, 'pr_cannonball', from, vel, u, { life: 7 });
  // bang: flash and a cloud of smoke at the muzzle, dust kicked up under it
  b.emit('explode', from.x + fx * 0.3, from.y, from.z + fz * 0.3, 0.8, 0);
  const gy = b.terrain.height(from.x, from.z);
  b.emit('dust', from.x + fx * 0.8, gy, from.z + fz * 0.8, 3);
  b.sound('boom', from, 1.5, 0.72);
  b.sound('debris', from, 0.3, 1.6);
  // recoil: the carriage jumps back and its nose kicks up
  shoveBig(c.big, -fx * cfg.mass * 3.6, cfg.mass * 0.1, -fz * cfg.mass * 3.6, from, 4);
}

// ------------------------------------------------------------------ kinds
const harpooner = {
  think(u, dt, c) {
    if (reeling(u)) {
      // hold the line: stand and haul
      u.desired.set(0, 0, 0);
      u.expr = EXPR.angry;
      return u.prReel.victim.alive ? u.prReel.victim : c.t;
    }
    return rangedThink(u, dt, c);
  },
  event: rangedEvent,
};

const captain = {
  melee: true,
  init(u) { u.pistolT = rand(0.5, 2.5); u.rallyT = rand(0.5, 2); },
  think(u, dt, c) {
    const f = meleeThink(u, dt, c);
    const w = u.def.weapon, b = u.battle;
    u.pistolT -= dt; u.rallyT -= dt;
    u.st.prAimL = Math.max(0, (u.st.prAimL || 0) - dt);
    // a pistol shot (left hand) at whoever is still out of cutlass reach
    if (u.pistolT <= 0 && !u.st.attack && u.stun <= 0 && c.gap > 2.5 && c.dist < w.gun.range) {
      u.pistolT = w.gun.reload * rand(0.9, 1.1);
      u.st.prAimL = 0.75;
      const t = c.t;
      b.delayed.push([0.3, () => { if (u.alive && u.stun <= 0) shoot(u, PART.farmL, w.gun, t.alive ? t : null); }]);
    }
    if (u.rallyT <= 0 && c.gap < 14) rally(u);
    return f;
  },
};
// "Rally, ye dogs!": nearby crew fight faster and harder for a while
function rally(u) {
  const b = u.battle, R = u.def.weapon.rally;
  u.rallyT = R.every * rand(0.9, 1.1);
  let n = 0;
  for (const o of b.teams[u.team]) {
    if (!o.alive || (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2 > R.radius * R.radius) continue;
    o.buff = Math.max(o.buff, R.dur);
    const h = o.headPos;
    b.emit('spark', h.x, h.y + 0.35 * o.s, h.z, 1);
    n++;
  }
  if (n > 1) {
    b.voice(u, 'cry', true);
    b.sound('horn', u.pos, 0.4, 1.5);
    b.emit('healring', u.pos.x, b.terrain.height(u.pos.x, u.pos.z) + 0.1, u.pos.z, R.radius * 0.6);
  }
}

// Powder Monkey: carries a lit keg in, drops it at the enemy's feet, runs back, and
// fetches another while hanging back from the fight.
function holdKeg(u) {
  const b = u.battle, ch = u.skel.parts[PART.chest];
  const lp = new V3(0, -ch.hh * 0.6, ch.r * 1.75);
  u.pmKeg = { type: 'pi_keg_held', unit: u, part: PART.chest, lp, lq: new THREE.Quaternion(), pos: u.chestPos.clone(), quat: new THREE.Quaternion(), t: 9999, id: newId() };
  b.stuck.push(u.pmKeg);
}
function dropKeg(u, fuse) {
  const b = u.battle, w = u.def.weapon, k = u.pmKeg;
  if (!k) return;
  k.t = 0;
  u.pmKeg = null;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading), v0 = u.rag.vel[PART.chest];
  const at = k.pos.clone();
  _d.set(v0.x * 0.2 + fx * 1.2, 1.0, v0.z * 0.2 + fz * 1.2);
  addProjectile(b, 'pi_keg', at, _d, u, { damage: 0, force: 0, life: 8, keg: fuse ?? w.fuse, kegDmg: w.keg, kegBlast: w.blast, kegForce: w.force });
  b.sound('fire', at, 0.45, 1.6);
  u.pmLoad = w.reload * rand(0.9, 1.1);
}
const monkey = {
  melee: true,
  init(u) { u.pmLoad = 0; u.pmRun = 0; holdKeg(u); },
  think(u, dt, c) {
    const w = u.def.weapon;
    const { t, gap, dirx, dirz, spd } = c;
    if (u.pmRun > 0) { // scurry off before it goes up
      u.desired.set(-dirx * spd * 1.1, 0, -dirz * spd * 1.1);
      u.expr = EXPR.scared;
      return null;
    }
    if (!u.pmKeg) { // fetching another: keep out of the fight (fists if caught)
      if (gap < 1.4) return meleeThink(u, dt, c);
      u.expr = EXPR.normal;
      if (gap < w.keep) u.desired.set(-dirx * spd * 0.7, 0, -dirz * spd * 0.7);
      else if (gap > w.keep + 4) u.desired.set(dirx * spd * 0.5, 0, dirz * spd * 0.5);
      return t;
    }
    u.desired.set(dirx * spd, 0, dirz * spd);
    u.expr = EXPR.angry;
    if (gap < w.dropGap && u.stun <= 0 && !u.isDown()) {
      dropKeg(u);
      u.pmRun = w.run;
      if (Math.random() < 0.7) u.battle.voice(u, 'cry', true);
    }
    return t;
  },
  step(u, dt) {
    u.pmRun = Math.max(0, u.pmRun - dt);
    if (!u.pmKeg && u.pmLoad > 0 && (u.pmLoad -= dt) <= 0) { holdKeg(u); u.battle.sound('click', u.pos, 0.5, 0.9); }
    u.st.piCarry = !!u.pmKeg;
  },
  // shot down with a keg in his arms: it drops, still lit
  die(u) { if (u.pmKeg) dropKeg(u, 0.9); },
  control(u, dt, c) {
    if (c.attack && u.pmKeg) { dropKeg(u); return true; }
    return !!u.pmKeg; // (no punching with a keg in his arms)
  },
};
const CARRY = [0.55, 0.05, -0.75, -1.55];
EXT.pose.push((st, pose) => {
  if (st.piCarry && !st.attack && st.mode === 'normal') { setArm(pose, 1, CARRY); setArm(pose, -1, CARRY); }
});
// the dropped keg: fizzes on the ground, then blows up (friends get half)
const keg = {
  g: 9.81, len: 0, r: 0.22, life: 8,
  hit: () => false, // it doesn't hurt to be hit by a keg, only when it goes off
  step(b, pr, dt) {
    pr.keg -= dt;
    const gy = b.terrain.height(pr.pos.x, pr.pos.z);
    if (pr.pos.y - gy < 0.3 && pr.vel.lengthSq() < 1) pr.spin.set(0, 0, 0);
    pr.fz = (pr.fz || 0) - 1;
    if (pr.fz <= 0) { pr.fz = 3; b.emit('fuse', pr.pos.x, pr.pos.y + 0.28, pr.pos.z); }
    if (pr.keg > 0) return;
    _d.copy(pr.pos); _d.y = Math.max(_d.y, gy + 0.25);
    blast(b, _d, pr.kegBlast, pr.kegDmg, pr.kegForce, pr.owner, { fx: 0, friendly: 0.5 });
    b.emit('dust', _d.x, gy, _d.z, 4);
    b.sound('debris', _d, 0.6, 1.2);
    pr.life = -1;
  },
};

// ------------------------------------------------------------------ projectiles
// Harpoon: flies like a spear, sticks in whoever it hits and starts the reel.
function harpoonHit(b, pr, v, part) {
  pr.hits.add(v);
  const dir = _d.copy(pr.vel).normalize();
  if (shieldBlocks(b, v, dir)) { stickTo(b, pr, v, PART.farmL); return true; }
  strike(b, v, pr.damage, dir, pr.force, pr.owner, 'harpoon', part, 'stab');
  stickTo(b, pr, v, part, 12);
  const o = pr.owner, w = o.def.weapon;
  if (o.alive) {
    addReel(b, o, v, w.hold, w.pull);
    b.sound('whoosh', v.chestPos, 0.8, 0.7);
  }
  return true;
}
const harpoon = {
  g: 9.81, len: 1.5, r: 0.06, stick: true, life: 6,
  step(b, pr) { const h = sweepParts(b, pr, 0.06); if (h && harpoonHit(b, pr, h.v, h.part)) pr.life = -1; },
  hit: (b, pr, v, part) => harpoonHit(b, pr, v, part),
};

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'pi_flintlock', name: 'Flintlock Pirate', faction: 'pirate', cost: 165, hp: 90, speed: 4.4,
    build: { scale: 0.98, girth: 1.0 },
    weapon: { line: 'Ranged · one heavy flintlock shot, then a long reload', kind: 'pr_gun', style: 'sword', anim: 'punch', item: 'pi_pistol', damage: 75, speed: 70, range: 26, minRange: 6, cooldown: 0.6, reload: 6.0, ammo: 1, force: 220, spread: 0.03, releaseAt: 0.55, windup: 0.6, barrel: 0.42 },
    look: { skin: '#e8b890', hat: 'pi_bandana', top: 'pi_shirt', legs: '#3e3a4a', patch: true },
    personality: { aggro: 0.4, bravery: 0.25, voice: 0.95, chatter: 0.7, cry: 'hey', idle: 'shift' },
    desc: 'One big bang. Then a long, long reload.',
  },
  {
    id: 'pi_harpooner', name: 'Harpooner', faction: 'pirate', cost: 125, hp: 140, speed: 4.2,
    build: { scale: 1.06, girth: 1.18 },
    weapon: { line: 'Ranged · harpoons an enemy and reels it in', kind: 'pi_harpoon', style: 'throw', anim: 'throw', item: 'pi_harpoon_hand', proj: 'pi_harpoon', speed: 24, arc: 'low', range: 22, minRange: 4, cooldown: 4.5, damage: 50, force: 150, spread: 0.04, releaseAt: 0.7, windup: 0.9, hold: 2.6, pull: 22 },
    look: { skin: '#dba882', hat: 'pi_beanie', top: 'pi_shirt', legs: '#4a4038', beard: '#6a4a2a' },
    personality: { aggro: 0.55, bravery: 0.2, voice: 0.75, chatter: 0.6, cry: 'roar', idle: 'lean' },
    desc: 'Harpoons the nearest landlubber and hauls it in.',
  },
  {
    id: 'pi_bomb', name: 'Bomb Thrower', faction: 'pirate', cost: 120, hp: 90, speed: 4.5,
    build: { scale: 0.95, girth: 1.0, head: 1.08 },
    weapon: { line: 'Ranged · lobs lit bombs (hits friends too)', kind: 'ranged', style: 'throw', anim: 'throw', item: 'bomb_hand', proj: 'bomb', speed: 13, arc: 'high', range: 22, minRange: 6, cooldown: 3.5, damage: 85, force: 600, spread: 0.08, releaseAt: 0.7, windup: 0.9, blast: 3.4 },
    look: { skin: '#e8b890', hat: 'pi_bandana', top: 'pi_vest', legs: '#5a4630', bare: true },
    personality: { aggro: 0.45, bravery: 0.2, voice: 1.25, chatter: 1, cry: 'cackle', idle: 'shake' },
    desc: 'Lights them, lobs them, laughs.',
  },
  {
    id: 'pi_captain', name: 'Pirate Captain', faction: 'pirate', cost: 420, hp: 450, speed: 4.6,
    build: { scale: 1.1, girth: 1.08, head: 1.05 },
    weapon: {
      line: 'Melee · cutlass and a pistol shot · his shout rallies nearby crew', kind: 'pi_captain', style: 'sword', anim: 'overhead', item: 'pi_cutlass', damage: 50, reach: 1.25, cooldown: 0.9, force: 300,
      gun: { damage: 55, speed: 70, range: 18, spread: 0.03, force: 160, barrel: 0.35, reload: 6 },
      rally: { radius: 9, dur: 4, every: 8 },
    },
    look: { skin: '#e2b088', hat: 'pi_tricorn', top: 'pi_coat', legs: '#2e2a30', beard: '#2a2020', patch: true },
    personality: { aggro: 0.9, bravery: 0, voice: 0.7, chatter: 0.9, cry: 'royal', idle: 'regal' },
    armor: 0.1, stagger: 0.6,
    desc: 'Cutlass in one hand, pistol in the other. Rallies the crew.',
  },
  {
    id: 'pi_queen', name: 'Pirate Queen', faction: 'pirate', cost: 1100, hp: 800, speed: 4.6,
    build: { scale: 1.15, girth: 0.98, head: 1.02 },
    weapon: { line: 'Ranged · rapid volleys from two pistols', kind: 'pr_gun', dual: true, style: 'dual', anim: 'punch', item: 'pi_pistol', item2: 'pi_pistol', damage: 36, speed: 75, range: 24, minRange: 5, cooldown: 0.17, reload: 2.8, ammo: 10, force: 130, spread: 0.04, releaseAt: 0.5, windup: 0.22, barrel: 0.4 },
    look: { skin: '#f0c4a0', hat: 'pi_queen', top: 'pi_coat', legs: '#2a2228' },
    personality: { aggro: 0.5, bravery: 0, voice: 1.35, chatter: 0.8, cry: 'cackle', idle: 'regal' },
    armor: 0.1, stagger: 0.5,
    desc: 'Two pistols, ten shots, no mercy.',
  },
  {
    id: 'pi_cannon', name: 'Cannon', faction: 'pirate', cost: 540, hp: 110, speed: 3.8,
    build: { scale: 0.98, girth: 1.05, radius: 1.9 },
    weapon: { line: 'Siege · cannonballs plough through ranks and bounce on · recoils', kind: 'pi_cannon', style: 'sword', anim: 'overhead', item: 'pi_linstock', proj: 'pr_cannonball', speed: 30, damage: 150, force: 900, range: 50, minRange: 6, cooldown: 4.2, reach: 1.1, spread: 0.015 },
    look: { skin: '#e8b890', hat: 'pi_bandana', top: 'pi_shirt', legs: '#3e3a4a' },
    personality: { aggro: 0.3, bravery: 0, voice: 0.9, chatter: 0.6, cry: 'hey', idle: 'lean' },
    desc: 'Fire in the hole! A cannonball that skips straight through the enemy line.',
  },
  {
    id: 'pi_monkey', name: 'Powder Monkey', faction: 'pirate', cost: 200, hp: 60, speed: 6.4,
    build: { scale: 0.74, girth: 1.0, head: 1.2, mass: 1.1 },
    weapon: { line: 'Bomber · drops a lit powder keg in the enemy line, runs, fetches another', kind: 'pi_monkey', style: 'fists', anim: 'punch', item: 'none', damage: 12, keg: 100, blast: 3.4, force: 700, fuse: 1.25, reload: 6, run: 2.0, dropGap: 2.2, keep: 9, reach: 0.9, cooldown: 0.8 },
    look: { skin: '#e8b890', hat: 'pi_powder', top: 'pi_powder', legs: '#5a4630', bare: true },
    personality: { aggro: 1, bravery: 0, voice: 1.75, chatter: 1, cry: 'cackle', idle: 'hop' },
    desc: 'A cabin boy with a powder keg. Drops it, runs, comes back with another.',
  },
];

// ------------------------------------------------------------------ visuals
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, wood, darkWood, leather, glow, gold } = H;
  const iron = mat('#4a4e56', { spec: 0.8 }), brass = mat('#c89a3a', { spec: 0.9 });
  if (name === 'pi_pistol') { // along +Y: barrel forward, grip down (-Z)
    s *= 1.25;
    mesh(cyl(0.022 * s, 0.026 * s, 0.32 * s, 8), iron, 0, 0.21 * s, 0.03 * s, g);
    mesh(cyl(0.03 * s, 0.03 * s, 0.03 * s, 8), brass, 0, 0.37 * s, 0.03 * s, g);
    mesh(box(0.036 * s, 0.26 * s, 0.04 * s), wood(), 0, 0.12 * s, 0.0, g);
    mesh(box(0.04 * s, 0.07 * s, 0.03 * s), iron, 0.012 * s, 0.03 * s, 0.04 * s, g); // lock
    const hm = mesh(box(0.012 * s, 0.03 * s, 0.05 * s), iron, 0.02 * s, 0.0, 0.07 * s, g); hm.rotation.x = -0.5;
    const gr = mesh(box(0.038 * s, 0.06 * s, 0.15 * s), wood(), 0, -0.04 * s, -0.06 * s, g); gr.rotation.x = 0.55;
    mesh(sphere(0.035 * s, 8, 6), brass, 0, -0.08 * s, -0.12 * s, g);
    return true;
  }
  if (name === 'pi_cutlass') {
    const L = 0.85 * s, steel = mat('#c8ced6', { spec: 1 });
    mesh(cyl(0.03 * s, 0.03 * s, L * 0.18, 8), leather(), 0, L * 0.08, 0, g);
    // a broad blade curving back toward the tip (edge toward +Z)
    const bl = H.geo('pi_cutlass' + s.toFixed(3), () => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.032 * s, 0.17 * L);
      sh.lineTo(0.042 * s, 0.17 * L);
      sh.quadraticCurveTo(0.055 * s, 0.75 * L, -0.02 * s, 1.0 * L);
      sh.quadraticCurveTo(-0.05 * s, 0.93 * L, -0.06 * s, 0.85 * L);
      sh.quadraticCurveTo(-0.03 * s, 0.5 * L, -0.032 * s, 0.17 * L);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.012 * s, bevelEnabled: false, curveSegments: 6 });
      eg.translate(0, 0, -0.006 * s);
      eg.rotateY(-Math.PI / 2);
      return eg;
    });
    mesh(bl, steel, 0, 0, 0, g);
    const cup = mesh(dome(H, 0.075 * s, 0.5), gold(), 0, L * 0.18, 0, g); cup.rotation.x = Math.PI; // basket hilt
    const bow = mesh(torus(H, 0.08 * s, 0.01 * s, Math.PI, 10), gold(), 0, L * 0.09, 0.045 * s, g); bow.rotation.y = Math.PI / 2; bow.rotation.z = Math.PI / 2;
    mesh(sphere(0.035 * s, 8, 6), gold(), 0, -0.01 * s, 0, g);
    return true;
  }
  if (name === 'pi_harpoon_hand') {
    const L = 1.6 * s, c = -0.6 * L;
    mesh(cyl(0.024 * s, 0.026 * s, L, 7), wood(), 0, c + L / 2, 0, g);
    mesh(cyl(0.03 * s, 0.03 * s, 0.2 * s, 7), iron, 0, c + L - 0.05 * s, 0, g);
    mesh(cone(0.05 * s, 0.26 * s, 6), iron, 0, c + L + 0.17 * s, 0, g);
    for (const sd of [-1, 1]) { const bb = mesh(box(0.012 * s, 0.14 * s, 0.03 * s), iron, sd * 0.04 * s, c + L + 0.06 * s, 0, g); bb.rotation.z = sd * 0.6; }
    const coil = mesh(torus(H, 0.11 * s, 0.022 * s, Math.PI * 2, 14), mat('#c8b07a'), 0, c + 0.2 * s, 0, g); coil.rotation.x = Math.PI / 2;
    return true;
  }
  if (name === 'pi_linstock') { // a pole with a smouldering match at the tip
    const L = 1.2 * s, c = -0.3 * L;
    mesh(cyl(0.022 * s, 0.026 * s, L, 7), wood(), 0, c + L / 2, 0, g);
    for (const sd of [-1, 1]) { const f = mesh(box(0.014 * s, 0.12 * s, 0.02 * s), iron, sd * 0.03 * s, c + L + 0.04 * s, 0, g); f.rotation.z = sd * 0.35; }
    const coil = mesh(torus(H, 0.045 * s, 0.014 * s, Math.PI * 1.6, 10), mat('#8a6a3a'), 0, c + L + 0.05 * s, 0, g);
    coil.rotation.y = Math.PI / 2;
    mesh(octa(0.035 * s), glow('#ffb040'), 0.0, c + L + 0.1 * s, 0.04 * s, g).castShadow = false;
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, mat, gold, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'pi_bandana': {
      const cap = mesh(dome(H, r * 1.05, 0.52), tc, 0, r * 0.02, -r * 0.02, g); cap.rotation.x = -0.3;
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.4, y = 0.55 + (i % 2) * 0.22; mesh(sphere(r * 0.07, 6, 5), mat('#f4f0e6'), Math.sin(a) * r * 0.9 * Math.sqrt(1 - y * y + 0.2), r * y, Math.cos(a) * r * 0.9 * Math.sqrt(1 - y * y + 0.2) - r * 0.08, g); }
      mesh(sphere(r * 0.17, 8, 6), td, 0, -r * 0.05, -r * 1.0, g);
      for (const sd of [-1, 1]) { const t = mesh(box(r * 0.14, r * 0.55, r * 0.05), td, sd * r * 0.13, -r * 0.38, -r * 1.02, g); t.rotation.z = sd * 0.35; }
      return true;
    }
    case 'pi_beanie': { // knitted watch cap with a turned-up brim
      const cap = mesh(dome(H, r * 1.07, 0.55), tc, 0, r * 0.15, 0, g); cap.scale.set(1, 1.05, 1);
      headBand(H, r, 0.32, 0.3, td, g, 0.09);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const rib = mesh(box(r * 0.04, r * 0.3, r * 0.03), td, Math.sin(a) * r * 1.05, r * 0.33, Math.cos(a) * r * 1.05, g); rib.rotation.y = a; }
      mesh(torus(H, r * 0.12, r * 0.03, Math.PI * 2, 10), gold(), r * 0.98, -r * 0.3, 0, g).rotation.y = Math.PI / 2; // earring
      return true;
    }
    case 'pi_powder': { // a sooty knitted cap pulled down, soot on the cheeks
      const cap = mesh(dome(H, r * 1.06, 0.5), tc, 0, r * 0.12, -r * 0.04, g); cap.rotation.x = -0.15;
      headBand(H, r, 0.25, 0.26, td, g, 0.1);
      mesh(sphere(r * 0.2, 8, 6), td, 0, r * 1.12, -r * 0.1, g); // pom-pom
      for (const sd of [-1, 1]) mesh(sphere(r * 0.16, 8, 6), mat('#4a4440'), sd * r * 0.5, -r * 0.2, r * 0.8, g).scale.set(1, 0.6, 0.35);
      return true;
    }
    case 'pi_tricorn': case 'pi_queen': {
      const q = kind === 'pi_queen';
      const felt = mat(q ? '#3a1e2e' : '#24222a', { spec: 0.15 });
      mesh(dome(H, r * 0.97, 0.5), felt, 0, r * 0.45, 0, g).scale.set(1, 0.85, 1);
      mesh(H.cyl(r * 1.05, r * 1.05, r * 0.08, 18), felt, 0, r * 0.46, 0, g);
      for (let k = 0; k < 3; k++) { // three cocked-up sides, the point to the front
        const a = (k / 3) * Math.PI * 2 + Math.PI;
        const d = r * 0.92;
        const w = mesh(box(r * 1.9, r * (q ? 0.62 : 0.55), r * 0.07), felt, Math.sin(a) * d, r * 0.68, Math.cos(a) * d, g);
        w.rotation.order = 'YXZ'; w.rotation.y = a; w.rotation.x = 0.38;
        const tr = mesh(box(r * 1.92, r * 0.06, r * 0.09), gold(), Math.sin(a) * (d + r * 0.11), r * 0.94 + (q ? 0.04 * r : 0), Math.cos(a) * (d + r * 0.11), g);
        tr.rotation.order = 'YXZ'; tr.rotation.y = a; tr.rotation.x = 0.38;
      }
      // feathers in the team colour
      const n = q ? 4 : 1;
      for (let i = 0; i < n; i++) {
        const f = mesh(sphere(r * 0.5, 10, 6), i % 2 ? td : tc, r * (0.55 - i * 0.12), r * (1.05 + i * 0.12), -r * (0.5 + i * 0.12), g);
        f.scale.set(0.22, 1.25, 0.45); f.rotation.set(-0.6 - i * 0.2, 0, -0.6 + i * 0.15);
      }
      if (q) { // long hair down the back and a skull badge
        const hair = mat('#6a2a1a', { spec: 0.1 });
        mesh(hoodGeo(H, r, 1.04, 1.25), hair, 0, 0, 0, g);
        const h1 = mesh(H.capsule(r * 0.42, r * 1.3), hair, 0, -r * 0.95, -r * 0.55, g); h1.rotation.x = 0.25; h1.scale.set(1.25, 1, 0.6);
        for (const sd of [-1, 1]) { const c = mesh(H.capsule(r * 0.18, r * 0.8), hair, sd * r * 0.82, -r * 0.6, -r * 0.05, g); c.rotation.z = sd * 0.1; }
        mesh(sphere(r * 0.12, 8, 6), mat('#f4f0e6'), 0, r * 0.66, r * 1.12, g);
      } else mesh(sphere(r * 0.1, 8, 6), mat('#f4f0e6'), 0, r * 0.66, r * 1.08, g);
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'pirate') return;
  // the cannon is an extra body: vis.extraParts in the same order siegeInit makes them
  if (def.id === 'pi_cannon') for (const l of siegeLayout(CANNON)) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, leather } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  const pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const white = mat('#f2efe6', { spec: 0.1 });
  const sleeve = (m, k = 1) => { for (const p of [PART.uarmL, PART.uarmR]) mesh(H.capsule(skel.parts[p].r * 1.12 * k, skel.parts[p].hh * 2), m, 0, 0, 0, parts[p]); };
  if (top === 'pi_shirt') { // striped sailor shirt, sash
    chestShell(H, ch, white, C);
    for (const y of [0.7, 0.15, -0.4]) mesh(cyl(r * 1.2, r * 1.2, r * 0.17, 16), tc, 0, hh * y * 1.2, 0, C).scale.set(1, 1, 0.94);
    sleeve(white);
    for (const p of [PART.uarmL, PART.uarmR]) mesh(cyl(skel.parts[p].r * 1.18, skel.parts[p].r * 1.18, skel.parts[p].r * 0.8, 10), tc, 0, 0, 0, parts[p]);
    mesh(cyl(r * 1.22, r * 1.22, r * 0.3, 16), td, 0, -hh - r * 0.4, 0, C).scale.set(1, 1, 0.95);
    const kn = mesh(box(r * 0.2, r * 0.6, r * 0.08), td, r * 0.9, -hh - r * 0.75, r * 0.45, C); kn.rotation.z = 0.2;
  }
  if (top === 'pi_vest') { // open vest over a bare chest, a bandolier of bombs
    const vest = mat('#5a3a26', { spec: 0.15 });
    const back = mesh(H.capsule(r * 1.19, hh * 2), vest, 0, 0, -r * 0.42, C); back.scale.set(1, 0.92, 0.6);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.45, (hh + r) * 1.65, r * 0.08), vest, sd * r * 0.72, -hh * 0.1, r * 0.72, C); l.rotation.y = sd * 0.55; }
    const band = mesh(box(r * 0.18, (hh + r) * 2.1, r * 0.06), leather(), 0, -r * 0.05, r * 1.02, C); band.rotation.z = -0.6;
    for (const k of [-1, 0, 1]) mesh(sphere(r * 0.15, 8, 6), mat('#1d1a1a', { spec: 0.4 }), -Math.sin(0.6) * k * r * 0.5, k * r * 0.5 * Math.cos(0.6), r * 1.1, C);
    mesh(cyl(r * 1.2, r * 1.2, r * 0.3, 16), tc, 0, -hh - r * 0.4, 0, C).scale.set(1, 1, 0.95);
  }
  if (top === 'pi_powder') { // a ragged shirt, a sash, and a spare keg strapped on the back
    const rag = mat('#d8ccb0', { spec: 0.05 });
    chestShell(H, ch, rag, C);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const t = mesh(cone(r * 0.2, r * 0.45, 4), rag, Math.sin(a) * r * 1.05, -hh - r * 0.75, Math.cos(a) * r * 1.0, C); t.rotation.x = Math.PI; }
    mesh(cyl(r * 1.22, r * 1.22, r * 0.28, 16), tc, 0, -hh - r * 0.35, 0, C).scale.set(1, 1, 0.95);
    const kg = new THREE.Group(); kegMesh(H, kg, team, 0.75); kg.position.set(0, 0, -r * 1.75); kg.rotation.z = Math.PI / 2; C.add(kg);
    for (const sd of [-1, 1]) { const st = mesh(box(r * 0.12, (hh + r) * 2.2, r * 0.05), leather(), sd * r * 0.5, 0, r * 0.98, C); st.rotation.z = sd * 0.25; }
  }
  if (top === 'pi_coat') { // long coat: gold buttons and trim, cravat, cuffs, coat tails
    const q = def.id === 'pi_queen';
    chestShell(H, ch, tc, C);
    for (const sd of [-1, 1]) {
      const l = mesh(box(r * 0.3, (hh + r) * 1.6, r * 0.06), td, sd * r * 0.32, 0, r * 1.06, C); l.rotation.z = sd * 0.12;
      mesh(box(r * 0.05, (hh + r) * 1.6, r * 0.07), gold(), sd * r * 0.47, 0, r * 1.07, C).rotation.z = sd * 0.12;
      for (const y of [0.5, 0.0, -0.5]) mesh(sphere(r * 0.07, 6, 5), gold(), sd * r * 0.55, hh * y, r * 1.02, C);
      // epaulettes
      const ep = mesh(sphere(r * 0.42, 10, 6), gold(), sd * r * 1.0, hh + r * 0.35, 0, C); ep.scale.set(1, 0.4, 1);
    }
    const crav = mesh(cone(r * 0.32, r * 0.65, 8), white, 0, hh + r * 0.15, r * 0.95, C); crav.rotation.x = Math.PI + 0.25; crav.scale.set(1, 1, 0.5);
    mesh(cyl(r * 1.22, r * 1.22, r * 0.26, 16), q ? gold() : leather(), 0, -hh - r * 0.4, 0, C).scale.set(1, 1, 0.95);
    mesh(box(r * 0.3, r * 0.24, r * 0.06), gold(), 0, -hh - r * 0.4, r * 1.12, C);
    if (q) { const sash = mesh(box(r * 0.25, (hh + r) * 2.2, r * 0.05), gold(), 0, 0, r * 1.1, C); sash.rotation.z = 0.55; }
    const tails = mesh(cyl(pel.r * 1.25, pel.r * 1.6, pel.r * 2.4, 16), tc, 0, -pel.r * 0.95, -pel.r * 0.12, P);
    tails.scale.set(1, 1, 0.9);
    mesh(cyl(pel.r * 1.62, pel.r * 1.62, pel.r * 0.18, 16), gold(), 0, -pel.r * 2.1, -pel.r * 0.12, P).scale.set(1, 1, 0.9);
    for (const p of [PART.farmL, PART.farmR]) {
      const fp = skel.parts[p];
      mesh(cyl(fp.r * 1.85, fp.r * 1.5, fp.hh * 0.7, 10), td, 0, -fp.hh * 0.35, 0, parts[p]);
      mesh(cyl(fp.r * 1.9, fp.r * 1.9, fp.r * 0.3, 10), gold(), 0, -fp.hh * 0.02, 0, parts[p]);
      const lace = mesh(cyl(fp.r * 1.2, fp.r * 1.7, fp.r * 0.6, 10), white, 0, -fp.hh * 0.8, 0, parts[p]); lace.castShadow = false;
    }
  }
  if (def.look.patch) { // an eye patch over the right eye
    const hd = skel.parts[PART.head], hr = hd.r, Hd = parts[PART.head];
    const blk = mat('#151212');
    mesh(box(hr * 0.34, hr * 0.28, hr * 0.1), blk, -hr * 0.3, hr * 0.12, hr * 0.94, Hd).rotation.y = -0.3;
    const st = mesh(torus(H, hr * 1.02, hr * 0.03, Math.PI * 2, 18), blk, 0, hr * 0.2, 0, Hd);
    st.rotation.x = Math.PI / 2 - 0.35; st.rotation.y = 0.0;
  }
  if (def.id === 'pi_captain') { // his pistol, in the left hand (the cutlass is the held item)
    const pg = new THREE.Group();
    pg.position.set(0, -skel.handOffset, 0);
    pg.rotation.x = Math.PI;
    buildItem('pi_pistol', skel.scale, team, pg, H);
    parts[PART.farmL].add(pg);
  }
}

// Cannon carriage, in its body frame (+Z toward the muzzle)
function cannonCart(H, team) {
  const g = new THREE.Group();
  const { mesh, box, cyl, sphere, mat, wood, darkWood, metal, gold } = H;
  const tc = mat(H.TEAM_COLORS[team]), td = mat(H.TEAM_DARK[team]);
  const iron = mat('#33363c', { spec: 0.7 }), bronze = mat('#a07a38', { spec: 0.8 });
  for (const sd of [-1, 1]) {
    mesh(box(0.09, 0.32, 1.1), wood(), sd * 0.24, 0.12, 0.15, g);
    mesh(box(0.095, 0.12, 0.6), tc, sd * 0.24, 0.2, 0.35, g);
    mesh(box(0.1, 0.04, 1.12), darkWood(), sd * 0.24, 0.29, 0.15, g);
    mesh(cyl(0.05, 0.05, 0.1, 8), iron, sd * 0.18, 0.32, 0.25, g).rotation.z = Math.PI / 2; // trunnion caps
    wheel(H, g, sd * 0.58, 0, 0.3, 0.42, darkWood(), wood(), 10);
    mesh(cyl(0.11, 0.11, 0.05, 10), tc, sd * 0.66, 0, 0.3, g).rotation.z = Math.PI / 2;
  }
  mesh(cyl(0.05, 0.05, 1.22, 8), darkWood(), 0, 0, 0.3, g).rotation.z = Math.PI / 2;
  for (const z of [-0.25, 0.6]) mesh(box(0.42, 0.08, 0.12), darkWood(), 0, -0.02, z, g);
  const tr = mesh(box(0.26, 0.1, 0.98), wood(), 0, -0.2, -0.75, g); tr.rotation.x = -0.42;
  mesh(box(0.2, 0.06, 0.12), iron, 0, -0.39, -1.2, g).rotation.x = -0.42;
  barrel(H, g, 0, 0.32, -0.5, 1.05, 0.15, iron, bronze);
  // rammer along the left cheek, a team pennant at the back
  const rm = mesh(cyl(0.022, 0.022, 1.3, 6), wood(), 0.36, 0.34, 0.15, g); rm.rotation.x = Math.PI / 2;
  const sp = mesh(cyl(0.05, 0.05, 0.14, 8), mat('#3a3028'), 0.36, 0.34, 0.85, g); sp.rotation.x = Math.PI / 2;
  mesh(cyl(0.02, 0.02, 1.0, 6), darkWood(), -0.24, 0.75, -0.35, g);
  mesh(box(0.015, 0.24, 0.36), tc, -0.24, 1.1, -0.53, g);
  mesh(box(0.016, 0.08, 0.36), td, -0.24, 1.02, -0.53, g);
  mesh(sphere(0.035, 6, 5), gold(), -0.24, 1.26, -0.35, g);
  // a few spare balls on the trail
  for (const [x, z] of [[0.06, -0.55], [-0.06, -0.55], [0, -0.66]]) { const o = new THREE.Group(); o.position.set(x, -0.04 + (z < -0.6 ? 0.04 : 0), z); ballMesh(H, o, 0.075); g.add(o); }
  return g;
}

// a small powder keg (staves, two team hoops, a wick)
function kegMesh(H, g, team, k = 1, wick = false) {
  const { mesh, cyl, sphere, mat, glow } = H;
  const R = 0.2 * k, L = 0.42 * k;
  mesh(cyl(R * 0.85, R * 0.85, L, 12), H.wood(), 0, 0, 0, g);
  mesh(cyl(R, R, L * 0.6, 12), H.wood(), 0, 0, 0, g);
  for (const y of [-0.32, 0.32]) mesh(cyl(R * 0.95, R * 0.95, L * 0.08, 12), team === null ? mat('#4a4e56', { spec: 0.7 }) : mat(H.TEAM_COLORS[team]), 0, y * L, 0, g);
  mesh(cyl(R * 0.8, R * 0.8, 0.01, 12), H.darkWood(), 0, L * 0.5, 0, g);
  if (wick) {
    mesh(cyl(0.012, 0.012, 0.12 * k, 4), mat('#c8a060'), 0.04 * k, L * 0.5 + 0.06 * k, 0, g).rotation.z = -0.4;
    const sp = mesh(H.octa(0.035), glow('#ffd040'), 0.07 * k, L * 0.5 + 0.12 * k, 0, g); sp.castShadow = false;
  }
}

function buildProj(type, g, H) {
  if (type === 'pi_keg' || type === 'pi_keg_held') { kegMesh(H, g, null, 1, true); return true; }
  if (type !== 'pi_harpoon') return false;
  const { mesh, cyl, cone, box, mat } = H;
  const iron = mat('#4a4e56', { spec: 0.8 });
  mesh(cyl(0.024, 0.024, 1.4, 6), mat('#9a6332'), 0, 0, 0, g);
  mesh(cone(0.05, 0.26, 6), iron, 0, 0.82, 0, g);
  for (const sd of [-1, 1]) { const bb = mesh(box(0.012, 0.14, 0.03), iron, sd * 0.04, 0.7, 0, g); bb.rotation.z = sd * 0.6; }
  mesh(cyl(0.032, 0.032, 0.12, 6), mat('#c8b07a'), 0, -0.62, 0, g);
  return true;
}

register({
  factions: [{ id: 'pirate', name: 'Pirate', color: '#2a9d7c' }],
  units,
  items: {
    pi_pistol: { len: 0.38, r: 0.05, grip: 90, mass: 1.0 },
    pi_cutlass: { len: 0.85, r: 0.07, grip: 30, metal: true, mass: 1.3 },
    pi_harpoon_hand: { len: 1.6, r: 0.05, grip: 90, back: 0.6, mass: 1.6 },
    pi_linstock: { len: 1.2, r: 0.05, grip: 80, back: 0.3, mass: 1.0 },
  },
  kinds: {
    pi_harpoon: harpooner,
    pi_captain: captain,
    pi_monkey: monkey,
    pi_cannon: { melee: true, init: (u) => siegeInit(u, CANNON), think: siegeThink, event: cannonEvent, die: siegeCrewDie, control: siegeControl },
  },
  proj: { pi_harpoon: harpoon, pi_keg: keg, pi_keg_held: { g: 0, len: 0, r: 0, life: 1 } },
  buildItem, buildHat, decorate, buildProj,
});
