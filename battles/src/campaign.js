// Campaign: TABS-style challenge levels. Each level is a fixed enemy army (Red,
// on the right half of the field) on a map, with a gold budget and a unit limit
// for the player's army (Blue). Winning earns 1-3 stars depending on how little
// gold you spent; levels unlock one after another, and each world unlocks once
// every level of the previous world is beaten.
//
// Levels are plain data. Enemy armies use unit ids from src/units.js (or packs);
// ids that don't exist are skipped, so packs can be added or removed freely.
// The Red zone is x 3..42, z -32..32 (Red faces -x); see FIELD in world.js.
//
// level = { id, name, map (world.js map id), budget, cap, army: [{type, x, z}],
//           tip?, stars?: [gold for 3 stars, gold for 2 stars] (default 70% / 90% of budget) }
// world = { id, name, color, factions (ids the player may use; null = every faction), levels }
import { UNIT_BY_ID } from './units.js';

// ---- formation helpers (all in the Red zone; x grows away from the enemy)
const SP = 1.8;
// n units in a line across the field, centred on z
const line = (type, n, x, z = 0, sp = SP) => Array.from({ length: n }, (_, i) => ({ type, x, z: z + (i - (n - 1) / 2) * sp }));
// cols across × rows deep, front row at x
const block = (type, cols, rows, x, z = 0, sp = SP) => {
  const out = [];
  for (let r = 0; r < rows; r++) out.push(...line(type, cols, x + r * sp, z, sp));
  return out;
};
const one = (type, x, z = 0) => [{ type, x, z }];

export const WORLDS = [
  {
    id: 'tribal', name: 'Tribal Lands', color: '#c98a4b', factions: ['tribal', 'farmer'],
    levels: [
      { id: 't1', name: 'First Contact', map: 'grass', budget: 500, cap: 12, tip: 'Six clubbers. Anything sturdier will do.',
        army: line('clubber', 6, 14) },
      { id: 't2', name: 'Shield Wall', map: 'grass', budget: 700, cap: 14, tip: 'Protectors soak hits: go round them or knock them over.',
        army: [...line('protector', 6, 12), ...line('clubber', 4, 15)] },
      { id: 't3', name: 'Spears Incoming', map: 'grass', budget: 900, cap: 16, tip: 'Spear throwers hang back; rush them.',
        army: [...line('clubber', 6, 12), ...line('spear_thrower', 4, 20, 0, 3)] },
      { id: 't4', name: 'Hay Day', map: 'autumn', budget: 1000, cap: 18, tip: 'Hay bales bowl over tight formations.',
        army: [...block('farmer', 4, 2, 12), ...line('hay_baler', 3, 19, 0, 4)] },
      { id: 't5', name: 'The Chieftain', map: 'grass', budget: 1500, cap: 24, tip: 'Two chieftains lead the charge.',
        army: [...line('protector', 4, 11), ...block('clubber', 4, 2, 14), ...line('chieftain', 2, 19, 0, 5)] },
    ],
  },
  {
    id: 'medieval', name: 'Medieval Kingdom', color: '#7f9ad1', factions: ['tribal', 'farmer', 'medieval'],
    levels: [
      { id: 'm1', name: 'Archer Line', map: 'desert', budget: 1000, cap: 16, tip: 'Eight archers, nobody to protect them.',
        army: line('archer', 8, 20, 0, 2.4) },
      { id: 'm2', name: 'Squire Squad', map: 'desert', budget: 1300, cap: 20, tip: 'Take out the healers first if you can.',
        army: [...block('squire', 5, 2, 12), ...line('healer', 2, 18, 0, 6)] },
      { id: 'm3', name: 'One Knight', map: 'grass', budget: 800, cap: 14, tip: 'A lone knight, cheered on by bards.',
        army: [...one('knight', 13), ...line('bard', 4, 17, 0, 3)] },
      { id: 'm4', name: 'Potion Panic', map: 'autumn', budget: 1400, cap: 24, tip: 'Halflings swarm while the potions fly.',
        army: [...block('halfling', 4, 2, 11), ...line('potion_seller', 3, 19, 0, 5)] },
      { id: 'm5', name: 'The King', map: 'desert', budget: 3500, cap: 30, tip: 'The King, his knights and his archers.',
        army: [...line('knight', 2, 12, 0, 4), ...one('king', 17), ...line('archer', 6, 22, 0, 2.6)] },
    ],
  },
  {
    id: 'legacy', name: 'Legacy Peaks', color: '#c66bd1', factions: ['tribal', 'farmer', 'medieval', 'legacy'],
    levels: [
      { id: 'l1', name: 'Berserk', map: 'winter', budget: 1600, cap: 20, tip: 'Four berserkers. They do not stop.',
        army: line('berserker', 4, 14, 0, 3) },
      { id: 'l2', name: 'Bombs Away', map: 'winter', budget: 2200, cap: 24, tip: 'Spread out: bombers blow up crowds.',
        army: [...line('protector', 6, 11), ...line('bomber', 6, 14, 0, 2.6)] },
      { id: 'l3', name: "Wizard's Guard", map: 'autumn', budget: 2600, cap: 28, tip: 'Squires guard two wizards at the back.',
        army: [...block('squire', 5, 2, 11), ...line('wizard', 2, 22, 0, 8)] },
      { id: 'l4', name: 'Giant Problem', map: 'winter', budget: 2000, cap: 24, tip: 'One giant and his little friends.',
        army: [...one('giant', 16), ...line('clubber', 6, 11, 0, 2.2)] },
      { id: 'l5', name: 'Legacy Legion', map: 'winter', budget: 6500, cap: 32, tip: 'Giants, wizards and berserkers.',
        army: [...line('berserker', 4, 11, 0, 3), ...line('giant', 2, 17, 0, 9), ...line('wizard', 2, 25, 0, 8)] },
    ],
  },
  {
    id: 'final', name: 'Total Battle', color: '#e2a03b', factions: null,
    levels: [
      { id: 'f1', name: 'Mixed Bag', map: 'grass', budget: 2800, cap: 30, tip: 'A bit of everything.',
        army: [...line('farmer', 6, 11), ...line('knight', 2, 14, 0, 5), ...line('bomber', 2, 16, 0, 8), ...line('archer', 4, 21, 0, 3)] },
      { id: 'f2', name: 'Healing Circle', map: 'autumn', budget: 2400, cap: 30, tip: 'Knights that keep getting back up.',
        army: [...line('squire', 6, 11), ...line('knight', 2, 14, 0, 5), ...line('healer', 4, 18, 0, 3)] },
      { id: 'f3', name: 'Ranged Hell', map: 'desert', budget: 3500, cap: 36, tip: 'Everything throws something.',
        army: [...line('archer', 8, 16, 0, 2.4), ...line('spear_thrower', 4, 19, 0, 4), ...line('hay_baler', 3, 22, 0, 5), ...line('wizard', 2, 27, 0, 10)] },
      { id: 'f4', name: 'Halfling Horde', map: 'grass', budget: 3000, cap: 60, tip: 'Sixty tiny, angry halflings.',
        army: block('halfling', 12, 5, 10, 0, 1.4) },
      { id: 'f5', name: 'Total Battle', map: 'winter', budget: 11000, cap: 50, tip: 'The final army. Good luck.',
        army: [...line('knight', 6, 11, 0, 2.8), ...line('giant', 2, 16, 0, 12), ...one('king', 18), ...line('archer', 8, 24, 0, 2.4), ...line('wizard', 2, 28, 0, 10)] },
    ],
  },
];

