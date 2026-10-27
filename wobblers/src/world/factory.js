// WOBBLE WORKS: the toy factory in the west meadow (the field the Fun Park left, x -300..-190,
// z -105..10, flat at y = 0; the town's west road at z = 0 runs into its yard).
//   - the hall (x -275..-215, z -75..-35, 9 m, saw-tooth roof with skylights): two conveyor
//     belts run toy boxes from a dispenser past a wrapping machine into a bin, then the boxes
//     go round again; a mezzanine catwalk with stairs along the back wall
//   - the yard: asphalt, the LOADING BAY with a parked lorry and pallets of crates, three
//     forklifts (A raises the forks, B lowers them), stacks of shipping containers to climb
//     (ladders on the tall ones), two smokestacks puffing smoke, a water tank on legs
// Conveyors: `game.belts` lists each belt's top as { x0, x1, z0, z1, y, vx, vz }. Loose bodies on
// a belt are carried (a per-step check); players standing on one get its speed through
// player.groundVelocity, like standing on a moving ride.
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { Builder, signMesh } from '../mesh.js';
import { Vehicle, VEHICLES, registerVehicle } from '../vehicles.js';
import { Local, ladder } from './common.js';
import { spawnProp } from './props.js';

export const FACTORY = { x0: -300, x1: -190, z0: -105, z1: 10 };
const HALL = { x: -245, z: -55, w: 60, d: 40, h: 9 }; // centre, size along x / z, wall height
const BELT_Y = 1.0, BELT_W = 1.6, BELT_SPEED = 1.6;

const STEEL = 0x8f98a3, STEEL2 = 0x6d7682, YELLOW = 0xffc233, DARK = 0x2f343c, BRICK = 0xb5523b;

export function buildFactory(game, kit) {
  game.belts ||= [];
  yard(game, kit);
  hall(game, kit);
  containers(game, kit);
  stacks(game, kit);
  loadingBay(game, kit);
  forklifts(game);
  carryOnBelts(game);
}

// Loose bodies resting on a belt are eased to its speed (characters ride via groundVelocity).
function carryOnBelts(game) {
  const W = game.physics.world, seen = new Set(), hits = [], rot = { x: 0, y: 0, z: 0, w: 1 };
  const shapes = new Map();
  game.steppers.push(game.whenNear(HALL.x, HALL.z, 100, () => {
    for (const b of game.belts) {
      if (b.x0 < FACTORY.x0 || b.x1 > FACTORY.x1) continue; // this factory's belts only
      let sh = shapes.get(b);
      if (!sh) shapes.set(b, sh = new RAPIER.Cuboid((b.x1 - b.x0) / 2, 0.3, (b.z1 - b.z0) / 2));
      seen.clear();
      W.intersectionsWithShape({ x: (b.x0 + b.x1) / 2, y: b.y + 0.3, z: (b.z0 + b.z1) / 2 }, rot, sh, (col) => {
        const body = col.parent();
        if (!body || !body.isDynamic() || seen.has(body.handle)) return true;
        seen.add(body.handle);
        const owner = game.physics.handleOwner.get(col.handle);
        if (!owner?.bodies) hits.push(body); // characters ride via groundVelocity
        return true;
      }, RAPIER.QueryFilterFlags.EXCLUDE_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      // (bodies can't be changed inside the query callback: Rapier throws)
      for (const body of hits) {
        const v = body.linvel();
        body.setLinvel({ x: v.x + (b.vx - v.x) * 0.35, y: v.y, z: v.z + (b.vz - v.z) * 0.35 }, true);
      }
      hits.length = 0;
    }
  }));
}

// ---- yard: asphalt, fence, gate sign ---------------------------------------------------------
function yard(game, kit) {
  const { x0, x1, z0, z1 } = FACTORY;
  kit.deco((x0 + x1) / 2, 0.03, -11, x1 - x0, 0.06, 42, 0x4f535b); // yard asphalt (z -32..10)
  kit.deco((x0 + x1) / 2, 0.035, -78, x1 - x0 - 4, 0.06, 50, 0x8b8f96); // concrete round the hall
  for (let x = x0 + 8; x < x1 - 6; x += 9) kit.deco(x, 0.07, -11, 4, 0.02, 0.2, 0xffffff); // lane dashes
  for (let x = -282; x <= -258; x += 4) kit.deco(x, 0.07, 3, 0.15, 0.02, 5, 0xffffff); // parking bays
  // fence round the north and west, the gate on the east by the road
  kit.fence(x0, z0, x1, z0, 0x9aa3ad, 2.2);
  kit.fence(x0, z0, x0, z1, 0x9aa3ad, 2.2);
  kit.fence(x1, z0, x1, -8, 0x9aa3ad, 2.2);
  for (const z of [-8, 8]) { kit.cyl(x1, 3, z, 0.35, 6, YELLOW, { seg: 10 }); kit.sphere(x1, 6.2, z, 0.45, DARK); }
  kit.deco(x1, 5.4, 0, 0.6, 1.6, 16.6, DARK);
  const s = signMesh('WOBBLE WORKS', 12, '#ff8a2a');
  s.position.set(x1 + 0.35, 5.4, 0); s.rotation.y = Math.PI / 2;
  game.scene.add(s);
  // a water tank on legs
  const tx = -205, tz = -92;
  for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) kit.cyl(tx + ox, 5, tz + oz, 0.2, 10, STEEL2, { seg: 6 });
  kit.cyl(tx, 12, tz, 3.2, 4.5, 0x5fa8d6, { seg: 18 });
  kit.cone(tx, 15.1, tz, 3.4, 1.7, 0x4a8ab3, { seg: 18 });
  ladder(game, tx + 3.25, tz, 0, 14.2, -1, 0, 0.35);
  kit.deco(tx + 3.1, 7.1, tz, 0.1, 14.2, 0.7, 0xdddddd);
  // lamps along the yard
  for (let x = x0 + 14; x < x1; x += 26) kit.lamp(x, -31);
}

