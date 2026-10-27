// Battleground: Blocky Plains (the Minecraft faction's map). A voxel world: flat grass
// in the field with pixel-square patches, cobblestone outcrops and dirt / ore cube
// clusters, a cobblestone-and-plank hut and a nether portal on each side, and a little
// lava pool in the middle that burns whoever wades in (battleStep at the bottom).
// Outside: stepped (quantised) hills, cube mountains, cube oaks / birches / spruces, a
// village, sheep, cows and pigs, square clouds and a square sun.
//
// Everything is drawn as unit blocks (voxels() below): one plane per visible block face
// plus a few darker / lighter "pixel" squares, so the blocks read as textured cubes
// without textures. Obstacles mirrored onto Red's half (seed x.5) turn round so their
// doors face the middle too.
import { THREE } from '../util.js';
import { register } from '../ext.js';
import { MAPS, MAP_H } from '../world.js';
import { PART, rand, addStatus, airborne } from './common.js';

const { merged, T, instanced, vcMat, comp, scatter } = MAP_H;
const B = 1; // block size (m)
const PI = Math.PI;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
const PLANE = new THREE.PlaneGeometry(1, 1);
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// block palettes: c base, d / l dark and light pixels; top / side override faces
const PAL = {
  stone: { c: '#8e8e8e', d: '#767676', l: '#a4a4a4' },
  cobble: { c: '#7c7c7c', d: '#565656', l: '#a6a6a6', n: 5 },
  mossy: { c: '#7c7c7c', d: '#4f7a3a', l: '#a6a6a6', n: 5 },
  dirt: { c: '#87603e', d: '#6a4a2e', l: '#9e7652' },
  grass: { c: '#87603e', d: '#6a4a2e', l: '#9e7652', top: { c: '#69aa3c', d: '#589530', l: '#7fbe4c' }, strip: '#62a238' },
  snowstone: { c: '#8e8e8e', d: '#767676', l: '#a4a4a4', top: { c: '#f4f8fb', d: '#dfe7ee', l: '#ffffff' }, strip: '#eef3f7' },
  snowblock: { c: '#eef3f7', d: '#d8e1ea', l: '#ffffff' },
  obsidian: { c: '#1f1631', d: '#0f0a1c', l: '#40306a', n: 4 },
  planks: { c: '#c29a5e', d: '#9a7442', l: '#d4ac6c', planks: true },
  spruce: { c: '#6f5233', d: '#56401f', l: '#82613c', planks: true },
  log: { c: '#6a4f2f', d: '#4f3a20', l: '#7e6038', top: { c: '#b48c55', d: '#8c6a3c', l: '#6a4f2f', ring: true } },
  birch: { c: '#e6e2d6', d: '#2c2c2c', l: '#f6f4ee', top: { c: '#c8b07a', d: '#a08a58', l: '#e6e2d6', ring: true } },
  leaves: { c: '#3f8a2a', d: '#2f6e20', l: '#56a83a' },
  bleaves: { c: '#6e9e44', d: '#5a8836', l: '#86b456' },
  sleaves: { c: '#2f5e34', d: '#234a28', l: '#3e7442' },
  glass: { c: '#b8e2f2', d: '#ffffff', l: '#e6f6fc', n: 2 },
  door: { c: '#6b4a28', d: '#4f361c', l: '#7e5a32', n: 3 },
  coal: { c: '#8e8e8e', d: '#1c1c1c', l: '#2e2e2e', n: 4 },
  iron: { c: '#8e8e8e', d: '#d8ae8e', l: '#c4936e', n: 4 },
  gold: { c: '#8e8e8e', d: '#f8dc4a', l: '#e2b828', n: 4 },
  diamond: { c: '#8e8e8e', d: '#5ee8e0', l: '#2cc4bc', n: 4 },
};
const FACES = [
  { d: [1, 0, 0], r: [0, PI / 2, 0], k: 0.9 }, { d: [-1, 0, 0], r: [0, -PI / 2, 0], k: 0.9 },
  { d: [0, 0, 1], r: [0, 0, 0], k: 0.95 }, { d: [0, 0, -1], r: [0, PI, 0], k: 0.95 },
  { d: [0, 1, 0], r: [-PI / 2, 0, 0], k: 1 }, { d: [0, -1, 0], r: [PI / 2, 0, 0], k: 0.75 },
];

