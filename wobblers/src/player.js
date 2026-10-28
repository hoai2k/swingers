// The wobbly character: an active ragdoll of 11 rigid bodies held upright by
// "magic" balance forces (a hover spring under the hips and world-space
// upright torques on hips and chest) while every joint is driven toward an
// animated pose by PD torques. Turning the forces down makes it go limp.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { DT, ALL, groups, playerBit, G_STATIC, G_VEH, HATS, PLAYER_COLORS } from './config.js';
import { buildExtraHat } from './hats.js';
import { mergeGeometries, mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { Builder, faceMaterials, matVC } from './mesh.js';
import { emoteStep } from './emotes.js'; // emotes: pose overrides after animate()
import { STYLE, FACE_FLAT, charMat, outlineMat, skinTone } from './charstyle.js'; // look styles to compare (?style=)

export const S = 0.8; // overall character scale
const UP = new THREE.Vector3(0, 1, 0);

// Rest pose, standing on y = 0, facing +Z. Left is +X.
const PARTS = [
  { n: 'hips', shape: 'ball', r: 0.22, pos: [0, 0.6, 0], m: 9 },
  { n: 'chest', parent: 'hips', shape: 'cap', r: 0.27, hh: 0.1, pos: [0, 0.93, 0], joint: [0, 0.72, 0], m: 13 },
  { n: 'head', parent: 'chest', shape: 'ball', r: 0.28, pos: [0, 1.52, 0], joint: [0, 1.24, 0], m: 4 },
  { n: 'uArmL', parent: 'chest', shape: 'cap', r: 0.07, hh: 0.06, pos: [0.34, 0.99, 0], joint: [0.34, 1.12, 0], m: 1.4 },
  { n: 'lArmL', parent: 'uArmL', shape: 'cap', r: 0.065, hh: 0.05, pos: [0.34, 0.745, 0], joint: [0.34, 0.86, 0], m: 1.1, hand: true },
  { n: 'uArmR', parent: 'chest', shape: 'cap', r: 0.07, hh: 0.06, pos: [-0.34, 0.99, 0], joint: [-0.34, 1.12, 0], m: 1.4 },
  { n: 'lArmR', parent: 'uArmR', shape: 'cap', r: 0.065, hh: 0.05, pos: [-0.34, 0.745, 0], joint: [-0.34, 0.86, 0], m: 1.1, hand: true },
  { n: 'uLegL', parent: 'hips', shape: 'cap', r: 0.085, hh: 0.035, pos: [0.12, 0.36, 0], joint: [0.12, 0.48, 0], m: 3 },
  { n: 'lLegL', parent: 'uLegL', shape: 'cap', r: 0.085, hh: 0.035, pos: [0.12, 0.12, 0], joint: [0.12, 0.24, 0], m: 2.4, foot: true },
  { n: 'uLegR', parent: 'hips', shape: 'cap', r: 0.085, hh: 0.035, pos: [-0.12, 0.36, 0], joint: [-0.12, 0.48, 0], m: 3 },
  { n: 'lLegR', parent: 'uLegR', shape: 'cap', r: 0.085, hh: 0.035, pos: [-0.12, 0.12, 0], joint: [-0.12, 0.24, 0], m: 2.4, foot: true },
];
const HAND_OFF = -0.13 * S;   // hand centre below the lower-arm centre
const HAND_R = 0.1 * S;
const GRAB_R = HAND_R * 1.75; // how far from the mitten a grab can catch
const ARM_LEN = 0.505 * S;    // shoulder to mitten centre, arm straight
const CARRY_MAX = 30;         // kg of a held object the arms can fully lift
const ARM_MASS = 2.9;         // upper + lower arm + mitten
const STAND_H = 0.6 * S;      // hover height of the hips centre above ground (feet just touch)
const RAY_LEN = 1.05 * S;

const WALK = 5.3, RUN = 9.4, SWIM = 2.6, JUMP_V = 6.6;
const DASH_V = 15, DASH_SWIM = 7, DASH_T = 0.22; // dash (B / V)
const HEAD_TOP = (1.52 - 0.6 + 0.28) * S + 0.04; // hips centre to the top of the head, standing
const AIR_ACCEL = 16;          // m/s^2 of steering in the air, across and along the jump
const AIR_BRAKE = 6;           // m/s^2 at most against the jump's take-off direction: pulling back bends a jump...
const AIR_KEEP = 0.45;         // ...and never brings it below this share of its take-off speed
const COYOTE = 0.14;          // a jump still works this long after stepping off an edge
const JUMP_BUFFER = 0.14;     // a jump pressed this long before landing still happens
const FOOT_RAYS = [[0.16, 0], [-0.16, 0], [0, 0.16], [0, -0.16]]; // extra ground probes (x S) round the hips
const GETUP_T = 0.95;         // seconds to stand back up after going limp
// Climbing stamina (player.grip, 0..1): hanging on is free (hold on to a ledge, a bar, a ride
// or a flying helicopter for as long as you like); only climbing moves spend it, so you can
// pull up over a few ledges and hop up a few bars in a row, but not climb a building without
// a rest. Standing or swimming rests the arms. With too little left, those moves just don't
// happen: you keep hanging.
const GRIP_REST = 0.6;        // per second back on the ground
const GRIP_HOP = 0.16;        // a jump off a bar / rope while hanging
const GRIP_MANTLE = 0.2;      // pulling up over a ledge
// Hanging off moving rides (kinematic bodies: coaster cars, ferris gondolas,
// swing chairs, ferries): see rideCarry().
const RIDE_FOLLOW = 2.0;      // 1/s: the body eases toward the grip point's velocity
const RIDE_CATCH = 0.7;       // share of the speed difference taken up when the hand closes
const RIDE_TEAR = 0.75;       // m: a hand dragged this far off its grip point lets go
const RIDE_MAXREL = 12;       // m/s: no limb flies off faster than this relative to the ride
const RIDE_MAXSPIN = 14;      // rad/s
const RIDE_ARMDAMP = 0.5;     // share of the arm's spin (relative to the chest) removed per step
const RIDE_LEAD = 0.8;         // steps of ride travel the grip joint is aimed ahead (measured lag)

// ---- look -----------------------------------------------------------------
const SKIN = 0xffd9b8;
const HEAD_R = 0.31 * S;
// soft plastic sheen so the rounded shapes read
let PLAYER_MAT = charMat({ vertexColors: true }); // the look style (charstyle.js) picks the shading
// After a look-style change (game.setCharStyle): drop everything built for the old style.
export function resetCharCaches() { PLAYER_MAT = charMat({ vertexColors: true }); _headMats = null; _headGeo = null; _skinTemplate = null; }
// The head ball (face texture centred on +z). FACE_FLAT squashes the front
// cap so the face sits on a flatter, gently rounded area.
let _headGeo = null;
function headGeometry() {
  if (_headGeo) return _headGeo;
  const g = new THREE.SphereGeometry(HEAD_R, 32, 22);
  if (FACE_FLAT > 0) {
    // z' = z - k (z - c)^2: no crease where it starts, the very front pulled in by k (1 - c)^2
    const P = g.attributes.position, c = 0.3, k = FACE_FLAT / (2 * (1 - c)), N = g.attributes.normal, keep = N.array.slice();
    for (let i = 0; i < P.count; i++) {
      const z = P.getZ(i) / HEAD_R;
      if (z > c) P.setZ(i, (z - k * (z - c) ** 2) * HEAD_R);
    }
    g.computeVertexNormals();
    for (let i = 0; i < P.count; i++) if (P.getZ(i) / HEAD_R <= c) N.setXYZ(i, keep[i * 3], keep[i * 3 + 1], keep[i * 3 + 2]); // the back stays a smooth ball (no seam)
  }
  _headGeo = g;
  return g;
}
const MONO_EYE = new THREE.SphereGeometry(0.075 * 0.8, 12, 8).scale(0.72, 1.25, 0.32), MONO_EYE_MAT = new THREE.MeshBasicMaterial({ color: 0x15151c });
const DRESS_SHIRTS = [0xffffff, 0xffd23f, 0xff8ac8, 0x55d85a, 0xff8a3d, 0x7ad0ff, 0xb98cff, 0xff5a5a, 0x2ab5a5, 0xffe9b0]; // 'dressed' style shirts by colour slot
const HEAD_OUTLINE = new THREE.MeshBasicMaterial({ color: 0x23202a, side: THREE.BackSide });
let _headMats = null;
export function headMaterials() {
  if (!_headMats) {
    const f = faceMaterials();
    const mk = (src) => charMat({ map: src.map });
    _headMats = { normal: mk(f.normal), ko: mk(f.ko), closed: mk(f.closed) };
  }
  return _headMats;
}
// ---- the skin: one skinned mesh per character --------------------------------
// The body, limbs, mittens and shoes are a single THREE.SkinnedMesh, so a
// character is one draw call and bends like one rubbery whole. Its bones:
//  - the per-part groups (`part.mesh`, posed from the ragdoll bodies every frame);
//  - two squash bones (chestSq / hipsSq, children of chest / hips: Player.sync);
//  - a joint bone at every joint (JOINTS: waist, shoulders, elbows, hips, knees),
//    not in the scene graph: its world matrix is set just before the skeleton
//    uploads (poseJoints), at the joint pivot, turned half way between the parent
//    and child parts.
// Each limb is ONE tapered tube (shoulder to wrist, hip to ankle) and torso +
// hips are ONE lathed bean. Across a joint the weights fade parent -> joint
// bone -> child over a band (JOINTS[].h), so a bend spreads over two half-angle
// rotations and the surface curves through it like a rubber hose instead of
// meeting at a hinge. Mittens and shoes ride their part rigidly. The shape is
// built once in the rest pose (feet on y = 0, unscaled units, x S at the end)
// and cloned per character; only the colour attribute differs.
// The head keeps its own mesh (face texture) and sits on the bean's top.
// Outfits, gadgets and NPC props stay rigid meshes inside each part's group.
const JOINTS = [ // parent, child, band half-width (unscaled m); the pivot is the child's PARTS joint
  { n: 'waistJ', P: 'hips', C: 'chest', h: 0.13 },
  ...['L', 'R'].flatMap((s) => [
    { n: 'shJ' + s, P: 'chest', C: 'uArm' + s, h: 0.1 },
    { n: 'elJ' + s, P: 'uArm' + s, C: 'lArm' + s, h: 0.1 },
    { n: 'hipJ' + s, P: 'hips', C: 'uLeg' + s, h: 0.08 },
    { n: 'knJ' + s, P: 'uLeg' + s, C: 'lLeg' + s, h: 0.09 },
  ]),
];
for (const j of JOINTS) {
  const c = PARTS.find((q) => q.n === j.C), p = PARTS.find((q) => q.n === j.P);
  j.pivot = c.joint;
  j.aP = new THREE.Vector3(c.joint[0] - p.pos[0], c.joint[1] - p.pos[1], c.joint[2] - p.pos[2]).multiplyScalar(S); // pivot in each part's frame
  j.aC = new THREE.Vector3(c.joint[0] - c.pos[0], c.joint[1] - c.pos[1], c.joint[2] - c.pos[2]).multiplyScalar(S);
}
const JI = Object.fromEntries(JOINTS.map((j) => [j.C, j]));
const SKIN_BONES = PARTS.map((p) => p.n).concat(['chestSq', 'hipsSq'], JOINTS.map((j) => j.n));
const BI = Object.fromEntries(SKIN_BONES.map((n, i) => [n, i]));
const CK = ['shirt', 'pants', 'skin', 'mitten', 'cuff', 'shoe', 'sole']; // colour keys
const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Weights across a joint. d: distance past the pivot towards the child (rest pose).
function band(j, d, P = j.P, C = j.C) {
  const h = j.h;
  if (d <= -h) return [P, 1];
  if (d >= h) return [C, 1];
  if (d < 0) { const t = smooth01(-h, 0, d); return [P, 1 - t, j.n, t]; }
  const t = smooth01(0, h, d); return [j.n, 1 - t, C, t];
}
// Smooth profile (r, y) through control points, unscaled units.
function smoothProfile(ctrl, n = 36) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  return curve.getPoints(n).map((v) => [Math.max(0, v.x), v.y]);
}
// Tube profile (r, y), bottom to top: a round bottom cap (radius of the first
// point), straight runs through the given [r, y] points (subdivided every
// `step` so bends have rings to curve with) and a round top cap.
function tubeProfile(pts, { step = 0.016, bottom = true, top = true, n = 6 } = {}) {
  const out = [];
  const [rb, yb] = pts[0], [rt, yt] = pts[pts.length - 1];
  if (bottom) for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI / 2; out.push([Math.cos(a) * rb, yb + Math.sin(a) * rb]); }
  for (let k = 0; k < pts.length - 1; k++) {
    const [r0, y0] = pts[k], [r1, y1] = pts[k + 1], m = Math.max(1, Math.ceil(Math.abs(y1 - y0) / step));
    for (let i = 0; i < m; i++) out.push([r0 + (r1 - r0) * i / m, y0 + (y1 - y0) * i / m]);
  }
  out.push([rt, yt]);
  if (top) for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; out.push([Math.cos(a) * rt, yt + Math.sin(a) * rt]); }
  return out;
}
// Shoulders: the torso's own surface grows out over each shoulder, so neck, shoulder and
// the top of the arm are one continuous skin (no separate pads or seams). Each shoulder is a
// tapered capsule from the base of the neck out to a ball on the shoulder joint as wide as the
// sleeve top; every torso vertex is pushed out along its normal onto the smooth union of the
// torso and those capsules (polynomial smooth-min, blend K). The ball is centred on the joint,
// so the sleeve stays flush with the rounded corner however the arm swings.
function capsuleDist(px, py, pz, A, ra, B, rb) {
  const bx = B[0] - A[0], by = B[1] - A[1], qx = px - A[0], qy = py - A[1];
  const t = Math.max(0, Math.min(1, (qx * bx + qy * by) / (bx * bx + by * by)));
  return Math.hypot(qx - bx * t, qy - by * t, pz) - (ra + (rb - ra) * t);
}
function growShoulders(g, rTop, K = 0.07) {
  g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal;
  const caps = [1, -1].map((s) => [[0.13 * s, 1.17], 0.085, [SHOULDER[0] * s, SHOULDER[1]], rTop]);
  const dc = (x, y, z) => Math.min(...caps.map(([A, ra, B, rb]) => capsuleDist(x, y, z, A, ra, B, rb)));
  const smin = (a, b) => { const h = Math.max(K - Math.abs(a - b), 0) / K; return Math.min(a, b) - h * h * K / 4; };
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    if (y < 0.85 || dc(x, y, z) > K) continue; // far from the shoulders: unchanged
    // the torso's distance at p + n t is ~t; find where smin(t, capsule) = 0
    let lo = 0, hi = 0.35;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (smin(m, dc(x + nx * m, y + ny * m, z + nz * m)) < 0) lo = m; else hi = m; }
    P.setXYZ(i, x + nx * lo, y + ny * lo, z + nz * lo);
  }
  return g;
}
// Torso + hips bean (rest pose, unscaled): a rounded seat the legs grow out
// of, a wide soft belly, closing under the head.
const BODY_PROFILE = smoothProfile([
  [0, 0.375], [0.12, 0.39], [0.2, 0.43], [0.236, 0.5], [0.25, 0.6], [0.268, 0.72], [0.284, 0.84],
  [0.286, 0.95], [0.27, 1.04], [0.236, 1.12], [0.18, 1.2], [0.1, 1.262], [0, 1.285]], 44);
