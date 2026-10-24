// DOM overlay: title menu, per-player setup panels, battle HUD, results, replay bar.
import { FACTIONS, UNITS, unitsOfFaction } from './units.js';
import { TEAM_COLORS, TEAM_NAMES } from './visual.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
export const btn = (b) => `<span class="pb pb-${b.toLowerCase()}">${b}</span>`;
const fmt = (n) => (n === Infinity ? '∞' : Math.round(n).toLocaleString('en-US'));

export class UI {
  constructor(root) {
    this.root = root;
    this.layers = {};
    for (const k of ['title', 'setup', 'battle', 'result', 'replay', 'pause', 'toast', 'help']) {
      const l = el('div', 'layer layer-' + k);
      root.appendChild(l);
      this.layers[k] = l;
    }
    this.portraits = {};
    this.cache = new Map();
  }

  show(name, on) { this.layers[name].style.display = on ? '' : 'none'; }
  only(...names) { for (const k of Object.keys(this.layers)) if (k !== 'toast') this.show(k, names.includes(k)); }

  setText(e, s) { if (e._t !== s) { e._t = s; e.innerHTML = s; } }

  // ------------------------------------------------------------- title
  buildTitle() {
    const L = this.layers.title;
    L.innerHTML = '';
    const logo = el('div', 'logo');
    const words = ['TOTALLY', 'NOT', 'ACCURATE', 'BATTLE', 'SIMULATOR'];
    logo.innerHTML = words.map((w, i) => `<span class="lw lw${i}">${w.split('').map((c, j) => `<i style="--d:${(i * 7 + j) * 0.06}s">${c}</i>`).join('')}</span>`).join('');
    L.appendChild(logo);
    const sub = el('div', 'subtitle', '2 player local battles &middot; build armies at the same time');
    L.appendChild(sub);
    this.menu = el('div', 'menu');
    L.appendChild(this.menu);
    this.pads = el('div', 'pads');
    L.appendChild(this.pads);
  }

  updateTitle(items, sel, pads, soundOff) {
    const html = items.map((it, i) => `<div class="mi ${i === sel ? 'sel' : ''}">${it.value !== undefined
      ? `<span class="ml">${it.label}</span><span class="mv">${i === sel ? '◀ ' : ''}${it.value}${i === sel ? ' ▶' : ''}</span>`
      : `<span class="ml big">${it.label}</span>`}</div>`).join('');
    this.setText(this.menu, html);
    this.setText(this.pads, pads.map((p, i) => `<div class="pad p${i}"><b>P${i + 1}</b> ${p ? '🎮 ' + p.replace(/\(.*\)/, '').slice(0, 28) : '⌨ keyboard <small>(press a button on a pad to connect it)</small>'} </div>`).join('') +
      (soundOff ? '<div class="pad">🔇 click or press a key to enable sound</div>' : ''));
  }

  // ------------------------------------------------------------- setup
  buildSetup() {
    const L = this.layers.setup;
    L.innerHTML = '';
    this.sp = [];
    for (let p = 0; p < 2; p++) {
      const half = el('div', `half half${p}`);
      const top = el('div', 'army-top');
      top.innerHTML = `<div class="team-name" style="--tc:${TEAM_COLORS[p]}">${TEAM_NAMES[p].toUpperCase()} ARMY <small>P${p + 1}</small></div>
        <div class="gold"><span class="coin"></span><span class="gv"></span></div><div class="cnt"></div>`;
      half.appendChild(top);
      const reticle = el('div', 'reticle');
      half.appendChild(reticle);
      const status = el('div', 'status');
      half.appendChild(status);
      const bar = el('div', 'unitbar');
      const tabs = el('div', 'tabs');
      const cards = el('div', 'cards');
      bar.appendChild(tabs); bar.appendChild(cards);
      half.appendChild(bar);
      const hints = el('div', 'hints');
      hints.innerHTML = `${btn('A')} place ${btn('B')} remove ${btn('X')} hold: clear ${btn('Y')} ready &nbsp; ✥ ←→ unit ↑↓ faction &nbsp; ${btn('LB')}${btn('RB')} down/up ${btn('L3')} fast`;
      half.appendChild(hints);
      const ready = el('div', 'readybadge', 'READY!');
      half.appendChild(ready);
      L.appendChild(half);
      this.sp.push({ half, top, gv: top.querySelector('.gv'), cnt: top.querySelector('.cnt'), reticle, status, tabs, cards, ready, faction: -1, unit: -1 });
    }
    this.countdown = el('div', 'countdown');
    L.appendChild(this.countdown);
    this.divider = el('div', 'divider');
    L.appendChild(this.divider);
  }

