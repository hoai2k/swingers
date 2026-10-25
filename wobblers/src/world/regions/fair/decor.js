// Fairground scenery: the entrance arch, fence, midway string lights and
// lamps, food / prize stalls, benches and hay-bale seats, maple trees in fall
// colours, an apple orchard on the hill, pumpkins (a patch with a scarecrow,
// loose ones to kick about), hay bales, corn, leaf piles, the dock path and
// welcome sign, coins; plus falling leaves (one Points cloud that follows
// the players while they are at the fair).
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder, signMesh } from '../../../mesh.js';
import { FAIR, MIDWAY, DOCK, HILL, PATCH, ORCHARD, RIDES, CENTRE } from './layout.js';
import { BULB, BULB2, AUTUMN, kitStrut, strut, rb, ball, template, stamp } from './common.js';

const Y = FAIR.y;
const LEAVES = [0xe8742a, 0xd8452a, 0xf2b631, 0xc8602a, 0xb83a24, 0xf0c040];

// tree / pumpkin templates (made on first use, stamped many times)
let TPL = null;
function templates() {
  if (TPL) return TPL;
  const tree = (cols, apple) => template((b) => {
    b.cyl(0.22, 0.34, 2.6, 0x6b4426, [0, 1.3, 0], null, 6);
    b.sphere(1.9, cols[0], [0, 3.9, 0], [1, 0.85, 1], 8);
    b.sphere(1.3, cols[1], [1.1, 3.3, 0.5], null, 7);
    b.sphere(1.3, cols[2], [-1.0, 3.5, -0.6], null, 7);
    b.sphere(1.1, cols[3], [0.2, 4.9, -0.3], null, 7);
    if (apple) for (let i = 0; i < 6; i++) { const a = i * 1.1; b.sphere(0.16, 0xd8321e, [Math.sin(a) * 1.6, 3.2 + (i % 3) * 0.6, Math.cos(a) * 1.6], null, 6); }
  });
  const pk = (c) => template((b) => {
    b.sphere(1, c, [0, 0.3, 0], [0.42, 0.3, 0.42], 9);
    b.add(new THREE.SphereGeometry(1, 9, 6), c, [0, 0.3, 0], [0, 0.6, 0], [0.3, 0.31, 0.44]);
    b.cyl(0.04, 0.06, 0.18, 0x5a7a2a, [0, 0.62, 0], [0.2, 0, 0.15], 5);
  });
  TPL = {
    maples: [0, 1, 2, 3, 4, 5].map((k) => tree([0, 1, 2, 3].map((i) => LEAVES[(k * 3 + i * 2) % LEAVES.length]))),
    apples: [tree([0x86a446, 0x9cb04a, 0x7a9a3e, 0x86a446], true), tree([0x9cb04a, 0x7a9a3e, 0x86a446, 0x9cb04a], true)],
    pumpkin: pk(0xe8742a), white: pk(0xf2e6c4),
  };
  return TPL;
}

// A maple (round clumps in fall colours) or an apple tree; collider like kit.tree.
export function mapleTree(kit, x, z, y, s = 1, seed = 0, apple = false) {
  const T = templates(), list = apple ? T.apples : T.maples;
  stamp(kit.b(x, z), list[Math.abs(Math.floor(seed * 7)) % list.length], x, y, z, s, seed);
  kit.phys.cylinder(x, y + 1.5 * s, z, 0.3 * s, 3 * s, {});
}

function pumpkin(b, x, y, z, s = 1, c = 0xe8742a) {
  const T = templates();
  stamp(b, c === 0xf2e6c4 ? T.white : T.pumpkin, x, y, z, s, x * 1.7);
}

function hayBale(kit, x, y, z, yaw = 0, seatable = false, game = null) {
  rb(kit.b(x, z), 1.6, 0.84, 0.9, 0.08, 0xe2c25e, [x, y + 0.42, z], [0, yaw, 0]);
  kit.phys.box(x, y + 0.42, z, 1.6, 0.84, 0.9, { yaw });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const o of [-0.4, 0.4]) kit.deco(x + c * o, y + 0.42, z - s * o, 0.06, 0.86, 0.92, 0xb8962e, { yaw });
  if (seatable) for (const lx of [-0.4, 0.4]) game.seats.push({ body: game.physics.staticBody, pos: [x + c * lx, y + 1.03, z - s * lx], yaw, kind: 'passenger', label: 'Sit', hint: 'Y Get up', exit: [x + c * lx + s * 0.9, y + 0.5, z - s * lx + c * 0.9], occupant: null });
}

