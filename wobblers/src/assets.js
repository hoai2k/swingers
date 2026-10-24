// Optional painted art. Everything in the game has a procedural stand-in;
// when an image listed in `assets/manifest.json` exists it replaces the
// stand-in as soon as it loads. The manifest is written by
// `python3 tools/build_manifest.py`, so only files that really exist are
// requested (no 404s). See `image-requests.md` for the list.
let list = new Set();
const cache = new Map();

export async function loadManifest() {
  try {
    const r = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (r.ok) list = new Set(await r.json());
  } catch (e) { /* no manifest: keep the stand-ins */ }
}

export const hasAsset = (path) => list.has(path);

export function loadImage(path) {
  if (!list.has(path)) return null;
  if (!cache.has(path)) {
    cache.set(path, new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = 'assets/' + path;
    }));
  }
  return cache.get(path);
}

// File-name slug for a label: "Cool shades" -> "cool_shades".
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// When `path` arrives, repaint the canvas behind `tex` with `draw(ctx, img, canvas)`.
export function paintOver(tex, path, draw) {
  const p = loadImage(path);
  if (!p) return false;
  p.then((im) => {
    const cv = tex.image;
    draw(cv.getContext('2d'), im, cv);
    tex.needsUpdate = true;
  }).catch(() => {});
  return true;
}

// Faces: the image holds just the features (eyes, brows, mouth) on a
// transparent background; it is laid on skin over the front of the head.
export function paintFace(tex, name) {
  return paintOver(tex, `faces/face_${slug(name)}.png`, (g, im, cv) => {
    const W = cv.width, H = cv.height;
    g.fillStyle = '#ffd9b8'; g.fillRect(0, 0, W, H);
    // the head's texture is equirectangular with square pixels (0.7 degrees
    // each), so a square image stays square; ~105 degrees of the head
    const s = W * 0.29;
    g.drawImage(im, W * 0.25 - s / 2, H * 0.5 - s / 2, s, s);
  });
}
