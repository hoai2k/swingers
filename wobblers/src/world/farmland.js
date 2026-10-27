// POOH BERRY FARMS: the farm in the west of Wobbly Island, next to the factory (world/factory.js).
//   - farmyard (meadow south half, x -232..-190, z 22..104, flat): POOH BERRY FARMS arch on the road
//     from the ring road (z = 60), a big red barn with a hayloft, three silos, a machinery shed
//     where the giant vehicles park, a farmhouse, hay bales, a farmer
//   - the wheat field (x -296..-238, z 24..102): the combine harvester cuts it as it drives
//     (its header), drops round straw bales behind it, and the wheat grows back in ~2 minutes
//   - giant farm machines: a combine harvester with a turning reel, a huge 4WD tractor and a
//     crop sprayer with 18 m booms (registered here as 'combine', 'bigtractor', 'sprayer')
//   - the sunflower field and the CORN MAZE on the rolling ground to the south-west: a maze
//     grown from a seeded depth-first search, a lookout platform with a prize in the middle;
//     every stalk bends out of your way (world/crops.js) and pushing through a corn wall is slow
// FARM_CLEAR: the area kept free of the island's scattered trees (outskirts.js forests).
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { DT } from '../config.js';
import { Builder, signMesh } from '../mesh.js';
import { Vehicle, registerVehicle } from '../vehicles.js';
import { Local, ladder, groundAt } from './common.js';
import { cropField } from './crops.js';

