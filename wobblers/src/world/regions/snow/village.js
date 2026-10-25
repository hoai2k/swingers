// The ski village (y = 8) and the fishing hamlet by the ferry dock.
// Chalets you can walk into (hinged doors, a crackling fireplace, armchairs, a
// hot-cocoa counter), an outdoor cocoa kiosk, a sled-hire hut with sleds, a big
// decorated tree, lamps, benches and trodden snow paths.
import { GLOW } from '../../../mesh.js';
import { shell } from '../../interiors.js';
import { lfurn } from '../../furniture.js';
import { startEmote } from '../../../emotes.js';
import { VILLAGE, LIFT, HAMLET } from './layout.js';

export const FIRE = 0xffa53a, EMBER = 0xff6a2a, WARM = 0xffd98a, FAIRY = 0xfff07a;
GLOW.set(FIRE, 2); GLOW.set(EMBER, 2); GLOW.set(WARM, 1); GLOW.set(FAIRY, 2);
const WOOD = 0x9a6a42, WOOD2 = 0x7a5032, LOG = 0x8a5a36, STONE = 0x8a8f96, SNOW = 0xf6f9ff, RED = 0xc8343c;

// Gable roof along the frame's local x, ridge at lz = 0, with a snow blanket.
export function gableRoof(L, w, d, y, rise, color = RED, over = 0.7) {
  const k = L.kit;
  for (const s of [-1, 1]) {
    const [x, z] = L.w(0, -s * (d / 4 + over / 2));
    k.wedge(x, L.y0 + y, z, w + over * 2, d / 2 + over, rise, color, { yaw: L.yaw + (s > 0 ? 0 : Math.PI) });
    k.wedge(x, L.y0 + y + 0.18, z, w + over * 2 - 0.2, d / 2 + over - 0.15, rise, SNOW, { yaw: L.yaw + (s > 0 ? 0 : Math.PI), collide: false });
  }
}

// Fireplace against a wall (local frame: back of the hearth toward -z).
export function fireplace(game, L, lx, lz, lyaw = 0) {
  const F = new L.constructor(L.kit, ...L.w(lx, lz), L.yaw + lyaw, L.y0);
  F.box(0, 0.15, 0.25, 2.4, 0.3, 1.0, STONE);                 // hearth
  F.box(-0.95, 0.9, 0, 0.5, 1.5, 0.8, STONE); F.box(0.95, 0.9, 0, 0.5, 1.5, 0.8, STONE);
  F.box(0, 1.85, 0, 2.4, 0.5, 0.85, STONE);
  F.box(0, 1.1, -0.35, 1.5, 1.7, 0.12, 0x2a2a30);              // sooty back
  F.box(0, 2.15, 0.1, 2.6, 0.12, 1.05, WOOD2);                  // mantel
  F.box(0, 3.2, -0.05, 1.2, 2.0, 0.7, STONE);                   // chimney breast
  for (const [x, r] of [[-0.25, 0.4], [0.25, -0.4]]) F.cyl(x, 0.42, 0.05, 0.09, 0.9, LOG, { euler: [0, r, Math.PI / 2], collide: false, seg: 7 });
  F.kit.cone(...(() => { const p = F.v3(0, 0.75, 0.05); return [p.x, p.y, p.z]; })(), 0.32, 0.7, FIRE, { seg: 7 });
  F.kit.cone(...(() => { const p = F.v3(-0.18, 0.65, 0.1); return [p.x, p.y, p.z]; })(), 0.18, 0.45, EMBER, { seg: 6 });
  F.kit.cone(...(() => { const p = F.v3(0.2, 0.62, 0.0); return [p.x, p.y, p.z]; })(), 0.16, 0.4, EMBER, { seg: 6 });
  for (const x of [-0.7, 0, 0.7]) F.cyl(x, 2.32, 0.15, 0.06, 0.22, [0xff5a5a, 0xffd23f, 0x55d85a][(x * 10 + 7) % 3 | 0], { collide: false, seg: 6 }); // stockings-ish candles
  const p = F.v3(0, 1.0, 0.9);
  game.interiorLights.add(p.x, p.y, p.z, { color: 0xff9a4a, intensity: 6, range: 9, fixture: 'none' });
}

