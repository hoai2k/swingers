// Gadgets: permanent gear bought in the GADGETS shop (world/gadgetshop.js,
// life/shops.js 'gadgets'). Bought ones are shared by everyone on the machine
// (life/state.js bought: 'gadget:<id>'); each player wears at most one, saved
// with that player slot's look (cosmetics.js lookOf / restoreLook) and picked
// in the shop or on the customiser's Gadget row.
//
//   jetpack  hold jump in the air: thrust up and fly (fuel refills on the ground)
//   boots    high-jump boots: much higher jumps, springy (no knock-out) landings
//   speed    speed boots: faster walk / sprint, sparkly trail
//   glider   hold jump while falling: glide down slowly and fast forward
//   laser    laser gun in the right hand: punch fires a bolt that knocks people over
//   grapple  grappling hook in the right hand: punch shoots it where the camera
//            looks and reels you in (or yanks loose things / people to you)
//
// Only players get gear (NPCs share the Player class and never do). Player hooks
// (src/player.js, all `this.gear?.…`): gear.speed and gear.jump multipliers,
// gear.filter(inp) (the gun hand can't grab), gear.punch(p, inp) (fires instead
// of punching), gear.step(p, inp, pressed) after the pose, player.gearMesh for
// the meshes. ui.js asks game.gadgets.hint(p, kind) for the HUD prompt.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { DT } from './config.js';
import { Builder } from './mesh.js';
import { glyph } from './glyphs.js';
import { isBought } from './life/state.js';
import { injectCSS } from './map.js';

export const GADGETS = [
  { id: 'boots', name: 'High-jump boots', price: 160, desc: 'jump three times as high', how: 'jump higher (springy landings)' },
  { id: 'speed', name: 'Speed boots', price: 220, desc: 'run like the wind', how: 'run faster' },
  { id: 'glider', name: 'Glider', price: 260, desc: 'hold jump while falling', how: 'hold A in the air: glide' },
  { id: 'laser', name: 'Laser gun', price: 320, desc: 'punch to zap people over', how: 'X: fire the laser' },
  { id: 'grapple', name: 'Grappling hook', price: 380, desc: 'punch to zip where you look', how: 'X: grapple where you look' },
  { id: 'jetpack', name: 'Jetpack', price: 450, desc: 'hold jump in the air to fly', how: 'hold A in the air: fly' },
];
export const GADGET_IDS = GADGETS.map((g) => g.id);
export const gadgetDef = (id) => GADGETS.find((g) => g.id === id) || null;
export const gadgetName = (id) => gadgetDef(id)?.name || 'None';
export const gadgetLocked = (id) => !!id && !isBought('gadget:' + id);
export const lockedGadgets = () => GADGET_IDS.filter((id) => gadgetLocked(id)).length;

// ---- tuning ---------------------------------------------------------------
const JET_FUEL_S = 3.2;     // seconds of thrust on a full tank
const JET_REFILL_S = 1.6;   // seconds to refill on the ground
const JET_VY = 5.5;         // climb speed the thrust aims for (m/s)
const JET_SPEED = 2.0;      // stick speed multiplier while flying
const BOOT_JUMP = 1.75;     // jump speed x (height x ~3)
const SPEED_K = 1.65;       // walk / run speed x
const GLIDE_VY = -1.6;      // sink rate while gliding (m/s)
const GLIDE_SPEED = 2.1;    // stick speed multiplier while gliding
const LASER_SPEED = 48, LASER_LIFE = 0.75, LASER_COOL = 0.4;
const HOOK_RANGE = 40, HOOK_SPEED = 75, HOOK_PULL = 17, HOOK_TIME = 2.4;
const HINT_T = 8;           // seconds the "how to use" hint stays after putting a gadget on

