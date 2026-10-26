// The river: a rock cliff with a waterfall falling past a cave mouth into a
// plunge pool, the stream cascading down the gully to the lip, rapids with
// rocks and white water, a river current that carries swimmers and boats
// toward the sea, and the RAFT RIDE (a kinematic log raft from the pool jetty
// down the rapids to the jetty by the river mouth).
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { SEA_LEVEL, DT } from '../../../config.js';
import { Builder } from '../../../mesh.js';
import { CLIFF, POOL, RIVER, GULLY, polyDist } from '../jungle.js';
import { pathRide, climb } from './rides.js';

const ROCK = 0x76705f, ROCK2 = 0x67624f, MOSS = 0x4f7a32;
export const RAPIDS = [42, 105]; // river arc length (m) of the rapids

// shared flowing-water material (scrolling streak texture)
let flowTex = null;
export function flowMaterial(game, opacity = 0.85, color = 0xffffff) {
  if (!flowTex) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#7fd8ff'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
      g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 10 + Math.random() * 50);
    }
    flowTex = new THREE.CanvasTexture(cv);
    flowTex.wrapS = flowTex.wrapT = THREE.RepeatWrapping;
    flowTex.colorSpace = THREE.SRGBColorSpace;
    game.updaters.push((dt) => { flowTex.offset.y += dt * 1.4; });
  }
  return new THREE.MeshBasicMaterial({ map: flowTex, color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, fog: true });
}

// soft round puff for smoke / mist / spray sprites
let puffTex = null;
export function puffTexture() {
  if (puffTex) return puffTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(cv);
  return puffTex;
}

// a ribbon of flowing water along points [[x, y, z], ...] with width w
function ribbon(game, pts, w, mat, repeat = 0.12) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const [x, y, z] = pts[i];
    pos.push(x - tz * w / 2, y, z + tx * w / 2, x + tz * w / 2, y, z - tx * w / 2);
    uv.push(0, -acc * repeat, 1, -acc * repeat);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  game.scene.add(m);
  return m;
}

