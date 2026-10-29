// Power-up cards ("perks"): the list, and the card picker shown between
// survival waves (one shared team pick) and between VS rounds (one pick per
// spider, kept for the match).
//
// A perk: { id, name, desc, max, color, apply(sp, n), take(p, n, mode),
//   excl (can't hold both), vs (also offered in VS) }.
// apply sets spider fields on every spawn; take runs once when picked.

import { clamp, rgba, TAU } from './util.js';
import { W, H } from './board.js';
import { sfx } from './audio.js';
import { text, drawPanel, drawPortrait } from './hud.js';
import { preloadSprites, drawSprite, sprite } from './sprites.js';

// a spider field's value before perks touched it (modifiers may have set it)
export function base(sp, k) { sp.perkBase = sp.perkBase || {}; if (!(k in sp.perkBase)) sp.perkBase[k] = sp[k] || 1; return sp.perkBase[k]; }

// Perks: stackable up to max. apply(sp, n) sets spider fields on every spawn;
// take(p, n, mode) runs once when picked.
// modes: which game modes offer it ('survival' if not given)
export const PERKS = [
  { id: 'shell',  name: 'Hard Shell',   desc: '+1 shield charge, refilled every wave / round', max: 3, color: '#7fe8ff', apply: (sp, n) => { sp.shield = Math.max(sp.shield, n); } , vs: true },
  { id: 'legs',   name: 'Quick Legs',   desc: 'Walk 20% faster',                 max: 3, color: '#4fdc6a', apply: (sp, n) => { sp.speedMul = base(sp, 'speedMul') * (1 + 0.2 * n); } , vs: true },
  { id: 'spring', name: 'Spring Legs',  desc: 'Jump 15% higher',                 max: 3, color: '#ffd23f', apply: (sp, n) => { sp.jumpMul = base(sp, 'jumpMul') * (1 + 0.15 * n); } , vs: true },
  { id: 'silk',   name: 'Long Silk',    desc: 'Webs reach 35% farther',          max: 2, color: '#f4f7ff', apply: (sp, n) => { sp.webMul = base(sp, 'webMul') * (1 + 0.35 * n); } , vs: true },
  { id: 'venom',  name: 'Venom Fangs',  desc: 'Deal double damage to insects',   max: 2, color: '#b46bff', apply: (sp, n) => { sp.dmgMul = 1 + n; } },
  { id: 'saber',  name: 'Born Duelist', desc: 'Start every wave / round holding a saber', max: 1, color: '#4dd2ff', excl: 'armory' , vs: true },
  { id: 'armory', name: 'Armory',       desc: 'Start every wave / round with a random gun', max: 1, color: '#ff5a5a', excl: 'saber' , vs: true },
  { id: 'boom',   name: 'Last Laugh',   desc: 'Explode when you die',            max: 1, color: '#ff9a3c' },
  { id: 'wind',   name: 'Second Wind',  desc: 'Once per stage, a team wipe costs no life', max: 1, color: '#ff7ad9' },
  { id: 'heart',  name: 'Spare Heart',  desc: '+1 max life, and a life right now', max: 2, color: '#ff4f6d', take: (p, n, mode) => { p.lives = Math.min(mode.maxLives(p), (p.lives || 0) + 1); } },
  { id: 'aegis',  name: 'Last Stand',   desc: 'Shielded whenever the team is on its last life', max: 1, color: '#9fd0ff', apply: (sp) => { if (sp.player && sp.player.lives <= 1) sp.shield = Math.max(sp.shield, 1 + ((sp.player.perks || {}).shell || 0)); } },
  { id: 'focus',  name: 'Blade Focus',  desc: 'Blade kills slow time for a heartbeat', max: 1, color: '#6ae0ff' },
  { id: 'blast',  name: 'Big Bang',     desc: 'Your explosions are 40% bigger',  max: 2, color: '#ffb347', apply: (sp, n) => { sp.blastMul = 1 + 0.4 * n; } , vs: true },
  { id: 'lull',   name: 'Lullaby Silk', desc: 'Team-wide: insects arrive 25% slower', max: 2, color: '#9effc8' },
  { id: 'air',    name: 'Glider Hairs', desc: 'Steer 35% harder in the air',     max: 2, color: '#a8f0ff', apply: (sp, n) => { sp.airMul = base(sp, 'airMul') * (1 + 0.35 * n); } , vs: true },
  { id: 'pull',   name: 'Steel Silk',   desc: 'Webs pull you 25% harder',        max: 2, color: '#e8e8ff', apply: (sp, n) => { sp.pullMul = base(sp, 'pullMul') * (1 + 0.25 * n); } , vs: true },
];

