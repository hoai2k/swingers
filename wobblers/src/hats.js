// Unlockable head items (found in presents, see src/unlocks.js). Built in the
// same head-local frame as Player.buildHat: head centre at the origin, +Y up,
// +Z the way the face looks, R = head radius. Most parts go into the shared
// vertex-coloured Builder; see-through or glowing bits are extra meshes added
// straight to the hat group.
import * as THREE from 'three';

export const EXTRA_HATS = ['viking', 'chef', 'pirate', 'wizard', 'flowers', 'headphones', 'bunny', 'propeller',
  'astronaut', 'trafficcone', 'halo', 'santa', 'hardhat', 'mortarboard', 'fez', 'catears'];

export const EXTRA_HAT_NAMES = {
  viking: 'Viking helmet', chef: 'Chef hat', pirate: 'Pirate hat', wizard: 'Wizard hat', flowers: 'Flower crown',
  headphones: 'Headphones', bunny: 'Bunny ears', propeller: 'Propeller cap', astronaut: 'Astronaut helmet',
  trafficcone: 'Traffic cone', halo: 'Halo', santa: 'Santa hat', hardhat: 'Hard hat', mortarboard: 'Graduation cap',
  fez: 'Fez', catears: 'Cat ears',
};

const glassMat = new THREE.MeshPhongMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.28, shininess: 120, specular: 0xffffff, depthWrite: false });
const haloMat = new THREE.MeshBasicMaterial({ color: 0xffe36a });

