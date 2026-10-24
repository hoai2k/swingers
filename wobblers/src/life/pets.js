// Pets (bought in the pet shop): a dog, cat, bunny or penguin that follows its
// owner around. Physically each pet is one small ball with locked rotation
// (cheap, stable, pushable and grabbable like any prop, floats in water through
// the normal buoyancy); everything wobbly is visual: springy ears, wagging
// tail, swinging legs, a head that lags behind, squash on landing, sitting
// when you stop. It hops over kerbs and up stairs, paddles in water, hops into
// your vehicle when you get in (riding on your lap), dangles and wriggles when
// carried, and pops back beside you if it gets lost.
//
//   game.pets.list          live Pet objects     game.pets.of(player)  that player's pet
//   game.pets.sync()        (re)spawn / remove pets to match players' saved choices
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { Builder } from '../mesh.js';
import { DT, groups, G_PROP, ALL, G_STATIC, G_VEH } from '../config.js';
import { petsOf } from './state.js';

export const PET_KINDS = {
  dog: { name: 'Dog', pet: 'Biscuit', price: 150, r: 0.24, mass: 5, speed: 7.2, sound: 'bark', pitch: 1, desc: 'Loyal, waggy, loves a run' },
  cat: { name: 'Cat', pet: 'Mittens', price: 150, r: 0.21, mass: 4, speed: 7.0, sound: 'meow', pitch: 1, desc: 'Curious and a bit sassy' },
  bunny: { name: 'Bunny', pet: 'Clover', price: 120, r: 0.2, mass: 3, speed: 6.8, sound: 'squeak', pitch: 1, desc: 'Hops everywhere' },
  penguin: { name: 'Penguin', pet: 'Waddles', price: 220, r: 0.22, mass: 5, speed: 6.6, sound: 'quack', pitch: 1.2, desc: 'Waddles on land, zooms in water', swim: 1.8 },
};
export const PET_ORDER = ['dog', 'cat', 'bunny', 'penguin'];

const PET_GROUPS = groups(G_PROP, ALL);
const RIDE_GROUPS = groups(0, 0);           // riding in a vehicle: no collisions
const GROUND_Q = groups(ALL, G_STATIC | G_PROP | G_VEH);

// ---- looks ------------------------------------------------------------------
// Every part is a mesh whose origin is its pivot (legs: hip, ears: base, tail: root).
function part(build) { const b = new Builder(); build(b); const m = b.mesh(); const g = new THREE.Group(); g.add(m); return g; }
const eyes = (b, x, y, z, s = 0.026) => {
  for (const sd of [-1, 1]) { b.sphere(s, 0x16161e, [sd * x, y, z], [1, 1.2, 0.7], 8); b.sphere(s * 0.38, 0xffffff, [sd * x + 0.006, y + 0.01, z + s * 0.5], null, 5); }
};

