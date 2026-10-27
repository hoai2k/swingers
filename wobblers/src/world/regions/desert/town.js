// Dustville, the little wild-west town on the flat plot (y = 4): a dirt main
// street (z = -30) with boardwalks; on the north side the sheriff's office (desk,
// wanted posters, a jail cell with a barred door), the saloon (swinging batwing
// doors, bar, stools, tables, a playable piano) and the general store; on the
// south side a climbable water tower, a corral with horses, false-front shops and
// a windmill. Exports helpers the other desert builders reuse (barrel, crate...).
import { dressFront, LIT_GLASS } from '../../interiors.js';
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder, matVC } from '../../../mesh.js';
import { NO_STATIC } from '../../common.js';
import { lfurn } from '../../furniture.js';
import { piano } from '../../music.js';
import { poster } from '../../posters.js';
import { TOWN } from './layout.js';

export const WOOD = 0xa8743f, WOOD2 = 0x8a5a32, WOOD3 = 0xc8955a, DARKWOOD = 0x5a3a22, CREAM = 0xf2e0b0;
const T = 0.25; // wall thickness
const Y = TOWN.y, ST = TOWN.street;

export function barrel(kit, x, z, y, s = 1) {
  kit.cyl(x, y + 0.5 * s, z, 0.38 * s, 1.0 * s, 0x9a6232, { seg: 10 });
  for (const k of [0.15, 0.85]) kit.cyl(x, y + k * s, z, 0.4 * s, 0.07 * s, 0x555560, { seg: 10, collide: false });
}
export function crate(kit, x, z, y, s = 1, yaw = 0) {
  kit.box(x, y + 0.45 * s, z, 0.9 * s, 0.9 * s, 0.9 * s, WOOD3, { yaw });
  kit.deco(x, y + 0.45 * s, z, 0.94 * s, 0.12 * s, 0.94 * s, WOOD2, { yaw });
}
// A hollow single-room western building on local frame L (front = +z): walls
// with a door hole in the front, windows, floor, roof, false front facade, a
// porch roof on posts and a boardwalk.
function building(game, L, o) {
  const { w, d, h, wall } = o, hw = w / 2, hd = d / 2, fz = hd - T / 2, bz = -hd + T / 2, sx = hw - T / 2;
  L.wall(-hw, fz, hw, fz, h, T, wall, [{ at: o.door.lx + hw, w: o.door.w + 0.1, h: o.door.h + 0.05 }]);
  L.wall(-hw, bz, hw, bz, h, T, wall);
  for (const s of [-1, 1]) L.wall(s * sx, -hd + T, s * sx, hd - T, h, T, wall, (o.sideHoles || {})[s] || []);
  for (const win of o.windows || []) L.window(-hw, fz, hw, fz, win + hw, 2.0, 1.4, 1.3, T, o.business ? LIT_GLASS : 0x9fd8ff, CREAM);
  L.box(0, -0.13, 0, w, 0.36, d, o.floor ?? 0xb98a5a); // floor slab (the plot is 0.3 lower)
  for (let i = 0; i < Math.floor(d); i += 2) L.deco(0, 0.065, -hd + 0.6 + i, w - 2 * T, 0.005, 0.04, DARKWOOD); // floorboards
  L.box(0, h - 0.1, 0, w + 0.3, 0.2, d + 0.3, o.roof ?? 0x6b4a2a);
  // false front: a tall board above the front wall
  const fh = o.facade ?? 2.4;
  L.box(0, h + fh / 2, fz + 0.02, w, fh, 0.22, o.facadeColor ?? wall);
  L.deco(0, h + fh + 0.08, fz + 0.02, w + 0.3, 0.16, 0.34, CREAM);
  // porch: roof on posts over the boardwalk
  L.box(0, 3.3, hd + 1.35, w, 0.12, 2.7, WOOD2, { euler: [0.12, 0, 0] });
  for (const px of [-hw + 0.2, -hw / 3, hw / 3, hw - 0.2]) L.cyl(px, 1.65, hd + 2.5, 0.09, 3.3, WOOD3, { seg: 6 });
  L.box(0, -0.13, hd + 1.4, w + 0.4, 0.36, 2.8, WOOD3); // boardwalk, level with the floor
  for (let i = 0; i < Math.round(w / 0.6); i++) L.deco(-hw + 0.3 + i * 0.6, 0.055, hd + 1.4, 0.03, 0.01, 2.8, WOOD2);
  for (const lx of o.lights || [0]) {
    const p = L.v3(lx, h - 0.2, 0);
    game.interiorLights.add(p.x, p.y, p.z, { color: 0xffd08a, fixture: 'pendant' });
  }
  // open for business: lit windows, the insides painted on them, lamp, light on the boardwalk
  if (o.business) dressFront(game, L, { ...o, windows: (o.windows || []).map((at) => ({ side: 'f', at, y: 2.0, w: 1.4, h: 1.3 })), pots: false });
}

