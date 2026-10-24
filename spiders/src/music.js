// Soundtrack: the Rounders tracks in ../assets/music (shared with Swingers).
// Menu plays one looping track; matches shuffle through the rest. Paused
// while the tab is hidden/unfocused and when music is off.

const NAMES = [
  'African 1', 'African 2', 'Bossa Nova 1', 'Bossa Nova 2', 'Calypso 1', 'Calypso 2',
  'Italian Accorion 1', 'Italian Accorion 2', 'Jazz 1', 'Jazz 2', 'Raga 1', 'Raga 2',
  'Reel 1', 'Reel 2', 'Reggae 1', 'Reggae 2', 'Salsa 1', 'Salsa 2', 'Samba 1', 'Samba 2',
  'Spy 1', 'Spy 2', 'Synth 1', 'Synth 2', 'Tango 1', 'Tango 2', 'Waltz 1', 'Waltz 2',
].map((n) => 'Rounders ' + n);

const MENU = 'Rounders Spy 1';
const url = (n) => '../assets/music/' + encodeURIComponent(n + '.mp3');

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
    this.play(MENU, true);
  }
  match(preferred) {
    if (this.context === 'match') return this.refresh();
    this.context = 'match';
    this.play(preferred && NAMES.includes(preferred) ? preferred : this.next());
  }
  next() {
    if (!this.bag.length) this.bag = NAMES.filter((n) => n !== MENU && n !== this.current).sort(() => Math.random() - 0.5);
    return this.bag.pop();
  }
  play(name, loop = false) {
    if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
    this.current = name;
    const el = new Audio();
    el.preload = 'auto';
    el.loop = loop;
    el.src = url(name);
    el.addEventListener('ended', () => { if (this.el === el && this.context === 'match') this.play(this.next()); });
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
    const want = this.enabled && !this.away;
    if (want && el.paused) el.play().catch(() => {});
    else if (!want && !el.paused) el.pause();
  }
  get nowPlaying() { return this.current.replace('Rounders ', ''); }
}
