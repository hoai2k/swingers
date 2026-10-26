// The Frostpeak chairlift: a detachable two-seat chairlift from the ski village
// up to the top station below the summit. Chairs are kinematic bodies (no
// colliders) animated in physics.animators along a cable loop; they slow to a
// crawl in the stations so you can sit down (Y), and riders are set down on
// the platform automatically at the far end. All chairs are drawn by one
// InstancedMesh; towers, cables and stations go through the kit.
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { Builder, matVC } from '../../../mesh.js';
import { LIFT, TOP } from './layout.js';

const HANG = 3.8;           // cable height above a chair's seat
const V_FAST = 5.2, V_SLOW = 1.0, NCHAIRS = 22;

export function buildLift(game, kit, R) {
  const { x: X, zb, zt, gap } = LIFT;
  const yb = LIFT.yb, yt = TOP.y;
  const xU = X + gap, xD = X - gap;                       // up line east, down line west
  const ground = (z) => Math.max(R.groundAt(xU, z), R.groundAt(xD, z), R.groundAt(X, z));
  // cable profile (z, y) shared by both lines: flat in the stations, tower tops between
  const prof = [[zb, yb + 0.6 + HANG], [zb - 13, yb + 0.6 + HANG]];
  const towers = [];
  const span = (zb - 13) - (zt + 13), nT = Math.max(2, Math.round(span / 26));
  for (let i = 1; i < nT; i++) {
    const z = zb - 13 - span * i / nT;
    let g = -1e9;
    for (let k = -14; k <= 14; k += 2) g = Math.max(g, ground(z + k));
    const y = g + 7.2 + HANG;
    prof.push([z, y]); towers.push([z, y]);
  }
  prof.push([zt + 13, yt + 0.6 + HANG], [zt, yt + 0.6 + HANG]);

  // the loop as a 3D polyline: up line, top bullwheel, down line, bottom bullwheel
  const P = [];
  for (const [z, y] of prof) P.push([xU, y, z]);
  for (let k = 1; k < 8; k++) { const a = k / 8 * Math.PI; P.push([X + Math.cos(a) * gap, prof[prof.length - 1][1], zt - Math.sin(a) * gap]); }
  for (let i = prof.length - 1; i >= 0; i--) P.push([xD, prof[i][1], prof[i][0]]);
  for (let k = 1; k < 8; k++) { const a = Math.PI + k / 8 * Math.PI; P.push([X + Math.cos(a) * gap, prof[0][1], zb - Math.sin(a) * gap]); }
  P.push(P[0]);
  const S = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
  const LEN = S[S.length - 1];
  let seg = 0;
  const at = (s, out) => {
    s = ((s % LEN) + LEN) % LEN;
    if (s < S[seg] || s > S[seg + 1]) { seg = 0; while (S[seg + 1] < s) seg++; }
    const a = P[seg], b = P[seg + 1], t = (s - S[seg]) / (S[seg + 1] - S[seg] || 1);
    out.x = a[0] + (b[0] - a[0]) * t; out.y = a[1] + (b[1] - a[1]) * t - HANG; out.z = a[2] + (b[2] - a[2]) * t;
    out.yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
    return out;
  };
  const stationDist = (z) => Math.min(Math.abs(z - zb), Math.abs(z - zt));
  const speedAt = (z) => V_SLOW + (V_FAST - V_SLOW) * smooth01((stationDist(z) - 12) / 9);

  // ---- chairs
  const W = game.physics.world;
  const chairs = [];
  const exitTop = { x: xU + 2.6, y: yt + 0.9, z: zt + 7 }, exitBottom = { x: xD - 2.8, y: yb + 0.9, z: zb - 6 };
  const cols = [0xff3a3a, 0x3f8cff, 0xffd23f, 0x55d85a];
  for (let i = 0; i < NCHAIRS; i++) {
    const s = i / NCHAIRS * LEN, p = at(s, {});
    const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z));
    const c = { body, s, p: { ...p }, prev: { ...p }, seats: [] };
    for (const sx of [-0.42, 0.42]) {
      c.seats.push(R.addSeat(game, { body, pos: [sx, 0, 0.02], yaw: 0, label: 'Ride the lift', hint: 'Up we go! · Y jump off', exit: [sx * 3, -0.4, 0.4], lift: true }));
    }
    c.color = cols[i % cols.length];
    chairs.push(c);
  }
  // one instanced mesh for every chair
  const cb = new Builder();
  cb.rbox(1.5, 0.12, 0.62, 0.05, 0xffffff, [0, -0.25, 0.05]);              // seat (tinted per instance)
  cb.rbox(1.5, 0.62, 0.1, 0.05, 0xffffff, [0, 0.1, -0.3], [-0.12, 0, 0]);  // backrest
  cb.box(0.08, 0.08, 0.7, 0x2a2a33, [0.78, -0.02, 0.0]); cb.box(0.08, 0.08, 0.7, 0x2a2a33, [-0.78, -0.02, 0.0]); // armrests
  cb.box(1.6, 0.06, 0.06, 0x2a2a33, [0, 0.5, 0.42]);                          // safety bar
  cb.box(0.06, 0.06, 0.38, 0x2a2a33, [0.78, 0.5, 0.25]); cb.box(0.06, 0.06, 0.38, 0x2a2a33, [-0.78, 0.5, 0.25]);
  cb.box(0.08, 0.9, 0.08, 0x3a3f4a, [0.78, 0.4, -0.3]);
  cb.box(1.65, 0.08, 0.08, 0x3a3f4a, [0, 0.85, -0.3]);
  cb.cyl(0.05, 0.05, HANG - 0.85, 0x3a3f4a, [0, 0.85 + (HANG - 0.85) / 2, -0.3], null, 6);  // hanger
  cb.box(0.3, 0.22, 0.4, 0x3a3f4a, [0, HANG + 0.02, -0.3]);                  // grip on the cable
  const geo = cb.geometry();
  // instance colours multiply the vertex colours: the white seat takes the chair colour
  const im = new THREE.InstancedMesh(geo, matVC, NCHAIRS);
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.noCull = true;
  const tint = new THREE.Color();
  chairs.forEach((c, i) => im.setColorAt(i, tint.setHex(c.color).lerp(new THREE.Color(0xffffff), 0.15)));
  game.scene.add(im);

  game.physics.animators.push(game.whenNear(X, (zb + zt) / 2, 900, (t, dt) => {
    for (const c of chairs) {
      c.prev.x = c.p.x; c.prev.y = c.p.y; c.prev.z = c.p.z; c.prev.yaw = c.p.yaw;
      c.s = (c.s + speedAt(c.p.z) * dt) % LEN;
      at(c.s, c.p);
      const h = c.p.yaw / 2;
      c.body.setNextKinematicTranslation({ x: c.p.x, y: c.p.y, z: c.p.z });
      c.body.setNextKinematicRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) });
      // set riders down at the far station
      const up = c.p.x > X + gap * 0.5, down = c.p.x < X - gap * 0.5;
      if ((up && c.p.z < zt + 6.5 && c.p.z > zt) || (down && c.p.z > zb - 5 && c.p.z < zb)) {
        for (const st of c.seats) if (st.occupant) {
          st.exitWorld = up ? exitTop : exitBottom;
          const o = st.occupant;
          o.leaveSeat();
          st.exitWorld = null;
          o.say?.('Thanks!');
        }
      }
    }
  }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  game.updaters.push(game.whenNear(X, (zb + zt) / 2, 900, () => {
    const a = game.physics.alpha ?? 1;
    chairs.forEach((c, i) => {
      let dy = c.p.yaw - c.prev.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      v.set(c.prev.x + (c.p.x - c.prev.x) * a, c.prev.y + (c.p.y - c.prev.y) * a, c.prev.z + (c.p.z - c.prev.z) * a);
      q.setFromAxisAngle(Y, c.prev.yaw + dy * a);
      im.setMatrixAt(i, m4.compose(v, q, one));
    });
    im.instanceMatrix.needsUpdate = true;
  }));

  // ---- towers and cables
  for (const [z, y] of towers) {
    const g = Math.min(R.groundAt(X, z), R.groundAt(X, z - 1), R.groundAt(X, z + 1));
    kit.cyl(X, (g + y + 0.8) / 2, z, 0.38, y + 0.8 - g + 0.4, 0x8a8f9a, { seg: 8 });
    kit.box(X, y + 0.75, z, gap * 2 + 1.2, 0.35, 0.5, 0x6a6f7a);
    for (const sx of [xU, xD]) kit.box(sx, y + 0.35, z, 0.25, 0.45, 1.6, 0x3a3f4a, { collide: false });
    kit.cyl(X, g + 0.4, z, 0.8, 0.8, 0x9a9a92, { seg: 8 });
  }
  const cable = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], h = Math.hypot(dx, dz), L = Math.hypot(h, dy);
    if (L < 0.05) return;
    kit.deco((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.02, (a[2] + b[2]) / 2, 0.06, 0.06, L, 0x2a2a33, { euler: [-Math.atan2(dy, h), Math.atan2(dx, dz), 0] });
  };
  for (let i = 0; i < P.length - 1; i++) cable(P[i], P[i + 1]);

  // ---- stations
  station(game, kit, R, X, zb, yb, 1, gap);
  station(game, kit, R, X, zt, yt, -1, gap);
  R.sign('SKI LIFT', X + gap + 4.6, yb + 4.2, zb - 2, Math.PI / 2, 5, '#e8322b', '#ffffff');
  R.sign('SKI LIFT', X - gap - 4.6, yt + 4.2, zt + 3, -Math.PI / 2, 5, '#e8322b', '#ffffff');
  game.snowLift = { chairs, length: LEN, at, exitTop, exitBottom, zb, zt };
}

