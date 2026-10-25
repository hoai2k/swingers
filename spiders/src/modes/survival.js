// SURVIVAL: co-op against escalating waves of insects (src/enemies/*).
//
// Structure: waves come in STAGES of 3. Every player has LIVES (3 to start):
// dying costs one and the spider drops back in 3 s later with spawn
// protection; with no lives left that player is OUT until the stage is
// cleared. Clearing a stage (its 3rd wave) gives everyone +1 life (cap 5,
// +1 per Spare Heart; the OUT come back with 1), revives the fallen and
// offers the perk pick (each player chooses 1 of 3 with the stick + A).
// Game over when nobody is left standing and nobody has a life to spend.
//
// Flow: 'break' (STAGE s · WAVE n/3 banner, weapons restocked) -> 'wave'
// (insects enter from board.enemySpawns after a warning marker at the edge)
// -> 'clear' (wave or stage cleared) -> [stage end: 'perk'] -> next 'break'.
// The last wave of every 2nd stage is a boss wave (Brood Tyrant + escorts).
// Everyone down for good: 'lost' (slow motion) -> 'over' (results; A = lobby).
//
// Wave scaling (see buildWave): budget = (3 + 1.5 w) x (1 + 0.5 (players-1))
// points spent on insects unlocked by wave w (each type is introduced on its
// unlock wave); at most 4 + 2 players + w/2 insects alive at once (cap 18).
// Insects get ~3% faster/quicker per wave (Enemy.agg, cap +50%), and from
// stage 2 tougher: +25% hp per stage, and from stage 3 some wear armor
// plates (each soaks one hit; more plates later) — see scaleEnemy.
//
// Subclass hooks (modes/challenge.js builds trials on these): level(w),
// stageLevel, rosterFor(w), bossOn(w), setupDrops(), loadout(sp),
// applyRules(sp), afterStage(), enemyDropId(C), startLives, lifeCap.
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
import { applyRoundMods, applySpiderMods, tickMods, drawMods } from '../modifiers.js';

// cost: wave budget points per spawn; from: first wave it appears; group: insects per spawn
export const ROSTER = [
  { C: Stinglet,   cost: 1,   from: 1, weight: 3 },
  { C: Gnatling,   cost: 1.6, from: 2, weight: 1.6, group: (w) => 3 + Math.min(3, Math.floor(w / 5)) },
  { C: Buzzgunner, cost: 2,   from: 2, weight: 2 },
  { C: Bladewing,  cost: 3,   from: 3, weight: 1.4 },
  { C: Shellback,  cost: 3,   from: 4, weight: 1.2 },
  { C: Dropmoth,   cost: 2.5, from: 6, weight: 1.3 },
  { C: Hexfly,     cost: 3,   from: 7, weight: 1.2 },
];
export const WAVES_PER_STAGE = 3;
const BOSS_STAGES = 2;           // the last wave of every 2nd stage is a boss wave (6, 12, ...)
const START_LIVES = 3;
const LIFE_CAP = 5;
const RESPAWN_T = 3;             // seconds before a fallen spider drops back in

// a spider field's value before perks touched it (modifiers may have set it)
function base(sp, k) { sp.perkBase = sp.perkBase || {}; if (!(k in sp.perkBase)) sp.perkBase[k] = sp[k] || 1; return sp.perkBase[k]; }

