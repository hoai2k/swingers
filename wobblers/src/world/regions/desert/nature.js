// Desert nature: saguaro and barrel cacti (prickly: walking into one bounces
// you back with a yelp), red rocks, dry shrubs, cattle skulls, and tumbleweeds
// that roll across the island on the wind (punch one to throw it). Tumbleweeds
// only simulate while somebody is on or near the island.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder, matVC } from '../../../mesh.js';
import { TOWN, OASIS, PYRAMID, DIG, GAS, MESAS, HIGHWAY, HIGHWAY_W, DIRT, canyonZ, MINE, polyDist } from './layout.js';

const PI = Math.PI, CACTUS = 0x4f9a3a, CACTUS2 = 0x5fae46, RED = 0xc4673f, RED2 = 0xa85a36;

// keep scatter off roads, the town and the landmarks
function clear(x, z) {
  if (x > TOWN.x0 - 8 && x < TOWN.x1 + 8 && z > TOWN.z0 - 8 && z < TOWN.z1 + 8) return false;
  if (Math.hypot(x - OASIS.x, z - OASIS.z) < OASIS.r + 6) return false;
  if (Math.hypot(x - PYRAMID.x, z - PYRAMID.z) < PYRAMID.half + 14) return false;
  if (x > DIG.x0 - 14 && x < DIG.x1 + 10 && z > DIG.z0 - 10 && z < DIG.z1 + 10) return false;
  if (Math.hypot(x - GAS.x, z - GAS.z) < 30) return false;
  if (Math.hypot(x + 760, z - 40) < 30) return false; // dock
  if (Math.abs(z - canyonZ(x)) < 10 && z < -150) return false;
  for (const p of [HIGHWAY, HIGHWAY_W, ...DIRT]) if (polyDist(x, z, p) < 8) return false;
  if (Math.abs(x + 880) < 8 && z < -100 && z > -200) return false; // plateau ramp
  if (x > MINE.x0 - 6 && x < MINE.x1 + 8 && z > MINE.z0 - 10 && z < MINE.z1 + 10) return false;
  return true;
}

export function saguaro(kit, x, z, g, s, rng) {
  const b = kit.b(x, z), H = (3 + rng() * 2.2) * s, r = 0.38 * s;
  b.cyl(r * 0.9, r, H, CACTUS, [x, g + H / 2, z], null, 8);
  b.sphere(r * 0.9, CACTUS, [x, g + H, z], null, 8);
  for (let i = 0; i < 4; i++) b.box(0.04, H * 0.9, 0.04, CACTUS2, [x + Math.sin(i * PI / 2) * r * 0.95, g + H * 0.48, z + Math.cos(i * PI / 2) * r * 0.95]);
  const arms = rng() < 0.2 ? 0 : rng() < 0.6 ? 2 : 1, a0 = rng() * PI;
  for (let k = 0; k < arms; k++) {
    const a = a0 + k * PI, ah = H * (0.35 + rng() * 0.2), out = 0.8 * s, up = H * (0.25 + rng() * 0.15), ar = r * 0.7;
    const dx = Math.cos(a), dz = Math.sin(a);
    b.cyl(ar, ar, out, CACTUS, [x + dx * out / 2, g + ah, z + dz * out / 2], [0, -a, PI / 2], 7);
    b.cyl(ar, ar, up, CACTUS, [x + dx * out, g + ah + up / 2, z + dz * out], null, 7);
    b.sphere(ar, CACTUS, [x + dx * out, g + ah + up, z + dz * out], null, 7);
  }
  if (rng() < 0.3) b.sphere(0.13 * s, 0xff6aa8, [x, g + H + r * 0.8, z], null, 6); // flower
  kit.phys.cylinder(x, g + H / 2, z, r, H, {});
  return { x, z, r: r + 0.15, y0: g, y1: g + H };
}
function barrelCactus(kit, x, z, g, s) {
  const b = kit.b(x, z);
  b.sphere(0.5 * s, CACTUS2, [x, g + 0.35 * s, z], [1, 0.85, 1], 9);
  b.sphere(0.12 * s, 0xffd23f, [x, g + 0.8 * s, z], null, 6);
  kit.phys.ball(x, g + 0.35 * s, z, 0.45 * s, {});
  return { x, z, r: 0.5 * s + 0.1, y0: g, y1: g + 0.8 * s };
}
export function redRock(kit, x, z, g, s, rng) {
  const b = kit.b(x, z);
  b.add(new THREE.DodecahedronGeometry(s, 0), rng() < 0.5 ? RED : RED2, [x, g + s * 0.3, z], [rng() * 3, rng() * 3, 0], [1, 0.6 + rng() * 0.4, 1.1]);
  kit.phys.ball(x, g + s * 0.2, z, s * 0.75, {});
}

