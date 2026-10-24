// HUD and menus: title screen, join flow with a character customiser, per-
// player pause menus with settings, the controls overlay, contextual button
// prompts, name tags and toasts. Everything is driven by controller or
// keyboard (and the mouse where it helps). Menus capture their device's
// input (Input.capture) so the game sees nothing while a menu is open.
import * as THREE from 'three';
import { HATS, PLAYER_CSS, MAX_PLAYERS, PLAYER_COLORS } from './config.js';
import { settings, saveSettings, devicePrefs } from './settings.js';
import { glyph, formatHint, promptRow, deviceKind } from './glyphs.js';
import { FACES, PANTS, HAT_NAMES, COLOR_NAMES, setFace, setPants, setHat, saveLook, restoreLook, randomLook, syncFace } from './cosmetics.js';
import { buildTitleCrowd } from './title.js';

const DEV_NAME = (id) => id === 'kb1' ? 'Keyboard' : id === 'kb2' ? 'Keyboard 2' : id.startsWith('gp') ? 'Controller ' + (+id.slice(2) + 1) : id;
const textCol = (c) => (c === 0xffffff || c === 0xffc233 || c === 0x3fe0d0) ? '#234' : '#fff';
const accent = (c) => PLAYER_CSS(c === 0xffffff ? 0x2a62c9 : c);

// ---------------------------------------------------------------------------
// Navigation: one call per frame per device turns raw input into menu events.
// ---------------------------------------------------------------------------
class Nav {
  constructor(ui) { this.ui = ui; this.rep = new Map(); }
  read(id) {
    const inp = this.ui.game.input, d = inp.get(id);
    const n = { up: 0, down: 0, left: 0, right: 0, ok: 0, back: 0, x: 0, y: 0, lb: 0, rb: 0, start: 0 };
    if (!d) return n;
    const pr = d.rawPressed || d.pressed || {}, st = d.raw || d.state || {};
    if (id === 'kb1') {
      const t = (c) => inp.tapped(c);
      const arrows = !this.ui.game.players.some((p) => p.deviceId === 'kb2');
      n.up = t('KeyW') || (arrows && t('ArrowUp'));
      n.down = t('KeyS') || (arrows && t('ArrowDown'));
      n.left = t('KeyA') || (arrows && t('ArrowLeft'));
      n.right = t('KeyD') || (arrows && t('ArrowRight'));
      n.ok = t('Space') || t('Enter');
      n.back = t('Escape') || t('Backspace');
      n.start = t('Escape');
      n.x = t('KeyF') || t('KeyX'); n.y = t('KeyE') || t('F1');
      n.lb = t('KeyQ'); n.rb = t('Tab');
      return n;
    }
    n.up = pr.dUp; n.down = pr.dDown; n.left = pr.dLeft; n.right = pr.dRight;
    n.ok = pr.jump; n.back = pr.ragdoll || pr.back; n.start = pr.start;
    n.x = pr.punch; n.y = pr.interact; n.lb = pr.sprint; n.rb = pr.rb;
    // stick with auto-repeat
    const sx = st.moveX || 0, sy = st.moveY || 0, now = performance.now();
    let r = this.rep.get(id);
    if (!r) { r = { dir: '', t: 0, n: 0 }; this.rep.set(id, r); }
    let dir = '';
    if (Math.max(Math.abs(sx), Math.abs(sy)) > 0.55) dir = Math.abs(sy) >= Math.abs(sx) ? (sy > 0 ? 'up' : 'down') : (sx > 0 ? 'right' : 'left');
    if (dir && (dir !== r.dir || now > r.t)) {
      n[dir] = 1;
      r.t = now + (dir !== r.dir ? 380 : 130);
    }
    r.dir = dir;
    return n;
  }
}

// ---------------------------------------------------------------------------
// A vertical list of items, used by the pause menu pages.
// ---------------------------------------------------------------------------
function itemHTML(it, i, sel) {
  let val = '';
  if (it.slider != null) {
    const k = Math.round(it.slider * 10);
    val = `<span class="arrows">◀</span><span class="slider">${Array.from({ length: 10 }, (_, j) => `<i class="${j < k ? 'on' : ''}"></i>`).join('')}</span><span class="arrows">▶</span>`;
  } else if (it.value != null) val = it.adj ? `<span class="arrows">◀</span><b>${it.value}</b><span class="arrows">▶</span>` : `<b>${it.value}</b>`;
  else if (it.sub) val = '<span class="chev">›</span>';
  return `<div class="item ${i === sel ? 'sel' : ''} ${it.danger ? 'danger' : ''}" data-i="${i}"><span>${it.label}</span><span class="val">${val}</span></div>`;
}

