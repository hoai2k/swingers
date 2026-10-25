// Fair rides, part B: Gravitron + Starship 2000 (spinning saucers whose wall
// pads carry the riders up the wall), Zipper (a turning boom with flipping
// cages running round it), Top Spin (a gondola flipping between two arms),
// Tilt-a-Whirl (tubs spinning freely as they ride over hills), Himalaya (cars
// racing round a tilted, hilly track, forwards then backwards) and Sizzler
// (spinning arms with spinning car clusters).
import * as THREE from 'three';
import { RAPIER } from '../../physics.js';
import { Builder, matVCDouble } from '../../mesh.js';
import { FAIR, MIDWAY, RIDES } from './layout.js';
import { setPose, power, travel, vmaxFor, sstep, ypr, AX, strut, kitStrut, place, mat4, rb, BULB, BULB2, NEON_CYAN, NEON_PURPLE, NEON_PINK, AUTUMN } from './common.js';

const Y = FAIR.y;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
const sideOf = (z) => Math.sign(MIDWAY.z - z);
const TAU = Math.PI * 2;

export function buildRidesB(game, kit, R, F) {
  const T = (k, f) => { const t0 = performance.now(); f(); (F.times ||= {})[k] = Math.round(performance.now() - t0); };
  T('gravitron', () => saucer(F, kit, RIDES.gravitron, 'gravitron'));
  T('starship', () => saucer(F, kit, RIDES.starship, 'starship'));
  T('zipper', () => zipper(F, kit, RIDES.zipper));
  T('topspin', () => topSpin(F, kit, RIDES.topspin));
  T('tilt', () => tiltAWhirl(F, kit, RIDES.tilt));
  T('himalaya', () => himalaya(F, kit, RIDES.himalaya));
  T('sizzler', () => sizzler(F, kit, RIDES.sizzler));
}

// cycle helper: cumulative travel over many cycles of (wait, up, run, down)
function cyc(t, off, W, UP, RUN, DOWN, vmax, extra = 0) {
  const P = W + UP + RUN + DOWN + extra, n = Math.floor((t + off) / P), c = (t + off) - n * P;
  return { c, P, p: power(c, W, UP, RUN, DOWN), d: n * vmax * (UP / 2 + RUN + DOWN / 2) + travel(c, W, UP, RUN, DOWN, vmax) };
}

