// Meshes animal models off the main thread (animalgeo.js posts { id, name, args }).
import * as M from './animalmodels.js';
import { sculptArrays } from './sculpt.js';

self.onmessage = ({ data: { id, name, args } }) => {
  try {
    const m = M[name](...args), a = sculptArrays(m.shapes, m.opts);
    self.postMessage({ id, a }, [a.pos.buffer, a.nrm.buffer, a.col.buffer, a.rig.buffer, a.w.buffer, a.idx.buffer]);
  } catch (e) { self.postMessage({ id, error: String(e) }); }
};
