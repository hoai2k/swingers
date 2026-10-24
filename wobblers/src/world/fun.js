// Outdoor toys: rideable shopping trolleys, wheelie bins you can hide in,
// beach balls, vending machines, a can-toss stall and a bowling lane at the
// fun park, a rope swing and log rafts on the lake, and a zip line from the
// mountain lookout down to the lake.
import * as THREE from 'three';
import { RAPIER, yawQuat } from '../physics.js';
import { DT, SEA_LEVEL, groups, G_VEH, G_STATIC, ALL } from '../config.js';
import { Builder, signMesh } from '../mesh.js';
import { LAKE, MOUNTAIN } from '../terrain.js';
import { addSeat } from './playground.js';
import { Local, NO_STATIC, VEH_GROUPS, useSpot, throwable, lob, place, chime, clunk, tone, liveSign, groundAt as heightAt } from './common.js';
import { furn } from './furniture.js';
import { vendingMachine } from './music.js';

const C = RAPIER.ColliderDesc;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

export function buildFun(game, kit) {
  game.groundAt = heightAt; // exact terrain-mesh height (see common.js groundAt)
  const W0 = new Local(kit, 0, 0, 0);
  // vending machines around the island
  vendingMachine(game, W0, 90, 71.2, 0, 0x3f8cff);           // pool lawn
  vendingMachine(game, W0, -246, -11.6, 0, 0x55d85a);        // fun park, by DRINKS
  vendingMachine(game, W0, -22.6, 297, Math.PI / 2, 0xff8a3d); // beach car park
  // trolleys in the sports-field car park and outside the market
  for (let i = 0; i < 3; i++) trolley(game, -100 + i * 0.8, -131.5, Math.PI);
  bins(game);
  beachBalls(game);
  canToss(game, kit);
  bowling(game, kit);
  ropeSwing(game, kit);
  rafts(game);
  zipLine(game, kit);
}

// ---- shopping trolley: push it, grab it, or hop in (Y) for a ride -----------
export function trolley(game, x, z, yaw) {
  const b = new Builder();
  b.box(0.62, 0.05, 0.92, 0xbbbbbb, [0, -0.17, 0]);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) b.box(0.03, 0.03, 0.92, 0xcccccc, [s * 0.31, -0.1 + k * 0.13, 0]);
    for (let k = 0; k < 4; k++) b.box(0.62, 0.03, 0.03, 0xcccccc, [0, -0.1 + k * 0.13, s * 0.46]);
    b.box(0.03, 0.5, 0.03, 0xcccccc, [s * 0.31, 0.08, 0.46]); b.box(0.03, 0.5, 0.03, 0xcccccc, [s * 0.31, 0.08, -0.46]);
    b.cyl(0.02, 0.02, 0.5, 0x999999, [s * 0.25, -0.38, 0], [Math.PI / 2, 0, 0], 5);
  }
  b.cyl(0.035, 0.035, 0.66, 0xff3a3a, [0, 0.42, -0.62], [0, 0, Math.PI / 2], 8);
  for (const s of [-1, 1]) b.box(0.03, 0.03, 0.2, 0xcccccc, [s * 0.3, 0.38, -0.54]);
  for (const [wx, wz] of [[-0.25, -0.38], [0.25, -0.38], [-0.25, 0.38], [0.25, 0.38]]) b.cyl(0.07, 0.07, 0.04, 0x222222, [wx, -0.4, wz], [0, 0, Math.PI / 2], 10);
  const o = game.physics.dynamic({ x, y: 0.5, z }, [
    C.cuboid(0.31, 0.27, 0.46).setTranslation(0, 0.02, 0).setMass(9).setFriction(0.04),
    C.cuboid(0.31, 0.03, 0.12).setTranslation(0, 0.4, -0.56).setMass(0.5),
  ], b.mesh(), { rot: yawQuat(yaw), groups: VEH_GROUPS, angDamp: 0.8, linDamp: 0.15 });
  game.scene.add(o.mesh);
  addSeat(game, { body: o.body, pos: [0, 0.12, 0.08], yaw: 0, label: 'Ride trolley', hint: 'Get someone to push! · Y exit', exit: [0.9, 0.1, 0] });
  return o;
}

