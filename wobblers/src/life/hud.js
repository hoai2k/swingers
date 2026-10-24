// Coin counter in the corner of every split-screen view, floating "+5" text
// over whoever earned coins (in their own view), and a full-view fade used by
// the bed. ui.update(views) calls update(views) every frame.
import * as THREE from 'three';
import { injectCSS } from '../map.js';
import { life } from './state.js';

const CSS = `
.coinpill { position: absolute; display: flex; align-items: center; gap: 6px; transform: translateX(-100%); padding: 3px 12px 4px 6px; border-radius: 0 0 0 14px;
  background: rgba(20,30,60,.55); color: #ffe36a; font-weight: 900; font-size: 17px; text-shadow: 0 1px 0 rgba(0,0,0,.45); white-space: nowrap; transform-origin: 100% 0; }
.coinpill.small { font-size: 13px; padding: 2px 9px 3px 5px; }
.coinpill.bump { animation: coinbump .35s cubic-bezier(.3,1.8,.5,1); }
.coinpill.shake { animation: coinshake .35s; color: #ff8a8a; }
@keyframes coinbump { 40% { transform: translateX(-100%) scale(1.35); } }
@keyframes coinshake { 20%,60% { transform: translateX(calc(-100% - 6px)); } 40%,80% { transform: translateX(calc(-100% + 6px)); } }
.coinic { width: 1.05em; height: 1.05em; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff6b0 0 18%, #ffd23f 30%, #e8a20c 75%); box-shadow: inset 0 0 0 2px #c98a0a; display: inline-block; flex: none; }
.coinfloat { position: absolute; transform: translate(-50%, -100%); font-weight: 900; font-size: 22px; color: #ffe36a; white-space: nowrap; pointer-events: none;
  text-shadow: 0 2px 0 #a86a00, 0 0 6px rgba(0,0,0,.4); display: flex; align-items: center; gap: 4px; }
.coinfloat.neg { color: #ff9a9a; text-shadow: 0 2px 0 #8a2020, 0 0 6px rgba(0,0,0,.4); }
.coinfloat small { font-size: 13px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.7); margin-left: 4px; }
.coinfloat.small { font-size: 15px; } .coinfloat.small small { font-size: 10px; }
.viewfade { position: absolute; background: #0a1030; opacity: 0; transition: opacity .6s; pointer-events: none; display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 900; font-size: 30px; }
.viewfade.on { opacity: .92; }
`;

const fmt = (n) => n.toLocaleString('en-US');
const _v = new THREE.Vector3();

export class LifeHud {
  constructor(game) {
    injectCSS(CSS);
    this.game = game;
    this.pills = new Map();   // player -> { el, shown }
    this.floats = [];         // { el, player, amount, reason, t }
    this.fades = new Map();   // player -> { el, t }
  }

  pill(p) {
    let r = this.pills.get(p);
    if (!r) {
      const el = document.createElement('div');
      el.className = 'coinpill';
      el.innerHTML = '<i class="coinic"></i><b></b>';
      this.game.ui.hud.appendChild(el);
      r = { el, b: el.querySelector('b'), shown: null };
      this.pills.set(p, r);
    }
    return r;
  }
  bump(cls = 'bump') {
    for (const r of this.pills.values()) { r.el.classList.remove('bump', 'shake'); void r.el.offsetWidth; r.el.classList.add(cls); }
  }
  shake() { this.bump('shake'); }

  // "+amount reason" rising over player (all views when player is null).
  floater(player, amount, reason = '') {
    const now = performance.now() / 1000;
    // coins picked up in a quick run add up in one floater
    const f0 = this.floats.find((f) => f.player === player && f.reason === reason && now - f.t < 0.7 && Math.sign(f.amount) === Math.sign(amount));
    if (f0) { f0.amount += amount; f0.t = now; f0.dirty = true; return; }
    const el = document.createElement('div');
    el.className = 'coinfloat' + (amount < 0 ? ' neg' : '');
    this.game.ui.hud.appendChild(el);
    this.floats.push({ el, player, amount, reason, t: now, dirty: true });
    if (amount > 0) this.bump();
  }

  // Dark fade over one player's view for `sec` seconds with a caption.
  fade(p, text, sec = 2) {
    let r = this.fades.get(p);
    if (!r) { const el = document.createElement('div'); el.className = 'viewfade'; this.game.ui.hud.appendChild(el); r = { el }; this.fades.set(p, r); }
    r.el.textContent = text; r.until = performance.now() / 1000 + sec;
    requestAnimationFrame(() => r.el.classList.add('on'));
  }

  update(views) {
    const g = this.game, ps = g.players, now = performance.now() / 1000;
    for (const [p, r] of this.pills) if (!ps.includes(p)) { r.el.remove(); this.pills.delete(p); }
    for (const [p, r] of this.fades) if (!ps.includes(p)) { r.el.remove(); this.fades.delete(p); }
    ps.forEach((p, i) => {
      const v = views[i]; if (!v) return;
      const [x, y, w, h] = v, r = this.pill(p);
      const small = w < 500 || h < 300;
      if (r.shown !== life.coins) { r.b.textContent = fmt(life.coins); r.shown = life.coins; }
      r.el.classList.toggle('small', small);
      // hidden under full-view panels except the shop (which shows the price list)
      const pn = g.ui.panels.get(p);
      r.el.style.display = pn && pn.kind !== 'shop' && pn.kind !== 'menu' ? 'none' : '';
      r.el.style.left = x + w + 'px'; r.el.style.top = y + 'px';
      const fd = this.fades.get(p);
      if (fd) {
        Object.assign(fd.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', fontSize: (small ? 18 : 30) + 'px' });
        if (fd.until && now > fd.until) { fd.until = 0; fd.el.classList.remove('on'); }
      }
    });
    // floaters
    this.floats = this.floats.filter((f) => {
      const age = now - f.t;
      if (age > 1.5 || (f.player && !ps.includes(f.player))) { f.el.remove(); return false; }
      if (f.dirty) {
        f.dirty = false;
        f.el.innerHTML = `${f.amount > 0 ? '+' : '−'}${fmt(Math.abs(f.amount))}<i class="coinic"></i>${f.reason ? `<small>${f.reason}</small>` : ''}`;
      }
      const i = f.player ? ps.indexOf(f.player) : 0, v = views[i];
      if (!v) { f.el.style.display = 'none'; return true; }
      const [x, y, w, h] = v;
      let sx = x + w / 2, sy = y + h * 0.35;
      if (f.player?.camera?.cam) {
        f.player.viewPos(_v, 'head'); _v.y += 0.7;
        _v.project(f.player.camera.cam);
        if (_v.z < 1) { sx = x + (_v.x * 0.5 + 0.5) * w; sy = y + (-_v.y * 0.5 + 0.5) * h; }
      }
      sy -= age * 50;
      f.el.classList.toggle('small', w < 500);
      Object.assign(f.el.style, { display: '', left: sx + 'px', top: sy + 'px', opacity: String(Math.min(1, (1.5 - age) * 2.5)) });
      return true;
    });
  }
}
