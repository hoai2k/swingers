// The arcade cabinets in the town arcade (world/interiors.js ARCADE calls
// buildArcade). Four playable machines: CHOMP MAZE, SPACE RAIDERS, BUG BLASTER
// and PADDLE BALL (games in this folder, interface in common.js).
//
// Each cabinet renders its game into a small canvas used as a CanvasTexture on
// the cabinet's screen. Idle cabinets run an attract-mode demo, but only while
// a camera is within NEAR metres, and repaint the texture at SCREEN_HZ. Press Y
// at a cabinet (a use spot) to play: an ArcadePanel opens in that player's own
// view (panel.js) and the game runs at a fixed 60 Hz from game.updaters,
// independent of the frame rate. Start / Esc / B leaves.
//
// Paddle Ball is for two: when there are other players, starting it sends each
// of them an invite in their own view ("Y join · B no", see inviteInput, called
// from ui.handleInput); the first to accept takes the right paddle. Nobody
// within INVITE_S seconds (or everyone declines, or the host presses A) starts
// a match against the CPU. Anyone can also walk up and press Y at the cabinet
// to take over the CPU's paddle.
//
// High scores are saved in settings.arcade (top 5 per game; Paddle Ball counts
// wins against the CPU). Good scores pay coins (TIERS) through game.life.reward.
//
// game.arcade (for probes): cabinets [{ Game, machine, pos, session, ... }],
// start(player, cab), join(player, cab), invites, inviteInput(player), tick(cab).
import * as THREE from 'three';
import { signMesh } from '../mesh.js';
import { useSpot } from '../world/common.js';
import { settings, saveSettings } from '../settings.js';
import { STEP, txt, pad } from './common.js';
import { ChompMaze } from './chomp.js';
import { SpaceRaiders } from './raiders.js';
import { BugBlaster } from './bugs.js';
import { PaddleBall } from './paddle.js';
import { ArcadePanel, InvitePrompt } from './panel.js';

export const GAMES = { chomp: ChompMaze, raiders: SpaceRaiders, bugs: BugBlaster, paddle: PaddleBall };
const NEAR = 16, SCREEN_HZ = 15, INVITE_S = 10;
// score -> coins (highest tier reached pays)
const TIERS = { chomp: [[3000, 5], [10000, 15], [20000, 30]], raiders: [[1000, 5], [3000, 15], [6000, 30]], bugs: [[5000, 5], [15000, 15], [30000, 30]] };

// ---- saved high scores ----------------------------------------------------------
function store() {
  let a = settings.arcade;
  if (!a || typeof a !== 'object' || Array.isArray(a)) a = settings.arcade = {};
  return a;
}
export function highScores(id) {
  const a = store();
  if (!Array.isArray(a[id])) a[id] = [];
  a[id] = a[id].filter((e) => e && typeof e.s === 'number' && isFinite(e.s)).slice(0, 5);
  return a[id];
}
function addHigh(id, s, who) {
  const list = highScores(id);
  if (s <= 0) return -1;
  list.push({ s, p: who });
  list.sort((x, y) => y.s - x.s);
  list.length = Math.min(list.length, 5);
  saveSettings();
  return list.findIndex((e) => e.s === s && e.p === who);
}
export function paddleWins() { const a = store(); return typeof a.paddleWins === 'number' ? a.paddleWins : 0; }

