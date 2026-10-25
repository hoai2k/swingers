// Runs equal-gold battles in parallel worker processes and appends JSON lines to --out.
//   node battles/dev/balance/run.mjs --units clubber,squire --runs 6 --procs 4 --out res.jsonl
// Options:
//   --units a,b,..   units to score (default: every unit)
//   --vs a,b,..      opponents (default: the reference panel in lib.mjs; 'mix' = mixed army)
//   --pairs a:b,..   explicit pairings instead of units x vs
//   --runs n         battles per pairing (even: sides swap every run)  [6]
//   --procs n        worker processes                                   [cpus]
//   --maxT s         sim-time cap per battle                            [120]
//   --out file       results file; finished jobs found there are skipped (resume)
// Env OVERRIDE='{"unit":{"hp":120,"weapon.damage":30}}' tries stats without editing files
// (applied to the coordinator's budget maths and to every worker).
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, PANEL, pickBudget, applyOverrides } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const G = await load();
applyOverrides(G, process.env.OVERRIDE);
const U = G.UNIT_BY_ID;
const runs = +arg('runs', 6), procs = +arg('procs', os.cpus().length), maxT = +arg('maxT', 120);
const out = arg('out', 'balance-results.jsonl');
const units = arg('units') ? arg('units').split(',') : G.UNITS.map((u) => u.id);
const vs = arg('vs') ? arg('vs').split(',') : PANEL;
let pairs = arg('pairs') ? arg('pairs').split(',').map((p) => p.split(':')) : units.flatMap((u) => vs.filter((o) => o !== u).map((o) => [u, o]));
for (const [a, b] of pairs) for (const id of [a, b].flatMap((s) => s.split('+').map((x) => x.split('@')[0]))) if (id !== 'mix' && !U[id]) throw new Error('unknown unit ' + id);

const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const key = (j) => `${j.a}|${j.b}|${j.budget}|${j.swap}|${j.seed}`;
const done = new Set();
if (fs.existsSync(out)) for (const l of fs.readFileSync(out, 'utf8').split('\n')) if (l) { try { done.add(key(JSON.parse(l))); } catch { /* partial line */ } }

const jobs = [];
for (const [a, b] of pairs) {
  const { B, mis } = pickBudget(U, a, b);
  if (mis > 0.08) console.error(`warn: ${a} vs ${b} gold mismatch ${(mis * 100).toFixed(0)}% at ${B}`);
  for (let r = 0; r < runs; r++) {
    const j = { a, b, budget: B, swap: r % 2, seed: hash(`${a}:${b}:${Math.floor(r / 2)}`), maxT };
    if (!done.has(key(j))) jobs.push(j);
  }
}
// slowest first-ish: big armies / big budgets
jobs.sort((x, y) => y.budget - x.budget);
console.error(`${jobs.length} battles (${done.size} already in ${out}), ${procs} workers`);
if (!jobs.length) process.exit(0);

const fd = fs.openSync(out, 'a');
let next = 0, fin = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(procs, jobs.length) }, () => new Promise((resolve) => {
  const w = fork(path.join(HERE, 'worker.mjs'), [], { env: process.env, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const feed = () => { if (next < jobs.length) w.send(jobs[next++]); else { w.kill(); resolve(); } };
  w.on('message', (m) => {
    if (!m.ready) {
      fin++;
      fs.writeSync(fd, JSON.stringify(m) + '\n');
      if (m.error) console.error('error', m.a, m.b, m.error.split('\n')[0]);
      if (fin % 10 === 0 || fin === jobs.length) console.error(`${fin}/${jobs.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    feed();
  });
  w.on('exit', () => resolve());
})));
fs.closeSync(fd);
