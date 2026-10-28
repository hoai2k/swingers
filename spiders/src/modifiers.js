// Match modifiers: optional mutators switched on in Settings > Modifiers
// (settings.mods = { id: true }). All are off by default.
//
// API (VS uses all three; survival may too):
//   activeMods()                 -> [modifier defs] switched on
//   applyRoundMods(game)         after game.loadBoard(): sets game.mods
//                                (boomMul, bladeExtra, infiniteAmmo, vacuum, bladesOnly)
//   applySpiderMods(game, sp)    after a spider spawns: speed, jump, gravity,
//                                size, web range, shield
//   tickMods(game, dt)           every step while playing (after the spiders
//                                moved): infinite ammo, vacuum, thick blades
//   drawMods(ctx, game)          world space: the thick-blade glow
//   drawModCards(ctx, mods, x, y, {alpha, size})   the round-intro cards
//   drawModIcon(ctx, id, x, y, s, color)

import { settings } from './settings.js';
import { closestOnSeg, segSegDist, TAU, rgba, pick } from './util.js';
import { text } from './hud.js';
import { preloadSprites, drawSprite } from './sprites.js';
import './pool.js';

export const MODIFIERS = [
  { id: 'scuttle', name: 'Scuttle Rush', desc: 'Legs move 40% faster', color: '#4fdc6a', spider: (sp) => { sp.speedMul *= 1.4; } },
  { id: 'pogo', name: 'Pogo Legs', desc: 'Jumps 30% stronger', color: '#ffd23f', spider: (sp) => { sp.jumpMul *= 1.3; } },
  { id: 'floaty', name: 'Featherfall', desc: 'Low gravity', color: '#9fd8ff', spider: (sp) => { sp.gravMul *= 0.55; } },
  { id: 'heavy', name: 'Lead Belly', desc: 'High gravity', color: '#b08cff', spider: (sp) => { sp.gravMul *= 1.45; } },
  { id: 'thick', name: 'Fat Plasma', desc: 'Blades hit and clash much wider', color: '#ff5a8a', round: (m) => { m.bladeExtra = 14; } },
  { id: 'booms', name: 'Big Booms', desc: 'Explosions 50% bigger', color: '#ff9a3c', round: (m) => { m.boomMul = 1.5; } },
  { id: 'bubble', name: 'Bubble Wrap', desc: 'Everyone starts with a 1-hit shield', color: '#7fe8ff', spider: (sp) => { sp.shield = Math.max(sp.shield, 1); } },
  { id: 'tiny', name: 'Pocket Size', desc: 'Tiny spiders', color: '#c8ff6a', size: 0.62 },
  { id: 'giant', name: 'Colossal', desc: 'Giant spiders', color: '#ff7a5a', size: 1.55 },
  { id: 'silk', name: 'Endless Silk', desc: 'Webs reach 60% farther', color: '#f4f7ff', spider: (sp) => { sp.webMul = (sp.webMul || 1) * 1.6; } },
  { id: 'ammo', name: 'Bottomless', desc: 'Weapons never run dry', color: '#ffe08a', round: (m) => { m.infiniteAmmo = true; } },
  { id: 'bladesOnly', name: 'Blade Dance', desc: 'Only melee weapons drop', color: '#ff46c8', round: (m) => { m.bladesOnly = true; } },
  { id: 'vacuum', name: 'Magnet Mode', desc: 'Weapons drift toward the nearest spider', color: '#6ab0ff', round: (m) => { m.vacuum = true; } },
];
export const MOD_BY_ID = new Map(MODIFIERS.map((m) => [m.id, m]));
// full-colour card art (assets/web/mod_<id>.png); drawModIcon() stays the fallback
preloadSprites(MODIFIERS.map((m) => `mod_${m.id}.png`));

export function activeMods() {
  const on = settings.mods || {};
  return MODIFIERS.filter((m) => on[m.id]);
}

export function applyRoundMods(game) {
  const mods = activeMods();
  const m = { list: mods.map((d) => d.id) };
  for (const d of mods) if (d.round) d.round(m);
  game.mods = m;
  return mods;
}

export function applySpiderMods(game, sp) {
  const on = (game.mods && game.mods.list) || [];
  const sizes = [];
  for (const id of on) {
    const d = MOD_BY_ID.get(id);
    if (!d) continue;
    if (d.spider) d.spider(sp);
    if (d.size) sizes.push(d.size);
  }
  // tiny + giant together: each spider rolls one of them
  if (sizes.length) sp.setSize(sizes.length > 1 ? pick(sizes) : sizes[0]);
}

export function tickMods(game, dt) {
  const m = game.mods;
  if (!m || !m.list || !m.list.length) return;
  if (m.infiniteAmmo) {
    for (const sp of game.spiders) {
      const w = sp.alive && sp.weapon;
      if (w && Number.isFinite(w.maxAmmo) && w.maxAmmo > 0) w.ammo = w.maxAmmo;
    }
  }
  if (m.vacuum) vacuum(game, dt);
  if (m.bladeExtra) thickBlades(game, m.bladeExtra);
}

