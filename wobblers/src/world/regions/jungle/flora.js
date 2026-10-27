// Cheap foliage for the jungle and the cove: every plant kind is one small
// vertex-coloured template; instances are transformed straight into big typed
// arrays and merged into one mesh per CELL x CELL m square (one draw call per
// square, far-culled with the kit chunks via game.staticChunks). Squares are
// merged lazily, nearest a camera first, one per frame (finish()). Trunks get a
// static cylinder collider; undergrowth has none.
import * as THREE from 'three';
import { Builder, matVC } from '../../../mesh.js';

const T = {}; // kind -> { pos, nrm, col, glow, idx, trunk: [r, h] | null, shadow }

function tube(b, rt, rb, h, color, pos, rot, seg) { b.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true), color, pos, rot); }
function ico(b, r, color, pos, scale) { b.add(new THREE.IcosahedronGeometry(r, 0), color, pos, null, scale); }

function template(kind) {
  if (T[kind]) return T[kind];
  const b = new Builder();
  let trunk = null;
  switch (kind) {
    case 'jtree': { // tall broadleaf jungle tree, ~13 m
      tube(b, 0.32, 0.65, 9, 0x7a5a3a, [0, 4.5, 0], null, 5);
      ico(b, 3.4, 0x2f8a35, [0, 10.4, 0], [1.25, 0.62, 1.2]);
      ico(b, 2.6, 0x3d9c3a, [2.1, 9.6, 0.8], [1.2, 0.65, 1.1]);
      ico(b, 2.5, 0x267a2e, [-1.7, 9.9, -1.3], [1.1, 0.6, 1.2]);
      ico(b, 2.0, 0x4aa842, [0.3, 11.8, -0.4], [1.1, 0.6, 1]);
      trunk = [0.5, 8];
      break;
    }
    case 'jtree2': { // shorter rounder tree with vines hanging
      tube(b, 0.25, 0.42, 6, 0x6b4a2a, [0, 3, 0], null, 5);
      ico(b, 2.6, 0x3a9a3c, [0, 7, 0], [1.2, 0.8, 1.2]);
      ico(b, 1.9, 0x52b046, [1.5, 6.4, 0.6], null);
      ico(b, 1.8, 0x2c8034, [-1.3, 6.6, -0.7], null);
      for (const [x, z, l] of [[1.6, 0.9, 3.2], [-1.5, -1.1, 2.6], [0.4, -1.9, 3.6]]) b.box(0.07, l, 0.07, 0x3f7a2a, [x, 6.2 - l / 2, z]);
      trunk = [0.38, 5];
      break;
    }
    case 'palm': { // leaning coconut palm, ~7 m
      for (let i = 0; i < 3; i++) tube(b, 0.19, 0.25, 2.25, i % 2 ? 0x9a6e40 : 0xa77b4a, [i * i * 0.12, 1.1 + i * 2.15, 0], [0, 0, -0.05 - i * 0.08], 5);
      const tx = 0.85, ty = 6.6;
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        b.box(0.75, 0.06, 3.3, i % 2 ? 0x3cae4a : 0x2f9a40, [tx + Math.sin(a) * 1.5, ty - 0.35, Math.cos(a) * 1.5], [0.42, a, 0, 'YXZ']);
      }
      b.add(new THREE.IcosahedronGeometry(0.3, 0), 0x6b4a2a, [tx, ty - 0.4, 0.1], null, [1.4, 0.9, 1.4]);
      trunk = [0.3, 4];
      break;
    }
    case 'fern': {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.box(0.35, 0.04, 1.6, i % 2 ? 0x3f9a3a : 0x4fb043, [Math.sin(a) * 0.7, 0.45, Math.cos(a) * 0.7], [-0.55, a, 0, 'YXZ']); }
      break;
    }
    case 'bush': {
      ico(b, 1.0, 0x3f9a3a, [0, 0.6, 0], [1.3, 0.8, 1.1]);
      ico(b, 0.7, 0x55b048, [0.7, 0.5, 0.3], null);
      break;
    }
    case 'flowers': { // flowering shrub (hibiscus-ish)
      ico(b, 0.9, 0x3a9440, [0, 0.6, 0], [1.3, 0.8, 1.2]);
      for (const [x, y, z, c] of [[0.6, 1.0, 0.5, 0xff3a5a], [-0.5, 1.1, 0.2, 0xff8ac8], [0.1, 1.2, -0.6, 0xffd23f], [0.9, 0.6, -0.3, 0xff3a5a], [-0.8, 0.7, -0.5, 0xff8ac8]])
        b.add(new THREE.IcosahedronGeometry(0.2, 0), c, [x, y, z]);
      break;
    }
    case 'bigleaf': { // elephant-ear plant
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + 0.3, l = 1.6 + (i % 2) * 0.5;
        b.cyl(0.04, 0.05, l, 0x4f8a2a, [Math.sin(a) * 0.3, l / 2, Math.cos(a) * 0.3], [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35], 4);
        b.add(new THREE.SphereGeometry(0.75, 6, 3), i % 2 ? 0x2f8f35 : 0x3fa83f, [Math.sin(a) * 0.95, l + 0.05, Math.cos(a) * 0.95], [0.5, a, 0, 'YXZ'], [0.8, 0.12, 1.3]);
      }
      break;
    }
    case 'banana': {
      tube(b, 0.18, 0.24, 2.6, 0x8aa04a, [0, 1.3, 0], null, 5);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.box(0.7, 0.04, 2.4, 0x5cc04a, [Math.sin(a) * 1.0, 2.7, Math.cos(a) * 1.0], [0.5, a, 0, 'YXZ']); }
      b.add(new THREE.IcosahedronGeometry(0.28, 0), 0xffd23f, [0.25, 2.3, 0.1], null, [0.8, 1.4, 0.8]);
      trunk = [0.22, 2.5];
      break;
    }
    case 'rock': {
      b.add(new THREE.DodecahedronGeometry(1, 0), 0x8a8a80, [0, 0.25, 0], [0.3, 0.7, 0], [1, 0.7, 1.15]);
      break;
    }
    case 'reed': {
      for (let i = 0; i < 7; i++) { const a = i * 2.4; b.box(0.05, 1.6 + (i % 3) * 0.3, 0.05, 0x6a9a3a, [Math.sin(a) * 0.3, 0.8, Math.cos(a) * 0.3], [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15]); }
      break;
    }
    default: throw new Error('flora kind ' + kind);
  }
  const g = b.geometry();
  g.computeBoundingSphere();
  T[kind] = {
    pos: g.attributes.position.array, nrm: g.attributes.normal.array, col: g.attributes.color.array, glow: g.attributes.glow.array,
    idx: g.index.array, n: g.attributes.position.count, rad: g.boundingSphere.radius + g.boundingSphere.center.length(),
    trunk, shadow: kind !== 'fern' && kind !== 'reed' && kind !== 'flowers',
  };
  g.dispose();
  return T[kind];
}

