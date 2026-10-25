// Job visuals: the floating "!" over job givers, waypoint beacons (a light
// beam + ground ring + bobbing arrow), race rings, fires and the hose spray,
// physical job items (crates, litter, sheep, a golden idol, footballs...),
// cargo carried on a player's chest (pizza boxes, parcels, cocoa) and puffs.
// Everything here is created when a job needs it and removed when it ends,
// so a world with no job running carries nothing but the givers' markers.
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { Builder } from '../mesh.js';
import { paintOver } from '../assets.js';

// ---- "!" marker -----------------------------------------------------------------------
let markerTex = null;
function markerTexture() {
  if (markerTex) return markerTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
  g.lineWidth = 7; g.strokeStyle = '#1f3a7a'; g.stroke();
  g.fillStyle = '#ffb21a'; g.strokeStyle = '#1f3a7a'; g.lineWidth = 6; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(50, 22); g.lineTo(78, 22); g.lineTo(71, 80); g.lineTo(57, 80); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.arc(64, 98, 10, 0, 7); g.fill(); g.stroke();
  markerTex = new THREE.CanvasTexture(cv);
  markerTex.colorSpace = THREE.SRGBColorSpace;
  paintOver(markerTex, 'ui/job_marker.png', (ctx, im, c) => { ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height); });
  return markerTex;
}
export function markerSprite() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), transparent: true, depthWrite: false }));
  s.scale.set(1.25, 1.25, 1);
  s.userData.noCull = true;
  s.renderOrder = 3;
  // per view: about the same size on screen at any distance, fading out when you're right there
  s.onBeforeRender = (r, sc, cam) => {
    const d = cam.position.distanceTo(s.position);
    const k = Math.min(4, 0.7 + d * 0.03);
    s.scale.set(k, k, 1);
    s.material.opacity = Math.max(0, Math.min(1, (d - 3.5) / 4));
    s.updateMatrixWorld();
  };
  return s;
}

// ---- beacons ----------------------------------------------------------------------------
const beamGeo = new THREE.CylinderGeometry(0.55, 0.9, 70, 14, 1, true).translate(0, 35, 0);
const coreGeo = new THREE.CylinderGeometry(0.16, 0.22, 70, 8, 1, true).translate(0, 35, 0);
const ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 36).rotateX(Math.PI / 2);
const arrowGeo = new THREE.ConeGeometry(0.55, 1.1, 4).rotateX(Math.PI);
export class Beacon {
  constructor(game, color = 0xffd23f) {
    this.game = game;
    this.g = new THREE.Group();
    this.g.userData.noCull = true;
    this.beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.solidMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.core = new THREE.Mesh(coreGeo, this.coreMat); this.core.renderOrder = 2;
    this.beam.add(this.core);
    this.ring = new THREE.Mesh(ringGeo, this.solidMat);
    this.arrow = new THREE.Mesh(arrowGeo, this.solidMat);
    this.beam.renderOrder = 2;
    this.g.add(this.beam, this.ring, this.arrow);
    game.scene.add(this.g);
    this.r = 3;
  }
  set(x, y, z, r = 3, opts = {}) {
    this.g.position.set(x, y, z);
    this.r = r;
    this.ring.scale.set(r, 1, r);
    this.ring.position.y = 0.15;
    this.beam.visible = opts.beam !== false;
    this.arrow.position.y = opts.arrowY ?? 3.4;
    this.g.visible = true;
  }
  color(c) { this.beamMat.color.set(c); this.solidMat.color.set(c); }
  hide() { this.g.visible = false; }
  anim(t) {
    if (!this.g.visible) return;
    this.arrow.position.y = (this.arrowBase ??= this.arrow.position.y) + Math.sin(t * 3) * 0.3;
    this.arrow.rotation.y = t * 1.6;
    this.beamMat.opacity = 0.34 + Math.sin(t * 4) * 0.08;
  }
  dispose() { this.game.scene.remove(this.g); this.beamMat.dispose(); this.solidMat.dispose(); this.coreMat.dispose(); }
}