// ---- saloon ---------------------------------------------------------------------------------
function saloon(game, kit, R) {
  const L = new R.Local(kit, -970, ST - 8 - 7, 0, Y + 0.3);
  const w = 16, d = 14, h = 5.2, dw = 2.0;
  building(game, L, { w, d, h, wall: 0xb07a48, facade: 3.6, facadeColor: 0xb07a48, door: { lx: 0, w: dw + 0.6, h: 3.0 }, windows: [-5, 5], lights: [-4.5, 0, 4.5], floor: 0x9a6a3a, business: 'diner' });
  R.sign('SALOON', L.v3(0, h + 1.6, d / 2 + 0.16).x, L.y0 + h + 1.6, L.v3(0, 0, d / 2 + 0.16).z, 0, 7, '#8a5a32', '#ffe8b0');
  // batwing doors: two short half-doors hinged at the jambs, swinging both ways
  const [hx0, hz0] = L.w(-dw / 2, d / 2 - T / 2), [hx1, hz1] = L.w(dw / 2, d / 2 - T / 2);
  const bat = (hx, hz, yaw) => batwing(game, hx, L.y0 + 0.75, hz, yaw, dw / 2 - 0.04, 1.35);
  game.desertDoors = [bat(hx0, hz0, L.yaw), bat(hx1, hz1, L.yaw + Math.PI)];
  // bar along the back-left, shelves of bottles behind it, stools
  L.box(-3, 0.6, -3.6, 8, 1.2, 0.8, DARKWOOD);
  L.deco(-3, 1.23, -3.6, 8.2, 0.07, 1.0, 0x7a4a26);
  L.deco(-3, 0.12, -3.1, 8, 0.06, 0.06, 0xd8b45a); // brass foot rail
  L.box(-3, 1.4, -6.55, 9, 2.8, 0.6, WOOD2);
  for (let i = 0; i < 2; i++) L.deco(-3, 1.6 + i * 0.7, -6.2, 8.6, 0.06, 0.3, 0x6b4a2a);
  const BOT = [0x3a9a4a, 0x8a3a2a, 0xd8b45a, 0x3a5aaa, 0xeeeeee];
  for (let i = 0; i < 22; i++) { const lx = -7 + i * 0.4, row = i % 2; L.cyl(lx, 1.85 + row * 0.7, -6.2, 0.07, 0.42, BOT[i % 5], { collide: false, seg: 6 }); }
  L.deco(-3, 3.6, -6.24, 3.4, 1.4, 0.05, 0xd8e8f0); // mirror
  L.deco(-3, 3.6, -6.27, 3.7, 1.7, 0.04, 0xd8b45a);
  for (let i = 0; i < 6; i++) lfurn(game, L, 'stool', -6.5 + i * 1.3, 0, -2.6, 0, 0x7a4a26);
  // tables with chairs, a piano on the right wall, a little stage at the back right
  for (const [tx, tz] of [[-4.5, 2.6], [-1, 3.6], [2.4, 1.2]]) {
    lfurn(game, L, 'roundTable', tx, 0, tz, 0, 0xa8743f);
    lfurn(game, L, 'chair', tx - 0.9, 0, tz, Math.PI / 2, 0x8a5a32);
    lfurn(game, L, 'chair', tx + 0.9, 0, tz, -Math.PI / 2, 0x8a5a32);
  }
  piano(game, L, w / 2 - T - 0.3, 3.4, -Math.PI / 2);
  L.box(5.4, 0.25, -4.6, 4.6, 0.5, 4.0, 0x7a4a26);
  L.deco(5.4, 2.6, -6.6, 4.6, 4.2, 0.05, 0xc8343c); // curtain
  L.stairs(2.7, -4.0, 0, 3.1, -4.0, 0.5, 1.2, WOOD3);
  // moose-ish trophy and lamps on the walls
  L.deco(-w / 2 + T + 0.1, 3.4, 0, 0.2, 0.6, 0.5, 0x7a4a26);
  L.deco(-w / 2 + T + 0.4, 3.5, 0, 0.5, 0.35, 0.3, 0x6b4a2a);
  for (const s of [-1, 1]) L.deco(-w / 2 + T + 0.3, 4.0, s * 0.45, 0.06, 0.5, 0.4, 0xe8dcc0, { euler: [0, 0, s * 0.4] });
  barrel(kit, ...xz(L, 7.3, d / 2 + 2.1), L.y0 + 0.3);
  barrel(kit, ...xz(L, -7.3, d / 2 + 2.1), L.y0 + 0.3);
  return L;
}
const xz = (L, lx, lz) => L.w(lx, lz);

