// Static scenery kit: adds coloured geometry to spatial chunks (merged into
// one mesh per chunk for cheap drawing and culling) plus matching colliders.
import * as THREE from 'three';
import { Builder, matVC, matVCDouble } from '../mesh.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { RAPIER, yawQuat } from '../physics.js';

const CHUNK = 64;
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

const FAR_PART_R = 1.4; // parts smaller than this (bounding radius, m) are left out of a chunk's far version

export class Kit {
  constructor(game) {
    this.game = game;
    this.phys = game.physics;
    this.chunks = new Map();
  }

  b(x, z) {
    const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let c = this.chunks.get(key);
    if (!c) { c = new Builder(); this.chunks.set(key, c); }
    return c;
  }

  rotOf(opts) {
    if (opts.rot) return opts.rot;
    if (opts.euler) { _q.setFromEuler(_e.set(opts.euler[0], opts.euler[1], opts.euler[2], 'YXZ')); return { x: _q.x, y: _q.y, z: _q.z, w: _q.w }; }
    if (opts.yaw) return yawQuat(opts.yaw);
    return null;
  }
  q3(rot) { return rot ? new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w) : null; }

  // Box centred at (x, y, z) with full size (w, h, d).
  box(x, y, z, w, h, d, color, opts = {}) {
    const rot = this.rotOf(opts);
    const b = opts.builder || this.b(x, z);
    if (opts.round) b.rbox(w, h, d, opts.round, color, [x, y, z], this.q3(rot));
    else b.add(new THREE.BoxGeometry(w, h, d), color, [x, y, z], this.q3(rot));
    if (opts.collide !== false) this.phys.box(x, y, z, w, h, d, { rot, friction: opts.friction, restitution: opts.restitution, bounce: opts.bounce, slippery: opts.slippery });
    return this;
  }
  // Visual-only box.
  deco(x, y, z, w, h, d, color, opts = {}) { return this.box(x, y, z, w, h, d, color, { ...opts, collide: false }); }

  cyl(x, y, z, r, h, color, opts = {}) {
    const rot = this.rotOf(opts);
    const b = opts.builder || this.b(x, z);
    b.add(new THREE.CylinderGeometry(opts.rTop ?? r, r, h, opts.seg || 12), color, [x, y, z], this.q3(rot));
    if (opts.collide !== false) this.phys.cylinder(x, y, z, Math.max(r, opts.rTop ?? r), h, { rot, friction: opts.friction, restitution: opts.restitution, bounce: opts.bounce });
    return this;
  }
  sphere(x, y, z, r, color, opts = {}) {
    const b = opts.builder || this.b(x, z);
    b.sphere(r, color, [x, y, z], opts.scale, opts.seg || 12);
    if (opts.collide) this.phys.ball(x, y, z, r * (opts.scale ? Math.min(...opts.scale) : 1), {});
    return this;
  }
  cone(x, y, z, r, h, color, opts = {}) {
    const b = opts.builder || this.b(x, z);
    b.cone(r, h, color, [x, y, z], opts.euler || null, opts.seg || 10);
    return this;
  }
  // Wedge ramp: base centred at (x, y0, z), rising along local +Z to height h.
  wedge(x, y0, z, w, len, h, color, opts = {}) {
    const yaw = opts.yaw || 0;
    const hw = w / 2, hl = len / 2;
    const local = [
      [-hw, 0, -hl], [hw, 0, -hl], [-hw, 0, hl], [hw, 0, hl], [-hw, h, hl], [hw, h, hl],
    ];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const pts = local.map(([a, b2, d]) => [x + a * c + d * s, y0 + b2, z - a * s + d * c]);
    const g = new THREE.BufferGeometry();
    // faces: bottom, slope (0,1,4,5), back (2,3,4,5), sides
    const faces = [[0, 1, 2, 1, 3, 2], [0, 4, 1, 1, 4, 5], [2, 3, 4, 3, 5, 4], [0, 2, 4], [1, 5, 3]];
    const pos = [];
    for (const f of faces) for (const i of f) pos.push(...pts[i]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    (opts.builder || this.b(x, z)).add(g, color);
    if (opts.collide !== false) {
      const flat = new Float32Array(pts.flat());
      const desc = RAPIER.ColliderDesc.convexHull(flat);
      if (desc) this.phys.addStatic(desc, { friction: opts.friction ?? 0.8, bounce: opts.bounce });
    }
    return this;
  }

  // A low-poly tree.
  tree(x, z, y = 0, kind = 0, scale = 1) {
    const b = this.b(x, z), s = scale;
    if (kind === 1) { // pine
      b.cyl(0.25 * s, 0.32 * s, 2 * s, 0x7a5032, [x, y + 1 * s, z], null, 6);
      b.cone(2.2 * s, 3.2 * s, 0x2f8f4a, [x, y + 3.2 * s, z], null, 8);
      b.cone(1.7 * s, 2.6 * s, 0x37a052, [x, y + 4.6 * s, z], null, 8);
      b.cone(1.1 * s, 2.0 * s, 0x41b45c, [x, y + 5.8 * s, z], null, 8);
    } else if (kind === 2) { // palm
      for (let i = 0; i < 5; i++) b.cyl(0.22 * s, 0.26 * s, 1.3 * s, 0xa77b4a, [x + i * 0.12 * s, y + 0.65 * s + i * 1.25 * s, z], [0, 0, -0.1], 6);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        b.box(0.7 * s, 0.08 * s, 3.2 * s, 0x3cae4a, [x + 0.6 * s + Math.sin(a) * 1.4 * s, y + 6.2 * s, z + Math.cos(a) * 1.4 * s], [0.45, a, 0, 'YXZ']);
      }
      b.sphere(0.25 * s, 0x6b4a2a, [x + 0.6 * s, y + 6.1 * s, z + 0.25 * s]);
    } else { // round leafy
      b.cyl(0.25 * s, 0.35 * s, 2.4 * s, 0x8a5a36, [x, y + 1.2 * s, z], null, 6);
      const g = [0x5cc04a, 0x4fb043, 0x6fd055][(Math.abs(x * 7 + z * 13) | 0) % 3];
      b.sphere(1.8 * s, g, [x, y + 3.6 * s, z], [1, 0.9, 1], 8);
      b.sphere(1.2 * s, g, [x + 1.0 * s, y + 3.0 * s, z + 0.4 * s], null, 7);
      b.sphere(1.2 * s, g, [x - 0.9 * s, y + 3.2 * s, z - 0.5 * s], null, 7);
    }
    this.phys.cylinder(x, y + 1.5 * s, z, 0.3 * s, 3 * s, {});
    return this;
  }

  bush(x, z, y = 0, s = 1) {
    const b = this.b(x, z);
    b.sphere(0.9 * s, 0x4fae45, [x, y + 0.5 * s, z], [1.2, 0.8, 1], 7);
    b.sphere(0.6 * s, 0x5fc050, [x + 0.6 * s, y + 0.45 * s, z + 0.3 * s], null, 6);
    return this;
  }

  rock(x, z, y = 0, s = 1) {
    const b = this.b(x, z);
    const g = new THREE.DodecahedronGeometry(s, 0);
    b.add(g, 0x9a9a92, [x, y + s * 0.3, z], [x * 0.3, z * 0.7, 0], [1, 0.7, 1.1]);
    this.phys.ball(x, y + s * 0.2, z, s * 0.75, {});
    return this;
  }

  lamp(x, z, y = 0) {
    const b = this.b(x, z);
    (this.game.lamps ||= []).push([x, y + 4.35, z]); // night glow (world/detail.js)
    b.cyl(0.08, 0.12, 4.2, 0x3b4a5a, [x, y + 2.1, z], null, 8);
    b.sphere(0.32, 0xfff4c2, [x, y + 4.35, z], null, 10);
    b.cyl(0.36, 0.2, 0.15, 0x3b4a5a, [x, y + 4.62, z], null, 10);
    this.phys.cylinder(x, y + 2.1, z, 0.12, 4.2, {});
    return this;
  }

  bench(x, z, yaw = 0, y = 0) {
    const b = this.b(x, z), c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    b.box(1.8, 0.08, 0.5, 0xb5773d, P(0, 0.48, 0), [0, yaw, 0]);
    b.box(1.8, 0.4, 0.08, 0xb5773d, P(0, 0.8, -0.24), [0, yaw, 0]);
    b.box(0.08, 0.48, 0.45, 0x444444, P(-0.8, 0.24, 0), [0, yaw, 0]);
    b.box(0.08, 0.48, 0.45, 0x444444, P(0.8, 0.24, 0), [0, yaw, 0]);
    // seat block + backrest (not one solid block, so sitters rest on the planks)
    this.phys.box(...P(0, 0.26, 0), 1.8, 0.52, 0.5, { yaw });
    this.phys.box(...P(0, 0.8, -0.24), 1.8, 0.56, 0.08, { yaw });
    // two seats (Y to sit), facing out the front; get up a step in front
    for (const lx of [-0.45, 0.45]) {
      const [sx, sy, sz] = P(lx, 0.71, 0.02), [ex, ey, ez] = P(lx, 0.75, 0.95);
      this.game.seats.push({ body: this.phys.staticBody, pos: [sx, sy, sz], yaw, kind: 'passenger', label: 'Sit', hint: 'Y Get up', exit: [ex, ey, ez], occupant: null });
    }
    return this;
  }

  fence(x0, z0, x1, z1, color = 0xffffff, h = 1.0, y = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const b = this.b(cx, cz);
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.box(0.12, h, 0.12, color, [x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t]);
    }
    b.box(0.06, 0.1, len, color, [cx, y + h * 0.8, cz], [0, yaw, 0]);
    b.box(0.06, 0.1, len, color, [cx, y + h * 0.4, cz], [0, yaw, 0]);
    this.phys.box(cx, y + h / 2, cz, 0.12, h, len, { yaw });
    return this;
  }

  // Extrudes a cross-section profile [[lz, y], ...] along local X for `len`,
  // centred at (x, y0, z) and turned by yaw. Static trimesh, double-sided.
  profile(x, y0, z, yaw, len, prof, color, opts = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, ly, lz) => [x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c];
    const verts = [], idx = [];
    for (const [lz, ly] of prof) { verts.push(...W(-len / 2, ly, lz)); verts.push(...W(len / 2, ly, lz)); }
    for (let i = 0; i < prof.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (!this.dbl) this.dbl = new Builder();
    this.dbl.add(g, color);
    if (opts.collide !== false) this.phys.trimesh(new Float32Array(verts), new Uint32Array(idx), { friction: opts.friction ?? 0.8, slippery: opts.slippery });
    // side caps (filled down to y0)
    for (const sx of [-len / 2, len / 2]) {
      const cv = [], ci = [];
      prof.forEach(([lz, ly]) => { cv.push(...W(sx, ly, lz), ...W(sx, 0, lz)); });
      for (let i = 0; i < prof.length - 1; i++) { const a = i * 2; ci.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3));
      cg.setIndex(ci); cg.computeVertexNormals();
      this.dbl.add(cg, opts.side ?? color);
    }
    return this;
  }

  finish() {
    if (this.dbl) { const m = this.dbl.mesh(matVCDouble); this.game.scene.add(m); this.dbl = null; }
    const list = this.game.staticChunks ||= [];
    for (const b of this.chunks.values()) {
      // far version: only the big pieces (walls, roofs, trunks, hulls), drawn
      // instead of the full chunk beyond game.farCull's LOD distance
      const big = b.parts.filter((g) => { if (!g.boundingSphere) g.computeBoundingSphere(); return g.boundingSphere.radius >= FAR_PART_R; });
      let far = null;
      if (big.length && big.length < b.parts.length * 0.85) {
        const fg = mergeGeometries(big, false);
        if (fg) { far = new THREE.Mesh(fg, matVC); far.castShadow = false; far.receiveShadow = false; far.visible = false; this.game.scene.add(far); }
      }
      const m = b.mesh(matVC);
      this.game.scene.add(m);
      // far culling per view (game.farCull): centre, radius, tall enough to show from afar
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      if (bb.isEmpty()) continue;
      list.push({ mesh: m, far, x: (bb.min.x + bb.max.x) / 2, z: (bb.min.z + bb.max.z) / 2, r: Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2,
        tall: bb.max.y > 20 || bb.max.y - bb.min.y > 16 });
    }
    this.chunks.clear();
  }
}