// ---- the hall ---------------------------------------------------------------------------------
function hall(game, kit) {
  const { x, z, w, d, h } = HALL, hw = w / 2, hd = d / 2, t = 0.5;
  const L = new Local(kit, x, z, 0);
  L.deco(0, 0.06, 0, w - 1, 0.1, d - 1, 0xa7aab0);  // floor
  for (let i = -2; i <= 2; i++) L.deco(i * 11, 0.12, 0, 0.12, 0.02, d - 3, YELLOW); // floor markings
  // walls: brick base with steel cladding above; big roller doors on the south side, a
  // people door on the east, windows along the north
  const wall = (ax, az, bx, bz, holes) => { L.wall(ax, az, bx, bz, 3, t, BRICK, holes); L.wall(ax, az, bx, bz, h - 3, t, STEEL, holes.filter((o) => o.h > 3).map((o) => ({ ...o, h: o.h - 3 })), 3); };
  wall(-hw, hd, hw, hd, [{ at: 15, w: 8, h: 6.5 }, { at: 45, w: 8, h: 6.5 }]);                 // south (yard)
  wall(-hw, -hd, hw, -hd, []);                                                               // north
  wall(-hw, -hd, -hw, hd, []);                                                               // west
  wall(hw, -hd, hw, hd, [{ at: 28, w: 3, h: 3.2 }]);                                         // east
  for (let i = 0; i < 6; i++) L.window(-hw, -hd, hw, -hd, 6 + i * 9.6, 5.2, 5, 2, t);       // north windows
  for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) L.deco(-hw + 15 + i * 30 + sx * 4.6, 3.4, hd + 0.3, 0.6, 6.8, 0.5, YELLOW); // door posts
  for (let i = 0; i < 2; i++) L.deco(-hw + 15 + i * 30, 7.0, hd + 0.3, 9.8, 0.6, 0.5, YELLOW);
  // roller-door stripes (rolled up above the opening)
  for (let i = 0; i < 2; i++) L.deco(-hw + 15 + i * 30, 7.8, hd - 0.1, 8.4, 1.0, 0.6, STEEL2);
  // saw-tooth roof: a flat solid deck you can walk on, five north-light ridges with skylights
  L.box(0, h + 0.15, 0, w + 0.6, 0.3, d + 0.6, 0x7b828c);
  for (let i = 0; i < 5; i++) {
    const lz = -hd + 4 + i * 8;
    L.deco(0, h + 1.4, lz + 1.6, w, 0.15, 5.6, 0x9aa3ad, { euler: [-0.45, 0, 0] });   // sloped slope
    L.deco(0, h + 1.4, lz - 1.15, w, 2.6, 0.12, 0x9fd8ff);                             // glass face
  }
  for (const ox of [-20, 0, 20]) for (const oz of [-9, 9]) game.interiorLights.add(x + ox, h - 1.2, z + oz, { color: 0xfff2d8, intensity: 12, range: 16 });
  // mezzanine catwalk along the north wall with stairs at the west end
  const my = 4;
  L.box(2, my, -hd + 2.2, w - 12, 0.25, 3.4, STEEL2);
  L.rail(-hw + 11, -hd + 3.9, hw - 4, -hd + 3.9, my + 0.12, 1.0, YELLOW);
  L.stairs(-hw + 9.4, -hd + 14, 0, -hw + 9.4, -hd + 3.9, my, 2.4, STEEL2);
  // shelving with boxes along the east end
  for (let i = 0; i < 3; i++) {
    const sz = -12 + i * 7;
    for (const yy of [0.1, 1.6, 3.1]) L.box(hw - 3, yy, sz, 2, 0.12, 5, STEEL2);
    for (const ox of [-0.9, 0.9]) for (const oz of [-2.4, 2.4]) L.deco(hw - 3 + ox, 1.8, sz + oz, 0.12, 3.6, 0.12, YELLOW);
    for (const yy of [0.6, 2.1, 3.6]) for (let k = -1; k <= 1; k++) L.deco(hw - 3, yy, sz + k * 1.5, 1.2, 0.8, 1.1, [0xd9a35e, 0xc7894a, 0xe3b26f][(i + k + 3) % 3]);
  }
  // two conveyor lines across the hall (opposite directions)
  conveyor(game, kit, L, -62, 1);
  conveyor(game, kit, L, -48, -1);
  // a few loose crates and barrels on the floor
  for (let i = 0; i < 4; i++) spawnProp(game, 'crate', x + 18 + (i % 2) * 1.0, z + 12 + Math.floor(i / 2) * 1.0);
  for (let i = 0; i < 3; i++) spawnProp(game, 'barrel', x - 24 + i * 0.9, z + 15);
}

