// Markdown table for BALANCE.md: cost and panel score before/after.
//   node battles/dev/balance/table.mjs --old <old src dir> --before a.jsonl,b.jsonl --after c.jsonl,d.jsonl [--notes notes.json]
// 'alone' = the unit's army vs the panel; 'in line' = squire+unit (support/artillery,
// share as in the run) vs the panel. Scores: + wins, - loses (see report.mjs).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const rep = (files) => JSON.parse(execFileSync('node', [path.join(HERE, 'report.mjs'), ...files.split(','), '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const before = rep(arg('before')), after = rep(arg('after'));
const notes = arg('notes') ? JSON.parse(fs.readFileSync(arg('notes'), 'utf8')) : {};
const NEW = await import(path.resolve(HERE, '../../src/units.js'));
const OLD = arg('old') ? await import(path.resolve(arg('old'), 'units.js')) : NEW;
const f = (x) => (x == null ? '' : (x >= 0 ? '+' : '') + x.toFixed(2));
const lineKey = (rows, id) => Object.keys(rows).find((k) => k.startsWith('squire+' + id + '@') || k === 'squire+' + id);
const diff = (o, n) => {
  const out = [];
  const walk = (a, b, p) => {
    for (const k of Object.keys(b)) {
      if (typeof b[k] === 'number' && a && typeof a[k] === 'number' && a[k] !== b[k]) out.push(`${p}${k} ${a[k]}→${b[k]}`);
      else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && k !== 'look' && k !== 'build' && k !== 'personality') walk(a?.[k], b[k], p + (k === 'weapon' ? '' : k + '.'));
    }
  };
  walk(o, n, '');
  return out.filter((s) => !s.startsWith('cost ')).join(', ');
};
console.log('| unit | faction | cost | alone before | alone after | in line before | in line after | other changes | notes |');
console.log('|---|---|---:|---:|---:|---:|---:|---|---|');
for (const u of NEW.UNITS) {
  const o = OLD.UNIT_BY_ID[u.id];
  const kb = lineKey(before, u.id), ka = lineKey(after, u.id);
  const cost = o && o.cost !== u.cost ? `${o.cost} → **${u.cost}**` : String(u.cost);
  console.log(`| ${u.name} (\`${u.id}\`) | ${u.faction} | ${cost} | ${f(before[u.id]?.avg)} | ${f(after[u.id]?.avg)} | ${f(kb && before[kb].avg)} | ${f(ka && after[ka].avg)} | ${o ? diff(o, u) : 'new'} | ${notes[u.id] || ''} |`);
}
