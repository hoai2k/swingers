// Persistent settings (localStorage). Global audio/video settings plus
// per-device preferences (camera invert / sensitivity) and the last look a
// device chose in the customiser, and the presents found (unlocked cosmetics). Every storage access is guarded: a private
// window or blocked storage just means nothing is remembered.

const KEY = 'wobblers.settings.v1';

const DEFAULTS = () => ({ sound: true, music: 0.55, sfx: 0.8, shadows: true, res: 1, devices: {}, presents: [], life: {}, missions: {}, arcade: {} });

function load() {
  const s = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        for (const k of ['music', 'sfx', 'res']) if (typeof o[k] === 'number' && isFinite(o[k])) s[k] = o[k];
        if (typeof o.shadows === 'boolean') s.shadows = o.shadows;
        if (typeof o.sound === 'boolean') s.sound = o.sound; // corner sound on/off button
        if (o.devices && typeof o.devices === 'object') s.devices = o.devices;
        // ids of the presents found so far (src/unlocks.js)
        if (Array.isArray(o.presents)) s.presents = o.presents.filter((v) => typeof v === 'string');
        // wallet, shop purchases, homes, pets, discovered areas (src/life/state.js checks the fields)
        if (o.life && typeof o.life === 'object' && !Array.isArray(o.life)) s.life = o.life;
        // job medals and best times (src/missions/state.js checks the fields)
        if (o.missions && typeof o.missions === 'object' && !Array.isArray(o.missions)) s.missions = o.missions;
        // arcade high scores (src/arcade/index.js checks the fields)
        if (o.arcade && typeof o.arcade === 'object' && !Array.isArray(o.arcade)) s.arcade = o.arcade;
      }
    }
  } catch (e) { /* storage unavailable */ }
  s.music = clamp01(s.music); s.sfx = clamp01(s.sfx);
  s.res = Math.max(0.5, Math.min(1, s.res));
  return s;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const settings = load();

let saveTimer = 0;
export function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }, 150);
}

// Per-device record: { invertY, sens, look: {color, hat, face, pants} }
export function devicePrefs(id) {
  let d = settings.devices[id];
  if (!d || typeof d !== 'object') d = settings.devices[id] = {};
  if (typeof d.invertY !== 'boolean') d.invertY = false;
  if (typeof d.sens !== 'number' || !isFinite(d.sens)) d.sens = 1;
  d.sens = Math.max(0.25, Math.min(2.5, d.sens));
  return d;
}