// A batwing half-door: thin slatted panel on a revolute joint with a spring back to closed.
function batwing(game, hx, y0, hz, yawW, width, height) {
  const W = game.physics.world, rot = { x: 0, y: Math.sin(yawW / 2), z: 0, w: Math.cos(yawW / 2) };
  const hinge = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hx, y0 + height / 2, hz).setRotation(rot));
  const b = new Builder();
  b.rbox(width, height * 0.82, 0.06, 0.02, WOOD3, [0, -height * 0.09, 0]);
  for (let i = 0; i < 4; i++) b.box(width * 0.8, 0.04, 0.08, WOOD2, [0, -height * 0.4 + i * height * 0.22, 0]);
  // scalloped top
  b.add(new THREE.CylinderGeometry(width / 2, width / 2, 0.06, 12, 1, false, 0, Math.PI), WOOD3, [0, height * 0.32, 0], [Math.PI / 2, 0, 0]);
  b.box(0.06, height, 0.08, DARKWOOD, [-width / 2 + 0.03, 0, 0]);
  const c = Math.cos(yawW), s = Math.sin(yawW);
  const o = game.physics.dynamic({ x: hx + c * width / 2, y: y0 + height / 2, z: hz - s * width / 2 },
    [RAPIER.ColliderDesc.cuboid(width / 2, height / 2, 0.04).setMass(5).setFriction(0.3)], b.mesh(matVC), { rot, groups: NO_STATIC, kind: 'door', buoy: null, angDamp: 0.4 });
  game.scene.add(o.mesh);
  const j = W.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: -width / 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), hinge, o.body, true);
  j.setContactsEnabled?.(false);
  j.setLimits(-1.6, 1.6);
  j.configureMotorPosition(0, 18, 1.2); // springy, under-damped: they flap back and forth
  o.joint = j;
  return o;
}

// A barred jail door (like world/common.js addDoor, with bars instead of a panel).
function barDoor(game, hx, y0, hz, yawW, width, height) {
  const W = game.physics.world, rot = { x: 0, y: Math.sin(yawW / 2), z: 0, w: Math.cos(yawW / 2) };
  const hinge = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hx, y0 + height / 2, hz).setRotation(rot));
  const b = new Builder(), steel = 0x4a4f58;
  for (const y of [-height / 2 + 0.05, 0, height / 2 - 0.05]) b.box(width, 0.07, 0.07, steel, [0, y, 0]);
  for (let i = 0; i < 6; i++) b.cyl(0.025, 0.025, height, steel, [-width / 2 + 0.08 + i * (width - 0.16) / 5, 0, 0], null, 6);
  b.box(0.12, 0.2, 0.12, 0xd8b45a, [width / 2 - 0.1, 0, 0]);
  const c = Math.cos(yawW), s = Math.sin(yawW);
  const o = game.physics.dynamic({ x: hx + c * width / 2, y: y0 + height / 2, z: hz - s * width / 2 },
    [RAPIER.ColliderDesc.cuboid(width / 2, height / 2, 0.05).setMass(25)], b.mesh(matVC), { rot, groups: NO_STATIC, kind: 'door', buoy: null, angDamp: 1.5 });
  game.scene.add(o.mesh);
  const j = W.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: -width / 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), hinge, o.body, true);
  j.setContactsEnabled?.(false);
  j.setLimits(-1.7, 0);
  j.configureMotorPosition(0, 6, 4);
  return o;
}

