// Campaign solver: for each level, searches for the cheapest player army (from
// the level's allowed factions, within its unit cap) that reliably beats the
// preset enemy, and suggests star thresholds from it.
//
//   node battles/dev/campaign/solve.mjs                 # every level
//   node battles/dev/campaign/solve.mjs t1 m3 a1        # just these levels
//   node battles/dev/campaign/solve.mjs --world ancient # one world
//   options: --workers N (default: cores)  --seeds N (search seeds, default 2)
//            --need N (wins of --seeds needed, default 2)  --confirm N (default 6)
//            --over X (search armies up to X times the budget, default 1.25)  --duo-nb 1|2
//            --no-cache (don't read/write cache.jsonl; fights are cached by roster hash)
//            --max-time S (sim seconds before a fight counts as lost, default 90)
//            --quick (mono armies + trim only)  --out file.json (default results.json here)
//   Then: node battles/dev/campaign/report.mjs  (table + checks of campaign.js against results.json)
//
// Re-run after unit stats change (e.g. a balance pass), from the repo root:
//   node battles/dev/campaign/solve.mjs            # ~3-6 h on 4 busy cores; cache.jsonl makes reruns resumable
//   node battles/dev/campaign/report.mjs           # flags levels that became unwinnable / 3 stars out of reach
//   node battles/dev/campaign/apply.mjs --write    # rewrite stars (and raise budgets) in src/campaign.js
//   node battles/dev/campaign/report.mjs           # should end "all levels winnable, every star tier reachable"
// The fight cache is keyed by a hash of the whole unit roster, so any stat change
// re-simulates everything; an interrupted run picks up where it stopped.
//
// Search, per level (all fights in a pool of worker threads):
//   1. mono: for every allowed unit, the smallest count that wins (gallops up from
//      gold parity with the enemy, then bisects; units that can't win under 1.35x
//      the cheapest mono win so far are cut short)
//   2. duos: the 2 best mono units as the front + 1 (or 3) of one of the top 5, bisecting the front
//   3. 10 random 2-3 unit mixes cheaper than the best so far
//   4. trim: greedily drop or downgrade units of the 2 best armies while they still win
//   5. confirm on fresh seeds (--confirm fights, 75% must win; marginal armies get
//      +1/+2 of their main unit and are retried): the cheapest army,
//      the cheapest single-type army, and the cheapest army without the cheapest
//      army's main unit ("alt": what's left if that unit gets nerfed; if the search
//      found none, the other units' mono armies are searched up to the limit first)
// "Reliable" during the search means --need wins out of --seeds fights.
//
// Suggested stars and budget: see stars.mjs. apply.mjs writes them into campaign.js.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, armyCost, armySize } from './sim.mjs';
import { starsFrom } from './stars.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (k) => { const i = argv.indexOf('--' + k); if (i < 0) return false; argv.splice(i, 1); return true; };
const WORKERS = +opt('workers', os.cpus().length);
const SEEDS = +opt('seeds', 2), NEED = +opt('need', 2), CONFIRM = +opt('confirm', 6);
const OVER = +opt('over', 1.25); // search armies up to this x the budget (so an impossible level says by how much)
const DUO_NB = +opt('duo-nb', 1); // duos try 1 (and with 2: also 3) of the second unit
const MAX_TIME = +opt('max-time', 90);
const OUT = opt('out', path.join(HERE, 'results.json'));
const WORLD = opt('world', null);
const QUICK = flag('quick');
const NOCACHE = flag('no-cache');
const ONLY = argv.filter((a) => !a.startsWith('--'));

const M = await load();
const { campaign, UNITS, UNIT_BY_ID } = M;
let levels = campaign.LEVELS;
if (WORLD) levels = levels.filter((l) => WORLD.split(',').includes(campaign.WORLDS[l.world].id));
if (ONLY.length) levels = levels.filter((l) => ONLY.includes(l.id));

