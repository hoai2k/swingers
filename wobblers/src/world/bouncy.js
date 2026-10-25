// The bouncy ball: Wobbly Life's rideable space hopper. A big rubber ball with
// two horn handles that you sit on (Y) and bounce about on. It is a vehicle
// (registerVehicle 'hopper' + the 'hopper' handling) and on the phone.
//
// Physics: one dynamic body with a ball collider (bouncy restitution, low
// friction) whose tilt is locked, so the rider stays on top; only the heading
// turns. The rubber look rolls with the ground speed (visual only) and
// squashes on each landing. Ridden, it hops by itself every time it lands;
// holding A (jump) at a landing bounces it much higher. The stick leans: up /
// down (or RT / LT) pushes forward / back, left / right turns. It floats, bumps
// players over like any vehicle, and the second seat lets a friend ride along.
//
// placeBouncyBalls(game) parks a few on the islands (world/index.js).
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { DT, G_STATIC, G_VEH, G_PROP, groups } from '../config.js';
import { registerVehicle, registerHandling, Vehicle } from '../vehicles.js';
import { registerCallable } from '../phone.js';
import { matVC } from '../mesh.js';

const R = 0.8;              // ball radius (m)
const HOP_V = 4.3;          // auto hop at each landing (m/s up)
const BOUNCE_V = 8.6;       // A held at a landing: ~3.8 m high
const MAX_V = 8.5;          // top speed pushing on the stick (m/s)
const TURN = 2.4;           // rad/s
const RAY_Q = groups(0xffff, G_STATIC | G_VEH | G_PROP);
const SILENT = { w1: 'sine', w2: 'sine', base: 5, range: 1, ratio: 1, lp: 40, vol: 0.0001, am: 0 };
const balls = new Set();
let animator = null;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3();

// Add (dx, dy, dz) to the ball's velocity and to every rider's limbs, so the
// seat joints don't have to drag the riders along (they outweigh the ball).
function addVel(v, dx, dy, dz) {
  const lv = v.body.linvel();
  v.body.setLinvel({ x: lv.x + dx, y: lv.y + dy, z: lv.z + dz }, true);
  for (const s of v.seats) {
    const p = s.occupant;
    if (!p) continue;
    for (const b of p.bodies) { const bv = b.linvel(); b.setLinvel({ x: bv.x + dx, y: bv.y + dy, z: bv.z + dz }, true); }
  }
}

// Distance from the ball centre down to whatever it rests on (or 99).
function groundGap(v) {
  const t = v.body.translation();
  const hit = v.game.physics.world.castRay(new RAPIER.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 }), R + 0.5, true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, RAY_Q, undefined, v.body);
  return hit ? hit.timeOfImpact : 99;
}

registerHandling('hopper', {
  wheels: false,
  update(v, drv, vel, fwd) {
    let h = v.hop;
    if (!h) { h = v.hop = { cool: 0, squash: 0, air: 0, last: 0 }; makeBuoyant(v.game, v); }
    h.cool -= DT;
    const gap = groundGap(v);
    const onGround = gap < R + 0.1;
    h.air = onGround ? 0 : h.air + DT;
    v.grounded = onGround ? 1 : 0;
    const ctl = v.hopCtl || { x: 0, y: 0, jump: false };
    if (!drv) { ctl.x = ctl.y = 0; ctl.jump = false; }
    // heading: the stick turns it (the tilt axes are locked)
    const av = v.body.angvel();
    const wy = drv ? -ctl.x * TURN : av.y * 0.9;
    v.body.setAngvel({ x: 0, y: av.y + (wy - av.y) * Math.min(1, DT * 8), z: 0 }, true);
    if (!drv) return;
    // lean: push along the heading, a little grip sideways on the ground
    const fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl;
    const along = vel.x * fx + vel.z * fz, side = vel.x * fz - vel.z * fx;
    const want = ctl.y * MAX_V;
    const acc = (onGround ? 9 : 3.5) * DT;
    let dA = Math.max(-acc, Math.min(acc, want - along));
    if (Math.abs(ctl.y) < 0.05 && onGround) dA = Math.max(-1.5 * DT, Math.min(1.5 * DT, -along)); // rolls to a stop slowly
    const dS = onGround ? -side * Math.min(1, DT * 3) : 0;
    let dy = 0;
    // a landing: hop again (higher with A held)
    const up = ctl.jump ? BOUNCE_V : HOP_V;
    if (onGround && h.cool <= 0 && vel.y < up - 1) { // (the rubber may already have bounced it a little)
      dy = up - vel.y;
      h.cool = 0.3;
      h.squash = Math.min(1, 0.35 + h.last * 0.08);
      h.bounces = (h.bounces || 0) + 1;
      const pos = v.body.translation();
      v.game.audio?.play('boing', pos, Math.min(1, 0.4 + up / 12));
    }
    if (!onGround) h.last = Math.max(h.last, -vel.y); else if (dy) h.last = 0;
    addVel(v, fx * dA + fz * dS, dy, fz * dA - fx * dS);
  },
});