// loose weapons drift to the nearest spider (not back to the one that dropped it)
function vacuum(game, dt) {
  for (const p of game.pickups) {
    if (!p.canTake || p.stuck || p.thrown || p.mode || p.yankedBy) continue;
    let best = null, bd = 900;
    for (const sp of game.spiders) {
      if (!sp.alive || sp.weapon || (p.from === sp && p.age < 2)) continue;
      const d = Math.hypot(sp.x - p.x, sp.y - p.y);
      if (d < bd) { bd = d; best = sp; }
    }
    if (!best) continue;
    const dx = best.x - p.x, dy = best.y - p.y, d = Math.hypot(dx, dy) || 1;
    const a = 1500 + (900 - d);
    p.vx += dx / d * a * dt;
    p.vy += dy / d * a * dt - 1200 * dt;    // mostly cancels gravity
    const v = Math.hypot(p.vx, p.vy);
    if (v > 520) { p.vx *= 520 / v; p.vy *= 520 / v; }
  }
}

// wider plasma: anything within `extra` of a live blade is cut, and blades
// that come within `extra` of each other clash (the saber's own check
// covers the thin core)
function thickBlades(game, extra) {
  const blades = game.nextBlades.length ? game.nextBlades : game.blades;
  for (const b of blades) {
    const owner = b.owner;
    if (!b.weapon || (owner && !owner.alive)) continue;
    for (const a of game.actors()) {
      if (a === owner || !a.alive) continue;
      const c = closestOnSeg(a.x, a.y, b.x1, b.y1, b.x2, b.y2);
      if (Math.hypot(a.x - c.x, a.y - c.y) < a.r + 3 + extra) {
        const dx = a.x - (owner ? owner.x : c.x), dy = a.y - (owner ? owner.y : c.y), m = Math.hypot(dx, dy) || 1;
        if (game.damage(a, { amount: 3, from: owner, cause: 'saber', x: c.x, y: c.y, ix: dx / m * 500, iy: dy / m * 500, weapon: b.weapon, melee: true })) {
          game.fx.burst(c.x, c.y, { n: 14, speed: 500, color: b.weapon.bladeColor || '#ff5a8a', life: 0.3 });
        }
      }
    }
  }
  for (let i = 0; i < blades.length; i++) {
    const a = blades[i];
    if (!a.weapon || !a.weapon.clash || a.weapon.clashCool > 0) continue;
    for (let j = i + 1; j < blades.length; j++) {
      const b = blades[j];
      if (b.weapon === a.weapon || b.owner === a.owner || (b.weapon && b.weapon.clashCool > 0)) continue;
      if (segSegDist(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2) < 7 + extra * 2) { a.weapon.clash(b, a); break; }
    }
  }
}

export function drawMods(ctx, game) {
  const m = game.mods;
  if (!m || !m.bladeExtra) return;
  const blades = game.nextBlades.length ? game.nextBlades : game.blades;
  if (!blades.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of blades) {
    const col = (b.weapon && b.weapon.bladeColor) || '#ff5a8a';
    ctx.strokeStyle = rgba(col.startsWith('#') ? col : '#ff5a8a', 0.22);
    ctx.lineWidth = m.bladeExtra * 2 + 6;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
  }
  ctx.restore();
}

// ---- intro cards -------------------------------------------------------------
export function drawModCards(ctx, mods, cx, y, { alpha = 1, w = 150, h = 112, extra = [] } = {}) {
  const cards = [...extra, ...mods.map((d) => ({ id: d.id, name: d.name, color: d.color }))];
  if (!cards.length || alpha <= 0) return;
  const gap = 12;
  const perRow = Math.min(cards.length, 8);
  ctx.save();
  ctx.globalAlpha = alpha;
  cards.forEach((c, k) => {
    const row = Math.floor(k / perRow), col = k % perRow;
    const n = Math.min(perRow, cards.length - row * perRow);
    const x = cx - (n * w + (n - 1) * gap) / 2 + col * (w + gap);
    const yy = y + row * (h + gap);
    ctx.fillStyle = 'rgba(10,8,28,0.86)';
    ctx.beginPath(); ctx.roundRect(x, yy, w, h, 16); ctx.fill();
    ctx.strokeStyle = rgba(c.color, 0.85); ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = rgba(c.color, 0.16);
    ctx.beginPath(); ctx.roundRect(x, yy, w, 64, [16, 16, 0, 0]); ctx.fill();
    if (!(MOD_BY_ID.has(c.id) && drawSprite(ctx, `mod_${c.id}.png`, x + w / 2, yy + 34, 56))) drawModIcon(ctx, c.id, x + w / 2, yy + 34, 22, c.color);
    text(ctx, c.name, x + w / 2, yy + 92, { size: 19, color: '#fff', sw: 4, maxWidth: w - 12 });
  });
  ctx.restore();
}

