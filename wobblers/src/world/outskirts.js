// Everything outside the ring road: kart track, beach and pier, lake camp,
// farm, mountain lookout, lighthouse, forests and clouds.
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { FLAT, LAKE, MOUNTAIN, fbm } from '../terrain.js';
import { groundAt as heightAt } from './common.js';
import { Builder, signMesh } from '../mesh.js';
import { Vehicle } from '../vehicles.js';

let seed = 99;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export function buildOutskirts(game, kit) {
  kartTrack(game, kit);
  beach(game, kit);
  lakeCamp(game, kit);
  farm(game, kit);
  mountainTop(game, kit);
  lighthouse(game, kit, 214, 222);
  forests(game, kit);
  clouds(game);
}

// ---- kart track -------------------------------------------------------------
function kartTrack(game, kit) {
  const cx = 242.5, R = 37.5, half = 50, W = 12;
  // centre line: two straights along z joined by semicircles
  const path = [];
  for (let z = -half; z <= half; z += 4) path.push([cx - R, z]);
  for (let a = 0; a <= Math.PI; a += Math.PI / 24) path.push([cx - R * Math.cos(a), half + R * Math.sin(a)]);
  for (let z = half; z >= -half; z -= 4) path.push([cx + R, z]);
  for (let a = 0; a <= Math.PI; a += Math.PI / 24) path.push([cx + R * Math.cos(a), -half - R * Math.sin(a)]);
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i], [x1, z1] = path[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) continue;
    const yaw = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    kit.deco(mx, 0.04, mz, W, 0.08, len + 0.6, 0x4a4d55, { yaw });
    // curbs
    const nx = Math.cos(yaw), nz = -Math.sin(yaw);
    for (const s of [-1, 1]) {
      kit.deco(mx + nx * s * (W / 2 + 0.4), 0.06, mz + nz * s * (W / 2 + 0.4), 0.8, 0.12, len + 0.6, (i % 2) ? 0xffffff : 0xff3a3a, { yaw });
      // tyre walls on the outside, low walls on the inside
      const off = s * (W / 2 + 1.6);
      const gate = s < 0 && Math.abs(mz) < 8 && mx < cx;   // gap where the avenue arrives
      if (!gate) kit.box(mx + nx * off, 0.4, mz + nz * off, 0.9, 0.8, len + 0.3, i % 2 ? 0x222222 : 0x3a3a3a, { yaw, restitution: 0.4 });
    }
  }
  // start line + grid
  for (let k = 0; k < 12; k++) kit.deco(cx - R - W / 2 + 0.5 + k, 0.085, 0 + (k % 2) * 0.5, 1, 0.01, 0.5, 0x111111);
  for (let k = 0; k < 12; k++) kit.deco(cx - R - W / 2 + 0.5 + k, 0.085, 0.5 - (k % 2) * 0.5, 1, 0.01, 0.5, 0xffffff);
  const arch = signMesh('KART RACING', 10, '#ff3a3a');
  arch.position.set(cx - R, 5.6, 0.2); game.scene.add(arch);
  for (const s of [-1, 1]) kit.cyl(cx - R + s * (W / 2 + 0.8), 2.9, 0, 0.25, 5.8, 0xffffff);
  kit.deco(cx - R, 5.6, 0, W + 2, 1.6, 0.4, 0xff3a3a);
  for (let i = 0; i < 6; i++) {
    const x = cx - R + (i % 2 ? 2.5 : -2.5), z = 5 + Math.floor(i / 2) * 4.5;
    game.vehicles.push(new Vehicle(game, 'kart', x, 0.5, z, Math.PI, [0xff3a3a, 0x3f8cff, 0xffd23f, 0x55d85a, 0xb46cff, 0xff8a3d][i]));
  }
  // grandstand on the east straight
  for (let i = 0; i < 5; i++) kit.box(cx + R + 12 + i * 1.3, 0.35 + i * 0.35, 0, 1.3, 0.7 + i * 0.7, 40, i % 2 ? 0xffffff : 0x3f8cff);
  kit.deco(cx + R + 15, 5.2, 0, 7, 0.3, 42, 0xff3a3a);
  // tyre stacks in the infield
  for (let i = 0; i < 6; i++) {
    const b = new Builder();
    for (let k = 0; k < 3; k++) b.torus(0.45, 0.18, 0x222222, [0, k * 0.36 - 0.36, 0], [Math.PI / 2, 0, 0], 12);
    const o = game.physics.dynamic({ x: cx - 10 + i * 4, y: 0.6, z: -20 + (i % 2) * 40 }, [RAPIER.ColliderDesc.cylinder(0.55, 0.62).setMass(20)], b.mesh());
    game.scene.add(o.mesh);
  }
}

