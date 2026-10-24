// Visuals for map features (src/features.js): water, obstacles, breakables,
// bridges and each feature map's set dressing outside the field. Helpers come from
// world.js (H) so this module has no import cycle with it.
import { THREE, clamp, rand } from './util.js';

const hash1 = (n) => { const s = Math.sin(n * 91.345 + 47.853) * 43758.5453; return s - Math.floor(s); };
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);

// Geometry for one obstacle in its local frame (origin on the ground at its centre,
// x along its length). `dn` is how far it reaches below that to cover slopes.
function obstacleParts(o, map, H) {
  const { T, lumpy } = H;
  const st = map.stone || '#a9a597', wd = map.wood || '#8a6038';
  const s = o.seed, dn = o.ground - o.y0, p = [];
  const box = (w, h, d, c, x, y, z, rx = 0, ry = 0, rz = 0) => p.push([BOX(w, h, d), c, T(x, y, z, 1, 1, 1, rx, ry, rz)]);
  switch (o.kind) {
    case 'wall': case 'ruin': {
      const L = o.hw * 2, D = o.hd * 2, h = o.h;
      box(L, h + dn, D, st, 0, (h - dn) / 2, 0);
      box(L + 0.12, 0.45, D + 0.16, shade(st, 0.82), 0, 0.1, 0); // plinth
      // a few proud stones on the faces for texture
      for (let i = 0; i < Math.round(L * 0.9); i++) {
        const r1 = hash1(s * 13 + i), r2 = hash1(s * 7 + i * 3), side = i % 2 ? 1 : -1;
        box(0.5 + r1 * 0.5, 0.3 + r2 * 0.2, 0.08, shade(st, 0.88 + r2 * 0.2), (r1 - 0.5) * (L - 0.8), 0.5 + r2 * (h - 0.9), side * (D / 2 + 0.02));
      }
      if (o.kind === 'wall') {
        box(L + 0.1, 0.18, D + 0.14, shade(st, 0.9), 0, h, 0);
        const n = Math.max(1, Math.floor(L / 1.25));
        for (let i = 0; i < n; i++) box(0.62, 0.6, D + 0.12, shade(st, 0.96), -L / 2 + (i + 0.5) * (L / n), h + 0.38, 0);
      } else {
        // jagged broken top and rubble at the foot
        for (let i = 0; i < 3; i++) box(L * (0.25 + hash1(s + i) * 0.25), 0.3 + hash1(s * 3 + i) * 0.35, D * 0.9, shade(st, 0.94), (hash1(s * 5 + i) - 0.5) * L * 0.6, h + 0.1, 0, 0, 0, (hash1(s + i * 9) - 0.5) * 0.3);
        for (let i = 0; i < 3; i++) p.push([lumpy(0.25 + hash1(s * 11 + i) * 0.2, 0, 0.4, s + i, false), shade(st, 0.85), T((hash1(s * 17 + i) - 0.5) * L, 0.12, (i % 2 ? 1 : -1) * (D / 2 + 0.35))]);
      }
      break;
    }
    case 'tower': {
      const r = o.r, h = o.h;
      p.push([CYL(r, r * 1.06, h + dn, 14), st, T(0, (h - dn) / 2, 0)]);
      p.push([CYL(r + 0.2, r + 0.2, 0.3, 14), shade(st, 0.9), T(0, h, 0)]);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(0.5, 0.6, 0.5, shade(st, 0.96), Math.cos(a) * r, h + 0.45, Math.sin(a) * r, 0, -a, 0); }
      if (map.roof) p.push([new THREE.ConeGeometry(r * 1.05, r * 1.6, 14), map.roof, T(0, h + 0.15 + r * 0.8, 0)]);
      box(0.3, 0.7, 0.08, '#2a2a30', r * 0.98, h * 0.62, 0, 0, Math.PI / 2, 0); // arrow slit
      break;
    }
    case 'well': {
      const r = o.r;
      p.push([CYL(r, r, o.h + dn, 14), st, T(0, (o.h - dn) / 2, 0)]);
      p.push([CYL(r * 0.78, r * 0.78, 0.05, 14), '#2f6f9a', T(0, o.h - 0.25, 0)]);
      for (const sx of [-1, 1]) box(0.16, 1.6, 0.16, wd, sx * r * 0.8, o.h + 0.8, 0);
      p.push([new THREE.ConeGeometry(r * 1.1, 0.9, 4), shade(wd, 0.8), T(0, o.h + 1.9, 0, 1, 1, 0.8, 0, Math.PI / 4, 0)]);
      box(r * 1.6, 0.1, 0.1, wd, 0, o.h + 1.4, 0);
      break;
    }
    case 'pillar': {
      const r = o.r, h = o.h;
      box(r * 2.6, 0.35, r * 2.6, shade(st, 0.9), 0, 0.12, 0);
      p.push([CYL(r * 0.9, r, h + dn, 10), st, T(0, (h - dn) / 2, 0)]);
      if (o.broken) p.push([lumpy(r * 0.95, 0, 0.45, s, false), shade(st, 0.95), T(0, h, 0, 1, 0.5, 1)]);
      else box(r * 2.5, 0.35, r * 2.5, shade(st, 0.95), 0, h + 0.1, 0);
      break;
    }
    case 'fallen': {
      const L = o.hw * 2;
      p.push([CYL(o.hd, o.hd, L, 10), st, T(0, o.hd * 0.9, 0, 1, 1, 1, 0, 0, Math.PI / 2)]);
      box(0.9, 0.9, 0.9, shade(st, 0.92), L / 2 - 0.2, 0.45, 0.1);
      break;
    }
    case 'log': {
      const L = o.hw * 2;
      p.push([CYL(o.hd, o.hd * 1.1, L, 9), '#6a4c30', T(0, o.hd * 0.9, 0, 1, 1, 1, 0, 0, Math.PI / 2)]);
      p.push([CYL(o.hd * 0.9, o.hd * 0.9, 0.04, 9), '#c9a274', T(L / 2 + 0.03, o.hd * 0.9, 0, 1, 1, 1, 0, 0, Math.PI / 2)]);
      p.push([lumpy(0.5, 1, 0.3, s), '#3f8a36', T(-L * 0.2, o.hd * 1.8, 0.1, 1.2, 0.5, 1)]);
      break;
    }
    case 'rock': {
      p.push([lumpy(1, 0, 0.35, s * 3, false), map.rock, T(0, o.h * 0.42 - 0.2, 0, o.r * 1.12, o.h * 0.62, o.r * 1.12, 0, s, 0)]);
      p.push([lumpy(0.5, 0, 0.4, s * 5, false), shade(map.rock, 0.9), T(o.r * 0.8, 0.1, o.r * 0.4, o.r * 0.7, o.r * 0.5, o.r * 0.7)]);
      break;
    }
    case 'tomb': {
      const w = o.hd * 2, h = o.h, c = shade(st, 0.85 + hash1(s) * 0.25);
      box(0.6, 0.18, w + 0.25, shade(st, 0.75), 0, 0.02, 0);
      if (o.sub === 1) { // cross
        box(o.hw * 2, h + dn, 0.24, c, 0, (h - dn) / 2, 0);
        box(o.hw * 2, 0.24, w, c, 0, h * 0.68, 0);
      } else {
        box(o.hw * 2, h - w / 2 + dn, w, c, 0, (h - w / 2 - dn) / 2, 0);
        p.push([new THREE.CylinderGeometry(w / 2, w / 2, o.hw * 2, 12, 1, false, 0, Math.PI), c, T(0, h - w / 2, 0, 1, 1, 1, 0, 0, Math.PI / 2)]);
        box(0.02, 0.06, w * 0.5, shade(st, 0.55), o.hw + 0.005, h * 0.55, 0); // carved lines
        box(0.02, 0.06, w * 0.35, shade(st, 0.55), o.hw + 0.005, h * 0.42, 0);
        box(0.02, 0.06, w * 0.5, shade(st, 0.55), -o.hw - 0.005, h * 0.55, 0);
      }
      break;
    }
    case 'mausoleum': {
      const W = o.hw * 2, D = o.hd * 2, h = o.h;
      box(W + 0.8, 0.5, D + 0.8, shade(st, 0.8), 0, 0.15, 0);
      box(W - 0.6, h - 1.1 + dn, D - 0.6, st, 0, (h - 1.1 - dn) / 2 + 0.3, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push([CYL(0.28, 0.32, h - 1.1, 8), shade(st, 1.08), T(sx * (W / 2 - 0.35), (h - 1.1) / 2 + 0.3, sz * (D / 2 - 0.35))]);
      box(W, 0.4, D, shade(st, 0.95), 0, h - 0.6, 0);
      p.push([new THREE.CylinderGeometry(0.01, W * 0.62, 1.2, 4, 1), shade(st, 0.78), T(0, h + 0.2, 0, 1, 1, D / W, 0, Math.PI / 4, 0)]);
      for (const sx of [-1, 1]) {
        box(0.06, 1.9, 1.4, '#1c1a24', sx * (W / 2 - 0.29), 1.3, 0); // doors at both ends
        box(0.1, 0.18, 0.3, '#c8a640', sx * (W / 2 - 0.25), 1.3, 0.25);
      }
      box(0.3, 1.1, 0.12, shade(st, 1.1), 0, h + 0.75, 0); // the cross on top
      box(0.3, 0.12, 0.7, shade(st, 1.1), 0, h + 0.95, 0);
      break;
    }
    case 'hull': {
      const L = o.hw * 2, D = o.hd * 2;
      // a wrecked boat keeled over and half sunk in the sand: a bowl-shaped hull
      // (lower half of a stretched sphere) with its deck, a broken mast and a hole
      const tilt = T(0, 0.7, 0, 1, 1, 1, 0.45, 0, 0);
      const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      p.push([hull, '#6a4a2e', tilt.clone().multiply(T(0, 0.9, 0, L / 2, D * 0.95, D / 2 + 0.2))]);
      p.push([CYL(1, 1, 0.12, 16), '#9a7448', tilt.clone().multiply(T(0, 0.86, 0, L / 2 - 0.1, 1, D / 2 + 0.05))]);
      for (let i = 0; i < 5; i++) p.push([BOX(0.08, 0.02, D), '#7a5838', tilt.clone().multiply(T(-L / 2 + 1 + i * (L - 2) / 4, 0.93, 0))]);
      p.push([BOX(L * 0.75, 0.12, 0.12), '#e0b030', tilt.clone().multiply(T(0, 0.55, D / 2 + 0.1))]);
      p.push([CYL(0.18, 0.22, 3.2, 7), '#5e4028', tilt.clone().multiply(T(L * 0.1, 2.4, 0))]);
      p.push([lumpy(0.5, 0, 0.4, s, false), '#2a1c12', tilt.clone().multiply(T(-L * 0.2, 0.2, D / 2 + 0.1, 1.2, 0.8, 0.3))]);
      p.push([lumpy(1.2, 1, 0.3, s), '#e2c890', T(L * 0.35, 0, -D * 0.4, 2.2, 0.6, 1.4)]);
      p.push([lumpy(1.2, 1, 0.3, s + 1), '#e2c890', T(-L * 0.4, 0, D * 0.5, 2.0, 0.5, 1.2)]);
      break;
    }
    case 'chest': {
      box(o.hw * 2, o.h * 0.65 + dn, o.hd * 2, '#8a5a2a', 0, (o.h * 0.65 - dn) / 2, 0);
      p.push([new THREE.CylinderGeometry(o.hd, o.hd, o.hw * 2, 10, 1, false, 0, Math.PI), '#9a6a32', T(0, o.h * 0.65, 0, 1, 0.7, 1, 0, 0, Math.PI / 2)]);
      box(o.hw * 2 + 0.04, 0.08, o.hd * 2 + 0.04, '#e0b030', 0, o.h * 0.4, 0);
      box(0.14, 0.18, 0.06, '#e0b030', 0, o.h * 0.6, o.hd + 0.02);
      p.push([lumpy(0.18, 0, 0.3, s, false), '#ffd84a', T(0.15, o.h * 0.85, 0)]);
      break;
    }
    case 'rail': {
      const L = o.hw * 2;
      box(L, 0.12, 0.12, wd, 0, o.h, 0);
      box(L, 0.1, 0.08, shade(wd, 0.9), 0, o.h * 0.55, 0);
      const n = Math.max(2, Math.round(L / 1.6));
      for (let i = 0; i <= n; i++) box(0.16, o.h + 0.6, 0.16, shade(wd, 0.85), -L / 2 + (i * L) / n, (o.h - 0.6) / 2, 0);
      break;
    }
    default:
      box(o.shape === 'box' ? o.hw * 2 : o.r * 2, o.h, o.shape === 'box' ? o.hd * 2 : o.r * 2, st, 0, o.h / 2, 0);
  }
  return p;
}