export class Flora {
  constructor(game, cell = 96) {
    this.game = game; this.cell = cell;
    this.cells = new Map(); // key -> { list: [[tpl, m(16), tint]], n }
    this.count = 0;
    this.trees = []; // [kind, x, y, z, scale, cos, sin] of the big trees
  }
  // a plant at (x, y, z), uniform scale s, turned by yaw, colour multiplier tint
  add(kind, x, y, z, s = 1, yaw = 0, tint = 1, collide = true) {
    const t = template(kind);
    const key = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell) + (t.shadow ? '' : 'u');
    let c = this.cells.get(key);
    if (!c) { c = { list: [], n: 0, ni: 0, shadow: t.shadow }; this.cells.set(key, c); }
    c.list.push([t, x, y, z, s, Math.cos(yaw), Math.sin(yaw), tint]);
    if (kind === 'jtree' || kind === 'jtree2') this.trees.push([kind, x, y, z, s, Math.cos(yaw), Math.sin(yaw)]); // animals.js: monkeys on the vines
    c.n += t.n; c.ni += t.idx.length;
    this.count++;
    if (collide && t.trunk) this.game.physics.cylinder(x, y + t.trunk[1] * s / 2, z, t.trunk[0] * s, t.trunk[1] * s, {});
  }
  // Cells are merged lazily, nearest first, at most one per frame once a camera
  // comes within `near` m, so the region build stays cheap.
  finish(near = 900) {
    const pending = [...this.cells.values()];
    for (const c of pending) {
      c.cx = 0; c.cz = 0;
      for (const it of c.list) { c.cx += it[1]; c.cz += it[3]; }
      c.cx /= c.list.length; c.cz /= c.list.length;
    }
    this.cells.clear();
    const game = this.game;
    this.pending = pending;
    const tick = () => {
      if (!pending.length) return;
      const cams = game.players.map((p) => p.camera?.cam?.position).filter(Boolean);
      if (!cams.length && game.idleCam) cams.push(game.idleCam.position);
      let best = -1, bd = near;
      for (let i = 0; i < pending.length; i++) {
        const c = pending[i];
        for (const q of cams) { const d = Math.hypot(q.x - c.cx, q.z - c.cz); if (d < bd) { bd = d; best = i; } }
      }
      if (best >= 0) this.buildCell(pending.splice(best, 1)[0]);
    };
    game.updaters.push(tick);
    this.flush = () => { while (pending.length) this.buildCell(pending.pop()); };
  }
  buildCell(c) {
    const list = this.game.staticChunks ||= [];
    {
      const P = new Float32Array(c.n * 3), N = new Float32Array(c.n * 3), C = new Float32Array(c.n * 3), G = new Float32Array(c.n);
      const I = c.n > 65535 ? new Uint32Array(c.ni) : new Uint16Array(c.ni);
      let o = 0, oi = 0;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < c.list.length; k++) {
        const it = c.list[k], t = it[0], x = it[1], y = it[2], z = it[3], s = it[4], co = it[5], si = it[6], tint = it[7];
        const p = t.pos, nr = t.nrm, cl = t.col, gl = t.glow, n = t.n, idx = t.idx;
        const base = o;
        for (let i = 0, j = 0, jj = o * 3; i < n; i++, j += 3, jj += 3) {
          const lx = p[j] * s, lz = p[j + 2] * s;
          P[jj] = x + lx * co + lz * si; P[jj + 1] = y + p[j + 1] * s; P[jj + 2] = z - lx * si + lz * co;
          const nx = nr[j], nz = nr[j + 2];
          N[jj] = nx * co + nz * si; N[jj + 1] = nr[j + 1]; N[jj + 2] = -nx * si + nz * co;
          C[jj] = cl[j] * tint; C[jj + 1] = cl[j + 1] * tint; C[jj + 2] = cl[j + 2] * tint;
          G[o + i] = gl[i];
        }
        o += n;
        for (let i = 0; i < idx.length; i++) I[oi++] = idx[i] + base;
        const r = t.rad * s;
        if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r; if (z - r < z0) z0 = z - r; if (z + r > z1) z1 = z + r;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.BufferAttribute(C, 3));
      g.setAttribute('glow', new THREE.BufferAttribute(G, 1));
      g.setIndex(new THREE.BufferAttribute(I, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, matVC);
      m.castShadow = c.shadow; m.receiveShadow = true;
      this.game.scene.add(m);
      list.push({ mesh: m, x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2, tall: false });
    }
  }
}
