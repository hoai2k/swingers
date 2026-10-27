// Battleground: Ba Sing Se Walls (the Avatar faction's map). An Earth Kingdom field
// before the great outer wall: a paved road across the middle to a stone pavilion with a
// curved green tiled roof (only its four columns are obstacles, so the middle stays
// open), earthbent rock pillars and slabs jutting from the ground at angles, low stone
// walls and an earth rampart for cover, bamboo and pines. Outside: the towering
// green-and-tan wall along the far (-z) edge with its great gate and watchtowers,
// terraced fields with farmhouses on the hills, and warm afternoon light.
import { THREE } from '../util.js';
import { register } from '../ext.js';
import { MAPS, MAP_H } from '../world.js';

const { merged, T, lumpy, instanced, vcMat, comp, FIELD } = MAP_H;
const PI = Math.PI;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

const ROCK = '#a08a68', PILLAR = '#9c8a70', TAN = '#cdb68a', GREEN = '#3f8a4a', JADE = '#2f6e3c', GOLD = '#d8b040';
const WALL_Z = -(FIELD.z + 44); // the outer wall's field-facing foot
const WALL_H = 34;

// a hip roof with a concave (swept) profile and upturned corners: w x d at the eaves,
// rising h above y0. Stacked slabs in alternating tile shades, a ridge and finial.
function roof(out, x, y0, z, w, d, h, col = GREEN, ry = 0, opts = {}) {
  const M = T(x, y0, z, 1, 1, 1, 0, ry, 0);
  const add = (g, c, m) => out.push([g, c, M.clone().multiply(m)]);
  const N = opts.n || 9, ridge = opts.ridge ?? Math.min(w, d) * 0.12;
  for (let t = 0; t < N; t++) {
    const a = t / N, b = (t + 1) / N;
    const ya = h * a * a, yb = h * b * b;
    const ww = (w - ridge) * (1 - a) + ridge, dd = (d - ridge) * (1 - a) + ridge;
    add(BOX(ww, Math.max(0.12, yb - ya + 0.05), dd), shade(col, t % 2 ? 0.86 : 1), T(0, (ya + yb) / 2, 0));
  }
  add(BOX(w + 0.25, 0.18, d + 0.25), shade(col, 0.7), T(0, 0.02, 0)); // eave edge
  add(BOX(Math.max(ridge, w - d + ridge) + 0.3, 0.3, ridge * 0.6 + 0.2), shade(col, 0.6), T(0, h + 0.1, 0));
  // upturned corners: short tiles sweeping up and out along the hip lines
  const kk = opts.k || 1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const yaw = Math.atan2(-sz, sx), L = 0.6 * kk;
    add(BOX(L, 0.2 * kk, 0.3 * kk), shade(col, 0.72), T(sx * (w / 2 - 0.1 * kk), 0.1, sz * (d / 2 - 0.1 * kk), 1, 1, 1, 0, yaw, 0).multiply(T(0, 0, 0, 1, 1, 1, 0, 0, 0.6)).multiply(T(L / 2, 0, 0)));
  }
  if (opts.finial !== false) {
    add(CYL(0.12 * (opts.k || 1), 0.2 * (opts.k || 1), 0.9 * (opts.k || 1), 6), GOLD, T(0, h + 0.6 * (opts.k || 1), 0));
    add(new THREE.SphereGeometry(0.22 * (opts.k || 1), 8, 6), GOLD, T(0, h + 1.1 * (opts.k || 1), 0));
  }
  return out;
}

// mirrored copies (seed x.5) turn round, so slabs lean the point-symmetric way
const flipOf = (o) => (o.seed % 1 ? T(0, 0, 0, 1, 1, 1, 0, PI, 0) : null);
const pushAll = (p, list, F) => { for (const [g, c, m] of list) p.push([g, c, F ? F.clone().multiply(m) : m]); };