// A big vertical hoop for checkpoint races, facing `yaw`.
export class Hoop {
  constructor(game, color = 0xff7a1a) {
    this.game = game;
    const b = new Builder();
    b.torus(1, 0.12, color, [0, 0, 0], null, 32);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.sphere(0.2, 0xffffff, [Math.cos(a), Math.sin(a), 0], null, 8); }
    this.mesh = b.mesh(undefined, { shadow: false, receive: false });
    this.mesh.userData.noCull = true;
    game.scene.add(this.mesh);
  }
  set(x, y, z, r, yaw) { this.mesh.position.set(x, y + r, z); this.mesh.scale.setScalar(r); this.mesh.rotation.set(0, yaw, 0); this.mesh.visible = true; }
  hide() { this.mesh.visible = false; }
  anim(t) { if (this.mesh.visible) this.mesh.rotation.z = Math.sin(t * 2) * 0.06; }
  dispose() { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

// ---- fire ---------------------------------------------------------------------------------
const flameGeo = new THREE.ConeGeometry(0.6, 1.8, 7).translate(0, 0.9, 0);
const smokeGeo = new THREE.IcosahedronGeometry(0.8, 0);
const flameMats = [0xff4a12, 0xff9a1a, 0xffe14a].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false }));
const smokeMat = new THREE.MeshBasicMaterial({ color: 0x55555f, transparent: true, opacity: 0.35, depthWrite: false });
export class Fire {
  constructor(game, x, y, z, size = 1) {
    this.game = game;
    this.g = new THREE.Group(); this.g.userData.noCull = true;
    this.g.position.set(x, y, z);
    this.flames = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(flameGeo, flameMats[i % 3]);
      const a = i * 2.4, r = i ? 0.55 + (i % 3) * 0.35 : 0;
      m.position.set(Math.cos(a) * r * size, 0, Math.sin(a) * r * size);
      m.userData.k = 0.6 + (i % 4) * 0.25; m.userData.ph = i * 1.3;
      this.flames.push(m); this.g.add(m);
    }
    this.smoke = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(smokeGeo, smokeMat); this.smoke.push(m); this.g.add(m); }
    this.size = size; this.level = 1;
    game.scene.add(this.g);
  }
  anim(t) {
    const L = this.level, s = this.size;
    this.g.visible = L > 0.02;
    for (const m of this.flames) {
      const k = m.userData.k * s * L * (0.8 + 0.25 * Math.sin(t * 9 + m.userData.ph));
      m.scale.set(k, k * (1 + 0.3 * Math.sin(t * 13 + m.userData.ph)), k);
    }
    this.smoke.forEach((m, i) => {
      const f = ((t * 0.45 + i / 3) % 1);
      m.position.set(Math.sin(t + i) * 0.4, 2 + f * 5 * s, Math.cos(t * 0.7 + i) * 0.4);
      m.scale.setScalar((0.6 + f * 1.6) * s * Math.max(0.3, L));
    });
  }
  dispose() { this.game.scene.remove(this.g); }
}

// A hose jet: a stretched translucent tube from a to b.
export class Spray {
  constructor(game) {
    this.game = game;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), this.mat);
    this.mesh.userData.noCull = true; this.mesh.visible = false;
    game.scene.add(this.mesh);
  }
  aim(a, b, t) {
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    this.mesh.position.set(a.x, a.y, a.z);
    this.mesh.lookAt(b.x, b.y, b.z);
    this.mesh.scale.set(1 + Math.sin(t * 30) * 0.15, 1 + Math.cos(t * 27) * 0.15, d);
    this.mesh.visible = true;
  }
  hide() { this.mesh.visible = false; }
  dispose() { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ---- puffs ----------------------------------------------------------------------------------
const puffGeo = new THREE.IcosahedronGeometry(0.35, 1);
export function puff(game, pos, color = 0xffffff, n = 10, r = 0.8) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const g = new THREE.Group(); g.userData.noCull = true;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, m = new THREE.Mesh(puffGeo, mat);
    m.position.set(pos.x + Math.sin(a) * r * 0.3, pos.y, pos.z + Math.cos(a) * r * 0.3);
    parts.push({ m, vx: Math.sin(a) * 2 * r, vz: Math.cos(a) * 2 * r, vy: 1 + Math.random() * 1.5 });
    g.add(m);
  }
  game.scene.add(g);
  let t = 0;
  const fn = (dt) => {
    t += dt;
    for (const p of parts) { p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt; p.m.scale.setScalar(0.6 + t * 2.4); }
    mat.opacity = Math.max(0, 0.9 * (1 - t / 0.7));
    if (t > 0.7 && !fn.done) {
      fn.done = true; game.scene.remove(g); mat.dispose();
      queueMicrotask(() => { const i = game.updaters.indexOf(fn); if (i >= 0) game.updaters.splice(i, 1); });
    }
  };
  game.updaters.push(fn);
}