const BODY_SPLIT = 0.7;   // trousers below, shirt above (the waist line: just above the belt)
const BODY_DEPTH = 0.88;  // front-to-back over side-to-side
const SHOULDER = [0.34, 1.12]; // = the uArm joint pivot
const shoulderWiden = (y) => 1 + 0.3 * Math.exp(-(((y - 1.07) / 0.15) ** 2)); // torso x scale: broad shoulders that slope into the neck

let _skinTemplate = null;
function skinTemplate() {
  if (_skinTemplate) return _skinTemplate;
  const pieces = [];
  const m4 = new THREE.Matrix4();
  // geo: rest-pose geometry (unscaled); key: colour key; w: bone name or fn(x, y, z) -> [bone, w, bone, w]
  const add = (geo, key, w, { smooth = true } = {}) => {
    let g = geo;
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && !(a === 'normal' && !smooth)) g.deleteAttribute(a);
    if (smooth) { g = mergeVertices(g); g.computeVertexNormals(); }
    const n = g.attributes.position.count, P = g.attributes.position;
    if (!g.index) { const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
    const ck = new Float32Array(n).fill(CK.indexOf(key));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const ws = typeof w === 'string' ? [w, 1] : w(P.getX(i), P.getY(i), P.getZ(i));
      for (let k = 0; k < ws.length / 2; k++) { si[i * 4 + k] = BI[ws[k * 2]]; sw[i * 4 + k] = ws[k * 2 + 1]; }
    }
    g.setAttribute('ckey', new THREE.BufferAttribute(ck, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    pieces.push(g);
  };
  const lathe = (prof, seg) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const at = (g, x, y, z, sx = 1, sy = 1, sz = 1) => g.applyMatrix4(m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
  // body: one bean from the seat to the neck in two colours, the waist bending through its joint bone
  const W = JI.chest, waist = (x, y) => band(W, y - W.pivot[1], 'hipsSq', 'chestSq');
  const prof = BODY_PROFILE, split = prof.findIndex((p) => p[1] >= BODY_SPLIT);
  const a = prof[split - 1], b = prof[split], t = (BODY_SPLIT - a[1]) / (b[1] - a[1]);
  const mid = [a[0] + (b[0] - a[0]) * t, BODY_SPLIT];
  const shape = (g) => { // widen towards the shoulders, flatten front to back
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { P.setX(i, P.getX(i) * shoulderWiden(P.getY(i)) * STYLE.body); P.setZ(i, P.getZ(i) * BODY_DEPTH * STYLE.body); }
    return g;
  };
  if (STYLE.layered) {
    // the clothes as rounded shells (the shirt overlapping the trousers at the waist); the torso
    // is all shirt up to the head like the default style (no bare neck), so no skin bean under it
    const shell = (pts, k) => pts.map(([r, y]) => [r * k + 0.006, y]);
    add(shape(lathe(shell(prof.filter((p) => p[1] <= BODY_SPLIT + 0.03), 1.05), 40)), 'pants', waist);
    add(growShoulders(shape(lathe(shell(prof.filter((p) => p[1] >= BODY_SPLIT - 0.04), 1.045), 40)), 0.09 * STYLE.limb), 'shirt', waist);
  } else {
    add(shape(lathe([...prof.slice(0, split), mid], 40)), 'pants', waist);
    add(growShoulders(shape(lathe([mid, ...prof.slice(split)], 40)), 0.083 * STYLE.limb), 'shirt', waist);
  }
  const L = STYLE.limb, LL = 1 + (L - 1) * 0.6, Hs = STYLE.hand, Fs = STYLE.shoe; // style: limb / leg / mitten / shoe sizes
  for (const s of [1, -1]) {
    const h = s > 0 ? 'L' : 'R', x = SHOULDER[0] * s, lx = 0.12 * s;
    // the arm: one tube from inside the shoulder to inside the mitten, bending
    // at the shoulder and the elbow; short sleeve (with a hem) over a bare forearm
    const sh = JI['uArm' + h], el = JI['lArm' + h];
    const arm = (x, y) => (y > (sh.pivot[1] + el.pivot[1]) / 2 ? band(sh, sh.pivot[1] - y) : band(el, el.pivot[1] - y));
    const HEM = 0.885;
    if (STYLE.layered) { // a whole skin arm, and a short sleeve over its top
      add(at(lathe(tubeProfile([[0.055, 0.69], [0.06, 0.78], [0.068, 0.9], [0.075, 1.0], [0.078, 1.06]], { top: false }), 12), x, 0, 0, L, 1, L), 'skin', arm);
      add(at(lathe(tubeProfile([[0.08, HEM], [0.086, 1.0], [0.09, 1.07], [0.09, 1.12]], { bottom: false, top: false }), 12), x, 0, 0, L, 1, L), 'shirt', arm);
    } else {
      add(at(lathe(tubeProfile([[0.066, HEM - 0.004], [0.073, HEM], [0.08, 1.0], [0.083, 1.06], [0.083, 1.12]], { bottom: false, top: false }), 12), x, 0, 0, L, 1, L), 'shirt', arm); // its top ring meets the shoulder ball's equator
      add(at(lathe(tubeProfile([[0.055, 0.69], [0.06, 0.78], [0.066, HEM - 0.004]], { top: false }), 12), x, 0, 0, L, 1, L), 'skin', arm);
    }
    // mitten: a fat rounded paddle with a thumb pointing forward-in, and a cuff
    const hy = 0.745 - 0.13; // lower-arm centre + HAND_OFF
    add(at(new THREE.SphereGeometry(0.108 * Hs, 12, 9), x, hy, 0, 0.95, 1.12, 0.82), 'mitten', 'lArm' + h);
    add(at(new THREE.SphereGeometry(0.048 * Hs, 10, 8), x - s * 0.045 * Hs, hy + 0.035 * Hs, 0.055 * Hs, 1, 1.25, 1), 'mitten', 'lArm' + h);
    if (!STYLE.layered) add(at(new THREE.CylinderGeometry(0.082 * L, 0.09 * L, 0.035, 14), x, hy + 0.075 * Hs, 0), 'cuff', 'lArm' + h, { smooth: false });
    // the leg: one trouser tube from inside the seat down into the shoe, bending at hip and knee
    const hp = JI['uLeg' + h], kn = JI['lLeg' + h];
    const leg = (x, y) => (y > (hp.pivot[1] + kn.pivot[1]) / 2 ? band(hp, hp.pivot[1] - y) : band(kn, kn.pivot[1] - y));
    if (STYLE.layered) { // a skin leg with a trouser leg over it, the hem just above the shoe
      add(at(lathe(tubeProfile([[0.07, 0.1], [0.078, 0.18], [0.086, 0.26], [0.096, 0.4], [0.1, 0.48]]), 12), lx, 0, 0, LL, 1, LL), 'skin', leg);
      add(at(lathe(tubeProfile([[0.086, 0.15], [0.092, 0.26], [0.104, 0.4], [0.11, 0.5]], { bottom: false, top: false }), 12), lx, 0, 0, LL, 1, LL), 'pants', leg);
    } else add(at(lathe(tubeProfile([[0.074, 0.1], [0.082, 0.18], [0.09, 0.26], [0.1, 0.4], [0.104, 0.48]]), 12), lx, 0, 0, LL, 1, LL), 'pants', leg);
    // round chunky shoe, toe forward, pale sole
    add(at(new THREE.SphereGeometry(0.105 * Fs, 12, 9), lx, 0.045 * Fs, 0.045 * Fs, 1, 0.68, 1.45), 'shoe', 'lLeg' + h);
    add(at(new THREE.SphereGeometry(0.102 * Fs, 12, 9), lx, 0.022 * Fs, 0.045 * Fs, 1, 0.3, 1.47), 'sole', 'lLeg' + h);
  }
  const g = mergeGeometries(pieces, false);
  for (const p of pieces) p.dispose();
  g.scale(S, S, S);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  _skinTemplate = g;
  return g;
}
// Inverse rest transforms of the bones (all upright: parts at their rest
// positions, joint bones at their pivots).
const SKIN_INV = SKIN_BONES.map((n) => {
  const j = JOINTS.find((q) => q.n === n);
  const p = j ? j.pivot : PARTS.find((q) => q.n === n.replace('Sq', '')).pos;
  return new THREE.Matrix4().makeTranslation(-p[0] * S, -p[1] * S, -p[2] * S);
});
const SKIN_BOUNDS = new THREE.Sphere(new THREE.Vector3(0, -0.12, 0), 1.05); // chest-local, any pose
const _col = new THREE.Color(), _jq = new THREE.Quaternion(), _jp = new THREE.Vector3(), _jv = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

// scratch
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qd = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
const _vU = new THREE.Vector3(), _vV = new THREE.Vector3(); // unstickArms
const _e = new THREE.Euler();
// leg ranges in radians, relative to the parent part (XYZ euler; x = forward / back bend)
const LEG_PARTS = ['uLegL', 'uLegR', 'lLegL', 'lLegR'];
const LEG_LIMITS = {
  u: { x0: -1.8, x1: 0.6, y: 0.35, z: 0.4 },   // hip: forward to ~103 deg, back ~34, a little sideways / twist
  l: { x0: -0.05, x1: 2.2, y: 0.12, z: 0.12 }, // knee: bends backwards only, to ~126 deg
};
const _hA = new THREE.Vector3(), _hB = new THREE.Vector3();
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const qeul = (x, y, z, o = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));
const toQ = (r, q = _qa) => q.set(r.x, r.y, r.z, r.w);
const toV = (r, v = _va) => v.set(r.x, r.y, r.z);

// Error rotation (as a scaled axis) that turns q into target.
function rotError(target, q, out) {
  _qd.copy(target).multiply(_qc.copy(q).invert());
  if (_qd.w < 0) { _qd.x = -_qd.x; _qd.y = -_qd.y; _qd.z = -_qd.z; _qd.w = -_qd.w; }
  const w = Math.min(1, _qd.w), ang = 2 * Math.acos(w), s = Math.sqrt(1 - w * w);
  if (s < 1e-5) return out.set(0, 0, 0);
  return out.set(_qd.x / s, _qd.y / s, _qd.z / s).multiplyScalar(ang);
}

export class Player {
  constructor(game, index, deviceId) {
    this.game = game;
    this.physics = game.physics;
    this.world = game.physics.world;
    this.index = index;
    this.deviceId = deviceId;
    this.colorIndex = index % PLAYER_COLORS.length;
    this.color = PLAYER_COLORS[this.colorIndex];
    this.hat = index % HATS.length === 0 ? 1 : index % HATS.length;
    this.bit = playerBit(index);
    this.groupsNormal = groups(this.bit, ALL & ~this.bit);
    this.groupsSeated = groups(this.bit, ALL & ~this.bit & ~G_VEH);
    this.queryGroups = groups(ALL, ALL & ~this.bit);
    // legs are visual while we're in control: they pass through the world
    // (a foot can't get caught under the ground) and only touch props and other
    // people; in a full ragdoll they collide with everything again
    this.groupsLegs = groups(this.bit, ALL & ~this.bit & ~G_STATIC & ~G_VEH);
    this.legsSolid = null;
    this.yaw = 0;
    this.state = 'normal'; // normal | limp | seated
    this.limpTimer = 0;    // >0: knocked out (auto recover)
    this.recover = 1;      // 0..1 ramp after limp
    this.phase = 0;
    this.grounded = false;
    this.groundBody = null;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.swimming = false;
    this.hands = { L: { joint: null, body: null, cool: 0 }, R: { joint: null, body: null, cool: 0 } };
    this.punch = { t: 0, hand: 'L', hit: false };
    this.seat = null;
    this.seatJoint = null;
    this.jumpCool = 0;
    this.airTime = 0;
    this.offGround = 0;    // seconds since last grounded (coyote time)
    this.jumpBuf = 0;      // >0: a jump press is waiting to happen
    this.stuckT = 0;       // seconds pushing the stick without moving (un-stick hop)
    this.prevChestVel = new THREE.Vector3();
    this.impactGrace = 0;
    this.t = 0;            // own clock (game.time only advances with rendering)
    this.lean = 0;         // filtered forward lean (rad)
    this.roll = 0;         // filtered side lean into turns (rad)
    this.prevYaw = 0;
    this.yawRate = 0;
    this.prevVy = 0;
    this.landDip = 0;      // 0..1 knees give after a landing
    this.sq = 0; this.sqV = 0; // visual squash & stretch spring
    this.getUp = -1;       // >=0: seconds into standing back up
    this.getUpH = 0;       // hips height above ground when the get-up started
    this.stumble = 0;      // >0: wobbly after a bump
    this.dashT = 0; this.dashCool = 0; this.airDashed = false; // dash (B)
    this.mantle = null;    // climbing over a ledge
    this.hangPush = 0;     // time the stick has been held forward while hanging
    this.grip = 1;         // climbing stamina (GRIP_*)
    this.accFwd = 0;       // forward acceleration commanded last step
    this.reachDown = 0;    // 0..1 bending over to reach the floor
    this.reachArm = { L: false, R: false }; // arm is reaching out to grab
    this.cam = null;
    this.lastInput = null;
    this.parts = {};
    this.bodies = [];
    this.build();
  }

  build() {
    const scene = this.game.scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    for (const p of PARTS) {
      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.pos[0] * S, p.pos[1] * S + 2, p.pos[2] * S)
        .setLinearDamping(0.05).setAngularDamping(1.5).setCanSleep(false);
      if (p.n === 'hips' || p.n === 'chest') bd.setCcdEnabled(true);
      const body = this.world.createRigidBody(bd);
      const cd = p.shape === 'ball' ? RAPIER.ColliderDesc.ball(p.r * S) : RAPIER.ColliderDesc.capsule(p.hh * S, p.r * S);
      cd.setMass(p.m).setFriction(p.foot ? 0.15 : 0.6).setRestitution(0.05).setCollisionGroups(this.groupsNormal)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1500);
      const cols = [this.world.createCollider(cd, body)];
      if (p.hand) {
        const hd = RAPIER.ColliderDesc.ball(HAND_R).setTranslation(0, HAND_OFF, 0).setMass(0.4).setFriction(1.0).setCollisionGroups(this.groupsNormal);
        cols.push(this.world.createCollider(hd, body));
      }
      for (const c of cols) this.physics.handleOwner.set(c.handle, this);
      const part = { def: p, body, cols, mesh: this.partMesh(p), target: new THREE.Quaternion(), kp: 0, kd: 0, maxT: 1e9, rec: this.physics.track(body),
        rest: new THREE.Vector3(p.pos[0] * S, p.pos[1] * S, p.pos[2] * S) };
      const I = body.principalInertia();
      part.I = (I.x + I.y + I.z) / 3;
      this.group.add(part.mesh);
      this.parts[p.n] = part;
      this.bodies.push(body);
    }
    for (const p of PARTS) {
      if (!p.parent) continue;
      const a = this.parts[p.parent], b = this.parts[p.n];
      const j = p.joint.map((v) => v * S);
      const pa = a.def.pos.map((v) => v * S), pb = p.pos.map((v) => v * S);
      const data = RAPIER.JointData.spherical(
        { x: j[0] - pa[0], y: j[1] - pa[1], z: j[2] - pa[2] },
        { x: j[0] - pb[0], y: j[1] - pb[1], z: j[2] - pb[2] });
      b.joint = this.world.createImpulseJoint(data, a.body, b.body, true);
      b.joint.setContactsEnabled(false);
      b.parent = a;
    }
    this.paintSkin();
    this.bindSkin();
    this.totalMass = PARTS.reduce((s, p) => s + p.m, 0) + 0.8;
    // Effective inertia each joint has to swing: the whole limb below it,
    // about the joint. Twist about the bone axis only sees the part itself.
    const kids = (n) => PARTS.filter((q) => q.parent === n).flatMap((q) => [q.n, ...kids(q.n)]);
    for (const p of PARTS) {
      if (!p.parent) continue;
      const part = this.parts[p.n];
      const J = new THREE.Vector3(p.joint[0] * S, p.joint[1] * S + 2, p.joint[2] * S);
      const b = part.body, c = b.worldCom(), I = b.principalInertia();
      part.Iswing = (I.x + I.z) / 2 + b.mass() * J.distanceToSquared(new THREE.Vector3(c.x, c.y, c.z)) * 0.25;
      part.Itwist = I.y;
      part.sub = [p.n, ...kids(p.n)].map((n) => this.parts[n]);
      part.anchor = new THREE.Vector3(p.joint[0] - p.pos[0], p.joint[1] - p.pos[1], p.joint[2] - p.pos[2]).multiplyScalar(S);
    }
  }

  // The group a part's things hang in (posed from its body every frame; it is
  // also that part's skin bone): the head mesh + hat, or rigid extras built in
  // the part's local frame. The body itself is the skinned mesh (skinTemplate).
  partMesh(p) {
    const g = new THREE.Group();
    if (p.n === 'head') {
      const m = new THREE.Mesh(headGeometry(), headMaterials().normal);
      if (STYLE.mono) { // 'wobbly' style: a plain head in the body colour with two black oval eyes; faces don't apply
        const mat = this.monoHeadMat = charMat({ color: this.color });
        Object.defineProperty(m, 'material', { get: () => mat, set: () => {} });
        for (const s of [-1, 1]) {
          const e = new THREE.Mesh(MONO_EYE, MONO_EYE_MAT);
          e.position.set(s * 0.3 * HEAD_R, 0.12 * HEAD_R, 0.95 * HEAD_R * (1 - FACE_FLAT * 0.12));
          e.lookAt(e.position.clone().multiplyScalar(2));
          m.add(e);
        }
      }
      m.scale.set(1, 0.97, 0.98).multiplyScalar(STYLE.head);
      m.position.y = -STYLE.drop * S;
      m.castShadow = true;
      if (STYLE.outline) { const o = new THREE.Mesh(m.geometry, HEAD_OUTLINE); o.scale.setScalar(1.05); m.add(o); }
      if (STYLE.skinColored) m.onBeforeRender = (r, s, c, geo, mat) => { const u = mat.userData.skinU; if (u) { u.value.set(skinTone(this.skinBase())); mat.uniformsNeedUpdate = true; } };
      this.headMesh = m;
      g.add(m);
      this.hatMesh = new THREE.Group();
      this.hatMesh.scale.setScalar(STYLE.head); this.hatMesh.position.y = -STYLE.drop * S;
      g.add(this.hatMesh);
      this.buildHat();
      return g;
    }
    const b = new Builder();
    this.outfit?.(p.n, b); // outfits (src/outfits.js, NPCs: src/npc.js): ties, scarves, backpacks...
    this.gearMesh?.(p.n, b, g); // gadgets (src/gadgets.js): jetpack, boots, laser gun...
    if (b.parts.length) g.add(b.mesh(PLAYER_MAT));
    return g;
  }

  // The skinned body (one per character): made once, recoloured and re-bound
  // to the part groups whenever they are rebuilt (rebuildMeshes).
  paintSkin() {
    const shirt = this.outfit?.shirt ?? this.color; // jackets (outfits.js)
    const pants = this.outfit?.pants ?? this.pantsColor ?? new THREE.Color(this.color).multiplyScalar(0.55).getHex(); // outfit trousers (outfits.js), pantsColor: customiser (cosmetics.js)
    const cols = STYLE.mono // 'wobbly' style: one colour all over, blue shoes
      ? { shirt: this.color, pants: this.color, skin: this.color, mitten: this.color, cuff: this.color, shoe: 0x2f6fe0, sole: 0x2a5cc0 }
      : STYLE.skinColored // 'dressed': skin in the character colour, clothes in their own colours
        ? { shirt: this.clothesColor(), pants: this.outfit?.pants ?? this.pantsColor ?? 0x3b5c9a,
          skin: skinTone(this.skinBase()), mitten: skinTone(this.skinBase()), cuff: skinTone(this.skinBase()), shoe: 0x3a3340, sole: 0xe8e8e8 }
        : { shirt, pants, skin: SKIN, mitten: 0xffffff, cuff: 0xf1f1f1, shoe: 0x3a3340, sole: 0xe8e8e8 };
    if (!this.skin) {
      const m = new THREE.SkinnedMesh(skinTemplate().clone(), PLAYER_MAT);
      m.castShadow = true; m.receiveShadow = true;
      m.boundingSphere = SKIN_BOUNDS.clone();
      m.boundingBox = new THREE.Box3().setFromCenterAndSize(SKIN_BOUNDS.center, new THREE.Vector3(2.1, 2.1, 2.1));
      this.skin = m;
      if (STYLE.outline) { // cel style: a second skinned mesh on the same skeleton, back faces pushed out
        const o = new THREE.SkinnedMesh(m.geometry, outlineMat());
        o.boundingSphere = m.boundingSphere; o.boundingBox = m.boundingBox;
        this.skinOutline = o;
      }
    }
    const g = this.skin.geometry, key = g.attributes.ckey.array, c = g.attributes.color, a = c.array;
    const rgb = CK.map((k) => _col.set(cols[k]).toArray());
    for (let i = 0; i < key.length; i++) { const v = rgb[key[i]]; a[i * 3] = v[0]; a[i * 3 + 1] = v[1]; a[i * 3 + 2] = v[2]; }
    c.needsUpdate = true;
  }
  bindSkin() {
    const P = this.parts, sq = { chestSq: new THREE.Object3D(), hipsSq: new THREE.Object3D() };
    P.chest.mesh.add(sq.chestSq); P.hips.mesh.add(sq.hipsSq);
    this.sqBones = sq;
    if (!this.jointBones) {
      this.jointBones = {};
      for (const j of JOINTS) { const o = new THREE.Object3D(); o.matrixAutoUpdate = false; this.jointBones[j.n] = o; }
    }
    const old = this.skin.skeleton, jb = this.jointBones;
    const sk = new THREE.Skeleton(SKIN_BONES.map((n) => sq[n] || jb[n] || P[n].mesh), SKIN_INV.map((m) => m.clone()));
    // the joint bones follow the parts just before every upload (parked NPCs,
    // forms and anything else that poses part.mesh get them too)
    const upload = sk.update;
    sk.update = () => { this.poseJoints(); upload.call(sk); };
    this.skin.bind(sk, new THREE.Matrix4());
    old?.dispose();
    P.chest.mesh.add(this.skin);
    if (this.skinOutline) { this.skinOutline.bind(sk, new THREE.Matrix4()); P.chest.mesh.add(this.skinOutline); } // follows the chest's visibility (forms.js hides the part groups)
  }
  // Joint bones: at the pivot (the mean of where each side puts it), turned
  // half way between the two parts. Part groups sit in this.group at the origin,
  // so their position / quaternion are world values.
  poseJoints() {
    const P = this.parts, jb = this.jointBones;
    for (const j of JOINTS) {
      const a = P[j.P].mesh, c = P[j.C].mesh;
      _jp.copy(j.aP).applyQuaternion(a.quaternion).add(a.position);
      _jv.copy(j.aC).applyQuaternion(c.quaternion).add(c.position);
      _jp.add(_jv).multiplyScalar(0.5);
      _jq.slerpQuaternions(a.quaternion, c.quaternion, 0.5);
      jb[j.n].matrixWorld.compose(_jp, _jq, _one);
    }
  }
  // Rebuild everything drawn, head included, after a look-style change (game.setCharStyle).
  restyle() {
    for (const m of [this.skin, this.skinOutline]) if (m) { m.parent?.remove(m); m.geometry.dispose(); }
    this.skin = this.skinOutline = null; this.monoHeadMat = null;
    const head = this.parts.head, hm = this.partMesh(head.def);
    hm.position.copy(head.mesh.position); hm.quaternion.copy(head.mesh.quaternion); hm.visible = head.mesh.visible;
    this.group.remove(head.mesh); head.mesh = hm; this.group.add(hm);
    this.rebuildMeshes();
  }

  // Rebuild the part groups (outfit / gadget / colour change) and re-bind the skin.
  rebuildMeshes() {
    for (const n in this.parts) {
      const part = this.parts[n];
      if (n === 'head') { this.buildHat(); this.monoHeadMat?.color.set(this.color); continue; }
      this.group.remove(part.mesh);
      const m = this.partMesh(part.def);
      m.position.copy(part.mesh.position); m.quaternion.copy(part.mesh.quaternion);
      part.mesh = m;
      this.group.add(m);
    }
    this.paintSkin();
    this.bindSkin();
  }

  buildHat() {
    const hm = this.hatMesh;
    while (hm.children.length) { const c = hm.children.pop(); c.geometry?.dispose(); }
    const kind = HATS[this.hat];
    if (kind === 'none') return;
    const b = new Builder(), R = HEAD_R, c = this.hatTint ?? this.clothesColor();
    const dark = new THREE.Color(c).multiplyScalar(0.6).getHex();
    if (kind === 'cap') {
      b.sphere(R * 1.02, c, [0, R * 0.35, 0], [1, 0.62, 1], 16);
      b.cyl(R * 0.75, R * 0.75, 0.02, dark, [0, R * 0.42, R * 0.55], [0.2, 0, 0], 16);
    } else if (kind === 'tophat') {
      b.cyl(R * 0.9, R * 0.9, 0.03, 0x222222, [0, R * 0.8, 0], null, 18);
      b.cyl(R * 0.58, R * 0.6, R * 0.95, 0x222222, [0, R * 1.3, 0], null, 18);
      b.cyl(R * 0.61, R * 0.61, R * 0.18, c, [0, R * 0.95, 0], null, 18);
    } else if (kind === 'beanie') {
      b.sphere(R * 1.04, c, [0, R * 0.3, 0], [1, 0.7, 1], 16);
      b.sphere(R * 0.25, 0xffffff, [0, R * 1.05, 0]);
    } else if (kind === 'crown') {
      b.cyl(R * 0.6, R * 0.55, R * 0.4, 0xffd23f, [0, R * 1.0, 0], null, 10);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.cone(R * 0.12, R * 0.3, 0xffd23f, [Math.sin(a) * R * 0.55, R * 1.32, Math.cos(a) * R * 0.55]); }
      b.sphere(R * 0.09, 0xff3355, [0, R * 1.0, R * 0.6]);
    } else if (kind === 'party') {
      b.cone(R * 0.45, R * 1.1, c, [0, R * 1.35, 0], [-0.1, 0, 0]);
      b.sphere(R * 0.14, 0xffffff, [0, R * 1.93, -0.04]);
    } else if (kind === 'cowboy') {
      b.cyl(R * 1.35, R * 1.35, 0.03, 0x9a6232, [0, R * 0.7, 0], null, 20);
      b.cyl(R * 0.6, R * 0.68, R * 0.6, 0x9a6232, [0, R * 1.0, 0], null, 16);
      b.cyl(R * 0.69, R * 0.69, R * 0.12, 0x4a2a12, [0, R * 0.8, 0], null, 16);
    } else if (kind === 'bucket') {
      b.cyl(R * 0.78, R * 1.05, R * 0.55, c, [0, R * 0.75, 0], null, 18);
      b.cyl(R * 1.25, R * 1.25, 0.02, c, [0, R * 0.5, 0], null, 18);
    } else buildExtraHat(b, kind, R, c, hm); // unlockable hats (src/hats.js)
    hm.add(b.mesh());
  }

  // Hats and shirts: the character colour, except in the toy style, where that colour is the
  // skin (a hat in it would read as hair): there they take the shirt colour.
  clothesColor() {
    if (!STYLE.skinColored) return this.color;
    return this.outfit?.shirt ?? DRESS_SHIRTS[(this.colorIndex ?? 0) % DRESS_SHIRTS.length];
  }
  // Toy style: the colour the skin tone comes from (a player's chosen colour; NPCs pick one, npc.js).
  skinBase() { return this.color; }

  setColor(ci) {
    this.colorIndex = (ci + PLAYER_COLORS.length) % PLAYER_COLORS.length;
    this.color = PLAYER_COLORS[this.colorIndex];
    this.rebuildMeshes();
    this.game.ui?.refreshTags();
  }

  // ---- helpers ----------------------------------------------------------
  pos() { return this.parts.chest.body.translation(); }
  get chest() { return this.parts.chest.body; }
  get hips() { return this.parts.hips.body; }

  setGroups(g) {
    for (const n in this.parts) for (const c of this.parts[n].cols) c.setCollisionGroups(g);
    this.legsSolid = null; // updateLegs re-applies the legs' own groups
  }

  // Legs collide with the world only when limp. Turning them solid again first
  // pulls any leg that ended up behind a surface (under the ground, inside a
  // wall) back out along the line from the hips.
  updateLegs() {
    const solid = this.state === 'limp';
    if (solid === this.legsSolid) return;
    this.legsSolid = solid;
    const g = solid ? (this.state === 'seated' ? this.groupsSeated : this.groupsNormal) : this.groupsLegs;
    const hp = this.hips.translation(), hv = this.hips.linvel();
    for (const n of ['uLegL', 'lLegL', 'uLegR', 'lLegR']) {
      const part = this.parts[n], b = part.body;
      if (solid) {
        const t = b.translation(), dx = t.x - hp.x, dy = t.y - hp.y, dz = t.z - hp.z, d = Math.hypot(dx, dy, dz);
        if (d > 1e-3) {
          const ray = new RAPIER.Ray({ x: hp.x, y: hp.y, z: hp.z }, { x: dx / d, y: dy / d, z: dz / d });
          const hit = this.world.castRay(ray, d + part.def.r * S, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, this.queryGroups);
          if (hit) {
            const k = Math.max(0, hit.timeOfImpact - part.def.r * S - 0.02) / d;
            b.setTranslation({ x: hp.x + dx * k, y: hp.y + dy * k, z: hp.z + dz * k }, true);
            b.setLinvel(hv, true);
          }
        }
      }
      for (const c of part.cols) c.setCollisionGroups(g);
    }
  }

  // Places the ragdoll in its rest pose at a position (feet) and facing.
  teleport(x, y, z, yaw = this.yaw) {
    this.yaw = yaw;
    _qa.setFromAxisAngle(UP, yaw);
    const rot = { x: _qa.x, y: _qa.y, z: _qa.z, w: _qa.w };
    for (const n in this.parts) {
      const p = this.parts[n];
      _vb.copy(p.rest).applyQuaternion(_qa);
      p.body.setTranslation({ x: x + _vb.x, y: y + _vb.y, z: z + _vb.z }, true);
      p.body.setRotation(rot, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      p.rec.snap = true;
    }
    this.prevChestVel.set(0, 0, 0);
    this.impactGrace = 0.3;
  }

  setVelocity(v) {
    for (const b of this.bodies) b.setLinvel(v, true);
  }

  knockOut(t) {
    if (this.state === 'seated') return;
    this.releaseAll();
    this.mantle = null;
    this.state = 'limp';
    this.limpTimer = Math.max(this.limpTimer, t);
    this.headMesh.material = headMaterials().ko;
    this.game.audio?.play('ko', this.pos());
  }

  // Back to normal control. With getUp the body stands up from wherever it
  // lies over GETUP_T seconds instead of popping straight up.
  wake(getUp = true) {
    this.state = 'normal';
    this.limpTimer = 0;
    this.recover = getUp ? 1 : 0;
    this.getUp = getUp ? 0 : -1;
    this.getUpH = Math.max(0.05, Math.min(STAND_H, this.groundDist ?? STAND_H));
    this.headMesh.material = headMaterials().normal;
  }

  // Let go. With fling, a light object we were swinging keeps the arm's
  // swing (plus a bit) so releasing mid-swing throws it.
  releaseHand(h, fling = false) {
    const hand = this.hands[h];
    if (hand.joint) {
      if (hand.joint.isValid()) this.world.removeImpulseJoint(hand.joint, true);
      const b = hand.body;
      if (fling && b && b.isDynamic() && !(hand.owner instanceof Player) && b.mass() < 60 && this.flung !== b) {
        // the swing we give it, relative to our body, gets a boost along our facing
        const cv = this.chest.linvel(), bv = b.linvel();
        const rx = bv.x - cv.x, ry = bv.y - cv.y, rz = bv.z - cv.z;
        const rs = Math.hypot(rx, ry, rz);
        if (rs > 1.2) {
          const k = Math.min(1, (rs - 1.2) / 2.5);
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          b.setLinvel({ x: bv.x + (rx * 0.4 + fx * rs * 0.7) * k, y: bv.y + (ry * 0.2 + rs * 0.35) * k, z: bv.z + (rz * 0.4 + fz * rs * 0.7) * k }, true);
          this.flung = b;
          this.game.audio?.play('swish', b.translation());
        }
      }
      // letting go of a ride: the pinned arm's solver velocity is not real
      // motion (Rapier reports tens of m/s on a forearm that is keeping pace
      // with its grip), so hand the arm the body's own speed instead of a fling
      if (b && b.isKinematic()) {
        const cv = this.chest.linvel(), cw = this.chest.angvel();
        for (const nm of ['lArm' + h, 'uArm' + h]) { this.parts[nm].body.setLinvel(cv, true); this.parts[nm].body.setAngvel(cw, true); }
      }
      hand.joint = null; hand.body = null; hand.owner = null;
    }
  }
  releaseAll() { this.releaseHand('L'); this.releaseHand('R'); }

  handPos(h, out) {
    const b = this.parts['lArm' + h].body;
    toQ(b.rotation(), _qb);
    out.set(0, HAND_OFF, 0).applyQuaternion(_qb).add(toV(b.translation(), _vc));
    return out;
  }

  // ---- seats ------------------------------------------------------------
  sitIn(seat) {
    this.releaseAll();
    this.mantle = null;
    if (this.state === 'limp') this.wake(false);
    this.seat = seat;
    seat.occupant = this;
    this.state = 'seated';
    this.setGroups(this.groupsSeated);
    // put hips at the seat, then lock them there
    const sb = seat.body;
    toQ(sb.rotation(), _qa);
    _e.setFromQuaternion(_qa.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, seat.yaw || 0)), 'YXZ');
    const p = _vb.set(seat.pos[0], seat.pos[1], seat.pos[2]).applyQuaternion(_qa).add(toV(sb.translation(), _vc));
    this.teleport(p.x, p.y - this.parts.hips.rest.y, p.z, _e.y);
    const lq = new THREE.Quaternion().setFromAxisAngle(UP, seat.yaw || 0);
    const data = RAPIER.JointData.fixed({ x: seat.pos[0], y: seat.pos[1], z: seat.pos[2] }, { x: lq.x, y: lq.y, z: lq.z, w: lq.w },
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    this.seatJoint = this.world.createImpulseJoint(data, sb, this.hips, true);
    this.game.audio?.play('seat', this.pos());
    seat.onEnter?.(this);
  }

  leaveSeat() {
    const seat = this.seat;
    if (!seat) return;
    if (this.seatJoint && this.seatJoint.isValid()) this.world.removeImpulseJoint(this.seatJoint, true);
    this.seatJoint = null;
    seat.occupant = null;
    this.seat = null;
    this.state = 'normal';
    this.recover = 0.4;
    this.setGroups(this.groupsNormal);
    const sb = seat.body;
    toQ(sb.rotation(), _qa);
    const ex = seat.exit || [seat.pos[0] + (seat.pos[0] >= 0 ? 1.2 : -1.2), seat.pos[1] + 0.3, seat.pos[2]];
    const p = seat.exitWorld ? _vb.set(seat.exitWorld.x, seat.exitWorld.y, seat.exitWorld.z)
      : _vb.set(ex[0], ex[1], ex[2]).applyQuaternion(_qa).add(toV(sb.translation(), _vc));
    // make sure we don't drop out under the ground
    const gy = this.game.groundHeight(p.x, p.z, p.y + 2);
    const y = Math.max(p.y - 0.3, gy + 0.05);
    const v = sb.linvel();
    // rides (exitPush): you hop off right where you are, with the ride's speed
    // and a little push away from your seat, Wobbly Life style
    let px = 0, pz = 0;
    if (seat.exitPush) {
      const sp = new THREE.Vector3(seat.pos[0], seat.pos[1], seat.pos[2]).applyQuaternion(_qa).add(toV(sb.translation(), _vc));
      const dx = p.x - sp.x, dz = p.z - sp.z, d = Math.hypot(dx, dz);
      if (d > 1e-3) { px = dx / d * seat.exitPush; pz = dz / d * seat.exitPush; }
    }
    this.teleport(p.x, y, p.z, this.yaw);
    this.setVelocity({ x: v.x * 0.8 + px, y: v.y * 0.8 + 1, z: v.z * 0.8 + pz });
    seat.onExit?.(this);
  }

  // ---- control ------------------------------------------------------------
  // Drives the joint `part` toward `target` (relative to its parent).
  drive(part, kp, kd, maxT = 1e9) {
    const b = part.body, pb = part.parent.body;
    toQ(pb.rotation(), _qa);
    _qb.copy(_qa).multiply(part.target);
    rotError(_qb, toQ(b.rotation(), _qc.clone()), _va);
    const w = b.angvel(), pw = pb.angvel();
    _vb.set(w.x - pw.x, w.y - pw.y, w.z - pw.z);
    // split into twist (about the bone) and swing
    const ax = _vc.set(0, 1, 0).applyQuaternion(toQ(b.rotation(), _qd));
    const et = _va.dot(ax), wt = _vb.dot(ax);
    _va.addScaledVector(ax, -et); _vb.addScaledVector(ax, -wt);
    // implicit PD: relative angular velocity we want after this step
    const sI = 1 / (1 + DT * kd);
    _va.multiplyScalar(DT * kp * sI).addScaledVector(_vb, sI - 1).multiplyScalar(part.Iswing)
      .addScaledVector(ax, ((wt + DT * kp * et) * sI - wt) * part.Itwist);
    const l = _va.length(), lim = maxT * DT;
    if (l > lim) _va.multiplyScalar(lim / l);
    b.applyTorqueImpulse({ x: _va.x, y: _va.y, z: _va.z }, true);
    pb.applyTorqueImpulse({ x: -_va.x, y: -_va.y, z: -_va.z }, true);
  }

  // While we're in control the legs are visual (they don't touch the world), so
  // they aren't motor-driven: joint motors on legs this light can't hold a pose
  // against the body's own wobble and the legs used to drift +-0.5 rad. Instead
  // each leg is set to its animation pose relative to its parent, clamped to a
  // comfortable range, and placed on its joint. Standing up out of a heap it
  // eases in. A full ragdoll (limp) leaves them to the physics.
  poseLegs() {
    const k = this.getUp >= 0 ? 0.3 : 0.65; // a touch of follow-through, never a flop
    for (const n of LEG_PARTS) {
      const p = this.parts[n], b = p.body, pb = p.parent.body, L = LEG_LIMITS[n[0]];
      _e.setFromQuaternion(p.target, 'XYZ');
      _e.set(Math.min(L.x1, Math.max(L.x0, _e.x)), Math.min(L.y, Math.max(-L.y, _e.y)), Math.min(L.z, Math.max(-L.z, _e.z)), 'XYZ');
      toQ(pb.rotation(), _qa);
      _qc.copy(_qa).multiply(_qd.setFromEuler(_e));            // wanted world rotation
      toQ(b.rotation(), _qb).slerp(_qc, k);
      // keep the joint together: pivot on the parent, then back along the leg
      const pa = p.pAnchor ??= new THREE.Vector3(...p.def.joint.map((v, i) => (v - p.parent.def.pos[i]) * S));
      const pt = pb.translation();
      _va.copy(pa).applyQuaternion(_qa).add(_vb.set(pt.x, pt.y, pt.z));
      _va.sub(_vc.copy(p.anchor).applyQuaternion(_qb));
      b.setTranslation({ x: _va.x, y: _va.y, z: _va.z }, true);
      b.setRotation({ x: _qb.x, y: _qb.y, z: _qb.z, w: _qb.w }, true);
      // the leg's own momentum (jump kick, pushes) moves onto the hips rather
      // than vanishing, so jumps and knocks keep their strength
      const lv = b.linvel(), hv = this.hips.linvel(), m = b.mass();
      this.hips.applyImpulse({ x: (lv.x - hv.x) * m, y: (lv.y - hv.y) * m, z: (lv.z - hv.z) * m }, true);
      b.setLinvel(pb.linvel(), true); b.setAngvel(pb.angvel(), true);
    }
  }

  // Raised limbs float (their weight moves onto the torso) so the joint drives
  // only handle motion and can stay soft and stable. Hanging arms keep their
  // weight and swing like pendulums.
  gravityComp(limp) {
    const w = -9.81 * DT;
    let hipsW = 0, chestW = 0;
    for (const n in this.parts) {
      const p = this.parts[n];
      if (!p.parent) continue;
      const float = !limp && (p.float !== false);
      if (p.gs !== float) { p.gs = float; p.body.setGravityScale(float ? 0 : 1, true); }
      if (float) { if (n.includes('Leg')) hipsW += p.body.mass(); else chestW += p.body.mass(); }
    }
    if (hipsW) this.hips.applyImpulse({ x: 0, y: hipsW * w, z: 0 }, true);
    if (chestW) this.chest.applyImpulse({ x: 0, y: chestW * w, z: 0 }, true);
  }

  // World-space upright/facing torque on a root body.
  upright(body, target, kp, kd, I) {
    rotError(target, toQ(body.rotation(), _qc.clone()), _va);
    const w = body.angvel();
    _va.multiplyScalar(kp * I).addScaledVector(_vb.set(w.x, w.y, w.z), -kd * I).multiplyScalar(DT);
    body.applyTorqueImpulse({ x: _va.x, y: _va.y, z: _va.z }, true);
  }

  // Something solid right in front of the chest (a wall, a car, a crate we're pushing).
  blockedAhead() {
    const c = this.chest.translation();
    const hit = this.world.castRayAndGetNormal(new RAPIER.Ray({ x: c.x, y: c.y, z: c.z }, { x: Math.sin(this.yaw), y: 0, z: Math.cos(this.yaw) }), 0.7, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
    return !!hit && Math.abs(hit.normal.y) < 0.6;
  }

  // Free space above the hips (static scenery only), capped a little above the head.
  headroom() {
    const hp = this.hips.translation();
    const hit = this.world.castRay(new RAPIER.Ray({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: 1, z: 0 }), HEAD_TOP + 0.3, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, this.queryGroups);
    return hit ? hit.timeOfImpact : HEAD_TOP + 0.3;
  }

  probeGround() {
    const hp = this.hips.translation();
    const ray = new RAPIER.Ray({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: -1, z: 0 });
    let hit = this.world.castRayAndGetNormal(ray, RAY_LEN, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
    // the hips ray misses past an edge (crate, kerb, ramp lip) while a foot is
    // still on it: probe around the hips and stand on the nearest hit
    if (!hit || hit.timeOfImpact > STAND_H + 0.2 * S) {
      for (const [ox, oz] of FOOT_RAYS) {
        ray.origin = { x: hp.x + ox * S, y: hp.y, z: hp.z + oz * S };
        const h2 = this.world.castRayAndGetNormal(ray, RAY_LEN, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
        if (h2 && h2.normal.y > 0.5 && (!hit || h2.timeOfImpact < hit.timeOfImpact)) hit = h2;
      }
    }
    if (!hit) { this.grounded = false; this.groundBody = null; this.groundCollider = null; this.groundDist = 99; return; }
    this.groundDist = hit.timeOfImpact;
    this.grounded = hit.timeOfImpact < STAND_H + 0.2 * S;
    this.groundCollider = hit.collider;
    this.groundBody = hit.collider.parent();
    this.groundNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    this.groundPoint = { x: hp.x, y: hp.y - hit.timeOfImpact, z: hp.z };
  }

  groundVelocity(out) {
    out.set(0, 0, 0);
    const gb = this.groundBody;
    if (!gb) return out;
    if (gb.isFixed()) { // a conveyor belt (game.belts, world/factory.js) moves its surface
      const p = this.groundPoint, B = this.game.belts;
      if (B && p) for (const b of B) if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && Math.abs(p.y - b.y) < 0.25) return out.set(b.vx, 0, b.vz);
      return out;
    }
    // kinematic bodies (rides, ferries) don't keep worldCom() up to date as they
    // move, so measure the lever arm from the body origin (their pivot) instead
    const v = gb.linvel(), w = gb.angvel(), c = gb.isKinematic() ? gb.translation() : gb.worldCom(), p = this.groundPoint;
    _vc.set(p.x - c.x, p.y - c.y, p.z - c.z);
    out.set(w.x, w.y, w.z).cross(_vc).add(_vb.set(v.x, v.y, v.z));
    return out;
  }

  // Called every physics step before world.step.
  step(inp, pressed) {
    if (this.gear?.filter) inp = this.gear.filter(inp); // gadgets: a hand holding a tool can't grab
    if (this.form) inp = this.form.input(inp); // forms.js: animals can't grab
    const parts = this.parts;
    const chest = parts.chest.body, hips = parts.hips.body;
    this.t += DT;
    this.flung = null;
    this.updateLegs();
    this.jumpCool -= DT; this.impactGrace -= DT;
    this.offGround = this.grounded || this.swimming ? 0 : this.offGround + DT;
    if (this.grounded || this.swimming) this.lastWall = null;
    this.jumpBuf = pressed.jump ? JUMP_BUFFER : this.jumpBuf - DT;
    this.hands.L.cool -= DT; this.hands.R.cool -= DT;
    if (this.punch.t > 0) this.punch.t -= DT;
    if (this.stumble > 0) this.stumble -= DT;
    this.dashT -= DT; this.dashCool -= DT;

    // --- state transitions
    if (this.state === 'limp') {
      if (this.limpTimer > 0) { this.limpTimer -= DT; if (this.limpTimer <= 0) this.wake(); }
      else if (pressed.ragdoll || pressed.jump || pressed.dash) this.wake();
    } else if (this.state === 'normal' && pressed.ragdoll) {
      this.state = 'limp'; this.limpTimer = 0; this.releaseAll(); this.mantle = null;
    }
    if (this.recover < 1) this.recover = Math.min(1, this.recover + DT * 1.6);

    const limp = this.state === 'limp';
    const seated = this.state === 'seated';

    // getting up: balance comes back on an ease-in curve while the hover
    // height climbs from where we lie, so the body rises through a crouch
    let rise = 1, riseUp = 1;
    if (this.getUp >= 0) {
      if (limp || seated) this.getUp = -1;
      else {
        this.getUp += DT;
        const u = Math.min(1, this.getUp / GETUP_T);
        rise = u * u * (3 - 2 * u);
        const u2 = Math.min(1, u * 1.7);
        riseUp = 0.2 + 0.8 * u2 * u2 * (3 - 2 * u2);
        if (u >= 1) this.getUp = -1;
      }
    }

    const cam = this.cam;
    const camYaw = cam ? cam.yaw : this.yaw;
    // camera-relative stick: forward is away from camera
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let mx = inp.moveX || 0, my = inp.moveY || 0;
    const mvx = fx * my - fz * mx, mvz = fz * my + fx * mx;
    const mag = Math.min(1, Math.hypot(mx, my));

    const cp = chest.translation();
    this.probeGround();
    const water = this.physics.waterLevel(cp.x, cp.y, cp.z);
    // wading is not swimming: needs about a metre of water over the ground
    const floorY = this.groundDist < 50 ? this.hips.translation().y - this.groundDist : -1e9;
    const wasSwimming = this.swimming;
    this.swimming = water != null && cp.y < water + 0.05 && water - floorY > 0.85 && !seated;
    if (!this.swimming) this.diveD = 0;
    if (this.swimming && !wasSwimming && chest.linvel().y < -2) this.game.audio?.play('splash', cp, Math.min(1.5, -chest.linvel().y / 6));
    this.waterLevel = water;

    // --- landings: knees give, the body squashes
    const v = hips.linvel();
    if (!this.grounded && !this.swimming && !seated) this.airTime += DT;
    else {
      if (this.airTime > 0.18 && !limp && !seated && this.grounded) {
        const lv = Math.max(0, -this.prevVy);
        this.landDip = Math.max(this.landDip, Math.min(1, lv / 7));
        this.sqV += Math.min(5, lv * 0.6);
      }
      this.airTime = 0;
    }
    this.landDip = Math.max(0, this.landDip - DT * 3.2);

    // --- climbing stamina (spent by pull-ups and bar hops only) rests on the ground
    if (this.grounded || this.swimming || seated) this.grip = Math.min(1, this.grip + DT * GRIP_REST);

    // --- grabbing
    if (!seated && !limp) { this.updateHands(inp); this.carryAssist(); }
    if (!seated) this.unstickArms();
    this.onRide = false;
    const ride = !seated && !limp ? this.rideCarry() : null; // hanging off a moving ride
    // while hanging off it, the body passes through ride parts (like a seated
    // rider): a ragdoll squeezed between kinematic cars is crushed into jitter
    // (standing on the ride itself still counts: the hover spring keeps us on it)
    const rideGroups = !!ride && !(this.grounded && this.groundBody?.isFixed());
    if (rideGroups !== !!this.rideGroups && !seated) { this.rideGroups = rideGroups; this.setGroups(rideGroups ? this.groupsSeated : this.groupsNormal); }
    // looking down while reaching bends over to pick things off the floor
    const camPitch = cam ? cam.pitch : 0.2;
    const reachingNow = !limp && !seated && ((inp.grabL || 0) > 0.3 || (inp.grabR || 0) > 0.3);
    const rdT = reachingNow && this.grounded && !this.swimming ? Math.max(0, Math.min(1, (camPitch - 0.45) / 0.75)) : 0;
    this.reachDown += (rdT - this.reachDown) * Math.min(1, DT * 6);

    // --- facing
    if (!limp && !seated && mag > 0.1 && !this.mantle) {
      const want = Math.atan2(mvx, mvz);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const rate = (this.grounded || this.swimming ? 9 : 4) * DT;
      this.yaw += Math.max(-rate, Math.min(rate, d));
    }
    if (seated) {
      toQ(this.seat.body.rotation(), _qa);
      _e.setFromQuaternion(_qa, 'YXZ');
      this.yaw = _e.y + (this.seat.yaw || 0);
    }
    let dyaw = this.yaw - this.prevYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.prevYaw = this.yaw;
    this.yawRate += (dyaw / DT - this.yawRate) * Math.min(1, DT * 12);

    // --- balance
    const gv = this.groundVelocity(new THREE.Vector3());
    if (ride && !this.grounded) gv.copy(ride); // steer relative to the ride you hang from
    const stumbleK = this.stumble > 0 ? 1 - 0.6 * Math.min(1, this.stumble / 0.5) : 1;
    const strength = limp ? 0 : this.recover * riseUp * stumbleK;
    const speed = (this.swimming ? SWIM : (inp.sprint ? RUN : WALK) * (this.gear?.speed || 1)) * (this.form?.speed ?? 1); // gadgets: speed boots, flight; forms.js
    const hv = _vc.set(v.x - gv.x, 0, v.z - gv.z);
    const hspeed = hv.length();
    const fwdSpeed = hv.x * Math.sin(this.yaw) + hv.z * Math.cos(this.yaw);
    const hanging = !this.grounded && !!(this.hands.L.joint || this.hands.R.joint);
    const amp = Math.min(1, Math.abs(fwdSpeed) / 6) * 0.95;

    // lean into speed and acceleration, bank into turns, waddle with each step
    let leanT = 0, rollT = 0, waddle = 0, twist = 0;
    if (!limp && !seated) {
      if (this.swimming) leanT = mag > 0.1 ? 1.15 : 0.5;
      else if (this.grounded) {
        leanT = Math.max(-0.35, Math.min(0.5, fwdSpeed * 0.045 + this.accFwd * 0.03)) + this.reachDown * 1.0;
        rollT = Math.max(-0.35, Math.min(0.35, -this.yawRate * Math.min(hspeed, RUN) * 0.05));
        waddle = Math.sin(this.phase) * 0.1 * Math.max(amp, mag > 0.1 ? 0.3 : 0);
        twist = Math.sin(this.phase) * 0.14 * amp;
      } else if (!hanging) leanT = 0.12;
      if (this.mantle) leanT = 0.5;
      const eb = this.emoteBody; // emotes: body lean / sway / twist
      if (eb) { leanT += eb.lean; waddle += eb.roll; twist += eb.twist; }
    }
    const lk = Math.min(1, DT * (this.swimming ? 4 : 9));
    this.lean += (leanT - this.lean) * lk;
    this.roll += (rollT - this.roll) * lk;

    if (!limp) {
      const yq = _qb.setFromAxisAngle(UP, this.yaw);
      const chestT = yq.clone().multiply(qeul(this.lean, -twist * 0.6, this.roll + waddle, 'YXZ'));
      const hipsT = yq.clone().multiply(qeul(this.lean * 0.4, twist, (this.roll + waddle) * 0.5, 'YXZ'));
      const air = this.grounded || this.swimming || seated ? 1 : 0.55;
      const k = strength * air * (hanging ? (this.onRide ? 0.12 : 0.35) : 1) * (this.mantle ? 0.5 : 1);
      this.upright(chest, chestT, 260 * k, 26 * Math.sqrt(k), parts.chest.I * 4.5);
      this.upright(hips, hipsT, 200 * k, 22 * Math.sqrt(k), parts.hips.I * 4.5);
    }

    // --- limp bodies float: per-part buoyancy and water drag
    if (limp && water != null) {
      for (const n in parts) {
        const p = parts[n], b = p.body, t = b.translation();
        const r = p.def.r * S, depth = water - t.y;
        if (depth <= -r) continue;
        const k = Math.min(1, (depth + r) / (2 * r)), m = b.mass(), bv = b.linvel();
        const drag = Math.min(1, k * 2.5 * DT);
        b.applyImpulse({ x: -bv.x * m * drag, y: k * m * 9.81 * 1.3 * DT - bv.y * m * drag, z: -bv.z * m * drag }, true);
      }
    }

    // --- trampolines and bouncy castles
    if (this.grounded && !seated && this.groundCollider && this.jumpCool <= 0) {
      const bounce = this.physics.bouncy.get(this.groundCollider.handle);
      if (bounce && v.y < -1.2) {
        const up = Math.max(-v.y * 0.92, inp.jump ? bounce : bounce * 0.55);
        for (const b of this.bodies) { const bv = b.linvel(); b.applyImpulse({ x: 0, y: (up - bv.y) * b.mass(), z: 0 }, true); }
        this.jumpCool = 0.25;
        this.impactGrace = 0.3;
        this.sqV -= 2.5;
        this.game.audio?.play('boing', cp, Math.min(1, -v.y / 8));
      }
    }

    // --- hover spring / swimming lift
    if (!limp && !seated && !this.mantle) {
      if (this.swimming) {
        // diving: hold sprint (Shift / LB) to swim down (to just above the bed); let go to float up
        const room = Math.max(0, Math.min(25, water - floorY - 0.9));
        this.diveD = Math.max(0, Math.min(room, (this.diveD || 0) + (inp.sprint ? 1.8 : -1.3) * DT));
        const target = water - 0.12 - this.diveD;
        const err = target - cp.y;
        const cv = chest.linvel();
        const a = Math.max(-5, Math.min(25, 40 * err - 6 * cv.y + 9.81));
        chest.applyImpulse({ x: 0, y: a * this.totalMass * DT * 0.75, z: 0 }, true);
        hips.applyImpulse({ x: 0, y: a * this.totalMass * DT * 0.25, z: 0 }, true);
      } else if (this.grounded && this.jumpCool <= 0) {
        // bouncy walk: the hips bob up as the legs pass each other
        const bob = (Math.abs(Math.cos(this.phase)) - 0.55) * 0.2 * S * amp;
        let h = STAND_H + bob - this.landDip * 0.16 * S - this.reachDown * 0.12 * S - (this.emoteBody?.dip || 0);
        // duck under a low ceiling (under the pier, in a crawl space) instead of wedging the head in it
        const room = this.headroom();
        if (room < HEAD_TOP) h = Math.max(STAND_H * 0.55, h - (HEAD_TOP - room));
        if (this.getUp >= 0) h = this.getUpH + (h - this.getUpH) * rise;
        const err = h - this.groundDist;
        const vy = v.y - gv.y;
        let a = 140 * err - 16 * vy + 9.81;
        a = Math.max(0, Math.min(45, a)) * Math.max(strength, this.getUp >= 0 ? 1 : 0);
        const imp = a * this.totalMass * DT;
        hips.applyImpulse({ x: 0, y: imp * 0.7, z: 0 }, true);
        chest.applyImpulse({ x: 0, y: imp * 0.3, z: 0 }, true);
        // equal and opposite push on whatever we stand on (boats, see-saws...)
        const gb = this.groundBody;
        if (gb && gb.isDynamic()) gb.applyImpulseAtPoint({ x: 0, y: -imp * 0.8, z: 0 }, this.groundPoint, true);
      }
    }

    // --- climbing over a ledge
    if (this.mantle) this.updateMantle();

    // --- locomotion
    this.accFwd = 0;
    if (!limp && !seated && !this.mantle) {
      const slippery = this.grounded && this.groundCollider && this.physics.slippery.has(this.groundCollider.handle);
      const tvx = mvx * speed + gv.x, tvz = mvz * speed + gv.z;
      let dvx = (mag > 0.05 ? tvx : (this.grounded ? gv.x : v.x)) - v.x;
      let dvz = (mag > 0.05 ? tvz : (this.grounded ? gv.z : v.z)) - v.z;
      // snappy but not instant: ~0.25 s to walking pace, quicker to turn round
      let accel;
      if (this.swimming) accel = 6;
      else if (!this.grounded) accel = hanging ? 5 : AIR_ACCEL;
      else if (slippery) accel = 1;
      else {
        const opp = hspeed > 0.5 && mag > 0.05 ? Math.max(0, -(hv.x * mvx + hv.z * mvz) / (hspeed * mag)) : 0;
        accel = (mag > 0.05 ? 14 : 12) + 12 * opp;
      }
      if (slippery) {
        // slide down the slope: tangential part of gravity
        const n = this.groundNormal;
        const gx = n.x * n.y * 9.81, gz = n.z * n.y * 9.81;
        hips.applyImpulse({ x: gx * this.totalMass * DT * 0.55, y: 0, z: gz * this.totalMass * DT * 0.55 }, true);
        chest.applyImpulse({ x: gx * this.totalMass * DT * 0.45, y: 0, z: gz * this.totalMass * DT * 0.45 }, true);
        if (mag < 0.05) { dvx = 0; dvz = 0; }
      }
      if (this.punch.t > 0.12 && mag < 0.05) { dvx = 0; dvz = 0; } // don't brake the lunge
      // dash (B): a burst the way the stick points (else the way we face); once in the air
      // until we land again; the drive doesn't brake it for DASH_T
      if (this.grounded || this.swimming || hanging) this.airDashed = false;
      if (pressed.dash && this.dashCool <= 0 && !hanging && this.state === 'normal' && !this.airDashed) {
        const dx = mag > 0.1 ? mvx / mag : Math.sin(this.yaw), dz = mag > 0.1 ? mvz / mag : Math.cos(this.yaw);
        const ds = (this.swimming ? DASH_SWIM : DASH_V * Math.min(1.3, this.gear?.speed || 1)) * (this.form?.speed ?? 1);
        const lift = this.swimming ? 0 : this.grounded ? 1.2 : 2;
        for (const b of this.bodies) {
          const bv = b.linvel(), m = b.mass();
          b.applyImpulse({ x: (gv.x + dx * ds - bv.x) * m, y: Math.max(0, lift - bv.y) * m, z: (gv.z + dz * ds - bv.z) * m }, true);
        }
        this.yaw = Math.atan2(dx, dz);
        this.airDashed = !this.grounded && !this.swimming;
        this.dashT = DASH_T; this.dashCool = 0.65;
        this.impactGrace = Math.max(this.impactGrace, 0.12);
        this.sqV -= 2;
        this.game.audio?.play('swish', cp, 1.4);
      }
      if (this.dashT > 0) { dvx = 0; dvz = 0; this.dashing = true; }
      else if (this.dashing) {
        // dash over: in the air nothing brakes, so come back down to a run's speed
        this.dashing = false;
        if (!this.grounded && !this.swimming && !hanging && hspeed > RUN) {
          const k = RUN / hspeed;
          for (const b of this.bodies) { const bv = b.linvel(); b.setLinvel({ x: gv.x + (bv.x - gv.x) * k, y: bv.y, z: gv.z + (bv.z - gv.z) * k }, true); }
          if (this.jumpAxis) this.jumpAxis.s = Math.min(this.jumpAxis.s, RUN);
        }
      }
      const airborne = !this.grounded && !this.swimming && !hanging;
      // the jump's direction and speed as it left the ground (pulling back is measured against it)
      if (!airborne) this.jumpAxis = hspeed > 0.5 ? { x: hv.x / hspeed, z: hv.z / hspeed, s: hspeed } : null;
      const ja = this.jumpAxis;
      if (airborne && ja) {
        // in the air: steer freely across and along the jump, but pulling back only bends it:
        // braking against the take-off direction is capped at AIR_BRAKE and stops once the
        // jump is down to AIR_KEEP of its take-off speed
        const ux = ja.x, uz = ja.z;
        let par = dvx * ux + dvz * uz, px = dvx - par * ux, pz = dvz - par * uz;
        const along = hv.x * ux + hv.z * uz, floor = ja.s * AIR_KEEP;
        par = Math.max(-AIR_BRAKE * DT, Math.min(AIR_ACCEL * DT, par));
        if (par < 0) par = Math.max(par, Math.min(0, floor - along));
        const pl = Math.hypot(px, pz), maxP = AIR_ACCEL * DT;
        if (pl > maxP) { px *= maxP / pl; pz *= maxP / pl; }
        dvx = px + par * ux; dvz = pz + par * uz;
      } else {
        const maxDv = accel * DT;
        const dl = Math.hypot(dvx, dvz);
        if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
      }
      const M = this.totalMass * strength * (this.getUp >= 0 ? rise : 1);
      // the legs take their own share: pushed only through the hips they were
      // dragged behind and trailed ~1 rad back while running
      const legM = this.legMass ??= LEG_PARTS.reduce((a, n) => a + parts[n].body.mass(), 0), bodyM = M * (1 - legM / this.totalMass);
      hips.applyImpulse({ x: dvx * bodyM * 0.55, y: 0, z: dvz * bodyM * 0.55 }, true);
      chest.applyImpulse({ x: dvx * bodyM * 0.45, y: 0, z: dvz * bodyM * 0.45 }, true);
      for (const n of LEG_PARTS) { const lb = parts[n].body, k = M / this.totalMass * lb.mass(); lb.applyImpulse({ x: dvx * k, y: 0, z: dvz * k }, true); }
      if (this.grounded) this.accFwd = (dvx * Math.sin(this.yaw) + dvz * Math.cos(this.yaw)) / DT;

      // climbing: hold forward (or press jump) while hanging off a ledge
      const bothHeld = !!(this.hands.L.joint && this.hands.R.joint);
      const pushing = bothHeld && mag > 0.5 && (mvx * Math.sin(this.yaw) + mvz * Math.cos(this.yaw)) / mag > 0.5;
      this.hangPush = pushing ? this.hangPush + DT : 0;

      // un-stick: pushing the stick for a while without getting anywhere (and
      // not just walking into a wall) hops us up and on, or ducks us forward
      // out from under something
      if (mag > 0.5 && !hanging && !this.swimming && this.punch.t <= 0 && hspeed < 0.3 && !this.blockedAhead()) {
        this.stuckT += DT;
        if (this.stuckT > 1.5) {
          this.stuckT = 0;
          const low = this.headroom() < HEAD_TOP + 0.1;
          const up = low ? -1 : 4, fwd = low ? 3 : 2;
          for (const b of this.bodies) {
            const bv = b.linvel(), m = b.mass();
            b.applyImpulse({ x: (mvx / mag * fwd - bv.x) * m, y: (up - bv.y) * m, z: (mvz / mag * fwd - bv.z) * m }, true);
          }
          this.jumpCool = 0.3;
          this.impactGrace = Math.max(this.impactGrace, 0.3);
        }
      } else this.stuckT = Math.max(0, this.stuckT - DT * 2);
      // a ledge under our grip: jump (or keep pushing forward) to climb over it
      const wantClimb = bothHeld && this.jumpCool <= 0 && this.grip > 0.05 && (pressed.jump || this.hangPush > 0.35);
      const ledge = wantClimb ? this.findLedge() : null;

      // jump
      if (ledge != null) {
        this.startMantle(ledge);
        this.hangPush = 0;
        this.game.audio?.play('jump', cp);
      } else if ((pressed.jump || this.jumpBuf > 0) && this.jumpCool <= (pressed.jump && !this.grounded ? 0.2 : 0) && (this.getUp < 0 || this.getUp > GETUP_T * 0.6)) {
        // (a wall jump may follow 0.15 s after the last jump; ground jumps wait the full cooldown)
        const footing = this.jumpCool <= 0 && (this.grounded || this.swimming || (this.offGround < COYOTE && !hanging));
        if (footing) {
          // push off: straight up, plus a little kick the way the stick points
          const jv = this.swimming ? 4.2 : JUMP_V * (this.gear?.jump || 1) * (this.form?.jump ?? 1), // gadgets: high-jump boots; forms.js
            kick = this.swimming ? 0 : 0.9 * (this.form?.kick ?? 1);
          for (const b of this.bodies) {
            const bv = b.linvel();
            b.applyImpulse({ x: mvx * kick * b.mass(), y: (gv.y + jv - bv.y) * b.mass(), z: mvz * kick * b.mass() }, true);
          }
          // push back on what we jumped off (boats, see-saws, props)
          const gb = this.groundBody;
          if (gb && gb.isDynamic() && this.grounded) gb.applyImpulseAtPoint({ x: 0, y: -jv * this.totalMass * 0.3, z: 0 }, this.groundPoint, true);
          this.jumpBuf = 0;
          this.offGround = COYOTE;
          this.jumpCool = 0.35;
          this.impactGrace = Math.max(this.impactGrace, 0.08);
          this.sqV -= 3;
          this.landDip = 0;
          this.game.audio?.play('jump', cp);
        } else if (!hanging && !this.swimming && pressed.jump && this.airTime > 0.05 && (this.wallHit = this.wallNear(mvx, mvz))) {
          // wall jump: kick off away from the wall and up. Bouncing between two
          // walls chains; the same wall again needs a landing first
          const n = this.wallHit;
          const jv = JUMP_V * 0.95, out = 4.8;
          for (const b of this.bodies) {
            const bv = b.linvel(), m = b.mass();
            b.applyImpulse({ x: (n.x * out - bv.x) * m, y: (jv - bv.y) * m, z: (n.z * out - bv.z) * m }, true);
          }
          this.yaw = Math.atan2(n.x, n.z);
          this.lastWall = { x: n.x, z: n.z };
          this.jumpBuf = 0;
          this.jumpCool = 0.3;
          this.impactGrace = Math.max(this.impactGrace, 0.15);
          this.sqV -= 3;
          this.game.audio?.play('jump', cp);
        } else if (hanging && pressed.jump && this.jumpCool <= 0 && !((this.anchorHand('L') || this.anchorHand('R')) && (this.grip < GRIP_HOP || this.ceilingOver()) && !this.wallAhead())) {
          // let go and fling yourself up and forward (monkey bars, ropes); off a
          // flat wall you only push off it: no wall-running. Too tired for a hop off a
          // bar: nothing happens, you keep hanging.
          const anchored = this.anchorHand('L') || this.anchorHand('R');
          const hop = !anchored || (this.grip >= GRIP_HOP && !this.wallAhead());
          this.releaseAll();
          this.hands.L.cool = this.hands.R.cool = 0.4;
          if (hop) {
            if (anchored) this.grip -= GRIP_HOP;
            for (const b of this.bodies) b.applyImpulse({ x: Math.sin(this.yaw) * 2.5 * b.mass(), y: 6.5 * b.mass(), z: Math.cos(this.yaw) * 2.5 * b.mass() }, true);
          } else {
            this.hands.L.cool = this.hands.R.cool = 0.6;
            for (const b of this.bodies) b.applyImpulse({ x: -Math.sin(this.yaw) * 2.2 * b.mass(), y: 1.5 * b.mass(), z: -Math.cos(this.yaw) * 2.2 * b.mass() }, true);
          }
          this.sqV -= 2;
          this.impactGrace = Math.max(this.impactGrace, 0.08);
          this.jumpCool = 0.35;
          this.game.audio?.play('jump', cp);
        }
      }
      if (pressed.punch && this.punch.t <= 0 && this.form) this.form.attack(); // forms.js: headbutt / bite / hop
      else if (pressed.punch && this.punch.t <= 0 && !this.gear?.punch?.(this, inp)) { // gadgets: laser gun / grappling hook fire instead
        this.punch.hand = this.punch.hand === 'L' ? 'R' : 'L';
        if (inp.grabL > 0.5 && inp.grabR <= 0.5) this.punch.hand = 'R';
        if (inp.grabR > 0.5 && inp.grabL <= 0.5) this.punch.hand = 'L';
        this.punch.t = 0.32; this.punch.hit = false;
        this.impactGrace = Math.max(this.impactGrace, 0.08);
        const la = parts['lArm' + this.punch.hand].body;
        la.applyImpulse({ x: Math.sin(this.yaw) * 1.5, y: 0, z: Math.cos(this.yaw) * 1.5 }, true);
        // lunge into the punch
        const lv = this.grounded ? 2.2 : 1.0;
        chest.applyImpulse({ x: Math.sin(this.yaw) * lv * this.totalMass * 0.5, y: 0, z: Math.cos(this.yaw) * lv * this.totalMass * 0.5 }, true);
        hips.applyImpulse({ x: Math.sin(this.yaw) * lv * this.totalMass * 0.3, y: 0, z: Math.cos(this.yaw) * lv * this.totalMass * 0.3 }, true);
        this.game.audio?.play('swish', cp);
      }
    }
    if (this.punch.t > 0.08 && this.punch.t < 0.26 && !this.punch.hit && !limp) this.punchHit();

    // --- pose
    this.animate(inp, fwdSpeed, limp, seated, mag, amp, hanging);
    if (this.emote) emoteStep(this, inp, pressed, mag, limp, seated);
    this.gear?.step(this, inp, pressed); // gadgets (src/gadgets.js): thrust, glide, aiming arm, hook
    const kLimb = limp ? 0.06 : strength * 0.85 + 0.15;
    if (!limp && !seated) for (const h of ['L', 'R']) if (this.reachArm[h] && !this.hands[h].joint) this.handAssist(h, kLimb);
    this.gravityComp(limp);
    for (const n in parts) {
      const p = parts[n];
      if (!p.parent) continue;
      if (!limp && n.includes('Leg')) continue; // legs are posed directly while in control (poseLegs)
      const kl = kLimb;
      let kp = p.kp * kl, kd = p.kd * Math.sqrt(kl);
      if (limp) { kp = Math.max(kp, 4); kd = Math.max(kd, 1.2); }
      // hanging off a moving ride the hands are pinned to it: stiff arm drives
      // would fight the grip joints as the ride turns and set the arms buzzing
      if (this.onRide && n.includes('Arm')) { kp *= 0.2; kd *= 0.6; }
      this.drive(p, kp, kd, p.maxT);
    }
    if (!limp) this.poseLegs(); // the legs follow the animation exactly; a full ragdoll flops freely

    // --- impacts: big ones knock you out, smaller ones make you stumble
    const cv = chest.linvel();
    _va.set(cv.x, cv.y, cv.z);
    const dv = _va.distanceTo(this.prevChestVel);
    this.prevChestVel.copy(_va);
    if (!seated && this.impactGrace <= 0) {
      if (dv > 9) this.knockOut(Math.min(4, 1.2 + (dv - 9) * 0.25));
      else if (dv > 4.5 && !limp) { this.stumble = Math.max(this.stumble, 0.25 + (dv - 4.5) * 0.08); this.sqV += 1.5; }
    }
    if (!seated && !limp && this.impactGrace <= 0) this.hitCheck();
    this.prevVy = hips.linvel().y;

    // --- squash & stretch spring (visual only)
    this.sqV += (-260 * this.sq - 10 * this.sqV) * DT;
    this.sq += this.sqV * DT;
    this.sq = Math.max(-0.2, Math.min(0.22, this.sq));

    // respawn if lost
    if (cp.y < -25) this.respawn();
  }

  // Loose things flying into our upper body: a stumble, or a knockout when
  // it's heavy and fast (a thrown crate, a rolling boulder...). Vehicles are
  // handled by the game's contact-force events.
  hitCheck() {
    const chest = this.chest, cv = chest.linvel();
    let worst = 0;
    for (const n of ['chest', 'head']) {
      this.world.contactPairsWith(this.parts[n].cols[0], (other) => {
        const b = other.parent();
        if (!b || !b.isDynamic() || this.bodies.includes(b)) return;
        if (b === this.hands.L.body || b === this.hands.R.body) return;
        const owner = this.physics.handleOwner.get(other.handle);
        if (owner && owner.constructor?.name === 'Vehicle') return;
        const v = b.linvel();
        const rv = Math.hypot(v.x - cv.x, v.y - cv.y, v.z - cv.z);
        const m = Math.min(b.mass(), 200);
        if (rv > 3.5) worst = Math.max(worst, m * rv);
      });
    }
    if (worst > 160) { this.knockOut(Math.min(3, 1 + worst / 300)); this.impactGrace = 0.4; }
    else if (worst > 35) { this.stumble = Math.max(this.stumble, 0.3 + Math.min(0.4, worst / 300)); this.sqV += 1.5; this.impactGrace = 0.25; }
  }

  // A ledge under one of our grips: returns the height of its top surface, or null.
  findLedge() {
    let best = null;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const h of ['L', 'R']) {
      const hand = this.hands[h];
      if (!hand.joint || !hand.body || hand.owner instanceof Player) continue;
      if (hand.body.isDynamic() && hand.body.mass() < 150) continue;
      const gp = this.handPos(h, new THREE.Vector3());
      for (const off of [0.12, 0.3]) {
        const o = { x: gp.x + fx * off, y: gp.y + 0.95, z: gp.z + fz * off };
        const hit = this.world.castRayAndGetNormal(new RAPIER.Ray(o, { x: 0, y: -1, z: 0 }), 1.35, true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
        if (!hit || hit.normal.y < 0.6) continue;
        const top = o.y - hit.timeOfImpact;
        if (top > gp.y - 0.3 && top < gp.y + 0.55) { best = Math.max(best ?? -1e9, top); break; }
      }
    }
    // under an overhang (the ledge is a roof edge right above us): nothing to pull up past,
    // so no climb; pulling up there only drove the arms into the roof
    if (best != null) {
      const c = this.chest.translation();
      const up = this.world.castRay(new RAPIER.Ray({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 1, z: 0 }), best - c.y + 0.05, true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, this.queryGroups);
      if (up) return null;
    }
    return best;
  }

  // Merged static scenery is hollow (staticmerge.js triangle meshes), so an arm pushed through
  // a roof or slab (pulling up under an overhang) would stay stuck inside it: a free arm found
  // inside one is moved straight back out toward the chest, at the chest's speed.
  unstickArms() {
    const sm = this.game.staticMerge;
    if (!sm?.insideAt) return;
    const c = this.chest.translation();
    for (const h of ['L', 'R']) {
      if (this.hands[h].joint) continue;
      for (const nm of ['lArm' + h, 'uArm' + h]) {
        const b = this.parts[nm].body;
        const pt = nm[0] === 'l' ? this.handPos(h, _vU) : _vU.copy(b.translation());
        const rec = sm.insideAt(pt);
        if (!rec) continue;
        sm.exitToward(rec, pt, c, _vV);
        const t = b.translation();
        b.setTranslation({ x: t.x + _vV.x - pt.x, y: t.y + _vV.y - pt.y, z: t.z + _vV.z - pt.z }, true);
        b.setLinvel(this.chest.linvel(), true); b.setAngvel(this.chest.angvel(), true);
      }
    }
  }

  // Something solid just over our head (hanging under a roof edge): no hop up from there.
  ceilingOver() {
    const c = this.chest.translation();
    return !!this.world.castRay(new RAPIER.Ray({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 1, z: 0 }), 1.0, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, this.queryGroups);
  }

  // A hand holding on to the world (static, kinematic or a heavy body), i.e. hanging.
  anchorHand(h) {
    const hand = this.hands[h], b = hand.body;
    if (!hand.joint || !b || hand.owner instanceof Player) return false;
    return !b.isDynamic() || b.mass() >= 150;
  }

  // A wall right in front of us (steep static surface from the head down to the
  // hips; thin bars and rungs only block one of the rays).
  wallAhead() {
    const c = this.chest.translation(), fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const dy of [0.35, 0, -0.35]) {
      const hit = this.world.castRayAndGetNormal(new RAPIER.Ray({ x: c.x, y: c.y + dy, z: c.z }, { x: fx, y: 0, z: fz }), 0.9, true,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, this.queryGroups);
      if (!hit || Math.abs(hit.normal.y) > 0.5) return false;
    }
    return true;
  }

  // A static wall within reach of the body (looking the way we face, the way
  // the stick points, and sideways): its horizontal normal, or null.
  wallNear(mvx, mvz) {
    const c = this.chest.translation(), fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dirs = [[fx, fz], [fz, -fx], [-fz, fx], [-fx, -fz]];
    if (Math.hypot(mvx, mvz) > 0.3) dirs.unshift([mvx / Math.hypot(mvx, mvz), mvz / Math.hypot(mvx, mvz)]);
    let best = null;
    for (const [dx, dz] of dirs) {
      for (const dy of [0, -0.3]) {
        const hit = this.world.castRayAndGetNormal(new RAPIER.Ray({ x: c.x, y: c.y + dy, z: c.z }, { x: dx, y: 0, z: dz }), 0.75, true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, this.queryGroups);
        if (!hit || Math.abs(hit.normal.y) > 0.4) continue;
        const l = Math.hypot(hit.normal.x, hit.normal.z);
        const n = { x: hit.normal.x / l, z: hit.normal.z / l };
        if (this.lastWall && n.x * this.lastWall.x + n.z * this.lastWall.z > 0.7) continue;
        if (!best || hit.timeOfImpact < best.t) best = { t: hit.timeOfImpact, x: n.x, z: n.z };
      }
    }
    return best;
  }

  startMantle(top) {
    this.grip = Math.max(0, this.grip - GRIP_MANTLE);
    this.mantle = { t: 0, top, stage: 0 };
    this.impactGrace = Math.max(this.impactGrace, 0.3);
    this.sqV -= 1.5;
  }

  // Pull up until the hips clear the ledge, then let go and flop forward over it.
  updateMantle() {
    const m = this.mantle;
    m.t += DT;
    const chest = this.chest, hips = this.hips;
    const cpos = chest.translation();
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hy = hips.translation().y;
    // stage 0: pull up on the arms until the shoulders are over the edge (or we stall)
    if (m.stage === 0) {
      const vy = chest.linvel().y;
      m.stall = vy < 0.4 && m.t > 0.25 ? (m.stall || 0) + DT : 0;
      if (cpos.y > m.top + 0.12 || m.stall > 0.12 || m.t > 0.9) {
        m.stage = 1; m.t1 = m.t;
        const h0 = hips.translation(); m.x1 = h0.x; m.z1 = h0.z;
        this.releaseAll();
        this.hands.L.cool = this.hands.R.cool = 0.45;
      }
    }
    // stage 1: hands off, hips up over the edge and flop forward onto the top
    if (m.stage === 1) {
      const hp = hips.translation();
      const moved = (hp.x - m.x1) * fx + (hp.z - m.z1) * fz;
      m.done = m.t - m.t1 > 0.8 || (hy > m.top + 0.15 && moved > 0.4);
    }
    if (m.stage === 1 && m.done) { this.mantle = null; this.jumpCool = 0.2; return; }
    let vt;
    if (m.stage === 0) vt = { x: -fx * 0.15, y: 3.4, z: -fz * 0.15 };
    else {
      const over = hy > m.top - 0.05;
      vt = { x: fx * (over ? 2.4 : 0.1), y: hy < m.top + 0.2 ? 3.2 : 0.4, z: fz * (over ? 2.4 : 0.1) };
    }
    // carry our own weight (the hover spring is off in the air) and steer the velocity
    const k = Math.min(1, DT * 14);
    for (const [b, share] of [[chest, 0.55], [hips, 0.45]]) {
      const bv = b.linvel(), M = this.totalMass * share;
      b.applyImpulse({ x: (vt.x - bv.x) * M * k, y: (vt.y - bv.y) * M * k + M * 9.81 * DT, z: (vt.z - bv.z) * M * k }, true);
    }
  }

  animate(inp, fwdSpeed, limp, seated, mag, amp, hanging) {
    const P = this.parts;
    const set = (n, q, kp, kd, maxT = 1e9, float = true) => { const p = P[n]; p.target.copy(q); p.kp = kp; p.kd = kd; p.maxT = maxT; p.float = float; };
    const sp = Math.abs(fwdSpeed);
    const prevC = Math.cos(this.phase);
    if (this.grounded && !limp && !seated) this.phase += DT * (Math.min(sp, RUN) * 2.3 + (mag > 0.1 ? 1.6 : 0));
    else if (this.swimming) this.phase += DT * 5;
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    // a little squash on each footfall
    if (this.grounded && !limp && !seated && sp > 0.8 && Math.sign(c) !== Math.sign(prevC)) this.sqV += 0.5 * amp;
    const camPitch = this.cam ? this.cam.pitch : 0.2;
    const T = this.t;
    const vy = this.hips.linvel().y;
    const getUp = this.getUp >= 0 ? 1 - Math.min(1, this.getUp / (GETUP_T * 0.85)) : 0;

    // head: soft spring so it bobbles; keeps looking ahead as the body leans,
    // and looks up with the camera while reaching
    const reaching = (inp.grabL > 0.3 || inp.grabR > 0.3) && !limp;
    const headPitch = this.swimming ? -0.7 : -this.lean * 0.55 - (reaching ? Math.max(0, 0.35 - camPitch) * 0.6 : 0);
    set('head', qeul(headPitch, 0, -this.roll * 0.4), 300, 15);

    if (seated) {
      set('uLegL', qeul(-1.45, 0, 0.08), 120, 12); set('uLegR', qeul(-1.45, 0, -0.08), 120, 12);
      set('lLegL', qx(1.35), 100, 10); set('lLegR', qx(1.35), 100, 10);
      if (this.seat.kind === 'driver') {
        const st = (this.seat.vehicle?.steer || 0) * 0.5;
        set('uArmL', qeul(-1.15 - st * 0.3, 0, -0.25), 440, 22); set('uArmR', qeul(-1.15 + st * 0.3, 0, 0.25), 440, 22);
        set('lArmL', qeul(-0.35, 0, -0.35), 360, 18); set('lArmR', qeul(-0.35, 0, 0.35), 360, 18);
      } else {
        const up = inp.grabL > 0.5 || inp.grabR > 0.5;
        set('uArmL', up && inp.grabL > 0.5 ? qeul(-2.9, 0, 0.3) : qeul(-0.35, 0, 0.12), 360, 18);
        set('uArmR', up && inp.grabR > 0.5 ? qeul(-2.9, 0, -0.3) : qeul(-0.35, 0, -0.12), 360, 18);
        set('lArmL', qx(-0.4), 280, 14); set('lArmR', qx(-0.4), 280, 14);
      }
      return;
    }

    // legs
    const flail = !this.grounded && !this.swimming && !hanging && !limp;
    const fall = flail ? Math.min(1, Math.max(0, (-vy - 1) / 5)) * Math.min(1, this.airTime / 0.35) : 0;
    if (this.swimming) {
      const k = Math.sin(ph * 2) * 0.45;
      set('uLegL', qx(-0.15 + k), 90, 9); set('uLegR', qx(-0.15 - k), 90, 9);
      set('lLegL', qx(0.3), 70, 7); set('lLegR', qx(0.3), 70, 7);
    } else if (this.mantle) {
      // knees up to clear the edge
      set('uLegL', qx(-1.5), 160, 14); set('uLegR', qx(-1.3), 160, 14);
      set('lLegL', qx(1.7), 140, 12); set('lLegR', qx(1.6), 140, 12);
    } else if (getUp > 0) {
      // crouch and push up from the floor
      const g = getUp;
      set('uLegL', qx(-1.35 * g), 170, 14); set('uLegR', qx(-1.25 * g), 170, 14);
      set('lLegL', qx(1.9 * g + 0.05), 150, 12); set('lLegR', qx(1.8 * g + 0.05), 150, 12);
    } else if (this.grounded) {
      const dip = Math.max(this.landDip, this.reachDown * 0.7);
      // a short, tidy stride (Wobbly Life style): the legs are visual, the wobble lives in the body and arms
      set('uLegL', qx(-s * amp * 0.6 - dip * 0.4), 760, 40); set('uLegR', qx(s * amp * 0.6 - dip * 0.4), 760, 40);
      set('lLegL', qx(Math.max(0, c) * amp * 0.55 + 0.05 + dip * 0.7), 680, 36);
      set('lLegR', qx(Math.max(0, -c) * amp * 0.55 + 0.05 + dip * 0.7), 680, 36);
    } else {
      // legs stay extended just after the push-off (jump, bounce), tuck at the
      // top, then reach down ready to land; only a long fall pedals
      const push = vy > 1.5 ? Math.max(0, 1 - this.airTime / 0.2) : 0;
      const land = vy < -0.5 ? Math.min(1, (-vy - 0.5) / 3.5) : 0;
      const mix = (tuck, ext, reachDown) => (tuck + (ext - tuck) * push) * (1 - land) + reachDown * land;
      const f = Math.sin(T * 9) * 0.12 * fall * Math.min(1, Math.max(0, (this.airTime - 0.8) / 0.4));
      set('uLegL', qx(mix(-0.35, -0.08, -0.25) + f), 720, 38); set('uLegR', qx(mix(-0.25, -0.04, -0.15) - f), 720, 38);
      set('lLegL', qx(mix(0.55, 0.1, 0.35) - f * 0.5), 640, 34); set('lLegR', qx(mix(0.45, 0.08, 0.25) + f * 0.5), 640, 34);
    }

    // arms
    const reach = -(Math.PI / 2 + 0.25 - camPitch * 0.9);
    this.reachArm.L = this.reachArm.R = false;
    const stumbling = this.stumble > 0 && !limp;
    for (const h of ['L', 'R']) {
      const sign = h === 'L' ? 1 : -1;
      const grab = (h === 'L' ? inp.grabL : inp.grabR) > 0.3 && !limp;
      const punching = this.punch.t > 0 && this.punch.hand === h && !limp;
      const ph2 = h === 'L' ? 0 : 2.1;
      if (punching) {
        const ext = this.punch.t > 0.12;
        set('uArm' + h, qeul(ext ? -1.55 : -0.9, 0, -sign * 0.45), 1000, 30);
        set('lArm' + h, qx(ext ? -0.05 : -1.2), 800, 26);
      } else if (grab || (this.mantle && this.mantle.stage === 0)) {
        const held = this.hands[h].joint;
        this.reachArm[h] = grab;
        const r = this.mantle ? -0.6 : Math.max(-3.0, reach);
        set('uArm' + h, qeul(r, 0, -sign * 0.12), held ? 660 : 540, 36, 600);
        set('lArm' + h, qx(-0.1), held ? 540 : 420, 30, 500);
      } else if (this.swimming) {
        const a = ph + (h === 'L' ? 0 : Math.PI);
        set('uArm' + h, qeul(-1.6 + Math.sin(a) * 1.1, 0, sign * (0.6 + Math.cos(a) * 0.5)), 480, 20);
        set('lArm' + h, qx(-0.3), 320, 16);
      } else if (getUp > 0.3) {
        // hands push on the floor
        set('uArm' + h, qeul(-0.9, 0, sign * 0.35), 300, 14);
        set('lArm' + h, qx(-0.3), 240, 12);
      } else if (stumbling) {
        // windmill to catch our balance
        const a = T * 15 + ph2;
        set('uArm' + h, qeul(-1.4 + Math.sin(a) * 0.9, 0, sign * (1.0 + Math.cos(a) * 0.4)), 260, 12);
        set('lArm' + h, qx(-0.5), 200, 10);
      } else if (this.grounded) {
        const sw = (h === 'L' ? s : -s) * amp * 0.95;
        const idle = Math.sin(T * 2.1 + ph2) * 0.04;
        set('uArm' + h, qeul(sw, 0, sign * (0.14 + idle + amp * 0.12)), 290, 17, 1e9, false);
        set('lArm' + h, qx(-0.25 - Math.abs(sw) * 0.35), 230, 13, 1e9, false);
      } else {
        // flail: arms up and out, faster and wilder the longer we fall
        const a = T * (10 + 6 * fall) + ph2;
        const f = Math.sin(a) * (0.2 + 0.7 * fall);
        set('uArm' + h, qeul(-0.6 - fall * 1.6 + f, 0, sign * (1.15 + Math.cos(a) * 0.35 * fall)), 320, 18);
        set('lArm' + h, qx(-0.4 - fall * 0.4), 240, 14);
      }
    }
  }

  // Carried things follow the arms. The arm drives are deliberately soft (they
  // only move the limb's own inertia), so on their own they can't lift or
  // swing a crate. Instead the grip point of a held loose object is pulled
  // toward where the posed hand would be, with the reaction on the chest:
  // carrying, lifting and throwing by swinging the arms then just work.
  carryAssist() {
    const chest = this.chest;
    for (const h of ['L', 'R']) {
      const hand = this.hands[h];
      const b = hand.body;
      if (!hand.joint || !b || !b.isDynamic() || hand.owner instanceof Player || !hand.local || b.mass() > CARRY_MAX * 3) continue;
      const share = (this.hands.L.body === b && this.hands.R.body === b) ? 0.5 : 1;
      const m = Math.min(b.mass(), CARRY_MAX) * share;
      // where the posed hand would be: shoulder + arm direction * arm length
      const tgt = this.poseHand(h, _hA);
      // current grip point and its velocity
      toQ(b.rotation(), _qc);
      const gp = _vc.set(hand.local.x, hand.local.y, hand.local.z).applyQuaternion(_qc);
      const bt = b.translation(), bv = b.linvel(), bw = b.angvel();
      const gvx = bv.x + bw.y * gp.z - bw.z * gp.y, gvy = bv.y + bw.z * gp.x - bw.x * gp.z, gvz = bv.z + bw.x * gp.y - bw.y * gp.x;
      gp.x += bt.x; gp.y += bt.y; gp.z += bt.z;
      const cv = chest.linvel();
      let fx = (tgt.x - gp.x) * 110 + (cv.x - gvx) * 16;
      let fy = (tgt.y - gp.y) * 110 + (cv.y - gvy) * 16 + 9.81;
      let fz = (tgt.z - gp.z) * 110 + (cv.z - gvz) * 16;
      const a = Math.hypot(fx, fy, fz), amax = 60;
      if (a > amax) { fx *= amax / a; fy *= amax / a; fz *= amax / a; }
      const imp = { x: fx * m * DT, y: fy * m * DT, z: fz * m * DT };
      b.applyImpulse(imp, true);
      // reaction: the load's weight and swing push on us, but pressing a
      // stuck object down never lifts us off the ground
      chest.applyImpulse({ x: -imp.x, y: Math.min(0, -imp.y), z: -imp.z }, true);
    }
  }

  // Where the posed mitten would be: shoulder + arm direction * arm length.
  poseHand(h, out) {
    const u = this.parts['uArm' + h], chest = this.chest;
    toQ(chest.rotation(), _qa);
    out.copy(u.rest).add(u.anchor).sub(this.parts.chest.rest).applyQuaternion(_qa).add(toV(chest.translation(), _vc));
    _qb.copy(_qa).multiply(u.target);
    return out.add(_vc.set(0, -ARM_LEN, 0).applyQuaternion(_qb));
  }

  // A reaching arm is a light chain hanging off a soft joint drive and
  // whirls about for a second before it settles. Steer the mitten straight
  // to where the pose puts it (reaction on the chest) so grabs land.
  handAssist(h, k) {
    const la = this.parts['lArm' + h].body, chest = this.chest;
    const tgt = this.poseHand(h, _hA);
    const hp = this.handPos(h, _hB);
    const hv = la.linvel(), cv = chest.linvel();
    let fx = (tgt.x - hp.x) * 160 + (cv.x - hv.x) * 18;
    let fy = (tgt.y - hp.y) * 160 + (cv.y - hv.y) * 18;
    let fz = (tgt.z - hp.z) * 160 + (cv.z - hv.z) * 18;
    const a = Math.hypot(fx, fy, fz), amax = 90;
    if (a > amax) { fx *= amax / a; fy *= amax / a; fz *= amax / a; }
    const m = ARM_MASS * k * DT;
    const imp = { x: fx * m, y: fy * m, z: fz * m };
    la.applyImpulseAtPoint(imp, { x: hp.x, y: hp.y, z: hp.z }, true);
    chest.applyImpulse({ x: -imp.x, y: -imp.y, z: -imp.z }, true);
  }

  // Is this upper arm pointing roughly where its drive wants it?
  armReady(h) {
    const u = this.parts['uArm' + h];
    toQ(this.chest.rotation(), _qa).multiply(u.target);
    _va.set(0, -1, 0).applyQuaternion(_qa);
    _vb.set(0, -1, 0).applyQuaternion(toQ(u.body.rotation(), _qb));
    return _va.dot(_vb) > 0.8;
  }

  updateHands(inp) {
    for (const h of ['L', 'R']) {
      const hand = this.hands[h];
      const want = (h === 'L' ? inp.grabL : inp.grabR) > 0.5;
      if (hand.joint && !hand.joint.isValid()) this.releaseHand(h);
      if (hand.joint && !want) this.releaseHand(h, true);
      hand.hold = want ? (hand.hold || 0) + DT : 0;
      // the mitten only closes once the arm is up where it is reaching (or
      // has been pressing on something for a moment), so walking into a
      // wall with the trigger held doesn't grab it at the hip
      if (want && !hand.joint && hand.cool <= 0 && !this.mantle && (hand.hold > 0.4 || this.armReady(h))) {
        const hp = this.handPos(h, new THREE.Vector3());
        // nearest thing within reach of the mitten
        let found = null, bestD = 1e9;
        this.world.intersectionsWithShape({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(GRAB_R),
          (col) => {
            const pr = col.projectPoint({ x: hp.x, y: hp.y, z: hp.z }, false);
            const d = pr ? Math.hypot(pr.point.x - hp.x, pr.point.y - hp.y, pr.point.z - hp.z) : 0;
            if (d < bestD) { bestD = d; found = col; }
            return true;
          }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
        // nothing at the mitten: an animal just below it (they're lower than our hands)
        if (!found) {
          const own = this.physics.handleOwner;
          this.world.intersectionsWithShape({ x: hp.x, y: hp.y - 0.5, z: hp.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(GRAB_R * 2.2),
            (col) => { if (own.get(col.handle)?.kind === 'animal') { found = col; return false; } return true; },
            RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
        }
        if (found) {
          const tb = found.parent();
          if (!tb) continue;
          // pull the grab point onto the surface
          const proj = found.projectPoint({ x: hp.x, y: hp.y, z: hp.z }, false);
          const gp = proj ? proj.point : hp;
          toQ(tb.rotation(), _qa).invert();
          const t = tb.translation();
          _vb.set(gp.x - t.x, gp.y - t.y, gp.z - t.z).applyQuaternion(_qa);
          const data = RAPIER.JointData.spherical({ x: 0, y: HAND_OFF, z: 0 }, { x: _vb.x, y: _vb.y, z: _vb.z });
          hand.joint = this.world.createImpulseJoint(data, this.parts['lArm' + h].body, tb, true);
          hand.joint.setContactsEnabled(false);
          hand.body = tb;
          hand.owner = this.physics.handleOwner.get(found.handle) || null;
          hand.local = { x: _vb.x, y: _vb.y, z: _vb.z };
          hand.stretch = 0;
          // catching hold of a moving ride: take up most of its speed at once
          // (instead of the arm joints yanking the body along in one step)
          if (tb.isKinematic()) {
            const pv = this.gripVelocity(h, _hA), cv = this.chest.linvel();
            const dx = (pv.x - cv.x) * RIDE_CATCH, dy = (pv.y - cv.y) * RIDE_CATCH, dz = (pv.z - cv.z) * RIDE_CATCH;
            if (dx * dx + dy * dy + dz * dz > 0.25) for (const b of this.bodies) { const bv = b.linvel(); b.setLinvel({ x: bv.x + dx, y: bv.y + dy, z: bv.z + dz }, true); }
            this.impactGrace = Math.max(this.impactGrace, 0.3);
          }
          this.game.audio?.play('grab', hp);
        }
      }
    }
  }

  // World position (out) of hand h's grip point on the body it holds.
  gripPoint(h, out) {
    const hand = this.hands[h], b = hand.body;
    toQ(b.rotation(), _qc);
    return out.set(hand.local.x, hand.local.y, hand.local.z).applyQuaternion(_qc).add(toV(b.translation(), _vc));
  }
  // Velocity (out) of hand h's grip point. Kinematic rides pivot about their
  // origin (worldCom() is stale for them, as in groundVelocity).
  gripVelocity(h, out) {
    const b = this.hands[h].body;
    const gp = this.gripPoint(h, _hB);
    const c = b.isKinematic() ? b.translation() : b.worldCom();
    const v = b.linvel(), w = b.angvel();
    const rx = gp.x - c.x, ry = gp.y - c.y, rz = gp.z - c.z;
    return out.set(v.x + w.y * rz - w.z * ry, v.y + w.z * rx - w.x * rz, v.z + w.x * ry - w.y * rx);
  }

  // Hanging off a moving ride (any kinematic body): the arm joints alone would
  // whip a light ragdoll about at coaster speeds, so the whole body eases
  // toward the grip point's velocity (RIDE_FOLLOW), hard jolts don't count as
  // impacts while holding on, and a hand dragged far off its grip (snagged on
  // scenery, a violent turn) lets go cleanly. Grip stamina still drains in
  // step() (anchorHand counts kinematic bodies), so tired arms drop you.
  // Returns the carrier velocity (shared Vector3) or null when not riding.
  rideCarry() {
    let n = 0;
    const acc = this._rideV ||= new THREE.Vector3();
    acc.set(0, 0, 0);
    for (const h of ['L', 'R']) {
      const hand = this.hands[h], b = hand.body;
      if (!hand.joint || !b || !hand.local || !b.isKinematic()) continue;
      // torn off?
      const gp = this.gripPoint(h, _hA), hp = this.handPos(h, _hB);
      const d = gp.distanceTo(hp);
      hand.stretch = d > RIDE_TEAR ? (hand.stretch || 0) + DT : 0;
      if (hand.stretch > 0.12) { this.releaseHand(h); hand.cool = 0.5; this.impactGrace = Math.max(this.impactGrace, 0.3); continue; }
      const pv = this.gripVelocity(h, _hA);
      if (!Number.isFinite(pv.x + pv.y + pv.z)) continue;
      // the arm is pinned between the shoulder and a moving ride, and the
      // light forearm would start to whirl round the grip: damp the arm's spin
      // toward the chest's (the drives alone can't hold it at speed)
      const cw = this.chest.angvel();
      for (const nm of ['lArm' + h, 'uArm' + h]) {
        const ab = this.parts[nm].body, a = ab.angvel();
        ab.setAngvel({ x: a.x + (cw.x - a.x) * RIDE_ARMDAMP, y: a.y + (cw.y - a.y) * RIDE_ARMDAMP, z: a.z + (cw.z - a.z) * RIDE_ARMDAMP }, true);
      }
      // Rapier solves the grip joint against where the ride was at the start
      // of the step, so the hand trails its grip by one step of travel (0.3 m
      // at coaster speed) and the arm chain thrashes trying to catch up: aim
      // the joint at where the grip point will be after this step instead
      if (hand.joint.setAnchor2) {
        toQ(b.rotation(), _qc).invert();
        _vc.set(pv.x, pv.y, pv.z).multiplyScalar(DT * RIDE_LEAD).applyQuaternion(_qc);
        hand.joint.setAnchor2({ x: hand.local.x + _vc.x, y: hand.local.y + _vc.y, z: hand.local.z + _vc.z });
      }
      if (!n) this.yaw += b.angvel().y * DT; // turn with the ride (once, from the first grip)
      acc.add(pv); n++;
    }
    this.onRide = n > 0;
    if (!n) return null;
    acc.multiplyScalar(1 / n);
    // dragged along the ground at speed (a coaster dip, a ferry's hull): knocked off
    const near = this.groundDist < STAND_H + 0.3 + Math.max(0, -acc.y) * 0.1; // (looking ahead on a steep dive)
    if (near && !(this.groundBody && !this.groundBody.isFixed()) && Math.hypot(acc.x, acc.y, acc.z) > 7) {
      this.releaseAll();
      this.hands.L.cool = this.hands.R.cool = 0.6;
      this.stumble = Math.max(this.stumble, 0.5);
      this.impactGrace = Math.max(this.impactGrace, 0.3);
      this.onRide = false;
      return null;
    }
    const moving = acc.lengthSq() > 0.04;
    if (moving && !(this.grounded && this.groundBody?.isFixed())) {
      const k = Math.min(1, DT * RIDE_FOLLOW);
      const cv = this.chest.linvel();
      const dx = (acc.x - cv.x) * k, dy = (acc.y - cv.y) * k, dz = (acc.z - cv.z) * k;
      for (const b of this.bodies) {
        const bv = b.linvel();
        let rx = bv.x + dx - acc.x, ry = bv.y + dy - acc.y, rz = bv.z + dz - acc.z;
        const r = Math.hypot(rx, ry, rz);
        if (r > RIDE_MAXREL) { const f = RIDE_MAXREL / r; rx *= f; ry *= f; rz *= f; } // a snag on scenery mustn't fling a limb away
        b.setLinvel({ x: acc.x + rx, y: acc.y + ry, z: acc.z + rz }, true);
        // and no limb spins up round its grip
        const a = b.angvel(), wr = Math.hypot(a.x, a.y, a.z);
        if (wr > RIDE_MAXSPIN) { const f = RIDE_MAXSPIN / wr; b.setAngvel({ x: a.x * f, y: a.y * f, z: a.z * f }, true); }
      }
      this.impactGrace = Math.max(this.impactGrace, 2 * DT);
      this.prevChestVel.set(cv.x + dx, cv.y + dy, cv.z + dz);
    }
    return acc;
  }

  punchHit() {
    const h = this.punch.hand;
    const hp = this.handPos(h, new THREE.Vector3());
    hp.x += Math.sin(this.yaw) * 0.12; hp.z += Math.cos(this.yaw) * 0.12;
    let hit = null;
    this.world.intersectionsWithShape({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(HAND_R * 2.4),
      (col) => { hit = col; return false; }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_FIXED, this.queryGroups);
    if (!hit) return;
    this.punch.hit = true;
    const owner = this.physics.handleOwner.get(hit.handle);
    const dir = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const body = hit.parent();
    if (owner && owner instanceof Player) {
      if (owner.state !== 'seated') {
        for (const b of owner.bodies) b.applyImpulse({ x: dir.x * 4 * b.mass(), y: 2.2 * b.mass(), z: dir.z * 4 * b.mass() }, true);
        owner.knockOut(1.4);
        owner.impactGrace = 0.2;
      }
    } else if (body && body.isDynamic()) {
      const m = Math.min(body.mass(), 80);
      body.applyImpulseAtPoint({ x: dir.x * m * 4, y: m * 1.5, z: dir.z * m * 4 }, hp, true);
    }
    this.game.audio?.play('punch', hp);
  }

  respawn() {
    this.game.forms?.revert(this, { quiet: true }); // forms.js: respawn as your normal self
    if (this.seat) this.leaveSeat();
    this.releaseAll();
    this.mantle = null;
    this.grip = 1;
    this.emote = null; this.emoteBody = null; // stop any dance / sit
    this.wake(false);
    this.recover = 1;
    const sp = this.game.spawnPoint(this.index);
    this.teleport(sp.x, sp.y, sp.z, sp.yaw);
  }

  sync() {
    for (const n in this.parts) { const p = this.parts[n]; this.physics.pose(p.rec, p.mesh); }
    // squash & stretch the torso about the shoulders so the neck stays covered
    const q = this.sq, m = this.sqBones.chestSq, hm = this.sqBones.hipsSq; // skin bones (bindSkin)
    m.scale.set(1 + q * 0.5, 1 - q, 1 + q * 0.5); m.position.y = 0.22 * S * q;
    hm.scale.set(1 + q * 0.3, 1 - q * 0.5, 1 + q * 0.3);
    this.form?.sync(); // forms.js: animal meshes follow the ragdoll
  }
  // Interpolated chest position (for cameras and tags).
  viewPos(out, part = 'chest') { return this.physics.ipos(this.parts[part].rec, out); }

  destroy() {
    this.game.forms?.revert(this, { quiet: true }); // forms.js
    if (this.seat) this.leaveSeat();
    this.releaseAll();
    for (const n in this.parts) {
      const p = this.parts[n];
      for (const c of p.cols) this.physics.handleOwner.delete(c.handle);
      this.physics.untrack(p.rec);
      this.world.removeRigidBody(p.body);
    }
    this.game.scene.remove(this.group);
    this.skin.geometry.dispose(); this.skin.skeleton.dispose();
  }
}
