// Snowmen you can knock over (they rebuild themselves when nobody is looking)
// and piles of snowballs to throw (punch while holding one, or standing at
// the pile). A snowball that hits someone knocks them flat and bursts; one
// that smacks into anything else bursts too, and a fresh one appears on its
// pile. Both are drawn with one InstancedMesh each.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder, matVC } from '../../../mesh.js';
import { DT } from '../../../config.js';
import { LAKE, TOP, CAVE, HAMLET, SUMMIT, JUMP } from './layout.js';

const _o = new THREE.Object3D(), _one = new THREE.Vector3(1, 1, 1);

function instanced(game, builder, n) {
  const im = new THREE.InstancedMesh(builder.geometry(), matVC, n);
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.noCull = true;
  game.scene.add(im);
  return im;
}

// ---- snowmen ------------------------------------------------------------------------------
function snowmen(game, R, spots) {
  const b = new Builder(), W = 0xf6f9ff;
  b.sphere(0.6, W, [0, 0.55, 0], [1, 0.92, 1], 12);
  b.sphere(0.45, W, [0, 1.38, 0], null, 11);
  b.sphere(0.33, W, [0, 2.02, 0], null, 10);
  b.cone(0.07, 0.38, 0xff8a1a, [0, 2.0, 0.48], [Math.PI / 2, 0, 0], 7);                 // carrot
  for (const s of [-1, 1]) b.sphere(0.045, 0x1e1e24, [s * 0.11, 2.1, 0.29], null, 6);  // coal eyes
  for (const y of [1.25, 1.42, 1.6]) b.sphere(0.05, 0x1e1e24, [0, y, 0.43], null, 6);
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.3; b.sphere(0.03, 0x1e1e24, [Math.sin(a) * 0.22, 1.93 - Math.cos(a) * 0.06, 0.26], null, 5); }
  for (const s of [-1, 1]) {
    b.cyl(0.025, 0.035, 0.9, 0x6a4a32, [s * 0.75, 1.55, 0], [0, 0, s * 1.0], 5);       // stick arms
    b.cyl(0.015, 0.02, 0.25, 0x6a4a32, [s * 1.02, 1.82, 0.05], [0.4, 0, s * 0.3], 4);
  }
  b.torus(0.32, 0.08, 0xd9342b, [0, 1.75, 0], [Math.PI / 2, 0, 0], 12);                 // scarf
  b.box(0.12, 0.42, 0.06, 0xd9342b, [0.18, 1.55, 0.3], [0.1, 0, 0.2]);
  b.cyl(0.36, 0.36, 0.04, 0x1e1e24, [0, 2.3, 0], null, 12);                            // top hat
  b.cyl(0.24, 0.25, 0.42, 0x1e1e24, [0, 2.52, 0], null, 12);
  b.cyl(0.255, 0.255, 0.08, 0xd9342b, [0, 2.36, 0], null, 12);
  const im = instanced(game, b, spots.length);
  const list = spots.map(([x, z, yaw]) => {
    const y = R.groundAt(x, z) + 0.02, rot = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    const descs = [
      RAPIER.ColliderDesc.ball(0.55).setTranslation(0, 0.55, 0).setMass(28),
      RAPIER.ColliderDesc.ball(0.43).setTranslation(0, 1.38, 0).setMass(10),
      RAPIER.ColliderDesc.ball(0.32).setTranslation(0, 2.02, 0).setMass(4),
    ];
    const o = game.physics.dynamic({ x, y, z }, descs, null, { rot, kind: 'snowman', friction: 0.9, angDamp: 0.6, linDamp: 0.3 });
    o.rec = game.physics.track(o.body);
    o.down = 0;
    o.body.sleep();
    return o;
  });
  let n = 0;
  game.steppers.push(() => {
    if (++n % 30) return;
    for (const o of list) {
      const r = o.body.rotation(), up = 1 - 2 * (r.x * r.x + r.z * r.z);
      const t = o.body.translation(), h = o.home;
      const moved = Math.hypot(t.x - h.x, t.z - h.z) > 1.5 || up < 0.85;
      o.down = moved ? o.down + 0.5 : 0;
      if (o.down > 25 && !game.players.some((p) => { const c = p.chest.translation(); return Math.hypot(c.x - h.x, c.z - h.z) < 18; })) {
        o.body.setTranslation(h, true); o.body.setRotation(o.homeRot, true);
        o.body.setLinvel({ x: 0, y: 0, z: 0 }, true); o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        o.rec.snap = true; o.down = 0; o.body.sleep();
      }
    }
  });
  game.updaters.push(() => {
    list.forEach((o, i) => { game.physics.pose(o.rec, _o); im.setMatrixAt(i, _o.matrix.compose(_o.position, _o.quaternion, _one)); });
    im.instanceMatrix.needsUpdate = true;
  });
  return list;
}

