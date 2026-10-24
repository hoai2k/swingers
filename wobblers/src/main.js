import { RAPIER } from './physics.js';
import { loadManifest, hasAsset } from './assets.js';

const pct = document.getElementById('loadpct');
pct.textContent = '10%';
await Promise.all([RAPIER.init(), loadManifest()]);
// painted logo, if delivered
if (hasAsset('ui/logo.png')) {
  const logo = document.querySelector('.logo');
  if (logo) logo.innerHTML = '<img src="assets/ui/logo.png" alt="Wobblers" class="logoimg">';
}
pct.textContent = '40%';
const { Game } = await import('./game.js');
await new Promise((r) => setTimeout(r, 0));
const game = new Game(document.getElementById('view'));
window.__wob = game;
pct.textContent = '100%';
game.ui.setReady();
game.run();
