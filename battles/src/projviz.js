// Meshes for flying and stuck projectiles, pooled by type and keyed by id.
// Moving projectiles leave little trails (arrow streaks, fireball flames, potion
// fizz, bomb fuse sparks) through FX.
import { THREE } from './util.js';
import { mat } from './visual.js';
import { PROJ_TYPES } from './battle.js';
import { EXT } from './ext.js';
import { H } from './visual.js';

const G = {};
const once = (k, f) => G[k] || (G[k] = f());
function build(type) {
  const g = new THREE.Group();
  const m = (geo, mt, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mt); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  switch (type) {
    case 'arrow':
      m(once('ar0', () => new THREE.CylinderGeometry(0.013, 0.013, 0.8, 5)), mat('#9a6332'));
      m(once('ar1', () => new THREE.ConeGeometry(0.032, 0.11, 4)), mat('#b9c2cc', { emissive: '#1a1d22' }), 0, 0.44, 0);
      for (let i = 0; i < 3; i++) {
        const f = m(once('ar2', () => new THREE.BoxGeometry(0.004, 0.14, 0.05)), mat(i ? '#f4f0e6' : '#e2403b'), 0, -0.33, 0);
        f.rotation.y = (i / 3) * Math.PI * 2; f.translateZ(0.025);
      }
      break;
    case 'spear':
      m(once('sp0', () => new THREE.CylinderGeometry(0.025, 0.025, 1.7, 6)), mat('#9a6332'));
      m(once('sp1', () => new THREE.ConeGeometry(0.06, 0.3, 4)), mat('#b8b2a6', { emissive: '#18160f' }), 0, 0.98, 0).scale.set(1, 1, 0.35);
      m(once('sp2', () => new THREE.CylinderGeometry(0.032, 0.032, 0.08, 6)), mat('#6b4426'), 0, 0.82, 0);
      for (const r of [0, 2.1, 4.2]) { const f = m(once('sp3', () => new THREE.SphereGeometry(0.04, 6, 4)), mat(r ? '#f4f0e0' : '#c98a4b'), 0, 0.72, 0); f.scale.set(0.4, 2, 0.9); f.rotation.y = r; f.translateZ(0.035); f.rotation.x = 0.5; }
      break;
    case 'hay': {
      m(once('hy0', () => new THREE.BoxGeometry(0.75, 0.55, 0.55)), mat('#e6c65c'));
      const b = mat('#9a6a28');
      m(once('hy1', () => new THREE.BoxGeometry(0.05, 0.57, 0.57)), b, 0.2, 0, 0);
      m(once('hy1', () => null), b, -0.2, 0, 0);
      for (let i = 0; i < 5; i++) { const s = m(once('hy2', () => new THREE.BoxGeometry(0.012, 0.012, 0.18)), mat('#f2dc8a'), (i / 4 - 0.5) * 0.6, 0.28, (i % 2 - 0.5) * 0.2); s.rotation.y = i; }
      break;
    }
    case 'potion':
      m(once('po0', () => new THREE.SphereGeometry(0.13, 12, 10)), mat('#d8f2ff', { emissive: '#203040', transparent: true, opacity: 0.55 })).renderOrder = 3;
      m(once('po1', () => new THREE.SphereGeometry(0.105, 12, 10)), mat('#7be05a', { emissive: '#3ab020' }), 0, -0.01, 0);
      m(once('po2', () => new THREE.CylinderGeometry(0.04, 0.045, 0.12, 8)), mat('#d8f2ff', { emissive: '#203040' }), 0, 0.15, 0);
      m(once('po3', () => new THREE.CylinderGeometry(0.045, 0.038, 0.06, 8)), mat('#a0703a'), 0, 0.22, 0);
      break;
    case 'bomb': {
      m(once('bo0', () => new THREE.SphereGeometry(0.16, 14, 10)), mat('#1d1a1a', { emissive: '#0a0a0a' }));
      m(once('bo1', () => new THREE.CylinderGeometry(0.055, 0.06, 0.06, 8)), mat('#7d8691'), 0, 0.16, 0);
      m(once('bo2', () => new THREE.CylinderGeometry(0.014, 0.014, 0.12, 4)), mat('#c8a060'), 0.02, 0.24, 0).rotation.z = -0.4;
      const sp = m(once('bo3', () => new THREE.OctahedronGeometry(0.04)), new THREE.MeshBasicMaterial({ color: '#ffd040' }), 0.045, 0.3, 0);
      sp.castShadow = false; g.userData.spark = sp;
      m(once('bo4', () => new THREE.SphereGeometry(0.035, 6, 5)), mat('#ffffff'), -0.06, 0.07, 0.12);
      break;
    }
    case 'fireball': {
      const o = m(once('fb0', () => new THREE.IcosahedronGeometry(0.24, 2)), new THREE.MeshBasicMaterial({ color: '#fff0b0' }));
      o.castShadow = false;
      const h = m(once('fb1', () => new THREE.IcosahedronGeometry(0.36, 2)), new THREE.MeshBasicMaterial({ color: '#ffa030', transparent: true, opacity: 0.6, depthWrite: false }));
      h.castShadow = false;
      const h2 = m(once('fb2', () => new THREE.IcosahedronGeometry(0.5, 1)), new THREE.MeshBasicMaterial({ color: '#ff5a1a', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
      h2.castShadow = false;
      g.userData.flicker = [h, h2];
      break;
    }
    default: for (const f of EXT.buildProj) if (f(type, g, H)) break;
  }
  return g;
}

const TRAIL = { arrow: 0.02, spear: 0.03, fireball: 0.02, potion: 0.05, bomb: 0.05 };

export class ProjViz {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    this.pool = Object.fromEntries(PROJ_TYPES.map((t) => [t, []]));
    this.live = new Map();
    this.seen = new Set();
    this.trailT = 0;
    this.t = 0;
  }

  // list: iterable of {id, type, pos, quat} ; dt for trails (0 when paused)
  begin() { this.seen.clear(); }
  put(id, type, px, py, pz, qx, qy, qz, qw) {
    let o = this.live.get(id);
    if (!o) {
      const pool = this.pool[type];
      o = pool.pop() || build(type);
      o.userData.type = type;
      o.userData.last = null;
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
    if (!(dt > 0)) return;
    this.t += dt;
    this.trailT += dt;
    const emit = this.trailT > 0.02;
    if (emit) this.trailT = 0;
    for (const o of this.live.values()) {
      const u = o.userData, p = o.position;
      const moving = u.last && u.last.distanceToSquared(p) > 1e-4 && u.last.distanceToSquared(p) < 25;
      if (!u.last) u.last = p.clone(); else if (emit) u.last.copy(p);
      if (u.flicker) { const k = 1 + Math.sin(this.t * 40 + p.x) * 0.12; u.flicker[0].scale.setScalar(k); u.flicker[1].scale.setScalar(2 - k); }
      if (u.spark) u.spark.scale.setScalar(0.7 + Math.random() * 0.8);
      if (!emit || !moving) continue;
      const t = u.type;
      if (t === 'fireball') this.fx.event(['trail', p.x, p.y, p.z, Math.random() < 0.5 ? 1 : 0]);
      else if (t === 'arrow' || t === 'spear') this.fx.event(['atrail', p.x, p.y, p.z, TRAIL[t] * 5]);
      else if (t === 'potion' && Math.random() < 0.6) this.fx.event(['ptrail', p.x, p.y, p.z]);
      else if (t === 'bomb' && u.spark) { u.spark.getWorldPosition(_w); this.fx.event(['fuse', _w.x, _w.y, _w.z]); }
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
const _w = new THREE.Vector3();