function tumbleMesh() {
  const b = new Builder();
  for (let i = 0; i < 7; i++) b.torus(0.48 - (i % 3) * 0.08, 0.025, i % 2 ? 0xb08a4a : 0x9a7038, [0, 0, 0], [i * 0.9, i * 1.7, i * 0.4], 12);
  for (let i = 0; i < 10; i++) b.box(0.03, 0.7, 0.03, 0xa8803e, [0, 0, 0], [i * 1.3, i * 0.7, i * 2.1]);
  return b.geometry();
}

function tumbleweeds(game, R, N = 9) {
  const geo = tumbleMesh(), rng = R.rng(23), list = [];
  const spawnAt = (o) => {
    for (let k = 0; k < 20; k++) {
      const x = -1330 + rng() * 260, z = -110 + rng() * 380;
      if (!clear(x, z)) continue;
      const g = R.groundAt(x, z);
      if (g < 1) continue;
      o.body.setTranslation({ x, y: g + 1.2, z }, true);
      o.body.setLinvel({ x: 2, y: 0, z: 0 }, true);
      o.age = 0;
      return;
    }
  };
  for (let i = 0; i < N; i++) {
    const mesh = new THREE.Mesh(geo, matVC); mesh.castShadow = true;
    game.scene.add(mesh);
    const o = game.physics.dynamic({ x: -1200, y: 10, z: i * 20 }, [RAPIER.ColliderDesc.ball(0.5).setMass(2.5).setFriction(0.6).setRestitution(0.45)], mesh, { angDamp: 0.3, linDamp: 0.2, buoy: { r: 0.5, volume: 0.15 } });
    o.kind = 'tumbleweed';
    o.age = 0;
    spawnAt(o);
    R.common.throwable(game, o, { speed: 10, r: 0.5 });
    list.push(o);
  }
  let active = true, k = 0;
  game.steppers.push(() => {
    if (k++ % 30 === 0) {
      const want = game.players.some((p) => { const c = p.chest.translation(); return c.x < -640 && c.x > -1480 && Math.abs(c.z) < 480; });
      if (want !== active) { active = want; for (const o of list) { o.body.setEnabled(want); o.mesh.visible = want; } }
    }
    if (!active) return;
    const t = game.physics.time, gust = 1 + 0.6 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 1.3);
    for (const o of list) {
      const b = o.body, p = b.translation(), v = b.linvel();
      o.age += 1 / 60;
      if (p.x > -770 || p.y < -0.2 || Math.abs(p.z) > 420 || o.age > 150) { spawnAt(o); continue; }
      const m = 2.5, wx = 5.5 * gust, wz = 1.2 * Math.sin(t * 0.2 + p.x * 0.01);
      if (v.x < wx) b.applyImpulse({ x: (wx - v.x) * m * 0.02, y: 0, z: (wz - v.z) * m * 0.01 }, true);
      // little hops as it bounces along
      if (Math.random() < 0.006 && Math.abs(v.y) < 0.5) b.applyImpulse({ x: 0, y: m * (2.5 + Math.random() * 2), z: 0 }, true);
    }
  });
  return list;
}

