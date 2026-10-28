// Maps: terrain (render mesh + physics trimesh sharing one height grid), sky,
// lighting and scenery.
import { THREE, clamp, rand, lerp, smooth } from './util.js';
import { RAPIER, GROUPS } from './physics.js';
import { buildFeatures, TerrainFeatures, addFeatureColliders } from './features.js';
import { NEW_MAPS } from './maps-new.js';
import { buildFeatureScene } from './mapscene.js';

export const FIELD = { x: 42, z: 32 }; // half extents of the battle area
export const ZONE_GAP = 3; // no man's land half width around x = 0
export const MAX_ARMIES = 4; // Blue, Red, Yellow, Green (more than two: sandbox and simulations)

// Deployment zones. Two armies split the field (Blue x < 0, Red x > 0); three or four take
// a quadrant each, Blue and Red still facing each other across the middle (Blue -x -z,
// Red +x +z, Yellow +x -z, Green -x +z).
const QUAD = [[-1, -1], [1, 1], [1, -1], [-1, 1]];
export function zoneRect(t, n) {
  if (n <= 2) return t === 0 ? { x0: -FIELD.x, x1: -ZONE_GAP, z0: -FIELD.z, z1: FIELD.z } : { x0: ZONE_GAP, x1: FIELD.x, z0: -FIELD.z, z1: FIELD.z };
  const [sx, sz] = QUAD[t];
  return { x0: sx < 0 ? -FIELD.x : ZONE_GAP, x1: sx < 0 ? -ZONE_GAP : FIELD.x, z0: sz < 0 ? -FIELD.z : ZONE_GAP, z1: sz < 0 ? -ZONE_GAP : FIELD.z };
}
export function inZoneOf(t, n, x, z) {
  const r = zoneRect(t, n);
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}
// half the width of a zone across its army's front (two armies: the field's depth)
export const zoneHalfWidth = (n) => (n <= 2 ? FIELD.z : (FIELD.z - ZONE_GAP) / 2);
// A point of an army's formation given as d (distance from the middle line, growing away
// from the enemy, 3..42) and z (across its front, ±zoneHalfWidth): two armies as Blue
// x = -d / Red x = +d; in a quadrant the front runs along z, centred in the quadrant.
export function zonePoint(t, n, d, z) {
  if (n <= 2) return { x: (t === 0 ? -1 : 1) * d, z };
  const [sx, sz] = QUAD[t], hw = zoneHalfWidth(n);
  return { x: sx * d, z: sz * (ZONE_GAP + hw) + clamp(z, -hw, hw) };
}

// ground: [base, light, dark] grass, patch: meadow patches, dirt: slopes/paths,
// high: tint of the hill tops, rock/far: cliffs and the distance.
export const MAPS = [
  {
    id: 'grass', name: 'Simulation Grassland',
    ground: ['#6cb83a', '#8fd24a', '#4f9a2c'], patch: '#b6d955', dirt: '#a08455', high: '#9bd451', far: '#5a9a3c', rock: '#9a9a90',
    sky: ['#4f9eea', '#cfe9fb'], fog: '#c4e0f2', sun: '#fff1d6', sunI: 2.7, hemiGround: '#5e8a3a', hemiI: 1.25,
    hills: 1, bumps: 0.5, trees: ['oak', 'oak', 'pine'], grass: '#7cc43e', grassTip: '#b8e86a',
    flowers: ['#ffffff', '#ffe14a', '#ff7fb3', '#b07aff', '#ff5a4a'], bushes: '#3f8f2e', props: 'farm', mountains: '#7fa6c4',
  },
  {
    id: 'desert', name: 'Dusty Dunes',
    ground: ['#e8c47e', '#f4d89c', '#d4a868'], patch: '#e0b070', dirt: '#c9935a', high: '#f2d6a0', far: '#d8ae6c', rock: '#c98a55',
    sky: ['#5ea4e6', '#f8e4c0'], fog: '#f1dcb8', sun: '#fff0cc', sunI: 2.9, hemiGround: '#b3905a', hemiI: 1.2,
    hills: 1.3, bumps: 1.1, trees: ['cactus'], grass: '#b9a35a', grassTip: '#dcc77a',
    flowers: null, bushes: '#8a8a48', props: 'desert', mountains: '#d3a27a',
  },
  {
    id: 'winter', name: 'Frozen Pass',
    ground: ['#eef4f9', '#ffffff', '#d6e3ee'], patch: '#e2ecf5', dirt: '#9fb0c0', high: '#ffffff', far: '#dfe8ef', rock: '#7d8a99',
    sky: ['#86aee0', '#eaf1f8'], fog: '#e2e9f0', sun: '#f4f7ff', sunI: 2.2, hemiGround: '#a8b7c8', hemiI: 1.35,
    hills: 1.15, bumps: 0.6, trees: ['pine', 'snowpine'], grass: '#c4d4e2', grassTip: '#eef4fa',
    flowers: null, bushes: '#4a6e5a', props: 'winter', snow: true, mountains: '#a9bdd6',
  },
  {
    id: 'autumn', name: 'Autumn Valley',
    ground: ['#9fb043', '#c2c45a', '#7e9436'], patch: '#d4a743', dirt: '#9a6e44', high: '#c9b552', far: '#8a8a40', rock: '#94877a',
    sky: ['#6a9ee0', '#f6dcb4'], fog: '#ecd9be', sun: '#ffdcae', sunI: 2.6, hemiGround: '#8a6a3a', hemiI: 1.2,
    hills: 1.1, bumps: 0.7, trees: ['autumn', 'autumn', 'pine'], grass: '#a8ae48', grassTip: '#e2c662',
    flowers: ['#ff9a3a', '#ffd34a', '#e2483a', '#ffffff'], bushes: '#b5612e', props: 'farm', mountains: '#b49a88',
  },
  // maps with terrain features (walls, water, bridges, plateaus): src/maps-new.js
  ...NEW_MAPS,
];

