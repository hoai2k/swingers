// Prehistoric: Caveman (a big bone club), Velociraptor (fast pack hunter: leaps on its
// prey, pins it down and bites), Raptor Rider (a caveman on a running raptor that bites
// too), Pterodactyl (flies, swoops, carries small units up and drops them) and T-Rex
// (huge: bites, shakes and throws units; its roar sends nearby enemies running).
// The beasts use bc-core.js (a rigid body with kinematic legs/head/tail and a hidden
// pilot ragdoll); the raptor rider uses the mount code of sm-mounts.js.
import { register } from '../ext.js';
import { makeSkeleton } from '../body.js';
import { GUARD } from '../pose.js';
import { THREE, clamp, rand, PART, EXPR } from './common.js';
import {
  V, V3, Q4, BC, beastLayout, beastInit, beastUnitStep, beastHit, beastDie, animLegs, setRot, partPoint, footfalls,
  nearestEnemy, countEnemies, heightOf, trampleBeast, onFoot, small, carry, trackFall, fling, quake, inField, holdUpright,
  chainLayout, chainInit, placeChain, S, hurtBig, shoveBig, closestOnSeg, yawOf, angleDiff, unmountedRadius,
} from './bc-core.js';
import { mountLayout, mountInit, riderHit, riderDie, riderStep, setupRidePoses } from './sm-mounts.js';
import { RIDE, setArm, footMelee } from './sm-core.js';
import * as M from './bc-meshes.js';

const PI = Math.PI;
const _p = new V3(), _a = new V3(), _b = new V3(), _q = new Q4();

// ======================================================================= Velociraptor
const RAPTOR_IDS = new Set(['pr_raptor', 'pr_raptor_rider']);
const RAPTOR = {
  torso: V(0, 0.95, 0), r: 0.24, hh: 0.3, mass: 70, cols: [{ at: V(0, 0.42, 0.55), r: 0.14, mass: 4 }],
  H0: 0.95, speed: 9, accel: 16, turn: 5, turnSlow: 0.6, grip: 24, alpha: 30, stride: 1.8, legAmp: 0.9, bob: 0.04, getUp: 0.9,
  seg: [V(0, 0, -0.35), V(0, 0.3, 0.6)], segR: 0.32, combatR: 0.4, pitch: 1.6, shoveK: 1, blastK: 1,
  torsoMesh: (H, t) => M.raptorTorso(H, t),
  parts: [
    { at: V(0.16, -0.08, -0.02), parent: -1, leg: 0, len: 0.87, mesh: (H, t) => M.raptorLeg(H, t) },
    { at: V(-0.16, -0.08, -0.02), parent: -1, leg: PI, len: 0.87, mesh: (H, t) => M.raptorLeg(H, t) },
    { at: V(0, 0.12, 0.35), parent: -1, mesh: (H, t) => M.raptorHead(H, t) },
    { at: V(0, 0.3, 0.38), parent: 2, mesh: (H, t) => M.raptorJaw(H, t) },
    { at: V(0, 0.05, -0.36), parent: -1, mesh: (H, t) => M.raptorTail(H, t) },
    { at: V(0, 0.05, -0.7), parent: 4, mesh: (H, t) => M.raptorTail(H, t, 1, true) },
  ],
};
const HEAD = 2, JAW = 3, TAIL = 4;

function raptorAnim(b, m) {
  const P = m.parts, t = b.time;
  if (m.state === 'leap') for (const i of [0, 1]) setRot(P[i].q, -0.7);
  else if (m.state === 'pin') for (const i of [0, 1]) setRot(P[i].q, Math.sin(t * 15 + i * PI) * 0.6 - 0.2);
  else animLegs(m);
  m.biteA = Math.max(0, (m.biteA || 0) - 1 / 60 * 4);
  const bite = Math.sin(clamp(m.biteA, 0, 1) * PI);
  const sw = Math.sin(m.phase) * 0.18;
  if (!m.alive) { setRot(P[HEAD].q, 0.6, 0.5); setRot(P[JAW].q, 0.4); setRot(P[TAIL].q, -0.2, 0.3); setRot(P[TAIL + 1].q, 0, 0.3); return; }
  const lunge = m.state === 'leap' ? -0.2 : m.state === 'pin' ? 0.5 : 0;
  setRot(P[HEAD].q, lunge + bite * 0.45 + Math.sin(m.phase * 2) * 0.05, -sw * 0.3);
  setRot(P[JAW].q, m.state === 'leap' ? 0.55 : 0.08 + (1 - bite) * (m.state === 'pin' ? 0.4 : 0) + bite * 0.1);
  const up = m.state === 'leap' ? 0.35 : 0.05;
  setRot(P[TAIL].q, up, sw);
  setRot(P[TAIL + 1].q, up * 0.5, sw * 1.6);
}

