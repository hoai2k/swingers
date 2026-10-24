// Character cosmetics chosen in the customiser: shirt colour and hat (the
// Player's own setColor / buildHat), plus faces and trouser colours that live
// here. Faces are extra head textures swapped in while the player shows its
// normal face (the knocked-out face still comes from mesh.js).
import * as THREE from 'three';
import { headMaterials } from './player.js';
import { paintFace } from './assets.js';
import { HATS, PLAYER_COLORS } from './config.js';
import { devicePrefs, saveSettings } from './settings.js';

export const FACES = ['Happy', 'Joyful', 'Cool shades', 'Sleepy', 'Surprised', 'Cheeky', 'Lashes', 'Grumpy'];
export const PANTS = [
  { name: 'Matching', color: null },
  { name: 'Denim', color: 0x3b5c9a },
  { name: 'Black', color: 0x2a2a33 },
  { name: 'White', color: 0xf2f2f2 },
  { name: 'Khaki', color: 0xc8ad7a },
  { name: 'Red', color: 0xc8343c },
  { name: 'Green', color: 0x3c8a3c },
  { name: 'Purple', color: 0x6a3c9a },
  { name: 'Orange', color: 0xe07a2a },
];
export const HAT_NAMES = { none: 'No hat', cap: 'Cap', tophat: 'Top hat', beanie: 'Beanie', crown: 'Crown', party: 'Party hat', cowboy: 'Cowboy hat', bucket: 'Bucket hat' };
export const COLOR_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Teal', 'Pink', 'White', 'Charcoal'];

