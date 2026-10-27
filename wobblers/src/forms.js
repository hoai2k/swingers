// The Magic Tent (Fun Park, west of the drop tower): Y at the crystal ball
// opens a chooser in that player's view; picking a shape turns the player into
// a goat, a velociraptor or a giant grasshopper for FORM_TIME seconds, with a
// magic puff each way and a countdown on their HUD (it flashes for the last
// WARN_TIME seconds while the body flickers between shapes).
//
//   goat         X: charging headbutt (knocks people over, sends props flying), bleats
//   raptor       X: lunge + bite (knocks people over); NPCs within SCARE_R run away; roars
//   grasshopper  A: a huge jump with a long hop forward (soft landings), chirps; X: a little hop
//
// How it works: the physics is the same ragdoll. The human part meshes are
// hidden and each form's meshes follow the ragdoll bodies (body on the hips,
// neck + head on the chest, legs on the legs; goat and grasshopper front legs
// copy the opposite rear leg's swing, shifted forward), so the animal still
// wobbles, ragdolls, swims and sits in vehicles. Animal forms can't grab or
// climb (their triggers do nothing). The player's look (colour, hat, face,
// trousers, outfit) is never touched: turning back just shows the human meshes
// again, so the customiser look comes back exactly.
//
// Hooks elsewhere (all marked "forms.js"): player.js (input filter, walk speed,
// jump height / hop, X attack, sync, respawn and destroy end the form), npc.js
// (raptor flee), ui.js (HUD), world/index.js (builds the tent), map.js (label).
//
// API: game.forms.transform(p, 'goat' | 'raptor' | 'grasshopper'), .revert(p),
// .of(p) (record or null), .scareOf(npc), FORM_TIME. p.form is the live record
// ({ kind, t, ... }) or undefined.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { DT, PLAYER_CSS, FUN_DX, FUN_DZ } from './config.js';
import { Builder, signMesh } from './mesh.js';
import { injectCSS } from './map.js';
import { promptRow, deviceKind } from './glyphs.js';
import { Local, useSpot } from './world/common.js';
import { meshHeight } from './terrain.js';

export const FORM_TIME = 60, WARN_TIME = 5, SCARE_R = 10;
export const TENT = { x: -277 + FUN_DX, z: -33 + FUN_DZ, yaw: Math.PI / 2 }; // door faces east (+x), toward the park's west path

const FORM_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 24, specular: 0x2a2a2a });
const UP = new THREE.Vector3(0, 1, 0);
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _mt = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1), _sc = new THREE.Vector3();
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const KNEE = 0.12 * 0.8, HIP_X = 0.12 * 0.8; // leg part centre to its knee joint (player.js PARTS x S)

// ---- geometry helpers (part-local metres) -------------------------------------------
// Ellipsoid: sphere of radius r scaled by sc, optional euler rotation.
function ell(b, r, color, pos, sc = [1, 1, 1], rot = null, seg = 14) {
  b.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.75 | 0)), color, pos, rot, sc);
}
// Tapered rod from point a to point c (radii r0 at a, r1 at c) with round ends.
function rod(b, a, c, r0, r1, color, seg = 8) {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  b.add(new THREE.CylinderGeometry(r1, r0, len, seg), color, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], q);
  b.sphere(r0, color, a, null, seg);
  b.sphere(r1, color, c, null, seg);
}
// Cone with its tip pointing from base point a toward c.
function spike(b, a, c, r, color, seg = 6) {
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  b.add(new THREE.ConeGeometry(r, len, seg), color, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], q);
}
const mk = (b) => { const m = b.mesh(FORM_MAT); m.castShadow = true; return m; };
const grp = (...kids) => { const g = new THREE.Group(); for (const k of kids) if (k) g.add(k); return g; };
const pivot = (pos, ...kids) => { const g = grp(...kids); g.position.set(pos[0], pos[1], pos[2]); return g; };

// ---- the looks ------------------------------------------------------------------------
// Each returns { parts: { partName: Object3D }, front: { uLeg, lLeg } x2 (optional), D, anim }.
// Part frames: rest pose facing +Z, hips centre 0.48 m above the ground, chest 0.26 m above the hips.
function goatLook() {
  const W = 0xf4f1e8, BR = 0x9a7350, HOOF = 0x3a3340, HORN = 0xcbb68c, EYE = 0xffd23f, DARK = 0x1a1a1a, NOSE = 0x6a5a58, PINK = 0xe8b0a8;
  // hips: the barrel, side patches, a perky tail
  const hb = new Builder();
  ell(hb, 0.25, W, [0, 0.07, 0.17], [0.95, 0.9, 1.75], null, 18);
  for (const s of [-1, 1]) ell(hb, 0.12, BR, [s * 0.17, 0.12, 0.3], [0.5, 0.8, 1.2]);
  ell(hb, 0.11, BR, [0, 0.21, -0.04], [1.0, 0.45, 1.3]);
  spike(hb, [0, 0.2, -0.24], [0, 0.36, -0.33], 0.045, W);
  // chest: neck, then the head on a pivot (dips for the headbutt)
  const nb = new Builder();
  rod(nb, [0, -0.08, 0.45], [0, 0.17, 0.6], 0.11, 0.085, W);
  const head = new Builder();
  ell(head, 0.14, W, [0, 0.04, 0.04], [0.85, 0.9, 1.15]);
  ell(head, 0.1, W, [0, -0.03, 0.19], [0.8, 0.75, 1.2]);
  ell(head, 0.05, NOSE, [0, -0.04, 0.3], [1.1, 0.7, 0.5]);
  for (const s of [-1, 1]) {
    // curved horns sweeping back
    rod(head, [s * 0.05, 0.14, 0.02], [s * 0.08, 0.27, -0.06], 0.035, 0.027, HORN, 7);
    rod(head, [s * 0.08, 0.27, -0.06], [s * 0.1, 0.27, -0.17], 0.027, 0.012, HORN, 7);
    ell(head, 0.07, W, [s * 0.15, 0.08, -0.01], [1.5, 0.42, 0.7], [0, 0, s * -0.35]);   // floppy ears
    ell(head, 0.05, PINK, [s * 0.155, 0.075, 0.0], [1.2, 0.3, 0.5], [0, 0, s * -0.35]);
    ell(head, 0.033, EYE, [s * 0.1, 0.09, 0.12]);
    ell(head, 0.02, DARK, [s * 0.122, 0.09, 0.13], [0.6, 0.4, 1.1]);                    // goat slit pupils
  }
  spike(head, [0, -0.1, 0.17], [0, -0.26, 0.15], 0.04, 0xdedad0);                         // beard
  const headG = pivot([0, 0.2, 0.6], mk(head));
  const chest = grp(mk(nb), headG);
  // legs: thighs and shins with hooves (rear = the ragdoll legs; front legs copy them)
  const thigh = (r0, r1) => { const b = new Builder(); b.cyl(r0, r1, 0.25, W, [0, 0, 0], null, 10); return mk(b); };
  const shin = () => {
    const b = new Builder();
    b.cyl(0.042, 0.036, 0.17, W, [0, 0.02, 0], null, 8);
    b.cyl(0.045, 0.05, 0.06, HOOF, [0, -0.09, 0.005], null, 10);
    return mk(b);
  };
  return {
    parts: { hips: mk(hb), chest, uLegL: thigh(0.075, 0.05), uLegR: thigh(0.075, 0.05), lLegL: shin(), lLegR: shin() },
    front: { uLegL: thigh(0.065, 0.045), uLegR: thigh(0.065, 0.045), lLegL: shin(), lLegR: shin() }, D: 0.44, knee: 0.3, hip: 0.6,
    head: headG,
    anim(L, p, f) {
      // dip the head into a headbutt, otherwise a little nod while walking
      const a = f.atk ? Math.sin(Math.min(1, f.atk.t / 0.42) * Math.PI) : 0;
      L.head.rotation.x = 0.85 * a + Math.sin(p.phase * 2) * 0.05;
      L.head.position.z = 0.6 + 0.08 * a;
    },
  };
}