// ---- meshes ---------------------------------------------------------------
// Static gear geometry for one body part, in the part's local frame (metres,
// like outfits.js). Also used for the shop's display stands.
const BACK = -0.2, FRONT = 0.205, HAND = -0.104;
const METAL = 0xd8dde6, DARK = 0x3a3f4a, STRAP = 0x2a2a33;
export function gearGeo(id, n, b, display = false) { // display: shop stand (no straps)
  if (id === 'jetpack' && n === 'chest') {
    b.rbox(0.3, 0.32, 0.06, 0.02, DARK, [0, 0.0, BACK - 0.035]);
    for (const s of [-1, 1]) {
      b.capsule(0.075, 0.2, METAL, [s * 0.095, 0.0, BACK - 0.11]);
      b.torus(0.077, 0.013, 0xff5a3c, [s * 0.095, 0.06, BACK - 0.11], [Math.PI / 2, 0, 0], 14);
      b.cyl(0.045, 0.06, 0.07, 0x555a66, [s * 0.095, -0.19, BACK - 0.11], null, 10);
      if (!display) b.box(0.04, 0.3, 0.02, STRAP, [s * 0.1, 0.02, FRONT - 0.02], [-0.15, 0, 0]);
    }
    b.sphere(0.03, 0xff5a3c, [0, 0.12, BACK - 0.07]);
  } else if (id === 'boots' && n.startsWith('lLeg')) {
    b.cyl(0.098, 0.1, 0.07, 0x3cb043, [0, -0.015, 0], null, 14);            // cuff
    b.sphere(0.11, 0x3cb043, [0, -0.072, 0.045], [1, 0.62, 1.45], 14);      // shell over the shoe
    b.rbox(0.17, 0.035, 0.3, 0.014, 0xf2f2f2, [0, -0.115, 0.045]);           // thick sole
    for (let i = 0; i < 3; i++) b.torus(0.038, 0.01, METAL, [0, -0.03 - i * 0.03, -0.085], [Math.PI / 2, 0, 0], 10); // heel spring
  } else if (id === 'speed' && n.startsWith('lLeg')) {
    b.sphere(0.11, 0xe8343c, [0, -0.072, 0.045], [1, 0.64, 1.45], 14);
    for (const s of [-1, 1]) {
      b.box(0.01, 0.025, 0.14, 0xffd23f, [s * 0.103, -0.075, 0.05], [0, 0, 0]);
      b.box(0.012, 0.07, 0.11, 0xffffff, [s * 0.1, -0.02, -0.04], [0.55, 0, 0]);
      b.box(0.012, 0.05, 0.08, 0xffffff, [s * 0.1, 0.01, -0.06], [0.75, 0, 0]);
    }
  } else if (id === 'glider' && n === 'chest') {
    b.rbox(0.28, 0.32, 0.1, 0.03, 0x2a62c9, [0, 0.0, BACK - 0.06]);
    if (!display) for (const s of [-1, 1]) b.box(0.04, 0.3, 0.02, STRAP, [s * 0.1, 0.02, FRONT - 0.02], [-0.15, 0, 0]);
  } else if (id === 'laser' && n === 'lArmR') {
    b.rbox(0.07, 0.15, 0.1, 0.02, 0xf2f2f2, [0, HAND - 0.07, 0.04]);
    b.cyl(0.026, 0.032, 0.15, DARK, [0, HAND - 0.19, 0.06], null, 10);
    b.box(0.14, 0.02, 0.05, 0xff3a8a, [0, HAND - 0.12, 0.06]);
    b.torus(0.036, 0.009, 0xff3a8a, [0, HAND - 0.22, 0.06], [Math.PI / 2, 0, 0], 12);
    b.sphere(0.03, 0x7af0ff, [0, HAND - 0.27, 0.06], null, 10);
  } else if (id === 'grapple' && n === 'lArmR') {
    b.cyl(0.05, 0.05, 0.17, 0x3a6a3a, [0, HAND - 0.12, 0.05], null, 12);
    b.torus(0.052, 0.014, 0x8a6a3a, [0, HAND - 0.08, 0.05], [Math.PI / 2, 0, 0], 12);
    b.cyl(0.02, 0.02, 0.06, DARK, [0, HAND - 0.23, 0.05], null, 8);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      b.cone(0.016, 0.07, METAL, [Math.sin(a) * 0.03, HAND - 0.27, 0.05 + Math.cos(a) * 0.03], [Math.PI + Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5], 6);
    }
  }
}

const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0.85, depthWrite: false });
const flameCore = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.95, depthWrite: false });
const flameGeo = new THREE.ConeGeometry(0.07, 0.55, 10).rotateX(Math.PI).translate(0, -0.27, 0);
const coreGeo = new THREE.ConeGeometry(0.04, 0.32, 8).rotateX(Math.PI).translate(0, -0.16, 0);
let wingGeo = null;
function glideWing() {
  if (!wingGeo) {
    const b = new Builder();
    b.box(1.9, 0.03, 0.05, 0x22305a, [0, 0, 0]);
    b.box(1.8, 0.015, 0.85, 0xff8a3d, [0, 0, -0.38], [0.1, 0, 0]);
    for (const x of [-0.6, 0, 0.6]) b.box(0.25, 0.017, 0.86, 0xffd23f, [x, 0.002, -0.38], [0.1, 0, 0]);
    for (const s of [-1, 1]) b.box(0.03, 0.14, 0.7, 0x22305a, [s * 0.92, 0.05, -0.36]);
    b.box(0.04, 0.04, 0.8, 0x22305a, [0, 0.03, -0.36]);
    wingGeo = b.mesh();
  }
  return wingGeo.clone();
}

