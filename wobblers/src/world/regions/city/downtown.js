// Downtown Bigtown: glass towers, Bigtown Tower (lobby, outside glass
// elevator to a rooftop deck with a helipad and a jump-off plank), a tower
// with a revolving door, the bank, hotels, offices, cinema, diner, police
// station, bus depot and the bridge landing.
import * as THREE from 'three';
import { RAPIER, yawQuat } from '../../../physics.js';
import { VEH_GROUPS } from '../../../config.js';
import { Builder, matGlass, matVC, signMesh } from '../../../mesh.js';
import { Vehicle } from '../../../vehicles.js';
import { Local, addDoor, useSpot, chime, NO_STATIC, liveSign } from '../../common.js';
import { addSeat } from '../../playground.js';
import { lfurn } from '../../furniture.js';
import { vendingMachine } from '../../music.js';
import { SW, Y } from './layout.js';
import { tower, roofTop, midrise, awning, GLASS, TOWER_COLS, PASTEL, WARM, BRICK, shopBox, shopShell, billboard } from './buildings.js';

export const BIG = { x: 875, z: -114, w: 30, d: 30, h: 150, LH: 6 }; // Bigtown Tower
export const BIG_TOP = SW + BIG.h;

const blockOf = ([x0, x1, z0, z1]) => ({ x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });

// ---- a tower with a walk-in lobby (front = local +z) -------------------------------
// holes: { r: [{ at, w, h }], l: [...] } extra openings in the side walls (at: from the back corner).
export function lobbyTower(game, kit, R, x, z, yaw, w, d, h, opts = {}) {
  const LH = opts.LH ?? 6, T = 0.3, col = opts.color ?? TOWER_COLS[1];
  const L = new Local(kit, x, z, yaw, SW);
  const hw = w / 2, hd = d / 2;
  // walls: front with the revolving door in the middle and two side doors, back, sides
  L.wall(-hw, hd - T / 2, hw, hd - T / 2, LH, T, col, [{ at: hw, w: 3.6, h: 3.1 }, { at: hw - 6, w: 1.6, h: 2.5 }, { at: hw + 6, w: 1.6, h: 2.5 }]);
  for (const s of [-1, 1]) L.window(-hw, hd - T / 2, hw, hd - T / 2, hw + s * 10.5, 2.6, 6, 3.6, T, GLASS[0], 0xdddddd);
  L.wall(-hw, -hd + T / 2, hw, -hd + T / 2, LH, T, col, opts.holes?.b || []);
  L.wall(hw - T / 2, -hd + T, hw - T / 2, hd - T, LH, T, col, opts.holes?.r || []);
  L.wall(-hw + T / 2, -hd + T, -hw + T / 2, hd - T, LH, T, col, opts.holes?.l || []);
  L.deco(0, 0.02, 0, w - 2 * T, 0.03, d - 2 * T, 0xeae4da); // marble floor
  L.deco(0, 0.04, hd - 4, 6, 0.02, 3, 0xc8343c);             // red carpet at the door
  // swing doors either side of the revolving door
  for (const s of [-1, 1]) {
    const [hx, hz] = L.w(s * 6 - 0.8, hd - T / 2);
    addDoor(game, hx, SW + 0.03, hz, L.yaw, 1.6, 2.45, 0x3a5a8a, { glass: true });
  }
  revolvingDoor(game, kit, L, 0, hd - T / 2);
  // lobby furnishings: reception desk, sofas, plants, a vending machine, lights
  L.box(0, 0.55, -hd + 5, 8, 1.1, 1.2, 0x6b4a2a);
  L.deco(0, 1.13, -hd + 5, 8.2, 0.06, 1.4, 0xf2e4c8);
  L.box(0, 1.6, -hd + 1.0, 6, 2.4, 0.3, 0x2a3550);
  const lg = signMesh(opts.name || 'LOBBY', 4.5, '#2a3550', '#ffd23f');
  const lp = L.v3(0, 3.0, -hd + 1.2); lg.position.set(lp.x, lp.y, lp.z); lg.rotation.y = L.yaw; game.scene.add(lg);
  lfurn(game, L, 'sofa', -hw + 4, 0, 2, Math.PI / 2, 0x2a6a8a);
  lfurn(game, L, 'sofa', hw - 4, 0, 2, -Math.PI / 2, 0x2a6a8a);
  lfurn(game, L, 'plant', -hw + 1.5, 0, hd - 2);
  lfurn(game, L, 'plant', hw - 1.5, 0, hd - 2);
  vendingMachine(game, L, -hw + 1.0, -hd + 3, Math.PI / 2, 0x3f8cff);
  for (const [lx, lz] of [[-w / 4, 0], [w / 4, 0], [0, -hd + 5]]) { const p = L.v3(lx, LH - 0.3, lz); game.interiorLights.add(p.x, p.y, p.z, { yaw: L.yaw }); }
  // the tower above (axis-aligned dims in world space)
  const rot = Math.abs(Math.sin(yaw)) > 0.5;
  const top = tower(kit, x, z, rot ? d : w, rot ? w : d, h, { ...opts, color: col, from: LH });
  // canopy over the entrance
  L.box(0, LH - 1.6, hd + 2.2, 10, 0.3, 4.4, 0x2a3550);
  for (const s of [-1, 1]) L.cyl(s * 4.6, (LH - 1.75) / 2, hd + 4.1, 0.1, LH - 1.75, 0xcccccc, { seg: 8 });
  return { L, top };
}

