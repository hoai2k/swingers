// Small ground detail, built after the rest of the island:
//  - grass tufts, flowers and pebbles: instanced, generated per 16 m tile on
//    demand and gathered per camera into one InstancedMesh per kind (so each
//    split-screen view costs 3 draw calls), only within a short radius, and
//    shrunk away smoothly at the edge so nothing pops;
//  - past them, out to ~115 m: flat billboard clumps of grass and of flowers
//    (one textured quad each, turned to face the camera, drawn on a canvas);
//    beyond that the ground's own grass texture (terrain.js) is all there is;
//  - road edge lines, gravel shoulders and kerbs (static, merged);
//  - night glow for street lamps: halos and light pools (instanced, additive).
// Nothing here has physics.
import * as THREE from 'three';
import { meshHeight, meshColor, isSand, fbm, regionAt, HOME_REGION } from '../terrain.js';
import { ROADS, onRoad } from './roads.js';
import { Builder, matVC } from '../mesh.js';

const TILE = 16;
const KINDS = {
  grass: { radius: 40, cap: 8000 },
  flower: { radius: 34, cap: 1600 },
  pebble: { radius: 36, cap: 900 },
};
// billboard clumps: shown from FADE_IN (grown in over 10 m) to OUT (faded over the last 18 m)
const CLUMP = { in: 30, out: 115, cap: 5000, step: 30 };

