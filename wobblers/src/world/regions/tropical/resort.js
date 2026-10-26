// Resort Isle: the Coconut Resort hotel (enterable lobby, stairs to a roof
// terrace), the pool with a swim-up pool bar, sunbeds you can lie on and
// umbrellas on the beach, beach huts, a lifeguard tower, a beach volleyball
// court with a working ball and scoreboard, pedalos and a banana boat.
import { AWNING_BOUNCE } from '../../../config.js';
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder } from '../../../mesh.js';
import { DT } from '../../../config.js';
import { RESORT, POOL } from '../tropical.js';
import { climb } from '../jungle/rides.js';
import { Local } from '../../common.js';

const WHITE = 0xfaf3e4, TEAL = 0x2bc4c4, WOOD = 0xc8975f, THATCH = 0xd8b45a;
const UMB = [[0xff5a8a, 0xffffff], [0xffd23f, 0xff8a3d], [0x3fe0d0, 0xffffff], [0xb46cff, 0xffd23f]];

export function buildResort(game, kit, R) {
  const Y = RESORT.y;
  hotel(game, kit, R, Y);
  pool(game, kit, R, Y);
  volleyball(game, kit, R, Y);
  // ---- beach: sunbeds + umbrellas in two rows facing the lagoon (north) -----------------
  let k = 0;
  for (const z of [721, 727]) for (let x = 560; x <= 636; x += 8, k++) {
    const g = R.groundAt(x, z);
    if (g < 0.3) continue;
    sunbed(game, kit, x - 1.1, z, Math.PI, R.groundAt(x - 1.1, z), UMB[k % 4][0]);
    sunbed(game, kit, x + 1.1, z, Math.PI, R.groundAt(x + 1.1, z), UMB[(k + 1) % 4][0]);
    umbrella(kit, x, z + 0.6, g, UMB[k % 4]);
  }
  // lifeguard tower
  lifeguardTower(game, kit, R, 598, 712);
  // beach huts on the west shore
  [[534, 748, 0xff5a8a], [531, 760, 0x3fe0d0], [530, 772, 0xffd23f], [532, 784, 0xb46cff]].forEach(([x, z, c]) => beachHut(game, kit, R, x, z, c));
  // ---- toys, people, rides -------------------------------------------------------------
  R.vehicle('pedalo', 568, 699, Math.PI, 0xffffff);
  R.vehicle('pedalo', 575, 698, Math.PI + 0.2, 0xff8ac8);
  R.vehicle('bananaboat', 588, 697, Math.PI / 2, 0xffd23f);
  R.vehicle('beachbuggy', 569, 741, 0, 0xff5a8a);
  R.vehicle('golfcart', 574, 741, 0, 0xffffff);
  R.vehicle('golfcart', 578.5, 741, 0, 0x3fae5a);
  R.npc('lifeguard', 601, 716, { yaw: Math.PI });
  for (const [x, z] of [[590, 725], [620, 730], [565, 770], [628, 750]]) R.npc('beachgoer', x, z, { area: { x, z, r: 12 } });
  for (const [x, z] of [[598, 741.2], [604, 741.2]]) kit.bench(x, z, 0, Y);
  R.npc('islander', 601, 740);
  R.coins(600, 724, null, 'line', 10, 70);
  R.coins(536, 766, null, 'line', 6, 34, { yaw: Math.PI / 2 });
  R.sign('COCONUT RESORT', 572, Y + 3.2, 737, Math.PI, 5.2, '#2bc4c4', '#ffffff');
  for (const s of [-1, 1]) kit.cyl(572 + s * 2.7, Y + 1.6, 737, 0.12, 3.2, WOOD);
}

