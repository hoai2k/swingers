// Life-sim buildings: the four shops on the north-east town block (CLOTHES,
// PET SHOP, HOMES — the estate agent — and CAR DEALER), each with a till you
// press Y at, and the homes you can buy: three enterable bungalows in the
// suburbs plus the two-storey house by the town hall (interiors.js calls
// homeFixtures for it). A home has a name plate over the door and on a garden
// board (FOR SALE + price, or the owner's colour and name), a bed (sleep:
// skip to morning or evening) and a wardrobe (opens the customiser); owning
// one makes it your respawn point.
//
//   game.homes.list / ownerOf(id) / homeOf(player) / buy(player, id) / goHome(player) / spawnFor(player)
import * as THREE from 'three';
import { Builder } from '../mesh.js';
import { PLAYER_COLORS, PLAYER_CSS } from '../config.js';
import { Local, useSpot, chime } from './common.js';
import { shell, shopFront } from './interiors.js';
import { lfurn } from './furniture.js';
import { poster } from './posters.js';
import { buildExtraHat } from '../hats.js';
import { life, saveLife } from '../life/state.js';
import { petModel, idleAnim, PET_ORDER } from '../life/pets.js';

// Shops that replace the second copy of BURGERS / PIZZA / ICE CREAM / TOYS on the NE block (town.js).
export const LIFE_SHOPS = [['CLOTHES', '#ff6fae', 'clothes'], ['PET SHOP', '#3fa9e0', 'pets'], ['HOMES', '#3a9a4a', 'homes'], ['CAR DEALER', '#ff8a3d', 'cars']];

// Homes for sale. Bungalows are placed by town.js (house() with opts.home = id).
export const HOME_DEFS = {
  maple: { name: 'Maple Cottage', note: 'east avenue, near the playground', price: 250 },
  acorn: { name: 'Acorn Bungalow', note: 'north avenue, close to the beach road', price: 300 },
  sunny: { name: 'Sunny Bungalow', note: 'west avenue, by the stunt park', price: 350 },
  townhouse: { name: 'Town House', note: 'two floors and a piano, by the town hall', price: 600 },
};
export const HOME_ORDER = ['maple', 'acorn', 'sunny', 'townhouse'];

const T = 0.25;
const SKIN = 0xffd9b8;

// ---- shops --------------------------------------------------------------------
// A shopkeeper: a static wobbly bean behind the till.
function keeper(L, lx, lz, shirt, ly = 0) {
  L.sphere(lx, 0.55, lz, 0.32, shirt, { scale: [1, 1.35, 0.9] });
  L.sphere(lx, 1.2, lz, 0.25, SKIN);
  const [ex, ez] = [Math.sin(L.yaw + ly), Math.cos(L.yaw + ly)];
  for (const s of [-1, 1]) {
    const ox = Math.cos(L.yaw + ly) * s * 0.08, oz = -Math.sin(L.yaw + ly) * s * 0.08;
    const [wx, wz] = L.w(lx, lz);
    L.kit.sphere(wx + ex * 0.22 + ox, L.y0 + 1.25, wz + ez * 0.22 + oz, 0.035, 0x16161e);
  }
}

export function till(game, L, lx, lz, color, shopId, label) { // also world/gadgetshop.js
  L.box(lx, 0.55, lz, 3.4, 1.1, 0.8, color);
  L.deco(lx, 1.13, lz, 3.5, 0.06, 0.9, 0xffffff);
  L.box(lx + 1.0, 1.35, lz - 0.05, 0.5, 0.36, 0.4, 0x444a5a); // cash register
  L.deco(lx + 1.0, 1.58, lz + 0.1, 0.36, 0.12, 0.05, 0x7aff9a);
  keeper(L, lx - 0.4, lz - 0.9, new THREE.Color(color).getHex());
  const p = L.v3(lx, 1.0, lz + 0.9);
  const spot = useSpot(game, p.x, p.y, p.z, label, (pl) => game.ui?.openShop?.(pl, shopId));
  spot.shop = shopId;
  return spot;
}

