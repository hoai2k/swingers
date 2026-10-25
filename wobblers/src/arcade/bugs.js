// BUG BLASTER: a shoot-the-bugs arcade game in the classic mould (original bug
// designs). A long segmented bug winds down through a mushroom patch: each time
// it bumps into a mushroom or the edge it drops a row and turns round. Shoot a
// segment and it turns into a mushroom, splitting the bug in two (the piece
// behind grows a new head). A bouncing spider raids the player zone at the
// bottom and eats mushrooms; from wave 2 a flea drops straight down, sowing
// new mushrooms when the zone runs low.
import { txt, pad, clamp } from './common.js';

const C = 8, COLS = 30, ROWS = 32, TOP = 2, ZONE = 26; // rows 0-1 are the score line
const PAL = [['#ff3ab4', '#3af0ff', '#ffe03a'], ['#7aff5a', '#ff8a3d', '#ff3ab4'], ['#3a8aff', '#ffe03a', '#7aff5a'], ['#ff8a3d', '#b46cff', '#3af0ff']];

export class BugBlaster {
  static id = 'bugs';
  static title = 'BUG BLASTER';
  static slots = 1;
  static color = '#ff3ab4';
  constructor() {
    this.W = COLS * C; this.H = ROWS * C;
    this.snd = null; this.hi = 0;
    this.reset();
  }
  sfx(n) { this.snd?.(n); }

  reset() {
    this.score = 0; this.lives = 3; this.wave = 1; this.over = false; this.nextLife = 12000; this.t = 0;
    this.mush = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    for (let i = 0; i < 46; i++) {
      const r = TOP + 1 + ((Math.random() * (ZONE - TOP - 1)) | 0), c = (Math.random() * COLS) | 0;
      this.mush[r][c] = 4;
    }
    this.resetRound();
    this.sfx('start');
  }
  resetRound() {
    this.px = this.W / 2; this.py = 244; this.shot = null;
    this.spider = null; this.spiderT = 300; this.flea = null; this.pops = [];
    this.spawnBug();
    this.phase = 'ready'; this.phaseT = 60;
  }
  spawnBug() {
    const n = 12, heads = Math.min(this.wave - 1, 6);
    this.segs = [];
    let ahead = null;
    for (let i = 0; i < n - heads; i++) {
      const s = { x: (14 - i) * C, y: TOP * C, dir: 1, vdir: 1, drop: 0, ahead, alive: true };
      this.segs.push(s); ahead = s;
    }
    for (let h = 0; h < heads; h++) {
      this.segs.push({ x: ((Math.random() * COLS) | 0) * C, y: TOP * C, dir: Math.random() < 0.5 ? 1 : -1, vdir: 1, drop: 0, ahead: null, alive: true });
    }
  }
  isHead(s) { return !s.ahead || !s.ahead.alive; }

