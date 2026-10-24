// Terrain collision for the arena.
//
// A board's solid ground is a list of shapes in world units (the arena is
// 1920 x 1080):
//   { poly: [[x,y], ...] }  any simple polygon, convex or concave, either winding
//   { circle: [x, y, r] }
// optional per solid:
//   mat: 'rock' (default) | 'ice' (slippery, can't cling) | 'bouncy' |
//        'lava' (kills on touch) | 'glass' (shatters from explosions/bullets)
//   move: { path: [[dx,dy], ...], period }       // loops through offsets
//   spin: { cx, cy, speed }                      // rotates about a pivot (rad/s)
//   bob:  { dx, dy, period }                     // sine sway
//   theme / tex: drawing hints (see board.js)
//
// Moving solids carry whatever stands on them: each solid reports a surface
// velocity at any point (velAt).
//
// Everything works on edge lists, so concave shapes are fine: a circle is
// pushed out along the nearest edge; a point inside a polygon is detected
// with a crossing test and pushed out through the nearest edge.

import { closestOnSeg } from './util.js';

export class Solid {
  constructor(def, i) {
    this.i = i;
    this.def = def;
    this.mat = def.mat || 'rock';
    this.dynamic = !!(def.move || def.spin || def.bob);
    this.broken = false;
    this.x = 0; this.y = 0; this.a = 0;      // current transform (offset + rotation about pivot)
    this.px = 0; this.py = 0; this.pa = 0;   // previous transform (for surface velocity)
    if (def.circle) {
      this.kind = 'circle';
      this.lc = { x: def.circle[0], y: def.circle[1], r: def.circle[2] };
    } else {
      this.kind = 'poly';
      this.lpts = def.poly.map(([x, y]) => ({ x, y }));
      this.wpts = this.lpts.map((p) => ({ x: p.x, y: p.y }));
    }
    this.pivot = def.spin ? { x: def.spin.cx, y: def.spin.cy } : { x: 0, y: 0 };
    this.refresh();
  }

  setTime(t) {
    const d = this.def;
    this.px = this.x; this.py = this.y; this.pa = this.a;
    let x = 0, y = 0, a = 0;
    if (d.move) {
      const P = d.move.path, n = P.length;
      const u = ((t / d.move.period) % 1 + 1) % 1 * n;
      const i = Math.floor(u), f = u - i;
      const A = P[i % n], B = P[(i + 1) % n];
      const s = f * f * (3 - 2 * f);
      x = A[0] + (B[0] - A[0]) * s; y = A[1] + (B[1] - A[1]) * s;
    }
    if (d.bob) {
      const s = Math.sin((t / d.bob.period) * Math.PI * 2);
      x += d.bob.dx * s; y += d.bob.dy * s;
    }
    if (d.spin) a = t * d.spin.speed;
    this.x = x; this.y = y; this.a = a;
    this.refresh();
  }

  // local -> world
  tx(p) {
    if (!this.a) return { x: p.x + this.x, y: p.y + this.y };
    const c = Math.cos(this.a), s = Math.sin(this.a);
    const dx = p.x - this.pivot.x, dy = p.y - this.pivot.y;
    return { x: this.pivot.x + dx * c - dy * s + this.x, y: this.pivot.y + dx * s + dy * c + this.y };
  }
  // world -> local
  inv(p) {
    const qx = p.x - this.x, qy = p.y - this.y;
    if (!this.a) return { x: qx, y: qy };
    const c = Math.cos(-this.a), s = Math.sin(-this.a);
    const dx = qx - this.pivot.x, dy = qy - this.pivot.y;
    return { x: this.pivot.x + dx * c - dy * s, y: this.pivot.y + dx * s + dy * c };
  }