  updateSetup(p, d) {
    const s = this.sp[p];
    s.half.classList.toggle('solo', !!d.solo);
    this.setText(s.gv, `${fmt(d.used)} <small>/ ${fmt(d.budget)}</small>`);
    this.setText(s.cnt, `${d.count} unit${d.count === 1 ? '' : 's'}`);
    s.ready.style.display = d.ready ? '' : 'none';
    this.setText(s.status, d.status || '');
    s.reticle.className = 'reticle ' + (d.valid ? 'ok' : 'bad');
    if (s.faction !== d.faction) {
      s.faction = d.faction;
      s.unit = -1;
      this.setText(s.tabs, FACTIONS.map((f, i) => `<span class="tab ${i === d.faction ? 'on' : ''}" style="--fc:${f.color}">${f.name}</span>`).join(''));
      const list = unitsOfFaction(FACTIONS[d.faction].id);
      s.cards.innerHTML = list.map((u) => `<div class="card" data-id="${u.id}">
        <img src="${this.portraits[u.id + ':' + p] || ''}" alt=""><div class="cn">${u.name}</div><div class="cc"><span class="coin"></span>${u.cost}</div></div>`).join('');
    }
    if (s.unit !== d.unit) {
      s.unit = d.unit;
      [...s.cards.children].forEach((c, i) => c.classList.toggle('sel', i === d.unit));
      const def = unitsOfFaction(FACTIONS[d.faction].id)[d.unit];
      s.desc = def;
    }
    [...s.cards.children].forEach((c) => {
      const u = UNITS.find((x) => x.id === c.dataset.id);
      c.classList.toggle('poor', u.cost > d.budget - d.used);
    });
  }

  setCountdown(t) {
    this.setText(this.countdown, t > 0 ? `<div>BATTLE IN</div><b>${Math.ceil(t)}</b>` : '');
    this.countdown.style.display = t > 0 ? '' : 'none';
  }

  // ------------------------------------------------------------- battle
  buildBattle() {
    const L = this.layers.battle;
    L.innerHTML = '';
    this.counts = el('div', 'counts');
    L.appendChild(this.counts);
    this.tscale = el('div', 'tscale');
    L.appendChild(this.tscale);
    this.viewLabels = [el('div', 'viewlabel v0'), el('div', 'viewlabel v1')];
    this.viewLabels.forEach((v) => L.appendChild(v));
    this.reticles = [el('div', 'reticle small v0'), el('div', 'reticle small v1')];
    this.reticles.forEach((v) => L.appendChild(v));
    this.bhints = el('div', 'bhints');
    L.appendChild(this.bhints);
    this.bdivider = el('div', 'divider');
    L.appendChild(this.bdivider);
  }

  updateBattle(d) {
    const [a, b] = d.counts;
    const tot = Math.max(1, d.start[0] + d.start[1]);
    this.setText(this.counts, `<span class="cb" style="--tc:${TEAM_COLORS[0]}">${a}</span>
      <span class="bar"><i style="width:${(a / Math.max(1, d.start[0])) * 50}%;background:${TEAM_COLORS[0]}"></i><em style="width:${(b / Math.max(1, d.start[1])) * 50}%;background:${TEAM_COLORS[1]}"></em></span>
      <span class="cb" style="--tc:${TEAM_COLORS[1]}">${b}</span>`);
    this.setText(this.tscale, d.paused ? 'PAUSED' : d.scale !== 1 ? `${d.scale < 1 ? 'SLOW MOTION' : 'FAST'} ${d.scale}×` : '');
    this.layers.battle.classList.toggle('split', d.split);
    this.bdivider.style.display = d.split ? '' : 'none';
    for (let i = 0; i < 2; i++) {
      const v = d.views[i];
      this.viewLabels[i].style.display = v ? '' : 'none';
      this.reticles[i].style.display = v && v.reticle ? '' : 'none';
      if (v) this.setText(this.viewLabels[i], v.label || '');
    }
    this.bhints.style.display = d.hints ? '' : 'none';
    this.setText(this.bhints, d.hintText || '');
  }