function cocoa(game, R, x, y, z) {
  R.common.useSpot(game, x, y, z, 'Hot cocoa (2 coins)', (p) => {
    if (game.wallet && !game.wallet.spend(2, p, 'Hot cocoa')) { game.ui?.toast?.('Hot cocoa costs 2 coins', p.color); return; }
    R.common.chime(game, { x, y, z }, [76, 79, 84], 0.15);
    game.ui?.toast?.('Mmm, hot cocoa with marshmallows! Toasty warm.', p.color);
    startEmote(p, 'cheer');
  });
}

// An enterable chalet: log walls, warm windows, a gable roof with snow, a
// chimney, a fireplace inside, armchairs and a rug.
export function chalet(game, kit, R, x, z, yaw, o = {}) {
  const w = o.w || 9, d = o.d || 7, h = 3.4, y = o.y ?? VILLAGE.y;
  const L = new R.Local(kit, x, z, yaw, y);
  shell(game, L, { w, d, h, wall: o.wall || WOOD, floor: 0xc8a070, roofColor: WOOD2, door: { lx: o.doorX ?? -w / 4, w: 1.3, h: 2.3, color: 0x6a3a22 },
    windows: [{ side: 'f', at: w / 4, y: 1.7, w: 1.6, h: 1.1, glass: WARM }, { side: 'l', at: 0, y: 1.7, w: 1.4, h: 1.0, glass: WARM }, { side: 'r', at: 0, y: 1.7, w: 1.4, h: 1.0, glass: WARM }],
    lights: [[0, 0, { color: 0xffd8a0, intensity: 5, range: 8 }]] });
  // log-cabin stripes on the outside
  for (let i = 0; i < 6; i++) L.deco(0, 0.35 + i * 0.55, d / 2 + 0.01, w + 0.05, 0.08, 0.06, WOOD2);
  gableRoof(L, w, d, h - 0.05, 2.0, o.roof || RED);
  L.box(w / 2 - 1.4, h + 1.6, -1.0, 0.9, 2.4, 0.9, STONE);     // chimney
  L.box(w / 2 - 1.4, h + 2.85, -1.0, 1.0, 0.15, 1.0, SNOW, { collide: false });
  // inside
  fireplace(game, L, w / 2 - 1.4, -d / 2 + 0.68, 0);
  L.deco(0.6, 0.07, 0.2, 3.2, 0.02, 2.2, o.rug || 0xc8343c);
  lfurn(game, L, 'armchair', 0.2, 0.06, 0.4, Math.PI * 0.85, o.chair || 0x3f8cff);
  lfurn(game, L, 'armchair', 2.4, 0.06, 0.6, -Math.PI * 0.85, o.chair2 || 0x55d85a);
  if (o.extra) o.extra(L, w, d, h);
  // porch with a bench and a lantern
  L.box(0, 0.12, d / 2 + 1.0, w, 0.24, 2.0, WOOD2);
  const [bx, bz] = L.w(w / 4 + 0.4, d / 2 + 1.45);
  kit.bench(bx, bz, yaw + Math.PI, y + 0.24);
  return L;
}

