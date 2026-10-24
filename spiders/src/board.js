// A board: the arena's terrain, spawns and look. Board definitions are
// plain data (src/boards.js, src/lobby.js):
//
// {
//   id, name, theme,          // theme picks textures + palette (THEMES below)
//   bg: 'night',              // optional background image key (../assets/web/bg_<key>.jpg,
//                             //   or a spiders-specific one, see image-requests.md)
//   music: 'Rounders Spy 2',  // optional opener track
//   solids: [ { poly | circle, mat?, move? | spin? | bob?, tex? } ],   // see physics.js
//   spawns: [[x,y] x8],       // player spawn points (a weapon spawns at each)
//   dropPoints: [[x,y]],      // optional: where random drops fall in (default: anywhere on top)
//   enemySpawns: [[x,y]],     // survival: where enemies enter (default: edges)
//   killY: 1180,              // fall below this = death (default 1180)
//   decor: [ {type, ...} ],   // optional background props (drawDecor)
//   tagline: 'Short hint shown on the board card',
//   onUpdate(game, dt) / onDraw(ctx, game)  // optional board-specific hooks
// }
//
// The arena is 1920 x 1080 world units, always fully visible.

import { World } from './physics.js';
import { loadImage, ready } from './preload.js';
import { TAU, mulberry, rgba } from './util.js';

export const W = 1920, H = 1080;

// palettes per theme; `tex` is the terrain texture (shared Swingers art)
export const THEMES = {
  meadow:  { sky: ['#8fd3ff', '#e3f6ff'], rock: '#6b4f3a', edge: '#3a2a1e', top: '#6fd36a', glow: '#ffffff' },
  cave:    { sky: ['#141726', '#2a2f4a'], rock: '#4a4560', edge: '#1d1a28', top: '#8f86b8', glow: '#9fd8ff' },
  sunset:  { sky: ['#ff8a5c', '#ffd28a'], rock: '#7a3f3a', edge: '#3d1d1b', top: '#ffb070', glow: '#ffe0b0' },
  jungle:  { sky: ['#1f5a3a', '#7fc58a'], rock: '#3f5a2a', edge: '#1a2a12', top: '#8ce05a', glow: '#d6ffb0' },
  factory: { sky: ['#2a2e36', '#555c68'], rock: '#5d646f', edge: '#22262c', top: '#ffb030', glow: '#ffd080' },
  sky:     { sky: ['#5fb8ff', '#d8f0ff'], rock: '#e8eef8', edge: '#8aa0c0', top: '#ffffff', glow: '#ffffff' },
  volcano: { sky: ['#2a0d0d', '#7a2a12'], rock: '#3a2422', edge: '#140a0a', top: '#ff6a2a', glow: '#ff9a4a' },
  night:   { sky: ['#0b1030', '#2a2f6a'], rock: '#33395c', edge: '#121530', top: '#9aa8ff', glow: '#c8d0ff' },
  candy:   { sky: ['#ffb3e0', '#fff0fa'], rock: '#e86aa8', edge: '#8a2a5a', top: '#ffffff', glow: '#ffffff' },
  frost:   { sky: ['#9fd8ff', '#f0faff'], rock: '#8ab4d8', edge: '#3a5a7a', top: '#ffffff', glow: '#e0f6ff' },
  desert:  { sky: ['#ffc070', '#fff0c8'], rock: '#c08a4a', edge: '#6a4220', top: '#ffd890', glow: '#fff0d0' },
  storm:   { sky: ['#1a2030', '#4a5468'], rock: '#454b5a', edge: '#181b22', top: '#9ab0c8', glow: '#d0e8ff' },
};

const texCache = new Map();
function themeImage(kind, key) {
  const k = kind + ':' + key;
  if (!texCache.has(k)) {
    const file = kind === 'bg' ? `bg_${key}.jpg` : `tile_plat_${key}.png`;
    texCache.set(k, loadImage(`../assets/web/${file}`));
  }
  return texCache.get(k);
}
// spiders-specific art (image-requests.md); optional
const spiderArt = new Map();
export function spiderImage(file) {
  if (!spiderArt.has(file)) {
    const img = new Image();
    img.decoding = 'async';
    img.onerror = () => { img.failed = true; };
    img.src = `assets/web/${file}`;
    spiderArt.set(file, img);
  }
  return spiderArt.get(file);
}
// preload the shared theme art
for (const t of Object.keys(THEMES)) { themeImage('bg', t); themeImage('tex', t); }
const MAT = {
  lava: loadImage('../assets/web/tile_lava.png'),
  ice: loadImage('../assets/web/tile_icewater.png'),
};

