// Siege & mounts pack: crewed siege engines (catapult, ballista).
// The unit is the crewman. The engine is a heavy dynamic cart (a prop: everything bumps
// into it, blasts and giants can tip it over) with kinematic moving parts: the catapult's
// throwing arm and the loaded boulder / bolt (parked under the ground while unloaded).
// The crew stays at its station behind the cart, turns the cart toward the target and
// pulls the release; reloading needs the crew at the cart. If the cart is wrecked or
// tipped over the crew fights on with its mallet; if the crew dies the engine is idle.
import { THREE, clamp, rand, smooth, ballisticAngle } from '../util.js';
import { RAPIER } from '../physics.js';
import { PART } from '../body.js';
import {
  V3, Q4, GR, S, addBig, updateBig, hurtBig, placeExtra, yawOf, upOf, qPitch, footMelee, EXPR, shoveBig, closestOnSeg,
  stickInto, angleDiff,
} from './sm-core.js';
import * as M from './sm-meshes.js';
import { airborne } from './common.js';

const V = (x, y, z) => new V3(x, y, z);
const Q0 = new Q4();

export const CATAPULT = {
  cart: V(0, 0.56, 1.7), half: [0.72, 0.18, 1.15], mass: 650, wheel: 0.32, wheels: [[0.8, -0.23, 0.75], [-0.8, -0.23, 0.75], [0.8, -0.23, -0.75], [-0.8, -0.23, -0.75]],
  frame: { at: V(0, 0.62, 0.32), half: [0.5, 0.42, 0.12], mass: 50 },
  pivot: V(0, 0.62, 0.2), cock: -1.75, stop: 0.28, release: -0.15, ammoLocal: V(0, M.ARM_LEN, 0.55),
  station: V(0, 0, -1.7), hp: 650, seg: [V(0, 0.15, -1.15), V(0, 0.15, 1.15)], segR: 0.8,
  elev: 0.96, reload: 5.5, proj: 'sm_boulder', arm: true,
  cartMesh: M.catapultCart, armMesh: M.catapultArm, ammoMesh: (H) => M.rock(H),
};
export const BALLISTA = {
  cart: V(0, 0.44, 1.35), half: [0.58, 0.16, 0.85], mass: 380, wheel: 0.25, wheels: [[0.64, -0.17, 0.55], [-0.64, -0.17, 0.55], [0.64, -0.17, -0.55], [-0.64, -0.17, -0.55]],
  frame: { at: V(0, 0.55, 0.25), half: [0.14, 0.1, 1.0], mass: 40 },
  ammoLocal: V(0, 0.68, 0.38), muzzle: V(0, 0.68, 1.3),
  station: V(0, 0, -1.35), hp: 420, seg: [V(0, 0.2, -0.85), V(0, 0.3, 0.9)], segR: 0.7,
  reload: 3.2, proj: 'sm_bolt', arm: false,
  cartMesh: M.ballistaCart, ammoMesh: (H) => M.bolt(H, 'z'),
};

export function siegeLayout(cfg) {
  const out = [{ pos: cfg.cart.clone(), quat: Q0.clone(), mesh: cfg.cartMesh }];
  if (cfg.arm) {
    const aq = qPitch(cfg.cock);
    const ap = cfg.cart.clone().add(cfg.pivot);
    out.push({ pos: ap, quat: aq, mesh: cfg.armMesh });
    out.push({ pos: cfg.ammoLocal.clone().applyQuaternion(aq).add(ap), quat: aq.clone(), mesh: cfg.ammoMesh });
  } else out.push({ pos: cfg.cart.clone().add(cfg.ammoLocal), quat: Q0.clone(), mesh: cfg.ammoMesh });
  return out;
}

