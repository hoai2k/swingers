// Amusement park: ferris wheel, carousel, roller coaster, swing ride, drop
// tower, bumper cars and a bouncy castle. Rides are kinematic bodies animated
// every physics step; players board them through seats (Y).
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { VEH_GROUPS } from '../config.js';
import { Builder, signMesh, matVC } from '../mesh.js';
import { addSeat } from './playground.js';
import { Vehicle } from '../vehicles.js';

const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// Kinematic body with optional colliders and a mesh that follows it (added to
// `parent`, the scene by default). Shared with the fair rides (regions/fair/).
export function kinematic(game, pos, descs, mesh, parent = game.scene) {
  const W = game.physics.world;
  const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
  for (const d of descs) { d.setCollisionGroups(VEH_GROUPS); W.createCollider(d, body); }
  if (mesh) parent.add(mesh);
  game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  return body;
}
export const setPose = (body, p, q) => {
  body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
  body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
};

export function buildPark(game, kit) {
  // ground paths
  kit.deco(-242, 0.03, 0, 108, 0.06, 8, 0xe9d6a8);
  kit.deco(-215, 0.03, 0, 8, 0.06, 150, 0xe9d6a8);
  kit.deco(-262, 0.03, 0, 8, 0.06, 150, 0xe9d6a8);
  gate(game, kit);
  ferrisWheel(game, kit, -250, -62);
  carousel(game, kit, -228, -28);
  swingRide(game, kit, -228, 32);
  dropTower(game, kit, -282, 0);
  bumperCars(game, kit, -252, 42);
  bouncyCastle(game, kit, -205, -78);
  coaster(game, kit);
  stalls(game, kit);
}

function gate(game, kit) {
  const x = -188;
  for (const z of [-6.5, 6.5]) {
    kit.cyl(x, 4, z, 0.7, 8, 0xff5a8a, { seg: 10 });
    kit.sphere(x, 8.6, z, 1.0, 0xffd23f);
  }
  kit.deco(x, 7.4, 0, 1.2, 1.6, 14, 0xffffff);
  const s = signMesh('FUN PARK', 11, '#ff5a8a');
  s.position.set(x + 0.65, 7.4, 0); s.rotation.y = Math.PI / 2;
  game.scene.add(s);
  // perimeter fence
  kit.fence(-188, -105, -188, -9, 0xffffff, 1.4);
  kit.fence(-188, 9, -188, 105, 0xffffff, 1.4);
  kit.fence(-188, 105, -300, 105, 0xffffff, 1.4);
  kit.fence(-188, -105, -300, -105, 0xffffff, 1.4);
  kit.fence(-300, -105, -300, 105, 0xffffff, 1.4);
  // bunting flags along the main path
  for (let i = 0; i < 9; i++) {
    const px = -196 - i * 10;
    kit.cyl(px, 2.5, -5, 0.08, 5, 0x777777); kit.cyl(px, 2.5, 5, 0.08, 5, 0x777777);
    const b = kit.b(px, 0);
    for (let k = 0; k < 7; k++) b.cone(0.35, 0.6, [0xff5a5a, 0xffd23f, 0x3f8cff, 0x55d85a][k % 4], [px, 4.65 - Math.sin(k / 6 * Math.PI) * 0.4, -4 + k * 1.33], [Math.PI, 0, 0], 3);
  }
}