function raptorLook() {
  const G = 0x4f9a5a, ST = 0x2c5a34, BELLY = 0xe0d6a6, EYE = 0xffcc22, DARK = 0x161616, MOUTH = 0xb33a3a, TOOTH = 0xffffff, CLAW = 0x2a2626;
  // hips: body and a long tail (on its own pivot so it can swish)
  const hb = new Builder();
  ell(hb, 0.22, G, [0, 0.1, 0.04], [0.85, 0.95, 1.6], [-0.15, 0, 0], 16);
  ell(hb, 0.17, BELLY, [0, 0.0, 0.1], [0.8, 0.7, 1.3], [-0.15, 0, 0]);
  for (let i = 0; i < 3; i++) ell(hb, 0.07, ST, [0, 0.29 - i * 0.02, 0.18 - i * 0.16], [1.6, 0.35, 0.5]);
  const tb = new Builder();
  ell(tb, 0.13, G, [0, 0, -0.22], [0.95, 0.95, 2.2], [0.08, 0, 0]);
  spike(tb, [0, 0.03, -0.45], [0, 0.12, -1.2], 0.1, G, 10);
  for (let i = 0; i < 4; i++) ell(tb, 0.06, ST, [0, 0.11 - i * 0.002, -0.15 - i * 0.2], [1.5 - i * 0.25, 0.3, 0.5]);
  const tail = pivot([0, 0.12, -0.22], mk(tb));
  // chest: upper body, little clawed arms, S-neck and the head with a jaw that chomps
  const cb = new Builder();
  ell(cb, 0.17, G, [0, -0.02, 0.12], [0.85, 1.0, 1.25], [0.35, 0, 0]);
  ell(cb, 0.13, BELLY, [0, -0.06, 0.2], [0.75, 0.9, 0.9], [0.35, 0, 0]);
  rod(cb, [0, 0.06, 0.2], [0, 0.3, 0.3], 0.09, 0.075, G);
  for (const s of [-1, 1]) {
    rod(cb, [s * 0.12, -0.02, 0.24], [s * 0.15, -0.1, 0.34], 0.035, 0.03, G, 6);
    rod(cb, [s * 0.15, -0.1, 0.34], [s * 0.13, -0.08, 0.45], 0.03, 0.025, G, 6);
    for (const k of [-1, 0, 1]) spike(cb, [s * 0.13 + k * 0.015, -0.08, 0.46], [s * 0.13 + k * 0.02, -0.13, 0.52], 0.012, CLAW, 5);
  }
  const hd = new Builder();
  ell(hd, 0.12, G, [0, 0.03, 0.04], [0.85, 0.85, 1.25]);
  ell(hd, 0.085, G, [0, 0.03, 0.2], [0.85, 0.6, 1.9]);
  ell(hd, 0.05, ST, [0, 0.085, 0.17], [1.2, 0.25, 2.2]);
  for (const s of [-1, 1]) {
    ell(hd, 0.034, EYE, [s * 0.085, 0.075, 0.08]);
    ell(hd, 0.022, DARK, [s * 0.105, 0.075, 0.088], [0.5, 1.2, 0.7]);                 // slit pupils
    ell(hd, 0.03, ST, [s * 0.08, 0.115, 0.07], [1.3, 0.5, 1.4]);                      // brow ridge
    for (let k = 0; k < 5; k++) spike(hd, [s * 0.058, 0.0, 0.11 + k * 0.045], [s * 0.058, -0.045, 0.115 + k * 0.045], 0.012, TOOTH, 4);
  }
  ell(hd, 0.06, MOUTH, [0, -0.005, 0.2], [0.8, 0.2, 1.8]);
  const jb = new Builder();
  ell(jb, 0.07, G, [0, -0.04, 0.16], [0.8, 0.4, 2.0]);
  ell(jb, 0.055, MOUTH, [0, -0.015, 0.16], [0.8, 0.2, 1.8]);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) spike(jb, [s * 0.045, -0.02, 0.1 + k * 0.045], [s * 0.045, 0.02, 0.105 + k * 0.045], 0.011, TOOTH, 4);
  const jaw = pivot([0, -0.01, 0.0], mk(jb));
  const headG = pivot([0, 0.33, 0.32], mk(hd), jaw);
  const chest = grp(mk(cb), headG);
  // legs: big thighs, thin shins, three-toed feet with the famous sickle claw
  const thigh = () => { const b = new Builder(); ell(b, 0.1, G, [0, 0.02, 0.03], [0.85, 1.45, 1.15]); return mk(b); };
  const shin = () => {
    const b = new Builder();
    rod(b, [0, 0.11, 0], [0, -0.07, -0.02], 0.045, 0.034, G, 8);
    ell(b, 0.06, G, [0, -0.1, 0.05], [0.85, 0.45, 1.6]);
    for (const k of [-1, 0, 1]) spike(b, [k * 0.03, -0.11, 0.12], [k * 0.04, -0.12, 0.2], 0.014, CLAW, 5);
    spike(b, [0, -0.08, 0.06], [0, -0.0, 0.12], 0.02, CLAW, 5);
    return mk(b);
  };
  return {
    parts: { hips: grp(mk(hb), tail), chest, uLegL: thigh(), uLegR: thigh(), lLegL: shin(), lLegR: shin() },
    head: headG, jaw, tail,
    anim(L, p, f) {
      const bite = f.atk ? Math.min(1, f.atk.t / 0.12) * (f.atk.t < 0.2 ? 1 : Math.max(0, 1 - (f.atk.t - 0.2) / 0.06)) : 0;
      L.jaw.rotation.x = 0.08 + 0.75 * bite + (f.roarT > 0 ? 0.6 * Math.min(1, f.roarT) : 0);
      L.head.rotation.x = -0.15 * bite + Math.sin(p.phase * 2) * 0.04 - (f.roarT > 0 ? 0.35 * Math.min(1, f.roarT) : 0);
      L.tail.rotation.y = Math.sin(p.phase) * 0.18 - (p.yawRate || 0) * 0.06;
      L.tail.rotation.x = -0.05 + Math.cos(p.phase * 2) * 0.04;
    },
  };
}