// ---------------------------------------------------------------- obstacles
register({
  obstacles: {
    // an earthbent pillar: a squared rock column with strata, a slight tilt, a lighter
    // broken top and rubble round its foot
    earthpillar(o, map, H, box, p, dn) {
      const s = o.seed, w = o.hw * 2, d = o.hd * 2, h = o.h, L = [];
      const tx = (hash(s * 3.1) - 0.5) * 0.12, tz = (hash(s * 5.3) - 0.5) * 0.12;
      const tilt = T(0, 0, 0, 1, 1, 1, tx, 0, tz);
      const add = (g, c, m) => L.push([g, c, tilt.clone().multiply(m)]);
      const c = shade(PILLAR, 0.94 + hash(s) * 0.12);
      add(BOX(w, h + dn, d), c, T(0, (h - dn) / 2, 0));
      add(BOX(w + 0.05, 0.1, d + 0.05), shade(PILLAR, 0.8), T(0, h * (0.35 + hash(s * 2) * 0.3), 0)); // a stratum
      add(BOX(w * 0.6, h * 0.5, 0.06), shade(PILLAR, 0.88), T(-w * 0.12, h * 0.55, d / 2 + 0.02)); // facets
      add(BOX(0.06, h * 0.4, d * 0.55), shade(PILLAR, 1.06), T(w / 2 + 0.02, h * 0.4, d * 0.1));
      add(BOX(w * 1.02, 0.12, d * 1.02), shade(PILLAR, 1.18), T(0, h - 0.04, 0)); // the flat bent top
      add(BOX(w * 0.5, 0.25, d * 0.45), shade(PILLAR, 1.1), T(w * 0.15, h + 0.08, -d * 0.12, 1, 1, 1, 0.1, 0.3, -0.12));
      for (let i = 0; i < 4; i++) {
        const a = hash(s * 7 + i) * PI * 2, r = Math.max(w, d) * 0.62;
        L.push([lumpy(0.28 + hash(s + i * 3) * 0.2, 0, 0.4, s + i, false), shade(ROCK, 0.85), T(Math.cos(a) * r, 0.08, Math.sin(a) * r)]);
      }
      pushAll(p, L, flipOf(o));
    },
    // an earthbent slab torn up from the ground and leaning (low edge on local -z), with
    // the raw earth it came out of
    earthslab(o, map, H, box, p, dn) {
      const s = o.seed, w = o.hw * 2, h = o.h, d = o.hd * 2, L = [];
      const len = Math.hypot(d, h), th = -Math.atan2(h, d), thick = 0.55;
      L.push([BOX(w, thick, len), shade(ROCK, 1.02), T(0, h / 2, 0, 1, 1, 1, th, 0, 0).multiply(T(0, -thick / 2, 0))]);
      L.push([BOX(w * 0.9, 0.06, len * 0.9), shade(ROCK, 1.16), T(0, h / 2, 0, 1, 1, 1, th, 0, 0).multiply(T(0, 0.01, 0))]);
      L.push([BOX(w + 0.2, 0.5 + dn, 0.9), shade(ROCK, 0.85), T(0, (0.5 - dn) / 2, -o.hd + 0.3)]);
      for (let i = 0; i < 5; i++) L.push([lumpy(0.25 + hash(s * 3 + i) * 0.2, 0, 0.4, s * 2 + i, false), shade('#7a6040', 0.9 + hash(i) * 0.2), T((hash(s + i * 5) - 0.5) * w, 0.05, -o.hd - 0.2 - hash(s * 9 + i) * 0.5)]);
      pushAll(p, L, flipOf(o));
    },
    // Earth Kingdom low wall: ochre stone, darker courses, green tiled coping
    ekwall(o, map, H, box, p, dn) {
      const W = o.hw * 2, D = o.hd * 2, h = o.h;
      box(W, h + dn, D, TAN, 0, (h - dn) / 2, 0);
      box(W + 0.12, 0.35, D + 0.16, shade(TAN, 0.8), 0, 0.08, 0);
      box(W + 0.04, 0.07, D + 0.04, shade(TAN, 0.78), 0, h * 0.55, 0);
      for (const sz of [-1, 1]) box(W + 0.3, 0.12, D * 0.62, GREEN, 0, h + 0.12, sz * D * 0.32, sz * 0.45, 0, 0);
      box(W + 0.3, 0.14, 0.18, shade(GREEN, 0.7), 0, h + 0.26, 0);
      for (let x = -W / 2 + 1.6; x < W / 2 - 0.8; x += 3.2) for (const sz of [-1, 1]) p.push([CYL(0.22, 0.22, 0.04, 12), GOLD, T(x, h * 0.75, sz * (D / 2 + 0.02), 1, 1, 1, PI / 2, 0, 0)]);
    },
    // the pavilion's columns (the roof is drawn in the scenery hook)
    pavcol(o, map, H, box, p, dn) {
      const r = o.r, h = o.h;
      box(r * 2.8, 0.35 + dn, r * 2.8, '#b8a684', 0, (0.35 - dn) / 2, 0);
      p.push([CYL(r * 0.9, r, h, 12), '#7a2a22', T(0, h / 2, 0)]);
      for (const y of [0.5, h - 0.4]) p.push([CYL(r * 1.05, r * 1.05, 0.14, 12), GOLD, T(0, y, 0)]);
    },
  },
});

