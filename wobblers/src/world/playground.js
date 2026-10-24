// Playground: swings, slide, see-saws, merry-go-round, monkey bars,
// trampolines, spring riders and a sandbox.
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { DT } from '../config.js';
import { Builder, signMesh } from '../mesh.js';

export function addSeat(game, s) {
  const seat = { occupant: null, yaw: 0, kind: 'passenger', label: 'Sit', ...s };
  game.seats.push(seat);
  return seat;
}

function dyn(game, pos, descs, builder, opts = {}) {
  const mesh = builder.mesh();
  game.scene.add(mesh);
  return game.physics.dynamic(pos, descs, mesh, { kind: 'contraption', ...opts });
}

export function buildPlayground(game, kit) {
  const W = game.physics.world, phys = game.physics;
  const cx = 105, cz = -105;
  // soft rubber ground + border
  kit.deco(cx, 0.02, cz, 72, 0.04, 72, 0x9be08a);
  kit.deco(cx - 15, 0.045, cz - 18, 28, 0.02, 18, 0xff9a6a);
  kit.deco(cx + 18, 0.045, cz - 14, 22, 0.02, 22, 0x6ac8ff);
  kit.deco(cx + 10, 0.045, cz + 22, 34, 0.02, 14, 0xffd96a);
  const s = signMesh('PLAYGROUND', 8, '#ff7f3d');
  s.position.set(cx - 37, 3.4, cz + 20); s.rotation.y = -Math.PI / 2;
  game.scene.add(s);
  kit.cyl(cx - 37, 1.5, cz + 16.5, 0.12, 3, 0x777777); kit.cyl(cx - 37, 1.5, cz + 23.5, 0.12, 3, 0x777777);
  // fence with gaps
  kit.fence(cx - 36, cz - 36, cx + 36, cz - 36, 0xff7f3d);
  kit.fence(cx + 36, cz - 36, cx + 36, cz + 36, 0xff7f3d);
  kit.fence(cx - 36, cz - 36, cx - 36, cz + 10, 0xff7f3d);
  kit.fence(cx - 36, cz + 28, cx - 36, cz + 36, 0xff7f3d);
  kit.fence(cx - 36, cz + 36, cx - 6, cz + 36, 0xff7f3d);
  kit.fence(cx + 6, cz + 36, cx + 36, cz + 36, 0xff7f3d);

  // ---- swing set
  {
    const sx = cx - 22, sz = cz - 22, top = 3.5, L = 2.6;
    kit.cyl(sx, top, sz, 0.1, 11, 0xd9534f, { euler: [0, 0, Math.PI / 2], collide: true });
    for (const ex of [-5.5, 5.5]) for (const lz of [-1, 1]) {
      kit.cyl(sx + ex, top / 2, sz + lz * 0.9, 0.09, top * 1.1, 0x3f8cff, { euler: [lz * 0.26, 0, 0] });
    }
    for (let i = 0; i < 4; i++) {
      const x = sx - 4 + i * 2.65;
      const b = new Builder();
      b.rbox(0.62, 0.08, 0.36, 0.03, [0xffd23f, 0xff5a5a, 0x55d85a, 0xb46cff][i], [0, 0, 0]);
      for (const lx of [-0.28, 0.28]) b.cyl(0.015, 0.015, L, 0x999999, [lx, L / 2, 0], null, 4);
      const o = dyn(game, { x, y: top - L, z: sz }, [RAPIER.ColliderDesc.cuboid(0.31, 0.04, 0.18).setMass(5)], b, { angDamp: 0.05, linDamp: 0.02 });
      o.body.setCanSleep?.(false);
      const j = RAPIER.JointData.revolute({ x, y: top, z: sz }, { x: 0, y: L, z: 0 }, { x: 1, y: 0, z: 0 });
      W.createImpulseJoint(j, phys.staticBody, o.body, true);
      addSeat(game, {
        body: o.body, pos: [0, 0.2, 0], yaw: 0, label: 'Swing', hint: 'Push stick to swing · Y exit',
        control(inp) {
          if (Math.abs(inp.moveY) < 0.3) return;
          const v = o.body.linvel();
          const t = o.body.translation();
          const ang = Math.atan2(t.z - sz, top - t.y);
          if (Math.abs(ang) > 1.35) return;
          const dir = Math.abs(v.z) > 0.2 ? Math.sign(v.z) : Math.sign(inp.moveY);
          o.body.applyImpulse({ x: 0, y: 0, z: dir * 70 * DT * Math.abs(inp.moveY) }, true);
        },
      });
    }
  }

  // ---- slide
  {
    const px = cx - 2, pz = cz - 26, H = 2.8;
    kit.box(px, H, pz, 2.2, 0.2, 2.2, 0xffd23f);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(px + lx, H / 2, pz + lz, 0.1, H, 0x3f8cff);
    kit.deco(px - 1.05, H + 0.5, pz, 0.08, 0.8, 2.2, 0xff5a5a); kit.deco(px + 1.05, H + 0.5, pz, 0.08, 0.8, 2.2, 0xff5a5a);
    // stairs behind (-z)
    for (let i = 0; i < 9; i++) kit.box(px, (i + 0.5) * H / 9, pz - 1.6 - (8 - i) * 0.42, 1.4, H / 9, 0.42, i % 2 ? 0xffffff : 0x55d85a);
    // the chute toward +z
    const run = 5.4, ang = Math.atan2(H, run), len = Math.hypot(H, run) + 0.3;
    const mz = pz + 1.1 + run / 2;
    kit.box(px, H / 2 + 0.05, mz, 1.2, 0.12, len, 0xff5a5a, { euler: [ang, 0, 0], slippery: true });
    for (const lx of [-0.62, 0.62]) kit.box(px + lx, H / 2 + 0.3, mz, 0.08, 0.4, len, 0xffd23f, { euler: [ang, 0, 0] });
    kit.box(px, 0.06, pz + 1.1 + run + 0.7, 1.2, 0.12, 1.4, 0xff5a5a, { slippery: true });
  }

  // ---- see-saws
  for (const [ox, oz] of [[cx + 14, cz - 26], [cx + 14, cz - 19]]) {
    kit.box(ox, 0.3, oz, 0.5, 0.6, 0.5, 0x666666);
    const b = new Builder();
    b.rbox(0.45, 0.12, 4.4, 0.05, 0x55d85a, [0, 0, 0]);
    for (const e of [-1, 1]) {
      b.cyl(0.04, 0.04, 0.5, 0xffd23f, [0, 0.3, e * 1.6], [0, 0, Math.PI / 2], 6);
      b.cyl(0.03, 0.03, 0.3, 0xffd23f, [0.25, 0.18, e * 1.6], null, 6); b.cyl(0.03, 0.03, 0.3, 0xffd23f, [-0.25, 0.18, e * 1.6], null, 6);
    }
    const o = dyn(game, { x: ox, y: 0.7, z: oz }, [RAPIER.ColliderDesc.cuboid(0.22, 0.06, 2.2).setMass(22)], b, { angDamp: 0.3 });
    W.createImpulseJoint(RAPIER.JointData.revolute({ x: ox, y: 0.7, z: oz }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), phys.staticBody, o.body, true);
    for (const e of [-1, 1]) {
      addSeat(game, {
        body: o.body, pos: [0, 0.22, e * 1.85], yaw: e > 0 ? Math.PI : 0, label: 'See-saw', hint: 'A push off · Y exit',
        control(inp, pr) {
          if (!pr.jump) return;
          const t = o.body.translation(), r = o.body.rotation();
          const q = new THREE.Quaternion(r.x, r.y, r.z, r.w), p = new THREE.Vector3(0, 0, e * 1.85).applyQuaternion(q);
          o.body.applyImpulseAtPoint({ x: 0, y: 230, z: 0 }, { x: t.x + p.x, y: t.y + p.y, z: t.z + p.z }, true);
        },
      });
    }
  }

  // ---- merry-go-round
  {
    const mx = cx + 20, mz = cz + 2;
    kit.cyl(mx, 0.2, mz, 0.25, 0.4, 0x777777);
    const b = new Builder();
    b.cyl(2.5, 2.5, 0.16, 0xff5a5a, [0, 0, 0], null, 24);
    for (let i = 0; i < 6; i++) b.add(new THREE.CylinderGeometry(2.48, 2.48, 0.17, 24, 1, false, i * Math.PI / 3, Math.PI / 6), i % 2 ? 0xffffff : 0xffd23f, [0, 0.001, 0]);
    b.cyl(0.3, 0.3, 1.2, 0x3f8cff, [0, 0.6, 0], null, 10);
    const descs = [RAPIER.ColliderDesc.cylinder(0.08, 2.5).setMass(110)];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2, x = Math.sin(a) * 1.7, z = Math.cos(a) * 1.7;
      b.cyl(0.04, 0.04, 0.9, 0xffffff, [x, 0.5, z], null, 6);
      const ax = Math.sin(a) * 0.85, az = Math.cos(a) * 0.85;
      b.cyl(0.04, 0.04, 1.75, 0xffffff, [ax, 0.95, az], [Math.PI / 2, a, 0, 'YXZ'], 6);
      descs.push(RAPIER.ColliderDesc.cylinder(0.45, 0.05).setTranslation(x, 0.5, z).setMass(2));
      descs.push(RAPIER.ColliderDesc.capsule(0.85, 0.05).setTranslation(ax, 0.95, az).setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, a, 0, 'YXZ'))).setMass(1));
    }
    const o = dyn(game, { x: mx, y: 0.5, z: mz }, descs, b, { angDamp: 0.25, friction: 0.9 });
    W.createImpulseJoint(RAPIER.JointData.revolute({ x: mx, y: 0.5, z: mz }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), phys.staticBody, o.body, true);
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) / 4 * Math.PI * 2;
      addSeat(game, {
        body: o.body, pos: [Math.sin(a) * 1.9, 0.27, Math.cos(a) * 1.9], yaw: a + Math.PI, label: 'Ride', hint: 'Push stick to spin · Y exit',
        control(inp) {
          if (Math.abs(inp.moveX) < 0.3) return;
          const w = o.body.angvel();
          if (Math.abs(w.y) < 4) o.body.applyTorqueImpulse({ x: 0, y: -inp.moveX * 60 * DT, z: 0 }, true);
        },
      });
    }
  }

  // ---- monkey bars
  {
    const mx = cx - 18, mz = cz + 4, H = 2.15, n = 9;
    for (const e of [-1, 1]) {
      for (const lz of [-0.5, 0.5]) kit.cyl(mx + e * 3.2, H / 2, mz + lz, 0.07, H, 0x55d85a);
      for (let k = 0; k < 5; k++) kit.cyl(mx + e * 3.2, 0.4 + k * 0.45, mz, 0.04, 1.0, 0xffd23f, { euler: [Math.PI / 2, 0, 0] });
    }
    for (const lz of [-0.5, 0.5]) kit.cyl(mx, H, mz + lz, 0.06, 6.4, 0x55d85a, { euler: [0, 0, Math.PI / 2] });
    for (let i = 0; i < n; i++) kit.cyl(mx - 2.8 + i * 0.7, H, mz, 0.045, 1.0, 0xff5a5a, { euler: [Math.PI / 2, 0, 0] });
  }

  // ---- trampolines
  for (let i = 0; i < 3; i++) {
    const tx = cx + 2 + i * 7, tz = cz + 24, R = 2.3;
    kit.cyl(tx, 0.62, tz, R, 0.12, 0x2a62c9, { bounce: 12.5, seg: 20 });
    kit.cyl(tx, 0.6, tz, R + 0.2, 0.1, 0x222222, { collide: false, seg: 20 });
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2;
      kit.cyl(tx + Math.sin(a) * R, 0.3, tz + Math.cos(a) * R, 0.05, 0.6, 0x777777, { collide: false });
    }
  }

  // ---- sandbox
  {
    const sx = cx - 22, sz = cz + 22;
    for (const [ox, oz, w, d] of [[0, -3.2, 6.6, 0.4], [0, 3.2, 6.6, 0.4], [-3.2, 0, 0.4, 6.0], [3.2, 0, 0.4, 6.0]]) kit.box(sx + ox, 0.2, sz + oz, w, 0.4, d, 0xb5773d);
    kit.deco(sx, 0.12, sz, 6, 0.2, 6, 0xf2dc9b);
    kit.deco(sx + 1, 0.4, sz - 1, 1.2, 0.6, 1.2, 0xe9cf8a);
    kit.cone(sx + 1, 0.95, sz - 1, 0.4, 0.5, 0xe9cf8a, { seg: 4 });
  }

  // ---- spring riders
  for (let i = 0; i < 3; i++) {
    const rx = cx - 4 + i * 3, rz = cz + 10;
    kit.deco(rx, 0.05, rz, 0.8, 0.1, 0.8, 0x777777);
    const b = new Builder(), col = [0xffd23f, 0xff7fc8, 0x55d85a][i];
    b.cyl(0.08, 0.08, 0.5, 0x999999, [0, -0.35, 0], null, 6);
    b.sphere(0.4, col, [0, 0.1, 0], [0.8, 0.7, 1.3]);
    b.sphere(0.25, col, [0, 0.45, 0.4]);
    b.cone(0.1, 0.2, 0xff8a3d, [0, 0.42, 0.68], [Math.PI / 2, 0, 0]);
    b.sphere(0.05, 0x111111, [0.12, 0.52, 0.58]); b.sphere(0.05, 0x111111, [-0.12, 0.52, 0.58]);
    const o = dyn(game, { x: rx, y: 0.7, z: rz }, [RAPIER.ColliderDesc.ball(0.35).setMass(12)], b, { angDamp: 0.4 });
    W.createImpulseJoint(RAPIER.JointData.spherical({ x: rx, y: 0.1, z: rz }, { x: 0, y: -0.6, z: 0 }), phys.staticBody, o.body, true);
    // spring back upright
    game.steppers.push(() => {
      const r = o.body.rotation(), q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const err = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0));
      const w = o.body.angvel();
      o.body.applyTorqueImpulse({ x: (err.x * 160 - w.x * 6) * DT, y: -w.y * 6 * DT, z: (err.z * 160 - w.z * 6) * DT }, true);
    });
    addSeat(game, {
      body: o.body, pos: [0, 0.35, -0.1], yaw: 0, label: 'Ride', hint: 'Stick to rock · Y exit',
      control(inp) {
        o.body.applyTorqueImpulse({ x: -inp.moveY * 40 * DT, y: 0, z: -inp.moveX * 40 * DT }, true);
      },
    });
  }

  // benches, trees
  for (const [x, z, yaw] of [[cx - 30, cz - 5, Math.PI / 2], [cx - 30, cz + 5, Math.PI / 2], [cx + 30, cz + 10, -Math.PI / 2], [cx + 30, cz - 30, -Math.PI / 2]]) kit.bench(x, z, yaw);
  for (const [x, z] of [[cx - 32, cz - 32], [cx + 32, cz - 32], [cx + 32, cz + 32], [cx - 32, cz + 32], [cx, cz - 33], [cx + 33, cz]]) kit.tree(x, z);
}