  // ------------------------------------------------------------- result
  showResult(d) {
    const L = this.layers.result;
    const col = d.winner >= 0 ? TEAM_COLORS[d.winner] : '#ddd';
    const title = d.winner >= 0 ? `${TEAM_NAMES[d.winner].toUpperCase()} VICTORY` : 'DRAW';
    L.innerHTML = `<div class="victory" style="--tc:${col}">${title}</div>
      <div class="rstats">${[0, 1].map((t) => `<div class="rs" style="--tc:${TEAM_COLORS[t]}"><b>${TEAM_NAMES[t]}</b>
        <div>${d.stats[t].alive} / ${d.stats[t].total} survived</div><div>${fmt(d.stats[t].startValue - d.stats[t].value)} gold lost</div></div>`).join('')}</div>
      <div class="rmenu">${btn('A')} Watch replay &nbsp; ${btn('X')} Rematch &nbsp; ${btn('Y')} Edit armies &nbsp; ${btn('B')} Main menu</div>
      <div class="rhint">Keep flying around — the battlefield stays live.</div>`;
  }

  // ------------------------------------------------------------- replay
  buildReplay() {
    const L = this.layers.replay;
    L.innerHTML = `<div class="rlabel">● REPLAY</div><div class="rbar"><div class="rfill"></div><div class="rtime"></div></div>
      <div class="rhints">${btn('LT')}${btn('RT')} scrub &nbsp; ${btn('A')} play/pause &nbsp; ✥ ←→ skip ↑↓ speed &nbsp; ${btn('Y')} restart &nbsp; ${btn('X')} follow &nbsp; ${btn('B')} exit</div>`;
    this.rfill = L.querySelector('.rfill');
    this.rtime = L.querySelector('.rtime');
  }

  updateReplay(t, dur, speed, playing) {
    this.rfill.style.width = `${(t / Math.max(0.01, dur)) * 100}%`;
    const f = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    this.setText(this.rtime, `${playing ? '▶' : '❚❚'} ${f(t)} / ${f(dur)} &nbsp; ${speed}×`);
  }

  // ------------------------------------------------------------- pause
  updatePause(items, sel) {
    this.setText(this.layers.pause, `<div class="pbox"><h2>PAUSED</h2>${items.map((it, i) => `<div class="mi ${i === sel ? 'sel' : ''}"><span class="ml">${it}</span></div>`).join('')}</div>`);
  }

  toast(msg, time = 1.6) {
    const t = el('div', 'toastmsg', msg);
    this.layers.toast.appendChild(t);
    setTimeout(() => t.classList.add('out'), time * 1000);
    setTimeout(() => t.remove(), time * 1000 + 600);
  }

  // ------------------------------------------------------------- help
  setHelp(on) {
    this.show('help', on);
    if (!on) return;
    this.layers.help.innerHTML = `<div class="hbox"><h2>Controls</h2>
    <table>
    <tr><th></th><th>Army setup (both players at once)</th><th>Watching the battle</th></tr>
    <tr><td>Left stick</td><td>fly</td><td>fly / possessed unit: walk</td></tr>
    <tr><td>Right stick</td><td>look</td><td>look</td></tr>
    <tr><td>${btn('LB')} ${btn('RB')}</td><td>down / up</td><td>down / up</td></tr>
    <tr><td>${btn('L3')}</td><td>fly fast (hold)</td><td>fly fast (hold)</td></tr>
    <tr><td>${btn('A')}</td><td>place unit (hold to paint)</td><td>follow unit in crosshair &middot; jump when possessing</td></tr>
    <tr><td>${btn('B')}</td><td>remove unit (hold)</td><td>free camera / stop possessing</td></tr>
    <tr><td>${btn('X')}</td><td>hold: clear your army</td><td>possess unit in crosshair</td></tr>
    <tr><td>${btn('Y')}</td><td>ready / not ready</td><td>slow motion</td></tr>
    <tr><td>${btn('RT')}</td><td>—</td><td>attack (possessing)</td></tr>
    <tr><td>D-pad</td><td>←→ unit, ↑↓ faction</td><td>↑↓ time speed</td></tr>
    <tr><td>${btn('LT')}</td><td>—</td><td>hold: slow, smooth camera</td></tr>
    <tr><td>${btn('R3')}</td><td>—</td><td>cycle tips / HUD off</td></tr>
    <tr><td>${btn('View')}</td><td>—</td><td>split / shared screen</td></tr>
    <tr><td>${btn('Start')}</td><td>ready</td><td>pause menu</td></tr>
    </table>
    <p>Keyboard: P1 WASD / arrows / Q E / Space R F Y / 1-4, mouse right-drag look, click place, wheel unit.
    P2 IJKL / numpad 8456 / U O / H N M P.</p><p>${btn('B')} close</p></div>`;
  }
}
