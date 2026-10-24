// DOM overlay: title menu, per-player setup panels, battle HUD, results, replay bar.
import { FACTIONS, UNITS, UNIT_BY_ID, unitsOfFaction } from './units.js';
import { TEAM_COLORS, TEAM_NAMES } from './visual.js';
import { padLabel } from './input.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
export const btn = (b) => {
  const k = b.toLowerCase();
  if (k === 'dpad') return '<span class="pb pb-dpad">✥</span>';
  if (k === 'ls' || k === 'rs') return `<span class="pb pb-stick">${k === 'ls' ? 'L' : 'R'}</span>`;
  const g = k === 'view' ? '⧉ View' : k === 'start' ? '≡ Menu' : b;
  return `<span class="pb pb-${k}">${g}</span>`;
};
const fmt = (n) => (n === Infinity ? '∞' : Math.round(n).toLocaleString('en-US'));
const tc = (t) => TEAM_COLORS[t];
const ftime = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;

// One-line weapon summary for the unit info panel.
export function weaponLine(def) {
  const w = def.weapon || {};
  const k = w.kind;
  if (k === 'ranged') {
    const p = { arrow: 'arrows', spear: 'spears', hay: 'hay bales', potion: 'potions', bomb: 'bombs', fireball: 'fireballs' }[w.proj] || w.proj;
    return `Ranged · throws ${p}${w.blast ? ' (splash)' : ''} · range ${Math.round(w.range || 0)} m`;
  }
  if (k === 'heal') return `Support · heals ${w.amount || '?'} hp to allies within ${w.radius || '?'} m`;
  if (k === 'bard') return `Support · inspires allies within ${w.auraRadius || '?'} m`;
  const bits = ['Melee'];
  if (w.sweep) bits.push('hits everyone in the swing');
  if (w.blockMelee) bits.push(`blocks ${Math.round(w.blockMelee * 100)}% of melee`);
  if (w.style === 'dual') bits.push('two weapons');
  bits.push(`reach ${(+w.reach || 0).toFixed(1)} m`);
  return bits.join(' · ');
}

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

  menuHtml(items, sel) {
    return items.map((it, i) => `<div class="mi ${i === sel ? 'sel' : ''} ${it.cls || ''}">${it.value !== undefined
      ? `<span class="ml">${it.label}</span><span class="mv">${i === sel ? '◀ ' : ''}${it.value}${i === sel ? ' ▶' : ''}</span>`
      : `<span class="ml big">${it.label}</span>`}</div>`).join('');
  }

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
    this.menuHead = el('div', 'menuhead');
    L.appendChild(this.menuHead);
    this.menu = el('div', 'menu');
    L.appendChild(this.menu);
    this.menuHint = el('div', 'menuhint');
    L.appendChild(this.menuHint);
    this.pads = el('div', 'pads');
    L.appendChild(this.pads);
    this.sound = el('div', 'soundnote');
    L.appendChild(this.sound);
  }

  padCards(pads) {
    return pads.map((p, i) => `<div class="padcard p${i} ${p.name ? 'on' : ''}" style="--tc:${tc(i)}">
      <div class="pc-top"><b>P${i + 1}</b> <span class="pc-team">${TEAM_NAMES[i].toUpperCase()} ARMY</span></div>
      <div class="pc-dev">${p.name ? `🎮 ${padLabel(p.name)}${p.standard === false ? ' <small>(non-standard mapping)</small>' : ''}` : '⌨ Keyboard <small>— connect a pad and press any button</small>'}</div></div>`).join(
      `<div class="pc-swap">${btn('View')}<br>swap<br>sides</div>`);
  }

  updateTitle(d) {
    this.setText(this.menuHead, d.head || '');
    this.setText(this.menu, this.menuHtml(d.items, d.sel));
    this.setText(this.menuHint, d.hint || '');
    this.setText(this.pads, this.padCards(d.pads));
    this.setText(this.sound, d.soundOff ? '🔇 press any button to enable sound' : '');
  }

  // ------------------------------------------------------------- setup
  buildSetup() {
    const L = this.layers.setup;
    L.innerHTML = '';
    this.sp = [];
    for (let p = 0; p < 2; p++) {
      const half = el('div', `half half${p}`);
      half.style.setProperty('--tc', tc(p));
      const top = el('div', 'army-top');
      top.innerHTML = `<div class="team-name">${TEAM_NAMES[p].toUpperCase()} <small class="pid"></small></div>
        <div class="gold"><span class="coin"></span><span class="gv"></span></div><div class="cnt"></div><div class="foe"></div>`;
      half.appendChild(top);
      const info = el('div', 'uinfo');
      half.appendChild(info);
      const roster = el('div', 'roster');
      half.appendChild(roster);
      const reticle = el('div', 'reticle');
      half.appendChild(reticle);
      const status = el('div', 'status');
      half.appendChild(status);
      const bar = el('div', 'unitbar');
      const tabs = el('div', 'tabs');
      const cards = el('div', 'cards');
      const brush = el('div', 'brush');
      bar.appendChild(tabs); bar.appendChild(cards); bar.appendChild(brush);
      half.appendChild(bar);
      const hints = el('div', 'hints');
      hints.innerHTML = `<div>${btn('A')} place <small>(hold: paint)</small> ${btn('B')} remove ${btn('X')} undo ${btn('Y')} ready</div>
        <div>${btn('dpad')} ←→ unit ↑↓ faction &nbsp;${btn('LT')}${btn('RT')} brush &nbsp;${btn('LB')}${btn('RB')} down/up &nbsp;${btn('View')} clear &nbsp;${btn('Start')} menu</div>`;
      half.appendChild(hints);
      const ready = el('div', 'readybadge', 'READY!');
      half.appendChild(ready);
      const modal = el('div', 'hmodal');
      half.appendChild(modal);
      L.appendChild(half);
      this.sp.push({ half, top, pid: top.querySelector('.pid'), gv: top.querySelector('.gv'), cnt: top.querySelector('.cnt'), foe: top.querySelector('.foe'), info, roster, reticle, status, brush, tabs, cards, ready, modal, faction: -1, unit: -1, budgetKey: '' });
    }
    this.countdown = el('div', 'countdown');
    L.appendChild(this.countdown);
    this.divider = el('div', 'divider');
    L.appendChild(this.divider);
  }

  infoHtml(def, p) {
    const w = def.weapon || {};
    const dmg = w.kind === 'heal' ? `+${w.amount}` : w.damage;
    const dps = w.cooldown ? (w.kind === 'heal' ? '' : ` <small>/${(+w.cooldown).toFixed(1)}s</small>`) : '';
    const fac = FACTIONS.find((f) => f.id === def.faction);
    return `<img src="${this.portraits[def.id + ':' + p] || ''}" alt="">
      <div class="ui-body"><div class="ui-name">${def.name} <span class="ui-fac" style="--fc:${fac ? fac.color : '#999'}">${fac ? fac.name : ''}</span></div>
      <div class="ui-stats"><span title="cost"><span class="coin"></span>${fmt(def.cost)}</span><span title="health">❤ ${fmt(def.hp)}</span><span title="damage">${dmg ?? '–'} ${w.kind === 'heal' ? 'heal' : 'dmg'}${dps}</span><span title="speed">👟 ${(+def.speed || 0).toFixed(1)}</span></div>
      <div class="ui-weap">${weaponLine(def)}</div>
      <div class="ui-desc">${def.desc || ''}</div></div>`;
  }

  updateSetup(p, d) {
    const s = this.sp[p];
    this.setText(s.pid, `P${p + 1} ${d.pad ? '🎮' : '⌨'}`);
    this.setText(s.gv, `${fmt(d.used)} <small>/ ${fmt(d.budget)}</small>`);
    this.setText(s.cnt, `${d.count}<small> / ${d.cap} units</small>`);
    this.setText(s.foe, `<span style="color:${tc(1 - p)}">${TEAM_NAMES[1 - p]}</span> ${d.enemy.hidden ? '<b class="hid">🙈 hidden</b>' : `<small>${d.enemy.count} units · ${fmt(d.enemy.value)}</small>`} ${d.otherReady ? '<b class="ok">✔ READY</b>' : '<small class="busy">building…</small>'}`);
    s.ready.style.display = d.ready ? '' : 'none';
    this.setText(s.status, d.status || '');
    s.reticle.className = 'reticle ' + (d.valid ? 'ok' : 'bad');
    s.reticle.style.display = d.ready || d.modal ? 'none' : '';
    this.setText(s.brush, d.ready ? '' : `brush ${btn('LT')} <b>${d.brush}</b> ${btn('RT')}`);
    const def = d.def;
    this.setText(s.info, this.infoHtml(def, p));
    this.setText(s.roster, d.roster.length ? d.roster.map((r) => `<span class="rc" title="${UNIT_BY_ID[r.id]?.name || r.id}"><img src="${this.portraits[r.id + ':' + p] || ''}" alt="">×${r.n}</span>`).join('') : '<span class="empty">No units yet</span>');
    if (s.faction !== d.faction) {
      s.faction = d.faction;
      s.unit = -1;
      s.budgetKey = '';
      this.setText(s.tabs, FACTIONS.map((f, i) => `<span class="tab ${i === d.faction ? 'on' : ''}" style="--fc:${f.color}">${f.name}</span>`).join(''));
      const list = unitsOfFaction(FACTIONS[d.faction].id);
      s.cards.innerHTML = list.map((u) => `<div class="card" data-id="${u.id}">
        <img src="${this.portraits[u.id + ':' + p] || ''}" alt=""><div class="cn">${u.name}</div><div class="cc"><span class="coin"></span>${u.cost}</div></div>`).join('');
    }
    if (s.unit !== d.unit) {
      s.unit = d.unit;
      [...s.cards.children].forEach((c, i) => {
        c.classList.toggle('sel', i === d.unit);
        if (i === d.unit) c.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      });
    }
    const left = d.budget - d.used;
    const key = `${left}`;
    if (s.budgetKey !== key) {
      s.budgetKey = key;
      [...s.cards.children].forEach((c) => {
        const u = UNITS.find((x) => x.id === c.dataset.id);
        c.classList.toggle('poor', !!u && u.cost > left);
      });
    }
    if (d.modal) {
      s.modal.style.display = '';
      this.setText(s.modal, `<div class="mbox"><h3>${d.modal.title}</h3>${d.modal.text ? `<p>${d.modal.text}</p>` : ''}${this.menuHtml(d.modal.items, d.modal.sel)}
        <div class="mhint">${btn('dpad')} choose &nbsp; ${btn('A')} select &nbsp; ${btn('B')} back</div></div>`);
    } else s.modal.style.display = 'none';
  }

  setCountdown(t, sub) {
    this.setText(this.countdown, t > 0 ? `<div>BATTLE IN</div><b>${Math.ceil(t)}</b>${sub ? `<em>${sub}</em>` : ''}` : '');
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
    this.bhints = [el('div', 'bhints v0'), el('div', 'bhints v1')];
    this.bhints.forEach((v) => L.appendChild(v));
    this.bdivider = el('div', 'divider');
    L.appendChild(this.bdivider);
  }

  updateBattle(d) {
    const [a, b] = d.counts;
    this.setText(this.counts, `<span class="cb" style="--tc:${tc(0)}">${a}</span>
      <span class="bar"><i style="width:${(a / Math.max(1, d.start[0])) * 50}%;background:${tc(0)}"></i><em style="width:${(b / Math.max(1, d.start[1])) * 50}%;background:${tc(1)}"></em></span>
      <span class="cb" style="--tc:${tc(1)}">${b}</span>`);
    this.setText(this.tscale, d.scaleText || '');
    this.layers.battle.classList.toggle('split', d.split);
    this.bdivider.style.display = d.split ? '' : 'none';
    for (let i = 0; i < 2; i++) {
      const v = d.views[i];
      this.viewLabels[i].style.display = v ? '' : 'none';
      this.reticles[i].style.display = v && v.reticle ? '' : 'none';
      if (v) {
        this.reticles[i].className = `reticle small v${i} ${v.reticle || ''}`;
        this.setText(this.viewLabels[i], v.label || '');
      }
    }
    for (let i = 0; i < 2; i++) {
      const v = d.views[i];
      this.bhints[i].style.display = d.hints && v ? '' : 'none';
      if (v) this.setText(this.bhints[i], v.hint || '');
    }
  }

  // ------------------------------------------------------------- result
  showResult(d) {
    const L = this.layers.result;
    const col = d.winner >= 0 ? tc(d.winner) : '#ddd';
    const title = d.winner >= 0 ? `${TEAM_NAMES[d.winner].toUpperCase()} VICTORY` : 'DRAW';
    L.innerHTML = `<div class="victory" style="--tc:${col}">${title}</div>
      <div class="rsub">${d.duration ? `Battle lasted ${ftime(d.duration)}` : ''}</div>
      <div class="rstats">${[0, 1].map((t) => `<div class="rs" style="--tc:${tc(t)}"><b>${TEAM_NAMES[t]} <small>P${t + 1}</small></b>
        <div>${d.stats[t].alive} / ${d.stats[t].total} survived</div><div>${fmt(d.stats[t].startValue - d.stats[t].value)} gold lost</div></div>`).join('')}</div>
      <div class="rmenu menu"></div>
      <div class="rhint">${btn('dpad')} choose &nbsp; ${btn('A')} select &nbsp;·&nbsp; the battlefield stays live: fly around with ${btn('LS')} ${btn('RS')}</div>`;
    this.rmenu = L.querySelector('.rmenu');
  }

  updateResultMenu(items, sel) { if (this.rmenu) this.setText(this.rmenu, this.menuHtml(items, sel)); }

  // ------------------------------------------------------------- replay
  buildReplay() {
    const L = this.layers.replay;
    L.innerHTML = `<div class="rlabel">● REPLAY</div><div class="rbar"><div class="rmarks"></div><div class="rfill"></div><div class="rhead"></div><div class="rtime"></div></div>
      <div class="rhints">${btn('LT')}${btn('RT')} scrub &nbsp; ${btn('A')} play/pause &nbsp; ${btn('dpad')} ←→ skip ↑↓ speed &nbsp; ${btn('X')} follow ${btn('LB')}${btn('RB')} next unit &nbsp; ${btn('Y')} final moments &nbsp; ${btn('B')} free cam / exit &nbsp; ${btn('Start')} menu</div>
      <div class="rend"></div>`;
    this.rfill = L.querySelector('.rfill');
    this.rhead = L.querySelector('.rhead');
    this.rtime = L.querySelector('.rtime');
    this.rmarks = L.querySelector('.rmarks');
    this.rend = L.querySelector('.rend');
    this.rlabel = L.querySelector('.rlabel');
  }

  setReplayMarkers(deaths, dur, overT) {
    const D = Math.max(0.01, dur);
    // cluster deaths that would overlap into one taller tick
    const ticks = deaths.map((d) => `<i style="left:${(d.t / D) * 100}%;--tc:${tc(d.team)}"></i>`).join('');
    const over = overT ? `<b style="left:${(overT / D) * 100}%" title="battle over">⚑</b>` : '';
    this.rmarks.innerHTML = ticks + over;
  }

  updateReplay(t, dur, speed, playing, label, ended) {
    const f = (t / Math.max(0.01, dur)) * 100;
    this.rfill.style.width = `${f}%`;
    this.rhead.style.left = `${f}%`;
    this.setText(this.rtime, `${playing ? '▶' : '❚❚'} ${ftime(t)} / ${ftime(dur)} &nbsp; ${speed}×`);
    this.setText(this.rlabel, label || '● REPLAY');
    this.setText(this.rend, ended ? `<div>Replay finished</div>${btn('A')} watch again &nbsp; ${btn('Y')} final moments &nbsp; ${btn('B')} back to results` : '');
    this.rend.style.display = ended ? '' : 'none';
  }

  // ------------------------------------------------------------- pause
  updatePause(title, items, sel, sub) {
    this.setText(this.layers.pause, `<div class="pbox"><h2>${title}</h2>${sub ? `<div class="psub">${sub}</div>` : ''}${this.menuHtml(items, sel)}
      <div class="mhint">${btn('dpad')} choose &nbsp; ${btn('A')} select &nbsp; ${btn('B')} ${btn('Start')} resume</div></div>`);
  }

  // side: undefined = centre, 0 / 1 = that player's half (setup split screen)
  toast(msg, time = 1.6, side) {
    if (!this.stacks) {
      this.stacks = ['c', '0', '1'].map((k) => { const e = el('div', 'tstack ts' + k); this.layers.toast.appendChild(e); return e; });
    }
    const half = (side === 0 || side === 1) && this.root.dataset.state === 'setup';
    const stack = half ? this.stacks[1 + side] : this.stacks[0];
    const t = el('div', 'toastmsg', msg);
    stack.appendChild(t);
    while (stack.children.length > 4) stack.firstChild.remove();
    setTimeout(() => t.classList.add('out'), time * 1000);
    setTimeout(() => t.remove(), time * 1000 + 600);
  }

  // ------------------------------------------------------------- help
  setHelp(on) {
    this.show('help', on);
    if (!on) return;
    this.layers.help.innerHTML = `<div class="hbox"><h2>Controls</h2>
    <table>
    <tr><th></th><th>Army setup <small>(both at once)</small></th><th>Battle</th><th>Replay</th></tr>
    <tr><td>${btn('LS')}</td><td>slide over the field</td><td>fly · follow: zoom · possess: walk</td><td>fly · follow: zoom</td></tr>
    <tr><td>${btn('RS')}</td><td>look</td><td>look · orbit · aim</td><td>look · orbit</td></tr>
    <tr><td>${btn('LB')} ${btn('RB')}</td><td>down / up</td><td>down / up · following: prev / next unit</td><td>same</td></tr>
    <tr><td>${btn('L3')}</td><td>fly fast (hold)</td><td>fly fast (hold)</td><td>fly fast</td></tr>
    <tr><td>${btn('A')}</td><td>place unit (hold to paint)</td><td>follow unit in crosshair · possessing: jump</td><td>play / pause</td></tr>
    <tr><td>${btn('B')}</td><td>remove unit (hold)</td><td>free camera / let go</td><td>free camera · exit</td></tr>
    <tr><td>${btn('X')}</td><td>undo (hold to repeat)</td><td>possess the unit in crosshair</td><td>follow unit</td></tr>
    <tr><td>${btn('Y')}</td><td>ready / not ready</td><td>slow motion</td><td>slow-mo final moments</td></tr>
    <tr><td>${btn('LT')} ${btn('RT')}</td><td>brush: single / line / block</td><td>${btn('LT')} slow smooth camera · ${btn('RT')} attack (possessing)</td><td>scrub back / forward</td></tr>
    <tr><td>${btn('dpad')}</td><td>←→ unit · ↑↓ faction</td><td>↑↓ time speed (down to freeze) · ←→ zoom</td><td>←→ skip · ↑↓ speed</td></tr>
    <tr><td>${btn('R3')}</td><td>reset camera</td><td>cycle tips / HUD off (photo)</td><td>HUD off</td></tr>
    <tr><td>${btn('View')}</td><td>clear army…</td><td>split / shared screen</td><td>split / shared screen</td></tr>
    <tr><td>${btn('Start')}</td><td>menu (ready, map, quit)</td><td>pause menu (cinematic camera…)</td><td>menu</td></tr>
    </table>
    <p>Shared screen: either pad drives the camera. Split screen: each player has their own camera.<br>
    Keyboard: P1 WASD / arrows / Q E / Space R F Y / Z C / 1-4 / Tab / Enter, mouse right-drag look, click place, wheel unit.
    P2 IJKL / numpad 8456 / U O / H N M P / numpad 7 9.</p><p class="mhint">${btn('B')} close</p></div>`;
  }
}
