// THE SQUEEZE: a VS hazard that closes in on the arena after a delay.
//
//   new Squeeze(game, { speed, sides, delay })   (defaults from settings)
//     speed: 'off' | 'static' | 'normal' | 'fast' | 'fastest'
//            static = a fixed thin border on every edge, live from the start
//     sides: 'one' | 'several' | 'all'   which edges close in (random pick)
//     delay: seconds of play before it starts moving (a warning pulses for
//            WARN seconds before that)
//   update(dt)    advance (call only while the round is in play); kills
//                 spiders that touch it (game.killSpider cause 'zone') and
//                 destroys loose pickups inside it
//   draw(ctx)     world space, after entities
//   drawUI(ctx)   the "coming" warning
//   safe          { x0, y0, x1, y1 } the current safe rectangle
//   inside(x, y, pad)  is that point in the hazard
//
// Each closing edge stops at a minimum safe area (MIN_W x MIN_H around a
// centre picked near the middle of the board's spawns).

import { W, H } from './board.js';
import { settings } from './settings.js';
import { sfx } from './audio.js';
import { TAU, clamp, rgba, pick } from './util.js';
import { text } from './hud.js';

export const SQUEEZE_SPEEDS = { off: 0, static: 0, normal: 20, fast: 38, fastest: 70 };   // px/s per edge
const STATIC_EDGE = 20;       // static border thickness
const MIN_W = 600, MIN_H = 380;
const ONE_SIDE_KEEP = { x: 760, y: 470 };   // one edge alone stops when this much is left
const WARN = 3;
const SIDES = ['l', 'r', 't', 'b'];

export class Squeeze {
  constructor(game, { speed = settings.squeezeSpeed, sides = settings.squeezeSides, delay = settings.squeezeDelay } = {}) {
    this.game = game;
    this.mode = speed in SQUEEZE_SPEEDS ? speed : 'normal';
    this.speed = SQUEEZE_SPEEDS[this.mode] || 0;
    this.delay = Math.max(WARN, +delay || 25);
    this.t = 0;
    this.inset = { l: 0, r: 0, t: 0, b: 0 };
    this.goal = { l: 0, r: 0, t: 0, b: 0 };
    this.moving = [];
    this.lastBeep = 0;
    this.done = false;
    if (this.mode === 'off') { this.active = false; return; }
    this.active = true;
    if (this.mode === 'static') {
      for (const s of SIDES) this.inset[s] = this.goal[s] = STATIC_EDGE;
      this.moving = SIDES.slice();
      return;
    }
    // which edges close in
    if (sides === 'one') this.moving = [pick(SIDES)];
    else if (sides === 'several') {
      const sh = SIDES.slice().sort(() => Math.random() - 0.5);
      this.moving = sh.slice(0, Math.random() < 0.5 ? 2 : 3);
    } else this.moving = SIDES.slice();
    // where they stop: a box around a centre near the board's middle spawn
    const sp = (game.board && game.board.spawns) || [];
    let c = { x: W / 2, y: H / 2 };
    if (sp.length) {
      const near = sp.slice().sort((a, b) => Math.hypot(a[0] - W / 2, a[1] - H / 2) - Math.hypot(b[0] - W / 2, b[1] - H / 2))[0];
      c = { x: (near[0] + W / 2) / 2, y: (near[1] + H / 2) / 2 };
    }
    const cx = clamp(c.x, MIN_W / 2 + 40, W - MIN_W / 2 - 40), cy = clamp(c.y, MIN_H / 2 + 40, H - MIN_H / 2 - 40);
    const all = this.moving.length > 1;
    for (const s of this.moving) {
      if (!all) this.goal[s] = s === 'l' || s === 'r' ? W - ONE_SIDE_KEEP.x : H - ONE_SIDE_KEEP.y;
      else if (s === 'l') this.goal.l = cx - MIN_W / 2;
      else if (s === 'r') this.goal.r = W - (cx + MIN_W / 2);
      else if (s === 't') this.goal.t = cy - MIN_H / 2;
      else this.goal.b = H - (cy + MIN_H / 2);
    }
  }

