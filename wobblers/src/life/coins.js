// Spinning coin pickups scattered around the island: trails along the roads,
// rings in the parks, little clusters on rooftops and other hard-to-reach
// spots, a line hanging in the air over the stunt-park jump (drive through it)
// and big 10-coin pieces at the hardest spots. Walk (or drive) through one to
// collect it; it comes back after a while. One instanced mesh draws them all.
import * as THREE from 'three';
import { SEA_LEVEL } from '../config.js';

// [x, z, ray start (null: just above the terrain), shape, count, size, opts]
//   shape 'ring' (radius size), 'line' (length size along opts.yaw, default +x),
//   'one'; opts.big: 10-coin pieces; opts.y: fixed height (no ray); opts.lift: extra height.
// Regions add clusters with R.coins(x, z, from, shape, n, size, opts) while they build.
const REGION_CLUSTERS = [];
export const addCoinCluster = (...c) => REGION_CLUSTERS.push(c);
const CLUSTERS = [
  // town
  [0, 0, 2, 'ring', 10, 9.5],
  [0, 32, 1, 'line', 6, 14, { yaw: Math.PI / 2 }],
  [0, -32, 1, 'line', 6, 14, { yaw: Math.PI / 2 }],
  [32, 0, 1, 'line', 6, 14],
  [-32, 0, 1, 'line', 6, 14],
  [-60, 20, 1, 'line', 6, 24, { yaw: Math.PI / 2 }],
  [60, -20, 1, 'line', 6, 24, { yaw: Math.PI / 2 }],
  [19.5, -25, 9, 'ring', 5, 2.2],                  // cafe roof terrace
  [-42, -38, 11.5, 'ring', 6, 6.5],               // town hall roof
  [-42, -38, 17, 'one', 1, 0, { big: true }],     // top of the clock tower
  [42, -42, 20, 'ring', 5, 3.5],                  // apartment roof
  [42, -42, 20, 'one', 1, 0, { big: true }],
  [42, 42, 17, 'line', 5, 8],
  [-38, 47, 11, 'one', 1, 0, { big: true }],      // on the two-storey house's chimney side of the roof
  // suburbs and ring road
  [105, 0, 1, 'line', 8, 40],
  [-105, 0, 1, 'line', 8, 40],
  [0, 105, 1, 'line', 8, 40, { yaw: Math.PI / 2 }],
  [0, -105, 1, 'line', 8, 40, { yaw: Math.PI / 2 }],
  [150, 150, 1, 'ring', 6, 4], [-150, 150, 1, 'ring', 6, 4], [150, -150, 1, 'ring', 6, 4], [-150, -150, 1, 'ring', 6, 4],
  // playground, pool
  [105, -105, 2, 'ring', 8, 7],
  [103, -131, 4, 'one', 1, 0, { big: true }],     // slide tower
  [100, 100, 0, 'line', 6, 18, { water: true }],     // on the pool floor: dive for them
  [113.8, 104, 7, 'one', 1, 0, { big: true, lift: 0.4 }], // high dive
  [95.3, 85, 9, 'one', 1, 0, { big: true }],      // water slide top
  // fun park
  [-242, -10, 2, 'ring', 10, 8],
  [-252.6, -64.2, 2, 'line', 4, 4],
  [-245, 98.2, 3, 'line', 4, 4],
  [-205, -78, 3, 'ring', 4, 1.6],                 // bouncy castle
  // stunt park: coins in the air over the big jump, a line on the fun box, the half-pipe deck
  [-110, 79, null, 'line', 7, 9, { y: 5.0 }],
  [-105, 79, null, 'one', 1, 0, { big: true, y: 6.2 }],
  [-105, 115, 3, 'line', 4, 5],
  [-115, 143, 6, 'ring', 4, 1.5],
  [-77, 110, 3, 'line', 3, 6, { yaw: Math.PI / 2 }], // top of the quarter pipe
  // sports field, kart track, farm
  [-105, -103, 2, 'line', 8, 40],
  [-134, -103, 3, 'one', 1, 0, { big: true }],    // on top of the goal
  [-103, -55, 2, 'ring', 5, 3],                   // basketball court
  [242.5, 0, 2, 'line', 8, 60, { yaw: Math.PI / 2 }],
  [297.2, 0, 6, 'one', 1, 0, { big: true }],      // grandstand top row
  [215, -150, 2, 'ring', 8, 6],
  // mountain, lake
  [60, -262, 80, 'ring', 6, 3],
  [60, -262, 80, 'one', 1, 0, { big: true, lift: 0.6 }],
  [-140, -159.5, 60, 'ring', 6, 3.5],
  [-150, -206.8, 3, 'line', 4, 5, { yaw: Math.PI / 2 }],
  // beach, pier, lighthouse, lifeguard
  [-40, 330, 3, 'line', 10, 50],
  [24, 360, 3, 'line', 8, 30, { yaw: Math.PI / 2 }],
  [214, 236, 3, 'ring', 6, 6],
  [60, 312, 5, 'one', 1, 0, { big: true }],
  [22.7, 304.5, 1.0, 'line', 3, 3],               // under the pier
];

