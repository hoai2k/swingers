// Saved job records (settings.missions in localStorage, see src/settings.js):
//   best  { jobId: { time: seconds, medal: 1 bronze | 2 silver | 3 gold, plays, wins } }
//   done  jobs finished, all time
// Every field is checked here, so an old or hand-edited save can't break the game.
import { settings, saveSettings } from '../settings.js';

const M = settings.missions && typeof settings.missions === 'object' && !Array.isArray(settings.missions) ? settings.missions : {};
settings.missions = M;
M.done = Number.isFinite(M.done) ? Math.max(0, Math.floor(M.done)) : 0;
if (!M.best || typeof M.best !== 'object' || Array.isArray(M.best)) M.best = {};
for (const k of Object.keys(M.best)) {
  const r = M.best[k];
  if (!r || typeof r !== 'object') { delete M.best[k]; continue; }
  r.medal = [0, 1, 2, 3].includes(r.medal) ? r.medal : 0;
  r.time = Number.isFinite(r.time) && r.time > 0 ? r.time : null;
  r.wins = Number.isFinite(r.wins) ? Math.max(0, Math.floor(r.wins)) : 0;
}

export const missionSave = M;
export const MEDALS = ['', 'Bronze', 'Silver', 'Gold'];
export const MEDAL_ICON = ['', '🥉', '🥈', '🥇'];

export function recordOf(id) { return M.best[id] || null; }

// Records a finished job; returns { newBest, medalUp }.
export function record(id, time, medal) {
  let r = M.best[id];
  if (!r) r = M.best[id] = { time: null, medal: 0, wins: 0 };
  const newBest = r.time == null || time < r.time;
  const medalUp = medal > r.medal;
  if (newBest) r.time = Math.round(time * 10) / 10;
  if (medalUp) r.medal = medal;
  r.wins++;
  M.done++;
  saveSettings();
  return { newBest, medalUp };
}

export function resetMissions() {
  for (const k of Object.keys(M.best)) delete M.best[k];
  M.done = 0;
  saveSettings();
}