// ---- wheelie bins: flip the lid, push them over, or hide inside -------------
function bins(game) {
  const W = game.physics.world;
  const spots = [];
  for (const t of [78, 114]) for (const s of [-1, 1]) {
    // beside the garden gate, away from the mailbox
    spots.push([t + s * 3.5, s * 7.2, s > 0 ? Math.PI : 0], [-(t - s * 3.5), s * 7.2, s > 0 ? Math.PI : 0], [s * 7.2, t - s * 3.5, s > 0 ? -Math.PI / 2 : Math.PI / 2]);
  }
  const cols = [0x3a8a4a, 0x3a5a9a, 0x555555, 0x8a5a2a];
  spots.forEach(([x, z, yaw], i) => {
    const col = cols[i % cols.length];
    const b = new Builder();
    b.rbox(0.66, 0.98, 0.72, 0.04, col, [0, 0, 0]);
    b.box(0.5, 0.06, 0.06, new THREE.Color(col).multiplyScalar(0.7).getHex(), [0, 0.3, 0.37]);
    for (const s of [-1, 1]) b.cyl(0.1, 0.1, 0.06, 0x222222, [s * 0.3, -0.46, -0.3], [0, 0, Math.PI / 2], 10);
    const rot = yawQuat(yaw);
    const o = game.physics.dynamic({ x, y: 0.56, z }, [C.cuboid(0.33, 0.49, 0.36).setMass(10).setFriction(0.5)], b.mesh(), { rot, groups: VEH_GROUPS, angDamp: 0.5 });
    game.scene.add(o.mesh);
    const lb = new Builder();
    lb.rbox(0.72, 0.06, 0.78, 0.02, new THREE.Color(col).multiplyScalar(0.8).getHex(), [0, 0, 0.39]);
    lb.box(0.3, 0.05, 0.08, 0x222222, [0, 0.04, 0.75]);
    const lid = game.physics.dynamic({ x: x - Math.sin(yaw) * 0.37, y: 1.08, z: z - Math.cos(yaw) * 0.37 }, [C.cuboid(0.36, 0.03, 0.39).setTranslation(0, 0, 0.39).setMass(1)], lb.mesh(), { rot, kind: 'contraption', buoy: null, angDamp: 0.4 });
    game.scene.add(lid.mesh);
    const j = W.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0.52, z: -0.37 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), o.body, lid.body, true);
    j.setContactsEnabled?.(false);
    j.setLimits(-2.6, 0);
    addSeat(game, {
      body: o.body, pos: [0, -0.02, 0.02], yaw: 0, label: 'Hide in bin', hint: 'Shh… · Y exit', exit: [0, 0, 0.95],
      onEnter: () => lid.body.applyImpulseAtPoint({ x: 0, y: 3, z: 0 }, lid.body.translation(), true),
    });
  });
}

// ---- beach balls --------------------------------------------------------------
function beachBalls(game) {
  const spots = [[-75, 314], [-52, 320], [-12, 316], [8, 322], [52, 318], [82, 314], [96, 86], [118, 114]];
  spots.forEach(([x, z], i) => {
    const b = new Builder(), r = 0.55;
    const cols = [0xff3a3a, 0xffd23f, 0x3f8cff, 0xffffff, 0x55d85a, 0xff8a3d];
    for (let k = 0; k < 6; k++) b.add(new THREE.SphereGeometry(r, 12, 10, k * Math.PI / 3, Math.PI / 3), cols[(k + i) % 6], [0, 0, 0]);
    b.sphere(0.12, 0xffffff, [0, r - 0.06, 0], [1, 0.4, 1], 8);
    const y = Math.max(0, heightAt(x, z)) + r + 0.05;
    const o = game.physics.dynamic({ x, y, z }, [C.ball(r).setMass(0.3).setRestitution(0.85).setFriction(0.6)], b.mesh(), { linDamp: 0.35, angDamp: 0.3, buoy: { r, volume: 0.5, drag: 14 } });
    game.scene.add(o.mesh);
    throwable(game, o, { r, speed: 8, up: 0.75 });
  });
}

