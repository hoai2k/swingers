// Shared helpers for interactive world content: building-local placement,
// stairs and walls with openings, swinging doors, "use" spots (Y), punch-to-
// throw objects, live signs and little synthesized sound effects.
import * as THREE from 'three';
import { RAPIER, yawQuat } from '../physics.js';
import { DT, G_PROP, G_STATIC, ALL, groups, VEH_GROUPS } from '../config.js';
import { Builder } from '../mesh.js';
import { addSeat } from './playground.js';

// Props that ignore the static world (doors, lids: their joints hold them).
export const NO_STATIC = groups(G_PROP, ALL & ~G_STATIC);
export { VEH_GROUPS };

// ---- building-local placement -------------------------------------------
// A frame at (x, z) turned by yaw (local +Z = front), floor at y0.
export class Local {
  constructor(kit, x, z, yaw = 0, y0 = 0) {
    this.kit = kit; this.x = x; this.z = z; this.yaw = yaw; this.y0 = y0;
    this.c = Math.cos(yaw); this.s = Math.sin(yaw);
  }
  w(lx, lz) { return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c]; }
  v3(lx, ly, lz) { const [x, z] = this.w(lx, lz); return { x, y: this.y0 + ly, z }; }
  // world yaw of a local direction / local yaw
  wyaw(ly = 0) { return this.yaw + ly; }
  o(opts) {
    const o = { ...opts };
    if (o.euler) o.euler = [o.euler[0], o.euler[1] + this.yaw, o.euler[2]];
    else o.yaw = this.yaw + (o.yaw || 0);
    return o;
  }
  box(lx, y, lz, w, h, d, color, opts = {}) { const [x, z] = this.w(lx, lz); this.kit.box(x, this.y0 + y, z, w, h, d, color, this.o(opts)); return this; }
  // Collider only (invisible), e.g. behind a railing made of thin bars.
  solid(lx, y, lz, w, h, d, opts = {}) { const [x, z] = this.w(lx, lz); this.kit.phys.box(x, this.y0 + y, z, w, h, d, { ...opts, yaw: this.yaw + (opts.yaw || 0) }); return this; }
  // Railing of posts and rails along a local line with an invisible wall collider.
  rail(ax, az, bx, bz, y, h = 1.0, color = 0x777777) {
    const len = Math.hypot(bx - ax, bz - az), ly = Math.atan2(bx - ax, bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    this.deco(mx, y + h, mz, 0.07, 0.07, len, color, { yaw: ly });
    this.deco(mx, y + h * 0.5, mz, 0.05, 0.05, len, color, { yaw: ly });
    const n = Math.max(1, Math.round(len / 1.0));
    for (let i = 0; i <= n; i++) this.deco(ax + (bx - ax) * i / n, y + h / 2, az + (bz - az) * i / n, 0.06, h, 0.06, color);
    this.solid(mx, y + h / 2, mz, 0.08, h, len, { yaw: ly });
    return this;
  }
  deco(lx, y, lz, w, h, d, color, opts = {}) { return this.box(lx, y, lz, w, h, d, color, { ...opts, collide: false }); }
  cyl(lx, y, lz, r, h, color, opts = {}) {
    const [x, z] = this.w(lx, lz);
    const o = { ...opts };
    if (o.euler) o.euler = [o.euler[0], o.euler[1] + this.yaw, o.euler[2]];
    this.kit.cyl(x, this.y0 + y, z, r, h, color, o); return this;
  }
  sphere(lx, y, lz, r, color, opts = {}) { const [x, z] = this.w(lx, lz); this.kit.sphere(x, this.y0 + y, z, r, color, opts); return this; }

  // Straight wall from local (ax, az) to (bx, bz) with door/arch holes
  // [{ at (distance from a to the hole centre), w, h }].
  wall(ax, az, bx, bz, h, t, color, holes = [], y = 0) {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const ly = Math.atan2(ux, uz);
    const seg = (s0, s1, yb, hh) => {
      if (s1 - s0 < 0.01 || hh < 0.01) return;
      const m = (s0 + s1) / 2;
      this.box(ax + ux * m, y + yb + hh / 2, az + uz * m, t, hh, s1 - s0, color, { yaw: ly });
    };
    let cur = 0;
    for (const hole of [...holes].sort((a, b) => a.at - b.at)) {
      const s0 = hole.at - hole.w / 2, s1 = hole.at + hole.w / 2;
      seg(cur, s0, 0, h);
      seg(s0, s1, hole.h, h - hole.h);
      if (hole.sill) seg(s0, s1, 0, hole.sill);
      cur = s1;
    }
    seg(cur, len, 0, h);
    return this;
  }
  // Window glass + frame on both faces of a wall line.
  window(ax, az, bx, bz, at, y, w, h, t, glass = 0x9fd8ff, frame = 0xffffff) {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const ly = Math.atan2(ux, uz), nx = uz, nz = -ux;
    for (const sd of [1, -1]) {
      const off = sd * (t / 2 + 0.02);
      const cx = ax + ux * at + nx * off, cz = az + uz * at + nz * off;
      this.deco(cx, y, cz, 0.06, h + 0.2, w + 0.2, frame, { yaw: ly });
      this.deco(cx + nx * sd * 0.02, y, cz + nz * sd * 0.02, 0.04, h, w, glass, { yaw: ly });
      this.deco(cx + nx * sd * 0.04, y, cz + nz * sd * 0.04, 0.04, 0.06, w, frame, { yaw: ly });
    }
    return this;
  }
  // Steps from local (ax, az, ay) up to (bx, bz, by).
  stairs(ax, az, ay, bx, bz, by, width, cA, cB = cA, rise = 0.3) {
    const n = Math.max(2, Math.round((by - ay) / rise));
    const run = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / run, uz = (bz - az) / run;
    const ly = Math.atan2(ux, uz), depth = run / n;
    for (let i = 0; i < n; i++) {
      const top = ay + (i + 1) * (by - ay) / n, m = (i + 0.5) * depth;
      this.box(ax + ux * m, top - 0.12, az + uz * m, width, 0.24, depth + 0.02, i % 2 ? cB : cA, { yaw: ly });
    }
    return this;
  }
}