// ---- Gravitron / Starship 2000 --------------------------------------------------------
function saucer(F, kit, at, kind) {
  const star = kind === 'starship';
  const { x, z } = at, side = sideOf(z);
  const RS = 7, WH = 3.6, BY = Y + 0.35, NP = 16, DOOR = side > 0 ? 0 : Math.PI, DH = 0.2;
  const shellC = star ? 0x23306a : 0xc8ccd6, trimC = star ? NEON_CYAN : NEON_PURPLE, padC = star ? 0x2a62c9 : 0x7a3ab5;
  kit.cyl(x, Y + 0.12, z, RS + 1.2, 0.24, 0x3a3f4a, { seg: 28, collide: false });
  kit.wedge(x + Math.sin(DOOR) * (RS + 1.4), Y, z + Math.cos(DOOR) * (RS + 1.4), 2.6, 2.8, 0.5, 0x5a5f6a, { yaw: DOOR + Math.PI });
  F.sign(star ? 'STARSHIP 2000' : 'GRAVITRON', x + 6.5, z + side * (RS + 2.6), side > 0 ? 0 : Math.PI, 3.6, star ? '#1f2a5c' : '#c8ccd6', star ? '#6ff6ff' : '#9b3dff');
  // the saucer: floor, wall with a door gap (double-sided), a sloping roof ring, lights
  const b = new Builder();
  b.cyl(RS, RS, 0.3, 0x5a5f6a, [0, 0, 0], null, 32);
  b.add(new THREE.CylinderGeometry(RS, RS, WH, 40, 1, true, DOOR + DH, TAU - 2 * DH), shellC, [0, WH / 2, 0]);
  b.add(new THREE.CylinderGeometry(RS - 0.15, RS - 0.15, WH, 40, 1, true, DOOR + DH, TAU - 2 * DH), 0x2a2a34, [0, WH / 2, 0]);
  b.add(new THREE.CylinderGeometry(2.4, RS + 0.5, 1.8, 40, 1, true), shellC, [0, WH + 0.9, 0]);
  b.add(new THREE.CylinderGeometry(RS + 0.5, RS + 0.5, 0.3, 40, 1, true), trimC, [0, WH + 0.05, 0]);
  b.cyl(2.4, 2.4, 0.25, trimC, [0, WH + 1.8, 0], null, 24);
  for (let k = 0; k < 32; k++) { const a = k / 32 * TAU; b.sphere(0.13, k % 2 ? trimC : BULB, [Math.sin(a) * (RS + 0.55), WH + 0.3, Math.cos(a) * (RS + 0.55)], null, 6); }
  b.cyl(0.9, 1.2, 1.3, 0x333a44, [0, 0.8, 0], null, 12); // operator's console
  b.cyl(0.95, 0.95, 0.2, trimC, [0, 1.5, 0], null, 12);
  if (star) { // rocket fins and a spire
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; b.box(0.25, 2.6, 2.0, 0xd8321e, [Math.sin(a) * (RS + 0.6), 1.3, Math.cos(a) * (RS + 0.6)], [0, a, 0]); }
    b.cone(1.0, 3.6, 0xc8ccd6, [0, WH + 3.6, 0], null, 12);
    b.sphere(0.35, NEON_PINK, [0, WH + 5.5, 0], null, 8);
  } else {
    b.sphere(2.2, 0xc8ccd6, [0, WH + 1.9, 0], [1, 0.5, 1], 16);
    b.sphere(0.4, NEON_PURPLE, [0, WH + 3.0, 0], null, 8);
  }
  const cols = [RAPIER.ColliderDesc.cylinder(0.15, RS)];
  for (let k = 0; k < 14; k++) {
    const a = DOOR + (k + 1) / 15 * TAU, q = new THREE.Quaternion().setFromAxisAngle(AX.y, a);
    cols.push(RAPIER.ColliderDesc.cuboid(1.45, WH / 2, 0.15).setTranslation(Math.sin(a) * RS, WH / 2, Math.cos(a) * RS).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  }
  const saucerBody = F.body({ x, y: BY, z }, cols, b.mesh(matVCDouble));
  // wall pads with the seats: one body that turns with the saucer and slides up the wall at speed
  const pb = new Builder(), pads = F.body({ x, y: BY, z });
  for (let k = 0; k < NP; k++) {
    const a = DOOR + (k + 0.5) / NP * TAU;
    if (Math.abs(Math.atan2(Math.sin(a - DOOR), Math.cos(a - DOOR))) < 0.3) continue;
    place(pb, mat4(Math.sin(a) * (RS - 0.45), 0, Math.cos(a) * (RS - 0.45), new THREE.Quaternion().setFromAxisAngle(AX.y, a)), (t) => {
      rb(t, 1.05, 2.0, 0.22, 0.08, padC, [0, 1.55, 0], [-0.12, 0, 0]);
      rb(t, 0.9, 0.12, 0.5, 0.04, 0x333a44, [0, 0.55, -0.2]);
      rb(t, 0.5, 0.3, 0.15, 0.06, 0x222228, [0, 2.4, -0.05]);
    });
    F.seat(pads, [Math.sin(a) * (RS - 0.85), 0.78, Math.cos(a) * (RS - 0.85)], a + Math.PI, star ? 'Ride Starship 2000' : 'Ride Gravitron', 'Stuck to the wall!', [Math.sin(a) * (RS - 2.6), 0.4, Math.cos(a) * (RS - 2.6)]);
  }
  const padMesh = pb.mesh();
  F.group.add(padMesh);
  F.game.physics.objects.push({ body: pads, mesh: padMesh, buoy: null, kind: 'ride' });
  const W = 12, UP = 6, RUN = 16, DOWN = 7, VM = vmaxFor(8 * TAU, UP, RUN, DOWN), OFF = star ? 21 : 3;
  F.animate(kind, (t) => {
    const k = cyc(t, OFF, W, UP, RUN, DOWN, VM);
    const rise = 1.1 * sstep((k.p - 0.6) / 0.35);
    _q.setFromAxisAngle(AX.y, k.d);
    if (star) { // the whole ship tilts and wobbles at full speed
      const tilt = 0.14 * sstep((k.p - 0.5) / 0.5), ta = t * 0.45;
      _q2.setFromAxisAngle(_v.set(Math.cos(ta), 0, Math.sin(ta)), tilt);
      _q.premultiply(_q2);
    }
    setPose(saucerBody, { x, y: BY, z }, _q);
    _v.set(0, rise, 0).applyQuaternion(_q);
    setPose(pads, { x: x + _v.x, y: BY + _v.y, z: z + _v.z }, _q);
  });
}

