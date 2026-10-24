// The lobby is a playable level. Press A on any controller (or Space / click
// on the keyboard) to drop in a spider; D-pad left/right (Z/X) changes
// character; Back (Backspace) leaves; Start (Esc) opens the menu.
//
// Layout (1920x1080):
//              [ BOARD sign ]
//   [VERSUS]   ( board island )   [SURVIVAL]       <- web-swing up to these
//      o                  o                         <- anchor rocks (+ a hanging dummy)
//               (     hub island     )              <- spawn, practice weapons
//   [TRIALS sign] over the trials perch, up between VERSUS and BOARD (it is also the left swing anchor)
//  (settings)                             (range)   <- low ledges: SETTINGS / target dummy
//
// Everyone joined standing on the same mode island for 3 s starts it (solo
// is fine). The board island's ends are pressure pads that cycle the board
// (Random + every board in boards.js, saved with setSetting('board')).
// Standing on the SETTINGS ledge opens the settings menu.
// The TRIALS perch (modes/challenge.js): while standing on it, D-pad
// left/right (Z/X) picks a trial instead of the character; everyone on it for
// 3 s starts the selected one (locked trials don't start).
// A first-time tutorial (stored per browser) walks a newly joined player
// through jump / web / grab / use with prompts under their spider.

import { island, blob } from './shapes.js';
import { W, H, THEMES } from './board.js';
import { sfx } from './audio.js';
import { text, drawPlayerTags, drawPortrait, drawPanel } from './hud.js';
import { castAt } from './cast.js';
import { DropSpawner } from './weapons.js';
import { BOARDS } from './boards.js';
import { settings, setSetting } from './settings.js';
import { settingsMenu } from './ui.js';
import { TAU, rgba, clamp, FONT } from './util.js';
import { optionalImage, ready } from './optional-art.js';
import { TRIALS, TIERS, loadTrials, setTrialSel, trialUnlocked, trialCleared, trialNumber, trialTags, drawLock } from './modes/challenge.js';

const LOBBY_BG = optionalImage('lobby_bg.jpg');

const HUB_Y = 790, MODE_Y = 460, BOARD_Y = 430, LEDGE_Y = 815;
const TRIAL_X = 600, TRIAL_Y = 262, TRIAL_SIGN_X = 612;   // up between VERSUS and BOARD, clear of the hub routes

export const LOBBY_BOARD = {
  id: 'lobby',
  name: 'Lobby',
  theme: 'night',
  solids: [
    { poly: island(960, HUB_Y, 800, 200, { seed: 11, n: 30 }), zone: 'hub' },
    { poly: island(300, MODE_Y, 380, 130, { seed: 12 }), zone: 'versus' },
    { poly: island(1620, MODE_Y, 380, 130, { seed: 13 }), zone: 'survival' },
    { poly: island(960, BOARD_Y, 380, 110, { seed: 15 }), zone: 'board' },
    { poly: island(225, LEDGE_Y, 240, 90, { seed: 16 }), zone: 'settings' },
    { poly: island(1695, LEDGE_Y, 240, 90, { seed: 17 }), zone: 'range' },
    { poly: island(TRIAL_X, TRIAL_Y, 190, 56, { seed: 21, n: 18 }), zone: 'challenge' },  // doubles as the left anchor rock
    // anchor rock (right)
    { poly: blob(1330, 235, 34, 30, { seed: 19, n: 14 }) },
  ],
  spawns: [[700, 740], [1220, 740], [800, 740], [1120, 740], [900, 740], [1020, 740], [750, 700], [1170, 700]],
  dropPoints: [[700, 0], [1220, 0]],
  decor: [
    { type: 'light', x: 300, y: 480, r: 260, color: '#ff5a7a' },
    { type: 'light', x: 1620, y: 480, r: 260, color: '#5ad1ff' },
    { type: 'light', x: 960, y: 420, r: 220, color: '#ffcf4a' },
    { type: 'cobweb', x: 0, y: 0, r: 240, a0: 0, span: Math.PI / 2 },
    { type: 'cobweb', x: W, y: 0, r: 240, a0: Math.PI / 2, span: Math.PI / 2 },
    { type: 'motes', n: 50, color: 'rgba(200,210,255,0.35)' },
  ],
};

// mode islands: zone id -> sign
export const ISLANDS = [
  { id: 'versus', label: 'VERSUS', sub: 'last spider standing wins', x: 300, color: '#ff5a7a', icon: 'swords' },
  { id: 'survival', label: 'SURVIVAL', sub: 'team up against the swarm', x: 1620, color: '#5ad1ff', icon: 'bug' },
  { id: 'challenge', label: 'TRIALS', sub: 'tiered challenges', x: TRIAL_X, color: '#ffd23f', icon: 'crown', custom: true },
];
const TUT_KEY = 'spiders.tutorial.v1';
const TUT_STEPS = [
  { id: 'jump', pad: ['A', 'jump'], kb: ['Space', 'jump'] },
  { id: 'web', pad: ['LT', 'hold to web'], kb: ['RMB', 'hold to web'] },
  { id: 'grab', pad: ['', 'Grab a weapon'], kb: ['', 'Grab a weapon'] },
  { id: 'use', pad: ['RT', 'use it'], kb: ['LMB', 'use it'] },
];
function tutorialDone() { try { return localStorage.getItem(TUT_KEY) === '1'; } catch (e) { return true; } }
function setTutorialDone() { try { localStorage.setItem(TUT_KEY, '1'); } catch (e) { /* not persisted */ } }
const START_TIME = 3;
const RACKS = [[660, HUB_Y - 30], [1260, HUB_Y - 30], [1740, LEDGE_Y - 30]];