// Revolving door: four glass wings on a free-spinning hub (slowly motor-driven),
// in a drum of two curved glass walls. Centre at local (lx, lz) on the front wall line.
function revolvingDoor(game, kit, L, lx, lz) {
  const Rr = 1.55, H = 2.6;
  // drum walls (sides), a little roof disc
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const a = (s > 0 ? 0 : Math.PI) + (k - 1.5) * 0.32;
    const px = lx + Math.cos(a) * (Rr + 0.08), pz = lz + Math.sin(a) * (Rr + 0.08);
    L.box(px, H / 2, pz, 0.08, H, 0.52, 0xb8dcf0, { yaw: -a });
  }
  L.cyl(lx, H + 0.12, lz, Rr + 0.2, 0.24, 0x2a3550, { seg: 18 });
  const W = game.physics.world, c = L.v3(lx, H / 2 + 0.03, lz);
  const hub = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z));
  const b = new Builder(), C = RAPIER.ColliderDesc, descs = [];
  b.cyl(0.08, 0.08, H, 0xcccccc, [0, 0, 0], null, 8);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), rot = { x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) };
    b.box(Rr - 0.15, H - 0.1, 0.05, 0x9fd8ff, [ca * Rr / 2, 0, sa * Rr / 2], [0, -a, 0]);
    b.box(Rr - 0.1, 0.08, 0.08, 0xcccccc, [ca * Rr / 2, H / 2 - 0.05, sa * Rr / 2], [0, -a, 0]);
    b.box(0.06, H - 0.1, 0.08, 0xcccccc, [ca * (Rr - 0.08), 0, sa * (Rr - 0.08)], [0, -a, 0]);
    descs.push(C.cuboid((Rr - 0.12) / 2, H / 2 - 0.05, 0.04).setTranslation(ca * Rr / 2, 0, sa * Rr / 2).setRotation(rot).setMass(6).setFriction(0.3));
  }
  const o = game.physics.dynamic(c, descs, b.mesh(), { groups: NO_STATIC, kind: 'door', buoy: null, angDamp: 1.2 });
  o.body.setEnabledTranslations?.(false, false, false, true);
  game.scene.add(o.mesh);
  const j = W.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), hub, o.body, true);
  j.configureMotorVelocity(0.55, 3);
  // keep it turning (a sleeping body ignores its motor)
  game.steppers.push(() => { if (o.body.isSleeping()) o.body.wakeUp(); });
  return o;
}

