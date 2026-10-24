// Small synthesized sound kit (no audio files). Muted while the tab is hidden.
export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.engines = new Map();
    this.volume = 0.6;
    const resume = () => this.start();
    addEventListener('keydown', resume); addEventListener('mousedown', resume);
    document.addEventListener('visibilitychange', () => this.applyMute());
    addEventListener('blur', () => this.applyMute());
    addEventListener('focus', () => this.applyMute());
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyMute();
    } catch (e) { this.ctx = null; }
  }

  applyMute() {
    if (!this.ctx) return;
    const hidden = document.hidden || !document.hasFocus();
    this.master.gain.setTargetAtTime(hidden ? 0 : this.volume, this.ctx.currentTime, 0.05);
    if (hidden) this.ctx.suspend?.(); else this.ctx.resume?.();
  }

  // Volume falloff from the nearest camera.
  gainAt(pos) {
    if (!pos) return 1;
    let best = 1e9;
    for (const p of this.game.players) {
      const c = p.camera?.cam.position;
      if (!c) continue;
      best = Math.min(best, Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z));
    }
    if (best === 1e9) return 0.5;
    return Math.max(0, 1 - best / 45) ** 1.5;
  }

  tone(type, f0, f1, dur, vol, when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, vol, freq = 800, q = 1, type = 'lowpass', when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  play(name, pos, strength = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const v = this.gainAt(pos) * strength;
    if (v < 0.02) return;
    switch (name) {
      case 'jump': this.tone('sine', 260, 520, 0.16, 0.25 * v); break;
      case 'grab': this.tone('triangle', 700, 900, 0.05, 0.12 * v); break;
      case 'swish': this.burst(0.12, 0.12 * v, 2200, 2, 'bandpass'); break;
      case 'punch': this.burst(0.15, 0.5 * v, 500); this.tone('sine', 140, 60, 0.15, 0.35 * v); break;
      case 'ko': this.tone('square', 900, 200, 0.4, 0.06 * v); this.tone('sine', 1200, 1500, 0.1, 0.05 * v, 0.15); break;
      case 'thud': this.burst(0.12, Math.min(0.5, 0.3 * v), 300); break;
      case 'seat': this.tone('sine', 400, 300, 0.08, 0.15 * v); break;
      case 'splash': this.burst(0.5, 0.35 * v, 1400, 0.7); break;
      case 'boing': this.tone('sine', 180, 700, 0.3, 0.3 * v); break;
      case 'horn': this.tone('square', 392, 392, 0.35, 0.08 * v); this.tone('square', 494, 494, 0.35, 0.06 * v); break;
      case 'join': [523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.15, i * 0.08)); break;
      case 'pop': this.tone('sine', 900, 1800, 0.08, 0.15 * v); break;
    }
  }

  // Continuous engine hum for occupied vehicles.
  updateEngines(vehicles) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const live = new Set();
    for (const veh of vehicles) {
      if (!veh.driver()) continue;
      live.add(veh);
      let e = this.engines.get(veh);
      if (!e) {
        const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 600;
        g.gain.value = 0;
        o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
        o.start(); o2.start();
        e = { o, o2, g, f };
        this.engines.set(veh, e);
      }
      const p = veh.body.translation();
      const rpm = Math.abs(veh.speed) / veh.def.maxSpeed;
      const base = veh.def.boat ? 50 : veh.def.mass < 400 ? 70 : 45;
      const f = base + rpm * base * 2.2 + Math.abs(veh.throttle || 0) * 15;
      const t = this.ctx.currentTime;
      e.o.frequency.setTargetAtTime(f, t, 0.05);
      e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      e.g.gain.setTargetAtTime(0.05 * this.gainAt(p) * (0.6 + Math.abs(veh.throttle || 0) * 0.6), t, 0.1);
    }
    for (const [veh, e] of this.engines) {
      if (live.has(veh)) continue;
      e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      e.o.stop(this.ctx.currentTime + 0.5); e.o2.stop(this.ctx.currentTime + 0.5);
      this.engines.delete(veh);
    }
  }
}
