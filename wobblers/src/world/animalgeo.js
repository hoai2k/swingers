// Animal geometry: modelGeometry(name, ...args) -> Promise<BufferGeometry> for a model in
// animalmodels.js. The sculpted surface is meshed in a worker (animalworker.js, ~0.05-0.2 s a
// species), so the world build and frames never wait for it; the extras (eyes, teeth, smiles)
// are added here. A species is simply invisible until its geometry arrives (critters.js).
// Without workers it falls back to meshing on the main thread, one model per frame.
import * as THREE from 'three';
import * as M from './animalmodels.js';
import { sculptArrays } from './sculpt.js';
import { rig } from './critters.js';

let worker = null, seq = 0;
const waiting = new Map(), queue = [];
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./animalworker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { const w = waiting.get(data.id); waiting.delete(data.id); if (w) data.error ? w.fail(data.error) : w.done(data.a); };
    worker.onerror = () => { worker = false; for (const [, w] of waiting) queue.push(w); waiting.clear(); pump(); };
  } catch (e) { worker = false; }
  return worker;
}
function pump() { // main-thread fallback
  if (!queue.length) return;
  const w = queue.shift(), m = M[w.name](...w.args);
  w.done(sculptArrays(m.shapes, m.opts));
  setTimeout(pump, 16);
}

// Models built from the reference sheets (tools/animals/build.py -> assets/animals/): a mesh
// and two paint images projected onto it (critters.js Species `proj`).
export const SHEET_MODELS = new Set(['shark', 'dolphin', 'whale', 'puffer', 'clownfish', 'blueTang', 'yellowTang', 'moorishIdol']);
const texLoader = new THREE.TextureLoader();
async function sheetGeometry(name) {
  const base = 'assets/animals/' + name;
  const [meta, buf] = await Promise.all([fetch(base + '.json').then((r) => r.json()), fetch(base + '.bin').then((r) => r.arrayBuffer())]);
  const n = meta.n, lo = meta.lo, hi = meta.hi;
  let o = 0;
  const q = new Uint16Array(buf, o, n * 3); o += n * 6;
  const nq = new Int8Array(buf, o, n * 3); o += n * 3;
  const part = new Uint8Array(buf, o, n); o += n;
  const wq = new Uint8Array(buf, o, n); o += n;
  const idx = meta.index32 ? new Uint32Array(buf.slice(o)) : new Uint16Array(buf.slice(o, o + meta.tris * 6));
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), rigA = new Float32Array(n * 4), w = new Float32Array(n), col = new Float32Array(n * 3).fill(1);
  const PIV = { 1: 'FL', 2: 'FR', 3: 'BL', 4: 'BR', 5: 'TAIL', 6: 'HEAD', 7: 'WING_L', 8: 'WING_R', 9: 'JAW' };
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) { pos[i * 3 + k] = lo[k] + (q[i * 3 + k] / 65535) * (hi[k] - lo[k]); nrm[i * 3 + k] = nq[i * 3 + k] / 127; }
    const pv = meta.pivots[PIV[part[i]]] || [0, 0, 0];
    rigA.set([part[i], pv[0], pv[1], pv[2]], i * 4);
    w[i] = wq[i] / 255;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aRig', new THREE.BufferAttribute(rigA, 4));
  g.setAttribute('aW', new THREE.BufferAttribute(w, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const tex = (f) => new Promise((res) => texLoader.load(f, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null)));
  const [side, top] = await Promise.all([tex(base + '_side.jpg'), tex(base + '_top.jpg')]);
  g.userData.proj = { side, top, sideBox: meta.proj.side, topBox: meta.proj.top };
  return g;
}

export function modelGeometry(name, ...args) {
  if (SHEET_MODELS.has(name)) return sheetGeometry(name).catch(() => sculptedGeometry(name, args)); // not built yet: the sculpted stand-in
  return sculptedGeometry(name, args);
}
function sculptedGeometry(name, args) {
  return new Promise((resolve, reject) => {
    const job = { name, args, fail: reject, done: (a) => resolve(build(name, args, a)) };
    const wk = getWorker();
    if (wk) { const id = ++seq; waiting.set(id, job); wk.postMessage({ id, name, args }); }
    else { queue.push(job); if (queue.length === 1) setTimeout(pump, 16); }
  });
}

function build(name, args, a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.col, 3));
  g.setAttribute('aRig', new THREE.BufferAttribute(a.rig, 4));
  g.setAttribute('aW', new THREE.BufferAttribute(a.w, 1));
  g.setIndex(new THREE.BufferAttribute(a.idx, 1));
  const opts = M[name](...args).opts, extras = [...(opts.extras || [])];
  (opts.marks || []).forEach((m, i) => {
    for (const side of m.mirror === false ? [1] : [1, -1]) {
      const o = i * 12 + (side > 0 ? 0 : 6), p = new THREE.Vector3(a.anc[o], a.anc[o + 1], a.anc[o + 2]), n = new THREE.Vector3(a.anc[o + 3], a.anc[o + 4], a.anc[o + 5]);
      extras.push({ part: m.part || 0, pivot: m.pivot || [0, 0, 0], build: (b) => MARKS[m.draw](b, p, n, m, side) });
    }
  });
  if (!extras.length) { g.computeBoundingSphere(); return g; }
  return mergeTwo(g, rig(extras));
}

