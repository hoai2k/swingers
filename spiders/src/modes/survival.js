// SURVIVAL: co-op against escalating waves of insects (src/enemies/*).
//
// Flow: 'break' (WAVE N banner, weapons restocked) -> 'wave' (insects enter
// from board.enemySpawns after a warning marker at the edge) -> 'clear'
// (fallen spiders revive with spawn protection) -> every 3rd clear a 'perk'
// pick (each player chooses 1 of 3 with the stick + A) -> next 'break'.
// Every 5th wave is a boss wave (Brood Tyrant + escorts). When every spider
// is down mid-wave: 'lost' (slow motion) -> 'over' (results; A = lobby).
//
// Wave scaling (see buildWave): budget = (3 + 1.5 w) x (1 + 0.5 (players-1))
// points spent on insects unlocked by wave w (each type is introduced on its
// unlock wave); at most 4 + 2 players + w/2 insects alive at once (cap 18).
// Insects themselves get ~3% faster/quicker per wave (Enemy.agg, cap +50%).
//
// opts: { wave: start at this wave (testing), board: board id }

import { BOARDS } from '../boards.js';
import { DropSpawner, WEAPONS } from '../weapons.js';
import { settings } from '../settings.js';
import { sfx } from '../audio.js';
import { W, H } from '../board.js';
import { rand, TAU, clamp, rgba, pick } from '../util.js';
import { castAt } from '../cast.js';
import { text, drawBanner, drawPlayerTags, drawPanel, drawPortrait, drawCountdown } from '../hud.js';
import { Stinglet, Gnatling, Buzzgunner, Bladewing, Shellback, Dropmoth, Hexfly } from '../enemies/insects.js';
import { BroodTyrant } from '../enemies/boss.js';

// cost: wave budget points per spawn; from: first wave it appears; group: insects per spawn
const ROSTER = [
  { C: Stinglet,   cost: 1,   from: 1, weight: 3 },
  { C: Gnatling,   cost: 1.6, from: 2, weight: 1.6, group: (w) => 3 + Math.min(3, Math.floor(w / 5)) },
  { C: Buzzgunner, cost: 2,   from: 2, weight: 2 },
  { C: Bladewing,  cost: 3,   from: 3, weight: 1.4 },
  { C: Shellback,  cost: 3,   from: 4, weight: 1.2 },
  { C: Dropmoth,   cost: 2.5, from: 6, weight: 1.3 },
  { C: Hexfly,     cost: 3,   from: 7, weight: 1.2 },
];
const BOSS_EVERY = 5;
const PERK_EVERY = 3;            // a perk pick after waves 2, 5, 8, ...

// Perks: stackable up to max. apply(sp, n) sets spider fields on every spawn.
export const PERKS = [
  { id: 'shell',  name: 'Hard Shell',   desc: '+1 shield charge, refilled every wave', max: 3, color: '#7fe8ff', apply: (sp, n) => { sp.shield = Math.max(sp.shield, n); } },
  { id: 'legs',   name: 'Quick Legs',   desc: 'Walk 20% faster',                 max: 3, color: '#4fdc6a', apply: (sp, n) => { sp.speedMul = 1 + 0.2 * n; } },
  { id: 'spring', name: 'Spring Legs',  desc: 'Jump 15% higher',                 max: 3, color: '#ffd23f', apply: (sp, n) => { sp.jumpMul = 1 + 0.15 * n; } },
  { id: 'silk',   name: 'Long Silk',    desc: 'Webs reach 35% farther',          max: 2, color: '#f4f7ff', apply: (sp, n) => { sp.webMul = 1 + 0.35 * n; } },
  { id: 'venom',  name: 'Venom Fangs',  desc: 'Deal double damage to insects',   max: 2, color: '#b46bff', apply: (sp, n) => { sp.dmgMul = 1 + n; } },
  { id: 'saber',  name: 'Born Duelist', desc: 'Start every wave holding a saber', max: 1, color: '#4dd2ff', excl: 'armory' },
  { id: 'armory', name: 'Armory',       desc: 'Start every wave with a random gun', max: 1, color: '#ff5a5a', excl: 'saber' },
  { id: 'boom',   name: 'Last Laugh',   desc: 'Explode when you die',            max: 1, color: '#ff9a3c' },
  { id: 'wind',   name: 'Second Wind',  desc: 'Once per wave, revive 4 s after dying', max: 1, color: '#ff7ad9' },
];

