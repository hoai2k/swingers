// Meshes for flying and stuck projectiles, pooled by type and keyed by id.
import { THREE } from './util.js';
import { mat } from './visual.js';
import { PROJ_TYPES } from './battle.js';

function build(type) {
  const g = new THREE.Group();
  const m = (geo, mt, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  switch (type) {
    case 'arrow':
      m(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4), mat('#8b5a2b'));
      m(new THREE.ConeGeometry(0.03, 0.09, 4), mat('#9c9c9c'), 0, 0.42, 0);
      m(new THREE.BoxGeometry(0.06, 0.12, 0.005), mat('#f2f2f2'), 0, -0.34, 0);
      m(new THREE.BoxGeometry(0.005, 0.12, 0.06), mat('#f2f2f2'), 0, -0.34, 0);
      break;
    case 'spear':
      m(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5), mat('#8b5a2b'));
      m(new THREE.ConeGeometry(0.05, 0.25, 5), mat('#9c9c9c'), 0, 0.95, 0);
      break;
    case 'hay': {
      m(new THREE.BoxGeometry(0.75, 0.55, 0.55), mat('#e2c35a'));
      const b = mat('#a0782a');
      m(new THREE.BoxGeometry(0.06, 0.57, 0.57), b, 0.2, 0, 0);
      m(new THREE.BoxGeometry(0.06, 0.57, 0.57), b, -0.2, 0, 0);
      break;
    }
    case 'potion':
      m(new THREE.SphereGeometry(0.12, 10, 8), mat('#7be05a', { emissive: '#1a5a10' }));
      m(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 6), mat('#cfe8d0'), 0, 0.14, 0);
      break;
    case 'bomb':
      m(new THREE.SphereGeometry(0.16, 12, 10), mat('#222222'));
      m(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 5), mat('#8a6a3a'), 0, 0.19, 0);
      break;
    case 'fireball': {
      const o = m(new THREE.SphereGeometry(0.3, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffb02a' }));
      o.castShadow = false;
      const h = m(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshBasicMaterial({ color: '#ff5a1a', transparent: true, opacity: 0.45, depthWrite: false }));
      h.castShadow = false;
      break;
    }
  }
  return g;
}

export class ProjViz {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.pool = Object.fromEntries(PROJ_TYPES.map((t) => [t, []]));
    this.live = new Map();
    this.seen = new Set();
    this.trailT = 0;
  }

  // list: iterable of {id, type, pos, quat} ; dt for trails (0 when paused)
  begin() { this.seen.clear(); }
  put(id, type, px, py, pz, qx, qy, qz, qw) {
    let o = this.live.get(id);
    if (!o) {
      const pool = this.pool[type];
      o = pool.pop() || build(type);
      o.userData.type = type;
      this.scene.add(o);
      this.live.set(id, o);
    }
    o.visible = true;
    o.position.set(px, py, pz);
    o.quaternion.set(qx, qy, qz, qw);
    this.seen.add(id);
  }
  end(dt) {
    for (const [id, o] of this.live) {
      if (this.seen.has(id)) continue;
      this.scene.remove(o);
      this.pool[o.userData.type].push(o);
      this.live.delete(id);
    }
    if (dt > 0) {
      this.trailT += dt;
      if (this.trailT > 0.02) {
        this.trailT = 0;
        for (const o of this.live.values()) {
          const t = o.userData.type;
          if (t === 'fireball') this.fx.event(['trail', o.position.x, o.position.y, o.position.z, Math.random() < 0.5 ? 1 : 0]);
        }
      }
    }
  }
  clear() {
    for (const o of this.live.values()) { this.scene.remove(o); this.pool[o.userData.type].push(o); }
    this.live.clear();
  }

  fromBattle(b, dt) {
    this.begin();
    for (const p of b.projectiles) {
      // a fireball has no id clash with stuck arrows: ids are unique per projectile
      this.put(p.id, p.type, p.pos.x, p.pos.y, p.pos.z, p.quat.x, p.quat.y, p.quat.z, p.quat.w);
    }
    for (const s of b.stuck) this.put(s.id, s.type, s.pos.x, s.pos.y, s.pos.z, s.quat.x, s.quat.y, s.quat.z, s.quat.w);
    this.end(dt);
  }
}