// ---------------------------------------------------------------------------
// Per-player panels (customiser / pause menu) living in that player's view.
// ---------------------------------------------------------------------------
class Panel {
  constructor(ui, player, kind) {
    this.ui = ui; this.p = player; this.kind = kind; this.sel = 0;
    this.el = document.createElement('div');
    this.el.className = 'ppanel ' + kind;
    ui.hud.appendChild(this.el);
    this.el.addEventListener('pointermove', (e) => {
      const it = e.target.closest?.('[data-i]');
      if (it && +it.dataset.i !== this.sel) { this.sel = +it.dataset.i; this.draw(); }
    });
    this.el.addEventListener('click', (e) => {
      const it = e.target.closest?.('[data-i]');
      if (it) {
        this.sel = +it.dataset.i;
        const a = e.target.closest?.('.arrows');
        this.activate(a ? (a.previousElementSibling ? 1 : -1) : 0);
      }
      const pb = e.target.closest?.('[data-act]');
      if (pb) this.button(pb.dataset.act);
    });
    this.el.addEventListener('wheel', (e) => { this.adjust(e.deltaY > 0 ? -1 : 1); e.preventDefault(); }, { passive: false });
  }
  get kindName() { return deviceKind(this.p.deviceId); }
  remove() { this.el.remove(); }
  place(rect) {
    const [x, y, w, h] = rect;
    const s = this.kind === 'custom' ? Math.max(0.4, Math.min(1, w * 0.42 / 400, h / 560)) : Math.max(0.42, Math.min(1, w / 620, h / 560));
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    this.el.style.setProperty('--s', s.toFixed(3));
  }
  adjust() {}
  activate() {}
  button() {}
}

class Customiser extends Panel {
  constructor(ui, player, first) {
    super(ui, player, 'custom');
    this.first = first;
    this.t0 = performance.now();
    this.rows = ['Colour', 'Hat', 'Face', 'Trousers', 'Done'];
    this.draw();
  }
  value(r) {
    const p = this.p;
    switch (r) {
      case 'Colour': return COLOR_NAMES[p.colorIndex] || String(p.colorIndex + 1);
      case 'Hat': return HAT_NAMES[HATS[p.hat]] || HATS[p.hat];
      case 'Face': return FACES[p.face || 0];
      case 'Trousers': return PANTS[p.pantsIndex || 0].name;
    }
    return '';
  }
  adjust(d) {
    const p = this.p, r = this.rows[this.sel];
    if (r === 'Colour') p.setColor(p.colorIndex + d);
    else if (r === 'Hat') setHat(p, p.hat + d);
    else if (r === 'Face') setFace(p, (p.face || 0) + d);
    else if (r === 'Trousers') setPants(p, (p.pantsIndex || 0) + d);
    else return;
    this.ui.sfx('uiChange', { dir: d });
    this.draw();
  }
  activate(d) {
    if (this.rows[this.sel] === 'Done') this.done();
    else if (d) this.adjust(d);
    else this.adjust(1);
  }
  button(a) { if (a === 'random') this.random(); if (a === 'done') this.done(); }
  random() { randomLook(this.p); this.ui.sfx('pop'); this.draw(); }
  done() {
    saveLook(this.p);
    this.ui.sfx('uiSelect');
    this.ui.closePanel(this.p);
    if (this.first) this.ui.toast(`Player ${this.p.index + 1} is ready!`, this.p.color);
  }
  input(n) {
    if (performance.now() - this.t0 < 300) return; // ignore the press that opened it
    const R = this.rows.length;
    if (n.up) { this.sel = (this.sel + R - 1) % R; this.ui.sfx('uiMove'); this.draw(); }
    if (n.down) { this.sel = (this.sel + 1) % R; this.ui.sfx('uiMove'); this.draw(); }
    if (n.left) this.adjust(-1);
    if (n.right) this.adjust(1);
    if (n.x) this.random();
    if (n.ok) {
      if (this.rows[this.sel] === 'Done') this.done();
      else { this.sel++; this.ui.sfx('uiMove'); this.draw(); }
    } else if (n.back || n.start) this.done();
  }
  draw() {
    const p = this.p, k = this.kindName;
    const rows = this.rows.map((r, i) => {
      if (r === 'Done') return `<div class="item done ${i === this.sel ? 'sel' : ''}" data-i="${i}"><span>${glyph('A', k)} Let's go!</span></div>`;
      let extra = '';
      if (r === 'Colour') extra = `<div class="swatches">${PLAYER_COLORS.map((c, j) => `<i class="${j === p.colorIndex ? 'on' : ''}" style="background:${PLAYER_CSS(c)}"></i>`).join('')}</div>`;
      return `<div class="item ${i === this.sel ? 'sel' : ''}" data-i="${i}"><span>${r}</span><span class="val"><span class="arrows">◀</span><b>${this.value(r)}</b><span class="arrows">▶</span></span>${extra}</div>`;
    }).join('');
    this.el.innerHTML = `<div class="card" style="--acc:${accent(p.color)}">
      <div class="phead" style="background:${accent(p.color)};color:${textCol(p.color === 0xffffff ? 0x2a62c9 : p.color)}">Player ${p.index + 1}<small>${DEV_NAME(p.deviceId)}</small></div>
      <h2>Make your Wobbler</h2>${rows}
      <div class="foot">${promptRow([['LS', 'Choose'], ['X', 'Surprise me'], ['A', 'Done']], k)}</div>
      <div class="mousebtns"><span data-act="random">Surprise me</span><span data-act="done">Done</span></div></div>`;
  }
}