// ---- beach + pier -------------------------------------------------------------
function beach(game, kit) {
  // parking at the end of the road
  kit.deco(0, 0.04, 302, 40, 0.08, 14, 0x5a5d66);
  for (let i = 0; i <= 8; i++) kit.deco(-20 + i * 5, 0.085, 302, 0.15, 0.01, 12, 0xffffff);
  // pier
  const px = 24, z0 = 300, z1 = 368, y = 1.3;
  kit.box(px, y, (z0 + z1) / 2, 4.5, 0.25, z1 - z0, 0xb98a5a);
  for (let z = z0 + 2; z < z1; z += 5) for (const s of [-1, 1]) kit.cyl(px + s * 2.1, (y - 6) / 2, z, 0.2, y + 6, 0x8a6a4a);
  for (let z = z0; z < z1; z += 2.5) for (const s of [-1, 1]) kit.cyl(px + s * 2.2, y + 0.5, z, 0.06, 1.0, 0x8a6a4a, { collide: false });
  kit.box(px - 2.2, y + 0.9, (z0 + z1) / 2, 0.1, 0.12, z1 - z0, 0x8a6a4a); kit.box(px + 2.2, y + 0.9, (z0 + z1) / 2, 0.1, 0.12, z1 - z0, 0x8a6a4a);
  kit.wedge(px, 0, z0 - 3, 4.5, 6, y + 0.12, 0xb98a5a, { yaw: 0 });
  // boats moored alongside
  game.vehicles.push(new Vehicle(game, 'boat', px - 5, 0.2, 345, 0, 0xff5a5a));
  game.vehicles.push(new Vehicle(game, 'boat', px + 5, 0.2, 352, Math.PI, 0x3f8cff));
  game.vehicles.push(new Vehicle(game, 'boat', px - 5, 0.2, 360, 0, 0xffd23f));
  // beach stuff
  for (let i = 0; i < 9; i++) {
    const x = -95 + i * 18 + (i % 2) * 4, z = 312 + (i % 3) * 3;
    if (Math.abs(x - px) < 6) continue;
    const h = Math.max(0, heightAt(x, z));
    kit.cyl(x, h + 1.3, z, 0.05, 2.6, 0xffffff);
    const b = kit.b(x, z), col = [0xff5a5a, 0x3f8cff, 0xffd23f, 0x55d85a][i % 4];
    for (let k = 0; k < 8; k++) b.add(new THREE.ConeGeometry(1.6, 0.6, 8, 1, true, k * Math.PI / 4, Math.PI / 4), k % 2 ? 0xffffff : col, [x, h + 2.7, z]);
    kit.deco(x + 1.5, h + 0.03, z + 1, 1.0, 0.04, 2.0, [0xff7fc8, 0x6ac8ff, 0xffd96a][i % 3]);
  }
  for (let i = 0; i < 14; i++) {
    const x = -110 + i * 17 + rnd() * 6, z = 294 + rnd() * 8;
    kit.tree(x, z, Math.max(0, heightAt(x, z)), 2, 0.8 + rnd() * 0.3);
  }
  // volleyball net
  const vx = -40, vz = 316, vh = Math.max(0, heightAt(vx, vz));
  kit.cyl(vx - 5, vh + 1.2, vz, 0.08, 2.4, 0xdddddd); kit.cyl(vx + 5, vh + 1.2, vz, 0.08, 2.4, 0xdddddd);
  kit.box(vx, vh + 2.1, vz, 10, 0.8, 0.04, 0xffffff);
  // lifeguard tower
  const lx = 60, lz = 312, lh = Math.max(0, heightAt(lx, lz));
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(lx + ox, lh + 1.5, lz + oz, 0.1, 3, 0xffffff);
  kit.box(lx, lh + 3.1, lz, 2.6, 0.2, 2.6, 0xffffff);
  kit.deco(lx, lh + 4.2, lz, 2.6, 0.2, 2.6, 0xff3a3a);
  for (let k = 0; k < 8; k++) kit.box(lx, lh + 0.2 + k * 0.38, lz - 1.6 - (7 - k) * 0.35, 1, 0.12, 0.35, 0xffffff);
  // surf hut
  kit.box(-70, 1.4, 298, 6, 2.8, 4, 0x6ac8ff);
  kit.deco(-70, 3.0, 298, 7, 0.4, 5, 0xffd23f);
  const s = signMesh('SURF SHACK', 5, '#3f8cff');
  s.position.set(-70, 2.2, 300.05); game.scene.add(s);
  // sand castle
  const sx = 40, sz = 318, sh = Math.max(0, heightAt(sx, sz));
  kit.box(sx, sh + 0.4, sz, 2, 0.8, 2, 0xe9cf8a);
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { kit.cyl(sx + ox, sh + 0.6, sz + oz, 0.35, 1.2, 0xe9cf8a); kit.cone(sx + ox, sh + 1.45, sz + oz, 0.4, 0.5, 0xe9cf8a); }
}

