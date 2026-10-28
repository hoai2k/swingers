// Fences you can knock over. kit.fence() builds every fence through here: each fence is cut
// into sections (one post + two rails, ~1.5 m) drawn as two InstancedMeshes (posts, rails) and
// each section has its own thin static box, which the static merge folds into its area mesh
// like any other (no extra colliders while they stand). Every physics step, a vehicle moving
// faster than BREAK_V whose chassis boxes overlap a section, or a player flung faster than
// FLUNG_V into one, knocks it over: its box is taken out of the merge (staticMerge.removeIn),
// its instances are hidden and a loose fence panel (a prop: post + rails, ~10 kg) flies off with
// the hit. Knocked sections stand up again (and their panel goes) after REPAIR s with nobody
// within REPAIR_R m. At most MAX_PIECES panels lie about; the oldest unheld one goes first.
import * as THREE from 'three';
import { RAPIER, yawQuat } from '../physics.js';
import { Builder, matVC } from '../mesh.js';

const SECTION = 1.5, POST = 0.12, RAIL_T = 0.06, RAIL_H = 0.1;
const BREAK_V = 3, FLUNG_V = 6, REPAIR = 120, REPAIR_R = 50, MAX_PIECES = 50, CELL = 16;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _l = new THREE.Vector3(), _iq = new THREE.Quaternion();

export class Fences {
  constructor(game) {
    this.game = game;
    this.sections = [];
    this.grid = new Map();
    this.pieces = [];
  }