  refresh() {
    if (this.kind === 'circle') {
      const c = this.tx(this.lc);
      this.c = { x: c.x, y: c.y, r: this.lc.r };
      const r = this.lc.r;
      this.bb = { x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r };
      return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < this.lpts.length; i++) {
      const w = this.tx(this.lpts[i]);
      this.wpts[i].x = w.x; this.wpts[i].y = w.y;
      if (w.x < x0) x0 = w.x; if (w.x > x1) x1 = w.x;
      if (w.y < y0) y0 = w.y; if (w.y > y1) y1 = w.y;
    }
    this.bb = { x0, y0, x1, y1 };
  }

  // velocity of the surface at a world point (from the last transform change)
  velAt(x, y, dt) {
    if (!this.dynamic || dt <= 0) return { x: 0, y: 0 };
    const cur = this.inv({ x, y });
    // where was that local point last step?
    const save = [this.x, this.y, this.a];
    this.x = this.px; this.y = this.py; this.a = this.pa;
    const prev = this.tx(cur);
    [this.x, this.y, this.a] = save;
    return { x: (x - prev.x) / dt, y: (y - prev.y) / dt };
  }

  inside(x, y) {
    if (this.kind === 'circle') return (x - this.c.x) ** 2 + (y - this.c.y) ** 2 < this.c.r ** 2;
    const P = this.wpts;
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i], b = P[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }

  // nearest surface point to (x,y): {x, y, nx, ny, d, inside}; normal points out of the solid
  nearest(x, y) {
    if (this.kind === 'circle') {
      const c = this.c;
      let dx = x - c.x, dy = y - c.y;
      const m = Math.hypot(dx, dy) || 1e-6;
      dx /= m; dy /= m;
      return { x: c.x + dx * c.r, y: c.y + dy * c.r, nx: dx, ny: dy, d: Math.abs(m - c.r), inside: m < c.r };
    }
    const P = this.wpts;
    let best = null, bd = Infinity;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const q = closestOnSeg(x, y, P[j].x, P[j].y, P[i].x, P[i].y);
      const d = (x - q.x) ** 2 + (y - q.y) ** 2;
      if (d < bd) { bd = d; best = q; best.e = j; }
    }
    const d = Math.sqrt(bd);
    const inside = this.inside(x, y);
    let nx, ny;
    if (d > 1e-4) {
      nx = (x - best.x) / d; ny = (y - best.y) / d;
      if (inside) { nx = -nx; ny = -ny; }
    } else {
      // exactly on an edge: use the edge normal pointing away from the interior
      const a = P[best.e], b = P[(best.e + 1) % P.length];
      let ex = b.x - a.x, ey = b.y - a.y; const el = Math.hypot(ex, ey) || 1;
      nx = ey / el; ny = -ex / el;
      if (this.inside(x + nx * 0.5, y + ny * 0.5)) { nx = -nx; ny = -ny; }
    }
    return { x: best.x, y: best.y, nx, ny, d, inside };
  }

  // ray from (x,y) along unit (dx,dy): first hit {t, x, y, nx, ny} or null
  ray(x, y, dx, dy, maxT) {
    if (this.kind === 'circle') {
      const c = this.c;
      const fx = x - c.x, fy = y - c.y;
      const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - c.r * c.r;
      if (cc < 0) return null; // started inside
      const disc = b * b - cc;
      if (disc < 0) return null;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > maxT) return null;
      const hx = x + dx * t, hy = y + dy * t;
      return { t, x: hx, y: hy, nx: (hx - c.x) / c.r, ny: (hy - c.y) / c.r };
    }
    const P = this.wpts;
    let bt = maxT, hit = null;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const ax = P[j].x, ay = P[j].y, ex = P[i].x - ax, ey = P[i].y - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const qx = ax - x, qy = ay - y;
      const t = (qx * ey - qy * ex) / den;
      const u = (qx * dy - qy * dx) / den;
      if (t >= 0 && t < bt && u >= 0 && u <= 1) {
        bt = t;
        const el = Math.hypot(ex, ey) || 1;
        let nx = ey / el, ny = -ex / el;
        if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }
        hit = { t, x: x + dx * t, y: y + dy * t, nx, ny };
      }
    }
    return hit;
  }
}