// ---------------------------------------------------------------- worker pool
const pool = [], queue = [], pending = new Map();
let jobId = 0, fights = 0;
const workerUrl = new URL('./worker.mjs', import.meta.url);
function spawn() {
  const w = new Worker(workerUrl);
  w.busy = true; w.done = 0;
  w.on('message', (m) => {
    if (m.ready) { w.busy = false; pump(); return; }
    const p = pending.get(m.id);
    pending.delete(m.id);
    w.busy = false; w.done++;
    fights++;
    if (m.err) p.reject(new Error(m.err)); else p.resolve(m.r);
    // recycle now and then to keep memory flat
    if (w.done >= 150) { pool.splice(pool.indexOf(w), 1); w.terminate(); spawn(); }
    pump();
  });
  w.on('error', (e) => { console.error('worker error', e); });
  pool.push(w);
}
function pump() {
  for (const w of pool) {
    if (!queue.length) return;
    if (w.busy) continue;
    const job = queue.shift();
    w.busy = true;
    w.postMessage(job);
  }
}
// Fight results are cached on disk, keyed by a hash of the unit roster (so any
// stat change invalidates them), the level's map and enemy, the army and seed.
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const ROSTER = hash(JSON.stringify(UNITS, (k, v) => (typeof v === 'function' ? String(v) : v)) + MAX_TIME);
const CACHE = NOCACHE ? null : path.join(HERE, 'cache.jsonl');
const disk = new Map();
if (CACHE && fs.existsSync(CACHE)) {
  for (const ln of fs.readFileSync(CACHE, 'utf8').split('\n')) { if (!ln) continue; try { const [k, r] = JSON.parse(ln); disk.set(k, r); } catch { /* torn line */ } }
}
const levelSig = new Map();
const sigOf = (levelId) => {
  if (!levelSig.has(levelId)) { const L = campaign.levelById(levelId); levelSig.set(levelId, hash(L.map + JSON.stringify(campaign.enemyArmy(L)))); }
  return levelSig.get(levelId);
};
let hits = 0;
const runFight = (level, counts, seed) => {
  const k = `${ROSTER}|${sigOf(level)}|${counts.map(([id, n]) => id + ':' + n).join(',')}|${seed}`;
  if (disk.has(k)) { hits++; return Promise.resolve(disk.get(k)); }
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    pending.set(id, { resolve: (r) => { disk.set(k, r); if (CACHE) fs.appendFileSync(CACHE, JSON.stringify([k, r]) + '\n'); resolve(r); }, reject });
    queue.push({ id, level, counts, seed, maxTime: MAX_TIME });
    pump();
  });
};
for (let i = 0; i < WORKERS; i++) spawn();
const T00 = performance.now();
const ticker = setInterval(() => console.log(`  .. ${fights} fights run, ${hits} cached, ${Math.round((performance.now() - T00) / 1000)}s`), 120000);

// at most n of the returned function's tasks run at once
function limiter(n) {
  let active = 0;
  const wait = [];
  return async (fn) => {
    while (active >= n) await new Promise((r) => wait.push(r));
    active++;
    try { return await fn(); } finally { active--; wait.shift()?.(); }
  };
}