// ---- Bigtown Tower: lobby, outside glass elevator, roof deck ------------------------
function bigTower(game, kit, R, blk) {
  const { x, z, w, d, h, LH } = BIG;
  const top = BIG_TOP;
  // the elevator shaft hugs the east face; the lobby's east wall has a door into it
  lobbyTower(game, kit, R, x, z, 0, w, d, h, {
    LH, style: 'grid', color: 0x6f8fb0, glass: GLASS[1], band: 0x5a7898, roof: 'none', parapet: false, name: 'BIGTOWN TOWER',
    holes: { r: [{ at: d / 2 - 0.3, w: 2.4, h: 2.6 }] },
  });
  // big name sign over the canopy and a crown of lights on top
  R.sign('BIGTOWN TOWER', x, SW + LH + 1.8, z + d / 2 + 0.25, 0, 12, '#2a62c9', '#ffffff');
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.box(x + sx * (w / 2 - 1), top + 3, z + sz * (d / 2 - 1), 2, 6, 2, 0x5a7898);
  kit.deco(x, top + 0.02, z, w - 1, 0.04, d - 1, 0xc9c4ba); // roof deck paving
  kit.cyl(x - 8, top + 16, z - 8, 0.3, 20, 0xdddddd, { collide: false, seg: 8 });
  kit.sphere(x - 8, top + 26.3, z - 8, 0.5, 0xfff4c2);
  elevator(game, kit, x + w / 2 + 1.85, z, top);
  roofDeck(game, kit, R, x, z, w, d, top);
}