// ---------------------------------------------------------------------------
// Practice dummy: a target on a springy post, or hanging from a rope. It
// takes every hit (and webs) but never dies.
class Dummy {
  constructor(game, { x, y, mode = 'post', len = 70 }) {
    this.game = game;
    this.kind = 'dummy';
    this.team = 'dummy';
    this.r = 26;
    this.alive = true;
    this.hp = Infinity;
    this.mode = mode;
    this.ax = x; this.ay = y; this.len = len;
    this.ang = 0; this.av = 0;
    this.flash = 0; this.hits = 0; this.t = 0;
    this.place();
    this.vx = 0; this.vy = 0;
  }
  place() {
    const s = Math.sin(this.ang), c = Math.cos(this.ang);
    const px = this.x, py = this.y;
    this.x = this.ax + s * this.len;
    this.y = this.mode === 'hang' ? this.ay + c * this.len : this.ay - c * this.len;
    return [px, py];
  }
  update(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.mode === 'hang') this.av += (-(1800 / this.len) * Math.sin(this.ang) - 0.6 * this.av) * dt;
    else this.av += (-60 * this.ang - 5 * this.av) * dt;
    this.ang += this.av * dt;
    if (this.mode === 'post') this.ang = clamp(this.ang, -1.1, 1.1);
    const [px, py] = this.place();
    if (px !== undefined && dt > 0) { this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt; }
  }
  // tangent of the swing (direction the body moves for +ang)
  tangent() {
    const c = Math.cos(this.ang), s = Math.sin(this.ang);
    return this.mode === 'hang' ? { x: c, y: -s } : { x: c, y: s };
  }
  impulse(ix, iy) {
    const t = this.tangent();
    this.av = clamp(this.av + ((ix * t.x + iy * t.y) / this.len) * 0.5, -14, 14);
  }
  hurt(info = {}) {
    let ix = info.ix || 0, iy = info.iy || 0;
    if (!ix && !iy && info.x !== undefined) { const dx = this.x - info.x, dy = this.y - info.y, m = Math.hypot(dx, dy) || 1; ix = dx / m * 500; iy = dy / m * 500; }
    if (!ix && !iy) ix = 400 * (Math.random() < 0.5 ? -1 : 1);
    this.impulse(ix * 1.5, iy * 1.5);
    this.hits++;
    this.flash = 1;
    const fx = this.game.fx;
    fx.burst(this.x, this.y, { n: 10, speed: 260, color: '#f3d9a0', life: 0.4, size: 3 });
    fx.text(this.x, this.y - this.r - 14, this.hits % 10 === 0 ? `${this.hits} HITS!` : 'HIT!', '#ffcf4a', this.hits % 10 === 0 ? 30 : 22, 0.7);
    sfx.hurt();
    return true;
  }
  draw(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    if (this.mode === 'hang') {
      ctx.strokeStyle = 'rgba(240,244,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.ax, this.ay); ctx.lineTo(this.x, this.y); ctx.stroke();
    } else {
      ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(this.ax, this.ay + 6); ctx.lineTo(this.x, this.y); ctx.stroke();
      ctx.fillStyle = '#3a2416';
      ctx.beginPath(); ctx.ellipse(this.ax, this.ay + 4, 22, 7, 0, 0, TAU); ctx.fill();
    }
    // target face
    const r = this.r;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.ang * 0.6);
    const rings = ['#f2e2c0', '#e0465a', '#f2e2c0', '#e0465a'];
    rings.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, r * (1 - i * 0.24), 0, TAU); ctx.fill(); });
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    // stitches
    ctx.strokeStyle = 'rgba(60,30,10,0.6)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5)); ctx.lineTo(Math.cos(a) * (r + 2), Math.sin(a) * (r + 2)); ctx.stroke(); }
    if (this.flash > 0) { ctx.globalAlpha = this.flash; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// miniature board previews for the board sign (cached per board)
const previews = new Map();
function boardPreview(def) {
  if (previews.has(def.id)) return previews.get(def.id);
  const c = document.createElement('canvas');
  const pw = 320, ph = 180, k = pw / W;
  c.width = pw; c.height = ph;
  const x = c.getContext('2d');
  const pal = THEMES[def.theme] || THEMES.night;
  const g = x.createLinearGradient(0, 0, 0, ph);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
  x.fillStyle = g; x.fillRect(0, 0, pw, ph);
  x.fillStyle = 'rgba(8,10,24,0.25)'; x.fillRect(0, 0, pw, ph);
  x.scale(k, k);
  for (const s of def.solids || []) {
    x.beginPath();
    if (s.circle) x.arc(s.circle[0], s.circle[1], s.circle[2], 0, TAU);
    else if (s.poly) s.poly.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    else continue;
    x.closePath();
    x.fillStyle = s.mat === 'lava' ? '#ff6a2a' : s.mat === 'ice' ? '#bfeaff' : s.mat === 'glass' ? 'rgba(170,230,255,0.6)' : s.mat === 'bouncy' ? '#ff7ad9' : (s.color || pal.rock);
    x.fill();
    x.lineWidth = 10; x.strokeStyle = s.mat === 'lava' ? '#ffcf5a' : (s.top || pal.top); x.stroke();
  }
  previews.set(def.id, c);
  return c;
}
const boardOptions = () => ['random', ...BOARDS.map((b) => b.id)];

// ---------------------------------------------------------------------------
export class Lobby {
  constructor(game, opts = {}) {
    this.game = game;
    this.opts = opts;
    this.zone = null;
    this.zoneT = 0;
    this.respawn = new Map();
    this.cards = new Map();      // player -> seconds left on the character card
    this.onZone = new Map();     // spider -> { zone, grace }
    this.pads = new Map();       // spider -> { side, t }
    this.settingsT = 0;
    this.settingsUsed = false;
    this.rackT = RACKS.map(() => 0);
    this.t = 0;
    this.pickFlash = 0;
    this.trialSel = loadTrials().sel;
    this.trialFlash = 0;
    this.tut = new Map();        // player -> { done: {jump, web, grab, use}, t, endT }
  }

  teamFor(p) { return 'p' + p.slot; }
  get friendlyFire() { return true; }

  start() {
    const game = this.game;
    const board = game.loadBoard(LOBBY_BOARD);
    game.music.menu();
    game.music.setDuck(1);
    for (const p of game.players) { p.score = 0; this.spawn(p); }
    this.drops = new DropSpawner(game, board, 'off');
    for (const [x, y] of RACKS) this.stock(x, y);
    game.addEnemy(new Dummy(game, { x: 1640, y: LEDGE_Y - 4, mode: 'post', len: 64 }));
    game.addEnemy(new Dummy(game, { x: 1330, y: 262, mode: 'hang', len: 150 }));
    // the button that left the title screen joins that player
    if (this.opts.join && !game.players.some((p) => p.inputId === this.opts.join)) this.join(this.opts.join);
  }

  stock(x, y) {
    const w = this.game.createWeapon(this.drops.nextId());
    if (!w) return;
    const p = this.game.spawnPickup(w, x, y, 0, 0);
    p.spawnGlow = 1;
  }

  spawn(p) {
    const b = this.game.board;
    const [x, y] = b.spawns[p.slot % b.spawns.length];
    this.game.spawnSpider(p, x, y - 40, { invuln: 1 });
  }

  join(id) {
    const np = this.game.addPlayer(id);
    if (np) {
      this.spawn(np); this.cards.set(np, 1.8);
      if (!tutorialDone()) this.tut.set(np, { done: {}, t: 0, endT: 0 });
    }
    return np;
  }

  update(dt, real = dt) {
    const game = this.game;
    this.t += real;
    this.pickFlash = Math.max(0, this.pickFlash - real * 2);
    // joining, character cycling, leaving
    for (const s of game.input.states) {
      const p = game.players.find((q) => q.inputId === s.id);
      if (!p) {
        const kb = s.kind === 'keyboard';
        if (s.pressed.a || (kb && (s.pressed.rt || s.pressed.lt))) this.join(s.id);
        continue;
      }
      const onTrials = p.spider && p.spider.alive && this.zoneOf(p.spider) === 'challenge';
      if (onTrials && (s.pressed.dl || s.pressed.dr)) this.cycleTrial(s.pressed.dl ? -1 : 1);
      else {
        if (s.pressed.dl) { game.cycleCast(p, -1); this.cards.set(p, 2.2); }
        if (s.pressed.dr) { game.cycleCast(p, 1); this.cards.set(p, 2.2); }
      }
      if (s.pressed.y) { game.cycleCast(p, 1); this.cards.set(p, 2.2); }
      if (s.pressed.back) { game.removePlayer(p); this.cards.delete(p); this.tut.delete(p); continue; }
    }
    this.trialFlash = Math.max(0, this.trialFlash - real * 2);
    this.updateTutorial(real);
    for (const [p, t] of this.cards) { if (t - real <= 0) this.cards.delete(p); else this.cards.set(p, t - real); }
    // respawn the fallen
    for (const p of game.players) {
      if (p.spider && p.spider.alive) { this.respawn.delete(p); continue; }
      const t = (this.respawn.get(p) || 0) + dt;
      this.respawn.set(p, t);
      if (t > 1.2) { this.respawn.delete(p); this.spawn(p); }
    }
    // weapon racks refill a few seconds after their weapon is taken
    RACKS.forEach(([x, y], i) => {
      const near = game.pickups.some((q) => !q.removed && Math.hypot(q.x - x, q.y - y) < 90);
      if (near || game.pickups.length > 9) { this.rackT[i] = 0; return; }
      this.rackT[i] += dt;
      if (this.rackT[i] > 3) { this.rackT[i] = 0; this.stock(x, y); game.fx.ring(x, y, 40, '#ffcf4a', 0.4, 4); }
    });
    this.updateZones(dt);
  }

  // which island each spider stands on (with a short grace for hops)
  zoneOf(sp) {
    const z = this.onZone.get(sp) || { zone: null, grace: 0 };
    return z.zone;
  }

  updateZones(dt) {
    const game = this.game;
    const spiders = game.players.map((p) => p.spider).filter((s) => s && s.alive);
    for (const sp of spiders) {
      const cur = this.onZone.get(sp) || { zone: null, grace: 0 };
      const g = sp.ground && sp.ground.solid && sp.ground.solid.def.zone;
      if (g) { cur.zone = g; cur.grace = 0.35; }
      else { cur.grace -= dt; if (cur.grace <= 0) cur.zone = null; }
      this.onZone.set(sp, cur);
    }
    for (const sp of [...this.onZone.keys()]) if (!spiders.includes(sp)) this.onZone.delete(sp);

    // board picker pads: the ends of the board island
    for (const sp of spiders) {
      let side = 0;
      if (this.zoneOf(sp) === 'board' && sp.ground && sp.ground.ny < -0.5) {
        if (sp.x < 960 - 105) side = -1; else if (sp.x > 960 + 105) side = 1;
      }
      const pad = this.pads.get(sp) || { side: 0, t: 0 };
      if (side && side !== pad.side) { this.cycleBoard(side); pad.t = 1.1; }
      else if (side) { pad.t -= dt; if (pad.t <= 0) { this.cycleBoard(side); pad.t = 0.9; } }
      pad.side = side;
      this.pads.set(sp, pad);
    }

    // settings ledge: stand on it for a moment
    const onSettings = spiders.some((sp) => this.zoneOf(sp) === 'settings' && sp.ground);
    if (!onSettings) { this.settingsT = 0; this.settingsUsed = false; }
    else if (!this.settingsUsed) {
      this.settingsT += dt;
      if (this.settingsT > 1) {
        this.settingsUsed = true; this.settingsT = 0;
        if (game.ui && !game.ui.open) game.ui.push(settingsMenu());
      }
    }

    // mode islands: every joined spider on the same one
    let zone = null;
    if (game.players.length && spiders.length === game.players.length) {
      const z0 = this.zoneOf(spiders[0]);
      if (z0 && ISLANDS.some((z) => z.id === z0) && spiders.every((s) => this.zoneOf(s) === z0)) zone = ISLANDS.find((z) => z.id === z0);
    }
    if (zone && !this.available(zone.id)) zone = null;
    if (zone && zone.id === 'challenge' && !trialUnlocked(this.trialSel)) zone = null;
    if (zone !== this.zone) { this.zone = zone; this.zoneT = 0; if (zone) sfx.count(); }
    if (zone) {
      const prev = this.zoneT;
      this.zoneT += dt;
      if (Math.floor(prev) !== Math.floor(this.zoneT) && this.zoneT < START_TIME) sfx.count();
      if (this.zoneT >= START_TIME) {
        sfx.go();
        if (zone.id === 'challenge') { setTrialSel(this.trialSel); game.go('challenge', { index: this.trialSel }); }
        else game.go(zone.id, { board: settings.board });
      }
    }
  }

  available(id) { return !!this.game.scenes[id]; }

  cycleTrial(dir) {
    this.trialSel = (this.trialSel + dir + TRIALS.length) % TRIALS.length;
    setTrialSel(this.trialSel);
    this.trialFlash = 1;
    sfx.ui();
  }

  // ---- first-time tutorial ------------------------------------------------------
  updateTutorial(dt) {
    const game = this.game;
    for (const [p, tu] of this.tut) {
      if (!game.players.includes(p)) { this.tut.delete(p); continue; }
      tu.t += dt;
      const sp = p.spider, s = game.input.get(p.inputId);
      if (tu.endT) { tu.endT += dt; if (tu.endT > 2.2) this.tut.delete(p); continue; }
      if (!sp || !sp.alive || !s || tu.t < 0.5) continue;
      const tick = (id) => {
        if (tu.done[id]) return;
        tu.done[id] = true;
        game.fx.text(sp.x, sp.y - 50, '✓', '#4fdc6a', 34, 0.8);
        sfx.uiOk();
      };
      if (s.pressed.a || s.pressed.lb) tick('jump');
      if (sp.web && sp.web.state === 'stuck') tick('web');
      if (sp.weapon) tick('grab');
      if (sp.weapon && s.pressed.rt) tick('use');
      if (TUT_STEPS.every((st) => tu.done[st.id])) { tu.endT = 0.001; setTutorialDone(); }
    }
  }

  drawTutorial(ctx) {
    for (const [p, tu] of this.tut) {
      const sp = p.spider;
      if (!sp || !sp.alive || tu.t < 0.5) continue;
      const s = this.game.input.get(p.inputId);
      const kb = s && s.kind === 'keyboard';
      const w = 250, h = 66;
      const x = clamp(sp.x - w / 2, 8, W - w - 8), y = clamp(sp.y + sp.r + 34, 8, H - h - 90);
      const a = Math.min(1, (tu.t - 0.5) * 3) * (tu.endT ? Math.max(0, 1 - (tu.endT - 1.6) * 2) : 1);
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      drawPanel(ctx, x, y, w, h, { r: 16, accent: tu.endT ? '#4fdc6a' : p.color.main, fill: 'rgba(10,8,28,0.88)', lw: 2.5 });
      if (tu.endT) {
        text(ctx, "You're ready!", x + w / 2, y + 32, { size: 26, color: '#4fdc6a', sw: 5 });
        text(ctx, 'swing to an island to play', x + w / 2, y + 54, { size: 15, color: '#dfe6ff', stroke: null });
      } else {
        const cur = TUT_STEPS.find((st) => !tu.done[st.id]);
        const [key, label] = kb ? cur.kb : cur.pad;
        let tx = x + 16;
        if (key) {
          ctx.font = `700 18px ${FONT}`;
          const kw = Math.max(34, ctx.measureText(key).width + 16);
          ctx.fillStyle = key === 'A' ? '#2f8f45' : 'rgba(255,255,255,0.18)';
          ctx.beginPath(); ctx.roundRect(tx, y + 12, kw, 28, 8); ctx.fill();
          text(ctx, key, tx + kw / 2, y + 32, { size: 18, color: '#fff', stroke: null });
          tx += kw + 10;
        }
        text(ctx, label, tx, y + 33, { size: 22, color: '#fff', align: 'left', sw: 4, maxWidth: x + w - tx - 8 });
        // the checklist
        TUT_STEPS.forEach((st, i) => {
          const cx = x + 22 + i * 58, cy = y + 52;
          const ok = tu.done[st.id];
          ctx.fillStyle = ok ? '#4fdc6a' : st === cur ? p.color.main : 'rgba(255,255,255,0.25)';
          ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
          text(ctx, st.id, cx + 9, cy + 5, { size: 13, color: ok ? '#4fdc6a' : '#aab0d8', align: 'left', stroke: null });
        });
      }
      ctx.restore();
    }
  }

  cycleBoard(dir) {
    const opts = boardOptions();
    const i = Math.max(0, opts.indexOf(settings.board));
    setSetting('board', opts[(i + dir + opts.length) % opts.length]);
    this.pickFlash = 1;
    sfx.ui();
    this.game.fx.ring(dir < 0 ? 960 - 150 : 960 + 150, BOARD_Y, 46, '#ffcf4a', 0.35, 4);
  }

  // ---- drawing ------------------------------------------------------------------
  drawBack(ctx) {
    const t = this.t;
    if (ready(LOBBY_BG.img)) {
      const img = LOBBY_BG.img;
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      ctx.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      ctx.fillStyle = 'rgba(8,10,24,0.3)'; ctx.fillRect(0, 0, W, H);
    }
    // threads holding up the islands (it's a spider's lobby)
    ctx.save();
    ctx.strokeStyle = 'rgba(230,236,255,0.22)'; ctx.lineWidth = 1.5;
    for (const [x, y] of [[170, MODE_Y], [430, MODE_Y], [1490, MODE_Y], [1750, MODE_Y], [800, BOARD_Y], [1120, BOARD_Y], [1330, 210], [TRIAL_X - 70, TRIAL_Y], [TRIAL_X + 70, TRIAL_Y], [TRIAL_SIGN_X - 95, TRIAL_Y - 100], [TRIAL_SIGN_X + 95, TRIAL_Y - 100]]) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.restore();
    for (const z of ISLANDS) if (!z.custom) this.drawModeSign(ctx, z);
    this.drawBoardSign(ctx);
    this.drawTrialSign(ctx);
    this.drawLedgeSign(ctx, 165, 130, 'SETTINGS', 'stand here', '#b46bff', 'gear', this.settingsT);
    this.drawLedgeSign(ctx, 1755, 1790, 'PRACTICE', 'hit the dummy', '#ffcf4a', 'target', 0);
    // board pads (arrows on the island ends)
    for (const dir of [-1, 1]) {
      const x = 960 + dir * 150, y = BOARD_Y - 6;
      const active = [...this.pads.values()].some((p) => p.side === dir);
      ctx.save();
      ctx.globalAlpha = active ? 1 : 0.55 + 0.25 * Math.sin(t * 3);
      ctx.fillStyle = active ? '#ffcf4a' : 'rgba(255,207,74,0.8)';
      ctx.beginPath();
      ctx.moveTo(x - dir * 4 + dir * 20, y - 34); ctx.lineTo(x - dir * 4 - dir * 6, y - 22); ctx.lineTo(x - dir * 4 + dir * 20, y - 10); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawIcon(ctx, kind, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = s * 0.14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (kind === 'swords') {
      for (const d of [-1, 1]) {
        ctx.save(); ctx.rotate(d * 0.75);
        ctx.shadowColor = color; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(0, s * 0.35); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(-s * 0.22, s * 0.38); ctx.lineTo(s * 0.22, s * 0.38); ctx.stroke();
        ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(0, s * 0.42); ctx.lineTo(0, s * 0.75); ctx.stroke();
        ctx.restore();
      }
    } else if (kind === 'bug') {
      ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.38, s * 0.5, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -s * 0.48, s * 0.24, 0, TAU); ctx.fill();
      ctx.lineWidth = s * 0.09;
      for (const d of [-1, 1]) {
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(d * s * 0.3, -s * 0.1 + i * s * 0.25); ctx.lineTo(d * s * 0.75, -s * 0.25 + i * s * 0.35); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(d * s * 0.1, -s * 0.65); ctx.quadraticCurveTo(d * s * 0.3, -s * 0.95, d * s * 0.45, -s * 0.9); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(-s * 0.4, -s * 0.2, s * 0.32, s * 0.16, -0.5, 0, TAU); ctx.ellipse(s * 0.4, -s * 0.2, s * 0.32, s * 0.16, 0.5, 0, TAU); ctx.fill();
    } else if (kind === 'gear') {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? s * 0.55 : s * 0.75; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, TAU); ctx.fill();
    } else if (kind === 'crown') {
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, s * 0.45); ctx.lineTo(-s * 0.75, -s * 0.35); ctx.lineTo(-s * 0.35, s * 0.02);
      ctx.lineTo(0, -s * 0.6); ctx.lineTo(s * 0.35, s * 0.02); ctx.lineTo(s * 0.75, -s * 0.35); ctx.lineTo(s * 0.7, s * 0.45);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(10,8,28,0.7)';
      for (const dx of [-0.35, 0, 0.35]) { ctx.beginPath(); ctx.arc(dx * s, s * 0.25, s * 0.09, 0, TAU); ctx.fill(); }
    } else if (kind === 'target') {
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, s * (0.7 - i * 0.24), 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }

  drawModeSign(ctx, z) {
    const t = this.t;
    const avail = this.available(z.id);
    const active = this.zone === z;
    const k = active ? Math.min(1, this.zoneT / START_TIME) : 0;
    const cx = z.x, w = 360, h = 150, y = MODE_Y - 70 - h;
    const bob = Math.sin(t * 1.4 + cx) * 4;
    ctx.save();
    ctx.translate(0, bob);
    // hanging threads
    ctx.strokeStyle = 'rgba(230,236,255,0.5)'; ctx.lineWidth = 2;
    for (const dx of [-w / 2 + 30, w / 2 - 30]) { ctx.beginPath(); ctx.moveTo(cx + dx, 0); ctx.lineTo(cx + dx, y); ctx.stroke(); }
    drawPanel(ctx, cx - w / 2, y, w, h, { r: 26, accent: avail ? z.color : '#777', fill: 'rgba(10,8,28,0.82)', lw: active ? 5 : 3 });
    if (active) {
      // fill bar along the bottom edge
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, h, 26); ctx.clip();
      ctx.fillStyle = rgba(z.color, 0.35);
      ctx.fillRect(cx - w / 2, y, w * k, h);
      ctx.restore();
    }
    this.drawIcon(ctx, z.icon, cx - w / 2 + 62, y + 72, 52, avail ? z.color : '#777');
    text(ctx, z.label, cx + 40, y + 70, { size: 54, color: avail ? z.color : '#888', sw: 8, stroke: 'rgba(5,3,16,0.8)' });
    text(ctx, avail ? z.sub : 'coming soon', cx + 40, y + 108, { size: 21, color: '#dfe6ff', stroke: null });
    // who is here
    const here = this.game.players.filter((p) => p.spider && p.spider.alive && this.zoneOf(p.spider) === z.id);
    if (here.length && !active && avail) {
      const n = this.game.players.length;
      text(ctx, `${here.length} / ${n} here`, cx, y + h + 30, { size: 24, color: '#fff', sw: 5 });
    }
    ctx.restore();
    if (active) {
      // countdown ring
      const rx = cx, ry = y - 62 + bob, R = 46;
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,28,0.85)';
      ctx.beginPath(); ctx.arc(rx, ry, R + 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(rx, ry, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = z.color; ctx.lineCap = 'round';
      ctx.shadowColor = z.color; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(rx, ry, R, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.restore();
      const n = Math.max(1, Math.ceil(START_TIME - this.zoneT));
      const pop = 1 + 0.25 * Math.max(0, 1 - ((this.zoneT % 1) * 4));
      ctx.save(); ctx.translate(rx, ry + 18); ctx.scale(pop, pop);
      text(ctx, String(n), 0, 0, { size: 54, color: '#fff', sw: 6 });
      ctx.restore();
    }
  }

  drawBoardSign(ctx) {
    const t = this.t;
    const cx = 960, w = 420, h = 236, y = 140;
    const bob = Math.sin(t * 1.2) * 3;
    ctx.save();
    ctx.translate(0, bob);
    ctx.strokeStyle = 'rgba(230,236,255,0.5)'; ctx.lineWidth = 2;
    for (const dx of [-w / 2 + 30, w / 2 - 30]) { ctx.beginPath(); ctx.moveTo(cx + dx, 0); ctx.lineTo(cx + dx, y); ctx.stroke(); }
    drawPanel(ctx, cx - w / 2, y, w, h, { r: 24, accent: '#ffcf4a', fill: 'rgba(10,8,28,0.85)', lw: 3 + this.pickFlash * 3 });
    text(ctx, 'BOARD', cx, y + 30, { size: 22, color: '#ffcf4a', stroke: null });
    const id = settings.board;
    const def = BOARDS.find((b) => b.id === id);
    const pw = 240, ph = 135, px = cx - pw / 2, py = y + 42;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.clip();
    if (def) ctx.drawImage(boardPreview(def), px, py, pw, ph);
    else {
      // random: cycle through the previews
      const list = BOARDS.length ? BOARDS : [];
      if (list.length) {
        const i = Math.floor(t * 2.5) % list.length;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(boardPreview(list[i]), px, py, pw, ph);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(10,8,28,0.45)'; ctx.fillRect(px, py, pw, ph);
      text(ctx, '?', cx, py + ph / 2 + 36, { size: 110, color: '#ffcf4a', sw: 10, stroke: 'rgba(5,3,16,0.8)' });
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.stroke();
    // arrows either side of the preview
    for (const d of [-1, 1]) {
      const ax = cx + d * (pw / 2 + 36), ay = py + ph / 2;
      ctx.fillStyle = 'rgba(255,207,74,0.9)';
      ctx.beginPath(); ctx.moveTo(ax + d * 14, ay); ctx.lineTo(ax - d * 8, ay - 18); ctx.lineTo(ax - d * 8, ay + 18); ctx.closePath(); ctx.fill();
    }
    const pop = 1 + this.pickFlash * 0.15;
    ctx.save(); ctx.translate(cx, y + h - 18); ctx.scale(pop, pop);
    text(ctx, def ? def.name : 'Random', 0, 0, { size: 34, color: '#fff', sw: 6, maxWidth: w - 30 });
    ctx.restore();
    ctx.restore();
    if (def && def.tagline) text(ctx, def.tagline, cx, y + h + 26 + bob, { size: 19, color: '#dfe6ff', sw: 4, maxWidth: 520 });
    else if (!def) text(ctx, 'step on the arrows to pick', cx, y + h + 26 + bob, { size: 19, color: '#dfe6ff', sw: 4 });
  }

  // the TRIALS perch sign: the selected trial, its lock state and the start countdown
  drawTrialSign(ctx) {
    const z = ISLANDS.find((q) => q.id === 'challenge');
    const d = loadTrials();
    const i = this.trialSel, T = TRIALS[i];
    const open = trialUnlocked(i, d), done = trialCleared(i, d);
    const active = this.zone === z;
    const k = active ? Math.min(1, this.zoneT / START_TIME) : 0;
    const w = 250, h = 92, cx = TRIAL_SIGN_X, y = TRIAL_Y - 100;
    const bob = Math.sin(this.t * 1.3 + 2) * 3;
    ctx.save();
    ctx.translate(0, bob);
    drawPanel(ctx, cx - w / 2, y, w, h, { r: 18, accent: z.color, fill: 'rgba(10,8,28,0.86)', lw: active ? 5 : 3 + this.trialFlash * 2 });
    if (active) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, h, 18); ctx.clip();
      ctx.fillStyle = rgba(z.color, 0.35); ctx.fillRect(cx - w / 2, y, w * k, h);
      ctx.restore();
    }
    this.drawIcon(ctx, 'crown', cx - w / 2 + 34, y + 34, 30, z.color);
    text(ctx, 'TRIALS', cx + 16, y + 38, { size: 32, color: z.color, sw: 6, stroke: 'rgba(5,3,16,0.8)' });
    const tier = TIERS[T.tier - 1];
    text(ctx, `${trialNumber(i)}  ${T.name}`, cx + 8, y + 72, { size: 20, color: open ? '#fff' : '#9aa0c8', sw: 4, maxWidth: w - 70 });
    if (!open) drawLock(ctx, cx + w / 2 - 22, y + 64, 16, '#9aa0c8');
    else if (done) text(ctx, '✓', cx + w / 2 - 22, y + 76, { size: 24, color: '#4fdc6a', sw: 4 });
    // arrows: D-pad picks while standing here
    for (const dd of [-1, 1]) {
      const ax = cx + dd * (w / 2 + 14), ay = y + h / 2;
      ctx.fillStyle = rgba(tier.color, 0.85);
      ctx.beginPath(); ctx.moveTo(ax + dd * 10, ay); ctx.lineTo(ax - dd * 6, ay - 13); ctx.lineTo(ax - dd * 6, ay + 13); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (active) {
      const rx = cx, ry = y - 50 + bob, R = 34;
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,28,0.85)';
      ctx.beginPath(); ctx.arc(rx, ry, R + 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = z.color; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(rx, ry, R, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.restore();
      text(ctx, String(Math.max(1, Math.ceil(START_TIME - this.zoneT))), rx, ry + 15, { size: 42, color: '#fff', sw: 6 });
    }
  }

  // the trial picker card: shown while anyone stands on the TRIALS perch
  drawTrialPicker(ctx) {
    const here = this.game.players.filter((p) => p.spider && p.spider.alive && this.zoneOf(p.spider) === 'challenge');
    if (!here.length) return;
    const d = loadTrials();
    const i = this.trialSel, T = TRIALS[i], tier = TIERS[T.tier - 1];
    const open = trialUnlocked(i, d), done = trialCleared(i, d);
    const w = 640, h = 250, x = clamp(TRIAL_SIGN_X - w / 2, 16, W - w - 16), y = 280;
    drawPanel(ctx, x, y, w, h, { r: 24, accent: tier.color, fill: 'rgba(10,8,28,0.94)', lw: 3 + this.trialFlash * 3 });
    text(ctx, `TIER ${T.tier} · ${tier.name.toUpperCase()}`, x + 28, y + 38, { size: 20, color: tier.color, align: 'left', stroke: null });
    text(ctx, `${trialNumber(i)}   (${i + 1}/${TRIALS.length})`, x + w - 28, y + 38, { size: 18, color: '#9aa0c8', align: 'right', stroke: null });
    // name + arrows
    const pop = 1 + this.trialFlash * 0.12;
    ctx.save(); ctx.translate(x + w / 2, y + 88); ctx.scale(pop, pop);
    text(ctx, T.name, 0, 0, { size: 46, color: open ? '#fff' : '#8a90b8', sw: 7, maxWidth: w - 150 });
    ctx.restore();
    for (const dd of [-1, 1]) {
      const ax = x + w / 2 + dd * (w / 2 - 34), ay = y + 74;
      ctx.fillStyle = tier.color;
      ctx.beginPath(); ctx.moveTo(ax + dd * 14, ay); ctx.lineTo(ax - dd * 8, ay - 18); ctx.lineTo(ax - dd * 8, ay + 18); ctx.closePath(); ctx.fill();
    }
    text(ctx, T.premise, x + w / 2, y + 126, { size: 22, color: '#e4e8ff', stroke: null, maxWidth: w - 50 });
    // rule chips
    const tags = trialTags(T);
    ctx.font = `600 16px ${FONT}`;
    const widths = tags.map((t) => ctx.measureText(t).width + 20);
    let tx = x + w / 2 - (widths.reduce((a, b) => a + b, 0) + 8 * (tags.length - 1)) / 2;
    tags.forEach((t, j) => {
      ctx.fillStyle = rgba(tier.color, 0.2);
      ctx.beginPath(); ctx.roundRect(tx, y + 142, widths[j], 26, 10); ctx.fill();
      text(ctx, t, tx + widths[j] / 2, y + 160, { size: 16, color: '#fff', stroke: null, weight: 600 });
      tx += widths[j] + 8;
    });
    // status
    let msg, col;
    if (!open) {
      const prev = TRIALS[i - 1];
      msg = prev && prev.tier === T.tier ? `Locked · clear ${prev.name} first` : `Locked · clear every ${TIERS[T.tier - 2].name} trial`;
      col = '#ff8a9a';
      drawLock(ctx, x + 40, y + 200, 22, col);
    } else if (done) { msg = 'Cleared · stand here 3 s to replay'; col = '#4fdc6a'; }
    else { msg = 'Everyone stand here 3 s to start'; col = '#ffd23f'; }
    if (this.zone && this.zone.id === 'challenge') {
      msg = `Starting in ${Math.max(1, Math.ceil(START_TIME - this.zoneT))}…`; col = '#fff';
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 24); ctx.clip();
      ctx.fillStyle = rgba(tier.color, 0.22); ctx.fillRect(x, y, w * Math.min(1, this.zoneT / START_TIME), h);
      ctx.restore();
    } else if (open && here.length < this.game.players.length) msg = `${here.length} / ${this.game.players.length} here · everyone stand here 3 s`;
    text(ctx, msg, x + w / 2, y + 206, { size: 24, color: col, sw: 4 });
    // progress: 6 tiers x 3
    TRIALS.forEach((q, j) => {
      const px = x + 32 + (q.tier - 1) * 58 + (j % 3) * 14, py = y + 232;
      ctx.fillStyle = trialCleared(j, d) ? '#4fdc6a' : trialUnlocked(j, d) ? TIERS[q.tier - 1].color : 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(px, py, j === i ? 6 : 4.5, 0, TAU); ctx.fill();
      if (j === i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    });
    text(ctx, '◀ ▶  D-pad / Z X to choose', x + w - 24, y + h - 8, { size: 14, color: '#9aa0c8', align: 'right', stroke: null });
  }

  drawLedgeSign(ctx, cx, postX, label, sub, color, icon, k) {
    const y = LEDGE_Y - 150;
    ctx.save();
    // a little post
    ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(postX, LEDGE_Y + 4); ctx.lineTo(postX, y + 60); ctx.stroke();
    drawPanel(ctx, cx - 105, y, 210, 72, { r: 16, accent: color, fill: 'rgba(10,8,28,0.82)' });
    if (k > 0) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(cx - 105, y, 210, 72, 16); ctx.clip();
      ctx.fillStyle = rgba(color, 0.4); ctx.fillRect(cx - 105, y, 210 * Math.min(1, k), 72);
      ctx.restore();
    }
    this.drawIcon(ctx, icon, cx - 70, y + 36, 30, color);
    text(ctx, label, cx + 18, y + 36, { size: 26, color, sw: 5 });
    text(ctx, sub, cx + 18, y + 60, { size: 16, color: '#dfe6ff', stroke: null });
    ctx.restore();
  }

  // world space, over the spiders: character cards (stacked so they never overlap)
  draw(ctx) {
    this.drawTutorial(ctx);
    const w = 230, h = 78;
    const list = [];
    for (const [p, left] of this.cards) {
      const sp = p.spider;
      if (!sp || !sp.alive) continue;
      list.push({ p, sp, left, x: clamp(sp.x - w / 2, 8, W - w - 8), y: clamp(sp.y - sp.r - 48 - h, 8, H - h) });
    }
    list.sort((a, b) => a.y - b.y || a.x - b.x);
    const placed = [];
    for (const c of list) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const q of placed) {
          if (Math.abs(q.x - c.x) < w + 6 && Math.abs(q.y - c.y) < h + 6) { c.y = q.y - h - 8; moved = true; }
        }
      }
      placed.push(c);
    }
    for (const { p, sp, left, x, y } of placed) {
      const a = Math.min(1, left * 3) * Math.min(1, (2.4 - left) * 8 + 0.3);
      const c = castAt(p.castIndex);
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      drawPanel(ctx, x, y, w, h, { r: 18, accent: p.color.main, fill: 'rgba(10,8,28,0.9)' });
      // pointer + leader line down to the spider
      const tx = clamp(sp.x, x + 20, x + w - 20);
      ctx.strokeStyle = rgba(p.color.main, 0.6); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, y + h + 10); ctx.lineTo(sp.x, sp.y - sp.r - 30); ctx.stroke();
      ctx.fillStyle = 'rgba(10,8,28,0.9)';
      ctx.beginPath(); ctx.moveTo(tx - 10, y + h); ctx.lineTo(tx + 10, y + h); ctx.lineTo(tx, y + h + 12); ctx.fill();
      drawPortrait(ctx, x + 40, y + h / 2, 29, p);
      text(ctx, c.name, x + 80, y + 38, { size: 28, align: 'left', color: '#fff', sw: 5, maxWidth: w - 96 });
      text(ctx, `P${p.slot + 1}  ◀ ▶ change`, x + 80, y + 62, { size: 16, align: 'left', color: p.color.main, stroke: null });
      ctx.restore();
    }
  }

  drawUI(ctx) {
    const game = this.game;
    const t = this.t;
    drawPlayerTags(ctx, game);
    // header
    text(ctx, 'SPIDER SWINGERS', 960, 52, { size: 40, color: '#fff', sw: 8, stroke: '#1b0d33' });
    text(ctx, game.players.length ? 'Swing to an island · everyone on it for 3 s starts it' : 'Lobby', 960, 92, { size: 22, color: '#cfd6ff', sw: 4 });
    if (!game.players.length) {
      const pulse = 1 + Math.sin(t * 4) * 0.04;
      ctx.save(); ctx.translate(960, 640); ctx.scale(pulse, pulse);
      drawPanel(ctx, -330, -60, 660, 120, { r: 60, accent: '#4fdc6a', fill: 'rgba(10,8,28,0.85)' });
      ctx.fillStyle = '#4fdc6a'; ctx.beginPath(); ctx.arc(-230, -2, 30, 0, TAU); ctx.fill();
      text(ctx, 'A', -230, 13, { size: 40, color: '#062a10', stroke: null });
      text(ctx, 'PRESS A TO JOIN', 40, 6, { size: 50, color: '#fff', sw: 0, stroke: null });
      text(ctx, 'keyboard: Space or click', 40, 40, { size: 22, color: '#cfd6ff', stroke: null });
      ctx.restore();
    }
    this.drawLegend(ctx);
    this.drawCards(ctx);
    this.drawTrialPicker(ctx);
  }

  drawLegend(ctx) {
    const chip = (x, y, key, label, color = 'rgba(255,255,255,0.14)') => {
      ctx.font = `600 17px ${FONT}`;
      const kw = Math.max(30, ctx.measureText(key).width + 16);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(x, y - 15, kw, 26, 8); ctx.fill();
      text(ctx, key, x + kw / 2, y + 4, { size: 17, color: '#fff', stroke: null, weight: 600 });
      text(ctx, label, x + kw + 6, y + 4, { size: 17, color: '#cfd6ff', align: 'left', stroke: 'rgba(0,0,0,0.5)', sw: 3, weight: 500 });
      ctx.font = `500 17px ${FONT}`;
      return x + kw + 12 + ctx.measureText(label).width + 14;
    };
    const y = 975;
    let x = 22;
    x = chip(x, y, 'LT', 'web');
    x = chip(x, y, 'A', 'jump', '#2f8f45');
    x = chip(x, y, 'RT', 'use');
    x = chip(x, y, 'RB', 'throw');
    x = chip(x, y, '◀▶', 'spider');
    x = 1360;
    x = chip(x, y, 'RMB', 'web');
    x = chip(x, y, 'Space', 'jump');
    x = chip(x, y, 'LMB', 'use');
    x = chip(x, y, 'Q', 'throw');
    chip(x, y, 'Z/X', 'spider');
  }

  drawCards(ctx) {
    const game = this.game;
    const n = 8, cw = 232, gap = 6, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2, y = 1008, h = 62;
    const firstEmpty = [...Array(n).keys()].find((i) => !game.players.some((q) => q.slot === i));
    for (let i = 0; i < n; i++) {
      const p = game.players.find((q) => q.slot === i);
      const x = x0 + i * (cw + gap);
      if (p) {
        drawPanel(ctx, x, y, cw, h, { r: 16, accent: p.color.main, fill: 'rgba(10,8,28,0.82)', lw: 2.5 });
        const dead = !(p.spider && p.spider.alive);
        drawPortrait(ctx, x + 32, y + h / 2, 22, p, { dead });
        text(ctx, `P${i + 1}`, x + 62, y + 24, { size: 16, align: 'left', color: p.color.main, stroke: null });
        text(ctx, castAt(p.castIndex).name, x + 62, y + 48, { size: 23, align: 'left', color: '#fff', sw: 4, maxWidth: cw - 72 });
        const z = p.spider && this.zoneOf(p.spider);
        const isl = ISLANDS.find((q) => q.id === z);
        if (isl) { ctx.fillStyle = isl.color; ctx.beginPath(); ctx.arc(x + cw - 16, y + 16, 6, 0, TAU); ctx.fill(); }
      } else {
        ctx.save();
        ctx.globalAlpha = i === firstEmpty ? 0.75 + 0.25 * Math.sin(this.t * 4) : 0.45;
        ctx.setLineDash([8, 7]);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x + 2, y + 2, cw - 4, h - 4, 16); ctx.stroke();
        ctx.setLineDash([]);
        text(ctx, i === firstEmpty ? 'Press A to join' : `P${i + 1}`, x + cw / 2, y + h / 2 + 8, { size: 20, color: 'rgba(255,255,255,0.8)', stroke: null });
        ctx.restore();
      }
    }
  }
}
