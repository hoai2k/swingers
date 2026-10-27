// Sea life all round the archipelago (critters.js species: one draw call each).
//
// Under water: fish schools (tropical tangs / clownfish / angelfish in the warm south,
// silvery ones further north), pufferfish, jellyfish, sea stars, crabs, seahorses, octopuses,
// sea turtles, manta rays, sharks and, very occasionally, a plesiosaur. None of it exists until
// a player's camera goes under: the sea is cut into CELL m squares whose contents come from a
// hash of the square (depth and latitude decide what lives there), so a square holds the same
// creatures every visit, and every creature's pose is a function of time (circles, drifts,
// shuffles) — nothing is stored or stepped while nobody looks. Each frame only the squares
// within REACH of an under-water camera are filled in, and the meshes are drawn only in
// under-water views (the murky fog ends at 30 m, so squares appearing at the edge are unseen).
//
// At the surface: dolphin pods and whales cruise loops in the open sea (found at load where
// the water is open all round) and can be seen from boats and the shore: dolphins leap clear
// of the water every few seconds, whales surface to blow and now and then breach with a huge
// splash. They are updated only while a camera is within POD_SEE m.
import * as THREE from 'three';
import { SEA_LEVEL } from '../config.js';
import { Species, rig, hash, rng, cameraUnder, BODY, FL, FR, BL, BR, TAIL, HEAD, WING_L, WING_R, JAW, TENT } from './critters.js';

const CELL = 20, REACH = 52, POD_SEE = 420;

// ---- models (facing +z, centred, about 1 unit = 1 m) ------------------------------------------
const EYE = 0x1c1c28;
const eyes = (b, x, y, z, r = 0.035) => { for (const s of [-1, 1]) { b.sphere(r * 1.5, 0xffffff, [s * x, y, z], null, 8); b.sphere(r, EYE, [s * (x + r * 0.7), y, z + r * 0.4], null, 6); } };