// One conveyor line along x at world z = cz, carrying toward +x (dir 1) or -x (dir -1):
// a dispenser drops a toy box at the start every few seconds, the belt carries it through the
// wrapping machine into the bin at the far end, and boxes in the bin go back into the
// dispenser's queue (a fixed pool, so nothing piles up).
function conveyor(game, kit, L, cz, dir) {
  const x0 = HALL.x - 22, x1 = HALL.x + 16, len = x1 - x0, mx = (x0 + x1) / 2;
  const start = dir > 0 ? x0 + 1.2 : x1 - 1.2, end = dir > 0 ? x1 : x0;
  // frame: legs, rollers and side rails (the belt surface is its own collider)
  kit.box(mx, BELT_Y - 0.12, cz, len, 0.24, BELT_W, DARK);
  for (let lx = x0 + 1; lx < x1; lx += 3) for (const s of [-1, 1]) kit.deco(lx, (BELT_Y - 0.2) / 2, cz + s * (BELT_W / 2 - 0.1), 0.12, BELT_Y - 0.2, 0.12, STEEL2);
  for (const s of [-1, 1]) kit.box(mx, BELT_Y + 0.15, cz + s * (BELT_W / 2 + 0.06), len, 0.3, 0.1, YELLOW);
  // moving surface: a canvas stripe texture scrolled along the belt
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
  const g = cv.getContext('2d'); g.fillStyle = '#2b2d31'; g.fillRect(0, 0, 64, 8); g.fillStyle = '#3d4046';
  for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 7, 8);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(len / 1.0, 1); tex.colorSpace = THREE.SRGBColorSpace;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(len, BELT_W - 0.2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex }));
  top.position.set(mx, BELT_Y + 0.005, cz); top.receiveShadow = true;
  game.scene.add(top);
  game.updaters.push(game.whenNear(mx, cz, 90, (dt) => { tex.offset.x -= dir * BELT_SPEED * dt; }));
  game.belts.push({ x0, x1, z0: cz - BELT_W / 2, z1: cz + BELT_W / 2, y: BELT_Y, vx: dir * BELT_SPEED, vz: 0 });
  // dispenser hopper over the start, the wrapping machine half way, the bin past the end
  const hx = dir > 0 ? x0 + 1.2 : x1 - 1.2;
  kit.box(hx, BELT_Y + 2.6, cz, 2.2, 1.6, 2.2, 0x3f8cff);
  kit.deco(hx, BELT_Y + 1.55, cz, 1.4, 0.5, 1.4, 0x2c6fd1);
  for (const s of [-1, 1]) kit.box(hx, BELT_Y + 1.6, cz + s * 1.0, 2.2, 1.8, 0.2, 0x3f8cff); // sides along the belt
  kit.box(hx - dir * 1.1, BELT_Y + 1.0, cz, 0.2, 2.0, 2.2, 0x3f8cff);                          // back plate
  const wx = mx;
  for (const s of [-1, 1]) kit.box(wx, BELT_Y + 1.1, cz + s * 1.1, 3.2, 2.2, 0.3, 0xff5a8a);
  kit.box(wx, BELT_Y + 2.35, cz, 3.2, 0.3, 2.5, 0xff5a8a);
  kit.deco(wx, BELT_Y + 2.6, cz, 1.6, 0.25, 1.0, YELLOW);
  const bx = end + dir * 1.8;
  kit.box(bx, 0.1, cz, 2.6, 0.2, 2.6, STEEL2);
  for (const [ox, oz, w, d] of [[1.25, 0, 0.12, 2.6], [-1.25, 0, 0.12, 2.6], [0, 1.25, 2.6, 0.12], [0, -1.25, 2.6, 0.12]]) kit.box(bx + ox, 0.45, cz + oz, w, 0.7, d, 0x55a84a); // walls below the belt top, so boxes drop in
  // the toy boxes: a pool that loops dispenser -> belt -> bin -> dispenser
  const cols = [0xff5a5a, 0xffd23f, 0x3f8cff, 0x55d85a, 0xb46cff, 0xff8a3d];
  const pool = [];
  for (let i = 0; i < 7; i++) {
    const b = new Builder(), c = cols[(i + (dir > 0 ? 0 : 3)) % cols.length];
    b.rbox(0.62, 0.48, 0.62, 0.05, c, [0, 0, 0]);
    b.box(0.64, 0.08, 0.14, 0xffffff, [0, 0.02, 0]); b.box(0.14, 0.08, 0.64, 0xffffff, [0, 0.02, 0]); // ribbon
    b.box(0.64, 0.5, 0.14, 0xffffff, [0, 0, 0]);
    const o = game.physics.dynamic({ x: bx, y: -20 - i, z: cz }, [RAPIER.ColliderDesc.cuboid(0.31, 0.24, 0.31).setMass(4).setFriction(0.8)], b.mesh(), { angDamp: 0.6 });
    game.scene.add(o.mesh);
    o.body.setEnabled(false); o.mesh.visible = false; o.parked = true;
    pool.push(o);
  }
  let t = 0;
  const p0 = { x: start, y: BELT_Y + 0.6, z: cz };
  game.steppers.push(game.whenNear(mx, cz, 120, (dt) => {
    t += dt ?? 1 / 60;
    if (t > 3.2) { // drop the next box
      const o = pool.find((p) => p.parked);
      if (o) {
        t = 0; o.parked = false; o.mesh.visible = true; o.body.setEnabled(true);
        o.body.setTranslation(p0, true); o.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        o.body.setLinvel({ x: 0, y: -0.5, z: 0 }, true); o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        if (o.rec) o.rec.snap = true;
      }
    }
    for (const o of pool) {
      if (o.parked) continue;
      const p = o.body.translation();
      // in the bin (or knocked far away / fallen through): back into the queue after a moment
      const inBin = Math.abs(p.x - bx) < 1.2 && Math.abs(p.z - cz) < 1.2 && p.y < 1.4;
      const lost = Math.hypot(p.x - mx, p.z - cz) > 70 || p.y < -5;
      o.binT = inBin ? (o.binT || 0) + 1 / 60 : 0;
      if (o.binT > 2.5 || lost) { o.parked = true; o.binT = 0; o.body.setEnabled(false); o.mesh.visible = false; o.body.setTranslation({ x: bx, y: -20, z: cz }, false); }
    }
  }));
}