// ---- chiptune bleeps --------------------------------------------------------------
// [type, f0, f1, dur, vol, when] tones; 'n' = noise burst [n, dur, vol, freq]
const SOUNDS = {
  start: [['square', 523, 523, 0.1, 1, 0], ['square', 659, 659, 0.1, 1, 0.1], ['square', 784, 784, 0.1, 1, 0.2], ['square', 1047, 1047, 0.22, 1, 0.3]],
  waka1: [['square', 260, 480, 0.06, 0.6]], waka2: [['square', 480, 260, 0.06, 0.6]],
  power: [['square', 180, 900, 0.3, 0.8]],
  eatghost: [['square', 220, 1600, 0.25, 0.9]],
  die: [['square', 900, 500, 0.3, 0.9], ['square', 700, 300, 0.3, 0.9, 0.3], ['square', 500, 80, 0.5, 0.9, 0.6]],
  fruit: [['triangle', 880, 1320, 0.1, 1], ['triangle', 1100, 1760, 0.12, 1, 0.1]],
  extra: [['square', 784, 784, 0.08, 0.8], ['square', 988, 988, 0.08, 0.8, 0.09], ['square', 1175, 1175, 0.08, 0.8, 0.18], ['square', 1568, 1568, 0.2, 0.8, 0.27]],
  clear: [['triangle', 523, 523, 0.12, 1], ['triangle', 784, 784, 0.12, 1, 0.12], ['triangle', 1047, 1047, 0.12, 1, 0.24], ['triangle', 1568, 1568, 0.3, 1, 0.36]],
  shoot: [['square', 1400, 300, 0.12, 0.6]],
  boom: [['n', 0.18, 0.9, 900], ['square', 300, 60, 0.15, 0.6]],
  march0: [['square', 98, 90, 0.08, 1]], march1: [['square', 87, 80, 0.08, 1]], march2: [['square', 78, 72, 0.08, 1]], march3: [['square', 73, 68, 0.08, 1]],
  ufo: [['square', 700, 1000, 0.05, 0.35]],
  ufohit: [['square', 1200, 300, 0.4, 0.8], ['n', 0.3, 0.6, 1500]],
  zap: [['square', 1800, 500, 0.06, 0.45]],
  hit: [['n', 0.08, 0.7, 1800], ['square', 600, 200, 0.06, 0.5]],
  hithead: [['n', 0.12, 0.9, 1200], ['square', 900, 150, 0.12, 0.7]],
  thud: [['triangle', 220, 150, 0.03, 0.6]],
  spider: [['triangle', 500, 700, 0.05, 0.4]],
  flea: [['square', 2200, 300, 0.4, 0.5]],
  wall: [['square', 226, 226, 0.03, 0.9]], paddle: [['square', 459, 459, 0.04, 0.9]], point: [['square', 490, 490, 0.25, 0.9]],
  win: [['square', 523, 523, 0.1, 0.9], ['square', 659, 659, 0.1, 0.9, 0.12], ['square', 784, 784, 0.1, 0.9, 0.24], ['square', 1047, 1047, 0.3, 0.9, 0.36]],
};
function bleep(game, name) {
  const a = game.audio;
  if (!a?.ctx || a.ctx.state !== 'running') return;
  const s = SOUNDS[name]; if (!s) return;
  const V = 0.1;
  try {
    for (const t of s) {
      if (t[0] === 'n') a.burst(t[1], t[2] * V, t[3]);
      else a.tone(t[0], t[1], t[2], t[3], t[4] * V, t[5] || 0);
    }
  } catch (e) { /* audio not ready */ }
}

// ---- build ---------------------------------------------------------------------
// spots: [{ lx, lz, id }] in the building's local frame (L, world/common.js Local);
// each cabinet faces local +z.
export function buildArcade(game, L, spots) {
  const mgr = game.arcade || (game.arcade = new Arcade(game));
  for (const s of spots) mgr.addCabinet(L, s.lx, s.lz, GAMES[s.id]);
  return mgr;
}

const BODY = { chomp: 0x1a1a6a, raiders: 0x111111, bugs: 0x5a1a5a, paddle: 0x2a2a2a };

class Arcade {
  constructor(game) {
    this.game = game;
    this.cabinets = [];
    this.invites = [];
    this.panels = new Set();
    game.updaters.push((dt) => this.update(dt));
  }