function elevator(game, kit, SX, SZ, top) {
  const HX = 1.65, HZ = 1.75, T = 0.2, yB = SW + 0.1, yT = top + 0.1, ST = top + 4; // shaft top
  const glassB = new Builder();
  const pane = (cx, cy, cz, w, h, d) => { glassB.box(w, h, d, 0x9fd8ff, [cx, cy, cz]); kit.phys.box(cx, cy, cz, w, h, d); };
  // east wall: full height
  pane(SX + HX + T / 2, (SW + ST) / 2, SZ, T, ST - SW, 2 * HZ + 2 * T);
  // north wall: full; south wall: open at street level (door 3.2 high)
  pane(SX, (SW + ST) / 2, SZ - HZ - T / 2, 2 * HX, ST - SW, T);
  pane(SX, (SW + 3.4 + ST) / 2, SZ + HZ + T / 2, 2 * HX, ST - SW - 3.4, T);
  // west side (against the tower): open in the lobby door and onto the roof, closed between
  pane(SX - HX - T / 2, (SW + 6 + top) / 2, SZ, T, top - SW - 6, 2 * HZ);
  // frame posts and floor bands (opaque, in the kit)
  for (const [px, pz] of [[SX + HX + T, SZ - HZ - T], [SX + HX + T, SZ + HZ + T], [SX - HX - T, SZ + HZ + T], [SX - HX - T, SZ - HZ - T]]) kit.deco(px, (SW + ST) / 2, pz, 0.3, ST - SW, 0.3, 0x5a6470);
  for (let y = SW + 3.6; y < ST; y += 12) kit.deco(SX, y, SZ, 2 * HX + 0.7, 0.25, 2 * HZ + 0.7, 0x5a6470);
  kit.box(SX, ST + 0.2, SZ, 2 * HX + 0.8, 0.4, 2 * HZ + 0.8, 0x5a6470);
  kit.box(SX, SW - 0.05, SZ, 2 * HX, 0.1, 2 * HZ, 0x5a6470);
  const gm = new THREE.Mesh(glassB.geometry(), matGlass); gm.renderOrder = 2; game.scene.add(gm);
  const es = signMesh('ELEVATOR', 3.2, '#5a6470', '#ffffff');
  es.position.set(SX, SW + 3.9, SZ + HZ + T + 0.05); game.scene.add(es);
  // the cab: kinematic floor + ceiling + handrail, origin at the floor top
  const W = game.physics.world, C = RAPIER.ColliderDesc;
  const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SX, yB, SZ));
  for (const d of [C.cuboid(HX - 0.04, 0.1, HZ - 0.04).setTranslation(0, -0.1, 0), C.cuboid(HX - 0.04, 0.08, HZ - 0.04).setTranslation(0, 3.0, 0),
    C.cuboid(0.05, 0.5, HZ - 0.1).setTranslation(HX - 0.12, 0.5, 0)]) { d.setCollisionGroups(VEH_GROUPS); d.setFriction(1.0); W.createCollider(d, body); }
  const cb = new Builder();
  cb.box(2 * HX - 0.08, 0.2, 2 * HZ - 0.08, 0x8a8f96, [0, -0.1, 0]);
  cb.box(2 * HX - 0.3, 0.02, 2 * HZ - 0.3, 0xc8343c, [0, 0.01, 0]);
  cb.box(2 * HX - 0.08, 0.16, 2 * HZ - 0.08, 0x5a6470, [0, 3.0, 0]);
  cb.box(1.2, 0.04, 1.2, 0xfff4c2, [0, 2.9, 0]);
  for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) cb.box(0.1, 3, 0.1, 0xcccccc, [px * (HX - 0.1), 1.45, pz * (HZ - 0.1)]);
  cb.box(0.08, 0.08, 2 * HZ - 0.2, 0xffd23f, [HX - 0.12, 1.0, 0]);
  cb.box(0.2, 0.4, 0.06, 0x333a44, [-HX + 0.4, 1.2, HZ - 0.12]);   // button panel
  cb.sphere(0.06, 0x30ff60, [-HX + 0.4, 1.3, HZ - 0.16], null, 8);
  cb.sphere(0.06, 0xff3030, [-HX + 0.4, 1.1, HZ - 0.16], null, 8);
  const mesh = cb.mesh(matVC); mesh.userData.noCull = true;
  game.scene.add(mesh);
  game.physics.objects.push({ body, mesh, buoy: null, kind: 'ride' });
  const st = { y: yB, from: yB, to: yB, t: 0, T: 1, moving: false, wait: 0 };
  const go = (to) => {
    if (st.moving || Math.abs(st.y - to) < 0.01) return;
    Object.assign(st, { from: st.y, to, t: 0, T: 5 + Math.abs(to - st.y) / 7, moving: true });
    chime(game, { x: SX, y: st.y, z: SZ }, [72, 76], 0.25);
  };
  const toggle = () => go(st.y < (yB + yT) / 2 ? yT : yB);
  const inside = (p) => { const t = p.hips.translation(); return Math.abs(t.x - SX) < HX && Math.abs(t.z - SZ) < HZ && t.y > st.y - 0.2 && t.y < st.y + 2.8; };
  game.physics.animators.push((t, dt) => {
    if (st.moving) {
      st.t += dt;
      const u = Math.min(1, st.t / st.T), s = u * u * (3 - 2 * u);
      st.y = st.from + (st.to - st.from) * s;
      if (u >= 1) { st.moving = false; st.wait = 0; chime(game, { x: SX, y: st.y, z: SZ }, [84, 79], 0.3); }
    } else {
      // somebody waiting inside: go by itself after a few seconds
      if (game.players.some(inside)) { if ((st.wait += dt) > 4) toggle(); } else st.wait = 0;
    }
    body.setNextKinematicTranslation({ x: SX, y: st.y, z: SZ });
  });
  addSeat(game, { body, pos: [-HX + 0.6, 1.0, HZ - 0.6], kind: 'use', label: 'Ride the elevator', use: toggle });
  useSpot(game, SX + 1.2, SW + 1.0, SZ + HZ + 1.2, 'Call the elevator', () => go(yB));
  useSpot(game, SX - HX - 2.2, top + 1.0, SZ + 2.2, 'Call the elevator', () => go(yT));
  game.cityElevator = { body, state: st, go, toggle, SX, SZ, yB, yT };
}