// ---- cargo on a player's chest -----------------------------------------------------------------
const CARGO = {
  pizza(b) { for (let i = 0; i < 3; i++) { b.box(0.42, 0.07, 0.42, 0xf4ecd8, [0, i * 0.075, 0]); b.box(0.2, 0.072, 0.16, 0xd9342b, [0, i * 0.075 + 0.002, 0.05]); } },
  burger(b) { b.box(0.36, 0.2, 0.3, 0xffd23f, [0, 0, 0]); b.box(0.37, 0.05, 0.31, 0xd9342b, [0, 0.03, 0]); },
  parcel(b) { b.box(0.46, 0.34, 0.36, 0xc8955a, [0, 0, 0]); b.box(0.47, 0.06, 0.37, 0xe8d8a8, [0, 0.06, 0]); b.box(0.06, 0.35, 0.37, 0xe8d8a8, [0, 0, 0]); },
  cocoa(b) { for (const x of [-0.12, 0.12]) { b.cyl(0.07, 0.06, 0.16, 0xffffff, [x, 0.04, 0], null, 10); b.cyl(0.072, 0.072, 0.03, 0x6b3a1a, [x, 0.12, 0], null, 10); } b.box(0.42, 0.03, 0.22, 0xb07a48, [0, -0.05, 0]); },
  fossil(b) { b.capsule(0.06, 0.34, 0xf2ead2, [0, 0.02, 0], [0, 0, Math.PI / 2]); for (const s of [-1, 1]) b.sphere(0.08, 0xf2ead2, [s * 0.22, 0.02, 0], null, 8); },
};
export function cargoMesh(kind) {
  const b = new Builder();
  (CARGO[kind] || CARGO.parcel)(b);
  const m = b.mesh(undefined, { shadow: true, receive: false });
  return m;
}
// Shows `kind` held in front of the player's chest (null removes it).
export function setCargo(p, kind) {
  if (p.missionCargo?.kind === kind) return;
  if (p.missionCargo) { p.missionCargo.mesh.parent?.remove(p.missionCargo.mesh); p.missionCargo.mesh.geometry.dispose(); p.missionCargo = null; }
  if (!kind || !p.parts?.chest?.mesh) return;
  const m = cargoMesh(kind);
  m.position.set(0, 0.02, 0.36);
  p.parts.chest.mesh.add(m);
  p.missionCargo = { kind, mesh: m };
}

