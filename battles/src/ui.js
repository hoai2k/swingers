// DOM overlay: title menu, per-player setup panels, battle HUD, results, replay bar.
import { FACTIONS, UNITS, UNIT_BY_ID, unitsOfFaction } from './units.js';
import { TEAM_COLORS, TEAM_NAMES } from './visual.js';
import { padLabel } from './input.js';
import { hasAsset } from './assets.js';

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
// pale faction colours need dark tab text
function light(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 190;
}

export function weaponLine(def) {
  const w = def.weapon || {};
  const k = w.kind;
  if (w.line) return w.line; // packs describe their own weapons
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
  if (k !== 'melee') return w.proj ? `Ranged · range ${Math.round(w.range || 0)} m` : 'Special';
  bits.push(`reach ${(+w.reach || 0).toFixed(1)} m`);
  return bits.join(' · ');
}

export class UI {
  constructor(root) {
    this.root = root;
    this.layers = {};
    for (const k of ['title', 'levels', 'setup', 'battle', 'result', 'replay', 'pause', 'toast', 'help']) {
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
      ? `<span class="ml">${it.label}</span><span class="mv">${i === sel ? '◀ ' : ''}${it.value}${i === sel ? ' ▶' : ''}</span>${it.preview && i === sel ? `<img class="mprev" src="${it.preview}" alt="">` : ''}`
      : `<span class="ml big">${it.label}${it.note ? `<small class="mnote">${it.note}</small>` : ''}</span>`}</div>`).join('');
  }

  // ------------------------------------------------------------- title
  buildTitle() {
    const L = this.layers.title;
    L.innerHTML = '';
    const logo = el('div', 'logo');
    const words = ['WOBBLY', 'BATTLES'];
    logo.innerHTML = words.map((w, i) => `<span class="lw lw${i}">${w.split('').map((c, j) => `<i style="--d:${(i * 7 + j) * 0.06}s">${c}</i>`).join('')}</span>`).join('');
    L.appendChild(logo);
    // the generated logo (see image-requests.md) replaces the text logo once delivered
    if (hasAsset('assets/ui/logo.png')) {
      logo.innerHTML = '<img class="logoimg" src="assets/ui/logo.png" alt="Wobbly Battles">';
      logo.classList.add('hasimg');
    }
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

  // ------------------------------------------------------------- campaign level select
  buildLevels() {
    const L = this.layers.levels;
    L.innerHTML = `<div class="lvhead">CAMPAIGN <span class="lvtotal"></span></div>
      <div class="lvworlds"></div><div class="lvdetail"></div><div class="lvplayers"></div>
      <div class="menuhint lvhint">${btn('dpad')}/${btn('LS')} ←→ level ↑↓ world &nbsp; ${btn('A')} play &nbsp; ${btn('X')} 1 player / 2-player co-op &nbsp; ${btn('B')} back</div>`;
    this.lv = {
      total: L.querySelector('.lvtotal'), worlds: L.querySelector('.lvworlds'),
      detail: L.querySelector('.lvdetail'), players: L.querySelector('.lvplayers'),
    };
  }

  updateLevels(d) {
    const v = this.lv;
    const stars = (n) => [1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}">★</i>`).join('');
    this.setText(v.total, `★ ${d.total} / ${d.max}`);
    this.setText(v.worlds, d.worlds.map((w, wi) => `<div class="lvworld ${w.unlocked ? '' : 'locked'}" style="--wc:${w.color}">
      <div class="lvwname"><span>${w.unlocked ? '' : '🔒 '}${w.name}</span><small>${w.bonus ? 'bonus · ' : ''}★ ${w.levels.reduce((s, l) => s + l.stars, 0)} / ${w.levels.length * 3}</small></div>
      ${w.levels.map((l, li) => `<div class="lvtile ${l.sel ? 'sel' : ''} ${l.unlocked ? '' : 'locked'}"><b>${wi + 1}-${li + 1}</b>
        <span class="lvn">${l.unlocked ? l.name : '🔒'}</span><span class="lvs">${stars(l.stars)}</span></div>`).join('')}</div>`).join(''));
    // keep the selected world's row in view (the list scrolls when it doesn't fit)
    const row = v.worlds.querySelector('.lvtile.sel')?.parentElement;
    if (row && row !== this.lvRow) {
      this.lvRow = row;
      const pad = 8, top = row.offsetTop - pad, bot = row.offsetTop + row.offsetHeight + pad;
      const box = v.worlds;
      if (top < box.scrollTop) box.scrollTop = top;
      else if (bot > box.scrollTop + box.clientHeight) box.scrollTop = bot - box.clientHeight;
    }
    const L = d.level;
    this.setText(v.detail, `<div class="lvd-top" style="--wc:${L.color}"><span class="lvd-name">${L.name}</span><span class="lvd-stars">${stars(L.stars)}</span></div>
      <div class="lvd-tip">${L.unlocked ? L.tip : '🔒 Locked — beat the level before it first.'}</div>
      ${L.mapImg ? `<img class="lvd-map" src="${L.mapImg}" alt="">` : ''}<div class="lvd-row"><span>🗺 ${L.map}</span><span><span class="coin"></span> budget <b>${fmt(L.budget)}</b></span><span>👥 up to <b>${L.cap}</b> units</span>
        ${L.best !== undefined ? `<span>best: <b>${fmt(L.best)}</b> gold</span>` : ''}</div>
      <div class="lvd-row lvd-enemy"><span style="color:${tc(1)}"><b>Enemy</b></span>${L.enemy.map((r) => `<span class="rc"><img src="${this.portraits[r.id + ':1'] || ''}" alt="">×${r.n}</span>`).join('')}
        <small>${L.enemyCount} units · ${fmt(L.enemyValue)} gold</small></div>
      <div class="lvd-row"><small>★★★ ≤ ${fmt(L.starGold[0])} gold · ★★ ≤ ${fmt(L.starGold[1])} gold · ★ any win &nbsp;·&nbsp; units: ${L.factions.join(', ')}</small></div>`);
    this.setText(v.players, `Players: <span class="${d.coop ? '' : 'on'}">👤 1 player</span><span class="${d.coop ? 'on' : ''}">👥 2-player co-op <small>(both build the Blue army)</small></span>`);
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
      half.appendChild(hints);
      const ready = el('div', 'readybadge', 'READY!');
      half.appendChild(ready);
      const modal = el('div', 'hmodal');
      half.appendChild(modal);
      L.appendChild(half);
      this.sp.push({ half, top, hints, tname: top.querySelector('.team-name'), pid: top.querySelector('.pid'), gv: top.querySelector('.gv'), cnt: top.querySelector('.cnt'), foe: top.querySelector('.foe'), info, roster, reticle, status, brush, tabs, cards, ready, modal, faction: -1, unit: -1, budgetKey: '' });
    }
    this.countdown = el('div', 'countdown');
    L.appendChild(this.countdown);
    this.timer = el('div', 'stimer');
    L.appendChild(this.timer);
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

  // solo: one full-width setup view (sandbox, 1-player campaign)
  setSetupLayout(solo) {
    this.solo = solo;
    this.layers.setup.classList.toggle('solo', solo);
    this.sp[0].team = this.sp[1].team = -1;
  }

  setTimer(t) {
    this.timer.style.display = t > 0 ? '' : 'none';
    if (t > 0) {
      this.setText(this.timer, `⏱ ${ftime(Math.ceil(t))}`);
      this.timer.classList.toggle('low', t <= 10);
    }
  }

  rosterHtml(list, team) {
    return list.map((r) => `<span class="rc" title="${UNIT_BY_ID[r.id]?.name || r.id}"><img src="${this.portraits[r.id + ':' + team] || ''}" alt="">×${r.n}<small>${fmt(r.gold)}</small></span>`).join('');
  }

  updateSetup(p, d) {
    const s = this.sp[p];
    const t = d.team;
    if (s.team !== t || s.title !== d.title) {
      // the army this player builds changed (sandbox side switch): recolour the half
      s.team = t;
      s.title = d.title;
      s.half.style.setProperty('--tc', tc(t));
      s.tname.innerHTML = `${d.title ? `<span class="lvname">${d.title}</span> ` : ''}${TEAM_NAMES[t].toUpperCase()} <small class="pid"></small>`;
      s.pid = s.tname.querySelector('.pid');
      s.pid._t = undefined;
      s.faction = -1;
      s.roster._t = undefined;
    }
    this.setText(s.pid, `P${p + 1} ${d.pad ? '🎮' : '⌨'}`);
    this.setText(s.gv, `${fmt(d.used)} <small>/ ${fmt(d.budget)}</small>`);
    s.gv.classList.toggle('over', d.used > d.budget);
    this.setText(s.cnt, `${d.count}<small> / ${fmt(d.cap)} units</small>`);
    const e = d.enemy;
    this.setText(s.foe, `<span style="color:${tc(1 - t)}">${e.name}</span> ${e.hidden ? '<b class="hid">🙈 hidden</b>' : `<small>${e.count} units · ${fmt(e.value)}</small>`} ${e.state || ''}`);
    this.setText(s.hints, d.hints.map((h) => `<div>${h}</div>`).join(''));
    s.ready.style.display = d.ready ? '' : 'none';
    this.setText(s.status, d.status || '');
    s.reticle.className = 'reticle ' + (d.valid ? 'ok' : 'bad');
    s.reticle.style.display = d.ready || d.modal ? 'none' : '';
    this.setText(s.brush, d.ready ? '' : `brush ${btn('LT')} <b>${d.brush}</b> ${btn('RT')}`);
    const def = d.def;
    this.setText(s.info, this.infoHtml(def, t));
    // overview: my army by unit type (count and gold); building alone, the other army too
    let ro = d.roster.length ? this.rosterHtml(d.roster, t) : '<span class="empty">No units yet</span>';
    if (e.roster) ro = `<div class="rrow">${ro}</div><div class="rrow other" style="--oc:${tc(1 - t)}"><b>${TEAM_NAMES[1 - t]}</b>${e.roster.length ? this.rosterHtml(e.roster, 1 - t) : '<span class="empty">empty</span>'}</div>`;
    this.setText(s.roster, ro);
    const facs = d.factions || FACTIONS;
    const fkey = facs.map((f) => f.id).join() + ':' + d.faction;
    if (s.faction !== fkey) {
      s.faction = fkey;
      s.unit = -1;
      s.budgetKey = '';
      this.setText(s.tabs, facs.map((f, i) => `<span class="tab ${i === d.faction ? 'on' : ''}${light(f.color) ? ' light' : ''}" style="--fc:${f.color}">${hasAsset(`assets/ui/faction-${f.id}.png`) ? `<img class="ficon" src="assets/ui/faction-${f.id}.png" alt="">` : ''}${f.name}</span>`).join(''));
      const on = s.tabs.children[d.faction];
      if (on) s.tabs.scrollLeft = on.offsetLeft - s.tabs.offsetLeft - (s.tabs.clientWidth - on.offsetWidth) / 2;
      const list = unitsOfFaction(facs[d.faction].id);
      s.cards.innerHTML = list.map((u) => `<div class="card" data-id="${u.id}">
        <img src="${this.portraits[u.id + ':' + t] || ''}" alt=""><div class="cn">${u.name}</div><div class="cc"><span class="coin"></span>${u.cost}</div></div>`).join('');
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
    this.banner = el('div', 'bbanner');
    L.appendChild(this.banner);
    this.cards = [el('div', 'ucard v0'), el('div', 'ucard v1')];
    this.cards.forEach((v) => L.appendChild(v));
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
    this.setText(this.banner, d.banner || '');
    this.banner.style.display = d.banner ? '' : 'none';
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
      this.cards[i].style.display = v && v.card ? '' : 'none';
      if (v && v.card) this.setText(this.cards[i], this.unitCardHtml(v.card));
    }
    for (let i = 0; i < 2; i++) {
      const v = d.views[i];
      this.bhints[i].style.display = d.hints && v ? '' : 'none';
      if (v) this.setText(this.bhints[i], v.hint || '');
    }
  }

  // stats of the followed / possessed unit (like TABS's unit info)
  unitCardHtml(c) {
    const def = UNIT_BY_ID[c.id];
    const f = Math.max(0, Math.min(1, c.hp / Math.max(1, c.maxHp)));
    const stats = [`<span class="coin"></span>${fmt(c.cost)}`];
    if (c.kills !== undefined) stats.push(`💀 ${c.kills} kill${c.kills === 1 ? '' : 's'}`);
    if (c.dmg !== undefined) stats.push(`⚔ ${fmt(c.dmg)} dmg`);
    if (c.buff) stats.push('🎵 inspired');
    return `<img src="${this.portraits[c.id + ':' + c.team] || ''}" alt="">
      <div class="uc-body"><div class="uc-name" style="color:${tc(c.team)}">${c.name}${c.alive ? '' : ' <em>down</em>'}</div>
      <div class="uc-hp"><span class="hp"><i style="width:${f * 100}%"></i></span> ${c.alive ? `${fmt(c.hp)} / ${fmt(c.maxHp)}` : ''}</div>
      <div class="uc-stats">${stats.join(' &nbsp;')}</div>
      ${def ? `<div class="uc-weap">${weaponLine(def)}</div>` : ''}</div>`;
  }

  // ------------------------------------------------------------- result
  showResult(d) {
    const L = this.layers.result;
    const col = d.winner >= 0 ? tc(d.winner) : '#ddd';
    let title = d.winner >= 0 ? `${TEAM_NAMES[d.winner].toUpperCase()} VICTORY` : 'DRAW';
    const lv = d.level, m = d.match;
    if (lv) title = lv.won ? 'VICTORY!' : d.winner < 0 ? 'DRAW' : 'DEFEAT';
    if (m && m.winner >= 0) title = `${TEAM_NAMES[m.winner].toUpperCase()} WINS THE MATCH!`;
    let extra = '';
    if (lv) {
      const st = [1, 2, 3].map((k) => `<i class="${k <= lv.stars ? 'on' : ''}">★</i>`).join('');
      extra = `<div class="rlevel"><div class="rstars">${st}</div>
        <div>${lv.name} · spent <b>${fmt(lv.spent)}</b> / ${fmt(lv.budget)} gold${lv.record ? ' · <b class="ok">new best!</b>' : ''}</div>
        <small>★★★ ≤ ${fmt(lv.starGold[0])} gold · ★★ ≤ ${fmt(lv.starGold[1])} gold${lv.won ? '' : ' · win to earn stars'}</small></div>`;
    }
    if (m) {
      extra = `<div class="rmatch">Round ${m.round} · <b style="color:${tc(0)}">${TEAM_NAMES[0]} ${m.wins[0]}</b> – <b style="color:${tc(1)}">${m.wins[1]} ${TEAM_NAMES[1]}</b> · best of ${m.bestOf}
        ${m.bonus >= 0 ? `<br><small>${TEAM_NAMES[m.bonus]} gets bonus gold next round</small>` : ''}</div>`;
    }
    const names = d.names || [`${TEAM_NAMES[0]} <small>P1</small>`, `${TEAM_NAMES[1]} <small>P2</small>`];
    if (d.coop) names[0] = `${TEAM_NAMES[0]} <small>P1 + P2</small>`;
    const ban = d.winner >= 0 && hasAsset(`assets/ui/victory-${d.winner ? 'red' : 'blue'}.png`) && !(lv && !lv.won)
      ? `assets/ui/victory-${d.winner ? 'red' : 'blue'}.png` : '';
    L.innerHTML = `<div class="victory ${ban ? 'banner' : ''}" style="--tc:${col}${ban ? `;--ban:url(${ban});--fit:${Math.min(1, 13 / title.length).toFixed(2)}` : ''}"><span>${title}</span></div>
      <div class="rsub">${d.duration ? `Battle lasted ${ftime(d.duration)}` : ''}</div>${extra}
      <div class="rstats">${[0, 1].map((t) => `<div class="rs" style="--tc:${tc(t)}"><b>${names[t]}</b>
        <div>${d.stats[t].alive} / ${d.stats[t].total} survived</div><div>${fmt(d.stats[t].startValue - d.stats[t].value)} gold lost</div></div>`).join('')}</div>
      <div class="rmenu menu"></div>
      <div class="rhint">${btn('dpad')} choose &nbsp; ${btn('A')} select &nbsp;·&nbsp; the battlefield stays live: fly with ${btn('LS')} ${btn('RS')}, ${btn('B')} cinematic camera</div>`;
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
    const over = overT ? `<b style="left:${(overT / D) * 100}%" title="battle over"></b>` : '';
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
    const half = (side === 0 || side === 1) && this.root.dataset.state === 'setup' && !this.solo;
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
    <tr><td>${btn('A')}</td><td>place unit (hold to paint)</td><td>follow unit in crosshair · controlling: jump</td><td>play / pause</td></tr>
    <tr><td>${btn('B')}</td><td>remove unit (hold)</td><td>free cam: cinematic camera · else back to free cam / let go</td><td>free camera · exit</td></tr>
    <tr><td>${btn('X')}</td><td>undo (hold to repeat)</td><td>take control of the unit in crosshair (or the followed one)</td><td>follow unit</td></tr>
    <tr><td>${btn('Y')}</td><td>ready / not ready (alone: start battle)</td><td>slow motion</td><td>slow-mo final moments</td></tr>
    <tr><td>${btn('LT')} ${btn('RT')}</td><td>brush: single / line / block</td><td>${btn('LT')} smooth camera · controlling: ${btn('RT')} attack, ${btn('LT')} block (ranged: aim)</td><td>scrub back / forward</td></tr>
    <tr><td>${btn('dpad')}</td><td>←→ unit · ↑↓ faction</td><td>↑↓ time speed (down to freeze) · ←→ zoom</td><td>←→ skip · ↑↓ speed</td></tr>
    <tr><td>${btn('R3')}</td><td>reset camera</td><td>cycle tips / HUD off (photo)</td><td>HUD off</td></tr>
    <tr><td>${btn('View')}</td><td>hold: clear army · building alone: tap to switch side</td><td>split / shared screen</td><td>split / shared screen</td></tr>
    <tr><td>${btn('Start')}</td><td>menu (ready, random army, map, quit)</td><td>pause menu (camera, screen, HUD, time…)</td><td>menu</td></tr>
    </table>
    <p>Shared screen: either pad drives the camera. Split screen: each player has their own camera.<br>
    Keyboard: P1 WASD / arrows / Q E / Space R F Y / Z C / 1-4 / Tab / Enter, mouse right-drag look, click place, wheel unit.
    P2 IJKL / numpad 8456 / U O / H N M P / numpad 7 9.</p><p class="mhint">${btn('B')} close</p></div>`;
  }
}
