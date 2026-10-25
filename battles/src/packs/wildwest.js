// Wild West: Cactus (stands still; thorns hurt whoever hits it), Gunslinger (six
// quick revolver shots, then a slow reload), Blunderbuss (a cone of pellets up
// close), Lasso (ropes an enemy and drags it in), Dynamite (bouncing sticks with a
// fuse).
import { register } from '../ext.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, aimPoint, launchVel,
  addProjectile, handPos, sweepParts, strike, shieldBlocks, addRope, torus, tube, dome, headBand, tcol, tdark, chestShell,
} from './common.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();

// ------------------------------------------------------------------ kinds
const cactus = {
  melee: true,
  think(u, dt, c) {
    const f = meleeThink(u, dt, c);
    u.desired.set(0, 0, 0); // rooted
    return f;
  },
  hit(u, amount, part, attacker, kind) {
    if (kind !== 'melee' || !attacker || !attacker.alive || attacker === u) return amount;
    const b = u.battle, w = u.def.weapon;
    _d.set(attacker.pos.x - u.pos.x, 0, attacker.pos.z - u.pos.z).normalize();
    const k = attacker.M * 2.2;
    attacker.hit(w.thorns, PART.farmR, _d.x * k * 0.3, k * 0.1, _d.z * k * 0.3, u, 'thorns');
    attacker.rag.impulseAll(_d.x * k, k * 0.3, _d.z * k);
    const h = attacker.rag.pos[PART.farmR];
    b.emit('blood', h.x, h.y, h.z, 3, _d.x, _d.z);
    b.sound('stab', h, 0.5, 1.5);
    return amount;
  },
};

const gun = {
  init(u) { u.attackDur = u.def.weapon.windup; u.ammo = u.def.weapon.ammo; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    const hand = handPos(u, _o);
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    hand.x += fx * w.barrel * u.s; hand.z += fz * w.barrel * u.s; hand.y += 0.04 * u.s;
    aimPoint(u, _p, 0.4, 0.2);
    if (!u.aimAt && u.control && !u.control.aimPt) _p.y = hand.y + Math.tan(u.control.aimPitch) * 14;
    for (let i = 0; i < (w.pellets || 1); i++) {
      launchVel(hand, _p, w.speed * rand(0.95, 1.05), 1.5, false, w.spread, _v);
      addProjectile(b, 'bullet', hand, _v, u, { life: w.range / w.speed * 1.4 });
    }
    b.emit('spark', hand.x, hand.y, hand.z, w.pellets ? 4 : 2);
    b.emit('dust', hand.x + fx * 0.3, hand.y, hand.z + fz * 0.3, w.pellets ? 2 : 1);
    b.sound('boom', hand, w.pellets ? 0.55 : 0.32, w.pellets ? 1.5 : 2.6);
    // recoil
    u.rag.impulse(PART.farmR, -fx * u.M * 0.08, u.M * 0.06, -fz * u.M * 0.08);
    if (w.pellets) u.rag.impulseAll(-fx * u.M * 0.6, 0, -fz * u.M * 0.6);
    if (--u.ammo <= 0) {
      u.ammo = w.ammo;
      u.cooldown = w.reload * rand(0.9, 1.1);
      b.delayed.push([0.5, () => b.sound('click', u.pos, 0.4, 0.8)]);
      b.delayed.push([w.reload * 0.8, () => b.sound('click', u.pos, 0.5, 1.3)]);
    }
  },
};

// ------------------------------------------------------------------ projectiles
const bullet = {
  g: 1.5, len: 0.22, r: 0.03, life: 1.2,
  step(b, pr) {
    const h = sweepParts(b, pr, 0.04);
    if (!h) return;
    const dir = _d.copy(pr.vel).normalize();
    if (!shieldBlocks(b, h.v, dir, 0.6)) strike(b, h.v, pr.damage, dir, pr.force, pr.owner, 'bullet', h.part, 'thud');
    pr.life = -1;
  },
  hit(b, pr, v) {
    const dir = _d.copy(pr.vel).normalize();
    strike(b, v, pr.damage, dir, pr.force, pr.owner, 'bullet', PART.chest, 'thud');
    return true;
  },
  ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 0.5); return true; },
};

