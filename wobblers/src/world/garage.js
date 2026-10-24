// Extra vehicles around the island: bus, police cars, fire truck, sports cars,
// scooters, a tractor at the farm and a helicopter on a helipad.
import { Vehicle } from '../vehicles.js';
import { heightAt } from '../terrain.js';

export const GARAGE = [
  // town
  ['bus', -38, 57.6, -Math.PI / 2, 0xffc233],
  ['police', 63.5, -45, Math.PI], ['police', -63.5, 45, 0],
  ['firetruck', -62.4, -40, 0],
  ['scooter', 22, -2.2, Math.PI / 2, 0xff7fc8], ['scooter', 22, -3.6, Math.PI / 2, 0x3fe0d0],
  // town + stunt park line-up
  ['sports', -56.5, 20, 0, 0xff3a3a], ['sports', -70, 68, Math.PI, 0xffd23f],
  // farm
  ['tractor', 203, -158, Math.PI / 2, 0xd9342b],
];
export const HELIPADS = [[-100, -60, Math.PI / 2]]; // open grass between the sports field and town

export function buildGarage(game, kit) {
  const V = (type, x, z, yaw, color, opts) => {
    // (scene queries don't see colliders added during the build, so use the terrain height)
    const v = new Vehicle(game, type, x, Math.max(0, heightAt(x, z)) + 1.4, z, yaw, color, opts);
    game.vehicles.push(v);
    return v;
  };
  for (const g of GARAGE) V(...g);
  for (const [x, z, yaw] of HELIPADS) {
    const y = Math.max(0, heightAt(x, z));
    kit.deco(x, y + 0.04, z, 9, 0.08, 9, 0x5a5d66);
    kit.deco(x, y + 0.09, z, 7.6, 0.02, 7.6, 0xffd23f, { round: 0 });
    kit.deco(x, y + 0.1, z, 7, 0.02, 7, 0x5a5d66);
    // big H
    kit.deco(x - 1.3, y + 0.11, z, 0.6, 0.02, 3.6, 0xffffff);
    kit.deco(x + 1.3, y + 0.11, z, 0.6, 0.02, 3.6, 0xffffff);
    kit.deco(x, y + 0.11, z, 2.0, 0.02, 0.6, 0xffffff);
    V('heli', x, z, yaw, 0x3f8cff);
  }
}
