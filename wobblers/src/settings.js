// Persistent settings (localStorage). Global audio/video settings plus
// per-device preferences (camera invert / sensitivity) and the last look a
// device chose in the customiser. Every storage access is guarded: a private
// window or blocked storage just means nothing is remembered.

const KEY = 'wobblers.settings.v1';

const DEFAULTS = () => ({ music: 0.55, sfx: 0.8, shadows: true, res: 1, devices: {} });

function load() {
  const s = DEFAULTS();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        for (const k of ['music', 'sfx', 'res']) if (typeof o[k] === 'number' && isFinite(o[k])) s[k] = o[k];
        if (typeof o.shadows === 'boolean') s.shadows = o.shadows;
        if (o.devices && typeof o.devices === 'object') s.devices = o.devices;
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