// ---- marks drawn flush on the sculpted surface at a snapped point p with outward normal n ------
const INK = 0x16161e;
function frame(p, n) { // local axes: n out of the surface, u 'up' along it, v across
  const u = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y);
  if (u.lengthSq() < 1e-4) u.set(0, 0, 1).addScaledVector(n, -n.z);
  u.normalize();
  const v = new THREE.Vector3().crossVectors(u, n);
  return { u, v, at: (du, dv, dn) => p.clone().addScaledVector(u, du).addScaledVector(v, dv).addScaledVector(n, dn) };
}
// a primitive placed in the local frame (scale along v, u, n)
function put(b, geo, color, F, pos, sv, su, sn) {
  const m = new THREE.Matrix4().makeBasis(F.v, F.u, new THREE.Vector3().crossVectors(F.v, F.u));
  m.scale(new THREE.Vector3(sv, su, sn)); m.setPosition(pos);
  b.addMatrix(geo.clone(), color, m); // the Builder transforms what it is given
}
const MARKS = {
  // m.r size; m.iris colour; m.white eyeball; m.brow tilt (angry > 0); m.look: pupil offset across (+ toward the nose)
  eye(b, p, n, m, side) {
    const F = frame(p, n), r = m.r, ball = new THREE.SphereGeometry(1, 16, 12);
    if (m.white) put(b, ball, 0xffffff, F, F.at(0, 0, -r * 0.55), r * 1.25, r * 1.45, r * 0.95);
    const look = (m.look ?? 0.2) * r * -side;
    if (m.iris) put(b, ball, m.iris, F, F.at(0, look, -r * 0.2), r * 0.95, r * 1.05, r * 0.6);
    put(b, ball, INK, F, F.at(r * 0.05, look, -r * 0.08), r * (m.iris ? 0.58 : 0.8), r * (m.iris ? 0.66 : 1.0), r * 0.55);
    put(b, ball, 0xffffff, F, F.at(r * 0.42, look + r * 0.18, r * 0.36), r * 0.26, r * 0.26, r * 0.12);
    if (m.brow) {
      const g = new THREE.CapsuleGeometry(1, 1, 3, 8).rotateZ(Math.PI / 2);
      const F2 = frame(p, n), t = m.brow * side;
      const R = new THREE.Matrix4().makeBasis(F2.v, F2.u, n).multiply(new THREE.Matrix4().makeRotationZ(t)).scale(new THREE.Vector3(r * 0.7, r * 0.22, r * 0.22));
      R.setPosition(F2.at(r * 1.35, 0, 0)); b.addMatrix(g.clone(), INK, R);
    }
  },
  // a curved mouth line across the surface: m.w width, m.t thickness, m.curve (smile > 0), m.color
  smile(b, p, n, m) {
    const F = frame(p, n), pts = [];
    for (let i = 0; i <= 12; i++) { const k = i / 6 - 1; pts.push(F.at(-(1 - k * k) * (m.curve ?? 0.3) * m.w + Math.abs(k) * (m.lift ?? 0) * m.w, k * m.w, -m.t * 0.3)); }
    b.addMatrix(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, m.t, 6, false), m.color ?? INK, new THREE.Matrix4());
    for (const e of [pts[0], pts[12]]) b.addMatrix(new THREE.SphereGeometry(m.t, 8, 6), m.color ?? INK, new THREE.Matrix4().setPosition(e));
  },
  // a row of little white teeth hanging under the mouth line: m.w width, m.n count, m.s size
  teeth(b, p, n, m) {
    const F = frame(p, n), g = new THREE.ConeGeometry(1, 2, 5).rotateZ(Math.PI);
    for (let i = 0; i < m.n; i++) { const k = ((i + 0.5) / m.n) * 2 - 1; put(b, g, 0xffffff, F, F.at(-(1 - k * k) * (m.curve ?? 0.3) * m.w + Math.abs(k) * (m.lift ?? 0) * m.w - m.s * 0.9, k * m.w * 0.92, -m.s * 0.1), m.s * 0.55, m.s, m.s * 0.45); }
  },
  // gill slits: m.n lines of length m.l, spaced m.gap along the body
  gills(b, p, n, m) {
    const F = frame(p, n), g = new THREE.CapsuleGeometry(1, 2, 3, 6);
    for (let i = 0; i < m.n; i++) put(b, g, m.color ?? 0x3a4658, F, F.at(0, (i - (m.n - 1) / 2) * m.gap, 0), m.t ?? 0.012, m.l / 2, m.t ?? 0.012);
  },
  // a flat dot (nostrils, cheeks, blowhole): m.r, m.color
  dot(b, p, n, m) { const F = frame(p, n); put(b, new THREE.SphereGeometry(1, 10, 8), m.color ?? INK, F, F.at(0, 0, -m.r * 0.3), m.r, m.r * (m.tall ?? 1), m.r * 0.5); },
};
function mergeTwo(a, b) {
  const out = new THREE.BufferGeometry(), na = a.attributes.position.count, nb = b.attributes.position.count;
  for (const name of ['position', 'normal', 'color', 'aRig', 'aW']) {
    const A = a.attributes[name], B = b.attributes[name], sz = A.itemSize, arr = new Float32Array((na + nb) * sz);
    arr.set(A.array, 0);
    if (B) arr.set(B.array, na * sz); else if (name === 'aW') arr.fill(1, na);
    out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
  const ia = a.index.array, ib = b.index.array, I = new Uint32Array(ia.length + ib.length);
  I.set(ia, 0); for (let i = 0; i < ib.length; i++) I[ia.length + i] = ib[i] + na;
  out.setIndex(new THREE.BufferAttribute(I, 1));
  out.computeBoundingSphere();
  return out;
}
