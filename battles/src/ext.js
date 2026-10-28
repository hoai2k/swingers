// Extension registry. Faction/mechanic packs in src/packs/ call register() at import
// time to add factions, units, held items, visuals, projectile types and behaviours
// without editing the core files. src/packs/index.js lists the packs.
//
// pack = {
//   factions: [{id, name, color, icon}],      // icon: inline SVG for the tab until
//                                           //   assets/ui/faction-<id>.png is delivered
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
//     parry(unit, attacker, kind) -> bool,  //   asked before a melee blow / shot lands:
//                                           //   true = caught (no blood or knockback; set
//                                           //   unit.parriedAt = battle.time, hit() then
//                                           //   scales the damage)
//     die(unit, killer),
//     standing(unit) -> bool,               //   a dead unit still has something fighting
//                                           //   for it (keeps the battle from ending)
//     standIn(unit) -> target | null,       //   ...and what enemies attack meanwhile: an
//                                           //   object with the unit fields AI reads (pos,
//                                           //   chestPos, headPos, alive, team, skel, def,
//                                           //   rag.vel/pos, hit(), s, M, stun)
//     control(unit, dt, control) -> bool,   //   possessed (game.js take control): runs
//                                           //   after the stick set desired/faceYaw; true
//                                           //   = it handled the attack button itself
//     aim: true } },                        //   a ranged pack kind: possession aims it at
//                                           //   the crosshair (control.aimPt, aimPitch)
//   (kind.basic / kind.skills: a possessed unit's techniques on X / LB / RB with their
//    cooldowns - see src/skills.js)
//   proj: { type: {g, len, r, stick, roll, explode, fuse, life,
//                  hit(battle, pr, victim, part) -> bool handled,
//                  ground(battle, pr) -> bool handled, step(battle, pr, dt)} },
//   buildProj(type, g, H) -> bool,          // projectile meshes
//   battleStep(battle, dt),                 // once per physics step
//   fx: { name: fn(fx, x, y, z, a, b, c, T) }, // particle effects for battle.emit(name, ...)
//                                           //   (src/fx.js: fx.bb/chunk/ring/dust/flash,
//                                           //   fx.gs = glowing, fx.ss = soft; T = atlas tiles)
//   obstacles: { kind: fn(o, map, H, box, parts, dn) }, // meshes for a map obstacle kind
//                                           //   (src/mapscene.js obstacleParts)
//   scenery: { props: fn(group, map, terrain, H, kit) }, // set dressing outside the field
//                                           //   for maps whose `props` is this key
//   (maps themselves: push the map def into MAPS from src/world.js; MAP_H has the
//   scenery helpers, TREES and PROPS)
// }
export const EXT = {
  factions: [], units: [], items: {}, kinds: {}, proj: {},
  buildItem: [], buildHat: [], decorate: [], buildProj: [], battleStep: [], fx: {}, obstacles: {}, scenery: {},
};

export function register(pack) {
  if (pack.factions) EXT.factions.push(...pack.factions);
  if (pack.units) EXT.units.push(...pack.units);
  if (pack.items) Object.assign(EXT.items, pack.items);
  if (pack.kinds) Object.assign(EXT.kinds, pack.kinds);
  if (pack.proj) Object.assign(EXT.proj, pack.proj);
  if (pack.fx) Object.assign(EXT.fx, pack.fx);
  if (pack.obstacles) Object.assign(EXT.obstacles, pack.obstacles);
  if (pack.scenery) Object.assign(EXT.scenery, pack.scenery);
  for (const k of ['buildItem', 'buildHat', 'decorate', 'buildProj', 'battleStep']) if (pack[k]) EXT[k].push(pack[k]);
}

// Pose hook: functions (st, pose) run at the end of computePose (src/pose.js), so packs
// can add stances such as riders sitting on a mount or flyers. A hook may set st.bob,
// which poseVisual adds to the pelvis height in setup previews and portraits.
// Packs push to it directly: EXT.pose.push(fn).
EXT.pose = [];
