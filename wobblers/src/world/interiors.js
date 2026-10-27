// Enterable buildings: hollow shells with swinging physics doors, loose
// furniture, and stairs (a two-storey house, a cafe with a rooftop terrace).
// Exteriors keep the footprint, door position, awning and sign of the solid
// versions in town.js so streets and props still line up.
import { AWNING_BOUNCE } from '../config.js';
import * as THREE from 'three';
import { RAPIER } from '../physics.js';
import { Builder, signMesh, GLOW } from '../mesh.js';
import { Local, addDoor, useSpot } from './common.js';
import { lfurn } from './furniture.js';
import { jukebox, piano, vendingMachine } from './music.js';
import { trolley } from './fun.js';
import { poster } from './posters.js';
import { homeFixtures } from './estate.js';
import { buildArcade } from '../arcade/index.js';

const T = 0.25; // wall thickness
// Business fronts (o.business): warm "lights on" window glass (glows at night), a glazed door,
// a glowing OPEN sign in the front window, a lamp over the door, posters by the door, flower
// pots, and pools of light on the pavement in front that come up after dark.
export const LIT_GLASS = 0xfff0c4;
GLOW.set(LIT_GLASS, 1);

// Hollow box building: four walls (front door hole + windows), roof slab.
export function shell(game, L, o) {
  const { w, d, h, wall } = o, hw = w / 2, hd = d / 2;
  const fz = hd - T / 2, bz = -hd + T / 2, sx = hw - T / 2;
  const door = o.door; // { lx, w, h, color }
  if (o.business) { // shops: lit windows and a door you can see into
    o.windows = (o.windows || []).map((w2) => ({ glass: LIT_GLASS, ...w2 }));
    if (door) door.glass = true;
  }
  L.wall(-hw, fz, hw, fz, h, T, wall, door ? [{ at: door.lx + hw, w: door.w + 0.1, h: door.h + 0.05 }] : []);
  L.wall(-hw, bz, hw, bz, h, T, wall);
  for (const s of [-1, 1]) L.wall(s * sx, -hd + T, s * sx, hd - T, h, T, wall);
  // windows: [{ side: 'f'|'b'|'l'|'r', at (lx or lz), y, w, h }]
  for (const win of o.windows || []) {
    const g = win.glass ?? 0x9fd8ff;
    if (win.side === 'f') L.window(-hw, fz, hw, fz, win.at + hw, win.y, win.w, win.h, T, g);
    if (win.side === 'b') L.window(-hw, bz, hw, bz, win.at + hw, win.y, win.w, win.h, T, g);
    if (win.side === 'l') L.window(-sx, -hd, -sx, hd, win.at + hd, win.y, win.w, win.h, T, g);
    if (win.side === 'r') L.window(sx, -hd, sx, hd, win.at + hd, win.y, win.w, win.h, T, g);
  }
  L.deco(0, 0.035, 0, w - 2 * T, 0.05, d - 2 * T, o.floor ?? 0xd8c8a8);
  if (o.roof !== false) {
    L.box(0, h - 0.1, 0, w, 0.2, d, o.roofColor ?? 0xdddddd);
    // ceiling lights (real lights from the interior light pool)
    for (const [lx, lz, opts] of o.lights ?? [[-w / 4, 0], [w / 4, 0]]) {
      const p = L.v3(lx, h - 0.2, lz);
      game.interiorLights.add(p.x, p.y, p.z, { yaw: L.yaw, ...opts });
    }
  }
  if (door) {
    const [hx, hz] = L.w(door.lx - door.w / 2, fz);
    addDoor(game, hx, L.y0 + 0.04, hz, L.yaw, door.w, door.h, door.color ?? 0x8a4a2a, { glass: door.glass });
    // threshold step outside
    L.box(door.lx, 0.06, hd + 0.5, door.w + 0.8, 0.12, 1.0, 0xcfcfcf);
  }
  if (o.business && door) dressFront(game, L, { ...o, w, d, h });
}