// breakable kinds: one instanced mesh each, unit geometry scaled per instance
function breakGeo(kind, map, H) {
  const { merged, T, lumpy, PROPS } = H;
  const wd = map.wood || '#8a6038';
  switch (kind) {
    case 'crate': {
      const p = [[BOX(1, 1, 1), shade(wd, 1.15), T(0, 0.5, 0)]];
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) p.push([BOX(0.1, 1.02, 0.1), shade(wd, 0.75), T(x * 0.47, 0.5, z * 0.47)]);
      for (const y of [0.04, 0.96]) for (const sz of [-1, 1]) { p.push([BOX(1.02, 0.1, 0.1), shade(wd, 0.75), T(0, y, sz * 0.47)]); p.push([BOX(0.1, 0.1, 1.02), shade(wd, 0.75), T(sz * 0.47, y, 0)]); }
      for (const sz of [-1, 1]) p.push([BOX(1.2, 0.09, 0.04), shade(wd, 0.8), T(0, 0.5, sz * 0.505, 1, 1, 1, 0, 0, 0.78)]);
      return merged(p);
    }
    case 'barrel': return merged([
      [CYL(0.9, 0.9, 1, 12), shade(wd, 1.05), T(0, 0.5, 0)],
      [CYL(1.0, 1.0, 0.08, 12), '#4a4a50', T(0, 0.18, 0)],
      [CYL(1.0, 1.0, 0.08, 12), '#4a4a50', T(0, 0.82, 0)],
      [CYL(0.85, 0.85, 0.02, 12), shade(wd, 0.8), T(0, 1.0, 0)],
    ]);
    case 'pot': return merged([
      [new THREE.SphereGeometry(0.9, 10, 7), '#c0703e', T(0, 0.45, 0, 1, 0.55, 1)],
      [CYL(0.5, 0.65, 0.3, 10), '#b0603a', T(0, 0.9, 0)],
      [CYL(0.95, 0.95, 0.06, 10), '#f0c890', T(0, 0.5, 0)],
    ]);
    case 'pumpkin': {
      const p = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.push([new THREE.SphereGeometry(0.62, 8, 6), i % 2 ? '#ff8a1a' : '#f07a12', T(Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35, 0.7, 0.8, 0.7)]); }
      p.push([CYL(0.06, 0.09, 0.3, 5), '#3f6a2a', T(0, 1.0, 0)]);
      // a goofy carved face (glowing)
      p.push([new THREE.ConeGeometry(0.12, 0.14, 3), '#ffe060', T(0.85, 0.65, 0.2, 1, 1, 1, 0, 0, -Math.PI / 2)]);
      p.push([new THREE.ConeGeometry(0.12, 0.14, 3), '#ffe060', T(0.85, 0.65, -0.2, 1, 1, 1, 0, 0, -Math.PI / 2)]);
      p.push([BOX(0.04, 0.12, 0.45), '#ffe060', T(0.86, 0.38, 0)]);
      return merged(p);
    }
    case 'fence': return merged([
      ...[-1.5, 0, 1.5].map((x) => [BOX(0.16, 1.1, 0.16), shade(wd, 1), T(x, 0.55, 0)]),
      ...[0.45, 0.85].map((y) => [BOX(3.3, 0.12, 0.08), shade(wd, 1.15), T(0, y, 0.06)]),
    ]);
    case 'ironfence': {
      const p = [[BOX(3.2, 0.06, 0.06), '#2a2a32', T(0, 0.25, 0)], [BOX(3.2, 0.06, 0.06), '#2a2a32', T(0, 0.85, 0)]];
      for (let i = 0; i <= 10; i++) {
        const x = -1.6 + i * 0.32;
        p.push([BOX(0.05, 1.05, 0.05), '#2a2a32', T(x, 0.52, 0)]);
        p.push([new THREE.ConeGeometry(0.06, 0.16, 4), '#3a3a44', T(x, 1.1, 0)]);
      }
      for (const x of [-1.6, 1.6]) p.push([BOX(0.16, 1.25, 0.16), '#34343c', T(x, 0.6, 0)]);
      return merged(p);
    }
  }
  return null;
}
// per-instance scale from the obstacle's size (geometry is unit-sized)
function breakScale(o) {
  switch (o.kind) {
    case 'crate': return [o.hw * 2, o.h, o.hd * 2];
    case 'barrel': return [o.r, o.h, o.r];
    case 'pot': return [o.r * 1.05, o.h, o.r * 1.05];
    case 'pumpkin': return [o.r * 1.2, o.h * 1.2, o.r * 1.2];
    default: return [o.hw / 1.6, 1, 1];
  }
}
const DEBRIS = { crate: '#a07040', barrel: '#8a6038', fence: '#a07040', ironfence: '#2a2a32', pot: '#c0703e', pumpkin: '#ff8a1a' };

