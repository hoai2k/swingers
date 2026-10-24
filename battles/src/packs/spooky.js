// Spooky: Skeleton and Skeleton Archer (cheap; they fall apart when they die),
// Candlehead (flaming wisps that set enemies on fire), Vampire (drains health with
// every claw), Reaper (one swing of the scythe kills almost anything).
import { register } from '../ext.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, aimPoint, launchVel,
  addProjectile, sweepParts, blast, addStatus, torus, tube, dome, headBand, tcol, tdark, chestShell, twoSided,
} from './common.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3();
const BONE = '#ece4cc';

// ------------------------------------------------------------------ kinds
const vampire = {
  melee: true,
  init(u) { u.drained = 0; },
  think: meleeThink,
  step(u) {
    const d = u.damageDealt - u.drained;
    if (d <= 0) return;
    u.drained = u.damageDealt;
    const heal = Math.min(u.maxHp - u.hp, d * u.def.weapon.drain);
    if (heal <= 0) return;
    u.hp += heal;
    if (heal > 4) { const c = u.chestPos; u.battle.emit('heal', c.x, c.y, c.z, Math.min(8, 2 + heal / 8)); }
  },
};

const candle = {
  init(u) { u.attackDur = u.def.weapon.windup; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    // from the flame on its head
    const h = u.headPos;
    _o.set(h.x, h.y + u.skel.rHead * 2.2, h.z);
    aimPoint(u, _p, 0.7, 1.0);
    launchVel(_o, _p, w.speed, PJ.wisp.g, false, w.spread, _v);
    addProjectile(b, 'wisp', _o, _v, u, { life: 4 });
    b.sound('fire', _o, 0.6, 1.3);
  },
};

const wispBurst = (b, pr) => {
  const w = pr.owner.def.weapon;
  blast(b, pr.pos, pr.blast, pr.damage, pr.force, pr.owner, {
    fx: 2, friendly: 0, sound: 'fire', vol: 1.2, pitch: 0.8,
    onUnit: (v) => addStatus(b, v, 'burn', w.burnTime, w.burn, pr.owner),
  });
};

