// Shared HUD pieces drawn in arena space (1920x1080). Used by the lobby,
// VERSUS and SURVIVAL. The arena always fits the screen, so nothing here
// needs off-screen indicators.
//
//   text(ctx, str, x, y, opts)                   outlined label
//   drawPortrait(ctx, x, y, r, player|castIndex, {color, dead, ring})
//   drawBanner(ctx, title, sub, k, color)        round intro / round end band (k: 0..1 appear)
//   drawCountdown(ctx, label, t, color)          big centre pop ("3", "GO!")
//   drawPlayerTags(ctx, game, {label})           small P# arrows + held-weapon ammo bars
//                                                (label(sp) -> {text, k} overrides a lobby tag)
//   drawAmmoBar(ctx, spider)                     ammo bar under one spider
//   drawScoreboard(ctx, game, {compact|big, highlight, stats, title})
//   drawPanel(ctx, x, y, w, h, {r, fill, stroke, accent})

import { W, H } from './board.js';
import { FONT, TAU, rgba, clamp } from './util.js';
import { castAt, drawBody } from './cast.js';
import { settings } from './settings.js';

export function text(ctx, str, x, y, { size = 32, color = '#fff', align = 'center', weight = 700, stroke = 'rgba(0,0,0,0.6)', sw = 6, baseline = 'alphabetic', maxWidth } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = sw; ctx.strokeStyle = stroke; ctx.strokeText(str, x, y, maxWidth); }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y, maxWidth);
  ctx.textBaseline = 'alphabetic';
}

const easeOutBack = (t) => { const c = 1.7; t = clamp(t, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export function drawPanel(ctx, x, y, w, h, { r = 22, fill = 'rgba(10,10,28,0.78)', stroke = 'rgba(255,255,255,0.12)', accent = null, lw = 3 } = {}) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.roundRect(x + 4, y + 8, w, h, r); ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  if (accent) {
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(accent, 0.28)); g.addColorStop(0.5, rgba(accent, 0.05)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (stroke) { ctx.strokeStyle = accent ? rgba(accent, 0.7) : stroke; ctx.lineWidth = lw; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke(); }
  ctx.restore();
}

// a character in a coloured medallion
export function drawPortrait(ctx, x, y, r, who, { color, dead = false, ring = true, facing = 1 } = {}) {
  const castIndex = typeof who === 'number' ? who : who.castIndex;
  const col = color || (typeof who === 'object' && who.color ? who.color.main : '#8890b0');
  ctx.save();
  const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0.15));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (ring) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, r * 0.12); ctx.stroke(); }
  if (dead) ctx.filter = 'grayscale(1) brightness(0.6)';
  drawBody(ctx, x, y + r * 0.04, r * 0.78, castIndex, { facing });
  ctx.filter = 'none';
  if (dead) {
    ctx.strokeStyle = 'rgba(255,80,100,0.9)'; ctx.lineWidth = r * 0.14; ctx.lineCap = 'round';
    const k = r * 0.45;
    ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
  }
  ctx.restore();
}

// round banner: a slanted band that slides in. k: 0..1 appearance.
export function drawBanner(ctx, title, sub = '', k = 1, color = '#fff', { y = 210 } = {}) {
  if (k <= 0) return;
  ctx.save();
  const e = easeOut(k);
  const bandH = sub ? 160 : 120;
  ctx.globalAlpha = Math.min(1, k * 1.5);
  // band
  ctx.save();
  ctx.translate((1 - e) * -W * 0.6, 0);
  ctx.beginPath();
  ctx.moveTo(0, y - bandH / 2 - 12); ctx.lineTo(W, y - bandH / 2 + 12);
  ctx.lineTo(W, y + bandH / 2 + 12); ctx.lineTo(0, y + bandH / 2 - 12); ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(8,6,22,0)'); g.addColorStop(0.18, 'rgba(8,6,22,0.82)'); g.addColorStop(0.82, 'rgba(8,6,22,0.82)'); g.addColorStop(1, 'rgba(8,6,22,0)');
  ctx.fillStyle = g; ctx.fill();
  // accent stripes
  const sg = ctx.createLinearGradient(0, 0, W, 0);
  sg.addColorStop(0, rgba(color, 0)); sg.addColorStop(0.3, rgba(color, 0.9)); sg.addColorStop(0.7, rgba(color, 0.9)); sg.addColorStop(1, rgba(color, 0));
  ctx.strokeStyle = sg; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, y - bandH / 2 - 12); ctx.lineTo(W, y - bandH / 2 + 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, y + bandH / 2 - 12); ctx.lineTo(W, y + bandH / 2 + 12); ctx.stroke();
  ctx.restore();
  // title pops in slightly after the band
  const s = easeOutBack(k * 1.3 - 0.15);
  ctx.save();
  ctx.translate(W / 2, y + (sub ? -6 : 22));
  ctx.scale(s, s);
  ctx.rotate(-0.012);
  text(ctx, title, 0, 0, { size: 78, color, sw: 12, stroke: 'rgba(5,3,16,0.85)', maxWidth: W - 160 });
  ctx.restore();
  if (sub) text(ctx, sub, W / 2, y + 52, { size: 30, color: '#e4e8ff', sw: 6, maxWidth: W - 200 });
  ctx.restore();
}

