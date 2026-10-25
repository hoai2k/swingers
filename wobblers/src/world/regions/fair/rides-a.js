// Fair rides, part A: Pirate Ship + Viking Ship (swinging ships), Ring of Fire
// (a train going round a vertical loop), Ferris Wheel, classic Carousel with
// up-and-down horses, Drop Tower. Each ride is static kit scenery (frames,
// platforms, signs) plus kinematic bodies posed by an animator (FairRides).
// `side` is the direction (+1 / -1 along z) from the ride to the midway: signs,
// stairs and boarding platforms are on that side.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder } from '../../../mesh.js';
import { FAIR, MIDWAY, RIDES } from './layout.js';
import { setPose, power, travel, vmaxFor, sstep, ypr, AX, strut, kitStrut, place, mat4, rb, BULB, BULB2, AUTUMN } from './common.js';

const Y = FAIR.y;
const _q = new THREE.Quaternion(), _p = new THREE.Vector3();
const sideOf = (z) => Math.sign(MIDWAY.z - z);

export function buildRidesA(game, kit, R, F) {
  const T = (k, f) => { const t0 = performance.now(); f(); (F.times ||= {})[k] = Math.round(performance.now() - t0); };
  T('pirate', () => swingShip(F, kit, RIDES.pirate, 'pirate'));
  T('viking', () => swingShip(F, kit, RIDES.viking, 'viking'));
  T('ringfire', () => ringOfFire(F, kit, RIDES.ringfire));
  T('ferris', () => ferrisWheel(F, kit, RIDES.ferris));
  T('carousel', () => carousel(F, kit, RIDES.carousel));
  T('droptower', () => dropTower(F, kit, RIDES.droptower));
}

// A wooden boarding deck (top at height h above the fair) with steps down to the midway side.
function deck(kit, x, z, w, d, h, side, color = 0x9a6a3e) {
  kit.box(x, Y + h / 2, z, w, h, d, color);
  kit.deco(x, Y + h + 0.02, z, w, 0.04, d, 0xb98a5a);
  const steps = Math.max(1, Math.round(h / 0.3));
  for (let i = 0; i < steps; i++) {
    const sh = h * (i + 1) / steps;
    kit.box(x, Y + sh / 2, z + side * (d / 2 + (steps - i - 0.5) * 0.45), 2.4, sh, 0.45, color);
  }
}

