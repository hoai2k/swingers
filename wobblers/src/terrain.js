// Terrain for the whole archipelago. The world is a list of REGIONS (islands),
// each with bounds, a height function, a biome and flat areas; everything
// outside every region's bounds is open sea over a flat sea floor.
//
//  - The home island ("Wobbly Island", |x|, |z| <= 400) keeps its original
//    analytic height function (FLAT / PITS / MOUNTAIN / LAKE below): its heights,
//    colours and collider are exactly what they were before the archipelago.
//  - Other islands are registered with defineRegion() (world/regions/*.js export
//    their `region` descriptor; world/index.js registers them before
//    buildTerrain). A region's terrain = its natural `height(x, z)`, then its
//    flat areas (rects / sloped road strips) and pits applied on top, see
//    regionHeight(). Add flats either in the descriptor (`terrain.flats`,
//    `terrain.roads`, `terrain.pits`) or with addFlat / addRoadFlat / addPit
//    from a region's `prepare(T)` hook — all before the terrain is built.
//  - Each region is sampled into its own grid (3 or 4 m), rendered as LOD tiles
//    (all-sea tiles skipped, a single far mesh per region when the camera is far
//    away) with one trimesh collider over its land cells.
//
// Queries: heightAt (smooth analytic surface), meshHeight / groundAt (exact
// rendered + collider surface: use it to place things), biomeAt, regionAt.
import * as THREE from 'three';

export const SEA_FLOOR = -8;       // open-sea depth (y), flat everywhere between islands
const SEA = -0.5;                  // = config SEA_LEVEL (not imported: keep this module dependency-free)
export const WORLD = { x0: -1400, x1: 1400, z0: -1400, z1: 1400 }; // everything the game simulates / maps

const EXTENT = 400, STEP = 3;      // home island grid

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.03; }
  return s / 0.9375;
}
// Ridged noise 0..1: sharp crests (mountain ridges, gullies).
export function ridged(x, z) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * (1 - Math.abs(vnoise(x * f, z * f) * 2 - 1)) ** 2; a *= 0.5; f *= 2.03; }
  return s / 0.9375;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- island shape helpers (for region height functions) --------------------