export const FARM_CLEAR = [[-302, -186, 14, 108], [-300, -186, 108, 214]];
export const inFarmClear = (x, z, m = 0) => FARM_CLEAR.some(([x0, x1, z0, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);
const WHEAT = { x0: -296, x1: -238, z0: 24, z1: 102, step: 0.9 };
const MAZE = { x: -244, z: 160, cells: 12, block: 2.2 };       // centre, cells per side, grid block (m)
const SUN = { x0: -214, x1: -192, z0: 116, z1: 206, step: 1.45 };
const RED = 0xc8402f, WHITE = 0xf4efe4, WOOD = 0x9a6a3a, DARK = 0x2f343c, GREEN = 0x3e8f3e;

let rng = 1;
const rnd = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);

export function buildFarmland(game, kit) {
  rng = 4242;
  farmyard(game, kit);
  const wheat = wheatField(game);
  sunflowers(game);
  cornMaze(game, kit);
  machines(game, wheat);
}

// ---- farmyard ------------------------------------------------------------------------------------
function farmyard(game, kit) {
  // dirt yard and the track in from the ring road
  kit.deco(-211, 0.03, 63, 42, 0.06, 82, 0xb99a6a);
  // arch
  const ax = -190;
  for (const z of [53, 67]) { kit.cyl(ax, 3, z, 0.35, 6, WOOD, { seg: 8 }); }
  kit.deco(ax, 6.1, 60, 0.4, 0.5, 15, WOOD);
  const s = signMesh('POOH BERRY FARMS', 12, '#c8402f');
  s.position.set(ax + 0.3, 5.0, 60); s.rotation.y = Math.PI / 2; game.scene.add(s);
  kit.fence(-190, 22, -190, 52, WHITE, 1.1);
  kit.fence(-190, 68, -190, 106, WHITE, 1.1);
  // barn (doors on the south side, a hayloft floor inside)
  const B = new Local(kit, -214, 88, 0), bw = 16, bd = 18, bh = 6;
  B.deco(0, 0.07, 0, bw - 0.6, 0.1, bd - 0.6, 0xc9a46a);
  B.wall(-bw / 2, bd / 2, bw / 2, bd / 2, bh, 0.4, RED, [{ at: bw / 2, w: 6, h: 4.6 }]);
  B.wall(-bw / 2, -bd / 2, bw / 2, -bd / 2, bh, 0.4, RED, []);
  B.wall(-bw / 2, -bd / 2, -bw / 2, bd / 2, bh, 0.4, RED, []);
  B.wall(bw / 2, -bd / 2, bw / 2, bd / 2, bh, 0.4, RED, [{ at: 5, w: 2, h: 2.4 }]);
  // pitched roof: two slabs from the ridge down past the eaves, triangular gables in the ends
  const rise = 3.6, run = bw / 2 + 0.5, slope = Math.atan2(rise, run), slab = Math.hypot(rise, run);
  for (const s2 of [-1, 1]) B.box(s2 * run / 2, bh + rise / 2 - 0.05, 0, slab + 0.2, 0.3, bd + 1, 0x55504a, { euler: [0, 0, -s2 * slope] });
  const tri = new THREE.Shape([new THREE.Vector2(-bw / 2, 0), new THREE.Vector2(bw / 2, 0), new THREE.Vector2(0, rise - 0.15)]);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false });
  for (const z of [-bd / 2 - 0.2, bd / 2 - 0.2]) kit.b(-214, 88).add(gable.clone(), RED, [-214, bh, 88 + z]);
  kit.b(-214, 88).add(new THREE.CircleGeometry(0.9, 16), WHITE, [-214, bh + 1.3, 88 + bd / 2 + 0.22]); // hayloft window
  B.deco(0, 2.3, bd / 2 + 0.25, 6.4, 0.25, 0.1, WHITE); // door trim
  for (const s2 of [-1, 1]) B.deco(s2 * 3.1, 2.3, bd / 2 + 0.25, 0.2, 4.6, 0.1, WHITE);
  B.deco(0, 2.3, bd / 2 + 0.24, 6, 0.18, 0.08, WHITE, { euler: [0, 0, 0.66] }); B.deco(0, 2.3, bd / 2 + 0.24, 6, 0.18, 0.08, WHITE, { euler: [0, 0, -0.66] });
  B.box(0, 3.4, -4, bw - 1, 0.2, 9, WOOD);                 // hayloft
  ladder(game, -214 + 5, 88 + 0.9, 0, 3.5, 0, -1, 0.35);
  B.deco(5, 1.75, 0.6, 0.1, 3.5, 0.6, WOOD);
  for (let i = 0; i < 6; i++) B.box(-5 + (i % 3) * 2.2, 3.5 + 0.45 + Math.floor(i / 3) * 0.9, -6 + (i % 2) * 1.1, 2, 0.9, 1, 0xe8c45a, { round: 0.2 });
  game.interiorLights.add(-214, 5.6, 92, { color: 0xffe2b0 });
  // silos
  for (const [x, z, r, h] of [[-197, 96, 2.6, 14], [-197, 86, 2.2, 11], [-203.5, 100.5, 1.8, 9]]) {
    kit.cyl(x, h / 2, z, r, h, 0xd7dbe0, { seg: 18 });
    kit.sphere(x, h, z, r, 0x9aa7b5, { scale: [1, 0.55, 1], seg: 18 });
    for (let y = 2; y < h; y += 2.4) kit.b(x, z).torus(r + 0.01, 0.06, 0xb7bdc5, [x, y, z], [Math.PI / 2, 0, 0], 24); // bands
  }
  // machinery shed: an open-sided roof on posts where the big machines park
  const sx = -212, sz = 38, sw = 26, sd = 14;
  for (const ox of [-sw / 2, 0, sw / 2]) for (const oz of [-sd / 2, sd / 2]) kit.cyl(sx + ox, 3.4, sz + oz, 0.25, 6.8, 0x6d7682, { seg: 8 });
  kit.box(sx, 6.9, sz, sw + 1.4, 0.25, sd + 1.4, 0x7a8a6a, { euler: [0.06, 0, 0] });
  // farmhouse
  const H = new Local(kit, -200, 26, -Math.PI / 2);
  H.box(0, 2.2, 0, 9, 4.4, 7, 0xf2e2c4);
  for (const s2 of [-1, 1]) H.box(0, 5.3, s2 * 2.0, 9.6, 0.25, 4.6, 0x8a3a2a, { euler: [s2 * 0.62, 0, 0] });
  H.deco(0, 1.2, 3.55, 1.2, 2.4, 0.12, 0x7a4a2a);
  for (const lx of [-2.8, 2.8]) H.deco(lx, 2.5, 3.55, 1.4, 1.2, 0.1, 0x9fd8ff);
  // hay bales to push, sit on, stack (dynamic round bales) and a few square ones
  for (let i = 0; i < 6; i++) bale(game, -226 + (i % 3) * 2.2, 74 + Math.floor(i / 3) * 2.4, i);
  for (let i = 0; i < 4; i++) kit.box(-222 + i * 1.3, 0.45, 104, 1.2, 0.9, 0.8, 0xe8c45a, { round: 0.12 });
  // the farmer
  game.npcs?.spawn?.('farmer', -214, 66, { behaviour: 'wander', area: { x: -212, z: 66, r: 16 } });
  // fences round the wheat field (posts and rails; open on the yard side for the machines)
  kit.fence(WHEAT.x0 - 2, WHEAT.z0 - 2, WHEAT.x1 + 2, WHEAT.z0 - 2, WOOD, 1.0);
  kit.fence(WHEAT.x0 - 2, WHEAT.z0 - 2, WHEAT.x0 - 2, WHEAT.z1 + 2, WOOD, 1.0);
  kit.fence(WHEAT.x0 - 2, WHEAT.z1 + 2, WHEAT.x1 + 2, WHEAT.z1 + 2, WOOD, 1.0);
}

