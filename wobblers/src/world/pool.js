// Swimming pool: sunken pool with shallow and deep ends, steps, ladders,
// a springy diving board, a high-dive platform and a twisting water slide.
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { Builder, matVCDouble, signMesh } from '../mesh.js';
import { addWater } from './water.js';

export const POOL = { x0: 87, x1: 113, z0: 93, z1: 107, level: -0.15 };

export function buildPool(game, kit) {
  const phys = game.physics, W = phys.world;
  const tile = 0x5fc4ea, deck = 0xf2e4c8, coping = 0xffffff, bot = -3.4;
  const deckBox = (x0, x1, z0, z1) => {
    const h = 0.05 - bot;
    kit.box((x0 + x1) / 2, bot + h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, tile);
    kit.deco((x0 + x1) / 2, 0.065, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, deck);
  };
  deckBox(78, 122, 84, 93); deckBox(78, 122, 107, 116);
  deckBox(78, 87, 93, 107); deckBox(113, 122, 93, 107);
  // coping
  kit.deco(100, 0.09, 92.85, 26.6, 0.06, 0.3, coping); kit.deco(100, 0.09, 107.15, 26.6, 0.06, 0.3, coping);
  kit.deco(86.85, 0.09, 100, 0.3, 0.06, 14, coping); kit.deco(113.15, 0.09, 100, 0.3, 0.06, 14, coping);
  // floors: shallow end + slope + deep end
  kit.box(92.5, (bot - 1.1) / 2, 100, 11, -1.1 - bot, 14, 0x9fe6f8);
  kit.wedge(100, -3.0, 100, 14, 5, 1.9, 0x9fe6f8, { yaw: -Math.PI / 2 });
  kit.box(107.75, (bot - 3.0) / 2, 100, 10.5, -3.0 - bot, 14, 0x9fe6f8);
  for (let i = 0; i < 5; i++) kit.deco(100, -3.0 + 0.012, 94.8 + i * 2.6 + 0.6, 12, 0.02, 0.3, 0x2a62c9);
  addWater(game, POOL.x0, POOL.x1, POOL.z0, POOL.z1, bot, POOL.level, 0x47c8ff, 0.62);
  // steps into the shallow end
  for (let i = 0; i < 3; i++) kit.box(87 + 0.6 * (3 - i) / 2 + 0.0, (-1.1 + (-0.8 + i * 0.3)) / 2, 100, 0.6 * (3 - i), (-0.8 + i * 0.3) + 1.1, 5, 0xffffff);
  // ladders (grab the rungs)
  for (const [lx, lz] of [[112.6, 95], [112.6, 105], [100, 107.0], [100, 93.0]]) {
    const alongX = lx > 112;
    for (const s of [-0.3, 0.3]) kit.cyl(lx + (alongX ? 0 : s), 0.1, lz + (alongX ? s : 0), 0.035, 2.0, 0xdddddd, { collide: false });
    for (let k = 0; k < 4; k++) kit.cyl(lx, -1.3 + k * 0.45, lz, 0.03, 0.6, 0xdddddd, { euler: alongX ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] });
  }

  // ---- springy diving board (deep end, east wall)
  {
    kit.box(117, 0.45, 97, 1.6, 0.8, 1.2, 0xdddddd);
    const b = new Builder();
    b.rbox(3.6, 0.1, 0.65, 0.04, 0x2a62c9, [0, 0, 0]);
    const o = phys.dynamic({ x: 114.4, y: 0.95, z: 97 }, [RAPIER.ColliderDesc.cuboid(1.8, 0.05, 0.32).setMass(18).setFriction(1)], b.mesh(), { kind: 'contraption', angDamp: 0.5, buoy: null });
    game.scene.add(o.mesh);
    const j = W.createImpulseJoint(RAPIER.JointData.revolute({ x: 116.2, y: 0.95, z: 97 }, { x: 1.8, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), phys.staticBody, o.body, true);
    j.configureMotorPosition(0, 9000, 220);
  }
  // ---- high dive platform (5 m) with stairs
  {
    const px = 115, pz = 104, H = 5;
    kit.box(px - 1.2, H, pz, 4.4, 0.25, 2.2, 0xffffff);
    for (const [ox, oz] of [[0.6, -0.9], [0.6, 0.9]]) kit.cyl(px + ox, H / 2, pz + oz, 0.14, H, 0xdddddd);
    kit.deco(px - 1.2, H + 0.5, pz - 1.05, 4.4, 0.08, 0.06, 0xff5a5a); kit.deco(px - 1.2, H + 0.5, pz + 1.05, 4.4, 0.08, 0.06, 0xff5a5a);
    // straight stair up along +z from the south deck
    for (let i = 0; i < 14; i++) kit.box(px + 1.7, (i + 1) * H / 14 - 0.12, pz + 9.5 - i * 0.62, 1.3, 0.24, 0.62, i % 2 ? 0xffffff : 0xff5a5a);
    kit.box(px + 1.7, H, pz + 0.6, 1.3, 0.25, 1.4, 0xffffff);
    for (let i = 0; i < 14; i += 3) kit.cyl(px + 1.7, ((i + 1) * H / 14) / 2, pz + 9.5 - i * 0.62, 0.08, (i + 1) * H / 14, 0xdddddd, { collide: false });
  }
  // ---- water slide
  buildSlide(game, kit);

  // loungers + umbrellas + lifeguard chair
  for (let i = 0; i < 6; i++) {
    const x = 84 + i * 4, z = 111.5;
    kit.box(x, 0.35, z, 0.8, 0.12, 2.0, 0xffffff);
    kit.box(x, 0.6, z - 0.85, 0.8, 0.5, 0.12, 0xffffff, { euler: [-0.6, 0, 0] });
    for (const [lx, lz] of [[-0.35, -0.9], [0.35, -0.9], [-0.35, 0.9], [0.35, 0.9]]) kit.cyl(x + lx, 0.17, z + lz, 0.03, 0.34, 0x999999, { collide: false });
    if (i % 2 === 0) {
      kit.cyl(x + 2, 1.3, z, 0.04, 2.6, 0xffffff);
      const b = kit.b(x + 2, z);
      for (let k = 0; k < 8; k++) b.add(new THREE.ConeGeometry(1.5, 0.6, 8, 1, true, k * Math.PI / 4, Math.PI / 4), k % 2 ? 0xffffff : [0xff5a5a, 0x3f8cff, 0xffd23f][i / 2], [x + 2, 2.7, z]);
    }
  }
  kit.box(84, 1.2, 89, 1.2, 0.15, 1.0, 0xffffff);
  for (const [lx, lz] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) kit.cyl(84 + lx, 0.6, 89 + lz, 0.05, 1.2, 0xffffff, { collide: false });
  kit.deco(84, 1.7, 89.45, 1.2, 0.9, 0.1, 0xff5a5a);
  addSeatLike(game, 84, 1.45, 89, Math.PI);
  // fence around the pool area
  kit.fence(76, 70, 124, 70, 0x3f8cff, 1.2); kit.fence(124, 70, 124, 118, 0x3f8cff, 1.2);
  kit.fence(124, 118, 76, 118, 0x3f8cff, 1.2); kit.fence(76, 118, 76, 104, 0x3f8cff, 1.2); kit.fence(76, 96, 76, 70, 0x3f8cff, 1.2);
  const s = signMesh('SWIMMING POOL', 8, '#2a9ad9');
  s.position.set(75.8, 2.6, 100); s.rotation.y = -Math.PI / 2;
  game.scene.add(s);
  kit.cyl(75.8, 1.3, 96.5, 0.1, 2.6, 0x777777); kit.cyl(75.8, 1.3, 103.5, 0.1, 2.6, 0x777777);

  // pool toys
  const toyCols = [0xff5a5a, 0xffd23f, 0x55d85a, 0x3f8cff];
  for (let i = 0; i < 4; i++) {
    const b = new Builder();
    b.sphere(0.45, toyCols[i], [0, 0, 0], null, 14);
    b.sphere(0.452, 0xffffff, [0, 0, 0], [0.35, 1, 1], 14);
    const o = phys.dynamic({ x: 92 + i * 5, y: 0.2, z: 97 + (i % 2) * 6 }, [RAPIER.ColliderDesc.ball(0.45).setMass(0.4).setRestitution(0.7)], b.mesh(), { buoy: { r: 0.45, volume: 0.38, drag: 1.0 } });
    game.scene.add(o.mesh);
  }
  for (let i = 0; i < 3; i++) {
    const b = new Builder();
    b.torus(0.55, 0.22, [0xff7fc8, 0xff8a3d, 0x3fe0d0][i], [0, 0, 0], [Math.PI / 2, 0, 0]);
    const o = phys.dynamic({ x: 96 + i * 6, y: 0.1, z: 101 }, [RAPIER.ColliderDesc.cylinder(0.2, 0.75).setMass(1)], b.mesh(), { buoy: { r: 0.22, volume: 0.25, drag: 1.5 } });
    game.scene.add(o.mesh);
  }
  // giant rubber duck
  {
    const b = new Builder();
    b.sphere(0.9, 0xffd23f, [0, 0, 0], [1, 0.8, 1.2], 14);
    b.sphere(0.55, 0xffd23f, [0, 0.85, 0.55], null, 12);
    b.sphere(0.25, 0xff8a3d, [0, 0.78, 1.05], [1, 0.5, 1.2]);
    b.sphere(0.08, 0x111111, [0.25, 1.0, 0.9]); b.sphere(0.08, 0x111111, [-0.25, 1.0, 0.9]);
    const o = phys.dynamic({ x: 108, y: 0.3, z: 100 }, [RAPIER.ColliderDesc.ball(0.95).setMass(15), RAPIER.ColliderDesc.ball(0.55).setTranslation(0, 0.85, 0.55).setMass(2)], b.mesh(), { buoy: { r: 0.9, volume: 3.0, drag: 1.2 } });
    game.scene.add(o.mesh);
  }
}

