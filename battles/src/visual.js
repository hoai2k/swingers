// Unit meshes: one THREE.Group per ragdoll part, with clothes, faces, hats and weapons.
// Every part's static meshes are baked into ONE vertex-coloured mesh (plus the face
// decal and any held item), so a unit costs ~14 draw calls. Baked vertices also carry
// a (specular, emissive) pair so metal shines and orbs/lenses glow.
import { THREE, clamp, lerp } from './util.js';
import { PART, NPARTS, makeSkeleton, forwardKinematics } from './body.js';
import { ITEMS, gripDir } from './items.js';
import { computePose, newPose } from './pose.js';

export const TEAM_COLORS = ['#3d72e3', '#e2403b'];
export const TEAM_DARK = ['#294e9e', '#9e2b28'];
export const TEAM_NAMES = ['Blue', 'Red'];
const TEAM_LIGHT = ['#8fb4ff', '#ff9a8a'];

// Visuals currently alive (FX reads their motion for footstep / landing dust).
export const LIVE_VIS = new Set();

// mat(color, {spec, emit, ...lambertOpts}): cached Lambert material. spec/emit are
// only used when the mesh is baked (0..1 specular strength, 0..1 self-illumination).
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    const { spec = 0.12, emit = 0, ...rest } = opts;
    m = new THREE.MeshLambertMaterial({ color, ...rest });
    m.userData.spec = spec;
    m.userData.emit = emit;
    matCache.set(key, m);
  }
  return m;
}
const metal = () => mat('#c3cad3', { spec: 1 });
const darkMetal = () => mat('#7d8691', { spec: 0.9 });
const gold = () => mat('#f0c03c', { spec: 1 });
const wood = () => mat('#9a6332', { spec: 0.08 });
const darkWood = () => mat('#61391b', { spec: 0.08 });
const leather = () => mat('#6b4426', { spec: 0.25 });
const black = () => mat('#1d1a1a', { spec: 0.3 });
const white = () => mat('#f6f3ea');
const glow = (c) => mat(c, { emit: 0.85, spec: 0.6 });
const fur = () => mat('#a8794a', { spec: 0 });