const SMALL = 1, BIG = 10;
const RESPAWN = [75, 240]; // seconds (small, big)

export function buildCoins(game) {
  game.physics.world.updateSceneQueries?.();
  const coins = [];
  for (const [x, z, from, shape, n, size, o = {}] of [...CLUSTERS, ...REGION_CLUSTERS]) {
    const pts = [];
    if (shape === 'one') pts.push([x, z]);
    else if (shape === 'ring') for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([x + Math.sin(a) * size, z + Math.cos(a) * size]); }
    else {
      const yaw = o.yaw || 0, dx = Math.cos(yaw), dz = Math.sin(yaw);
      for (let i = 0; i < n; i++) { const t = n > 1 ? i / (n - 1) - 0.5 : 0; pts.push([x + dx * t * size, z + dz * t * size]); }
    }
    for (const [px, pz] of pts) {
      let y;
      if (o.y != null) y = o.y;
      else {
        const start = from ?? 60;
        const gy = game.groundHeight(px, pz, start);
        if (gy < -5 || (gy < SEA_LEVEL - 0.05 && !o.water)) continue; // nothing there (or the sea floor)
        y = gy + 0.75 + (o.lift || 0);
      }
      coins.push({ x: px, y, z: pz, big: !!o.big, value: o.big ? BIG : SMALL, active: true, timer: 0, pop: 0, phase: Math.random() * 6 });
    }
  }

  // one instanced mesh: a fat gold disc with a raised rim
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 20).rotateX(Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({ color: 0xffc61a, emissive: 0x6a4a00, specular: 0xfff4c0, shininess: 70 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, coins.length));
  mesh.frustumCulled = false; mesh.userData.noCull = true; mesh.castShadow = false; // ~800 coins: no shadow pass for them
  game.scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

  let combo = 0, comboT = 0;
  const collect = (c, player) => {
    c.active = false; c.pop = 0.3; c.timer = RESPAWN[c.big ? 1 : 0] * (0.85 + Math.random() * 0.3);
    if (performance.now() / 1000 - comboT < 1.2) combo = Math.min(combo + 1, 8); else combo = 0;
    comboT = performance.now() / 1000;
    game.wallet.add(player, c.value, c.big ? 'Big coin!' : '', { pitch: combo });
  };

  const DT = 1 / 60;
  const v = new THREE.Vector3();
  game.steppers.push(() => {
    // riders: players on foot (chest within reach) and drivers' vehicles
    const takers = [];
    for (const pl of game.players) {
      if (!pl.chest) continue;
      if (pl.seat?.vehicle) { const t = pl.seat.vehicle.body.translation(); takers.push([t.x, t.y, t.z, 2.6, pl]); }
      else { const t = pl.chest.translation(); takers.push([t.x, t.y, t.z, 1.05, pl]); }
    }
    for (const c of coins) {
      if (!c.active) { if ((c.timer -= DT) <= 0) c.active = true; continue; }
      for (const [tx, ty, tz, r, pl] of takers) {
        const dx = tx - c.x, dy = ty - c.y, dz = tz - c.z;
        if (dx * dx + dy * dy + dz * dz < r * r * (c.big ? 1.3 : 1)) { collect(c, pl); break; }
      }
    }
  });

  game.updaters.push((dt, t) => {
    const cams = game.players.map((pl) => pl.camera?.cam?.position).filter(Boolean);
    let n = 0; // only coins someone can see are packed into the instance list (and drawn)
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      let sc = c.big ? 1.9 : 1, y = c.y + Math.sin(t * 2.4 + c.phase) * 0.08, spin = t * 3 + c.phase;
      if (!c.active) {
        if (c.pop > 0) { c.pop -= dt; const k = 1 - c.pop / 0.3; sc *= 1 + k * 0.6; y += k * 1.2; spin += k * 20; if (c.pop <= 0) sc = 0; else sc *= 1 - k * k; }
        else sc = 0;
      }
      if (sc && cams.length) {
        let near = false;
        for (const cp of cams) if (v.set(c.x - cp.x, y - cp.y, c.z - cp.z).lengthSq() < 160 * 160) { near = true; break; }
        if (!near) sc = 0;
      }
      if (!sc) continue;
      m4.compose(p.set(c.x, y, c.z), q.setFromAxisAngle(Y, spin), s.setScalar(sc));
      mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });

  game.coins = {
    list: coins,
    mesh,
    activeCount: () => coins.filter((c) => c.active).length,
    respawnAll: () => { for (const c of coins) { c.active = true; c.timer = 0; } },
  };
}
