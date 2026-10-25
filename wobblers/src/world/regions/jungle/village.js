// The stilt village: tiki huts on the shore shelf and on stilts in the lagoon
// (boardwalks between them), a tiki bar, fire pit, tiki statues and torches;
// treehouses in giant trees west of the village joined by rope bridges (the
// last one crosses the river, with vines hanging under it), a zip line from
// the big treehouse down to the lagoon huts and a rope swing over the lagoon.
import { VILLAGE, LAGOON } from '../jungle.js';
import { zipLine, vine, ropeBridge, climb } from './rides.js';

const WOOD = 0xb98a5a, WOOD2 = 0x9a6a3a, POST = 0x7a5032, THATCH = 0xd8b45a, THATCH2 = 0xc79f45;
const FLAME = 0xffb03a;

export function buildVillage(game, kit, R) {
  const Y = VILLAGE.y, DECK = 2.1;
  // ---- boardwalk out over the lagoon and the stilt huts -------------------------------
  const walk = (x0, z0, x1, z1, w = 2.4) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    kit.box(cx, DECK - 0.12, cz, w, 0.24, len, WOOD, { yaw });
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) for (const s of [-1, 1]) {
      const x = x0 + (x1 - x0) * i / n + Math.cos(yaw) * s * (w / 2 - 0.15), z = z0 + (z1 - z0) * i / n - Math.sin(yaw) * s * (w / 2 - 0.15);
      const g = R.groundAt(x, z);
      if (DECK - g > 0.4) kit.cyl(x, (DECK + g) / 2 - 0.2, z, 0.13, DECK - g, POST, { seg: 6, collide: false });
    }
  };
  walk(VILLAGE.x1 - 2, 765, -364, 765);
  walk(-370, 748, -370, 782, 2.2);
  const huts = [[-370, 742, 0xd9342b], [-361, 765, 0x2a62c9], [-370, 788, 0xffc233]];
  for (const [x, z, c] of huts) stiltHut(game, kit, R, x, z, DECK, c, x === -361 ? Math.PI / 2 : z < 765 ? 0 : Math.PI);
  // ladder down into the lagoon from the boardwalk end
  climb(game, kit, -376, 766.45, -1.2, DECK, 0, -1);

  // ---- shore huts, tiki bar, fire pit, statues, torches --------------------------------
  shoreHut(game, kit, R, -418, 748, Y, 0xff8a3d, 0);          // chief's hut
  shoreHut(game, kit, R, -400, 745, Y, 0x55d85a, 0);
  tikiBar(game, kit, R, -404, 789, Y);
  // fire pit with log benches
  const fx = -414, fz = 770;
  kit.cyl(fx, Y + 0.15, fz, 1.3, 0.3, 0x6b6560, { seg: 10 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; kit.deco(fx + Math.sin(a) * 0.4, Y + 0.45, fz + Math.cos(a) * 0.4, 0.14, 0.14, 1.2, 0x5a3a20, { euler: [0.6, a, 0] }); }
  kit.cone(fx, Y + 0.9, fz, 0.5, 1.0, FLAME, { seg: 6 });
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; kit.bench(fx + Math.sin(a) * 4, fz + Math.cos(a) * 4, a + Math.PI, Y); }
  R.coins(fx, fz, Y + 2, 'ring', 8, 2.6);
  // tiki statues at the village gate (west) and by the dock
  for (const [x, z, yaw, s] of [[-428, 760, -Math.PI / 2, 1], [-428, 776, -Math.PI / 2, 1], [-392, 806, Math.PI, 0.8]]) tikiStatue(kit, R, x, z, yaw, s);
  // torches
  for (const [x, z] of [[-427, 755], [-427, 781], [-410, 760], [-405, 776], [-392, 760], [-392, 772], [-389, 800], [-420, 790]]) torch(kit, x, z, R.groundAt(x, z));
  for (const [x, z] of [[-364, 760.5], [-364, 769.5], [-371.3, 752], [-371.3, 778]]) torch(kit, x, z, DECK);

  // ---- treehouses in giant trees + rope bridges ------------------------------------------
  const TH = [[-449, 746], [-455, 781], [-459, 822], [-462, 866]].map(([x, z], i) => {
    const g = R.groundAt(x, z);
    return { x, z, g, y: Math.max(g + 9.5, 14), i };
  });
  for (const t of TH) treehouse(game, kit, R, t);
  for (let i = 0; i < TH.length - 1; i++) {
    const a = TH[i], b = TH[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    ropeBridge(kit, { x: a.x + ux * 3.7, y: a.y, z: a.z + uz * 3.7 }, { x: b.x - ux * 3.7, y: b.y, z: b.z - uz * 3.7 }, { sag: i === 2 ? 1.6 : 1.0 });
    // coins strung along each bridge
    R.coins((a.x + b.x) / 2, (a.z + b.z) / 2, Math.max(a.y, b.y) + 2, 'line', 5, l * 0.5, { yaw: Math.atan2(dz, dx) });
  }
  R.coins(TH[1].x, TH[1].z, TH[1].y + 6, 'one', 1, 0, { big: true });
  // vines under the river bridge: grab one on the north bank and swing across
  const b2 = TH[2], b3 = TH[3];
  for (const off of [-3.2, 3.2]) {
    const t = 0.42, px = b2.x + (b3.x - b2.x) * t + off, pz = b2.z + (b3.z - b2.z) * t;
    const pyB = b2.y + (b3.y - b2.y) * t - 1.6 * 4 * t * (1 - t) - 0.45;
    const dk = { x: px, z: b2.z + 4.5 };
    const v = vine(game, { x: px, y: pyB, z: pz }, Math.hypot(pz - dk.z, pyB - (R.groundAt(dk.x, dk.z) + 1.55)), dk, { label: 'Vine' });
    (game.jungleVines ||= []).push(v);
  }
  // zip line: the big treehouse down to the lagoon huts
  const t1 = TH[1];
  const zl = zipLine(game, kit, { x: t1.x + 3.2, y: t1.y, z: t1.z - 1.5 }, { x: -370.2, y: DECK, z: 768 }, { name: 'village', color: 0xff5a3a });
  game.jungleZips = [zl];
  // rope swing over the lagoon: an A-frame on the water's edge, launch from the shelf
  const sx = -380.5, sz = 752, py = 7.6, dkx = -387;
  for (const s of [-1, 1]) { const g = R.groundAt(sx, sz + s * 2); kit.cyl(sx, (py + 0.3 + g) / 2, sz + s * 2, 0.16, py + 0.3 - g, 0x7a5032, { seg: 6 }); }
  kit.box(sx, py + 0.25, sz, 0.3, 0.3, 4.4, 0x7a5032);
  const dg = R.groundAt(dkx, sz) + 1.55;
  const swing = vine(game, { x: sx, y: py, z: sz }, Math.hypot(sx - dkx, py - dg), { x: dkx, z: sz }, { label: 'Rope swing', color: 0xd9c08a });
  (game.jungleVines ||= []).push(swing);

  // ---- people and things to drive -------------------------------------------------------
  for (const [x, z] of [[-412, 760], [-398, 768], [-418, 784]]) R.npc('tiki', x, z, { area: { x: -408, z: 765, r: 16 } });
  R.npc('parrotkeeper', -402, 752, { area: { x: -405, z: 755, r: 9 } });
  R.npc('guide', -431, 744, { yaw: -Math.PI / 2 });
  R.sign('JUNGLE TOURS', -433.5, Y + 2.4, 744, -Math.PI / 2, 4, '#5a7a3a', '#fff4c2');
  kit.cyl(-433.5, Y + 1.1, 742.2, 0.1, 2.3, POST); kit.cyl(-433.5, Y + 1.1, 745.8, 0.1, 2.3, POST);
  R.vehicle('jeep', -425, 740, -Math.PI / 2, 0x5a7a3a);
  R.vehicle('jeep', -425, 746, -Math.PI / 2, 0x8a9a4a);
  R.vehicle('canoe', -375, 755, 0.2, 0xd9542b);
  R.vehicle('canoe', -376, 776, -0.1, 0x3fa8d8);
  R.coins(-375, 765, DECK + 2, 'line', 6, 14);
}