// Perks: stackable up to max. apply(sp, n) sets spider fields on every spawn;
// take(p, n, mode) runs once when picked.
export const PERKS = [
  { id: 'shell',  name: 'Hard Shell',   desc: '+1 shield charge, refilled every wave', max: 3, color: '#7fe8ff', apply: (sp, n) => { sp.shield = Math.max(sp.shield, n); } },
  { id: 'legs',   name: 'Quick Legs',   desc: 'Walk 20% faster',                 max: 3, color: '#4fdc6a', apply: (sp, n) => { sp.speedMul = base(sp, 'speedMul') * (1 + 0.2 * n); } },
  { id: 'spring', name: 'Spring Legs',  desc: 'Jump 15% higher',                 max: 3, color: '#ffd23f', apply: (sp, n) => { sp.jumpMul = base(sp, 'jumpMul') * (1 + 0.15 * n); } },
  { id: 'silk',   name: 'Long Silk',    desc: 'Webs reach 35% farther',          max: 2, color: '#f4f7ff', apply: (sp, n) => { sp.webMul = base(sp, 'webMul') * (1 + 0.35 * n); } },
  { id: 'venom',  name: 'Venom Fangs',  desc: 'Deal double damage to insects',   max: 2, color: '#b46bff', apply: (sp, n) => { sp.dmgMul = 1 + n; } },
  { id: 'saber',  name: 'Born Duelist', desc: 'Start every wave holding a saber', max: 1, color: '#4dd2ff', excl: 'armory' },
  { id: 'armory', name: 'Armory',       desc: 'Start every wave with a random gun', max: 1, color: '#ff5a5a', excl: 'saber' },
  { id: 'boom',   name: 'Last Laugh',   desc: 'Explode when you die',            max: 1, color: '#ff9a3c' },
  { id: 'wind',   name: 'Second Wind',  desc: 'Once per stage, a death costs no life', max: 1, color: '#ff7ad9' },
  { id: 'heart',  name: 'Spare Heart',  desc: '+1 max life, and a life right now', max: 2, color: '#ff4f6d', take: (p, n, mode) => { p.lives = Math.min(mode.maxLives(p), (p.lives || 0) + 1); } },
  { id: 'aegis',  name: 'Last Stand',   desc: 'Shielded whenever you are on your last life', max: 1, color: '#9fd0ff', apply: (sp) => { if (sp.player && sp.player.lives <= 1) sp.shield = Math.max(sp.shield, 1 + ((sp.player.perks || {}).shell || 0)); } },
  { id: 'focus',  name: 'Blade Focus',  desc: 'Blade kills slow time for a heartbeat', max: 1, color: '#6ae0ff' },
  { id: 'blast',  name: 'Big Bang',     desc: 'Your explosions are 40% bigger',  max: 2, color: '#ffb347', apply: (sp, n) => { sp.blastMul = 1 + 0.4 * n; } },
  { id: 'lull',   name: 'Lullaby Silk', desc: 'Team-wide: insects arrive 25% slower', max: 2, color: '#9effc8' },
];

const BEST_KEY = 'spiders.survival.best';             // most waves cleared
const BEST_STAGE_KEY = 'spiders.survival.bestStage';   // most stages cleared
function loadNum(k) { try { return +localStorage.getItem(k) || 0; } catch (e) { return 0; } }
function saveNum(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* not persisted */ } }


// a small heart (lives on the HUD)
export function drawHeart(ctx, x, y, s, fill, stroke = null) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 10, s / 10);
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(-11, 0, -10, -9, -5, -9);
  ctx.bezierCurveTo(-2, -9, 0, -7, 0, -5);
  ctx.bezierCurveTo(0, -7, 2, -9, 5, -9);
  ctx.bezierCurveTo(10, -9, 11, 0, 0, 8);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2.2; ctx.stroke(); }
  ctx.restore();
}

export class SurvivalMode {
  constructor(game, opts = {}) {
    this.game = game;
    this.name = 'survival';
    this.opts = opts;
    this.boardId = opts.board || settings.board;
    this.startWave = Math.max(1, opts.wave | 0 || 1);
    this.wave = this.startWave - 1;
    this.state = 'break';
    this.t = 0;
    this.queue = [];          // groups still to send this wave: {C, n, boss}
    this.pending = [];        // warnings counting down: {x, y, t, T, group}
    this.spawnT = 0;
    this.lastSpawn = -1;
    this.respawns = [];       // fallen spiders coming back {p, t, T, x, y}
    this.blasts = [];         // last-laugh explosions {x, y, t, owner}
    this.stats = new Map();   // player -> {kills, deaths}
    this.perkPick = null;     // {rows: [{p, offers, sel, done, lx}], t}
    this.recordBest = true;   // trials keep their own records
    this.best = loadNum(BEST_KEY);
    this.bestStage = loadNum(BEST_STAGE_KEY);
    this.cleared = this.startWave - 1;
    this.stagesCleared = Math.floor(this.cleared / WAVES_PER_STAGE);
    this.stageEnd = false;
    this.startLives = START_LIVES;
    this.lifeCap = LIFE_CAP;
    this.dropRate = settings.dropRate;
    this.useMods = true;      // Settings > Modifiers apply to survival (trials use their own rules)
  }

