// Camera rigs: free fly, follow (orbit a unit), possess (third person over the
// shoulder) and cine (an automatic director that orbits the action).
import { THREE, clamp, damp, lerp, rand } from './util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _look = new THREE.Vector3();

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
    this.yawVel = 0;
    this.pitchVel = 0;
    this.mode = 'free';
    this.unit = null;
    this.orbitDist = 6;
    this.orbitGoal = 6;
    this.right = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.position = this.cam.position; // for audio listeners
    this.bounds = 118;
    this.zoom = 0; // fov offset (d-pad left/right); the game eases cam.fov towards base + zoom
    this.fov = 0;
    this.cine = null;
  }

  set(x, y, z, yaw, pitch) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = pitch;
    this.yawVel = 0; this.pitchVel = 0;
    this.apply();
  }

  copyFrom(o) {
    this.set(o.pos.x, o.pos.y, o.pos.z, o.yaw, o.pitch);
    this.zoom = o.zoom;
  }

  lookAtPoint(x, y, z) {
    const dx = x - this.pos.x, dy = y - this.pos.y, dz = z - this.pos.z;
    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  addZoom(d) { this.zoom = clamp(this.zoom + d, -40, 30); }

  // s: pad state; opts: { speed, lookSpeed, invertY, slow (0..1, LT cinematic), units, minHeight }
  update(s, dt, terrain, opts = {}) {
    const slow = opts.slow || 0;
    const look = (opts.lookSpeed ?? 2.3) * (1 - slow * 0.55);
    const iy = opts.invertY ? -1 : 1;
    // smoothed look: snappy normally, floaty while the slow cam trigger is held
    const lr = lerp(22, 3.5, slow);
    this.yawVel = lerp(this.yawVel, -s.rx * look, damp(lr, dt));
    this.pitchVel = lerp(this.pitchVel, -s.ry * iy * look * 0.75, damp(lr, dt));
    if (this.mode !== 'cine') {
      this.yaw += this.yawVel * dt;
      this.pitch = clamp(this.pitch + this.pitchVel * dt, -1.5, 1.4);
    }
    dirFrom(this.yaw, this.pitch, this.dir);
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    this.viewTilt = 0;
    if (this.mode === 'free') {
      const gy0 = terrain.height(this.pos.x, this.pos.z);
      // faster when high up, so crossing the map from altitude doesn't crawl
      const alt = clamp(0.55 + (this.pos.y - gy0) / 22, 0.55, 3);
      const boost = s.b.l3 ? 3 : 1;
      const sp = (opts.speed ?? 11) * boost * alt * (1 - slow * 0.75);
      const up = (s.b.rb ? 1 : 0) - (s.b.lb ? 1 : 0);
      // planar (setup): the stick slides over the ground at constant height, so the
      // cursor moves where you push; otherwise fly along the view direction
      if (opts.planar) _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-s.ly * sp);
      else _v.copy(this.dir).multiplyScalar(-s.ly * sp);
      _v.addScaledVector(this.right, s.lx * sp);
      _v.y += up * sp * 0.75;
      // acceleration / deceleration (slower to start and stop on the slow cam)
      const accel = _v.lengthSq() > this.vel.lengthSq() ? lerp(6, 1.6, slow) : lerp(8, 1.2, slow);
      this.vel.lerp(_v, damp(accel, dt));
      this.pos.addScaledVector(this.vel, dt);
      // terrain collision: soft cushion above the ground, hard floor just under it
      const minH = opts.minHeight ?? 0.8;
      const gy = terrain.height(this.pos.x, this.pos.z);
      const floor = gy + minH;
      if (this.pos.y < floor + 0.6) {
        this.pos.y = Math.max(this.pos.y, lerp(this.pos.y, floor + 0.6, damp(10, dt)), floor);
        if (this.vel.y < 0) this.vel.y *= 1 - damp(12, dt);
      }
      this.pos.x = clamp(this.pos.x, -this.bounds, this.bounds);
      this.pos.z = clamp(this.pos.z, -this.bounds, this.bounds);
      this.pos.y = Math.min(this.pos.y, 140);
    } else if (this.mode === 'cine') {
      this.updateCine(dt, terrain, opts.units || []);
    } else if (this.unit) {
      const u = this.unit;
      const s2 = u.s || 1;
      const tp = u.chestPos;
      this.smoothTarget.lerp(tp, this.snap ? 1 : damp(this.mode === 'possess' ? 16 : 9, dt));
      let want;
      if (this.mode === 'follow') {
        this.orbitGoal = clamp(this.orbitGoal + s.ly * dt * 10 * Math.max(1, this.orbitGoal / 8), 2.2 * s2, 40);
        this.orbitDist = lerp(this.orbitDist, this.orbitGoal, damp(8, dt));
        _look.copy(this.smoothTarget); _look.y += 0.3 * s2;
        want = _v.copy(this.dir).multiplyScalar(-this.orbitDist).add(_look);
        want.y += 0.3 * s2;
      } else {
        // possess: over the right shoulder, looking where the unit aims
        // sits a little above head height so neighbours don't fill the screen
        _look.copy(this.smoothTarget); _look.y += 1.0 * s2;
        _look.addScaledVector(this.right, 0.5 * s2);
        want = _v.copy(this.dir).multiplyScalar(-3.8 * s2).add(_look);
      }
      this.occlude(_look, want, opts.units, u, terrain, dt);
      // tilt the view down by the boom so the unit stays near the centre
      this.viewTilt = -Math.atan2((this.boom || 0) * s2, this.mode === 'follow' ? this.orbitDist : 3.8 * s2) * 0.85;
      const gy = terrain.height(want.x, want.z);
      if (want.y < gy + 0.35) want.y = gy + 0.35;
      if (this.snap) this.pos.copy(want);
      else this.pos.lerp(want, damp(this.mode === 'possess' ? 22 : 14, dt));
      this.snap = false;
    }
    this.apply();
  }

  // Fraction (0..1] of the target->camera segment that is clear of other units
  // (chest and head) and terrain.
  blockT(target, want, units, self, terrain) {
    _seg.copy(want).sub(target);
    const len = _seg.length();
    if (len < 0.5) return 1;
    let tMin = 1;
    if (units) {
      const len2 = len * len;
      for (const o of units) {
        if (o === self || o.alive === false) continue;
        const c = o.chestPos;
        const os = o.s || 1;
        for (let h = 0; h < 2; h++) {
          const dx = c.x - target.x, dy = c.y + h * 0.5 * os - target.y, dz = c.z - target.z;
          if (dx * dx + dy * dy + dz * dz > (len + 2) * (len + 2)) break;
          const t = (dx * _seg.x + dy * _seg.y + dz * _seg.z) / len2;
          if (t <= 0.08 || t >= 1.05) continue;
          const px = dx - _seg.x * t, py = dy - _seg.y * t, pz = dz - _seg.z * t;
          const r = 0.38 * os + 0.22;
          if (px * px + py * py + pz * pz < r * r) tMin = Math.min(tMin, t - r / len);
        }
      }
    }
    // terrain between target and camera
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      const x = target.x + _seg.x * t, y = target.y + _seg.y * t, z = target.z + _seg.z * t;
      if (y < terrain.height(x, z) + 0.25) { tMin = Math.min(tMin, (k - 1) / 6); break; }
    }
    return tMin;
  }

  // Keep the followed / possessed unit visible: when other units are in the way,
  // first raise the camera boom (look over their heads, eased), and only if that
  // still doesn't clear the view pull the camera in front of them.
  occlude(target, want, units, self, terrain, dt) {
    const s = self?.s || 1;
    let boom = 0;
    if (this.blockT(target, want, units, self, terrain) < 1) {
      boom = 2.4;
      for (const k of [0.6, 1.2, 1.8, 2.4]) {
        _w.copy(want); _w.y += k * s;
        if (this.blockT(target, _w, units, self, terrain) >= 1) { boom = k; break; }
      }
    }
    // rise quickly, settle back slowly so it doesn't bob as units walk past
    this.boom = lerp(this.boom || 0, boom, damp(boom > (this.boom || 0) ? 5 : 1.5, dt));
    want.y += this.boom * s;
    const tMin = this.blockT(target, want, units, self, terrain);
    if (tMin < 1) {
      _seg.copy(want).sub(target);
      const minT = Math.min(1, 0.9 / Math.max(0.5, _seg.length()));
      want.copy(target).addScaledVector(_seg, clamp(tMin, minT, 1));
    }
  }

  follow(unit, mode) {
    this.unit = unit;
    this.mode = mode;
    this.smoothTarget.copy(unit.chestPos);
    this.snap = mode === 'possess' || this.pos.distanceTo(unit.chestPos) > 60;
    if (mode === 'possess') this.pitch = -0.12;
    if (mode === 'follow') { this.orbitGoal = this.orbitDist = clamp(this.pos.distanceTo(unit.chestPos), 4 * (unit.s || 1), 14); }
  }

  release() {
    this.boom = 0;
    this.viewTilt = 0;
    if (this.mode !== 'free' && this.mode !== 'cine') {
      // keep looking the same way from where we are
      this.vel.set(0, 0, 0);
    }
    this.mode = 'free';
    this.unit = null;
    this.cine = null;
    this.vel.set(0, 0, 0);
  }

  // --------------------------------------------------------- cinematic director
  startCine() {
    this.mode = 'cine';
    this.unit = null;
    this.cine = { target: null, t: 0, next: 0, ang: this.yaw + Math.PI, dist: 10, h: 3, spin: 0.12, look: new THREE.Vector3().copy(this.pos).addScaledVector(this.dir, 10) };
  }

  pickCine(units) {
    const alive = units.filter((u) => u.alive !== false);
    if (!alive.length) return null;
    const cands = [];
    for (let i = 0; i < Math.min(30, alive.length); i++) cands.push(alive[Math.floor(Math.random() * alive.length)]);
    let best = null, bs = -Infinity;
    for (const u of cands) {
      if (u === this.cine.target && alive.length > 1) continue;
      let near = Infinity, crowd = 0;
      for (const o of alive) {
        if (o.team === u.team) continue;
        const d = (o.chestPos.x - u.chestPos.x) ** 2 + (o.chestPos.z - u.chestPos.z) ** 2;
        if (d < near) near = d;
        if (d < 64) crowd++;
      }
      const sc = -Math.sqrt(near) * 0.6 + Math.min(crowd, 8) + (u.s || 1) * 1.5 + Math.random() * 3;
      if (sc > bs) { bs = sc; best = u; }
    }
    return best || alive[0];
  }

  updateCine(dt, terrain, units) {
    const c = this.cine;
    c.t += dt;
    if (!c.target || c.t > c.next || c.target.alive === false && c.t > 2) {
      const prev = c.target ? c.target.chestPos.clone() : null;
      const u = this.pickCine(units);
      if (u) {
        c.target = u;
        c.t = 0;
        c.next = rand(5, 8);
        c.dist = rand(6, 13) * Math.sqrt(u.s || 1);
        c.h = rand(1.2, 4.5) * (u.s || 1);
        c.spin = rand(0.08, 0.2) * (Math.random() < 0.5 ? -1 : 1);
        c.ang = Math.atan2(this.pos.x - u.chestPos.x, this.pos.z - u.chestPos.z);
        // cut instead of panning across the whole map
        if (!prev || prev.distanceTo(u.chestPos) > 25) c.cut = true;
      }
    }
    if (!c.target) return;
    const tp = c.target.chestPos;
    c.ang += c.spin * dt;
    _w.set(tp.x + Math.sin(c.ang) * c.dist, tp.y + c.h, tp.z + Math.cos(c.ang) * c.dist);
    const gy = terrain.height(_w.x, _w.z);
    if (_w.y < gy + 1) _w.y = gy + 1;
    if (c.cut) { this.pos.copy(_w); c.look.copy(tp); c.cut = false; }
    else { this.pos.lerp(_w, damp(1.1, dt)); c.look.lerp(tp, damp(2.2, dt)); }
    this.lookAtPoint(c.look.x, c.look.y, c.look.z);
  }

  apply() {
    this.cam.position.copy(this.pos);
    dirFrom(this.yaw, clamp(this.pitch + (this.viewTilt || 0), -1.55, 1.5), this.dir);
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

  // Where the crosshair points: the first unit near the ray, else the ground, else far away.
  aimPoint(terrain, units, self, maxD = 90) {
    const u = units ? this.pickUnit(units, (o) => o !== self && o.alive !== false && o.team !== self?.team, 0.5) : null;
    if (u) return u.chestPos.clone();
    const g = this.groundHit(terrain, maxD);
    if (g) return g;
    return this.pos.clone().addScaledVector(this.dir, maxD);
  }

  // Closest live unit to the view ray (within a cone).
  pickUnit(units, filter, cone = 1.2) {
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
      if (score < cone && score < bs) { bs = score; best = u; }
    }
    return best;
  }
}
