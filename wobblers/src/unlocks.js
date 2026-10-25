// Presents hidden around the island (world/presents.js places them) and the
// cosmetics they unlock. Finding one unlocks its reward for every player and
// is remembered in localStorage (settings.presents holds the found ids).
import { settings, saveSettings } from './settings.js';
import { isBought } from './life/state.js';
import { JOB_OUTFITS } from './outfits.js';

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
export let TOTAL = PRESENTS.length; // live: regions add presents with addPresent()

// Cosmetics sold in the town's clothes shop (src/life/shops.js): [reward key, price].
// A separate set from the present rewards, so presents stay the only way to get theirs.
export const SHOP_COSMETICS = [
  ['hat:beret', 40], ['hat:bowler', 50], ['hat:sombrero', 70], ['hat:frog', 80],
  ['hat:antlers', 90], ['hat:tiara', 110], ['hat:pumpkin', 120], ['hat:jester', 140],
  ['face:Heart eyes', 60], ['face:Tongue out', 50], ['face:Dizzy', 60], ['face:Nerd', 70],
  ['pants:Lime', 25], ['pants:Navy', 25], ['pants:Teal', 30], ['pants:Lilac', 30], ['pants:Cream', 30],
  ['outfit:apron', 40], ['outfit:tutu', 80], ['outfit:cape', 120], ['outfit:wings', 150],
];
const BUYABLE = new Map(SHOP_COSMETICS);
export const priceOf = (key) => BUYABLE.get(key);
const REWARD = new Map(PRESENTS);
const LOCKABLE = new Set(PRESENTS.map((p) => p[1]));

let unlocked = new Set();
function refresh() { unlocked = new Set(settings.presents.filter((id) => REWARD.has(id)).map((id) => REWARD.get(id))); }
refresh();

// Region presents: world/regions call R.present(...) while they build (before
// world/presents.js places the boxes), which registers the id and reward here.
export function addPresent(id, rewardKey) {
  if (REWARD.has(id)) throw new Error(`present id '${id}' is already used`);
  PRESENTS.push([id, rewardKey]);
  REWARD.set(id, rewardKey);
  LOCKABLE.add(rewardKey);
  TOTAL = PRESENTS.length;
  refresh();
}

export const isFound = (id) => settings.presents.includes(id);
export const foundCount = () => settings.presents.filter((id) => REWARD.has(id)).length;
export const rewardOf = (id) => REWARD.get(id);
// true for a reward that hasn't been found yet (base items are never locked)
// (shop items stay locked until bought)
// Job outfits (src/outfits.js) unlock the first time that job is finished.
const JOB_OF = new Map(Object.entries(JOB_OUTFITS).map(([job, key]) => [key, job]));
const jobWon = (job) => (settings.missions?.best?.[job]?.wins || 0) > 0;
export const isLocked = (key) => (LOCKABLE.has(key) && !unlocked.has(key)) || (BUYABLE.has(key) && !isBought(key)) || (JOB_OF.has(key) && !jobWon(JOB_OF.get(key)));
export const jobLockedCount = (type) => [...JOB_OF.keys()].filter((k) => k.startsWith(type + ':') && !jobWon(JOB_OF.get(k))).length;
export const lockedCount = (type) => [...LOCKABLE].filter((k) => k.startsWith(type + ':') && !unlocked.has(k)).length;
export const shopLockedCount = (type) => [...BUYABLE.keys()].filter((k) => k.startsWith(type + ':') && !isBought(k)).length;

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