// Animated pieces (flames, the glider wing) added to a part's mesh group.
function gearFx(p, n, g) {
  const id = p.gadget, fx = p.gear?.fx;
  if (!fx) return;
  if (id === 'jetpack' && n === 'chest') {
    fx.flames = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Group();
      f.add(new THREE.Mesh(flameGeo, flameMat), new THREE.Mesh(coreGeo, flameCore));
      f.position.set(s * 0.095, -0.225, BACK - 0.11);
      f.visible = false;
      g.add(f); fx.flames.push(f);
    }
  } else if (id === 'glider' && n === 'chest') {
    const w = glideWing();
    w.position.set(0, 0.17, BACK - 0.12);
    w.scale.set(0.13, 1, 0.3);
    g.add(w); fx.wing = w;
  }
}

// ---- wearing ----------------------------------------------------------------
// Sets a player's gadget without rebuilding the meshes (restoreLook rebuilds them).
export function applyGadget(p, id) {
  if (id && !gadgetDef(id)) id = null;
  if (p.gear) disposeGear(p.gear);
  p.gadget = id || null;
  p.gear = id ? makeGear(p, id) : null;
  p.gearMesh = id ? (n, b, g) => { gearGeo(id, n, b); gearFx(p, n, g); } : null; // read by Player.partMesh
}
export function setGadget(p, id) {
  applyGadget(p, id);
  p.setColor(p.colorIndex); // rebuilds the meshes
}
// Next unlocked choice (None first) from the current one in direction d.
export function cycleGadget(p, d) {
  const list = [null, ...GADGET_IDS], n = list.length;
  let i = list.indexOf(p.gadget || null);
  for (let k = 1; k <= n; k++) { const j = (((i + d * k) % n) + n) % n; if (!gadgetLocked(list[j])) { i = j; break; } }
  setGadget(p, list[i]);
}

let G = null; // the game (set by buildGadgets)
function makeGear(p, id) {
  const g = { id, p, fuel: 1, cool: 0, thrust: 0, open: 0, hint: HINT_T, speed: 1, jump: 1, fx: {}, hook: null, snd: null };
  if (id === 'boots') g.jump = BOOT_JUMP;
  if (id === 'speed') g.speed = SPEED_K;
  if (id === 'laser' || id === 'grapple') {
    g.hand = 'R';
    g.filter = (inp) => (inp.grabR ? { ...inp, grabR: 0 } : inp);
    g.punch = id === 'laser' ? laserPunch : grapplePunch;
  }
  g.step = STEPS[id];
  G?.gadgets.active.add(g);
  return g;
}
function disposeGear(g) {
  if (g.snd) { try { g.snd.g.gain.value = 0; g.snd.src.stop(); } catch (e) { /* ignore */ } g.snd = null; }
  if (g.hook) endHook(g);
  G?.gadgets.active.delete(g);
}

// ---- helpers -----------------------------------------------------------------
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const qeul = (x, y, z) => _q.setFromEuler(_e.set(x, y, z, 'YXZ'));
const normal = (p) => p.state === 'normal' && !p.mantle;
const hanging = (p) => !p.grounded && !!(p.hands.L.joint || p.hands.R.joint);
// Push on the torso (chest / hips) as an acceleration, like the hover spring.
function accel(p, ax, ay, az) {
  const M = p.totalMass * DT;
  p.chest.applyImpulse({ x: ax * M * 0.55, y: ay * M * 0.55, z: az * M * 0.55 }, true);
  p.hips.applyImpulse({ x: ax * M * 0.45, y: ay * M * 0.45, z: az * M * 0.45 }, true);
}
// Holding a loose object in a free hand: the punch throws it as usual.
function holdsLoose(p) {
  for (const h of ['L', 'R']) {
    const hand = p.hands[h];
    if (hand.joint && hand.body && !p.anchorHand(h) && !hand.owner?.parts) return true;
  }
  return false;
}
// Right arm held out in front, ready to fire (after animate() set the pose).
function aimArm(p) {
  if (!normal(p) || (p.punch.t > 0 && p.punch.hand === 'R') || p.swimming) return;
  const set = (n, q, kp, kd) => { const part = p.parts[n]; part.target.copy(q); part.kp = kp; part.kd = kd; part.maxT = 1e9; part.float = true; };
  set('uArmR', qeul(-0.75, 0, 0.12), 440, 24);
  set('lArmR', qeul(-0.75, 0, 0), 360, 20);
}
// Where the right hand's tool points out from, and its world position.
function muzzle(p, out) {
  p.handPos('R', out);
  out.x += Math.sin(p.yaw) * 0.2; out.z += Math.cos(p.yaw) * 0.2;
  return out;
}