function hash2(i, j, k = 0) {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function rng(seed) {
  let s = (Math.floor(seed * 2147483646) || 1);
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---- geometry ---------------------------------------------------------------
function tuftGeometry() {
  const pos = [], col = [], nrm = [];
  const blades = 6;
  for (let i = 0; i < blades; i++) {
    const a = i / blades * Math.PI * 2 + (i % 2) * 0.4;
    const r0 = 0.05, lean = 0.12 + (i % 3) * 0.05, h = 0.32 + (i % 3) * 0.09, w = 0.055;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx;
    pos.push(cx * r0 - px * w, 0, cz * r0 - pz * w, cx * r0 + px * w, 0, cz * r0 + pz * w, cx * (r0 + lean), h, cz * (r0 + lean));
    col.push(0.55, 0.6, 0.55, 0.55, 0.6, 0.55, 1.18, 1.2, 0.95);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function flowerGeometry() {
  const pos = [], col = [], nrm = [];
  const y = 0.2, P = 5;
  for (let i = 0; i < P; i++) { // petals: a little star
    const a0 = i / P * Math.PI * 2, a1 = a0 + Math.PI / P, a2 = a0 + 2 * Math.PI / P;
    pos.push(0, y + 0.01, 0, Math.cos(a0) * 0.11, y, Math.sin(a0) * 0.11, Math.cos(a1) * 0.05, y + 0.005, Math.sin(a1) * 0.05);
    pos.push(0, y + 0.01, 0, Math.cos(a1) * 0.05, y + 0.005, Math.sin(a1) * 0.05, Math.cos(a2) * 0.11, y, Math.sin(a2) * 0.11);
    for (let k = 0; k < 6; k++) { col.push(k % 3 === 0 ? 1.25 : 1, k % 3 === 0 ? 1.15 : 1, k % 3 === 0 ? 0.6 : 1); nrm.push(0, 1, 0); }
  }
  // stem
  pos.push(-0.012, 0, 0, 0.012, 0, 0, 0, y, 0);
  for (let k = 0; k < 3; k++) { col.push(0.35, 0.55, 0.25); nrm.push(0, 1, 0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function pebbleGeometry() {
  const g = new THREE.OctahedronGeometry(0.16, 0);
  g.scale(1.2, 0.55, 0.9);
  g.translate(0, 0.02, 0);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const t = 0.8 + 0.35 * Math.max(0, g.attributes.normal.getY(i)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = t; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Lambert with per-instance fade-out by distance to the camera and a breeze.
function detailMaterial(radius, sway, timeU) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	{
		vec3 ip = instanceMatrix[3].xyz;
		float dd = distance(ip.xz, cameraPosition.xz);
		transformed *= smoothstep(${radius.toFixed(1)}, ${(radius * 0.72).toFixed(1)}, dd);
		float w = sin(uTime * 1.9 + ip.x * 0.35 + ip.z * 0.21) + 0.4 * sin(uTime * 3.7 + ip.x * 1.3);
		transformed.xz += w * ${sway.toFixed(3)} * max(position.y, 0.0) * vec2(0.8, 0.5);
	}`);
    // lit like the ground it grows from, whichever side of a blade you see
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n\tnormal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );');
  };
  m.customProgramCacheKey = () => 'wobDetail' + radius + sway;
  return m;
}

// Atlas of four 128 px cells: two grass clumps (grey, tinted per instance by
// the ground colour) and two flower clumps (coloured heads keep their colour).
function clumpAtlas() {
  const C = 128, cv = document.createElement('canvas');
  cv.width = C * 4; cv.height = C;
  const g = cv.getContext('2d');
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pal = ['#ffffff', '#ffd83a', '#ff6f9a', '#b884ff', '#ff5a4a', '#7fb2ff', '#ff9f3a'];
  for (let cell = 0; cell < 4; cell++) {
    const ox = cell * C;
    const blades = cell < 2 ? 34 : 22;
    for (let i = 0; i < blades; i++) {
      const bx = ox + 14 + r() * (C - 28), h = C * (0.35 + r() * 0.5), lean = (r() - 0.5) * 34, w = 3 + r() * 3, v = (120 + r() * 135) | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.moveTo(bx - w, C); g.quadraticCurveTo(bx + lean * 0.3, C - h * 0.5, bx + lean, C - h); g.quadraticCurveTo(bx + lean * 0.3 + w * 0.4, C - h * 0.5, bx + w, C); g.fill();
    }
    if (cell >= 2) {
      const main = pal[(cell === 2 ? 1 : 2)];
      for (let i = 0; i < 9; i++) {
        const fx = ox + 18 + r() * (C - 36), fy = C * (0.25 + r() * 0.45), fr = 6 + r() * 4;
        g.strokeStyle = '#5a8a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + (r() - 0.5) * 6, C); g.stroke();
        g.fillStyle = r() < 0.6 ? main : pal[(r() * pal.length) | 0];
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.beginPath(); g.arc(fx + Math.cos(a) * fr * 0.6, fy + Math.sin(a) * fr * 0.6, fr * 0.5, 0, 7); g.fill(); }
        g.fillStyle = '#ffc61a'; g.beginPath(); g.arc(fx, fy, fr * 0.32, 0, 7); g.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function clumpGeometry() {
  const g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  g.deleteAttribute('normal');
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  return g;
}
// Faces the camera around the vertical axis, picks one of two atlas cells by
// position, grows in near CLUMP.in and fades out by CLUMP.out. Grey texels take
// the instance colour; coloured ones (flowers) keep theirs.
function clumpMaterial(tex, base, timeU) {
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vTint;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
	{
		vec3 ipu = instanceMatrix[3].xyz;
		float cell = ${base.toFixed(1)} + step(0.5, fract(sin(dot(ipu.xz, vec2(12.9898, 78.233))) * 43758.5453));
		vMapUv = vec2((uv.x + cell) * 0.25, uv.y);
	}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	{
		vec3 ip = instanceMatrix[3].xyz;
		vec2 to = cameraPosition.xz - ip.xz;
		float dd = length(to);
		vec2 f = to / max(dd, 0.001);
		float s = smoothstep(${CLUMP.in.toFixed(1)}, ${(CLUMP.in + 10).toFixed(1)}, dd) * smoothstep(${CLUMP.out.toFixed(1)}, ${(CLUMP.out - 18).toFixed(1)}, dd);
		float w = sin(uTime * 1.7 + ip.x * 0.3 + ip.z * 0.2) * 0.06 * position.y;
		transformed = vec3(f.y * position.x + w, position.y, -f.x * position.x) * s;
		vTint = instanceColor;
	}`)
      .replace('#include <color_vertex>', '#include <color_vertex>\n\tvColor = vec3(1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <map_fragment>', `#include <map_fragment>
	{
		vec3 c = diffuseColor.rgb;
		float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
		diffuseColor.rgb = mix(c * vTint * 1.6, c, smoothstep(0.08, 0.2, sat));
	}`)
      .replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n\tnormal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );');
  };
  m.customProgramCacheKey = () => 'wobClump' + base;
  return m;
}

// ---- scatter rules -------------------------------------------------------------
// Per-biome tweaks: grass size, flower chance (none on snow / desert / city
// streets anyway: they only grow where the ground colour is green).
const BIOME = { jungle: { grass: 1.7, dense: 0.25, flower: 0.5 }, tropical: { grass: 1.1, flower: 0.6 }, city: { flower: 0.6, pebble: 0 }, snow: { pebble: 0.4, flower: 0 }, desert: { flower: 0 } };

export class Detail {
  constructor(game, mask) {
    this.game = game;
    this.masks = new Map([[HOME_REGION.id, mask]]); // region id -> coverage mask (others made on first visit)
    this.tiles = new Map();
    this.views = new Map();
    this.timeU = { value: 0 };
    this.geos = { grass: tuftGeometry(), flower: flowerGeometry(), pebble: pebbleGeometry() };
    this.mats = {
      grass: detailMaterial(KINDS.grass.radius, 0.18, this.timeU),
      flower: detailMaterial(KINDS.flower.radius, 0.12, this.timeU),
      pebble: detailMaterial(KINDS.pebble.radius, 0, this.timeU),
    };
    this.ctiles = new Map();
    this.cgeo = clumpGeometry();
    const atlas = clumpAtlas();
    this.cmats = { grass: clumpMaterial(atlas, 0, this.timeU), flower: clumpMaterial(atlas, 2, this.timeU) };
    this.frame = 0;
    game.updaters.push((dt) => { this.timeU.value += dt; this.frame++; });
  }

  maskFor(r) {
    let m = this.masks.get(r.id);
    if (!m) { m = coverageMask(this.game, r.bounds); this.masks.set(r.id, m); }
    return m;
  }

  covered(x, z, mask) {
    const { data, N, ext, cx, cz } = mask;
    const i = Math.floor((x - cx + ext) / (2 * ext) * N), j = Math.floor((z - cz + ext) / (2 * ext) * N);
    if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) return true;
    // dilated by one texel so tufts don't poke out from under the edges of things
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (data[(j + dj) * N + i + di]) return true;
    return false;
  }

  tile(ti, tj) {
    const key = ti * 4096 + tj;
    let t = this.tiles.get(key);
    if (t) { t.used = this.frame; return t; }
    const out = { grass: [], flower: [], pebble: [] };
    const r = rng(hash2(ti, tj, 1));
    const x0 = ti * TILE, z0 = tj * TILE;
    const c = new THREE.Color();
    const reg = regionAt(x0 + TILE / 2, z0 + TILE / 2), rb = reg?.bounds;
    if (reg && x0 > rb[0] + 6 && x0 + TILE < rb[1] - 6 && z0 > rb[2] + 6 && z0 + TILE < rb[3] - 6) {
      const mask = this.maskFor(reg), bio = BIOME[reg.biome] || {};
      const patch = fbm((x0 + 8) / 40 + 3, (z0 + 8) / 40 - 5);
      const tries = 260;
      for (let k = 0; k < tries; k++) {
        const x = x0 + r() * TILE, z = z0 + r() * TILE;
        const h = meshHeight(x, z);
        if (h < -0.3) continue; // under the sea or lake
        const sand = isSand(x, z, h);
        const d = fbm(x / 11 + 7, z / 11 + 3);
        if (this.covered(x, z, mask)) continue;
        if (onRoad(x, z, 0.6)) continue;
        meshColor(x, z, c);
        const greenness = c.g - Math.max(c.r, c.b);
        const roll = r();
        if (sand) {
          if (roll < 0.03 * (bio.pebble ?? 1)) out.pebble.push(x, h, z, 0.5 + r(), r() * 6.28, 0.72, 0.66, 0.58);
          continue;
        }
        if (greenness < 0.12) { // rock / snow / dirt
          if (roll < 0.06 * (bio.pebble ?? 1) && h < 41) out.pebble.push(x, h, z, 0.6 + r() * 1.2, r() * 6.28, 0.5, 0.49, 0.46);
          continue;
        }
        if (roll < 0.012 * (bio.pebble ?? 1)) { out.pebble.push(x, h, z, 0.5 + r() * 1.3, r() * 6.28, 0.55, 0.54, 0.5); continue; }
        // flowers in patches
        if (roll < (0.035 + 0.12 * Math.max(0, patch - 0.5) * 4) * (bio.flower ?? 1) && d > 0.45) {
          const pal = [[1, 1, 1], [1, 0.85, 0.2], [1, 0.45, 0.6], [0.75, 0.5, 1], [1, 0.35, 0.3], [0.5, 0.7, 1]];
          const p = pal[(hash2(Math.floor(x / 5), Math.floor(z / 5), 3) * pal.length) | 0];
          const cc = r() < 0.25 ? pal[(r() * pal.length) | 0] : p;
          out.flower.push(x, h, z, 0.8 + r() * 0.5, r() * 6.28, cc[0], cc[1], cc[2]);
          continue;
        }
        // grass: denser in lush patches, sparse elsewhere
        if (roll > 0.12 + 0.8 * d + (bio.dense || 0)) continue;
        const v = 0.9 + r() * 0.25;
        out.grass.push(x, h - 0.02, z, (0.6 + r() * 0.4 + d * 0.25) * (bio.grass || 1), r() * 6.28, c.r * v * 1.05, c.g * v, c.b * v * 0.9);
      }
    }
    t = { used: this.frame };
    for (const k in out) t[k] = new Float32Array(out[k]);
    this.tiles.set(key, t);
    if (this.tiles.size > 1500) { // forget tiles no camera has wanted for a while
      for (const [kk, tt] of this.tiles) if (this.frame - tt.used > 600) this.tiles.delete(kk);
    }
    return t;
  }

  // A few billboard clumps per tile: the same ground rules as the tufts, much sparser.
  clumpTile(ti, tj) {
    const key = ti * 4096 + tj;
    let t = this.ctiles.get(key);
    if (t) { t.used = this.frame; return t; }
    const out = { grass: [], flower: [] };
    const r = rng(hash2(ti, tj, 9));
    const x0 = ti * TILE, z0 = tj * TILE, c = new THREE.Color();
    const reg = regionAt(x0 + TILE / 2, z0 + TILE / 2), rb = reg?.bounds;
    if (reg && x0 > rb[0] + 6 && x0 + TILE < rb[1] - 6 && z0 > rb[2] + 6 && z0 + TILE < rb[3] - 6) {
      const mask = this.maskFor(reg), bio = BIOME[reg.biome] || {};
      const patch = fbm((x0 + 8) / 40 + 3, (z0 + 8) / 40 - 5);
      for (let k = 0; k < CLUMP.step; k++) {
        const x = x0 + r() * TILE, z = z0 + r() * TILE, roll = r(), sz = r();
        const h = meshHeight(x, z);
        if (h < -0.3 || isSand(x, z, h) || this.covered(x, z, mask) || onRoad(x, z, 1)) continue;
        meshColor(x, z, c);
        if (c.g - Math.max(c.r, c.b) < 0.12) continue;
        const d = fbm(x / 11 + 7, z / 11 + 3);
        const flower = roll < (0.06 + 0.5 * Math.max(0, patch - 0.5)) * (bio.flower ?? 1) && d > 0.45;
        if (!flower && roll > 0.35 + 0.8 * d) continue;
        const s = (flower ? 0.7 : 0.8 + d * 0.5) * (0.8 + sz * 0.5) * (flower ? 1 : bio.grass || 1);
        (flower ? out.flower : out.grass).push(x, h - 0.05, z, s, c.r, c.g, c.b);
      }
    }
    t = { used: this.frame, grass: new Float32Array(out.grass), flower: new Float32Array(out.flower) };
    this.ctiles.set(key, t);
    if (this.ctiles.size > 3000) for (const [kk, tt] of this.ctiles) if (this.frame - tt.used > 600) this.ctiles.delete(kk);
    return t;
  }

  viewSet(cam) {
    let v = this.views.get(cam);
    if (!v) {
      v = { meshes: {}, cx: 1e9, cz: 1e9, seen: 0 };
      for (const k in KINDS) {
        const m = new THREE.InstancedMesh(this.geos[k], this.mats[k], KINDS[k].cap);
        m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(KINDS[k].cap * 3), 3);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        m.visible = false;
        m.userData.noCull = true;
        this.game.scene.add(m);
        v.meshes[k] = m;
      }
      v.clumps = {};
      for (const k in this.cmats) {
        const m = new THREE.InstancedMesh(this.cgeo, this.cmats[k], CLUMP.cap);
        m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CLUMP.cap * 3), 3);
        m.visible = false; m.userData.noCull = true;
        this.game.scene.add(m);
        v.clumps[k] = m;
      }
      v.ccx = v.ccz = 1e9;
      this.views.set(cam, v);
    }
    return v;
  }

  rebuild(v, px, pz) {
    v.cx = px; v.cz = pz;
    const R = KINDS.grass.radius + TILE;
    const i0 = Math.floor((px - R) / TILE), i1 = Math.floor((px + R) / TILE);
    const j0 = Math.floor((pz - R) / TILE), j1 = Math.floor((pz + R) / TILE);
    const counts = { grass: 0, flower: 0, pebble: 0 };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const tx = (i + 0.5) * TILE - px, tz = (j + 0.5) * TILE - pz;
      const td = Math.hypot(tx, tz) - TILE * 0.71;
      if (td > R - TILE) continue;
      const t = this.tile(i, j);
      for (const k in KINDS) {
        const rad = KINDS[k].radius;
        if (td > rad) continue;
        const src = t[k], m = v.meshes[k], cap = KINDS[k].cap;
        const mat = m.instanceMatrix.array, col = m.instanceColor.array;
        for (let q = 0; q < src.length && counts[k] < cap; q += 8) {
          const x = src[q], z = src[q + 2];
          if ((x - px) ** 2 + (z - pz) ** 2 > rad * rad) continue;
          const s = src[q + 3], a = src[q + 4], cs = Math.cos(a) * s, sn = Math.sin(a) * s;
          const o = counts[k] * 16;
          mat[o] = cs; mat[o + 1] = 0; mat[o + 2] = -sn; mat[o + 3] = 0;
          mat[o + 4] = 0; mat[o + 5] = s; mat[o + 6] = 0; mat[o + 7] = 0;
          mat[o + 8] = sn; mat[o + 9] = 0; mat[o + 10] = cs; mat[o + 11] = 0;
          mat[o + 12] = x; mat[o + 13] = src[q + 1]; mat[o + 14] = z; mat[o + 15] = 1;
          const oc = counts[k] * 3;
          col[oc] = src[q + 5]; col[oc + 1] = src[q + 6]; col[oc + 2] = src[q + 7];
          counts[k]++;
        }
      }
    }
    for (const k in KINDS) {
      const m = v.meshes[k];
      m.count = counts[k];
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, counts[k] * 16); m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, counts[k] * 3); m.instanceColor.needsUpdate = true;
    }
  }

  rebuildClumps(v, px, pz) {
    v.ccx = px; v.ccz = pz;
    const R = CLUMP.out, n = { grass: 0, flower: 0 };
    const i0 = Math.floor((px - R) / TILE), i1 = Math.floor((px + R) / TILE);
    const j0 = Math.floor((pz - R) / TILE), j1 = Math.floor((pz + R) / TILE);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const td = Math.hypot((i + 0.5) * TILE - px, (j + 0.5) * TILE - pz);
      if (td > R + TILE * 0.71 || td < CLUMP.in - TILE * 0.71) continue;
      const t = this.clumpTile(i, j);
      for (const k in n) {
        const src = t[k], m = v.clumps[k], mat = m.instanceMatrix.array, col = m.instanceColor.array;
        for (let q = 0; q < src.length && n[k] < CLUMP.cap; q += 7) {
          const dd = (src[q] - px) ** 2 + (src[q + 2] - pz) ** 2;
          if (dd > R * R || dd < (CLUMP.in - 2) ** 2) continue;
          const s = src[q + 3], o = n[k] * 16;
          mat.fill(0, o, o + 16);
          mat[o] = s * 1.3; mat[o + 5] = s; mat[o + 10] = s * 1.3; mat[o + 15] = 1;
          mat[o + 12] = src[q]; mat[o + 13] = src[q + 1]; mat[o + 14] = src[q + 2];
          col.set(src.subarray(q + 4, q + 7), n[k] * 3);
          n[k]++;
        }
      }
    }
    for (const k in n) {
      const m = v.clumps[k];
      m.count = n[k];
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n[k] * 16); m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, n[k] * 3); m.instanceColor.needsUpdate = true;
    }
  }

  // Called before each view renders: show only this camera's instances.
  view(cam) {
    for (const [c, v] of this.views) {
      if (c !== cam) { for (const k in v.meshes) v.meshes[k].visible = false; for (const k in v.clumps) v.clumps[k].visible = false; if (this.frame - v.seen > 300) this.drop(c, v); }
    }
    if (this.game.detailLevel === 0) return;
    const v = this.viewSet(cam);
    v.seen = this.frame;
    const p = cam.position;
    if ((p.x - v.cx) ** 2 + (p.z - v.cz) ** 2 > 36) this.rebuild(v, p.x, p.z);
    if ((p.x - v.ccx) ** 2 + (p.z - v.ccz) ** 2 > 100) this.rebuildClumps(v, p.x, p.z);
    const above = p.y - meshHeight(p.x, p.z);
    for (const k in v.meshes) v.meshes[k].visible = v.meshes[k].count > 0 && above < 60;
    for (const k in v.clumps) v.clumps[k].visible = v.clumps[k].count > 0 && above < 90;
  }

  drop(c, v) {
    for (const m of [...Object.values(v.meshes), ...Object.values(v.clumps)]) { this.game.scene.remove(m); m.dispose(); }
    this.views.delete(c);
  }
}