function ferrisWheel(game, kit, cx, cz) {
  const H = 17, R = 14, n = 10;
  // A-frame supports either side
  for (const sx of [-2.2, 2.2]) for (const sz of [-1, 1]) {
    const ang = Math.atan2(sz * 7, H);
    kit.cyl(cx + sx, H / 2, cz + sz * 3.5, 0.35, H / Math.cos(ang), 0xffffff, { euler: [-sz * ang, 0, 0] });
  }
  kit.cyl(cx, H, cz, 0.6, 5, 0xdddddd, { euler: [0, 0, Math.PI / 2] });
  // boarding platform
  kit.box(cx, 0.4, cz, 6, 0.8, 5, 0xff5a8a);
  for (let i = 0; i < 3; i++) kit.box(cx, 0.13 * (i + 1) - 0.0, cz + 3.0 + (2 - i) * 0.5, 4, 0.26 * (i + 1), 0.5, 0xffd23f);
  // wheel
  const wb = new Builder();
  for (const sx of [-0.9, 0.9]) {
    wb.add(new THREE.TorusGeometry(R, 0.18, 6, 64), 0xff5a8a, [sx, 0, 0], [0, Math.PI / 2, 0]);
    wb.add(new THREE.TorusGeometry(R * 0.55, 0.12, 6, 48), 0xffd23f, [sx, 0, 0], [0, Math.PI / 2, 0]);
    for (let i = 0; i < n * 2; i++) {
      const a = i / (n * 2) * Math.PI * 2;
      wb.cyl(0.07, 0.07, R, 0xffffff, [sx, Math.sin(a) * R / 2, Math.cos(a) * R / 2], [a, 0, 0], 4);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    wb.cyl(0.08, 0.08, 1.8, 0xdddddd, [0, Math.sin(a) * R, Math.cos(a) * R], [0, 0, Math.PI / 2], 6);
    wb.sphere(0.25, [0xff5a5a, 0xffd23f, 0x3f8cff, 0x55d85a][i % 4], [0, Math.sin(a) * (R + 0.4), Math.cos(a) * (R + 0.4)]);
  }
  wb.cyl(1.0, 1.0, 2.4, 0xffd23f, [0, 0, 0], [0, 0, Math.PI / 2], 16);
  const wheel = kinematic(game, { x: cx, y: H, z: cz }, [RAPIER.ColliderDesc.cylinder(1.2, 1.0).setRotation({ x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) })], wb.mesh());
  const cabins = [];
  const cols = [0xff5a5a, 0x3f8cff, 0x55d85a, 0xffd23f, 0xb46cff];
  for (let i = 0; i < n; i++) {
    const b = new Builder(), c = cols[i % cols.length];
    b.rbox(1.6, 0.12, 1.8, 0.05, c, [0, -0.6, 0]);
    b.rbox(1.6, 0.6, 0.1, 0.04, c, [0, -0.3, 0.85]); b.rbox(1.6, 0.6, 0.1, 0.04, c, [0, -0.3, -0.85]);
    b.rbox(0.1, 0.5, 1.8, 0.04, 0xffffff, [0.78, -0.35, 0]); b.rbox(0.1, 0.5, 1.8, 0.04, 0xffffff, [-0.78, -0.35, 0]);
    b.box(1.4, 0.2, 0.4, 0xffffff, [0, -0.45, 0.6]); b.box(1.4, 0.2, 0.4, 0xffffff, [0, -0.45, -0.6]);
    b.rbox(1.8, 0.12, 2.0, 0.05, c, [0, 1.2, 0]);
    for (const [x, z] of [[0.75, 0.85], [-0.75, 0.85], [0.75, -0.85], [-0.75, -0.85]]) b.cyl(0.03, 0.03, 1.8, 0xdddddd, [x, 0.3, z], null, 4);
    b.cyl(0.05, 0.05, 1.3, 0x999999, [0, 1.9, 0], null, 6);
    const body = kinematic(game, { x: cx, y: 1.5, z: cz }, [
      RAPIER.ColliderDesc.cuboid(0.8, 0.06, 0.9).setTranslation(0, -0.6, 0),
      // grab-ons: roof, rails and ends (hang off a gondola as it goes round)
      RAPIER.ColliderDesc.cuboid(0.9, 0.06, 1.0).setTranslation(0, 1.2, 0),
      RAPIER.ColliderDesc.cuboid(0.05, 0.25, 0.9).setTranslation(0.78, -0.35, 0),
      RAPIER.ColliderDesc.cuboid(0.05, 0.25, 0.9).setTranslation(-0.78, -0.35, 0),
      RAPIER.ColliderDesc.cuboid(0.8, 0.3, 0.05).setTranslation(0, -0.3, 0.85),
      RAPIER.ColliderDesc.cuboid(0.8, 0.3, 0.05).setTranslation(0, -0.3, -0.85),
    ], b.mesh());
    cabins.push(body);
    for (const s of [1, -1]) addSeat(game, { body, pos: [0, -0.2, s * 0.55], yaw: s > 0 ? Math.PI : 0, label: 'Ride', hint: 'Enjoy the view! · Y exit', exit: [0, -0.2, s * 2.2], exitPush: 1.5 });
  }
  for (const b of [wheel, ...cabins]) game.physics.kinRange.set(b.handle, 700); // a big landmark, seen from afar
  game.physics.animate(wheel, (t) => {
    const ang = t * 0.07;
    _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
    setPose(wheel, { x: cx, y: H, z: cz }, _q);
    cabins.forEach((body, i) => {
      const a = ang + i / n * Math.PI * 2;
      const sway = Math.sin(t * 0.9 + i) * 0.04;
      _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), sway);
      const y = H + Math.sin(a) * R - 1.5;
      setPose(body, { x: cx, y, z: cz + Math.cos(a) * R }, _q);
    });
  });
}