// ---- inviting shop fronts ------------------------------------------------------------------------
let _open = null, _spill = null, _show = null;
// Window displays: what you'd see through a lit shop window, painted once per kind
// (unlit, so they read as lights on by day and glow at night); one instanced set per kind.
const SHOW_KINDS = ['shop', 'cafe', 'arcade', 'diner', 'gadgets', 'market'];
function paintShow(kind) {
  const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), rnd = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(SHOW_KINDS.indexOf(kind) * 97 + 11);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fff3cf'); bg.addColorStop(0.55, '#ffe0a0'); bg.addColorStop(1, '#e8b878');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let x = 40; x < W; x += 120) { const lg = g.createRadialGradient(x, 0, 2, x, 0, 90); lg.addColorStop(0, 'rgba(255,255,240,0.9)'); lg.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = lg; g.fillRect(x - 90, 0, 180, 90); }
  const C = ['#ff5a5a', '#3f8cff', '#55d85a', '#ffc233', '#b46cff', '#ff8ab8', '#3fd0c8', '#ff8a3d'];
  const pick = () => C[(rnd() * C.length) | 0];
  if (kind === 'cafe' || kind === 'diner') {
    g.fillStyle = kind === 'diner' ? '#e8322b' : '#8a5a3a'; g.fillRect(0, H * 0.62, W, H * 0.08); // counter
    g.fillStyle = kind === 'diner' ? '#f2f2f2' : '#6b4a2a'; g.fillRect(0, H * 0.7, W, H * 0.3);
    for (let x = 30; x < W; x += 64) { g.fillStyle = kind === 'diner' ? '#e8322b' : '#ff5a5a'; g.beginPath(); g.ellipse(x, H * 0.6, 20, 7, 0, 0, 7); g.fill(); g.fillStyle = '#555'; g.fillRect(x - 3, H * 0.6, 6, 26); }
    for (let x = 60; x < W; x += 150) { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, H * 0.42, 34, 10, 0, 0, 7); g.fill(); g.fillStyle = pick(); g.beginPath(); g.arc(x - 8, H * 0.37, 9, 0, 7); g.fill(); g.fillStyle = '#c87a3a'; g.fillRect(x + 6, H * 0.33, 12, 14); }
    g.fillStyle = '#223322'; g.fillRect(W * 0.62, H * 0.08, W * 0.3, H * 0.2); g.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) g.fillRect(W * 0.65, H * 0.12 + i * 14, W * (0.12 + rnd() * 0.1), 5);
  } else if (kind === 'arcade') {
    g.fillStyle = '#2a1840'; g.fillRect(0, 0, W, H);
    for (let x = 20; x < W; x += 90) {
      g.fillStyle = pick(); g.fillRect(x, H * 0.22, 64, H * 0.78);
      const sc = g.createLinearGradient(0, H * 0.3, 0, H * 0.55); sc.addColorStop(0, '#6af0ff'); sc.addColorStop(1, '#ff6ad5');
      g.fillStyle = sc; g.fillRect(x + 8, H * 0.3, 48, H * 0.26);
      g.fillStyle = '#ffd23f'; g.fillRect(x + 6, H * 0.16, 52, H * 0.08);
    }
    g.fillStyle = 'rgba(255,90,200,0.35)'; g.fillRect(0, 0, W, 14);
  } else { // shelves of colourful goods (shops, market, gadgets)
    const rows = kind === 'market' ? 3 : 2;
    for (let r = 0; r < rows; r++) {
      const y = H * (0.32 + r * (0.55 / rows));
      g.fillStyle = '#b08a58'; g.fillRect(0, y, W, 8);
      for (let x = 8; x < W - 20; x += 22 + rnd() * 16) {
        const hh = 18 + rnd() * 30, ww = 14 + rnd() * 14;
        g.fillStyle = kind === 'market' ? ['#ff5a3a', '#ffc233', '#6ad06a', '#ff8a3d'][(rnd() * 4) | 0] : pick();
        if (kind === 'market') { g.beginPath(); g.arc(x + ww / 2, y - 9, 10, 0, 7); g.fill(); } else g.fillRect(x, y - hh, ww, hh);
      }
    }
    if (kind === 'gadgets') { g.fillStyle = 'rgba(80,220,210,0.25)'; g.fillRect(0, 0, W, H); }
    for (let x = 70; x < W; x += 180) { g.fillStyle = pick(); g.beginPath(); g.ellipse(x, H * 0.92, 26, 30, 0, 0, 7); g.fill(); } // a shopper or two (soft toy blobs)
  }
  // glass: a frame of reflections over the scene
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (const x0 of [W * 0.12, W * 0.58]) { g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + 70, 0); g.lineTo(x0 - 10, H); g.lineTo(x0 - 80, H); g.fill(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function sharedFronts(game) {
  if (_open && _open.game === game) return;
  // OPEN signs: one instanced set, a glowing red-and-white neon look (unlit material)
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 112;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a1a2a'; g.beginPath(); g.roundRect(4, 4, 248, 104, 26); g.fill();
  g.strokeStyle = '#ff4d6d'; g.lineWidth = 9; g.shadowColor = '#ff4d6d'; g.shadowBlur = 14; g.beginPath(); g.roundRect(12, 12, 232, 88, 20); g.stroke();
  g.font = '900 64px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff6d8'; g.shadowColor = '#ffd36a'; g.shadowBlur = 18; g.fillText('OPEN', 128, 60);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const open = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 0.42), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }), 96);
  open.count = 0; open.userData.noCull = true; open.frustumCulled = false;
  game.scene.add(open);
  // light spill on the pavement: soft warm ovals, additive, fading in after dusk
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d'), gr = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,214,140,1)'); gr.addColorStop(1, 'rgba(255,214,140,0)');
  sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  const smat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const spill = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), smat, 256);
  spill.count = 0; spill.userData.noCull = true; spill.frustumCulled = false; spill.renderOrder = 2;
  game.scene.add(spill);
  game.updaters.push(() => { const k = game.nightLight ?? 0; smat.opacity = k * 0.55; spill.visible = k > 0.02; });
  _open = { game, mesh: open }; _spill = spill;
  _show = {};
  for (const k of SHOW_KINDS) {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: paintShow(k), color: 0xe8e0d0 }), 48);
    m.count = 0; m.userData.noCull = true; m.frustumCulled = false;
    m.name = 'show_' + k; game.scene.add(m); _show[k] = m;
  }
}
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _s4 = new THREE.Vector3(), _p4 = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
function placeInst(mesh, x, y, z, yaw, sx, sz = sx, sy) {
  if (mesh.count >= mesh.instanceMatrix.count) return;
  _q4.setFromAxisAngle(_UP, yaw); _s4.set(sx, sy ?? 1, sz); _p4.set(x, y, z);
  mesh.setMatrixAt(mesh.count++, _m4.compose(_p4, _q4, _s4));
  mesh.instanceMatrix.needsUpdate = true;
}
const FRONT_POSTERS = [
  { title: 'WELCOME!', sub: 'come on in', bg: '#ff8a3d' }, { title: 'NEW!', sub: 'in store now', bg: '#3f8cff' },
  { title: 'SALE', sub: 'wobbly prices', bg: '#e8322b' }, { title: 'HELLO!', sub: 'we are open', bg: '#55a84a' },
  { title: 'FUN!', sub: 'for everyone', bg: '#b46cff' }, { title: 'TODAY', sub: 'special offer', bg: '#ffc233', fg: '#4a2a00' },
];
let _posterN = 0;
// Dress the front (local +z) of an enterable building: o = { w, d, h, door: { lx, w, h },
// windows: [{ side, at, y, w, h }], business: kind (window painting: shop / cafe / arcade /
// diner / gadgets / market; anything else paints no display), open (OPEN sign, default true),
// posters (default true), pots (default true) }. shell() calls it for o.business shells.
export function dressFront(game, L, o) {
  const { w, d } = o;
  sharedFronts(game);
  const hd = d / 2, door = o.door;
  // OPEN sign hung inside the front window nearest the door (or beside the door)
  const fw = (o.windows || []).filter((w2) => w2.side === 'f').sort((a, b) => Math.abs(a.at - door.lx) - Math.abs(b.at - door.lx))[0];
  const ox = fw ? fw.at + Math.sign(door.lx - fw.at || 1) * Math.max(0, fw.w / 2 - 0.65) : door.lx - door.w / 2 - 0.8;
  const oy = fw ? Math.min(fw.y + fw.h / 2 - 0.4, 2.6) : 2.2;
  const op = L.v3(ox, oy, hd + 0.1);
  if (o.open !== false) placeInst(_open.mesh, op.x, op.y, op.z, L.yaw, 1);
  // the shop's insides painted on its windows (front and sides)
  const kind = typeof o.business === 'string' ? o.business : 'shop', show = _show[kind], hw = w / 2;
  if (show) for (const w2 of o.windows || []) {
    const side = { f: [0, hd, 0], b: [0, -hd, Math.PI], l: [-hw, 0, -Math.PI / 2], r: [hw, 0, Math.PI / 2] }[w2.side];
    if (!side) continue;
    const [bx, bz, ly] = side, out = 0.075;
    const lx = w2.side === 'f' || w2.side === 'b' ? w2.at * (w2.side === 'b' ? 1 : 1) : bx + Math.sin(ly) * out;
    const lz = w2.side === 'f' || w2.side === 'b' ? bz + Math.cos(ly) * out : w2.at;
    const p = L.v3(lx, w2.y, lz);
    placeInst(show, p.x, p.y, p.z, L.yaw + ly, w2.w, 1, w2.h);
  }
  // lamp over the door
  L.deco(door.lx, door.h + 0.45, hd + 0.18, 0.12, 0.12, 0.3, 0x333333);
  L.sphere(door.lx, door.h + 0.35, hd + 0.34, 0.16, 0xfff4c2);
  // pools of light on the pavement in front of the door and each front window
  const sp = L.v3(door.lx, 0.07, hd + 1.5); placeInst(_spill, sp.x, sp.y, sp.z, L.yaw, door.w + 2.2, 3.2);
  for (const w2 of o.windows || []) if (w2.side === 'f') { const q = L.v3(w2.at, 0.07, hd + 1.4); placeInst(_spill, q.x, q.y, q.z, L.yaw, w2.w + 1.6, 2.8); }
  // posters on the front wall either side of the door, where there is room
  const taken = [[door.lx - door.w / 2 - 0.3, door.lx + door.w / 2 + 0.3], ...(o.windows || []).filter((w2) => w2.side === 'f').map((w2) => [w2.at - w2.w / 2 - 0.2, w2.at + w2.w / 2 + 0.2])];
  const free = (a, b) => a > -w / 2 + 0.3 && b < w / 2 - 0.3 && !taken.some(([t0, t1]) => b > t0 && a < t1);
  let placed = 0;
  for (const cx of [door.lx + door.w / 2 + 0.95, door.lx - door.w / 2 - 0.95, w / 2 - 1.1, -w / 2 + 1.1]) {
    if (o.posters === false) break;
    if (placed >= 2 || !free(cx - 0.55, cx + 0.55)) continue;
    taken.push([cx - 0.6, cx + 0.6]);
    const P = FRONT_POSTERS[_posterN++ % FRONT_POSTERS.length];
    poster(game, L, 'front_' + P.title.toLowerCase().replace(/[^a-z]/g, ''), cx, 1.75, hd + 0.06, 0, 1.05, 1.45, { bg: P.bg, title: P.title, sub: P.sub, fg: P.fg, frame: 0xffffff });
    placed++;
  }
  // flower pots either side of the door
  for (const s of [-1, 1]) {
    if (o.pots === false) break;
    const px = door.lx + s * (door.w / 2 + 0.45);
    if (!free(px - 0.3, px + 0.3) && Math.abs(px - door.lx) < door.w / 2 + 0.3) continue;
    L.cyl(px, 0.3, hd + 0.45, 0.28, 0.6, 0xc8643a, { seg: 10, rTop: 0.32 });
    L.sphere(px, 0.78, hd + 0.45, 0.36, [0xff5a8a, 0xffc233, 0x6ad06a][(_posterN + (s > 0 ? 1 : 0)) % 3]);
  }
}