class PauseMenu extends Panel {
  constructor(ui, player) {
    super(ui, player, 'menu');
    this.page = 'main';
    this.stack = [];
    this.draw();
  }
  items() {
    const p = this.p, ui = this.ui, g = ui.game, pf = devicePrefs(p.deviceId);
    if (this.page === 'settings') {
      return [
        { label: 'Music volume', slider: settings.music, adj: (d) => { settings.music = Math.max(0, Math.min(1, Math.round(settings.music * 10 + d) / 10)); g.audio.setVolumes?.(); saveSettings(); } },
        { label: 'Sound effects', slider: settings.sfx, adj: (d) => { settings.sfx = Math.max(0, Math.min(1, Math.round(settings.sfx * 10 + d) / 10)); g.audio.setVolumes?.(); saveSettings(); ui.sfx('pop'); } },
        { label: 'Shadows', value: g.shadows ? 'On' : 'Off', adj: () => { g.shadows = !g.shadows; settings.shadows = g.shadows; saveSettings(); } },
        { label: 'Resolution', value: Math.round(g.resScale * 100) + '%', adj: (d) => { const v = [0.5, 0.75, 1], i = Math.max(0, Math.min(2, v.indexOf(nearest(v, g.resScale)) + d)); g.setResScale(v[i]); settings.res = v[i]; saveSettings(); } },
        { label: 'Invert camera Y', value: pf.invertY ? 'On' : 'Off', adj: () => { pf.invertY = !pf.invertY; saveSettings(); } },
        { label: 'Camera sensitivity', slider: (pf.sens - 0.25) / 2.25, adj: (d) => { pf.sens = Math.max(0.25, Math.min(2.5, pf.sens + d * 0.25)); saveSettings(); } },
        { label: 'Back', act: () => this.back() },
      ];
    }
    return [
      { label: 'Resume', act: () => ui.closePanel(p) },
      { label: 'Customise', act: () => ui.openCustomiser(p, false) },
      { label: 'Respawn', act: () => { p.respawn(); ui.closePanel(p); } },
      { label: 'Settings', sub: true, act: () => this.go('settings') },
      { label: 'Controls', sub: true, act: () => ui.openHelp(p.deviceId) },
      { label: 'Reset vehicles', act: () => { for (const v of g.vehicles) if (!v.seats.some((s) => s.occupant)) v.respawn(); ui.toast('Vehicles are back home'); ui.closePanel(p); } },
      { label: 'Leave game', danger: true, act: () => ui.leave(p) },
    ];
  }
  go(page) { this.stack.push([this.page, this.sel]); this.page = page; this.sel = 0; this.ui.sfx('uiSelect'); this.draw(); }
  back() {
    if (!this.stack.length) { this.ui.sfx('uiBack'); this.ui.closePanel(this.p); return; }
    [this.page, this.sel] = this.stack.pop(); this.ui.sfx('uiBack'); this.draw();
  }
  adjust(d) {
    const it = this.items()[this.sel];
    if (!it?.adj) return;
    it.adj(d); this.ui.sfx('uiChange', { dir: d }); this.draw();
  }
  activate(d) {
    const it = this.items()[this.sel];
    if (!it) return;
    if (d && it.adj) { this.adjust(d); return; }
    if (it.act) { this.ui.sfx('uiSelect'); it.act(); if (this.ui.panels.get(this.p) === this) this.draw(); }
    else if (it.adj) this.adjust(1);
  }
  input(n) {
    const N = this.items().length;
    if (n.up) { this.sel = (this.sel + N - 1) % N; this.ui.sfx('uiMove'); this.draw(); }
    if (n.down) { this.sel = (this.sel + 1) % N; this.ui.sfx('uiMove'); this.draw(); }
    if (n.left) this.adjust(-1);
    if (n.right) this.adjust(1);
    if (n.ok) this.activate(0);
    else if (n.start && this.p.deviceId !== 'kb1') { this.ui.sfx('uiBack'); this.ui.closePanel(this.p); }
    else if (n.back) this.back();
  }
  draw() {
    const p = this.p, k = this.kindName, it = this.items();
    this.el.innerHTML = `<div class="card" style="--acc:${accent(p.color)}">
      <div class="phead" style="background:${accent(p.color)};color:${textCol(p.color === 0xffffff ? 0x2a62c9 : p.color)}">Player ${p.index + 1}<small>${DEV_NAME(p.deviceId)}</small></div>
      <h2>${this.page === 'settings' ? 'Settings' : this.ui.game.paused ? 'Paused' : 'Menu'}</h2>
      ${it.map((x, i) => itemHTML(x, i, this.sel)).join('')}
      <div class="foot">${promptRow([['A', 'Select'], ['B', 'Back']], k)}${this.page === 'settings' ? promptRow([['DPAD', 'Change']], k) : ''}</div></div>`;
  }
}
const nearest = (arr, v) => arr.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