function grasshopperLook() {
  const G = 0x7ac943, DG = 0x4a8a2a, YG = 0xc8e070, EYE = 0x7a3a22, WING = 0x9aa860, DARK = 0x223311, SPINE = 0x3a5a1a;
  // hips: long ringed abdomen, folded wings, the big jumping legs (on pivots, they kick on take-off)
  const hb = new Builder();
  ell(hb, 0.16, G, [0, 0.1, -0.36], [1.0, 1.0, 2.7], [0.15, 0, 0], 16);
  ell(hb, 0.13, YG, [0, 0.04, -0.34], [0.95, 0.75, 2.6], [0.15, 0, 0]);
  for (let i = 0; i < 4; i++) {
    const z = -0.12 - i * 0.16, r = 0.163 - i * 0.012;
    hb.torus(r, 0.012, DG, [0, 0.1 - z * 0.15 + 0.0, z], [0, 0, 0], 18);
  }
  const wb = new Builder();
  for (const s of [-1, 1]) ell(wb, 0.1, WING, [s * 0.07, 0, -0.3], [0.9, 0.16, 6.2], [0.1, 0, s * 0.3]);
  const wings = pivot([0, 0.27, 0.0], mk(wb));
  const legs = {};
  for (const s of [-1, 1]) {
    const fb = new Builder();
    // femur up and back from the hip to a knee that pokes above the body
    ell(fb, 0.085, G, [0, 0.21, -0.25], [0.85, 0.95, 4.2], [0.69, 0, 0]);
    for (let k = 0; k < 3; k++) ell(fb, 0.04, DG, [s * 0.06, 0.16 + k * 0.08, -0.18 - k * 0.1], [0.3, 0.6, 1.6], [0.69, 0, 0]);
    const tb = new Builder();
    rod(tb, [0, 0, 0], [s * 0.03, -0.92, -0.2], 0.035, 0.025, G, 7);
    for (let k = 1; k < 6; k++) spike(tb, [s * 0.005 * k, -0.15 * k, -0.033 * k - 0.02], [s * 0.005 * k, -0.15 * k + 0.03, -0.033 * k - 0.07], 0.01, SPINE, 4);
    ell(tb, 0.04, DG, [s * 0.03, -0.94, -0.17], [0.9, 0.5, 1.8]);
    const tib = pivot([0, 0.43, -0.5], mk(tb));
    legs[s] = pivot([s * 0.18, 0.06, -0.04], mk(fb), tib);
    legs[s].userData.tib = tib;
  }
  // chest: thorax with its saddle, then the head with big eyes and long antennae
  const cb = new Builder();
  ell(cb, 0.17, G, [0, -0.02, 0.08], [0.95, 1.0, 1.35]);
  ell(cb, 0.19, DG, [0, 0.07, 0.1], [1.0, 0.72, 1.15]);
  ell(cb, 0.13, YG, [0, -0.1, 0.12], [0.9, 0.6, 1.1]);
  const hd = new Builder();
  ell(hd, 0.15, G, [0, 0, 0.04], [0.85, 1.15, 0.95], [0.35, 0, 0]);
  for (const s of [-1, 1]) {
    ell(hd, 0.075, EYE, [s * 0.11, 0.07, 0.06], [0.7, 1.05, 1.0]);
    ell(hd, 0.02, 0xffffff, [s * 0.15, 0.1, 0.1]);                                     // shine
    rod(hd, [s * 0.04, 0.15, 0.1], [s * 0.12, 0.45, 0.35], 0.012, 0.01, DARK, 5);     // antennae
    rod(hd, [s * 0.12, 0.45, 0.35], [s * 0.22, 0.62, 0.7], 0.01, 0.007, DARK, 5);
    spike(hd, [s * 0.04, -0.14, 0.12], [s * 0.015, -0.2, 0.15], 0.025, DARK, 5);     // mandibles
  }
  ell(hd, 0.05, DG, [0, -0.12, 0.1], [1, 0.6, 0.8]);
  const headG = pivot([0, 0.12, 0.32], mk(hd));
  const chest = grp(mk(cb), headG);
  const leg = (r0, r1, foot) => {
    const b = new Builder();
    b.cyl(r0, r1, foot ? 0.2 : 0.24, G, [0, foot ? 0.02 : 0, 0], null, 7);
    if (foot) ell(b, 0.035, DG, [0, -0.09, 0.03], [0.9, 0.5, 1.6]);
    return mk(b);
  };
  return {
    parts: { hips: grp(mk(hb), wings, legs[-1], legs[1]), chest, uLegL: leg(0.035, 0.03), uLegR: leg(0.035, 0.03), lLegL: leg(0.028, 0.022, true), lLegR: leg(0.028, 0.022, true) },
    front: { uLegL: leg(0.03, 0.026), uLegR: leg(0.03, 0.026), lLegL: leg(0.024, 0.02, true), lLegR: leg(0.024, 0.02, true) }, D: 0.3, knee: 0.5,
    head: headG, wings, hind: [legs[-1], legs[1]],
    anim(L, p, f, dt) {
      // hind legs kick out on take-off and fold back up for the landing; wings flutter in the air
      const vy = p.hips.linvel().y, air = !p.grounded && !p.swimming && p.state !== 'seated';
      const want = air && vy > 1 ? 1 : 0;
      f.kickV = (f.kickV || 0) + (want - (f.kickV || 0)) * Math.min(1, dt * (want ? 18 : 5));
      for (const h of L.hind) { h.rotation.x = -0.75 * f.kickV; h.userData.tib.rotation.x = -1.1 * f.kickV; }
      L.wings.rotation.x = air ? -0.12 + Math.sin(p.t * 60) * 0.12 : 0;
      L.head.rotation.y = Math.sin(p.t * 1.3) * 0.12;
    },
  };
}

