// Boot (loading bar) and the start screen.
//
// The start screen is all canvas: a parallax night forest under a big moon,
// corner cobwebs, Rounders spiders dangling and swinging on threads, and the
// SPIDER SWINGERS logo (the SPIDER letters hang on their own threads).
// Delivered art replaces parts of it when listed in assets/web/manifest.json:
//   title_bg.jpg (key art backdrop, 1920x1080) and logo.png (transparent logo).

import { W, H } from './board.js';
import { text } from './hud.js';
import { loadProgress } from './preload.js';
import { CAST, drawBody, castAt } from './cast.js';
import { TAU, mulberry, clamp, FONT, rgba } from './util.js';
import { sfx } from './audio.js';
import { optionalImage, ready } from './optional-art.js';
import { drawPadNote } from '../../src/padnote.js';

const LOGO = optionalImage('logo.png');
const BG = optionalImage('title_bg.jpg');

const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// ---------------------------------------------------------------------------
// shared drawing bits (the lobby borrows the cobweb and dangling spider)

export function drawCobweb(ctx, cx, cy, R, a0, span, { spokes = 8, rings = 7, alpha = 0.28, t = 0, seed = 1 } = {}) {
  const rnd = mulberry(seed);
  const ang = [];
  for (let i = 0; i < spokes; i++) ang.push(a0 + (i / (spokes - 1)) * span + (rnd() - 0.5) * 0.06);
  const len = ang.map(() => R * (0.85 + rnd() * 0.25));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(235,240,255,${alpha})`;
  ctx.lineWidth = 1.6;
  for (let i = 0; i < spokes; i++) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang[i]) * len[i], cy + Math.sin(ang[i]) * len[i]); ctx.stroke();
  }
  ctx.lineWidth = 1.2;
  for (let k = 1; k <= rings; k++) {
    const f = Math.pow(k / (rings + 0.6), 1.15);
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const sway = Math.sin(t * 1.3 + k + i) * 1.5;
      const x = cx + Math.cos(ang[i]) * len[i] * f, y = cy + Math.sin(ang[i]) * len[i] * f + sway;
      if (!i) { ctx.moveTo(x, y); continue; }
      // sag toward the hub between spokes
      const pa = (ang[i - 1] + ang[i]) / 2, pl = (len[i - 1] + len[i]) / 2 * f * 0.86;
      ctx.quadraticCurveTo(cx + Math.cos(pa) * pl, cy + Math.sin(pa) * pl + sway, x, y);
    }
    ctx.stroke();
  }
  // dew drops
  ctx.fillStyle = `rgba(255,255,255,${alpha * 2})`;
  for (let i = 0; i < 9; i++) {
    const s = Math.floor(rnd() * spokes), f = 0.25 + rnd() * 0.7;
    const tw = 0.5 + 0.5 * Math.sin(t * 2.5 + i * 1.7);
    ctx.globalAlpha = 0.4 + tw * 0.6;
    ctx.beginPath(); ctx.arc(cx + Math.cos(ang[s]) * len[s] * f, cy + Math.sin(ang[s]) * len[s] * f, 1.5 + tw * 1.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// a round spider hanging from (ax, ay): thread + curled legs + body
export function drawDangler(ctx, ax, ay, x, y, r, castIndex, t, { legColor = '#140c26', thread = 'rgba(240,244,255,0.7)', facing = 1, wiggle = 1 } = {}) {
  ctx.save();
  ctx.strokeStyle = thread;
  ctx.lineWidth = Math.max(1.2, r * 0.05);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x, y - r * 0.7); ctx.stroke();
  // legs: four a side, knees up, feet dangling
  ctx.strokeStyle = legColor;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, r * 0.16);
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 4; i++) {
      const a = -0.75 + i * 0.5 + Math.sin(t * 6 + i * 1.3 + s) * 0.12 * wiggle;
      const bx = x + s * Math.cos(a) * r * 0.75, by = y + Math.sin(a) * r * 0.75;
      const kx = x + s * Math.cos(a - 0.5) * r * 1.55, ky = y + Math.sin(a - 0.5) * r * 1.55 - r * 0.35;
      const fx = kx + s * r * 0.35, fy = ky + r * (0.9 + i * 0.12) + Math.sin(t * 5 + i + s) * r * 0.08 * wiggle;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
  }
  ctx.restore();
  drawBody(ctx, x, y, r, castIndex, { facing });
}

// ---------------------------------------------------------------------------
export class Boot {
  constructor(game) { this.game = game; this.t = 0; this.shown = 0; }
  update(dt, real) {
    this.t += real;
    this.shown += (loadProgress() - this.shown) * Math.min(1, real * 10);
    if (loadProgress() >= 1 && this.t > 0.45 && this.shown > 0.97) this.game.go('title');
  }
  drawUI(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#090620'); g.addColorStop(1, '#1d1450');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawCobweb(ctx, 0, 0, 380, 0, Math.PI / 2, { t: this.t, seed: 4, alpha: 0.18 });
    drawCobweb(ctx, W, 0, 380, Math.PI / 2, Math.PI / 2, { t: this.t, seed: 5, alpha: 0.18 });
    text(ctx, 'SPIDER SWINGERS', W / 2, H / 2 - 70, { size: 76, color: '#fff', sw: 12, stroke: '#1b0d33' });
    const bw = 640, bx = W / 2 - bw / 2, by = H / 2 + 20, p = clamp(this.shown, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 18, 9); ctx.fill();
    const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg.addColorStop(0, '#ff3d7f'); bg.addColorStop(1, '#ffcf4a');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(18, bw * p), 18, 9); ctx.fill();
    // a little spider rides down its thread with the progress
    const sx = bx + Math.max(18, bw * p) - 9;
    drawDangler(ctx, sx, 0, sx, by - 40 + Math.sin(this.t * 4) * 4, 22, 0, this.t, { thread: 'rgba(255,255,255,0.5)' });
    text(ctx, 'loading…', W / 2, by + 60, { size: 24, color: 'rgba(220,225,255,0.6)', stroke: null });
  }
}

// ---------------------------------------------------------------------------
// procedural backdrop layers
function makeRidge(seed, n, base, amp, spiky) {
  const r = mulberry(seed);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * W;
    let y = base + Math.sin(i * 0.35 + seed) * amp * 0.5 + (r() - 0.5) * amp;
    if (spiky && i % 2) y -= spiky * (0.5 + r());
    pts.push([x, y]);
  }
  pts[n][1] = pts[0][1];   // tiles seamlessly
  return pts;
}

export class Title {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.leave = -1;
    const r = mulberry(7);
    this.stars = Array.from({ length: 170 }, () => ({ x: r() * W, y: r() * H * 0.75, s: 0.6 + r() * 1.8, ph: r() * TAU, sp: 1 + r() * 3 }));
    this.flies = Array.from({ length: 26 }, () => ({ x: r() * W, y: 650 + r() * 380, ph: r() * TAU, sp: 0.3 + r() * 0.7 }));
    this.layers = [
      { pts: makeRidge(3, 24, 760, 120, 0), color: '#2b1c5e', speed: 6, par: 10 },
      { pts: makeRidge(9, 60, 850, 50, 70), color: '#1b1142', speed: 14, par: 22 },
      { pts: makeRidge(15, 34, 960, 60, 26), color: '#0e0824', speed: 26, par: 40 },
    ];
    // dangling cast (picked fresh each visit)
    const order = CAST.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.danglers = [
      { x: 150, len: 560, amp: 0.10, spd: 0.9, r: 46, depth: 1 },
      { x: 340, len: 300, amp: 0.16, spd: 1.3, r: 34, depth: 0.8 },
      { x: 1600, len: 330, amp: 0.14, spd: 1.1, r: 36, depth: 0.8 },
      { x: 1790, len: 600, amp: 0.09, spd: 0.8, r: 50, depth: 1 },
      { x: 1270, len: 690, amp: 0.05, spd: 1.6, r: 26, depth: 0.6, yoyo: 1 },
      { x: 560, len: 740, amp: 0.06, spd: 1.2, r: 24, depth: 0.6, yoyo: 1 },
    ].map((d, i) => ({ ...d, cast: order[i % order.length], ph: i * 1.7 }));
    this.swinger = { cast: order[7 % order.length], t: -2.5 };
  }

  start() {
    this.game.board = null;
    this.game.music.menu();
  }

  update(dt, real) {
    this.t += real;
    if (this.leave >= 0) {
      this.leave += real;
      if (this.leave > 0.42) this.game.go('lobby', { join: this.joinId });
      return;
    }
    // the swinger crosses every few seconds with a new character
    this.swinger.t += real;
    if (this.swinger.t > 5.5) { this.swinger.t = -1.5 - Math.random() * 2; this.swinger.cast = Math.floor(Math.random() * CAST.length); }
    if (this.t < 0.5) return;
    for (const s of this.game.input.states) {
      if (s.anyPressed) {
        sfx.ensure(); sfx.uiOk();
        this.leave = 0;
        this.joinId = s.id;
        return;
      }
    }
  }

  mouse() {
    const m = this.game.input.mouse, v = this.game.view;
    if (!m.seen || !v.cw) return { x: Math.sin(this.t * 0.2) * 0.3, y: 0 };
    return { x: clamp((m.x / v.cw) * 2 - 1, -1, 1), y: clamp((m.y / v.ch) * 2 - 1, -1, 1) };
  }

  drawUI(ctx) {
    const t = this.t;
    const mo = this.mouse();
    this.mx = (this.mx ?? mo.x) + (mo.x - (this.mx ?? mo.x)) * 0.06;
    this.my = (this.my ?? mo.y) + (mo.y - (this.my ?? mo.y)) * 0.06;
    ctx.save();
    if (this.leave >= 0) {
      const k = easeOut(this.leave / 0.42);
      ctx.translate(W / 2, H / 2); ctx.scale(1 + k * 0.25, 1 + k * 0.25); ctx.translate(-W / 2, -H / 2);
    }
    this.drawBackdrop(ctx, t);
    this.drawDanglers(ctx, t, false);
    this.drawSwinger(ctx, t);
    this.drawLogo(ctx, t);
    this.drawDanglers(ctx, t, true);
    ctx.restore();
    this.drawPrompt(ctx, t);
    if (this.leave >= 0) {
      ctx.fillStyle = `rgba(6,4,18,${easeOut(this.leave / 0.42)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // fade in from the boot screen
    if (t < 0.5) { ctx.fillStyle = `rgba(9,6,32,${1 - t / 0.5})`; ctx.fillRect(0, 0, W, H); }
  }

  drawBackdrop(ctx, t) {
    const mx = this.mx, my = this.my;
    if (ready(BG.img)) {
      const img = BG.img;
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.05;
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      ctx.drawImage(img, (W - iw) / 2 - mx * 20, (H - ih) / 2 - my * 12, iw, ih);
      ctx.fillStyle = 'rgba(8,4,24,0.25)'; ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#080520'); g.addColorStop(0.55, '#1f1352'); g.addColorStop(1, '#4a2470');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // horizon glow
      const hg = ctx.createRadialGradient(W / 2, H + 150, 50, W / 2, H + 150, 900);
      hg.addColorStop(0, 'rgba(255,90,140,0.45)'); hg.addColorStop(1, 'rgba(255,90,140,0)');
      ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
      // stars
      ctx.fillStyle = '#fff';
      for (const s of this.stars) {
        ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        ctx.beginPath(); ctx.arc(s.x - mx * 4, s.y - my * 3, s.s, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // moon
      const mxp = 1500 - mx * 8, myp = 250 - my * 6;
      const glow = ctx.createRadialGradient(mxp, myp, 60, mxp, myp, 420);
      glow.addColorStop(0, 'rgba(255,236,200,0.35)'); glow.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = glow; ctx.fillRect(mxp - 420, myp - 420, 840, 840);
      const mg = ctx.createRadialGradient(mxp - 40, myp - 40, 10, mxp, myp, 130);
      mg.addColorStop(0, '#fffaf0'); mg.addColorStop(1, '#f2d9a8');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mxp, myp, 125, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(190,150,110,0.22)';
      for (const [dx, dy, rr] of [[-40, -20, 24], [30, 40, 18], [45, -45, 12], [-20, 55, 10], [60, 5, 8]]) { ctx.beginPath(); ctx.arc(mxp + dx, myp + dy, rr, 0, TAU); ctx.fill(); }
      // ridges (tile horizontally, drift + mouse parallax)
      for (const L of this.layers) {
        const off = ((t * L.speed + mx * L.par) % W + W) % W;
        ctx.fillStyle = L.color;
        for (const base of [-off, W - off]) {
          ctx.beginPath();
          ctx.moveTo(base, H + 10);
          for (const [x, y] of L.pts) ctx.lineTo(base + x, y - my * L.par * 0.4);
          ctx.lineTo(base + W, H + 10);
          ctx.closePath(); ctx.fill();
        }
      }
      // fog
      for (let i = 0; i < 3; i++) {
        const y = 820 + i * 70;
        const fg = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        fg.addColorStop(0, 'rgba(160,120,255,0)'); fg.addColorStop(0.5, `rgba(160,120,255,${0.07 + 0.03 * Math.sin(t * 0.5 + i)})`); fg.addColorStop(1, 'rgba(160,120,255,0)');
        ctx.fillStyle = fg; ctx.fillRect(0, y - 60, W, 120);
      }
    }
    // fireflies
    for (const f of this.flies) {
      const x = (f.x + t * 20 * f.sp + Math.sin(t * f.sp + f.ph) * 30) % (W + 40) - 20;
      const y = f.y + Math.sin(t * f.sp * 1.7 + f.ph) * 20;
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3 + f.ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
      g.addColorStop(0, `rgba(255,240,150,${a})`); g.addColorStop(1, 'rgba(255,240,150,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 12, y - 12, 24, 24);
    }
    // corner cobwebs
    drawCobweb(ctx, -10, -10, 520, 0.02, Math.PI / 2 - 0.04, { t, seed: 2, rings: 8, alpha: 0.26 });
    drawCobweb(ctx, W + 10, -10, 460, Math.PI / 2 + 0.04, Math.PI / 2 - 0.06, { t, seed: 3, rings: 7, alpha: 0.24 });
  }

  dangler(d, t) {
    const a = Math.sin(t * d.spd + d.ph) * d.amp;
    let len = d.len + Math.sin(t * 0.8 + d.ph) * 18;
    if (d.yoyo) len = d.len * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.45 + d.ph)));
    // drop in on the first second
    len *= easeOutBack((t - 0.2 - d.ph * 0.08) * 1.4);
    return { ax: d.x - this.mx * 14 * d.depth, ay: -10, x: d.x - this.mx * 14 * d.depth + Math.sin(a) * len, y: -10 + Math.cos(a) * len, a };
  }

  drawDanglers(ctx, t, front) {
    for (const d of this.danglers) {
      if ((d.depth >= 1) !== front) continue;
      const p = this.dangler(d, t);
      if (p.y < 10) continue;
      ctx.save();
      if (d.depth < 1) ctx.filter = `brightness(${0.55 + d.depth * 0.4})`;
      drawDangler(ctx, p.ax, p.ay, p.x, p.y, d.r, d.cast, t + d.ph, { facing: Math.sin(t * d.spd + d.ph) > 0 ? 1 : -1 });
      ctx.restore();
    }
  }

  // a spider swings across on a long web behind the logo
  drawSwinger(ctx, t) {
    const s = this.swinger;
    if (s.t < 0 || s.t > 3.2) return;
    const k = s.t / 3.2;
    const ang = -1.15 + 2.3 * (0.5 - 0.5 * Math.cos(k * Math.PI));
    const ax = W / 2 - this.mx * 10, ay = -300, L = 860;
    const x = ax + Math.sin(ang) * L, y = ay + Math.cos(ang) * L;
    ctx.save();
    ctx.filter = 'brightness(0.85)';
    drawDangler(ctx, ax, ay, x, y, 30, s.cast, t * 2, { facing: 1, wiggle: 2 });
    ctx.restore();
  }

  drawLogo(ctx, t) {
    if (ready(LOGO.img)) {
      const img = LOGO.img;
      const s = Math.min(1300 / img.naturalWidth, 520 / img.naturalHeight) * easeOutBack(t * 1.6);
      const bob = Math.sin(t * 1.6) * 6;
      ctx.drawImage(img, W / 2 - (img.naturalWidth * s) / 2, 360 + bob - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      return;
    }
    ctx.save();
    // SPIDER: each letter hangs on its own thread
    const top = 'SPIDER';
    ctx.font = `700 132px ${FONT}`;
    const widths = [...top].map((c) => ctx.measureText(c).width);
    const gap = 14;
    const tw = widths.reduce((a, b) => a + b, 0) + gap * (top.length - 1);
    let x = W / 2 - tw / 2;
    for (let i = 0; i < top.length; i++) {
      const w = widths[i];
      const cx = x + w / 2;
      const intro = easeOutBack((t - 0.1 - i * 0.07) * 1.8);
      const yy = 240 - (1 - intro) * 320;
      const sw = Math.sin(t * 1.5 + i * 0.8) * 0.045;
      // thread
      ctx.strokeStyle = 'rgba(240,244,255,0.75)'; ctx.lineWidth = 2;
      const tx = cx + Math.sin(sw) * -100;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, yy - 100); ctx.stroke();
      ctx.save();
      ctx.translate(cx, yy - 100);
      ctx.rotate(sw);
      ctx.translate(0, 100);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.fillStyle = '#3a1660';
      ctx.fillText(top[i], 0, 9);
      ctx.lineWidth = 16; ctx.strokeStyle = '#1b0d33'; ctx.strokeText(top[i], 0, 0);
      const g = ctx.createLinearGradient(0, -50, 0, 50);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#bfe4ff');
      ctx.fillStyle = g; ctx.fillText(top[i], 0, 0);
      ctx.restore();
      x += w + gap;
    }
    // SWINGERS: chunky, extruded, waving
    const word = 'SWINGERS';
    ctx.font = `700 236px ${FONT}`;
    const ws = [...word].map((c) => ctx.measureText(c).width);
    const g2 = -4;
    const tw2 = ws.reduce((a, b) => a + b, 0) + g2 * (word.length - 1);
    x = W / 2 - tw2 / 2;
    const shineX = ((t % 4.2) / 1.4) * (tw2 + 600) - 300;
    for (let i = 0; i < word.length; i++) {
      const w = ws[i];
      const cx = x + w / 2;
      const intro = easeOutBack((t - 0.55 - i * 0.06) * 2.2);
      if (intro <= 0.01) { x += w + g2; continue; }
      const cy = 455 + Math.sin(t * 2.6 - i * 0.55) * 7;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 1.8 + i * 1.3) * 0.025 + (i % 2 ? 0.02 : -0.02));
      ctx.scale(intro, intro);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      // extrusion
      for (let d = 14; d > 0; d -= 2) { ctx.fillStyle = d > 10 ? '#140726' : '#4a1250'; ctx.fillText(word[i], d * 0.25, d); }
      ctx.lineWidth = 26; ctx.strokeStyle = '#140726'; ctx.strokeText(word[i], 0, 0);
      const g = ctx.createLinearGradient(0, -90, 0, 80);
      g.addColorStop(0, '#ffe96a'); g.addColorStop(0.45, '#ff8a4a'); g.addColorStop(1, '#ff2f7e');
      ctx.fillStyle = g; ctx.fillText(word[i], 0, 0);
      // shine sweep
      const d = Math.abs(cx - W / 2 + tw2 / 2 - shineX);
      if (d < 160) { ctx.globalAlpha = (1 - d / 160) * 0.55; ctx.fillStyle = '#fff'; ctx.fillText(word[i], 0, 0); ctx.globalAlpha = 1; }
      // top highlight
      ctx.save();
      ctx.beginPath(); ctx.rect(-w, -120, w * 2, 70); ctx.clip();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.fillText(word[i], 0, 0);
      ctx.restore();
      ctx.restore();
      x += w + g2;
    }
    // a strand of web drooping between the SPIDER threads and the S of SWINGERS
    ctx.strokeStyle = 'rgba(240,244,255,0.5)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(W / 2 - tw2 / 2 + 40, 340); ctx.quadraticCurveTo(W / 2 - tw / 2 - 60, 250 + Math.sin(t) * 6, W / 2 - tw / 2 - 20, 150); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 + tw2 / 2 - 40, 340); ctx.quadraticCurveTo(W / 2 + tw / 2 + 60, 250 + Math.sin(t + 1) * 6, W / 2 + tw / 2 + 20, 150); ctx.stroke();
    ctx.restore();
    // sparkles
    for (let i = 0; i < 5; i++) {
      const ph = (t * 0.7 + i * 0.37) % 1;
      const r = mulberry(i * 31 + Math.floor(t * 0.7 + i * 0.37));
      const sx = W / 2 - tw2 / 2 + r() * tw2, sy = 360 + r() * 190;
      const s = Math.sin(ph * Math.PI) * 16;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(ph * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPrompt(ctx, t) {
    const k = easeOut((t - 1.1) * 2);
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = k;
    const pulse = 1 + Math.sin(t * 4.2) * 0.035;
    ctx.translate(W / 2, 745);
    ctx.scale(pulse, pulse);
    const w = 560, h = 86;
    ctx.fillStyle = 'rgba(10,6,28,0.72)';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,${120 + Math.floor(60 * Math.sin(t * 4.2))},150,0.9)`; ctx.lineWidth = 4; ctx.stroke();
    text(ctx, 'PRESS ANY BUTTON', 0, 17, { size: 48, color: '#fff', sw: 0, stroke: null });
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = k * 0.85;
    // controller A glyph + keyboard hint
    const y = 830;
    ctx.fillStyle = '#4fdc6a';
    ctx.beginPath(); ctx.arc(W / 2 - 250, y - 8, 17, 0, TAU); ctx.fill();
    text(ctx, 'A', W / 2 - 250, y + 1, { size: 24, color: '#062a10', stroke: null });
    text(ctx, 'on any controller', W / 2 - 222, y + 1, { size: 26, align: 'left', color: '#e4e8ff', sw: 5 });
    text(ctx, '·   Space / click on keyboard', W / 2 + 18, y + 1, { size: 26, align: 'left', color: '#e4e8ff', sw: 5 });
    const pads = this.game.input.states.filter((s) => s.kind === 'pad').length;
    text(ctx, pads ? `${pads} controller${pads > 1 ? 's' : ''} connected · up to 8 players` : 'Plug in up to 8 controllers · keyboard + mouse plays too', W / 2, 880, { size: 22, color: 'rgba(220,225,255,0.7)', sw: 4 });
    ctx.restore();
    text(ctx, 'Starring the Rounders cast  ·  music from Rounders  ·  a swinging spider brawler', W / 2, H - 26, { size: 20, color: 'rgba(220,225,255,0.5)', sw: 4, stroke: 'rgba(0,0,0,0.4)' });
  }

  // "Xbox controller highly recommended", drawn in screen pixels (after the
  // letterbox bars) so it stays readable however small the arena is scaled:
  // in the band under the arena when the screen is tall enough (portrait),
  // otherwise between the controller hints and the credits line.
  drawOverlay(ctx, v) {
    const ui = this.game.ui;
    const k = easeOut((this.t - 1.1) * 2) * (this.leave >= 0 ? 1 - easeOut(this.leave / 0.25) : 1);
    if (k <= 0 || (ui && ui.open)) return;
    const size = Math.max(12, Math.min(20, 22 * v.s));
    const y = v.oy > size * 3.5 ? v.oy + H * v.s + size * 2.2 : v.oy + 935 * v.s + size * 0.35;
    ctx.save();
    ctx.globalAlpha = k * 0.9;
    drawPadNote(ctx, v.cw / 2, y, { font: `600 ${size}px ${FONT}`, size, color: 'rgba(220,225,255,0.72)', shadow: 'rgba(0,0,0,0.75)', shadowBlur: 6 });
    ctx.restore();
  }
}