function rack(L, lx, lz, ly, cols) {
  const c = Math.cos(ly), s = Math.sin(ly), P = (a) => [lx + a * c, lz - a * s];
  for (const a of [-1.1, 1.1]) { const [x, z] = P(a); L.box(x, 0.8, z, 0.06, 1.6, 0.06, 0x888888); }
  L.deco(lx, 1.55, lz, 2.3, 0.05, 0.05, 0x999999, { yaw: ly });
  cols.forEach((col, i) => { const [x, z] = P(-0.9 + i * (1.8 / (cols.length - 1))); L.deco(x, 1.2, z, 0.08, 0.6, 0.42, col, { yaw: ly }); });
}

function mannequin(game, L, lx, lz, hat, shirt) {
  L.box(lx, 0.05, lz, 0.5, 0.1, 0.5, 0x666666);
  L.cyl(lx, 0.35, lz, 0.03, 0.6, 0x888888, { collide: false });
  L.sphere(lx, 0.95, lz, 0.25, shirt, { scale: [1, 1.3, 0.85] });
  L.sphere(lx, 1.45, lz, 0.2, 0xf2f2f2);
  const b = new Builder(), g = new THREE.Group(), R = 0.2;
  if (buildExtraHat(b, hat, R, shirt, g)) {
    g.add(b.mesh());
    const p = L.v3(lx, 1.45, lz);
    g.position.set(p.x, p.y, p.z); g.rotation.y = L.yaw;
    game.scene.add(g);
  }
}

