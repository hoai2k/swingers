// Loose physics props around town and the parked vehicles.
import { RAPIER } from '../physics.js';
import { Builder } from '../mesh.js';
import { Vehicle } from '../vehicles.js';

let seed = 4242;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const PROPS = {
  crate: () => {
    const b = new Builder();
    b.rbox(0.9, 0.9, 0.9, 0.05, 0xc8955a, [0, 0, 0]);
    b.box(0.92, 0.1, 0.92, 0x9a6a3a, [0, 0.28, 0]); b.box(0.92, 0.1, 0.92, 0x9a6a3a, [0, -0.28, 0]);
    return { b, desc: () => RAPIER.ColliderDesc.cuboid(0.45, 0.45, 0.45).setMass(10), h: 0.45 };
  },
  barrel: () => {
    const b = new Builder();
    b.cyl(0.38, 0.38, 1.0, 0x3f8cff, [0, 0, 0], null, 14);
    b.cyl(0.39, 0.39, 0.06, 0x2a62c9, [0, 0.3, 0], null, 14); b.cyl(0.39, 0.39, 0.06, 0x2a62c9, [0, -0.3, 0], null, 14);
    return { b, desc: () => RAPIER.ColliderDesc.cylinder(0.5, 0.38).setMass(14), h: 0.5 };
  },
  cone: () => {
    const b = new Builder();
    b.cone(0.25, 0.7, 0xff7a1a, [0, 0.05, 0], null, 12);
    b.cyl(0.18, 0.2, 0.1, 0xffffff, [0, 0.05, 0], null, 12);
    b.box(0.5, 0.05, 0.5, 0xff7a1a, [0, -0.3, 0]);
    return { b, desc: () => RAPIER.ColliderDesc.cone(0.35, 0.25).setMass(1.5), h: 0.35 };
  },
  bin: () => {
    const b = new Builder();
    b.cyl(0.32, 0.28, 0.9, 0x4fae45, [0, 0, 0], null, 12);
    b.cyl(0.35, 0.35, 0.08, 0x2f7f2f, [0, 0.47, 0], null, 12);
    return { b, desc: () => RAPIER.ColliderDesc.cylinder(0.45, 0.32).setMass(6), h: 0.47 };
  },
  ball: () => {
    const b = new Builder(), c = [0xff5a5a, 0xffd23f, 0x3f8cff, 0x55d85a][(rnd() * 4) | 0];
    b.sphere(0.4, c, [0, 0, 0], null, 14);
    b.sphere(0.402, 0xffffff, [0, 0, 0], [0.3, 1, 1], 14);
    return { b, desc: () => RAPIER.ColliderDesc.ball(0.4).setMass(0.35).setRestitution(0.8), h: 0.4 };
  },
  cart: () => {
    const b = new Builder();
    b.box(0.6, 0.05, 0.9, 0xbbbbbb, [0, -0.15, 0]);
    for (const s of [-1, 1]) { b.box(0.04, 0.5, 0.9, 0xcccccc, [s * 0.3, 0.1, 0]); b.box(0.6, 0.5, 0.04, 0xcccccc, [0, 0.1, s * 0.45]); }
    b.cyl(0.03, 0.03, 0.6, 0xff3a3a, [0, 0.55, -0.55], [0, 0, Math.PI / 2], 6);
    for (const [x, z] of [[-0.25, -0.38], [0.25, -0.38], [-0.25, 0.38], [0.25, 0.38]]) b.sphere(0.08, 0x222222, [x, -0.35, z], null, 8);
    return { b, desc: () => RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.45).setTranslation(0, 0.05, 0).setMass(8).setFriction(0.05), h: 0.43 };
  },
  chair: () => {
    const b = new Builder(), c = [0xffffff, 0xff5a5a, 0x3f8cff][(rnd() * 3) | 0];
    b.box(0.45, 0.06, 0.45, c, [0, 0, 0]);
    b.box(0.45, 0.5, 0.05, c, [0, 0.27, -0.2]);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) b.cyl(0.02, 0.02, 0.45, 0x888888, [x, -0.22, z], null, 5);
    return { b, desc: () => RAPIER.ColliderDesc.cuboid(0.22, 0.25, 0.22).setTranslation(0, -0.1, 0).setMass(3), h: 0.45 };
  },
};

