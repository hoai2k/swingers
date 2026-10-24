// Things that make noise: a jukebox with two little synth tunes, a playable
// piano (sit on the bench) and vending machines that spit out cans.
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { Builder } from '../mesh.js';
import { addSeat } from './playground.js';
import { useSpot, audio, tone, NOTE, clunk, throwable, place } from './common.js';

const SONGS = [
  { bpm: 150, wave: 'square', lead: [67, 0, 72, 0, 76, 0, 72, 0, 74, 0, 77, 0, 74, 0, 71, 0, 72, 0, 76, 0, 79, 0, 76, 0, 74, 72, 71, 72, 74, 0, 0, 0],
    bass: [48, 55, 48, 55, 43, 50, 43, 50, 48, 55, 48, 55, 43, 50, 43, 48] },
  { bpm: 120, wave: 'triangle', lead: [64, 0, 67, 69, 71, 0, 69, 67, 64, 0, 62, 64, 67, 0, 0, 0, 60, 0, 64, 67, 69, 0, 67, 64, 62, 0, 60, 62, 64, 0, 0, 0],
    bass: [45, 52, 45, 52, 43, 50, 43, 50, 41, 48, 41, 48, 43, 50, 43, 50] },
];

export function jukebox(game, L, lx, lz, lyaw) {
  const c = Math.cos(lyaw), s = Math.sin(lyaw);
  const at = (ax, az) => [lx + ax * c + az * s, lz - ax * s + az * c];
  const V = (ax, az, y) => { const [p, q] = at(ax, az); return L.v3(p, y, q); };
  L.box(lx, 0.7, lz, 0.95, 1.4, 0.6, 0x8a2a4a, { yaw: lyaw });
  L.cyl(lx, 1.4, lz, 0.475, 0.6, 0xffd23f, { euler: [Math.PI / 2, lyaw, 0], seg: 16 });
  let [a, b] = at(0, 0.31); L.deco(a, 1.0, b, 0.7, 0.55, 0.03, 0xff8a3d, { yaw: lyaw });
  [a, b] = at(0, 0.33); L.deco(a, 1.0, b, 0.55, 0.4, 0.03, 0xffe9a0, { yaw: lyaw });
  [a, b] = at(0, 0.32); L.deco(a, 0.35, b, 0.75, 0.3, 0.03, 0x3af0ff, { yaw: lyaw });
  for (const sd of [-1, 1]) { [a, b] = at(sd * 0.42, 0.31); L.deco(a, 0.8, b, 0.08, 1.2, 0.03, 0x3af0ff, { yaw: lyaw }); }
  const pos = V(0, 0.8, 1.0);
  const src = L.v3(lx, 1.0, lz);
  const state = { song: -1, step: 0, next: 0 };
  const spot = useSpot(game, pos.x, pos.y, pos.z, 'Play jukebox', () => {
    state.song = state.song + 1 >= SONGS.length ? -1 : state.song + 1;
    state.step = 0; state.next = 0;
    spot.label = state.song < 0 ? 'Play jukebox' : state.song + 1 < SONGS.length ? 'Next song' : 'Stop music';
    clunk(game, src, 0.3);
  });
  game.jukeboxes = (game.jukeboxes || 0) + 1;
  game.updaters.push(() => {
    const a = audio(game);
    if (!a || state.song < 0) return;
    const S = SONGS[state.song], dt = 60 / S.bpm / 2, now = a.ctx.currentTime;
    if (state.next < now) state.next = now + 0.05;
    const g = a.gainAt(src);
    while (state.next < now + 0.3) {
      const i = state.step % S.lead.length, when = state.next - now;
      if (g > 0.02) {
        const n = S.lead[i];
        if (n) a.tone(S.wave, NOTE(n), NOTE(n), dt * 1.6, 0.05 * g, when);
        if (i % 2 === 0) { const bn = S.bass[(i / 2) % S.bass.length]; a.tone('triangle', NOTE(bn), NOTE(bn), dt * 1.8, 0.09 * g, when); }
        if (i % 4 === 2) a.burst?.(0.05, 0.04 * g, 6000, 1, 'highpass', when);
      }
      state.step++; state.next += dt;
    }
  });
  return spot;
}

