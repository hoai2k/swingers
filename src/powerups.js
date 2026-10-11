// Power-ups: random pickups that appear around a board, one power at a
// time per robot (touch one to take it; a new one replaces the old).
//
//   super    SUPER PUNCH    your next punch is a huge blast (until used)
//   feather  FEATHER        light gravity: floaty swings and long flings
//   shield   BUBBLE SHIELD  shots and punches bounce off; touching spikes or
//                           lava pops the bubble and throws you clear
//                           instead of killing you
//   sticky   STICKY GLOVES  grab from twice as far, and nothing can shake
//                           your grips loose
//   rubber   RUBBER BALL    your body bounces off everything
//   turbo    TURBO ARMS     much stronger arms: big swings, big flings
//
// Spawning (Settings → Power-ups): NORMAL = one every 7-14 s, max 2 at
// once; FREQUENT = every 3-6 s, max 4; OFF = none. They appear on the
// board's spots — the authored `powerups` points, plus the tops of its
// ordinary platforms (never near the goal). Untaken ones fade after 16 s.
//
// Icons: assets/web/power_<id>.png when present (see image-requests.md),
// otherwise the procedural badges below.

import { TAU, hash01, roundRectPath } from './util.js';
import { art } from './art.js';
import { track } from './preload.js';

export const POWERS = {
  super:   { name: 'SUPER PUNCH',   color: '#ffd94d', dur: Infinity, weight: 3 },
  feather: { name: 'FEATHER',       color: '#bdf3ff', dur: 9, weight: 2 },
  shield:  { name: 'BUBBLE SHIELD', color: '#7fd8ff', dur: 12, weight: 2 },
  sticky:  { name: 'STICKY GLOVES', color: '#7ed957', dur: 12, weight: 2 },
  rubber:  { name: 'RUBBER BALL',   color: '#ff7eb6', dur: 10, weight: 2 },
  turbo:   { name: 'TURBO ARMS',    color: '#ff8a3d', dur: 10, weight: 2 },
};
export const POWER_IDS = Object.keys(POWERS);

export const RATES = {
  off: null,
  normal: { gap: [7, 14], max: 2 },
  frequent: { gap: [3, 6], max: 4 },
};
const LIFE = 16;

function randomPower() {
  const total = POWER_IDS.reduce((a, id) => a + POWERS[id].weight, 0);
  let r = Math.random() * total;
  for (const id of POWER_IDS) {
    r -= POWERS[id].weight;
    if (r <= 0) return id;
  }
  return 'super';
}

// Where power-ups may appear on a board: authored spots + platform tops.
export function powerSpots(level) {
  const spots = (level.def.powerups || []).map((p) => ({ x: p.x, y: p.y }));
  const goal = level.goal;
  for (const s of level.solids) {
    const b = s.body;
    if (s.deadly || s.slick || s.bounce || s.crumble || b.angle) continue;
    if (s.w < 70 || s.w < s.h) continue;               // walls and posts
    const top = b.position.y - s.h / 2;
    if (top < 90 || top > level.h - 30) continue;
    const n = Math.max(1, Math.floor(s.w / 220));
    for (let i = 0; i < n; i++) {
      const x = b.position.x - s.w / 2 + ((i + 0.5) / n) * s.w;
      const y = top - 44;
      if (x < 60 || x > level.w - 60) continue;
      if (goal && Math.hypot(x - goal.x, y - goal.y) < 170) continue;
      spots.push({ x, y });
    }
  }
  return spots;
}

export class PowerSpawner {
  constructor(level) {
    this.level = level;
    this.spots = powerSpots(level);
    this.live = [];        // { x, y, id, t }
    this.next = 4 + Math.random() * 4;
    this.rate = RATES.normal;
  }

  setRate(key) {
    this.rate = RATES[key] || null;
    if (this.rate) this.next = Math.min(this.next, this.rate.gap[1]);
  }

  update(dt, time) {
    for (const p of this.live) p.t += dt;
    this.live = this.live.filter((p) => p.t < LIFE);
    const rate = this.rate;
    if (!rate) { this.live.length = 0; return; }
    if (!this.spots.length) return;
    this.next -= dt;
    if (this.next > 0 || this.live.length >= rate.max) return;
    this.next = rate.gap[0] + Math.random() * (rate.gap[1] - rate.gap[0]);
    const free = this.spots.filter((s) => !this.live.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < 80));
    if (!free.length) return;
    const s = free[Math.floor(Math.random() * free.length)];
    this.live.push({ x: s.x, y: s.y, id: randomPower(), t: 0 });
  }

  take(p) { this.live = this.live.filter((q) => q !== p); }

  draw(ctx, time) {
    for (const p of this.live) {
      // pop in, bob, blink before fading out
      const grow = Math.min(1, p.t / 0.35);
      if (p.t > LIFE - 3 && Math.floor(time * 8) % 2) continue;
      const bob = Math.sin(time * 2.4 + p.x) * 5;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.scale(grow, grow);
      drawPowerIcon(ctx, p.id, 24, time);
      ctx.restore();
    }
  }
}

