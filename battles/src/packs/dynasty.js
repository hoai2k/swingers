// Dynasty: Monk (palm strikes that send enemies flying), Samurai (fast katana, parries
// blows from the front and strikes back), Firework Archer (exploding rocket arrows),
// Hwacha (a rocket rack on its back that fires a volley of rockets).
import { register } from '../ext.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, rangedThink, crossed, inFront, aimPoint,
  launchVel, addProjectile, torus, tube, dome, headBand, tcol, tdark,
} from './common.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3();

// ------------------------------------------------------------------ kinds
const parry = {
  melee: true,
  init(u) { u.parryT = 0; },
  think: meleeThink,
  step(u, dt) { u.parryT -= dt; },
  // catches blows and arrows from the front, then answers at once
  hit(u, amount, part, attacker, kind) {
    if (!attacker || u.parryT > 0 || u.stun > 0 || u.isDown() || kind === 'blast' || kind === 'poison' || kind === 'burn') return amount;
    if (!inFront(u, attacker.pos.x, attacker.pos.z, 0.25) || Math.random() > u.def.weapon.parry) return amount;
    u.parryT = 0.45;
    u.cooldown = Math.min(u.cooldown, 0.05);
    const b = u.battle, h = u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset * 2, 0, _v);
    b.emit('spark', h.x, h.y, h.z, 8);
    b.sound('clang', h, 0.9, 1.4);
    return amount * 0.1;
  },
};

const hwacha = {
  init(u) { u.attackDur = u.def.weapon.windup; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon, b = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    aimPoint(u, _p, 0.8, 1.2);
    const tx = _p.x, ty = _p.y, tz = _p.z;
    const hy = u.heading;
    for (let i = 0; i < w.volley; i++) {
      b.delayed.push([i * 0.07, () => {
        if (!u.alive) return;
        // from the rack on its back, row by row
        const c = u.chestPos, k = i % 4 - 1.5, row = Math.floor(i / 4) % 4;
        _o.set(c.x - Math.sin(hy) * 0.35 * u.s + Math.cos(hy) * k * 0.13 * u.s, c.y + (0.55 + row * 0.12) * u.s, c.z - Math.cos(hy) * 0.35 * u.s - Math.sin(hy) * k * 0.13 * u.s);
        const r = w.scatter * Math.sqrt(Math.random()), a = rand(0, Math.PI * 2);
        _p.set(tx + Math.cos(a) * r, ty, tz + Math.sin(a) * r);
        launchVel(_o, _p, w.speed * rand(0.95, 1.05), 9.81, true, 0.02, _v);
        addProjectile(b, 'hrocket', _o, _v, u, { life: 7 });
        b.emit('spark', _o.x, _o.y, _o.z, 1);
        if (i % 2 === 0) b.sound('fire', _o, 0.5, rand(1.3, 1.6));
      }]);
    }
  },
};