export const FORMS = {
  goat: { name: 'Goat', icon: '🐐', desc: 'Charging headbutts', verb: 'Headbutt', btn: 'X', look: goatLook, speed: 1.05, jump: 1.12, kick: 1 },
  raptor: { name: 'Velociraptor', icon: '🦖', desc: 'Bite, and everyone runs away', verb: 'Bite', btn: 'X', look: raptorLook, speed: 1.15, jump: 1.05, kick: 1, scary: true },
  grasshopper: { name: 'Giant grasshopper', icon: '🦗', desc: 'Enormous jumps', verb: 'Big jump', btn: 'A', look: grasshopperLook, speed: 1.0, jump: 1.8, kick: 4.5 },
};
export const FORM_ORDER = ['goat', 'raptor', 'grasshopper'];

// ---- sounds (synthesised, like everything in audio.js) ------------------------------
function sfx(game, name, pos) {
  const a = game.audio;
  if (!a || !a.running?.() || !a.tone) return;
  try {
    const sp = a.spatial(pos), v = sp.v;
    if (v < 0.02) return;
    const out = a.outNode(1, sp.pan, 0.5);
    if (a.playSample?.(name, out, v)) return; // a delivered recording (dev/sfx) wins over the synth
    if (name === 'puff') {
      a.burst(0.55, 0.35 * v, 1500, 0.8, 'bandpass', 0, out, 250);
      [1568, 2093, 2637, 3136, 4186].forEach((f, i) => a.tone('triangle', f, f * 1.02, 0.18, 0.06 * v, 0.05 + i * 0.05, out, 0.002));
    } else if (name === 'bleat') {
      const k = 0.9 + Math.random() * 0.2;
      a.voice(560 * k, 520 * k, 0.15, 0.2 * v, out, 'e', 0);
      a.voice(540 * k, 500 * k, 0.13, 0.2 * v, out, 'e', 0.14);
      a.voice(520 * k, 430 * k, 0.3, 0.2 * v, out, 'a', 0.26);
    } else if (name === 'roar') {
      a.burst(1.0, 0.45 * v, 700, 0.7, 'lowpass', 0, out, 180);
      a.tone('sawtooth', 190, 70, 1.0, 0.16 * v, 0, out, 0.05);
      a.voice(260, 120, 0.95, 0.3 * v, out, 'a');
    } else if (name === 'chomp') {
      a.burst(0.05, 0.3 * v, 2600, 2, 'bandpass', 0, out);
      a.tone('square', 200, 90, 0.08, 0.08 * v, 0, out, 0.002);
      a.burst(0.07, 0.25 * v, 1800, 2, 'bandpass', 0.09, out);
    } else if (name === 'hiss') {
      a.burst(0.35, 0.18 * v, 3500, 1.5, 'highpass', 0, out, 2000);
    } else if (name === 'chirp') {
      for (let i = 0; i < 7; i++) a.tone('square', 4300, 3900, 0.025, 0.035 * v, i * 0.045, out, 0.002);
    } else if (name === 'thwack') {
      a.burst(0.09, 0.4 * v, 700, 1.5, 'bandpass', 0, out);
      a.tone('sine', 180, 70, 0.14, 0.3 * v, 0, out);
    }
  } catch (e) { /* never let a sound break the game */ }
}

// ---- magic puff: sparkles + a smoke cloud ----------------------------------------------
let _dot = null;
function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
const PUFF_COLS = [0xb46cff, 0xff7fc8, 0xffd23f, 0x7fd8ff, 0xffffff];
const SMOKE_GEO = new THREE.SphereGeometry(0.5, 12, 8);

// ---- the per-player form record -------------------------------------------------------
class Form {
  constructor(forms, p, kind) {
    this.forms = forms; this.game = forms.game; this.p = p; this.kind = kind; this.def = FORMS[kind];
    this.t = FORM_TIME;
    this.speed = this.def.speed; this.jump = this.def.jump; this.kick = this.def.kick;
    this.atk = null; this.atkCool = 0; this.roarT = 0;
    this.look = this.def.look();
    this.root = new THREE.Group();
    this.root.userData.noCull = true;
    for (const n in this.look.parts) this.root.add(this.look.parts[n]);
    if (this.look.front) for (const n in this.look.front) this.root.add(this.look.front[n]);
    p.group.add(this.root);
    this.shown = null;
  }

  // player.js hook: animals can't grab (the triggers do nothing)
  input(inp) {
    if (!inp.grabL && !inp.grabR) return inp;
    return { ...inp, grabL: 0, grabR: 0 };
  }