function smooth01(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

// Boarding/unloading platform with a roof over the bullwheel, a little
// operator hut and fences. dir: +1 the bottom station (line leaves to -z).
function station(game, kit, R, X, z, y, dir, gap) {
  const L = new R.Local(kit, X, z, dir > 0 ? 0 : Math.PI, y);
  // platform deck (local -z = up the line)
  L.box(0, 0.12, -3, gap * 2 + 7, 0.24, 18, 0xb98a5a);
  L.box(0, 0.26, -3, gap * 2 + 1.8, 0.05, 16, 0x6ac8ff, { collide: false }); // blue boarding mats
  // bullwheel housing + roof
  const top = 0.6 + HANG;
  L.cyl(0, top, 0, gap + 0.25, 0.3, 0x3a3f4a, { seg: 20, collide: false });
  for (const [lx, lz] of [[-gap - 2.6, 3.2], [gap + 2.6, 3.2], [-gap - 2.6, -5], [gap + 2.6, -5]]) L.cyl(lx, top / 2 + 0.6, lz, 0.18, top + 1.2, 0xc8343c, { seg: 8 });
  L.box(0, top + 1.3, -0.9, gap * 2 + 6.6, 0.3, 9.8, 0xc8343c);
  L.box(0, top + 1.55, -0.9, gap * 2 + 6.2, 0.25, 9.4, 0xf6f9ff, { collide: false }); // snow on the roof
  // operator hut
  L.box(gap + 4.6, 1.4, 1.8, 2.4, 2.8, 2.4, 0x9a6a42);
  L.deco(gap + 3.38, 1.7, 1.8, 0.05, 0.9, 1.4, 0x9fd8ff);
  L.box(gap + 4.6, 2.9, 1.8, 2.9, 0.25, 2.9, 0xf6f9ff);
  L.box(gap + 3.2, 1.0, -0.6, 0.5, 1.1, 0.5, 0x8a8f9a); // control box
  L.deco(gap + 2.94, 1.25, -0.6, 0.03, 0.12, 0.12, 0x55d85a);
  L.deco(gap + 2.94, 1.0, -0.6, 0.03, 0.12, 0.12, 0xff3a3a);
  // fences along the outside of the platform
  L.rail(-gap - 3.4, 5, -gap - 3.4, -11, 0.24, 1.0, 0x7a5032);
  // a bench for the queue
  const [bx, bz] = L.w(-gap - 2.4, 4.5);
  kit.bench(bx, bz, L.yaw + Math.PI / 2, y + 0.24);
}