const rocketStep = (b, pr) => {
  if (!pr.snd) { pr.snd = true; b.sound('fire', pr.pos, 0.4, 1.6); }
  pr.trailT = (pr.trailT || 0) - 1;
  if (pr.trailT <= 0) { pr.trailT = 3; b.emit('trail', pr.pos.x, pr.pos.y, pr.pos.z, Math.random() < 0.5 ? 1 : 0); }
};

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'dy_monk', name: 'Monk', faction: 'dynasty', cost: 75, hp: 110, speed: 5.0,
    build: { scale: 0.98, girth: 0.95 },
    weapon: { line: 'Melee · palm strikes with huge knockback', kind: 'melee', style: 'none', anim: 'punch', item: 'dy_palm', damage: 38, reach: 1.0, cooldown: 0.75, force: 1000 },
    look: { skin: '#f0c8a0', hat: 'dy_bald', top: 'dy_robe', legs: '#e8a030' },
    personality: { aggro: 0.95, bravery: 0.1, voice: 1.1, chatter: 0.4, cry: 'hey', idle: 'pray' },
    desc: 'Palm strikes that launch enemies across the field.',
  },
  {
    id: 'dy_samurai', name: 'Samurai', faction: 'dynasty', cost: 240, hp: 230, speed: 5.4,
    build: { scale: 1.02, girth: 1.0 },
    weapon: { line: 'Melee · parries frontal hits and strikes back', kind: 'dy_parry', style: 'twohand', anim: 'slam', item: 'dy_katana_sword', damage: 40, reach: 1.45, cooldown: 0.8, force: 300, parry: 0.6 },
    look: { skin: '#f0c8a0', hat: 'dy_kabuto', top: 'dy_lamellar', legs: '#2e2a2a' },
    personality: { aggro: 1, bravery: 0, voice: 0.85, chatter: 0.5, cry: 'charge', idle: 'shift' },
    stagger: 0.7,
    desc: 'Swift katana. Parries blows from the front and strikes back.',
  },
  {
    id: 'dy_firework', name: 'Firework Archer', faction: 'dynasty', cost: 300, hp: 80, speed: 4.4,
    build: { scale: 0.97, girth: 0.95 },
    weapon: { line: 'Ranged · exploding rocket arrows', kind: 'ranged', style: 'bow', anim: 'bow', item: 'bow', proj: 'firework', speed: 26, arc: 'low', range: 32, minRange: 8, cooldown: 2.4, damage: 70, force: 420, spread: 0.05, releaseAt: 0.78, windup: 1.0, blast: 2.6 },
    look: { skin: '#f0c8a0', hat: 'dy_jingasa', top: 'dy_robe', legs: '#3a3a5a', quiver: true },
    personality: { aggro: 0.3, bravery: 0.3, voice: 1.15, chatter: 0.5, cry: 'cackle', idle: 'shift' },
    desc: 'Rocket arrows that explode with a bang and sparks.',
  },
  {
    id: 'dy_hwacha', name: 'Hwacha', faction: 'dynasty', cost: 400, hp: 450, speed: 3.6,
    build: { scale: 1.08, girth: 1.1, mass: 1.3 },
    weapon: { line: 'Siege · volleys of 16 rockets', kind: 'dy_hwacha', style: 'staff', anim: 'cast', item: 'dy_torch', damage: 60, speed: 21, range: 36, minRange: 10, cooldown: 5, force: 380, blast: 2.4, releaseAt: 0.55, windup: 1.4, volley: 16, scatter: 2.6 },
    look: { skin: '#f0c8a0', hat: 'dy_gat', top: 'dy_robe', legs: '#4a3a2a' },
    personality: { aggro: 0.25, bravery: 0.2, voice: 0.9, chatter: 0.6, cry: 'cackle', idle: 'shake' },
    desc: 'Lights the rack on its back: a dozen rockets rain down.',
  },
];