export function buildVillage(game, kit, R) {
  const y = VILLAGE.y;
  R.welcomeSign(40, -760, 0);

  // ---- the ski lodge (big chalet) with a cocoa counter inside
  chalet(game, kit, R, -8, -815, 0, { w: 14, d: 9, wall: 0xa87048, roof: 0xb02a2a, doorX: -2.5, chair: 0xff8a3d, chair2: 0x8a5a36,
    extra: (L, w, d) => {
      L.box(-w / 2 + 1.0, 0.55, -1.0, 1.2, 1.1, 4.5, WOOD2);               // counter along the left wall
      L.deco(-w / 2 + 1.0, 1.12, -1.0, 1.3, 0.05, 4.6, 0xd8c8a8);
      for (const k of [-2.6, -1.6, -0.6, 0.4]) { L.cyl(-w / 2 + 1.0, 1.2, k, 0.07, 0.14, [0xffffff, 0xff5a5a, 0x3f8cff, 0xffd23f][(k + 3) | 0 % 4], { collide: false, seg: 8 }); }
      L.box(-w / 2 + 0.4, 1.4, -1.0, 0.5, 0.6, 0.6, 0xc0c4cc);            // cocoa urn
      const p = L.v3(-w / 2 + 2.1, 0.9, -1.0);
      cocoa(game, R, p.x, p.y, p.z);
      lfurn(game, L, 'table', -1.0, 0.06, 2.4, 0, 0x8a5a36);
      lfurn(game, L, 'stool', -2.0, 0.06, 2.4, 0, 0xc8343c);
      lfurn(game, L, 'stool', 0.0, 0.06, 2.4, 0, 0xc8343c);
      L.box(0, 3.5, d / 2 + 0.2, 4, 0.6, 0.1, WOOD2, { collide: false });
    } });
  R.sign('SKI LODGE', -8, y + 4.6, -810.2, 0, 5, '#b02a2a', '#ffffff');

  // ---- two cosy chalets to walk into
  chalet(game, kit, R, -32, -776, 0, { roof: 0x3f6aa8, chair: 0xff5a8a, rug: 0x3f6aa8 });
  chalet(game, kit, R, 52, -792, -Math.PI / 2, { wall: 0xb88050, roof: 0x2f7a4a, chair: 0xffd23f, rug: 0x2f7a4a });

  // ---- solid chalets around the edge (just to look at)
  for (const [x, z, yaw, roof] of [[-68, -800, Math.PI / 2, 0xb02a2a], [-66, -772, Math.PI / 2, 0x2f7a4a], [66, -822, -Math.PI / 2, 0x3f6aa8], [40, -824, Math.PI, 0xb02a2a]]) {
    const L = new R.Local(kit, x, z, yaw, y);
    L.box(0, 1.6, 0, 8, 3.2, 6, WOOD);
    for (let i = 0; i < 5; i++) L.deco(0, 0.4 + i * 0.6, 3.01, 8.05, 0.08, 0.06, WOOD2);
    L.deco(-2, 1.7, 3.04, 1.5, 1.1, 0.05, WARM); L.deco(2, 1.7, 3.04, 1.5, 1.1, 0.05, WARM);
    L.deco(0, 1.1, 3.04, 1.2, 2.2, 0.05, 0x6a3a22);
    gableRoof(L, 8, 6, 3.2, 1.8, roof);
    L.box(2.4, 4.6, -0.8, 0.8, 2, 0.8, STONE);
  }

  // ---- hot cocoa kiosk on the plaza (the cocoa seller stands behind it)
  {
    const L = new R.Local(kit, 2, -785.6, 0, y);
    L.box(0, 0.55, 0, 3.2, 1.1, 0.9, WOOD);
    L.deco(0, 1.12, 0, 3.4, 0.06, 1.0, 0xe8d8b8);
    for (const sx of [-1.5, 1.5]) L.cyl(sx, 1.6, -1.2, 0.08, 3.2, WOOD2, { seg: 6 });
    L.box(0, 3.25, -0.9, 3.8, 0.15, 3.0, RED, { euler: [0.18, 0, 0], collide: false }); // (no collider: the seller stands under it)
    L.box(0, 3.45, -0.9, 3.6, 0.12, 2.8, SNOW, { euler: [0.18, 0, 0], collide: false });
    L.box(0, 1.0, -2.3, 3.2, 2.0, 0.2, WOOD);          // back wall with shelves
    for (let i = 0; i < 6; i++) L.sphere(-1.5 + i * 0.6, 2.95, 0.3, 0.07, FAIRY, { seg: 6 });
    for (const k of [-1, -0.4, 0.3, 1.0]) L.cyl(k, 1.22, 0.1, 0.08, 0.15, 0xffffff, { collide: false, seg: 8 });
    L.cyl(1.2, 1.4, -0.3, 0.22, 0.55, 0xc0c4cc, { seg: 10 });
    const p = L.v3(0, 0.9, 0.95);
    cocoa(game, R, p.x, p.y, p.z);
    R.sign('HOT COCOA', 2, y + 3.95, -784.3, 0, 3.6, '#8a4a2a', '#fff4e0');
  }

  // ---- sled hire hut by the bottom of the blue run, with sleds
  {
    const L = new R.Local(kit, 34, -836, Math.PI, y);
    L.box(0, 1.3, 0, 5, 2.6, 3.2, 0xd8d0c8);
    for (let i = 0; i < 5; i++) L.deco(-2 + i, 1.3, -1.62, 0.5, 2.6, 0.04, i % 2 ? 0xffffff : 0xe8322b);
    L.deco(0, 1.5, 1.62, 2.2, 1.0, 0.05, WARM);
    gableRoof(L, 5, 3.2, 2.6, 1.0, 0xe8322b, 0.4);
    R.sign('SLED HIRE', ...(() => { const p = L.v3(0, 3.0, -1.75); return [p.x, p.y, p.z]; })(), 0, 3.6, '#e8322b', '#ffffff');
    for (const [dx, col] of [[-6, 0xe8322b], [-4.6, 0x3f8cff], [-3.2, 0x55d85a]]) R.vehicle('sled', 34 + dx, -841, Math.PI, col);
    for (let i = 0; i < 3; i++) L.cyl(3.2 + i * 0.35, 0.9, 1.4, 0.04, 1.8, 0x3a3f4a, { collide: false, seg: 5 }); // ski poles leaning
  }
  R.vehicle('sled', -22, -836, Math.PI, 0xffd23f);
  // snowmobiles and the snowcat parked at the edge of the village
  R.vehicle('snowmobile', 66, -806, -Math.PI / 2, 0xe8322b);
  R.vehicle('snowmobile', 66, -800, -Math.PI / 2, 0x3f8cff);
  R.vehicle('snowcat', 58, -840, Math.PI * 0.85, 0xd9342b);
  // and at the top station
  R.vehicle('snowmobile', -26, -1092, 0, 0x55d85a);
  R.vehicle('sled', -30, -1083, Math.PI, 0xe8322b);
  R.vehicle('sled', -28, -1083, Math.PI, 0x3f8cff);

  // ---- the big decorated tree on the plaza
  {
    const tx = 24, tz = -772, b = kit.b(tx, tz);
    b.cyl(0.4, 0.5, 2, 0x6a4a32, [tx, y + 1, tz], null, 7);
    [[3.6, 4.2, 3.4], [2.8, 3.6, 5.6], [1.9, 3.0, 7.6], [1.1, 2.2, 9.2]].forEach(([r, hh, cy], i) => {
      b.cone(r, hh, 0x2f7a4a, [tx, y + cy, tz], null, 9);
      b.cone(r * 0.8, hh * 0.45, SNOW, [tx, y + cy + hh * 0.28, tz], null, 9);
      for (let k = 0; k < 8 + i * -1; k++) {
        const a = k / (8 - i) * Math.PI * 2 + i, rr = r * 0.82;
        b.sphere(0.16, [0xff3a3a, 0xffd23f, 0x3f8cff, FAIRY][(k + i) % 4], [tx + Math.cos(a) * rr, y + cy - hh * 0.35, tz + Math.sin(a) * rr], null, 6);
      }
    });
    b.cone(0.45, 0.8, FAIRY, [tx, y + 10.6, tz], null, 5);
    kit.phys.cylinder(tx, y + 2, tz, 0.5, 4, {});
    for (let i = 0; i < 5; i++) { const a = i * 1.3; kit.box(tx + Math.cos(a) * 2.6, y + 0.3, tz + Math.sin(a) * 2.6, 0.6, 0.6, 0.6, [0xff5a8a, 0x3f8cff, 0xffd23f, 0x55d85a, 0xb46cff][i], { yaw: a }); }
  }

  // ---- paths of trodden snow, lamps, benches, fences
  const path = (x0, z0, x1, z1, w = 3.2) => kit.deco((x0 + x1) / 2, y + 0.03, (z0 + z1) / 2, w, 0.05, Math.hypot(x1 - x0, z1 - z0), 0xdedad8, { yaw: Math.atan2(x1 - x0, z1 - z0) });
  path(72, -752, 30, -778); path(30, -778, -30, -790); path(-30, -790, -50, -826); path(2, -790, -6, -809); path(30, -778, 34, -832); path(-30, -790, -31, -771);
  for (const [x, z] of [[60, -760], [40, -772], [16, -781], [-14, -790], [-40, -805], [-46, -824], [10, -800], [28, -805], [-22, -770], [36, -815]]) kit.lamp(x, z, y);
  for (const [x, z, yaw] of [[12, -778, 0], [-4, -778, 0], [44, -770, -0.6], [-18, -800, Math.PI / 2]]) kit.bench(x, z, yaw, y);
  kit.fence(-80, -846, -58, -846, 0x7a5032, 1.0, y); kit.fence(-40, -846, -10, -846, 0x7a5032, 1.0, y); kit.fence(40, -846, 78, -846, 0x7a5032, 1.0, y);
  // ski racks and a trail map board
  for (const [x, z] of [[-14, -808], [20, -846]]) {
    kit.box(x, y + 0.6, z, 3, 0.08, 0.3, WOOD2, { collide: false });
    for (let i = 0; i < 6; i++) kit.box(x - 1.25 + i * 0.5, y + 0.85, z, 0.09, 1.7, 0.03, [0xff3a3a, 0x3f8cff, 0xffd23f][i % 3], { collide: false, euler: [0.15, 0, 0] });
  }
  kit.box(-40, y + 1.8, -828, 3, 2, 0.15, 0x2a62c9, { yaw: 0.3 });
  kit.box(-40.05 + Math.sin(0.3) * 0.09, y + 1.8, -827.9 + Math.cos(0.3) * 0.09, 2.7, 1.7, 0.02, SNOW, { yaw: 0.3, collide: false });
  kit.box(-40.05 + Math.sin(0.3) * 0.1, y + 1.8, -827.9 + Math.cos(0.3) * 0.1, 0.12, 1.5, 0.02, 0x2a62c9, { yaw: 0.3 + 0.0, collide: false, euler: [0, 0.3, 0.6] });
  for (const s of [-1, 1]) kit.cyl(-40 + s * 1.4 * Math.cos(0.3), y + 0.9, -828 - s * 1.4 * Math.sin(0.3), 0.07, 1.8, WOOD2, { seg: 6 });
  R.label('Ski Lodge', -8, -822);
}

