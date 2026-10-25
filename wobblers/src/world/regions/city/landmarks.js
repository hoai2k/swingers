// Bigtown landmarks: the stadium (stands, floodlights, goals and a giant
// football that scores), the building site (a climbable steel frame and a
// slewing tower crane carrying a girder you can ride), City Park (pond,
// footbridge, hilltop gazebo), the parking garage with ramps, and the
// harbour front (boardwalk, pier, boats, beach).
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { VEH_GROUPS } from '../../../config.js';
import { Builder, matVC, signMesh } from '../../../mesh.js';
import { Vehicle } from '../../../vehicles.js';
import { ladder, liveSign, chime, place, Local } from '../../common.js';
import { spawnProp } from '../../props.js';
import { SW, Y, PARK, POND, RW } from './layout.js';
import { billboard, roofTop } from './buildings.js';
import { cones } from './props.js';

const C = RAPIER.ColliderDesc;
const blockOf = ([x0, x1, z0, z1]) => ({ x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });

// ---- stadium ---------------------------------------------------------------------------
export function stadium(game, kit, R, raw) {
  const b = blockOf(raw), cx = b.cx, cz = b.cz + 2;
  const PW = 64, PD = 40, G = SW;
  kit.deco(cx, G + 0.02, cz, PW + 8, 0.03, PD + 8, 0x5fb845);
  for (let i = 0; i < 8; i++) kit.deco(cx - PW / 2 + (i + 0.5) * PW / 8, G + 0.035, cz, PW / 8, 0.02, PD, i % 2 ? 0x6cc850 : 0x58b440);
  const line = (x, z, w, d) => kit.deco(x, G + 0.05, z, w, 0.02, d, 0xffffff);
  line(cx, cz - PD / 2, PW, 0.15); line(cx, cz + PD / 2, PW, 0.15); line(cx - PW / 2, cz, 0.15, PD); line(cx + PW / 2, cz, 0.15, PD); line(cx, cz, 0.15, PD);
  const ring = kit.b(cx, cz); ring.torus(6, 0.08, 0xffffff, [cx, G + 0.05, cz], [Math.PI / 2, 0, 0], 32);
  // stands: 6 stepped tiers on each side, open corners
  const tiers = 6, step = 0.6, deep = 1.3, gap = 3.5;
  const COLS = [0xe8322b, 0xffffff, 0x2a62c9];
  const stand = (along, sgn, len) => {
    for (let k = 0; k < tiers; k++) {
      const h = (k + 1) * step, o = (along ? PD : PW) / 2 + gap + k * deep + deep / 2;
      if (along) kit.box(cx, G + h / 2, cz + sgn * o, len, h, deep, COLS[k % 3]);
      else kit.box(cx + sgn * o, G + h / 2, cz, deep, h, len, COLS[k % 3]);
    }
    const o = (along ? PD : PW) / 2 + gap + tiers * deep + 0.2, h = tiers * step + 1.2;
    if (along) kit.box(cx, G + h / 2, cz + sgn * o, len, h, 0.4, 0x8a8f96);
    else kit.box(cx + sgn * o, G + h / 2, cz, 0.4, h, len, 0x8a8f96);
  };
  stand(true, -1, PW - 4); stand(true, 1, PW - 4); stand(false, -1, PD - 6); stand(false, 1, PD - 6);
  // a roof over the south stand on posts
  const ro = PD / 2 + gap + tiers * deep / 2;
  kit.box(cx, G + tiers * step + 5, cz + ro + 1, PW - 4, 0.4, tiers * deep + 3, 0xdde2e8);
  for (let i = 0; i <= 4; i++) kit.cyl(cx - (PW - 6) / 2 + i * (PW - 6) / 4, G + (tiers * step + 5) / 2, cz + ro + tiers * deep / 2 + 1.5, 0.25, tiers * step + 5, 0x8a8f96, { seg: 8 });
  // floodlights at the corners (tall: they stay visible from afar)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const fx = cx + sx * (PW / 2 + 9), fz = cz + sz * (PD / 2 + 9);
    kit.cyl(fx, G + 15, fz, 0.45, 30, 0x8a8f96, { seg: 8 });
    kit.box(fx, G + 30.8, fz, 5, 2.4, 0.6, 0x55595f, { yaw: Math.atan2(-sx, -sz) });
    for (let i = 0; i < 6; i++) { const a = Math.atan2(-sx, -sz), ox = Math.cos(a) * (-2 + (i % 3) * 2), oz = -Math.sin(a) * (-2 + (i % 3) * 2); kit.deco(fx + ox - sx * 0.35, G + 30.3 + (i > 2 ? 1 : 0), fz + oz - sz * 0.35, 0.8, 0.8, 0.8, 0xfff4c2); }
  }
  R.sign('STADIUM', cx, G + tiers * step + 3.0, cz - (PD / 2 + gap + tiers * deep + 0.45), Math.PI, 12, '#3a9a4a', '#ffffff');
  R.sign('STADIUM', cx, G + 4.5, b.z1 - 0.2, 0, 10, '#3a9a4a', '#ffffff');
  // goals with net colliders, a giant ball and a scoreboard
  const goals = [];
  for (const s of [-1, 1]) {
    const gx = cx + s * (PW / 2), GW = 8, GH = 3, GD = 2.2;
    for (const k of [-1, 1]) kit.cyl(gx, G + GH / 2, cz + k * GW / 2, 0.14, GH, 0xffffff, { seg: 8 });
    kit.cyl(gx, G + GH, cz, 0.14, GW, 0xffffff, { euler: [Math.PI / 2, 0, 0], seg: 8 });
    kit.box(gx + s * GD, G + GH / 2, cz, 0.08, GH, GW, 0xf4f4f4);                                // back net
    for (const k of [-1, 1]) kit.box(gx + s * GD / 2, G + GH / 2, cz + k * GW / 2, GD, GH, 0.08, 0xf4f4f4); // side nets
    kit.box(gx + s * GD / 2, G + GH, cz, GD, 0.08, GW, 0xf4f4f4);                                 // roof net
    goals.push({ x0: Math.min(gx, gx + s * GD), x1: Math.max(gx, gx + s * GD), z0: cz - GW / 2, z1: cz + GW / 2, score: 0, side: s });
  }
  const board = liveSign(game, 8, 2.4, '#111', '#ffd23f');
  board.mesh.position.set(cx, G + tiers * step + 6, cz - (PD / 2 + gap + tiers * deep + 0.7));
  kit.box(cx, G + tiers * step + 6, cz - (PD / 2 + gap + tiers * deep + 0.95), 8.6, 3, 0.3, 0x222228);
  const show = () => board.set(['BIGTOWN  ' + goals[1].score + ' - ' + goals[0].score + '  VISITORS']);
  show();
  const ballMesh = new Builder();
  const BRad = 1.3;
  ballMesh.sphere(BRad, 0xffffff, [0, 0, 0], null, 16);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ballMesh.sphere(BRad * 0.3, 0x222228, [Math.cos(a) * BRad * 0.8, Math.sin(a) * BRad * 0.55, Math.sin(a + 1) * BRad * 0.3], [1, 1, 0.45], 8); }
  const home = { x: cx, y: G + BRad + 0.1, z: cz };
  const ball = game.physics.dynamic(home, [C.ball(BRad).setMass(9).setRestitution(0.75).setFriction(0.7)], ballMesh.mesh(), { angDamp: 0.4, linDamp: 0.15 });
  game.scene.add(ball.mesh);
  let cool = 0, k = 0;
  game.steppers.push(() => {
    if (++k % 6) return;
    cool -= 0.1;
    const t = ball.body.translation();
    if (cool <= 0) for (const g of goals) {
      if (t.x > g.x0 + 0.3 && t.x < g.x1 && t.z > g.z0 && t.z < g.z1 && t.y < G + 3) {
        g.score++; show(); cool = 4;
        chime(game, t, [72, 76, 79, 84, 88], 0.4);
        game.life?.reward(null, 5, 'Goal!', t);
        setTimeout(() => place(ball.body, home), 2500);
      }
    }
    if (t.y < -4 || Math.hypot(t.x - cx, t.z - cz) > 150) place(ball.body, home);
  });
  for (let i = 0; i < 3; i++) spawnProp(game, 'ball', cx - 6 + i * 6, cz + 8, G);
  R.coins(cx, cz, G + 2, 'ring', 8, 6);
  R.coins(cx, cz + PD / 2 + gap + tiers * deep - 0.6, G + tiers * step + 2, 'line', 6, 40); // top row of the south stand
}