// ---- lake with a camp -------------------------------------------------------
function lakeCamp(game, kit) {
  const { x: lx, z: lz, r } = LAKE;
  // dock on the south shore
  const dx = lx, dz0 = lz + r * 0.62, dz1 = lz + r * 0.25;
  const dh = Math.max(heightAt(dx, dz0), 0) + 0.6;
  kit.box(dx, dh, (dz0 + dz1) / 2, 3, 0.2, dz0 - dz1, 0xb98a5a);
  for (let z = dz1 + 1; z < dz0; z += 3) for (const s of [-1, 1]) kit.cyl(dx + s * 1.4, dh - 3, z, 0.15, 6, 0x8a6a4a, { collide: false });
  game.vehicles.push(new Vehicle(game, 'boat', dx - 4, 0.2, dz1 + 3, Math.PI, 0x55d85a));
  game.vehicles.push(new Vehicle(game, 'boat', dx + 4, 0.2, dz1 + 6, Math.PI, 0xff8a3d));
  // tents + campfire + log seats
  const cx = lx + 10, cz = lz + r + 12, ch = heightAt(cx, cz);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.4;
    const tx = cx + Math.sin(a) * 7, tz = cz + Math.cos(a) * 7, th = heightAt(tx, tz);
    kit.cone(tx, th + 1.1, tz, 1.8, 2.2, [0xff5a5a, 0x3f8cff, 0xffd23f][i], { seg: 4, euler: [0, a + Math.PI / 4, 0] });
    game.physics.cylinder(tx, th + 0.8, tz, 1.3, 1.6, {});
  }
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; kit.cyl(cx + Math.cos(a) * 0.5, ch + 0.15, cz + Math.sin(a) * 0.5, 0.08, 1.0, 0x6a4a2a, { euler: [0, a, Math.PI / 2], collide: false }); }
  const flames = new Builder();
  flames.cone(0.45, 1.0, 0xff8a3d, [0, 0.5, 0]); flames.cone(0.25, 0.7, 0xffd23f, [0, 0.5, 0]);
  const fm = new THREE.Mesh(flames.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  fm.position.set(cx, ch, cz); game.scene.add(fm);
  game.updaters.push((dt, t) => { fm.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 9) * 0.15, 1 + Math.cos(t * 11) * 0.08); });
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * Math.PI * 2 + 0.8, x = cx + Math.sin(a) * 2.8, z = cz + Math.cos(a) * 2.8;
    kit.cyl(x, heightAt(x, z) + 0.25, z, 0.25, 1.8, 0x8a5a36, { euler: [0, a + Math.PI / 2, Math.PI / 2] });
  }
  // log cabin
  const kx = lx - 22, kz = lz + r + 8, kh = heightAt(kx, kz);
  for (let i = 0; i < 6; i++) {
    kit.cyl(kx, kh + 0.25 + i * 0.45, kz - 3, 0.24, 7, 0x9a6a3a, { euler: [0, 0, Math.PI / 2] });
    kit.cyl(kx, kh + 0.25 + i * 0.45, kz + 3, 0.24, 7, 0x9a6a3a, { euler: [0, 0, Math.PI / 2] });
    kit.cyl(kx - 3.3, kh + 0.25 + i * 0.45, kz, 0.24, 6.4, 0x8a5a2a, { euler: [Math.PI / 2, 0, 0] });
    kit.cyl(kx + 3.3, kh + 0.25 + i * 0.45, kz, 0.24, 6.4, 0x8a5a2a, { euler: [Math.PI / 2, 0, 0] });
  }
  for (const s of [-1, 1]) kit.box(kx, kh + 3.6, kz + s * 1.7, 7.8, 0.2, 4.2, 0x5a8a4a, { euler: [s * 0.5, 0, 0] });
}

