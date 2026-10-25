// Desert vehicles, registered at import: a dune buggy (light, long-travel
// suspension, made for dune jumps), a monster truck (huge wheels, rolls over
// anything) and two rideable animals, a camel and a horse. The animals are
// wheeled vehicles with invisible wheels hung well below the body and an
// 'animal' handling that walks their legs with the speed; Y gets on.
import * as THREE from 'three';
import { registerVehicle, registerHandling } from '../../../vehicles.js';
import { registerCallable } from '../../../phone.js';
import { Builder, matVC } from '../../../mesh.js';

const PI = Math.PI;
const ax2 = (x, y, zf, zr, r, rest, fd, wide) => [
  { z: zf, x, y, r, rest, steer: 1, drive: fd, wide },
  { z: zr, x, y, r, rest, steer: 0, drive: 1 - fd, hand: true, wide },
];
const tube = (b, a, c, r, col) => { // a cylinder from point a to point c (body frame)
  const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.add(new THREE.CylinderGeometry(r, r, len, 6), col, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], q);
};

// ---- dune buggy --------------------------------------------------------------------
registerVehicle('buggy', {
  mass: 520, half: [0.8, 0.22, 1.55], open: true,
  axles: ax2(0.92, -0.02, 1.08, -1.0, 0.46, 0.42, 0.35, 0.34), accel: 11.5, maxSpeed: 27, rev: 9, brakeDecel: 13, steer: 0.6, grip: 1.55,
  susp: { k: 15, c: 1.45 }, com: [0, -0.32, 0], tipH: 0.3,
  seats: [{ pos: [0.34, 0.12, -0.2], kind: 'driver' }, { pos: [-0.34, 0.12, -0.2] }],
  camH: 1.4, camDist: 7.5, horn: 'quad', voice: 'quad', lights: { head: [0.32, 1.45], tail: [0.2, -1.55] },
  mesh(b, def, c, P) {
    const h = def.half, cage = 0x2a2a33;
    b.rbox(1.4, 0.26, 3.0, 0.1, c, [0, -0.02, 0]);                     // tub
    b.rbox(1.2, 0.3, 0.9, 0.12, c, [0, 0.16, 1.15], [-0.25, 0, 0]);     // nose
    b.rbox(1.25, 0.42, 0.7, 0.1, 0x4a4a52, [0, 0.22, -1.2]);            // engine
    b.cyl(0.36, 0.36, 0.22, 0x1e1e24, [0, 0.52, -1.48], [PI / 2, 0, 0], 14); // spare tyre
    for (const sx of [-1, 1]) {
      b.rbox(0.5, 0.55, 0.16, 0.06, 0x222228, [sx * 0.34, 0.3, -0.5]);   // seat backs
      tube(b, [sx * 0.62, 0.1, 0.55], [sx * 0.5, 1.25, 0.05], 0.045, cage);
      tube(b, [sx * 0.5, 1.25, 0.05], [sx * 0.5, 1.25, -0.75], 0.045, cage);
      tube(b, [sx * 0.5, 1.25, -0.75], [sx * 0.62, 0.15, -1.0], 0.045, cage);
      tube(b, [sx * 0.66, 0.1, 1.45], [sx * 0.66, 0.1, -1.5], 0.04, cage);
    }
    tube(b, [-0.5, 1.25, 0.05], [0.5, 1.25, 0.05], 0.045, cage);
    tube(b, [-0.5, 1.25, -0.75], [0.5, 1.25, -0.75], 0.045, cage);
    tube(b, [-0.7, 0.05, 1.62], [0.7, 0.05, 1.62], 0.05, cage);          // bull bar
    b.box(1.0, 0.05, 0.4, 0xffd23f, [0, 1.29, -0.35]);                   // roof flag strip
    b.cyl(0.015, 0.015, 1.6, 0xdddddd, [-0.55, 1.6, -1.2], null, 4);    // whip flag
    b.box(0.02, 0.22, 0.34, 0xff5a3a, [-0.55, 2.3, -1.03]);
    P.b.rbox(0.44, 0.1, 0.24, 0.04, 0x33333a, [0.34, 0.28, 0.45]);       // dash
    b.cyl(0.15, 0.15, 0.03, 0x22222a, [0.34, 0.5, 0.3], [1.1, 0, 0], 12);
    for (const sx of [-1, 1]) for (const z of [1.08, -1.0]) tube(b, [sx * 0.4, 0, z], [sx * 0.85, -0.02, z], 0.05, 0xffd23f); // a-arms
    void h;
  },
});