export function buildFeatureScene(group, map, terrain, H) {
  const F = terrain.feat;
  const { merged, T, instanced, vcMat, FIELD } = H;
  if (map.sea !== undefined) {
    const g = new THREE.PlaneGeometry(900, 900, 1, 1);
    g.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: map.water || '#2fa8d8', shininess: 90, specular: '#cfefff' }));
    sea.position.set(0, map.sea, 0);
    sea.receiveShadow = true;
    group.add(sea);
  }
  outerScenery(group, map, terrain, H);
  if (!F) return;

  // ---- water: a mesh on the surface grid wherever there is water nearby
  if (F.anyWater) {
    const SEG = terrain.seg, n = SEG + 1, S = terrain.size;
    const pos = [], col = [], idx = [], vid = new Int32Array(n * n).fill(-1);
    const shallow = new THREE.Color(map.water || '#3c9ad6').lerp(new THREE.Color('#ffffff'), map.waterLight ?? 0.25), deep = new THREE.Color(map.water || '#3c9ad6').multiplyScalar(0.8), c = new THREE.Color();
    const vert = (i) => {
      if (vid[i] >= 0) return vid[i];
      const ix = i % n, iz = (i - ix) / n;
      pos.push((ix / SEG - 0.5) * S, F.ws[i], (iz / SEG - 0.5) * S);
      c.copy(shallow).lerp(deep, clamp(F.wd[i] / 0.7, 0, 1));
      col.push(c.r, c.g, c.b);
      return (vid[i] = pos.length / 3 - 1);
    };
    for (let iz = 0; iz < SEG; iz++) for (let ix = 0; ix < SEG; ix++) {
      const a = iz * n + ix, b = a + 1, cc = a + n, d = cc + 1;
      if (!(F.ws[a] === F.ws[a] && F.ws[b] === F.ws[b] && F.ws[cc] === F.ws[cc] && F.ws[d] === F.ws[d])) continue;
      if (F.wd[a] + F.wd[b] + F.wd[cc] + F.wd[d] <= 0) continue;
      idx.push(vert(a), vert(cc), vert(b), vert(b), vert(cc), vert(d));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: map.waterOpacity ?? 0.78, shininess: 70, specular: map.waterLight === 0 ? '#5a4a40' : '#dff4ff', depthWrite: false }));
    m.renderOrder = 1;
    m.receiveShadow = true;
    group.add(m);
  }

  // ---- bridges: plank decks following the deck surface, beams down to the bed
  if (F.bridges.length) {
    const wd = map.wood || '#8a6038', parts = [];
    for (const b of F.bridges) {
      const rot = Math.atan2(-b.uz, b.ux), mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
      const np = Math.ceil(b.len / 0.55);
      for (let i = 0; i < np; i++) {
        const u = -b.len / 2 + (i + 0.5) * (b.len / np), x = mx + b.ux * u, z = mz + b.uz * u;
        const y = terrain.height(x, z) + 0.05;
        parts.push([BOX(0.5, 0.1, b.w - 0.1 + hash1(i) * 0.1), shade(wd, 0.95 + hash1(i * 3) * 0.2), T(x, y, z, 1, 1, 1, 0, rot, 0)]);
      }
      // side beams and the piles they rest on
      for (const sv of [-1, 1]) {
        const ox = -b.uz * sv * (b.w / 2), oz = b.ux * sv * (b.w / 2);
        for (let i = 0; i <= 6; i++) {
          const u = -b.len / 2 + 1 + (i * (b.len - 2)) / 6, x = mx + b.ux * u + ox, z = mz + b.uz * u + oz;
          const top = terrain.height(mx + b.ux * u, mz + b.uz * u);
          const bot = Math.min(top - 0.6, terrain.height(x - ox * 0.6, z - oz * 0.6) - 0.4);
          parts.push([CYL(0.14, 0.16, top - bot, 6), shade(wd, 0.7), T(x, (top + bot) / 2, z)]);
        }
        const segs = 8;
        for (let i = 0; i < segs; i++) {
          const ua = -b.len / 2 + (i * b.len) / segs, ub = ua + b.len / segs;
          const xa = mx + b.ux * ua, za = mz + b.uz * ua, xb = mx + b.ux * ub, zb = mz + b.uz * ub;
          const ya = terrain.height(xa, za) - 0.12, yb = terrain.height(xb, zb) - 0.12;
          const L = Math.hypot(xb - xa, zb - za, yb - ya);
          parts.push([BOX(L, 0.3, 0.14), shade(wd, 0.8), T((xa + xb) / 2 + ox, (ya + yb) / 2, (za + zb) / 2 + oz, 1, 1, 1, 0, rot, Math.atan2(yb - ya, Math.hypot(xb - xa, zb - za)))]);
        }
      }
    }
    const m = new THREE.Mesh(merged(parts), vcMat({ flatShading: true }));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // ---- static obstacles, merged into one mesh
  const parts = [], trees = {}, brk = {};
  for (const o of F.obs) {
    if (o.kind === 'tree') { (trees[o.sub] ||= []).push(o); continue; }
    if (o.breakable) { (brk[o.kind] ||= []).push(o); continue; }
    const M = T(o.x, o.ground, o.z, 1, 1, 1, 0, o.rot, 0);
    for (const [g, c, m] of obstacleParts(o, map, H)) parts.push([g, c, m ? M.clone().multiply(m) : M]);
  }
  if (parts.length) {
    const m = new THREE.Mesh(merged(parts), vcMat({ flatShading: true }));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  const tmat = vcMat();
  for (const [k, list] of Object.entries(trees)) {
    if (!H.TREES[k]) continue;
    group.add(instanced(H.TREES[k](), tmat, list.map((o) => H.comp(o.x, o.ground - 0.1, o.z, o.s || 1, o.s || 1, hash1(o.seed) * 6.28))));
  }
  // ---- breakables: instanced, hidden one by one as they get smashed
  const slots = new Map();
  const bmat = vcMat({ flatShading: true });
  for (const [k, list] of Object.entries(brk)) {
    const geo = breakGeo(k, map, H);
    if (!geo) continue;
    const mats = list.map((o) => { const [sx, sy, sz] = breakScale(o); return T(o.x, o.ground - 0.03, o.z, sx, sy, sz, 0, o.rot, 0); });
    const mesh = instanced(geo, bmat, mats);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    list.forEach((o, j) => slots.set(o.i, { mesh, j, m: mats[j], o }));
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  // called from FX on a 'propbreak' event (live and in replays) and on clear()
  terrain.breakProp = (i, fx) => {
    const s = slots.get(i);
    if (!s || s.gone) return;
    s.gone = true;
    s.mesh.setMatrixAt(s.j, zero);
    s.mesh.instanceMatrix.needsUpdate = true;
    if (fx) {
      const o = s.o, col = DEBRIS[o.kind] || '#a07040';
      for (let k = 0; k < 10; k++) fx.chunk(o.x + rand(-0.4, 0.4), o.ground + rand(0.2, o.h), o.z + rand(-0.4, 0.4), rand(-3, 3), rand(2, 5), rand(-3, 3), rand(0.06, 0.16), rand(0.8, 1.6), col);
    }
  };
  terrain.resetProps = () => {
    for (const s of slots.values()) if (s.gone) { s.gone = false; s.mesh.setMatrixAt(s.j, s.m); s.mesh.instanceMatrix.needsUpdate = true; }
  };
}

// ------------------------------------------------------------------ set dressing
function outerScenery(group, map, terrain, H) {
  const { merged, T, lumpy, instanced, vcMat, comp, scatter, FIELD } = H;
  const pmat = vcMat({ flatShading: true });
  const st = map.stone || '#a9a597';
  const addMerged = (parts) => { if (!parts.length) return; const m = new THREE.Mesh(merged(parts), pmat); m.castShadow = m.receiveShadow = true; group.add(m); };
  const at = (x, z) => terrain.height(x, z);
  if (map.props === 'castle') {
    // an outer curtain wall with towers around the whole field
    const parts = [];
    const ring = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 6);
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        const xa = x0 + (x1 - x0) * a, za = z0 + (z1 - z0) * a, xb = x0 + (x1 - x0) * b, zb = z0 + (z1 - z0) * b;
        const x = (xa + xb) / 2, z = (za + zb) / 2, y = Math.min(at(xa, za), at(xb, zb), at(x, z));
        const rot = Math.atan2(-(zb - za), xb - xa);
        parts.push([BOX(L / n + 0.1, 9, 2), st, T(x, y + 3.5, z, 1, 1, 1, 0, rot, 0)]);
        for (let k = 0; k < 4; k++) parts.push([BOX(0.9, 0.9, 2.1), shade(st, 0.95), T(x + Math.cos(rot) * (-L / n / 2 + (k + 0.5) * L / n / 4), y + 8.4, z - Math.sin(rot) * (-L / n / 2 + (k + 0.5) * L / n / 4), 1, 1, 1, 0, rot, 0)]);
      }
    };
    const X = FIELD.x + 12, Z = FIELD.z + 12;
    ring(-X, -Z, X, -Z); ring(X, -Z, X, Z); ring(X, Z, -X, Z); ring(-X, Z, -X, -Z);
    for (const [x, z] of [[-X, -Z], [X, -Z], [X, Z], [-X, Z], [0, -Z], [0, Z], [-X, 0], [X, 0]]) {
      const y = at(x, z);
      parts.push([CYL(4, 4.4, 15, 14), shade(st, 1.04), T(x, y + 6, z)]);
      parts.push([new THREE.ConeGeometry(4.6, 6, 14), map.roof || '#5d6a8a', T(x, y + 16.5, z)]);
      parts.push([CYL(0.08, 0.08, 3, 4), '#5a4a3a', T(x, y + 20.5, z)]);
      parts.push([BOX(1.6, 0.9, 0.05), '#f2c230', T(x + 0.8, y + 21.4, z)]);
    }
    addMerged(parts);
  }
  if (map.props === 'beach') {
    // a pirate ship moored off the far shore
    const y = map.sea, x0 = -18, z0 = FIELD.z + 52;
    const parts = [
      [BOX(18, 3.2, 5.5), '#6a4a2e', T(x0, y + 1.2, z0)],
      [new THREE.ConeGeometry(2.8, 5, 4), '#6a4a2e', T(x0 + 11, y + 1.4, z0, 1, 1, 1.0, 0, Math.PI / 4, -Math.PI / 2)],
      [BOX(18.4, 0.5, 5.9), '#e0b030', T(x0, y + 2.9, z0)],
      [BOX(5, 2.2, 5.2), '#7a5434', T(x0 - 7, y + 4, z0)],
    ];
    for (const [dx, h] of [[-2, 14], [4, 11]]) {
      parts.push([CYL(0.25, 0.35, h, 7), '#5a3a22', T(x0 + dx, y + 2.8 + h / 2, z0)]);
      parts.push([BOX(0.2, h * 0.45, h * 0.5), '#f4efe2', T(x0 + dx + 0.4, y + 2.8 + h * 0.62, z0, 1, 1, 1, 0, 0, 0)]);
    }
    addMerged(parts);
    const ms = scatter(terrain, 12, 4, 30, (x, yy, z) => comp(x, yy - 0.05, z, rand(0.9, 1.2)), 0.2);
    if (ms.length) group.add(instanced(breakGeo('barrel', map, H), pmat, ms.map((m) => m.multiply(T(0, 0, 0, 0.45, 1, 0.45)))));
  }
  if (map.props === 'jungle') {
    // the volcano: a big lumpy cone with a glowing crater and a smoke plume
    const vx = -40, vz = -230, h = 150;
    const parts = [[lumpy(1, 3, 0.12, 7), '#5d5048', T(vx, -20, vz, 120, h, 120)],
      [lumpy(1, 2, 0.2, 9), '#4e7a3a', T(vx, -40, vz, 150, 70, 150)]];
    const cone = new THREE.Mesh(merged(parts), vcMat());
    cone.frustumCulled = false;
    group.add(cone);
    const lava = new THREE.Mesh(new THREE.CylinderGeometry(22, 26, 6, 16), new THREE.MeshBasicMaterial({ color: '#ff7a1a', fog: false }));
    lava.position.set(vx, -20 + h - 6, vz);
    group.add(lava);
    const smoke = [];
    for (let i = 0; i < 9; i++) smoke.push(comp(vx + i * 6 + rand(-6, 6), -20 + h + 10 + i * 14, vz + rand(-6, 6), 12 + i * 3, 9 + i * 2));
    group.add(instanced(lumpy(1, 1, 0.25, 3), new THREE.MeshLambertMaterial({ color: '#8a8580', emissive: '#3a3430', fog: false }), smoke, false));
    const ms = scatter(terrain, 10, 4, 40, (x, y, z) => comp(x, y, z, rand(1, 1.6)), 0.2);
    if (ms.length) group.add(instanced(H.PROPS.skull(), pmat, ms));
  }
  if (map.props === 'canyon') {
    // tall eroded rock pillars beyond the rims
    const parts = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rand(-0.1, 0.1), r = rand(80, 110);
      const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 0.9, y = at(x, z);
      const hh = rand(14, 34), w = rand(4, 9);
      parts.push([lumpy(1, 1, 0.25, i, false), shade(map.rock, rand(0.9, 1.1)), T(x, y + hh * 0.45, z, w, hh * 0.55, w)]);
      parts.push([lumpy(1, 1, 0.2, i + 40, false), shade(map.rock, 1.12), T(x, y + hh, z, w * 1.3, 2, w * 1.3)]);
    }
    addMerged(parts);
    const ms = scatter(terrain, 10, 5, 50, (x, y, z) => comp(x, y - 0.05, z, rand(0.9, 1.2)), 0.2);
    if (ms.length) group.add(instanced(H.PROPS.skull(), pmat, ms));
  }
  if (map.props === 'graveyard') {
    // more graves outside the field, a crooked church and a big moon
    const ms = scatter(terrain, 60, 3, 30, (x, y, z) => comp(x, y - 0.05, z, rand(0.8, 1.1), rand(0.8, 1.2), rand(-0.3, 0.3) + Math.PI / 2), 0.2);
    const tomb = merged([
      [BOX(0.3, 0.8, 0.9), st, T(0, 0.4, 0)],
      [new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10, 1, false, 0, Math.PI), st, T(0, 0.8, 0, 1, 1, 1, 0, 0, Math.PI / 2)],
    ]);
    group.add(instanced(tomb, pmat, ms));
    const pk = scatter(terrain, 14, 2, 25, (x, y, z) => comp(x, y - 0.05, z, rand(0.4, 0.6)), 0.2);
    if (pk.length) group.add(instanced(breakGeo('pumpkin', map, H), pmat, pk));
    const cx = 30, cz = FIELD.z + 40, y = at(cx, cz);
    addMerged([
      [BOX(14, 9, 8), '#5a5a68', T(cx, y + 4, cz, 1, 1, 1, 0, 0, 0.03)],
      [new THREE.CylinderGeometry(0.01, 7, 5, 4, 1), '#3a3448', T(cx, y + 11, cz, 1.4, 1, 0.8, 0, Math.PI / 4, 0)],
      [BOX(3.5, 18, 3.5), '#626272', T(cx - 8, y + 8, cz, 1, 1, 1, 0, 0, -0.04)],
      [new THREE.ConeGeometry(3, 7, 4), '#3a3448', T(cx - 8.4, y + 20.5, cz, 1, 1, 1, 0, Math.PI / 4, -0.04)],
      [BOX(1.2, 2, 0.1), '#ffd870', T(cx - 3, y + 5, cz - 4.05)],
      [BOX(1.2, 2, 0.1), '#ffd870', T(cx + 3, y + 5, cz - 4.05)],
    ]);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 12), new THREE.MeshBasicMaterial({ color: '#f2f0dc', fog: false }));
    moon.position.set(-260, 300, 190);
    group.add(moon);
  }
  if (map.props === 'river') {
    // reeds along the banks
    const F = terrain.feat;
    if (F && F.anyWater) {
      const ms = [];
      for (let i = 0; i < 1600 && ms.length < 260; i++) {
        const x = rand(-16, 16), z = rand(-110, 110), d = terrain.waterDepth(x, z);
        if (d <= 0.02 || d > 0.3) continue;
        ms.push(comp(x, terrain.height(x, z) - 0.1, z, rand(0.6, 1.1), rand(0.8, 1.4)));
      }
      const reed = merged([0, 1, 2, 3].map((k) => [CYL(0.02, 0.035, 1.6, 3), k % 2 ? '#6a9a3a' : '#8aae4a', T(Math.cos(k * 1.7) * 0.15, 0.8, Math.sin(k * 1.7) * 0.15, 1, 1, 1, Math.cos(k) * 0.15, 0, Math.sin(k) * 0.15)]));
      if (ms.length) group.add(instanced(reed, vcMat(), ms, false));
    }
  }
}