// ---- doors ----------------------------------------------------------------
// A swinging physics door: hinge at world (hx, y0, hz), panel extending along
// world yaw direction (body +X) for `width`. Returns to closed on a soft spring.
export function addDoor(game, hx, y0, hz, yawW, width, height, color, opts = {}) {
  const W = game.physics.world;
  const rot = yawQuat(yawW);
  const hinge = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hx, y0 + height / 2, hz).setRotation(rot));
  const b = new Builder();
  const th = opts.thick || 0.08;
  b.rbox(width, height, th, 0.03, color, [0, 0, 0]);
  b.box(width * 0.8, height * 0.3, th + 0.02, new THREE.Color(color).multiplyScalar(0.85).getHex(), [0, height * 0.2, 0]);
  b.box(width * 0.8, height * 0.3, th + 0.02, new THREE.Color(color).multiplyScalar(0.85).getHex(), [0, -height * 0.2, 0]);
  for (const sd of [1, -1]) b.sphere(0.06, 0xffd23f, [width / 2 - 0.15, -0.1, sd * (th / 2 + 0.05)], null, 8);
  if (opts.glass) b.box(width * 0.6, height * 0.3, th + 0.03, 0x9fd8ff, [0, height * 0.2, 0]);
  const c = Math.cos(yawW), s = Math.sin(yawW);
  const pos = { x: hx + c * width / 2, y: y0 + height / 2, z: hz - s * width / 2 };
  const o = game.physics.dynamic(pos, [RAPIER.ColliderDesc.cuboid(width / 2, height / 2, th / 2).setMass(opts.mass || 14).setFriction(0.4)],
    b.mesh(), { rot, groups: NO_STATIC, kind: 'door', buoy: null, angDamp: 0.6 });
  game.scene.add(o.mesh);
  const j = W.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: -width / 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), hinge, o.body, true);
  j.setContactsEnabled?.(false);
  j.setLimits(-(opts.limit ?? 1.7), opts.limit ?? 1.7);
  j.configureMotorPosition(0, opts.spring ?? 40, opts.damp ?? 14);
  o.joint = j;
  return o;
}

