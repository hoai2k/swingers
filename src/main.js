// Boot: fixed-timestep loop (60 Hz physics, render every frame).

import { Game } from './game.js';

// canvas text doesn't trigger web-font loading by itself — ask for the
// UI face up front (it draws with the fallback until it arrives)
if (document.fonts) {
  for (const w of [400, 600, 700]) document.fonts.load(`${w} 20px Fredoka`).catch(() => {});
}

const canvas = document.getElementById('game');
const game = new Game(canvas);

// Debug/inspection handle (used by the headless playtest harness too).
window.__hh = game;

const STEP = 1000 / 60;
let last = performance.now();
let acc = 0;

function frame(now) {
  acc += Math.min(120, now - last);
  last = now;
  let n = 0;
  while (acc >= STEP && n < 4) {
    game.step(STEP / 1000);
    acc -= STEP;
    n++;
  }
  if (n === 4) acc = 0; // don't spiral after a long tab-away
  game.draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
