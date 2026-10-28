// Wildlife engine shared by the islands (desert, snow, tropical: regions/*/animals.js; the town:
// townlife.js; the jungle uses its paths). Same rules as the jungle animals (CLAUDE.md Wildlife):
// one critters.js Species per kind (one draw call), poses are functions of time (walk a loop of
// waypoints picked at load, rest, walk on), only animals within SEE m of a camera are posed, no
// terrain queries per frame for animals on their loop, noises when a player comes close, and the
// nearest few can be grabbed (animalgrab.js) when the kind has a grab spec.
//
// const W = wildlife(game, R, { seed, ok, bounds });
//   W.mk(name, modelName, max, speciesOpts)       a species (modelName: animalmodels.js / SHEET_MODELS)
//   W.place(kind, count, r, v, walk, rest, opts)  animals walking loops of radius ~r through `ok` ground
//     opts: group, gap, young, size, near(x, z), ok, sound, hear, stride, flee (radius: runs off from a
//     player, then walks back), fleeV, look (stops and watches a player within this radius)
//   W.add(record)                                 any other animal: { kind, fly | perch | coil | still ... }
//     fly: { x, z, y (ground), r, w (rad/s), alt }  circling bird (kind = its flying species)
//     perch: { x, y, z, yaw, flyKind, shy, alt }     sits / pecks about; takes off when a player comes
//                                                    within `shy` m, circles, lands back after a while
//     coil: { x, y, z, yaw }                          lies still; rears and rattles at a player close by
//     custom: fn(a, t, dt, S, W)                      its own pose (true = drawn); W.nearest(x, z, r) finds a player
//   W.start(statsName, { grab, onGrab })           installs the per-frame updater; game[statsName] = stats
//
// Never the same twice: the layout is drawn from a per-session seed, and each group (a herd, a
// pair, one animal) comes and goes: every few minutes, while no camera can see it, it rolls
// whether it is about (`presence`, default 0.65) and, for walkers, which of its kind's loops
// (a pool with spares) it is on. Timid ones (`timid` chance, default 0.6, rolled per group) that
// are scared off (fleeing, a perched bird flushed, let go after a grab) run on until 40 m from
// everyone and are gone until the next roll; the others calm down and carry on.
// Noticing a player (W.noticed): within its radius scaled by how fast the player moves (creeping
// at ~1.5 m/s cuts it to ~40%), less from behind (outside a +-110 deg view) and less again with
// something solid in between (a ray against the static world): you can sneak up on them.
import { Species, hash } from './critters.js';
import { RAPIER } from '../physics.js';
import { CAMERA_QUERY } from '../config.js';
import { modelGeometry } from './animalgeo.js';
import { animalGrab } from './animalgrab.js';