// Roof: railings (with a gap at the elevator and at the jump plank), helipad + helicopter,
// coin-op telescopes, a bench or two and the jump-off plank over the crash mat.
function roofDeck(game, kit, R, x, z, w, d, top) {
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
    kit.box((x0 + x1) / 2, top + 0.6, (z0 + z1) / 2, 0.12, 1.2, len, 0xdddddd, { yaw });
  };
  const e = 0.3, hw = w / 2 - e, hd = d / 2 - e;
  rail(x - hw, z - hd, x + hw, z - hd);
  rail(x - hw, z - hd, x - hw, z + hd);
  rail(x + hw, z - hd, x + hw, z - 2.2);           // east: gap for the elevator (z -2.2..2.2)
  rail(x + hw, z + 2.2, x + hw, z + hd);
  rail(x - hw, z + hd, x + 9.6, z + hd);            // south: gap for the plank at x + 11
  rail(x + 12.4, z + hd, x + hw, z + hd);
  // jump-off plank sticking out over the street side
  kit.box(x + 11, top + 0.15, z + d / 2 + 3.2, 1.4, 0.3, 7, 0xc8955a);
  kit.deco(x + 11, top + 0.31, z + d / 2 + 6.4, 1.4, 0.03, 0.4, 0xff3a3a);
  R.sign('JUMP', x + 11, top + 2.4, z + d / 2 - 0.4, 0, 2.4, '#ff3a3a', '#ffffff');
  // helipad + a helicopter
  kit.box(x - 5, top + 0.2, z - 5, 14, 0.4, 14, 0x55606a);
  kit.deco(x - 5, top + 0.42, z - 5, 1.2, 0.02, 7, 0xffffff);
  kit.deco(x - 7.4, top + 0.42, z - 5, 1.2, 0.02, 7, 0xffffff);
  kit.deco(x - 2.6, top + 0.42, z - 5, 1.2, 0.02, 7, 0xffffff);
  kit.deco(x - 5, top + 0.42, z - 5, 5, 0.02, 1.0, 0xffffff);
  R.later(() => game.vehicles.push(new Vehicle(game, 'heli', x - 5, top + 1.6, z - 5, Math.PI / 2, 0xffd23f)));
  // telescopes along the north rail
  for (const tx of [x - 6, x + 2, x + 9]) {
    kit.cyl(tx, top + 0.55, z - hd + 1.0, 0.08, 1.1, 0x55595f, { seg: 8 });
    kit.cyl(tx, top + 1.2, z - hd + 0.8, 0.13, 0.7, 0x3a62a8, { euler: [1.2, 0, 0], seg: 10 });
  }
  kit.bench(x + 6, z + 6, Math.PI, top);
  kit.bench(x - 8, z + 8, Math.PI / 2, top);
  R.coins(x + 4, z + 4, top + 3, 'ring', 8, 5);
  R.coins(x + 11, z + d / 2 + 5.8, top + 3, 'one', 1, 0, { big: true });
  R.present('city-tower-roof', 'pants:Pinstripe grey', x + 6, z - 8, top + 3, 'on the roof of Bigtown Tower');
}