// ---- monster truck -------------------------------------------------------------------
registerVehicle('monster', {
  mass: 2400, half: [1.05, 0.42, 2.25], cabin: { half: [0.95, 0.5, 0.85], off: [0, 0.92, 0.1] },
  axles: ax2(1.42, -0.15, 1.65, -1.6, 1.0, 0.62, 0.5, 0.75), accel: 9.5, maxSpeed: 25, rev: 9, brakeDecel: 12, steer: 0.55, grip: 1.45,
  susp: { k: 12, c: 1.35 }, com: [0, -0.9, 0], tipH: 0.7,
  seats: [{ pos: [0.42, 0.42, 0.15], kind: 'driver' }, { pos: [-0.42, 0.42, 0.15] }],
  camH: 2.4, camDist: 11.5, horn: 'truck', voice: 'firetruck', lights: { head: [0.12, 2.24], tail: [0.12, -2.25] },
  colliders(add, C, def) {
    const h = def.half, ch = def.cabin.half, co = def.cabin.off;
    add(C.roundCuboid(h[0] - 0.08, h[1] - 0.08, h[2] - 0.08, 0.08));
    add(C.roundCuboid(ch[0] - 0.1, ch[1] - 0.1, ch[2] - 0.1, 0.1).setTranslation(...co));
  },
  mesh(b, def, c, P, v) {
    const h = def.half, dark = 0x22222a, ch = def.cabin.half, co = def.cabin.off;
    b.rbox(h[0] * 2, h[1] * 2, h[2] * 2, 0.2, c, [0, 0, 0], null, 3);
    b.rbox(h[0] * 2 + 0.06, 0.1, h[2] * 2 - 0.4, 0.04, 0xffffff, [0, 0.05, 0]);                // stripe
    for (let i = 0; i < 5; i++) b.box(0.12, 0.05, 0.8, 0xff8a3d, [-0.6 + i * 0.3, h[1] + 0.02, 1.5], [0, 0, 0]); // flames on the hood
    b.box(ch[0] * 2, 0.45, ch[2] * 2, c, [0, h[1] + 0.2, co[2]]);
    v.cabinFrame(P, ch, co, h[1] + 0.42, 0.1, c);
    // chassis rails, shocks, axles under the high body
    for (const sx of [-1, 1]) b.box(0.18, 0.18, h[2] * 2, dark, [sx * 0.6, -h[1] - 0.15, 0]);
    for (const a of def.axles) {
      b.cyl(0.12, 0.12, a.x * 2, 0x444450, [0, a.y - 0.25, a.z], [0, 0, PI / 2], 8);
      for (const sx of [-1, 1]) b.cyl(0.08, 0.08, 0.7, 0xffd23f, [sx * 0.8, a.y + 0.05, a.z], [0, 0, sx * 0.4], 8);
    }
    b.rbox(h[0] * 2 + 0.3, 0.2, 0.25, 0.08, 0xd8d8de, [0, -0.2, h[2] + 0.08]);
    b.rbox(h[0] * 2 + 0.3, 0.2, 0.25, 0.08, 0xd8d8de, [0, -0.2, -h[2] - 0.08]);
    for (let i = 0; i < 4; i++) b.sphere(0.11, 0xfff4c2, [-0.45 + i * 0.3, co[1] + ch[1] + 0.1, co[2] + ch[2] - 0.1], null, 8); // roof lights
    v.dash(b, 0.42, h[1] + 0.4, co[2] + ch[2] - 0.1, 1.7);
  },
});

