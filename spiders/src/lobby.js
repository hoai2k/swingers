// The lobby: press A on any controller (or Space / click on the keyboard)
// to drop in a spider. Swing to an island to pick what to play: everyone
// standing on the same island for a moment starts it.
//   D-pad left/right (or Z/X): change character   Back (Backspace): leave

import { island, blob, capsule } from './shapes.js';
import { W, H } from './board.js';
import { sfx } from './audio.js';
import { text, drawPlayerTags } from './hud.js';
import { castAt } from './cast.js';
import { DropSpawner } from './weapons.js';
import { TAU, rgba } from './util.js';

export const LOBBY_BOARD = {
  id: 'lobby',
  name: 'Lobby',
  theme: 'night',
  solids: [
    { poly: island(960, 860, 620, 200, { seed: 11 }) },        // hub
    { poly: island(260, 470, 300, 120, { seed: 12 }) },        // versus
    { poly: island(1660, 470, 300, 120, { seed: 13 }) },       // survival
    { poly: blob(960, 300, 120, 46, { seed: 14 }) },           // swing rock
  ],
  spawns: [[760, 800], [860, 800], [960, 800], [1060, 800], [1160, 800], [810, 780], [1110, 780], [960, 760]],
  decor: [{ type: 'motes', n: 50, color: 'rgba(200,210,255,0.35)' }],
};

export const ISLANDS = [
  { id: 'versus', label: 'VERSUS', sub: 'last spider standing', x: 110, y: 330, w: 300, h: 150, color: '#ff5a7a' },
  { id: 'survival', label: 'SURVIVAL', sub: 'hold off the waves together', x: 1510, y: 330, w: 300, h: 150, color: '#5ad1ff' },
];

export class Lobby {
  constructor(game, opts = {}) {
    this.game = game;
    this.zone = null;
    this.zoneT = 0;
    this.respawn = new Map();
  }

  teamFor(p) { return 'p' + p.slot; }
  get friendlyFire() { return true; }

  start() {
    const game = this.game;
    const board = game.loadBoard(LOBBY_BOARD);
    game.music.menu();
    for (const p of game.players) this.spawn(p);
    this.drops = new DropSpawner(game, board, 'off');
    this.drops.seedSpawns([[700, 800], [1220, 800]]);
  }

  spawn(p) {
    const b = this.game.board;
    const [x, y] = b.spawns[p.slot % b.spawns.length];
    this.game.spawnSpider(p, x, y - 40, { invuln: 1 });
  }

  update(dt) {
    const game = this.game;
    // joining
    for (const s of game.input.states) {
      const p = game.players.find((q) => q.inputId === s.id);
      if (!p) {
        if (s.pressed.a || s.pressed.start || (s.kind === 'keyboard' && s.anyPressed)) {
          const np = game.addPlayer(s.id);
          if (np) this.spawn(np);
        }
        continue;
      }
      if (s.pressed.dl) game.cycleCast(p, -1);
      if (s.pressed.dr || s.pressed.y) game.cycleCast(p, 1);
      if (s.pressed.back) { game.removePlayer(p); continue; }
      if (s.pressed.start && game.players.length) { this.game.go('title'); return; }
    }
    // respawn the fallen
    for (const p of game.players) {
      if (p.spider && p.spider.alive) continue;
      const t = (this.respawn.get(p) || 0) + dt;
      this.respawn.set(p, t);
      if (t > 1.2) { this.respawn.delete(p); this.spawn(p); }
    }
    // keep a couple of toys around
    if (game.pickups.filter((q) => !q.spent).length < 2 && Math.random() < dt * 0.3) this.drops.dropOne(700 + Math.random() * 520);
    // islands
    const alive = game.players.map((p) => p.spider).filter((s) => s && s.alive);
    let zone = null;
    if (alive.length) {
      for (const z of ISLANDS) {
        if (alive.every((s) => s.x > z.x && s.x < z.x + z.w && s.y > z.y && s.y < z.y + z.h)) zone = z;
      }
    }
    if (zone !== this.zone) { this.zone = zone; this.zoneT = 0; }
    if (zone) {
      const prev = this.zoneT;
      this.zoneT += dt;
      if (Math.floor(prev) !== Math.floor(this.zoneT)) sfx.count();
      if (this.zoneT >= 3) { sfx.go(); game.go(zone.id); }
    }
  }

  drawBack(ctx) {
    for (const z of ISLANDS) {
      const active = this.zone === z;
      ctx.save();
      const cx = z.x + z.w / 2;
      text(ctx, z.label, cx, z.y + 10, { size: 52, color: z.color });
      text(ctx, z.sub, cx, z.y + 44, { size: 22, color: '#dfe6ff' });
      if (active) {
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(cx, z.y + 95, 34, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, this.zoneT / 3)); ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawUI(ctx) {
    const game = this.game;
    drawPlayerTags(ctx, game);
    if (!game.players.length) {
      text(ctx, 'Press A to join', W / 2, 560, { size: 56 });
      text(ctx, 'up to 8 controllers  ·  keyboard: Space', W / 2, 610, { size: 26, color: '#cfd6ff' });
    } else {
      text(ctx, 'Swing to an island to choose a mode', W / 2, 90, { size: 34 });
      text(ctx, 'LT web · RT use · A jump · RB throw · D-pad change spider · more players: press A', W / 2, 130, { size: 22, color: '#cfd6ff' });
    }
    // player cards
    const n = 8, cw = 210, x0 = W / 2 - (n * cw) / 2;
    for (let i = 0; i < n; i++) {
      const p = game.players.find((q) => q.slot === i);
      const x = x0 + i * cw + cw / 2, y = 1040;
      ctx.fillStyle = p ? rgba(p.color.main, 0.25) : 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.roundRect(x - cw / 2 + 6, y - 46, cw - 12, 60, 14); ctx.fill();
      if (p) text(ctx, `P${i + 1} ${castAt(p.castIndex).name}`, x, y - 6, { size: 24, color: p.color.main });
      else text(ctx, 'press A', x, y - 6, { size: 20, color: 'rgba(255,255,255,0.35)' });
    }
  }
}