const SIZE = 240, SEG = 200; // 1.2 m cells (fine enough for walls, banks and bridges)

// cheap smooth value noise (deterministic, for colouring and scatter)
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5.3, z * 2.1 - 1.7) * 0.3 + vnoise(x * 4.3 - 2.2, z * 4.3 + 7.1) * 0.15;
const outDist = (x, z) => Math.hypot(Math.max(0, Math.abs(x) - FIELD.x), Math.max(0, Math.abs(z) - FIELD.z));

export class Terrain {
  constructor(map, seed = 1) {
    this.map = map;
    this.size = SIZE; this.seg = SEG;
    const n = SEG + 1;
    this.h = new Float32Array(n * n);
    // a few sinusoid octaves with seeded phases
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const waves = [];
    for (let i = 0; i < 9; i++) waves.push({ fx: rnd() * 2 - 1, fz: rnd() * 2 - 1, ph: rnd() * 6.28, k: 0.02 + i * 0.012 });
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = (ix / SEG - 0.5) * SIZE, z = (iz / SEG - 0.5) * SIZE;
        let small = 0;
        for (let i = 0; i < waves.length; i++) {
          const w = waves[i];
          small += Math.sin((x * w.fx + z * w.fz) * w.k * 2 + w.ph) / (1 + i * 0.6);
        }
        // distance outside the battle field (soft rect)
        const ox = Math.max(0, Math.abs(x) - FIELD.x - 4), oz = Math.max(0, Math.abs(z) - FIELD.z - 4);
        const out = Math.hypot(ox, oz);
        const ring = smooth(clamp(out / 40, 0, 1));
        let y = small * 0.35 * map.bumps;
        y += ring * (6 + small * 4) * map.hills;
        y += Math.pow(clamp(out / 70, 0, 1), 2) * 18 * map.hills;
        if (map.shape) y = map.shape(x, z, y, out);
        this.h[iz * n + ix] = y;
      }
    }
    // Fair fights: inside the battle field the ground is point-symmetric about the
    // centre, so both armies' halves have the same bumps (blending out past the edge).
    const src = this.h.slice();
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const x = (ix / SEG - 0.5) * SIZE, z = (iz / SEG - 0.5) * SIZE;
      const out = Math.hypot(Math.max(0, Math.abs(x) - FIELD.x), Math.max(0, Math.abs(z) - FIELD.z));
      const k = 1 - smooth(clamp(out / 12, 0, 1));
      if (k <= 0) continue;
      const i = iz * n + ix, j = (SEG - iz) * n + (SEG - ix);
      this.h[i] = lerp(src[i], (src[i] + src[j]) / 2, k);
    }
    // hills, plateaus, water and obstacles (point-symmetric too: src/features.js)
    this.feat = buildFeatures(map, this, FIELD);
  }

  height(x, z) {
    const n = SEG + 1;
    const fx = clamp((x / SIZE + 0.5) * SEG, 0, SEG - 1e-3);
    const fz = clamp((z / SIZE + 0.5) * SEG, 0, SEG - 1e-3);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const h = this.h;
    const a = h[iz * n + ix], b = h[iz * n + ix + 1], c = h[(iz + 1) * n + ix], d = h[(iz + 1) * n + ix + 1];
    // match the triangle split used by the mesh (a-b-c / b-d-c)
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }

  normal(x, z, out) {
    const e = 0.5;
    return out.set(this.height(x - e, z) - this.height(x + e, z), 2 * e, this.height(x, z - e) - this.height(x, z + e)).normalize();
  }

  buildMesh() {
    const n = SEG + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      pos[i * 3] = (ix / SEG - 0.5) * SIZE; pos[i * 3 + 1] = this.h[i]; pos[i * 3 + 2] = (iz / SEG - 0.5) * SIZE;
    }
    const idx = new Uint32Array(SEG * SEG * 6);
    let k = 0;
    for (let iz = 0; iz < SEG; iz++) for (let ix = 0; ix < SEG; ix++) {
      const a = iz * n + ix, b = a + 1, c = a + n, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    // colour: grass shades from noise, meadow patches, dirt on slopes, lighter hill
    // tops, rock on cliffs, haze toward the distance
    const M = this.map, C = (c) => new THREE.Color(c);
    const base = C(M.ground[0]), light = C(M.ground[1]), dark = C(M.ground[2]);
    const patch = C(M.patch), dirt = C(M.dirt), high = C(M.high), rock = C(M.rock), far = C(M.far);
    const nor = geo.attributes.normal, tmp = new THREE.Color();
    for (let i = 0; i < n * n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const n1 = fbm(x * 0.045, z * 0.045), n2 = fbm(x * 0.11 + 30, z * 0.11 - 12), n3 = vnoise(x * 0.6, z * 0.6);
      tmp.copy(base).lerp(light, smooth(clamp((n1 - 0.35) * 2.2, 0, 1)) * 0.8).lerp(dark, smooth(clamp((0.45 - n2) * 3, 0, 1)) * 0.55);
      tmp.lerp(patch, smooth(clamp((n2 - 0.62) * 5, 0, 1)) * 0.55);
      tmp.multiplyScalar(0.94 + n3 * 0.1);
      const slope = 1 - nor.getY(i);
      const o = outDist(x, z);
      tmp.lerp(dirt, smooth(clamp((slope - 0.12) * 6, 0, 1)) * 0.75);
      tmp.lerp(high, smooth(clamp((y - 9) / 10, 0, 1)) * 0.5);
      tmp.lerp(rock, smooth(clamp((slope - 0.32) * 5, 0, 1)));
      tmp.lerp(far, clamp((o - 20) / 70, 0, 0.45));
      if (this.feat) this.paintFeatures(i, x, z, tmp, n1, n3);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.positions = pos; this.indices = idx;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  addCollider(world) {
    const cd = RAPIER.ColliderDesc.trimesh(this.positions, this.indices)
      .setFriction(0.9).setCollisionGroups(GROUPS.ground);
    const c = world.createCollider(cd);
    addFeatureColliders(this, world);
    return c;
  }

  // ground tints from the map's features: painted areas, wet banks and river beds
  paintFeatures(i, x, z, tmp, n1, n3) {
    const F = this.feat;
    for (const p of F.paints) {
      const dx = x - p.x, dz = z - p.z;
      let out;
      if (p.round) out = Math.hypot(dx, dz) - p.hw;
      else {
        const c = Math.cos(p.rot), s = Math.sin(p.rot);
        out = Math.max(Math.abs(dx * c - dz * s) - p.hw, Math.abs(dx * s + dz * c) - p.hd);
      }
      const f = (1 - smooth(clamp(out / p.soft + 0.5, 0, 1))) * p.k;
      if (f > 0) tmp.lerp(_pc.copy(p.color).multiplyScalar(1 - p.noise * 0.5 + p.noise * (n1 * 0.6 + n3 * 0.4)), f);
    }
    const wd = F.wd[i], ws = F.ws[i];
    if (ws === ws) {
      // damp, darker bank just above the waterline, sandy-muddy bed below it
      const bank = smooth(clamp(1 - (this.h[i] - ws) / 0.6, 0, 1));
      tmp.multiplyScalar(1 - bank * 0.22);
      if (wd > 0) tmp.lerp(_pc.set(this.map.bed || '#a89268'), smooth(clamp(wd / 0.35, 0, 1)) * 0.85);
    }
  }
}
Object.assign(Terrain.prototype, TerrainFeatures);
const _pc = new THREE.Color();

// The setup-zone overlay: hugs the terrain over a rectangle with a soft team tint,
// a 2 m grid and a bright dashed border that fades inward.
export function zoneMesh(terrain, x0, x1, z0, z1, color) {
  const res = terrain.feat ? 0.8 : 1.5;
  const nx = Math.ceil((x1 - x0) / res), nz = Math.ceil((z1 - z0) / res);
  const geo = new THREE.PlaneGeometry(1, 1, nx, nz);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  // where units can't be placed (walls, water) the overlay goes faint and hatched
  const blk = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = lerp(x0, x1, p.getX(i) + 0.5), z = lerp(z0, z1, p.getZ(i) + 0.5);
    p.setXYZ(i, x, Math.max(terrain.height(x, z), terrain.feat ? terrain.height(x, z) + terrain.waterDepth(x, z) : 0) + 0.06, z);
    uv.setXY(i, x - x0, z - z0);
    blk[i] = terrain.feat && terrain.blocked(x, z, 0.1) ? 1 : 0;
  }
  geo.setAttribute('blk', new THREE.BufferAttribute(blk, 1));
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { color: { value: new THREE.Color(color) }, size: { value: new THREE.Vector2(x1 - x0, z1 - z0) } },
    vertexShader: 'attribute float blk; varying vec2 vUv; varying float vB; void main(){ vUv = uv; vB = blk; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 color; uniform vec2 size; varying vec2 vUv; varying float vB;
      void main(){
        vec2 d2 = min(vUv, size - vUv); float d = min(d2.x, d2.y);
        vec2 g = abs(fract(vUv / 2.0 + 0.5) - 0.5) * 2.0;
        vec2 fw = fwidth(vUv / 2.0) * 2.0;
        float gl = max(1.0 - smoothstep(0.0, max(fw.x, 0.02) * 1.6, 1.0 - g.x), 1.0 - smoothstep(0.0, max(fw.y, 0.02) * 1.6, 1.0 - g.y));
        float edge = 1.0 - smoothstep(0.0, 0.35, d);
        float dash = step(0.5, fract((vUv.x + vUv.y) * 0.5));
        float glow = exp(-d * 0.45);
        float a = 0.14 + glow * 0.22 + gl * 0.16 + edge * (0.55 + 0.35 * dash);
        vec3 c = mix(color, vec3(1.0), edge * 0.55 + gl * 0.25);
        float b = smoothstep(0.35, 0.65, vB);
        float hatch = step(0.5, fract((vUv.x - vUv.y) * 1.25));
        a = mix(a, edge * 0.6 + hatch * 0.16, b);
        c = mix(c, vec3(0.18, 0.12, 0.12), b * 0.5);
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function skyDome(map, sunDir) {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(map.sky[0]) }, bot: { value: new THREE.Color(map.sky[1]) }, sun: { value: new THREE.Color(map.sun) }, dir: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sun; uniform vec3 dir; varying vec3 vp;
      void main(){ vec3 v = normalize(vp); float h = v.y;
        float t = clamp(pow(max(h, 0.0), 0.55), 0.0, 1.0);
        vec3 c = mix(bot, top, t);
        float s = max(dot(v, dir), 0.0);
        c += sun * (pow(s, 900.0) * 1.6 + pow(s, 24.0) * 0.18 + pow(s, 4.0) * 0.06);
        c = mix(c, bot * 1.03, smoothstep(0.08, -0.05, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------- prop geometry
// Merge geometries into one with per-vertex colours: parts = [[geometry, color, matrix?], ...]
function merged(parts) {
  const list = parts.map(([g, c, m]) => {
    let gg = g.index ? g.toNonIndexed() : g.clone();
    if (m) gg.applyMatrix4(m);
    gg.deleteAttribute('uv');
    const n = gg.attributes.position.count, col = new Float32Array(n * 3), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return gg;
  });
  let nv = 0; for (const g of list) nv += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(nv * 3); let o = 0;
    for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}
const T = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
// jitter icosphere vertices for a lumpy low-poly look
// (smooth: radial normals for a soft look; otherwise faceted)
function lumpy(r, detail, amt, seed = 1, smoothN = true) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position, nr = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (hash(Math.round(v.x * 50) + seed, Math.round(v.y * 50) * 3 + Math.round(v.z * 50)) - 0.5) * amt;
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
    v.normalize(); nr.setXYZ(i, v.x, v.y, v.z);
  }
  if (!smoothN) g.computeVertexNormals();
  return g;
}
const TREES = {
  oak: () => merged([
    [new THREE.CylinderGeometry(0.22, 0.42, 3.2, 7), '#6b4a2f', T(0, 1.6, 0)],
    [new THREE.CylinderGeometry(0.1, 0.16, 1.4, 5), '#6b4a2f', T(0.5, 3.0, 0, 1, 1, 1, 0, 0, -0.7)],
    [lumpy(2.0, 1, 0.25, 1), '#3f8f32', T(0, 4.3, 0, 1, 0.85, 1)],
    [lumpy(1.5, 1, 0.3, 2), '#52a63a', T(1.2, 5.0, 0.5, 1, 0.85, 1)],
    [lumpy(1.4, 1, 0.3, 3), '#4a9c36', T(-1.1, 4.8, -0.4, 1, 0.85, 1)],
    [lumpy(1.2, 1, 0.3, 4), '#62b444', T(0.2, 5.8, -0.2, 1, 0.85, 1)],
  ]),
  autumn: () => merged([
    [new THREE.CylinderGeometry(0.2, 0.38, 3.2, 7), '#5e4030', T(0, 1.6, 0)],
    [lumpy(1.9, 1, 0.25, 5), '#e0782c', T(0, 4.2, 0, 1, 0.9, 1)],
    [lumpy(1.4, 1, 0.3, 6), '#f0a03a', T(1.1, 4.9, 0.4, 1, 0.9, 1)],
    [lumpy(1.3, 1, 0.3, 7), '#c8502a', T(-1.0, 4.7, -0.4, 1, 0.9, 1)],
    [lumpy(1.1, 1, 0.3, 8), '#f4b84a', T(0.1, 5.7, -0.1, 1, 0.9, 1)],
  ]),
  pine: () => merged([
    [new THREE.CylinderGeometry(0.18, 0.32, 2.2, 6), '#5a4030', T(0, 1.1, 0)],
    [new THREE.ConeGeometry(2.1, 2.8, 8), '#2f6a40', T(0, 2.9, 0)],
    [new THREE.ConeGeometry(1.7, 2.4, 8), '#367a48', T(0, 4.2, 0, 1, 1, 1, 0, 0.4, 0)],
    [new THREE.ConeGeometry(1.2, 2.0, 8), '#3f8a50', T(0, 5.4, 0, 1, 1, 1, 0, 0.8, 0)],
    [new THREE.ConeGeometry(0.7, 1.4, 8), '#48965a', T(0, 6.5, 0)],
  ]),
  snowpine: () => merged([
    [new THREE.CylinderGeometry(0.18, 0.32, 2.2, 6), '#5a4030', T(0, 1.1, 0)],
    [new THREE.ConeGeometry(2.1, 2.8, 8), '#2f5f45', T(0, 2.9, 0)],
    [new THREE.ConeGeometry(1.75, 0.9, 8), '#f4f8fc', T(0, 3.95, 0)],
    [new THREE.ConeGeometry(1.7, 2.4, 8), '#33694c', T(0, 4.2, 0, 1, 1, 1, 0, 0.4, 0)],
    [new THREE.ConeGeometry(1.35, 0.8, 8), '#f4f8fc', T(0, 5.1, 0)],
    [new THREE.ConeGeometry(1.2, 2.0, 8), '#3a7552', T(0, 5.4, 0)],
    [new THREE.ConeGeometry(0.75, 1.3, 8), '#ffffff', T(0, 6.3, 0)],
  ]),
  cactus: () => merged([
    [new THREE.CapsuleGeometry(0.38, 3.2, 3, 8), '#4f9a45', T(0, 1.9, 0)],
    [new THREE.CapsuleGeometry(0.24, 0.9, 3, 8), '#4f9a45', T(0.65, 1.8, 0, 1, 1, 1, 0, 0, Math.PI / 2)],
    [new THREE.CapsuleGeometry(0.24, 1.1, 3, 8), '#5aa64e', T(1.05, 2.5, 0)],
    [new THREE.CapsuleGeometry(0.22, 0.6, 3, 8), '#4f9a45', T(-0.55, 2.5, 0, 1, 1, 1, 0, 0, Math.PI / 2)],
    [new THREE.CapsuleGeometry(0.22, 0.8, 3, 8), '#5aa64e', T(-0.85, 3.0, 0)],
    [new THREE.SphereGeometry(0.16, 6, 4), '#ff6a8a', T(0, 3.75, 0)],
  ]),
  palm: () => {
    const p = [];
    // a gently curved trunk of tapering rings, fronds drooping from the top
    let x = 0, y = 0, r = 0.3;
    for (let i = 0; i < 7; i++) {
      const lean = 0.06 + i * 0.03;
      p.push([new THREE.CylinderGeometry(r * 0.88, r, 0.9, 7), i % 2 ? '#9a7448' : '#86643c', T(x, y + 0.45, 0, 1, 1, 1, 0, 0, -lean)]);
      x += Math.sin(lean) * 0.9; y += Math.cos(lean) * 0.88; r *= 0.93;
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const leaf = new THREE.ConeGeometry(0.45, 3.2, 4);
      leaf.scale(1, 1, 0.18);
      p.push([leaf, k % 2 ? '#3f9a3a' : '#52b046', T(x + Math.cos(a) * 1.3, y - 0.25, Math.sin(a) * 1.3, 1, 1, 1, 0, -a, 0).multiply(T(0, 0, 0, 1, 1, 1, 0, 0, Math.PI / 2 + 0.35))]);
    }
    for (let k = 0; k < 3; k++) p.push([new THREE.SphereGeometry(0.17, 6, 4), '#6a4a26', T(x + Math.cos(k * 2.1) * 0.25, y - 0.3, Math.sin(k * 2.1) * 0.25)]);
    return merged(p);
  },
  jungle: () => merged([
    [new THREE.CylinderGeometry(0.28, 0.5, 5.5, 7), '#6a5236', T(0, 2.75, 0)],
    [new THREE.CylinderGeometry(0.12, 0.2, 2.2, 5), '#6a5236', T(0.8, 4.6, 0.2, 1, 1, 1, 0, 0, -0.8)],
    [new THREE.CylinderGeometry(0.12, 0.2, 2.0, 5), '#6a5236', T(-0.7, 4.8, -0.3, 1, 1, 1, 0.3, 0, 0.8)],
    [lumpy(2.3, 1, 0.3, 31), '#2f7d32', T(0, 6.4, 0, 1.25, 0.5, 1.25)],
    [lumpy(1.6, 1, 0.3, 32), '#3c9440', T(1.6, 5.7, 0.4, 1.2, 0.5, 1.2)],
    [lumpy(1.5, 1, 0.3, 33), '#28702e', T(-1.5, 5.9, -0.5, 1.2, 0.5, 1.2)],
    [lumpy(1.2, 1, 0.3, 34), '#46a046', T(0.2, 7.1, -0.2, 1.2, 0.5, 1.2)],
  ]),
  willow: () => {
    const p = [[new THREE.CylinderGeometry(0.3, 0.5, 3.0, 7), '#6b5236', T(0, 1.5, 0)],
      [lumpy(2.1, 1, 0.25, 41), '#7ab048', T(0, 4.0, 0, 1.15, 0.8, 1.15)]];
    // hanging curtains of leaves
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      p.push([new THREE.CylinderGeometry(0.55, 0.3, 2.6, 5), k % 2 ? '#8cc052' : '#6fa242', T(Math.cos(a) * 1.7, 2.9, Math.sin(a) * 1.7)]);
    }
    return merged(p);
  },
  dead: () => merged([
    [new THREE.CylinderGeometry(0.2, 0.42, 3.4, 6), '#4a4048', T(0, 1.7, 0, 1, 1, 1, 0, 0, 0.06)],
    [new THREE.CylinderGeometry(0.07, 0.14, 1.8, 5), '#4a4048', T(0.75, 3.4, 0, 1, 1, 1, 0, 0, -0.9)],
    [new THREE.CylinderGeometry(0.06, 0.12, 1.6, 5), '#4a4048', T(-0.6, 3.6, 0.2, 1, 1, 1, 0.2, 0, 0.8)],
    [new THREE.CylinderGeometry(0.05, 0.1, 1.2, 5), '#4a4048', T(0.1, 4.0, -0.5, 1, 1, 1, -0.7, 0, 0.1)],
    [new THREE.CylinderGeometry(0.04, 0.07, 0.8, 4), '#4a4048', T(1.35, 4.15, 0, 1, 1, 1, 0, 0, 0.3)],
    [new THREE.CylinderGeometry(0.04, 0.07, 0.7, 4), '#4a4048', T(-1.15, 4.25, 0.3, 1, 1, 1, 0, 0, -0.4)],
  ]),
};
const PROPS = {
  log: () => merged([
    [new THREE.CylinderGeometry(0.35, 0.35, 3, 8), '#7a5434', T(0, 0.3, 0, 1, 1, 1, 0, 0, Math.PI / 2)],
    [new THREE.CylinderGeometry(0.3, 0.3, 3.02, 8), '#d9b483', T(0, 0.3, 0, 1, 1, 1, 0, 0, Math.PI / 2)],
  ]),
  stump: () => merged([
    [new THREE.CylinderGeometry(0.45, 0.6, 0.7, 8), '#6e4a2e', T(0, 0.35, 0)],
    [new THREE.CylinderGeometry(0.42, 0.42, 0.02, 8), '#d9b483', T(0, 0.71, 0)],
  ]),
  hay: () => merged([
    [new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12), '#e6c65c', T(0, 0.75, 0, 1, 1, 1, Math.PI / 2, 0, 0)],
    [new THREE.CylinderGeometry(0.5, 0.5, 1.22, 12), '#c9a446', T(0, 0.75, 0, 1, 1, 1, Math.PI / 2, 0, 0)],
  ]),
  fence: () => {
    const p = [];
    for (const x of [-1.5, 0, 1.5]) p.push([new THREE.BoxGeometry(0.16, 1.1, 0.16), '#8a6038', T(x, 0.55, 0)]);
    for (const y of [0.45, 0.85]) p.push([new THREE.BoxGeometry(3.3, 0.12, 0.08), '#a07040', T(0, y, 0.06)]);
    return merged(p);
  },
  skull: () => merged([
    [new THREE.SphereGeometry(0.35, 8, 6), '#efe6cf', T(0, 0.25, 0, 1, 0.8, 1.3)],
    [new THREE.ConeGeometry(0.08, 0.7, 5), '#efe6cf', T(0.42, 0.45, -0.1, 1, 1, 1, 0, 0, -1.0)],
    [new THREE.ConeGeometry(0.08, 0.7, 5), '#efe6cf', T(-0.42, 0.45, -0.1, 1, 1, 1, 0, 0, 1.0)],
  ]),
  snowman: () => merged([
    [new THREE.SphereGeometry(0.6, 12, 8), '#ffffff', T(0, 0.55, 0)],
    [new THREE.SphereGeometry(0.42, 12, 8), '#ffffff', T(0, 1.35, 0)],
    [new THREE.SphereGeometry(0.3, 12, 8), '#ffffff', T(0, 1.95, 0)],
    [new THREE.ConeGeometry(0.06, 0.35, 6), '#ff8a2a', T(0, 1.95, 0.42, 1, 1, 1, Math.PI / 2, 0, 0)],
    [new THREE.CylinderGeometry(0.25, 0.25, 0.32, 10), '#2a2a2a', T(0, 2.3, 0)],
    [new THREE.TorusGeometry(0.4, 0.07, 5, 12), '#e2403b', T(0, 1.68, 0, 1, 1, 1, Math.PI / 2, 0, 0)],
  ]),
};

// Instanced scenery; never placed inside the battle field (plus a margin).
function scatter(terrain, count, minOut, maxOut, fn, maxSlope = 1) {
  const out = [];
  let tries = 0;
  const nrm = new THREE.Vector3();
  while (out.length < count && tries++ < count * 30) {
    const x = rand(-SIZE * 0.47, SIZE * 0.47), z = rand(-SIZE * 0.47, SIZE * 0.47);
    const o = outDist(x, z);
    if (o < minOut || o > maxOut) continue;
    if (maxSlope < 1 && 1 - terrain.normal(x, z, nrm).y > maxSlope) continue;
    out.push(fn(x, terrain.height(x, z), z, o));
  }
  return out;
}
// clustered scatter: groves rather than an even sprinkle
function groves(terrain, count, minOut, maxOut, fn) {
  const out = [];
  const centers = scatter(terrain, Math.ceil(count / 6), minOut + 4, maxOut, (x, y, z) => [x, z]);
  let tries = 0;
  while (out.length < count && tries++ < count * 30) {
    const c = centers[Math.floor(Math.random() * centers.length)];
    const a = rand(0, 6.28), d = Math.sqrt(Math.random()) * 14;
    const x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d;
    if (Math.abs(x) > SIZE * 0.48 || Math.abs(z) > SIZE * 0.48) continue;
    const o = outDist(x, z);
    if (o < minOut || o > maxOut) continue;
    out.push(fn(x, terrain.height(x, z), z, o));
  }
  return out;
}

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
const comp = (x, y, z, s, sy = s, ry = rand(0, 6.28), tilt = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    tilt ? new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-tilt, tilt), ry, rand(-tilt, tilt))) : _q.setFromAxisAngle(_up, ry).clone(),
    new THREE.Vector3(s, sy, s));

