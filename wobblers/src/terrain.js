// Island terrain: an analytic height function sampled into one render mesh
// and a matching trimesh collider. The inner island (town, playground, pool,
// stunt park) is flat at y = 0; hills, a mountain, a lake and beaches sit
// around it.
import * as THREE from 'three';

const EXTENT = 400, STEP = 3;

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
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Flat rectangles [x0, x1, z0, z1, height]
export const FLAT = [
  [-180, 180, -180, 180, 0],      // inner island
  [-300, -185, -105, 105, 0],     // amusement park
  [185, 300, -95, 95, 0],         // kart track
  [-120, 120, 170, 340, 0],       // road to the beach
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

export function heightAt(x, z) {
  for (const p of PITS) if (x >= p[0] && x <= p[1] && z >= p[2] && z <= p[3]) return p[4];
  let flatD = 1e9;
  for (const f of FLAT) flatD = Math.min(flatD, rectDist(x, z, f));
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

export function isSand(x, z, h) {
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
export function groundColor(x, z, h, out = new THREE.Color()) {
  const hx = heightAt(x + 1, z) - heightAt(x - 1, z), hz = heightAt(x, z + 1) - heightAt(x, z - 1);
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
  if (isSand(x, z, h)) {
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

// The sampled grid, for code that needs the exact rendered ground height (grass, decals).
export const terrainGrid = { n: 0, step: STEP, ext: EXTENT, pos: null, col: null };
export function meshHeight(x, z) {
  const { n, pos } = terrainGrid;
  const gx = (x + EXTENT) / STEP, gz = (z + EXTENT) / STEP;
  const i = Math.max(0, Math.min(n - 2, Math.floor(gx))), j = Math.max(0, Math.min(n - 2, Math.floor(gz)));
  const fx = gx - i, fz = gz - j;
  const H = (ii, jj) => pos[((jj * n) + ii) * 3 + 1];
  const a = H(i, j), b = H(i + 1, j), d = H(i, j + 1), e = H(i + 1, j + 1);
  return fx + fz <= 1 ? a + (b - a) * fx + (d - a) * fz : e + (d - e) * (1 - fx) + (b - e) * (1 - fz);
}
export function meshColor(x, z, out) {
  const { n, col } = terrainGrid;
  const i = Math.max(0, Math.min(n - 1, Math.round((x + EXTENT) / STEP))), j = Math.max(0, Math.min(n - 1, Math.round((z + EXTENT) / STEP)));
  const k = (j * n + i) * 3;
  return out.setRGB(col[k], col[k + 1], col[k + 2]);
}

export function buildTerrain(scene, physics) {
  const n = Math.round(EXTENT * 2 / STEP) + 1;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -EXTENT + i * STEP, z = -EXTENT + j * STEP;
      const h = heightAt(x, z), k = (j * n + i) * 3;
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      groundColor(x, z, h, c);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  Object.assign(terrainGrid, { n, pos, col });
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
    idx[q++] = a; idx[q++] = d; idx[q++] = b;
    idx[q++] = b; idx[q++] = d; idx[q++] = e;
  }
  // normals from the full-resolution grid, shared by every LOD
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array;
  const group = buildTiles(n, pos, col, nrm);
  scene.add(group);
  scene.userData.terrainLOD = group.userData.lod;
  physics.trimesh(pos, idx, { friction: 0.9 });
  g.dispose();
  return group;
}

// The render mesh is cut into tiles with three levels of detail chosen per
// camera (see game.render), so far-away ground costs few triangles in each of
// up to eight split-screen views. Every tile has a skirt hanging below its
// edges to hide cracks where LODs meet. The physics collider stays the full
// grid.
const TILE_CELLS = 66, LOD_STRIDE = [1, 3, 6], LOD_DIST = [95, 230];
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });

function tileGeometry(n, pos, col, nrm, i0, i1, j0, j1, s) {
  const xs = [], zs = [];
  for (let i = i0; i < i1; i += s) xs.push(i); xs.push(i1);
  for (let j = j0; j < j1; j += s) zs.push(j); zs.push(j1);
  const W = xs.length, Hn = zs.length;
  const P = [], C = [], N = [], I = [];
  const put = (gi, gj, dy) => {
    const k = (gj * n + gi) * 3;
    P.push(pos[k], pos[k + 1] + dy, pos[k + 2]); C.push(col[k], col[k + 1], col[k + 2]); N.push(nrm[k], nrm[k + 1], nrm[k + 2]);
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}

function buildTiles(n, pos, col, nrm) {
  const group = new THREE.Group();
  group.userData.terrain = true;
  const tiles = [];
  const cells = n - 1;
  for (let j0 = 0; j0 < cells; j0 += TILE_CELLS) for (let i0 = 0; i0 < cells; i0 += TILE_CELLS) {
    const i1 = Math.min(i0 + TILE_CELLS, cells), j1 = Math.min(j0 + TILE_CELLS, cells);
    const t = { lods: [], minX: -EXTENT + i0 * STEP, maxX: -EXTENT + i1 * STEP, minZ: -EXTENT + j0 * STEP, maxZ: -EXTENT + j1 * STEP, cur: -1 };
    for (const s of LOD_STRIDE) {
      const m = new THREE.Mesh(tileGeometry(n, pos, col, nrm, i0, i1, j0, j1, Math.min(s, Math.max(1, Math.min(i1 - i0, j1 - j0)))), terrainMat);
      m.receiveShadow = true; m.castShadow = false;
      m.userData.terrain = true; m.userData.noCull = true;
      m.visible = false;
      group.add(m);
      t.lods.push(m);
    }
    tiles.push(t);
  }
  group.userData.lod = {
    tiles,
    // pick each tile's detail for this camera
    view(cam) {
      const p = cam.position;
      for (const t of tiles) {
        const dx = Math.max(t.minX - p.x, 0, p.x - t.maxX), dz = Math.max(t.minZ - p.z, 0, p.z - t.maxZ);
        const d = Math.hypot(dx, dz);
        const l = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : 2;
        if (l !== t.cur) { if (t.cur >= 0) t.lods[t.cur].visible = false; t.lods[l].visible = true; t.cur = l; }
      }
    },
  };
  group.userData.lod.view({ position: new THREE.Vector3() });
  return group;
}