// ---- building site --------------------------------------------------------------------
export function constructionSite(game, kit, R, raw) {
  const b = blockOf(raw), G = SW;
  kit.deco(b.cx, G + 0.02, b.cz, b.w - 1, 0.03, b.d - 1, 0xb89a6a); // dirt
  // fence with a gate on the south side (to the street)
  const fx0 = b.x0 + 1, fx1 = b.x1 - 1, fz0 = b.z0 + 1, fz1 = b.z1 - 1, gc = b.cx - 8;
  kit.fence(fx0, fz0, fx1, fz0, 0xff8a1a, 2); kit.fence(fx0, fz0, fx0, fz1, 0xff8a1a, 2); kit.fence(fx1, fz0, fx1, fz1, 0xff8a1a, 2);
  kit.fence(fx0, fz1, gc - 4, fz1, 0xff8a1a, 2); kit.fence(gc + 4, fz1, fx1, fz1, 0xff8a1a, 2);
  for (const k of [-1, 1]) kit.box(gc + k * 4, G + 1.25, fz1, 0.3, 2.5, 0.3, 0xffd23f);
  R.sign('BUILDING SITE', gc + 12, G + 1.6, fz1 + 0.15, 0, 5, '#ffd23f', '#222228');
  // ---- steel frame: 3 storeys of columns and beams, decked bays, ladders between them
  const X0 = b.x0 + 8, Z0 = b.cz - 4, NX = 4, NZ = 3, S = 6, FH = 4.2, levels = 3;
  const steel = 0xc8503a, beam = 0.35;
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) kit.box(X0 + i * S, G + levels * FH / 2, Z0 + j * S, 0.4, levels * FH, 0.4, steel);
  for (let l = 1; l <= levels; l++) {
    const y = G + l * FH - beam / 2;
    for (let j = 0; j <= NZ; j++) kit.box(X0 + NX * S / 2, y, Z0 + j * S, NX * S + 0.4, beam, 0.35, steel);
    for (let i = 0; i <= NX; i++) kit.box(X0 + i * S, y, Z0 + NZ * S / 2, 0.35, beam, NZ * S + 0.4, steel);
  }
  // decks (planks) on some bays, ladders up through open bays next to them
  const deck = (l, i, j) => kit.box(X0 + (i + 0.5) * S, G + l * FH + 0.05, Z0 + (j + 0.5) * S, S - 0.3, 0.1, S - 0.3, 0xc8955a);
  for (const [i, j] of [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [3, 1], [3, 2], [2, 2]]) deck(1, i, j);
  for (const [i, j] of [[0, 2], [1, 2], [1, 1], [2, 1]]) deck(2, i, j);
  for (const [i, j] of [[3, 0], [3, 1], [2, 0]]) deck(3, i, j);
  const lad = (x, z, y0, y1, dx, dz) => {
    ladder(game, x, z, y0, y1, dx, dz);
    for (const s of [-0.4, 0.4]) kit.deco(x - dz * s, (y0 + y1) / 2, z + dx * s, 0.08, y1 - y0 + 1, 0.08, 0xffd23f);
    for (let y = y0 + 0.3; y < y1 + 0.8; y += 0.4) kit.deco(x, y, z, Math.abs(dz) * 0.8 + 0.06, 0.06, Math.abs(dx) * 0.8 + 0.06, 0xffd23f);
  };
  // ground -> L1: outside the south edge, onto deck (1, 0, 0)... climbing north
  lad(X0 + S * 0.5, Z0 - 0.5, G, G + FH, 0, 1);
  // L1 -> L2: from deck (0,1) up into (0,2)
  lad(X0 + S * 0.5, Z0 + 2 * S - 0.4, G + FH, G + 2 * FH, 0, 1);
  // L2 -> L3: from deck (2,1) up into (2,0)
  lad(X0 + S * 2.5, Z0 + S + 0.4, G + 2 * FH, G + 3 * FH, 0, -1);
  R.coins(X0 + S * 3, Z0 + S, G + 3 * FH + 2, 'line', 5, 10);
  R.present('city-girders', 'pants:Taxi yellow', X0 + S * 3.5, Z0 + S * 1.5, G + 3 * FH + 2, 'on top of the steel frame at the building site');
  // site clutter: cabin, pipes, a cement mixer, crates, cones, a sand heap
  kit.box(b.x1 - 8, G + 1.4, b.z1 - 6, 8, 2.8, 3.2, 0xffffff);
  kit.deco(b.x1 - 8, G + 1.7, b.z1 - 4.35, 3, 1, 0.1, 0x9fd8ff);
  for (let i = 0; i < 4; i++) kit.cyl(b.x0 + 6, G + 0.45 + (i > 2 ? 0.8 : 0), b.z1 - 12 + (i % 3) * 0.95, 0.45, 6, 0x8a8f96, { euler: [0, 0, Math.PI / 2], seg: 10 });
  kit.cyl(b.x0 + 18, G + 1.6, b.z1 - 7, 1.2, 2.2, 0xffa020, { euler: [0, 0, 1.1], seg: 12 });
  kit.box(b.x0 + 18, G + 0.5, b.z1 - 7, 2.6, 1, 2, 0x55595f);
  kit.sphere(b.x0 + 28, G - 0.4, b.z1 - 9, 3, 0xd8c08a, { scale: [1, 0.45, 1] });
  kit.wedge(b.x0 + 28, G, b.z1 - 13.5, 3, 4, 1.3, 0xd8c08a, { yaw: Math.PI });
  for (let i = 0; i < 5; i++) spawnProp(game, 'crate', b.x1 - 14 + (i % 3) * 1.0, b.z1 - 14 + (i > 2 ? 1 : 0), G + (i > 2 ? 0.9 : 0));
  cones(game, gc - 6, fz1 + 2, gc + 6, fz1 + 2, 5);
  towerCrane(game, kit, R, b.x1 - 10, Z0 + NZ * S / 2, X0 + NX * S / 2, Z0 + NZ * S / 2);
}

