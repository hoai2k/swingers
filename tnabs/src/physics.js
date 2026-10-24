import RAPIER from '../vendor/rapier.es.js';

export { RAPIER };

let ready = null;
export function initPhysics() {
  if (!ready) ready = RAPIER.init();
  return ready;
}

// Interaction groups: membership << 16 | filter.
export const G_GROUND = 0x1, G_BODY = 0x2, G_LIMB = 0x4, G_PROP = 0x8;
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const GROUPS = {
  ground: groups(G_GROUND, 0xffff),
  body: groups(G_BODY, G_GROUND | G_BODY | G_PROP),
  limb: groups(G_LIMB, G_GROUND | G_PROP),
  prop: groups(G_PROP, 0xffff),
};

export function createWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.numSolverIterations = 4;
  return world;
}
