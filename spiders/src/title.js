// Boot (loading bar) and the start screen.

import { W, H } from './board.js';
import { text } from './hud.js';
import { loadProgress } from './preload.js';
import { CAST, drawBody } from './cast.js';
import { TAU } from './util.js';
import { sfx } from './audio.js';

export class Boot {
  constructor(game) { this.game = game; this.t = 0; }
  update(dt, real) {
    this.t += real;
    if (loadProgress() >= 1 && this.t > 0.3) this.game.go('title');
  }
  drawUI(ctx) {
    ctx.fillStyle = '#070914'; ctx.fillRect(0, 0, W, H);
    text(ctx, 'SPIDER SWINGERS', W / 2, H / 2 - 40, { size: 72, color: '#fff' });
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(W / 2 - 300, H / 2 + 20, 600, 14);
    ctx.fillStyle = '#ff5a7a';
    ctx.fillRect(W / 2 - 300, H / 2 + 20, 600 * loadProgress(), 14);
  }
}

export class Title {
  constructor(game) { this.game = game; this.t = 0; }
  start() { this.game.board = null; this.game.music.menu(); }
  update(dt, real) {
    this.t += real;
    if (this.t < 0.4) return;
    for (const s of this.game.input.states) {
      if (s.anyPressed) { sfx.uiOk(); this.game.go('lobby'); return; }
    }
  }
  drawUI(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#2a2f6a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    text(ctx, 'SPIDER SWINGERS', W / 2, 400, { size: 130 });
    if (Math.floor(this.t * 2) % 2 === 0) text(ctx, 'Press any button', W / 2, 700, { size: 44 });
    CAST.slice(0, 8).forEach((c, i) => drawBody(ctx, 360 + i * 170, 900 + Math.sin(this.t * 3 + i) * 10, 40, i, {}));
  }
}
