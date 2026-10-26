// Static collider merge, run once after the world is built. Rapier pays for
// every collider on every step (broad phase upkeep and the scene-query tree
// refit), even when nothing near it moves: ~8,900 separate static boxes and
// cylinders cost several ms per step. Here the thin ones (walls, fences,
// slabs, floors, poles, trunks) are rebuilt as one triangle mesh per area
// and material. A box becomes its exact 12 triangles, so walls stay tight to
// what is drawn; cylinders become 16-sided prisms with their corners on the
// radius (the drawn ones have 6-12 sides).
//
// Kept as they are:
//  - big solid blocks (every side >= SOLID m): a triangle mesh is hollow, and
//    clearance checks (phone vehicle spawns, exits) must still find them;
//  - balls, convex hulls and existing meshes (rocks, ramps, slopes);
//  - colliders added after the merge (lazily built scenery).
// Build-time queries (coins, presents, booths, the ground under things) all
// run before it, against the original colliders.
// `physics.staticShapes` keeps a description of every merged box / cylinder
// for the map picture (map.js paintStatics).
import * as THREE from 'three';
import { RAPIER } from './physics.js';

const AREA = 96;    // metres: merged meshes per area (keeps each mesh's bounds local)
const SOLID = 1.2;  // a box with every full side at least this long stays a box
const SEG = 16;     // cylinder sides

export function mergeStatics(game) {
  const ph = game.physics, W = ph.world, sb = ph.staticBody;
  const groups = new Map();
  const shapes = ph.staticShapes ||= [];
  const drop = [];
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), p = new THREE.Vector3();
  const T = RAPIER.ShapeType;
  W.forEachCollider((c) => {
    const par = c.parent();
    if (!par || par.handle !== sb.handle || c.isSensor()) return;
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
    const bounce = ph.bouncy.get(c.handle), slip = ph.slippery.has(c.handle);
    const key = [Math.floor(t.x / AREA), Math.floor(t.z / AREA), c.collisionGroups(), c.solverGroups(), c.friction(), c.restitution(),
      c.frictionCombineRule(), c.restitutionCombineRule(), bounce ?? '', slip ? 1 : 0].join('|');
    let gr = groups.get(key);
    if (!gr) {
      gr = { V: [], I: [], bounce, slip, groups: c.collisionGroups(), solver: c.solverGroups(), friction: c.friction(), restitution: c.restitution(),
        fcr: c.frictionCombineRule(), rcr: c.restitutionCombineRule() };
      groups.set(key, gr);
    }
    if (bounce) rec.bounce = bounce;
    shapes.push(rec);
    // triangles, outward wound
    q.set(r.x, r.y, r.z, r.w);
    const o = gr.V.length / 3;
    const put = (x, y, z) => { v.set(x, y, z).applyQuaternion(q).add(p.set(t.x, t.y, t.z)); gr.V.push(v.x, v.y, v.z); };
    if (rec.type === 'box') {
      const { x: a, y: b, z: d } = rec.he;
      for (const [sx, sy, sz] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) put(sx * a, sy * b, sz * d);
      for (const f of BOX_TRIS) gr.I.push(o + f[0], o + f[1], o + f[2]);
    } else {
      const { r: rr, hh } = rec;
      for (let i = 0; i < SEG; i++) { const a = i / SEG * Math.PI * 2; put(Math.cos(a) * rr, -hh, Math.sin(a) * rr); put(Math.cos(a) * rr, hh, Math.sin(a) * rr); }
      for (let i = 0; i < SEG; i++) {
        const j = (i + 1) % SEG, b0 = o + i * 2, b1 = o + j * 2;
        gr.I.push(b0, b0 + 1, b1, b1, b0 + 1, b1 + 1);        // side
        if (i > 0 && i < SEG - 1) {                             // caps (fans from vertex 0)
          gr.I.push(o, b1, b0);                                 // bottom
          gr.I.push(o + 1, b0 + 1, b1 + 1);                     // top
        }
      }
    }
    drop.push(c);
  });
  for (const c of drop) { ph.bouncy.delete(c.handle); ph.slippery.delete(c.handle); W.removeCollider(c, false); }
  let made = 0;
  for (const gr of groups.values()) {
    const desc = RAPIER.ColliderDesc.trimesh(new Float32Array(gr.V), new Uint32Array(gr.I));
    desc.setCollisionGroups(gr.groups).setSolverGroups(gr.solver)
      .setFriction(gr.friction).setRestitution(gr.restitution)
      .setFrictionCombineRule(gr.fcr).setRestitutionCombineRule(gr.rcr);
    const c = W.createCollider(desc, sb);
    if (gr.bounce) ph.bouncy.set(c.handle, gr.bounce);
    if (gr.slip) ph.slippery.add(c.handle);
    made++;
  }
  W.updateSceneQueries?.();
  return { merged: drop.length, meshes: made };
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