// ---- hotel -------------------------------------------------------------------------------
function hotel(game, kit, R, Y) {
  const X0 = 614, X1 = 642, Z0 = 768, Z1 = 786, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, W = X1 - X0, D = Z1 - Z0;
  const L = new R.Local(kit, cx, cz, Math.PI, Y); // local +z = north (the front, toward the pool / beach)
  const hx = W / 2, hz = D / 2, H0 = 4;
  // lobby (hollow ground floor)
  L.wall(-hx, hz, hx, hz, H0, 0.3, WHITE, [{ at: hx, w: 3, h: 3 }, { at: 5, w: 3, h: 1.6, sill: 1.1 }, { at: W - 5, w: 3, h: 1.6, sill: 1.1 }]);
  L.wall(-hx, -hz, hx, -hz, H0, 0.3, WHITE, [{ at: hx, w: 4, h: 1.6, sill: 1.1 }]);
  L.wall(-hx, -hz, -hx, hz, H0, 0.3, WHITE, [{ at: hz, w: 3, h: 1.6, sill: 1.1 }]);
  L.wall(hx, -hz, hx, hz, H0, 0.3, WHITE, [{ at: hz, w: 3, h: 1.6, sill: 1.1 }]);
  L.box(0, 0.06, 0, W - 0.6, 0.12, D - 0.6, 0xe8d8b8);
  for (const [a, w] of [[5, 3], [W - 5, 3]]) L.window(-hx, hz, hx, hz, a, 1.9, w, 1.6, 0.3);
  // reception desk, sofas, plants
  L.box(0, 0.55, -4, 6, 1.1, 1.2, WOOD); L.box(0, 1.14, -4, 6.3, 0.08, 1.4, 0x8a5a2a);
  for (const s of [-1, 1]) { L.box(s * 8, 0.35, 3, 3, 0.7, 1.2, TEAL); L.box(s * 8, 0.8, 2.5, 3, 0.9, 0.3, TEAL); }
  for (const s of [-1, 1]) { L.cyl(s * 12, 0.4, 7, 0.4, 0.8, 0xc8975f, { seg: 8 }); L.sphere(s * 12, 1.4, 7, 0.9, 0x3cae4a, { seg: 7 }); }
  for (const lx of [-8, 0, 8]) game.interiorLights?.add(...Object.values(L.v3(lx, H0 - 0.05, 0)), { color: 0xffe8c0, intensity: 8, range: 10, fixture: 'panel' });
  R.npc('townsfolk', ...L.w(0, -5.3), { behaviour: 'idle', colors: { shirt: 0x2bc4c4, pants: 0x2a2a33 }, hat: 'none', lines: ['Welcome to Coconut Resort!', 'Enjoy your stay!', 'Pool is open all day!'] });
  // upper floors: one block with windows and balconies
  const H1 = 6.2;
  L.box(0, H0 + 0.15, 0, W, 0.3, D, 0xe8d8b8);
  L.box(0, H0 + 0.3 + H1 / 2, 0, W, H1, D, WHITE);
  for (const floor of [0, 1]) for (let i = 0; i < 6; i++) {
    const lx = -hx + 2.4 + i * (W - 4.8) / 5, y = H0 + 1.7 + floor * 3.1;
    L.deco(lx, y, hz + 0.03, 1.8, 1.5, 0.06, 0x9fd8ff);
    L.deco(lx, y, -hz - 0.03, 1.8, 1.5, 0.06, 0x9fd8ff);
    L.box(lx, y - 0.95, hz + 0.6, 2.4, 0.15, 1.2, WHITE);
    L.deco(lx, y - 0.45, hz + 1.17, 2.4, 0.8, 0.06, TEAL);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) L.deco(s * (hx + 0.03), H0 + 1.7 + (i % 2) * 3.1, -4 + i * 4, 0.06, 1.5, 1.8, 0x9fd8ff);
  // roof terrace
  const RY = H0 + 0.3 + H1;
  L.box(0, RY + 0.1, 0, W + 0.4, 0.2, D + 0.4, 0xd8c8a8);
  L.rail(-hx, hz, hx, hz, RY + 0.2, 1.0, 0xffffff); L.rail(-hx, -hz, -hx + 3, -hz, RY + 0.2, 1.0, 0xffffff); L.rail(-hx + 3 + 2, -hz, hx, -hz, RY + 0.2, 1.0, 0xffffff);
  L.rail(-hx, -hz, -hx, hz, RY + 0.2, 1.0, 0xffffff); L.rail(hx, -hz, hx, hz, RY + 0.2, 1.0, 0xffffff);
  for (const [lx, lz, c] of [[-6, 2, UMB[0]], [3, 2, UMB[2]], [9, -3, UMB[1]]]) { const p = L.v3(lx, 0, lz); umbrella(kit, p.x, p.z, Y + RY + 0.2, c); }
  for (const lx of [-8, -4, 1, 5]) { const p = L.v3(lx, 0, 4); sunbed(game, kit, p.x, p.z, 0, Y + RY + 0.2, 0xffffff); }
  const sg = L.v3(0, RY + 1.6, hz + 0.25);
  R.sign('COCONUT RESORT', sg.x, sg.y, sg.z, 0, 7, '#2bc4c4', '#ffffff');
  const pr = L.v3(10, 0, 4);
  R.present('cove-hotel', 'hat:coconut', pr.x, pr.z, Y + RY + 2, 'on the roof terrace of the Coconut Resort hotel');
  R.coins(cx, cz, Y + RY + 3, 'ring', 8, 5);
  // stairs: along the west side front to back, then along the back to the roof
  const yMid = H0 + 0.3 + 2.6;
  L.stairs(hx + 1.1, hz - 0.5, 0, hx + 1.1, -hz + 1.0, yMid, 1.8, 0xd8c8a8, 0xc8b898);
  L.box(hx + 1.1, yMid - 0.12, -hz - 0.3, 2.0, 0.24, 2.6, 0xd8c8a8);
  L.stairs(hx + 0.2, -hz - 1.1, yMid, -hx + 4.2, -hz - 1.1, RY + 0.2, 1.8, 0xd8c8a8, 0xc8b898);
  L.box(-hx + 3.8 + 0.2, RY + 0.08, -hz - 1.1, 1.6, 0.24, 2.0, 0xd8c8a8);
  L.rail(hx + 2.05, hz - 0.5, hx + 2.05, -hz - 1.8, 0, yMid + 1.0, 0xffffff);
  L.rail(hx + 2.05, -hz - 2.05, -hx + 4, -hz - 2.05, yMid, 1.0, 0xffffff);
}