const lasso = {
  g: 9.81, len: 0, r: 0.3, life: 4,
  step(b, pr) {
    const h = sweepParts(b, pr, 0.3);
    if (!h) return;
    const v = h.v;
    pr.life = -1;
    if (!pr.owner.alive) return;
    v.hit(pr.damage, PART.chest, 0, 0, 0, pr.owner, 'lasso');
    v.stun = Math.max(v.stun, 0.6);
    addRope(b, pr.owner, v, pr.owner.def.weapon.hold, pr.owner.def.weapon.pull);
    b.sound('whoosh', v.chestPos, 0.8, 1.6);
    b.emit('dust', v.chestPos.x, v.chestPos.y, v.chestPos.z, 1);
  },
  hit(b, pr, v) { if (pr.owner.alive) addRope(b, pr.owner, v, pr.owner.def.weapon.hold, pr.owner.def.weapon.pull); return true; },
  ground(b, pr) { b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 1); return true; },
};

const dynamite = {
  g: 9.81, len: 0, r: 0.12, explode: 'bomb', fuse: 0.9, life: 6,
  step(b, pr) {
    pr.sparkT = (pr.sparkT || 0) - 1;
    if (pr.sparkT <= 0) { pr.sparkT = 6; _v.set(0, 0.2, 0).applyQuaternion(pr.quat).add(pr.pos); b.emit('spark', _v.x, _v.y, _v.z, 0.5); }
  },
};

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'ww_cactus', name: 'Cactus', faction: 'wildwest', cost: 40, hp: 190, speed: 0,
    build: { scale: 1.05, girth: 1.15, legs: 0.8, mass: 2.2 },
    weapon: { line: 'Stationary · thorns hurt melee attackers', kind: 'ww_cactus', style: 'fists', anim: 'slam', item: 'none', damage: 22, reach: 1.0, cooldown: 1.2, force: 320, thorns: 14, fistHit: true },
    look: { skin: '#5aa04a', hat: 'ww_cactus', top: 'ww_cactus', bare: true },
    personality: { aggro: 1, bravery: 0, voice: 0.6, chatter: 0.2, cry: 'ooga', idle: 'brace' },
    stagger: 0.15,
    desc: "Doesn't move. Hurts to hit.",
  },
  {
    id: 'ww_gunslinger', name: 'Gunslinger', faction: 'wildwest', cost: 220, hp: 95, speed: 4.6,
    build: { scale: 0.98, girth: 0.95 },
    weapon: { line: 'Ranged · six-shooter, slow reload', kind: 'ww_gun', style: 'sword', anim: 'punch', item: 'ww_revolver', damage: 25, speed: 70, range: 30, minRange: 7, cooldown: 0.55, reload: 3.2, ammo: 6, force: 120, spread: 0.035, releaseAt: 0.5, windup: 0.45, barrel: 0.35 },
    look: { skin: '#e8b890', hat: 'ww_cowboy_black', top: 'ww_vest', legs: '#4a4060' },
    personality: { aggro: 0.35, bravery: 0.25, voice: 0.9, chatter: 0.6, cry: 'hey', idle: 'shift' },
    desc: 'Six fast shots, then a slow reload.',
  },
  {
    id: 'ww_blunderbuss', name: 'Blunderbuss', faction: 'wildwest', cost: 225, hp: 130, speed: 4.2,
    build: { scale: 1.02, girth: 1.1 },
    weapon: { line: 'Ranged · short-range pellet cone', kind: 'ww_gun', style: 'spear', anim: 'punch', item: 'ww_blunderbuss', damage: 18, pellets: 9, speed: 45, range: 11, minRange: 3, cooldown: 3.0, reload: 3.0, ammo: 1, force: 220, spread: 0.13, releaseAt: 0.5, windup: 0.7, barrel: 0.8 },
    look: { skin: '#e8b890', hat: 'ww_bowler', top: 'ww_poncho', legs: '#5a4630' },
    personality: { aggro: 0.6, bravery: 0.2, voice: 0.8, chatter: 0.5, cry: 'hey', idle: 'lean' },
    desc: 'A cone of buckshot. Devastating up close.',
  },
  {
    id: 'ww_lasso', name: 'Lasso', faction: 'wildwest', cost: 90, hp: 105, speed: 4.6,
    build: { scale: 1.0, girth: 1.0 },
    weapon: { line: 'Support · ropes enemies and drags them in', kind: 'ranged', style: 'throw', anim: 'throw', item: 'ww_lasso_hand', proj: 'lasso', speed: 15, arc: 'low', range: 17, minRange: 4, cooldown: 4.2, damage: 20, force: 0, spread: 0.04, releaseAt: 0.7, windup: 0.8, hold: 2.2, pull: 26 },
    look: { skin: '#e8b890', hat: 'ww_cowboy', top: 'ww_vest', legs: '#6a5236' },
    personality: { aggro: 0.45, bravery: 0.25, voice: 1.0, chatter: 0.8, cry: 'yip', idle: 'bounce' },
    desc: 'Ropes an enemy and drags it into your lines.',
  },
  {
    id: 'ww_dynamite', name: 'Dynamite', faction: 'wildwest', cost: 120, hp: 95, speed: 4.4,
    build: { scale: 0.95, girth: 1.05, head: 1.05 },
    weapon: { line: 'Ranged · bouncing dynamite on a fuse', kind: 'ranged', style: 'throw', anim: 'throw', item: 'ww_dynamite_hand', proj: 'dynamite', speed: 14, arc: 'high', range: 22, minRange: 6, cooldown: 2.8, damage: 100, force: 600, spread: 0.08, releaseAt: 0.7, windup: 0.9, blast: 3.6 },
    look: { skin: '#e8b890', hat: 'ww_miner', top: 'overalls', legs: '#4a5a7a', beard: '#7a5a3a' },
    personality: { aggro: 0.45, bravery: 0.25, voice: 0.85, chatter: 0.9, cry: 'cackle', idle: 'shake' },
    desc: 'Bouncing sticks of dynamite on a short fuse.',
  },
];