// Adds `kind` to Builder b (and extra meshes to group). Returns false if unknown.
export function buildExtraHat(b, kind, R, c, group) {
  const dark = new THREE.Color(c).multiplyScalar(0.6).getHex();
  switch (kind) {
    case 'viking':
      b.sphere(R * 1.05, 0x9aa3ad, [0, R * 0.3, 0], [1, 0.72, 1], 16);
      b.cyl(R * 1.02, R * 1.06, R * 0.16, 0x8a5a2a, [0, R * 0.32, 0], null, 18);
      for (const s of [-1, 1]) {
        b.cyl(R * 0.2, R * 0.27, R * 0.5, 0xf4ecd8, [s * R * 1.08, R * 0.62, 0], [0, 0, -s * 1.25], 10);
        b.cone(R * 0.2, R * 0.75, 0xf4ecd8, [s * R * 1.42, R * 1.05, 0], [0, 0, -s * 0.35], 10);
      }
      return true;
    case 'chef':
      b.cyl(R * 0.82, R * 0.8, R * 0.45, 0xffffff, [0, R * 0.82, 0], null, 18);
      b.sphere(R * 0.62, 0xffffff, [0, R * 1.35, 0], [1.25, 0.85, 1.25], 14);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.sphere(R * 0.36, 0xf6f6f6, [Math.sin(a) * R * 0.5, R * 1.42, Math.cos(a) * R * 0.5], null, 10); }
      return true;
    case 'pirate':
      b.cyl(R * 0.72, R * 0.8, R * 0.5, 0x1e1e24, [0, R * 0.95, 0], null, 16);
      b.sphere(R * 1.2, 0x1e1e24, [0, R * 0.72, 0], [1, 0.12, 0.85], 18);
      for (const s of [-1, 1]) b.box(R * 1.2, R * 0.5, 0.02, 0x1e1e24, [s * R * 0.5, R * 1.0, -R * 0.1], [0, s * 0.5, s * 0.3]);
      b.cyl(R * 0.81, R * 0.81, R * 0.1, 0xffd23f, [0, R * 0.78, 0], null, 16);
      b.sphere(R * 0.17, 0xffffff, [0, R * 1.02, R * 0.76], [1, 1, 0.5], 10);
      for (const s of [-1, 1]) b.box(R * 0.42, R * 0.06, 0.01, 0xffffff, [0, R * 0.8, R * 0.8], [0, 0, s * 0.6]);
      return true;
    case 'wizard':
      b.cyl(R * 1.35, R * 1.35, 0.02, 0x4a2a9a, [0, R * 0.72, 0], null, 22);
      b.cone(R * 0.72, R * 2.0, 0x4a2a9a, [0, R * 1.7, -R * 0.08], [-0.12, 0, 0], 16);
      b.cyl(R * 0.74, R * 0.74, R * 0.14, 0xffd23f, [0, R * 0.8, 0], null, 16);
      for (const [x, y, z, s] of [[0.32, 1.25, 0.52, 0.12], [-0.4, 1.55, 0.35, 0.09], [0.15, 1.95, 0.25, 0.08], [-0.3, 1.1, -0.6, 0.1]]) b.sphere(R * s, 0xffe36a, [x * R, y * R, z * R], null, 6);
      return true;
    case 'flowers': {
      const cols = [0xff5a8a, 0xffd23f, 0xffffff, 0xb46cff, 0xff8a3d];
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2, x = Math.sin(a) * R * 0.85, z = Math.cos(a) * R * 0.85, y = R * 0.62;
        b.sphere(R * 0.11, 0x4fae45, [Math.sin(a + 0.31) * R * 0.88, y - R * 0.04, Math.cos(a + 0.31) * R * 0.88], [1.4, 0.5, 0.8], 6);
        for (let k = 0; k < 5; k++) { const q = k / 5 * Math.PI * 2; b.sphere(R * 0.085, cols[i % cols.length], [x + Math.sin(a) * 0.01 + Math.cos(q) * R * 0.1 * Math.cos(a), y + Math.sin(q) * R * 0.1, z + Math.cos(q) * R * 0.1 * -Math.sin(a)], null, 6); }
        b.sphere(R * 0.07, 0xffd23f, [x * 1.04, y, z * 1.04], null, 6);
      }
      return true;
    }
    case 'headphones':
      for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + i / 12 * Math.PI; b.sphere(R * 0.1, 0x2a2a33, [Math.sin(a) * R * 1.06, Math.cos(a) * R * 1.06, 0], [1, 1, 1.2], 8); }
      for (const s of [-1, 1]) {
        b.cyl(R * 0.36, R * 0.36, R * 0.2, c, [s * R * 1.02, 0, 0], [0, 0, Math.PI / 2], 16);
        b.cyl(R * 0.3, R * 0.3, R * 0.06, 0x2a2a33, [s * R * 1.13, 0, 0], [0, 0, Math.PI / 2], 16);
      }
      return true;
    case 'bunny':
      for (const s of [-1, 1]) {
        b.sphere(R * 0.24, 0xffffff, [s * R * 0.36, R * 1.48, -R * 0.05], [0.75, 2.4, 0.45], 12);
        b.sphere(R * 0.15, 0xffb7d5, [s * R * 0.36, R * 1.5, R * 0.03], [0.7, 2.2, 0.3], 10);
      }
      b.cyl(R * 0.04, R * 0.04, R * 1.7, 0xffffff, [0, R * 0.92, 0], [0, 0, Math.PI / 2], 6);
      return true;
    case 'propeller':
      b.sphere(R * 1.02, c, [0, R * 0.35, 0], [1, 0.62, 1], 16);
      b.cyl(R * 0.75, R * 0.75, 0.02, dark, [0, R * 0.42, R * 0.55], [0.2, 0, 0], 16);
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; b.box(0.02, R * 0.85, 0.01, [0xff5a5a, 0xffd23f, 0x3f8cff, 0x55d85a][i], [Math.sin(a) * R * 0.25, R * 0.98, Math.cos(a) * R * 0.25], [0, a, 0]); }
      b.cyl(R * 0.05, R * 0.05, R * 0.4, 0xdddddd, [0, R * 1.1, 0], null, 6);
      b.box(R * 1.6, 0.012, R * 0.22, 0xff5a5a, [0, R * 1.3, 0], [0, 0.4, 0.12]);
      b.box(R * 1.6, 0.012, R * 0.22, 0x3f8cff, [0, R * 1.3, 0], [0, 0.4 + Math.PI / 2, -0.12]);
      b.sphere(R * 0.09, 0xffd23f, [0, R * 1.32, 0], null, 8);
      return true;
    case 'astronaut': {
      b.torus(R * 0.95, R * 0.17, 0xf2f2f2, [0, -R * 0.82, 0], [Math.PI / 2, 0, 0], 22);
      b.cyl(R * 0.12, R * 0.12, R * 0.3, 0xdddddd, [R * 0.85, R * 0.75, -R * 0.2], [0, 0, -0.5], 8);
      b.sphere(R * 0.08, 0xff3a3a, [R * 0.95, R * 0.93, -R * 0.2], null, 8);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.32, 24, 16), glassMat);
      dome.position.y = R * 0.04;
      dome.renderOrder = 2;
      group.add(dome);
      return true;
    }
    case 'trafficcone':
      b.box(R * 1.5, R * 0.12, R * 1.5, 0xff7a1a, [0, R * 0.78, 0]);
      b.cone(R * 0.68, R * 1.7, 0xff7a1a, [0, R * 1.68, 0], null, 16);
      b.cyl(R * 0.43, R * 0.53, R * 0.26, 0xffffff, [0, R * 1.4, 0], null, 16);
      b.cyl(R * 0.2, R * 0.29, R * 0.2, 0xffffff, [0, R * 1.95, 0], null, 16);
      return true;
    case 'halo': {
      const h = new THREE.Mesh(new THREE.TorusGeometry(R * 0.62, R * 0.08, 8, 28), haloMat);
      h.position.y = R * 1.55; h.rotation.x = Math.PI / 2 - 0.15;
      group.add(h);
      return true;
    }
    case 'santa':
      b.cyl(R * 0.95, R * 1.0, R * 0.28, 0xffffff, [0, R * 0.62, 0], null, 18);
      b.cone(R * 0.9, R * 1.3, 0xd92a2a, [0, R * 1.35, -R * 0.15], [-0.45, 0, 0], 16);
      b.sphere(R * 0.2, 0xffffff, [0, R * 1.88, -R * 0.55], null, 10);
      return true;
    case 'hardhat':
      b.sphere(R * 1.04, 0xffc61a, [0, R * 0.32, 0], [1, 0.72, 1.05], 16);
      b.cyl(R * 1.22, R * 1.22, 0.025, 0xffc61a, [0, R * 0.42, R * 0.12], [0.06, 0, 0], 20);
      b.box(R * 0.18, R * 0.12, R * 1.9, 0xf2b200, [0, R * 1.04, 0], [0, 0, 0]);
      return true;
    case 'mortarboard':
      b.cyl(R * 0.82, R * 0.86, R * 0.42, 0x1e1e24, [0, R * 0.78, 0], null, 18);
      b.box(R * 2.0, 0.025, R * 2.0, 0x1e1e24, [0, R * 1.02, 0], [0, Math.PI / 4, 0]);
      b.sphere(R * 0.07, 0xffd23f, [0, R * 1.05, 0], null, 8);
      b.box(0.012, 0.012, R * 0.95, 0xffd23f, [R * 0.33, R * 1.04, R * 0.33], [0, Math.PI / 4, 0]);
      b.cyl(0.015, R * 0.08, R * 0.4, 0xffd23f, [R * 0.67, R * 0.85, R * 0.67], null, 6);
      return true;
    case 'fez':
      b.cyl(R * 0.52, R * 0.66, R * 0.62, 0xc8243a, [0, R * 1.0, 0], null, 18);
      b.cyl(0.01, 0.01, R * 0.3, 0x1e1e24, [R * 0.12, R * 1.28, -R * 0.2], [0.5, 0, -0.6], 4);
      b.cyl(0.012, R * 0.07, R * 0.3, 0x1e1e24, [R * 0.3, R * 1.08, -R * 0.4], [0.2, 0, -0.1], 6);
      return true;
    case 'catears':
      b.cyl(R * 0.04, R * 0.04, R * 1.7, 0x2a2a33, [0, R * 0.95, 0], [0, 0, Math.PI / 2], 6);
      for (const s of [-1, 1]) {
        b.cone(R * 0.3, R * 0.5, 0x2a2a33, [s * R * 0.52, R * 1.05, 0], [0, 0, -s * 0.35], 4);
        b.cone(R * 0.17, R * 0.3, 0xffb7d5, [s * R * 0.52, R * 1.02, R * 0.06], [0, 0, -s * 0.35], 4);
      }
      return true;
  }
  return false;
}
