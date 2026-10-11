// The roster and head rendering.
//
// Swingers is a Rounders spinoff: the playable cast is the 24 Rounders
// characters (assets/characters/, sized by src/characters-data.js — both
// imported by tools/import_rounders.mjs). The 8 original Swingers robot
// heads come back when Settings → Original Swingers is on.
//
// HEAD_STYLES is the live picker list (rebuilt in place by rebuildRoster);
// players and lobby slots hold an index into it.

import { clamp, TAU } from './util.js';
import { art, HEADS } from './art.js';
import { ROUNDERS_CAST } from './characters-data.js';
import { settings } from './settings.js';
import { track } from './preload.js';

export const HEAD_STYLES = [];

const PROC = [];          // procedural placeholder faces (fallbacks)
const EXTRA = [];         // registerSpriteHead() additions
function face(name, draw) {
  PROC.push({ name, draw });
}

export function registerSpriteHead(src, name = 'sprite') {
  const img = new Image();
  img.src = src;
  track(img);
  EXTRA.push({ name, img, original: true });
  rebuildRoster();
}

// --- placeholder faces (drawn on top of the solid circle) -------------------
// ctx is translated to head center and rotated by tilt; r = head radius,
// look = {x,y} unit-ish gaze direction.

function eyes(ctx, r, look, eyeR, pupil = true) {
  const off = r * 0.38;
  for (const s of [-1, 1]) {
    const ex = s * off + look.x * r * 0.1, ey = -r * 0.15 + look.y * r * 0.1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, TAU); ctx.fill();
    if (pupil) {
      ctx.fillStyle = '#20222e';
      ctx.beginPath(); ctx.arc(ex + look.x * eyeR * 0.4, ey + look.y * eyeR * 0.4, eyeR * 0.45, 0, TAU); ctx.fill();
    }
  }
}

face('happy', (ctx, r, look) => {
  eyes(ctx, r, look, r * 0.22);
  ctx.strokeStyle = '#20222e'; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.4, 0.25, Math.PI - 0.25); ctx.stroke();
});

face('dot', (ctx, r, look) => {
  ctx.fillStyle = '#20222e';
  const off = r * 0.34;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(s * off + look.x * r * 0.12, -r * 0.1 + look.y * r * 0.12, r * 0.12, 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, r * 0.35, r * 0.1, 0, TAU); ctx.fill();
});

face('visor', (ctx, r, look) => {
  ctx.fillStyle = '#20222e';
  const w = r * 1.3, h = r * 0.55;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -r * 0.42, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#7df2ff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * r * 0.35 + look.x * r * 0.12, -r * 0.15 + look.y * r * 0.06, r * 0.13, 0, TAU);
    ctx.fill();
  }
});

face('grump', (ctx, r, look) => {
  eyes(ctx, r, look, r * 0.19);
  ctx.strokeStyle = '#20222e'; ctx.lineWidth = r * 0.11; ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.15, -r * 0.48); ctx.lineTo(s * r * 0.58, -r * 0.32);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.42); ctx.lineTo(r * 0.3, r * 0.42); ctx.stroke();
});

face('wink', (ctx, r, look) => {
  const off = r * 0.36;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-off, -r * 0.12, r * 0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#20222e';
  ctx.beginPath(); ctx.arc(-off + look.x * r * 0.08, -r * 0.12 + look.y * r * 0.08, r * 0.1, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#20222e'; ctx.lineWidth = r * 0.11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(off - r * 0.2, -r * 0.12); ctx.lineTo(off + r * 0.2, -r * 0.12); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.35, 0.4, Math.PI - 0.4); ctx.stroke();
});

face('shades', (ctx, r, look) => {
  ctx.fillStyle = '#20222e';
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.roundRect(s * r * 0.55 - r * 0.28, -r * 0.38, r * 0.56, r * 0.42, r * 0.1); ctx.fill();
  }
  ctx.fillRect(-r * 0.3, -r * 0.28, r * 0.6, r * 0.1);
  ctx.strokeStyle = '#20222e'; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.42); ctx.lineTo(r * 0.25, r * 0.38); ctx.stroke();
});

// Arm look per Rounders character (same physics for all of them):
// robot = segmented metal tinted to the character, wisp = a glowing
// ribbon, everyone else = a rubber-hose noodle.
const ARM_STYLE = {
  robot: ['rook', 'diesel', 'havoc', 'sprocket', 'duke', 'onyx', 'blitz'],
  wisp: ['wraith', 'nyx', 'jinx', 'nova', 'shade', 'vex'],
};

