// The lobby is a playable level. Press A on any controller (or Space / click
// on the keyboard) to drop in a spider; Y or D-pad left/right (Z/X) changes
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
// Popups never sit over the play area: everything that comes and goes lives
// in reserved HUD strips (top edge: header / trial picker; bottom edge:
// tutorial pills, control legend, player cards). Signs hang well above the
// islands' landing areas.
//
// Everyone joined standing on the same mode island for 3 s starts it (solo
// is fine). The board island's ends are pressure pads that cycle the board
// (Random + every board in boards.js, saved with setSetting('board')).
// Standing on the SETTINGS ledge shows "Press START for settings"; Start
// there opens the settings menu (pause.js asks wantsSettings()).
// The TRIALS perch (modes/challenge.js): while standing on it, D-pad
// left/right (Z/X) picks a trial instead of the character (the picker shows
// in the top strip); everyone on it for 3 s starts the selected one (locked
// trials don't start).
// A first-time tutorial (stored per browser) walks a newly joined player
// through jump / web / grab / use with a pill above their player card.

import { island, blob } from './shapes.js';
import { W, H, THEMES } from './board.js';
import { sfx } from './audio.js';
import { text, drawPlayerTags, drawPortrait, drawPanel, drawGlyph } from './hud.js';
import { castAt } from './cast.js';
import { DropSpawner } from './weapons.js';
import { BOARDS } from './boards.js';
import { settings, setSetting } from './settings.js';
import { TAU, rgba, clamp, FONT } from './util.js';
import { optionalImage, ready } from './optional-art.js';
import { TRIALS, TIERS, loadTrials, setTrialSel, trialUnlocked, trialCleared, trialNumber, trialTags, drawLock, drawTierBadge, drawStar } from './modes/challenge.js';
import { preloadSprites, sprite } from './sprites.js';

const LOBBY_BG = optionalImage('lobby_bg.jpg');

// delivered lobby art (image-requests-history.md round 2, F + H): white sign
// glyphs (tinted), the floating island and the wooden signboard. Every piece
// keeps its drawn fallback.
const ICON_ART = { swords: 'icon_versus', bug: 'icon_survival', crown: 'icon_trials', board: 'icon_board', gear: 'icon_settings', target: 'icon_range' };
const ISLAND_ART = 'lobby_island.png', SIGN_ART = 'lobby_signboard.png';
preloadSprites([...Object.values(ICON_ART).map((n) => n + '.png'), ISLAND_ART, SIGN_ART]);