// ---- shipping containers -----------------------------------------------------------------------
function containers(game, kit) {
  const cols = [0xd9483f, 0x3f7fd0, 0x3fae5a, 0xffa23a, 0x8a5ad1, 0x2fb5b0, 0xe8c547];
  const box = (x, y, z, yaw, c) => {
    const l = 6.1, w = 2.44, h = 2.6;
    kit.box(x, y + h / 2, z, l, h, w, c, { yaw });
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (let k = -2; k <= 2; k++) { // corrugation ribs on both long sides
      for (const s of [-1, 1]) {
        const ox = k * 1.15, oz = s * (w / 2 + 0.03);
        kit.deco(x + ox * cs + oz * sn, y + h / 2, z - ox * sn + oz * cs, 0.18, h - 0.2, 0.06, c, { yaw });
      }
    }
    const ex = (l / 2 + 0.03); // door end bars
    for (const k of [-0.5, 0.5]) kit.deco(x + ex * cs + k * sn, y + h / 2, z - ex * sn + k * cs, 0.06, h - 0.3, 0.08, 0x333333, { yaw });
  };
  let n = 0;
  // a stepped stack along the west fence (climb from the low end)
  const rows = [[-293, -24, 1], [-293, -16, 2], [-293, -8, 3], [-293, 0, 2]];
  for (const [x, z, hgt] of rows) for (let k = 0; k < hgt; k++) box(x, k * 2.6, z, Math.PI / 2, cols[(n++) % cols.length]);
  ladder(game, -291.6, -1.6, 0, 5.2, 0, -1, 0.35);
  // a loose cluster in the yard
  box(-268, 0, -20, 0, cols[(n++) % cols.length]); box(-268, 2.6, -20, 0.08, cols[(n++) % cols.length]);
  box(-260, 0, -22.6, 0, cols[(n++) % cols.length]);
  box(-276, 0, 6, Math.PI / 2 + 0.2, cols[(n++) % cols.length]);
}

