import { SILENT_DEBUG } from './debug.js';

// Tiny procedural sound effects (WebAudio). No assets needed.
// Browsers require a user gesture before audio can start; game calls
// sfx.ensure() from input handlers. Sound settings (game.js) switch it with
// setEnabled; it's suspended while the tab is hidden or unfocused.

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.away = false;
    this.master = null;
  }

  ensure() {
    if (SILENT_DEBUG) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.away) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* audio unavailable, play silent */ }
  }

  setEnabled(on) { this.muted = !on; }

  // tab hidden / window unfocused: stop the audio clock entirely
  setAway(away) {
    this.away = away;
    if (!this.ctx) return;
    if (away && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    else if (!away && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  tone(freq, dur = 0.1, { type = 'square', vol = 0.12, slide = 0, delay = 0 } = {}) {
    if (!this.ctx || this.muted || this.away) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur = 0.2, vol = 0.15, delay = 0) {
    if (!this.ctx || this.muted || this.away) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(t0);
  }

  join()   { this.tone(520, 0.07, { type: 'triangle', vol: 0.15 }); this.tone(780, 0.1, { type: 'triangle', vol: 0.15, delay: 0.07 }); }
  leave()  { this.tone(500, 0.08, { type: 'triangle' }); this.tone(320, 0.12, { delay: 0.08, type: 'triangle' }); }
  uiTick() { this.tone(700, 0.04, { type: 'triangle', vol: 0.08 }); }
  grab()   { this.tone(190, 0.05, { type: 'square', vol: 0.1 }); }
  push()   { this.tone(140, 0.05, { type: 'triangle', vol: 0.06 }); }
  punch()  { this.noise(0.12, 0.2); this.tone(120, 0.12, { type: 'sawtooth', vol: 0.15, slide: -60 }); }
  superPunch() { this.noise(0.25, 0.3); this.tone(90, 0.3, { type: 'sawtooth', vol: 0.25, slide: -50 }); }
  pickup() { this.tone(660, 0.06, { type: 'triangle', vol: 0.12 }); this.tone(880, 0.06, { type: 'triangle', vol: 0.12, delay: 0.06 }); this.tone(1320, 0.1, { type: 'triangle', vol: 0.12, delay: 0.12 }); }
  death()  { this.noise(0.25, 0.2); this.tone(300, 0.35, { type: 'sawtooth', vol: 0.15, slide: -240 }); }
  finish() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', vol: 0.14, delay: i * 0.09 })); }
  count()  { this.tone(440, 0.09, { type: 'square', vol: 0.1 }); }
  go()     { this.tone(880, 0.25, { type: 'square', vol: 0.14 }); }
  boing()  { this.tone(180, 0.18, { type: 'triangle', vol: 0.16, slide: 520 }); }
  crack()  { this.noise(0.09, 0.12); this.tone(150, 0.06, { type: 'square', vol: 0.06, slide: -40 }); }
  crumble() { this.noise(0.3, 0.18); this.tone(90, 0.25, { type: 'sawtooth', vol: 0.1, slide: -50 }); }
  checkpoint() { [587, 784, 1175].forEach((f, i) => this.tone(f, 0.09, { type: 'triangle', vol: 0.12, delay: i * 0.07 })); }
  shoot()  { this.noise(0.07, 0.16); this.tone(220, 0.09, { type: 'sawtooth', vol: 0.1, slide: -140 }); }
  hit()    { this.noise(0.18, 0.2); this.tone(140, 0.2, { type: 'triangle', vol: 0.16, slide: 260 }); }
  pop()    { this.tone(500, 0.08, { type: 'square', vol: 0.12, slide: 300 }); this.noise(0.05, 0.1); }
}

export const sfx = new Sfx();
