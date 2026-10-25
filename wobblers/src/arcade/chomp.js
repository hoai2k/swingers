// CHOMP MAZE: a maze-chomping arcade game in the classic mould (an original
// maze, chomper and ghosts). Eat every dot to clear the maze; the four corner
// power pellets turn the ghosts blue for a few seconds so you can eat them.
// Each ghost hunts differently: Rusty (red) goes straight for you, Petal (pink)
// aims four tiles ahead of you, Splash (cyan) flanks using Rusty's position and
// Sunny (orange) chases from afar but wanders off when close. Ghosts alternate
// between scatter (each heads for its own corner) and chase.
import { txt, pad } from './common.js';

const MAZE = [
  '############################',
  '#o...........##...........o#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.#####.##.#####.######',
  '######.##..........##.######',
  '######.##.###--###.##.######',
  '######.##.#      #.##.######',
  'TTTTTT....#      #....TTTTTT',
  '######.##.#      #.##.######',
  '######.##.########.##.######',
  '######.##..........##.######',
  '######.##.########.##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];
const MW = 28, MH = MAZE.length, T = 8, OY = 24;
const inHouse = (x, y) => y >= 10 && y <= 12 && x >= 11 && x <= 16;
const wall = (x, y) => { x = ((x % MW) + MW) % MW; if (y < 0 || y >= MH) return true; const c = MAZE[y][x]; return c === '#' || c === '-'; };
const open = (x, y) => !wall(x, y) && !inHouse(((x % MW) + MW) % MW, y);
const DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]]; // up, left, down, right (classic tie order)
const nextC = (v, d) => (d > 0 ? Math.floor(v + 1e-6) + 1 : Math.ceil(v - 1e-6) - 1);
const MODES = [7, 20, 7, 20, 5, 20, 5, Infinity]; // scatter, chase, scatter, ...

const GHOSTS = [
  { name: 'RUSTY', col: '#ff3030', corner: [25, -3], home: [13.5, 8], out: true, release: 0 },
  { name: 'PETAL', col: '#ffa0d8', corner: [2, -3], home: [13.5, 11], release: 1 },
  { name: 'SPLASH', col: '#30e8ff', corner: [27, 25], home: [11.5, 11], release: 5 },
  { name: 'SUNNY', col: '#ffa840', corner: [0, 25], home: [15.5, 11], release: 9 },
];

let wallArt = null; // pre-rendered maze walls (blue, and white for the level-clear flash)
function paintWalls(white) {
  const cv = document.createElement('canvas'); cv.width = MW * T * 2; cv.height = MH * T * 2;
  const g = cv.getContext('2d'); g.scale(2, 2);
  const solid = (x, y) => x < 0 || x >= MW || y < 0 || y >= MH || MAZE[y][x] === '#';
  g.strokeStyle = white ? '#ffffff' : '#3a5bff'; g.lineWidth = 1.5; g.lineCap = 'round';
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (MAZE[y][x] !== '#') continue;
    g.fillStyle = white ? '#334' : '#0b0b3a'; g.fillRect(x * T, y * T, T, T);
    const X = x * T, Y = y * T;
    g.beginPath();
    if (!solid(x, y - 1)) { g.moveTo(X, Y + 1); g.lineTo(X + T, Y + 1); }
    if (!solid(x, y + 1)) { g.moveTo(X, Y + T - 1); g.lineTo(X + T, Y + T - 1); }
    if (!solid(x - 1, y)) { g.moveTo(X + 1, Y); g.lineTo(X + 1, Y + T); }
    if (!solid(x + 1, y)) { g.moveTo(X + T - 1, Y); g.lineTo(X + T - 1, Y + T); }
    g.stroke();
  }
  g.fillStyle = '#ffb8de';
  for (let x = 0; x < MW; x++) if (MAZE[9][x] === '-') g.fillRect(x * T, 9 * T + 3, T, 2);
  return cv;
}

export class ChompMaze {
  static id = 'chomp';
  static title = 'CHOMP MAZE';
  static slots = 1;
  static color = '#ffe03a';
  constructor() {
    this.W = 224; this.H = OY + MH * T + 16;
    this.snd = null; this.hi = 0;
    this.reset();
  }
  sfx(n) { this.snd?.(n); }