// ---- sheriff's office with a jail cell -----------------------------------------------------------
function sheriff(game, kit, R) {
  const L = new R.Local(kit, -1001, ST - 8 - 5, 0, Y + 0.3);
  const w = 11, d = 10, h = 4.4;
  building(game, L, { w, d, h, wall: 0x9a7a5a, facadeColor: 0x8a6a4a, door: { lx: -2.5, w: 1.4, h: 2.4 }, windows: [1.5], lights: [-2.5, 2.5], business: 'office', open: false, posters: false });
  R.sign('SHERIFF', L.v3(0, 0, d / 2 + 0.16).x, L.y0 + h + 1.2, L.v3(0, 0, d / 2 + 0.16).z, 0, 6, '#6b4a2a', '#ffe8b0');
  const [dx, dz] = L.w(-2.5 - 0.7, d / 2 - T / 2);
  R.common.addDoor(game, dx, L.y0 + 0.04, dz, L.yaw, 1.4, 2.4, 0x6b4a2a);
  // star over the door
  const st = new Builder();
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; st.cone(0.16, 0.5, 0xffd23f, [Math.sin(a) * 0.22, Math.cos(a) * 0.22, 0], [0, 0, -a], 4); }
  st.cyl(0.2, 0.2, 0.06, 0xffd23f, [0, 0, 0], [Math.PI / 2, 0, 0], 10);
  const sm = st.mesh(matVC); const sp = L.v3(-2.5, 3.0, d / 2 + 0.05); sm.position.set(sp.x, sp.y, sp.z); game.scene.add(sm);
  // desk, chair, gun rack, wanted posters
  L.box(-2.6, 0.4, -1.2, 2.2, 0.8, 1.0, DARKWOOD);
  L.deco(-2.6, 0.82, -1.2, 2.3, 0.05, 1.1, 0x7a4a26);
  L.deco(-3.2, 0.95, -1.2, 0.35, 0.22, 0.25, 0x333333); // lamp base
  lfurn(game, L, 'chair', -2.6, 0, -2.2, 0, 0x8a5a32);
  lfurn(game, L, 'chair', -2.6, 0, -0.1, Math.PI, 0x8a5a32);
  const lw = -w / 2 + T + 0.03;
  poster(game, L, 'wanted_pete', lw, 2.3, -1.2, Math.PI / 2, 0.9, 1.25, { bg: '#f2e4c4', title: 'WANTED', sub: 'Wobbly Pete', fg: '#5a3a1a', blob: '#8a5a32' });
  poster(game, L, 'wanted_kid', lw, 2.3, 1.2, Math.PI / 2, 0.9, 1.25, { bg: '#f2e4c4', title: 'WANTED', sub: 'Cactus Kid', fg: '#5a3a1a', blob: '#4f9a3a' });
  // jail cell in the back-right corner: bar wall along lz = -0.6, bar door, bunk
  const cx0 = 0.4, cz = -0.6, steel = 0x4a4f58;
  for (let lx = cx0; lx <= w / 2 - T; lx += 0.22) if (lx < 1.0 || lx > 2.4) L.cyl(lx, h / 2, cz, 0.03, h, steel, { collide: false, seg: 5 });
  L.deco((cx0 + w / 2 - T) / 2, h - 0.35, cz, w / 2 - T - cx0, 0.1, 0.1, steel);
  L.deco((cx0 + w / 2 - T) / 2, 0.15, cz, w / 2 - T - cx0, 0.1, 0.1, steel);
  L.solid((cx0 + 1.0) / 2, h / 2, cz, 1.0 - cx0, h, 0.1);
  L.solid((2.4 + w / 2 - T) / 2, h / 2, cz, w / 2 - T - 2.4, h, 0.1);
  for (let lz = cz; lz >= -d / 2 + T; lz -= 0.22) L.cyl(cx0, h / 2, lz, 0.03, h, steel, { collide: false, seg: 5 });
  L.solid(cx0, h / 2, (cz - d / 2 + T) / 2, 0.1, h, cz + d / 2 - T);
  const [jx, jz] = L.w(1.0, cz);
  barDoor(game, jx, L.y0 + 0.03, jz, L.yaw, 1.4, 2.5);
  kit.bench(...L.w(3.4, -d / 2 + 0.8), L.yaw, L.y0);
  L.deco(4.5, 0.4, -3.6, 0.5, 0.35, 0.5, 0xd8d8d8); // bucket
  // a ring of keys on a hook by the cell
  L.deco(-0.2, 2.0, -0.5, 0.06, 0.06, 0.06, steel);
  return L;
}

