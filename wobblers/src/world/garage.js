// Extra vehicles around the island: bus, police cars, fire truck, sports cars,
// scooters, a tractor at the farm and a helicopter on a helipad.
import { Vehicle } from '../vehicles.js';
import { heightAt } from '../terrain.js';

export const GARAGE = [
  // town
  ['bus', -45, 62.5, Math.PI / 2, 0xffc233],
  ['police', 63.5, -45, Math.PI], ['police', -63.5, 45, 0],
  ['firetruck', -62.4, -40, 0],
  ['scooter', 12, 17, Math.PI / 2, 0xff7fc8], ['scooter', 12, 18.3, Math.PI / 2, 0x3fe0d0],
  // stunt park line-up
  ['sports', -70, 116, Math.PI, 0xff3a3a], ['sports', -70, 68, Math.PI, 0xffd23f],
  // farm
  ['tractor', 203, -158, Math.PI / 2, 0xd9342b],
];
export const HELIPADS = [[-110, -118, 0]];

export function buildGarage(game, kit) {
  const V = (type, x, z, yaw, color, opts) => {
    const v = new Vehicle(game, type, x, Math.max(0, heightAt(x, z), game.groundHeight(x, z, 60)) + 1.4, z, yaw, color, opts);
    game.vehicles.push(v);
    return v;
  };
  for (const g of GARAGE) V(...g);
  for (const [x, z, yaw] of HELIPADS) {
    const y = game.groundHeight(x, z, 60);
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
