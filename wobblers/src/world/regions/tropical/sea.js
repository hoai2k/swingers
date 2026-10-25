// The lagoon and the sea round Coconut Cove: the snorkel reef (coral on the
// bed, schools of fish and two turtles, all one instanced mesh each), the
// pirate shipwreck (listing hull you can climb aboard, a flooded hold full of
// coins, the captain's cabin with a present), the surf beach (a surfboard
// ride: paddle out, catch the wave, carve with the stick, wipe out at the
// shore) with swells rolling in, the sandbar, and palms on every islet.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { SEA_LEVEL, DT, groups, G_VEH, G_STATIC, ALL } from '../../../config.js';
import { Builder } from '../../../mesh.js';
import { addSeat } from '../../playground.js';
import { REEF, WRECK, SURF, SANDBAR, RESORT, HARBOUR, POOL, LIGHTHOUSE } from '../tropical.js';
import { Flora } from '../jungle/flora.js';
import { climb } from '../jungle/rides.js';

const CORAL = [0xff7a8a, 0xffa040, 0xb46cff, 0xffd23f, 0x3fe0d0, 0xff5ac8, 0x8adf6a];

export function buildSea(game, kit, R) {
  reef(game, kit, R);
  wreck(game, kit, R);
  surf(game, kit, R);
  palms(game, kit, R);
  // sandbar coins + a couple of starfish
  const [a, , c] = SANDBAR;
  R.coins((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 3, 'line', 7, Math.hypot(c[0] - a[0], c[1] - a[1]), { yaw: Math.atan2(c[1] - a[1], c[0] - a[0]) });
  for (const [x, z] of [[490, 789], [506, 782]]) kit.cone(x, R.groundAt(x, z) + 0.05, z, 0.35, 0.08, 0xff8a3d, { seg: 5 });
}

// ---- reef + fish -----------------------------------------------------------------------
function reef(game, kit, R) {
  const rnd = R.rng(9);
  for (let i = 0; i < 110; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * REEF.r, x = REEF.x + Math.cos(a) * r, z = REEF.z + Math.sin(a) * r;
    const g = R.groundAt(x, z);
    if (g > -1.4) continue;
    const c = CORAL[(rnd() * CORAL.length) | 0], s = 0.4 + rnd() * 0.9, t = rnd();
    if (t < 0.3) kit.sphere(x, g + s * 0.4, z, s, c, { scale: [1, 0.7, 1], seg: 7 });            // brain coral
    else if (t < 0.55) for (let k = 0; k < 4; k++) kit.cyl(x + Math.cos(k * 1.6) * s * 0.4, g + s * 0.6, z + Math.sin(k * 1.6) * s * 0.4, 0.09, s * 1.3, c, { seg: 5, collide: false, euler: [Math.cos(k) * 0.3, 0, Math.sin(k) * 0.3] }); // tube coral
    else if (t < 0.75) kit.deco(x, g + s * 0.5, z, 0.08, s, s * 1.6, c, { yaw: rnd() * 3 });    // fan
    else if (t < 0.88) kit.cone(x, g + s * 0.7, z, s * 0.5, s * 1.4, c, { seg: 5 });
    else kit.rock(x, z, g - 0.2, s * 1.2);
  }
  // seaweed
  for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = REEF.r * (0.6 + rnd() * 0.6), x = REEF.x + Math.cos(a) * r, z = REEF.z + Math.sin(a) * r, g = R.groundAt(x, z); if (g < -1.2) kit.deco(x, g + 0.6, z, 0.12, 1.2, 0.05, 0x3f9a4a, { euler: [0.1, rnd() * 3, 0.1] }); }
  // sign on a post in the water + a buoy line round the reef
  const sx = REEF.x - REEF.r - 3, sz = REEF.z - 6, sg = R.groundAt(sx, sz);
  kit.cyl(sx, (sg + 2.4) / 2, sz, 0.12, 2.4 - sg, 0x6b4a2a, { seg: 6 });
  R.sign('SNORKEL REEF', sx - 0.1, 2.6, sz, -Math.PI / 2, 3.8, '#2bc4c4', '#ffffff');
  for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28, x = REEF.x + Math.cos(a) * (REEF.r + 4), z = REEF.z + Math.sin(a) * (REEF.r + 4); if (R.groundAt(x, z) < -0.8) kit.sphere(x, SEA_LEVEL + 0.05, z, 0.25, i % 2 ? 0xff5a3a : 0xffffff, { seg: 6 }); }
  R.coins(REEF.x, REEF.z, null, 'ring', 10, REEF.r * 0.55, { y: SEA_LEVEL - 1.3 });

  // fish: one instanced mesh, schools circling coral heads
  const fb = new Builder();
  fb.sphere(0.18, 0xffffff, [0, 0, 0], [0.5, 0.8, 1.3], 8);
  fb.cone(0.15, 0.22, 0xffffff, [0, 0, -0.3], [-Math.PI / 2, 0, 0], 4);
  const fgeo = fb.geometry();
  const N = 90, mesh = new THREE.InstancedMesh(fgeo, new THREE.MeshLambertMaterial({ vertexColors: true }), N);
  const FC = [0xffd23f, 0xff8a1a, 0x3f8cff, 0xff5a8a, 0x3fe0d0, 0xffffff];
  const fish = [];
  const schools = [];
  for (let s = 0; s < 9; s++) {
    const a = rnd() * 6.28, r = rnd() * REEF.r * 0.8;
    schools.push({ x: REEF.x + Math.cos(a) * r, z: REEF.z + Math.sin(a) * r, r: 2 + rnd() * 4, w: (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.5), c: FC[s % FC.length] });
  }
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const s = schools[i % schools.length];
    fish.push({ s, ph: rnd() * 6.28, dr: (rnd() - 0.5) * 1.2, dy: rnd(), sc: 0.8 + rnd() * 0.6 });
    mesh.setColorAt(i, col.set(rnd() < 0.8 ? s.c : FC[(rnd() * FC.length) | 0]));
  }
  mesh.userData.noCull = true; mesh.frustumCulled = false;
  game.scene.add(mesh);
  // turtles
  const tb = new Builder();
  tb.sphere(0.8, 0x6a8a4a, [0, 0, 0], [1, 0.35, 1.2], 10);
  tb.sphere(0.25, 0x9ab06a, [0, 0.05, 1.0], null, 8);
  for (const [x, z] of [[0.7, 0.5], [-0.7, 0.5], [0.6, -0.6], [-0.6, -0.6]]) tb.box(0.5, 0.06, 0.25, 0x9ab06a, [x, -0.05, z], [0, x * z > 0 ? 0.4 : -0.4, 0]);
  const turtles = [0, 1].map((i) => { const m = tb.mesh(undefined); m.userData.noCull = true; game.scene.add(m); return { m, ph: i * 3 }; });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  game.updaters.push((dt, t) => {
    const near = game.players.some((pl) => { const c = pl.camera?.cam?.position; return c && Math.hypot(c.x - REEF.x, c.z - REEF.z) < 160; });
    mesh.visible = near; for (const tt of turtles) tt.m.visible = near;
    if (!near) return;
    fish.forEach((f, i) => {
      const s = f.s, a = t * s.w + f.ph, r = s.r + f.dr;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      const g = R.groundAt(x, z);
      const y = Math.min(SEA_LEVEL - 0.4, Math.max(g + 0.4, g + 0.6 + f.dy * 1.0 + Math.sin(t * 1.3 + f.ph) * 0.15));
      e.set(0, Math.atan2(-Math.sin(a) * s.w, Math.cos(a) * s.w) + Math.sin(t * 9 + i) * 0.15, 0);
      m4.compose(p.set(x, y, z), q.setFromEuler(e), sc.setScalar(f.sc));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    turtles.forEach((tt, i) => {
      const a = t * 0.08 + tt.ph, x = REEF.x + Math.cos(a) * (10 + i * 6), z = REEF.z + Math.sin(a) * (10 + i * 6);
      tt.m.position.set(x, Math.max(R.groundAt(x, z) + 0.6, SEA_LEVEL - 1.6 + Math.sin(t * 0.5 + i) * 0.3), z);
      tt.m.rotation.set(0, -a, Math.sin(t * 1.5) * 0.08);
    });
  });
  game.reef = { fish: mesh, schools };
}

// ---- pirate shipwreck --------------------------------------------------------------------
function wreck(game, kit, R) {
  const M = new THREE.Matrix4().compose(new THREE.Vector3(WRECK.x, -1.0, WRECK.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, WRECK.yaw, 0.2, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const MQ = new THREE.Quaternion().setFromRotationMatrix(M);
  const v = new THREE.Vector3(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
  const W = (lx, ly, lz) => v.set(lx, ly, lz).applyMatrix4(M).clone();
  const part = (lx, ly, lz, w, h, d, color, eul = [0, 0, 0], collide = true) => {
    const p = W(lx, ly, lz);
    qq.copy(MQ).multiply(new THREE.Quaternion().setFromEuler(ee.set(eul[0], eul[1], eul[2], 'YXZ')));
    kit.box(p.x, p.y, p.z, w, h, d, color, { rot: { x: qq.x, y: qq.y, z: qq.z, w: qq.w }, collide });
  };
  const HULL = 0x5a3a24, HULL2 = 0x4a2e1c, DECK = 0x8a6a4a;
  part(0, -1.4, 0, 4.6, 0.5, 19, HULL2);                                   // bottom
  for (const s of [-1, 1]) {
    part(s * 2.5, 0.2, -0.5, 0.4, 3.6, 18, HULL);                          // sides
    part(s * 1.35, 0.2, 10.2, 0.4, 3.6, 3.6, HULL, [0, -s * 0.62, 0]);    // bow
    part(s * 2.72, 1.4, -0.5, 0.15, 0.4, 18, 0xc8a050, [0, 0, 0], false); // gold trim
  }
  part(0, 0.2, -9.3, 5.4, 3.6, 0.4, HULL);                                 // transom
  part(0, 2.4, 12.3, 0.4, 0.4, 3.5, HULL, [-0.35, 0, 0]);                 // bowsprit
  // main deck with a broken hatch into the hold
  part(0, 1.8, -5.6, 4.6, 0.2, 7.0, DECK);
  part(0, 1.8, 5.2, 4.6, 0.2, 6.2, DECK);
  part(1.5, 1.8, 0.4, 1.6, 0.2, 5.0, DECK);
  // stern castle: cabin + quarterdeck above it
  part(0, 3.75, -6.6, 5.0, 0.2, 5.4, DECK);
  for (const s of [-1, 1]) part(s * 2.3, 2.75, -6.6, 0.25, 1.9, 5.4, HULL);
  for (const s of [-1, 1]) part(s * 1.6, 2.75, -3.95, 1.8, 1.9, 0.25, HULL2);   // cabin front, doorway in the middle
  part(0, 3.5, -3.95, 1.4, 0.4, 0.3, 0xc8a050);
  // masts: a stump and a fallen mast with a torn sail
  { const p = W(0, 3.5, 1); kit.cyl(p.x, p.y, p.z, 0.3, 4, 0x6b4a2a, { rot: { x: MQ.x, y: MQ.y, z: MQ.z, w: MQ.w }, seg: 7 }); }
  { const p = W(1.2, 1.9, 5.5); qq.copy(MQ).multiply(new THREE.Quaternion().setFromEuler(ee.set(1.25, 0.4, 0))); kit.cyl(p.x, p.y + 0.3, p.z, 0.25, 9, 0x6b4a2a, { rot: { x: qq.x, y: qq.y, z: qq.z, w: qq.w }, seg: 7 }); }
  part(2.2, 2.6, 6.2, 0.06, 2.4, 3.2, 0xe8dcc0, [0.2, 0.3, 0.6], false);
  { const p = W(0, 6.4, 1); kit.box(p.x, p.y, p.z, 0.05, 0.9, 1.4, 0x1e1e24, { collide: false, yaw: WRECK.yaw }); kit.deco(p.x + 0.03, p.y, p.z, 0.06, 0.3, 0.3, 0xffffff, { yaw: WRECK.yaw }); }
  // barrels and a cannon on deck, a chest in the cabin
  for (const [lx, lz] of [[-1.2, 6.5], [-1.5, 3.4], [1.4, -2.5]]) { const p = W(lx, 2.4, lz); kit.cyl(p.x, p.y, p.z, 0.4, 1.0, 0x8a5a2a, { seg: 8 }); }
  { const p = W(-1.6, 2.3, -1.5); kit.cyl(p.x, p.y, p.z, 0.22, 1.8, 0x2a2a2a, { collide: false, seg: 8, euler: [Math.PI / 2, WRECK.yaw + Math.PI / 2, 0] }); }
  part(-1.0, 2.25, -7.6, 1.3, 0.7, 0.8, 0x8a5a2a);
  part(-1.0, 2.62, -7.6, 1.35, 0.15, 0.85, 0xffc61a, [0, 0, 0], false);
  const cab = W(0.8, 2.3, -6.8);
  R.present('cove-wreck', 'hat:snorkel', cab.x, cab.z, cab.y + 1.2, "in the captain's cabin of the pirate shipwreck");
  game.interiorLights?.add(cab.x, cab.y + 1.3, cab.z, { color: 0xffc070, intensity: 6, range: 6, fixture: 'none' });
  const hold = W(0, -0.6, 0);
  R.coins(hold.x, hold.z, null, 'line', 6, 10, { y: hold.y, water: true, yaw: Math.PI / 2 - WRECK.yaw });
  const bow = W(0, 2.5, 6);
  R.coins(bow.x, bow.z, bow.y + 2, 'one', 1, 0, { big: true });
  // rope ladders up the low (port) side from the water
  for (const lz of [-2, 4]) {
    const top = W(-2.75, 2.0, lz), bot = W(-2.75, -0.8, lz), inx = W(0, 2, lz);
    let dx = inx.x - top.x, dz = inx.z - top.z; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    climb(game, kit, top.x - dx * 0.35, top.z - dz * 0.35, Math.max(-1.5, bot.y), top.y + 0.1, dx, dz, 0xd9c08a);
  }
  const sp = W(-6, 0, -12);
  R.sign('SHIPWRECK', sp.x, 2.8, sp.z, WRECK.yaw + Math.PI, 3.6, '#4a2e1c', '#f2e6c4');
  const g = R.groundAt(sp.x, sp.z); kit.cyl(sp.x, (g + 2.6) / 2, sp.z, 0.12, 2.6 - g, 0x4a2e1c, { seg: 6 });
}

// ---- surfing -------------------------------------------------------------------------------
function surf(game, kit, R) {
  const W = game.physics.world, S = { x: SURF.x0 + 6, z: SURF.z }, OUT = SURF.x1;
  // shack + board rack on the beach
  const sx = SURF.x0 - 8, sz = SURF.z - 8, sg = R.groundAt(sx, sz);
  const L = new R.Local(kit, sx, sz, Math.PI / 2, sg);
  for (const [a, b] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) L.cyl(a, 1.3, b, 0.12, 2.6, 0xa77b4a, { seg: 6 });
  L.box(0, 2.7, 0, 5, 0.2, 4, 0xd8b45a);
  L.box(0, 0.5, 1.4, 4, 1.0, 0.6, 0x3fe0d0);
  const sgn = L.v3(0, 3.3, 1.9);
  R.sign('SURF SHACK', sgn.x, sgn.y, sgn.z, Math.PI / 2, 3.6, '#3fe0d0', '#ffffff');
  for (let i = 0; i < 4; i++) { const p = L.v3(-1.5 + i, 0, -2.4); kit.sphere(p.x, sg + 1.1, p.z, 0.6, [0xff5a8a, 0xffd23f, 0x3f8cff, 0xff8a1a][i], { scale: [0.42, 1.55, 0.08], seg: 10 }); }
  R.npc('surfer', sx + 4, sz + 4, { area: { x: sx + 6, z: SURF.z, r: 8 } });
  // the board
  const bb = new Builder();
  bb.sphere(1, 0xff5a8a, [0, 0, 0], [0.32, 0.06, 1.25], 14);
  bb.box(0.05, 0.03, 2.3, 0xffffff, [0, 0.05, 0]);
  bb.cone(0.07, 0.15, 0x222228, [0, -0.1, -0.95], [Math.PI, 0, 0], 4);
  const mesh = bb.mesh(); game.scene.add(mesh);
  const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(S.x, SEA_LEVEL + 0.05, S.z));
  W.createCollider(RAPIER.ColliderDesc.cuboid(0.32, 0.06, 1.2).setCollisionGroups(groups(G_VEH, ALL & ~G_STATIC)), body);
  game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  // the wave the board rides, plus idle swells
  const waveMat = new THREE.MeshLambertMaterial({ color: 0x3fc8e8, transparent: true, opacity: 0.85 });
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const mkWave = (len) => {
    const g = new THREE.Group();
    const w = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 14, 1, false, 0, Math.PI), waveMat);
    w.rotation.set(Math.PI / 2, 0, Math.PI / 2); g.add(w);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, len, 6), foamMat);
    f.rotation.x = Math.PI / 2; f.position.set(-0.45, 0.85, 0); g.add(f);
    g.userData.noCull = true; game.scene.add(g); return g;
  };
  const wave = mkWave(22); wave.visible = false;
  const swells = [0, 1, 2].map(() => mkWave(30));
  const st = { mode: 'wait', x: S.x, z: S.z, steer: 0, t: 0, roll: 0, rides: 0 };
  const seat = addSeat(game, {
    body, pos: [0, 0.12, -0.2], yaw: 0, label: 'Surf', hint: 'Stick to carve · Y bail', exit: [0.9, 0.3, 0],
    onEnter: () => { if (st.mode === 'wait') { st.mode = 'out'; st.t = 0; } },
    control(inp) { st.steer = Math.max(-1, Math.min(1, inp.moveX || 0)); },
  });
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  game.physics.animators.push((t, dt) => {
    const rider = seat.occupant;
    let y = SEA_LEVEL + 0.05, yaw = Math.PI / 2, pitch = 0, roll = 0;
    if (st.mode === 'out') {
      st.x = Math.min(OUT, st.x + 4.5 * dt); y += Math.sin(t * 3) * 0.08; pitch = Math.sin(t * 3) * 0.05;
      if (!rider) st.mode = 'back';
      else if (st.x >= OUT) { st.mode = 'ride'; st.t = 0; R.common.tone(game, { x: st.x, y, z: st.z }, 300, 700, 0.4, 0.15); }
    } else if (st.mode === 'ride') {
      st.t += dt;
      st.x -= (6.5 + Math.min(2.5, st.t)) * dt;
      st.z = Math.max(SURF.z - 14, Math.min(SURF.z + 14, st.z - st.steer * 6 * dt));
      st.roll += (st.steer * 0.35 - st.roll) * Math.min(1, dt * 5);
      y = SEA_LEVEL + 0.9 + Math.sin(t * 2) * 0.1; pitch = 0.22; roll = st.roll; yaw = -Math.PI / 2 - st.steer * 0.35;
      wave.visible = true; wave.position.set(st.x + 1.2, SEA_LEVEL - 0.15, st.z); wave.scale.set(1, 1.1, 1);
      if (!rider) st.mode = 'back';
      else if (st.x <= SURF.x0 + 2) {
        rider.leaveSeat(); st.mode = 'back'; st.rides++;
        game.audio?.play('splash', { x: st.x, y: SEA_LEVEL, z: st.z });
        R.common.chime(game, { x: st.x, y: 1, z: st.z }, [72, 76, 79]);
        game.life?.reward(rider, 3, 'Surf\'s up!', { x: st.x, y: 1.5, z: st.z });
      }
    } else if (st.mode === 'back') {
      wave.position.y -= dt * 1.5; if (wave.position.y < SEA_LEVEL - 2) wave.visible = false;
      const k = Math.min(1, dt * 1.2);
      st.x += (S.x - st.x) * k; st.z += (S.z - st.z) * k;
      if (Math.hypot(st.x - S.x, st.z - S.z) < 0.3) { st.mode = 'wait'; wave.visible = false; }
    } else { y += Math.sin(t * 1.6) * 0.05; }
    seat.disabled = st.mode !== 'wait' && !rider;
    e.set(pitch, yaw, roll, 'YXZ'); q.setFromEuler(e);
    body.setNextKinematicTranslation({ x: st.x, y, z: st.z });
    body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  });
  game.updaters.push((dt, t) => {
    swells.forEach((s, i) => {
      const k = ((t * 0.06 + i / 3) % 1);
      s.position.set(SURF.x1 + 10 - k * (SURF.x1 + 10 - SURF.x0), SEA_LEVEL - 0.75 + Math.sin(k * Math.PI) * 0.45, SURF.z + (i - 1) * 9);
      s.scale.set(1, 0.6, 1);
    });
  });
  game.surf = { st, seat, body };
}

