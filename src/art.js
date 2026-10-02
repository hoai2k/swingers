// Generated art (see image-requests.md; web copies built by
// tools/build_assets.py into assets/web/). Everything here is optional:
// get() returns null until an image has loaded (or if it's missing), and
// every caller falls back to the procedural drawing in that case.

const BASE = 'assets/web/';
export const THEMES = ['meadow', 'cave', 'sunset', 'jungle', 'factory', 'sky', 'volcano',
  'night', 'candy', 'frost', 'desert', 'storm'];
export const HEADS = ['happy', 'visor', 'grump', 'wink', 'shades', 'screen', 'antenna', 'cyclops'];
export const ICONS = ['rope', 'wheel', 'balloon', 'lift', 'bounce', 'ice', 'crumble', 'wind'];

const images = new Map();

function load(key, file) {
  const img = new Image();
  img.decoding = 'async';
  img.src = BASE + file;
  images.set(key, img);
}

for (const t of THEMES) {
  load('bg:' + t, `bg_${t}.jpg`);
  load('plat:' + t, `tile_plat_${t}.png`);
}
for (const h of HEADS) load('head:' + h, `head_${h}.png`);
for (const i of ICONS) load('icon:' + i, `icon_${i}.png`);
load('lava', 'tile_lava.png');
load('icewater', 'tile_icewater.png');
load('spikes', 'tile_spikes.png');
load('logo', 'logo.png');
load('keyart', 'keyart.jpg');

export function art(key) {
  const img = images.get(key);
  return img && img.complete && img.naturalWidth ? img : null;
}

// Cached canvas patterns (a pattern is tied to a context, and every board
// is drawn on the one game canvas, so one cache is enough).
const patterns = new Map();
export function pattern(ctx, key, src = null) {
  const pk = key + (src ? ':' + src.join(',') : '');
  if (patterns.has(pk)) return patterns.get(pk);
  const img = art(key);
  if (!img) return null;
  let source = img;
  if (src) {
    // a sub-rectangle of the image (e.g. a tile's body below its rim)
    const c = document.createElement('canvas');
    c.width = src[2]; c.height = src[3];
    c.getContext('2d').drawImage(img, src[0], src[1], src[2], src[3], 0, 0, src[2], src[3]);
    source = c;
  }
  const p = ctx.createPattern(source, 'repeat');
  patterns.set(pk, p);
  return p;
}