function carousel(game, kit, cx, cz) {
  const R = 7.5;
  kit.cyl(cx, 0.15, cz, R + 0.6, 0.3, 0xffd23f, { seg: 28, collide: false });
  kit.cyl(cx, 3, cz, 0.45, 6, 0xffd23f);
  // canopy
  const b0 = kit.b(cx, cz);
  for (let k = 0; k < 16; k++) b0.add(new THREE.ConeGeometry(R + 0.8, 2.4, 16, 1, false, k * Math.PI / 8, Math.PI / 8), k % 2 ? 0xffffff : 0xff5a8a, [cx, 6.9, cz]);
  b0.cyl(R + 0.8, R + 0.8, 0.6, 0xffd23f, [cx, 5.5, cz], null, 28);
  b0.sphere(0.5, 0xff5a8a, [cx, 8.3, cz]);
  const pb = new Builder();
  pb.cyl(R, R, 0.3, 0xffffff, [0, 0, 0], null, 32);
  for (let k = 0; k < 16; k++) pb.add(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.31, 16, 1, false, k * Math.PI / 8, Math.PI / 16), 0x6ac8ff, [0, 0, 0]);
  const plat = kinematic(game, { x: cx, y: 0.45, z: cz }, [RAPIER.ColliderDesc.cylinder(0.15, R).setFriction(1.2)], pb.mesh());
  // horses (visual bobbing, seats fixed to the platform)
  const horses = [];
  const hc = [0xffffff, 0xffd23f, 0xff7fc8, 0x8a5a3a, 0x6ac8ff, 0xb46cff];
  const ring = [[R - 1.4, 10], [R - 3.6, 6]];
  let hi = 0;
  for (const [r, n] of ring) {
    for (let i = 0; i < n; i++) {
      const a = (i + (r < 5 ? 0.5 : 0)) / n * Math.PI * 2;
      const hb = new Builder(), c = hc[hi % hc.length];
      hb.sphere(0.45, c, [0, 0, 0], [0.7, 0.75, 1.5]);
      hb.sphere(0.28, c, [0, 0.45, 0.6], [0.8, 1, 1.3]);
      hb.cyl(0.08, 0.08, 0.55, c, [0.15, -0.45, 0.4], null, 5); hb.cyl(0.08, 0.08, 0.55, c, [-0.15, -0.45, 0.4], null, 5);
      hb.cyl(0.08, 0.08, 0.55, c, [0.15, -0.45, -0.4], null, 5); hb.cyl(0.08, 0.08, 0.55, c, [-0.15, -0.45, -0.4], null, 5);
      hb.box(0.5, 0.08, 0.5, 0xd9534f, [0, 0.33, -0.05]);
      hb.cyl(0.035, 0.035, 5.2, 0xffd23f, [0, 1.4, 0], null, 6);
      const m = hb.mesh();
      m.position.set(Math.sin(a) * r, 1.0, Math.cos(a) * r);
      m.rotation.y = a + Math.PI / 2;
      horses.push({ m, phase: hi * 1.3 });
      hi++;
      addSeat(game, { body: plat, pos: [Math.sin(a) * r, 0.85, Math.cos(a) * r], yaw: a + Math.PI / 2, label: 'Ride horse', hint: 'Wheee! · Y exit', exit: [Math.sin(a) * (r - 1.1), 0.5, Math.cos(a) * (r - 1.1)] });
    }
  }
  // the brass poles are solid: grab one and the carousel swings you round
  for (const [r, n] of ring) for (let i = 0; i < n; i++) {
    const a = (i + (r < 5 ? 0.5 : 0)) / n * Math.PI * 2;
    game.physics.world.createCollider(RAPIER.ColliderDesc.cylinder(2.3, 0.06).setTranslation(Math.sin(a) * r, 2.6, Math.cos(a) * r).setCollisionGroups(VEH_GROUPS), plat);
  }
  // horses are children of the platform mesh
  const platMesh = game.physics.objects[game.physics.objects.length - 1].mesh;
  for (const h of horses) platMesh.add(h.m);
  game.physics.animate(plat, (t) => {
    _q.setFromAxisAngle(UP, t * 0.45);
    setPose(plat, { x: cx, y: 0.45, z: cz }, _q);
  });
  game.updaters.push(game.whenNear(cx, cz, 220, (dt, t) => { for (const h of horses) h.m.position.y = 0.95 + Math.sin(t * 2.2 + h.phase) * 0.18; }));
}

