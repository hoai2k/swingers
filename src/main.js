// Boot: fixed-timestep loop (60 Hz physics, render every frame).

import { Game } from './game.js';

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