// ---------------------------------------------------------------- geometry
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); g.userData.shared = true; geoCache.set(key, g); }
  return g;
}
const f3 = (v) => v.toFixed(3);
const sphere = (r, w = 16, h = 12) => geo(`s${f3(r)}:${w}`, () => new THREE.SphereGeometry(r, w, h));
const capsule = (r, len) => geo('c' + f3(r) + ':' + f3(len), () => new THREE.CapsuleGeometry(r, len, 5, 12));
const cyl = (rt, rb, h, n = 12) => geo(`y${f3(rt)}:${f3(rb)}:${f3(h)}:${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const box = (x, y, z) => geo(`b${f3(x)}:${f3(y)}:${f3(z)}`, () => new THREE.BoxGeometry(x, y, z));
const cone = (r, h, n = 10) => geo(`k${f3(r)}:${f3(h)}:${n}`, () => new THREE.ConeGeometry(r, h, n));
const torus = (R, t, arc = Math.PI * 2, n = 18) => geo(`t${f3(R)}:${f3(t)}:${f3(arc)}:${n}`, () => new THREE.TorusGeometry(R, t, 6, n, arc));
const octa = (r) => geo('o' + f3(r), () => new THREE.OctahedronGeometry(r, 0));

// A 2D outline (x = width toward the item's "edge" +Z, y = along the item) extruded
// to thickness `t` along X.
function blade(key, pts, t, bevel = 0.35) {
  return geo('bl' + key, () => {
    const sh = new THREE.Shape();
    pts.forEach(([x, y, cx, cy], i) => {
      if (i === 0) sh.moveTo(x, y);
      else if (cx !== undefined) sh.quadraticCurveTo(cx, cy, x, y);
      else sh.lineTo(x, y);
    });
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: t * bevel, bevelSize: t * bevel, bevelSegments: 1, curveSegments: 8 });
    g.translate(0, 0, -t / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  });
}

// A tube along a curve that tapers from r0 to r1 (horns, antlers, feathers).
function horn(key, curve, r0, r1, n = 10) {
  return geo('hn' + key, () => {
    const g = new THREE.TubeGeometry(curve, n, 1, 7, false);
    const p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      curve.getPointAt(i / n, c);
      const k = lerp(r0, r1, i / n);
      for (let j = 0; j <= 7; j++) {
        const idx = i * 8 + j;
        v.fromBufferAttribute(p, idx).sub(c).multiplyScalar(k).add(c);
        p.setXYZ(idx, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

// Make an open surface two-sided by appending a flipped copy (keeps materials FrontSide).
function twoSided(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, n = g.attributes.normal, N = p.count;
  const pos = new Float32Array(N * 6), nor = new Float32Array(N * 6);
  pos.set(p.array); nor.set(n.array);
  for (let i = 0; i < N; i += 3) for (let k = 0; k < 3; k++) {
    const src = i + (2 - k), dst = N + i + k; // reversed winding
    for (let c = 0; c < 3; c++) {
      pos[dst * 3 + c] = p.array[src * 3 + c] - n.array[src * 3 + c] * 0.002;
      nor[dst * 3 + c] = -n.array[src * 3 + c];
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// ------------- the bean: chest silhouette as a lathe, wider at the belly
const DEPTH = 0.88; // front-back squash of the torso
function beanR(y, r, hh) {
  const rb = r * 1.14, rt = r * 0.96;
  if (y <= -hh) { const t = (y + hh) / (rb * 0.8); return t <= -1 ? 0 : rb * Math.sqrt(1 - t * t); }
  if (y >= hh) { const t = (y - hh) / (rt * 0.98); return t >= 1 ? 0 : rt * Math.sqrt(1 - t * t); }
  const t = (y + hh) / (2 * hh);
  return lerp(rb, rt, t * t);
}
const beanBottom = (r, hh) => -hh - r * 1.14 * 0.8;
const beanTop = (r, hh) => hh + r * 0.96 * 0.98;
function beanGeo(r, hh) {
  return geo('bean' + f3(r) + f3(hh), () => {
    const pts = [];
    const rb = r * 1.14, rt = r * 0.96;
    for (let i = 0; i <= 9; i++) { const a = -Math.PI / 2 + (i / 9) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * rb + 1e-4, -hh + Math.sin(a) * rb * 0.8)); }
    for (let i = 1; i <= 9; i++) { const a = (i / 9) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * rt + 1e-4, hh + Math.sin(a) * rt * 0.98)); }
    const g = new THREE.LatheGeometry(pts, 20);
    g.scale(1, 1, DEPTH);
    return g;
  });
}
// A clothing shell hugging the bean between y0..y1, `off` above the surface, over
// an arc of `w` radians centred on angle `c` (0 = front, PI = back).
function shell(r, hh, y0, y1, off, c = 0, w = Math.PI * 2, n = 8, extra = null) {
  return geo(`sh${f3(r)}${f3(hh)}${f3(y0)}${f3(y1)}${f3(off)}${f3(c)}${f3(w)}${extra ? extra.k : ''}`, () => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const y = lerp(y0, y1, i / n);
      let R = beanR(y, r, hh);
      if (extra) R = extra.f(y, R);
      pts.push(new THREE.Vector2(Math.max(1e-3, R + off), y));
    }
    const segs = Math.max(4, Math.round((w / (Math.PI * 2)) * 22));
    let g = new THREE.LatheGeometry(pts, segs, c - w / 2, w);
    g.scale(1, 1, DEPTH);
    if (w < Math.PI * 1.99) g = twoSided(g);
    return g;
  });
}
// Front-surface z of the bean at height y (for buttons, badges...).
const frontZ = (y, r, hh) => beanR(y, r, hh) * DEPTH;

function mesh(g, m, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  if (parent) parent.add(o);
  return o;
}

// ---------------------------------------------------------------- faces
// FACE_MATS[variant * 8 + kind]; kinds 0..5 = normal, angry, scared, dead, happy,
// hurt (unit.js EXPR), 6/7 = blinking normal/angry. Variants: 0 regular, 1 brute,
// 2 cute.
export const FACE_MATS = [];
const FACE_VARIANTS = [
  { ew: 14, eh: 17, pr: 7.5, brow: 6.5, gap: 28, browY: 26, nose: 0.15 },
  { ew: 11, eh: 11, pr: 6.5, brow: 10, gap: 27, browY: 17, nose: 0.2 },
  { ew: 16, eh: 20, pr: 9.5, brow: 5, gap: 29, browY: 30, nose: 0.11, shine: true },
];
const BRUTES = new Set(['clubber', 'protector', 'chieftain', 'berserker', 'giant', 'king', 'knight']);
const CUTE = new Set(['halfling', 'bard', 'healer', 'bomber', 'archer']);
const faceVariant = (id) => (BRUTES.has(id) ? 1 : CUTE.has(id) ? 2 : 0);

function drawFace(kind, V) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 320;
  const g = c.getContext('2d');
  g.scale(2, 2);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.translate(128, 80); g.scale(1.5, 1.3); g.translate(-128, -58);
  const INK = '#1e1512', MOUTH = '#4a1414', TONGUE = '#e0606a';
  const ey = 58, ex = [128 - V.gap, 128 + V.gap];
  const blink = kind >= 6;
  const base = blink ? kind - 6 : kind;
  g.strokeStyle = INK; g.fillStyle = INK;
  const ell = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); };
  // one open eye, optionally with an upper lid line (lid > 0 slants toward the nose)
  const eye = (x, side, o = {}) => {
    const w = V.ew * (o.big || 1), h = V.eh * (o.big || 1);
    g.save();
    ell(x, ey, w, h); g.clip();
    g.fillStyle = '#fbfbf7'; g.fillRect(x - w - 2, ey - h - 2, w * 2 + 4, h * 2 + 4);
    const pr = V.pr * (o.pupil || 1);
    g.fillStyle = INK; ell(x + (o.px || 0) * side + (o.dx || 0), ey + (o.py || 2), pr, pr * 1.08); g.fill();
    if (V.shine || o.shine) { g.fillStyle = '#fff'; ell(x + (o.px || 0) * side - pr * 0.35, ey + (o.py || 2) - pr * 0.4, pr * 0.32, pr * 0.32); g.fill(); }
    if (o.lid) { // eyelid: cut the top of the eye with a slanted skin-less dark band
      g.fillStyle = 'rgba(0,0,0,0)';
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      const inner = x - side * w, outer = x + side * w;
      g.moveTo(inner - side * 4, ey - h - 4); g.lineTo(outer + side * 4, ey - h - 4);
      g.lineTo(outer + side * 4, ey - h + h * 2 * o.lid * 0.55); g.lineTo(inner - side * 4, ey - h + h * 2 * o.lid);
      g.closePath(); g.fillStyle = '#000'; g.fill();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = INK; g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(inner, ey - h + h * 2 * o.lid); g.lineTo(outer, ey - h + h * 2 * o.lid * 0.55); g.stroke();
    }
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 2.6; ell(x, ey, w, h); g.stroke();
  };
  const closed = (x, side, curve = 1, slant = 0) => { // closed eye: a curved lash line
    g.lineWidth = 5; g.beginPath();
    g.moveTo(x - V.ew, ey + 2 + slant * side * 3); g.quadraticCurveTo(x, ey + 2 + 9 * curve, x + V.ew, ey + 2 - slant * side * 3); g.stroke();
  };
  // brows: angle > 0 = angry V, < 0 = worried; lift raises them
  const brows = (angle, lift = 0, thick = 1) => {
    g.lineWidth = V.brow * thick;
    for (const s of [-1, 1]) {
      const x = 128 + s * V.gap, y = ey - V.browY - lift;
      g.beginPath();
      g.moveTo(x - s * 15, y + angle * 9); g.quadraticCurveTo(x, y - 4 + angle * 2, x + s * 15, y - angle * 6);
      g.stroke();
    }
  };
  const mouthOpen = (w, h, y = 93, teeth = true, tongue = true, frown = 0) => {
    g.save();
    g.beginPath();
    g.moveTo(128 - w, y - frown); g.quadraticCurveTo(128, y - h * 0.7 + frown * 2, 128 + w, y - frown);
    g.quadraticCurveTo(128, y + h * 1.25, 128 - w, y - frown); g.closePath();
    g.fillStyle = MOUTH; g.fill(); g.clip();
    if (teeth) { g.fillStyle = '#fbfbf2'; g.fillRect(128 - w, y - h, w * 2, h * 0.55); }
    if (tongue) { g.fillStyle = TONGUE; ell(128, y + h * 0.95, w * 0.6, h * 0.55); g.fill(); }
    g.restore();
    g.lineWidth = 3; g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(128 - w, y - frown); g.quadraticCurveTo(128, y - h * 0.7 + frown * 2, 128 + w, y - frown);
    g.quadraticCurveTo(128, y + h * 1.25, 128 - w, y - frown); g.closePath(); g.stroke();
  };
  switch (base) {
    case 0: // normal: calm, slightly determined
      if (blink) for (const s of [-1, 1]) closed(128 + s * V.gap, s, 0.6); else { eye(ex[0], -1); eye(ex[1], 1); }
      brows(0.15, 0, 1);
      g.lineWidth = 4.5; g.beginPath(); g.moveTo(114, 92); g.quadraticCurveTo(128, 97, 142, 91); g.stroke();
      break;
    case 1: // angry: lidded eyes, V brows, yelling mouth
      if (blink) for (const s of [-1, 1]) closed(128 + s * V.gap, s, 0.2, 1);
      else { eye(ex[0], -1, { lid: 0.42, px: -2, py: 3 }); eye(ex[1], 1, { lid: 0.42, px: -2, py: 3 }); }
      brows(1.2, -5, 1.25);
      mouthOpen(20, 15, 94, true, true, 2);
      break;
    case 2: // scared: huge eyes, tiny pupils, worried brows, wobbly O mouth, sweat
      eye(ex[0], -1, { big: 1.22, pupil: 0.55, py: 0 }); eye(ex[1], 1, { big: 1.22, pupil: 0.55, py: 0 });
      brows(-1.1, 8, 0.9);
      mouthOpen(10, 13, 96, false, true);
      g.fillStyle = '#9fd8ff'; g.strokeStyle = '#3a7fb8'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(186, 22); g.quadraticCurveTo(195, 40, 186, 44); g.quadraticCurveTo(177, 40, 186, 22); g.fill(); g.stroke();
      break;
    case 3: // dead: X eyes, tongue out
      g.lineWidth = 7;
      for (const x of ex) { g.beginPath(); g.moveTo(x - 11, ey - 11); g.lineTo(x + 11, ey + 11); g.moveTo(x + 11, ey - 11); g.lineTo(x - 11, ey + 11); g.stroke(); }
      g.lineWidth = 5; g.beginPath(); g.moveTo(110, 92); g.quadraticCurveTo(128, 88, 146, 93); g.stroke();
      g.fillStyle = TONGUE; g.beginPath(); g.moveTo(128, 91); g.lineTo(146, 92); g.quadraticCurveTo(146, 110, 137, 110); g.quadraticCurveTo(128, 110, 128, 91); g.fill();
      g.lineWidth = 2.5; g.stroke();
      break;
    case 4: // happy: ^^ eyes, big open grin, blush
      g.lineWidth = 6.5;
      for (const x of ex) { g.beginPath(); g.arc(x, ey + 7, 11, Math.PI * 1.12, Math.PI * 1.88); g.stroke(); }
      brows(-0.3, 6, 0.9);
      g.fillStyle = 'rgba(255,110,120,0.45)';
      for (const x of ex) { ell(x + (x < 128 ? -8 : 8), ey + 21, 11, 6); g.fill(); }
      g.save(); g.beginPath(); g.moveTo(106, 86); g.quadraticCurveTo(128, 90, 150, 86); g.quadraticCurveTo(146, 116, 128, 116); g.quadraticCurveTo(110, 116, 106, 86); g.closePath();
      g.fillStyle = MOUTH; g.fill(); g.clip(); g.fillStyle = '#fbfbf2'; g.fillRect(100, 80, 60, 10); g.fillStyle = TONGUE; ell(128, 114, 14, 9); g.fill(); g.restore();
      g.lineWidth = 3; g.beginPath(); g.moveTo(106, 86); g.quadraticCurveTo(128, 90, 150, 86); g.quadraticCurveTo(146, 116, 128, 116); g.quadraticCurveTo(110, 116, 106, 86); g.closePath(); g.stroke();
      break;
    case 5: // hurt: squeezed >< eyes, gritted teeth
      g.lineWidth = 6.5;
      g.beginPath(); g.moveTo(ex[0] - 12, ey - 9); g.lineTo(ex[0] + 9, ey); g.lineTo(ex[0] - 12, ey + 9);
      g.moveTo(ex[1] + 12, ey - 9); g.lineTo(ex[1] - 9, ey); g.lineTo(ex[1] + 12, ey + 9); g.stroke();
      brows(-0.8, 3, 1);
      g.fillStyle = '#fbfbf2'; g.lineWidth = 3;
      g.beginPath(); g.roundRect(108, 86, 40, 15, 6); g.fill(); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.moveTo(108, 93.5); g.lineTo(148, 93.5);
      for (const x of [118, 128, 138]) { g.moveTo(x, 86); g.lineTo(x, 101); }
      g.stroke();
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function initFaces() {
  if (FACE_MATS.length) return;
  for (const V of FACE_VARIANTS) {
    for (let k = 0; k < 8; k++) {
      FACE_MATS.push(new THREE.MeshLambertMaterial({ map: drawFace(k, V), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, emissive: '#2a2a2a' }));
    }
  }
}
function faceGeo(r) {
  return geo('face' + f3(r), () => {
    const len = Math.PI * 0.95;
    return new THREE.SphereGeometry(r * 1.012, 20, 12, Math.PI / 2 - len / 2, len, Math.PI * 0.14, Math.PI * 0.62);
  });
}

// ---------------------------------------------------------------- items
export function buildItem(name, s, team) {
  const g = new THREE.Group();
  const it = ITEMS[name];
  if (!it || name === 'none') return g;
  const L = it.len * s;
  const back = (it.back || 0) * L;
  const c = it.center ? -L / 2 : -back; // y where the item starts
  const tc = mat(TEAM_COLORS[team]);
  const K = name + f3(s);
  switch (name) {
    case 'club': { // knobbly tapered club with a leather grip
      mesh(cyl(0.085 * s, 0.032 * s, L, 8), wood(), 0, L / 2, 0, g);
      mesh(sphere(0.105 * s, 10, 8), wood(), 0, L * 0.9, 0, g).scale.set(1, 1.25, 1);
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4, y = L * (0.62 + (i % 3) * 0.12);
        mesh(sphere(0.035 * s, 6, 5), darkWood(), Math.cos(a) * 0.08 * s, y, Math.sin(a) * 0.08 * s, g);
      }
      mesh(cyl(0.045 * s, 0.045 * s, L * 0.22, 8), leather(), 0, L * 0.06, 0, g);
      break;
    }
    case 'bone': {
      const b = mat('#efe6cf');
      mesh(cyl(0.032 * s, 0.038 * s, L, 8), b, 0, L / 2, 0, g);
      for (const y of [0.02, L]) for (const x of [-0.035, 0.035]) mesh(sphere(0.06 * s, 8, 6), b, x * s, y, 0, g);
      break;
    }
    case 'big_axe': case 'axe': {
      const big = name === 'big_axe';
      mesh(cyl(0.032 * s, 0.038 * s, L, 8), darkWood(), 0, L / 2, 0, g);
      mesh(cyl(0.042 * s, 0.042 * s, L * 0.18, 8), leather(), 0, L * 0.1, 0, g);
      const w = (big ? 0.42 : 0.26) * s, h = (big ? 0.62 : 0.36) * s;
      const shape = [[0, -0.16 * h], [0.86 * w, -0.5 * h, 0.4 * w, -0.14 * h], [0.86 * w, 0.5 * h, 1.14 * w, 0], [0, 0.16 * h, 0.4 * w, 0.14 * h]];
      const bl = blade(K, shape, 0.035 * s);
      mesh(bl, big ? mat('#a9b0b6', { spec: 0.8 }) : metal(), 0, L - h * 0.42, 0.02 * s, g);
      if (big) mesh(bl, mat('#a9b0b6', { spec: 0.8 }), 0, L - h * 0.42, -0.02 * s, g).rotation.y = Math.PI;
      else mesh(cone(0.04 * s, 0.12 * s, 6), metal(), 0, L - h * 0.42, -0.07 * s, g).rotation.x = -Math.PI / 2;
      mesh(box(0.07 * s, 0.14 * s, 0.09 * s), darkMetal(), 0, L - h * 0.42, 0, g);
      mesh(sphere(0.04 * s, 8, 6), darkMetal(), 0, L + 0.01 * s, 0, g);
      if (big) for (const y of [L * 0.55, L * 0.5]) mesh(cyl(0.04 * s, 0.04 * s, 0.03 * s, 8), tc, 0, y, 0, g);
      break;
    }
    case 'pitchfork': case 'pitchfork_small': {
      const k = L > 1 ? 1 : 0.6;
      mesh(cyl(0.028 * s, 0.03 * s, L, 7), wood(), 0, c + L / 2, 0, g);
      const top = c + L;
      mesh(cyl(0.04 * s, 0.03 * s, 0.1 * s * k, 7), darkMetal(), 0, top - 0.02 * s, 0, g);
      const bar = mesh(torus(0.15 * s * k, 0.018 * s, Math.PI, 10), metal(), 0, top + 0.03 * s, 0, g);
      bar.rotation.z = Math.PI;
      for (const x of [-0.15, 0, 0.15]) {
        const tine = mesh(cyl(0.014 * s, 0.006 * s, 0.38 * s * k, 5), metal(), x * s * k, top + 0.03 * s + 0.19 * s * k, x === 0 ? 0 : 0, g);
        tine.rotation.z = -x * 0.25;
      }
      break;
    }
    case 'sword': case 'greatsword': case 'kingsword': {
      const bw = (name === 'sword' ? 0.085 : name === 'greatsword' ? 0.12 : 0.18) * s;
      const y0 = L * 0.2, y1 = L, tip = bw * 1.4;
      const shape = [[-bw / 2, y0], [bw / 2, y0], [bw / 2, y1 - tip], [0, y1], [-bw / 2, y1 - tip]];
      const bm = name === 'kingsword' ? mat('#dfe6ee', { spec: 1 }) : metal();
      mesh(blade(K, shape, 0.026 * s, 0.4), bm, 0, 0, 0, g);
      mesh(box(0.03 * s, L * 0.6, bw * 0.25), mat('#9aa3ad', { spec: 0.8 }), 0, L * 0.55, 0, g); // fuller
      const gm = name === 'kingsword' ? gold() : name === 'greatsword' ? darkMetal() : mat('#8a6a3a', { spec: 0.4 });
      const guard = mesh(capsule(0.03 * s, bw * 2.2), gm, 0, L * 0.2, 0, g);
      guard.rotation.x = Math.PI / 2;
      mesh(cyl(0.032 * s, 0.032 * s, L * 0.19, 8), name === 'kingsword' ? mat('#6a1f8a') : leather(), 0, L * 0.1, 0, g);
      mesh(sphere(0.05 * s * (name === 'sword' ? 1 : 1.3), 10, 8), gm, 0, -0.01 * s, 0, g);
      if (name === 'kingsword') { mesh(octa(0.05 * s), glow('#ff3050'), 0.02 * s, L * 0.2, 0, g); mesh(octa(0.05 * s), glow('#ff3050'), -0.02 * s, L * 0.2, 0, g); }
      if (name === 'greatsword') mesh(sphere(0.035 * s, 8, 6), tc, 0, L * 0.2, 0.0, g).scale.set(1.6, 1.6, 0.5);
      break;
    }
    case 'lute': {
      const body = mesh(sphere(0.2 * s, 16, 12), mat('#c08040', { spec: 0.4 }), 0, L * 0.25, 0, g);
      body.scale.set(1, 1.3, 0.48);
      for (const z of [1, -1]) {
        const top = mesh(cyl(0.17 * s, 0.17 * s, 0.01 * s, 14), mat('#e8c58a'), 0, L * 0.25, z * 0.088 * s, g);
        top.rotation.x = Math.PI / 2; top.scale.set(1, 1, 1.28);
        const hole = mesh(cyl(0.045 * s, 0.045 * s, 0.012 * s, 10), mat('#3a2410'), 0, L * 0.3, z * 0.092 * s, g);
        hole.rotation.x = Math.PI / 2;
      }
      mesh(box(0.06 * s, L * 0.52, 0.035 * s), darkWood(), 0, L * 0.68, 0, g);
      const head = mesh(box(0.07 * s, 0.16 * s, 0.04 * s), darkWood(), 0, L * 0.97, -0.04 * s, g);
      head.rotation.x = -0.6;
      for (const sd of [-1, 1]) for (const k of [0, 1]) mesh(sphere(0.014 * s, 5, 4), white(), sd * 0.045 * s, L * (0.93 + k * 0.05), -0.04 * s - k * 0.03 * s, g);
      mesh(box(0.04 * s, L * 0.75, 0.004 * s), mat('#eeeeee'), 0, L * 0.55, 0.1 * s, g).castShadow = false;
      break;
    }
    case 'bow': {
      const R = L * 0.5, half = Math.PI * 0.36;
      const tg = geo('bow' + f3(s), () => {
        const t = new THREE.TorusGeometry(R, 0.026 * s, 6, 22, half * 2);
        t.rotateZ(-half); t.rotateY(-Math.PI / 2); t.translate(0, 0, -R);
        return t;
      });
      mesh(tg, mat('#8a5226', { spec: 0.3 }), 0, 0, 0, g);
      mesh(cyl(0.036 * s, 0.036 * s, 0.16 * s, 8), leather(), 0, 0, 0, g);
      for (const sd of [-1, 1]) mesh(sphere(0.03 * s, 6, 5), tc, 0, sd * R * Math.sin(half), -R * (1 - Math.cos(half)), g);
      const str = mesh(cyl(0.005 * s, 0.005 * s, 2 * R * Math.sin(half), 3), mat('#f4f4f4'), 0, 0, -R * (1 - Math.cos(half)), g);
      str.castShadow = false;
      break;
    }
    case 'staff': { // gnarled staff with prongs holding a glowing orb
      mesh(cyl(0.028 * s, 0.038 * s, L, 7), darkWood(), 0, 0, 0, g);
      for (const y of [-0.2, 0.15]) mesh(sphere(0.042 * s, 7, 5), darkWood(), 0, y * L, 0, g);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const pr = mesh(cone(0.02 * s, 0.22 * s, 5), darkWood(), Math.cos(a) * 0.06 * s, L / 2 + 0.08 * s, Math.sin(a) * 0.06 * s, g);
        pr.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      }
      const orb = mesh(sphere(0.085 * s, 12, 10), glow('#ffb347'), 0, L / 2 + 0.12 * s, 0, g);
      orb.castShadow = false;
      mesh(sphere(0.045 * s, 8, 6), glow('#fff2b0'), 0, L / 2 + 0.12 * s, 0.02 * s, g).castShadow = false;
      break;
    }
    case 'spear_hand': {
      mesh(cyl(0.024 * s, 0.024 * s, L, 7), wood(), 0, c + L / 2, 0, g);
      const leaf = [[0, 0], [0.06 * s, 0.09 * s, 0.07 * s, 0.03 * s], [0, 0.3 * s, 0.05 * s, 0.2 * s], [-0.06 * s, 0.09 * s, -0.05 * s, 0.2 * s], [0, 0, -0.07 * s, 0.03 * s]];
      mesh(blade('spear' + f3(s), leaf, 0.022 * s), mat('#b8b2a6', { spec: 0.6 }), 0, c + L - 0.03 * s, 0, g);
      mesh(cyl(0.032 * s, 0.032 * s, 0.08 * s, 7), leather(), 0, c + L - 0.04 * s, 0, g);
      for (let i = 0; i < 3; i++) {
        const f = mesh(sphere(0.04 * s, 6, 5), i === 1 ? mat('#f4f0e0') : tc, 0, c + L - 0.13 * s, 0, g);
        f.scale.set(0.4, 2.2, 0.9); f.rotation.x = (i - 1) * 0.5; f.position.z = (i - 1) * 0.04 * s;
      }
      break;
    }
    case 'hay_hand': {
      mesh(box(0.5 * s, 0.4 * s, 0.4 * s), mat('#e6c65c', { spec: 0 }), 0, 0, 0.25 * s, g);
      for (const x of [-0.13, 0.13]) mesh(box(0.035 * s, 0.415 * s, 0.415 * s), mat('#9a6a28'), x * s, 0, 0.25 * s, g);
      for (let i = 0; i < 6; i++) mesh(box(0.012 * s, 0.012 * s, 0.14 * s), mat('#f2dc8a'), (i / 5 - 0.5) * 0.4 * s, 0.205 * s, 0.25 * s + (i % 2 - 0.5) * 0.1 * s, g).rotation.y = i;
      break;
    }
    case 'potion_hand': {
      mesh(sphere(0.1 * s, 12, 10), mat('#d8f2ff', { spec: 1 }), 0, 0, 0.08 * s, g);
      mesh(sphere(0.085 * s, 12, 10), glow('#7be05a'), 0, -0.01 * s, 0.08 * s, g);
      mesh(cyl(0.032 * s, 0.035 * s, 0.09 * s, 8), mat('#d8f2ff', { spec: 1 }), 0, 0.12 * s, 0.08 * s, g);
      mesh(cyl(0.036 * s, 0.03 * s, 0.05 * s, 8), mat('#a0703a'), 0, 0.18 * s, 0.08 * s, g);
      break;
    }
    case 'bomb_hand': {
      mesh(sphere(0.13 * s, 14, 10), black(), 0, 0, 0.1 * s, g);
      mesh(cyl(0.045 * s, 0.05 * s, 0.05 * s, 8), darkMetal(), 0, 0.13 * s, 0.1 * s, g);
      const fuse = mesh(cyl(0.012 * s, 0.012 * s, 0.09 * s, 4), mat('#c8a060'), 0.02 * s, 0.19 * s, 0.1 * s, g);
      fuse.rotation.z = -0.4;
      mesh(octa(0.03 * s), glow('#ffd040'), 0.04 * s, 0.24 * s, 0.1 * s, g).castShadow = false;
      mesh(sphere(0.03 * s, 6, 5), mat('#ffffff', { spec: 1 }), -0.05 * s, 0.06 * s, 0.19 * s, g);
      break;
    }
  }
  return g;
}

function buildShield(kind, s, team) {
  const g = new THREE.Group();
  const tc = mat(TEAM_COLORS[team]);
  if (kind === 'wood') { // planked tribal shield with a painted team emblem
    for (let i = -2; i <= 2; i++) {
      const p = mesh(capsule(0.06 * s, 0.72 * s), i % 2 ? darkWood() : wood(), 0, (i % 2) * 0.02 * s, i * 0.12 * s, g);
      p.scale.set(0.55, 1, 1);
    }
    for (const y of [-0.24, 0.24]) mesh(box(0.05 * s, 0.05 * s, 0.66 * s), leather(), 0.045 * s, y * s, 0, g);
    const em = mesh(cyl(0.17 * s, 0.17 * s, 0.02 * s, 14), tc, 0.04 * s, 0.02 * s, 0, g);
    em.rotation.z = Math.PI / 2;
    const dot = mesh(cyl(0.07 * s, 0.07 * s, 0.024 * s, 10), mat('#f4ead2'), 0.045 * s, 0.02 * s, 0, g);
    dot.rotation.z = Math.PI / 2;
  } else {
    const d = mesh(cyl(0.34 * s, 0.34 * s, 0.05 * s, 20), tc, 0, 0, 0, g);
    d.rotation.z = Math.PI / 2;
    const rim = mesh(torus(0.34 * s, 0.03 * s, Math.PI * 2, 22), metal(), 0, 0, 0, g);
    rim.rotation.y = Math.PI / 2;
    const band = mesh(box(0.056 * s, 0.62 * s, 0.09 * s), mat('#f4f0e2'), 0.003 * s, 0, 0, g);
    mesh(box(0.056 * s, 0.09 * s, 0.62 * s), mat('#f4f0e2'), 0.003 * s, 0, 0, g);
    band.castShadow = true;
    mesh(sphere(0.08 * s, 12, 8), metal(), 0.03 * s, 0, 0, g).scale.set(0.7, 1, 1);
  }
  return g;
}

// ---------------------------------------------------------------- hats & extras
const _hornCache = new Map();
function curve3(key, pts) {
  let c = _hornCache.get(key);
  if (!c) { c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))); _hornCache.set(key, c); }
  return c;
}
// a hood: back-and-top shell of the head, open at the face
function hoodGeo(r, k) {
  return geo('hood' + f3(r) + k, () => twoSided(new THREE.SphereGeometry(r * k, 18, 12, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, 0, Math.PI * 0.78)));
}
function feather(r, len, col, x, y, z, rx = 0, rz = 0, g) {
  const f = mesh(sphere(r * 0.2, 8, 6), col, x, y, z, g);
  f.scale.set(0.35, len / (r * 0.4), 1);
  f.rotation.set(rx, 0, rz);
  return f;
}
// a band hugging the head sphere centred at height y (in head radii), h tall
function headBand(r, y, h, m, g, out = 0.04) {
  const R = (yy) => r * (Math.sqrt(Math.max(0.02, 1 - yy * yy)) + out);
  return mesh(cyl(R(y + h / 2), R(y - h / 2), r * h, 20), m, 0, r * y, 0, g);
}
function buildHat(kind, r, team, id) {
  const g = new THREE.Group();
  const tc = mat(TEAM_COLORS[team]), td = mat(TEAM_DARK[team]);
  // The face's brows sit at ~0.55r and the eyes at ~0.15r, so hats keep their front
  // rim at or above ~0.62r unless they are meant to hide the brow.
  switch (kind) {
    case 'headband':
      headBand(r, 0.72, 0.22, tc, g);
      for (const sd of [-1, 1]) {
        const t = mesh(box(r * 0.12, r * 0.5, r * 0.05), tc, sd * r * 0.12, r * 0.5, -r * 0.78, g);
        t.rotation.set(0.35, 0, sd * 0.35);
      }
      mesh(sphere(r * 0.13, 8, 6), tc, 0, r * 0.72, -r * 0.72, g);
      break;
    case 'feather':
      headBand(r, 0.72, 0.2, leather(), g);
      for (const x of [-0.25, 0.25]) mesh(sphere(r * 0.08, 6, 5), tc, x * r, r * 0.72, r * 0.7, g);
      feather(r, r * 1.1, tc, 0, r * 1.25, -r * 0.7, -0.45, 0, g);
      feather(r, r * 0.9, mat('#f4f0e0'), r * 0.25, r * 1.15, -r * 0.68, -0.5, -0.4, g);
      feather(r, r * 0.8, mat('#2a2a2a'), -r * 0.25, r * 1.1, -r * 0.68, -0.5, 0.4, g);
      break;
    case 'skullcap': { // an animal skull worn as a helmet
      const bone = mat('#eee5cc');
      const sk = mesh(sphere(r * 1.0, 16, 12), bone, 0, r * 0.8, -0.04 * r, g); sk.scale.set(1.08, 0.6, 1.1);
      const snout = mesh(sphere(r * 0.42, 10, 8), bone, 0, r * 0.88, r * 0.85, g); snout.scale.set(0.8, 0.5, 1.1);
      for (const x of [-0.36, 0.36]) mesh(sphere(r * 0.15, 8, 6), black(), x * r, r * 0.86, r * 0.82, g).scale.set(1, 0.8, 0.5);
      for (let i = -2; i <= 2; i++) mesh(cone(r * 0.05, r * 0.16, 4), bone, i * r * 0.11, r * 0.66, r * 1.08, g).rotation.x = Math.PI;
      for (const sd of [-1, 1]) {
        const hc = new THREE.CatmullRomCurve3([[sd * 0.8, 0.8, 0.0], [sd * 1.25, 1.0, -0.1], [sd * 1.35, 1.45, -0.25]].map((q) => new THREE.Vector3(...q).multiplyScalar(r)));
        mesh(horn('skh' + sd + f3(r), hc, r * 0.16, r * 0.03), bone, 0, 0, 0, g);
      }
      mesh(box(r * 0.25, r * 0.06, r * 1.2), tc, 0, r * 1.39, -r * 0.1, g);
      break;
    }
    case 'antlers': {
      headBand(r, 0.7, 0.26, tc, g);
      for (let i = -3; i <= 3; i++) mesh(sphere(r * 0.07, 6, 5), i % 2 ? mat('#f4ead2') : gold(), Math.sin(i * 0.4) * r * 0.76, r * 0.7, Math.cos(i * 0.4) * r * 0.76, g);
      const ant = mat('#e9dcc0', { spec: 0.2 });
      for (const sd of [-1, 1]) {
        const main = new THREE.CatmullRomCurve3([[sd * 0.55, 0.8, 0], [sd * 1.05, 1.2, -0.1], [sd * 1.2, 1.8, -0.2], [sd * 1.0, 2.35, -0.1]].map((q) => new THREE.Vector3(...q).multiplyScalar(r)));
        mesh(horn('ant' + sd + f3(r), main, r * 0.11, r * 0.05), ant, 0, 0, 0, g);
        for (const [y, len] of [[1.25, 0.6], [1.7, 0.55], [2.05, 0.4]]) {
          const tine = mesh(cone(r * 0.06, r * len, 5), ant, sd * r * (1.15 + len * 0.25), r * (y + len * 0.4), r * 0.0, g);
          tine.rotation.z = -sd * 0.7; tine.rotation.x = 0.3;
        }
      }
      feather(r, r * 1.0, tc, -r * 0.45, r * 1.15, -r * 0.7, -0.6, 0.3, g);
      feather(r, r * 1.0, mat('#f4f0e0'), r * 0.45, r * 1.15, -r * 0.7, -0.6, -0.3, g);
      break;
    }
    case 'curls': {
      const hair = mat('#8a5a2c', { spec: 0.15 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        if (Math.sin(a) > 0.55) continue; // keep the face clear
        mesh(sphere(r * 0.33, 10, 8), hair, Math.cos(a) * r * 0.82, r * 0.42 + Math.sin(i * 2.3) * r * 0.08, Math.sin(a) * r * 0.82 - r * 0.05, g);
      }
      mesh(sphere(r * 0.8, 12, 10), hair, 0, r * 0.5, -r * 0.1, g).scale.set(1.15, 0.8, 1.1);
      for (const x of [-0.45, 0, 0.45]) mesh(sphere(r * 0.26, 8, 6), hair, x * r, r * 0.9, r * 0.5, g);
      break;
    }
    case 'straw': {
      const straw = mat('#efd27c', { spec: 0 });
      const brim = mesh(cyl(r * 1.85, r * 1.95, r * 0.07, 22), straw, 0, r * 0.66, -r * 0.05, g);
      brim.rotation.x = -0.12;
      mesh(cyl(r * 0.72, r * 0.82, r * 0.55, 16), straw, 0, r * 0.95, -r * 0.05, g);
      mesh(sphere(r * 0.72, 14, 6), straw, 0, r * 1.22, -r * 0.05, g).scale.set(1, 0.25, 1);
      mesh(cyl(r * 0.84, r * 0.84, r * 0.14, 16), tc, 0, r * 0.76, -r * 0.05, g);
      for (let i = 0; i < 7; i++) { const a = i * 0.9; const st = mesh(box(r * 0.03, r * 0.03, r * 0.35), mat('#d9b85a'), Math.cos(a) * r * 1.9, r * 0.62, Math.sin(a) * r * 1.9 - r * 0.05, g); st.rotation.y = -a; }
      break;
    }
    case 'cap': {
      const dome = geo('capdome' + f3(r), () => new THREE.SphereGeometry(r * 1.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
      mesh(dome, tc, 0, r * 0.52, -r * 0.04, g).scale.set(1, 0.72, 1.02);
      const bill = mesh(cyl(r * 0.6, r * 0.6, r * 0.06, 14), td, 0, r * 0.6, r * 0.82, g);
      bill.scale.set(1.15, 1, 0.75); bill.rotation.x = 0.18;
      mesh(sphere(r * 0.1, 6, 5), td, 0, r * 1.24, -r * 0.04, g);
      mesh(box(r * 0.45, r * 0.25, r * 0.04), mat('#ffffff'), 0, r * 0.88, r * 0.66, g).rotation.x = -0.75;
      break;
    }
    case 'hood': case 'hood_green': {
      const col = kind === 'hood_green' ? mat('#4f8a2e') : mat('#6a4590');
      mesh(hoodGeo(r, 1.12), col, 0, r * 0.06, -r * 0.08, g);
      const tip = mesh(horn(kind + f3(r), new THREE.CatmullRomCurve3([[0, 0.7, -0.6], [0, 0.6, -1.2], [0, 0.1, -1.55]].map((p) => new THREE.Vector3(...p).multiplyScalar(r))), r * 0.38, r * 0.06), col, 0, 0, 0, g);
      tip.castShadow = true;
      if (kind === 'hood_green') feather(r, r * 1.0, tc, r * 0.7, r * 0.9, -r * 0.3, -0.5, -0.6, g);
      else mesh(cyl(r * 1.1, r * 1.14, r * 0.16, 16), tc, 0, -r * 0.62, -r * 0.05, g); // scarf
      break;
    }
    case 'nun': {
      const veil = mat('#f7f7f2');
      mesh(hoodGeo(r, 1.1), veil, 0, r * 0.04, -r * 0.08, g);
      const back = mesh(cyl(r * 0.85, r * 1.15, r * 1.2, 14), veil, 0, -r * 0.55, -r * 0.45, g);
      back.rotation.x = 0.25;
      headBand(r, 0.74, 0.18, tc, g, 0.12);
      mesh(box(r * 0.3, r * 0.1, r * 0.05), mat('#e33a3a'), 0, r * 0.8, r * 0.75, g).rotation.x = -0.75;
      mesh(box(r * 0.1, r * 0.3, r * 0.05), mat('#e33a3a'), 0, r * 0.8, r * 0.75, g).rotation.x = -0.75;
      break;
    }
    case 'feathercap': {
      const c = mesh(sphere(r * 1.0, 16, 10), tc, -r * 0.1, r * 0.78, -r * 0.08, g); c.scale.set(1.12, 0.42, 1.08); c.rotation.z = 0.18;
      headBand(r, 0.68, 0.14, td, g);
      feather(r, r * 1.6, mat('#ffd34a'), r * 0.6, r * 1.35, -r * 0.45, -0.7, -0.55, g);
      feather(r, r * 1.0, mat('#ffffff'), r * 0.7, r * 1.2, -r * 0.3, -0.5, -0.9, g);
      break;
    }
    case 'cap_metal': { // kettle hat
      const dome = geo('kettle' + f3(r), () => new THREE.SphereGeometry(r * 1.04, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
      mesh(dome, metal(), 0, r * 0.5, 0, g).scale.set(1, 0.85, 1);
      mesh(cyl(r * 1.4, r * 1.48, r * 0.06, 20), metal(), 0, r * 0.5, 0, g);
      mesh(cyl(r * 0.08, r * 0.12, r * 0.25, 8), darkMetal(), 0, r * 1.38, 0, g);
      feather(r, r * 0.7, tc, 0, r * 1.6, -r * 0.1, -0.4, 0, g);
      break;
    }
    case 'helm_knight': { // great helm: rounded barrel, visor slit, breaths, team plume
      const prof = [[1.0, -0.95], [1.1, -0.85], [1.12, -0.2], [1.1, 0.5], [0.95, 0.9], [0.55, 1.12], [0, 1.15]].map(([x, y]) => new THREE.Vector2(x * r + 1e-4, y * r));
      const hg = geo('helm' + f3(r), () => new THREE.LatheGeometry(prof, 20));
      mesh(hg, metal(), 0, 0, 0, g);
      mesh(box(r * 1.3, r * 0.14, r * 0.3), black(), 0, r * 0.2, r * 1.02, g);
      mesh(box(r * 0.14, r * 1.3, r * 0.2), mat('#a7b0ba', { spec: 1 }), 0, -r * 0.12, r * 1.08, g);
      for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) mesh(sphere(r * 0.05, 5, 4), black(), sd * r * 0.4, -r * (0.25 + i * 0.18), r * 1.05, g);
      mesh(torus(r * 1.12, r * 0.06, Math.PI * 2, 22), gold(), 0, -r * 0.9, 0, g).rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const p = mesh(sphere(r * 0.24, 8, 6), i % 2 ? td : tc, 0, r * (1.25 + Math.sin(i / 4 * Math.PI) * 0.35), r * (0.4 - i * 0.28), g);
        p.scale.set(0.6, 1, 1);
      }
      g.userData.hidesFace = true;
      break;
    }
    case 'crown': {
      const fur = mesh(torus(r * 0.74, r * 0.15, Math.PI * 2, 20), white(), 0, r * 0.76, 0, g);
      fur.rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(sphere(r * 0.045, 4, 3), black(), Math.cos(a) * r * 0.88, r * 0.8, Math.sin(a) * r * 0.88, g); }
      mesh(sphere(r * 0.7, 14, 8), mat('#a01c3a'), 0, r * 1.0, 0, g).scale.set(1, 0.65, 1);
      mesh(cyl(r * 0.78, r * 0.74, r * 0.42, 16), gold(), 0, r * 1.02, 0, g);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.cos(a) * r * 0.74, z = Math.sin(a) * r * 0.74;
        mesh(cone(r * 0.15, r * 0.42, 4), gold(), x, r * 1.42, z, g);
        mesh(sphere(r * 0.07, 6, 5), gold(), x, r * 1.66, z, g);
        mesh(octa(r * 0.09), glow(i % 2 ? '#3a8cff' : '#ff3050'), Math.cos(a) * r * 0.8, r * 1.02, Math.sin(a) * r * 0.8, g);
      }
      mesh(sphere(r * 0.08, 6, 5), gold(), 0, r * 1.45, 0, g);
      break;
    }
    case 'viking': {
      const dome = geo('vkdome' + f3(r), () => new THREE.SphereGeometry(r * 1.06, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2));
      mesh(dome, metal(), 0, r * 0.38, 0, g).scale.set(1, 0.85, 1);
      headBand(r, 0.42, 0.16, mat('#9b6a3a', { spec: 0.5 }), g, 0.08);
      const ridge = mesh(torus(r * 1.0, r * 0.07, Math.PI, 14), mat('#9b6a3a', { spec: 0.5 }), 0, r * 0.38, 0, g);
      ridge.rotation.y = Math.PI / 2; ridge.scale.set(1, 0.9, 1);
      mesh(box(r * 0.16, r * 0.5, r * 0.08), metal(), 0, r * 0.18, r * 1.0, g);
      for (const sd of [-1, 1]) {
        const hc = new THREE.CatmullRomCurve3([[sd * 0.85, 0.6, 0], [sd * 1.35, 0.8, 0.05], [sd * 1.6, 1.3, 0.15], [sd * 1.45, 1.8, 0.3]].map((p) => new THREE.Vector3(...p).multiplyScalar(r)));
        mesh(horn('vk' + sd + f3(r), hc, r * 0.2, r * 0.02), mat('#f4ead0', { spec: 0.3 }), 0, 0, 0, g);
        mesh(cyl(r * 0.22, r * 0.22, r * 0.1, 10), tc, sd * r * 0.98, r * 0.62, 0, g).rotation.z = sd * 1.2;
      }
      break;
    }
    case 'goggles': { // goggles pushed up on the forehead, wild hair
      const hair = mat('#3a2a1e');
      for (let i = 0; i < 7; i++) { const sp = mesh(cone(r * 0.2, r * 0.55, 5), hair, (i - 3) * r * 0.22, r * 1.0 + Math.cos(i) * r * 0.06, -r * 0.15 - Math.abs(i - 3) * r * 0.05, g); sp.rotation.set(-0.5, 0, (i - 3) * -0.25); }
      mesh(sphere(r * 1.0, 14, 10), hair, 0, r * 0.4, -r * 0.18, g).scale.set(1.03, 0.75, 1);
      headBand(r, 0.68, 0.18, leather(), g, 0.04);
      for (const x of [-0.34, 0.34]) {
        const ring = mesh(cyl(r * 0.25, r * 0.25, r * 0.2, 12), mat('#b58a3a', { spec: 1 }), x * r, r * 0.74, r * 0.72, g);
        ring.rotation.x = Math.PI / 2 - 0.75;
        const l = mesh(cyl(r * 0.19, r * 0.19, r * 0.05, 12), glow('#7fd8ff'), x * r, r * 0.81, r * 0.8, g);
        l.rotation.x = Math.PI / 2 - 0.75;
      }
      break;
    }
    case 'wizard': {
      const col = mat(WIZARD[team]);
      mesh(cyl(r * 1.75, r * 1.8, r * 0.07, 22), col, 0, r * 0.64, 0, g);
      const hg = geo('wizhat' + f3(r), () => {
        const c = new THREE.ConeGeometry(r * 0.85, r * 2.3, 14, 8);
        const p = c.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const t = (p.getY(i) + r * 1.15) / (r * 2.3);
          if (t > 0.4) { const k = (t - 0.4) * (t - 0.4); p.setZ(i, p.getZ(i) - k * r * 2.4); p.setY(i, p.getY(i) - k * r * 0.9); }
        }
        c.computeVertexNormals();
        return c;
      });
      mesh(hg, col, 0, r * 1.77, 0, g);
      mesh(cyl(r * 0.86, r * 0.86, r * 0.16, 16), gold(), 0, r * 0.76, 0, g);
      for (const [x, y, z, k] of [[0.35, 1.35, 0.5, 1], [-0.3, 1.8, 0.35, 0.8], [0.1, 2.2, 0.05, 0.6], [-0.5, 1.05, 0.48, 0.7]]) mesh(octa(r * 0.13 * k), glow('#ffe14a'), x * r, y * r, z * r, g);
      mesh(sphere(r * 0.09, 6, 5), glow('#ffe14a'), 0, r * 2.07, -r * 1.25, g);
      break;
    }
  }
  return g;
}
const WIZARD = ['#2f4cb3', '#9c2440'];

// ---------------------------------------------------------------- whole unit
// Returns { parts: Group[], root: Group, face, items, skel }
export function buildUnitVisual(def, team, opts = {}) {
  initFaces();
  const skel = opts.skel || makeSkeleton(def.build);
  const s = skel.scale;
  const look = def.look;
  const id = def.id;
  const root = new THREE.Group();
  const parts = [];
  const tcHex = TEAM_COLORS[team];
  const tc = mat(tcHex), td = mat(TEAM_DARK[team]);
  const skin = mat(look.skin || '#f2c8a0', { spec: 0.18 });
  const top = look.top;
  const robe = top === 'robe' || top === 'robe_white' || top === 'robe_blue';
  const armor = top === 'armor';
  const chestMat = armor ? metal() : top === 'robe_white' ? white() : top === 'robe_blue' ? mat(WIZARD[team]) : tc;
  const legMat = armor ? mat(look.legs || '#8d939c', { spec: 0.9 }) : look.legs ? mat(look.legs) : td;
  const bootMat = look.bare ? mat('#7a5634', { spec: 0 }) : armor ? darkMetal() : mat('#3a2a1e', { spec: 0.3 });
  const sleeve = look.bare ? skin : chestMat;
  const paint = look.paint ? tc : null;
  for (let i = 0; i < NPARTS; i++) {
    const p = skel.parts[i];
    const g = new THREE.Group();
    g.name = p.name;
    parts.push(g);
    root.add(g);
    const len = p.hh * 2;
    switch (i) {
      case PART.pelvis: {
        const r = p.r;
        const m = mesh(sphere(r, 16, 12), robe ? (top === 'robe_white' ? white() : chestMat) : legMat, 0, 0, 0, g);
        m.scale.set(1.1, 0.95, 0.98);
        if (top === 'loincloth' || top === 'fur' || top === 'bare_belt') {
          const lc = mesh(cyl(r * 1.06, r * 1.25, r * 1.1, 14), td, 0, -r * 0.35, 0, g); // team-coloured loincloth/kilt
          lc.scale.set(1, 1, 0.95);
          if (top !== 'bare_belt') for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mesh(cone(r * 0.2, r * 0.35, 4), fur(), Math.sin(a) * r * 1.15, -r * 1.0, Math.cos(a) * r * 1.15, g).rotation.x = Math.PI; }
        }
        if (robe) { // long skirt down to the shins
          const skirt = top === 'robe_white' ? white() : top === 'robe_blue' ? mat(WIZARD[team]) : td;
          const prof = [[1.5, -2.45], [1.55, -2.3], [1.3, -1.2], [1.08, -0.2], [1.0, 0.3]].map(([x, y]) => new THREE.Vector2(x * r, y * r));
          mesh(geo('skirt' + f3(r), () => new THREE.LatheGeometry(prof, 18)), skirt, 0, 0, 0, g);
          mesh(torus(r * 1.5, r * 0.08, Math.PI * 2, 20), top === 'robe_blue' ? gold() : top === 'robe_white' ? tc : mat('#d9b85a'), 0, -r * 2.38, 0, g).rotation.x = Math.PI / 2;
        }
        break;
      }
      case PART.chest: {
        const r = p.r, hh = p.hh;
        const bare = look.bare || top === 'loincloth';
        mesh(beanGeo(r, hh), bare ? skin : chestMat, 0, 0, 0, g);
        const yb = beanBottom(r, hh), yt = beanTop(r, hh);
        const belt = (y0, y1, m, off = 0.012 * s) => mesh(shell(r, hh, y0, y1, off), m, 0, 0, 0, g);
        const panel = (y0, y1, m, c, w, off = 0.012 * s) => mesh(shell(r, hh, y0, y1, off, c, w), m, 0, 0, 0, g);
        const beltY = -hh - r * 0.38;
        const stripes = (m, ys) => { for (const y of ys) panel(y * r, y * r + r * 0.12, m, 0, 1.3, 0.006 * s); };
        if (top === 'fur') {
          belt(beltY - r * 0.14, beltY + r * 0.14, tc);
          if (paint) stripes(paint, [0.05, -0.25]);
          panel(hh * 0.2, yt - r * 0.15, fur(), -1.1, 2.4, 0.02 * s); // fur over one shoulder
          panel(-hh, hh * 0.6, fur(), Math.PI * 0.5, 1.4, 0.016 * s);
          if (id === 'chieftain') { // necklace of teeth + team cape
            for (let k = -3; k <= 3; k++) { const a = k * 0.28; mesh(cone(r * 0.06, r * 0.2, 4), white(), Math.sin(a) * r * 0.86, hh + r * 0.15 - Math.abs(k) * r * 0.03, Math.cos(a) * frontZ(hh + r * 0.15, r, hh) * 1.02, g).rotation.x = Math.PI; }
            panel(yb + r * 0.1, yt - r * 0.1, td, Math.PI, 2.6, 0.03 * s);
          }
        } else if (top === 'bare_belt') {
          belt(beltY - r * 0.16, beltY + r * 0.16, tc);
          stripes(tc, [0.25, 0.0]);
          for (const sd of [-1, 1]) { const st = mesh(box(r * 0.2, (yt - yb) * 1.05, r * 0.08), leather(), 0, -r * 0.05, frontZ(0, r, hh) + 0.01 * s, g); st.rotation.z = sd * 0.55; }
          mesh(sphere(r * 0.13, 8, 6), gold(), 0, -r * 0.05, frontZ(0, r, hh) + 0.03 * s, g);
        } else if (top === 'loincloth') {
          belt(beltY - r * 0.18, beltY + r * 0.18, tc);
          stripes(tc, [0.3, 0.05]);
          mesh(sphere(r * 0.12, 8, 6), mat('#f4ead2'), 0, beltY, frontZ(beltY, r, hh) + 0.03 * s, g);
        } else if (armor) {
          panel(yb + r * 0.05, yt - r * 0.2, tc, 0, 2.1, 0.022 * s); // tabard front
          panel(yb + r * 0.05, yt - r * 0.2, tc, Math.PI, 2.1, 0.022 * s); // and back
          belt(beltY - r * 0.1, beltY + r * 0.1, leather(), 0.03 * s);
          mesh(box(r * 0.5, r * 0.1, r * 0.06), gold(), 0, hh * 0.3, frontZ(hh * 0.3, r, hh) + 0.03 * s, g);
          mesh(box(r * 0.1, r * 0.6, r * 0.06), gold(), 0, hh * 0.15, frontZ(hh * 0.3, r, hh) + 0.03 * s, g);
          for (const sd of [-1, 1]) {
            const pd = mesh(sphere(r * 0.5, 12, 8, ), metal(), sd * r * 0.95, hh + r * 0.2, 0, g);
            pd.scale.set(1, 0.65, 1);
            mesh(torus(r * 0.42, r * 0.05, Math.PI * 2, 14), gold(), sd * r * 0.97, hh + r * 0.05, 0, g).rotation.x = Math.PI / 2;
          }
          mesh(torus(r * 0.6, r * 0.12, Math.PI * 2, 16), metal(), 0, yt - r * 0.2, 0, g).rotation.x = Math.PI / 2;
        } else if (top === 'royal') {
          belt(beltY - r * 0.12, beltY + r * 0.12, gold());
          panel(yb + r * 0.1, yt - r * 0.1, white(), 0, 0.5, 0.016 * s);
          for (const y of [-0.3, 0.05, 0.4]) mesh(sphere(r * 0.06, 6, 5), gold(), 0, y * r, frontZ(y * r, r, hh) + 0.03 * s, g);
          // ermine collar
          mesh(torus(r * 0.62, r * 0.2, Math.PI * 2, 18), white(), 0, yt - r * 0.3, 0, g).rotation.x = Math.PI / 2;
          for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; mesh(sphere(r * 0.045, 4, 3), black(), Math.sin(a) * r * 0.82, yt - r * 0.22, Math.cos(a) * r * 0.75, g); }
        } else if (top === 'overalls') {
          const den = mat('#8a6a45');
          panel(beltY - r * 0.2, hh + r * 0.15, den, 0, 1.3, 0.016 * s);
          belt(yb, beltY + r * 0.1, den, 0.016 * s);
          for (const sd of [-1, 1]) {
            const st = mesh(shell(r, hh, hh * 0.4, yt - r * 0.05, 0.018 * s, sd * 0.42, 0.22), den, 0, 0, 0, g);
            mesh(sphere(r * 0.07, 6, 5), gold(), sd * r * 0.35, hh + r * 0.1, frontZ(hh + r * 0.1, r, hh) + 0.02 * s, g);
            st.castShadow = true;
          }
          mesh(box(r * 0.35, r * 0.3, r * 0.04), mat('#6e5232'), 0, -r * 0.05, frontZ(-r * 0.05, r, hh) + 0.025 * s, g);
          if (id === 'hay_baler') mesh(cyl(r * 0.02, r * 0.02, r * 0.5, 4), mat('#f2dc8a'), r * 0.2, -r * 0.1, frontZ(0, r, hh) + 0.03 * s, g).rotation.z = 0.9;
        } else if (top === 'vest') {
          for (const sd of [-1, 1]) panel(yb + r * 0.25, yt - r * 0.08, mat('#f1e2bf'), sd * 0.95, 1.5, 0.016 * s);
          panel(yb + r * 0.25, yt - r * 0.08, mat('#f1e2bf'), Math.PI, 2.2, 0.016 * s);
          for (const y of [-0.2, 0.15]) mesh(sphere(r * 0.06, 6, 5), mat('#c8a050'), r * 0.32, y * r, frontZ(y * r, r, hh) * 0.95, g);
          belt(beltY - r * 0.1, beltY + r * 0.1, leather());
        } else if (top === 'apron') {
          const ap = mat('#6e4a2a', { spec: 0.25 });
          panel(yb - r * 0.25, hh + r * 0.35, ap, 0, 1.6, 0.018 * s);
          belt(beltY - r * 0.06, beltY + r * 0.06, ap, 0.018 * s);
          mesh(box(r * 0.5, r * 0.35, r * 0.05), mat('#5a3a1e'), 0, -r * 0.15, frontZ(-r * 0.15, r, hh) + 0.03 * s, g);
          // bandolier with little bombs
          const band = mesh(box(r * 0.16, (yt - yb) * 1.0, r * 0.05), leather(), 0, 0, frontZ(0, r, hh) + 0.035 * s, g); band.rotation.z = -0.6;
          for (const k of [-1, 0, 1]) mesh(sphere(r * 0.13, 8, 6), black(), Math.sin(-0.6) * -k * r * 0.4, k * r * 0.4 * Math.cos(0.6), frontZ(k * r * 0.3, r, hh) + 0.08 * s, g);
        } else if (top === 'tunic' || top === 'robe' || top === 'robe_blue') {
          belt(beltY - r * 0.1, beltY + r * 0.1, top === 'robe_blue' ? gold() : leather());
          if (top === 'tunic') {
            mesh(sphere(r * 0.06, 6, 5), gold(), 0, beltY, frontZ(beltY, r, hh) + 0.02 * s, g);
            panel(hh * 0.1, yt - r * 0.02, td, 0, Math.PI * 2, 0.008 * s); // collar/yoke
            if (id === 'bard') panel(yb + r * 0.1, yt - r * 0.1, mat('#ffd34a'), 0, 0.5, 0.012 * s);
            if (id === 'squire') { panel(-hh * 0.6, hh + r * 0.3, leather(), 0, 1.7, 0.018 * s); mesh(sphere(r * 0.12, 8, 6), tc, 0, hh * 0.4, frontZ(hh * 0.4, r, hh) + 0.03 * s, g); }
          } else {
            panel(yb + r * 0.05, yt - r * 0.1, top === 'robe_blue' ? gold() : td, 0, 0.42, 0.012 * s);
            if (top === 'robe_blue') for (const [x, y] of [[0.5, 0.2], [-0.45, -0.25], [0.3, -0.5]]) mesh(octa(r * 0.1), glow('#ffe14a'), x * r, y * r, frontZ(y * r, r, hh) * 0.92 + 0.02 * s, g);
            if (top === 'robe') for (const k of [-1, 1]) { mesh(sphere(r * 0.12, 8, 6), glow(k > 0 ? '#7be05a' : '#c86aff'), k * r * 0.55, beltY - r * 0.1, frontZ(beltY, r, hh) * 0.85 + 0.04 * s, g); }
          }
        } else if (top === 'robe_white') {
          panel(hh * 0.15, yt - r * 0.02, tc, 0, Math.PI * 2, 0.014 * s); // team capelet
          mesh(box(r * 0.22, r * 0.75, r * 0.05), mat('#e33a3a'), 0, -r * 0.2, frontZ(-r * 0.2, r, hh) + 0.02 * s, g);
          mesh(box(r * 0.6, r * 0.22, r * 0.05), mat('#e33a3a'), 0, -r * 0.1, frontZ(-r * 0.1, r, hh) + 0.02 * s, g);
          belt(beltY - r * 0.1, beltY + r * 0.1, tc);
        }
        if (look.cape) { // a long cape from the shoulders
          const cap = shell(r, hh, yb - r * 2.2, yt - r * 0.15, 0.03 * s, Math.PI, 2.9, 12, { k: 'cape', f: (y, R) => Math.max(R, r * 0.95 + (yb - y) * 0.15) });
          mesh(cap, td, 0, 0, 0, g);
        }
        if (look.quiver) {
          const q = mesh(cyl(r * 0.24, r * 0.2, len + r * 1.3, 10), leather(), r * 0.35, r * 0.15, -r * 1.05, g);
          q.rotation.z = 0.45;
          mesh(cyl(r * 0.26, r * 0.26, r * 0.1, 10), tc, r * 0.35, r * 0.15, -r * 1.05, g).rotation.z = 0.45;
          for (let k = 0; k < 4; k++) {
            const top = new THREE.Vector3(0, (len + r * 1.3) / 2 + r * 0.25, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.45);
            const f = mesh(box(r * 0.04, r * 0.35, r * 0.14), k % 2 ? white() : tc, r * 0.35 + top.x + (k - 1.5) * r * 0.06, r * 0.15 + top.y, -r * 1.05 + (k % 2 - 0.5) * r * 0.1, g);
            f.rotation.z = 0.45;
          }
          const strap = mesh(box(r * 0.12, (yt - yb) * 1.05, r * 0.05), leather(), 0, -r * 0.05, frontZ(0, r, hh) + 0.02 * s, g);
          strap.rotation.z = 0.55;
        }
        break;
      }
      case PART.head: {
        const r = p.r;
        mesh(sphere(r, 20, 14), skin, 0, 0, 0, g);
        const hat = buildHat(look.hat, r, team, id);
        g.add(hat);
        if (!hat.userData.hidesFace && !opts.ghost) {
          const f = new THREE.Mesh(faceGeo(r), FACE_MATS[faceVariant(id) * 8]);
          f.castShadow = false;
          g.add(f);
          g.userData.face = f;
        }
        const V = FACE_VARIANTS[faceVariant(id)];
        if (!hat.userData.hidesFace) mesh(sphere(r * V.nose, 10, 8), skin, 0, -r * 0.1, r * 0.98, g).scale.set(1, 0.9, 0.85);
        if (id === 'giant') { // heavy brow, big ears, a few hairs
          const b = mesh(capsule(r * 0.16, r * 0.9), skin, 0, r * 0.42, r * 0.8, g);
          b.rotation.z = Math.PI / 2;
          for (const sd of [-1, 1]) mesh(sphere(r * 0.22, 10, 8), skin, sd * r * 0.98, 0, 0, g).scale.set(0.5, 1, 0.8);
          for (let k = 0; k < 3; k++) mesh(cyl(r * 0.015, r * 0.015, r * 0.3, 3), mat('#3a3020'), (k - 1) * r * 0.15, r * 1.1, 0, g).rotation.z = (k - 1) * 0.4;
          mesh(sphere(r * 0.12, 6, 5), tc, r * 0.98, -r * 0.2, 0, g); // earring
        }
        if (look.beard) {
          const bm = mat(look.beard, { spec: 0.05 });
          // jaw beard: a shell around the lower head, below the mouth
          const jaw = geo('jaw' + f3(r), () => new THREE.SphereGeometry(r * 1.08, 18, 8, Math.PI / 2 - 1.5, 3.0, Math.PI * 0.66, Math.PI * 0.3));
          mesh(jaw, bm, 0, 0, 0, g);
          if (id === 'wizard' || id === 'potion_seller') {
            const long = id === 'wizard' ? 1.5 : 1.0;
            const b = mesh(cone(r * 0.55, r * long, 12), bm, 0, -r * (0.75 + long * 0.45), r * 0.55, g);
            b.rotation.x = Math.PI + 0.3; b.scale.set(1, 1, 0.6);
          } else if (id === 'berserker') {
            for (const sd of [-1, 1]) {
              mesh(horn('braid' + sd + f3(r), new THREE.CatmullRomCurve3([[sd * 0.3, -0.85, 0.75], [sd * 0.33, -1.2, 0.7], [sd * 0.25, -1.5, 0.6]].map((q) => new THREE.Vector3(...q).multiplyScalar(r))), r * 0.15, r * 0.09, 6), bm, 0, 0, 0, g);
              mesh(sphere(r * 0.08, 6, 5), tc, sd * r * 0.25, -r * 1.52, r * 0.6, g);
            }
          } else {
            mesh(sphere(r * 0.5, 12, 10), bm, 0, -r * 0.92, r * 0.48, g).scale.set(1.2, 0.8, 0.75);
          }
          for (const sd of [-1, 1]) { // moustache
            const m = mesh(capsule(r * 0.09, r * 0.32), bm, sd * r * 0.2, -r * 0.3, r * 0.93, g);
            m.rotation.z = sd * (Math.PI / 2 + 0.4);
          }
        } else if (id === 'farmer') {
          for (const sd of [-1, 1]) { const m = mesh(capsule(r * 0.08, r * 0.28), mat('#7a4b26'), sd * r * 0.18, -r * 0.28, r * 0.95, g); m.rotation.z = sd * (Math.PI / 2 + 0.3); }
        }
        if (paint && !look.beard && id !== 'giant') for (const sd of [-1, 1]) {
          const pm = mesh(box(r * 0.28, r * 0.07, r * 0.05), paint, sd * r * 0.55, -r * 0.1, r * 0.82, g);
          pm.rotation.y = sd * 0.6;
        }
        break;
      }
      case PART.thighL: case PART.thighR:
        mesh(capsule(p.r * 1.06, len), legMat, 0, 0, 0, g);
        if (armor) mesh(sphere(p.r * 1.3, 10, 8), metal(), 0, -len * 0.5, p.r * 0.4, g).scale.set(1, 0.8, 0.8);
        if (look.cape === undefined && top === 'tunic' && id === 'bard') mesh(capsule(p.r * 1.1, len * 0.4), mat('#ffd34a'), 0, len * 0.15, 0, g);
        break;
      case PART.shinL: case PART.shinR: {
        const r = p.r;
        mesh(capsule(r * 1.04, len), legMat, 0, 0, 0, g);
        mesh(cyl(r * 1.22, r * 1.15, len * 0.35, 12), bootMat, 0, -len * 0.38, 0, g);
        if (look.bare) for (const y of [-0.2, -0.05]) mesh(cyl(r * 1.25, r * 1.25, r * 0.2, 10), fur(), 0, y * len, 0, g);
        const boot = mesh(sphere(r * 1.3, 14, 10), bootMat, 0, -len * 0.5 - r * 0.25, r * 0.5, g);
        boot.scale.set(1.0, 0.72, 1.55);
        if (armor) mesh(cyl(r * 1.25, r * 1.2, len * 0.55, 12), metal(), 0, -len * 0.05, 0, g);
        break;
      }
      case PART.uarmL: case PART.uarmR: {
        const r = p.r;
        mesh(capsule(r * 1.05, len), armor ? metal() : sleeve, 0, 0, 0, g);
        if (id === 'bard') mesh(sphere(r * 1.7, 10, 8), mat('#ffd34a'), 0, len * 0.3, 0, g);
        if (id === 'giant' || id === 'berserker') mesh(cyl(r * 1.15, r * 1.15, r * 0.6, 10), tc, 0, len * 0.15, 0, g);
        break;
      }
      case PART.farmL: case PART.farmR: {
        const r = p.r;
        const bareFore = look.bare || top === 'vest' || top === 'overalls' || top === 'apron';
        mesh(capsule(r * 1.05, len), armor ? metal() : bareFore ? skin : sleeve, 0, 0, 0, g);
        if (robe && !look.bare) mesh(cyl(r * 1.5, r * 1.9, len * 0.45, 10), top === 'robe_white' ? white() : chestMat, 0, -len * 0.25, 0, g);
        else if (!bareFore && !armor) mesh(cyl(r * 1.25, r * 1.25, r * 0.6, 10), td, 0, -len * 0.35, 0, g);
        if (look.bare && id !== 'giant') mesh(cyl(r * 1.2, r * 1.2, r * 0.7, 10), leather(), 0, -len * 0.3, 0, g); // bracer
        if (id === 'giant') mesh(cyl(r * 1.2, r * 1.2, r * 0.9, 10), tc, 0, -len * 0.3, 0, g);
        const hand = mesh(sphere(r * 1.45, 12, 10), armor ? darkMetal() : skin, 0, -len * 0.5 - r * 0.25, 0, g);
        hand.scale.set(1, 1.05, 1.1);
        mesh(sphere(r * 0.55, 8, 6), armor ? darkMetal() : skin, (i === PART.farmL ? -1 : 1) * r * 1.05, -len * 0.5 - r * 0.0, r * 0.6, g);
        if (armor) mesh(cyl(r * 1.5, r * 1.25, len * 0.45, 10), metal(), 0, -len * 0.18, 0, g);
        break;
      }
    }
  }
  // weapons
  const items = [];
  const w = def.weapon;
  const mount = (name, part) => {
    const it = ITEMS[name];
    if (!it || name === 'none') return;
    const obj = buildItem(name, s, team);
    obj.position.set(0, -skel.handOffset, 0);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), gripDir(it, new THREE.Vector3()));
    parts[part].add(obj);
    items.push(obj);
  };
  if (w.style === 'dual') { mount(w.item, PART.farmL); mount(w.item2 || w.item, PART.farmR); }
  else if (w.item) mount(w.item, w.style === 'bow' ? PART.farmL : PART.farmR);
  if (w.shield) {
    const sh = buildShield(w.shield, s, team);
    sh.position.set(skel.parts[PART.farmL].r * 1.7, 0, 0);
    parts[PART.farmL].add(sh);
  }
  // Merge each part's static meshes (and each held item) into one vertex-coloured mesh.
  if (!opts.noBake) {
    root.updateMatrixWorld(true);
    for (const g of parts) {
      for (const it of [...g.children]) if (items.includes(it)) bake(it, it);
      bake(g, g, (o) => o !== g.userData.face && !items.some((it) => isDesc(o, it)));
    }
  }
  if (opts.ghost) {
    const gm = ghostMaterial(opts.ghostColor || tcHex);
    // depth pre-pass so only the front-most surface of the hologram shows
    const ms = [];
    root.traverse((o) => { if (o.isMesh) ms.push(o); });
    for (const o of ms) {
      o.material = gm; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 3;
      const d = new THREE.Mesh(o.geometry, GHOST_DEPTH);
      d.renderOrder = 2;
      o.add(d);
    }
    root.userData.ghostMat = gm;
  }
  const vis = { root, parts, items, skel, face: parts[PART.head].userData.face || null, expr: 0, faceVar: faceVariant(id) };
  if (!opts.ghost && !opts.portrait) LIVE_VIS.add(vis);
  return vis;
}

// Placement ghost: a translucent hologram in the team colour with a bright rim and
// faint scan lines. Exposes .color and .opacity like a regular material.
const GHOST_DEPTH = new THREE.MeshBasicMaterial({ colorWrite: false });
function ghostMaterial(color) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0.5 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vY = wp.y; vec4 mv = viewMatrix * wp;
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); f = f * f;
        float scan = 0.88 + 0.12 * smoothstep(0.35, 0.65, abs(fract(vY * 6.0) - 0.5) * 2.0);
        vec3 c = mix(color * 1.15 + 0.12, vec3(1.0), f * 0.6) * scan;
        gl_FragColor = vec4(c, clamp(opacity * (1.15 + 0.9 * f), 0.0, 0.95)); }`,
  });
  m.color = m.uniforms.color.value;
  Object.defineProperty(m, 'opacity', { get: () => m.uniforms.opacity.value, set: (v) => { m.uniforms.opacity.value = v; } });
  return m;
}

