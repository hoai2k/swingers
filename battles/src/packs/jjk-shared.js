// JJK: pieces the Jujutsu Kaisen packs (jjk-*.js) share that once lived in the generic
// Jujutsu pack (removed): the hand-sign and shout animations, Gojo's and Sukuna's stances, the curses' claws, and the
// effect markers (Infinity ripple, invisible cuts, shadow pools, Black Flash burst).
// The ids keep their old jj_ names.
import { register } from '../ext.js';
import { ATTACKS } from '../pose.js';
import { THREE } from './common.js';
import { torus } from './common.js';
import { UPY, STANCE, setArmKey } from './ges-core.js';

// shout: draw breath leaning back, then lean into the word with the arms flung back
ATTACKS.jj_shout = [
  [0.0, null, null, 0, 0, 0],
  [0.35, [0.3, 0.25, -0.3, -1.4], [0.3, 0.25, -0.3, -1.4], 0, -0.3, 0.1],
  [0.5, [-0.2, 0.9, 0.55, 0.3], [-0.2, 0.9, 0.55, 0.3], 0, 0.45, 0.15],
  [0.75, [-0.2, 0.85, 0.5, 0.25], [-0.2, 0.85, 0.5, 0.25], 0, 0.4, 0.15],
  [1.0, null, null, 0, 0, 0],
];
// hand sign: both hands meet in front of the chest (thumbs locked: a wolf's head)
ATTACKS.jj_sign = [
  [0.0, null, null, 0, 0, 0],
  [0.3, [0.9, 0.05, -1.0, -2.3], [0.9, 0.05, -1.0, -2.3], 0, -0.05, 0.05],
  [0.6, [0.95, 0.0, -1.25, -2.2], [0.95, 0.0, -1.25, -2.2], 0, 0.15, 0.2],
  [0.85, [0.95, 0.0, -1.25, -2.2], [0.95, 0.0, -1.25, -2.2], 0, 0.15, 0.2],
  [1.0, null, null, 0, 0, 0],
];
STANCE.jj_sign = (st, pose) => { setArmKey(pose, -1, [0.6, 0.15, -0.6, -1.9]); setArmKey(pose, 1, [0.6, 0.15, -0.6, -1.9]); };
STANCE.jj_pockets = (st, pose) => { setArmKey(pose, -1, [-0.15, 0.32, 0.3, -0.35]); setArmKey(pose, 1, [-0.15, 0.32, 0.3, -0.35]); }; // Gojo
STANCE.jj_king = (st, pose) => { setArmKey(pose, -1, [-0.1, 0.55, -0.2, -0.6]); setArmKey(pose, 1, [-0.1, 0.55, -0.2, -0.6]); }; // Sukuna

function buildProj(type, g, H) {
  const { mesh, cone, sphere, mat, glow } = H;
  const ns = (m) => { m.castShadow = false; return m; };
  if (type === 'jj_flash') { // black flash: black jagged spikes round a red-hot core
    const blk = mat('#0c0610', { emit: 0.1 }), red = glow('#ff2440');
    ns(mesh(sphere(0.16, 8, 6), glow('#fff0f0'), 0, 0, 0, g));
    ns(mesh(sphere(0.42, 12, 8), mat('#ff2040', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g));
    ns(mesh(sphere(0.62, 12, 8), mat('#100008', { transparent: true, opacity: 0.35, depthWrite: false }), 0, 0, 0, g));
    for (let i = 0; i < 14; i++) {
      const dir = new THREE.Vector3(Math.sin(i * 2.4) * Math.cos(i), Math.cos(i * 1.7), Math.cos(i * 2.4) * Math.sin(i + 1)).normalize();
      const L = 0.7 + (i % 3) * 0.3;
      const sp = ns(mesh(cone(0.09, L, 4), i % 3 ? blk : red, dir.x * L * 0.5, dir.y * L * 0.5, dir.z * L * 0.5, g));
      sp.quaternion.setFromUnitVectors(UPY, dir);
    }
    return true;
  }
  if (type === 'jj_pool') { // a pool of shadow on the ground
    ns(mesh(H.cyl(0.85, 0.85, 0.02, 20), mat('#120a1e', { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0, 0, g));
    ns(mesh(torus(H, 0.85, 0.04, Math.PI * 2, 24), glow('#6a4aa8'), 0, 0.01, 0, g)).rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const a = i * 1.26; const w = ns(mesh(cone(0.08, 0.5, 5), mat('#2a1e48', { transparent: true, opacity: 0.6, depthWrite: false }), Math.cos(a) * 0.55, 0.25, Math.sin(a) * 0.55, g)); w.rotation.z = Math.cos(a) * 0.3; }
    return true;
  }
  if (type === 'jj_ripple') { // infinity: a pale ripple in the air where something stopped
    ns(mesh(sphere(0.32, 12, 10), mat('#d8eeff', { emit: 0.8, transparent: true, opacity: 0.3, depthWrite: false }), 0, 0, 0, g));
    for (let i = 0; i < 2; i++) { const t = ns(mesh(torus(H, 0.36 + i * 0.16, 0.012, Math.PI * 2, 20), mat('#f0f8ff', { emit: 1, transparent: true, opacity: 0.6, depthWrite: false }), 0, 0, 0, g)); t.rotation.set(i * 1.2, 0.4, 0.3); }
    return true;
  }
  if (type === 'jj_cut') { // an invisible blade's cut: a thin white streak with a red edge
    for (const [w, y] of [[1.6, 0], [1.1, 0.12]]) { // two parallel cuts, thin at the ends
      const c = ns(mesh(sphere(0.5, 10, 6), glow('#ffffff'), 0, y, 0, g)); c.scale.set(w / 1, 0.06, 0.04);
      const h = ns(mesh(sphere(0.5, 10, 6), mat('#ff2a3a', { emit: 1, transparent: true, opacity: 0.55, depthWrite: false }), 0, y, 0, g)); h.scale.set(w * 0.95, 0.2, 0.1);
    }
    return true;
  }
  return false;
}

register({
  items: { jj_claw: { len: 0.38, r: 0.1, grip: 90, phys: false } }, // (claws: drawn by the body's decorate)
  buildItem(name) { return name === 'jj_claw'; },
  proj: {
    jj_flash: { g: 0, len: 0, r: 0, life: 1 },
    jj_pool: { g: 0, len: 0, r: 0, life: 1 },
    jj_ripple: { g: 0, len: 0, r: 0, life: 1 },
    jj_cut: { g: 0, len: 0, r: 0, life: 1 },
  },
  buildProj,
});
