// Game orchestration.
//
// Flow: LOBBY (a live practice playground — join, warm up, press PLAY)
//   -> SELECT (30 boards organized by difficulty)
//   -> countdown -> race -> results -> back to SELECT.
// First robot to the goal WINS the round on the spot (5 pts); scores and
// best times persist for the session.

import { Input, NEUTRAL } from './input.js';
import { Player, PLAYER_COLORS, CFG, CAT } from './player.js';
import { HEAD_STYLES, drawHead } from './heads.js';
import { Level } from './level.js';
import { LEVELS, PRACTICE } from './levels.js';
import { Particles } from './particles.js';
import { sfx } from './audio.js';
import { clamp, lerp, TAU, roundRectPath } from './util.js';

const M = window.Matter;

const POINTS = [5, 3, 2, 1];
const DIFFS = [
  { key: 'easy', label: 'EASY', color: '#5fe08b' },
  { key: 'medium', label: 'MEDIUM', color: '#ffd94d' },
  { key: 'hard', label: 'HARD', color: '#ff5d6c' },
];

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

    // clickable on-screen buttons, rebuilt every frame
    this.buttons = [];
    canvas.addEventListener('pointerdown', (e) => {
      const x = e.offsetX, y = e.offsetY;
      for (const b of this.buttons) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (b.id === 'pause') this.togglePause();
          else if (b.id === 'fs') this.toggleFullscreen();
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
      if (this.state === 'select') {
        for (const r of this.selRects) {
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            this.chooseLevel(r.index);
            return;
          }
        }
      }
    });

    // audio unlock needs a real user gesture; pointer works for pad-only setups
    window.addEventListener('pointerdown', () => sfx.ensure());
    window.addEventListener('keydown', (e) => {
      sfx.ensure();
      if (e.code === 'KeyM') sfx.toggleMute();
      if (e.code === 'KeyF') this.toggleFullscreen();
      if (this.state === 'play' || this.state === 'pause') {
        if (e.code === 'KeyN') this.skipLevel();        // debug: next board
        if (e.code === 'KeyR') this.startLevel();       // restart board
      }
    });

    this.state = 'lobby';
    this.buildLobby();
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
    this.particles.clear();
    this.shake = 0;
    // respawn any already-joined players into the playground
    this.players.forEach((p, i) => {
      p.spawn(this.engine, PRACTICE.spawn.x + i * 50, PRACTICE.spawn.y);
    });
    this.state = 'lobby';
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
    this.particles.clear();
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
    this.roster[slot] = { sourceId, headStyle: slot % HEAD_STYLES.length };
    const p = new Player(slot, sourceId, slot % HEAD_STYLES.length);
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

    switch (this.state) {
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
        if (s.pressed.start) { this.openSelect(); return; }
      }
    }
    this.physicsStep(dt);
  }

  selectStep(states) {
    const rows = () => this.grid[this.sel.col].length;
    for (const s of states) {
      if (!this.isJoined(s.id)) continue;
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
        this.sel.col = (this.sel.col + mx + 3) % 3;
        this.sel.row = clamp(this.sel.row, 0, rows() - 1);
        this.sel.row = (this.sel.row + my + rows()) % rows();
        sfx.uiTick();
      }
      if (s.pressed.a || s.pressed.start) {
        this.chooseLevel(this.grid[this.sel.col][this.sel.row]);
        return;
      }
      if (s.pressed.b || s.pressed.back) { this.backToLobby(); return; }
    }
  }

  physicsStep(dt) {
    for (const p of this.players) p.update(dt, this.ctrlFor(p), this);
    this.level.update(dt, this.particles, this.players);
    M.Engine.update(this.engine, dt * 1000);
    for (let i = 0; i < 3; i++) for (const p of this.players) p.solveGrabs();

    for (const p of this.players) {
      if (p.state !== 'alive') continue;
      p.clampSpeed();
      const pos = p.body.position;

      // hazards + out of bounds
      const hitDeadly = this.level.deadlyBodies.length &&
        M.Query.collides(p.body, this.level.deadlyBodies).length > 0;
      if (hitDeadly || pos.y > this.level.h + 120 || pos.x < -150 || pos.x > this.level.w + 150) {
        p.die(this);
        continue;
      }

      if (this.state !== 'play') continue;

      // power-ups
      for (const pu of this.level.powerups) {
        if (!pu.active || p.superPunch) continue;
        if (Math.hypot(pos.x - pu.x, pos.y - pu.y) < 34 + CFG.radius) {
          pu.active = false;
          pu.respawnAt = this.level.time + 9;
          p.superPunch = true;
          this.particles.burst(pu.x, pu.y, '#ffd94d', 10, 200);
          sfx.pickup();
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

    // Pause menu: big centered, clickable RESUME / RESTART / QUIT buttons.
    // (Drawn here, after the reset above, so their hitboxes survive in
    // this.buttons for the pointer handler.)
    if (this.state === 'pause') {
      const bw = Math.min(300, cw * 0.6), bh = 54, g = 14;
      let by = ch * 0.42;
      const items = [
        { id: 'p_resume', label: '▶  RESUME', fill: '#5fe08b', fg: '#0c2417' },
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
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(it.label, cw / 2, by + bh / 2 + 8);
        by += bh + g;
      }
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
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(['1st', '2nd', '3rd', '4th'][p.finishOrder], x, y + 34);
    }
  }

  drawHud(ctx, cw, ch) {
    const lv = LEVELS[this.levelIndex];
    const diff = DIFFS.find((d) => d.key === lv.diff);
    ctx.textAlign = 'left';
    ctx.fillStyle = diff ? diff.color : 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 15px system-ui, sans-serif';
    const diffLabel = diff ? diff.label : '';
    ctx.fillText(`${diffLabel}  ·  ${this.mode === 'coop' ? 'CO-OP' : 'VS'}`, 16, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '900 21px system-ui, sans-serif';
    ctx.fillText(lv.name, 16, 50);
    const bestT = this.best[this.mode][lv.name];
    if (bestT !== undefined) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(`best ${bestT.toFixed(2)}s`, 16, 70);
    }

    ctx.textAlign = 'center';
    if (this.state === 'play') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '900 24px system-ui, sans-serif';
      ctx.fillText(this.raceTime.toFixed(1), cw / 2, 34);
    }

    // drop-in hint: while a slot is open, invite spectators to jump in
    if ((this.state === 'play' || this.state === 'countdown') && this.roster.some((r) => !r)) {
      ctx.fillStyle = `rgba(255,255,255,${0.32 + Math.sin(this.time * 3) * 0.14})`;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('press A to join', cw / 2, ch - 14);
    }

    // score chips (top-right, left of the pause/fullscreen buttons)
    let x = cw - 16 - (34 * 2 + 8) - 10;
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i];
      const w = 86;
      x -= w + 8;
      roundRectPath(ctx, x, 12, w, 34, 17);
      ctx.fillStyle = 'rgba(10,12,24,0.55)';
      ctx.fill();
      ctx.fillStyle = p.color.main;
      ctx.beginPath(); ctx.arc(x + 19, 29, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${p.name} ${p.score}`, x + 34, 34);
    }
  }

  drawLobbyOverlay(ctx, cw, ch) {
    // title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = `900 ${Math.min(64, cw * 0.06)}px system-ui, sans-serif`;
    ctx.fillText('SWINGERS', cw / 2, 58);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText('a grabby robot party game', cw / 2, 80);

    // slot chips
    const chipW = Math.min(190, cw / 4 - 20), chipH = 44;
    const total = chipW * 4 + 12 * 3;
    let x = cw / 2 - total / 2;
    for (let i = 0; i < 4; i++) {
      const slot = this.roster[i];
      roundRectPath(ctx, x, 96, chipW, chipH, 12);
      ctx.fillStyle = slot ? 'rgba(10,12,24,0.6)' : 'rgba(10,12,24,0.3)';
      ctx.fill();
      ctx.strokeStyle = slot ? PLAYER_COLORS[i].main : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      if (slot) {
        drawHead(ctx, x + 24, 96 + chipH / 2, 14, PLAYER_COLORS[i], slot.headStyle, { x: 0, y: 0 }, 0);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(`P${i + 1}  ◀ ${HEAD_STYLES[slot.headStyle].name} ▶`, x + 24 + (chipW - 34) / 2, 96 + 28);
      } else {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(this.time * 3 + i) * 0.12})`;
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText('press A to join', x + chipW / 2, 96 + 28);
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
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▶  PLAY', 0, 11);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 14px system-ui, sans-serif';
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
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('MODE (Y)', mx + mw / 2, by + 17);
      ctx.fillStyle = '#fff';
      ctx.font = '900 20px system-ui, sans-serif';
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
          ctx.font = 'bold 18px system-ui, sans-serif';
          ctx.fillText(m.label, mx + mw / 2, oy + 29);
        });
      }
    } else {
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(this.time * 3) * 0.2})`;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('press A on a controller — or Enter for keyboard', cw / 2, ch - 52);
    }

    // controls legend
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('STICKS steer  •  LT/RT grab  •  B punch  •  ◀▶ face  •  Y mode  •  BACK leave  •  F fullscreen', cw / 2, ch - 8);
  }

  drawSelect(ctx, cw, ch) {
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, '#141830');
    grad.addColorStop(1, '#233054');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = `900 ${Math.min(44, cw * 0.045)}px system-ui, sans-serif`;
    ctx.fillText(`CHOOSE A BOARD — ${this.mode === 'coop' ? 'CO-OP' : 'VS'}`, cw / 2, 52);

    // session scores
    ctx.font = 'bold 15px system-ui, sans-serif';
    let sx = cw / 2 - (this.players.length - 1) * 60;
    for (const p of this.players) {
      ctx.fillStyle = p.color.main;
      ctx.fillText(`${p.name} ${p.score}`, sx, 78);
      sx += 120;
    }

    this.selRects = [];
    const colW = Math.min(300, (cw - 80) / 3);
    const rowH = Math.min(46, (ch - 200) / 10);
    const x0 = cw / 2 - colW * 1.5 - 20;
    const y0 = 116;
    DIFFS.forEach((d, ci) => {
      const cx = x0 + ci * (colW + 20);
      ctx.textAlign = 'center';
      ctx.fillStyle = d.color;
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.fillText(d.label, cx + colW / 2, y0 - 12);
      this.grid[ci].forEach((levelIndex, ri) => {
        const lv = LEVELS[levelIndex];
        const y = y0 + ri * rowH;
        const isSel = this.sel.col === ci && this.sel.row === ri;
        this.selRects.push({ x: cx, y, w: colW, h: rowH - 6, index: levelIndex });
        roundRectPath(ctx, cx, y, colW, rowH - 6, 10);
        ctx.fillStyle = isSel ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
        ctx.fill();
        if (isSel) {
          ctx.strokeStyle = d.color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.fillStyle = isSel ? '#fff' : 'rgba(255,255,255,0.75)';
        ctx.font = `bold ${Math.min(15, rowH * 0.38)}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(lv.name, cx + 14, y + rowH / 2 + 4);
        const bt = this.best[this.mode][lv.name];
        if (bt !== undefined) {
          ctx.textAlign = 'right';
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = `${Math.min(12, rowH * 0.3)}px system-ui, sans-serif`;
          ctx.fillText(bt.toFixed(2) + 's', cx + colW - 12, y + rowH / 2 + 4);
        }
      });
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('stick / dpad to browse  •  A to race  •  B back to the playground  •  or click a board', cw / 2, ch - 14);
  }

  drawCountdown(ctx, cw, ch) {
    const n = Math.ceil(this.cd);
    const frac = this.cd - Math.floor(this.cd);
    ctx.save();
    ctx.translate(cw / 2, ch * 0.4);
    ctx.scale(1 + (1 - frac) * 0.25, 1 + (1 - frac) * 0.25);
    ctx.globalAlpha = clamp(frac * 2.5, 0, 1);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 120px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(n), 0, 40);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(LEVELS[this.levelIndex].intro, cw / 2, ch * 0.62);
  }

  drawGo(ctx, cw, ch) {
    ctx.save();
    ctx.globalAlpha = clamp(this.goFlash / 0.5, 0, 1);
    ctx.fillStyle = '#ffd94d';
    ctx.font = '900 130px system-ui, sans-serif';
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
    ctx.font = '900 52px system-ui, sans-serif';
    ctx.fillText('PAUSED', cw / 2, ch * 0.28);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('controller:  A / START resume  •  X restart  •  B / BACK quit', cw / 2, ch * 0.76);
    ctx.fillText('keyboard:  P resume  •  X restart  •  Backspace quit  •  M mute  •  F fullscreen', cw / 2, ch * 0.76 + 22);
  }

  drawRoundEnd(ctx, cw, ch) {
    this.veil(ctx, cw, ch);
    ctx.textAlign = 'center';
    if (this.coopWin !== null) {
      // co-op: everybody made it — congratulate the whole team
      const names = (this.roundResults || []).map((r) => r.p.name);
      const who = names.length > 1
        ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1]
        : names.join('');
      const pulse = 1 + Math.sin(this.time * 5) * 0.03;
      ctx.save();
      ctx.translate(cw / 2, ch * 0.2 - 16);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffd94d';
      ctx.font = `900 ${names.length > 2 ? 44 : 54}px system-ui, sans-serif`;
      ctx.fillText(`${who} MADE IT!`, 0, 16);
      ctx.restore();
      ctx.fillStyle = '#5fe08b';
      ctx.font = '900 20px system-ui, sans-serif';
      ctx.fillText(`TEAM TIME  ${this.coopWin.toFixed(2)}s`, cw / 2, ch * 0.2 + 52);
    } else if (this.winner) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.03;
      ctx.save();
      ctx.translate(cw / 2, ch * 0.2 - 16);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = this.winner.color.main;
      ctx.font = '900 54px system-ui, sans-serif';
      ctx.fillText(`${this.winner.name} WINS!`, 0, 16);
      ctx.restore();
    } else {
      ctx.fillStyle = '#ffd94d';
      ctx.font = '900 46px system-ui, sans-serif';
      ctx.fillText('ROUND OVER', cw / 2, ch * 0.2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(LEVELS[this.levelIndex].name, cw / 2, ch * 0.2 + 30);

    const rows = this.roundResults || [];
    const y0 = ch * 0.32, rh = 52;
    rows.forEach((row, i) => {
      const y = y0 + i * rh;
      const w = Math.min(560, cw * 0.7);
      roundRectPath(ctx, cw / 2 - w / 2, y, w, rh - 10, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.fillStyle = row.p.color.main;
      ctx.beginPath(); ctx.arc(cw / 2 - w / 2 + 30, y + 21, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(row.p.name, cw / 2 - w / 2 + 54, y + 28);
      ctx.fillText(row.finished ? row.time.toFixed(2) + 's' : 'DNF', cw / 2 - w / 2 + 130, y + 28);
      ctx.textAlign = 'right';
      ctx.fillStyle = row.pts ? '#ffd94d' : 'rgba(255,255,255,0.4)';
      ctx.fillText(`+${row.pts}`, cw / 2 + w / 2 - 110, y + 28);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${row.p.score} pts`, cw / 2 + w / 2 - 22, y + 28);
    });

    if (this.roundEndT > 0.8) {
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(this.time * 4) * 0.3})`;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText('Press A for the board list', cw / 2, ch * 0.85);
    }
  }
}
