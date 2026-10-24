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

export function buildTerrain(scene, physics) {
  const n = Math.round(EXTENT * 2 / STEP) + 1;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color(0x7fcf4f), grassB = new THREE.Color(0x5fb544), sand = new THREE.Color(0xf2dc9b);
  const rock = new THREE.Color(0x9a9a8e), dirt = new THREE.Color(0xa58a5a), snow = new THREE.Color(0xf4f7ff), wet = new THREE.Color(0xc9b67a);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -EXTENT + i * STEP, z = -EXTENT + j * STEP;
      const h = heightAt(x, z), k = (j * n + i) * 3;
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      // colour from slope and height
      const hx = heightAt(x + 1, z) - heightAt(x - 1, z), hz = heightAt(x, z + 1) - heightAt(x, z - 1);
      const slope = Math.hypot(hx, hz) / 2;
      c.copy(grassA).lerp(grassB, fbm(x / 14, z / 14));
      if (slope > 0.55) c.lerp(rock, smooth(0.55, 0.9, slope));
      else if (h > 30) c.lerp(rock, smooth(30, 40, h) * 0.6);
      if (h > 42) c.lerp(snow, smooth(42, 48, h));
      if (isSand(x, z, h)) c.copy(h < -0.3 ? wet : sand);
      if (h < -2) c.lerp(dirt, 0.4);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
    idx[q++] = a; idx[q++] = d; idx[q++] = b;
    idx[q++] = b; idx[q++] = d; idx[q++] = e;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  physics.trimesh(pos, idx, { friction: 0.9 });
  return mesh;
}
