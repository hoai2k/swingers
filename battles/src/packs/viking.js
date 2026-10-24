// Viking: Brawler (hammer + shield), Headbutter (knock-down headbutt), Ice Archer
// (frost arrows slow their target), Jarl (leaps into the enemy line with a battle
// cry that inspires nearby allies, and lands with a shockwave).
import { register } from '../ext.js';
import {
  THREE, clamp, rand, PART, EXPR, meleeThink, crossed, addStatus, arrowProj, arrowMesh,
  torus, tube, dome, headBand, tcol, tdark, hoodGeo,
} from './common.js';

const _d = new THREE.Vector3();

// ------------------------------------------------------------------ kinds
const headbutt = {
  init(u) { u.reachDist = 1.1 * u.s; },
  think: meleeThink,
  // lunge at the strike, then the head does the damage (step)
  event(u, t0, t1) {
    if (crossed(t0, t1, 0.42)) {
      const h = u.heading, k = u.M * 3.4;
      u.rag.impulse(PART.head, Math.sin(h) * k * 0.08, 0, Math.cos(h) * k * 0.08);
      u.rag.impulseAll(Math.sin(h) * k * 0.8, k * 0.2, Math.cos(h) * k * 0.8);
      u.hbHit = false;
    }
  },
  step(u) {
    const at = u.st.attackT;
    if (!u.st.attack || at < 0.42 || at > 0.9 || u.hbHit) return;
    const b = u.battle, hp = u.headPos, w = u.def.weapon, hr = u.skel.rHead;
    b.grid.query(hp.x, hp.z, 2.5, (v) => {
      if (u.hbHit || v.team === u.team || !v.alive) return;
      for (const part of [PART.head, PART.chest, PART.pelvis]) {
        const c = v.rag.pos[part];
        const rr = hr + v.skel.parts[part].r + 0.22 * u.s;
        if (c.distanceToSquared(hp) > rr * rr) continue;
        u.hbHit = true;
        const h = u.heading;
        _d.set(Math.sin(h), 0.55, Math.cos(h)).normalize();
        const f = Math.min(w.force, v.M * 13) * (u.buff > 0 ? 1.15 : 1);
        v.hit(w.damage * (u.buff > 0 ? 1.15 : 1), part, _d.x * f * 0.3, _d.y * f * 0.3, _d.z * f * 0.3, u, 'melee');
        v.rag.impulseAll(_d.x * f * 0.7, _d.y * f * 0.7, _d.z * f * 0.7);
        v.stun = Math.max(v.stun, 1.6 * (v.def.stagger ?? 1)); // knocked flat
        b.emit(v.def.armor > 0.3 ? 'spark' : 'blood', c.x, c.y, c.z, 8, _d.x, _d.z);
        b.sound('crunch', c, 1.0, 0.9);
        b.sound('clang', c, 0.5, 0.7);
        return;
      }
    });
  },
};