function buildLooks(kind) {
  const L = { root: new THREE.Group(), yaw: new THREE.Group(), torso: null, head: null, ears: [], tail: null, legs: [], extra: [] };
  L.root.add(L.yaw);
  const r = PET_KINDS[kind].r, gy = -r; // ground below the body centre
  const leg = (x, y, z, len, rad, col, paw = 0xffffff, pawS = 1) => {
    const g = part((b) => { b.cyl(rad, rad * 0.9, len, col, [0, -len / 2, 0], null, 8); b.sphere(rad * 1.25 * pawS, paw, [0, -len, rad * 0.4], [1, 0.7, 1.3], 8); });
    g.position.set(x, y, z); return g;
  };
  if (kind === 'dog') {
    const fur = 0xc8955a, light = 0xf2dcc0, dark = 0x7a4a2a;
    L.torso = part((b) => { b.sphere(0.2, fur, [0, 0, 0], [0.95, 0.85, 1.4], 14); b.sphere(0.15, light, [0, -0.06, 0.06], [0.95, 0.7, 1.35], 10); b.sphere(0.07, dark, [0.08, 0.12, -0.06], [1, 0.4, 1.3], 8); });
    L.head = part((b) => {
      b.sphere(0.15, fur, [0, 0, 0], [1, 0.95, 1], 14);
      b.sphere(0.085, light, [0, -0.04, 0.12], [1, 0.8, 1.2], 10);
      b.sphere(0.034, 0x16161e, [0, -0.01, 0.22], [1.2, 0.9, 0.8], 8);
      b.sphere(0.03, 0xff6a7a, [0, -0.085, 0.17], [1, 0.5, 1], 6); // tongue
      eyes(b, 0.06, 0.045, 0.125);
    });
    L.head.position.set(0, 0.16, 0.27);
    for (const sd of [-1, 1]) { const e = part((b) => b.sphere(0.07, dark, [0, -0.075, 0], [0.55, 1.15, 0.28], 10)); e.position.set(sd * 0.115, 0.075, -0.01); e.rotation.z = sd * 0.25; e.userData.side = sd; L.head.add(e); L.ears.push(e); }
    L.tail = part((b) => { b.cyl(0.03, 0.022, 0.18, fur, [0, 0.09, 0], null, 6); b.sphere(0.032, light, [0, 0.19, 0], null, 6); });
    L.tail.position.set(0, 0.09, -0.27); L.tail.rotation.x = -0.6;
    for (const [x, z] of [[-0.1, 0.17], [0.1, 0.17], [-0.1, -0.17], [0.1, -0.17]]) L.legs.push(leg(x, -0.06, z, -gy - 0.06 - 0.02, 0.04, fur, light));
  } else if (kind === 'cat') {
    const fur = 0xf0a040, stripe = 0xc86a1a, light = 0xfff0dc;
    L.torso = part((b) => {
      b.sphere(0.17, fur, [0, 0, 0], [0.85, 0.8, 1.45], 14); b.sphere(0.12, light, [0, -0.05, 0.08], [0.9, 0.7, 1.2], 10);
      for (const z of [-0.12, 0, 0.12]) b.sphere(0.06, stripe, [0, 0.11, z], [1.6, 0.35, 0.5], 8);
    });
    L.head = part((b) => {
      b.sphere(0.13, fur, [0, 0, 0], [1.1, 0.95, 1], 14);
      b.sphere(0.06, light, [0, -0.04, 0.09], [1.3, 0.8, 1], 10);
      b.sphere(0.018, 0xff8aa0, [0, -0.015, 0.14], null, 6);
      eyes(b, 0.055, 0.03, 0.105, 0.028);
      for (const sd of [-1, 1]) for (const k of [-1, 1]) b.box(0.09, 0.004, 0.004, 0x333333, [sd * 0.1, -0.03 + k * 0.012, 0.11], [0, 0, sd * k * 0.15]);
    });
    L.head.position.set(0, 0.15, 0.24);
    for (const sd of [-1, 1]) { const e = part((b) => { b.cone(0.05, 0.1, fur, [0, 0.05, 0], null, 4); b.cone(0.028, 0.06, 0xffb7c5, [0, 0.04, 0.012], null, 4); }); e.position.set(sd * 0.07, 0.095, 0); e.rotation.z = -sd * 0.25; e.userData.side = sd; L.head.add(e); L.ears.push(e); }
    // two-segment tail held up with a curl
    L.tail = part((b) => b.cyl(0.026, 0.03, 0.2, fur, [0, 0.1, 0], null, 6));
    const tip = part((b) => { b.cyl(0.022, 0.026, 0.16, fur, [0, 0.08, 0], null, 6); b.sphere(0.026, stripe, [0, 0.16, 0], null, 6); });
    tip.position.y = 0.2; L.tail.add(tip); L.extra.push(tip);
    L.tail.position.set(0, 0.08, -0.23); L.tail.rotation.x = -0.35;
    for (const [x, z] of [[-0.08, 0.15], [0.08, 0.15], [-0.08, -0.15], [0.08, -0.15]]) L.legs.push(leg(x, -0.06, z, -gy - 0.06 - 0.015, 0.032, fur, light));
  } else if (kind === 'bunny') {
    const fur = 0xf4f0ea, pink = 0xffb7d5, grey = 0xd9d2c8;
    L.torso = part((b) => { b.sphere(0.18, fur, [0, 0, 0], [1, 0.95, 1.15], 14); b.sphere(0.07, grey, [0, 0.12, -0.06], [1.3, 0.4, 1.3], 8); });
    L.head = part((b) => {
      b.sphere(0.12, fur, [0, 0, 0], [1.05, 1, 1], 14);
      b.sphere(0.02, pink, [0, -0.01, 0.12], null, 6);
      b.sphere(0.035, 0xffffff, [-0.02, -0.04, 0.1], null, 6); b.sphere(0.035, 0xffffff, [0.02, -0.04, 0.1], null, 6);
      eyes(b, 0.055, 0.03, 0.095, 0.026);
    });
    L.head.position.set(0, 0.17, 0.17);
    for (const sd of [-1, 1]) { const e = part((b) => { b.sphere(0.045, fur, [0, 0.13, 0], [0.75, 2.9, 0.4], 10); b.sphere(0.03, pink, [0, 0.13, 0.012], [0.7, 2.6, 0.3], 8); }); e.position.set(sd * 0.05, 0.08, -0.02); e.rotation.z = -sd * 0.12; e.userData.side = sd; L.head.add(e); L.ears.push(e); }
    L.tail = part((b) => b.sphere(0.06, 0xffffff, [0, 0, 0], null, 8));
    L.tail.position.set(0, 0.02, -0.2);
    // short front legs, big back feet
    for (const [x, z, back] of [[-0.07, 0.11, 0], [0.07, 0.11, 0], [-0.1, -0.08, 1], [0.1, -0.08, 1]]) L.legs.push(leg(x, -0.07, z, -gy - 0.07 - 0.015, back ? 0.05 : 0.03, fur, fur, back ? 1.6 : 1));
  } else { // penguin
    const black = 0x23242e, white = 0xf6f6f6, orange = 0xff9a1a;
    L.torso = part((b) => {
      b.sphere(0.2, black, [0, 0.1, 0], [1, 1.45, 0.92], 16);
      b.sphere(0.165, white, [0, 0.06, 0.08], [0.95, 1.3, 0.75], 14);
    });
    L.head = part((b) => {
      b.sphere(0.13, black, [0, 0, 0], null, 14);
      b.sphere(0.1, white, [0, -0.01, 0.05], [1, 0.9, 0.8], 10);
      b.cone(0.035, 0.09, orange, [0, -0.03, 0.15], [Math.PI / 2, 0, 0], 8);
      eyes(b, 0.045, 0.03, 0.105, 0.022);
    });
    L.head.position.set(0, 0.42, 0.02);
    // flippers play the ears' part (springy, flap when running)
    for (const sd of [-1, 1]) { const e = part((b) => b.sphere(0.05, black, [0, -0.11, 0], [0.35, 1.7, 0.75], 10)); e.position.set(sd * 0.19, 0.22, 0); e.rotation.z = sd * 0.25; e.userData.side = sd; e.userData.flipper = true; L.torso.add(e); L.ears.push(e); }
    L.tail = part((b) => b.sphere(0.05, black, [0, 0, -0.03], [1.2, 0.5, 1.4], 8));
    L.tail.position.set(0, -0.1, -0.16);
    for (const x of [-0.08, 0.08]) {
      const g = part((b) => { b.cyl(0.03, 0.03, 0.05, orange, [0, -0.025, 0], null, 6); b.box(0.09, 0.025, 0.13, orange, [0, -0.06, 0.04]); });
      g.position.set(x, -gy - 0.42 + gy + 0.0 - 0.13, 0); g.position.y = gy + 0.075; L.legs.push(g);
    }
  }
  L.torso.add(L.tail);
  L.yaw.add(L.torso);
  if (L.head.parent !== L.torso) L.torso.add(L.head);
  for (const lg of L.legs) L.torso.add(lg);
  L.headBase = L.head.position.clone();
  L.legBase = L.legs.map((g) => g.position.clone());
  // only the body casts a shadow (legs, ears and tail would cost a shadow draw each, per view group)
  L.root.traverse((o) => { if (o.isMesh) { o.castShadow = o.parent === L.torso; o.receiveShadow = false; } });
  return L;
}