// ------------------------------------------------------------------ visuals
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, wood, darkWood, leather, glow, gold } = H;
  const steel = mat('#5a626c', { spec: 0.9 });
  if (name === 'ww_revolver') { // along +Y: barrel forward, grip down (-Z)
    mesh(cyl(0.022 * s, 0.022 * s, 0.26 * s, 8), steel, 0, 0.2 * s, 0.03 * s, g);
    mesh(cyl(0.045 * s, 0.045 * s, 0.08 * s, 8), steel, 0, 0.06 * s, 0.03 * s, g);
    mesh(box(0.04 * s, 0.07 * s, 0.05 * s), steel, 0, 0.0, 0.02 * s, g);
    const gr = mesh(box(0.035 * s, 0.05 * s, 0.13 * s), mat('#7a4a2a'), 0, -0.03 * s, -0.05 * s, g); gr.rotation.x = 0.3;
    mesh(box(0.01 * s, 0.03 * s, 0.02 * s), steel, 0, 0.31 * s, 0.06 * s, g);
    return true;
  }
  if (name === 'ww_blunderbuss') {
    const L = 1.0 * s, back = 0.3 * L;
    mesh(box(0.05 * s, L * 0.45, 0.08 * s), wood(), 0, -back + L * 0.2, -0.01 * s, g); // stock
    const st = mesh(box(0.05 * s, 0.22 * s, 0.14 * s), wood(), 0, -back + 0.02 * s, -0.04 * s, g); st.rotation.x = 0.2;
    mesh(cyl(0.03 * s, 0.03 * s, L * 0.6, 8), mat('#b58a3a', { spec: 0.9 }), 0, -back + L * 0.68, 0.03 * s, g);
    mesh(cyl(0.075 * s, 0.035 * s, 0.14 * s, 10), mat('#b58a3a', { spec: 0.9 }), 0, -back + L * 0.98, 0.03 * s, g); // flared muzzle
    mesh(box(0.06 * s, 0.06 * s, 0.03 * s), steel, 0, -back + L * 0.38, 0.06 * s, g);
    return true;
  }
  if (name === 'ww_lasso_hand') {
    const rope = mat('#c8a46a');
    for (let i = 0; i < 3; i++) { const t = mesh(torus(H, (0.16 + i * 0.015) * s, 0.016 * s, Math.PI * 2, 14), rope, 0, 0, 0.1 * s + i * 0.01 * s, g); t.rotation.y = Math.PI / 2 + i * 0.15; }
    return true;
  }
  if (name === 'ww_dynamite_hand') {
    const red = mat('#c8302a');
    for (const x of [-0.035, 0, 0.035]) mesh(cyl(0.03 * s, 0.03 * s, 0.24 * s, 8), red, x * s, 0, 0.1 * s, g);
    mesh(cyl(0.075 * s, 0.075 * s, 0.03 * s, 10), mat('#2a2a2a'), 0, 0, 0.1 * s, g).scale.set(1, 1, 0.5);
    mesh(cyl(0.008 * s, 0.008 * s, 0.1 * s, 4), mat('#e8e0c0'), 0, 0.16 * s, 0.1 * s, g);
    mesh(octa(0.025 * s), glow('#ffd040'), 0, 0.22 * s, 0.1 * s, g).castShadow = false;
    return true;
  }
  return false;
}

