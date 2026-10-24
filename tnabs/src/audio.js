// Synthesised sound: impacts, weapons, explosions, unit voices and music.
import { THREE, clamp, rand, pick } from './util.js';

const VOWELS = { a: [800, 1200], e: [500, 1800], i: [300, 2300], o: [500, 900], u: [330, 800], ae: [660, 1700] };
// syllable patterns per battle-cry type: [vowel, duration, pitch start, pitch end]
const CRIES = [
  /* ooga */ [['u', 0.22, 1.0, 1.1], ['a', 0.3, 1.15, 0.9]],
  /* roar */ [['a', 0.7, 0.8, 0.65]],
  /* yip */ [['i', 0.12, 1.6, 1.9], ['i', 0.12, 1.7, 2.0]],
  /* hey */ [['ae', 0.35, 1.1, 1.25]],
  /* la */ [['a', 0.2, 1.2, 1.2], ['a', 0.2, 1.35, 1.35], ['a', 0.3, 1.5, 1.5]],
  /* charge */ [['a', 0.55, 1.0, 1.3]],
  /* cackle */ [['e', 0.09, 1.6, 1.5], ['e', 0.09, 1.7, 1.5], ['e', 0.09, 1.8, 1.5], ['e', 0.12, 1.9, 1.6]],
  /* royal */ [['o', 0.35, 0.9, 1.0], ['a', 0.4, 1.0, 0.85]],
  /* magic */ [['o', 0.6, 1.0, 1.4]],
];
const KIND = ['idle', 'attack', 'hurt', 'die', 'cry', 'scream', 'sing', 'cheer'];

export class Audio {
  constructor() {
    this.ctx = null;
    this.listeners = [];
    this.sfxVol = 0.8;
    this.musicVol = 0.45;
    this.voiceVol = 0.8;
    this.active = 0;
    this.frameCount = 0;
    this.pluckCache = new Map();
    this.music = null;
    this.musicMode = null;
    this.hidden = false;
    const upd = () => {
      this.hidden = document.hidden || !document.hasFocus();
      if (!this.ctx) return;
      if (this.hidden) this.ctx.suspend(); else this.ctx.resume();
    };
    document.addEventListener('visibilitychange', upd);
    window.addEventListener('blur', upd);
    window.addEventListener('focus', upd);
  }

  unlock() {
    if (this.ctx) { if (!this.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicVol; this.musicBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (document.hidden || !document.hasFocus()) this.ctx.suspend();
    if (this.musicMode) this.startMusic(this.musicMode, true);
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (this.sfx) this.sfx.gain.value = sfx;
    if (this.musicBus) this.musicBus.gain.value = music;
  }

  // cameras: [{position, right(Vector3)}]
  setListeners(list) { this.listeners = list; }
  beginFrame() { this.frameCount = 0; }

  spatial(pos, vol) {
    if (!pos || !this.listeners.length) return { gain: vol, pan: 0 };
    let best = null, bd = Infinity;
    for (const l of this.listeners) {
      const d = l.position.distanceTo(pos);
      if (d < bd) { bd = d; best = l; }
    }
    const gain = vol / (1 + bd / 12);
    const dir = pos.clone().sub(best.position).normalize();
    const pan = clamp(dir.dot(best.right), -1, 1) * 0.8;
    return { gain, pan };
  }

  out(gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p).connect(this.sfx); } else g.connect(this.sfx);
    return g;
  }

  canPlay(gain) {
    if (!this.ctx || this.hidden || this.ctx.state !== 'running') return false;
    if (gain < 0.015 || this.active > 48 || this.frameCount > 14) return false;
    this.frameCount++;
    return true;
  }

  track(node, dur) {
    this.active++;
    setTimeout(() => { this.active--; }, dur * 1000 + 50);
  }

