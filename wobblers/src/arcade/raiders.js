// SPACE RAIDERS: a shoot-the-aliens arcade game in the classic mould (original
// alien designs). A grid of 55 raiders marches side to side, stepping down at
// each edge and speeding up as their numbers fall; four shields crumble under
// fire from both sides; a saucer crosses the top now and then for bonus points.
// Clear the grid for the next (lower-starting) wave; lose when they land.
import { txt, pad, bitmap, clamp } from './common.js';

// 12 x 8 pixel sprites, two frames each (original designs).
const SPR = {
  a: [[
    '....####....',
    '..########..',
    '.##..##..##.',
    '.##########.',
    '...##..##...',
    '..##.##.##..',
    '.##......##.',
    '..#......#..',
  ], [
    '....####....',
    '..########..',
    '.##..##..##.',
    '.##########.',
    '...##..##...',
    '..##.##.##..',
    '...#....#...',
    '..#......#..',
  ]],
  b: [[
    '..#......#..',
    '...#....#...',
    '..########..',
    '.##.####.##.',
    '############',
    '#.########.#',
    '#.#......#.#',
    '...##..##...',
  ], [
    '..#......#..',
    '#..#....#..#',
    '#.########.#',
    '###.####.###',
    '############',
    '..########..',
    '..#......#..',
    '.#........#.',
  ]],
  c: [[
    '...######...',
    '.##########.',
    '############',
    '##..####..##',
    '############',
    '..###..###..',
    '.##..##..##.',
    '##........##',
  ], [
    '...######...',
    '.##########.',
    '############',
    '##..####..##',
    '############',
    '...##..##...',
    '..##.##.##..',
    '...##..##...',
  ]],
};
const ROWS = ['a', 'b', 'b', 'c', 'c'], PTS = { a: 30, b: 20, c: 10 }, COLS = { a: '#ff5af0', b: '#5af0ff', c: '#7aff5a' };
const SHIP = [
  '......#......',
  '.....###.....',
  '.....###.....',
  '.###########.',
  '#############',
  '#############',
  '#############',
];
const SAUCER = [
  '.....######.....',
  '...##########...',
  '..############..',
  '.##.##.##.##.##.',
  '################',
  '..###..##..###..',
  '...#........#...',
];
const PY = 214, GROUND = 234, SHY = 186;

export class SpaceRaiders {
  static id = 'raiders';
  static title = 'SPACE RAIDERS';
  static slots = 1;
  static color = '#7aff5a';
  constructor() {
    this.W = 224; this.H = 256;
    this.snd = null; this.hi = 0;
    this.reset();
  }
  sfx(n) { this.snd?.(n); }

  reset() {
    this.score = 0; this.lives = 3; this.wave = 1; this.over = false; this.extra = false; this.landed = false; this.t = 0;
    this.shields = [0, 1, 2, 3].map((i) => ({ x: 26 + i * 50, px: shieldBits() }));
    this.newWave();
    this.sfx('start');
  }
  newWave() {
    this.alive = ROWS.map(() => new Array(11).fill(true));
    this.count = 55;
    this.gx = 24; this.gy = 44 + Math.min(this.wave - 1, 6) * 8; this.gdx = 1;
    this.frame = 0; this.stepT = 0; this.note = 0;
    this.px = 112; this.shot = null; this.bombs = []; this.booms = [];
    this.ufo = null; this.ufoT = 1200 + Math.random() * 600; this.bombT = 60;
    this.phase = 'ready'; this.phaseT = 90;
  }
  alienXY(r, c) { return [this.gx + c * 16, this.gy + r * 16]; }

