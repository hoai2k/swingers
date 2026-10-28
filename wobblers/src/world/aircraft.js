// Planes and gliders: a chunky toy propeller plane (vehicle `plane`, pilot + one
// passenger) and an engineless sailplane (vehicle `glider`, one seat), both on
// the phone. Parked gliders wait at the home mountain lookout and on the
// Frostpeak summit (placeAircraft, world/index.js).
//
// One body each, a handful of colliders (fuselage, wing, tail, three gear balls
// with no friction: the 'flight' handling below does the rolling, braking and
// side grip itself). Arcade flight, forgiving rather than real:
//   - lift cancels the part of gravity across the flight path, scaled by
//     k = (forward speed / stall speed)^2 up to 1: slower than the stall speed it
//     sinks and the nose drops toward the flight path until it picks up speed again
//   - the velocity follows the nose (the wing "grips" the air, also scaled by k), so
//     pitching up climbs and banking turns; turning keeps the speed (a little lost)
//   - gravity along the path stays: climbing costs speed, diving gains it, so a
//     glider trades height for speed and settles into a slow glide (drag = g sin)
//   - attitude is set through angular velocity rates: the stick rolls (bank limit
//     ~57 deg) and pitches (push = nose down, limit ~50 deg); let go and it levels
//     itself; bank turns at the coordinated-turn rate g tan(bank) / speed
//   - on the ground it taxis: the stick steers, RT gas, LT brakes (reverses when
//     stopped); past ~0.7 x stall speed pulling back lifts the nose and it flies off
// Gliders have no engine: RT / A on the ground gives a bungee launch push, LT in
// the air opens the air brakes (land sooner). They ride updrafts (F.updraft): in the
// air (air brakes shut, nose not pushed down) the rising air cancels the drag along
// the path and tops up any sink so it climbs gently at F.updraft m/s, fading out
// UPDRAFT_TOP m above the ground: a glider keeps flying as long as you like; push the
// nose down or open the air brakes to come down and land. Keyboard: Space throttle / launch,
// Shift brake, W/S pitch, A/D bank (W/S can't be gas and pitch at once).
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { DT, G_STATIC, G_VEH, G_PROP, VEH_GROUPS, groups } from '../config.js';
import { registerVehicle, registerHandling, Vehicle } from '../vehicles.js';
import { registerCallable } from '../phone.js';
import { Builder, matVC } from '../mesh.js';
import { MOUNTAIN, meshHeight } from '../terrain.js';
import { SUMMIT } from './regions/snow/layout.js';

const GRAV = 9.81;
const SEA = -0.5, UPDRAFT_TOP = 180; // gliders: updrafts fade out this high above the ground or sea
const RAY_Q = groups(0xffff, G_STATIC | G_VEH | G_PROP);
const PI = Math.PI;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const DOWN = { x: 0, y: -1, z: 0 };

// Distance from the body origin straight down to the ground (or 99).
function groundGap(v, reach) {
  const t = v.body.translation();
  const hit = v.game.physics.world.castRay(new RAPIER.Ray({ x: t.x, y: t.y, z: t.z }, DOWN), reach, true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, RAY_Q, undefined, v.body);
  return hit ? hit.timeOfImpact : 99;
}

// Driver input -> v.fc (both types). Pads: RT gas, LT brake, stick pitch / bank.
// Keyboards (gas / brake are W / S there, like the heli's check): Space gas, Shift brake.
function flightControl(v, inp) {
  const c = v.fc ||= { x: 0, y: 0, thr: 0, brake: 0, gasHeld: false, launch: false };
  const gas = inp.gas || 0, brake = inp.brake || 0, my = inp.moveY || 0;
  const kb = Math.abs(gas - Math.max(0, my)) < 1e-6 && Math.abs(brake - Math.max(0, -my)) < 1e-6;
  c.x = clamp(inp.moveX ?? inp.steer ?? 0, -1, 1);
  c.y = clamp(my, -1, 1);
  c.thr = Math.max(kb ? 0 : gas, inp.jump ? 1 : 0);
  c.brake = Math.max(kb ? 0 : brake, inp.sprint ? 1 : 0);
  const held = c.thr > 0.5;
  if (held && !c.gasHeld) c.launch = true; // (gliders: one push per press)
  c.gasHeld = held;
  v.throttle = v.def.flight.thrust ? c.thr : 0; v.steer = -c.x; v.handbrake = false;
}