  noiseSrc(t, dur, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rate;
    s.loop = true;
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  play(name, pos, vol = 1, pitch = 1) {
    const { gain, pan } = this.spatial(pos, vol);
    if (!this.canPlay(gain)) return;
    const c = this.ctx, t = c.currentTime + 0.005;
    const o = this.out(gain, pan);
    let dur = 0.3;
    const filt = (type, f, q = 1) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const osc = (type, f) => { const s = c.createOscillator(); s.type = type; s.frequency.value = f; return s; };
    const g = () => c.createGain();
    switch (name) {
      case 'whoosh': case 'throw': {
        dur = name === 'throw' ? 0.25 : 0.22;
        const n = this.noiseSrc(t, dur), f = filt('bandpass', 600 * pitch, 2.5), e = g();
        f.frequency.setValueAtTime(400 * pitch, t);
        f.frequency.exponentialRampToValueAtTime(1800 * pitch, t + dur * 0.6);
        f.frequency.exponentialRampToValueAtTime(500 * pitch, t + dur);
        this.env(e, t, dur * 0.5, 0.35, dur);
        n.connect(f).connect(e).connect(o);
        break;
      }
      case 'thud': case 'thump': {
        dur = 0.25;
        const s = osc('sine', 120 * pitch), e = g();
        s.frequency.exponentialRampToValueAtTime(45 * pitch, t + 0.2);
        this.env(e, t, 0.005, name === 'thud' ? 0.9 : 0.5, dur);
        s.connect(e).connect(o); s.start(t); s.stop(t + dur);
        const n = this.noiseSrc(t, 0.12), f = filt('lowpass', 900 * pitch), e2 = g();
        this.env(e2, t, 0.003, 0.5, 0.12);
        n.connect(f).connect(e2).connect(o);
        break;
      }
      case 'slash': case 'stab': {
        dur = 0.22;
        const n = this.noiseSrc(t, dur), f = filt('highpass', 2200 * pitch), e = g();
        this.env(e, t, 0.004, 0.45, 0.14);
        n.connect(f).connect(e).connect(o);
        const s = osc('sine', 150 * pitch), e2 = g();
        s.frequency.exponentialRampToValueAtTime(60, t + 0.15);
        this.env(e2, t, 0.004, 0.7, 0.2);
        s.connect(e2).connect(o); s.start(t); s.stop(t + dur);
        break;
      }
      case 'clang': {
        dur = 0.6;
        for (const [f0, a] of [[520, 0.3], [1340, 0.22], [2210, 0.15], [3300, 0.1]]) {
          const s = osc('sine', f0 * pitch * rand(0.97, 1.03)), e = g();
          this.env(e, t, 0.002, a, dur * rand(0.5, 1));
          s.connect(e).connect(o); s.start(t); s.stop(t + dur);
        }
        break;
      }
      case 'block': {
        dur = 0.2;
        const s = osc('triangle', 230 * pitch), e = g();
        this.env(e, t, 0.002, 0.6, dur);
        s.connect(e).connect(o); s.start(t); s.stop(t + dur);
        break;
      }
      case 'bow': {
        dur = 0.3;
        const s = osc('sawtooth', 110 * pitch), f = filt('lowpass', 2500), e = g();
        f.frequency.exponentialRampToValueAtTime(300, t + 0.2);
        this.env(e, t, 0.003, 0.4, 0.25);
        s.connect(f).connect(e).connect(o); s.start(t); s.stop(t + dur);
        const n = this.noiseSrc(t, 0.3), f2 = filt('bandpass', 3000, 3), e2 = g();
        this.env(e2, t + 0.02, 0.05, 0.25, 0.28);
        n.connect(f2).connect(e2).connect(o);
        break;
      }
      case 'fire': {
        dur = 0.6;
        const n = this.noiseSrc(t, dur), f = filt('lowpass', 900), e = g();
        f.frequency.exponentialRampToValueAtTime(300, t + dur);
        this.env(e, t, 0.08, 0.6, dur);
        n.connect(f).connect(e).connect(o);
        break;
      }
      case 'boom': {
        dur = 1.6;
        const n = this.noiseSrc(t, dur, 0.6), f = filt('lowpass', 1400), e = g();
        f.frequency.exponentialRampToValueAtTime(70, t + 1.2);
        this.env(e, t, 0.005, 1.4, dur);
        n.connect(f).connect(e).connect(o);
        const s = osc('sine', 70 * pitch), e2 = g();
        s.frequency.exponentialRampToValueAtTime(30, t + 0.8);
        this.env(e2, t, 0.005, 1.2, 1.0);
        s.connect(e2).connect(o); s.start(t); s.stop(t + 1.0);
        break;
      }
      case 'pop': {
        dur = 0.4;
        const s = osc('sine', 300 * pitch), e = g();
        s.frequency.exponentialRampToValueAtTime(1200 * pitch, t + 0.1);
        this.env(e, t, 0.004, 0.6, 0.2);
        s.connect(e).connect(o); s.start(t); s.stop(t + 0.25);
        const n = this.noiseSrc(t, 0.4), f = filt('bandpass', 1500, 1), e2 = g();
        this.env(e2, t, 0.01, 0.7, 0.4);
        n.connect(f).connect(e2).connect(o);
        break;
      }
      case 'heal': {
        dur = 0.9;
        [523, 659, 784, 1047].forEach((fr, i) => {
          const s = osc('sine', fr * pitch), e = g();
          this.env(e, t + i * 0.07, 0.01, 0.18, 0.5);
          s.connect(e).connect(o); s.start(t + i * 0.07); s.stop(t + i * 0.07 + 0.55);
        });
        break;
      }
      case 'lute': {
        dur = 1.0;
        const b = this.pluck(196 * pitch);
        const s = c.createBufferSource(); s.buffer = b;
        const e = g(); e.gain.value = 0.6;
        s.connect(e).connect(o); s.start(t);
        break;
      }
      case 'click': {
        dur = 0.08;
        const s = osc('square', 900 * pitch), e = g();
        this.env(e, t, 0.002, 0.2, 0.06);
        s.connect(e).connect(o); s.start(t); s.stop(t + dur);
        break;
      }
      case 'place': {
        dur = 0.15;
        const s = osc('sine', 340 * pitch), e = g();
        s.frequency.exponentialRampToValueAtTime(520 * pitch, t + 0.08);
        this.env(e, t, 0.003, 0.35, 0.14);
        s.connect(e).connect(o); s.start(t); s.stop(t + dur);
        break;
      }
      case 'remove': {
        dur = 0.15;
        const s = osc('sine', 520 * pitch), e = g();
        s.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.1);
        this.env(e, t, 0.003, 0.3, 0.14);
        s.connect(e).connect(o); s.start(t); s.stop(t + dur);
        break;
      }
      case 'horn': {
        dur = 1.8;
        for (const [fr, st] of [[220, 0], [277, 0.35], [330, 0.7]]) {
          const s = osc('sawtooth', fr), f = filt('lowpass', 900), e = g();
          this.env(e, t + st, 0.06, 0.25, 1.1);
          s.connect(f).connect(e).connect(o); s.start(t + st); s.stop(t + st + 1.15);
        }
        break;
      }
      case 'fanfare': {
        dur = 2.2;
        [[392, 0, 0.18], [392, 0.2, 0.18], [392, 0.4, 0.18], [523, 0.6, 0.9], [659, 0.6, 0.9], [784, 0.6, 1.2]].forEach(([fr, st, d]) => {
          const s = osc('sawtooth', fr), f = filt('lowpass', 2000), e = g();
          this.env(e, t + st, 0.02, 0.18, d);
          s.connect(f).connect(e).connect(o); s.start(t + st); s.stop(t + st + d + 0.05);
        });
        break;
      }
    }
    this.track(o, dur);
  }