// ---- Pirate Ship / Viking Ship ------------------------------------------------------
function swingShip(F, kit, at, kind) {
  const viking = kind === 'viking';
  const { x, z } = at, side = sideOf(z);
  // the hull is an arc round the pivot (like the real ride), so its keel never dips lower than L + 1
  const L = 9.6, H = L + 2.0, BEAM = 4.2, SEG = 0.16, NSEG = 7, END = 0.68;
  const hull = viking ? 0x7a4a26 : 0x9c1f1f, trim = viking ? 0xd9b25a : 0xf2c14a, wood = 0x6b4426, deckC = 0xb98a5a;
  const legC = viking ? 0x2f4a6a : 0x2a2a30;
  // ground pad, A-frames either side of the beam, axle, boarding deck
  kit.box(x, Y + 0.1, z, 30, 0.2, 14, viking ? 0x5a4a3a : 0x3a3f4a);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) kitStrut(kit, [x + sx * 5.5, Y, z + sz * 5.4], [x, Y + H + 0.3, z + sz * 3.1], 0.32, legC);
  kit.cyl(x, Y + H, z, 0.42, 6.6, legC, { euler: [Math.PI / 2, 0, 0], collide: false });
  for (const sz of [-1, 1]) kit.sphere(x, Y + H, z + sz * 3.35, 0.6, trim);
  deck(kit, x, z + side * 3.5, 8, 2.2, 2.2, side);
  F.sign(viking ? 'VIKING SHIP' : 'PIRATE SHIP', x + 10, z + side * 6.6, side > 0 ? 0 : Math.PI, 3.6, viking ? '#5a3a1e' : '#9c1f1f', viking ? '#bfe8ff' : '#ffd23f');

  const b = new Builder();
  const at2 = (phi, build) => place(b, mat4(0, 0, 0, new THREE.Quaternion().setFromAxisAngle(AX.z, phi)), build);
  for (let k = 0; k < NSEG; k++) {
    const phi = (k - (NSEG - 1) / 2) * SEG;
    at2(phi, (t) => {
      rb(t, 1.75, 1.55, BEAM, 0.35, hull, [0, -(L + 0.17), 0]);
      for (const sz of [-1, 1]) {
        t.box(1.75, 0.95, 0.16, hull, [0, -(L - 1.05), sz * (BEAM / 2 - 0.08)]);
        t.box(1.8, 0.16, 0.32, trim, [0, -(L - 1.55), sz * (BEAM / 2 - 0.05)]);
        if (viking) { // round shields along the sides
          t.cyl(0.42, 0.42, 0.08, [0xc8343c, 0xf2c14a, 0x2f6ab5][k % 3], [0, -(L - 0.9), sz * (BEAM / 2 + 0.06)], [Math.PI / 2, 0, 0], 10);
          t.sphere(0.1, 0xd0d0d0, [0, -(L - 0.9), sz * (BEAM / 2 + 0.12)], null, 6);
        } else { // portholes
          t.cyl(0.22, 0.22, 0.06, 0xf2c14a, [0, -(L + 0.1), sz * (BEAM / 2 + 0.01)], [Math.PI / 2, 0, 0], 10);
          t.cyl(0.14, 0.14, 0.08, 0x1e1e24, [0, -(L + 0.1), sz * (BEAM / 2 + 0.04)], [Math.PI / 2, 0, 0], 10);
        }
      }
      t.box(1.75, 0.08, BEAM - 0.3, deckC, [0, -(L - 0.6), 0]);
    });
  }
  // raised bow and stern
  for (const s of [-1, 1]) at2(s * END, (t) => {
    rb(t, 2.2, 2.9, BEAM, 0.5, hull, [0, -(L - 0.85), 0]);
    rb(t, 2.3, 0.22, BEAM + 0.2, 0.08, trim, [0, -(L - 2.35), 0]);
    if (viking && s > 0) { // dragon head
      strut(t, [0.6, -(L - 2.0), 0], [2.0, -(L - 4.1), 0], 0.32, 0x3c7a3a, 8);
      t.sphere(0.55, 0x3c7a3a, [2.3, -(L - 4.3), 0], [1.5, 0.8, 0.8]);
      t.cone(0.3, 0.5, 0xf2f2f2, [3.1, -(L - 4.2), 0], [0, 0, -Math.PI / 2], 6);
      for (const sz of [-1, 1]) { t.cone(0.1, 0.6, 0xf2e6c4, [2.1, -(L - 4.8), sz * 0.25], [0.2 * sz, 0, 0.4], 5); t.sphere(0.09, 0xffd23f, [2.7, -(L - 4.45), sz * 0.32], null, 6); }
    } else if (viking) t.torus(0.8, 0.22, 0x3c7a3a, [-1.0, -(L - 3.0), 0], null, 12); // curled tail
    else if (s > 0) strut(t, [0.8, -(L - 1.9), 0], [3.4, -(L - 3.0), 0], 0.1, wood); // bowsprit
    else t.box(0.08, 1.0, 1.4, 0x1e1e24, [-0.6, -(L - 3.0), 0]); // stern flag
  });
  // swing arms (a V each side), the hub, mast and sail
  const arm = (phi) => [Math.sin(phi) * (L - 1.5), -Math.cos(phi) * (L - 1.5)];
  for (const sz of [-1, 1]) for (const s of [-1, 1]) { const [ax, ay] = arm(s * 0.42); strut(b, [0, 0, sz * 2.3], [ax, ay, sz * 1.95], 0.16, legC); }
  b.cyl(0.5, 0.5, 4.8, trim, [0, 0, 0], [Math.PI / 2, 0, 0], 12);
  b.cyl(0.14, 0.18, 5.6, wood, [0, -(L - 3.4), 0], null, 8);
  if (viking) for (let i = 0; i < 5; i++) b.box(0.06, 0.62, 3.4, i % 2 ? 0xffffff : 0xc8343c, [0.15, -(L - 1.6 - 0.62 * i - 0.5), 0]);
  else {
    b.box(0.06, 2.8, 3.4, 0x1e1e24, [0.15, -(L - 3.2), 0]);
    b.sphere(0.45, 0xf2f2f2, [0.22, -(L - 3.5), 0], [0.3, 1, 1]);
    for (const s of [-1, 1]) b.box(0.05, 0.14, 1.2, 0xf2f2f2, [0.22, -(L - 2.85), 0], [s * 0.7, 0, 0]);
  }
  // body at the pivot; colliders follow the arc of the hull
  const cols = [-1, 0, 1].map((k) => {
    const phi = k * 0.4, q = new THREE.Quaternion().setFromAxisAngle(AX.z, phi), r = L + 0.15;
    return RAPIER.ColliderDesc.cuboid(1.75, 0.75, BEAM / 2).setTranslation(Math.sin(phi) * r, -Math.cos(phi) * r, 0).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  });
  const body = F.body({ x, y: Y + H, z }, cols, null);
  // stepped rows of benches facing the middle of the ship
  for (const pr of [-0.49, -0.33, -0.17, 0.17, 0.33, 0.49]) {
    const face = -Math.sign(pr), rs = L - 1.2, sx = Math.sin(pr) * rs, sy = -Math.cos(pr) * rs;
    b.box(0.62, 0.42, BEAM - 0.5, 0x2a62c9, [sx, sy - 0.39, 0]);
    b.box(0.5, 0.9, BEAM - 0.7, wood, [sx, sy - 1.0, 0]);
    b.box(0.12, 0.75, BEAM - 0.5, 0x2a62c9, [sx - face * 0.34, sy + 0.2, 0]);
    b.cyl(0.05, 0.05, BEAM - 0.5, 0xd0d0d0, [sx + face * 0.5, sy + 0.2, 0], [Math.PI / 2, 0, 0], 6);
    for (const sz of [-1.25, 0, 1.25]) F.seat(body, [sx, sy, sz], face > 0 ? Math.PI / 2 : -Math.PI / 2, viking ? 'Ride Viking Ship' : 'Ride Pirate Ship', viking ? 'Skål!' : 'Arr, hold on!', [sx, sy + 0.4, side * 3.3]);
  }
  const mesh = b.mesh();
  F.group.add(mesh);
  F.game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  const W = 10, UP = 12, RUN = 18, DOWN = 11, P = W + UP + RUN + DOWN + 1, OFF = viking ? 17 : 0;
  const A = viking ? 1.42 : 1.22, w = 2 * Math.PI / (viking ? 6.8 : 6.2);
  F.animate(kind, (t) => {
    const c = (t + OFF) % P;
    const th = A * power(c, W, UP, RUN, DOWN) * Math.sin(w * Math.max(0, c - W));
    _q.setFromAxisAngle(AX.z, th);
    setPose(body, { x, y: Y + H, z }, _q);
  });
}

