// Town wildlife (world/wildlife.js engine with custom poses): squirrels foraging under the suburb
// street trees that scamper up the trunk when you come close; crows pecking on lawns and roofs that
// take off cawing and circle; stray cats wandering the suburbs (they stop to stare, and scoot off
// if you rush them) and house cats sitting out on the lawns; and in Bigtown, rats round the bins
// on the side pavements: now and then a few are out, scurrying along the wall, and they dart into
// the bin when someone comes close. Models are round-18 stand-ins until their reference sheets
// arrive (image-requests.md).
import { wildlife } from './wildlife.js';
import { hash } from './critters.js';
import { groundAt } from './common.js';
import { spawnProp } from './props.js';
import { AVES, STREETS, RW, SW } from './regions/city/layout.js';

const rng = (seed) => { let s = Math.floor(Math.abs(seed) * 9973 + 17) % 2147483646 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

export function buildTownLife(game) {
  game.physics.world.updateSceneQueries?.();
  const dry = (x, t, z) => { const wl = game.physics.waterLevel?.(x, t + 0.2, z); return t > -0.3 && (wl == null || wl < t - 0.05); };
  const open = (x, z) => { const t = groundAt(x, z), y = game.groundHeight(x, z, t + 30); return Math.abs(y - t) < 0.3 && dry(x, t, z); };
  // ---- home island: squirrels, crows, cats ---------------------------------------------------------
  const HR = { groundAt, rng, bounds: [-400, 400, -400, 400] };
  const H = wildlife(game, HR, { seed: 4848, ok: open, bounds: [-170, 170, -170, 170] });
  H.mk('squirrel', 'squirrel', 10, { k: { LEG: 0.9, TAILA: 0.3 } });
  H.mk('crow', 'crow', 12, { k: { LEG: 0.6, FLAP: 0 } });
  H.mk('crowFly', 'crowFly', 12, { k: { FLAP: 0.9 }, shadow: false });
  H.mk('cat', 'cat', 8, { k: { LEG: 0.7, TAILA: 0.4 } });
  const r = H.rnd;
  // squirrels: under the suburb street trees (deciduous, round the avenues 70-140 m out)
  const trees = (game.treeSpots || []).filter(([x, , z, kind]) => kind === 0 && Math.max(Math.abs(x), Math.abs(z)) > 60 && Math.max(Math.abs(x), Math.abs(z)) < 150 && Math.min(Math.abs(x), Math.abs(z)) < 12);
  for (let i = 0; i < Math.min(8, trees.length); i++) {
    const tr = trees[Math.floor((i + r()) * trees.length / 8) % trees.length];
    H.add({ kind: 'squirrel', custom: squirrel, tree: tr, x: tr[0], z: tr[2], i, s: 1.1, sound: 'chitter', hear: 7 });
  }
  // crows: pecking on lawns, or up on a roof
  for (let n = 0, tries = 0; n < 10 && tries < 400; tries++) {
    const x = -150 + r() * 300, z = -150 + r() * 300, t = groundAt(x, z), y = game.groundHeight(x, z, t + 40);
    const roof = y - t > 2.5 && y - t < 14, lawn = Math.abs(y - t) < 0.3 && dry(x, t, z);
    if (!roof && !lawn) continue;
    H.add({ kind: 'crow', flyKind: 'crowFly', perch: true, hop: lawn, px: x, py: y, pz: z, x, z, yaw: r() * 6.283, shy: roof ? 7 : 5, alt: 9, circle: 9, sound: 'caw', hear: 9 });
    n++;
  }
  // stray cats wandering the suburbs, house cats sitting out on the lawns
  const suburb = (x, z) => { const a = Math.max(Math.abs(x), Math.abs(z)), b = Math.min(Math.abs(x), Math.abs(z)); return a > 66 && a < 146 && b > 8 && b < 30; };
  H.place('cat', 4, 3.5, 0.9, 8, 10, { n: 7, near: suburb, ok: (x, z) => suburb(x, z) && open(x, z), look: 6, flee: 2.8, fleeV: 6, sound: 'meow', hear: 5, stride: 0.45 });
  for (let n = 0, tries = 0; n < 3 && tries < 300; tries++) {
    const x = -140 + r() * 280, z = -140 + r() * 280;
    if (!suburb(x, z) || !open(x, z)) continue;
    H.add({ kind: 'cat', still: true, px: x, py: groundAt(x, z), pz: z, x, z, yaw: r() * 6.283, sound: 'meow', hear: 4 });
    n++;
  }
  H.start('townAnimals', { grab: { cat: { r: 0.1, len: 0.16, y: 0.2, kg: 4, run: 6, pick: true }, squirrel: { r: 0.06, len: 0.08, y: 0.1, kg: 0.6, run: 6, pick: true } } });

  // ---- Bigtown: rats round the bins on the side pavements ------------------------------------------
  const CR = { groundAt, rng, bounds: [600, 1200, -321, 321] };
  const C = wildlife(game, CR, { seed: 5858, ok: () => false });
  C.mk('rat', 'rat', 16, { k: { LEG: 0.9, TAILA: 0.5 } });
  const cr = C.rnd, bins = [];
  for (let n = 0, tries = 0; n < 10 && tries < 200; tries++) {
    const [ax, z0, z1] = AVES[1 + ((cr() * (AVES.length - 1)) | 0)], side = cr() < 0.5 ? -1 : 1;
    const z = z0 + 10 + cr() * (z1 - z0 - 20), x = ax + side * (RW + 2.4);
    if (STREETS.some(([sz]) => Math.abs(z - sz) < RW + 6) || bins.some((b) => Math.hypot(b.x - x, b.z - z) < 25)) continue;
    const o = spawnProp(game, 'bin', x, z, SW);
    bins.push({ x, z, o, side });
    for (let k = 0; k < 2; k++) C.add({ kind: 'rat', custom: rat, bin: o, side, x, z, i: n * 2 + k, s: 1.2 });
    n++;
  }
  C.start('cityRats');
  game.townLife = { squirrels: trees.length, bins };

  // ---- custom poses ----------------------------------------------------------------------------------
  function squirrel(a, t, dt, S, W) {
    const sp = S.squirrel, [tx, ty, tz, , sc] = a.tree, st = a.st ||= { mode: 'ground', x: tx + 1.5, z: tz, gx: tx + 1.5, gz: tz, next: 0, ang: hash(a.i, 3) * 6.283, h: 0 };
    const trunkR = 0.3 * sc + 0.05, top = 1.9 * sc + 0.4;
    const near = W.nearest(st.x, st.z, 6.5);
    if (st.mode === 'ground' && near) { st.mode = 'run'; game.audio?.play('chitter', { x: st.x, y: ty + 0.2, z: st.z }, 0.8); }
    if (st.mode === 'up' && !W.nearest(tx, tz, 9)) { if ((st.calm = (st.calm || 0) + dt) > 3) { st.mode = 'down'; st.calm = 0; } } else st.calm = 0;
    if (st.mode === 'ground') {
      if (t > st.next) { const ang = hash(a.i, Math.floor(t / 3)) * 6.283, d = 1.2 + hash(Math.floor(t / 3), a.i) * 3; st.gx = tx + Math.cos(ang) * d; st.gz = tz + Math.sin(ang) * d; st.next = t + 2 + hash(a.i, t) * 2; }
      const dx = st.gx - st.x, dz = st.gz - st.z, d = Math.hypot(dx, dz), step = Math.min(d, 2.5 * dt);
      if (d > 1e-3) { st.x += dx / d * step; st.z += dz / d * step; st.yaw = Math.atan2(dx, dz); }
      const moving = d > 0.05, gy = groundAt(st.x, st.z);
      sp.put(st.x, gy + (moving ? Math.abs(Math.sin(t * 14)) * 0.05 : 0), st.z, st.yaw || 0, moving ? 0 : 0.5, 0, a.s, t * (moving ? 16 : 2), moving ? 1 : 0.2);
      a.x = st.x; a.z = st.z; return true;
    }
    // to the trunk, up it, cling there, back down
    const bx = tx + Math.cos(st.ang) * trunkR, bz = tz + Math.sin(st.ang) * trunkR, face = Math.atan2(tx - bx, tz - bz);
    if (st.mode === 'run') {
      const dx = bx - st.x, dz = bz - st.z, d = Math.hypot(dx, dz), step = Math.min(d, 5 * dt);
      if (d > 1e-3) { st.x += dx / d * step; st.z += dz / d * step; }
      if (d < 0.05) st.mode = 'climb';
      sp.put(st.x, groundAt(st.x, st.z), st.z, Math.atan2(dx, dz), 0, 0, a.s, t * 18, 1.2);
    } else {
      if (st.mode === 'climb') { st.h = Math.min(top, st.h + 2.5 * dt); if (st.h >= top) st.mode = 'up'; }
      if (st.mode === 'down') { st.h = Math.max(0, st.h - 1.5 * dt); if (st.h <= 0) { st.mode = 'ground'; st.next = 0; } }
      const climbing = st.mode === 'climb' || st.mode === 'down';
      sp.put(bx, ty + st.h + 0.12, bz, face, st.mode === 'down' ? -1.4 : 1.4, 0, a.s, t * (climbing ? 18 : 1.5), climbing ? 1 : 0.15);
      st.x = bx; st.z = bz;
    }
    a.x = st.x; a.z = st.z; return true;
  }
  function rat(a, t, dt, S, W) {
    const b = a.bin.body.translation(), st = a.st ||= { x: b.x, z: b.z, hide: 0, mode: 'out', u: 0, next: 0, goal: 0 };
    const out = hash(Math.floor((t + a.i * 13) / 35), a.i) < 0.5;   // only some of the time
    if (t < st.hide || !out) { st.x = b.x; st.z = b.z; st.mode = 'out'; a.x = b.x; a.z = b.z; return false; }
    const wx = b.x - a.side * 0.7;                                     // along the wall behind the bin
    if (st.mode === 'out' && W.nearest(st.x, st.z, 4.5)) { st.mode = 'flee'; game.audio?.play('squeak', { x: st.x, y: SW, z: st.z }, 0.7); }
    let tx, tz, v;
    if (st.mode === 'flee') { tx = b.x; tz = b.z; v = 5; }
    else {
      if (t > st.next) { st.goal = (hash(a.i, Math.floor(t / 2.5)) - 0.5) * 7; st.next = t + 1.2 + hash(Math.floor(t), a.i) * 2.5; }
      tx = wx; tz = b.z + st.goal; v = 3;
    }
    const dx = tx - st.x, dz = tz - st.z, d = Math.hypot(dx, dz), step = Math.min(d, v * dt);
    if (d > 1e-3) { st.x += dx / d * step; st.z += dz / d * step; st.yaw = Math.atan2(dx, dz); }
    if (st.mode === 'flee' && d < 0.25) { st.hide = t + 20; st.mode = 'out'; a.x = b.x; a.z = b.z; return false; }
    const moving = d > 0.05;
    S.rat.put(st.x, SW, st.z, (st.yaw || 0) + (moving ? 0 : Math.sin(t * 3 + a.i) * 0.4), moving ? 0 : 0.3, 0, a.s, t * (moving ? 22 : 3), moving ? 1 : 0.2);
    a.x = st.x; a.z = st.z; return true;
  }
}
