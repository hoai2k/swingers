import { SILENT_DEBUG } from '../../src/debug.js';

// Soundtrack: the Rounders tracks in ../assets/music (shared with Swingers).
// Menu plays one looping track; matches shuffle through the rest. Paused
// while the tab is hidden/unfocused and when music is off.
//
// Spider Swingers' own tracks (music-requests.md) take over per role once
// delivered to assets/music/ and listed under "music" in
// assets/web/manifest.json: theme.mp3 (title/lobby loop), versus_*.mp3
// (VS rotation), survival_*.mp3, trials_*.mp3, boss.mp3 (survival boss
// waves), and one-shot stingers win.mp3 / lose.mp3.

const NAMES = [
  'African 1', 'African 2', 'Bossa Nova 1', 'Bossa Nova 2', 'Calypso 1', 'Calypso 2',
  'Italian Accorion 1', 'Italian Accorion 2', 'Jazz 1', 'Jazz 2', 'Raga 1', 'Raga 2',
  'Reel 1', 'Reel 2', 'Reggae 1', 'Reggae 2', 'Salsa 1', 'Salsa 2', 'Samba 1', 'Samba 2',
  'Spy 1', 'Spy 2', 'Synth 1', 'Synth 2', 'Tango 1', 'Tango 2', 'Waltz 1', 'Waltz 2',
].map((n) => 'Rounders ' + n);

const MENU = 'Rounders Spy 1';
const url = (n) => (n.startsWith('own:') ? 'assets/music/' + encodeURIComponent(n.slice(4)) : '../assets/music/' + encodeURIComponent(n + '.mp3'));

// delivered Spider Swingers tracks, from the shared art manifest
let OWN = [];
fetch('assets/web/manifest.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  .then((m) => { OWN = (m && m.music) || []; });
const ownFor = (role) => OWN.filter((f) => f === role + '.mp3' || f.startsWith(role + '_')).map((f) => 'own:' + f);

export class Music {
  constructor() {
    this.el = null;
    this.context = null;
    this.duck = 1;
    this.volume = 0.5;
    this.enabled = true;
    this.away = false;
    this.bag = [];
    this.current = '';
  }
  menu() {
    if (this.context === 'menu') return this.refresh();
    this.context = 'menu';
    const own = ownFor('theme');
    this.play(own[0] || MENU, true);
  }
  // role: 'versus' | 'survival' | 'trials' (picks delivered tracks for it)
  match(preferred, role = 'versus') {
    const ctx = 'match:' + role;
    if (this.context === ctx) return this.refresh();
    const was = this.context;
    this.context = ctx;
    this.role = role;
    this.bag = [];
    // coming back from a boss: keep going with the role's music
    if (ownFor(role).length || !(was && was.startsWith('match'))) this.play(ownFor(role).length ? this.next() : (preferred && NAMES.includes(preferred) ? preferred : this.next()));
  }
  // survival boss wave: its own track if delivered (back to match() after)
  boss() {
    const own = ownFor('boss');
    if (!own.length || this.context === 'boss') return;
    this.context = 'boss';
    this.play(own[0], true);
  }
  // one-shot stinger over the ducked music (win / lose)
  sting(name) {
    if (SILENT_DEBUG || !OWN.includes(name + '.mp3') || !this.enabled || this.away) return;
    const el = new Audio(url('own:' + name + '.mp3'));
    el.volume = Math.min(1, this.volume * 1.2);
    el.play().catch(() => {});
  }
  next() {
    if (!this.bag.length) {
      const own = ownFor(this.role || 'versus');
      const pool = own.length ? own : NAMES.filter((n) => n !== MENU);
      this.bag = pool.filter((n) => n !== this.current || pool.length === 1).sort(() => Math.random() - 0.5);
    }
    return this.bag.pop();
  }
  play(name, loop = false) {
    if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
    this.current = name;
    const el = new Audio();
    el.preload = 'auto';
    el.loop = loop;
    el.src = url(name);
    el.addEventListener('ended', () => { if (this.el === el && this.context && this.context.startsWith('match')) this.play(this.next()); });
    this.el = el;
    this.refresh();
  }
  setDuck(v) { this.duck = v; this.refresh(); }
  setVolume(v) { this.volume = v; this.refresh(); }
  setEnabled(on) { this.enabled = on; this.refresh(); }
  setAway(a) { this.away = a; this.refresh(); }
  unlock() { this.refresh(); }
  refresh() {
    const el = this.el;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, this.volume * this.duck));
    const want = !SILENT_DEBUG && this.enabled && !this.away;
    if (want && el.paused) el.play().catch(() => {});
    else if (!want && !el.paused) el.pause();
  }
  get nowPlaying() { return this.current.replace('Rounders ', '').replace('own:', ''); }
}