// ---- per-gadget behaviour (gear.step, after the pose each physics step) ----------
function jetpackStep(p, inp) {
  const g = p.gear, v = p.hips.linvel();
  if (p.grounded || p.swimming || p.state === 'seated') g.fuel = Math.min(1, g.fuel + DT / JET_REFILL_S);
  const on = normal(p) && inp.jump && !p.grounded && !p.swimming && !hanging(p) && g.fuel > 0 && p.airTime > 0.12;
  if (on) {
    g.fuel = Math.max(0, g.fuel - DT / JET_FUEL_S);
    const ay = 9.81 + Math.max(-4, Math.min(13, (JET_VY - v.y) * 5));
    accel(p, 0, ay, 0);
    p.impactGrace = Math.max(p.impactGrace, 0.05); // the kick of the thrust isn't a bump
  }
  g.speed = on || (!p.grounded && g.thrust > 0.2) ? JET_SPEED : 1;
  g.thrust += ((on ? 1 : 0) - g.thrust) * Math.min(1, DT * 14);
  if (g.thrust > 0.3 && Math.random() < 0.9) {
    const c = p.chest.translation(), bx = -Math.sin(p.yaw) * 0.25, bz = -Math.cos(p.yaw) * 0.25;
    for (let k = 0; k < 2; k++) G.gadgets.sparks.emit(c.x + bx, c.y - 0.35, c.z + bz, (Math.random() - 0.5) * 1.2, -3 - Math.random() * 2, (Math.random() - 0.5) * 1.2, Math.random() < 0.5 ? 0xffb030 : 0xbfbfbf, 0.45, -2);
  }
}

function bootsStep(p) {
  const v = p.hips.linvel();
  // springy soles: a hard landing doesn't knock you out
  if (!p.grounded && !p.swimming && v.y < -4.5 && p.groundDist < 1.6 && p.state === 'normal') {
    p.impactGrace = Math.max(p.impactGrace, 0.12);
    p.gear.landing = Math.min(1, -v.y / 12);
  } else if (p.grounded && p.gear.landing) {
    sfx('boing', p.chest.translation(), p.gear.landing);
    p.gear.landing = 0;
  }
}

function speedStep(p) {
  const v = p.hips.linvel(), sp = Math.hypot(v.x, v.z);
  if (p.grounded && normal(p) && sp > 5 && Math.random() < Math.min(1, (sp - 4) / 5)) {
    const h = p.hips.translation();
    const cols = [0xffd23f, 0xffffff, 0xff5a8a, 0x7af0ff];
    G.gadgets.sparks.emit(h.x - v.x * 0.03 + (Math.random() - 0.5) * 0.3, h.y - 0.4, h.z - v.z * 0.03 + (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6, cols[(Math.random() * 4) | 0], 0.6, 1.5);
  }
}

function gliderStep(p, inp) {
  const g = p.gear, v = p.hips.linvel();
  const on = normal(p) && inp.jump && !p.grounded && !p.swimming && !hanging(p) && p.airTime > 0.2 && (v.y < -0.5 || g.open > 0.5);
  if (on) {
    const ay = Math.max(0, Math.min(30, (GLIDE_VY - v.y) * 6 + 9.81));
    // with the stick let go, keep sailing the way we face
    const mag = Math.hypot(inp.moveX || 0, inp.moveY || 0);
    let ax = 0, az = 0;
    if (mag < 0.1) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), fwd = v.x * fx + v.z * fz;
      const a = Math.max(0, Math.min(5, (6 - fwd) * 2));
      ax = fx * a; az = fz * a;
    }
    accel(p, ax, ay, az);
    p.impactGrace = Math.max(p.impactGrace, 0.05);
  }
  g.speed = on ? GLIDE_SPEED : 1;
  g.open += ((on ? 1 : 0) - g.open) * Math.min(1, DT * 8);
}

function laserStep(p) {
  const g = p.gear;
  g.cool -= DT;
  aimArm(p);
}

