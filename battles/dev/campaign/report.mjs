// Checks campaign.js against the solver's results.json and prints a table.
//   node battles/dev/campaign/report.mjs [results.json]
// Per level: budget, cap, star gold, the cheapest confirmed win, the cheapest
// single-type win, the alt win (without the cheapest army's main unit) and
// warnings when a star tier is out of reach or a level looks trivial.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './sim.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(HERE, 'results.json');
const R = JSON.parse(fs.readFileSync(file, 'utf8'));
const { campaign } = await load();
const fa = (c) => (c ? `${c.cost} ${c.army.map(([id, n]) => `${n}x${id}`).join('+')}` : '-');
let bad = 0;
for (const L of campaign.LEVELS) {
  const r = R[L.id];
  const [g3, g2] = campaign.starGold(L);
  const warn = [];
  if (!r) warn.push('not solved');
  else {
    const c = r.cheapest?.cost;
    if (c === undefined) warn.push('NO WIN FOUND');
    else {
      if (c > L.budget) warn.push('cheapest win over budget');
      if (c > g3) warn.push('3 stars unreachable');
      else if (c > g3 / 1.1) warn.push('3-star margin < 10%');
      const two = Math.min(r.cheapestMono?.cost ?? Infinity, r.alt?.cost ?? Infinity);
      if (two > g2) warn.push('no simple/alt win within 2-star gold');
      if (two > L.budget) warn.push('only one way to win within budget');
      if (c < L.budget * 0.25) warn.push('trivial? cheapest < 25% of budget');
    }
    if (r.cap !== L.cap || r.enemyValue !== campaign.armyValue(campaign.enemyArmy(L))) warn.push('enemy or cap changed since solved');
  }
  if (warn.some((w) => !w.startsWith('trivial') && !w.startsWith('3-star margin'))) bad++;
  console.log(`${L.id.padEnd(3)} ${L.name.padEnd(21)} budget ${String(L.budget).padStart(5)} cap ${String(L.cap).padStart(2)} ★★★≤${String(g3).padStart(5)} ★★≤${String(g2).padStart(5)}` +
    `  cheapest ${fa(r?.cheapest)} | mono ${fa(r?.cheapestMono)} | alt ${fa(r?.alt)}${warn.length ? '  !! ' + warn.join('; ') : ''}`);
}
console.log(bad ? `${bad} level(s) need attention` : 'all levels winnable, every star tier reachable');
process.exitCode = bad ? 1 : 0;