// ------------------------------------------------------------------ visuals
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, wood, darkWood, leather, glow } = H;
  if (name === 'dy_palm') { // (an open-hand strike: just cloth hand wraps)
    mesh(cyl(0.06 * s, 0.065 * s, 0.12 * s, 8), mat('#f6f3ea'), 0, -0.1 * s, 0, g);
    return true;
  }
  if (name === 'dy_katana_sword') {
    const L = 1.25 * s;
    // gently curved single-edged blade from a few segments
    for (let i = 0; i < 5; i++) {
      const y0 = L * (0.26 + i * 0.145), z0 = (i * i) * 0.006 * s;
      const seg = mesh(box(0.018 * s, L * 0.15, 0.05 * s), metal(), 0, y0 + L * 0.07, z0, g);
      seg.rotation.x = -i * 0.04;
    }
    mesh(cone(0.026 * s, 0.1 * s, 4), metal(), 0, L * 1.0, 0.11 * s, g).scale.set(0.35, 1, 1);
    mesh(cyl(0.065 * s, 0.065 * s, 0.015 * s, 10), H.gold(), 0, L * 0.25, 0, g); // tsuba
    mesh(cyl(0.028 * s, 0.03 * s, L * 0.24, 8), mat('#1d1a1a'), 0, L * 0.12, 0, g);
    for (let k = 0; k < 4; k++) mesh(octa(0.022 * s), tcol(H, team), 0, L * (0.03 + k * 0.055), 0.025 * s, g);
    return true;
  }
  if (name === 'dy_torch') {
    mesh(cyl(0.025 * s, 0.03 * s, 0.9 * s, 7), darkWood(), 0, 0, 0, g);
    mesh(cyl(0.05 * s, 0.04 * s, 0.12 * s, 8), leather(), 0, 0.45 * s, 0, g);
    mesh(cone(0.07 * s, 0.22 * s, 7), glow('#ffb030'), 0, 0.6 * s, 0, g).castShadow = false;
    mesh(cone(0.04 * s, 0.14 * s, 6), glow('#fff2b0'), 0, 0.58 * s, 0, g).castShadow = false;
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const lac = mat('#26201e', { spec: 0.7 });
  switch (kind) {
    case 'dy_bald': // shaved head with the ordination dots
      for (let i = 0; i < 6; i++) { const a = (i % 3 - 1) * 0.35, b = Math.floor(i / 3) * 0.3 - 0.15; mesh(sphere(r * 0.05, 6, 5), mat('#b07a50'), Math.sin(a) * r * 0.95, r * (0.9 - Math.abs(b) * 0.3), Math.cos(a) * r * 0.25 + b * r, g).scale.set(1, 0.3, 1); }
      return true;
    case 'dy_kabuto': { // lacquered helmet, flared neck guard, golden crescent
      mesh(dome(H, r * 1.08, 0.5), lac, 0, r * 0.35, 0, g);
      for (let i = 0; i < 3; i++) {
        const sk = mesh(H.geo('dyshk' + i + r.toFixed(3), () => new THREE.CylinderGeometry(r * (1.12 + i * 0.12), r * (1.22 + i * 0.12), r * 0.16, 18, 1, true, Math.PI * 0.6, Math.PI * 0.8)), i % 2 ? tc : lac, 0, r * (0.32 - i * 0.15), 0, g);
        sk.rotation.y = Math.PI;
      }
      for (const sd of [-1, 1]) { const f = mesh(box(r * 0.06, r * 0.4, r * 0.35), lac, sd * r * 1.05, r * 0.4, r * 0.55, g); f.rotation.y = sd * 0.6; f.rotation.z = sd * 0.3; }
      const cr = mesh(torus(H, r * 0.8, r * 0.09, Math.PI, 14), gold(), 0, r * 1.05, r * 0.85, g);
      cr.rotation.z = 0; cr.rotation.x = -0.2;
      mesh(sphere(r * 0.12, 8, 6), tc, 0, r * 0.7, r * 1.0, g);
      return true;
    }
    case 'dy_jingasa': { // flat conical straw hat
      const straw = mat('#d8b870', { spec: 0 });
      mesh(cone(r * 1.75, r * 0.6, 18), straw, 0, r * 0.95, 0, g);
      mesh(cyl(r * 1.0, r * 1.0, r * 0.1, 16), tc, 0, r * 0.78, 0, g);
      mesh(sphere(r * 0.1, 6, 5), tc, 0, r * 1.28, 0, g);
      for (const sd of [-1, 1]) { const st = mesh(box(r * 0.04, r * 0.9, r * 0.04), tc, sd * r * 0.75, r * 0.1, r * 0.25, g); st.rotation.z = sd * 0.2; }
      return true;
    }
    case 'dy_gat': { // black horsehair hat with a wide brim and a topknot
      const blk = mat('#1d1a1a', { spec: 0.3 });
      mesh(cyl(r * 1.6, r * 1.6, r * 0.04, 22), mat('#2a2626', { spec: 0.2, transparent: true, opacity: 0.85 }), 0, r * 0.68, 0, g);
      mesh(cyl(r * 0.55, r * 0.62, r * 0.7, 14), blk, 0, r * 1.05, 0, g);
      mesh(cyl(r * 0.63, r * 0.63, r * 0.1, 14), tc, 0, r * 0.75, 0, g);
      mesh(sphere(r * 1.0, 14, 10), blk, 0, r * 0.3, -r * 0.1, g).scale.set(1.02, 0.7, 1);
      for (const sd of [-1, 1]) { const st = mesh(box(r * 0.03, r * 1.1, r * 0.03), tc, sd * r * 0.8, r * 0.05, r * 0.2, g); st.rotation.z = sd * 0.15; }
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'dynasty') return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, leather, darkWood, wood } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  const pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  if (top === 'dy_robe') { // wrap robe: crossed lapels, wide sash, wide trousers
    const lap = mat('#f6f3ea');
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.22, (hh + r) * 1.6, r * 0.06), lap, sd * r * 0.18, hh * 0.3, r * 0.86, C); l.rotation.z = sd * 0.45; l.rotation.x = -0.12; }
    mesh(cyl(r * 1.12, r * 1.16, r * 0.38, 16), def.id === 'dy_monk' ? mat('#e8a030') : td, 0, -hh - r * 0.3, 0, C);
    const k = mesh(cyl(pel.r * 1.1, pel.r * 1.35, pel.r * 1.2, 14), td, 0, -pel.r * 0.4, 0, P); k.scale.set(1, 1, 0.95);
    if (def.id === 'dy_monk') for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mesh(sphere(r * 0.075, 6, 5), mat('#6a3a1a', { spec: 0.4 }), Math.sin(a) * r * 0.62, hh + r * 0.55 - (Math.cos(a) + 1) * r * 0.2, Math.cos(a) * r * 0.62 * 0.9 + r * 0.25, C); }
  }
  if (top === 'dy_lamellar') { // rows of lacquered plates, shoulder guards, skirt
    const lac = mat('#26201e', { spec: 0.7 });
    for (let row = 0; row < 4; row++) {
      const y = hh * 0.9 - row * (hh * 0.55 + r * 0.12);
      const band = mesh(cyl(r * (1.04 + row * 0.03), r * (1.06 + row * 0.03), r * 0.22, 18), row % 2 ? lac : tc, 0, y, 0, C);
      band.scale.set(1, 1, 0.92);
    }
    for (const p of [PART.uarmL, PART.uarmR]) {
      const sp = skel.parts[p], sd = p === PART.uarmL ? 1 : -1;
      const sode = mesh(box(sp.r * 0.6, sp.hh * 1.5, sp.r * 3.2), tc, sd * sp.r * 1.4, sp.hh * 0.3, 0, parts[p]);
      sode.rotation.z = sd * 0.12;
      for (let k = 0; k < 3; k++) mesh(box(sp.r * 0.65, sp.r * 0.12, sp.r * 3.25), lac, sd * sp.r * 1.4, sp.hh * (0.8 - k * 0.5), 0, parts[p]).rotation.z = sd * 0.12;
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const s = mesh(box(pel.r * 0.75, pel.r * 1.0, pel.r * 0.1), k % 2 ? lac : tc, Math.sin(a) * pel.r * 1.12, -pel.r * 0.4, Math.cos(a) * pel.r * 1.12, P);
      s.rotation.y = a; s.rotation.x = 0.15;
    }
  }
  if (def.id === 'dy_hwacha') { // the rocket rack strapped to its back
    const B = new THREE.Group();
    B.position.set(0, hh + r * 0.4, -r * 1.25);
    B.rotation.x = -0.5;
    C.add(B);
    const w = r * 1.5, hgt = r * 1.3;
    mesh(box(w, hgt, r * 0.55), darkWood(), 0, 0, 0, B);
    for (const sd of [-1, 1]) mesh(box(r * 0.1, hgt * 1.25, r * 0.1), wood(), sd * w * 0.52, -hgt * 0.05, -r * 0.3, B);
    mesh(box(w * 1.05, r * 0.12, r * 0.6), tc, 0, -hgt * 0.45, 0, B);
    for (let i = 0; i < 16; i++) {
      const x = (i % 4 - 1.5) * w * 0.23, z = (Math.floor(i / 4) - 1.5) * r * 0.13;
      mesh(cyl(r * 0.05, r * 0.05, r * 0.5, 6), mat('#8a2a1a'), x, hgt * 0.6, z, B);
      mesh(cone(r * 0.06, r * 0.16, 5), H.metal(), x, hgt * 0.92, z, B);
    }
    for (const sd of [-1, 1]) { const st = mesh(box(r * 0.14, (hh + r) * 2.1, r * 0.06), leather(), sd * r * 0.45, 0, r * 0.88, C); st.rotation.x = -0.1; }
    // little cart wheels at the hips
    for (const sd of [-1, 1]) {
      const wh = mesh(torus(H, pel.r * 0.7, pel.r * 0.12, Math.PI * 2, 14), wood(), sd * pel.r * 1.45, -pel.r * 0.2, -pel.r * 0.7, P);
      wh.rotation.y = Math.PI / 2;
      for (const a of [0, Math.PI / 2]) { const sp = mesh(box(pel.r * 0.06, pel.r * 1.4, pel.r * 0.06), darkWood(), sd * pel.r * 1.45, -pel.r * 0.2, -pel.r * 0.7, P); sp.rotation.x = a; }
    }
  }
}

