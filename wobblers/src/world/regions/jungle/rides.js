// Reusable jungle / cove contraptions: zip lines between any two points, vines
// (and rope swings) you grab or sit on (Y) and pump with the stick, sagging
// rope bridges, ladders with rungs, bouncy caps and a kinematic "follow a
// path" ride used by the river raft and the surfboard.
import * as THREE from 'three';
import { RAPIER, yawQuat } from '../../../physics.js';
import { DT, groups, G_VEH, G_STATIC, ALL } from '../../../config.js';
import { Builder } from '../../../mesh.js';
import { addSeat } from '../../playground.js';
import { ladder, chime, tone, groundAt } from '../../common.js';

const C = RAPIER.ColliderDesc;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const qOf = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w });

// ---- zip line: a trolley waits at `from` (the platform floor the rider stands
// on); Y to clip on, it runs down the cable to `to` (ground / deck the rider is
// dropped on) and returns empty. Returns { seat, st, C0, E }.
export function zipLine(game, kit, from, to, opts = {}) {
  const W = game.physics.world, HANG = 1.75;
  const C0 = new THREE.Vector3(from.x, from.y + HANG + 0.55, from.z);
  const E = new THREE.Vector3(to.x, to.y + HANG + 0.9, to.z);
  const dir = E.clone().sub(C0), Lc = dir.length(); dir.normalize();
  const yawD = Math.atan2(dir.x, dir.z);
  // cable and anchor posts
  const mid = C0.clone().add(E).multiplyScalar(0.5);
  _q.setFromUnitVectors(UP, dir);
  kit.cyl(mid.x, mid.y + 0.25, mid.z, 0.035, Lc + 2.5, 0x333333, { collide: false, rot: qOf(_q), seg: 4 });
  const post = opts.post ?? 0x7a5032;
  if (opts.endPost !== false) {
    const P2 = E.clone().addScaledVector(dir, 1.3), g2 = Math.max(groundAt(P2.x, P2.z), -6);
    kit.cyl(P2.x, (E.y + 0.9 + g2) / 2, P2.z, 0.18, E.y + 0.9 - g2, post, { seg: 6 });
  }
  if (opts.startPost !== false) {
    const P1 = C0.clone().addScaledVector(dir, -1.0);
    kit.cyl(P1.x, (C0.y + 0.9 + from.y) / 2, P1.z, 0.15, C0.y + 0.9 - from.y, post, { seg: 6, collide: false });
  }
  let minC = 1e9;
  for (let i = 4; i < 96; i++) { const p = C0.clone().addScaledVector(dir, Lc * i / 100); minC = Math.min(minC, p.y - HANG - 1.0 - Math.max(groundAt(p.x, p.z), -0.5)); }
  if (minC < 0.3) console.warn('zip line clearance', opts.name || '', minC.toFixed(2));
  // trolley
  const b = new Builder();
  b.cyl(0.16, 0.16, 0.1, 0x666666, [0, 0, 0], [0, 0, Math.PI / 2], 10);
  b.box(0.1, 0.4, 0.3, opts.color ?? 0xffd23f, [0, -0.2, 0]);
  for (const sd of [-1, 1]) b.cyl(0.015, 0.015, HANG - 0.1, 0x222222, [sd * 0.25, -HANG / 2 - 0.15, 0], [0, 0, sd * -0.13], 4);
  b.box(0.6, 0.06, 0.32, opts.color ?? 0xffd23f, [0, -HANG, 0]);
  const mesh = b.mesh(); game.scene.add(mesh);
  const rot = yawQuat(yawD);
  const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(C0.x, C0.y, C0.z).setRotation(rot));
  game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  const st = { mode: 'base', s: 0, v: 0, wait: 0 };
  const seat = addSeat(game, {
    body, pos: [0, -HANG + 0.15, 0], yaw: 0, label: opts.label || 'Zip line', hint: 'Wheee! · Y let go', exit: [0, -HANG - 0.2, 0.6],
    onEnter: () => { if (st.mode === 'base') { st.mode = 'ride'; st.s = 0; st.v = 1.2; tone(game, C0, 300, 600, 0.4, 0.15, 'square'); } },
  });
  const p = new THREE.Vector3();
  const minV = opts.minV ?? 3.5;
  game.physics.animate(body, (t, dt) => {
    const rider = seat.occupant;
    if (st.mode === 'ride') {
      const a = 9.81 * -dir.y - 0.011 * st.v * st.v;
      st.v = Math.max(minV, st.v + a * dt);
      const left = Lc - 1.5 - st.s;
      if (left < 14) st.v = Math.min(st.v, 3 + left * 0.8);
      st.s += st.v * dt;
      if (!rider) st.mode = 'back';
      else if (st.s >= Lc - 1.5) { rider.leaveSeat(); st.mode = 'back'; chime(game, E, [79, 76, 72]); }
    } else if (st.mode === 'back') {
      st.s = Math.max(0, st.s - 14 * dt);
      if (st.s <= 0) st.mode = 'base';
    }
    p.copy(C0).addScaledVector(dir, st.s);
    seat.disabled = st.mode !== 'base';
    body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    body.setNextKinematicRotation(rot);
  });
  return { seat, st, C0, E, Lc, body };
}

