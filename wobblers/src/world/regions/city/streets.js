// Bigtown streets: kerbed pavements (one slab per block), lane markings,
// zebra crossings, traffic lights that actually cycle, street lamps, trees,
// hydrants and bus stops.
import * as THREE from 'three';
import { Builder } from '../../../mesh.js';
import { AVES, STREETS, BLOCKS, RW, Y, KERB, SW, intersections } from './layout.js';

const PAVE = 0xc9c4ba, KERBC = 0xa8a49c, LINE = 0xf4f4f4, YELLOW = 0xffd23f;
const M = Y + 0.025; // markings sit just above the asphalt

export function buildStreets(game, kit, R) {
  const Q = kit.cityQ;
  // ---- pavements: a kerbed slab per block
  for (const [x0, x1, z0, z1, kind] of BLOCKS) {
    if (kind === 'stadium' || kind === 'construction') { // their own ground, still kerbed
      kit.box((x0 + x1) / 2, Y + KERB / 2, (z0 + z1) / 2, x1 - x0, KERB, z1 - z0, KERBC);
      continue;
    }
    kit.box((x0 + x1) / 2, Y + KERB / 2, (z0 + z1) / 2, x1 - x0, KERB, z1 - z0, PAVE);
    // kerb edge stripe
    kit.deco((x0 + x1) / 2, Y + KERB - 0.02, z0 + 0.15, x1 - x0, 0.06, 0.3, KERBC);
    kit.deco((x0 + x1) / 2, Y + KERB - 0.02, z1 - 0.15, x1 - x0, 0.06, 0.3, KERBC);
    kit.deco(x0 + 0.15, Y + KERB - 0.02, (z0 + z1) / 2, 0.3, 0.06, z1 - z0, KERBC);
    kit.deco(x1 - 0.15, Y + KERB - 0.02, (z0 + z1) / 2, 0.3, 0.06, z1 - z0, KERBC);
  }
  const X = intersections();
  const nearX = (x, z) => X.some((i) => Math.abs(i.x - x) < RW + 1 && Math.abs(i.z - z) < RW + 1);
  // ---- lane markings: double yellow on avenues, dashed white on streets
  for (const [ax, z0, z1] of AVES) {
    let a = z0;
    const stops = X.filter((i) => i.x === ax).map((i) => i.z).sort((p, q) => p - q);
    for (const sz of [...stops, z1 + RW]) {
      const b = sz - RW - 4;
      if (b - a > 2) for (const o of [-0.18, 0.18]) Q.floor(ax + o, M, (a + b) / 2, 0.14, b - a, YELLOW);
      a = sz + RW + 4;
    }
  }
  for (const [sz, x0, x1] of STREETS) {
    for (let x = x0 + 3; x < x1 - 3; x += 7) if (!nearX(x, sz) && !nearX(x + 3.5, sz)) Q.floor(x + 1.75, M, sz, 3.5, 0.18, LINE);
  }
  // ---- zebra crossings + stop lines on every arm of every intersection
  for (const i of X) {
    for (const [arm, dx, dz] of [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]]) {
      if (!i[arm]) continue;
      const cx = i.x + dx * (RW + 2.2), cz = i.z + dz * (RW + 2.2);
      for (let k = -4; k <= 4; k++) {
        if (dx) Q.floor(cx, M, i.z + k * 1.25, 3.2, 0.6, LINE);
        else Q.floor(i.x + k * 1.25, M, cz, 0.6, 3.2, LINE);
      }
      const sx = i.x + dx * (RW + 4.2), szz = i.z + dz * (RW + 4.2);
      if (dx) Q.floor(sx, M, i.z - dx * RW / 2, 0.35, RW, LINE);
      else Q.floor(i.x + dz * RW / 2, M, szz, RW, 0.35, LINE);
    }
  }
  trafficLights(game, kit, X);
  // ---- street lamps and trees along the avenues and streets (on the pavement edge)
  const onBlock = (x, z) => BLOCKS.find(([x0, x1, z0, z1]) => x > x0 + 0.5 && x < x1 - 0.5 && z > z0 + 0.5 && z < z1 - 0.5);
  const lampAt = (x, z) => { const b = onBlock(x, z); if (b && !['stadium', 'construction', 'plaza'].includes(b[4])) kit.lamp(x, z, SW); };
  for (const [ax, z0, z1] of AVES) for (let z = z0 + 14; z < z1 - 8; z += 32) for (const s of [-1, 1]) lampAt(ax + s * (RW + 1.2), z + (s > 0 ? 16 : 0));
  for (const [sz, x0, x1] of STREETS) for (let x = x0 + 14; x < x1 - 8; x += 32) for (const s of [-1, 1]) lampAt(x + (s > 0 ? 16 : 0), sz + s * (RW + 1.2));
  // street trees in little square planters on the greener streets (Market St, Bridge St, Seaside Rd)
  for (const sz of [118, 180, 236]) {
    const st = STREETS.find((s) => s[0] === sz);
    for (let x = st[1] + 20; x < st[2] - 10; x += 16) for (const s of [-1, 1]) {
      const tx = x + 8 * (s > 0), tz = sz + s * (RW + 1.8);
      const b = onBlock(tx, tz);
      if (!b || nearX(tx, sz) || b[4] === 'landing') continue;
      kit.box(tx, SW + 0.2, tz, 1.6, 0.4, 1.6, 0x8a8a84);
      kit.deco(tx, SW + 0.41, tz, 1.4, 0.02, 1.4, 0x6b4a2a);
      kit.tree(tx, tz, SW + 0.3, 0, 0.75);
    }
  }
  // hydrants at some corners
  for (const i of X) if ((i.x + i.z) % 3 === 0) {
    const hx = i.x + RW + 1.4, hz = i.z + RW + 3;
    if (!onBlock(hx, hz)) continue;
    kit.cyl(hx, SW + 0.4, hz, 0.18, 0.8, 0xe8322b, { seg: 8 });
    kit.sphere(hx, SW + 0.82, hz, 0.19, 0xe8322b, { seg: 8 });
    kit.deco(hx, SW + 0.5, hz, 0.55, 0.12, 0.12, 0xd02a22);
  }
}