// A round straw bale (dynamic; the combine drops them too).
function baleMesh() {
  const b = new Builder();
  b.cyl(0.75, 0.75, 1.2, 0xe8c45a, [0, 0, 0], [0, 0, Math.PI / 2], 16);
  for (const s of [-1, 1]) b.cyl(0.74, 0.74, 0.04, 0xd4ae45, [s * 0.6, 0, 0], [0, 0, Math.PI / 2], 16);
  b.cyl(0.755, 0.755, 0.06, 0xc8b8a0, [0, 0, 0], [0, 0, Math.PI / 2], 16);
  return b.mesh();
}
function bale(game, x, z, i = 0) {
  const o = game.physics.dynamic({ x, y: groundAt(x, z) + 0.78, z }, [RAPIER.ColliderDesc.cylinder(0.6, 0.75).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setMass(60)], baleMesh(), { angDamp: 1.0, rot: { x: 0, y: Math.sin(i), z: 0, w: Math.cos(i) } });
  game.scene.add(o.mesh);
  return o;
}

// ---- crops -----------------------------------------------------------------------------------------
// (plants are drawn by the thousand: open-ended stems and few-sided heads keep them cheap)
const stem = (b, rt, rb, h, color, pos, rot, seg = 3) => b.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), color, pos, rot);
function wheatPlant() {
  const b = new Builder();
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2 + k * 0.7, rr = 0.06 + (k % 3) * 0.07, ox = Math.cos(a) * rr, oz = Math.sin(a) * rr;
    const h = 0.85 + (k % 3) * 0.1, lean = 0.12 + (k % 2) * 0.1;
    stem(b, 0.01, 0.014, h, k % 2 ? 0xd2ae52 : 0xc29e44, [ox, h / 2, oz], [Math.sin(a) * lean * 0.5, 0, -Math.cos(a) * lean * 0.5]);
    // the ear: a plump grain head nodding over at the top
    b.add(new THREE.ConeGeometry(0.045, 0.26, 3, 1, true), k % 2 ? 0xf0cf6a : 0xe5bf55, [ox + Math.cos(a) * lean * 0.45, h + 0.06, oz + Math.sin(a) * lean * 0.45], [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]);
  }
  return b.geometry();
}
function wheatField(game) {
  const spots = [], cells = [];
  const nx = Math.round((WHEAT.x1 - WHEAT.x0) / WHEAT.step), nz = Math.round((WHEAT.z1 - WHEAT.z0) / WHEAT.step);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = WHEAT.x0 + (i + 0.5) * WHEAT.step + (rnd() - 0.5) * 0.4, z = WHEAT.z0 + (j + 0.5) * WHEAT.step + (rnd() - 0.5) * 0.4;
    spots.push([x, 0.02, z, rnd() * 6.3, 0.85 + rnd() * 0.3]);
  }
  const f = cropField(game, wheatPlant(), spots, { H: 1.1, bend: 0.8, name: 'wheat' });
  // the ground under the wheat: straw-coloured stubble, not lawn
  game.kit.deco((WHEAT.x0 + WHEAT.x1) / 2, 0.035, (WHEAT.z0 + WHEAT.z1) / 2, WHEAT.x1 - WHEAT.x0 + 1, 0.06, WHEAT.z1 - WHEAT.z0 + 1, 0xc9a85e);
  f.nx = nx; f.nz = nz; f.cutAt = new Float32Array(spots.length).fill(-1);
  void cells;
  return f;
}
function cornPlant() {
  const b = new Builder();
  stem(b, 0.025, 0.04, 2.6, 0x6f9a3a, [0, 1.3, 0], null, 4);
  for (let k = 0; k < 5; k++) {
    const y = 0.5 + k * 0.42, a = k * 2.4;
    const leaf = new THREE.PlaneGeometry(0.12, 0.95);
    leaf.translate(0, 0.45, 0);
    b.add(leaf, k % 2 ? 0x5f9a3a : 0x4f8a32, [0, y, 0], [0.9, a, 0, 'YXZ']);
  }
  b.add(new THREE.ConeGeometry(0.06, 0.3, 4, 1, true), 0xf2c94c, [0.07, 1.55, 0], [0, 0, -0.3 + Math.PI]); // cob
  b.add(new THREE.ConeGeometry(0.04, 0.28, 3, 1, true), 0xc9b46a, [0, 2.72, 0]);                         // tassel
  return b.geometry();
}
function sunflowerPlant() {
  const b = new Builder();
  stem(b, 0.03, 0.04, 2.0, 0x5a8a32, [0, 1.0, 0], null, 4);
  for (const [y, a] of [[0.7, 0], [1.2, 2.2]]) { const l = new THREE.PlaneGeometry(0.3, 0.45); l.translate(0, 0.2, 0); b.add(l, 0x4f8a32, [0, y, 0], [1.1, a, 0, 'YXZ']); }
  b.add(new THREE.CircleGeometry(0.28, 10), 0xffc61a, [0, 2.05, 0.08], [-0.32, 0, 0]);        // petals (double-sided)
  b.add(new THREE.CircleGeometry(0.15, 8), 0x5a3a1a, [0, 2.06, 0.115], [-0.32, 0, 0]);        // seeds
  return b.geometry();
}
function sunflowers(game) {
  const spots = [];
  for (let z = SUN.z0; z < SUN.z1; z += SUN.step) for (let x = SUN.x0; x < SUN.x1; x += SUN.step) {
    const px = x + (rnd() - 0.5) * 0.5, pz = z + (rnd() - 0.5) * 0.5;
    spots.push([px, groundAt(px, pz) - 0.05, pz, -0.4 + (rnd() - 0.5) * 0.5, 0.85 + rnd() * 0.35]); // heads face the morning sun
  }
  cropField(game, sunflowerPlant(), spots, { H: 2.1, bend: 0.7, name: 'sunflowers' });
}

