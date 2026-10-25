// Bigtown neighbourhoods: Brick Row (brownstone row houses + a walk-up with
// a zig-zag fire escape to its roof), Market Street (shops, a walk-in news
// agent and flower shop, a gateway arch), the apartments and Seaside
// Terraces in the south, beach shops and a basketball court.
import { Local, ladder } from '../../common.js';
import { lfurn } from '../../furniture.js';
import { SW, Y } from './layout.js';
import { midrise, rowHouse, shopBox, shopShell, PASTEL, BRICK, WARM, GLASS, billboard, qwall } from './buildings.js';
import { basketballCourt } from './props.js';

const blockOf = ([x0, x1, z0, z1]) => ({ x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });

export function buildDistricts(game, kit, R, blocks) {
  const rnd = R.rng(31);
  const pick = (a) => a[(rnd() * a.length) | 0];
  let fireEscape = false, marketArch = false;
  for (const raw of blocks) {
    const b = blockOf(raw), kind = raw[4];
    switch (kind) {
      case 'rowhouses': {
        // two rows back to back: one facing the avenue to the west, one facing east
        for (const side of [-1, 1]) {
          const L = new Local(kit, b.cx + side * 15, b.cz, side < 0 ? -Math.PI / 2 : Math.PI / 2, SW);
          let lx = -b.d / 2 + 2;
          let n = 0;
          while (lx < b.d / 2 - 8) {
            const w = 7 + ((rnd() * 3) | 0);
            if (!fireEscape && side > 0 && n === 2) { lx += walkUp(game, kit, L, lx, w + 4); fireEscape = true; n++; continue; }
            rowHouse(kit, L, lx + w / 2, w, 12, 3 + (rnd() < 0.4 ? 1 : 0), pick(BRICK), 0xf2ead8, pick([0x2a62c9, 0x3a8a4a, 0xc8343c, 0x2a2a33, 0xffd23f]));
            lx += w + 0.05; n++;
          }
        }
        break;
      }
      case 'terraces': {
        const L = new Local(kit, b.cx, b.cz + (b.d > 40 ? 6 : 0), 0, SW);
        let lx = -b.w / 2 + 2;
        while (lx < b.w / 2 - 7) {
          const w = 7 + ((rnd() * 2) | 0);
          rowHouse(kit, L, lx + w / 2, w, 10, 2, pick(PASTEL), 0xffffff, pick([0x2a62c9, 0xff5a8a, 0x3a8a4a]));
          lx += w + 0.05;
        }
        for (let x = b.x0 + 6; x < b.x1 - 4; x += 12) kit.tree(x, b.z0 + 4, SW, 0, 0.8);
        break;
      }
      case 'shops': {
        const names = b.cx < 800 ? ['BAKERY', 'CAFE', 'GYM'] : ['POST', 'HOT DOGS'];
        const cols = ['#ff8a3d', '#8a5a3a', '#3f8cff', '#ff7fc8', '#2bc4c4', '#c8343c'];
        const n = b.w > 50 ? 3 : 2, w = b.w / n - 2;
        names.slice(0, n).forEach((nm, i) => shopBox(game, kit, b.x0 + (i + 0.5) * (b.w / n), b.z1 - 9, 0, nm, cols[(i + (b.cx > 800 ? 3 : 0)) % cols.length],
          { w, d: 12, wall: pick(PASTEL), upper: 1 + ((rnd() * 2) | 0) }));
        midrise(game, kit, b.cx, b.z0 + 10, Math.PI, b.w - 6, 16, 4 + ((rnd() * 3) | 0), { wall: pick(BRICK), trim: 0xf2ead8 });
        break;
      }
      case 'market': {
        // shops on both sides of the block: the south row faces Market Street, the north row Bridge Street
        const N = b.cx < 820 ? [['PIZZA', '#e8322b'], ['NEWS', '#222228', true], ['TOYS', '#ff8a3d']]
          : b.cx < 890 ? [['BURGERS', '#ff8a3d'], ['FLOWERS', '#ff6fae', true], ['BOOKS', '#8a5a3a']]
            : [['ARCADE', '#b46cff'], ['CANDY', '#ff7fc8'], ['DRINKS', '#3f8cff']];
        const w = b.w / 3 - 1.5;
        N.forEach(([nm, col, walkIn], i) => {
          const x = b.x0 + (i + 0.5) * (b.w / 3);
          if (walkIn) walkInShop(game, kit, R, x, b.z1 - 9, nm, col, w);
          else shopBox(game, kit, x, b.z1 - 9, 0, nm, col, { w, d: 11, wall: pick(PASTEL), upper: 1 + ((rnd() * 2) | 0) });
          shopBox(game, kit, x, b.z0 + 9, Math.PI, '', col, { w, d: 11, wall: pick(PASTEL), upper: 2 });
        });
        // market stalls in the middle
        for (let i = 0; i < 4; i++) stall(kit, b.x0 + 9 + i * 13, b.cz, rnd);
        if (!marketArch) { marketArch = true; arch(game, kit, R, 770, 180); }
        break;
      }
      case 'apartments': {
        const floors = 6 + ((rnd() * 4) | 0);
        midrise(game, kit, b.cx, b.cz - 3, 0, b.w - 8, 20, floors, { wall: pick([...PASTEL, ...BRICK]), trim: 0xffffff, glass: WARM, roof: 'water' });
        // balconies on the front
        const L = new Local(kit, b.cx, b.cz - 3, 0, SW);
        for (let f = 1; f < floors; f++) for (const lx of [-(b.w - 8) / 4, (b.w - 8) / 4]) {
          L.box(lx, f * 3.2 + 0.1, 10.7, 4, 0.2, 1.4, 0xdddddd);
          L.deco(lx, f * 3.2 + 0.6, 11.35, 4, 0.8, 0.08, 0xffffff);
        }
        for (let x = b.x0 + 5; x < b.x1 - 3; x += 10) kit.bush(x, b.z1 - 3, SW, 0.8);
        break;
      }
      case 'beachshops': {
        shopBox(game, kit, b.cx - 12, b.cz, -Math.PI / 2, 'ICE CREAM', '#ff7fc8', { w: 14, d: 10, wall: 0xfff0f6 });
        shopBox(game, kit, b.cx + 10, b.cz + 6, Math.PI / 2, 'SURF SHACK', '#2bc4c4', { w: 12, d: 9, wall: 0xf2e4c0 });
        billboard(game, kit, b.cx + 10, SW, b.cz - 14, Math.PI / 2, 'WOBBLE COLA', '#e8322b', '#ffffff', 12, 6);
        break;
      }
      case 'court': basketballCourt(game, kit, R, b.cx, b.cz); break;
    }
  }
}

