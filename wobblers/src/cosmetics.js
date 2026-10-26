// Character cosmetics chosen in the customiser: shirt colour and hat (the
// Player's own setColor / buildHat), plus faces and trouser colours that live
// here. Faces are extra head textures swapped in while the player shows its
// normal face (the knocked-out face still comes from mesh.js).
import * as THREE from 'three';
import { headMaterials } from './player.js';
import { charMat } from './charstyle.js';
import { paintFace } from './assets.js';
import { HATS, PLAYER_COLORS } from './config.js';
import { settings, devicePrefs, saveSettings } from './settings.js';
import { EXTRA_HAT_NAMES } from './hats.js';
import { isLocked } from './unlocks.js';
import { OUTFIT_LIST, outfitFn } from './outfits.js';
import { applyGadget, gadgetLocked } from './gadgets.js';

export const OUTFITS = OUTFIT_LIST.map((o) => o.name);

// Faces 8-11, trousers 9-12 and HATS past the first eight are unlocked by presents; the
// ones after those are sold in the clothes shop (both lists in src/unlocks.js).
export const FACES = ['Happy', 'Joyful', 'Cool shades', 'Sleepy', 'Surprised', 'Cheeky', 'Lashes', 'Grumpy', 'Star eyes', 'Winky', 'Robot', 'Moustache',
  'Heart eyes', 'Tongue out', 'Dizzy', 'Nerd'];
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
  { name: 'Gold', color: 0xf2c230 },
  { name: 'Pink', color: 0xff8ac8 },
  { name: 'Sky', color: 0x7ad0ff },
  { name: 'Plaid red', color: 0x9a2a3a },
  { name: 'Lime', color: 0x9be03a },
  { name: 'Navy', color: 0x22305a },
  { name: 'Teal', color: 0x2ab5a5 },
  { name: 'Lilac', color: 0xc9a6ff },
  { name: 'Cream', color: 0xf2e4c0 },
  // region presents (keep appending)
  { name: 'Sandstone', color: 0xd9a066 },
  { name: 'Cactus', color: 0x5a9a3c },
  // Bigtown presents (world/regions/city)
  { name: 'Taxi yellow', color: 0xffc81e },
  { name: 'Pinstripe grey', color: 0x5a5f6a },
  { name: 'Brick red', color: 0xa8452e },
  // Frostpeak present (world/regions/snow)
  { name: 'Glacier', color: 0x8fd8f0 },
];
export const HAT_NAMES = { none: 'No hat', cap: 'Cap', tophat: 'Top hat', beanie: 'Beanie', crown: 'Crown', party: 'Party hat', cowboy: 'Cowboy hat', bucket: 'Bucket hat', ...EXTRA_HAT_NAMES };
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
    case 'Star eyes': {
      const star = (x, y, r) => {
        g.beginPath();
        for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        g.closePath(); g.fill();
      };
      g.fillStyle = '#ffc21a'; for (const x of ex) star(x, ey, 25);
      g.fillStyle = '#fff6b0'; for (const x of ex) star(x - 3, ey - 3, 9);
      g.fillStyle = '#7a2a2a'; g.beginPath(); g.arc(cx, H * 0.6, 22, 0, Math.PI); g.closePath(); g.fill();
      break;
    }
    case 'Winky': {
      eye(ex[0], ey);
      g.strokeStyle = '#1c1c28'; g.lineWidth = 7; g.beginPath(); g.arc(ex[1], ey + 4, 15, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
      smile(22, 6);
      g.fillStyle = '#ff6a7a'; g.beginPath(); g.ellipse(cx + 4, H * 0.6 + 24, 10, 13, 0, 0, 7); g.fill();
      g.strokeStyle = '#d0405a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 4, H * 0.6 + 16); g.lineTo(cx + 4, H * 0.6 + 32); g.stroke();
      break;
    }
    case 'Robot': {
      g.fillStyle = '#c8ccd6'; g.beginPath(); g.roundRect(cx - 70, ey - 32, 140, 64, 14); g.fill();
      g.fillStyle = '#2a2f3a'; g.beginPath(); g.roundRect(cx - 62, ey - 24, 124, 48, 10); g.fill();
      g.fillStyle = '#3af0ff'; for (const x of ex) { g.beginPath(); g.roundRect(x - 14, ey - 10, 28, 20, 5); g.fill(); }
      g.fillStyle = '#9aa3ad'; g.fillRect(cx - 30, H * 0.66, 60, 16);
      g.fillStyle = '#2a2f3a'; for (let k = 0; k < 5; k++) g.fillRect(cx - 26 + k * 12, H * 0.66 + 3, 6, 10);
      break;
    }
    case 'Moustache': {
      eye(ex[0], ey); eye(ex[1], ey); brows();
      g.fillStyle = '#5a3a22';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 20, H * 0.6, 24, 10, s * 0.25, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + s * 42, H * 0.57, 9, 6, s * -0.6, 0, 7); g.fill(); }
      g.strokeStyle = '#5a2a2a'; g.lineWidth = 5; g.beginPath(); g.arc(cx, H * 0.66, 12, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
      break;
    }
    case 'Heart eyes': {
      const heart = (x, y, r) => {
        g.beginPath(); g.moveTo(x, y + r * 0.9);
        g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.45);
        g.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); g.fill();
      };
      g.fillStyle = '#ff3a6a'; for (const x of ex) heart(x, ey, 22);
      g.fillStyle = 'rgba(255,255,255,.7)'; for (const x of ex) { g.beginPath(); g.arc(x - 9, ey - 9, 4, 0, 7); g.fill(); }
      smile(24, 6);
      break;
    }
    case 'Tongue out': {
      eye(ex[0], ey); eye(ex[1], ey); brows();
      g.fillStyle = '#7a2a2a'; g.beginPath(); g.arc(cx, H * 0.6, 20, 0, Math.PI); g.closePath(); g.fill();
      g.fillStyle = '#ff6a7a'; g.beginPath(); g.ellipse(cx + 3, H * 0.6 + 22, 12, 15, 0, 0, 7); g.fill();
      g.strokeStyle = '#d0405a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 3, H * 0.6 + 12); g.lineTo(cx + 3, H * 0.6 + 32); g.stroke();
      break;
    }
    case 'Dizzy': {
      g.strokeStyle = '#1c1c28'; g.lineWidth = 5;
      for (const x of ex) { g.beginPath(); for (let a = 0; a < 14; a += 0.3) { const r = 2 + a * 1.4; g.lineTo(x + Math.cos(a) * r, ey + Math.sin(a) * r); } g.stroke(); }
      g.strokeStyle = '#5a2a2a'; g.lineWidth = 6; g.beginPath();
      for (let i = 0; i <= 8; i++) g.lineTo(cx - 24 + i * 6, H * 0.64 + (i % 2 ? 5 : -5));
      g.stroke();
      break;
    }
    case 'Nerd': {
      eye(ex[0], ey, 14, 19); eye(ex[1], ey, 14, 19);
      g.strokeStyle = '#2a2a33'; g.lineWidth = 7;
      for (const x of ex) { g.beginPath(); g.roundRect(x - 24, ey - 22, 48, 44, 12); g.stroke(); }
      g.beginPath(); g.moveTo(cx - 6, ey - 4); g.lineTo(cx + 6, ey - 4); g.stroke();
      g.fillStyle = '#7a2a2a'; g.beginPath(); g.arc(cx, H * 0.62, 16, 0, Math.PI); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.fillRect(cx - 7, H * 0.62, 6, 8); g.fillRect(cx + 1, H * 0.62, 6, 8);
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
  if (!m) { m = charMat({ map: drawFace(FACES[i]) }); faceCache.set(i, m); }
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

export function setOutfit(p, i) {
  p.outfitIndex = (i + OUTFIT_LIST.length) % OUTFIT_LIST.length;
  p.outfit = outfitFn(p.outfitIndex, p); // read by Player.partMesh
  p.setColor(p.colorIndex); // rebuilds the meshes
}

export function setPants(p, i) {
  p.pantsIndex = (i + PANTS.length) % PANTS.length;
  p.pantsColor = PANTS[p.pantsIndex].color ?? undefined; // read by Player.partMesh
  p.setColor(p.colorIndex); // rebuilds the meshes
}

// ---- locked items (found in presents) --------------------------------------
export { HATS };
export const hatLocked = (i) => isLocked('hat:' + HATS[i]);
export const faceLocked = (i) => isLocked('face:' + FACES[i]);
export const pantsLocked = (i) => isLocked('pants:' + PANTS[i].name);
export const outfitLocked = (i) => isLocked('outfit:' + OUTFIT_LIST[i].id);
// Next unlocked index from i in direction d (wraps; i itself if nothing else is free).
function nextFree(i, d, n, locked) {
  for (let k = 1; k <= n; k++) { const j = (((i + d * k) % n) + n) % n; if (!locked(j)) return j; }
  return i;
}
export const cycleHat = (p, d) => setHat(p, nextFree(p.hat, d, HATS.length, hatLocked));
export const cycleFace = (p, d) => setFace(p, nextFree(p.face || 0, d, FACES.length, faceLocked));
export const cyclePants = (p, d) => setPants(p, nextFree(p.pantsIndex || 0, d, PANTS.length, pantsLocked));
export const cycleOutfit = (p, d) => setOutfit(p, nextFree(p.outfitIndex || 0, d, OUTFIT_LIST.length, outfitLocked));
// Display name of a reward key ('hat:viking' -> 'Viking helmet').
export function rewardName(key) {
  const [type, id] = key.split(':');
  if (type === 'hat') return HAT_NAMES[id] || id;
  if (type === 'face') return id + ' face';
  if (type === 'outfit') return OUTFIT_LIST.find((o) => o.id === id)?.name || id;
  return id + ' trousers';
}

export function setHat(p, i) {
  p.hat = (i + HATS.length) % HATS.length;
  p.buildHat();
}

export function lookOf(p) {
  return { color: p.colorIndex, hat: p.hat, face: p.face || 0, pants: p.pantsIndex || 0, outfit: p.outfitIndex || 0, gadget: p.gadget || null };
}

// Each player slot (Player 1, Player 2...) keeps its own saved Wobbler, stored
// beside the per-device prefs as settings.devices.slot<N>. Before slots
// existed the look was kept per device: that one is the fallback.
function slotPrefs(p) {
  const key = 'slot' + (p.index + 1), d = settings.devices;
  if (!d[key] || typeof d[key] !== 'object') d[key] = {};
  return d[key];
}
export function savedLook(p) {
  const L = slotPrefs(p).look;
  if (L && typeof L === 'object') return L;
  const old = devicePrefs(p.deviceId).look;
  return old && typeof old === 'object' ? old : null;
}

export function saveLook(p) {
  slotPrefs(p).look = lookOf(p);
  saveSettings();
}

// Apply the look this player slot saved last time (if any). Returns true if one existed.
export function restoreLook(p) {
  const L = savedLook(p);
  if (!L || typeof L !== 'object') { p.face = 0; p.pantsIndex = 0; p.outfitIndex = 0; p.outfit = null; if (p.gadget) { applyGadget(p, null); p.setColor(p.colorIndex); } return false; }
  const n = (v, m, locked = () => false) => (Number.isInteger(v) && v >= 0 && v < m && !locked(v) ? v : 0); // locked again after a progress reset
  p.hat = n(L.hat, HATS.length, hatLocked); p.buildHat();
  p.pantsIndex = n(L.pants, PANTS.length, pantsLocked);
  p.pantsColor = PANTS[p.pantsIndex].color ?? undefined;
  p.outfitIndex = n(L.outfit, OUTFIT_LIST.length, outfitLocked); p.outfit = outfitFn(p.outfitIndex, p);
  applyGadget(p, typeof L.gadget === 'string' && !gadgetLocked(L.gadget) ? L.gadget : null); // gadgets.js (before the mesh rebuild)
  p.setColor(n(L.color, PLAYER_COLORS.length));
  setFace(p, n(L.face, FACES.length, faceLocked));
  return true;
}

export function randomLook(p) {
  const r = (m, locked = () => false) => { const free = []; for (let i = 0; i < m; i++) if (!locked(i)) free.push(i); return free[(Math.random() * free.length) | 0] ?? 0; };
  p.hat = r(HATS.length, hatLocked); p.buildHat();
  p.pantsIndex = r(PANTS.length, pantsLocked); p.pantsColor = PANTS[p.pantsIndex].color ?? undefined;
  p.outfitIndex = r(OUTFIT_LIST.length, outfitLocked); p.outfit = outfitFn(p.outfitIndex, p);
  p.setColor(r(PLAYER_COLORS.length));
  setFace(p, r(FACES.length, faceLocked));
}
