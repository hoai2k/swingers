// Bigtown building kit: glass towers, mid-rise blocks, brick row houses and
// shops. All static, through the kit (merged per chunk); windows are a few
// big glass panels per floor in GLOW colours so towers light up at night.
import { AWNING_BOUNCE } from '../../../config.js';
import * as THREE from 'three';
import { GLOW, signMesh } from '../../../mesh.js';
import { Local } from '../../common.js';
import { shell, shopFront } from '../../interiors.js';
import { SW } from './layout.js';

// tower glass tints (all glow at night, like the town's windows)
export const GLASS = [0x9fd8ff, 0x7fc4ec, 0x8fb8e8, 0x9fe8e0, 0xb8c8f0];
for (const g of GLASS) if (!GLOW.has(g)) GLOW.set(g, 1);
export const WARM = 0xd2ecf6; // pale window glass (shops, homes); glows warm at night
GLOW.set(WARM, 1);

export const TOWER_COLS = [0x9fb7d0, 0xc9d3dc, 0x7f9bb8, 0xb8c4cf, 0xd8cdbf, 0xf0b8a8, 0xf2d27a, 0x8fd0c0, 0xe8a0b8, 0xb0a0d8];
export const BRICK = [0xb5553a, 0xc8704a, 0x9a4a3a, 0xd88a5a, 0xa86a5a];
export const PASTEL = [0xf6c3c3, 0xf8e3a0, 0xbfe3c0, 0xbcd8f2, 0xe2c8f0, 0xffd8b0, 0xf2f2e6];

const dark = (c, k = 0.75) => new THREE.Color(c).multiplyScalar(k).getHex();
// window quads (city/quads.js, created by city.js build as kit.cityQ)
let Q = null;
export function useQuads(q) { Q = q; }
// a quad on a building-local wall: local position, local normal yaw
export function qwall(L, lx, y, lz, lny, w, h, color) { const p = L.v3(lx, y, lz); Q.wall(p.x, p.y, p.z, L.yaw + lny, w, h, color); }

// ---- glass tower -----------------------------------------------------------
// Centre (x, z), footprint w x d, height h above the pavement. opts:
//   style 'ribbon' (horizontal strip windows) | 'grid' (curtain wall with mullions)
//   glass, color, y0 (base height, default SW), from (start windows/body at this height; the
//   lobby below is built by the caller), roof: 'water' | 'heli' | 'ac' | 'spire' | 'crown' | 'none'
export function tower(kit, x, z, w, d, h, opts = {}) {
  const y0 = opts.y0 ?? SW, col = opts.color ?? TOWER_COLS[0], glass = opts.glass ?? GLASS[0];
  const from = opts.from ?? 0, top = y0 + h;
  const style = opts.style || 'ribbon';
  kit.box(x, y0 + from + (h - from) / 2, z, w, h - from, d, col);
  const F = opts.floor ?? 3.6;
  const faces = [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, 1], [-w / 2, 0, d, 1]];
  if (style === 'ribbon') {
    for (let y = y0 + Math.max(from, 0) + 1.3; y < top - 2; y += F) {
      for (const [fx, fz, len, side] of faces) {
        const n = len > 18 ? 3 : 2, seg = (len - 1.6) / n;
        for (let i = 0; i < n; i++) {
          const o = -len / 2 + 0.8 + seg * (i + 0.5);
          if (side) Q.wall(x + fx + Math.sign(fx) * 0.03, y + 0.9, z + o, Math.sign(fx) * Math.PI / 2, seg - 0.4, 1.9, glass);
          else Q.wall(x + o, y + 0.9, z + fz + Math.sign(fz) * 0.03, fz > 0 ? 0 : Math.PI, seg - 0.4, 1.9, glass);
        }
      }
    }
  } else { // grid: tall glass panels (2 floors each), floor bands and mullions over them
    const g0 = y0 + from + 0.6;
    for (let y = g0; y < top - 2.5; y += F * 2) {
      const hh = Math.min(F * 2, top - 1.5 - y);
      for (const [fx, fz, len, side] of faces) {
        for (const s of [-1, 1]) {
          const o = s * len / 4;
          if (side) Q.wall(x + fx + Math.sign(fx) * 0.03, y + hh / 2, z + o, Math.sign(fx) * Math.PI / 2, len / 2 - 0.9, hh - 0.1, glass);
          else Q.wall(x + o, y + hh / 2, z + fz + Math.sign(fz) * 0.03, fz > 0 ? 0 : Math.PI, len / 2 - 0.9, hh - 0.1, glass);
        }
      }
    }
    const band = opts.band ?? dark(col, 0.9);
    for (let y = g0 + F; y < top - 1.5; y += F) kit.deco(x, y, z, w + 0.28, 0.32, d + 0.28, band);
    const mc = opts.mullion ?? band, mh = top - 1.5 - g0;
    for (const [fx, fz, len, side] of faces) {
      const n = Math.max(2, Math.round(len / 4));
      for (let i = 1; i < n; i++) {
        const o = -len / 2 + len * i / n;
        if (side) kit.deco(x + fx + Math.sign(fx) * 0.1, g0 + mh / 2, z + o, 0.2, mh, 0.22, mc);
        else kit.deco(x + o, g0 + mh / 2, z + fz + Math.sign(fz) * 0.1, 0.22, mh, 0.2, mc);
      }
    }
  }
  roofTop(kit, x, z, w, d, top, col, opts.roof ?? 'ac', opts);
  return top;
}

