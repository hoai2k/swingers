// Objective step types. A job's `steps` run in order; each step is plain data
// with a `type` naming one of the handlers below:
//
//   reach      { at: [x, z], r, y?, vehicle?, stop?, style: 'beacon' | 'hoop', give?, take?, text }
//              a participant gets within r (in a vehicle of the listed types when `vehicle`
//              is set: an array of types or true for any; stopped when `stop`)
//   passenger  { npc, from: [x, z], to: [x, z], r, vehicle?, board, thanks, key }
//              a fare waits at `from`, gets into a participant's vehicle, gets out at `to`
//   follow     { npc | key, at: [x, z], to: [x, z], r, help?, found, board, thanks, jail? }
//              reach the NPC (a swimmer, a climber, a caught outlaw...), then it follows its
//              rescuer (and hops into their vehicle) until it is within r of `to`
//   catch      { npc, at: [x, z], area: { x, z, r }, key, caught }
//              an NPC runs away; grab it, punch it over or corner it
//   items      { kind, spots: [[x, z, y?], ...], zones: [{ x, z, r } | { box: [x0, x1, z0, z1], y1 }],
//                need, respawn?, text }  physical things (ITEMS in fx.js) to bring into a zone
//   touch      { spots: [[x, z], ...], r, npc?, lines?, hidden?, area?, give?, text }
//              visit every spot in any order (an NPC waits on each when `npc` is set;
//              `hidden` spots only show up when you're close, inside the beacon `area`)
//   fires      { spots: [[x, z, size?], ...], vehicle: ['firetruck'], text }
//              fire-truck hose (drive up close) or drive straight through the flames
//
// Handlers: start(run, s, M), update(run, s, M) -> truthy when done,
// targets(run, s, M) -> [{ x, y, z, r, style, yaw, item? }] for beacons, the map
// and the HUD pointer, and optional count(run, s) -> [done, total] and end(run, s, M).
import { spawnItem, removeItem, puff, Fire, Spray, setCargo } from './fx.js';
import { spawnJobNPC } from './ai.js';

const DT = 1 / 60;
const pos = (p) => p.chest.translation();
const d2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);
const vehOf = (p) => (p.seat?.vehicle && !p.seat.vehicle.destroyed ? p.seat.vehicle : null);
export function vehicleOK(p, want) {
  if (!want) return true;
  const v = vehOf(p);
  if (!v) return false;
  return want === true || want.includes(v.type);
}
const holding = (p, body) => p.hands.L.body === body || p.hands.R.body === body;

