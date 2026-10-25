// Bigtown interactive bits: the plaza (fountain, bean statue, street piano,
// hot-dog cart that hands out throwable hot dogs, newspaper stands), the
// crash mat under Bigtown Tower's jump plank, a basketball court with
// working hoops, bus stops and traffic cones.
import * as THREE from 'three';
import { RAPIER, yawQuat } from '../../../physics.js';
import { VEH_GROUPS, DT } from '../../../config.js';
import { Builder, signMesh } from '../../../mesh.js';
import { Local, throwable, lob, chime, liveSign, place, clunk, tone } from '../../common.js';
import { addSeat } from '../../playground.js';
import { piano, vendingMachine } from '../../music.js';
import { spawnProp } from '../../props.js';
import { SW, Y } from './layout.js';

const C = RAPIER.ColliderDesc;

// ---- Central Plaza -------------------------------------------------------------------
export function buildPlaza(game, kit, R, b) {
  const { cx, cz } = b;
  // paving pattern + planters around the edge
  kit.deco(cx, SW + 0.01, cz, b.w - 4, 0.02, b.d - 4, 0xe2d6c0);
  for (let i = -2; i <= 2; i++) { kit.deco(cx + i * 10, SW + 0.02, cz, 0.4, 0.02, b.d - 4, 0xc8b89a); kit.deco(cx, SW + 0.02, cz + i * 10, b.w - 4, 0.02, 0.4, 0xc8b89a); }
  for (const [dx, dz] of [[-24, -26], [24, -26], [-24, 26], [24, 26], [-24, 0], [24, 0]]) {
    kit.box(cx + dx, SW + 0.35, cz + dz, 3, 0.7, 3, 0x9a958c);
    kit.deco(cx + dx, SW + 0.71, cz + dz, 2.7, 0.02, 2.7, 0x6b4a2a);
    kit.tree(cx + dx, cz + dz, SW + 0.6, 0, 0.9);
  }
  fountain(game, kit, R, cx, cz);
  // bean statue on a plinth
  const sx = cx, sz = cz - 20;
  kit.box(sx, SW + 1, sz, 3, 2, 3, 0xbab4a8);
  kit.box(sx, SW + 2.15, sz, 3.4, 0.3, 3.4, 0xa8a296);
  kit.sphere(sx, SW + 3.5, sz, 0.9, 0x8aa07a, { scale: [1, 1.25, 0.9], collide: true });
  kit.sphere(sx, SW + 5.0, sz, 0.75, 0x8aa07a);
  kit.cyl(sx + 0.9, SW + 4.6, sz, 0.18, 1.3, 0x8aa07a, { euler: [0, 0, -2.4], collide: false });
  kit.cyl(sx, SW + 5.8, sz, 0.55, 0.5, 0x8aa07a, { collide: false }); // top hat
  kit.cyl(sx, SW + 5.56, sz, 0.85, 0.06, 0x8aa07a, { collide: false });
  // benches facing the fountain
  for (const [dx, dz, yaw] of [[0, 12, Math.PI], [-12, 0, Math.PI / 2], [12, 0, -Math.PI / 2], [-9, 12, Math.PI], [9, 12, Math.PI]]) kit.bench(cx + dx, cz + dz, yaw, SW);
  // street piano under a little canopy
  const L = new Local(kit, cx + 16, cz + 18, 0, SW);
  piano(game, L, 0, 0, 0);
  L.box(0, 3.2, 0.6, 3.4, 0.15, 3, 0xff6fae);
  for (const [lx, lz] of [[-1.6, -0.8], [1.6, -0.8], [-1.6, 2], [1.6, 2]]) L.cyl(lx, 1.6, lz, 0.06, 3.2, 0xffffff, { collide: false, seg: 6 });
  R.sign('PLAY ME', ...Object.values(L.v3(0, 3.7, 0.6)), 0, 2.4, '#ff6fae', '#ffffff');
  // hot dogs, news, a drinks machine
  hotDogCart(game, kit, R, cx - 15, cz + 17, 0);
  newsStand(game, cx - 6, cz - 26, 0); newsStand(game, cx - 4.8, cz - 26, 0); newsStand(game, cx + 20, cz - 8, -Math.PI / 2);
  vendingMachine(game, new Local(kit, cx - 26.5, cz - 12, Math.PI / 2, SW), 0, 0, 0, 0xff3a3a);
  R.coins(cx, cz, SW + 3, 'ring', 10, 9);
}

