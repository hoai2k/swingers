// Mission NPCs: spawned when a job needs them (passengers, a drowning swimmer,
// an outlaw, skiers waiting for cocoa...), pinned awake while the job runs and
// steered by a small AI of their own instead of npc.js's wander / idle brain.
// Modes (n.job.mode): 'stand' (face the nearest player), 'help' (tread water,
// shout), 'flee' (run from the nearest participant), 'follow' (stay close to
// n.job.leader, hop into their vehicle), 'walk' (to n.job.target), 'wave'.
import { ROLES } from '../npc.js';
import { meshHeight } from '../terrain.js';

const DT = 1 / 60;
const pick = (a) => a[(Math.random() * a.length) | 0];

export function spawnJobNPC(game, role, x, z, opts = {}) {
  const base = typeof role === 'string' ? ROLES[role] : role;
  const n = game.npcs.spawn(base ? role : 'townsfolk', x, z, { behaviour: 'idle', flee: false, ...opts });
  n.pinned = true;
  n.group.userData.noCull = true;
  n.activate();
  game.npcs.awake.add(n);
  n.job = { mode: 'stand', t: 0, shout: 0, stuck: 0 };
  n.think = () => think(game, n);
  return n;
}

export function despawnJobNPC(game, n) {
  if (!n || n.gone) return;
  n.gone = true;
  if (n.seat) n.leaveSeat();
  game.npcs.despawn(n);
}

// world-relative stick toward (x, z) at `speed` (0..1), like npc.js think()
function toward(n, inp, pr, x, z, speed) {
  const hp = n.hips.translation();
  const dx = x - hp.x, dz = z - hp.z, l = Math.hypot(dx, dz);
  if (l < 0.3) return l;
  const k = Math.min(speed, speed * l / 1.2) / l;
  inp.moveX = -dx * k; inp.moveY = dz * k;
  const v = n.hips.linvel(), j = n.job;
  if (Math.hypot(v.x, v.z) < 0.4 && n.grounded) { j.stuck += DT; if (j.stuck > 0.8) { pr.jump = true; j.stuck = 0; } }
  else j.stuck = Math.max(0, j.stuck - DT);
  return l;
}

function nearest(game, n, list) {
  const c = n.hips.translation();
  let best = null, bd = 1e9;
  for (const p of list) { const t = p.chest.translation(), d = Math.hypot(t.x - c.x, t.z - c.z); if (d < bd) { bd = d; best = p; } }
  return best ? { p: best, d: bd } : null;
}

function think(game, n) {
  const j = n.job, inp = { moveX: 0, moveY: 0, sprint: false }, pr = {};
  j.t += DT;
  if (n.bubble && (n.bubble.t -= DT) <= 0) n.bubble = null;
  if (n.state === 'limp') {
    j.limp = (j.limp || 0) + DT;
    if (n.limpTimer <= 0 && j.limp > 1.2 && j.mode !== 'help') { pr.jump = true; j.limp = 0; }
    return [inp, pr];
  }
  j.limp = 0;
  if (n.state === 'seated') return [inp, pr];
  const players = j.run ? [...j.run.players] : game.players;
  const near = nearest(game, n, players.length ? players : game.players);
  const hp = n.hips.translation();
  switch (j.mode) {
    case 'help': {
      if ((j.shout -= DT) <= 0) { n.say(pick(j.lines || ['Help!', 'Help me!', 'Over here!'])); j.shout = 3.5; }
      if (near) n.faceTo(near.p.chest.translation(), DT);
      // drift back to the spot if the waves push us off
      if (j.home && Math.hypot(hp.x - j.home[0], hp.z - j.home[1]) > 3) toward(n, inp, pr, j.home[0], j.home[1], 0.35);
      break;
    }
    case 'flee': {
      const A = j.area; // { x, z, r }
      if (near && near.d < (j.scare || 16)) {
        const t = near.p.chest.translation();
        let dx = hp.x - t.x, dz = hp.z - t.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        // zig-zag a little, turn away from water and the edge of the area
        const zig = Math.sin(j.t * 1.7) * 0.6;
        let ax = dx * Math.cos(zig) - dz * Math.sin(zig), az = dx * Math.sin(zig) + dz * Math.cos(zig);
        for (let k = 0; k < 6; k++) {
          const tx = hp.x + ax * 6, tz = hp.z + az * 6;
          const out = A && Math.hypot(tx - A.x, tz - A.z) > A.r;
          if (meshHeight(tx, tz) > 0.4 && !out) break;
          const a = (k % 2 ? 1 : -1) * (0.7 + k * 0.35), c = Math.cos(a), s = Math.sin(a);
          [ax, az] = [dx * c - dz * s, dx * s + dz * c];
        }
        toward(n, inp, pr, hp.x + ax * 6, hp.z + az * 6, j.speed ?? 0.82);
        inp.sprint = true;
        if ((j.shout -= DT) <= 0) { n.say(pick(j.lines || ['Can\'t catch me!', 'Too slow!', 'Yeehaw!'])); j.shout = 4 + Math.random() * 3; }
      } else {
        if ((j.shout -= DT) <= 0 && near && near.d < 40) { n.say(pick(j.taunts || ['Nyah nyah!'])); j.shout = 5; }
        if (near) n.faceTo(near.p.chest.translation(), DT);
        if (A && Math.hypot(hp.x - A.x, hp.z - A.z) > A.r * 0.8) toward(n, inp, pr, A.x, A.z, 0.5);
      }
      break;
    }
    case 'follow': {
      const L = j.leader;
      if (!L || !game.players.includes(L)) break;
      const t = L.chest.translation(), d = Math.hypot(t.x - hp.x, t.z - hp.z);
      // hop into the leader's vehicle when it's close and slow
      const v = L.seat?.vehicle;
      if (v && !v.destroyed && d < 7 && Math.abs(v.speed) < 3) {
        const seat = v.seats.find((s) => s.kind !== 'driver' && !s.occupant && !s.disabled);
        if (seat) { n.sitIn(seat); n.say(pick(j.board || ['Let\'s go!'])); break; }
      }
      if (d > 45) { // lost: catch up (Wobbly Life is forgiving)
        const yaw = L.yaw, bx = t.x - Math.sin(yaw) * 2.5, bz = t.z - Math.cos(yaw) * 2.5;
        n.teleport(bx, n.groundY(bx, bz, t.y + 2), bz, yaw);
        break;
      }
      if (d > 1.8) { toward(n, inp, pr, t.x, t.z, Math.min(1, 0.45 + d / 5)); inp.sprint = d > 4; }
      else n.faceTo(t, DT);
      break;
    }
    case 'walk': {
      if (j.target) { const l = toward(n, inp, pr, j.target[0], j.target[1], 0.55); if (l < 0.8) j.mode = 'stand'; }
      break;
    }
    default: { // stand / wave
      if (near && near.d < 12) n.faceTo(near.p.chest.translation(), DT);
      if (j.home && Math.hypot(hp.x - j.home[0], hp.z - j.home[1]) > 2.5) toward(n, inp, pr, j.home[0], j.home[1], 0.45);
      if (j.mode === 'wave' && (j.shout -= DT) <= 0 && near && near.d < 30) { n.say(pick(j.lines || ['Over here!'])); j.shout = 4; }
    }
  }
  return [inp, pr];
}
