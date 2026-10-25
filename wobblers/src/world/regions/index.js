// The region registry: every island beyond the home island is a module here
// exporting
//   region           its descriptor (id, name, biome, signText, centre, bounds,
//                    terrain: step / height / color / sand / flats / roads / pits,
//                    labels for the map, ferry docks) — see terrain.js REGIONS
//   prepare(T)       optional, runs before the terrain is built:
//                    T.addFlat(x0, x1, z0, z1, y, blend), T.addRoadFlat([x, z], [x, z], w, y0, y1, blend),
//                    T.addPit(x0, x1, z0, z1, y)
//   build(game, kit, R)  runs after the terrain and the home island exist (R: helpers.js)
// To add an island: write the module, add it to REGION_MODULES. Bounds must not
// overlap other regions (defineRegion throws).
import { defineRegion, addFlat, addRoadFlat, addPit, HOME_REGION, REGIONS } from '../../terrain.js';
import { regionHelpers } from './helpers.js';
import * as city from './city.js';
import * as snow from './snow.js';
import * as desert from './desert.js';
import * as jungle from './jungle.js';
import * as tropical from './tropical.js';
import * as fair from './fair.js';

export const REGION_MODULES = [city, snow, desert, jungle, tropical, fair];

// Home island extras: map labels come from map.js AREAS; ferry docks (land end
// of each pier and the direction it points out to sea) for world/ferries.js.
HOME_REGION.docks = [
  { id: 'home_south', name: 'Wobbly Island', x: -130, z: 330, yaw: 0 },
  { id: 'home_north', name: 'Wobbly Island', x: -95, z: -350, yaw: Math.PI },
  { id: 'home_west', name: 'Wobbly Island', x: -345, z: 150, yaw: -Math.PI / 2 },
  { id: 'home_ne', name: 'Wobbly Island', x: 236, z: -236, yaw: 3 * Math.PI / 4 }, // Fair Ferry
];

// Registers every region's terrain (before buildTerrain).
export function defineRegions() {
  for (const m of REGION_MODULES) {
    const r = defineRegion(m.region);
    m.prepare?.({
      region: r,
      addFlat: (...a) => addFlat(r, ...a),
      addRoadFlat: (...a) => addRoadFlat(r, ...a),
      addPit: (...a) => addPit(r, ...a),
    });
  }
  return REGIONS;
}

// Builds every region's content (after the home island).
export function buildRegions(game, kit) {
  for (const m of REGION_MODULES) {
    const t0 = performance.now();
    m.build?.(game, kit, regionHelpers(game, kit, m.region));
    (game.buildTimes ||= {})[m.region.id] = Math.round(performance.now() - t0);
  }
}