// ---- Fisher's Cove: huts, the tackle shop, a jetty with a boat, drying racks
export function buildHamlet(game, kit, R) {
  const H = HAMLET, y = H.y;
  const hut = (x, z, yaw, wall, roof, w = 5, d = 4) => {
    const L = new R.Local(kit, x, z, yaw, y);
    L.box(0, 1.25, 0, w, 2.5, d, wall);
    for (let i = 0; i < 4; i++) L.deco(0, 0.35 + i * 0.6, d / 2 + 0.01, w + 0.04, 0.07, 0.05, 0xffffff);
    L.deco(-w / 4, 1.1, d / 2 + 0.03, 1.0, 2.0, 0.05, 0x6a3a22);
    L.deco(w / 4, 1.5, d / 2 + 0.03, 1.1, 0.9, 0.05, WARM);
    gableRoof(L, w, d, 2.5, 1.3, roof, 0.4);
    return L;
  };
  hut(104, -786, 0, 0x3f8cff, 0xffffff);
  hut(116, -788, 0, 0xffd23f, 0xc8343c, 4.4, 3.6);
  const shop = hut(134, -780, -Math.PI / 2, 0x2ab5a5, 0xffffff, 6, 4.6);
  R.sign('TACKLE SHOP', ...(() => { const p = shop.v3(0, 3.0, 2.45); return [p.x, p.y, p.z]; })(), shop.yaw, 4.2, '#2a8a8a', '#ffffff');
  // counter out front with buckets of fish
  { const p = shop.v3(1.2, 0.5, 3.4); kit.box(p.x, y + 0.5, p.z, 1.0, 1.0, 2.4, WOOD2, { yaw: shop.yaw });
    for (const k of [-0.7, 0.1, 0.8]) { const q = shop.v3(1.2 + k * 0.1, 1.15, 3.4 + k); kit.cyl(q.x, q.y, q.z, 0.22, 0.3, 0x8a8f96, { collide: false, seg: 8 }); kit.sphere(q.x, q.y + 0.15, q.z, 0.16, 0x9fb4c8, { scale: [1.5, 0.5, 0.8], seg: 6 }); } }
  // drying racks with fish
  for (const [x, z] of [[110, -770], [124, -768]]) {
    for (const s of [-1, 1]) kit.cyl(x + s * 1.6, y + 1, z, 0.06, 2, WOOD2, { seg: 6 });
    kit.box(x, y + 1.9, z, 3.4, 0.06, 0.06, WOOD2, { collide: false });
    for (let i = 0; i < 6; i++) kit.sphere(x - 1.25 + i * 0.5, y + 1.55, z, 0.18, i % 2 ? 0xa8b8c8 : 0xd8a868, { scale: [0.45, 1.5, 0.25], seg: 6 });
  }
  // crates, barrels, nets, an upturned rowing boat
  for (const [x, z, s] of [[100, -778, 0.9], [101.2, -777.4, 0.7], [128, -762, 0.8], [129, -763, 0.6]]) kit.box(x, y + s / 2, z, s, s, s, 0xb98a5a, { yaw: x });
  for (const [x, z] of [[107, -776], [138, -770]]) kit.cyl(x, y + 0.5, z, 0.4, 1.0, 0x7a5032, { seg: 10 });
  kit.sphere(118, y + 0.3, -776, 1.2, 0x5a8aa8, { scale: [1.0, 0.35, 2.0], seg: 8 });
  kit.deco(96.5, y + 0.03, -772, 3, 0.05, 2.5, 0x6a7a5a);
  // jetty out to sea with a fishing boat alongside
  const jx = 128, z0 = H.z1 - 1, z1 = H.z1 + 22;
  kit.box(jx, 1.55, (z0 + z1) / 2, 2.6, 0.25, z1 - z0, 0xb98a5a);
  for (let z = z0 + 2; z < z1; z += 4) for (const s of [-1, 1]) { const g = Math.max(R.groundAt(jx + s * 1.2, z), -9); if (g < 1.1) kit.cyl(jx + s * 1.2, (1.6 + g) / 2, z, 0.14, 1.6 - g, WOOD2, { seg: 6 }); }
  R.vehicle('boat', jx + 3.6, z1 - 4, 0, 0x2a8a8a);
  for (const x of [jx - 1.2, jx + 1.2]) kit.box(x, 2.0, (z0 + z1) / 2, 0.08, 0.08, z1 - z0, WOOD2, { collide: false });
  kit.lamp(jx - 1.0, z1 - 1, 1.55);
}