// full-colour card art (assets/web/perk_<id>.png); perkIcon() stays the fallback
preloadSprites(PERKS.map((P) => `perk_${P.id}.png`));
const perkArt = (ctx, id, x, y, size) => drawSprite(ctx, `perk_${id}.png`, x, y, size);

// up to 3 random perks a holder can still take (pool: a PERKS subset)
export function offersFor(perks, pool) {
  const left = pool.filter((P) => (perks[P.id] || 0) < P.max && !(P.excl && perks[P.excl]));
  const out = [];
  while (out.length < 3 && left.length) out.push(left.splice(Math.floor(Math.random() * left.length), 1)[0]);
  return out;
}

// The card picker. rows: [{ p (a player) | shared: true, offers }]. A shared
// row answers every player's stick / d-pad and A. update() returns true once
// everyone has picked (or after 25 s).
export class PerkPicker {
  constructor(game, rows, { onChoose } = {}) {
    this.game = game;
    this.rows = rows.map((r) => ({ ...r, sel: Math.min(1, r.offers.length - 1), done: !r.offers.length, lx: {} }));
    this.onChoose = onChoose;
    this.t = 0;
    this.doneT = 0;
  }

  update(dt) {
    this.t += dt;
    const game = this.game;
    for (const r of this.rows) {
      if (r.done) continue;
      const ids = r.shared ? game.players.map((p) => p.inputId) : [r.p.inputId];
      for (const id of ids) {
        const s = game.input.get(id);
        if (!s) continue;
        let dir = 0;
        const x = s.l.x, lx = r.lx[id] || 0;
        if (Math.abs(x) > 0.5 && Math.abs(lx) <= 0.5) dir = Math.sign(x);
        r.lx[id] = x;
        if (s.pressed.dl) dir = -1;
        if (s.pressed.dr) dir = 1;
        if (dir) { r.sel = clamp(r.sel + dir, 0, r.offers.length - 1); sfx.ui(); }
        if (this.t > 0.6 && (s.pressed.a || s.pressed.rt)) { this.choose(r); break; }
      }
    }
    if (this.t > 25) for (const r of this.rows) if (!r.done) this.choose(r);
    if (this.rows.every((r) => r.done)) { this.doneT += dt; return this.doneT > 0.8; }
    return false;
  }

  choose(r) {
    const P = r.offers[r.sel];
    r.done = true;
    if (!P) return;
    sfx.uiOk();
    if (this.onChoose) this.onChoose(r, P);
  }

