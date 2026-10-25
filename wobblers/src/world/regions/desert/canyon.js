// Red Rock Canyon: the pass from town down to the canyon floor, the gold mine
// (a timber tunnel dug into the plateau at the canyon's west end) with a
// mine-cart ride (a kinematic train on a loop of track: out along the canyon
// floor, round through the tunnel, back over a rickety trestle), the ramp road
// up onto the plateau, the wobbly rope bridge across the canyon (kinematic
// planks that sag under whoever walks on them) and a rock arch on the plateau.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { VEH_GROUPS } from '../../../config.js';
import { Builder, matVC } from '../../../mesh.js';
import { canyonZ, CANYON_Y, MINE, PASS, RAMP, BRIDGE, PLATEAU_Y } from './layout.js';
import { WOOD, WOOD2, WOOD3, DARKWOOD, barrel, crate } from './town.js';
import { redRock } from './nature.js';

const PI = Math.PI, ROCK = 0xc8814a, ROCK2 = 0xb06a3e, IRON = 0x5a5560, RUST = 0x9a5a3a;
const UP = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4();

function kinematic(game, pos, descs, mesh) {
  const W = game.physics.world;
  const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
  for (const d of descs) { d.setCollisionGroups(VEH_GROUPS); W.createCollider(d, body); }
  if (mesh) game.scene.add(mesh);
  game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  return body;
}
const near = (game, x, z, r) => game.players.some((p) => { const t = p.chest.translation(); return Math.abs(t.x - x) < r && Math.abs(t.z - z) < r; });

// ---- mine tunnel + portal ------------------------------------------------------------
function mineTunnel(game, kit, R) {
  const { x0, x1, z0, z1, y } = MINE, H = 4.4, zn = z0 + 1.4, zs = z1 - 1.4;
  // rock lid over the pit (its top matches the plateau), timber lining inside
  kit.box((x0 + x1) / 2 - 1, (y + H + 0.1 + PLATEAU_Y + 0.6) / 2, (z0 + z1) / 2, x1 - x0 + 10, PLATEAU_Y + 0.6 - (y + H + 0.1), z1 - z0 + 10, ROCK, {});
  kit.box(x0 + 1, y + H / 2, (z0 + z1) / 2, 0.4, H, z1 - z0, DARKWOOD);
  for (const z of [zn, zs]) {
    kit.box((x0 + x1) / 2, y + H / 2, z, x1 - x0, H, 0.3, WOOD2);
    for (let x = x0 + 2; x < x1; x += 4) kit.deco(x, y + H / 2, z + (z === zn ? 0.2 : -0.2), 0.3, H, 0.15, DARKWOOD);
  }
  kit.deco((x0 + x1) / 2, y + H - 0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, 0x6b4a2a);
  for (let x = x0 + 2; x < x1; x += 4) kit.deco(x, y + H - 0.25, (zn + zs) / 2, 0.3, 0.3, zs - zn, DARKWOOD);
  // ore veins, crates, a lantern every 8 m (pool lights)
  for (let x = x0 + 4; x < x1 - 2; x += 5.5) {
    for (const z of [zn + 0.35, zs - 0.35]) kit.sphere(x + (z > -205 ? 1.3 : 0), y + 1.2 + (x % 2) * 0.8, z, 0.28, 0xffd23f, { scale: [1, 0.7, 0.5] });
  }
  for (let x = x0 + 6; x < x1; x += 8) {
    game.interiorLights.add(x, y + H, (zn + zs) / 2, { color: 0xffc070, intensity: 7, range: 9, fixture: 'pendant' });
  }
  crate(kit, x0 + 3, zn + 1.0, y); crate(kit, x0 + 3, zn + 2.0, y, 0.8); barrel(kit, x0 + 4.5, zs - 1, y);
  // portal: timber facade either side of the mouth, posts + lintel, sign
  const xm = x1 + 0.2, zc = canyonZ(xm), mw = 4.2;
  kit.box(xm, y + H / 2, (z0 - 5 + zc - mw) / 2, 0.5, H, zc - mw - z0 + 5, WOOD2);
  kit.box(xm, y + H / 2, (z1 + 5 + zc + mw) / 2, 0.5, H, z1 + 5 - zc - mw, WOOD2);
  for (const s of [-1, 1]) kit.cyl(xm + 0.4, y + H / 2, zc + s * mw, 0.3, H, DARKWOOD, { seg: 8 });
  kit.box(xm + 0.4, y + H + 0.3, zc, 0.6, 0.6, mw * 2 + 1, DARKWOOD);
  R.sign('GOLD MINE', xm + 5.4, y + H + 2.0, zc, PI / 2, 7, '#5a3a22', '#ffd23f');
  kit.deco(xm + 5.32, y + H + 2.0, zc, 0.1, 2.1, 7.5, DARKWOOD);
  return { zc, xm };
}

