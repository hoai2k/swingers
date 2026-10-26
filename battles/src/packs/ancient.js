// Ancient: Hoplite (shield wall: tougher next to other hoplites), Sarissa (a very
// long pike), Snake Archer (poison arrows), Minotaur (charges and tosses units into
// the air), Zeus (calls lightning down from the sky), Gladiator (plays to the crowd:
// each kill heals him and makes him faster and harder hitting).
import { register } from '../ext.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, inFront, aimPoint,
  addStatus, arrowProj, arrowMesh, lightning, torus, tube, dome, headBand, lathe, tcol, tdark, chestShell,
} from './common.js';
import { mark } from './ges-core.js';

const _p = new THREE.Vector3();

// ------------------------------------------------------------------ kinds
const phalanx = {
  melee: true,
  think: meleeThink,
  // shield wall: every hoplite close by takes a share of blows from the front
  hit(u, amount, part, attacker) {
    if (!attacker || !inFront(u, attacker.pos.x, attacker.pos.z)) return amount;
    let n = 0;
    for (const o of u.battle.teams[u.team]) {
      if (o === u || !o.alive || o.def.weapon.kind !== 'an_phalanx') continue;
      if ((o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2 < 2.6 * 2.6) n++;
    }
    return amount * (1 - 0.15 * Math.min(n, 3));
  },
};

const charge = {
  melee: true,
  init(u) { u.chargeCD = rand(0.5, 1.2); u.tossed = new Set(); },
  think(u, dt, c) {
    u.chargeCD -= dt;
    const { t, gap, dirx, dirz, spd } = c;
    if (u.charging) {
      u.chargeT += dt;
      u.expr = EXPR.angry;
      const d = u.chargeDir;
      u.desired.set(d.x * spd * 2.3, 0, d.z * spd * 2.3);
      u.st.crouch = 0.25;
      const b = u.battle, p = u.chestPos;
      if ((u.dustT = (u.dustT || 0) - dt) <= 0) { u.dustT = 0.12; b.emit('dust', u.pos.x, b.terrain.height(u.pos.x, u.pos.z), u.pos.z, 1); }
      // anything in the way goes flying
      b.grid.query(p.x, p.z, 3 * u.s, (v) => {
        if (v.team === u.team || !v.alive || u.tossed.has(v)) return;
        const dx = v.pos.x - p.x, dz = v.pos.z - p.z, dd = Math.hypot(dx, dz);
        if (dd > u.skel.radius + v.skel.radius + 0.45 * u.s) return;
        if ((dx * d.x + dz * d.z) < -0.2) return;
        u.tossed.add(v);
        const w = u.def.weapon;
        const imp = Math.min(v.M * 11, u.M * 4.5);
        const sx = d.x + (dx / (dd || 1)) * 0.6, sz = d.z + (dz / (dd || 1)) * 0.6;
        v.hit(w.chargeDamage, PART.chest, 0, 0, 0, u, 'melee');
        v.rag.impulseAll(sx * imp * 0.7, imp * 0.9, sz * imp * 0.7);
        v.stun = Math.max(v.stun, 2 * (v.def.stagger ?? 1));
        const c2 = v.chestPos;
        b.emit(v.def.armor > 0.3 ? 'spark' : 'blood', c2.x, c2.y, c2.z, 10, d.x, d.z);
        b.sound('crunch', c2, 1.2, 0.8);
        b.sound('thump', c2, 0.8, 0.7);
      });
      if (u.chargeT > 1.6 || u.tossed.size >= 5 || u.stun > 0 || u.isDown()) {
        u.charging = false; u.st.crouch = 0; u.chargeCD = rand(5, 7);
        u.cooldown = Math.min(u.cooldown, 0.2);
      }
      return { pos: _p.set(u.pos.x + d.x * 5, 0, u.pos.z + d.z * 5) };
    }
    if (u.chargeCD <= 0 && gap > 3.5 && gap < 15 && !u.st.attack && u.stun <= 0 && !u.isDown()) {
      u.charging = true; u.chargeT = 0; u.tossed.clear();
      u.chargeDir = { x: dirx, z: dirz };
      u.battle.voice(u, 'cry', true);
      u.battle.sound('thump', u.pos, 0.8, 0.5);
      return t;
    }
    return meleeThink(u, dt, c);
  },
};

const zeus = {
  init(u) { u.attackDur = u.def.weapon.windup; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon;
    if (crossed(t0, t1, w.releaseAt)) {
      u.released = true;
      aimPoint(u, _p, 1, 0.45);
      const k = w.spread * Math.hypot(_p.x - u.pos.x, _p.z - u.pos.z);
      const b = u.battle, h = u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0, new THREE.Vector3());
      b.emit('spark', h.x, h.y, h.z, 5);
      const x = _p.x + rand(-k, k), z = _p.z + rand(-k, k);
      b.delayed.push([0.12, () => lightning(b, x, z, u, w.damage, w.blast, w.force)]);
    }
  },
};

