// Headless Simulation harness (Node): fights the ready-made battles of src/sims.js on
// their own maps and reports who wins how often, so a scenario that should be a real
// contest isn't a foregone conclusion (and a one-sided one stays one-sided).
//
//   node battles/dev/balance/sims.mjs                     every scenario, 4 runs, Small
//   node battles/dev/balance/sims.mjs --ids jjk_war,hastings --runs 8 --size 1
//
// Options: --ids a,b  --runs n [4]  --seed n (first seed) [1000]  --size k (army size: 0.5 Small, 1 Normal, 2 Epic) [0.5]
//          --procs n [cpus]  --maxT s (sim-time cap, a draw) [150]
// Env OVERRIDE works as for run.mjs. Output per scenario: Blue wins / Red wins / draws,
// Blue's rate (draws count half), mean battle time.
import { fork } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { load, applyOverrides, SRC } from './lib.mjs';

const ME = fileURLToPath(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TERR = new Map();
async function fight(G, S, W, job) {
  const sc = S.SCENARIOS.find((s) => s.id === job.id);
  Math.random = mulberry32(job.seed);
  let mi = W.MAPS.findIndex((m) => m.id === sc.map);
  if (mi < 0) mi = 0;
  if (!TERR.has(mi)) { const t = new W.Terrain(W.MAPS[mi], mi + 1); t.buildMesh(); TERR.set(mi, t); }
  const terrain = TERR.get(mi);
  const { armies } = S.simArmies(sc, job.size, [Math.random(), Math.random(), Math.random(), Math.random()]);
  const keep = armies.map((a, t) => a.filter((u) => S.fitToMap(terrain, t, u, armies.length)));
  const bt = new G.Battle(terrain, keep, null);
  for (let f = 0; f < 60 * job.maxT && !bt.over; f++) bt.step(1 / 60);
  const res = { id: job.id, win: bt.over ? bt.winner : -1, t: +bt.time.toFixed(1), n: keep.map((a) => a.length) };
  bt.destroy();
  return res;
}

if (process.send && process.env.SIMS_WORKER) {
  const G = await load();
  await applyOverrides(G, process.env.OVERRIDE);
  const S = await import(SRC + 'sims.js'), W = await import(SRC + 'world.js');
  process.on('message', async (job) => {
    let res;
    try { res = await fight(G, S, W, job); } catch (e) { res = { ...job, error: String((e && e.stack) || e) }; }
    process.send(res);
  });
  process.on('disconnect', () => process.exit(0));
  process.send({ ready: true });
} else {
  await load();
  const S = await import(SRC + 'sims.js');
  const ids = arg('ids') ? arg('ids').split(',') : S.SCENARIOS.map((s) => s.id);
  const runs = +arg('runs', 4), size = +arg('size', 0.5), maxT = +arg('maxT', 150), procs = +arg('procs', os.cpus().length), seed0 = +arg('seed', 1000);
  const jobs = [];
  for (const id of ids) for (let r = 0; r < runs; r++) jobs.push({ id, size, maxT, seed: seed0 + r * 7919 });
  console.error(`${jobs.length} battles, ${procs} workers`);
  const res = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(procs, jobs.length) }, () => new Promise((resolve) => {
    const w = fork(ME, process.argv.slice(2), { env: { ...process.env, SIMS_WORKER: '1' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const feed = () => { if (next < jobs.length) w.send(jobs[next++]); else { w.kill(); resolve(); } };
    w.on('message', (m) => {
      if (!m.ready) {
        res.push(m);
        if (m.error) console.error('error', m.id, m.error.split('\n').slice(0, 4).join(' | '));
      }
      feed();
    });
  })));
  console.log('scenario'.padEnd(16) + ' units      blue  red draw  blue%  mean t');
  for (const id of ids) {
    const rs = res.filter((r) => r.id === id && !r.error);
    if (!rs.length) continue;
    const mean = `${(rs.reduce((s, r) => s + r.t, 0) / rs.length).toFixed(0).padStart(7)}s`;
    if (rs[0].n.length > 2) { // more armies: wins per army (Blue Red Yellow Green), then draws
      const w = rs[0].n.map((_, t) => rs.filter((r) => r.win === t).length), d = rs.length - w.reduce((s, x) => s + x, 0);
      console.log(id.padEnd(16) + ` ${rs[0].n.join('v').padEnd(9)} wins ${w.join('/')} (B/R/Y/G), draws ${d}${mean}`);
      continue;
    }
    const b = rs.filter((r) => r.win === 0).length, rd = rs.filter((r) => r.win === 1).length, d = rs.length - b - rd;
    console.log(id.padEnd(16) + ` ${rs[0].n.join('v').padEnd(9)} ${String(b).padStart(5)}${String(rd).padStart(5)}${String(d).padStart(5)}${(Math.round(((b + d / 2) / rs.length) * 100) + '%').padStart(7)}${mean}`);
  }
}