// ---- vine / rope swing: hangs from `pivot` with length L; rests (and glides
// back to) `dock` when nobody holds it. Grab it with a hand or press Y to hold
// on, push the stick to pump the swing.
export function vine(game, pivot, L, dock, opts = {}) {
  const W = game.physics.world;
  const b = new Builder();
  const col = opts.color ?? 0x4f7a2a;
  b.cyl(0.05, 0.06, L, col, [0, L / 2, 0], null, 5);
  for (let i = 1; i < L / 1.2; i++) b.box(0.32, 0.03, 0.14, 0x3f9a3a, [0.12, i * 1.2, 0], [0.3, i * 1.7, 0.4]); // leaves
  b.sphere(0.16, opts.knot ?? 0x6b4a2a, [0, 0.05, 0], null, 6);
  b.cyl(0.05, 0.05, 0.7, opts.knot ?? 0x6b4a2a, [0, 0, 0], [0, 0, Math.PI / 2], 6); // handle bar
  const o = game.physics.dynamic({ x: pivot.x, y: pivot.y - L, z: pivot.z }, [C.ball(0.32).setMass(6), C.capsule(L / 2 - 0.5, 0.14).setTranslation(0, L / 2 + 0.3, 0).setMass(1)], b.mesh(),
    { groups: groups(G_VEH, ALL & ~G_STATIC), kind: 'contraption', buoy: null, angDamp: 2.5, linDamp: 0.03 });
  game.scene.add(o.mesh);
  o.body.setCanSleep?.(false);
  W.createImpulseJoint(RAPIER.JointData.spherical(pivot, { x: 0, y: L, z: 0 }), game.physics.staticBody, o.body, true);
  // rest point on the sphere round the pivot
  const dh = Math.min(L * 0.95, Math.hypot(dock.x - pivot.x, dock.z - pivot.z));
  const rest = { x: dock.x, z: dock.z, y: pivot.y - Math.sqrt(L * L - dh * dh) };
  const swingDir = { x: pivot.x - dock.x, z: pivot.z - dock.z }; { const l = Math.hypot(swingDir.x, swingDir.z) || 1; swingDir.x /= l; swingDir.z /= l; }
  const pump = (k) => {
    const v = o.body.linvel(), sp = Math.hypot(v.x, v.z);
    const dx = sp > 0.3 ? v.x / sp : swingDir.x, dz = sp > 0.3 ? v.z / sp : swingDir.z;
    o.body.applyImpulse({ x: dx * k, y: 0, z: dz * k }, true);
  };
  const seat = addSeat(game, {
    body: o.body, pos: [0, 0.12, 0], yaw: 0, label: opts.label || 'Swing', hint: 'Stick to swing · Y let go!', exit: [0, -0.3, 0],
    control(inp) { const m = Math.min(1, Math.hypot(inp.moveX || 0, inp.moveY || 0)); if (m > 0.3) pump(170 * DT * m); },
  });
  let free = 0;
  const face = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(swingDir.x, swingDir.z));
  const r = new THREE.Vector3(), w = new THREE.Vector3();
  const align = () => {
    const t = o.body.translation(), v = o.body.linvel();
    r.set(pivot.x - t.x, pivot.y - t.y, pivot.z - t.z);
    _q.setFromUnitVectors(UP, r.clone().normalize()).multiply(face);
    o.body.setRotation(qOf(_q), true);
    w.set(-r.x, -r.y, -r.z).cross(_v.set(v.x, v.y, v.z)).divideScalar(r.lengthSq());
    o.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
  };
  const st = { held: false };
  game.steppers.push(() => {
    // hands on the vine: pump with the stick
    let held = !!seat.occupant;
    for (const pl of game.players) {
      if (pl.hands.L.body !== o.body && pl.hands.R.body !== o.body) continue;
      held = true;
      const d = game.input.get(pl.deviceId), s = d && d.state;
      const m = s ? Math.min(1, Math.hypot(s.moveX || 0, s.moveY || 0)) : 0;
      if (m > 0.3) pump(260 * DT * m);
    }
    st.held = held;
    if (held) { free = 0; align(); return; }
    free += DT;
    if (free < 2.5) { align(); return; }
    const t = o.body.translation(), k = Math.min(1, DT * 2);
    _v.set(t.x + (rest.x - t.x) * k - pivot.x, t.y + (rest.y - t.y) * k - pivot.y, t.z + (rest.z - t.z) * k - pivot.z).setLength(L);
    o.body.setTranslation({ x: pivot.x + _v.x, y: pivot.y + _v.y, z: pivot.z + _v.z }, true);
    o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    align();
  });
  return { body: o.body, seat, pivot, rest, st, L };
}