function grappleStep(p, inp, pressed) {
  const g = p.gear;
  g.cool -= DT;
  aimArm(p);
  const h = g.hook;
  if (!h) return;
  h.t += DT;
  if (!normal(p) && h.phase !== 'back') { h.phase = 'back'; h.t = 0; }
  if (h.phase === 'fly') {
    if (h.t * HOOK_SPEED >= h.dist) {
      if (!h.hit) { h.phase = 'back'; h.t = 0; return; }
      sfx('clink', h.hit.point);
      const b = h.hit.body, o = h.hit.owner;
      if (o?.parts && o !== p) { // a person: yank them over to us
        if (o.state !== 'seated') {
          const c = p.chest.translation(), oc = o.chest.translation();
          const dx = c.x - oc.x, dz = c.z - oc.z, d = Math.hypot(dx, dz) || 1, s = Math.min(9, 2 + d * 0.9);
          for (const ob of o.bodies) ob.setLinvel({ x: dx / d * s, y: 3.5, z: dz / d * s }, true);
          o.knockOut(1.6); o.impactGrace = 0.4;
        }
        h.phase = 'back'; h.t = 0; return;
      }
      if (b && b.isDynamic() && b.mass() < 150 && !o?.seats) { // loose things fly to us
        const c = p.chest.translation(), t = b.translation();
        const dx = c.x - t.x, dy = c.y - t.y, dz = c.z - t.z, d = Math.hypot(dx, dy, dz) || 1, s = Math.min(12, 3 + d * 0.8);
        b.setLinvel({ x: dx / d * s, y: dy / d * s + 3, z: dz / d * s }, true);
        b.wakeUp();
        h.phase = 'back'; h.t = 0; return;
      }
      h.phase = 'pull'; h.t = 0;
    }
  } else if (h.phase === 'pull') {
    const pt = hookPoint(h, _w), c = p.chest.translation();
    const dx = pt.x - c.x, dy = pt.y - c.y, dz = pt.z - c.z, d = Math.hypot(dx, dy, dz);
    if (d < 1.3 || h.t > HOOK_TIME || pressed.jump || (h.t > 0.3 && d > h.lastD + 0.05 && d > 2.5 && p.blockedAhead())) {
      // let go; a little hop up and on when we reach a ledge (or jump off)
      const v = p.chest.linvel();
      if (pressed.jump || dy > -0.3) for (const b of p.bodies) b.setLinvel({ x: v.x * 0.5, y: Math.max(v.y, 4.5), z: v.z * 0.5 }, true);
      h.phase = 'back'; h.t = 0; g.cool = 0.25;
      return;
    }
    h.lastD = d;
    const s = Math.min(HOOK_PULL, 3 + d * 3), v = p.chest.linvel();
    const tx = dx / d * s, ty = dy / d * s, tz = dz / d * s;
    let ax = (tx - v.x) * 6, ay = (ty - v.y) * 6, az = (tz - v.z) * 6;
    const a = Math.hypot(ax, ay, az), amax = 32;
    if (a > amax) { ax *= amax / a; ay *= amax / a; az *= amax / a; }
    accel(p, ax, ay + 9.81 * 0.9, az);
    p.impactGrace = Math.max(p.impactGrace, 0.1);
    p.yaw = Math.atan2(dx, dz);
  } else if (h.phase === 'back' && h.t > 0.18) endHook(g);
}

const STEPS = { jetpack: jetpackStep, boots: bootsStep, speed: speedStep, glider: gliderStep, laser: laserStep, grapple: grappleStep };

// ---- laser ---------------------------------------------------------------------------
const boltGeo = new THREE.CapsuleGeometry(0.045, 0.5, 3, 8).rotateX(Math.PI / 2);
const boltMat = new THREE.MeshBasicMaterial({ color: 0xff3a8a });
const boltCore = new THREE.MeshBasicMaterial({ color: 0xffd6ea });
const coreGeo2 = new THREE.CapsuleGeometry(0.022, 0.5, 3, 6).rotateX(Math.PI / 2);

function laserPunch(p) {
  const g = p.gear;
  if (holdsLoose(p) || g.cool > 0) return false; // throw what we hold / punch while it recharges
  g.cool = LASER_COOL;
  const o = muzzle(p, new THREE.Vector3());
  // aim: where we face, tipped up or down toward someone in front
  let dx = Math.sin(p.yaw), dz = Math.cos(p.yaw), dy = 0;
  let best = null, bs = 0.97;
  for (const q of [...G.players, ...(G.npcs?.list || [])]) {
    if (q === p || q.parked) continue;
    const t = q.chest.translation(), rx = t.x - o.x, ry = t.y - o.y, rz = t.z - o.z, d = Math.hypot(rx, ry, rz);
    if (d < 0.5 || d > 30) continue;
    const c = (rx * dx + rz * dz) / Math.hypot(rx, rz);
    if (c > bs && Math.abs(ry) < d * 0.6) { bs = c; best = [rx / d, ry / d, rz / d]; }
  }
  if (best) [dx, dy, dz] = best;
  else { const pitch = Math.max(-0.4, Math.min(0.5, 0.3 - (p.cam?.pitch ?? 0.3))); const cp = Math.cos(pitch); dx *= cp; dz *= cp; dy = Math.sin(pitch); }
  const m = new THREE.Group();
  m.add(new THREE.Mesh(boltGeo, boltMat), new THREE.Mesh(coreGeo2, boltCore));
  m.position.copy(o);
  m.lookAt(o.x + dx, o.y + dy, o.z + dz);
  m.userData.noCull = true;
  G.scene.add(m);
  G.gadgets.bolts.push({ p, x: o.x, y: o.y, z: o.z, dx, dy, dz, t: 0, m });
  // recoil: a small shove back, never enough to break a grip
  p.chest.applyImpulse({ x: -dx * 2.5, y: 0, z: -dz * 2.5 }, true);
  // arm snaps out like a punch (no punch hit, no throw)
  p.punch.t = 0.3; p.punch.hand = 'R'; p.punch.hit = true;
  sfx('laser', o);
  return true;
}

