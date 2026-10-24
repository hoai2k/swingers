// Maps: terrain (render mesh + physics trimesh sharing one height grid), sky,
// lighting and scenery.
import { THREE, clamp, rand, lerp, smooth } from './util.js';
import { RAPIER, GROUPS } from './physics.js';

export const FIELD = { x: 42, z: 32 }; // half extents of the battle area
export const ZONE_GAP = 3; // no man's land half width around x = 0

export const MAPS = [
  {
    id: 'grass', name: 'Simulation Grassland',
    ground: ['#6fae3d', '#8cc44e', '#5d9634'], far: '#4f8a3a', rock: '#8d8d86',
    sky: ['#7fb7ee', '#d7ecfb'], fog: '#cfe3f0', sun: '#fff3dc', hemiGround: '#5a7a3a',
    hills: 1, bumps: 0.5, trees: 'oak', grass: '#6aa83a', flowers: true,
  },
  {
    id: 'desert', name: 'Dusty Dunes',
    ground: ['#e3c27d', '#efd295', '#cfa965'], far: '#d6b06c', rock: '#c48c55',
    sky: ['#7fb2e6', '#f6e2bf'], fog: '#f1dfbf', sun: '#fff0d0', hemiGround: '#b3905a',
    hills: 1.3, bumps: 1.1, trees: 'cactus', grass: '#b9a35a', flowers: false,
  },
  {
    id: 'winter', name: 'Frozen Pass',
    ground: ['#eef3f7', '#ffffff', '#d7e2ec'], far: '#dfe8ef', rock: '#7d8a99',
    sky: ['#9fb8d6', '#e9eff5'], fog: '#e2e9f0', sun: '#f4f7ff', hemiGround: '#a8b7c8',
    hills: 1.15, bumps: 0.6, trees: 'pine', grass: '#cfdbe6', flowers: false, snow: true,
  },
];

const SIZE = 240, SEG = 160;

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
        this.h[iz * n + ix] = y;
      }
    }
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
    const g = this.map.ground.map((c) => new THREE.Color(c));
    const far = new THREE.Color(this.map.far);
    const tmp = new THREE.Color();
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const x = (ix / SEG - 0.5) * SIZE, z = (iz / SEG - 0.5) * SIZE;
      pos[i * 3] = x; pos[i * 3 + 1] = this.h[i]; pos[i * 3 + 2] = z;
      const nz = Math.sin(x * 0.37 + z * 0.11) * Math.sin(z * 0.29 - x * 0.07) * 0.5 + 0.5;
      const nz2 = Math.sin(x * 1.3 + 2.1) * Math.sin(z * 1.1 - 0.3) * 0.5 + 0.5;
      tmp.copy(g[0]).lerp(g[1], nz * 0.8).lerp(g[2], nz2 * 0.35);
      const out = Math.hypot(Math.max(0, Math.abs(x) - FIELD.x), Math.max(0, Math.abs(z) - FIELD.z));
      tmp.lerp(far, clamp(out / 50, 0, 0.7));
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
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
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    this.positions = pos; this.indices = idx;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  addCollider(world) {
    const cd = RAPIER.ColliderDesc.trimesh(this.positions, this.indices)
      .setFriction(0.9).setCollisionGroups(GROUPS.ground);
    return world.createCollider(cd);
  }
}

// A translucent overlay that hugs the terrain over a rectangle.
export function zoneMesh(terrain, x0, x1, z0, z1, color) {
  const nx = Math.ceil((x1 - x0) / 1.5), nz = Math.ceil((z1 - z0) / 1.5);
  const geo = new THREE.PlaneGeometry(1, 1, nx, nz);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = lerp(x0, x1, p.getX(i) + 0.5), z = lerp(z0, z1, p.getZ(i) + 0.5);
    p.setXYZ(i, x, terrain.height(x, z) + 0.06, z);
    uv.setXY(i, (x - x0) / 2, (z - z0) / 2);
  }
  geo.computeVertexNormals();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillRect(0, 0, 64, 3); g.fillRect(0, 0, 3, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.45, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function skyDome(map) {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const top = new THREE.Color(map.sky[0]), bot = new THREE.Color(map.sky[1]);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: top }, bot: { value: bot } },
    vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vp; void main(){ float h = normalize(vp).y; float t = clamp(pow(max(h,0.0),0.6),0.0,1.0); gl_FragColor = vec4(mix(bot, top, t), 1.0);} ',
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function cloud(mat) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const s = rand(6, 12);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat);
    m.position.set(i * 8 - n * 4 + rand(-2, 2), rand(-2, 3), rand(-4, 4));
    m.scale.y = 0.6;
    g.add(m);
  }
  return g;
}

// Instanced scenery; never placed inside the battle field.
function scatter(terrain, count, minOut, maxOut, fn) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries++ < count * 20) {
    const x = rand(-SIZE * 0.45, SIZE * 0.45), z = rand(-SIZE * 0.45, SIZE * 0.45);
    const o = Math.hypot(Math.max(0, Math.abs(x) - FIELD.x), Math.max(0, Math.abs(z) - FIELD.z));
    if (o < minOut || o > maxOut) continue;
    out.push(fn(x, terrain.height(x, z), z, o));
  }
  return out;
}

function instanced(geo, mat, mats, shadow = true) {
  const m = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, i) => m.setMatrixAt(i, mm));
  m.castShadow = shadow; m.receiveShadow = true;
  m.instanceMatrix.needsUpdate = true;
  return m;
}

