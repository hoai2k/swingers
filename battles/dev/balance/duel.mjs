// Headless 1-vs-1 duel harness (Node): who beats whom, one unit against one unit.
// The equal-gold harness (run.mjs) prices units; this one checks power ORDER (e.g. the
// Jujutsu Kaisen faction's tiers in BALANCE.md "JJK power levels").
//
//   node battles/dev/balance/duel.mjs --pairs jk_gojo:jk_sukuna,jk_toji:jk_gojo --runs 12
//   node battles/dev/balance/duel.mjs --units jk_hakari --vs jk_geto,jk_jogo --runs 12 --out d.jsonl
//   node battles/dev/balance/duel.mjs --report d.jsonl       (re-print a results file)
//
// Each duel: the first map with a flat field (no bumps; the hills round the field
// stay, so nobody wanders off the edge), unit a at x = -gap/2
// facing unit b at x = +gap/2 (gap 12 m); sides swap every run; seeded RNG per run
// (seed = hash(pair, run/2), so both sides of a seed are fought). A duel ends when a
// side has nobody fighting (summons and reserves count for their side) or at the time
// cap (a draw). Options:
//   --pairs a:b,..   explicit pairings            --units a,.. --vs b,..   all a x b
//   --runs n         duels per pairing (even)  [12]
//   --procs n        worker processes          [cpus]
//   --maxT s         sim-time cap per duel     [90]
//   --gap m          start distance            [12]
//   --out file       append JSON lines here (finished duels found there are skipped)
// Env OVERRIDE works as for run.mjs (unit stats or a module's exported tuning objects).
// Output: per pairing, a's wins / b's wins / draws, a's win rate (draws count half) and
// the mean duel time.
import { fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { load, applyOverrides, SRC } from './lib.mjs';

const ME = fileURLToPath(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let FLAT = null;
async function setup() {
  const G = await load();
  await applyOverrides(G, process.env.OVERRIDE);
  if (!FLAT) {
    const { Terrain, MAPS } = await import(SRC + 'world.js');
    FLAT = new Terrain({ ...MAPS[0], bumps: 0 }, 1); // flat field, the usual hills round it
    FLAT.buildMesh();
  }
  return G;
}

// one duel; returns { win: 1 (a) | -1 (b) | 0 (draw), t, ha, hb } (ha/hb = hp fraction left)
export function duel(G, job) {
  const { a, b, swap, seed, maxT = 90, gap = 12 } = job;
  Math.random = mulberry32(seed);
  const A = { type: a, x: -gap / 2, z: 0 }, B = { type: b, x: gap / 2, z: 0 };
  const armies = swap ? [[{ ...B, x: -gap / 2 }], [{ ...A, x: gap / 2 }]] : [[A], [B]];
  const bt = new G.Battle(FLAT, armies, null);
  const ia = swap ? 1 : 0;
  let f = 0;
  for (; f < 60 * maxT && !bt.over; f++) bt.step(1 / 60);
  const hpOf = (t) => Math.max(0, ...bt.teams[t].filter((u) => u.alive && !u.reserveOf).map((u) => u.hp / u.maxHp), 0);
  const res = { a, b, swap, seed, sig: job.sig, maxT, gap, win: bt.winner === ia ? 1 : bt.winner === 1 - ia ? -1 : 0, t: +bt.time.toFixed(1), ha: +hpOf(ia).toFixed(2), hb: +hpOf(1 - ia).toFixed(2) };
  bt.destroy();
  return res;
}

export function summarise(rows) {
  const P = new Map();
  for (const r of rows) {
    if (r.error) continue;
    const k = r.a + ':' + r.b;
    const p = P.get(k) || { a: r.a, b: r.b, wa: 0, wb: 0, d: 0, t: 0, n: 0 };
    if (r.win > 0) p.wa++; else if (r.win < 0) p.wb++; else p.d++;
    p.t += r.t; p.n++;
    P.set(k, p);
  }
  const out = [];
  for (const p of P.values()) out.push({ ...p, rate: (p.wa + p.d / 2) / p.n, t: p.t / p.n });
  return out;
}
export function printTable(sum) {
  console.log('a'.padEnd(14) + 'b'.padEnd(14) + '  a-wins b-wins draws   a%   mean t');
  for (const p of sum) {
    console.log(p.a.padEnd(14) + p.b.padEnd(14) + String(p.wa).padStart(8) + String(p.wb).padStart(7) + String(p.d).padStart(6) +
      (Math.round(p.rate * 100) + '%').padStart(6) + (p.t.toFixed(0) + 's').padStart(8));
  }
}

// ---- worker mode
if (process.send && process.env.DUEL_WORKER) {
  const G = await setup();
  process.on('message', (job) => {
    let res;
    try { res = duel(G, job); } catch (e) { res = { ...job, error: String((e && e.stack) || e) }; }
    process.send(res);
  });
  process.on('disconnect', () => process.exit(0));
  process.send({ ready: true });
} else if (import.meta.url === 'file://' + process.argv[1] || ME === process.argv[1]) {
  if (arg('report')) {
    printTable(summarise(fs.readFileSync(arg('report'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))));
    process.exit(0);
  }
  const G = await setup();
  const U = G.UNIT_BY_ID;
  const runs = +arg('runs', 12), procs = +arg('procs', os.cpus().length), maxT = +arg('maxT', 90), gap = +arg('gap', 12);
  const out = arg('out', null);
  let pairs;
  if (arg('pairs')) pairs = arg('pairs').split(',').map((p) => p.split(':'));
  else {
    const us = (arg('units') || '').split(',').filter(Boolean), vs = (arg('vs') || '').split(',').filter(Boolean);
    pairs = us.flatMap((u) => vs.filter((v) => v !== u).map((v) => [u, v]));
  }
  if (!pairs.length) { console.error('no pairs: use --pairs a:b,.. or --units .. --vs ..'); process.exit(1); }
  for (const [a, b] of pairs) for (const id of [a, b]) if (!U[id]) throw new Error('unknown unit ' + id);
  const sig = (a, b) => hash(JSON.stringify([U[a], U[b], process.env.OVERRIDE || '']));
  const key = (j) => `${j.a}|${j.b}|${j.swap}|${j.seed}|${j.sig}|${j.maxT}|${j.gap}`;
  const done = new Set(), prev = [];
  if (out && fs.existsSync(out)) for (const l of fs.readFileSync(out, 'utf8').split('\n')) if (l) { try { const r = JSON.parse(l); done.add(key(r)); prev.push(r); } catch { /* partial */ } }
  const jobs = [];
  for (const [a, b] of pairs) for (let r = 0; r < runs; r++) {
    const j = { a, b, swap: r % 2, seed: hash(`${a}:${b}:${Math.floor(r / 2)}`), maxT, gap, sig: sig(a, b) };
    if (!done.has(key(j))) jobs.push(j);
  }
  console.error(`${jobs.length} duels, ${procs} workers`);
  const res = [];
  const fd = out ? fs.openSync(out, 'a') : null;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(procs, jobs.length) }, () => new Promise((resolve) => {
    const w = fork(ME, [], { env: { ...process.env, DUEL_WORKER: '1' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const feed = () => { if (next < jobs.length) w.send(jobs[next++]); else { w.kill(); resolve(); } };
    w.on('message', (m) => {
      if (!m.ready) {
        const r = { ...m };
        res.push(r);
        if (fd !== null) fs.writeSync(fd, JSON.stringify(r) + '\n');
        if (m.error) console.error('error', m.a, m.b, m.error.split('\n').slice(0, 3).join(' | '));
      }
      feed();
    });
    w.on('exit', () => resolve());
  })));
  if (fd !== null) fs.closeSync(fd);
  // this run's pairings, from the file's matching duels plus the new ones
  const want = new Set(pairs.map(([a, b]) => a + ':' + b));
  const cur = new Set(jobs.map(key));
  const all = [...prev.filter((r) => want.has(r.a + ':' + r.b) && r.sig === sig(r.a, r.b) && r.maxT === maxT && r.gap === gap), ...res.filter((r) => cur.has(key(r)))];
  printTable(summarise(all));
}