// ---- Zipper ---------------------------------------------------------------------------
function zipper(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const AH = 11.5, HL = 8, RC = 2.1, NCAGE = 8, LT = 4 * HL + TAU * RC;
  const yellow = 0xffcf2a, black = 0x23232a;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kitStrut(kit, [x + sx * 4.2, Y, z - side * 3.4 + sz * 1.4], [x, Y + AH, z - side * 1.8], 0.32, black);
  kit.box(x, Y + 0.1, z, 28, 0.2, 10, 0x3a3f4a);
  deck(kit, x, z + side * 2.0, 6, 1.8, 0.6, side, 0x5a5f6a);
  F.sign('ZIPPER', x + 8, z + side * 4.6, side > 0 ? 0 : Math.PI, 3.6, '#ffcf2a', '#1e1e24');
  // the boom (turns about z at the top of the tower)
  const bb = new Builder();
  bb.box(0.9, 2 * HL + 1.2, 0.7, yellow, [0, 0, 0]);
  for (let i = 0; i < 12; i++) bb.box(0.95, 0.35, 0.75, black, [0, -HL + i * (2 * HL / 11), 0]);
  for (const sy of [-1, 1]) { bb.cyl(RC - 0.3, RC - 0.3, 0.3, black, [0, sy * HL, -0.55 * side], [Math.PI / 2, 0, 0], 16); bb.sphere(0.3, BULB2, [0, sy * (HL + 0.8), 0], null, 8); }
  for (const sx of [-1, 1]) { bb.box(0.12, 2 * HL, 0.12, 0x888888, [sx * (RC - 0.2), 0, -0.55 * side]); for (let i = 0; i < 9; i++) bb.sphere(0.12, i % 2 ? BULB : NEON_PINK, [sx * 0.5, -HL + i * HL / 4, 0.4 * side], null, 6); }
  bb.cyl(0.7, 0.7, 1.4, black, [0, 0, -0.4 * side], [Math.PI / 2, 0, 0], 12);
  const boom = F.body({ x, y: Y + AH, z: z - side * 0.9 }, [], bb.mesh());
  // cages: one body each, drawn instanced
  const cages = [];
  for (let i = 0; i < NCAGE; i++) {
    const body = F.body({ x, y: Y + 2, z }, [RAPIER.ColliderDesc.cuboid(0.75, 0.08, 0.6).setTranslation(0, -0.7, 0)]);
    cages.push(body);
    for (const sx of [-0.36, 0.36]) F.seat(body, [sx, -0.3, -0.1 * side], side > 0 ? 0 : Math.PI, 'Ride Zipper', 'Flip out!', [sx, -0.3, side * 1.8]);
  }
  const shell = new Builder(), frame = new Builder();
  rb(shell, 1.6, 0.14, 1.3, 0.05, 0xffffff, [0, -0.72, 0]);
  rb(shell, 1.6, 0.14, 1.3, 0.05, 0xffffff, [0, 0.82, 0]);
  rb(shell, 0.14, 1.6, 1.3, 0.05, 0xffffff, [0.78, 0.05, 0]); rb(shell, 0.14, 1.6, 1.3, 0.05, 0xffffff, [-0.78, 0.05, 0]);
  rb(shell, 1.6, 1.6, 0.12, 0.05, 0xffffff, [0, 0.05, -0.6 * side]);
  for (let i = 0; i < 4; i++) frame.box(0.04, 1.5, 0.04, 0xd0d0d0, [-0.6 + i * 0.4, 0.05, 0.62 * side]);
  for (const sx of [-0.36, 0.36]) { rb(frame, 0.55, 0.15, 0.5, 0.05, black, [sx, -0.52, 0]); rb(frame, 0.55, 0.8, 0.12, 0.05, black, [sx, -0.05, -0.42 * side]); }
  frame.cyl(0.12, 0.12, 0.6, 0x888888, [0, 0.05, -0.9 * side], [Math.PI / 2, 0, 0], 8);
  F.instanced([{ b: shell, tint: true }, { b: frame }], cages, [0xffcf2a, 0xff5a5a, 0x3f8cff, 0x55d85a, 0xff8a1a, 0xb46cff, 0xffcf2a, 0xff5a5a]);
  // the chain path round the boom (boom frame: straights along y at x = +-RC)
  const path = (s) => {
    s = ((s % LT) + LT) % LT;
    if (s < 2 * HL) return [RC, -HL + s];
    s -= 2 * HL;
    if (s < Math.PI * RC) { const a = s / RC; return [RC * Math.cos(a), HL + RC * Math.sin(a)]; }
    s -= Math.PI * RC;
    if (s < 2 * HL) return [-RC, HL - s];
    s -= 2 * HL;
    const a = Math.PI + s / RC;
    return [RC * Math.cos(a), -HL + RC * Math.sin(a)];
  };
  const W = 12, UP = 5, RUN = 18, DOWN = 6, VM = vmaxFor(4 * TAU, UP, RUN, DOWN);
  F.animate('zipper', (t) => {
    const k = cyc(t, 7, W, UP, RUN, DOWN, VM), beta = k.d;
    const chain = 0.45 * t + cyc(t, 7, W, UP, RUN, DOWN, 1.6).d;
    _q.setFromAxisAngle(AX.z, beta);
    setPose(boom, { x, y: Y + AH, z: z - side * 0.9 }, _q);
    const cb = Math.cos(beta), sb = Math.sin(beta);
    cages.forEach((body, i) => {
      const [px, py] = path(chain + i * LT / NCAGE + LT * 0.75 - HL);
      const psi = 0.5 * beta + k.p * 2.5 * Math.sin(0.8 * t + 1.9 * i);
      _q.setFromAxisAngle(AX.z, psi);
      setPose(body, { x: x + px * cb - py * sb, y: Y + AH + px * sb + py * cb, z }, _q);
    });
  });
}