// Draw a voxel set: cells Map 'i,j,k' -> palette name. Block (i,j,k) sits at
// (x + i s, y + j s .. y + (j+1) s, z + k s). Faces against a filled neighbour are
// skipped; bottom faces only above the first layer (o.bottom: always).
function voxels(out, cells, o = {}) {
  const s = o.s || B, ox = o.x || 0, oy = o.y || 0, oz = o.z || 0, seed = o.seed || 0, spots = o.spots ?? 3;
  for (const [key, m] of cells) {
    const [i, j, k] = key.split(',').map(Number);
    const P = PAL[m];
    const cx = ox + i * s, cy = oy + (j + 0.5) * s, cz = oz + k * s;
    const h0 = hash(i * 7.13 + j * 3.31 + k * 5.77 + seed);
    const tint = 0.94 + h0 * 0.12;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], [dx, dy, dz] = F.d;
      if (cells.has(`${i + dx},${j + dy},${k + dz}`)) continue;
      if (dy < 0 && j === 0 && !o.bottom) continue;
      const pal = dy > 0 && P.top ? P.top : P;
      const M = T(cx + dx * (s / 2 + 0.004), cy + dy * (s / 2 + 0.004), cz + dz * (s / 2 + 0.004), 1, 1, 1, F.r[0], F.r[1], F.r[2]);
      const sub = (u, v, w, h, c) => out.push([PLANE, c, M.clone().multiply(T(u * s, v * s, 0.003 * (s > 2 ? 4 : 1), w * s, h * s, 1))]);
      out.push([PLANE, shade(pal.c, tint * F.k), M.clone().multiply(T(0, 0, 0, s, s, 1))]);
      if (pal.ring) { // log end: rings
        sub(0, 0, 0.75, 0.75, shade(pal.l, tint));
        sub(0, 0, 0.5, 0.5, shade(pal.c, tint));
        sub(0, 0, 0.25, 0.25, shade(pal.d, tint));
        continue;
      }
      if (P.strip && dy === 0) { // grass block side: green top band and a drip
        sub(0, 0.375, 1, 0.25, shade(P.strip, tint * F.k));
        sub((Math.floor(hash(h0 * 9 + f) * 4) - 1.5) * 0.25, 0.125, 0.25, 0.25, shade(P.strip, tint * F.k * 0.95));
      }
      if (pal.planks && dy === 0) { // plank seams
        for (const v of [-0.25, 0.25]) sub(0, v, 1, 0.06, shade(pal.d, tint * F.k));
        sub(hash(h0 + f) > 0.5 ? 0.2 : -0.3, 0.375, 0.05, 0.25, shade(pal.d, tint * F.k));
      }
      const n = pal.n ?? P.n ?? spots;
      for (let q = 0; q < n; q++) {
        const a = hash(h0 * 31 + f * 7 + q * 3.7), b = hash(h0 * 17 + f * 3 + q * 5.3);
        const u = (Math.floor(a * 4) - 1.5) * 0.25, v = (Math.floor(b * 4) - 1.5) * 0.25;
        if (P.strip && dy === 0 && v > 0.2) continue;
        sub(u, v, 0.25, 0.25, shade(q % 2 ? pal.l : pal.d, F.k * (0.97 + a * 0.06)));
      }
    }
  }
  return out;
}
const key = (i, j, k) => `${i},${j},${k}`;

// mirrored copies (seed x.5) turn round, so doors and faces read the same on both sides
const flipOf = (o) => (o.seed % 1 ? T(0, 0, 0, 1, 1, 1, 0, PI, 0) : null);
const pushAll = (p, list, F) => { for (const [g, c, m] of list) p.push([g, c, F ? F.clone().multiply(m) : m]); };

// ---------------------------------------------------------------- obstacles
// a solid block of nx x ny x nz cubes (o.mat, o.top for the top layer, o.ore sprinkled in)
function blockParts(o, dn) {
  const nx = Math.max(1, Math.round((o.hw * 2) / B)), nz = Math.max(1, Math.round((o.hd * 2) / B)), ny = Math.max(1, Math.round(o.h / B));
  const cells = new Map();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    let m = j === ny - 1 && o.cap ? o.cap : o.mat;
    if (o.ore && j < ny - 1 && hash(o.seed * 3 + i * 1.7 + j * 2.9 + k * 4.1) < 0.3) m = o.ore;
    cells.set(key(i, j, k), m);
  }
  const list = voxels([], cells, { x: -(nx - 1) / 2 * B, z: -(nz - 1) / 2 * B, seed: Math.floor(o.seed) });
  list.push([BOX(nx * B, dn + 0.05, nz * B), shade(PAL[o.mat].c, 0.7), T(0, -(dn + 0.05) / 2, 0)]);
  return list;
}