  addCabinet(L, lx, lz, Game) {
    const g = this.game, id = Game.id, body = BODY[id] ?? 0x222244, neon = Game.color;
    const H = 1.75, D = 0.8, Wc = 0.9, fz = lz + D / 2;
    // cabinet (static kit boxes: merged scenery + collider)
    L.box(lx, H / 2, lz, Wc, H, D, body);
    for (const sx of [-1, 1]) L.deco(lx + sx * (Wc / 2 + 0.005), 1.0, lz + 0.05, 0.01, 1.3, 0.55, new THREE.Color(neon).getHex());
    L.deco(lx, 1.9, lz + 0.25, Wc, 0.32, 0.3, 0x111111);           // marquee box
    L.deco(lx, 1.37, fz + 0.005, 0.74, 0.64, 0.01, 0x050505);      // screen bezel
    L.deco(lx, 0.98, fz + 0.16, Wc - 0.04, 0.08, 0.34, 0x333344);   // control panel
    L.cyl(lx - 0.18, 1.08, fz + 0.18, 0.015, 0.14, 0x888888);       // joystick
    L.sphere(lx - 0.18, 1.16, fz + 0.18, 0.04, 0xff3a3a);
    L.sphere(lx + 0.08, 1.03, fz + 0.2, 0.03, 0x3af0ff);           // buttons
    L.sphere(lx + 0.2, 1.03, fz + 0.16, 0.03, 0xffe03a);
    L.deco(lx, 0.5, fz + 0.005, 0.4, 0.3, 0.01, 0x222222);          // coin door
    for (const sx of [-0.08, 0.08]) L.deco(lx + sx, 0.55, fz + 0.012, 0.04, 0.08, 0.01, 0xff5a3a);
    // marquee sign (painted art: signs/<title>.png)
    const sign = signMesh(Game.title, 0.84, '#111111', neon);
    let p = L.v3(lx, 1.9, lz + 0.405); sign.position.set(p.x, p.y, p.z); sign.rotation.y = L.yaw;
    g.scene.add(sign);
    // the screen
    const machine = new Game();
    const cv = document.createElement('canvas'); cv.width = machine.W * 2; cv.height = machine.H * 2;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const sw = 0.62, sh = 0.56, k = Math.min(sw / machine.W, sh / machine.H);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(machine.W * k, machine.H * k), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    p = L.v3(lx, 1.37, fz + 0.012); screen.position.set(p.x, p.y, p.z);
    screen.rotation.set(0, L.yaw, 0);
    g.scene.add(screen);
    const cab = {
      Game, id, machine, canvas: cv, ctx, tex, screen, pos: L.v3(lx, 1.2, lz + 0.9), yaw: L.yaw, session: null,
      acc: 0, drawT: 1, overT: 0, near: false,
    };
    machine.hi = highScores(id)[0]?.s || 0;
    // the use spot in front of the cabinet
    const sp = L.v3(lx, 1.0, lz + 0.95);
    const seat = useSpot(g, sp.x, sp.y, sp.z, 'Play ' + Game.title, (pl) => this.use(pl, cab));
    seat.labelFor = (pl) => {
      const s = cab.session;
      if (!s) return 'Play ' + Game.title;
      if (s.players.includes(pl)) return 'Playing';
      return Game.slots > 1 && !s.players[1] ? 'Join ' + Game.title : 'In use';
    };
    cab.seat = seat;
    this.cabinets.push(cab);
    this.paint(cab);
    return cab;
  }

  // ---- sessions ------------------------------------------------------------------
  use(p, cab) {
    const s = cab.session;
    if (!s) { this.start(p, cab); return; }
    if (s.players.includes(p)) { this.openPanel(p, cab, s.players.indexOf(p)); return; }
    if (cab.Game.slots > 1 && !s.players[1]) { this.join(p, cab); return; }
    const who = s.players.find(Boolean);
    this.game.ui?.toast(`${who ? 'P' + (who.index + 1) : 'Someone'} is playing ${cab.Game.title}`, who?.color);
  }

  start(p, cab) {
    if (cab.session) return null;
    this.leaveAll(p);
    const m = cab.machine;
    const s = cab.session = { cab, players: [p, null], state: 'play', waitT: 0, overT: 0, prev: [false, false], click: [false, false], result: null };
    m.snd = (n) => bleep(this.game, n);
    if (cab.Game.slots > 1) {
      m.names = ['P' + (p.index + 1), 'CPU'];
      const others = this.game.players.filter((q) => q !== p && !this.sessionOf(q));
      if (others.length) {
        s.state = 'wait'; s.waitT = INVITE_S * 60;
        for (const q of others) this.invites.push({ s, from: p, to: q, t: INVITE_S, el: new InvitePrompt(this.game.ui, q, p, cab.Game.title, (yes) => this.answer(q, yes)) });
      }
    }
    m.reset();
    m.hi = highScores(cab.id)[0]?.s || 0;
    cab.acc = 0;
    this.openPanel(p, cab, 0);
    return s;
  }