// Upright piano against a wall, facing local yaw `lyaw`; sit on the bench to play.
export function piano(game, L, lx, lz, lyaw) {
  const c = Math.cos(lyaw), s = Math.sin(lyaw);
  const at = (ax, az) => [lx + ax * c + az * s, lz - ax * s + az * c];
  const V = (ax, az, y) => { const [p, q] = at(ax, az); return L.v3(p, y, q); };
  L.box(lx, 0.65, lz, 1.5, 1.3, 0.55, 0x2a1a14, { yaw: lyaw });
  let [a, b] = at(0, 0.42); L.box(a, 0.78, b, 1.5, 0.08, 0.32, 0x2a1a14, { yaw: lyaw });
  [a, b] = at(0, 0.44); L.deco(a, 0.83, b, 1.36, 0.03, 0.26, 0xffffff, { yaw: lyaw });
  for (let i = 0; i < 14; i++) {
    if ([2, 6, 9, 13].includes(i % 14)) continue;
    [a, b] = at(-0.62 + i * 0.097 + 0.048, 0.38); L.deco(a, 0.86, b, 0.05, 0.03, 0.15, 0x111111, { yaw: lyaw });
  }
  [a, b] = at(0, 0.3); L.deco(a, 1.15, b, 0.4, 0.25, 0.02, 0xf2e4c8, { yaw: lyaw });
  const [bx, bz] = at(0, 1.05);
  L.box(bx, 0.24, bz, 0.95, 0.48, 0.36, 0x2a1a14, { yaw: lyaw });
  const sp = L.v3(bx, 0.62, bz), ex = V(0, 1.9, 0.3);
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const play = (n, chord) => {
    const p = L.v3(lx, 1, lz);
    const notes = chord ? [n, n + (([62, 64, 69, 71].includes(n % 12 + 60)) ? 3 : 4), n + 7] : [n];
    for (const m of notes) { tone(game, p, NOTE(m), NOTE(m), 0.9, 0.18, 'triangle'); tone(game, p, NOTE(m + 12), NOTE(m + 12), 0.4, 0.05, 'sine'); }
  };
  return addSeat(game, {
    body: game.physics.staticBody, pos: [sp.x, sp.y, sp.z], yaw: L.yaw + lyaw + Math.PI, label: 'Play piano',
    hint: 'A note (aim with stick) · X chord · LT/RT low/high · Y exit', exit: [ex.x, ex.y, ex.z],
    control(inp, pr) {
      const m = Math.hypot(inp.moveX || 0, inp.moveY || 0);
      const k = m < 0.4 ? 0 : (Math.round(((Math.atan2(inp.moveX, inp.moveY) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8);
      const n = scale[k];
      if (pr.jump) play(n);
      if (pr.punch) play(n - 12, true);
      if (pr.grabL) play(n - 12);
      if (pr.grabR) play(n + 12);
    },
  });
}

// Vending machine facing local yaw lyaw: Y buys a can (it drops out the front).
const CAN_COLS = [0xff3a3a, 0x3f8cff, 0x55d85a, 0xffd23f, 0xff8a3d];
export function vendingMachine(game, L, lx, lz, lyaw, color = 0xff3a3a) {
  const c = Math.cos(lyaw), s = Math.sin(lyaw);
  const at = (ax, az) => [lx + ax * c + az * s, lz - ax * s + az * c];
  const V = (ax, az, y) => { const [p, q] = at(ax, az); return L.v3(p, y, q); };
  L.box(lx, 0.95, lz, 1.0, 1.9, 0.75, color, { yaw: lyaw });
  let [a, b] = at(-0.15, 0.38); L.deco(a, 1.2, b, 0.6, 1.2, 0.02, 0xd9f2ff, { yaw: lyaw });
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    [a, b] = at(-0.37 + k * 0.15, 0.39); L.deco(a, 0.75 + r * 0.28, b, 0.09, 0.18, 0.02, CAN_COLS[(r + k) % CAN_COLS.length], { yaw: lyaw });
  }
  [a, b] = at(0.33, 0.39); L.deco(a, 1.3, b, 0.2, 0.5, 0.02, 0x333333, { yaw: lyaw });
  [a, b] = at(0, 0.39); L.deco(a, 0.3, b, 0.7, 0.22, 0.02, 0x111111, { yaw: lyaw });
  [a, b] = at(0, 0.38); L.deco(a, 1.75, b, 0.9, 0.18, 0.02, 0xffffff, { yaw: lyaw });
  const spot = V(0, 1.0, 1.0);
  const slot = V(0, 0.55, 0.35);
  const fwd = { x: Math.sin(L.yaw + lyaw), z: Math.cos(L.yaw + lyaw) };
  const cans = [];
  let cool = 0, n = 0;
  game.steppers.push(() => { cool -= 1 / 60; });
  return useSpot(game, spot.x, spot.y, spot.z, 'Buy a drink', () => {
    if (cool > 0) return;
    cool = 0.5;
    let o;
    if (cans.length < 5) {
      const bb = new Builder(), col = CAN_COLS[n++ % CAN_COLS.length];
      bb.cyl(0.085, 0.085, 0.26, col, [0, 0, 0], null, 12);
      bb.cyl(0.07, 0.085, 0.02, 0xdddddd, [0, 0.14, 0], null, 12);
      bb.box(0.172, 0.06, 0.1, 0xffffff, [0, 0, 0.04]);
      o = game.physics.dynamic(slot, [RAPIER.ColliderDesc.cylinder(0.13, 0.085).setMass(0.35).setRestitution(0.3)], bb.mesh(), { angDamp: 0.3 });
      game.scene.add(o.mesh);
      throwable(game, o, { r: 0.12, speed: 10, up: 0.25 });
      cans.push(o);
    } else { o = cans.shift(); cans.push(o); }
    place(o.body, slot, { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
    o.body.setLinvel({ x: fwd.x * 1.6, y: 0.5, z: fwd.z * 1.6 }, true);
    clunk(game, slot, 0.6);
    tone(game, slot, 880, 1320, 0.12, 0.1, 'sine', 0.15);
  });
}
