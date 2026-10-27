// Crops that sway in the wind and bend out of the way of whoever walks or drives through them
// (wheat, corn, sunflowers: world/farmland.js). Each crop is one InstancedMesh; its material
// bends every stalk in the vertex shader, away from up to MAX_PUSH "pushers" (players, awake
// NPCs, vehicles near the fields: { x, z, r, s } = position, reach and strength), more toward
// the top of the stalk, plus a gentle wind sway. Stalks are not solid.
// Per-instance `aGrow` (0..1) scales a stalk's height: the combine harvester cuts wheat to
// stubble and it grows back (cropField.setGrow).
import * as THREE from 'three';

const MAX_PUSH = 16;
const U = { uPush: { value: Array.from({ length: MAX_PUSH }, () => new THREE.Vector4(0, 0, 0, 0)) }, uTime: { value: 0 } };
const fields = [];

// A crop field: `geo` is one plant (base at y = 0, height H), `spots` [x, y, z, yaw, scale]
// world placements. Returns { mesh, n, setGrow(i, g), grow(i), spots }.
export function cropField(game, geo, spots, opts = {}) {
  const { H = 1, color, bend = 1, material, name = 'crops' } = opts;
  const n = spots.length;
  const grow = new Float32Array(n).fill(1);
  const g = geo.clone();
  g.setAttribute('aGrow', new THREE.InstancedBufferAttribute(grow, 1));
  const mat = material || new THREE.MeshLambertMaterial({ vertexColors: !color, color: color ?? 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPush = U.uPush; sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec4 uPush[${MAX_PUSH}];
uniform float uTime;
attribute float aGrow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float hk = clamp(transformed.y / ${H.toFixed(3)}, 0.0, 1.0); hk *= hk;
transformed.y *= aGrow;`)
      .replace('#include <project_vertex>', `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
vec3 base = vec3(0.0);
#endif
vec2 off = vec2(sin(uTime * 1.6 + base.x * 0.31 + base.z * 0.23), cos(uTime * 1.3 + base.x * 0.17 - base.z * 0.29)) * 0.07;
for (int i = 0; i < ${MAX_PUSH}; i++) {
  vec4 p = uPush[i];
  if (p.z <= 0.0) continue;
  vec2 d = base.xz - p.xy;
  float dist = length(d);
  float w = 1.0 - smoothstep(p.z * 0.35, p.z, dist);
  if (w > 0.0) off += (dist > 1e-3 ? d / dist : vec2(0.0, 1.0)) * w * p.w;
}
float ol = length(off);
if (ol > 1.15) off *= 1.15 / ol;
mvPosition.xz += off * hk * ${(H * bend).toFixed(3)};
mvPosition.y -= dot(off, off) * hk * ${(H * 0.45 * bend).toFixed(3)};
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'wobCrop' + H.toFixed(3) + bend;
  const mesh = new THREE.InstancedMesh(g, mat, n);
  mesh.name = name;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  spots.forEach(([x, y, z, yaw, sc], i) => {
    q.setFromAxisAngle(up, yaw); s.setScalar(sc); p.set(x, y, z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.frustumCulled = true;
  mesh.castShadow = false; mesh.receiveShadow = true;
  game.scene.add(mesh);
  // far away a field is just its ground colour: hide the plants per view beyond `far` m
  const far = opts.far ?? 160;
  (game.viewHooks ||= []).push((cam) => {
    const p = cam.position, dx = Math.max(x0 - p.x, 0, p.x - x1), dz = Math.max(z0 - p.z, 0, p.z - z1);
    mesh.visible = dx * dx + dz * dz < far * far;
  });
  const f = { mesh, n, spots, grow, bounds: [x0, x1, z0, z1], dirty: false,
    setGrow(i, v) { if (grow[i] !== v) { grow[i] = v; f.dirty = true; } },
    flush() { if (f.dirty) { g.attributes.aGrow.needsUpdate = true; f.dirty = false; } } };
  fields.push(f);
  ensureUpdater(game);
  return f;
}

// The pushers, once per frame: the nearest characters and vehicles to any crop field.
let hooked = false;
function ensureUpdater(game) {
  if (hooked) return;
  hooked = true;
  const cand = [];
  game.updaters.push((dt, t) => {
    U.uTime.value = t;
    for (const f of fields) f.flush();
    cand.length = 0;
    const near = (x, z, m) => fields.some((f) => x > f.bounds[0] - m && x < f.bounds[1] + m && z > f.bounds[2] - m && z < f.bounds[3] + m);
    for (const p of game.players) { const c = p.viewPos ? p.viewPos(_v) : p.chest.translation(); if (near(c.x, c.z, 4)) cand.push([c.x, c.z, 1.0, 0.9]); }
    for (const n of game.npcs?.awake || []) { const c = n.chest.translation(); if (near(c.x, c.z, 4)) cand.push([c.x, c.z, 0.9, 0.8]); }
    for (const v of game.vehicles) {
      if (v.culled) continue;
      const c = v.body.translation(), h = v.def.half;
      const r = Math.max(h[0], h[2]) + (v.def.header ? v.def.header.w / 2 : 0.6);
      if (near(c.x, c.z, r + 2)) cand.push([c.x, c.z, r + 0.8, 1.4]);
    }
    for (let i = 0; i < MAX_PUSH; i++) { const c = cand[i]; U.uPush.value[i].set(c ? c[0] : 0, c ? c[1] : 0, c ? c[2] : 0, c ? c[3] : 0); }
  });
}
const _v = new THREE.Vector3();