// A round badge with the power's glyph (or its generated icon).
export function drawPowerIcon(ctx, id, r, time = 0) {
  const P = POWERS[id];
  ctx.fillStyle = 'rgba(10,12,24,0.55)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = P.color;
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.globalAlpha = 0.8 + Math.sin(time * 5) * 0.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  const img = art('power:' + id);
  if (img) {
    const d = r * 1.7;
    ctx.drawImage(img, -d / 2, -d / 2, d, d);
    return;
  }
  const s = r / 24;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = P.color;
  ctx.strokeStyle = P.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (id === 'super') {
    roundRectPath(ctx, -9, -8, 15, 16, 5); ctx.fill();
    roundRectPath(ctx, -12, -5, 5, 10, 2); ctx.fill();
    ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-2 + i * 4.5, -8); ctx.lineTo(-2 + i * 4.5, -3); ctx.stroke(); }
  } else if (id === 'feather') {
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-9, 11); ctx.quadraticCurveTo(0, 0, 9, -12); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 6); ctx.quadraticCurveTo(-8, -6, 9, -12); ctx.quadraticCurveTo(8, 2, -5, 6);
    ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
  } else if (id === 'shield') {
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-4, -5, 4, 2.5, -0.6, 0, TAU); ctx.fill();
  } else if (id === 'sticky') {
    roundRectPath(ctx, -8, -2, 16, 13, 5); ctx.fill();
    for (let i = 0; i < 4; i++) { roundRectPath(ctx, -8 + i * 4.2, -12 + (i % 3 ? 0 : 2), 3.6, 12, 1.8); ctx.fill(); }
    ctx.fillStyle = '#d6ffb0';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-4 + i * 4, 13, 1.6, 0, TAU); ctx.fill(); }
  } else if (id === 'rubber') {
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 11, -0.5, 1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11, 0); ctx.quadraticCurveTo(0, 6, 11, 0); ctx.stroke();
  } else if (id === 'turbo') {
    ctx.beginPath();
    ctx.moveTo(3, -13); ctx.lineTo(-7, 2); ctx.lineTo(0, 2); ctx.lineTo(-3, 13); ctx.lineTo(8, -3); ctx.lineTo(1, -3);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Per-robot effect visuals drawn around the body (world space).
const BUBBLE = new Image();
BUBBLE.src = 'assets/fx/shield-bubble.png';   // from Rounders
track(BUBBLE);

export function drawPowerAura(ctx, p, time, fxBubble = BUBBLE) {
  const id = p.powerId;
  if (!id) return;
  const A = p.body.position;
  const left = p.powerT === Infinity ? 1 : p.powerT;
  // blink for the last 2 s so you know it's ending
  if (left < 2 && Math.floor(time * 8) % 2) return;
  ctx.save();
  if (id === 'shield') {
    const r = 34 + Math.sin(time * 4) * 1.5;
    if (fxBubble && fxBubble.complete && fxBubble.naturalWidth) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(fxBubble, A.x - r, A.y - r, r * 2, r * 2);
    } else {
      ctx.strokeStyle = 'rgba(127,216,255,0.85)';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(127,216,255,0.12)';
      ctx.beginPath(); ctx.arc(A.x, A.y, r, 0, TAU); ctx.fill(); ctx.stroke();
    }
  } else if (id === 'feather') {
    const fimg = art('fx:feather');
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 3; i++) {
      const u = (time * 0.6 + i / 3) % 1;
      const x = A.x + Math.sin(time * 2 + i * 2) * 18;
      const y = A.y + 10 + u * 34;
      ctx.globalAlpha = 0.6 * (1 - u);
      if (fimg) { ctx.drawImage(fimg, x - 12, y - 12, 24, 24); continue; }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 4, y + 4); ctx.quadraticCurveTo(x, y - 2, x + 5, y - 5); ctx.stroke();
    }
  } else if ((id === 'sticky' && art('fx:goo')) || (id === 'turbo' && art('fx:spark'))) {
    const img = art(id === 'sticky' ? 'fx:goo' : 'fx:spark');
    for (const a of p.arms) {
      const h = a.hand.position;
      const d = id === 'sticky' ? 26 : 26 + Math.sin(time * 30 + a.side) * 5;
      ctx.globalAlpha = id === 'turbo' ? 0.6 + Math.random() * 0.4 : 0.9;
      ctx.drawImage(img, h.x - d / 2, h.y - d / 2, d, d);
    }
  } else if (id === 'sticky' || id === 'turbo') {
    const c = POWERS[id].color;
    ctx.shadowColor = c;
    ctx.shadowBlur = 14;
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.55;
    for (const a of p.arms) {
      const h = a.hand.position;
      ctx.beginPath(); ctx.arc(h.x, h.y, id === 'sticky' ? 9 : 7, 0, TAU); ctx.fill();
      if (id === 'turbo') {
        for (const s of a.segs) { ctx.beginPath(); ctx.arc(s.position.x, s.position.y, 4, 0, TAU); ctx.fill(); }
      }
    }
  } else if (id === 'rubber') {
    ctx.strokeStyle = 'rgba(255,126,182,0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -time * 30;
    ctx.beginPath(); ctx.arc(A.x, A.y, 27, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// tiny badge above a robot's name tag, with a ring that runs down
export function drawPowerBadge(ctx, p, time) {
  if (!p.powerId) return;
  const A = p.body.position;
  ctx.save();
  ctx.translate(A.x, A.y - 64);   // above the name tag
  drawPowerIcon(ctx, p.powerId, 11, time);
  if (p.powerT !== Infinity) {
    const f = Math.max(0, p.powerT / POWERS[p.powerId].dur);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13.5, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
  }
  ctx.restore();
}