registerHandling('flight', {
  wheels: false,
  update(v, drv, vel, fwd, up, side) {
    const F = v.def.flight, m = v.massEff, body = v.body;
    const c = v.fc ||= { x: 0, y: 0, thr: 0, brake: 0, launch: false };
    if (!drv) { c.x = c.y = c.thr = c.brake = 0; c.launch = false; }
    const st = v.fs ||= { thr: 0, cool: 0 };
    st.cool -= DT;
    const gap = groundGap(v, F.gear + 0.8);
    const grounded = gap < F.gear + 0.3 && up.y > 0.5;
    v.grounded = grounded ? 1 : 0;
    if (v.airOff && st.airOff !== !grounded) { st.airOff = !grounded; for (const col of v.airOff) col.setCollisionGroups(grounded ? VEH_GROUPS : 0); }
    // engine spool (the propeller and the engine note follow it)
    st.thr += ((F.thrust ? c.thr : 0) - st.thr) * Math.min(1, DT * 2.5);
    v.rpm += ((drv && F.thrust ? 0.3 + 0.7 * st.thr : 0) - v.rpm) * Math.min(1, DT * 2);

    const sp = Math.hypot(vel.x, vel.y, vel.z), s = vel.x * fwd.x + vel.y * fwd.y + vel.z * fwd.z;
    const dx = sp > 1 ? vel.x / sp : fwd.x, dy = sp > 1 ? vel.y / sp : fwd.y, dz = sp > 1 ? vel.z / sp : fwd.z;
    const k = Math.min(1, (Math.max(0, s) / F.vs) ** 2);
    v.liftK = k;
    let ax = 0, ay = 0, az = 0;
    // lift: cancels gravity across the flight path (k = 1 at the stall speed and up)
    ax -= k * GRAV * dy * dx; ay += k * GRAV * (1 - dy * dy); az -= k * GRAV * dy * dz;
    // thrust and drag (the air brake / brake in the air adds drag)
    const T = st.thr * F.thrust;
    ax += fwd.x * T; ay += fwd.y * T; az += fwd.z * T;
    const cd = F.drag * (1 + (grounded ? 0 : c.brake * F.airbrake)) * sp * sp;
    ax -= dx * cd; ay -= dy * cd; az -= dz * cd;
    // gliders: updrafts keep them up (not with the air brakes out, not near the ceiling)
    if (F.updraft && !grounded && k > 0.3) {
      const t = body.translation(), above = t.y - Math.max(SEA, meshHeight(t.x, t.z));
      // (pushing the nose down or the air brakes let you come down to land)
      const fade = clamp((UPDRAFT_TOP - above) / 40, 0, 1) * (1 - clamp(c.brake * 2, 0, 1)) * (1 - clamp(c.y * 2.5, 0, 1));
      const sus = F.drag * sp * sp * fade;                    // cancels the drag along the path
      const keep = clamp((F.cruise - sp) * 1.5, 0, 4) * fade;  // and keeps up a cruising speed in long turns
      ax += dx * (sus + keep); az += dz * (sus + keep);
      ay += dy * (sus + keep) + (1 - k) * GRAV * (1 - dy * dy) * fade; // and makes up the lift a slow / banked wing lacks
      st.rise = fade;
    } else st.rise = 0;
    let vx = vel.x + ax * DT, vy = vel.y + ay * DT, vz = vel.z + az * DT;

    // the velocity follows the nose: take part of the sideways / vertical slip away
    // and give it back along the nose, so turning and climbing keep the speed
    {
      const al = vx * fwd.x + vy * fwd.y + vz * fwd.z;
      const px = vx - fwd.x * al, py = vy - fwd.y * al, pz = vz - fwd.z * al;
      const p2 = px * px + py * py + pz * pz;
      const f = Math.min(1, F.align * k * DT);
      if (p2 > 1e-6 && f > 0) {
        vx -= px * f; vy -= py * f; vz -= pz * f;
        if (al > 0) {
          const lost = p2 * (1 - (1 - f) * (1 - f));
          const add = Math.sqrt(al * al + lost * 0.9) - al;
          vx += fwd.x * add; vy += fwd.y * add; vz += fwd.z * add;
        }
      }
    }
    // rising air (gliders): lifts the whole glider whatever the nose does, topping up any sink
    // (a slow turn, low speed) so it climbs gently at F.updraft m/s
    if (st.rise > 0) vy += clamp((F.updraft - vy) * 3, 0, 8) * st.rise * DT;
    if (grounded) {
      // tyres: grip sideways, roll on, brake (and taxi backwards once stopped)
      const sv = vx * side.x + vy * side.y + vz * side.z, g = Math.min(1, DT * 9);
      vx -= side.x * sv * g; vy -= side.y * sv * g; vz -= side.z * sv * g;
      const sNow = vx * fwd.x + vy * fwd.y + vz * fwd.z;
      let dv = 0;
      if (c.brake > 0.05 && sNow > 0.4) dv = -Math.min(sNow, F.brake * c.brake * DT);
      else if (c.brake > 0.05 && F.thrust) dv = clamp((-3 * c.brake - sNow) * 2, -3, 3) * DT;
      else if (Math.abs(sNow) > 0.05) dv = -Math.sign(sNow) * Math.min(Math.abs(sNow), 0.35 * DT);
      vx += fwd.x * dv; vy += fwd.y * dv; vz += fwd.z * dv;
      // parked / waiting: hold still (the gear balls have no friction, slopes would roll it)
      if (c.thr < 0.05 && Math.abs(sNow) < 1.2 && !(c.brake > 0.05 && F.thrust) && !(st.launchT > 0)) {
        vx = 0; vz = 0; if (vy > 0) vy = 0;
      }
      // gliders: a bungee launch from standstill (best from a hill top)
      if (!F.thrust && c.launch && drv && st.cool <= 0 && Math.abs(sNow) < 5) {
        st.launchT = 0.7; st.cool = 2.5;
        v.game.audio?.play('swish', body.translation(), 1);
      }
    }
    // the launch pull: ~0.5 s of strong push along the nose (not one kick, which
    // car damage would count as a crash)
    if (st.launchT > 0) {
      st.launchT -= DT;
      const a = F.launch / 0.5 * DT, sNow = vx * fwd.x + vy * fwd.y + vz * fwd.z;
      if (sNow < F.launch) { const d = Math.min(a, F.launch - sNow); vx += fwd.x * d; vy += fwd.y * d + 5 * DT; vz += fwd.z * d; }
    }
    c.launch = false;
    body.applyImpulse({ x: (vx - vel.x) * m, y: (vy - vel.y) * m, z: (vz - vel.z) * m }, true);

    // ---- attitude: rates about yaw (world up), pitch (level side axis) and roll (nose)
    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _e.setFromQuaternion(_q, 'YXZ');
    const yaw = _e.y, noseUp = -_e.x, roll = _e.z;
    const av = body.angvel();
    const sx = c.x, sy = c.y;
    const rotate = grounded && sy < -0.05 && s > F.vs * 0.7 && !!drv;
    let yawR, nuR, rollR, b;
    if (!grounded || rotate) {
      rollR = Math.abs(sx) > 0.05 ? sx * F.roll : -roll * 1.8;
      if (Math.abs(roll) > F.bank && Math.sign(rollR) === Math.sign(roll)) rollR = (Math.sign(roll) * F.bank - roll) * 4;
      nuR = Math.abs(sy) > 0.05 ? -sy * F.pitch : (F.trim - noseUp) * 1.2;
      if (!grounded) nuR += (Math.asin(clamp(dy, -1, 1)) - noseUp) * (1 - k) * 2.5; // stall: the nose drops
      const top = grounded ? 0.22 : F.pitchMax;
      if (noseUp > top && nuR > 0) nuR = (top - noseUp) * 4;
      if (noseUp < -F.pitchMax && nuR < 0) nuR = (-F.pitchMax - noseUp) * 4;
      yawR = -GRAV * Math.tan(clamp(roll, -1.3, 1.3)) / Math.max(s, 8) * k - sx * 0.25 * k;
      if (grounded) { rollR = -roll * 3; yawR = -sx * 0.6; }
      b = grounded ? Math.min(1, DT * 12) : 0.6; // firm in the air: a tail scraping a slope or a bump can't tip it up
      const cy = Math.cos(yaw), sy2 = Math.sin(yaw), pd = -nuR;
      const wx = pd * cy + rollR * fwd.x, wy = yawR + rollR * fwd.y, wz = -pd * sy2 + rollR * fwd.z;
      body.setAngvel({ x: av.x + (wx - av.x) * b, y: av.y + (wy - av.y) * b, z: av.z + (wz - av.z) * b }, true);
    } else {
      // taxiing: the stick steers the nose wheel; pitch and roll follow the ground
      yawR = drv ? -sx * 1.2 * clamp(Math.abs(s) / 4, 0.3, 1) * (s < -0.5 ? -1 : 1) : av.y * 0.8;
      b = Math.min(1, DT * 10);
      body.setAngvel({ x: av.x * 0.9, y: av.y + (yawR - av.y) * b, z: av.z * 0.9 }, true);
    }
  },
});