const HUB_Y = 790, MODE_Y = 460, BOARD_Y = 430, LEDGE_Y = 815;
const TRIAL_X = 600, TRIAL_Y = 262, TRIAL_SIGN_X = 612;   // up between VERSUS and BOARD, clear of the hub routes
const TRIAL_SIGN_Y = 110, TRIAL_SIGN_H = 74;              // the sign hangs clear above spiders on the perch

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
  // the island art's front half goes over the drawn terrain (Lobby.drawIslandsFront)
  onDraw: (ctx, game) => { if (game.scene && game.scene.drawIslandsFront) game.scene.drawIslandsFront(ctx); },
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
  { id: 'jump', pad: 'Jump (LB)', kb: 'Jump (Space)' },
  { id: 'web', pad: 'Web in mid-air (LB again, hold)', kb: 'Web in mid-air (Space again, hold)' },
  { id: 'grab', pad: 'Grab a weapon (RB)', kb: 'Grab a weapon (E)' },
  { id: 'use', pad: 'Use it (RT)', kb: 'Use it (left mouse)' },
];
function tutorialDone() { try { return localStorage.getItem(TUT_KEY) === '1'; } catch (e) { return true; } }
function setTutorialDone() { try { localStorage.setItem(TUT_KEY, '1'); } catch (e) { /* not persisted */ } }
const START_TIME = 3;
const CARD_TIME = 1.5;       // s the join / character-change highlight lasts
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
// ---------------------------------------------------------------------------
// Island art (lobby_island.png) laid over the island solids. The art's grass
// line sits on each solid's walkable top; its width spans the solid and its
// height stretches until the rocky underside covers the solid's polygon.
// Drawn twice: whole behind the spiders (drawBack), then once more clipped to
// the solids (slightly grown) over the drawn terrain, with the backdrop
// repainted under it first, so the procedural rock never shows and anything
// inside a solid stays hidden exactly as before.
const ISL_GL = 40, ISL_GR = 732, ISL_GY = 118;   // source px: grass ends + the walkable line
let islandCache = null;
function islandProfile(img) {
  // per source column: the lowest row of solid rock (eroded so thin roots and
  // dangling threads don't count)
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  let d;
  try { d = x.getImageData(0, 0, w, h).data; } catch (e) { return null; }
  const solid = (cx, cy) => d[(cy * w + Math.max(0, Math.min(w - 1, cx))) * 4 + 3] > 128;
  const bot = new Array(w).fill(ISL_GY);
  for (let cx = 0; cx < w; cx++) {
    for (let cy = h - 1; cy > ISL_GY; cy--) {
      let ok = true;
      for (let k = -8; k <= 8 && ok; k += 2) ok = solid(cx + k, cy);
      if (ok) { bot[cx] = cy; break; }
    }
  }
  return bot;
}
function islandLayout() {
  if (islandCache) return islandCache;
  const img = sprite(ISLAND_ART);
  if (!img) return null;
  const bot = islandProfile(img);
  if (!bot) return null;
  const list = [];
  const clip = new Path2D();
  for (const s of LOBBY_BOARD.solids) {
    if (!s.zone || !s.poly) continue;
    const P = s.poly;
    const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), top = Math.min(...ys) + 2;
    const sx = (x1 - x0 + 20) / (ISL_GR - ISL_GL);
    const ox = x0 - 10 - ISL_GL * sx;
    let sy = sx;
    for (const [px, py] of P) {
      if (py < top + 20) continue;
      const c = Math.round((px - ox) / sx);
      const depth = (bot[Math.max(0, Math.min(bot.length - 1, c))] || ISL_GY) - ISL_GY;
      if (depth > 8) sy = Math.max(sy, (py + 3 - top) / depth);
    }
    sy = Math.min(sy, sx * 2.2);
    list.push({ x: ox, y: top + 3 - ISL_GY * sy, w: img.naturalWidth * sx, h: img.naturalHeight * sy });
    // the solid grown by a few px (its drawn outline sits on the edge)
    const inside = (px, py) => {
      let r = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const [xi, yi] = P[i], [xj, yj] = P[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) r = !r;
      }
      return r;
    };
    P.forEach((b, i) => {
      const a = P[(i + P.length - 1) % P.length], c = P[(i + 1) % P.length];
      const n = (ex, ey) => { const l = Math.hypot(ex, ey) || 1; return [ey / l, -ex / l]; };
      const n1 = n(b[0] - a[0], b[1] - a[1]), n2 = n(c[0] - b[0], c[1] - b[1]);
      let nx = n1[0] + n2[0], ny = n1[1] + n2[1];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      if (inside(b[0] + nx * 3, b[1] + ny * 3)) { nx = -nx; ny = -ny; }
      const px = b[0] + nx * 6, py = b[1] + ny * 6;
      i ? clip.lineTo(px, py) : clip.moveTo(px, py);
    });
    clip.closePath();
  }
  islandCache = { img, list, clip };
  return islandCache;
}

// The wooden signboard (lobby_signboard.png) as a 9-slice: its ropes are cut
// off (silk threads are drawn instead) and the corners keep their shape at any
// size. Returns the inner (wood) rect, or null while the art isn't loaded.
const SIGN_SRC = { x: 18, y: 46, w: 604, h: 188, l: 74, r: 74, t: 40, b: 40, inset: 0.62 };
function drawSignboard(ctx, x, y, w, h, { dim = false } = {}) {
  const img = sprite(SIGN_ART);
  if (!img) return null;
  const S = SIGN_SRC, k = clamp(h / S.h, 0.42, 0.85);
  const L = S.l * k, R = S.r * k, T = S.t * k, B = S.b * k;
  const sx = [S.x, S.x + S.l, S.x + S.w - S.r, S.x + S.w], sy = [S.y, S.y + S.t, S.y + S.h - S.b, S.y + S.h];
  const dx = [x, x + L, x + w - R, x + w], dy = [y, y + T, y + h - B, y + h];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
  if (dim) ctx.filter = 'grayscale(0.85) brightness(0.7)';
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    ctx.drawImage(img, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dx[i + 1] - dx[i] + 0.5, dy[j + 1] - dy[j] + 0.5);
  }
  ctx.restore();
  const ix = x + L * S.inset, iy = y + T * S.inset;
  const inner = { x: ix, y: iy, w: w - (L + R) * S.inset, h: h - (T + B) * S.inset };
  // a touch darker so light text reads on the planks
  ctx.fillStyle = 'rgba(30,14,4,0.28)';
  ctx.beginPath(); ctx.roundRect(inner.x, inner.y, inner.w, inner.h, 6 * k); ctx.fill();
  return inner;
}
const WOOD_STROKE = 'rgba(28,12,2,0.9)';

