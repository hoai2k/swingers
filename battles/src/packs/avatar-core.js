// Avatar (Avatar: The Last Airbender): the faction, its elemental effects and shared
// helpers. The characters live in avatar-fire.js (the Fire Nation) and
// avatar-benders.js (Team Avatar, the Earth Kingdom and Kyoshi Warriors).
//
// Effects (battle.emit(name, x, y, z, a, b, c); drawn by src/fx.js through EXT.fx, and
// recorded in replays like any other event):
//   av_fire    x y z, a = size (1 = a fist of fire), b = 1 blue (Azula)   a burst of flame
//   av_ftrail  x y z, b = 1 blue                                         one puff of a fire trail
//   av_water   x y z, a = size                                           a splash and spray
//   av_wtrail  x y z                                                     water drops behind a whip / jet
//   av_ice     x y z, a = size                                           ice shards and frost
//   av_air     x y z, a = radius                                         a swirl of wind and a ring
//   av_atrail  x y z                                                     a wisp of wind
//   av_earth   x y z, a = size                                           rock chunks and dust
//   av_bolt    x y z, a = size                                           lightning crackle at a point
//   av_aura    x y z, a = size                                           the Avatar State glow
//   av_steam   x y z, a = size                                           steam (fire meets water)
// Helpers below: fx(b, name, pos, a, b2) and boltLine(b, from, to) (a jagged lightning
// line made of av_bolt sparks plus a live marker mesh).
import { register } from '../ext.js';
import { THREE, rand } from './common.js';

export const FAC = 'avatar';
export const COL = {
  fire: '#ff6a1a', fireHot: '#ffd060', blue: '#3a8aff', blueHot: '#c8ecff',
  water: '#3aa0ff', waterLight: '#bfe8ff', ice: '#dff6ff', air: '#f4f6ff', earth: '#8a6a45', rock: '#7a7268',
  bolt: '#cfe6ff', aura: '#8af0ff',
};
const _c = new THREE.Color();