  get friendlyFire() { return !!settings.friendlyFire; }
  teamFor() { return 'players'; }
  canPause() { return this.state !== 'over' && this.state !== 'lost'; }

  // ---- structure ---------------------------------------------------------------
  get stage() { return Math.max(1, Math.ceil(this.wave / WAVES_PER_STAGE)); }
  get waveInStage() { return ((Math.max(1, this.wave) - 1) % WAVES_PER_STAGE) + 1; }
  // difficulty level of wave w (roster unlocks, budget, insect aggression)
  level(w) { return w; }
  // how tough insects are (hp / armor), by stage
  get stageLevel() { return this.stage; }
  bossOn(w) { return w % (WAVES_PER_STAGE * BOSS_STAGES) === 0; }
  maxLives(p) { return this.lifeCap + (((p.perks || {}).heart) || 0); }

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
    this.mods = this.useMods ? applyRoundMods(game) : [];
    game.music.match(def.music, this.name === 'challenge' ? 'trials' : 'survival');
    game.music.setDuck(1);
    this.drops = new DropSpawner(game, board, this.dropRate);
    this.setupDrops();
    for (const p of game.players) {
      p.score = 0; p.kills = 0; p.deaths = 0;
      p.perks = {};
      p.lives = this.startLives;
      p.windStage = 0;
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

  setupDrops() {}
  loadout(sp) {}            // wave start: what a spider holds
  applyRules(sp) {}         // every spawn: rule tweaks (trials)

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
    if (!sp.modsApplied) { sp.modsApplied = true; if (this.useMods) applySpiderMods(this.game, sp); }
    this.applyRules(sp);
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
      this.loadout(sp);
    }
    return sp;
  }

  teamPerk(id) { let n = 0; for (const p of this.game.players) n += (p.perks && p.perks[id]) || 0; return n; }

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
    if (P.take) P.take(p, p.perks[P.id], this);
    sfx.uiOk();
    if (p.spider && p.spider.alive) {
      this.applyPerks(p.spider);
      this.game.fx.text(p.spider.x, p.spider.y - 40, P.name, P.color, 24, 1.2);
      this.game.fx.ring(p.spider.x, p.spider.y, 50, P.color, 0.4, 4);
    }
  }

  // ---- waves ------------------------------------------------------------------
  // insect types available on wave w: {unlocked, fresh (introduced now)}
  rosterFor(w) {
    const L = this.level(w);
    return { unlocked: ROSTER.filter((e) => e.from <= L), fresh: ROSTER.filter((e) => e.from === L) };
  }

  budgetMul() { return 1; }

  buildWave(w, n) {
    const groups = [];
    const pf = 1 + 0.5 * (n - 1);
    const L = this.level(w);
    const { unlocked, fresh } = this.rosterFor(w);
    const add = (e) => groups.push({ C: e.C, n: e.group ? e.group(L) : 1 });
    let budget;
    if (this.bossOn(w)) {
      groups.push({ C: BroodTyrant, n: 1, boss: true });
      budget = (1 + L * 0.5) * pf;
    } else {
      budget = (3 + L * 1.5) * pf * this.budgetMul();
      for (const e of fresh) { add(e); budget -= e.cost; }   // the newcomer
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

  get maxAlive() { return Math.min(18, 4 + 2 * this.playerCount + Math.floor(this.level(this.wave) / 2)); }
  get isBossWave() { return this.bossOn(this.wave); }

  nextWave() {
    const game = this.game;
    this.wave++;
    this.state = 'break';
    this.t = 0;
    this.stageEnd = false;
    this.queue = this.buildWave(this.wave, this.playerCount);
    this.pending = [];
    this.spawnT = 0.4;
    // restock: a weapon at every empty spawn
    const free = game.board.spawns.filter(([x, y]) => !game.pickups.some((p) => !p.spent && Math.hypot(p.x - x, p.y - (y - 40)) < 120));
    this.drops.seedSpawns(free);
    for (const sp of game.spiders) if (sp.alive) this.applyPerks(sp, true);
    // anyone who fell between waves (perk pick) with a life to spend comes back now
    for (const p of game.players) if (!(p.spider && p.spider.alive) && p.lives > 0 && !this.respawns.some((r) => r.p === p)) this.revive(p);
    sfx.wave();
  }

  // bring back everyone who is down (stage clear)
  reviveAll() {
    const game = this.game;
    this.respawns = [];
    for (const p of game.players) {
      if (p.spider && p.spider.alive) continue;
      this.revive(p);
    }
  }

  revive(p, invuln = 2.2, label = 'REVIVED') {
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
    game.fx.text(sp.x, sp.y - 46, label, p.color.main, 26, 1.2);
    return sp;
  }

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

  // Lullaby Silk: team-wide slower arrivals
  get spawnSlow() { return 1 + 0.25 * Math.min(3, this.teamPerk('lull')); }

  updateSpawning(dt) {
    this.spawnT -= dt;
    let inPlay = this.aliveEnemies();
    for (const p of this.pending) inPlay += p.group.n;
    if (this.queue.length && this.spawnT <= 0 && (inPlay + this.queue[0].n <= this.maxAlive || inPlay === 0)) {
      const group = this.queue.shift();
      const ent = this.spawnPoint(group.boss);
      const T = (group.boss ? 2.2 : 1.1) * Math.sqrt(this.spawnSlow);
      this.pending.push({ x: ent.x, y: ent.y, t: T, T, group, entry: ent });
      this.spawnT = (group.boss ? 3 : rand(0.5, 1.1) / Math.sqrt(this.playerCount * 0.5 + 0.5)) * this.spawnSlow;
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

  // tougher insects as the stages advance: +25% hp per stage, armor plates from stage 3
  scaleEnemy(e, boss) {
    const s = this.stageLevel;
    if (boss) { e.maxHp = e.hp = Math.round(e.maxHp * (1 + 0.2 * (s - 1))); return; }
    if (s > 1) e.maxHp = e.hp = Math.max(e.hp, Math.round(e.maxHp * (1 + 0.25 * (s - 1))));
    if (s >= 3 && Math.random() < Math.min(0.7, 0.2 * (s - 2))) e.armor = 1 + Math.floor((s - 3) / 2);
  }

  release(w) {
    const game = this.game;
    const { C, n, boss } = w.group;
    const ent = w.entry, t = ent.t;
    const dx = t.x - w.x, dy = t.y - w.y, m = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < n; i++) {
      const j = n > 1 ? 1 : 0;
      const e = new C(game, w.x + rand(-20, 20) * j, w.y + rand(-20, 20) * j, { wave: this.level(this.wave), players: this.playerCount });
      this.scaleEnemy(e, boss);
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
      // Blade Focus: a blade kill slows time for a heartbeat
      const blade = info.melee || (info.weapon && info.weapon.kind === 'melee');
      if (blade && from.player.perks && from.player.perks.focus && this.game.timeScale >= 0.99) this.game.slowmo(0.35, 0.45);
    }
  }

  get inPlay() { return this.state === 'break' || this.state === 'wave' || this.state === 'clear'; }

  onSpiderKilled(sp, info) {
    const p = sp.player;
    if (!p || p.spider !== sp) return;
    this.statsOf(p).deaths++;
    const perks = p.perks || {};
    if (perks.boom) this.blasts.push({ x: sp.x, y: sp.y, t: 0.18, owner: sp });
    if (!this.inPlay) return;
    let free = false;
    if (perks.wind && p.windStage !== this.stage) { p.windStage = this.stage; free = true; }
    if (!free) p.lives = Math.max(0, (p.lives || 0) - 1);
    if (p.lives > 0) {
      this.respawns.push({ p, t: RESPAWN_T, T: RESPAWN_T, x: sp.x, y: sp.y });
      if (free) this.game.fx.text(sp.x, sp.y - 40, 'SECOND WIND', '#ff7ad9', 24, 1.2);
    } else {
      this.game.fx.text(sp.x, sp.y - 40, 'OUT!', '#ff5a7a', 34, 1.4);
    }
    const alive = this.game.spiders.filter((s) => s.alive).length;
    if (alive === 0 && !this.respawns.length && settings.slowmo) this.game.slowmo(0.3, 1.2);
  }

  updateRespawns(dt) {
    for (const r of this.respawns) {
      r.t -= dt;
      if (r.t <= 0) this.revive(r.p, 2.5, 'BACK IN');
    }
    this.respawns = this.respawns.filter((r) => r.t > 0);
  }

  // everyone down with no lives to spend
  checkLost() {
    const game = this.game;
    if (!game.players.length || game.spiders.some((s) => s.alive) || this.respawns.length) return false;
    this.state = 'lost'; this.t = 0;
    this.game.music.sting('lose');
    this.lostReason = this.lostReason || 'EVERYONE IS OUT';
    sfx.lose();
    game.music.setDuck(0.4);
    return true;
  }

  waveCleared() {
    const game = this.game;
    this.state = 'clear'; this.t = 0;
    this.cleared = this.wave;
    this.stageEnd = this.wave % WAVES_PER_STAGE === 0;
    if (this.recordBest && this.cleared > this.best) { this.best = this.cleared; saveNum(BEST_KEY, this.best); }
    // leftover insect shots fizzle
    game.projectiles = game.projectiles.filter((p) => !(p.team === 'enemy' && !p.deflected));
    if (this.stageEnd) {
      this.stagesCleared = Math.floor(this.wave / WAVES_PER_STAGE);
      if (this.recordBest && this.stagesCleared > this.bestStage) { this.bestStage = this.stagesCleared; saveNum(BEST_STAGE_KEY, this.bestStage); }
      this.stageReward();
      sfx.win();
    } else sfx.perk();
  }

  // stage clear: +1 life each (the OUT come back with 1), the fallen return
  stageReward() {
    for (const p of this.game.players) p.lives = Math.min(this.maxLives(p), (p.lives || 0) + 1);
    this.reviveAll();
  }

  // after the stage-clear banner
  afterStage() { this.startPerks(); }

  // ---- update -----------------------------------------------------------------
  update(dt, realDt) {
    const game = this.game;
    this.t += realDt;
    for (const b of this.blasts) {
      b.t -= dt;
      if (b.t <= 0) game.explode(b.x, b.y, { radius: 150, owner: b.owner, damage: 4, force: 900, selfOk: false, color: '#ff9a3c' });
    }
    this.blasts = this.blasts.filter((b) => b.t > 0);
    if (this.useMods && this.inPlay) tickMods(game, dt);
    if (this.inPlay) {
      this.updateRespawns(dt);
      if (this.checkLost()) return;
    }

    switch (this.state) {
      case 'break':
        this.drops.update(dt);
        if (this.t >= 2.6) {
          this.state = 'wave'; this.t = 0; this.waveT = 0; sfx.go();
          if (this.isBossWave) this.game.music.boss();
          else this.game.music.match(null, this.name === 'challenge' ? 'trials' : 'survival');
        }
        break;
      case 'wave': {
        this.waveT = (this.waveT || 0) + dt;
        this.drops.update(dt);
        this.updateSpawning(dt);
        if (!this.queue.length && !this.pending.length && this.aliveEnemies() === 0) this.waveCleared();
        break;
      }
      case 'clear':
        this.drops.update(dt);
        if (this.t >= (this.stageEnd ? 3 : 2)) {
          if (this.stageEnd) this.afterStage();
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
    if (this.useMods) drawMods(ctx, this.game);
    // respawn markers where the spider fell
    for (const r of this.respawns) {
      ctx.save();
      ctx.strokeStyle = r.p.color.main;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - r.t / r.T)); ctx.stroke();
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

  // the top-centre pill: label + sub line
  pillLabel() { return `STAGE ${this.stage} · WAVE ${this.waveInStage}/${WAVES_PER_STAGE}`; }
  pillSub() {
    return this.state === 'wave' ? `${this.remaining} insects left` : this.state === 'break' ? 'get ready' : this.state === 'clear' ? (this.stageEnd ? 'stage cleared!' : 'cleared!') : '';
  }

  drawStatus(ctx) {
    const game = this.game;
    const rem = this.pillSub();
    drawPanel(ctx, W / 2 - 190, 10, 380, 64, { r: 30, fill: 'rgba(8,6,22,0.78)', accent: this.isBossWave ? '#ffb020' : '#5ad1ff' });
    text(ctx, this.pillLabel(), W / 2, 44, { size: 30, color: this.isBossWave ? '#ffd27a' : '#bfefff', sw: 0, stroke: null, maxWidth: 360 });
    if (rem) text(ctx, rem, W / 2, 67, { size: 17, color: '#cfd6ff', stroke: null });
    // per-player cards, top-left: portrait, kills, lives
    const ps = game.players;
    const cw = 172, ch = 54;
    ps.forEach((p, i) => {
      const x = 18 + (i % 4) * (cw + 8), y = 12 + Math.floor(i / 4) * (ch + 8);
      const sp = p.spider, alive = sp && sp.alive;
      const out = !alive && !(p.lives > 0);
      const rs = this.respawns.find((r) => r.p === p);
      ctx.save();
      ctx.globalAlpha = alive ? 1 : 0.75;
      ctx.fillStyle = 'rgba(8,6,22,0.74)';
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 27); ctx.fill();
      ctx.strokeStyle = rgba(out ? '#ff5a7a' : p.color.main, alive ? 0.9 : 0.5); ctx.lineWidth = 2.5; ctx.stroke();
      drawPortrait(ctx, x + 27, y + ch / 2, 21, p, { dead: !alive });
      if (rs) {
        // respawn countdown ring over the portrait
        ctx.strokeStyle = p.color.main; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x + 27, y + ch / 2, 23, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - rs.t / rs.T)); ctx.stroke();
        text(ctx, `${Math.ceil(rs.t)}`, x + 27, y + ch / 2 + 9, { size: 24, color: '#fff', sw: 5 });
      }
      const kills = this.statsOf(p).kills;
      text(ctx, `${kills}`, x + 56, y + 25, { size: 20, color: p.color.main, sw: 4, align: 'left' });
      text(ctx, 'kills', x + 58 + 12 * String(kills).length, y + 25, { size: 13, color: '#9aa0c8', stroke: null, align: 'left' });
      // lives: filled hearts, empty slots up to the cap
      if (out) text(ctx, 'OUT', x + 56, y + 46, { size: 18, color: '#ff5a7a', sw: 4, align: 'left' });
      else {
        const max = this.maxLives(p), n = p.lives || 0;
        const step = Math.min(18, 106 / Math.max(1, max));
        for (let k = 0; k < max; k++) {
          const hx = x + 64 + k * step, hy = y + 39;
          if (k < n) drawHeart(ctx, hx, hy, 8, k === n - 1 && n === 1 ? '#ff2a4a' : '#ff5a7a', 'rgba(40,0,10,0.8)');
          else drawHeart(ctx, hx, hy, 8, null, 'rgba(255,255,255,0.28)');
        }
      }
      // shield pips
      if (alive && sp.shield > 0) for (let k = 0; k < sp.shield; k++) { ctx.fillStyle = '#7fe8ff'; ctx.beginPath(); ctx.arc(x + cw - 16 - k * 12, y + 17, 4.5, 0, TAU); ctx.fill(); }
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
    text(ctx, `Stage ${this.stagesCleared} cleared · pick a perk`, W / 2, 150, { size: 60, color: '#ffd23f', sw: 10 });
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

  drawPlayerTable(ctx, y0, title = 'insects squashed') {
    const game = this.game;
    const ps = game.players.slice().sort((a, b) => this.statsOf(b).kills - this.statsOf(a).kills);
    const rowH = Math.min(70, 480 / Math.max(1, ps.length));
    const bw = 820, bh = ps.length * rowH + 80, x0 = W / 2 - bw / 2;
    drawPanel(ctx, x0, y0, bw, bh, { r: 26, fill: 'rgba(10,8,26,0.86)' });
    text(ctx, title, x0 + bw - 40, y0 + 44, { size: 22, color: '#9aa0c8', stroke: null, align: 'right' });
    ps.forEach((p, i) => {
      const y = y0 + 60 + i * rowH + rowH / 2;
      const st = this.statsOf(p);
      drawPortrait(ctx, x0 + 60, y, Math.min(26, rowH * 0.38), p, {});
      text(ctx, castAt(p.castIndex).name, x0 + 100, y + 9, { size: 28, color: p.color.main, align: 'left', sw: 5 });
      const perks = Object.entries(p.perks || {}).map(([id, n]) => { const P = PERKS.find((q) => q.id === id); return P ? P.name + (n > 1 ? ' x' + n : '') : ''; }).filter(Boolean).join(', ');
      if (perks) text(ctx, perks, x0 + 330, y + 7, { size: 16, color: '#9aa0c8', align: 'left', stroke: null, maxWidth: 330 });
      text(ctx, `${st.kills}`, x0 + bw - 40, y + 10, { size: 32, color: '#fff', align: 'right', sw: 5 });
    });
    return y0 + bh;
  }

  drawResults(ctx) {
    ctx.fillStyle = 'rgba(4,3,14,0.55)';
    ctx.fillRect(0, 0, W, H);
    drawBanner(ctx, 'THE SWARM WINS', `Stages cleared: ${this.stagesCleared} (best ${this.bestStage})   ·   waves: ${this.cleared} (best ${this.best})`, Math.min(1, this.t * 2), '#ff5a7a');
    const end = this.drawPlayerTable(ctx, 360);
    if (this.t > 1.5) text(ctx, 'Press A to return to the lobby', W / 2, end + 60, { size: 30, color: '#e4e8ff' });
  }

  breakBanner() {
    const first = this.wave === this.startWave;
    const boss = this.isBossWave;
    const title = `STAGE ${this.stage} · WAVE ${this.waveInStage}${boss ? ' · BOSS' : ''}`;
    const sub = boss ? 'The Brood Tyrant approaches' : first ? `${this.game.board.name} — survive the swarm together` : this.introLine();
    return { title, sub, color: boss ? '#ffb020' : '#5ad1ff' };
  }

  clearBanner() {
    if (this.stageEnd) return { title: `STAGE ${this.stagesCleared} CLEARED`, sub: '+1 life for everyone · the fallen are back', color: '#4fdc6a' };
    return { title: `WAVE ${this.waveInStage}/${WAVES_PER_STAGE} CLEARED`, sub: `${WAVES_PER_STAGE - this.waveInStage} more to clear the stage`, color: '#8fe8a0' };
  }

  drawUI(ctx) {
    const game = this.game;
    drawPlayerTags(ctx, game);
    if (this.state === 'wave') this.drawWarnings(ctx);
    if (this.state !== 'over' && this.state !== 'won') this.drawStatus(ctx);
    if (this.state === 'break') {
      const b = this.breakBanner();
      drawBanner(ctx, b.title, b.sub, Math.min(1, this.t * 3) * Math.min(1, (2.6 - this.t) * 3), b.color);
    } else if (this.state === 'wave' && this.t < 0.9) {
      drawCountdown(ctx, 'GO!', this.t, '#5ad1ff');
    } else if (this.state === 'clear') {
      const b = this.clearBanner(), T = this.stageEnd ? 3 : 2;
      drawBanner(ctx, b.title, b.sub, Math.min(1, this.t * 3) * Math.min(1, (T - this.t) * 3), b.color);
    } else if (this.state === 'perk') {
      this.drawPerks(ctx);
    } else if (this.state === 'lost') {
      drawBanner(ctx, this.lostReason || 'EVERYONE IS OUT', '', Math.min(1, this.t * 2), '#ff5a7a');
    } else if (this.state === 'over' || this.state === 'won') {
      this.drawResults(ctx);
    }
  }

  introLine() {
    const fresh = this.rosterFor(this.wave).fresh;
    if (fresh.length && !this.isBossWave) return `New: ${fresh.map((e) => e.C.label).join(', ')}`;
    return `${this.remaining} insects incoming`;
  }
}