// the village hut: 5 x 4 blocks, cobblestone footing, log corners, plank walls, glass
// windows, a double door on local +x with a torch, and a stepped spruce roof
function hutParts(seed, dn = 0.3) {
  const cells = new Map();
  for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) for (let k = 0; k < 4; k++) {
    const edge = i === 0 || i === 4 || k === 0 || k === 3;
    if (!edge) { cells.set(key(i, j, k), 'planks'); continue; }
    const corner = (i === 0 || i === 4) && (k === 0 || k === 3);
    let m = corner ? 'log' : j === 0 ? 'cobble' : 'planks';
    if (i === 4 && (k === 1 || k === 2) && j < 2) m = 'door';
    if (j === 1 && ((k === 0 || k === 3) && i === 2)) m = 'glass';
    if (j === 1 && i === 0 && (k === 1 || k === 2)) m = 'glass';
    cells.set(key(i, j, k), m);
  }
  // a gable roof running along x (log beams on top of the walls, then spruce steps)
  for (let i = 0; i <= 4; i++) for (let k = 0; k <= 3; k++) cells.set(key(i, 3, k), (k === 0 || k === 3) && i > 0 && i < 4 ? 'spruce' : i === 0 || i === 4 ? 'planks' : 'log');
  for (let i = 0; i <= 4; i++) for (let k = 1; k <= 2; k++) cells.set(key(i, 4, k), i === 0 || i === 4 ? 'planks' : 'spruce');
  for (let j = 3; j <= 5; j++) cells.set(key(0, j, 3), 'cobble'); // chimney
  const list = voxels([], cells, { x: -2, z: -1.5, seed });
  // the roof's stepped eaves: slabs along both long sides
  for (const sz of [-1, 1]) {
    list.push([BOX(5.6, 0.5, 1.0), '#6f5233', T(0, 3.25, sz * 2.3)]);
    list.push([BOX(5.6, 0.5, 1.0), '#6f5233', T(0, 4.25, sz * 1.3)]);
    list.push([BOX(5.6, 0.12, 0.08), '#56401f', T(0, 3.5, sz * 2.8)]);
  }
  list.push([BOX(5.6, 0.5, 2.0), '#6f5233', T(0, 5.25, 0)]);
  // little windows in the door
  for (const z of [-0.5, 0.5]) list.push([PLANE, '#b8e2f2', T(2.509, 1.65, z, 0.4, 0.3, 1, 0, PI / 2, 0)]);
  // torches either side of the door
  for (const z of [-1.5, 1.5]) {
    list.push([BOX(0.12, 0.45, 0.12), '#6a4f2f', T(2.62, 1.6, z)]);
    list.push([BOX(0.18, 0.18, 0.18), '#ffd23a', T(2.62, 1.9, z)]);
  }
  list.push([BOX(5, dn + 0.05, 4), '#5c5c5c', T(0, -(dn + 0.05) / 2, 0)]);
  return list;
}

// the nether portal: a 4 x 5 obsidian frame round a 2 x 3 purple swirl, its bottom row
// sunk flush with the ground. Only the two side pillars are obstacles (PORTAL_X either
// side of its middle), so units walk through it and shots fly through it; the `lead`
// pillar draws the whole frame (the glow is added in the scenery hook).
const PORTAL_X = 1.5;
function portalPair(L, x, z, rot) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  L.box('mcportal', x - PORTAL_X * cs, z + PORTAL_X * sn, 0.5, 0.5, 4, rot, { lead: true });
  L.box('mcportal', x + PORTAL_X * cs, z - PORTAL_X * sn, 0.5, 0.5, 4, rot);
}
const portalFrame = (o) => (flipOf(o) || new THREE.Matrix4()).multiply(T(PORTAL_X, 0, 0));
function portalParts(seed, dn = 0.3) {
  const cells = new Map();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) if (i === 0 || i === 3 || j === 0 || j === 4) cells.set(key(i, j, 0), 'obsidian');
  const list = voxels([], cells, { x: -1.5, y: -0.97, z: 0, seed, bottom: true });
  for (const ry of [0, PI]) list.push([PLANE, '#7a2ad0', T(0, 1.53, 0, 1, 1, 1, 0, ry, 0).multiply(T(0, 0, 0.02, 2, 3, 1))]);
  for (const sx of [-1, 1]) list.push([BOX(1, dn + 0.05, 1), '#1f1631', T(sx * 1.5, -0.97 - (dn + 0.05) / 2, 0)]);
  return list;
}

register({
  obstacles: {
    mcblock(o, map, H, box, p, dn) { pushAll(p, blockParts(o, dn), flipOf(o)); },
    mchut(o, map, H, box, p, dn) { pushAll(p, hutParts(Math.floor(o.seed), dn), flipOf(o)); },
    mcportal(o, map, H, box, p, dn) { if (o.lead) pushAll(p, portalParts(Math.floor(o.seed), dn), portalFrame(o)); },
  },
});

