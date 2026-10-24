// Island map (Wobbly Life's M / View map). An illustrated top-down picture of
// the island is painted once at load (terrain colours + hill shading from the
// terrain grid, sea depth, roads, park zones, buildings and trees read from the
// static colliders); each player's map panel then draws its part of that picture
// in their own split-screen view, with labels, vehicles and every player on top.
//
// The panel is a UI panel (see ui.js setPanel): it captures its device, so the
// player stands still while reading the map. Controls: LS pan, LT/RT zoom
// (mouse wheel too), A re-centre on me, View/M or B/Esc close, D-pad down /
// P switches to the phone.
import { RAPIER } from './physics.js';
import { SEA_LEVEL, PLAYER_CSS } from './config.js';
import { terrainGrid, heightAt, PITS, MOUNTAIN, LAKE } from './terrain.js';
import { ROADS } from './world/roads.js';
import { POOL } from './world/pool.js';
import { HELIPADS } from './world/garage.js';
import { glyph, promptRow, deviceKind } from './glyphs.js';

const EXT = 400;          // world half-size covered by the picture (m)
const S = 2048;           // picture size (px)
const K = S / (EXT * 2);  // picture px per metre

export const AREAS = [
  { name: 'Town', x: -36, z: -40, big: true },
  { name: 'Playground', x: 105, z: -105 },
  { name: 'Swimming Pool', x: 100, z: 124 },
  { name: 'Fun Park', x: -242, z: -10, big: true },
  { name: 'Stunt Park', x: -105, z: 105 },
  { name: 'Sports Field', x: -105, z: -103 },
  { name: 'Kart Track', x: 242.5, z: 0 },
  { name: 'Farm', x: 215, z: -150 },
  { name: 'Mountain', x: MOUNTAIN.x, z: MOUNTAIN.z + 28, big: true },
  { name: 'Lake', x: LAKE.x, z: LAKE.z },
  { name: 'Beach', x: -40, z: 330, big: true },
  { name: 'Helipad', x: HELIPADS[0][0], z: HELIPADS[0][1] - 8 },
  { name: 'Lighthouse', x: 214, z: 236 },
  { name: 'Pier', x: 24, z: 375 },
];

const CSS = `
.ppanel.map { background: rgba(20,50,110,.45); }
.mapcard { pointer-events: auto; position: absolute; background: #fff; border-radius: calc(22px * var(--s,1)); overflow: hidden;
  box-shadow: 0 8px 0 rgba(0,0,0,.18), 0 0 0 calc(5px * var(--s,1)) var(--acc); display: flex; flex-direction: column; animation: cardin .3s cubic-bezier(.3,1.6,.5,1); }
.mapcard .mhead { display: flex; justify-content: space-between; align-items: center; padding: calc(6px * var(--s,1)) calc(16px * var(--s,1));
  font-weight: 900; font-size: calc(18px * var(--s,1)); }
.mapcard .mhead small { font-size: calc(13px * var(--s,1)); opacity: .85; font-weight: 700; }
.mapcard canvas { flex: 1; min-height: 0; width: 100%; display: block; background: #3a9ad6; cursor: grab; }
.mapcard .foot { margin: 0; padding: calc(5px * var(--s,1)) 4px; font-size: calc(13px * var(--s,1)); color: #567; display: flex; justify-content: center; flex-wrap: wrap; gap: 2px 0; font-weight: 700; }
.mapcard .foot .btn, .mapcard .foot .key, .mapcard .foot .trig { transform: scale(var(--s,1)); }
.vpcorner { position: absolute; display: flex; gap: 6px; transform: translateY(-100%); font-size: 12px; font-weight: 800; color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.6); opacity: .8; pointer-events: none; white-space: nowrap; }
.vpcorner .prompt { display: inline-flex; align-items: center; gap: 3px; }
`;
let cssDone = false;
export function injectCSS(css) {
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
}

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------
const mix = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildMapImage(game) {
  if (!cssDone) { injectCSS(CSS); cssDone = true; }
  if (game.islandMap) return game.islandMap;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  paintTerrain(ctx);
  paintZones(ctx);
  paintRoads(ctx);
  paintStatics(ctx, game);
  game.islandMap = cv;
  return cv;
}