// Top-down coverage mask of everything static that isn't terrain (roads,
// plazas, buildings, decks...), so detail only grows on open ground.
function coverageMask(game, bounds) {
  const N = 1024, ext = Math.max(bounds[1] - bounds[0], bounds[3] - bounds[2]) / 2;
  const cx = (bounds[0] + bounds[1]) / 2, cz = (bounds[2] + bounds[3]) / 2;
  const r = game.renderer, scene = game.scene;
  const rt = new THREE.WebGLRenderTarget(N, N);
  const cam = new THREE.OrthographicCamera(-ext, ext, ext, -ext, 1, 600);
  cam.position.set(cx, 300, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz);
  // camera "up" is -z, so image row 0 (bottom) is +z: flip below
  const shown = [];
  const far = (game.staticChunks || []).filter((c) => !c.mesh.visible); // hidden by game.farCull (or showing their far version)
  for (const c of far) { c.mesh.visible = true; if (c.far) c.far.visible = false; }
  scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const isStatic = o.isMesh && o.material && o.material.vertexColors && o.position.lengthSq() === 0 && !o.userData.terrain && o.parent === scene;
    if (o.visible && !isStatic) { shown.push(o); o.visible = false; }
  });
  const bg = scene.background, fog = scene.fog, om = scene.overrideMaterial;
  scene.background = new THREE.Color(0); scene.fog = null;
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const shadowWas = r.shadowMap.enabled; r.shadowMap.enabled = false;
  r.setRenderTarget(rt);
  r.setClearColor(0x000000, 1); r.clear();
  r.render(scene, cam);
  const px = new Uint8Array(N * N * 4);
  r.readRenderTargetPixels(rt, 0, 0, N, N, px);
  r.setRenderTarget(null);
  r.shadowMap.enabled = shadowWas;
  scene.background = bg; scene.fog = fog; scene.overrideMaterial = om;
  for (const o of shown) o.visible = true;
  for (const c of far) c.mesh.visible = false;
  rt.dispose();
  const data = new Uint8Array(N * N);
  // pixel (i, row) -> world x = -ext + i/N*2ext ; rows run bottom-up in GL, top of image = -z
  for (let row = 0; row < N; row++) for (let i = 0; i < N; i++) {
    data[(N - 1 - row) * N + i] = px[(row * N + i) * 4] > 127 ? 1 : 0; // row 0 = bottom of the image = +z edge
  }
  return { data, N, ext, cx, cz };
}

