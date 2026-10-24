// The global overlay that runs above every scene (game.overlay, ticked at the
// top of game.step and drawn after the scene's UI):
//  - pause menu: Start on a joined controller (or Esc) during a match or in
//    the lobby. Resume / Settings / How to play / Quit, navigable with the
//    D-pad or stick + A/B (the menus themselves are DOM, see ui.js).
//  - any open DOM menu pauses the game (corner gear/help buttons too).
//  - "controller disconnected" notices: a match pauses when a joined pad
//    vanishes; in the lobby the player is dropped after a grace period.

import { W, H } from './board.js';
import { settingsMenu, helpMenu } from './ui.js';
import { text } from './hud.js';
import { castAt } from './cast.js';
import { rgba } from './util.js';
import { sfx } from './audio.js';

const MATCH_SCENES = ['versus', 'survival'];
const NO_PAUSE_STATES = ['matchEnd', 'gameOver', 'over', 'results'];
const LOBBY_DROP_AFTER = 10;   // s a disconnected pad keeps its lobby spider

export class Overlay {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.lastStates = null;
    this.uiPaused = false;
    this.missing = new Map();   // player -> seconds disconnected
    this.t = 0;
    ui.onChange = () => this.sync();
  }

  get inMatch() { return MATCH_SCENES.includes(this.game.sceneName) || !!(this.game.scene && this.game.scene.pausable); }
  get canPause() {
    const g = this.game;
    if (!g.scene || !(this.inMatch || g.sceneName === 'lobby')) return false;
    if (g.scene.canPause) return g.scene.canPause();
    return !NO_PAUSE_STATES.includes(g.scene.state);
  }

  // open menus <-> game.paused
  sync() {
    const g = this.game;
    if (this.ui.open) {
      if (!this.uiPaused && g.scene && g.sceneName !== 'boot') { this.uiPaused = true; g.paused = true; g.music.setDuck(0.35); this.sceneAtOpen = g.scene; }
    } else if (this.uiPaused) {
      this.uiPaused = false;
      g.paused = false;
      g.music.setDuck(1);
      this.consume();
    }
  }

  // swallow this poll's button edges so the button that closed a menu
  // doesn't also jump / fire / join
  consume() {
    for (const s of this.game.input.states) {
      if (!s.pressed) continue;
      for (const k in s.pressed) s.pressed[k] = false;
      s.anyPressed = false;
    }
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    const states = g.input.states;
    const fresh = states !== this.lastStates;   // edges are handled once per poll
    this.lastStates = states;
    this.checkPads(dt);
    // a scene change (quit to lobby, mode start) closes whatever was open
    if (this.ui.open && this.sceneAtOpen && this.sceneAtOpen !== g.scene) { this.ui.closeAll(); }
    if (this.ui.open) {
      if (!this.uiPaused) this.sync();
      if (fresh) {
        this.ui.navigate(states, dt, { isEnter: () => g.input.keys.has('Enter') || g.input.keys.has('NumpadEnter') });
        this.consume();
      }
      return;
    }
    if (this.uiPaused) this.sync();
    if (!fresh || !this.canPause) return;
    for (const s of states) {
      if (!s.pressed || !s.pressed.start) continue;
      const joined = g.players.some((p) => p.inputId === s.id);
      // in the lobby anyone may open it; in a match only players (and the keyboard)
      if (joined || g.sceneName === 'lobby' || s.kind === 'keyboard') { this.openPause(); this.consume(); return; }
    }
  }

  openPause(sub) {
    const g = this.game;
    if (this.ui.open) return;
    const lobby = g.sceneName === 'lobby';
    const resume = () => this.ui.closeAll();
    this.sceneAtOpen = g.scene;
    sfx.uiOk();
    this.ui.push({
      id: 'pause',
      title: lobby ? 'Menu' : 'Paused',
      sub: sub || (lobby ? '' : this.matchLine()),
      startCloses: true,
      onBack: resume,
      items: [
        { type: 'action', label: 'Resume', run: resume },
        { type: 'action', label: 'Settings', run: () => this.ui.push(settingsMenu()) },
        { type: 'action', label: 'How to play', run: () => this.ui.push(helpMenu()) },
        lobby
          ? { type: 'action', label: 'Back to title', danger: true, run: () => { this.ui.closeAll(); g.go('title'); } }
          : { type: 'action', label: 'Quit to lobby', danger: true, run: () => { this.ui.closeAll(); g.go('lobby'); } },
      ],
    });
  }

  matchLine() {
    const g = this.game;
    const s = g.scene;
    if (g.sceneName === 'versus' && s) return `${g.board ? g.board.name : ''} · round ${s.round || 1}`;
    if (g.sceneName === 'challenge' && s && s.trial) return `Trial: ${s.trial.name}${s.wave ? ' · wave ' + s.waveInStage + '/3' : ''}`;
    if (g.sceneName === 'survival' && s) return `${g.board ? g.board.name : ''}${s.wave ? ' · wave ' + s.wave : ''}`;
    return '';
  }

  // ---- controller disconnects --------------------------------------------------
  // Only real gamepads ('pad0'..'pad7') can disconnect; the keyboard can't.
  checkPads(dt) {
    const g = this.game;
    const ids = new Set(g.input.states.map((s) => s.id));
    for (const p of g.players) {
      const isPad = /^pad\d+$/.test(p.inputId || '');
      const gone = isPad && !ids.has(p.inputId);
      if (!gone) { if (this.missing.has(p)) { this.missing.delete(p); sfx.join(); } continue; }
      const t = (this.missing.get(p) || 0) + dt;
      if (!this.missing.has(p)) {
        sfx.leave();
        if (this.inMatch && this.canPause && !this.ui.open) this.openPause(`P${p.slot + 1} controller disconnected`);
      }
      this.missing.set(p, t);
      if (g.sceneName === 'lobby' && t > LOBBY_DROP_AFTER && !g.paused) { this.missing.delete(p); g.removePlayer(p); }
    }
    for (const p of [...this.missing.keys()]) if (!g.players.includes(p)) this.missing.delete(p);
  }

  drawUI(ctx) {
    if (!this.missing.size) return;
    const g = this.game;
    let i = 0;
    for (const [p, t] of this.missing) {
      const y = H - 150 - i * 64;
      const msg = `P${p.slot + 1} (${castAt(p.castIndex).name}) controller disconnected`;
      const sub = g.sceneName === 'lobby' ? `reconnect within ${Math.max(0, Math.ceil(LOBBY_DROP_AFTER - t))}s to keep your spider` : 'reconnect it to keep playing';
      ctx.save();
      const w = 820;
      ctx.fillStyle = 'rgba(12,8,24,0.86)';
      ctx.beginPath(); ctx.roundRect(W / 2 - w / 2, y - 34, w, 56, 28); ctx.fill();
      ctx.strokeStyle = rgba(p.color.main, 0.5 + 0.4 * Math.sin(this.t * 6));
      ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#ffcf4a';
      ctx.beginPath(); ctx.moveTo(W / 2 - w / 2 + 34, y - 18); ctx.lineTo(W / 2 - w / 2 + 52, y + 14); ctx.lineTo(W / 2 - w / 2 + 16, y + 14); ctx.closePath(); ctx.fill();
      text(ctx, '!', W / 2 - w / 2 + 34, y + 11, { size: 22, color: '#1a1030', stroke: null });
      text(ctx, msg, W / 2 - w / 2 + 70, y - 2, { size: 24, align: 'left', color: p.color.main, sw: 4 });
      text(ctx, sub, W / 2 - w / 2 + 70, y + 16, { size: 16, align: 'left', color: '#cfd6ff', stroke: null });
      ctx.restore();
      i++;
    }
  }
}