// ---- corn maze -----------------------------------------------------------------------------------------
// A cells x cells maze on a (2 cells + 1) block grid: blocks are corn (walls) or open (paths).
function mazeGrid(cells) {
  const G = cells * 2 + 1, open = new Uint8Array(G * G);
  const at = (i, j) => j * G + i, seen = new Uint8Array(cells * cells);
  const stack = [[cells >> 1, cells - 1]];
  seen[(cells - 1) * cells + (cells >> 1)] = 1; open[at((cells >> 1) * 2 + 1, (cells - 1) * 2 + 1)] = 1;
  while (stack.length) {
    const [ci, cj] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [ci + dx, cj + dz]).filter(([a, b]) => a >= 0 && b >= 0 && a < cells && b < cells && !seen[b * cells + a]);
    if (!nb.length) { stack.pop(); continue; }
    const [ni, nj] = nb[(rnd() * nb.length) | 0];
    seen[nj * cells + ni] = 1;
    open[at(ni * 2 + 1, nj * 2 + 1)] = 1;
    open[at(ci + ni + 1, cj + nj + 1)] = 1; // the wall block between
    stack.push([ni, nj]);
  }
  // entrance (south, middle) and exit (north, middle), a clearing in the centre
  const mid = cells; // block index of the middle column (odd)
  open[at(mid, G - 1)] = 1; open[at(mid, 0)] = 1;
  for (let j = mid - 2; j <= mid + 2; j++) for (let i = mid - 2; i <= mid + 2; i++) open[at(i, j)] = 1;
  // a few extra openings so there are loops (less of a dead-end slog)
  for (let k = 0; k < cells; k++) {
    const i = 1 + 2 * ((rnd() * cells) | 0) + (rnd() < 0.5 ? 1 : 0), j = 1 + 2 * ((rnd() * (cells - 1)) | 0) + 1;
    if (i > 0 && i < G - 1 && j > 0 && j < G - 1) open[at(i, j)] = 1;
  }
  return { G, open, at };
}
function cornMaze(game, kit) {
  const { G, open, at } = mazeGrid(MAZE.cells), B = MAZE.block, half = G * B / 2;
  const wx = (i) => MAZE.x - half + (i + 0.5) * B, wz = (j) => MAZE.z - half + (j + 0.5) * B;
  const spots = [];
  const margin = 2; // a ring of plain corn round the maze
  for (let j = -margin; j < G + margin; j++) for (let i = -margin; i < G + margin; i++) {
    const inside = i >= 0 && j >= 0 && i < G && j < G;
    if (inside && open[at(i, j)]) continue;
    if (!inside && (i === (G >> 1)) && (j < 0 || j >= G)) continue; // keep the way in / out clear
    for (let k = 0; k < 5; k++) {
      const x = wx(i) + (rnd() - 0.5) * B * 0.9, z = wz(j) + (rnd() - 0.5) * B * 0.9;
      spots.push([x, groundAt(x, z) - 0.05, z, rnd() * 6.3, 0.85 + rnd() * 0.3]);
    }
  }
  cropField(game, cornPlant(), spots, { H: 2.9, bend: 0.75, name: 'corn' });
  // entrance sign and the exit gap
  const ex = wx(G >> 1), ez = wz(G - 1) + B * (margin + 0.8), ey = groundAt(ex, ez);
  for (const s of [-1, 1]) kit.cyl(ex + s * 1.8, ey + 1.6, ez, 0.12, 3.2, WOOD, { seg: 6 });
  kit.deco(ex, ey + 3.1, ez, 4.2, 0.9, 0.15, 0xe8c45a);
  const sg = signMesh('CORN MAZE', 4, '#2f7a2f');
  sg.position.set(ex, ey + 3.1, ez + 0.1); game.scene.add(sg);
  // centre: a lookout platform with a ladder, a scarecrow and the prize (presents.js / coins spots)
  const cx = MAZE.x, cz = MAZE.z, cy = groundAt(cx, cz);
  kit.box(cx, cy + 2.4, cz, 3, 0.25, 3, WOOD);
  for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) kit.cyl(cx + ox, cy + 1.2, cz + oz, 0.1, 2.4, WOOD, { seg: 6 });
  ladder(game, cx, cz + 1.6, cy, cy + 2.5, 0, 1, 0.35);
  kit.deco(cx, cy + 1.2, cz + 1.55, 0.6, 2.4, 0.08, WOOD);
  scarecrow(kit, cx + 3.2, cz - 2.6, groundAt(cx + 3.2, cz - 2.6));
  game.cornMaze = { x: cx, z: cz, top: cy + 2.53, G, B, open, at, x0: MAZE.x - half, z0: MAZE.z - half };
  // pushing through a corn wall is hard going: slow characters inside wall blocks
  const M = game.cornMaze;
  const inWall = (x, z) => {
    const i = Math.floor((x - M.x0) / B), j = Math.floor((z - M.z0) / B);
    if (i < -margin || j < -margin || i >= G + margin || j >= G + margin) return false;
    if (i < 0 || j < 0 || i >= G || j >= G) return !(i === (G >> 1));
    return !open[at(i, j)];
  };
  game.steppers.push(game.whenNear(cx, cz, 70, () => {
    for (const p of [...game.players, ...(game.npcs?.awake || [])]) {
      if (p.seat) continue;
      const c = p.hips.translation();
      if (!inWall(c.x, c.z)) continue;
      for (const b of [p.chest, p.hips]) {
        const v = b.linvel(), sp = Math.hypot(v.x, v.z), cap = 2.2;
        if (sp > cap) b.setLinvel({ x: v.x * cap / sp, y: v.y, z: v.z * cap / sp }, true);
      }
    }
  }));
}
function scarecrow(kit, x, z, y) {
  kit.cyl(x, y + 1.1, z, 0.06, 2.2, WOOD, { seg: 5 });
  kit.deco(x, y + 1.55, z, 1.8, 0.08, 0.08, WOOD);
  kit.deco(x, y + 1.35, z, 0.6, 0.7, 0.35, 0x3f7fd0, { round: 0.12 });
  for (const s of [-1, 1]) kit.deco(x + s * 0.6, y + 1.5, z, 0.6, 0.22, 0.22, 0x3f7fd0, { round: 0.08 });
  kit.sphere(x, y + 1.95, z, 0.26, 0xe8c45a);
  kit.cone(x, y + 2.3, z, 0.45, 0.4, 0x9a6a3a, { seg: 10 });
}