// ---- farm -------------------------------------------------------------------
function farm(game, kit) {
  const fx = 215, fz = -165, fh = heightAt(fx, fz);
  kit.box(fx, fh + 3, fz, 12, 6, 9, 0xd9483f);
  for (const s of [-1, 1]) kit.box(fx, fh + 7.0, fz + s * 2.4, 12.6, 0.25, 5.6, 0x5a5a5a, { euler: [s * 0.6, 0, 0] });
  kit.deco(fx, fh + 2.2, fz + 4.55, 4, 4.4, 0.1, 0xffffff);
  kit.cyl(fx + 9, fh + 5, fz, 2.2, 10, 0xdddddd, { seg: 14 });
  kit.sphere(fx + 9, fh + 10, fz, 2.2, 0x9aa7b5, { scale: [1, 0.7, 1] });
  kit.fence(fx - 15, fz + 8, fx + 15, fz + 8, 0xffffff);
  kit.fence(fx - 15, fz + 8, fx - 15, fz + 26, 0xffffff);
  kit.fence(fx + 15, fz + 8, fx + 15, fz + 26, 0xffffff);
  // hay bales you can push around
  for (let i = 0; i < 8; i++) {
    const b = new Builder();
    b.cyl(0.7, 0.7, 1.2, 0xe8c45a, [0, 0, 0], [0, 0, Math.PI / 2], 14);
    b.cyl(0.71, 0.71, 0.1, 0xd4ae45, [0.3, 0, 0], [0, 0, Math.PI / 2], 14);
    const x = fx - 10 + (i % 4) * 5, z = fz + 13 + Math.floor(i / 4) * 5;
    const o = game.physics.dynamic({ x, y: heightAt(x, z) + 0.68, z }, [RAPIER.ColliderDesc.cylinder(0.6, 0.7).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setMass(30)], b.mesh(), { angDamp: 1.2 });
    game.scene.add(o.mesh);
    o.body.sleep(); // the field slopes: stay put until someone pushes it
  }
  game.vehicles.push(new Vehicle(game, 'pickup', fx - 12, fh + 1.5, fz - 2, Math.PI / 2, 0x3f7f3f));
  // crops
  for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) {
    const x = fx + 22 + c * 2, z = fz - 10 + r * 3, h = heightAt(x, z);
    kit.deco(x, h + 0.35, z, 0.7, 0.7, 0.7, r % 2 ? 0x6fd055 : 0xffa23a, { round: 0.3 });
  }
}