// ---------------------------------------------------------------- the effects
const FX = {
  av_fire(fx, x, y, z, a, blue, c, T) {
    const k = a || 1, hot = blue ? COL.blueHot : COL.fireHot, mid = blue ? COL.blue : COL.fire;
    for (let i = 0; i < 10 * k; i++) {
      const th = rand(0, 6.28), sp = rand(1, 3.5) * Math.sqrt(k);
      fx.bb(fx.gs, x, y, z, Math.cos(th) * sp, rand(0.5, 2.5), Math.sin(th) * sp, rand(0.25, 0.5) * Math.sqrt(k), rand(0.25, 0.5), i % 3 ? mid : hot, { tile: T.flame, drag: 3, shrink: true, vr: rand(-4, 4) });
    }
    fx.bb(fx.gs, x, y, z, 0, 0.4, 0, 0.9 * Math.sqrt(k), 0.18, hot, { tile: T.puff, shrink: true });
    for (let i = 0; i < 3 * k; i++) fx.bb(fx.ss, x, y + 0.2, z, rand(-0.5, 0.5), rand(0.6, 1.4), rand(-0.5, 0.5), rand(0.35, 0.6), rand(0.7, 1.1), '#4a4440', { tile: T.smoke, grow: 1.8, alpha: 0.4, fadeIn: 0.15 });
    if (k >= 1.5) fx.flash(x, y + 0.5, z, blue ? '#6ab0ff' : '#ff8a3a', 8 + k * 3);
  },
  av_ftrail(fx, x, y, z, a, blue, c, T) {
    fx.bb(fx.gs, x, y, z, rand(-0.4, 0.4), rand(0, 0.7), rand(-0.4, 0.4), rand(0.28, 0.5), rand(0.18, 0.3), Math.random() < 0.4 ? (blue ? COL.blueHot : COL.fireHot) : (blue ? COL.blue : COL.fire), { tile: T.flame, drag: 2, shrink: true, vr: rand(-3, 3) });
  },
  av_water(fx, x, y, z, a, b, c, T) {
    const k = a || 1;
    for (let i = 0; i < 14 * k; i++) {
      const th = rand(0, 6.28), sp = rand(1, 4) * Math.sqrt(k);
      fx.bb(fx.gs, x, y, z, Math.cos(th) * sp, rand(1, 4), Math.sin(th) * sp, rand(0.07, 0.15), rand(0.4, 0.8), i % 2 ? COL.water : COL.waterLight, { tile: T.puff, g: 9.81, drag: 0.8, shrink: true });
    }
    for (let i = 0; i < 4 * k; i++) fx.bb(fx.ss, x, y, z, rand(-1, 1), rand(0.2, 0.8), rand(-1, 1), rand(0.4, 0.7), rand(0.5, 0.8), '#d8f0ff', { tile: T.puff, grow: 1.5, alpha: 0.45, drag: 3 });
    fx.ring(x, fx.terrain.height(x, z) + 0.06, z, 1.2 * k, 0.45, COL.water);
  },
  av_wtrail(fx, x, y, z, a, b, c, T) {
    fx.bb(fx.gs, x + rand(-0.08, 0.08), y + rand(-0.08, 0.08), z + rand(-0.08, 0.08), rand(-0.3, 0.3), rand(-0.6, 0.2), rand(-0.3, 0.3), rand(0.12, 0.22), rand(0.2, 0.35), Math.random() < 0.5 ? COL.water : COL.waterLight, { tile: T.puff, g: 4, drag: 1, shrink: true });
  },
  av_ice(fx, x, y, z, a, b, c, T) {
    const k = a || 1;
    for (let i = 0; i < 10 * k; i++) fx.chunk(x, y, z, rand(-3, 3), rand(1, 4), rand(-3, 3), rand(0.04, 0.09), rand(0.5, 1.0), i % 2 ? COL.ice : '#9fd8ff');
    for (let i = 0; i < 6 * k; i++) fx.bb(fx.gs, x + rand(-0.4, 0.4), y + rand(-0.3, 0.5), z + rand(-0.4, 0.4), 0, rand(0.2, 0.8), 0, rand(0.1, 0.2), rand(0.4, 0.8), '#eafaff', { tile: T.star, vr: rand(-4, 4), shrink: true });
    fx.bb(fx.ss, x, y, z, 0, 0.3, 0, 0.8 * k, 0.6, '#e8f8ff', { tile: T.puff, grow: 1.4, alpha: 0.5 });
  },
  av_air(fx, x, y, z, a, b, c, T) {
    const r = a || 1.5;
    for (let i = 0; i < 18; i++) {
      const th = (i / 18) * 6.28, sp = r * 2.2;
      // puffs fly out on a curve (tangential + outward), so the burst swirls
      fx.bb(fx.ss, x + Math.cos(th) * 0.3, y + rand(-0.2, 0.4), z + Math.sin(th) * 0.3, (Math.cos(th) - Math.sin(th) * 0.8) * sp, rand(0, 0.8), (Math.sin(th) + Math.cos(th) * 0.8) * sp, rand(0.3, 0.55), rand(0.35, 0.6), COL.air, { tile: T.puff, grow: 1.6, alpha: 0.5, drag: 3.5, vr: 3 });
    }
    const gy = fx.terrain.height(x, z);
    fx.ring(x, gy + 0.08, z, r * 1.3, 0.45, '#ffffff');
    fx.ring(x, gy + 0.1, z, r * 0.8, 0.35, '#ffe9b8');
    fx.dust(x, gy, z, Math.ceil(r * 3), 0.45, r * 0.4, 0.6);
  },
  av_atrail(fx, x, y, z, a, b, c, T) {
    fx.bb(fx.ss, x, y, z, rand(-0.6, 0.6), rand(-0.2, 0.4), rand(-0.6, 0.6), rand(0.25, 0.45), rand(0.25, 0.4), COL.air, { tile: T.puff, grow: 1.8, alpha: 0.32, drag: 2, vr: rand(-5, 5) });
  },
  av_earth(fx, x, y, z, a, b, c, T) {
    const k = a || 1;
    for (let i = 0; i < 12 * k; i++) fx.chunk(x, y, z, rand(-3.5, 3.5), rand(1.5, 5), rand(-3.5, 3.5), rand(0.05, 0.13) * Math.sqrt(k), rand(0.7, 1.3), [COL.rock, COL.earth, '#5e564c'][i % 3], 12, 0.2);
    fx.dust(x, fx.terrain.height(x, z), z, Math.ceil(6 * k), 0.55, 0.5 * k, 1.2);
  },
  av_bolt(fx, x, y, z, a, b, c, T) {
    const k = a || 1;
    fx.bb(fx.gs, x, y, z, 0, 0, 0, 1.1 * k, 0.12, '#ffffff', { tile: T.star, rot: rand(0, 6), shrink: true });
    fx.bb(fx.gs, x, y, z, 0, 0, 0, 0.8 * k, 0.16, '#9ac8ff', { tile: T.puff, shrink: true });
    for (let i = 0; i < 6 * k; i++) fx.bb(fx.gs, x, y, z, rand(-4, 4), rand(-2, 4), rand(-4, 4), rand(0.05, 0.1), rand(0.1, 0.25), i % 2 ? COL.bolt : '#8ab8ff', { tile: T.flame, drag: 2, shrink: true });
    if (k >= 1) fx.flash(x, y, z, '#a8c8ff', 10 + k * 4);
  },
  av_aura(fx, x, y, z, a, b, c, T) {
    const k = a || 1;
    for (let i = 0; i < 3; i++) {
      const th = rand(0, 6.28), r = rand(0.2, 0.6) * k;
      fx.bb(fx.gs, x + Math.cos(th) * r, y + rand(-0.8, 0.8) * k, z + Math.sin(th) * r, 0, rand(0.8, 1.8), 0, rand(0.1, 0.2), rand(0.4, 0.7), i % 2 ? COL.aura : '#ffffff', { tile: T.star, vr: rand(-4, 4), shrink: true, fadeIn: 0.1 });
    }
  },
  av_steam(fx, x, y, z, a, b, c, T) {
    const k = a || 1;
    for (let i = 0; i < 6 * k; i++) fx.bb(fx.ss, x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), rand(-0.4, 0.4), rand(0.8, 1.8), rand(-0.4, 0.4), rand(0.4, 0.7), rand(0.8, 1.3), '#f2f2f2', { tile: T.smoke, grow: 2, alpha: 0.5, fadeIn: 0.15 });
  },
};

