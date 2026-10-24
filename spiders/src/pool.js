// Weapon pool: which weapons drop, and how often. Presets restrict the pool;
// 'custom' uses per-weapon weights 0 (off) .. 5 from settings.weaponMix.
// The "Blade Dance" modifier (game.mods.bladesOnly) narrows any pool to
// melee. Installed into weapons.js's randomWeaponId via weaponPool.weight.

import { WEAPONS, weaponPool } from './weapons.js';
import { settings } from './settings.js';

export const DEMOLITION = ['rocket', 'grenade', 'mines', 'singularity', 'swarm'];

export const POOLS = [
  ['everything', 'Everything'],
  ['blades', 'Blades'],
  ['demolition', 'Demolition'],
  ['sharpshooters', 'Sharpshooters'],
  ['custom', 'Custom'],
];

const isBlade = (C) => C.kind === 'melee';
const isBoom = (C) => DEMOLITION.includes(C.id);
const isGun = (C) => C.kind === 'gun' && !isBoom(C);

// the custom-mix value (0..5) for a weapon; unset = from its static weight
export function mixDefault(C) { return Math.max(1, Math.min(5, Math.round((C.weight ?? 1) * 3))); }
export function mixValue(id) {
  const v = settings.weaponMix && settings.weaponMix[id];
  if (Number.isFinite(v)) return v;
  const C = WEAPONS.get(id);
  return C ? mixDefault(C) : 3;
}

function presetWeight(C) {
  const base = C.weight ?? 1;
  switch (settings.weaponPool) {
    case 'blades': return isBlade(C) ? base : 0;
    case 'demolition': return isBoom(C) ? base : 0;
    case 'sharpshooters': return isGun(C) ? base : 0;
    case 'custom': return mixValue(C.id);
    default: return base;
  }
}

export function poolWeight(C, game) {
  // Blade Dance: melee only, whatever the pool (a pool with no blades in it
  // falls back to the blades' normal weights)
  if (game && game.mods && game.mods.bladesOnly) {
    if (!isBlade(C)) return 0;
    const anyBlade = [...WEAPONS.values()].some((D) => isBlade(D) && presetWeight(D) > 0);
    return anyBlade ? presetWeight(C) : (C.weight ?? 1);
  }
  return presetWeight(C);
}

// ids that can drop right now (for summaries / tests)
export function poolIds(game) { return [...WEAPONS.values()].filter((C) => poolWeight(C, game) > 0).map((C) => C.id); }

weaponPool.weight = poolWeight;