function boltStep(game) {
  const list = game.gadgets.bolts;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.t += DT;
    const len = LASER_SPEED * DT;
    const hit = game.physics.world.castRayAndGetNormal(new RAPIER.Ray({ x: b.x, y: b.y, z: b.z }, { x: b.dx, y: b.dy, z: b.dz }), len, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, b.p.queryGroups);
    if (hit) {
      const t = hit.timeOfImpact, hp = { x: b.x + b.dx * t, y: b.y + b.dy * t, z: b.z + b.dz * t };
      zap(game, b, hit.collider, hp);
      game.scene.remove(b.m); list.splice(i, 1);
      continue;
    }
    b.x += b.dx * len; b.y += b.dy * len; b.z += b.dz * len;
    b.m.position.set(b.x, b.y, b.z);
    if (b.t > LASER_LIFE) { game.scene.remove(b.m); list.splice(i, 1); }
  }
}

function zap(game, b, col, hp) {
  const owner = game.physics.handleOwner.get(col.handle), body = col.parent();
  if (owner?.parts && owner.bodies) { // a player or an NPC: knocked over, never hurt
    if (owner.state !== 'seated') {
      for (const ob of owner.bodies) ob.applyImpulse({ x: b.dx * 5 * ob.mass(), y: 2.5 * ob.mass(), z: b.dz * 5 * ob.mass() }, true);
      owner.knockOut(2.2);
      owner.impactGrace = 0.3;
    }
  } else if (body && body.isDynamic()) {
    const m = Math.min(body.mass(), 120);
    body.applyImpulseAtPoint({ x: b.dx * m * 6, y: b.dy * m * 6 + m * 1.5, z: b.dz * m * 6 }, hp, true);
  }
  for (let k = 0; k < 14; k++) game.gadgets.sparks.emit(hp.x, hp.y, hp.z, (Math.random() - 0.5) * 5 - b.dx * 2, Math.random() * 4, (Math.random() - 0.5) * 5 - b.dz * 2, k % 2 ? 0xff3a8a : 0xffffff, 0.4, 9);
  sfx('zap', hp);
}

