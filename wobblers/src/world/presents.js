// Presents hidden around the island (Wobbly Life style). Each one bobs and
// spins with a soft glow; touching it (body or hands) opens it with a confetti
// pop and unlocks a cosmetic for everyone (src/unlocks.js keeps the progress).
import * as THREE from 'three';
import { Builder } from '../mesh.js';
import { PRESENTS, TOTAL, isFound, findPresent } from '../unlocks.js';
import { rewardName } from '../cosmetics.js';
import { chime, groundAt } from './common.js';

// id -> [x, z, ray start height, note]. The present sits on whatever static
// surface a downward ray from (x, start, z) hits first (game.groundHeight), so
// a start just under a roof finds the floor inside (null: 2 m above the terrain). `raft` presents ride the
// log raft that starts nearest to (x, z).
const SPOTS = {
  'fountain': [3.6, 0, 1.0, 'in the plaza fountain'],
  'cafe-roof': [19.5, -25, 9, 'cafe rooftop terrace'],
  'arcade': [-19.3, 42.5, 2.5, 'inside the arcade, by the claw machine'],
  'house-upstairs': [-38, 49, 5, 'upstairs bedroom of the two-storey house'],
  'market': [42, -12.5, 2.5, 'inside the market'],
  'under-pier': [22.7, 304.5, 1.0, 'under the pier'],
  'lifeguard': [60, 312, 5, 'top of the lifeguard tower'],
  'lighthouse': [216.5, 224.6, 5, 'behind the lighthouse'],
  'water-slide': [95.3, 85.0, 9, 'top of the water slide tower'],
  'high-dive': [113.8, 104, 7, 'end of the high-dive platform'],
  'slide-tower': [103, -131, 4, 'top of the playground slide'],
  'sandbox': [83, -83, 1, 'in the playground sandbox'],
  'ferris-wheel': [-252.6, -64.2, 2, 'ferris wheel boarding platform'],
  'bouncy-castle': [-205, -78, 3, 'in the bouncy castle'],
  'coaster': [-245, 98.2, 3, 'roller coaster station'],
  'stunt-jump': [-118.5, 79, 5, 'top of the big stunt-park jump'],
  'half-pipe': [-115, 143, 6, 'on the half-pipe deck'],
  'football-goal': [-134, -103, 2.2, 'in the football goal'],
  'grandstand': [297.2, 0, 6, 'top row of the kart grandstand'],
  'lookout': [60, -262, 80, 'mountain lookout'],
  'lake-raft': [-150, -214, 0, 'on a log raft on the lake', true],
  'barn': [215, -172.5, null, 'behind the farm barn'],
  'lake-dock': [-150, -206.8, 3, 'end of the lake dock'],
  'campfire': [-140, -159.5, 60, 'lake camp, between the tents'],
};

const WRAP = [[0xff3a5a, 0xffd23f], [0x3f8cff, 0xffffff], [0x55d85a, 0xff3a9a], [0xb46cff, 0xffd23f], [0xff8a3d, 0x3f8cff], [0xffd23f, 0xff3a3a]];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

