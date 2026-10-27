// Graffiti on Bigtown's walls you can't go into (the solid shops' blank sides and backs, low on
// the mid-rises): spray tags painted once into a canvas atlas, every tag in the city merged
// into one mesh (one draw call), hidden when the camera is far from the city.
// buildings.js calls tag(L, lx, y, lz, lny, w) while it builds; city.js calls finishGraffiti.
import * as THREE from 'three';

const COLS = 4, ROWS = 2;
const quads = [];
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const graffitiRnd = rnd; // seeded, so the tags land in the same places every load

// Maybe put a tag (width w) on a building-local wall at (lx, y, lz) facing local yaw lny.
export function tag(L, lx, y, lz, lny, w, chance = 0.45) {
  if (rnd() > chance) return;
  const p = L.v3(lx, y, lz), yaw = L.yaw + lny, cell = (rnd() * COLS * ROWS) | 0, s = w * (0.75 + rnd() * 0.35);
  quads.push({ x: p.x + Math.sin(yaw) * 0.04, y: p.y, z: p.z + Math.cos(yaw) * 0.04, yaw, w: s, h: s * 0.5, cell, tilt: (rnd() - 0.5) * 0.12 });
}

function atlas() {
  const CW = 512, CH = 256, cv = document.createElement('canvas');
  cv.width = CW * COLS; cv.height = CH * ROWS;
  const g = cv.getContext('2d');
  const words = ['WOB!', 'ZOOM', 'BIG T', 'YO!', 'SKATE', 'POP', 'OK!', 'BOING'];
  const fills = [['#ff4d8d', '#ffd23f'], ['#3fd0ff', '#b46cff'], ['#7cff5a', '#2fae5a'], ['#ffb03a', '#ff4d4d'], ['#ffffff', '#3f8cff'], ['#ff7ad9', '#7a4dff'], ['#ffe44d', '#ff7a1a'], ['#5affd6', '#1a8cff']];
  for (let i = 0; i < COLS * ROWS; i++) {
    const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH;
    g.save(); g.translate(ox + CW / 2, oy + CH / 2); g.rotate((i % 3 - 1) * 0.06);
    const [a, b] = fills[i];
    if (i === 3) { // a smiley face tag
      g.lineWidth = 16; g.strokeStyle = '#1a1a22'; g.fillStyle = a;
      g.beginPath(); g.arc(-120, 0, 80, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#1a1a22'; g.beginPath(); g.arc(-150, -20, 10, 0, 7); g.arc(-92, -20, 10, 0, 7); g.fill();
      g.beginPath(); g.arc(-120, 8, 42, 0.2, Math.PI - 0.2); g.stroke();
    }
    if (i === 6) { // a big heart
      g.fillStyle = a; g.strokeStyle = '#1a1a22'; g.lineWidth = 14;
      g.beginPath(); g.moveTo(130, 60); g.bezierCurveTo(30, -10, 70, -90, 130, -40); g.bezierCurveTo(190, -90, 230, -10, 130, 60); g.fill(); g.stroke();
    }
    // bubble letters: thick dark outline, gradient fill, white shine
    // the word fills the tile (less where a smiley / heart sits beside it)
    const room = i === 3 || i === 6 ? 270 : 450;
    g.font = '900 200px "Arial Black", Arial, sans-serif';
    const fs = Math.min(200, 200 * room / g.measureText(words[i]).width);
    g.font = `900 ${fs | 0}px "Arial Black", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tx = i === 3 ? 90 : i === 6 ? -100 : 0;
    g.lineJoin = 'round'; g.lineWidth = 30; g.strokeStyle = '#1a1a22'; g.strokeText(words[i], tx, 0);
    const gr = g.createLinearGradient(0, -60, 0, 60); gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillText(words[i], tx, 0);
    g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.strokeText(words[i], tx - 3, -4);
    // drips and sparkles
    g.fillStyle = b;
    for (let k = 0; k < 5; k++) { const dx = -170 + k * 85 + (k * 37 % 20); g.fillRect(dx, 40, 7, 30 + (k * 23 % 40)); g.beginPath(); g.arc(dx + 3.5, 72 + (k * 23 % 40), 6, 0, 7); g.fill(); }
    g.fillStyle = '#ffffff';
    for (const [sx, sy] of [[-200, -70], [200, -60], [180, 70]]) { g.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 4 : 14, an = k / 8 * Math.PI * 2; g.lineTo(sx + Math.cos(an) * r, sy + Math.sin(an) * r); } g.fill(); }
    g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export function finishGraffiti(game, centre, radius) {
  if (!quads.length) return;
  const n = quads.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), nrm = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
  quads.forEach((q, i) => {
    const c = Math.cos(q.yaw), s = Math.sin(q.yaw), ux = c, uz = -s; // along the wall
    const ct = Math.cos(q.tilt), st = Math.sin(q.tilt);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach(([a, b], k) => {
      const lx = a * q.w / 2, ly = b * q.h / 2, rx = lx * ct - ly * st, ry = lx * st + ly * ct;
      pos.set([q.x + ux * rx, q.y + ry, q.z + uz * rx], (i * 4 + k) * 3);
      nrm.set([s, 0, c], (i * 4 + k) * 3);
      const u0 = (q.cell % COLS) / COLS, v0 = 1 - (Math.floor(q.cell / COLS) + 1) / ROWS;
      uv.set([u0 + (a > 0 ? 1 : 0) / COLS, v0 + (b > 0 ? 1 : 0) / ROWS], (i * 4 + k) * 2);
    });
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: atlas(), transparent: true, alphaTest: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'graffiti';
  mesh.receiveShadow = true; mesh.userData.noCull = true;
  game.scene.add(mesh);
  game.viewHooks.push((cam) => { mesh.visible = Math.hypot(cam.position.x - centre[0], cam.position.z - centre[1]) < radius; });
  game.cityGraffiti = n;
  quads.length = 0;
}