// ---- grappling hook -------------------------------------------------------------------
const ropeMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
const ropeGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 6).translate(0, 0.5, 0);
let clawGeo = null;
function clawMesh() {
  if (!clawGeo) {
    const b = new Builder();
    b.cyl(0.03, 0.03, 0.12, DARK, [0, 0, 0], [Math.PI / 2, 0, 0], 8);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; b.cone(0.022, 0.12, METAL, [Math.sin(a) * 0.05, Math.cos(a) * 0.05, 0.07], [Math.PI / 2 - 0.5, 0, a], 6); }
    clawGeo = b.geometry();
  }
  return new THREE.Mesh(clawGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

function grapplePunch(p) {
  const g = p.gear;
  if (g.hook) { if (g.hook.phase !== 'back') { g.hook.phase = 'back'; g.hook.t = 0; } markArm(p); return true; }
  if (holdsLoose(p) || g.cool > 0) return false;
  g.cool = 0.35;
  // aim where the camera looks (tipped up a little: you aim at what's above you)
  const yaw = p.cam ? p.cam.yaw : p.yaw;
  const el = Math.max(-0.5, Math.min(1.35, 0.42 - (p.cam ? p.cam.pitch : 0.3) * 1.1));
  const dir = { x: Math.sin(yaw) * Math.cos(el), y: Math.sin(el), z: Math.cos(yaw) * Math.cos(el) };
  const c = p.chest.translation(), from = { x: c.x, y: c.y + 0.2, z: c.z };
  const r = G.physics.world.castRayAndGetNormal(new RAPIER.Ray(from, dir), HOOK_RANGE, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, p.queryGroups);
  let hit = null, dist = HOOK_RANGE;
  if (r) {
    dist = r.timeOfImpact;
    const point = { x: from.x + dir.x * dist, y: from.y + dir.y * dist, z: from.z + dir.z * dist };
    const body = r.collider.parent(), t = body.translation(), rq = body.rotation();
    _q.set(rq.x, rq.y, rq.z, rq.w).invert();
    const local = _v.set(point.x - t.x, point.y - t.y, point.z - t.z).applyQuaternion(_q).clone();
    hit = { point, body, local, owner: G.physics.handleOwner.get(r.collider.handle) || null };
  }
  const claw = clawMesh(), rope = new THREE.Mesh(ropeGeo, ropeMat);
  claw.userData.noCull = rope.userData.noCull = true;
  G.scene.add(claw, rope);
  g.hook = { phase: 'fly', t: 0, from, dir, dist, hit, claw, rope, lastD: 1e9 };
  p.yaw = Math.atan2(dir.x, dir.z);
  markArm(p);
  sfx('thwip', from);
  return true;
}
const markArm = (p) => { p.punch.t = 0.3; p.punch.hand = 'R'; p.punch.hit = true; };
function hookPoint(h, out) {
  const b = h.hit.body;
  try {
    const t = b.translation(), r = b.rotation();
    return out.copy(h.hit.local).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_v.set(t.x, t.y, t.z));
  } catch (e) { // the body went away (a called vehicle sent home...)
    return out.set(h.hit.point.x, h.hit.point.y, h.hit.point.z);
  }
}
function endHook(g) {
  const h = g.hook;
  if (!h) return;
  G?.scene.remove(h.claw, h.rope);
  h.claw.material.dispose();
  g.hook = null;
}
// Rope and claw follow the hook (per frame).
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function drawHook(g) {
  const h = g.hook, p = g.p;
  p.handPos('R', _a);
  if (h.phase === 'fly') { const s = Math.min(h.dist, h.t * HOOK_SPEED); _b.set(h.from.x + h.dir.x * s, h.from.y + h.dir.y * s, h.from.z + h.dir.z * s); }
  else if (h.phase === 'pull') hookPoint(h, _b);
  else {
    const k = Math.max(0, 1 - h.t / 0.18);
    if (!h.backFrom) h.backFrom = h.claw.position.clone();
    _b.copy(h.backFrom).sub(_a).multiplyScalar(k).add(_a);
  }
  const d = _b.distanceTo(_a);
  h.rope.position.copy(_a);
  if (d > 1e-3) h.rope.quaternion.setFromUnitVectors(UP, _w.copy(_b).sub(_a).divideScalar(d));
  h.rope.scale.set(1, Math.max(0.01, d), 1);
  h.claw.position.copy(_b);
  h.claw.lookAt(_b.x + h.dir.x, _b.y + h.dir.y, _b.z + h.dir.z);
}