  // player.js hook: X instead of a punch
  attack() {
    const p = this.p, k = this.kind;
    if (this.atkCool > 0) return;
    p.punch.t = 0.32; p.punch.hit = true; // no fist: the hit test is ours (step)
    p.impactGrace = Math.max(p.impactGrace, 0.15);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), cp = p.chest.translation();
    if (k === 'grasshopper') {
      if (!p.grounded) return;
      for (const b of p.bodies) b.applyImpulse({ x: fx * 3 * b.mass(), y: 3.2 * b.mass(), z: fz * 3 * b.mass() }, true);
      p.jumpCool = 0.35;
      this.atkCool = 0.45;
      sfx(this.game, 'chirp', cp);
      return;
    }
    this.atk = { t: 0, hit: new Set() };
    this.atkCool = k === 'goat' ? 0.75 : 0.55;
    if (k === 'goat') { sfx(this.game, 'bleat', cp); this.game.audio?.play('swish', cp); }
    else sfx(this.game, 'hiss', cp);
  }

  // Lunge + hit test while an attack runs (before the physics step).
  stepAttack() {
    const p = this.p, a = this.atk, goat = this.kind === 'goat';
    a.t += DT;
    const dur = goat ? 0.42 : 0.3;
    if (a.t > dur || p.state !== 'normal') { this.atk = null; return; }
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    // charge: keep the body moving forward at lunge speed
    const lunge = goat ? (a.t < 0.32 ? 7.5 : 0) : (a.t < 0.2 ? 7 : 0);
    if (lunge) {
      const v = p.hips.linvel(), fwd = v.x * fx + v.z * fz;
      if (fwd < lunge) {
        const dv = Math.min(lunge - fwd, (goat ? 60 : 50) * DT);
        for (const b of p.bodies) b.applyImpulse({ x: fx * dv * b.mass(), y: 0, z: fz * dv * b.mass() }, true);
      }
    }
    if (a.t < (goat ? 0.06 : 0.08)) return;
    // the hit zone: in front of the (animal's) head
    const c = p.chest.translation(), r = p.chest.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _v.set(0, goat ? 0.12 : 0.28, goat ? 0.75 : 0.72).applyQuaternion(_q).add(c);
    _v.x += fx * 0.1; _v.z += fz * 0.1;
    const W = this.game.physics.world, owners = this.game.physics.handleOwner;
    const hitPt = { x: _v.x, y: _v.y, z: _v.z };
    // collect first: bodies can't be pushed from inside a Rapier query callback
    const found = [];
    W.intersectionsWithShape(hitPt, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(0.5), (col) => {
      const owner = owners.get(col.handle), body = col.parent();
      if (owner === p) return true;
      const key = owner && owner.parts ? owner : body;
      if (!key || a.hit.has(key)) return true;
      a.hit.add(key);
      found.push([owner, body]);
      return true;
    }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_FIXED, p.queryGroups);
    for (const [owner, body] of found) {
      if (owner && owner.parts) { // a player or an NPC: knocked over, never hurt
        if (owner.state === 'seated') continue;
        const push = goat ? 7 : 3, up = goat ? 3.5 : 2;
        for (const b of owner.bodies) b.applyImpulse({ x: fx * push * b.mass(), y: up * b.mass(), z: fz * push * b.mass() }, true);
        owner.knockOut(goat ? 2.2 : 2.6);
        owner.impactGrace = 0.25;
        this.hits = (this.hits || 0) + 1;
        sfx(this.game, goat ? 'thwack' : 'chomp', hitPt);
        a.landed = true;
      } else if (body && body.isDynamic()) { // props fly (a goat sends them much further)
        const m = Math.min(body.mass(), 80), sp = goat ? 8 : 3.5;
        body.applyImpulseAtPoint({ x: fx * m * sp, y: m * (goat ? 3.5 : 1.5), z: fz * m * sp }, hitPt, true);
        body.wakeUp();
        if (goat) sfx(this.game, 'thwack', hitPt);
        a.landed = true;
      }
    }
    if (!goat && a.t >= 0.2 && !a.chomped) { a.chomped = true; if (!a.landed) sfx(this.game, 'chomp', hitPt); }
  }

  step() {
    const p = this.p;
    this.t -= DT;
    this.atkCool -= DT;
    this.roarT = Math.max(0, this.roarT - DT);
    if (this.atk) this.stepAttack();
    if (this.kind === 'grasshopper') {
      // long legs soak up the landing: no knock-out from our own jumps
      const vy = p.hips.linvel().y;
      if (!p.grounded && vy < -4.5 && p.state === 'normal') p.impactGrace = Math.max(p.impactGrace, 0.15);
      if (p.jumpCool === 0.35 && p.offGround >= 0.13 && !this.chirped) { sfx(this.game, 'chirp', p.pos()); this.chirped = true; }
      if (p.jumpCool < 0.3) this.chirped = false;
    }
  }

  // player.js hook (Player.sync): pose the form's meshes on the ragdoll bodies.
  sync(dt = 1 / 60) {
    const p = this.p, parts = p.parts, L = this.look;
    // last seconds: flicker between the two shapes, faster and faster
    let show = true;
    if (this.t < WARN_TIME) { const f = 3 + (WARN_TIME - this.t) * 2.2; show = Math.sin(this.t * f * Math.PI * 2) > -0.35; }
    if (show !== this.shown) {
      this.shown = show;
      for (const n in parts) parts[n].mesh.visible = !show;
      this.root.visible = show;
    } else if (show) for (const n in parts) if (parts[n].mesh.visible) parts[n].mesh.visible = false; // re-made meshes (customiser)
    if (!show) return;
    for (const n in L.parts) { const m = L.parts[n], s = parts[n].mesh; m.position.copy(s.position); m.quaternion.copy(s.quaternion); }
    if (L.knee != null) {
      // four-legged walkers: the human run folds the shins right back; stiffen
      // the knees (visual only) so the hooves stay under the body
      const hm = parts.hips.mesh;
      for (const h of ['L', 'R']) {
        const u = L.parts['uLeg' + h], l = L.parts['lLeg' + h];
        if (L.hip != null) { // smaller strides too
          u.quaternion.slerpQuaternions(hm.quaternion, parts['uLeg' + h].mesh.quaternion, L.hip);
          u.position.set(h === 'L' ? HIP_X : -HIP_X, -KNEE, 0).applyQuaternion(hm.quaternion).add(hm.position);
          u.position.add(_v.set(0, -KNEE, 0).applyQuaternion(u.quaternion));
        }
        l.quaternion.slerpQuaternions(u.quaternion, parts['lLeg' + h].mesh.quaternion, L.knee);
        l.position.set(0, -KNEE, 0).applyQuaternion(u.quaternion).add(u.position);
        l.position.add(_v.set(0, -KNEE, 0).applyQuaternion(l.quaternion));
      }
    }
    if (L.front) {
      // front legs: the opposite rear leg's pose relative to the hips, moved forward
      const h = parts.hips.mesh;
      _m1.compose(h.position, h.quaternion, _one);
      _m2.copy(_m1).invert();
      _mt.makeTranslation(0, 0, L.D);
      for (const [fn, rn] of [['uLegL', 'uLegR'], ['uLegR', 'uLegL'], ['lLegL', 'lLegR'], ['lLegR', 'lLegL']]) {
        const s = L.knee != null ? L.parts[rn] : parts[rn].mesh, m = L.front[fn];
        _m3.compose(s.position, s.quaternion, _one).premultiply(_m2).premultiply(_mt).premultiply(_m1);
        _m3.decompose(m.position, m.quaternion, _sc);
      }
    }
    L.anim?.(L, p, this, dt);
  }

  dispose() {
    const p = this.p;
    p.group.remove(this.root);
    this.root.traverse((o) => o.geometry?.dispose());
    for (const n in p.parts) p.parts[n].mesh.visible = true;
  }
}

// ---- the manager ----------------------------------------------------------------------
export class Forms {
  constructor(game) {
    this.game = game;
    game.forms = this;
    this.list = new Map(); // player -> Form
    this.puffs = [];
    this.hud = new FormHud(this);
    game.steppers.push(() => this.step());
    game.updaters.push((dt) => this.update(dt));
  }

  of(p) { return this.list.get(p) || null; }