// ---- mine-cart ride -------------------------------------------------------------------
function mineRide(game, kit, R) {
  const xe = MINE.station, xw = MINE.x0 + 16, off = 2.6, base = CANYON_Y + 0.32;
  const humpA = -1235, humpB = -1125, HUMP = 5.5;
  const pts = [];
  for (let x = xe; x >= xw; x -= 8) pts.push([x, base, canyonZ(x) + off]);
  for (let i = 1; i < 6; i++) { const a = i / 6 * PI; pts.push([xw - off * 1.6 * Math.sin(a), base, canyonZ(xw) + off * Math.cos(a)]); }
  for (let x = xw; x <= xe; x += 8) {
    const t = (x - humpA) / (humpB - humpA), hump = t > 0 && t < 1 ? HUMP * Math.sin(PI * t) ** 2 : 0;
    pts.push([x, base + hump, canyonZ(x) - off]);
  }
  for (let i = 1; i < 6; i++) { const a = i / 6 * PI; pts.push([xe + off * 1.6 * Math.sin(a), base, canyonZ(xe) - off * Math.cos(a)]); }
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const L = curve.getLength(), N = 1400;
  const pos = [], tan = [];
  for (let i = 0; i <= N; i++) { pos.push(curve.getPointAt(i / N)); tan.push(curve.getTangentAt(i / N)); }
  const frameAt = (s, outP, outQ) => {
    s = ((s % L) + L) % L;
    const f = s / L * N, i = Math.floor(f), k = f - i;
    outP.copy(pos[i]).lerp(pos[Math.min(N, i + 1)], k);
    const T = tan[i].clone().lerp(tan[Math.min(N, i + 1)], k).normalize();
    const left = new THREE.Vector3().crossVectors(UP, T).normalize(), up = new THREE.Vector3().crossVectors(T, left);
    _m.makeBasis(left, up, T); outQ.setFromRotationMatrix(_m);
    return T;
  };
  // track: rails + sleepers in one mesh, trestle posts as kit scenery
  const tb = new Builder(), P = new THREE.Vector3(), Q = new THREE.Quaternion();
  const rails = [[], []];
  for (let i = 0; i <= 900; i++) {
    frameAt(i / 900 * L, P, Q);
    const left = new THREE.Vector3(1, 0, 0).applyQuaternion(Q);
    rails[0].push(P.clone().addScaledVector(left, 0.45)); rails[1].push(P.clone().addScaledVector(left, -0.45));
  }
  for (const rp of rails) tb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp, true), 900, 0.05, 4, true), 0x8a8f96);
  for (let s = 0; s < L; s += 0.9) {
    frameAt(s, P, Q);
    tb.add(new THREE.BoxGeometry(1.25, 0.1, 0.22), DARKWOOD, [P.x, P.y - 0.1, P.z], Q.clone());
  }
  const trackMesh = tb.mesh(matVC); game.scene.add(trackMesh);
  for (let s = 0; s < L; s += 3) {
    frameAt(s, P, Q);
    const h = P.y - CANYON_Y;
    if (h < 0.8) continue;
    for (const sx of [-0.55, 0.55]) {
      const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(Q);
      kit.cyl(P.x + lx.x * sx, CANYON_Y + h / 2 - 0.1, P.z + lx.z * sx, 0.1, h, WOOD2, { seg: 5 });
    }
    const T = frameAt(s, P, Q);
    if (h > 2) kit.deco(P.x, CANYON_Y + h * 0.5, P.z, 1.3, 0.12, 0.12, WOOD3, { yaw: Math.atan2(T.x, T.z) });
  }
  // station platform + roof on the south side, by the east turnaround
  const sx = xe - 6, sz = canyonZ(sx) + off + 2.6;
  kit.box(sx, CANYON_Y + 0.35, sz, 12, 0.7, 2.6, WOOD3);
  for (const x of [sx - 5.6, sx + 5.6]) for (const dz of [-1, 1]) kit.cyl(x, CANYON_Y + 2, sz + dz * 1.1, 0.1, 3.3, WOOD2, { seg: 6 });
  kit.box(sx, CANYON_Y + 3.7, sz, 12.4, 0.15, 3.2, 0x6b4a2a);
  R.sign('GOLD MINE', sx, CANYON_Y + 4.35, sz + 0.5, 0, 5, '#5a3a22', '#ffd23f');
  kit.bench(sx + 2, sz + 0.9, PI, CANYON_Y + 0.7);
  // the train: three carts with two seats each
  const cars = [], NC = 3, GAP = 2.3;
  for (let i = 0; i < NC; i++) {
    const b = new Builder();
    b.rbox(1.15, 0.75, 1.7, 0.08, i === 0 ? RUST : IRON, [0, 0.45, 0]);
    b.box(0.95, 0.06, 1.5, 0x3a3238, [0, 0.12, 0]);
    for (const sz2 of [-0.8, 0.8]) b.box(1.22, 0.1, 0.1, 0x3a3a40, [0, 0.82, sz2]);
    for (const sx2 of [-0.58, 0.58]) b.box(0.1, 0.1, 1.75, 0x3a3a40, [sx2, 0.82, 0]);
    for (const [wx, wz] of [[-0.45, 0.55], [0.45, 0.55], [-0.45, -0.55], [0.45, -0.55]]) b.cyl(0.18, 0.18, 0.1, 0x2a2a30, [wx, 0.05, wz], [0, 0, PI / 2], 10);
    if (i === 0) { b.sphere(0.12, 0xfff4c2, [0, 0.9, 0.9], null, 8); b.box(0.3, 0.2, 0.1, 0x3a3a40, [0, 0.78, 0.88]); }
    if (i === NC - 1) for (let k = 0; k < 6; k++) b.sphere(0.13, 0xffd23f, [(k % 3 - 1) * 0.25, 0.82, -0.6 + (k > 2 ? 0.2 : 0)], null, 6); // gold nuggets
    const body = kinematic(game, { x: pos[0].x, y: pos[0].y, z: pos[0].z }, [
      RAPIER.ColliderDesc.cuboid(0.55, 0.06, 0.82).setTranslation(0, 0.12, 0),
      RAPIER.ColliderDesc.cuboid(0.05, 0.38, 0.82).setTranslation(0.55, 0.45, 0), RAPIER.ColliderDesc.cuboid(0.05, 0.38, 0.82).setTranslation(-0.55, 0.45, 0),
      RAPIER.ColliderDesc.cuboid(0.55, 0.38, 0.05).setTranslation(0, 0.45, 0.82), RAPIER.ColliderDesc.cuboid(0.55, 0.38, 0.05).setTranslation(0, 0.45, -0.82),
    ], b.mesh(matVC));
    cars.push(body);
    for (const lz of [0.38, -0.42]) R.addSeat(game, { body, pos: [0, 0.6, lz], yaw: 0, label: 'Ride mine cart', hint: 'Hold on to your hat! · Y exit', exit: [1.4, 0.4, lz] });
  }
  const s0Station = 0;
  let s0 = s0Station, v = 0, wait = 4, traveled = 0;
  const mod = (x) => ((x % L) + L) % L;
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), up = new THREE.Vector3();
  const topY = base + HUMP;
  const ride = { cars, length: L, get s() { return s0; }, get waiting() { return wait > 0; } };
  game.desertMineRide = ride;
  let clack = 0;
  game.physics.animators.push((t, dt) => {
    if (wait > 0) {
      wait -= dt; v = 0; traveled = 0;
      if (wait > 0.5 && !near(game, xe - 60, canyonZ(xe), 90)) wait = Math.max(wait, 2); // nobody around: stay parked
    } else {
      frameAt(mod(s0), p, q);
      const ve = Math.sqrt(3.5 * 3.5 + 2 * 9.81 * 0.85 * Math.max(0, topY - p.y));
      v += (Math.min(ve, 7.5) - v) * Math.min(1, dt * 1.5);
      const toStation = mod(s0Station - s0);
      if (traveled > 30 && toStation < 14) v = Math.min(v, 0.6 + toStation * 0.35);
      if (traveled > 30 && toStation < 0.15) { v = 0; wait = 9; s0 = s0Station; }
      s0 += v * dt; traveled += v * dt;
      clack -= v * dt;
      if (clack < 0) { clack = 2.2; const c = cars[0].translation(); if (game.audio?.ctx) game.audio.play('clack', c, 0.6); }
    }
    cars.forEach((body, i) => {
      frameAt(s0 - i * GAP, p, q);
      up.set(0, 1, 0).applyQuaternion(q);
      body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    });
  });
  return ride;
}

