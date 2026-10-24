// Shared HUD pieces drawn in arena space (1920x1080).

import { W, H } from './board.js';
import { FONT, TAU, rgba } from './util.js';
import { castAt, drawBody } from './cast.js';
import { settings } from './settings.js';

export function text(ctx, str, x, y, { size = 32, color = '#fff', align = 'center', weight = 700, stroke = 'rgba(0,0,0,0.6)', sw = 6, baseline = 'alphabetic' } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = sw; ctx.strokeStyle = stroke; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.textBaseline = 'alphabetic';
}

export function drawBanner(ctx, title, sub = '', k = 1, color = '#fff') {
  ctx.save();
  ctx.globalAlpha = k;
  const y = 200;
  ctx.fillStyle = 'rgba(5,8,20,0.55)';
  ctx.fillRect(0, y - 80, W, sub ? 150 : 110);
  text(ctx, title, W / 2, y, { size: 68, color });
  if (sub) text(ctx, sub, W / 2, y + 52, { size: 30, color: '#dfe6ff' });
  ctx.restore();
}

// little name arrows over spiders (brief after spawning, always for weapon labels)
export function drawPlayerTags(ctx, game) {
  for (const sp of game.spiders) {
    if (!sp.alive || !sp.player) continue;
    const show = sp.invuln > 0 || game.sceneName === 'lobby';
    if (!show) continue;
    const y = sp.y - sp.r - 26;
    ctx.fillStyle = sp.color.main;
    ctx.beginPath(); ctx.moveTo(sp.x - 7, y); ctx.lineTo(sp.x + 7, y); ctx.lineTo(sp.x, y + 9); ctx.fill();
    text(ctx, `P${sp.player.slot + 1}`, sp.x, y - 4, { size: 18, color: sp.color.main, sw: 4 });
  }
}

export function drawScoreboard(ctx, game, { compact = false, big = false, highlight = null, stats = false } = {}) {
  const ps = game.players;
  if (!ps.length) return;
  if (compact) {
    // pips along the top
    const w = 150;
    const x0 = W / 2 - (ps.length * w) / 2;
    ps.forEach((p, i) => {
      const x = x0 + i * w + w / 2;
      const alive = p.spider && p.spider.alive;
      ctx.globalAlpha = alive ? 1 : 0.4;
      drawBody(ctx, x - 40, 34, 16, p.castIndex, {});
      for (let k = 0; k < settings.winScore; k++) {
        ctx.fillStyle = k < p.score ? p.color.main : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(x - 14 + k * 14, 34, 5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    return;
  }
  if (big) {
    const rowH = 64;
    const y0 = 360;
    const bw = 760;
    ctx.fillStyle = 'rgba(5,8,20,0.7)';
    ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, y0 - 20, bw, ps.length * rowH + 30, 24); ctx.fill();
    const sorted = ps.slice().sort((a, b) => b.score - a.score || b.kills - a.kills);
    sorted.forEach((p, i) => {
      const y = y0 + i * rowH + 30;
      if (p === highlight) { ctx.fillStyle = rgba(p.color.main, 0.25); ctx.fillRect(W / 2 - bw / 2 + 10, y - 30, bw - 20, rowH - 6); }
      drawBody(ctx, W / 2 - bw / 2 + 50, y, 22, p.castIndex, {});
      text(ctx, castAt(p.castIndex).name, W / 2 - bw / 2 + 90, y + 10, { size: 30, align: 'left', color: p.color.main });
      for (let k = 0; k < settings.winScore; k++) {
        ctx.fillStyle = k < p.score ? p.color.main : 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(W / 2 + 20 + k * 30, y, 10, 0, TAU); ctx.fill();
      }
      if (stats) text(ctx, `${p.kills} kills`, W / 2 + bw / 2 - 30, y + 10, { size: 24, align: 'right', color: '#cfd6ff' });
    });
  }
}