// ---- general store ------------------------------------------------------------------------------------
function store(game, kit, R) {
  const L = new R.Local(kit, -942, ST - 8 - 6, 0, Y + 0.3);
  const w = 12, d = 12, h = 4.6;
  building(game, L, { w, d, h, wall: 0xc8504a, facadeColor: 0xb8443e, door: { lx: 0, w: 1.6, h: 2.5 }, windows: [-3.5, 3.5], lights: [-3, 3], floor: 0xb98a5a, business: 'market' });
  R.sign('GENERAL STORE', L.v3(0, 0, d / 2 + 0.16).x, L.y0 + h + 1.2, L.v3(0, 0, d / 2 + 0.16).z, 0, 7.5, '#9a3a32', '#ffe8b0');
  const [dx, dz] = L.w(-0.8, d / 2 - T / 2);
  R.common.addDoor(game, dx, L.y0 + 0.04, dz, L.yaw, 1.6, 2.5, 0x6b4a2a, { glass: true });
  // counter with a till + jars, shelves along the walls, goods
  L.box(-2.5, 0.55, -2.8, 4.5, 1.1, 0.8, DARKWOOD);
  L.deco(-2.5, 1.12, -2.8, 4.6, 0.05, 0.9, 0x7a4a26);
  L.box(-3.8, 1.35, -2.9, 0.6, 0.45, 0.45, 0x8a8f96);
  for (let i = 0; i < 4; i++) L.cyl(-1.6 + i * 0.4, 1.3, -2.8, 0.13, 0.3, 0xd8e8f0, { collide: false, seg: 8 });
  const GOODS = [0xc8343c, 0x3f8cff, 0xffd23f, 0x55a84a, 0xe8e0d0, 0xff8a3d, 0x8a5a32];
  const shelf = (lx, lz, len, yaw) => {
    L.box(lx, 1.2, lz, len, 2.4, 0.5, WOOD2, { yaw });
    for (let r = 0; r < 3; r++) for (let i = 0; i < Math.floor(len / 0.45); i++) {
      const t = -len / 2 + 0.25 + i * 0.45, c = Math.cos(yaw), s = Math.sin(yaw);
      L.deco(lx + t * c + 0.3 * s, 0.75 + r * 0.7, lz - t * s + 0.3 * c, 0.3, 0.32, 0.25, GOODS[(i * 3 + r) % GOODS.length], { yaw });
    }
  };
  shelf(0, -d / 2 + 0.55, w - 1.2, 0);
  shelf(-w / 2 + 0.55, 1.2, 5, Math.PI / 2);
  shelf(w / 2 - 0.55, 1.2, 5, -Math.PI / 2);
  for (const [lx, lz] of [[2.6, 1.5], [3.4, 2.4], [2.2, -1.6]]) barrel(kit, ...L.w(lx, lz), L.y0);
  for (const [lx, lz] of [[-3.4, 2.6], [-2.6, 3.4]]) { L.box(lx, 0.35, lz, 0.7, 0.7, 0.5, 0xe2cfa0, { round: 0.15 }); } // flour sacks
  for (const [lx, lz] of [[4.5, d / 2 + 2], [-4.6, d / 2 + 2.1]]) crate(kit, ...L.w(lx, lz), L.y0 + 0.3);
  return L;
}