export function siegeInit(u, cfg) {
  const b = u.battle, s = S(b);
  const lay = siegeLayout(cfg);
  const bd = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.2).setAngularDamping(0.8).setCcdEnabled(false);
  const [hx, hy, hz] = cfg.half;
  const cols = [RAPIER.ColliderDesc.cuboid(hx, hy, hz).setMass(cfg.mass * 0.8).setFriction(0.8).setRestitution(0).setCollisionGroups(GR.cart)];
  for (const w of cfg.wheels) cols.push(RAPIER.ColliderDesc.ball(cfg.wheel).setTranslation(w[0], w[1], w[2]).setMass(cfg.mass * 0.05).setFriction(0.9).setRestitution(0).setCollisionGroups(GR.cart));
  const f = cfg.frame;
  cols.push(RAPIER.ColliderDesc.cuboid(...f.half).setTranslation(f.at.x, f.at.y, f.at.z).setMass(f.mass).setFriction(0.6).setCollisionGroups(GR.cart));
  const cart = u.addExtraBody(bd, cols, lay[0].pos, lay[0].quat);
  const kin = (l) => u.addExtraBody(RAPIER.RigidBodyDesc.kinematicPositionBased(), [], l.pos, l.quat);
  const arm = cfg.arm ? kin(lay[1]) : null;
  const ammo = kin(lay[cfg.arm ? 2 : 1]);
  const c = {
    u, cfg, cart, arm, ammo, loaded: true, fire: -1, reload: 1, ang: cfg.cock ?? 0, broken: false, tipped: false,
    thinkT: -1, atStation: false, aimYaw: u.spawnYaw, pull: false, target: null, released: false, hitStop: false,
  };
  c.big = addBig(b, {
    u, e: cart, a: cfg.seg[0], b: cfg.seg[1], r: cfg.segR, hp: cfg.hp, mass: cfg.mass, flesh: false, blastK: 1.2,
    onDie: (att) => wreck(b, c, att),
  });
  // build.radius is the engine's footprint for placement; the crew itself is a normal-sized target
  u.skel.radius = Math.max(u.skel.rChest, 0.25 * u.s);
  u.sm = c;
  s.sieges.push(c);
}

function wreck(b, c) {
  c.broken = true;
  c.loaded = false;
  const p = c.cart.pos;
  b.emit('dust', p.x, p.y, p.z, 8);
  b.emit('spark', p.x, p.y + 0.5, p.z, 6);
  b.sound('crunch', p, 1.2, 0.5);
  b.sound('debris', p, 0.8, 0.9);
  const sd = Math.random() < 0.5 ? -1 : 1;
  shoveBig(c.big, rand(-1, 1) * c.cfg.mass, c.cfg.mass * 3, rand(-1, 1) * c.cfg.mass, V(p.x + sd * 0.6, p.y, p.z), 6);
}

// ------------------------------------------------------------------ AI (crew think)
const _p = new V3(), _q = new Q4(), _q2 = new Q4(), _a = new V3();
function stationPos(c, out) { return out.copy(c.cfg.station).applyQuaternion(c.cart.quat).add(c.cart.pos); }

function pickTarget(b, u, c, w) {
  // nearest enemy to the engine that is not too close to shoot at
  const p = c.cart.pos;
  let best = null, bd = Infinity, near = null, nd = Infinity;
  for (const o of b.teams[1 - u.team]) {
    if (!o.alive) continue;
    const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
    if (d < nd) { nd = d; near = o; }
    if (d < w.minRange || d > w.range) continue;
    if (c.cfg.arm && airborne(b, o)) continue; // a lobbed stone can't catch a flyer
    const k = d * (o === c.target ? 0.85 : 1) * (1 + 0.1 * (o.s > 1.5 ? -1 : 0));
    if (k < bd) { bd = k; best = o; }
  }
  return best || near;
}

export function siegeThink(u, dt, ctx) {
  const c = u.sm, b = u.battle, w = u.def.weapon;
  if (c.broken || c.tipped) return footMelee(u, ctx, 1.3);
  c.thinkT = b.time;
  const st = stationPos(c, _p);
  const dx = st.x - u.pos.x, dz = st.z - u.pos.z, d = Math.hypot(dx, dz);
  if (d > 0.3) { const sp = Math.min(ctx.spd, d * 3); u.desired.set((dx / d) * sp, 0, (dz / d) * sp); }
  c.atStation = d < 1.1;
  // an enemy right at the crew: whack it (the engine waits)
  if (ctx.dist - ctx.t.skel.radius < u.reachDist + 0.3 && c.fire < 0) return footMelee(u, ctx, 1.3);
  c.retarget = (c.retarget || 0) - dt;
  if (!c.target || !c.target.alive || c.retarget <= 0) { c.target = pickTarget(b, u, c, w); c.retarget = rand(0.8, 1.5); }
  const t = c.target;
  if (!t) return null;
  const cp = c.cart.pos;
  const td = Math.hypot(t.pos.x - cp.x, t.pos.z - cp.z);
  c.aimYaw = Math.atan2(t.pos.x - cp.x, t.pos.z - cp.z);
  const aimed = Math.abs(angleDiff(yawOf(c.cart.quat), c.aimYaw)) < 0.08;
  u.expr = EXPR.normal;
  if (c.atStation && c.loaded && aimed && c.fire < 0 && u.cooldown <= 0 && !u.st.attack && u.stun <= 0 && td >= w.minRange && td <= w.range) {
    u.startAttack('punchy');
    c.pull = true;
    c.aimT = t;
    c.aimPt = null;
  }
  // look along the engine while working it
  c.look = c.look || { pos: new V3() };
  c.look.pos.set(cp.x + Math.sin(c.aimYaw) * 10, cp.y, cp.z + Math.cos(c.aimYaw) * 10);
  return c.look;
}