// Gladiator: every kill wins glory (up to w.maxGlory): a quarter of his hp back,
// harder and faster blows, a quicker step, and the crowd roars. Each gladiator gets
// its own copy of the def so the stats can grow.
const glory = {
  melee: true,
  init(u) {
    u.def = { ...u.def, weapon: { ...u.def.weapon } };
    u.base = { damage: u.def.weapon.damage, cooldown: u.def.weapon.cooldown, speed: u.def.speed };
    u.glory = 0; u.kills0 = u.kills;
  },
  think: meleeThink,
  step(u) {
    if (u.kills <= u.kills0 || !u.alive) return;
    const n = u.kills - u.kills0, d = u.def, w = d.weapon, b = u.battle;
    u.kills0 = u.kills;
    u.glory = Math.min(w.maxGlory, u.glory + n);
    w.damage = u.base.damage * (1 + 0.15 * u.glory);
    w.cooldown = u.base.cooldown * (1 - 0.06 * u.glory);
    d.speed = u.base.speed * (1 + 0.05 * u.glory);
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * w.heal * n);
    const c = u.chestPos;
    b.emit('heal', c.x, c.y, c.z, 6);
    b.emit('spark', c.x, c.y + 0.6 * u.s, c.z, 3 + u.glory);
    b.sound('crowd', c, 0.35 + 0.1 * u.glory, 1);
    b.voice(u, 'cheer', true);
    if (!u.gloryMark) u.gloryMark = mark(b, u, 'an_glory', PART.head, 9999, new THREE.Vector3(0, u.skel.rHead * 0.95, 0));
  },
};

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'an_hoplite', name: 'Hoplite', faction: 'ancient', cost: 120, hp: 130, speed: 4.1,
    build: { scale: 1.0, girth: 1.05 },
    weapon: { line: 'Melee · shield wall: tougher beside other hoplites', kind: 'an_phalanx', style: 'shield', anim: 'stab', item: 'an_dory', shield: 'round', damage: 26, reach: 1.8, cooldown: 1.15, force: 220, blockMelee: 0.45 },
    look: { skin: '#e6b48c', hat: 'an_corinthian', top: 'an_cuirass', legs: '#e6b48c' },
    personality: { aggro: 0.8, bravery: 0.1, voice: 1.0, chatter: 0.5, cry: 'charge', idle: 'brace' },
    desc: 'Spear and shield. Stronger standing shoulder to shoulder.',
  },
  {
    id: 'an_sarissa', name: 'Sarissa', faction: 'ancient', cost: 100, hp: 95, speed: 4.0,
    build: { scale: 1.0, girth: 0.98 },
    weapon: { line: 'Melee · 4 m pike', kind: 'melee', style: 'spear', anim: 'stab', item: 'an_sarissa', damage: 34, reach: 3.4, cooldown: 1.35, force: 260 },
    look: { skin: '#e6b48c', hat: 'an_phrygian', top: 'an_linen', legs: '#e6b48c' },
    personality: { aggro: 0.75, bravery: 0.2, voice: 1.05, chatter: 0.4, cry: 'charge', idle: 'lean' },
    desc: 'A pike so long it pokes enemies before they get close.',
  },
  {
    id: 'an_snake_archer', name: 'Snake Archer', faction: 'ancient', cost: 130, hp: 80, speed: 4.4,
    build: { scale: 0.96, girth: 0.95 },
    weapon: { line: 'Ranged · poison arrows', kind: 'ranged', style: 'bow', anim: 'bow', item: 'bow', proj: 'venom_arrow', speed: 32, arc: 'low', range: 36, minRange: 8, cooldown: 2.7, damage: 22, force: 80, spread: 0.035, releaseAt: 0.78, windup: 1.0 },
    look: { skin: '#e6b48c', hat: 'an_snakehood', top: 'an_linen', legs: '#4c6a2e', quiver: true },
    personality: { aggro: 0.3, bravery: 0.3, voice: 1.2, chatter: 0.5, cry: 'cackle', idle: 'shift' },
    desc: 'Snake-venom arrows: the poison keeps hurting for a while.',
  },
  {
    id: 'an_minotaur', name: 'Minotaur', faction: 'ancient', cost: 650, hp: 880, speed: 4.2,
    build: { scale: 1.55, girth: 1.2, head: 1.1, arms: 1.1, armThick: 1.25, mass: 1.3 },
    weapon: { line: 'Melee · charge throws units into the air', kind: 'an_charge', style: 'fists', anim: 'slam', item: 'none', damage: 60, chargeDamage: 45, reach: 1.5, cooldown: 1.5, force: 800, sweep: true, fistHit: true },
    look: { skin: '#8a5a3a', hat: 'an_bull', top: 'loincloth', legs: '#5a3a24', bare: true },
    personality: { aggro: 1, bravery: 0, voice: 0.5, chatter: 0.6, cry: 'roar', idle: 'thump' },
    armor: 0.15, stagger: 0.3,
    desc: 'Lowers its horns and charges. Sends whole lines flying.',
  },
  {
    id: 'an_zeus', name: 'Zeus', faction: 'ancient', cost: 2450, hp: 1100, speed: 3.6,
    build: { scale: 1.4, girth: 1.12, head: 1.05, mass: 1.5 },
    weapon: { line: 'Magic · lightning bolts from the sky', kind: 'an_zeus', style: 'staff', anim: 'cast', item: 'an_bolt', damage: 150, range: 38, minRange: 6, cooldown: 2.1, force: 700, blast: 3.6, spread: 0.04, releaseAt: 0.62, windup: 1.1 },
    look: { skin: '#f0c8a8', hat: 'an_laurel', top: 'an_toga', legs: '#f0c8a8', beard: '#f4f4f4' },
    personality: { aggro: 0.35, bravery: 0, voice: 0.6, chatter: 0.7, cry: 'royal', idle: 'regal' },
    armor: 0.15, stagger: 0.3,
    desc: 'Calls lightning down on the enemy. Mind your own side.',
  },
  {
    id: 'an_gladiator', name: 'Gladiator', faction: 'ancient', cost: 200, hp: 165, speed: 4.6,
    build: { scale: 1.03, girth: 1.08 },
    weapon: { line: 'Melee · each kill heals him and makes him stronger', kind: 'an_glory', style: 'shield', anim: 'overhead', item: 'an_gladius', shield: 'round', damage: 28, reach: 1.2, cooldown: 0.85, force: 220, blockMelee: 0.3, maxGlory: 5, heal: 0.25 },
    look: { skin: '#d9a173', hat: 'an_galea', top: 'an_glad', legs: '#d9a173', bare: true },
    personality: { aggro: 1, bravery: 0, voice: 0.85, chatter: 0.9, cry: 'royal', idle: 'regal' },
    desc: 'Are you not entertained? He gets better with every kill.',
  },
];