function deck(kit, x, z, w, d, h, side, color) {
  kit.box(x, Y + h / 2, z, w, h, d, color);
  const steps = Math.max(1, Math.round(h / 0.3));
  for (let i = 0; i < steps; i++) { const sh = h * (i + 1) / steps; kit.box(x, Y + sh / 2, z + side * (d / 2 + (steps - i - 0.5) * 0.45), 2.4, sh, 0.45, color); }
}

// ---- Top Spin -------------------------------------------------------------------------
function topSpin(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const HP = 6.9, LA = 5.3, NS = 10, pink = 0xff4fa3, black = 0x23232a;
  kit.box(x, Y + 0.1, z, 18, 0.2, 12, 0x3a3f4a);
  for (const sz of [-1, 1]) {
    kit.box(x, Y + HP / 2, z + sz * 3.9, 1.3, HP, 1.4, black);
    kit.box(x, Y + HP + 0.2, z + sz * 3.9, 1.8, 0.6, 1.8, pink);
    for (let i = 0; i < 6; i++) kit.sphere(x + 0.7, Y + 0.8 + i * 1.0, z + sz * 3.9, 0.12, i % 2 ? NEON_PINK : BULB, { seg: 6 });
  }
  kit.box(x + 3.0, Y + 0.18, z, 2.6, 0.36, 7.2, 0x5a5f6a);
  F.sign('TOP SPIN', x + 5.5, z + side * 5.2, side > 0 ? 0 : Math.PI, 3.6, '#ff4fa3', '#ffffff');
  const ab = new Builder();
  for (const sz of [-1, 1]) {
    ab.box(0.5, LA + 2.6, 0.4, pink, [0, -(LA - 2.6) / 2, sz * 3.0]);
    ab.box(1.4, 1.6, 0.6, black, [0, 2.2, sz * 3.0]);       // counterweight
    ab.cyl(0.55, 0.55, 0.5, black, [0, 0, sz * 3.2], [Math.PI / 2, 0, 0], 12);
    for (let i = 0; i < 5; i++) ab.sphere(0.1, i % 2 ? BULB : NEON_PINK, [0.27, -i * 1.1, sz * 3.0], null, 6);
  }
  const arms = F.body({ x, y: Y + HP, z }, [], ab.mesh());
  const gb = new Builder();
  gb.box(1.2, 0.3, 5.6, black, [0, -0.35, 0]);
  gb.box(0.25, 1.6, 5.6, pink, [-0.55, 0.45, 0]);
  for (const sz of [-1, 1]) gb.cyl(0.35, 0.35, 0.5, black, [0, 0, sz * 2.8], [Math.PI / 2, 0, 0], 10);
  const gondola = F.body({ x, y: Y + HP - LA, z }, [RAPIER.ColliderDesc.cuboid(0.6, 0.15, 2.8).setTranslation(0, -0.35, 0)], null);
  for (let i = 0; i < NS; i++) {
    const sz = -2.25 + i * 0.5;
    rb(gb, 0.5, 0.12, 0.44, 0.04, AUTUMN[i % AUTUMN.length], [0.05, -0.12, sz]);
    rb(gb, 0.12, 0.75, 0.44, 0.04, AUTUMN[i % AUTUMN.length], [-0.3, 0.3, sz]);
    gb.torus(0.26, 0.05, 0xffd23f, [0.15, 0.4, sz], [0, Math.PI / 2, 0], 10);
    F.seat(gondola, [0.05, 0.08, sz], Math.PI / 2, 'Ride Top Spin', 'Upside down!', [1.8, 0.0, sz]);
  }
  const gm = gb.mesh();
  F.group.add(gm);
  F.game.physics.objects.push({ body: gondola, mesh: gm, buoy: null, kind: 'ride' });
  const W = 11, UP = 10, RUN = 16, DOWN = 9, P = W + UP + RUN + DOWN;
  F.animate('topspin', (t) => {
    const c = (t + 13) % P, pw = power(c, W, UP, RUN, DOWN), ph = 0.78 * Math.max(0, c - W);
    const al = 2.85 * pw * Math.sin(ph);
    const psi = al + 2.4 * pw * Math.sin(ph - 1.3);
    _q.setFromAxisAngle(AX.z, al);
    setPose(arms, { x, y: Y + HP, z }, _q);
    _q2.setFromAxisAngle(AX.z, psi);
    setPose(gondola, { x: x + Math.sin(al) * LA, y: Y + HP - Math.cos(al) * LA, z }, _q2);
  });
}