// Baked material: Phong whose specular strength and self-illumination come from a
// per-vertex `fx` attribute, plus a soft rim light for the toy-like TABS look.
const BAKED = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 38, specular: '#5a5a5a' });
BAKED.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 fx;\nvarying vec2 vFx;')
    .replace('#include <color_vertex>', '#include <color_vertex>\nvFx = fx;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vFx;')
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular *= vFx.x * 2.2;')
    .replace('#include <opaque_fragment>', `{ float rim = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
      outgoingLight += diffuseColor.rgb * pow(rim, 3.0) * 0.28;
      outgoingLight = mix(outgoingLight, diffuseColor.rgb * 1.25, vFx.y); }
      #include <opaque_fragment>`);
};
BAKED.customProgramCacheKey = () => 'wobbly-baked';

function isDesc(o, anc) { for (let p = o; p; p = p.parent) if (p === anc) return true; return false; }
// Replace the meshes under `node` (filtered) with a single merged mesh added to `node`.
function bake(node, frame, filter = () => true) {
  const meshes = [];
  node.traverse((o) => { if (o.isMesh && o !== node && filter(o)) meshes.push(o); });
  if (!meshes.length) return;
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), fx = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  const mtx = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
  for (const m of meshes) {
    mtx.multiplyMatrices(inv, m.matrixWorld);
    nm.getNormalMatrix(mtx);
    const flip = mtx.determinant() < 0;
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal;
    c.copy(m.material.color || c.set('#ffffff'));
    if (m.material.emissive) c.add(m.material.emissive);
    const spec = m.material.userData?.spec ?? 0.12, emit = m.material.userData?.emit ?? 0;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(mtx);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
      col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b;
      fx[(vo + i) * 2] = spec; fx[(vo + i) * 2 + 1] = emit;
    }
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < g.index.count; i += 3) {
        idx[io++] = a[i] + vo;
        idx[io++] = a[flip ? i + 2 : i + 1] + vo;
        idx[io++] = a[flip ? i + 1 : i + 2] + vo;
      }
    } else {
      for (let i = 0; i < P.count; i += 3) { idx[io++] = vo + i; idx[io++] = vo + (flip ? i + 2 : i + 1); idx[io++] = vo + (flip ? i + 1 : i + 2); }
    }
    vo += P.count;
    m.parent.remove(m);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('fx', new THREE.BufferAttribute(fx, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.userData.own = true;
  const merged = new THREE.Mesh(geo, BAKED);
  merged.castShadow = true;
  merged.receiveShadow = true;
  node.add(merged);
  // drop now-empty groups
  node.traverse((o) => { if (o !== node && o.isGroup && !o.children.length) o.userData.empty = true; });
}

export function disposeVisual(vis) {
  LIVE_VIS.delete(vis);
  vis.root.parent?.remove(vis.root);
  vis.root.traverse((o) => { if (o.isMesh && o.geometry.userData.own) o.geometry.dispose(); });
}

// Expressions: see FACE_MATS. Normal and angry faces blink every few seconds.
export function setExpression(vis, e) {
  if (!vis.face) { vis.expr = e; return; }
  let k = e;
  if (e <= 1) {
    const now = performance.now() * 0.001;
    if (vis.blinkAt === undefined) vis.blinkAt = now + 1 + Math.random() * 3;
    if (now > vis.blinkAt) {
      if (now < vis.blinkAt + 0.14) k = 6 + e;
      else vis.blinkAt = now + 1.8 + Math.random() * 4;
    }
  }
  vis.expr = e;
  const m = FACE_MATS[(vis.faceVar || 0) * 8 + k];
  if (vis.face.material !== m) vis.face.material = m;
}

// Pose a visual without physics (setup screen, portraits, title).
const _pose = newPose();
const _pos = Array.from({ length: NPARTS }, () => new THREE.Vector3());
const _yq = new THREE.Quaternion();
const _pp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export function poseVisual(vis, x, y, z, yaw, st) {
  computePose(st, _pose);
  _pp.set(0, vis.skel.standHeight + (st.bob || 0), 0);
  forwardKinematics(vis.skel, _pp, _pose, _pos);
  _yq.setFromAxisAngle(UP, yaw);
  for (let i = 0; i < NPARTS; i++) {
    const g = vis.parts[i];
    g.position.copy(_pos[i]).applyQuaternion(_yq);
    g.position.x += x; g.position.y += y; g.position.z += z;
    g.quaternion.copy(_yq).multiply(_pose[i]);
  }
}

// ---------------------------------------------------------------- portraits
export function renderPortraits(defs, size = 128) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#806a50', 2.0));
  const dl = new THREE.DirectionalLight('#fff6e8', 2.0);
  dl.position.set(2, 3, 4);
  scene.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const out = {};
  for (const def of defs) {
    for (const team of [0, 1]) {
      const vis = buildUnitVisual(def, team, { portrait: true });
      const st = { phase: 0, amp: 0, style: def.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0.2, mode: 'normal', t: 0 };
      poseVisual(vis, 0, 0, 0, 0.5, st);
      setExpression(vis, 1);
      scene.add(vis.root);
      const hgt = vis.skel.height;
      const box3 = new THREE.Box3().setFromObject(vis.root);
      const ctr = box3.getCenter(new THREE.Vector3());
      const ext = box3.getSize(new THREE.Vector3());
      const d = Math.max(ext.y, ext.x * 1.1) / (2 * Math.tan((15 * Math.PI) / 180)) * 1.02;
      cam.position.set(ctr.x + d * 0.25, ctr.y + hgt * 0.06, ctr.z + d);
      cam.lookAt(ctr);
      r.render(scene, cam);
      out[def.id + ':' + team] = r.domElement.toDataURL();
      scene.remove(vis.root);
      vis.root.traverse((o) => { if (o.isMesh && o.geometry.userData.own) o.geometry.dispose(); });
    }
  }
  r.dispose();
  r.forceContextLoss?.();
  return out;
}
