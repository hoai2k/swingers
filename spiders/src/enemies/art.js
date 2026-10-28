// Delivered insect art (assets/web/bug_*.png, boss_tyrant*.png, round 2
// section E): horizontal animation strips drawn through sprites.js. Each
// enemy's drawBody asks drawBug() for a frame; when the strip hasn't loaded
// it returns false and the procedural drawing in base.js / insects.js runs.
//
//   BUGS[name] = { of: frames in the strip, k: drawn size in units of the
//                  enemy's r (larger side of the strip's shared painted box),
//                  fit: 'w' | 'h' (optional), left: painted facing left,
//                  ax, ay: anchor inside the painted box (thorax on x, y) }
//   drawBug(ctx, e, name, frame, { x, y, rot, alpha, k, face })
//       draws the frame mirrored to e.facing (or face) and remembers it on
//       e._spr so Enemy.draw can flash the same silhouette on a hit.
//   drawSil(ctx, e, color, alpha) -> silhouette of the last drawBug frame
//   flap(e, n, fps) -> frame index of an n-frame loop driven by e.t

import { preloadSprites, sprite, frames } from '../sprites.js';

export const BUGS = {
  'bug_stinglet.png':   { of: 6, k: 3.1, ax: 0.5, ay: 0.5 },
  'bug_gnatling.png':   { of: 4, k: 3.8, ax: 0.5, ay: 0.5 },
  'bug_buzzgunner.png': { of: 6, k: 3.1, ax: 0.5, ay: 0.48 },
  'bug_bladewing.png':  { of: 5, k: 3.3, ax: 0.5, ay: 0.55 },
  'bug_shellback.png':  { of: 5, k: 3.0, ax: 0.5, ay: 0.55 },
  'bug_dropmoth.png':   { of: 6, k: 3.4, ax: 0.5, ay: 0.45 },
  'bug_hexfly.png':     { of: 5, k: 3.2, ax: 0.5, ay: 0.5, left: true },
  'boss_tyrant.png':      { of: 8, k: 3.4, fit: 'h', ax: 0.5, ay: 0.52 },
  'boss_tyrant_rage.png': { of: 8, k: 3.4, fit: 'h', ax: 0.5, ay: 0.52 },
};
preloadSprites([...Object.keys(BUGS), 'bug_hexfly_rune.png', 'proj_stinger.png', 'proj_bomb_strip.png']);

export function flap(e, n, fps, from = 0) { return from + (Math.floor(e.t * fps) % n); }

// the painted box of `frame` scaled for draw: { b, w, h } or null
function box(name, frame, size, fit) {
  const fr = frames(name, BUGS[name] ? BUGS[name].of : 1);
  if (!fr) return null;
  const b = fr[((frame | 0) % fr.length + fr.length) % fr.length];
  const s = fit === 'w' ? size / b.sw : fit === 'h' ? size / b.sh : size / Math.max(b.sw, b.sh);
  return { b, w: b.sw * s, h: b.sh * s };
}

function blit(ctx, img, d) {
  const { bx, x, y, rot, flip, ax, ay } = d;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, bx.b.sx, bx.b.sy, bx.b.sw, bx.b.sh, -ax * bx.w, -ay * bx.h, bx.w, bx.h);
  ctx.restore();
}

export function drawBug(ctx, e, name, frame, o = {}) {
  const spec = BUGS[name];
  const img = sprite(name);
  if (!spec || !img) return false;
  const bx = box(name, frame, e.r * (o.k || spec.k), spec.fit);
  if (!bx) return false;
  const face = o.face ?? e.facing;
  const d = { name, bx, x: o.x ?? e.x, y: o.y ?? e.y, rot: (o.rot || 0) * (face < 0 ? -1 : 1), flip: (face < 0) !== !!spec.left, ax: spec.ax, ay: spec.ay };
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  blit(ctx, img, d);
  ctx.restore();
  e._spr = d;
  return true;
}

// a solid-colour copy of a whole strip (hit flash, blink), cached
const silCache = new Map();
function silhouette(name, color) {
  const key = name + '|' + color;
  if (silCache.has(key)) return silCache.get(key);
  const img = sprite(name);
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  silCache.set(key, c);
  return c;
}

export function drawSil(ctx, e, color, alpha) {
  const d = e._spr;
  if (!d) return false;
  const c = silhouette(d.name, color);
  if (!c) return false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  blit(ctx, c, d);
  ctx.restore();
  return true;
}

// a single-image sprite (rune, stinger, bomb) at x, y, `size` on its larger side
export function drawArt(ctx, name, x, y, size, { frame = 0, of = 1, rot = 0, alpha } = {}) {
  const img = sprite(name);
  if (!img) return false;
  const fr = frames(name, of);
  if (!fr) return false;
  const b = fr[frame % fr.length];
  const s = size / Math.max(b.sw, b.sh), w = b.sw * s, h = b.sh * s;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (alpha != null) ctx.globalAlpha *= alpha;
  ctx.drawImage(img, b.sx, b.sy, b.sw, b.sh, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}