// ---- the giant machines -----------------------------------------------------------------------------
const axle = (z, x, y, r, rest, steer, drive, extra = {}) => ({ z, x, y, r, rest, steer, drive, ...extra });

registerVehicle('combine', {
  mass: 9000, half: [1.5, 0.85, 3.3],
  header: { w: 7.2, z: 4.6, y: -0.6 },  // the cutter bar out front (wheat it passes is harvested)
  axles: [axle(1.6, 1.55, -0.35, 0.95, 0.3, 0, 0.85, { wide: 0.7 }), axle(-2.5, 1.25, -0.35, 0.6, 0.3, -1, 0.15, { hand: true, wide: 0.42 })],
  accel: 4.5, maxSpeed: 9, rev: 4, brakeDecel: 8, steer: 0.55, grip: 1.3,
  susp: { k: 16, c: 1.6 }, com: [0, -0.5, 0],
  seats: [{ pos: [0, 2.05, 2.15], kind: 'driver' }, { pos: [0.75, 2.05, 1.6] }],
  camH: 4.5, camDist: 16, horn: 'tractor', voice: 'bus',
  lights: { head: [2.4, 3.95] },
  colliders(add, C) {
    add(C.cuboid(1.5, 0.85, 3.3));
    add(C.cuboid(1.2, 1.0, 1.0).setTranslation(0, 2.0, 2.2).setMass(400));     // cab
    add(C.cuboid(1.35, 0.8, 1.4).setTranslation(0, 1.6, -0.9).setMass(500));    // grain tank
    add(C.cuboid(3.6, 0.35, 0.5).setTranslation(0, -0.55, 4.6).setMass(500));   // header
  },
  mesh(b, def, c, P, v) {
    b.rbox(3.0, 1.7, 6.6, 0.25, c, [0, 0, 0]);
    b.rbox(2.4, 2.0, 2.0, 0.2, c, [0, 2.0, 2.2]);                                    // cab
    P.glass.box(2.2, 1.3, 0.05, 0, [0, 2.2, 3.22], [-0.12, 0, 0]);
    for (const s of [-1, 1]) P.glass.box(0.05, 1.2, 1.6, 0, [s * 1.21, 2.2, 2.2]);
    b.rbox(2.7, 1.6, 2.8, 0.2, 0xffd23f, [0, 1.6, -0.9]);                            // grain tank
    b.cyl(0.22, 0.22, 4.2, DARK, [1.9, 2.4, -0.2], [0, 0, 1.2], 10);                    // unloading auger
    b.rbox(1.6, 0.5, 1.2, 0.1, DARK, [0, 0.5, -3.6]);                                 // straw chute
    b.box(7.2, 0.5, 1.2, c, [0, -0.6, 4.6]);                                           // header pan
    b.box(7.2, 0.9, 0.12, c, [0, -0.25, 4.0]);                                         // header back
    for (const s of [-1, 1]) b.box(0.15, 1.0, 1.4, c, [s * 3.6, -0.35, 4.6]);
    for (let k = -3.4; k <= 3.4; k += 0.4) b.cone(0.07, 0.35, 0xd0d4da, [k, -0.75, 5.35], [Math.PI / 2, 0, 0], 4); // cutter teeth
    b.rbox(1.4, 0.8, 0.5, 0.1, 0x222228, [0, 0.4, 3.6]);                              // feeder
    // the reel: its own mesh, turned as the combine drives
    const rb = new Builder();
    rb.cyl(0.08, 0.08, 7.0, DARK, [0, 0, 0], [0, 0, Math.PI / 2], 8);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; rb.box(7.0, 0.06, 0.18, 0xff5a3a, [0, Math.sin(a) * 0.65, Math.cos(a) * 0.65], [a, 0, 0]); }
    for (const x of [-3.4, -1.1, 1.1, 3.4]) for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; rb.box(0.05, 0.05, 0.65, DARK, [x, Math.sin(a) * 0.32, Math.cos(a) * 0.32], [a, 0, 0]); }
    const reel = rb.mesh(); reel.position.set(0, 0.35, 4.8);
    P.shell.add(reel);
    if (v) v.reel = reel;
    for (const s of [-1, 1]) b.box(0.12, 0.12, 1.6, DARK, [s * 3.3, 0.55, 4.3], [-0.5, 0, 0]);
  },
});