// Signed distance in metres (negative inside) to a union of ellipses
// [cx, cz, rx, rz], with a noisy edge of +-wobble metres.
export function blobDist(x, z, blobs, wobble = 0, seed = 0) {
  let d = 1e9;
  for (const [cx, cz, rx, rz] of blobs) d = Math.min(d, (Math.hypot((x - cx) / rx, (z - cz) / rz) - 1) * Math.min(rx, rz));
  return wobble ? d + (fbm(x / 70 + seed, z / 70 - seed) - 0.5) * 2 * wobble : d;
}
// Signed distance to a rounded rectangle (centre, half sizes, corner radius).
export function rrectDist(x, z, cx, cz, hx, hz, r = 0) {
  const qx = Math.abs(x - cx) - hx + r, qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
// Blends a land height into the sea bed across a coast `width` metres wide
// around the shape edge d = 0 (land fully at d <= -0.35 width).
export function coastBlend(land, d, width = 50, bed = SEA_FLOOR) {
  return land + (bed - land) * smooth(-width * 0.35, width * 0.65, d);
}

// ===========================================================================
// Home island (unchanged)
// ===========================================================================
// Flat rectangles [x0, x1, z0, z1, height]
export const FLAT = [
  [-180, 180, -180, 180, 0],      // inner island
  [-300, -185, -105, 105, 0],     // amusement park
  [185, 300, -95, 95, 0],         // kart track
  [-120, 120, 170, 340, 0],       // road to the beach
];
// Flattened for the bridge approach road only (world/bridge.js). Kept out of
// FLAT so code that scatters things with FLAT (forests) is unchanged.
export const HOME_EXTRA_FLAT = [
  [150, 330, 109, 127, 0],        // east road to the Bigtown bridge
];
// Pits carved below the flat ground [x0, x1, z0, z1, depth]
export const PITS = [
  [82, 118, 88, 112, -3.2],       // swimming pool
];
export const MOUNTAIN = { x: 60, z: -262, r: 75, h: 48 };
export const LAKE = { x: -150, z: -218, r: 42 };

function rectDist(x, z, r) {
  const dx = Math.max(r[0] - x, 0, x - r[1]);
  const dz = Math.max(r[2] - z, 0, z - r[3]);
  return Math.hypot(dx, dz);
}

function homeHeight(x, z, extra = true) {
  for (const p of PITS) if (x >= p[0] && x <= p[1] && z >= p[2] && z <= p[3]) return p[4];
  let flatD = 1e9;
  for (const f of FLAT) flatD = Math.min(flatD, rectDist(x, z, f));
  if (extra) for (const f of HOME_EXTRA_FLAT) flatD = Math.min(flatD, rectDist(x, z, f));
  const mask = smooth(0, 30, flatD);
  const southFade = 1 - smooth(170, 270, z);
  let h = mask * (1.5 + 9 * fbm(x / 80 + 10, z / 80 - 4) * southFade);
  // mountain
  const md = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
  h += mask * MOUNTAIN.h * Math.exp(-(md * md) / (MOUNTAIN.r * MOUNTAIN.r)) * (0.85 + 0.3 * fbm(x / 25, z / 25));
  // lake depression
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  const lm = smooth(LAKE.r, LAKE.r * 0.45, ld);
  h = h * (1 - lm) + (-5.5) * lm;
  // coast
  const r = Math.hypot(x, z * 0.95);
  h = h + (-8 - h) * smooth(320, 380, r);
  return h;
}

// The home terrain mesh height as it was before HOME_EXTRA_FLAT (outskirts.js
// scatters its forests with it, so the random layout stays the same).
export function homeMeshHeightOriginal(x, z) {
  const gx = (x + EXTENT) / STEP, gz = (z + EXTENT) / STEP;
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
  const X = (k) => -EXTENT + k * STEP, H = (a, b) => homeHeight(X(a), X(b), false);
  const ha = H(i, j), hb = H(i + 1, j), hd = H(i, j + 1);
  if (fx + fz <= 1) return ha + (hb - ha) * fx + (hd - ha) * fz;
  const he = H(i + 1, j + 1);
  return he + (hd - he) * (1 - fx) + (hb - he) * (1 - fz);
}
export const inHomeExtraFlat = (x, z, m = 0) => HOME_EXTRA_FLAT.some((f) => rectDist(x, z, f) <= m);

function homeSand(x, z, h) {
  const r = Math.hypot(x, z * 0.95);
  return (r > 305 && h < 2.2) || (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 0.95 && h < 0.4);
}

// Ground colour at (x, z) with height h (vertex colours of the terrain mesh).
const GC = {
  grassA: new THREE.Color(0x86d651), grassB: new THREE.Color(0x63bf45), grassC: new THREE.Color(0xa6de5c),
  meadow: new THREE.Color(0x74c94a), sand: new THREE.Color(0xf6e3a4), wet: new THREE.Color(0xdcc489),
  rock: new THREE.Color(0x9a8f7c), dirt: new THREE.Color(0xb39264), snow: new THREE.Color(0xf6f9ff),
  under: new THREE.Color(0xc9c08a), deep: new THREE.Color(0x7aa59a),
};
const _gc = new THREE.Color();
function homeColor(x, z, h, out) {
  const hx = homeHeight(x + 1, z) - homeHeight(x - 1, z), hz = homeHeight(x, z + 1) - homeHeight(x, z - 1);
  const slope = Math.hypot(hx, hz) / 2;
  // two scales of grass variation: broad meadows and small patches
  out.copy(GC.grassA).lerp(GC.grassB, smooth(0.3, 0.75, fbm(x / 26, z / 26)));
  out.lerp(GC.grassC, smooth(0.55, 0.8, fbm(x / 9 + 31, z / 9 - 7)) * 0.55);
  if (h > 6) out.lerp(GC.meadow, smooth(6, 16, h) * 0.5);
  // steep ground turns earthy, then rocky in noisy patches (never one big grey slab)
  const rn = (fbm(x / 13 + 50, z / 13 + 9) - 0.5) * 0.6;
  if (slope > 0.5) out.lerp(GC.dirt, smooth(0.5, 0.85, slope + rn) * 0.35);
  const cliff = smooth(0.8, 1.3, slope + rn) * (0.5 + 0.5 * smooth(0.35, 0.65, fbm(x / 10 - 20, z / 10 + 4)));
  out.lerp(_gc.copy(GC.rock).multiplyScalar(0.9 + 0.12 * Math.sin(h * 1.4 + rn * 4)), cliff * 0.9);
  if (h > 30) out.lerp(GC.rock, smooth(30, 42, h) * smooth(0.45, 0.7, fbm(x / 9, z / 9) + rn) * 0.7);
  if (h > 41) out.lerp(GC.snow, smooth(41, 47, h));
  if (homeSand(x, z, h)) {
    // soft blend from grass into sand, wet sand at the waterline
    out.copy(GC.sand).lerp(GC.wet, smooth(0.4, -0.5, h));
  } else {
    const r = Math.hypot(x, z * 0.95);
    if (r > 296 && h < 3.2) out.lerp(_gc.copy(GC.sand), smooth(296, 305, r) * smooth(3.2, 2.2, h));
  }
  if (h < -0.6) out.lerp(GC.under, smooth(-0.6, -1.5, h) * 0.7);
  if (h < -2.5) out.lerp(GC.deep, smooth(-2.5, -6, h) * 0.6);
  return out;
}

// ===========================================================================
// Regions
// ===========================================================================
// A terrain region: { id, name, biome, bounds: [x0, x1, z0, z1], step,
//   height(x, z), color?(x, z, h, slope, out), sand?(x, z, h),
//   flats: [[x0, x1, z0, z1, h, blend = 20]], roads: [{ a: [x, z], b: [x, z], w, h0, h1, blend = 16 }],
//   pits: [[x0, x1, z0, z1, depth]] }
// Bounds are the region's grid: keep land (and its coast slope) at least ~30 m
// inside them; the edge of the bounds must already be sea floor.
export const REGIONS = [];
export const HOME_REGION = {
  id: 'home', name: 'Wobbly Island', biome: 'home', signText: null, centre: [0, 0],
  bounds: [-EXTENT, EXTENT, -EXTENT, EXTENT], step: STEP,
  height: homeHeight, sand: homeSand, flats: FLAT, roads: [], pits: PITS, legacy: true,
  labels: [], docks: [],
};
const HOME = HOME_REGION;
REGIONS.push(HOME);
let built = false;

export function defineRegion(def) {
  if (built) throw new Error('defineRegion after the terrain was built');
  const old = REGIONS.findIndex((r) => r.id === def.id);
  const r = def; // registered as is: the region descriptor is shared with game.regions
  r.step ??= 3; r.flats ??= []; r.roads ??= []; r.pits ??= [];
  for (const o of REGIONS) {
    if (o.id === r.id) continue;
    const [a0, a1, b0, b1] = o.bounds, [c0, c1, d0, d1] = r.bounds;
    if (a0 < c1 && c0 < a1 && b0 < d1 && d0 < b1) throw new Error(`region ${r.id} overlaps ${o.id}`);
  }
  if (old >= 0) REGIONS[old] = r; else REGIONS.push(r);
  return r;
}
const regionById = (id) => REGIONS.find((r) => r.id === id);
// The region whose bounds contain (x, z), or null (open sea).
export function regionAt(x, z) {
  for (const r of REGIONS) { const b = r.bounds; if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) return r; }
  return null;
}
function checkOpen(what) { if (built) throw new Error(what + ' after the terrain was built: do it in the region descriptor or its prepare(T) hook'); }
// Flatten a rectangle of `region` to height h, blending into the natural ground over `blend` m.
export function addFlat(region, x0, x1, z0, z1, h, blend = 20) {
  checkOpen('addFlat');
  const r = typeof region === 'string' ? regionById(region) : region;
  if (r.legacy) throw new Error('the home island terrain is fixed');
  r.flats.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), h, blend]);
}
// A flat road strip from a to b ([x, z]), width w, height h0 at a sloping to h1 at b.
export function addRoadFlat(region, a, b, w, h0, h1 = h0, blend = 16) {
  checkOpen('addRoadFlat');
  const r = typeof region === 'string' ? regionById(region) : region;
  if (r.legacy) throw new Error('the home island terrain is fixed');
  r.roads.push({ a, b, w, h0, h1, blend });
}
// A pit (pool, basement) with a flat floor at y = depth.
export function addPit(region, x0, x1, z0, z1, depth) {
  checkOpen('addPit');
  const r = typeof region === 'string' ? regionById(region) : region;
  r.pits.push([x0, x1, z0, z1, depth]);
}

