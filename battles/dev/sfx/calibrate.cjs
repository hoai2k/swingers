// Match each recorded sound's loudness to the synthesised sound it replaces.
//   python3 -m http.server 8131 (repo root), then: node battles/dev/sfx/calibrate.cjs
// Renders the synth and every recorded variant offline in the browser, compares
// their loudest 50 ms (RMS) and writes the gain per sound into
// battles/assets/sfx/index.json (`_levels`), which src/audio.js applies.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const IX = path.join(__dirname, '../../assets/sfx/index.json');
(async () => {
  const ix = JSON.parse(fs.readFileSync(IX, 'utf8'));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.goto('http://localhost:8131/battles/dev/lineup.html').catch(() => {});
  const out = await p.evaluate(async (ix) => {
    const { Audio } = await import('/battles/src/audio.js');
    const SR = 44100;
    const loud = (buf) => { // loudest 50 ms RMS
      const d = buf.getChannelData(0), w = 2205; let best = 0;
      for (let i = 0; i + w <= d.length; i += 441) { let s = 0; for (let k = i; k < i + w; k++) s += d[k] * d[k]; best = Math.max(best, Math.sqrt(s / w)); }
      return best;
    };
    const render = async (fn) => {
      const ctx = new OfflineAudioContext(1, SR * 4, SR);
      const a = new Audio(); a.attach(ctx);
      const g = ctx.createGain(); g.connect(ctx.destination);
      await fn(a, ctx, g);
      return loud(await ctx.startRendering());
    };
    const res = {};
    for (const [name, files] of Object.entries(ix)) {
      if (name.startsWith('_')) continue;
      const syn = await render((a, ctx, g) => { a.synth(name, g, 0.05, 1, 1); });
      const rec = [];
      for (const f of files) {
        const ab = await (await fetch('/battles/' + f)).arrayBuffer();
        rec.push(await render(async (a, ctx, g) => {
          const buf = await ctx.decodeAudioData(ab);
          const s = ctx.createBufferSource(); s.buffer = buf; s.connect(g); s.start(0.05);
        }));
      }
      const avg = rec.reduce((x, y) => x + y, 0) / rec.length;
      res[name] = { syn, avg, level: Math.min(1.5, Math.max(0.05, syn / avg)) };
    }
    return res;
  }, ix);
  ix._levels = {};
  for (const [k, v] of Object.entries(out)) { ix._levels[k] = +v.level.toFixed(3); console.log(k.padEnd(8), 'synth', v.syn.toFixed(3), 'rec', v.avg.toFixed(3), '-> level', v.level.toFixed(2)); }
  fs.writeFileSync(IX, JSON.stringify(ix, null, 1));
  await b.close();
})();
