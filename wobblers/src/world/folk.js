// Home island NPCs (src/npc.js): a few townsfolk, a lifeguard, a farmer, a
// fisherman on the pier, a chef by the cafe and someone who likes the plaza benches.
export function buildFolk(game) {
  const N = (role, x, z, opts) => game.npcs.spawn(role, x, z, opts);
  N('townsfolk', 8, 24, { area: { x: 0, z: 30, r: 14 } });
  N('townsfolk', -26, 12, { area: { x: -30, z: 10, r: 18 } });
  N('townsfolk', 30, -10, { area: { x: 34, z: -8, r: 14 } });
  N('townsfolk', 11, -11, { behaviour: 'sit', lines: ['Lovely fountain, isn\'t it?', 'Morning!'] });
  N('lifeguard', 57, 308, { yaw: Math.PI });
  N('farmer', 222, -142, { area: { x: 220, z: -140, r: 12 } });
  N('fisherman', 24, 365.5, { yaw: Math.PI });
  N('chef', 14.5, -21, { yaw: 0, lines: ['Coffee\'s fresh!', 'Try the cake!'] });
}
