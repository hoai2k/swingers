// Particles and one-shot effects, driven by battle events.
import { THREE, rand, clamp } from './util.js';

const MAX = 4000;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

export class FX {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.glow = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }), 800);
    this.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glow.frustumCulled = false;
    this.glow.count = 0;
    scene.add(this.glow);
    this.ps = [];
    this.gs = [];
    // ground splats
    const sg = new THREE.CircleGeometry(1, 8);
    sg.rotateX(-Math.PI / 2);
    this.splats = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: '#8f1010', polygonOffset: true, polygonOffsetFactor: -1 }), 600);
    this.splats.count = 0;
    this.splats.receiveShadow = true;
    this.splatI = 0;
    scene.add(this.splats);
    // rings (heal, shockwave)
    this.rings = [];
    this.ringGeo = new THREE.TorusGeometry(1, 0.06, 4, 32);
    this.ringGeo.rotateX(Math.PI / 2);
    // flash light
    this.light = new THREE.PointLight('#ffb050', 0, 30, 1.5);
    scene.add(this.light);
    this.lightT = 0;
    this.blood = true;
  }

  clear() {
    this.ps.length = 0; this.gs.length = 0;
    this.splats.count = 0; this.splatI = 0;
    for (const r of this.rings) this.scene.remove(r.m);
    this.rings.length = 0;
  }

  add(list, x, y, z, vx, vy, vz, size, life, color, g = 9.81, drag = 0.5, ground = true) {
    if (list.length > (list === this.gs ? 790 : MAX - 10)) list.shift();
    list.push({ x, y, z, vx, vy, vz, size, life, max: life, color: new THREE.Color(color), g, drag, ground });
  }

  event(e) {
    const [k, x, y, z, a, b, c] = e;
    switch (k) {
      case 'blood': {
        if (!this.blood) { for (let i = 0; i < a / 2; i++) this.add(this.ps, x, y, z, rand(-2, 2), rand(0, 3), rand(-2, 2), rand(0.04, 0.07), rand(0.3, 0.6), '#f0f0f0'); break; }
        for (let i = 0; i < a; i++) {
          this.add(this.ps, x, y, z, b * rand(1, 4) + rand(-1.5, 1.5), rand(0.5, 4), c * rand(1, 4) + rand(-1.5, 1.5), rand(0.03, 0.08), rand(0.5, 1.2), i % 3 ? '#c41414' : '#8a0b0b');
        }
        if (Math.random() < 0.7) this.splat(x + b * rand(0.3, 1.2), z + c * rand(0.3, 1.2), rand(0.15, 0.4));
        break;
      }
      case 'spark':
        for (let i = 0; i < a; i++) this.add(this.gs, x, y, z, rand(-4, 4), rand(0, 5), rand(-4, 4), rand(0.02, 0.05), rand(0.15, 0.35), '#ffe9a0', 9.81, 1);
        break;
      case 'dust':
        for (let i = 0; i < a * 3; i++) this.add(this.ps, x + rand(-0.2, 0.2), y + 0.05, z + rand(-0.2, 0.2), rand(-1, 1), rand(0.3, 1.5), rand(-1, 1), rand(0.06, 0.14), rand(0.4, 0.8), '#b9a68a', 1, 2);
        break;
      case 'explode': {
        const r = a, kind = b; // 0 bomb, 1 potion, 2 fire
        const cols = kind === 1 ? ['#9cff6a', '#5fd13a', '#e8ffd0'] : ['#ffdd55', '#ff9a2a', '#ff5a1a'];
        for (let i = 0; i < 40 * Math.min(2, r / 3); i++) {
          const d = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, 9) * r / 3);
          this.add(this.gs, x, y + 0.2, z, d.x, d.y, d.z, rand(0.15, 0.45) * r / 3, rand(0.25, 0.6), cols[i % 3], 0, 3);
        }
        for (let i = 0; i < 12; i++) {
          this.add(this.ps, x + rand(-0.5, 0.5) * r / 3, y + rand(0, 1), z + rand(-0.5, 0.5) * r / 3, rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5), rand(0.3, 0.6) * r / 3, rand(0.9, 1.6), kind === 1 ? '#a8d890' : i % 2 ? '#9a9a9a' : '#c8c8c8', -0.6, 1.5, false);
        }
        for (let i = 0; i < 14; i++) {
          this.add(this.ps, x, y + 0.2, z, rand(-6, 6), rand(3, 9), rand(-6, 6), rand(0.05, 0.12), rand(0.8, 1.6), '#5a4a3a', 9.81, 0.2);
        }
        this.ring(x, this.terrain.height(x, z) + 0.15, z, r * 1.3, 0.35, kind === 1 ? '#c8ffb0' : '#fff2c0');
        this.light.position.set(x, y + 1.5, z);
        this.light.color.set(kind === 1 ? '#7dff6a' : '#ffaa44');
        this.lightT = 0.25;
        if (kind !== 1) this.splat(x, z, r * 0.22, '#3e4424');
        break;
      }
      case 'heal':
        for (let i = 0; i < a; i++) this.add(this.gs, x + rand(-0.3, 0.3), y + rand(-0.3, 0.3), z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(1, 2.5), rand(-0.3, 0.3), rand(0.05, 0.09), rand(0.6, 1.0), '#8dff8a', -1, 1);
        break;
      case 'healring':
        this.ring(x, y, z, a, 0.7, '#9dff9a');
        break;
      case 'note':
        this.add(this.gs, x, y, z, rand(-0.6, 0.6), 1.2, rand(-0.6, 0.6), 0.08, 1.2, ['#ffe14a', '#ff7ad9', '#7ad7ff', '#ffffff'][a | 0], 0, 0.5);
        break;
      case 'death':
        for (let i = 0; i < 6; i++) this.add(this.ps, x, y, z, rand(-1, 1), rand(0.5, 2), rand(-1, 1), rand(0.05, 0.1), rand(0.4, 0.8), '#dddddd', 2, 2);
        break;
      case 'trail':
        this.add(this.gs, x, y, z, rand(-0.3, 0.3), rand(0, 0.6), rand(-0.3, 0.3), rand(0.12, 0.25), rand(0.2, 0.4), a ? '#ffcc44' : '#ff6a1a', 0, 2);
        break;
    }
  }

  splat(x, z, r, color) {
    const i = this.splatI++ % 600;
    const y = this.terrain.height(x, z) + 0.03;
    _q.setFromAxisAngle(_p.set(0, 1, 0), rand(0, 6.28));
    _m.compose(_s.set(x, y, z), _q, new THREE.Vector3(r * rand(0.8, 1.3), 1, r));
    this.splats.setMatrixAt(i, _m);
    this.splats.setColorAt(i, _c.set(color || (Math.random() < 0.5 ? '#9c1010' : '#7a0c0c')));
    this.splats.count = Math.min(600, Math.max(this.splats.count, i + 1));
    this.splats.instanceMatrix.needsUpdate = true;
    if (this.splats.instanceColor) this.splats.instanceColor.needsUpdate = true;
  }

  ring(x, y, z, r, life, color) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.rings.push({ m, r, life, max: life });
  }

  update(dt) {
    this.step(this.ps, this.mesh, dt);
    this.step(this.gs, this.glow, dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.m.scale.setScalar(Math.max(0.01, r.r * (0.2 + t * 0.9)));
      r.m.material.opacity = clamp(1 - t, 0, 1) * 0.8;
      if (r.life <= 0) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT / 0.25) * 400; }
    else this.light.intensity = 0;
  }

  step(list, mesh, dt) {
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.ground) {
        const gy = this.terrain.height(p.x, p.z);
        if (p.y < gy + p.size * 0.5) { p.y = gy + p.size * 0.5; p.vy *= -0.2; p.vx *= 0.6; p.vz *= 0.6; }
      }
    }
    for (let i = 0; i < list.length && n < mesh.instanceMatrix.count; i++) {
      const p = list[i];
      const f = Math.min(1, p.life / p.max * 3);
      const s = p.size * f;
      _m.makeScale(s, s, s);
      _m.setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(n, _m);
      mesh.setColorAt(n, p.color);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}