// ---- rope bridge ---------------------------------------------------------------------------
function ropeBridge(game, kit, R) {
  const { x, z0, z1, y } = BRIDGE, span = z0 - z1, N = Math.round(span / 0.78), W = 2.2, SAG = 1.4;
  const dz = span / N;
  // anchor decks on both rims, posts
  for (const [zz, dir] of [[z0, 1], [z1, -1]]) {
    kit.box(x, y - 0.25, zz + dir * 2.0, W + 1.6, 0.5, 4.4, WOOD2);
    for (const s of [-1, 1]) kit.cyl(x + s * (W / 2 + 0.25), y + 0.9, zz + dir * 0.3, 0.2, 2.4, DARKWOOD, { seg: 8 });
  }
  const planks = [], body0 = [];
  const geo = new THREE.BoxGeometry(W, 0.1, dz - 0.08);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: false });
  mat.color.setHex(WOOD3);
  const inst = new THREE.InstancedMesh(geo, mat, N);
  inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false;
  const tint = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N, zz = z0 - t * span, yy = y - SAG * 4 * t * (1 - t);
    const b = kinematic(game, { x, y: yy, z: zz }, [RAPIER.ColliderDesc.cuboid(W / 2, 0.05, dz / 2 - 0.04).setFriction(1.0)], null);
    planks.push(b); body0.push({ t, z: zz, y: yy });
    inst.setColorAt(i, tint.setHex(WOOD3).multiplyScalar(0.8 + ((i * 7) % 5) * 0.06));
  }
  game.scene.add(inst);
  // ropes (static tubes along the hanging line) + low invisible side rails
  const rb = new Builder();
  for (const s of [-1, 1]) {
    for (const hy of [0.15, 1.0]) {
      const pts = [];
      for (let k = 0; k <= 24; k++) { const t = k / 24; pts.push(new THREE.Vector3(x + s * (W / 2 + 0.05), y - SAG * 4 * t * (1 - t) * (hy > 0.5 ? 0.85 : 1) + hy, z0 - t * span)); }
      rb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.045, 5), 0xc8a46a);
    }
    for (let i = 0; i < N; i += 2) { const t = (i + 0.5) / N; rb.cyl(0.02, 0.02, 0.9, 0xc8a46a, [x + s * (W / 2 + 0.05), y - SAG * 4 * t * (1 - t) + 0.55, z0 - t * span], null, 4); }
    for (let k = 0; k < 8; k++) {
      const t0 = k / 8, t1 = (k + 1) / 8, tm = (t0 + t1) / 2;
      kit.phys.box(x + s * (W / 2 + 0.1), y - SAG * 4 * tm * (1 - tm) + 0.45, z0 - tm * span, 0.1, 0.9, span / 8, {});
    }
  }
  const rm = rb.mesh(matVC); game.scene.add(rm);
  // animate: hang, sway, sag under walkers (only while someone is near)
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
  const cur = body0.map((b) => ({ x, y: b.y, z: b.z, roll: 0 }));
  const loads = [];
  game.physics.animators.push((tm) => {
    if (!near(game, x, (z0 + z1) / 2, 70)) return;
    loads.length = 0;
    for (const pl of game.players) {
      const c = pl.hips.translation();
      if (Math.abs(c.x - x) < W && c.z < z0 + 1 && c.z > z1 - 1 && c.y > y - 4 && c.y < y + 3) loads.push(c.z);
    }
    for (const v of game.vehicles) {
      const c = v.body.translation();
      if (Math.abs(c.x - x) < W && c.z < z0 + 1 && c.z > z1 - 1 && c.y > y - 4 && c.y < y + 4) loads.push(c.z, c.z, c.z);
    }
    for (let i = 0; i < N; i++) {
      const b0 = body0[i], env = 4 * b0.t * (1 - b0.t);
      let dip = 0;
      for (const lz of loads) dip += 0.55 * Math.exp(-(((lz - b0.z) / 3.5) ** 2));
      const sway = Math.sin(tm * 1.3 + b0.t * 3) * 0.18 * env;
      const yy = b0.y - Math.min(1.4, dip) * env + Math.sin(tm * 2.1 + b0.t * 9) * 0.05 * env;
      const roll = Math.sin(tm * 1.7 + b0.t * 5) * 0.06 * env + (loads.length ? Math.sin(tm * 6 + i) * 0.02 * env : 0);
      const c = cur[i]; c.x = x + sway; c.y = yy; c.roll = roll;
      planks[i].setNextKinematicTranslation({ x: c.x, y: c.y, z: b0.z });
      qq.setFromEuler(e.set(0, 0, roll));
      planks[i].setNextKinematicRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w });
    }
  });
  const draw = () => {
    for (let i = 0; i < N; i++) {
      const c = cur[i];
      qq.setFromEuler(e.set(0, 0, c.roll));
      m4.compose(pp.set(c.x, c.y, body0[i].z), qq, one);
      inst.setMatrixAt(i, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  draw();
  game.updaters.push(() => { if (near(game, x, (z0 + z1) / 2, 140)) draw(); });
  game.desertBridge = { planks, x, z0, z1, y };
}

// ---- rock arch on the plateau ---------------------------------------------------------------
function rockArch(kit, R, cx, cz, yaw) {
  const g = R.groundAt(cx, cz), span = 16, H = 13, n = 14, c = Math.cos(yaw), s = Math.sin(yaw);
  for (let i = 0; i <= n; i++) {
    const a = i / n * PI, lx = -Math.cos(a) * span / 2, y = Math.sin(a) * H;
    const th = 3.4 - Math.sin(a) * 1.1;
    kit.box(cx + lx * c, g + y, cz - lx * s, 3.2, th, 4.2, i % 3 ? ROCK : ROCK2, { euler: [0, yaw, a - PI / 2] });
  }
  for (const sd of [-1, 1]) kit.box(cx + sd * span / 2 * c, g + 1.5, cz - sd * span / 2 * s, 4.5, 3, 5, ROCK2, { yaw });
  return g + H + 1.7;
}

export function buildCanyon(game, kit, R) {
  mineTunnel(game, kit, R);
  mineRide(game, kit, R);
  ropeBridge(game, kit, R);
  // pass: timber shoring, a signpost at the town end, ramp road posts
  const [ax, az] = PASS.a;
  kit.cyl(ax + 6.5, 4 + 1.6, az + 2, 0.12, 3.2, WOOD2, { seg: 6 });
  R.sign('GOLD MINE', ax + 6.5, 4 + 2.9, az + 2.1, 0, 3.2, '#5a3a22', '#ffd23f');
  for (let z = RAMP.a[1] - 6; z > RAMP.b[1] + 2; z -= 9) {
    const g = R.groundAt(RAMP.a[0] + RAMP.w / 2 + 0.6, z);
    kit.cyl(RAMP.a[0] + RAMP.w / 2 + 0.6, g + 0.5, z, 0.12, 1.0, 0xffffff, { seg: 6 });
    kit.deco(RAMP.a[0] + RAMP.w / 2 + 0.6, g + 0.85, z, 0.26, 0.12, 0.26, 0xc8343c);
  }
  const archTop = rockArch(kit, R, -1000, -300, 0.4);
  game.desertArchTop = archTop;
  // canyon dressing: boulders, a broken wagon, the prospector's camp near the station
  const rng = R.rng(7);
  for (let i = 0; i < 26; i++) {
    const x = -1290 + rng() * 270, z = canyonZ(x) + (rng() < 0.5 ? -1 : 1) * (7 + rng() * 2.5);
    redRock(kit, x, z, R.groundAt(x, z) - 0.3, 0.8 + rng() * 1.4, rng);
  }
  const cx = MINE.station - 20, cz = canyonZ(cx) + 6.3;
  kit.cone(cx, CANYON_Y + 1.2, cz, 1.6, 2.4, 0xe8dcc0, { seg: 6 });
  kit.cyl(cx + 2.6, CANYON_Y + 0.2, cz - 0.5, 0.5, 0.25, 0x6b5a4a, { seg: 8 });
  kit.deco(cx + 2.6, CANYON_Y + 0.4, cz - 0.5, 0.5, 0.3, 0.5, 0xff8a3d);
  return { campX: cx, campZ: cz };
}
export { WOOD };