// ---- carnival can toss -----------------------------------------------------------
function canToss(game, kit) {
  const L = new Local(kit, -220, 14.5, Math.PI); // front (local +Z) faces the main path (-z)
  const shelfY = 1.0, counterZ = 1.7;
  // booth
  L.box(0, 1.6, -1.9, 4.4, 3.2, 0.2, 0xffffff);
  for (const sx of [-2.1, 2.1]) { L.box(sx, 1.6, -0.2, 0.2, 3.2, 3.6, 0xffffff); L.cyl(sx, 1.6, counterZ + 0.1, 0.08, 3.2, 0xffd23f); }
  for (let i = 0; i < 6; i++) L.deco(-1.83 + i * 0.73, 3.35, 0, 0.73, 0.15, 4.0, i % 2 ? 0xffffff : 0xff3a3a);
  L.box(0, shelfY / 2, -1.2, 3.8, shelfY, 0.7, 0x8a5a3a);
  L.box(0, 0.5, counterZ, 4.0, 1.0, 0.5, 0xff3a3a);
  L.deco(0, 1.01, counterZ, 4.0, 0.03, 0.5, 0xffd23f);
  const s = signMesh('KNOCK EM DOWN!', 3.8, '#ff3a3a');
  const sp = L.v3(0, 3.95, counterZ + 0.15); s.position.set(sp.x, sp.y, sp.z); s.rotation.y = L.yaw; game.scene.add(s);
  // prize shelf on the back wall
  for (let i = 0; i < 5; i++) L.sphere(-1.6 + i * 0.8, 2.3, -1.65, 0.22, [0xff7fc8, 0x6ac8ff, 0xffd23f, 0x55d85a, 0xb46cff][i]);
  // two pyramids of cans
  const R = 0.12, H = 0.3;
  const cans = [];
  const piles = [-0.9, 0.9];
  piles.forEach((px, pi) => {
    const rows = [3, 2, 1];
    rows.forEach((n, r) => {
      for (let k = 0; k < n; k++) {
        const lx = px + (k - (n - 1) / 2) * (2 * R + 0.02), y = shelfY + H / 2 + r * (H + 0.005) + 0.005;
        const home = L.v3(lx, y, -1.2);
        const b = new Builder(), col = [0xd9d9d9, 0xff5a5a, 0x3f8cff][(k + r) % 3];
        b.cyl(R, R, H, col, [0, 0, 0], null, 12);
        b.cyl(R + 0.005, R + 0.005, 0.06, 0xffffff, [0, 0, 0], null, 12);
        const o = game.physics.dynamic(home, [C.cylinder(H / 2, R).setMass(0.3).setFriction(0.5)], b.mesh(), { kind: 'contraption', angDamp: 0.2 });
        game.scene.add(o.mesh);
        cans.push({ o, home, pile: pi });
      }
    });
  });
  // balls on the counter, punched toward the nearest pile
  const balls = [];
  for (let i = 0; i < 4; i++) {
    const home = L.v3(-1.2 + i * 0.8, 1.0 + 0.16, counterZ);
    const b = new Builder();
    b.sphere(0.15, 0xffffff, [0, 0, 0], null, 12); b.torus(0.15, 0.012, 0xff3a3a, [0, 0, 0], [Math.PI / 2, 0, 0]);
    const o = game.physics.dynamic(home, [C.ball(0.15).setMass(0.6).setRestitution(0.4)], b.mesh(), { kind: 'contraption', ccd: true });
    game.scene.add(o.mesh);
    balls.push({ o, home });
    throwable(game, o, {
      r: 0.16, speed: 10, up: 0.1,
      aim: (p, body) => {
        const t = body.translation();
        let best = null, bd = 1e9;
        for (const px of piles) {
          const tp = L.v3(px, shelfY + 0.45, -1.2), d = Math.hypot(tp.x - t.x, tp.z - t.z);
          const ang = Math.atan2(tp.x - t.x, tp.z - t.z) - p.yaw, da = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
          if (d < 8 && da < 0.9 && d < bd) { bd = d; best = tp; }
        }
        if (!best) return null;
        const v = lob(t, { x: best.x + (Math.random() - 0.5) * 0.25, y: best.y + (Math.random() - 0.5) * 0.2, z: best.z }, 0.12);
        if (v) { const k = 1.15; v.x *= k; v.z *= k; v.y = v.y * k + 0.6; }
        return v;
      },
    });
  }
  const prizes = [];
  let won = [false, false], resetT = -1;
  const reset = () => {
    for (const c of cans) place(c.o.body, c.home);
    for (const b of balls) place(b.o.body, b.home);
    won = [false, false]; resetT = -1;
  };
  const rp = L.v3(2.45, 1.0, counterZ + 0.6);
  useSpot(game, rp.x, rp.y, rp.z, 'Reset cans', () => { reset(); clunk(game, rp, 0.4); });
  let tick = 0;
  game.steppers.push(() => {
    if (resetT > 0 && (resetT -= DT) <= 0) reset();
    if (++tick % 20) return;
    for (let pi = 0; pi < 2; pi++) {
      if (won[pi]) continue;
      const mine = cans.filter((c) => c.pile === pi);
      const down = mine.every((c) => { const t = c.o.body.translation(); return t.y < shelfY + 0.1 || Math.hypot(t.x - c.home.x, t.z - c.home.z) > 0.6; });
      if (!down) continue;
      won[pi] = true;
      const pp = L.v3(piles[pi], 1.6, counterZ);
      chime(game, pp);
      // a teddy bear prize pops onto the counter
      let t;
      if (prizes.length < 3) { t = furn(game, 'teddy', pp.x, 1.05, pp.z, L.yaw, [0xff7fc8, 0x6ac8ff, 0xffd23f][prizes.length]); prizes.push(t); throwable(game, t, { r: 0.35, speed: 6, up: 0.6 }); }
      else { t = prizes.shift(); prizes.push(t); place(t.body, { x: pp.x, y: 1.45, z: pp.z }); }
      t.body.setLinvel({ x: 0, y: 3, z: 0 }, true);
      if (won[0] && won[1]) resetT = 6;
      else resetT = Math.max(resetT, 10);
    }
  });
}

