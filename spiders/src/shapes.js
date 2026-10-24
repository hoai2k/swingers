// Polygon builders for organic, non-boxy boards. All return [[x,y], ...]
// usable as a solid's `poly`. Keep vertex counts modest (< ~60) — collision
// cost grows with edges.

import { mulberry, TAU } from './util.js';

// a lumpy rock/island: ellipse with seeded noise on the radius
export function blob(cx, cy, rx, ry, { n = 22, seed = 1, rough = 0.12, flatTop = 0, flatBottom = 0 } = {}) {
  const rnd = mulberry(seed * 9973 + 17);
  const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let k = 1 + rough * (0.55 * Math.sin(a * 3 + ph[0]) + 0.3 * Math.sin(a * 5 + ph[1]) + 0.25 * (rnd() - 0.5) * 2);
    let x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (flatTop && y < cy - ry * (1 - flatTop)) y = cy - ry * (1 - flatTop) + (y - (cy - ry * (1 - flatTop))) * 0.15;
    if (flatBottom && y > cy + ry * (1 - flatBottom)) y = cy + ry * (1 - flatBottom) + (y - (cy + ry * (1 - flatBottom))) * 0.15;
    pts.push([Math.round(x), Math.round(y)]);
  }
  return pts;
}

// floating island: flat-ish grassy top, tapering rocky underside
export function island(cx, topY, w, depth, { seed = 1, n = 26, rough = 0.1 } = {}) {
  const rnd = mulberry(seed * 7919 + 3);
  const pts = [];
  const half = w / 2;
  const topN = Math.ceil(n * 0.4);
  for (let i = 0; i <= topN; i++) {
    const u = i / topN;
    const x = cx - half + u * w;
    const y = topY + Math.sin(u * Math.PI * 2 + seed) * 6 * rough * 10 * 0.3 + (u < 0.06 || u > 0.94 ? 10 : 0);
    pts.push([Math.round(x), Math.round(y)]);
  }
  const botN = n - topN;
  for (let i = 1; i < botN; i++) {
    const u = i / botN;
    const x = cx + half - u * w;
    const shape = Math.sin(u * Math.PI);          // deepest in the middle
    const y = topY + 18 + shape * depth * (0.75 + rnd() * 0.5 * rough * 5);
    pts.push([Math.round(x + (rnd() - 0.5) * 16), Math.round(y)]);
  }
  return pts;
}

// rounded rectangle
export function rrect(x, y, w, h, r = 18, seg = 4) {
  r = Math.min(r, w / 2, h / 2);
  const pts = [];
  const corners = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
    }
  }
  return pts;
}

// thick line with round ends (beams, branches, pipes)
export function capsule(x1, y1, x2, y2, r, seg = 6) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = a - Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([Math.round(x2 + Math.cos(t) * r), Math.round(y2 + Math.sin(t) * r)]);
  }
  for (let i = 0; i <= seg; i++) {
    const t = a + Math.PI / 2 + (i / seg) * Math.PI;
    pts.push([Math.round(x1 + Math.cos(t) * r), Math.round(y1 + Math.sin(t) * r)]);
  }
  return pts;
}

// a curved band (arch, crescent, halfpipe): ring sector between radii r0..r1
export function arc(cx, cy, r0, r1, a0, a1, seg = 16) {
  const pts = [];
  for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * (i / seg); pts.push([Math.round(cx + Math.cos(a) * r1), Math.round(cy + Math.sin(a) * r1)]); }
  for (let i = seg; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / seg); pts.push([Math.round(cx + Math.cos(a) * r0), Math.round(cy + Math.sin(a) * r0)]); }
  return pts;
}

// ground strip along the bottom/top with a wavy surface. `heights` are
// sample y values spread evenly from x0 to x1; the shape closes to yBase.
export function terrain(x0, x1, heights, yBase, { smooth = 2 } = {}) {
  let pts = heights.map((y, i) => [x0 + ((x1 - x0) * i) / (heights.length - 1), y]);
  for (let k = 0; k < smooth; k++) pts = chaikinOpen(pts);
  return [...pts.map(([x, y]) => [Math.round(x), Math.round(y)]), [x1, yBase], [x0, yBase]];
}