function swingRide(game, kit, cx, cz) {
  const TOP = 7.5, L = 6.2, R0 = 3.0, n = 12;
  kit.cyl(cx, TOP / 2, cz, 0.6, TOP, 0x3f8cff);
  kit.cyl(cx, 0.1, cz, 9.5, 0.2, 0xe9d6a8, { collide: false, seg: 28 });
  const rb = new Builder();
  rb.cyl(R0 + 0.4, R0 + 0.6, 0.6, 0xffd23f, [0, 0, 0], null, 24);
  for (let k = 0; k < 12; k++) rb.add(new THREE.ConeGeometry(R0 + 0.8, 1.6, 12, 1, false, k * Math.PI / 6, Math.PI / 6), k % 2 ? 0xffffff : 0x3f8cff, [0, 1.1, 0]);
  rb.sphere(0.4, 0xff5a5a, [0, 2.0, 0]);
  const rotor = rb.mesh();
  rotor.position.set(cx, TOP + 0.3, cz);
  game.scene.add(rotor);
  const chairs = [];
  for (let i = 0; i < n; i++) {
    const b = new Builder(), c = [0xff5a5a, 0xffd23f, 0x55d85a, 0xb46cff][i % 4];
    b.rbox(0.6, 0.08, 0.55, 0.03, c, [0, 0, 0]);
    b.rbox(0.6, 0.6, 0.08, 0.03, c, [0, 0.3, -0.26]);
    for (const x of [-0.27, 0.27]) b.cyl(0.012, 0.012, L, 0xbbbbbb, [x, L / 2, 0], null, 4);
    // seat, back and the two chains are solid (grab a chain or the chair and fly round)
    const body = kinematic(game, { x: cx, y: 1, z: cz }, [
      RAPIER.ColliderDesc.cuboid(0.3, 0.04, 0.28),
      RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.04).setTranslation(0, 0.3, -0.26),
      RAPIER.ColliderDesc.cylinder(L / 2 - 0.4, 0.04).setTranslation(0.27, L / 2 + 0.2, 0),
      RAPIER.ColliderDesc.cylinder(L / 2 - 0.4, 0.04).setTranslation(-0.27, L / 2 + 0.2, 0),
    ], b.mesh());
    chairs.push(body);
    addSeat(game, { body, pos: [0, 0.18, 0], yaw: 0, label: 'Swing ride', hint: 'Hold on! · Y exit', exit: [0, 0.2, 0.9] });
  }
  let ang = 0, w = 0;
  game.physics.animate(chairs[0], (t, dt) => {
    const c = t % 40;
    const target = c < 8 ? 0 : c < 34 ? 1.15 : 0;
    w += Math.max(-0.12, Math.min(0.12, target - w)) * dt * 2.5 * 4;
    ang += w * dt;
    // tilt from centrifugal balance (two iterations)
    let tilt = 0;
    for (let k = 0; k < 3; k++) tilt = Math.atan((w * w * (R0 + L * Math.sin(tilt))) / 9.81);
    const r = R0 + L * Math.sin(tilt), y = TOP - L * Math.cos(tilt);
    rotor.rotation.y = ang;
    chairs.forEach((body, i) => {
      const a = ang + i / n * Math.PI * 2;
      // chair faces along the direction of travel; tilt swings it outward
      const outward = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const fwd = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const up = new THREE.Vector3(0, Math.cos(tilt), 0).addScaledVector(outward, -Math.sin(tilt));
      const lf = new THREE.Vector3().crossVectors(up, fwd).normalize();
      _m.makeBasis(lf, up, new THREE.Vector3().crossVectors(lf, up));
      _q.setFromRotationMatrix(_m);
      setPose(body, { x: cx + outward.x * r, y, z: cz + outward.z * r }, _q);
    });
  });
}

