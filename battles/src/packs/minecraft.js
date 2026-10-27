// Minecraft: Villager (cheap, panics), Zombie (shambles in with its arms out), Skeleton
// (archer that falls to bits), Creeper (walks up, hisses, blows up), Witch (splash
// potions: harming, poison, slowness), Steve (diamond sword), Enderman (teleports up to
// its target and away from arrows) and Iron Golem (punches enemies into the sky).
// Everyone is drawn out of boxes, with pixel faces made of little blocks (always pixel
// eyes: the Googly eyes option leaves this faction alone).
import { register } from '../ext.js';
import { THREE, rand, clamp, PART, EXPR, meleeThink, blast, addStatus, tcol, tdark } from './common.js';
import { STANCE, setArmKey } from './ges-core.js';
import { moveRag } from './sm-core.js';
import { trackFall } from './bc-core.js';
import { FIELD } from '../world.js';

const FAC = 'minecraft';
const _p = new THREE.Vector3();

// ------------------------------------------------------------------ stances
// zombies walk with both arms held straight out in front
STANCE.mc_zombie = (st, pose) => { setArmKey(pose, 1, [0.08, 0.05, -1.5, -1.5]); setArmKey(pose, -1, [0.08, 0.05, -1.45, -1.45]); };

// ------------------------------------------------------------------ kinds
// Creeper: walks up to the nearest enemy, stops and hisses, then explodes and is gone.
// Backing off far enough before the fuse runs out makes it calm down again.
const creeper = {
  init(u) { u.mcFuse = -1; u.mcHiss = 0; },
  think(u, dt, c) {
    const w = u.def.weapon, b = u.battle;
    if (u.mcFuse >= 0) {
      u.expr = EXPR.angry;
      if (c.gap > w.cancel) { u.mcFuse = -1; return c.t; } // got away
      u.desired.set(c.dirx * c.spd * 0.25, 0, c.dirz * c.spd * 0.25);
      return c.t;
    }
    u.expr = EXPR.normal;
    u.desired.set(c.dirx * c.spd, 0, c.dirz * c.spd);
    if (c.gap < w.reach && !u.isDown() && u.stun <= 0) {
      u.mcFuse = w.fuse;
      b.sound('fire', u.chestPos, 0.9, 1.7); // the hiss
    }
    return c.t;
  },
  step(u, dt) {
    if (u.mcFuse < 0 || u.boomed || !u.alive) return;
    const b = u.battle, h = u.headPos;
    u.mcFuse -= dt;
    u.mcHiss -= dt;
    if (u.mcHiss <= 0) { u.mcHiss = 0.12; b.emit('fuse', h.x, h.y + u.skel.rHead, h.z); }
    if (u.mcFuse > 0) return;
    boom(u);
    u.hp = 0;
    u.die(null);
    // nothing is left of a creeper: its body goes away under the field
    moveRag(u, 0, -60 - u.pos.y, 0);
    for (const bd of u.rag.bodies) { bd.setLinvel({ x: 0, y: 0, z: 0 }, false); bd.sleep(); }
  },
  // killed while hissing: it still goes off
  die(u) { if (u.mcFuse >= 0 && !u.boomed) boom(u); },
};
function boom(u) {
  const b = u.battle, w = u.def.weapon;
  u.boomed = true;
  blast(b, _p.copy(u.chestPos), w.blast, w.damage, w.force, u, { fx: 0, friendly: 0.6, vol: 1.3 });
  b.sound('debris', u.chestPos, 0.7, 1.0);
}

