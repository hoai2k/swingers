// Match each recorded sound's loudness to the synthesised sound it replaces.
//   python3 -m http.server 8131 (repo root), then: node battles/dev/sfx/calibrate.cjs [--sets]
// (--sets: only the faction sets, leaving the main index's levels as they are)
// Renders the synth and every recorded variant offline in the browser, compares
// their loudest 50 ms (RMS) and writes the gain per sound into
// battles/assets/sfx/index.json (`_levels`), which src/audio.js applies. Faction sets
// (assets/sfx/<set>/index.json from generate.py) are matched against the synthesised
// sound each one falls back to (`_fallback`: [synth name, pitch]); the JJK set (imported,
// no fallbacks) is left alone.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const SFX = path.join(__dirname, '../../assets/sfx');
const FLOOR = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, 'sfx.json'), 'utf8')).sounds.filter((s) => s.floor).map((s) => [s.name, s.floor]));
const IXS = [...(process.argv.includes('--sets') ? [] : [path.join(SFX, 'index.json')]), ...['avatar', 'minecraft', 'galactic'].map((s) => path.join(SFX, s, 'index.json')).filter((f) => fs.existsSync(f))];
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.goto('http://localhost:8131/battles/dev/lineup.html').catch(() => {});
  for (const IX of IXS) {
  const ix = JSON.parse(fs.readFileSync(IX, 'utf8'));
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
      const [sn, sp] = ix._fallback?.[name] || [name, 1];
      const syn = await render((a, ctx, g) => { a.synth(sn, g, 0.05, sp, 1); });
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
  for (const [k, v] of Object.entries(out)) { v.level = Math.max(v.level, FLOOR[k] || 0); ix._levels[k] = +v.level.toFixed(3); console.log(k.padEnd(12), 'synth', v.syn.toFixed(3), 'rec', v.avg.toFixed(3), '-> level', v.level.toFixed(2)); }
  fs.writeFileSync(IX, JSON.stringify(ix, null, 1));
  }
  await b.close();
})();