const SHOP_INSIDES = {
  clothes(game, L, w, d) {
    const bz = -d / 2 + T;
    till(game, L, 3.0, bz + 1.0, 0xff6fae, 'clothes', 'Shop clothes');
    rack(L, -3.6, 1.2, 0, [0xff5a5a, 0x3f8cff, 0x55d85a, 0xffd23f, 0xb46cff]);
    rack(L, -3.6, -1.6, 0, [0x9be03a, 0x22305a, 0x2ab5a5, 0xc9a6ff, 0xf2e4c0]);
    mannequin(game, L, 0.4, 2.6, 'sombrero', 0xff8a3d);
    mannequin(game, L, 1.6, 2.6, 'beret', 0x3f8cff);
    mannequin(game, L, 2.8, 2.6, 'frog', 0x55d85a);
    mannequin(game, L, -0.8, -3.6, 'tiara', 0xff6fae);
    // mirror and changing booth
    L.deco(w / 2 - T - 0.04, 1.4, 0.8, 0.04, 2.0, 1.0, 0xcfe9ff);
    L.deco(w / 2 - T - 0.06, 1.4, 0.8, 0.04, 2.15, 1.15, 0xffffff);
    L.box(w / 2 - 1.2, 1.2, -1.6, 1.6, 2.4, 0.08, 0xff9ac8); L.box(w / 2 - 2.0, 1.2, -2.5, 0.08, 2.4, 1.8, 0xff9ac8);
    poster(game, L, 'clothes_fashion', -w / 2 + T + 0.04, 2.4, 0, Math.PI / 2, 1.0, 1.4, { bg: '#ff6fae', title: 'NEW', sub: 'LOOKS', blob: '#ffd23f' });
    lfurn(game, L, 'plant', -w / 2 + 0.7, 0, d / 2 - 0.8);
  },
  pets(game, L, w, d) {
    const bz = -d / 2 + T;
    till(game, L, 3.0, bz + 1.0, 0x3fa9e0, 'pets', 'Adopt a pet');
    // four little pens with a pet in each
    PET_ORDER.forEach((kind, i) => {
      const lx = -4.6 + i * 2.0, lz = -2.6;
      L.box(lx, 0.25, lz + 0.8, 1.7, 0.5, 0.08, 0xffffff); L.box(lx - 0.85, 0.25, lz, 0.08, 0.5, 1.6, 0xffffff); L.box(lx + 0.85, 0.25, lz, 0.08, 0.5, 1.6, 0xffffff);
      L.deco(lx, 0.07, lz, 1.6, 0.02, 1.5, [0xffe2a8, 0xd6ecff, 0xe2ffd6, 0xcfe9ff][i]);
      L.sphere(lx + 0.4, 0.08, lz - 0.4, 0.3, 0xff8a8a, { scale: [1, 0.25, 1] }); // pet bed
      const m = petModel(kind), p = L.v3(lx, 0.07 + (kind === 'penguin' ? 0.22 : { dog: 0.24, cat: 0.21, bunny: 0.2 }[kind]), lz);
      m.position.set(p.x, p.y, p.z); m.rotation.y = L.yaw + 0.3;
      game.scene.add(m);
      game.updaters.push((dt, t) => { if (m.visible) idleAnim(m.userData.looks, t, i * 1.7); });
    });
    // fish tank on the right wall
    const fx = w / 2 - T - 0.45;
    L.box(fx, 0.45, 0.8, 0.8, 0.9, 2.6, 0x6b4a2a);
    L.deco(fx, 1.35, 0.8, 0.7, 0.9, 2.5, 0x7ad0ff);
    for (let i = 0; i < 5; i++) L.deco(fx, 1.2 + (i % 3) * 0.2, -0.2 + i * 0.5, 0.06, 0.1, 0.18, [0xff8a3d, 0xffd23f, 0xff5a8a][i % 3]);
    // food sacks
    for (let i = 0; i < 3; i++) L.box(-w / 2 + 0.8, 0.3, 1.2 + i * 0.7, 0.6, 0.6, 0.5, [0xd9824a, 0x55d85a, 0x3f8cff][i], { round: 0.1 });
    poster(game, L, 'pets_adopt', -w / 2 + T + 0.04, 2.6, 3.4, Math.PI / 2, 1.0, 1.4, { bg: '#3fa9e0', title: 'ADOPT', sub: 'A PAL!', blob: '#c8955a' });
    lfurn(game, L, 'plant', w / 2 - 0.7, 0, d / 2 - 0.8);
  },
  homes(game, L, w, d) {
    const bz = -d / 2 + T;
    till(game, L, 2.4, bz + 1.0, 0x3a9a4a, 'homes', 'Buy a home');
    // little model house on a table
    lfurn(game, L, 'table', -2.6, 0, 0.6, 0, 0xffffff, 1.6, 1.0);
    L.deco(-2.6, 0.95, 0.6, 0.6, 0.4, 0.5, 0xfff1d6); L.deco(-2.6, 1.25, 0.6, 0.72, 0.08, 0.6, 0xd9534f, { euler: [0, 0, 0.5] });
    L.deco(-2.6, 1.25, 0.6, 0.72, 0.08, 0.6, 0xd9534f, { euler: [0, 0, -0.5] });
    lfurn(game, L, 'chair', -2.6, 0, 1.6, Math.PI, 0x3a9a4a);
    lfurn(game, L, 'sofa', 3.5, 0, 2.8, Math.PI, 0x3a9a4a);
    // listings board
    const bx = -w / 2 + T + 0.04;
    poster(game, L, 'homes_cottage', bx, 2.3, -1.8, Math.PI / 2, 1.6, 1.1, { bg: '#bfe6ff', sun: true, hills: true, title: 'FOR SALE', fg: '#d9342b' });
    poster(game, L, 'painting_island', bx, 2.3, 1.2, Math.PI / 2, 1.6, 1.1, { bg: '#8fd3ff', sun: true, hills: true, frame: 0xc8a050 });
    lfurn(game, L, 'plant', w / 2 - 0.7, 0, d / 2 - 0.8);
    lfurn(game, L, 'plant', -w / 2 + 0.7, 0, -d / 2 + 0.8);
  },
  cars(game, L, w, d) {
    const bz = -d / 2 + T;
    till(game, L, 3.6, bz + 1.0, 0xff8a3d, 'cars', 'Buy vehicles');
    // turntable with a shiny show car
    L.cyl(-1.8, 0.08, 0.2, 2.4, 0.16, 0xdddddd);
    const b = new Builder(), c = 0xff3a3a;
    b.rbox(1.9, 0.5, 3.8, 0.18, c, [0, 0.55, 0]); b.rbox(1.6, 0.5, 1.9, 0.2, c, [0, 1.0, -0.2]);
    b.box(1.5, 0.38, 1.7, 0x9fd8ff, [0, 1.02, -0.2]);
    for (const [x, z] of [[-0.9, 1.2], [0.9, 1.2], [-0.9, -1.2], [0.9, -1.2]]) { b.cyl(0.34, 0.34, 0.26, 0x222222, [x, 0.34, z], [0, 0, Math.PI / 2], 14); b.cyl(0.18, 0.18, 0.28, 0xdddddd, [x, 0.34, z], [0, 0, Math.PI / 2], 10); }
    b.box(0.5, 0.12, 0.05, 0xffffff, [0, 0.6, 1.92]);
    const car = b.mesh(), cp = L.v3(-1.8, 0.16, 0.2);
    car.position.set(cp.x, cp.y, cp.z);
    game.scene.add(car);
    game.updaters.push((dt, t) => { car.rotation.y = t * 0.35; });
    L.solid(-1.8, 0.8, 0.2, 2.2, 1.6, 2.2); // keep wobblers off the bonnet (roughly)
    for (let i = 0; i < 4; i++) L.cyl(w / 2 - 0.8, 0.12 + i * 0.25, -1.5, 0.38, 0.24, 0x222222, { collide: i === 0 }); // tyre stack
    poster(game, L, 'cars_sale', w / 2 - T - 0.04, 2.4, 1.6, -Math.PI / 2, 1.0, 1.4, { bg: '#ff8a3d', title: 'BIG', sub: 'DEALS', fg: '#1a1040' });
    L.deco(0, 4.6, -d / 2 + T + 0.03, w - 1, 0.1, 0.04, 0xff8a3d);
  },
};