// ---- pool + pool bar -------------------------------------------------------------------------
function pool(game, kit, R, Y) {
  const { x0, x1, z0, z1, floor, level } = POOL;
  R.addWater(game, x0, x1, z0, z1, floor, level, 0x3fd0ff, 0.75);
  const TILE = 0x8fe0f0, COPE = 0xf2ece0;
  kit.box((x0 + x1) / 2, floor - 0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, TILE);
  for (const [cx, cz, w, d] of [[(x0 + x1) / 2, z0 - 0.15, x1 - x0 + 0.6, 0.3], [(x0 + x1) / 2, z1 + 0.15, x1 - x0 + 0.6, 0.3], [x0 - 0.15, (z0 + z1) / 2, 0.3, z1 - z0], [x1 + 0.15, (z0 + z1) / 2, 0.3, z1 - z0]]) {
    kit.box(cx, (floor + Y) / 2, cz, w, Y - floor, d, TILE);
    kit.box(cx, Y + 0.06, cz, w + (w > d ? 0.6 : 0.6), 0.12, d + (d > w ? 0.6 : 0.6), COPE);
  }
  // steps into the shallow end
  const L = new R.Local(kit, 0, 0, 0);
  L.stairs(x0 + 1.5, z1 - 0.8, floor, x0 + 1.5, z1 - 3.8, Y, 1.6, TILE, 0xffffff);
  // pool deck stripe + loungers
  for (const z of [z0 - 3, z1 + 3]) for (let x = x0 + 2; x < x1; x += 5) sunbed(game, kit, x, z, z < z0 ? Math.PI : 0, Y, 0x3fe0d0);
  // inflatable ring and ball floating in the pool
  const ringB = new Builder(); ringB.torus(0.45, 0.16, 0xff5a8a, [0, 0, 0], [Math.PI / 2, 0, 0], 14);
  const ring = game.physics.dynamic({ x: x0 + 8, y: level + 0.1, z: z0 + 6 }, RAPIER.ColliderDesc.cylinder(0.12, 0.6).setMass(1.5), ringB.mesh(), { buoy: { r: 0.15, volume: 0.03, drag: 3 } });
  game.scene.add(ring.mesh);
  R.common.throwable(game, ring, { speed: 7 });
  // swim-up pool bar on the east edge: thatched hut, counter facing the pool, stools in the water
  const bx = x1 + 3.2, bz = (z0 + z1) / 2;
  for (const [a, b] of [[-2.6, -4.2], [2.6, -4.2], [-2.6, 4.2], [2.6, 4.2]]) kit.cyl(bx + a, Y + 1.7, bz + b, 0.16, 3.4, 0xa77b4a, { seg: 6 });
  kit.cone(bx, Y + 4.4, bz, 6.4, 2.2, THATCH, { seg: 6 });
  kit.box(bx, Y + 3.45, bz, 5.6, 0.2, 8.8, 0xc79f45);
  kit.box(x1 + 0.6, Y - 0.2, bz, 1.2, 2.6, 8, 0x8a5a2a);                     // counter: from the pool floor up
  kit.box(x1 + 0.7, Y + 1.12, bz, 1.6, 0.1, 8.4, 0xd8a868);
  kit.box(bx + 1.8, Y + 1.2, bz, 0.6, 2.4, 7, 0x8a5a2a);                      // back shelf
  for (let i = 0; i < 8; i++) kit.cyl(bx + 1.8, Y + 1.6 + (i % 2) * 0.5, bz - 3 + i * 0.85, 0.08, 0.35, [0x3fe0d0, 0xff5a8a, 0xffd23f, 0x55d85a][i % 4], { seg: 6, collide: false });
  for (let i = 0; i < 4; i++) {
    const sz = bz - 3 + i * 2, sx = x1 - 0.9;
    kit.cyl(sx, (floor + level - 0.35) / 2, sz, 0.25, level - 0.35 - floor, 0xd8a868, { seg: 8 });
    R.addSeat(game, { body: game.physics.staticBody, pos: [sx, level - 0.05, sz], yaw: Math.PI / 2, label: 'Sit', hint: 'Y Get up', exit: [sx - 1.0, level, sz] });
  }
  R.npc('bartender', bx + 0.6, bz, { yaw: -Math.PI / 2 });
  R.sign('POOL BAR', bx - 0.2, Y + 2.95, bz + 4.35, 0, 3.2, '#ff7fa0', '#ffffff');
  R.coins((x0 + x1) / 2, (z0 + z1) / 2, null, 'line', 5, 14, { y: floor + 0.6, water: true });
}

