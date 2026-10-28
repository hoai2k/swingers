// Delivered sprite art (assets/web/, image-requests-history.md round 2):
// weapons, insects, icons, cards, props... One place to look images up,
// cut animation strips into frames, trim each frame to its painted pixels
// and tint white glyphs.
//
//   sprite(name)            -> the image once it has loaded, else null
//                              (callers keep their drawn fallback)
//   frames(name, n)         -> [{ sx, sy, sw, sh, cx, cy }] painted bounds of
//                              each of n equal frames (cx, cy: centre of the
//                              painted part inside the frame), or null
//   drawSprite(ctx, name, x, y, size, opts)
//       draws the painted part of a frame, scaled so its larger side is
//       `size` and centred on x, y.  opts: { frame, of, flip, rot, alpha,
//       anchor: [ax, ay] (0..1 inside the painted part, default 0.5, 0.5),
//       fit: 'w' | 'h' (scale that side to size instead of the larger) }
//   tinted(name, color)     -> a canvas of a white glyph recoloured (dark
//                              outline kept), or null
//
// Register every name at import time with preloadSprites([...]) so the boot
// loading bar waits for them (CLAUDE.md: no stand-in drawings on the title).

import { optionalImage, ready } from './optional-art.js';

export function preloadSprites(names) { for (const n of names) optionalImage(n); }

export function sprite(name) {
  const img = optionalImage(name).img;
  return ready(img) ? img : null;
}

const boundsCache = new Map();
export function frames(name, n = 1) {
  const img = sprite(name);
  if (!img) return null;
  const key = name + '#' + n;
  if (boundsCache.has(key)) return boundsCache.get(key);
  const fw = Math.floor(img.naturalWidth / n), fh = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = fh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  let data = null;
  try { data = x.getImageData(0, 0, c.width, fh).data; } catch (e) { data = null; }
  const out = [];
  for (let f = 0; f < n; f++) {
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    if (data) {
      for (let y = 0; y < fh; y++) {
        const row = y * c.width * 4;
        for (let xx = 0; xx < fw; xx++) {
          if (data[row + (f * fw + xx) * 4 + 3] > 24) {
            if (xx < x0) x0 = xx; if (xx > x1) x1 = xx;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = fw - 1; y1 = fh - 1; }
    out.push({ sx: f * fw + x0, sy: y0, sw: x1 - x0 + 1, sh: y1 - y0 + 1, fw, fh, ox: x0, oy: y0 });
  }
  // one shared box per strip, so an animation doesn't jitter or change size
  if (n > 1) {
    const ux0 = Math.min(...out.map((b) => b.ox)), uy0 = Math.min(...out.map((b) => b.oy));
    const ux1 = Math.max(...out.map((b) => b.ox + b.sw)), uy1 = Math.max(...out.map((b) => b.oy + b.sh));
    out.forEach((b, f) => { b.sx = f * fw + ux0; b.sy = uy0; b.sw = ux1 - ux0; b.sh = uy1 - uy0; });
  }
  boundsCache.set(key, out);
  return out;
}

export function drawSprite(ctx, name, x, y, size, opts = {}) {
  const img = opts.canvas || sprite(name);
  if (!img) return false;
  const fr = opts.canvas ? [{ sx: 0, sy: 0, sw: img.width, sh: img.height }] : frames(name, opts.of || 1);
  if (!fr) return false;
  const b = fr[((opts.frame | 0) % fr.length + fr.length) % fr.length];
  const s = opts.fit === 'w' ? size / b.sw : opts.fit === 'h' ? size / b.sh : size / Math.max(b.sw, b.sh);
  const w = b.sw * s, h = b.sh * s;
  const [ax, ay] = opts.anchor || [0.5, 0.5];
  ctx.save();
  ctx.translate(x, y);
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.flip) ctx.scale(-1, 1);
  if (opts.flipY) ctx.scale(1, -1);
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  ctx.drawImage(img, b.sx, b.sy, b.sw, b.sh, -ax * w, -ay * h, w, h);
  ctx.restore();
  return true;
}

const tintCache = new Map();
export function tinted(name, color) {
  const img = sprite(name);
  if (!img) return null;
  const key = name + '|' + color;
  if (tintCache.has(key)) return tintCache.get(key);
  const b = frames(name, 1)[0];
  const c = document.createElement('canvas');
  c.width = b.sw; c.height = b.sh;
  const x = c.getContext('2d');
  x.drawImage(img, b.sx, b.sy, b.sw, b.sh, 0, 0, b.sw, b.sh);
  // multiply keeps the dark outline and shading, white becomes the colour
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = color;
  x.fillRect(0, 0, b.sw, b.sh);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(img, b.sx, b.sy, b.sw, b.sh, 0, 0, b.sw, b.sh);
  tintCache.set(key, c);
  return c;
}