function fishGeo() { // tintable reef fish: body takes the instance colour
  return rig([{ build: (b) => {
    b.sphere(0.2, 0xffffff, [0, 0, 0], [0.42, 0.85, 1.2], 10);
    b.add(new THREE.ConeGeometry(0.14, 0.2, 4), 0xffffff, [0, 0, -0.3], [-Math.PI / 2, 0, 0], [0.35, 1, 1.3]);
    b.box(0.03, 0.12, 0.22, 0xffffff, [0, 0.17, -0.02]);
    eyes(b, 0.07, 0.04, 0.13, 0.025);
  } }]);
}
function clownGeo() {
  return rig([{ build: (b) => {
    b.sphere(0.18, 0xff7a1a, [0, 0, 0], [0.5, 0.75, 1.15], 14);
    for (const [z, w] of [[0.1, 0.145], [-0.08, 0.16]]) b.add(new THREE.CylinderGeometry(1, 1, 0.045, 14), 0xffffff, [0, 0, z], [Math.PI / 2, 0, 0], [w * 0.53, 1, w * 0.8]);
    b.add(new THREE.ConeGeometry(0.12, 0.16, 4), 0xff7a1a, [0, 0, -0.26], [-Math.PI / 2, 0, 0], [0.35, 1, 1.2]);
    eyes(b, 0.07, 0.04, 0.12, 0.022);
  } }]);
}
function angelGeo() {
  return rig([{ build: (b) => {
    b.sphere(0.2, 0xffd23f, [0, 0, 0], [0.22, 1.0, 0.85], 10);
    for (const z of [0.05, -0.08]) b.box(0.1, 0.36, 0.035, 0x2a5cd8, [0, 0, z]);
    b.add(new THREE.ConeGeometry(0.1, 0.4, 4), 0xffd23f, [0, 0.3, -0.12], [0.5, 0, 0], [0.2, 1, 1]);
    b.add(new THREE.ConeGeometry(0.1, 0.4, 4), 0xffd23f, [0, -0.3, -0.12], [Math.PI - 0.5, 0, 0], [0.2, 1, 1]);
    b.add(new THREE.ConeGeometry(0.1, 0.14, 4), 0x2a5cd8, [0, 0, -0.22], [-Math.PI / 2, 0, 0], [0.3, 1, 1.4]);
    eyes(b, 0.04, 0.05, 0.11, 0.022);
  } }]);
}
function pufferGeo() {
  return rig([{ build: (b) => {
    b.sphere(0.24, 0xf2d27a, [0, 0, 0], null, 12);
    b.sphere(0.2, 0xfff4d8, [0, -0.06, 0.02], [1, 0.8, 1], 10);
    for (let i = 0; i < 14; i++) { const a = i * 2.4, y = Math.cos(i * 0.9) * 0.6; const d = new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - y * y), y, Math.sin(a) * Math.sqrt(1 - y * y)); b.add(new THREE.ConeGeometry(0.025, 0.09, 4), 0xc89a4a, d.clone().multiplyScalar(0.25).toArray(), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); }
    b.add(new THREE.ConeGeometry(0.08, 0.12, 4), 0xf2d27a, [0, 0, -0.28], [-Math.PI / 2, 0, 0]);
    eyes(b, 0.12, 0.08, 0.18, 0.035);
  } }]);
}
function sharkGeo() { // ~2.8 m, nose at z +1.4
  return rig([
    { build: (b) => {
      b.sphere(0.5, 0x7d8ea8, [0, 0, 0.1], [0.62, 0.7, 2.6], 14);
      b.sphere(0.46, 0xeef2f6, [0, -0.12, 0.25], [0.55, 0.5, 2.3], 12);
      b.add(new THREE.ConeGeometry(0.32, 0.6, 4), 0x6e7f99, [0, 0.55, 0.0], [-0.35, 0, 0], [0.25, 1, 1]);   // dorsal fin
      b.add(new THREE.ConeGeometry(0.3, 0.7, 4), 0x6e7f99, [0, 0.38, -1.38], [-0.9, 0, 0], [0.18, 1, 1]);   // tail top
      b.add(new THREE.ConeGeometry(0.22, 0.45, 4), 0x6e7f99, [0, -0.15, -1.3], [-2.3, 0, 0], [0.18, 1, 1]); // tail bottom
      for (let i = 0; i < 3; i++) b.box(0.02, 0.18, 0.02, 0x5a6a80, [0.31, 0.05, 0.62 - i * 0.09]);
      eyes(b, 0.22, 0.12, 0.95, 0.045);
      b.box(0.28, 0.025, 0.04, 0x3a2a3a, [0, -0.14, 1.12]); // grin
    } },
    { part: WING_L, pivot: [0.28, -0.12, 0.45], build: (b) => b.box(0.55, 0.05, 0.3, 0x6e7f99, [0.55, -0.2, 0.4], [0, 0.3, -0.35]) },
    { part: WING_R, pivot: [-0.28, -0.12, 0.45], build: (b) => b.box(0.55, 0.05, 0.3, 0x6e7f99, [-0.55, -0.2, 0.4], [0, -0.3, 0.35]) },
  ]);
}
function dolphinGeo() { // ~2.2 m
  return rig([
    { build: (b) => {
      b.sphere(0.42, 0x6fa3d8, [0, 0, 0], [0.75, 0.8, 2.4], 14);
      b.sphere(0.36, 0xdfefff, [0, -0.1, 0.15], [0.7, 0.6, 2.1], 12);
      b.sphere(0.12, 0x6fa3d8, [0, -0.08, 1.05], [0.8, 0.6, 1.6], 8); // beak
      b.add(new THREE.ConeGeometry(0.22, 0.42, 4), 0x5a8cc0, [0, 0.38, -0.1], [-0.5, 0, 0], [0.25, 1, 1]);
      b.box(0.7, 0.04, 0.22, 0x5a8cc0, [0, 0, -1.08]); // flukes
      eyes(b, 0.25, 0.08, 0.68, 0.04);
      b.box(0.2, 0.02, 0.03, 0x2a3a5a, [0, -0.13, 0.95]);
    } },
    { part: WING_L, pivot: [0.22, -0.15, 0.35], build: (b) => b.box(0.4, 0.04, 0.18, 0x5a8cc0, [0.4, -0.22, 0.3], [0, 0.3, -0.4]) },
    { part: WING_R, pivot: [-0.22, -0.15, 0.35], build: (b) => b.box(0.4, 0.04, 0.18, 0x5a8cc0, [-0.4, -0.22, 0.3], [0, -0.3, 0.4]) },
  ]);
}
function whaleGeo() { // humpback ~9 m
  return rig([
    { build: (b) => {
      b.sphere(1.5, 0x2c3e66, [0, 0, 0], [1.05, 0.95, 3.0], 16);
      b.sphere(1.35, 0xc8d4e8, [0, -0.45, 0.6], [1.0, 0.6, 2.6], 14);
      for (let i = 0; i < 5; i++) b.box(0.06, 0.04, 3.0, 0x9aa8c4, [-0.6 + i * 0.3, -1.25, 1.2]); // throat grooves
      b.sphere(0.5, 0x2c3e66, [0, 0.9, -1.0], [0.6, 0.8, 1.4], 8); // hump
      b.box(3.2, 0.12, 0.9, 0x2c3e66, [0, 0.0, -4.4], [0, 0, 0]);     // flukes
      b.box(1.4, 0.13, 0.7, 0xc8d4e8, [0, -0.06, -4.3]);
      b.sphere(0.35, 0x2c3e66, [0, 0, -3.8], [0.8, 0.7, 1.4], 8);
      eyes(b, 1.2, 0.0, 2.5, 0.12);
      for (const [x, z] of [[0.5, 3.6], [-0.4, 3.9], [0.1, 4.2]]) b.sphere(0.12, 0x46588a, [x, 0.95, z], null, 6); // bumps
    } },
    { part: WING_L, pivot: [1.2, -0.5, 1.4], build: (b) => b.box(3.0, 0.14, 0.7, 0x2c3e66, [2.6, -0.9, 1.1], [0, 0.35, -0.3]) },
    { part: WING_R, pivot: [-1.2, -0.5, 1.4], build: (b) => b.box(3.0, 0.14, 0.7, 0x2c3e66, [-2.6, -0.9, 1.1], [0, -0.35, 0.3]) },
  ]);
}
function jellyGeo() {
  const parts = [{ build: (b) => {
    b.add(new THREE.SphereGeometry(0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, [0, 0, 0], null, [1, 0.85, 1]);
    b.sphere(0.18, 0xffffff, [0, 0.12, 0], null, 8);
    eyes(b, 0.1, 0.16, 0.32, 0.03);
  } }];
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = Math.cos(a) * 0.24, z = Math.sin(a) * 0.24; parts.push({ part: TENT + i, pivot: [x, 0, z], build: (b) => b.cyl(0.025, 0.012, 1.1, 0xffffff, [x, -0.55, z], null, 5) }); }
  parts.push({ part: TENT + 6, pivot: [0, 0, 0], build: (b) => b.cyl(0.06, 0.03, 0.7, 0xffffff, [0, -0.35, 0], null, 6) });
  return rig(parts);
}
function starGeo() {
  return rig([{ build: (b) => {
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.add(new THREE.ConeGeometry(0.09, 0.3, 5), 0xffffff, [Math.sin(a) * 0.14, 0.03, Math.cos(a) * 0.14], [Math.PI / 2, a, 0, 'YXZ'], [1, 1, 0.45]); }
    b.sphere(0.1, 0xffffff, [0, 0.03, 0], [1, 0.45, 1], 8);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.sphere(0.018, 0xfff0d0, [Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15], null, 4); }
  } }]);
}
function crabGeo() {
  const parts = [{ build: (b) => {
    b.sphere(0.2, 0xe2452f, [0, 0.16, 0], [1.3, 0.55, 0.95], 10);
    for (const s of [-1, 1]) { b.cyl(0.015, 0.015, 0.12, 0xe2452f, [s * 0.07, 0.3, 0.1]); b.sphere(0.035, 0xffffff, [s * 0.07, 0.37, 0.1], null, 6); b.sphere(0.02, EYE, [s * 0.07, 0.38, 0.13], null, 5); }
    for (const s of [-1, 1]) { b.box(0.06, 0.05, 0.18, 0xe2452f, [s * 0.22, 0.14, 0.18], [0, s * 0.6, 0]); b.sphere(0.07, 0xf05a3f, [s * 0.3, 0.15, 0.3], [1, 0.7, 1.3], 8); }
  } }];
  [[FL, 1, 0.06], [FR, -1, 0.06], [BL, 1, -0.08], [BR, -1, -0.08]].forEach(([p, s, z]) => parts.push({ part: p, pivot: [s * 0.2, 0.15, z], build: (b) => { b.box(0.22, 0.03, 0.03, 0xc8361f, [s * 0.3, 0.1, z], [0, 0, s * 0.6]); b.box(0.2, 0.03, 0.03, 0xc8361f, [s * 0.3, 0.1, z - 0.07], [0, 0, s * 0.6]); } }));
  return rig(parts);
}
function seahorseGeo() {
  return rig([{ build: (b) => {
    const C = 0xff9a3f;
    b.sphere(0.07, C, [0, 0.32, 0.02], [1, 1.1, 1], 8);                     // head
    b.cyl(0.025, 0.03, 0.1, C, [0, 0.32, 0.1], [Math.PI / 2, 0, 0], 6);      // snout
    for (let i = 0; i < 6; i++) b.sphere(0.075 - i * 0.008, C, [0, 0.22 - i * 0.06, -0.02 + Math.sin(i * 0.8) * 0.04], null, 7);
    b.torus(0.05, 0.015, C, [0, -0.15, 0.03], [0, Math.PI / 2, 0], 10);    // curled tail
    b.box(0.01, 0.1, 0.06, 0xffc06a, [0, 0.16, -0.08]);                     // fin
    eyes(b, 0.05, 0.34, 0.04, 0.018);
  } }]);
}
function octopusGeo() {
  const C = 0xd8507a, parts = [{ build: (b) => {
    b.sphere(0.42, C, [0, 0.62, -0.08], [1, 1.15, 1.05], 14);
    b.sphere(0.3, C, [0, 0.32, 0.05], [1.1, 0.7, 1.1], 12);
    eyes(b, 0.14, 0.42, 0.32, 0.055);
    for (const [x, y, z] of [[0.2, 0.85, 0.2], [-0.25, 0.7, 0.28], [0.05, 1.0, 0.0]]) b.sphere(0.05, 0xf28aa8, [x, y, z], null, 6);
  } }];
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    parts.push({ part: TENT + i, pivot: [dx * 0.25, 0.32, dz * 0.25], build: (b) => {
      // a chain of shrinking beads: down to the bed, out along it, the tip curling up
      for (let k = 0; k < 9; k++) {
        const u = k / 8, out = 0.28 + u * 0.75, y = Math.max(0.05, 0.3 - u * 0.6) + Math.max(0, u - 0.75) * 0.7;
        b.sphere(0.085 - u * 0.06, C, [dx * out, y, dz * out], null, 7);
      }
    } });
  }
  return rig(parts);
}
function turtleGeo() {
  return rig([
    { build: (b) => {
      b.sphere(0.6, 0x5f8a3a, [0, 0, 0], [1, 0.38, 1.25], 12);
      for (const [x, z] of [[0, 0.2], [0.25, -0.15], [-0.25, -0.15], [0, -0.45]]) b.sphere(0.18, 0x7aa64a, [x, 0.17, z], [1, 0.3, 1], 6);
      b.sphere(0.56, 0xd8c88a, [0, -0.08, 0], [1, 0.2, 1.2], 10);
      b.sphere(0.2, 0x9ab86a, [0, 0.02, 0.85], [1, 0.9, 1.2], 10);
      eyes(b, 0.11, 0.08, 0.98, 0.035);
      b.cone(0.08, 0.2, 0x9ab86a, [0, 0, -0.78], [-Math.PI / 2, 0, 0], 5);
    } },
    { part: WING_L, pivot: [0.45, 0, 0.4], build: (b) => b.box(0.55, 0.05, 0.22, 0x9ab86a, [0.75, -0.02, 0.35], [0, 0.4, 0]) },
    { part: WING_R, pivot: [-0.45, 0, 0.4], build: (b) => b.box(0.55, 0.05, 0.22, 0x9ab86a, [-0.75, -0.02, 0.35], [0, -0.4, 0]) },
    { part: BL, pivot: [0.35, 0, -0.5], build: (b) => b.box(0.25, 0.05, 0.2, 0x9ab86a, [0.45, -0.02, -0.6]) },
    { part: BR, pivot: [-0.35, 0, -0.5], build: (b) => b.box(0.25, 0.05, 0.2, 0x9ab86a, [-0.45, -0.02, -0.6]) },
  ]);
}
function mantaGeo() { // ~3.4 m wingspan
  return rig([
    { build: (b) => {
      b.sphere(0.5, 0x2e3550, [0, 0, 0], [1, 0.32, 1.3], 12);
      b.sphere(0.45, 0xeeeef6, [0, -0.06, 0.05], [0.95, 0.22, 1.2], 10);
      for (const s of [-1, 1]) b.box(0.08, 0.06, 0.35, 0x2e3550, [s * 0.25, 0, 0.75], [0, s * 0.25, 0]); // horn-lobes
      eyes(b, 0.36, 0.06, 0.45, 0.04);
    } },
    { part: TAIL, pivot: [0, 0, -0.6], build: (b) => b.cyl(0.02, 0.01, 1.4, 0x2e3550, [0, 0, -1.3], [Math.PI / 2, 0, 0], 5) },
    { part: WING_L, pivot: [0.4, 0, 0], build: (b) => b.add(new THREE.ConeGeometry(0.5, 1.5, 3), 0x2e3550, [1.15, 0, -0.05], [0, 0, -Math.PI / 2], [1, 1, 0.12]) },
    { part: WING_R, pivot: [-0.4, 0, 0], build: (b) => b.add(new THREE.ConeGeometry(0.5, 1.5, 3), 0x2e3550, [-1.15, 0, -0.05], [0, 0, Math.PI / 2], [1, 1, 0.12]) },
  ]);
}
function plesioGeo() { // friendly long-necked plesiosaur, ~7 m
  const G = 0x4f9a7a, L = 0xbfe3c8;
  return rig([
    { build: (b) => {
      b.sphere(1.1, G, [0, 0, 0], [1.0, 0.7, 1.6], 14);
      b.sphere(1.0, L, [0, -0.25, 0.1], [0.9, 0.45, 1.45], 12);
      for (let i = 0; i < 4; i++) b.sphere(0.28 - i * 0.05, G, [0, 0.05, -1.7 - i * 0.45], null, 8); // tail
      for (const [x, z] of [[0.4, 0.4], [-0.3, -0.3], [0.1, -0.8]]) b.sphere(0.18, 0x3c7a5e, [x, 0.7, z], [1, 0.4, 1], 6);
    } },
    { part: HEAD, pivot: [0, 0.3, 1.4], build: (b) => {
      for (let i = 0; i < 14; i++) { const k = i / 13; b.sphere(0.36 - k * 0.14, G, [0, 0.3 + Math.sin(k * 1.6) * 1.9, 1.5 + k * 1.9], null, 9); }
      b.sphere(0.32, G, [0, 2.3, 3.55], [1, 0.9, 1.3], 10);
      b.sphere(0.24, L, [0, 2.18, 3.75], [1, 0.6, 1.2], 8);
      eyes(b, 0.2, 2.42, 3.7, 0.055);
      b.box(0.24, 0.025, 0.05, 0x2a4a3a, [0, 2.2, 3.98]);
    } },
    { part: WING_L, pivot: [0.8, -0.2, 0.6], build: (b) => b.sphere(0.7, G, [1.5, -0.35, 0.55], [1, 0.12, 0.35], 8) },
    { part: WING_R, pivot: [-0.8, -0.2, 0.6], build: (b) => b.sphere(0.7, G, [-1.5, -0.35, 0.55], [1, 0.12, 0.35], 8) },
    { part: BL, pivot: [0.7, -0.2, -0.8], build: (b) => b.sphere(0.55, G, [1.2, -0.35, -0.9], [1, 0.12, 0.35], 8) },
    { part: BR, pivot: [-0.7, -0.2, -0.8], build: (b) => b.sphere(0.55, G, [-1.2, -0.35, -0.9], [1, 0.12, 0.35], 8) },
  ]);
}
function sprayGeo() { return rig([{ build: (b) => b.add(new THREE.IcosahedronGeometry(1, 1), 0xffffff) }]); }