// ---- Ring of Fire -----------------------------------------------------------------
function ringOfFire(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const RR = 9, YC = Y + RR + 1.9, RC = RR - 0.42, NC = 6;
  const red = 0xd8321e, black = 0x23232a;
  // the loop: two rails, ties, a ring of flame bulbs; legs out to both sides
  const tb = kit.b(x, z);
  for (const sz of [-0.55, 0.55]) tb.add(new THREE.TorusGeometry(RR, 0.16, 6, 72), red, [x, YC, z + sz]);
  tb.add(new THREE.TorusGeometry(RR + 0.55, 0.32, 6, 72), black, [x, YC, z]);
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    tb.box(0.12, 0.7, 1.3, black, [x + c * (RR + 0.25), YC + s * (RR + 0.25), z], [0, 0, a]);
    tb.sphere(0.13, i % 2 ? BULB2 : BULB, [x + c * (RR + 0.95), YC + s * (RR + 0.95), z + (i % 2 ? 0.25 : -0.25)], null, 6);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kitStrut(kit, [x + sx * (RR + 5.5), Y, z + sz * 4.2], [x + sx * (RR + 0.6), YC + 1.5, z + sz * 0.5], 0.3, black);
    kitStrut(kit, [x + sx * (RR + 2.5), Y, z + sz * 3.2], [x + sx * (RR * 0.7), YC - RR * 0.7, z + sz * 0.5], 0.24, black);
  }
  kit.box(x, Y + 0.95, z, 4, 1.9, 1.6, black); // the ring's foot under the station
  kit.box(x, Y + 0.1, z, 2 * RR + 12, 0.2, 10, 0x3a3f4a);
  deck(kit, x, z + side * 2.5, 12, 2.2, 1.8, side, 0x5a5f6a);
  F.sign('RING OF FIRE', x - 10, z + side * 5.5, side > 0 ? 0 : Math.PI, 3.6, '#1e1e24', '#ff6a2a');
  // the train: NC cars on the inside of the loop, each its own body (riders stay square in their car)
  const cars = [], dA = 1.85 / RC;
  for (let i = 0; i < NC; i++) {
    const body = F.body({ x, y: YC - RC, z }, [RAPIER.ColliderDesc.cuboid(0.8, 0.2, 0.75).setTranslation(0, 0.2, 0)]);
    cars.push(body);
    for (const sz of [-0.36, 0.36]) F.seat(body, [-0.05, 0.62, sz], Math.PI / 2, 'Ride Ring of Fire', 'Upside down!', [0, 0.5, side * 1.9]);
  }
  const shell = new Builder(), frame = new Builder();
  rb(shell, 1.6, 0.45, 1.5, 0.15, 0xffffff, [0, 0.22, 0]);
  rb(shell, 0.2, 0.9, 1.5, 0.08, 0xffffff, [-0.75, 0.75, 0]);
  rb(shell, 0.25, 0.5, 1.5, 0.1, 0xffffff, [0.78, 0.55, 0]);
  frame.box(1.0, 0.1, 1.3, 0x222228, [0, 0.47, 0]);
  for (const sz of [-0.36, 0.36]) {
    rb(frame, 0.5, 0.75, 0.55, 0.12, 0x222228, [-0.45, 0.85, sz]);
    frame.torus(0.32, 0.05, 0xffd23f, [-0.05, 1.05, sz], [0, Math.PI / 2, 0], 10);
  }
  for (const sz of [-0.62, 0.62]) for (const sx of [-0.55, 0.55]) frame.cyl(0.12, 0.12, 0.1, 0x555555, [sx, -0.05, sz], [Math.PI / 2, 0, 0], 8);
  F.instanced([{ b: shell, tint: true }, { b: frame }], cars, [0xffd23f, 0xff8a1a, 0xd8321e, 0xffd23f, 0xff8a1a, 0xd8321e]);
  // motion: a pumped pendulum that swings higher and higher, goes over the top
  // three times, then is braked back down (state integrated each step)
  const g = 9.81 / RC, S = { th: 0, w: 0, mode: 'wait', t: 6, loops: 0 };
  const ET = 2 * g * 1.25;
  F.animate('ringfire', (t, dt) => {
    if (dt <= 0) dt = 1 / 60;
    const E = 0.5 * S.w * S.w + g * (1 - Math.cos(S.th));
    let acc = -g * Math.sin(S.th);
    if (S.mode === 'wait') { S.t -= dt; S.th = 0; S.w = 0; acc = 0; if (S.t <= 0) { S.mode = 'pump'; S.loops = 0; S.start = 0; } }
    else if (S.mode === 'pump') {
      acc += 0.3 * (S.w >= 0 ? 1 : -1) * Math.max(-1, Math.min(1, (ET - E) * 2));
      if (S.w === 0) S.w = 0.05;
      if (Math.abs(S.th) > 2 * Math.PI * 3 + Math.PI) { S.mode = 'brake'; }
    } else if (S.mode === 'brake') {
      if (S.th > Math.PI) S.th -= 2 * Math.PI; else if (S.th < -Math.PI) S.th += 2 * Math.PI;
      acc -= 0.55 * S.w;
      if (E < 0.006 && Math.abs(S.th) < 0.06) { S.mode = 'wait'; S.t = 12; }
    }
    S.w += acc * dt;
    S.th += S.w * dt;
    cars.forEach((body, i) => {
      const a = S.th + (i - (NC - 1) / 2) * dA;
      _q.setFromAxisAngle(AX.z, a);
      setPose(body, { x: x + Math.sin(a) * RC, y: YC - Math.cos(a) * RC, z }, _q);
    });
  });
  F.ringFire = S;
}

