// Game orchestration: lobby -> countdown -> race -> round results -> podium.
// Local competition: everyone races to the goal ring; finish order scores
// 5/3/2/1 points, most points after the last board wins.

import { Input, NEUTRAL } from './input.js';
import { Player, PLAYER_COLORS, CFG, CAT } from './player.js';
import { HEAD_STYLES, drawHead } from './heads.js';
import { Level } from './level.js';
import { LEVELS } from './levels.js';
import { Particles } from './particles.js';
import { sfx } from './audio.js';
import { clamp, lerp, TAU, roundRectPath } from './util.js';

const M = window.Matter;

const FINISH_WINDOW = 15;          // seconds others get once someone finishes
const POINTS = [5, 3, 2, 1];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.input.attach(window);

    this.state = 'lobby';
    this.roster = [null, null, null, null];   // {sourceId, headStyle}
    this.players = [];
    this.engine = null;
    this.level = null;
    this.levelIndex = 0;
    this.particles = new Particles();

    this.time = 0;
    this.raceTime = 0;
    this.finishCounter = 0;
    this.firstFinish = null;
    this.cd = 0;
    this.goFlash = 0;
    this.roundResults = null;
    this.roundEndT = 0;
    this.shake = 0;

    // audio unlock needs a real user gesture; pointer works for pad-only setups
    window.addEventListener('pointerdown', () => sfx.ensure());
    window.addEventListener('keydown', (e) => {
      sfx.ensure();
      if (e.code === 'KeyM') sfx.toggleMute();
      if (this.state === 'play' || this.state === 'pause') {
        if (e.code === 'KeyN') this.skipLevel();        // debug: next board
        if (e.code === 'KeyR') this.startLevel();       // restart board
      }
    });
  }

  // ------------------------------------------------------------- game flow

  beginMatch() {
    this.players = [];
    for (let i = 0; i < 4; i++) {
      if (!this.roster[i]) continue;
      const p = new Player(i, this.roster[i].sourceId, this.roster[i].headStyle);
      this.players.push(p);
    }
    if (!this.players.length) return;
    this.levelIndex = 0;
    this.startLevel();
    sfx.go();
  }

  startLevel() {
    this.engine = M.Engine.create({
      positionIterations: 8,
      velocityIterations: 6,
      constraintIterations: 4,
    });
    this.engine.gravity.y = 1.08;
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
    this.firstFinish = null;
    this.roundResults = null;
    this.shake = 0;
  }

  endRound() {
    const rows = [...this.players].sort((a, b) => {
      const ao = a.finishOrder < 0 ? 99 : a.finishOrder;
      const bo = b.finishOrder < 0 ? 99 : b.finishOrder;
      return ao - bo || a.slot - b.slot;
    }).map((p) => {
      const pts = p.finishOrder >= 0 ? (POINTS[p.finishOrder] || 1) : 0;
      p.score += pts;
      return { p, pts, finished: p.finishOrder >= 0, time: p.finishTime };
    });
    this.roundResults = rows;
    this.roundEndT = 0;
    this.state = 'roundEnd';
  }

  nextLevel() {
    this.levelIndex++;
    if (this.levelIndex >= LEVELS.length) this.state = 'podium';
    else this.startLevel();
  }

  skipLevel() {
    this.levelIndex = (this.levelIndex + 1) % LEVELS.length;
    this.startLevel();
  }

  toLobby() {
    this.state = 'lobby';
    this.engine = null;
    this.level = null;
    this.players = [];
  }

  controlsEnabled() { return this.state === 'play'; }

  addShake(n) { this.shake = Math.min(20, this.shake + n); }

  ctrlFor(p) { return this.input.get(p.sourceId) || NEUTRAL; }

  grabCandidates(me) {
    const arr = this.level.grabbables();
    for (const p of this.players) {
      if (p !== me && p.state === 'alive') arr.push(p.body);
    }
    return arr;
  }

  // ------------------------------------------------------------------ step

  step(dt) {
    this.time += dt;
    const states = this.input.poll();
    if (this.input.anyActivity) sfx.ensure();

    switch (this.state) {
      case 'lobby': this.lobbyStep(states); break;

      case 'countdown': {
        this.physicsStep(dt);
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

        // finish window countdown once somebody is home
        if (this.firstFinish !== null &&
            this.raceTime - this.firstFinish >= FINISH_WINDOW) {
          this.endRound();
          break;
        }
        for (const s of states) {
          if (s.pressed.start && this.isJoined(s.id)) { this.state = 'pause'; break; }
        }
        break;
      }

      case 'pause': {
        for (const s of states) {
          if (!this.isJoined(s.id)) continue;
          if (s.pressed.start) this.state = 'play';
          else if (s.pressed.x) this.startLevel();
          else if (s.pressed.back) this.toLobby();
        }
        break;
      }

      case 'roundEnd': {
        this.roundEndT += dt;
        this.particles.update(dt);
        if (this.roundEndT > 0.8) {
          for (const s of states) {
            if ((s.pressed.a || s.pressed.start) && this.isJoined(s.id)) { this.nextLevel(); break; }
          }
        }
        break;
      }

      case 'podium': {
        for (const s of states) {
          if ((s.pressed.a || s.pressed.start) && this.isJoined(s.id)) { this.toLobby(); break; }
        }
        break;
      }
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

      // goal
      const goal = this.level.goal;
      if (Math.hypot(pos.x - goal.x, pos.y - goal.y) < goal.r + 10) {
        p.finish(this);
        if (this.firstFinish === null) this.firstFinish = this.raceTime;
        if (this.players.every((q) => q.state === 'finished')) { this.endRound(); return; }
      }
    }

    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - 60 * dt);
  }

  // ----------------------------------------------------------------- lobby

  isJoined(sourceId) {
    return this.roster.some((r) => r && r.sourceId === sourceId);
  }

  lobbyStep(states) {
    for (const s of states) {
      const slotIdx = this.roster.findIndex((r) => r && r.sourceId === s.id);
      if (slotIdx === -1) {
        if (s.pressed.a) {
          const free = this.roster.findIndex((r) => !r);
          if (free !== -1) {
            this.roster[free] = { sourceId: s.id, headStyle: free % HEAD_STYLES.length };
            sfx.join();
          }
        }
      } else {
        const slot = this.roster[slotIdx];
        if (s.pressed.b || s.pressed.back) { this.roster[slotIdx] = null; sfx.leave(); continue; }
        if (s.pressed.dl) { slot.headStyle = (slot.headStyle + HEAD_STYLES.length - 1) % HEAD_STYLES.length; sfx.uiTick(); }
        if (s.pressed.dr) { slot.headStyle = (slot.headStyle + 1) % HEAD_STYLES.length; sfx.uiTick(); }
        if (s.pressed.start) { this.beginMatch(); return; }
      }
    }
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

    if (this.state === 'lobby') { this.drawLobby(ctx, cw, ch); return; }
    if (this.state === 'podium') { this.drawPodium(ctx, cw, ch); return; }
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

    this.drawHud(ctx, cw, ch);

    if (this.state === 'countdown') this.drawCountdown(ctx, cw, ch);
    if (this.goFlash > 0) this.drawGo(ctx, cw, ch);
    if (this.state === 'pause') this.drawPause(ctx, cw, ch);
    if (this.state === 'roundEnd') this.drawRoundEnd(ctx, cw, ch);
  }

  drawFinishedAtGoal(ctx) {
    const goal = this.level.goal;
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
    // level name (top-left)
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`BOARD ${this.levelIndex + 1}/${LEVELS.length}`, 16, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '900 21px system-ui, sans-serif';
    ctx.fillText(LEVELS[this.levelIndex].name, 16, 50);

    // race clock / finish window (top-center)
    ctx.textAlign = 'center';
    if (this.firstFinish !== null && this.state === 'play') {
      const left = Math.max(0, FINISH_WINDOW - (this.raceTime - this.firstFinish));
      ctx.fillStyle = left < 5 ? '#ff5d6c' : '#ffd94d';
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.fillText(left.toFixed(1), cw / 2, 38);
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('HURRY!', cw / 2, 56);
    } else if (this.state === 'play') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '900 24px system-ui, sans-serif';
      ctx.fillText(this.raceTime.toFixed(1), cw / 2, 34);
    }

    // score chips (top-right)
    let x = cw - 16;
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
    // level intro line
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
    this.veil(ctx, cw, ch, 0.55);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.fillText('PAUSED', cw / 2, ch * 0.4);
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('START resume    •    X restart board    •    BACK quit to lobby', cw / 2, ch * 0.5);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('keyboard: Esc resume • X restart • Backspace quit • M mute', cw / 2, ch * 0.56);
  }

  drawRoundEnd(ctx, cw, ch) {
    this.veil(ctx, cw, ch);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = '900 46px system-ui, sans-serif';
    ctx.fillText('ROUND OVER', cw / 2, ch * 0.2);
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
      const last = this.levelIndex >= LEVELS.length - 1;
      ctx.fillText(last ? 'Press A for final results' : 'Press A for the next board', cw / 2, ch * 0.85);
    }
  }

  drawPodium(ctx, cw, ch) {
    // simple dark backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, '#141830');
    grad.addColorStop(1, '#2a2145');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    const ranked = [...this.players].sort((a, b) => b.score - a.score || a.deaths - b.deaths);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = '900 56px system-ui, sans-serif';
    ctx.fillText('CHAMPION', cw / 2, ch * 0.16);
    if (ranked[0]) {
      const champ = ranked[0];
      const bob = Math.sin(this.time * 3) * 8;
      drawHead(ctx, cw / 2, ch * 0.32 + bob, 56, champ.color, champ.headStyle, { x: 0, y: -0.2 }, Math.sin(this.time * 5) * 0.15);
      ctx.fillStyle = '#fff';
      ctx.font = '900 34px system-ui, sans-serif';
      ctx.fillText(champ.name, cw / 2, ch * 0.32 + 100);
      // confetti rain
      if (Math.random() < 0.15) this.particles.confetti(Math.random() * cw, -10, 6);
      this.particles.update(1 / 60);
      this.particles.draw(ctx);
    }
    ranked.forEach((p, i) => {
      const y = ch * 0.55 + i * 44;
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillStyle = p.color.main;
      ctx.textAlign = 'right';
      ctx.fillText(p.name, cw / 2 - 30, y);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(`${p.score} pts   •   ${p.deaths} splats`, cw / 2 - 10, y);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(this.time * 4) * 0.3})`;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('Press A to return to the lobby', cw / 2, ch * 0.9);
  }

  drawLobby(ctx, cw, ch) {
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, '#141830');
    grad.addColorStop(1, '#233054');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd94d';
    ctx.font = `900 ${Math.min(96, cw * 0.08)}px system-ui, sans-serif`;
    ctx.fillText('SWINGERS', cw / 2, ch * 0.16);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('a grabby robot party game — up to 4 players', cw / 2, ch * 0.16 + 34);

    // slot cards
    const cardW = Math.min(230, cw / 4 - 24), cardH = cardW * 1.15;
    const total = cardW * 4 + 24 * 3;
    const x0 = cw / 2 - total / 2;
    const y0 = ch * 0.3;
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * (cardW + 24);
      const slot = this.roster[i];
      roundRectPath(ctx, x, y0, cardW, cardH, 18);
      ctx.fillStyle = slot ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = slot ? PLAYER_COLORS[i].main : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.textAlign = 'center';
      if (slot) {
        const src = this.input.get(slot.sourceId);
        const cxp = x + cardW / 2, cyp = y0 + cardH * 0.42;
        const r = cardW * 0.21;
        // waving preview arms driven by the sticks
        if (src) {
          ctx.strokeStyle = '#9aa3ba';
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          const armDef = [
            [src.l.mag ? src.l : { x: -0.5, y: 0.9 }, -1],
            [src.r.mag ? src.r : (src.l.mag ? src.l : { x: 0.5, y: 0.9 }), 1],
          ];
          for (const [v, side] of armDef) {
            const a = Math.atan2(v.y, v.x) + (v.mag ? side * 0.15 : 0);
            ctx.beginPath();
            ctx.moveTo(cxp + Math.cos(a + side * 0.5) * r * 0.7, cyp + Math.sin(a + side * 0.5) * r * 0.7);
            ctx.lineTo(cxp + Math.cos(a) * r * 2.1, cyp + Math.sin(a) * r * 2.1);
            ctx.stroke();
          }
        }
        const look = src && src.l.mag ? { x: src.l.x, y: src.l.y } : { x: 0, y: 0 };
        drawHead(ctx, cxp, cyp, r, PLAYER_COLORS[i], slot.headStyle, look, Math.sin(this.time * 2 + i) * 0.08);

        ctx.fillStyle = PLAYER_COLORS[i].main;
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.fillText('P' + (i + 1), cxp, y0 + cardH * 0.72);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = 'bold 15px system-ui, sans-serif';
        const styleName = HEAD_STYLES[slot.headStyle].name;
        ctx.fillText(`◀ ${styleName} ▶`, cxp, y0 + cardH * 0.82);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillText(slot.sourceId === 'keys' ? 'keyboard' : 'controller ' + slot.sourceId.slice(3), cxp, y0 + cardH * 0.92);
      } else {
        ctx.fillStyle = `rgba(255,255,255,${0.35 + Math.sin(this.time * 3 + i) * 0.15})`;
        ctx.font = 'bold 19px system-ui, sans-serif';
        ctx.fillText('PRESS  A', x + cardW / 2, y0 + cardH * 0.48);
        ctx.font = '14px system-ui, sans-serif';
        ctx.fillText('to join', x + cardW / 2, y0 + cardH * 0.56);
      }
    }

    // footer: start + controls
    ctx.textAlign = 'center';
    const anyJoined = this.roster.some(Boolean);
    if (anyJoined) {
      ctx.fillStyle = `rgba(255,217,77,${0.7 + Math.sin(this.time * 5) * 0.3})`;
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.fillText('PRESS START (or Esc) TO PLAY', cw / 2, ch * 0.78);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('connect Xbox controllers and press A — or press Enter for keyboard', cw / 2, ch * 0.78);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('STICKS wave arms  •  LT / RT grab (hold)  •  B punch  •  ◀ ▶ pick a face  •  B leave', cw / 2, ch * 0.86);
    ctx.fillText('keyboard: WASD + Arrows = arms  •  Shift-L/Q + Shift-R/E = grab  •  Space = punch  •  Enter = A', cw / 2, ch * 0.9);
  }
}