  // a second player takes the right paddle (from an invite or at the cabinet)
  join(p, cab) {
    const s = cab.session;
    if (!s || cab.Game.slots < 2 || s.players[1] || s.players.includes(p)) return false;
    this.leaveAll(p);
    s.players[1] = p;
    this.invites = this.invites.filter((iv) => { if (iv.s === s) { iv.el.remove(); return false; } return true; });
    cab.machine.names = s.players.map((q) => (q ? 'P' + (q.index + 1) : 'CPU'));
    cab.machine.reset();
    s.state = 'play'; s.overT = 0; s.result = null;
    this.openPanel(p, cab, 1);
    const host = s.players[0];
    this.game.ui?.toast(`P${p.index + 1} joined ${host ? 'P' + (host.index + 1) + "'s" : 'the'} ${cab.Game.title} match!`, p.color);
    return true;
  }

  answer(p, yes) {
    const iv = this.invites.find((x) => x.to === p);
    if (!iv) return;
    if (yes && this.join(p, iv.s.cab)) return;
    iv.el.remove();
    this.invites = this.invites.filter((x) => x !== iv);
    this.game.ui?.sfx('uiBack');
  }

  // ui.handleInput hook: a player with an invite on screen answers it with Y / B
  // (those presses are swallowed so they don't also sit down or flop).
  inviteInput(p) {
    const iv = this.invites.find((x) => x.to === p);
    if (!iv) return false;
    const d = this.game.input.get(p.deviceId);
    if (!d) return false;
    const pr = d.rawPressed || d.pressed || {};
    const yes = !!pr.interact, no = !!(pr.ragdoll || pr.dash);
    if (d.pressed) { d.pressed.interact = false; d.pressed.ragdoll = false; d.pressed.dash = false; }
    if (yes) { this.answer(p, true); return true; }
    if (no) this.answer(p, false);
    return false;
  }

  sessionOf(p) { return this.cabinets.find((c) => c.session?.players.includes(p))?.session || null; }

  openPanel(p, cab, slot) {
    const ui = this.game.ui;
    if (!ui) return;
    const pn = new ArcadePanel(ui, p, this, cab, slot);
    ui.setPanel(p, pn);
  }

  // the panel closed (Start / Esc / B, player left the game, another panel opened)
  leave(p, cab) {
    const s = cab.session;
    if (!s) return;
    const i = s.players.indexOf(p);
    if (i < 0) return;
    s.players[i] = null;
    if (cab.Game.slots > 1) cab.machine.names = s.players.map((q) => (q ? 'P' + (q.index + 1) : 'CPU'));
    if (!s.players.some(Boolean)) this.end(cab);
    else if (s.state === 'wait' && !s.players[0]) { s.players[0] = s.players[1]; s.players[1] = null; }
  }
  leaveAll(p) {
    const s = this.sessionOf(p);
    if (s) this.game.ui?.closePanel(p);
    if (s && s.players.includes(p)) this.leave(p, s.cab);
    this.invites = this.invites.filter((iv) => { if (iv.to === p) { iv.el.remove(); return false; } return true; });
  }
  end(cab) {
    const s = cab.session;
    this.invites = this.invites.filter((iv) => { if (iv.s === s) { iv.el.remove(); return false; } return true; });
    cab.session = null;
    cab.machine.snd = null;
    if (cab.Game.slots > 1) cab.machine.names = ['CPU', 'CPU'];
    cab.machine.reset();
    cab.machine.hi = highScores(cab.id)[0]?.s || 0;
  }