export class World {
  constructor(defs, bounds = { w: 1920, h: 1080 }) {
    this.bounds = bounds;
    this.solids = defs.map((d, i) => new Solid(d, i));
    this.time = 0;
  }

  get active() { return this.solids.filter((s) => !s.broken); }

  update(dt) {
    this.time += dt;
    for (const s of this.solids) if (s.dynamic) s.setTime(this.time);
    this.dt = dt;
  }

  // nearest surface among all solids within maxD of (x,y)
  nearest(x, y, maxD = Infinity, filter = null) {
    let best = null;
    for (const s of this.solids) {
      if (s.broken || (filter && !filter(s))) continue;
      const bb = s.bb;
      if (x < bb.x0 - maxD || x > bb.x1 + maxD || y < bb.y0 - maxD || y > bb.y1 + maxD) continue;
      const n = s.nearest(x, y);
      const sd = n.inside ? -n.d : n.d;
      if (sd <= maxD && (!best || sd < best.sd)) { best = n; best.sd = sd; best.solid = s; }
    }
    return best;
  }

  inside(x, y) {
    for (const s of this.solids) {
      if (s.broken) continue;
      const bb = s.bb;
      if (x < bb.x0 || x > bb.x1 || y < bb.y0 || y > bb.y1) continue;
      if (s.inside(x, y)) return s;
    }
    return null;
  }

  // ray along (dx,dy) (normalised here); returns {t, x, y, nx, ny, solid} or null
  raycast(x, y, dx, dy, maxT, filter = null) {
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    let best = null;
    const ex = x + dx * maxT, ey = y + dy * maxT;
    const rx0 = Math.min(x, ex), rx1 = Math.max(x, ex), ry0 = Math.min(y, ey), ry1 = Math.max(y, ey);
    for (const s of this.solids) {
      if (s.broken || (filter && !filter(s))) continue;
      const bb = s.bb;
      if (bb.x1 < rx0 || bb.x0 > rx1 || bb.y1 < ry0 || bb.y0 > ry1) continue;
      const h = s.ray(x, y, dx, dy, best ? best.t : maxT);
      if (h) { best = h; best.solid = s; }
    }
    return best;
  }

  // segment a->b: first hit or null
  segment(ax, ay, bx, by, filter = null) {
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 1e-6) return null;
    return this.raycast(ax, ay, bx - ax, by - ay, d, filter);
  }

  // push a circle body {x, y, vx, vy, r} out of the terrain. Returns the list
  // of contacts (deepest first): {nx, ny, depth, solid, x, y}.
  // `bounce` restitution, `friction` 0..1 tangential damping on impact.
  collideCircle(b, { bounce = 0, friction = 0, iterations = 3, filter = null } = {}) {
    const contacts = [];
    for (let it = 0; it < iterations; it++) {
      const n = this.nearest(b.x, b.y, b.r, filter);
      if (!n) break;
      const depth = n.inside ? b.r + n.d : b.r - n.d;
      if (depth <= 0) break;
      b.x += n.nx * depth;
      b.y += n.ny * depth;
      const sv = n.solid.velAt(n.x, n.y, this.dt || 1 / 60);
      const rvx = b.vx - sv.x, rvy = b.vy - sv.y;
      const vn = rvx * n.nx + rvy * n.ny;
      if (vn < 0) {
        const mat = n.solid.mat;
        const e = mat === 'bouncy' ? Math.max(bounce, 0.9) : bounce;
        b.vx -= (1 + e) * vn * n.nx;
        b.vy -= (1 + e) * vn * n.ny;
        if (friction) {
          const tvx = rvx - vn * n.nx, tvy = rvy - vn * n.ny;
          b.vx -= tvx * friction; b.vy -= tvy * friction;
        }
      }
      contacts.push({ nx: n.nx, ny: n.ny, depth, solid: n.solid, x: n.x, y: n.y, vn });
    }
    return contacts;
  }
}