// Road edges: white edge lines and a gravel shoulder outside town, kerbs in town.
function roadEdges(game) {
  const b = new Builder();
  const shoulder = 0xb9a888, edge = 0xf2f2ea, kerb = 0xd9d6cf;
  const box = (x, y, z, w, h, d, c) => b.box(w, h, d, c, [x, y, z]);
  for (const [x0, z0, x1, z1, w] of ROADS) {
    const horiz = z0 === z1, len = Math.hypot(x1 - x0, z1 - z0);
    const seg = 4;
    for (let d = 0; d < len; d += seg) {
      const t = (d + seg / 2) / len;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      if (Math.abs(px) < 21 && Math.abs(pz) < 21) continue; // plaza
      const town = Math.abs(px) <= 66 && Math.abs(pz) <= 66;
      for (const s of [-1, 1]) {
        const ox = horiz ? 0 : s, oz = horiz ? s : 0;
        // skip where another road crosses this edge
        if (onRoad(px + ox * (w / 2 + 1.2), pz + oz * (w / 2 + 1.2))) continue;
        const ex = px + ox * (w / 2 - 0.45), ez = pz + oz * (w / 2 - 0.45);
        if (town) {
          const kx = px + ox * (w / 2 + 0.1), kz = pz + oz * (w / 2 + 0.1);
          box(kx, 0.07, kz, horiz ? seg : 0.22, 0.1, horiz ? 0.22 : seg, kerb);
        } else {
          box(ex, 0.073, ez, horiz ? seg * 0.999 : 0.16, 0.012, horiz ? 0.16 : seg * 0.999, edge);
          const sx = px + ox * (w / 2 + 0.5), sz = pz + oz * (w / 2 + 0.5);
          const gh = Math.max(meshHeight(sx, sz), 0);
          box(sx, gh + 0.02, sz, horiz ? seg : 1.0, 0.05, horiz ? 1.0 : seg, shoulder);
        }
      }
    }
  }
  const m = b.mesh(matVC, { shadow: false, receive: true });
  game.scene.add(m);
}

