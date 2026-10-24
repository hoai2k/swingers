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
//   bgDim: 0.38,              // how much a delivered bgFile is darkened (busy art: more)
//   decor: [ {type, ...} ],   // optional background props (drawDecor)
//   tagline: 'Short hint shown on the board card',
//   onUpdate(game, dt) / onDraw(ctx, game)  // optional board-specific hooks
// }
//
// The arena is 1920 x 1080 world units, always fully visible.

import { World } from './physics.js';
import { loadImage, ready } from './preload.js';
import { optionalImage } from './optional-art.js';
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
// spiders-specific art (image-requests.md); optional, only requested once
// listed in assets/web/manifest.json (see optional-art.js), so no 404s
export function spiderImage(file) { return optionalImage(file).img; }
// delivered terrain tiles: requested at boot (through the loading bar)
const ICE_TILE = 'tile_spider_frost_ice.png';
optionalImage(ICE_TILE);
// preload the shared theme art
for (const t of Object.keys(THEMES)) { themeImage('bg', t); themeImage('tex', t); }
const MAT = {
  lava: loadImage('../assets/web/tile_lava.png'),
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
    // a board's own painted backdrop already shows its sky, clouds and
    // distant shapes: the procedural stand-ins for those are skipped then
    this.paintedBg = !!(own && ready(own));
    if (ready(img)) {
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
      ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
      // push it back so the action reads
      ctx.fillStyle = `rgba(8,10,24,${this.paintedBg ? this.def.bgDim ?? 0.38 : 0.38})`;
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
      if (this.paintedBg && PAINTED.has(d.type)) continue;
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
    const iceTex = mat === 'ice' ? spiderImage(ICE_TILE) : null;
    const tex = mat === 'lava' ? MAT.lava : mat === 'ice' ? iceTex : themeImage('tex', s.def.tex || this.theme);
    if (mat === 'ice' && !ready(tex)) drawIce(ctx, path, s);
    if (ready(tex) && mat !== 'glass') {
      if (!tex._pat) tex._pat = ctx.createPattern(tex, 'repeat');
      if (tex._pat) {
        ctx.save();
        ctx.clip(path);
        if (mat === 'ice') {
          // the delivered ice tile is bright and fine-grained: lay it larger and
          // partly see-through over deep blue so it sits in the night scenes
          ctx.fillStyle = '#21557d';
          ctx.fill(path);
        }
        ctx.globalAlpha = mat === 'lava' ? 1 : mat === 'ice' ? 0.62 : s.def.color ? 0.3 : 0.85;
        // patterns follow moving platforms
        const m = new DOMMatrix().translate(s.x, s.y).scale(mat === 'ice' ? 1 : 0.5);
        tex._pat.setTransform(m);
        ctx.fillStyle = tex._pat;
        ctx.fill(path);
        ctx.restore();
      }
    }
    if (mat === 'ice' && ready(tex)) iceSheen(ctx, path, s);
    if (mat === 'glass') {
      ctx.fillStyle = 'rgba(170,230,255,0.35)';
      ctx.fill(path);
    }
    if (mat === 'bouncy' && !s.def.color) {
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
    // candy dressing: stripes (canes) and swirls (lollipops)
    if (s.def.stripes || s.def.swirl) {
      ctx.save();
      ctx.clip(path);
      const bb = s.bb;
      ctx.strokeStyle = s.def.top || '#ff4a7a';
      if (s.def.stripes) {
        ctx.lineWidth = 12;
        ctx.beginPath();
        for (let k = bb.x0 - (bb.y1 - bb.y0) - 40; k < bb.x1 + 40; k += 34) { ctx.moveTo(k, bb.y1 + 20); ctx.lineTo(k + (bb.y1 - bb.y0) + 40, bb.y0 - 20); }
        ctx.stroke();
      } else if (s.kind === 'circle') {
        ctx.lineWidth = s.c.r * 0.16;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * TAU * 2.6 + s.a, r = t * s.c.r; const x = s.c.x + Math.cos(a) * r, y = s.c.y + Math.sin(a) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = pal.edge; ctx.lineWidth = 4; ctx.stroke(path);
    }
    if (s.def.spin && s.inside(s.pivot.x + s.x, s.pivot.y + s.y)) {
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
    for (const s of this.world.solids) if (s.dynamic && !s.broken) this.drawMoving(ctx, s);
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

  // moving / spinning solids: drawn once at rest into a sprite, then placed
  // with the solid's transform each frame (much cheaper than re-filling)
  drawMoving(ctx, s) {
    if (!s._spr || s._sprDirty) this.spriteFor(s);
    const p = s.pivot, sp = s._spr;
    ctx.save();
    ctx.translate(s.x + p.x, s.y + p.y);
    if (s.a) ctx.rotate(s.a);
    ctx.drawImage(sp.c, sp.x - p.x, sp.y - p.y);
    ctx.restore();
  }

  spriteFor(s) {
    const save = [s.x, s.y, s.a];
    s.x = 0; s.y = 0; s.a = 0; s.refresh();
    const pad = 8, bb = s.bb;
    const c = (s._spr && s._spr.c) || document.createElement('canvas');
    c.width = Math.ceil(bb.x1 - bb.x0) + pad * 2; c.height = Math.ceil(bb.y1 - bb.y0) + pad * 2;
    const x = c.getContext('2d');
    x.translate(-bb.x0 + pad, -bb.y0 + pad);
    this.fillSolid(x, s);
    s._spr = { c, x: bb.x0 - pad, y: bb.y0 - pad };
    // textures may still be loading: redraw once they are
    s._sprDirty = !ready(themeImage('tex', s.def.tex || this.theme));
    [s.x, s.y, s.a] = save; s.refresh();
  }

  renderStatic() {
    const c = this.staticCanvas || document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    for (const s of this.world.solids) if (!s.dynamic && !s.broken) this.fillSolid(x, s);
    this.staticCanvas = c;
    // textures may still be loading: redraw once more later
    // textures may still be loading: redraw once more later (theme tile, and a
    // delivered ice tile that's listed but not in yet)
    const ice = this.world.solids.some((q) => q.mat === 'ice') ? optionalImage(ICE_TILE).img : null;
    this.dirty = !ready(themeImage('tex', this.theme)) || !!(ice && !ready(ice));
  }
}

// decor that only stands in for a painted backdrop (skipped once one is delivered)
const PAINTED = new Set(['silhouette', 'bggear', 'stars', 'clouds', 'cloudbank', 'vortex', 'moon', 'sun', 'frame', 'plants', 'crystals', 'rays']);

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
      const x = (((p.x + b.time * (d.drift || 0) * (p.v / 30) + Math.sin(b.time + p.ph) * 12) % W) + W) % W;
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

  // ---- board atmosphere (src/boards.js) ----
  // soft light shafts fanning down from (x, y)
  rays(ctx, d, b) {
    const n = d.n || 5, len = d.len || 1200, spread = d.spread || 0.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = d.color || 'rgba(255,255,230,0.07)';
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / (n - 1) - 0.5) * spread + Math.sin(b.time * 0.2 + i) * 0.03;
      const w = 0.03 + 0.02 * ((i * 7) % 3);
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + Math.cos(a - w) * len, d.y + Math.sin(a - w) * len);
      ctx.lineTo(d.x + Math.cos(a + w) * len, d.y + Math.sin(a + w) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
  // a haze band rising from the bottom (pits, rifts)
  fog(ctx, d, b) {
    const y0 = d.y - (d.h || 160);
    const g = ctx.createLinearGradient(0, y0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(Math.min(0.9, (d.h || 160) / (H - y0)), d.color || 'rgba(255,255,255,0.3)');
    g.addColorStop(1, d.color || 'rgba(255,255,255,0.3)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 80) ctx.lineTo(x, y0 + Math.sin(x * 0.006 + b.time * 0.5) * 18);
    ctx.lineTo(W, H);
    ctx.fill();
  },
  // glowing crystal cluster growing from (x, y) (dir -1 up, 1 down)
  crystals(ctx, d, b) {
    if (!d._c) {
      const r = mulberry(d.seed || 1);
      d._c = Array.from({ length: d.n || 4 }, (_, i) => ({ dx: (r() - 0.5) * 90, a: (r() - 0.5) * 0.9, l: 40 + r() * 70, w: 9 + r() * 9 }));
    }
    const dir = d.dir || -1;
    ctx.save();
    const glow = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 120);
    glow.addColorStop(0, rgba(d.color || '#8fd8ff', 0.3 + 0.08 * Math.sin(b.time * 1.5 + d.x)));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(d.x - 120, d.y - 120, 240, 240);
    for (const c of d._c) {
      const x = d.x + c.dx, y = d.y;
      const tx = x + Math.sin(c.a) * c.l, ty = y + dir * Math.cos(c.a) * c.l;
      const nx = Math.cos(c.a) * c.w, ny = Math.sin(c.a) * c.w * dir;
      ctx.fillStyle = rgba(d.color || '#8fd8ff', 0.75);
      ctx.beginPath();
      ctx.moveTo(x - nx, y + ny); ctx.lineTo(tx - nx * 0.6 + (tx - x) * -0.15, ty + ny * 0.6 - (ty - y) * 0.15); ctx.lineTo(tx, ty);
      ctx.lineTo(tx + nx * 0.6 + (tx - x) * -0.15, ty - ny * 0.6 - (ty - y) * 0.15); ctx.lineTo(x + nx, y - ny);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.lineTo(x + nx, y - ny); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  },
  // water drops falling from stalactite tips
  drips(ctx, d, b) {
    ctx.fillStyle = d.color || 'rgba(170,210,255,0.7)';
    d.xs.forEach((x, i) => {
      const per = 2.2 + (i % 3) * 0.7;
      const t = ((b.time + i * 0.9) % per) / per;
      const y0 = d.ys[i];
      if (t < 0.35) { const s = (t / 0.35) * 3.5; ctx.beginPath(); ctx.ellipse(x, y0, s, s * 1.3, 0, 0, TAU); ctx.fill(); }
      else { const ft = (t - 0.35) * per; const y = y0 + 900 * ft * ft; if (y < H) { ctx.beginPath(); ctx.ellipse(x, y, 2.5, 5, 0, 0, TAU); ctx.fill(); } }
    });
  },
  // slow rising smoke puffs
  smoke(ctx, d, b) {
    const n = d.n || 6;
    for (let i = 0; i < n; i++) {
      const per = 7, t = ((b.time + i * (per / n)) % per) / per;
      const x = d.x + Math.sin(i * 2.3) * (d.w || 700) * 0.5 + Math.sin(b.time * 0.4 + i) * 30;
      const y = d.y - t * 900;
      const r = 60 + t * 160;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(40,20,20,${0.22 * Math.sin(t * Math.PI)})`);
      g.addColorStop(1, 'rgba(40,20,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  },
  // a big turning gear in the background
  bggear(ctx, d, b) {
    const n = d.teeth || 12, r1 = d.r, r0 = d.r * 0.86, a0 = b.time * (d.speed || 0.1);
    ctx.fillStyle = d.color || 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU, st = TAU / n;
      const pts = [[a, r0], [a + st * 0.2, r1], [a + st * 0.5, r1], [a + st * 0.7, r0]];
      for (const [aa, rr] of pts) ctx.lineTo(d.x + Math.cos(aa) * rr, d.y + Math.sin(aa) * rr);
    }
    ctx.closePath();
    ctx.moveTo(d.x + r0 * 0.45, d.y);
    ctx.arc(d.x, d.y, r0 * 0.45, 0, TAU, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = d.color || 'rgba(0,0,0,0.2)';
    ctx.lineWidth = d.r * 0.08;
    for (let k = 0; k < 4; k++) {
      const a = a0 + k * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + Math.cos(a) * r0 * 0.5, d.y + Math.sin(a) * r0 * 0.5); ctx.stroke();
    }
  },
  // a hanging work lamp with a light cone
  lamp(ctx, d, b) {
    const sway = Math.sin(b.time * 0.9 + d.x) * 0.05;
    const ex = d.x + Math.sin(sway) * d.len, ey = d.y + Math.cos(sway) * d.len;
    ctx.strokeStyle = 'rgba(20,20,24,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(ex, ey, ex, ey + 700);
    g.addColorStop(0, 'rgba(255,200,110,0.22)'); g.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(ex - 16, ey); ctx.lineTo(ex - 200 + sway * 400, ey + 700); ctx.lineTo(ex + 200 + sway * 400, ey + 700); ctx.lineTo(ex + 16, ey); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#2a2e36';
    ctx.beginPath(); ctx.moveTo(ex - 22, ey + 12); ctx.lineTo(ex - 10, ey - 6); ctx.lineTo(ex + 10, ey - 6); ctx.lineTo(ex + 22, ey + 12); ctx.fill();
    ctx.fillStyle = '#ffe2a0';
    ctx.beginPath(); ctx.arc(ex, ey + 12, 7, 0, Math.PI); ctx.fill();
  },
  // a soft bank of clouds along the bottom
  cloudbank(ctx, d, b) {
    if (!d._c) { const r = mulberry(d.seed || 1); d._c = Array.from({ length: 16 }, (_, i) => ({ x: i * 130 + r() * 60 - 30, r: 90 + r() * 80, ph: r() * TAU })); }
    ctx.fillStyle = d.color || 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    for (const c of d._c) { const y = d.y + Math.sin(b.time * 0.4 + c.ph) * 10; ctx.moveTo(c.x + c.r, y); ctx.arc(c.x, y, c.r, 0, TAU); }
    ctx.rect(0, d.y, W, H - d.y);
    ctx.fill();
  },
  // drifting cloud puffs
  clouds(ctx, d, b) {
    if (!d._c) { const r = mulberry(d.seed || 1); d._c = Array.from({ length: d.n || 6 }, () => ({ x: r() * (W + 400), y: 60 + r() * 700, s: 0.6 + r() * 0.8, v: 0.5 + r() })); }
    ctx.fillStyle = d.color || 'rgba(255,255,255,0.35)';
    for (const c of d._c) {
      const x = ((c.x + b.time * (d.speed || 15) * c.v) % (W + 400)) - 200, y = c.y, s = c.s;
      ctx.beginPath();
      ctx.ellipse(x, y, 110 * s, 34 * s, 0, 0, TAU);
      ctx.moveTo(x - 10 * s + 52 * s, y - 22 * s); ctx.arc(x - 10 * s, y - 22 * s, 52 * s, 0, TAU);
      ctx.moveTo(x + 50 * s + 38 * s, y - 14 * s); ctx.arc(x + 50 * s, y - 14 * s, 38 * s, 0, TAU);
      ctx.fill();
    }
  },
  // twinkling stars
  stars(ctx, d, b) {
    if (!d._s) { const r = mulberry(d.seed || 1); d._s = Array.from({ length: d.n || 80 }, () => ({ x: r() * W, y: r() * H * (d.depth || 0.75), s: 0.6 + r() * 1.8, ph: r() * TAU })); }
    for (const s of d._s) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(b.time * 1.7 + s.ph)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, TAU); ctx.fill();
    }
  },
  // a glowing moon
  moon(ctx, d) {
    const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.8, d.x, d.y, d.r * 3.2);
    g.addColorStop(0, 'rgba(220,230,255,0.35)'); g.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eef0ff'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(150,160,200,0.35)';
    for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.4, 0.12], [0.35, -0.35, 0.1]]) {
      ctx.beginPath(); ctx.arc(d.x + cx * d.r, d.y + cy * d.r, cr * d.r, 0, TAU); ctx.fill();
    }
  },
  // the sun
  sun(ctx, d, b) {
    const g = ctx.createRadialGradient(d.x, d.y, d.r * 0.6, d.x, d.y, d.r * 4);
    g.addColorStop(0, 'rgba(255,240,190,0.55)'); g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,220,0.9)'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
  },
  // greenhouse ironwork: ribs from a roof polyline down to the floor
  frame(ctx, d) {
    ctx.strokeStyle = d.color || 'rgba(170,190,255,0.16)';
    ctx.lineWidth = 3;
    const P = d.poly, floor = d.floor || 970;
    ctx.beginPath();
    P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1];
      const n = Math.round(Math.abs(bx - ax) / 110);
      for (let k = 1; k < n; k++) { const t = k / n; ctx.moveTo(ax + (bx - ax) * t, ay + (by - ay) * t); ctx.lineTo(ax + (bx - ax) * t, floor); }
    }
    for (let y = 520; y < floor; y += 150) { ctx.moveTo(P[0][0], y); ctx.lineTo(P[P.length - 1][0], y); }
    ctx.stroke();
  },
  // leafy fronds growing from (x, y)
  plants(ctx, d, b) {
    if (!d._p) { const r = mulberry(d.seed || 1); d._p = Array.from({ length: d.n || 5 }, () => ({ dx: (r() - 0.5) * 160, a: (r() - 0.5) * 1.4, l: 70 + r() * 110, ph: r() * TAU })); }
    ctx.fillStyle = d.color || 'rgba(60,140,90,0.6)';
    for (const p of d._p) {
      const a = p.a + Math.sin(b.time * 0.8 + p.ph) * 0.05;
      const x = d.x + p.dx, y = d.y;
      const tx = x + Math.sin(a) * p.l, ty = y - Math.cos(a) * p.l;
      const nx = Math.cos(a) * p.l * 0.22, ny = Math.sin(a) * p.l * 0.22;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo((x + tx) / 2 - nx, (y + ty) / 2 - ny, tx, ty);
      ctx.quadraticCurveTo((x + tx) / 2 + nx, (y + ty) / 2 + ny, x, y);
      ctx.fill();
    }
  },
  // floating candy sprinkles
  sprinkles(ctx, d, b) {
    const cols = ['#ff5aa0', '#5ac8ff', '#ffd040', '#7ae07a', '#c070ff', '#ffffff'];
    if (!d._s) { const r = mulberry(d.seed || 1); d._s = Array.from({ length: d.n || 50 }, (_, i) => ({ x: r() * W, y: r() * H, a: r() * TAU, va: (r() - 0.5) * 2, v: 8 + r() * 20, c: cols[i % cols.length] })); }
    ctx.lineCap = 'round'; ctx.lineWidth = 4;
    for (const s of d._s) {
      const y = (s.y + b.time * s.v) % H, a = s.a + b.time * s.va;
      ctx.strokeStyle = rgba(s.c, 0.55);
      ctx.beginPath(); ctx.moveTo(s.x - Math.cos(a) * 6, y - Math.sin(a) * 6); ctx.lineTo(s.x + Math.cos(a) * 6, y + Math.sin(a) * 6); ctx.stroke();
    }
  },
  // the storm's swirl: slow spiral arms of cloud around (x, y)
  vortex(ctx, d, b) {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(b.time * 0.08);
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 5; arm++) {
      ctx.strokeStyle = `rgba(200,215,240,${0.05 + 0.02 * (arm % 2)})`;
      ctx.lineWidth = 50 - arm * 6;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, a = arm * (TAU / 5) + t * 3.2, r = 120 + t * d.r;
        const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.6;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
  // occasional lightning: a jagged bolt and a sky flash
  lightning(ctx, d, b) {
    const per = d.period || 5.5;
    const k = Math.floor(b.time / per), t = b.time - k * per;
    if (t > 0.35) return;
    const r = mulberry((d.seed || 1) * 1000 + k);
    const flick = t < 0.08 || (t > 0.16 && t < 0.24);
    if (!flick) return;
    ctx.fillStyle = 'rgba(200,220,255,0.10)';
    ctx.fillRect(0, 0, W, H);
    let x = 200 + r() * (W - 400), y = -20;
    ctx.strokeStyle = 'rgba(230,240,255,0.85)';
    ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.shadowColor = '#bcd8ff'; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.moveTo(x, y);
    const end = 300 + r() * 500;
    while (y < end) { x += (r() - 0.5) * 90; y += 30 + r() * 50; ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.shadowBlur = 0;
  },
  // slanted rain streaks
  rain(ctx, d, b) {
    if (!d._r) { const r = mulberry(d.seed || 1); d._r = Array.from({ length: d.n || 80 }, () => ({ x: r() * (W + 300), y: r() * H, v: 900 + r() * 500, l: 18 + r() * 22 })); }
    ctx.strokeStyle = d.color || 'rgba(190,210,240,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const p of d._r) {
      const y = (p.y + b.time * p.v) % H;
      const x = ((p.x - y * 0.3) % (W + 300) + W + 300) % (W + 300) - 150;
      ctx.moveTo(x, y); ctx.lineTo(x - p.l * 0.3, y + p.l);
    }
    ctx.stroke();
  },
  // heat shimmer lines above the sand
  heat(ctx, d, b) {
    ctx.strokeStyle = d.color || 'rgba(255,240,210,0.12)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const y0 = d.y - 60 - k * 70;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 40) {
        const y = y0 + Math.sin(x * 0.012 + b.time * 2 + k) * 5;
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  },
};

// a few broad diagonal light streaks so ice reads glossy and slippery
function iceSheen(ctx, path, s) {
  const bb = s.bb, h = bb.y1 - bb.y0;
  const rnd = mulberry(s.i * 97 + 3);
  ctx.save();
  ctx.clip(path);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(200,240,255,0.14)';
  ctx.lineCap = 'round';
  for (let x = bb.x0 - h; x < bb.x1; x += 150 + rnd() * 120) {
    ctx.lineWidth = 10 + rnd() * 22;
    ctx.beginPath(); ctx.moveTo(x, bb.y1); ctx.lineTo(x + h * 0.8, bb.y0); ctx.stroke();
  }
  ctx.restore();
}

// glossy procedural ice: a cold gradient, diagonal sheen streaks and a few
// cracks (until tile_spider_frost_ice.png is delivered)
function drawIce(ctx, path, s) {
  const bb = s.bb;
  ctx.save();
  ctx.clip(path);
  const g = ctx.createLinearGradient(bb.x0, bb.y0, bb.x1 * 0.3 + bb.x0 * 0.7, bb.y1);
  g.addColorStop(0, '#bfeeff'); g.addColorStop(0.45, '#6cc4ec'); g.addColorStop(1, '#2a6f9e');
  ctx.fillStyle = g;
  ctx.fill(path);
  const rnd = mulberry(s.i * 131 + 7);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineCap = 'round';
  for (let x = bb.x0 - (bb.y1 - bb.y0); x < bb.x1; x += 70 + rnd() * 60) {
    ctx.lineWidth = 4 + rnd() * 10;
    ctx.beginPath(); ctx.moveTo(x, bb.y1); ctx.lineTo(x + (bb.y1 - bb.y0) * 0.8, bb.y0); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(20,70,110,0.35)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 6; k++) {
    let x = bb.x0 + rnd() * (bb.x1 - bb.x0), y = bb.y0 + rnd() * (bb.y1 - bb.y0);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 50; y += 10 + rnd() * 25; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  ctx.restore();
}
