// Dusty Dunes presents and coin pickups (R.present / R.coins; see helpers.js).
import { TOWN, OASIS, MESAS, PYRAMID, DIG, GAS, BRIDGE, MINE, canyonZ, CANYON_Y, HIGHWAY, PLATEAU_Y } from './layout.js';
import { WATER_TOWER } from './town.js';

const PI = Math.PI;

export function buildLoot(game, kit, R) {
  const sites = game.desertSites || {};
  // ---- presents ----
  R.present('desert-pyramid', 'hat:pharaoh', PYRAMID.x - 2, PYRAMID.z, PYRAMID.y + 3.0, 'in the hidden chamber inside the pyramid');
  const [mx, mz] = MESAS[0], mtop = sites.mesa?.topY ?? R.groundAt(mx, mz);
  R.present('desert-mesa', 'pants:Cactus', mx + 4, mz - 6, mtop + 3, 'on top of the big mesa');
  R.present('desert-water-tower', 'pants:Sandstone', WATER_TOWER.x + 3.6, WATER_TOWER.z - 1.5, TOWN.y + 10.5, 'on the Dustville water tower');

  // ---- coins ----
  const ST = TOWN.street;
  R.coins(-960, ST, 6, 'line', 12, 100);                                // main street
  R.coins(-970, -45, 8, 'ring', 5, 3.2);                                // in the saloon
  R.coins(WATER_TOWER.x, WATER_TOWER.z, TOWN.y + 10.5, 'ring', 6, 3.6); // water-tower deck
  R.coins(WATER_TOWER.x, WATER_TOWER.z, null, 'one', 1, 0, { big: true }); // on the tank roof
  // highway from the dock into town
  for (let i = 0; i < HIGHWAY.length - 1; i++) {
    const [ax, az] = HIGHWAY[i], [bx, bz] = HIGHWAY[i + 1];
    R.coins((ax + bx) / 2, (az + bz) / 2, 8, 'line', 4, Math.hypot(bx - ax, bz - az) * 0.7, { yaw: Math.atan2(bz - az, bx - ax) });
  }
  R.coins(GAS.x + 6, GAS.z + 2, 5, 'ring', 6, 5);                         // gas forecourt
  // canyon floor + mine tunnel
  for (const x of [-1240, -1180, -1120]) {
    const yaw = Math.atan2(28 / 55 * Math.cos(x / 55), 1);
    R.coins(x, canyonZ(x), CANYON_Y + 6, 'line', 5, 18, { yaw });
  }
  R.coins((MINE.x0 + MINE.x1) / 2, canyonZ((MINE.x0 + MINE.x1) / 2), CANYON_Y + 3, 'line', 6, 24, { yaw: 0.1 });
  R.coins(MINE.x0 + 3, (MINE.z0 + MINE.z1) / 2, CANYON_Y + 3, 'one', 1, 0, { big: true });
  // over the rope bridge (follows the sag) and the rock arch top
  for (let k = 1; k < 8; k++) {
    const t = k / 8, z = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * t;
    R.coins(BRIDGE.x, z, null, 'one', 1, 0, { y: BRIDGE.y - 1.4 * 4 * t * (1 - t) + 0.9, big: k === 4 });
  }
  R.coins(-1000, -300, null, 'one', 1, 0, { big: true });
  R.coins(-960, -320, PLATEAU_Y + 6, 'ring', 8, 10);
  // pyramid: stairs line + big coin in the top shrine
  R.coins(PYRAMID.x + PYRAMID.half - 4, PYRAMID.z, PYRAMID.y + 30, 'line', 6, 14);
  R.coins(PYRAMID.x, PYRAMID.z + 1, PYRAMID.y + 17.5, 'one', 1, 0, { big: true });
  // oasis ring + deck, dig pit, mesas
  R.coins(OASIS.x, OASIS.z, 8, 'ring', 12, OASIS.r + 7);
  R.coins(OASIS.x + 3, OASIS.z - OASIS.r + 8, 3, 'line', 4, 7, { yaw: PI / 2 });
  R.coins((DIG.x0 + DIG.x1) / 2, (DIG.z0 + DIG.z1) / 2, DIG.y + 1.5, 'ring', 6, 5.5);
  R.coins(mx, mz, mtop + 4, 'ring', 8, 8);
  R.coins(mx - 10, mz, mtop + 4, 'one', 1, 0, { big: true });
  R.coins(MESAS[1][0], MESAS[1][1], null, 'ring', 6, 6);
  // in the air over the dune jumps (drive through them)
  for (const [x, z, yaw, top] of sites.jumps || []) {
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    R.coins(x + dx * 12, z + dz * 12, null, 'line', 5, 9, { y: top + 2.6, yaw: Math.atan2(dz, dx) });
  }
}
