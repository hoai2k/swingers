// Procedural sound effects (WebAudio, no assets). sfx.ensure() is called on
// the first user gesture. Silent while the tab is hidden/unfocused
// (setAway) or when sound is switched off.
//
// Add new sounds as methods built from tone()/noise()/sweep(). Calls are
// rate-limited per name (limit()) so 8 players firing miniguns stay sane.

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.away = false;
    this.master = null;
    this.volume = 0.8;
    this.last = new Map();
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.away) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5 * this.volume;
      this.master.connect(this.comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }

  setEnabled(on) { this.muted = !on; }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = 0.5 * v; }
  setAway(away) {
    this.away = away;
    if (!this.ctx) return;
    if (away && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    else if (!away && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  get live() { return this.ctx && !this.muted && !this.away; }

  // true if `name` may play now (at most once per `ms`)
  limit(name, ms = 40) {
    const now = performance.now();
    if (now - (this.last.get(name) || 0) < ms) return false;
    this.last.set(name, now);
    return true;
  }

  tone(freq, dur = 0.1, { type = 'square', vol = 0.12, slide = 0, delay = 0, attack = 0.002 } = {}) {
    if (!this.live) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // filtered noise burst: type 'lowpass'|'highpass'|'bandpass'
  noise(dur = 0.2, vol = 0.15, { delay = 0, filter = 'lowpass', freq = 4000, sweepTo = 0, q = 0.7 } = {}) {
    if (!this.live || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filter; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  // --- the palette -------------------------------------------------------
  join()   { this.tone(520, 0.07, { type: 'triangle', vol: 0.15 }); this.tone(780, 0.12, { type: 'triangle', vol: 0.15, delay: 0.07 }); }
  leave()  { this.tone(500, 0.08, { type: 'triangle' }); this.tone(320, 0.12, { delay: 0.08, type: 'triangle' }); }
  ui()     { this.tone(760, 0.04, { type: 'triangle', vol: 0.08 }); }
  uiOk()   { this.tone(660, 0.06, { type: 'triangle', vol: 0.12 }); this.tone(990, 0.1, { type: 'triangle', vol: 0.12, delay: 0.05 }); }
  jump()   { if (this.limit('jump', 50)) this.tone(260, 0.1, { type: 'triangle', vol: 0.07, slide: 260 }); }
  land()   { if (this.limit('land', 60)) this.noise(0.05, 0.05, { freq: 900 }); }
  step()   { if (this.limit('step', 30)) this.noise(0.025, 0.018, { freq: 2500, filter: 'bandpass', q: 2 }); }
  webShoot() { if (this.limit('webs', 30)) this.noise(0.12, 0.08, { filter: 'highpass', freq: 3000, sweepTo: 7000 }); }
  webStick() { if (this.limit('webt', 30)) { this.tone(180, 0.06, { type: 'triangle', vol: 0.08, slide: -60 }); this.noise(0.04, 0.06, { freq: 1500 }); } }
  webCut() { this.tone(1400, 0.08, { type: 'sawtooth', vol: 0.05, slide: -900 }); }
  pickup() { this.tone(660, 0.05, { type: 'triangle', vol: 0.12 }); this.tone(990, 0.08, { type: 'triangle', vol: 0.12, delay: 0.05 }); }
  drop()   { this.tone(300, 0.08, { type: 'triangle', vol: 0.08, slide: -120 }); }
  throwIt() { this.noise(0.15, 0.08, { filter: 'bandpass', freq: 900, sweepTo: 2400, q: 1.5 }); }
  clink()  { if (this.limit('clink', 40)) this.tone(1800 + Math.random() * 500, 0.06, { type: 'triangle', vol: 0.05 }); }
  // guns
  pew(pitch = 1) { if (this.limit('pew', 25)) { this.tone(880 * pitch, 0.1, { type: 'square', vol: 0.07, slide: -600 * pitch }); this.noise(0.05, 0.06, { filter: 'highpass', freq: 2500 }); } }
  bang(big = 1) { if (this.limit('bang', 30)) { this.noise(0.18 * big, 0.22, { freq: 2500, sweepTo: 300 }); this.tone(110, 0.12 * big, { type: 'sawtooth', vol: 0.12, slide: -60 }); } }
  zap()    { if (this.limit('zap', 30)) { this.tone(1600, 0.12, { type: 'sawtooth', vol: 0.06, slide: -1300 }); this.tone(2400, 0.08, { type: 'square', vol: 0.03, slide: -2000 }); } }
  charge(t) { if (this.limit('charge', 70)) this.tone(200 + t * 900, 0.08, { type: 'sine', vol: 0.05 }); }
  boom(big = 1) { if (this.limit('boom', 40)) { this.noise(0.6 * big, 0.35, { freq: 1200, sweepTo: 60 }); this.tone(70, 0.5 * big, { type: 'sine', vol: 0.3, slide: -40 }); } }
  fizzle() { this.noise(0.25, 0.06, { filter: 'highpass', freq: 4000 }); }
  // sabers
  saberOn()  { this.tone(110, 0.35, { type: 'sawtooth', vol: 0.06, slide: 90 }); this.noise(0.3, 0.04, { filter: 'bandpass', freq: 600, sweepTo: 1600, q: 3 }); }
  saberOff() { this.tone(200, 0.3, { type: 'sawtooth', vol: 0.05, slide: -140 }); }
  swoosh(speed = 1) { if (this.limit('swoosh', 90)) { this.tone(130 + speed * 60, 0.16, { type: 'sawtooth', vol: 0.04 * Math.min(1.5, speed), slide: 120 * speed }); this.noise(0.14, 0.05 * Math.min(1.5, speed), { filter: 'bandpass', freq: 500, sweepTo: 1800, q: 4 }); } }
  clash()  { if (this.limit('clash', 50)) { this.tone(2200, 0.2, { type: 'square', vol: 0.06, slide: -1200 }); this.noise(0.15, 0.15, { filter: 'highpass', freq: 3000 }); this.tone(320, 0.18, { type: 'sawtooth', vol: 0.08 }); } }
  deflect() { if (this.limit('deflect', 40)) { this.tone(1700, 0.1, { type: 'triangle', vol: 0.1, slide: 800 }); this.noise(0.06, 0.1, { filter: 'highpass', freq: 4000 }); } }
  hum() { if (this.limit('hum', 150)) this.tone(95 + Math.random() * 8, 0.18, { type: 'sawtooth', vol: 0.012 }); }
  // bodies
  kill()   { this.noise(0.3, 0.25, { freq: 1800, sweepTo: 200 }); this.tone(380, 0.3, { type: 'square', vol: 0.12, slide: -300 }); this.tone(90, 0.25, { type: 'sine', vol: 0.25, slide: -50 }); }
  hurt()   { if (this.limit('hurt', 40)) { this.noise(0.1, 0.12, { freq: 2000 }); this.tone(240, 0.08, { type: 'square', vol: 0.07, slide: -120 }); } }
  enemyDie() { if (this.limit('edie', 30)) { this.noise(0.2, 0.15, { freq: 2600, sweepTo: 400 }); this.tone(600, 0.18, { type: 'square', vol: 0.07, slide: -450 }); } }
  buzz()   { if (this.limit('buzz', 120)) this.tone(120 + Math.random() * 40, 0.12, { type: 'sawtooth', vol: 0.015 }); }
  shatter() { this.noise(0.4, 0.2, { filter: 'highpass', freq: 2500, sweepTo: 6000 }); for (let i = 0; i < 4; i++) this.tone(2000 + Math.random() * 2500, 0.08, { type: 'triangle', vol: 0.04, delay: i * 0.03 }); }
  // flow
  count()  { this.tone(440, 0.1, { type: 'square', vol: 0.1 }); }
  go()     { this.tone(880, 0.3, { type: 'square', vol: 0.13 }); }
  win()    { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.13, delay: i * 0.09 })); }
  wave()   { [392, 523, 659].forEach((f, i) => this.tone(f, 0.22, { type: 'sawtooth', vol: 0.07, delay: i * 0.12 })); }
  lose()   { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.12, delay: i * 0.14 })); }
  spawnIn() { this.tone(300, 0.25, { type: 'sine', vol: 0.08, slide: 600 }); }
  crate()  { this.noise(0.1, 0.12, { freq: 800 }); this.tone(150, 0.1, { type: 'triangle', vol: 0.1 }); }
}

export const sfx = new Sfx();