const BEST_KEY = 'spiders.survival.best';
function loadBest() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* not persisted */ } }

export class SurvivalMode {
  constructor(game, opts = {}) {
    this.game = game;
    this.name = 'survival';
    this.boardId = opts.board || settings.board;
    this.startWave = Math.max(1, opts.wave | 0 || 1);
    this.wave = this.startWave - 1;
    this.state = 'break';
    this.t = 0;
    this.queue = [];          // groups still to send this wave: {C, n, boss}
    this.pending = [];        // warnings counting down: {x, y, t, T, group}
    this.spawnT = 0;
    this.lastSpawn = -1;
    this.respawns = [];       // second-wind revives {p, t}
    this.blasts = [];         // last-laugh explosions {x, y, t, owner}
    this.stats = new Map();   // player -> {kills, deaths}
    this.perkPick = null;     // {rows: [{p, offers, sel, done, lx}], t}
    this.best = loadBest();
    this.cleared = this.startWave - 1;
  }

  get friendlyFire() { return !!settings.friendlyFire; }
  teamFor() { return 'players'; }
  canPause() { return this.state !== 'over' && this.state !== 'lost'; }

  // ---- setup -------------------------------------------------------------------
  pickBoard() {
    if (this.boardId && this.boardId !== 'random') {
      const b = BOARDS.find((x) => x.id === this.boardId);
      if (b) return b;
    }
    return pick(BOARDS);
  }

  start() {
    const game = this.game;
    const def = this.pickBoard();
    const board = game.loadBoard(def);
    game.music.match(def.music);
    game.music.setDuck(1);
    this.drops = new DropSpawner(game, board, settings.dropRate);
    for (const p of game.players) {
      p.score = 0; p.kills = 0; p.deaths = 0;
      p.perks = {};
      this.stats.set(p, { kills: 0, deaths: 0 });
    }
    const spawns = board.spawns.slice().sort(() => Math.random() - 0.5);
    game.players.forEach((p, i) => {
      const [x, y] = spawns[i % spawns.length];
      this.applyPerks(game.spawnSpider(p, x, y, { invuln: 2 }), true);
    });
    if (!game.players.length) { this.state = 'over'; this.t = 0; return; }
    this.nextWave();
  }

  statsOf(p) {
    let s = this.stats.get(p);
    if (!s) { s = { kills: 0, deaths: 0 }; this.stats.set(p, s); }
    return s;
  }

  get playerCount() { return Math.max(1, this.game.players.length); }

  // ---- perks ------------------------------------------------------------------
  applyPerks(sp, waveStart = false) {
    const p = sp.player;
    if (!p) return sp;
    const perks = p.perks || {};
    for (const P of PERKS) if (perks[P.id] && P.apply) P.apply(sp, perks[P.id]);
    if (waveStart) {
      if (perks.saber && (!sp.weapon || sp.weapon.id !== 'saber')) {
        const w = this.game.createWeapon('saber');
        if (w) sp.giveWeapon(w);
      } else if (perks.armory && !sp.weapon) {
        const guns = [...WEAPONS.values()].filter((C) => C.kind === 'gun' && (C.weight ?? 1) > 0).map((C) => C.id);
        const w = guns.length && this.game.createWeapon(pick(guns));
        if (w) sp.giveWeapon(w);
      }
    }
    return sp;
  }

  offersFor(p) {
    const perks = p.perks || {};
    const pool = PERKS.filter((P) => (perks[P.id] || 0) < P.max && !(P.excl && perks[P.excl]));
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }

  startPerks() {
    this.state = 'perk'; this.t = 0;
    this.perkPick = {
      rows: this.game.players.map((p) => ({ p, offers: this.offersFor(p), sel: 1, done: false, lx: 0 })),
    };
    for (const r of this.perkPick.rows) { r.sel = Math.min(1, r.offers.length - 1); if (!r.offers.length) r.done = true; }
    sfx.perk();
  }

  updatePerks(dt) {
    const game = this.game;
    for (const sp of game.spiders) if (sp.alive) sp.stun = Math.max(sp.stun, 0.05);
    const pk = this.perkPick;
    for (const r of pk.rows) {
      if (r.done) continue;
      const s = game.input.get(r.p.inputId);
      if (!s) continue;
      let dir = 0;
      const x = s.l.x;
      if (Math.abs(x) > 0.5 && Math.abs(r.lx) <= 0.5) dir = Math.sign(x);
      r.lx = x;
      if (s.pressed.dl) dir = -1;
      if (s.pressed.dr) dir = 1;
      if (dir) { r.sel = clamp(r.sel + dir, 0, r.offers.length - 1); sfx.ui(); }
      if (this.t > 0.6 && (s.pressed.a || s.pressed.rt)) this.choosePerk(r);
    }
    // nobody waits forever
    if (this.t > 25) for (const r of pk.rows) if (!r.done) this.choosePerk(r);
    if (pk.rows.every((r) => r.done) && (pk.doneT = (pk.doneT || 0) + dt) > 0.8) {
      this.perkPick = null;
      this.nextWave();
    }
  }

  choosePerk(r) {
    const P = r.offers[r.sel];
    r.done = true;
    if (!P) return;
    const p = r.p;
    p.perks = p.perks || {};
    p.perks[P.id] = (p.perks[P.id] || 0) + 1;
    sfx.uiOk();
    if (p.spider && p.spider.alive) {
      this.applyPerks(p.spider);
      this.game.fx.text(p.spider.x, p.spider.y - 40, P.name, P.color, 24, 1.2);
      this.game.fx.ring(p.spider.x, p.spider.y, 50, P.color, 0.4, 4);
    }
  }

  // ---- waves ------------------------------------------------------------------
  buildWave(w, n) {
    const groups = [];
    const pf = 1 + 0.5 * (n - 1);
    const unlocked = ROSTER.filter((e) => e.from <= w);
    const add = (e) => groups.push({ C: e.C, n: e.group ? e.group(w) : 1 });
    let budget;
    if (w % BOSS_EVERY === 0) {
      groups.push({ C: BroodTyrant, n: 1, boss: true });
      budget = (1 + w * 0.5) * pf;
    } else {
      budget = (3 + w * 1.5) * pf;
      for (const e of unlocked) if (e.from === w) { add(e); budget -= e.cost; }   // the newcomer
    }
    let guard = 100;
    while (budget > 0.5 && guard--) {
      const opts = unlocked.filter((e) => e.cost <= budget + 0.5);
      if (!opts.length) break;
      let r = Math.random() * opts.reduce((s, e) => s + e.weight, 0);
      let e = opts[0];
      for (const o of opts) { r -= o.weight; if (r <= 0) { e = o; break; } }
      add(e);
      budget -= e.cost;
    }
    // shuffle (boss stays first)
    const head = groups.filter((g) => g.boss), rest = groups.filter((g) => !g.boss);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    return head.concat(rest);
  }

  get maxAlive() { return Math.min(18, 4 + 2 * this.playerCount + Math.floor(this.wave / 2)); }
  get isBossWave() { return this.wave % BOSS_EVERY === 0; }

  nextWave() {
    const game = this.game;
    this.wave++;
    this.state = 'break';
    this.t = 0;
    this.queue = this.buildWave(this.wave, this.playerCount);
    this.pending = [];
    this.spawnT = 0.4;
    this.respawns = [];
    // revive anyone still down, restock: a weapon at every empty spawn
    this.reviveAll();
    const free = game.board.spawns.filter(([x, y]) => !game.pickups.some((p) => !p.spent && Math.hypot(p.x - x, p.y - (y - 40)) < 120));
    this.drops.seedSpawns(free);
    for (const sp of game.spiders) if (sp.alive) { sp.windUsed = false; this.applyPerks(sp, true); }
    sfx.wave();
  }

