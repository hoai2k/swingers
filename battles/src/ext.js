// Extension registry. Faction/mechanic packs in src/packs/ call register() at import
// time to add factions, units, held items, visuals, projectile types and behaviours
// without editing the core files. src/packs/index.js lists the packs.
//
// pack = {
//   factions: [{id, name, color}],
//   units: [unitDef],                      // same shape as src/units.js entries
//   items: { name: {len, r, grip, ...} },   // hit geometry, see src/items.js
//   buildItem(name, s, team, g, H) -> bool  // add meshes for a held item to group g
//   buildHat(kind, r, team, g, H) -> bool   // add meshes for a hat to group g
//   decorate(def, team, vis, H)             // extra meshes on parts; may push
//                                           //   {group, pos, quat} (unit-frame rest pose)
//                                           //   into vis.extraParts for extra bodies
//   kinds: { kindName: {                    // weapon.kind behaviours
//     init(unit),                           //   after the ragdoll exists (unit.addExtraBody)
//     think(unit, dt, ctx) -> faceTarget,   //   AI: set unit.desired, start attacks;
//                                           //   ctx {t, dist, gap, dirx, dirz, spd}
//     event(unit, t0, t1),                  //   attack animation progressed t0 -> t1
//     step(unit, dt),                       //   every physics step after think
//     hit(unit, amount, part, attacker, kind) -> amount,  // modify incoming damage
//     die(unit, killer) } },
//   proj: { type: {g, len, r, stick, roll, explode, fuse, life,
//                  hit(battle, pr, victim, part) -> bool handled,
//                  ground(battle, pr) -> bool handled, step(battle, pr, dt)} },
//   buildProj(type, g, H) -> bool,          // projectile meshes
//   battleStep(battle, dt),                 // once per physics step
// }
export const EXT = {
  factions: [], units: [], items: {}, kinds: {}, proj: {},
  buildItem: [], buildHat: [], decorate: [], buildProj: [], battleStep: [],
};

export function register(pack) {
  if (pack.factions) EXT.factions.push(...pack.factions);
  if (pack.units) EXT.units.push(...pack.units);
  if (pack.items) Object.assign(EXT.items, pack.items);
  if (pack.kinds) Object.assign(EXT.kinds, pack.kinds);
  if (pack.proj) Object.assign(EXT.proj, pack.proj);
  for (const k of ['buildItem', 'buildHat', 'decorate', 'buildProj', 'battleStep']) if (pack[k]) EXT[k].push(pack[k]);
}