registerVehicle('bigtractor', {
  mass: 8000, half: [1.25, 0.7, 2.5],
  axles: [axle(1.6, 1.5, -0.3, 1.05, 0.3, 1, 0.5, { wide: 0.75 }), axle(-1.5, 1.5, -0.3, 1.05, 0.3, 0, 0.5, { hand: true, wide: 0.75 })],
  accel: 5.5, maxSpeed: 15, rev: 5, brakeDecel: 9, steer: 0.55, grip: 1.6,
  susp: { k: 16, c: 1.6 }, com: [0, -0.5, 0],
  seats: [{ pos: [0, 1.7, -0.6], kind: 'driver' }, { pos: [0.7, 1.7, -1.2] }],
  camH: 3.6, camDist: 12.5, horn: 'tractor', voice: 'bus', lights: { head: [1.0, 2.55], tail: [1.0, -2.5] },
  colliders(add, C) {
    add(C.cuboid(1.25, 0.7, 2.5));
    add(C.cuboid(1.15, 1.0, 1.0).setTranslation(0, 1.7, -0.7).setMass(400));
  },
  mesh(b, def, c, P) {
    b.rbox(2.0, 1.2, 4.2, 0.2, c, [0, 0.1, 0.3]);                                       // engine hood
    b.rbox(2.3, 2.0, 2.0, 0.2, c, [0, 1.7, -0.7]);                                       // cab
    P.glass.box(2.1, 1.3, 0.05, 0, [0, 1.9, 0.32]); P.glass.box(2.1, 1.3, 0.05, 0, [0, 1.9, -1.72]);
    for (const s of [-1, 1]) P.glass.box(0.05, 1.3, 1.8, 0, [s * 1.16, 1.9, -0.7]);
    b.box(2.5, 0.12, 2.3, 0x222228, [0, 2.76, -0.7]);
    b.box(2.2, 0.9, 0.5, DARK, [0, -0.1, 2.75]);                                         // front weights
    for (let k = -2; k <= 2; k++) b.box(0.35, 0.7, 0.3, 0x444a52, [k * 0.42, -0.05, 3.1]);
    b.cyl(0.12, 0.12, 1.6, 0x333333, [0.7, 1.6, 1.4], null, 8);                          // exhaust stack
    b.rbox(2.4, 0.2, 0.9, 0.06, 0x333333, [0, -0.2, -2.6]);                              // hitch
  },
});