// smooth any closed polygon (corner cutting); iterations 1-2
export function smoothPoly(pts, iterations = 1) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p.map(([x, y]) => [Math.round(x), Math.round(y)]);
}

function chaikinOpen(p) {
  const out = [p[0]];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  out.push(p[p.length - 1]);
  return out;
}

// regular polygon / star (crystals, gears)
export function star(cx, cy, r0, r1, points = 5, rot = 0) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? r0 : r1;
    const a = rot + (i / (points * 2)) * TAU;
    pts.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]);
  }
  return pts;
}
export function ngon(cx, cy, r, n = 6, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; pts.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]); }
  return pts;
}

// translate/scale/mirror helpers
export const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);
export const mirrorX = (pts, w = 1920) => pts.map(([x, y]) => [w - x, y]).reverse();

// rotate points about (cx, cy) by a radians
export function rotate(pts, cx, cy, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [Math.round(cx + (x - cx) * c - (y - cy) * s), Math.round(cy + (x - cx) * s + (y - cy) * c)]);
}

// a slanted slab (fallen pillar, roof pane, catwalk): rounded rect of w x h
// centred on (cx, cy), tilted by angle a
export function shard(cx, cy, w, h, a = 0, r = 12) {
  return rotate(rrect(cx - w / 2, cy - h / 2, w, h, r, 3), cx, cy, a);
}

// a tapered spike with a rounded tip hanging from (x, y) (dir 1 = down,
// -1 = up: stalagmite). The base reaches `root` units back into the rock.
export function spike(x, y, w, len, { dir = 1, root = 40, bend = 0, seed = 1 } = {}) {
  const rnd = mulberry(seed * 131 + 7);
  const h = w / 2, tip = Math.max(5, w * 0.12);
  const pts = [];
  const side = (k, s) => {
    // k: 0 base -> 1 tip, s: -1 left / +1 right
    const wid = h * Math.pow(1 - k, 1.35) + tip * k;
    return [x + s * wid + bend * k * k + (rnd() - 0.5) * 4 * (1 - k), y + dir * k * len];
  };
  pts.push([x - h, y - dir * root]);
  for (const k of [0, 0.3, 0.55, 0.78, 0.92]) pts.push(side(k, -1));
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI + (i / 4) * Math.PI;   // round tip
    pts.push([x + bend + Math.cos(a) * tip, y + dir * (len - Math.sin(a) * tip * 0.9 - tip * 0.6)]);
  }
  for (const k of [0.92, 0.78, 0.55, 0.3, 0]) pts.push(side(k, 1));
  pts.push([x + h, y - dir * root]);
  return pts.map(([a, b]) => [Math.round(a), Math.round(b)]);
}

// a gear: `teeth` trapezoid teeth between radii r0 (root) and r1 (tip)
export function gear(cx, cy, r0, r1, teeth = 10, rot = 0) {
  const pts = [];
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * step;
    pts.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
    pts.push([cx + Math.cos(a + step * 0.2) * r1, cy + Math.sin(a + step * 0.2) * r1]);
    pts.push([cx + Math.cos(a + step * 0.5) * r1, cy + Math.sin(a + step * 0.5) * r1]);
    pts.push([cx + Math.cos(a + step * 0.7) * r0, cy + Math.sin(a + step * 0.7) * r0]);
  }
  return pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
}

// a broken ring: `n` arc segments between radii r0..r1 with `gap` radians
// between them, starting at angle a0. Returns a list of polys.
export function ring(cx, cy, r0, r1, n = 3, gap = 0.5, a0 = 0, seg = 8) {
  const out = [];
  const span = TAU / n;
  for (let i = 0; i < n; i++) {
    const s = a0 + i * span + gap / 2;
    out.push(arc(cx, cy, r0, r1, s, s + span - gap, seg));
  }
  return out;
}

// vertical ground (a cave wall): like terrain() but along y. `xs` are
// sample x values from y0 to y1; the shape closes to xBase.
export function wall(y0, y1, xs, xBase, opts) {
  return terrain(y0, y1, xs, xBase, opts).map(([y, x]) => [x, y]);
}