// ---------------------------------------------------------------------------
// The controls / help overlay.
// ---------------------------------------------------------------------------
const PAD_SVG = `<svg class="padsvg" viewBox="0 0 520 330">
  <path d="M130 70 Q260 40 390 70 Q470 85 495 200 Q515 300 455 305 Q415 308 380 245 Q360 215 330 215 L190 215 Q160 215 140 245 Q105 308 65 305 Q5 300 25 200 Q50 85 130 70 Z" fill="#f4f6fb" stroke="#c9d3e6" stroke-width="5"/>
  <rect x="95" y="40" width="80" height="22" rx="11" fill="#5d6680"/><rect x="345" y="40" width="80" height="22" rx="11" fill="#5d6680"/>
  <circle cx="150" cy="135" r="30" fill="#2f3446"/><circle cx="150" cy="135" r="20" fill="#454c63"/>
  <circle cx="320" cy="195" r="27" fill="#2f3446"/><circle cx="320" cy="195" r="18" fill="#454c63"/>
  <g fill="#3a4055"><rect x="185" y="178" width="18" height="52" rx="4"/><rect x="168" y="195" width="52" height="18" rx="4"/></g>
  <circle cx="390" cy="160" r="15" fill="#3cb043"/><circle cx="420" cy="132" r="15" fill="#e2393a"/><circle cx="360" cy="132" r="15" fill="#2f7fe0"/><circle cx="390" cy="104" r="15" fill="#f2c21b"/>
  <g fill="#fff" font-weight="900" font-size="15" text-anchor="middle" font-family="Trebuchet MS, sans-serif"><text x="390" y="165">A</text><text x="420" y="137">B</text><text x="360" y="137">X</text><text x="390" y="109">Y</text></g>
  <circle cx="232" cy="132" r="10" fill="#5d6680"/><circle cx="288" cy="132" r="10" fill="#5d6680"/><circle cx="260" cy="95" r="16" fill="#cfd6e4"/>
</svg>`;

