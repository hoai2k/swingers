// VERSUS: every spider for themselves. Last one standing scores; first to
// settings.winScore wins the match. Boards rotate (or the one picked in the
// lobby). A weapon rests at every spawn when a round starts and more drop in.

import { BOARDS } from '../boards.js';
import { DropSpawner } from '../weapons.js';
import { settings } from '../settings.js';
import { sfx } from '../audio.js';
import { W, H } from '../board.js';
import { FONT, pick, TAU } from '../util.js';
import { castAt } from '../cast.js';
import { drawScoreboard, drawBanner, drawPlayerTags } from '../hud.js';
import { Squeeze } from '../squeeze.js';
import { applyRoundMods, applySpiderMods, tickMods, drawMods, drawModCards } from '../modifiers.js';
import { POOLS } from '../pool.js';

export class VsMode {
  constructor(game, opts = {}) {
    this.game = game;
    this.name = 'versus';
    this.friendlyFire = true;
    this.boardQueue = [];
    this.boardId = opts.board || settings.board;
    this.state = 'intro';     // intro | play | roundEnd | matchEnd
    this.t = 0;
    this.round = 0;
    this.lastWinner = null;
  }

  teamFor(p) { return 'p' + p.slot; }

  start() {
    for (const p of this.game.players) { p.score = 0; p.kills = 0; p.deaths = 0; }
    this.nextRound();
  }

  pickBoard() {
    if (this.boardId && this.boardId !== 'random') {
      const b = BOARDS.find((x) => x.id === this.boardId);
      if (b) return b;
    }
    if (!this.boardQueue.length) this.boardQueue = BOARDS.slice().sort(() => Math.random() - 0.5);
    return this.boardQueue.pop();
  }

  nextRound() {
    const game = this.game;
    this.round++;
    const def = this.pickBoard();
    const board = game.loadBoard(def);
    game.music.match(def.music);
    game.music.setDuck(1);
    this.mods = applyRoundMods(game);
    this.drops = new DropSpawner(game, board, settings.dropRate);
    const spawns = board.spawns.slice().sort(() => Math.random() - 0.5);
    game.players.forEach((p, i) => {
      const [x, y] = spawns[i % spawns.length];
      const sp = game.spawnSpider(p, x, y, { invuln: 1.5 });
      applySpiderMods(game, sp);
    });
    this.squeeze = new Squeeze(game);
    this.cards = this.introCards();
    // a weapon at every spawn location
    this.drops.seedSpawns(board.spawns);
    this.state = 'intro';
    this.t = 0;
    this.lastWinner = null;
    this.countdown = 3;
  }

  update(dt, realDt) {
    const game = this.game;
    this.t += realDt;
    if (this.state === 'intro') {
      // players can move during the countdown? No: hold them in place with stun
      for (const sp of game.spiders) sp.stun = 0.05;
      const c = Math.ceil(1.6 - this.t);
      if (c !== this.countdown && c > 0) { this.countdown = c; sfx.count(); }
      if (this.t >= 1.6) { this.state = 'play'; this.t = 0; sfx.go(); }
      return;
    }
    if (this.state === 'play') {
      this.drops.update(dt);
      tickMods(game, dt);
      this.squeeze.update(dt);
      const alive = game.spiders.filter((s) => s.alive);
      if (alive.length <= 1 && game.players.length > 1) {
        this.state = 'roundEnd'; this.t = 0;
        this.lastWinner = alive[0] || null;
        if (this.lastWinner && this.lastWinner.player) this.lastWinner.player.score++;
        sfx.win();
      } else if (game.players.length === 1 && alive.length === 0) {
        this.state = 'roundEnd'; this.t = 0; this.lastWinner = null;
      }
      return;
    }
    if (this.state === 'roundEnd') {
      if (this.t > 3.2) {
        const champ = game.players.find((p) => p.score >= settings.winScore);
        if (champ) { this.state = 'matchEnd'; this.t = 0; this.champ = champ; sfx.win(); }
        else this.nextRound();
      }
      return;
    }
    if (this.state === 'matchEnd') {
      for (const p of game.players) {
        const s = game.input.get(p.inputId);
        if (this.t > 2 && s && (s.pressed.a || s.pressed.start)) { game.go('lobby'); return; }
      }
    }
  }

  onSpiderKilled(sp, info) {
    const game = this.game;
    const alive = game.spiders.filter((s) => s.alive);
    if (alive.length === 1 && settings.slowmo && this.state === 'play') game.slowmo(0.3, 0.9);
  }

  // the round intro's rule cards: the Squeeze, a restricted weapon pool, modifiers
  introCards() {
    const extra = [];
    const sq = this.squeeze;
    if (sq.active) extra.push({ id: 'squeeze', name: sq.isStatic ? 'Hot Edges' : `Squeeze ${Math.round(sq.delay)}s`, color: '#ff46c8' });
    if (settings.weaponPool && settings.weaponPool !== 'everything') {
      const o = POOLS.find((q) => q[0] === settings.weaponPool);
      extra.push({ id: 'pool', name: o ? o[1] : settings.weaponPool, color: '#ffcf4a' });
    }
    return { extra, mods: this.mods || [] };
  }

  draw(ctx) {
    drawMods(ctx, this.game);
    if (this.squeeze && (this.state !== 'intro' || this.squeeze.isStatic)) this.squeeze.draw(ctx);
  }

  drawUI(ctx) {
    const game = this.game;
    drawPlayerTags(ctx, game);
    drawScoreboard(ctx, game, { compact: this.state === 'play' });
    if (this.state === 'play' && this.squeeze) this.squeeze.drawUI(ctx);
    const c = this.cards;
    if (c && (this.state === 'intro' || (this.state === 'play' && this.t < 2.5))) {
      const a = this.state === 'intro' ? Math.min(1, this.t * 3) : Math.min(1, (2.5 - this.t) / 0.6);
      drawModCards(ctx, c.mods, W / 2, 330, { alpha: a, extra: c.extra });
    }
    if (this.state === 'intro') {
      drawBanner(ctx, this.round === 1 ? game.board.name : `Round ${this.round}`, game.board.def.tagline || '', Math.min(1, this.t * 3));
    } else if (this.state === 'roundEnd') {
      const w = this.lastWinner;
      const txt = w ? `${castAt(w.castIndex).name} wins the round!` : 'Nobody survived!';
      drawBanner(ctx, txt, w ? `${w.player.color.name} — ${w.player.score} / ${settings.winScore}` : '', Math.min(1, this.t * 3), w ? w.color.main : '#fff');
      drawScoreboard(ctx, game, { big: true, highlight: w && w.player });
    } else if (this.state === 'matchEnd') {
      drawBanner(ctx, `${castAt(this.champ.castIndex).name} WINS THE MATCH!`, 'Press A to return to the lobby', 1, this.champ.color.main);
      drawScoreboard(ctx, game, { big: true, highlight: this.champ, stats: true });
    }
  }
}