registerVehicle('sprayer', {
  mass: 6000, half: [1.1, 0.6, 2.8],
  axles: [axle(1.9, 1.45, -0.6, 0.95, 0.35, 1, 0.5, { wide: 0.35 }), axle(-1.9, 1.45, -0.6, 0.95, 0.35, 0, 0.5, { hand: true, wide: 0.35 })],
  accel: 5, maxSpeed: 14, rev: 5, brakeDecel: 9, steer: 0.55, grip: 1.4,
  susp: { k: 15, c: 1.5 }, com: [0, -0.3, 0],
  seats: [{ pos: [0, 1.45, 1.9], kind: 'driver' }],
  camH: 4.0, camDist: 15, horn: 'tractor', voice: 'bus', lights: { head: [0.8, 2.85] },
  colliders(add, C) {
    add(C.cuboid(1.1, 0.6, 2.8));
    add(C.cuboid(1.0, 0.9, 0.9).setTranslation(0, 1.5, 1.9).setMass(300));
  },
  mesh(b, def, c, P) {
    b.rbox(2.2, 1.2, 5.6, 0.15, c, [0, 0, 0]);
    b.rbox(2.0, 1.8, 1.8, 0.18, c, [0, 1.5, 1.9]);
    P.glass.box(1.85, 1.2, 0.05, 0, [0, 1.65, 2.82]);
    for (const s of [-1, 1]) P.glass.box(0.05, 1.1, 1.6, 0, [s * 1.01, 1.65, 1.9]);
    b.cyl(1.05, 1.05, 3.0, 0xf2f2f2, [0, 1.3, -1.1], [Math.PI / 2, 0, 0], 16);              // tank
    // booms folded out to the sides at the back, with spray nozzles
    for (const s of [-1, 1]) {
      b.box(8.0, 0.12, 0.12, DARK, [s * 5.1, 0.6, -2.9]);
      b.box(8.0, 0.08, 0.08, DARK, [s * 5.1, 1.2, -2.9], [0, 0, s * 0.07]);
      for (let k = 1.4; k < 9; k += 0.8) b.cone(0.05, 0.14, 0x3f8cff, [s * k, 0.48, -2.9], [Math.PI, 0, 0], 4);
    }
  },
});

