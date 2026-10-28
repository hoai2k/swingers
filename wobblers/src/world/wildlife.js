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
import { Species, hash } from './critters.js';
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
  const rnd = R.rng(seed), S = {}, list = [], animals = [];
  const [bx0, bx1, bz0, bz1] = bounds;
  const geos = new Map();
  const W = {
    S, animals, rnd,
    mk(name, model, max, opts = {}) {
      if (!geos.has(model)) geos.set(model, modelGeometry(model));
      const sp = S[name] = new Species(game, geos.get(model), { max, name, shadow: true, ...opts });
      list.push(sp); return sp;
    },
    place(kind, count, r, v, walk, rest, opts = {}) {
      let made = 0;
      for (let k = 0, tries = 0; k < count && tries < 500; tries++) {
        const hx = bx0 + 30 + rnd() * (bx1 - bx0 - 60), hz = bz0 + 30 + rnd() * (bz1 - bz0 - 60);
        if (opts.near && !opts.near(hx, hz)) continue;
        const path = loop(R, rnd, hx, hz, r, opts.ok || ok, opts.n || 9);
        if (!path) continue;
        const group = opts.group || 1;
        for (let g = 0; g < group; g++) animals.push({ kind, path, v, walk, rest, off: rnd() * 100, back: g * (opts.gap || 1.4), side: g ? (rnd() - 0.5) * 0.8 : 0,
          x: path.pts[0], z: path.pts[2], s: (opts.size || 1) * (g && opts.young ? 0.75 : 1) * (0.92 + rnd() * 0.16), sound: opts.sound, hear: opts.hear || 8,
          stride: opts.stride || 0.8, flee: opts.flee, fleeV: opts.fleeV || 5, look: opts.look, roll: opts.roll });
        k++; made++;
      }
      return made;
    },
    add(a) { a.off ??= rnd() * 100; a.s ??= 1; a.hear ??= 8; animals.push(a); return a; },
    start(statsName, { grab: GRAB, onGrab } = {}) {
      let lastPut = null;
      for (const sp of list) { const put = sp.put.bind(sp); sp.put = (...a) => { lastPut = a; put(...a); }; }
      const grab = GRAB ? animalGrab(game, GRAB, { onGrab: (a, p, how) => { game.audio?.play(a.sound || 'grunt', { x: a.x, y: p.chest.translation().y, z: a.z }); onGrab?.(a, p, how); a.fl = null; } }) : null;
      const posed = new Set(), cams = [], heard = new Map();
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, span = Math.hypot(bx1 - bx0, bz1 - bz0) / 2 + SEE;
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
          for (const c of cams) if ((c.x - a.x) ** 2 + (c.z - a.z) ** 2 < (SEE + 30) ** 2) { vis = true; break; }
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
          const n = nearestPlayer(a.x, a.z, a.flee);
          if (!n) return false;
          f.st = 'run'; f.t0 = t; f.x = a.x; f.z = a.z;
          const dx = a.x - n.x, dz = a.z - n.z, l = Math.hypot(dx, dz) || 1; f.dx = dx / l; f.dz = dz / l;
          if (a.sound) game.audio?.play(a.sound, { x: a.x, y: n.y, z: a.z }, 0.7);
        }
        let tx, tz, v;
        if (f.st === 'run') {
          const turn = Math.sin(t * 2 + a.off) * 0.6; // zig-zag a little
          tx = f.x + (f.dx * Math.cos(turn) - f.dz * Math.sin(turn)) * 3; tz = f.z + (f.dz * Math.cos(turn) + f.dx * Math.sin(turn)) * 3; v = a.fleeV;
          if (t - f.t0 > 2.2) { const n = nearestPlayer(f.x, f.z, a.flee * 1.3); if (n) { f.t0 = t; const dx = f.x - n.x, dz = f.z - n.z, l = Math.hypot(dx, dz) || 1; f.dx = dx / l; f.dz = dz / l; } else f.st = 'back'; }
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
        if (a.look && (!g || g.st === 'free')) { near = nearestPlayer(a.x, a.z, a.look); if (near) a.tAdj = (a.tAdj || 0) + dt; }
        let y = o.y, pitch = o.pitch * 0.7, yaw = o.yaw, amp = tr.moving ? 1 : 0, ph = tr.s * 6.283 / a.stride + a.off;
        if (a.side) { const cs = Math.cos(yaw), sn = Math.sin(yaw); o.x += cs * a.side; o.z -= sn * a.side; }
        if (near) { yaw = Math.atan2(near.x - o.x, near.z - o.z); amp = 0; pitch = 0; }
        else if (!tr.moving) { yaw += Math.sin(t * 0.6 + a.off) * 0.3; ph = t * 1.2 + a.off; amp = 0.15; }
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
      // perched / ground birds: peck and hop about the spot; flee into the air from a player, circle,
      // then glide back down
      function perch(a, t, dt) {
        const st = a.st ||= { mode: 'sit', t0: 0, x: a.px, y: a.py, z: a.pz };
        const sit = S[a.kind], fly = S[a.flyKind];
        if (st.mode === 'sit') {
          const n = nearestPlayer(a.px, a.pz, a.shy || 6);
          if (n && t - st.t0 > 3) { st.mode = 'up'; st.t0 = t; st.a0 = Math.atan2(a.pz - n.z, a.px - n.x); if (a.sound) game.audio?.play(a.sound, { x: a.px, y: a.py, z: a.pz }, 0.8); }
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