// ---- Ferris Wheel -----------------------------------------------------------------
function ferrisWheel(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const H = 18.5, RW = 15, N = 12;
  const white = 0xf6efe0, gold = 0xe8a23a, maroon = 0x7a2430;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kitStrut(kit, [x + sx * 7.5, Y, z + sz * 4], [x, Y + H, z + sz * 1.6], 0.38, white);
  for (const sz of [-1, 1]) kitStrut(kit, [x - 4, Y + 8, z + sz * 2.8], [x + 4, Y + 8, z + sz * 2.8], 0.18, white);
  kit.cyl(x, Y + H, z, 0.6, 4.2, 0xdddddd, { euler: [Math.PI / 2, 0, 0], collide: false });
  kit.box(x, Y + 0.1, z, 34, 0.2, 10, 0x3a3f4a);
  deck(kit, x, z + side * 0.2, 6, 5, 0.8, side, maroon);
  F.sign('FERRIS WHEEL', x + 10, z + side * 5.6, side > 0 ? 0 : Math.PI, 3.6, '#e8a23a', '#7a2430');
  // the wheel (in the x-y plane, turning about z)
  const wb = new Builder();
  for (const sz of [-1, 1]) {
    wb.add(new THREE.TorusGeometry(RW, 0.2, 6, 72), gold, [0, 0, sz]);
    wb.add(new THREE.TorusGeometry(RW * 0.55, 0.13, 6, 48), maroon, [0, 0, sz]);
    for (let i = 0; i < N * 2; i++) {
      const a = i / (N * 2) * Math.PI * 2;
      strut(wb, [0, 0, sz * 0.6], [Math.cos(a) * RW, Math.sin(a) * RW, sz], 0.07, white, 4);
    }
  }
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    wb.cyl(0.08, 0.08, 2.2, 0xdddddd, [Math.cos(a) * RW, Math.sin(a) * RW, 0], [Math.PI / 2, 0, 0], 6);
    for (let k = 0; k < 4; k++) { const b2 = a + (k + 0.5) / N / 4 * Math.PI * 2; wb.sphere(0.2, k % 2 ? BULB : BULB2, [Math.cos(b2) * (RW + 0.35), Math.sin(b2) * (RW + 0.35), 0], null, 6); }
  }
  wb.cyl(1.1, 1.1, 2.6, gold, [0, 0, 0], [Math.PI / 2, 0, 0], 16);
  const wheel = F.body({ x, y: Y + H, z }, [RAPIER.ColliderDesc.cylinder(1.3, 1.1).setRotation({ x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) })], wb.mesh());
  // cabins hang from the rim (one body each, drawn instanced)
  const cabins = [];
  for (let i = 0; i < N; i++) {
    const body = F.body({ x, y: Y + 2, z }, [RAPIER.ColliderDesc.cuboid(0.9, 0.06, 0.8).setTranslation(0, -0.6, 0)]);
    cabins.push(body);
    for (const s of [1, -1]) F.seat(body, [s * 0.55, -0.2, 0], s > 0 ? -Math.PI / 2 : Math.PI / 2, 'Ride Ferris Wheel', 'Enjoy the view!', [0, -0.2, side * 2.0]);
  }
  const shell = new Builder(), frame = new Builder();
  rb(shell, 1.8, 0.12, 1.6, 0.05, 0xffffff, [0, -0.6, 0]);
  rb(shell, 0.1, 0.6, 1.6, 0.04, 0xffffff, [0.85, -0.3, 0]); rb(shell, 0.1, 0.6, 1.6, 0.04, 0xffffff, [-0.85, -0.3, 0]);
  rb(shell, 2.0, 0.14, 1.8, 0.05, 0xffffff, [0, 1.2, 0]);
  shell.cone(1.0, 0.5, 0xffffff, [0, 1.5, 0], null, 4);
  rb(frame, 1.8, 0.5, 0.1, 0.04, white, [0, -0.35, 0.78]); rb(frame, 1.8, 0.5, 0.1, 0.04, white, [0, -0.35, -0.78]);
  frame.box(0.4, 0.2, 1.4, white, [0.6, -0.45, 0]); frame.box(0.4, 0.2, 1.4, white, [-0.6, -0.45, 0]);
  for (const [px, pz] of [[0.85, 0.75], [-0.85, 0.75], [0.85, -0.75], [-0.85, -0.75]]) frame.cyl(0.03, 0.03, 1.8, 0xdddddd, [px, 0.3, pz], null, 4);
  frame.cyl(0.05, 0.05, 1.3, 0x999999, [0, 1.9, 0], null, 6);
  F.instanced([{ b: shell, tint: true }, { b: frame }], cabins, AUTUMN);
  F.animate('ferris', (t) => {
    const ang = t * 0.075;
    _q.setFromAxisAngle(AX.z, ang);
    setPose(wheel, { x, y: Y + H, z }, _q);
    cabins.forEach((body, i) => {
      const a = ang + i / N * Math.PI * 2;
      _q.setFromAxisAngle(AX.z, Math.sin(t * 0.9 + i) * 0.04);
      setPose(body, { x: x + Math.cos(a) * RW, y: Y + H + Math.sin(a) * RW - 1.5, z }, _q);
    });
  });
}

