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
// Where each painted face's eyes are ([x0, x1, y0, y1] in the 512 px source image), for its
// closed-eye (blink) version: those pixels are cleared (blush pinks kept) and a closed-eye
// curve is drawn instead. Found by blob detection and checked by eye; faces whose eyes are
// hidden (shades, robot) don't blink.
export const FACE_EYES = {
  happy: [[72, 208, 180, 308], [300, 436, 180, 308]],
  surprised: [[104, 228, 136, 348], [280, 404, 136, 348]],
  lashes: [[92, 232, 184, 344], [276, 416, 184, 344]],
  grumpy: [[120, 220, 216, 262], [288, 388, 216, 262]],
  star_eyes: [[40, 224, 120, 292], [284, 468, 120, 292]],
  moustache: [[76, 212, 160, 284], [296, 428, 160, 284]],
  heart_eyes: [[36, 240, 116, 276], [268, 472, 116, 276]],
  tongue_out: [[64, 224, 136, 288], [284, 444, 136, 288]],
  dizzy: [[44, 224, 148, 304], [280, 464, 148, 304]],
  nerd: [[124, 184, 204, 264], [320, 380, 204, 264]],
};
// Every face blinks its own way (blink.js plays frames 1..n, then back to the open face 0):
//  - default: the eyes close (one frame; FACE_EYES / the drawn eye spots);
//  - lift: sunglasses rise for an instant (a nose wrinkle: rows [y0, y1] of the art move dy px);
//  - flash: the robot's screens light up;
//  - beat: heart eyes swell bigger and back (a scale per frame);
//  - spin: spiral eyes turn a full circle (spin frames).
export const FACE_BLINK = {
  cool_shades: { lift: [128, 318], dy: -18 },
  robot: { flash: [[83, 206, 180, 289], [305, 427, 181, 289]] },
  heart_eyes: { beat: [1.12, 1.24, 1.12], t: 0.09 },
  dizzy: { spin: 7, t: 0.07 },
};
// Number of blink frames for a face (by name) and how long each shows.
export function blinkFrames(name) { const b = FACE_BLINK[slug(name)]; return b?.beat ? b.beat.length : b?.spin || 1; }
export function blinkFrameTime(name) { return FACE_BLINK[slug(name)]?.t ?? 0.13; }
// Move an eye: its pixels in an ellipse (blush pinks left where they are) are lifted off and
// drawn back turned by `angle` and scaled by `scale` round the eye's centre.
export function warpEye(g, cx, cy, rx, ry, angle, scale) {
  const x0 = Math.max(0, Math.floor(cx - rx)), y0 = Math.max(0, Math.floor(cy - ry));
  const w = Math.ceil(rx * 2), h = Math.ceil(ry * 2);
  const img = g.getImageData(x0, y0, w, h), d = img.data;
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
  const t = tmp.getContext('2d'), out = t.createImageData(w, h), o = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ux = (x0 + x - cx) / rx, uy = (y0 + y - cy) / ry, i = (y * w + x) * 4;
    if (ux * ux + uy * uy > 1) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r > 200 && r - gg > 50 && b > 90) continue; // blush stays
    o[i] = r; o[i + 1] = gg; o[i + 2] = b; o[i + 3] = d[i + 3]; d[i + 3] = 0;
  }
  g.putImageData(img, x0, y0);
  t.putImageData(out, 0, 0);
  g.save(); g.translate(cx, cy); g.rotate(angle); g.scale(scale, scale);
  g.drawImage(tmp, x0 - cx, y0 - cy); g.restore();
}
// Apply blink frame `frame` (>= 1) of a face to eyes at [[cx, cy, rx, ry], ...] (canvas px).
export function blinkEyes(g, name, frame, eyes) {
  const b = FACE_BLINK[slug(name)];
  for (const [cx, cy, rx, ry] of eyes) {
    if (b?.beat) warpEye(g, cx, cy, rx, ry, 0, b.beat[frame - 1] ?? 1);
    else if (b?.spin) { const r = Math.min(rx, ry) * 0.95; warpEye(g, cx, cy, r, r, frame / (b.spin + 1) * Math.PI * 2, 1); }
    else if (!b) closeEye(g, cx, cy, rx, ry);
  }
}
// Clear an eye's pixels in an ellipse (keeping blush / tongue pinks) and draw a closed lid curve.
export function closeEye(g, cx, cy, rx, ry) {
  const x0 = Math.max(0, Math.floor(cx - rx)), y0 = Math.max(0, Math.floor(cy - ry));
  const w = Math.ceil(rx * 2), h = Math.ceil(ry * 2);
  const img = g.getImageData(x0, y0, w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ux = (x0 + x - cx) / rx, uy = (y0 + y - cy) / ry;
    if (ux * ux + uy * uy > 1) continue;
    const i = (y * w + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
    if (r > 200 && r - gg > 50 && b > 90) continue; // blush
    d[i + 3] = 0;
  }
  g.putImageData(img, x0, y0);
  g.strokeStyle = '#2a1a1e'; g.lineCap = 'round'; g.lineWidth = Math.max(3, Math.min(rx, ry) * 0.32);
  g.beginPath(); g.moveTo(cx - rx * 0.8, cy); g.quadraticCurveTo(cx, cy + ry * 0.55, cx + rx * 0.8, cy); g.stroke();
}
export function paintFace(tex, name, frame = 0) {
  const s = slug(name), open = `faces/face_${s}.png`, closed = frame > 0;
  // a hand-painted blink frame (faces/face_<name>_closed.png, framed like the open art) wins;
  // it is placed with the open art's feature box so nothing shifts when it swaps in
  const pc = frame === 1 && !FACE_BLINK[s] && loadImage(`faces/face_${s}_closed.png`), po = pc && loadImage(open);
  if (pc && po) {
    Promise.all([pc, po]).then(([ic, io]) => {
      const cv = tex.image, g = cv.getContext('2d'), W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      const [bx, by, bw, bh] = featureBox(io);
      const k = Math.min(W * FACE_BOX[0] / bw, H * FACE_BOX[1] / bh), dw = bw * k, dh = bh * k;
      g.drawImage(ic, bx, by, bw, bh, W * 0.25 - dw / 2, H * FACE_BOX[2] - dh / 2, dw, dh);
      tex.needsUpdate = true;
    }).catch(() => {});
    return true;
  }
  return paintOver(tex, open, (g, im, cv) => {
    const W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H); // features only: the head material lays them over the skin
    // the head's texture is equirectangular with square pixels (0.7 degrees
    // each), so the features keep their proportions: at most ~86 degrees wide
    // and ~68 tall (a bigger box put the eyes on the forehead and the mouth on
    // the chin), centred just below the head's equator
    const [bx, by, bw, bh] = featureBox(im);
    const k = Math.min(W * FACE_BOX[0] / bw, H * FACE_BOX[1] / bh);
    const dw = bw * k, dh = bh * k;
    const ox = W * 0.25 - dw / 2, oy = H * FACE_BOX[2] - dh / 2;
    g.drawImage(im, bx, by, bw, bh, ox, oy, dw, dh);
    const fb = closed && FACE_BLINK[s];
    if (fb?.lift) { // the glasses band, redrawn a little higher
      const [y0, y1] = fb.lift, sy = oy + (y0 - by) * k, sh = (y1 - y0) * k;
      g.clearRect(0, sy, W, sh);
      g.drawImage(im, bx, y0, bw, y1 - y0, ox, sy + fb.dy * k, dw, sh);
    }
    if (fb?.flash) { // screens flash bright
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(170,255,255,0.75)';
      for (const [x0, x1, y0, y1] of fb.flash) { g.beginPath(); g.roundRect(ox + (x0 - bx) * k, oy + (y0 - by) * k, (x1 - x0) * k, (y1 - y0) * k, 8 * k); g.fill(); }
      g.restore();
    }
    if (closed) blinkEyes(g, name, frame, (FACE_EYES[s] || []).map(([x0, x1, y0, y1]) =>
      [ox + ((x0 + x1) / 2 - bx) * k, oy + ((y0 + y1) / 2 - by) * k, (x1 - x0) / 2 * k * 1.22, (y1 - y0) / 2 * k * 1.2]));
  });
}