// ---------------------------------------------------------------- trees and props
function oakCells(tall = 5, birch = false) {
  const c = new Map(), lv = birch ? 'bleaves' : 'leaves';
  for (let j = tall - 2; j <= tall - 1; j++) for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) {
    if (Math.abs(i) === 2 && Math.abs(k) === 2 && hash(i * 3 + j * 7 + k * 11 + tall) < 0.6) continue;
    c.set(key(i, j, k), lv);
  }
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
    c.set(key(i, tall, k), lv);
    if (i === 0 || k === 0) c.set(key(i, tall + 1, k), lv);
  }
  for (let j = 0; j < tall + (birch ? 0 : -0); j++) c.set(key(0, j, 0), birch ? 'birch' : 'log');
  return c;
}
function spruceCells() {
  const c = new Map();
  const rings = [[2, 2], [3, 1], [4, 2], [5, 1], [6, 1], [7, 0]];
  for (const [j, r] of rings) for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++) {
    if (r === 2 && Math.abs(i) === 2 && Math.abs(k) === 2) continue;
    c.set(key(i, j, k), 'sleaves');
  }
  c.set(key(0, 8, 0), 'sleaves');
  for (let j = 0; j < 7; j++) c.set(key(0, j, 0), 'spruce');
  return c;
}
MAP_H.TREES.mcoak = () => merged(voxels([], oakCells(5), { spots: 2, bottom: true, seed: 3 }));
MAP_H.TREES.mcbirch = () => merged(voxels([], oakCells(6, true), { spots: 2, bottom: true, seed: 5 }));
MAP_H.TREES.mcspruce = () => merged(voxels([], spruceCells(), { spots: 2, bottom: true, seed: 7 }));

// animals: plain boxes with pixel faces (local +x forward)
const animal = (body, head, legs, extra = []) => merged([...body, ...head, ...legs, ...extra]);
const legs4 = (c, w, h, dx, dz) => [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => [BOX(w, h, w), c, T(a * dx, h / 2, b * dz)]);
MAP_H.PROPS.mcsheep = () => animal(
  [[BOX(1.25, 0.8, 0.85), '#eeede8', T(0, 1.0, 0)], [BOX(1.0, 0.1, 0.9), '#e2e0d8', T(0.05, 1.42, 0)]],
  [[BOX(0.5, 0.5, 0.5), '#e2e0d8', T(0.78, 1.25, 0)], [BOX(0.08, 0.38, 0.4), '#c9a88a', T(1.03, 1.2, 0)],
    [BOX(0.02, 0.08, 0.08), '#1a1a1a', T(1.045, 1.3, 0.12)], [BOX(0.02, 0.08, 0.08), '#1a1a1a', T(1.045, 1.3, -0.12)]],
  legs4('#c9a88a', 0.22, 0.62, 0.42, 0.25));
MAP_H.PROPS.mccow = () => animal(
  [[BOX(1.45, 0.85, 0.9), '#4a3424', T(0, 1.15, 0)], [BOX(0.6, 0.6, 0.02), '#f2efe8', T(-0.1, 1.2, 0.46)], [BOX(0.4, 0.4, 0.02), '#f2efe8', T(0.35, 1.3, -0.46)],
    [BOX(0.3, 0.2, 0.4), '#e8a6a8', T(-0.3, 0.68, 0)]],
  [[BOX(0.5, 0.55, 0.6), '#4a3424', T(0.95, 1.45, 0)], [BOX(0.1, 0.25, 0.4), '#c9b8a6', T(1.22, 1.32, 0)],
    [BOX(0.12, 0.18, 0.08), '#e6dfcf', T(0.95, 1.8, 0.3)], [BOX(0.12, 0.18, 0.08), '#e6dfcf', T(0.95, 1.8, -0.3)],
    [BOX(0.02, 0.1, 0.1), '#1a1a1a', T(1.205, 1.55, 0.15)], [BOX(0.02, 0.1, 0.1), '#1a1a1a', T(1.205, 1.55, -0.15)]],
  legs4('#3a2618', 0.26, 0.72, 0.5, 0.28));