// ---------------------------------------------------------------- evaluation
const norm = (counts) => counts.filter(([, n]) => n > 0).map(([id, n]) => [id, n]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
const keyOf = (counts) => norm(counts).map(([id, n]) => `${id}:${n}`).join(',');

// Plays seeds two at a time and stops as soon as the outcome is decided.
async function trial(levelId, counts, seeds, need) {
  let wins = 0, played = 0;
  const results = [];
  for (let i = 0; i < seeds.length; i += 2) {
    const batch = seeds.slice(i, i + 2);
    const rs = await Promise.all(batch.map((s) => runFight(levelId, counts, s)));
    for (const r of rs) { played++; results.push(r); if (r.win) wins++; }
    const left = seeds.length - played;
    if (wins >= need || wins + left < need) break;
  }
  return { ok: wins >= need, wins, played, time: results.reduce((s, r) => s + r.time, 0) / results.length };
}

// the unit carrying most of an army's cost
const mainUnit = (counts) => [...counts].sort((a, b) => UNIT_BY_ID[b[0]].cost * b[1] - UNIT_BY_ID[a[0]].cost * a[1])[0][0];

function solver(level) {
  const allowed = campaign.WORLDS[level.world].factions;
  const limit = Math.round(level.budget * OVER);
  const units = UNITS.filter((u) => (!allowed || allowed.includes(u.faction)) && u.cost <= limit && u.speed > 0);
  const cache = new Map();
  const found = []; // reliable wins {counts, cost, key, tag, mono}
  let best = Infinity, bestMono = Infinity;
  const lim = limiter(Math.max(2, Math.ceil(WORKERS / 2)));
  const enemyValue = campaign.armyValue(campaign.enemyArmy(level));

  async function reliable(counts, tag) {
    counts = norm(counts);
    const cost = armyCost(counts);
    if (!counts.length || armySize(counts) > level.cap || cost > limit) return false;
    const k = keyOf(counts);
    if (!cache.has(k)) cache.set(k, trial(level.id, counts, Array.from({ length: SEEDS }, (_, i) => i + 1), NEED));
    const r = await cache.get(k);
    if (r.ok && !found.some((f) => f.key === k)) {
      found.push({ counts, cost, key: k, tag, mono: counts.length === 1 });
      if (cost < best) best = cost;
      if (counts.length === 1 && cost < bestMono) bestMono = cost;
    }
    return r.ok;
  }

  // smallest n in [lo, hi()] for which make(n) wins (assumes more is better)
  async function bisect(make, lo, hiFn, tag) {
    let hi = hiFn();
    if (hi < lo) return null;
    if (!(await reliable(make(hi), tag))) return null;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (await reliable(make(mid), tag)) hi = mid; else lo = mid + 1;
    }
    return hi;
  }

  return {
    async run() {
      const t0 = performance.now();
      // 1. mono armies, cheapest units first so the bound tightens early
      const byCost = [...units].sort((a, b) => a.cost - b.cost);
      const monoSearch = (u, bound) => lim(async () => {
        // start near gold parity with the enemy and gallop up, then bisect down
        const hiFn = () => Math.min(level.cap, Math.floor(Math.min(limit, bound()) / u.cost));
        const make = (n) => [[u.id, n]];
        let lo = 1, n = Math.max(1, Math.min(hiFn(), Math.round(enemyValue / u.cost)));
        if (hiFn() < 1) return { u, n: null, cost: Infinity };
        while (!(await reliable(make(n), 'mono'))) {
          lo = n + 1;
          const hi = hiFn();
          if (n >= hi) return { u, n: null, cost: Infinity };
          n = Math.min(hi, Math.max(n + 1, Math.ceil(n * 1.5)));
        }
        const m = await bisect(make, lo, () => n, 'mono');
        return { u, n: m, cost: m ? m * u.cost : Infinity };
      });
      const mono = await Promise.all(byCost.map((u) => monoSearch(u, () => bestMono * 1.35)));
      mono.sort((a, b) => a.cost - b.cost);
      // units ranked by how well they did alone; ones that never won are ranked by cost
      const rank = [...mono.filter((m) => m.n), ...mono.filter((m) => !m.n).sort((a, b) => a.u.cost - b.u.cost)].map((m) => m.u);
      if (!QUICK) {
        // 2. duos: a front-line unit plus 1 or 3 of something else, cheaper than the best so far
        const fronts = rank.slice(0, 2), seconds = rank.slice(0, 5);
        const jobs = [];
        for (const a of fronts) for (const b of seconds) {
          if (a === b) continue;
          for (const nb of [1, 3].slice(0, DUO_NB)) {
            jobs.push(lim(() => bisect((n) => [[a.id, n], [b.id, nb]], 1,
              () => Math.min(level.cap - nb, Math.floor((Math.min(best, limit) - nb * b.cost - 1) / a.cost)), 'duo')));
          }
        }
        await Promise.all(jobs);
        // 3. random mixes cheaper than the best so far
        let rnd = 9;
        const R = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
        const pick = rank.slice(0, 12);
        const tries = [];
        for (let i = 0; i < 10 && pick.length > 1; i++) {
          const n = 2 + (R() < 0.5 ? 1 : 0);
          const types = Array.from({ length: n }, () => pick[Math.floor(R() * pick.length)]);
          const f = 0.55 + R() * 0.4;
          tries.push(lim(() => {
            const target = Math.min(best, limit) * f;
            const counts = new Map();
            let cost = 0, size = 0, guard = 0;
            while (guard++ < 200 && size < level.cap) {
              const t = types[Math.floor(R() * types.length)];
              if (cost + t.cost > target) break;
              counts.set(t.id, (counts.get(t.id) || 0) + 1); cost += t.cost; size++;
            }
            return counts.size ? reliable([...counts], 'mix') : false;
          }));
        }
        await Promise.all(tries);
      }
      // 4. trim: drop or downgrade one unit at a time while it still wins
      const cheaperOf = (id) => units.filter((u) => u.cost < UNIT_BY_ID[id].cost).sort((a, b) => b.cost - a.cost).slice(0, 3);
      const trim = async (s) => {
        let cur = s.counts;
        for (let step = 0; step < 30; step++) {
          const moves = [];
          for (const [id, n] of cur) {
            moves.push(cur.map(([i, m]) => [i, i === id ? m - 1 : m]));
            for (const c of cheaperOf(id)) {
              const m = new Map(cur); m.set(id, n - 1); m.set(c.id, (m.get(c.id) || 0) + 1);
              moves.push([...m]);
            }
          }
          const cands = moves.map(norm).filter((c) => c.length && armyCost(c) < armyCost(cur)).sort((a, b) => armyCost(a) - armyCost(b));
          let next = null;
          for (const c of cands.slice(0, 8)) if (await reliable(c, 'trim')) { next = c; break; }
          if (!next) break;
          cur = next;
        }
      };
      await Promise.all([...found].sort((a, b) => a.cost - b.cost).slice(0, 2).map(trim));
      // 5. confirm on fresh seeds
      const fresh = Array.from({ length: CONFIRM }, (_, i) => 101 + i);
      const needC = Math.ceil(CONFIRM * 0.75);
      // The search finds the smallest army that won its few seeds, which is often
      // marginal: if none of the list holds up, retry each with 1, then 2 more of its main unit.
      const confirm = async (list) => {
        for (let bump = 0; bump <= 2; bump++) {
          for (const f of list) {
            const main = mainUnit(f.counts);
            const counts = f.counts.map(([id, n]) => [id, id === main ? n + bump : n]);
            if (armySize(counts) > level.cap || armyCost(counts) > limit) continue;
            const r = await trial(level.id, counts, fresh, needC);
            if (r.ok) return { ...f, counts, cost: armyCost(counts), confirm: `${r.wins}/${r.played}`, avgTime: +r.time.toFixed(1) };
          }
        }
        return null;
      };
      const sorted = [...found].sort((a, b) => a.cost - b.cost);
      const cheapest = await confirm(sorted.slice(0, 6));
      const cheapestMono = await confirm(sorted.filter((f) => f.mono).slice(0, 4));
      let alt = null;
      const first = cheapest || cheapestMono;
      if (first) {
        const main = mainUnit(first.counts);
        // no win without the main unit yet: search mono armies of the other units up to the limit
        if (!sorted.some((f) => !f.counts.some(([id]) => id === main))) {
          await Promise.all(mono.filter((m) => !m.n && m.u.id !== main).map((m) => monoSearch(m.u, () => Infinity)));
        }
        const others = [...found].sort((a, b) => a.cost - b.cost).filter((f) => !f.counts.some(([id]) => id === main));
        if (others.length && !QUICK) await trim(others[0]);
        alt = await confirm([...found].sort((a, b) => a.cost - b.cost).filter((f) => !f.counts.some(([id]) => id === main)).slice(0, 4));
      }
      // the cheapest confirmed army overall (the cheapest few can all fail confirmation)
      const best3 = [cheapest, cheapestMono, alt].filter(Boolean).sort((x, y) => x.cost - y.cost)[0] || null;
      return { cheapest: best3, cheapestMono, alt, secs: Math.round((performance.now() - t0) / 1000), tried: cache.size };
    },
  };
}