function thatchRoof(kit, x, y, z, r, h, yaw = Math.PI / 4) {
  kit.cone(x, y + h / 2, z, r, h, THATCH, { seg: 4, euler: [0, yaw, 0] });
  kit.cone(x, y + h * 0.82, z, r * 0.34, h * 0.36, THATCH2, { seg: 4, euler: [0, yaw, 0] });
  // invisible roof collider: a flat slab so things don't fall through
  kit.box(x, y + 0.15, z, r * 1.2, 0.3, r * 1.2, THATCH2, { yaw: yaw - Math.PI / 4 });
}

function stiltHut(game, kit, R, x, z, deck, color, yaw) {
  const L = new R.Local(kit, x, z, yaw, deck);
  L.box(0, -0.12, 0, 7, 0.24, 7, 0xa77b4a);
  for (const [a, b] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) { const [wx, wz] = L.w(a, b); const g = R.groundAt(wx, wz); kit.cyl(wx, (deck + g) / 2 - 0.2, wz, 0.18, deck - g, 0x7a5032, { seg: 6 }); }
  const H = 2.8, h = 2.4;
  L.wall(-h, h, h, h, H, 0.18, color, [{ at: h, w: 1.2, h: 2.1 }]);   // front (door) faces local +z
  L.wall(-h, -h, h, -h, H, 0.18, color, [{ at: h, w: 1.4, h: 1.0, sill: 1.1 }]);
  L.wall(-h, -h, -h, h, H, 0.18, color, [{ at: h, w: 1.3, h: 1.0, sill: 1.1 }]);
  L.wall(h, -h, h, h, H, 0.18, color, [{ at: h, w: 1.3, h: 1.0, sill: 1.1 }]);
  const [rx, rz] = L.w(0, 0);
  thatchRoof(kit, rx, deck + H, rz, 4.4, 3.2, yaw + Math.PI / 4);
  L.rail(-3.4, 3.4, -1.2, 3.4, 0, 0.9, 0x6b4a2a); L.rail(1.2, 3.4, 3.4, 3.4, 0, 0.9, 0x6b4a2a);
  game.interiorLights?.add(rx, deck + H - 0.2, rz, { color: 0xffc27a, intensity: 6, range: 7, fixture: 'none' });
}

