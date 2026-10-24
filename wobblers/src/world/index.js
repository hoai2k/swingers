// Builds the whole island.
import * as THREE from 'three';
import { buildTerrain } from '../terrain.js';
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

export function buildWorld(game) {
  const kit = new Kit(game);
  game.kit = kit;
  game.waterMats = [];
  buildTerrain(game.scene, game.physics);
  buildSea(game);
  buildRoads(game, kit);
  buildTown(game, kit);
  buildPlayground(game, kit);
  buildPool(game, kit);
  buildPark(game, kit);
  buildStunts(game, kit);
  buildSports(game, kit);
  buildOutskirts(game, kit);
  scatterProps(game, kit);
  kit.finish();
  buildDetail(game); // grass, flowers, road edges, lamp glow
  animateWater(game, game.waterMats);
}

function buildSea(game) {
  const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2);
  const mat = seaMaterial();
  game.waterMats.push(mat);
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = SEA_LEVEL;
  sea.receiveShadow = true;
  sea.renderOrder = 1;
  game.scene.add(sea);
  game.sea = sea;
}