// Street lamps at night: a soft halo round each globe and a pool of light below.
const glowVert = `
uniform float uMode;
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  if (uMode < 0.5) { c.xy += position.xy * 3.2; gl_Position = projectionMatrix * c; }
  else { gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position.x * 7.0, 0.0, -position.y * 7.0, 1.0); }
}`;
const glowFrag = `
uniform float uNight; uniform float uMode; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float a = uMode < 0.5 ? pow(max(0.0, 1.0 - r), 2.6) * 0.75 : pow(max(0.0, 1.0 - r), 1.3) * 0.85;
  gl_FragColor = vec4(uColor * a * uNight, 1.0);
}`;
function lampGlows(game) {
  const lamps = game.lamps || [];
  if (!lamps.length) return null;
  const night = { value: 0 };
  const mk = (mode) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uNight: night, uMode: { value: mode }, uColor: { value: new THREE.Color(mode ? 0xffc46a : 0xffe2a0) } },
      vertexShader: glowVert, fragmentShader: glowFrag, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, lamps.length);
    const mm = new THREE.Matrix4();
    lamps.forEach(([x, y, z], i) => {
      const gy = mode ? Math.max(meshHeight(x, z), 0, y - 4.35) + 0.1 : y; // pool on the ground (or the deck the lamp stands on)
      m.setMatrixAt(i, mm.makeTranslation(x, gy, z));
    });
    m.computeBoundingSphere();
    m.frustumCulled = false;
    m.renderOrder = 2;
    m.userData.noCull = true;
    game.scene.add(m);
    return m;
  };
  const halo = mk(0), pool = mk(1);
  game.updaters.push(() => {
    night.value = game.nightLight || 0;
    halo.visible = pool.visible = night.value > 0.02;
  });
  return { halo, pool };
}

export function buildDetail(game) {
  roadEdges(game);
  lampGlows(game);
  game.detail = new Detail(game, coverageMask(game, HOME_REGION.bounds));
}
