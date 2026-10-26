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
// Art is framed differently from face to face, so each is cropped to its
// visible features and scaled to the same width.
const bboxes = new Map();
function featureBox(im) {
  if (bboxes.has(im)) return bboxes.get(im);
  const cv = document.createElement('canvas');
  cv.width = im.width; cv.height = im.height;
  const g = cv.getContext('2d');
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    if (d[(y * cv.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const box = x1 < 0 ? [0, 0, im.width, im.height] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  bboxes.set(im, box);
  return box;
}

const FACE_BOX = [0.24, 0.38, 0.52]; // painted features: max width / height (share of the texture), centre height
export function paintFace(tex, name) {
  return paintOver(tex, `faces/face_${slug(name)}.png`, (g, im, cv) => {
    const W = cv.width, H = cv.height;
    g.fillStyle = '#ffd9b8'; g.fillRect(0, 0, W, H);
    // the head's texture is equirectangular with square pixels (0.7 degrees
    // each), so the features keep their proportions: at most ~86 degrees wide
    // and ~68 tall (a bigger box put the eyes on the forehead and the mouth on
    // the chin), centred just below the head's equator
    const [bx, by, bw, bh] = featureBox(im);
    const k = Math.min(W * FACE_BOX[0] / bw, H * FACE_BOX[1] / bh);
    const dw = bw * k, dh = bh * k;
    g.drawImage(im, bx, by, bw, bh, W * 0.25 - dw / 2, H * FACE_BOX[2] - dh / 2, dw, dh);
  });
}