// ---- beach volleyball ----------------------------------------------------------------------
function volleyball(game, kit, R, Y) {
  const X0 = 568, X1 = 588, Z0 = 774, Z1 = 784, NX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
  kit.box((X0 + X1) / 2, Y + 0.02, CZ, X1 - X0 + 4, 0.06, Z1 - Z0 + 4, 0xf0dca0, { collide: false });
  for (const [x, z, w, d] of [[(X0 + X1) / 2, Z0, X1 - X0, 0.08], [(X0 + X1) / 2, Z1, X1 - X0, 0.08], [X0, CZ, 0.08, Z1 - Z0], [X1, CZ, 0.08, Z1 - Z0], [NX, CZ, 0.08, Z1 - Z0]]) kit.deco(x, Y + 0.06, z, w, 0.02, d, 0xffffff);
  for (const z of [Z0 - 0.6, Z1 + 0.6]) kit.cyl(NX, Y + 1.3, z, 0.07, 2.6, 0xdddddd, { seg: 6 });
  kit.deco(NX, Y + 2.15, CZ, 0.04, 0.9, Z1 - Z0 + 1.2, 0x222228);
  kit.deco(NX, Y + 2.62, CZ, 0.06, 0.08, Z1 - Z0 + 1.2, 0xffffff);
  game.physics.box(NX, Y + 2.15, CZ, 0.06, 0.9, Z1 - Z0 + 1.2, {});
  // ball
  const b = new Builder();
  b.sphere(0.33, 0xffffff, [0, 0, 0], null, 12);
  for (let i = 0; i < 3; i++) b.torus(0.331, 0.025, [0xffd23f, 0x2a72e8, 0xffd23f][i], [0, 0, 0], [i * 1.05, i * 0.7, 0], 16);
  // serving posts just outside each baseline: the ball waits on one
  for (const x of [X0 - 1.5, X1 + 1.5]) kit.cyl(x, Y + 0.55, CZ, 0.12, 1.1, 0xdddddd, { seg: 6 });
  const home = { x: X0 - 1.5, y: Y + 1.45, z: CZ };
  const ball = game.physics.dynamic(home, RAPIER.ColliderDesc.ball(0.33).setMass(0.35).setRestitution(0.7).setFriction(0.6), b.mesh(), { linDamp: 0.15, angDamp: 0.4, ccd: true, buoy: { r: 0.33, volume: 0.15, drag: 2 } });
  game.scene.add(ball.mesh);
  ball.mesh.userData.dynamic = true;
  const st = { blue: 0, red: 0, wait: 0, air: false, serve: -1 };
  // punch the ball: a lob over the net into the other half
  R.common.throwable(game, ball, {
    r: 0.33, speed: 9,
    aim(p, body) {
      const t = body.translation(), side = t.x < NX ? 1 : -1;
      const to = { x: NX + side * (2.5 + Math.random() * 6), y: Y, z: Z0 + 1 + Math.random() * (Z1 - Z0 - 2) };
      return R.common.lob(t, to, 0.95);
    },
  });
  const board = R.common.liveSign(game, 3.2, 1.2, '#1f2b5c', '#ffffff');
  board.mesh.position.set(NX, Y + 3.6, Z1 + 3.2); board.mesh.rotation.y = Math.PI;
  kit.cyl(NX - 1.5, Y + 1.5, Z1 + 3.25, 0.08, 3, 0x6b4a2a); kit.cyl(NX + 1.5, Y + 1.5, Z1 + 3.25, 0.08, 3, 0x6b4a2a);
  const show = () => board.set(['BLUE  ' + st.blue + '  -  ' + st.red + '  RED']);
  show();
  R.sign('VOLLEYBALL', NX, Y + 4.6, Z1 + 3.22, Math.PI, 3.2, '#f0c040', '#1f4aa0');
  const reset = (side) => {
    const x = side < 0 ? X0 - 1.5 : X1 + 1.5;
    R.common.place(ball.body, { x, y: Y + 1.45, z: CZ });
  };
  game.steppers.push(() => {
    const t = ball.body.translation(), v = ball.body.linvel();
    if (st.wait > 0) { st.wait -= DT; if (st.wait <= 0) reset(st.serve); return; }
    const inCourtArea = t.x > X0 - 8 && t.x < X1 + 8 && t.z > Z0 - 8 && t.z < Z1 + 8;
    if (!inCourtArea) { if (Math.hypot(t.x - NX, t.z - CZ) > 40 || t.y < -3) { st.serve = -1; reset(-1); } return; }
    if (t.y > Y + 2.4) st.air = true; // only counts once it has been hit up
    if (st.air && t.y < Y + 0.4 && v.y <= 0.5) {
      st.air = false;
      const inside = t.x > X0 && t.x < X1 && t.z > Z0 && t.z < Z1;
      if (!inside) { st.serve = t.x < NX ? 1 : -1; st.wait = 2.5; return; }
      const left = t.x < NX; // landed on the blue (west) half -> red scores
      if (left) st.red++; else st.blue++;
      st.serve = left ? 1 : -1;
      st.wait = 2;
      show();
      R.common.chime(game, { x: t.x, y: t.y, z: t.z }, [72, 79], 0.2);
      if (game.lastThrower) game.life?.reward(game.lastThrower, 2, 'Volleyball point!', { x: t.x, y: t.y + 1, z: t.z });
      if (st.red >= 7 || st.blue >= 7) { st.red = st.blue = 0; setTimeout(show, 1600); }
    }
  });
  game.volleyball = { ball, st, net: NX, court: [X0, X1, Z0, Z1] };
}

