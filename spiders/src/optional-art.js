// Optional delivered art (spiders/assets/web/): title logo, key art, lobby
// backdrop... Only files listed in assets/web/manifest.json are requested,
// so a missing image never 404s; every listed one goes through track() so
// the boot loading bar waits for it. Callers keep the procedural fallback:
//   const LOGO = optionalImage('logo.png');  ...  if (ready(LOGO.img)) draw it

import { track, trackPromise, ready } from './preload.js';

const holders = new Map();
let listed = null;

function load(name, h) {
  if (!listed || h.img || !listed.has(name)) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = `assets/web/${name}`;
  track(img);
  h.img = img;
}

trackPromise(
  fetch('assets/web/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((m) => {
      listed = new Set((m && m.images) || []);
      for (const [name, h] of holders) load(name, h);
    }),
);

export function optionalImage(name) {
  if (!holders.has(name)) { const h = { name, img: null }; holders.set(name, h); load(name, h); }
  return holders.get(name);
}
export { ready };