// ---- smokestacks with smoke ---------------------------------------------------------------------
function stacks(game, kit) {
  const spots = [[-284, -84], [-284, -66]], H = 30;
  for (const [x, z] of spots) {
    kit.cyl(x, H / 2, z, 1.5, H, 0xeeeeee, { seg: 16, rTop: 1.2 });
    for (const y of [6, 14, 22, 28.5]) kit.deco(x, y, z, 3.0 - y * 0.02, 1.6, 3.0 - y * 0.02, 0xd9483f, { round: 1.2 });
    kit.box(x, 0.6, z, 4, 1.2, 4, BRICK);
  }
  // smoke: soft grey puffs rising and swelling, one instanced set for both stacks
  const N = 14, geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xdedede, transparent: true, opacity: 0.55, depthWrite: false });
  const puffs = new THREE.InstancedMesh(geo, mat, N * spots.length);
  puffs.frustumCulled = false; puffs.userData.noCull = true;
  game.scene.add(puffs);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  game.updaters.push(game.whenNear(-284, -75, 600, (dt, time) => {
    spots.forEach(([x, z], si) => {
      for (let i = 0; i < N; i++) {
        const k = ((time * 0.09 + i / N + si * 0.37) % 1);
        p.set(x + k * 9 + Math.sin(i * 3.1 + time * 0.5) * 0.8, H + 1 + k * 16, z + Math.cos(i * 1.7) * 0.8 + k * 3);
        const r = 1.1 + k * 3.2;
        s.set(r, r * 0.85, r);
        m.compose(p, q, s); puffs.setMatrixAt(si * N + i, m);
      }
    });
    puffs.instanceMatrix.needsUpdate = true;
  }));
}