const jarl = {
  melee: true,
  init(u) { u.leapCD = rand(0.5, 1.5); },
  think(u, dt, c) {
    u.leapCD -= dt;
    const { t, gap, dirx, dirz } = c;
    if (u.leaping) { u.expr = EXPR.angry; return t; }
    if (u.leapCD <= 0 && gap > 3.5 && gap < 11 && !u.st.attack && u.stun <= 0 && !u.isDown() && u.groundGap() < 0.3) {
      // jump at the target: flight time ~0.8 s
      const T = 0.85, d = Math.max(1, gap - 0.6);
      const v0 = u.rag.vel[PART.pelvis];
      const vh = d / T, vy = 9.81 * T / 2;
      u.rag.impulseAll((dirx * vh - v0.x) * u.M, (vy - v0.y) * u.M, (dirz * vh - v0.z) * u.M);
      u.leaping = true; u.leapT = 0;
      u.leapCD = rand(7, 9);
      const b = u.battle;
      b.voice(u, 'cry', true);
      b.sound('horn', u.pos, 0.5, 1.15);
      // battle cry: nearby allies are inspired (bard buff) for a while
      for (const o of b.teams[u.team]) if (o.alive && o !== u && (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2 < 64) o.buff = Math.max(o.buff, 4);
      return t;
    }
    return meleeThink(u, dt, c);
  },
  step(u, dt) {
    if (!u.leaping) return;
    u.leapT += dt;
    if (u.leapT < 0.3 || (u.groundGap() > 0.35 * u.s && u.leapT < 2)) return;
    u.leaping = false;
    // landing shockwave
    const b = u.battle, p = u.pos, gy = b.terrain.height(p.x, p.z), R = 3.2 * u.s / 1.3;
    b.emit('dust', p.x, gy, p.z, 7);
    b.sound('thump', p, 1.3, 0.6);
    b.sound('crunch', p, 0.8, 0.7);
    b.grid.query(p.x, p.z, R + 1, (v) => {
      if (v === u || !v.alive || v.team === u.team) return;
      const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > R) return;
      const k = 1 - d / R * 0.6, imp = Math.min(v.M * 9, 700) * k;
      v.hit(35 * k, PART.chest, 0, 0, 0, u, 'stomp');
      v.rag.impulseAll(dx / (d || 1) * imp, imp * 0.8, dz / (d || 1) * imp);
      v.stun = Math.max(v.stun, 1.1 * k * (v.def.stagger ?? 1));
    });
    u.cooldown = Math.min(u.cooldown, 0.1); // swing straight away
  },
};

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'vk_brawler', name: 'Brawler', faction: 'viking', cost: 100, hp: 115, speed: 4.5,
    build: { scale: 1.02, girth: 1.12 },
    weapon: { kind: 'melee', style: 'shield', anim: 'overhead', item: 'vk_hammer', shield: 'wood', damage: 22, reach: 1.25, cooldown: 1.05, force: 300, blockMelee: 0.4 },
    look: { skin: '#f0c8a8', hat: 'vk_cap', top: 'fur', legs: '#5e5048', bare: true, beard: '#c8702c' },
    personality: { aggro: 0.95, bravery: 0.1, voice: 0.85, chatter: 0.7, cry: 'roar', idle: 'thump' },
    desc: 'Hammer, shield and a terrible temper.',
  },
  {
    id: 'vk_headbutter', name: 'Headbutter', faction: 'viking', cost: 100, hp: 165, speed: 5.0,
    build: { scale: 1.0, girth: 1.08, head: 1.15 },
    weapon: { kind: 'vk_headbutt', style: 'fists', anim: 'stab', item: 'none', damage: 47, reach: 0.8, cooldown: 1.1, force: 820 },
    look: { skin: '#f0c4a0', hat: 'vk_horns', top: 'bare_belt', legs: '#4e4038', bare: true, beard: '#e8c050' },
    personality: { aggro: 1, bravery: 0, voice: 0.75, chatter: 0.8, cry: 'roar', idle: 'bounce' },
    stagger: 0.7,
    desc: 'Charges in head first and knocks enemies flat.',
  },
  {
    id: 'vk_ice_archer', name: 'Ice Archer', faction: 'viking', cost: 150, hp: 85, speed: 4.4,
    build: { scale: 0.97, girth: 0.98 },
    weapon: { kind: 'ranged', style: 'bow', anim: 'bow', item: 'vk_icebow', proj: 'ice_arrow', speed: 34, arc: 'low', range: 36, minRange: 8, cooldown: 2.1, damage: 34, force: 90, spread: 0.035, releaseAt: 0.78, windup: 1.0 },
    look: { skin: '#f4d2bc', hat: 'vk_fur', top: 'fur', legs: '#5c6a78', quiver: true },
    personality: { aggro: 0.3, bravery: 0.3, voice: 1.15, chatter: 0.5, cry: 'charge', idle: 'shift' },
    desc: 'Frost arrows freeze targets: slower steps, slower swings.',
  },
  {
    id: 'vk_jarl', name: 'Jarl', faction: 'viking', cost: 850, hp: 480, speed: 4.4,
    build: { scale: 1.3, girth: 1.15, head: 1.0, mass: 1.5 },
    weapon: { kind: 'vk_jarl', style: 'shield', anim: 'overhead', item: 'vk_sword', shield: 'round', damage: 52, reach: 1.7, cooldown: 1.5, force: 560, sweep: true, blockMelee: 0.35 },
    look: { skin: '#f0c4a0', hat: 'vk_jarl', top: 'fur', legs: '#4a3e36', beard: '#b8b8b8', cape: true },
    personality: { aggro: 1, bravery: 0, voice: 0.62, chatter: 0.7, cry: 'royal', idle: 'regal' },
    armor: 0.2, stagger: 0.35,
    desc: 'Leaps into battle with a cry that rallies everyone nearby.',
  },
];

