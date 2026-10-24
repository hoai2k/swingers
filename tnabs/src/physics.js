import RAPIER from '../vendor/rapier.es.js';

export { RAPIER };

let ready = null;
export function initPhysics() {
  if (!ready) ready = RAPIER.init();
  return ready;
}

// Interaction groups: membership << 16 | filter.
export const G_GROUND = 0x1, G_BODY = 0x2, G_LIMB = 0x4, G_PROP = 0x8, G_DEAD = 0x10;
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const GROUPS = {
  ground: groups(G_GROUND, 0xffff),
  body: groups(G_BODY, G_GROUND | G_BODY | G_PROP),
  limb: groups(G_LIMB, G_GROUND | G_PROP),
  prop: groups(G_PROP, 0xffff),
  // settled corpses lie on the ground; the living (and other corpses) pass through
  // them, so a corpse can go to sleep without being woken by its neighbours
  dead: groups(G_DEAD, G_GROUND | G_PROP),
  deadLimb: groups(G_DEAD, G_GROUND | G_PROP),
};

export function createWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const T = globalThis.TUNE || {};
  world.numSolverIterations = T.it ?? 4;
  if (T.pgs) world.numInternalPgsIterations = T.pgs;
  if (T.fr !== undefined) world.numAdditionalFrictionIterations = T.fr;
  return world;
}