// Tower crane: lattice mast with a ladder, a slewing jib (kinematic) carrying a hanging
// steel girder that sweeps over the frame top at (fx, fz).
function towerCrane(game, kit, R, x, z, fx, fz) {
  const G = SW, H = 42, M = 1.0;
  // mast: corner posts + bracing (visual) and one collider
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.deco(x + sx * M, G + H / 2, z + sz * M, 0.18, H, 0.18, 0xffd23f);
  for (let y = G + 1.5; y < G + H; y += 3) {
    kit.deco(x, y, z - M, 2 * M, 0.12, 0.12, 0xffd23f); kit.deco(x, y, z + M, 2 * M, 0.12, 0.12, 0xffd23f);
    kit.deco(x - M, y, z, 0.12, 0.12, 2 * M, 0xffd23f); kit.deco(x + M, y, z, 0.12, 0.12, 2 * M, 0xffd23f);
    kit.deco(x, y + 1.5, z - M, 0.1, 3.4, 0.1, 0xffd23f, { euler: [0, 0, 0.6] });
    kit.deco(x, y + 1.5, z + M, 0.1, 3.4, 0.1, 0xffd23f, { euler: [0, 0, -0.6] });
  }
  kit.phys.box(x, G + H / 2, z, 2 * M - 0.3, H, 2 * M - 0.3);
  kit.box(x, G + 0.5, z, 4, 1, 4, 0x8a8f96);
  // ladder up the south face (inside the bracing), popping you onto the turntable
  ladder(game, x, z + M + 0.25, G, G + H, 0, -1, 0.5);
  for (let y = G + 0.3; y < G + H; y += 0.4) kit.deco(x, y, z + M + 0.12, 0.8, 0.05, 0.05, 0x55595f);
  // slewing part: kinematic body, origin on the mast axis at the turntable top
  const W = game.physics.world, top = G + H;
  const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, top, z));
  const JL = 30, CJ = 10;
  const dist = Math.hypot(fx - x, fz - z), girderR = Math.min(dist, JL - 4);
  const GY = G + 3 * 4.2 + 0.6 - top; // girder underside a little above the frame top
  const colls = [
    C.cuboid(1.6, 0.15, 1.6).setTranslation(0, -0.15, 0),                          // turntable deck (the ladder ends here)
    C.cuboid(0.6, 0.15, (JL + CJ) / 2).setTranslation(0, -0.15, (JL - CJ) / 2),    // jib walkway, level with it
    C.cuboid(1.2, 1.2, 1.4).setTranslation(0, 1.05, -CJ + 1.4),                    // counterweight
    C.cuboid(0.8, 0.9, 0.9).setTranslation(2.4, 0.75, -2.6),                       // cab
    C.cuboid(0.6, 0.2, 3.5).setTranslation(0, GY + 0.2, girderR),                  // the girder on the hook (across the jib)
  ];
  colls[4].setRotation({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 });
  for (const sd of [-1, 1]) { // handrails along the jib and the counter-jib (not across the turntable)
    colls.push(C.cuboid(0.05, 0.45, (JL - 1.6) / 2).setTranslation(sd * 0.62, 0.45, (JL + 1.6) / 2));
    colls.push(C.cuboid(0.05, 0.45, (CJ - 1.6) / 2).setTranslation(sd * 0.62, 0.45, -(CJ + 1.6) / 2));
  }
  for (const d of colls) { d.setCollisionGroups(VEH_GROUPS); d.setFriction(1.2); W.createCollider(d, body); }
  const mb = new Builder();
  mb.box(3.2, 0.3, 3.2, 0x55595f, [0, -0.15, 0]);
  mb.box(1.2, 0.3, JL + CJ, 0xffd23f, [0, -0.15, (JL - CJ) / 2]);
  for (let zz = -CJ; zz < JL; zz += 1) mb.box(1.1, 0.02, 0.06, 0x8a7a30, [0, 0.01, zz + 0.5]);
  for (const sd of [-0.62, 0.62]) {
    mb.box(0.08, 0.08, JL - 1.6, 0xffd23f, [sd, 0.9, (JL + 1.6) / 2]);
    mb.box(0.08, 0.08, CJ - 1.6, 0xffd23f, [sd, 0.9, -(CJ + 1.6) / 2]);
    for (let zz = 1.6; zz < JL; zz += 2) mb.box(0.06, 0.9, 0.06, 0xffd23f, [sd, 0.45, zz]);
    for (let zz = -CJ; zz < -1.6; zz += 2) mb.box(0.06, 0.9, 0.06, 0xffd23f, [sd, 0.45, zz]);
  }
  // lattice jib truss above the walkway
  mb.box(0.12, 0.12, JL + CJ, 0xffd23f, [0, 2.6, (JL - CJ) / 2]);
  for (let zz = -CJ; zz < JL; zz += 2.5) { mb.box(0.08, 1.6, 0.08, 0xffd23f, [0.55, 1.8, zz]); mb.box(0.08, 1.6, 0.08, 0xffd23f, [-0.55, 1.8, zz]); }
  mb.box(0.3, 6, 0.3, 0xffd23f, [0, 3.0, -1.5]);                                    // tower head
  mb.box(0.06, 0.06, JL, 0x444444, [0, 4.2, JL / 2 - 1.0], [-0.12, 0, 0]);          // tie
  mb.box(0.06, 0.06, CJ, 0x444444, [0, 4.2, -CJ / 2 - 1.0], [0.3, 0, 0]);
  mb.box(2.4, 2.4, 2.8, 0x8a8f96, [0, 1.05, -CJ + 1.4]);
  mb.box(1.6, 1.8, 1.8, 0xffd23f, [2.4, 0.75, -2.6]);
  mb.box(0.05, 1.0, 1.4, 0x9fd8ff, [3.22, 0.95, -2.6]);
  mb.box(0.6, 0.4, 1.0, 0x444444, [0, -0.5, girderR]);                              // trolley
  mb.box(0.04, -GY - 0.7, 0.04, 0x222222, [0.2, GY / 2 + 0.2, girderR]);            // cables
  mb.box(0.04, -GY - 0.7, 0.04, 0x222222, [-0.2, GY / 2 + 0.2, girderR]);
  mb.box(7, 0.4, 0.5, 0xc8503a, [0, GY + 0.2, girderR]);                            // the girder
  mb.box(7, 0.08, 1.2, 0xc8503a, [0, GY + 0.36, girderR]);
  mb.box(7, 0.08, 1.2, 0xc8503a, [0, GY + 0.04, girderR]);
  const mesh = mb.mesh(matVC); mesh.userData.noCull = true;
  game.scene.add(mesh);
  game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  // aim the girder over the frame now and then: a slow back-and-forth sweep
  const a0 = Math.atan2(fx - x, fz - z), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  game.physics.animators.push((t) => {
    const a = a0 + Math.sin(t * 0.07) * 1.6;
    q.setFromAxisAngle(UP, a);
    body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  });
  game.cityCrane = { body, girderR, GY: GY + top };
}