function fountain(game, kit, R, x, z) {
  const S = 11, H = 0.8, T = 0.6;
  // basin walls (sit on them) + floor
  for (const s of [-1, 1]) {
    kit.box(x + s * (S / 2 - T / 2), SW + H / 2, z, T, H, S, 0xd8d0c0);
    kit.box(x, SW + H / 2, z + s * (S / 2 - T / 2), S - 2 * T, H, T, 0xd8d0c0);
  }
  kit.deco(x, SW + 0.03, z, S - 2 * T, 0.04, S - 2 * T, 0x5aa0c8);
  R.addWater(game, x - S / 2 + T, x + S / 2 - T, z - S / 2 + T, z + S / 2 - T, SW, SW + 0.6, 0x4fd0ff, 0.7);
  // tiers
  kit.cyl(x, SW + 1.0, z, 0.6, 2.0, 0xd8d0c0, { seg: 12 });
  kit.cyl(x, SW + 2.0, z, 2.0, 0.3, 0xd8d0c0, { seg: 18, rTop: 2.2 });
  kit.cyl(x, SW + 2.9, z, 0.35, 1.6, 0xd8d0c0, { seg: 10 });
  kit.cyl(x, SW + 3.6, z, 1.0, 0.2, 0xd8d0c0, { seg: 14, rTop: 1.2 });
  // water jets: a few translucent streams that bob up and down
  const b = new Builder();
  b.cyl(0.08, 0.2, 1.4, 0xffffff, [0, 0.7, 0], null, 8);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.cyl(0.05, 0.1, 1.2, 0xffffff, [Math.sin(a) * 1.4, 0.2, Math.cos(a) * 1.4], [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5], 6); }
  const jets = new THREE.Mesh(b.geometry(), new THREE.MeshLambertMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.55, depthWrite: false }));
  jets.position.set(x, SW + 3.7, z);
  game.scene.add(jets);
  game.updaters.push((dt, t) => { jets.scale.y = 1 + 0.15 * Math.sin(t * 5); });
  R.coins(x + 3.4, z, SW + 2, 'line', 4, 4, { yaw: Math.PI / 2, water: true });
}

// A pushable hot-dog cart (wheels, umbrella). Y at the cart hands you a hot dog to throw.
export function hotDogCart(game, kit, R, x, z, yaw) {
  const b = new Builder();
  b.rbox(2.0, 0.9, 1.0, 0.08, 0xffffff, [0, 0, 0]);
  b.box(2.02, 0.25, 1.02, 0xe8322b, [0, -0.2, 0]);
  b.box(1.9, 0.06, 0.9, 0xbbbbbb, [0, 0.48, 0]);
  b.cyl(0.03, 0.03, 1.8, 0xdddddd, [0.7, 1.4, 0], null, 6);
  b.cone(1.3, 0.5, 0xffd23f, [0.7, 2.45, 0], null, 12);
  b.cone(1.31, 0.5, 0xe8322b, [0.7, 2.44, 0], [0, 0.26, 0], 6);
  for (const [wx, wz] of [[-0.7, 0.5], [0.7, 0.5], [-0.7, -0.5], [0.7, -0.5]]) b.cyl(0.22, 0.22, 0.08, 0x222222, [wx, -0.48, wz], [Math.PI / 2, 0, 0], 12);
  b.cyl(0.03, 0.03, 0.9, 0xdddddd, [-1.15, 0.35, 0], [0, 0, Math.PI / 2], 6); // push bar
  for (let i = 0; i < 3; i++) b.capsule(0.05, 0.25, 0xc8603a, [-0.5 + i * 0.25, 0.55, 0.2], [0, 0, Math.PI / 2]);
  const y = SW + 0.72;
  const o = game.physics.dynamic({ x, y, z }, [
    C.cuboid(1.0, 0.45, 0.5).setMass(40).setFriction(0.3),
    C.cuboid(0.9, 0.08, 0.45).setTranslation(0, -0.5, 0).setMass(30).setFriction(0.05),
  ], b.mesh(), { rot: yawQuat(yaw), groups: VEH_GROUPS, angDamp: 1.0, linDamp: 0.4 });
  game.scene.add(o.mesh);
  for (const sd of [1, -1]) { // painted-art-ready signs on both long sides, riding with the cart
    const sg = signMesh('HOT DOGS', 1.6, '#e8322b', '#ffffff');
    sg.position.set(-0.2, 0.12, sd * 0.515); if (sd < 0) sg.rotation.y = Math.PI;
    o.mesh.add(sg);
  }
  // hot dogs to throw (a pool of 6)
  const dogs = [];
  let n = 0, cool = 0;
  game.steppers.push(() => { cool -= DT; });
  addSeat(game, {
    body: o.body, pos: [0.3, 0.6, 0.9], kind: 'use', label: 'Get a hot dog',
    use(p) {
      if (cool > 0) return; cool = 0.6;
      let d;
      if (dogs.length < 6) {
        const hb = new Builder();
        hb.capsule(0.07, 0.26, 0xf2c27a, [0, 0, 0], [0, 0, Math.PI / 2]);
        hb.capsule(0.045, 0.32, 0xc8503a, [0, 0.04, 0], [0, 0, Math.PI / 2]);
        hb.box(0.28, 0.015, 0.03, 0xffd23f, [0, 0.09, 0]);
        d = game.physics.dynamic({ x, y: y + 1, z }, [C.capsule(0.15, 0.07).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setMass(0.2)], hb.mesh(), { angDamp: 0.4 });
        game.scene.add(d.mesh);
        throwable(game, d, { r: 0.15, speed: 11, up: 0.35 });
        dogs.push(d);
      } else { d = dogs[n++ % dogs.length]; }
      const t = o.body.translation(), c = p.chest.translation();
      place(d.body, { x: (t.x + c.x) / 2, y: c.y + 0.2, z: (t.z + c.z) / 2 });
      d.body.setLinvel({ x: (c.x - t.x) * 0.8, y: 1.5, z: (c.z - t.z) * 0.8 }, true);
      tone(game, c, 660, 990, 0.12, 0.15, 'sine');
      game.audio?.play('pop', c, 0.5);
    },
  });
  return o;
}