function buildProj(type, g, H) {
  const { mesh, cyl, cone, box, mat, glow } = H;
  if (type === 'firework' || type === 'hrocket') {
    const big = type === 'firework' ? 1 : 0.85;
    mesh(cyl(0.012, 0.012, 0.8 * big, 5), mat('#9a6332'), 0, -0.1, 0, g);
    mesh(cyl(0.045 * big, 0.045 * big, 0.26 * big, 8), mat(type === 'firework' ? '#d8302a' : '#8a2a1a'), 0, 0.25 * big, 0, g);
    mesh(cone(0.05 * big, 0.1 * big, 8), mat('#f0c03c', { spec: 1 }), 0, 0.43 * big, 0, g);
    mesh(cone(0.04, 0.16, 6), glow('#ffd040'), 0, 0.05 * big, 0, g).rotation.x = Math.PI;
    return true;
  }
  return false;
}

register({
  factions: [{ id: 'dynasty', name: 'Dynasty', color: '#e2556b' }],
  units,
  items: {
    dy_katana_sword: { len: 1.25, r: 0.07, grip: 25, metal: true },
    dy_torch: { len: 0.9, r: 0.05, grip: 10, center: true },
    dy_palm: { len: 0.4, r: 0.1, grip: 90 },
  },
  kinds: { dy_parry: parry, dy_hwacha: hwacha },
  proj: {
    firework: { g: 4, len: 0.6, r: 0.07, explode: 'fire', life: 5, step: rocketStep },
    hrocket: { g: 9.81, len: 0.5, r: 0.07, explode: 'fire', life: 7, step: rocketStep },
  },
  buildItem, buildHat, decorate, buildProj,
});