MAP_H.PROPS.mcpig = () => animal(
  [[BOX(1.1, 0.6, 0.65), '#f0a6a8', T(0, 0.7, 0)]],
  [[BOX(0.55, 0.55, 0.55), '#f0a6a8', T(0.78, 0.82, 0)], [BOX(0.08, 0.2, 0.3), '#e08890', T(1.08, 0.72, 0)],
    [BOX(0.02, 0.08, 0.08), '#1a1a1a', T(1.065, 0.95, 0.15)], [BOX(0.02, 0.08, 0.08), '#1a1a1a', T(1.065, 0.95, -0.15)]],
  legs4('#e8969a', 0.2, 0.4, 0.35, 0.2));

// blocky stand-ins for the stock round rocks, bushes and pebbles outside
const cubeRock = () => merged(voxels([], new Map([[key(0, 0, 0), 'stone'], [key(1, 0, 0), 'cobble'], [key(0, 1, 0), 'stone'], [key(0, 0, 1), 'mossy']]), { x: -0.5, y: -0.6, z: -0.5, s: 0.85, spots: 2 }));
const cubeBush = () => merged(voxels([], new Map([[key(0, 0, 0), 'leaves'], [key(1, 0, 0), 'leaves'], [key(0, 0, 1), 'leaves'], [key(1, 1, 0), 'leaves']]), { x: -0.45, y: 0, z: -0.45, s: 0.8, spots: 2 }));