// Parapet + rooftop clutter. Returns nothing; roof surface is at `top`.
export function roofTop(kit, x, z, w, d, top, col, kind = 'ac', opts = {}) {
  const pc = dark(col, 0.8);
  if (opts.parapet !== false) {
    kit.box(x, top + 0.5, z + d / 2 - 0.15, w, 1.0, 0.3, pc);
    kit.box(x, top + 0.5, z - d / 2 + 0.15, w, 1.0, 0.3, pc);
    kit.box(x + w / 2 - 0.15, top + 0.5, z, 0.3, 1.0, d - 0.6, pc);
    kit.box(x - w / 2 + 0.15, top + 0.5, z, 0.3, 1.0, d - 0.6, pc);
  }
  if (kind === 'none') return;
  if (kind === 'water' || kind === 'ac') {
    kit.box(x - w * 0.2, top + 0.6, z + d * 0.15, 2.2, 1.2, 1.6, 0x9aa0a8);
    kit.deco(x - w * 0.2, top + 1.25, z + d * 0.15, 1.2, 0.1, 1.2, 0x55595f);
    kit.box(x + w * 0.22, top + 1.2, z - d * 0.2, 3, 2.4, 3, 0xaab0b8);
  }
  if (kind === 'water') { // wooden water tower on legs
    const wx = x + w * 0.18, wz = z + d * 0.2;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.cyl(wx + lx * 1.1, top + 1.5, wz + lz * 1.1, 0.12, 3, 0x5a4030, { collide: false });
    kit.cyl(wx, top + 4.4, wz, 1.7, 2.8, 0x9a6a42, { seg: 14 });
    kit.cone(wx, top + 6.4, wz, 1.9, 1.3, 0x6a4a32, { seg: 14 });
    for (const y of [3.6, 5.2]) kit.deco(wx, top + y, wz, 3.5, 0.08, 3.5, 0x444444, { round: 0 });
  }
  if (kind === 'spire') {
    kit.box(x, top + 2, z, w * 0.5, 4, d * 0.5, col);
    kit.box(x, top + 5, z, w * 0.3, 2, d * 0.3, pc);
    kit.cyl(x, top + 13, z, 0.25, 14, 0xdddddd, { collide: false, seg: 8 });
    kit.sphere(x, top + 20.3, z, 0.45, 0xff4040);
  }
  if (kind === 'crown') {
    kit.box(x, top + 1.5, z, w - 3, 3, d - 3, col);
    kit.cone(x, top + 7, z, Math.min(w, d) * 0.45, 8, pc, { seg: 4, euler: [0, Math.PI / 4, 0] });
    kit.cyl(x, top + 13, z, 0.15, 5, 0xdddddd, { collide: false, seg: 6 });
  }
  if (kind === 'heli') {
    kit.deco(x, top + 0.03, z, Math.min(w, d) * 0.7, 0.04, Math.min(w, d) * 0.7, 0x55606a);
    const s = Math.min(w, d) * 0.7;
    kit.deco(x, top + 0.07, z, s * 0.12, 0.03, s * 0.5, 0xffffff);
    kit.deco(x + s * 0.18, top + 0.07, z, s * 0.12, 0.03, s * 0.5, 0xffffff);
    kit.deco(x - s * 0.18, top + 0.07, z, s * 0.12, 0.03, s * 0.5, 0xffffff);
    kit.deco(x, top + 0.07, z, s * 0.42, 0.03, s * 0.1, 0xffffff);
  }
}

