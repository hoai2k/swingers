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

export function modelGeometry(name, ...args) {
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
  const extras = M[name](...args).opts.extras;
  if (!extras?.length) { g.computeBoundingSphere(); return g; }
  return mergeTwo(g, rig(extras));
}
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