export function buildDecor(game, kit, R, F) {
  const rng = R.rng(77);
  const G = (x, z) => R.groundAt(x, z);
  const DT = F.decorTimes = {}; let t0 = performance.now(), cur = 'start';
  const mark = (n) => { const t = performance.now(); DT[cur] = Math.round(t - t0); t0 = t; cur = n; };
  mark('entrance');
  // ---- entrance arch -----------------------------------------------------------------
  const ax = FAIR.x0, az = MIDWAY.z;
  for (const k of [-1, 1]) {
    const tz = az + k * 7.5;
    kit.cyl(ax, Y + 4.5, tz, 1.0, 9, 0xe8742a, { seg: 14 });
    for (let i = 0; i < 5; i++) rb(kit.b(ax, tz), 2.1, 0.35, 2.1, 0.1, i % 2 ? 0xf6ead0 : 0x9c3a1e, [ax, Y + 0.9 + i * 1.8, tz]);
    const pb = kit.b(ax, tz);
    pumpkin(pb, ax, Y + 9, tz, 2.2);
    for (const dx of [-1.6, 1.6]) for (const dz of [-1.6, 1.6]) hayBale(kit, ax - 1.5 + dx * 0.4 - 2, Y, tz + dz * 0.6, Math.PI / 2);
  }
  kit.box(ax, Y + 8.2, az, 1.2, 2.2, 14.2, 0x9c3a1e, { collide: false });
  const sgn = signMesh('STRATFORD FALL FAIR', 13, '#e8742a', '#fff6d8');
  sgn.position.set(ax - 0.62, Y + 8.2, az); sgn.rotation.y = -Math.PI / 2; game.scene.add(sgn);
  const sgn2 = signMesh('STRATFORD FALL FAIR', 13, '#e8742a', '#fff6d8');
  sgn2.position.set(ax + 0.62, Y + 8.2, az); sgn2.rotation.y = Math.PI / 2; game.scene.add(sgn2);
  for (let i = 0; i < 15; i++) kit.sphere(ax - 0.7, Y + 9.45, az - 7 + i, 0.14, i % 2 ? BULB : BULB2, { seg: 6 });
  // leaf-garland bunting along the arch
  { const b = kit.b(ax, az); for (let i = 0; i < 12; i++) b.cone(0.35, 0.6, AUTUMN[i % AUTUMN.length], [ax - 0.7, Y + 6.9 - Math.sin(i / 11 * Math.PI) * 0.4, az - 5.5 + i], [Math.PI, 0, 0], 3); }

  mark('fence');
  // ---- fence (gaps at the arch and the east gate to the pumpkin patch) -----------------
  const fc = 0x8a5a36, fy = Y;
  kit.fence(FAIR.x0 - 1, FAIR.z0, FAIR.x0 - 1, az - 8, fc, 1.3, fy);
  kit.fence(FAIR.x0 - 1, az + 8, FAIR.x0 - 1, FAIR.z1, fc, 1.3, fy);
  kit.fence(FAIR.x0 - 1, FAIR.z0, FAIR.x1 + 1, FAIR.z0, fc, 1.3, fy);
  kit.fence(FAIR.x0 - 1, FAIR.z1, FAIR.x1 + 1, FAIR.z1, fc, 1.3, fy);
  kit.fence(FAIR.x1 + 1, FAIR.z0, FAIR.x1 + 1, az - 5, fc, 1.3, fy);
  kit.fence(FAIR.x1 + 1, az + 5, FAIR.x1 + 1, FAIR.z1, fc, 1.3, fy);
  for (const k of [-1, 1]) { kit.cyl(FAIR.x1 + 1, Y + 1.4, az + k * 5, 0.25, 2.8, fc, { seg: 8 }); pumpkin(kit.b(FAIR.x1, az), FAIR.x1 + 1, Y + 2.8, az + k * 5, 0.9); }

  mark('midway');
  // ---- midway: string lights on posts, lamps, benches, hay-bale seats ------------------
  const lb = kit.b(CENTRE.x, az);
  for (let x = FAIR.x0 + 10; x < FAIR.x1 - 4; x += 15) {
    for (const k of [-1, 1]) kit.cyl(x, Y + 2.8, az + k * 7, 0.1, 5.6, 0x5a3a24, { seg: 6 });
    let prev = null;
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, zz = az - 7 + 14 * u, yy = Y + 5.5 - Math.sin(u * Math.PI) * 0.9;
      ball(lb, 0.09, i % 3 === 0 ? BULB2 : BULB, [x, yy - 0.08, zz]);
      if (prev) strut(lb, prev, [x, yy, zz], 0.018, 0x2a2a2a, 3);
      prev = [x, yy, zz];
      if (i < 12) lb.cone(0.25, 0.42, AUTUMN[(i + x) % AUTUMN.length], [x, yy - 0.3, zz + 0.58], [Math.PI, 0, 0], 3);
    }
    // a string of lights along the midway edge to the next post
    for (const k of [-1, 1]) {
      let pv = [x, Y + 5.4, az + k * 7];
      for (let i = 1; i <= 10; i++) {
        const q = [x + i * 1.5, Y + 5.4 - Math.sin(i / 10 * Math.PI) * 0.6, az + k * 7];
        strut(lb, pv, q, 0.015, 0x2a2a2a, 3);
        if (i < 10) ball(lb, 0.075, BULB, [q[0], q[1] - 0.07, q[2]], 5);
        pv = q;
      }
    }
  }
  for (let x = FAIR.x0 + 25; x < FAIR.x1 - 8; x += 30) for (const k of [-1, 1]) kit.lamp(x, az + k * 8.2, Y);
  for (let i = 0; i < 8; i++) {
    const x = FAIR.x0 + 40 + i * 31, k = i % 2 ? 1 : -1;
    kit.bench(x, az + k * 8.5, k > 0 ? Math.PI : 0, Y);
    hayBale(kit, x + 6, Y, az + k * 9, k > 0 ? Math.PI : 0, true, game);
  }

  mark('stalls');
  // ---- stalls (stand-in art words that already exist) ------------------------------------
  const STALLS = [[742, 1, 'TICKETS', '#55a84a'], [790, 1, 'CANDY', '#ff7fc8'], [866, 1, 'HOT DOGS', '#ff5a3c'], [940, 1, 'DRINKS', '#3f8cff'],
    [752, -1, 'PRIZES', '#b46cff'], [796, -1, 'DRINKS', '#3f8cff'], [870, -1, 'CANDY', '#ff7fc8'], [946, -1, 'HOT DOGS', '#ff5a3c']];
  for (const [x, k, name, col] of STALLS) {
    const z = az - k * 14, yaw = k > 0 ? 0 : Math.PI, f = k; // faces the midway
    kit.box(x, Y + 1.1, z, 4, 2.2, 3, 0xf6ead0, { yaw });
    const c = new THREE.Color(col).getHex();
    for (let i = 0; i < 5; i++) kit.deco(x - 1.6 + i * 0.8, Y + 2.9, z + f * 1.9, 0.8, 0.1, 1.6, i % 2 ? 0xffffff : c, { euler: [f * 0.3, 0, 0] });
    kit.deco(x, Y + 3.3, z, 4.2, 0.2, 3.2, c);
    kit.deco(x, Y + 1.15, z + f * 1.55, 3.6, 0.12, 0.5, 0x8a5a36);
    pumpkin(kit.b(x, z), x - 1.2, Y + 1.21, z + f * 1.55, 0.45);
    pumpkin(kit.b(x, z), x + 2.6, Y, z + f * 1.0, 0.7);
    R.sign(name, x, Y + 3.0, z + f * 1.62, yaw, 3.8, col);
  }

  mark('pumpkins');
  // ---- pumpkins and hay round the rides and the midway -------------------------------------
  for (let i = 0; i < 50; i++) {
    const x = FAIR.x0 + 6 + rng() * (FAIR.x1 - FAIR.x0 - 12), k = rng() < 0.5 ? -1 : 1, z = az + k * (7.6 + rng() * 1.2);
    if (Math.abs(x - FAIR.x0) < 12) continue;
    pumpkin(kit.b(x, z), x, Y, z, 0.5 + rng() * 0.6, rng() < 0.15 ? 0xf2e6c4 : 0xe8742a);
  }
  // a climbable hay-bale pyramid with coins on top
  { const px = 830, pz = az + 13.5;
    for (let l = 0; l < 3; l++) for (let i = 0; i < 3 - l; i++) hayBale(kit, px - (2 - l) * 0.85 + i * 1.7, Y + l * 0.84, pz, 0);
    R.coins(px, pz, Y + 6, 'one', 1, 0); }
  // leaf piles to jump into (no collider) by the trees inside the fence
  for (let i = 0; i < 10; i++) {
    const x = FAIR.x0 + 20 + i * 27 + rng() * 6, z = i % 2 ? FAIR.z0 + 3.5 : FAIR.z1 - 3.5;
    const b = kit.b(x, z);
    for (let k = 0; k < 4; k++) b.sphere(0.9 + rng() * 0.4, LEAVES[(i + k) % LEAVES.length], [x + (rng() - 0.5) * 1.6, Y + 0.05, z + (rng() - 0.5) * 1.6], [1.2, 0.35, 1], 7);
  }

  mark('trees');
  // ---- trees: maples round the fair and across the island, an orchard on the hill -----
  const insideFair = (x, z, m) => x > FAIR.x0 - m && x < FAIR.x1 + m && z > FAIR.z0 - m && z < FAIR.z1 + m;
  const onPath = (x, z) => x < FAIR.x0 + 2 && x > DOCK.x - 45 && Math.abs(z - (DOCK.z + (x - DOCK.x) / (FAIR.x0 - DOCK.x) * (MIDWAY.z - DOCK.z))) < 7;
  let n = 0;
  for (let t = 0; t < 900 && n < 120; t++) {
    const x = 560 + rng() * 580, z = -1090 + rng() * 480;
    if (insideFair(x, z, 3) || onPath(x, z)) continue;
    if (Math.hypot(x - PATCH.x, z - PATCH.z) < PATCH.r + 4 || Math.hypot(x - ORCHARD.x, z - ORCHARD.z) < 30) continue;
    const h = G(x, z);
    if (h < 2.4) continue;
    if (rng() < 0.15) R.tree(x, z, 1, 0.8 + rng() * 0.4);
    else mapleTree(kit, x, z, h - 0.1, 0.8 + rng() * 0.5, rng() * 9);
    n++;
  }
  // inside the fence corners
  for (const [x, z] of [[704, -940], [704, -750], [980, -940], [980, -750], [760, -940], [880, -941], [820, -750], [905, -749]]) mapleTree(kit, x, z, Y - 0.1, 1.1, x * 0.1);
  // apple orchard rows on the hill + a cider barrel stand
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const x = ORCHARD.x - 24 + c * 12 + (r % 2) * 5, z = ORCHARD.z - 18 + r * 11;
    mapleTree(kit, x, z, G(x, z) - 0.1, 0.9, r * 5 + c, true);
  }
  { const x = ORCHARD.x + 2, z = ORCHARD.z + 26, h = G(x, z);
    for (const dx of [-0.8, 0.8]) kit.cyl(x + dx, h + 0.55, z, 0.5, 1.1, 0x8a5a36, { seg: 10 });
    kit.box(x, h + 1.15, z, 2.6, 0.12, 1.2, 0x6b4426); }

  mark('pumpkin');
  // ---- pumpkin patch with a scarecrow, corn rows and a few loose pumpkins -----------------
  { const px = PATCH.x, pz = PATCH.z, b = kit.b(px, pz);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
      const x = px - 14 + c * 4 + (r % 2) * 1.5, z = pz - 12 + r * 4.5, h = G(x, z);
      b.box(3.6, 0.08, 0.3, 0x5a7a2a, [x + 1.5, h + 0.04, z]);
      pumpkin(b, x, h, z, 0.55 + ((r * 3 + c * 5) % 4) * 0.15, (r + c) % 7 ? 0xe8742a : 0xf2e6c4);
    }
    const sx = px, sz = pz + 2, sh = G(sx, sz);
    kit.cyl(sx, sh + 1.2, sz, 0.08, 2.4, 0x6b4426, { seg: 6 });
    kit.deco(sx, sh + 1.8, sz, 1.8, 0.1, 0.1, 0x6b4426);
    rb(b, 0.7, 0.8, 0.4, 0.15, 0x3c6aa8, [sx, sh + 1.55, sz]);
    b.box(1.6, 0.18, 0.2, 0xc8402a, [sx, sh + 1.82, sz]);
    b.sphere(0.32, 0xe2c25e, [sx, sh + 2.3, sz]);
    b.cone(0.55, 0.5, 0x8a6a3a, [sx, sh + 2.65, sz], null, 10);
    b.cyl(0.6, 0.6, 0.04, 0x8a6a3a, [sx, sh + 2.42, sz], null, 12);
    for (let i = 0; i < 6; i++) b.box(0.05, 0.3, 0.05, 0xe2c25e, [sx + (i < 3 ? -0.85 : 0.85), sh + 1.72, sz + (i % 3 - 1) * 0.06], [0, 0, (i < 3 ? 1 : -1) * 0.6]);
    // corn rows behind the patch
    for (let r = 0; r < 3; r++) for (let c = 0; c < 18; c++) {
      const x = px - 18 + c * 2.1, z = pz - 18 - r * 1.6, h = G(x, z);
      b.cyl(0.04, 0.05, 2.2, 0xc8a84a, [x, h + 1.1, z], null, 4);
      b.box(0.5, 0.05, 0.12, 0x9a9a3a, [x + 0.2, h + 1.3, z], [0, c, 0.5]);
      b.capsule(0.07, 0.25, 0xf2c14a, [x + 0.08, h + 1.7, z]);
    }
    // a few you can kick and throw about
    for (let i = 0; i < 7; i++) {
      const x = px - 8 + i * 2.6, z = pz + 9 + (i % 2) * 1.5, h = G(x, z);
      const pbld = new Builder();
      pumpkin(pbld, 0, -0.3, 0, 0.9);
      const o = game.physics.dynamic({ x, y: h + 0.35, z }, [RAPIER.ColliderDesc.ball(0.38).setMass(6)], pbld.mesh(), { angDamp: 0.8 });
      game.scene.add(o.mesh);
      R.common.throwable(game, o);
      o.body.sleep();
    }
  }
  R.coins(PATCH.x, PATCH.z, G(PATCH.x, PATCH.z) + 4, 'ring', 8, 9);
  R.coins(RIDES.ferris.x, MIDWAY.z, Y + 3, 'line', 8, 40, { yaw: 0 });

  mark('the');
  // ---- the dock path, welcome sign, a gate of hay and pumpkins ---------------------------
  R.welcomeSign(DOCK.x + 14, DOCK.z - 6.5, -Math.PI / 2);
  for (let i = 0; i < 7; i++) {
    const u = i / 6, x = DOCK.x + 6 + u * (FAIR.x0 - DOCK.x - 12), z = DOCK.z + (x - DOCK.x) / (FAIR.x0 - DOCK.x) * (MIDWAY.z - DOCK.z);
    for (const k of [-1, 1]) { const zz = z + k * 4.2; pumpkin(kit.b(x, zz), x, G(x, zz), zz, 0.6 + (i % 3) * 0.15); }
    if (i % 2 === 0) kit.lamp(x, z + 4.6, G(x, z + 4.6));
  }
  mark('end');
}