// ---------------------------------------------------------------- trees
MAP_H.TREES.bamboo = () => {
  const p = [];
  for (let k = 0; k < 9; k++) {
    const a = k * 2.4, r = 0.18 + hash(k * 3.3) * 0.45, x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const H = 5.5 + hash(k * 7.1) * 3, lean = (hash(k * 1.9) - 0.5) * 0.12, n = Math.round(H / 0.85);
    const rad = 0.07 + hash(k) * 0.03;
    p.push([new THREE.CylinderGeometry(rad * 0.8, rad, H, 5, 1, true), k % 2 ? '#8db64a' : '#7ea840', T(x0 + Math.sin(lean) * H / 2, H / 2, z0 + Math.sin(lean * 0.6) * H / 2, 1, 1, 1, lean * 0.6, 0, -lean)]);
    for (let i = 0; i < n; i++) {
      const y = i * (H / n), x = x0 + Math.sin(lean) * y, z = z0 + Math.sin(lean * 0.6) * y;
      if (i) p.push([new THREE.CylinderGeometry(rad * 1.2, rad * 1.2, 0.07, 5, 1, true), '#5f8a30', T(x, y, z)]);
      if (i > n * 0.45 && i % 2 === 0) {
        const la = a + i * 1.7;
        for (let q = 0; q < 3; q++) {
          const leaf = new THREE.ConeGeometry(0.11, 0.9, 3);
          leaf.scale(1, 1, 0.25);
          const b = la + q * 0.7;
          p.push([leaf, q % 2 ? '#5a9e3a' : '#6fb048', T(x + Math.cos(b) * 0.4, y + H / n - 0.1, z + Math.sin(b) * 0.4, 1, 1, 1, 0, -b, PI / 2 + 0.5)]);
        }
      }
    }
  }
  return merged(p);
};