// ---- the other downtown blocks ------------------------------------------------------
export function buildDowntown(game, kit, R, blocks) {
  const rnd = R.rng(7);
  const pick = (a) => a[(rnd() * a.length) | 0];
  for (const raw of blocks) {
    const b = blockOf(raw), kind = raw[4];
    switch (kind) {
      case 'bigtower': bigTower(game, kit, R, b); break;
      case 'towers2': {
        const s = rnd() < 0.5 ? 1 : -1;
        const h1 = 55 + rnd() * 50, h2 = 35 + rnd() * 40;
        tower(kit, b.cx - 13, b.cz + s * 14, 24, 24, h1, { color: pick(TOWER_COLS), glass: pick(GLASS), style: rnd() < 0.5 ? 'grid' : 'ribbon', roof: pick(['water', 'ac', 'spire', 'crown']) });
        tower(kit, b.cx + 15, b.cz - s * 15, 20, 22, h2, { color: pick(TOWER_COLS), glass: pick(GLASS), style: rnd() < 0.5 ? 'grid' : 'ribbon', roof: pick(['water', 'ac', 'heli']) });
        smallPlaza(kit, R, b.cx + 14, b.cz + s * 15, rnd);
        break;
      }
      case 'tower': {
        tower(kit, b.cx, b.cz - 4, 30, 30, 95, { color: 0xf2d27a, glass: GLASS[3], style: 'ribbon', roof: 'crown' });
        for (const k of [-1, 1]) kit.bench(b.cx + k * 6, b.cz + 16, 0, SW);
        billboardOnRoof(game, kit, b.cx, b.cz - 4, SW + 95 + 0.1, 'WOBBLE COLA', '#e8322b');
        break;
      }
      case 'lobbytower': {
        // front faces the plaza to the east
        lobbyTower(game, kit, R, b.cx + 2, b.cz, Math.PI / 2, 30, 28, 120, { color: 0x8fd0c0, glass: GLASS[3], style: 'grid', roof: 'spire', name: 'WOBBLECORP' });
        break;
      }
      case 'bank': bank(game, kit, R, b); break;
      case 'hotel': {
        midrise(game, kit, b.cx, b.cz, Math.PI / 2, 40, 22, 8, { wall: 0xe8d8c0, trim: 0x8a5a3a, glass: WARM });
        R.sign('HOTEL', b.cx + 11.3, SW + 18, b.cz, Math.PI / 2, 8, '#6a3c9a', '#ffd23f');
        const L = new Local(kit, b.cx + 13, b.cz, Math.PI / 2, SW);
        L.box(0, 3.4, 1.5, 6, 0.3, 4, 0x6a3c9a);
        for (const s of [-1, 1]) L.cyl(s * 2.8, 1.65, 3.3, 0.08, 3.3, 0xffd23f, { seg: 8 });
        L.deco(0, 0.02, 2.5, 3, 0.02, 5, 0xc8343c);
        break;
      }
      case 'tallhotel': {
        midrise(game, kit, b.cx, b.cz - 6, 0, 30, 18, 14, { wall: 0xf0b8a8, trim: 0xffffff, glass: WARM, roof: 'water' });
        R.sign('HOTEL', b.cx, SW + 7.5, b.cz + 3.25, 0, 8, '#6a3c9a', '#ffd23f');
        const L = new Local(kit, b.cx, b.cz + 3, 0, SW);
        L.box(0, 3.4, 2.2, 8, 0.3, 4.4, 0x6a3c9a);
        for (const s of [-1, 1]) L.cyl(s * 3.6, 1.65, 4.2, 0.08, 3.3, 0xffd23f, { seg: 8 });
        billboard(game, kit, b.cx, SW + 14 * 3.2 + 0.6, b.cz - 10, 0, 'BOUNCY BEANS', '#ffd23f', '#ff7a1a', 14);
        break;
      }
      case 'offices': {
        tower(kit, b.cx - 12, b.cz, 26, 36, 48, { color: 0xc9d3dc, glass: GLASS[2], style: 'grid', roof: 'ac' });
        midrise(game, kit, b.cx + 16, b.cz, -Math.PI / 2, 30, 18, 5, { wall: BRICK[1], shopName: 'CAFE', shopColor: '#8a5a3a' });
        break;
      }
      case 'cinema': cinema(game, kit, R, b); break;
      case 'diner': {
        diner(game, kit, R, b.cx - 12, b.cz + 10);
        shopBox(game, kit, b.cx + 14, b.cz + 13, 0, 'DONUTS', '#ff8ac8', { w: 12, d: 10, wall: PASTEL[4], upper: 2 });
        midrise(game, kit, b.cx + 6, b.cz - 13, Math.PI, 40, 16, 6, { wall: BRICK[3], trim: 0xffffff });
        break;
      }
      case 'police': police(game, kit, R, b); break;
      case 'depot': depot(game, kit, R, b); break;
      case 'landing': landing(game, kit, R, b); break;
    }
  }
}