// ---- use spots ----------------------------------------------------------
// A "seat" that runs fn(player) on Y instead of seating the player.
export function useSpot(game, x, y, z, label, fn) {
  return addSeat(game, { body: game.physics.staticBody, pos: [x, y, z], label, use: fn, kind: 'use' });
}

// ---- sound ---------------------------------------------------------------
export function audio(game) {
  const a = game.audio;
  return a && a.ctx && a.ctx.state === 'running' && a.tone ? a : null;
}
export function tone(game, pos, f0, f1, dur, vol, type = 'triangle', when = 0) {
  const a = audio(game); if (!a) return;
  const v = a.gainAt(pos) * vol; if (v < 0.01) return;
  a.tone(type, f0, f1, dur, v, when);
}
export const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz
export function chime(game, pos, notes = [72, 76, 79, 84], vol = 0.2) {
  notes.forEach((n, i) => tone(game, pos, NOTE(n), NOTE(n), 0.25, vol, 'triangle', i * 0.09));
}
export function clunk(game, pos, vol = 0.5) {
  const a = audio(game); if (!a) return;
  const v = a.gainAt(pos) * vol; if (v < 0.01) return;
  a.burst?.(0.12, 0.4 * v, 400); a.tone('sine', 120, 60, 0.15, 0.3 * v);
}

// ---- live text sign (canvas texture you can update) -----------------------
export function liveSign(game, width, height, bg = '#223', fg = '#ffd23f') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * height / width);
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex }));
  game.scene.add(mesh);
  let last = null;
  const set = (lines) => {
    const key = [].concat(lines).join('|');
    if (key === last) return; last = key;
    const L = [].concat(lines);
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(6, 6, cv.width - 12, cv.height - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.min(cv.height / (L.length + 0.4), 90);
    g.font = `900 ${fs}px Trebuchet MS, sans-serif`;
    L.forEach((t, i) => g.fillText(t, cv.width / 2, cv.height * (i + 0.5) / L.length + 2));
    tex.needsUpdate = true;
  };
  return { mesh, set };
}

// ---- punch to throw ---------------------------------------------------------
// Objects registered here fly when a player punches while holding them (or
// standing right next to them). opts: { speed, up (radians), aim(p, body) -> {x,y,z}|null }
export function throwable(game, obj, opts = {}) {
  if (!game.throwables) {
    game.throwables = [];
    game.steppers.push(() => throwStep(game));
  }
  const t = { body: obj.body, r: opts.r ?? 0.3, speed: opts.speed ?? 8, up: opts.up ?? 0.45, aim: opts.aim, spin: opts.spin ?? 6, onThrow: opts.onThrow };
  game.throwables.push(t);
  return t;
}
const _fw = new THREE.Vector3();
function throwStep(game) {
  for (const p of game.players) {
    if (!p.punch || p.punch.t < 0.31 || p.state !== 'normal') continue; // punch started this step
    let best = null, bd = 1e9, hand = null;
    for (const h of ['L', 'R']) {
      const hb = p.hands[h].body;
      if (!hb) continue;
      const t = game.throwables.find((q) => q.body === hb);
      if (t) { best = t; hand = h; break; }
    }
    if (!best) {
      const c = p.chest.translation(), fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      for (const t of game.throwables) {
        const b = t.body.translation();
        const dx = b.x - c.x, dy = b.y - c.y, dz = b.z - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > 0.75 + t.r || dx * fx + dz * fz < 0 || dy < -1.1) continue;
        if (d < bd) { bd = d; best = t; }
      }
    }
    if (!best) continue;
    if (hand) { p.releaseHand(hand); p.hands[hand].cool = 0.5; }
    // let go with the other hand too if it holds the same thing
    for (const h of ['L', 'R']) if (p.hands[h].body === best.body) { p.releaseHand(h); p.hands[h].cool = 0.5; }
    const b = best.body;
    if (!hand) { // lift it to hand height so it clears the ground
      const t = b.translation(), c = p.chest.translation();
      if (t.y < c.y - 0.3 && best.up > 0.1) b.setTranslation({ x: t.x, y: c.y - 0.1, z: t.z }, true);
    }
    let v = best.aim ? best.aim(p, best.body) : null;
    if (!v) {
      const sp = best.speed, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      v = { x: fx * sp * Math.cos(best.up), y: sp * Math.sin(best.up), z: fz * sp * Math.cos(best.up) };
    }
    b.setLinvel(v, true);
    _fw.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)).multiplyScalar(best.spin);
    b.setAngvel({ x: _fw.x, y: 0, z: _fw.z }, true);
    b.wakeUp();
    p.punch.hit = true;
    best.onThrow?.(p);
    game.audio?.play('swish', b.translation());
  }
}