  draw(ctx, title) {
    const pk = this;
    ctx.fillStyle = 'rgba(4,3,14,0.6)';
    ctx.fillRect(0, 0, W, H);
    text(ctx, title, W / 2, 150, { size: 56, color: '#ffd23f', sw: 10 });
    text(ctx, 'stick / D-pad to choose · A to take it', W / 2, 192, { size: 24, color: '#cfd6ff', stroke: null });
    const rows = pk.rows;
    // power-up cards: tall cards with an icon when few players are picking,
    // compact rows for a crowd
    const rowH = Math.min(400, 820 / rows.length);
    const tall = rowH >= 220;
    const cardW = tall ? 300 : 380, gap = tall ? 34 : 18;
    const y0 = 225;
    rows.forEach((r, i) => {
      const y = y0 + i * rowH;
      const cx0 = W / 2 - (cardW * 3 + gap * 2) / 2 + (tall ? 50 : 60);
      if (r.shared) text(ctx, 'TEAM', cx0 - (tall ? 80 : 70), y + (rowH - 20) / 2 + 10, { size: 26, color: '#ffd23f', sw: 5 });
      else drawPortrait(ctx, cx0 - (tall ? 80 : 70), y + (rowH - 20) / 2, Math.min(40, rowH * 0.3), r.p, {});
      r.offers.forEach((P, j) => {
        const sel = j === r.sel;
        const h = rowH - 20;
        const lift = sel && !r.done ? 12 + Math.sin(this.t * 5) * 3 : 0;
        const x = cx0 + j * (cardW + gap), cy = y - lift;
        const holder = r.shared ? this.game.players[0] : r.p;
        const have = (holder && (r.vs ? holder.vsPerks : holder.perks) || {})[P.id] || 0;
        ctx.save();
        ctx.globalAlpha = r.done && !sel ? 0.3 : 1;
        if (sel) { ctx.shadowColor = P.color; ctx.shadowBlur = 28; }
        drawPanel(ctx, x, cy, cardW, h, { r: 18, fill: sel ? rgba(P.color, 0.2) : 'rgba(12,10,30,0.92)', accent: sel ? P.color : null, stroke: sel ? null : rgba(P.color, 0.35), lw: sel ? 5 : 2 });
        ctx.shadowBlur = 0;
        if (tall) {
          // icon medallion, name, description, stack pips
          const art = !!sprite(`perk_${P.id}.png`);
          const ic = art ? Math.min(h * 0.26, 90) : Math.min(h * 0.2, 62);
          const icy = cy + (art ? 30 : 22) + ic;
          const glow = ctx.createRadialGradient(x + cardW / 2, icy, ic * 0.2, x + cardW / 2, icy, ic * 1.25);
          glow.addColorStop(0, rgba(P.color, sel ? 0.45 : 0.28)); glow.addColorStop(1, rgba(P.color, 0));
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(x + cardW / 2, icy, ic * 1.25, 0, TAU); ctx.fill();
          if (!perkArt(ctx, P.id, x + cardW / 2, icy + (sel && !r.done ? Math.sin(this.t * 5 + 1) * 2 : 0), ic * 2.15)) {
            ctx.fillStyle = rgba(P.color, 0.18);
            ctx.beginPath(); ctx.arc(x + cardW / 2, icy, ic, 0, TAU); ctx.fill();
            ctx.strokeStyle = P.color; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(x + cardW / 2, icy, ic, 0, TAU); ctx.stroke();
            perkIcon(ctx, P.id, x + cardW / 2, icy, ic * 0.62, P.color);
          }
          const ny = icy + ic + 44;
          text(ctx, P.name, x + cardW / 2, ny, { size: 30, color: P.color, sw: 5, maxWidth: cardW - 24 });
          wrapText(ctx, P.desc, x + cardW / 2, ny + 34, cardW - 40, 24, { size: 20, color: '#e4e8ff' });
          for (let k = 0; k < P.max; k++) {
            ctx.fillStyle = k < have ? P.color : k === have ? rgba(P.color, 0.9) : 'rgba(255,255,255,0.15)';
            ctx.beginPath(); ctx.arc(x + cardW - 22 - (P.max - 1 - k) * 18, cy + 22, k === have ? 7 : 5, 0, TAU); ctx.fill();
          }
        } else {
          if (!perkArt(ctx, P.id, x + 34, cy + h / 2, Math.min(52, h * 0.66))) perkIcon(ctx, P.id, x + 34, cy + h / 2, Math.min(18, h * 0.22), P.color);
          text(ctx, P.name + (have ? `  ${'+'.repeat(have + 1)}` : ''), x + 64, cy + Math.min(40, h * 0.42), { size: Math.min(30, h * 0.3), color: P.color, align: 'left', sw: 5 });
          text(ctx, P.desc, x + 64, cy + Math.min(76, h * 0.78), { size: Math.min(20, h * 0.2), color: '#e4e8ff', align: 'left', stroke: null, maxWidth: cardW - 80 });
        }
        if (r.done && sel) text(ctx, '✓', x + cardW - 30, cy + 40, { size: 36, color: '#4fdc6a', sw: 5 });
        ctx.restore();
      });
    });
    const left = Math.max(0, Math.ceil(25 - this.t));
    text(ctx, `${left}s`, W - 80, 150, { size: 30, color: '#9aa0c8', stroke: null });
  }

}

