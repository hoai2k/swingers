// Static collider merge. Rapier pays for every collider on every step (broad
// phase upkeep and the scene-query tree refit), even when nothing near it
// moves: ~8,900 separate static boxes and cylinders cost several ms per step.
// Here the thin ones (walls, fences, slabs, floors, poles, trunks) are rebuilt
// as one triangle mesh per area and material. A box becomes its exact 12
// triangles, so walls stay tight to what is drawn; cylinders become 16-sided
// prisms with their corners on the radius (the drawn ones have 6-12 sides).
//
// It is redoable: nothing is baked. Every load merges whatever the world
// build made, so moving or adding buildings in the code needs nothing here.
// At runtime `game.staticMerge` keeps each area's shape list and rebuilds
// only the areas that change:
//   merge()                 fold static colliders added since (lazily built
//                           scenery, a building placed in play) into their areas
//   removeIn(x0, z0, x1, z1, filter?)  take merged shapes whose centre is in that
//                           box out (filter(rec) => true to remove), e.g. before
//                           moving or demolishing a building, then rebuild
//   shapesIn(x0, z0, x1, z1)  the merged shape records there
//   unmerge(x0, z0, x1, z1) put the shapes there back as separate colliders
//                           (to move them as they are, then merge() again)
//   insideAt(p, margin)     the merged box / cylinder a point is inside (deeper than
//                           margin), or null: a triangle mesh is hollow, so a limb pushed
//                           through one face stays stuck inside; the player pulls it out
//                           (player.unstickArms) with exitToward(rec, p, from)
//
// Kept as they are:
//  - big solid blocks (every side >= SOLID m): a triangle mesh is hollow, and
//    clearance checks (phone vehicle spawns, exits) must still find them;
//  - balls, convex hulls and existing meshes (rocks, ramps, slopes).
// Build-time queries (coins, presents, booths, the ground under things) all
// run before the first merge, against the original colliders.
// `physics.staticShapes` lists every merged box / cylinder (map.js paints them).
import * as THREE from 'three';
import { RAPIER } from './physics.js';

const AREA = 96;    // metres: merged meshes per area (keeps each mesh's bounds local)
const SOLID = 1.2;  // a box with every full side at least this long stays a box
const SEG = 16;     // cylinder sides

const q = new THREE.Quaternion(), v = new THREE.Vector3(), p = new THREE.Vector3(), p2 = new THREE.Vector3();
const CELL = 8;     // metres: insideAt's lookup grid

export function mergeStatics(game) {
  const m = game.staticMerge ||= new StaticMerge(game);
  m.merge();
  return m;
}

class StaticMerge {
  constructor(game) {
    this.game = game;
    this.ph = game.physics;
    this.groups = new Map(); // key -> { recs, collider, mat }
    this.handles = new Set(); // the merged mesh colliders
  }

  get stats() { let shapes = 0; for (const g of this.groups.values()) shapes += g.recs.length; return { merged: shapes, meshes: this.groups.size }; }

  // Fold every separate thin static box / cylinder into its area mesh.
  merge() {
    const ph = this.ph, W = ph.world, sb = ph.staticBody, T = RAPIER.ShapeType;
    const dirty = new Set(), drop = [];
    W.forEachCollider((c) => {
      const par = c.parent();
      if (!par || par.handle !== sb.handle || c.isSensor() || this.isMerged(c.handle)) return;
      const ty = c.shapeType();
      if (ty !== T.Cuboid && ty !== T.Cylinder) return;
      const t = c.translation(), r = c.rotation();
      let rec;
      if (ty === T.Cuboid) {
        const he = c.halfExtents();
        if (Math.min(he.x, he.y, he.z) * 2 >= SOLID) return;
        rec = { type: 'box', x: t.x, y: t.y, z: t.z, he: { x: he.x, y: he.y, z: he.z }, rot: { x: r.x, y: r.y, z: r.z, w: r.w } };
      } else {
        const rr = c.radius(), hh = c.halfHeight();
        if (rr * 2 >= SOLID && hh * 2 >= SOLID) return;
        rec = { type: 'cyl', x: t.x, y: t.y, z: t.z, r: rr, hh, rot: { x: r.x, y: r.y, z: r.z, w: r.w } };
      }
      const bounce = ph.bouncy.get(c.handle);
      rec.mat = { groups: c.collisionGroups(), solver: c.solverGroups(), friction: c.friction(), restitution: c.restitution(),
        fcr: c.frictionCombineRule(), rcr: c.restitutionCombineRule(), bounce, slip: ph.slippery.has(c.handle) };
      if (bounce) rec.bounce = bounce;
      dirty.add(this.add(rec));
      drop.push(c);
    });
    for (const c of drop) { ph.bouncy.delete(c.handle); ph.slippery.delete(c.handle); W.removeCollider(c, false); }
    this.rebuild(dirty);
    return drop.length;
  }

