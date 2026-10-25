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
// world = { id, name, color, factions (ids the player may use; null = every faction), bonus?, levels }
//
// Every level is checked by the headless solver in dev/campaign/ (solve.mjs finds
// the cheapest reliable win per level, apply.mjs writes `stars` and raises budgets
// from it, report.mjs checks that every star tier is reachable). Re-run it after
// changing unit stats or enemy armies; see the top of dev/campaign/solve.mjs.
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
      { id: 't1', name: 'First Contact', map: 'grass', budget: 700, cap: 12, stars: [500, 600], tip: 'Six clubbers. Anything sturdier will do.',
        army: line('clubber', 6, 14) },
      { id: 't2', name: 'Shield Wall', map: 'grass', budget: 1200, cap: 14, stars: [850, 1000], tip: 'Protectors soak hits: go round them or knock them over.',
        army: [...line('protector', 6, 12), ...line('clubber', 4, 15)] },
      { id: 't3', name: 'Spears Incoming', map: 'grass', budget: 1300, cap: 16, stars: [900, 1050], tip: 'Spear throwers hang back; rush them.',
        army: [...line('clubber', 6, 12), ...line('spear_thrower', 4, 20, 0, 3)] },
      { id: 't4', name: 'Hay Day', map: 'autumn', budget: 1600, cap: 18, stars: [1050, 1350], tip: 'Hay bales bowl over tight formations.',
        army: [...line('farmer', 6, 12), ...line('hay_baler', 2, 19, 0, 5)] },
      { id: 't5', name: 'The Chieftain', map: 'grass', budget: 2400, cap: 24, stars: [1600, 2050], tip: 'Two chieftains lead the charge.',
        army: [...line('protector', 4, 11), ...block('clubber', 4, 2, 14), ...line('chieftain', 2, 19, 0, 5)] },
    ],
  },
  {
    id: 'medieval', name: 'Medieval Kingdom', color: '#7f9ad1', factions: ['tribal', 'farmer', 'medieval'],
    levels: [
      { id: 'm1', name: 'Archer Line', map: 'desert', budget: 1000, cap: 16, stars: [600, 700], tip: 'Eight archers, nobody to protect them.',
        army: line('archer', 8, 20, 0, 2.4) },
      { id: 'm2', name: 'Squire Squad', map: 'desert', budget: 1800, cap: 20, stars: [1300, 1500], tip: 'Take out the healers first if you can.',
        army: [...block('squire', 5, 2, 12), ...line('healer', 2, 18, 0, 6)] },
      { id: 'm3', name: 'One Knight', map: 'grass', budget: 700, cap: 14, stars: [400, 600], tip: 'A lone knight, cheered on by bards.',
        army: [...one('knight', 13), ...line('bard', 4, 17, 0, 3)] },
      { id: 'm4', name: 'Potion Panic', map: 'autumn', budget: 1400, cap: 24, stars: [650, 750], tip: 'Halflings swarm while the potions fly.',
        army: [...block('halfling', 4, 2, 11), ...line('potion_seller', 3, 19, 0, 5)] },
      { id: 'm5', name: 'The King', map: 'desert', budget: 5300, cap: 30, stars: [4000, 4600], tip: 'The King, his squires and his archers.',
        army: [...line('squire', 4, 12, 0, 3), ...one('king', 16), ...line('archer', 6, 22, 0, 2.6)] },
    ],
  },
  {
    id: 'legacy', name: 'Legacy Peaks', color: '#c66bd1', factions: ['tribal', 'farmer', 'medieval', 'legacy'],
    levels: [
      { id: 'l1', name: 'Berserk', map: 'winter', budget: 2000, cap: 20, stars: [1450, 1700], tip: 'Four berserkers. They do not stop.',
        army: line('berserker', 4, 14, 0, 3) },
      { id: 'l2', name: 'Bombs Away', map: 'winter', budget: 2200, cap: 24, stars: [900, 1050], tip: 'Spread out: bombers blow up crowds.',
        army: [...line('protector', 6, 11), ...line('bomber', 6, 14, 0, 2.6)] },
      { id: 'l3', name: "Wizard's Guard", map: 'autumn', budget: 3200, cap: 28, stars: [1950, 2250], tip: 'Squires guard two wizards at the back.',
        army: [...line('squire', 6, 11), ...line('wizard', 2, 22, 0, 8)] },
      { id: 'l4', name: 'Giant Problem', map: 'winter', budget: 2300, cap: 24, stars: [1700, 2000], tip: 'Two giants and their little friends.',
        army: [...line('giant', 2, 16, 0, 10), ...line('clubber', 6, 11, 0, 2.2)] },
      { id: 'l5', name: 'Legacy Legion', map: 'winter', budget: 10700, cap: 32, stars: [8000, 9200], tip: 'Giants, wizards and berserkers.',
        army: [...line('berserker', 4, 11, 0, 3), ...line('giant', 2, 17, 0, 9), ...line('wizard', 2, 25, 0, 8)] },
    ],
  },
  {
    id: 'ancient', name: 'Ancient & Viking', color: '#d9b25a', factions: ['medieval', 'ancient', 'viking'],
    levels: [
      { id: 'a1', name: 'Phalanx', map: 'desert', budget: 2200, cap: 20, stars: [1600, 1850], tip: 'Hoplites are tougher shoulder to shoulder. Break the line apart.',
        army: block('an_hoplite', 6, 2, 12, 0, 1.6) },
      { id: 'a2', name: 'Venom Volley', map: 'desert', budget: 2000, cap: 20, stars: [1050, 1250], tip: 'Long pikes in front, poison arrows behind. The poison keeps ticking.',
        army: [...line('an_sarissa', 6, 12, 0, 1.8), ...line('an_snake_archer', 5, 20, 0, 2.6)] },
      { id: 'a3', name: 'Headbutt Hill', map: 'winter', budget: 2500, cap: 20, stars: [1500, 1750], tip: 'Headbutters charge in and flatten whatever is in front.',
        army: [...line('vk_headbutter', 6, 12, 0, 2), ...line('vk_brawler', 6, 15, 0, 2)] },
      { id: 'a4', name: 'Horns on Ice', map: 'winter', budget: 2800, cap: 22, stars: [2050, 2400], tip: 'A minotaur charge, then frost arrows slow down everyone left standing.',
        army: [...one('an_minotaur', 13), ...line('vk_ice_archer', 6, 20, 0, 2.6), ...line('vk_brawler', 3, 15, 0, 3)] },
      { id: 'a5', name: 'Thunder Gods', map: 'desert', budget: 5000, cap: 30, stars: [3700, 4300], tip: 'Zeus throws lightning, the Jarl leaps in and a Valkyrie dives from above.',
        army: [...line('an_hoplite', 6, 12, 0, 1.6), ...one('vk_jarl', 15), ...one('sm_valkyrie', 18, 6), ...one('an_zeus', 24)] },
    ],
  },
  {
    id: 'dynasty', name: 'Dynasty & Prehistoric', color: '#d8573c', factions: ['ancient', 'viking', 'dynasty', 'prehistoric'],
    levels: [
      { id: 'd1', name: 'Palm Strike', map: 'autumn', budget: 1600, cap: 20, stars: [1100, 1300], tip: 'Monks launch whoever they hit. Heavy units fly less far.',
        army: block('dy_monk', 6, 2, 12, 0, 1.7) },
      { id: 'd2', name: 'Clever Girls', map: 'grass', budget: 2000, cap: 22, stars: [1200, 1400], tip: 'Raptors hunt in packs and pin their prey. Keep your army together.',
        army: [...line('pr_raptor', 8, 14, 0, 2), ...line('pr_caveman', 6, 11, 0, 2)] },
      { id: 'd3', name: 'Rocket Rain', map: 'autumn', budget: 2600, cap: 24, stars: [1900, 2200], tip: 'Samurai parry from the front. The hwacha fills the sky with rockets.',
        army: [...line('dy_samurai', 4, 12, 0, 2.4), ...line('dy_firework', 3, 19, 0, 4), ...one('dy_hwacha', 24)] },
      { id: 'd4', name: 'Sky Snatchers', map: 'grass', budget: 2600, cap: 24, stars: [1250, 1450], tip: 'Pterodactyls carry small units up high and let go. Bring something heavy.',
        army: [...line('pr_ptero', 2, 18, 0, 8), ...one('pr_raptor_rider', 13), ...line('pr_caveman', 6, 11, 0, 2)] },
      { id: 'd5', name: 'Lizard King', map: 'autumn', budget: 6000, cap: 30, stars: [3750, 4350], tip: 'A T-Rex with a samurai escort. Its roar sends whole armies running.',
        army: [...one('pr_trex', 17), ...line('dy_samurai', 4, 12, 0, 3), ...line('dy_firework', 2, 22, 0, 6)] },
    ],
  },
  {
    id: 'pirate', name: 'Pirate & Wild West', color: '#3d8fc4', factions: ['dynasty', 'prehistoric', 'pirate', 'wildwest'],
    levels: [
      { id: 'p1', name: 'High Noon', map: 'desert', budget: 2000, cap: 20, stars: [1100, 1300], tip: 'Cactuses do not move, but they hurt. The gunslingers hide behind them.',
        army: [...line('ww_cactus', 4, 10, 0, 4), ...line('ww_gunslinger', 4, 17, 0, 3.5)] },
      { id: 'p2', name: 'Rope Trick', map: 'desert', budget: 1800, cap: 20, stars: [1000, 1150], tip: 'Lassos drag your units straight into the buckshot.',
        army: [...line('ww_lasso', 6, 14, 0, 2.5), ...line('ww_blunderbuss', 4, 18, 0, 3)] },
      { id: 'p3', name: 'Powder Keg', map: 'grass', budget: 2200, cap: 24, stars: [1100, 1300], tip: 'Bombs and dynamite: spread out, crowds go boom.',
        army: [...line('pi_flintlock', 4, 13, 0, 3), ...line('pi_bomb', 4, 17, 0, 3.5), ...line('ww_dynamite', 4, 21, 0, 3.5)] },
      { id: 'p4', name: 'Harpoon Harbour', map: 'autumn', budget: 2400, cap: 24, stars: [1600, 1850], tip: 'Harpoons haul units in to the captain and his cutlass.',
        army: [...line('pi_harpooner', 6, 16, 0, 2.6), ...one('pi_captain', 12), ...line('pi_flintlock', 4, 20, 0, 3)] },
      { id: 'p5', name: "The Queen's Fleet", map: 'desert', budget: 4000, cap: 30, stars: [1950, 2250], tip: 'The Pirate Queen, her captain, a cannon and a crew of gunmen.',
        army: [...one('pi_queen', 14), ...one('pi_captain', 12, 5), ...line('pi_flintlock', 4, 17, 0, 3), ...one('pi_cannon', 24)] },
    ],
  },
  {
    id: 'renaissance', name: 'Renaissance & Spooky', color: '#8a5ac9', factions: ['pirate', 'wildwest', 'renaissance', 'spooky'],
    levels: [
      { id: 'r1', name: 'Bone Yard', map: 'autumn', budget: 1600, cap: 30, stars: [1050, 1250], tip: 'Cheap, rattly and lots of them.',
        army: [...block('sp_skeleton', 10, 2, 11, 0, 1.6), ...line('sp_skel_archer', 6, 17, 0, 2.6)] },
      { id: 'r2', name: 'En Garde', map: 'grass', budget: 2000, cap: 22, stars: [900, 1050], tip: 'Fencers dart in and out. Halberds keep you at arm\'s length.',
        army: [...line('rn_fencer', 5, 14, 0, 2.6), ...line('rn_halberd', 4, 11, 0, 2.4)] },
      { id: 'r3', name: 'Fire!', map: 'grass', budget: 2900, cap: 24, stars: [2050, 2400], tip: 'Musketeers fire together. Painters slow you down on the way in.',
        army: [...line('rn_halberd', 4, 11, 0, 3), ...line('rn_musketeer', 6, 15, 0, 2.4), ...line('rn_painter', 3, 20, 0, 4)] },
      { id: 'r4', name: 'Night of the Vampire', map: 'winter', budget: 2600, cap: 24, stars: [1350, 1600], tip: 'Vampires heal on every bite. Candleheads set you alight.',
        army: [...line('sp_vampire', 3, 13, 0, 4), ...line('sp_candlehead', 4, 19, 0, 3.5)] },
      { id: 'r5', name: "Leonardo's Reaper", map: 'autumn', budget: 7200, cap: 30, stars: [5350, 6200], tip: 'Da Vinci\'s war machine, a balloon squadron and the Reaper himself.',
        army: [...one('sp_reaper', 13), ...one('rn_davinci', 20), ...line('rn_balloon', 2, 22, 0, 12), ...line('rn_musketeer', 4, 16, 0, 3)] },
    ],
  },
  {
    id: 'goodevil', name: 'Good & Evil', color: '#e8e0b0',
    factions: ['tribal', 'farmer', 'medieval', 'legacy', 'ancient', 'viking', 'dynasty', 'prehistoric', 'pirate', 'wildwest', 'renaissance', 'spooky', 'good', 'evil'],
    levels: [
      { id: 'g1', name: 'Holy Wall', map: 'grass', budget: 1500, cap: 24, stars: [950, 1100], tip: 'Shield bearers block nearly everything from the front. Clerics keep them topped up.',
        army: [...line('gd_shield_bearer', 8, 12, 0, 2), ...line('gd_cleric', 3, 17, 0, 5)] },
      { id: 'g2', name: 'Spin Cycle', map: 'autumn', budget: 1500, cap: 24, stars: [1100, 1300], tip: 'Fans blow your arrows back. Mace spinners get dizzy after a while.',
        army: [...line('ev_mace_spinner', 5, 12, 0, 3.5), ...line('ev_fan_bearer', 6, 17, 0, 3)] },
      { id: 'g3', name: 'Rise Again', map: 'winter', budget: 2600, cap: 30, stars: [1500, 1750], tip: 'Everything that dies near a necromancer gets back up for the enemy.',
        army: [...block('sp_skeleton', 10, 2, 11, 0, 1.7), ...line('ev_mace_spinner', 2, 15, 0, 8), ...line('ev_necromancer', 3, 19, 0, 7)] },
      { id: 'g4', name: 'Wings of Light', map: 'grass', budget: 3000, cap: 30, stars: [1350, 2300], tip: 'The angel raises the fallen; the phoenix is reborn from its ashes.',
        army: [...one('gd_angel', 16), ...one('gd_phoenix', 20), ...line('gd_shield_bearer', 4, 12, 0, 2.4)] },
      { id: 'g5', wip: true, name: 'End of Time', map: 'winter', budget: 5000, cap: 36, stars: [2850, 3300], tip: 'The Super Peasant, a tree giant and a chronomancer bending time.',
        army: [...one('gd_super_peasant', 14), ...one('ev_tree_giant', 20), ...one('ev_chronomancer', 26), ...line('gd_cleric', 2, 22, 0, 8)] },
    ],
  },
  {
    id: 'final', name: 'Total Battle', color: '#e2a03b', factions: null,
    levels: [
      { id: 'f1', wip: true, name: 'Mixed Bag', map: 'grass', budget: 3300, cap: 30, stars: [2400, 2800], tip: 'A bit of everything.',
        army: [...line('farmer', 6, 11), ...line('knight', 2, 14, 0, 5), ...line('bomber', 2, 16, 0, 8), ...line('archer', 4, 21, 0, 3)] },
      { id: 'f2', wip: true, name: 'Healing Circle', map: 'autumn', budget: 2600, cap: 30, stars: [1900, 2200], tip: 'Knights that keep getting back up.',
        army: [...line('squire', 6, 11), ...line('knight', 2, 14, 0, 5), ...line('healer', 4, 18, 0, 3)] },
      { id: 'f3', wip: true, name: 'Ranged Hell', map: 'desert', budget: 3500, cap: 36, stars: [2300, 2650], tip: 'Everything throws something.',
        army: [...line('archer', 8, 16, 0, 2.4), ...line('spear_thrower', 4, 19, 0, 4), ...line('hay_baler', 3, 22, 0, 5), ...one('wizard', 27)] },
      { id: 'f4', wip: true, name: 'Halfling Horde', map: 'grass', budget: 2000, cap: 60, stars: [1200, 1400], tip: 'Forty-eight tiny, angry halflings.',
        army: block('halfling', 12, 4, 10, 0, 1.4) },
      { id: 'f5', wip: true, name: 'Total Battle', map: 'winter', budget: 11000, cap: 50, stars: [6250, 7200], tip: 'The final army. Good luck.',
        army: [...line('knight', 6, 11, 0, 2.8), ...line('giant', 2, 16, 0, 12), ...one('king', 18), ...line('archer', 8, 24, 0, 2.4), ...line('wizard', 2, 28, 0, 10)] },
    ],
  },
  {
    id: 'secret', name: 'Secret Stash', color: '#3fd0a0', factions: null, bonus: true,
    levels: [
      { id: 's1', wip: true, name: 'Slippery Slope', map: 'grass', budget: 1200, cap: 24, stars: [600, 700], tip: 'Banana peels everywhere. Mind your step.',
        army: [...line('vk_brawler', 5, 12, 0, 2), ...line('sc_banana', 6, 17, 0, 2.6)] },
      { id: 's2', wip: true, name: 'Gimme a W!', map: 'autumn', budget: 1200, cap: 24, stars: [550, 650], tip: 'Cheerleaders make everyone near them faster, harder hitting and fearless.',
        army: [...block('clubber', 5, 2, 12, 0, 1.8), ...line('sc_cheerleader', 3, 17, 0, 4)] },
      { id: 's3', wip: true, name: 'Special Delivery', map: 'desert', budget: 1000, cap: 24, stars: [450, 550], tip: 'Bombs on sticks, delivered in person, and bananas to slip on.',
        army: [...line('sc_bomb_stick', 7, 14, 0, 2.6), ...line('sc_banana', 3, 20, 0, 5)] },
      { id: 's4', wip: true, name: 'Chicken Run', map: 'grass', budget: 2400, cap: 26, stars: [1350, 1600], tip: 'Angry chickens, and lightning that jumps from unit to unit.',
        army: [...line('sc_chicken_man', 6, 16, 0, 2.6), ...one('sc_lightning_gun', 22), ...line('protector', 4, 12, 0, 2.4)] },
      { id: 's5', wip: true, name: 'Winter God', map: 'winter', budget: 3500, cap: 30, stars: [2100, 2450], tip: 'Ullr on skis: three hits and you freeze solid.',
        army: [...line('sc_ullr', 2, 16, 0, 8), ...line('sc_lightning_gun', 2, 24, 0, 8), ...line('sc_cheerleader', 2, 19, 0, 5), ...line('vk_brawler', 4, 12, 0, 2.4)] },
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

// A world opens once every level of the world before it is beaten. A world or
// level that already has stars stays open even if worlds were inserted before
// it in a later version (old saves keep what they had).
const beaten = (prog, l) => prog.stars[l.id] > 0;
export const worldUnlocked = (prog, wi) => wi === 0 || WORLDS[wi - 1].levels.every((l) => beaten(prog, l)) || WORLDS[wi].levels.some((l) => beaten(prog, l));
export const levelUnlocked = (prog, level) => beaten(prog, level) ||
  (worldUnlocked(prog, level.world) && (level.index === 0 || beaten(prog, WORLDS[level.world].levels[level.index - 1])));
export const totalStars = (prog) => LEVELS.reduce((s, l) => s + (prog.stars[l.id] || 0), 0);
export const nextLevel = (level) => LEVELS[LEVELS.indexOf(level) + 1] || null;
