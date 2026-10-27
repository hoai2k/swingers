// Sculpted animal bodies: one smooth closed surface per species, like the Wobblers' rubber
// bodies (player.js growShoulders), instead of primitives stuck together.
//
// A model is a list of shapes, smooth-unioned into a signed distance field and meshed once
// (surface nets) at load; normals come from the field, so shading is smooth everywhere.
//   { s: 'ball', c: [x, y, z], r }                      sphere
//   { s: 'egg', c, r: [rx, ry, rz], rot?: [x, y, z] }    ellipsoid (rot: euler, radians)
//   { s: 'limb', a: [x, y, z], b: [x, y, z], ra, rb }    tapered capsule from a (radius ra) to b (rb)
//   { s: 'chain', pts: [[x, y, z, r], ...] }             a smooth tube through the points (necks, tails, tentacles)
//   { s: 'slab', c, h: [hx, hy, hz], r, rot? }           rounded box (flat beaks, jaws)
//   { s: 'tri', pts: [a, b, c], r }                       a triangle inflated by r (fins, flukes, flippers)
// Each shape also has: color (0xrrggbb, or fn(x, y, z) -> 0xrrggbb for painted markings),
// k (how softly it blends into the others, m; default 0.06), part / pivot (critters.js rig
// part it moves with). Where a moving part meets the body the vertices get a blended weight
// (attribute aW), so a leg bends out of the body like rubber instead of hinging as a stick.
// `extras` are critters.js rig parts (Builder primitives: eyes, teeth...) added on the main
// thread (animalgeo.js). This file imports nothing: it also runs in the animal worker.

// inverse of an XYZ euler rotation, as a row-major 3x3 (the transpose of the rotation)
function invRot([a, b, c]) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // R = Rx(a) * Ry(b) * Rz(c) (three.js 'XYZ' order); rows of R:
  const R = [cb * cc, -cb * sc, sb, ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb, sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb];
  return [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
}
// 0xrrggbb (sRGB) -> linear r, g, b (what THREE.Color.set gives vertex colours)
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const LIN = new Map();
function rgb(hex) { let c = LIN.get(hex); if (!c) { c = [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255)]; LIN.set(hex, c); } return c; }