registerVehicle('hopper', {
  mass: 35, half: [R, R, R], open: true, handling: 'hopper', engineVoice: SILENT, horn: 'bumper',
  com: [0, 0, 0], camH: 2.0, camDist: 7.5,
  seats: [{ pos: [0, R + 0.2, -0.05], kind: 'driver' }, { pos: [0, R - 0.02, -0.62] }],
  colliders(add, C, def, v) {
    const c = add(C.ball(R));
    c.setRestitution(0.55); c.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    c.setFriction(0.25);
    // stays upright: only the heading turns (the look rolls instead)
    v.body.setEnabledRotations(false, true, false, true);
    v.body.setAngularDamping(2);
  },
  mesh(b, def, color, P, v) {
    // the rubber ball: stripes of the colour and white, rolled by the animator
    const geo = new THREE.SphereGeometry(R, 24, 16);
    const col = new THREE.Color(color), white = new THREE.Color(0xfff6ea), dark = col.clone().multiplyScalar(0.8);
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const lon = Math.atan2(x, z), band = Math.floor((lon + Math.PI) / (Math.PI / 4)) % 2;
      const c = Math.abs(y) > R * 0.93 ? white : band ? col : dark;
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const ball = new THREE.Mesh(geo, matVC);
    ball.castShadow = true; ball.receiveShadow = true;
    // a big grin on the front, like the real thing
    const face = new THREE.Group();
    const fb = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const sx of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), fb);
      eye.position.set(sx, 0.32, R * 0.93); face.add(eye);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 5, 14, Math.PI), fb);
    smile.position.set(0, 0.12, R * 0.94); smile.rotation.set(-0.35, 0, Math.PI);
    face.add(smile);
    ball.add(face);
    P.shell.add(ball);
    // horn handles on top (they stay up while the ball rolls)
    for (const sx of [-1, 1]) {
      b.capsule(0.075, 0.32, color, [sx * 0.2, R + 0.12, 0.42], [0.5, 0, sx * -0.35]);
      b.sphere(0.1, color, [sx * 0.26, R + 0.34, 0.5]);
    }
    b.cyl(0.32, 0.36, 0.08, color, [0, R - 0.01, -0.05], null, 16); // the saddle patch
    v.ball = ball; v.ballQ = new THREE.Quaternion();
    // driver input: the stick leans and turns, A held bounces high
    v.hopCtl = { x: 0, y: 0, jump: false };
    v.control = (inp) => {
      const c = v.hopCtl;
      c.x = inp.moveX || inp.steer || 0;
      c.y = Math.abs(inp.moveY || 0) > 0.05 ? inp.moveY : (inp.gas || 0) - (inp.brake || 0);
      c.jump = !!inp.jump;
      v.throttle = c.y; v.steer = -c.x; v.handbrake = false;
    };
    balls.add(v);
    if (!animator) {
      animator = (dt) => {
        for (const a of balls) {
          if (a.destroyed) { balls.delete(a); continue; }
          const lv = a.body.linvel(), sp = Math.hypot(lv.x, lv.z);
          if (sp > 0.05) {
            // roll about the horizontal axis across the motion, kept in world space
            _ax.set(lv.z / sp, 0, -lv.x / sp);
            a.ballQ.premultiply(_q.setFromAxisAngle(_ax, sp * dt / R));
          }
          const r = a.body.rotation();
          _q2.set(r.x, r.y, r.z, r.w).invert();
          a.ball.quaternion.copy(_q2).multiply(a.ballQ);
          const h = a.hop;
          const s = h ? h.squash : 0;
          if (h) h.squash = Math.max(0, h.squash - dt * 4);
          const k = Math.sin(Math.min(1, s) * Math.PI) * 0.18;
          a.ball.scale.set(1 + k, 1 - k * 1.3, 1 + k);
          a.ball.position.y = -k * R * 1.3;
        }
      };
      v.game.updaters.push(animator);
    }
  },
});
// it floats (the default vehicle buoyancy is a small blob for wheeled cars)
const HOPPER_BUOY = { r: R, volume: 0.32, drag: 1.5 };

registerCallable({ id: 'hopper', type: 'hopper', name: 'Bouncy ball', color: 0xff5a8a,
  svg: '<circle cx="12" cy="8.2" r="5.6"/><path d="M8.2 3.4 L7 0.8 L8.6 0.6 L9.6 3 Z"/><path d="M15.8 3.4 L17 0.8 L15.4 0.6 L14.4 3 Z"/><path d="M5 13.4 L19 13.4 L19 14 L5 14 Z"/>' }, 'boat');

// A ball body gets its buoyancy once it exists (phone or placed).
export function makeBuoyant(game, v) {
  const o = game.physics.objects.find((ob) => ob.body === v.body);
  if (o) o.buoy = { ...HOPPER_BUOY };
}
// A few balls to find: by the playground, at the fun park and one on each island.
const SPOTS = [
  [96, -86, 0xff5a8a], [101, -86, 0x3f8cff], [-176, 18, 0xffc233], [-30, -46, 0x55d85a],
  [905, -4, 0xff8a3d], [4, -797, 0xb46cff], [-955, -26, 0xff5a5a], [-404, 768, 0x3fe0d0], [474, 623, 0xff7fc8],
];
export function placeBouncyBalls(game) {
  game.physics.world.updateSceneQueries?.();
  for (const [x, z, color] of SPOTS) {
    const y = game.groundHeight(x, z, game.terrain.groundAt(x, z) + 4) + R + 0.15;
    const v = new Vehicle(game, 'hopper', x, y, z, Math.random() * Math.PI * 2, color);
    game.vehicles.push(v);
  }
}