// Newspaper box: a heavy little dynamic box you can shove, grab and tip over.
export function newsStand(game, x, z, yaw, color = [0x3f8cff, 0xe8322b, 0x55d85a][Math.abs(Math.round(x + z)) % 3]) {
  const b = new Builder();
  b.rbox(0.55, 0.9, 0.45, 0.05, color, [0, 0, 0]);
  b.box(0.45, 0.35, 0.02, 0xd8f0ff, [0, 0.15, 0.23]);
  b.box(0.38, 0.25, 0.01, 0xf4f0e0, [0, 0.12, 0.235]);
  b.box(0.5, 0.06, 0.4, 0x2a2a33, [0, 0.47, 0]);
  b.box(0.12, 0.04, 0.03, 0x888888, [0.15, -0.15, 0.23]);
  const o = game.physics.dynamic({ x, y: SW + 0.47, z }, [C.cuboid(0.275, 0.45, 0.225).setMass(18).setFriction(0.8)], b.mesh(), { rot: yawQuat(yaw) });
  game.scene.add(o.mesh);
  return o;
}

// Big soft mat (not bouncy: a soft landing) under the jump plank.
export function crashMat(kit, x, z, w, d) {
  kit.box(x, SW + 0.5, z, w, 1.0, d, 0x3f8cff, { round: 0.35, friction: 1.2 });
  for (let i = -1; i <= 1; i++) kit.deco(x + i * w / 3, SW + 1.01, z, 0.2, 0.02, d - 0.6, 0xffd23f);
}

// Cones (props.js) in a row.
export function cones(game, x0, z0, x1, z1, n) {
  for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) : 0; spawnProp(game, 'cone', x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, SW); }
}

// Bus stop shelter facing yaw (local +z = the road).
export function busStop(game, kit, R, x, z, yaw) {
  const L = new Local(kit, x, z, yaw, SW);
  L.box(0, 1.25, -0.9, 4, 2.5, 0.1, 0x9fd8ff);
  for (const s of [-1, 1]) { L.box(s * 2, 1.25, -0.2, 0.1, 2.5, 1.4, 0x9fd8ff); L.cyl(s * 2, 1.3, 0.5, 0.06, 2.6, 0x55595f, { collide: false, seg: 6 }); }
  L.box(0, 2.6, -0.2, 4.4, 0.12, 1.8, 0x2a62c9);
  const [bx, bz] = L.w(0, -0.4);
  kit.bench(bx, bz, yaw, SW);
  R.sign('CITY BUS', ...Object.values(L.v3(0, 3.0, 0.5)), yaw, 1.6, '#222228', '#ffb020');
}