// ------------------------------------------------------------------ visuals
const BRONZE = '#c9923a';
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, wood, darkWood, leather, glow } = H;
  const bronze = mat(BRONZE, { spec: 0.9 });
  if (name === 'an_dory' || name === 'an_sarissa') {
    const L = (name === 'an_dory' ? 2.2 : 4.0) * s, back = (name === 'an_dory' ? 0.45 : 0.35) * L;
    const c = -back;
    mesh(cyl(0.024 * s, 0.026 * s, L, 7), wood(), 0, c + L / 2, 0, g);
    const tip = mesh(cone(0.055 * s, 0.3 * s, 4), name === 'an_dory' ? bronze : metal(), 0, c + L + 0.1 * s, 0, g);
    tip.scale.set(1, 1, 0.35);
    mesh(cyl(0.032 * s, 0.032 * s, 0.1 * s, 7), bronze, 0, c + L - 0.05 * s, 0, g);
    mesh(cone(0.03 * s, 0.12 * s, 6), bronze, 0, c - 0.04 * s, 0, g).rotation.x = Math.PI; // butt spike
    if (name === 'an_sarissa') mesh(cyl(0.036 * s, 0.036 * s, 0.05 * s, 7), tcol(H, team), 0, c + L * 0.5, 0, g);
    return true;
  }
  if (name === 'an_gladius') { // a short broad blade with a round pommel
    const L = 0.85 * s;
    mesh(box(0.025 * s, L * 0.7, 0.1 * s), metal(), 0, L * 0.55, 0, g);
    mesh(cone(0.072 * s, 0.14 * s, 4), metal(), 0, L * 0.97, 0, g).scale.set(0.35, 1, 1);
    mesh(box(0.05 * s, 0.04 * s, 0.17 * s), bronze, 0, L * 0.19, 0, g);
    mesh(cyl(0.03 * s, 0.033 * s, L * 0.16, 8), mat('#e8dcc0'), 0, L * 0.09, 0, g);
    mesh(sphere(0.05 * s, 10, 8), bronze, 0, 0, 0, g);
    return true;
  }
  if (name === 'an_bolt') { // a zig-zag thunderbolt held like a sceptre
    const gl = glow('#fff6a0');
    const pts = [[0, -0.2], [0.07, 0.1], [-0.05, 0.25], [0.08, 0.5], [-0.04, 0.68], [0.05, 0.9]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = new THREE.Vector3(0, pts[i][1] * s, pts[i][0] * s), b = new THREE.Vector3(0, pts[i + 1][1] * s, pts[i + 1][0] * s);
      const o = mesh(cyl(0.035 * s, 0.035 * s, a.distanceTo(b), 5), gl, 0, (a.y + b.y) / 2, (a.z + b.z) / 2, g);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      o.castShadow = false;
    }
    mesh(cone(0.06 * s, 0.18 * s, 5), gl, 0, 0.98 * s, 0.05 * s, g).castShadow = false;
    mesh(cyl(0.04 * s, 0.04 * s, 0.12 * s, 8), H.gold(), 0, 0, 0, g);
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const bronze = mat(BRONZE, { spec: 0.9 });
  switch (kind) {
    case 'an_corinthian': { // bronze helmet with cheek guards and a tall team crest
      mesh(dome(H, r * 1.1, 0.58), bronze, 0, r * 0.25, -r * 0.02, g).scale.set(1, 1.05, 1.05);
      for (const sd of [-1, 1]) { const ch = mesh(box(r * 0.12, r * 0.85, r * 0.6), bronze, sd * r * 0.88, -r * 0.08, r * 0.35, g); ch.rotation.y = sd * 0.5; }
      mesh(box(r * 1.6, r * 0.1, r * 0.2), bronze, 0, r * 0.6, r * 0.92, g);
      mesh(box(r * 0.2, r * 0.25, r * 0.4), bronze, 0, r * 1.22, 0, g);
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * Math.PI;
        const p = mesh(sphere(r * 0.22, 8, 6), i % 2 ? td : tc, 0, r * 1.25 + Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.95, g);
        p.scale.set(0.45, 1, 1);
      }
      return true;
    }
    case 'an_phrygian': { // a soft cap folded forward, with a bronze band
      const cap = mat('#b8433a');
      mesh(dome(H, r * 1.06, 0.55), tc, 0, r * 0.35, -r * 0.03, g);
      mesh(tube(H, 'phry' + r.toFixed(3), [[0, 0.9, -0.2], [0, 1.4, 0.0], [0, 1.45, 0.45], [0, 1.15, 0.7]].map((p) => p.map((q) => q * r)), r * 0.55, r * 0.15), tc, 0, 0, 0, g);
      headBand(H, r, 0.5, 0.16, bronze, g, 0.08);
      void cap;
      return true;
    }
    case 'an_snakehood': { // a green hood with a snake coiled around it
      const hood = mat('#3f6a2a'), snake = mat('#7ab83a', { spec: 0.5 });
      mesh(dome(H, r * 1.13, 0.62), hood, 0, r * 0.18, -r * 0.08, g).scale.set(1, 1.05, 1.05);
      mesh(cyl(r * 1.0, r * 1.15, r * 0.55, 14), hood, 0, -r * 0.6, -r * 0.25, g);
      headBand(H, r, 0.62, 0.14, tc, g, 0.15);
      const pts = [];
      for (let i = 0; i <= 10; i++) { const a = i * 0.62 - 0.5; pts.push([Math.sin(a) * 1.15, 0.75 + i * 0.06, Math.cos(a) * 1.15 - 0.1]); }
      pts.push([0, 1.45, 0.75]);
      mesh(tube(H, 'snk' + r.toFixed(3), pts.map((p) => p.map((q) => q * r)), r * 0.13, r * 0.1, 18), snake, 0, 0, 0, g);
      const head = mesh(sphere(r * 0.2, 10, 8), snake, 0, r * 1.5, r * 0.85, g); head.scale.set(1, 0.7, 1.4);
      for (const sd of [-1, 1]) mesh(sphere(r * 0.05, 6, 5), glow('#ffe14a'), sd * r * 0.1, r * 1.57, r * 1.0, g);
      mesh(box(r * 0.02, r * 0.02, r * 0.2), mat('#e33a3a'), 0, r * 1.47, r * 1.18, g);
      return true;
    }
    case 'an_bull': { // the bull's head: snout, horns, ears, nose ring
      const hide = mat('#6e4428', { spec: 0.1 }), dark = mat('#3a2414');
      mesh(sphere(r * 1.08, 16, 12), hide, 0, r * 0.05, -r * 0.02, g);
      const sn = mesh(sphere(r * 0.62, 14, 10), mat('#c89a7a'), 0, -r * 0.3, r * 0.8, g); sn.scale.set(1.15, 0.8, 0.85);
      for (const sd of [-1, 1]) {
        mesh(sphere(r * 0.1, 6, 5), dark, sd * r * 0.25, -r * 0.28, r * 1.42, g);
        const ear = mesh(sphere(r * 0.25, 8, 6), hide, sd * r * 1.08, r * 0.3, -r * 0.1, g); ear.scale.set(1.4, 0.5, 0.8); ear.rotation.z = sd * -0.3;
        mesh(tube(H, 'bull' + sd + r.toFixed(3), [[sd * 0.8, 0.6, 0.1], [sd * 1.4, 0.75, 0.2], [sd * 1.75, 1.2, 0.45], [sd * 1.6, 1.6, 0.75]].map((p) => p.map((q) => q * r)), r * 0.26, r * 0.04), mat('#f2e6c8', { spec: 0.3 }), 0, 0, 0, g);
        // fierce eyes and brows
        mesh(sphere(r * 0.16, 8, 6), mat('#fbfbf7'), sd * r * 0.42, r * 0.28, r * 0.88, g).scale.set(1, 0.8, 0.5);
        mesh(sphere(r * 0.08, 6, 5), mat('#1e1512'), sd * r * 0.4, r * 0.27, r * 0.96, g);
        const br = mesh(box(r * 0.4, r * 0.1, r * 0.1), dark, sd * r * 0.42, r * 0.48, r * 0.88, g); br.rotation.z = sd * -0.4;
      }
      const ring = mesh(torus(H, r * 0.2, r * 0.04, Math.PI * 2, 12), H.gold(), 0, -r * 0.62, r * 1.36, g);
      ring.rotation.x = 0.3;
      mesh(sphere(r * 0.35, 10, 8), dark, 0, r * 0.95, r * 0.1, g).scale.set(1.2, 0.5, 1.2); // tuft
      g.userData.hidesFace = true;
      return true;
    }
    case 'an_galea': { // a broad-brimmed gladiator's helmet with a grille visor and a tall crest
      mesh(dome(H, r * 1.12, 0.55), bronze, 0, r * 0.22, 0, g).scale.set(1, 1.05, 1.05);
      const br = mesh(cyl(r * 1.55, r * 1.6, r * 0.05, 20), bronze, 0, r * 0.12, -r * 0.05, g); br.rotation.x = -0.12;
      mesh(sphere(r * 1.05, 14, 10), mat('#7a5a2a', { spec: 0.6 }), 0, -r * 0.05, r * 0.08, g).scale.set(0.95, 0.95, 0.95);
      for (let i = -2; i <= 2; i++) mesh(box(r * 0.04, r * 0.85, r * 0.05), bronze, i * r * 0.18, -r * 0.1, r * 1.0 - Math.abs(i) * r * 0.06, g);
      for (let k = 0; k < 3; k++) mesh(box(r * 0.85, r * 0.04, r * 0.05), bronze, 0, -r * 0.4 + k * r * 0.3, r * 0.99, g);
      mesh(box(r * 0.22, r * 0.55, r * 1.7), bronze, 0, r * 1.25, -r * 0.05, g);
      for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI; const p = mesh(sphere(r * 0.2, 8, 6), i % 2 ? td : tc, 0, r * 1.4 + Math.sin(a) * r * 0.4, Math.cos(a) * r * 0.9, g); p.scale.set(0.45, 1, 1); }
      g.userData.hidesFace = true;
      return true;
    }
    case 'an_laurel': { // white curls and a golden laurel wreath
      const hair = mat('#f4f4f4', { spec: 0.05 });
      mesh(sphere(r * 1.02, 14, 10), hair, 0, r * 0.32, -r * 0.18, g).scale.set(1.05, 0.85, 1);
      for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8 - 0.5) * 3.2; mesh(sphere(r * 0.28, 8, 6), hair, Math.sin(a) * r * 0.9, r * 0.1 + (i % 2) * r * 0.1, Math.cos(a) * r * 0.85, g); }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        if (Math.abs(Math.cos(a) - 1) < 0.08) continue;
        const l = mesh(sphere(r * 0.14, 6, 5), gold(), Math.sin(a) * r * 0.98, r * 0.62, Math.cos(a) * r * 0.98, g);
        l.scale.set(0.5, 0.35, 1.2); l.rotation.y = a + 0.6;
      }
      mesh(octa(r * 0.12), glow('#fff6a0'), 0, r * 0.7, r * 0.98, g);
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'ancient') return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, leather } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  const pel = skel.parts[PART.pelvis];
  const top = def.look.top;
  const C = parts[PART.chest], P = parts[PART.pelvis];
  if (top === 'an_cuirass') { // bronze muscle cuirass over a team tunic, leather strip skirt
    const bronze = mat(BRONZE, { spec: 0.9 });
    chestShell(H, ch, bronze, C);
    for (const sd of [-1, 1]) mesh(sphere(r * 0.32, 8, 6), bronze, sd * r * 0.38, hh * 0.45, r * 0.78, C).scale.set(1, 0.7, 0.4);
    mesh(cyl(r * 1.12, r * 1.15, r * 0.14, 16), leather(), 0, -hh - r * 0.38, 0, C);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const s = mesh(box(pel.r * 0.42, pel.r * 1.0, pel.r * 0.08), k % 2 ? tc : td, Math.sin(a) * pel.r * 1.1, -pel.r * 0.35, Math.cos(a) * pel.r * 1.1, P);
      s.rotation.y = a; s.rotation.x = 0.15;
    }
    for (const p of [PART.shinL, PART.shinR]) mesh(cyl(skel.parts[p].r * 1.3, skel.parts[p].r * 1.2, skel.parts[p].hh * 1.3, 10), bronze, 0, 0, 0, parts[p]); // greaves
  }
  if (top === 'an_linen') { // linen tunic: team colour with a pale yoke and kilt
    const linen = mat('#efe6cf');
    const y = mesh(sphere(r * 1.06, 14, 10), linen, 0, hh + r * 0.15, 0, C); y.scale.set(1.0, 0.45, 0.92);
    mesh(cyl(r * 1.12, r * 1.15, r * 0.12, 16), leather(), 0, -hh - r * 0.38, 0, C);
    const k = mesh(cyl(pel.r * 1.08, pel.r * 1.3, pel.r * 1.1, 14), linen, 0, -pel.r * 0.35, 0, P);
    k.scale.set(1, 1, 0.95);
  }
  if (top === 'an_toga') { // a white toga over one shoulder with a gold clasp
    const wh = mat('#f6f3ea');
    chestShell(H, ch, wh, C);
    const sash = mesh(torus(H, (hh + r) * 0.95, r * 0.17, Math.PI * 2, 20), tc, 0, 0, 0, C); sash.rotation.order = 'ZYX'; sash.rotation.set(0, Math.PI / 2, 0.55); sash.scale.set(0.86, 1, 1);
    mesh(sphere(r * 0.16, 8, 6), gold(), r * 0.5, hh + r * 0.35, r * 0.6, C);
    const skirt = mesh(cyl(pel.r * 1.15, pel.r * 1.55, pel.r * 2.2, 16), wh, 0, -pel.r * 0.9, 0, P);
    skirt.scale.set(1, 1, 0.95);
    for (const p of [PART.uarmL]) mesh(cyl(skel.parts[p].r * 1.3, skel.parts[p].r * 1.4, skel.parts[p].hh * 1.6, 10), wh, 0, 0, 0, parts[p]);
  }
  if (top === 'an_glad') { // bare chest, a leather belt and kilt, an armoured sword arm and a greave
    const bronze = mat(BRONZE, { spec: 0.9 });
    mesh(cyl(r * 1.14, r * 1.16, r * 0.4, 16), leather(), 0, -hh - r * 0.3, 0, C);
    mesh(cyl(r * 0.3, r * 0.3, r * 0.1, 12), bronze, 0, -hh - r * 0.3, r * 1.12, C).rotation.x = Math.PI / 2;
    const k = mesh(cyl(pel.r * 1.1, pel.r * 1.3, pel.r * 1.0, 14), mat('#efe6cf'), 0, -pel.r * 0.35, 0, P); k.scale.set(1, 1, 0.95);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const s2 = mesh(box(pel.r * 0.4, pel.r * 0.9, pel.r * 0.06), tc, Math.sin(a) * pel.r * 1.2, -pel.r * 0.4, Math.cos(a) * pel.r * 1.2, P); s2.rotation.y = a; }
    for (const p of [PART.uarmR, PART.farmR]) for (let j = 0; j < 4; j++) mesh(cyl(skel.parts[p].r * 1.25, skel.parts[p].r * 1.3, skel.parts[p].hh * 0.45, 10), j % 2 ? mat('#a8a08a', { spec: 0.7 }) : bronze, 0, skel.parts[p].hh * (0.7 - j * 0.45), 0, parts[p]);
    mesh(cyl(skel.parts[PART.shinL].r * 1.3, skel.parts[PART.shinL].r * 1.2, skel.parts[PART.shinL].hh * 1.4, 10), bronze, 0, 0, 0, parts[PART.shinL]);
  }
  if (def.id === 'an_minotaur') { // a tail and hooves
    mesh(H.geo('mintail' + pel.r.toFixed(3), () => new THREE.CylinderGeometry(pel.r * 0.08, pel.r * 0.06, pel.r * 2.2, 5)), mat('#6e4428'), 0, -pel.r * 0.8, -pel.r * 1.15, P).rotation.x = -0.4;
    mesh(sphere(pel.r * 0.22, 8, 6), mat('#3a2414'), 0, -pel.r * 1.8, -pel.r * 1.55, P);
    for (const p of [PART.uarmL, PART.uarmR]) mesh(cyl(skel.parts[p].r * 1.15, skel.parts[p].r * 1.15, skel.parts[p].r * 0.6, 10), H.gold(), 0, skel.parts[p].hh * 0.3, 0, parts[p]);
  }
}