  reviveAll() {
    const game = this.game;
    for (const p of game.players) {
      if (p.spider && p.spider.alive) continue;
      this.revive(p);
    }
  }

  revive(p, invuln = 2.2) {
    const game = this.game;
    game.spiders = game.spiders.filter((s) => s.alive);
    // the spawn with the fewest insects around it
    let best = null, bs = Infinity;
    for (const [x, y] of game.board.spawns) {
      let score = Math.random() * 50;
      for (const e of game.enemies) if (e.alive) score += Math.max(0, 600 - Math.hypot(e.x - x, e.y - y));
      if (score < bs) { bs = score; best = [x, y]; }
    }
    const sp = game.spawnSpider(p, best[0], best[1], { invuln });
    this.applyPerks(sp, true);
    sfx.revive();
    game.fx.text(sp.x, sp.y - 46, 'REVIVED', p.color.main, 26, 1.2);
    return sp;
  }

  // a spawn point for the next group: rotate through the board's list, the boss from the top
  // For each enemy spawn: an inner point it can fly to in a straight, fat line
  // (boards can wall the arena in: a ceiling must not trap insects outside).
  computeEntries() {
    const world = this.game.world;
    const targets = [];
    for (const [x, y] of this.game.board.spawns) targets.push([x, y - 90]);
    for (let x = 300; x <= W - 300; x += 220) for (let y = 180; y <= H - 220; y += 140) targets.push([x, y]);
    const free = targets.filter(([x, y]) => !world.nearest(x, y, 70) && !world.inside(x, y));
    const clear = (ax, ay, bx, by, pad) => {
      const dx = bx - ax, dy = by - ay, m = Math.hypot(dx, dy) || 1;
      const px = -dy / m * pad, py = dx / m * pad;
      return !world.segment(ax, ay, bx, by) && !world.segment(ax + px, ay + py, bx + px, by + py) && !world.segment(ax - px, ay - py, bx - px, by - py);
    };
    const entries = [];
    for (const [x, y] of this.game.board.enemySpawns) {
      let best = null, bd = Infinity, wide = false;
      for (const [tx, ty] of free) {
        const d = Math.hypot(tx - x, ty - y);
        if (d < bd && clear(x, y, tx, ty, 24)) { bd = d; best = { x: tx, y: ty }; }
      }
      if (best) { wide = clear(x, y, best.x, best.y, 60); entries.push({ x, y, t: best, wide }); }
    }
    if (!entries.length) {
      // sealed arena: insects blink in at free inner points instead
      for (const [tx, ty] of free.slice(0, 8)) entries.push({ x: tx, y: ty, t: { x: tx, y: ty }, wide: true, inside: true });
      if (!entries.length) entries.push({ x: W / 2, y: H / 3, t: { x: W / 2, y: H / 3 }, wide: true, inside: true });
    }
    this.entries = entries;
  }

  // the entry for the next group: shuffle through the list; the boss comes from the top
  spawnPoint(boss) {
    if (!this.entries) this.computeEntries();
    const pts = this.entries;
    if (boss) {
      const wide = pts.filter((p) => p.wide);
      const list = wide.length ? wide : pts;
      let top = list[0];
      for (const p of list) if (p.y < top.y) top = p;
      return top;
    }
    let i = Math.floor(Math.random() * pts.length);
    if (i === this.lastSpawn && pts.length > 1) i = (i + 1) % pts.length;
    this.lastSpawn = i;
    return pts[i];
  }

  aliveEnemies() { let n = 0; for (const e of this.game.enemies) if (e.alive) n++; return n; }

  get remaining() {
    let n = this.aliveEnemies();
    for (const g of this.queue) n += g.n;
    for (const p of this.pending) n += p.group.n;
    return n;
  }