// ---------------------------------------------------------------- set dressing
function basingseScenery(group, map, terrain, H, kit) {
  const { at, addMerged } = kit;
  // ---- the outer wall of Ba Sing Se along the far -z edge, with towers and the gate
  {
    const parts = [];
    const z0 = WALL_Z, D = 14, base = -6, top = WALL_H;
    const GATE = 15; // half width of the gate block
    const seg = (x0, x1) => {
      for (let x = x0; x < x1 - 0.01; x += 12) {
        const w = Math.min(12, x1 - x), cx = x + w / 2, k = 0.96 + hash(cx * 0.37) * 0.08;
        parts.push([BOX(w + 0.05, top - base, D), shade(TAN, k), T(cx, (top + base) / 2, z0 - D / 2)]);
        parts.push([BOX(w + 0.05, 9, 3), shade(TAN, k * 0.9), T(cx, base + 4.5 + 3, z0 + 1.2, 1, 1, 1, -0.25, 0, 0)]); // battered foot
        for (let y = 6; y < top - 2; y += 4.5) parts.push([BOX(w + 0.05, 0.35, 0.3), shade(TAN, 0.8), T(cx, y, z0 + 0.1)]);
        // parapet: merlons on both edges with green tile caps, a walkway between
        for (let m = 0; m < w / 2.4 - 0.1; m++) for (const ez of [0.6, D - 0.6]) {
          const mx = x + 1.2 + m * 2.4;
          parts.push([BOX(1.5, 2, 1.2), shade(TAN, k * 1.02), T(mx, top + 1, z0 - ez)]);
          parts.push([BOX(1.8, 0.25, 1.5), GREEN, T(mx, top + 2.1, z0 - ez)]);
        }
        parts.push([BOX(w + 0.05, 0.5, D + 0.6), shade(GREEN, 0.75), T(cx, top + 0.1, z0 - D / 2)]);
      }
    };
    seg(-300, -GATE); seg(GATE, 300);
    // watchtowers: proud of the wall, two pagoda roofs each
    for (let x = -255; x <= 255; x += 60) {
      if (Math.abs(x) < GATE + 10) continue;
      const tx = x + 15;
      parts.push([BOX(12, top - base + 8, 16), shade(TAN, 1.04), T(tx, (top + 8 + base) / 2, z0 - 6)]);
      for (let y = 8; y < top + 6; y += 5) parts.push([BOX(12.3, 0.4, 16.3), shade(TAN, 0.82), T(tx, y, z0 - 6)]);
      parts.push([BOX(7, 6, 9), shade(TAN, 1.08), T(tx, top + 11, z0 - 6)]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push([CYL(0.35, 0.35, 6, 8), '#7a2a22', T(tx + sx * 3.2, top + 11, z0 - 6 + sz * 4.2)]);
      roof(parts, tx, top + 8, z0 - 6, 15, 19, 3.2, GREEN, 0, { finial: false, k: 2.4 });
      roof(parts, tx, top + 14, z0 - 6, 10, 13, 4.5, GREEN, 0, { k: 2 });
      for (let y = 14; y < top; y += 9) parts.push([BOX(1.1, 2.2, 0.2), '#2a2218', T(tx, y, z0 + 2.05)]); // arrow slits
    }
    // the great gate: twin gate towers, a deep arched opening with green doors and the
    // Earth Kingdom emblem, a three-tier gatehouse over it
    for (const sx of [-1, 1]) {
      parts.push([BOX(10, top - base + 6, 20), shade(TAN, 1.05), T(sx * (GATE - 5), (top + 6 + base) / 2, z0 - 8)]);
      for (let y = 8; y < top + 4; y += 5) parts.push([BOX(10.3, 0.4, 20.3), shade(TAN, 0.82), T(sx * (GATE - 5), y, z0 - 8)]);
    }
    parts.push([BOX(10.05, top - 18 - base + 6, 20), shade(TAN, 1.0), T(0, (top + 6 + 18) / 2, z0 - 8)]);
    parts.push([BOX(10.2, 18 - base, 1), '#2a2218', T(0, (18 + base) / 2, z0 - 3)]);
    parts.push([new THREE.CylinderGeometry(5, 5, 1, 24, 1, false, -PI / 2, PI), '#2a2218', T(0, 13, z0 - 2.9, 1, 1, 1, PI / 2, 0, 0)]);
    for (const sx of [-1, 1]) {
      parts.push([BOX(4.7, 13, 0.6), JADE, T(sx * 2.45, 6.5, z0 - 2.3)]);
      for (let y = 1.5; y < 12.5; y += 2.2) parts.push([BOX(4.7, 0.18, 0.7), shade(JADE, 0.7), T(sx * 2.45, y, z0 - 2.25)]);
    }
    parts.push([CYL(2.2, 2.2, 0.3, 24), GOLD, T(0, 8.5, z0 - 1.9, 1, 1, 1, PI / 2, 0, 0)]);
    parts.push([CYL(1.5, 1.5, 0.34, 24), JADE, T(0, 8.5, z0 - 1.85, 1, 1, 1, PI / 2, 0, 0)]);
    parts.push([BOX(1.2, 1.2, 0.4), GOLD, T(0, 8.5, z0 - 1.8, 1, 1, 1, 0, 0, PI / 4)]);
    // gatehouse
    const gy = top + 6;
    parts.push([BOX(26, 7, 12), shade(TAN, 1.1), T(0, gy + 3.5, z0 - 8)]);
    for (let x = -12; x <= 12; x += 4) parts.push([CYL(0.45, 0.45, 7, 8), '#7a2a22', T(x, gy + 3.5, z0 - 1.8)]);
    roof(parts, 0, gy + 7, z0 - 8, 32, 18, 4, GREEN, 0, { finial: false, k: 2.6 });
    parts.push([BOX(18, 5, 9), shade(TAN, 1.12), T(0, gy + 13.5, z0 - 8)]);
    roof(parts, 0, gy + 16, z0 - 8, 23, 13, 4.5, GREEN, 0, { finial: false, k: 2.2 });
    parts.push([BOX(9, 4, 6), shade(TAN, 1.12), T(0, gy + 22, z0 - 8)]);
    roof(parts, 0, gy + 24, z0 - 8, 13, 9, 5, GREEN, 0, { k: 1.8 });
    // banners on the wall face
    for (let x = -100; x <= 100; x += 25) {
      if (Math.abs(x) < GATE + 3) continue;
      parts.push([BOX(3, 9, 0.15), JADE, T(x, top - 6, z0 + 0.15)]);
      parts.push([CYL(0.9, 0.9, 0.1, 16), GOLD, T(x, top - 5, z0 + 0.25, 1, 1, 1, PI / 2, 0, 0)]);
    }
    const m = new THREE.Mesh(merged(parts), kit.pmat);
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    group.add(m);
  }
  // ---- terraced fields with crop rows and farmhouses on the hills (not by the wall)
  {
    const crops = [], houses = [];
    for (let i = 0; i < 6000 && crops.length < 1100; i++) {
      const x = Math.round((hash(i * 1.37) - 0.5) * 220 / 3.4) * 3.4, z = Math.round((hash(i * 2.91) - 0.5) * 220 / 1.3) * 1.3;
      const o = MAP_H.outDist(x, z);
      if (o < 10 || o > 95 || z < -FIELD.z - 6) continue; // not on the plain before the wall
      const y = at(x, z), nrm = terrain.normal(x, z, new THREE.Vector3());
      if (nrm.y < 0.985 || terrain.normal(x + 1.6, z, nrm).y < 0.97 || terrain.normal(x - 1.6, z, nrm).y < 0.97) continue; // only on the flat of a terrace
      crops.push(comp(x, y - 0.05, z, 1, 0.8 + hash(i) * 0.5, 0));
    }
    const row = merged([[BOX(3, 0.45, 0.5), '#6aa83a', T(0, 0.22, 0)], [BOX(3, 0.2, 0.3), '#8cc04a', T(0, 0.5, 0)]]);
    if (crops.length) group.add(instanced(row, vcMat(), crops, false, (c, i) => c.setHSL(0.18 + hash(i) * 0.08, 0.5, 0.45 + hash(i * 3) * 0.12)));
    for (let k = 0; k < 9; k++) {
      const a = 0.3 + (k / 9) * (PI - 0.6), r = 62 + hash(k * 4.4) * 20;
      const x = Math.cos(a) * r * 1.4, z = Math.sin(a) * r * 0.9 + 10;
      const y = at(x, z), ry = hash(k) * 3;
      const M = T(x, y, z, 1, 1, 1, 0, ry, 0);
      for (const [g, c, mm] of [[BOX(6, 3.2, 4.5), '#d8c49a', T(0, 1.5, 0)], [BOX(6.3, 0.5, 4.8), '#a08a68', T(0, 0, 0)], [BOX(1, 1.8, 0.1), '#5a3a22', T(0, 1, 2.27)]]) houses.push([g, c, M.clone().multiply(mm)]);
      for (const [g, c, mm] of roof([], 0, 3.1, 0, 7.6, 6, 2.2, GREEN, 0, { finial: false, n: 5 })) houses.push([g, c, M.clone().multiply(mm)]);
    }
    addMerged(houses);
  }
  // ---- the pavilion's curved green roof over its columns
  const F = terrain.feat;
  if (F) {
    const cols = F.obs.filter((o) => o.kind === 'pavcol');
    if (cols.length) {
      const h = cols[0].h, y = Math.max(...cols.map((o) => o.ground)) + h, ext = Math.max(...cols.map((o) => Math.abs(o.x))) + 0.5;
      const p = [];
      for (const sz of [-1, 1]) {
        p.push([BOX(ext * 2 + 0.6, 0.5, 0.4), '#7a2a22', T(0, y - 0.2, sz * (ext - 0.5))]);
        p.push([BOX(0.4, 0.5, ext * 2 + 0.6), '#7a2a22', T(sz * (ext - 0.5), y - 0.2, 0)]);
        p.push([BOX(ext * 2 - 1, 0.12, 0.1), GOLD, T(0, y - 0.5, sz * (ext - 0.3))]);
      }
      p.push([BOX(ext * 2 + 0.4, 0.3, ext * 2 + 0.4), '#5e2a20', T(0, y + 0.15, 0)]);
      roof(p, 0, y + 0.3, 0, ext * 2 + 3.4, ext * 2 + 3.4, 1.6, GREEN, 0, { finial: false, n: 6, k: 1.3 });
      p.push([BOX(ext * 1.1, 0.9, ext * 1.1), '#7a2a22', T(0, y + 2.2, 0)]);
      roof(p, 0, y + 2.6, 0, ext * 1.6 + 1.2, ext * 1.6 + 1.2, 2.2, GREEN, PI / 4 * 0, { n: 7, k: 1.1 });
      addMerged(p);
    }
  }
  // stone lanterns along the road out to the gate and by the field edge
  {
    const ms = [];
    for (let z = -FIELD.z - 8; z > WALL_Z + 6; z -= 9) for (const sx of [-1, 1]) ms.push(comp(sx * 5.5, at(sx * 5.5, z), z, 1, 1, 0));
    const lantern = merged([
      [BOX(0.8, 0.3, 0.8), '#a89878', T(0, 0.15, 0)], [CYL(0.18, 0.22, 1.2, 6), '#b8a888', T(0, 0.9, 0)],
      [BOX(0.7, 0.6, 0.7), '#c8b898', T(0, 1.75, 0)], [BOX(0.5, 0.35, 0.72), '#ffe0a0', T(0, 1.75, 0)],
      [new THREE.ConeGeometry(0.75, 0.5, 4), '#a89878', T(0, 2.3, 0, 1, 1, 1, 0, PI / 4, 0)],
    ]);
    if (ms.length) group.add(instanced(lantern, kit.pmat, ms));
  }
}
register({ scenery: { basingse: basingseScenery } });

// ---------------------------------------------------------------- the map
const pillar = (L, x, z, hw, hd, h, rot = 0) => L.box('earthpillar', x, z, hw, hd, h, rot);

MAPS.push({
  id: 'basingse', name: 'Ba Sing Se Walls', music: 'battle_avatar',
  ground: ['#8fa24e', '#a6b660', '#76893e'], patch: '#c8b86c', dirt: '#a8875a', high: '#a6b462', far: '#8e9a5c', rock: ROCK,
  sky: ['#5a92d2', '#f6d8a6'], fog: '#ead2a8', fogNear: 130, fogFar: 540, sun: '#ffd49a', sunI: 2.9, hemiGround: '#8a6e40', hemiI: 1.2,
  hills: 1.4, bumps: 0.35, trees: ['pine', 'bamboo', 'pine', 'oak'], grass: '#8eaa48', grassTip: '#d6c470',
  flowers: ['#ffffff', '#f2c84a', '#e86a5a', '#f0a0c0'], bushes: '#5a7a34', props: 'basingse', mountains: '#9c9a84',
  stone: TAN, wood: '#7a4a2a', tufts: 0.45,
  // a level plain before the wall; elsewhere the hills are cut into terraced fields
  shape(x, z, y, out) {
    const st = 2.2, q = y / st, f = q - Math.floor(q);
    const terr = st * (Math.floor(q) + smooth(clamp01((f - 0.72) / 0.28)));
    let v = y + (terr - y) * smooth(clamp01((out - 6) / 8));
    const k = smooth(clamp01((-z - (FIELD.z + 10)) / 16));
    return v + (2.5 + y * 0.08 - v) * k;
  },
  layout(L) {
    // the paved road across the middle, in big flagstones
    L.paint(0, 0, 44, 2.7, '#bba887', { soft: 0.7, noise: 0.35 }, true);
    L.paint(0, WALL_Z / 2 - 2, 3.4, -WALL_Z / 2 - 6, '#b3a07e', { soft: 1, noise: 0.4 }, true); // on out to the gate (paint only)
    L.paint(0, -WALL_Z / 2 + 2, 3.4, -WALL_Z / 2 - 6, '#b3a07e', { soft: 1, noise: 0.4 }, true); // and the far way
    for (let i = -12; i <= 12; i++) for (const z of [-1.35, 1.35]) L.paint(i * 3.6, z, 1.7, 1.25, hash(i * 3 + z) < 0.5 ? '#c8b692' : '#ad9b78', { soft: 0.35, noise: 0.3 }, true);
    // the pavilion on its stone plinth
    L.plateau(0, 0, 4.6, 4.6, 0.45, 1.6, 0, true);
    L.paint(0, 0, 5.4, 5.4, '#b89a70', { soft: 0.8, noise: 0.35 }, true);
    L.cyl('pavcol', -3.6, -3.6, 0.36, 3.4);
    L.cyl('pavcol', -3.6, 3.6, 0.36, 3.4);
    // earthbent pillars, clustered
    pillar(L, -12, 11, 0.75, 0.7, 3.6, 0.2);
    pillar(L, -10.2, 12.9, 0.55, 0.55, 2.4, -0.3);
    pillar(L, -13.8, 9.3, 0.5, 0.6, 1.6, 0.5);
    pillar(L, -23, -13, 0.85, 0.65, 4.2, -0.15);
    pillar(L, -21.2, -15, 0.5, 0.5, 2.8, 0.4);
    pillar(L, -24.8, -11, 0.6, 0.5, 2.0, 0.1);
    pillar(L, -7, -17, 0.55, 0.55, 2.2, 0.6);
    pillar(L, -35, 22, 0.7, 0.7, 3.0, 0.3);
    L.paint(-12, 11, 3.4, 3.4, '#9a8058', { soft: 1.2, noise: 0.5, rot: 0.3 });
    L.paint(-23, -13, 3.6, 3.6, '#9a8058', { soft: 1.2, noise: 0.5, rot: -0.2 });
    // slabs jutting up at angles
    L.box('earthslab', -18, 6, 2.2, 0.9, 2.2, 0.35);
    L.box('earthslab', -9, -7, 1.8, 0.8, 1.7, -0.5);
    L.box('earthslab', -30, 12, 2.4, 1.0, 2.4, 1.2);
    L.box('earthslab', -16, -25, 2.0, 0.9, 2.0, -1.0);
    // low stone walls and an earth rampart for cover
    L.wall(-27, -21, -27, -30, 1.4, 0.8, 'ekwall');
    L.wall(-33, 6, -33, 14, 1.4, 0.8, 'ekwall');
    L.plateau(-37, -7, 1.0, 4.5, 1.1, 2.2, 0.15);
    L.paint(-37, -7, 2.4, 6, '#9a8058', { soft: 1.5, noise: 0.5, rot: 0.15 });
    L.rock(-20, 25, 1.1);
    L.rock(-5, 24, 0.8);
    // bamboo and pines
    L.tree('bamboo', -38, 28, 1);
    L.tree('bamboo', -4, 29, 0.9);
    L.tree('bamboo', -40, -1, 1.1);
    L.tree('bamboo', -28, -4, 0.9);
    L.tree('pine', -17, -29, 1.1);
    L.tree('pine', -31, 29, 1);
    L.tree('pine', -40, -24, 1.2);
  },
});