const PJ = {
  wisp: {
    g: 3, len: 0, r: 0.16, life: 4,
    step(b, pr) {
      pr.trailT = (pr.trailT || 0) - 1;
      if (pr.trailT <= 0) { pr.trailT = 2; b.emit('trail', pr.pos.x, pr.pos.y, pr.pos.z, Math.random() < 0.5 ? 1 : 0); }
      const h = sweepParts(b, pr, 0.16);
      if (h) { wispBurst(b, pr); pr.life = -1; }
    },
    hit(b, pr) { wispBurst(b, pr); return true; },
    ground(b, pr) { wispBurst(b, pr); return true; },
  },
};

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'sp_skeleton', name: 'Skeleton', faction: 'spooky', cost: 40, hp: 45, speed: 4.7,
    build: { scale: 0.97, girth: 0.78, head: 1.05, mass: 0.7 },
    weapon: { kind: 'melee', style: 'sword', anim: 'overhead', item: 'sp_rusty_sword', damage: 19, reach: 1.25, cooldown: 1.0, force: 160 },
    look: { skin: BONE, hat: 'sp_skull', top: 'sp_ribs', legs: BONE },
    personality: { aggro: 1, bravery: 0, voice: 1.4, chatter: 0.6, cry: 'cackle', idle: 'shake' },
    fallApart: true,
    desc: 'Cheap and rattly. Falls to bits when beaten.',
  },
  {
    id: 'sp_skel_archer', name: 'Skeleton Archer', faction: 'spooky', cost: 70, hp: 40, speed: 4.5,
    build: { scale: 0.95, girth: 0.78, head: 1.05, mass: 0.7 },
    weapon: { kind: 'ranged', style: 'bow', anim: 'bow', item: 'sp_bone_bow', proj: 'arrow', speed: 32, arc: 'low', range: 34, minRange: 7, cooldown: 2.2, damage: 24, force: 70, spread: 0.05, releaseAt: 0.78, windup: 1.0 },
    look: { skin: BONE, hat: 'sp_skull_hood', top: 'sp_ribs', legs: BONE, quiver: true },
    personality: { aggro: 0.35, bravery: 0, voice: 1.5, chatter: 0.5, cry: 'cackle', idle: 'shake' },
    fallApart: true,
    desc: 'Rattly arrows from cheap bones.',
  },
  {
    id: 'sp_candlehead', name: 'Candlehead', faction: 'spooky', cost: 200, hp: 80, speed: 4.2,
    build: { scale: 0.95, girth: 1.0, head: 1.0 },
    weapon: { kind: 'sp_candle', style: 'staff', anim: 'cast', item: 'none', damage: 28, speed: 16, range: 26, minRange: 6, cooldown: 2.2, force: 260, blast: 1.8, spread: 0.06, releaseAt: 0.6, windup: 0.9, burn: 6, burnTime: 3.5 },
    look: { skin: '#e8d8b8', hat: 'sp_candle', top: 'sp_robe', legs: '#2a2630' },
    personality: { aggro: 0.35, bravery: 0.3, voice: 1.3, chatter: 0.7, cry: 'magic', idle: 'float' },
    desc: 'Flings flaming wisps that set enemies alight.',
  },
  {
    id: 'sp_vampire', name: 'Vampire', faction: 'spooky', cost: 340, hp: 340, speed: 6.0,
    build: { scale: 1.08, girth: 0.92, arms: 1.1 },
    weapon: { kind: 'sp_vampire', style: 'dual', anim: 'dual', item: 'sp_claw', item2: 'sp_claw', damage: 36, reach: 1.2, cooldown: 0.6, force: 200, drain: 0.6 },
    look: { skin: '#e4dce6', hat: 'sp_vampire', top: 'sp_vampire', legs: '#1d1a20', cape: true },
    personality: { aggro: 1, bravery: 0, voice: 0.8, chatter: 0.7, cry: 'magic', idle: 'regal' },
    stagger: 0.6,
    desc: 'Lightning fast claws that drain health back.',
  },
  {
    id: 'sp_reaper', name: 'Reaper', faction: 'spooky', cost: 2000, hp: 650, speed: 3.4,
    build: { scale: 1.35, girth: 0.95, head: 1.0, mass: 1.3 },
    weapon: { kind: 'melee', style: 'twohand', anim: 'slam', item: 'sp_scythe', damage: 3000, reach: 2.4, cooldown: 2.9, force: 520, sweep: true },
    look: { skin: BONE, hat: 'sp_reaper', top: 'sp_reaper', legs: '#141216' },
    personality: { aggro: 0.8, bravery: 0, voice: 0.5, chatter: 0.3, cry: 'magic', idle: 'float' },
    armor: 0.1, stagger: 0.3,
    desc: 'Every swing of the scythe is a death sentence.',
  },
];