// A little static, idling display model (pet shop window) — same looks, no physics.
export function petModel(kind) {
  const L = buildLooks(kind);
  L.root.userData.looks = L;
  return L.root;
}
export function idleAnim(L, t, k = 0) {
  L.tail.rotation.z = Math.sin(t * 7 + k) * 0.5;
  L.head.rotation.y = Math.sin(t * 0.9 + k) * 0.35;
  L.head.rotation.x = Math.sin(t * 1.3 + k) * 0.08;
  for (const e of L.ears) e.rotation.x = Math.sin(t * 3 + k + e.userData.side) * 0.12;
  L.torso.scale.set(1, 1 + Math.sin(t * 3 + k) * 0.025, 1);
}

// ---- the pet ------------------------------------------------------------------
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Pet {
  constructor(game, owner, kind) {
    this.game = game; this.owner = owner; this.kind = kind; this.def = PET_KINDS[kind];
    this.looks = buildLooks(kind);
    const c = owner.chest.translation(), r = this.def.r;
    const sp = this.spotBehind(1.4);
    const desc = RAPIER.ColliderDesc.ball(r).setMass(this.def.mass).setFriction(0.25).setRestitution(0.15);
    this.obj = game.physics.dynamic(sp || { x: c.x, y: c.y, z: c.z }, [desc], this.looks.root, { kind: 'pet', linDamp: 0.25, angDamp: 1, ccd: true, groups: PET_GROUPS });
    this.obj.buoy = { r, volume: (4 / 3) * Math.PI * r ** 3, scale: 0.55, drag: 2.5 };
    this.body = this.obj.body;
    this.body.lockRotations(true, true);
    this.body.setCanSleep?.(false);
    this.collider = this.obj.colliders[0];
    this.obj.pet = this;
    game.scene.add(this.looks.root);
    this.yaw = owner.yaw; this.visYaw = owner.yaw;
    this.grounded = false; this.stuck = 0; this.hopCool = 0; this.idle = 0; this.sit = 0;
    this.phase = 0; this.t = Math.random() * 10; this.mood = 0;
    this.ride = null; this.hopIn = null; this.carried = false; this.wasCarried = false;
    this.squash = 0; this.squashV = 0; this.prevVy = 0;
    this.head = { x: 0, y: 0, vx: 0, vy: 0 };
    this.ears = this.looks.ears.map(() => ({ a: 0, v: 0 }));
    this.barkT = 4 + Math.random() * 6; this.farT = 0; this.best = 1e9; this.noProgress = 0;
    this.speed = 0;
  }

  get pos() { return this.body.translation(); }

  // A free spot on the ground behind the owner (or null).
  spotBehind(d = 1.4) {
    const o = this.owner, c = o.chest.translation(), g = this.game;
    for (const a of [Math.PI, Math.PI - 0.8, Math.PI + 0.8, Math.PI / 2, -Math.PI / 2, 0]) {
      const x = c.x + Math.sin(o.yaw + a) * d, z = c.z + Math.cos(o.yaw + a) * d;
      const gy = g.groundHeight(x, z, c.y + 1.2);
      if (gy > -5 && Math.abs(gy - (c.y - 1)) < 1.6) return { x, y: gy + this.def.r + 0.08, z };
    }
    // owner in mid-air (or on something odd): whatever ground is under the spot behind them
    const x = c.x - Math.sin(o.yaw) * d, z = c.z - Math.cos(o.yaw) * d, gy = g.groundHeight(x, z, c.y + 1.2);
    if (gy > -5) return { x, y: gy + this.def.r + 0.08, z };
    return null;
  }

  teleportNear() {
    const sp = this.spotBehind(1.4) || this.spotBehind(0.8);
    const c = this.owner.chest.translation();
    const p = sp || { x: c.x, y: c.y + 0.3, z: c.z };
    this.body.setTranslation(p, true); this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    if (this.obj.rec) this.obj.rec.snap = true;
    this.stuck = 0; this.farT = 0; this.best = 1e9; this.noProgress = 0;
    this.squashV = 4;
  }

  say(n = 1) {
    const d = this.def;
    this.game.audio?.play(d.sound, this.pos, 1, { pitch: d.pitch * (0.95 + Math.random() * 0.1), n });
    this.mood = 1;
  }

  holder() {
    for (const p of this.game.players) for (const h of ['L', 'R']) if (p.hands?.[h]?.body === this.body) return p;
    return null;
  }

  // ---- physics step ----------------------------------------------------------
  step() {
    const o = this.owner, b = this.body, d = this.def, g = this.game;
    this.t += DT;
    this.hopCool -= DT; this.barkT -= DT;
    const t = b.translation(), v = b.linvel();
    const oc = o.chest.translation();

    // in a vehicle with the owner: ride on their lap
    const veh = o.seat?.vehicle && !o.seat.vehicle.destroyed ? o.seat.vehicle : null;
    if (veh && !this.ride) {
      const dist = Math.hypot(t.x - oc.x, t.z - oc.z);
      if (dist < 30) { this.ride = veh; this.hopIn = { t: 0, from: { x: t.x, y: t.y, z: t.z } }; this.collider.setCollisionGroups(RIDE_GROUPS); for (const p of g.players) for (const h of ['L', 'R']) if (p.hands[h].body === b) p.releaseHand(h); if (dist > 4) this.say(2); }
    }
    if (this.ride) {
      if (!veh || veh !== this.ride) { // got out
        this.ride = null; this.hopIn = null;
        this.collider.setCollisionGroups(PET_GROUPS);
        this.teleportNear();
        return;
      }
      const hp = o.hips.translation(), fx = Math.sin(o.yaw), fz = Math.cos(o.yaw);
      const ax = hp.x + fx * 0.32, ay = hp.y + 0.22, az = hp.z + fz * 0.32;
      let px = ax, py = ay, pz = az;
      if (this.hopIn) { // little arc into the seat
        const k = Math.min(1, (this.hopIn.t += DT) / 0.45), f = this.hopIn.from;
        px = f.x + (ax - f.x) * k; pz = f.z + (az - f.z) * k; py = f.y + (ay - f.y) * k + Math.sin(k * Math.PI) * 1.2;
        if (k >= 1) this.hopIn = null;
      }
      b.setTranslation({ x: px, y: py, z: pz }, true);
      const vv = veh.body.linvel();
      b.setLinvel({ x: vv.x, y: vv.y, z: vv.z }, true);
      this.yaw = o.yaw; this.grounded = true; this.speed = 0; this.idle += DT;
      if (this.barkT < 0 && Math.hypot(vv.x, vv.z) > 12) { this.say(1); this.barkT = 6 + Math.random() * 8; } // wheee
      return;
    }

    // carried by someone
    const holder = this.holder();
    this.carried = !!holder;
    if (this.carried) {
      if (!this.wasCarried) { this.game.audio?.play('squeak', t, 1, { pitch: 1.1 }); this.mood = 1; }
      this.wasCarried = true; this.idle = 0; this.sit = 0;
      return;
    }
    if (this.wasCarried) { this.wasCarried = false; this.hopCool = 0.4; }

    // lost: fell out of the world, or too far away for too long
    const dx = oc.x - t.x, dz = oc.z - t.z, dist = Math.hypot(dx, dz), dyO = (oc.y - 0.75) - (t.y - d.r);
    if (t.y < -20 || dist > 45) { this.teleportNear(); this.say(1); return; }
    if (dist > 14) this.farT += DT; else this.farT = Math.max(0, this.farT - DT * 2);
    if (this.farT > 6) { this.teleportNear(); this.say(1); return; }
    // can't get there (upstairs, over a wall, up a ladder): not getting any closer for a while
    const d3 = Math.hypot(dx, dyO, dz);
    if (d3 < this.best - 0.4 || d3 < 2.2) { this.best = d3; this.noProgress = 0; }
    else if ((this.noProgress = (this.noProgress || 0) + DT) > 4) { this.best = 1e9; this.noProgress = 0; this.teleportNear(); this.say(1); return; }

    // ground probe
    const ray = new RAPIER.Ray({ x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 });
    const hit = g.physics.world.castRay(ray, d.r + 0.14, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, GROUND_Q, this.collider, b);
    this.grounded = !!hit;
    const wet = this.obj.wet || 0, swimming = wet > 0.25 && !this.grounded;

    // where to go: a spot behind and to the side of the owner
    const sideK = this.owner.index % 2 ? 1 : -1;
    const sitting = o.seat && !o.seat.vehicle;
    const back = sitting ? -0.9 : 1.1;
    const tx = oc.x - Math.sin(o.yaw) * back + Math.cos(o.yaw) * 0.55 * sideK;
    const tz = oc.z - Math.cos(o.yaw) * back - Math.sin(o.yaw) * 0.55 * sideK;
    const ex = tx - t.x, ez = tz - t.z, ed = Math.hypot(ex, ez);
    const ownerSpeed = Math.hypot(o.chest.linvel().x, o.chest.linvel().z);
    let want = 0;
    if (ed > 0.45) want = Math.min(d.speed * (swimming ? 0.45 * (d.swim || 1) : 1), Math.max(ownerSpeed * 1.05, (ed - 0.35) * 2.6));
    if (dist < 0.9) want = Math.max(want, 1.2); // don't get trodden on: step aside
    const wx = ed > 1e-3 ? ex / ed * want : 0, wz = ed > 1e-3 ? ez / ed * want : 0;
    const k = Math.min(1, (this.grounded ? 10 : swimming ? 3 : 1.5) * DT);
    let nvx = v.x + (wx - v.x) * k, nvz = v.z + (wz - v.z) * k, nvy = v.y;
    const hs = Math.hypot(v.x, v.z);
    // hop: blocked (kerb, step, stairs), the owner is above us, or (bunny) always
    if (want > 0.8 && hs < want * 0.35) this.stuck += DT; else this.stuck = Math.max(0, this.stuck - DT);
    const canHop = (this.grounded || (wet > 0.1 && t.y > (g.physics.waterLevel(t.x, t.y, t.z) ?? -99) - 0.3)) && this.hopCool <= 0;
    if (canHop && ((this.stuck > 0.15) || (dyO > 0.35 && dist < 5 && want > 0.3) || (this.kind === 'bunny' && want > 1.2 && this.grounded))) {
      nvy = this.kind === 'bunny' && this.stuck <= 0.15 && dyO < 0.35 ? 2.6 : 4.4;
      this.hopCool = this.kind === 'bunny' ? 0.18 : 0.45; this.stuck = 0;
      this.squashV = -3;
    }
    b.setLinvel({ x: nvx, y: nvy, z: nvz }, true);
    this.speed = hs; this.swimming = swimming;
    // facing
    if (hs > 0.5) this.yaw = Math.atan2(v.x, v.z);
    else if (dist > 0.3) this.yaw = Math.atan2(dx, dz);
    // idle / sit
    if (hs < 0.4 && this.grounded) this.idle += DT; else this.idle = 0;
    // chatter
    if (dist > 10) this.awayT = (this.awayT || 0) + DT;
    else { if ((this.awayT || 0) > 4 && dist < 4) this.say(2); this.awayT = 0; }
    if (this.barkT < 0) { if (dist < 12) this.say(1 + (Math.random() < 0.3)); this.barkT = 8 + Math.random() * 14; }
    // landings squash
    if (this.prevVy < -2.5 && v.y > -0.5) this.squashV += Math.min(6, -this.prevVy) * 0.9;
    this.prevVy = v.y;
  }

  // ---- visuals (every frame) ---------------------------------------------------
  animate(dt) {
    const L = this.looks, d = this.def;
    dt = Math.min(dt, 0.05);
    this.mood = Math.max(0, this.mood - dt * 0.5);
    let dy = this.yaw - this.visYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const turn = dy;
    this.visYaw += dy * Math.min(1, dt * 10);
    L.yaw.rotation.y = this.visYaw;
    const sp = this.ride ? 0 : this.speed;
    const moving = Math.min(1, sp / 2.5);
    const gait = this.kind === 'bunny' ? 9 : this.kind === 'penguin' ? 16 : 12;
    this.phase += dt * (this.swimming ? 14 : this.carried ? 18 : sp * gait / 2.2 + 0.0001);
    const ph = this.phase;
    // sitting blends in after standing still
    const sitT = this.carried ? 0 : this.ride ? 1 : this.idle > 1.0 ? 1 : 0;
    this.sit += (sitT - this.sit) * Math.min(1, dt * 5);
    const s = this.sit;
    // squash spring
    this.squashV += (-this.squash * 160 - this.squashV * 9) * dt;
    this.squash += this.squashV * dt;
    const q = Math.max(-0.3, Math.min(0.3, this.squash * 0.05));
    // torso
    const T = L.torso;
    let bob = 0, roll = 0, pitch = 0;
    if (this.kind === 'penguin') { roll = Math.sin(ph) * 0.22 * moving; bob = Math.abs(Math.sin(ph)) * 0.025 * moving; pitch = this.swimming ? 1.25 : 0; }
    else if (this.kind === 'bunny') { pitch = -Math.sin(ph) * 0.15 * moving; }
    else { bob = Math.abs(Math.sin(ph)) * 0.03 * moving; roll = Math.sin(ph) * 0.05 * moving; }
    if (this.carried) { roll = Math.sin(ph * 0.5) * 0.25; pitch = 0.2; }
    roll += -turn * 0.4 * moving;
    if (this.kind !== 'penguin') pitch += -s * 0.42;
    T.position.y = bob - s * (this.kind === 'penguin' ? 0.04 : 0.02);
    T.position.z = s * (this.kind === 'penguin' ? 0 : -0.03);
    T.rotation.set(pitch, 0, roll);
    T.scale.set(1 - q * 0.6, 1 + q, 1 - q * 0.6);
    // head lags a little and looks around when idle
    const hd = this.head;
    hd.vx += (-hd.x * 120 - hd.vx * 10 + turn * 40 * moving) * dt; hd.x += hd.vx * dt;
    hd.vy += (-hd.y * 120 - hd.vy * 9 + this.squashV * 1.5) * dt; hd.y += hd.vy * dt;
    L.head.position.copy(L.headBase);
    L.head.position.y += hd.y * 0.02 + s * (this.kind === 'penguin' ? 0 : 0.05);
    const look = this.idle > 2 ? Math.sin(this.t * 0.7) * 0.5 : 0;
    L.head.rotation.set(-pitch * 0.8 + (this.carried ? -0.3 : 0) + Math.sin(this.t * 1.7) * 0.04, hd.x * 0.5 + look, -roll * 0.5 + (this.mood > 0.5 ? Math.sin(this.t * 9) * 0.1 : 0));
    // ears / flippers: damped springs kicked by bobbing and squash
    L.ears.forEach((e, i) => {
      const st = this.ears[i];
      const kick = this.squashV * 0.6 + Math.cos(ph * 2) * moving * 4 + (this.carried ? Math.sin(ph + i) * 6 : 0);
      st.v += (-st.a * 90 - st.v * 6 + kick) * dt; st.a += st.v * dt;
      const sd = e.userData.side;
      if (e.userData.flipper) { e.rotation.z = sd * (0.25 + Math.abs(st.a) * 0.4 + moving * 0.35 * (0.5 + 0.5 * Math.sin(ph))) + (this.swimming ? sd * Math.sin(ph) * 0.7 : 0); e.rotation.x = st.a * 0.3; }
      else if (this.kind === 'dog') { e.rotation.z = sd * (0.25 + st.a * 0.25); e.rotation.x = -0.1 + st.a * 0.3 - moving * 0.35; }
      else { e.rotation.x = st.a * 0.25 - moving * 0.25 + (this.kind === 'bunny' ? -s * 0.2 : 0); e.rotation.z = -sd * (this.kind === 'cat' ? 0.25 : 0.12) + st.a * 0.08 * sd; }
    });
    // tail
    const wag = (this.mood > 0.2 || this.idle > 0.5 ? 1 : 0.4) * (this.carried ? 1.5 : 1);
    if (this.kind === 'dog') { L.tail.rotation.set(-0.7 + s * 0.4, 0, Math.sin(this.t * 14) * 0.6 * wag); }
    else if (this.kind === 'cat') { L.tail.rotation.set(-0.3 - s * 0.9, 0, Math.sin(this.t * 2.2) * 0.35); L.extra[0].rotation.x = -0.7 + Math.sin(this.t * 2.2 + 1) * 0.3; }
    else L.tail.rotation.set(0, 0, Math.sin(this.t * 10) * 0.25 * wag);
    // legs
    L.legs.forEach((lg, i) => {
      lg.position.copy(this.looks.legBase[i]);
      const front = i < 2, left = i % 2 === 0;
      let a;
      if (this.carried) a = Math.sin(ph + i * 1.7) * 0.7;
      else if (this.swimming) a = Math.sin(ph + (left ? 0 : Math.PI) + (front ? 0 : 1)) * 0.8;
      else if (this.kind === 'bunny') a = (front ? 1 : -1) * Math.sin(ph) * 0.6 * moving;
      else if (this.kind === 'penguin') { a = Math.sin(ph + (left ? 0 : Math.PI)) * 0.3 * moving; lg.position.y += Math.max(0, Math.sin(ph + (left ? 0 : Math.PI))) * 0.03 * moving; }
      else a = Math.sin(ph + ((front === left) ? 0 : Math.PI)) * 0.65 * moving;
      // sitting: back legs fold forward under the body, front legs stay straight
      if (this.kind !== 'penguin') {
        if (!front) { a = a * (1 - s) - s * 1.25; lg.position.y += s * 0.05; }
        else a = a * (1 - s) + s * 0.42;
      }
      lg.rotation.set(a, 0, 0);
    });
  }

  destroy() {
    for (const p of this.game.players) for (const h of ['L', 'R']) if (p.hands?.[h]?.body === this.body) p.releaseHand(h);
    const ph = this.game.physics;
    for (const c of this.obj.colliders) ph.handleOwner.delete(c.handle);
    if (this.obj.rec) ph.untrack(this.obj.rec);
    ph.objects.splice(ph.objects.indexOf(this.obj), 1);
    ph.world.removeRigidBody(this.body);
    this.game.scene.remove(this.looks.root);
    this.looks.root.traverse((o) => o.geometry?.dispose());
  }
}

// ---- manager -----------------------------------------------------------------
export function buildPets(game) {
  const list = [];
  const of = (p) => list.find((q) => q.owner === p) || null;
  const sync = () => {
    for (let i = list.length - 1; i >= 0; i--) {
      const pet = list[i], p = pet.owner;
      const want = game.players.includes(p) ? petsOf(p.deviceId).active : null;
      if (want !== pet.kind) { pet.destroy(); list.splice(i, 1); }
    }
    for (const p of game.players) {
      if (!p.chest || of(p)) continue;
      const kind = petsOf(p.deviceId).active;
      if (kind && PET_KINDS[kind]) list.push(new Pet(game, p, kind));
    }
  };
  let n = 0;
  game.steppers.push(() => {
    if (++n % 15 === 0) sync();
    for (const pet of list) pet.step();
  });
  game.updaters.push((dt) => { for (const pet of list) pet.animate(dt); });
  game.pets = { list, of, sync, call: (p) => { const pet = of(p); if (pet) { pet.teleportNear(); pet.say(2); } } };
}