// ---- physical job items ---------------------------------------------------------------------------
const C = RAPIER.ColliderDesc;
export const ITEMS = {
  crate: { h: 0.4, make(b) { b.rbox(0.8, 0.8, 0.8, 0.05, 0xd9a35a, [0, 0, 0]); b.box(0.82, 0.1, 0.82, 0x9a6a3a, [0, 0.25, 0]); b.box(0.82, 0.1, 0.82, 0x9a6a3a, [0, -0.25, 0]); b.box(0.1, 0.6, 0.83, 0x9a6a3a, [0, 0, 0]); }, desc: () => C.cuboid(0.4, 0.4, 0.4).setMass(9) },
  girder: { h: 0.15, make(b) { b.box(2.4, 0.08, 0.36, 0xd9542b, [0, 0.11, 0]); b.box(2.4, 0.08, 0.36, 0xd9542b, [0, -0.11, 0]); b.box(2.4, 0.22, 0.07, 0xc8442b, [0, 0, 0]); }, desc: () => C.cuboid(1.2, 0.15, 0.18).setMass(12) },
  can: { h: 0.11, make(b) { b.cyl(0.07, 0.07, 0.22, 0xe8322b, [0, 0, 0], null, 10); b.cyl(0.071, 0.071, 0.05, 0xffffff, [0, 0.03, 0], null, 10); }, desc: () => C.cylinder(0.11, 0.08).setMass(0.4), throwSpeed: 7 },
  bottle: { h: 0.16, make(b) { b.cyl(0.07, 0.07, 0.24, 0x55d85a, [0, -0.04, 0], null, 10); b.cyl(0.03, 0.05, 0.1, 0x55d85a, [0, 0.12, 0], null, 8); }, desc: () => C.cylinder(0.16, 0.08).setMass(0.5), throwSpeed: 7 },
  bag: { h: 0.18, make(b) { b.sphere(0.2, 0xf2f2f2, [0, 0, 0], [1, 0.9, 0.8], 10); b.cone(0.07, 0.12, 0xf2f2f2, [0, 0.2, 0], null, 6); }, desc: () => C.ball(0.18).setMass(0.5), throwSpeed: 7 },
  idol: { h: 0.32, make(b) { b.box(0.34, 0.3, 0.3, 0xe8b820, [0, -0.15, 0]); b.sphere(0.2, 0xffd23f, [0, 0.14, 0], [1, 1.1, 1], 12); for (const s of [-1, 1]) b.sphere(0.05, 0x3fe0d0, [s * 0.07, 0.18, 0.17], null, 6); b.box(0.12, 0.03, 0.03, 0x8a5a10, [0, 0.07, 0.19]); }, desc: () => C.cuboid(0.17, 0.32, 0.16).setMass(4) },
  football: { h: 0.45, make(b) { b.sphere(0.45, 0xffffff, [0, 0, 0], null, 14); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.sphere(0.14, 0x222228, [Math.cos(a) * 0.36, Math.sin(a) * 0.26, Math.sin(a + 1) * 0.15], [1, 1, 0.45], 6); } }, desc: () => C.ball(0.45).setMass(0.5).setRestitution(0.7).setFriction(0.8), opts: { angDamp: 0.5, linDamp: 0.2 }, throwSpeed: 13 },
  sheep: { h: 0.42, make(b) {
    for (const [x, y, z] of [[0, 0.05, 0], [0.18, 0.12, 0.15], [-0.18, 0.12, 0.15], [0.18, 0.1, -0.18], [-0.18, 0.1, -0.18], [0, 0.22, 0]]) b.sphere(0.3, 0xf8f6ee, [x, y, z], null, 10);
    b.sphere(0.17, 0x2a2a33, [0, 0.12, 0.42], [0.85, 1, 1.1], 10);
    for (const s of [-1, 1]) { b.sphere(0.04, 0xffffff, [s * 0.07, 0.18, 0.56], null, 6); b.box(0.12, 0.04, 0.06, 0x2a2a33, [s * 0.17, 0.2, 0.4], [0, 0, s * 0.4]); }
    for (const [x, z] of [[0.17, 0.2], [-0.17, 0.2], [0.17, -0.2], [-0.17, -0.2]]) b.cyl(0.045, 0.045, 0.3, 0x2a2a33, [x, -0.28, z], null, 6);
  }, desc: () => C.ball(0.42).setMass(14).setFriction(0.25), opts: { angDamp: 6, linDamp: 0.4 }, animal: true },
};

// Spawns a job item; returns { kind, body, mesh, obj }.
export function spawnItem(game, kind, x, y, z, yaw = 0) {
  const d = ITEMS[kind];
  const b = new Builder(); d.make(b);
  const mesh = b.mesh();
  const rot = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
  const obj = game.physics.dynamic({ x, y: y + d.h + 0.05, z }, [d.desc()], mesh, { rot, kind: 'jobitem', ...(d.opts || {}) });
  mesh.userData.noCull = true;
  game.scene.add(mesh);
  return { kind, body: obj.body, mesh, obj, animal: !!d.animal };
}

export function removeItem(game, it) {
  if (it.removed) return;
  it.removed = true;
  const ph = game.physics;
  if (game.throwables) { const k = game.throwables.findIndex((t) => t.body === it.body); if (k >= 0) game.throwables.splice(k, 1); }
  for (const p of [...game.players, ...(game.npcs?.list || [])]) for (const h of ['L', 'R']) if (p.hands?.[h]?.body === it.body) p.releaseHand(h);
  for (const c of it.obj.colliders) ph.handleOwner.delete(c.handle);
  const i = ph.objects.indexOf(it.obj); if (i >= 0) ph.objects.splice(i, 1);
  if (it.obj.rec) ph.untrack(it.obj.rec);
  ph.world.removeRigidBody(it.body);
  game.scene.remove(it.mesh);
  it.mesh.geometry.dispose();
}