  step(inputs) {
    this.t++;
    const inp = inputs?.[0];
    for (const b of this.booms) b.t--;
    this.booms = this.booms.filter((b) => b.t > 0);
    if (this.phase === 'ready') { if (--this.phaseT <= 0) this.phase = 'play'; return; }
    if (this.phase === 'dying') {
      if (--this.phaseT <= 0) {
        this.lives--;
        if (this.lives <= 0 || this.landed) { this.over = true; this.phase = 'over'; return; }
        this.bombs = []; this.px = 112; this.phase = 'play';
      }
      return;
    }
    if (this.phase === 'cleared') { if (--this.phaseT <= 0) { this.wave++; this.newWave(); } return; }
    if (this.phase !== 'play') return;
    // ---- player
    let mx = 0, fire = false;
    if (inp) { mx = Math.abs(inp.x) > 0.25 ? Math.sign(inp.x) : 0; fire = inp.fire; } else [mx, fire] = this.demo();
    this.px = clamp(this.px + mx * 1.4, 10, this.W - 10);
    if (fire && !this.shot) { this.shot = { x: this.px, y: PY - 4 }; this.sfx('shoot'); }
    if (this.shot) {
      const s = this.shot;
      for (let k = 0; k < 5 && this.shot; k++) { s.y -= 1; this.hitTest(s, true); }
      if (this.shot && s.y < 18) { this.booms.push({ x: s.x, y: 20, t: 12, small: true }); this.shot = null; }
    }
    // ---- the march
    if (++this.stepT >= this.stepEvery()) {
      this.stepT = 0;
      this.march();
      if (this.phase !== 'play') return;
    }
    // ---- saucer
    if (this.ufo) {
      this.ufo.x += this.ufo.dx * 0.9;
      if (this.t % 6 === 0) this.sfx('ufo');
      if (this.ufo.x < -20 || this.ufo.x > this.W + 20) this.ufo = null;
    } else if (--this.ufoT <= 0 && this.count > 6) {
      const dx = Math.random() < 0.5 ? 1 : -1;
      this.ufo = { x: dx > 0 ? -16 : this.W + 16, dx };
      this.ufoT = 1300 + Math.random() * 700;
    }
    // ---- bombs
    if (--this.bombT <= 0 && this.bombs.length < Math.min(3 + (this.wave >> 1), 5)) {
      this.dropBomb();
      this.bombT = Math.max(14, 48 - this.wave * 4 - (55 - this.count) * 0.4) * (0.6 + Math.random() * 0.8);
    }
    const bs = 1.6 + Math.min(this.wave, 6) * 0.15 + (this.count < 10 ? 0.6 : 0);
    for (const b of this.bombs) {
      for (let k = 0; k < 4 && !b.dead; k++) {
        b.y += bs / 4;
        if (this.shieldHit(b.x, b.y + 4, 3)) { b.dead = true; break; }
        if (this.shot && Math.abs(this.shot.x - b.x) < 2.5 && Math.abs(this.shot.y - b.y) < 5) { b.dead = true; this.booms.push({ x: b.x, y: b.y, t: 10, small: true }); this.shot = null; break; }
        if (b.y + 4 >= PY - 3 && b.y < PY + 5 && Math.abs(b.x - this.px) < 7) { b.dead = true; this.die(); return; }
        if (b.y > GROUND - 2) { b.dead = true; this.booms.push({ x: b.x, y: GROUND - 3, t: 10, small: true }); }
      }
    }
    this.bombs = this.bombs.filter((b) => !b.dead);
  }

  stepEvery() { return Math.max(1, Math.round(1 + this.count * 0.55 - Math.min(this.wave - 1, 4))); }