export const STEPS = {
  reach: {
    start(run, s, M) {
      s._y = s.y ?? M.groundY(s.at[0], s.at[1], s.water);
      if (s.next) s._ny = s.next[2] ?? M.groundY(s.next[0], s.next[1], s.water);
    },
    update(run, s) {
      const r = s.r ?? 4;
      for (const p of run.players) {
        if (!vehicleOK(p, s.vehicle)) continue;
        const c = pos(p);
        if (d2(c, s.at[0], s.at[1]) > r || Math.abs(c.y - s._y) > (s.dy ?? 8)) continue;
        if (s.stop && Math.abs(vehOf(p)?.speed || 0) > 3.5) continue;
        return p;
      }
      return null;
    },
    targets(run, s) {
      const out = [{ x: s.at[0], y: s._y, z: s.at[1], r: s.r ?? 4, style: s.style || 'beacon', yaw: s.yaw || 0 }];
      if (s.next) out.push({ x: s.next[0], y: s._ny, z: s.next[1], r: s.r ?? 4, style: s.style || 'beacon', yaw: s.next[3] || 0, ghost: true });
      return out;
    },
  },

  passenger: {
    start(run, s, M) {
      const n = M.npc(run, s.key || 'fare', s.npc || 'townsfolk', s.from[0], s.from[1]);
      n.job.mode = 'wave'; n.job.home = s.from.slice(); n.job.lines = s.hail || ['Taxi!', 'Over here!'];
      s.phase = 'wait'; s._ty = M.groundY(s.to[0], s.to[1]);
    },
    update(run, s, M) {
      const n = run.npcs[s.key || 'fare'];
      if (!n) return true;
      const c = n.hips.translation();
      if (s.phase === 'wait') {
        for (const p of run.players) {
          const v = vehOf(p);
          if (!v || p.seat.kind !== 'driver' || !vehicleOK(p, s.vehicle)) continue;
          const t = v.body.translation();
          if (Math.hypot(t.x - c.x, t.z - c.z) > 9 || Math.abs(v.speed) > 3) continue;
          const seat = v.seats.find((q) => q.kind !== 'driver' && !q.occupant && !q.disabled);
          if (!seat) continue;
          n.sitIn(seat);
          n.say(s.board || 'Hello! Take me there, please!', 4);
          s.phase = 'ride'; M.sound('board', t);
          return null;
        }
      } else if (s.phase === 'ride') {
        if (!n.seat) { s.phase = 'wait'; n.job.home = [c.x, c.z]; n.say('Hey! I fell out!'); return null; }
        const v = n.seat.vehicle;
        if (Math.hypot(c.x - s.to[0], c.z - s.to[1]) < (s.r ?? 9) && Math.abs(v.speed) < 3) {
          n.leaveSeat();
          n.job.mode = 'walk'; n.job.target = [s.to[0] + 3, s.to[1] + 3];
          n.say(s.thanks || 'Thanks! Keep the change!', 4);
          return true;
        }
      }
      return null;
    },
    targets(run, s) {
      const n = run.npcs[s.key || 'fare'];
      if (s.phase === 'wait' && n) { const c = n.hips.translation(); return [{ x: c.x, y: c.y - 1, z: c.z, r: 3, style: 'beacon' }]; }
      return [{ x: s.to[0], y: s._ty, z: s.to[1], r: s.r ?? 9, style: 'beacon' }];
    },
    text(run, s) { return s.phase === 'wait' ? (s.text || 'Pick up the passenger') : (s.rideText || 'Drive the passenger to the beacon'); },
  },

  follow: {
    start(run, s, M) {
      const key = s.key || 'buddy';
      let n = run.npcs[key];
      if (!n) {
        n = M.npc(run, key, s.npc || 'townsfolk', s.at[0], s.at[1]);
        if (s.help) { n.job.mode = 'help'; n.job.home = s.at.slice(); n.job.lines = s.helpLines; } else { n.job.mode = 'wave'; n.job.home = s.at.slice(); n.job.lines = s.helpLines; }
      }
      s.phase = s.skipReach ? 'follow' : 'reach';
      if (s.skipReach) { n.job.mode = 'follow'; n.job.leader = n.job.leader || run.players[0]; n.job.board = s.board; }
      s._ty = M.groundY(s.to[0], s.to[1]);
    },
    update(run, s, M) {
      const n = run.npcs[s.key || 'buddy'];
      if (!n) return true;
      const c = n.hips.translation();
      if (s.phase === 'reach') {
        for (const p of run.players) {
          const t = pos(p), v = vehOf(p), near = Math.hypot(t.x - c.x, t.z - c.z) < (v ? 6 : 2.6) && Math.abs(t.y - c.y) < 3;
          const grab = p.hands.L.owner === n || p.hands.R.owner === n;
          if (!near && !grab) continue;
          s.phase = 'follow';
          n.job.mode = 'follow'; n.job.leader = p; n.job.board = s.board;
          if (n.state === 'limp') n.wake(true);
          n.say(s.found || 'My hero!', 3.5);
          M.sound('found', c);
          return null;
        }
        return null;
      }
      // keep following the nearest participant if the leader left the job
      if (!run.players.includes(n.job.leader)) n.job.leader = run.players[0];
      if (Math.hypot(c.x - s.to[0], c.z - s.to[1]) < (s.r ?? 5)) {
        if (n.seat) n.leaveSeat();
        n.job.mode = 'stand'; n.job.home = s.to.slice();
        n.say(s.thanks || 'Phew! Thank you!', 4);
        if (s.jail) n.teleport(s.jail[0], s.jail[1], s.jail[2], 0);
        return true;
      }
      return null;
    },
    targets(run, s) {
      const n = run.npcs[s.key || 'buddy'];
      if (s.phase === 'reach' && n) { const c = n.hips.translation(); return [{ x: c.x, y: c.y - 1, z: c.z, r: 2.5, style: 'beacon' }]; }
      return [{ x: s.to[0], y: s._ty, z: s.to[1], r: s.r ?? 5, style: 'beacon' }];
    },
    text(run, s) { return s.phase === 'reach' ? (s.text || 'Reach them') : (s.toText || 'Bring them to the beacon'); },
  },

  catch: {
    start(run, s, M) {
      const n = M.npc(run, s.key || 'outlaw', s.npc || 'townsfolk', s.at[0], s.at[1]);
      Object.assign(n.job, { mode: 'flee', area: s.area, scare: s.scare ?? 16, speed: s.speed ?? 0.82, lines: s.lines, taunts: s.taunts });
      s.close = 0;
    },
    update(run, s, M) {
      const n = run.npcs[s.key || 'outlaw'];
      if (!n) return true;
      const c = n.hips.translation();
      let by = null;
      for (const p of run.players) {
        const t = pos(p), d = Math.hypot(t.x - c.x, t.z - c.z);
        if (p.hands.L.owner === n || p.hands.R.owner === n) { by = p; break; }
        if (n.state === 'limp' && d < 4) { by = p; break; }
        if (d < 1.3) { s.close += DT; if (s.close > 0.45) { by = p; break; } }
      }
      if (!by) { s.close = Math.max(0, s.close - DT * 0.5); return null; }
      n.job.leader = by; n.job.mode = 'follow';
      n.say(s.caught || 'Alright, alright! I give up!', 4);
      M.sound('found', c);
      return true;
    },
    targets(run, s) {
      const n = run.npcs[s.key || 'outlaw'];
      if (!n) return [];
      const c = n.hips.translation();
      return [{ x: c.x, y: c.y - 1, z: c.z, r: 2, style: 'beacon' }];
    },
  },

  items: {
    start(run, s, M) {
      s.list = s.spots.map(([x, z, y], i) => M.item(run, s.kinds ? s.kinds[i % s.kinds.length] : s.kind, x, y ?? M.groundY(x, z, false, 6), z));
      s.got = 0; s.need = s.need ?? s.spots.length; s.k = 0;
      for (const zn of s.zones) zn._y = zn.y ?? M.groundY(zn.x ?? (zn.box[0] + zn.box[1]) / 2, zn.z ?? (zn.box[2] + zn.box[3]) / 2);
    },
    update(run, s, M) {
      // animals run from people (and from each other a little)
      for (const it of s.list) if (it.animal && !it.done && !it.removed) animal(M.game, it, run);
      if (++s.k % 5) return s.got >= s.need;
      for (const it of s.list) {
        if (it.done || it.removed) continue;
        const t = it.body.translation();
        if (t.y < -15 || Math.hypot(t.x - it.home.x, t.z - it.home.z) > (s.leash ?? 600)) { M.resetItem(it); continue; }
        const zn = s.zones.find((z) => inZone(z, t));
        if (!zn) continue;
        it.done = true; s.got++;
        M.sound('drop', t);
        if (s.keep) { it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); it.body.setLinearDamping(4); }
        else { puff(M.game, t, 0xffffff, 8, 0.6); removeItem(M.game, it); }
        if (s.respawn && s.got < s.need) { const sp = s.spots[s.got % s.spots.length]; s.list.push(M.item(run, s.kind, sp[0], sp[2] ?? M.groundY(sp[0], sp[1], false, 6), sp[1])); }
      }
      return s.got >= s.need;
    },
    targets(run, s) {
      const zones = s.zones.map((z) => (z.box ? { x: (z.box[0] + z.box[1]) / 2, y: z._y, z: (z.box[2] + z.box[3]) / 2, r: Math.min(z.box[1] - z.box[0], z.box[3] - z.box[2]) / 2, style: 'beacon' } : { x: z.x, y: z._y, z: z.z, r: z.r, style: 'beacon' }));
      const items = [];
      for (const it of s.list) {
        if (it.done || it.removed) continue;
        const t = it.body.translation();
        items.push({ x: t.x, y: t.y, z: t.z, r: 0.6, style: 'dot', item: it, held: run.players.some((p) => holding(p, it.body)) });
      }
      return [...zones, ...items];
    },
    count: (run, s) => [s.got, s.need],
  },

  touch: {
    start(run, s, M) {
      s.left = s.spots.map((sp, i) => ({ i, x: sp[0], z: sp[1], y: M.groundY(sp[0], sp[1]), seen: !s.hidden }));
      if (s.npc) for (const t of s.left) {
        const n = M.npc(run, 'touch' + t.i, s.npc, t.x, t.z);
        n.job.mode = 'wave'; n.job.home = [t.x, t.z]; n.job.lines = s.lines; n.job.shout = 1 + t.i;
        t.npc = n;
      }
      if (s.area) s.area._y = M.groundY(s.area.x, s.area.z);
      s.n = s.left.length;
    },
    update(run, s, M) {
      for (const t of s.left) {
        if (t.done) continue;
        const tx = t.npc ? t.npc.hips.translation().x : t.x, tz = t.npc ? t.npc.hips.translation().z : t.z;
        for (const p of run.players) {
          const c = pos(p), d = Math.hypot(c.x - tx, c.z - tz);
          if (s.hidden && d < (s.reveal ?? 7) && !t.seen) { t.seen = true; M.sound('found', c); }
          if (d > (s.r ?? 2.2) || (!s.vehicleOK && vehOf(p))) continue;
          t.done = true;
          if (t.npc) { t.npc.say(s.thanks ? s.thanks[t.i % s.thanks.length] : 'Thanks!', 3.5); t.npc.job.mode = 'stand'; }
          M.sound('drop', c);
          if (s.dig) puff(M.game, { x: tx, y: c.y - 0.8, z: tz }, 0xd8c08a, 10, 0.7);
          break;
        }
      }
      return s.left.every((t) => t.done);
    },
    targets(run, s) {
      const out = [];
      if (s.area && s.left.some((t) => !t.done && !t.seen)) out.push({ x: s.area.x, y: s.area._y, z: s.area.z, r: s.area.r, style: 'beacon', area: true });
      for (const t of s.left) {
        if (t.done || !t.seen) continue;
        const c = t.npc ? t.npc.hips.translation() : null;
        out.push(c ? { x: c.x, y: c.y - 1, z: c.z, r: 1.6, style: 'beacon' } : { x: t.x, y: t.y, z: t.z, r: s.r ?? 1.6, style: 'beacon', small: true });
      }
      return out;
    },
    count: (run, s) => [s.left.filter((t) => t.done).length, s.n],
  },

  fires: {
    start(run, s, M) {
      s.list = s.spots.map(([x, z, size]) => { const f = new Fire(M.game, x, M.groundY(x, z), z, size || 1.2); f.x = x; f.z = z; run.disposables.push(f); return f; });
      s.spray = new Spray(M.game); run.disposables.push(s.spray);
      s.burn = new Map();
    },
    update(run, s, M) {
      let sprayed = false;
      for (const f of s.list) {
        if (f.level <= 0) continue;
        for (const p of run.players) {
          const v = vehOf(p), c = pos(p), d = Math.hypot(c.x - f.x, c.z - f.z);
          if (v && p.seat.kind === 'driver') {
            const t = v.body.translation(), dv = Math.hypot(t.x - f.x, t.z - f.z);
            if (vehicleOK(p, s.vehicle) && dv < (s.reach ?? 11) && !sprayed) {
              f.level -= DT / (s.hose ?? 2.2); sprayed = true;
              s.spray.aim({ x: t.x, y: t.y + 2.2, z: t.z }, { x: f.x, y: f.g.position.y + 0.6, z: f.z }, M.game.time);
            } else if (dv < 3 && Math.abs(v.speed) > 4) f.level -= DT * 1.6; // driving through the flames
          } else if (!v && d < 1.4 && p.state === 'normal' && !(s.burn.get(p) > 0)) {
            p.knockOut(1.2); s.burn.set(p, 3); M.toastFor(p, 'Ouch, hot!');
            const k = 4 / Math.max(0.3, d);
            p.setVelocity({ x: (c.x - f.x) * k, y: 3, z: (c.z - f.z) * k });
          }
        }
        if (f.level <= 0) { f.level = 0; puff(M.game, { x: f.x, y: f.g.position.y + 1, z: f.z }, 0x9aa0aa, 12, 1.2); M.sound('drop', f.g.position); }
      }
      for (const [p, t] of s.burn) s.burn.set(p, t - DT);
      if (!sprayed) s.spray.hide();
      return s.list.every((f) => f.level <= 0);
    },
    targets(run, s) { return s.list.filter((f) => f.level > 0).map((f) => ({ x: f.x, y: f.g.position.y, z: f.z, r: 5, style: 'beacon' })); },
    count: (run, s) => [s.list.filter((f) => f.level <= 0).length, s.list.length],
    anim(run, s, t) { for (const f of s.list) f.anim(t); },
  },
};