// ---- animals: camel + horse ---------------------------------------------------------------
const animals = new Set();
let animator = null;
function legMesh(len, col, hoof, thick = 0.09) {
  const b = new Builder();
  b.capsule(thick, len, col, [0, -len / 2, 0]);
  b.cyl(thick * 1.25, thick * 1.35, 0.14, hoof, [0, -len - 0.02, 0], null, 8);
  const m = b.mesh(matVC); m.castShadow = true;
  const g = new THREE.Group(); g.add(m);
  return g;
}
function animalMesh(kind) {
  return (b, def, c, P, v) => {
    const camel = kind === 'camel', fur = camel ? 0xd8a25a : c, dark = camel ? 0xa8743a : new THREE.Color(c).multiplyScalar(0.6).getHex();
    const legY = -0.35, legLen = def.legLen;
    // body, neck, head
    b.sphere(0.62, fur, [0, 0.05, 0], [0.8, 0.72, 1.55], 14);
    if (camel) {
      b.sphere(0.42, fur, [0, 0.55, 0.32], [1, 0.9, 1], 12);
      b.sphere(0.4, fur, [0, 0.52, -0.45], [1, 0.9, 1], 12);
      b.capsule(0.17, 0.95, fur, [0, 0.7, 1.15], [-0.5, 0, 0]);
      b.sphere(0.22, fur, [0, 1.3, 1.5], [0.85, 0.85, 1.4], 12);
      b.sphere(0.12, dark, [0, 1.22, 1.78], [1, 0.8, 1], 8);
      for (const sx of [-1, 1]) b.sphere(0.06, dark, [sx * 0.12, 1.5, 1.38], [0.6, 1.4, 0.6], 6);
      // saddle blanket between the humps, tassels
      b.rbox(1.05, 0.12, 0.7, 0.05, 0xc8343c, [0, 0.5, -0.07]);
      for (const sx of [-1, 1]) { b.box(0.06, 0.5, 0.68, 0x3f8cff, [sx * 0.52, 0.28, -0.07]); b.sphere(0.05, 0xffd23f, [sx * 0.55, 0.0, -0.07], null, 6); }
    } else {
      b.capsule(0.19, 0.6, fur, [0, 0.62, 0.95], [-0.75, 0, 0]);
      b.sphere(0.24, fur, [0, 1.05, 1.3], [0.85, 0.9, 1.6], 12);
      b.sphere(0.13, 0x2a2a33, [0, 0.98, 1.62], [1, 0.8, 0.8], 8);
      b.box(0.1, 0.5, 0.75, 0x3a2a1a, [0, 0.85, 0.85], [-0.75, 0, 0]);    // mane
      for (const sx of [-1, 1]) b.cone(0.06, 0.18, fur, [sx * 0.1, 1.32, 1.18], null, 6);
      b.rbox(0.9, 0.12, 0.8, 0.05, 0x7a4a2a, [0, 0.47, -0.1]);           // saddle
      b.rbox(0.3, 0.2, 0.12, 0.04, 0x7a4a2a, [0, 0.6, 0.27]);
      b.capsule(0.07, 0.6, 0x3a2a1a, [0, 0.0, -1.0], [0.5, 0, 0]);       // tail
    }
    for (const sx of [-1, 1]) b.sphere(0.045, 0x111111, camel ? [sx * 0.15, 1.38, 1.6] : [sx * 0.17, 1.1, 1.45], null, 6); // eyes
    if (camel) b.capsule(0.05, 0.4, dark, [0, -0.1, -0.95], [0.4, 0, 0]);
    // legs: pivots at the hips, swung by the animator
    const legs = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const g = legMesh(legLen, fur, 0x3a2a1a, camel ? 0.1 : 0.085);
      g.position.set(sx * 0.3, legY, sz * def.legZ);
      P.shell.add(g);
      legs.push(g);
    }
    v.legs = legs; v.gait = 0;
    animals.add(v);
    // a grunt / whinny instead of a car horn
    v.honk = () => v.game.audio?.play(camel ? 'bark' : 'meow', v.body.translation(), 1, camel ? { pitch: 0.45, n: 2 } : { pitch: 0.8 });
    if (!animator) {
      animator = (dt) => {
        for (const a of animals) {
          if (a.destroyed) { animals.delete(a); continue; }
          const sp = a.speed || 0;
          a.gait += dt * sp * (a.type === 'camel' ? 1.6 : 2.2) / Math.max(0.8, a.def.legLen);
          const amp = Math.min(0.55, Math.abs(sp) * 0.12);
          a.legs.forEach((g, i) => { g.rotation.x = Math.sin(a.gait + (i === 0 || i === 3 ? 0 : PI)) * amp; });
        }
      };
      v.game.updaters.push(animator);
    }
  };
}
const SILENT = { w1: 'sine', w2: 'sine', base: 5, range: 1, ratio: 1, lp: 40, vol: 0.0001, am: 0 };
registerHandling('animal', {
  wheels: true,
  update(v, drv, vel, fwd, up, side) {
    if (!v.hidWheels && v.wheelMeshes) { for (const m of v.wheelMeshes) if (m) m.visible = false; v.hidWheels = true; }
    v.updateWheels(drv, vel, fwd, up, side);
    // four legs: stay upright (lean only a little on slopes), whatever the ground does
    const av = v.body.angvel(), k = 0.45;
    v.body.setAngvel({ x: av.x * 0.9 - up.z * k, y: av.y, z: av.z * 0.9 + up.x * k }, true);
  },
});
const animal = (kind, o) => registerVehicle(kind, {
  handling: 'animal', open: true, engineVoice: SILENT, ...o, mesh: animalMesh(kind),
  colliders(add, C, def) {
    add(C.roundCuboid(0.38, 0.32, def.half[2] - 0.2, 0.12).setTranslation(0, 0.05, 0));
    add(C.cuboid(0.14, 0.3, 0.25).setTranslation(0, kind === 'camel' ? 1.2 : 0.95, kind === 'camel' ? 1.45 : 1.25)); // head
  },
});
animal('camel', {
  mass: 450, half: [0.5, 0.45, 1.25], legLen: 1.25, legZ: 0.75,
  axles: ax2(0.38, -1.3, 0.75, -0.75, 0.3, 0.3, 0.5), accel: 4.5, maxSpeed: 8, rev: 3, brakeDecel: 8, steer: 0.85, grip: 1.6,
  susp: { k: 14, c: 2.4 }, com: [0, -0.9, 0], tipH: 0.8,
  seats: [{ pos: [0, 0.82, -0.07], kind: 'driver' }, { pos: [0, 0.92, -0.75] }],
  camH: 2.4, camDist: 7.5,
});
animal('horse', {
  mass: 420, half: [0.45, 0.42, 1.1], legLen: 1.0, legZ: 0.68,
  axles: ax2(0.36, -1.05, 0.68, -0.68, 0.28, 0.28, 0.5), accel: 6.5, maxSpeed: 12.5, rev: 3, brakeDecel: 9, steer: 0.8, grip: 1.7,
  susp: { k: 15, c: 2.4 }, com: [0, -0.8, 0], tipH: 0.8,
  seats: [{ pos: [0, 0.8, -0.1], kind: 'driver' }, { pos: [0, 0.82, -0.75] }],
  camH: 2.2, camDist: 7,
});

registerCallable({ id: 'buggy', type: 'buggy', name: 'Dune buggy', icon: 'quad', color: 0xff4d3d }, 'boat');
registerCallable({ id: 'monster', type: 'monster', name: 'Monster truck', icon: 'pickup', color: 0x3f8cff }, 'boat');
registerCallable({ id: 'camel', type: 'camel', name: 'Camel', svg: '<path d="M4 7 C4 4 6 3 8 5 C9 2 12 2 13 5 C14 3 17 3 17 6 L19 3 L21 3 L22 5 L20 5 L18 9 L18 13 L16.5 13 L16.5 9 L7 9 L7 13 L5.5 13 L5.5 9 Z"/>' }, 'boat');
registerCallable({ id: 'horse', type: 'horse', name: 'Horse', color: 0x8a5a36, svg: '<path d="M4 6 L16 6 L18 2 L22 4 L21 5 L19 5 L18 9 L18 13 L16.5 13 L16.5 9 L7 9 L7 13 L5.5 13 L5.5 9 L4 9 L2 11 L3 7 Z"/>' }, 'boat');