// Builds one of the LIFE_SHOPS (same footprint and front as town.js shop()).
export function lifeShop(game, kit, x, z, yaw, name, color, wall, o = {}) {
  const w = o.w || 13, d = o.d || 10, h = o.h || 5.5;
  const L = new Local(kit, x, z, yaw);
  const id = LIFE_SHOPS.find((s) => s[0] === name)?.[2];
  shell(game, L, {
    w, d, h, wall, floor: id === 'cars' ? 0xdadde4 : 0xf2ead8, roofColor: 0xd8d2c8, business: true,
    door: { lx: w * 0.25, w: 1.7, h: 2.4, color: new THREE.Color(color).multiplyScalar(0.8).getHex(), glass: true },
    windows: [{ side: 'f', at: -w * 0.2, y: 1.8, w: w * 0.4, h: 2.0 }, { side: 'l', at: 0, y: 2.0, w: 3, h: 1.4 }],
  });
  shopFront(game, L, w, d, h, name, color);
  L.box(0, h + 0.25, 0, w + 0.4, 0.5, d + 0.4, 0xffffff); // parapet cap like the solid shops
  SHOP_INSIDES[id]?.(game, L, w, d, h);
}

// ---- homes --------------------------------------------------------------------
// A single-storey enterable bungalow (front = local +z) with a gable roof.
export function bungalow(game, kit, x, z, yaw, wall, roof, doorCol, id) {
  const w = 10, d = 8, h = 3.4;
  const L = new Local(kit, x, z, yaw); // suburbs are flat, at y = 0 (like town.js house())
  const hw = w / 2, hd = d / 2, ix = hw - T, iz = hd - T;
  shell(game, L, {
    w, d, h, wall, floor: 0xd9b48a, roof: false,
    door: { lx: -2, w: 1.2, h: 2.25, color: doorCol },
    windows: [
      { side: 'f', at: 2.3, y: 1.55, w: 1.8, h: 1.2 }, { side: 'l', at: 0.5, y: 1.55, w: 1.6, h: 1.2 },
      { side: 'r', at: 0.5, y: 1.55, w: 1.6, h: 1.2 }, { side: 'b', at: 1.5, y: 1.6, w: 1.4, h: 1.0 },
    ],
  });
  L.box(0, h - 0.1, 0, w, 0.2, d, 0xeeeeee);
  const rh = 2.2, slope = Math.atan2(rh, d / 2), sl = Math.hypot(rh, d / 2) + 0.5;
  for (const s of [1, -1]) L.box(0, h + rh / 2, s * d / 4, w + 0.8, 0.25, sl, roof, { euler: [s * slope, 0, 0] });
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4; L.deco(s * (hw - 0.05), h + rh * t * 0.95, 0, 0.1, rh / 4, d * (1 - t) + 0.2, wall); }
  L.box(w * 0.3, h + rh * 0.85, -d * 0.15, 0.6, 1.6, 0.6, 0xa0583a);
  { const p = L.v3(0.5, h - 0.25, 0); game.interiorLights.add(p.x, p.y, p.z, { fixture: 'pendant', intensity: 5, range: 8, color: 0xffe2b0 }); }
  // inside: bedroom corner, living room, rug
  lfurn(game, L, 'bed', -3.4, 0, -2.2, 0, [0x6ac8ff, 0xff9ac8, 0x9be03a][HOME_ORDER.indexOf(id) % 3]);
  lfurn(game, L, 'lamp', -ix + 0.35, 0, -iz + 0.35, 0, 0xffb7d5);
  lfurn(game, L, 'wardrobe', -1.1, 0, -iz + 0.32, 0);
  lfurn(game, L, 'sofa', 2.6, 0, -2.6, 0, 0xff8a3d);
  lfurn(game, L, 'coffeeTable', 2.6, 0, -1.0, 0);
  lfurn(game, L, 'cabinet', 2.6, 0, iz - 0.3, Math.PI, 0xb5773d, 1.4, 0.5, 0.45);
  lfurn(game, L, 'tv', 2.6, 0.5, iz - 0.3, Math.PI);
  lfurn(game, L, 'plant', ix - 0.4, 0, -iz + 0.4);
  lfurn(game, L, 'plant', -ix + 0.4, 0, iz - 0.5);
  L.deco(1.0, 0.065, 0, 3.2, 0.01, 2.4, 0x6a8fd9);
  poster(game, L, 'painting_island', ix - 0.04, 1.8, -1.2, -Math.PI / 2, 1.3, 0.9, { bg: '#8fd3ff', sun: true, hills: true, frame: 0xc8a050 });
  // front garden: fence with a gate gap, mailbox, path
  const fz = hd + 4.2;
  const [a1, a2] = [L.w(-hw - 0.8, fz), L.w(-3.0, fz)], [b1, b2] = [L.w(-1.0, fz), L.w(hw + 0.8, fz)];
  kit.fence(a1[0], a1[1], a2[0], a2[1], 0xffffff, 0.8);
  kit.fence(b1[0], b1[1], b2[0], b2[1], 0xffffff, 0.8);
  L.deco(-2, 0.03, hd + 2.3, 1.3, 0.05, 3.6, 0xd8d0c0);
  homeFixtures(game, L, { id, door: [-2, hd], doorH: 2.25, bed: [-3.4, 0, -2.2], wardrobe: [-1.1, 0, -iz + 0.32, 0], board: [0.2, fz - 0.6] });
}