function smallPlaza(kit, R, x, z) {
  for (const [dx, dz] of [[-5, -5], [5, 5], [-5, 5], [5, -5]]) {
    kit.box(x + dx, SW + 0.25, z + dz, 1.8, 0.5, 1.8, 0x9a958c);
    kit.tree(x + dx, z + dz, SW + 0.4, 0, 0.8);
  }
  kit.bench(x, z - 2, 0, SW);
  kit.bench(x, z + 2, Math.PI, SW);
}

function billboardOnRoof(game, kit, x, z, y, text, bg) {
  billboard(game, kit, x, y, z + 6, 0, text, bg, '#ffffff', 14);
}

function bank(game, kit, R, b) {
  // classical bank on the corner + an office tower behind it
  const L = new Local(kit, b.cx, b.cz + 14, 0, SW);
  L.box(0, 5, 0, 34, 10, 20, 0xf0e8d8);
  L.box(0, 10.6, 0, 35, 1.2, 21, 0xe0d8c8);
  for (let i = 0; i < 4; i++) L.box(0, 0.15 + i * 0.3, 11.5 + (3 - i) * 0.6, 22 - i * 0.5, 0.3, 1.2 + (3 - i) * 0.0, 0xe0dcd4);
  for (let i = 0; i < 6; i++) L.cyl(-10 + i * 4, 4.8, 11.3, 0.55, 8.4, 0xffffff, { seg: 14 });
  L.box(0, 9.5, 11.3, 24, 1.2, 1.6, 0xffffff);
  L.deco(0, 2.0, 10.05, 3, 4, 0.1, 0x6b4a2a);
  for (const lx of [-12, -7, 7, 12]) L.deco(lx, 5, 10.05, 2.2, 3.6, 0.1, WARM);
  const s = signMesh('BANK', 7, '#2a3550', '#ffd23f'); const p = L.v3(0, 11.1, 10.55); s.position.set(p.x, p.y, p.z); game.scene.add(s);
  tower(kit, b.cx, b.cz - 16, 30, 24, 80, { color: 0x7f9bb8, glass: GLASS[2], style: 'grid', roof: 'heli' });
  R.coins(b.cx, b.cz + 14, SW + 13, 'line', 5, 20); // on the bank roof
}

function cinema(game, kit, R, b) {
  const L = new Local(kit, b.cx, b.cz + 4, 0, SW);
  L.box(0, 6, 0, 40, 12, 30, 0x8a3a4a);
  L.deco(0, 12.3, 0, 40.5, 0.6, 30.5, 0xffd23f);
  // marquee: a lit canopy and the sign above
  L.box(0, 4.2, 17, 20, 1.2, 4, 0xffd23f);
  for (let i = 0; i < 20; i++) L.deco(-9.5 + i, 3.55, 19.05, 0.3, 0.3, 0.1, 0xfff4c2);
  L.deco(0, 1.5, 15.05, 8, 3, 0.1, WARM);
  const s = signMesh('CINEMA', 12, '#c8343c', '#ffd23f'); const p = L.v3(0, 8, 15.2); s.position.set(p.x, p.y, p.z); game.scene.add(s);
  // poster frames either side
  for (const lx of [-15, 15]) { L.deco(lx, 4, 15.05, 4, 5.4, 0.1, 0x222228); L.deco(lx, 4, 15.1, 3.4, 4.8, 0.1, [0x3f8cff, 0xff8a3d][lx > 0 ? 1 : 0]); }
  // a ticket booth out front
  L.box(0, 1.2, 21, 2.2, 2.4, 1.6, 0xc8343c);
  L.deco(0, 1.6, 21.82, 1.6, 0.9, 0.05, 0x9fd8ff);
  R.sign('TICKETS', ...Object.values(L.v3(0, 2.8, 21.85)), 0, 2.2, '#ffd23f', '#c8343c');
}