// Prickly cacti: a player walking into one is bounced back with a short flop.
function prickles(game, cacti) {
  const CELL = 16, grid = new Map();
  const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  for (const c of cacti) { const k = key(c.x, c.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
  const cool = new Map();
  game.steppers.push(() => {
    for (const p of game.players) {
      if (p.seat || p.state === 'limp') continue;
      const h = p.hips.translation();
      if (h.x > -660) continue;
      const t = (cool.get(p) || 0) - 1 / 60; cool.set(p, t);
      if (t > 0) continue;
      const cell = grid.get(key(h.x, h.z));
      const near = [];
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const g = grid.get(key(h.x + dx * CELL, h.z + dz * CELL)); if (g) near.push(...g); }
      void cell;
      for (const c of near) {
        const dx = h.x - c.x, dz = h.z - c.z, d = Math.hypot(dx, dz);
        if (d > c.r + 0.42 || h.y < c.y0 - 0.5 || h.y > c.y1 + 0.6) continue;
        const nx = dx / (d || 1), nz = dz / (d || 1);
        for (const b of p.bodies) b.setLinvel({ x: nx * 7, y: 4.5, z: nz * 7 }, true);
        p.knockOut?.(0.7);
        game.audio?.play('boing', h, 0.8);
        cool.set(p, 1.2);
        (game.desertPricks = (game.desertPricks || 0) + 1);
        break;
      }
    }
  });
}

export function buildNature(game, kit, R) {
  const rng = R.rng(5), cacti = [];
  // saguaros + barrel cacti over the sand (fewer on the dunes, none on rock tops)
  let n = 0;
  for (let tries = 0; tries < 900 && n < 120; tries++) {
    const x = -1360 + rng() * 620, z = -170 + rng() * 500;
    if (!clear(x, z) || R.biomeAt(x, z) !== 'desert') continue;
    const g = R.groundAt(x, z);
    if (g < 2.2 || g > 14) continue;
    if (Math.abs(R.groundAt(x + 1.5, z) - g) > 1.2) continue;
    cacti.push(rng() < 0.7 ? saguaro(kit, x, z, g - 0.1, 0.8 + rng() * 0.5, rng) : barrelCactus(kit, x, z, g - 0.05, 0.7 + rng() * 0.5));
    n++;
  }
  // a few cacti in town and along the main street ends
  for (const [x, z] of [[-1024, -40], [-1024, -18], [-896, -46], [-896, -14], [-1015, 20], [-940, 30]]) cacti.push(saguaro(kit, x, z, R.groundAt(x, z) - 0.1, 0.9, rng));
  // red rocks, shrubs and skulls
  for (let i = 0, m = 0; i < 400 && m < 90; i++) {
    const x = -1380 + rng() * 680, z = -330 + rng() * 650;
    if (!clear(x, z) || R.biomeAt(x, z) !== 'desert') continue;
    const g = R.groundAt(x, z);
    if (g < 1.5) continue;
    if (rng() < 0.55) redRock(kit, x, z, g - 0.3, 0.6 + rng() * 1.6, rng);
    else { const b = kit.b(x, z); b.sphere(0.5 + rng() * 0.3, 0x9a8a4a, [x, g + 0.25, z], [1.2, 0.6, 1.1], 6); b.sphere(0.35, 0xa89a5a, [x + 0.3, g + 0.2, z + 0.2], null, 5); }
    m++;
  }
  for (const [x, z] of [[-1110, 20], [-1290, 90], [-1180, 300], [-990, 150]]) {
    const g = R.groundAt(x, z), b = kit.b(x, z);
    b.rbox(0.45, 0.35, 0.6, 0.12, 0xf2ead8, [x, g + 0.18, z]);
    for (const s of [-1, 1]) b.cone(0.07, 0.6, 0xf2ead8, [x + s * 0.35, g + 0.4, z - 0.15], [0, 0, -s * 1.1], 6);
    for (const s of [-1, 1]) b.sphere(0.07, 0x2a2a33, [x + s * 0.12, g + 0.28, z + 0.25], null, 5);
  }
  // mesa-top and plateau dressing: a few boulders
  for (const [mx, mz] of MESAS) for (let i = 0; i < 4; i++) { const x = mx - 12 + rng() * 24, z = mz - 10 + rng() * 20; redRock(kit, x, z, R.groundAt(x, z) - 0.3, 0.8 + rng(), rng); }
  prickles(game, cacti);
  const tw = tumbleweeds(game, R);
  game.desertNature = { cacti, tumbleweeds: tw };
}