// Natural height with the region's flats, road strips and pits applied.
function regionHeight(r, x, z) {
  for (const p of r.pits) if (x >= p[0] && x <= p[1] && z >= p[2] && z <= p[3]) return p[4];
  let h = r.height(x, z);
  let target = null, wN = 1;
  for (const f of r.flats) {
    const w = smooth(0, f[5] ?? 20, rectDist(x, z, f));
    if (w < wN) { wN = w; target = f[4]; }
  }
  for (const s of r.roads) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L2));
    const d = Math.max(0, Math.hypot(x - s.a[0] - dx * t, z - s.a[1] - dz * t) - s.w / 2);
    const w = smooth(0, s.blend ?? 16, d);
    if (w < wN) { wN = w; target = s.h0 + (s.h1 - s.h0) * t; }
  }
  if (target != null) h = target + (h - target) * wN;
  return h;
}

export function heightAt(x, z) {
  const r = regionAt(x, z);
  if (!r) return SEA_FLOOR;
  return r.legacy ? homeHeight(x, z) : regionHeight(r, x, z);
}
export function isSand(x, z, h) {
  const r = regionAt(x, z);
  if (!r) return false;
  return r.sand ? r.sand(x, z, h) : false;
}
// 'home' | 'city' | 'snow' | 'desert' | 'jungle' | 'tropical' | 'sea'
export function biomeAt(x, z) {
  const r = regionAt(x, z);
  if (!r || heightAt(x, z) < SEA - 1.5) return 'sea';
  return r.biome;
}