// centred word-wrapped lines
function wrapText(ctx, str, cx, y, maxW, lineH, opts) {
  ctx.font = `600 ${opts.size}px 'Fredoka', sans-serif`;
  const words = str.split(' ');
  let line = '';
  const lines = [];
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => text(ctx, l, cx, y + i * lineH, { ...opts, stroke: null }));
}

// a small glyph per power-up (procedural)
function perkIcon(ctx, id, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const P = (pts) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a * s, b * s) : ctx.moveTo(a * s, b * s))); };
  switch (id) {
    case 'shell': case 'aegis':   // shield
      P([[0, -1], [0.85, -0.6], [0.7, 0.35], [0, 1], [-0.7, 0.35], [-0.85, -0.6]]); ctx.closePath(); id === 'aegis' ? ctx.stroke() : ctx.fill(); break;
    case 'heart':
      ctx.beginPath(); ctx.moveTo(0, s * 0.9);
      ctx.bezierCurveTo(-s * 1.3, 0, -s * 0.6, -s * 1.1, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.3, 0, 0, s * 0.9); ctx.fill(); break;
    case 'legs': case 'spring':   // chevrons
      for (const k of [0, 0.55]) { P([[-0.8, 0.5 - k], [0, -0.2 - k], [0.8, 0.5 - k]]); ctx.stroke(); }
      if (id === 'spring') { P([[-0.6, 0.95], [0.6, 0.95]]); ctx.stroke(); } break;
    case 'silk': case 'pull':     // web strand
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.5; P([[0, 0.9], [Math.cos(a) * 1.0, Math.sin(a) * 1.0 + 0.1]]); ctx.stroke(); }
      if (id === 'pull') { P([[-0.3, -0.2], [0, -0.55], [0.3, -0.2]]); ctx.stroke(); } break;
    case 'venom':                 // fang
      P([[-0.7, -0.7], [0.7, -0.7], [0.15, 0.9], [0, 0.6], [-0.15, 0.9]]); ctx.closePath(); ctx.fill(); break;
    case 'saber': case 'focus':   // blade
      P([[-0.75, 0.75], [0.8, -0.8]]); ctx.lineWidth = s * 0.28; ctx.stroke();
      ctx.lineWidth = s * 0.2; ctx.strokeStyle = '#ffffff'; P([[-0.95, 0.95], [-0.6, 0.6]]); ctx.stroke(); break;
    case 'armory':                // gun
      ctx.fillRect(-s, -s * 0.3, s * 1.8, s * 0.45); ctx.fillRect(-s * 0.7, 0, s * 0.4, s * 0.8); break;
    case 'boom': case 'blast':    // burst
      P(Array.from({ length: 16 }, (_, k) => { const a = k / 16 * TAU, r = k % 2 ? 0.45 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; })); ctx.closePath(); ctx.fill(); break;
    case 'wind': case 'air':      // swirl
      ctx.beginPath(); for (let k = 0; k < 40; k++) { const a = k / 40 * TAU * 1.6, r = s * (0.2 + k / 40 * 0.8); k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0); } ctx.stroke(); break;
    case 'lull':                  // moon
      ctx.beginPath(); ctx.arc(0, 0, s * 0.9, 0.6, TAU - 0.6); ctx.arc(s * 0.4, 0, s * 0.6, TAU - 0.9, 0.9, true); ctx.fill(); break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// the perks VS offers (one pick per spider between rounds)
export const VS_PERKS = PERKS.filter((P) => P.vs);