// Possessed crew (kind.control): at the engine's station it lays the engine on the
// crosshair point (control.aimPt) and the attack button pulls the release; away from
// the station it fights on foot like anyone else.
export function siegeControl(u, dt, ctl) {
  const c = u.sm, b = u.battle;
  if (c.broken || c.tipped) return false;
  const st = stationPos(c, _p);
  const dx = st.x - u.pos.x, dz = st.z - u.pos.z, d = Math.hypot(dx, dz);
  c.atStation = d < 1.4;
  if (!c.atStation) return false;
  c.thinkT = b.time;
  c.target = null; c.aimT = null;
  if (ctl.aimPt) {
    const cp = c.cart.pos;
    c.aimYaw = Math.atan2(ctl.aimPt.x - cp.x, ctl.aimPt.z - cp.z);
    c.aimPt = (c.aimPt || new V3()).copy(ctl.aimPt);
  }
  // stay put at the station unless the stick walks the crew away
  if (Math.hypot(ctl.mx, ctl.mz) < 0.2 && d > 0.3) { const sp = Math.min(3, d * 3); u.desired.set((dx / d) * sp, 0, (dz / d) * sp); }
  if (ctl.attack && c.loaded && c.fire < 0 && !u.st.attack && u.cooldown <= 0 && u.stun <= 0) {
    u.startAttack('punchy');
    c.pull = true;
  }
  return true;
}

export function siegeEvent(u, t0, t1) {
  const c = u.sm;
  if (c.pull && t0 < 0.45 && t1 >= 0.45) {
    c.pull = false;
    if (!c.loaded || c.broken || c.tipped) return;
    c.loaded = false;
    c.fire = 0;
    c.released = false;
    c.hitStop = false;
    u.battle.sound('click', c.cart.pos, 0.6, 0.5);
    if (!c.cfg.arm) launch(u.battle, c);
  }
}

// ------------------------------------------------------------------ physics, every step
export function stepSiege(b, c, dt) {
  const cfg = c.cfg, e = c.cart, q = e.quat, pos = e.pos, body = e.body, u = c.u;
  const up = upOf(q);
  c.tipped = up.y < 0.55;
  const crewing = u.alive && b.time - c.thinkT < 0.1 && !c.broken && !c.tipped && !b.over;
  if (crewing && c.atStation && (!body.isSleeping() || Math.abs(angleDiff(yawOf(q), c.aimYaw)) > 0.04)) {
    // the crew heaves the engine round toward the target
    const w = body.angvel();
    const wy = clamp(angleDiff(yawOf(q), c.aimYaw) * 1.6, -0.45, 0.45);
    body.setAngvel({ x: w.x, y: wy, z: w.z }, true);
  }
  // firing / reloading
  if (cfg.arm) {
    if (c.fire >= 0) {
      c.fire += dt;
      const k = Math.min(1, c.fire / 0.3);
      c.ang = cfg.cock + (cfg.stop - cfg.cock) * k * k;
      if (!c.released && c.ang >= cfg.release) { c.released = true; launch(b, c); }
      if (k >= 1 && !c.hitStop) {
        c.hitStop = true;
        const top = _p.copy(cfg.pivot).add(_a.set(0, 0.45, 0.25)).applyQuaternion(q).add(pos);
        b.sound('thump', top, 1.0, 0.45);
        b.emit('dust', top.x, top.y, top.z, 2);
        shoveBig(c.big, 0, -cfg.mass * 0.6, 0, top, 2);
      }
      if (c.fire > 0.9) { c.fire = -1; c.reload = 0; }
    } else if (!c.loaded && !c.broken) {
      if (crewing && c.atStation) c.reload += dt / cfg.reload;
      c.ang = cfg.stop + (cfg.cock - cfg.stop) * smooth(clamp(c.reload, 0, 1));
      if (c.reload >= 1) c.loaded = true;
    }
    if (c.broken) c.ang += (-0.7 - c.ang) * Math.min(1, dt * 6);
  } else {
    if (c.fire >= 0) { c.fire += dt; if (c.fire > 0.3) { c.fire = -1; c.reload = 0; } }
    else if (!c.loaded && !c.broken) {
      if (crewing && c.atStation) c.reload += dt / cfg.reload;
      if (c.reload >= 1) c.loaded = true;
    }
  }
  let ap = pos, aq = q;
  if (cfg.arm) {
    ap = _p.copy(cfg.pivot).applyQuaternion(q).add(pos);
    aq = _q.copy(q).multiply(qPitch(c.ang, _q2));
    placeExtra(c.arm, ap, aq);
  }
  if (c.loaded || (cfg.arm && c.fire >= 0 && !c.released)) placeExtra(c.ammo, _a.copy(cfg.ammoLocal).applyQuaternion(aq).add(ap), aq);
  else placeExtra(c.ammo, _a.set(pos.x, pos.y - 6, pos.z), q);
  updateBig(c.big);
}