// ------------------------------------------------------------------ visuals
function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, wood, darkWood, leather, glow } = H;
  if (name === 'vk_hammer') {
    const L = 0.85 * s;
    mesh(cyl(0.03 * s, 0.034 * s, L, 8), wood(), 0, L / 2, 0, g);
    mesh(cyl(0.04 * s, 0.04 * s, L * 0.2, 8), leather(), 0, L * 0.1, 0, g);
    mesh(box(0.15 * s, 0.17 * s, 0.32 * s), mat('#7d8691', { spec: 0.9 }), 0, L * 0.92, 0, g);
    for (const z of [-0.17, 0.17]) mesh(box(0.17 * s, 0.19 * s, 0.03 * s), metal(), 0, L * 0.92, z * s, g);
    mesh(box(0.155 * s, 0.03 * s, 0.33 * s), tcol(H, team), 0, L * 0.92, 0, g);
    return true;
  }
  if (name === 'vk_sword') {
    const L = 1.4 * s, bw = 0.11 * s;
    mesh(box(0.025 * s, L * 0.78, bw), metal(), 0, L * 0.59, 0, g);
    mesh(cone(bw * 0.72, bw * 1.3, 4), metal(), 0, L * 0.98 + bw * 0.3, 0, g).scale.set(0.2, 1, 1);
    mesh(box(0.03 * s, L * 0.6, bw * 0.25), mat('#9aa3ad', { spec: 0.8 }), 0, L * 0.58, 0, g);
    mesh(box(0.06 * s, 0.05 * s, 0.34 * s), H.gold(), 0, L * 0.2, 0, g);
    mesh(cyl(0.03 * s, 0.03 * s, L * 0.18, 8), leather(), 0, L * 0.1, 0, g);
    mesh(sphere(0.055 * s, 10, 8), H.gold(), 0, 0, 0, g).scale.set(1, 0.7, 1.4);
    return true;
  }
  if (name === 'vk_icebow') {
    const R = 0.7 * s, half = Math.PI * 0.36;
    const tg = H.geo('vkbow' + s.toFixed(3), () => {
      const t = new THREE.TorusGeometry(R, 0.028 * s, 6, 22, half * 2);
      t.rotateZ(-half); t.rotateY(-Math.PI / 2); t.translate(0, 0, -R);
      return t;
    });
    mesh(tg, mat('#e8f4fa', { spec: 0.6 }), 0, 0, 0, g);
    mesh(cyl(0.036 * s, 0.036 * s, 0.16 * s, 8), mat('#3a5a78'), 0, 0, 0, g);
    for (const sd of [-1, 1]) {
      const y = sd * R * Math.sin(half), z = -R * (1 - Math.cos(half));
      const o = mesh(octa(0.07 * s), glow('#9fe8ff'), 0, y, z, g); o.scale.set(0.6, 1.5, 0.6);
    }
    for (const sd of [-1, 1]) mesh(octa(0.04 * s), glow('#9fe8ff'), 0, sd * 0.25 * s, -0.06 * s, g);
    const str = mesh(cyl(0.005 * s, 0.005 * s, 2 * R * Math.sin(half), 3), mat('#f4f4f4'), 0, 0, -R * (1 - Math.cos(half)), g);
    str.castShadow = false;
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'vk_cap': { // spangenhelm with a nose guard
      mesh(dome(H, r * 1.06, 0.5), mat('#8d959e', { spec: 0.9 }), 0, r * 0.4, 0, g).scale.set(1, 0.95, 1);
      headBand(H, r, 0.44, 0.17, leather(), g, 0.08);
      for (const a of [0, Math.PI / 2]) { const b = mesh(torus(H, r * 1.04, r * 0.05, Math.PI, 14), mat('#9b6a3a', { spec: 0.5 }), 0, r * 0.4, 0, g); b.rotation.y = a; }
      mesh(box(r * 0.14, r * 0.55, r * 0.08), metal(), 0, r * 0.16, r * 1.02, g);
      mesh(sphere(r * 0.12, 8, 6), tc, 0, r * 1.42, 0, g);
      return true;
    }
    case 'vk_horns': { // a heavy round helmet with two big forward horns: made for butting
      mesh(dome(H, r * 1.1, 0.55), metal(), 0, r * 0.3, 0, g).scale.set(1, 0.95, 1.02);
      headBand(H, r, 0.36, 0.2, tc, g, 0.12);
      for (const sd of [-1, 1]) {
        mesh(tube(H, 'vkh' + sd + r.toFixed(3), [[sd * 0.85, 0.55, 0], [sd * 1.5, 0.7, 0.3], [sd * 1.65, 1.2, 0.85], [sd * 1.25, 1.55, 1.35]].map((p) => p.map((q) => q * r)), r * 0.3, r * 0.04), mat('#f4ead0', { spec: 0.3 }), 0, 0, 0, g);
        mesh(cyl(r * 0.25, r * 0.25, r * 0.12, 10), gold(), sd * r * 0.98, r * 0.62, 0, g).rotation.z = sd * 1.2;
      }
      for (let i = 0; i < 5; i++) mesh(sphere(r * 0.07, 6, 5), gold(), Math.sin((i - 2) * 0.35) * r * 1.1, r * 0.36, Math.cos((i - 2) * 0.35) * r * 1.1, g);
      return true;
    }
    case 'vk_fur': { // white fur hood with ice crystals
      const fur = mat('#eef2f4', { spec: 0 });
      mesh(hoodGeo(H, r, 1.14, 1.05), fur, 0, r * 0.06, -r * 0.06, g);
      const rim = mesh(torus(H, r * 0.95, r * 0.17, Math.PI * 1.3, 16), fur, 0, r * 0.05, r * 0.28, g);
      rim.rotation.set(0.35, 0, -Math.PI * 0.15); rim.scale.set(1.05, 1.15, 1);
      mesh(cyl(r * 1.0, r * 1.1, r * 0.5, 14), fur, 0, -r * 0.62, -r * 0.2, g);
      headBand(H, r, 0.62, 0.14, tc, g, 0.2);
      for (const [x, y, k] of [[0, 1.25, 1], [-0.35, 1.12, 0.7], [0.35, 1.12, 0.7]]) { const o = mesh(octa(r * 0.18 * k), glow('#9fe8ff'), x * r, y * r, r * 0.2, g); o.scale.set(0.6, 1.6, 0.6); }
      return true;
    }
    case 'vk_jarl': { // winged helmet with a gold band and a team crest
      mesh(dome(H, r * 1.08, 0.5), metal(), 0, r * 0.38, 0, g).scale.set(1, 1.0, 1);
      headBand(H, r, 0.42, 0.2, gold(), g, 0.09);
      mesh(box(r * 0.16, r * 0.5, r * 0.08), gold(), 0, r * 0.18, r * 1.02, g);
      for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) {
        const f = mesh(box(r * 0.06, r * (0.95 - k * 0.15), r * 0.3), mat('#f4f4f0'), sd * r * (1.05 + k * 0.04), r * (0.95 + k * 0.12), -r * (0.1 + k * 0.18), g);
        f.rotation.set(-0.5 - k * 0.15, 0, -sd * (0.35 + k * 0.08));
      }
      for (let i = 0; i < 5; i++) { const p = mesh(sphere(r * 0.2, 8, 6), i % 2 ? td : tc, 0, r * (1.4 + Math.sin(i / 4 * Math.PI) * 0.25), r * (0.35 - i * 0.24), g); p.scale.set(0.5, 1, 1); }
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'viking') return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, mat, gold, leather } = H;
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh;
  if (def.id === 'vk_headbutter') {
    // studded belt and arm rings
    for (const p of [PART.uarmL, PART.uarmR]) mesh(cyl(skel.parts[p].r * 1.2, skel.parts[p].r * 1.2, skel.parts[p].r * 0.5, 10), gold(), 0, skel.parts[p].hh * 0.5, 0, parts[p]);
  }
  if (def.id === 'vk_jarl') {
    // fur mantle and a gold chain
    const fur = mat('#d8c8a8', { spec: 0 });
    const m = mesh(torus(H, r * 0.8, r * 0.3, Math.PI * 2, 16), fur, 0, hh + r * 0.45, -r * 0.05, parts[PART.chest]);
    m.rotation.x = Math.PI / 2;
    for (let k = -3; k <= 3; k++) { const a = k * 0.3; mesh(sphere(r * 0.07, 6, 5), gold(), Math.sin(a) * r * 0.9, hh + r * 0.2 - Math.abs(k) * r * 0.05, Math.cos(a) * r * 0.85, parts[PART.chest]); }
  }
  if (def.id === 'vk_ice_archer') {
    for (const p of [PART.farmL, PART.farmR]) mesh(cyl(skel.parts[p].r * 1.3, skel.parts[p].r * 1.3, skel.parts[p].hh * 0.8, 10), mat('#eef2f4', { spec: 0 }), 0, -skel.parts[p].hh * 0.2, 0, parts[p]);
  }
}

register({
  factions: [{ id: 'viking', name: 'Viking', color: '#5ec8e0' }],
  units,
  items: {
    vk_hammer: { len: 0.85, r: 0.13, grip: 30, heavy: true, metal: true },
    vk_sword: { len: 1.4, r: 0.09, grip: 25, metal: true },
    vk_icebow: { len: 1.4, r: 0.04, grip: 0, center: true },
  },
  kinds: { vk_headbutt: headbutt, vk_jarl: jarl },
  proj: {
    ice_arrow: arrowProj({ onHit(b, v, pr) { addStatus(b, v, 'slow', 4, 0, pr.owner); } }),
  },
  buildProj(type, g, H) {
    if (type !== 'ice_arrow') return false;
    arrowMesh(H, g, '#9fe8ff', '#bfefff', true);
    return true;
  },
  buildItem, buildHat, decorate,
});