export class Board {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.theme = THEMES[def.theme] ? def.theme : 'night';
    this.pal = THEMES[this.theme];
    this.w = W; this.h = H;
    this.world = new World(def.solids, { w: W, h: H });
    this.spawns = def.spawns || [[400, 500], [1520, 500]];
    this.dropPoints = def.dropPoints || null;
    this.enemySpawns = def.enemySpawns || [[-60, 300], [W + 60, 300], [W / 2, -60], [-60, 700], [W + 60, 700]];
    this.killY = def.killY ?? 1180;
    this.staticCanvas = null;
    this.dirty = true;
    this.time = 0;
    this.stars = null;
  }

  update(dt, game) {
    this.time += dt;
    this.world.update(dt);
    if (this.def.onUpdate) this.def.onUpdate(game, dt, this);
  }

  // ---- drawing -----------------------------------------------------------
  drawBackground(ctx) {
    const pal = this.pal;
    const key = this.def.bg || this.theme;
    // a spiders-specific backdrop wins if delivered, then the shared Swingers one
    const own = this.def.bgFile ? spiderImage(this.def.bgFile) : null;
    const img = own && ready(own) ? own : themeImage('bg', THEMES[key] ? key : this.theme);
    if (ready(img)) {
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
      // push it back so the action reads
      ctx.fillStyle = 'rgba(8,10,24,0.38)';
      ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(8,10,24,0.3)';
      ctx.fillRect(0, 0, W, H);
    }
    this.drawDecor(ctx, 'back');
  }

  drawDecor(ctx, layer) {
    const decor = this.def.decor;
    if (!decor) return;
    for (const d of decor) {
      if ((d.layer || 'back') !== layer) continue;
      const fn = DECOR[d.type];
      if (fn) fn(ctx, d, this);
    }
  }

  solidPath(s) {
    const p = new Path2D();
    if (s.kind === 'circle') { p.arc(s.c.x, s.c.y, s.c.r, 0, TAU); return p; }
    const P = s.wpts;
    p.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i++) p.lineTo(P[i].x, P[i].y);
    p.closePath();
    return p;
  }

  fillSolid(ctx, s) {
    const pal = this.pal;
    const path = this.solidPath(s);
    const mat = s.mat;
    let fill = s.def.color || pal.rock;
    ctx.fillStyle = fill;
    ctx.fill(path);
    // texture
    const tex = mat === 'lava' ? MAT.lava : mat === 'ice' ? MAT.ice : themeImage('tex', s.def.tex || this.theme);
    if (ready(tex) && mat !== 'glass') {
      if (!tex._pat) tex._pat = ctx.createPattern(tex, 'repeat');
      if (tex._pat) {
        ctx.save();
        ctx.clip(path);
        ctx.globalAlpha = mat === 'lava' || mat === 'ice' ? 1 : 0.85;
        // patterns follow moving platforms
        const m = new DOMMatrix().translate(s.x, s.y).scale(0.5);
        tex._pat.setTransform(m);
        ctx.fillStyle = tex._pat;
        ctx.fill(path);
        ctx.restore();
      }
    }
    if (mat === 'glass') {
      ctx.fillStyle = 'rgba(170,230,255,0.35)';
      ctx.fill(path);
    }
    if (mat === 'bouncy') {
      ctx.fillStyle = 'rgba(255,90,200,0.45)';
      ctx.fill(path);
    }
    // inner shade toward the bottom
    ctx.save();
    ctx.clip(path);
    const bb = s.bb;
    const g = ctx.createLinearGradient(0, bb.y0, 0, bb.y1);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.restore();
    // outline
    ctx.lineJoin = 'round';
    ctx.strokeStyle = mat === 'glass' ? 'rgba(220,250,255,0.9)' : mat === 'lava' ? '#ffcf5a' : pal.edge;
    ctx.lineWidth = 4;
    ctx.stroke(path);
    // lit upper edges (grass / snow / glow line)
    if (s.kind === 'poly' && mat !== 'lava' && mat !== 'glass') {
      const P = s.wpts;
      ctx.strokeStyle = mat === 'ice' ? '#e8fbff' : mat === 'bouncy' ? '#ff9ae0' : (s.def.top || pal.top);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const ex = b.x - a.x, ey = b.y - a.y, el = Math.hypot(ex, ey) || 1;
        let nx = ey / el, ny = -ex / el;
        // outward normal: test the midpoint
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (s.inside(mx + nx * 2, my + ny * 2)) { nx = -nx; ny = -ny; }
        if (ny < -0.55) { ctx.moveTo(a.x, a.y + 1.5); ctx.lineTo(b.x, b.y + 1.5); }
      }
      ctx.stroke();
    }
    if (s.kind === 'circle' && mat !== 'lava') {
      ctx.strokeStyle = s.def.top || pal.top;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(s.c.x, s.c.y, s.c.r - 1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    if (s.def.spin) {
      ctx.fillStyle = pal.edge;
      ctx.beginPath(); ctx.arc(s.pivot.x + s.x, s.pivot.y + s.y, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.top;
      ctx.beginPath(); ctx.arc(s.pivot.x + s.x, s.pivot.y + s.y, 4, 0, TAU); ctx.fill();
    }
  }

  // static terrain is cached; moving pieces + lava glow are drawn live
  drawTerrain(ctx) {
    if (this.dirty || !this.staticCanvas) this.renderStatic();
    ctx.drawImage(this.staticCanvas, 0, 0, W, H);
    for (const s of this.world.solids) if (s.dynamic && !s.broken) this.fillSolid(ctx, s);
    // lava shimmer
    for (const s of this.world.solids) {
      if (s.mat !== 'lava' || s.broken) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(this.time * 3 + s.i);
      ctx.fillStyle = '#ff7a2a';
      ctx.fill(this.solidPath(s));
      ctx.restore();
    }
    this.drawDecor(ctx, 'front');
  }

  renderStatic() {
    const c = this.staticCanvas || document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    for (const s of this.world.solids) if (!s.dynamic && !s.broken) this.fillSolid(x, s);
    this.staticCanvas = c;
    // textures may still be loading: redraw once more later
    this.dirty = !(ready(themeImage('tex', this.theme)));
  }
}

// --- background props ---------------------------------------------------------
// Each draws {type, ...} data. Add more as boards need them.
export const DECOR = {
  // hanging vine / chain from (x, y) of length len
  vine(ctx, d, b) {
    const sway = Math.sin(b.time * 1.2 + d.x) * 6;
    ctx.strokeStyle = d.color || rgba(b.pal.top, 0.5);
    ctx.lineWidth = d.w || 4;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.quadraticCurveTo(d.x + sway, d.y + d.len / 2, d.x + sway * 1.5, d.y + d.len);
    ctx.stroke();
  },
  // soft glow light
  light(ctx, d, b) {
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
    g.addColorStop(0, rgba(d.color || b.pal.glow, 0.35 + 0.05 * Math.sin(b.time * 2 + d.x)));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
  },
  // a big silhouette shape (distant pillar / hill / gear)
  silhouette(ctx, d, b) {
    ctx.fillStyle = d.color || 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    d.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  },
  // drifting motes (snow, embers, spores)
  motes(ctx, d, b) {
    if (!d._p) { const r = mulberry(d.seed || 3); d._p = Array.from({ length: d.n || 40 }, () => ({ x: r() * W, y: r() * H, s: 1 + r() * 3, v: 10 + r() * 40, ph: r() * TAU })); }
    ctx.fillStyle = d.color || 'rgba(255,255,255,0.6)';
    for (const p of d._p) {
      const y = ((p.y + b.time * p.v * (d.dir || 1)) % H + H) % H;
      const x = p.x + Math.sin(b.time + p.ph) * 12;
      ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill();
    }
  },
  // web strands in corners (it is a spider game)
  cobweb(ctx, d) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.2;
    const n = 7, R = d.r || 120;
    for (let i = 0; i < n; i++) {
      const a = (d.a0 ?? 0) + (i / (n - 1)) * (d.span ?? Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + Math.cos(a) * R, d.y + Math.sin(a) * R); ctx.stroke();
    }
    for (let k = 1; k <= 4; k++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (d.a0 ?? 0) + (i / (n - 1)) * (d.span ?? Math.PI / 2);
        const rr = (R * k) / 4.5;
        const x = d.x + Math.cos(a) * rr, y = d.y + Math.sin(a) * rr;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  },
  // text sign (lobby labels etc.)
  label(ctx, d) {
    ctx.save();
    ctx.font = `700 ${d.size || 40}px 'Fredoka', sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(d.text, d.x, d.y);
    ctx.fillStyle = d.color || '#fff';
    ctx.fillText(d.text, d.x, d.y);
    ctx.restore();
  },
};