// ---- the plane ------------------------------------------------------------------
const PLANE_VOICE = { w1: 'sawtooth', w2: 'square', base: 38, range: 2.4, ratio: 0.5, lp: 520, vol: 0.09, am: 24 };
const GLIDER_VOICE = { w1: 'triangle', w2: 'sine', base: 70, range: 1.4, ratio: 1.5, lp: 260, vol: 0.025, am: 0 }; // just the wind

function gearBalls(add, C, pts, r) {
  let c;
  for (const [x, y, z] of pts) {
    c = add(C.ball(r).setTranslation(x, y, z));
    c.setFriction(0); c.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
    c.setRestitution(0); c.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
  }
  return c;
}

const PLANE_GEAR = [[1.0, -0.95, 0.45], [-1.0, -0.95, 0.45], [0, -0.95, 1.85]];
registerVehicle('plane', {
  mass: 600, half: [0.62, 0.55, 2.4], handling: 'flight', aircraft: true, maxSpeed: 34,
  com: [0, -0.15, 0.3], camH: 2.0, camDist: 13, horn: 'kart', engineVoice: PLANE_VOICE,
  seats: [{ pos: [0, 0.0, -0.2], kind: 'driver' }, { pos: [0, 0.0, -1.15] }],
  flight: { vs: 14, thrust: 8, drag: 8 / (34 * 34), airbrake: 1.5, brake: 7, trim: 0, align: 2.2,
    roll: 1.8, bank: 1.0, pitch: 1.1, pitchMax: 0.9, gear: 1.25 },
  spawn: { hx: 4.3, hz: 3.4, cz: -0.3, below: 1.25, above: 1.8, slope: 0.8, space: true },
  control: flightControl,
  colliders(add, C) {
    add(C.roundCuboid(0.45, 0.38, 2.2, 0.15).setTranslation(0, 0, 0));
    add(C.cuboid(4.0, 0.09, 0.68).setTranslation(0, -0.38, 0.95));      // wing
    add(C.cuboid(1.45, 0.06, 0.4).setTranslation(0, 0.2, -2.55));       // tailplane
    gearBalls(add, C, PLANE_GEAR, 0.3);
  },
  driveHint(G) {
    const kb = /WASD|Arrows/.test(G('LS'));
    return kb ? `${G('A')} Throttle ${G('LB')} Brake ${G('LS')} Pitch / bank ${G('Y')} Get out`
      : `${G('GAS')} Throttle ${G('BRAKE')} Brake ${G('LS')} Pitch / bank ${G('Y')} Get out`;
  },
  animate(v, dt) { if (v.prop) v.prop.rotation.z += (v.rpm || 0) * dt * 55; },
  mesh(b, def, color, P, v) {
    const cream = 0xfff4e0, dark = 0x2a2a33, trim = P.trim, glass = P.glass;
    // chunky round fuselage with a stripe, nose cowling, tapering tail
    b.rbox(1.25, 1.1, 3.0, 0.45, color, [0, 0, 0.35]);
    b.rbox(1.28, 0.22, 3.02, 0.1, cream, [0, -0.05, 0.35]);
    b.cyl(0.5, 0.56, 0.5, cream, [0, 0, 2.0], [PI / 2, 0, 0], 16);
    b.cyl(0.5, 0.2, 2.2, color, [0, 0.12, -2.1], [-PI / 2 + 0.08, 0, 0], 14);
    // open cockpits: dark tubs with a rim, a little windscreen ahead of each
    for (const z of [-0.2, -1.15]) {
      b.rbox(0.82, 0.12, 0.78, 0.05, dark, [0, 0.52, z]);
      b.torus(0.4, 0.06, trim, [0, 0.56, z], [PI / 2, 0, 0], 14);
      glass.box(0.7, 0.32, 0.04, 0, [0, 0.75, z + 0.5], [-0.45, 0, 0]);
    }
    // wings: cream with coloured tips and a dot on top
    b.rbox(8.0, 0.18, 1.36, 0.08, cream, [0, -0.38, 0.95]);
    for (const sx of [-1, 1]) {
      b.rbox(0.9, 0.2, 1.38, 0.09, color, [sx * 3.6, -0.38, 0.95]);
      b.cyl(0.38, 0.38, 0.02, trim, [sx * 2.2, -0.28, 0.95], null, 16);
      b.sphere(0.1, 0xff3a3a, [sx * 4.05, -0.38, 1.4]); // nav light
    }
    // tail: tailplane and fin
    b.rbox(2.9, 0.12, 0.8, 0.05, cream, [0, 0.2, -2.55]);
    b.rbox(0.14, 1.1, 0.9, 0.06, color, [0, 0.75, -2.65]);
    b.rbox(0.16, 0.28, 0.5, 0.06, cream, [0, 1.2, -2.6]);
    // landing gear: struts and fat toy wheels
    for (const [x, y, z] of PLANE_GEAR) {
      b.cyl(0.05, 0.05, 0.6, 0x9a9aa8, [x * 0.8, y + 0.42, z], [0, 0, x ? -Math.sign(x) * 0.35 : 0], 6);
      b.cyl(0.3, 0.3, 0.2, dark, [x, y, z], [0, 0, PI / 2], 14);
      b.cyl(0.14, 0.14, 0.22, 0xdddddd, [x, y, z], [0, 0, PI / 2], 10);
    }
    // propeller: spinner + two blades, spun by def.animate
    const pb = new Builder();
    pb.cone(0.24, 0.5, 0xff3a3a, [0, 0, 0.22], [PI / 2, 0, 0], 12);
    pb.rbox(0.2, 2.1, 0.06, 0.04, 0x3a3a44, [0, 0, 0], [0, 0.25, 0]);
    pb.sphere(0.07, 0xffd23f, [0, 1.0, 0]); pb.sphere(0.07, 0xffd23f, [0, -1.0, 0]);
    v.prop = pb.mesh(matVC); v.prop.position.set(0, 0, 2.3); P.shell.add(v.prop);
  },
});