function instanced(geo, mat, mats, shadow = true, tint = null) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  m.count = mats.length;
  mats.forEach((mm, i) => m.setMatrixAt(i, mm));
  if (tint) { const c = new THREE.Color(); for (let i = 0; i < mats.length; i++) m.setColorAt(i, tint(c, i)); }
  m.castShadow = shadow; m.receiveShadow = true;
  m.instanceMatrix.needsUpdate = true;
  return m;
}
const vcMat = (o = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...o });

export function buildScene(scene, map, terrain) {
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color(map.fog);
  scene.fog = new THREE.Fog(map.fog, map.fogNear ?? 110, map.fogFar ?? 480);
  const sunPos = new THREE.Vector3(-40, 80, 30);
  group.add(skyDome(map, sunPos));

  const hemi = new THREE.HemisphereLight(map.sky[0], map.hemiGround, map.hemiI ?? 1.3);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(map.sun, map.sunI ?? 2.5);
  sun.position.copy(sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -64; sc.right = 64; sc.top = 54; sc.bottom = -54; sc.near = 1; sc.far = 230;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  group.add(sun);
  group.add(sun.target);

  const ground = terrain.buildMesh();
  group.add(ground);

  // distant mountain ring for a horizon silhouette (fogged, no shadows)
  {
    const parts = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand(-0.08, 0.08), r = rand(260, 340);
      const h = rand(45, 110), w = rand(60, 110);
      const c = new THREE.Color(map.mountains).multiplyScalar(rand(0.88, 1.08));
      parts.push([lumpy(1, 3, 0.18, i), c, T(Math.cos(a) * r, -10, Math.sin(a) * r, w, h, w * 0.8, 0, rand(0, 3), 0)]);
      if (map.snow || h > 95) parts.push([lumpy(1, 2, 0.2, i + 50), '#f4f8fc', T(Math.cos(a) * r, -10 + h * 0.45, Math.sin(a) * r, w * 0.5, h * 0.58, w * 0.42, 0, rand(0, 3), 0)]);
    }
    const mm = new THREE.Mesh(merged(parts), vcMat());
    mm.frustumCulled = false;
    group.add(mm);
  }

  // clouds: a few lumpy puffs with flat-ish bottoms, instanced
  {
    const puff = () => {
      const p = [];
      const n = 5 + Math.floor(rand(0, 4));
      for (let i = 0; i < n; i++) {
        const s = rand(5, 10) * (1 - Math.abs(i - n / 2) / n * 0.8);
        p.push([lumpy(s, 1, 0.15, i * 7), '#ffffff', T(i * 7 - n * 3.5, rand(0, 3), rand(-4, 4), 1, 0.62, 1)]);
      }
      const g = merged(p);
      const pos = g.attributes.position; // flatten undersides
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -1.5) pos.setY(i, -1.5 - (pos.getY(i) + 1.5) * 0.15);
      return g;
    };
    const cmat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#a4b2c0', fog: false });
    for (let k = 0; k < 3; k++) {
      const ms = [];
      for (let i = 0; i < 6; i++) {
        const a = rand(0, Math.PI * 2), r = rand(170, 420);
        ms.push(comp(Math.cos(a) * r, rand(80, 135), Math.sin(a) * r, rand(0.9, 1.6), rand(0.8, 1.2)));
      }
      const cm = instanced(puff(), cmat, ms, false);
      cm.receiveShadow = false;
      group.add(cm);
    }
  }

  // trees, in groves, never in the field
  {
    const kinds = map.trees;
    const lists = Object.fromEntries(kinds.map((k) => [k, []]));
    groves(terrain, kinds[0] === 'cactus' ? 80 : 190, 7, 100, (x, y, z, o) => {
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      const s = rand(0.8, 1.35) * (o > 40 ? 1.35 : 1);
      lists[k].push(comp(x, y - 0.1, z, s, s * rand(0.9, 1.15), rand(0, 6.28), 0.06));
    });
    const tmat = vcMat();
    for (const k of kinds) if (lists[k].length) {
      group.add(instanced(TREES[k](), tmat, lists[k], true, (c) => c.setHSL(0, 0, rand(0.85, 1.12))));
      lists[k] = [];
    }
  }

  // rocks: lumpy, flat-shaded clusters
  {
    const rockGeo = merged([
      [lumpy(1, 0, 0.35, 11, false), map.rock, T(0, 0, 0)],
      [lumpy(0.55, 0, 0.35, 12, false), map.rock, T(0.9, -0.15, 0.3)],
      [lumpy(0.4, 0, 0.35, 13, false), map.rock, T(-0.7, -0.2, -0.5)],
    ]);
    const rocks = scatter(terrain, 110, 3, 105, (x, y, z) => {
      const s = rand(0.35, 2.2);
      return comp(x, y + s * 0.1, z, s, s * rand(0.55, 0.9), rand(0, 6.28), 0.3);
    });
    const rm = instanced(rockGeo, vcMat({ flatShading: true }), rocks, true, (c) => c.setHSL(0, 0, rand(0.82, 1.1)));
    group.add(rm);
    // pebbles in the field: tiny, no shadows, purely decorative
    const peb = [];
    for (let i = 0; i < 260; i++) { const x = rand(-110, 110), z = rand(-110, 110); const s = rand(0.06, 0.16); if (terrain.feat && terrain.blocked(x, z, 0)) continue; peb.push(comp(x, terrain.height(x, z) + s * 0.2, z, s, s * 0.6)); }
    group.add(instanced(lumpy(1, 0, 0.4, 3, false), new THREE.MeshLambertMaterial({ color: map.rock, flatShading: true }), peb, false));
  }

  // bushes
  {
    const bushGeo = merged([
      [lumpy(0.8, 1, 0.3, 21), map.bushes, T(0, 0.45, 0, 1, 0.8, 1)],
      [lumpy(0.6, 1, 0.3, 22), new THREE.Color(map.bushes).multiplyScalar(1.15), T(0.6, 0.38, 0.2, 1, 0.8, 1)],
      [lumpy(0.55, 1, 0.3, 23), new THREE.Color(map.bushes).multiplyScalar(0.9), T(-0.5, 0.35, -0.2, 1, 0.8, 1)],
    ]);
    const bushes = groves(terrain, 120, 4, 90, (x, y, z) => comp(x, y - 0.05, z, rand(0.7, 1.5), rand(0.7, 1.2)));
    group.add(instanced(bushGeo, vcMat(), bushes, true, (c) => c.setHSL(0, 0, rand(0.85, 1.12))));
  }

  // grass tufts: three crossed blades with dark roots and light tips. Fewer inside
  // the field so units stay readable.
  {
    const blade = (ry) => {
      const g = new THREE.PlaneGeometry(0.2, 0.5, 1, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + 0.25) / 0.5; p.setX(i, p.getX(i) * (1 - t * 0.9)); p.setZ(i, t * t * 0.08); }
      g.translate(0, 0.25, 0); g.rotateY(ry);
      return g;
    };
    const parts = [0, 1.05, 2.1].map((ry) => [blade(ry), '#ffffff']);
    const geo = merged(parts);
    const col = geo.attributes.color, pos = geo.attributes.position;
    const root = new THREE.Color(map.grass).multiplyScalar(0.8), tip = new THREE.Color(map.grass).lerp(new THREE.Color(map.grassTip), 0.35), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.copy(root).lerp(tip, clamp(pos.getY(i) / 0.5, 0, 1)); col.setXYZ(i, c.r, c.g, c.b); }
    // light blades like the ground (normals up) and make them two-sided by adding
    // a reversed copy, so the material can stay FrontSide
    const N = pos.count, P2 = new Float32Array(N * 6), C2 = new Float32Array(N * 6), N2 = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const j = N + (i - (i % 3)) + (2 - (i % 3));
      for (const [dst, src] of [[P2, pos.array], [C2, col.array]]) for (let k = 0; k < 3; k++) { dst[i * 3 + k] = src[i * 3 + k]; dst[j * 3 + k] = src[i * 3 + k]; }
    }
    for (let i = 0; i < N * 2; i++) { N2[i * 3] = 0.15 * Math.sin(i); N2[i * 3 + 1] = 1; N2[i * 3 + 2] = 0.15 * Math.cos(i); }
    geo.setAttribute('position', new THREE.BufferAttribute(P2, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C2, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
    geo.computeBoundingSphere();
    const tufts = [];
    for (let i = 0; i < 6000; i++) {
      const x = rand(-112, 112), z = rand(-112, 112);
      const inField = outDist(x, z) === 0;
      if (inField && Math.random() < 0.55) continue;
      if (terrain.feat && (terrain.blocked(x, z, 0) || terrain.waterDepth(x, z + 0.8) > 0 || (inField && map.tufts !== undefined && Math.random() > map.tufts))) continue;
      const big = vnoise(x * 0.08, z * 0.08);
      const k = inField ? 0.7 : 1;
      tufts.push(comp(x, terrain.height(x, z) - 0.02, z, rand(0.8, 1.3) * (0.7 + big * 0.8) * k, rand(0.4, 0.9) * (0.6 + big * 0.9) * k));
    }
    const tm = instanced(geo, vcMat(), tufts, false, (c2) => c2.setHSL(0, 0, rand(0.85, 1.1)));
    group.add(tm);
  }

  // flowers: stem + head, colourful clusters
  if (map.flowers) {
    const geo = merged([
      [new THREE.CylinderGeometry(0.012, 0.012, 0.3, 3), '#3f7a2a', T(0, 0.15, 0)],
      [new THREE.IcosahedronGeometry(0.075, 0), '#ffffff', T(0, 0.32, 0, 1, 0.6, 1)],
      [new THREE.SphereGeometry(0.035, 5, 4), '#ffe14a', T(0, 0.35, 0)],
    ]);
    const fl = [];
    const cols = map.flowers.map((c) => new THREE.Color(c));
    const fcol = [];
    const centers = scatter(terrain, 90, -1, 100, (x, y, z) => [x, z]);
    for (const [cx, cz] of centers) {
      const ci = Math.floor(Math.random() * cols.length);
      for (let i = 0; i < 12; i++) {
        const x = cx + rand(-2.5, 2.5), z = cz + rand(-2.5, 2.5);
        if (terrain.feat && terrain.blocked(x, z, 0.2)) continue;
        fl.push(comp(x, terrain.height(x, z), z, rand(0.8, 1.3)));
        fcol.push(cols[Math.random() < 0.8 ? ci : Math.floor(Math.random() * cols.length)]);
      }
    }
    group.add(instanced(geo, vcMat(), fl, false, (c, i) => c.copy(fcol[i])));
  }

  // a few map-themed props outside the field
  {
    const pmat = vcMat({ flatShading: true });
    const place = (kind, n, minO, maxO, s0 = 0.9, s1 = 1.2) => {
      const ms = scatter(terrain, n, minO, maxO, (x, y, z) => comp(x, y - 0.05, z, rand(s0, s1)), 0.18);
      if (ms.length) group.add(instanced(PROPS[kind](), pmat, ms));
    };
    if (map.props === 'farm' || map.props === 'river') { place('hay', 10, 6, 40); place('log', 10, 5, 60); place('stump', 14, 5, 70); }
    if (map.props === 'desert') { place('skull', 10, 5, 50); place('log', 6, 5, 50); }
    if (map.props === 'winter') { place('snowman', 6, 6, 35); place('log', 8, 5, 50); place('stump', 10, 5, 60); }
    if (map.props === 'farm' || map.props === 'river') { // fence runs along the far edges of the field
      const ms = [];
      for (const sz of [-1, 1]) for (let x = -36; x <= 36; x += 3.4) {
        if (Math.random() < 0.25) continue;
        const z = sz * (FIELD.z + 7 + Math.sin(x * 0.2) * 0.6);
        ms.push(comp(x, terrain.height(x, z) - 0.05, z, 1, 1, rand(-0.06, 0.06)));
      }
      group.add(instanced(PROPS.fence(), pmat, ms));
    }
  }
  // walls, water, bridges and the map's own set dressing
  buildFeatureScene(group, map, terrain, MAP_H);
  return { group, sun, hemi };
}

// Scenery helpers for maps added by packs (src/packs/maps-*.js): they push their map into
// MAPS, add trees / props to MAP_H.TREES / MAP_H.PROPS (geometry makers built with
// merged / T / lumpy), and draw their own obstacle kinds and set dressing through
// register({ obstacles, scenery }) (src/ext.js, used by src/mapscene.js).
export const MAP_H = { merged, T, lumpy, TREES, PROPS, instanced, vcMat, comp, scatter, groves, outDist, FIELD, SIZE };