// ---------------------------------------------------------------- set dressing
function lavaTexture(kind) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const g = cv.getContext('2d');
  const cols = kind === 'lava' ? ['#ff6a00', '#ff8c10', '#ffb030', '#e84a00', '#ffd050'] : ['#7a1ed8', '#9a3cf0', '#5a10b0', '#c070ff', '#4a0c90'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let k;
    if (kind === 'lava') k = Math.floor(hash(x * 3.1 + y * 17.3) * 3 + (Math.sin(x * 0.8 + y * 0.4) > 0.6 ? 2 : 0));
    else { const a = Math.atan2(y - 7.5, x - 7.5), r = Math.hypot(x - 7.5, y - 7.5); k = Math.floor((Math.sin(a * 2 + r * 0.9) * 0.5 + 0.5) * 3.99 + hash(x + y * 16) * 0.8) % 5; }
    g.fillStyle = cols[Math.min(4, k)];
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function blockyScenery(group, map, terrain, H, kit) {
  const { at } = kit;
  const pmat = kit.pmat;
  const F = terrain.feat;
  // ---- swap the stock round clouds / mountain ring / rocks / bushes / pebbles for cubes
  const rockC = new THREE.Color(map.rock), bushC = new THREE.Color(map.bushes);
  const near = (c, a, i) => a && Math.abs(a.getX(i) - c.r) + Math.abs(a.getY(i) - c.g) + Math.abs(a.getZ(i) - c.b) < 0.01;
  for (const m of [...group.children]) {
    if (!m.isMesh) continue;
    const mat = m.material, col = m.geometry.attributes.color;
    if (m.isInstancedMesh && mat.fog === false && mat.emissive && mat.emissive.getHexString() === 'a4b2c0') { group.remove(m); m.geometry.dispose(); continue; }
    if (!m.isInstancedMesh && m.frustumCulled === false && mat.vertexColors && m.geometry.boundingSphere && m.geometry.boundingSphere.radius > 200) { group.remove(m); m.geometry.dispose(); continue; }
    if (m.isInstancedMesh && mat.vertexColors && mat.flatShading && near(rockC, col, 0)) { m.geometry = cubeRock(); continue; }
    if (m.isInstancedMesh && mat.vertexColors && !mat.flatShading && near(bushC, col, 0)) { m.geometry = cubeBush(); continue; }
    if (m.isInstancedMesh && !mat.vertexColors && mat.color && mat.color.equals(rockC)) { m.geometry = BOX(1.4, 1.4, 1.4); m.geometry.translate(0, 0.3, 0); }
  }
  const addPix = (parts, opts = {}) => {
    if (!parts.length) return null;
    const mesh = new THREE.Mesh(merged(parts), opts.mat || pmat);
    mesh.castShadow = opts.shadow ?? true; mesh.receiveShadow = true;
    if (opts.noCull) mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  // ---- cube mountains: voxel heightmaps of big blocks, grass low, stone, snow caps
  {
    const parts = [];
    for (let m = 0; m < 22; m++) {
      const a = (m / 22) * PI * 2 + (hash(m * 3.3) - 0.5) * 0.2, r = 230 + hash(m * 5.1) * 80;
      const s = 9 + hash(m * 7.7) * 4, R = 4 + Math.floor(hash(m * 9.9) * 4), peak = 4 + Math.floor(hash(m * 2.2) * 6);
      const cells = new Map();
      for (let i = -R; i <= R; i++) for (let k = -R; k <= R; k++) {
        const d = Math.hypot(i, k * 1.2) / R + (hash(m * 13 + i * 3.7 + k * 5.1) - 0.5) * 0.25;
        const hh = Math.round(peak * (1 - d) + 1);
        for (let j = 0; j < hh; j++) cells.set(key(i, j, k), j === hh - 1 ? (j >= 5 ? 'snowstone' : j >= 3 ? 'stone' : 'grass') : j >= 6 ? 'snowblock' : j >= 1 ? 'stone' : 'dirt');
      }
      voxels(parts, cells, { x: Math.cos(a) * r, y: -s * 1.5, z: Math.sin(a) * r, s, spots: 1, seed: m });
    }
    addPix(parts, { mat: vcMat({ flatShading: true }), shadow: false, noCull: true });
  }
  // ---- square clouds and a square sun
  {
    const parts = [];
    for (let c = 0; c < 26; c++) {
      const a = hash(c * 4.4) * PI * 2, r = 130 + hash(c * 8.8) * 320, y = 105 + hash(c * 2.7) * 25;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r, n = 3 + Math.floor(hash(c * 6.6) * 4), w = 12;
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
        if (hash(c * 31 + i * 7 + k * 13) < 0.3 && i && k) continue;
        parts.push([BOX(w, 4, w), '#ffffff', T(cx + (i - n / 2) * w, y, cz + (k - 1) * w + (i % 2) * 4)]);
      }
    }
    addPix(parts, { mat: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#a4b2c0', fog: false }), shadow: false, noCull: true });
    const dir = new THREE.Vector3(-40, 80, 30).normalize();
    for (const [sz, col, op] of [[150, '#fff6c8', 0.28], [110, '#fffbe6', 1]]) {
      const sun = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshBasicMaterial({ color: col, fog: false, transparent: op < 1, opacity: op, depthWrite: false }));
      sun.position.copy(dir).multiplyScalar(op < 1 ? 805 : 800);
      sun.lookAt(0, 0, 0);
      sun.frustumCulled = false;
      sun.renderOrder = -9;
      group.add(sun);
    }
  }
  // ---- a little village beyond the far edges, with a well, and animals in the meadows
  {
    const parts = [];
    const place = (list, x, z, ry) => { const M = T(x, at(x, z), z, 1, 1, 1, 0, ry, 0); for (const [g, c, m] of list) parts.push([g, c, M.clone().multiply(m)]); };
    const huts = [[-26, 44, PI / 2], [-12, 47, PI / 2 + 0.1], [6, 45, PI / 2], [22, -45, -PI / 2], [36, -47, -PI / 2], [-58, 8, 0], [60, -12, PI]];
    huts.forEach(([x, z, ry], i) => place(hutParts(40 + i, 2.5), x, z, ry));
    // a well
    const wc = new Map();
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) if (i !== 1 || k !== 1) wc.set(key(i, 0, k), 'cobble');
    for (const [i, k] of [[0, 0], [2, 0], [0, 2], [2, 2]]) { wc.set(key(i, 1, k), 'spruce'); wc.set(key(i, 2, k), 'spruce'); }
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) wc.set(key(i, 3, k), 'cobble');
    place(voxels([], wc, { x: -1, z: -1, seed: 9 }).concat([[BOX(1, 0.1, 1), '#3c7ad6', T(0, 0.8, 0)], [BOX(3, 2.5, 3), '#5c5c5c', T(0, -1.2, 0)]]), -2, 54, 0);
    // farmland with wheat next to the village
    for (const [fx, fz] of [[-40, 46], [14, 53]]) {
      const y = at(fx, fz);
      parts.push([BOX(9, 0.4, 5), '#5a3a20', T(fx, y, fz)]);
      parts.push([BOX(9, 0.06, 0.6), '#3c7ad6', T(fx, y + 0.18, fz)]);
      for (let i = 0; i < 9; i++) for (let k = 0; k < 5; k++) if (k !== 2) parts.push([BOX(0.7, 0.55 + hash(i * 3 + k) * 0.3, 0.7), hash(i + k * 9) < 0.5 ? '#c8b44a' : '#a8a43a', T(fx - 4 + i, y + 0.45, fz - 2 + k)]);
    }
    addPix(parts);
    for (const [kind, n] of [['mcsheep', 16], ['mccow', 10], ['mcpig', 8]]) {
      const ms = scatter(terrain, n, 6, 45, (x, y, z) => comp(x, y - 0.02, z, 1, 1, (Math.floor(hash(x * z) * 4)) * PI / 2), 0.12);
      if (ms.length) group.add(instanced(MAP_H.PROPS[kind](), pmat, ms));
    }
  }
  if (!F) return;
  // ---- glowing lava and portal surfaces (unlit, animated pixel textures)
  const tex = { lava: lavaTexture('lava'), portal: lavaTexture('portal') };
  if (F.anyWater && tex.lava) {
    const SEG = terrain.seg, n = SEG + 1, S = terrain.size, pos = [], uv = [];
    for (let iz = 0; iz < SEG; iz++) for (let ix = 0; ix < SEG; ix++) {
      const a = iz * n + ix, b = a + 1, c = a + n, d = c + 1;
      if (!(F.ws[a] === F.ws[a] && F.ws[b] === F.ws[b] && F.ws[c] === F.ws[c] && F.ws[d] === F.ws[d])) continue;
      if (F.wd[a] + F.wd[b] + F.wd[c] + F.wd[d] <= 0) continue;
      const X = (i) => (i / SEG - 0.5) * S, y = F.ws[a] + 0.03;
      const q = [[X(ix), X(iz)], [X(ix), X(iz + 1)], [X(ix + 1), X(iz)], [X(ix + 1), X(iz)], [X(ix), X(iz + 1)], [X(ix + 1), X(iz + 1)]];
      for (const [x, z] of q) { pos.push(x, y, z); uv.push(x / 3, z / 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const lava = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex.lava }));
    lava.renderOrder = 2;
    lava.onBeforeRender = () => { tex.lava.offset.set(0, (performance.now() / 9000) % 1); };
    group.add(lava);
  }
  for (const o of F.obs) {
    if (o.kind !== 'mcportal' || !o.lead || !tex.portal) continue;
    const M = T(o.x, o.ground, o.z, 1, 1, 1, 0, o.rot, 0).multiply(portalFrame(o));
    for (const ry of [0, PI]) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), new THREE.MeshBasicMaterial({ map: tex.portal, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      pm.applyMatrix4(M.clone().multiply(T(0, 1.53, 0, 1, 1, 1, 0, ry, 0)).multiply(T(0, 0, 0.05)));
      pm.onBeforeRender = () => { tex.portal.rotation = 0; tex.portal.offset.set((performance.now() / 4000) % 1, (performance.now() / 2600) % 1); };
      group.add(pm);
    }
  }
}
register({ scenery: { blocky: blockyScenery } });

