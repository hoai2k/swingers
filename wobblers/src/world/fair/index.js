// STRATFORD FALL FAIR — an autumn fairground on the home island, in the flat
// strip south of the ring road either side of the south avenue (layout.js),
// a short walk from the town plaza.
//
// Fourteen rides line a midway that crosses the avenue (rides-a.js, rides-b.js,
// train.js: static kit scenery plus kinematic bodies posed by animators, seats
// in game.seats; FairRides in common.js), autumn decor, stalls and falling
// leaves (decor.js) and a crowd of teenagers (npcs.js, the `teen` role).
// Built by one buildFair(game, kit) call in world/index.js (home island step).
import { HOME_REGION } from '../../terrain.js';
import { AREAS } from '../../map.js';
import { regionHelpers } from '../regions/helpers.js';
import { CENTRE, PATCH } from './layout.js';
import { FairRides } from './common.js';
import { buildRidesA } from './rides-a.js';
import { buildRidesB } from './rides-b.js';
import { buildTrain } from './train.js';
import { buildDecor, buildLeaves } from './decor.js';
import { spawnTeens } from './npcs.js';

export function buildFair(game, kit) {
  const t = {}, T = (k, fn) => { const t0 = performance.now(); fn(); t[k] = Math.round(performance.now() - t0); };
  const R = regionHelpers(game, kit, HOME_REGION); // sign / rng / groundAt / coins helpers
  const F = new FairRides(game, kit, R);
  T('decor', () => buildDecor(game, kit, R, F));
  T('ridesA', () => buildRidesA(game, kit, R, F));
  T('ridesB', () => buildRidesB(game, kit, R, F));
  T('train', () => buildTrain(game, kit, R, F));
  T('leaves', () => buildLeaves(game, F));
  T('teens', () => spawnTeens(game, R, F));
  if (!AREAS.some((a) => a.name === 'Fall Fair')) AREAS.push({ name: 'Fall Fair', x: CENTRE.x - 60, z: CENTRE.z, big: true }, { name: 'Pumpkin Patch', x: PATCH.x, z: PATCH.z - 18 });
  game.fair = { times: t, rides: F };
}
