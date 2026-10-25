// Arcade UI: the per-player cabinet panel (ui.setPanel; captures that device)
// and the Paddle Ball invite prompt shown in an invited player's view.
import { PLAYER_CSS } from '../config.js';
import { promptRow, deviceKind, glyph } from '../glyphs.js';
import { injectCSS } from '../map.js';
import { highScores, paddleWins } from './index.js';

const CSS = `
.ppanel.arcade { background: radial-gradient(ellipse at 50% 40%, rgba(40,10,80,.86), rgba(5,2,18,.94)); pointer-events: auto; flex-direction: row; gap: calc(18px * var(--s,1)); }
.arcab { display: flex; flex-direction: column; align-items: center; gap: calc(8px * var(--s,1)); animation: cardin .3s cubic-bezier(.3,1.6,.5,1); }
.armarq { font: 900 calc(28px * var(--s,1)) "Trebuchet MS", sans-serif; letter-spacing: .1em; color: #fff; text-shadow: 0 0 6px var(--neon), 0 0 16px var(--neon), 0 0 30px var(--neon); white-space: nowrap; display: flex; align-items: center; gap: .5em; }
.armarq .who { font-size: .5em; letter-spacing: 0; padding: .15em .6em; border-radius: 1em; background: var(--acc); color: var(--fg); text-shadow: none; }
.arscreen { background: #000; border: calc(8px * var(--s,1)) solid #15151f; border-radius: calc(14px * var(--s,1)); box-shadow: 0 0 0 3px var(--neon), 0 0 34px var(--neon); line-height: 0; position: relative; }
.arscreen canvas { display: block; image-rendering: pixelated; cursor: pointer; }
.arscreen .arx { position: absolute; right: -14px; top: -14px; width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #222; font: 900 16px/28px sans-serif; text-align: center; cursor: pointer; box-shadow: 0 3px 0 rgba(0,0,0,.3); }
.arfoot { color: #dde; font-weight: 800; font-size: calc(14px * var(--s,1)); display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 0; text-shadow: 0 2px 0 rgba(0,0,0,.4); }
.arside { color: #fff; font-weight: 800; font-size: calc(14px * var(--s,1)); min-width: calc(170px * var(--s,1)); max-width: calc(220px * var(--s,1)); box-sizing: border-box; background: rgba(0,0,0,.45); border: 2px solid var(--neon); border-radius: calc(14px * var(--s,1)); padding: calc(10px * var(--s,1)) calc(14px * var(--s,1)); }
.arside h3 { margin: 0 0 .5em; text-align: center; color: var(--neon); letter-spacing: .1em; font-size: 1.05em; }
.arside .row { display: flex; justify-content: space-between; gap: 1em; padding: .18em 0; font-family: "Courier New", monospace; }
.arside .row.me { color: #ffe03a; }
.arside .tip { margin-top: .8em; font-size: .8em; opacity: .75; font-weight: 700; line-height: 1.35; }
.arinvite { position: absolute; z-index: 15; transform: translateX(-50%); background: #fff; color: #234; font-weight: 800; font-size: 15px; padding: 10px 16px 12px; border-radius: 18px;
  box-shadow: 0 5px 0 rgba(0,0,0,.25), 0 0 0 4px var(--acc); text-align: center; pointer-events: auto; cursor: pointer; animation: toastin .35s cubic-bezier(.3,1.7,.5,1); white-space: nowrap; }
.arinvite .q { display: flex; gap: 6px; justify-content: center; margin-top: 6px; }
.arinvite .bar { height: 4px; border-radius: 2px; background: #dde4f2; margin-top: 8px; overflow: hidden; }
.arinvite .bar i { display: block; height: 100%; background: var(--acc); }
`;
let cssDone = false;
const css = () => { if (!cssDone) { injectCSS(CSS); cssDone = true; } };
const textCol = (c) => (c === 0xffffff || c === 0xffc233 || c === 0x3fe0d0) ? '#234' : '#fff';