function dropTower(game, kit, cx, cz) {
  const H = 36;
  kit.cyl(cx, H / 2, cz, 1.1, H, 0xff5a5a, { seg: 12 });
  for (let i = 0; i < 12; i++) kit.deco(cx, 1 + i * 3, cz, 2.3, 0.3, 2.3, 0xffffff);
  kit.cone(cx, H + 1.2, cz, 1.6, 2.4, 0xffd23f);
  kit.cyl(cx, 0.15, cz, 4, 0.3, 0xffd23f, { seg: 20 });
  const b = new Builder();
  b.torus(2.0, 0.35, 0x3f8cff, [0, 0, 0], [Math.PI / 2, 0, 0], 24);
  const seatsN = 8;
  for (let i = 0; i < seatsN; i++) {
    const a = i / seatsN * Math.PI * 2;
    b.rbox(0.6, 0.12, 0.6, 0.04, 0xffd23f, [Math.sin(a) * 2.0, -0.35, Math.cos(a) * 2.0], [0, a, 0]);
    b.rbox(0.6, 0.9, 0.12, 0.04, 0xffd23f, [Math.sin(a) * 1.7, 0.1, Math.cos(a) * 1.7], [0, a, 0]);
  }
  // seat pans and backs are solid: hang off the ring for the drop
  const ringCols = [];
  for (let i = 0; i < seatsN; i++) {
    const a = i / seatsN * Math.PI * 2, q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
    ringCols.push(RAPIER.ColliderDesc.cuboid(0.3, 0.06, 0.3).setTranslation(Math.sin(a) * 2.0, -0.35, Math.cos(a) * 2.0).setRotation(q));
    ringCols.push(RAPIER.ColliderDesc.cuboid(0.3, 0.45, 0.06).setTranslation(Math.sin(a) * 1.7, 0.1, Math.cos(a) * 1.7).setRotation(q));
  }
  const ring = kinematic(game, { x: cx, y: 1.2, z: cz }, ringCols, b.mesh());
  for (let i = 0; i < seatsN; i++) {
    const a = i / seatsN * Math.PI * 2;
    addSeat(game, { body: ring, pos: [Math.sin(a) * 2.0, -0.15, Math.cos(a) * 2.0], yaw: a, label: 'Drop tower', hint: 'Here we go… · Y exit', exit: [Math.sin(a) * 3.3, 0, Math.cos(a) * 3.3], exitPush: 1.5 });
  }
  const low = 1.2, high = 31;
  game.physics.kinRange.set(ring.handle, 700); // a big landmark, seen from afar
  game.physics.animate(ring, (t) => {
    const c = t % 34;
    let y;
    if (c < 8) y = low;
    else if (c < 22) { const k = (c - 8) / 14; y = low + (high - low) * (k * k * (3 - 2 * k)); }
    else if (c < 25) y = high;
    else {
      const ft = c - 25, fall = 0.5 * 9.81 * ft * ft;
      const brakeAt = 12;
      if (high - fall > brakeAt) y = high - fall;
      else {
        const tb = Math.sqrt(2 * (high - brakeAt) / 9.81), vb = 9.81 * tb, dtb = ft - tb;
        const dec = vb * vb / (2 * (brakeAt - low));
        y = Math.max(low, brakeAt - (vb * dtb - 0.5 * dec * dtb * dtb));
        if (dtb > vb / dec) y = low;
      }
    }
    _q.setFromAxisAngle(UP, t * 0.1);
    setPose(ring, { x: cx, y, z: cz }, _q);
  });
}

