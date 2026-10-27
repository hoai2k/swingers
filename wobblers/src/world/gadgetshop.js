// The GADGETS shop (src/gadgets.js): a walk-in shop in the yard of the north-east
// town block, behind the life-sim shops, its door facing the outer town road
// (south). Display stands show every gadget; Y at the till opens the shop panel.
import * as THREE from 'three';
import { Builder } from '../mesh.js';
import { Local } from './common.js';
import { shell, shopFront } from './interiors.js';
import { lfurn } from './furniture.js';
import { till } from './estate.js';
import { GADGETS, gearGeo } from '../gadgets.js';

export const GADGET_SHOP = { x: 28, z: 46, yaw: 0, w: 11, d: 9, h: 5 };
const TEAL = '#1fb5a8';

// One gadget on a little pedestal (local position), slowly turning.
function stand(game, L, lx, lz, id) {
  L.cyl(lx, 0.45, lz, 0.32, 0.9, 0xf2f2f2);
  L.deco(lx, 0.92, lz, 0.7, 0.04, 0.7, 0x1fb5a8);
  const b = new Builder();
  const parts = id === 'boots' || id === 'speed' ? [['lLegL', [0.13, 0.2, 0]], ['lLegR', [-0.13, 0.2, 0]]]
    : id === 'laser' || id === 'grapple' ? [['lArmR', [0, 0.25, 0], [Math.PI / 2, 0, 0]]] : [['chest', [0, 0.35, 0.3]]];
  const g = new THREE.Group();
  for (const [n, pos, rot] of parts) {
    const pb = new Builder();
    gearGeo(id, n, pb, true);
    const m = pb.mesh();
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    g.add(m);
  }
  if (id === 'glider') { // the wing, opened out
    b.box(1.3, 0.03, 0.05, 0x22305a, [0, 0.62, 0.1]);
    b.box(1.2, 0.015, 0.4, 0xff8a3d, [0, 0.62, -0.08], [0.12, 0, 0]);
    g.add(b.mesh());
  }
  const p = L.v3(lx, 0.95, lz);
  g.position.set(p.x, p.y, p.z);
  game.scene.add(g);
  const phase = lx * 1.3;
  game.updaters.push((dt, t) => { if (g.visible) g.rotation.y = t * 0.6 + phase; });
}

export function buildGadgetShop(game, kit) {
  const { x, z, yaw, w, d, h } = GADGET_SHOP;
  const L = new Local(kit, x, z, yaw);
  shell(game, L, {
    w, d, h, wall: 0xd9f7f2, floor: 0xdadde4, roofColor: 0xd8d2c8, business: 'gadgets',
    door: { lx: w * 0.25, w: 1.7, h: 2.4, color: 0x168a80, glass: true },
    windows: [{ side: 'f', at: -w * 0.2, y: 1.8, w: w * 0.4, h: 2.0 }, { side: 'l', at: 0, y: 2.0, w: 3, h: 1.4 }],
  });
  shopFront(game, L, w, d, h, 'GADGETS', TEAL);
  L.box(0, h + 0.25, 0, w + 0.4, 0.5, d + 0.4, 0xffffff); // parapet cap like the other shops
  const bz = -d / 2 + 0.25;
  till(game, L, 2.6, bz + 1.0, 0x1fb5a8, 'gadgets', 'Buy gadgets');
  // display stands: one per gadget, round the room
  const spots = [[-4.0, -2.4], [-4.0, 0.0], [-4.0, 2.4], [-1.6, -1.2], [-1.6, 1.4], [1.2, 1.6]];
  GADGETS.forEach((gd, i) => stand(game, L, spots[i][0], spots[i][1], gd.id));
  // a test-launch pad with a target on the back wall
  L.deco(w / 2 - 0.3, 2.2, -1.2, 0.04, 1.2, 1.2, 0xffffff);
  L.deco(w / 2 - 0.32, 2.2, -1.2, 0.04, 0.8, 0.8, 0xff3a8a);
  L.deco(w / 2 - 0.34, 2.2, -1.2, 0.04, 0.35, 0.35, 0xffffff);
  L.deco(0, 4.6, -d / 2 + 0.28, w - 1, 0.1, 0.04, 0x1fb5a8);
  lfurn(game, L, 'plant', w / 2 - 0.7, 0, d / 2 - 0.8);
  lfurn(game, L, 'plant', -w / 2 + 0.7, 0, d / 2 - 0.8);
}