// ---- falling leaves ---------------------------------------------------------------------------
export function buildLeaves(game, F) {
  const N = 420, BOX = 64, HGT = 16;
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(16, 2); g.bezierCurveTo(30, 10, 28, 24, 16, 30); g.bezierCurveTo(4, 24, 2, 10, 16, 2); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sp = new Float32Array(N * 3);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * BOX; pos[i * 3 + 1] = Math.random() * HGT; pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    c.set(LEAVES[i % LEAVES.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    sp[i * 3] = 0.5 + Math.random() * 0.7; sp[i * 3 + 1] = Math.random() * 6.28; sp[i * 3 + 2] = 0.6 + Math.random() * 1.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.45, map: tex, vertexColors: true, alphaTest: 0.5, transparent: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.userData.noCull = true;
  pts.visible = false;
  game.scene.add(pts);
  const ctr = new THREE.Vector3();
  let t = 0, placed = false;
  game.updaters.push((dt) => {
    pts.visible = F.active;
    if (!F.active) return;
    // the cloud stays round the players (their average position) while they are on the island
    ctr.set(0, 0, 0);
    let n = 0;
    for (const p of game.players) { const q = p.chest.translation(); if (Math.hypot(q.x - CENTRE.x, q.z - CENTRE.z) < 260) { ctr.x += q.x; ctr.z += q.z; n++; } }
    if (!n) { pts.visible = false; return; }
    ctr.x /= n; ctr.z /= n;
    if (!placed) { placed = true; for (let i = 0; i < N; i++) { pos[i * 3] += ctr.x; pos[i * 3 + 1] += FAIR.y; pos[i * 3 + 2] += ctr.z; } }
    mat.color.setScalar(0.3 + 0.7 * (game.dayLight ?? 1));
    t += dt;
    const wind = 0.5 + 0.3 * Math.sin(t * 0.13);
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      // leaves keep their world position (walking doesn't drag them); ones that leave the box
      // round the players come back in on the other side, ones that land start again up top
      let x = pos[k] + (Math.sin(t * sp[k + 2] + sp[k + 1]) * 0.9 + wind) * dt, y = pos[k + 1] - sp[k] * dt, z = pos[k + 2] + Math.cos(t * sp[k + 2] * 0.7 + sp[k + 1]) * 0.6 * dt;
      if (x - ctr.x > BOX / 2) x -= BOX; else if (x - ctr.x < -BOX / 2) x += BOX;
      if (z - ctr.z > BOX / 2) z -= BOX; else if (z - ctr.z < -BOX / 2) z += BOX;
      if (y < FAIR.y) y += HGT;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  });
}