// ---- mountain lookout -------------------------------------------------------
function mountainTop(game, kit) {
  const { x, z } = MOUNTAIN, h = heightAt(x, z);
  kit.box(x, h + 0.3, z, 6, 0.6, 6, 0x9a6a3a);
  for (const [ox, oz] of [[-2.7, -2.7], [2.7, -2.7], [-2.7, 2.7], [2.7, 2.7]]) kit.cyl(x + ox, h + 2, z + oz, 0.15, 3.4, 0x8a5a36);
  kit.cone(x, h + 4.2, z, 4.6, 1.8, 0xd9483f, { seg: 4, euler: [0, Math.PI / 4, 0] });
  kit.cyl(x + 3.5, h + 4, z, 0.06, 8, 0xdddddd);
  kit.deco(x + 4.3, h + 7.4, z, 1.6, 1.0, 0.05, 0xff5a8a);
  // boulders to push down the slope
  for (let i = 0; i < 4; i++) {
    const bx = x - 8 + i * 5, bz = z + 9, r = 1.1 + (i % 2) * 0.5;
    const bb = new Builder();
    bb.add(new THREE.DodecahedronGeometry(r, 1), 0x9a958a, [0, 0, 0]);
    const o = game.physics.dynamic({ x: bx, y: heightAt(bx, bz) + r - 0.05, z: bz }, [RAPIER.ColliderDesc.ball(r).setMass(60 * r * r * r).setFriction(0.9)], bb.mesh(), { angDamp: 0.3 });
    game.scene.add(o.mesh);
    o.body.sleep(); // waits on the slope until someone gives it a shove
  }
  // quads at the foot of the mountain
  for (let i = 0; i < 3; i++) {
    const qx = 30 + i * 4, qz = -190;
    game.vehicles.push(new Vehicle(game, 'quad', qx, heightAt(qx, qz) + 1, qz, Math.PI, [0xff5a5a, 0x55d85a, 0x3f8cff][i]));
  }
}

function lighthouse(game, kit, x, z) {
  const h = Math.max(0, heightAt(x, z));
  for (let i = 0; i < 6; i++) kit.cyl(x, h + 1.5 + i * 3, z, 2.2 - i * 0.15, 3, i % 2 ? 0xff3a3a : 0xffffff, { rTop: 2.2 - (i + 1) * 0.15, seg: 16 });
  kit.cyl(x, h + 19, z, 1.6, 2, 0xfff3a0, { seg: 12 });
  kit.cone(x, h + 20.8, z, 1.9, 1.6, 0x333333, { seg: 12 });
}

// ---- forests ------------------------------------------------------------------
function inFlat(x, z, m) {
  for (const f of FLAT) if (x > f[0] - m && x < f[1] + m && z > f[2] - m && z < f[3] + m) return true;
  return false;
}
function forests(game, kit) {
  let placed = 0, tries = 0;
  while (placed < 420 && tries < 6000) {
    tries++;
    const x = (rnd() * 2 - 1) * 330, z = (rnd() * 2 - 1) * 330;
    if (inFlat(x, z, 6)) continue;
    const r = Math.hypot(x, z * 0.95);
    if (r > 312) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 6) continue;
    if (Math.abs(x - 215) < 40 && Math.abs(z + 160) < 30) continue;
    const h = heightAt(x, z);
    if (h < 0.4 || h > 40) continue;
    const slope = Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) + Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2));
    if (slope > 3.2) continue;
    // clumps: prefer areas with higher noise
    if (fbm(x / 40, z / 40) < 0.42) continue;
    const kind = h > 14 || rnd() < 0.35 ? 1 : 0;
    kit.tree(x, z, h - 0.1, kind, 0.8 + rnd() * 0.6);
    placed++;
  }
  for (let i = 0; i < 80; i++) {
    const x = (rnd() * 2 - 1) * 320, z = (rnd() * 2 - 1) * 320;
    if (inFlat(x, z, 4) || Math.hypot(x, z) > 315) continue;
    const h = heightAt(x, z);
    if (h < 0) continue;
    if (rnd() < 0.5) kit.rock(x, z, h, 0.6 + rnd() * 1.6); else kit.bush(x, z, h, 0.8 + rnd() * 0.6);
  }
}

// ---- clouds -------------------------------------------------------------------
function clouds(game) {
  const b = new Builder();
  for (let i = 0; i < 28; i++) {
    const x = (rnd() * 2 - 1) * 450, z = (rnd() * 2 - 1) * 450, y = 85 + rnd() * 40;
    const n = 4 + (rnd() * 4 | 0);
    for (let k = 0; k < n; k++) b.sphere(6 + rnd() * 6, 0xffffff, [x + (k - n / 2) * 7, y + rnd() * 3, z + (rnd() - 0.5) * 8], [1.3, 0.75, 1], 8);
  }
  const m = new THREE.Mesh(b.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x9aa8b8, fog: false }));
  m.castShadow = false;
  game.scene.add(m);
  game.updaters.push((dt) => { m.position.x += dt * 1.2; if (m.position.x > 300) m.position.x -= 600; });
}