// ---- Carousel ---------------------------------------------------------------------
function carousel(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const RP = 8, PY = Y + 0.45, cream = 0xf6ead0, maroon = 0x8a2430, gold = 0xe8b23a;
  kit.cyl(x, Y + 0.15, z, RP + 0.7, 0.3, gold, { seg: 32, collide: false });
  kit.cyl(x, Y + 3.4, z, 0.55, 6.8, gold, { seg: 12 });
  const b0 = kit.b(x, z);
  for (let k = 0; k < 16; k++) b0.add(new THREE.ConeGeometry(RP + 0.9, 2.6, 16, 1, false, k * Math.PI / 8, Math.PI / 8), k % 2 ? cream : maroon, [x, Y + 7.6, z]);
  b0.cyl(RP + 0.9, RP + 0.9, 0.8, gold, [x, Y + 5.9, z], null, 32);
  for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; b0.sphere(0.12, k % 2 ? BULB : BULB2, [x + Math.sin(a) * (RP + 0.95), Y + 5.9, z + Math.cos(a) * (RP + 0.95)], null, 6); }
  b0.sphere(0.55, gold, [x, Y + 9.1, z]);
  b0.cone(0.18, 1.0, maroon, [x, Y + 9.9, z]);
  F.sign('CAROUSEL', x + side * 0, z + side * (RP + 2.2), side > 0 ? 0 : Math.PI, 3.6, '#f6ead0', '#c8343c');
  // turning platform (players can stand on it) with the horses' poles
  const pb = new Builder();
  pb.cyl(RP, RP, 0.3, cream, [0, 0, 0], null, 40);
  for (let k = 0; k < 16; k++) pb.add(new THREE.CylinderGeometry(RP - 0.05, RP - 0.05, 0.31, 16, 1, false, k * Math.PI / 8, Math.PI / 16), maroon, [0, 0, 0]);
  pb.cyl(1.4, 1.4, 3.2, maroon, [0, 1.7, 0], null, 16);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; pb.box(0.06, 2.6, 1.0, 0xc8d8e8, [Math.sin(a) * 1.45, 1.8, Math.cos(a) * 1.45], [0, a, 0]); }
  const plat = F.body({ x, y: PY, z }, [RAPIER.ColliderDesc.cylinder(0.15, RP).setFriction(1.2)], pb.mesh());
  // horses: one body each (they rise and fall), drawn instanced
  const horses = [], ring = [[RP - 1.4, 12, 0], [RP - 3.5, 8, 0.5]];
  for (const [r, n, o] of ring) for (let i = 0; i < n; i++) {
    const body = F.body({ x, y: PY + 1, z });
    horses.push({ body, r, a: (i + o) / n * Math.PI * 2, ph: horses.length * 1.7 });
    F.seat(body, [0, 0.36, -0.05], 0, 'Ride horse', 'Giddy up!', [-1.3, -0.4, 0]);
  }
  const hb = new Builder(), hf = new Builder();
  hb.sphere(0.45, 0xffffff, [0, 0, 0], [0.72, 0.78, 1.5]);
  hb.sphere(0.26, 0xffffff, [0, 0.5, 0.62], [0.8, 1.05, 1.35]);
  hb.cyl(0.13, 0.17, 0.5, 0xffffff, [0, 0.28, 0.48], [0.6, 0, 0], 8);
  for (const sx of [-0.15, 0.15]) {
    hb.cyl(0.07, 0.07, 0.6, 0xffffff, [sx, -0.42, 0.42], [-0.5, 0, 0], 5);
    hb.cyl(0.07, 0.07, 0.6, 0xffffff, [sx, -0.42, -0.42], [0.5, 0, 0], 5);
    hb.cone(0.05, 0.14, 0xffffff, [sx * 0.7, 0.75, 0.6], null, 4);
  }
  hf.box(0.12, 0.42, 0.5, 0x5a3a24, [0, 0.55, 0.38], [0.5, 0, 0]);           // mane
  hf.cone(0.12, 0.5, 0x5a3a24, [0, 0.0, -0.75], [-2.3, 0, 0], 6);            // tail
  rb(hf, 0.52, 0.1, 0.56, 0.04, 0xc8343c, [0, 0.33, -0.05]);                // saddle
  hf.box(0.54, 0.06, 0.06, gold, [0, 0.3, 0.25]);
  hf.cyl(0.035, 0.035, 5.6, gold, [0, 1.6, 0.08], null, 6);                  // pole
  hf.sphere(0.07, 0x222222, [0.12, 0.58, 0.85]); hf.sphere(0.07, 0x222222, [-0.12, 0.58, 0.85]);
  F.instanced([{ b: hb, tint: true }, { b: hf }], horses.map((h) => h.body), [0xffffff, 0xf6e7c8, 0x8a5a36, 0x3a3a40, 0xd8d8d8, 0xffe1f0, 0xc8975f]);
  const WAIT = 10, UP = 4, RUN = 22, DOWN = 5, PER = WAIT + UP + RUN + DOWN, VM = vmaxFor(4 * Math.PI, UP, RUN, DOWN);
  F.animate('carousel', (t) => {
    const c = (t + 5) % PER, ang = travel(c, WAIT, UP, RUN, DOWN, VM);
    _q.setFromAxisAngle(AX.y, ang);
    setPose(plat, { x, y: PY, z }, _q);
    for (const h of horses) {
      const A = ang + h.a;
      ypr(_q, A + Math.PI / 2);
      setPose(h.body, { x: x + Math.sin(A) * h.r, y: PY + 1.05 + 0.28 * Math.sin(ang * 3 + h.ph), z: z + Math.cos(A) * h.r }, _q);
    }
  });
}