// ---- sparkles / smoke ---------------------------------------------------------------------
class Sparks {
  constructor(scene, n = 500) {
    this.n = n; this.i = 0; this.alive = 0;
    this.pos = new Float32Array(n * 3).fill(-9999);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.grav = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.pts.frustumCulled = false;
    this.pts.userData.noCull = true;
    scene.add(this.pts);
    this.c = new THREE.Color();
  }
  emit(x, y, z, vx, vy, vz, color, life, grav = 9) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.c.set(color); this.col.set([this.c.r, this.c.g, this.c.b], i * 3);
    this.life[i] = life; this.grav[i] = grav;
    this.alive = 1.5;
  }
  update(dt) {
    if (this.alive <= 0) return;
    this.alive -= dt;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { P[i * 3 + 1] = -9999; continue; }
      V[i * 3 + 1] -= this.grav[i] * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

// ---- sounds (synthesized with the game's audio primitives) ------------------------------------
function sfx(name, pos, s = 1) {
  const A = G?.audio;
  if (!A?.running?.()) return;
  try {
    const sp = A.spatial(pos), v = sp.v * s;
    if (v < 0.02) return;
    const out = A.outNode(1, sp.pan, 0.4);
    if (A.playSample?.(name, out, v)) return; // a delivered recording (dev/sfx) wins over the synth
    if (name === 'laser') { A.tone('square', 1900, 260, 0.16, 0.07 * v, 0, out, 0.002); A.tone('sine', 2600, 600, 0.12, 0.08 * v, 0, out, 0.002); }
    else if (name === 'zap') { A.burst(0.12, 0.2 * v, 2400, 2, 'bandpass', 0, out, 600); A.tone('sawtooth', 500, 120, 0.12, 0.06 * v, 0, out); }
    else if (name === 'thwip') { A.burst(0.14, 0.16 * v, 1500, 3, 'bandpass', 0, out, 4000); A.tone('triangle', 500, 1200, 0.1, 0.06 * v, 0, out); }
    else if (name === 'clink') { A.tone('triangle', 1800, 1700, 0.08, 0.1 * v, 0, out, 0.002); A.burst(0.04, 0.12 * v, 3000, 2, 'bandpass', 0, out); }
    else if (name === 'boing') { A.tone('sine', 180, 520, 0.22, 0.16 * v, 0, out); A.tone('triangle', 260, 640, 0.18, 0.06 * v, 0.03, out); }
  } catch (e) { /* never let a sound break the game */ }
}
// Jetpack roar: one looping noise per wearer, its level following the thrust.
function jetSound(game, g, pos) {
  const A = game.audio;
  if (!A?.running?.() || !A.noise) return;
  try {
    const c = A.ctx;
    if (!g.snd) {
      if (g.thrust < 0.05) return;
      const src = c.createBufferSource(); src.buffer = A.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const gn = c.createGain(); gn.gain.value = 0;
      src.connect(f); f.connect(gn); gn.connect(A.sfx);
      src.start(0, Math.random());
      g.snd = { src, f, g: gn };
    }
    const v = A.spatial(pos).v;
    g.snd.g.gain.setTargetAtTime(g.thrust * 0.32 * v, c.currentTime, 0.04);
    g.snd.f.frequency.setTargetAtTime(500 + g.thrust * 900, c.currentTime, 0.05);
  } catch (e) { /* ignore */ }
}

// ---- HUD hint ------------------------------------------------------------------------------
const CSS = `
.gfuel { display: inline-block; width: 64px; height: 10px; border-radius: 6px; background: rgba(0,0,0,.35); overflow: hidden; vertical-align: middle; margin-left: 6px; box-shadow: inset 0 0 0 2px rgba(255,255,255,.6); }
.gfuel i { display: block; height: 100%; background: linear-gradient(90deg, #ff8a1a, #ffd23f); }
.gfuel.low i { background: #ff4a3a; }
`;
function hint(p, k) {
  const g = p.gear;
  if (!g || p.state !== 'normal') return '';
  const A = glyph('A', k), X = glyph('X', k), air = !p.grounded && !p.swimming;
  if (g.id === 'jetpack') {
    const f = Math.round(g.fuel * 10) * 10;
    const bar = `<span class="gfuel ${f <= 20 ? 'low' : ''}"><i style="width:${f}%"></i></span>`;
    if (air || g.fuel < 0.99) return `${A} Hold: jetpack${bar}`;
    return g.hint > 0 ? `Jetpack: jump, then hold ${A} to fly` : '';
  }
  if (g.id === 'glider') return air && p.airTime > 0.2 ? `${A} Hold: glide` : g.hint > 0 ? `Glider: hold ${A} while falling` : '';
  if (g.id === 'laser') return g.hint > 0 ? `${X} Fire laser` : '';
  if (g.id === 'grapple') return g.hook?.phase === 'pull' ? `${A} Let go` : g.hint > 0 ? `${X} Grappling hook <small>(aim with the camera)</small>` : '';
  if (g.hint > 0) return g.id === 'boots' ? `High-jump boots: ${A} jumps sky high!` : 'Speed boots: zoom!';
  return '';
}

// ---- setup ---------------------------------------------------------------------------------
export function buildGadgets(game) {
  G = game;
  injectCSS(CSS);
  const gd = game.gadgets = {
    list: GADGETS, active: new Set(), bolts: [], sparks: new Sparks(game.scene),
    hint, set: setGadget, cycle: cycleGadget, locked: gadgetLocked,
  };
  game.steppers.push(() => {
    boltStep(game);
    for (const g of gd.active) {
      if (!game.players.includes(g.p)) { disposeGear(g); continue; } // left the game
      g.hint -= DT;
    }
  });
  game.updaters.push((dt) => {
    gd.sparks.update(dt);
    for (const g of gd.active) {
      const p = g.p;
      if (!game.players.includes(p)) { disposeGear(g); continue; } // left the game: its bodies are gone
      if (g.fx.flames) for (const f of g.fx.flames) { f.visible = g.thrust > 0.04; f.scale.set(0.7 + g.thrust * 0.3, g.thrust * (0.8 + Math.random() * 0.4), 0.7 + g.thrust * 0.3); }
      if (g.fx.wing) { const o = g.open; g.fx.wing.scale.set(0.13 + 0.87 * o, 1, 0.3 + 0.7 * o); g.fx.wing.position.y = 0.17 + o * 0.25; }
      if (g.id === 'jetpack') jetSound(game, g, p.chest.translation());
      if (g.hook) drawHook(g);
    }
  });
  // starting the life sim over takes bought gadgets off again
  const reset = game.life?.reset;
  if (game.life && reset) game.life.reset = () => { reset(); for (const p of game.players) if (gadgetLocked(p.gadget)) setGadget(p, null); };
}