function addSeatLike(game, x, y, z, yaw) {
  game.seats.push({ body: game.physics.staticBody, pos: [x, y, z], yaw, kind: 'passenger', label: 'Sit', occupant: null, exit: [x, y - 1.0, z + 1.2] });
}

// Half-pipe trimesh along a curve, ending in the deep end.
function buildSlide(game, kit) {
  const R = 0.9;
  const pts = [
    [96.8, 7.0, 85.2], [100.5, 6.6, 85.0], [104.2, 5.7, 86.4], [106.2, 4.6, 89.4], [105.6, 3.5, 92.8],
    [103.2, 2.4, 95.2], [100.0, 1.2, 96.6], [96.6, 0.25, 97.4], [94.5, 0.05, 97.6],
  ].map(([x, y, z]) => new THREE.Vector3(x, y + R, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 90, M = 12, a0 = -1.85, a1 = 1.85;
  const verts = [], idx = [], cols = [];
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), nrm = new THREE.Vector3(), p = new THREE.Vector3();
  const cA = new THREE.Color(0xffd23f), cB = new THREE.Color(0xff5a5a);
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = curve.getPointAt(t), T = curve.getTangentAt(t);
    side.crossVectors(T, up).normalize();
    nrm.crossVectors(side, T).normalize();
    for (let k = 0; k <= M; k++) {
      const a = a0 + (a1 - a0) * k / M;
      p.copy(c).addScaledVector(side, Math.sin(a) * R).addScaledVector(nrm, -Math.cos(a) * R);
      verts.push(p.x, p.y, p.z);
      const cc = (Math.floor(i / 6) % 2 ? cA : cB);
      cols.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) {
    const a = i * (M + 1) + k, b = a + 1, c = a + M + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, matVCDouble);
  mesh.castShadow = true; mesh.receiveShadow = true;
  game.scene.add(mesh);
  game.physics.trimesh(new Float32Array(verts), new Uint32Array(idx), { slippery: true });
  // supports
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, c = curve.getPointAt(Math.min(0.92, t));
    const by = c.y - R;
    const floor = (c.x > 87 && c.x < 113 && c.z > 93 && c.z < 107) ? (c.x < 100 ? -1.1 : -3.0) : 0.05;
    if (by - floor < 0.6) continue;
    kit.cyl(c.x, (by + floor) / 2, c.z, 0.16, by - floor, 0xdddddd);
  }
  // tower + stairs
  const tx = 95.6, tz = 85.2, H = 7.0;
  kit.box(tx, H - 0.12, tz, 2.6, 0.24, 2.6, 0xffffff);
  for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) kit.cyl(tx + ox, H / 2, tz + oz, 0.13, H, 0x3f8cff);
  kit.deco(tx - 1.3, H + 0.5, tz, 0.08, 0.8, 2.6, 0xff5a5a); kit.deco(tx, H + 0.5, tz + 1.3, 2.6, 0.8, 0.08, 0xff5a5a);
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const y = (i + 1) * H / steps;
    kit.box(tx, y - 0.12, tz - 1.6 - (steps - 1 - i) * 0.5, 1.4, 0.24, 0.5, i % 2 ? 0xffffff : 0x3f8cff);
  }
  for (let i = 0; i < steps; i += 4) {
    const y = (i + 1) * H / steps;
    kit.cyl(tx, y / 2, tz - 1.6 - (steps - 1 - i) * 0.5, 0.08, y, 0xdddddd, { collide: false });
  }
}
