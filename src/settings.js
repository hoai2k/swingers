// Player-facing settings, remembered per browser (localStorage can be
// unavailable — private windows, blocked storage — so every access is
// guarded and the defaults always work).

const KEY = 'swingers.settings.v1';

const DEFAULTS = {
  sound: true,              // master switch (the speaker button / M)
  music: true,
  sfx: true,
  originalSwingers: false,  // add the 8 original robot heads to the picker
  powerups: 'normal',       // 'off' | 'normal' | 'frequent'
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable: use defaults */ }
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