// A five-storey walk-up with a zig-zag fire escape on its front up to the roof.
// Takes `w` metres of the row; returns the width used.
function walkUp(game, kit, L, lx, w) {
  const F = 3.2, floors = 6, h = floors * F + 0.6, d = 12;
  const cx = lx + w / 2;
  L.box(cx, h / 2, 0, w, h, d, 0x8a4a3a);
  L.deco(cx, h - 0.2, 0, w + 0.4, 0.5, d + 0.4, 0xf2ead8);
  for (let f = 0; f < floors; f++) for (const k of [-1, 1]) {
    qwall(L, cx + k * w * 0.28, f * F + 1.7, d / 2 + 0.03, 0, 1.2, 1.6, WARM);
    qwall(L, cx + k * w * 0.28, f * F + 1.7, -d / 2 - 0.03, Math.PI, 1.2, 1.6, WARM);
  }
  L.deco(cx, 1.2, d / 2 + 0.05, 1.4, 2.4, 0.1, 0x2a2a33);
  // fire escape: a landing along the wall at every floor (inner lane) and the flights on
  // the outer lane, all climbing the same way: at each landing walk back to the next flight
  const stair = 0x2a2e36, lz = d / 2 + 0.5, fz = d / 2 + 1.45;
  for (let f = 1; f <= floors; f++) {
    const y = f * F;
    L.box(cx + 0.05, y - 0.06, lz, w + 0.1, 0.12, 1.0, stair);
    L.rail(cx - w / 2 + 0.5, fz + 0.5, cx + w / 2 - 0.5, fz + 0.5, y, 1.0, stair);
  }
  { const p0 = L.v3(cx - w / 2 + 1.0, 0, fz), p1 = L.v3(cx + w / 2 - 1.0, 0, fz); game.cityFireEscape = { a: p0, b: p1, top: L.y0 + h }; }
  for (let f = 0; f < floors; f++) L.stairs(cx - w / 2 + 1.0, fz, f * F, cx + w / 2 - 1.0, fz, (f + 1) * F, 0.9, stair, stair, 0.32);
  // a small platform at the top of each flight (then step across to the landing and walk back)
  for (let f = 1; f <= floors; f++) {
    L.box(cx + w / 2 - 0.45, f * F - 0.06, fz, 1.1, 0.12, 0.95, stair);
    L.rail(cx + w / 2, fz - 0.5, cx + w / 2, fz + 0.5, f * F, 1.0, stair);
  }
  // roof access: a ladder from the top landing over the parapet
  const [lx2, lz2] = L.w(cx + w / 2 - 1.2, d / 2 + 0.02);
  const n = { x: -Math.sin(L.yaw), z: -Math.cos(L.yaw) }; // into the building
  ladder(game, lx2, lz2, L.y0 + floors * F, L.y0 + h + 0.3, n.x, n.z);
  L.deco(cx + w / 2 - 1.2, floors * F + (h - floors * F) / 2 + 0.3, d / 2 + 0.12, 0.6, h - floors * F + 0.8, 0.08, 0x8a8f96);
  // roof: a little garden, a deck chair, coins and a present
  L.box(cx, h + 0.4, d / 2 - 0.1, w, 0.8, 0.2, 0x7a3a2a); L.box(cx, h + 0.4, -d / 2 + 0.1, w, 0.8, 0.2, 0x7a3a2a);
  const [rx, rz] = L.w(cx, 0);
  kit.box(rx, L.y0 + h + 0.3, rz, 3, 0.6, 1.4, 0x8a6a4a);
  kit.bush(rx, rz, L.y0 + h + 0.5, 0.7);
  const R = game.cityR;
  R?.coins(rx, rz + 0, L.y0 + h + 3, 'ring', 5, 2.6);
  R?.present('city-fire-escape', 'pants:Brick red', ...L.w(cx - w / 4, -2), L.y0 + h + 3, 'on the Brick Row walk-up roof (up the fire escape)');
  return w + 0.05;
}