// ---- Tilt-a-Whirl -----------------------------------------------------------------------
function tiltAWhirl(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const RP = 9.2, RT = 6.2, NT = 7, PY = Y + 0.35, HILL = 0.45;
  const red = 0xd8321e, cream = 0xf6ead0;
  kit.cyl(x, Y + 0.175, z, RP, 0.35, 0x8a6a4a, { seg: 36 });
  const b0 = kit.b(x, z);
  for (let k = 0; k < 24; k++) b0.add(new THREE.CylinderGeometry(RP + 0.02, RP + 0.02, 0.36, 8, 1, true, k * TAU / 24, TAU / 48), k % 2 ? red : cream, [x, Y + 0.175, z]);
  // the hilly track the tubs ride over
  const yAt = (a) => PY + 0.15 + HILL * (1 - Math.cos(3 * a));
  const pts = [];
  for (let i = 0; i < 96; i++) { const a = i / 96 * TAU; pts.push(new THREE.Vector3(x + Math.sin(a) * RT, yAt(a) - 0.2, z + Math.cos(a) * RT)); }
  for (const dr of [-0.9, 0.9]) {
    const p2 = pts.map((p) => { const a = Math.atan2(p.x - x, p.z - z); return new THREE.Vector3(x + Math.sin(a) * (RT + dr), p.y, z + Math.cos(a) * (RT + dr)); });
    b0.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p2, true), 96, 0.12, 5, true), 0x9a9aa0);
  }
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; kit.deco(x + Math.sin(a) * RT, (PY + yAt(a) - 0.2) / 2, z + Math.cos(a) * RT, 0.25, yAt(a) - 0.2 - PY + 0.1, 0.25, 0x555a66); }
  kit.cyl(x, Y + 1.6, z, 1.3, 2.6, red, { seg: 16 });
  kit.cone(x, Y + 3.4, z, 1.5, 1.2, 0xffd23f, { seg: 16 });
  F.sign('TILT-A-WHIRL', x, z + side * (RP + 1.8), side > 0 ? 0 : Math.PI, 3.6, '#d8321e', '#ffffff');
  const hb = new Builder();
  for (let i = 0; i < NT; i++) { const a = i / NT * TAU; hb.box(0.25, 0.2, 3.6, 0x9a9aa0, [Math.sin(a) * 2.8, 0, Math.cos(a) * 2.8], [0, a, 0]); }
  hb.cyl(1.6, 1.6, 0.35, 0xffd23f, [0, 0, 0], null, 16);
  const hub = F.body({ x, y: Y + 3.2, z }, [], hb.mesh());
  const tubs = [], spin = new Float32Array(NT), psi = new Float32Array(NT);
  for (let i = 0; i < NT; i++) {
    const body = F.body({ x, y: PY + 1, z }, [RAPIER.ColliderDesc.cuboid(1.05, 0.1, 1.05)]);
    tubs.push(body);
    for (const [sx, sz] of [[-0.55, 0.05], [0, -0.1], [0.55, 0.05]]) F.seat(body, [sx, 0.62, sz], 0, 'Ride Tilt-a-Whirl', 'Spin it!', [0, 0.3, 1.8]);
    psi[i] = i * 1.3;
  }
  const shell = new Builder(), frame = new Builder();
  for (let k = 0; k < 9; k++) { // a round tub open at the front (+z)
    const a = Math.PI * 0.35 + k / 8 * Math.PI * 1.3;
    rb(shell, 0.62, 1.05, 0.16, 0.06, 0xffffff, [Math.sin(a) * 1.15, 0.55, Math.cos(a) * 1.15], [0, a, 0]);
  }
  shell.torus(1.15, 0.1, 0xffffff, [0, 1.08, 0], [Math.PI / 2, 0, 0], 20);
  frame.cyl(1.25, 1.25, 0.2, 0x333a44, [0, 0, 0], null, 20);
  rb(frame, 1.7, 0.3, 0.55, 0.1, cream, [0, 0.3, -0.15]);
  frame.cyl(0.08, 0.08, 0.6, 0xd0d0d0, [0, 0.55, 0.45], [0, 0, Math.PI / 2], 6);
  frame.cyl(0.25, 0.25, 0.6, 0x9a9aa0, [0, -0.35, 0], null, 8);
  F.instanced([{ b: shell, tint: true }, { b: frame }], tubs, [0xd8321e, 0xffd23f, 0x3f8cff, 0x55d85a, 0xff8a1a, 0xb46cff, 0xff7fc8]);
  const W = 10, UP = 5, RUN = 20, DOWN = 6, VM = vmaxFor(3 * TAU, UP, RUN, DOWN);
  let prev = null;
  F.animate('tilt', (t, dt) => {
    const k = cyc(t, 2, W, UP, RUN, DOWN, VM), A = k.d;
    const w = prev == null ? 0 : (A - prev) / Math.max(dt, 1e-3);
    prev = A;
    _q.setFromAxisAngle(AX.y, A);
    setPose(hub, { x, y: Y + 3.2, z }, _q);
    tubs.forEach((body, i) => {
      const a = A + i / NT * TAU;
      // the hills make the tubs whirl: spin driven by the slope under them, with some drag
      spin[i] += (5.2 * w * Math.sin(3 * a + 0.7 + i) - 0.8 * spin[i]) * dt;
      spin[i] = Math.max(-4.5, Math.min(4.5, spin[i]));
      psi[i] += spin[i] * dt;
      const slope = HILL * 3 * Math.sin(3 * a) / RT;
      ypr(_q, a + Math.PI / 2, -Math.atan(slope));
      _q.multiply(_q2.setFromAxisAngle(AX.y, psi[i]));
      setPose(body, { x: x + Math.sin(a) * RT, y: yAt(a) + 0.35, z: z + Math.cos(a) * RT }, _q);
    });
  });
}