function bumperCars(game, kit, cx, cz) {
  const w = 26, d = 18;
  kit.box(cx, 0.08, cz, w, 0.16, d, 0x6a6f86, { friction: 0.4 });
  const wall = (x, z, ww, dd) => kit.box(x, 0.45, z, ww, 0.6, dd, 0xff5a5a, { restitution: 0.9 });
  wall(cx, cz - d / 2, w, 0.5); wall(cx, cz + d / 2, w, 0.5); wall(cx - w / 2, cz, 0.5, d); wall(cx + w / 2, cz - 5.5, 0.5, 7); wall(cx + w / 2, cz + 5.5, 0.5, 7);
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) kit.cyl(cx + x, 2.5, cz + z, 0.2, 5, 0xffd23f);
  const b = kit.b(cx, cz);
  b.box(w + 1, 0.3, d + 1, 0x3f8cff, [cx, 5.1, cz]);
  for (let i = 0; i < 8; i++) b.box(w + 1.01, 0.32, 1.0, 0xffffff, [cx, 5.1, cz - d / 2 + 1 + i * 2.3]);
  const s = signMesh('BUMPER CARS', 8, '#3f8cff');
  s.position.set(cx + w / 2 + 0.6, 4.2, cz); s.rotation.y = Math.PI / 2;
  game.scene.add(s);
  const cols = [0xff5a5a, 0xffd23f, 0x55d85a, 0x3f8cff, 0xb46cff, 0xff8a3d, 0x3fe0d0, 0xff7fc8];
  for (let i = 0; i < 8; i++) {
    const x = cx - 9 + (i % 4) * 6, z = cz + (i < 4 ? -4 : 4);
    game.vehicles.push(new Vehicle(game, 'bumper', x, 0.7, z, i < 4 ? 0 : Math.PI, cols[i]));
  }
}

function bouncyCastle(game, kit, cx, cz) {
  const S = 9;
  kit.box(cx, 0.35, cz, S, 0.7, S, 0xff5a8a, { bounce: 13, round: 0.3 });
  for (const [x, z, w, d] of [[0, -S / 2, S, 0.8], [-S / 2, 0, 0.8, S], [S / 2, 0, 0.8, S]]) kit.box(cx + x, 1.6, cz + z, w, 2.6, d, 0xffd23f, { bounce: 8, round: 0.35 });
  for (const [x, z] of [[-S / 2, -S / 2], [S / 2, -S / 2], [-S / 2, S / 2], [S / 2, S / 2]]) {
    kit.cyl(cx + x, 2.2, cz + z, 0.9, 4.4, 0x3f8cff, { seg: 12 });
    kit.cone(cx + x, 5.0, cz + z, 1.0, 1.4, 0xff5a5a, { seg: 12 });
  }
  kit.box(cx, 0.35, cz + S / 2 + 1, 4, 0.5, 2, 0x55d85a, { bounce: 6, round: 0.2 });
}

function stalls(game, kit) {
  const list = [[-200, -14, 'HOT DOGS', '#ff5a3c'], [-208, 14, 'CANDY', '#ff7fc8'], [-240, -12, 'DRINKS', '#3f8cff'], [-270, 14, 'PRIZES', '#b46cff'], [-205, 92, 'TICKETS', '#55a84a']];
  for (const [x, z, name, col] of list) {
    const yaw = z < 0 ? 0 : Math.PI;
    kit.box(x, 1.1, z, 4, 2.2, 3, 0xffffff, { yaw });
    const c = new THREE.Color(col).getHex();
    for (let i = 0; i < 5; i++) kit.deco(x - 1.6 + i * 0.8, 2.9, z + (z < 0 ? 1.9 : -1.9), 0.8, 0.1, 1.6, i % 2 ? 0xffffff : c, { euler: [z < 0 ? 0.3 : -0.3, 0, 0] });
    kit.deco(x, 3.3, z, 4.2, 0.2, 3.2, c);
    const s = signMesh(name, 3.8, col);
    s.position.set(x, 3.0, z + (z < 0 ? 1.6 : -1.6)); s.rotation.y = yaw;
    game.scene.add(s);
  }
  // balloons tied around
  for (let i = 0; i < 14; i++) {
    const x = -195 - (i * 7.3) % 90, z = (i % 2 ? 1 : -1) * (7 + (i * 3.7) % 5);
    const b = kit.b(x, z);
    b.cyl(0.01, 0.01, 2.2, 0xdddddd, [x, 1.1, z], null, 3);
    b.sphere(0.35, [0xff5a5a, 0xffd23f, 0x3f8cff, 0x55d85a, 0xff7fc8][i % 5], [x, 2.4, z], [1, 1.2, 1]);
  }
  for (let i = 0; i < 6; i++) kit.bench(-200 - i * 14, i % 2 ? 9 : -9, i % 2 ? Math.PI : 0);
  for (let i = 0; i < 10; i++) kit.tree(-192 - i * 11, (i % 2 ? 1 : -1) * 101, 0, 0, 0.8);
}

