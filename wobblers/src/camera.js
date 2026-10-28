// Third-person follow camera per player, Wobbly Life style: a soft orbit that
// trails the character (lagging more vertically, so the bouncy walk and jumps
// don't shake the view), pulls in when looking up from low down, slides in
// front of walls with a sphere cast, drifts behind you when you run with a
// pad, and frames vehicles with a look-ahead and speed-dependent FOV.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { CAMERA_QUERY, G_STATIC, G_VEH, groups } from './config.js';

// The camera keeps out of the static world and stays inside enclosed rides
// (the Gravitron's spinning wall): colliders listed in game.cameraBlockers
// (handles) count too, other moving things (cars, ride cars) don't.
const CAMERA_QUERY_RIDES = groups(0xffff, G_STATIC | G_VEH);
const camBlocks = (game) => (game._camPred ||= (c) => !!(c.parent()?.isFixed()) || !!game.cameraBlockers?.has(c.handle));
void CAMERA_QUERY;

const FOV = 62;
const FOOT_DIST = 5.2, RIDE_DIST = 7.5;
const PROBE_R = 0.25;          // sphere swept toward the camera for wall pull-in
const _qi = new THREE.Quaternion(), _fw = new THREE.Vector3();
const _back = new THREE.Vector3(), _tgt = new THREE.Vector3(), _pos = new THREE.Vector3();
let _probe = null; // made on first use (Rapier's WASM isn't ready at import)
const _rot = { x: 0, y: 0, z: 0, w: 1 };

export class FollowCam {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2200);
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
      // stopAtPenetration false: a probe that starts touching a wall the player is
      // pressed against (jumping at it) only counts surfaces it moves into
      hit = w.castShape(from, _rot, dir, _probe, 0, max, false, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CAMERA_QUERY_RIDES, undefined, undefined, camBlocks(this.game));
    } catch (e) { hit = null; }
    if (hit) return hit.time_of_impact ?? hit.timeOfImpact ?? max;
    const r = w.castRay(new RAPIER.Ray(from, dir), max, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CAMERA_QUERY_RIDES, undefined, undefined, camBlocks(this.game));
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
      this.lead.lerp(_pos.set(v.x * 0.12 * leadK, 0, v.z * 0.12 * leadK), 1 - Math.exp(-dt * 3));
      tgt.add(this.lead);
      wantDist = veh.def.camDist + Math.min(3, spd * 0.06);
      wantFov = FOV + Math.min(12, spd * 0.35);
      kH = 12; kV = 8;
      // swing behind the car when the player isn't steering the camera
      if (this.idle > 1.2 && Math.abs(veh.speed) > 2) {
        // the angle behind the car lags it by (turn rate) / k, solved exactly over the frame
        // like the trail below, so turning doesn't wobble the view when frame times vary
        const rec = veh.rec, ph = this.game.physics;
        _qi.slerpQuaternions(rec.q0, rec.q1, ph.alpha); _fw.set(0, 0, 1).applyQuaternion(_qi); // interpolated heading
        const want = Math.atan2(_fw.x, _fw.z) + (veh.speed < -1 ? Math.PI : 0), k = 2.2;
        const w = this.prevWant == null || dt <= 0 ? 0 : Math.atan2(Math.sin(want - this.prevWant), Math.cos(want - this.prevWant)) / dt;
        let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const a = Math.exp(-k * dt);
        this.yaw = want - (d * a + w / k * (1 - a));
        this.pitch += (0.25 - this.pitch) * (1 - Math.exp(-dt * 1.5));
        this.prevWant = want;
      } else this.prevWant = null;
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
        if (Math.abs(d) < 2.0) this.yaw += d * (1 - Math.exp(-dt * 0.7 * Math.min(1, spd / 6)));
      }
    }
    // inside an enclosed ride (game.camEnclosures: the Gravitron, Starship 2000): stay well
    // inside the wall and look down over the player; strapped to the wall, look back at
    // them from the middle so the other riders round the wall are in view
    let pitch = this.pitch;
    const enc = !veh && this.game.camEnclosures?.find((e) => Math.hypot(tgt.x - e.x, tgt.z - e.z) < e.r && tgt.y > e.y0 && tgt.y < e.y1);
    if (enc) {
      wantDist = Math.min(wantDist, enc.r * 0.62);
      pitch = Math.max(pitch, ride ? 0.35 : 0.62);
      if (ride) { const dx = enc.x - tgt.x, dz = enc.z - tgt.z; if (Math.hypot(dx, dz) > 1) this.yaw = Math.atan2(-dx, -dz); }
    }
    // trail: snappy sideways, softer up and down (but never lose a fast fall). The camera aims
    // at a point `lag` behind the target, and the lag follows d(lag)/dt = v - k lag, solved
    // exactly over the frame (v = the target's own speed this frame). So the steady trailing
    // distance is v / k whatever the frame time: the old per-frame "move dt * k of the gap"
    // trailed less on a long frame, so the car / player jiggled to and fro on screen whenever
    // frame times varied (worse the faster you go).
    const t = this.target, lag = this.lag ||= new THREE.Vector3();
    if (this.first || !this.prevTgt) { lag.set(0, 0, 0); this.prevTgt = tgt.clone(); this.first = false; }
    if (dt > 0) {
      const vx = (tgt.x - this.prevTgt.x) / dt, vy = (tgt.y - this.prevTgt.y) / dt, vz = (tgt.z - this.prevTgt.z) / dt;
      const follow = (l, v, k) => { const a = Math.exp(-k * dt); return l * a + v / k * (1 - a); };
      lag.x = follow(lag.x, vx, kH); lag.z = follow(lag.z, vz, kH);
      lag.y = follow(lag.y, vy, Math.abs(lag.y) > 1.2 ? kV * 2.5 : kV);
    }
    this.prevTgt.copy(tgt);
    if (lag.length() > 25) lag.set(0, 0, 0); // teleported / respawned: jump there
    t.copy(tgt).sub(lag);
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-dt * 3));
    this.fov += (wantFov - this.fov) * (1 - Math.exp(-dt * 2));

    const cp = Math.cos(pitch);
    const back = _back.set(-Math.sin(this.yaw) * cp, Math.sin(pitch), -Math.cos(this.yaw) * cp);
    // pull in in front of walls: in fast, out slowly
    const free = this.clearance({ x: t.x, y: t.y, z: t.z }, { x: back.x, y: back.y, z: back.z }, this.dist + 0.2);
    const d = Math.max(0.6, Math.min(this.dist, free - 0.1));
    this.curDist = d < this.curDist ? d : this.curDist + (d - this.curDist) * (1 - Math.exp(-dt * 3));
    const pos = _pos.copy(t).addScaledVector(back, this.curDist);
    if (enc && pos.y > enc.top) pos.y = enc.top; // under the ride's roof
    const gh = this.game.groundHeight(pos.x, pos.z, pos.y + 1);
    if (pos.y < gh + 0.35) pos.y = gh + 0.35;
    // diving (player.diveD): keep the camera under the surface with the swimmer, not above it
    if (p.diveD > 0.4) { const tw = this.game.physics.waterLevel(t.x, t.y, t.z); if (tw != null) pos.y = Math.min(pos.y, tw - 0.3); }
    const wl = this.game.physics.waterLevel(pos.x, pos.y, pos.z);
    this.underwater = wl != null && pos.y < wl;
    this.cam.position.copy(pos);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
    this.cam.lookAt(t);
  }
}