// ---- the under-water cells -----------------------------------------------------------------------
const WARM = ['#ff7a8a', '#3f8cff', '#ffd23f', '#3fe0d0', '#b46cff', '#ff8a1a', '#5ad85a'];
const COLD = ['#c8d4e0', '#9fb4c8', '#d8dce0', '#b4c0cc'];

export function buildSeaLife(game) {
  const T = game.terrain, S = {};
  const mk = (name, geo, max, opts = {}) => (S[name] = new Species(game, geo, { max, name, ...opts }));
  mk('fish', fishGeo(), 260, { mode: 'swim', tint: true, k: { WAVEK: 9, WAVEA: 0.05, TAILZ: 0.6 } });
  mk('clown', clownGeo(), 60, { mode: 'swim', k: { WAVEK: 9, WAVEA: 0.05, TAILZ: 0.5 } });
  mk('angel', angelGeo(), 60, { mode: 'swim', k: { WAVEK: 8, WAVEA: 0.04, TAILZ: 0.4 } });
  mk('puffer', pufferGeo(), 16, { mode: 'swim', k: { WAVEK: 6, WAVEA: 0.03, TAILZ: 0.5 } });
  mk('jelly', jellyGeo(), 40, { mode: 'pulse', tint: true, material: { transparent: true, opacity: 0.72, depthWrite: false } });
  mk('star', starGeo(), 80, { tint: true });
  mk('crab', crabGeo(), 30, { k: { LEG: 0.5 } });
  mk('seahorse', seahorseGeo(), 16);
  mk('octopus', octopusGeo(), 10);
  mk('turtle', turtleGeo(), 8, { k: { FLAP: 0.5, LEG: 0.3 } });
  mk('manta', mantaGeo(), 6, { k: { FLAP: 0.45, TAILA: 0.2 } });
  mk('shark', sharkGeo(), 8, { mode: 'swim', k: { WAVEK: 1.6, WAVEA: 0.22, TAILZ: 2.8, FLAP: 0.12 } });
  mk('plesio', plesioGeo(), 2, { k: { FLAP: 0.45, LEG: 0.4 } });
  const under = Object.values(S);

  const cells = new Map();
  const cellAt = (ix, iz) => {
    const key = ix + ',' + iz;
    let c = cells.get(key);
    if (c) return c;
    if (cells.size > 800) cells.clear();
    c = genCell(ix, iz);
    cells.set(key, c);
    return c;
  };
  const inLake = (x, y, z) => { const l = game.physics.waterLevel(x, y, z); return l !== null && l !== SEA_LEVEL; };
  function genCell(ix, iz) {
    const x0 = ix * CELL, z0 = iz * CELL, cx = x0 + CELL / 2, cz = z0 + CELL / 2;
    const bed = T.groundAt(cx, cz), depth = SEA_LEVEL - bed, list = [];
    if (depth < 1.3 || inLake(cx, bed, cz)) return list;
    const r = rng(hash(ix, iz, 3)), warm = cz > 300 || (cx > 250 && cz > 150), cold = cz < -560;
    const spot = (pad = 2) => { const x = x0 + pad + r() * (CELL - pad * 2), z = z0 + pad + r() * (CELL - pad * 2); return [x, z, T.groundAt(x, z)]; };
    // fish schools
    const schools = depth > 2 ? (r() < 0.75 ? 1 : 0) + (r() < 0.35 ? 1 : 0) : (r() < 0.4 ? 1 : 0);
    for (let s = 0; s < schools; s++) {
      const [x, z] = spot(5), kind = warm ? (r() < 0.6 ? 'fish' : r() < 0.5 ? 'clown' : 'angel') : 'fish';
      const pal = warm ? WARM : COLD, col = pal[(r() * pal.length) | 0], n = kind === 'fish' ? 7 + ((r() * 8) | 0) : 4 + ((r() * 4) | 0);
      list.push({ t: 'school', kind, x, z, R: 1.8 + r() * 2.5, w: (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.4), n, col, h: r(), seed: r() * 100, cold });
    }
    if (warm && depth > 1.8 && r() < 0.25) { const [x, z] = spot(4); list.push({ t: 'puffer', x, z, seed: r() * 100 }); }
    // jellyfish drift in mid water (more of them in the cold north)
    const nj = depth > 3 ? (r() < (cold ? 0.6 : 0.25) ? 1 + ((r() * 3) | 0) : 0) : 0;
    for (let i = 0; i < nj; i++) { const [x, z] = spot(3); list.push({ t: 'jelly', x, z, seed: r() * 100, col: ['#ff9ad8', '#9ad8ff', '#d8b4ff', '#ffd0a0'][(r() * 4) | 0] }); }
    // on the bed
    if (depth < 14) for (let i = 0, n = r() < 0.6 ? 1 + ((r() * 3) | 0) : 0; i < n; i++) { const [x, z, g] = spot(1); list.push({ t: 'star', x, z, y: g, yaw: r() * 6.3, s: 0.8 + r() * 0.7, col: ['#ff8a3d', '#ff4d5a', '#b46cff', '#ffd23f', '#ff7ad9'][(r() * 5) | 0] }); }
    if (r() < 0.35) for (let i = 0, n = 1 + ((r() * 2) | 0); i < n; i++) { const [x, z, g] = spot(2); list.push({ t: 'crab', x, z, y: g, yaw: r() * 6.3, seed: r() * 100 }); }
    if (warm && depth < 8 && r() < 0.15) { const [x, z, g] = spot(3); list.push({ t: 'seahorse', x, z, y: g, seed: r() * 100 }); }
    if (depth > 2.5 && r() < 0.12) { const [x, z, g] = spot(4); list.push({ t: 'octopus', x, z, y: g, yaw: r() * 6.3, seed: r() * 100 }); }
    // bigger swimmers circle round the middle of their square
    if (depth > 2.5 && r() < 0.07) list.push({ t: 'turtle', x: cx, z: cz, R: 5 + r() * 3, seed: r() * 100 });
    if (depth > 5 && r() < 0.045) list.push({ t: 'manta', x: cx, z: cz, R: 6 + r() * 3, seed: r() * 100 });
    if (depth > 4.5 && r() < 0.06) list.push({ t: 'shark', x: cx, z: cz, R: 7 + r() * 3, seed: r() * 100 });
    if (depth > 6.5 && r() < 0.008) list.push({ t: 'plesio', x: cx, z: cz, R: 8, seed: r() * 100 });
    return list;
  }

  // keep a swimmer between the bed and the surface
  const swimY = (x, z, want, clear = 0.5, top = 0.5) => { const g = T.groundAt(x, z); return Math.max(g + clear, Math.min(SEA_LEVEL - top, want)); };
  const circle = (o, t, v, depthK, clear, top, sp, scale, phaseK, amp = 1, bob = 0.3) => {
    const w = v / o.R, a = t * w + o.seed, x = o.x + Math.cos(a) * o.R, z = o.z + Math.sin(a) * o.R;
    const g = T.groundAt(x, z), y = swimY(x, z, g + (SEA_LEVEL - g) * depthK + Math.sin(t * 0.4 + o.seed) * bob, clear, top);
    sp.put(x, y, z, Math.atan2(-Math.sin(a), Math.cos(a)), Math.sin(t * 0.3 + o.seed) * 0.08, 0, scale, t * phaseK + o.seed, amp);
  };
  const fill = (o, t) => {
    switch (o.t) {
      case 'school': {
        const sp = S[o.kind], sx = o.x + Math.sin(t * 0.05 + o.seed) * 3, sz = o.z + Math.cos(t * 0.04 + o.seed) * 3;
        const g = T.groundAt(sx, sz), mid = g + (SEA_LEVEL - g) * (0.25 + o.h * 0.5);
        for (let i = 0; i < o.n; i++) {
          const k = hash(o.seed, i), a = t * o.w + k * 6.28, rr = o.R + (hash(i, o.seed) - 0.5) * 1.4;
          const x = sx + Math.cos(a) * rr, z = sz + Math.sin(a) * rr, y = swimY(x, z, mid + (k - 0.5) * 1.2 + Math.sin(t * 1.3 + i) * 0.12, 0.35, 0.4);
          sp.put(x, y, z, Math.atan2(-Math.sin(a) * o.w, Math.cos(a) * o.w), 0, 0, (0.8 + k * 0.5) * (o.cold ? 1.2 : 1), t * 11 + i, 1, o.kind === 'fish' ? o.col : undefined);
        }
        break;
      }
      case 'puffer': { const a = t * 0.15 + o.seed, x = o.x + Math.sin(a) * 2, z = o.z + Math.cos(a * 0.8) * 2, puff = 1 + 0.5 * Math.max(0, Math.sin(t * 0.25 + o.seed) * 3 - 2);
        S.puffer.put(x, swimY(x, z, SEA_LEVEL - 1.6, 0.5), z, a + Math.PI / 2, 0, 0, puff, t * 5, 0.6); break; }
      case 'jelly': { const x = o.x + Math.sin(t * 0.07 + o.seed) * 1.5, z = o.z + Math.cos(t * 0.06 + o.seed) * 1.5, g = T.groundAt(x, z);
        const y = swimY(x, z, g + (SEA_LEVEL - g) * (0.45 + 0.25 * Math.sin(t * 0.12 + o.seed)), 1.4, 0.6);
        S.jelly.put(x, y, z, t * 0.2 + o.seed, 0, 0, 0.9 + hash(o.seed) * 0.5, t * 2.4 + o.seed, 1, o.col); break; }
      case 'star': S.star.put(o.x, o.y + 0.01, o.z, o.yaw + t * 0.01, 0, 0, o.s, 0, 0, o.col); break;
      case 'crab': { const k = Math.sin(t * 0.5 + o.seed), side = Math.cos(t * 0.5 + o.seed);
        const x = o.x + Math.cos(o.yaw) * k * 1.2, z = o.z - Math.sin(o.yaw) * k * 1.2;
        S.crab.put(x, T.groundAt(x, z), z, o.yaw, 0, 0, 1, t * 14, Math.min(1, Math.abs(side) * 1.5)); break; }
      case 'seahorse': S.seahorse.put(o.x, o.y + 0.8 + Math.sin(t * 0.8 + o.seed) * 0.25, o.z, t * 0.15 + o.seed, 0, 0, 1.4, 0, 0); break;
      case 'octopus': { const k = Math.sin(t * 0.08 + o.seed), x = o.x + k * 1.5, z = o.z + Math.cos(t * 0.06 + o.seed) * 1.5;
        S.octopus.put(x, T.groundAt(x, z) + 0.02, z, o.yaw + k, 0, 0, 1.1, t * 1.6 + o.seed, 0.8); break; }
      case 'turtle': circle(o, t, 0.9, 0.55, 0.8, 0.8, S.turtle, 1, 2.2); break;
      case 'manta': circle(o, t, 1.4, 0.6, 1.2, 1.0, S.manta, 1, 1.8); break;
      case 'shark': circle(o, t, 2.4, 0.5, 1.0, 1.1, S.shark, 1.1, 5); break;
      case 'plesio': circle(o, t, 1.6, 0.55, 1.6, 1.2, S.plesio, 1, 1.3); break;
    }
  };

  // ---- dolphins and whales: loops in the open sea --------------------------------------------
  const pods = findPods(game);
  const dol = new Species(game, dolphinGeo(), { max: pods.filter((p) => p.kind === 'dolphin').length * 4 + 1, name: 'dolphin', mode: 'swimv', k: { WAVEK: 1.8, WAVEA: 0.12, TAILZ: 2.2, FLAP: 0.15 } });
  const wha = new Species(game, whaleGeo(), { max: pods.filter((p) => p.kind === 'whale').length + 1, name: 'whale', mode: 'swimv', k: { WAVEK: 0.5, WAVEA: 0.35, TAILZ: 9, FLAP: 0.2 } });
  const spray = new Species(game, sprayGeo(), { max: 200, name: 'spray', material: { transparent: true, opacity: 0.8, color: 0xffffff, emissive: 0x6a7a8a } });
  const drops = []; // { x, y, z, vx, vy, vz, life, s }
  const splash = (x, z, n, power, size) => {
    for (let i = 0; i < n && drops.length < 200; i++) { const a = Math.random() * 6.28, h = Math.random(); drops.push({ x, y: SEA_LEVEL, z, vx: Math.cos(a) * power * (0.3 + h * 0.5), vy: power * (0.8 + Math.random() * 0.8), vz: Math.sin(a) * power * (0.3 + h * 0.5), life: 1, s: size * (0.35 + Math.random() * 0.4) }); }
  };
  const spout = (x, y, z) => { for (let i = 0; i < 24 && drops.length < 200; i++) drops.push({ x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 1.2, vy: 7 + Math.random() * 4, vz: (Math.random() - 0.5) * 1.2, life: 1, s: 0.18 + Math.random() * 0.2 }); };
  const near = (x, z, r) => game.players.some((p) => { const c = p.camera?.cam?.position; return c && (c.x - x) ** 2 + (c.z - z) ** 2 < r * r; });
  const sound = (name, x, y, z, r, cool) => { if (near(x, z, r) && game.audio?.cooled?.(name + Math.round(x), cool)) game.audio.play(name, { x, y, z }); };
  const podPos = (p, t, back = 0, side = 0) => {
    const a = p.a0 + p.dir * (t * p.v - back) / p.R, x = p.x + Math.cos(a) * (p.R + side), z = p.z + Math.sin(a) * (p.R + side);
    return [x, z, Math.atan2(-Math.sin(a) * p.dir, Math.cos(a) * p.dir)];
  };
  function fillPods(t) {
    dol.begin(); wha.begin();
    for (const p of pods) {
      if (!near(p.x, p.z, POD_SEE + p.R)) continue;
      if (p.kind === 'dolphin') {
        for (let i = 0; i < 4; i++) {
          const [x, z, yaw] = podPos(p, t, i * 3.2, ((i % 2) * 2 - 1) * (1 + i * 0.6));
          const P = 5.5 + i * 0.9, u = ((t + i * 1.7 + p.seed) % P) / P, L = 0.2; // leap during the first L of each cycle
          let y = SEA_LEVEL - 1.5 + Math.sin(t * 0.9 + i) * 0.25, pitch = Math.cos(t * 0.9 + i) * 0.1;
          if (u < L) {
            const s = u / L, H = 2.4 + (i % 2) * 0.6, run = p.v * P * L;
            y = SEA_LEVEL - 1.0 + (H + 1.0) * Math.sin(Math.PI * s); pitch = Math.atan2((H + 1.0) * Math.PI * Math.cos(Math.PI * s), run);
            const key = 'd' + i; const st = p.st[key] ||= { out: false };
            const above = y > SEA_LEVEL;
            if (above !== st.out) { st.out = above; if (near(x, z, 160)) splash(x, z, 14, 3.5, 0.2); sound('splash', x, SEA_LEVEL, z, 60, 0.4); }
          }
          dol.put(x, y, z, yaw, pitch, 0, 1, t * 7 + i, 1);
          if (i === 0) sound('dolphin', x, y, z, 70, 6);
        }
      } else {
        // a 48 s cycle: cruise down, surface and blow twice, dive showing the flukes; every 3rd
        // cycle it breaches instead (rises nose-first out of the water and crashes down on its side)
        const C = 48, n = Math.floor((t + p.seed) / C), u = ((t + p.seed) % C) / C, breach = n % 3 === 2;
        const [x, z, yaw] = podPos(p, t);
        let y = SEA_LEVEL - 4.4, pitch = 0, roll = 0;
        if (!breach) {
          if (u > 0.62 && u < 0.86) { y = SEA_LEVEL - 1.35 + Math.sin(t * 0.8) * 0.12; }
          else if (u >= 0.55 && u <= 0.62) { const s = (u - 0.55) / 0.07; y = SEA_LEVEL - 4.4 + 3.05 * s; pitch = 0.15; }
          else if (u >= 0.86 && u < 0.95) { const s = (u - 0.86) / 0.09; y = SEA_LEVEL - 1.35 - 3.0 * s; pitch = -0.45 * Math.sin(Math.PI * s); }
          const st = p.st.w ||= { blow: -1 };
          for (const b of [0.66, 0.78]) if (u > b && st.blow < b) { st.blow = b; const fx = x + Math.sin(yaw) * 3.4, fz = z + Math.cos(yaw) * 3.4; if (near(x, z, POD_SEE)) spout(fx, SEA_LEVEL + 0.2, fz); sound('whale', x, y, z, 200, 10); }
          if (u < 0.6) st.blow = -1;
        } else if (u > 0.55 && u < 0.75) {
          const s = (u - 0.55) / 0.2, st = p.st.b ||= { up: false, down: false };
          if (s < 0.45) { const k = s / 0.45; y = SEA_LEVEL - 4.4 + k * k * 9.6; pitch = 0.2 + 1.0 * k; }
          else if (s < 0.75) { const k = (s - 0.45) / 0.3; y = SEA_LEVEL + 5.2 - k * k * 6.2; pitch = 1.2 - k * 0.9; roll = k * 1.4; }
          else { const k = (s - 0.75) / 0.25; y = SEA_LEVEL - 1.0 - 3.4 * k; pitch = 0.3 * (1 - k); roll = 1.4 * (1 - k); }
          if (s > 0.2 && !st.up) { st.up = true; if (near(x, z, POD_SEE)) splash(x + Math.sin(yaw) * 3, z + Math.cos(yaw) * 3, 50, 6, 0.45); sound('splash', x, SEA_LEVEL, z, 160, 1); sound('whale', x, y, z, 260, 6); }
          if (s > 0.68 && !st.down) { st.down = true; if (near(x, z, POD_SEE)) splash(x, z, 90, 9, 0.6); sound('splash', x, SEA_LEVEL, z, 220, 1); }
        } else { p.st.b = null; }
        wha.put(x, y, z, yaw, pitch, roll, 1, t * 1.1, 1);
      }
    }
    dol.end(); wha.end();
  }
  function fillSpray(dt) {
    spray.begin();
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.life -= dt * 0.8;
      if (d.life <= 0 || (d.y < SEA_LEVEL - 0.3 && d.vy < 0)) { drops.splice(i, 1); continue; }
      spray.put(d.x, d.y, d.z, 0, 0, 0, d.s * (0.4 + d.life * 0.6), 0, 0);
    }
    spray.end();
  }

  // ---- per frame -------------------------------------------------------------------------------
  const seen = new Set();
  const stats = game.seaLife = { cells: 0, creatures: 0, pods: pods.length, species: S, pods_: pods };
  game.updaters.push((dt, t) => {
    fillPods(t);
    if (drops.length || spray.n) fillSpray(dt);
    // under-water cameras only
    const cams = [];
    for (const p of game.players) if (p.camera?.underwater) cams.push(p.camera.cam.position);
    if (!cams.length) { if (stats.creatures) { for (const s of under) { s.begin(); s.end(); } stats.creatures = 0; stats.cells = 0; } return; }
    for (const s of under) s.begin();
    seen.clear();
    const span = Math.ceil(REACH / CELL);
    for (const c of cams) {
      const ix0 = Math.floor(c.x / CELL), iz0 = Math.floor(c.z / CELL);
      for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
        const ix = ix0 + i, iz = iz0 + j, dx = (ix + 0.5) * CELL - c.x, dz = (iz + 0.5) * CELL - c.z;
        if (dx * dx + dz * dz > REACH * REACH) continue;
        const key = ix * 100003 + iz;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const o of cellAt(ix, iz)) fill(o, t);
      }
    }
    let n = 0;
    for (const s of under) { s.end(); n += s.n; }
    stats.cells = seen.size; stats.creatures = n;
  });
  // drawn only in views whose camera is under water
  (game.viewHooks ||= []).push((cam) => { const u = cameraUnder(game, cam); for (const s of under) s.mesh.visible = u && s.n > 0; });
}