// Throw the boulder / shoot the bolt at the target picked when the release was pulled.
function launch(b, c) {
  const cfg = c.cfg, u = c.u, w = u.def.weapon, q = c.cart.quat;
  let from;
  if (cfg.arm) {
    const aq = new Q4().copy(q).multiply(qPitch(c.ang, _q2));
    from = cfg.ammoLocal.clone().applyQuaternion(aq).add(_a.copy(cfg.pivot).applyQuaternion(q).add(c.cart.pos));
  }
  else from = cfg.muzzle.clone().applyQuaternion(q).add(c.cart.pos);
  let t = c.aimT && c.aimT.alive ? c.aimT : c.target && c.target.alive ? c.target : null;
  const yaw0 = yawOf(q);
  const vel = new V3();
  const g = b.projGravity(cfg.proj);
  if (cfg.arm) {
    // a high lob at a fixed elevation: solve the speed, lead the target by the flight time
    const th = cfg.elev, ct = Math.cos(th), tt = Math.tan(th);
    let tx, tz, ty, v = 18;
    if (t) {
      tx = t.pos.x; tz = t.pos.z;
      for (let i = 0; i < 2; i++) {
        const dx = Math.hypot(tx - from.x, tz - from.z);
        ty = b.terrain.height(tx, tz) + 0.4;
        const den = 2 * ct * ct * (dx * tt - (ty - from.y));
        v = den > 0.1 ? Math.sqrt((g * dx * dx) / den) : 25;
        const tof = dx / (v * ct);
        const tv = t.rag.vel[PART.pelvis];
        tx = t.pos.x + tv.x * tof * 0.6; tz = t.pos.z + tv.z * tof * 0.6;
      }
    } else if (c.aimPt) {
      // a possessed crew's lob at the crosshair point
      tx = c.aimPt.x; tz = c.aimPt.z;
      const dx = Math.hypot(tx - from.x, tz - from.z);
      ty = b.terrain.height(tx, tz) + 0.4;
      const den = 2 * ct * ct * (dx * tt - (ty - from.y));
      v = den > 0.1 ? Math.sqrt((g * dx * dx) / den) : 25;
    } else { tx = from.x + Math.sin(yaw0) * 35; tz = from.z + Math.cos(yaw0) * 35; v = 18.5; }
    // the arm only throws roughly where the cart points
    let yaw = Math.atan2(tx - from.x, tz - from.z);
    yaw = yaw0 + clamp(angleDiff(yaw0, yaw), -0.15, 0.15) + rand(-1, 1) * w.spread;
    v = Math.min(v, 27) * (1 + rand(-1, 1) * w.spread * 0.6);
    vel.set(Math.sin(yaw) * ct, Math.sin(th), Math.cos(yaw) * ct).multiplyScalar(v);
  } else {
    const speed = w.speed;
    let ang = 0.02, yaw = yaw0;
    if (t) {
      const tp = t.chestPos;
      const dx = Math.hypot(tp.x - from.x, tp.z - from.z);
      const tof = dx / speed, tv = t.rag.vel[PART.chest];
      const px = tp.x + tv.x * tof * 0.6, pz = tp.z + tv.z * tof * 0.6;
      const a = ballisticAngle(Math.hypot(px - from.x, pz - from.z), tp.y - from.y, speed, g, false);
      if (a !== null) ang = a;
      yaw = yaw0 + clamp(angleDiff(yaw0, Math.atan2(px - from.x, pz - from.z)), -0.12, 0.12);
    } else if (c.aimPt) {
      const tp = c.aimPt;
      const a = ballisticAngle(Math.hypot(tp.x - from.x, tp.z - from.z), tp.y - from.y, speed, g, false);
      if (a !== null) ang = a;
      yaw = yaw0 + clamp(angleDiff(yaw0, Math.atan2(tp.x - from.x, tp.z - from.z)), -0.12, 0.12);
    }
    yaw += rand(-1, 1) * w.spread; ang += rand(-1, 1) * w.spread * 0.5;
    vel.set(Math.sin(yaw) * Math.cos(ang), Math.sin(ang), Math.cos(yaw) * Math.cos(ang)).multiplyScalar(speed);
    // recoil
    shoveBig(c.big, -vel.x * 6, 0, -vel.z * 6, from, 2);
    b.sound('bow', from, 1.2, 0.5);
  }
  b.spawnProjectile(cfg.proj, from, vel, u);
  b.sound('whoosh', from, 1.0, 0.45);
}

