// Fairground scenery: the entrance arch over the avenue, fences, the midway
// (dirt path, string lights, lamps, benches and hay-bale seats), food / prize
// stalls, maple trees in fall colours, leaf litter and leaf piles, pumpkins (a
// patch with a scarecrow and corn outside the east fence, loose ones to kick
// about), hay bales, coins; plus falling leaves (one Points cloud that follows
// the players while they are at the fair).
import * as THREE from 'three';
import { RAPIER } from '../../physics.js';
import { Builder, signMesh } from '../../mesh.js';
import { FAIR, MIDWAY, AVENUE, ARCH, PATCH, CENTRE, RIDES, onAvenue } from './layout.js';
import { BULB, BULB2, AUTUMN, kitStrut, strut, rb, ball, template, stamp } from './common.js';

const Y = FAIR.y;
const LITTER = new THREE.CylinderGeometry(1, 1, 0.02, 7);
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
  const az = MIDWAY.z, W = AVENUE;
  const DT = F.decorTimes = {}; let t0 = performance.now(), cur = 'start';
  const mark = (n) => { const t = performance.now(); DT[cur] = Math.round(t - t0); t0 = t; cur = n; };
  mark('entrance');
  // ---- entrance arch over the avenue, just inside the ring road -----------------------------
  const ax = ARCH.x, azz = ARCH.z;
  for (const k of [-1, 1]) {
    const tx = ax + k * 7.6;
    kit.cyl(tx, Y + 4.5, azz, 1.0, 9, 0xe8742a, { seg: 14 });
    for (let i = 0; i < 5; i++) rb(kit.b(tx, azz), 2.1, 0.35, 2.1, 0.1, i % 2 ? 0xf6ead0 : 0x9c3a1e, [tx, Y + 0.9 + i * 1.8, azz]);
    pumpkin(kit.b(tx, azz), tx, Y + 9, azz, 2.2);
    for (const dx of [-0.8, 0.8]) for (const l of [0, 1]) hayBale(kit, tx + k * 2.4 + dx, Y + l * 0.84, azz + 1.6, 0);
  }
  kit.box(ax, Y + 8.2, azz, 14.4, 2.2, 1.2, 0x9c3a1e, { collide: false });
  for (const [dz, yaw] of [[-0.62, Math.PI], [0.62, 0]]) {
    const sg = signMesh('STRATFORD FALL FAIR', 13, '#e8742a', '#fff6d8');
    sg.position.set(ax, Y + 8.2, azz + dz); sg.rotation.y = yaw; game.scene.add(sg);
  }
  for (let i = 0; i < 15; i++) kit.sphere(ax - 7 + i, Y + 9.45, azz - 0.7, 0.14, i % 2 ? BULB : BULB2, { seg: 6 });
  { const b = kit.b(ax, azz); for (let i = 0; i < 12; i++) b.cone(0.35, 0.6, AUTUMN[i % AUTUMN.length], [ax - 5.5 + i, Y + 6.9 - Math.sin(i / 11 * Math.PI) * 0.4, azz - 0.7], [Math.PI, 0, 0], 3); }

  mark('fences');
  // ---- fences: one round each half, open to the avenue at the midway and by the arch ----------
  const fc = 0x8a5a36;
  for (const k of [-1, 1]) {
    const xo = k * FAIR.x1, xi = k * W;
    kit.fence(xo, FAIR.z0, xo, FAIR.z1, fc, 1.3, Y);
    kit.fence(xo, FAIR.z0, k * (W + 6), FAIR.z0, fc, 1.3, Y);
    kit.fence(xo, FAIR.z1, xi, FAIR.z1, fc, 1.3, Y);
    kit.fence(xi, FAIR.z0 + 8, xi, az - 7, fc, 1.3, Y);
    kit.fence(xi, az + 7, xi, FAIR.z1, fc, 1.3, Y);
  }
  // east gate to the pumpkin patch
  for (const k of [-1, 1]) { kit.cyl(FAIR.x1, Y + 1.4, az + k * 5, 0.25, 2.8, fc, { seg: 8 }); pumpkin(kit.b(FAIR.x1, az), FAIR.x1, Y + 2.8, az + k * 5, 0.9); }

  mark('midway');
  // ---- midway: dirt path, string lights on posts, lamps, benches, hay-bale seats ---------------
  for (const k of [-1, 1]) for (let x0 = W; x0 < FAIR.x1; x0 += 37) {
    const x1 = Math.min(FAIR.x1, x0 + 37);
    kit.deco(k * (x0 + x1) / 2, Y + 0.02, az, x1 - x0, 0.04, MIDWAY.w, 0xc9a374, { collide: false });
  }
  mark('lights');
  const lb = kit.b(CENTRE.x, az);
  // one string of bulbs and pennants across the midway, and one along its edge, made once and stamped
  const across = [0, 1].map((v) => template((t) => {
    let prev = null;
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, zz = -7 + 14 * u, yy = 5.5 - Math.sin(u * Math.PI) * 0.9;
      ball(t, 0.09, i % 3 === 0 ? BULB2 : BULB, [0, yy - 0.08, zz]);
      if (prev) strut(t, prev, [0, yy, zz], 0.018, 0x2a2a2a, 3);
      prev = [0, yy, zz];
      if (i < 12) t.cone(0.25, 0.42, AUTUMN[(i + v * 3) % AUTUMN.length], [0, yy - 0.3, zz + 0.58], [Math.PI, 0, 0], 3);
    }
  }));
  const along = template((t) => {
    let pv = [0, 5.4, 0];
    for (let i = 1; i <= 10; i++) {
      const q = [i * 1.5, 5.4 - Math.sin(i / 10 * Math.PI) * 0.6, 0];
      strut(t, pv, q, 0.015, 0x2a2a2a, 3);
      if (i < 10) ball(t, 0.075, BULB, [q[0], q[1] - 0.07, q[2]], 5);
      pv = q;
    }
  });
  let n = 0;
  for (let x = FAIR.x0 + 10; x < FAIR.x1 - 4; x += 15) {
    if (onAvenue(x, 1)) continue;
    for (const k of [-1, 1]) kit.cyl(x, Y + 2.8, az + k * 7, 0.1, 5.6, 0x5a3a24, { seg: 6 });
    stamp(lb, across[n++ % 2], x, Y, az);
    if (x + 15 >= FAIR.x1 - 4 || onAvenue(x + 15, 1)) continue;
    for (const k of [-1, 1]) stamp(lb, along, x, Y, az + k * 7);
  }
  mark('lamps');
  for (const x of [-100, -70, -40, 40, 70, 100]) for (const k of [-1, 1]) kit.lamp(x, az + k * 8.2, Y);
  mark('benches');
  [-110, -82, -52, -24, 24, 52, 82, 110].forEach((x, i) => {
    const k = i % 2 ? 1 : -1;
    kit.bench(x, az + k * 8.5, k > 0 ? Math.PI : 0, Y);
    hayBale(kit, x + 6, Y, az + k * 9, k > 0 ? Math.PI : 0, true, game);
  });

  mark('stalls');
  // ---- stalls (stand-in art words that already exist) ------------------------------------
  const STALLS = [[-96, 1, 'TICKETS', '#55a84a'], [-58, 1, 'CANDY', '#ff7fc8'], [48, 1, 'HOT DOGS', '#ff5a3c'], [88, 1, 'DRINKS', '#3f8cff'],
    [-92, -1, 'PRIZES', '#b46cff'], [-56, -1, 'DRINKS', '#3f8cff'], [44, -1, 'CANDY', '#ff7fc8'], [84, -1, 'HOT DOGS', '#ff5a3c']];
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
  // ---- pumpkins, hay, fallen leaves -------------------------------------------------------
  for (let i = 0; i < 50; i++) {
    const x = FAIR.x0 + 6 + rng() * (FAIR.x1 - FAIR.x0 - 12), k = rng() < 0.5 ? -1 : 1, z = az + k * (7.6 + rng() * 1.2);
    if (onAvenue(x, 1)) continue;
    pumpkin(kit.b(x, z), x, Y, z, 0.5 + rng() * 0.6, rng() < 0.15 ? 0xf2e6c4 : 0xe8742a);
  }
  // a climbable hay-bale pyramid with coins on top
  { const px = -30, pz = az + 13.5;
    for (let l = 0; l < 3; l++) for (let i = 0; i < 3 - l; i++) hayBale(kit, px - (2 - l) * 0.85 + i * 1.7, Y + l * 0.84, pz, 0);
    R.coins(px, pz, Y + 6, 'one', 1, 0); }
  // leaf litter on the grass and leaf piles to jump into (no colliders)
  const litter = kit.b(CENTRE.x, az);
  for (let i = 0; i < 140; i++) {
    const x = FAIR.x0 - 6 + rng() * (FAIR.x1 - FAIR.x0 + 12), z = FAIR.z0 - 2 + rng() * (FAIR.z1 - FAIR.z0 + 6);
    if (onAvenue(x, 0.5) || Math.abs(z - az) < MIDWAY.w / 2) continue;
    litter.add(LITTER.clone(), LEAVES[i % LEAVES.length], [x, Y + 0.03 + (i % 5) * 0.004, z], [0, rng() * 6, 0], [1.2 + rng() * 2.2, 1, 0.8 + rng() * 1.6]);
  }
  for (let i = 0; i < 10; i++) {
    const k = i % 2 ? 1 : -1, x = k * (W + 8 + Math.floor(i / 2) * 22 + rng() * 5), z = i % 4 < 2 ? FAIR.z0 + 3.5 : FAIR.z1 - 3.5;
    const b = kit.b(x, z);
    for (let j = 0; j < 4; j++) b.sphere(0.9 + rng() * 0.4, LEAVES[(i + j) % LEAVES.length], [x + (rng() - 0.5) * 1.6, Y + 0.05, z + (rng() - 0.5) * 1.6], [1.2, 0.35, 1], 7);
  }

  mark('maples');
  // ---- maples in fall colours round the fair and along the avenue ---------------------------
  const tree = (x, z, s) => mapleTree(kit, x, z, G(x, z) - 0.1, s, Math.abs(x * 0.37 + z * 0.11));
  for (let z = FAIR.z0 + 2; z <= FAIR.z1; z += 11) { tree(-FAIR.x1 - 4, z, 0.9 + rng() * 0.3); if (Math.abs(z - PATCH.z) > PATCH.r + 10) tree(FAIR.x1 + 4, z, 0.9 + rng() * 0.3); }
  for (let x = -FAIR.x1; x <= FAIR.x1; x += 12) if (!onAvenue(x, 4)) tree(x, FAIR.z1 + 4.5, 0.9 + rng() * 0.3);
  for (let z = FAIR.z0 + 14; z < FAIR.z1; z += 16) if (Math.abs(z - az) > 12) for (const k of [-1, 1]) if (!Object.values(RIDES).some((r) => Math.hypot(r.x - k * (W + 2.5), r.z - z) < 14)) tree(k * (W + 2.5), z, 0.75);
  for (const [x, z] of [[-116, 170], [116, 170], [-116, 283], [116, 283], [-60, 170], [45, 171], [-40, 283], [80, 283]]) tree(x, z, 1.1);

  mark('pumpkin');
  // ---- pumpkin patch outside the east fence: scarecrow, corn, pumpkins to kick about -------------
  { const px = PATCH.x, pz = PATCH.z, b = kit.b(px, pz);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      const x = px - 7 + c * 4 + (r % 2) * 1.5, z = pz - 10 + r * 4.5, h = G(x, z);
      b.box(3.6, 0.08, 0.3, 0x5a7a2a, [x + 1.5, h + 0.04, z]);
      pumpkin(b, x, h, z, 0.55 + ((r * 3 + c * 5) % 4) * 0.15, (r + c) % 7 ? 0xe8742a : 0xf2e6c4);
    }
    const sx = px + 1, sz = pz + 2, sh = G(sx, sz);
    kit.cyl(sx, sh + 1.2, sz, 0.08, 2.4, 0x6b4426, { seg: 6 });
    kit.deco(sx, sh + 1.8, sz, 0.1, 0.1, 1.8, 0x6b4426);
    rb(b, 0.4, 0.8, 0.7, 0.15, 0x3c6aa8, [sx, sh + 1.55, sz]);
    b.box(0.2, 0.18, 1.6, 0xc8402a, [sx, sh + 1.82, sz]);
    b.sphere(0.32, 0xe2c25e, [sx, sh + 2.3, sz]);
    b.cone(0.55, 0.5, 0x8a6a3a, [sx, sh + 2.65, sz], null, 10);
    b.cyl(0.6, 0.6, 0.04, 0x8a6a3a, [sx, sh + 2.42, sz], null, 12);
    // corn rows along the patch's east side
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) {
      const x = px + 10 + r * 1.6, z = pz - 12 + c * 2.1, h = G(x, z);
      b.cyl(0.04, 0.05, 2.2, 0xc8a84a, [x, h + 1.1, z], null, 4);
      b.box(0.12, 0.05, 0.5, 0x9a9a3a, [x, h + 1.3, z + 0.2], [0.5, c, 0]);
      b.capsule(0.07, 0.25, 0xf2c14a, [x, h + 1.7, z + 0.08]);
    }
    for (let i = 0; i < 7; i++) {
      const x = px - 8 + (i % 2) * 1.5, z = pz - 8 + i * 2.6, h = G(x, z);
      const pbld = new Builder();
      pumpkin(pbld, 0, -0.3, 0, 0.9);
      const o = game.physics.dynamic({ x, y: h + 0.35, z }, [RAPIER.ColliderDesc.ball(0.38).setMass(6)], pbld.mesh(), { angDamp: 0.8 });
      game.scene.add(o.mesh);
      R.common.throwable(game, o);
      o.body.sleep();
    }
  }
  R.coins(PATCH.x, PATCH.z, G(PATCH.x, PATCH.z) + 4, 'ring', 8, 7);
  R.coins(-60, MIDWAY.z, Y + 3, 'line', 8, 40, { yaw: 0 });
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
    for (const p of game.players) { const q = p.chest.translation(); if (Math.abs(q.x) < FAIR.x1 + 30 && q.z > FAIR.z0 - 20 && q.z < FAIR.z1 + 20) { ctr.x += q.x; ctr.z += q.z; n++; } }
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