function diner(game, kit, R, x, z) {
  const L = shopShell(game, kit, x, z, 0, 'DINER', '#2ab5a5', { w: 16, d: 11, h: 4.6, wall: 0xf2f2f2, floor: 0xffffff });
  L.deco(0, 0.6, 5.62, 16, 0.4, 0.06, 0xff6fae); // chrome-and-pink stripe
  L.box(-2, 0.55, -3.5, 9, 1.1, 0.8, 0xff6fae);
  L.deco(-2, 1.13, -3.5, 9.2, 0.06, 1.0, 0xdddddd);
  for (const lx of [-5.5, -3.5, -1.5, 0.5, 2.5]) lfurn(game, L, 'stool', lx, 0, -2.6, 0, 0xc8343c);
  for (const [tx, tz] of [[-5, 2.2], [-1, 2.2]]) {
    lfurn(game, L, 'table', tx, 0, tz, 0, 0xff6fae, 1.2, 0.8);
    lfurn(game, L, 'chair', tx, 0, tz - 0.8, 0, 0x2ab5a5);
    lfurn(game, L, 'chair', tx, 0, tz + 0.8, Math.PI, 0x2ab5a5);
  }
  vendingMachine(game, L, 7.2, -3.5, -Math.PI / 2, 0xff6fae);
  R.later(() => R.npc('chef', ...L.w(-2, -4.4), { lines: ['Order up!', 'Pancakes, sugar?', 'Best burgers in Bigtown!'] }));
}

function police(game, kit, R, b) {
  const L = new Local(kit, b.cx - 4, b.cz - 6, 0, SW);
  midrise(game, kit, b.cx - 4, b.cz - 6, 0, 34, 20, 3, { wall: 0x3a5a9a, trim: 0xffffff, roof: 'ac' });
  L.box(0, 3.6, 11.5, 10, 0.3, 3, 0xffffff);
  R.sign('POLICE', ...Object.values(L.v3(0, 5.4, 10.2)), 0, 7, '#1f2b5c', '#ffffff');
  for (const k of [-1, 1]) { L.cyl(k * 4.6, 4.2, 12.2, 0.12, 0.8, 0x3f8cff, { seg: 8 }); L.sphere(k * 4.6, 4.7, 12.2, 0.2, 0x8fcfff); }
  // car park in front with two police cars
  R.later(() => R.vehicle('police', b.cx - 14, b.cz + 16, Math.PI));
  R.later(() => R.vehicle('police', b.cx - 6, b.cz + 16, Math.PI));
  for (const k of [-18, -10, -2, 6]) kit.deco(b.cx + k, Y + 0.2, b.cz + 16, 0.15, 0.02, 5, 0xffffff);
}

function depot(game, kit, R, b) {
  // open bus shelter roof over two bays + a little office
  const L = new Local(kit, b.cx, b.cz, 0, SW);
  L.box(0, 5.6, 0, 50, 0.4, 24, 0xd8dde4);
  for (const lx of [-24, -8, 8, 24]) for (const lz of [-11, 11]) L.cyl(lx, 2.7, lz, 0.25, 5.4, 0x8a8f96, { seg: 8 });
  for (const lz of [-4, 4]) L.deco(0, 0.02, lz, 46, 0.02, 0.2, 0xffd23f);
  L.box(-20, 1.6, -15, 8, 3.2, 6, 0x3f8cff);
  L.deco(-20, 1.8, -11.95, 5, 1.4, 0.1, WARM);
  R.sign('CITY BUS', ...Object.values(L.v3(0, 6.6, 12.2)), 0, 9, '#222228', '#ffb020');
}

function landing(game, kit, R, b) {
  // welcome sign at the bridge landing, a taxi rank and a flower bed
  R.welcomeSign(724, 98, Math.PI / 2);
  for (const [x, z] of [[712, 74], [728, 74], [712, 86]]) { kit.box(x, SW + 0.3, z, 4, 0.6, 4, 0x9a958c); kit.deco(x, SW + 0.62, z, 3.6, 0.04, 3.6, 0x4fae45); kit.bush(x, z, SW + 0.4); }
  kit.bench(728, 86, -Math.PI / 2, SW);
  R.sign('TAXI', 732.5, SW + 2.6, 92, Math.PI / 2, 2.4, '#ffd23f', '#222228');
  kit.cyl(732.6, SW + 1.2, 92, 0.08, 2.4, 0x55595f, { collide: false });
}