  reset() {
    this.score = 0; this.lives = 3; this.level = 1; this.over = false; this.extra = false;
    this.t = 0;
    this.newLevel();
    this.phase = 'ready'; this.phaseT = 150;
    this.sfx('start');
  }
  newLevel() {
    this.dots = MAZE.map((r) => r.split('').map((c) => (c === '.' ? 1 : c === 'o' ? 2 : 0)));
    this.left = this.dots.flat().filter(Boolean).length;
    this.eaten = 0; this.berry = null; this.berries = 0;
    this.resetActors();
  }
  resetActors() {
    this.p = { x: 13.5, y: 18, dx: -1, dy: 0, fx: -1, fy: 0, want: null, mouth: 0, dead: 0 };
    this.g = GHOSTS.map((d) => ({ ...d, x: d.home[0], y: d.home[1], dx: -1, dy: 0, state: d.out ? 'active' : 'house', fright: 0, bob: Math.random() * 6 }));
    this.mode = 0; this.modeT = MODES[0] * 60; this.fright = 0; this.combo = 0; this.lt = 0;
    this.pop = null; this.freeze = 0; this.ai = null;
  }
  scatter() { return this.mode % 2 === 0; }
  speed(base) { const lv = Math.min(this.level, 6) - 1; return base * (1 + lv * 0.06); }

  step(inputs) {
    this.t++;
    const inp = inputs?.[0];
    if (this.phase === 'ready') { if (--this.phaseT <= 0) this.phase = 'play'; return; }
    if (this.phase === 'dying') {
      if (--this.phaseT <= 0) {
        this.lives--;
        if (this.lives <= 0) { this.over = true; this.phase = 'over'; return; }
        this.resetActors(); this.phase = 'ready'; this.phaseT = 120;
      }
      return;
    }
    if (this.phase === 'clear') {
      if (--this.phaseT <= 0) { this.level++; this.newLevel(); this.phase = 'ready'; this.phaseT = 120; }
      return;
    }
    if (this.phase !== 'play') return;
    if (this.freeze > 0) { this.freeze--; return; } // short pause after eating a ghost
    this.lt++;
    // ---- input -> wanted direction
    const p = this.p;
    if (inp) {
      const ax = Math.abs(inp.x), ay = Math.abs(inp.y);
      if (Math.max(ax, ay) > 0.4) p.want = ax > ay ? [Math.sign(inp.x), 0] : [0, -Math.sign(inp.y)];
    } else this.demo();
    // reverse straight away mid-corridor
    if (p.want && p.want[0] === -p.dx && p.want[1] === -p.dy && (p.dx || p.dy)) { p.dx = p.want[0]; p.dy = p.want[1]; }
    const before = p.x + p.y;
    this.walk(p, this.speed(this.fright > 0 ? 0.145 : 0.13), (e) => this.playerCentre(e));
    if (p.dx || p.dy) { p.fx = p.dx; p.fy = p.dy; }
    p.mouth += Math.abs(p.x + p.y - before);
    // ---- modes and fright
    if (this.fright > 0) {
      if (--this.fright <= 0) for (const gh of this.g) gh.fright = 0;
    } else if (--this.modeT <= 0) {
      this.mode++; this.modeT = MODES[Math.min(this.mode, MODES.length - 1)] * 60;
      for (const gh of this.g) if (gh.state === 'active') { gh.dx = -gh.dx; gh.dy = -gh.dy; }
    }
    // ---- ghosts
    for (const gh of this.g) this.moveGhost(gh);
    // ---- berry
    if (this.berry && --this.berry.t <= 0) this.berry = null;
    if (this.berry && Math.hypot(p.x - 13.5, p.y - 14) < 0.7) {
      const v = Math.min(1000, 100 * this.level);
      this.add(v); this.pop = { x: 13.5, y: 14, v, t: 60 }; this.berry = null; this.sfx('fruit');
    }
    // ---- collisions
    for (const gh of this.g) {
      if (gh.state !== 'active') continue;
      let dx = Math.abs(gh.x - p.x); dx = Math.min(dx, MW - dx);
      if (dx + Math.abs(gh.y - p.y) > 0.75) continue;
      if (gh.fright) {
        gh.state = 'eyes'; gh.fright = 0;
        const v = 200 * Math.pow(2, this.combo++);
        this.add(v); this.pop = { x: gh.x, y: gh.y, v, t: 50 }; this.freeze = 30;
        this.sfx('eatghost');
      } else {
        this.phase = 'dying'; this.phaseT = 100; p.dead = 1; this.sfx('die');
        return;
      }
    }
    if (this.pop && --this.pop.t <= 0) this.pop = null;
  }

  add(v) {
    const was = this.score;
    this.score += v;
    if (!this.extra && was < 10000 && this.score >= 10000) { this.extra = true; this.lives++; this.sfx('extra'); }
  }