// ---- Drop Tower ---------------------------------------------------------------------
function dropTower(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const H = 48, orange = 0xe8742a, black = 0x23232a;
  kit.cyl(x, Y + H / 2, z, 1.15, H, orange, { seg: 12 });
  for (let i = 0; i < 15; i++) kit.deco(x, Y + 1.5 + i * 3.1, z, 2.4, 0.3, 2.4, i % 2 ? black : 0xffd23f);
  for (let i = 0; i < 24; i++) kit.sphere(x + Math.sin(i * 2.4) * 1.2, Y + 2 + i * 1.9, z + Math.cos(i * 2.4) * 1.2, 0.12, BULB2, { seg: 6 });
  kit.box(x, Y + H + 0.8, z, 4.4, 1.6, 4.4, black);
  kit.cone(x, Y + H + 3, z, 2.2, 2.8, 0xffd23f);
  kit.cyl(x, Y + 0.15, z, 4.6, 0.3, black, { seg: 24 });
  F.sign('DROP TOWER', x, z + side * 6.2, side > 0 ? 0 : Math.PI, 3.6, '#5ab4e8', '#e8321e');
  const b = new Builder();
  b.torus(2.1, 0.38, orange, [0, 0, 0], [Math.PI / 2, 0, 0], 24);
  const NS = 12;
  for (let i = 0; i < NS; i++) {
    const a = i / NS * Math.PI * 2;
    rb(b, 0.6, 0.12, 0.6, 0.04, 0xffd23f, [Math.sin(a) * 2.1, -0.35, Math.cos(a) * 2.1], [0, a, 0]);
    rb(b, 0.6, 1.0, 0.14, 0.04, black, [Math.sin(a) * 1.78, 0.15, Math.cos(a) * 1.78], [0, a, 0]);
    b.torus(0.28, 0.05, 0xffd23f, [Math.sin(a) * 2.05, 0.35, Math.cos(a) * 2.05], [0, a, 0], 10);
  }
  const ring = F.body({ x, y: Y + 1.2, z }, [], b.mesh());
  for (let i = 0; i < NS; i++) {
    const a = i / NS * Math.PI * 2;
    F.seat(ring, [Math.sin(a) * 2.1, -0.15, Math.cos(a) * 2.1], a, 'Ride Drop Tower', 'Here we go…', [Math.sin(a) * 3.4, 0, Math.cos(a) * 3.4]);
  }
  const low = Y + 1.2, high = Y + H - 5;
  F.animate('droptower', (t) => {
    const c = (t + 11) % 38;
    let y;
    if (c < 10) y = low;
    else if (c < 25) { const k = (c - 10) / 15; y = low + (high - low) * (k * k * (3 - 2 * k)); }
    else if (c < 28.5) y = high;
    else {
      const ft = c - 28.5, fall = 0.5 * 9.81 * ft * ft, brakeAt = low + 12;
      if (high - fall > brakeAt) y = high - fall;
      else {
        const tb = Math.sqrt(2 * (high - brakeAt) / 9.81), vb = 9.81 * tb, dtb = ft - tb;
        const dec = vb * vb / (2 * (brakeAt - low));
        y = dtb > vb / dec ? low : Math.max(low, brakeAt - (vb * dtb - 0.5 * dec * dtb * dtb));
      }
    }
    _q.setFromAxisAngle(AX.y, t * 0.1);
    setPose(ring, { x, y, z }, _q);
  });
}