// teleport u to (x, z), with a puff of purple at both ends
function warp(u, x, z) {
  const b = u.battle, p = u.pos;
  x = clamp(x, -FIELD.x + 1, FIELD.x - 1); z = clamp(z, -FIELD.z + 1, FIELD.z - 1);
  for (let i = 0; i < 6; i++) b.emit('ptrail', p.x + rand(-0.3, 0.3), p.y + rand(-0.6, 0.9), p.z + rand(-0.3, 0.3));
  b.sound('whoosh', p, 0.8, 0.5);
  const y0 = b.terrain.height(p.x, p.z), y1 = b.terrain.height(x, z);
  moveRag(u, x - p.x, y1 - y0 + 0.05, z - p.z);
  const v = u.rag.vel[PART.pelvis];
  u.rag.impulseAll(-v.x * u.M, -Math.min(0, v.y) * u.M, -v.z * u.M);
  for (let i = 0; i < 6; i++) b.emit('ptrail', x + rand(-0.3, 0.3), y1 + rand(0.2, 2.2), z + rand(-0.3, 0.3));
  b.sound('whoosh', u.pos, 0.7, 0.7);
}
// next to v, on the side facing u, ready to hit
function warpTo(u, v, d) {
  const dx = u.pos.x - v.pos.x, dz = u.pos.z - v.pos.z, L = Math.hypot(dx, dz) || 1;
  const a = rand(-0.7, 0.7), c = Math.cos(a), s = Math.sin(a);
  const r = d + v.skel.radius + u.skel.radius;
  warp(u, v.pos.x + ((dx * c - dz * s) / L) * r, v.pos.z + ((dx * s + dz * c) / L) * r);
  u.heading = u.faceYaw = Math.atan2(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
  u.target = v; u.retarget = 3;
}

// Enderman: tall and strong. Far from its target it teleports right up to it; a shot
// from afar it dodges by teleporting next to the shooter (with a cooldown).
const NOT_SHOTS = new Set(['melee', 'blast', 'stomp', 'poison', 'burn', 'slow', 'backstab', 'void', 'fall']);
const enderman = {
  melee: true,
  init(u) { u.mcTp = rand(0.5, 2); u.mcDodgeCd = 0; u.mcDodge = null; },
  think(u, dt, c) {
    const w = u.def.weapon;
    u.mcTp -= dt;
    if (u.mcTp <= 0 && c.gap > w.tpMin && !u.st.attack && !u.isDown() && u.stun <= 0) {
      u.mcTp = w.tpCd * rand(0.85, 1.15);
      warpTo(u, c.t, 0.5);
      return c.t;
    }
    return meleeThink(u, dt, c);
  },
  step(u, dt) {
    u.mcDodgeCd -= dt;
    const v = u.mcDodge;
    if (!v) return;
    u.mcDodge = null;
    if (v.alive && u.alive && !u.isDown()) warpTo(u, v, 0.5);
  },
  hit(u, amount, part, att, kind) {
    if (!att?.pos || NOT_SHOTS.has(kind) || u.mcDodgeCd > 0 || u.isDown()) return amount;
    if (Math.hypot(att.pos.x - u.pos.x, att.pos.z - u.pos.z) < 5) return amount;
    u.mcDodgeCd = u.def.weapon.dodgeCd;
    u.mcDodge = att;
    return 0;
  },
};

// Iron Golem: its punches throw the enemy up into the air (less for heavy ones).
const golem = {
  melee: true,
  init(u) { u.mcFlung = new Set(); },
  think: meleeThink,
  step(u) {
    if (!u.st.attack) { if (u.mcFlung.size) u.mcFlung.clear(); return; }
    const w = u.def.weapon;
    for (const v of u.hitSet) {
      if (u.mcFlung.has(v) || !v.rag || !v.def) continue;
      u.mcFlung.add(v);
      const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, L = Math.hypot(dx, dz) || 1;
      const k = clamp(160 / v.M, 0.15, 1);
      v.rag.impulseAll((dx / L) * v.M * w.toss * k, v.M * w.launch * k, (dz / L) * v.M * w.toss * k);
      v.stun = Math.max(v.stun, 1.0);
      trackFall(u.battle, v, u); // and the landing hurts
    }
  },
};

// ------------------------------------------------------------------ witch potions
const EFFECTS = ['harming', 'harming', 'poison', 'poison', 'slowness'];
function splash(b, pr) {
  const fx = EFFECTS[Math.floor(Math.random() * EFFECTS.length)], o = pr.owner;
  const dmg = fx === 'harming' ? pr.damage : pr.damage * 0.25;
  blast(b, pr.pos, 3.3, dmg, pr.force, o, {
    fx: 1, sound: 'pop', friendly: 0,
    onUnit(v, f) {
      if (fx === 'poison') addStatus(b, v, 'poison', 5, 18 * f, o);
      if (fx === 'slowness') addStatus(b, v, 'slow', 5, 0, o);
    },
  });
}

// ------------------------------------------------------------------ units
const P = (aggro, bravery, voice, cry, idle, chatter = 0.4) => ({ aggro, bravery, voice, chatter, cry, idle });
const units = [
  {
    id: 'mc_villager', name: 'Villager', faction: FAC, cost: 15, hp: 60, speed: 4.3,
    build: { scale: 0.98 },
    weapon: { line: 'Weak fists · panics and runs when hurt', kind: 'melee', style: 'dual', anim: 'dual', item: 'mc_fist', item2: 'mc_fist', damage: 12, reach: 1.0, cooldown: 1.0, force: 160 },
    look: { top: 'mc_villager', skin: '#bd8b72' },
    personality: P(0.7, 0.6, 1.1, 'hey', 'shift', 0.8),
    desc: 'Hrmm. Hmm! Cheap, and not much of a fighter.',
  },
  {
    id: 'mc_zombie', name: 'Zombie', faction: FAC, cost: 42, hp: 180, speed: 3.4,
    build: { scale: 1 },
    weapon: { line: 'Melee · shambles in with its arms out', kind: 'melee', style: 'mc_zombie', anim: 'dual', item: 'mc_fist', item2: 'mc_fist', damage: 26, reach: 1.05, cooldown: 0.95, force: 280 },
    look: { top: 'mc_zombie', skin: '#5f8f4a' },
    personality: P(1, 0, 0.65, 'roar', 'shift', 0.7),
    stagger: 0.45,
    desc: 'Slow, tough and always hungry.',
  },
  {
    id: 'mc_skeleton', name: 'Skeleton', faction: FAC, cost: 125, hp: 70, speed: 4.6, fallApart: true,
    build: { scale: 1, girth: 0.8, armThick: 0.7, mass: 0.8 },
    weapon: { line: 'Archer · falls to bits when it dies', kind: 'ranged', style: 'bow', anim: 'bow', item: 'bow', proj: 'arrow', speed: 34, arc: 'low', range: 36, minRange: 8, cooldown: 2.6, damage: 32, force: 90, spread: 0.045, releaseAt: 0.78, windup: 0.9 },
    look: { top: 'mc_skeleton', skin: '#c8c8c8' },
    personality: P(0.35, 0.2, 1.3, 'cackle', 'shift', 0.3),
    desc: 'Rattles about and plinks arrows at you.',
  },
  {
    id: 'mc_creeper', name: 'Creeper', faction: FAC, cost: 65, hp: 60, speed: 4.9,
    build: { scale: 1, girth: 0.95, legs: 0.6, mass: 0.9 },
    weapon: { line: 'Walks up, hisses and explodes', kind: 'mc_creeper', style: 'fists', anim: 'punch', item: 'none', damage: 120, reach: 1.7, fuse: 0.7, cancel: 3.6, blast: 3.4, force: 760, cooldown: 99 },
    look: { top: 'mc_creeper', skin: '#4caf3c' },
    personality: P(1, 0, 0.5, 'hey', 'shift', 0),
    desc: 'Tsssss...',
  },
  {
    id: 'mc_witch', name: 'Witch', faction: FAC, cost: 125, hp: 110, speed: 4.0,
    build: { scale: 1 },
    weapon: { line: 'Splash potions: harming, poison or slowness', kind: 'ranged', style: 'throw', anim: 'throw', item: 'potion_hand', proj: 'mc_potion', speed: 14, arc: 'high', range: 22, minRange: 6, cooldown: 3.0, damage: 80, force: 300, spread: 0.07, releaseAt: 0.7, windup: 0.9 },
    look: { top: 'mc_witch', skin: '#bd8b72' },
    personality: P(0.35, 0.3, 1.25, 'cackle', 'shake', 0.8),
    desc: 'Cackles and lobs splash potions.',
  },
  {
    id: 'mc_steve', name: 'Steve', faction: FAC, cost: 200, hp: 300, speed: 4.8,
    build: { scale: 1 },
    weapon: { line: 'Melee · a diamond sword', kind: 'melee', style: 'sword', anim: 'overhead', item: 'mc_sword', damage: 46, reach: 1.5, cooldown: 0.9, force: 300 },
    look: { top: 'mc_steve', skin: '#c69c7c' },
    personality: P(0.9, 0, 1.0, 'charge', 'shift', 0.3),
    desc: 'Punched a tree, made a diamond sword.',
  },
  {
    id: 'mc_enderman', name: 'Enderman', faction: FAC, cost: 320, hp: 450, speed: 5.4,
    build: { scale: 1.15, girth: 0.72, legs: 1.35, arms: 1.4, armThick: 0.7 },
    weapon: { line: 'Melee · teleports up to its target and away from shots', kind: 'mc_enderman', style: 'dual', anim: 'dual', item: 'mc_fist', item2: 'mc_fist', damage: 55, reach: 1.3, cooldown: 0.95, force: 420, tpMin: 7, tpCd: 4.5, dodgeCd: 3.5 },
    look: { top: 'mc_enderman', skin: '#161616' },
    personality: P(0.9, 0, 0.45, 'roar', 'shift', 0.2),
    stagger: 0.5,
    desc: 'Don\'t look it in the eye.',
  },
  {
    id: 'mc_golem', name: 'Iron Golem', faction: FAC, cost: 1100, hp: 1400, speed: 3.6,
    build: { scale: 1.6, girth: 1.35, head: 0.75, arms: 1.45, armThick: 1.5, mass: 2.2 },
    weapon: { line: 'Melee · punches enemies up into the sky', kind: 'mc_golem', style: 'dual', anim: 'dual', item: 'mc_fist', item2: 'mc_fist', damage: 70, reach: 1.7, cooldown: 1.5, force: 600, launch: 9, toss: 2.5, sweep: true },
    look: { top: 'mc_golem', skin: '#d8d4cc' },
    personality: P(0.8, 0, 0.4, 'roar', 'thump', 0.1),
    stagger: 0.4,
    desc: 'Protects villagers. Throws everyone else.',
  },
];

// ------------------------------------------------------------------ visuals
// Faces: 8×8 pixel grids, top row first. '.' is the head's own colour; letters look up
// a colour.
const FACES = {
  mc_villager: { rows: ['........', '........', '.bbbbbb.', '.WG..GW.', '........', '........', '........', '........'], pal: { b: '#4a3020', W: '#f2f2f2', G: '#3c8a3c' } },
  mc_zombie: { rows: ['........', '........', '........', '.EE..EE.', '........', '...dd...', '..dddd..', '........'], pal: { E: '#1e2a1a', d: '#3e6a30' } },
  mc_skeleton: { rows: ['........', '........', '.EE..EE.', '.EE..EE.', '...dd...', '........', '.d.dd.d.', '.dddddd.'], pal: { E: '#3a3a3a', d: '#5a5a5a' } },
  mc_creeper: { rows: ['........', '........', '.EE..EE.', '.EE..EE.', '...EE...', '..EEEE..', '..EEEE..', '..E..E..'], pal: { E: '#121212' } },
  mc_witch: { rows: ['........', '........', '.bbbbbb.', '.WP..PW.', '........', '........', '..mmmm..', '........'], pal: { b: '#2a1a10', W: '#f2f2f2', P: '#7a3aa0', m: '#6a3a2a' } },
  mc_steve: { rows: ['hhhhhhhh', 'hhhhhhhh', 'h......h', '........', '.WB..BW.', '...nn...', '..mmmm..', '........'], pal: { h: '#3b2a1a', W: '#f2f2f2', B: '#4a4ab8', n: '#9a6a50', m: '#6a3a2a' } },
  mc_enderman: { rows: ['........', '........', '........', '........', 'pPp..pPp', '........', '........', '........'], pal: { p: '#cc44ff', P: '#f0b0ff' }, glow: true },
  mc_golem: { rows: ['........', '........', '.gggggg.', '..R..R..', '........', '........', '........', '........'], pal: { g: '#9a968e', R: '#8a2a20' } },
};

// team colour bits: a belt, and bands round the upper arms
function teamBits(H, vis, team, W, D, armK) {
  const { parts, skel } = vis, pel = skel.parts[PART.pelvis];
  H.mesh(H.box(W * 1.04, pel.r * 0.35, D * 1.08), tcol(H, team), 0, pel.r * 0.62, 0, parts[PART.pelvis]);
  if (armK) for (const p of [PART.uarmL, PART.uarmR]) { const sp = skel.parts[p], A = sp.r * armK * 1.04; H.mesh(H.box(A * 1.08, sp.r * 1.1, A * 1.08), tdark(H, team), 0, sp.hh * 0.5, 0, parts[p]); }
}

// pixel blocks over the front of a cube head of side S
function pixels(H, g, S, f) {
  const px = S / 8, z = S / 2 + S * 0.012;
  f.rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    const m = f.glow ? H.glow(f.pal[ch]) : H.mat(f.pal[ch], { spec: 0.05 });
    H.mesh(H.box(px * 1.002, px * 1.002, S * 0.025), m, (c - 3.5) * px, (3.5 - r) * px, z, g);
  }));
}
// a seeded scatter of lighter/darker pixels over a box face (creeper and zombie mottling)
function mottle(H, g, w, h, z, cols, n, seed, px) {
  let s = seed * 0x9e3779b1;
  const rnd = () => { // mulberry32
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    const x = (Math.floor(rnd() * (w / px)) + 0.5) * px - w / 2, y = (Math.floor(rnd() * (h / px)) + 0.5) * px - h / 2;
    H.mesh(H.box(px, px, px * 0.2), H.mat(cols[i % cols.length], { spec: 0.05 }), x, y, z, g);
  }
}