// ---- bowling lane ------------------------------------------------------------------
function bowling(game, kit) {
  const L = new Local(kit, -223, 70, -Math.PI / 2); // local +Z runs down the lane (world -x), between the park paths
  const LEN = 19, LW = 1.6, pinZ = 17.6;
  // approach + lane + bumpers + pin deck + back cushion
  L.deco(0, 0.03, -2.5, 4.5, 0.06, 5, 0xd9b07a);
  L.box(0, 0.05, LEN / 2, LW, 0.1, LEN, 0xe9c48a, { friction: 0.25 });
  for (let k = 0; k < 7; k++) L.deco(-0.6 + k * 0.2, 0.105, 4.5, 0.06, 0.01, 0.4, 0x8a5a3a, { yaw: 0 });
  L.deco(0, 0.105, 0.02, LW, 0.01, 0.06, 0xd9534f);
  for (const sd of [-1, 1]) {
    L.box(sd * (LW / 2 + 0.12), 0.18, LEN / 2, 0.24, 0.36, LEN, 0x3f8cff, { restitution: 0.5 });
    L.box(sd * (LW / 2 + 0.4), 1.0, pinZ, 0.3, 2.0, 4.0, 0x2a62c9);
  }
  L.box(0, 0.6, LEN + 0.4, LW + 1.1, 1.2, 0.6, 0x222222, { restitution: 0.05 });
  L.box(0, 2.3, pinZ + 0.4, LW + 1.1, 0.6, 3.0, 0x2a62c9);
  // bench + ball rack
  L.box(-2.0, 0.25, -3.5, 0.6, 0.5, 2.2, 0xff5a5a);
  L.box(1.6, 0.25, -1.4, 0.6, 0.5, 1.6, 0x666666);
  const sign = signMesh('BOWLING', 3.0, '#2a62c9');
  let sp = L.v3(0, 2.9, pinZ - 1.12); sign.position.set(sp.x, sp.y, sp.z); sign.rotation.y = L.yaw + Math.PI; game.scene.add(sign);
  const board = liveSign(game, 2.0, 0.6, '#112', '#ffd23f');
  sp = L.v3(0, 1.75, pinZ - 1.12); board.mesh.position.set(sp.x, sp.y, sp.z); board.mesh.rotation.y = L.yaw + Math.PI;
  board.set('BOWL!');
  // pins
  const pins = [];
  const rows = [[0], [-0.15, 0.15], [-0.3, 0, 0.3], [-0.45, -0.15, 0.15, 0.45]];
  rows.forEach((row, r) => row.forEach((lx) => {
    const home = L.v3(lx, 0.1 + 0.3, pinZ + r * 0.26);
    const b = new Builder();
    b.cyl(0.06, 0.09, 0.26, 0xffffff, [0, -0.1, 0], null, 10);
    b.sphere(0.1, 0xffffff, [0, -0.13, 0], [1, 1.3, 1], 10);
    b.cyl(0.045, 0.06, 0.16, 0xffffff, [0, 0.1, 0], null, 10);
    b.sphere(0.065, 0xffffff, [0, 0.21, 0], null, 10);
    b.cyl(0.052, 0.052, 0.03, 0xff3a3a, [0, 0.12, 0], null, 10);
    const o = game.physics.dynamic(home, [C.cylinder(0.2, 0.065).setTranslation(0, 0.07, 0).setMass(0.5), C.ball(0.1).setTranslation(0, -0.17, 0).setMass(1.0)], b.mesh(), { kind: 'contraption', angDamp: 0.3 });
    game.scene.add(o.mesh);
    pins.push({ o, home });
  }));
  // balls
  const balls = [];
  for (let i = 0; i < 3; i++) {
    const home = L.v3(1.6, 0.5 + 0.21, -2.0 + i * 0.45);
    const b = new Builder();
    b.sphere(0.21, [0x222222, 0xb46cff, 0xff3a3a][i], [0, 0, 0], null, 14);
    for (const [a, c] of [[0.3, 0.1], [0.5, -0.05], [0.4, -0.2]]) b.sphere(0.03, 0x111111, [a * 0.21, 0.19, c], null, 5);
    const o = game.physics.dynamic(home, [C.ball(0.21).setMass(6).setFriction(0.4)], b.mesh(), { kind: 'contraption', ccd: true, angDamp: 0.05, linDamp: 0.05 });
    game.scene.add(o.mesh);
    balls.push({ o, home });
    throwable(game, o, {
      r: 0.22, speed: 7, up: 0.15,
      aim: (p, body) => {
        // on the approach and facing down the lane: bowl it from the foul line
        const c = p.chest.translation(), loc = toLocal(L, c.x, c.z);
        let d = p.yaw - L.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (loc.z > 2 || loc.z < -5 || Math.abs(loc.x) > 2.4 || Math.abs(d) > 0.9) return null;
        const lx = Math.max(-0.55, Math.min(0.55, loc.x));
        body.setTranslation(L.v3(lx, 0.1 + 0.22, 0.4), true);
        const tx = -lx * 0.85 + Math.sin(d) * 3.5, ang = Math.atan2(tx - lx, pinZ - 0.4);
        const a = L.yaw + ang, sp2 = 8.5;
        state.rolling = true; state.t = 0;
        return { x: Math.sin(a) * sp2, y: 0, z: Math.cos(a) * sp2 };
      },
    });
  }
  const state = { rolling: false, t: 0, phase: 0 };
  const standing = () => pins.filter((p) => {
    const r = p.o.body.rotation(); _q.set(r.x, r.y, r.z, r.w); _v.set(0, 1, 0).applyQuaternion(_q);
    const t = p.o.body.translation();
    return _v.y > 0.85 && Math.hypot(t.x - p.home.x, t.z - p.home.z) < 0.25;
  }).length;
  const reset = () => {
    for (const p of pins) place(p.o.body, p.home);
    for (const b of balls) place(b.o.body, b.home);
    state.rolling = false; state.phase = 0;
  };
  const rp = L.v3(-1.6, 1.0, -1.2);
  useSpot(game, rp.x, rp.y, rp.z, 'Reset pins', () => { reset(); board.set('BOWL!'); clunk(game, rp, 0.4); });
  game.steppers.push(() => {
    // balls that reach the back cushion roll back to the rack
    for (const b of balls) {
      const t = b.o.body.translation(), loc = toLocal(L, t.x, t.z);
      if (loc.z > LEN - 0.2 || t.y < -2) {
        if (!state.rolling) place(b.o.body, b.home);
        else b.o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    if (!state.rolling) return;
    state.t += DT;
    if (state.t > 7) {
      const n = 10 - standing();
      board.set(n === 10 ? 'STRIKE!' : n === 0 ? 'GUTTER!' : n + ' PINS');
      if (n === 10) chime(game, L.v3(0, 1, pinZ), [72, 76, 79, 84, 88]);
      else if (n > 0) chime(game, L.v3(0, 1, pinZ), [72, 76]);
      reset();
    }
  });
}

function toLocal(L, x, z) {
  const dx = x - L.x, dz = z - L.z;
  return { x: dx * L.c - dz * L.s, z: dx * L.s + dz * L.c };
}

// ---- rope swing over the lake ---------------------------------------------------
function ropeSwing(game, kit) {
  const W = game.physics.world;
  const a = -0.95, ux = Math.cos(a), uz = Math.sin(a);
  let d = LAKE.r * 0.4;
  while (heightAt(LAKE.x + ux * d, LAKE.z + uz * d) < 0.6 && d < LAKE.r * 1.5) d += 0.25;
  const Sx = LAKE.x + ux * d, Sz = LAKE.z + uz * d, hS = heightAt(Sx, Sz);
  const px = -uz, pz = ux; // along the shore
  const platTop = hS + 1.3;
  // jumping platform on the shore with steps up from the land side
  const pc = { x: Sx + ux * 1.0, z: Sz + uz * 1.0 };
  const ph = platTop - Math.min(heightAt(pc.x, pc.z), hS) + 0.5;
  kit.box(pc.x, platTop - ph / 2, pc.z, 2.2, ph, 2.2, 0xb98a5a, { yaw: Math.atan2(ux, uz) });
  for (let i = 0; i < 4; i++) {
    const sx = pc.x + ux * (1.4 + (3 - i) * 0.45), sz = pc.z + uz * (1.4 + (3 - i) * 0.45);
    const top = platTop - (4 - i) * (platTop - heightAt(sx, sz)) / 5;
    const g = heightAt(sx, sz) - 0.4;
    kit.box(sx, (top + g) / 2, sz, 1.4, top - g, 0.45, 0x9a6a3a, { yaw: Math.atan2(ux, uz) });
  }
  // A-frame with a beam reaching out over the water
  const L = 6.5, pivot = { x: Sx - ux * 3.6, y: platTop + 5.75, z: Sz - uz * 3.6 };
  const top = pivot.y + 0.25;
  const bx = Sx + ux * 2.4, bz = Sz + uz * 2.4;
  for (const s of [-1, 1]) {
    const x = bx + px * s * 1.6, z = bz + pz * s * 1.6, g = heightAt(x, z) - 0.5;
    kit.cyl(x, (top + g) / 2, z, 0.18, top - g, 0x7a5032);
  }
  const yawU = Math.atan2(ux, uz);
  kit.box(bx, top, bz, 3.6, 0.3, 0.3, 0x7a5032, { yaw: yawU });
  const bl = Math.hypot(bx - pivot.x, bz - pivot.z) + 0.3, mx = (bx + pivot.x) / 2, mz = (bz + pivot.z) / 2;
  kit.box(mx, top, mz, 0.3, 0.3, bl, 0x7a5032, { yaw: yawU });
  kit.box(bx - ux * 1.2, top - 1.0, bz - uz * 1.2, 0.2, 0.2, 2.6, 0x7a5032, { euler: [-0.7, yawU, 0] });
  // the rope: a dynamic body hanging from a ball joint
  const b = new Builder();
  b.cyl(0.03, 0.03, L, 0xd9c08a, [0, L / 2, 0], null, 5);
  b.sphere(0.09, 0xb59a6a, [0, 0.05, 0], null, 8);
  b.cyl(0.05, 0.05, 0.6, 0x8a5a36, [0, 0, 0], [0, 0, Math.PI / 2], 8);
  const o = game.physics.dynamic({ x: pivot.x, y: pivot.y - L, z: pivot.z }, [C.ball(0.15).setMass(6)], b.mesh(), { groups: groups(G_VEH, ALL & ~G_STATIC), kind: 'contraption', buoy: null, angDamp: 2.5, linDamp: 0.02 });
  game.scene.add(o.mesh);
  o.body.setCanSleep?.(false);
  W.createImpulseJoint(RAPIER.JointData.spherical(pivot, { x: 0, y: L, z: 0 }), game.physics.staticBody, o.body, true);
  // rests at the platform edge until someone grabs on
  const dock = { x: Sx + ux * 0.3, z: Sz + uz * 0.3 };
  const dh = Math.hypot(dock.x - pivot.x, dock.z - pivot.z);
  dock.y = pivot.y - Math.sqrt(L * L - dh * dh);
  const seat = addSeat(game, {
    body: o.body, pos: [0, 0.12, 0], yaw: 0, label: 'Rope swing', hint: 'Stick to swing · Y let go!', exit: [0, -0.3, 0],
    control(inp) {
      if (Math.abs(inp.moveY) < 0.3 && Math.abs(inp.moveX) < 0.3) return;
      const v = o.body.linvel(), sp = Math.hypot(v.x, v.z);
      const dx = sp > 0.3 ? v.x / sp : -ux, dz = sp > 0.3 ? v.z / sp : -uz;
      const k = 170 * DT * Math.min(1, Math.hypot(inp.moveX, inp.moveY));
      o.body.applyImpulse({ x: dx * k, y: 0, z: dz * k }, true);
    },
  });
  let free = 0;
  const face = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-ux, -uz));
  const UPV = new THREE.Vector3(0, 1, 0), r = new THREE.Vector3(), w = new THREE.Vector3();
  // keep the body aligned with the rope (no spinning) and facing out over the water
  const align = () => {
    const t = o.body.translation(), v = o.body.linvel();
    r.set(pivot.x - t.x, pivot.y - t.y, pivot.z - t.z);
    _q.setFromUnitVectors(UPV, r.clone().normalize()).multiply(face);
    o.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    w.set(-r.x, -r.y, -r.z).cross(_v.set(v.x, v.y, v.z)).divideScalar(r.lengthSq());
    o.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
  };
  game.steppers.push(() => {
    if (seat.occupant) { free = 0; align(); return; }
    free += DT;
    if (free < 2) { align(); return; }
    // glide back to the platform edge (stays on the rope's sphere around the pivot)
    const t = o.body.translation(), k = Math.min(1, DT * 2.5);
    _v.set(t.x + (dock.x - t.x) * k - pivot.x, t.y + (dock.y - t.y) * k - pivot.y, t.z + (dock.z - t.z) * k - pivot.z).setLength(L);
    o.body.setTranslation({ x: pivot.x + _v.x, y: pivot.y + _v.y, z: pivot.z + _v.z }, true);
    o.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    align();
  });
  game.ropeSwing = { body: o.body, seat, dock, pivot, shore: { x: Sx, z: Sz, y: hS } };
}