export function spawnProp(game, kind, x, z, y = 0, yaw = 0) {
  const p = PROPS[kind]();
  const rot = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const o = game.physics.dynamic({ x, y: y + p.h + 0.02, z }, [p.desc()], p.b.mesh(), { rot });
  game.scene.add(o.mesh);
  return o;
}

export function scatterProps(game) {
  // bins and cones along the avenues
  for (let t = 24; t <= 140; t += 22) for (const s of [-1, 1]) {
    spawnProp(game, 'bin', s * 6.6, t + 3); spawnProp(game, 'bin', t + 3, s * 6.6);
    spawnProp(game, 'bin', s * 6.6, -t - 3); spawnProp(game, 'bin', -t - 3, s * 6.6);
  }
  // road works with cones
  for (let i = 0; i < 6; i++) spawnProp(game, 'cone', 60 + 1.5, -40 + i * 2.2);
  for (let i = 0; i < 5; i++) spawnProp(game, 'cone', -40 + i * 2.5, 60 - 1.5);
  // market crates and barrels by the shops
  for (let i = 0; i < 9; i++) spawnProp(game, 'crate', 24 + (i % 3) * 0.95, 24 + Math.floor(i / 3) * 0.0 + (i % 2) * 0.01, Math.floor(i / 3) * 0.92);
  for (let i = 0; i < 4; i++) spawnProp(game, 'barrel', -24 - i * 0.9, 24);
  for (let i = 0; i < 6; i++) spawnProp(game, 'cart', 26 + i * 0.75, -24);
  // plaza fun
  for (let i = 0; i < 6; i++) spawnProp(game, 'ball', -8 + i * 3, 15 + (i % 2) * 2);
  // cafe chairs
  for (let i = 0; i < 6; i++) spawnProp(game, 'chair', -24 + (i % 3) * 1.2, -24 - Math.floor(i / 3) * 1.4, 0, rnd() * 6);
  // more crates in the stunt park and at the farm road
  for (let i = 0; i < 12; i++) spawnProp(game, 'barrel', -82 + (i % 4) * 0.9, 125 + Math.floor(i / 4) * 0.9);
  for (let i = 0; i < 8; i++) spawnProp(game, 'ball', -40 + i * 12, 318);

  // ---- vehicles
  const V = (type, x, z, yaw, color) => game.vehicles.push(new Vehicle(game, type, x, 1.2, z, yaw, color));
  // parked along the town grid
  const parked = [
    ['car', 63.5, -30, Math.PI], ['car', 63.5, 22, Math.PI], ['car', -63.5, -12, 0], ['car', -63.5, 30, 0],
    ['car', -30, 63.5, Math.PI / 2], ['pickup', 20, 63.5, Math.PI / 2], ['car', 30, -63.5, -Math.PI / 2], ['van', -24, -63.5, -Math.PI / 2],
    ['car', 3, 30, 0], ['car', -3, -40, Math.PI], ['car', 40, 3, -Math.PI / 2], ['car', -46, -3, Math.PI / 2],
    ['car', 3, 90, 0], ['pickup', -3, 110, Math.PI], ['car', 100, 3, -Math.PI / 2], ['car', -120, -3, Math.PI / 2],
    ['car', 3, -100, 0], ['van', -3, -80, Math.PI],
  ];
  for (const p of parked) V(...p);
  // parking lot at the sports field
  const lot = ['car', 'car', 'pickup', 'car', 'van', 'car', 'quad', 'car'];
  lot.forEach((t, i) => V(t, -132.5 + i * 5 + 0.0, -137, 0));
  // ice cream van at the beach + pool
  V('van', -10, 302, Math.PI / 2, 0xffb7d5);
  V('van', 70, 88, Math.PI / 2, 0x6ac8ff);
  // quads on the beach
  V('quad', 45, 300, 0, 0xffd23f); V('quad', 50, 300, 0, 0xff5a5a);
  // a pickup + car by the stunt park
  V('pickup', -70, 80, Math.PI, 0xff8a3d); V('car', -70, 92, Math.PI, 0x3f8cff); V('car', -70, 104, Math.PI, 0xff3a3a);
  // cars at the amusement park gate
  V('car', -178, 14, 0); V('car', -178, -14, Math.PI);
}
