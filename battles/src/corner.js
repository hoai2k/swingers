// Corner buttons (top right): fullscreen, sound, music, settings — the same set the
// other games in this repo have. They hide while the mouse is idle and stay out of
// the way during a battle (the mouse near the corner wakes them).
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  unfull: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  sound: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  soundOff: svg('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9l5 6M21 9l-5 6"/>'),
  music: svg('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/>'),
  musicOff: svg('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor"/><path d="M3 3l18 18"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
};

export const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
export const fsEnabled = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export function setFullscreen(on) {
  try {
    if (!on && fsElement()) {
      const p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      if (p && p.catch) p.catch(() => {});
    } else if (on && !fsElement() && fsEnabled()) {
      const r = document.documentElement;
      const p = (r.requestFullscreen || r.webkitRequestFullscreen).call(r, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => { /* not allowed here: stay windowed */ });
    }
  } catch (e) { /* not allowed here */ }
}

export class Corner {
  // actions: { sound(), music(), settings() }, state(): { sound, music, busy }
  constructor(actions, state) {
    this.state = state;
    const bar = this.bar = document.createElement('div');
    bar.className = 'cbar';
    const btn = (title, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cbtn'; b.title = title; b.tabIndex = -1;
      b.setAttribute('aria-label', title);
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); this.refresh(); this.poke(); });
      bar.append(b);
      return b;
    };
    this.bFull = btn('Fullscreen', () => setFullscreen(!fsElement()));
    if (!fsEnabled()) this.bFull.style.display = 'none';
    this.bSound = btn('Sound on/off', actions.sound);
    this.bMusic = btn('Music on/off', actions.music);
    this.bGear = btn('Settings', actions.settings);
    document.body.append(bar);
    this.idle = 4;
    const wake = (e) => {
      if (e.pointerType === 'touch' || e.type === 'touchstart' || !this.state().busy) { this.poke(); return; }
      if (e.clientX > innerWidth - 300 && e.clientY < 110) this.poke(1.5);
    };
    addEventListener('mousemove', wake, { passive: true });
    addEventListener('pointerdown', wake, { passive: true });
    addEventListener('touchstart', wake, { passive: true });
    document.addEventListener('fullscreenchange', () => this.refresh());
    document.addEventListener('webkitfullscreenchange', () => this.refresh());
    setInterval(() => {
      this.idle -= 0.25;
      bar.classList.toggle('hidden', !(this.idle > 0 || bar.matches(':hover')));
    }, 250);
    this.refresh();
  }

  poke(t = 2.5) { this.idle = Math.max(this.idle, t); this.bar.classList.remove('hidden'); }

  refresh() {
    const s = this.state();
    this.bFull.innerHTML = fsElement() ? ICONS.unfull : ICONS.full;
    this.bSound.innerHTML = s.sound ? ICONS.sound : ICONS.soundOff;
    this.bSound.classList.toggle('off', !s.sound);
    const m = s.sound && s.music;
    this.bMusic.innerHTML = m ? ICONS.music : ICONS.musicOff;
    this.bMusic.classList.toggle('off', !m);
    this.bGear.innerHTML = ICONS.gear;
  }
}
