// DOM overlay: the corner buttons (fullscreen, sound, music, settings, help)
// and the menus (pause, settings, controls). Menus are a stack of panels
// that work with the mouse/touch AND with any controller or the keyboard:
// pause.js feeds the polled input states to ui.navigate() every step.
//
// Menu definition:
//   { id, title, sub?, items: [item...], onBack?(), startCloses?, wide? }
//   item types:
//     { type: 'action', label, run(), danger? }
//     { type: 'toggle', label, key }                       boolean setting
//     { type: 'choice', label, key, options: [[value, label], ...] }
//     { type: 'slider', label, key, step: 0.1 }            0..1 setting
//     { type: 'html', html }                               static content (not focusable)
//   any item may also have: desc (small second line), and instead of `key`
//   get() / set(v) for values that live inside an object setting; an action
//   may have value() (a summary shown on the right, e.g. a sub-page's state)

import { settings, setSetting, onSettingsChange } from './settings.js';
import { sfx } from './audio.js';
import { WEAPONS } from './weapons.js';
import { POOLS, mixValue } from './pool.js';
import { MODIFIERS } from './modifiers.js';
import { SQUEEZE_SPEEDS } from './squeeze.js';
import { preloadSprites, sprite } from './sprites.js';

let currentUI = null;   // the UI instance (sub-pages push onto it)
const openSub = (makeDef) => { if (currentUI) currentUI.push(makeDef()); };
const getV = (it) => (it.get ? it.get() : settings[it.key]);

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const ICONS = {
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  unfull: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  soundOff: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9l5 6M21 9l-5 6"/>'),
  music: svg('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/>'),
  musicOff: svg('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/><path d="M3 3l18 18"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.6"/><circle cx="12" cy="17.4" r=".6" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};

// delivered white glyphs for the corner buttons (image-requests-history.md
// round 2, F); the SVGs above stay the fallback until (or unless) they load
const BTN_ART = {
  full: 'btn_fullscreen.png', unfull: 'btn_fullscreen.png', sound: 'btn_sound.png', soundOff: 'btn_sound_off.png',
  music: 'btn_music.png', musicOff: 'btn_music_off.png', gear: 'icon_settings.png', help: 'btn_help.png', pause: 'btn_pause.png',
};
preloadSprites([...new Set(Object.values(BTN_ART))]);
ICONS.pause = svg('<path d="M9 5v14M15 5v14"/>');
// set a corner button's icon (only touches the DOM when it changes)
function setBtnIcon(b, key) {
  const img = BTN_ART[key] && sprite(BTN_ART[key]);
  const want = key + (img ? ':art' : ':svg');
  if (b.dataset.icon === want) return;
  b.dataset.icon = want;
  b.classList.toggle('art', !!img);
  b.innerHTML = img ? `<img class="ui-ico" src="${img.src}" alt="" draggable="false">` : ICONS[key];
}

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsEnabled = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export function toggleFullscreen() {
  try {
    if (fsElement()) {
      const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      if (p && p.catch) p.catch(() => {});
    } else {
      const r = document.documentElement;
      const p = (r.requestFullscreen || r.webkitRequestFullscreen).call(r, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) { /* not allowed here */ }
}

// ---- the settings menu, shared by the corner gear, the pause menu and the lobby
export function settingsMenu(extra = {}) {
  const pct = (v) => Math.round(v * 100) + '%';
  return {
    id: 'settings',
    title: 'Settings',
    items: [
      { type: 'toggle', label: 'Sound', key: 'sound' },
      { type: 'slider', label: 'Sound volume', key: 'sfxVolume', step: 0.1, fmt: pct },
      { type: 'toggle', label: 'Music', key: 'music' },
      { type: 'slider', label: 'Music volume', key: 'musicVolume', step: 0.1, fmt: pct },
      { type: 'toggle', label: 'Screen shake', key: 'screenShake' },
      { type: 'choice', label: 'Weapon drops', key: 'dropRate', options: [['off', 'Off'], ['normal', 'Normal'], ['frequent', 'Frequent']] },
      { type: 'choice', label: 'Rounds to win', key: 'winScore', options: [...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20].map((n) => [n, String(n)])] },
      { type: 'action', label: 'Versus rules', run: () => openSub(versusMenu), value: versusSummary },
      { type: 'action', label: 'Modifiers', run: () => openSub(modifiersMenu), value: modsSummary },
      { type: 'toggle', label: 'Survival friendly fire', key: 'friendlyFire' },
      { type: 'toggle', label: 'Slow-mo on last kill', key: 'slowmo' },
      { type: 'toggle', label: 'Auto-pickup weapons (off: grab with RB)', key: 'autoPickup' },
      ...(fsEnabled() ? [{ type: 'action', label: 'Toggle fullscreen', run: () => toggleFullscreen() }] : []),
      { type: 'action', label: 'Back', back: true },
    ],
    ...extra,
  };
}

// ---- VS sub-pages: the Squeeze + weapon pool, the custom weapon mix, modifiers
const SQUEEZE_LABELS = { off: 'Off', static: 'Static edge', normal: 'Normal', fast: 'Fast', fastest: 'Fastest' };
function versusSummary() {
  const sq = SQUEEZE_LABELS[settings.squeezeSpeed] || settings.squeezeSpeed;
  const pool = (POOLS.find((q) => q[0] === settings.weaponPool) || [0, 'Everything'])[1];
  return `Squeeze ${sq.toLowerCase()} · ${pool}`;
}
function modsSummary() {
  const n = MODIFIERS.filter((m) => settings.mods && settings.mods[m.id]).length;
  return n ? `${n} on` : 'none';
}

export function versusMenu() {
  return {
    id: 'versus-rules',
    title: 'Versus rules',
    sub: 'The Squeeze closes in on the arena during a round. Touching it is a knockout.',
    items: [
      { type: 'choice', label: 'The Squeeze', key: 'squeezeSpeed', options: Object.keys(SQUEEZE_SPEEDS).map((k) => [k, SQUEEZE_LABELS[k] || k]) },
      { type: 'choice', label: 'Closes from', key: 'squeezeSides', options: [['one', 'One side'], ['several', 'Several sides'], ['all', 'All sides']] },
      { type: 'choice', label: 'Starts after', key: 'squeezeDelay', options: [10, 15, 20, 25, 30, 40, 60, 90].map((n) => [n, n + ' s']) },
      { type: 'choice', label: 'Weapon pool', key: 'weaponPool', options: POOLS, desc: 'Blades: melee · Demolition: explosives · Sharpshooters: guns' },
      { type: 'action', label: 'Custom weapon mix', run: () => openSub(weaponMixMenu), value: () => (settings.weaponPool === 'custom' ? 'in use' : 'edit') },
      { type: 'action', label: 'Back', back: true },
    ],
  };
}

const KIND_LABELS = { melee: 'Blade', gun: 'Gun', throwable: 'Throwable', special: 'Special' };
export function weaponMixMenu() {
  const opts = [[0, 'Off'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']];
  const weapons = [...WEAPONS.values()].sort((a, b) => (a.kind > b.kind ? 1 : a.kind < b.kind ? -1 : a.label.localeCompare(b.label)));
  const setMix = (id, v) => {
    setSetting('weaponMix', { ...(settings.weaponMix || {}), [id]: v });
    if (settings.weaponPool !== 'custom') setSetting('weaponPool', 'custom');
  };
  return {
    id: 'weapon-mix',
    title: 'Custom weapon mix',
    sub: 'How often each weapon drops (Off - 5). Changing one switches the pool to Custom.',
    items: [
      ...weapons.map((C) => ({ type: 'choice', label: C.label, desc: KIND_LABELS[C.kind] || C.kind, options: opts, get: () => mixValue(C.id), set: (v) => setMix(C.id, v) })),
      { type: 'action', label: 'Reset to defaults', run: () => setSetting('weaponMix', {}) },
      { type: 'action', label: 'Back', back: true },
    ],
  };
}

export function modifiersMenu() {
  const setMod = (id, v) => {
    const m = { ...(settings.mods || {}) };
    if (v) m[id] = true; else delete m[id];
    setSetting('mods', m);
  };
  return {
    id: 'modifiers',
    title: 'Modifiers',
    sub: 'Match mutators for Versus. Mix freely.',
    items: [
      ...MODIFIERS.map((d) => ({ type: 'toggle', label: d.name, desc: d.desc, get: () => !!(settings.mods && settings.mods[d.id]), set: (v) => setMod(d.id, v) })),
      { type: 'action', label: 'All off', run: () => setSetting('mods', {}) },
      { type: 'action', label: 'Back', back: true },
    ],
  };
}

const PAD_ROWS = [
  ['Left stick', 'Crawl / steer webs'],
  ['Right stick', 'Aim & swing blades'],
  ['LB  (or A / LT)', 'Jump on a surface; in the air press again to web toward the left stick, hold to swing, release to let go'],
  ['RT', 'Use / shoot weapon (blades: hold to charge, release to lunge)'],
  ['RB', 'Grab: take a weapon, or pull one to you from afar (your thrown blade first); holding one: throw it'],
  ['B', 'Throw weapon'],
  ['X', 'Swap with a weapon on the ground'],
  ['Y / D-pad ◀ ▶', 'Change spider (lobby)'],
  ['Start', 'Menu'],
  ['Back', 'Leave (lobby)'],
];
const KEY_ROWS = [
  ['W A S D', 'Crawl / steer webs'],
  ['Mouse', 'Aim'],
  ['Space / right mouse', 'Jump; again in the air: web (hold)'],
  ['Left mouse', 'Use / shoot weapon'],
  ['E', 'Grab / throw'],
  ['Q', 'Throw weapon'],
  ['F', 'Swap'],
  ['Z / X', 'Change spider (lobby)'],
  ['Esc', 'Menu'],
];
export function helpMenu(extra = {}) {
  const rows = (list) => list.map(([k, v]) => `<div class="kv"><span class="key">${k}</span><span>${v}</span></div>`).join('');
  return {
    id: 'help',
    title: 'How to play',
    wide: true,
    items: [
      { type: 'html', html: `<p class="lead">Swing between islands, grab weapons, be the last spider hanging. In the lobby, everyone stands on an island for 3 seconds to start that mode; press Start on the SETTINGS ledge for settings.</p>
        <div class="cols"><div><h3>Controller</h3>${rows(PAD_ROWS)}</div><div><h3>Keyboard + mouse</h3>${rows(KEY_ROWS)}</div></div>` },
      { type: 'action', label: 'Back', back: true },
    ],
    ...extra,
  };
}

export class UI {
  constructor(game) {
    this.game = game;
    this.stack = [];          // open menus: { def, el, rows, focus }
    this.idle = 0;
    this.navMem = new Map();  // per input id: held direction + repeat timer
    this.onChange = null;     // called when menus open/close (pause.js)
    currentUI = this;
    this.build();
    onSettingsChange(() => this.refresh());
    this.refresh();
  }

  get open() { return this.stack.length > 0; }
  get top() { return this.stack[this.stack.length - 1] || null; }

  build() {
    const root = this.root = el('div', 'ui-root');
    root.id = 'ui';
    // corner buttons
    const bar = this.bar = el('div', 'ui-bar');
    const btn = (id, title, fn) => {
      const b = el('button', 'ui-btn');
      b.type = 'button';
      b.dataset.id = id;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.tabIndex = -1;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => { e.preventDefault(); sfx.ensure(); fn(); this.poke(); });
      bar.append(b);
      return b;
    };
    // pause: only shown while a match can be paused (touch players have no Start)
    this.btnPause = btn('pause', 'Pause', () => { const o = this.game && this.game.overlay; if (o && o.canPause && !this.open) o.openPause(); });
    this.btnPause.style.display = 'none';
    this.btnFull = btn('fullscreen', 'Fullscreen', () => toggleFullscreen());
    if (!fsEnabled()) this.btnFull.style.display = 'none';
    this.btnSound = btn('sound', 'Sound on/off', () => { setSetting('sound', !settings.sound); if (settings.sound) sfx.uiOk(); });
    this.btnMusic = btn('music', 'Music on/off', () => setSetting('music', !settings.music));
    this.btnSettings = btn('settings', 'Settings', () => this.toggleMenu(settingsMenu()));
    this.btnHelp = btn('help', 'How to play', () => this.toggleMenu(helpMenu()));
    root.append(bar);
    // menu layer
    this.layer = el('div', 'ui-layer');
    this.layer.addEventListener('mousedown', (e) => { if (e.target === this.layer) { e.preventDefault(); this.back(); } });
    root.append(this.layer);
    document.body.append(root);
    // auto-hide the corner buttons when the mouse is idle
    // During play the keyboard player aims with the mouse, so only the
    // corner itself wakes the buttons then (touch always does).
    const wake = (e) => {
      if (e.pointerType === 'touch' || e.type === 'touchstart' || !this.busy()) { this.poke(); return; }
      if (e.clientX > window.innerWidth - 380 && e.clientY < 120) this.poke(1.5);
    };
    window.addEventListener('mousemove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('touchstart', wake, { passive: true });
    document.addEventListener('fullscreenchange', () => this.refresh());
    document.addEventListener('webkitfullscreenchange', () => this.refresh());
    this.poke(4);
    this.hideTimer = setInterval(() => {
      this.idle -= 0.25;
      const show = this.idle > 0 || this.open || this.bar.matches(':hover');
      this.bar.classList.toggle('hidden', !show);
      const o = this.game && this.game.overlay;
      const canPause = !!(o && o.inMatch && o.canPause && !this.open);
      if ((this.btnPause.style.display !== 'none') !== canPause) this.btnPause.style.display = canPause ? '' : 'none';
      this.refreshButtons();   // swaps in the delivered icons once they load
    }, 250);
  }

  // a match is running (not paused): keep the corner quiet
  busy() {
    const g = this.game;
    return !!(g && !g.paused && g.overlay && g.overlay.inMatch);
  }

  poke(t = 2.5) { this.idle = Math.max(this.idle, t); this.bar.classList.remove('hidden'); }

  refreshButtons() {
    setBtnIcon(this.btnFull, fsElement() ? 'unfull' : 'full');
    this.btnFull.classList.toggle('on', !!fsElement());
    setBtnIcon(this.btnSound, settings.sound ? 'sound' : 'soundOff');
    this.btnSound.classList.toggle('off', !settings.sound);
    setBtnIcon(this.btnMusic, settings.music && settings.sound ? 'music' : 'musicOff');
    this.btnMusic.classList.toggle('off', !(settings.music && settings.sound));
    setBtnIcon(this.btnSettings, 'gear');
    setBtnIcon(this.btnHelp, 'help');
    setBtnIcon(this.btnPause, 'pause');
  }

  refresh() {
    this.refreshButtons();
    for (const m of this.stack) this.renderRows(m);
  }

  // ---- menu stack ---------------------------------------------------------
  toggleMenu(def) {
    if (this.top && this.top.def.id === def.id) { this.back(); return; }
    // the corner buttons replace whatever corner menu is open (pause stays under)
    while (this.top && this.top.def.id !== 'pause') this.pop();
    this.push(def);
  }

  push(def) {
    const panel = el('div', 'ui-panel' + (def.wide ? ' wide' : ''));
    panel.dataset.menu = def.id;
    const head = el('div', 'ui-head');
    head.append(el('h2', '', def.title));
    const x = el('button', 'ui-x', ICONS.close);
    x.type = 'button'; x.tabIndex = -1; x.title = 'Close';
    x.addEventListener('mousedown', (e) => e.preventDefault());
    x.addEventListener('click', () => this.back());
    head.append(x);
    panel.append(head);
    if (def.sub) panel.append(el('div', 'ui-sub', def.sub));
    const list = el('div', 'ui-list');
    panel.append(list);
    if (def.hint !== false) panel.append(el('div', 'ui-hint', '<b>D-pad</b>/<b>stick</b> move · <b>A</b> select · <b>◀ ▶</b> change · <b>B</b> back'));
    const m = { def, el: panel, list, rows: [], focus: 0 };
    for (const it of def.items) {
      const row = el('div', 'ui-row ' + it.type + (it.danger ? ' danger' : ''));
      if (it.type === 'html') { row.innerHTML = it.html; list.append(row); continue; }
      row.addEventListener('mouseenter', () => this.setFocus(m, m.rows.indexOf(row)));
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', (e) => this.clickRow(m, it, row, e));
      m.rows.push(row);
      row._item = it;
      list.append(row);
    }
    this.stack.forEach((s) => s.el.classList.add('under'));
    this.layer.append(panel);
    this.layer.classList.add('show');
    this.stack.push(m);
    this.root.classList.add('menu-open');
    this.renderRows(m);
    this.setFocus(m, 0);
    sfx.ui();
    if (this.onChange) this.onChange();
    return m;
  }

  pop() {
    const m = this.stack.pop();
    if (!m) return;
    m.el.remove();
    if (this.top) this.top.el.classList.remove('under');
    else { this.layer.classList.remove('show'); this.root.classList.remove('menu-open'); }
    if (m.def.onClose) m.def.onClose();
    if (this.onChange) this.onChange();
  }

  back() {
    const m = this.top;
    if (!m) return;
    sfx.ui();
    if (m.def.onBack) { m.def.onBack(); return; }
    this.pop();
  }

  closeAll() { while (this.stack.length) this.pop(); }

  setFocus(m, i) {
    if (i < 0 || i >= m.rows.length) return;
    m.focus = i;
    m.rows.forEach((r, k) => r.classList.toggle('focus', k === i));
    const r = m.rows[i];
    if (r && r.scrollIntoView && m.list.scrollHeight > m.list.clientHeight) r.scrollIntoView({ block: 'nearest' });
  }

  renderRows(m) {
    for (const row of m.rows) {
      const it = row._item;
      if (it.type === 'action') {
        if (it.value) { row.style.justifyContent = 'space-between'; row.innerHTML = `<span class="lbl">${it.label}</span><span class="ctl"><span class="val small">${it.value()}</span><span class="arr">▶</span></span>`; }
        else row.innerHTML = `<span class="lbl">${it.label}</span>`;
        continue;
      }
      const v = getV(it);
      let val = '';
      if (it.type === 'toggle') val = `<span class="pill ${v ? 'on' : ''}">${v ? 'ON' : 'OFF'}</span>`;
      else if (it.type === 'choice') {
        const o = it.options.find((q) => q[0] === v);
        val = `<span class="arr">◀</span><span class="val">${o ? o[1] : v}</span><span class="arr">▶</span>`;
      } else if (it.type === 'slider') {
        const n = Math.round(1 / it.step);
        const k = Math.round(v / it.step);
        let bars = '';
        for (let i = 1; i <= n; i++) bars += `<i class="${i <= k ? 'on' : ''}"></i>`;
        val = `<span class="arr">◀</span><span class="bars">${bars}</span><span class="val small">${it.fmt ? it.fmt(v) : v}</span><span class="arr">▶</span>`;
      }
      const desc = it.desc ? `<small style="display:block;font-size:.66em;opacity:.6;font-weight:400;line-height:1.1">${it.desc}</small>` : '';
      row.innerHTML = `<span class="lbl">${it.label}${desc}</span><span class="ctl">${val}</span>`;
    }
  }

  clickRow(m, it, row, e) {
    this.setFocus(m, m.rows.indexOf(row));
    if (it.type === 'slider' || it.type === 'choice') {
      // left half of the control steps down, right half steps up
      const ctl = row.querySelector('.ctl');
      const r = ctl ? ctl.getBoundingClientRect() : row.getBoundingClientRect();
      if (it.type === 'slider' && ctl) {
        const bars = ctl.querySelector('.bars').getBoundingClientRect();
        if (e.clientX >= bars.left && e.clientX <= bars.right) {
          const n = Math.round(1 / it.step);
          const k = Math.max(0, Math.min(n, Math.ceil(((e.clientX - bars.left) / bars.width) * n)));
          this.setValue(it, +(k * it.step).toFixed(3));
          return;
        }
      }
      this.adjust(it, e.clientX < r.left + r.width / 2 ? -1 : 1);
      return;
    }
    this.activate(m, it);
  }

  activate(m, it) {
    if (!it) return;
    if (it.type === 'action') {
      sfx.uiOk();
      if (it.back) this.back();
      else if (it.run) it.run();
    } else if (it.type === 'toggle') this.adjust(it, 1);
    else if (it.type === 'choice') this.adjust(it, 1);
  }

  adjust(it, dir) {
    if (it.type === 'toggle') { this.setValue(it, !getV(it)); return; }
    if (it.type === 'choice') {
      const i = it.options.findIndex((q) => q[0] === getV(it));
      const n = it.options.length;
      this.setValue(it, it.options[((i < 0 ? 0 : i) + dir + n) % n][0]);
      return;
    }
    if (it.type === 'slider') {
      const v = Math.max(0, Math.min(1, +(settings[it.key] + dir * it.step).toFixed(3)));
      this.setValue(it, v);
    }
  }

  setValue(it, v) {
    if (it.set) it.set(v); else setSetting(it.key, v);
    sfx.ensure();
    sfx.ui();
  }

  // ---- controller / keyboard navigation (called once per input poll) -------
  // states: polled input states; isEnter(state) says the keyboard Enter key is
  // down (Enter selects, Esc backs out; both read as Start).
  navigate(states, dt, { isEnter } = {}) {
    const m = this.top;
    if (!m) return;
    for (const s of states) {
      const dir = this.navDir(s, dt);
      const p = s.pressed || {};
      if (dir.y) {
        const n = m.rows.length;
        if (n) { this.setFocus(m, (m.focus + dir.y + n) % n); sfx.ui(); }
      }
      const it = m.rows[m.focus] && m.rows[m.focus]._item;
      if (dir.x && it && it.type !== 'action') this.adjust(it, dir.x);
      const enter = s.kind === 'keyboard' && isEnter && isEnter();
      if (p.a || (p.start && enter)) { this.activate(m, it); return; }
      if (p.b) { this.back(); return; }
      if (p.start) {
        if (m.def.startCloses || this.stack[0].def.startCloses) { sfx.ui(); const root = this.stack[0].def; if (root.onBack) root.onBack(); else this.closeAll(); }
        else this.back();
        return;
      }
    }
  }

  // edge + auto-repeat directions from d-pad, both sticks
  navDir(s, dt) {
    const p = s.pressed || {};
    const out = { x: 0, y: 0 };
    if (p.du) out.y = -1; else if (p.dd) out.y = 1;
    if (p.dl) out.x = -1; else if (p.dr) out.x = 1;
    const l = s.l || { x: 0, y: 0 }, r = s.r || { x: 0, y: 0 };
    const kbArrows = s.kind === 'keyboard' && s.mouseAim ? { x: 0, y: 0 } : r;
    let sx = Math.abs(l.x) > Math.abs(kbArrows.x) ? l.x : kbArrows.x;
    let sy = Math.abs(l.y) > Math.abs(kbArrows.y) ? l.y : kbArrows.y;
    const d = s.dpad || {};
    let hx = d.left ? -1 : d.right ? 1 : 0, hy = d.up ? -1 : d.down ? 1 : 0;
    if (!hx && Math.abs(sx) > 0.55 && Math.abs(sx) > Math.abs(sy)) hx = Math.sign(sx);
    if (!hy && Math.abs(sy) > 0.55 && Math.abs(sy) >= Math.abs(sx)) hy = Math.sign(sy);
    const key = hx + ',' + hy;
    let mem = this.navMem.get(s.id);
    if (!mem) { mem = { key: '0,0', t: 0 }; this.navMem.set(s.id, mem); }
    if (key !== mem.key) {
      mem.key = key; mem.t = 0.38;
      // fresh stick deflection counts as a press (d-pad edges already did)
      if (!out.x && !out.y) { out.x = hx; out.y = hy; }
      if (out.y) out.x = 0;
    } else if (key !== '0,0') {
      mem.t -= dt;
      if (mem.t <= 0) { mem.t = 0.11; if (hy) out.y = hy; else out.x = hx; }
    }
    return out;
  }
}
