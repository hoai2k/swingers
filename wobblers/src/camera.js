// Third-person orbit camera per player, pulled in by static scenery.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { CAMERA_QUERY } from './config.js';

export class FollowCam {
  constructor(game, player) {
    this.game = game;
    this.player = player;
    this.cam = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.yaw = player.yaw;
    this.pitch = 0.28;
    this.dist = 5.2;
    this.curDist = 5.2;
    this.target = new THREE.Vector3();
    this.idle = 0;
    this.first = true;
  }

  update(inp, dt) {
    const p = this.player;
    const veh = p.seat?.vehicle && p.seat.kind === 'driver' ? p.seat.vehicle : null;
    const ride = p.seat && !veh;
    const lx = inp.lookX * (inp.mouse ? 1 : dt * 60);
    const ly = inp.lookY * (inp.mouse ? 1 : dt * 60);
    this.yaw -= lx;
    this.pitch = Math.max(-0.75, Math.min(1.25, this.pitch + ly));
    if (Math.abs(lx) + Math.abs(ly) > 0.0005) this.idle = 0; else this.idle += dt;

    let tgt, wantDist;
    if (veh) {
      const t = veh.body.translation();
      tgt = new THREE.Vector3(t.x, t.y + veh.def.camH, t.z);
      wantDist = veh.def.camDist;
      // swing behind the car when the player isn't steering the camera
      if (this.idle > 1.2 && Math.abs(veh.speed) > 2) {
        const want = veh.yaw() + (veh.speed < -1 ? Math.PI : 0);
        let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 2.2);
        this.pitch += (0.25 - this.pitch) * Math.min(1, dt * 1.5);
      }
    } else {
      const c = p.chest.translation();
      tgt = new THREE.Vector3(c.x, c.y + 0.55, c.z);
      wantDist = ride ? 7.5 : 5.2;
    }
    if (this.first) { this.target.copy(tgt); this.first = false; }
    const k = Math.min(1, dt * (veh ? 12 : 9));
    this.target.lerp(tgt, k);
    if (this.target.distanceTo(tgt) > 25) this.target.copy(tgt);
    this.dist += (wantDist - this.dist) * Math.min(1, dt * 3);

    const cp = Math.cos(this.pitch);
    const back = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    // pull in in front of walls
    const ray = new RAPIER.Ray({ x: this.target.x, y: this.target.y, z: this.target.z }, { x: back.x, y: back.y, z: back.z });
    const hit = this.game.physics.world.castRay(ray, this.dist + 0.3, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CAMERA_QUERY);
    let d = this.dist;
    if (hit) d = Math.max(0.8, hit.timeOfImpact - 0.3);
    this.curDist = d < this.curDist ? d : this.curDist + (d - this.curDist) * Math.min(1, dt * 4);
    const pos = this.target.clone().addScaledVector(back, this.curDist);
    const gh = this.game.groundHeight(pos.x, pos.z, pos.y + 1);
    if (pos.y < gh + 0.35) pos.y = gh + 0.35;
    const wl = this.game.physics.waterLevel(pos.x, pos.y, pos.z);
    this.underwater = wl != null && pos.y < wl;
    this.cam.position.copy(pos);
    this.cam.lookAt(this.target);
  }
}