function prep(sh) {
  const o = { ...sh, k: sh.k ?? 0.06, part: sh.part || 0, pivot: sh.pivot || [0, 0, 0] };
  if (sh.rot) o.inv = invRot(sh.rot);
  if (sh.s === 'chain') { o.segs = []; for (let i = 0; i < sh.pts.length - 1; i++) o.segs.push([sh.pts[i], sh.pts[i + 1]]); }
  // bounds
  const pts = sh.s === 'tri' ? sh.pts.map((p) => [...p, sh.r]) : sh.s === 'chain' ? sh.pts : sh.s === 'limb' ? [[...sh.a, sh.ra], [...sh.b, sh.rb]] : [[...sh.c, (sh.h ? Math.hypot(...sh.h) + (sh.r || 0) : Math.max(...[].concat(sh.r ?? 0)))]];
  o.min = [Infinity, Infinity, Infinity]; o.max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { o.min[i] = Math.min(o.min[i], p[i] - p[3] - o.k); o.max[i] = Math.max(o.max[i], p[i] + p[3] + o.k); }
  return o;
}
function segDist(px, py, pz, a, b, ra, rb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L2 = dx * dx + dy * dy + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / L2));
  const x = px - a[0] - dx * t, y = py - a[1] - dy * t, z = pz - a[2] - dz * t;
  return Math.sqrt(x * x + y * y + z * z) - (ra + (rb - ra) * t);
}
function dist(o, x, y, z) {
  if (o.inv) { const m = o.inv, dx = x - o.c[0], dy = y - o.c[1], dz = z - o.c[2]; x = m[0] * dx + m[1] * dy + m[2] * dz + o.c[0]; y = m[3] * dx + m[4] * dy + m[5] * dz + o.c[1]; z = m[6] * dx + m[7] * dy + m[8] * dz + o.c[2]; }
  switch (o.s) {
    case 'ball': return Math.hypot(x - o.c[0], y - o.c[1], z - o.c[2]) - o.r;
    case 'egg': {
      const [rx, ry, rz] = o.r, X = (x - o.c[0]) / rx, Y = (y - o.c[1]) / ry, Z = (z - o.c[2]) / rz;
      const k0 = Math.sqrt(X * X + Y * Y + Z * Z), k1 = Math.sqrt(X * X / (rx * rx) + Y * Y / (ry * ry) + Z * Z / (rz * rz));
      return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
    }
    case 'limb': return segDist(x, y, z, o.a, o.b, o.ra, o.rb);
    case 'chain': { let d = Infinity; for (const [a, b] of o.segs) d = Math.min(d, segDist(x, y, z, a, b, a[3], b[3])); return d; }
    case 'tri': return triDist(x, y, z, o.pts[0], o.pts[1], o.pts[2]) - o.r;
    case 'slab': {
      const qx = Math.abs(x - o.c[0]) - o.h[0], qy = Math.abs(y - o.c[1]) - o.h[1], qz = Math.abs(z - o.c[2]) - o.h[2];
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - (o.r || 0);
    }
  }
  return Infinity;
}
// unsigned distance from a point to a 3D triangle (after Inigo Quilez)
function triDist(px, py, pz, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const p = [px, py, pz], ba = sub(b, a), pa = sub(p, a), cb = sub(c, b), pb = sub(p, b), ac = sub(a, c), pc = sub(p, c), nor = cross(ba, ac);
  const sg = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  if (sg(dot(cross(ba, nor), pa)) + sg(dot(cross(cb, nor), pb)) + sg(dot(cross(ac, nor), pc)) < 2) {
    const edge = (e, q) => { const t = Math.max(0, Math.min(1, dot(e, q) / dot(e, e))); const d = [e[0] * t - q[0], e[1] * t - q[1], e[2] * t - q[2]]; return dot(d, d); };
    return Math.sqrt(Math.min(edge(ba, pa), edge(cb, pb), edge(ac, pc)));
  }
  const dn = dot(nor, pa);
  return Math.sqrt(dn * dn / dot(nor, nor));
}
// colour anti-aliasing offsets (in cells)
const AA = [[0, 0, 0], [0.4, 0, 0], [-0.4, 0, 0], [0, 0.4, 0], [0, -0.4, 0], [0, 0, 0.4], [0, 0, -0.4], [0.25, 0.25, 0.25], [-0.25, -0.25, -0.25]];
// polynomial smooth min
function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// shapes -> typed arrays { pos, nrm, col, rig (part, pivot), w (part weight), idx }
export function sculptArrays(shapes, opts = {}) {
  const S = shapes.map(prep);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const o of S) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o.min[i]); hi[i] = Math.max(hi[i], o.max[i]); }
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const h = opts.cell || ext / (opts.res || 56);
  for (let i = 0; i < 3; i++) { lo[i] -= h * 1.5; hi[i] += h * 1.5; }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const field = (x, y, z) => { let d = Infinity; for (const o of S) { if (x < o.min[0] - h || x > o.max[0] + h || y < o.min[1] - h || y > o.max[1] + h || z < o.min[2] - h || z > o.max[2] + h) continue; d = smin(d, dist(o, x, y, z), o.k); } return d; };
  const F = new Float32Array(nx * ny * nz), id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[id(i, j, k)] = field(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
  // surface nets: one vertex per cell the surface crosses, at the mean of its edge crossings
  const vIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos = [];
  const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a0, a1, a2, b0, b1, b2] of E) {
      const fa = F[id(i + a0, j + a1, k + a2)], fb = F[id(i + b0, j + b1, k + b2)];
      if ((fa < 0) === (fb < 0)) continue;
      const t = fa / (fa - fb);
      sx += a0 + (b0 - a0) * t; sy += a1 + (b1 - a1) * t; sz += a2 + (b2 - a2) * t; n++;
    }
    if (!n) continue;
    vIdx[cid(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); }; // wound counter-clockwise seen from outside
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { // x edges
    const fa = F[id(i, j, k)], fb = F[id(i + 1, j, k)]; if ((fa < 0) === (fb < 0)) continue;
    quad(vIdx[cid(i, j - 1, k - 1)], vIdx[cid(i, j, k - 1)], vIdx[cid(i, j, k)], vIdx[cid(i, j - 1, k)], fa < 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { // y edges
    const fa = F[id(i, j, k)], fb = F[id(i, j + 1, k)]; if ((fa < 0) === (fb < 0)) continue;
    quad(vIdx[cid(i - 1, j, k - 1)], vIdx[cid(i - 1, j, k)], vIdx[cid(i, j, k)], vIdx[cid(i, j, k - 1)], fa < 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { // z edges
    const fa = F[id(i, j, k)], fb = F[id(i, j, k + 1)]; if ((fa < 0) === (fb < 0)) continue;
    quad(vIdx[cid(i - 1, j - 1, k)], vIdx[cid(i, j - 1, k)], vIdx[cid(i, j, k)], vIdx[cid(i - 1, j, k)], fa < 0);
  }
  // normals from the field; colour and part weights from how near each shape is
  const nv = pos.length / 3, nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), rigA = new Float32Array(nv * 4), wA = new Float32Array(nv);
  const e = h * 0.5, sc = opts.colorSharp ?? h * 0.5, sw = opts.weightSoft ?? ext * 0.025;
  const ds = new Float32Array(S.length);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = field(x + e, y, z) - field(x - e, y, z), gy = field(x, y + e, z) - field(x, y - e, z), gz = field(x, y, z + e) - field(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1; nrm[v * 3] = gx / gl; nrm[v * 3 + 1] = gy / gl; nrm[v * 3 + 2] = gz / gl;
    let dmin = Infinity;
    for (let s = 0; s < S.length; s++) { ds[s] = dist(S[s], x, y, z); dmin = Math.min(dmin, ds[s]); }
    let r = 0, g = 0, b = 0, wsum = 0;
    const pw = {};
    let pall = 0;
    for (let s = 0; s < S.length; s++) {
      const o = S[s];
      const wc = Math.exp(-(ds[s] - dmin) / sc);
      if (wc > 1e-4) {
        if (typeof o.color === 'function') { // painted markings: average a few nearby samples, so edges don't step along the mesh
          for (const [ox, oy, oz] of AA) { const c = rgb(o.color(x + ox * h, y + oy * h, z + oz * h)); r += c[0] * wc / AA.length; g += c[1] * wc / AA.length; b += c[2] * wc / AA.length; }
        } else { const c = rgb(o.color ?? 0xffffff); r += c[0] * wc; g += c[1] * wc; b += c[2] * wc; }
        wsum += wc;
      }
      const ww = Math.exp(-(ds[s] - dmin) / sw);
      pw[o.part] = (pw[o.part] || 0) + ww; pall += ww;
    }
    col[v * 3] = r / wsum; col[v * 3 + 1] = g / wsum; col[v * 3 + 2] = b / wsum;
    let best = 0, bw = 0;
    for (const p in pw) if (+p !== 0 && pw[p] > bw) { bw = pw[p]; best = +p; }
    const w = best ? bw / pall : 0;
    const piv = best ? S.find((o) => o.part === best).pivot : [0, 0, 0];
    rigA.set([best, piv[0], piv[1], piv[2]], v * 4);
    wA[v] = w * w * (3 - 2 * w); // smoothstep: firm along the limb, soft where it meets the body
  }
  // marks (eyes, mouths...: animalgeo.js draws them): each `at` point is slid onto the surface
  // along the field's gradient, and its outward normal recorded; `mirror` adds the x-mirrored one
  const marks = opts.marks || [], anc = new Float32Array(marks.length * 12);
  marks.forEach((m, i) => {
    for (const side of [1, -1]) {
      let x = m.at[0] * side, y = m.at[1], z = m.at[2], gx = 0, gy = 0, gz = 1;
      for (let it = 0; it < 30; it++) {
        const d = field(x, y, z);
        gx = field(x + e, y, z) - field(x - e, y, z); gy = field(x, y + e, z) - field(x, y - e, z); gz = field(x, y, z + e) - field(x, y, z - e);
        const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
        x -= d * gx; y -= d * gy; z -= d * gz;
        if (Math.abs(d) < h * 0.02) break;
      }
      anc.set([x, y, z, gx, gy, gz], i * 12 + (side > 0 ? 0 : 6));
    }
  });
  return { pos: new Float32Array(pos), nrm, col, rig: rigA, w: wA, idx: nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), anc };
}
