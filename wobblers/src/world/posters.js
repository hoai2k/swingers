// Framed posters and paintings on interior walls. Each has a simple
// procedural stand-in and swaps to painted art (assets/posters/<name>.png)
// when it has been delivered.
import * as THREE from 'three';
import { paintOver } from '../assets.js';

function standIn(w, h, o) {
  const W = 256, H = Math.round(256 * h / w), cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = o.bg; g.fillRect(0, 0, W, H);
  if (o.sun) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(W * 0.72, H * 0.3, W * 0.14, 0, 7); g.fill(); }
  if (o.hills) {
    g.fillStyle = '#5cc04a'; g.beginPath(); g.ellipse(W * 0.3, H, W * 0.6, H * 0.35, 0, 0, 7); g.fill();
    g.fillStyle = '#7fd65a'; g.beginPath(); g.ellipse(W * 0.85, H, W * 0.5, H * 0.25, 0, 0, 7); g.fill();
  }
  if (o.blob) { // a wobbly little figure
    g.fillStyle = o.blob; g.beginPath(); g.ellipse(W / 2, H * 0.62, W * 0.16, H * 0.17, 0, 0, 7); g.fill();
    g.fillStyle = '#ffd9b8'; g.beginPath(); g.arc(W / 2, H * 0.38, W * 0.13, 0, 7); g.fill();
    g.fillStyle = '#1c1c28'; for (const s of [-1, 1]) { g.beginPath(); g.arc(W / 2 + s * W * 0.045, H * 0.37, W * 0.018, 0, 7); g.fill(); }
  }
  if (o.title) {
    g.fillStyle = o.fg || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(W * 0.14)}px Trebuchet MS, sans-serif`;
    g.fillText(o.title, W / 2, H * (o.blob || o.hills ? 0.12 : 0.45));
    if (o.sub) { g.font = `700 ${Math.round(W * 0.075)}px Trebuchet MS, sans-serif`; g.fillText(o.sub, W / 2, H * (o.blob || o.hills ? 0.9 : 0.62)); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// L: a world/common.js Local; (lx, y, lz) is the picture centre just off a
// wall, `ly` its local yaw (0 faces local +z).
export function poster(game, L, name, lx, y, lz, ly, w, h, o = {}) {
  const tex = standIn(w, h, o);
  paintOver(tex, `posters/${name}.png`, (g, im, cv) => g.drawImage(im, 0, 0, cv.width, cv.height));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  const p = L.v3(lx, y, lz);
  m.position.set(p.x, p.y, p.z);
  m.rotation.y = L.yaw + ly;
  m.name = 'poster_' + name;
  m.userData.noCull = true;
  game.scene.add(m);
  (game.posters ||= []).push(m);
  // frame just behind the picture
  const fx = -Math.sin(ly) * 0.02, fz = -Math.cos(ly) * 0.02;
  L.deco(lx + fx, y, lz + fz, w + 0.12, h + 0.12, 0.03, o.frame ?? 0x6b4a2a, { yaw: ly });
  return m;
}