  // Move an actor along the corridors; `centre(e)` decides at each tile centre.
  walk(e, speed, centre) {
    let rem = speed;
    for (let guard = 0; rem > 1e-9 && guard < 4; guard++) {
      if (!e.dx && !e.dy) { centre(e); if (!e.dx && !e.dy) return; }
      const horiz = e.dx !== 0, d = horiz ? e.dx : e.dy, cur = horiz ? e.x : e.y;
      const tgt = nextC(cur, d), dist = Math.abs(tgt - cur);
      if (rem < dist) { if (horiz) e.x += d * rem; else e.y += d * rem; return; }
      if (horiz) e.x = tgt; else e.y = tgt;
      rem -= dist;
      if (e.x < -0.5) e.x += MW; else if (e.x > MW - 0.5) e.x -= MW;
      centre(e);
    }
  }

  playerCentre(p) {
    const cx = Math.round(p.x), cy = Math.round(p.y);
    const d = this.dots[cy]?.[cx];
    if (d) {
      this.dots[cy][cx] = 0; this.left--; this.eaten++;
      if (d === 1) { this.add(10); this.sfx(this.eaten % 2 ? 'waka1' : 'waka2'); }
      else {
        this.add(50); this.combo = 0; this.sfx('power');
        this.fright = Math.max(90, 420 - (this.level - 1) * 60);
        for (const gh of this.g) if (gh.state !== 'eyes') { gh.fright = 1; if (gh.state === 'active') { gh.dx = -gh.dx; gh.dy = -gh.dy; } }
      }
      if (this.eaten === 70 || this.eaten === 170) this.berry = { t: 560 };
      if (this.left <= 0) { this.phase = 'clear'; this.phaseT = 150; this.sfx('clear'); return; }
    }
    if (p.want && open(cx + p.want[0], cy + p.want[1])) { p.dx = p.want[0]; p.dy = p.want[1]; }
    else if (!open(cx + p.dx, cy + p.dy)) { p.dx = 0; p.dy = 0; }
  }

  target(gh) {
    const p = this.p, px = Math.round(p.x), py = Math.round(p.y);
    if (gh.state === 'eyes') return [13.5, 8];
    if (this.scatter()) return gh.corner;
    switch (gh.name) {
      case 'RUSTY': return [px, py];
      case 'PETAL': return [px + p.fx * 4, py + p.fy * 4];
      case 'SPLASH': {
        const r = this.g[0], ax = px + p.fx * 2, ay = py + p.fy * 2;
        return [ax * 2 - r.x, ay * 2 - r.y];
      }
      default: return Math.hypot(gh.x - px, gh.y - py) > 8 ? [px, py] : gh.corner;
    }
  }

  moveGhost(gh) {
    if (gh.state === 'house') {
      gh.bob += 0.12; gh.y = 11 + Math.sin(gh.bob) * 0.35;
      if (this.lt >= gh.release * 60) gh.state = 'leave';
      return;
    }
    if (gh.state === 'leave') {
      const s = 0.06;
      if (Math.abs(gh.x - 13.5) > 0.01) gh.x += Math.sign(13.5 - gh.x) * Math.min(s, Math.abs(13.5 - gh.x));
      else if (gh.y > 8) gh.y = Math.max(8, gh.y - s);
      else { gh.state = 'active'; gh.dx = -1; gh.dy = 0; }
      return;
    }
    if (gh.state === 'enter') {
      gh.x = 13.5; gh.y = Math.min(11, gh.y + 0.15);
      if (gh.y >= 11) { gh.state = 'leave'; gh.fright = 0; }
      return;
    }
    let sp = gh.state === 'eyes' ? 0.3 : gh.fright ? 0.07 : this.speed(0.12);
    if (Math.round(gh.y) === 11 && (gh.x < 6 || gh.x > 21) && gh.state !== 'eyes') sp = 0.065;
    this.walk(gh, sp, (e) => this.ghostCentre(e));
  }

  ghostCentre(gh) {
    const cx = Math.round(gh.x), cy = Math.round(gh.y);
    if (gh.state === 'eyes' && cy === 8 && (cx === 13 || cx === 14)) { gh.state = 'enter'; gh.x = 13.5; gh.dx = gh.dy = 0; return; }
    const opts = DIRS.filter(([dx, dy]) => !(dx === -gh.dx && dy === -gh.dy) && open(cx + dx, cy + dy));
    if (!opts.length) { gh.dx = -gh.dx; gh.dy = -gh.dy; return; }
    let pick;
    if (gh.fright) pick = opts[(Math.random() * opts.length) | 0];
    else {
      const [tx, ty] = this.target(gh);
      let bd = Infinity;
      for (const o of opts) { const d = (cx + o[0] - tx) ** 2 + (cy + o[1] - ty) ** 2; if (d < bd) { bd = d; pick = o; } }
    }
    gh.dx = pick[0]; gh.dy = pick[1];
  }