function shoreHut(game, kit, R, x, z, y0, color, yaw) {
  const S = 1.6, L = new R.Local(kit, x, z, yaw, y0 + S);
  L.box(0, -0.12, 0, 8, 0.24, 8, 0xa77b4a);
  for (const [a, b] of [[-3.7, -3.7], [3.7, -3.7], [-3.7, 3.7], [3.7, 3.7]]) L.cyl(a, -S / 2, b, 0.22, S, POST, { seg: 6 });
  const h = 2.8, H = 3;
  L.wall(-h, h, h, h, H, 0.2, color, [{ at: h, w: 1.3, h: 2.2 }]);
  L.wall(-h, -h, h, -h, H, 0.2, color, [{ at: h, w: 1.6, h: 1.0, sill: 1.1 }]);
  L.wall(-h, -h, -h, h, H, 0.2, WOOD2, []);
  L.wall(h, -h, h, h, H, 0.2, WOOD2, [{ at: h, w: 1.4, h: 1.0, sill: 1.1 }]);
  L.stairs(0, 6.2, -S, 0, 4.0, 0, 1.6, 0x8a6a3a, 0x7a5032);
  const [rx, rz] = L.w(0, 0);
  thatchRoof(kit, rx, y0 + S + H, rz, 5.3, 3.6, yaw + Math.PI / 4);
  game.interiorLights?.add(rx, y0 + S + H - 0.2, rz, { color: 0xffc27a, intensity: 6, range: 8, fixture: 'none' });
}

function tikiBar(game, kit, R, x, z, y0) {
  const L = new R.Local(kit, x, z, Math.PI, y0);
  for (const [a, b] of [[-3.5, -2.5], [3.5, -2.5], [-3.5, 2.5], [3.5, 2.5]]) L.cyl(a, 1.6, b, 0.16, 3.2, 0xa77b4a, { seg: 6 });
  const [rx, rz] = L.w(0, 0);
  kit.cone(rx, y0 + 4.2, rz, 5.6, 2.2, THATCH, { seg: 6 });
  L.box(0, 0.55, 1.2, 5.5, 1.1, 0.7, 0x8a5a2a);
  L.box(0, 1.14, 1.3, 5.8, 0.08, 0.95, 0xd8a868);
  for (let i = -2; i <= 2; i++) L.deco(i * 0.6, 1.3, 0.9, 0.12, 0.2, 0.12, [0xff5a8a, 0xffd23f, 0x3fe0d0][(i + 2) % 3]);
  L.box(0, 1.6, -1.8, 5, 0.1, 0.5, 0x8a5a2a);
  R.sign('TIKI JUNGLE', ...Object.values(L.v3(0, 3.4, 2.6)), Math.PI, 4, '#2f8a35', '#ffe36a');
  for (const lx of [-1.8, -0.6, 0.6, 1.8]) {
    const p = L.v3(lx, 0, 2.35);
    kit.cyl(p.x, y0 + 0.35, p.z, 0.22, 0.7, 0x8a5a2a, { seg: 8 });
    R.addSeat(game, { body: game.physics.staticBody, pos: [p.x, y0 + 0.92, p.z], yaw: 0, label: 'Sit', hint: 'Y Get up', exit: [p.x, y0 + 1, p.z - 0.9] });
  }
  R.npc('chef', ...Object.values(L.w(0, -0.4)), { yaw: 0, lines: ['Coconut juice?', 'Fresh mango!', 'Aloha!'] });
}