  transform(p, kind) {
    if (!FORMS[kind] || !p || p.isNPC) return null;
    if (this.list.has(p)) this.revert(p, { quiet: true });
    p.releaseAll?.();
    const f = new Form(this, p, kind);
    this.list.set(p, f);
    p.form = f;
    f.sync();
    this.puff(p);
    if (kind === 'raptor') { f.roarT = 1.1; sfx(this.game, 'roar', p.pos()); }
    else if (kind === 'goat') sfx(this.game, 'bleat', p.pos());
    else sfx(this.game, 'chirp', p.pos());
    this.game.ui?.toast?.(`P${p.index + 1} is a <b>${FORMS[kind].name.toLowerCase()}</b>! <small>for ${FORM_TIME} seconds</small>`, p.color);
    return f;
  }

  // Back to the normal character (timer, respawn, menu, leaving). quiet: no puff.
  revert(p, { quiet = false } = {}) {
    const f = this.list.get(p);
    if (!f) return;
    this.list.delete(p);
    if (p.form === f) p.form = undefined;
    f.dispose();
    if (!quiet && this.game.players.includes(p)) this.puff(p);
  }

  // npc.js hook: a raptor player within SCARE_R of this NPC, or null.
  scareOf(npc) {
    if (!this.list.size) return null;
    const c = npc.chest.translation();
    let best = null, bd = SCARE_R;
    for (const [p, f] of this.list) {
      if (!f.def.scary) continue;
      const t = p.chest.translation(), d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d < bd && Math.abs(t.y - c.y) < 6) { bd = d; best = p; }
    }
    return best;
  }

  step() {
    if (!this.list.size) return;
    for (const [p, f] of [...this.list]) {
      if (!this.game.players.includes(p)) { this.revert(p, { quiet: true }); continue; }
      f.step();
      if (f.t <= 0) this.revert(p);
    }
  }

  puff(p) {
    const c = p.chest.translation(), scene = this.game.scene;
    const N = 70, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = [];
    const cc = new THREE.Color();
    for (let i = 0; i < N; i++) {
      pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = 2 + Math.random() * 3.5, h = Math.sqrt(1 - u * u);
      vel.push([Math.cos(a) * h * s, u * s * 0.8 + 1.2, Math.sin(a) * h * s]);
      cc.set(PUFF_COLS[i % PUFF_COLS.length]);
      col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.3, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.userData.noCull = true; pts.frustumCulled = false;
    scene.add(pts);
    const smoke = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(SMOKE_GEO, new THREE.MeshBasicMaterial({ color: i % 3 ? 0xf4ecff : 0xd9b8ff, transparent: true, opacity: 0.85, depthWrite: false }));
      const a = i / 9 * Math.PI * 2;
      m.position.set(c.x + Math.cos(a) * 0.25, c.y - 0.3 + (i % 3) * 0.35, c.z + Math.sin(a) * 0.25);
      m.userData.noCull = true;
      m.userData.v = [Math.cos(a) * 1.4, 0.4 + (i % 3) * 0.3, Math.sin(a) * 1.4];
      scene.add(m); smoke.push(m);
    }
    this.puffs.push({ pts, vel, smoke, t: 0 });
    sfx(this.game, 'puff', c);
  }

  update(dt) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const P = this.puffs[i];
      P.t += dt;
      const a = P.pts.geometry.attributes.position, arr = a.array;
      for (let k = 0; k < P.vel.length; k++) {
        const v = P.vel[k];
        arr[k * 3] += v[0] * dt; arr[k * 3 + 1] += v[1] * dt; arr[k * 3 + 2] += v[2] * dt;
        v[0] *= 1 - 2.5 * dt; v[1] = v[1] * (1 - 2.5 * dt) + 0.6 * dt; v[2] *= 1 - 2.5 * dt;
      }
      a.needsUpdate = true;
      P.pts.material.opacity = Math.max(0, 1 - P.t / 1.1);
      P.pts.material.size = 0.3 + P.t * 0.15;
      for (const m of P.smoke) {
        const v = m.userData.v;
        m.position.x += v[0] * dt; m.position.y += v[1] * dt; m.position.z += v[2] * dt;
        v[0] *= 1 - 3 * dt; v[2] *= 1 - 3 * dt;
        m.scale.setScalar(0.6 + P.t * 1.6);
        m.material.opacity = Math.max(0, 0.85 * (1 - P.t / 0.9));
      }
      if (P.t > 1.2) {
        this.game.scene.remove(P.pts); P.pts.geometry.dispose(); P.pts.material.dispose();
        for (const m of P.smoke) { this.game.scene.remove(m); m.material.dispose(); }
        this.puffs.splice(i, 1);
      }
    }
  }
}

// ---- countdown HUD (each player's own view; ui.update calls hud.update(views)) ----------
const CSS = `
.formhud { position: absolute; display: flex; align-items: center; gap: 8px; background: rgba(60,20,110,.78); color: #fff; border-radius: 16px;
  padding: 5px 12px 5px 8px; font-weight: 900; font-size: 15px; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,.5);
  box-shadow: 0 3px 0 rgba(0,0,0,.2), 0 0 0 3px var(--acc); white-space: nowrap; transform-origin: 0 0; }
.formhud .fi { font-size: 22px; }
.formhud .ft { font-variant-numeric: tabular-nums; color: #ffe36a; font-size: 18px; }
.formhud small { font-size: 12px; opacity: .85; font-weight: 800; }
.formhud .fbar { position: absolute; left: 10px; right: 10px; bottom: 2px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.2); overflow: hidden; }
.formhud .fbar i { display: block; height: 100%; background: linear-gradient(90deg, #ff7fc8, #ffd23f); }
.formhud.warn { animation: formwarn .3s infinite alternate; }
.formhud.warn .ft { color: #ff8a8a; }
@keyframes formwarn { from { background: rgba(60,20,110,.78); } to { background: rgba(200,40,60,.9); } }
.ppanel.forms { background: rgba(40,10,80,.45); }
.ppanel.forms .card { min-width: 330px; }
.ppanel.forms .ball { width: 54px; height: 54px; margin: 2px auto -4px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff, #c9a8ff 30%, #6a2fa8 75%, #3a1060); box-shadow: 0 0 18px #b46cff; animation: formball 1.6s infinite alternate; }
@keyframes formball { to { box-shadow: 0 0 30px #ff7fc8; } }
.ppanel.forms .fsub { text-align: center; font-size: 12px; font-weight: 700; opacity: .7; margin: -6px 0 6px; }
.ppanel.forms .item { justify-content: flex-start; gap: 12px; flex-wrap: nowrap; }
.ppanel.forms .item .ic { font-size: 26px; width: 34px; text-align: center; }
.ppanel.forms .item .nm { display: flex; flex-direction: column; line-height: 1.1; }
.ppanel.forms .item .nm small { font-size: 12px; font-weight: 700; opacity: .75; }
.ppanel.forms .item .tag { margin-left: auto; font-size: 11px; font-weight: 900; border-radius: 8px; padding: 2px 7px; background: #e4ecf8; color: #345; }
.ppanel.forms .item.sel .tag { background: rgba(255,255,255,.25); color: #fff; }
`;
const accent = (c) => PLAYER_CSS(c === 0xffffff ? 0x2a62c9 : c);
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

