// "Welcome to Frostpeak!" — a banner in a player's own view when they cross
// into another region's bounds (terrain.js regionAt). The open sea between
// islands keeps the last region, so sailing out and back in again doesn't
// re-trigger it. `player.region` is the region the player is in (read it for
// anything region-dependent: music, ambience, quests...).
import { regionAt } from './terrain.js';
import { injectCSS } from './map.js';

const CSS = `
.regionbanner { position: absolute; transform: translate(-50%, 0) scale(var(--s,1)); transform-origin: 50% 0; text-align: center; pointer-events: none;
  color: #fff; font-weight: 900; white-space: nowrap; animation: rbin .6s cubic-bezier(.3,1.6,.5,1); transition: opacity .8s, transform .8s; }
.regionbanner small { display: block; font-size: 18px; letter-spacing: 3px; text-transform: uppercase; opacity: .95; text-shadow: 0 2px 0 rgba(0,0,0,.25); }
.regionbanner b { display: inline-block; font-size: 46px; padding: 2px 26px 6px; border-radius: 22px; background: var(--bg); box-shadow: 0 6px 0 rgba(0,0,0,.22);
  text-shadow: 0 3px 0 rgba(0,0,0,.25); }
.regionbanner.out { opacity: 0; transform: translate(-50%, -14px) scale(var(--s,1)); }
@keyframes rbin { from { opacity: 0; transform: translate(-50%, 18px) scale(calc(var(--s,1) * .6)); } }
`;
export const BIOME_CSS = { home: '#ff5a8a', city: '#2a62c9', snow: '#5aa8ff', desert: '#d2733a', jungle: '#2f9a3a', tropical: '#16b8b8' };

export class RegionBanners {
  constructor(game) {
    this.game = game;
    this.state = new Map(); // player -> { region, el, t }
    injectCSS(CSS);
    game.updaters.push((dt) => this.update(dt));
  }

  show(p, st, r) {
    st.el?.remove();
    const el = document.createElement('div');
    el.className = 'regionbanner';
    el.style.setProperty('--bg', BIOME_CSS[r.biome] || '#ff5a8a');
    el.innerHTML = `<small>Welcome to</small><b>${r.name}!</b>`;
    this.game.ui.hud.appendChild(el);
    st.el = el; st.t = 0;
    this.game.audio?.play('toast');
  }

  update(dt) {
    const g = this.game, ps = g.players;
    for (const [p, st] of this.state) if (!ps.includes(p)) { st.el?.remove(); this.state.delete(p); }
    if (!g.ui?.hud) return;
    const views = g.views();
    ps.forEach((p, i) => {
      const c = p.chest.translation(), r = regionAt(c.x, c.z);
      let st = this.state.get(p);
      if (!st) { st = { region: r, el: null, t: 0 }; this.state.set(p, st); }
      if (r && r !== st.region) { st.region = r; this.show(p, st, r); }
      p.region = st.region;
      if (!st.el) return;
      st.t += dt;
      const [x, y, w, h] = views[i] || views[0];
      const s = Math.max(0.45, Math.min(1, w / 900, h / 500));
      Object.assign(st.el.style, { left: x + w / 2 + 'px', top: y + h * 0.16 + 'px' });
      st.el.style.setProperty('--s', s.toFixed(3));
      if (st.t > 3.2 && !st.el.classList.contains('out')) st.el.classList.add('out');
      if (st.t > 4.2) { st.el.remove(); st.el = null; }
    });
  }
}