export function buildRiver(game, kit, R) {
  const L = new R.Local(kit, 0, 0, 0);
  const { x0, x1, z0, z1, top } = CLIFF;
  // ---- the cliff block with the cave inside ----------------------------------------
  const zc = (z0 + z1) / 2, mouth = [810, 822], mouthH = 5.2;
  kit.box(x0 + 2, (top - 0.5) / 2 + 1, zc, 4.4, top + 1.5, z1 - z0, ROCK);              // back wall
  for (const z of [z0 + 2, z1 - 2]) kit.box((x0 + x1) / 2, top / 2, z, x1 - x0, top + 1, 4, ROCK2); // side walls
  kit.box((x0 + x1 + 5) / 2, top - 1, zc, x1 - x0 + 5, 2.2, z1 - z0, ROCK);          // roof slab, overhanging the ledge
  kit.box(x1 - 1, top / 2, (z0 + 4 + mouth[0]) / 2, 2.2, top, mouth[0] - z0 - 4, ROCK2); // front wall, either side of the mouth
  kit.box(x1 - 1, top / 2, (mouth[1] + z1 - 4) / 2, 2.2, top, z1 - 4 - mouth[1], ROCK2);
  kit.box(x1 - 1, (mouthH + top - 2) / 2, (mouth[0] + mouth[1]) / 2, 2.2, top - 2 - mouthH, mouth[1] - mouth[0], ROCK);
  kit.box(x1 + 2, 0.05, zc, 4.2, 1.1, z1 - z0 - 6, ROCK2, { round: 0.3 });             // the ledge behind the falls (top y 0.6)
  kit.box((x0 + x1) / 2, 0.35, zc, x1 - x0 - 6, 0.3, z1 - z0 - 6, 0x5a5546);            // cave floor
  // boulders and moss on top and round the base (visual + colliders)
  const rnd = R.rng(11);
  for (let i = 0; i < 26; i++) {
    const x = x0 + rnd() * (x1 - x0 + 4), z = z0 + rnd() * (z1 - z0), s = 1.2 + rnd() * 2.2;
    kit.rock(x, z, top - 0.6, s);
  }
  for (let i = 0; i < 18; i++) {
    const z = z0 + rnd() * (z1 - z0), y = 1 + rnd() * (top - 3);
    if (z > mouth[0] - 1 && z < mouth[1] + 1 && y < mouthH + 1) continue;
    kit.deco(x1 + 0.15, y, z, 0.25, 1 + rnd() * 2.5, 1.5 + rnd() * 3, rnd() < 0.5 ? MOSS : 0x3f6a2a);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) kit.deco(x1 + 0.4, top - 2 - i * 1.8, zc + s * (8 + i * 2.5), 0.08, 3.5, 0.08, 0x3f7a2a); // hanging vines
  // inside: glowing crystals, mushrooms, a treasure chest and the cave present
  const glow = 0x9fffe8;
  for (const [x, z, h, a] of [[-600, 805, 1.6, 0.3], [-599, 806, 1.0, -0.4], [-600, 827, 1.4, 0.2], [-592, 827, 1.1, -0.2], [-601, 816, 1.8, 0.1], [-601, 819, 1.2, -0.3]])
    kit.cone(x, 0.5 + h / 2, z, 0.35, h, glow, { seg: 5, euler: [a, 0, a * 0.6] });
  for (const [x, z] of [[-594, 805], [-596, 828], [-590, 806]]) { kit.cyl(x, 0.9, z, 0.12, 1, 0xf2e6c4, { collide: false, seg: 6 }); kit.sphere(x, 1.45, z, 0.45, 0x9fd8ff, { scale: [1, 0.45, 1], seg: 8 }); }
  game.interiorLights?.add(-595, 4, 816, { color: 0x9fffe8, intensity: 7, range: 16, fixture: 'none' });
  kit.box(-600.5, 0.85, 812.5, 1.4, 0.8, 0.9, 0x8a5a2a); kit.deco(-600.5, 1.3, 812.5, 1.45, 0.25, 0.95, 0xffd23f); // chest
  R.present('jungle-cave', 'hat:explorer', -599, 816, 4, 'in the cave behind the waterfall');
  R.coins(-595, 816, 4, 'ring', 8, 4.5);
  R.coins(-600.5, 812.5, 3, 'one', 1, 0, { big: true });
  // stairs from the north bank down to the ledge
  const gB = R.groundAt(x1 + 2, z0 - 9);
  L.stairs(x1 + 2, z0 - 9.5, gB, x1 + 2, z0 + 2.5, 0.6, 2.6, 0x7a5032, 0x8a6a3a);
  for (const s of [-1, 1]) L.rail(x1 + 2 + s * 1.35, z0 - 9.5, x1 + 2 + s * 1.35, z0 + 2.5, 0.6, 1.0, 0x6b4a2a);
  R.sign('WATERFALL', x1 + 4.8, gB + 2.4, z0 - 10, Math.PI / 2, 3.6, '#2b9cb0', '#ffffff');
  kit.cyl(x1 + 4.8, gB + 1.1, z0 - 10, 0.1, 2.2, 0x6b4a2a);

  // ---- water: the fall, the stream on the roof, the cascade down the gully ------------
  const fallMat = flowMaterial(game, 0.82);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(mouth[1] - mouth[0] + 2, top + 0.6, 1, 8), fallMat);
  { const p = fall.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, Math.pow((top / 2 - y) / top, 2) * -1.4 + 0.5); } fall.geometry.computeVertexNormals(); }
  const uvs = fall.geometry.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setY(i, uvs.getY(i) * 3);
  fall.rotation.y = Math.PI / 2; fall.position.set(x1 + 5.4, (top + SEA_LEVEL) / 2 + 0.1, (mouth[0] + mouth[1]) / 2);
  fall.renderOrder = 2; fall.userData.noCull = true;
  game.scene.add(fall);
  const stream = [];
  for (let x = x0 + 1; x <= x1 + 5.2; x += 2) stream.push([x, top + 0.12, (mouth[0] + mouth[1]) / 2]);
  ribbon(game, stream, mouth[1] - mouth[0], flowMaterial(game, 0.8), 0.2);
  // cascade: from the gully end down to the back of the block
  const cas = [];
  const g0 = GULLY[GULLY.length - 2], g1 = GULLY[GULLY.length - 1], end = [x0 - 1, (mouth[0] + mouth[1]) / 2];
  for (const [a, b] of [[g0, g1], [g1, end]]) for (let t = 0; t < 1; t += 0.1) {
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    cas.push([x, Math.max(R.groundAt(x, z), top) + 0.25, z]);
  }
  cas.push([x0 + 1, top + 0.15, end[1]]);
  ribbon(game, cas, 4, flowMaterial(game, 0.75), 0.15);
  // foam + mist at the foot of the falls
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const foam = new THREE.Mesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), foamMat);
  foam.scale.set(4, 1, 8); foam.position.set(x1 + 6, SEA_LEVEL + 0.06, (mouth[0] + mouth[1]) / 2); foam.renderOrder = 2;
  game.scene.add(foam);
  const mist = [];
  const mistMat = new THREE.SpriteMaterial({ map: puffTexture(), color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(mistMat); s.scale.setScalar(5); game.scene.add(s); mist.push(s); }
  game.updaters.push((dt, t) => {
    foam.scale.set(4 + Math.sin(t * 3) * 0.3, 1, 8 + Math.sin(t * 2.3) * 0.4);
    mist.forEach((s, i) => {
      const k = (t * 0.35 + i / mist.length) % 1;
      s.position.set(x1 + 6 + Math.sin(i * 2.1) * 2.5, SEA_LEVEL + k * 6, (mouth[0] + mouth[1]) / 2 + Math.cos(i * 1.7) * 4);
      s.material.opacity = 0.35;
      s.scale.setScalar(3 + k * 5);
    });
  });
  // soak + push anyone standing under the falls
  game.steppers.push(() => {
    for (const p of game.players) {
      const c = p.chest.translation();
      if (Math.abs(c.x - (x1 + 5.4)) < 1.2 && c.z > mouth[0] && c.z < mouth[1] && c.y < top) {
        for (const b of p.bodies) b.applyImpulse({ x: 0, y: -0.25 * b.mass(), z: 0 }, true);
      }
    }
  });

  // ---- rapids: rocks, white water --------------------------------------------------
  const tan = (s) => { // point + tangent at river arc length s
    let acc = 0;
    for (let i = 0; i < RIVER.length - 1; i++) {
      const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1], l = Math.hypot(bx - ax, bz - az);
      if (acc + l >= s || i === RIVER.length - 2) { const t = (s - acc) / l; return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / l, (bz - az) / l]; }
      acc += l;
    }
  };
  const wm = new Builder();
  for (let s = RAPIDS[0]; s < RAPIDS[1]; s += 6) {
    const [x, z, tx, tz] = tan(s);
    const side = (rnd() < 0.5 ? -1 : 1) * (3.2 + rnd() * 2.5);
    kit.rock(x - tz * side, z + tx * side, -2.2, 1.0 + rnd() * 0.8);
    wm.add(new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2), 0xffffff, [x + (rnd() - 0.5) * 5, SEA_LEVEL + 0.05, z + (rnd() - 0.5) * 5], null, [1.5 + rnd() * 2, 1, 0.7 + rnd()]);
  }
  const white = wm.mesh(foamMat, { shadow: false }); white.renderOrder = 2; game.scene.add(white);
  game.updaters.push((dt, t) => { white.position.y = Math.sin(t * 4) * 0.03; foamMat.opacity = 0.45 + Math.sin(t * 5) * 0.1; });

  // ---- river current: pushes floating things and swimmers toward the sea ------------
  const objs = game.physics.objects;
  let k = 0;
  game.steppers.push(game.whenNear(-455, 850, 260, () => {
    if ((k++ & 1)) return;
    const push = (body, mass, x, z, scale) => {
      const [d, s] = polyDist(x, z, RIVER);
      if (d > 9) return;
      const [, , tx, tz] = tan(s);
      const want = s > RAPIDS[0] && s < RAPIDS[1] ? 2.6 : 0.9, v = body.linvel();
      const along = v.x * tx + v.z * tz;
      if (along < want) { const j = (want - along) * mass * 2 * DT * scale; body.applyImpulse({ x: tx * j, y: 0, z: tz * j }, true); }
    };
    for (const o of objs) {
      if (!o.wet || !o.body.isDynamic()) continue;
      const t = o.body.translation();
      if (t.x < -580 || t.x > -330 || t.z < 800 || t.z > 900) continue;
      push(o.body, o.body.mass(), t.x, t.z, 1);
    }
    for (const p of game.players) {
      if (!p.swimming) continue;
      const t = p.chest.translation();
      if (t.x < -580 || t.x > -330 || t.z < 800 || t.z > 900) continue;
      for (const b of p.bodies) push(b, b.mass(), t.x, t.z, 0.6);
    }
  }));

  // ---- RAFT RIDE --------------------------------------------------------------------
  const S0 = [-551, 814];
  // start jetty (north bank of the pool) with stairs down from the track
  const jx = -551, jz = 806.5;
  kit.box(jx, 0.25, jz, 9, 0.3, 3, 0xb98a5a);
  for (const sx of [-4, 0, 4]) kit.cyl(jx + sx, -1.2, jz + 1.2, 0.15, 3, 0x7a5032, { seg: 6 });
  const gJ = R.groundAt(jx, 795);
  L.stairs(jx, 795, gJ, jx, jz - 1.3, 0.4, 2.4, 0x8a6a3a, 0x7a5032);
  for (const s of [-1, 1]) L.rail(jx + s * 1.25, 795, jx + s * 1.25, jz - 1.3, 0.4, 1.0, 0x6b4a2a);
  R.sign('RAFT RIDE', jx + 3.5, gJ + 2.2, 794, 0, 3.6, '#b5773d', '#ffffff');
  kit.cyl(jx + 3.5, gJ + 1, 794, 0.1, 2, 0x6b4a2a);
  // end jetty by the river mouth
  const ex = -402, ez = 849;
  kit.box(ex, 0.25, ez, 8, 0.3, 3, 0xb98a5a);
  const gE = R.groundAt(ex, 842);
  L.stairs(ex + 2.5, ez - 1.3, 0.4, ex + 2.5, 841.5, gE, 2.2, 0x8a6a3a, 0x7a5032);
  // the path: down the pool, through the rapids, to the end jetty
  const path = [{ x: S0[0], y: SEA_LEVEL + 0.15, z: S0[1] }];
  for (let i = 1; i < RIVER.length; i++) {
    const [x, z] = RIVER[i];
    if (x > ex) break;
    path.push({ x, y: SEA_LEVEL + 0.15, z });
  }
  path.push({ x: ex + 1, y: SEA_LEVEL + 0.15, z: ez + 4.6 });
  const raftB = new Builder();
  for (let i = 0; i < 7; i++) raftB.cyl(0.22, 0.22, 3.6, [0x9a6a3a, 0x8a5a36][i % 2], [-1.2 + i * 0.4, 0, 0], [Math.PI / 2, 0, 0], 8);
  for (const z of [-1.4, 0, 1.4]) raftB.box(3.0, 0.1, 0.18, 0x6b4a2a, [0, 0.22, z]);
  for (const s of [-1, 1]) raftB.box(0.12, 0.5, 3.2, 0xd9c08a, [s * 1.45, 0.45, 0]);  // rope rails
  raftB.cyl(0.05, 0.05, 2.2, 0x6b4a2a, [0, 1.3, -1.5], null, 5); raftB.box(0.03, 0.6, 0.9, 0xff5a3a, [0, 2.1, -1.1]);
  const ride = pathRide(game, {
    path, label: 'Raft ride', hint: 'Hold on! · Y jump off',
    mesh: raftB.mesh(),
    colliders: [RAPIER.ColliderDesc.cuboid(1.45, 0.22, 1.8)],
    seats: [{ pos: [0.6, 0.5, 0.8] }, { pos: [-0.6, 0.5, 0.8] }, { pos: [0.6, 0.5, -0.5] }, { pos: [-0.6, 0.5, -0.5] }],
    wait: 4, back: 10,
    speed: (s) => (s > RAPIDS[0] - 8 && s < RAPIDS[1] ? 6.5 : 3.6),
    bob: (st, t) => {
      const r = st.mode === 'go' && st.s > RAPIDS[0] - 8 && st.s < RAPIDS[1] ? 1 : 0.15;
      return { y: Math.sin(t * 6.1) * 0.18 * r + Math.abs(Math.sin(t * 2.3)) * 0.12 * r, roll: Math.sin(t * 4.3) * 0.12 * r, pitch: Math.sin(t * 5.2) * 0.09 * r, side: Math.sin(t * 0.9) * 2 * r };
    },
    onStart: () => R.common.chime(game, { x: S0[0], y: 1, z: S0[1] }, [67, 72, 76]),
  });
  game.raftRide = ride;
  // a paddling guide on the jetty and a few canoes to borrow
  R.npc('rafter', jx - 2.5, jz, { yaw: Math.PI });
  for (const [x, z, y] of [[-560, 811, 0.4], [-544, 812, -0.2]]) R.vehicle('canoe', x, z, Math.PI / 2 + y, [0xd9542b, 0xffd23f][x < -550 ? 0 : 1]);
  R.vehicle('lograft', -385, 858, Math.PI / 2 + 0.3);
  R.coins(-505, 829, null, 'line', 8, 40, { y: SEA_LEVEL + 1.2, yaw: Math.atan2(829 - 820, -505 + 540) }); // over the river: grab them on the raft

}