// Awning + sign on the front (same look as town.js shop()).
export function shopFront(game, L, w, d, h, name, color) {
  const c = new THREE.Color(color).getHex();
  const n = Math.round(w / 1.2);
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (i + 0.5) * (w / n);
    L.box(lx, 3.35, d / 2 + 1.0, w / n + 0.01, 0.12, 2.1, i % 2 ? 0xffffff : c, { euler: [0.35, 0, 0], bounce: AWNING_BOUNCE }); // a trampoline
  }
  const sign = signMesh(name, Math.min(w * 0.8, 9), color);
  const p = L.v3(0, h - 0.9, d / 2 + 0.2);
  sign.position.set(p.x, p.y, p.z); sign.rotation.y = L.yaw;
  game.scene.add(sign);
}

// Low parapet around a flat roof with an opening [lz0, lz1] on the +x side.
function parapet(L, w, d, h, color, gap) {
  const y = h + 0.45, hw = w / 2, hd = d / 2;
  L.box(0, y, hd - 0.08, w, 0.9, 0.16, color);
  L.box(0, y, -hd + 0.08, w, 0.9, 0.16, color);
  L.box(-hw + 0.08, y, 0, 0.16, 0.9, d, color);
  if (gap) {
    const [g0, g1] = gap;
    if (g0 > -hd) L.box(hw - 0.08, y, (-hd + g0) / 2, 0.16, 0.9, g0 + hd, color);
    if (g1 < hd) L.box(hw - 0.08, y, (g1 + hd) / 2, 0.16, 0.9, hd - g1, color);
  } else L.box(hw - 0.08, y, 0, 0.16, 0.9, d, color);
}