  add(rec) {
    const m = rec.mat, key = [Math.floor(rec.x / AREA), Math.floor(rec.z / AREA), m.groups, m.solver, m.friction, m.restitution, m.fcr, m.rcr, m.bounce ?? '', m.slip ? 1 : 0].join('|');
    let g = this.groups.get(key);
    if (!g) { g = { key, recs: [], collider: null, mat: m }; this.groups.set(key, g); }
    g.recs.push(rec);
    return g;
  }

  isMerged(handle) { return this.handles.has(handle); }

  shapesIn(x0, z0, x1, z1) {
    const out = [];
    for (const g of this.groups.values()) for (const r of g.recs) if (r.x >= x0 && r.x <= x1 && r.z >= z0 && r.z <= z1) out.push(r);
    return out;
  }

  // Take merged shapes out (centre inside the box, and filter(rec) if given); returns them.
  removeIn(x0, z0, x1, z1, filter = null) {
    const dirty = new Set(), out = [];
    for (const g of this.groups.values()) {
      const keep = [];
      for (const r of g.recs) {
        if (r.x >= x0 && r.x <= x1 && r.z >= z0 && r.z <= z1 && (!filter || filter(r))) { out.push(r); dirty.add(g); } else keep.push(r);
      }
      g.recs = keep;
    }
    this.rebuild(dirty);
    return out;
  }

  // Put merged shapes back as separate static colliders (move them, then merge() again).
  unmerge(x0, z0, x1, z1, filter = null) {
    const ph = this.ph, made = [];
    for (const r of this.removeIn(x0, z0, x1, z1, filter)) {
      const d = r.type === 'box' ? RAPIER.ColliderDesc.cuboid(r.he.x, r.he.y, r.he.z) : RAPIER.ColliderDesc.cylinder(r.hh, r.r);
      d.setTranslation(r.x, r.y, r.z).setRotation(r.rot).setCollisionGroups(r.mat.groups).setSolverGroups(r.mat.solver)
        .setFriction(r.mat.friction).setRestitution(r.mat.restitution).setFrictionCombineRule(r.mat.fcr).setRestitutionCombineRule(r.mat.rcr);
      const c = ph.world.createCollider(d, ph.staticBody);
      if (r.mat.bounce) ph.bouncy.set(c.handle, r.mat.bounce);
      if (r.mat.slip) ph.slippery.add(c.handle);
      made.push(c);
    }
    ph.world.updateSceneQueries?.();
    return made;
  }

  // Rebuild the meshes of the given groups from their shape lists.
  rebuild(dirty) {
    const ph = this.ph, W = ph.world;
    for (const g of dirty) {
      if (g.collider) {
        this.handles.delete(g.collider.handle); ph.bouncy.delete(g.collider.handle); ph.slippery.delete(g.collider.handle);
        W.removeCollider(g.collider, false); g.collider = null;
      }
      if (!g.recs.length) { this.groups.delete(g.key); continue; }
      const V = [], I = [];
      for (const r of g.recs) triangles(r, V, I);
      const m = g.mat;
      const desc = RAPIER.ColliderDesc.trimesh(new Float32Array(V), new Uint32Array(I))
        .setCollisionGroups(m.groups).setSolverGroups(m.solver).setFriction(m.friction).setRestitution(m.restitution)
        .setFrictionCombineRule(m.fcr).setRestitutionCombineRule(m.rcr);
      g.collider = W.createCollider(desc, ph.staticBody);
      this.handles.add(g.collider.handle);
      if (m.bounce) ph.bouncy.set(g.collider.handle, m.bounce);
      if (m.slip) ph.slippery.add(g.collider.handle);
    }
    ph.staticShapes = [...this.groups.values()].flatMap((g) => g.recs);
    this.index();
    W.updateSceneQueries?.();
  }

  // An 8 m grid of the merged shapes (by bounding radius) for insideAt.
  index() {
    const cells = this.cells = new Map();
    for (const r of this.ph.staticShapes) {
      const rad = r.type === 'box' ? Math.hypot(r.he.x, r.he.y, r.he.z) : Math.hypot(r.r, r.hh);
      r.q ||= new THREE.Quaternion(r.rot.x, r.rot.y, r.rot.z, r.rot.w);
      r.qi ||= r.q.clone().invert();
      for (let i = Math.floor((r.x - rad) / CELL); i <= Math.floor((r.x + rad) / CELL); i++) {
        for (let j = Math.floor((r.z - rad) / CELL); j <= Math.floor((r.z + rad) / CELL); j++) {
          const k = i * 4096 + j;
          let l = cells.get(k); if (!l) cells.set(k, l = []);
          l.push(r);
        }
      }
    }
  }

