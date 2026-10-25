// Frostpeak layout: where everything sits. Shared by the terrain descriptor
// (snow.js: flats and road strips that carve the pistes, the lift line, the
// lake...) and the builders in this folder, so the ground and the things on it
// always agree. Coordinates: +x east, +z south (map north is -z).

export const VILLAGE = { x0: -80, x1: 80, z0: -845, z1: -755, y: 8 };
// chairlift: bottom bullwheel in the village, top bullwheel on a shelf below the summit
export const LIFT = { x: -50, zb: -833, zt: -1086, yb: 8, yt: 132, gap: 2.6 };
export const TOP = { x0: -66, x1: -34, z0: -1100, z1: -1064, y: 132 };      // top station shelf
export const SUMMIT = { x: -40, z: -1165, y: 168, r: 15 };                  // observatory plateau
export const LAKE = { x: -150, z: -822, r: 25, y: 5 };                      // frozen lake (skating)
export const CAVE = { x: -205, z: -922, w: 18, d: 26, y: 27 };              // ice cave (notch in the hillside, entrance south)
export const CABIN = { x: -160, z: -1000, y: 90 };                          // mountain cabin
export const HAMLET = { x0: 96, x1: 142, z0: -792, z1: -754, y: 3 };         // fishing hamlet by the dock
export const JUMP = { x: -108, zTop: -952, zLip: -906, yTop: 46, yLip: 26, w: 7 }; // ski jump (downhill = +z)

// Groomed piste from the top station down to the village (spline control
// points; heights are graded evenly between the two ends).
export const PISTE_PTS = [[-30, -1068], [20, -1052], [80, -1012], [104, -962], [78, -930], [22, -915], [-12, -893], [4, -866], [12, -850]];
export const PISTE_W = 16;
const PISTE_Y0 = TOP.y - 0.2, PISTE_Y1 = VILLAGE.y;

function catmull(pts, perSeg = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// Polyline of [x, z, y] along the piste, ~6 m apart, graded from top to bottom.
export function pisteLine() {
  const c = catmull(PISTE_PTS, 8);
  const L = [0];
  for (let i = 1; i < c.length; i++) L.push(L[i - 1] + Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]));
  const tot = L[L.length - 1];
  return c.map(([x, z], i) => {
    const t = L[i] / tot; // even grade
    return [x, z, PISTE_Y0 + (PISTE_Y1 - PISTE_Y0) * t];
  });
}

// Distance from (x, z) to the piste centre line (for keeping trees off it).
let _pl = null, _bb = null;
export function pisteDist(x, z) {
  if (!_pl) {
    _pl = pisteLine();
    _bb = [Math.min(..._pl.map((p) => p[0])), Math.max(..._pl.map((p) => p[0])), Math.min(..._pl.map((p) => p[1])), Math.max(..._pl.map((p) => p[1]))];
  }
  const ox = Math.max(_bb[0] - x, x - _bb[1], 0), oz = Math.max(_bb[2] - z, z - _bb[3], 0);
  if (ox > 40 || oz > 40) return Math.hypot(ox, oz);
  let d = 1e9;
  for (let i = 0; i < _pl.length - 1; i++) {
    const [ax, az] = _pl[i], [bx, bz] = _pl[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}

// Nearest point of the piste centre line: distance and the graded height there.
const _pi = { d: 0, y: 0 };
export function pisteAt(x, z) {
  pisteDist(x, z); // builds the line + bbox
  const ox = Math.max(_bb[0] - x, x - _bb[1], 0), oz = Math.max(_bb[2] - z, z - _bb[3], 0);
  _pi.d = 1e9;
  if (ox > 40 || oz > 40) return _pi;
  for (let i = 0; i < _pl.length - 1; i++) {
    const [ax, az, ay] = _pl[i], [bx, bz, by] = _pl[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < _pi.d) { _pi.d = d; _pi.y = ay + (by - ay) * t; }
  }
  return _pi;
}

// Zig-zag track from the top station up to the observatory (also for snowmobiles).
export const SUMMIT_TRACK = [[-40, -1094, TOP.y], [14, -1114, 150], [-30, -1150, SUMMIT.y]];