// ---- roller coaster ------------------------------------------------------
function coaster(game, kit) {
  const P = [
    [-262, 1.6, 95], [-245, 1.6, 95], [-228, 8, 95], [-212, 19, 95], [-199, 21.5, 89], [-194, 15, 72], [-194, 3, 52],
    [-195, 12, 24], [-195, 13.5, 0], [-195, 5, -26], [-196, 10, -52], [-200, 3.5, -82], [-214, 5, -97],
    [-244, 14, -97], [-272, 4, -97], [-291, 6, -84], [-295, 11, -52], [-293, 4, -18], [-294, 9, 22],
    [-293, 3, 56], [-287, 2, 86], [-275, 1.6, 95],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(P, true, 'centripetal');
  const L = curve.getLength();
  const N = 1600;
  const pos = [], tan = [];
  for (let i = 0; i <= N; i++) { pos.push(curve.getPointAt(i / N)); tan.push(curve.getTangentAt(i / N)); }
  const sOf = (p) => { let bi = 0, bd = 1e9; pos.forEach((q, i) => { const d = q.distanceToSquared(p); if (d < bd) { bd = d; bi = i; } }); return bi / N * L; };
  const sStation = sOf(P[1]) - 1, sLiftStart = sOf(P[1]) + 1, sLiftEnd = sOf(P[3]) + 4;
  const frameAt = (s, outP, outQ) => {
    s = ((s % L) + L) % L;
    const f = s / L * N, i = Math.floor(f), k = f - i;
    outP.copy(pos[i]).lerp(pos[Math.min(N, i + 1)], k);
    const T = tan[i].clone().lerp(tan[Math.min(N, i + 1)], k).normalize();
    const left = new THREE.Vector3().crossVectors(UP, T).normalize();
    const up = new THREE.Vector3().crossVectors(T, left);
    _m.makeBasis(left, up, T);
    outQ.setFromRotationMatrix(_m);
    return T;
  };

  // track: rails, ties, supports
  const tb = new Builder();
  const railPts = [[], []], spine = [];
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const steps = 700;
  for (let i = 0; i <= steps; i++) {
    const s = i / steps * L;
    frameAt(s, tmpP, tmpQ);
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(tmpQ), up = new THREE.Vector3(0, 1, 0).applyQuaternion(tmpQ);
    railPts[0].push(tmpP.clone().addScaledVector(left, 0.55));
    railPts[1].push(tmpP.clone().addScaledVector(left, -0.55));
    spine.push(tmpP.clone().addScaledVector(up, -0.35));
  }
  for (const rp of railPts) tb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp, true), steps, 0.09, 5, true), 0xff3355);
  tb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine, true), steps, 0.18, 6, true), 0xffd23f);
  for (let s = 0; s < L; s += 1.4) {
    frameAt(s, tmpP, tmpQ);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(tmpQ);
    tb.add(new THREE.BoxGeometry(1.3, 0.08, 0.2), (s > sLiftStart && s < sLiftEnd) ? 0x444444 : 0xdddddd, [tmpP.x - up.x * 0.12, tmpP.y - up.y * 0.12, tmpP.z - up.z * 0.12], tmpQ.clone());
  }
  for (let s = 0; s < L; s += 6) {
    frameAt(s, tmpP, tmpQ);
    if (tmpP.y < 2.6) continue;
    const h = tmpP.y - 0.45;
    tb.cyl(0.16, 0.22, h, 0xffffff, [tmpP.x, h / 2, tmpP.z], null, 6);
  }
  const trackMesh = tb.mesh(matVC);
  game.scene.add(trackMesh);
  // station
  kit.box(-253, 0.6, 98.2, 22, 1.2, 3.2, 0xb46cff);
  for (let i = 0; i < 4; i++) kit.cyl(-262 + i * 6, 2.8, 99.6, 0.12, 3.2, 0xffffff, { collide: false });
  kit.deco(-253, 4.5, 98.5, 23, 0.3, 4.6, 0xff5a8a);
  kit.box(-253, 0.3, 101.0, 4, 0.6, 1.2, 0xb46cff);
  const st = signMesh('LOOPY COASTER', 9, '#b46cff');
  st.position.set(-253, 5.3, 100.8); st.rotation.y = Math.PI;
  game.scene.add(st);

  // train
  const cars = [], NC = 4, GAP = 2.4;
  for (let i = 0; i < NC; i++) {
    const b = new Builder(), c = [0xff3355, 0xffd23f, 0x3f8cff, 0x55d85a][i];
    b.rbox(1.4, 0.55, 2.0, 0.18, c, [0, 0.15, 0]);
    b.box(1.2, 0.12, 1.6, 0x333333, [0, 0.43, 0]);
    b.rbox(1.3, 0.55, 0.2, 0.08, c, [0, 0.6, -0.85]);
    if (i === 0) b.rbox(1.3, 0.5, 0.5, 0.2, c, [0, 0.35, 1.05]);
    b.rbox(1.2, 0.08, 0.1, 0.03, 0xffffff, [0, 0.8, 0.2]);
    // floor plus sides, seat back, lap bar and nose: things to catch hold of
    // from the platform or the ground (riders in seats don't collide with them)
    const body = kinematic(game, { x: P[0].x, y: P[0].y, z: P[0].z }, [
      RAPIER.ColliderDesc.cuboid(0.7, 0.15, 1.0).setTranslation(0, 0.05, 0),
      RAPIER.ColliderDesc.cuboid(0.06, 0.2, 0.95).setTranslation(0.64, 0.35, 0),
      RAPIER.ColliderDesc.cuboid(0.06, 0.2, 0.95).setTranslation(-0.64, 0.35, 0),
      RAPIER.ColliderDesc.cuboid(0.62, 0.27, 0.08).setTranslation(0, 0.6, -0.85),
      RAPIER.ColliderDesc.cuboid(0.6, 0.04, 0.05).setTranslation(0, 0.8, 0.2),
      ...(i === 0 ? [RAPIER.ColliderDesc.cuboid(0.62, 0.22, 0.22).setTranslation(0, 0.35, 1.05)] : []),
    ], b.mesh());
    cars.push(body);
    for (const sx of [0.32, -0.32]) addSeat(game, { body, pos: [sx, 0.55, -0.2], yaw: 0, label: 'Ride coaster', hint: 'Arms up! (LT/RT) · Y exit', exitPush: 1.5 });
  }
  const hTop = P[4].y + 0.8;
  const mod = (x) => ((x % L) + L) % L;
  let s0 = sStation, v = 0, wait = 5, traveled = 0;
  for (const b of cars) game.physics.kinRange.set(b.handle, 400); // the coaster loop is big: the whole train runs while anyone is near it
  game.physics.animate(cars[0], (t, dt) => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    if (wait > 0) { wait -= dt; v = 0; traveled = 0; }
    else {
      const sm = mod(s0);
      frameAt(sm, p, q);
      if (sm >= sStation - 0.5 && sm < sLiftStart) v = Math.max(v, 2.0);
      else if (sm >= sLiftStart && sm < sLiftEnd) v += (3.2 - v) * Math.min(1, dt * 2);
      else {
        const ve = Math.sqrt(Math.max(9, 3.2 * 3.2 + 2 * 9.81 * (hTop - p.y) * 0.93));
        v += (ve - v) * Math.min(1, dt * 3);
      }
      const toStation = mod(sStation - sm);
      if (traveled > 40 && toStation < 25) v = Math.min(v, 1.0 + toStation * 0.4);
      if (traveled > 40 && toStation < 0.2) { v = 0; wait = 8; s0 = sStation; }
      s0 += v * dt; traveled += v * dt;
    }
    cars.forEach((body, i) => {
      frameAt(s0 - i * GAP, p, q);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      p.addScaledVector(up, 0.12);
      setPose(body, p, q);
    });
  });
}