  march() {
    let minX = 1e9, maxX = -1e9, maxY = -1e9;
    this.alive.forEach((row, r) => row.forEach((on, c) => {
      if (!on) return;
      const [x, y] = this.alienXY(r, c);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + 12); maxY = Math.max(maxY, y + 8);
    }));
    const dx = this.count === 1 ? 4 : 2;
    if ((this.gdx > 0 && maxX + dx > this.W - 6) || (this.gdx < 0 && minX - dx < 6)) { this.gy += 8; this.gdx = -this.gdx; maxY += 8; }
    else this.gx += this.gdx * dx;
    this.frame ^= 1;
    this.sfx('march' + (this.note++ % 4));
    // aliens chew through the shields they reach
    this.alive.forEach((row, r) => row.forEach((on, c) => {
      if (!on) return;
      const [x, y] = this.alienXY(r, c);
      if (y + 8 >= SHY) for (const s of this.shields) {
        for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 22; xx++) {
          const wx = s.x + xx, wy = SHY + yy;
          if (wx >= x && wx < x + 12 && wy >= y && wy < y + 8) s.px[yy][xx] = 0;
        }
      }
    }));
    if (maxY >= PY - 2) { this.landed = true; this.die(); }
  }

  dropBomb() {
    const cols = [];
    for (let c = 0; c < 11; c++) for (let r = 4; r >= 0; r--) if (this.alive[r][c]) { cols.push([r, c]); break; }
    if (!cols.length) return;
    let pick = cols[(Math.random() * cols.length) | 0];
    if (Math.random() < 0.4) { // aimed: the column nearest the cannon
      let bd = 1e9;
      for (const rc of cols) { const d = Math.abs(this.alienXY(rc[0], rc[1])[0] + 6 - this.px); if (d < bd) { bd = d; pick = rc; } }
    }
    const [x, y] = this.alienXY(pick[0], pick[1]);
    this.bombs.push({ x: x + 6, y: y + 8, kind: (Math.random() * 3) | 0 });
  }

  // player shot vs aliens, saucer and shields (one pixel step)
  hitTest(s) {
    if (this.shieldHit(s.x, s.y, 2)) { this.shot = null; return; }
    if (this.ufo && s.y < 38 && s.y > 26 && Math.abs(s.x - this.ufo.x) < 8) {
      const v = [50, 100, 150, 300][(Math.random() * 4) | 0];
      this.add(v); this.booms.push({ x: this.ufo.x, y: 31, t: 50, text: v }); this.ufo = null; this.shot = null;
      this.sfx('ufohit'); return;
    }
    for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) {
      if (!this.alive[r][c]) continue;
      const [x, y] = this.alienXY(r, c);
      if (s.x >= x && s.x < x + 12 && s.y >= y && s.y < y + 8) {
        this.alive[r][c] = false; this.count--;
        this.add(PTS[ROWS[r]]);
        this.booms.push({ x: x + 6, y: y + 4, t: 14 });
        this.shot = null; this.sfx('boom');
        if (!this.count) { this.phase = 'cleared'; this.phaseT = 100; this.bombs = []; this.sfx('clear'); }
        return;
      }
    }
  }

  shieldHit(x, y, rad) {
    if (y < SHY || y >= SHY + 16) return false;
    for (const s of this.shields) {
      const lx = Math.round(x - s.x), ly = Math.round(y - SHY);
      if (lx < 0 || lx >= 22 || !s.px[ly]?.[lx]) continue;
      for (let yy = -rad - 1; yy <= rad + 1; yy++) for (let xx = -rad; xx <= rad; xx++) {
        if (xx * xx + yy * yy > rad * rad + 1 || Math.random() < 0.25) continue;
        if (s.px[ly + yy] && lx + xx >= 0 && lx + xx < 22) s.px[ly + yy][lx + xx] = 0;
      }
      return true;
    }
    return false;
  }

  die() {
    if (this.phase === 'dying') return;
    this.phase = 'dying'; this.phaseT = 100; this.shot = null;
    this.booms.push({ x: this.px, y: PY + 2, t: 90, ship: true });
    this.sfx('die');
  }
  add(v) {
    const was = this.score; this.score += v;
    if (!this.extra && was < 1500 && this.score >= 1500) { this.extra = true; this.lives++; this.sfx('extra'); }
  }

  // Attract-mode gunner: line up under the lowest raider nearby, dodge bombs.
  demo() {
    let tx = this.px, bd = 1e9;
    for (let c = 0; c < 11; c++) for (let r = 4; r >= 0; r--) if (this.alive[r][c]) {
      const x = this.alienXY(r, c)[0] + 6, d = Math.abs(x - this.px) - r * 4;
      if (d < bd) { bd = d; tx = x + this.gdx * 4; }
      break;
    }
    if (this.ufo && Math.abs(this.ufo.x - this.px) < 60) tx = this.ufo.x + this.ufo.dx * 30;
    const threat = this.bombs.find((b) => b.y > PY - 60 && Math.abs(b.x - this.px) < 10);
    if (threat) return [threat.x > this.px ? -1 : 1, false];
    const mx = Math.abs(tx - this.px) > 2 ? Math.sign(tx - this.px) : 0;
    return [mx, Math.abs(tx - this.px) < 6];
  }

  // ---- drawing ----------------------------------------------------------------
  draw(g) {
    g.fillStyle = '#000'; g.fillRect(0, 0, this.W, this.H);
    txt(g, 'SCORE', 12, 2, '#fff', 8); txt(g, pad(this.score, 5), 12, 10, '#fff', 8);
    txt(g, 'HI-SCORE', 112, 2, '#fff', 8, 'center'); txt(g, pad(Math.max(this.hi, this.score), 5), 112, 10, '#fff', 8, 'center');
    txt(g, 'WAVE ' + this.wave, 212, 10, '#7aff5a', 8, 'right');
    // raiders
    this.alive.forEach((row, r) => row.forEach((on, c) => {
      if (!on) return;
      const [x, y] = this.alienXY(r, c);
      bitmap(g, SPR[ROWS[r]][this.frame], x, y, COLS[ROWS[r]]);
    }));
    if (this.ufo) bitmap(g, SAUCER, this.ufo.x - 8, 28, '#ff3a3a');
    // shields
    g.fillStyle = '#3aff6a';
    for (const s of this.shields) for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 22; xx++) if (s.px[yy][xx]) g.fillRect(s.x + xx, SHY + yy, 1, 1);
    // cannon
    const dying = this.phase === 'dying';
    if (!dying || ((this.phaseT / 6) | 0) % 2) bitmap(g, SHIP, this.px - 6, PY - 3, dying ? '#ff8a3a' : '#3aff6a');
    if (this.shot) { g.fillStyle = '#fff'; g.fillRect(this.shot.x - 0.5, this.shot.y, 1, 4); }
    g.fillStyle = '#fff';
    for (const b of this.bombs) {
      const w = ((this.t / 4) | 0) % 2;
      if (b.kind === 0) { g.fillRect(b.x - 0.5, b.y, 1, 5); g.fillRect(b.x - 1.5, b.y + (w ? 1 : 3), 3, 1); }
      else if (b.kind === 1) for (let k = 0; k < 5; k++) g.fillRect(b.x - 1 + ((k + w) % 2) * 1.5, b.y + k, 1, 1);
      else { g.fillRect(b.x - 0.5, b.y, 1, 5); g.fillRect(b.x - 1.5, b.y + 4, 3, 1); }
    }
    for (const b of this.booms) {
      if (b.text) { txt(g, b.text, b.x, b.y - 3, '#ff3a3a', 7, 'center'); continue; }
      g.fillStyle = b.ship ? '#ff8a3a' : '#fff';
      const k = b.small ? 2 : 4;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + b.t; g.fillRect(b.x + Math.cos(a) * k * (1 + (i % 2)) - 0.5, b.y + Math.sin(a) * k * (1 + (i % 2)) - 0.5, 1.4, 1.4); }
    }
    g.fillStyle = '#3aff6a'; g.fillRect(0, GROUND, this.W, 1);
    txt(g, Math.max(0, this.lives), 8, GROUND + 5, '#fff', 8);
    for (let i = 0; i < Math.min(4, this.lives - 1); i++) bitmap(g, SHIP, 22 + i * 17, GROUND + 6, '#3aff6a');
    if (this.phase === 'ready') txt(g, 'WAVE ' + this.wave, 112, 150, '#fff', 10, 'center');
    if (this.phase === 'cleared') txt(g, 'WAVE CLEARED!', 112, 150, '#7aff5a', 10, 'center');
    if (this.phase === 'over') txt(g, 'GAME OVER', 112, 150, '#ff3a3a', 10, 'center');
  }
}

function shieldBits() {
  const rows = [];
  for (let y = 0; y < 16; y++) {
    const row = [];
    for (let x = 0; x < 22; x++) {
      let on = 1;
      if (y < 4 && (x < 4 - y || x > 17 + y)) on = 0;      // rounded top corners
      if (y >= 11 && x >= 7 && x <= 14 && !(y === 11 && (x === 7 || x === 14))) on = 0; // notch underneath
      row.push(on);
    }
    rows.push(row);
  }
  return rows;
}