// ---- water tower (ladder up to a walkway; a present waits up there) --------------------------------------
export const WATER_TOWER = { x: -1004, z: -6 };
function waterTower(game, kit, R) {
  const { x, z } = WATER_TOWER, g = Y, top = g + 9;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    kit.cyl(x + sx * 2.3, g + 4.5, z + sz * 2.3, 0.2, 9, WOOD2, { seg: 8, euler: [sz * -0.04, 0, sx * 0.04] });
    for (const y of [3, 6]) kit.deco(x + sx * 2.25, g + y, z, 0.12, 0.12, 4.6, WOOD3);
  }
  for (const y of [3, 6]) for (const sz of [-1, 1]) kit.deco(x, g + y, z + sz * 2.25, 4.6, 0.12, 0.12, WOOD3);
  // walkway deck + rail, tank, conical roof, spout
  kit.box(x, top - 0.12, z, 8.4, 0.24, 8.4, WOOD2);
  const L = new R.Local(kit, x, z, 0, top);
  for (const [ax, az, bx, bz] of [[-4.1, -4.1, 4.1, -4.1], [4.1, -4.1, 4.1, 4.1], [-4.1, 4.1, -0.6, 4.1], [0.6, 4.1, 4.1, 4.1], [-4.1, -4.1, -4.1, 4.1]]) L.rail(ax, az, bx, bz, 0, 1.0, WOOD3);
  kit.cyl(x, top + 2.2, z, 3, 4.4, 0x9a6a3a, { seg: 16 });
  for (const y of [0.5, 2.2, 3.9]) kit.cyl(x, top + y, z, 3.05, 0.12, 0x555560, { seg: 16, collide: false });
  kit.cone(x, top + 5.3, z, 3.5, 1.9, 0x6b4a2a, { seg: 16 });
  kit.cyl(x - 3.1, top + 1.0, z, 0.15, 1.2, 0x555560, { collide: false, euler: [0, 0, 0.6] });
  // ladder on the south side, from the ground to the deck (pops you over the rail gap)
  const lz = z + 4.35;
  for (const sx of [-0.35, 0.35]) kit.cyl(x + sx, g + (top - g + 1) / 2, lz, 0.05, top - g + 1, WOOD3, { collide: false, seg: 5 });
  for (let y = 0.4; y < top - g + 0.9; y += 0.4) kit.deco(x, g + y, lz, 0.7, 0.05, 0.05, WOOD3);
  kit.box(x, g + (top - g) / 2, lz - 0.2, 1.0, top - g - 0.3, 0.1, WOOD2); // backboard (the ladder needs something to lean on)
  R.common.ladder(game, x, lz, g, top, 0, -1, 0.45);
  return { x, z, top };
}