// ---- Himalaya -------------------------------------------------------------------------
function himalaya(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const RT = 9, NC = 12, A0 = side > 0 ? 0 : Math.PI, ice = 0x9fd0ff;
  const yAt = (a) => Y + 0.9 + 0.38 * (1 - Math.cos(4 * (a - A0))) + 0.6 * (1 - Math.cos(a - A0));
  const slopeAt = (a) => (0.38 * 4 * Math.sin(4 * (a - A0)) + 0.6 * Math.sin(a - A0)) / RT;
  kit.cyl(x, Y + 0.12, z, RT + 2.6, 0.24, 0xe8eef6, { seg: 36 });
  // the hilly track on posts, with a lit snowy rim
  const pts = [], pts2 = [];
  for (let i = 0; i < 120; i++) { const a = i / 120 * TAU; for (const [arr, r] of [[pts, RT - 0.55], [pts2, RT + 0.55]]) arr.push(new THREE.Vector3(x + Math.sin(a) * r, yAt(a) - 0.25, z + Math.cos(a) * r)); }
  const b0 = kit.b(x, z);
  for (const p of [pts, pts2]) b0.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p, true), 120, 0.14, 5, true), 0x6a7a8a);
  for (let i = 0; i < 30; i++) {
    const a = i / 30 * TAU, px = x + Math.sin(a) * RT, pz = z + Math.cos(a) * RT, h = yAt(a) - 0.25 - Y;
    kit.deco(px, Y + h / 2, pz, 0.3, h, 0.3, 0x4a5a6a);
    kit.sphere(x + Math.sin(a) * (RT + 1.6), Y + 0.5, z + Math.cos(a) * (RT + 1.6), 0.14, i % 2 ? NEON_CYAN : BULB, { seg: 6 });
  }
  // the mountains in the middle
  kit.cyl(x, Y + 0.6, z, 5.2, 1.2, 0x5a6a7a, { seg: 20 });
  for (const [dx, dz, r, h] of [[0, 0, 3.6, 6.5], [2.2, 1.4, 2.2, 4.2], [-2.4, 1.0, 2.4, 4.6], [0.8, -2.4, 2.0, 3.8], [-1.6, -2.0, 1.8, 3.4]]) {
    kit.cone(x + dx, Y + 1.2 + h / 2, z + dz, r, h, 0x7a8aa8, { seg: 7 });
    kit.cone(x + dx, Y + 1.2 + h * 0.83, z + dz, r * 0.36, h * 0.34, 0xffffff, { seg: 7 });
  }
  kit.cyl(x, Y + 1.2, z, 5.3, 0.3, ice, { seg: 20, collide: false });
  // boarding deck at the low point (midway side)
  const dx = Math.sin(A0), dz = Math.cos(A0);
  kit.box(x + dx * (RT + 2.2), Y + 0.35, z + dz * (RT + 2.2), 9, 0.7, 2.2, 0x5a5f6a, { yaw: A0 });
  F.sign('HIMALAYA', x + 8, z + side * (RT + 4.4), side > 0 ? 0 : Math.PI, 3.6, '#f2f6ff', '#3f8cff');
  const cars = [];
  for (let i = 0; i < NC; i++) {
    const body = F.body({ x, y: Y + 1.5, z }, [RAPIER.ColliderDesc.cuboid(0.85, 0.12, 1.1).setTranslation(0, 0.05, 0)]);
    cars.push(body);
    for (const sx of [-0.38, 0.38]) F.seat(body, [sx, 0.6, -0.15], 0, 'Ride Himalaya', 'Do you wanna go faster?!', [-1.9, 0.3, 0]);
  }
  const shell = new Builder(), frame = new Builder();
  rb(shell, 1.7, 0.5, 2.3, 0.2, 0xffffff, [0, 0.1, 0]);
  rb(shell, 1.7, 0.75, 0.4, 0.15, 0xffffff, [0, 0.55, 1.0]);
  rb(shell, 1.7, 1.3, 0.25, 0.1, 0xffffff, [0, 0.85, -1.0]);
  rb(frame, 1.4, 0.12, 1.2, 0.04, 0x222228, [0, 0.37, -0.15]);
  frame.cyl(0.05, 0.05, 1.5, 0xd0d0d0, [0, 0.85, 0.55], [0, 0, Math.PI / 2], 6);
  frame.sphere(0.12, BULB, [0.6, 1.5, -1.0], null, 6); frame.sphere(0.12, NEON_CYAN, [-0.6, 1.5, -1.0], null, 6);
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.8, 0.8]) frame.cyl(0.15, 0.15, 0.12, 0x333333, [sx, -0.18, sz], [0, 0, Math.PI / 2], 8);
  F.instanced([{ b: shell, tint: true }, { b: frame }], cars, [0x3f8cff, 0xffffff, 0xd8321e, 0x3fe0d0, 0xb46cff, 0xffd23f]);
  const W = 10, UP = 5, RUN = 14, DOWN = 5, PAUSE = 3, BRUN = 12, VM = 1.25;
  const P = W + UP + RUN + DOWN + PAUSE + UP + BRUN + DOWN;
  const fwd = VM * (UP / 2 + RUN + DOWN / 2), back = VM * (UP / 2 + BRUN + DOWN / 2);
  F.animate('himalaya', (t) => {
    const n = Math.floor((t + 4) / P), c = (t + 4) - n * P;
    const c2 = c - (W + UP + RUN + DOWN + PAUSE);
    const A = n * (fwd - back) + travel(c, W, UP, RUN, DOWN, VM) - (c2 > 0 ? travel(c2, 0, UP, BRUN, DOWN, VM) : 0);
    const sp = power(c, W, UP, RUN, DOWN) + (c2 > 0 ? power(c2, 0, UP, BRUN, DOWN) : 0);
    cars.forEach((body, i) => {
      const a = A + i / NC * TAU;
      ypr(_q, a + Math.PI / 2, -Math.atan(slopeAt(a)), -0.16 * sp);
      setPose(body, { x: x + Math.sin(a) * RT, y: yAt(a), z: z + Math.cos(a) * RT }, _q);
    });
  });
}

