// Game orchestration.
//
// Flow: LOBBY (a live practice playground — join, warm up, press PLAY)
//   -> SELECT (30 boards organized by difficulty)
//   -> countdown -> race -> results -> back to SELECT.
// First robot to the goal WINS the round on the spot (5 pts); scores and
// best times persist for the session.

import { Input, NEUTRAL } from './input.js';
import { Player, PLAYER_COLORS, CFG, CAT } from './player.js';
import { HEAD_STYLES, drawHead, headStyle, rebuildRoster, defaultStyleFor, styleIndexByName } from './heads.js';
import { Music, DUCK } from './music.js';
import { settings, setSetting, onSettingsChange } from './settings.js';
import { Level } from './level.js';
import { LEVELS, PRACTICE } from './levels.js';
import { Particles } from './particles.js';
import { Shots } from './guns.js';
import { POWERS } from './powerups.js';
import { sfx } from './audio.js';
import { art } from './art.js';
import { clamp, lerp, TAU, roundRectPath, FONT } from './util.js';

const M = window.Matter;

const POINTS = [5, 3, 2, 1];
const DIFFS = [
  { key: 'easy', label: 'EASY', color: '#5fe08b' },
  { key: 'medium', label: 'MEDIUM', color: '#ffd94d' },
  { key: 'hard', label: 'HARD', color: '#ff5d6c' },
  { key: 'blasters', label: 'BLASTERS', color: '#ff8a3d' },
];
const CARD_COLS = 5;