// ------------------------------------------------------------------ visuals
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, wood, darkWood, leather, glow } = H;
  if (name === 'sp_rusty_sword') {
    const L = 1.0 * s, rust = mat('#9a6a4a', { spec: 0.5 });
    mesh(box(0.02 * s, L * 0.75, 0.085 * s), rust, 0, L * 0.58, 0, g);
    for (const y of [0.45, 0.7, 0.86]) mesh(box(0.024 * s, 0.03 * s, 0.03 * s), mat('#5a3a2a'), 0, L * y, 0.04 * s, g); // notches
    mesh(cone(0.045 * s, 0.1 * s, 4), rust, 0, L * 0.99, 0, g).scale.set(0.3, 1, 1);
    mesh(box(0.05 * s, 0.04 * s, 0.24 * s), mat('#5a5048'), 0, L * 0.2, 0, g);
    mesh(cyl(0.028 * s, 0.028 * s, L * 0.18, 6), mat('#4a3a30'), 0, L * 0.1, 0, g);
    return true;
  }
  if (name === 'sp_bone_bow') {
    const R = 0.7 * s, half = Math.PI * 0.36;
    const tg = H.geo('spbow' + s.toFixed(3), () => {
      const t = new THREE.TorusGeometry(R, 0.03 * s, 6, 22, half * 2);
      t.rotateZ(-half); t.rotateY(-Math.PI / 2); t.translate(0, 0, -R);
      return t;
    });
    mesh(tg, mat(BONE), 0, 0, 0, g);
    for (const sd of [-1, 1]) mesh(sphere(0.05 * s, 8, 6), mat(BONE), 0, sd * R * Math.sin(half), -R * (1 - Math.cos(half)), g);
    mesh(cyl(0.04 * s, 0.04 * s, 0.14 * s, 8), tcol(H, team), 0, 0, 0, g);
    mesh(cyl(0.004 * s, 0.004 * s, 2 * R * Math.sin(half), 3), mat('#d8d0c0'), 0, 0, -R * (1 - Math.cos(half)), g).castShadow = false;
    return true;
  }
  if (name === 'sp_claw') { // long fingernails
    for (let i = 0; i < 3; i++) { const c = mesh(cone(0.018 * s, 0.24 * s, 5), mat('#e8e0d0', { spec: 0.6 }), (i - 1) * 0.035 * s, 0.13 * s, 0.03 * s, g); c.rotation.x = 0.25; }
    return true;
  }
  if (name === 'sp_scythe') {
    const L = 2.1 * s;
    mesh(cyl(0.03 * s, 0.035 * s, L, 7), mat('#3a2a22'), 0, L / 2, 0, g);
    for (const y of [0.3, 0.55]) mesh(cyl(0.04 * s, 0.04 * s, 0.05 * s, 7), mat('#5a5048'), 0, L * y, 0, g);
    // curved blade at the top, sweeping forward (+Z) and down
    const pts = [];
    for (let i = 0; i <= 8; i++) { const a = i / 8; pts.push([0, L * 0.98 - Math.sin(a * 1.4) * 0.35 * s, a * 0.95 * s]); }
    mesh(tube(H, 'scy' + s.toFixed(3), pts, 0.07 * s, 0.01 * s, 12), mat('#c8ccd2', { spec: 1 }), 0, 0, 0, g).scale.set(0.3, 1, 1);
    mesh(box(0.05 * s, 0.1 * s, 0.1 * s), mat('#5a5048'), 0, L * 0.98, 0, g);
    return true;
  }
  return false;
}