// Same layout as mesh.js faceCanvas: 512x256, the face centred at u = 0.25.
function drawFace(kind) {
  const W = 512, H = 256, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffd9b8'; g.fillRect(0, 0, W, H);
  const cx = W * 0.25, ex = [cx - 30, cx + 30], ey = H * 0.44;
  g.fillStyle = 'rgba(255,120,120,.35)';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * 52, H * 0.6, 20, 12, 0, 0, 7); g.fill(); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  const eye = (x, y, sx = 17, sy = 23) => {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, sx, sy, 0, 0, 7); g.fill();
    g.fillStyle = '#1c1c28'; g.beginPath(); g.ellipse(x + 2, y + 3, sx * 0.6, sy * 0.6, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 6, y - 4, 4, 0, 7); g.fill();
  };
  const smile = (r = 22, w = 6) => { g.strokeStyle = '#5a2a2a'; g.lineWidth = w; g.beginPath(); g.arc(cx, H * 0.6, r, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); };
  const brows = (tilt = 0) => {
    g.strokeStyle = '#6b4a3a'; g.lineWidth = 5;
    ex.forEach((x, i) => { const s = i ? 1 : -1; g.beginPath(); g.moveTo(x - 14, ey - 34 - tilt * s); g.lineTo(x + 12, ey - 37 + tilt * s); g.stroke(); });
  };
  switch (kind) {
    case 'Joyful': {
      g.strokeStyle = '#1c1c28'; g.lineWidth = 7;
      for (const x of ex) { g.beginPath(); g.arc(x, ey + 6, 15, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
      g.fillStyle = '#7a2a2a'; g.beginPath(); g.arc(cx, H * 0.6, 22, 0, Math.PI); g.closePath(); g.fill();
      g.fillStyle = '#ff7a8a'; g.beginPath(); g.ellipse(cx, H * 0.6 + 14, 11, 6, 0, 0, 7); g.fill();
      break;
    }
    case 'Cool shades': {
      g.fillStyle = '#16161e';
      for (const x of ex) { g.beginPath(); g.roundRect(x - 24, ey - 16, 48, 32, 10); g.fill(); }
      g.fillRect(cx - 8, ey - 10, 16, 6);
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (const x of ex) { g.beginPath(); g.ellipse(x - 9, ey - 5, 7, 4, -0.4, 0, 7); g.fill(); }
      g.strokeStyle = '#5a2a2a'; g.lineWidth = 6; g.beginPath(); g.arc(cx + 6, H * 0.58, 18, 0.15 * Math.PI, 0.6 * Math.PI); g.stroke();
      break;
    }
    case 'Sleepy': {
      g.strokeStyle = '#1c1c28'; g.lineWidth = 6;
      for (const x of ex) { g.beginPath(); g.arc(x, ey - 2, 15, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke(); }
      g.fillStyle = '#7a2a2a'; g.beginPath(); g.ellipse(cx, H * 0.64, 8, 6, 0, 0, 7); g.fill();
      brows(-3);
      break;
    }
    case 'Surprised': {
      eye(ex[0], ey - 2, 19, 26); eye(ex[1], ey - 2, 19, 26);
      g.fillStyle = '#7a2a2a'; g.beginPath(); g.ellipse(cx, H * 0.66, 12, 15, 0, 0, 7); g.fill();
      g.strokeStyle = '#6b4a3a'; g.lineWidth = 5;
      for (const x of ex) { g.beginPath(); g.arc(x, ey - 26, 16, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke(); }
      break;
    }
    case 'Cheeky': {
      eye(ex[0], ey);
      g.strokeStyle = '#1c1c28'; g.lineWidth = 7; g.beginPath(); g.moveTo(ex[1] - 14, ey + 2); g.lineTo(ex[1] + 14, ey - 2); g.stroke();
      smile(20, 6);
      g.fillStyle = '#ff7a8a'; g.beginPath(); g.ellipse(cx + 8, H * 0.6 + 20, 9, 11, 0, 0, 7); g.fill();
      break;
    }
    case 'Lashes': {
      eye(ex[0], ey); eye(ex[1], ey);
      g.strokeStyle = '#1c1c28'; g.lineWidth = 4;
      ex.forEach((x, i) => { const s = i ? 1 : -1; for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + s * (0.55 + k * 0.28); g.beginPath(); g.moveTo(x + Math.cos(a) * 17, ey + Math.sin(a) * 23); g.lineTo(x + Math.cos(a) * 27, ey + Math.sin(a) * 31); g.stroke(); } });
      g.fillStyle = '#d0405a'; g.beginPath(); g.ellipse(cx, H * 0.63, 13, 8, 0, 0, Math.PI); g.fill();
      g.beginPath(); g.ellipse(cx, H * 0.63, 13, 5, 0, Math.PI, 2 * Math.PI); g.fill();
      break;
    }
    case 'Grumpy': {
      eye(ex[0], ey + 4, 16, 18); eye(ex[1], ey + 4, 16, 18);
      g.strokeStyle = '#4a2e22'; g.lineWidth = 8;
      ex.forEach((x, i) => { const s = i ? -1 : 1; g.beginPath(); g.moveTo(x - 16, ey - 22 - s * 8); g.lineTo(x + 16, ey - 22 + s * 8); g.stroke(); });
      g.strokeStyle = '#5a2a2a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, H * 0.72, 18, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke();
      break;
    }
    default: {
      eye(ex[0], ey); eye(ex[1], ey); smile(); brows();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  paintFace(t, kind);
  return t;
}

const faceCache = new Map();
export function faceMaterial(i) {
  if (!i) return headMaterials().normal;
  let m = faceCache.get(i);
  if (!m) { m = new THREE.MeshPhongMaterial({ map: drawFace(FACES[i]), shininess: 24, specular: 0x2a2a2a }); faceCache.set(i, m); }
  return m;
}

// Keep the chosen face on the head unless the player is showing the KO face.
export function syncFace(p) {
  const hm = p.headMesh;
  if (!hm) return;
  const want = faceMaterial(p.face || 0), normal = headMaterials().normal;
  if (hm.material === normal && want !== normal) hm.material = want;
}

export function setFace(p, i) {
  p.face = (i + FACES.length) % FACES.length;
  const hm = p.headMesh;
  if (hm && hm.material !== headMaterials().ko) hm.material = faceMaterial(p.face);
}

export function setPants(p, i) {
  p.pantsIndex = (i + PANTS.length) % PANTS.length;
  p.pantsColor = PANTS[p.pantsIndex].color ?? undefined; // read by Player.partMesh
  p.setColor(p.colorIndex); // rebuilds the meshes
}

export function setHat(p, i) {
  p.hat = (i + HATS.length) % HATS.length;
  p.buildHat();
}

export function lookOf(p) {
  return { color: p.colorIndex, hat: p.hat, face: p.face || 0, pants: p.pantsIndex || 0 };
}

export function saveLook(p) {
  devicePrefs(p.deviceId).look = lookOf(p);
  saveSettings();
}

// Apply the look a device used last time (if any). Returns true if one existed.
export function restoreLook(p) {
  const L = devicePrefs(p.deviceId).look;
  if (!L || typeof L !== 'object') { p.face = 0; p.pantsIndex = 0; return false; }
  const n = (v, m) => (Number.isInteger(v) && v >= 0 && v < m ? v : 0);
  p.hat = n(L.hat, HATS.length); p.buildHat();
  p.pantsIndex = n(L.pants, PANTS.length);
  p.pantsColor = PANTS[p.pantsIndex].color ?? undefined;
  p.setColor(n(L.color, PLAYER_COLORS.length));
  setFace(p, n(L.face, FACES.length));
  return true;
}

export function randomLook(p) {
  const r = (m) => (Math.random() * m) | 0;
  p.hat = r(HATS.length); p.buildHat();
  p.pantsIndex = r(PANTS.length); p.pantsColor = PANTS[p.pantsIndex].color ?? undefined;
  p.setColor(r(PLAYER_COLORS.length));
  setFace(p, r(FACES.length));
}