// ---- the lava burns: anyone standing in it takes damage a few times a second and keeps
// burning for a while after stepping out (fliers and units in the air are safe)
const LAVA = { dps: 45, tick: 0.25, burn: 3, burnDps: 8 };
register({
  battleStep(b, dt) {
    const T = b.terrain;
    if (T.map?.id !== 'blocky' || !T.feat?.anyWater) return;
    for (const u of b.units) {
      if (!u.alive || u.dormant || T.waterDepth(u.pos.x, u.pos.z) < 0.05 || airborne(b, u)) { u._lavaT = 0; continue; }
      if ((u._lavaT = (u._lavaT || 0) - dt) > 0) continue;
      u._lavaT = LAVA.tick;
      u.hit(LAVA.dps * LAVA.tick, PART.pelvis, 0, u.M * 0.6, 0, null, 'lava');
      addStatus(b, u, 'burn', LAVA.burn, LAVA.burnDps);
      const y = T.height(u.pos.x, u.pos.z) + T.waterDepth(u.pos.x, u.pos.z);
      for (let i = 0; i < 3; i++) b.emit('trail', u.pos.x + rand(-0.3, 0.3), y + 0.1, u.pos.z + rand(-0.3, 0.3), i % 2);
      if (Math.random() < 0.35) b.sound('fire', u.pos, 0.6, rand(0.9, 1.2));
    }
  },
});