const suggest = (res, L) => starsFrom({ cheapest: res.cheapest?.cost, alt: res.alt?.cost, mono: res.cheapestMono?.cost }, L.budget);

const fmt = (c) => (c ? c.counts.map(([id, n]) => `${n}x${id}`).join(' + ') + ` = ${c.cost}g (${c.confirm})` : '-');
const pack = (c) => c && { army: c.counts, cost: c.cost, confirm: c.confirm, avgTime: c.avgTime };
const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const T0 = performance.now();
const CONC = Math.max(2, Math.ceil(WORKERS * 1.5));
let next = 0;
async function lane() {
  while (next < levels.length) {
    const L = levels[next++];
    const res = await solver(L).run();
    const sg = suggest(res, L);
    const [c3, c2] = campaign.starGold(L);
    results[L.id] = {
      name: L.name, world: campaign.WORLDS[L.world].id, budget: L.budget, cap: L.cap, enemyValue: campaign.armyValue(campaign.enemyArmy(L)),
      stars: [c3, c2], cheapest: pack(res.cheapest), cheapestMono: pack(res.cheapestMono), alt: pack(res.alt),
      suggest: sg, tried: res.tried, secs: res.secs, date: new Date().toISOString().slice(0, 10),
    };
    if (OUT !== '-') fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
    const verdict = !res.cheapest ? 'NO WIN FOUND' : res.cheapest.cost > L.budget ? 'OVER BUDGET' : res.cheapest.cost > c3 ? '3* UNREACHED' : 'ok';
    console.log(`${L.id.padEnd(4)} ${L.name.padEnd(22)} budget ${L.budget} cap ${L.cap} stars ${c3}/${c2} | ${verdict}` +
      `\n     cheapest: ${fmt(res.cheapest)}\n     mono:     ${fmt(res.cheapestMono)}\n     alt:      ${fmt(res.alt)}` +
      `\n     suggest:  ${sg ? `3* ${sg.g3}  2* ${sg.g2}  budget >= ${sg.need}` : '-'}   [${res.tried} armies, ${res.secs}s, ${fights} fights total]`);
  }
}
await Promise.all(Array.from({ length: CONC }, lane));
console.log(`done: ${levels.length} levels, ${fights} fights, ${Math.round((performance.now() - T0) / 1000)}s`);
clearInterval(ticker);
for (const w of pool) w.terminate();
