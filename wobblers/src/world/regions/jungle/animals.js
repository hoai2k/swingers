// Jungle animals (critters.js species: one draw call each): monkey troops scampering about
// and monkeys swinging from the tree vines, tigers and leopards prowling and lying down,
// river hogs rooting in a line, capybaras lazing on the river banks and paddling in the
// river, tapirs, snakes, crocodiles drifting down the river or basking on the banks with
// their jaws open, and parrots and toucans circling over the canopy.
//
// Each land animal walks a closed loop of waypoints round its home, picked at load where the
// ground is clear (no village, temple, river, trail, steep slopes or lava) and densified with
// the ground height, so a frame costs no terrain queries. Where it is on its loop is a
// function of time (walk for a while, rest, walk on), so nothing is stepped while nobody is
// near: only animals within SEE m of a camera are posed, and they make their noise (growl,
// chatter, grunt, hiss, snap, squawk) when a player comes close. They are scenery: no
// physics, you walk through them.
import { SEA_LEVEL } from '../../../config.js';
import { Species, hash } from '../../critters.js';
import { VILLAGE, LAGOON, TEMPLE, RIVER, CLIFF, POOL, TRAIL, TRACK, VOLCANO, polyDist } from '../jungle.js';
import { GROVE } from './wild.js';
import { modelGeometry } from '../../animalgeo.js';
import { animalGrab } from '../../animalgrab.js';

const SEE = 170;
// ---- paths ---------------------------------------------------------------------------------------
// A closed loop round (hx, hz) of about radius r through clear ground, densified every ~1 m with
// the ground height: { pts: Float32Array [x, y, z]*, len } or null if no clear loop fits there.
function loop(R, rnd, hx, hz, r, ok, n = 9) {
  const wp = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, rr = r * (0.6 + rnd() * 0.5), x = hx + Math.cos(a) * rr, z = hz + Math.sin(a) * rr;
    if (!ok(x, z)) return null;
    wp.push([x, z]);
  }
  const pts = [];
  let prevY = null;
  for (let i = 0; i < n; i++) {
    const [ax, az] = wp[i], [bx, bz] = wp[(i + 1) % n], L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(L));
    for (let j = 0; j < k; j++) {
      const x = ax + (bx - ax) * j / k, z = az + (bz - az) * j / k, y = R.groundAt(x, z);
      if (prevY !== null && Math.abs(y - prevY) > 1.2) return null; // a cliff edge
      if (!ok(x, z, true)) return null;
      pts.push(x, y, z); prevY = y;
    }
  }
  return { pts: new Float32Array(pts), n: pts.length / 3 };
}
const _o = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
function along(path, s) { // position + heading at distance s (1 m spacing)
  const n = path.n, f = ((s % n) + n) % n, i = Math.floor(f), j = (i + 1) % n, k = f - i, P = path.pts;
  const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[j * 3], by = P[j * 3 + 1], bz = P[j * 3 + 2];
  _o.x = ax + (bx - ax) * k; _o.y = ay + (by - ay) * k; _o.z = az + (bz - az) * k;
  const dx = bx - ax, dz = bz - az;
  _o.yaw = Math.atan2(dx, dz); _o.pitch = Math.atan2(by - ay, Math.hypot(dx, dz) || 1);
  return _o;
}
// distance travelled by time t: walk for `walk` s, rest for `rest` s, at v m/s (phase-shifted)
function travelled(t, v, walk, rest, off) {
  const P = walk + rest, tt = t + off, c = Math.floor(tt / P), u = tt - c * P;
  return { s: v * (c * walk + Math.min(u, walk)), moving: u < walk, rest: u - walk };
}