  insideAt(p, margin = 0.02) {
    const l = this.cells?.get(Math.floor(p.x / CELL) * 4096 + Math.floor(p.z / CELL));
    if (!l) return null;
    for (const r of l) {
      v.set(p.x - r.x, p.y - r.y, p.z - r.z).applyQuaternion(r.qi);
      if (r.type === 'box') {
        if (Math.abs(v.x) < r.he.x - margin && Math.abs(v.y) < r.he.y - margin && Math.abs(v.z) < r.he.z - margin) return r;
      } else if (Math.abs(v.y) < r.hh - margin && Math.hypot(v.x, v.z) < r.r - margin) return r;
    }
    return null;
  }

  // Where to put a point inside `rec` so it is just outside: along the line toward `from`
  // (a point outside, e.g. the chest), at the face that line leaves through (+ 6 cm).
  exitToward(rec, p, from, out) {
    const a = v.set(p.x - rec.x, p.y - rec.y, p.z - rec.z).applyQuaternion(rec.qi).clone();
    const d = p2.set(from.x - p.x, from.y - p.y, from.z - p.z).applyQuaternion(rec.qi);
    const len = d.length() || 1; d.multiplyScalar(1 / len);
    let tExit = Infinity;
    if (rec.type === 'box') {
      for (const ax of ['x', 'y', 'z']) {
        if (Math.abs(d[ax]) < 1e-6) continue;
        const t = ((d[ax] > 0 ? rec.he[ax] : -rec.he[ax]) - a[ax]) / d[ax];
        if (t >= 0) tExit = Math.min(tExit, t);
      }
    } else {
      if (Math.abs(d.y) > 1e-6) tExit = ((d.y > 0 ? rec.hh : -rec.hh) - a.y) / d.y;
      const A = d.x * d.x + d.z * d.z, B = 2 * (a.x * d.x + a.z * d.z), Cc = a.x * a.x + a.z * a.z - rec.r * rec.r;
      if (A > 1e-9) tExit = Math.min(tExit, (-B + Math.sqrt(Math.max(0, B * B - 4 * A * Cc))) / (2 * A));
    }
    if (!Number.isFinite(tExit)) tExit = 0;
    a.addScaledVector(d, tExit + 0.06).applyQuaternion(rec.q);
    return out.set(a.x + rec.x, a.y + rec.y, a.z + rec.z);
  }
}

// A shape's triangles (outward wound) appended to V / I.
function triangles(rec, V, I) {
  const o = V.length / 3, r = rec.rot;
  q.set(r.x, r.y, r.z, r.w);
  const put = (x, y, z) => { v.set(x, y, z).applyQuaternion(q).add(p.set(rec.x, rec.y, rec.z)); V.push(v.x, v.y, v.z); };
  if (rec.type === 'box') {
    const { x: a, y: b, z: d } = rec.he;
    for (const [sx, sy, sz] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) put(sx * a, sy * b, sz * d);
    for (const f of BOX_TRIS) I.push(o + f[0], o + f[1], o + f[2]);
  } else {
    const { r: rr, hh } = rec;
    for (let i = 0; i < SEG; i++) { const a = i / SEG * Math.PI * 2; put(Math.cos(a) * rr, -hh, Math.sin(a) * rr); put(Math.cos(a) * rr, hh, Math.sin(a) * rr); }
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG, b0 = o + i * 2, b1 = o + j * 2;
      I.push(b0, b0 + 1, b1, b1, b0 + 1, b1 + 1);  // side
      if (i > 0 && i < SEG - 1) {                   // caps (fans from vertex 0)
        I.push(o, b1, b0);                          // bottom
        I.push(o + 1, b0 + 1, b1 + 1);              // top
      }
    }
  }
}

// 8 corners: 0-3 at -z (bl, br, tr, tl), 4-7 at +z
const BOX_TRIS = [
  [0, 2, 1], [0, 3, 2], // -z
  [4, 5, 6], [4, 6, 7], // +z
  [0, 1, 5], [0, 5, 4], // -y
  [3, 6, 2], [3, 7, 6], // +y
  [0, 4, 7], [0, 7, 3], // -x
  [1, 2, 6], [1, 6, 5], // +x
];
