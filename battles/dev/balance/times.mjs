// Battle length per unit: mean sim time, battles that hit the time cap, wins.
//   node battles/dev/balance/times.mjs res.jsonl [more.jsonl] [--units a,b]
import fs from 'node:fs';
const args = process.argv.slice(2);
const ui = args.indexOf('--units');
const only = ui >= 0 ? args[ui + 1].split(',') : null;
const files = args.filter((a, i) => !a.startsWith('--') && i !== ui + 1);
const rows = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
const units = only || [...new Set(rows.map((r) => r.a))];
for (const u of units) {
  const rs = rows.filter((r) => r.a === u);
  if (!rs.length) continue;
  const t = rs.reduce((s, r) => s + r.t, 0) / rs.length;
  const cap = rs.filter((r) => r.t >= (r.maxT || 120) - 1).length;
  console.log(`${u.padEnd(28)} mean ${t.toFixed(0).padStart(3)} s   at cap ${String(cap).padStart(2)}/${rs.length}   won ${rs.filter((r) => r.win > 0).length}`);
}