function tikiStatue(kit, R, x, z, yaw, s) {
  const g = R.groundAt(x, z), L = new R.Local(kit, x, z, yaw, g);
  L.box(0, 1.6 * s, 0, 1.5 * s, 3.2 * s, 1.3 * s, 0x8a6a4a);
  L.box(0, 3.5 * s, 0, 1.9 * s, 0.6 * s, 1.5 * s, 0x7a5a3a);
  for (const sx of [-1, 1]) { L.deco(sx * 0.38 * s, 2.5 * s, 0.66 * s, 0.42 * s, 0.32 * s, 0.06, 0xffffff); L.deco(sx * 0.38 * s, 2.5 * s, 0.69 * s, 0.18 * s, 0.18 * s, 0.06, 0x1e1e24); }
  L.deco(0, 1.55 * s, 0.66 * s, 0.9 * s, 0.25 * s, 0.06, 0xffffff);
  L.deco(0, 2.0 * s, 0.75 * s, 0.25 * s, 0.6 * s, 0.25 * s, 0x6b4a2a);
}

function torch(kit, x, z, y) {
  kit.cyl(x, y + 1.0, z, 0.07, 2.0, 0x6b4a2a, { seg: 5, collide: false });
  kit.cyl(x, y + 2.05, z, 0.16, 0.25, 0x5a3a20, { seg: 6, collide: false });
  kit.cone(x, y + 2.4, z, 0.14, 0.45, 0xfff4c2, { seg: 5 });
  (kit.game.lamps ||= []).push([x, y + 2.4, z]);
}

function treehouse(game, kit, R, t) {
  const { x, z, g, y } = t;
  // giant trunk with buttress roots and a big canopy above the deck
  kit.cyl(x, (g + y + 6) / 2, z, 1.0, y + 6 - g + 1, 0x6e5034, { seg: 8, rTop: 0.75 });
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; kit.deco(x + Math.sin(a) * 1.2, g + 1.0, z + Math.cos(a) * 1.2, 0.35, 2.4, 1.8, 0x5e4430, { yaw: a }); }
  const leaf = [0x2f8a35, 0x3d9c3a, 0x267a2e];
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; kit.sphere(x + Math.sin(a) * 3.5, y + 7 + (i % 2), z + Math.cos(a) * 3.5, 4, leaf[i % 3], { scale: [1.2, 0.6, 1.2], seg: 7 }); }
  kit.sphere(x, y + 9, z, 4.5, leaf[1], { scale: [1.3, 0.6, 1.3], seg: 7 });
  // deck + rails (gaps toward the bridges are left by the bridge ends)
  kit.box(x, y - 0.15, z, 7.4, 0.3, 7.4, WOOD, { yaw: 0.0 });
  for (const [ax, az, bx, bz] of [[-3.6, -3.6, -3.6, 3.6], [3.6, -3.6, 3.6, -0.7], [3.6, 0.7, 3.6, 3.6]]) {
    const L = new R.Local(kit, x, z, 0, y);
    L.rail(ax, az, bx, bz, 0, 1.0, 0x6b4a2a);
  }
  for (let i = 0; i < 4; i++) kit.deco(x + (i % 2 ? 3.4 : -3.4), y - 1.4, z + (i < 2 ? 3.4 : -3.4), 0.14, 2.6, 0.14, POST, { euler: [i < 2 ? -0.5 : 0.5, 0, i % 2 ? 0.5 : -0.5] });
  // little hut on the first two
  if (t.i < 2) {
    const L = new R.Local(kit, x - 1.8, z, 0, y);
    L.wall(-1.5, -1.6, -1.5, 1.6, 2.2, 0.12, 0xd8a868, []);
    L.wall(-1.5, 1.6, 0.8, 1.6, 2.2, 0.12, 0xd8a868, [{ at: 1.2, w: 0.9, h: 1.0, sill: 0.9 }]);
    L.wall(-1.5, -1.6, 0.8, -1.6, 2.2, 0.12, 0xd8a868, [{ at: 1.2, w: 0.9, h: 1.0, sill: 0.9 }]);
    kit.cone(x - 1.6, y + 2.9, z, 2.8, 1.6, THATCH, { seg: 4, euler: [0, Math.PI / 4, 0] });
  }
  // ladder up the trunk (east side, toward the village)
  const lx = x + 4.0, lz = z;
  kit.cyl(lx - 0.25, (g + y) / 2, lz, 0.12, y - g, POST, { seg: 5 });
  climb(game, kit, lx, lz, R.groundAt(lx, lz), y, -1, 0);
}