// ---- loading bay: lorry, pallets, crates ------------------------------------------------------------
function loadingBay(game, kit) {
  const dx = HALL.x + 15, dz = HALL.z + HALL.d / 2; // the east roller door
  kit.box(dx, 0.6, dz + 2.4, 10, 1.2, 4.6, 0x8b8f96);                 // dock platform
  for (const s of [-1, 1]) kit.deco(dx + s * 5, 0.6, dz + 4.75, 0.3, 1.2, 0.2, YELLOW);
  kit.wedge(dx - 7.5, 0, dz + 2.4, 4.6, 5, 1.2, 0x8b8f96, { yaw: Math.PI / 2 }); // ramp up to the dock
  const s = signMesh('LOADING BAY', 7, '#2a3a6a');
  s.position.set(dx, 8.3, dz + 0.35); game.scene.add(s);
  // pallets of crates (the crates are loose: lift a pallet with a forklift)
  for (let i = 0; i < 3; i++) {
    const px = -232 + i * 4.5, pz = -22;
    const pb = new Builder();
    pb.box(1.2, 0.06, 1.2, 0xc8a06a, [0, 0.1, 0]);
    for (const k of [-0.55, 0.55]) pb.box(0.1, 0.2, 1.2, 0xb08a58, [k, -0.03, 0]);
    for (const z of [-0.5, 0, 0.5]) pb.box(1.2, 0.02, 0.12, 0xb08a58, [0, -0.12, z]);
    // solid parts: the deck on two runners, leaving a slot underneath for the forks (0..0.2 m)
    const pal = game.physics.dynamic({ x: px, y: 0.13, z: pz }, [
      RAPIER.ColliderDesc.cuboid(0.6, 0.03, 0.6).setTranslation(0, 0.1, 0).setMass(12),
      ...[-0.55, 0.55].map((k) => RAPIER.ColliderDesc.cuboid(0.05, 0.1, 0.6).setTranslation(k, -0.03, 0).setMass(4)),
    ], pb.mesh(), { angDamp: 0.6, friction: 0.9 });
    game.scene.add(pal.mesh);
    for (let k = 0; k < 2; k++) spawnProp(game, 'crate', px + (k ? 0.28 : -0.28), pz, 0.27);
  }
  // the lorry at the dock
  const lorry = VEHICLES.delivery ? 'delivery' : 'pickup';
  game.vehicles.push(new Vehicle(game, lorry, dx, 1.2, dz + 9, Math.PI, 0xff8a2a));
}

// ---- forklifts: drive with the usual controls, A raises the forks, B lowers them ---------------
registerVehicle('forklift', {
  mass: 1600, half: [0.62, 0.32, 1.05],
  axles: [
    { z: 0.62, x: 0.6, y: -0.05, r: 0.34, rest: 0.22, steer: 0, drive: 1 },
    { z: -0.62, x: 0.58, y: -0.05, r: 0.28, rest: 0.22, steer: -1, drive: 0, hand: true },
  ],
  accel: 6, maxSpeed: 9, rev: 5, brakeDecel: 12, steer: 0.75, grip: 1.6,
  susp: { k: 30, c: 2.6 }, com: [0, -0.45, 0.1],
  seats: [{ pos: [0, 0.45, -0.25], kind: 'driver' }],
  camH: 2.0, camDist: 7.5, horn: 'truck', voice: 'quad', lights: { head: [0.45, 1.05] },
  driveHint: (G) => `${G('GAS')} Gas ${G('BRAKE')} Reverse ${G('A')} Raise forks ${G('B')} Lower ${G('Y')} Get out`,
  colliders(add, C) {
    add(C.cuboid(0.62, 0.32, 1.05));                                     // body
    add(C.cuboid(0.6, 0.35, 0.28).setTranslation(0, 0.4, -0.85).setMass(150)); // counterweight
    add(C.cuboid(0.05, 1.1, 0.05).setTranslation(0.5, 0.95, 1.1));     // mast
    add(C.cuboid(0.05, 1.1, 0.05).setTranslation(-0.5, 0.95, 1.1));
    add(C.cuboid(0.62, 0.05, 0.6).setTranslation(0, 1.85, -0.1));      // overhead guard
  },
  mesh(b, def, c, P) {
    b.rbox(1.24, 0.64, 2.1, 0.1, YELLOW, [0, 0, 0]);
    b.rbox(1.2, 0.7, 0.56, 0.12, DARK, [0, 0.4, -0.85]);                 // counterweight
    b.rbox(0.6, 0.12, 0.5, 0.04, 0x222228, [0, 0.42, -0.25]);            // seat
    b.rbox(0.6, 0.6, 0.1, 0.04, 0x222228, [0, 0.7, -0.5]);
    for (const sx of [-0.55, 0.55]) for (const z of [0.35, -0.55]) b.cyl(0.04, 0.04, 1.6, DARK, [sx, 1.1, z], null, 6);
    b.box(1.24, 0.08, 1.1, DARK, [0, 1.88, -0.1]);                        // guard roof
    for (const sx of [-0.5, 0.5]) b.box(0.1, 2.2, 0.1, DARK, [sx, 0.95, 1.1]); // mast rails
    b.cyl(0.14, 0.14, 0.03, 0x222228, [0, 0.82, 0.25], [-1.0, 0, 0], 10);  // wheel
    void def; void P; void c;
  },
});

