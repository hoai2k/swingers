// Third-person follow camera per player, Wobbly Life style: a soft orbit that
// trails the character (lagging more vertically, so the bouncy walk and jumps
// don't shake the view), pulls in when looking up from low down, slides in
// front of walls with a sphere cast, drifts behind you when you run with a
// pad, and frames vehicles with a look-ahead and speed-dependent FOV.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { CAMERA_QUERY } from './config.js';

const FOV = 62;
const FOOT_DIST = 5.2, RIDE_DIST = 7.5;
const PROBE_R = 0.25;          // sphere swept toward the camera for wall pull-in
const _back = new THREE.Vector3(), _tgt = new THREE.Vector3(), _pos = new THREE.Vector3();
let _probe = null; // made on first use (Rapier's WASM isn't ready at import)
const _rot = { x: 0, y: 0, z: 0, w: 1 };

export class FollowCam {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 900);
    this.yaw = player.yaw;
    this.pitch = 0.28;
    this.dist = FOOT_DIST;
    this.curDist = FOOT_DIST;
    this.target = new THREE.Vector3();
    this.lead = new THREE.Vector3();
    this.fov = FOV;
    this.idle = 0;
    this.first = true;
  }

  // Distance to the first static thing between the target and the camera.
  clearance(from, dir, max) {
    const w = this.game.physics.world;
    let hit = null;
    if (!_probe) _probe = new RAPIER.Ball(PROBE_R);
    try {
      hit = w.castShape(from, _rot, dir, _probe, 0, max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CAMERA_QUERY);
    } catch (e) { hit = null; }
    if (hit) return hit.time_of_impact ?? hit.timeOfImpact ?? max;
    const r = w.castRay(new RAPIER.Ray(from, dir), max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CAMERA_QUERY);
    return r ? Math.max(0, r.timeOfImpact - PROBE_R) : max;
  }

  update(inp, dt) {
    const p = this.player;
    const veh = p.seat?.vehicle && p.seat.kind === 'driver' ? p.seat.vehicle : null;
    const ride = p.seat && !veh;
    const lx = (inp.lookX || 0) * (inp.mouse ? 1 : dt * 60);
    const ly = (inp.lookY || 0) * (inp.mouse ? 1 : dt * 60);
    this.yaw -= lx;
    this.pitch = Math.max(-0.75, Math.min(1.25, this.pitch + ly));
    if (Math.abs(lx) + Math.abs(ly) > 0.0005) this.idle = 0; else this.idle += dt;

    let wantDist, kH, kV, wantFov = FOV;
    const tgt = _tgt;
    if (veh) {
      this.game.physics.ipos(veh.rec, tgt);
      tgt.y += veh.def.camH;
      const v = veh.rec.body.linvel();
      const spd = Math.hypot(v.x, v.z);
      // look a little ahead of where the car is going
      const leadK = Math.min(1, 2.5 / Math.max(1, spd * 0.12));
      this.lead.lerp(_pos.set(v.x * 0.12 * leadK, 0, v.z * 0.12 * leadK), Math.min(1, dt * 3));
      tgt.add(this.lead);
      wantDist = veh.def.camDist + Math.min(3, spd * 0.06);
      wantFov = FOV + Math.min(12, spd * 0.35);
      kH = 12; kV = 8;
      // swing behind the car when the player isn't steering the camera
      if (this.idle > 1.2 && Math.abs(veh.speed) > 2) {
        const want = veh.yaw() + (veh.speed < -1 ? Math.PI : 0);
        let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 2.2);
        this.pitch += (0.25 - this.pitch) * Math.min(1, dt * 1.5);
      }
    } else {
      p.viewPos(tgt);
      tgt.y += 0.55;
      this.lead.multiplyScalar(Math.max(0, 1 - dt * 4));
      wantDist = ride ? RIDE_DIST : FOOT_DIST;
      // looking up from low down pulls the camera in (it would hit the ground);
      // looking down from high up backs it off a little
      wantDist *= this.pitch < 0 ? 1 + this.pitch * 0.55 : 1 + Math.max(0, this.pitch - 0.3) * 0.25;
      kH = 10; kV = 5.5;
      const v = p.chest.linvel();
      const spd = Math.hypot(v.x, v.z);
      wantFov = FOV + Math.min(5, Math.max(0, spd - 3.5) * 1.6);
      // on a pad, drift round behind a running player (never flip round
      // when they run toward the camera)
      if (!inp.mouse && !ride && this.idle > 1.0 && spd > 2 && p.state === 'normal') {
        const want = Math.atan2(v.x, v.z);
        let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 2.0) this.yaw += d * Math.min(1, dt * 0.7 * Math.min(1, spd / 6));
      }
    }
    if (this.first) { this.target.copy(tgt); this.first = false; }
    // trail: snappy sideways, softer up and down (but never lose a fast fall)
    const t = this.target;
    t.x += (tgt.x - t.x) * Math.min(1, dt * kH);
    t.z += (tgt.z - t.z) * Math.min(1, dt * kH);
    const dy = tgt.y - t.y;
    t.y += dy * Math.min(1, dt * (Math.abs(dy) > 1.2 ? kV * 2.5 : kV));
    if (t.distanceTo(tgt) > 25) t.copy(tgt);
    this.dist += (wantDist - this.dist) * Math.min(1, dt * 3);
    this.fov += (wantFov - this.fov) * Math.min(1, dt * 2);

    const cp = Math.cos(this.pitch);
    const back = _back.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    // pull in in front of walls: in fast, out slowly
    const free = this.clearance({ x: t.x, y: t.y, z: t.z }, { x: back.x, y: back.y, z: back.z }, this.dist + 0.2);
    const d = Math.max(0.6, Math.min(this.dist, free - 0.1));
    this.curDist = d < this.curDist ? d : this.curDist + (d - this.curDist) * Math.min(1, dt * 3);
    const pos = _pos.copy(t).addScaledVector(back, this.curDist);
    const gh = this.game.groundHeight(pos.x, pos.z, pos.y + 1);
    if (pos.y < gh + 0.35) pos.y = gh + 0.35;
    const wl = this.game.physics.waterLevel(pos.x, pos.y, pos.z);
    this.underwater = wl != null && pos.y < wl;
    this.cam.position.copy(pos);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
    this.cam.lookAt(t);
  }
}