export class ArcadePanel {
  constructor(ui, player, mgr, cab, slot) {
    css();
    this.ui = ui; this.p = player; this.mgr = mgr; this.cab = cab; this.slot = slot; this.kind = 'arcade';
    this.t0 = performance.now();
    const G = cab.Game, m = cab.machine, k = deviceKind(player.deviceId);
    this.el = document.createElement('div');
    this.el.className = 'ppanel arcade';
    this.el.style.setProperty('--neon', G.color);
    this.el.style.setProperty('--acc', PLAYER_CSS(player.color));
    this.el.style.setProperty('--fg', textCol(player.color));
    const fire = G.id === 'chomp' ? [] : G.id === 'paddle' ? [] : [['A', 'Fire']];
    const move = G.id === 'paddle' ? 'Paddle' : G.id === 'chomp' ? 'Steer' : 'Move';
    const side = slot === 1 ? 'right' : 'left';
    this.el.innerHTML = `<div class="arcab">
        <div class="armarq">${G.title}<span class="who">P${player.index + 1}${G.slots > 1 ? ' · ' + side : ''}</span></div>
        <div class="arscreen"><canvas></canvas><div class="arx" title="Leave">✕</div></div>
        <div class="arfoot">${promptRow([['LS', move], ...fire, ['MENUBACK', 'Leave']], k)}</div>
      </div><div class="arside"></div>`;
    this.canvas = this.el.querySelector('canvas');
    this.canvas.width = m.W * 2; this.canvas.height = m.H * 2;
    this.g = this.canvas.getContext('2d');
    this.side = this.el.querySelector('.arside');
    this.canvas.addEventListener('pointerdown', (e) => { const s = cab.session; if (s) s.click[this.slot] = true; e.preventDefault(); });
    this.el.querySelector('.arx').addEventListener('click', () => this.close());
    ui.hud.appendChild(this.el);
    mgr.panels.add(this);
    this.sideKey = '';
    ui.sfx('uiOpen');
  }
  remove() {
    this.el.remove();
    this.mgr.panels.delete(this);
    this.mgr.leave(this.p, this.cab);
  }
  close() { this.ui.sfx('uiBack'); this.ui.closePanel(this.p); }
  input(n) {
    if (performance.now() - this.t0 < 250) return;
    if (n.back || n.start) this.close();
  }
  draw() {}
  place(rect) {
    const [x, y, w, h] = rect, m = this.cab.machine;
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    const s = Math.max(0.45, Math.min(1.25, Math.min(w / 760, h / 620)));
    this.el.style.setProperty('--s', s.toFixed(3));
    const showSide = w > 560;
    this.side.style.display = showSide ? '' : 'none';
    const availW = w - 40 - (showSide ? 210 * s : 0), availH = h - 110 * s - 20;
    const k = Math.max(0.5, Math.min(availW / m.W, availH / m.H));
    const cw = Math.round(m.W * k), ch = Math.round(m.H * k);
    if (cw !== this.cw || ch !== this.ch) { this.cw = cw; this.ch = ch; this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px'; }
    this.sideHTML(showSide);
  }
  // copy the cabinet's frame (index.js paints it every frame while someone plays)
  blit() { this.g.drawImage(this.cab.canvas, 0, 0); }
  sideHTML(show) {
    if (!show) return;
    const G = this.cab.Game, k = deviceKind(this.p.deviceId);
    let key, html;
    if (G.slots > 1) {
      const wins = paddleWins();
      key = 'p' + wins;
      html = `<h3>PADDLE BALL</h3><div class="row"><span>Wins vs CPU</span><span>${wins}</span></div>
        <div class="tip">First to 11. Where the ball meets your paddle sets the angle.<br>Another player can join by pressing ${glyph('Y', k)} at the cabinet.<br>Beat the CPU: +10 coins</div>`;
    } else {
      const list = highScores(G.id);
      key = list.map((e) => e.s + e.p).join();
      const rows = [0, 1, 2, 3, 4].map((i) => { const e = list[i]; return `<div class="row ${e && e.p === 'P' + (this.p.index + 1) ? 'me' : ''}"><span>${i + 1}. ${e ? e.p : '--'}</span><span>${e ? String(e.s).padStart(6, '0') : '------'}</span></div>`; }).join('');
      const tip = { chomp: 'Eat every dot. Power pellets turn the ghosts blue: eat them for 200, 400, 800, 1600!', raiders: 'Shoot the raiders before they land. Shields crumble. Hit the saucer for a bonus.', bugs: 'Shot segments turn into mushrooms and split the bug. Watch out for the spider!' }[G.id];
      html = `<h3>HIGH SCORES</h3>${rows}<div class="tip">${tip}</div>`;
    }
    key += k;
    if (key === this.sideKey) return;
    this.sideKey = key; this.side.innerHTML = html;
  }
}

// "P1 invites you to PADDLE BALL" in the invited player's own view.
export class InvitePrompt {
  constructor(ui, to, from, title, answer) {
    css();
    this.ui = ui; this.to = to;
    const k = deviceKind(to.deviceId);
    this.el = document.createElement('div');
    this.el.className = 'arinvite';
    this.el.style.setProperty('--acc', PLAYER_CSS(from.color));
    this.el.innerHTML = `<b style="color:${PLAYER_CSS(from.color === 0xffffff ? 0x2a62c9 : from.color)}">P${from.index + 1}</b> invites you to <b>${title}</b>!
      <div class="q">${promptRow([['Y', 'Join'], ['B', 'No thanks']], k)}</div><div class="bar"><i></i></div>`;
    this.el.addEventListener('click', (e) => { e.stopPropagation(); answer(true); });
    this.bar = this.el.querySelector('.bar i');
    ui.hud.appendChild(this.el);
    ui.sfx('toast');
  }
  update(frac) {
    const g = this.ui.game, i = g.players.indexOf(this.to);
    if (i < 0) return;
    const [x, y, w, h] = g.views()[i];
    Object.assign(this.el.style, { left: x + w / 2 + 'px', top: y + Math.max(70, h * 0.2) + 'px' });
    this.bar.style.width = (Math.max(0, frac) * 100).toFixed(1) + '%';
  }
  remove() { this.el.remove(); }
}