// Initial velocity that lobs a ball from `from` to `to` at launch angle `ang`.
export function lob(from, to, ang) {
  const dx = to.x - from.x, dz = to.z - from.z, D = Math.hypot(dx, dz), H = to.y - from.y;
  for (let a = ang; a < 1.45; a += 0.05) {
    const den = 2 * Math.cos(a) ** 2 * (D * Math.tan(a) - H);
    if (den <= 0.05) continue;
    const v = Math.sqrt(9.81 * D * D / den);
    return { x: dx / D * v * Math.cos(a), y: v * Math.sin(a), z: dz / D * v * Math.cos(a) };
  }
  return null;
}

// Reset a dynamic body to a pose.
export function place(body, p, rot = { x: 0, y: 0, z: 0, w: 1 }) {
  body.setTranslation(p, true); body.setRotation(rot, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

export { DT };

// ---- ladders ------------------------------------------------------------------
// Push toward a ladder to climb it; at the top you get popped over onto the
// ledge in direction (dx, dz). (x, z) is the ladder's centre line.
export function ladder(game, x, z, y0, y1, dx, dz, halfWidth = 0.45) {
  if (!game.ladders) {
    game.ladders = [];
    game.steppers.push(() => ladderStep(game));
  }
  game.ladders.push({ x, z, y0, y1, dx, dz, hw: halfWidth });
}
function ladderStep(game) {
  for (const p of game.players) {
    if (p.state !== 'normal') continue;
    const d = game.input.get(p.deviceId), st = d && d.state;
    if (!st || Math.hypot(st.moveX || 0, st.moveY || 0) < 0.3) continue;
    const h = p.hips.translation();
    for (const L of game.ladders) {
      const rx = h.x - L.x, rz = h.z - L.z;
      const along = rx * L.dx + rz * L.dz, side = Math.abs(rx * -L.dz + rz * L.dx);
      if (along > 0.3 || along < -1.1 || side > L.hw + 0.3 || h.y < L.y0 - 0.6 || h.y > L.y1 + 0.9) continue;
      if (Math.sin(p.yaw) * L.dx + Math.cos(p.yaw) * L.dz < 0.5) continue; // facing the ladder
      const top = h.y > L.y1 + 0.35;
      const v = top ? { x: L.dx * 2.6, y: 1.5, z: L.dz * 2.6 } : { x: L.dx * 0.6, y: 2.4, z: L.dz * 0.6 };
      for (const b of p.bodies) b.setLinvel(v, true);
      break;
    }
  }
}

// ---- ground height --------------------------------------------------------------
// Height of the actual terrain mesh/collider (3 or 4 m grid per region, two
// triangles per cell split along the b-d diagonal, as built in terrain.js).
// heightAt() is the smooth analytic surface; on curved ground the mesh can sit
// half a metre away from it, which leaves things placed with heightAt floating
// or buried. Works anywhere in the archipelago (sea floor between islands).
export { meshHeight as groundAt } from '../terrain.js';