function paintTerrain(ctx) {
  const { n, step, ext, pos, col } = terrainGrid;
  const img = ctx.createImageData(S, S), D = img.data;
  const H = new Float32Array(S * S);
  const C = new Float32Array(S * S * 3);
  // bilinear samples of the terrain grid (heights + vertex colours)
  for (let py = 0; py < S; py++) {
    const z = (py + 0.5) / K - EXT;
    const gz = (z + ext) / step, j = Math.max(0, Math.min(n - 2, Math.floor(gz))), fz = Math.min(1, Math.max(0, gz - j));
    for (let px = 0; px < S; px++) {
      const x = (px + 0.5) / K - EXT;
      const gx = (x + ext) / step, i = Math.max(0, Math.min(n - 2, Math.floor(gx))), fx = Math.min(1, Math.max(0, gx - i));
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      const w0 = (1 - fx) * (1 - fz), w1 = fx * (1 - fz), w2 = (1 - fx) * fz, w3 = fx * fz;
      const k = py * S + px;
      H[k] = pos[a * 3 + 1] * w0 + pos[b * 3 + 1] * w1 + pos[c * 3 + 1] * w2 + pos[d * 3 + 1] * w3;
      for (let q = 0; q < 3; q++) C[k * 3 + q] = col[a * 3 + q] * w0 + col[b * 3 + q] * w1 + col[c * 3 + q] * w2 + col[d * 3 + q] * w3;
    }
  }
  // shading, contours, sea
  const lin2s = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
  const shallow = [0.50, 0.88, 0.90], deep = [0.16, 0.52, 0.80], foam = [0.93, 0.98, 1];
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const k = py * S + px, h = H[k];
    const hl = H[k - (px > 0 ? 1 : 0)], hr = H[k + (px < S - 1 ? 1 : 0)], hu = H[k - (py > 0 ? S : 0)], hd = H[k + (py < S - 1 ? S : 0)];
    let r, g, b;
    const depth = SEA_LEVEL - h;
    if (depth > 0) {
      const t = sm(0, 7, depth);
      r = mix(shallow[0], deep[0], t); g = mix(shallow[1], deep[1], t); b = mix(shallow[2], deep[2], t);
      const f = 1 - sm(0.05, 0.45, depth);
      r = mix(r, foam[0], f * 0.75); g = mix(g, foam[1], f * 0.75); b = mix(b, foam[2], f * 0.75);
      // gentle ripples in deep water
      const x = px / K, z = py / K;
      const rip = Math.sin(x * 0.21 + Math.sin(z * 0.05) * 3) * Math.sin(z * 0.17 + Math.sin(x * 0.04) * 2);
      if (rip > 0.93 && depth > 2.5) { r += 0.07; g += 0.07; b += 0.06; }
      // srgb-ish: colours above are already display values
      D[k * 4] = Math.round(255 * Math.min(1, r)); D[k * 4 + 1] = Math.round(255 * Math.min(1, g)); D[k * 4 + 2] = Math.round(255 * Math.min(1, b)); D[k * 4 + 3] = 255;
      continue;
    }
    r = C[k * 3]; g = C[k * 3 + 1]; b = C[k * 3 + 2];
    // hill shading: light from the north-west, in metres per metre
    const dx = (hr - hl) * K / 2, dz = (hd - hu) * K / 2;
    const sh = Math.max(-0.45, Math.min(0.45, (-dx - dz) * 0.35));
    const m = 1 + sh;
    r *= m; g *= m; b *= m;
    // contour lines every 6 m on the hills
    if (h > 1.2) {
      const c0 = Math.floor(h / 6), c1 = Math.floor(hr / 6), c2 = Math.floor(hd / 6);
      if (c0 !== c1 || c0 !== c2) { r *= 0.86; g *= 0.86; b *= 0.82; }
    }
    // coastline: a dark sandy edge
    if (hl < SEA_LEVEL || hr < SEA_LEVEL || hu < SEA_LEVEL || hd < SEA_LEVEL) { r *= 0.8; g *= 0.74; b *= 0.6; }
    D[k * 4] = lin2s(r); D[k * 4 + 1] = lin2s(g); D[k * 4 + 2] = lin2s(b); D[k * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const P = (x) => (x + EXT) * K;
function rrect(ctx, x0, z0, x1, z1, r) {
  const a = P(Math.min(x0, x1)), b = P(Math.min(z0, z1)), w = Math.abs(x1 - x0) * K, h = Math.abs(z1 - z0) * K;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(a, b, w, h, r * K) : ctx.rect(a, b, w, h);
}
function zone(ctx, x0, z0, x1, z1, fill, stroke, r = 6) {
  rrect(ctx, x0, z0, x1, z1, r);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.setLineDash([3 * K, 2 * K]); ctx.lineWidth = 0.8 * K; ctx.strokeStyle = stroke; ctx.stroke(); ctx.setLineDash([]); }
}

function paintZones(ctx) {
  ctx.save();
  // town blocks
  zone(ctx, -72, -72, 72, 72, 'rgba(246,234,214,.55)', 'rgba(170,140,100,.5)', 10);
  // fun park
  zone(ctx, -300, -105, -188, 105, 'rgba(255,190,215,.45)', 'rgba(220,90,140,.6)', 8);
  ctx.fillStyle = '#e9d6a8';
  for (const [x, z, w, d] of [[-242, 0, 108, 8], [-215, 0, 8, 150], [-262, 0, 8, 150]]) ctx.fillRect(P(x - w / 2), P(z - d / 2), w * K, d * K);
  // playground: rubber ground with coloured pads
  const pg = [105, -105];
  zone(ctx, pg[0] - 36, pg[1] - 36, pg[0] + 36, pg[1] + 36, '#a5e392', 'rgba(60,140,60,.5)', 6);
  for (const [dx, dz, w, d, c] of [[-15, -18, 28, 18, '#ff9a6a'], [18, -14, 22, 22, '#6ac8ff'], [10, 22, 34, 14, '#ffd96a']]) {
    rrect(ctx, pg[0] + dx - w / 2, pg[1] + dz - d / 2, pg[0] + dx + w / 2, pg[1] + dz + d / 2, 3); ctx.fillStyle = c; ctx.fill();
  }
  // stunt park concrete
  zone(ctx, -143, 67, -67, 143, '#c3c8cd', 'rgba(90,95,105,.6)', 4);
  // sports field: pitch, stripes, lines, court, car park
  const sx = -105, sz = -103, PW = 56, PD = 34;
  rrect(ctx, sx - PW / 2 - 3, sz - PD / 2 - 3, sx + PW / 2 + 3, sz + PD / 2 + 3, 2); ctx.fillStyle = '#55b84a'; ctx.fill();
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#5cc24f' : '#4fae45'; ctx.fillRect(P(sx - PW / 2 + i * PW / 8), P(sz - PD / 2), PW / 8 * K, PD * K); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5 * K;
  ctx.strokeRect(P(sx - PW / 2), P(sz - PD / 2), PW * K, PD * K);
  ctx.beginPath(); ctx.moveTo(P(sx), P(sz - PD / 2)); ctx.lineTo(P(sx), P(sz + PD / 2)); ctx.stroke();
  ctx.beginPath(); ctx.arc(P(sx), P(sz), 5 * K, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#d9824a'; ctx.fillRect(P(sx + 2 - 9), P(sz + PD / 2 + 11 - 6), 18 * K, 12 * K);
  ctx.fillStyle = '#5a5d66'; ctx.fillRect(P(sx - 30), P(-137 - 6), 60 * K, 12 * K);
  // pool: deck, water, lanes
  rrect(ctx, 78, 84, 122, 116, 2); ctx.fillStyle = '#f2e4c8'; ctx.fill();
  rrect(ctx, POOL.x0, POOL.z0, POOL.x1, POOL.z1, 1); ctx.fillStyle = '#47c8ff'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5 * K; ctx.stroke();
  ctx.strokeStyle = 'rgba(42,98,201,.5)'; ctx.lineWidth = 0.3 * K;
  for (let i = 0; i < 5; i++) { const z = 94.8 + i * 2.6 + 0.6; ctx.beginPath(); ctx.moveTo(P(94), P(z)); ctx.lineTo(P(106), P(z)); ctx.stroke(); }
  // kart track: oval with kerbs
  const cx = 242.5, R = 37.5, half = 50, W = 12;
  const oval = () => { ctx.beginPath(); ctx.moveTo(P(cx - R), P(-half)); ctx.lineTo(P(cx - R), P(half)); ctx.arc(P(cx), P(half), R * K, Math.PI, 0, true); ctx.lineTo(P(cx + R), P(-half)); ctx.arc(P(cx), P(-half), R * K, 0, Math.PI, true); ctx.closePath(); };
  oval(); ctx.lineWidth = (W + 2) * K; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.setLineDash([3 * K, 3 * K]); ctx.strokeStyle = '#e2393a'; ctx.stroke(); ctx.setLineDash([]);
  oval(); ctx.lineWidth = W * K; ctx.strokeStyle = '#555963'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(P(cx - R - W / 2), P(-1), W * K, 2 * K);
  // farm crops
  const fx = 215, fz = -165;
  for (let r = 0; r < 6; r++) { ctx.fillStyle = r % 2 ? '#6fd055' : '#ffa23a'; ctx.fillRect(P(fx + 21.5), P(fz - 10 + r * 3 - 0.6), 19 * K, 1.2 * K); }
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.35 * K; ctx.beginPath(); ctx.moveTo(P(fx - 15), P(fz + 8)); ctx.lineTo(P(fx + 15), P(fz + 8)); ctx.stroke();
  // helipad
  for (const [hx, hz] of HELIPADS) {
    ctx.fillStyle = '#5a5d66'; ctx.fillRect(P(hx - 4.5), P(hz - 4.5), 9 * K, 9 * K);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 0.4 * K; ctx.strokeRect(P(hx - 3.7), P(hz - 3.7), 7.4 * K, 7.4 * K);
    ctx.fillStyle = '#fff';
    // the H is drawn along the pad's long axis (garage.js: bars run along z, turned by the pad)
    ctx.fillRect(P(hx - 1.8), P(hz - 1.6), 3.6 * K, 0.6 * K); ctx.fillRect(P(hx - 1.8), P(hz + 1.0), 3.6 * K, 0.6 * K); ctx.fillRect(P(hx - 0.3), P(hz - 1.0), 0.6 * K, 2.0 * K);
  }
  // beach car park
  ctx.fillStyle = '#5a5d66'; ctx.fillRect(P(-20), P(295), 40 * K, 14 * K);
  ctx.restore();
}

function paintRoads(ctx) {
  ctx.save();
  ctx.lineCap = 'square';
  const seg = (x0, z0, x1, z1) => { ctx.beginPath(); ctx.moveTo(P(x0), P(z0)); ctx.lineTo(P(x1), P(z1)); ctx.stroke(); };
  // pavements in town, then asphalt, then centre dashes
  for (const [x0, z0, x1, z1, w] of ROADS) {
    const town = Math.max(Math.abs(x0), Math.abs(x1)) <= 66 && Math.max(Math.abs(z0), Math.abs(z1)) <= 66;
    ctx.strokeStyle = town ? '#d8d0c2' : 'rgba(60,62,70,.35)'; ctx.lineWidth = (w + (town ? 5.6 : 1.5)) * K; seg(x0, z0, x1, z1);
  }
  ctx.strokeStyle = '#5b5f69';
  for (const [x0, z0, x1, z1, w] of ROADS) { ctx.lineWidth = w * K; seg(x0, z0, x1, z1); }
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.35 * K; ctx.setLineDash([2.6 * K, 3.4 * K]);
  for (const [x0, z0, x1, z1] of ROADS) seg(x0, z0, x1, z1);
  ctx.setLineDash([]);
  // plaza + fountain
  ctx.fillStyle = '#e6d6b8'; ctx.fillRect(P(-20), P(-20), 40 * K, 40 * K);
  ctx.strokeStyle = '#d2bf9c'; ctx.lineWidth = 0.3 * K;
  for (let i = -3; i <= 3; i++) { seg(i * 5.5, -20, i * 5.5, 20); seg(-20, i * 5.5, 20, i * 5.5); }
  ctx.beginPath(); ctx.arc(P(0), P(0), 5.5 * K, 0, Math.PI * 2); ctx.fillStyle = '#f0ece4'; ctx.fill();
  ctx.beginPath(); ctx.arc(P(0), P(0), 4.9 * K, 0, Math.PI * 2); ctx.fillStyle = '#6fdcff'; ctx.fill();
  ctx.restore();
}

// Buildings, walls and trees from the static colliders.
function paintStatics(ctx, game) {
  const ph = game.physics, sb = ph.staticBody;
  const boxes = [], trees = [];
  const inPit = (x, z) => PITS.some((p) => x >= p[0] - 5 && x <= p[1] + 5 && z >= p[2] - 5 && z <= p[3] + 5);
  ph.world.forEachCollider((c) => {
    const par = c.parent();
    if (!par || par.handle !== sb.handle || c.isSensor()) return;
    const t = c.translation(), ty = c.shapeType();
    if (ty === RAPIER.ShapeType.Cuboid) {
      const he = c.halfExtents(), r = c.rotation();
      // only upright boxes (yaw); tilted ones are ramps and roofs slabs
      if (Math.abs(r.x) > 0.2 || Math.abs(r.z) > 0.2) return;
      if (he.x > 45 || he.z > 45) return;
      const g = inPit(t.x, t.z) ? 0 : heightAt(t.x, t.z);
      const top = t.y + he.y, tall = top - Math.max(g, SEA_LEVEL);
      if (tall < 1.9 || he.x * he.z < 0.25) return;
      boxes.push({ x: t.x, z: t.z, hx: he.x, hz: he.z, yaw: 2 * Math.atan2(r.y, r.w), top: tall });
    } else if (ty === RAPIER.ShapeType.Cylinder) {
      const rr = c.radius(), hh = c.halfHeight();
      if (rr > 0.2 && rr < 0.5 && hh > 1.1 && hh < 2.0) trees.push({ x: t.x, z: t.z, s: rr / 0.3 });
    }
  });
  boxes.sort((a, b) => a.top - b.top);
  ctx.save();
  // soft shadows first, then roofs
  for (const pass of [0, 1]) for (const b of boxes) {
    ctx.save();
    const off = pass ? 0 : Math.min(3, 0.6 + b.top * 0.12) * K;
    ctx.translate(P(b.x) + off, P(b.z) + off);
    ctx.rotate(-b.yaw);
    const w = b.hx * 2 * K, d = b.hz * 2 * K, thin = Math.min(w, d) < 1.2 * K;
    ctx.beginPath();
    if (ctx.roundRect && !thin) ctx.roundRect(-w / 2, -d / 2, w, d, Math.min(w, d) * 0.12); else ctx.rect(-w / 2, -d / 2, w, d);
    if (!pass) { ctx.fillStyle = 'rgba(30,40,60,.22)'; ctx.fill(); }
    else {
      const l = Math.min(1, b.top / 14);
      ctx.fillStyle = thin ? '#8a7f74' : `rgb(${Math.round(mix(246, 226, l))},${Math.round(mix(232, 205, l))},${Math.round(mix(214, 196, l))})`;
      ctx.fill();
      if (!thin) { ctx.lineWidth = 0.35 * K; ctx.strokeStyle = 'rgba(120,96,70,.7)'; ctx.stroke(); }
    }
    ctx.restore();
  }
  for (const t of trees) {
    const r = 1.9 * t.s * K;
    ctx.beginPath(); ctx.arc(P(t.x) + 0.7 * K, P(t.z) + 0.7 * K, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,60,30,.25)'; ctx.fill();
    ctx.beginPath(); ctx.arc(P(t.x), P(t.z), r, 0, Math.PI * 2);
    ctx.fillStyle = (Math.abs(t.x * 7 + t.z * 13) | 0) % 2 ? '#3f9e45' : '#4bb04c'; ctx.fill();
    ctx.lineWidth = 0.3 * K; ctx.strokeStyle = 'rgba(25,80,35,.6)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(P(t.x) - r * 0.3, P(t.z) - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The per-player panel
// ---------------------------------------------------------------------------
const textCol = (c) => (c === 0xffffff || c === 0xffc233 || c === 0x3fe0d0) ? '#234' : '#fff';
const accent = (c) => PLAYER_CSS(c === 0xffffff ? 0x2a62c9 : c);

export class MapPanel {
  constructor(ui, player) {
    if (!cssDone) { injectCSS(CSS); cssDone = true; }
    this.ui = ui; this.p = player; this.kind = 'map';
    this.img = buildMapImage(ui.game);
    this.t0 = performance.now(); this.last = this.t0;
    this.el = document.createElement('div');
    this.el.className = 'ppanel map';
    const p = player, k = deviceKind(p.deviceId);
    this.el.innerHTML = `<div class="mapcard" style="--acc:${accent(p.color)}">
      <div class="mhead" style="background:${accent(p.color)};color:${textCol(p.color === 0xffffff ? 0x2a62c9 : p.color)}">Wobbly Island<small>Player ${p.index + 1}</small></div>
      <canvas></canvas>
      <div class="foot">${promptRow([['LS', 'Pan'], ['LT', 'Zoom out'], ['RT', 'Zoom in'], ['OK', 'Me'], ['MENUBACK', 'Close']], k)}</div></div>`;
    this.card = this.el.firstElementChild;
    this.cv = this.el.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    ui.hud.appendChild(this.el);
    // view: centre (x, z) in metres, zoom in screen px per metre (null = fit the island)
    const c = player.chest.translation();
    this.cx = 0; this.cz = 10; this.zoom = null; this.me = { x: c.x, z: c.z };
    this.el.addEventListener('wheel', (e) => { this.zoomBy(e.deltaY > 0 ? 1 / 1.25 : 1.25); e.preventDefault(); }, { passive: false });
    let drag = null;
    this.cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; this.cv.setPointerCapture?.(e.pointerId); });
    this.cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const z = this.zoomNow();
      this.cx -= (e.clientX - drag.x) / z; this.cz -= (e.clientY - drag.y) / z;
      drag = { x: e.clientX, y: e.clientY };
    });
    this.cv.addEventListener('pointerup', () => { drag = null; });
  }
  remove() { this.el.remove(); }
  draw() {}
  fit() { return Math.min(this.W, this.H) / 760; }
  zoomNow() { return this.zoom ?? this.fit(); }
  zoomBy(f) {
    const fit = this.fit();
    this.zoom = Math.max(fit * 0.9, Math.min(8, this.zoomNow() * f));
  }

  input(n) {
    if (performance.now() - this.t0 < 250) return;
    const d = this.ui.game.input.get(this.p.deviceId), pr = d?.rawPressed || {};
    if (pr.map || n.back || (this.p.deviceId === 'kb1' && n.start)) { this.ui.sfx('uiBack'); this.ui.closePanel(this.p); return; }
    if (pr.phone) { this.ui.openPhone(this.p); return; }
    if (n.ok) {
      // re-centre on me, zoomed in
      this.cx = this.me.x; this.cz = this.me.z;
      this.zoom = Math.max(this.zoomNow(), this.fit() * 3);
      this.ui.sfx('uiSelect');
    }
  }

  place(rect) {
    const [x, y, w, h] = rect;
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    const s = Math.max(0.5, Math.min(1, w / 640, h / 480));
    this.s = s;
    const m = Math.max(8, Math.min(w, h) * 0.04);
    Object.assign(this.card.style, { left: m + 'px', top: m + 'px', width: w - m * 2 + 'px', height: h - m * 2 + 'px' });
    this.card.style.setProperty('--s', s.toFixed(3));
    const cw = Math.max(16, Math.round(this.cv.clientWidth)), ch = Math.max(16, Math.round(this.cv.clientHeight));
    if (this.cv.width !== cw || this.cv.height !== ch) { this.cv.width = cw; this.cv.height = ch; }
    this.W = cw; this.H = ch;
    this.update();
    this.render();
  }

  // stick panning and trigger zoom, frame-rate independent
  update() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (now - this.t0 < 250) return;
    const d = this.ui.game.input.get(this.p.deviceId), st = d?.raw;
    if (!st) return;
    const z = this.zoomNow();
    const speed = 520 / z; // screen px per second, in metres
    this.cx += (st.moveX || 0) * speed * dt;
    this.cz -= (st.moveY || 0) * speed * dt;
    const zin = (st.grabR || 0) - (st.grabL || 0);
    if (Math.abs(zin) > 0.1) this.zoomBy(Math.pow(2.2, zin * dt));
    this.cx = Math.max(-EXT, Math.min(EXT, this.cx)); this.cz = Math.max(-EXT, Math.min(EXT, this.cz));
  }

  render() {
    const g = this.ui.game, ctx = this.ctx, W = this.W, H = this.H, z = this.zoomNow(), s = this.s || 1;
    const sx = (x) => W / 2 + (x - this.cx) * z, sy = (wz) => H / 2 + (wz - this.cz) * z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2a86cb'; ctx.fillRect(0, 0, W, H);
    // the picture: source rect for the visible window
    const x0 = this.cx - W / 2 / z, z0 = this.cz - H / 2 / z;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, (x0 + EXT) * K, (z0 + EXT) * K, W / z * K, H / z * K, 0, 0, W, H);
    // labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tiny = Math.min(W, H) < 280 && z < this.fit() * 1.8; // small split views: only the big names
    for (const a of AREAS) {
      if (tiny && !a.big) continue;
      const X = sx(a.x), Y = sy(a.z);
      if (X < -80 || X > W + 80 || Y < -20 || Y > H + 20) continue;
      const fs = Math.round((a.big ? 15 : 12) * Math.max(0.6, s) * Math.min(1.5, Math.max(0.85, z / this.fit() * 0.6)));
      ctx.font = `900 ${fs}px "Trebuchet MS", "Arial Rounded MT Bold", sans-serif`;
      const tw = ctx.measureText(a.name).width;
      ctx.fillStyle = 'rgba(255,255,255,.82)';
      pill(ctx, X - tw / 2 - fs * 0.5, Y - fs * 0.72, tw + fs, fs * 1.44, fs * 0.72); ctx.fill();
      ctx.fillStyle = '#1f3354'; ctx.fillText(a.name, X, Y + 1);
    }
    // compass
    const cr = 14 * s + 4;
    ctx.save(); ctx.translate(W - cr - 8, cr * 1.7 + 8);
    ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -cr * 0.8); ctx.lineTo(cr * 0.32, 0); ctx.lineTo(-cr * 0.32, 0); ctx.closePath(); ctx.fillStyle = '#e2393a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, cr * 0.8); ctx.lineTo(cr * 0.32, 0); ctx.lineTo(-cr * 0.32, 0); ctx.closePath(); ctx.fillStyle = '#9aa7b5'; ctx.fill();
    ctx.font = `900 ${Math.round(cr * 0.62)}px sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText('N', 0, -cr * 1.32);
    ctx.restore();
    // vehicles
    const mine = g.calledVehicles?.get(this.p);
    for (const v of g.vehicles) {
      const t = v.body.translation(), X = sx(t.x), Y = sy(t.z);
      if (X < -10 || X > W + 10 || Y < -10 || Y > H + 10) continue;
      const own = v === mine, r = (own ? 5 : 3) * Math.max(0.7, s) * Math.min(1.6, Math.max(1, z / this.fit() * 0.5));
      ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2);
      ctx.fillStyle = own ? PLAYER_CSS(this.p.color) : '#fff'; ctx.fill();
      ctx.lineWidth = own ? 2 : 1.2; ctx.strokeStyle = '#1f3354'; ctx.stroke();
    }
    // players: others first, me on top
    const t = performance.now() / 1000;
    const ps = [...g.players].sort((a, b) => (a === this.p) - (b === this.p));
    for (const q of ps) {
      const c = q.chest.translation(), X = sx(c.x), Y = sy(c.z), me = q === this.p;
      if (me) this.me = { x: c.x, z: c.z };
      const r = (me ? 12 : 9) * Math.max(0.65, s);
      const cX = Math.max(r, Math.min(W - r, X)), cY = Math.max(r, Math.min(H - r, Y)); // off-map players stick to the edge
      ctx.save(); ctx.translate(cX, cY);
      if (me) {
        ctx.beginPath(); ctx.arc(0, 0, r * (1.5 + 0.35 * Math.sin(t * 4)), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
        // heading arrow (screen: +x right = world +x, down = world +z)
        const a = Math.atan2(Math.cos(q.yaw), Math.sin(q.yaw));
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(r * 2.0, 0); ctx.lineTo(r * 0.75, -r * 0.75); ctx.lineTo(r * 0.75, r * 0.75); ctx.closePath();
        ctx.fillStyle = PLAYER_CSS(q.color); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_CSS(q.color); ctx.fill();
      ctx.lineWidth = me ? 3 : 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = `900 ${Math.round(r * 0.95)}px "Trebuchet MS", sans-serif`;
      ctx.fillStyle = textCol(q.color); ctx.fillText('P' + (q.index + 1), 0, 1);
      ctx.restore();
    }
  }
}

function pill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

// Small "Map / Phone" prompt for a view's corner (ui.js shows it when there is room).
export function cornerHintHTML(kind) {
  return `<span class="prompt">${glyph('MAP', kind)}<span>Map</span></span><span class="prompt">${glyph('PHONE', kind)}<span>Phone</span></span>`;
}
export { CSS as MAP_CSS };