class FormHud {
  constructor(forms) { this.forms = forms; this.els = new Map(); this.css = false; }
  update(views) {
    const g = this.forms.game;
    for (const [p, el] of this.els) if (!this.forms.list.has(p) || !g.players.includes(p)) { el.remove(); this.els.delete(p); }
    if (!this.forms.list.size) return;
    if (!this.css) { injectCSS(CSS); this.css = true; }
    g.players.forEach((p, i) => {
      const f = this.forms.list.get(p), view = views[i];
      if (!f || !view) return;
      let el = this.els.get(p);
      if (!el) { el = document.createElement('div'); el.className = 'formhud'; g.ui.hud.appendChild(el); this.els.set(p, el); el.dataset.k = ''; }
      const [x, y, w, h] = view, d = f.def, k = deviceKind(p.deviceId);
      const key = `${f.kind}|${fmt(f.t)}|${k}`;
      if (el.dataset.k !== key) {
        el.dataset.k = key;
        el.innerHTML = `<span class="fi">${d.icon}</span><span>${d.name}</span><span class="ft">${fmt(f.t)}</span><small>${promptRow([[d.btn, d.verb]], k)}</small><span class="fbar"><i></i></span>`;
      }
      el.querySelector('.fbar i').style.width = (Math.max(0, f.t) / FORM_TIME * 100).toFixed(1) + '%';
      el.classList.toggle('warn', f.t < WARN_TIME);
      el.style.setProperty('--acc', accent(p.color));
      const s = Math.max(0.55, Math.min(1, w / 640, h / 420));
      el.style.transform = `scale(${s.toFixed(3)})`;
      el.style.left = x + 12 + 'px';
      el.style.top = y + 44 * s + 'px';
      el.style.display = g.ui.panels?.get(p) ? 'none' : 'flex';
    });
  }
}

// ---- the chooser (a per-player panel, like the shops) ----------------------------------
export class FormPanel {
  constructor(ui, player) {
    if (!FormPanel.css) { injectCSS(CSS); FormPanel.css = true; }
    this.ui = ui; this.p = player; this.kind = 'forms'; this.sel = 0;
    this.t0 = performance.now();
    this.el = document.createElement('div');
    this.el.className = 'ppanel forms';
    ui.hud.appendChild(this.el);
    this.el.addEventListener('pointermove', (e) => { const it = e.target.closest?.('[data-i]'); if (it && +it.dataset.i !== this.sel) { this.sel = +it.dataset.i; this.draw(); } });
    this.el.addEventListener('click', (e) => { const it = e.target.closest?.('[data-i]'); if (it) { this.sel = +it.dataset.i; this.choose(); } });
    ui.game.audio?.play('uiOpen');
    this.draw();
  }
  items() {
    const f = this.ui.game.forms.of(this.p);
    const its = FORM_ORDER.map((k) => ({ kind: k, ...FORMS[k], tag: f?.kind === k ? 'You are!' : null }));
    if (f) its.push({ kind: null, icon: '🙂', name: 'Back to normal', desc: 'your own self again' });
    return its;
  }
  remove() { this.el.remove(); }
  place(rect) {
    const [x, y, w, h] = rect;
    const s = Math.max(0.4, Math.min(1, w / 520, h / 560));
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    this.el.style.setProperty('--s', s.toFixed(3));
  }
  move(d) { const N = this.items().length; this.sel = (this.sel + d + N) % N; this.ui.sfx('uiMove'); this.draw(); }
  close() { this.ui.sfx('uiBack'); this.ui.closePanel(this.p); }
  choose() {
    const it = this.items()[this.sel], forms = this.ui.game.forms;
    if (!it) return;
    this.ui.sfx('uiSelect');
    this.ui.closePanel(this.p);
    if (it.kind) forms.transform(this.p, it.kind); else forms.revert(this.p);
  }
  input(n) {
    if (performance.now() - this.t0 < 250) return;
    if (n.back || (n.start && this.p.deviceId !== 'kb1')) { this.close(); return; }
    if (n.up || n.left) this.move(-1);
    if (n.down || n.right) this.move(1);
    if (n.ok) this.choose();
  }
  draw() {
    const p = this.p, k = deviceKind(p.deviceId), its = this.items();
    const rows = its.map((it, i) => `<div class="item ${i === this.sel ? 'sel' : ''}" data-i="${i}"><span class="ic">${it.icon}</span><span class="nm">${it.name}<small>${it.desc}</small></span>${it.tag ? `<span class="tag">${it.tag}</span>` : ''}</div>`).join('');
    const txt = p.color === 0xffffff || p.color === 0xffc233 || p.color === 0x3fe0d0 ? '#234' : '#fff';
    this.el.innerHTML = `<div class="card" style="--acc:${accent(p.color)}">
      <div class="phead" style="background:${accent(p.color)};color:${txt}">Player ${p.index + 1}<small>Magic tent</small></div>
      <div class="ball"></div>
      <h2>Change your shape</h2><div class="fsub">lasts ${FORM_TIME} seconds · animals can't grab</div>
      ${rows}
      <div class="foot">${promptRow([['LS', 'Choose'], ['A', 'Transform'], ['B', 'Leave']], k)}</div></div>`;
  }
}

