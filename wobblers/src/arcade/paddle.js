// PADDLE BALL: the classic two-paddle table-tennis video game. Slot 0 is the
// left paddle, slot 1 the right; a slot without a human is played by the CPU.
// First to 11 wins. Where the ball meets the paddle sets the angle, and every
// return is a little faster.
import { txt, clamp } from './common.js';

const PW = 4, PH = 24, BALL = 4, WIN = 11;

export class PaddleBall {
  static id = 'paddle';
  static title = 'PADDLE BALL';
  static slots = 2;
  static color = '#ffffff';
  constructor() {
    this.W = 256; this.H = 192;
    this.snd = null; this.hi = 0;
    this.names = ['CPU', 'CPU'];
    this.reset();
  }
  sfx(n) { this.snd?.(n); }

  reset() {
    this.pts = [0, 0]; this.over = false; this.winner = -1; this.t = 0;
    this.pad = [{ x: 10, y: this.H / 2, v: 0 }, { x: this.W - 10 - PW, y: this.H / 2, v: 0 }];
    this.cpuErr = [0, 0];
    this.serve(Math.random() < 0.5 ? 0 : 1);
  }
  get score() { return this.pts[0]; }
  serve(toward) {
    this.ball = { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0 };
    this.serveT = 70; this.toward = toward; this.speed = 2.3; this.rally = 0;
  }

  step(inputs) {
    this.t++;
    if (this.over) return;
    // paddles
    for (let i = 0; i < 2; i++) {
      const p = this.pad[i], inp = inputs?.[i];
      let v;
      if (inp) v = clamp(-inp.y, -1, 1) * 3.4;
      else v = this.cpu(i);
      p.v = v;
      p.y = clamp(p.y + v, 8 + PH / 2, this.H - 8 - PH / 2);
    }
    const b = this.ball;
    if (this.serveT > 0) {
      if (--this.serveT === 0) {
        const a = (Math.random() - 0.5) * 1.0;
        b.vx = Math.cos(a) * this.speed * (this.toward ? 1 : -1); b.vy = Math.sin(a) * this.speed;
      }
      return;
    }
    // ball, in small sub-steps so fast balls don't tunnel through paddles
    const n = Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) / 2);
    for (let k = 0; k < n; k++) {
      b.x += b.vx / n; b.y += b.vy / n;
      if (b.y < 8 + BALL / 2) { b.y = 8 + BALL / 2; b.vy = Math.abs(b.vy); this.sfx('wall'); }
      if (b.y > this.H - 8 - BALL / 2) { b.y = this.H - 8 - BALL / 2; b.vy = -Math.abs(b.vy); this.sfx('wall'); }
      for (let i = 0; i < 2; i++) {
        const p = this.pad[i], dir = i ? -1 : 1;
        if ((b.vx > 0) === (i === 1) && b.x + BALL / 2 >= p.x && b.x - BALL / 2 <= p.x + PW && Math.abs(b.y - p.y) <= PH / 2 + BALL / 2) {
          const off = clamp((b.y - p.y) / (PH / 2), -1, 1);
          this.speed = Math.min(5.2, this.speed + 0.18); this.rally++;
          const a = off * 0.95 + p.v * 0.04;
          b.vx = Math.cos(a) * this.speed * dir; b.vy = Math.sin(a) * this.speed;
          b.x = i ? p.x - BALL / 2 : p.x + PW + BALL / 2;
          this.cpuErr[1 - i] = (Math.random() - 0.5) * (PH * 1.45);
          this.sfx('paddle');
        }
      }
      if (b.x < -6 || b.x > this.W + 6) {
        const scorer = b.x < 0 ? 1 : 0;
        this.pts[scorer]++;
        this.sfx('point');
        if (this.pts[scorer] >= WIN) { this.over = true; this.winner = scorer; this.sfx('win'); return; }
        this.serve(1 - scorer);
        return;
      }
    }
  }

  // CPU paddle: track where the ball will cross, with a little error and a speed cap.
  cpu(i) {
    const p = this.pad[i], b = this.ball;
    const px0 = i ? p.x : p.x + PW;
    const coming = (b.vx > 0) === (i === 1) && b.vx !== 0 && Math.abs(px0 - b.x) < this.W * 0.62; // reacts once the ball is in its half-ish
    let ty = this.H / 2;
    if (coming) {
      const px = i ? p.x : p.x + PW, t = (px - b.x) / b.vx;
      let y = b.y + b.vy * t;
      const top = 8 + BALL / 2, bot = this.H - 8 - BALL / 2, span = bot - top;
      y -= top; y = ((y % (2 * span)) + 2 * span) % (2 * span); if (y > span) y = 2 * span - y; y += top; // wall bounces
      ty = y + this.cpuErr[i];
    }
    const d = ty - p.y, max = coming ? 2.3 : 1.2;
    return Math.abs(d) < 1.5 ? 0 : clamp(d * 0.2, -max, max);
  }

  draw(g) {
    g.fillStyle = '#000'; g.fillRect(0, 0, this.W, this.H);
    g.fillStyle = '#fff';
    g.fillRect(0, 4, this.W, 4); g.fillRect(0, this.H - 8, this.W, 4);
    for (let y = 12; y < this.H - 10; y += 10) g.fillRect(this.W / 2 - 1, y, 2, 5);
    bigDigits(g, this.pts[0], this.W / 2 - 22, 14);
    bigDigits(g, this.pts[1], this.W / 2 + 10, 14);
    txt(g, this.names[0], 40, 14, '#aaa', 8, 'center');
    txt(g, this.names[1], this.W - 40, 14, '#aaa', 8, 'center');
    for (const p of this.pad) g.fillRect(p.x, p.y - PH / 2, PW, PH);
    const b = this.ball;
    if (this.serveT <= 0 || ((this.serveT / 8) | 0) % 2) g.fillRect(b.x - BALL / 2, b.y - BALL / 2, BALL, BALL);
    if (this.over) {
      const w = this.names[this.winner];
      txt(g, (w === 'CPU' ? 'CPU' : w) + ' WINS!', this.W / 2, 82, '#ffe03a', 14, 'center');
    }
  }
}

// Chunky seven-segment-ish score digits.
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function bigDigits(g, n, x, y) {
  const s = String(n);
  const w = 10, h = 18, t = 3;
  for (let k = 0; k < s.length; k++) {
    const ox = x + (k - (s.length - 1)) * (w + 3) * (x < 128 ? 1 : 0) + (x >= 128 ? k * (w + 3) : 0);
    const on = SEG[s[k]];
    const R = (a, b, c, d) => g.fillRect(ox + a, y + b, c, d);
    if (on.includes('a')) R(0, 0, w, t);
    if (on.includes('b')) R(w - t, 0, t, h / 2);
    if (on.includes('c')) R(w - t, h / 2, t, h / 2);
    if (on.includes('d')) R(0, h - t, w, t);
    if (on.includes('e')) R(0, h / 2, t, h / 2);
    if (on.includes('f')) R(0, 0, t, h / 2);
    if (on.includes('g')) R(0, h / 2 - t / 2, w, t);
  }
}