// ---- Sizzler ----------------------------------------------------------------------------
function sizzler(F, kit, at) {
  const { x, z } = at, side = sideOf(z);
  const RA = 5.6, RCL = 1.95, orange = 0xff8a1a, yellow = 0xffd23f;
  kit.cyl(x, Y + 0.15, z, RA + RCL + 2.6, 0.3, 0x5a5f6a, { seg: 36 });
  for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; kit.sphere(x + Math.sin(a) * (RA + RCL + 2.5), Y + 0.4, z + Math.cos(a) * (RA + RCL + 2.5), 0.13, k % 2 ? BULB2 : yellow, { seg: 6 }); }
  kit.cyl(x, Y + 1.6, z, 0.9, 3.2, orange, { seg: 14 });
  F.sign('SIZZLER', x + 7, z + side * (RA + RCL + 3.6), side > 0 ? 0 : Math.PI, 3.6, '#ff8a1a', '#ffe04a');
  const hb = new Builder();
  hb.cyl(1.3, 1.3, 0.6, yellow, [0, 0, 0], null, 16);
  hb.cone(1.4, 1.2, orange, [0, 0.9, 0], null, 16);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU;
    strut(hb, [0, 0.1, 0], [Math.sin(a) * RA, -0.9, Math.cos(a) * RA], 0.22, orange, 8);
    hb.cyl(0.35, 0.35, 0.8, yellow, [Math.sin(a) * RA, -1.0, Math.cos(a) * RA], null, 10);
    for (let i = 1; i < 5; i++) hb.sphere(0.11, i % 2 ? BULB : BULB2, [Math.sin(a) * RA * i / 5, 0.1 - i / 5, Math.cos(a) * RA * i / 5], null, 6);
  }
  const hub = F.body({ x, y: Y + 3.0, z }, [], hb.mesh());
  const clusters = [];
  for (let k = 0; k < 3; k++) {
    const body = F.body({ x, y: Y + 0.65, z }, [RAPIER.ColliderDesc.cylinder(0.08, RCL + 0.6)]);
    clusters.push(body);
    for (let j = 0; j < 4; j++) {
      const a = j / 4 * TAU, ox = Math.sin(a), oz = Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a);
      for (const l of [-0.38, 0.38]) F.seat(body, [ox * RCL + tx * l, 0.65, oz * RCL + tz * l], a, 'Ride Sizzler', 'Sizzle!', [ox * (RCL + 1.6) + tx * l, 0.3, oz * (RCL + 1.6) + tz * l]);
    }
  }
  const shell = new Builder(), frame = new Builder();
  frame.cyl(RCL + 0.6, RCL + 0.6, 0.16, 0x333a44, [0, 0, 0], null, 20);
  frame.cyl(0.25, 0.3, 1.7, 0x9a9aa0, [0, 0.85, 0], null, 8);
  for (let j = 0; j < 4; j++) {
    const a = j / 4 * TAU;
    place(shell, mat4(Math.sin(a) * RCL, 0, Math.cos(a) * RCL, new THREE.Quaternion().setFromAxisAngle(AX.y, a)), (t) => {
      rb(t, 1.5, 0.35, 1.2, 0.15, 0xffffff, [0, 0.25, 0.05]);
      rb(t, 1.5, 0.95, 0.25, 0.1, 0xffffff, [0, 0.7, -0.5]);
      rb(t, 1.5, 0.5, 0.2, 0.08, 0xffffff, [0, 0.5, 0.6]);
    });
    place(frame, mat4(Math.sin(a) * RCL, 0, Math.cos(a) * RCL, new THREE.Quaternion().setFromAxisAngle(AX.y, a)), (t) => {
      rb(t, 1.3, 0.1, 0.6, 0.04, 0x222228, [0, 0.43, -0.1]);
      t.cyl(0.05, 0.05, 1.3, 0xd0d0d0, [0, 0.85, 0.4], [0, 0, Math.PI / 2], 6);
    });
  }
  F.instanced([{ b: shell, tint: true }, { b: frame }], clusters, [0xff8a1a, 0xd8321e, 0xffd23f]);
  const W = 10, UP = 5, RUN = 18, DOWN = 6, VM = vmaxFor(4 * TAU, UP, RUN, DOWN);
  F.animate('sizzler', (t) => {
    const k = cyc(t, 9, W, UP, RUN, DOWN, VM), A = k.d;
    _q.setFromAxisAngle(AX.y, A);
    setPose(hub, { x, y: Y + 3.0, z }, _q);
    clusters.forEach((body, i) => {
      const a = A + i / 3 * TAU;
      _q.setFromAxisAngle(AX.y, -2 * A + i);
      setPose(body, { x: x + Math.sin(a) * RA, y: Y + 0.65, z: z + Math.cos(a) * RA }, _q);
    });
  });
}