function helpHTML(tab, kind) {
  const tabs = ['Controller', 'Keyboard', 'Keyboard 2', 'Tips'];
  const head = `<div class="tabs">${glyph('LB', kind)}${tabs.map((t, i) => `<span class="tab ${i === tab ? 'on' : ''}" data-tab="${i}">${t}</span>`).join('')}${glyph('RB', kind)}</div>`;
  let body = '';
  const row = (a, b) => `<div class="hrow"><span class="hk">${a}</span><span>${b}</span></div>`;
  const g = (b) => glyph(b, 'pad');
  if (tab === 0) {
    body = `<div class="padwrap">
      <div class="callouts left">
        ${row(g('LT'), 'Raise left arm &amp; grab')}${row(g('LB'), 'Sprint')}${row(g('LS'), 'Move (click: sprint)')}${row(g('DPAD'), 'Emotes: up wave, left cheer, right dance · down phone')}${row(g('RB'), 'Hold: emote wheel')}${row(g('BACK'), 'Map')}
      </div>${PAD_SVG}
      <div class="callouts right">
        ${row(g('RT'), 'Raise right arm &amp; grab')}${row(g('Y'), 'Get in / out, sit')}${row(g('X'), 'Punch')}${row(g('B'), 'Ragdoll (flop!)')}${row(g('A'), 'Jump · get up')}${row(g('RS'), 'Camera')}${row(g('START'), 'Menu')}
      </div></div>
      <div class="drive"><b>Driving</b> ${g('RT')} gas ${g('LT')} brake / reverse ${g('LS')} steer ${g('A')} handbrake ${g('X')} horn ${g('Y')} get out</div>`;
  } else if (tab === 1 || tab === 2) {
    const k = tab === 1 ? 'kb1' : 'kb2', G = (b) => glyph(b, k);
    body = `<div class="kbgrid">
      ${row(G('LS'), 'Move')}${row(G('RS'), 'Camera')}${row(G('A'), 'Jump · get up')}${row(G('B'), 'Ragdoll')}
      ${row(G('X'), 'Punch')}${row(G('Y'), 'Get in / out, sit')}${row(G('LT') + ' ' + G('RT'), 'Grab left / right' + (k === 'kb1' ? ' (or Q / C)' : ''))}
      ${row(G('LB'), 'Sprint')}${row(G('EMOTE'), 'Emote wheel (hold)')}${row(G('MAP'), 'Map')}${row(G('PHONE'), 'Phone: call a vehicle')}${k === 'kb1' ? row(G('WAVE') + ' ' + G('CHEER') + ' ' + G('DANCE'), 'Wave / cheer / dance') : ''}${row(G('START'), 'Menu')}
      ${row(G('GAS') + ' ' + G('BRAKE'), 'Drive: gas / brake')}${row(G('HORN'), 'Horn')}
      </div><p class="hnote">${k === 'kb1' ? 'Join with <span class="key">Enter</span> or <span class="key">Space</span>. Click the game to look around with the mouse.' : 'Join with <span class="key">NumEnter</span>. Play alongside Keyboard 1 and controllers.'}</p>`;
  } else {
    body = `<ul class="tips">
      <li>Hold ${g('LT')} / ${g('RT')} to raise an arm. Your hand grabs whatever it touches: props, friends, ledges, bars.</li>
      <li>Grab a ledge with both hands, then press ${g('A')} to pull yourself up. Look up to reach higher.</li>
      <li>Press ${g('B')} to go floppy. Great for rolling down hills.</li>
      <li>Walk up to a car, swing, ride or bench and press ${g('Y')}.</li>
      <li>Up to 8 players: more controllers or the second keyboard join with ${g('A')} any time.</li>
      <li>Every player has their own menu on ${g('START')}: customise your Wobbler, change settings or leave.</li>
    </ul>`;
  }
  return `<div class="hpanel">${head}<div class="hbody">${body}</div><div class="foot">${promptRow([['LB', 'Prev'], ['RB', 'Next'], ['B', 'Close']], kind)}</div><div class="hclose" data-act="close">×</div></div>`;
}

// ---------------------------------------------------------------------------
export class UI {
  constructor(game) {
    this.game = game;
    this.hud = document.getElementById('hud');
    this.title = document.getElementById('title');
    this.helpEl = document.getElementById('help');
    this.toastEl = document.getElementById('toasts');
    this.devEl = document.getElementById('devices');
    this.nav = new Nav(this);
    this.panels = new Map(); // player -> Panel
    this.help = null;        // { id, tab }
    this.pool = [];
    this.viewEls = [];
    this.knownPads = new Set();
    this.lastDevs = '';
    this.join = document.createElement('div');
    this.join.className = 'joinhint hidden';
    this.hud.appendChild(this.join);
    this.joinHTML = '';
    this.ready = false;
    buildTitleCrowd(document.getElementById('crowd'));
    // apply stored settings
    game.shadows = settings.shadows;
    if (settings.res !== 1) game.setResScale?.(settings.res);
    game.input.prefs = (id) => devicePrefs(id);
    game.canvas.addEventListener('click', () => {
      if (game.players.some((p) => p.deviceId === 'kb1' && !this.panels.has(p))) game.input.lockMouse();
    });
    this.helpEl.addEventListener('click', (e) => {
      const t = e.target.closest?.('[data-tab]');
      if (t && this.help) { this.help.tab = +t.dataset.tab; this.drawHelp(); }
      if (e.target.closest?.('[data-act="close"]')) this.closeHelp();
    });
    document.getElementById('press')?.addEventListener('click', () => this.tryJoin('kb1'));
    // loading bar mirrors the percentage main.js writes
    const pct = document.getElementById('loadpct'), bar = document.getElementById('loadbar');
    if (pct && bar) new MutationObserver(() => { bar.style.width = pct.textContent; }).observe(pct, { childList: true, characterData: true, subtree: true });
  }

  sfx(name, extra) { this.game.audio?.play(name, null, 1, extra || {}); }

  setReady() {
    this.ready = true;
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('press').classList.remove('hidden');
    this.title.classList.add('ready');
  }

