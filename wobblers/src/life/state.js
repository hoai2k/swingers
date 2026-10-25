// Saved life-sim progress (settings.life in localStorage, see src/settings.js):
//   coins   the shared household wallet (whole coins)
//   bought  shop purchases: cosmetic reward keys ('hat:beret') and 'veh:<phone id>'
//   homes   { homeId: { owner: deviceId, color: colour index } }
//   pets    { deviceId: { owned: [kind], active: kind | null } }
//   areas   names of the map areas already discovered (src/map.js AREAS)
// Every field is checked here, so a hand-edited or old save can't break the game.
import { settings, saveSettings } from '../settings.js';

const L = settings.life;
const strs = (a) => (Array.isArray(a) ? a.filter((v) => typeof v === 'string') : []);
L.coins = Number.isFinite(L.coins) ? Math.max(0, Math.floor(L.coins)) : 0;
L.bought = strs(L.bought);
L.areas = strs(L.areas);
if (!L.homes || typeof L.homes !== 'object' || Array.isArray(L.homes)) L.homes = {};
for (const k of Object.keys(L.homes)) {
  const h = L.homes[k];
  if (!h || typeof h.owner !== 'string') delete L.homes[k];
  else if (!Number.isInteger(h.color)) h.color = 0;
}
if (!L.pets || typeof L.pets !== 'object' || Array.isArray(L.pets)) L.pets = {};
for (const k of Object.keys(L.pets)) {
  const p = L.pets[k];
  if (!p || typeof p !== 'object') { delete L.pets[k]; continue; }
  p.owned = strs(p.owned);
  if (typeof p.active !== 'string' || !p.owned.includes(p.active)) p.active = p.owned[0] || null;
}

export const life = L;
export const saveLife = () => saveSettings();
export const isBought = (key) => L.bought.includes(key);
export function markBought(key) { if (!isBought(key)) { L.bought.push(key); saveLife(); } }

// Pet record of a device (created on demand).
export function petsOf(deviceId) {
  let r = L.pets[deviceId];
  if (!r) r = L.pets[deviceId] = { owned: [], active: null };
  return r;
}
// Home id owned by a device, or null.
export function homeOf(deviceId) {
  for (const id in L.homes) if (L.homes[id].owner === deviceId) return id;
  return null;
}

// Wipes coins, purchases, homes, pets and discoveries (pause menu → settings).
export function resetLife() {
  L.coins = 0; L.bought.length = 0; L.areas.length = 0;
  for (const k of Object.keys(L.homes)) delete L.homes[k];
  for (const k of Object.keys(L.pets)) delete L.pets[k];
  saveLife();
}
