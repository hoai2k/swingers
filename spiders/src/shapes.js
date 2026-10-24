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
