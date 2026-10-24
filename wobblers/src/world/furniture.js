// Loose furniture and small props for interiors: every piece is one dynamic
// body (one mesh) you can bump, grab, throw and knock over.
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { Builder } from '../mesh.js';
import { VEH_GROUPS } from '../config.js';

const C = RAPIER.ColliderDesc;
const WOOD = 0xb5773d, DARK = 0x6b4a2a;

// Each maker returns { b: Builder, d: [ColliderDesc], h: distance from body origin down to the floor }.
const FURN = {
  chair: (col = WOOD) => {
    const b = new Builder();
    b.box(0.46, 0.06, 0.46, col, [0, 0, 0]);
    b.box(0.46, 0.5, 0.06, col, [0, 0.28, -0.2]);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) b.box(0.05, 0.42, 0.05, DARK, [x, -0.22, z]);
    return { b, d: [C.cuboid(0.23, 0.03, 0.23).setMass(3), C.cuboid(0.23, 0.25, 0.03).setTranslation(0, 0.28, -0.2).setMass(1), C.cuboid(0.22, 0.2, 0.22).setTranslation(0, -0.23, 0).setMass(1)], h: 0.45 };
  },
  stool: (col = 0xff5a5a) => {
    const b = new Builder();
    b.cyl(0.22, 0.22, 0.08, col, [0, 0, 0], null, 14);
    b.cyl(0.04, 0.04, 0.7, 0xcccccc, [0, -0.36, 0], null, 6);
    b.cyl(0.2, 0.22, 0.04, 0x999999, [0, -0.7, 0], null, 12);
    return { b, d: [C.cylinder(0.04, 0.22).setMass(2), C.cylinder(0.35, 0.05).setTranslation(0, -0.36, 0).setMass(1), C.cylinder(0.02, 0.21).setTranslation(0, -0.7, 0).setMass(2)], h: 0.72 };
  },
  table: (col = WOOD, w = 1.3, d = 0.8) => {
    const b = new Builder();
    b.box(w, 0.07, d, col, [0, 0, 0]);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(0.07, 0.66, 0.07, DARK, [x * (w / 2 - 0.08), -0.36, z * (d / 2 - 0.08)]);
    const ds = [C.cuboid(w / 2, 0.035, d / 2).setMass(8)];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ds.push(C.cuboid(0.035, 0.33, 0.035).setTranslation(x * (w / 2 - 0.08), -0.36, z * (d / 2 - 0.08)).setMass(1));
    return { b, d: ds, h: 0.7 };
  },
  roundTable: (col = 0xffffff) => {
    const b = new Builder();
    b.cyl(0.5, 0.5, 0.05, col, [0, 0, 0], null, 18);
    b.cyl(0.05, 0.05, 0.66, 0x666666, [0, -0.35, 0], null, 8);
    b.cyl(0.3, 0.32, 0.04, 0x666666, [0, -0.68, 0], null, 14);
    return { b, d: [C.cylinder(0.025, 0.5).setMass(4), C.cylinder(0.33, 0.05).setTranslation(0, -0.35, 0).setMass(1), C.cylinder(0.02, 0.32).setTranslation(0, -0.68, 0).setMass(5)], h: 0.7 };
  },
  coffeeTable: () => {
    const b = new Builder();
    b.rbox(1.0, 0.08, 0.6, 0.03, WOOD, [0, 0, 0]);
    b.box(0.9, 0.04, 0.5, DARK, [0, -0.25, 0]);
    for (const [x, z] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]]) b.box(0.05, 0.36, 0.05, DARK, [x, -0.2, z]);
    return { b, d: [C.cuboid(0.5, 0.2, 0.3).setTranslation(0, -0.16, 0).setMass(10)], h: 0.4 };
  },
  sofa: (col = 0x3f8cff) => {
    const b = new Builder(), dark = new THREE.Color(col).multiplyScalar(0.8).getHex();
    b.rbox(1.9, 0.4, 0.85, 0.08, col, [0, 0, 0]);
    b.rbox(1.9, 0.55, 0.22, 0.08, dark, [0, 0.42, -0.32]);
    for (const s of [-1, 1]) b.rbox(0.22, 0.32, 0.85, 0.08, dark, [s * 0.95, 0.3, 0]);
    b.rbox(0.8, 0.12, 0.6, 0.05, new THREE.Color(col).multiplyScalar(1.1).getHex(), [-0.42, 0.25, 0.08]);
    b.rbox(0.8, 0.12, 0.6, 0.05, new THREE.Color(col).multiplyScalar(1.1).getHex(), [0.42, 0.25, 0.08]);
    return { b, d: [C.cuboid(0.95, 0.2, 0.42).setMass(24), C.cuboid(0.95, 0.28, 0.11).setTranslation(0, 0.42, -0.32).setMass(6), C.cuboid(0.11, 0.16, 0.42).setTranslation(-0.95, 0.3, 0).setMass(2), C.cuboid(0.11, 0.16, 0.42).setTranslation(0.95, 0.3, 0).setMass(2)], h: 0.2 };
  },
  armchair: (col = 0xff8a3d) => {
    const b = new Builder(), dark = new THREE.Color(col).multiplyScalar(0.8).getHex();
    b.rbox(0.95, 0.4, 0.85, 0.08, col, [0, 0, 0]);
    b.rbox(0.95, 0.55, 0.22, 0.08, dark, [0, 0.42, -0.32]);
    for (const s of [-1, 1]) b.rbox(0.2, 0.32, 0.85, 0.08, dark, [s * 0.47, 0.3, 0]);
    return { b, d: [C.cuboid(0.47, 0.2, 0.42).setMass(14), C.cuboid(0.47, 0.28, 0.11).setTranslation(0, 0.42, -0.32).setMass(4)], h: 0.2 };
  },
  lamp: (col = 0xfff1b0) => {
    const b = new Builder();
    b.cyl(0.2, 0.22, 0.05, 0x444444, [0, 0, 0], null, 12);
    b.cyl(0.025, 0.025, 1.4, 0x444444, [0, 0.72, 0], null, 6);
    b.cyl(0.18, 0.3, 0.35, col, [0, 1.45, 0], null, 12);
    return { b, d: [C.cylinder(0.025, 0.22).setMass(3), C.cylinder(0.7, 0.04).setTranslation(0, 0.72, 0).setMass(0.5), C.cylinder(0.17, 0.25).setTranslation(0, 1.45, 0).setMass(0.4)], h: 0.025 };
  },
  tv: () => {
    const b = new Builder();
    b.rbox(1.1, 0.65, 0.08, 0.02, 0x222222, [0, 0, 0]);
    b.box(1.0, 0.55, 0.01, 0x3a6ad0, [0, 0, 0.041]);
    b.box(0.3, 0.05, 0.25, 0x222222, [0, -0.35, 0]);
    return { b, d: [C.cuboid(0.55, 0.33, 0.04).setMass(5), C.cuboid(0.15, 0.025, 0.125).setTranslation(0, -0.35, 0).setMass(2)], h: 0.375 };
  },
  cabinet: (col = WOOD, w = 1.3, h = 0.55, d = 0.45) => {
    const b = new Builder();
    b.rbox(w, h, d, 0.03, col, [0, 0, 0]);
    b.box(0.02, h * 0.8, 0.01, DARK, [0, 0, d / 2 + 0.005]);
    b.sphere(0.03, 0xffd23f, [-0.08, 0, d / 2 + 0.02], null, 6); b.sphere(0.03, 0xffd23f, [0.08, 0, d / 2 + 0.02], null, 6);
    return { b, d: [C.cuboid(w / 2, h / 2, d / 2).setMass(16)], h: h / 2 };
  },
  bookshelf: () => {
    const b = new Builder(), cols = [0xff5a5a, 0x3f8cff, 0x55d85a, 0xffd23f, 0xb46cff, 0xffffff];
    b.box(0.9, 1.8, 0.05, DARK, [0, 0, -0.15]);
    for (const s of [-1, 1]) b.box(0.05, 1.8, 0.35, WOOD, [s * 0.43, 0, 0]);
    for (let k = 0; k < 4; k++) {
      const y = -0.88 + k * 0.58;
      b.box(0.86, 0.04, 0.33, WOOD, [0, y, 0]);
      if (k < 3) for (let i = 0; i < 7; i++) b.box(0.08, 0.32 + (i % 3) * 0.05, 0.24, cols[(i + k * 2) % cols.length], [-0.33 + i * 0.105, y + 0.2, 0.02]);
    }
    return { b, d: [C.cuboid(0.45, 0.9, 0.17).setMass(22)], h: 0.9 };
  },
  wardrobe: (col = 0xd9a066) => {
    const b = new Builder();
    b.rbox(1.1, 1.9, 0.55, 0.03, col, [0, 0, 0]);
    b.box(0.02, 1.7, 0.01, DARK, [0, 0, 0.28]);
    b.sphere(0.035, 0xffd23f, [-0.07, 0, 0.29], null, 6); b.sphere(0.035, 0xffd23f, [0.07, 0, 0.29], null, 6);
    return { b, d: [C.cuboid(0.55, 0.95, 0.27).setMass(35)], h: 0.95 };
  },
  bed: (col = 0x6ac8ff) => {
    const b = new Builder();
    b.rbox(1.3, 0.35, 2.1, 0.04, WOOD, [0, 0, 0]);
    b.rbox(1.24, 0.16, 2.0, 0.06, 0xffffff, [0, 0.24, 0]);
    b.rbox(1.26, 0.1, 1.4, 0.04, col, [0, 0.33, 0.32]);
    b.rbox(0.5, 0.12, 0.32, 0.05, 0xffffff, [-0.3, 0.38, -0.8]); b.rbox(0.5, 0.12, 0.32, 0.05, 0xffffff, [0.3, 0.38, -0.8]);
    b.box(1.3, 0.7, 0.08, WOOD, [0, 0.35, -1.04]);
    return { b, d: [C.cuboid(0.65, 0.25, 1.05).setTranslation(0, 0.07, 0).setMass(35), C.cuboid(0.65, 0.35, 0.04).setTranslation(0, 0.35, -1.04).setMass(5)], h: 0.175 };
  },
  box: (col = 0xc8955a, s = 0.6) => {
    const b = new Builder();
    b.box(s, s * 0.8, s, col, [0, 0, 0]);
    b.box(s * 1.01, 0.06, s * 0.2, 0xd8c08a, [0, s * 0.4, 0]);
    return { b, d: [C.cuboid(s / 2, s * 0.4, s / 2).setMass(2)], h: s * 0.4 };
  },
  produce: (col = 0xff5a5a) => {
    const b = new Builder();
    b.box(0.5, 0.22, 0.36, 0x9a6a3a, [0, 0, 0]);
    for (let i = 0; i < 6; i++) b.sphere(0.09, col, [-0.15 + (i % 3) * 0.15, 0.12, -0.08 + Math.floor(i / 3) * 0.16], null, 8);
    return { b, d: [C.cuboid(0.25, 0.15, 0.18).setTranslation(0, 0.03, 0).setMass(2.5)], h: 0.11 };
  },
  plant: () => {
    const b = new Builder();
    b.cyl(0.22, 0.17, 0.4, 0xd9824a, [0, 0, 0], null, 10);
    b.sphere(0.35, 0x4fae45, [0, 0.45, 0], [1, 1.2, 1], 8);
    b.sphere(0.22, 0x5fc050, [0.15, 0.7, 0.05], null, 7);
    return { b, d: [C.cylinder(0.2, 0.2).setMass(5), C.ball(0.3).setTranslation(0, 0.45, 0).setMass(0.5)], h: 0.2 };
  },
  beanbag: (col = 0xb46cff) => {
    const b = new Builder();
    b.sphere(0.5, col, [0, 0, 0], [1, 0.65, 1], 12);
    return { b, d: [C.ball(0.36).setMass(3).setRestitution(0.1).setFriction(1.2)], h: 0.3 };
  },
  teddy: (col = 0xc8955a) => {
    const b = new Builder();
    b.sphere(0.3, col, [0, 0, 0], [1, 1.1, 0.9], 10);
    b.sphere(0.22, col, [0, 0.42, 0], null, 10);
    for (const s of [-1, 1]) { b.sphere(0.08, col, [s * 0.15, 0.6, 0], null, 6); b.sphere(0.1, col, [s * 0.28, 0.05, 0.05], null, 6); b.sphere(0.11, col, [s * 0.15, -0.28, 0.1], null, 6); }
    b.sphere(0.07, 0xffe0c0, [0, 0.38, 0.18], null, 6); b.sphere(0.03, 0x111111, [0.08, 0.48, 0.18], null, 5); b.sphere(0.03, 0x111111, [-0.08, 0.48, 0.18], null, 5);
    b.box(0.25, 0.06, 0.06, 0xff3355, [0, 0.24, 0.12]);
    return { b, d: [C.ball(0.3).setMass(1.5), C.ball(0.2).setTranslation(0, 0.42, 0).setMass(0.5)], h: 0.32 };
  },
};

