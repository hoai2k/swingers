// Geometry helpers. Most of the world is built from primitives baked with
// vertex colours and merged into a few big meshes so that 8 split-screen
// views stay cheap to draw.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { paintFace, loadImage, slug } from './assets.js';
import { addGlow } from './look.js';

export const matVC = addGlow(new THREE.MeshLambertMaterial({ vertexColors: true }));
export const matVCDouble = addGlow(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
// flat decals (window quads) drawn over a wall far away: pulled a few depth steps in
// front of it, so they never z-fight with it however far off they are
export const matVCDecal = addGlow(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));

// Colours that light up at night (see look.js addGlow): 1 = window (most
// windows lit, warm), 2 = lamp globe (always lit, bright). World code can add
// its own: GLOW.set(0xrrggbb, 1).
export const GLOW = new Map([[0x8fcfff, 1], [0x9fd8ff, 1], [0xfff4c2, 2]]);
export const matGlass = new THREE.MeshPhongMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45, shininess: 80, specular: 0xffffff });

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function setGlow(g, color) {
  const n = g.attributes.position.count, a = new Float32Array(n);
  let k = GLOW.get(color) || 0;
  if (k === 1) { // leave ~1 in 4 windows dark, decided by where the window is
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(_p);
    const h = Math.sin(Math.round(c.x * 2) * 12.9898 + Math.round(c.y * 2) * 4.1414 + Math.round(c.z * 2) * 78.233) * 43758.5453;
    if (h - Math.floor(h) < 0.27) k = 0;
  }
  if (k) a.fill(k);
  g.setAttribute('glow', new THREE.BufferAttribute(a, 1));
}

function prep(geo, color) {
  let g = geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  if (!g.index) {
    const n = g.attributes.position.count, idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Collects coloured primitives and merges them into one geometry.
export class Builder {
  constructor() { this.parts = []; }
  // pos [x,y,z], rot [x,y,z] euler or quaternion, scale [x,y,z]
  add(geo, color, pos = [0, 0, 0], rot = null, scale = null) {
    const g = prep(geo, color);
    _p.set(pos[0], pos[1], pos[2]);
    if (rot && rot.isQuaternion) _q.copy(rot);
    else if (rot) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ'));
    else _q.identity();
    if (scale) _s.set(scale[0], scale[1], scale[2]); else _s.set(1, 1, 1);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    setGlow(g, typeof color === 'number' ? color : _c.set(color).getHex());
    this.parts.push(g);
    return this;
  }
  addMatrix(geo, color, matrix) {
    const g = prep(geo, color); g.applyMatrix4(matrix); setGlow(g, typeof color === 'number' ? color : _c.set(color).getHex()); this.parts.push(g); return this;
  }
  box(w, h, d, color, pos, rot) { return this.add(new THREE.BoxGeometry(w, h, d), color, pos, rot); }
  rbox(w, h, d, r, color, pos, rot, seg = 2) {
    return this.add(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999), color, pos, rot);
  }
  cyl(rt, rb, h, color, pos, rot, seg = 12) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, pos, rot); }
  sphere(r, color, pos, scale, seg = 12) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.75 | 0)), color, pos, null, scale); }
  cone(r, h, color, pos, rot, seg = 10) { return this.add(new THREE.ConeGeometry(r, h, seg), color, pos, rot); }
  torus(r, t, color, pos, rot, seg = 16) { return this.add(new THREE.TorusGeometry(r, t, 6, seg), color, pos, rot); }
  capsule(r, len, color, pos, rot) { return this.add(new THREE.CapsuleGeometry(r, len, 4, 10), color, pos, rot); }
  geometry() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
  mesh(material = matVC, { shadow = true, receive = true } = {}) {
    const g = this.geometry();
    const m = new THREE.Mesh(g || new THREE.BufferGeometry(), material);
    m.castShadow = shadow; m.receiveShadow = receive;
    return m;
  }
}

// Faces are painted on the front of the head sphere (u = 0.25 faces +Z).
function faceCanvas(kind) {
  const W = 512, H = 256, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffd9b8'; g.fillRect(0, 0, W, H);
  // cheeks
  g.fillStyle = 'rgba(255,120,120,.35)';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(W * 0.25 + sx * 52, H * 0.6, 20, 12, 0, 0, 7); g.fill(); }
  const ex = [W * 0.25 - 30, W * 0.25 + 30], ey = H * 0.44;
  if (kind === 'ko') {
    g.strokeStyle = '#222'; g.lineWidth = 7; g.lineCap = 'round';
    for (const x of ex) {
      g.beginPath(); g.moveTo(x - 13, ey - 13); g.lineTo(x + 13, ey + 13); g.moveTo(x + 13, ey - 13); g.lineTo(x - 13, ey + 13); g.stroke();
    }
    g.beginPath(); g.ellipse(W * 0.25, H * 0.66, 13, 10, 0, 0, 7); g.fillStyle = '#7a2a2a'; g.fill();
  } else {
    for (const x of ex) {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, ey, 17, 23, 0, 0, 7); g.fill();
      g.fillStyle = '#1c1c28'; g.beginPath(); g.ellipse(x + 2, ey + 3, 10, 14, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 6, ey - 4, 4, 0, 7); g.fill();
    }
    g.strokeStyle = '#5a2a2a'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(W * 0.25, H * 0.6, 22, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    g.strokeStyle = '#6b4a3a'; g.lineWidth = 5;
    for (const x of ex) { g.beginPath(); g.moveTo(x - 14, ey - 34); g.lineTo(x + 12, ey - 37); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  paintFace(t, kind === 'ko' ? 'ko' : 'happy');
  return t;
}

let _faces = null;
export function faceMaterials() {
  if (!_faces) {
    _faces = {
      normal: new THREE.MeshLambertMaterial({ map: faceCanvas('normal') }),
      ko: new THREE.MeshLambertMaterial({ map: faceCanvas('ko') }),
    };
  }
  return _faces;
}

export function colorMat(color) { return new THREE.MeshLambertMaterial({ color }); }

// Text label sprite texture (signs on buildings and rides).
export function signTexture(text, bg = '#ff5a8a', fg = '#fff', w = 512, h = 128) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg;
  const r = h * 0.3;
  g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, r); g.fill();
  g.fillStyle = fg; g.font = `900 ${h * 0.55}px Trebuchet MS, sans-serif`;
  const tw = g.measureText(text).width; // long text: shrink to fit
  if (tw > w - h * 0.4) g.font = `900 ${Math.floor(h * 0.55 * (w - h * 0.4) / tw)}px Trebuchet MS, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  // painted sign art, if delivered (assets/signs/<text>.png, 4:1)
  loadImage(`signs/${slug(text)}.png`)?.then((im) => { t.dispose(); t.image = im; t.needsUpdate = true; }).catch(() => {});
  return t;
}

// A sign board: text on the front, plain colour on the back.
export function signMesh(text, width, bg, fg) {
  const t = signTexture(text, bg, fg);
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(width, width / 4);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true }));
  const back = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: bg }));
  back.rotation.y = Math.PI;
  back.scale.set(0.97, 0.88, 1);
  g.add(front, back);
  return g;
}

export { THREE, RoundedBoxGeometry };