  pluck(freq) {
    const key = Math.round(freq);
    let b = this.pluckCache.get(key);
    if (b) return b;
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 1.0);
    b = this.ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const N = Math.max(2, Math.floor(sr / freq));
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) buf[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const nx = (idx + 1) % N;
      const v = (buf[idx] + buf[nx]) * 0.498;
      d[i] = buf[idx];
      buf[idx] = v;
      idx = nx;
    }
    this.pluckCache.set(key, b);
    return b;
  }

  // kind index (see KIND), pitch multiplier, cry type index
  voice(pos, kindIdx, pitchMul, cryIdx) {
    const { gain, pan } = this.spatial(pos, 0.9 * this.voiceVol);
    if (!this.canPlay(gain)) return;
    const c = this.ctx, t0 = c.currentTime + 0.005;
    const o = this.out(gain, pan);
    const kind = KIND[kindIdx] || 'idle';
    const base = 150 * pitchMul;
    let syl;
    switch (kind) {
      case 'cry': syl = CRIES[cryIdx] || CRIES[5]; break;
      case 'attack': syl = [[pick(['a', 'u', 'e']), 0.16, 1.15, 0.95]]; break;
      case 'hurt': syl = [[pick(['u', 'o']), 0.18, 1.3, 1.0]]; break;
      case 'die': syl = [['a', 0.25, 1.4, 1.2], ['u', 0.55, 1.2, 0.55]]; break;
      case 'scream': syl = [['a', 0.6, 2.0, 1.9]]; break;
      case 'sing': syl = [['a', 0.18, 1.0, 1.0], ['a', 0.18, 1.26, 1.26], ['o', 0.3, 1.5, 1.5]]; break;
      case 'cheer': syl = [['e', 0.15, 1.2, 1.3], ['a', 0.4, 1.4, 1.7]]; break;
      default: syl = [[pick(['u', 'e', 'o', 'a']), rand(0.1, 0.2), rand(0.95, 1.1), rand(0.9, 1.2)]];
    }
    let t = t0;
    const roar = cryIdx === 1 && (kind === 'cry' || kind === 'attack');
    for (const [v, d, p0, p1] of syl) {
      const s = c.createOscillator();
      s.type = 'sawtooth';
      s.frequency.setValueAtTime(base * p0, t);
      s.frequency.exponentialRampToValueAtTime(base * p1, t + d);
      if (kind === 'scream' || kind === 'magic') {
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 9; lg.gain.value = base * 0.08;
        lfo.connect(lg).connect(s.frequency); lfo.start(t); lfo.stop(t + d + 0.05);
      }
      const [f1, f2] = VOWELS[v];
      const b1 = c.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = f1; b1.Q.value = 6;
      const b2 = c.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = f2; b2.Q.value = 8;
      const e = c.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
      e.gain.setValueAtTime(0.9, t + d * 0.7);
      e.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(b1).connect(e);
      s.connect(b2).connect(e);
      e.connect(o);
      s.start(t); s.stop(t + d + 0.02);
      if (roar) {
        const n = this.noiseSrc(t, d), f = c.createBiquadFilter(), ng = c.createGain();
        f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 1.5;
        this.env(ng, t, 0.04, 0.4, d);
        n.connect(f).connect(ng).connect(o);
      }
      t += d + 0.03;
    }
    this.track(o, t - t0);
  }

  // ------------------------------------------------------------------ music
  // A tiny sequencer: 'setup' (pizzicato march) and 'battle' (drums + brass ostinato)
  startMusic(mode, force) {
    if (this.musicMode === mode && !force) return;
    this.musicMode = mode;
    if (!this.ctx) return;
    if (this.music) { clearInterval(this.music.timer); this.music.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); }
    if (!mode) { this.music = null; return; }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.5);
    gain.connect(this.musicBus);
    const m = { gain, step: 0, next: this.ctx.currentTime + 0.1, mode };
    const tempo = mode === 'battle' ? 0.16 : mode === 'title' ? 0.24 : 0.2;
    m.timer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') { m.next = this.ctx ? this.ctx.currentTime + 0.1 : 0; return; }
      while (m.next < this.ctx.currentTime + 0.25) {
        this.musicStep(m, m.next, tempo);
        m.next += tempo;
        m.step++;
      }
    }, 60);
    this.music = m;
  }

  musicStep(m, t, beat) {
    const c = this.ctx;
    const s = m.step;
    // D minor-ish progression for battle, F major for setup/title
    const battle = m.mode === 'battle';
    const prog = battle ? [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]] : [[53, 57, 60], [58, 62, 65], [55, 58, 62], [48, 52, 55]];
    const bar = Math.floor(s / 8) % 4;
    const chord = prog[bar];
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const note = (n, dur, type, vol, cutoff = 2000, at = t) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = hz(n);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
      const e = c.createGain();
      e.gain.setValueAtTime(0.0001, at);
      e.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      e.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(f).connect(e).connect(m.gain);
      o.start(at); o.stop(at + dur + 0.02);
    };
    const drum = (f0, dur, vol, noise) => {
      if (noise) {
        const n = this.noiseSrc(t, dur), f = c.createBiquadFilter(), e = c.createGain();
        f.type = 'highpass'; f.frequency.value = 3000;
        this.env(e, t, 0.002, vol, dur);
        n.connect(f).connect(e).connect(m.gain);
      } else {
        const o = c.createOscillator(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + dur);
        const e = c.createGain(); this.env(e, t, 0.003, vol, dur);
        o.connect(e).connect(m.gain); o.start(t); o.stop(t + dur);
      }
    };
    const i = s % 8;
    // bass
    if (i % 2 === 0) note(chord[0] - 12, beat * 1.8, 'triangle', 0.22, 800);
    if (battle) {
      if (i % 4 === 0) drum(110, 0.3, 0.5);
      if (i % 4 === 2) drum(220, 0.15, 0.25);
      drum(0, 0.04, 0.05, true);
      // brass ostinato
      const pat = [0, 2, 1, 2, 0, 2, 1, 0];
      note(chord[pat[i]] + 12, beat * 0.9, 'sawtooth', 0.05, 1600);
      if (i === 0) for (const n of chord) note(n, beat * 7, 'sawtooth', 0.03, 900);
    } else {
      // pizzicato arpeggio + flute-ish melody
      const arp = [0, 1, 2, 1, 0, 1, 2, 1];
      note(chord[arp[i]] + 12, beat * 0.6, 'triangle', 0.08, 2400);
      const mel = [[72, 74, 76, 74, 72, -1, 69, -1], [74, 77, 76, 74, 72, -1, 70, -1], [72, 70, 69, 70, 72, -1, 74, -1], [72, -1, 71, -1, 72, -1, -1, -1]][bar];
      if (mel[i] > 0 && Math.floor(s / 32) % 2 === 1) note(mel[i], beat * 0.95, 'sine', 0.07, 3000);
      if (i % 4 === 0) drum(150, 0.12, 0.12);
    }
  }
}