// ---- small pieces ---------------------------------------------------------------------------
// A sunbed with a raised headrest; Y to sit back on it.
export function sunbed(game, kit, x, z, yaw, y, cushion = 0xffffff) {
  const L = new Local(kit, x, z, yaw, y);
  L.box(0, 0.3, 0.3, 0.8, 0.08, 1.4, WOOD);
  L.box(0, 0.38, 0.3, 0.72, 0.08, 1.35, cushion, { collide: false });
  L.box(0, 0.62, -0.55, 0.8, 0.08, 0.8, WOOD, { euler: [-0.95, 0, 0] });
  L.box(0, 0.68, -0.5, 0.72, 0.06, 0.75, cushion, { euler: [-0.95, 0, 0], collide: false });
  for (const [a, b] of [[-0.35, 0.9], [0.35, 0.9], [-0.35, -0.3], [0.35, -0.3]]) L.deco(a, 0.15, b, 0.06, 0.3, 0.06, 0x8a6a3a);
  // reclining needs player.js support; for now you sit back against the raised headrest
  const p = L.v3(0, 0.78, -0.12), e = L.v3(0.95, 0.5, 0.2);
  game.seats.push({ body: game.physics.staticBody, pos: [p.x, p.y, p.z], yaw, kind: 'passenger', label: 'Relax', hint: 'Y Get up', exit: [e.x, e.y, e.z], occupant: null, lounger: true });
}

