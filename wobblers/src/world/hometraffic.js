// Home-island traffic: a few self-driving cars lapping the ring road in both
// directions, using Bigtown's autopilot (regions/city/traffic.js: right-hand
// lanes, braking for anything in front; there are no traffic lights here).
// Take the driver's seat and it's an ordinary car; leave it near the ring road
// and it carries on by itself.
import { Vehicle } from '../vehicles.js';
import { meshHeight } from '../terrain.js';
import { autoType, makeRoute, placeOnRoute, addAutoDriver } from './regions/city/traffic.js';

export function buildHomeTraffic(game) {
  const ring = [[-150, -150], [-150, 150], [150, 150], [150, -150]];
  const yAt = (x, z) => meshHeight(x, z) + 1.6;
  const cw = makeRoute(ring), ccw = makeRoute([...ring].reverse());
  cw.yAt = ccw.yAt = yAt;
  const cars = [
    [cw, 'car', 0xff5a5a, 0xffd23f, 60], [cw, 'pickup', 0x3f8cff, 0xff8a3d, 460], [cw, 'van', 0xffffff, 0x55d85a, 860],
    [ccw, 'car', 0x55d85a, 0xb46cff, 160], [ccw, 'car', 0xffc233, 0x3f8cff, 660], [ccw, 'sports', 0xb46cff, 0xff7fc8, 1000],
  ];
  for (const [route, type, col, drv, s] of cars) {
    const v = new Vehicle(game, autoType(type), 0, 5, 0, 0, col);
    game.vehicles.push(v);
    v.route = route;
    v.home = placeOnRoute(v, s);
    addAutoDriver(v, drv);
  }
}