// ---------------------------------------------------------------- the map
// a cluster of block piles: rects [dx, dz, w, d, nHigh, mat, top, ore] (whole blocks)
function pile(L, x, z, rects) {
  for (const [dx, dz, w, d, n, mat, top, ore] of rects) L.box('mcblock', x + dx, z + dz, w / 2, d / 2, n * B, 0, { mat, cap: top, ore });
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const PATCH = ['#62a638', '#71b445', '#5b9b33', '#78ba4a', '#6aad3e'];

MAPS.push({
  id: 'blocky', name: 'Blocky Plains', music: 'battle_blocky', // (the Minecraft theme, once delivered)
  ground: ['#67a93b', '#74b446', '#5c9c34'], patch: '#7cbc4a', dirt: '#87603e', high: '#74b446', far: '#5c9a40', rock: '#6d4e33',
  sky: ['#6b9cf0', '#c4dcff'], fog: '#bcd4f4', sun: '#fff6dc', sunI: 2.7, hemiGround: '#5e8a3a', hemiI: 1.3,
  hills: 1.35, bumps: 0.12, trees: ['mcoak', 'mcbirch', 'mcoak', 'mcspruce'], grass: '#62a238', grassTip: '#8cc858',
  flowers: ['#e52b2b', '#ffe335', '#ffffff', '#5a8cff'], bushes: '#3f8a2a', props: 'blocky', mountains: '#8aa6c8',
  stone: '#8e8e8e', wood: '#b18a53', water: '#ff7a10', waterLight: 0.45, waterOpacity: 0.95, bed: '#3a2618', tufts: 0.4,
  // outside the field the land is quantised into 2 m steps: grass-topped block terraces
  shape(x, z, y, out) {
    const k = smooth(clamp01((out - 3) / 5));
    if (k <= 0) return y;
    const q = Math.round(y / (2 * B)) * 2 * B;
    return y + (q - y) * k;
  },
  layout(L) {
    // pixel patches of lighter and darker grass, a few dirt and gravel squares
    for (let i = 0; i < 70; i++) {
      const x = -3 - hash(i * 1.31) * 40, z = (hash(i * 2.77) - 0.5) * 64, s = 1.2 * (1 + Math.floor(hash(i * 3.9) * 3));
      L.paint(x, z, s, s, PATCH[i % PATCH.length], { soft: 0.4, noise: 0.15 });
    }
    for (const [x, z, s] of [[-14, -6, 1.8], [-33, 20, 1.2], [-6, -27, 1.2], [-25, -26, 2.4]]) L.paint(x, z, s, s * 0.8, '#87603e', { soft: 0.4, noise: 0.3 });
    // a little lava pool in the middle, rimmed with cobblestone (no blocks: the middle
    // stays open for the melee)
    L.paint(0, 0, 4.2, 4.2, '#6e6e6e', { soft: 0.5, noise: 0.6 }, true);
    L.pool(0, 0, 2.7, 0.5, true);
    // a nether portal on each side, on an obsidian-and-cobblestone pad
    L.paint(-17, -7, 1.6, 3.4, '#4a4458', { soft: 0.5, noise: 0.6 });
    portalPair(L, -17, -7, PI / 2);
    pile(L, -17, -12, [[0, 0, 1, 1, 1, 'obsidian'], [1, -0.5, 1, 2, 1, 'cobble']]);
    // the huts (door toward the middle)
    L.paint(-30, -15, 4, 3.4, '#8a7a5e', { soft: 0.5, noise: 0.5 });
    L.box('mchut', -30, -15, 2.5, 2, 5.5);
    L.crates(-30, -10.5, 2, 0);
    // cobblestone outcrop
    pile(L, -17, 9, [[0, 0, 3, 2, 2, 'cobble'], [2.5, 0.5, 2, 2, 1, 'stone'], [-1, 1.5, 1, 1, 3, 'cobble'], [0.5, -1.5, 2, 1, 1, 'mossy']]);
    // grass-topped dirt mounds
    pile(L, -24, 25, [[0, 0, 3, 3, 1, 'dirt', 'grass'], [-1, 2.5, 2, 2, 2, 'dirt', 'grass'], [2.5, -0.5, 2, 1, 1, 'dirt', 'grass']]);
    // a stone pile with ores
    pile(L, -11, -21, [[0, 0, 2, 2, 3, 'stone', null, 'coal'], [2, 0.5, 2, 1, 2, 'stone', null, 'iron'], [-1.5, -0.5, 1, 1, 1, 'cobble'], [1, 1.5, 2, 2, 1, 'stone', null, 'diamond']]);
    // low cover near the middle and in the back
    pile(L, -8, 7, [[0, 0, 1, 3, 1, 'cobble'], [1, 1, 1, 1, 2, 'cobble']]);
    pile(L, -36, 5, [[0, 0, 2, 2, 1, 'dirt', 'grass'], [0, 2, 2, 1, 2, 'stone', null, 'gold']]);
    pile(L, -20, -9, [[0, 0, 1, 1, 2, 'planks'], [1, 0, 1, 1, 1, 'planks']]);
    // a stepped knoll
    L.plateau(-27, 3, 2.5, 3, 0.8, 1.6);
    L.paint(-27, 3, 3.6, 4.2, '#5f9f35', { soft: 0.4, noise: 0.2 });
    L.tree('mcoak', -38, 27, 1);
    L.tree('mcbirch', -21, -29, 1);
    L.tree('mcoak', -13, 28, 0.9);
    L.tree('mcbirch', -39, -6, 1);
    L.tree('mcspruce', -33, -29, 0.9);
  },
});