// Loops for dolphin pods and whales: open sea all round (no region within reach), spread out,
// the first pod of each kind nearest the home island so they're easy to come across.
function findPods(game) {
  const T = game.terrain, out = [];
  const open = (x, z, R, pad) => {
    for (let k = 0; k < 20; k++) { const a = k / 20 * 6.28; for (const rr of [R - pad, R + pad]) { const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; if (Math.abs(px) > 1420 || Math.abs(pz) > 1420 || T.regionAt(px, pz) || T.groundAt(px, pz) > SEA_LEVEL - 6) return false; } }
    return true;
  };
  const pick = (kind, R, pad, count, spacing) => {
    const cand = [];
    for (let x = -1300; x <= 1300; x += 40) for (let z = -1300; z <= 1300; z += 40) if (open(x, z, R, pad)) cand.push([x, z]);
    cand.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    const chosen = [];
    for (const c of cand) {
      if (chosen.length >= count) break;
      if (chosen.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) < spacing) || out.some((o) => Math.hypot(o.x - c[0], o.z - c[1]) < o.R + R + 30)) continue;
      chosen.push(c);
    }
    chosen.forEach(([x, z], i) => out.push({ kind, x, z, R, v: kind === 'dolphin' ? 6.5 : 2.4, dir: i % 2 ? 1 : -1, a0: hash(x, z) * 6.28, seed: hash(z, x) * 50, st: {} }));
  };
  pick('dolphin', 45, 14, 6, 260);
  pick('whale', 70, 16, 3, 500);
  return out;
}