// ---- build ---------------------------------------------------------------------------------------
export function buildAnimals(game, R) {
  const rnd = R.rng(404), S = {};
  const mk = (name, geo, max, opts = {}) => (S[name] = new Species(game, geo, { max, name, shadow: true, ...opts }));
  const t0 = performance.now();
  mk('tiger', modelGeometry('tiger'), 4, { k: { LEG: 0.6 } });
  mk('leopard', modelGeometry('leopard'), 4, { k: { LEG: 0.6 } });
  mk('monkey', modelGeometry('monkey'), 16, { k: { LEG: 0.8, TAILA: 0.5 } });
  mk('monkeyHang', modelGeometry('monkeyHang'), 10, { k: { LEG: 0.4, TAILA: 0.5 } });
  mk('hog', modelGeometry('hog'), 12, { k: { LEG: 0.7 } });
  mk('capybara', modelGeometry('capybara'), 14, { k: { LEG: 0.6 } });
  mk('tapir', modelGeometry('tapir'), 4, { k: { LEG: 0.5 } });
  mk('snake', modelGeometry('snake'), 8, { mode: 'slither', k: { WAVEK: 3.9, WAVEA: 0.14 } });
  mk('croc', modelGeometry('croc'), 8, { k: { LEG: 0.5, TAILA: 0.4, JAWA: 0.55 } });
  mk('parrot', modelGeometry('parrot'), 8, { k: { FLAP: 0.8 }, shadow: false });
  mk('toucan', modelGeometry('toucan'), 6, { k: { FLAP: 0.8 }, shadow: false });
  const list = Object.values(S);
  // grabbing (animalgrab.js): body capsules (r, half length, centre height, kg); small ones are
  // picked up, big ones bolt along their way dragging you
  const GRAB = {
    monkey: { r: 0.17, len: 0.2, y: 0.38, kg: 8, pick: true }, hog: { r: 0.26, len: 0.3, y: 0.42, kg: 24, pick: true },
    capybara: { r: 0.26, len: 0.3, y: 0.38, kg: 28, pick: true },
    tiger: { r: 0.36, len: 0.6, y: 0.78, kg: 180, run: 5 }, leopard: { r: 0.3, len: 0.5, y: 0.58, kg: 70, run: 5.5 },
    tapir: { r: 0.4, len: 0.55, y: 0.72, kg: 250, run: 3.5 }, croc: { r: 0.3, len: 1.0, y: 0.3, kg: 300, run: 3 },
    snake: { r: 0.13, len: 1.6, y: 0.13, kg: 60, run: 2 },
  };
  let lastPut = null;
  for (const sp of list) { const put = sp.put.bind(sp); sp.put = (...a) => { lastPut = a; put(...a); }; }
  const grab = animalGrab(game, GRAB, {
    onGrab: (a, p, how) => {
      game.audio?.play(a.sound || 'grunt', { x: a.x, y: p.chest.translation().y, z: a.z });
      if (a.mk) { a.mk.st = null; a.mk.cool = game.time + 30; if (a.path?.rider === a) a.path.rider = null; }
    },
  });
  const posed = new Set();
  (game.buildTimes ||= {}).sculptJungle = Math.round(performance.now() - t0);

  // where land animals may walk
  const [bx0, bx1, bz0, bz1] = R.bounds;
  const land = (x, z, strict) => {
    if (x < bx0 + 30 || x > bx1 - 30 || z < bz0 + 30 || z > bz1 - 30) return false;
    if (x > VILLAGE.x0 - 8 && x < LAGOON.x1 + 6 && z > VILLAGE.z0 - 10 && z < VILLAGE.z1 + 28) return false;
    if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 30) return false;
    if (x > CLIFF.x0 - 6 && x < CLIFF.x1 + 10 && z > CLIFF.z0 - 16 && z < CLIFF.z1 + 6) return false;
    if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 5 || Math.hypot(x - GROVE.x, z - GROVE.z) < GROVE.r + 3) return false;
    if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 60) return false;
    if (polyDist(x, z, RIVER)[0] < 11 || polyDist(x, z, TRACK)[0] < 4 || polyDist(x, z, TRAIL)[0] < 4) return false;
    const h = R.groundAt(x, z);
    if (h < 1.0 || h > 24) return false;
    if (!strict && Math.abs(R.groundAt(x + 2, z) - h) + Math.abs(R.groundAt(x, z + 2) - h) > 1.6) return false;
    return true;
  };
  const animals = [];
  const place = (kind, count, r, v, walk, rest, opts = {}) => {
    for (let k = 0, tries = 0; k < count && tries < 400; tries++) {
      const hx = bx0 + 40 + rnd() * (bx1 - bx0 - 80), hz = bz0 + 40 + rnd() * (bz1 - bz0 - 80);
      if (opts.near && !opts.near(hx, hz)) continue;
      const path = loop(R, rnd, hx, hz, r, opts.ok || land);
      if (!path) continue;
      const group = opts.group || 1;
      for (let g = 0; g < group; g++) animals.push({ kind, path, v, walk, rest, off: rnd() * 100, back: g * (opts.gap || 1.4), side: g ? (rnd() - 0.5) * 0.8 : 0, x: hx, z: hz, s: (opts.size || 1) * (g && opts.young ? 0.75 : 1) * (0.92 + rnd() * 0.16), sound: opts.sound, hear: opts.hear || 10 });
      k++;
    }
  };
  const nearRiver = (x, z) => { const d = polyDist(x, z, RIVER)[0]; return d > 12 && d < 30; };
  const riverSide = (x, z) => polyDist(x, z, RIVER)[0] < 70;
  place('tiger', 2, 22, 1.5, 22, 16, { sound: 'growl', hear: 12 });
  place('leopard', 3, 18, 1.7, 18, 14, { sound: 'growl', hear: 10 });
  place('monkey', 4, 9, 1.8, 6, 5, { group: 3, gap: 1.1, young: true, sound: 'monkey', hear: 14 });
  place('hog', 2, 12, 1.1, 10, 6, { group: 4, gap: 1.2, young: true, sound: 'grunt', hear: 8 });
  place('capybara', 2, 6, 0.6, 6, 14, { group: 4, gap: 1.5, young: true, near: nearRiver, sound: 'squeak', hear: 6 });
  place('tapir', 3, 10, 0.9, 14, 10, { near: riverSide, sound: 'grunt', hear: 7 });
  place('snake', 5, 5, 0.5, 20, 12, { sound: 'hiss', hear: 5 });
  // crocodiles: drifting on the river (back and forth along a stretch) and basking on the banks
  const riverPts = (s0, s1) => { const pts = []; for (let s = s0; s <= s1; s += 1) pts.push(riverAt(s)); for (let s = s1; s >= s0; s -= 1) pts.push(riverAt(s, 2.5)); return { pts: new Float32Array(pts.flat()), n: pts.length }; };
  for (const [s0, s1] of [[60, 120], [150, 210], [230, 280]]) animals.push({ kind: 'croc', swim: true, path: riverPts(s0, s1), v: 0.7, walk: 40, rest: 12, off: rnd() * 50, back: 0, side: 0, s: 1.1, sound: 'snap', hear: 6 });
  for (const s of [95, 185, 262]) {
    const [x, , z] = riverAt(s, 0), [x2, , z2] = riverAt(s + 1, 0), nx = -(z2 - z), nz = x2 - x, l = Math.hypot(nx, nz) || 1, side = s % 2 ? 1 : -1;
    const bx = x + nx / l * 9 * side, bz = z + nz / l * 9 * side;
    animals.push({ kind: 'croc', bask: true, x: bx, z: bz, y: R.groundAt(bx, bz), yaw: Math.atan2(-nx * side, -nz * side), off: rnd() * 30, s: 1.2, sound: 'snap', hear: 6 });
  }
  function riverAt(s, lane = -2.5) { // point on the river centre line at arc length s (+ a lane offset), y at the water
    let acc = 0;
    for (let i = 0; i < RIVER.length - 1; i++) {
      const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], L = Math.hypot(bx - ax, bz - az);
      if (acc + L >= s || i === RIVER.length - 2) { const t = Math.min(1, (s - acc) / L), tx = (bx - ax) / L, tz = (bz - az) / L; return [ax + (bx - ax) * t - tz * lane, SEA_LEVEL - 0.18, az + (bz - az) * t + tx * lane]; }
      acc += L;
    }
  }
  // capybaras paddling in the river
  animals.push({ kind: 'capybara', swim: true, path: riverPts(20, 60), v: 0.45, walk: 60, rest: 0, off: 0, back: 0, side: 0, s: 1, sound: 'squeak', hear: 6 });
  animals.push({ kind: 'capybara', swim: true, path: riverPts(20, 60), v: 0.45, walk: 60, rest: 0, off: 0, back: 1.4, side: 0.4, s: 0.7 });
  // monkeys swinging on the vines of the round jungle trees
  const vines = [[1.6, 0.9, 3.2], [-1.5, -1.1, 2.6], [0.4, -1.9, 3.6]];
  const trees = (game.jungleTrees || []).filter(([k, x, , z]) => k === 'jtree2' && land(x, z, true));
  for (let i = 0; i < 8 && trees.length; i++) {
    const [, x, y, z, sc, co, si] = trees[(rnd() * trees.length) | 0], [lx, lz, l] = vines[(rnd() * 3) | 0];
    const hx = x + (lx * co + lz * si) * sc, hz = z + (-lx * si + lz * co) * sc, hy = y + (6.2 - l) * sc;
    animals.push({ kind: 'monkeyHang', x: hx, y: hy, z: hz, yaw: rnd() * 6.3, off: rnd() * 20, s: 1, sound: 'monkey', hear: 14 });
  }
  // birds circling over the canopy
  for (let i = 0; i < 12; i++) {
    const kind = i % 3 === 2 ? 'toucan' : 'parrot', a = rnd() * 6.3, d = rnd() * 220;
    const x = -560 + Math.cos(a) * d, z = 840 + Math.sin(a) * d;
    animals.push({ kind, fly: true, x, z, y: R.groundAt(x, z), r: 10 + rnd() * 18, w: (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.2), off: rnd() * 50, s: 1, sound: 'squawk', hear: 25 });
  }
  for (const a of animals) if (a.x === undefined) { a.x = a.path.pts[0]; a.z = a.path.pts[2]; }

  // ---- per frame ---------------------------------------------------------------------------------
  const cams = [], heard = new Map();
  const [cx, cz] = [(bx0 + bx1) / 2, (bz0 + bz1) / 2], span = Math.hypot(bx1 - bx0, bz1 - bz0) / 2 + SEE;
  const stats = game.jungleAnimals = { count: animals.length, shown: 0, species: S, list: animals };
  game.updaters.push((dt, t) => {
    cams.length = 0;
    for (const p of game.players) { const c = p.camera?.cam?.position; if (c && Math.hypot(c.x - cx, c.z - cz) < span) cams.push(c); }
    if (!cams.length && game.idleCam && !game.players.length) { const c = game.idleCam.position; if (Math.hypot(c.x - cx, c.z - cz) < span) cams.push(c); }
    if (!cams.length) { if (stats.shown) { for (const s of list) { s.begin(); s.end(); s.mesh.visible = false; } stats.shown = 0; } return; }
    for (const s of list) s.begin();
    let shown = 0;
    posed.clear();
    for (const a of animals) {
      let vis = false;
      for (const c of cams) if ((c.x - a.x) ** 2 + (c.z - a.z) ** 2 < (SEE + 40) ** 2) { vis = true; break; }
      if (!vis) continue;
      lastPut = null;
      pose(a, t);
      if (lastPut) { a.pose = [lastPut[0], lastPut[1], lastPut[2], lastPut[3]]; posed.add(a); }
      shown++;
    }
    grab.update(posed, t, dt);
    for (const s of list) { s.end(); s.mesh.visible = s.n > 0; }
    stats.shown = shown;
    // noises when a player comes close
    for (const p of game.players) {
      if (p.seat) continue;
      const c = p.chest.translation();
      for (const a of animals) {
        if (!a.sound || (c.x - a.x) ** 2 + (c.z - a.z) ** 2 > a.hear * a.hear) continue;
        const last = heard.get(a) || -99;
        if (t - last > 6 + hash(a.off) * 6) { heard.set(a, t); game.audio?.play(a.sound, { x: a.x, y: c.y, z: a.z }); a.startle = t; }
      }
    }
  });

  const STRIDE = { tiger: 1.5, leopard: 1.3, monkey: 0.6, hog: 0.7, capybara: 0.6, tapir: 1.1, croc: 0.9 };
  const WATCH = { tiger: 11, leopard: 10, tapir: 7 };
  const _np = { x: 0, z: 0, p: null };
  function nearestPlayer(x, z, r) {
    let best = r * r, hit = null;
    for (const p of game.players) {
      const c = p.chest.translation(), d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < best) { best = d; hit = p; _np.x = c.x; _np.z = c.z; _np.y = c.y; }
    }
    if (!hit) return null;
    _np.p = hit; return _np;
  }
  // Monkeys come and play with a player on foot who walks up to their troop: they gather round,
  // hop, spin and dance, chattering, and the boldest one jumps on the player's head for a ride;
  // after half a minute (or when the player leaves) they scamper back to their round.
  function monkeyPlay(a, t, dt, sp) {
    const m = a.mk ||= { st: null, x: a.x, z: a.z, i: Math.floor(hash(a.off, 7) * 3), cool: 0 };
    if (!m.st) {
      if (t < m.cool) return false;
      const n = nearestPlayer(a.x, a.z, 12);
      if (!n || n.p.seat) return false;
      m.st = 'play'; m.p = n.p; m.t0 = t; m.x = a.x; m.z = a.z;
      m.ride = !a.path.rider; if (m.ride) a.path.rider = a;              // the troop's first to come over rides
      game.audio?.play('monkey', { x: a.x, y: n.y, z: a.z });
    }
    const p = m.p, c = p.chest.translation(), far = (c.x - m.x) ** 2 + (c.z - m.z) ** 2 > 22 * 22;
    if (m.st === 'play' && (far || t - m.t0 > 30 || p.seat)) { m.st = 'back'; m.cool = t + 45; m.ride = false; if (a.path.rider === a) a.path.rider = null; }
    let tx, tz, ty = null, face = null, run = 4;
    const u = t - m.t0;
    if (m.st === 'play') {
      if (m.ride && u > 7 && u < 13) {                     // riding on the player's head
        const k = Math.min(1, (u - 7) / 0.5), h = Math.sin(Math.min(1, (u - 7) / 0.5) * Math.PI) * 0.8;
        tx = c.x; tz = c.z; ty = c.y + 0.75 + h * (1 - k);
        m.x += (tx - m.x) * Math.min(1, dt * 12); m.z += (tz - m.z) * Math.min(1, dt * 12);
        sp.put(m.x, ty + Math.abs(Math.sin(t * 5)) * 0.05, m.z, p.yaw + Math.sin(t * 2) * 0.5, -0.2, Math.sin(t * 3) * 0.2, a.s * 0.85, t * 2, 0.3);
        if (u > 12.9) m.ride = false;
        a.x = m.x; a.z = m.z; return true;
      }
      const dir = m.i % 2 ? 1 : -1, ang = m.i * 2.1 + u * 0.55 * dir, r = 1.9 + 0.5 * Math.sin(t * 0.7 + m.i);
      tx = c.x + Math.sin(ang) * r; tz = c.z + Math.cos(ang) * r; face = [c.x, c.z];
    } else {
      const tr = travelled(t - (a.tAdj || 0), a.v, a.walk, a.rest, a.off), o = along(a.path, tr.s - a.back);
      tx = o.x; tz = o.z; run = 3.2;
    }
    const dx = tx - m.x, dz = tz - m.z, dist = Math.hypot(dx, dz), step = Math.min(dist, run * dt);
    if (dist > 1e-3) { m.x += dx / dist * step; m.z += dz / dist * step; }
    if (m.st === 'back' && dist < 0.3) { m.st = null; return false; }
    const g = R.groundAt(m.x, m.z), moving = dist > 0.25;
    let yaw = moving ? Math.atan2(dx, dz) : Math.atan2(face[0] - m.x, face[1] - m.z), y = g, roll = 0, ph = t * 12, amp = 1;
    if (m.st === 'play' && !moving) {                       // dancing: hops, a spin now and then, a wiggle
      const beat = t * 6 + m.i * 1.3;
      y += Math.abs(Math.sin(beat)) * 0.32;
      const sp_ = (t * 0.35 + m.i * 0.37) % 1; if (sp_ < 0.12) yaw += (sp_ / 0.12) * Math.PI * 2;
      roll = Math.sin(beat * 0.5) * 0.25; ph = beat * 1.5;
      if (hash(Math.floor(t / 3), m.i, a.off) < 0.08 && !m.chat) { m.chat = true; game.audio?.play('monkey', { x: m.x, y: g, z: m.z }, 0.6); }
      if (hash(Math.floor(t / 3), m.i, a.off) >= 0.08) m.chat = false;
    } else y += Math.abs(Math.sin(t * 9)) * 0.18;            // bounding
    sp.put(m.x, y, m.z, yaw, 0, roll, a.s, ph, amp);
    a.x = m.x; a.z = m.z;
    return true;
  }

  function pose(a, t) {
    const sp = S[a.kind];
    if (a.fly) { // birds: circles over the canopy, flapping, gliding now and then
      const ang = t * a.w + a.off, x = a.x + Math.cos(ang) * a.r, z = a.z + Math.sin(ang) * a.r, glide = Math.sin(t * 0.7 + a.off) > 0.4;
      const y = Math.max(a.y, R.groundAt(x, z)) + 15 + Math.sin(t * 0.5 + a.off) * 2;
      sp.put(x, y, z, Math.atan2(-Math.sin(ang) * a.w, Math.cos(ang) * a.w), 0, -Math.sign(a.w) * 0.35, a.s, glide ? 0.4 : t * 14 + a.off, glide ? 0.2 : 1);
      a.cur = [x, z];
      return;
    }
    if (a.kind === 'monkeyHang') { // swinging from the vine (the model's origin is its hand)
      const sw = Math.sin(t * 1.6 + a.off) * 0.45, kick = Math.sin(t * 3.2 + a.off);
      sp.put(a.x, a.y, a.z, a.yaw, 0, sw, a.s, t * 3 + a.off, 0.6 + 0.4 * kick);
      return;
    }
    if (a.bask) { // crocodile on the bank, jaws slowly opening (snaps when startled)
      const st = a.startle && t - a.startle < 1.2;
      sp.put(a.x, a.y, a.z, a.yaw, 0, 0, a.s, st ? (t - a.startle) * 30 : t * 0.4 + a.off, 0);
      return;
    }
    const dt = Math.min(0.1, Math.max(0, t - (a.lt ?? t))); a.lt = t;
    if (grab.drive(a, t, dt, sp)) return;                    // held / thrown
    const g = a.g;
    if (a.kind === 'monkey' && g?.st !== 'return' && monkeyPlay(a, t, dt, sp)) return;
    // big cats and tapirs stop and watch a player who comes close (their walk resumes after)
    const near = WATCH[a.kind] && (!g || g.st === 'free') && nearestPlayer(a.x, a.z, WATCH[a.kind]);
    if (near) a.tAdj = (a.tAdj || 0) + dt;
    const tr = travelled(t - (a.tAdj || 0), a.v, a.walk, a.rest, a.off);
    const bolt = g?.st === 'bolt', sB = grab.boltS(a, dt);   // grabbed big animals run on, dragging you
    tr.s += sB; if (bolt) tr.moving = true;
    const o = along(a.path, tr.s - a.back);
    // legs step with the ground covered (one stride per cycle), the snake's waves stay put on it
    let y = o.y, pitch = o.pitch * 0.7, yaw = o.yaw, amp = tr.moving ? 1 : 0, ph = tr.s * 6.283 / (STRIDE[a.kind] || 1) + a.off, roll = 0, sc = a.s;
    if (a.kind === 'snake') { ph = tr.s * 3.9 + a.off; amp = tr.moving ? 1 : 0.35; if (!tr.moving) ph = tr.s * 3.9 + Math.sin(t * 0.8 + a.off) * 0.6; }
    if (near) { yaw = Math.atan2(near.x - o.x, near.z - o.z); amp = 0; pitch = 0; }
    // walking side by side in a group
    if (a.side) { const cs = Math.cos(yaw), sn = Math.sin(yaw); o.x += cs * a.side; o.z -= sn * a.side; }
    if (a.swim) { y = SEA_LEVEL - (a.kind === 'croc' ? 0.36 : 0.42) * sc; pitch = 0; amp = 0.4; ph = t * 1.5 + a.off; }
    else if (!tr.moving && a.kind !== 'snake') {
      // resting: big cats lie down, the others look about / root about
      if (a.kind === 'tiger' || a.kind === 'leopard') { const k = Math.min(1, tr.rest * 1.5); y -= 0.32 * k * sc; pitch = 0; }
      if (a.kind === 'capybara') y -= 0.12 * sc;
      yaw += Math.sin(t * 0.6 + a.off) * 0.25; ph = t * 1.4 + a.off; amp = a.kind === 'hog' ? 0.6 : 0.15;
    }
    if (a.kind === 'monkey' && tr.moving) y += Math.abs(Math.sin(ph)) * 0.18; // bounding gait
    if (a.kind === 'croc' && a.startle && t - a.startle < 1) ph = (t - a.startle) * 30; // snap!
    if (bolt && a.kind !== 'snake') { amp = 1.3; if (a.kind === 'croc' && !a.swim) ph = t * 12; }
    if (g?.st === 'return') {                                 // put down: walking back to its way
      const dx = o.x - g.x, dz = o.z - g.z, d = Math.hypot(dx, dz), st = Math.min(d, 3 * dt);
      if (d > 1e-3) { g.x += dx / d * st; g.z += dz / d * st; }
      if (d < 0.3) g.st = 'free';
      sp.put(g.x, R.groundAt(g.x, g.z), g.z, d > 0.05 ? Math.atan2(dx, dz) : yaw, 0, 0, sc, t * 10, 1);
      a.x = g.x; a.z = g.z;
      return;
    }
    sp.put(o.x, y, o.z, yaw, pitch, roll, sc, ph, amp);
    a.x = o.x; a.z = o.z;
  }
}