// ---- biome ground colours -------------------------------------------------------
const C = (h) => new THREE.Color(h);
export const BIOME_COLORS = {
  concrete: C(0xbdbab2), concrete2: C(0xa9a69f), seawall: C(0x8e8b84), park: C(0x74c94a), park2: C(0x5fb845),
  snow: C(0xf3f7ff), snowShade: C(0xd6e4f5), ice: C(0xbfe0f2), pine: C(0x5f8f55), frostRock: C(0x7c7f8c), shingle: C(0xb9b3a6),
  sand: C(0xf0d39c), sand2: C(0xe2bb78), redRock: C(0xc4673f), redRock2: C(0xa04c2c), mesaTop: C(0xd8975f), oasis: C(0x7fb34a), canyon: C(0xd9a066),
  jungle: C(0x3f8f3a), jungle2: C(0x2c7a31), jungle3: C(0x5aa845), mud: C(0x7a5b3a), lava: C(0x564b48), lava2: C(0x433836), jsand: C(0xf1deaa),
  white: C(0xfaf3dc), palmGrass: C(0x86d35a), palmGrass2: C(0x6cc04a),
  wet: C(0xdcc489), under: GC.under, deep: GC.deep,
};
// Shared finishing: wet sand at the waterline and tinted sea bed.
export function waterTint(h, out) {
  if (h < 0.4 && h > -0.8) out.lerp(BIOME_COLORS.wet, smooth(0.4, -0.3, h) * 0.6);
  if (h < -0.6) out.lerp(GC.under, smooth(-0.6, -1.5, h) * 0.7);
  if (h < -2.5) out.lerp(GC.deep, smooth(-2.5, -6, h) * 0.6);
  return out;
}
function defaultColor(r, x, z, h, slope, out) {
  out.copy(GC.grassA).lerp(GC.grassB, smooth(0.3, 0.75, fbm(x / 26, z / 26)));
  if (slope > 0.7) out.lerp(GC.rock, smooth(0.7, 1.2, slope));
  if (r.sand?.(x, z, h)) out.copy(GC.sand);
  return waterTint(h, out);
}

// ===========================================================================
// Grids, meshes, colliders
// ===========================================================================
// Home grid (kept for older code): n x n vertices from -ext with `step` spacing.
export const terrainGrid = { n: 0, step: STEP, ext: EXTENT, pos: null, col: null };
// Every region's grid: { region, x0, z0, x1, z1, step, nx, nz, pos, col }.
export const terrainGrids = [];