// ---- basketball court with working hoops (like the home island's, on a city plate) ----
export function basketballCourt(game, kit, R, bx, bz) {
  const G = SW, RH = 2.75, RR = 0.4, BR = 0.19;
  kit.deco(bx, G + 0.02, bz, 22, 0.03, 14, 0xd86a3a);
  kit.deco(bx, G + 0.04, bz, 0.12, 0.02, 14, 0xffffff);
  // fence round it (gaps at the middle of the long sides)
  for (const s of [-1, 1]) {
    kit.fence(bx - 12, bz + s * 8, bx - 2, bz + s * 8, 0x55595f, 3);
    kit.fence(bx + 2, bz + s * 8, bx + 12, bz + s * 8, 0x55595f, 3);
    kit.fence(bx + s * 12, bz - 8, bx + s * 12, bz + 8, 0x55595f, 3);
  }
  const hoops = [];
  for (const s of [-1, 1]) {
    const hx = bx + s * 9.5, rx = hx - s * 0.45;
    kit.cyl(hx + s * 0.6, G + 1.9, bz, 0.1, 3.8, 0x666666);
    kit.box(hx + s * 0.3, G + 3.6, bz, 0.6, 0.1, 0.1, 0x666666);
    kit.box(hx, G + RH + 0.45, bz, 0.1, 1.1, 1.8, 0xffffff, { restitution: 0.5 });
    kit.deco(hx - s * 0.055, G + RH + 0.35, bz, 0.01, 0.45, 0.6, 0xff5a1a);
    const b = kit.b(hx, bz);
    b.torus(RR, 0.025, 0xff5a1a, [rx, G + RH, bz], [Math.PI / 2, 0, 0], 20);
    b.add(new THREE.CylinderGeometry(RR, RR * 0.65, 0.45, 12, 1, true), 0xffffff, [rx, G + RH - 0.23, bz]);
    kit.deco(hx - s * 0.22, G + RH, bz, 0.4, 0.04, 0.06, 0xff5a1a);
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; game.physics.ball(rx + Math.cos(a) * RR, G + RH, bz + Math.sin(a) * RR, 0.03, { restitution: 0.6 }); }
    hoops.push({ x: rx, y: G + RH, z: bz, score: 0 });
  }
  const board = liveSign(game, 3.2, 1.0, '#112', '#ffd23f');
  board.mesh.position.set(bx, G + 3.4, bz - 8.2);
  kit.box(bx, G + 1.4, bz - 8.3, 0.2, 2.8, 0.2, 0x666666);
  const show = () => board.set(['HOME ' + hoops[1].score + '  :  ' + hoops[0].score + ' AWAY']);
  show();
  const aim = (p, body) => {
    const t = body.translation();
    let best = null, bd = 1e9;
    for (const h of hoops) {
      const D = Math.hypot(h.x - t.x, h.z - t.z);
      let da = Math.atan2(h.x - t.x, h.z - t.z) - p.yaw; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
      if (D < 11 && D > 0.4 && da < 0.9 && D < bd) { bd = D; best = h; }
    }
    if (!best) return null;
    const tgt = { x: best.x + (Math.random() - 0.5) * 0.12, y: best.y + 0.05, z: best.z + (Math.random() - 0.5) * 0.12 };
    for (let a = 0.85; a < 1.45; a += 0.04) {
      const v = lob(t, tgt, a);
      if (!v) continue;
      const vh = Math.hypot(v.x, v.z), tt = Math.max(0, bd - RR) / vh;
      if (t.y + v.y * tt - 4.905 * tt * tt > best.y + BR + 0.06) return v;
    }
    return lob(t, tgt, 1.3);
  };
  const balls = [];
  for (let i = 0; i < 3; i++) {
    const b = new Builder();
    b.sphere(BR, 0xff7a2a, [0, 0, 0], null, 14);
    b.torus(BR, 0.008, 0x222222, [0, 0, 0], [Math.PI / 2, 0, 0]); b.torus(BR, 0.008, 0x222222, [0, 0, 0], [0, 0, 0]);
    const o = game.physics.dynamic({ x: bx - 2 + i * 2, y: G + 0.4, z: bz + 2 }, [C.ball(BR).setMass(0.6).setRestitution(0.75)], b.mesh(), { ccd: true });
    game.scene.add(o.mesh);
    throwable(game, o, { r: BR + 0.02, speed: 7, up: 0.9, aim });
    balls.push({ body: o.body, py: 0, home: { x: bx - 2 + i * 2, y: G + 0.4, z: bz + 2 } });
  }
  let k = 0;
  game.steppers.push(() => {
    for (const b of balls) {
      const t = b.body.translation();
      if (b.py > hoops[0].y && t.y <= hoops[0].y) {
        for (const h of hoops) if (Math.hypot(t.x - h.x, t.z - h.z) < RR - 0.05 && b.body.linvel().y < 0) {
          h.score++; show(); chime(game, h, [76, 79, 84]);
          game.life?.reward(game.throwers?.get(b.body.handle), 3, 'Basket!', h);
        }
      }
      b.py = t.y;
      // lost balls come back
      if (++k % 300 === 0 && (Math.hypot(t.x - bx, t.z - bz) > 60 || t.y < -3)) place(b.body, b.home);
    }
  });
}