function decorate(def, team, vis, H) {
  if (def.faction !== FAC) return;
  const { parts, skel } = vis;
  const { mesh, box, mat } = H;
  const top = def.look.top, f = FACES[top];
  // everything is redrawn out of boxes (the held items stay)
  for (const g of parts) for (const o of [...g.children]) if (!vis.items.includes(o) && !o.userData.shield) g.remove(o);
  const ch = skel.parts[PART.chest], pel = skel.parts[PART.pelvis], hd = skel.parts[PART.head];
  const r = ch.r, hh = ch.hh;
  const C = parts[PART.chest], Pv = parts[PART.pelvis];
  const m = (c, o) => mat(c, { spec: 0.08, ...o });
  // colours: head, shirt, sleeves (upper / fore), hands, trousers, shoes
  const COL = {
    mc_villager: ['#bd8b72', '#6b4a2e', '#6b4a2e', '#5a3c24', '#bd8b72', '#6b4a2e', '#3a3a3a'],
    mc_zombie: ['#5f8f4a', '#2aa8a8', '#2aa8a8', '#5f8f4a', '#5f8f4a', '#3a3aa8', '#3a3a8a'],
    mc_skeleton: ['#c8c8c8', '#c8c8c8', '#c8c8c8', '#c8c8c8', '#c8c8c8', '#c8c8c8', '#b0b0b0'],
    mc_creeper: ['#4caf3c', '#4caf3c', '#4caf3c', '#4caf3c', '#4caf3c', '#4caf3c', '#3d8a30'],
    mc_witch: ['#bd8b72', '#4a2a5a', '#4a2a5a', '#3a2048', '#bd8b72', '#4a2a5a', '#2a1a30'],
    mc_steve: ['#c69c7c', '#2aa8a8', '#2aa8a8', '#c69c7c', '#c69c7c', '#3a3aa8', '#5a5a5a'],
    mc_enderman: ['#161616', '#161616', '#161616', '#161616', '#161616', '#161616', '#101010'],
    mc_golem: ['#d8d4cc', '#d8d4cc', '#d8d4cc', '#d8d4cc', '#d8d4cc', '#c8c4bc', '#b8b4ac'],
  }[top];
  const [cHead, cShirt, cUp, cFore, cHand, cLegs, cShoe] = COL;
  const thin = top === 'mc_skeleton' || top === 'mc_enderman';
  // ---- head: a cube with a pixel face
  // (drawn bigger than the head's ball, and lifted so it still sits on the shoulders)
  const S = hd.r * 2 * (top === 'mc_golem' ? 1.15 : 1.4), lift = S / 2 - hd.r;
  const Hd = new THREE.Group();
  Hd.position.y = lift;
  parts[PART.head].add(Hd);
  mesh(box(S, S, S), m(cHead), 0, 0, 0, Hd);
  pixels(H, Hd, S, f);
  parts[PART.head].userData.face = null;
  parts[PART.head].userData.pupils = null;
  // ---- torso
  const W = r * 2.05 * (thin ? 0.85 : 1), D = r * (thin ? 0.75 : 1.05);
  const y0 = -hh - r * 0.6, y1 = hh + r * 0.8;
  if (top === 'mc_skeleton') { // a spine and ribs
    mesh(box(W * 0.22, y1 - y0, D * 0.5), m(cShirt), 0, (y0 + y1) / 2, -D * 0.1, C);
    for (let k = 0; k < 3; k++) mesh(box(W, (y1 - y0) * 0.1, D), m(cShirt), 0, y1 - (y1 - y0) * (0.12 + k * 0.22), 0, C);
    mesh(box(W, (y1 - y0) * 0.12, D * 0.8), m(cShirt), 0, y1 - (y1 - y0) * 0.02, 0, C); // shoulders
  } else mesh(box(W, y1 - y0, D), m(cShirt), 0, (y0 + y1) / 2, 0, C);
  mesh(box(W * (top === 'mc_skeleton' ? 0.7 : 1), pel.r * 1.5, D), m(top === 'mc_villager' || top === 'mc_witch' ? cShirt : cLegs), 0, pel.r * 0.1, 0, Pv);
  const px = S / 8;
  if (top === 'mc_creeper') mottle(H, C, W, y1 - y0, D / 2 + px * 0.06, ['#6ad05a', '#2f7a26', '#8ae07a'], 22, 7, px);
  if (top === 'mc_creeper') mottle(H, Hd, S, S, -S / 2 - px * 0.06, ['#6ad05a', '#2f7a26'], 12, 11, px);
  if (top === 'mc_zombie') { // torn shirt: holes of skin, and trouser stripes of shadow
    mesh(box(W * 0.45, px * 1.2, D * 1.02), m(cHead), -W * 0.25, y0 + px * 0.6, 0, C);
    mesh(box(W * 0.25, px, D * 1.02), m(cHead), W * 0.3, y0 + px * 0.5, 0, C);
  }
  if (top === 'mc_golem') { // a darker belly plate and vines climbing over
    mesh(box(W * 0.6, (y1 - y0) * 0.35, D * 1.02), m('#b8b4ac'), 0, y0 + (y1 - y0) * 0.2, 0, C);
    mottle(H, C, W, y1 - y0, D / 2 + px * 0.06, ['#4a8a2a', '#3a7a20'], 14, 5, px);
    mesh(box(S * 0.22, S * 0.42, S * 0.22), m('#c8a898'), 0, -S * 0.28, S / 2 + S * 0.11, Hd); // the long nose
    mesh(box(S * 1.02, S * 0.14, S * 0.2), m('#b8b4ac'), 0, S * 0.22, S * 0.45, Hd); // the brow
  }
  if (top === 'mc_villager' || top === 'mc_witch') { // the big nose
    mesh(box(S * 0.25, S * 0.5, S * 0.3), m(top === 'mc_witch' ? '#b07e66' : '#a87a62'), 0, -S * 0.17, S / 2 + S * 0.15, Hd);
    mesh(box(W * 1.04, pel.r * 3.4, D * 1.04), m(cShirt), 0, -pel.r * 1.1, 0, Pv); // the robe down to the shins
  }
  if (top === 'mc_villager') mesh(box(W * 1.02, (y1 - y0) * 0.35, D * 1.06), m('#4a3020'), 0, y1 - (y1 - y0) * 0.2, 0, C); // the collar
  if (top === 'mc_witch') {
    mesh(box(S * 0.08, S * 0.08, S * 0.06), m('#3c8a3c'), S * 0.08, -S * 0.25, S / 2 + S * 0.25, Hd); // a wart
    // the hat: a wide brim, then smaller boxes stepping up and back
    mesh(box(S * 1.5, S * 0.08, S * 1.5), m('#2a1a30'), 0, S * 0.52, 0, Hd);
    mesh(box(S * 1.04, S * 0.12, S * 1.04), m('#3c8a3c'), 0, S * 0.6, 0, Hd);
    [[0.86, 0.35, 0.72, 0], [0.62, 0.3, 0.98, -0.08], [0.4, 0.28, 1.22, -0.18], [0.2, 0.26, 1.44, -0.3]].forEach(([w, h, y, z]) => mesh(box(S * w, S * h, S * w), m('#2a1a30'), 0, S * y, S * z, Hd));
  }
  if (top === 'mc_steve') { // hair over the top and back of the head
    mesh(box(S * 1.04, S * 0.2, S * 1.04), m('#3b2a1a'), 0, S * 0.42, 0, Hd);
    mesh(box(S * 1.04, S * 0.75, S * 0.12), m('#3b2a1a'), 0, S * 0.1, -S * 0.47, Hd);
  }
  if (top === 'mc_enderman') mesh(box(W * 0.3, px, D * 1.02), m('#222222'), 0, y0 + (y1 - y0) * 0.45, 0, C);
  // ---- limbs: square boxes along each part (a creeper has no arms)
  const limb = (p, w, col, ext0, ext1) => {
    const sp = skel.parts[p], L = sp.hh * 2, a = -L / 2 - sp.r * ext0, b = L / 2 + sp.r * ext1;
    return mesh(box(w, b - a, w), m(col), 0, (a + b) / 2, 0, parts[p]);
  };
  const armK = thin ? 2.2 : top === 'mc_golem' ? 3.0 : 3.2;
  teamBits(H, vis, team, W, D, top !== 'mc_creeper' && armK);
  if (top !== 'mc_creeper') for (const [up, fo] of [[PART.uarmL, PART.farmL], [PART.uarmR, PART.farmR]]) {
    const ar = skel.parts[up].r;
    limb(up, ar * armK, cUp, 0.4, 1.0);
    limb(fo, ar * armK * 0.98, cFore, 1.4, 0.4);
    const fl = skel.parts[fo];
    if (cHand !== cFore) mesh(box(ar * armK * 1.0, fl.r * 1.6, ar * armK * 1.0), m(cHand), 0, -fl.hh - fl.r * 0.6, 0, parts[fo]);
    if (top === 'mc_golem') mottle(H, parts[up], ar * armK, skel.parts[up].hh * 2, ar * armK / 2 + px * 0.05, ['#4a8a2a'], 3, up + 3, px);
  }
  const legK = thin ? 1.7 : 2.55;
  for (const [th, sh] of [[PART.thighL, PART.shinL], [PART.thighR, PART.shinR]]) {
    const lr = skel.parts[th].r, lw = Math.min(lr * legK, W * 0.5);
    if (top === 'mc_creeper') { // stubby legs, deep front to back (four feet in two)
      for (const p of [th, sh]) { const sp = skel.parts[p], L = sp.hh * 2; mesh(box(lw, L + sp.r * 1.2, D * 1.3), m(cLegs), 0, -sp.r * 0.3, 0, parts[p]); }
      const sp = skel.parts[sh];
      mesh(box(lw * 1.02, sp.r * 0.8, D * 1.32), m(cShoe), 0, -sp.hh - sp.r * 0.6, 0, parts[sh]);
      continue;
    }
    limb(th, lw, cLegs, 0.6, 1.2);
    limb(sh, lw * 0.98, cLegs, 1.0, 0.6);
    const sp = skel.parts[sh];
    mesh(box(lw * 1.03, sp.r * 0.9, lw * 1.03), m(cShoe), 0, -sp.hh - sp.r * 0.55, 0, parts[sh]);
  }
}