  step(inputs) {
    this.t++;
    const inp = inputs?.[0];
    for (const p of this.pops) p.t--;
    this.pops = this.pops.filter((p) => p.t > 0);
    if (this.phase === 'ready') { if (--this.phaseT <= 0) this.phase = 'play'; return; }
    if (this.phase === 'dying') {
      if (--this.phaseT <= 0) {
        this.lives--;
        // damaged mushrooms grow back (5 points each)
        for (const row of this.mush) for (let c = 0; c < COLS; c++) if (row[c] > 0 && row[c] < 4) { row[c] = 4; this.add(5); }
        if (this.lives <= 0) { this.over = true; this.phase = 'over'; return; }
        this.resetRound();
      }
      return;
    }
    if (this.phase !== 'play') return;
    // ---- player
    let mx = 0, my = 0, fire = false;
    if (inp) { mx = inp.x; my = -inp.y; fire = inp.fire; } else [mx, my, fire] = this.demo();
    const sp = 1.7, ox = this.px, oy = this.py;
    this.px = clamp(this.px + clamp(mx, -1, 1) * sp, 4, this.W - 4);
    if (this.blocked(this.px, this.py)) this.px = ox;
    this.py = clamp(this.py + clamp(my, -1, 1) * sp, ZONE * C + 4, this.H - 5);
    if (this.blocked(this.px, this.py)) this.py = oy;
    if (fire && !this.shot) { this.shot = { x: this.px, y: this.py - 5 }; this.sfx('zap'); }
    if (this.shot) {
      for (let k = 0; k < 3 && this.shot; k++) { this.shot.y -= 3; this.hitTest(); }
      if (this.shot && this.shot.y < TOP * C) this.shot = null;
    }
    // ---- the bug
    for (const s of this.segs) if (s.alive) this.moveSeg(s);
    if (!this.segs.some((s) => s.alive)) {
      this.wave++; this.spawnBug(); this.sfx('clear');
    }
    // ---- spider
    if (this.spider) {
      const s = this.spider;
      s.x += s.dx; s.y += s.vy;
      if (s.y < ZONE * C - 8 || s.y > this.H - 6) { s.vy = -s.vy; s.y = clamp(s.y, ZONE * C - 8, this.H - 6); }
      if (Math.random() < 0.02) s.vy = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random());
      const r = Math.floor(s.y / C), c = Math.floor(s.x / C);
      if (this.mush[r]?.[c] && Math.random() < 0.05) this.mush[r][c] = 0;
      if (this.t % 10 === 0) this.sfx('spider');
      if (s.x < -12 || s.x > this.W + 12) { this.spider = null; this.spiderT = 200 + Math.random() * 300; }
    } else if (--this.spiderT <= 0) {
      const left = Math.random() < 0.5;
      this.spider = { x: left ? -8 : this.W + 8, y: ZONE * C + 8, dx: (left ? 1 : -1) * (0.8 + Math.min(this.wave, 5) * 0.12), vy: 1.4 };
    }
    // ---- flea
    if (this.flea) {
      const f = this.flea;
      const was = Math.floor(f.y / C);
      f.y += f.fast ? 4 : 2;
      const r = Math.floor(f.y / C);
      if (r !== was && r > TOP && r < ROWS - 1 && !this.mush[r][f.c] && Math.random() < 0.18) this.mush[r][f.c] = 4;
      if (f.y > this.H) this.flea = null;
    } else if (this.wave >= 2 && this.t % 60 === 0 && this.zoneMushrooms() < 5 && Math.random() < 0.5) {
      this.flea = { c: (Math.random() * COLS) | 0, y: TOP * C, hp: 2, fast: false };
      this.sfx('flea');
    }
    // ---- getting caught
    const hit = (x, y, r) => Math.abs(x - this.px) < r && Math.abs(y - this.py) < r;
    if (this.segs.some((s) => s.alive && hit(s.x + 4, s.y + 4, 6.5)) || (this.spider && hit(this.spider.x, this.spider.y, 7)) || (this.flea && hit(this.flea.c * C + 4, this.flea.y, 6))) {
      this.phase = 'dying'; this.phaseT = 90; this.shot = null; this.sfx('die');
    }
  }

  zoneMushrooms() { let n = 0; for (let r = ZONE; r < ROWS; r++) for (const v of this.mush[r]) if (v) n++; return n; }
  blocked(x, y) {
    for (const [ax, ay] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const r = Math.floor((y + ay) / C), c = Math.floor((x + ax) / C);
      if (this.mush[r]?.[c]) return true;
    }
    return false;
  }

  moveSeg(s) {
    const sp = 2;
    if (s.drop > 0) {
      s.y += s.vdir * sp; s.drop -= sp;
      if (s.drop <= 0) s.dir = -s.dir;
      return;
    }
    if (s.x % C === 0) {
      const col = s.x / C, row = Math.round(s.y / C), nc = col + s.dir;
      if (nc < 0 || nc >= COLS || this.mush[row]?.[nc] > 0) {
        if (s.vdir > 0 && row >= ROWS - 1) s.vdir = -1;
        else if (s.vdir < 0 && row <= ZONE) s.vdir = 1;
        s.drop = C; s.y += s.vdir * sp; s.drop -= sp;
        return;
      }
    }
    s.x += s.dir * sp;
  }

  hitTest() {
    const b = this.shot, r = Math.floor(b.y / C), c = Math.floor(b.x / C);
    // segments
    for (const s of this.segs) {
      if (!s.alive || b.x < s.x || b.x >= s.x + C || b.y < s.y || b.y >= s.y + C) continue;
      s.alive = false;
      const head = this.isHead(s);
      this.add(head ? 100 : 10);
      const mr = Math.round(s.y / C), mc = clamp(Math.round(s.x / C), 0, COLS - 1);
      if (mr >= TOP && mr < ROWS) this.mush[mr][mc] = 4;
      this.pops.push({ x: s.x + 4, y: s.y + 4, t: 12 });
      this.shot = null; this.sfx(head ? 'hithead' : 'hit');
      return;
    }
    // spider
    if (this.spider && Math.abs(b.x - this.spider.x) < 7 && Math.abs(b.y - this.spider.y) < 5) {
      const d = Math.abs(this.spider.y - this.py), v = d < 16 ? 900 : d < 32 ? 600 : 300;
      this.add(v); this.pops.push({ x: this.spider.x, y: this.spider.y, t: 50, text: v });
      this.spider = null; this.spiderT = 240 + Math.random() * 300; this.shot = null; this.sfx('hithead');
      return;
    }
    // flea
    if (this.flea && Math.abs(b.x - (this.flea.c * C + 4)) < 5 && Math.abs(b.y - this.flea.y) < 6) {
      this.shot = null;
      if (--this.flea.hp <= 0) { this.add(200); this.pops.push({ x: this.flea.c * C + 4, y: this.flea.y, t: 14 }); this.flea = null; this.sfx('hit'); }
      else this.flea.fast = true;
      return;
    }
    // mushrooms
    if (this.mush[r]?.[c]) {
      if (--this.mush[r][c] <= 0) { this.mush[r][c] = 0; this.add(1); }
      this.shot = null; this.sfx('thud');
    }
  }

  add(v) {
    this.score += v;
    if (this.score >= this.nextLife) { this.nextLife += 12000; this.lives++; this.sfx('extra'); }
  }

  // Attract-mode blaster: sit under the lowest segment, keep away from the spider.
  demo() {
    let tx = this.px, low = -1;
    for (const s of this.segs) if (s.alive && s.y > low) { low = s.y; tx = s.x + 4 + s.dir * 6; }
    let ty = 246;
    if (this.spider && Math.abs(this.spider.x - this.px) < 34) { tx = this.px + (this.spider.x > this.px ? -30 : 30); ty = this.spider.y > 228 ? 214 : 246; }
    const mx = Math.abs(tx - this.px) > 2 ? Math.sign(tx - this.px) : 0;
    const my = Math.abs(ty - this.py) > 2 ? Math.sign(ty - this.py) : 0;
    return [mx, my, true];
  }

  // ---- drawing ----------------------------------------------------------------
  draw(g) {
    const pal = PAL[(this.wave - 1) % PAL.length];
    g.fillStyle = '#000'; g.fillRect(0, 0, this.W, this.H);
    txt(g, pad(this.score), 6, 3, '#fff', 8);
    txt(g, 'HI ' + pad(Math.max(this.hi, this.score)), this.W / 2, 3, '#ffe03a', 8, 'center');
    for (let i = 0; i < Math.min(5, this.lives - 1); i++) drawShip(g, this.W - 10 - i * 10, 7, pal[1]);
    g.fillStyle = '#222'; g.fillRect(0, TOP * C - 1, this.W, 1);
    // mushrooms
    for (let r = TOP; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const hp = this.mush[r][c]; if (!hp) continue;
      const x = c * C, y = r * C, h = 2 + hp * 1.5;
      g.fillStyle = pal[0]; g.beginPath(); g.ellipse(x + 4, y + 4, 3.8, Math.min(3.6, h * 0.55), 0, Math.PI, 0); g.fill();
      g.fillRect(x + 0.5, y + 3.6, 7, 1);
      if (hp > 1) { g.fillStyle = pal[1]; g.fillRect(x + 2.6, y + 4.5, 2.8, Math.min(3.5, hp)); }
      if (hp > 2) { g.fillStyle = '#000'; g.fillRect(x + 2, y + 1.6, 1, 1); g.fillRect(x + 5, y + 2, 1, 1); }
    }
    // bug
    for (const s of this.segs) {
      if (!s.alive) continue;
      const head = this.isHead(s), x = s.x + 4, y = s.y + 4, w = ((this.t / 4 + s.x / 8) | 0) % 2;
      g.fillStyle = pal[1];
      g.fillRect(x - 4, y + (w ? -1 : 1), 1.4, 2); g.fillRect(x + 2.6, y + (w ? 1 : -1), 1.4, 2);
      g.fillStyle = head ? pal[2] : pal[0];
      g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill();
      if (head) {
        g.fillStyle = '#000'; g.fillRect(x + s.dir * 1.5 - 0.6, y - 1.5, 1.4, 1.4);
        g.strokeStyle = pal[2]; g.lineWidth = 0.8; g.beginPath();
        g.moveTo(x + s.dir * 2, y - 3); g.lineTo(x + s.dir * 4, y - 5.5); g.moveTo(x, y - 3.4); g.lineTo(x + s.dir * 1, y - 6); g.stroke();
      }
    }
    // spider
    if (this.spider) {
      const s = this.spider, w = ((this.t / 5) | 0) % 2;
      g.strokeStyle = '#ff3ab4'; g.lineWidth = 1; g.beginPath();
      for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) { g.moveTo(s.x + sd * 2, s.y); g.lineTo(s.x + sd * 6, s.y - 3 + k * 3 + (w ? 1 : -1)); g.lineTo(s.x + sd * 8, s.y - 1 + k * 3); }
      g.stroke();
      g.fillStyle = '#b46cff'; g.beginPath(); g.ellipse(s.x, s.y, 3.6, 3, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.fillRect(s.x - 2, s.y - 1, 1.2, 1.2); g.fillRect(s.x + 1, s.y - 1, 1.2, 1.2);
    }
    if (this.flea) {
      const f = this.flea, x = f.c * C + 4;
      g.fillStyle = '#ffe03a'; g.beginPath(); g.ellipse(x, f.y, 3, 4, 0, 0, 7); g.fill();
      g.fillStyle = '#ff3a3a'; g.fillRect(x - 3, f.y + 3, 1, 2); g.fillRect(x + 2, f.y + 3, 1, 2);
    }
    // blaster + shot
    if (this.phase !== 'dying' || ((this.phaseT / 5) | 0) % 2) drawShip(g, this.px, this.py, this.phase === 'dying' ? '#ff8a3d' : pal[1]);
    if (this.shot) { g.fillStyle = '#fff'; g.fillRect(this.shot.x - 0.5, this.shot.y, 1, 5); }
    for (const p of this.pops) {
      if (p.text) { txt(g, p.text, p.x, p.y - 4, '#fff', 7, 'center'); continue; }
      g.fillStyle = '#fff';
      for (let i = 0; i < 6; i++) { const a = i * 1.047 + p.t * 0.3, k = 14 - p.t; g.fillRect(p.x + Math.cos(a) * k * 0.5, p.y + Math.sin(a) * k * 0.5, 1.3, 1.3); }
    }
    if (this.phase === 'ready') txt(g, this.wave > 1 ? 'GET READY' : 'BUG BLASTER', this.W / 2, 120, '#fff', 10, 'center');
    if (this.phase === 'over') txt(g, 'GAME OVER', this.W / 2, 120, '#ff3a3a', 10, 'center');
  }
}

// The blaster: a little garden gnome-ish wand with a bright tip.
function drawShip(g, x, y, col) {
  g.fillStyle = col; g.fillRect(x - 3, y - 1, 6, 5); g.fillRect(x - 1, y - 4, 2, 3);
  g.fillStyle = '#fff'; g.fillRect(x - 0.5, y - 5, 1, 1.5);
}