// ---- windmill (the wheel turns with the wind) ---------------------------------------------------------
function windmill(game, kit, x, z) {
  const g = Y, H = 13;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(x + sx * 1.1, g + H / 2, z + sz * 1.1, 0.08, H, 0x8a8f96, { seg: 5, euler: [sz * -0.07, 0, sx * 0.07] });
  for (let y = 2; y < H; y += 2.5) {
    const k = 1.1 * (1 - y / H * 0.85);
    kit.deco(x, g + y, z + k, 2 * k, 0.06, 0.06, 0x8a8f96); kit.deco(x, g + y, z - k, 2 * k, 0.06, 0.06, 0x8a8f96);
    kit.deco(x + k, g + y, z, 0.06, 0.06, 2 * k, 0x8a8f96); kit.deco(x - k, g + y, z, 0.06, 0.06, 2 * k, 0x8a8f96);
  }
  kit.box(x, g + H + 0.2, z, 0.5, 0.5, 1.2, 0x8a8f96, { collide: false });
  kit.deco(x, g + H + 0.4, z - 1.9, 0.06, 1.1, 1.8, 0xc8343c); // tail vane
  kit.deco(x, g + H + 0.4, z - 1.1, 0.06, 0.06, 1.6, 0x8a8f96);
  const b = new Builder();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; b.box(0.3, 1.6, 0.03, i % 2 ? 0xe8e0d0 : 0xc8343c, [Math.sin(a) * 1.35, Math.cos(a) * 1.35, 0], [0, 0, -a + 0.0]); }
  b.torus(2.1, 0.05, 0x8a8f96, [0, 0, 0], null, 24);
  b.torus(0.55, 0.05, 0x8a8f96, [0, 0, 0], null, 14);
  b.cyl(0.15, 0.15, 0.3, 0x555560, [0, 0, 0.05], [Math.PI / 2, 0, 0], 8);
  const wheel = b.mesh(matVC);
  wheel.position.set(x, g + H + 0.3, z + 0.8);
  game.scene.add(wheel);
  game.updaters.push((dt) => { wheel.rotation.z -= dt * (1.6 + Math.sin(game.time * 0.3) * 0.8); });
  // trough + pump pipe at the base
  kit.box(x + 2.4, g + 0.4, z, 1.0, 0.8, 2.6, WOOD2);
  kit.deco(x + 2.4, g + 0.75, z, 0.8, 0.05, 2.4, 0x5aa8d8);
}

// ---- corral with horses -------------------------------------------------------------------------------
function corral(game, kit, R) {
  const x0 = -990, x1 = -962, z0 = -14, z1 = 6, g = Y;
  kit.fence(x0, z0, x1 - 0, z0, WOOD3, 1.3, g);
  kit.fence(x0, z1, x1, z1, WOOD3, 1.3, g);
  kit.fence(x0, z0, x0, z1, WOOD3, 1.3, g);
  kit.fence(x1, z0, x1, z0 + 7, WOOD3, 1.3, g);  // gate gap on the east side
  kit.fence(x1, z0 + 13, x1, z1, WOOD3, 1.3, g);
  // stable shed in the back with a hay loft
  const L = new R.Local(kit, (x0 + x1) / 2, z1 - 2.6, Math.PI, g);
  L.box(0, 1.6, -1.8, 14, 3.2, 0.25, WOOD2);
  for (const s of [-1, 1]) L.box(s * 7, 1.6, 0, 0.25, 3.2, 3.6, WOOD2);
  L.box(0, 3.4, 0, 14.6, 0.2, 4.2, 0x6b4a2a, { euler: [-0.12, 0, 0] });
  for (const lx of [-4, 0, 4]) L.box(lx, 0.75, -0.9, 2, 1.5, 0.25, WOOD3);
  for (const [lx, lz] of [[-5.6, 3], [-4.2, 3.3], [5.4, 3.2]]) L.box(lx, 0.45, lz, 1.2, 0.9, 0.8, 0xe8c66a);
  // water trough
  kit.box(x0 + 4, g + 0.4, z0 + 3, 2.6, 0.8, 1.0, WOOD2);
  kit.deco(x0 + 4, g + 0.76, z0 + 3, 2.4, 0.05, 0.8, 0x5aa8d8);
  R.vehicle('horse', -980, -4, 0.6, 0x9a6232);
  R.vehicle('horse', -970, -9, -2.2, 0xf2e8d8);
  R.vehicle('horse', -973, 0, 2.4, 0x5a3a22);
}