// Seats on furniture, body-local: [hips x, y, z] per seat (facing body +Z) and
// how far in front you stand up (exit [y, z]); if another piece of furniture
// (a table) is in the way, you get up beside or behind it instead (exitWorld).
// Sittable furniture uses the vehicle/ride
// collision group, so a seated player (who ignores that group) doesn't fight
// the chair; everyone else still bumps it as usual.
const SEATS = {
  chair: { at: [[0, 0.21, 0.02]], exit: [0.2, 0.75] },
  stool: { at: [[0, 0.23, 0]], exit: [0.2, 0.7] },
  sofa: { at: [[-0.42, 0.49, 0.06], [0.42, 0.49, 0.06]], exit: [0.3, 1.0] },
  armchair: { at: [[0, 0.39, 0.04]], exit: [0.3, 0.95] },
  beanbag: { at: [[0, 0.38, -0.05]], exit: [0.2, 0.8] },
};

export function furn(game, kind, x, y, z, yaw = 0, ...args) {
  const p = FURN[kind](...args);
  const rot = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const st = SEATS[kind];
  const o = game.physics.dynamic({ x, y: y + p.h + 0.01, z }, p.d, p.b.mesh(), { rot, angDamp: 0.4, linDamp: 0.1, ...(st ? { groups: VEH_GROUPS } : {}) });
  game.scene.add(o.mesh);
  (game.furniture ||= []).push(o.body);
  if (st) {
    const seats = st.at.map((at) => ({
      body: o.body, pos: at, yaw: 0, kind: 'passenger', label: 'Sit', hint: 'Y Get up', occupant: null,
      get exitWorld() { return exitSpot(game, o.body, at, st.exit); }, // read by Player.leaveSeat
      // a beanbag is a ball: don't let it roll out from under its sitter
      ...(kind === 'beanbag' ? { onEnter: () => o.body.lockRotations(true, true), onExit: () => o.body.lockRotations(false, true) } : {}),
    }));
    for (const s of seats) game.seats.push(s);
    sittable(game).push({ body: o.body, seats });
  }
  return o;
}