// big centre pop: t is seconds since it appeared
export function drawCountdown(ctx, label, t, color = '#fff') {
  if (t > 0.9) return;
  const s = easeOutBack(t * 4) * (1 + Math.max(0, t - 0.5) * 0.6);
  ctx.save();
  ctx.globalAlpha = 1 - clamp((t - 0.55) / 0.35, 0, 1);
  ctx.translate(W / 2, H / 2 + 50);
  ctx.scale(s, s);
  text(ctx, label, 0, 0, { size: 170, color, sw: 18, stroke: 'rgba(5,3,16,0.85)' });
  ctx.restore();
}

// ammo bar under a spider that holds a weapon with finite ammo
export function drawAmmoBar(ctx, sp) {
  const w = sp.weapon;
  if (!w || !Number.isFinite(w.maxAmmo) || !(w.maxAmmo > 0) || !Number.isFinite(w.ammo)) return;
  const frac = clamp(w.ammo / w.maxAmmo, 0, 1);
  // sized to the spider (they are small): a thin strip just under the body
  const bw = clamp(sp.r * 2, 30, 44), bh = 5;
  const x = sp.x - bw / 2, y = sp.y + sp.r + 9;
  ctx.save();
  ctx.fillStyle = 'rgba(5,5,15,0.7)';
  ctx.beginPath(); ctx.roundRect(x - 2, y - 2, bw + 4, bh + 4, 4); ctx.fill();
  const low = frac <= 0.25;
  const col = low && Math.floor(sp.game.time * 6) % 2 ? '#ff5a6a' : (w.color || '#ffd23f');
  if (w.maxAmmo <= 12) {
    // one pip per shot
    const n = w.maxAmmo, gap = 2, pw = (bw - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < w.ammo ? col : 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.roundRect(x + i * (pw + gap), y, pw, bh, 2); ctx.fill();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 3); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(x, y, Math.max(2, bw * frac), bh, 3); ctx.fill();
  }
  ctx.restore();
}

// P# arrows over spiders (after spawning, and always in the lobby) + ammo bars.
// Kept small: the tag is the only thing drawn next to a spider in play.
export function drawPlayerTags(ctx, game, { label } = {}) {
  for (const sp of game.spiders) {
    if (!sp.alive) continue;
    if (sp.weapon) drawAmmoBar(ctx, sp);
    if (!sp.player) continue;
    const show = sp.invuln > 0 || game.sceneName === 'lobby';
    if (!show) continue;
    const bob = Math.sin(game.realTime * 5 + sp.slot) * 2;
    ctx.fillStyle = sp.color.main;
    if (game.sceneName === 'lobby') {
      const y = sp.y - sp.r - 18 + bob;
      ctx.beginPath(); ctx.moveTo(sp.x - 6, y); ctx.lineTo(sp.x + 6, y); ctx.lineTo(sp.x, y + 7); ctx.fill();
      const tag = `P${sp.player.slot + 1}`;
      const l = label && label(sp);
      if (l && l.k > 0.4) {
        // the name tag replaces the plain tag for a moment (join / character change)
        ctx.save();
        ctx.globalAlpha = l.k;
        text(ctx, l.text, sp.x, y - 4, { size: 15, color: '#fff', sw: 4, stroke: rgba(sp.color.main, 0.9) });
        ctx.restore();
      } else text(ctx, tag, sp.x, y - 4, { size: 16, color: sp.color.main, sw: 4, stroke: 'rgba(5,3,16,0.8)' });
    } else {
      // matches: under the spider (pickup labels pop up above it at spawn)
      const y = sp.y + sp.r + (sp.weapon ? 20 : 10) - bob;
      ctx.beginPath(); ctx.moveTo(sp.x - 6, y + 7); ctx.lineTo(sp.x + 6, y + 7); ctx.lineTo(sp.x, y); ctx.fill();
      text(ctx, `P${sp.player.slot + 1}`, sp.x, y + 23, { size: 16, color: sp.color.main, sw: 4, stroke: 'rgba(5,3,16,0.8)' });
    }
  }
}