  updateSpawning(dt) {
    const game = this.game;
    this.spawnT -= dt;
    let inPlay = this.aliveEnemies();
    for (const p of this.pending) inPlay += p.group.n;
    if (this.queue.length && this.spawnT <= 0 && (inPlay + this.queue[0].n <= this.maxAlive || inPlay === 0)) {
      const group = this.queue.shift();
      const ent = this.spawnPoint(group.boss);
      const T = group.boss ? 2.2 : 1.1;
      this.pending.push({ x: ent.x, y: ent.y, t: T, T, group, entry: ent });
      this.spawnT = group.boss ? 3 : rand(0.5, 1.1) / Math.sqrt(this.playerCount * 0.5 + 0.5);
      sfx.warn();
      if (group.boss) sfx.bossRoar();
    }
    for (const w of this.pending) {
      const prev = w.t;
      w.t -= dt;
      if (Math.floor(prev * 4) !== Math.floor(w.t * 4)) sfx.warn();
      if (w.t <= 0) this.release(w);
    }
    this.pending = this.pending.filter((w) => w.t > 0);
  }

  release(w) {
    const game = this.game;
    const { C, n, boss } = w.group;
    const ent = w.entry, t = ent.t;
    const dx = t.x - w.x, dy = t.y - w.y, m = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < n; i++) {
      const j = n > 1 ? 1 : 0;
      const e = new C(game, w.x + rand(-20, 20) * j, w.y + rand(-20, 20) * j, { wave: this.wave, players: this.playerCount });
      const sp = boss ? 200 : 280;
      e.entryTarget = { x: t.x + rand(-30, 30) * j, y: t.y + rand(-30, 30) * j };
      if (ent.inside) { e.entered = true; e.entryTarget = null; game.fx.ring(e.x, e.y, 50, e.constructor.color, 0.35, 4); }
      e.vx = dx / m * sp + rand(-40, 40); e.vy = dy / m * sp + rand(-40, 40);
      game.addEnemy(e);
    }
  }

  // ---- events -----------------------------------------------------------------
  onEnemyKilled(e, info) {
    const from = info && info.from;
    if (from && from.kind === 'spider' && from.player) {
      this.statsOf(from.player).kills++;
      from.player.score++;
    }
  }

  onSpiderKilled(sp, info) {
    const p = sp.player;
    if (!p) return;
    this.statsOf(p).deaths++;
    const perks = p.perks || {};
    if (perks.boom) this.blasts.push({ x: sp.x, y: sp.y, t: 0.18, owner: sp });
    if (perks.wind && !sp.windUsed && this.state === 'wave') {
      this.respawns.push({ p, t: 4 });
    }
    const alive = this.game.spiders.filter((s) => s.alive).length;
    if (alive === 0 && !this.respawns.length && settings.slowmo) this.game.slowmo(0.3, 1.2);
  }

  // ---- update -----------------------------------------------------------------
  update(dt, realDt) {
    const game = this.game;
    this.t += realDt;
    for (const b of this.blasts) {
      b.t -= dt;
      if (b.t <= 0) game.explode(b.x, b.y, { radius: 150, owner: b.owner, damage: 4, force: 900, selfOk: false, color: '#ff9a3c' });
    }
    this.blasts = this.blasts.filter((b) => b.t > 0);

    switch (this.state) {
      case 'break':
        this.drops.update(dt);
        if (this.t >= 2.6) { this.state = 'wave'; this.t = 0; sfx.go(); }
        break;
      case 'wave': {
        this.drops.update(dt);
        this.updateSpawning(dt);
        for (const r of this.respawns) {
          r.t -= dt;
          if (r.t <= 0) { const sp = this.revive(r.p, 2); sp.windUsed = true; }
        }
        this.respawns = this.respawns.filter((r) => r.t > 0);
        const alive = game.spiders.some((s) => s.alive);
        if (!alive && !this.respawns.length) {
          this.state = 'lost'; this.t = 0;
          sfx.lose();
          game.music.setDuck(0.4);
          break;
        }
        if (!this.queue.length && !this.pending.length && this.aliveEnemies() === 0) {
          this.state = 'clear'; this.t = 0;
          this.cleared = this.wave;
          if (this.cleared > this.best) { this.best = this.cleared; saveBest(this.best); }
          // leftover insect shots fizzle
          game.projectiles = game.projectiles.filter((p) => !(p.team === 'enemy' && !p.deflected));
          this.respawns = [];
          this.reviveAll();
          sfx.win();
        }
        break;
      }
      case 'clear':
        if (this.t >= 2.4) {
          if (this.wave % PERK_EVERY === PERK_EVERY - 1) this.startPerks();
          else this.nextWave();
        }
        break;
      case 'perk':
        this.updatePerks(realDt);
        break;
      case 'lost':
        if (this.t >= 2.2) { this.state = 'over'; this.t = 0; }
        break;
      case 'over':
        for (const p of game.players) {
          const s = game.input.get(p.inputId);
          if (this.t > 1.5 && s && (s.pressed.a || s.pressed.start)) { game.go('lobby'); return; }
        }
        if (!game.players.length && this.t > 1) game.go('lobby');
        break;
    }
  }

  // ---- drawing ----------------------------------------------------------------
  draw(ctx) {
    // second-wind markers where the spider will come back
    for (const r of this.respawns) {
      const sp = r.p.spider;
      if (!sp) continue;
      ctx.save();
      ctx.strokeStyle = r.p.color.main;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - r.t / 4)); ctx.stroke();
      ctx.restore();
    }
  }

  drawWarnings(ctx) {
    const m = 46;
    for (const w of this.pending) {
      const k = 1 - w.t / w.T;
      const x = clamp(w.x, m, W - m), y = clamp(w.y, m + 70, H - m);
      const ang = Math.atan2(H / 2 - w.y, W / 2 - w.x);
      const boss = w.group.boss;
      const col = boss ? '#ffb020' : '#ff4a4a';
      const pulse = 0.5 + 0.5 * Math.sin(this.game.realTime * 18);
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      const s = boss ? 1.6 : 1;
      // countdown ring
      ctx.strokeStyle = col; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.arc(0, 0, 26 * s, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.fillStyle = rgba(col, 0.25);
      ctx.beginPath(); ctx.arc(0, 0, 26 * s, 0, TAU); ctx.fill();
      text(ctx, '!', 0, 12 * s, { size: 34 * s, color: '#fff', sw: 5, stroke: col });
      // chevron toward where they'll fly
      ctx.rotate(ang);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(36 * s, -10 * s); ctx.lineTo(50 * s, 0); ctx.lineTo(36 * s, 10 * s); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (w.group.n > 1) text(ctx, `×${w.group.n}`, x, y + 48, { size: 20, color: col, sw: 4 });
    }
  }

  drawStatus(ctx) {
    const game = this.game;
    // wave pill
    const label = `WAVE ${this.wave}`;
    const rem = this.state === 'wave' ? `${this.remaining} insects left` : this.state === 'break' ? 'get ready' : this.state === 'clear' ? 'cleared!' : '';
    drawPanel(ctx, W / 2 - 150, 10, 300, 64, { r: 30, fill: 'rgba(8,6,22,0.78)', accent: this.isBossWave ? '#ffb020' : '#5ad1ff' });
    text(ctx, label, W / 2, 46, { size: 32, color: this.isBossWave ? '#ffd27a' : '#bfefff', sw: 0, stroke: null });
    if (rem) text(ctx, rem, W / 2, 68, { size: 17, color: '#cfd6ff', stroke: null });
    // per-player status, top-left
    const ps = game.players;
    ps.forEach((p, i) => {
      const x = 18 + (i % 4) * 150, y = 14 + Math.floor(i / 4) * 54;
      const sp = p.spider, alive = sp && sp.alive;
      ctx.save();
      ctx.globalAlpha = alive ? 1 : 0.6;
      ctx.fillStyle = 'rgba(8,6,22,0.72)';
      ctx.beginPath(); ctx.roundRect(x, y, 140, 46, 23); ctx.fill();
      ctx.strokeStyle = rgba(p.color.main, alive ? 0.9 : 0.4); ctx.lineWidth = 2.5; ctx.stroke();
      drawPortrait(ctx, x + 23, y + 23, 19, p, { dead: !alive });
      text(ctx, `${this.statsOf(p).kills}`, x + 60, y + 31, { size: 22, color: p.color.main, sw: 4, align: 'left' });
      text(ctx, 'kills', x + 60 + 14 * String(this.statsOf(p).kills).length, y + 31, { size: 13, color: '#9aa0c8', stroke: null, align: 'left' });
      // shield pips / respawn timer
      if (alive && sp.shield > 0) for (let k = 0; k < sp.shield; k++) { ctx.fillStyle = '#7fe8ff'; ctx.beginPath(); ctx.arc(x + 124 - k * 12, y + 14, 4.5, 0, TAU); ctx.fill(); }
      const rs = this.respawns.find((r) => r.p === p);
      if (rs) text(ctx, `${Math.ceil(rs.t)}`, x + 122, y + 32, { size: 20, color: '#ff7ad9', sw: 4 });
      ctx.restore();
    });
    // boss bar
    const boss = game.enemies.find((e) => e.alive && e.isBoss);
    if (boss) {
      const bw = 760, x = W / 2 - bw / 2, y = H - 64;
      drawPanel(ctx, x - 10, y - 34, bw + 20, 64, { r: 18, fill: 'rgba(20,6,10,0.8)', accent: '#ffb020' });
      text(ctx, `${boss.label}${boss.phase > 1 ? '  ·  phase ' + boss.phase : ''}`, W / 2, y - 8, { size: 22, color: '#ffd27a', stroke: null });
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.roundRect(x, y + 2, bw, 16, 8); ctx.fill();
      ctx.fillStyle = boss.phase === 3 ? '#ff5030' : '#ffb020';
      ctx.beginPath(); ctx.roundRect(x, y + 2, Math.max(4, bw * boss.hp / boss.maxHp), 16, 8); ctx.fill();
      for (const f of [1 / 3, 2 / 3]) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + bw * f - 1, y + 2, 2, 16); }
    }
  }

  drawPerks(ctx) {
    const pk = this.perkPick;
    if (!pk) return;
    ctx.fillStyle = 'rgba(4,3,14,0.6)';
    ctx.fillRect(0, 0, W, H);
    text(ctx, 'Pick a perk', W / 2, 150, { size: 64, color: '#ffd23f', sw: 10 });
    text(ctx, 'stick / D-pad to choose · A to take it', W / 2, 192, { size: 24, color: '#cfd6ff', stroke: null });
    const rows = pk.rows;
    const rowH = Math.min(118, 800 / rows.length);
    const cardW = 380, gap = 18;
    const y0 = 230;
    rows.forEach((r, i) => {
      const y = y0 + i * rowH;
      const cx0 = W / 2 - (cardW * 3 + gap * 2) / 2 + 60;
      drawPortrait(ctx, cx0 - 70, y + rowH / 2 - 6, Math.min(34, rowH * 0.3), r.p, {});
      r.offers.forEach((P, j) => {
        const x = cx0 + j * (cardW + gap);
        const sel = j === r.sel;
        const h = rowH - 14;
        ctx.save();
        ctx.globalAlpha = r.done && !sel ? 0.35 : 1;
        drawPanel(ctx, x, y, cardW, h, { r: 16, fill: sel ? rgba(P.color, 0.22) : 'rgba(10,8,26,0.85)', accent: sel ? P.color : null, stroke: sel ? null : 'rgba(255,255,255,0.12)', lw: sel ? 4 : 2 });
        const have = (r.p.perks && r.p.perks[P.id]) || 0;
        text(ctx, P.name + (have ? `  ${'+'.repeat(have + 1)}` : ''), x + 20, y + Math.min(40, h * 0.42), { size: Math.min(30, h * 0.3), color: P.color, align: 'left', sw: 5 });
        text(ctx, P.desc, x + 20, y + Math.min(76, h * 0.78), { size: Math.min(20, h * 0.2), color: '#e4e8ff', align: 'left', stroke: null, maxWidth: cardW - 40 });
        if (r.done && sel) text(ctx, '✓', x + cardW - 30, y + 40, { size: 36, color: '#4fdc6a', sw: 5 });
        ctx.restore();
      });
    });
    const left = Math.max(0, Math.ceil(25 - this.t));
    text(ctx, `${left}s`, W - 80, 150, { size: 30, color: '#9aa0c8', stroke: null });
  }

  drawResults(ctx) {
    const game = this.game;
    ctx.fillStyle = 'rgba(4,3,14,0.55)';
    ctx.fillRect(0, 0, W, H);
    drawBanner(ctx, 'THE SWARM WINS', `Waves survived: ${this.cleared}   ·   best: ${this.best}`, Math.min(1, this.t * 2), '#ff5a7a');
    const ps = game.players.slice().sort((a, b) => this.statsOf(b).kills - this.statsOf(a).kills);
    const rowH = Math.min(70, 480 / Math.max(1, ps.length));
    const bw = 820, bh = ps.length * rowH + 80, x0 = W / 2 - bw / 2, y0 = 360;
    drawPanel(ctx, x0, y0, bw, bh, { r: 26, fill: 'rgba(10,8,26,0.86)' });
    text(ctx, 'insects squashed', x0 + bw - 40, y0 + 44, { size: 22, color: '#9aa0c8', stroke: null, align: 'right' });
    ps.forEach((p, i) => {
      const y = y0 + 60 + i * rowH + rowH / 2;
      const st = this.statsOf(p);
      drawPortrait(ctx, x0 + 60, y, Math.min(26, rowH * 0.38), p, {});
      text(ctx, castAt(p.castIndex).name, x0 + 100, y + 9, { size: 28, color: p.color.main, align: 'left', sw: 5 });
      const perks = Object.entries(p.perks || {}).map(([id, n]) => { const P = PERKS.find((q) => q.id === id); return P ? P.name + (n > 1 ? ' x' + n : '') : ''; }).filter(Boolean).join(', ');
      if (perks) text(ctx, perks, x0 + 330, y + 7, { size: 16, color: '#9aa0c8', align: 'left', stroke: null, maxWidth: 330 });
      text(ctx, `${st.kills}`, x0 + bw - 40, y + 10, { size: 32, color: '#fff', align: 'right', sw: 5 });
    });
    if (this.t > 1.5) text(ctx, 'Press A to return to the lobby', W / 2, y0 + bh + 60, { size: 30, color: '#e4e8ff' });
  }

  drawUI(ctx) {
    const game = this.game;
    drawPlayerTags(ctx, game);
    if (this.state === 'wave') this.drawWarnings(ctx);
    if (this.state !== 'over') this.drawStatus(ctx);
    if (this.state === 'break') {
      const first = this.wave === this.startWave;
      const boss = this.isBossWave;
      const title = boss ? `WAVE ${this.wave} · BOSS` : `WAVE ${this.wave}`;
      const sub = boss ? 'The Brood Tyrant approaches' : first ? `${game.board.name} — survive the swarm together` : this.introLine();
      drawBanner(ctx, title, sub, Math.min(1, this.t * 3) * Math.min(1, (2.6 - this.t) * 3), boss ? '#ffb020' : '#5ad1ff');
    } else if (this.state === 'wave' && this.t < 0.9) {
      drawCountdown(ctx, 'GO!', this.t, '#5ad1ff');
    } else if (this.state === 'clear') {
      drawBanner(ctx, `WAVE ${this.wave} CLEARED`, 'the fallen are back on their feet', Math.min(1, this.t * 3) * Math.min(1, (2.4 - this.t) * 3), '#4fdc6a');
    } else if (this.state === 'perk') {
      this.drawPerks(ctx);
    } else if (this.state === 'lost') {
      drawBanner(ctx, 'EVERYONE IS DOWN', '', Math.min(1, this.t * 2), '#ff5a7a');
    } else if (this.state === 'over') {
      this.drawResults(ctx);
    }
  }

  introLine() {
    const fresh = ROSTER.filter((e) => e.from === this.wave);
    if (fresh.length) return `New: ${fresh.map((e) => e.C.label).join(', ')}`;
    return `${this.remaining} insects incoming`;
  }
}