function skull(r, g, H, eyes) {
  const { mesh, sphere, box, cone, mat, glow } = H;
  const bone = mat(BONE, { spec: 0.25 }), hole = mat('#1a1416');
  mesh(sphere(r * 1.03, 16, 12), bone, 0, r * 0.05, 0, g);
  const jaw = mesh(sphere(r * 0.62, 12, 8), bone, 0, -r * 0.55, r * 0.35, g); jaw.scale.set(1.05, 0.6, 0.9);
  for (const sd of [-1, 1]) {
    const e = mesh(sphere(r * 0.26, 10, 8), hole, sd * r * 0.36, r * 0.12, r * 0.84, g); e.scale.set(1, 1.1, 0.5);
    if (eyes) mesh(sphere(r * 0.09, 6, 5), glow(eyes), sd * r * 0.36, r * 0.12, r * 0.95, g);
  }
  const n = mesh(cone(r * 0.1, r * 0.2, 3), hole, 0, -r * 0.15, r * 0.98, g); n.rotation.x = Math.PI;
  for (let i = -2; i <= 2; i++) mesh(box(r * 0.1, r * 0.14, r * 0.05), mat('#f6f0de'), i * r * 0.12, -r * 0.45, r * 0.86 - Math.abs(i) * r * 0.04, g);
  mesh(box(r * 0.7, r * 0.03, r * 0.05), hole, 0, -r * 0.38, r * 0.86, g);
  g.userData.hidesFace = true;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'sp_skull': {
      skull(r, g, H, null);
      const helm = mat('#6a6058', { spec: 0.5 });
      mesh(dome(H, r * 1.1, 0.42), helm, 0, r * 0.32, 0, g); // a dented, rusty helmet
      mesh(cyl(r * 1.15, r * 1.15, r * 0.08, 16), helm, 0, r * 0.38, 0, g);
      for (let i = 0; i < 4; i++) { const p = mesh(sphere(r * 0.18, 8, 6), i % 2 ? td : tc, 0, r * (1.2 + Math.sin(i / 3 * Math.PI) * 0.15), r * (0.25 - i * 0.25), g); p.scale.set(0.45, 1, 1); }
      return true;
    }
    case 'sp_skull_hood': {
      skull(r, g, H, null);
      const hood = mat('#3a3440');
      mesh(H.geo('sphood' + r.toFixed(3), () => twoSided(new THREE.SphereGeometry(r * 1.16, 16, 10, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, 0, Math.PI * 0.75))), hood, 0, r * 0.06, -r * 0.05, g);
      headBand(H, r, 0.55, 0.16, tc, g, 0.2);
      return true;
    }
    case 'sp_candle': { // a melting candle on the head, with a burning wick
      const wax = mat('#f4ecd8', { spec: 0.3 });
      mesh(cyl(r * 0.5, r * 0.55, r * 1.3, 14), wax, 0, r * 1.45, 0, g);
      for (let i = 0; i < 6; i++) { const a = i * 1.05; const d = mesh(H.capsule(r * 0.08, r * (0.3 + (i % 3) * 0.15)), wax, Math.cos(a) * r * 0.52, r * (1.0 + (i % 2) * 0.2), Math.sin(a) * r * 0.52, g); d.scale.set(1, 1, 0.8); }
      mesh(cyl(r * 0.03, r * 0.03, r * 0.22, 4), mat('#2a2020'), 0, r * 2.15, 0, g);
      const f = mesh(sphere(r * 0.18, 10, 8), glow('#ffb030'), 0, r * 2.4, 0, g); f.scale.set(0.8, 1.6, 0.8); f.castShadow = false;
      const f2 = mesh(sphere(r * 0.1, 8, 6), glow('#fff2b0'), 0, r * 2.33, r * 0.04, g); f2.scale.set(0.8, 1.5, 0.8); f2.castShadow = false;
      headBand(H, r, 0.62, 0.18, tc, g, 0.06);
      return true;
    }
    case 'sp_vampire': { // slicked black hair with a widow's peak, pointy ears and fangs
      const hair = mat('#1d1a20', { spec: 0.6 });
      mesh(sphere(r * 1.03, 16, 12), hair, 0, r * 0.18, -r * 0.12, g).scale.set(1.03, 0.92, 1.0);
      const pk = mesh(cone(r * 0.25, r * 0.38, 4), hair, 0, r * 0.66, r * 0.78, g); pk.rotation.x = Math.PI - 0.6; pk.scale.set(1, 1, 0.4);
      for (const sd of [-1, 1]) {
        const e = mesh(cone(r * 0.14, r * 0.45, 5), mat('#e4dce6'), sd * r * 1.0, r * 0.15, -r * 0.05, g); e.rotation.z = -sd * 1.1;
        const f = mesh(cone(r * 0.045, r * 0.16, 4), mat('#ffffff'), sd * r * 0.13, -r * 0.42, r * 0.92, g); f.rotation.x = Math.PI;
      }
      return true;
    }
    case 'sp_reaper': { // black hood with a skull inside and glowing eyes
      skull(r, g, H, '#7fd8ff');
      const cloth = mat('#141216');
      mesh(H.geo('rphood' + r.toFixed(3), () => twoSided(new THREE.SphereGeometry(r * 1.3, 18, 12, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, Math.PI * 0.8))), cloth, 0, r * 0.1, -r * 0.05, g);
      mesh(tube(H, 'rptip' + r.toFixed(3), [[0, 1.2, -0.4], [0, 1.25, -1.0], [0, 0.8, -1.5]].map((p) => p.map((q) => q * r)), r * 0.45, r * 0.05), cloth, 0, 0, 0, g);
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'spooky') return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, leather } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  const pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const bone = mat(BONE, { spec: 0.25 });
  if (top === 'sp_ribs') { // dark ribcage with white ribs, a tattered team rag
    chestShell(H, ch, mat('#2a2426'), C);
    for (let i = 0; i < 4; i++) { const rb = mesh(torus(H, r * (1.22 - i * 0.03), r * 0.1, Math.PI * 1.6, 14), bone, 0, hh * 0.95 - i * (hh * 0.5 + r * 0.17), 0, C); rb.rotation.x = Math.PI / 2; rb.rotation.z = Math.PI / 2 + Math.PI * 0.2; rb.scale.set(1, 0.92, 1); }
    mesh(box(r * 0.16, (hh + r) * 1.6, r * 0.12), bone, 0, 0, -r * 0.88, C); // spine
    mesh(box(r * 0.14, (hh + r) * 1.1, r * 0.1), bone, 0, hh * 0.2, r * 1.1, C); // sternum
    const rag = mesh(box(r * 1.3, r * 1.0, r * 0.05), tc, 0, -hh - r * 0.45, r * 1.1, C); rag.rotation.x = -0.15;
    mesh(cyl(r * 0.85, r * 0.9, r * 0.14, 14), td, 0, -hh - r * 0.5, 0, C);
    // bone limbs over the sleeves
    for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) {
      const sp = skel.parts[p];
      mesh(H.capsule(sp.r * 1.08, sp.hh * 2), bone, 0, 0, 0, parts[p]);
      for (const y of [-1, 1]) mesh(sphere(sp.r * 1.1, 8, 6), bone, 0, y * sp.hh, 0, parts[p]);
    }
  }
  if (top === 'sp_robe' || top === 'sp_reaper') { // a ragged robe (reaper: black with a team rope belt)
    const col = top === 'sp_reaper' ? mat('#141216') : td;
    chestShell(H, ch, col, C);
    mesh(cyl(r * 1.12, r * 1.14, r * 0.14, 14), top === 'sp_reaper' ? tc : mat('#8a6a3a'), 0, -hh - r * 0.38, 0, C);
    const sk = mesh(cyl(pel.r * 1.1, pel.r * 1.6, pel.r * 3.2, 14), col, 0, -pel.r * 1.35, 0, P); sk.scale.set(1, 1, 0.95);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const t = mesh(cone(pel.r * 0.25, pel.r * 0.5, 4), col, Math.sin(a) * pel.r * 1.5, -pel.r * 3.05, Math.cos(a) * pel.r * 1.5, P); t.rotation.x = Math.PI; }
    for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.3, sp.r * (p === PART.farmL || p === PART.farmR ? 1.9 : 1.4), sp.hh * 2.1, 10), col, 0, 0, 0, parts[p]); }
    if (top === 'sp_reaper') for (const p of [PART.farmL, PART.farmR]) mesh(sphere(skel.parts[p].r * 1.5, 8, 6), bone, 0, -skel.parts[p].hh - skel.parts[p].r * 0.3, 0, parts[p]);
  }
  if (top === 'sp_vampire') { // high collar, white shirt and a red jewel
    const blk = mat('#1d1a20');
    chestShell(H, ch, blk, C);
    mesh(box(r * 0.5, (hh + r) * 1.4, r * 0.08), mat('#f6f3ea'), 0, 0, r * 0.95, C);
    mesh(sphere(r * 0.13, 8, 6), H.glow('#e02040'), 0, hh + r * 0.15, r * 1.0, C);
    for (const sd of [-1, 1]) { const cl = mesh(box(r * 0.7, r * 0.9, r * 0.05), td, sd * r * 0.6, hh + r * 0.75, -r * 0.35, C); cl.rotation.set(-0.3, sd * 0.5, sd * -0.3); }
    mesh(cyl(r * 1.12, r * 1.14, r * 0.14, 14), tc, 0, -hh - r * 0.38, 0, C);
    for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) { const sp = skel.parts[p]; mesh(H.capsule(sp.r * 1.12, sp.hh * 2), blk, 0, 0, 0, parts[p]); }
  }
}

function buildProj(type, g, H) {
  if (type !== 'wisp') return false;
  const { mesh, sphere, glow, mat } = H;
  const a = mesh(sphere(0.16, 10, 8), glow('#fff2b0'), 0, 0, 0, g); a.castShadow = false;
  const b = mesh(sphere(0.26, 10, 8), mat('#ff8a2a', { emit: 1, transparent: true, opacity: 0.55 }), 0, 0, 0, g); b.castShadow = false;
  return true;
}

register({
  factions: [{ id: 'spooky', name: 'Spooky', color: '#8c95a8' }],
  units,
  items: {
    sp_rusty_sword: { len: 1.0, r: 0.07, grip: 30, metal: true },
    sp_bone_bow: { len: 1.4, r: 0.04, grip: 0, center: true },
    sp_claw: { len: 0.3, r: 0.1, grip: 80 },
    sp_scythe: { len: 2.1, r: 0.14, grip: 25, metal: true, heavy: true },
  },
  kinds: { sp_vampire: vampire, sp_candle: candle },
  proj: PJ,
  buildItem, buildHat, decorate, buildProj,
});