// First free spot of: in front, right, left, behind (body-local), skipping any
// within reach of another piece of furniture's centre.
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
function exitSpot(game, body, at, [ey, ez]) {
  const r = body.rotation(), t = body.translation();
  _q.set(r.x, r.y, r.z, r.w);
  let first = null;
  for (const [lx, lz] of [[at[0], ez], [at[0] + 0.7, 0.1], [at[0] - 0.7, 0.1], [at[0], -0.8]]) {
    const w = _v.set(lx, ey, lz).applyQuaternion(_q).add(t);
    const p = { x: w.x, y: w.y, z: w.z };
    first ||= p;
    if (!game.furniture.some((b) => b !== body && Math.hypot(b.translation().x - p.x, b.translation().z - p.z) < 0.6 && Math.abs(b.translation().y - p.y) < 1.2)) return p;
  }
  return first;
}

// Knocked-over furniture can't be sat on until it's stood back up.
function sittable(game) {
  if (!game.sittable) {
    game.sittable = [];
    let n = 0;
    game.steppers.push(() => {
      if (++n % 20) return;
      for (const f of game.sittable) {
        if (f.body.isSleeping()) continue;
        const r = f.body.rotation(), up = 1 - 2 * (r.x * r.x + r.z * r.z); // body Y axis . world Y
        for (const s of f.seats) s.disabled = up < 0.8;
      }
    });
  }
  return game.sittable;
}

// Furniture placed in a building's local frame (L: common.Local).
export function lfurn(game, L, kind, lx, ly, lz, lyaw = 0, ...args) {
  const [x, z] = L.w(lx, lz);
  return furn(game, kind, x, L.y0 + ly, z, L.yaw + lyaw, ...args);
}
