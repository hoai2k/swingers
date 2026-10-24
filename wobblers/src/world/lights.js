// Interior lights. Rooms register light spots; a small fixed pool of real
// point lights is moved, per split-screen view, onto the spots nearest that
// view's camera. The light count never changes, so no shader recompiles and
// the cost is the same with 1 or 8 players. Each spot also gets a ceiling
// fixture (a shade plus a bulb that always reads as lit).
import * as THREE from 'three';
import { Builder } from '../mesh.js';

const POOL = 6;
const REACH = 45; // spots further than this from the camera stay dark

export class InteriorLights {
  constructor(game) {
    this.game = game;
    this.spots = [];
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(0xffe2b0, 0, 10, 1.6);
      l.castShadow = false;
      game.scene.add(l);
      this.pool.push(l);
    }
    this.bulbs = new Builder();
    this._d = new Float32Array(0);
  }

  // A light hanging under a ceiling at (x, y, z). `fixture`: 'pendant' (shade
  // + bulb), 'panel' (flat ceiling panel), 'neon' (coloured tube, no shade) or
  // false (light only).
  add(x, y, z, { color = 0xffe2b0, intensity = 9, range = 10, fixture = 'pendant', yaw = 0 } = {}) {
    this.spots.push({ x, y: y - 0.45, z, color: new THREE.Color(color), intensity, range });
    const kit = this.game.kit, c = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex();
    if (fixture === 'pendant') {
      kit.cyl(x, y - 0.3, z, 0.02, 0.6, 0x555555, { collide: false, seg: 4 });
      kit.cone(x, y - 0.62, z, 0.32, 0.22, 0x3a4a5a, { seg: 12 });
      this.bulbs.sphere(0.13, c, [x, y - 0.74, z], null, 10);
    } else if (fixture === 'panel') {
      this.bulbs.box(1.4, 0.04, 0.7, c, [x, y - 0.03, z], [0, yaw, 0]);
    } else if (fixture === 'neon') {
      this.bulbs.cyl(0.05, 0.05, 2.2, new THREE.Color(color).getHex(), [x, y - 0.1, z], [0, yaw, Math.PI / 2], 6);
    }
  }

  finish() {
    const g = this.bulbs.geometry();
    if (g) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
      m.userData.noCull = true;
      this.game.scene.add(m);
    }
    this.bulbs = null;
  }

  // Called before each view renders.
  view(cam) {
    const p = cam.position, n = this.spots.length;
    if (this._d.length < n) this._d = new Float32Array(n);
    const d = this._d, best = [];
    for (let i = 0; i < n; i++) {
      const s = this.spots[i];
      d[i] = (s.x - p.x) ** 2 + (s.y - p.y) ** 2 + (s.z - p.z) ** 2;
      if (d[i] > REACH * REACH) continue;
      // keep the POOL closest
      if (best.length < POOL) { best.push(i); best.sort((a, b) => d[a] - d[b]); }
      else if (d[i] < d[best[POOL - 1]]) { best[POOL - 1] = i; best.sort((a, b) => d[a] - d[b]); }
    }
    // a touch brighter at night, when they matter most
    const k = 1 + 0.35 * (this.game.nightLight || 0);
    for (let j = 0; j < POOL; j++) {
      const l = this.pool[j], i = best[j];
      if (i === undefined) { l.intensity = 0; continue; }
      const s = this.spots[i];
      // fade out toward the edge of reach so lights don't pop
      const fade = 1 - Math.max(0, (Math.sqrt(d[i]) - REACH * 0.7) / (REACH * 0.3));
      l.position.set(s.x, s.y, s.z);
      l.color.copy(s.color);
      l.distance = s.range;
      l.intensity = s.intensity * k * fade;
    }
  }
}
