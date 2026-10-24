// Water surfaces: a scrolling procedural normal map on a glossy material.
import * as THREE from 'three';

let normalTex = null;
function waveNormals() {
  if (normalTex) return normalTex;
  const N = 256, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N);
  const waves = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) waves.push([((rnd() * 9) | 0) - 4, ((rnd() * 9) | 0) - 4, rnd() * 6.28, 0.3 + rnd()]);
  const h = (x, y) => {
    let s = 0;
    for (const [a, b, p, amp] of waves) s += Math.sin(2 * Math.PI * (a * x + b * y) / N + p) * amp / (1 + Math.hypot(a, b) * 0.3);
    return s;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const nx = -dx * 0.6, ny = -dy * 0.6, nz = 1, l = Math.hypot(nx, ny, nz);
    const k = (y * N + x) * 4;
    img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  normalTex = new THREE.CanvasTexture(cv);
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  return normalTex;
}

export function waterMaterial(color, opacity, repeat) {
  const t = waveNormals().clone();
  t.needsUpdate = true;
  t.repeat.set(repeat, repeat);
  const m = new THREE.MeshPhongMaterial({ color, transparent: true, opacity, shininess: 120, specular: 0xeaf6ff, normalMap: t, normalScale: new THREE.Vector2(0.6, 0.6), depthWrite: false });
  m.userData.tex = t;
  return m;
}

export function animateWater(game, mats) {
  game.updaters.push((dt, time) => {
    for (const m of mats) {
      m.userData.tex.offset.set(time * 0.012, time * 0.008);
    }
  });
}

// A rectangular body of water (pool, fountain) with physics volume.
export function addWater(game, x0, x1, z0, z1, floorY, level, color = 0x4fd0ff, opacity = 0.7) {
  game.physics.addWaterBox(x0, x1, z0, z1, floorY, level);
  const mat = waterMaterial(color, opacity, Math.max(2, Math.round((x1 - x0) / 10)));
  game.waterMats.push(mat);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), mat);
  m.position.set((x0 + x1) / 2, level, (z0 + z1) / 2);
  m.renderOrder = 1;
  game.scene.add(m);
  return m;
}