// ---- sagging rope bridge from a to b ({x, y, z}: deck top at each end) -------------
export function ropeBridge(kit, a, b, opts = {}) {
  const w = opts.width ?? 1.6, sag = opts.sag ?? Math.hypot(b.x - a.x, b.z - a.z) * 0.035;
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const ux = dx / L, uz = dz / L, px = uz, pz = -ux;
  const at = (t) => ({ x: a.x + dx * t, z: a.z + dz * t, y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t) });
  const n = Math.max(4, Math.round(L / 0.62));
  const wood = opts.wood ?? 0xb98a5a, rope = opts.rope ?? 0xd9c08a;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, p0 = at(t0), p1 = at(t1);
    const pitch = -Math.atan2(p1.y - p0.y, L / n);
    const cx = (p0.x + p1.x) / 2, cz = (p0.z + p1.z) / 2, cy = (p0.y + p1.y) / 2 - 0.06;
    kit.deco(cx, cy, cz, w * (0.92 + ((i * 7) % 3) * 0.04), 0.1, L / n * 0.82, i % 3 ? wood : 0xa77b4a, { euler: [pitch, yaw, ((i * 13) % 5 - 2) * 0.012] });
  }
  // walkable colliders + rails per ~2 m
  const m = Math.max(2, Math.round(L / 2));
  for (let i = 0; i < m; i++) {
    const p0 = at(i / m), p1 = at((i + 1) / m), seg = L / m;
    const pitch = -Math.atan2(p1.y - p0.y, seg);
    const cx = (p0.x + p1.x) / 2, cz = (p0.z + p1.z) / 2, cy = (p0.y + p1.y) / 2;
    kit.phys.box(cx, cy - 0.11, cz, w, 0.14, seg + 0.05, { rot: euler(pitch, yaw) });
    for (const s of [-1, 1]) {
      kit.phys.box(cx + px * s * (w / 2 + 0.05), cy + 0.6, cz + pz * s * (w / 2 + 0.05), 0.08, 1.2, seg + 0.05, { rot: euler(pitch, yaw) });
      kit.deco(cx + px * s * (w / 2 + 0.05), cy + 1.05, cz + pz * s * (w / 2 + 0.05), 0.06, 0.06, seg + 0.05, rope, { euler: [pitch, yaw, 0] });
      // little vertical ropes
      kit.deco(p0.x + px * s * (w / 2 + 0.05), p0.y + 0.5, p0.z + pz * s * (w / 2 + 0.05), 0.04, 1.05, 0.04, rope);
    }
  }
  for (const e of [a, b]) for (const s of [-1, 1]) kit.cyl(e.x + px * s * (w / 2 + 0.15), e.y + 0.7, e.z + pz * s * (w / 2 + 0.15), 0.12, 1.6, 0x7a5032, { seg: 6 });
  return { at, L };
}
function euler(pitch, yaw) { _q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')); return qOf(_q); }

// ---- a climbable ladder (visual rungs + common.ladder) on the side of something:
// base centre (x, z), bottom y0, top y1, (dx, dz) = direction you climb toward (into the wall).
export function climb(game, kit, x, z, y0, y1, dx, dz, color = 0x8a6a3a) {
  const yaw = Math.atan2(dx, dz), px = dz, pz = -dx;
  for (const s of [-1, 1]) kit.deco(x + px * s * 0.32, (y0 + y1) / 2 + 0.3, z + pz * s * 0.32, 0.07, y1 - y0 + 0.6, 0.07, color, { yaw });
  for (let y = y0 + 0.35; y < y1 + 0.5; y += 0.42) kit.deco(x, y, z, 0.62, 0.05, 0.05, color, { yaw });
  // an invisible backboard to press against while climbing (stops at the top so you pop over)
  kit.phys.box(x + dx * 0.12, (y0 + y1) / 2, z + dz * 0.12, 0.8, y1 - y0, 0.1, { yaw });
  ladder(game, x - dx * 0.15, z - dz * 0.15, y0, y1, dx, dz);
}

// ---- kinematic path ride --------------------------------------------------------
// path: array of {x, y, z} (water-level points); the boat sits at path[0], Y to
// board (seats), it waits `wait` s for more riders, follows the path at
// speed(s) m/s (optional), calls bob(s, t) -> {y, roll, pitch, yaw} extras, drops
// riders at the end and sails back empty (`back`: return speed).
export function pathRide(game, opts) {
  const W = game.physics.world;
  const pts = opts.path.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  // resample to an arc-length table
  const segs = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = pts[i].distanceTo(pts[i + 1]); segs.push([total, l]); total += l; }
  const at = (s, out = new THREE.Vector3()) => {
    s = Math.max(0, Math.min(total - 1e-3, s));
    let i = 0; while (i < segs.length - 1 && segs[i][0] + segs[i][1] < s) i++;
    const t = (s - segs[i][0]) / segs[i][1];
    return out.copy(pts[i]).lerp(pts[i + 1], t);
  };
  const p0 = at(0), p1 = at(1);
  const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p0.x, p0.y, p0.z).setRotation(yawQuat(Math.atan2(p1.x - p0.x, p1.z - p0.z))));
  for (const d of opts.colliders) { d.setCollisionGroups(groups(G_VEH, ALL & ~G_STATIC)); W.createCollider(d, body); }
  const mesh = opts.mesh; game.scene.add(mesh);
  game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  const st = { mode: 'wait', s: 0, v: 0, t: 0, total };
  const seats = opts.seats.map((s) => addSeat(game, {
    body, pos: s.pos, yaw: s.yaw || 0, label: opts.label || 'Ride', hint: opts.hint || 'Y get off', exit: s.exit || [s.pos[0] > 0 ? 1.4 : -1.4, s.pos[1] + 0.4, s.pos[2]],
    onEnter: () => { if (st.mode === 'wait' && st.t <= 0) st.t = opts.wait ?? 3; opts.onBoard?.(); },
  }));
  const p = new THREE.Vector3(), ahead = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let yawS = Math.atan2(p1.x - p0.x, p1.z - p0.z);
  game.physics.animate(body, (time, dt) => {
    const riders = seats.filter((s) => s.occupant);
    let dirSign = 1;
    if (st.mode === 'wait') {
      // the ride runs on its own timetable: it leaves `cycle` s after it docks, riders or not
      // (someone boarding late in the wait still gets `wait` s to settle)
      st.idle = (st.idle || 0) + dt;
      if (riders.length) st.t -= dt;
      if (st.idle >= (opts.cycle ?? 10) && st.t <= 0) { st.mode = 'go'; st.v = 0; st.idle = 0; st.t = 0; opts.onStart?.(); }
    } else if (st.mode === 'go') {
      const target = opts.speed ? opts.speed(st.s) : 4;
      st.v += Math.max(-2 * dt, Math.min(1.5 * dt, target - st.v));
      st.s += st.v * dt;
      if (opts.steer) opts.steer(riders, dt, st);
      if (st.s >= total - 0.5) {
        for (const s of riders) s.occupant.leaveSeat();
        opts.onEnd?.();
        st.mode = 'back'; st.t = 2;
      }
    } else if (st.mode === 'back') {
      dirSign = -1;
      st.t -= dt;
      if (st.t <= 0) { st.s -= (opts.back ?? 7) * dt; if (riders.length && st.s > 6) { /* hitch-hikers ride back */ } }
      if (st.s <= 0) { st.s = 0; st.mode = 'wait'; st.t = 0; st.idle = 0; }
    }
    at(st.s, p);
    at(st.s + (dirSign > 0 ? 2 : -2), ahead);
    const want = Math.atan2(ahead.x - p.x, ahead.z - p.z) + (dirSign < 0 ? 0 : 0);
    let dy = (dirSign > 0 ? want : want + Math.PI) - yawS; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    yawS += dy * Math.min(1, dt * 3);
    const x = opts.bob ? opts.bob(st, time) : { y: Math.sin(time * 2) * 0.04, roll: Math.sin(time * 1.3) * 0.03, pitch: 0, side: 0 };
    const sideX = Math.cos(yawS), sideZ = -Math.sin(yawS);
    e.set(x.pitch || 0, yawS + (x.yaw || 0), x.roll || 0, 'YXZ');
    q.setFromEuler(e);
    body.setNextKinematicTranslation({ x: p.x + sideX * (x.side || 0), y: p.y + (x.y || 0), z: p.z + sideZ * (x.side || 0) });
    body.setNextKinematicRotation(qOf(q));
    for (const s of seats) s.disabled = st.mode === 'back';
  });
  return { body, seats, st, at, total };
}