  get isStatic() { return this.mode === 'static'; }
  get warning() { return this.active && !this.isStatic && this.t >= this.delay - WARN && this.t < this.delay; }
  get closing() { return this.active && !this.isStatic && this.t >= this.delay && !this.done; }
  get safe() { const i = this.inset; return { x0: i.l, y0: i.t, x1: W - i.r, y1: H - i.b }; }

  inside(x, y, pad = 0) {
    if (!this.active) return false;
    const i = this.inset;
    return (i.l > 0 && x - pad < i.l) || (i.r > 0 && x + pad > W - i.r) || (i.t > 0 && y - pad < i.t) || (i.b > 0 && y + pad > H - i.b);
  }

  update(dt) {
    if (!this.active) return;
    const game = this.game;
    this.t += dt;
    if (this.warning) {
      const sec = Math.ceil(this.delay - this.t);
      if (sec !== this.lastBeep) { this.lastBeep = sec; sfx.warn(); }
    }
    if (this.closing) {
      let still = false;
      for (const s of this.moving) {
        if (this.inset[s] < this.goal[s]) { this.inset[s] = Math.min(this.goal[s], this.inset[s] + this.speed * dt); still = true; }
      }
      if (!still) this.done = true;
    }
    // touching it kills
    for (const sp of game.spiders) {
      if (!sp.alive) continue;
      if (this.inside(sp.x, sp.y, sp.r * 0.5)) {
        game.fx.burst(sp.x, sp.y, { n: 18, speed: 500, color: '#ff4fd8', life: 0.45 });
        game.killSpider(sp, { cause: 'zone', x: sp.x, y: sp.y, ix: (W / 2 - sp.x) * 0.6, iy: -300 });
      }
    }
    for (const e of game.enemies) {
      if (e.alive && e.hurt && this.inside(e.x, e.y, (e.r || 10) * 0.5)) e.hurt({ amount: 99, cause: 'zone', x: e.x, y: e.y });
    }
    // loose pickups inside fizzle away (thrown / stuck / recalled ones are left alone)
    for (const p of game.pickups) {
      if (p.removed || p.mode || !this.inside(p.x, p.y, 0)) continue;
      p.removed = true;
      game.fx.burst(p.x, p.y, { n: 10, speed: 220, color: '#ff8ae8', life: 0.35 });
      sfx.fizzle();
    }
  }

