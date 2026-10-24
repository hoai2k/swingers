import { RAPIER } from './physics.js';

const pct = document.getElementById('loadpct');
pct.textContent = '10%';
await RAPIER.init();
pct.textContent = '40%';
const { Game } = await import('./game.js');
await new Promise((r) => setTimeout(r, 0));
const game = new Game(document.getElementById('view'));
window.__wob = game;
pct.textContent = '100%';
game.ui.setReady();
game.run();