// ---- the glider -------------------------------------------------------------------
const GLIDER_GEAR = [[0.42, -0.62, 0.25], [-0.42, -0.62, 0.25], [0, -0.45, -4.3]];
registerVehicle('glider', {
  mass: 320, half: [0.42, 0.45, 2.6], handling: 'flight', aircraft: true, maxSpeed: 30,
  com: [0, -0.15, 0.2], camH: 1.8, camDist: 14, horn: 'bumper', engineVoice: GLIDER_VOICE,
  seats: [{ pos: [0, -0.1, 0.55], kind: 'driver' }],
  flight: { vs: 11, thrust: 0, drag: 0.0028, airbrake: 4, brake: 5, trim: -0.06, align: 2.0, updraft: 1.2, cruise: 13,
    roll: 1.5, bank: 0.9, pitch: 1.0, pitchMax: 0.7, gear: 0.84, launch: 15 },
  spawn: { hx: 6.4, hz: 3.0, cz: -1.6, below: 0.84, above: 1.5, slope: 0.9, space: true },
  control: flightControl,
  colliders(add, C, def, v) {
    add(C.roundCuboid(0.3, 0.33, 1.15, 0.1).setTranslation(0, -0.05, 0.4));
    add(C.cuboid(0.1, 0.12, 1.9).setTranslation(0, 0.05, -2.5));        // tail boom
    add(C.cuboid(6.0, 0.05, 0.42).setTranslation(0, 0.32, 0.25));       // wing
    const tail = gearBalls(add, C, GLIDER_GEAR, 0.22);
    // the tail wheel only touches down on the ground: in the air (leaving a hill top)
    // it would scrape the slope behind and kick the nose up into a stall
    v.airOff = [tail];
  },
  driveHint(G) {
    const kb = /WASD|Arrows/.test(G('LS'));
    return kb ? `${G('A')} Launch ${G('LB')} Air brake ${G('LS')} Pitch / bank ${G('Y')} Get out`
      : `${G('GAS')} Launch ${G('BRAKE')} Air brake ${G('LS')} Pitch / bank ${G('Y')} Get out`;
  },
  mesh(b, def, color, P) {
    const white = 0xfafcff, dark = 0x2a2a33;
    // slim pod with a bubble canopy, long boom, T-tail
    b.rbox(0.8, 0.86, 2.6, 0.38, white, [0, -0.05, 0.5]);
    b.sphere(0.4, white, [0, -0.08, 1.75], [1, 1, 1.3]);
    b.rbox(0.82, 0.18, 2.62, 0.08, color, [0, -0.25, 0.5]);
    b.rbox(0.6, 0.1, 0.8, 0.04, dark, [0, 0.36, 0.5]);
    P.glass.sphere(0.42, 0, [0, 0.38, 0.85], [0.85, 0.75, 1.6]);
    b.cyl(0.22, 0.1, 4.2, white, [0, 0.08, -2.6], [-PI / 2 + 0.03, 0, 0], 10);
    b.rbox(0.1, 1.3, 0.75, 0.04, color, [0, 0.7, -4.4]);
    b.rbox(2.6, 0.08, 0.55, 0.03, white, [0, 1.36, -4.45]);
    // long thin wings with coloured tips and winglets
    b.rbox(12.0, 0.1, 0.84, 0.04, white, [0, 0.32, 0.25]);
    for (const sx of [-1, 1]) {
      b.rbox(1.2, 0.12, 0.86, 0.04, color, [sx * 5.45, 0.32, 0.25]);
      b.rbox(0.06, 0.4, 0.5, 0.03, color, [sx * 6.0, 0.5, 0.18]);
      b.rbox(2.2, 0.12, 0.12, 0.04, color, [sx * 2.4, 0.33, 0.64]); // stripe on the trailing edge
    }
    // gear
    for (const [x, y, z] of GLIDER_GEAR) {
      b.cyl(0.22, 0.22, 0.14, dark, [x, y, z], [0, 0, PI / 2], 12);
      b.cyl(0.04, 0.04, 0.4, 0x9a9aa8, [x * 0.8, y + 0.28, z], null, 6);
    }
  },
});