// ---- palms and plants on the islets --------------------------------------------------------
function palms(game, kit, R) {
  const F = new Flora(game, 96), rnd = R.rng(21);
  const [bx0, bx1, bz0, bz1] = R.bounds;
  const blocked = (x, z) =>
    (x > RESORT.x0 - 4 && x < RESORT.x1 + 4 && z > RESORT.z0 - 4 && z < RESORT.z1 + 4) ||
    (x > HARBOUR.x0 - 3 && x < HARBOUR.x1 + 6 && z > HARBOUR.z0 - 3 && z < HARBOUR.z1 + 3) ||
    (x > POOL.x0 - 6 && x < POOL.x1 + 10 && z > POOL.z0 - 6 && z < POOL.z1 + 6) ||
    (x > 548 && x < 648 && z > 708 && z < 735) ||           // sunbeds
    (x > 520 && x < 548 && z > 740 && z < 795) ||           // beach huts
    Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 9 || Math.hypot(x - 452, z - 572) < 16 || Math.hypot(x - 470, z - 585) < 8 ||
    (x > SURF.x0 - 16 && x < SURF.x0 + 2 && Math.abs(z - SURF.z) < 14);
  for (let gx = bx0; gx < bx1; gx += 9) for (let gz = bz0; gz < bz1; gz += 9) {
    const x = gx + rnd() * 9, z = gz + rnd() * 9, h = R.groundAt(x, z);
    if (h < 0.9 || blocked(x, z)) continue;
    const r = rnd();
    if (r < 0.5) F.add('palm', x, h - 0.1, z, 0.9 + rnd() * 0.4, rnd() * 6.28, 0.9 + rnd() * 0.2);
    else if (r < 0.62) F.add('banana', x, h - 0.1, z, 0.9 + rnd() * 0.3, rnd() * 6.28, 1);
    else if (r < 0.8) F.add(rnd() < 0.5 ? 'flowers' : 'bush', x, h - 0.1, z, 0.8 + rnd() * 0.4, rnd() * 6.28, 1, false);
  }
  // resort garden palms
  for (const [x, z] of [[567, 750], [567, 762], [610, 742], [644, 744], [644, 760], [612, 790], [596, 790]]) F.add('palm', x, R.groundAt(x, z) - 0.1, z, 1.1, rnd() * 6, 1);
  F.finish();
  game.coveFlora = F.count;
  void DT;
}
