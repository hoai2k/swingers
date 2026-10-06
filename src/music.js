// Soundtrack, imported from Rounders (assets/music/, see
// tools/import_rounders.mjs). Tracks stream through an <audio> element.
//
// How it plays, Rounders-style:
//  - lobby (and the board list before the first race): the title track,
//    looping
//  - from the first race on, music belongs to the SESSION, not the board:
//    it opens on the song cast to the board's theme, then picks the next
//    song BY THEME — every theme plays once before any repeats, and a theme
//    that comes round again plays the other take of its pair
//  - quieter (ducked) on the board list between races, quieter still when
//    paused
//  - paused while the tab is hidden or the window loses focus, and off when
//    sound or music is switched off

const NAMES = [
  'African 1', 'African 2', 'Bossa Nova 1', 'Bossa Nova 2', 'Calypso 1', 'Calypso 2',
  'Italian Accorion 1', 'Italian Accorion 2', 'Jazz 1', 'Jazz 2', 'Raga 1', 'Raga 2',
  'Reel 1', 'Reel 2', 'Reggae 1', 'Reggae 2', 'Salsa 1', 'Salsa 2', 'Samba 1', 'Samba 2',
  'Spy 1', 'Spy 2', 'Synth 1', 'Synth 2', 'Tango 1', 'Tango 2', 'Waltz 1', 'Waltz 2',
].map((n) => 'Rounders ' + n);   // NB "Accorion" matches the filenames

const TITLE = 'Rounders Jazz 1';

// The song a session opens on, by the theme of its first board.
const THEME_MUSIC = {
  meadow: 'Rounders Bossa Nova 1',
  cave: 'Rounders Raga 2',
  sunset: 'Rounders Calypso 1',
  jungle: 'Rounders African 2',
  factory: 'Rounders Reel 1',
  sky: 'Rounders Reggae 2',
  volcano: 'Rounders Spy 2',
  night: 'Rounders Jazz 2',
  candy: 'Rounders Samba 1',
  frost: 'Rounders Waltz 1',
  desert: 'Rounders Raga 1',
  storm: 'Rounders Tango 1',
};

const TRACKS = NAMES.map((name) => {
  const m = /^Rounders (.+) (\d+)$/.exec(name);
  return { name, theme: m[1], url: 'assets/music/' + encodeURIComponent(name + '.mp3') };
});
const THEMES = [...new Set(TRACKS.map((t) => t.theme))];

export const DUCK = { none: 1, menu: 0.55, roundEnd: 0.7, paused: 0.35 };

export class Music {
  constructor() {
    this.el = null;
    this.index = -1;
    this.context = null;       // 'menu' | 'session'
    this.duck = 1;
    this.volume = 0.3;
    this.enabled = true;       // sound && music settings
    this.away = false;         // tab hidden / window unfocused
    this.played = new Set();   // themes heard this cycle
    this.lastTake = new Map(); // theme -> track index last played
  }

  // ---- what should be playing
  menu() {
    if (this.context === 'menu') return this.refresh();
    this.context = 'menu';
    this.play(NAMES.indexOf(TITLE), true);
  }

  race(theme) {
    if (this.context !== 'session') {
      this.context = 'session';
      this.played.clear();
      this.lastTake.clear();
      const opener = NAMES.indexOf(THEME_MUSIC[theme]);
      this.play(opener >= 0 ? opener : this.nextIndex());
    }
    this.setDuck(DUCK.none);
  }

  setDuck(level) { this.duck = level; this.refresh(); }
  setEnabled(on) { this.enabled = on; this.refresh(); }
  setAway(away) { this.away = away; this.refresh(); }

  // Browsers only start audio after a user gesture; call this from input.
  unlock() { this.refresh(); }

  // ---- internals
  nextIndex() {
    const current = TRACKS[this.index];
    let themes = THEMES.filter((t) => !this.played.has(t));
    if (!themes.length) { this.played.clear(); themes = THEMES.slice(); }
    if (current && themes.length > 1) themes = themes.filter((t) => t !== current.theme);
    const theme = themes[Math.floor(Math.random() * themes.length)];
    const takes = TRACKS.map((t, i) => (t.theme === theme ? i : -1)).filter((i) => i >= 0);
    const other = takes.filter((i) => i !== this.lastTake.get(theme));
    const pool = other.length ? other : takes;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  play(index, loop = false) {
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
    }
    this.index = index;
    const t = TRACKS[index];
    if (this.context === 'session') {
      this.played.add(t.theme);
      this.lastTake.set(t.theme, index);
    }
    const el = new Audio();
    el.preload = 'auto';
    el.loop = loop;
    el.src = t.url;
    el.addEventListener('ended', () => {
      if (this.el === el && this.context === 'session') this.play(this.nextIndex());
    });
    this.el = el;
    this.refresh();
  }

  refresh() {
    const el = this.el;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, this.volume * this.duck));
    const want = this.enabled && !this.away;
    if (want && el.paused) el.play().catch(() => { /* waits for a gesture */ });
    else if (!want && !el.paused) el.pause();
  }

  get nowPlaying() { return this.index >= 0 ? TRACKS[this.index].name.replace('Rounders ', '') : ''; }
}