// ---- mid-rise block with punched windows (front = local +z) -----------------
// floors of 3.2 m; windows on all four faces. opts: { wall, trim, glass, shopName, shopColor, roof }
export function midrise(game, kit, x, z, yaw, w, d, floors, opts = {}) {
  const L = new Local(kit, x, z, yaw, opts.y0 ?? SW);
  const wall = opts.wall ?? BRICK[0], trim = opts.trim ?? 0xf2ead8, glass = opts.glass ?? GLASS[0];
  const F = 3.2, h = floors * F + 0.6;
  L.box(0, h / 2, 0, w, h, d, wall);
  L.deco(0, h - 0.2, 0, w + 0.5, 0.5, d + 0.5, trim);       // cornice
  L.deco(0, F + 0.15, 0, w + 0.2, 0.3, d + 0.2, trim);      // first-floor line
  const faces = [[0, d / 2, 0, w], [0, -d / 2, Math.PI, w], [w / 2, 0, Math.PI / 2, d], [-w / 2, 0, -Math.PI / 2, d]];
  for (const [fx, fz, fy, len] of faces) {
    const n = Math.max(1, Math.floor(len / 3.2));
    const c = Math.cos(fy), s = Math.sin(fy);
    for (let f = opts.shopName ? 1 : 0; f < floors; f++) {
      for (let i = 0; i < n; i++) {
        const o = -len / 2 + len * (i + 0.5) / n;
        const lx = fx + o * c, lz = fz - o * s; // along the face
        const ox = s * 0.05, oz = c * 0.05;
        qwall(L, lx + ox, f * F + 1.75, lz + oz, fy, 1.3, 1.6, glass);
        qwall(L, lx + ox * 1.6, f * F + 0.9, lz + oz * 1.6, fy, 1.6, 0.16, trim);
      }
    }
  }
  if (opts.shopName) {
    L.deco(0, 1.5, d / 2 + 0.06, w * 0.7, 2.2, 0.1, glass);
    L.deco(w * 0.38, 1.2, d / 2 + 0.07, 1.6, 2.4, 0.1, 0x4a3a2a);
    awning(kit, L, w, d, opts.shopColor ?? '#ff5a5a');
    const sg = signMesh(opts.shopName, Math.min(w * 0.7, 8), opts.shopColor ?? '#ff5a5a');
    const p = L.v3(0, F - 0.2, d / 2 + 0.25); sg.position.set(p.x, p.y, p.z); sg.rotation.y = yaw;
    game.scene.add(sg);
  } else L.deco(0, 1.3, d / 2 + 0.06, 2.2, 2.6, 0.1, 0x3a4a6a); // entrance
  roofTop(kit, ...xz(L, 0, 0), w, d, L.y0 + h, wall, opts.roof ?? (w > 12 ? 'water' : 'ac'), { parapet: false });
  return L.y0 + h;
}
const xz = (L, lx, lz) => L.w(lx, lz);

export function awning(kit, L, w, d, color, y = 3.0) {
  const c = new THREE.Color(color).getHex(), n = Math.max(2, Math.round(w / 1.4));
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + (i + 0.5) * (w / n);
    L.box(lx, y + 0.35, d / 2 + 1.0, w / n + 0.01, 0.12, 2.1, i % 2 ? 0xffffff : c, { euler: [0.35, 0, 0], bounce: AWNING_BOUNCE }); // a trampoline
  }
}

// ---- brick row house (front = local +z, door + stoop) ----------------------------
export function rowHouse(kit, L, lx, w, d, floors, wall, trim, door) {
  const F = 3.1, h = floors * F + 0.8;
  L.box(lx, 0.9 + h / 2, 0, w, h, d, wall); // raised ground floor
  L.box(lx, 0.45, 0, w, 0.9, d, dark(wall, 0.7));
  L.deco(lx, 0.9 + h - 0.25, 0, w + 0.3, 0.5, d + 0.4, trim);
  for (let f = 0; f < floors; f++) for (const k of [-1, 0, 1]) {
    if (f === 0 && k === 1) continue;
    const ox = lx + k * w * 0.3;
    qwall(L, ox, 0.9 + f * F + 1.7, d / 2 + 0.03, 0, 1.1, 1.6, WARM);
    qwall(L, ox, 0.9 + f * F + 2.6, d / 2 + 0.05, 0, 1.4, 0.2, trim);
    qwall(L, ox, 0.9 + f * F + 1.7, -d / 2 - 0.03, Math.PI, 1.1, 1.6, WARM);
  }
  // door + stoop (steps up to the raised floor) + railings
  const dx = lx + w * 0.3;
  L.deco(dx, 0.9 + 1.15, d / 2 + 0.05, 1.1, 2.3, 0.1, door);
  L.deco(dx, 0.9 + 2.45, d / 2 + 0.07, 1.4, 0.3, 0.14, trim);
  L.stairs(dx, d / 2 + 2.2, 0, dx, d / 2, 0.9, 1.5, 0xc8b8a0, 0xb8a890, 0.3);
  L.box(dx, 0.45, d / 2 + 0.3, 1.5, 0.9, 0.6, 0xc8b8a0);
  return 0.9 + h;
}

