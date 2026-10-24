import { Game } from './game.js';

const bar = document.getElementById('loadmsg');
const fail = (e) => {
  console.error(e);
  bar.textContent = 'Something broke: ' + (e && e.message ? e.message : e);
  document.getElementById('loading').classList.add('err');
};
addEventListener('error', (e) => fail(e.error || e.message));
try {
  const game = new Game(document.getElementById('c'), document.getElementById('hud'));
  await game.init((msg) => { bar.textContent = msg; });
  document.getElementById('loading').remove();
} catch (e) {
  fail(e);
}