function gridAt(x, z) {
  for (const g of terrainGrids) if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return g;
  return null;
}
// Exact height of the rendered terrain mesh / collider at (x, z) (two
// triangles per cell split along the b-d diagonal). Outside every region it is
// the sea floor. Works before the terrain is built too (computed from heightAt).
export function meshHeight(x, z) {
  let g = gridAt(x, z);
  if (!g) {
    const r = regionAt(x, z);
    if (!r) return SEA_FLOOR;
    g = { x0: r.bounds[0], z0: r.bounds[2], step: r.step, nx: Math.round((r.bounds[1] - r.bounds[0]) / r.step) + 1, nz: Math.round((r.bounds[3] - r.bounds[2]) / r.step) + 1, pos: null };
  }
  const st = g.step, gx = (x - g.x0) / st, gz = (z - g.z0) / st;
  const i = Math.max(0, Math.min(g.nx - 2, Math.floor(gx))), j = Math.max(0, Math.min(g.nz - 2, Math.floor(gz)));
  const fx = gx - i, fz = gz - j;
  let a, b, d, e;
  if (g.pos) {
    const H = (ii, jj) => g.pos[((jj * g.nx) + ii) * 3 + 1];
    a = H(i, j); b = H(i + 1, j); d = H(i, j + 1);
    if (fx + fz <= 1) return a + (b - a) * fx + (d - a) * fz;
    e = H(i + 1, j + 1);
  } else {
    const X = (k) => g.x0 + k * st, Z = (k) => g.z0 + k * st;
    a = heightAt(X(i), Z(j)); b = heightAt(X(i + 1), Z(j)); d = heightAt(X(i), Z(j + 1));
    if (fx + fz <= 1) return a + (b - a) * fx + (d - a) * fz;
    e = heightAt(X(i + 1), Z(j + 1));
  }
  return e + (d - e) * (1 - fx) + (b - e) * (1 - fz);
}
export const groundAt = meshHeight;
export function meshColor(x, z, out) {
  const g = gridAt(x, z);
  if (!g) return out.copy(GC.deep);
  const i = Math.max(0, Math.min(g.nx - 1, Math.round((x - g.x0) / g.step))), j = Math.max(0, Math.min(g.nz - 1, Math.round((z - g.z0) / g.step)));
  const k = (j * g.nx + i) * 3;
  return out.setRGB(g.col[k], g.col[k + 1], g.col[k + 2]);
}

export const terrainStats = { ms: 0, verts: 0, tris: 0, colliderTris: 0, tiles: 0 };

export function buildTerrain(scene, physics) {
  const t0 = performance.now();
  built = true;
  const group = new THREE.Group();
  group.userData.terrain = true;
  const lod = { grids: [], view: null };
  for (const r of REGIONS) {
    const tg = performance.now();
    const g = buildGrid(r);
    terrainGrids.push(g);
    if (r.legacy) Object.assign(terrainGrid, { n: g.nx, pos: g.pos, col: g.col });
    const { idx, nrm } = gridNormals(g);
    // collider: the home island keeps its full grid; other islands only their land cells
    if (r.legacy) physics.trimesh(g.pos, idx, { friction: 0.9 });
    else {
      const land = landIndices(g);
      if (land.length) physics.trimesh(g.pos, land, { friction: 0.9 });
      terrainStats.colliderTris += land.length / 3;
    }
    if (r.legacy) terrainStats.colliderTris += idx.length / 3;
    lod.grids.push(buildTiles(group, g, nrm));
    terrainStats.verts += g.nx * g.nz;
    (terrainStats.grids ||= {})[r.id] = Math.round(performance.now() - tg);
  }
  // the open sea floor: one plane and one collider under everything
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: GC.deep.clone().lerp(GC.under, 0.25) }));
  floor.position.y = SEA_FLOOR - 0.02;
  floor.userData.terrain = true; floor.userData.noCull = true;
  group.add(floor);
  physics.box(0, SEA_FLOOR - 1, 0, WORLD.x1 - WORLD.x0 + 600, 2, WORLD.z1 - WORLD.z0 + 600, { friction: 0.9 });
  lod.view = (cam) => { for (const gl of lod.grids) gl.view(cam); };
  group.userData.lod = lod;
  lod.view({ position: new THREE.Vector3() });
  scene.add(group);
  scene.userData.terrainLOD = lod;
  terrainStats.ms = Math.round(performance.now() - t0);
  return group;
}

function buildGrid(r) {
  const st = r.step, [x0, x1, z0, z1] = r.bounds;
  const nx = Math.round((x1 - x0) / st) + 1, nz = Math.round((z1 - z0) / st) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * st, z = z0 + j * st, k = (j * nx + i) * 3;
    pos[k] = x; pos[k + 1] = r.legacy ? homeHeight(x, z) : regionHeight(r, x, z); pos[k + 2] = z;
  }
  const H = (i, j) => pos[((Math.max(0, Math.min(nz - 1, j)) * nx) + Math.max(0, Math.min(nx - 1, i))) * 3 + 1];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 3, x = pos[k], z = pos[k + 2], h = pos[k + 1];
    if (r.legacy) homeColor(x, z, h, c);
    else {
      const slope = Math.hypot(H(i + 1, j) - H(i - 1, j), H(i, j + 1) - H(i, j - 1)) / (2 * st);
      (r.color || ((x2, z2, h2, s2, o) => defaultColor(r, x2, z2, h2, s2, o)))(x, z, h, slope, c);
    }
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  return { region: r, x0, z0, x1: x0 + (nx - 1) * st, z1: z0 + (nz - 1) * st, step: st, nx, nz, pos, col };
}