  // a straight fence from (x0, z0) to (x1, z1), h tall, standing on y
  add(x0, z0, x1, z1, color = 0xffffff, h = 1.0, y = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / SECTION)), L = len / n;
    for (let i = 0; i < n; i++) {
      const ax = x0 + (x1 - x0) * i / n, az = z0 + (z1 - z0) * i / n, bx = x0 + (x1 - x0) * (i + 1) / n, bz = z0 + (z1 - z0) * (i + 1) / n;
      const s = { ax, az, bx, bz, cx: (ax + bx) / 2, cz: (az + bz) / 2, y, h, L, yaw, color, last: i === n - 1, broken: 0, piece: null };
      s.cy = y + h / 2;
      this.collide(s);
      this.sections.push(s);
      const k = this.key(s.cx, s.cz);
      (this.grid.get(k) || this.grid.set(k, []).get(k)).push(s);
    }
  }
  key(x, z) { return Math.floor(x / CELL) * 100003 + Math.floor(z / CELL); }
  collide(s) { this.game.physics.box(s.cx, s.cy, s.cz, POST, s.h, s.L, { yaw: s.yaw }); }

  // after the world build: the meshes, the per-step checks
  finish() {
    const S = this.sections, game = this.game;
    if (!S.length || this.posts) return;
    const mat = new THREE.MeshLambertMaterial();
    const postG = new THREE.BoxGeometry(POST, 1, POST).translate(0, 0.5, 0);
    const railG = new THREE.BoxGeometry(RAIL_T, RAIL_H, 1);
    const posts = this.posts = new THREE.InstancedMesh(postG, mat, S.length + S.filter((s) => s.last).length);
    const rails = this.rails = new THREE.InstancedMesh(railG, mat, S.length * 2);
    let pi = 0;
    S.forEach((s, i) => {
      _c.set(s.color);
      s.post = [pi]; this.postAt(pi++, s.ax, s.az, s);
      if (s.last) { s.post.push(pi); this.postAt(pi++, s.bx, s.bz, s); }
      for (const p of s.post) posts.setColorAt(p, _c);
      s.rail = [i * 2, i * 2 + 1];
      this.railsOf(s);
      rails.setColorAt(i * 2, _c); rails.setColorAt(i * 2 + 1, _c);
    });
    for (const m of [posts, rails]) {
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.userData.noCull = true; m.name = 'fences';
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      game.scene.add(m);
    }
    game.steppers.push(() => this.step());
    let tk = 0;
    game.updaters.push((dt, t) => { if ((tk += dt) > 2) { tk = 0; this.repair(t); } });
  }
  postAt(i, x, z, s) { this.posts.setMatrixAt(i, _m.compose(_p.set(x, s.y, z), _q.identity(), _s.set(1, s.h, 1))); }
  railsOf(s) {
    _q.setFromAxisAngle(_p.set(0, 1, 0), s.yaw);
    s.rail.forEach((r, k) => this.rails.setMatrixAt(r, _m.compose(_p.set(s.cx, s.y + s.h * (k ? 0.4 : 0.8), s.cz), _q, _s.set(1, 1, s.L))));
  }

  // ---- knocking over ---------------------------------------------------------------------------
  near(x, z, r, fn) {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const s of this.grid.get(i * 100003 + j) || []) if (!s.broken) fn(s);
  }
  step() {
    const game = this.game;
    for (const v of game.vehicles) {
      const b = v.body;
      if (!b || !b.isEnabled() || b.isSleeping()) continue;
      const lv = b.linvel(), sp = Math.hypot(lv.x, lv.z);
      if (sp < BREAK_V) continue;
      const t = b.translation();
      this.near(t.x, t.z, 6, (s) => {
        // (looking ahead two steps: the hit itself would stop it dead within one)
        const ahead = 0.12 + sp * 2 / 60;
        for (let i = 0; i < b.numColliders(); i++) {
          const c = b.collider(i);
          if (c.isSensor() || !this.boxHits(c, s, ahead)) continue;
          this.knock(s, lv, sp); break;
        }
      });
    }
    for (const p of game.players) {
      const c = p.chest?.translation(), lv = p.chest?.linvel();
      if (!c || p.seat) continue;
      const sp = Math.hypot(lv.x, lv.y, lv.z);
      if (sp < FLUNG_V) continue;
      this.near(c.x, c.z, 2, (s) => { if (c.y > s.y - 0.2 && c.y < s.y + s.h + 0.4 && segDist(c.x, c.z, s) < 0.45) this.knock(s, lv, sp); });
    }
  }
  // does a cuboid collider (inflated a little) touch this section? (three points along it)
  boxHits(c, s, ahead) {
    const T = RAPIER.ShapeType, ty = c.shapeType(), t = c.translation(), r = c.rotation();
    let he;
    if (ty === T.Cuboid || ty === T.RoundCuboid) { const e = c.halfExtents(), rr = ty === T.RoundCuboid ? c.roundRadius() : 0; he = { x: e.x + rr, y: e.y + rr, z: e.z + rr }; }
    else { const R = ty === T.Ball ? c.radius() : 1; he = { x: R, y: R, z: R }; }   // anything else: about a metre round
    _iq.set(r.x, r.y, r.z, r.w).invert();
    for (const k of [0, 0.25, 0.5, 0.75, 1]) for (const fy of [0.35, 0.85]) {
      _l.set(s.ax + (s.bx - s.ax) * k - t.x, s.y + s.h * fy - t.y, s.az + (s.bz - s.az) * k - t.z).applyQuaternion(_iq);
      if (Math.abs(_l.x) < he.x + ahead && Math.abs(_l.y) < he.y + 0.1 && Math.abs(_l.z) < he.z + ahead) return true;
    }
    return false;
  }
  knock(s, v, sp) {
    const game = this.game, ph = game.physics;
    s.broken = game.time || performance.now() / 1000;
    // out of the merged static mesh (or, before the first merge, its own collider)
    const eq = (r) => Math.abs(r.x - s.cx) < 0.02 && Math.abs(r.z - s.cz) < 0.02 && Math.abs(r.y - s.cy) < 0.05;
    if (game.staticMerge) game.staticMerge.removeIn(s.cx - 0.05, s.cz - 0.05, s.cx + 0.05, s.cz + 0.05, eq);
    for (const p of s.post) this.posts.setMatrixAt(p, _zero);
    for (const r of s.rail) this.rails.setMatrixAt(r, _zero);
    this.posts.instanceMatrix.needsUpdate = true; this.rails.instanceMatrix.needsUpdate = true;
    // a loose panel in its place, flying off with the hit
    const L = s.L, h = s.h, rot = yawQuat(s.yaw);
    const descs = [RAPIER.ColliderDesc.cuboid(POST / 2, h / 2, POST / 2).setTranslation(0, 0, -L / 2).setDensity(300).setFriction(0.7),
      RAPIER.ColliderDesc.cuboid(RAIL_T / 2, RAIL_H / 2, L / 2).setTranslation(0, h * 0.3, 0).setDensity(300).setFriction(0.7),
      RAPIER.ColliderDesc.cuboid(RAIL_T / 2, RAIL_H / 2, L / 2).setTranslation(0, -h * 0.1, 0).setDensity(300).setFriction(0.7)];
    const b = new Builder();
    b.box(POST, h, POST, s.color, [0, 0, -L / 2]);
    b.box(RAIL_T, RAIL_H, L, s.color, [0, h * 0.3, 0]);
    b.box(RAIL_T, RAIL_H, L, s.color, [0, -h * 0.1, 0]);
    const mesh = b.mesh(matVC); mesh.castShadow = true;
    game.scene.add(mesh);
    const o = ph.dynamic({ x: s.cx, y: s.cy, z: s.cz }, descs, mesh, { rot, kind: 'fence' });
    const k = Math.min(1, 0.6 + sp * 0.02);
    o.body.setLinvel({ x: v.x * k, y: 1.5 + sp * 0.15, z: v.z * k }, true);
    o.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 6 }, true);
    s.piece = o; o.section = s;
    this.pieces.push(o);
    game.audio?.play('thud', { x: s.cx, y: s.cy, z: s.cz }, Math.min(1.2, 0.4 + sp * 0.05));
    if (this.pieces.length > MAX_PIECES) {
      const i = this.pieces.findIndex((q) => !held(game, q.body));
      if (i >= 0) { const q = this.pieces.splice(i, 1)[0]; this.drop(q); q.section.piece = null; }
    }
  }
  drop(o) {
    const ph = this.game.physics;
    if (o.rec) ph.untrack(o.rec);
    const i = ph.objects.indexOf(o); if (i >= 0) ph.objects.splice(i, 1);
    for (const c of o.colliders) ph.handleOwner.delete(c.handle);
    ph.world.removeRigidBody(o.body);
    this.game.scene.remove(o.mesh); o.mesh.geometry.dispose();
  }
  // stand knocked sections up again once nobody is about
  repair(t) {
    let merge = false;
    for (const s of this.sections) {
      if (!s.broken || t - s.broken < REPAIR) continue;
      if (this.game.players.some((p) => { const c = p.chest.translation(); return (c.x - s.cx) ** 2 + (c.z - s.cz) ** 2 < REPAIR_R * REPAIR_R; })) continue;
      if (s.piece && held(this.game, s.piece.body)) continue;
      if (s.piece) { this.drop(s.piece); this.pieces.splice(this.pieces.indexOf(s.piece), 1); s.piece = null; }
      s.broken = 0;
      this.collide(s); merge = true;
      for (const p of s.post) this.postAt(p, p === s.post[0] ? s.ax : s.bx, p === s.post[0] ? s.az : s.bz, s);
      this.railsOf(s);
      this.posts.instanceMatrix.needsUpdate = true; this.rails.instanceMatrix.needsUpdate = true;
    }
    if (merge) this.game.staticMerge?.merge();
  }
}

function segDist(x, z, s) {
  const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (l2 || 1)));
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
}
function held(game, body) { return game.players.some((p) => p.hands.L.body === body || p.hands.R.body === body); }