export const LEVELS = WORLDS.flatMap((w, wi) => w.levels.map((l, li) => Object.assign(l, { world: wi, index: li })));
export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;

// The enemy army with unknown unit ids dropped (packs may come and go).
export function enemyArmy(level) {
  return level.army.filter((a) => UNIT_BY_ID[a.type]).map((a) => ({ type: a.type, x: a.x, z: a.z }));
}
export const armyValue = (army) => army.reduce((s, a) => s + (UNIT_BY_ID[a.type]?.cost || 0), 0);

export function starGold(level) {
  return level.stars || [Math.round(level.budget * 0.7), Math.round(level.budget * 0.9)];
}
export function starsFor(level, spent) {
  const [g3, g2] = starGold(level);
  return spent <= g3 ? 3 : spent <= g2 ? 2 : 1;
}

// ---- progress (localStorage)
const KEY = 'wobbly-battles.campaign.v1';
export function loadProgress() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* storage unavailable */ }
  return { stars: p.stars || {}, best: p.best || {}, armies: p.armies || {}, coop: !!p.coop, last: p.last || null };
}
export function saveProgress(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

export const worldUnlocked = (prog, wi) => wi === 0 || WORLDS[wi - 1].levels.every((l) => prog.stars[l.id] > 0);
export const levelUnlocked = (prog, level) => worldUnlocked(prog, level.world) && (level.index === 0 || prog.stars[WORLDS[level.world].levels[level.index - 1].id] > 0);
export const totalStars = (prog) => LEVELS.reduce((s, l) => s + (prog.stars[l.id] || 0), 0);
export const nextLevel = (level) => LEVELS[LEVELS.indexOf(level) + 1] || null;
