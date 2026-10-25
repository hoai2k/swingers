// Writes star thresholds (and raised budgets) from the solver's results into
// src/campaign.js.
//   node battles/dev/campaign/apply.mjs [results.json]          # dry run: print the changes
//   node battles/dev/campaign/apply.mjs [results.json] --write  # edit campaign.js
// Levels are single-line objects `{ id: 'x1', name: ..., budget: N, cap: N, [stars: [a, b], ]tip: ...`;
// only budget and stars are touched. Levels without a result (or without a win) are left alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { starsFrom } from './stars.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const write = args.includes('--write');
const file = args.find((a) => !a.startsWith('--')) || path.join(HERE, 'results.json');
const R = JSON.parse(fs.readFileSync(file, 'utf8'));
const SRC = path.resolve(HERE, '../../src/campaign.js');
let src = fs.readFileSync(SRC, 'utf8');
for (const [id, r] of Object.entries(R)) {
  const re = new RegExp(`(\\{ id: '${id}', [^\\n]*?budget: )(\\d+)(, cap: \\d+, )(stars: \\[\\d+, \\d+\\], )?`);
  const m = src.match(re);
  if (!m) { console.log(id, 'not found in campaign.js'); continue; }
  const s = starsFrom({ cheapest: r.cheapest?.cost, alt: r.alt?.cost, mono: r.cheapestMono?.cost }, +m[2]);
  if (!s) { console.log(id, 'no win in results: left alone'); continue; }
  const next = `${m[1]}${s.budget}${m[3]}stars: [${s.g3}, ${s.g2}], `;
  if (next !== m[0]) console.log(`${id.padEnd(3)} budget ${m[2]} -> ${s.budget}   stars ${m[4] ? m[4].trim() : '(default)'} -> [${s.g3}, ${s.g2}]`);
  src = src.replace(re, next);
}
if (write) { fs.writeFileSync(SRC, src); console.log('wrote', SRC); } else console.log('(dry run; --write to apply)');
