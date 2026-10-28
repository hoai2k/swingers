// Saved battles: the setup of a battle (battleground, armies, which unit a player takes
// control of), kept in localStorage. Eight slots the player saves to from the setup menu,
// and "Last battle", written every time a battle starts. Loading one opens it in the
// sandbox (src/game.js loadBattle). Live battles aren't saved: a battle starts again from
// its setup.
//
// record = { name, when (ms), mode, map (world.js map id), n (armies), armies: [[{type, x,
//            z, ctl?}]], players (sandbox players), sim? (scenario name) }
const KEY = 'wobbly-battles.saves.v1';
export const SLOTS = 8;

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && Array.isArray(s.slots)) { while (s.slots.length < SLOTS) s.slots.push(null); return s; }
  } catch { /* storage unavailable or corrupt */ }
  return { last: null, slots: Array(SLOTS).fill(null) };
}
function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export const loadSaves = () => read();
export function saveSlot(i, rec) { const s = read(); s.slots[i] = rec; return write(s); }
export function saveLast(rec) { const s = read(); s.last = rec; return write(s); }

// a one-line summary: "Castle Courtyard · 24 vs 18 · 28 Oct 14:05"
export function describe(rec, mapName) {
  if (!rec) return 'empty';
  const d = new Date(rec.when);
  const when = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const counts = rec.armies.map((a) => a.length).join(' vs ');
  return `${rec.sim ? rec.sim + ' · ' : ''}${mapName} · ${counts} · ${when}`;
}