// the reserved bottom strip: tutorial pills / legend / player cards
const CARD_N = 8, CARD_W = 232, CARD_GAP = 6, CARD_Y = 1008, CARD_H = 62;
const LEGEND_Y = 986, TUT_Y = 926;
const CARD_X0 = W / 2 - (CARD_N * CARD_W + (CARD_N - 1) * CARD_GAP) / 2;
const cardRect = (slot) => ({ x: CARD_X0 + slot * (CARD_W + CARD_GAP), y: CARD_Y, w: CARD_W, h: CARD_H });
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
    return this.drops.seedSpawns([[x, y]], 0)[0];
  }

  spawn(p) {
    const b = this.game.board;
    const [x, y] = b.spawns[p.slot % b.spawns.length];
    this.game.spawnSpider(p, x, y - 40, { invuln: 1 });
  }

  join(id) {
    const np = this.game.addPlayer(id);
    if (np) {
      this.spawn(np); this.cards.set(np, CARD_TIME);
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
        if (s.pressed.dl) { game.cycleCast(p, -1); this.cards.set(p, CARD_TIME); }
        if (s.pressed.dr) { game.cycleCast(p, 1); this.cards.set(p, CARD_TIME); }
      }
      if (s.pressed.y) { game.cycleCast(p, 1); this.cards.set(p, CARD_TIME); }
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
      if (this.drops.hasSpawn(x, y) || game.pickups.length > 9) { this.rackT[i] = 0; return; }
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

    // settings ledge: standing on it only shows a hint; Start opens the menu
    // (pause.js asks wantsSettings() before opening the pause menu)
    const onSettings = spiders.some((sp) => this.zoneOf(sp) === 'settings' && sp.ground);
    this.settingsT = onSettings ? Math.min(1, this.settingsT + dt * 4) : Math.max(0, this.settingsT - dt * 4);

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

  // Start pressed by this input: open settings instead of the pause menu?
  wantsSettings(inputId) {
    const p = this.game.players.find((q) => q.inputId === inputId);
    const sp = p && p.spider;
    return !!(sp && sp.alive && this.zoneOf(sp) === 'settings');
  }

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
        game.fx.text(sp.x, sp.y - sp.r - 30, '✓', '#4fdc6a', 24, 0.6);
        sfx.uiOk();
      };
      if (s.pressed.a || s.pressed.lt || s.pressed.lb) tick('jump');
      if (sp.web && sp.web.state === 'stuck') tick('web');
      if (sp.weapon) tick('grab');
      if (sp.weapon && s.pressed.rt) tick('use');
      if (TUT_STEPS.every((st) => tu.done[st.id])) { tu.endT = 0.001; setTutorialDone(); }
    }
  }

  // One pill per learning player, in the reserved strip just above that
  // player's card at the bottom edge (never over the play area).
  drawTutorial(ctx) {
    for (const [p, tu] of this.tut) {
      if (tu.t < 0.5) continue;
      const s = this.game.input.get(p.inputId);
      const kb = s && s.kind === 'keyboard';
      const { x: cx, w: cw } = cardRect(p.slot);
      const w = cw - 6, h = 40, x = cx + 3, y = TUT_Y;
      const a = Math.min(1, (tu.t - 0.5) * 3) * (tu.endT ? Math.max(0, 1 - (tu.endT - 1.6) * 2) : 1);
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      const col = tu.endT ? '#4fdc6a' : p.color.main;
      ctx.fillStyle = 'rgba(10,8,28,0.86)';
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 2; ctx.stroke();
      text(ctx, `P${p.slot + 1}`, x + 10, y + 16, { size: 12, color: p.color.main, align: 'left', stroke: null });
      if (tu.endT) {
        text(ctx, "You're ready! Swing to an island", x + w / 2, y + 33, { size: 15, color: '#4fdc6a', stroke: null, maxWidth: w - 16 });
      } else {
        const cur = TUT_STEPS.find((st) => !tu.done[st.id]);
        // progress ticks along the top line
        TUT_STEPS.forEach((st, i) => {
          const ok = tu.done[st.id];
          ctx.fillStyle = ok ? '#4fdc6a' : st === cur ? p.color.main : 'rgba(255,255,255,0.22)';
          ctx.beginPath(); ctx.arc(x + 42 + i * 13, y + 11, 4, 0, TAU); ctx.fill();
        });
        text(ctx, `${TUT_STEPS.indexOf(cur) + 1}/4`, x + w - 10, y + 16, { size: 12, color: '#9aa0c8', align: 'right', stroke: null });
        text(ctx, kb ? cur.kb : cur.pad, x + w / 2, y + 34, { size: 15, color: '#fff', stroke: null, weight: 600, maxWidth: w - 14 });
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
  // the painted backdrop (false when it isn't in: the board's own sky shows)
  drawBackdrop(ctx) {
    if (!ready(LOBBY_BG.img)) return false;
    const img = LOBBY_BG.img;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    ctx.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    ctx.fillStyle = 'rgba(8,10,24,0.3)'; ctx.fillRect(0, 0, W, H);
    return true;
  }

  // the islands' art over the drawn terrain (see islandLayout)
  drawIslandsFront(ctx) {
    const L = islandLayout();
    if (!L) return;
    ctx.save();
    ctx.clip(L.clip);
    if (!this.drawBackdrop(ctx)) this.game.board.drawBackground(ctx);
    for (const r of L.list) ctx.drawImage(L.img, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  drawBack(ctx) {
    const t = this.t;
    this.drawBackdrop(ctx);
    // threads holding up the islands (it's a spider's lobby)
    ctx.save();
    ctx.strokeStyle = 'rgba(230,236,255,0.22)'; ctx.lineWidth = 1.5;
    for (const [x, y] of [[170, MODE_Y], [430, MODE_Y], [1490, MODE_Y], [1750, MODE_Y], [800, BOARD_Y], [1120, BOARD_Y], [1330, 210], [TRIAL_X - 70, TRIAL_Y], [TRIAL_X + 70, TRIAL_Y], [TRIAL_SIGN_X - 95, TRIAL_SIGN_Y], [TRIAL_SIGN_X + 95, TRIAL_SIGN_Y]]) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y); ctx.stroke();
    }
    ctx.restore();
    // island art, whole, behind the spiders
    const L = islandLayout();
    if (L) for (const r of L.list) ctx.drawImage(L.img, r.x, r.y, r.w, r.h);
    for (const z of ISLANDS) if (!z.custom) this.drawModeSign(ctx, z);
    this.drawBoardSign(ctx);
    this.drawTrialSign(ctx);
    this.drawLedgeSign(ctx, 165, 130, 'SETTINGS', 'stand here + START', '#b46bff', 'gear', this.settingsT, 'Press START / Esc for settings');
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
    if (ICON_ART[kind] && drawGlyph(ctx, ICON_ART[kind], x, y, s * 1.75, color)) return;
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
    const wood = drawSignboard(ctx, cx - w / 2, y, w, h, { dim: !avail });
    if (!wood) drawPanel(ctx, cx - w / 2, y, w, h, { r: 26, accent: avail ? z.color : '#777', fill: 'rgba(10,8,28,0.82)', lw: active ? 5 : 3 });
    else if (active) {
      // a glow along the frame while the start fills
      ctx.save();
      ctx.shadowColor = z.color; ctx.shadowBlur = 24;
      ctx.strokeStyle = rgba(z.color, 0.9); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(cx - w / 2 + 4, y + 4, w - 8, h - 8, 12); ctx.stroke();
      ctx.restore();
    }
    if (active) {
      // fill bar
      const r = wood || { x: cx - w / 2, y, w, h };
      ctx.save();
      ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, wood ? 6 : 26); ctx.clip();
      ctx.fillStyle = rgba(z.color, 0.35);
      ctx.fillRect(r.x, r.y, r.w * k, r.h);
      ctx.restore();
    }
    this.drawIcon(ctx, z.icon, cx - w / 2 + 70, y + 74, 48, avail ? z.color : '#777');
    text(ctx, z.label, cx + 40, y + 72, { size: 54, color: avail ? z.color : '#888', sw: wood ? 10 : 8, stroke: wood ? WOOD_STROKE : 'rgba(5,3,16,0.8)', maxWidth: w - 120 });
    // who is here (inside the sign, not over the island's landing area)
    const here = this.game.players.filter((p) => p.spider && p.spider.alive && this.zoneOf(p.spider) === z.id);
    const n = this.game.players.length;
    const sub = !avail ? 'coming soon' : here.length && !active ? `${here.length} / ${n} here · everyone for 3 s` : z.sub;
    text(ctx, sub, cx + (wood ? 34 : 40), y + 106, { size: 21, color: here.length && !active && avail ? '#fff' : '#f2ecdf', stroke: wood ? WOOD_STROKE : null, sw: 5, maxWidth: w - (wood ? 160 : 100) });
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
    const cx = 960, w = 360, h = sprite(SIGN_ART) ? 216 : 190, y = 118;   // hangs clear of spiders on the board island
    const bob = Math.sin(t * 1.2) * 3;
    ctx.save();
    ctx.translate(0, bob);
    ctx.strokeStyle = 'rgba(230,236,255,0.5)'; ctx.lineWidth = 2;
    for (const dx of [-w / 2 + 30, w / 2 - 30]) { ctx.beginPath(); ctx.moveTo(cx + dx, 0); ctx.lineTo(cx + dx, y); ctx.stroke(); }
    const wood = drawSignboard(ctx, cx - w / 2, y, w, h);
    if (wood) {
      if (this.pickFlash > 0) {
        ctx.save(); ctx.globalAlpha = this.pickFlash;
        ctx.shadowColor = '#ffcf4a'; ctx.shadowBlur = 24; ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.roundRect(cx - w / 2 + 4, y + 4, w - 8, h - 8, 12); ctx.stroke();
        ctx.restore();
      }
      drawGlyph(ctx, ICON_ART.board, cx - 50, y + 22, 24, '#ffcf4a');
      text(ctx, 'BOARD', cx + 14, y + 29, { size: 20, color: '#ffcf4a', stroke: WOOD_STROKE, sw: 5 });
    } else {
      drawPanel(ctx, cx - w / 2, y, w, h, { r: 24, accent: '#ffcf4a', fill: 'rgba(10,8,28,0.85)', lw: 3 + this.pickFlash * 3 });
      text(ctx, 'BOARD', cx, y + 25, { size: 18, color: '#ffcf4a', stroke: null });
    }
    const id = settings.board;
    const def = BOARDS.find((b) => b.id === id);
    const pw = 208, ph = 117, px = cx - pw / 2, py = y + (wood ? 38 : 34);
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
      text(ctx, '?', cx, py + ph / 2 + 32, { size: 96, color: '#ffcf4a', sw: 10, stroke: 'rgba(5,3,16,0.8)' });
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.stroke();
    // arrows either side of the preview
    for (const d of [-1, 1]) {
      const ax = cx + d * (pw / 2 + 32), ay = py + ph / 2;
      ctx.fillStyle = 'rgba(255,207,74,0.9)';
      ctx.beginPath(); ctx.moveTo(ax + d * 14, ay); ctx.lineTo(ax - d * 8, ay - 18); ctx.lineTo(ax - d * 8, ay + 18); ctx.closePath(); ctx.fill();
    }
    const pop = 1 + this.pickFlash * 0.15;
    ctx.save(); ctx.translate(cx, y + h - (wood ? 30 : 13)); ctx.scale(pop, pop);
    text(ctx, def ? def.name : 'Random', 0, 0, { size: 28, color: '#fff', sw: 6, stroke: wood ? WOOD_STROKE : 'rgba(0,0,0,0.6)', maxWidth: w - 70 });
    ctx.restore();
    ctx.restore();
    if (def && def.tagline) text(ctx, def.tagline, cx, y + h + 21 + bob, { size: 16, color: '#dfe6ff', sw: 4, maxWidth: 460 });
    else if (!def) text(ctx, 'step on the arrows to pick', cx, y + h + 21 + bob, { size: 16, color: '#dfe6ff', sw: 4 });
  }

  // the TRIALS perch sign: the selected trial, its lock state and the start
  // fill. Hangs above the perch so spiders standing there stay in the clear.
  drawTrialSign(ctx) {
    const z = ISLANDS.find((q) => q.id === 'challenge');
    const d = loadTrials();
    const i = this.trialSel, T = TRIALS[i];
    const open = trialUnlocked(i, d), done = trialCleared(i, d);
    const active = this.zone === z;
    const k = active ? Math.min(1, this.zoneT / START_TIME) : 0;
    const art = !!sprite(SIGN_ART);
    const w = art ? 270 : 250, h = art ? TRIAL_SIGN_H + 14 : TRIAL_SIGN_H, cx = TRIAL_SIGN_X, y = TRIAL_SIGN_Y;
    const bob = Math.sin(this.t * 1.3 + 2) * 3;
    ctx.save();
    ctx.translate(0, bob);
    // while someone stands on the perch the top-strip picker says it all: fade
    // the sign back so the spiders right under it read clearly
    this.trialSignA = clamp((this.trialSignA ?? 1) + (this.playersOn('challenge').length ? -0.08 : 0.08), 0.3, 1);
    ctx.globalAlpha = this.trialSignA;
    const wood = drawSignboard(ctx, cx - w / 2, y, w, h);
    if (!wood) drawPanel(ctx, cx - w / 2, y, w, h, { r: 18, accent: z.color, fill: 'rgba(10,8,28,0.86)', lw: active ? 5 : 3 + this.trialFlash * 2 });
    else if (active || this.trialFlash > 0) {
      ctx.save(); ctx.globalAlpha *= active ? 1 : this.trialFlash;
      ctx.shadowColor = z.color; ctx.shadowBlur = 20; ctx.strokeStyle = z.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(cx - w / 2 + 3, y + 3, w - 6, h - 6, 8); ctx.stroke();
      ctx.restore();
    }
    if (active) {
      const r = wood || { x: cx - w / 2, y, w, h };
      ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, wood ? 5 : 18); ctx.clip();
      ctx.fillStyle = rgba(z.color, 0.35); ctx.fillRect(r.x, r.y, r.w * k, r.h);
      ctx.restore();
    }
    const stroke = wood ? WOOD_STROKE : 'rgba(5,3,16,0.8)';
    const tier = TIERS[T.tier - 1];
    if (wood) {
      this.drawIcon(ctx, 'crown', cx - w / 2 + 44, y + 30, 22, z.color);
      text(ctx, 'TRIALS', cx + 6, y + 39, { size: 28, color: z.color, sw: 7, stroke });
      // line 2: the selected trial's tier badge, number + name, lock / star
      drawTierBadge(ctx, T.tier, cx - w / 2 + 40, y + 62, 24, { locked: !open });
      text(ctx, `${trialNumber(i)}  ${T.name}`, cx - w / 2 + 58, y + 69, { size: 18, color: open ? '#fff' : '#b8bcd8', sw: 5, stroke, align: 'left', maxWidth: w - 116 });
      if (!open) drawLock(ctx, cx + w / 2 - 34, y + 60, 15, '#c8cce4');
      else if (done) drawStar(ctx, cx + w / 2 - 34, y + 60, 24);
    } else {
      this.drawIcon(ctx, 'crown', cx - w / 2 + 34, y + 27, 26, z.color);
      text(ctx, 'TRIALS', cx + 16, y + 32, { size: 28, color: z.color, sw: 6, stroke });
      text(ctx, `${trialNumber(i)}  ${T.name}`, cx + 8, y + 60, { size: 18, color: open ? '#fff' : '#9aa0c8', sw: 4, maxWidth: w - 70 });
      if (!open) drawLock(ctx, cx + w / 2 - 22, y + 53, 14, '#9aa0c8');
      else if (done) drawStar(ctx, cx + w / 2 - 22, y + 55, 22);
    }
    // arrows: D-pad picks while standing here
    for (const dd of [-1, 1]) {
      const ax = cx + dd * (w / 2 + 14), ay = y + h / 2;
      ctx.fillStyle = rgba(tier.color, 0.85);
      ctx.beginPath(); ctx.moveTo(ax + dd * 10, ay); ctx.lineTo(ax - dd * 6, ay - 13); ctx.lineTo(ax - dd * 6, ay + 13); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  playersOn(zone) { return this.game.players.filter((p) => p.spider && p.spider.alive && this.zoneOf(p.spider) === zone); }

  // the trial picker: a compact card in the reserved top strip (it replaces
  // the header) while anyone stands on the TRIALS perch
  drawTrialPicker(ctx) {
    const here = this.playersOn('challenge');
    if (!here.length) return false;
    const d = loadTrials();
    const i = this.trialSel, T = TRIALS[i], tier = TIERS[T.tier - 1];
    const open = trialUnlocked(i, d), done = trialCleared(i, d);
    const w = 900, h = 100, x = W / 2 - w / 2, y = 5;
    drawPanel(ctx, x, y, w, h, { r: 20, accent: tier.color, fill: 'rgba(10,8,28,0.92)', lw: 2.5 + this.trialFlash * 3 });
    const starting = this.zone && this.zone.id === 'challenge';
    if (starting) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 20); ctx.clip();
      ctx.fillStyle = rgba(tier.color, 0.22); ctx.fillRect(x, y, w * Math.min(1, this.zoneT / START_TIME), h);
      ctx.restore();
    }
    // line 1: tier · rule chips · number
    const badge = drawTierBadge(ctx, T.tier, x + 34, y + 20, 26, { locked: !open });
    text(ctx, `TIER ${T.tier} · ${tier.name.toUpperCase()}`, x + (badge ? 52 : 22), y + 25, { size: 15, color: tier.color, align: 'left', stroke: null });
    text(ctx, `${trialNumber(i)}  (${i + 1}/${TRIALS.length})`, x + w - 22, y + 24, { size: 14, color: '#9aa0c8', align: 'right', stroke: null });
    const tags = trialTags(T);
    ctx.font = `600 13px ${FONT}`;
    const widths = tags.map((t) => ctx.measureText(t).width + 16);
    let tx = x + w / 2 - (widths.reduce((a, b) => a + b, 0) + 6 * (tags.length - 1)) / 2;
    tags.forEach((t, j) => {
      ctx.fillStyle = rgba(tier.color, 0.2);
      ctx.beginPath(); ctx.roundRect(tx, y + 9, widths[j], 20, 8); ctx.fill();
      text(ctx, t, tx + widths[j] / 2, y + 23, { size: 13, color: '#fff', stroke: null, weight: 600 });
      tx += widths[j] + 6;
    });
    // left: name with arrows; right: premise + status
    const nx = x + 200;
    const pop = 1 + this.trialFlash * 0.12;
    ctx.save(); ctx.translate(nx, y + 62); ctx.scale(pop, pop);
    text(ctx, T.name, 0, 0, { size: 30, color: open ? '#fff' : '#8a90b8', sw: 6, maxWidth: 270 });
    ctx.restore();
    for (const dd of [-1, 1]) {
      const ax = nx + dd * 168, ay = y + 52;
      ctx.fillStyle = tier.color;
      ctx.beginPath(); ctx.moveTo(ax + dd * 11, ay); ctx.lineTo(ax - dd * 6, ay - 14); ctx.lineTo(ax - dd * 6, ay + 14); ctx.closePath(); ctx.fill();
    }
    text(ctx, T.premise, x + 390, y + 54, { size: 17, color: '#e4e8ff', align: 'left', stroke: null, maxWidth: w - 410 });
    let msg, col;
    if (!open) {
      const prev = TRIALS[i - 1];
      msg = prev && prev.tier === T.tier ? `Locked · clear ${prev.name} first` : `Locked · clear every ${TIERS[T.tier - 2].name} trial`;
      col = '#ff8a9a';
      drawLock(ctx, x + 400, y + 76, 13, col);
    } else if (done) { msg = 'Cleared · stand here 3 s to replay'; col = '#4fdc6a'; }
    else { msg = 'Everyone stand here 3 s to start'; col = '#ffd23f'; }
    if (starting) { msg = `Starting in ${Math.max(1, Math.ceil(START_TIME - this.zoneT))}…`; col = '#fff'; }
    else if (open && here.length < this.game.players.length) msg = `${here.length} / ${this.game.players.length} here · everyone stand here 3 s`;
    text(ctx, msg, x + (open ? 390 : 416), y + 82, { size: 17, color: col, align: 'left', sw: 3, maxWidth: w - 430 });
    // progress: 6 tiers x 3 along the bottom-left
    TRIALS.forEach((q, j) => {
      const px = x + 34 + (q.tier - 1) * 52 + (j % 3) * 12, py = y + 87;
      ctx.fillStyle = trialCleared(j, d) ? '#4fdc6a' : trialUnlocked(j, d) ? TIERS[q.tier - 1].color : 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.arc(px, py, j === i ? 5 : 3.5, 0, TAU); ctx.fill();
      if (j === i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    });
    text(ctx, '◀ ▶  D-pad / Z X', x + w - 22, y + h - 9, { size: 12, color: '#9aa0c8', align: 'right', stroke: null });
    return true;
  }

  drawLedgeSign(ctx, cx, postX, label, sub, color, icon, k, hint = '') {
    const art = !!sprite(SIGN_ART);
    const w = art ? 240 : 230, h = art ? 82 : 72, y = LEDGE_Y - 150 - (art ? 6 : 0);
    ctx.save();
    // a little post
    ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(postX, LEDGE_Y + 4); ctx.lineTo(postX, y + 60); ctx.stroke();
    const wood = drawSignboard(ctx, cx - w / 2, y, w, h);
    if (!wood) drawPanel(ctx, cx - w / 2, y, w, h, { r: 16, accent: color, fill: 'rgba(10,8,28,0.82)', lw: 3 + k * 2 });
    if (k > 0) {
      const r = wood || { x: cx - w / 2, y, w, h };
      ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, wood ? 5 : 16); ctx.clip();
      ctx.fillStyle = rgba(color, 0.3 * k); ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    const stroke = wood ? WOOD_STROKE : 'rgba(0,0,0,0.6)';
    const oy = wood ? 4 : 0;
    this.drawIcon(ctx, icon, cx - w / 2 + (wood ? 42 : 34), y + 30 + oy, wood ? 24 : 26, color);
    text(ctx, label, cx + 16, y + 36 + oy, { size: 26, color, sw: wood ? 7 : 5, stroke });
    if (hint && k > 0) {
      ctx.globalAlpha = k;
      text(ctx, hint, cx, y + 60 + oy * 1.5, { size: 15, color: '#ffcf4a', stroke: wood ? stroke : 'rgba(5,3,16,0.8)', sw: wood ? 4 : 3, maxWidth: w - 44 });
      ctx.globalAlpha = 1;
    } else text(ctx, sub, cx + 16, y + 60 + oy * 1.5, { size: 15, color: wood ? '#f2ecdf' : '#dfe6ff', stroke: wood ? stroke : null, sw: 4 });
    ctx.restore();
  }

  drawUI(ctx) {
    const game = this.game;
    const t = this.t;
    // tiny name tag over a spider that just joined / changed character
    drawPlayerTags(ctx, game, {
      label: (sp) => {
        const left = this.cards.get(sp.player);
        if (!left) return null;
        return { text: `P${sp.player.slot + 1} ${castAt(sp.player.castIndex).name}`, k: clamp(left * 3, 0, 1) };
      },
    });
    // top strip: the trial picker replaces the header while anyone is on the perch
    if (!this.drawTrialPicker(ctx)) {
      text(ctx, 'SPIDER SWINGERS', 960, 52, { size: 40, color: '#fff', sw: 8, stroke: '#1b0d33' });
      text(ctx, game.players.length ? 'Swing to an island · everyone on it for 3 s starts it' : 'Lobby', 960, 92, { size: 22, color: '#cfd6ff', sw: 4 });
    }
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
    // bottom strip: tutorial pills, control legend, player cards
    this.drawTutorial(ctx);
    this.drawLegend(ctx);
    this.drawCards(ctx);
  }

  drawLegend(ctx) {
    const SZ = 15;
    const measure = ([key, label]) => {
      ctx.font = `600 ${SZ}px ${FONT}`;
      const kw = Math.max(26, ctx.measureText(key).width + 12);
      ctx.font = `500 ${SZ}px ${FONT}`;
      return { kw, w: kw + 5 + ctx.measureText(label).width + 14 };
    };
    const chip = (x, y, [key, label, color = 'rgba(255,255,255,0.14)']) => {
      const { kw, w } = measure([key, label]);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(x, y - 13, kw, 22, 7); ctx.fill();
      text(ctx, key, x + kw / 2, y + 3, { size: SZ, color: '#fff', stroke: null, weight: 600 });
      text(ctx, label, x + kw + 5, y + 3, { size: SZ, color: '#cfd6ff', align: 'left', stroke: 'rgba(0,0,0,0.5)', sw: 3, weight: 500 });
      return x + w;
    };
    const y = LEGEND_Y;
    const PAD = [['LB', 'jump · web', '#2f8f45'], ['RT', 'attack'], ['RB', 'grab · throw'], ['X', 'swap'], ['Y/◀▶', 'spider']];
    const KB = [['Space/RMB', 'jump · web'], ['LMB', 'attack'], ['E', 'grab · throw'], ['F', 'swap'], ['Z/X', 'spider']];
    let x = 22;
    for (const c of PAD) x = chip(x, y, c);
    x = W - 22 - KB.reduce((s, c) => s + measure(c).w, 0) + 14;
    for (const c of KB) x = chip(x, y, c);
  }

  drawCards(ctx) {
    const game = this.game;
    const firstEmpty = [...Array(CARD_N).keys()].find((i) => !game.players.some((q) => q.slot === i));
    for (let i = 0; i < CARD_N; i++) {
      const p = game.players.find((q) => q.slot === i);
      let { x, y, w: cw, h } = cardRect(i);
      if (p) {
        // join / character change: the card lifts and glows instead of a popup over the arena
        const left = this.cards.get(p) || 0;
        const k = left ? clamp(left * 3, 0, 1) * clamp((CARD_TIME - left) * 10, 0, 1) : 0;
        y -= 8 * k;
        ctx.save();
        if (k) { ctx.shadowColor = p.color.main; ctx.shadowBlur = 22 * k; }
        drawPanel(ctx, x, y, cw, h, { r: 16, accent: p.color.main, fill: k ? `rgba(${Math.round(10 + 30 * k)},${Math.round(8 + 20 * k)},40,0.9)` : 'rgba(10,8,28,0.82)', lw: 2.5 + 2 * k });
        ctx.restore();
        const dead = !(p.spider && p.spider.alive);
        drawPortrait(ctx, x + 32, y + h / 2, 22 + 3 * k, p, { dead });
        text(ctx, `P${i + 1}`, x + 62, y + 24, { size: 16, align: 'left', color: p.color.main, stroke: null });
        text(ctx, castAt(p.castIndex).name, x + 62, y + 48, { size: 23, align: 'left', color: '#fff', sw: 4, maxWidth: cw - 72 });
        if (k) {
          ctx.globalAlpha = k;
          text(ctx, '◀ ▶ change', x + cw - 12, y + 24, { size: 13, align: 'right', color: p.color.main, stroke: null });
          ctx.globalAlpha = 1;
        } else {
          const z = p.spider && this.zoneOf(p.spider);
          const isl = ISLANDS.find((q) => q.id === z);
          if (isl) { ctx.fillStyle = isl.color; ctx.beginPath(); ctx.arc(x + cw - 16, y + 16, 6, 0, TAU); ctx.fill(); }
        }
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