// The fork carriage is its own collider on the forklift's body, moved up and down the mast
// (setTranslationWrtParent), with its own mesh in the wobbling shell.
const FORK0 = -0.44; // fork height on the body at the bottom: ~0.07 m off the ground (the body rests at 0.48), into a pallet's slot
function forklifts(game) {
  const spots = [[-246, -18, 0], [-252, -14, 0.4], [-214, -26, Math.PI / 2]];
  for (const [x, z, yaw] of spots) {
    const v = new Vehicle(game, 'forklift', x, 0.6, z, yaw, YELLOW);
    game.vehicles.push(v);
    const W = game.physics.world;
    const forks = [-0.32, 0.32].map((fx) => W.createCollider(RAPIER.ColliderDesc.cuboid(0.07, 0.03, 0.55).setTranslation(fx, FORK0, 1.72).setMass(20)
      .setCollisionGroups(v.body.collider(0).collisionGroups()).setFriction(1.4), v.body));
    const back = W.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 0.3, 0.03).setTranslation(0, FORK0 + 0.27, 1.18).setMass(20)
      .setCollisionGroups(v.body.collider(0).collisionGroups()), v.body);
    for (const c of [...forks, back]) game.physics.handleOwner.set(c.handle, v);
    const fb = new Builder();
    for (const fx of [-0.32, 0.32]) fb.box(0.14, 0.06, 1.1, DARK, [fx, 0, 0.55]);
    fb.box(1.1, 0.6, 0.06, DARK, [0, 0.27, 0]);
    for (const k of [-0.3, 0, 0.3]) fb.box(0.04, 0.6, 0.07, YELLOW, [k, 0.27, 0.01]);
    const carriage = fb.mesh();
    (v.shell || v.mesh).add(carriage);
    let h = 0, target = 0; // fork height above the bottom (m), 0..1.9
    v.forkHeight = () => h;
    const place = () => {
      forks.forEach((c, i) => c.setTranslationWrtParent({ x: i ? 0.32 : -0.32, y: FORK0 + h, z: 1.72 }));
      back.setTranslationWrtParent({ x: 0, y: FORK0 + 0.27 + h, z: 1.18 });
      carriage.position.set(0, FORK0 + h, 1.17);
    };
    const seat = v.seats.find((s) => s.kind === 'driver');
    seat.control = (inp) => {
      v.handbrake = false; // A is the forks here, not the handbrake
      target = Math.max(0, Math.min(1.9, target + ((inp.jump ? 1 : 0) - (inp.ragdoll ? 1 : 0)) * 0.9 / 60));
    };
    game.steppers.push(() => {
      if (!seat.occupant) target = Math.max(0, target - 0.4 / 60); // forks settle when nobody drives
      if (Math.abs(target - h) < 1e-4) return;
      h += Math.max(-0.9 / 60, Math.min(0.9 / 60, target - h));
      if (v.body.isSleeping()) v.body.wakeUp();
      place();
    });
    place();
  }
}