// ---- City Park --------------------------------------------------------------------------
export function cityPark(game, kit, R) {
  const P = PARK, rnd = R.rng(99), g = (x, z) => R.groundAt(x, z);
  // gravel paths (deco strips that follow the ground)
  const path = (x0, z0, x1, z1, w = 3) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 6);
    for (let i = 0; i < n; i++) {
      const xa = x0 + (x1 - x0) * i / n, za = z0 + (z1 - z0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n, zb = z0 + (z1 - z0) * (i + 1) / n;
      const ya = g(xa, za), yb = g(xb, zb), len = Math.hypot(xb - xa, zb - za);
      kit.deco((xa + xb) / 2, (ya + yb) / 2 + 0.06, (za + zb) / 2, w, 0.06, len + 0.3, 0xe2cfa0, { euler: [-Math.atan2(yb - ya, len), Math.atan2(xb - xa, zb - za), 0] });
    }
  };
  path(990, -84, 1040, -150); path(1040, -150, 1055, -168); path(1120, -84, 1068, -150); path(1000, -140, 1040, -150); path(1055, -182, 1070, -240);
  path(990, -84, 1120, -84);
  // pond (terrain pit, see city.js prepare) with stone edging and a footbridge
  R.addWater(game, POND.x0 - 1, POND.x1 + 1, POND.z0 - 1, POND.z1 + 1, POND.floor, POND.level, 0x3fb0d8, 0.75);
  for (const s of [-1, 1]) {
    kit.deco((POND.x0 + POND.x1) / 2, Y + 0.1, s < 0 ? POND.z0 - 1.6 : POND.z1 + 1.6, POND.x1 - POND.x0 + 4, 0.25, 0.8, 0xbab4a8);
    kit.deco(s < 0 ? POND.x0 - 1.6 : POND.x1 + 1.6, Y + 0.1, (POND.z0 + POND.z1) / 2, 0.8, 0.25, POND.z1 - POND.z0 + 4, 0xbab4a8);
  }
  const bx = (POND.x0 + POND.x1) / 2;
  kit.profile(bx, Y - 0.05, (POND.z0 + POND.z1) / 2, 0, 2.6, [[-18, 0.3], [-14, 0.9], [-8, 1.4], [0, 1.6], [8, 1.4], [14, 0.9], [18, 0.3]].map(([a, c]) => [a, c]), 0xc8955a);
  for (const s of [-1, 1]) for (let zz = -12; zz <= 12; zz += 3) kit.deco(bx + s * 1.25, Y + 1.5 + 0.5 - Math.abs(zz) / 30, (POND.z0 + POND.z1) / 2 + zz, 0.1, 1.0, 0.1, 0xffffff);
  // hilltop gazebo + lookout
  const hx = 1055, hz = -175, hy = g(hx, hz);
  kit.box(hx, hy + 0.15, hz, 9, 0.5, 9, 0xe8e0d0, { round: 0.1 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; kit.cyl(hx + Math.sin(a) * 3.8, hy + 1.9, hz + Math.cos(a) * 3.8, 0.15, 3.4, 0xffffff, { seg: 8 }); }
  kit.cone(hx, hy + 4.6, hz, 5.2, 2.2, 0xe8322b, { seg: 6 });
  kit.cyl(hx, hy + 3.5, hz, 5.0, 0.2, 0xffffff, { seg: 6, collide: false });
  kit.bench(hx, hz + 2, Math.PI, hy + 0.4);
  kit.bench(hx, hz - 2, 0, hy + 0.4);
  R.coins(hx, hz, hy + 4, 'ring', 6, 3);
  R.coins(hx, hz, hy + 8, 'one', 1, 0, { big: true, lift: 4.6 });
  // trees, bushes, flower beds, benches, lamps, picnic tables
  for (let i = 0; i < 70; i++) {
    const x = P.x0 + 4 + rnd() * (P.x1 - P.x0 - 8), z = P.z0 + 6 + rnd() * (P.z1 - P.z0 - 12);
    if (x > POND.x0 - 5 && x < POND.x1 + 5 && z > POND.z0 - 5 && z < POND.z1 + 5) continue;
    if (Math.hypot(x - hx, z - hz) < 9) continue;
    if (x < 1050 && z > -100) continue; // basketball and the lawn by the street
    const y = g(x, z);
    if (y < Y - 0.2) continue;
    if (rnd() < 0.75) kit.tree(x, z, y - 0.1, rnd() < 0.3 ? 1 : 0, 0.8 + rnd() * 0.5); else kit.bush(x, z, y, 0.9 + rnd() * 0.4);
  }
  for (const [x, z, yaw] of [[1010, -95, Math.PI], [1022, -95, Math.PI], [1037, -150, 0], [1075, -150, Math.PI / 2], [1100, -95, Math.PI], [1012, -133, 0]]) kit.bench(x, z, yaw, g(x, z));
  for (const [x, z] of [[1000, -90], [1030, -120], [1045, -140], [1085, -120], [1110, -90]]) kit.lamp(x, z, g(x, z));
  for (const [x, z] of [[1090, -110], [1098, -118]]) picnicTable(kit, x, z, g(x, z));
  R.sign('CITY PARK', 1035, Y + 2.4, -82.5, 0, 6, '#3a9a4a', '#ffffff');
  for (const k of [-1, 1]) kit.cyl(1035 + k * 3.1, Y + 1.2, -82.6, 0.12, 2.4, 0x6b4a2a, { collide: false });
  for (let i = 0; i < 3; i++) spawnProp(game, 'ball', 1060 + i * 4, -110, g(1060 + i * 4, -110));
  R.coins(1013, -114, Y + 4, 'line', 5, 18, { yaw: Math.PI / 2 }); // along the footbridge
}

