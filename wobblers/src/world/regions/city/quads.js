// Flat coloured quads for the thousands of windows and road markings in
// Bigtown. A window only needs its front face, so instead of a 24-vertex box
// per window (and a BoxGeometry + prep per box at build time) each one is a
// 4-vertex quad, batched per kit chunk into one geometry with the same
// attributes the kit's Builder produces (position, normal, color, glow,
// Uint32 index), and handed to that chunk's builder before kit.finish()
// merges it. Glow follows mesh.js: GLOW colours light up at night, and about
// one window in four (hashed on its position) stays dark.
import * as THREE from 'three';
import { GLOW } from '../../../mesh.js';

const CHUNK = 64; // must match world/kit.js
const _c = new THREE.Color();

export class Quads {
  constructor(kit) { this.kit = kit; this.chunks = new Map(); }

  chunk(x, z) {
    const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let c = this.chunks.get(key);
    if (!c) { c = { x, z, pos: [], nrm: [], col: [], glow: [] }; this.chunks.set(key, c); }
    return c;
  }

  glowOf(color, x, y, z) {
    let k = GLOW.get(color) || 0;
    if (k === 1) {
      const h = Math.sin(Math.round(x * 2) * 12.9898 + Math.round(y * 2) * 4.1414 + Math.round(z * 2) * 78.233) * 43758.5453;
      if (h - Math.floor(h) < 0.27) k = 0;
    }
    return k;
  }

  push(c, pts, n, color, k) {
    _c.set(color);
    for (const p of pts) { c.pos.push(p[0], p[1], p[2]); c.nrm.push(n[0], n[1], n[2]); c.col.push(_c.r, _c.g, _c.b); c.glow.push(k); }
  }

  // Upright quad centred at (x, y, z) facing world yaw `ny` (normal = (sin ny, 0, cos ny)), w wide, h tall.
  wall(x, y, z, ny, w, h, color) {
    const sx = Math.sin(ny), cz = Math.cos(ny), tx = cz * w / 2, tz = -sx * w / 2, hh = h / 2;
    this.push(this.chunk(x, z), [[x - tx, y - hh, z - tz], [x + tx, y - hh, z + tz], [x + tx, y + hh, z + tz], [x - tx, y + hh, z - tz]],
      [sx, 0, cz], color, this.glowOf(color, x, y, z));
  }

  // Flat quad facing up at height y, centred at (x, z), w along x and d along z (turned by yaw).
  floor(x, y, z, w, d, color, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    this.push(this.chunk(x, z), [P(-w / 2, d / 2), P(w / 2, d / 2), P(w / 2, -d / 2), P(-w / 2, -d / 2)], [0, 1, 0], color, this.glowOf(color, x, y, z));
  }

  // Hands every chunk's batch to the kit's chunk builder (call once, before kit.finish()).
  flush() {
    for (const c of this.chunks.values()) {
      const n = c.pos.length / 3;
      if (!n) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(c.nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3));
      g.setAttribute('glow', new THREE.Float32BufferAttribute(c.glow, 1));
      const idx = new Uint32Array(n / 4 * 6);
      for (let q = 0, i = 0; q < n; q += 4) { idx[i++] = q; idx[i++] = q + 1; idx[i++] = q + 2; idx[i++] = q; idx[i++] = q + 2; idx[i++] = q + 3; }
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      this.kit.b(c.x, c.z).parts.push(g);
    }
    this.chunks.clear();
  }
}