function cowboy(r, g, H, col, band) {
  const { mesh, cyl, sphere, mat } = H;
  const felt = mat(col, { spec: 0.1 });
  const brim = H.geo('wwbrim' + r.toFixed(3), () => {
    const gg = new THREE.CylinderGeometry(r * 1.75, r * 1.75, r * 0.06, 22, 1);
    const p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + (x * x) / (r * r) * r * 0.09); }
    gg.computeVertexNormals();
    return gg;
  });
  mesh(brim, felt, 0, r * 0.66, 0, g);
  const cr = mesh(cyl(r * 0.72, r * 0.8, r * 0.62, 16), felt, 0, r * 1.0, 0, g);
  cr.scale.set(1, 1, 1.12);
  mesh(sphere(r * 0.7, 12, 6), felt, 0, r * 1.25, 0, g).scale.set(1.05, 0.28, 1.18);
  mesh(cyl(r * 0.82, r * 0.82, r * 0.12, 16), band, 0, r * 0.76, 0, g).scale.set(1, 1, 1.12);
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'ww_cowboy': cowboy(r, g, H, '#c8a070', tc); return true;
    case 'ww_cowboy_black': cowboy(r, g, H, '#2a2424', tc); return true;
    case 'ww_bowler': {
      const blk = mat('#3a3030', { spec: 0.25 });
      mesh(dome(H, r * 0.92, 0.5), blk, 0, r * 0.68, 0, g).scale.set(1, 0.9, 1.05);
      mesh(cyl(r * 1.25, r * 1.25, r * 0.06, 20), blk, 0, r * 0.68, 0, g).scale.set(1, 1, 1.1);
      mesh(cyl(r * 0.94, r * 0.94, r * 0.12, 16), tc, 0, r * 0.76, 0, g).scale.set(1, 1, 1.05);
      for (const sd of [-1, 1]) { const m = mesh(H.capsule(r * 0.09, r * 0.34), mat('#4a2e1a'), sd * r * 0.22, -r * 0.3, r * 0.93, g); m.rotation.z = sd * (Math.PI / 2 + 0.25); } // moustache
      return true;
    }
    case 'ww_miner': {
      const hel = mat('#d8a830', { spec: 0.4 });
      mesh(dome(H, r * 1.08, 0.5), hel, 0, r * 0.45, 0, g);
      mesh(cyl(r * 1.25, r * 1.3, r * 0.06, 20), hel, 0, r * 0.45, r * 0.05, g);
      mesh(cyl(r * 0.2, r * 0.22, r * 0.25, 10), H.metal(), 0, r * 0.95, r * 0.85, g).rotation.x = Math.PI / 2;
      mesh(cyl(r * 0.16, r * 0.16, r * 0.04, 10), glow('#fff2b0'), 0, r * 0.95, r * 0.99, g).rotation.x = Math.PI / 2;
      mesh(box(r * 0.3, r * 0.08, r * 1.4), tc, 0, r * 1.5, -r * 0.05, g);
      return true;
    }
    case 'ww_cactus': { // a flower and a few spines on top
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const p = mesh(sphere(r * 0.3, 8, 6), tc, Math.cos(a) * r * 0.3, r * 1.08, Math.sin(a) * r * 0.3, g); p.scale.set(1, 0.45, 1); }
      mesh(sphere(r * 0.16, 8, 6), mat('#ffe14a'), 0, r * 1.16, 0, g);
      for (let i = 0; i < 10; i++) { const a = i * 2.4, y = (i % 3) * 0.3 - 0.1; const sp = mesh(cone(r * 0.03, r * 0.22, 4), mat('#f4ead0'), Math.cos(a) * r * 1.02, y * r, Math.sin(a) * r * 1.02 - (Math.sin(a) > 0.5 ? 0.2 * r : 0), g); sp.lookAt(Math.cos(a) * 5, y * 5, Math.sin(a) * 5); sp.rotateX(Math.PI / 2); }
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'wildwest') return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, leather } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  const pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  if (top === 'ww_vest' || top === 'ww_poncho') { // neck bandana
    const bn = mesh(cone(r * 0.45, r * 0.6, 4), td, 0, hh + r * 0.15, r * 0.72, C); bn.rotation.x = Math.PI + 0.35; bn.scale.set(1.2, 1, 0.4);
    mesh(torus(H, r * 0.55, r * 0.09, Math.PI * 2, 14), td, 0, hh + r * 0.62, 0, C).rotation.x = Math.PI / 2;
  }
  if (top === 'ww_vest') {
    const vest = mat(def.id === 'ww_gunslinger' ? '#3a2a22' : '#7a5232', { spec: 0.2 });
        chestShell(H, ch, vest, C);
    mesh(box(r * 0.55, (hh + r) * 1.7, r * 0.05), tc, 0, -hh * 0.05, r * 1.06, C); // the shirt between the lapels
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.16, (hh + r) * 1.2, r * 0.05), vest, sd * r * 0.3, hh * 0.15, r * 1.09, C); l.rotation.z = sd * 0.25; }
    mesh(box(r * 1.9, r * 0.2, r * 1.75), leather(), 0, -hh - r * 0.38, 0, C);
    mesh(box(r * 0.25, r * 0.18, r * 0.05), gold(), 0, -hh - r * 0.38, r * 0.9, C);
    if (def.id === 'ww_gunslinger') { // sheriff star and a holster
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const pt = mesh(cone(r * 0.06, r * 0.16, 4), gold(), r * 0.42 + Math.sin(a) * r * 0.08, hh * 0.5 + Math.cos(a) * r * 0.08, r * 1.0, C); pt.rotation.z = -a; }
      mesh(box(pel.r * 0.35, pel.r * 0.8, pel.r * 0.35), leather(), -pel.r * 1.05, -pel.r * 0.4, 0, P);
    } else { // chaps on the thighs
      for (const p of [PART.thighL, PART.thighR]) mesh(H.capsule(skel.parts[p].r * 1.22, skel.parts[p].hh * 1.6), mat('#8a6040', { spec: 0.15 }), 0, 0, 0, parts[p]);
    }
  }
  if (top === 'ww_poncho') { // striped poncho
    const pon = mesh(cone(r * 1.42, (hh + r) * 2.3, 16), mat('#c8a050'), 0, hh * 0.35, 0, C);
    pon.scale.set(1, 1, 0.85);
    for (const [y, m] of [[-0.55, tc], [-0.3, td], [-0.05, tc]]) { const b = mesh(H.cyl(r * (1.25 - y * 0.6), r * (1.32 - y * 0.6), r * 0.13, 16), m, 0, (hh + r) * y * 1.2, 0, C); b.scale.set(1, 1, 0.85); }
  }
  if (top === 'ww_cactus') { // green body ribs, spines, team pot
    const green = mat('#5aa04a', { spec: 0.15 }), dark = mat('#3e7a32');
    chestShell(H, ch, green, C);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const rib = mesh(H.capsule(r * 0.12, hh * 2), dark, Math.sin(a) * r * 1.02, 0, Math.cos(a) * r * 0.95, C); rib.scale.set(1, 1, 0.6); rib.rotation.y = a; }
    for (let i = 0; i < 18; i++) { const a = i * 2.4, y = ((i * 7) % 5 / 4 - 0.5) * hh * 2.4; const sp = mesh(cone(r * 0.035, r * 0.2, 4), mat('#f4ead0'), Math.sin(a) * r * 1.12, y, Math.cos(a) * r * 1.05, C); sp.rotation.set(Math.PI / 2, 0, 0); sp.rotation.y = 0; sp.lookAt(Math.sin(a) * 9, y, Math.cos(a) * 9); sp.rotateX(Math.PI / 2); }
    for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) for (let k = 0; k < 3; k++) { const a = k * 2.1; const sp = mesh(cone(skel.parts[p].r * 0.25, skel.parts[p].r * 1.4, 4), mat('#f4ead0'), Math.sin(a) * skel.parts[p].r, (k - 1) * skel.parts[p].hh * 0.6, Math.cos(a) * skel.parts[p].r, parts[p]); sp.lookAt(Math.sin(a) * 9, (k - 1) * 3, Math.cos(a) * 9); sp.rotateX(Math.PI / 2); }
    const pot = mesh(cyl(pel.r * 1.35, pel.r * 1.0, pel.r * 1.6, 14), mat('#c06a3a'), 0, -pel.r * 0.2, 0, P);
    pot.castShadow = true;
    mesh(cyl(pel.r * 1.45, pel.r * 1.45, pel.r * 0.3, 14), tc, 0, pel.r * 0.55, 0, P);
  }
}

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, sphere, mat, glow, octa } = H;
  if (type === 'bullet') {
    mesh(cyl(0.025, 0.025, 0.1, 6), mat('#d8b040', { spec: 1 }), 0, 0, 0, g).castShadow = false;
    const st = mesh(cyl(0.012, 0.03, 0.5, 5), mat('#fff6d0', { emit: 1, transparent: true, opacity: 0.5 }), 0, -0.3, 0, g);
    st.castShadow = false;
    return true;
  }
  if (type === 'lasso') {
    const rope = mat('#c8a46a');
    const t = mesh(torus(H, 0.32, 0.022, Math.PI * 2, 16), rope, 0, 0, 0, g); t.rotation.x = Math.PI / 2;
    mesh(cyl(0.02, 0.02, 0.5, 4), rope, 0.32, 0, 0.25, g).rotation.x = Math.PI / 2;
    return true;
  }
  if (type === 'dynamite') {
    const red = mat('#c8302a');
    for (const x of [-0.04, 0, 0.04]) mesh(cyl(0.035, 0.035, 0.28, 8), red, x, 0, 0, g);
    mesh(cyl(0.085, 0.085, 0.035, 10), mat('#2a2a2a'), 0, 0, 0, g).scale.set(1, 1, 0.55);
    mesh(cyl(0.008, 0.008, 0.1, 4), mat('#e8e0c0'), 0, 0.18, 0, g);
    mesh(octa(0.03), glow('#ffd040'), 0, 0.23, 0, g).castShadow = false;
    return true;
  }
  return false;
}

register({
  factions: [{ id: 'wildwest', name: 'Wild West', color: '#e8b84a' }],
  units,
  items: {
    ww_revolver: { len: 0.35, r: 0.05, grip: 90, metal: true },
    ww_blunderbuss: { len: 1.0, r: 0.06, grip: 90, back: 0.3 },
    ww_lasso_hand: { len: 0, r: 0, grip: 90 },
    ww_dynamite_hand: { len: 0, r: 0, grip: 90 },
  },
  kinds: { ww_cactus: cactus, ww_gun: gun },
  proj: { bullet, lasso, dynamite },
  buildItem, buildHat, decorate, buildProj,
});