  // Attract-mode chomper: head for the nearest dot (or a blue ghost) by BFS,
  // keeping clear of ghosts that can bite.
  demo() {
    const p = this.p, cx = Math.round(p.x), cy = Math.round(p.y);
    if (Math.abs(p.x - cx) > 0.2 || Math.abs(p.y - cy) > 0.2) return;
    const key = cx + cy * MW;
    if (this.ai === key) return;
    this.ai = key;
    const danger = this.g.filter((gh) => gh.state === 'active' && !gh.fright);
    const prey = this.g.filter((gh) => gh.state === 'active' && gh.fright && this.fright > 90);
    const bad = (x, y) => danger.some((gh) => Math.abs(gh.x - x) + Math.abs(gh.y - y) < 2.6);
    const seen = new Map([[key, null]]), q = [[cx, cy]];
    let goal = null;
    while (q.length) {
      const [x, y] = q.shift();
      if ((x !== cx || y !== cy) && (this.dots[y][x] || prey.some((gh) => Math.round(gh.x) === x && Math.round(gh.y) === y))) { goal = [x, y]; break; }
      for (const [dx, dy] of DIRS) {
        const nx = (x + dx + MW) % MW, ny = y + dy, k = nx + ny * MW;
        if (!open(nx, ny) || seen.has(k) || bad(nx, ny)) continue;
        seen.set(k, [x, y]); q.push([nx, ny]);
      }
    }
    if (!goal) { // cornered: any open way that isn't straight into a ghost
      const o = DIRS.filter(([dx, dy]) => open(cx + dx, cy + dy));
      const safest = o.sort((a, b) => score(b) - score(a))[0];
      function score(d) { return Math.min(...danger.map((gh) => Math.hypot(gh.x - cx - d[0] * 2, gh.y - cy - d[1] * 2)), 99); }
      if (safest) p.want = safest;
      return;
    }
    let c = goal, prev = seen.get(c[0] + c[1] * MW);
    while (prev && (prev[0] !== cx || prev[1] !== cy)) { c = prev; prev = seen.get(c[0] + c[1] * MW); }
    let dx = c[0] - cx; if (dx > 1) dx = -1; if (dx < -1) dx = 1;
    p.want = [dx, c[1] - cy];
  }