// pip row for a score
function pips(ctx, x, y, n, filled, color, { r = 5, gap = 14 } = {}) {
  if (n > 10) {
    // long matches (15 / 20 rounds): a score readout instead of a pip row
    text(ctx, `${filled} / ${n}`, x - r, y + r * 1.1, { size: Math.round(r * 3.2), align: 'left', color, sw: Math.max(3, r * 0.7) });
    return;
  }
  for (let k = 0; k < n; k++) {
    const on = k < filled;
    ctx.beginPath(); ctx.arc(x + k * gap, y, r, 0, TAU);
    ctx.fillStyle = on ? color : 'rgba(255,255,255,0.16)';
    ctx.fill();
    if (on) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
}

export function drawScoreboard(ctx, game, { compact = false, big = false, highlight = null, stats = false, title = '', scoreOf = (p) => p.score, target = settings.winScore } = {}) {
  const ps = game.players;
  if (!ps.length) return;
  if (compact) {
    // one pill per player along the top edge
    const n = ps.length;
    const pipGap = target > 7 ? 11 : 14;
    const pillW = target > 10 ? 150 : Math.min(230, 70 + target * pipGap + 16);
    const gap = 10;
    const total = n * pillW + (n - 1) * gap;
    const x0 = W / 2 - total / 2;
    ps.forEach((p, i) => {
      const x = x0 + i * (pillW + gap);
      const alive = p.spider && p.spider.alive;
      ctx.save();
      ctx.globalAlpha = alive ? 1 : 0.55;
      ctx.fillStyle = 'rgba(8,6,22,0.72)';
      ctx.beginPath(); ctx.roundRect(x, 12, pillW, 46, 23); ctx.fill();
      ctx.strokeStyle = rgba(p.color.main, alive ? 0.9 : 0.4); ctx.lineWidth = 2.5; ctx.stroke();
      drawPortrait(ctx, x + 23, 35, 19, p, { dead: !alive });
      text(ctx, `P${p.slot + 1}`, x + 52, 31, { size: 15, color: p.color.main, sw: 3, align: 'left' });
      pips(ctx, x + 58, 45, target, scoreOf(p), p.color.main, { r: target > 7 ? 4 : 5, gap: pipGap });
      ctx.restore();
    });
    return;
  }
  if (big) {
    const sorted = ps.slice().sort((a, b) => scoreOf(b) - scoreOf(a) || b.kills - a.kills);
    const rowH = Math.min(70, 520 / sorted.length);
    const bw = 900;
    const head = title ? 64 : 18;
    const bh = sorted.length * rowH + head + 24;
    const x0 = W / 2 - bw / 2;
    const y0 = Math.max(330, H / 2 + 40 - bh / 2);
    drawPanel(ctx, x0, y0, bw, bh, { r: 26, fill: 'rgba(10,8,26,0.84)' });
    if (title) text(ctx, title, W / 2, y0 + 46, { size: 30, color: '#cfd6ff', sw: 0, stroke: null });
    const r = Math.min(26, rowH * 0.38);
    sorted.forEach((p, i) => {
      const y = y0 + head + i * rowH + rowH / 2 + 4;
      const top = i === 0 && scoreOf(p) > 0;
      if (p === highlight) {
        ctx.fillStyle = rgba(p.color.main, 0.22);
        ctx.beginPath(); ctx.roundRect(x0 + 12, y - rowH / 2 + 3, bw - 24, rowH - 6, 16); ctx.fill();
      }
      text(ctx, `${i + 1}`, x0 + 46, y + 10, { size: 26, color: top ? '#ffd23f' : '#9aa0c8', stroke: null });
      drawPortrait(ctx, x0 + 104, y, r, p, { dead: false });
      if (top) drawCrown(ctx, x0 + 104, y - r - 4, r * 0.7);
      text(ctx, castAt(p.castIndex).name, x0 + 104 + r + 18, y + 4, { size: Math.min(30, rowH * 0.45), align: 'left', color: p.color.main, sw: 5 });
      text(ctx, `P${p.slot + 1}`, x0 + 104 + r + 18, y + 24, { size: 15, align: 'left', color: '#9aa0c8', stroke: null });
      const pg = target > 7 ? 24 : 32;
      pips(ctx, W / 2 + 10, y, target, scoreOf(p), p.color.main, { r: target > 7 ? 8 : 10, gap: pg });
      if (stats) text(ctx, `${p.kills} KO · ${p.deaths} falls`, x0 + bw - 34, y + 9, { size: 22, align: 'right', color: '#cfd6ff', stroke: null });
    });
  }
}

export function drawCrown(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = '#7a4e00'; ctx.lineWidth = Math.max(1.5, s * 0.12); ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-s, 0); ctx.lineTo(-s, -s * 0.8); ctx.lineTo(-s * 0.45, -s * 0.3); ctx.lineTo(0, -s); ctx.lineTo(s * 0.45, -s * 0.3); ctx.lineTo(s, -s * 0.8); ctx.lineTo(s, 0); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