// One pole per corner pair; lamps go into six shared meshes (N-S / E-W x red, amber, green)
// whose colours a cycle animates: 9 s green, 2 s amber, then red while the other way goes.
function trafficLights(game, kit, X) {
  const lamps = { ns: [new Builder(), new Builder(), new Builder()], ew: [new Builder(), new Builder(), new Builder()] };
  const head = (px, pz, y, fx, fz, dir) => {
    // housing facing (fx, fz)
    const yaw = Math.atan2(fx, fz);
    kit.deco(px, y, pz, 0.45, 1.35, 0.35, 0x2a2e36, { yaw });
    kit.deco(px + fx * 0.2, y + 0.72, pz + fz * 0.2, 0.5, 0.06, 0.25, 0x2a2e36, { yaw });
    for (let k = 0; k < 3; k++) lamps[dir][k].sphere(0.14, 0xffffff, [px + fx * 0.19, y + 0.4 - k * 0.4, pz + fz * 0.19], [1, 1, 1], 8);
  };
  game.cityCrossings = [];
  for (const i of X) {
    if ([i.n, i.s, i.w, i.e].filter(Boolean).length < 3) continue; // corners and bends need no lights
    game.cityCrossings.push(i);
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const px = i.x + sx * (RW + 1.0), pz = i.z + sz * (RW + 1.0);
      kit.cyl(px, SW + 2.6, pz, 0.12, 5.2, 0x3a3f48, { seg: 8 });
      // arm over the road along x (for traffic on the avenue) and along z (for the street)
      kit.deco(px - sx * 2.5, SW + 5.0, pz, 5, 0.14, 0.14, 0x3a3f48);
      kit.deco(px, SW + 5.0, pz - sz * 2.5, 0.14, 0.14, 5, 0x3a3f48);
      // avenue traffic (moving along z) sees heads facing +-z; street traffic faces +-x
      head(px - sx * 4.2, pz, SW + 4.2, 0, sz, 'ns');
      head(px, pz - sz * 4.2, SW + 4.2, sx, 0, 'ew');
      // a pedestrian button box on the pole
      kit.deco(px, SW + 1.1, pz - sz * 0.15, 0.2, 0.3, 0.12, 0xffd23f);
    }
  }
  const OFF = [0x3a1010, 0x3a2a08, 0x0a3010], ON = [0xff3030, 0xffb020, 0x30ff60];
  const mats = { ns: [], ew: [] };
  for (const dir of ['ns', 'ew']) for (let k = 0; k < 3; k++) {
    const g = lamps[dir][k].geometry();
    if (!g) continue;
    const m = new THREE.MeshBasicMaterial({ color: OFF[k] });
    mats[dir][k] = m;
    const mesh = new THREE.Mesh(g, m);
    mesh.userData.noCull = true;
    game.scene.add(mesh);
  }
  const CYCLE = 22;
  let last = -1;
  // phase: 0 ns green, 1 ns amber, 2 ew green, 3 ew amber (from the physics clock, so the
  // self-driving cars read the same lights the lamps show)
  const phase = () => { const t = game.physics.time % CYCLE; return t < 9 ? 0 : t < 11 ? 1 : t < 20 ? 2 : 3; };
  game.updaters.push(() => {
    const ph = phase();
    if (ph === last) return;
    last = ph;
    const set = (dir, k) => mats[dir].forEach((m, j) => m?.color.setHex(j === k ? ON[j] : OFF[j]));
    set('ns', ph === 0 ? 2 : ph === 1 ? 1 : 0);
    set('ew', ph === 2 ? 2 : ph === 3 ? 1 : 0);
  });
  game.cityLights = { phase, CYCLE };
}