  // ---- drawing --------------------------------------------------------------
  draw(g) {
    g.fillStyle = '#000'; g.fillRect(0, 0, this.W, this.H);
    txt(g, '1UP', 24, 2, '#fff', 8); txt(g, pad(this.score), 16, 11, '#fff', 8);
    txt(g, 'HIGH SCORE', 112, 2, '#fff', 8, 'center'); txt(g, pad(Math.max(this.hi, this.score)), 112, 11, '#fff', 8, 'center');
    txt(g, 'LEVEL ' + this.level, 208, 11, '#ffe03a', 8, 'right');
    const flash = this.phase === 'clear' && ((this.phaseT / 12) | 0) % 2;
    wallArt ??= [paintWalls(false), paintWalls(true)];
    g.drawImage(wallArt[flash ? 1 : 0], 0, OY, MW * T, MH * T);
    g.save(); g.beginPath(); g.rect(0, OY, this.W, MH * T); g.clip();
    // dots
    const blink = ((this.t / 12) | 0) % 2 === 0 || this.phase !== 'play';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const d = this.dots[y][x];
      if (d === 1) { g.fillStyle = '#ffc8a8'; g.fillRect(x * T + 3, OY + y * T + 3, 2, 2); }
      else if (d === 2 && blink) { g.fillStyle = '#ffc8a8'; g.beginPath(); g.arc(x * T + 4, OY + y * T + 4, 3.4, 0, 7); g.fill(); }
    }
    if (this.berry) drawBerry(g, 13.5 * T + 4, OY + 14 * T + 4);
    // ghosts
    if (this.phase !== 'clear' && !(this.phase === 'dying' && this.phaseT < 70)) {
      for (const gh of this.g) this.drawGhost(g, gh);
    }
    this.drawChomper(g);
    if (this.pop) txt(g, this.pop.v, this.pop.x * T + 4, OY + this.pop.y * T, '#30e8ff', 7, 'center');
    g.restore();
    if (this.phase === 'ready') txt(g, 'READY!', 112, OY + 14 * T - 1, '#ffe03a', 9, 'center');
    if (this.phase === 'over') txt(g, 'GAME  OVER', 112, OY + 14 * T - 1, '#ff3030', 9, 'center');
    // lives and berries
    for (let i = 0; i < Math.min(5, this.lives - 1); i++) drawChomp(g, 12 + i * 14, this.H - 8, 5.5, 0.25, -1, 0);
    for (let i = 0; i < Math.min(6, this.level); i++) drawBerry(g, 210 - i * 14, this.H - 8);
  }
  drawChomper(g) {
    const p = this.p, x = p.x * T + 4, y = OY + p.y * T + 4;
    if (this.phase === 'dying') {
      const k = Math.min(1, (100 - this.phaseT) / 70);
      if (k >= 1) return;
      drawChomp(g, x, y, 6.5 * (1 - k * 0.3), 0.2 + k * 2.9, 0, -1);
      return;
    }
    const open_ = this.phase === 'play' ? Math.abs(Math.sin(p.mouth * 2.6)) * 0.75 + 0.05 : 0.4;
    drawChomp(g, x, y, 6.5, open_, p.fx, p.fy);
    if (x < 6) drawChomp(g, x + MW * T, y, 6.5, open_, p.fx, p.fy); // through the tunnel
    if (x > MW * T - 6) drawChomp(g, x - MW * T, y, 6.5, open_, p.fx, p.fy);
  }
  drawGhost(g, gh) {
    const x = gh.x * T + 4, y = OY + gh.y * T + 4;
    const eyesOnly = gh.state === 'eyes' || gh.state === 'enter';
    if (!eyesOnly) {
      let col = gh.col;
      if (gh.fright) col = this.fright < 120 && ((this.fright / 10) | 0) % 2 ? '#ffffff' : '#2233ff';
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y - 1, 6.5, Math.PI, 0);
      g.lineTo(x + 6.5, y + 6);
      const w = ((this.t / 8) | 0) % 2;
      for (let i = 0; i < 4; i++) { const fx = x + 6.5 - (i + 0.5) * 3.25; g.lineTo(fx, y + (i % 2 === w ? 3.5 : 6)); g.lineTo(fx - 1.6, y + 6); }
      g.lineTo(x - 6.5, y + 6); g.closePath(); g.fill();
      if (gh.fright) {
        g.fillStyle = col === '#ffffff' ? '#ff3030' : '#ffd0b0';
        g.fillRect(x - 3, y - 3, 2, 2); g.fillRect(x + 1, y - 3, 2, 2);
        for (let i = 0; i < 4; i++) g.fillRect(x - 4.5 + i * 2.5, y + 2 + (i % 2), 2, 1);
        return;
      }
    }
    const lx = gh.dx * 1.4, ly = gh.dy * 1.4;
    for (const s of [-1, 1]) {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x + s * 2.6 + lx * 0.5, y - 2 + ly * 0.5, 2, 2.6, 0, 0, 7); g.fill();
      g.fillStyle = '#1838ff'; g.beginPath(); g.arc(x + s * 2.6 + lx, y - 2 + ly, 1.2, 0, 7); g.fill();
    }
  }
}

// The chomper: a round yellow fellow with a little eye and a cap-like brow.
function drawChomp(g, x, y, r, open, fx, fy) {
  const a = Math.atan2(fy, fx || (fy ? 0 : 1));
  const m = Math.min(Math.PI * 0.98, open);
  g.fillStyle = '#ffe03a';
  g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + m, a - m + Math.PI * 2); g.closePath(); g.fill();
  if (m < 2.5) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let px = dy, py = -dx; // the side of the facing direction that is "up" on screen
    if (py > 0 || (py === 0 && px > 0)) { px = -px; py = -py; }
    g.fillStyle = '#000'; g.fillRect(x + px * r * 0.5 + dx * r * 0.15 - 0.9, y + py * r * 0.5 + dy * r * 0.15 - 0.9, 1.8, 1.8);
  }
}
function drawBerry(g, x, y) {
  g.fillStyle = '#ff3a5a'; g.beginPath(); g.arc(x - 2, y + 1, 3, 0, 7); g.arc(x + 2.4, y + 1.5, 3, 0, 7); g.fill();
  g.strokeStyle = '#3fbf3f'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 2, y - 2); g.lineTo(x + 1, y - 5); g.lineTo(x + 2.4, y - 1.5); g.stroke();
}