function buildItem(name, s, team, g, H) {
  const { mesh, box, mat } = H;
  if (name === 'mc_sword') { // a blocky diamond sword
    const dia = mat('#4ae0d8', { spec: 0.9 }), dk = mat('#2a9a94', { spec: 0.6 }), hilt = mat('#6b4426');
    mesh(box(0.06 * s, 0.22 * s, 0.06 * s), hilt, 0, 0.04 * s, 0, g);
    mesh(box(0.26 * s, 0.06 * s, 0.07 * s), dk, 0, 0.17 * s, 0, g);
    mesh(box(0.12 * s, 0.68 * s, 0.04 * s), dia, 0, 0.54 * s, 0, g);
    for (const sd of [-1, 1]) mesh(box(0.025 * s, 0.62 * s, 0.045 * s), dk, sd * 0.07 * s, 0.52 * s, 0, g);
    mesh(box(0.07 * s, 0.07 * s, 0.04 * s), dia, 0, 0.92 * s, 0, g);
    return true;
  }
  if (name === 'mc_fist') return true; // the arm's own box is the fist
  return false;
}

function buildProj(type, g, H) {
  if (type !== 'mc_potion') return false;
  const { mesh, box, mat, glow } = H;
  mesh(box(0.16, 0.16, 0.16), mat('#c6e8f4', { transparent: true, opacity: 0.55, spec: 1 }), 0, 0, 0, g);
  mesh(box(0.12, 0.11, 0.12), glow('#b04ae0'), 0, -0.015, 0, g);
  mesh(box(0.06, 0.07, 0.06), mat('#c6e8f4', { spec: 1 }), 0, 0.11, 0, g);
  mesh(box(0.05, 0.03, 0.05), mat('#8a6a45'), 0, 0.155, 0, g);
  return true;
}