function gridNormals(g) {
  const { nx, nz, pos } = g;
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let q = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
    idx[q++] = a; idx[q++] = d; idx[q++] = b;
    idx[q++] = b; idx[q++] = d; idx[q++] = e;
  }
  // normals from the full-resolution grid, shared by every LOD
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal.array;
  geo.dispose();
  return { idx, nrm };
}

// Cells with any corner above the deep sea floor (where something can stand).
function landIndices(g) {
  const { nx, nz, pos } = g, out = [];
  const lim = SEA_FLOOR + 1.2;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
    if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[d * 3 + 1], pos[e * 3 + 1]) < lim) continue;
    out.push(a, d, b, b, d, e);
  }
  return new Uint32Array(out);
}

// The render mesh is cut into tiles with three levels of detail chosen per
// camera (see game.render), so far-away ground costs few triangles in each of
// up to eight split-screen views. Every tile has a skirt hanging below its
// edges to hide cracks where LODs meet. Tiles that are all deep sea are
// skipped (the sea-floor plane is there); a region far from the camera is
// drawn as one coarse mesh.
const TILE_CELLS = 66, LOD_STRIDE = [1, 3, 6], LOD_DIST = [95, 230], FAR_DIST = 520, FAR_STRIDE = 8;
const terrainMat = grassGround(new THREE.MeshLambertMaterial({ vertexColors: true }));

// Grass texture painted onto green ground, in world space: blade streaks and
// darker clumps at two scales (so the repeat doesn't show), averaging to 1 so
// distant ground keeps its colour. Up close the 3D tufts (world/detail.js) sit
// on top; from mid range out this is the grass. Made on a canvas, no image file.
function grassTexture() {
  const N = 256, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgb(200,200,200)'; g.fillRect(0, 0, N, N);
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const blob = (x, y, rad, v, a) => { // drawn wrapped so the tile repeats seamlessly
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  };
  for (let i = 0; i < 40; i++) blob(r() * N, r() * N, 14 + r() * 30, r() < 0.5 ? 150 : 245, 0.35);
  for (let i = 0; i < 2600; i++) { // short blade strokes
    const x = r() * N, y = r() * N, l = 3 + r() * 6, a = -Math.PI / 2 + (r() - 0.5) * 1.2, v = 150 + r() * 105;
    g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},0.8)`; g.lineWidth = 1 + r();
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke();
    }
  }
  // normalise to a mean of 0.5 (the shader doubles it)
  const img = g.getImageData(0, 0, N, N), d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i];
  const k = 127.5 / (sum / (N * N));
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.min(255, d[i] * k);
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
function grassGround(m) {
  if (typeof document === 'undefined') return m;
  const tex = grassTexture();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrass = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uGrass;\nvarying vec3 vGW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
	{
		vec3 c = diffuseColor.rgb;
		float green = smoothstep(0.04, 0.14, c.g - max(c.r, c.b));
		float t = texture2D(uGrass, vGW.xz * 0.25).r * 2.0;
		float t2 = texture2D(uGrass, vGW.zx * 0.031 + 0.37).r * 2.0;
		float k = mix(1.0, mix(t, 1.0, 0.25) * mix(t2, 1.0, 0.5), green);
		diffuseColor.rgb = c * k + vec3(0.03, 0.05, 0.0) * green * (t - 1.0);
	}`);
  };
  m.customProgramCacheKey = () => 'wobGrassGround';
  return m;
}