// Park the machines in the shed and make the combine harvest: every step, wheat under its
// header is cut to stubble, a bale drops behind it every so often, and cut wheat regrows.
function machines(game, wheat) {
  const park = [['combine', -219, 38, Math.PI, 0x3fae5a], ['bigtractor', -207, 37, Math.PI, 0x2f8a3a], ['sprayer', -199, 38, Math.PI, 0xffa23a]];
  const made = park.map(([type, x, z, yaw, col]) => { const v = new Vehicle(game, type, x, 1.8, z, yaw, col); game.vehicles.push(v); return v; });
  // the old little tractor gets a friend in the yard
  game.vehicles.push(new Vehicle(game, 'tractor', -222, 1.0, 58, Math.PI / 2, 0xd9483f));
  const combine = made[0];
  const pool = [];
  let cutCount = 0;
  const W = WHEAT, f = wheat, step = W.step;
  const fwd = new THREE.Vector3(), side = new THREE.Vector3(), q = new THREE.Quaternion();
  let regrowT = 0;
  game.steppers.push(game.whenNear((W.x0 + W.x1) / 2, (W.z0 + W.z1) / 2, 160, () => {
    const now = game.physics.time;
    // reel turns with ground speed
    if (combine.reel) combine.reel.rotation.x += Math.max(0.6, Math.abs(combine.speed) * 0.8) * DT * (combine.seats.some((s) => s.occupant) ? 1 : 0);
    // cutting
    const t = combine.body.translation();
    if (t.x > W.x0 - 8 && t.x < W.x1 + 8 && t.z > W.z0 - 8 && t.z < W.z1 + 8 && Math.abs(combine.speed) > 0.3) {
      const r = combine.body.rotation(); q.set(r.x, r.y, r.z, r.w);
      fwd.set(0, 0, 1).applyQuaternion(q); side.set(1, 0, 0).applyQuaternion(q);
      const hd = combine.def.header;
      for (let s = -hd.w / 2; s <= hd.w / 2; s += step * 0.6) {
        for (const ahead of [hd.z - 0.4, hd.z + 0.4]) {
          const px = t.x + fwd.x * ahead + side.x * s, pz = t.z + fwd.z * ahead + side.z * s;
          const i = Math.floor((px - W.x0) / step), j = Math.floor((pz - W.z0) / step);
          if (i < 0 || j < 0 || i >= f.nx || j >= f.nz) continue;
          const k = j * f.nx + i;
          if (f.grow[k] > 0.5) { f.setGrow(k, 0.12); f.cutAt[k] = now; cutCount++; }
        }
      }
      if (cutCount >= 70) { // a bale out of the back
        cutCount = 0;
        const bx = t.x - fwd.x * 4.4, bz = t.z - fwd.z * 4.4, by = t.y + 0.2;
        let o = pool.length < 10 ? null : pool.shift();
        if (!o) o = bale(game, bx, bz);
        o.body.setTranslation({ x: bx, y: by, z: bz }, true);
        o.body.setLinvel({ x: -fwd.x * 1.5, y: 0, z: -fwd.z * 1.5 }, true);
        o.body.setRotation({ x: 0, y: Math.sin(combine.yaw() / 2 + 0.785), z: 0, w: Math.cos(combine.yaw() / 2 + 0.785) }, true);
        if (o.rec) o.rec.snap = true;
        pool.push(o);
        game.audio?.play('thud', { x: bx, y: by, z: bz }, 0.6);
      }
    }
    // regrowth: once a second, stubble older than 100 s grows back over ~10 s
    if ((regrowT += DT) > 1) {
      regrowT = 0;
      for (let k = 0; k < f.n; k++) {
        if (f.cutAt[k] < 0) continue;
        const age = now - f.cutAt[k];
        if (age > 100) { const g = Math.min(1, 0.12 + (age - 100) / 10); f.setGrow(k, g); if (g >= 1) f.cutAt[k] = -1; }
      }
    }
  }));
  game.wheat = wheat;
}
