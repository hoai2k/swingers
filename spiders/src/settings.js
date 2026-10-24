// Player-facing settings, remembered per browser (guarded: storage can be
// unavailable, the defaults always work).

const KEY = 'spiders.settings.v1';

const DEFAULTS = {
  sound: true,
  music: true,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  screenShake: true,
  dropRate: 'normal',      // 'off' | 'normal' | 'frequent' — random weapon drops
  winScore: 5,             // VS rounds to win a match
  friendlyFire: false,     // survival
  board: 'random',         // 'random' or a board id
  slowmo: true,            // slow motion on the last kill of a round
  // VS: the Squeeze (closing hazard), see squeeze.js
  squeezeSpeed: 'normal',  // 'off' | 'static' | 'normal' | 'fast' | 'fastest'
  squeezeSides: 'all',     // 'one' | 'several' | 'all'
  squeezeDelay: 25,        // s of play before it starts closing
  // weapon pool (pool.js): 'everything' | 'blades' | 'demolition' | 'sharpshooters' | 'custom'
  weaponPool: 'everything',
  weaponMix: {},           // custom pool: weapon id -> 0 (off) .. 5; missing = its default
  mods: {},                // match modifiers switched on: id -> true (modifiers.js)
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return { ...DEFAULTS };
}

export const settings = load();
const listeners = [];
export function onSettingsChange(fn) { listeners.push(fn); }
export function setSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* not persisted */ }
  for (const fn of listeners) fn(key, value);
}