function tileGeometry(g, nrm, i0, i1, j0, j1, s) {
  const n = g.nx, pos = g.pos, col = g.col;
  const xs = [], zs = [];
  for (let i = i0; i < i1; i += s) xs.push(i); xs.push(i1);
  for (let j = j0; j < j1; j += s) zs.push(j); zs.push(j1);
  const W = xs.length, Hn = zs.length;
  const P = [], Cc = [], N = [], I = [];
  const put = (gi, gj, dy) => {
    const k = (gj * n + gi) * 3;
    P.push(pos[k], pos[k + 1] + dy, pos[k + 2]); Cc.push(col[k], col[k + 1], col[k + 2]); N.push(nrm[k], nrm[k + 1], nrm[k + 2]);
    return P.length / 3 - 1;
  };
  for (const gj of zs) for (const gi of xs) put(gi, gj, 0);
  for (let b = 0; b < Hn - 1; b++) for (let a = 0; a < W - 1; a++) {
    const v = b * W + a, r = v + 1, d = v + W, e = d + 1;
    I.push(v, d, r, r, d, e);
  }
  // skirts
  const edge = (list) => {
    let prevTop = -1, prevBot = -1;
    for (const [gi, gj, top] of list) {
      const bot = put(gi, gj, -2.5);
      if (prevTop >= 0) I.push(prevTop, prevBot, top, top, prevBot, bot, prevTop, top, prevBot, top, bot, prevBot);
      prevTop = top; prevBot = bot;
    }
  };
  edge(xs.map((gi, a) => [gi, zs[0], a]));
  edge(xs.map((gi, a) => [gi, zs[Hn - 1], (Hn - 1) * W + a]));
  edge(zs.map((gj, b) => [xs[0], gj, b * W]));
  edge(zs.map((gj, b) => [xs[W - 1], gj, b * W + W - 1]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setIndex(I);
  geo.computeBoundingSphere();
  return geo;
}

function buildTiles(group, g, nrm) {
  const tiles = [];
  const cx = g.nx - 1, cz = g.nz - 1, legacy = g.region.legacy;
  const mk = (geo) => {
    const m = new THREE.Mesh(geo, terrainMat);
    m.receiveShadow = true; m.castShadow = false;
    m.userData.terrain = true; m.userData.noCull = true;
    m.visible = false;
    group.add(m);
    return m;
  };
  // land bounding box (for the far-mesh switch)
  let lx0 = 1e9, lx1 = -1e9, lz0 = 1e9, lz1 = -1e9;
  for (let j0 = 0; j0 < cz; j0 += TILE_CELLS) for (let i0 = 0; i0 < cx; i0 += TILE_CELLS) {
    const i1 = Math.min(i0 + TILE_CELLS, cx), j1 = Math.min(j0 + TILE_CELLS, cz);
    let top = -1e9;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) top = Math.max(top, g.pos[(j * g.nx + i) * 3 + 1]);
    if (!legacy && top < SEA - 5) continue; // all deep sea: the floor plane covers it
    const t = { lods: [], minX: g.x0 + i0 * g.step, maxX: g.x0 + i1 * g.step, minZ: g.z0 + j0 * g.step, maxZ: g.z0 + j1 * g.step, cur: -1 };
    lx0 = Math.min(lx0, t.minX); lx1 = Math.max(lx1, t.maxX); lz0 = Math.min(lz0, t.minZ); lz1 = Math.max(lz1, t.maxZ);
    for (const s of LOD_STRIDE) t.lods.push(mk(tileGeometry(g, nrm, i0, i1, j0, j1, Math.min(s, Math.max(1, Math.min(i1 - i0, j1 - j0))))));
    tiles.push(t);
    terrainStats.tiles++;
  }
  const far = tiles.length ? mk(tileGeometry(g, nrm, 0, cx, 0, cz, FAR_STRIDE)) : null;
  let farOn = false;
  return {
    tiles, far,
    // pick each tile's detail for this camera
    view(cam) {
      const p = cam.position;
      const fd = Math.hypot(Math.max(lx0 - p.x, 0, p.x - lx1), Math.max(lz0 - p.z, 0, p.z - lz1));
      const useFar = far && fd > FAR_DIST;
      if (useFar !== farOn) { farOn = useFar; far.visible = useFar; }
      for (const t of tiles) {
        let l = -1;
        if (!useFar) {
          const dx = Math.max(t.minX - p.x, 0, p.x - t.maxX), dz = Math.max(t.minZ - p.z, 0, p.z - t.maxZ);
          const d = Math.hypot(dx, dz);
          l = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2;
        }
        if (l !== t.cur) { if (t.cur >= 0) t.lods[t.cur].visible = false; if (l >= 0) t.lods[l].visible = true; t.cur = l; }
      }
    },
  };
}
