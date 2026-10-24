// Camera rigs: free fly, follow (orbit a unit) and possess (third person).
import { THREE, clamp, damp, lerp, angleDiff } from './util.js';

const _v = new THREE.Vector3();

export function dirFrom(yaw, pitch, out = new THREE.Vector3()) {
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

export class CamRig {
  constructor(aspect = 1) {
    this.cam = new THREE.PerspectiveCamera(62, aspect, 0.1, 1500);
    this.pos = new THREE.Vector3(0, 10, -30);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.3;
    this.mode = 'free';
    this.unit = null;
    this.orbitDist = 6;
    this.right = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.position = this.cam.position; // for audio listeners
    this.bounds = 118;
  }

  set(x, y, z, yaw, pitch) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = pitch;
    this.apply();
  }

  lookAtPoint(x, y, z) {
    const dx = x - this.pos.x, dy = y - this.pos.y, dz = z - this.pos.z;
    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  // s: pad state; opts: { speed, terrain }
  update(s, dt, terrain, opts = {}) {
    const look = opts.lookSpeed ?? 2.3;
    this.yaw -= s.rx * look * dt;
    this.pitch = clamp(this.pitch - s.ry * look * 0.75 * dt, -1.5, 1.4);
    dirFrom(this.yaw, this.pitch, this.dir);
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    if (this.mode === 'free') {
      const boost = s.b.l3 ? 3.2 : 1;
      const sp = (opts.speed ?? 11) * boost;
      const up = (s.b.rb ? 1 : 0) - (s.b.lb ? 1 : 0);
      _v.copy(this.dir).multiplyScalar(-s.ly * sp).addScaledVector(this.right, s.lx * sp);
      _v.y += up * sp * 0.8;
      this.vel.lerp(_v, damp(7, dt));
      this.pos.addScaledVector(this.vel, dt);
      const gy = terrain.height(this.pos.x, this.pos.z);
      if (this.pos.y < gy + 0.7) { this.pos.y = gy + 0.7; this.vel.y = Math.max(0, this.vel.y); }
      this.pos.x = clamp(this.pos.x, -this.bounds, this.bounds);
      this.pos.z = clamp(this.pos.z, -this.bounds, this.bounds);
      this.pos.y = Math.min(this.pos.y, 140);
    } else if (this.unit) {
      const u = this.unit;
      const s2 = u.s || 1;
      const tp = u.chestPos;
      this.smoothTarget.lerp(tp, this.snap ? 1 : damp(10, dt));
      this.snap = false;
      if (this.mode === 'follow') {
        this.orbitDist = clamp(this.orbitDist + s.ly * dt * 8, 2.5 * s2, 30);
        _v.copy(this.dir).multiplyScalar(-this.orbitDist).add(this.smoothTarget);
        _v.y += 0.6 * s2;
      } else {
        // possess: over-the-shoulder
        _v.copy(this.dir).multiplyScalar(-3.6 * s2).add(this.smoothTarget);
        _v.addScaledVector(this.right, 0.7 * s2);
        _v.y += 0.9 * s2;
      }
      const gy = terrain.height(_v.x, _v.z);
      if (_v.y < gy + 0.4) _v.y = gy + 0.4;
      this.pos.lerp(_v, damp(14, dt));
    }
    this.apply();
  }

  follow(unit, mode) {
    this.unit = unit;
    this.mode = mode;
    this.smoothTarget.copy(unit.chestPos);
    this.snap = true;
    if (mode === 'possess') this.pitch = -0.15;
  }

  release() {
    this.mode = 'free';
    this.unit = null;
    this.vel.set(0, 0, 0);
  }

  apply() {
    this.cam.position.copy(this.pos);
    dirFrom(this.yaw, this.pitch, this.dir);
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    _v.copy(this.pos).add(this.dir);
    this.cam.lookAt(_v);
  }

  // Ray from the camera centre to the terrain.
  groundHit(terrain, maxD = 260) {
    const o = this.pos, d = this.dir;
    let prev = 0;
    const step = 0.5;
    for (let t = step; t < maxD; t += step * (1 + t * 0.02)) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < terrain.height(x, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m < terrain.height(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
        }
        return new THREE.Vector3(o.x + d.x * b, 0, o.z + d.z * b).setY(terrain.height(o.x + d.x * b, o.z + d.z * b));
      }
      prev = t;
    }
    return null;
  }

  // Closest live unit to the view ray (within a cone).
  pickUnit(units, filter) {
    let best = null, bs = Infinity;
    const o = this.pos, d = this.dir;
    for (const u of units) {
      if (filter && !filter(u)) continue;
      const c = u.chestPos;
      _v.copy(c).sub(o);
      const t = _v.dot(d);
      if (t < 0.5 || t > 150) continue;
      const perp = Math.sqrt(Math.max(0, _v.lengthSq() - t * t));
      const score = perp / (0.6 + t * 0.06);
      if (score < 1.2 && score < bs) { bs = score; best = u; }
    }
    return best;
  }
}