// Which board-select icons a board gets (one per mechanic it uses).
function mechanicsOf(lv) {
  const so = lv.solids || [];
  const out = [];
  if ((lv.ropes || []).length) out.push('rope');
  if ((lv.spinners || []).length) out.push('wheel');
  if ((lv.balloons || []).length) out.push('balloon');
  if ((lv.movers || []).length) out.push('lift');
  if (so.some((s) => s.bounce)) out.push('bounce');
  if (so.some((s) => s.ice)) out.push('ice');
  if (so.some((s) => s.crumble)) out.push('crumble');
  if ((lv.winds || []).length) out.push('wind');
  if ((lv.guns || []).length) out.push('gun');
  return out;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.input.attach(window);

    this.roster = [null, null, null, null];   // {sourceId, headStyle}
    this.players = [];
    this.engine = null;
    this.level = null;
    this.levelIndex = 0;
    this.particles = new Particles();
    this.shots = new Shots();
    this.LEVELS = LEVELS;

    this.time = 0;
    this.raceTime = 0;
    this.finishCounter = 0;
    this.cd = 0;
    this.goFlash = 0;
    this.roundResults = null;
    this.winner = null;
    this.coopWin = null;                       // team time when a co-op round is won
    this.roundEndT = 0;
    this.shake = 0;
    this.mode = 'vs';                          // 'vs' | 'coop' (lobby dropdown)
    this.modeOpen = false;                     // mode dropdown expanded?
    this.best = { vs: {}, coop: {} };          // mode -> board name -> best time (s)

    // level select grid
    this.grid = DIFFS.map((d) => LEVELS.map((lv, i) => (lv.diff === d.key ? i : -1)).filter((i) => i >= 0));
    this.sel = { col: 0, row: 0 };
    this.selMoveAt = 0;
    this.selRects = [];

    // sound: music + sfx follow the settings, and go quiet while the tab is
    // hidden or the window loses focus (a race in progress pauses too)
    this.music = new Music();
    this.applySound();
    this.settingsOpen = false;
    this.setSel = 0;
    onSettingsChange((key) => {
      if (key === 'sound' || key === 'music' || key === 'sfx') this.applySound();
      if (key === 'originalSwingers') this.refreshRoster();
      if (key === 'powerups' && this.level) this.level.power.setRate(settings.powerups);
    });
    const focusChanged = () => {
      const away = document.hidden || !document.hasFocus();
      this.music.setAway(away);
      sfx.setAway(away);
      if (away && this.state === 'play') this.state = 'pause';
    };
    document.addEventListener('visibilitychange', focusChanged);
    window.addEventListener('blur', focusChanged);
    window.addEventListener('focus', focusChanged);

    // clickable on-screen buttons, rebuilt every frame
    this.buttons = [];
    canvas.addEventListener('pointerdown', (e) => {
      const x = e.offsetX, y = e.offsetY;
      for (const b of this.buttons) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (b.id === 'pause') this.togglePause();
          else if (b.id === 'fs') this.toggleFullscreen();
          else if (b.id === 'sound') this.toggleSound();
          else if (b.id === 'settings' || b.id === 'p_settings') this.toggleSettings();
          else if (b.id.startsWith('set:')) this.activateSetting(b.id.slice(4));
          else if (b.id === 'play') this.openSelect();
          else if (b.id === 'back') this.backToLobby();
          else if (b.id === 'p_resume') this.togglePause();
          else if (b.id === 'p_restart') this.startLevel();
          else if (b.id === 'p_quit') this.backToLobby();
          else if (b.id === 'mode') { this.modeOpen = !this.modeOpen; sfx.uiTick(); }
          else if (b.id === 'mode:vs' || b.id === 'mode:coop') {
            this.mode = b.id.slice(5);
            this.modeOpen = false;
            sfx.uiTick();
          }
          return;
        }
      }
      if (this.state === 'title' && !this.settingsOpen) { this.startFromTitle(null); return; }
      if (this.state === 'select') {
        for (const r of this.selRects) {
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            if (r.tab !== undefined) { this.sel = { col: r.tab, row: 0 }; sfx.uiTick(); }
            else this.chooseLevel(r.index);
            return;
          }
        }
      }
    });

    // audio unlock needs a real user gesture; pointer works for pad-only setups
    window.addEventListener('pointerdown', () => { sfx.ensure(); this.music.unlock(); });
    window.addEventListener('keydown', (e) => {
      sfx.ensure();
      this.music.unlock();
      if (e.code === 'KeyM') this.toggleSound();
      if (e.code === 'KeyF') this.toggleFullscreen();
      if (this.state === 'play' || this.state === 'pause') {
        if (e.code === 'KeyN') this.skipLevel();        // debug: next board
        if (e.code === 'KeyR') this.startLevel();       // restart board
      }
    });

    // Boot on the title screen. The lobby playground is built behind it so
    // PRESS START drops straight into it.
    this.buildLobby();
    this.state = 'title';
    this.titleT = 0;
  }

  // ------------------------------------------------------------- game flow

  buildLobby() {
    this.engine = M.Engine.create({
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 6,
    });
    this.engine.gravity.y = 1.18;
    this.level = new Level(PRACTICE, this.engine);
    this.level.power.setRate(settings.powerups);
    this.particles.clear();
    this.shots.clear();
    this.shake = 0;
    // respawn any already-joined players into the playground
    this.players.forEach((p, i) => {
      p.spawn(this.engine, PRACTICE.spawn.x + i * 50, PRACTICE.spawn.y);
    });
    this.state = 'lobby';
    this.music.menu();
  }

  backToLobby() {
    if (this.state === 'lobby') return;
    this.buildLobby();
  }

  openSelect() {
    if (this.state !== 'lobby' || !this.players.length) return;
    this.modeOpen = false;
    this.state = 'select';
    sfx.go();
  }

  chooseLevel(index) {
    this.levelIndex = index;
    sfx.join();
    this.startLevel();
  }

  startLevel() {
    this.engine = M.Engine.create({
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 6,
    });
    this.engine.gravity.y = 1.18;   // punchy Heave Ho pace; muscle forces are
                                    // specified in body-weights so they scale
    this.level = new Level(LEVELS[this.levelIndex], this.engine);
    this.level.power.setRate(settings.powerups);
    this.music.race(this.level.def.theme);
    this.particles.clear();
    this.shots.clear();
    const s = this.level.spawn;
    this.players.forEach((p, i) => {
      p.spawn(this.engine, s.x + (i - (this.players.length - 1) / 2) * 46, s.y);
    });
    this.state = 'countdown';
    this.cd = 3.0;
    this.lastCount = 4;
    this.goFlash = 0;
    this.raceTime = 0;
    this.finishCounter = 0;
    this.roundResults = null;
    this.winner = null;
    this.coopWin = null;
    this.shake = 0;
  }

  endRound() {
    const coop = this.mode === 'coop';
    const rows = [...this.players].sort((a, b) => {
      const ao = a.finishOrder < 0 ? 99 : a.finishOrder;
      const bo = b.finishOrder < 0 ? 99 : b.finishOrder;
      return ao - bo || a.slot - b.slot;
    }).map((p) => {
      // VS: winner takes 5. CO-OP: the whole team scores 5 for making it.
      const pts = p.finishOrder >= 0 ? (coop ? POINTS[0] : (POINTS[p.finishOrder] || 1)) : 0;
      p.score += pts;
      return { p, pts, finished: p.finishOrder >= 0, time: p.finishTime };
    });
    this.roundResults = rows;

    // per-mode best times: VS = the winner's time; CO-OP = when the LAST
    // robot got in (it's a team clock)
    const name = LEVELS[this.levelIndex].name;
    const store = this.best[this.mode];
    const allIn = rows.length > 0 && rows.every((r) => r.finished);
    if (coop) {
      this.winner = null;
      this.coopWin = allIn ? Math.max(...rows.map((r) => r.time)) : null;
      if (allIn && (!(name in store) || this.coopWin < store[name])) store[name] = this.coopWin;
    } else {
      this.coopWin = null;
      this.winner = rows[0] && rows[0].finished ? rows[0].p : null;
      if (this.winner && (!(name in store) || rows[0].time < store[name])) store[name] = rows[0].time;
    }

    if ((this.winner || this.coopWin !== null) && this.level.goal) {
      const gl = this.level.goal;
      const color = this.winner ? this.winner.color.main : '#ffd94d';
      this.particles.burst(gl.x, gl.y, color, 26, 340);
      sfx.go();
    }
    this.roundEndT = 0;
    this.state = 'roundEnd';
  }

  skipLevel() {
    this.levelIndex = (this.levelIndex + 1) % LEVELS.length;
    this.startLevel();
  }

  togglePause() {
    if (this.state === 'play') { this.state = 'pause'; sfx.uiTick(); }
    else if (this.state === 'pause') { this.state = 'play'; sfx.uiTick(); }
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  // ---- title screen

  // Any button on any controller (or a key, or a click) leaves the title.
  // That press is the user gesture browsers want before they'll play audio
  // or go fullscreen, so music starts and fullscreen is requested right
  // here (Chrome honours a gamepad press; a refusal is swallowed and the
  // corner button still works). A controller that presses A/START also
  // joins the lobby on the spot.
  titleStep(states, dt) {
    this.titleT += dt;
    this.physicsStep(dt);           // the playground keeps simmering behind
    if (this.titleT < 0.5) return;  // ignore a press still held from boot
    for (const s of states) {
      const p = s.pressed;
      if (p.a || p.b || p.x || p.y || p.start || p.back || p.ltd || p.rtd || p.du || p.dd || p.dl || p.dr) {
        this.startFromTitle(s);
        return;
      }
    }
  }

  startFromTitle(source) {
    if (this.state !== 'title') return;
    this.state = 'lobby';
    sfx.ensure();
    this.music.unlock();
    sfx.go();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { /* stay windowed */ });
    }
    if (source && (source.pressed.a || source.pressed.start) && !this.isJoined(source.id)) {
      const free = this.roster.findIndex((r) => !r);
      if (free !== -1) this.addPlayer(source.id, free, PRACTICE.spawn.x + free * 50, PRACTICE.spawn.y - 40);
    }
  }

  // ---- sound + settings

  applySound() {
    sfx.setEnabled(settings.sound && settings.sfx);
    this.music.setEnabled(settings.sound && settings.music);
  }

  toggleSound() {
    setSetting('sound', !settings.sound);
    sfx.ensure();
    sfx.uiTick();
  }

  // The settings panel. Rows: [key, label, hint]
  settingRows() {
    return [
      ['sound', 'SOUND', 'everything on / off (M, or the speaker button)'],
      ['music', 'MUSIC', 'the Rounders soundtrack'],
      ['sfx', 'SOUND EFFECTS', 'grabs, punches, boings'],
      ['powerups', 'POWER-UPS', 'random pickups around the board', ['off', 'normal', 'frequent']],
      ['originalSwingers', 'ORIGINAL SWINGERS', 'add the 8 original robot heads to the character picker'],
    ];
  }

  toggleSettings() {
    if (!this.settingsOpen && this.state === 'play') this.state = 'pause';
    this.settingsOpen = !this.settingsOpen;
    this.setSel = 0;
    sfx.uiTick();
  }

  activateSetting(key) {
    if (key === 'close') { this.toggleSettings(); return; }
    const row = this.settingRows().find((r) => r[0] === key);
    if (row && row[3]) {
      // a choice: step to the next option
      const opts = row[3];
      setSetting(key, opts[(opts.indexOf(settings[key]) + 1) % opts.length]);
    } else setSetting(key, !settings[key]);
    sfx.uiTick();
  }

  // Original Swingers changed: rebuild the picker list, keeping everyone's
  // pick when it still exists (and a fresh default when it doesn't).
  refreshRoster() {
    const names = this.roster.map((r) => (r ? headStyle(r.headStyle).name : null));
    rebuildRoster();
    this.roster.forEach((r, slot) => {
      if (!r) return;
      const i = styleIndexByName(names[slot]);
      r.headStyle = i >= 0 ? i : defaultStyleFor(slot);
      const p = this.players.find((q) => q.slot === slot);
      if (p) p.headStyle = r.headStyle;
    });
  }

  settingsStep(states) {
    const rows = this.settingRows();
    const anyone = !this.players.length;
    for (const s of states) {
      if (!anyone && !this.isJoined(s.id)) continue;
      if (s.pressed.du) { this.setSel = (this.setSel + rows.length) % (rows.length + 1); sfx.uiTick(); }
      if (s.pressed.dd) { this.setSel = (this.setSel + 1) % (rows.length + 1); sfx.uiTick(); }
      if (s.pressed.a) this.activateSetting(this.setSel < rows.length ? rows[this.setSel][0] : 'close');
      else if (s.pressed.b || s.pressed.back || s.pressed.start || s.pressed.y) this.toggleSettings();
      if (!this.settingsOpen) return;
    }
  }

  // how loud the music sits for what's on screen
  musicDuck() {
    if (this.settingsOpen || this.state === 'pause') return DUCK.paused;
    if (this.state === 'roundEnd') return DUCK.roundEnd;
    if (this.state === 'select' && this.music.context === 'session') return DUCK.menu;
    return DUCK.none;
  }

  controlsEnabled() { return this.state === 'play' || this.state === 'lobby'; }

  addShake(n) { this.shake = Math.min(20, this.shake + n); }

  ctrlFor(p) { return this.input.get(p.sourceId) || NEUTRAL; }

  grabCandidates(me) {
    const arr = this.level.grabbables();
    for (const p of this.players) {
      if (p !== me && p.state === 'alive') {
        arr.push(p.body);
        for (const a of p.arms) arr.push(a.hand);   // hand-to-hand chains!
      }
    }
    return arr;
  }

  isJoined(sourceId) {
    return this.roster.some((r) => r && r.sourceId === sourceId);
  }

  // Register a new controller as a player in the given roster slot and spawn
  // its robot at (x, y). Shared by the lobby and by mid-game join.
  addPlayer(sourceId, slot, x, y) {
    const pick = defaultStyleFor(slot);
    this.roster[slot] = { sourceId, headStyle: pick };
    const p = new Player(slot, sourceId, pick);
    p.spawn(this.engine, x, y);
    this.players.push(p);
    this.players.sort((a, b) => a.slot - b.slot);
    sfx.join();
    return p;
  }

  // Join mid-race (or during the countdown): a new controller drops in at the
  // level's start, alive and playable right away. Ignored if the lobby is
  // full (4 players). In co-op the round then waits for them too.
  joinMidGame(sourceId) {
    const slot = this.roster.findIndex((r) => !r);
    if (slot === -1) return null;
    const s = this.level.spawn;
    return this.addPlayer(sourceId, slot, s.x + (slot - 1.5) * 40, s.y);
  }

  // ------------------------------------------------------------------ step

  step(dt) {
    this.time += dt;
    const states = this.input.poll();
    if (this.input.anyActivity) sfx.ensure();
    const duck = this.musicDuck();
    if (duck !== this.music.duck) this.music.setDuck(duck);

    if (this.settingsOpen) {
      this.settingsStep(states);
      // the playground keeps simmering behind the panel; races stay paused
      if (this.state === 'lobby' || this.state === 'title') this.physicsStep(dt);
      return;
    }

    switch (this.state) {
      case 'title': this.titleStep(states, dt); break;
      case 'lobby': this.lobbyStep(states, dt); break;
      case 'select': this.selectStep(states); break;

      case 'countdown': {
        this.physicsStep(dt);
        // a new controller can drop in during the countdown
        for (const s of states) {
          if (!this.isJoined(s.id) && (s.pressed.a || s.pressed.start)) this.joinMidGame(s.id);
        }
        this.cd -= dt;
        const n = Math.ceil(this.cd);
        if (n < this.lastCount && n > 0) { this.lastCount = n; sfx.count(); }
        if (this.cd <= 0) { this.state = 'play'; this.goFlash = 0.9; sfx.go(); }
        break;
      }

      case 'play': {
        this.goFlash = Math.max(0, this.goFlash - dt);
        this.raceTime += dt;
        this.physicsStep(dt);
        for (const s of states) {
          if (!this.isJoined(s.id)) {
            // drop-in: an unjoined controller joins the race with A or START
            if (s.pressed.a || s.pressed.start) this.joinMidGame(s.id);
          } else if (s.pressed.start) {
            this.state = 'pause';
            break;
          }
        }
        break;
      }

      case 'pause': {
        for (const s of states) {
          if (!this.isJoined(s.id)) continue;
          // resume: START (toggle) or A (confirm the default action)
          if (s.pressed.start || s.pressed.a) this.togglePause();
          else if (s.pressed.y) { this.toggleSettings(); break; }
          else if (s.pressed.x) this.startLevel();          // restart board
          // quit to the lobby: B (universal cancel) or BACK/View
          else if (s.pressed.b || s.pressed.back) this.backToLobby();
        }
        break;
      }

      case 'roundEnd': {
        this.roundEndT += dt;
        this.particles.update(dt);
        if (this.roundEndT > 0.8) {
          for (const s of states) {
            if ((s.pressed.a || s.pressed.start) && this.isJoined(s.id)) { this.state = 'select'; break; }
          }
        }
        break;
      }
    }
  }

  lobbyStep(states, dt) {
    for (const s of states) {
      const slotIdx = this.roster.findIndex((r) => r && r.sourceId === s.id);
      if (slotIdx === -1) {
        if (s.pressed.a) {
          const free = this.roster.findIndex((r) => !r);
          if (free !== -1) this.addPlayer(s.id, free, PRACTICE.spawn.x + free * 50, PRACTICE.spawn.y - 40);
        }
      } else {
        const slot = this.roster[slotIdx];
        const player = this.players.find((p) => p.slot === slotIdx);
        if (s.pressed.back) {
          // leave: remove the robot from the playground
          if (player) {
            Player.breakGrabsOn(player, this.players);
            if (player.state === 'alive') player.removeRig();
            this.players = this.players.filter((p) => p !== player);
          }
          this.roster[slotIdx] = null;
          sfx.leave();
          continue;
        }
        if (s.pressed.dl) { slot.headStyle = (slot.headStyle + HEAD_STYLES.length - 1) % HEAD_STYLES.length; sfx.uiTick(); }
        if (s.pressed.dr) { slot.headStyle = (slot.headStyle + 1) % HEAD_STYLES.length; sfx.uiTick(); }
        if (player) player.headStyle = slot.headStyle;
        if (s.pressed.y) { this.mode = this.mode === 'vs' ? 'coop' : 'vs'; sfx.uiTick(); }
        if (s.pressed.x) { this.toggleSettings(); return; }
        if (s.pressed.start) { this.openSelect(); return; }
      }
    }
    this.physicsStep(dt);
  }

  // Board select: a tab per difficulty (LB / RB, or click), a grid of board
  // cards inside it (stick / dpad).
  selectStep(states) {
    const count = () => this.grid[this.sel.col].length;
    for (const s of states) {
      if (!this.isJoined(s.id)) continue;
      if (s.pressed.lbd || s.pressed.rbd) {
        const n = DIFFS.length;
        this.sel.col = (this.sel.col + (s.pressed.rbd ? 1 : n - 1)) % n;
        this.sel.row = Math.min(this.sel.row, count() - 1);
        sfx.uiTick();
        continue;
      }
      let mx = 0, my = 0;
      if (s.pressed.dl) mx = -1;
      else if (s.pressed.dr) mx = 1;
      else if (s.pressed.du) my = -1;
      else if (s.pressed.dd) my = 1;
      else if (this.time - this.selMoveAt > 0.22) {
        const v = s.l.mag > 0.55 ? s.l : (s.r.mag > 0.55 ? s.r : null);
        if (v) {
          if (Math.abs(v.x) > Math.abs(v.y)) mx = Math.sign(v.x);
          else my = Math.sign(v.y);
        }
      }
      if (mx || my) {
        this.selMoveAt = this.time;
        const n = count();
        let i = this.sel.row + mx + my * CARD_COLS;
        if (mx && (i < 0 || i >= n)) {
          // stepping off either end of a tab moves to the neighbouring tab
          this.sel.col = (this.sel.col + mx + DIFFS.length) % DIFFS.length;
          i = mx > 0 ? 0 : count() - 1;
        } else i = clamp(i, 0, n - 1);
        this.sel.row = i;
        sfx.uiTick();
      }
      if (s.pressed.a || s.pressed.start) {
        this.chooseLevel(this.grid[this.sel.col][this.sel.row]);
        return;
      }
      if (s.pressed.b || s.pressed.back) { this.backToLobby(); return; }
      if (s.pressed.x) { this.toggleSettings(); return; }
    }
  }

  physicsStep(dt) {
    for (const p of this.players) p.update(dt, this.ctrlFor(p), this);
    this.level.update(dt, this.particles, this.players);
    M.Engine.update(this.engine, dt * 1000);
    for (let i = 0; i < 3; i++) for (const p of this.players) p.solveGrabs();
    this.level.updateHeldGuns();
    this.shots.update(dt, this);

    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      p.clampSpeed();
      const pos = p.body.position;

      // hazards + out of bounds
      const hitDeadly = this.level.deadlyBodies.length &&
        M.Query.collides(p.body, this.level.deadlyBodies).length > 0;
      if (hitDeadly && p.has('shield')) {
        // BUBBLE SHIELD: pops instead of you — thrown clear, a moment of grace
        p.endPower();
        p.protectUntil = this.time + 1;
        p.graceUntil = this.time + 0.7;   // time to get clear of the spikes
        p.releaseAll();
        for (const rb of p.rigBodies) M.Body.setVelocity(rb, { x: rb.velocity.x * 0.5, y: -17 });
        this.particles.ring(pos.x, pos.y, 50, '#7fd8ff', 0.4);
        this.particles.burst(pos.x, pos.y, '#bfefff', 14, 260);
        sfx.pop();
        continue;
      }
      if (hitDeadly && this.time < (p.graceUntil || 0)) continue;
      if (hitDeadly || pos.y > this.level.h + 120 || pos.x < -150 || pos.x > this.level.w + 150) {
        p.die(this);
        continue;
      }

      if (this.state !== 'play') continue;

      // power-ups: touch one to take it (it replaces any you had)
      for (const pu of this.level.power.live) {
        if (Math.hypot(pos.x - pu.x, pos.y - pu.y) < 30 + CFG.radius) {
          this.level.power.take(pu);
          p.givePower(pu.id);
          this.particles.burst(pu.x, pu.y, POWERS[pu.id].color, 12, 220);
          sfx.pickup();
          break;
        }
      }

      // goal — VS: first robot in WINS on the spot; CO-OP: the round is
      // only won when EVERY robot has made it
      const goal = this.level.goal;
      if (goal && Math.hypot(pos.x - goal.x, pos.y - goal.y) < goal.r + 10) {
        p.finish(this);
        if (this.mode !== 'coop' || this.players.every((q) => q.state === 'finished')) {
          this.endRound();
          return;
        }
      }
    }

    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - 60 * dt);
  }

  // ------------------------------------------------------------------ draw

  draw() {
    const canvas = this.canvas, ctx = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.state === 'title') {
      this.drawTitle(ctx, cw, ch);
      this.drawButtons(ctx, cw, ch, false);
      return;
    }
    if (this.state === 'select') {
      this.drawSelect(ctx, cw, ch);
      this.drawButtons(ctx, cw, ch, false);
      return;
    }
    if (!this.level) return;

    this.level.drawBackground(ctx, cw, ch);

    // world transform (letterboxed fit) + screenshake
    const scale = Math.min(cw / this.level.w, ch / this.level.h);
    const ox = (cw - this.level.w * scale) / 2;
    const oy = (ch - this.level.h * scale) / 2;
    ctx.save();
    if (this.shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    this.level.draw(ctx);
    for (const p of this.players) p.draw(ctx, this);
    this.level.drawGuns(ctx);
    this.shots.draw(ctx);
    this.drawFinishedAtGoal(ctx);
    this.particles.draw(ctx);
    ctx.restore();

    if (this.state === 'lobby') this.drawLobbyOverlay(ctx, cw, ch);
    else this.drawHud(ctx, cw, ch);

    if (this.state === 'countdown') this.drawCountdown(ctx, cw, ch);
    if (this.goFlash > 0) this.drawGo(ctx, cw, ch);
    if (this.state === 'pause') this.drawPause(ctx, cw, ch);
    if (this.state === 'roundEnd') this.drawRoundEnd(ctx, cw, ch);

    // buttons last so they sit above the overlays
    this.drawButtons(ctx, cw, ch, this.state === 'play' || this.state === 'pause');
  }

  drawButtons(ctx, cw, ch, withPause) {
    // the PLAY button + mode dropdown only exist on the lobby overlay
    this.buttons = this.state === 'lobby'
      ? this.buttons.filter((b) => b.id === 'play' || b.id.startsWith('mode'))
      : [];
    const s = 34, m = 14, gap = 8, y = 12;
    const drawBtn = (x, id, icon) => {
      this.buttons.push({ id, x, y, w: s, h: s });
      roundRectPath(ctx, x, y, s, s, 9);
      ctx.fillStyle = 'rgba(10,12,24,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      icon(x + s / 2, y + s / 2);
    };
    let x = cw - m - s;
    drawBtn(x, 'fs', (cx, cy) => {
      const r = 7, l = 5;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * r - dx * l, cy + dy * r);
        ctx.lineTo(cx + dx * r, cy + dy * r);
        ctx.lineTo(cx + dx * r, cy + dy * r - dy * l);
        ctx.stroke();
      }
    });
    x -= s + gap;
    drawBtn(x, 'sound', (cx, cy) => {
      // speaker, with sound waves when on and a cross when off
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy - 4); ctx.lineTo(cx - 5, cy - 4); ctx.lineTo(cx, cy - 9);
      ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 5, cy + 4); ctx.lineTo(cx - 9, cy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      if (settings.sound) {
        for (const r of [5, 9]) {
          ctx.beginPath(); ctx.arc(cx + 1, cy, r, -0.8, 0.8); ctx.stroke();
        }
      } else {
        ctx.strokeStyle = '#ff6b78';
        ctx.beginPath(); ctx.moveTo(cx + 4, cy - 5); ctx.lineTo(cx + 10, cy + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 10, cy - 5); ctx.lineTo(cx + 4, cy + 5); ctx.stroke();
      }
    });
    x -= s + gap;
    drawBtn(x, 'settings', (cx, cy) => {
      // gear
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
        ctx.lineTo(cx + Math.cos(a) * 9.5, cy + Math.sin(a) * 9.5);
        ctx.stroke();
      }
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, TAU); ctx.stroke();
    });
    if (withPause) {
      x -= s + gap;
      drawBtn(x, 'pause', (cx, cy) => {
        if (this.state === 'pause') {
          ctx.beginPath();
          ctx.moveTo(cx - 5, cy - 7);
          ctx.lineTo(cx + 8, cy);
          ctx.lineTo(cx - 5, cy + 7);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(cx - 6, cy - 7, 4.5, 14);
          ctx.fillRect(cx + 1.5, cy - 7, 4.5, 14);
        }
      });
    }

    if (this.settingsOpen) {
      this.drawSettings(ctx, cw, ch);
      return;
    }

    // Pause menu: big centered, clickable RESUME / SETTINGS / RESTART / QUIT
    // buttons. (Drawn here, after the reset above, so their hitboxes survive
    // in this.buttons for the pointer handler.)
    if (this.state === 'pause') {
      const bw = Math.min(300, cw * 0.6), bh = 50, g = 12;
      let by = ch * 0.36;
      const items = [
        { id: 'p_resume', label: '▶  RESUME', fill: '#5fe08b', fg: '#0c2417' },
        { id: 'p_settings', label: '⚙  SETTINGS', fill: 'rgba(255,255,255,0.16)', fg: '#fff' },
        { id: 'p_restart', label: '↻  RESTART', fill: 'rgba(255,255,255,0.16)', fg: '#fff' },
        { id: 'p_quit', label: '✕  QUIT TO MENU', fill: 'rgba(255,255,255,0.16)', fg: '#fff' },
      ];
      for (const it of items) {
        const bx = cw / 2 - bw / 2;
        this.buttons.push({ id: it.id, x: bx, y: by, w: bw, h: bh });
        roundRectPath(ctx, bx, by, bw, bh, 12);
        ctx.fillStyle = it.fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = it.fg;
        ctx.font = `900 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(it.label, cw / 2, by + bh / 2 + 8);
        by += bh + g;
      }
    }
  }

  // Settings panel: on/off rows (click, or dpad + A), DONE closes.
  drawSettings(ctx, cw, ch) {
    this.veil(ctx, cw, ch, 0.7);
    const rows = this.settingRows();
    const pw = Math.min(620, cw - 40), rh = 64;
    const ph = 90 + rows.length * (rh + 10) + 70;
    const px = cw / 2 - pw / 2, py = Math.max(60, ch / 2 - ph / 2);
    roundRectPath(ctx, px, py, pw, ph, 18);
    ctx.fillStyle = '#10122a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = `900 32px ${FONT}`;
    ctx.fillText('SETTINGS', cw / 2, py + 52);
    rows.forEach(([key, label, hint, choices], i) => {
      const y = py + 80 + i * (rh + 10), x = px + 24, w = pw - 48;
      const sel = this.setSel === i;
      this.buttons.push({ id: 'set:' + key, x, y, w, h: rh });
      roundRectPath(ctx, x, y, w, rh, 12);
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      if (sel) { ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.font = `900 19px ${FONT}`;
      ctx.fillText(label, x + 16, y + 28);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `13px ${FONT}`;
      ctx.fillText(hint, x + 16, y + 49);
      if (choices) {
        // segmented choice: OFF | NORMAL | FREQUENT
        const segW = 82, segH = 30, sx0 = x + w - segW * choices.length - 14, sy = y + rh / 2 - segH / 2;
        choices.forEach((c, k) => {
          const cx = sx0 + k * segW, cur = settings[key] === c;
          roundRectPath(ctx, cx + 2, sy, segW - 4, segH, 10);
          ctx.fillStyle = cur ? (c === 'off' ? 'rgba(255,255,255,0.35)' : '#5fe08b') : 'rgba(255,255,255,0.1)';
          ctx.fill();
          ctx.textAlign = 'center';
          ctx.fillStyle = cur ? '#0c2417' : 'rgba(255,255,255,0.6)';
          ctx.font = `bold 12px ${FONT}`;
          ctx.fillText(c.toUpperCase(), cx + segW / 2, sy + segH / 2 + 4);
        });
        return;
      }
      // switch
      const on = !!settings[key];
      const sw = 58, sh = 30, sx = x + w - sw - 14, sy = y + rh / 2 - sh / 2;
      roundRectPath(ctx, sx, sy, sw, sh, sh / 2);
      ctx.fillStyle = on ? '#5fe08b' : 'rgba(255,255,255,0.18)';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(on ? sx + sw - sh / 2 : sx + sh / 2, sy + sh / 2, sh / 2 - 4, 0, TAU); ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? '#5fe08b' : 'rgba(255,255,255,0.45)';
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(on ? 'ON' : 'OFF', sx - 10, sy + sh / 2 + 5);
    });
    // DONE
    const bw = 180, bh = 46, bx = cw / 2 - bw / 2, by = py + ph - 64;
    const sel = this.setSel === rows.length;
    this.buttons.push({ id: 'set:close', x: bx, y: by, w: bw, h: bh });
    roundRectPath(ctx, bx, by, bw, bh, 12);
    ctx.fillStyle = sel ? '#ffd94d' : 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.fillStyle = sel ? '#221c08' : '#fff';
    ctx.textAlign = 'center';
    ctx.font = `900 20px ${FONT}`;
    ctx.fillText('DONE', cw / 2, by + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('dpad ▲▼ choose  •  A toggle  •  B close', cw / 2, py + ph + 24);
    if (this.music.nowPlaying && settings.sound && settings.music) {
      ctx.fillText(`♪ now playing: ${this.music.nowPlaying}`, cw / 2, py + ph + 44);
    }
  }

  drawFinishedAtGoal(ctx) {
    const goal = this.level.goal;
    if (!goal) return;
    for (const p of this.players) {
      if (p.state !== 'finished') continue;
      const bob = Math.sin(this.time * 4 + p.slot) * 6;
      const x = goal.x + (p.finishOrder - 1.5) * 46;
      const y = goal.y - 76 + bob;
      drawHead(ctx, x, y, 18, p.color, p.headStyle, { x: 0, y: -0.3 }, Math.sin(this.time * 6 + p.slot) * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(['1st', '2nd', '3rd', '4th'][p.finishOrder], x, y + 34);
    }
  }

  drawHud(ctx, cw, ch) {
    const lv = LEVELS[this.levelIndex];
    const diff = DIFFS.find((d) => d.key === lv.diff);
    ctx.textAlign = 'left';
    ctx.fillStyle = diff ? diff.color : 'rgba(255,255,255,0.55)';
    ctx.font = `bold 15px ${FONT}`;
    const diffLabel = diff ? diff.label : '';
    ctx.fillText(`${diffLabel}  ·  ${this.mode === 'coop' ? 'CO-OP' : 'VS'}`, 16, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `900 21px ${FONT}`;
    ctx.fillText(lv.name, 16, 50);
    const bestT = this.best[this.mode][lv.name];
    if (bestT !== undefined) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(`best ${bestT.toFixed(2)}s`, 16, 70);
    }

    ctx.textAlign = 'center';
    if (this.state === 'play') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `900 24px ${FONT}`;
      ctx.fillText(this.raceTime.toFixed(1), cw / 2, 34);
    }

    // drop-in hint: while a slot is open, invite spectators to jump in
    if ((this.state === 'play' || this.state === 'countdown') && this.roster.some((r) => !r)) {
      ctx.fillStyle = `rgba(255,255,255,${0.32 + Math.sin(this.time * 3) * 0.14})`;
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText('press A to join', cw / 2, ch - 14);
    }

    // score chips (top-right, left of the pause/fullscreen buttons)
    let x = cw - 14 - (34 * 4 + 8 * 3) - 10;   // left of the 4 corner buttons
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i];
      const w = 86;
      x -= w + 8;
      roundRectPath(ctx, x, 12, w, 34, 17);
      ctx.fillStyle = 'rgba(10,12,24,0.55)';
      ctx.fill();
      // the player's character as the chip's portrait
      drawHead(ctx, x + 19, 29, 11, p.color, p.headStyle, { x: 0, y: 0 }, 0, 1);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${p.name} ${p.score}`, x + 36, 34);
    }
  }

  drawLobbyOverlay(ctx, cw, ch) {
    // title: the logo when it's loaded, else plain text
    ctx.textAlign = 'center';
    const logo = art('logo');
    if (logo) {
      const lh = Math.min(84, ch * 0.12), lw = lh * (logo.width / logo.height);
      ctx.drawImage(logo, cw / 2 - lw / 2, 2, lw, lh);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText('a ROUNDERS spinoff', cw / 2, lh + 12);
    } else {
      ctx.fillStyle = '#ffd94d';
      ctx.font = `900 ${Math.min(64, cw * 0.06)}px ${FONT}`;
      ctx.fillText('SWINGERS', cw / 2, 58);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText('a ROUNDERS spinoff', cw / 2, 80);
    }

    // slot chips: character portrait, name, and their Rounders title
    const chipW = Math.min(210, cw / 4 - 20), chipH = 52, cy0 = 104;
    const total = chipW * 4 + 12 * 3;
    let x = cw / 2 - total / 2;
    for (let i = 0; i < 4; i++) {
      const slot = this.roster[i];
      roundRectPath(ctx, x, cy0, chipW, chipH, 12);
      ctx.fillStyle = slot ? 'rgba(10,12,24,0.6)' : 'rgba(10,12,24,0.3)';
      ctx.fill();
      ctx.strokeStyle = slot ? PLAYER_COLORS[i].main : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      if (slot) {
        const st = headStyle(slot.headStyle);
        drawHead(ctx, x + 26, cy0 + chipH / 2, 16, PLAYER_COLORS[i], slot.headStyle, { x: 0, y: 0 }, 0, 1);
        const tx = x + 30 + (chipW - 30) / 2;
        ctx.fillStyle = '#fff';
        ctx.font = `bold 15px ${FONT}`;
        ctx.fillText(`P${i + 1}  ◀ ${st.name} ▶`, tx, cy0 + 23);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `italic 12px ${FONT}`;
        ctx.fillText(st.cast ? st.cast.title : 'original Swingers', tx, cy0 + 41);
      } else {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(this.time * 3 + i) * 0.12})`;
        ctx.font = `bold 14px ${FONT}`;
        ctx.fillText('press A to join', x + chipW / 2, cy0 + 31);
      }
      x += chipW + 12;
    }

    // PLAY button + mode dropdown beside it
    const anyJoined = this.players.length > 0;
    const bw = 220, bh = 62;
    const bx = cw / 2 - bw / 2, by = ch - bh - 26;
    this.buttons = this.buttons.filter((b) => b.id !== 'play' && !b.id.startsWith('mode'));
    if (anyJoined) {
      this.buttons.push({ id: 'play', x: bx, y: by, w: bw, h: bh });
      const pulse = 1 + Math.sin(this.time * 4) * 0.02;
      ctx.save();
      ctx.translate(cw / 2, by + bh / 2);
      ctx.scale(pulse, pulse);
      roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, 18);
      ctx.fillStyle = '#ffd94d';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#221c08';
      ctx.font = `900 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('▶  PLAY', 0, 11);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText('or press START', cw / 2, by - 10);

      // mode dropdown (VS / CO-OP). Opens UPWARD — it lives at the bottom
      // edge. Options are pushed as regular buttons so clicks route through
      // the one pointerdown handler; Y on a pad cycles the mode directly.
      const MODES = [
        { key: 'vs', label: 'VS' },
        { key: 'coop', label: 'CO-OP' },
      ];
      const mw = 150, mx = bx + bw + 16, mh = bh;
      this.buttons.push({ id: 'mode', x: mx, y: by, w: mw, h: mh });
      roundRectPath(ctx, mx, by, mw, mh, 14);
      ctx.fillStyle = 'rgba(10,12,24,0.6)';
      ctx.fill();
      ctx.strokeStyle = this.modeOpen ? '#ffd94d' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = `bold 11px ${FONT}`;
      ctx.fillText('MODE (Y)', mx + mw / 2, by + 17);
      ctx.fillStyle = '#fff';
      ctx.font = `900 20px ${FONT}`;
      ctx.fillText(`${MODES.find((m) => m.key === this.mode).label}  ${this.modeOpen ? '▴' : '▾'}`, mx + mw / 2, by + 44);
      if (this.modeOpen) {
        const oh = 44;
        MODES.forEach((m, i) => {
          const oy = by - (MODES.length - i) * (oh + 6);
          this.buttons.push({ id: `mode:${m.key}`, x: mx, y: oy, w: mw, h: oh });
          roundRectPath(ctx, mx, oy, mw, oh, 12);
          ctx.fillStyle = m.key === this.mode ? 'rgba(255,217,77,0.9)' : 'rgba(10,12,24,0.85)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = m.key === this.mode ? '#221c08' : '#fff';
          ctx.font = `bold 18px ${FONT}`;
          ctx.fillText(m.label, mx + mw / 2, oy + 29);
        });
      }
    } else {
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(this.time * 3) * 0.2})`;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('press A on a controller — or Enter for keyboard', cw / 2, ch - 52);
    }

    // controls legend
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('STICKS steer  •  LT/RT grab  •  B punch  •  ◀▶ character  •  Y mode  •  X settings  •  BACK leave  •  M sound  •  F fullscreen', cw / 2, ch - 8);
  }

  // Title screen, after Rounders' (dark vignette, arched logo, tagline,
  // pulsing PRESS START) but about climbing: Rounders characters hang off
  // ropes from the top of the screen and swing.
  drawTitle(ctx, cw, ch) {
    const t = this.time;
    const bg = art('title-bg') || art('bg:meadow');
    if (bg) {
      const s = Math.max(cw / bg.width, ch / bg.height) * 1.06;
      const dw = bg.width * s, dh = bg.height * s;
      ctx.drawImage(bg, (cw - dw) / 2 + Math.sin(t * 0.05) * (dw - cw) * 0.4, (ch - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = '#141830';
      ctx.fillRect(0, 0, cw, ch);
    }
    // vignette: dark behind the logo block, fading out to the edges
    const vg = ctx.createRadialGradient(cw / 2, ch * 0.46, 0, cw / 2, ch * 0.46, Math.max(cw, ch) * 0.62);
    vg.addColorStop(0, 'rgba(6,5,14,0.78)');
    vg.addColorStop(0.55, 'rgba(6,5,14,0.45)');
    vg.addColorStop(1, 'rgba(6,5,14,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cw, ch);

    this.drawTitleSwingers(ctx, cw, ch);

    ctx.textAlign = 'center';
    const spaced = (text, y, size, color, spacing, glow) => {
      ctx.save();
      ctx.font = `900 ${size}px ${FONT}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
      ctx.shadowColor = glow || 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = glow ? 18 : 10;
      ctx.fillStyle = color;
      ctx.fillText(text, cw / 2 + spacing / 2, y);
      ctx.restore();
    };
    const logo = art('logo-arch') || art('logo');
    const lw = Math.min(980, cw * 0.72);
    const lh = logo ? lw * (logo.height / logo.width) : 140;
    const blockH = 30 + lh + 50 + 70;
    let y = Math.max(40, ch * 0.47 - blockH / 2);
    spaced('A ROUNDERS SPINOFF  •  1–4 PLAYER CLIMBING PARTY GAME', y + 16, Math.max(12, Math.min(16, cw * 0.013)), 'rgba(255,255,255,0.75)', 3);
    y += 30;
    if (logo) {
      const k = 1 + Math.sin(t * 1.85) * 0.015;   // slow "loom"
      ctx.save();
      ctx.translate(cw / 2, y + lh / 2);
      ctx.scale(k, k);
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 14;
      ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh);
      ctx.restore();
    } else {
      spaced('SWINGERS', y + lh * 0.7, 110, '#ffd94d', 6);
    }
    y += lh + 30;
    ctx.save();
    ctx.font = `600 ${Math.max(14, Math.min(19, cw * 0.016))}px ${FONT}`;
    ctx.fillStyle = 'rgba(245,242,255,0.88)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 14;
    ctx.fillText('Grab. Swing. Fling. Race the Rounders up to the flag.', cw / 2, y);
    ctx.restore();
    y += 64;
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
    ctx.globalAlpha = 0.35 + 0.65 * pulse;
    spaced('PRESS START', y, Math.max(16, Math.min(26, cw * 0.02)), '#ffd94d', 11, 'rgba(255,190,60,0.6)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('any controller button  •  a key  •  or a click', cw / 2, ch - 18);
  }

  // A few Rounders characters hanging one-handed from ropes at the top of
  // the title screen, swinging like pendulums (different lengths, different
  // rhythms), each facing the way it's swinging.
  drawTitleSwingers(ctx, cw, ch) {
    if (!this.titleCast) {
      const cast = HEAD_STYLES.filter((h) => h.cast);
      const pick = [];
      while (pick.length < 4 && cast.length) pick.push(HEAD_STYLES.indexOf(cast.splice(Math.floor(Math.random() * cast.length), 1)[0]));
      this.titleCast = pick;
    }
    const r = Math.max(16, ch * 0.045);
    const spots = [[0.06, 0.44], [0.16, 0.22], [0.84, 0.27], [0.94, 0.4]];   // [x, rope length] — kept clear of the logo
    this.titleCast.forEach((style, i) => {
      const [fx, fl] = spots[i];
      const ax = cw * fx, len = ch * fl;
      const w = Math.sqrt(1.6 / fl);                    // longer rope, slower swing
      const amp = 0.32;
      const ph = this.time * w + i * 1.7;
      const ang = Math.sin(ph) * amp;
      const vel = Math.cos(ph);                         // swing direction
      const hx = ax + Math.sin(ang) * len, hy = Math.cos(ang) * len;
      // rope
      ctx.strokeStyle = '#caa268';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, -4); ctx.lineTo(hx, hy); ctx.stroke();
      // the hanging arm and body (body trails a little below the hand)
      const bx = hx + Math.sin(ang) * r * 1.6, by = hy + Math.cos(ang) * r * 1.6 + r * 0.4;
      const st = headStyle(style);
      ctx.strokeStyle = st.cast ? st.cast.dark : '#4e5568';
      ctx.lineWidth = r * 0.42;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + (bx - hx) * 0.2 - vel * r * 0.3, (hy + by) / 2, bx, by - r * 0.6); ctx.stroke();
      ctx.strokeStyle = st.cast ? st.cast.color : '#8e97ad';
      ctx.lineWidth = r * 0.22;
      ctx.stroke();
      ctx.fillStyle = '#ff4d54';
      ctx.beginPath(); ctx.arc(hx, hy, r * 0.3, 0, TAU); ctx.fill();
      drawHead(ctx, bx, by, r, PLAYER_COLORS[i], style, { x: vel, y: 0 }, ang, vel >= 0 ? 1 : -1);
    });
  }

  drawSelect(ctx, cw, ch) {
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, '#141830');
    grad.addColorStop(1, '#233054');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    const tab = DIFFS[this.sel.col];
    const list = this.grid[this.sel.col];
    const cur = LEVELS[list[this.sel.row]];
    // the selected board's own backdrop fills the screen, heavily dimmed
    const bg = art('bg:' + cur.theme) || art('keyart');
    if (bg) {
      const s = Math.max(cw / bg.width, ch / bg.height);
      ctx.drawImage(bg, (cw - bg.width * s) / 2, (ch - bg.height * s) / 2, bg.width * s, bg.height * s);
      ctx.fillStyle = 'rgba(12,14,32,0.8)';
      ctx.fillRect(0, 0, cw, ch);
    }
    this.selRects = [];

    // title + session scores
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = `900 ${Math.min(34, cw * 0.032)}px ${FONT}`;
    ctx.fillText(`CHOOSE A BOARD — ${this.mode === 'coop' ? 'CO-OP' : 'VS'}`, cw / 2, 40);

    // difficulty tabs
    const tw = Math.min(170, (cw - 80) / DIFFS.length - 10), th = 38, ty = 56;
    const tx0 = cw / 2 - (DIFFS.length * (tw + 10) - 10) / 2;
    DIFFS.forEach((d, i) => {
      const x = tx0 + i * (tw + 10), on = i === this.sel.col;
      this.selRects.push({ x, y: ty, w: tw, h: th, tab: i });
      roundRectPath(ctx, x, ty, tw, th, th / 2);
      ctx.fillStyle = on ? d.color : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.fillStyle = on ? '#141830' : d.color;
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText(`${d.label}  ${this.grid[i].length}`, x + tw / 2, ty + 25);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('LB / RB  switch tabs', cw / 2, ty + th + 18);

    // board cards
    const gap = 14;
    const rowsN = Math.ceil(list.length / CARD_COLS);
    const avail = ch - 150 - 80;
    let cardW = Math.min(230, (cw - 60 - gap * (CARD_COLS - 1)) / CARD_COLS);
    let cardH = cardW * 0.78;
    if (rowsN * (cardH + gap) > avail) { cardH = avail / rowsN - gap; cardW = cardH / 0.78; }
    const gx0 = cw / 2 - (CARD_COLS * cardW + (CARD_COLS - 1) * gap) / 2, gy0 = 136;
    list.forEach((li, k) => {
      const lv = LEVELS[li];
      const x = gx0 + (k % CARD_COLS) * (cardW + gap), y = gy0 + Math.floor(k / CARD_COLS) * (cardH + gap);
      const on = k === this.sel.row;
      this.selRects.push({ x, y, w: cardW, h: cardH, index: li });
      this.drawBoardCard(ctx, lv, x, y, cardW, cardH, on, tab.color);
    });

    // selected board's pitch
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.min(22, cw * 0.02)}px ${FONT}`;
    ctx.fillText(cur.name, cw / 2, ch - 62);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${Math.min(17, cw * 0.015)}px ${FONT}`;
    ctx.fillText(cur.intro || '', cw / 2, ch - 38);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('stick / dpad pick  •  A race  •  B back to the playground  •  X settings  •  or click a card', cw / 2, ch - 12);
  }

  // One board card: its theme backdrop, a live mini-map drawn from the
  // board's data, its name, mechanic icons and best time.
  drawBoardCard(ctx, lv, x, y, w, h, on, accent) {
    ctx.save();
    if (on) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(1.05, 1.05);
      ctx.translate(-x - w / 2, -y - h / 2);
    }
    const footH = 40, mapH = h - footH;
    roundRectPath(ctx, x, y, w, h, 14);
    ctx.fillStyle = '#0d0f22';
    ctx.fill();
    ctx.save();
    roundRectPath(ctx, x, y, w, h, 14);
    ctx.clip();
    const bg = art('bg:' + lv.theme);
    if (bg) {
      const s = Math.max(w / bg.width, mapH / bg.height);
      ctx.drawImage(bg, x + (w - bg.width * s) / 2, y + (mapH - bg.height * s) / 2, bg.width * s, bg.height * s);
      ctx.fillStyle = 'rgba(8,10,24,0.35)';
      ctx.fillRect(x, y, w, mapH);
    } else {
      ctx.fillStyle = lv.bg[1];
      ctx.fillRect(x, y, w, mapH);
    }
    this.drawMiniMap(ctx, lv, x + 6, y + 6, w - 12, mapH - 10);
    ctx.restore();

    roundRectPath(ctx, x, y, w, h, 14);
    ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = on ? 4 : 1.5;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.max(11, Math.min(15, w * 0.068))}px ${FONT}`;
    ctx.fillText(lv.name, x + 10, y + mapH + 16);
    // mechanic icons + best time on the second line
    let ix = x + 10;
    const isz = 16;
    for (const m of mechanicsOf(lv)) {
      const icon = art('icon:' + m);
      if (!icon) continue;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(icon, ix, y + mapH + 21, isz, isz);
      ctx.globalAlpha = 1;
      ix += isz + 4;
    }
    const bt = this.best[this.mode][lv.name];
    if (bt !== undefined) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd94d';
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillText(`★ ${bt.toFixed(2)}s`, x + w - 10, y + mapH + 34);
    }
    ctx.restore();
  }

  // The board's layout, drawn small from its level data.
  drawMiniMap(ctx, lv, x, y, w, h) {
    const s = Math.min(w / lv.w, h / lv.h);
    ctx.save();
    ctx.translate(x + (w - lv.w * s) / 2, y + (h - lv.h * s) / 2);
    ctx.scale(s, s);
    for (const z of lv.winds || []) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
    }
    for (const so of lv.solids || []) {
      ctx.save();
      ctx.translate(so.x, so.y);
      ctx.rotate(so.angle || 0);
      ctx.fillStyle = so.deadly ? (lv.hazard || '#ff4757') : so.bounce ? lv.accent : so.ice ? '#cfefff' : '#e6e9f5';
      ctx.globalAlpha = so.deadly ? 0.9 : 0.85;
      ctx.fillRect(-so.w / 2, -so.h / 2, so.w, so.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#e0c088';
    ctx.lineWidth = 9;
    for (const r of lv.ropes || []) { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.len); ctx.stroke(); }
    ctx.strokeStyle = '#aab3c8';
    ctx.lineWidth = 24;
    ctx.lineCap = 'round';
    for (const sp of lv.spinners || []) {
      const a = sp.phase || 0.6;
      ctx.beginPath();
      ctx.moveTo(sp.x - Math.cos(a) * sp.len / 2, sp.y - Math.sin(a) * sp.len / 2);
      ctx.lineTo(sp.x + Math.cos(a) * sp.len / 2, sp.y + Math.sin(a) * sp.len / 2);
      ctx.stroke();
    }
    ctx.fillStyle = lv.accent;
    for (const m of lv.movers || []) ctx.fillRect(m.from[0] - m.w / 2, m.from[1] - m.h / 2, m.w, m.h);
    ctx.fillStyle = '#ff8fb3';
    for (const b of lv.balloons || []) { ctx.beginPath(); ctx.arc(b.x, b.y, 28, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ff8a3d';
    for (const g of lv.guns || []) ctx.fillRect(g.x - 26, g.y - 9, 52, 18);
    // start (a robot) and goal (a ring)
    ctx.fillStyle = '#ff5d6c';
    ctx.beginPath(); ctx.arc(lv.spawn.x, lv.spawn.y, 34, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffd94d';
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(lv.goal.x, lv.goal.y, lv.goal.r + 6, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  drawCountdown(ctx, cw, ch) {
    const n = Math.ceil(this.cd);
    const frac = this.cd - Math.floor(this.cd);
    ctx.save();
    ctx.translate(cw / 2, ch * 0.4);
    ctx.scale(1 + (1 - frac) * 0.25, 1 + (1 - frac) * 0.25);
    ctx.globalAlpha = clamp(frac * 2.5, 0, 1);
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 120px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(n), 0, 40);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(LEVELS[this.levelIndex].intro, cw / 2, ch * 0.62);
  }

  drawGo(ctx, cw, ch) {
    ctx.save();
    ctx.globalAlpha = clamp(this.goFlash / 0.5, 0, 1);
    ctx.fillStyle = '#ffd94d';
    ctx.font = `900 130px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('GO!', cw / 2, ch * 0.4 + 40);
    ctx.restore();
  }

  veil(ctx, cw, ch, a = 0.62) {
    ctx.fillStyle = `rgba(8,10,20,${a})`;
    ctx.fillRect(0, 0, cw, ch);
  }

  drawPause(ctx, cw, ch) {
    // Veil + title + input hints. The three clickable RESUME/RESTART/QUIT
    // buttons are drawn by drawButtons (on top of this veil) so their
    // hitboxes are registered after the per-frame button reset.
    this.veil(ctx, cw, ch, 0.62);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `900 52px ${FONT}`;
    ctx.fillText('PAUSED', cw / 2, ch * 0.28);
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('controller:  A / START resume  •  Y settings  •  X restart  •  B / BACK quit', cw / 2, ch * 0.76);
    ctx.fillText('keyboard:  P resume  •  C settings  •  X restart  •  Backspace quit  •  M sound  •  F fullscreen', cw / 2, ch * 0.76 + 22);
  }

  drawRoundEnd(ctx, cw, ch) {
    this.veil(ctx, cw, ch);
    ctx.textAlign = 'center';
    if (this.coopWin !== null) {
      // co-op: everybody made it — congratulate the whole team
      const names = (this.roundResults || []).map((r) => headStyle(r.p.headStyle).name);
      const who = names.length > 1
        ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1]
        : names.join('');
      const pulse = 1 + Math.sin(this.time * 5) * 0.03;
      ctx.save();
      ctx.translate(cw / 2, ch * 0.2 - 16);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffd94d';
      ctx.font = `900 ${names.length > 2 ? 44 : 54}px ${FONT}`;
      ctx.fillText(`${who} MADE IT!`, 0, 16);
      ctx.restore();
      ctx.fillStyle = '#5fe08b';
      ctx.font = `900 20px ${FONT}`;
      ctx.fillText(`TEAM TIME  ${this.coopWin.toFixed(2)}s`, cw / 2, ch * 0.2 + 52);
    } else if (this.winner) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.03;
      ctx.save();
      ctx.translate(cw / 2, ch * 0.2 - 16);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = this.winner.color.main;
      ctx.font = `900 54px ${FONT}`;
      ctx.fillText(`${headStyle(this.winner.headStyle).name.toUpperCase()} WINS!`, 0, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText(this.winner.name, 0, 44);
      ctx.restore();
    } else {
      ctx.fillStyle = '#ffd94d';
      ctx.font = `900 46px ${FONT}`;
      ctx.fillText('ROUND OVER', cw / 2, ch * 0.2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillText(LEVELS[this.levelIndex].name, cw / 2, ch * 0.2 + 30);

    const rows = this.roundResults || [];
    const y0 = ch * 0.32, rh = 52;
    rows.forEach((row, i) => {
      const y = y0 + i * rh;
      const w = Math.min(560, cw * 0.7);
      roundRectPath(ctx, cw / 2 - w / 2, y, w, rh - 10, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      drawHead(ctx, cw / 2 - w / 2 + 30, y + 21, 15, row.p.color, row.p.headStyle, { x: 0, y: 0 }, 0, 1);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(headStyle(row.p.headStyle).name, cw / 2 - w / 2 + 56, y + 23);
      ctx.fillStyle = row.p.color.main;
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillText(row.p.name, cw / 2 - w / 2 + 56, y + 37);
      ctx.fillStyle = '#fff';
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(row.finished ? row.time.toFixed(2) + 's' : 'DNF', cw / 2 - w / 2 + 170, y + 28);
      ctx.textAlign = 'right';
      ctx.fillStyle = row.pts ? '#ffd94d' : 'rgba(255,255,255,0.4)';
      ctx.fillText(`+${row.pts}`, cw / 2 + w / 2 - 110, y + 28);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${row.p.score} pts`, cw / 2 + w / 2 - 22, y + 28);
    });

    if (this.roundEndT > 0.8) {
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(this.time * 4) * 0.3})`;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('Press A for the board list', cw / 2, ch * 0.85);
    }
  }
}
