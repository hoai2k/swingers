// The helper bag `R` handed to every region's build(game, kit, R).
//
//   R.region / R.id / R.bounds / R.centre    the region descriptor (see terrain.js REGIONS)
//   R.groundAt(x, z)      exact terrain-mesh height (place things with this)
//   R.heightAt(x, z)      smooth analytic height;  R.biomeAt(x, z);  R.regionAt(x, z)
//   R.flats               the region's flat rects [x0, x1, z0, z1, y, blend] (read only now)
//   R.Local, R.common     building-local placement and the world/common.js helpers
//                         (addDoor, useSpot, throwable, ladder, liveSign...)
//   R.addSeat(game, seat) R.addWater(game, x0, x1, z0, z1, floorY, level, color, opacity)
//   R.rng(seed)           deterministic random numbers in 0..1
//   R.sign(text, x, y, z, yaw, width, bg, fg)   a painted-art-ready sign board (signMesh)
//   R.welcomeSign(x, z, yaw)                    the region's big framed welcome sign
//   R.tree(x, z, kind, scale)                   kit tree on the ground (0 leafy, 1 pine, 2 palm)
//   R.vehicle(type, x, z, yaw, color, opts)     a parked vehicle (any registered type)
//   R.npc(role | def, x, z, opts)               an NPC (see src/npc.js; opts.area, opts.path...)
//   R.label(name, x, z, big)                    a label on the map
//   R.docks               this region's ferry docks (piers are built by world/ferries.js)
//   R.present(id, rewardKey, x, z, from, note)  a hidden present (ids unique; reward keys as in
//                         unlocks.js; new cosmetics go at the END of HATS / FACES / PANTS lists)
//   R.coins(x, z, from, shape, n, size, opts)   a coin cluster (format of life/coins.js CLUSTERS)
import { heightAt, meshHeight, biomeAt, regionAt } from '../../terrain.js';
import { signMesh } from '../../mesh.js';
import { Vehicle } from '../../vehicles.js';
import * as common from '../common.js';
import { addSeat } from '../playground.js';
import { addWater } from '../water.js';
import { addRegionPresent } from '../presents.js';
import { addCoinCluster } from '../../life/coins.js';

const SIGN_COLORS = {
  city: ['#2a62c9', '#ffffff', 0x3a3f4a], snow: ['#3f8cff', '#ffffff', 0x7a5032], desert: ['#b5532c', '#ffe8b0', 0x7a5032],
  jungle: ['#2f8a35', '#ffe36a', 0x6b4a2a], tropical: ['#2bc4c4', '#ffffff', 0xb98a5a], home: ['#ff5a8a', '#ffffff', 0x7a5032],
};

export function regionHelpers(game, kit, region) {
  const R = {
    region, id: region.id, bounds: region.bounds, centre: region.centre, flats: region.flats, docks: region.docks || [],
    groundAt: meshHeight, heightAt, biomeAt, regionAt,
    Local: common.Local, common, addSeat, addWater,
    rng(seed = 1) { let s = Math.floor(Math.abs(seed) * 9973 + 17) % 2147483646 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; },
    sign(text, x, y, z, yaw = 0, width = 6, bg = '#ff5a8a', fg = '#ffffff') {
      const s = signMesh(text, width, bg, fg);
      s.position.set(x, y, z); s.rotation.y = yaw;
      game.scene.add(s);
      return s;
    },
    welcomeSign(x, z, yaw = 0, text = region.signText) {
      const [bg, fg, post] = SIGN_COLORS[region.biome] || SIGN_COLORS.home;
      const W = 9, y = meshHeight(x, z), c = Math.cos(yaw), s = Math.sin(yaw);
      for (const k of [-1, 1]) kit.cyl(x + c * k * (W / 2 + 0.2), y + 2.4, z - s * k * (W / 2 + 0.2), 0.22, 4.8, post);
      // frame behind the board (a little deeper than it so the art sits in it)
      kit.box(x - s * 0.08, y + 3.6, z - c * 0.08, W + 0.6, W / 4 + 0.6, 0.18, post, { yaw });
      return R.sign(text, x + s * 0.03, y + 3.6, z + c * 0.03, yaw, W, bg, fg);
    },
    tree(x, z, kind = 0, scale = 1) { kit.tree(x, z, meshHeight(x, z) - 0.1, kind, scale); },
    vehicle(type, x, z, yaw = 0, color, opts = {}) {
      const v = new Vehicle(game, type, x, Math.max(meshHeight(x, z), -0.3) + 1.4, z, yaw, color, opts);
      game.vehicles.push(v);
      return v;
    },
    npc(role, x, z, opts = {}) { return game.npcs?.spawn(role, x, z, { region: region.id, ...opts }); },
    label(name, x, z, big = false) { (region.labels ||= []).push({ name, x, z, big }); },
    present(id, rewardKey, x, z, from = null, note = '') { addRegionPresent(id, rewardKey, x, z, from, note); },
    coins(...c) { addCoinCluster(...c); },
  };
  return R;
}
