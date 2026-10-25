// Headless check of the arcade game logic (no browser): runs each game's
// attract-mode AI for a while and prints scores. node wobblers/tools/arcade-sim.mjs
import { ChompMaze } from '../src/arcade/chomp.js';
import { SpaceRaiders } from '../src/arcade/raiders.js';
import { BugBlaster } from '../src/arcade/bugs.js';
import { PaddleBall } from '../src/arcade/paddle.js';

for (const G of [ChompMaze, SpaceRaiders, BugBlaster, PaddleBall]) {
  const m = new G();
  let games = 0, best = 0, steps = 0;
  const t0 = Date.now();
  while (steps < 60 * 60 * 6) {
    m.step([]); steps++;
    if (m.over) { games++; best = Math.max(best, m.score); m.reset(); }
  }
  best = Math.max(best, m.score);
  const extra = G === ChompMaze ? ` level ${m.level} dots left ${m.left}` : G === SpaceRaiders ? ` wave ${m.wave} aliens ${m.count}` : G === BugBlaster ? ` wave ${m.wave}` : ` pts ${m.pts}`;
  console.log(`${G.title}: 6 sim-minutes, ${games} games over, best ${best}${extra}, ${Date.now() - t0} ms`);
}

// ---- mechanics checks ----------------------------------------------------------
const ok = (name, cond, info = '') => console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
const idle = { x: 0, y: 0, fire: false, fireP: false };
{ // chomp: walking left from the start eats dots
  const m = new ChompMaze(); m.phase = 'play';
  for (let i = 0; i < 60; i++) m.step([{ ...idle, x: -1 }]);
  ok('chomp eats dots', m.score > 0 && m.left < 250, `score ${m.score} left ${m.left}`);
}
{ // raiders: a shot under a raider removes it
  const m = new SpaceRaiders(); m.phase = 'play';
  const [x, y] = m.alienXY(4, 5); m.shot = { x: x + 6, y: y + 12 };
  m.step([idle]);
  ok('raider shot', !m.alive[4][5] && m.count === 54 && m.score === 10, `count ${m.count}`);
}
{ // bug blaster: shooting a middle segment splits the bug and leaves a mushroom
  const m = new BugBlaster(); m.phase = 'play';
  for (let r = 2; r < 32; r++) m.mush[r].fill(0);
  const mid = m.segs[6], sx = mid.x, sy = mid.y;
  m.shot = { x: mid.x + 4, y: mid.y + 7 + 9 }; // tested before the bug moves this step
  m.step([idle]);
  const heads = m.segs.filter((s) => s.alive && m.isHead(s)).length;
  ok('bug split', !mid.alive && heads === 2 && m.mush[Math.round(sy / 8)][Math.round(sx / 8)] === 4, `heads ${heads}`);
}
{ // paddle ball: a ball past the left paddle scores for the right; slot 1 takes input
  const m = new PaddleBall(); m.serveT = 0; m.ball = { x: 30, y: 20, vx: -5, vy: 0 }; m.pad[0].y = 170;
  for (let i = 0; i < 20; i++) m.step([idle, idle]);
  ok('paddle point', m.pts[1] === 1 && m.pts[0] === 0, JSON.stringify(m.pts));
  const y0 = m.pad[1].y; for (let i = 0; i < 10; i++) m.step([null, { ...idle, y: 1 }]);
  ok('paddle 2 moves', m.pad[1].y < y0, `${y0} -> ${m.pad[1].y}`);
}