// ---- log rafts on the lake ----------------------------------------------------------
function rafts(game) {
  const spots = [[-150, -214, 0.3], [-161, -228, 1.2], [-139, -224, 2.1]];
  for (const [x, z, yaw] of spots) {
    const b = new Builder();
    for (let i = 0; i < 6; i++) b.cyl(0.19, 0.19, 2.4, [0x9a6a3a, 0x8a5a36][i % 2], [-0.95 + i * 0.38, 0, 0], [Math.PI / 2, 0, 0], 8);
    for (const s of [-1, 1]) b.box(2.3, 0.08, 0.16, 0x6b4a2a, [0, 0.19, s * 0.85]);
    const o = game.physics.dynamic({ x, y: SEA_LEVEL + 0.1, z }, [C.cuboid(1.15, 0.19, 1.2).setMass(70).setFriction(0.9)], b.mesh(), {
      rot: yawQuat(yaw), angDamp: 0.8, linDamp: 0.3,
      buoy: { points: [[-0.9, 0, -0.9], [0.9, 0, -0.9], [-0.9, 0, 0.9], [0.9, 0, 0.9]], r: 0.19, volume: 0.55 },
    });
    game.scene.add(o.mesh);
  }
}

// ---- zip line: lookout tower on the mountain down to the lake ----------------------
function zipLine(game, kit) {
  const W = game.physics.world;
  const tx = MOUNTAIN.x - 7.5, tz = MOUNTAIN.z + 1.5, hT = heightAt(tx, tz);
  const E = new THREE.Vector3(-128, 6.0, -222);
  const C0 = new THREE.Vector3(tx, hT + 19.5, tz);
  const dir = E.clone().sub(C0), Lc = dir.length(); dir.normalize();
  const yawD = Math.atan2(dir.x, dir.z);
  const HANG = 1.75, deckTop = hT + 0.6;
  // tower: four legs, cross braces, top deck, boarding deck at the base
  for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    const g = heightAt(tx + ox, tz + oz) - 0.6;
    kit.cyl(tx + ox, (C0.y + 0.8 + g) / 2, tz + oz, 0.14, C0.y + 0.8 - g, 0xd9534f);
  }
  for (let y = hT + 4; y < C0.y; y += 4.5) {
    kit.deco(tx, y, tz - 1.3, 2.6, 0.12, 0.12, 0xffffff); kit.deco(tx, y, tz + 1.3, 2.6, 0.12, 0.12, 0xffffff);
    kit.deco(tx - 1.3, y, tz, 0.12, 0.12, 2.6, 0xffffff); kit.deco(tx + 1.3, y, tz, 0.12, 0.12, 2.6, 0xffffff);
  }
  kit.deco(tx, C0.y + 0.85, tz, 3.2, 0.2, 3.2, 0xffd23f);
  kit.cone(tx, C0.y + 2.0, tz, 2.4, 1.6, 0xd9534f, { seg: 4, euler: [0, Math.PI / 4, 0] });
  kit.box(tx, (deckTop + hT - 1.5) / 2, tz, 3.4, deckTop - hT + 1.5, 3.4, 0xb98a5a);
  // cable + the far pole standing in the lake
  const mid = C0.clone().add(E).multiplyScalar(0.5);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  kit.cyl(mid.x, mid.y, mid.z, 0.035, Lc + 1.0, 0x333333, { collide: false, rot: { x: _q.x, y: _q.y, z: _q.z, w: _q.w }, seg: 5 });
  const P2 = E.clone().addScaledVector(dir, 1.2), bed = heightAt(P2.x, P2.z);
  kit.cyl(P2.x, (E.y + 1 + bed) / 2, P2.z, 0.2, E.y + 1 - bed, 0xd9534f);
  kit.deco(P2.x, E.y + 1.1, P2.z, 0.6, 0.3, 0.6, 0xffd23f);
  const s = signMesh('ZIP LINE', 3.2, '#d9534f');
  s.position.set(tx - Math.sin(yawD) * 1.75, hT + 3.0, tz - Math.cos(yawD) * 1.75); s.rotation.y = yawD + Math.PI; game.scene.add(s);
  // check clearance under the rider
  let minC = 1e9;
  for (let i = 1; i < 100; i++) { const p = C0.clone().addScaledVector(dir, Lc * i / 100); minC = Math.min(minC, p.y - HANG - 1.0 - Math.max(heightAt(p.x, p.z), SEA_LEVEL)); }
  if (minC < 0.3) console.warn('zip line clearance', minC.toFixed(2));

  // the trolley: kinematic, carries one rider
  const b = new Builder();
  b.cyl(0.16, 0.16, 0.1, 0x666666, [0, 0, 0], [0, 0, Math.PI / 2], 12);
  b.box(0.1, 0.4, 0.3, 0xffd23f, [0, -0.2, 0]);
  for (const sd of [-1, 1]) b.cyl(0.015, 0.015, HANG - 0.1, 0x222222, [sd * 0.25, -HANG / 2 - 0.15, 0], [0, 0, sd * -0.13], 4);
  b.box(0.6, 0.06, 0.32, 0xd9534f, [0, -HANG, 0]);
  b.cyl(0.02, 0.02, 0.6, 0x222222, [0, -0.42, 0], [0, 0, Math.PI / 2], 4);
  const mesh = b.mesh(); game.scene.add(mesh);
  const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(tx, deckTop + HANG + 0.55, tz).setRotation(yawQuat(yawD)));
  game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  const baseY = deckTop + HANG + 0.55;
  const st = { mode: 'base', y: baseY, s: 0, v: 0 };
  const seat = addSeat(game, {
    body, pos: [0, -HANG + 0.15, 0], yaw: 0, label: 'Zip line', hint: 'Wheee! · Y let go', exit: [0, -HANG - 0.2, 0.4],
    onEnter: () => { if (st.mode === 'base') { st.mode = 'lift'; tone(game, C0, 300, 600, 0.4, 0.15, 'square'); } },
  });
  const rot = yawQuat(yawD);
  const p = new THREE.Vector3();
  game.physics.animators.push((t, dt) => {
    const rider = seat.occupant;
    if (st.mode === 'lift') {
      if (!rider) st.mode = 'down';
      st.y = Math.min(C0.y, st.y + 3.2 * dt);
      p.set(tx, st.y, tz);
      if (st.y >= C0.y) { st.mode = 'ride'; st.s = 0; st.v = 0.5; }
    } else if (st.mode === 'ride') {
      const a = 9.81 * -dir.y - 0.011 * st.v * st.v;
      st.v = Math.max(0.5, st.v + a * dt);
      const left = Lc - 1.5 - st.s;
      if (left < 18) st.v = Math.min(st.v, 4 + left * 0.75);
      st.s += st.v * dt;
      p.copy(C0).addScaledVector(dir, st.s);
      if (!rider) st.mode = 'back';
      else if (st.s >= Lc - 1.5) { rider.leaveSeat(); st.mode = 'back'; chime(game, E, [79, 76, 72]); }
    } else if (st.mode === 'back') {
      st.s = Math.max(0, st.s - 16 * dt);
      p.copy(C0).addScaledVector(dir, st.s);
      if (st.s <= 0) { st.mode = 'down'; st.y = C0.y; }
    } else if (st.mode === 'down') {
      st.y = Math.max(baseY, st.y - 5 * dt);
      p.set(tx, st.y, tz);
      if (st.y <= baseY) st.mode = 'base';
    } else p.set(tx, baseY, tz);
    seat.disabled = st.mode !== 'base';
    body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    body.setNextKinematicRotation(rot);
  });
  game.zipLine = { seat, st, C0, E, Lc, base: { x: tx, y: deckTop, z: tz } };
}
