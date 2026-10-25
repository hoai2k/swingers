// Child process: runs battles sent by run.mjs over IPC.
import { load, fight, applyOverrides } from './lib.mjs';
const G = await load();
await applyOverrides(G, process.env.OVERRIDE);
process.on('message', (job) => {
  let res;
  try { res = fight(G, job); } catch (e) { res = { ...job, error: String((e && e.stack) || e) }; }
  process.send(res);
});
process.on('disconnect', () => process.exit(0));
process.send({ ready: true });