export function buildScene(scene, map, terrain) {
  const group = new THREE.Group();
  scene.add(group);
  scene.background = new THREE.Color(map.fog);
  scene.fog = new THREE.Fog(map.fog, 90, 420);
  group.add(skyDome(map));

  const hemi = new THREE.HemisphereLight(map.sky[0], map.hemiGround, 1.35);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(map.sun, 2.4);
  sun.position.set(-40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 52; sc.bottom = -52; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(sun.target);

  const ground = terrain.buildMesh();
  group.add(ground);

  // clouds
  const cmat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#d8e4ee', flatShading: true });
  for (let i = 0; i < 14; i++) {
    const c = cloud(cmat);
    const a = rand(0, Math.PI * 2), r = rand(160, 380);
    c.position.set(Math.cos(a) * r, rand(70, 120), Math.sin(a) * r);
    c.rotation.y = rand(0, 3);
    group.add(c);
  }

  const M4 = () => new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const comp = (x, y, z, s, sy = s, ry = rand(0, 6.28)) =>
    M4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, ry).clone(), new THREE.Vector3(s, sy, s));

  // trees
  const trunks = [], crowns = [], crowns2 = [];
  scatter(terrain, map.trees === 'cactus' ? 70 : 170, 6, 95, (x, y, z, o) => {
    const s = rand(0.8, 1.5) * (o > 40 ? 1.4 : 1);
    trunks.push(comp(x, y, z, s));
    crowns.push(comp(x, y, z, s));
    if (map.trees !== 'cactus') crowns2.push(comp(x, y, z, s));
  });
  if (map.trees === 'oak') {
    const tg = new THREE.CylinderGeometry(0.25, 0.4, 3, 6); tg.translate(0, 1.5, 0);
    const cg = new THREE.IcosahedronGeometry(2.2, 0); cg.translate(0, 4.2, 0);
    const cg2 = new THREE.IcosahedronGeometry(1.6, 0); cg2.translate(0.9, 5.3, 0.4);
    group.add(instanced(tg, new THREE.MeshLambertMaterial({ color: '#6b4a2f' }), trunks));
    group.add(instanced(cg, new THREE.MeshLambertMaterial({ color: '#3f8a35', flatShading: true }), crowns));
    group.add(instanced(cg2, new THREE.MeshLambertMaterial({ color: '#4f9c3c', flatShading: true }), crowns2));
  } else if (map.trees === 'pine') {
    const tg = new THREE.CylinderGeometry(0.2, 0.3, 2, 6); tg.translate(0, 1, 0);
    const cg = new THREE.ConeGeometry(2, 4, 7); cg.translate(0, 3.6, 0);
    const cg2 = new THREE.ConeGeometry(1.4, 3, 7); cg2.translate(0, 5.6, 0);
    group.add(instanced(tg, new THREE.MeshLambertMaterial({ color: '#5a4030' }), trunks));
    group.add(instanced(cg, new THREE.MeshLambertMaterial({ color: '#2f5f45', flatShading: true }), crowns));
    group.add(instanced(cg2, new THREE.MeshLambertMaterial({ color: '#e9f0f6', flatShading: true }), crowns2));
  } else {
    const tg = new THREE.CylinderGeometry(0.35, 0.4, 3.4, 8); tg.translate(0, 1.7, 0);
    const cg = new THREE.CylinderGeometry(0.22, 0.25, 1.4, 8); cg.rotateZ(Math.PI / 2); cg.translate(0.7, 2.0, 0);
    const cmat = new THREE.MeshLambertMaterial({ color: '#4f8f45' });
    group.add(instanced(tg, cmat, trunks));
    group.add(instanced(cg, cmat, crowns));
  }

  // rocks
  const rocks = scatter(terrain, 90, 2, 100, (x, y, z) => {
    const s = rand(0.4, 2.2);
    return M4().compose(new THREE.Vector3(x, y + s * 0.2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3))),
      new THREE.Vector3(s, s * rand(0.5, 0.9), s * rand(0.8, 1.3)));
  });
  group.add(instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: map.rock, flatShading: true }), rocks));

  // grass tufts everywhere (small, no shadows)
  const tufts = [];
  for (let i = 0; i < 4000; i++) {
    const x = rand(-110, 110), z = rand(-110, 110);
    tufts.push(comp(x, terrain.height(x, z), z, rand(0.5, 1.1), rand(0.5, 1.2)));
  }
  const tgeo = new THREE.ConeGeometry(0.12, 0.45, 3); tgeo.translate(0, 0.2, 0);
  const tm = instanced(tgeo, new THREE.MeshLambertMaterial({ color: map.grass }), tufts, false);
  group.add(tm);
  if (map.flowers) {
    const fl = [];
    for (let i = 0; i < 700; i++) {
      const x = rand(-110, 110), z = rand(-110, 110);
      fl.push(comp(x, terrain.height(x, z) + 0.25, z, rand(0.7, 1.2)));
    }
    const fgeo = new THREE.IcosahedronGeometry(0.08, 0);
    const fm = instanced(fgeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), fl, false);
    const cols = ['#ffffff', '#ffe14a', '#ff7fb3', '#b07aff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < fl.length; i++) fm.setColorAt(i, cols[i % cols.length]);
    group.add(fm);
  }
  return { group, sun, hemi };
}