export function interiorShop(game, kit, x, z, yaw, name, color, wall, o = {}) {
  const w = o.w || 14, d = o.d || 11, h = o.h || 5.5;
  const L = new Local(kit, x, z, yaw);
  const make = SHOPS[name];
  make(game, L, w, d, h, wall, color, name);
}

const SHOPS = {
  CAFE(game, L, w, d, h, wall, color, name) {
    shell(game, L, {
      w, d, h, wall, floor: 0xe8d2b0, roofColor: 0xc9c3b8, business: 'cafe',
      door: { lx: w * 0.25, w: 1.6, h: 2.4, color: 0x5a3a2a, glass: true },
      windows: [{ side: 'f', at: -w * 0.2, y: 1.8, w: w * 0.4, h: 2.0 }, { side: 'l', at: 0, y: 1.9, w: 3, h: 1.5 }, { side: 'b', at: -3, y: 2.6, w: 2, h: 1.2 }],
    });
    shopFront(game, L, w, d, h, name, color);
    // counter + coffee machine + menu board
    L.box(1.8, 0.55, -3.6, 5.2, 1.1, 0.8, 0x8a5a3a);
    L.deco(1.8, 1.13, -3.6, 5.3, 0.06, 0.9, 0xf2e4c8);
    L.box(3.4, 1.45, -3.85, 0.7, 0.6, 0.45, 0x444444);
    L.deco(3.4, 1.5, -3.6, 0.5, 0.2, 0.06, 0xff5a3c);
    L.box(1.8, 1.0, -4.55, 5.0, 2.0, 0.4, 0x6b4a2a);
    L.deco(1.8, 3.2, -4.68, 3.6, 1.2, 0.06, 0x223322);
    for (let i = 0; i < 4; i++) L.deco(0.6 + i * 0.8, 3.2, -4.64, 0.5, 0.08, 0.04, 0xffffff);
    for (const lx of [0.2, 1.6, 3.0]) lfurn(game, L, 'stool', lx, 0, -2.75, 0, 0x8a5a3a);
    const cwx = -w / 2 + T + 0.04;
    poster(game, L, 'cafe_coffee', cwx, 2.3, -3.2, Math.PI / 2, 1.0, 1.4, { bg: '#8a5a3a', title: 'COFFEE', sub: 'wobbly good', blob: '#ff5a3c' });
    poster(game, L, 'cafe_cake', cwx, 2.3, 3.2, Math.PI / 2, 1.0, 1.4, { bg: '#ff8ab8', title: 'CAKE!', sub: 'fresh today', fg: '#5a1a3a' });
    // tables and chairs
    for (const [tx, tz] of [[-4.3, 2.0], [-1.4, 2.0], [-4.3, -1.6], [-1.4, -1.4]]) {
      lfurn(game, L, 'roundTable', tx, 0, tz, 0, 0xffffff);
      lfurn(game, L, 'chair', tx - 0.85, 0, tz, Math.PI / 2, 0xff5a5a);
      lfurn(game, L, 'chair', tx + 0.85, 0, tz, -Math.PI / 2, 0xff5a5a);
    }
    lfurn(game, L, 'plant', -5.9, 0, 4.2);
    jukebox(game, L, w / 2 - T - 0.45, -1.2, -Math.PI / 2);

    // ---- rooftop terrace with an outside staircase on the +x side
    L.deco(0, h + 0.005, 0, w - 0.4, 0.01, d - 0.4, 0xb98a5a);
    parapet(L, w, d, h, wall, [2.25, 4.85]);
    const sx = w / 2 + 0.75;
    L.stairs(sx, -d / 2 - 4.0, 0, sx, 2.3, h, 1.2, 0xdddddd, 0xbbbbbb);
    L.box(sx - 0.07, h - 0.12, 3.55, 1.35, 0.24, 2.5, 0xdddddd);
    // stair rail on the outer side + posts
    const run = 2.3 + d / 2 + 4.0, ang = Math.atan2(h, run), len = Math.hypot(h, run);
    L.box(sx + 0.65, h / 2 + 0.95, (2.3 - d / 2 - 4.0) / 2, 0.08, 0.08, len, 0x777777, { euler: [-ang, 0, 0] });
    L.rail(sx + 0.65, 2.3, sx + 0.65, 4.8, h);
    L.rail(sx + 0.65, 4.8, sx - 0.7, 4.8, h);
    for (let k = 0; k <= 5; k++) {
      const lz = -d / 2 - 4.0 + k * run / 5, y = h * k / 5;
      L.cyl(sx + 0.65, y / 2 + 0.5, lz, 0.04, y + 1.0, 0x777777, { collide: false });
      if (y > 1.2) L.cyl(sx, (y - 0.24) / 2, lz, 0.08, y - 0.24, 0x999999, { collide: false });
    }
    const terr = (lx, lz, k) => {
      lfurn(game, L, 'roundTable', lx, h, lz, 0, 0xffd23f);
      lfurn(game, L, 'chair', lx - 0.85, h, lz, Math.PI / 2, 0x3f8cff);
      lfurn(game, L, 'chair', lx + 0.85, h, lz, -Math.PI / 2, 0x3f8cff);
      L.cyl(lx, h + 1.3, lz + 1.0, 0.04, 2.6, 0xffffff);
      const [px, pz] = L.w(lx, lz + 1.0), bb = L.kit.b(px, pz);
      for (let i = 0; i < 8; i++) bb.add(new THREE.ConeGeometry(1.4, 0.5, 8, 1, true, i * Math.PI / 4, Math.PI / 4), i % 2 ? 0xffffff : [0xff5a5a, 0x55d85a][k], [px, h + 2.6, pz]);
    };
    terr(-3.5, -1.0, 0); terr(0.5, 1.0, 1);
    lfurn(game, L, 'plant', -5.8, h, -4.5);
    lfurn(game, L, 'plant', -5.8, h, 4.5);
  },

  MARKET(game, L, w, d, h, wall, color, name) {
    shell(game, L, { business: 'market',
      w, d, h, wall, floor: 0xeeeeee,
      door: { lx: w * 0.25, w: 1.8, h: 2.4, color: 0x2a8a5a, glass: true },
      windows: [{ side: 'f', at: -w * 0.2, y: 1.8, w: w * 0.4, h: 2.0 }, { side: 'r', at: 0, y: 2.4, w: 3, h: 1.2 }],
    });
    shopFront(game, L, w, d, h, name, color);
    const goods = [0xff5a5a, 0xffd23f, 0x55d85a, 0x3f8cff, 0xff8a3d, 0xb46cff, 0xffffff];
    // shelving rows
    [-3.3, -0.9, 1.5].forEach((lz, r) => {
      L.box(-2.6, 0.75, lz, 5.6, 1.5, 0.7, 0xdddddd);
      for (let k = 0; k < 3; k++) {
        const y = 0.35 + k * 0.45;
        for (const sd of [1, -1]) {
          L.deco(-2.6, y - 0.04, lz + sd * 0.37, 5.6, 0.04, 0.06, 0x999999);
          for (let i = 0; i < 9; i++) L.deco(-5.1 + i * 0.62, y + 0.14, lz + sd * 0.38, 0.4, 0.26, 0.04, goods[(i + k + r * 2 + (sd > 0 ? 3 : 0)) % goods.length]);
        }
      }
    });
    lfurn(game, L, 'produce', -4.4, 1.5, -3.3, 0, 0xff5a5a);
    lfurn(game, L, 'produce', -2.6, 1.5, -3.3, 0, 0xffd23f);
    lfurn(game, L, 'produce', -0.8, 1.5, -3.3, 0, 0x55d85a);
    lfurn(game, L, 'produce', -4.4, 1.5, -0.9, 0, 0xff8a3d);
    lfurn(game, L, 'produce', -1.6, 1.5, 1.5, 0, 0xb46cff);
    lfurn(game, L, 'produce', -3.6, 1.5, 1.5, 0, 0xff5a5a);
    // fridges along the back wall
    for (let i = 0; i < 4; i++) {
      L.box(1.4 + i * 1.2, 1.0, -4.5, 1.1, 2.0, 0.5, 0xffffff);
      L.deco(1.4 + i * 1.2, 1.1, -4.24, 0.9, 1.5, 0.03, 0xbfe8ff);
      for (let k = 0; k < 3; k++) L.deco(1.4 + i * 1.2, 0.6 + k * 0.45, -4.27, 0.8, 0.16, 0.04, goods[(i + k) % goods.length]);
    }
    // checkout
    L.box(5.3, 0.45, 1.5, 1.0, 0.9, 2.6, 0x3f8cff);
    L.deco(5.3, 0.92, 1.3, 0.8, 0.04, 2.0, 0x333333);
    L.box(5.5, 1.05, 2.45, 0.4, 0.25, 0.35, 0x222222);
    // trolleys
    for (let i = 0; i < 4; i++) trolley(game, ...L.w(2.0 + i * 0.8, -2.6), L.yaw + Math.PI);
    lfurn(game, L, 'box', 5.6, 0, -3.8, 0.3);
    lfurn(game, L, 'box', 5.6, 0.48, -3.8, -0.2);
    lfurn(game, L, 'box', 4.9, 0, -3.9, 0.1);
    // vending machine outside by the door
    vendingMachine(game, L, -w / 2 + 1.2, d / 2 + 0.5, 0, 0xff3a3a);
  },

  ARCADE(game, L, w, d, h, wall, color, name) {
    shell(game, L, { business: 'arcade',
      w, d, h, wall: 0x7a62b8, floor: 0x4a3f7a, roofColor: 0x5a4a8a,
      lights: [
        [-w / 4, 0.5, { color: 0xff3a9a, intensity: 6, fixture: 'neon' }],
        [w / 4, 0.5, { color: 0x3af0ff, intensity: 6, fixture: 'neon' }],
        [0, -d / 2 + 1.2, { color: 0xc9b8ff, intensity: 4, fixture: 'panel' }],
      ],
      door: { lx: w * 0.25, w: 1.6, h: 2.4, color: 0xb46cff },
      windows: [{ side: 'f', at: -w * 0.2, y: 1.8, w: w * 0.4, h: 2.0, glass: 0xd9b0ff }],
    });
    shopFront(game, L, w, d, h, name, color);
    // carpet pattern
    for (let i = 0; i < 12; i++) L.deco(-5.5 + i, 0.065, (i % 3) * 2.5 - 2.5, 0.25, 0.01, 0.25, [0xff5a5a, 0x55d85a, 0xffd23f][i % 3]);
    const neon = [0xff3a9a, 0x3af0ff, 0xffe03a, 0x7aff5a, 0xff8a3d];
    // cabinets along the back wall and the left wall
    const cab = (lx, lz, ly, i) => {
      const P = (ax, az) => [lx + ax * Math.cos(ly) + az * Math.sin(ly), lz - ax * Math.sin(ly) + az * Math.cos(ly)];
      L.box(lx, 0.85, lz, 0.85, 1.7, 0.75, 0x222244, { yaw: ly });
      let [a, b] = P(0, 0.38); L.deco(a, 1.25, b, 0.65, 0.5, 0.03, neon[i % neon.length], { yaw: ly });
      [a, b] = P(0, 0.42); L.deco(a, 0.9, b, 0.8, 0.12, 0.2, 0x444466, { yaw: ly });
      [a, b] = P(0, 0.2); L.deco(a, 1.8, b, 0.85, 0.2, 0.4, neon[(i + 2) % neon.length], { yaw: ly });
    };
    // playable cabinets on the back wall (src/arcade/), then three for show
    buildArcade(game, L, [{ lx: -4.9, lz: -d / 2 + T + 0.4, id: 'chomp' }, { lx: -3.6, lz: -d / 2 + T + 0.4, id: 'raiders' }, { lx: -2.3, lz: -d / 2 + T + 0.4, id: 'bugs' }, { lx: -1.0, lz: -d / 2 + T + 0.4, id: 'paddle' }]);
    for (let i = 0; i < 3; i++) cab(0.35 + i * 1.05, -d / 2 + T + 0.45, 0, i + 4);
    for (let i = 0; i < 3; i++) cab(-w / 2 + T + 0.45, -1.8 + i * 1.05, Math.PI / 2, i + 3);
    // air hockey table with a puck you can whack around
    {
      const tx = 0.2, tz = 1.0, TW = 1.3, TL = 2.4, TY = 0.8;
      L.box(tx, TY / 2, tz, TW, TY, TL, 0xffffff, { slippery: true });
      L.deco(tx, TY + 0.005, tz, TW - 0.1, 0.01, TL - 0.1, 0x3a8aff);
      L.deco(tx, TY + 0.012, tz, TW - 0.1, 0.01, 0.03, 0xff3a3a);
      for (const sd of [-1, 1]) {
        L.box(tx + sd * (TW / 2 - 0.04), TY + 0.06, tz, 0.08, 0.12, TL, 0xff3a9a, { restitution: 0.9 });
        for (const gx of [-1, 1]) L.box(tx + gx * 0.42, TY + 0.06, tz + sd * (TL / 2 - 0.04), 0.46, 0.12, 0.08, 0xff3a9a, { restitution: 0.9 });
      }
      const pb = new Builder();
      pb.cyl(0.1, 0.1, 0.04, 0xff3a3a, [0, 0, 0], null, 14);
      const pp = L.v3(tx, TY + 0.06, tz);
      const puck = game.physics.dynamic(pp, [RAPIER.ColliderDesc.cylinder(0.02, 0.1).setMass(0.15).setFriction(0).setRestitution(0.9)], pb.mesh(), { linDamp: 0.05, angDamp: 0.5, ccd: true });
      game.scene.add(puck.mesh);
      // puck that leaves the table comes back
      game.steppers.push(() => {
        const t = puck.body.translation();
        if (t.y < 0.4 || Math.hypot(t.x - pp.x, t.z - pp.z) > 4) { puck.body.setTranslation({ ...pp, y: pp.y + 0.1 }, true); puck.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
      });
    }
    // claw machine (looks only) and beanbags
    L.box(5.3, 0.45, -3.3, 1.2, 0.9, 1.2, 0xff3a9a);
    L.deco(5.3, 1.5, -3.3, 1.18, 1.2, 1.18, 0xd9f2ff);
    L.deco(5.3, 2.2, -3.3, 1.2, 0.2, 1.2, 0xff3a9a);
    for (let i = 0; i < 6; i++) L.sphere(4.95 + (i % 3) * 0.35, 1.05, -3.6 + Math.floor(i / 3) * 0.5, 0.17, neon[i % neon.length]);
    lfurn(game, L, 'beanbag', 4.6, 0, 2.6, 0, 0xff3a9a);
    lfurn(game, L, 'beanbag', 5.5, 0, 1.5, 0, 0x3af0ff);
    lfurn(game, L, 'beanbag', -4.8, 0, 3.5, 0, 0xffe03a);
    const awx = w / 2 - T - 0.04;
    poster(game, L, 'arcade_space', awx, 2.4, 0.2, -Math.PI / 2, 1.0, 1.4, { bg: '#1a1040', title: 'SPACE', sub: 'BLOBBERS', fg: '#3af0ff', blob: '#ff3a9a', frame: 0x222244 });
    poster(game, L, 'arcade_racer', awx, 2.4, 2.8, -Math.PI / 2, 1.0, 1.4, { bg: '#ff8a3d', title: 'TURBO', sub: 'WOBBLE KART', fg: '#1a1040', frame: 0x222244 });
    lfurn(game, L, 'stool', 0.9, 0, -2.9, 0, 0xff3a9a);
    lfurn(game, L, 'stool', 1.95, 0, -2.9, 0, 0x3af0ff);
    // neon strips
    L.deco(0, h - 0.5, -d / 2 + T + 0.03, w - 1, 0.08, 0.04, 0xff3a9a);
    L.deco(-w / 2 + T + 0.03, h - 0.5, 0, 0.04, 0.08, d - 1, 0x3af0ff);
  },
};

// ---- the two-storey house -----------------------------------------------
// Ground floor: living room, dining table, piano. Stairs along the back wall
// to a bedroom upstairs. Gable roof like the other houses.
export function interiorHouse(game, kit, x, z, yaw, wall, roof, doorCol) {
  const w = 10.5, d = 9, h = 6, H1 = 3.1;
  const L = new Local(kit, x, z, yaw);
  const hw = w / 2, hd = d / 2, ix = hw - T, iz = hd - T;
  shell(game, L, {
    w, d, h, wall, floor: 0xc89a6a, roof: false,
    door: { lx: -1.5, w: 1.2, h: 2.25, color: doorCol },
    windows: [
      { side: 'f', at: 2.6, y: 1.55, w: 1.6, h: 1.3 }, { side: 'f', at: -3.9, y: 1.55, w: 1.2, h: 1.3 },
      { side: 'f', at: -2.5, y: 4.6, w: 1.4, h: 1.2 }, { side: 'f', at: 2.5, y: 4.6, w: 1.4, h: 1.2 },
      { side: 'l', at: 1, y: 1.55, w: 1.6, h: 1.3 }, { side: 'r', at: 1, y: 1.55, w: 1.6, h: 1.3 },
      { side: 'l', at: 0, y: 4.6, w: 1.6, h: 1.2 }, { side: 'r', at: 0, y: 4.6, w: 1.6, h: 1.2 },
      { side: 'b', at: -3, y: 4.6, w: 1.4, h: 1.2 },
    ],
  });
  // upper floor slab with a stairwell along the back wall (x -1.2..ix, z -iz..-2.95)
  const zr = -2.95;
  L.box(0, H1 - 0.1, (zr + iz) / 2, 2 * ix, 0.2, iz - zr, 0xb98a5a);
  L.box((-ix - 1.2) / 2, H1 - 0.1, (-iz + zr) / 2, ix - 1.2, 0.2, zr + iz, 0xb98a5a);
  L.box(ix - 0.3, H1 - 0.1, (-iz + zr) / 2, 0.6, 0.2, zr + iz, 0xb98a5a);
  {
    const g = L.v3(0.8, H1 - 0.2, 0.8), u = L.v3(0, h - 0.4, 0.3);
    game.interiorLights.add(g.x, g.y, g.z, { fixture: 'pendant', intensity: 6, range: 8 });
    game.interiorLights.add(u.x, u.y, u.z, { fixture: 'pendant', intensity: 5, range: 7, color: 0xffd6a0 });
  }
  // stairs: from lx -0.9 on the ground up to the landing at lx ix-0.6
  L.stairs(-0.9, -3.6, 0, ix - 0.6, -3.6, H1, 1.2, 0xd9a066, 0xc8955a);
  // banister around the stairwell opening (gap at the top end)
  L.box((-1.2 + ix - 1.4) / 2, H1 + 0.45, zr + 0.04, ix - 1.4 + 1.2, 0.9, 0.08, 0xffffff);
  L.box(-1.2 - 0.04, H1 + 0.45, (-iz + zr) / 2, 0.08, 0.9, zr + iz, 0xffffff);
  // ceiling under the gable roof
  L.box(0, h - 0.1, 0, w, 0.2, d, 0xeeeeee);
  L.deco(0, h - 0.21, 1, 2, 0.02, 1.2, 0xfffbe8);
  // gable roof + chimney (as town.js house())
  const rh = 2.6, slope = Math.atan2(rh, d / 2), sl = Math.hypot(rh, d / 2) + 0.5;
  for (const s of [1, -1]) L.box(0, h + rh / 2, s * d / 4, w + 0.8, 0.25, sl, roof, { euler: [s * slope, 0, 0] });
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    L.deco(s * (hw - 0.05), h + rh * t * 0.95, 0, 0.1, rh / 4, d * (1 - t) + 0.2, wall);
  }
  L.box(w * 0.28, h + rh * 0.9, -d * 0.15, 0.7, 1.8, 0.7, 0xa0583a);

  // ---- ground floor
  lfurn(game, L, 'sofa', 2.6, 0, -1.7, 0, 0x3f8cff);
  lfurn(game, L, 'coffeeTable', 2.6, 0, 0.1, 0);
  lfurn(game, L, 'cabinet', 2.6, 0, iz - 0.3, Math.PI, 0xb5773d, 1.4, 0.5, 0.45);
  lfurn(game, L, 'tv', 2.6, 0.5, iz - 0.3, Math.PI);
  lfurn(game, L, 'armchair', ix - 0.6, 0, 0.3, -Math.PI / 2, 0xff8a3d);
  lfurn(game, L, 'lamp', ix - 0.4, 0, -2.0, 0);
  L.deco(2.6, 0.065, -0.4, 3.2, 0.01, 2.6, 0xd9534f);
  lfurn(game, L, 'table', -2.9, 0, 1.6, 0, 0xb5773d, 1.4, 0.85);
  for (const [cx, cz, cy] of [[-3.3, 0.85, 0], [-2.5, 0.85, 0], [-3.3, 2.35, Math.PI], [-2.5, 2.35, Math.PI]]) lfurn(game, L, 'chair', cx, 0, cz, cy, 0xffffff);
  piano(game, L, -ix + 0.35, -1.3, Math.PI / 2);
  poster(game, L, 'painting_island', ix - 0.04, 1.8, -1.8, -Math.PI / 2, 1.6, 1.1, { bg: '#8fd3ff', sun: true, hills: true, frame: 0xc8a050 });
  poster(game, L, 'portrait_family', -ix + 0.04, H1 + 1.6, -2.5, Math.PI / 2, 1.0, 1.3, { bg: '#ffe9b0', blob: '#3f8cff', frame: 0xc8a050 });
  lfurn(game, L, 'bookshelf', -3.1, 0, -iz + 0.2, 0);
  lfurn(game, L, 'plant', -ix + 0.4, 0, iz - 0.4);

  // ---- upstairs bedroom
  const U = H1;
  lfurn(game, L, 'bed', -3.2, U, 0.9, Math.PI / 2, 0x6ac8ff);
  lfurn(game, L, 'cabinet', -ix + 0.3, U, -1.0, Math.PI / 2, 0xd9a066, 0.5, 0.5, 0.5);
  lfurn(game, L, 'lamp', -ix + 0.35, U, -2.2, 0, 0xffb7d5);
  lfurn(game, L, 'wardrobe', 1.2, U, iz - 0.35, Math.PI);
  lfurn(game, L, 'table', 3.6, U, 0.5, Math.PI / 2, 0xffffff, 1.2, 0.7);
  lfurn(game, L, 'chair', 2.9, U, 0.5, Math.PI / 2, 0x55d85a);
  lfurn(game, L, 'box', 3.8, U, iz - 0.5, 0.3);
  lfurn(game, L, 'box', 3.0, U, iz - 0.5, -0.2, 0xd9b07a, 0.5);
  lfurn(game, L, 'box', 3.4, U + 0.5, iz - 0.5, 0.1, 0xc8955a, 0.45);
  lfurn(game, L, 'teddy', -3.2, U + 0.5, -0.3, 0, 0xffb7d5);
  // a home you can buy (world/estate.js): name plate over the door, bed and wardrobe use spots
  homeFixtures(game, L, { id: 'townhouse', door: [-1.5, hd], doorH: 2.25, bed: [-3.2, U, 0.9], wardrobe: [1.2, U, iz - 0.35, Math.PI] });
  L.deco(-1.0, U + 0.005, 1.0, 2.4, 0.01, 2.0, 0x55d85a);
}
