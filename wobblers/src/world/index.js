// Builds the whole archipelago: the home island, then every region in
// world/regions/ (terrain first, see terrain.js), the bridge, ferries and NPCs.
import { mergeStatics } from '../staticmerge.js';
import * as THREE from 'three';
import { buildTerrain, REGIONS, terrainStats, heightAt, meshHeight, biomeAt, regionAt } from '../terrain.js';
import { defineRegions, buildRegions } from './regions/index.js';
import { SEA_LEVEL } from '../config.js';
import { Kit } from './kit.js';
import { seaMaterial, animateWater } from './water.js';
import { buildRoads } from './roads.js';
import { buildTown } from './town.js';
import { buildPlayground } from './playground.js';
import { buildPool } from './pool.js';
import { buildPark } from './park.js';
import { buildStunts, buildSports } from './stunts.js';
import { buildOutskirts } from './outskirts.js';
import { scatterProps } from './props.js';
import { buildDetail } from './detail.js';
import { buildGarage } from './garage.js';
import { buildFun } from './fun.js';
import { InteriorLights } from './lights.js';
import { buildPresents } from './presents.js';
import { buildWaypoints } from './waypoints.js';
import { buildTownLife } from './townlife.js';
import { buildCarDamage } from './cardamage.js';
import { buildBridge } from './bridge.js';
import { buildFerries } from './ferries.js';
import { buildFolk } from './folk.js';
import { buildHomeTraffic } from './hometraffic.js';
import { buildLife } from '../life/index.js';
import { buildMissions } from '../missions/index.js';
import { buildMagicTent } from '../forms.js';
import { buildFactory } from './factory.js';
import { buildFarmland } from './farmland.js';
import { buildFair } from './fair/index.js';
import { buildBooths } from './booths.js';
import { placeBouncyBalls } from './bouncy.js'; // also registers the bouncy ball vehicle
import { placeAircraft } from './aircraft.js'; // also registers the plane + glider vehicles
import { addGrabHandles } from './ridegrab.js';
import { buildSeaLife } from './sealife.js';

export function buildWorld(game) {
  const kit = new Kit(game);
  game.kit = kit;
  game.waterMats = [];
  game.interiorLights = new InteriorLights(game);
  const times = game.buildTimes ||= {}; // ms per build step (probes report them)
  const T = (name, fn) => { const t0 = performance.now(); fn(); times[name] = Math.round(performance.now() - t0); };
  T('defineRegions', () => defineRegions());
  game.regions = REGIONS; // [{ id, name, biome, centre, bounds, labels, docks, ... }]; REGIONS[0] is the home island
  T('terrain', () => buildTerrain(game.scene, game.physics));
  game.terrainStats = terrainStats;
  game.terrain = { heightAt, groundAt: meshHeight, biomeAt, regionAt }; // handy for probes / other modules
  T('sea', () => buildSea(game));
  T('home', () => {
    buildRoads(game, kit);
    buildTown(game, kit);
    buildPlayground(game, kit);
    buildPool(game, kit);
    buildPark(game, kit);
    buildStunts(game, kit);
    buildSports(game, kit);
    buildOutskirts(game, kit);
    scatterProps(game, kit);
    buildGarage(game, kit);
    buildFun(game, kit);
    buildMagicTent(game, kit); // forms.js: the Magic Tent (shape-shifting) in the Fun Park
    buildFactory(game, kit);   // factory.js: Wobble Works in the west meadow
    buildFarmland(game, kit);  // farmland.js: Pooh Berry Farm (farmyard, wheat, sunflowers, the corn maze)
  });
  T('fair', () => buildFair(game, kit));       // the Stratford Fall Fair south of the ring road (world/fair/)
  T('bridge', () => buildBridge(game, kit));
  T('regions', () => buildRegions(game, kit)); // per region: game.buildTimes[region id]
  T('ferries', () => buildFerries(game, kit)); // docks from every region's `docks`, then the ferry lines
  T('booths', () => { buildBooths(game, kit); placeBouncyBalls(game); placeAircraft(game); }); // phone booths (garage) + parked bouncy balls + gliders
  T('folk', () => buildFolk(game));            // home island NPCs
  T('traffic', () => buildHomeTraffic(game)); // self-driving cars on the ring road
  T('sealife', () => buildSeaLife(game));     // sea creatures (drawn only under water) + dolphin pods and whales
  T('presents', () => buildPresents(game));    // after everything static (it rays down onto it) and the rafts
  T('waypoints', () => buildWaypoints(game));  // waypoint stars: also need the statics (open-sky spot search)
  T('townLife', () => buildTownLife(game));   // squirrels, crows, cats round the town; rats by Bigtown's bins
  T('carDamage', () => buildCarDamage(game)); // vehicle damage, fire and explosions (Settings > Car damage)
  T('life', () => buildLife(game));          // money, shops, homes, pets (src/life/); coins ray down onto the static world too
  T('missions', () => buildMissions(game));  // jobs (src/missions/): givers, JOBS boards, the job HUD; before kitFinish (boards are kit scenery)
  T('grabHandles', () => { game.grabHandles = addGrabHandles(game); }); // ride seats with no colliders get something to hang from
  T('kitFinish', () => { kit.finish(); game.interiorLights.finish(); });
  T('mergeColliders', () => { game.staticMerge = mergeStatics(game); }); // thin static colliders -> one mesh per area (staticmerge.js)
  T('detail', () => buildDetail(game));        // grass, flowers, road edges, lamp glow
  animateWater(game, game.waterMats);
}

function buildSea(game) {
  const geo = new THREE.PlaneGeometry(8000, 8000, 1, 1).rotateX(-Math.PI / 2);
  const mat = seaMaterial();
  game.waterMats.push(mat);
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = SEA_LEVEL;
  sea.receiveShadow = true;
  sea.renderOrder = 1;
  game.scene.add(sea);
  game.sea = sea;
}
