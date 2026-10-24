// Shared helpers for the weapon modules (not a weapon itself; nothing to
// register). Beams, safe muzzle placement, impulse-only shoves, target
// finding, web cutting and jagged lightning bolts.

import { segSeg, closestOnSeg, rand, TAU } from '../util.js';
import { sfx } from '../audio.js';

// Where a shot may start: the muzzle, or the wall point in between when the
// barrel is poking through terrain. {x, y, hit}
export function safeMuzzle(w, d = w.muzzleDist) {
  const o = w.owner;
  const m = w.along(d);
  if (!o) return { x: m.x, y: m.y, hit: null };
  const hit = w.game.world.segment(o.x, o.y, m.x, m.y);
  if (hit) return { x: hit.x + hit.nx * 2, y: hit.y + hit.ny * 2, hit };
  return { x: m.x, y: m.y, hit: null };
}

// Trace an instant beam from (x,y) along unit (dx,dy). Glass is shattered
// and passed through when `pierceGlass`; plasma blades not owned by `owner`
// stop it. Returns {x, y, wall, blade, len}.
export function traceBeam(game, x, y, dx, dy, maxLen, { owner = null, pierceGlass = true } = {}) {
  let len = maxLen, wall = null;
  let sx = x, sy = y, travelled = 0;
  for (let i = 0; i < 6; i++) {
    const hit = game.world.raycast(sx, sy, dx, dy, maxLen - travelled);
    if (!hit) { wall = null; len = maxLen; break; }
    if (pierceGlass && hit.solid.mat === 'glass') {
      game.breakSolid(hit.solid, hit.x, hit.y);
      travelled += hit.t + 1; sx = hit.x + dx; sy = hit.y + dy;
      continue;
    }
    wall = hit; len = travelled + hit.t; break;
  }
  let blade = null;
  const base = len, ex = x + dx * base, ey = y + dy * base;
  for (const b of game.blades) {
    if (b.owner === owner) continue;
    let t = segSeg(x, y, ex, ey, b.x1, b.y1, b.x2, b.y2);
    if (t < 0) {
      // (nearly) parallel blade lying along the beam: catch it at its nearer end
      for (let k = 0; k < 2; k++) {
        const px = k ? b.x2 : b.x1, py = k ? b.y2 : b.y1;
        const c = closestOnSeg(px, py, x, y, ex, ey);
        if (Math.hypot(px - c.x, py - c.y) < 5 && (t < 0 || c.t < t)) t = c.t;
      }
    }
    if (t >= 0 && t * base < len) { len = t * base; blade = b; wall = null; }
  }
  return { x: x + dx * len, y: y + dy * len, wall, blade, len };
}

// Webs crossing a segment snap (beams, flying saws).
export function cutWebs(game, x1, y1, x2, y2, except = null) {
  for (const sp of game.spiders) {
    if (!sp.alive || !sp.web || sp === except) continue;
    const w = sp.web;
    const an = w.state === 'fly' ? { x: w.x, y: w.y } : sp.webAnchor();
    if (segSeg(x1, y1, x2, y2, sp.x, sp.y, an.x, an.y) >= 0) {
      sp.web = null;
      sfx.webCut();
      game.fx.burst((x1 + x2) / 2, (y1 + y2) / 2, { n: 4, speed: 160, color: '#fff', life: 0.25, size: 1.5 });
    }
  }
}

// Impulse-only shockwave: pushes actors and pickups, hurts nobody.
export function shove(game, x, y, radius, force) {
  for (const a of game.actors()) {
    const dx = a.x - x, dy = a.y - y, d = Math.hypot(dx, dy) || 1;
    if (d > radius + a.r) continue;
    const k = 1 - Math.min(1, d / (radius + a.r));
    if (a.impulse) a.impulse(dx / d * force * (0.4 + k), dy / d * force * (0.4 + k) - 120, true);
  }
  for (const p of game.pickups) {
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
    if (d < radius && !p.stuck) { p.vx += dx / d * force * 0.5; p.vy += dy / d * force * 0.5; }
  }
}

// Unstick a spider from its surface so a pull/push can move it.
// (Keeps it unstuck while called every frame: a spider re-clings to any
// surface within reach as soon as its jumpLock runs out.)
export function unstick(a, t = 0.06) {
  if (a.kind !== 'spider') return;
  a.ground = null;
  a.jumpLock = Math.max(a.jumpLock || 0, t);
}

// Nearest actor `owner` may hurt, within maxD of (x,y), optionally in a
// cone around (dx,dy) (cos of the half angle) and with line of sight.
export function nearestFoe(game, owner, x, y, maxD, { dx = 0, dy = 0, cone = -2, los = true, skip = null } = {}) {
  let best = null, bd = maxD;
  for (const a of game.actors()) {
    if (a === owner || (skip && skip.has(a))) continue;
    if (owner && !game.canHurt(owner, a)) continue;
    const ox = a.x - x, oy = a.y - y, d = Math.hypot(ox, oy);
    if (d - a.r > bd) continue;
    if (cone > -2 && d > 1 && (ox * dx + oy * dy) / d < cone) continue;
    if (los && game.world.segment(x, y, a.x, a.y)) continue;
    bd = d - a.r; best = a;
  }
  return best;
}

// Does a point touch any plasma blade (not owned by `owner`)? -> blade
export function bladeNear(game, x, y, r, owner = null) {
  for (const b of game.blades) {
    if (owner && b.owner === owner) continue;
    const c = closestOnSeg(x, y, b.x1, b.y1, b.x2, b.y2);
    if (Math.hypot(x - c.x, y - c.y) < r) return b;
  }
  return null;
}

// Jagged lightning: fill `out` with points from a to b.
export function boltPoints(x1, y1, x2, y2, segs, jag, out = []) {
  out.length = 0;
  const dx = x2 - x1, dy = y2 - y1, m = Math.hypot(dx, dy) || 1;
  const nx = -dy / m, ny = dx / m;
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    const off = i === 0 || i === segs ? 0 : rand(-jag, jag) * Math.sin(k * Math.PI);
    out.push(x1 + dx * k + nx * off, y1 + dy * k + ny * off);
  }
  return out;
}

export function drawBolt(ctx, pts, color, width, alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pass = (w, a, c) => {
    ctx.globalAlpha = a * alpha; ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  pass(width * 3.5, 0.22, color);
  pass(width * 1.6, 0.6, color);
  pass(width * 0.6, 1, '#ffffff');
  ctx.restore();
}

// A short-lived drawable added to game.projectiles (arcs, beam afterglow).
export class Flicker {
  constructor(life, draw) { this.life = life; this.t = 0; this.drawFn = draw; this.owner = null; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; }
  update(dt) { this.t += dt; return this.t < this.life; }
  draw(ctx) { this.drawFn(ctx, 1 - this.t / this.life, this.t); }
}

// little metal-body helper used by several drawShape()s
export function body(ctx, x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

export const DARK = '#2b2f3a';
export const MID = '#4a5060';
export const LIGHT = '#8a93a6';
export { TAU };
