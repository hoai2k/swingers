import RAPIER from '../vendor/rapier.es.js';

export { RAPIER };

let ready = null;
export function initPhysics() {
  if (!ready) ready = RAPIER.init();
  return ready;
}

// Interaction groups: membership << 16 | filter.
export const G_GROUND = 0x1, G_BODY = 0x2, G_LIMB = 0x4, G_PROP = 0x8, G_DEAD = 0x10;
// held weapons and shields, per team: they clash with the other team's weapons and
// shields (parries, shield blocks) but never with their own side's
export const G_ITEM0 = 0x20, G_ITEM1 = 0x40;
export const G_DLIMB = 0x80; // a corpse's limbs: they rest on corpses' torsos instead of sinking through
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const itemGroups = (team) => team ? groups(G_ITEM1, G_GROUND | G_PROP | G_ITEM0) : groups(G_ITEM0, G_GROUND | G_PROP | G_ITEM1);
export const GROUPS = {
  ground: groups(G_GROUND, 0xffff),
  // limbs collide with bodies (their own and other units'), so arms and legs don't
  // pass through a torso or a head; parts joined by a joint ignore each other
  body: groups(G_BODY, G_GROUND | G_BODY | G_LIMB | G_PROP),
  limb: groups(G_LIMB, G_GROUND | G_BODY | G_PROP),
  prop: groups(G_PROP, 0xffff),
  // settled corpses lie on the ground; the living (and other corpses) pass through
  // them, so a corpse can go to sleep without being woken by its neighbours
  dead: groups(G_DEAD, G_GROUND | G_PROP | G_DLIMB),
  deadLimb: groups(G_DLIMB, G_GROUND | G_PROP | G_DEAD),
  // a dropped weapon clatters on the ground (not on other dropped things: piles cost)
  dropped: groups(G_DEAD, G_GROUND | G_PROP),
};

export function createWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.numSolverIterations = 4; // fewer visibly stretches joints under big hits
  return world;
}