// Walk-in shop with shelves/racks and a till.
function walkInShop(game, kit, R, x, z, name, color, w) {
  const L = shopShell(game, kit, x, z, 0, name, color, { w, d: 11, h: 4.8, wall: name === 'NEWS' ? 0xf2f2e6 : 0xffe0ee });
  L.box(-w / 2 + 2.5, 0.55, -3.5, 3.5, 1.1, 0.8, 0x6b4a2a);
  if (name === 'NEWS') {
    for (const lz of [-1.5, 1.2]) { L.box(1.5, 0.7, lz, 4, 1.4, 0.8, 0x8a5a3a); for (let i = 0; i < 6; i++) L.deco(-0.2 + i * 0.68, 1.42, lz, 0.5, 0.04, 0.6, [0xffffff, 0xffe0a0, 0xd8e8ff][i % 3]); }
    lfurn(game, L, 'box', 4, 0, 3.5, 0.3, 0xf2f2f2, 0.5);
  } else {
    for (const [lx, lz] of [[1, -2], [3, -2], [1, 1.5], [3, 1.5]]) { L.box(lx, 0.4, lz, 1.2, 0.8, 1.2, 0x6b4a2a); L.sphere(lx, 1.1, lz, 0.5, [0xff6fae, 0xffd23f, 0xb46cff, 0xff8a3d][(lx + lz + 4) % 4 | 0]); }
    lfurn(game, L, 'plant', -w / 2 + 1, 0, 3.8);
  }
}

function stall(kit, x, z, rnd) {
  const c = [0xff5a5a, 0x3f8cff, 0x55d85a, 0xffd23f][(rnd() * 4) | 0];
  kit.box(x, SW + 0.5, z, 3.2, 1.0, 1.6, 0x9a6a42);
  for (let i = 0; i < 5; i++) kit.sphere(x - 1.2 + i * 0.6, SW + 1.15, z, 0.24, [0xff3a3a, 0xffa020, 0x7ad04a, 0xffe040, 0xb46cff][(i + (rnd() * 5 | 0)) % 5]);
  for (const k of [-1, 1]) for (const j of [-1, 1]) kit.cyl(x + k * 1.5, SW + 1.3, z + j * 0.75, 0.05, 2.6, 0xdddddd, { collide: false, seg: 6 });
  kit.box(x, SW + 2.7, z, 3.6, 0.12, 2.2, c, { euler: [0.12, 0, 0] });
}

// Gateway arch over Market Street at an avenue crossing (x, z = street centre).
function arch(game, kit, R, x0, z) {
  const x = x0 + 30;
  for (const s of [-1, 1]) {
    kit.box(x, SW + 3.5, z + s * 7.2, 1.2, 7, 1.2, 0xff8a3d);
    kit.box(x, Y + 0.3, z + s * 7.2, 1.6, 0.6, 1.6, 0xc85a1a);
  }
  kit.box(x, SW + 7.6, z, 1.4, 1.2, 16, 0xff8a3d);
  R.sign('MARKET STREET', x + 0.72, SW + 7.6, z, Math.PI / 2, 10, '#ff8a3d', '#ffffff');
  R.sign('MARKET STREET', x - 0.72, SW + 7.6, z, -Math.PI / 2, 10, '#ff8a3d', '#ffffff');
}