const CAST = ROUNDERS_CAST.map((c) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = `assets/characters/${c.id}.png`;
  track(img);
  const arm = Object.keys(ARM_STYLE).find((k) => ARM_STYLE[k].includes(c.id)) || 'noodle';
  return { name: c.name, cast: c, arm, img };
});

// The original Swingers robots: generated heads (assets/heads), each with a
// procedural face as its fallback while the sprite loads.
const ORIGINALS = (() => {
  const proc = new Map(PROC.map((h) => [h.name, h]));
  const fallback = { screen: 'visor', antenna: 'dot', cyclops: 'dot' };
  return HEADS.map((name) => {
    const f = proc.get(name) || proc.get(fallback[name]);
    return { name: name[0].toUpperCase() + name.slice(1), art: 'head:' + name, draw: f.draw, original: true };
  });
})();

export function rebuildRoster() {
  HEAD_STYLES.length = 0;
  HEAD_STYLES.push(...CAST);
  if (settings.originalSwingers) HEAD_STYLES.push(...ORIGINALS, ...EXTRA);
}
rebuildRoster();

export function styleIndexByName(name) {
  return HEAD_STYLES.findIndex((h) => h.name === name);
}

// Opening picks: a character in each player's own color.
const DEFAULT_PICKS = ['Ember', 'Bolt', 'Blitz', 'Fizz'];
export function defaultStyleFor(slot) {
  const i = styleIndexByName(DEFAULT_PICKS[slot % DEFAULT_PICKS.length]);
  return i >= 0 ? i : slot % HEAD_STYLES.length;
}

export function headStyle(i) {
  const n = HEAD_STYLES.length;
  return HEAD_STYLES[((i % n) + n) % n];
}

// Sprites are white robots; tint each one to the player's color once and
// cache it (multiply keeps the dark outline and eyes dark, turns the white
// shell into the player color).
const tinted = new Map();
function tintedHead(img, key, color) {
  const k = key + color.main;
  let c = tinted.get(k);
  if (c) return c;
  // pre-scaled to 128px with high-quality smoothing: heads are drawn
  // ~45px tall, and shrinking the 256px art every frame speckles
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, 128, 128);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = color.main;
  x.fillRect(0, 0, 128, 128);
  // bring back some of the white highlights
  x.globalCompositeOperation = 'soft-light';
  x.drawImage(img, 0, 0, 128, 128);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(img, 0, 0, 128, 128);
  tinted.set(k, c);
  return c;
}

// Draw a Rounders body exactly as Rounders sizes it: the fitted ball
// (pivot/radius) maps onto the physics circle, then the /workbench
// bodyScale / bodyOffset / bodyRotation apply on top. Rounders characters
// have a front: they stay upright (a little rocking as the ball rolls) and
// mirror to face `facing`.
function drawCastBody(ctx, r, style, rot, facing) {
  const c = style.cast;
  ctx.rotate(Math.sin(rot) * 0.22);
  ctx.scale(facing < 0 ? -1 : 1, 1);
  if (!(style.img.complete && style.img.naturalWidth)) {
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = c.dark; ctx.lineWidth = r * 0.14; ctx.stroke();
    return;
  }
  ctx.translate(c.bodyOffset.x * r, c.bodyOffset.y * r);
  if (c.bodyRotation) ctx.rotate((c.bodyRotation * Math.PI) / 180);
  const k = (r / c.radius) * c.bodyScale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(style.img, -c.pivot.x * k, -c.pivot.y * k, c.size * k, c.size * k);
}

// Draw a full head. `rot` is the body's physics angle: original Swingers
// faces roll with the ball, Heave Ho style; Rounders characters stay upright
// and face `facing` (+1 right, -1 left).
export function drawHead(ctx, x, y, r, color, styleIndex, look = { x: 0, y: 0 }, rot = 0, facing = 1) {
  const style = headStyle(styleIndex);
  ctx.save();
  ctx.translate(x, y);
  if (style.cast) {
    drawCastBody(ctx, r, style, rot, facing);
    ctx.restore();
    return;
  }
  ctx.rotate(rot);
  const sprite = style.art ? art(style.art) : null;
  if (sprite) {
    // the generated heads have a little transparent margin; draw them a
    // touch larger so the shell lines up with the physics circle
    const d = r * 2 * 1.14;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tintedHead(sprite, style.art, color), -d / 2, -d / 2, d, d);
  } else if (style.img && style.img.complete && style.img.naturalWidth) {
    ctx.drawImage(style.img, -r, -r, r * 2, r * 2);
  } else {
    ctx.fillStyle = color.main;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.strokeStyle = color.dark;
    ctx.stroke();
    // subtle top shine
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.35, r * 0.32, 0, TAU); ctx.fill();
    if (style.draw) style.draw(ctx, r, look);
  }
  ctx.restore();
}