// Plate texture: FOR SALE / owner's name in their colour.
function plateTex() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const g = cv.getContext('2d');
  let last = '';
  const set = (title, sub, bg, fg) => {
    const key = [title, sub, bg, fg].join('|'); if (key === last) return; last = key;
    g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, 504, 152, 34); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 8; g.beginPath(); g.roundRect(14, 14, 484, 132, 26); g.stroke();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 64px Trebuchet MS, sans-serif'; g.fillText(title, 256, sub ? 64 : 82);
    if (sub) { g.font = '800 34px Trebuchet MS, sans-serif'; g.fillText(sub, 256, 120); }
    tex.needsUpdate = true;
  };
  return { tex, set };
}

const registry = []; // homes built so far (in build order)

export function homeFixtures(game, L, o) {
  const def = HOME_DEFS[o.id];
  if (!def) return;
  const [dlx, dlz] = o.door;
  const home = { id: o.id, ...def, L, plate: plateTex() };
  // spawn just outside the front door, facing the street
  home.spawn = L.v3(dlx, 0.2, dlz + 1.6);
  home.yaw = L.yaw;
  const mat = new THREE.MeshBasicMaterial({ map: home.plate.tex });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), mat);
  const dp = L.v3(dlx, (o.doorH || 2.25) + 0.35, dlz + 0.16);
  door.position.set(dp.x, dp.y, dp.z); door.rotation.y = L.yaw;
  door.userData.noCull = true;
  game.scene.add(door);
  // garden board on a post, with the "Buy home" / doorbell spot
  const [blx, blz] = o.board || [dlx + 2.2, dlz + 2.6];
  L.box(blx, 0.7, blz, 0.12, 1.4, 0.12, 0xffffff);
  L.deco(blx, 1.55, blz - 0.04, 1.7, 0.56, 0.06, 0xffffff);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), mat);
  const bp = L.v3(blx, 1.55, blz + 0.0);
  board.position.set(bp.x, bp.y, bp.z); board.rotation.y = L.yaw;
  board.userData.noCull = true;
  game.scene.add(board);
  const sp = L.v3(blx, 1.0, blz + 0.8);
  home.saleSpot = useSpot(game, sp.x, sp.y, sp.z, 'Buy home', (p) => {
    const owner = life.homes[home.id]?.owner;
    if (!owner) { const r = game.homes.buy(p, home.id); if (!r.ok) game.ui?.toast(r.msg, p.color); }
    else { chime(game, sp, [76, 72], 0.3); if (owner === p.deviceId) game.ui?.toast(`Home sweet home: ${home.name}`, p.color); }
  });
  // bed and wardrobe use spots (beside the bed, in front of the wardrobe)
  if (o.bed) {
    const [bx, by, bz] = o.bed, p = L.v3(bx + 1.05, by + 0.9, bz + 0.3);
    home.bed = L.v3(bx, by + 0.7, bz);
    useSpot(game, p.x, p.y, p.z, 'Sleep', (pl) => game.homes.sleep(pl, home));
  }
  if (o.wardrobe) {
    const [wx, wy, wz, wly] = o.wardrobe, p = L.v3(wx + Math.sin(wly) * 0.8, wy + 1.0, wz + Math.cos(wly) * 0.8);
    useSpot(game, p.x, p.y, p.z, 'Wardrobe', (pl) => game.ui?.openCustomiser(pl, false));
  }
  registry.push(home);
}

