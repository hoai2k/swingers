// Worker thread for solve.mjs: runs fights on request.
import { parentPort } from 'node:worker_threads';
import { fight, load } from './sim.mjs';

await load();
parentPort.on('message', async (job) => {
  try {
    const r = await fight(job.level, job.counts, { seed: job.seed, maxTime: job.maxTime });
    parentPort.postMessage({ id: job.id, r });
  } catch (e) {
    parentPort.postMessage({ id: job.id, err: String(e && e.stack || e) });
  }
});
parentPort.postMessage({ ready: true });
