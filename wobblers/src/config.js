// Shared constants: collision groups, player colours, world tuning.
import { EXTRA_HATS } from './hats.js';

export const DT = 1 / 60;
export const GRAVITY = -9.81;
export const MAX_PLAYERS = 8;

// Collision group bits. Rapier packs groups as (membership << 16) | filter.
export const G_STATIC = 1 << 0;
export const G_PROP = 1 << 1;
export const G_VEH = 1 << 2;      // vehicles and moving ride parts
export const playerBit = (i) => 1 << (3 + i);   // players 0..7: bits 3..10
export const NPC_BITS = [11, 12, 13, 14, 15];      // NPCs (src/npc.js) use playerBit(8..12)
export const ALL = 0xffff;
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const STATIC_GROUPS = groups(G_STATIC, ALL);
export const PROP_GROUPS = groups(G_PROP, ALL);
export const VEH_GROUPS = groups(G_VEH, ALL);
// Queries: camera only sees the static world; wheels see the ground and other vehicles.
export const CAMERA_QUERY = groups(ALL, G_STATIC);
export const WHEEL_QUERY = groups(ALL, G_STATIC | G_VEH);

export const SEA_LEVEL = -0.5;

export const PLAYER_COLORS = [
  0xff5a5a, // red
  0x3f8cff, // blue
  0x55d85a, // green
  0xffc233, // yellow
  0xb46cff, // purple
  0xff8a3d, // orange
  0x3fe0d0, // teal
  0xff7fc8, // pink
  0xffffff, // white
  0x5c5c6e, // charcoal
];
export const PLAYER_CSS = (c) => '#' + c.toString(16).padStart(6, '0');

// The first eight are always available; EXTRA_HATS (src/hats.js) are unlocked by presents.
export const HATS = ['none', 'cap', 'tophat', 'beanie', 'crown', 'party', 'cowboy', 'bucket', ...EXTRA_HATS];

export const SPAWN = { x: 0, y: 1.2, z: 14 };