const SEE = 150;
// ---- paths ---------------------------------------------------------------------------------------
// A closed loop round (hx, hz) of about radius r through clear ground, densified every ~1 m with
// the ground height: { pts: Float32Array [x, y, z]*, len } or null if no clear loop fits there.
export function loop(R, rnd, hx, hz, r, ok, n = 9) {
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
export function along(path, s) { // position + heading at distance s (1 m spacing)
  const n = path.n, f = ((s % n) + n) % n, i = Math.floor(f), j = (i + 1) % n, k = f - i, P = path.pts;
  const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[j * 3], by = P[j * 3 + 1], bz = P[j * 3 + 2];
  _o.x = ax + (bx - ax) * k; _o.y = ay + (by - ay) * k; _o.z = az + (bz - az) * k;
  const dx = bx - ax, dz = bz - az;
  _o.yaw = Math.atan2(dx, dz); _o.pitch = Math.atan2(by - ay, Math.hypot(dx, dz) || 1);
  return _o;
}
// distance travelled by time t: walk for `walk` s, rest for `rest` s, at v m/s (phase-shifted)
export function travelled(t, v, walk, rest, off) {
  const P = walk + rest, tt = t + off, c = Math.floor(tt / P), u = tt - c * P;
  return { s: v * (c * walk + Math.min(u, walk)), moving: u < walk, rest: u - walk };
}

// ---- engine ----------------------------------------------------------------------------------------
export function wildlife(game, R, { seed = 1, ok, bounds = R.bounds } = {}) {
  const rnd = R.rng(seed + Math.floor(Math.random() * 100000)), S = {}, list = [], animals = []; // a new layout every session
  const [bx0, bx1, bz0, bz1] = bounds;
  const geos = new Map();
  // a group's comings and goings (see the top)
  function group(opts, pool) {
    return { members: [], pool, presence: opts.presence ?? 0.65, timid: rnd() < (opts.timid ?? 0.4), present: rnd() < (opts.presence ?? 0.65), timidP: opts.timid,
      period: 150 + rnd() * 150, phase: rnd() * 300, cycle: null };
  }
  function reroll(grp) {
    grp.present = Math.random() < grp.presence;
    grp.timid = Math.random() < (grp.timidP ?? 0.4);
    const path = grp.pool?.length ? grp.pool[(Math.random() * grp.pool.length) | 0] : null;
    for (const a of grp.members) { if (path) a.path = path; a.fl = null; a.st = null; a.tAdj = 0; }
  }
  const W = {
    S, animals, rnd,
    mk(name, model, max, opts = {}) {
      if (!geos.has(model)) geos.set(model, modelGeometry(model));
      const sp = S[name] = new Species(game, geos.get(model), { max, name, shadow: true, ...opts });
      list.push(sp); return sp;
    },
    place(kind, count, r, v, walk, rest, opts = {}) {
      // count groups, plus spare loops in the pool they move between from one visit to the next
      const pool = [];
      for (let tries = 0; pool.length < count * 3 && tries < 900; tries++) {
        const hx = bx0 + 30 + rnd() * (bx1 - bx0 - 60), hz = bz0 + 30 + rnd() * (bz1 - bz0 - 60);
        if (opts.near && !opts.near(hx, hz)) continue;
        const path = loop(R, rnd, hx, hz, r, opts.ok || ok, opts.n || 9);
        if (path) pool.push(path);
      }
      let made = 0;
      for (let k = 0; k < Math.min(count, pool.length); k++) {
        const path = pool[k], grp = group(opts, pool);
        for (let g = 0; g < (opts.group || 1); g++) {
          const a = { kind, path, v, walk, rest, off: rnd() * 100, back: g * (opts.gap || 1.4), side: g ? (rnd() - 0.5) * 0.8 : 0,
            x: path.pts[0], z: path.pts[2], s: (opts.size || 1) * (g && opts.young ? 0.75 : 1) * (0.92 + rnd() * 0.16), sound: opts.sound, hear: opts.hear || 8,
            stride: opts.stride || 0.8, flee: opts.flee, fleeV: opts.fleeV || 5, look: opts.look, rear: opts.rear, roll: opts.roll, see: opts.see, grp };
          grp.members.push(a); animals.push(a);
        }
        made++;
      }
      return made;
    },
    add(a, opts = {}) { a.off ??= rnd() * 100; a.s ??= 1; a.hear ??= 8; a.grp ||= group(opts, null); a.grp.members.push(a); animals.push(a); return a; },
    start(statsName, { grab: GRAB, onGrab } = {}) {
      let lastPut = null;
      for (const sp of list) { const put = sp.put.bind(sp); sp.put = (...a) => { lastPut = a; put(...a); }; }
      const grab = GRAB ? animalGrab(game, GRAB, { onGrab: (a, p, how) => { game.audio?.play(a.sound || 'grunt', { x: a.x, y: p.chest.translation().y, z: a.z }); onGrab?.(a, p, how); a.fl = null; } }) : null;
      const posed = new Set(), cams = [], heard = new Map();
      const far = Math.max(SEE, ...animals.map((a) => a.see || 0));
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, span = Math.hypot(bx1 - bx0, bz1 - bz0) / 2 + far;
      const stats = game[statsName] = { count: animals.length, shown: 0, species: S, list: animals };
      game.updaters.push((dt, t) => {
        cams.length = 0;
        for (const p of game.players) { const c = p.camera?.cam?.position; if (c && Math.hypot(c.x - cx, c.z - cz) < span) cams.push(c); }
        if (!cams.length) { if (stats.shown) { for (const s of list) { s.begin(); s.end(); s.mesh.visible = false; } stats.shown = 0; } return; }
        for (const s of list) s.begin();
        let shown = 0;
        posed.clear();
        for (const a of animals) {
          let vis = false;
          const sr = (a.see || SEE) + 30;
          for (const c of cams) if ((c.x - a.x) ** 2 + (c.z - a.z) ** 2 < sr * sr) { vis = true; break; }
          const grp = a.grp;
          if (!vis && grp && (!a.g || a.g.st === 'free')) { // out of sight: maybe it wanders off, or turns up somewhere else
            const cyc = Math.floor((t + grp.phase) / grp.period);
            if (grp.cycle === null) grp.cycle = cyc;
            else if (cyc !== grp.cycle) { grp.cycle = cyc; reroll(grp); }
          }
          a.hidden = grp ? !grp.present : a.hidden;
          if (!vis || a.hidden) continue;
          lastPut = null;
          pose(a, t, dt);
          if (lastPut) { a.pose = [lastPut[0], lastPut[1], lastPut[2], lastPut[3]]; posed.add(a); shown++; }
        }
        grab?.update(posed, t, dt);
        for (const s of list) { s.end(); s.mesh.visible = s.n > 0; }
        stats.shown = shown;
        for (const p of game.players) {
          if (p.seat) continue;
          const c = p.chest.translation();
          for (const a of animals) {
            if (!a.sound || a.hidden || (c.x - a.x) ** 2 + (c.z - a.z) ** 2 > a.hear * a.hear) continue;
            const last = heard.get(a) || -99;
            if (t - last > 7 + hash(a.off) * 6) { heard.set(a, t); game.audio?.play(a.sound, { x: a.x, y: c.y, z: a.z }); a.startle = t; }
          }
        }
      });

      W.nearest = (x, z, r) => nearestPlayer(x, z, r);
      W.noticed = (a, x, z, y, yaw, r) => noticed(a, x, z, y, yaw, r);
      // a player this animal notices within radius r (see the top: speed, view, cover)
      const _n = { x: 0, z: 0, y: 0, p: null, d: 0 }, _ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      function noticed(a, x, z, y, yaw, r) {
        let best = null, bd = 1e9;
        for (const p of game.players) {
          const c = p.chest.translation(), dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz);
          if (d > r || d > bd) continue;
          const v = p.chest.linvel(), sp = Math.hypot(v.x, v.z);
          let k = 0.25 + 0.75 * Math.min(1, Math.max(0, (sp - 0.8) / 3.5));
          if (p.seat) k = 1;                                       // engines are loud
          else k *= 1 - 0.3 * (p.sneak || 0);                     // crouched, sneaking (player.js)
          if (yaw != null && d > 0.5) { let da = Math.atan2(dx, dz) - yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > 1.9) k *= 0.55; }
          if (d > r * k * 0.5) {                                   // cover: something solid in between
            const ey = y + 0.4, dy = c.y - ey, L = Math.hypot(dx, dy, dz);
            _ray.origin.x = x; _ray.origin.y = ey; _ray.origin.z = z; _ray.dir.x = dx / L; _ray.dir.y = dy / L; _ray.dir.z = dz / L;
            if (game.physics.world.castRay(_ray, L - 0.6, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CAMERA_QUERY)) k *= 0.5;
          }
          if (d < r * k) { best = p; bd = d; _n.x = c.x; _n.y = c.y; _n.z = c.z; _n.d = d; }
        }
        if (!best) return null;
        _n.p = best; return _n;
      }
      // can any player's camera see this spot? Close by always; further out only inside the view (a cone
      // round the camera's forward direction), so whatever runs or flies off is only ever lost from view
      function seen(x, y, z) {
        for (const p of game.players) {
          const cam = p.camera?.cam; if (!cam) continue;
          const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z, d = Math.hypot(dx, dy, dz);
          if (d < 55) return true;
          if (d > 160) continue;
          const e = cam.matrixWorld.elements;                     // forward = -(third column)
          if (-(dx * e[8] + dy * e[9] + dz * e[10]) / d > 0.55) return true;
        }
        return false;
      }
      W.seen = seen;
      // scared off for good (timid): run on away from everyone, and vanish once 40 m from them all and
      // out of every camera's view (it never pops away in plain sight)
      function runOff(a, t, dt, sp, st) {
        let n = nearestPlayer(st.x, st.z, 40);
        if (!n && !seen(st.x, R.groundAt(st.x, st.z), st.z)) { a.grp.present = false; a.hidden = true; return false; }
        if (!n) n = nearestPlayer(st.x, st.z, 1e4);                 // still in view: keep running away
        if (!n) { a.grp.present = false; a.hidden = true; return false; }
        let dx = st.x - n.x, dz = st.z - n.z;
        const l = Math.hypot(dx, dz) || 1, v = a.fleeV || 4, step = v * dt;
        dx /= l; dz /= l;
        if (R.groundAt(st.x + dx * 3, st.z + dz * 3) < -0.2) {   // water ahead: veer along the shore
          const s_ = R.groundAt(st.x - dz * 3, st.z + dx * 3) > R.groundAt(st.x + dz * 3, st.z - dx * 3) ? 1 : -1;
          [dx, dz] = [-dz * s_, dx * s_];
        }
        st.x += dx * step; st.z += dz * step;
        st.ph = (st.ph || 0) + step * 6.283 / (a.stride || 0.8);
        sp.put(st.x, R.groundAt(st.x, st.z), st.z, Math.atan2(dx, dz), 0, 0, a.s, st.ph, 1.2);
        a.x = st.x; a.z = st.z;
        return true;
      }
      const _np = { x: 0, z: 0, y: 0, p: null, d: 0 };
      function nearestPlayer(x, z, r) {
        let best = r * r, hit = null;
        for (const p of game.players) { const c = p.chest.translation(), d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < best) { best = d; hit = p; _np.x = c.x; _np.z = c.z; _np.y = c.y; } }
        if (!hit) return null;
        _np.p = hit; _np.d = Math.sqrt(best); return _np;
      }
      // skittish: run off from a player, then walk back to where it would be on its loop
      function flee(a, t, dt, sp, home) {
        const f = a.fl ||= { st: null, x: a.x, z: a.z, cool: 0 };
        if (!f.st) {
          if (t < f.cool) return false;
          const n = noticed(a, a.x, a.z, a.pose?.[1] ?? 0, a.pose?.[3], a.flee);
          if (!n) return false;
          f.st = 'run'; f.t0 = t; f.x = a.x; f.z = a.z;
          const dx = a.x - n.x, dz = a.z - n.z, l = Math.hypot(dx, dz) || 1; f.dx = dx / l; f.dz = dz / l;
          if (a.sound) game.audio?.play(a.sound, { x: a.x, y: n.y, z: a.z }, 0.7);
        }
        if (f.st === 'gone') return runOff(a, t, dt, sp, f);
        let tx, tz, v;
        if (f.st === 'run') {
          const turn = Math.sin(t * 2 + a.off) * 0.6; // zig-zag a little
          tx = f.x + (f.dx * Math.cos(turn) - f.dz * Math.sin(turn)) * 3; tz = f.z + (f.dz * Math.cos(turn) + f.dx * Math.sin(turn)) * 3; v = a.fleeV;
          if (t - f.t0 > 2.2) { const n = nearestPlayer(f.x, f.z, a.flee * 1.3); if (n) { f.t0 = t; const dx = f.x - n.x, dz = f.z - n.z, l = Math.hypot(dx, dz) || 1; f.dx = dx / l; f.dz = dz / l; } else f.st = a.grp?.timid ? 'gone' : 'back'; }
        } else { tx = home.x; tz = home.z; v = Math.max(1.5, a.v * 1.5); }
        const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz), st = Math.min(d, v * dt);
        if (d > 1e-3) { f.x += dx / d * st; f.z += dz / d * st; }
        if (f.st === 'back' && d < 0.3) { f.st = null; f.cool = t + 4; return false; }
        const y = R.groundAt(f.x, f.z);
        f.ph = (f.ph || 0) + st * 6.283 / a.stride;
        sp.put(f.x, y, f.z, d > 1e-3 ? Math.atan2(dx, dz) : 0, 0, 0, a.s, f.ph, 1.2);
        a.x = f.x; a.z = f.z;
        return true;
      }
      function pose(a, t, dt) {
        const sp = S[a.kind];
        if (grab?.drive(a, t, dt, sp)) return;
        const g = a.g;
        if (a.custom) return a.custom(a, t, dt, S, W);
        if (a.fly) {
          const ang = t * a.w + a.off, x = a.x0 + Math.cos(ang) * a.r, z = a.z0 + Math.sin(ang) * a.r, glide = Math.sin(t * 0.6 + a.off) > 0.2;
          const y = a.y + (a.alt || 18) + Math.sin(t * 0.4 + a.off) * 2;
          sp.put(x, y, z, Math.atan2(-Math.sin(ang) * a.w, Math.cos(ang) * a.w), 0, -Math.sign(a.w) * 0.35, a.s, glide ? 0.4 : t * 10 + a.off, glide ? 0.2 : 1);
          a.x = x; a.z = z;
          return;
        }
        if (a.perch) return perch(a, t, dt);
        if (a.coil) {
          const n = nearestPlayer(a.px, a.pz, a.hear * 0.8), up = n ? 1 : 0;
          a.up = (a.up || 0) + (up - (a.up || 0)) * Math.min(1, dt * 4);
          const yaw = n ? Math.atan2(n.x - a.px, n.z - a.pz) : a.yaw;
          sp.put(a.px, a.py, a.pz, yaw, 0.35 * a.up, 0, a.s, t * (n ? 24 : 0.6) + a.off, 0.25 + a.up * 0.3);
          a.x = a.px; a.z = a.pz;
          return;
        }
        if (a.still) { sp.put(a.px, a.py, a.pz, a.yaw + Math.sin(t * 0.3 + a.off) * 0.3, 0, 0, a.s, t * 0.8 + a.off, 0.15); a.x = a.px; a.z = a.pz; return; }
        const tr = travelled(t - (a.tAdj || 0), a.v, a.walk, a.rest, a.off);
        const o = along(a.path, tr.s - a.back);
        if (a.flee && (!g || g.st === 'free') && flee(a, t, dt, sp, o)) return;
        let near = null;
        if (a.look && (!g || g.st === 'free')) { near = noticed(a, a.x, a.z, a.pose?.[1] ?? 0, a.pose?.[3], a.look); if (near) a.tAdj = (a.tAdj || 0) + dt; }
        let y = o.y, pitch = o.pitch * 0.7, yaw = o.yaw, amp = tr.moving ? 1 : 0, ph = tr.s * 6.283 / a.stride + a.off;
        if (a.side) { const cs = Math.cos(yaw), sn = Math.sin(yaw); o.x += cs * a.side; o.z -= sn * a.side; }
        if (a.rear && strike(a, t, o, near, sp)) return;
        if (near) { yaw = Math.atan2(near.x - o.x, near.z - o.z); amp = 0; pitch = 0; if (a.rear) { pitch = 0.3; ph = t * 30 + a.off; amp = 0.12; } } // (rear: a snake rears up and rattles)
        else if (!tr.moving) { yaw += Math.sin(t * 0.6 + a.off) * 0.3; ph = t * 1.2 + a.off; amp = 0.15; }
        if (g?.st === 'return' && a.grp?.timid) {       // let go: a timid one runs off and is gone
          const st = a.fl?.st === 'gone' ? a.fl : (a.fl = { st: 'gone', x: g.x, z: g.z });
          if (runOff(a, t, dt, sp, st)) { g.x = a.x; g.z = a.z; return; }
          g.st = 'free'; a.fl = null; return;
        }
        if (g?.st === 'return') {
          const dx = o.x - g.x, dz = o.z - g.z, d = Math.hypot(dx, dz), st = Math.min(d, 2.5 * dt);
          if (d > 1e-3) { g.x += dx / d * st; g.z += dz / d * st; }
          if (d < 0.3) g.st = 'free';
          sp.put(g.x, R.groundAt(g.x, g.z), g.z, d > 0.05 ? Math.atan2(dx, dz) : yaw, 0, 0, a.s, t * 8, 1);
          a.x = g.x; a.z = g.z;
          return;
        }
        sp.put(o.x, y, o.z, yaw, pitch, 0, a.s, ph, amp);
        a.x = o.x; a.z = o.z;
      }
      // a rearing snake strikes only when bothered: someone who keeps coming closer after its warning
      // (within 1.3 m, reared 0.8 s or more) or treads on it. The bite poisons (poison.js); then it
      // stays calm for 20 s (rears, won't strike)
      function strike(a, t, o, near, sp) {
        if (!a.strike) {
          if (near) a.rearT0 ??= t; else a.rearT0 = null;
          if (t < (a.calm || 0)) return false;
          const warned = near && near.d < 1.3 && t - a.rearT0 > 0.8 && !near.p.seat;
          const trod = !warned && nearestPlayer(o.x, o.z, 0.7);
          if (!warned && !(trod && !trod.p.seat)) return false;
          a.strike = { t0: t, p: warned ? near.p : trod.p, hit: false };
        }
        const S_ = a.strike, u = t - S_.t0, c = S_.p.chest.translation(), dx = c.x - o.x, dz = c.z - o.z, l = Math.hypot(dx, dz) || 1;
        if (!S_.hit && u > 0.12) {
          S_.hit = true;
          game.audio?.play('hiss', { x: o.x, y: o.y, z: o.z });
          if (l < 1.9 && S_.p.state !== 'limp') { game.poison?.apply(S_.p, 14); S_.p.stumble = Math.max(S_.p.stumble || 0, 0.4); }
        }
        if (u > 0.6) { a.strike = null; a.calm = t + 20; a.rearT0 = null; return false; }
        const lunge = Math.sin(Math.min(1, u / 0.35) * Math.PI) * Math.min(0.5, l * 0.4);   // out and back
        sp.put(o.x + dx / l * lunge, o.y, o.z + dz / l * lunge, Math.atan2(dx, dz), 0.3 + lunge * 0.8, 0, a.s, t * 30 + a.off, 0.12);
        a.x = o.x; a.z = o.z;
        return true;
      }
      // perched / ground birds: peck and hop about the spot; flee into the air from a player, circle,
      // then glide back down
      function perch(a, t, dt) {
        const st = a.st ||= { mode: 'sit', t0: 0, x: a.px, y: a.py, z: a.pz };
        const sit = S[a.kind], fly = S[a.flyKind];
        if (st.mode === 'sit') {
          const n = noticed(a, a.px, a.pz, a.py, a.yaw, a.shy || 6);
          if (n && t - st.t0 > 3) { st.mode = a.grp?.timid ? 'away' : 'up'; st.t0 = t; st.a0 = Math.atan2(a.pz - n.z, a.px - n.x); if (a.sound) game.audio?.play(a.sound, { x: a.px, y: a.py, z: a.pz }, 0.8); }
          else {
            const hop = a.hop ? Math.max(0, Math.sin(t * 5 + a.off)) * 0.04 : 0, look = Math.sin(t * 0.9 + a.off) * 0.8;
            const peck = a.hop && Math.sin(t * 1.7 + a.off * 3) > 0.7 ? -0.5 : 0;
            sit.put(a.px, a.py + hop, a.pz, a.yaw + look, peck, 0, a.s, t * 2 + a.off, 0.1);
            a.x = a.px; a.z = a.pz;
            return;
          }
        }
        const u = t - st.t0, alt = a.alt || 14, R0 = a.circle || 12, w = 0.45;
        let x, y, z, yaw, k;
        if (st.mode === 'away') {                     // timid: flies off over the horizon, gone
          const dx = Math.cos(st.a0), dz = Math.sin(st.a0), d = u * 9;
          x = a.px + dx * d; z = a.pz + dz * d; y = a.py + Math.min(alt * 2, u * 4);
          if (!nearestPlayer(x, z, 70) && !seen(x, y, z)) { st.mode = 'sit'; st.t0 = t; a.grp.present = false; a.hidden = true; return; }
          fly.put(x, y, z, Math.atan2(dx, dz), 0.15, 0, a.s, t * 12 + a.off, 1);
          a.x = x; a.z = z;
          return;
        }
        if (st.mode === 'up') {                      // climb out to the circle
          k = Math.min(1, u / 2.5);
          const ang = st.a0 + u * w * k;
          x = a.px + Math.cos(ang) * R0 * k; z = a.pz + Math.sin(ang) * R0 * k; y = a.py + alt * (1 - (1 - k) * (1 - k));
          yaw = Math.atan2(-Math.sin(ang) * w, Math.cos(ang) * w);
          if (u > 18 + hash(a.off, Math.floor(t / 30)) * 12) { st.mode = 'down'; st.t0 = t; st.ang = ang; }
          if (k >= 1) yaw = Math.atan2(-Math.sin(ang), Math.cos(ang));
        } else {                                       // glide back down onto the perch
          k = Math.min(1, u / 3);
          const ang = st.ang + u * w * (1 - k);
          x = a.px + Math.cos(ang) * R0 * (1 - k); z = a.pz + Math.sin(ang) * R0 * (1 - k); y = a.py + alt * (1 - k * k);
          yaw = Math.atan2(a.px - x, a.pz - z);
          if (k >= 1) { st.mode = 'sit'; st.t0 = t; }
        }
        fly.put(x, y, z, yaw, 0, -0.3, a.s, t * 12 + a.off, 1);
        a.x = x; a.z = z;
      }
      return stats;
    },
  };
  return W;
}
