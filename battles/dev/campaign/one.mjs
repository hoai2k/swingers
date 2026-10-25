// Play one army against one level a few times and print each result.
//   node battles/dev/campaign/one.mjs <level> unit:n[,unit:n...] [seeds=3] [maxTime=120]
import { fight, load, armyCost } from './sim.mjs';
await load();
const [lv, spec, seeds = 3, maxTime = 120] = process.argv.slice(2);
const counts = spec.split(',').map((s) => { const [id, n] = s.split(':'); return [id, +n || 1]; });
console.log(lv, spec, 'cost', armyCost(counts));
for (let s = 1; s <= +seeds; s++) {
  const t0 = performance.now();
  const r = await fight(lv, counts, { seed: s, maxTime: +maxTime });
  console.log(' seed', s, r.win ? 'WIN ' : 'loss', r.time + 's', 'alive', r.alive.join('/'), 'wall', ((performance.now() - t0) / 1000).toFixed(1) + 's');
}