// Runtime side of the homes (after the world is built).
export function buildHomes(game) {
  const list = HOME_ORDER.map((id) => registry.find((h) => h.id === id)).filter(Boolean);
  registry.length = 0;
  const ownerOf = (id) => life.homes[id]?.owner || null;
  const homeOf = (p) => list.find((h) => ownerOf(h.id) === p.deviceId) || null;
  const refresh = () => {
    for (const h of list) {
      const rec = life.homes[h.id];
      if (!rec) { h.plate.set('FOR SALE', `${h.name} · ${h.price} coins`, '#ffffff', '#d9342b'); h.saleSpot.label = `Buy home (${h.price})`; continue; }
      const p = game.players.find((q) => q.deviceId === rec.owner);
      const col = p ? p.color : PLAYER_COLORS[rec.color] ?? 0x3a9a4a;
      const fg = (col === 0xffffff || col === 0xffc233 || col === 0x3fe0d0) ? '#234' : '#fff';
      h.plate.set(p ? `P${p.index + 1}'S HOME` : 'HOME', h.name, PLAYER_CSS(col), fg);
      h.saleSpot.label = 'Ring the bell';
    }
  };
  const spawnFor = (p) => {
    const h = homeOf(p); if (!h) return null;
    const k = (p.index % 3) - 1;
    return { x: h.spawn.x + Math.cos(h.yaw) * k * 0.9, y: h.spawn.y + 1.0, z: h.spawn.z - Math.sin(h.yaw) * k * 0.9, yaw: h.yaw };
  };
  const goHome = (p) => {
    const s = spawnFor(p); if (!s) return false;
    if (p.seat) p.leaveSeat();
    p.releaseAll?.();
    p.teleport(s.x, s.y, s.z, s.yaw);
    if (p.camera) p.camera.yaw = s.yaw;
    game.pets?.of(p)?.teleportNear();
    return true;
  };
  const buy = (p, id) => {
    const h = list.find((q) => q.id === id);
    if (!h) return { ok: false, msg: 'No such home' };
    if (ownerOf(id)) return { ok: false, msg: 'Someone already lives there' };
    if (!game.wallet.spend(h.price, p, h.name)) return { ok: false, msg: `Not enough coins: ${h.name} costs ${h.price}` };
    const old = homeOf(p);
    if (old) delete life.homes[old.id]; // moving house: the old one goes back on the market
    life.homes[id] = { owner: p.deviceId, color: p.colorIndex };
    saveLife();
    refresh();
    game.audio?.play('buy');
    chime(game, h.spawn, [72, 76, 79, 84, 88], 0.3);
    game.ui?.toast(`P${p.index + 1} bought <b>${h.name}</b>!${old ? ` <small>moved out of ${old.name}</small>` : ' <small>your new respawn point</small>'}`, p.color);
    return { ok: true, home: h };
  };
  const sleep = (p, h) => {
    if (!game.setTimeOfDay) { game.ui?.toast('Zzz... what a lovely nap', p.color); return; }
    const hr = game.timeOfDay ?? 12, night = hr >= 19 || hr < 6;
    if (h.bed) { if (p.seat) p.leaveSeat(); p.teleport(h.bed.x, h.bed.y + 0.3, h.bed.z, h.yaw); p.knockOut?.(2.4); }
    game.lifeHud?.fade(p, night ? 'Zzz...' : 'Zzz... nap time', 1.6);
    game.audio?.play('snore', h.bed || null);
    setTimeout(() => {
      game.setTimeOfDay(night ? 7 : 20);
      game.ui?.toast(night ? `Good morning, P${p.index + 1}!` : `P${p.index + 1} napped until the evening`, p.color);
    }, 900);
  };
  // join at home (the first time we see a player who owns one), keep plates in sync
  const seen = new Set();
  let n = 0, sig = '';
  game.steppers.push(() => {
    for (const p of game.players) {
      if (seen.has(p)) continue;
      seen.add(p);
      if (homeOf(p) && p.chest) goHome(p);
    }
    for (const p of seen) if (!game.players.includes(p)) seen.delete(p);
    if (++n % 30) return;
    const s = game.players.map((p) => p.deviceId + p.index + ':' + p.color).join(',') + JSON.stringify(life.homes);
    if (s !== sig) { sig = s; refresh(); }
  });
  // respawning goes home (Player.respawn asks game.spawnPoint)
  const base = game.spawnPoint.bind(game);
  game.spawnPoint = (i) => { const p = game.players.find((q) => q.index === i); return (p && spawnFor(p)) || base(i); };
  refresh();
  game.homes = { list, ownerOf, homeOf, buy, goHome, spawnFor, sleep, refresh };
}