function picnicTable(kit, x, z, y) {
  kit.box(x, y + 0.75, z, 2.2, 0.08, 0.9, 0xb5773d);
  for (const s of [-1, 1]) kit.box(x, y + 0.45, z + s * 0.75, 2.2, 0.06, 0.3, 0xb5773d);
  for (const s of [-1, 1]) kit.deco(x + s * 0.9, y + 0.37, z, 0.08, 0.75, 1.6, 0x6b4a2a);
}

// ---- parking garage -------------------------------------------------------------------
export function parkingGarage(game, kit, R, raw) {
  const b = blockOf(raw);
  const X0 = b.x0 + 4, X1 = b.x1 - 4, Z0 = b.z0 + 3.5, Z1 = b.z1 - 3.5, LV = 4, N = 3, T = 0.4;
  const lane = [X1 - 9, X1 - 1], wlane = [X0 + 1, X0 + 9], hz = [Z0 + 22, Z1 - 9]; // ramp lanes (x) and the ramp run (z)
  const col = 0xb8b4ac, deckC = 0x8a8f96;
  const slab = (x0, x1, z0, z1, y) => { if (x1 - x0 > 0.1 && z1 - z0 > 0.1) kit.box((x0 + x1) / 2, y - T / 2, (z0 + z1) / 2, x1 - x0, T, z1 - z0, deckC); };
  for (let l = 1; l <= N; l++) {
    const y = SW + l * LV;
    // hole above the ramp that climbs to this level: east lane for 1 and 3, west lane for 2
    const [hx0, hx1] = l === 2 ? wlane : lane;
    slab(X0, hx0, Z0, Z1, y);
    slab(hx1, X1, Z0, Z1, y);
    slab(hx0, hx1, Z0, hz[0], y);
    slab(hx0, hx1, hz[1], Z1, y);
    // parapets (a gap for nothing: cars stay in)
    const py = y + 0.55;
    kit.box((X0 + X1) / 2, py, Z0 + 0.15, X1 - X0, 1.1, 0.3, col);
    kit.box((X0 + X1) / 2, py, Z1 - 0.15, X1 - X0, 1.1, 0.3, col);
    kit.box(X0 + 0.15, py, (Z0 + Z1) / 2, 0.3, 1.1, Z1 - Z0, col);
    kit.box(X1 - 0.15, py, (Z0 + Z1) / 2, 0.3, 1.1, Z1 - Z0, col);
    kit.deco((X0 + X1) / 2, py + 0.4, Z1 + 0.02, X1 - X0, 0.25, 0.1, 0x3f8cff);
    // bay lines
    for (let x = X0 + 12; x < lane[0] - 2; x += 3) kit.deco(x, y + 0.02, Z0 + 5, 0.12, 0.02, 5, 0xffffff);
  }
  // ramps: L0 -> L1 east lane heading north, L1 -> L2 west lane heading south, L2 -> roof east lane north
  const ramp = (x0, x1, yLow, yHigh, north) => {
    const len = hz[1] - hz[0], ang = Math.atan2(yHigh - yLow, len), L = Math.hypot(len, yHigh - yLow) + 0.6;
    kit.box((x0 + x1) / 2, (yLow + yHigh) / 2 - T / 2, (hz[0] + hz[1]) / 2, x1 - x0, T, L, 0x9a9fa6, { euler: [north ? ang : -ang, 0, 0] });
  };
  ramp(lane[0], lane[1], SW, SW + LV, true);
  ramp(wlane[0], wlane[1], SW + LV, SW + 2 * LV, false);
  ramp(lane[0], lane[1], SW + 2 * LV, SW + 3 * LV, true);
  // columns
  for (let x = X0 + 11; x < lane[0] - 1; x += 11) for (let z = Z0 + 10; z < Z1 - 2; z += 14) kit.box(x, SW + (N * LV) / 2, z, 0.7, N * LV, 0.7, col);
  // roof: billboard, coins and a kicker ramp at the north end for a jump between decks
  const top = SW + N * LV;
  billboard(game, kit, (X0 + X1) / 2 - 6, top, Z0 + 2, Math.PI, 'BOUNCY BEANS', '#ffd23f', '#ff7a1a', 12, 4);
  kit.wedge((X0 + X1) / 2 - 8, top, Z1 - 6, 6, 5, 1.0, 0xffd23f, { yaw: Math.PI });
  R.coins((X0 + X1) / 2 - 8, (Z0 + Z1) / 2, top + 3, 'line', 6, 24, { yaw: Math.PI / 2 });
  R.coins(X0 + 4, Z0 + 4, top + 3, 'one', 1, 0, { big: true });
  R.sign('PARKING', (X0 + X1) / 2, SW + LV - 1.2, Z1 + 0.25, 0, 6, '#2a62c9', '#ffffff');
  // entrance barrier (decoration) and parked cars on the decks
  kit.deco(lane[0] - 0.5, SW + 1.0, Z1 + 1.5, 0.2, 2, 0.2, 0x333333);
  const park = (x, l, z, yaw, c) => R.later(() => game.vehicles.push(new Vehicle(game, 'car', x, SW + l * LV + 1.4, z, yaw, c)));
  park(X0 + 13.5, 1, Z0 + 5, 0, 0x3d7dff); park(X0 + 19.5, 1, Z0 + 5, 0, 0xff4d4d);
  park(X0 + 16.5, 2, Z0 + 5, 0, 0x4fd16a); park(X0 + 25.5, 3, Z0 + 5, 0, 0xffffff);
  park(X0 + 13.5, 0, Z0 + 5, 0, 0xff8a3d);
}

