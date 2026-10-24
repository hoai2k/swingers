// Entry point: builds the Game, registers the scenes and runs the loop.
// window.__sp is the live Game (headless probes: __sp.input.mock,
// __sp.step(1/60), spider.place(x, y)).

import { Game } from './game.js';
import { Boot, Title } from './title.js';
import { Lobby } from './lobby.js';
import { VsMode } from './modes/vs.js';
import './weapons/index.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.scenes.boot = (g, o) => new Boot(g, o);
game.scenes.title = (g, o) => new Title(g, o);
game.scenes.lobby = (g, o) => new Lobby(g, o);
game.scenes.versus = (g, o) => new VsMode(g, o);
window.__sp = game;

const params = new URLSearchParams(location.search);
game.go('boot');

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (!game.manual) game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