// ------------------------------------------------------------------ projectiles
// Boulder: crushes everything where it lands, then rolls on and bowls people over.
function crush(b, pr) {
  const p = pr.pos, gy = b.terrain.height(p.x, p.z), R = pr.blast || 2.6;
  b.emit('dust', p.x, gy, p.z, 7);
  b.emit('dust', p.x + 0.8, gy, p.z - 0.6, 4);
  b.emit('dust', p.x - 0.7, gy, p.z + 0.7, 4);
  b.sound('boom', p, 1.1, 0.55);
  b.sound('debris', p, 0.5, 1.1);
  b.grid.query(p.x, p.z, R + 2, (v) => {
    if (v === pr.owner) return;
    const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d > R + v.skel.radius || v.pos.y - gy > 3) return;
    const f = clamp(1 - d / (R + v.skel.radius), 0.2, 1);
    const sz = Math.min(2, v.s), imp = (v.M * (3 + 7 * f)) / sz;
    v.hit(pr.damage * f, PART.chest, 0, 0, 0, pr.owner, 'boulder');
    v.rag.impulseAll((dx / (d || 1)) * imp * 0.8, imp * 0.75, (dz / (d || 1)) * imp * 0.8);
    v.stun = Math.max(v.stun, 1.6 * f * (v.def.stagger ?? 1));
    if (f > 0.6) b.emit('blood', v.chestPos.x, v.chestPos.y, v.chestPos.z, 8, dx / (d || 1), dz / (d || 1));
  });
  for (const v of b.units) {
    if (v.alive) continue;
    const dx = v.pos.x - p.x, dz = v.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d > R) continue;
    const imp = v.M * 4 * (1 - d / R);
    v.rag.impulseAll((dx / (d || 1)) * imp, imp, (dz / (d || 1)) * imp);
  }
  for (const g of S(b).bigs) {
    closestOnSeg(g.A, g.B, p, _a);
    const d = Math.max(0, Math.hypot(_a.x - p.x, _a.z - p.z) - g.r);
    if (d > R || g.u === pr.owner) continue;
    const f = clamp(1 - d / R, 0.2, 1);
    if (g.alive) hurtBig(b, g, pr.damage * f * 0.8, pr.owner);
    shoveBig(g, (_a.x - p.x) * g.mass * 0.8 * f, g.mass * 1.5 * f, (_a.z - p.z) * g.mass * 0.8 * f, _a, 4);
  }
}
const _d = new V3();
export const PROJ = {
  sm_boulder: {
    g: 9.81, len: 0, r: 0.9, roll: true, life: 9,
    hit(b, pr, v) {
      if (v === pr.owner) return false;
      const sp = pr.vel.length();
      _d.copy(pr.vel).normalize();
      if (!pr.landed) {
        // straight out of the sky
        const imp = v.M * 6 / Math.min(2, v.s);
        v.hit(pr.damage, PART.chest, 0, 0, 0, pr.owner, 'boulder');
        v.rag.impulseAll(_d.x * imp, -Math.abs(_d.y) * imp * 0.3 + imp * 0.2, _d.z * imp);
        v.stun = Math.max(v.stun, 2 * (v.def.stagger ?? 1));
        b.emit('blood', v.chestPos.x, v.chestPos.y, v.chestPos.z, 12, _d.x, _d.z);
        b.sound('crunch', v.chestPos, 1.2, 0.8);
      } else {
        if (v.team === pr.team && sp < 6) return false;
        const k = clamp(sp / 12, 0.25, 1);
        const imp = v.M * (2.5 + 6 * k) / Math.min(2, v.s);
        v.hit(pr.damage * 0.45 * k, PART.pelvis, 0, 0, 0, pr.owner, 'boulder');
        v.rag.impulseAll(_d.x * imp, imp * 0.45, _d.z * imp);
        v.stun = Math.max(v.stun, 1.3 * k * (v.def.stagger ?? 1));
        b.emit('blood', v.chestPos.x, v.chestPos.y, v.chestPos.z, 5, _d.x, _d.z);
        b.sound('thud', v.chestPos, 0.6 + 0.6 * k, 0.8);
      }
      pr.vel.multiplyScalar(0.86);
      return false;
    },
    bigHit(b, pr, g) {
      const k = pr.landed ? clamp(pr.vel.length() / 12, 0.2, 1) * 0.5 : 0.9;
      hurtBig(b, g, pr.damage * k, pr.owner);
      shoveBig(g, pr.vel.x * g.mass * 0.15 * k, g.mass * 0.6 * k, pr.vel.z * g.mass * 0.15 * k, pr.pos, 4);
      b.emit('dust', pr.pos.x, pr.pos.y, pr.pos.z, 3);
      b.sound('crunch', pr.pos, 1.0, 0.6);
      pr.vel.multiplyScalar(pr.landed ? -0.3 : 0.5);
      return false;
    },
    ground(b, pr) {
      if (pr.landed) return false;
      pr.landed = true;
      crush(b, pr);
      pr.vel.x *= 0.55; pr.vel.z *= 0.55;
      return false;
    },
  },
  // Bolt: flies flat and fast and skewers a whole line before it stops.
  sm_bolt: {
    g: 3, len: 1.8, r: 0.16, stick: true, life: 6,
    hit(b, pr, v) {
      if (v === pr.owner) return false;
      pr.pierce = (pr.pierce || 0) + 1;
      _d.copy(pr.vel).normalize();
      const dmg = pr.damage * (pr.pierce === 1 ? 1 : 0.8);
      const f = Math.min(pr.force, v.M * 12);
      v.hit(dmg, PART.chest, _d.x * f * 0.4, 0.15 * f, _d.z * f * 0.4, pr.owner, 'bolt');
      v.rag.impulseAll(_d.x * f * 0.6, f * 0.12, _d.z * f * 0.6);
      v.stun = Math.max(v.stun, 1.0 * (v.def.stagger ?? 1));
      const c = v.chestPos;
      if (v.def.armor > 0.3) { b.emit('spark', c.x, c.y, c.z, 4); b.sound('clang', c, 0.7, 0.9); }
      b.emit('blood', c.x, c.y, c.z, 8, _d.x, _d.z);
      b.sound('stab', c, 1.0, 0.7);
      pr.vel.multiplyScalar(0.88);
      if (pr.pierce < 5) return false;
      // the last one keeps the bolt
      const rag = v.rag, i = PART.chest;
      const lp = pr.pos.clone().sub(rag.pos[i]).applyQuaternion(rag.quat[i].clone().invert());
      const lq = rag.quat[i].clone().invert().multiply(pr.quat);
      b.stuck.push({ type: pr.type, unit: v, part: i, lp, lq, pos: pr.pos.clone(), quat: pr.quat.clone(), t: 25, id: pr.id });
      return true;
    },
    bigHit(b, pr, g) {
      hurtBig(b, g, pr.damage, pr.owner);
      _d.copy(pr.vel).normalize();
      shoveBig(g, _d.x * pr.force, pr.force * 0.1, _d.z * pr.force, pr.pos, 3);
      b.emit(g.flesh ? 'blood' : 'spark', pr.pos.x, pr.pos.y, pr.pos.z, 8, _d.x, _d.z);
      b.sound(g.flesh ? 'stab' : 'thud', pr.pos, 1, 0.7);
      stickInto(b, S(b), g, pr);
      return true;
    },
  },
};

export function siegeCrewDie(u) { /* the engine stays where it is; nobody reloads it */ }