// Phone: no free icon fits, so two small side-on pictograms.
registerCallable({ id: 'plane', type: 'plane', name: 'Plane', color: 0xff8a3d,
  svg: '<path d="M3 6.5 Q3 4.5 6 4.5 L17 5 Q20 5.5 20 7.5 Q20 9 17 9 L6 9 Q3 9 3 6.5 Z"/><path d="M3 2 L5.5 2 L7 5 L3 5 Z"/><path d="M8 7 L16 7 L15 8.5 L8.5 8.5 Z" opacity=".55"/><path d="M20.5 2.5 L21.5 2.5 L21.5 11.5 L20.5 11.5 Z"/><circle cx="9" cy="11.5" r="1.6"/><circle cx="17" cy="11.5" r="1.4"/>' });
registerCallable({ id: 'glider', type: 'glider', name: 'Glider', color: 0x3fb5ff,
  svg: '<path d="M1 7 L23 6.2 L23 7.4 L1 8 Z"/><path d="M8 7.5 Q9 5 13 5.4 L17 6.3 Q18 7.3 17 8.4 L9.5 8.6 Q8 8.6 8 7.5 Z"/><path d="M1.5 3.5 L3 3.5 L4.5 7 L2.5 7.3 Z"/>' });

// Parked gliders on the high spots, nose pointing down the slope. The spots were
// picked with a clearance probe (flat enough, nothing in the wing span).
const PARKED = [
  // home mountain lookout, 20 m south-west of the top, facing down the slope over the lake
  // shore toward the west fields (a 1:9 glide clears the ground for ~450 m that way)
  { x: MOUNTAIN.x + Math.sin(-0.59) * 20, z: MOUNTAIN.z + Math.cos(-0.59) * 20, yaw: -0.59, color: 0xff5a8a },
  // Frostpeak summit: the flat east side of the observatory plateau, facing east
  { x: SUMMIT.x + 16, z: SUMMIT.z, yaw: PI / 2, color: 0x3fb5ff },
];
export function placeAircraft(game) {
  game.physics.world.updateSceneQueries?.();
  for (const p of PARKED) {
    const y = game.groundHeight(p.x, p.z, game.terrain.groundAt(p.x, p.z) + 6) + 0.84 + 0.12;
    game.vehicles.push(new Vehicle(game, 'glider', p.x, y, p.z, p.yaw, p.color));
  }
}
export { PARKED as PARKED_GLIDERS };
