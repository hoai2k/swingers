// Head rendering. For now heads are solid circles with simple placeholder
// faces. When real head sprites arrive, drop the PNGs in assets/heads/ and
// call registerSpriteHead('assets/heads/mine.png') below (or from main.js) —
// sprite heads are drawn centered and scaled to the body diameter, and show
// up in the lobby picker automatically.

import { clamp, TAU } from './util.js';

export const HEAD_STYLES = [];

function face(name, draw) {
  HEAD_STYLES.push({ name, draw });
}

export function registerSpriteHead(src, name = 'sprite') {
  const img = new Image();
  img.src = src;
  HEAD_STYLES.push({ name, img });
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

// Draw a full head (solid circle body + face or sprite).
export function drawHead(ctx, x, y, r, color, styleIndex, look = { x: 0, y: 0 }, tilt = 0) {
  const style = HEAD_STYLES[((styleIndex % HEAD_STYLES.length) + HEAD_STYLES.length) % HEAD_STYLES.length];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(clamp(tilt, -0.35, 0.35));
  if (style.img && style.img.complete && style.img.naturalWidth) {
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