// ---- shops -------------------------------------------------------------------------
// Solid shop (front = local +z): window, door, awning, sign. Returns its Local.
export function shopBox(game, kit, x, z, yaw, name, color, o = {}) {
  const w = o.w ?? 12, d = o.d ?? 10, h = o.h ?? 5.5, wall = o.wall ?? PASTEL[0];
  const L = new Local(kit, x, z, yaw, o.y0 ?? SW);
  L.box(0, h / 2, 0, w, h, d, wall);
  L.deco(0, h + 0.25, 0, w + 0.4, 0.5, d + 0.4, o.trim ?? 0xffffff);
  L.deco(-w * 0.18, 1.6, d / 2 + 0.05, w * 0.5, 2.2, 0.1, WARM);
  L.deco(w * 0.3, 1.2, d / 2 + 0.05, 1.8, 2.4, 0.1, 0x5a3a2a);
  awning(kit, L, w, d, color);
  if (o.upper) for (let f = 0; f < o.upper; f++) for (const k of [-1, 0, 1]) qwall(L, k * w * 0.3, h + 1.8 + f * 3.1, d / 2 + 0.03, 0, 1.3, 1.5, WARM);
  if (o.upper) { L.box(0, h + o.upper * 1.55 + 0.5, 0, w, o.upper * 3.1, d, wall); }
  if (name) {
    const sg = signMesh(name, Math.min(w * 0.75, 8), color);
    const p = L.v3(0, h - 0.95, d / 2 + 0.2); sg.position.set(p.x, p.y, p.z); sg.rotation.y = L.yaw;
    game.scene.add(sg);
  }
  return L;
}

// Walk-in shop shell (hinged glass door, windows, awning, sign, lights). Returns its Local.
export function shopShell(game, kit, x, z, yaw, name, color, o = {}) {
  const w = o.w ?? 12, d = o.d ?? 10, h = o.h ?? 5;
  const L = new Local(kit, x, z, yaw, o.y0 ?? SW);
  shell(game, L, {
    w, d, h, wall: o.wall ?? PASTEL[1], floor: o.floor ?? 0xe8dcc8, roofColor: 0xc9c3b8,
    door: { lx: w * 0.28, w: 1.6, h: 2.4, color: o.door ?? 0x3a5a8a, glass: true },
    windows: [{ side: 'f', at: -w * 0.18, y: 1.8, w: w * 0.42, h: 2.0, glass: WARM }],
  });
  shopFront(game, L, w, d, h, name, color);
  return L;
}

// A billboard on legs standing on baseY (a roof or the pavement): the sign art hooks in by text.
export function billboard(game, kit, x, baseY, z, yaw, text, bg, fg = '#ffffff', W = 12, lift = 4) {
  const c = Math.cos(yaw), s = Math.sin(yaw), sy = baseY + lift + W / 8;
  kit.box(x - s * 0.15, sy, z - c * 0.15, W + 0.6, W / 4 + 0.6, 0.25, 0x3a3f4a, { yaw });
  for (const k of [-1, 1]) kit.cyl(x + c * k * W * 0.3 - s * 0.4, baseY + lift / 2, z - s * k * W * 0.3 - c * 0.4, 0.15, lift, 0x55595f, { collide: false });
  kit.deco(x - s * 0.8, baseY + lift - 0.25, z - c * 0.8, W, 0.12, 1.0, 0x55595f, { yaw }); // catwalk
  const sg = signMesh(text, W, bg, fg);
  sg.position.set(x + s * 0.02, sy, z + c * 0.02); sg.rotation.y = yaw;
  game.scene.add(sg);
  return sg;
}