// simple vector glyphs, s ~ half size
export function drawModIcon(ctx, id, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (pts) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a * s, b * s) : ctx.moveTo(a * s, b * s))); ctx.stroke(); };
  const circ = (a, b, r, fill) => { ctx.beginPath(); ctx.arc(a * s, b * s, r * s, 0, TAU); fill ? ctx.fill() : ctx.stroke(); };
  switch (id) {
    case 'scuttle': line([[-0.9, -0.6], [-0.3, 0], [-0.9, 0.6]]); line([[-0.2, -0.6], [0.4, 0], [-0.2, 0.6]]); line([[0.5, -0.6], [1.0, 0], [0.5, 0.6]]); break;
    case 'pogo': line([[0, 0.2], [0, -0.9]]); line([[-0.45, -0.45], [0, -0.9], [0.45, -0.45]]); line([[-0.5, 0.9], [0.5, 0.75], [-0.5, 0.6], [0.5, 0.45], [-0.5, 0.3]]); break;
    case 'floaty': circ(0, 0.4, 0.38); circ(-0.55, -0.35, 0.22); circ(0.5, -0.6, 0.16); break;
    case 'heavy': ctx.beginPath(); ctx.moveTo(-0.45 * s, -0.35 * s); ctx.lineTo(0.45 * s, -0.35 * s); ctx.lineTo(0.75 * s, 0.75 * s); ctx.lineTo(-0.75 * s, 0.75 * s); ctx.closePath(); ctx.fill(); circ(0, -0.6, 0.25); break;
    case 'thick': ctx.globalAlpha *= 0.35; ctx.lineWidth = s * 0.7; line([[-0.8, 0.8], [0.8, -0.8]]); ctx.globalAlpha /= 0.35; ctx.lineWidth = s * 0.2; ctx.strokeStyle = '#fff'; line([[-0.8, 0.8], [0.8, -0.8]]); break;
    case 'booms': { ctx.beginPath(); for (let k = 0; k < 16; k++) { const r = (k % 2 ? 0.45 : 1) * s, a = k / 16 * TAU; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break; }
    case 'bubble': circ(0, 0, 0.9); ctx.globalAlpha *= 0.5; circ(0, 0, 0.55, true); ctx.globalAlpha /= 0.5; circ(-0.35, -0.4, 0.12, true); break;
    case 'tiny': circ(0, 0, 0.3, true); line([[-1, 0], [-0.55, 0]]); line([[1, 0], [0.55, 0]]); line([[-0.75, -0.2], [-0.55, 0], [-0.75, 0.2]]); line([[0.75, -0.2], [0.55, 0], [0.75, 0.2]]); break;
    case 'giant': circ(0, 0, 0.6, true); line([[-0.75, -0.75], [-1, -1]]); line([[0.75, -0.75], [1, -1]]); line([[-0.75, 0.75], [-1, 1]]); line([[0.75, 0.75], [1, 1]]); break;
    case 'silk': ctx.setLineDash([s * 0.2, s * 0.15]); line([[-0.9, 0.9], [0.8, -0.8]]); ctx.setLineDash([]); circ(0.8, -0.8, 0.18, true); circ(-0.9, 0.9, 0.22, true); break;
    case 'ammo': ctx.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * TAU, d = 1 + Math.sin(a) ** 2; ctx.lineTo(Math.cos(a) / d * s * 0.95, Math.sin(a) * Math.cos(a) / d * s * 0.95); } ctx.stroke(); break;
    case 'bladesOnly': line([[-0.8, 0.8], [0.8, -0.8]]); line([[0.8, 0.8], [-0.8, -0.8]]); line([[-0.75, 0.35], [-0.35, 0.75]]); line([[0.75, 0.35], [0.35, 0.75]]); break;
    case 'vacuum': ctx.lineWidth = s * 0.32; ctx.beginPath(); ctx.arc(0, -0.05 * s, 0.55 * s, Math.PI, 0, true); ctx.stroke(); ctx.lineWidth = s * 0.32; ctx.strokeStyle = '#fff'; line([[-0.55, -0.1], [-0.55, -0.55]]); line([[0.55, -0.1], [0.55, -0.55]]); break;
    case 'squeeze': ctx.strokeRect(-0.9 * s, -0.7 * s, 1.8 * s, 1.4 * s); line([[-0.6, 0], [-0.25, 0]]); line([[0.6, 0], [0.25, 0]]); line([[-0.4, -0.15], [-0.25, 0], [-0.4, 0.15]]); line([[0.4, -0.15], [0.25, 0], [0.4, 0.15]]); break;
    case 'pool': line([[-0.7, 0.7], [0.4, -0.4]]); circ(0.55, -0.55, 0.25, true); ctx.strokeRect(-0.95 * s, -0.95 * s, 1.9 * s, 1.9 * s); break;
    default: circ(0, 0, 0.6);
  }
  ctx.restore();
}
