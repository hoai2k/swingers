// The playable cast: the 24 Rounders characters (shared with Swingers —
// sprites in ../assets/characters, sizing in ../src/characters-data.js,
// never hand-edited). Spiders are the same round bodies with legs.
//
// drawBody draws the character exactly as Rounders sizes it: the fitted
// ball (pivot/radius) maps onto the physics circle, then the workbench
// bodyScale / bodyOffset / bodyRotation apply. Characters stay upright and
// mirror to face left/right.

import { ROUNDERS_CAST } from '../../src/characters-data.js';
import { loadImage, ready } from './preload.js';
import { TAU } from './util.js';

export const CAST = ROUNDERS_CAST.map((c) => ({
  ...c,
  img: loadImage(`../assets/characters/${c.id}.png`),
}));

// 8 player colors (rings, webs, name tags), Xbox-friendly order
export const PLAYER_COLORS = [
  { main: '#ff4d6d', dark: '#a3243e', name: 'Red' },
  { main: '#3fa7ff', dark: '#1d5f9e', name: 'Blue' },
  { main: '#4fdc6a', dark: '#24863a', name: 'Green' },
  { main: '#ffd23f', dark: '#a8851a', name: 'Yellow' },
  { main: '#b46bff', dark: '#6a3aa8', name: 'Purple' },
  { main: '#ff9a3c', dark: '#a85a17', name: 'Orange' },
  { main: '#3fe8e0', dark: '#1d8f89', name: 'Cyan' },
  { main: '#ff7ad9', dark: '#a33d8a', name: 'Pink' },
];

const DEFAULT_PICKS = ['ember', 'bolt', 'fizz', 'blitz', 'vex', 'havoc', 'glacia', 'mochi'];
export function defaultCastFor(slot) {
  const i = CAST.findIndex((c) => c.id === DEFAULT_PICKS[slot % DEFAULT_PICKS.length]);
  return i >= 0 ? i : slot % CAST.length;
}
export function castAt(i) {
  const n = CAST.length;
  return CAST[((i % n) + n) % n];
}

// draw at (x,y) with physics radius r. tilt: small lean (rad). facing: +1/-1.
export function drawBody(ctx, x, y, r, castIndex, { tilt = 0, facing = 1, squash = 1, alpha = 1, flash = 0 } = {}) {
  const c = castAt(castIndex);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(facing < 0 ? -1 : 1, 1);
  if (squash !== 1) ctx.scale(1 / Math.sqrt(squash), squash);
  if (alpha < 1) ctx.globalAlpha *= alpha;
  if (!ready(c.img)) {
    ctx.fillStyle = c.color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = c.dark; ctx.lineWidth = r * 0.14; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.15, r * 0.22, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.15, r * 0.1, 0, TAU); ctx.fill();
  } else {
    ctx.translate(c.bodyOffset.x * r, c.bodyOffset.y * r);
    if (c.bodyRotation) ctx.rotate((c.bodyRotation * Math.PI) / 180);
    const k = (r / c.radius) * c.bodyScale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c.img, -c.pivot.x * k, -c.pivot.y * k, c.size * k, c.size * k);
  }
  if (flash > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(1, flash);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  }
  ctx.restore();
}