// ---- the tent ---------------------------------------------------------------------------
// Striped fortune-teller tent with a MAGIC TENT sign over the door, a rug, a
// crystal ball on a table (the use spot), a big mirror and a mystic.
export function buildMagicTent(game, kit) {
  new Forms(game);
  const { x: cx, z: cz, yaw } = TENT;
  const y0 = meshHeight(cx, cz);
  const L = new Local(kit, cx, cz, yaw, y0);
  const R = 3.6, H = 2.6, N = 18, PURPLE = 0x6a2fa8, GOLD = 0xffd23f, CREAM = 0xfff1d6;
  // floor and walls (panels round a circle, two left out for the door at local +Z)
  L.box(0, 0.06, 0, 7.4, 0.12, 7.4, 0x5a3a2a, { round: 0.05 });
  for (let i = 0; i < N; i++) {
    if (i === 0 || i === N - 1) continue;
    const a = (i + 0.5) / N * Math.PI * 2;
    L.box(Math.sin(a) * R, H / 2, Math.cos(a) * R, 2 * Math.PI * R / N + 0.04, H, 0.12, i % 2 ? PURPLE : CREAM, { yaw: a });
  }
  // door posts and a gold trim
  for (const s of [-1, 1]) { const a = s * 1 / N * Math.PI * 2; L.cyl(Math.sin(a) * R, H / 2, Math.cos(a) * R, 0.09, H, GOLD); }
  // roof: a striped cone (own mesh, vertex colours per segment) + stacked colliders under it
  const geo = new THREE.ConeGeometry(R + 0.5, 2.4, N, 1, true).toNonIndexed();
  const cols = new Float32Array(geo.attributes.position.count * 3), cc = new THREE.Color();
  for (let t = 0; t < geo.attributes.position.count / 3; t++) {
    cc.set(Math.floor(t / 1) % 2 ? PURPLE : CREAM);
    for (let v = 0; v < 3; v++) { cols[(t * 3 + v) * 3] = cc.r; cols[(t * 3 + v) * 3 + 1] = cc.g; cols[(t * 3 + v) * 3 + 2] = cc.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const rp = L.v3(0, H + 1.2, 0);
  roof.position.set(rp.x, rp.y, rp.z); roof.rotation.y = yaw + Math.PI / N;
  roof.castShadow = true; roof.receiveShadow = true;
  game.scene.add(roof);
  for (const [y, r] of [[H + 0.2, R + 0.2], [H + 0.75, R - 0.85], [H + 1.35, R - 2.0], [H + 1.9, 0.6]]) kit.phys.cylinder(rp.x, y0 + y, rp.z, r, 0.3, {});
  // scalloped valance, top ball and a pennant
  for (let i = 0; i < N * 2; i++) {
    const a = (i + 0.5) / (N * 2) * Math.PI * 2;
    L.sphere(Math.sin(a) * (R + 0.42), H - 0.02, Math.cos(a) * (R + 0.42), 0.17, i % 2 ? GOLD : PURPLE, { scale: [1, 0.7, 1] });
  }
  L.sphere(0, H + 2.5, 0, 0.2, GOLD);
  L.cyl(0, H + 2.9, 0, 0.03, 0.8, 0x888888, { collide: false });
  L.box(0, H + 3.1, 0.3, 0.03, 0.3, 0.55, 0xff7fc8, { collide: false });
  // sign over the door on two posts
  for (const s of [-1, 1]) L.cyl(s * 1.75, 1.85, R + 0.75, 0.08, 3.7, GOLD);
  L.box(0, 3.45, R + 0.75, 3.7, 1.0, 0.1, PURPLE, { collide: false });
  const sign = signMesh('MAGIC TENT', 3.5, '#5a1f9a', '#ffd23f');
  const sp = L.v3(0, 3.45, R + 0.81); sign.position.set(sp.x, sp.y, sp.z); sign.rotation.y = yaw;
  game.scene.add(sign);
  for (const s of [-1, 1]) L.sphere(s * 1.75, 3.8, R + 0.75, 0.16, GOLD);
  // inside: rug, table with the crystal ball, a tall mirror, stars and a lamp
  L.cyl(0, 0.13, 0.3, 2.6, 0.02, 0x9a2a4a, { collide: false, seg: 24 });
  L.cyl(0, 0.14, 0.3, 2.2, 0.02, 0xd8a03a, { collide: false, seg: 24 });
  L.cyl(0, 0.15, 0.3, 1.9, 0.02, 0x9a2a4a, { collide: false, seg: 24 });
  const tz = -0.9;
  L.cyl(0, 0.5, tz, 0.55, 0.76, 0x4a2a1a, { seg: 16 });
  L.cyl(0, 0.9, tz, 0.72, 0.06, PURPLE, { collide: false, seg: 20 });
  L.cyl(0, 0.72, tz, 0.73, 0.36, PURPLE, { collide: false, seg: 20, rTop: 0.72 });
  L.cyl(0, 0.98, tz, 0.12, 0.1, GOLD, { collide: false, seg: 10 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), new THREE.MeshPhongMaterial({ color: 0xc9b8ff, emissive: 0x6a2fd0, emissiveIntensity: 0.6, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.88 }));
  const bp = L.v3(0, 1.26, tz); ball.position.set(bp.x, bp.y, bp.z);
  ball.userData.noCull = true;
  game.scene.add(ball);
  game.updaters.push((dt, t) => { ball.material.emissiveIntensity = 0.55 + 0.35 * Math.sin(t * 2.4); ball.rotation.y += dt * 0.6; });
  // mirror on the back wall (gold frame, silvery glass)
  L.box(0, 1.45, -(R - 0.25), 1.2, 2.2, 0.12, GOLD);
  L.box(0, 1.45, -(R - 0.32), 0.95, 1.95, 0.04, 0xbfe0f0, { collide: false });
  L.sphere(0, 2.6, -(R - 0.25), 0.16, GOLD);
  // hanging stars and moons
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + 0.3, r = 1.7 + (i % 2) * 0.7, y = 2.2 - (i % 3) * 0.25;
    L.cyl(Math.sin(a) * r, y + 0.35, Math.cos(a) * r, 0.006, 0.7, 0xcccccc, { collide: false, seg: 3 });
    L.sphere(Math.sin(a) * r, y, Math.cos(a) * r, 0.1, i % 2 ? GOLD : 0xfff4c2, { scale: [1, 1, 0.35] });
  }
  game.interiorLights.add(bp.x, y0 + H + 0.7, bp.z, { color: 0xd8b0ff, intensity: 7, range: 8, fixture: false });
  // the use spot: the crystal ball
  useSpot(game, bp.x, bp.y, bp.z, 'Change shape', (p) => {
    if (p.isNPC) return;
    game.ui.setPanel(p, new FormPanel(game.ui, p));
  });
  // a mystic behind the table
  const mp = L.v3(0, 0, tz - 1.0);
  game.npcs?.spawn({
    role: 'mystic', colors: { shirt: 0x6a2fa8, pants: 0x3a1a5a, hat: 0xffd23f }, hat: 'beanie', outfit: ['scarf'], behaviour: 'idle', speed: 0.5,
    lines: ['Gaze into the ball...', 'What shall you become?', 'Abracadabra!', 'The ball sees a goat in your future.'],
    hitLines: ['The spirits frown on you!', 'Hey! I foresaw that.'], emotes: ['wave', 'bow'], yaw: yaw,
    area: { x: mp.x, z: mp.z, r: 1.5 },
  }, mp.x, mp.z);
}