// ---- harbour front: boardwalk, pier, boats, beach -------------------------------------------
export function harbour(game, kit, R) {
  const g = (x, z) => R.groundAt(x, z), rnd = R.rng(5);
  // boardwalk along the top of the beach (x 1058..1066), from the shops down to the pier
  const BW = { x: 1062, z0: 120, z1: 238 };
  kit.box(BW.x, SW - 0.1, (BW.z0 + BW.z1) / 2, 7, 0.3, BW.z1 - BW.z0, 0xb98a5a);
  for (let z = BW.z0; z < BW.z1; z += 1.2) kit.deco(BW.x, SW + 0.06, z, 7, 0.02, 0.08, 0x8a6a42);
  for (let z = BW.z0 + 6; z < BW.z1; z += 18) { kit.bench(BW.x + 3, z, -Math.PI / 2, SW + 0.05); kit.lamp(BW.x + 3.3, z + 9, SW + 0.05); }
  // pier heading out to sea from the boardwalk's south end
  const PX = 1100, pz0 = 226, pz1 = 312, deckY = SW + 0.3;
  kit.box((BW.x + PX) / 2 + 2, deckY - 0.2, pz0, PX - BW.x + 4, 0.4, 5, 0xb98a5a);      // walk from the boardwalk
  kit.box(PX, deckY - 0.2, (pz0 + pz1) / 2, 5, 0.4, pz1 - pz0, 0xb98a5a);
  kit.box(PX, deckY - 0.2, pz1 + 4, 16, 0.4, 8, 0xb98a5a);                               // T head
  for (let z = pz0; z <= pz1 + 6; z += 6) for (const s of [-1, 1]) {
    const gy = g(PX + s * 2.2, z);
    kit.cyl(PX + s * 2.2, (deckY + gy) / 2 - 0.4, z, 0.25, deckY - gy, 0x6b4a2a, { seg: 6 });
  }
  for (const s of [-1, 1]) { kit.box(PX + s * 2.45, deckY + 0.5, (pz0 + pz1) / 2 + 2, 0.12, 1.0, pz1 - pz0 - 4, 0xffffff); }
  kit.box(PX, deckY + 0.5, pz1 + 8, 16, 1.0, 0.12, 0xffffff);
  R.sign('HARBOUR', BW.x + 3.6, SW + 3.4, pz0, Math.PI / 2, 5, '#1f3f7a', '#ffffff');
  for (const k of [-1, 1]) kit.cyl(BW.x + 3.6, SW + 1.7, pz0 + k * 2.4, 0.12, 3.4, 0x6b4a2a, { collide: false });
  // harbour light at the end of the pier
  kit.cyl(PX + 6, deckY + 2, pz1 + 6, 0.6, 4, 0xe8322b, { seg: 10 });
  kit.cyl(PX + 6, deckY + 4.4, pz1 + 6, 0.5, 0.8, 0xfff4c2, { seg: 10 });
  kit.cone(PX + 6, deckY + 5.2, pz1 + 6, 0.8, 0.8, 0x333333, { seg: 10 });
  // boats moored along the pier
  for (const [x, z, c] of [[PX - 5, 268, 0xffffff], [PX + 5, 282, 0x3f8cff], [PX - 5, 296, 0xff5a5a]]) if (g(x, z) < -1.5) R.later(() => R.vehicle('boat', x, z, Math.PI, c));
  // beach: umbrellas, towels, a lifeguard tower, volleyball net
  for (let i = 0; i < 10; i++) {
    const x = 1072 + rnd() * 50, z = 140 + rnd() * 80, y = g(x, z);
    if (y < 0.2 || Math.abs(x - PX) < 5) continue;
    const c = [0xff5a5a, 0x3f8cff, 0xffd23f, 0x55d85a, 0xff7fc8][i % 5];
    kit.cyl(x, y + 1.2, z, 0.05, 2.4, 0xffffff, { collide: false, seg: 6 });
    kit.cone(x, y + 2.5, z, 1.6, 0.6, c, { seg: 8 });
    kit.deco(x + 1.2, y + 0.04, z, 0.9, 0.03, 1.9, [0xffffff, 0xff8ac8, 0x7ad0ff][i % 3], { yaw: rnd() });
  }
  const lx = 1112, lz = 205, ly = g(lx, lz);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(lx + sx, ly + 1.6, lz + sz, 0.1, 3.2, 0xffffff, { seg: 6 });
  kit.box(lx, ly + 3.3, lz, 2.6, 0.2, 2.6, 0xffffff);
  kit.box(lx, ly + 4.2, lz - 1.25, 2.6, 1.6, 0.1, 0xe8322b);
  kit.cone(lx, ly + 5.6, lz, 2.0, 1.0, 0xe8322b, { seg: 4, euler: [0, Math.PI / 4, 0] });
  ladder(game, lx, lz + 1.6, ly, ly + 3.3, 0, -1);
  for (let y = ly + 0.3; y < ly + 3.4; y += 0.4) kit.deco(lx, y, lz + 1.5, 0.8, 0.06, 0.06, 0xffffff);
  R.coins(lx, lz, ly + 6, 'ring', 4, 0.9);
  const vx = 1092, vz = 170, vy = g(vx, vz);
  for (const s of [-1, 1]) kit.cyl(vx, vy + 1.2, vz + s * 4.5, 0.08, 2.4, 0xffffff, { seg: 6 });
  kit.deco(vx, vy + 1.9, vz, 0.05, 0.9, 9, 0xf2f2f2);
  kit.phys.box(vx, vy + 1.9, vz, 0.1, 0.9, 9);
  spawnProp(game, 'ball', vx - 2, vz, vy + 0.2);
  spawnProp(game, 'ball', 1080, 190, g(1080, 190) + 0.2);
  R.coins(1088, 150, 6, 'line', 8, 50, { yaw: Math.PI / 2 });
  R.coins(PX, pz1 + 4, deckY + 3, 'ring', 6, 4);
}