// ---- false-front shops on the south side (solid) + street furniture ------------------------------------
function southStreet(game, kit, R) {
  const front = ST + 8;
  for (const [x, w, col, name] of [[-944, 9, 0x6aa0b8, 'DUSTVILLE HOTEL'], [-932, 8, 0xd8b45a, 'BANK']]) {
    const L = new R.Local(kit, x, front + 4.5, Math.PI, Y);
    L.box(0, 2.4, 0, w, 4.8, 9, col);
    L.box(0, 5.8, 4.4, w, 2.2, 0.25, col);
    L.deco(0, 7.0, 4.4, w + 0.3, 0.16, 0.4, CREAM);
    L.box(0, 4.85, 0, w + 0.3, 0.2, 9.3, 0x6b4a2a);
    L.box(0, 0.15, 5.9, w, 0.3, 2.8, WOOD3);
    L.box(0, 3.3, 5.85, w, 0.12, 2.7, WOOD2, { euler: [0.12, 0, 0] });
    for (const px of [-w / 2 + 0.2, w / 2 - 0.2]) L.cyl(px, 1.65, 7.0, 0.09, 3.3, WOOD3, { seg: 6 });
    L.deco(0, 1.3, 4.53, 1.5, 2.5, 0.06, 0x6b4a2a);
    for (const wx of [-w / 4 - 0.4, w / 4 + 0.4]) L.deco(wx, 2.2, 4.53, 1.3, 1.4, 0.06, 0x9fd8ff);
    const p = L.v3(0, 5.8, 4.58);
    R.sign(name, p.x, p.y, p.z, L.yaw, Math.min(w * 0.75, 6), '#6b4a2a', '#ffe8b0');
  }
  // hitching rails, barrels, lamps, a wagon
  for (const x of [-1012, -985, -958, -930]) {
    for (const z of [ST - 4.6]) { kit.cyl(x - 1.2, Y + 0.55, z, 0.08, 1.1, WOOD3, { seg: 5 }); kit.cyl(x + 1.2, Y + 0.55, z, 0.08, 1.1, WOOD3, { seg: 5 }); kit.deco(x, Y + 1.05, z, 2.5, 0.1, 0.1, WOOD3); }
  }
  for (const x of [-1016, -990, -952, -926, -906]) kit.lamp(x, ST - 4.2, Y);
  for (const x of [-1000, -965, -937]) kit.lamp(x, ST + 5.0, Y);
  for (const [x, z] of [[-1015, ST + 6.5], [-1014, ST + 7.4], [-915, ST - 6.5], [-955, ST + 7]]) barrel(kit, x, z, Y);
  wagon(kit, -922, ST + 12, 0.3);
  // welcome arch over the east end of the street
  const ax = -903;
  for (const s of [-1, 1]) kit.cyl(ax, Y + 3.2, ST + s * 6.2, 0.22, 6.4, WOOD2, { seg: 8 });
  kit.box(ax, Y + 6.2, ST, 0.4, 0.5, 13, WOOD2);
  R.sign('DUSTVILLE', ax - 0.25, Y + 5.2, ST, -Math.PI / 2, 6, '#8a5a32', '#ffe8b0');
  R.sign('DUSTVILLE', ax + 0.25, Y + 5.2, ST, Math.PI / 2, 6, '#8a5a32', '#ffe8b0');
}
export function wagon(kit, x, z, yaw) {
  const L = { c: Math.cos(yaw), s: Math.sin(yaw) };
  const P = (lx, lz) => [x + lx * L.c + lz * L.s, z - lx * L.s + lz * L.c];
  kit.box(...[P(0, 0)[0]], Y + 1.1, P(0, 0)[1], 1.8, 0.6, 3.4, WOOD2, { yaw });
  for (const [lx, lz] of [[-1, 1.1], [1, 1.1], [-1, -1.1], [1, -1.1]]) {
    const [wx, wz] = P(lx, lz);
    kit.cyl(wx, Y + 0.7, wz, 0.7, 0.1, WOOD3, { euler: [0, yaw, Math.PI / 2], seg: 12 });
  }
  // canvas cover hoops
  for (const lz of [-1.2, 0, 1.2]) { const [cx, cz] = P(0, lz); kit.cyl(cx, Y + 1.6, cz, 0.95, 0.5, 0xf2ead8, { euler: [Math.PI / 2, yaw, 0], seg: 10, collide: false }); }
  const [hx, hz] = P(0, 2.4); kit.deco(hx, Y + 0.9, hz, 0.1, 0.1, 1.6, WOOD3, { yaw });
}

export function buildTown(game, kit, R) {
  saloon(game, kit, R);
  sheriff(game, kit, R);
  store(game, kit, R);
  const wt = waterTower(game, kit, R);
  windmill(game, kit, -914, -2);
  corral(game, kit, R);
  southStreet(game, kit, R);
  game.desertTown = { waterTower: wt };
  return wt;
}