register({
  factions: [{ id: 'ancient', name: 'Ancient', color: '#f2e4b8' }],
  units,
  items: {
    an_dory: { len: 2.2, r: 0.07, grip: 95, back: 0.45, metal: true },
    an_sarissa: { len: 4.0, r: 0.07, grip: 95, back: 0.35, metal: true },
    an_bolt: { len: 1.0, r: 0.06, grip: 60 },
    an_gladius: { len: 0.85, r: 0.08, grip: 30, metal: true, mass: 1.2 },
  },
  kinds: { an_phalanx: phalanx, an_charge: charge, an_zeus: zeus, an_glory: glory },
  proj: {
    venom_arrow: arrowProj({ onHit(b, v, pr) { addStatus(b, v, 'poison', 5, 9, pr.owner); } }),
    an_glory: { g: 0, len: 0, r: 0, life: 1 }, // marker: a gold laurel won in the arena
  },
  buildProj(type, g, H) {
    if (type === 'venom_arrow') { arrowMesh(H, g, '#8cff5a', '#4f8a2e', true); return true; }
    if (type === 'an_glory') {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        if (Math.abs(Math.cos(a) - 1) < 0.1) continue;
        const l = H.mesh(H.sphere(0.05, 6, 5), H.mat('#f0c03c', { spec: 1, emit: 0.3 }), Math.sin(a) * 0.27, 0, Math.cos(a) * 0.27, g);
        l.scale.set(0.5, 0.35, 1.2); l.rotation.y = a + 0.6; l.castShadow = false;
      }
      return true;
    }
    return false;
  },
  buildItem, buildHat, decorate,
});