// emit an effect at a point
export function fx(b, name, p, a = 0, b2 = 0) { b.emit(name, p.x, p.y, p.z, a, b2); }

// a jagged lightning line from `from` to `to` (sparks along it; flashes at the end)
export function boltLine(b, from, to, size = 1) {
  const n = Math.max(3, Math.ceil(from.distanceTo(to) / 0.8));
  for (let i = 1; i <= n; i++) {
    const t = i / n, j = i < n ? 0.35 : 0;
    b.emit('av_bolt', from.x + (to.x - from.x) * t + rand(-j, j), from.y + (to.y - from.y) * t + rand(-j, j), from.z + (to.z - from.z) * t + rand(-j, j), i === n ? size * 1.5 : 0.35);
  }
}

const ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M12 12 L12 2 A10 10 0 0 1 22 12 Z" fill="#f2b03a"/><path d="M12 12 L22 12 A10 10 0 0 1 12 22 Z" fill="#d83a2a"/>'
  + '<path d="M12 12 L12 22 A10 10 0 0 1 2 12 Z" fill="#4a9a3a"/><path d="M12 12 L2 12 A10 10 0 0 1 12 2 Z" fill="#3a8ae0"/>'
  + '<circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="12" cy="12" r="3.2" fill="#fff"/></svg>';

register({
  factions: [{ id: FAC, name: 'Avatar', color: '#e8892a', icon: ICON }],
  fx: FX,
});