function giftMesh(i) {
  const [paper, ribbon] = WRAP[i % WRAP.length];
  const b = new Builder(), s = 0.5;
  b.rbox(s, s * 0.85, s, 0.04, paper, [0, 0, 0]);
  b.rbox(s * 1.08, s * 0.16, s * 1.08, 0.03, paper, [0, s * 0.43, 0]); // lid
  b.box(s * 1.1, s * 1.02, s * 0.14, ribbon, [0, 0.02, 0]);
  b.box(s * 0.14, s * 1.02, s * 1.1, ribbon, [0, 0.02, 0]);
  for (const sd of [-1, 1]) b.sphere(s * 0.16, ribbon, [sd * s * 0.15, s * 0.6, 0], [1.3, 0.8, 0.6], 8);
  b.sphere(s * 0.08, ribbon, [0, s * 0.57, 0], null, 6);
  return b.mesh();
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,250,210,0.9)'); gr.addColorStop(0.35, 'rgba(255,230,140,0.45)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// One shared confetti burst system (instanced quads, reused).
function confetti(game) {
  const N = 160;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.06), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N);
  mesh.frustumCulled = false; mesh.userData.noCull = true; mesh.count = 0;
  const cols = [0xff3a5a, 0xffd23f, 0x3f8cff, 0x55d85a, 0xff3a9a, 0xffffff, 0xb46cff];
  const P = Array.from({ length: N }, (_, i) => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 }));
  for (let i = 0; i < N; i++) mesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  game.scene.add(mesh);
  let next = 0;
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3();
  game.updaters.push((dt) => {
    let alive = 0;
    for (let i = 0; i < N; i++) {
      const c = P[i];
      if (c.life > 0) {
        c.life -= dt; alive++;
        c.v.y -= 6 * dt; c.v.multiplyScalar(1 - 1.8 * dt);
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
      }
      m4.compose(c.p, qq.setFromEuler(c.r), c.life > 0 ? one : zero);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = alive ? N : 0;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (pos) => {
    for (let k = 0; k < 70; k++) {
      const c = P[next]; next = (next + 1) % N;
      c.p.copy(pos);
      const a = Math.random() * Math.PI * 2, up = 3 + Math.random() * 4, out = 1 + Math.random() * 3;
      c.v.set(Math.cos(a) * out, up, Math.sin(a) * out);
      c.w.set(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7);
      c.life = 1.4 + Math.random() * 0.8;
    }
  };
}

export function buildPresents(game) {
  const burst = confetti(game);
  const list = [];
  game.physics.world.updateSceneQueries?.(); // colliders were just added: let rays see them
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  PRESENTS.forEach(([id], i) => {
    const sp = SPOTS[id];
    if (!sp) return;
    const [x, z, from, note, raft] = sp;
    const group = new THREE.Group();
    const box = giftMesh(i);
    group.add(box);
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.7); glow.renderOrder = 3;
    group.add(glow);
    group.userData.noCull = true;
    game.scene.add(group);
    const pr = { id, i, note, group, box, x, z, y: 0, body: null, local: null, found: false };
    if (raft) {
      // the raft body that starts closest to (x, z)
      let bd = 4;
      game.physics.world.bodies.forEach((b) => {
        if (!b.isDynamic()) return;
        const t = b.translation(), d = Math.hypot(t.x - x, t.z - z);
        if (d < bd) { bd = d; pr.body = b; }
      });
      pr.local = new THREE.Vector3(0.35, 0.65, 0.2);
    }
    if (!pr.body) pr.y = game.groundHeight(x, z, from ?? groundAt(x, z) + 2) + 0.42;
    list.push(pr);
  });

  const place = (pr) => {
    if (!pr.body) { _v.set(pr.x, pr.y, pr.z); return _v; }
    const r = pr.body.rotation(), t = pr.body.translation();
    return _v.copy(pr.local).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(t);
  };
  const sync = () => { for (const pr of list) { pr.found = isFound(pr.id); pr.group.visible = !pr.found; } };
  sync();

  // touch check at physics rate: chest or either hand within reach of the box
  const hand = new THREE.Vector3();
  game.steppers.push(() => {
    for (const pr of list) {
      if (pr.found) continue;
      const c = place(pr);
      pr.pos = pr.pos || new THREE.Vector3(); pr.pos.copy(c);
      for (const p of game.players) {
        if (!p.chest) continue;
        const t = p.chest.translation();
        let hit = Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z) < 0.8;
        if (!hit && p.handPos) for (const h of ['L', 'R']) if (p.handPos(h, hand).distanceTo(c) < 0.45) { hit = true; break; }
        if (hit) { open(pr, p); break; }
      }
    }
  });

  function open(pr, p) {
    const key = findPresent(pr.id);
    pr.found = true; pr.group.visible = false;
    if (!key) return;
    const pos = pr.pos.clone();
    burst(pos);
    game.audio?.play('pop', pos);
    chime(game, pos, [72, 76, 79, 84, 88], 0.25);
    const n = list.filter((q) => q.found).length;
    game.ui?.toast(`P${p.index + 1} found a present: ${rewardName(key)}! <small>${n}/${TOTAL}</small>`, p.color);
    for (const pn of game.ui?.panels?.values?.() || []) pn.draw?.(); // live progress in open menus
  }

  // visual bob + spin
  game.updaters.push((dt, t) => {
    for (const pr of list) {
      if (pr.found) continue;
      const c = pr.pos || place(pr);
      pr.group.position.copy(c);
      // only drawn within 120 m of some player's camera (saves draw calls)
      pr.group.visible = !game.players.length || game.players.some((p) => p.camera?.cam && p.camera.cam.position.distanceToSquared(c) < 14400);
      pr.box.position.y = Math.sin(t * 2.2 + pr.i) * 0.08;
      pr.box.rotation.y = t * 1.1 + pr.i;
    }
  });

  game.presents = {
    list,
    reset: sync, // after the progress is cleared (pause menu)
    // probe helper: world position of a present by id
    where: (id) => { const pr = list.find((q) => q.id === id); return pr && place(pr).clone(); },
  };
}
