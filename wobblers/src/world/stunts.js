// Stunt park (ramps, half-pipe, quarter pipes, big jump) and the sports
// field (football pitch with a giant ball, basketball court).
import { RAPIER } from '../physics.js';
import { Builder, signMesh } from '../mesh.js';

const quarter = (R, steps = 8, flat = 0) => {
  const p = [];
  if (flat) p.push([-flat, 0]);
  for (let i = 0; i <= steps; i++) {
    const a = i / steps * Math.PI / 2 * 0.92;
    p.push([Math.sin(a) * R, R - Math.cos(a) * R]);
  }
  return p;
};

export function buildStunts(game, kit) {
  const cx = -105, cz = 105;
  kit.deco(cx, 0.025, cz, 76, 0.05, 76, 0xbfc4c9);
  for (let i = 0; i < 6; i++) kit.deco(cx - 30 + i * 12, 0.055, cz, 0.15, 0.01, 76, 0xa9aeb3);
  const sign = signMesh('STUNT PARK', 8, '#ff8a3d');
  sign.position.set(cx + 38.5, 3.2, cz - 20); sign.rotation.y = Math.PI / 2;
  game.scene.add(sign);
  kit.cyl(cx + 38.5, 1.5, cz - 23.5, 0.12, 3, 0x777777); kit.cyl(cx + 38.5, 1.5, cz - 16.5, 0.12, 3, 0x777777);

  // big jump: launch ramp + landing ramp with a gap
  kit.wedge(cx - 22, 0, cz - 26, 6, 10, 2.6, 0xff8a3d, { yaw: Math.PI / 2 });
  kit.box(cx - 13.5, 1.3, cz - 26, 7, 2.6, 6, 0xff8a3d);
  kit.wedge(cx + 12, 0, cz - 26, 6, 12, 2.6, 0x3f8cff, { yaw: -Math.PI / 2 });
  kit.box(cx + 3, 1.3, cz - 26, 6, 2.6, 6, 0x3f8cff);
  // kickers
  for (const [x, z, yaw, h] of [[-20, 0, 0, 1.0], [-8, 4, 0.4, 1.4], [6, -6, -0.6, 0.8], [18, 6, Math.PI, 1.2], [-28, 22, Math.PI / 2, 1.6], [10, 24, -Math.PI / 2, 1.0]]) {
    kit.wedge(cx + x, 0, cz + z, 4, 5, h, 0xffd23f, { yaw });
  }
  // pyramid / fun box
  kit.box(cx, 0.6, cz + 10, 8, 1.2, 6, 0x55d85a);
  kit.wedge(cx - 6, 0, cz + 10, 6, 4, 1.2, 0x55d85a, { yaw: Math.PI / 2 });
  kit.wedge(cx + 6, 0, cz + 10, 6, 4, 1.2, 0x55d85a, { yaw: -Math.PI / 2 });
  kit.box(cx, 1.25, cz + 10, 6, 0.1, 0.12, 0xdddddd);
  // grind rail
  kit.cyl(cx + 22, 0.7, cz - 8, 0.06, 12, 0xdddddd, { euler: [Math.PI / 2, 0, 0] });
  for (const dz of [-5, 0, 5]) kit.cyl(cx + 22, 0.35, cz - 8 + dz, 0.05, 0.7, 0x777777, { collide: false });
  // half-pipe across the south side
  const R = 3.2, flat = 4;
  const hp = [];
  for (let i = 8; i >= 0; i--) { const a = i / 8 * Math.PI / 2 * 0.95; hp.push([-flat - Math.sin(a) * R, R - Math.cos(a) * R]); }
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2 * 0.95; hp.push([flat + Math.sin(a) * R, R - Math.cos(a) * R]); }
  kit.profile(cx - 10, 0.0, cz + 30, 0, 22, hp, 0x8fb3d9, { side: 0x6a8fb5 });
  for (const s of [-1, 1]) kit.box(cx - 10, R + 0.1, cz + 30 + s * (flat + R + 0.8), 22, 0.2, 1.8, 0x8fb3d9);
  // quarter pipes on the east edge
  kit.profile(cx + 33, 0, cz + 12, Math.PI / 2, 14, quarter(2.6), 0xff8a3d, { side: 0xd96a2a });
  kit.profile(cx - 33, 0, cz - 4, -Math.PI / 2, 14, quarter(2.6), 0xff8a3d, { side: 0xd96a2a });
  // dynamic crates to smash through
  for (let i = 0; i < 10; i++) {
    const b = new Builder();
    b.rbox(1, 1, 1, 0.06, 0xc8955a, [0, 0, 0]);
    b.box(1.02, 0.12, 1.02, 0x9a6a3a, [0, 0.3, 0]); b.box(1.02, 0.12, 1.02, 0x9a6a3a, [0, -0.3, 0]);
    const x = cx + 14 + (i % 3) * 1.05, z = cz + 18 + Math.floor(i / 3) * 0.0, y = 0.5 + Math.floor(i / 3) * 1.02;
    const o = game.physics.dynamic({ x, y, z: z + (i % 2) * 0.02 }, [RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setMass(12)], b.mesh());
    game.scene.add(o.mesh);
  }
  // spectator stand
  for (let i = 0; i < 4; i++) kit.box(cx + 30 - i * 1.4, 0.3 + i * 0.5, cz - 34, 1.4, 0.6 + i * 1.0, 14, i % 2 ? 0xffffff : 0xdddddd);
}