function umbrella(kit, x, z, y, [c1, c2]) {
  kit.cyl(x, y + 1.25, z, 0.05, 2.5, 0xdddddd, { seg: 5, collide: false });
  for (let i = 0; i < 8; i++) kit.cone(x, y + 2.55, z, 1.7, 0.6, i % 2 ? c1 : c2, { seg: 8, euler: [0, i * Math.PI / 4, 0] });
  kit.cone(x, y + 2.55, z, 1.72, 0.6, c1, { seg: 8 });
}

function lifeguardTower(game, kit, R, x, z) {
  const g = R.groundAt(x, z), top = g + 2.8;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(x + a, (g + top) / 2, z + b, 0.1, top - g, 0xffffff, { seg: 6 });
  kit.box(x, top - 0.1, z, 2.6, 0.2, 2.6, WOOD);
  const L = new R.Local(kit, x, z, Math.PI, top);
  L.rail(-1.3, 1.3, 1.3, 1.3, 0, 0.9, 0xe8322b); L.rail(-1.3, -1.3, -1.3, 1.3, 0, 0.9, 0xe8322b); L.rail(1.3, -1.3, 1.3, 1.3, 0, 0.9, 0xe8322b);
  L.box(0, 2.3, 0, 2.6, 0.12, 2.6, 0xe8322b);
  for (const [a, b] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) L.deco(a, 1.2, b, 0.07, 2.3, 0.07, 0xffffff);
  const s = L.v3(0, 2.75, 1.32);
  R.sign('LIFEGUARD', s.x, s.y, s.z, Math.PI, 2.8, '#e8322b', '#ffffff');
  climb(game, kit, x, z + 1.75, R.groundAt(x, z + 1.75), top, 0, -1, 0xffffff);
  R.addSeat(game, { body: game.physics.staticBody, pos: [x, top + 0.45, z], yaw: Math.PI, label: 'Sit', hint: 'Y Get up', exit: [x, top + 0.3, z + 0.8] });
  kit.box(x, top + 0.2, z + 0.1, 0.8, 0.4, 0.6, 0xffffff);
}

function beachHut(game, kit, R, x, z, color) {
  const g = R.groundAt(x, z), L = new R.Local(kit, x, z, -Math.PI / 2, g + 0.4);
  L.box(0, -0.2, 0, 4.4, 0.4 + 0.6, 4.4, WOOD);
  for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) L.cyl(a, -0.6, b, 0.12, 1.2, 0x8a6a3a, { seg: 5 });
  L.wall(-1.9, 1.9, 1.9, 1.9, 2.4, 0.12, color, [{ at: 1.9, w: 1.1, h: 2.0 }]);
  L.wall(-1.9, -1.9, 1.9, -1.9, 2.4, 0.12, color, []);
  L.wall(-1.9, -1.9, -1.9, 1.9, 2.4, 0.12, 0xffffff, [{ at: 1.9, w: 1.0, h: 0.8, sill: 1.0 }]);
  L.wall(1.9, -1.9, 1.9, 1.9, 2.4, 0.12, 0xffffff, [{ at: 1.9, w: 1.0, h: 0.8, sill: 1.0 }]);
  for (const s of [-1, 1]) L.box(0, 2.85, s * 1.1, 4.6, 0.12, 2.6, THATCH, { euler: [s * 0.5, 0, 0] });
  // striped awning + towel
  for (let i = 0; i < 5; i++) L.box(-1.6 + i * 0.8, 2.25, 2.4, 0.8, 0.06, 1.0, i % 2 ? 0xffffff : color, { euler: [0.35, 0, 0], bounce: AWNING_BOUNCE }); // a trampoline
  const p = L.v3(0, 0, 4);
  kit.deco(p.x, R.groundAt(p.x, p.z) + 0.03, p.z, 1.0, 0.02, 1.9, [0xff5a8a, 0x3fe0d0, 0xffd23f][(x | 0) % 3], { yaw: -Math.PI / 2 });
  void game;
}