  layout() {
    for (const e of this.viewEls) e.root.remove();
    this.viewEls = [];
    for (const p of this.game.players) {
      const root = document.createElement('div');
      const label = document.createElement('div'); label.className = 'vplabel';
      const hint = document.createElement('div'); hint.className = 'vphint hidden';
      const mouse = document.createElement('div'); mouse.className = 'vpmouse hidden';
      mouse.innerHTML = 'Click to look around with the mouse';
      const border = document.createElement('div'); border.className = 'vpborder';
      root.append(border, label, hint, mouse);
      this.hud.insertBefore(root, this.hud.firstChild);
      this.viewEls.push({ root, label, hint, mouse, border, player: p, hintHTML: null });
    }
    this.refreshTags();
  }

  refreshTags() {
    for (const v of this.viewEls) {
      const p = v.player;
      v.label.textContent = 'P' + (p.index + 1);
      v.label.style.background = PLAYER_CSS(p.color);
      v.label.style.color = textCol(p.color);
    }
  }

  tag(i) {
    let t = this.pool[i];
    if (!t) { t = document.createElement('div'); t.className = 'tag'; this.hud.appendChild(t); this.pool[i] = t; }
    return t;
  }

  toast(text, color) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = text;
    if (color != null) { t.style.background = PLAYER_CSS(color); t.style.color = textCol(color); }
    this.toastEl.appendChild(t);
    while (this.toastEl.children.length > 4) this.toastEl.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3200);
    this.sfx('toast');
  }

  hintFor(p, k) {
    const g = this.game;
    const G = (b) => glyph(b, k);
    if (p.seat) {
      if (p.seat.kind === 'driver' && p.seat.vehicle) {
        const def = p.seat.vehicle.def || {}, boat = def.boat;
        if (def.heli) return `${G('GAS')} Up ${G('BRAKE')} Down ${G('LS')} Fly ${G('Y')} Get out`;
        if (def.siren) return `${G('GAS')} Gas ${G('BRAKE')} Brake ${G('HORN')} Siren ${G('Y')} Get out`;
        return `${G('GAS')} ${boat ? 'Throttle' : 'Gas'} ${G('BRAKE')} ${boat ? 'Reverse' : 'Brake'} ${G('HORN')} Horn ${G('Y')} Get out`;
      }
      return formatHint(p.seat.hint || 'Y Get up', k).replace(/exit/g, 'Get off');
    }
    if (p.state === 'limp') return p.limpTimer > 0 ? '<span class="ouch">Ouch!</span>' : `${G('A')} Get up`;
    const s = g.nearestSeat(p);
    if (s) {
      const veh = s.vehicle;
      const what = s.kind === 'driver' ? (veh?.def?.heli ? 'Fly' : veh?.def?.boat ? 'Drive boat' : 'Drive') : (s.label === 'Sit' ? (veh ? 'Hop in' : 'Sit') : s.label);
      return `${G('Y')} ${what}`;
    }
    const holding = p.hands && (p.hands.L.joint || p.hands.R.joint);
    if (holding && !p.grounded) return `${G('A')} Climb up`;
    return '';
  }

  update(views) {
    const g = this.game, ps = g.players;
    for (const p of [...this.panels.keys()]) if (!ps.includes(p)) this.setPanel(p, null);
    // join pill
    const showJoin = this.ready && ps.length > 0 && ps.length < MAX_PLAYERS;
    this.join.classList.toggle('hidden', !showJoin);
    if (showJoin) {
      const h = `${glyph('A')} <span>Join</span> <small>or ${glyph('OK', 'kb1')} · ${ps.length}/${MAX_PLAYERS}</small>`;
      if (h !== this.joinHTML) { this.join.innerHTML = h; this.joinHTML = h; }
    }
    let ti = 0;
    const v3 = new THREE.Vector3(), hd = new THREE.Vector3();
    ps.forEach((p, i) => {
      const [x, y, w, h] = views[i];
      const ve = this.viewEls[i];
      syncFace(p);
      if (!ve) return;
      const k = deviceKind(p.deviceId);
      const panel = this.panels.get(p);
      if (panel) panel.place(views[i]);
      Object.assign(ve.label.style, { left: x + 'px', top: y + 'px' });
      Object.assign(ve.border.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', display: ps.length > 1 ? 'block' : 'none' });
      // contextual prompt
      const hint = panel ? '' : this.hintFor(p, k);
      if (hint !== ve.hintHTML) { ve.hint.innerHTML = hint; ve.hintHTML = hint; ve.hint.classList.toggle('hidden', !hint); }
      Object.assign(ve.hint.style, { left: x + w / 2 + 'px', top: y + h - 16 + 'px' });
      const needMouse = p.deviceId === 'kb1' && !panel && !this.help && document.pointerLockElement !== g.canvas;
      ve.mouse.classList.toggle('hidden', !needMouse);
      if (needMouse) Object.assign(ve.mouse.style, { left: x + w / 2 + 'px', top: y + 14 + 'px' });
      // customiser: swing the camera round to face the character
      if (panel?.kind === 'custom' && p.camera) {
        const c = p.camera;
        c.yaw = p.yaw + Math.PI + 0.35; c.pitch = 0.1;
        if ('dist' in c) c.dist = 3.0;
      }
      // tags for every other player visible in this view
      const cam = p.camera.cam;
      for (const q of ps) {
        if (q === p) continue;
        q.viewPos(hd, 'head');
        v3.set(hd.x, hd.y + 0.5, hd.z).project(cam);
        if (v3.z > 1 || v3.x < -1 || v3.x > 1 || v3.y < -1 || v3.y > 1) continue;
        const dist = cam.position.distanceTo(hd);
        if (dist > 80) continue;
        const t = this.tag(ti++);
        t.style.display = 'block';
        const label = 'P' + (q.index + 1);
        if (t.textContent !== label) t.textContent = label;
        t.style.background = PLAYER_CSS(q.color);
        t.style.color = textCol(q.color);
        t.style.left = x + (v3.x * 0.5 + 0.5) * w + 'px';
        t.style.top = y + (-v3.y * 0.5 + 0.5) * h + 'px';
        t.style.opacity = dist > 50 ? String(1 - (dist - 50) / 30) : '1';
      }
    });
    for (let i = ti; i < this.pool.length; i++) this.pool[i].style.display = 'none';
    this.emptySlots(views);
    this.game.emotes?.draw(views); // emote wheels
    this.watchDevices();
  }

  // Unused split-screen cells invite another player in.
  emptySlots(views) {
    this.slots = this.slots || [];
    const cells = [];
    if (views.length > 1 && this.game.players.length > 1) {
      const ys = [...new Set(views.map((v) => Math.round(v[1])))];
      const w = views[0][2], h = views[0][3];
      for (const y of ys) for (let c = 0; c < Math.round(innerWidth / w); c++) {
        const x = c * w;
        if (!views.some((v) => Math.abs(v[0] - x) < 2 && Math.abs(v[1] - y) < 2)) cells.push([x, y, w, h]);
      }
    }
    cells.forEach((r, i) => {
      let el = this.slots[i];
      if (!el) {
        el = document.createElement('div'); el.className = 'emptyslot';
        el.innerHTML = `<div class="ejoin">${glyph('A')} Press to join</div><div class="esub">${glyph('OK', 'kb1')} keyboard · ${glyph('START', 'kb2')} keyboard 2</div>`;
        this.hud.appendChild(el); this.slots[i] = el;
      }
      el.style.display = 'flex';
      Object.assign(el.style, { left: r[0] + 'px', top: r[1] + 'px', width: r[2] + 'px', height: r[3] + 'px' });
    });
    for (let i = cells.length; i < this.slots.length; i++) this.slots[i].style.display = 'none';
  }

  // Toasts when controllers come and go; the title lists connected devices.
  watchDevices() {
    const inp = this.game.input;
    const pads = [...inp.devices.keys()].filter((id) => id.startsWith('gp'));
    const now = new Set(pads);
    if (this.ready) {
      for (const id of now) if (!this.knownPads.has(id)) {
        if (this.game.players.length) this.toast(`${DEV_NAME(id)} connected · press ${glyph('A')} to join`);
      }
      for (const id of this.knownPads) if (!now.has(id)) {
        const p = this.game.players.find((q) => q.deviceId === id);
        this.toast(p ? `Player ${p.index + 1}: controller disconnected` : `${DEV_NAME(id)} disconnected`, p?.color);
      }
    }
    this.knownPads = now;
    const sig = pads.join(',') + '|' + this.game.players.map((p) => p.deviceId).join(',');
    if (sig !== this.lastDevs && this.devEl) {
      this.lastDevs = sig;
      const all = ['kb1', 'kb2', ...pads];
      this.devEl.innerHTML = all.map((id) => `<span class="chip ${id.startsWith('gp') ? 'pad' : 'kb'}"><i></i>${DEV_NAME(id)}</span>`).join('');
    }
  }

  // ---- input -----------------------------------------------------------------
  handleInput() {
    const g = this.game, inp = g.input;
    if (!this.ready) return;
    if (this.help) {
      const n = this.nav.read(this.help.id);
      const kb1Esc = this.help.id === 'kb1' && inp.tapped('Escape');
      if (n.lb || n.left) { this.help.tab = (this.help.tab + 3) % 4; this.sfx('uiMove'); this.drawHelp(); }
      if (n.rb || n.right) { this.help.tab = (this.help.tab + 1) % 4; this.sfx('uiMove'); this.drawHelp(); }
      if (n.back || n.ok || n.start || kb1Esc || (this.help.id === 'kb1' && inp.tapped('F1'))) { this.closeHelp(); }
      return;
    }
    for (const p of [...g.players]) {
      const panel = this.panels.get(p);
      if (panel) { panel.input(this.nav.read(p.deviceId)); continue; }
      const d = inp.get(p.deviceId);
      if (!d) continue;
      const startPressed = p.deviceId === 'kb1' ? (d.pressed.start && inp.held().has('Escape')) : d.pressed.start;
      if (startPressed) { this.openMenu(p); continue; }
      if (p.deviceId === 'kb1' && inp.tapped('F1')) this.openHelp('kb1');
    }
    // title: controls overlay
    if (!g.players.length) {
      for (const [id, d] of inp.devices) {
        const pr = d.rawPressed || d.pressed;
        if (pr.interact || (id === 'kb1' && inp.tapped('F1'))) { this.openHelp(id); return; }
      }
    }
    const taken = new Set(g.players.map((p) => p.deviceId));
    for (const id of inp.joinPresses()) {
      if (taken.has(id)) continue;
      if (id === 'kb1' && inp.held().has('Escape')) continue;
      this.tryJoin(id);
    }
  }

  tryJoin(id) {
    const g = this.game, inp = g.input;
    if (!this.ready || g.players.some((p) => p.deviceId === id)) return;
    const p = g.addPlayer(id);
    if (!p) return;
    this.title.classList.add('hidden');
    restoreLook(p);
    // don't start out wearing the same colour as someone else
    const used = new Set(g.players.filter((q) => q !== p).map((q) => q.colorIndex));
    if (used.has(p.colorIndex)) {
      for (let i = 0; i < PLAYER_COLORS.length; i++) if (!used.has(i)) { p.setColor(i); break; }
    }
    const d = inp.get(id); if (d) d.pressed = {};
    this.toast(`Player ${p.index + 1} joined! <small>${DEV_NAME(id)}</small>`, p.color);
    this.openCustomiser(p, true);
  }

  setPanel(p, panel) {
    this.panels.get(p)?.remove();
    if (panel) this.panels.set(p, panel); else this.panels.delete(p);
    this.game.input.capture(p.deviceId, !!panel);
    if (panel && p.deviceId === 'kb1' && document.pointerLockElement) document.exitPointerLock();
    this.updatePause();
  }
  openCustomiser(p, first) { this.setPanel(p, new Customiser(this, p, first)); }
  openMenu(p) { this.sfx('uiOpen'); this.setPanel(p, new PauseMenu(this, p)); }
  closePanel(p) {
    this.setPanel(p, null);
    if (p.deviceId === 'kb1') this.game.input.lockMouse();
  }
  updatePause() {
    const g = this.game;
    const menus = [...this.panels.values()].filter((x) => x.kind === 'menu').length;
    const was = g.paused;
    g.paused = g.players.length === 1 && (menus > 0 || !!this.help);
    if (was !== g.paused) for (const pn of this.panels.values()) if (pn.kind === 'menu') pn.draw();
  }

  leave(p) {
    const g = this.game;
    this.setPanel(p, null);
    g.removePlayer(p);
    this.sfx('leave');
    this.toast(`Player ${p.index + 1} left`, p.color);
    if (!g.players.length) { this.title.classList.remove('hidden'); g.paused = false; }
    this.updatePause();
  }

  openHelp(id) {
    this.help = { id, tab: deviceKind(id) === 'pad' ? 0 : deviceKind(id) === 'kb1' ? 1 : 2 };
    this.game.input.capture(id, true);
    if (document.pointerLockElement) document.exitPointerLock();
    this.drawHelp();
    this.helpEl.classList.remove('hidden');
    this.sfx('uiOpen');
    this.updatePause();
  }
  drawHelp() { if (this.help) this.helpEl.innerHTML = helpHTML(this.help.tab, deviceKind(this.help.id)); }
  closeHelp() {
    const id = this.help.id;
    this.help = null;
    this.helpEl.classList.add('hidden');
    // keep the device captured if it still has a panel open
    const p = this.game.players.find((q) => q.deviceId === id);
    const panel = p && this.panels.get(p);
    this.game.input.capture(id, !!panel);
    if (panel) panel.draw();
    else if (p?.deviceId === 'kb1') this.game.input.lockMouse();
    this.sfx('uiBack');
    this.updatePause();
  }
}