// ---- snowballs ---------------------------------------------------------------------------------
function snowballs(game, R, piles, men) {
  const b = new Builder();
  b.sphere(0.17, 0xffffff, [0, 0, 0], null, 9);
  const balls = [];
  for (const [px, pz] of piles) {
    const gy = R.groundAt(px, pz);
    // the heap itself (static decoration)
    game.kit.sphere(px, gy, pz, 0.9, 0xf6f9ff, { scale: [1, 0.35, 1], seg: 8 });
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2, x = px + Math.cos(a) * 0.45, z = pz + Math.sin(a) * 0.45, y = gy + 0.42 + (i === 4 ? 0.25 : 0);
      const o = game.physics.dynamic({ x: i === 4 ? px : x, y, z: i === 4 ? pz : z }, RAPIER.ColliderDesc.ball(0.17).setMass(0.7), null, { kind: 'snowball', friction: 0.8, linDamp: 0.1, angDamp: 0.5, ccd: true });
      o.rec = game.physics.track(o.body);
      o.flying = 0; o.idle = 0; o.thrower = null;
      o.body.sleep();
      R.common.throwable(game, o, { r: 0.5, speed: 16, up: 0.22, spin: 5, onThrow: (p) => { o.flying = 1.6; o.thrower = p; o.prevV = null; } });
      balls.push(o);
    }
  }
  const im = instanced(game, b, balls.length);
  const _v = new THREE.Vector3();
  const reset = (o) => {
    o.body.setTranslation(o.home, true); o.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    o.body.setLinvel({ x: 0, y: 0, z: 0 }, true); o.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    o.rec.snap = true; o.flying = 0; o.idle = 0; o.body.sleep();
  };
  const poof = (pos) => {
    game.audio?.play?.('punch', pos);
    puffs.push({ x: pos.x, y: pos.y, z: pos.z, t: 0 });
  };
  game.steppers.push(() => {
    for (const o of balls) {
      if (o.body.isSleeping()) continue;
      const t = o.body.translation(), v = o.body.linvel(), s = Math.hypot(v.x, v.y, v.z);
      if (o.flying > 0) {
        o.flying -= DT;
        // hit a player or an NPC: knock them over
        let hit = null;
        const targets = game.npcs ? [...game.players, ...game.npcs.list.filter((n) => !n.parked)] : game.players;
        for (const p of targets) {
          if (p === o.thrower || !p.chest) continue;
          for (const part of [p.chest, p.parts.head.body, p.hips]) {
            const c = part.translation();
            if ((c.x - t.x) ** 2 + (c.y - t.y) ** 2 + (c.z - t.z) ** 2 < 0.5 * 0.5) { hit = p; break; }
          }
          if (hit) break;
        }
        if (hit) {
          if (hit.state !== 'seated') {
            for (const bb of hit.bodies) bb.applyImpulse({ x: v.x * 0.25 * bb.mass(), y: 1.5 * bb.mass(), z: v.z * 0.25 * bb.mass() }, true);
            hit.knockOut(1.2);
          }
          poof(t); reset(o); continue;
        }
        for (const m of men) { // bonk a snowman
          const c = m.body.translation();
          if (Math.hypot(c.x - t.x, c.z - t.z) < 0.75 && t.y > c.y + 0.6 && t.y < c.y + 2.5) {
            m.body.applyImpulseAtPoint({ x: v.x * 2.2, y: 0, z: v.z * 2.2 }, t, true);
            poof(t); reset(o); hit = true; break;
          }
        }
        if (hit) continue;
        // splat on anything else: a sudden loss of speed
        if (o.prevV == null || o.flying > 1.5) o.prevV = Math.max(o.prevV || 0, s);
        else if (s < o.prevV * 0.55) { poof(t); reset(o); continue; }
        o.prevV = s;
        if (o.flying <= 0) o.flying = 0;
      } else {
        // dropped or rolled away: back to the pile after a while
        const h = o.home, far = Math.hypot(t.x - h.x, t.z - h.z) > 3;
        o.idle = far && s < 0.5 ? o.idle + DT : 0;
        if (o.idle > 15 || t.y < -5) reset(o);
      }
    }
  });
  const puffs = [], pb = new Builder();
  pb.sphere(0.5, 0xffffff, [0, 0, 0], null, 7);
  const pm = instanced(game, pb, 8); pm.count = 0; pm.castShadow = false;
  game.updaters.push((dt) => {
    balls.forEach((o, i) => { game.physics.pose(o.rec, _o); im.setMatrixAt(i, _o.matrix.compose(_o.position, _o.quaternion, _one)); });
    im.instanceMatrix.needsUpdate = true;
    for (let i = puffs.length - 1; i >= 0; i--) if ((puffs[i].t += dt) > 0.35) puffs.splice(i, 1);
    while (puffs.length > 8) puffs.shift();
    pm.count = puffs.length;
    puffs.forEach((p, i) => { const k = p.t / 0.35; _v.setScalar(0.3 + k * 1.2); _o.position.set(p.x, p.y + k * 0.3, p.z); _o.quaternion.identity(); pm.setMatrixAt(i, _o.matrix.compose(_o.position, _o.quaternion, _v)); });
    pm.instanceMatrix.needsUpdate = true;
  });
  return balls;
}

export function buildFun(game, kit, R) {
  const men = snowmen(game, R, [
    [14, -770, 0.3], [-14, -782, -0.4], [40, -800, -0.9], [-44, -790, 0.8], [6, -828, 0.2], // village
    [LAKE.x + 14, LAKE.z + 28, 2.8], [LAKE.x - 26, LAKE.z - 18, 1.2],                      // lake shore
    [-48, -1072, 0.2], [SUMMIT.x - 9, SUMMIT.z + 9, 0.6], [CAVE.x + 7, CAVE.z + 20, -0.5],
    [(HAMLET.x0 + HAMLET.x1) / 2, HAMLET.z0 - 2, 0], [JUMP.x - 8, JUMP.zLip + 40, 0.4],
  ]);
  game.snowmen = men;
  game.snowballs = snowballs(game, R, [[8, -772], [-24, -800], [36, -808], [LAKE.x + 10, LAKE.z + 29], [TOP.x1 - 4, TOP.z1 - 4], [CAVE.x - 5, CAVE.z + 18], [HAMLET.x0 + 6, HAMLET.z1 - 6]], men);
}