function packMult(b, u) {
  let n = 0;
  b.grid.query(u.pos.x, u.pos.z, 7, (o) => {
    if (o !== u && o.alive && o.team === u.team && RAPTOR_IDS.has(o.def.id) && (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2 < 49) n++;
  });
  return 1 + 0.12 * Math.min(n, 4);
}

function raptorThink(u, dt, ctx) {
  const m = u.bc, b = u.battle, p = m.torso.pos;
  m.thinkT = b.time;
  m.retgt = (m.retgt || 0) - dt;
  // pack hunting: go for prey a packmate has already pinned, else the nearest thing that walks
  if (!m.prey || !m.prey.alive || m.retgt <= 0) {
    m.retgt = rand(0.5, 0.9);
    let best = null, bd = 12 * 12;
    for (const o of b.teams[u.team]) {
      const v = o.alive && o.bc && o.bc.victim;
      if (!v || !v.alive || (v.bcPins || 0) >= 3) continue;
      const d = (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    m.prey = best || (heightOf(b, ctx.t) < 3 ? ctx.t : nearestEnemy(b, u.team, p, (o) => heightOf(b, o) < 3)) || ctx.t;
  }
  const t = m.prey;
  u.expr = EXPR.angry;
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz);
  const yaw = yawOf(m.torso.quat), bear = angleDiff(yaw, Math.atan2(dx, dz));
  m.goalYaw = inField(p, Math.atan2(dx, dz));
  const gap = d - t.skel.radius - 0.4;
  m.goalSpeed = gap < 0.6 ? 0 : Math.abs(bear) > 1.3 ? RAPTOR.speed * 0.4 : RAPTOR.speed * (u.def.speed / 9);
  if (m.state === 'run' || m.state === 'idle') {
    m.state = 'run';
    if (m.leapCd <= 0 && gap > 1.0 && gap < 4.8 && Math.abs(bear) < 0.45 && !m.fallen && heightOf(b, t) < 3) leap(b, m, t);
    else if (gap < 0.9 && m.biteCd <= 0) bite(b, m, t, 0.85);
  }
  return t;
}

function leap(b, m, t) {
  const u = m.u, p = m.torso.pos, c = t.chestPos, tv = t.rag.vel[PART.chest];
  let dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
  const T = clamp(d / 9, 0.25, 0.5);
  // lead the prey, and land a little short of its chest (the jaws reach the rest)
  dx += tv.x * T * 0.8; dz += tv.z * T * 0.8; d = Math.hypot(dx, dz) || 1;
  const reach = Math.max(0, d - 0.6);
  const vh = Math.min(12, reach / T), vy = clamp((c.y - 0.15 - p.y + 0.5 * 9.81 * T * T) / T, 2, 6.5);
  m.torso.body.setLinvel({ x: (dx / d) * vh, y: vy, z: (dz / d) * vh }, true);
  m.free = T + 0.35;
  m.state = 'leap'; m.t = 0; m.target = t;
  m.leapCd = rand(2.2, 3.2);
  b.sound('whoosh', p, 0.6, 1.5);
  if (Math.random() < 0.5) b.voice(u, 'cry', true);
}

function bite(b, m, v, k = 1) {
  const u = m.u, w = u.def.weapon;
  const dmg = w.damage * k * packMult(b, u);
  m.biteA = 1;
  m.biteCd = rand(0.38, 0.5);
  const c = v.chestPos;
  _a.set(c.x - m.torso.pos.x, 0, c.z - m.torso.pos.z).normalize();
  v.hit(dmg, onFoot(v) ? (Math.random() < 0.4 ? PART.head : PART.chest) : PART.chest, _a.x * 8, 2, _a.z * 8, u, 'bite');
  if (v.def.armor > 0.3) { b.emit('spark', c.x, c.y, c.z, 3); b.sound('clang', c, 0.45, 1.6); }
  else { b.emit('blood', c.x, c.y, c.z, 5, _a.x, _a.z); b.sound('crunch', c, 0.45, 1.5); }
}

function pin(b, m, v) {
  m.state = 'pin'; m.t = 0; m.victim = v;
  v.bcPins = (v.bcPins || 0) + 1;
  const c = v.chestPos;
  _a.set(c.x - m.torso.pos.x, 0, c.z - m.torso.pos.z).normalize();
  // bowled over backwards under the raptor
  fling(v, _a.x * 4, 1.5, _a.z * 4, 1.4);
  bite(b, m, v, 1.2);
  b.sound('thud', c, 0.7, 1.2);
}
function unpin(m, kick = false) {
  const v = m.victim;
  if (v) v.bcPins = Math.max(0, (v.bcPins || 1) - 1);
  m.victim = null;
  m.state = 'run'; m.t = 0; m.free = 0;
  m.leapCd = Math.max(m.leapCd, rand(0.8, 1.6));
  if (kick) {
    const vel = m.torso.body.linvel();
    m.torso.body.setLinvel({ x: vel.x - Math.sin(yawOf(m.torso.quat)) * 5, y: 4, z: vel.z - Math.cos(yawOf(m.torso.quat)) * 5 }, true);
    m.free = 0.5;
  }
}

function raptorAct(b, m, dt) {
  const u = m.u, body = m.torso.body, p = m.torso.pos;
  m.t += dt;
  m.leapCd = (m.leapCd ?? rand(0.2, 1)) - dt;
  m.biteCd = (m.biteCd ?? 0) - dt;
  if (m.state === 'leap') {
    holdUpright(m, dt, m.goalYaw, 20);
    const mouth = partPoint(m, JAW, 0, 0, 0.25, _p);
    let hit = null;
    b.grid.query(mouth.x, mouth.z, 2, (o) => {
      if (hit || !o.alive || o.team === u.team) return;
      const c = o.bc || (o.sm && o.sm.big && o.sm.mounted) ? null : o.chestPos;
      const r = c ? 0.85 * Math.max(1, o.s) : o.skel.radius + 0.5;
      const q = c || o.pos;
      const near = (P) => (q.x - P.x) ** 2 + (q.y - P.y) ** 2 * (c ? 1 : 0.2) + (q.z - P.z) ** 2 < r * r;
      if (near(mouth) || near(p)) hit = o;
    });
    if (hit) {
      if (small(hit, 1.5) && (hit.bcPins || 0) < 3) pin(b, m, hit);
      else { bite(b, m, hit, 1.3); unpin(m, true); }
      return;
    }
    const h = p.y - b.terrain.height(p.x, p.z);
    if ((m.t > 0.25 && h < RAPTOR.H0 + 0.1) || m.t > 1.4) { m.state = 'run'; m.free = 0; }
    return;
  }
  if (m.state === 'pin') {
    const v = m.victim;
    if (!v || !v.alive || m.t > 4.5 || (v.s > 1.4 && m.t > 1.4) || m.fallen) { unpin(m, v && v.alive && v.s > 1.4); return; }
    // ride the victim down: stand on its chest and bite
    const c = v.chestPos, vv = v.rag.vel[PART.chest];
    _a.set(p.x - c.x, 0, p.z - c.z);
    const back = _a.length() > 1e-3 ? _a.normalize().multiplyScalar(0.45) : _a.set(0, 0, 0);
    _b.set(c.x + back.x, c.y + 0.55 * Math.max(1, v.s), c.z + back.z);
    const k = Math.min(1, 10 * dt);
    const lv = body.linvel();
    body.setLinvel({
      x: lv.x + ((_b.x - p.x) * 7 + vv.x - lv.x) * k,
      y: lv.y + clamp((_b.y - p.y) * 7 + vv.y - lv.y, -12, 12) * k + 9.81 * dt * 0.6,
      z: lv.z + ((_b.z - p.z) * 7 + vv.z - lv.z) * k,
    }, true);
    holdUpright(m, dt, Math.atan2(c.x - p.x, c.z - p.z), 40);
    m.free = 0.1;
    v.stun = Math.max(v.stun, 0.6);
    if (m.biteCd <= 0) bite(b, m, v, 1);
    return;
  }
}

// ======================================================================= Raptor Rider
const RK = 1.32;
const VK = (x, y, z) => V(x * RK, y * RK, z * RK);
const RAPTOR_MOUNT = {
  torso: VK(0, 0.95, 0), r: 0.24 * RK, hh: 0.3 * RK, mass: 450, head: VK(0, 0.42, 0.55), headR: 0.14 * RK, headMass: 12,
  H0: 0.95 * RK, saddle: VK(0, 0.33, -0.08),
  hips: [VK(0.16, -0.08, -0.02), VK(-0.16, -0.08, -0.02)], legOff: [0, PI], legAmp: 0.9, stride: 2.3,
  speed: 10, accel: 9, turn: 2.6, turnSlow: 0.5, grip: 16, alpha: 45,
  seg: [VK(0, 0, -0.35), VK(0, 0.3, 0.6)], segR: 0.4, hp: 800,
  front: 0.75, trR: 0.75, trDmg: 14, trK: 1, knock: 0.2, share: 0.8, combatR: 0.6, pitch: 1.3,
  torsoMesh: (H, t) => M.raptorTorso(H, t, RK), legMesh: (H, t) => M.raptorLeg(H, t, RK),
};
// head, jaw and tail on the ridden raptor: extra kinematic parts after the mount's own
const RR_PARTS = [
  { at: VK(0, 0.12, 0.35), parent: -1, mesh: (H, t) => M.raptorHead(H, t, RK) },
  { at: VK(0, 0.3, 0.38), parent: 0, mesh: (H, t) => M.raptorJaw(H, t, RK) },
  { at: VK(0, 0.05, -0.36), parent: -1, mesh: (H, t) => M.raptorTail(H, t, RK) },
  { at: VK(0, 0.05, -0.7), parent: 2, mesh: (H, t) => M.raptorTail(H, t, RK, true) },
];
function riderLayout() {
  const ml = mountLayout(RAPTOR_MOUNT);
  return [...ml, ...chainLayout(RAPTOR_MOUNT.torso, new Q4(), RR_PARTS)];
}
function riderInit(u) {
  const m = mountInit(u, RAPTOR_MOUNT);
  const lay = riderLayout().slice(mountLayout(RAPTOR_MOUNT).length);
  m.rr = { parts: chainInit(u, lay, RR_PARTS), biteA: 0, biteCd: rand(0.5, 1) };
  (BC(u.battle).riders ??= []).push(m);
}
function riderThink(u, dt, ctx) {
  const m = u.sm;
  if (!m.mounted) return footMelee(u, ctx, u.def.weapon.cooldown);
  const b = u.battle, cfg = m.cfg, t = ctx.t, p = m.torso.pos;
  m.thinkT = b.time;
  // sprint at the target and stop nose to nose: the raptor bites, the caveman clubs over its head
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
  const yaw = yawOf(m.torso.quat), bear = angleDiff(yaw, Math.atan2(dx, dz));
  const gap = d - t.skel.radius - 1.25;
  m.goalYaw = inField(p, Math.atan2(dx, dz));
  m.goalSpeed = gap > 3 ? cfg.speed : gap > 0.2 ? clamp(gap * 2.5, 1.5, cfg.speed) : Math.abs(bear) > 0.5 ? 1.2 : gap < -0.4 ? -1.5 : 0;
  u.expr = d < 10 ? EXPR.angry : EXPR.normal;
  if (ctx.dist - t.skel.radius < u.reachDist + 0.6 && u.cooldown <= 0 && !u.st.attack && u.stun <= 0) u.startAttack();
  return t;
}
function stepRiders(b, dt) {
  for (const m of BC(b).riders || []) {
    unmountedRadius(m);
    const rr = m.rr, P = rr.parts;
    if (m.torso.body.isSleeping() && !m.alive) continue;
    rr.biteA = Math.max(0, rr.biteA - dt * 4);
    rr.biteCd -= dt;
    const bite = Math.sin(clamp(rr.biteA, 0, 1) * PI);
    const sw = Math.sin(m.phase) * 0.18;
    if (!m.alive) { setRot(P[0].q, 0.6, 0.5); setRot(P[1].q, 0.4); setRot(P[2].q, -0.2, 0.3); setRot(P[3].q, 0, 0.3); }
    else {
      setRot(P[0].q, bite * 0.5 + Math.sin(m.phase * 2) * 0.05, -sw * 0.3);
      setRot(P[1].q, 0.08 + bite * 0.35);
      setRot(P[2].q, 0.05, sw);
      setRot(P[3].q, 0.02, sw * 1.6);
    }
    placeChain(m.torso, P);
    // the mount snaps at anyone right in front of its head
    if (m.alive && m.mounted && m.u.alive && rr.biteCd <= 0 && !b.over) {
      // (a generous zone ahead of the head: the jaws dart about)
      const yw = yawOf(m.torso.quat), fx = Math.sin(yw), fz = Math.cos(yw), tp = m.torso.pos;
      const mouth = _p.set(tp.x + fx * 1.25 * RK, tp.y, tp.z + fz * 1.25 * RK);
      let hit = null, hd = Infinity;
      b.grid.query(mouth.x, mouth.z, 2.5, (o) => {
        if (!o.alive || o.team === m.u.team) return;
        const r = (o.bc ? o.skel.radius : 0.25) + 0.85;
        const d = (o.pos.x - mouth.x) ** 2 + (o.pos.z - mouth.z) ** 2;
        if (d < r * r && d < hd && Math.abs(o.chestPos.y - mouth.y) < 2) { hd = d; hit = o; }
      });
      if (hit) {
        rr.biteA = 1; rr.biteCd = rand(0.6, 0.8);
        const c = hit.chestPos;
        hit.hit(42, PART.chest, 0, 1, 0, m.u, 'bite');
        b.emit('blood', c.x, c.y, c.z, 5, 0, 0);
        b.sound('crunch', c, 0.5, 1.4);
      }
    }
  }
}

// ======================================================================= Pterodactyl
const PTERO = {
  torso: V(0, 0.75, 0), r: 0.17, hh: 0.2, mass: 45, fly: true, startFlying: true,
  alt: 7.5, cruise: 9, climb: 6.5, sink: 10, accel: 16, turn: 3.2, alpha: 24, flap: 8,
  H0: 0.75, speed: 2.5, grip: 10, stride: 0.8,
  seg: [V(0, 0, -0.35), V(0, 0.15, 0.45)], segR: 0.6, combatR: 0.6, pitch: 1.4, shoveK: 1.2, blastK: 1.2,
  torsoMesh: (H, t) => M.pteroTorso(H, t),
  parts: [
    { at: V(0.14, 0.06, 0.05), parent: -1, mesh: (H, t) => M.pteroWing(H, t, 1), rest: new Q4().setFromEuler(new THREE.Euler(0, 0.15, 0.35, 'YXZ')) },
    { at: V(-0.14, 0.06, 0.05), parent: -1, mesh: (H, t) => M.pteroWing(H, t, -1), rest: new Q4().setFromEuler(new THREE.Euler(0, -0.15, -0.35, 'YXZ')) },
    { at: V(0, 0.08, 0.28), parent: -1, mesh: (H, t) => M.pteroHead(H, t) },
    { at: V(0, -0.1, -0.1), parent: -1, mesh: (H, t) => M.pteroFeet(H, t) },
  ],
};
function pteroAnim(b, m) {
  const P = m.parts;
  if (!m.alive || !m.flying) {
    for (const i of [0, 1]) { const sd = i ? -1 : 1; setRot(P[i].q, 0, sd * (m.alive ? 0.15 : 0.6), sd * (m.alive ? 0.35 : -0.1)); }
    setRot(P[2].q, m.alive ? 0 : 0.8); setRot(P[3].q, 0);
    return;
  }
  const dive = m.state === 'swoop', fl = Math.sin(m.phase);
  for (const i of [0, 1]) {
    const sd = i ? -1 : 1;
    setRot(P[i].q, 0, sd * (dive ? 0.6 : 0.05), sd * (dive ? 0.25 : 0.15 + fl * 0.65));
  }
  setRot(P[2].q, dive ? 0.45 : 0.1 + Math.sin(m.phase * 0.5) * 0.05);
  setRot(P[3].q, dive || m.held ? -0.35 : 1.25);
}
const feetPoint = (m, out) => partPoint(m, 3, 0, -0.62, 0.05, out);

function pteroThink(u, dt, ctx) {
  const m = u.bc, b = u.battle, p = m.torso.pos;
  m.thinkT = b.time;
  m.t += dt;
  m.swoopCd = (m.swoopCd ?? rand(0.5, 2)) - dt;
  u.expr = EXPR.angry;
  if (m.state === 'idle') m.state = 'cruise';
  // prey: something small enough to carry off (else peck at whatever is nearest)
  m.retgt = (m.retgt || 0) - dt;
  if (!m.prey || !m.prey.alive || m.retgt <= 0) {
    m.retgt = rand(0.8, 1.4);
    m.prey = nearestEnemy(b, u.team, p, (o) => small(o) && !o.bcHeld) || ctx.t;
  }
  const t = m.held || m.prey;
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz) || 1, dirx = dx / d, dirz = dz / d;
  switch (m.state) {
    case 'cruise': {
      m.alt = PTERO.alt + Math.sin(b.time * 0.8 + u.id) * 0.4;
      if (d > 10) m.goalVel.set(dirx * PTERO.cruise, 0, dirz * PTERO.cruise);
      else { const sd = u.id % 2 ? 1 : -1; m.goalVel.set(dirx * (d - 7) * 0.6 - dirz * sd * 5, 0, dirz * (d - 7) * 0.6 + dirx * sd * 5); }
      if (m.swoopCd <= 0 && d < 15) { m.state = 'swoop'; m.t = 0; }
      break;
    }
    case 'swoop': {
      const tgy = b.terrain.height(t.pos.x, t.pos.z);
      const low = Math.max(0.4, t.chestPos.y - tgy + 0.75);
      m.alt = low + (PTERO.alt - low) * clamp((d - 2.5) / 8, 0, 1);
      const sp = clamp(d * 2.2, 5, 14);
      m.goalVel.set(dirx * sp, 0, dirz * sp);
      const f = feetPoint(m, _p);
      if (f.distanceTo(t.chestPos) < 0.95 * Math.max(1, t.s) + 0.1) {
        if (small(t) && !t.bcHeld) { m.held = t; t.bcHeld = m; m.state = 'carry'; m.t = 0; m.carryYaw = yawOf(m.torso.quat); b.sound('whoosh', p, 0.8, 1.3); b.voice(u, 'attack', true); }
        else { peck(b, m, t); m.state = 'climb'; m.t = 0; }
      }
      if (m.t > 4) { m.state = 'climb'; m.t = 0; }
      break;
    }
    case 'carry': {
      m.alt = 11;
      m.goalVel.set(Math.sin(m.carryYaw) * 5, 0, Math.cos(m.carryYaw) * 5);
      const h = p.y - b.terrain.height(p.x, p.z);
      if (!m.held || !m.held.alive || m.t > 2.6 || (h > 9.5 && m.t > 1.2)) drop(b, m);
      break;
    }
    case 'climb': default: {
      m.alt = PTERO.alt + 1;
      const f = Math.sin(yawOf(m.torso.quat)), g = Math.cos(yawOf(m.torso.quat));
      m.goalVel.set(f * 8, 0, g * 8);
      if (m.t > 1.3) { m.state = 'cruise'; m.t = 0; }
      break;
    }
  }
  const vx = m.goalVel.x, vz = m.goalVel.z;
  m.goalYaw = Math.hypot(vx, vz) > 0.5 ? Math.atan2(vx, vz) : Math.atan2(dirx, dirz);
  if (Math.abs(p.x) > 48 || Math.abs(p.z) > 40) m.goalYaw = inField(p, m.goalYaw);
  return t;
}
function peck(b, m, v) {
  const u = m.u, c = v.chestPos, w = u.def.weapon;
  const vel = m.torso.body.linvel();
  v.hit(w.damage, onFoot(v) ? PART.head : PART.chest, vel.x * 2, 2, vel.z * 2, u, 'bite');
  if (onFoot(v)) fling(v, vel.x * 0.4, 2, vel.z * 0.4, 1);
  b.emit('blood', c.x, c.y, c.z, 6, vel.x * 0.1, vel.z * 0.1);
  b.sound('stab', c, 0.8, 1.3);
  m.swoopCd = rand(2, 2.8);
}
function drop(b, m) {
  const v = m.held;
  m.held = null;
  if (v) { v.bcHeld = null; if (v.alive) { trackFall(b, v, m.u, 14); b.voice(v, 'scream', true); } }
  m.state = 'climb'; m.t = 0;
  m.swoopCd = rand(2.2, 3.2);
}
function pteroAct(b, m, dt) {
  if (m.held) {
    const v = m.held;
    if (!v.alive) { drop(b, m); return; }
    feetPoint(m, _p);
    _p.y -= 0.35;
    carry(v, _p, dt, m.torso.body.linvel());
  }
}
function pteroDie(b, m) { if (m.held) drop(b, m); }

// ======================================================================= T-Rex
const REX = {
  torso: V(0, 3.15, 0), r: 1.05, hh: 1.5, mass: 7000, cols: [{ at: V(0, 0.6, 2.4), r: 0.75, mass: 400 }],
  H0: 3.15, speed: 4.4, accel: 2.8, turn: 1.0, turnSlow: 0.7, grip: 7, alpha: 3.5, stride: 4.4, legAmp: 0.42, bob: 0.1, getUp: 3,
  seg: [V(0, 0, -2.1), V(0, 0.6, 2.7)], segR: 1.25, combatR: 1.6, pitch: 0.45, shoveK: 0.35, blastK: 0.6,
  torsoMesh: M.rexTorso,
  parts: [
    { at: V(0.8, -0.35, -0.25), parent: -1, leg: 0, len: 2.72, mesh: M.rexLeg },
    { at: V(-0.8, -0.35, -0.25), parent: -1, leg: PI, len: 2.72, mesh: M.rexLeg },
    { at: V(0, 0.75, 1.5), parent: -1, mesh: M.rexHead },
    { at: V(0, 0.2, 0.8), parent: 2, mesh: M.rexJaw },
    { at: V(0, 0.35, -1.75), parent: -1, mesh: (H, t) => M.rexTail(H, t, 0) },
    { at: V(0, -0.08, -1.8), parent: 4, mesh: (H, t) => M.rexTail(H, t, 1) },
    { at: V(0, -0.08, -1.7), parent: 5, mesh: (H, t) => M.rexTail(H, t, 2) },
  ],
};
const mouthOf = (m, out) => partPoint(m, 2, 0, 0.15, 2.3, out);

function rexAnim(b, m) {
  const P = m.parts, t = m.t;
  animLegs(m);
  const sw = Math.sin(m.phase) * 0.12;
  if (!m.alive) { setRot(P[2].q, 0.5, 0.3); setRot(P[3].q, 0.5); for (let i = 4; i < 7; i++) setRot(P[i].q, -0.1, 0.25); return; }
  let hp = Math.sin(m.phase * 2) * 0.04, hy = -sw * 0.4, jaw = 0.05;
  if (m.state === 'bite') {
    if (t < 0.4) { const k = t / 0.4; hp = 0.9 * k - 0.15 * (1 - k); jaw = 0.75 * k; hy = m.biteYaw * k; }
    else if (t < 1.25) { const k = Math.min(1, (t - 0.4) / 0.3); hp = 0.9 - 0.6 * k; jaw = m.held ? 0.18 : 0.05; hy = m.biteYaw * (1 - k) + (m.held ? Math.sin(t * 22) * 0.4 : 0); }
    else if (t < 1.5) { const k = (t - 1.25) / 0.25; hp = 0.3 - 0.75 * k; hy = m.throwSd * 0.7 * k; jaw = 0.1 + 0.4 * k; }
    else { const k = Math.min(1, (t - 1.5) / 0.4); hp = -0.45 * (1 - k); hy = m.throwSd * 0.7 * (1 - k); jaw = 0.5 * (1 - k); }
  } else if (m.state === 'roar') {
    const k = Math.min(1, t / 0.3) * Math.min(1, Math.max(0, (1.7 - t) / 0.3));
    hp = -0.55 * k; jaw = 0.85 * k; hy = Math.sin(t * 9) * 0.08 * k;
  }
  setRot(P[2].q, hp, hy);
  setRot(P[3].q, jaw);
  // tail whip: swing to one side, then lash across
  let ty = 0;
  if (m.state === 'tail') ty = m.tailSd * (t < 0.35 ? -0.5 * (t / 0.35) : t < 0.6 ? -0.5 + 1.3 * ((t - 0.35) / 0.25) : 0.8 * Math.max(0, 1 - (t - 0.6) / 0.4));
  for (let i = 4; i < 7; i++) setRot(P[i].q, -0.05 + (i === 4 ? hp * -0.2 : 0), sw * (i - 3) * 0.7 + ty * (i === 4 ? 0.6 : 0.5));
  // crouch into a bite
  m.H0 = m.state === 'bite' && t < 1.25 ? REX.H0 - 0.55 * Math.min(1, t / 0.3) : undefined;
}

function rexThink(u, dt, ctx) {
  const m = u.bc, b = u.battle, p = m.torso.pos;
  m.thinkT = b.time;
  const t = nearestEnemy(b, u.team, p, (o) => heightOf(b, o) < 5) || ctx.t;
  u.expr = EXPR.angry;
  const dx = t.pos.x - p.x, dz = t.pos.z - p.z, d = Math.hypot(dx, dz);
  const yaw = yawOf(m.torso.quat), bear = angleDiff(yaw, Math.atan2(dx, dz));
  m.goalYaw = inField(p, Math.atan2(dx, dz));
  const busy = m.state === 'bite' || m.state === 'roar' || m.state === 'tail';
  // enemies under its legs are out of reach of the jaws: back off to get them in front
  const near = d - t.skel.radius;
  m.goalSpeed = busy ? 0 : near < 2.6 ? -1.8 : near < 4.6 ? (Math.abs(bear) > 0.5 ? 0.8 : 0) : Math.abs(bear) > 0.9 ? 1.5 : REX.speed;
  return t;
}
// the bite zone: ahead of the chest, from the feet up to its own height
function biteZone(b, m) {
  const u = m.u, p = m.torso.pos, yw = yawOf(m.torso.quat), fx = Math.sin(yw), fz = Math.cos(yw);
  let best = null, bd = Infinity;
  b.grid.query(p.x + fx * 3.4, p.z + fz * 3.4, 4, (o) => {
    if (!o.alive || o.team === u.team || (onFoot(o) && o.pos.y > p.y + 1)) return;
    const q = bodyPoint(o, p);
    const dx = q.x - p.x, dz = q.z - p.z, along = dx * fx + dz * fz, side = dx * fz - dz * fx;
    const r = o.bc ? o.skel.radius : o.sm && o.sm.big ? o.sm.big.r : 0;
    if (along < 1.8 - r || along > 5.2 + r || Math.abs(side) > 1.9 + r) return;
    const k = (along - 3.4) ** 2 + side * side;
    if (k < bd) { bd = k; best = o; }
  });
  if (best) m.biteYaw = clamp(Math.atan2((best.pos.x - p.x) * fz - (best.pos.z - p.z) * fx, (best.pos.x - p.x) * fx + (best.pos.z - p.z) * fz), -0.45, 0.45);
  return best;
}
function behind(b, m) {
  const u = m.u, p = m.torso.pos, yw = yawOf(m.torso.quat), fx = Math.sin(yw), fz = Math.cos(yw);
  let n = 0, sd = 0;
  b.grid.query(p.x - fx * 4, p.z - fz * 4, 4, (o) => {
    if (!o.alive || o.team === u.team) return;
    const dx = o.pos.x - p.x, dz = o.pos.z - p.z, along = dx * fx + dz * fz;
    if (along < -1 && along > -7.5 && Math.abs(dx * fz - dz * fx) < 3) { n++; sd += dx * fz - dz * fx; }
  });
  m.tailSd = sd >= 0 ? 1 : -1;
  return n;
}
function tailWhip(b, m) {
  const u = m.u, p = m.torso.pos, yw = yawOf(m.torso.quat), fx = Math.sin(yw), fz = Math.cos(yw);
  b.sound('whoosh', p, 1.2, 0.4);
  b.grid.query(p.x - fx * 4, p.z - fz * 4, 5, (o) => {
    if (!o.alive || o.team === u.team || o.pos.y > p.y + 0.5) return;
    const dx = o.pos.x - p.x, dz = o.pos.z - p.z, along = dx * fx + dz * fz, side = dx * fz - dz * fx;
    if (along > -1 || along < -8 || Math.abs(side) > 3.5) return;
    // lashed across: away to the side the tail sweeps toward, and up
    const lx = fz * -m.tailSd, lz = -fx * -m.tailSd;
    o.hit(55, PART.chest, 0, 0, 0, u, 'tail');
    if (onFoot(o)) fling(o, lx * 9 - fx * 2, 4.5, lz * 9 - fz * 2, 1.6);
    else if (o.sm && o.sm.big) shoveBig(o.sm.big, lx * o.sm.big.mass * 2, o.sm.big.mass, lz * o.sm.big.mass * 2, o.sm.big.A, 3);
    b.emit('blood', o.chestPos.x, o.chestPos.y, o.chestPos.z, 4, lx, lz);
    b.sound('thud', o.chestPos, 1, 0.7);
  });
}
// the nearest point of a unit's body to p (a mount's or engine's body for riders and crews)
const _bp = new V3();
function bodyPoint(o, p) {
  const g = o.sm && o.sm.big && o.sm.big.alive && (o.sm.mounted || o.sm.cart) ? o.sm.big : null;
  return g ? closestOnSeg(g.A, g.B, p, _bp) : o.bc ? o.pos : o.chestPos;
}
function inMouth(b, m) {
  const c = mouthOf(m, _p), u = m.u;
  let best = null, bd = 2.2 * 2.2;
  b.grid.query(c.x, c.z, 5, (o) => {
    if (!o.alive || o.team === u.team) return;
    const q = bodyPoint(o, c), r = o.bc ? o.skel.radius : o.sm && o.sm.big && o.sm.big.alive ? o.sm.big.r : 0;
    const d = (q.x - c.x) ** 2 + ((q.y - c.y) * 0.5) ** 2 + (q.z - c.z) ** 2 - r * r;
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}
function rexAct(b, m, dt) {
  const u = m.u, p = m.torso.pos;
  m.t += dt;
  m.biteCd = (m.biteCd ?? 1) - dt;
  m.roarCd = (m.roarCd ?? rand(2, 4)) - dt;
  footfalls(m, (i, at) => {
    const gy = b.terrain.height(at.x, at.z);
    at.y = gy;
    b.emit('dust', at.x, gy, at.z, 3);
    b.sound('thump', at, 0.6, 0.45);
    quake(b, u, at, 2.0, 28, 6.5);
  });
  if (Math.abs(m.vf) > 0.6) trampleBeast(b, m, 1.6, 30);
  if (m.state === 'idle' || m.state === 'walk') {
    m.state = 'walk';
    if (m.roarCd <= 0 && countEnemies(b, u.team, p, 12) >= 3) { m.state = 'roar'; m.t = 0; }
    else if (m.biteCd <= 0 && biteZone(b, m)) { m.state = 'bite'; m.t = 0; m.held = null; m.throwSd = Math.random() < 0.5 ? -1 : 1; b.sound('whoosh', p, 1, 0.5); }
    else if ((m.tailCd = (m.tailCd ?? 2) - dt) <= 0 && behind(b, m) >= 1) { m.state = 'tail'; m.t = 0; }
    return;
  }
  if (m.state === 'tail') {
    if (m.t - dt < 0.45 && m.t >= 0.45) tailWhip(b, m);
    if (m.t > 1.0) { m.state = 'walk'; m.tailCd = rand(2.5, 3.5); }
    return;
  }
  if (m.state === 'roar') {
    if (m.t - dt < 0.3 && m.t >= 0.3) roar(b, m);
    if (m.t > 1.7) { m.state = 'walk'; m.roarCd = rand(9, 12); }
    return;
  }
  // bite: lunge, snap, shake, throw
  const t = m.t, t0 = t - dt;
  if (t0 < 0.4 && t >= 0.4) {
    const v = inMouth(b, m);
    const c = mouthOf(m, _a);
    b.sound('crunch', c, 1.4, 0.55);
    if (v) {
      if (small(v, 1.7) && !v.bcHeld) { m.held = v; v.bcHeld = m; v.hit(60, PART.chest, 0, 0, 0, u, 'bite'); }
      else {
        // too big to pick up: a huge bite and a shove
        v.hit(110, PART.chest, 0, 0, 0, u, 'bite');
        if (!v.bc && v.sm && v.sm.big) hurtBig(b, v.sm.big, 50, u);
      }
      b.emit('blood', c.x, c.y, c.z, 12, 0, 0);
    }
    // the jaws also close on carts and horses
    for (const g of S(b).bigs) {
      if (!g.alive || g.team === u.team || g.u === u || (v && (g.u === v))) continue;
      closestOnSeg(g.A, g.B, c, _b);
      if (_b.distanceTo(c) > g.r + 1.2) continue;
      hurtBig(b, g, 120, u);
      shoveBig(g, (_b.x - p.x) * g.mass * 0.4, g.mass * 2, (_b.z - p.z) * g.mass * 0.4, _b, 4);
    }
  }
  if (m.held) {
    const v = m.held;
    if (!v.alive && t < 1.25) { v.bcHeld = null; m.held = null; }
    else {
      mouthOf(m, _p);
      carry(v, _p, dt, null, 12);
      if ((t0 < 0.75 && t >= 0.75) || (t0 < 1.05 && t >= 1.05)) {
        v.hit(35, PART.chest, 0, 0, 0, u, 'bite');
        b.emit('blood', v.chestPos.x, v.chestPos.y, v.chestPos.z, 6, 0, 0);
        b.sound('crunch', v.chestPos, 0.7, 1.0);
      }
      if (t0 < 1.4 && t >= 1.4) {
        // fling it away to the side
        const f = yawOf(m.torso.quat), sx = Math.cos(f) * m.throwSd, sz = -Math.sin(f) * m.throwSd;
        v.bcHeld = null; m.held = null;
        if (v.alive) {
          fling(v, sx * 11 + Math.sin(f) * 4, 8, sz * 11 + Math.cos(f) * 4, 2);
          trackFall(b, v, u, 10);
          b.voice(v, 'scream', true);
        }
        b.sound('whoosh', p, 1, 0.6);
      }
    }
  }
  if (t > 1.9) { m.state = 'walk'; m.biteCd = rand(0.4, 0.8); if (m.held) { m.held.bcHeld = null; m.held = null; } }
}
function roar(b, m) {
  const u = m.u, c = mouthOf(m, _p);
  b.sound('horn', c, 1.5, 0.32);
  b.voice(u, 'cry', true);
  const p = m.torso.pos;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2, x = p.x + Math.cos(a) * 5, z = p.z + Math.sin(a) * 5;
    b.emit('dust', x, b.terrain.height(x, z), z, 2);
  }
  b.grid.query(p.x, p.z, 14, (o) => {
    if (!o.alive || o.team === u.team || o.bc || o.s > 1.7) return;
    if ((o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 > 13 * 13) return;
    o.fleeT = Math.max(o.fleeT, rand(1.8, 2.8));
    o.expr = EXPR.scared;
    o.st.attack = null;
    if (Math.random() < 0.3) b.voice(o, 'scream');
  });
}
function rexDie(b, m) { if (m.held) { m.held.bcHeld = null; m.held = null; } b.sound('horn', m.torso.pos, 1.0, 0.25); }

// ======================================================================= units
const units = [
  {
    id: 'pr_caveman', name: 'Caveman', faction: 'prehistoric', cost: 55, hp: 90, speed: 4.6,
    build: { scale: 0.98, girth: 1.08, head: 1.05, arms: 1.05 },
    weapon: { line: 'Melee · two-handed bone club knocks people over', kind: 'melee', style: 'twohand', anim: 'slam', item: 'pr_femur', damage: 30, reach: 1.25, cooldown: 1.35, force: 420 },
    look: { skin: '#d9a57c', hat: 'pr_shag', top: 'fur', legs: '#6b4a2b', bare: true, beard: '#4a3020', brow: true },
    personality: { aggro: 0.95, bravery: 0.2, voice: 0.85, chatter: 1, cry: 'ooga', idle: 'bounce' },
    desc: 'Big bone. Bonk.',
  },
  {
    id: 'pr_raptor', name: 'Velociraptor', faction: 'prehistoric', cost: 110, hp: 125, speed: 9,
    build: { scale: 1, radius: 0.75 },
    weapon: { line: 'Beast · fast pack hunter: leaps on prey, pins it and bites (stronger in packs)', kind: 'pr_raptor', style: 'none', anim: 'punch', item: 'none', damage: 17, reach: 1.0, cooldown: 0.45, force: 60 },
    look: { skin: M.RAPTOR_C.skin, hat: 'none', top: 'none', legs: M.RAPTOR_C.skin },
    personality: { aggro: 1, bravery: 0, voice: 1.6, chatter: 0.9, cry: 'yip', idle: 'bounce' },
    desc: 'Clever girl. Hunts in packs: leaps on its prey, pins it down and bites.',
  },
  {
    id: 'pr_raptor_rider', name: 'Raptor Rider', faction: 'prehistoric', cost: 370, hp: 180, speed: 4.6,
    build: { scale: 1, girth: 1.05, radius: 1.0 },
    weapon: { line: 'Mounted · clubs from a sprinting raptor that bites · fights on if thrown', kind: 'pr_rrider', style: 'pr_rclub', footStyle: 'sword', anim: 'overhead', item: 'club', damage: 46, reach: 1.4, cooldown: 1.0, force: 320 },
    look: { skin: '#d9a57c', hat: 'skullcap', top: 'fur', legs: '#6b4a2b', bare: true, beard: '#4a3020', paint: true },
    personality: { aggro: 1, bravery: 0, voice: 0.9, chatter: 0.8, cry: 'ooga', idle: 'bounce' },
    desc: 'A caveman on a raptor. Very fast; the raptor bites while he clubs.',
  },
  {
    id: 'pr_ptero', name: 'Pterodactyl', faction: 'prehistoric', cost: 350, hp: 330, speed: 9,
    build: { scale: 1, radius: 1.2 },
    weapon: { line: 'Flying · swoops, carries small units up high and drops them', kind: 'pr_ptero', style: 'none', anim: 'punch', item: 'none', damage: 48, reach: 1.0, cooldown: 3, force: 80 },
    look: { skin: M.PTERO_C.skin, hat: 'none', top: 'none', legs: M.PTERO_C.skin },
    personality: { aggro: 1, bravery: 0, voice: 1.5, chatter: 0.6, cry: 'cackle', idle: 'bounce' },
    desc: 'Snatches small units, flies them up high and lets go.',
  },
  {
    id: 'pr_trex', name: 'T-Rex', faction: 'prehistoric', cost: 2600, hp: 4200, speed: 4.4,
    build: { scale: 1, radius: 3.2 },
    weapon: { line: 'Giant beast · bites, shakes and throws units · roar makes enemies flee', kind: 'pr_trex', style: 'none', anim: 'punch', item: 'none', damage: 60, reach: 2, cooldown: 2, force: 400 },
    look: { skin: M.REX_C.skin, hat: 'none', top: 'none', legs: M.REX_C.skin },
    personality: { aggro: 1, bravery: 0, voice: 0.35, chatter: 0.4, cry: 'roar', idle: 'thump' },
    desc: 'The king of the lizards. Bites, shakes and throws; its roar sends armies running.',
  },
];
const DEF = Object.fromEntries(units.map((d) => [d.id, d]));
const BEAST_CFG = { pr_raptor: RAPTOR, pr_ptero: PTERO, pr_trex: REX };
Object.assign(RAPTOR, { anim: raptorAnim, act: raptorAct, command: (b, m) => { const t = m.prey && m.prey.alive ? m.prey : nearestEnemy(b, m.u.team, m.torso.pos); if (m.leapCd <= 0 && m.state === 'run' && t) leap(b, m, t); } });
Object.assign(PTERO, { anim: pteroAnim, act: pteroAct, onDie: pteroDie });
Object.assign(REX, { anim: rexAnim, act: rexAct, onDie: rexDie, command: (b, m) => { if (m.state === 'walk') { m.state = 'bite'; m.t = 0; m.held = null; m.throwSd = 1; m.biteYaw = 0; } } });
RAPTOR.init = (m) => { m.state = 'run'; };

setupRidePoses({ pr_rclub: { cfg: RAPTOR_MOUNT, standHeight: makeSkeleton(DEF.pr_raptor_rider.build).standHeight } });
RIDE.pr_rclub.arms = (pose) => { setArm(pose, 1, GUARD.sword.L); setArm(pose, -1, GUARD.sword.R); };

const beastKind = (cfg, think) => ({ init: (u) => beastInit(u, cfg), think, step: beastUnitStep, hit: beastHit, die: beastDie });

register({
  factions: [{ id: 'prehistoric', name: 'Prehistoric', color: '#3daa6e' }],
  units,
  items: { pr_femur: { len: 1.05, r: 0.1, grip: 25, heavy: true, mass: 2.6 } },
  kinds: {
    pr_raptor: beastKind(RAPTOR, raptorThink),
    pr_ptero: beastKind(PTERO, pteroThink),
    pr_trex: beastKind(REX, rexThink),
    pr_rrider: { melee: true, init: riderInit, think: riderThink, step: riderStep, hit: riderHit, die: riderDie },
  },
  buildItem(name, s, team, g, H) {
    if (name !== 'pr_femur') return false;
    M.femur(H, s, g);
    return true;
  },
  buildHat(kind, r, team, g, H) {
    if (kind !== 'pr_shag') return false;
    M.shag(H, r, team, g);
    return true;
  },
  decorate(def, team, vis, H) {
    const cfg = BEAST_CFG[def.id];
    if (cfg) {
      // the pilot ragdoll is hidden inside the beast
      for (const g of vis.parts) g.clear();
      for (const l of beastLayout(cfg)) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
    } else if (def.id === 'pr_raptor_rider') {
      for (const l of riderLayout()) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
    }
  },
  battleStep(b, dt) { if (b._bc) stepRiders(b, dt); },
});