  // ---- input --------------------------------------------------------------------
  readInput(p, s, slot) {
    const inp = this.game.input, id = p.deviceId, d = inp.get(id), r = d?.raw || {};
    let x = r.moveX || 0, y = r.moveY || 0;
    const kb = id === 'kb1' || id === 'kb2';
    if (!kb) { if (r.dLeft) x -= 1; if (r.dRight) x += 1; if (r.dUp) y += 1; if (r.dDown) y -= 1; }
    let fire = !!(r.jump || r.punch);
    if (id === 'kb1') {
      const k = inp.held();
      if (!this.game.players.some((q) => q.deviceId === 'kb2')) {
        if (k.has('ArrowLeft')) x -= 1; if (k.has('ArrowRight')) x += 1;
        if (k.has('ArrowUp')) y += 1; if (k.has('ArrowDown')) y -= 1;
      }
      fire = fire || r.grabL > 0 || k.has('Enter') || k.has('KeyJ') || k.has('KeyK');
    }
    if (s.click[slot]) { fire = true; s.click[slot] = false; }
    x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
    const fireP = fire && !s.prev[slot];
    s.prev[slot] = fire;
    return { x, y, fire, fireP };
  }

  // ---- the loop ---------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    dt = Math.min(dt, 0.1);
    // invites: countdown, drop stale ones
    for (const iv of [...this.invites]) {
      iv.t -= dt;
      if (iv.t <= 0 || !g.players.includes(iv.to) || iv.s.cab.session !== iv.s || this.sessionOf(iv.to)) { iv.el.remove(); this.invites.splice(this.invites.indexOf(iv), 1); continue; }
      iv.el.update(iv.t / INVITE_S);
    }
    const cams = g.players.map((p) => p.camera?.cam?.position).filter(Boolean);
    for (const cab of this.cabinets) {
      const s = cab.session;
      if (s) for (let i = 0; i < s.players.length; i++) if (s.players[i] && !g.players.includes(s.players[i])) this.leave(s.players[i], cab);
      cab.near = cams.some((c) => Math.abs(c.x - cab.pos.x) < NEAR && Math.abs(c.z - cab.pos.z) < NEAR && Math.abs(c.y - cab.pos.y) < NEAR);
      const live = !!cab.session;
      if (!live && !cab.near) continue; // idle and nobody looking: frozen, no cost
      cab.acc += dt;
      let n = 0;
      while (cab.acc >= STEP && n < 6) { this.tick(cab); cab.acc -= STEP; n++; }
      if (n === 6) cab.acc = 0;
      cab.drawT += dt;
      const showScreen = cab.near && cab.drawT >= 1 / SCREEN_HZ;
      if (live || showScreen) this.paint(cab);
      if (showScreen) { cab.tex.needsUpdate = true; cab.drawT = 0; }
    }
    for (const pn of this.panels) pn.blit();
  }

  // one fixed 1/60 s step of a cabinet
  tick(cab) {
    const s = cab.session, m = cab.machine;
    if (!s) { // attract mode: the game plays itself, restarting after a game over
      if (m.over) { if (++cab.overT > 180) { m.reset(); cab.overT = 0; } return; }
      m.step([]);
      return;
    }
    const ins = s.players.map((p, i) => (p ? this.readInput(p, s, i) : null));
    if (s.state === 'wait') {
      if (ins[0]?.fireP || --s.waitT <= 0 || !this.invites.some((iv) => iv.s === s)) this.vsCpu(cab);
      return;
    }
    if (s.state === 'over') {
      s.overT++;
      if (s.overT > 50 && ins.some((x) => x?.fireP)) {
        m.reset(); s.state = 'play'; s.overT = 0; s.result = null;
        m.hi = highScores(cab.id)[0]?.s || 0;
      }
      return;
    }
    m.step(ins.slice(0, cab.Game.slots));
    if (m.over) this.gameOver(cab);
  }

  vsCpu(cab) {
    const s = cab.session;
    this.invites = this.invites.filter((iv) => { if (iv.s === s) { iv.el.remove(); return false; } return true; });
    s.state = 'play';
    cab.machine.reset();
  }

  gameOver(cab) {
    const s = cab.session, m = cab.machine, g = this.game;
    s.state = 'over'; s.overT = 0;
    const host = s.players[0] || s.players[1];
    const at = cab.pos;
    if (cab.Game.slots > 1) {
      const humans = s.players.filter(Boolean).length;
      const winner = s.players[m.winner];
      if (humans === 1 && winner) {
        store().paddleWins = paddleWins() + 1; saveSettings();
        g.life?.reward(winner, 10, 'Beat the CPU!', at);
        s.result = { text: 'YOU BEAT THE CPU!', coins: 10 };
      } else if (winner) {
        g.life?.reward(winner, 5, 'Paddle Ball win!', at);
        s.result = { text: `P${winner.index + 1} WINS THE MATCH!`, coins: 5 };
      } else s.result = { text: 'THE CPU WINS', coins: 0 };
      return;
    }
    const who = host ? 'P' + (host.index + 1) : '--';
    const rank = addHigh(cab.id, m.score, who);
    let coins = 0;
    for (const [need, c] of TIERS[cab.id] || []) if (m.score >= need) coins = c;
    if (coins && host) g.life?.reward(host, coins, `${cab.Game.title}: ${m.score}`, at);
    s.result = { rank, coins, best: rank === 0 };
    if (rank === 0) g.ui?.toast(`P${host.index + 1} set a new ${cab.Game.title} high score: <b>${m.score}</b>!`, host.color);
  }

  // ---- drawing -------------------------------------------------------------------------
  paint(cab) {
    const g = cab.ctx, m = cab.machine, s = cab.session;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.imageSmoothingEnabled = false;
    m.draw(g);
    const W = m.W, H = m.H;
    const box = (h) => { g.fillStyle = 'rgba(0,0,0,0.93)'; g.fillRect(10, H / 2 - h / 2, W - 20, h); g.strokeStyle = cab.Game.color; g.lineWidth = 1; g.strokeRect(10.5, H / 2 - h / 2 + 0.5, W - 21, h - 1); };
    const blink = ((performance.now() / 450) | 0) % 2 === 0;
    if (!s) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, H - 34, W, 22);
      if (blink) txt(g, 'PRESS  Y  TO  PLAY', W / 2, H - 30, '#ffe03a', 9, 'center');
      txt(g, 'DEMO', W / 2, H - 20, '#aaa', 7, 'center');
      return;
    }
    if (s.state === 'wait') {
      box(70);
      txt(g, 'WAITING FOR PLAYER 2', W / 2, H / 2 - 28, '#fff', 9, 'center');
      txt(g, Math.ceil(s.waitT / 60), W / 2, H / 2 - 14, '#ffe03a', 14, 'center');
      txt(g, 'INVITES SENT!', W / 2, H / 2 + 6, '#7aff5a', 8, 'center');
      txt(g, 'A: PLAY THE CPU NOW', W / 2, H / 2 + 18, '#aaa', 8, 'center');
      return;
    }
    if (s.state === 'over') {
      const r = s.result || {};
      box(84);
      if (cab.Game.slots > 1) {
        txt(g, 'GAME OVER', W / 2, H / 2 - 34, '#ff3a3a', 12, 'center');
        txt(g, r.text || '', W / 2, H / 2 - 16, '#ffe03a', 9, 'center');
        txt(g, `${m.pts[0]} - ${m.pts[1]}`, W / 2, H / 2 - 2, '#fff', 10, 'center');
      } else {
        txt(g, 'GAME OVER', W / 2, H / 2 - 34, '#ff3a3a', 12, 'center');
        txt(g, 'SCORE ' + pad(m.score, 6), W / 2, H / 2 - 18, '#fff', 9, 'center');
        if (r.best) { if (blink) txt(g, 'NEW HIGH SCORE!', W / 2, H / 2 - 6, '#ffe03a', 9, 'center'); }
        else if (r.rank > 0) txt(g, `#${r.rank + 1} ON THE TABLE`, W / 2, H / 2 - 6, '#7aff5a', 8, 'center');
      }
      if (r.coins) txt(g, `+${r.coins} COINS`, W / 2, H / 2 + 8, '#ffd23f', 8, 'center');
      if (s.overT > 50) txt(g, 'A: PLAY AGAIN   B: QUIT', W / 2, H / 2 + 24, blink ? '#fff' : '#aaa', 8, 'center');
    }
  }
}