const ICON = '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="8" height="8" fill="#4caf3c"/>'
  + '<rect x="0" y="0" width="2" height="1" fill="#6ad05a"/><rect x="5" y="6" width="2" height="1" fill="#2f7a26"/><rect x="6" y="1" width="1" height="1" fill="#2f7a26"/>'
  + '<rect x="1" y="2" width="2" height="2" fill="#121212"/><rect x="5" y="2" width="2" height="2" fill="#121212"/>'
  + '<rect x="3" y="4" width="2" height="1" fill="#121212"/><rect x="2" y="5" width="4" height="2" fill="#121212"/>'
  + '<rect x="2" y="7" width="1" height="1" fill="#121212"/><rect x="5" y="7" width="1" height="1" fill="#121212"/></svg>';

register({
  factions: [{ id: FAC, name: 'Minecraft', color: '#5d9b3a', icon: ICON }],
  units,
  items: {
    mc_fist: { len: 0.42, r: 0.11, grip: 90, phys: false }, // bare fists (hit geometry only)
    mc_sword: { len: 1.0, r: 0.07, grip: 30, metal: true, mass: 1.4 },
  },
  kinds: { mc_creeper: creeper, mc_enderman: enderman, mc_golem: golem },
  proj: {
    mc_potion: {
      g: 9.81, len: 0, r: 0.12, life: 6,
      hit(b, pr) { splash(b, pr); return true; },
      ground(b, pr) { splash(b, pr); return true; },
    },
  },
  buildItem, decorate, buildProj,
});