  // ---- drawing ---------------------------------------------------------------
  draw(ctx) {
    if (!this.active) return;
    const t = this.game.realTime;
    const i = this.inset;
    if (this.warning) this.drawWarning(ctx, t);
    const any = SIDES.some((s) => i[s] > 0.5);
    if (!any) return;
    const sx0 = i.l, sy0 = i.t, sx1 = W - i.r, sy1 = H - i.b;
    const E = 500;  // reach past the arena so shake never shows a seam
    ctx.save();
    // the hazard region: everything outside the safe box (only on edges that have moved)
    const region = new Path2D();
    region.rect(-E, -E, W + 2 * E, H + 2 * E);
    region.rect(i.l > 0.5 ? sx0 : -E, i.t > 0.5 ? sy0 : -E, (i.r > 0.5 ? sx1 : W + E) - (i.l > 0.5 ? sx0 : -E), (i.b > 0.5 ? sy1 : H + E) - (i.t > 0.5 ? sy0 : -E));
    ctx.clip(region, 'evenodd');
    // fog
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.fillStyle = `rgba(70,6,52,${0.62 + pulse * 0.08})`;
    ctx.fillRect(-E, -E, W + 2 * E, H + 2 * E);
    // drifting energy bands
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.6);
    const off = (t * 60) % 120;
    ctx.fillStyle = 'rgba(255,60,190,0.10)';
    for (let x = -1600 + off; x < 1600; x += 120) ctx.fillRect(x, -1400, 46, 2800);
    ctx.restore();
    // static crackle
    for (let k = 0; k < 40; k++) {
      const a = (k * 977 + Math.floor(t * 20) * 131) % 1000 / 1000, b = (k * 557 + Math.floor(t * 20) * 71) % 1000 / 1000;
      const x = -40 + a * (W + 80), y = -40 + b * (H + 80);
      if (!this.inside(x, y, 0)) continue;
      ctx.fillStyle = `rgba(255,${150 + (k % 5) * 20},240,${0.25 + 0.35 * ((k * 13) % 7) / 7})`;
      ctx.fillRect(x, y, 3, 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    // caution stripes along the inner edge
    const band = 18;
    const bandPath = new Path2D();
    bandPath.rect(sx0 - band, sy0 - band, sx1 - sx0 + 2 * band, sy1 - sy0 + 2 * band);
    bandPath.rect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    ctx.save();
    ctx.clip(bandPath, 'evenodd');
    ctx.fillStyle = 'rgba(20,8,24,0.85)';
    ctx.fillRect(-E, -E, W + 2 * E, H + 2 * E);
    ctx.fillStyle = '#ffcf4a';
    const so = (t * 40) % 40;
    ctx.beginPath();
    for (let x = -H - 80 + so; x < W + 80; x += 40) { ctx.moveTo(x, -E); ctx.lineTo(x + 20, -E); ctx.lineTo(x + 20 + H + 2 * E, H + E); ctx.lineTo(x + H + 2 * E, H + E); }
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // glowing wall lines on the edges that have moved
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const lines = [];
    if (i.l > 0.5) lines.push([sx0, Math.max(-E, i.t > 0.5 ? sy0 : -E), sx0, i.b > 0.5 ? sy1 : H + E]);
    if (i.r > 0.5) lines.push([sx1, i.t > 0.5 ? sy0 : -E, sx1, i.b > 0.5 ? sy1 : H + E]);
    if (i.t > 0.5) lines.push([i.l > 0.5 ? sx0 : -E, sy0, i.r > 0.5 ? sx1 : W + E, sy0]);
    if (i.b > 0.5) lines.push([i.l > 0.5 ? sx0 : -E, sy1, i.r > 0.5 ? sx1 : W + E, sy1]);
    const flick = 0.85 + 0.15 * Math.sin(t * 37);
    for (const [w, a] of [[26, 0.12], [12, 0.35], [5, 0.75]]) {
      ctx.strokeStyle = `rgba(255,70,200,${a * flick})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of lines) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,240,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of lines) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
    ctx.restore();
  }

  // before it moves: the edges that will close pulse
  drawWarning(ctx, t) {
    const k = 0.5 + 0.5 * Math.sin(t * 12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.moving) {
      const g = s === 'l' ? ctx.createLinearGradient(0, 0, 90, 0) : s === 'r' ? ctx.createLinearGradient(W, 0, W - 90, 0)
        : s === 't' ? ctx.createLinearGradient(0, 0, 0, 90) : ctx.createLinearGradient(0, H, 0, H - 90);
      g.addColorStop(0, `rgba(255,60,190,${0.55 * k + 0.15})`);
      g.addColorStop(1, 'rgba(255,60,190,0)');
      ctx.fillStyle = g;
      if (s === 'l') ctx.fillRect(0, 0, 90, H);
      else if (s === 'r') ctx.fillRect(W - 90, 0, 90, H);
      else if (s === 't') ctx.fillRect(0, 0, W, 90);
      else ctx.fillRect(0, H - 90, W, 90);
    }
    ctx.restore();
  }

  drawUI(ctx) {
    if (!this.warning) return;
    const sec = Math.max(1, Math.ceil(this.delay - this.t));
    const k = 0.5 + 0.5 * Math.sin(this.game.realTime * 12);
    ctx.save();
    ctx.globalAlpha = 0.75 + 0.25 * k;
    const y = 112;
    ctx.fillStyle = 'rgba(30,6,30,0.82)';
    ctx.beginPath(); ctx.roundRect(W / 2 - 250, y - 34, 500, 52, 26); ctx.fill();
    ctx.strokeStyle = rgba('#ff46c8', 0.6 + 0.4 * k); ctx.lineWidth = 3; ctx.stroke();
    text(ctx, `THE SQUEEZE IN ${sec}`, W / 2, y + 2, { size: 30, color: '#ffcf4a', sw: 5 });
    ctx.restore();
  }
}
