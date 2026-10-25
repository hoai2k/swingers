// Summarise a results file: per unit, mean score vs each opponent and overall.
//   node battles/dev/balance/report.mjs res.jsonl [--md] [--sort]
// score = hp-weighted gold left (own share) - enemy's share, averaged over runs:
// +1 = flawless win, 0 = even trade, -1 = flawless loss. Both directions of a pairing
// are used (b's result vs a counts as -score for b).
import fs from 'node:fs';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const md = process.argv.includes('--md'), sort = process.argv.includes('--sort');
const S = {}; // S[unit][opp] = [scores]
const W = {};
const add = (u, o, s, w) => { ((S[u] ??= {})[o] ??= []).push(s); ((W[u] ??= {})[o] ??= []).push(w); };
for (const f of files) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
  if (!l) continue;
  const r = JSON.parse(l);
  if (r.error) continue;
  add(r.a, r.b, r.score, r.win);
  add(r.b, r.a, -r.score, -r.win);
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const PANEL = ['clubber', 'squire', 'archer', 'knight', 'chieftain', 'ww_gunslinger', 'giant', 'king', 'mix'];
const opps = PANEL.filter((o) => Object.values(S).some((m) => m[o]));
const rows = Object.keys(S).filter((u) => u !== 'mix').map((u) => {
  const per = opps.map((o) => (u === o ? 0 : S[u][o] ? mean(S[u][o]) : null));
  const have = per.filter((x) => x !== null);
  const n = opps.reduce((s, o) => s + (S[u][o]?.length || 0), 0);
  return { u, per, avg: have.length ? mean(have) : NaN, n };
});
if (sort) rows.sort((a, b) => b.avg - a.avg);
const f = (x) => (x === null ? '   . ' : (x >= 0 ? '+' : '') + x.toFixed(2));
if (md) {
  console.log(`| unit | ${opps.join(' | ')} | avg | n |`);
  console.log(`|---|${opps.map(() => '---:').join('|')}|---:|---:|`);
  for (const r of rows) console.log(`| ${r.u} | ${r.per.map(f).join(' | ')} | **${f(r.avg)}** | ${r.n} |`);
} else {
  console.log('unit'.padEnd(20) + opps.map((o) => o.slice(0, 6).padStart(7)).join('') + '    avg   n');
  for (const r of rows) console.log(r.u.padEnd(20) + r.per.map((x) => f(x).padStart(7)).join('') + '  ' + f(r.avg).padStart(6) + String(r.n).padStart(4));
}