function inZone(z, t) {
  if (z.box) return t.x > z.box[0] && t.x < z.box[1] && t.z > z.box[2] && t.z < z.box[3] && t.y < (z.y1 ?? z._y + 3) && t.y > z._y - 2;
  return Math.hypot(t.x - z.x, t.z - z.z) < z.r && Math.abs(t.y - z._y) < (z.dy ?? 3);
}

// Runaway animals: hop away from whoever comes close, wander otherwise.
function animal(game, it, run) {
  const b = it.body, t = b.translation();
  it.k = (it.k || 0) + 1;
  let fx = 0, fz = 0, near = 1e9;
  for (const p of game.players) {
    const c = p.chest.translation(), dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
    if (holding(p, b)) return; // being carried: just dangle
    if (d < 5.5 && d > 0.01) { fx += dx / d * (5.5 - d); fz += dz / d * (5.5 - d); }
    near = Math.min(near, d);
  }
  const v = b.linvel();
  if (near < 5.5) {
    const l = Math.hypot(fx, fz) || 1, sp = 3.2;
    b.applyImpulse({ x: (fx / l * sp - v.x) * 0.1 * b.mass(), y: 0, z: (fz / l * sp - v.z) * 0.1 * b.mass() }, true);
  } else if (it.k % 240 === (it.seed ??= (Math.random() * 240) | 0)) {
    const a = Math.random() * Math.PI * 2;
    b.applyImpulse({ x: Math.sin(a) * 9, y: 0, z: Math.cos(a) * 9 }, true);
  }
  // little hops and stay upright-ish (face the way we go)
  if (it.k % 50 === 0 && Math.hypot(v.x, v.z) > 0.8 && Math.abs(v.y) < 0.3) b.applyImpulse({ x: 0, y: 2.4 * b.mass() * 0.25, z: 0 }, true);
  const sp = Math.hypot(v.x, v.z);
  if (sp > 0.4) {
    const yaw = Math.atan2(v.x, v.z);
    b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  if (it.k % 200 === 0 && near < 9) game.audio?.play('pop', t, 0.4);
}

export { setCargo };