export function buildSports(game, kit) {
  const cx = -105, cz = -103;
  const PW = 56, PD = 34;
  kit.deco(cx, 0.03, cz, PW + 6, 0.06, PD + 6, 0x55b84a);
  for (let i = 0; i < 8; i++) kit.deco(cx - PW / 2 + (i + 0.5) * PW / 8, 0.065, cz, PW / 8, 0.01, PD, i % 2 ? 0x5cc24f : 0x4fae45);
  const line = (x, z, w, d) => kit.deco(x, 0.075, z, w, 0.01, d, 0xffffff);
  line(cx, cz - PD / 2, PW, 0.15); line(cx, cz + PD / 2, PW, 0.15); line(cx - PW / 2, cz, 0.15, PD); line(cx + PW / 2, cz, 0.15, PD); line(cx, cz, 0.15, PD);
  for (const s of [-1, 1]) {
    line(cx + s * (PW / 2 - 6), cz, 0.15, 16); line(cx + s * (PW / 2 - 3), cz - 8, 6, 0.15); line(cx + s * (PW / 2 - 3), cz + 8, 6, 0.15);
    // goal
    const gx = cx + s * (PW / 2 + 0.2);
    kit.cyl(gx, 1.2, cz - 3.6, 0.1, 2.4, 0xffffff); kit.cyl(gx, 1.2, cz + 3.6, 0.1, 2.4, 0xffffff);
    kit.cyl(gx, 2.4, cz, 0.1, 7.4, 0xffffff, { euler: [Math.PI / 2, 0, 0] });
    kit.box(gx + s * 1.6, 1.2, cz, 0.05, 2.4, 7.2, 0xeeeeee);
    kit.box(gx + s * 0.8, 1.2, cz - 3.6, 1.6, 2.4, 0.05, 0xeeeeee); kit.box(gx + s * 0.8, 1.2, cz + 3.6, 1.6, 2.4, 0.05, 0xeeeeee);
    kit.box(gx + s * 0.8, 2.4, cz, 1.6, 0.05, 7.2, 0xeeeeee);
  }
  // footballs: one giant, several normal
  const ball = (x, z, r, mass) => {
    const b = new Builder();
    b.sphere(r, 0xffffff, [0, 0, 0], null, 16);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      b.sphere(r * 0.32, 0x222222, [Math.sin(a) * r * 0.8, (k % 2 ? 0.45 : -0.45) * r, Math.cos(a) * r * 0.8], [1, 1, 0.5], 8);
    }
    b.sphere(r * 0.32, 0x222222, [0, r * 0.82, 0], [1, 0.5, 1], 8);
    const o = game.physics.dynamic({ x, y: r + 0.1, z }, [RAPIER.ColliderDesc.ball(r).setMass(mass).setRestitution(0.75).setFriction(0.7)], b.mesh(), { angDamp: 0.4, linDamp: 0.15 });
    game.scene.add(o.mesh);
  };
  ball(cx, cz, 1.3, 9);
  for (let i = 0; i < 4; i++) ball(cx - 10 + i * 6, cz + 10, 0.28, 0.45);
  // bleachers
  for (let i = 0; i < 4; i++) kit.box(cx, 0.3 + i * 0.6, cz - PD / 2 - 4 - i * 1.0, 40, 0.6 + i * 1.2, 1.0, i % 2 ? 0x3f8cff : 0xffffff);
  // basketball court
  const bx = cx + 2, bz = cz + PD / 2 + 11;
  kit.deco(bx, 0.04, bz, 18, 0.08, 12, 0xd9824a);
  line(bx, bz, 0.12, 12);
  for (const s of [-1, 1]) {
    const hx = bx + s * 8;
    kit.cyl(hx + s * 0.6, 1.7, bz, 0.1, 3.4, 0x666666);
    kit.box(hx, 3.4, bz, 0.1, 1.1, 1.8, 0xffffff);
    const b = kit.b(hx, bz);
    b.torus(0.3, 0.025, 0xff5a1a, [hx - s * 0.4, 3.05, bz], [Math.PI / 2, 0, 0], 16);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      game.physics.ball(hx - s * 0.4 + Math.cos(a) * 0.3, 3.05, bz + Math.sin(a) * 0.3, 0.035, {});
    }
  }
  for (let i = 0; i < 3; i++) {
    const b = new Builder();
    b.sphere(0.24, 0xff7a2a, [0, 0, 0], null, 14);
    b.torus(0.24, 0.008, 0x222222, [0, 0, 0], [Math.PI / 2, 0, 0]); b.torus(0.24, 0.008, 0x222222, [0, 0, 0], [0, 0, 0]);
    const o = game.physics.dynamic({ x: bx - 2 + i * 2, y: 0.4, z: bz + 2 }, [RAPIER.ColliderDesc.ball(0.24).setMass(0.6).setRestitution(0.8)], b.mesh());
    game.scene.add(o.mesh);
  }
  // parking lot next to the field
  kit.deco(cx, 0.035, -137, 60, 0.07, 12, 0x5a5d66);
  for (let i = 0; i <= 12; i++) kit.deco(cx - 30 + i * 5, 0.075, -137, 0.15, 0.01, 10, 0xffffff);
}
