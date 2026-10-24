// Presents hidden around the island (world/presents.js places them) and the
// cosmetics they unlock. Finding one unlocks its reward for every player and
// is remembered in localStorage (settings.presents holds the found ids).
import { settings, saveSettings } from './settings.js';

// [present id, reward key]. Reward keys are 'hat:<HATS name>', 'face:<FACES name>'
// or 'pants:<PANTS name>'; every key listed here starts locked.
export const PRESENTS = [
  ['fountain', 'hat:viking'],
  ['cafe-roof', 'hat:chef'],
  ['arcade', 'hat:headphones'],
  ['house-upstairs', 'face:Star eyes'],
  ['market', 'pants:Gold'],
  ['under-pier', 'hat:pirate'],
  ['lifeguard', 'hat:propeller'],
  ['lighthouse', 'hat:santa'],
  ['water-slide', 'face:Winky'],
  ['high-dive', 'hat:astronaut'],
  ['slide-tower', 'hat:bunny'],
  ['sandbox', 'pants:Pink'],
  ['ferris-wheel', 'hat:wizard'],
  ['bouncy-castle', 'hat:catears'],
  ['coaster', 'hat:trafficcone'],
  ['stunt-jump', 'hat:hardhat'],
  ['half-pipe', 'face:Robot'],
  ['football-goal', 'pants:Sky'],
  ['grandstand', 'hat:mortarboard'],
  ['lookout', 'hat:halo'],
  ['lake-raft', 'hat:flowers'],
  ['barn', 'pants:Plaid red'],
  ['lake-dock', 'hat:fez'],
  ['campfire', 'face:Moustache'],
];
export const TOTAL = PRESENTS.length;
const REWARD = new Map(PRESENTS);
const LOCKABLE = new Set(PRESENTS.map((p) => p[1]));

let unlocked = new Set();
function refresh() { unlocked = new Set(settings.presents.filter((id) => REWARD.has(id)).map((id) => REWARD.get(id))); }
refresh();

export const isFound = (id) => settings.presents.includes(id);
export const foundCount = () => settings.presents.filter((id) => REWARD.has(id)).length;
export const rewardOf = (id) => REWARD.get(id);
// true for a reward that hasn't been found yet (base items are never locked)
export const isLocked = (key) => LOCKABLE.has(key) && !unlocked.has(key);
export const lockedCount = (type) => [...LOCKABLE].filter((k) => k.startsWith(type + ':') && !unlocked.has(k)).length;

// Marks a present as found; returns its reward key (null if it was already found).
export function findPresent(id) {
  if (!REWARD.has(id) || isFound(id)) return null;
  settings.presents.push(id);
  refresh();
  saveSettings();
  return REWARD.get(id);
}

export function resetPresents() {
  settings.presents.length = 0;
  refresh();
  saveSettings();
}
