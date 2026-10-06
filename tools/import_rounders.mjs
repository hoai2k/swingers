#!/usr/bin/env node
// Import the Rounders cast + soundtrack into Swingers.
//
//   node tools/import_rounders.mjs /path/to/rounders
//
// Characters: Rounders sizes each body with a circle fitted to the art at
// load time (js/rig.js) plus the per-character overrides authored in its
// /workbench (render/rigs.json: bodyScale, bodyOffset, bodyRotation, pivot,
// radius). Rather than re-implement that, this script runs Rounders' own
// rig code in headless Chromium and records exactly what it resolves, so a
// body is drawn in Swingers at the same size and alignment as in Rounders.
// Output: assets/characters/<id>.png (256px) + src/characters-data.js.
//
// Guns: the Rounders weapons that shoot (not the blades) become the gun
// pickups, with the grip and muzzle points Rounders resolves for them
// (assets/guns/<id>.png, cropped; ROUNDERS_GUNS in src/characters-data.js).
// A few effect sprites (muzzle flash, shockwave ring, dust puff) come along
// into assets/fx/.
//
// Music: copies assets/music/*.mp3 as-is.
//
// Needs Playwright (globally installed in the cloud sessions) and python3
// with Pillow (for the resize).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.argv[2] || '../rounders');
const SIZE = 256;   // shipped sprite size (Rounders' parts are 512)
// Rounders weapons that fire something (scythes, katanas, knives and
// chainblades stay behind)
const GUN_IDS = ['pip', 'bolt', 'mochi', 'gruff', 'nova', 'fizz', 'ember', 'glacia', 'duke',
  'sprocket', 'rook', 'jinx', 'diesel', 'havoc', 'blitz', 'riot'];
const FX = ['muzzle-flash', 'shockwave-ring', 'dust-puff', 'shield-bubble'];

if (!fs.existsSync(path.join(SRC, 'js/rig.js'))) {
  console.error(`not a Rounders checkout: ${SRC}`);
  process.exit(1);
}

// serve the Rounders checkout and let its own code resolve every rig
const port = 8000 + Math.floor(Math.random() * 900);
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: SRC, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
let cast;
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForFunction(() => window.ROUNDERS && window.ROUNDERS.rig && window.ROUNDERS.CHARACTERS);
  cast = await page.evaluate(async () => {
    const R = window.ROUNDERS, rig = R.rig;
    const ids = R.CHARACTERS.map((c) => c.id);
    rig.preload(ids);
    await rig.ready();
    for (let t = 0; t < 300 && !ids.every((id) => rig.assets(id).state !== 'loading'); t++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return R.CHARACTERS.map((c) => {
      const e = rig.assets(c.id), r = rig.resolved(c.id);
      if (!r || !e.body) throw new Error(`no rig for ${c.id}`);
      return {
        id: c.id, name: c.name, title: c.title, blurb: c.blurb,
        color: c.color, dark: c.dark, accent: c.accent,
        w: e.body.width, h: e.body.height,
        pivot: r.body.pivot, radius: r.body.radius,
        bodyScale: r.rig.bodyScale, bodyOffset: r.rig.bodyOffset, bodyRotation: r.rig.bodyRotation,
        weapon: e.weapon ? { kind: c.weapon, w: e.weapon.width, h: e.weapon.height, grip: r.weapon.grip, muzzle: r.weapon.muzzle } : null,
      };
    });
  });
} finally {
  await browser.close();
  server.kill();
}

// resize the bodies and rescale their anchors to match
const outDir = path.join(ROOT, 'assets/characters');
fs.mkdirSync(outDir, { recursive: true });
const r1 = (v) => Math.round(v * 100) / 100;
for (const c of cast) {
  const src = path.join(SRC, `assets/images/characters/render/${c.id}_body.png`);
  execFileSync('python3', ['-I', '-c',
    'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGBA").resize((int(sys.argv[3]),)*2, Image.LANCZOS).save(sys.argv[2], optimize=True)',
    src, path.join(outDir, `${c.id}.png`), String(SIZE)]);
  const k = SIZE / c.w;
  c.pivot = { x: r1(c.pivot.x * k), y: r1(c.pivot.y * k) };
  c.radius = r1(c.radius * k);
  c.size = SIZE;
  delete c.w; delete c.h;
}

// guns: crop each weapon to its ink, scale the long side to SIZE, and carry
// the grip/muzzle points along
const gunDir = path.join(ROOT, 'assets/guns');
fs.mkdirSync(gunDir, { recursive: true });
const guns = [];
for (const c of cast) {
  const w = c.weapon;
  delete c.weapon;
  if (!w || !GUN_IDS.includes(c.id)) continue;
  const src = path.join(SRC, `assets/images/characters/render/${c.id}_weapon.png`);
  const box = JSON.parse(execFileSync('python3', ['-I', '-c', `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
bb = im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
x0, y0, x1, y1 = bb
k = int(sys.argv[3]) / max(x1 - x0, y1 - y0)
im.crop(bb).resize((max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))), Image.LANCZOS).save(sys.argv[2], optimize=True)
print(json.dumps({"x0": x0, "y0": y0, "k": k, "w": round((x1 - x0) * k), "h": round((y1 - y0) * k)}))
`, src, path.join(gunDir, `${c.id}.png`), String(SIZE)]).toString());
  const map = (p) => ({ x: r1((p.x - box.x0) * box.k), y: r1((p.y - box.y0) * box.k) });
  guns.push({ id: c.id, kind: w.kind, owner: c.name, color: c.color, accent: c.accent,
    w: box.w, h: box.h, grip: map(w.grip), muzzle: map(w.muzzle) });
}

// effect sprites
const fxDir = path.join(ROOT, 'assets/fx');
fs.mkdirSync(fxDir, { recursive: true });
for (const f of FX) fs.copyFileSync(path.join(SRC, `assets/images/fx/${f}.png`), path.join(fxDir, `${f}.png`));

const rev = (() => { try { return execFileSync('git', ['-C', SRC, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch { return '?'; } })();
const js = `// GENERATED by tools/import_rounders.mjs from Rounders @ ${rev} — do not edit.
// Per-character body sizing exactly as Rounders resolves it: pivot/radius
// are the fitted ball in the ${SIZE}px sprite, bodyScale/bodyOffset/
// bodyRotation are the /workbench overrides. Draw with
//   k = r / radius * bodyScale, image at -pivot * k, offset bodyOffset * r.
export const ROUNDERS_CAST = ${JSON.stringify(cast, null, 1)};

// Gun pickups: Rounders weapons cropped to their ink (w x h px); grip is
// where the hand holds it, muzzle where shots leave.
export const ROUNDERS_GUNS = ${JSON.stringify(guns, null, 1)};
`;
fs.writeFileSync(path.join(ROOT, 'src/characters-data.js'), js);

// soundtrack
const musicOut = path.join(ROOT, 'assets/music');
fs.mkdirSync(musicOut, { recursive: true });
const tracks = fs.readdirSync(path.join(SRC, 'assets/music')).filter((f) => f.endsWith('.mp3')).sort();
for (const f of tracks) fs.copyFileSync(path.join(SRC, 'assets/music', f), path.join(musicOut, f));

console.log(`imported ${cast.length} characters, ${guns.length} guns, ${FX.length} effects and ${tracks.length} tracks from Rounders @ ${rev}`);
