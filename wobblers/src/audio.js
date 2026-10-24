// Synthesized sound (no audio files): cute SFX, positional by the nearest
// camera, per-vehicle engines, ride sounds, ambience (birds, waves, the fun
// park crowd and organ, crickets at night) and the procedural music in
// music.js. Muted (and the context suspended) while the tab is hidden or
// unfocused. Every entry point is safe when WebAudio is unavailable.
import { Music } from './music.js';
import { settings } from './settings.js';
import { heightAt } from './terrain.js';

const PARK = { x: -242, z: 0 }, CAROUSEL = { x: -228, z: -28 }, FOUNTAIN = { x: 0, z: 0 };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// Calliope waltz for the fun park (scale steps over C major, 3/4).
const ORGAN = [
  [72, 2], [76, 1], [79, 2], [76, 1], [74, 2], [77, 1], [81, 2], [77, 1],
  [76, 2], [79, 1], [84, 2], [79, 1], [74, 3], [71, 3],
  [72, 2], [76, 1], [79, 2], [81, 1], [79, 2], [77, 1], [76, 2], [74, 1],
  [72, 1], [74, 1], [76, 1], [79, 2], [74, 1], [72, 6],
];
const ORGAN_BASS = [48, 55, 55, 50, 57, 57, 52, 55, 55, 55, 50, 50, 48, 55, 55, 53, 57, 57, 55, 50, 50, 48, 48, 48];

export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.engines = new Map();
    this.track = new Map();     // per-player tracked state (steps, seats, hands)
    this.cool = {};             // per-sound cooldowns
    this.amb = null;
    this.ambT = 0;
    this.nextBird = 0; this.nextCricket = 0; this.nextCheer = 0;
    this.organ = { i: 0, t: 0, bar: 0 };
    const resume = () => this.start();
    for (const ev of ['keydown', 'mousedown', 'pointerdown', 'touchstart', 'click']) addEventListener(ev, resume);
    document.addEventListener('visibilitychange', () => this.applyMute());
    addEventListener('blur', () => this.applyMute());
    addEventListener('focus', () => this.applyMute());
  }

  get volume() { return 1; }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.audible()) this.ctx.resume?.().catch?.(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain();
      this.master.gain.value = this.audible() ? 1 : 0;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = settings.sfx;
      this.musicBus = c.createGain(); this.musicBus.gain.value = settings.music * 0.7;
      this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 20000;
      this.musicBus.connect(this.musicLP); this.musicLP.connect(this.master);
      this.sfx.connect(this.master);
      this.ambBus = c.createGain(); this.ambBus.gain.value = 0.9; this.ambBus.connect(this.sfx);
      // shared small-room reverb send
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.impulse(1.6);
      this.reverbIn = c.createGain(); this.reverbIn.gain.value = 0.18;
      const rvOut = c.createGain(); rvOut.gain.value = 0.6;
      this.reverbIn.connect(this.reverb); this.reverb.connect(rvOut); rvOut.connect(this.musicLP);
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.music = new Music(this, this.musicBus);
      this.buildAmbience();
      this.applyMute();
    } catch (e) { console.warn('audio unavailable', e); this.ctx = null; }
  }

  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    return b;
  }

  audible() { return !document.hidden && document.hasFocus(); }

  applyMute() {
    if (!this.ctx) return;
    try {
      const on = this.audible();
      this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
      if (!on) this.ctx.suspend?.().catch?.(() => {});
      else this.ctx.resume?.().catch?.(() => {});
    } catch (e) { /* ignore */ }
  }

  setVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.music * 0.7, t, 0.05);
  }

  running() { return this.ctx && this.ctx.state === 'running'; }

  // ---- listeners ------------------------------------------------------------
  cameras() {
    const out = [];
    for (const p of this.game.players) if (p.camera?.cam) out.push(p.camera.cam);
    if (!out.length && this.game.idleCam) out.push(this.game.idleCam);
    return out;
  }

  // Volume falloff and stereo pan from the nearest camera.
  spatial(pos, range = 45) {
    if (!pos) return { v: 1, pan: 0 };
    let best = 1e9, bc = null;
    for (const cam of this.cameras()) {
      const c = cam.position;
      const d = Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z);
      if (d < best) { best = d; bc = cam; }
    }
    if (!bc) return { v: 0.5, pan: 0 };
    const v = Math.max(0, 1 - best / range) ** 1.5;
    let pan = 0;
    if (best > 0.5) {
      const e = bc.matrixWorld.elements; // column 0 = camera right
      const dx = (pos.x - bc.position.x) / best, dy = (pos.y - bc.position.y) / best, dz = (pos.z - bc.position.z) / best;
      pan = clamp(dx * e[0] + dy * e[1] + dz * e[2], -1, 1) * (this.game.players.length > 1 ? 0.35 : 0.75);
    }
    return { v, pan };
  }
  gainAt(pos) { return this.spatial(pos).v; }

  // An output node for one sound: gain (volume) -> panner -> sfx bus.
  outNode(vol, pan = 0, reverb = 0) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = vol;
    let tail = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    tail.connect(this.sfx);
    if (reverb) { const r = c.createGain(); r.gain.value = reverb; tail.connect(r); r.connect(this.reverbIn); }
    return g;
  }

  // ---- primitives -----------------------------------------------------------
  tone(type, f0, f1, dur, vol, when = 0, out = this.sfx, attack = 0.008) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  burst(dur, vol, freq = 800, q = 1, type = 'lowpass', when = 0, out = this.sfx, f1 = null) {
    const c = this.ctx, t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  // Wobbly cartoon voice: a buzzy source through two vowel formants.
  voice(f0, f1, dur, vol, out, vowel = 'u', when = 0) {
    const c = this.ctx, t = c.currentTime + when;
    const F = { u: [350, 800], a: [800, 1250], o: [500, 900], e: [450, 1900], i: [320, 2400] }[vowel];
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 18; vg.gain.value = f0 * 0.04;
    vib.connect(vg); vg.connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [fq, q, gv] of [[F[0], 6, 1], [F[1], 9, 0.5]]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq * (f0 > 300 ? 1.15 : 1); bp.Q.value = q;
      const bg = c.createGain(); bg.gain.value = gv * 2.5;
      o.connect(bp); bp.connect(bg); bg.connect(g);
    }
    g.connect(out);
    o.start(t); vib.start(t); o.stop(t + dur + 0.03); vib.stop(t + dur + 0.03);
  }

  // Voice pitch of whichever player is at a position (each player has their own).
  voicePitch(pos) {
    let best = 1e9, pi = -1;
    if (pos) for (const p of this.game.players) {
      const c = p.chest.translation();
      const d = Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z);
      if (d < best) { best = d; pi = p.index; }
    }
    const base = pi >= 0 && best < 2.5 ? [330, 280, 390, 250, 360, 300, 420, 270][pi % 8] : 320;
    return base * (0.94 + Math.random() * 0.12);
  }

  cooled(name, sec) {
    const t = performance.now() / 1000;
    if ((this.cool[name] || 0) > t) return false;
    this.cool[name] = t + sec;
    return true;
  }

  // ---- one-shot sounds --------------------------------------------------------
  play(name, pos, strength = 1, extra = {}) {
    if (!this.running()) return;
    try { this.playInner(name, pos, strength, extra); } catch (e) { /* never let a sound break the game */ }
  }

  playInner(name, pos, strength, extra) {
    const ui = name.startsWith('ui') || name === 'join' || name === 'leave';
    const sp = ui ? { v: 1, pan: 0 } : this.spatial(pos);
    const v = sp.v * strength;
    if (v < 0.02) return;
    const out = this.outNode(1, sp.pan, ui ? 0 : 0.6);
    const r = Math.random;
    switch (name) {
      case 'jump': {
        const f = this.voicePitch(pos);
        this.voice(f, f * 1.35, 0.13, 0.22 * v, out, pick(['u', 'o', 'a']));
        this.burst(0.12, 0.05 * v, 900, 1, 'bandpass', 0, out, 2600);
        break;
      }
      case 'grab': this.tone('sine', 900 + r() * 200, 1500, 0.06, 0.12 * v, 0, out); this.burst(0.04, 0.08 * v, 3000, 2, 'bandpass', 0, out); break;
      case 'release': this.tone('sine', 1100, 600, 0.07, 0.08 * v, 0, out); break;
      case 'swish': this.burst(0.16, 0.12 * v, 700, 2, 'bandpass', 0, out, 3500); break;
      case 'punch':
        this.burst(0.05, 0.5 * v, 2500, 0.8, 'lowpass', 0, out);
        this.tone('sine', 180, 55, 0.16, 0.45 * v, 0, out);
        this.tone('triangle', 520, 260, 0.09, 0.12 * v, 0.01, out);
        if (r() < 0.6) { const f = this.voicePitch(pos) * 1.1; this.voice(f, f * 0.7, 0.14, 0.12 * v, out, 'o', 0.03); }
        break;
      case 'ko': {
        // bonk, slide whistle down, a dizzy "ooof" and twinkly stars
        this.tone('square', 1500, 1400, 0.04, 0.05 * v, 0, out);
        this.tone('sine', 660, 640, 0.25, 0.25 * v, 0, out);
        this.tone('sine', 1320, 1240, 0.18, 0.1 * v, 0, out);
        const c = this.ctx, t = c.currentTime + 0.08;
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.7);
        lfo.frequency.value = 7; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * v, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
        o.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 0.8); lfo.stop(t + 0.8);
        const f = this.voicePitch(pos);
        this.voice(f * 1.1, f * 0.6, 0.45, 0.16 * v, out, 'u', 0.15);
        for (let i = 0; i < 4; i++) this.tone('sine', 2200 + i * 330, 2600 + i * 330, 0.12, 0.05 * v, 0.6 + i * 0.12, out);
        break;
      }
      case 'thud': {
        const k = clamp(strength, 0, 1.5);
        this.burst(0.1 + 0.08 * r(), Math.min(0.45, 0.3 * v), 260 + r() * 260, 1, 'lowpass', 0, out);
        if (k > 0.6) this.tone('sine', 120 + r() * 40, 50, 0.14, 0.25 * v, 0, out);
        break;
      }
      case 'step': {
        const wet = extra.wet;
        if (wet) this.burst(0.12, 0.12 * v, 1400 + r() * 600, 1.5, 'bandpass', 0, out, 600);
        else {
          this.burst(0.05, 0.12 * v, 500 + r() * 400, 1.2, 'lowpass', 0, out);
          this.tone('sine', 230 + r() * 60, 120, 0.05, 0.08 * v, 0, out, 0.003);
        }
        break;
      }
      case 'land': this.burst(0.12, 0.22 * v, 380, 1, 'lowpass', 0, out); this.tone('sine', 160, 70, 0.12, 0.2 * v, 0, out); break;
      case 'seat': this.tone('sine', 300, 180, 0.12, 0.14 * v, 0, out); this.burst(0.08, 0.06 * v, 600, 1, 'lowpass', 0, out); break;
      case 'splash': {
        const k = clamp(strength, 0.3, 1.5);
        this.burst(0.5 * k + 0.2, 0.38 * v, 2400, 0.6, 'lowpass', 0, out, 500);
        this.burst(0.25, 0.2 * v, 5000, 1, 'highpass', 0.02, out);
        for (let i = 0; i < 6; i++) this.tone('sine', 500 + r() * 700, 1200 + r() * 1200, 0.05, 0.05 * v, 0.1 + r() * 0.5, out);
        break;
      }
      case 'boing': {
        const c = this.ctx, t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.38);
        lfo.frequency.setValueAtTime(22, t); lfo.frequency.linearRampToValueAtTime(9, t + 0.4); lg.gain.value = 60;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
        break;
      }
      case 'horn': this.horn(pos, v, out); break;
      case 'door': {
        // creak (a slow, irregular rasp) then a clunk
        const c = this.ctx, t = c.currentTime;
        const o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(28, t); o.frequency.linearRampToValueAtTime(55, t + 0.2); o.frequency.linearRampToValueAtTime(38, t + 0.32);
        bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1500, t + 0.3); bp.Q.value = 8;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * v, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
        o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.36);
        if (extra.slam !== false) {
          this.burst(0.09, 0.3 * v, 350, 1, 'lowpass', 0.36, out);
          this.tone('square', 95, 60, 0.07, 0.07 * v, 0.36, out);
        }
        break;
      }
      case 'clunk': this.burst(0.06, 0.2 * v, 900, 2, 'bandpass', 0, out); this.tone('triangle', 420, 380, 0.05, 0.08 * v, 0, out); break;
      case 'wheee': { const f = this.voicePitch(pos); this.voice(f * 1.1, f * 1.9, 0.7, 0.16 * v, out, 'i'); break; }
      case 'creak': {
        const c = this.ctx, t = c.currentTime;
        const o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(30 + r() * 15, t); o.frequency.linearRampToValueAtTime(22, t + 0.4);
        bp.type = 'bandpass'; bp.frequency.value = 700 + r() * 500; bp.Q.value = 10;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1 * v, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.5);
        break;
      }
      case 'clack': this.burst(0.03, 0.18 * v, 1800, 3, 'bandpass', 0, out); this.tone('square', 240, 200, 0.03, 0.03 * v, 0, out); break;
      case 'pop': this.tone('sine', 900, 1800, 0.08, 0.15 * v, 0, out); break;
      // ---- life sim (src/life/): coins, shop tills, pets
      case 'coin': { const f = 1320 * (1 + (extra.pitch || 0) * 0.06); this.tone('square', f, f, 0.05, 0.05 * v, 0, out, 0.002); this.tone('square', f * 1.335, f * 1.335, 0.16, 0.05 * v, 0.05, out, 0.002); break; }
      case 'coinBig': [1047, 1319, 1568, 2093].forEach((f, i) => { this.tone('square', f, f, 0.09, 0.045 * v, i * 0.05, out, 0.002); this.tone('sine', f * 2, f * 2, 0.12, 0.03 * v, i * 0.05, out); }); break;
      case 'buy': this.burst(0.05, 0.12 * v, 2500, 2, 'bandpass', 0, out); [1568, 2093].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.09 * v, 0.06 + i * 0.08, out, 0.002)); this.tone('sine', 220, 110, 0.12, 0.12 * v, 0, out); break;
      case 'nope': this.tone('square', 220, 200, 0.12, 0.05 * v, 0, out); this.tone('square', 180, 160, 0.16, 0.05 * v, 0.13, out); break;
      case 'bark': { const k = extra.pitch || 1; for (let i = 0; i < (extra.n || 1); i++) { this.voice(420 * k, 300 * k, 0.11, 0.2 * v, out, 'a', i * 0.18); this.burst(0.06, 0.06 * v, 900 * k, 1.5, 'bandpass', i * 0.18, out); } break; }
      case 'meow': { const k = extra.pitch || 1; this.voice(520 * k, 700 * k, 0.14, 0.14 * v, out, 'i'); this.voice(700 * k, 430 * k, 0.32, 0.14 * v, out, 'o', 0.12); break; }
      case 'squeak': { const k = extra.pitch || 1; this.tone('sine', 1500 * k, 2300 * k, 0.07, 0.1 * v, 0, out); this.tone('sine', 2100 * k, 1700 * k, 0.07, 0.08 * v, 0.08, out); break; }
      case 'quack': { const k = extra.pitch || 1; this.voice(330 * k, 260 * k, 0.16, 0.18 * v, out, 'a'); this.voice(360 * k, 280 * k, 0.12, 0.14 * v, out, 'a', 0.2); break; }
      case 'snore': this.voice(110, 90, 0.9, 0.12 * v, out, 'o'); this.burst(0.8, 0.04 * v, 400, 1, 'lowpass', 0.1, out); break;
      case 'join': [523, 659, 784, 1047].forEach((f, i) => { this.tone('triangle', f, f, 0.16, 0.12, i * 0.07, out); this.tone('sine', f * 2, f * 2, 0.1, 0.03, i * 0.07, out); }); break;
      case 'leave': [784, 659, 523].forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.1, i * 0.07, out)); break;
      case 'uiMove': this.tone('sine', 1250, 1350, 0.04, 0.07, 0, out, 0.002); break;
      case 'uiChange': this.tone('triangle', 900 + (extra.dir > 0 ? 150 : 0), 1000 + (extra.dir > 0 ? 150 : 0), 0.05, 0.08, 0, out, 0.002); break;
      case 'uiSelect': this.tone('triangle', 700, 1400, 0.09, 0.11, 0, out); this.tone('sine', 1400, 2100, 0.08, 0.05, 0.05, out); break;
      case 'uiBack': this.tone('triangle', 900, 450, 0.1, 0.1, 0, out); break;
      case 'uiOpen': [660, 880].forEach((f, i) => this.tone('triangle', f, f * 1.05, 0.08, 0.09, i * 0.05, out)); break;
      case 'toast': this.tone('sine', 1500, 1500, 0.06, 0.05, 0, out); this.tone('sine', 2000, 2000, 0.08, 0.04, 0.06, out); break;
    }
  }

  vehicleNear(pos, d = 4) {
    let best = null, bd = d;
    for (const veh of this.game.vehicles) {
      const t = veh.body.translation();
      const dd = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z);
      if (dd < bd) { bd = dd; best = veh; }
    }
    return best;
  }

  horn(pos, v, out) {
    const veh = pos ? this.vehicleNear(pos) : null;
    const type = veh?.def?.horn || veh?.type || 'car';
    if (veh?.opts?.icecream) {
      // ice-cream van chimes
      [76, 79, 84, 83, 79, 81, 76].forEach((m, i) => {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        this.tone('sine', f, f, 0.22, 0.12 * v, i * 0.13, out); this.tone('sine', f * 2.76, f * 2.76, 0.12, 0.03 * v, i * 0.13, out);
      });
      return;
    }
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.connect(out);
    if (type === 'heli') {
      lp.frequency.value = 2000;
      this.tone('triangle', 1200, 1200, 0.1, 0.06 * v, 0, lp); this.tone('triangle', 1200, 1200, 0.1, 0.06 * v, 0.18, lp);
    } else if (type === 'kart' || type === 'quad') {
      lp.frequency.value = 3000;
      for (const w of [0, 0.16]) { this.tone('square', 740, 720, 0.12, 0.07 * v, w, lp); }
    } else if (type === 'bumper') {
      lp.frequency.value = 2500;
      this.tone('square', 880, 880, 0.08, 0.06 * v, 0, lp); this.tone('square', 660, 660, 0.12, 0.06 * v, 0.09, lp);
    } else if (type === 'boat') {
      lp.frequency.value = 900;
      this.tone('sawtooth', 160, 155, 0.9, 0.12 * v, 0, lp, 0.05); this.tone('sawtooth', 240, 236, 0.9, 0.06 * v, 0, lp, 0.05);
    } else {
      const deep = type === 'van' || type === 'pickup' || type === 'truck', huge = type === 'bus' || type === 'tractor';
      lp.frequency.value = huge ? 1200 : 1800;
      const a = huge ? 233 : deep ? 311 : type === 'sports' ? 466 : 415, b = huge ? 277 : deep ? 392 : type === 'sports' ? 622 : 523;
      this.tone('square', a, a, 0.32, 0.07 * v, 0, lp, 0.01); this.tone('square', b, b, 0.32, 0.055 * v, 0, lp, 0.01);
    }
  }

  // ---- per-frame update (called by the game loop) -----------------------------
  updateEngines(vehicles) {
    if (!this.running()) return;
    try {
      this.updateMusic();
      this.updatePlayers();
      this.updateEngineLoops(vehicles);
      this.updateAmbience();
    } catch (e) { /* keep the game running even if a sound misbehaves */ }
  }

  isNight() {
    const g = this.game;
    if (typeof g.isNight === 'function') return !!g.isNight();
    if (typeof g.isNight === 'boolean') return g.isNight;
    const t = g.timeOfDay;
    if (typeof t === 'number' && isFinite(t)) {
      if (t > 1.0001) { const h = t % 24; return h < 6 || h >= 20; }
      return t < 0.25 || t > 0.83;
    }
    return false;
  }

  updateMusic() {
    this.music.setStyle(this.isNight() ? 'night' : 'day');
    this.music.update();
    // muffle the music while the game is paused
    const t = this.ctx.currentTime, paused = !!this.game.paused;
    this.musicLP.frequency.setTargetAtTime(paused ? 900 : 20000, t, 0.15);
  }

  updatePlayers() {
    const g = this.game;
    const seen = new Set();
    for (const p of g.players) {
      seen.add(p);
      let s = this.track.get(p);
      const cp = p.chest.translation();
      if (!s) { s = { k: Math.floor(p.phase / Math.PI), grounded: p.grounded, seat: p.seat, hands: {}, rideT: 0, vy: 0, wheee: 0 }; this.track.set(p, s); }
      // footsteps (two per gait cycle)
      const k = Math.floor(p.phase / Math.PI);
      if (k !== s.k && p.grounded && p.state === 'normal' && !p.seat && !p.swimming) {
        const v = p.chest.linvel(), sp = Math.hypot(v.x, v.z);
        if (sp > 0.6) {
          const wl = g.physics.waterLevel?.(cp.x, cp.y, cp.z);
          const wet = wl != null && cp.y - 0.6 < wl;
          this.play('step', { x: cp.x, y: cp.y - 0.7, z: cp.z }, clamp(0.45 + sp * 0.08, 0, 1), { wet });
        }
      }
      s.k = k;
      // landings
      if (p.grounded && !s.grounded && !p.seat && (p.airTime || 0) > 0.45 && p.state === 'normal') this.play('land', cp, clamp(p.airTime, 0.4, 1));
      s.grounded = p.grounded;
      // hands letting go
      for (const h of ['L', 'R']) {
        const j = !!p.hands?.[h]?.joint;
        if (s.hands[h] && !j && p.state !== 'seated') this.play('release', cp, 0.7);
        s.hands[h] = j;
      }
      // seats: doors for cars with cabins, lap-bar clunks for rides
      if (p.seat !== s.seat) {
        const now = p.seat || s.seat;
        const veh = now?.vehicle;
        if (veh?.def?.cabin) this.play('door', cp, 1, { slam: true });
        else if (veh) this.play('clunk', cp, 0.6);
        else if (now && now.label && now.label !== 'Sit') this.play('clunk', cp, 0.8);
        s.seat = p.seat; s.rideT = 0;
      }
      if (p.seat && !p.seat.vehicle) this.rideSounds(p, s, cp);
    }
    for (const p of this.track.keys()) if (!seen.has(p)) this.track.delete(p);
  }

  rideSounds(p, s, cp) {
    const v = p.chest.linvel(), sp = Math.hypot(v.x, v.y, v.z);
    const lbl = p.seat.label || '';
    const dt = 1 / 60;
    s.rideT += dt;
    s.wheee -= dt;
    if (lbl === 'Ride coaster') {
      // clackety track: rate grows with speed
      s.clack = (s.clack || 0) + dt * (2 + sp * 1.4);
      if (s.clack > 1 && sp > 0.8) { s.clack = 0; this.play('clack', cp, 0.7); }
      if (sp > 9 && s.wheee <= 0) { this.play('wheee', cp); s.wheee = 4; }
    } else if (lbl === 'Drop tower') {
      if (v.y < -7 && s.wheee <= 0) { this.play('wheee', cp); s.wheee = 5; }
    } else if (lbl === 'Swing' || lbl === 'Swing ride' || lbl === 'See-saw') {
      const sign = Math.sign(v.y);
      if (sign !== s.vy && Math.abs(v.y) > 0.3 && s.rideT > 0.4) { if (sp > 1) this.play('creak', cp, 0.7); s.vy = sign; }
      if (lbl === 'Swing ride' && sp > 7 && s.wheee <= 0) { this.play('wheee', cp); s.wheee = 6; }
    } else if (s.rideT > 2.8) {
      s.rideT = 0;
      if (sp > 0.3) this.play('creak', cp, 0.5);
    }
  }

  // Continuous engine sounds, voiced per vehicle size.
  updateEngineLoops(vehicles) {
    const c = this.ctx, t = c.currentTime;
    const live = new Set();
    for (const veh of vehicles) {
      if (!veh.driver || !veh.driver()) continue;
      const p = veh.body.translation();
      const sp = this.spatial(p, 60);
      live.add(veh);
      let e = this.engines.get(veh);
      if (!e) { e = this.makeEngine(veh); this.engines.set(veh, e); }
      const rpm = veh.type === 'heli' ? clamp(veh.rpm || 0, 0, 1.2) : clamp(Math.abs(veh.speed || 0) / (veh.def.maxSpeed || 20), 0, 1.2);
      const thr = Math.abs(veh.throttle || 0);
      const V = e.voice;
      const f = V.base + rpm * V.base * V.range + thr * V.base * 0.25;
      e.o.frequency.setTargetAtTime(f, t, 0.06);
      e.o2.frequency.setTargetAtTime(f * V.ratio, t, 0.06);
      e.f.frequency.setTargetAtTime(V.lp + rpm * V.lp * 1.6 + thr * 400, t, 0.08);
      if (e.am) e.am.frequency.setTargetAtTime(V.am + rpm * V.am * 0.8, t, 0.1);
      e.g.gain.setTargetAtTime(V.vol * sp.v * (0.55 + thr * 0.5 + rpm * 0.2), t, 0.1);
      if (e.pan) e.pan.pan.setTargetAtTime(sp.pan, t, 0.1);
      if (e.wash) e.wash.gain.setTargetAtTime(0.08 * sp.v * rpm, t, 0.1);
    }
    for (const [veh, e] of this.engines) {
      if (live.has(veh)) continue;
      e.g.gain.setTargetAtTime(0, t, 0.08);
      for (const n of e.stops) n.stop(t + 0.6);
      this.engines.delete(veh);
    }
  }

  makeEngine(veh) {
    const c = this.ctx, type = veh.type;
    const VOICES = {
      car: { w1: 'sawtooth', w2: 'square', base: 42, range: 2.4, ratio: 0.5, lp: 380, vol: 0.09, am: 0 },
      pickup: { w1: 'sawtooth', w2: 'square', base: 34, range: 2.1, ratio: 0.5, lp: 320, vol: 0.1, am: 0 },
      van: { w1: 'sawtooth', w2: 'sawtooth', base: 31, range: 2.0, ratio: 0.501, lp: 300, vol: 0.1, am: 0 },
      kart: { w1: 'square', w2: 'sawtooth', base: 75, range: 2.8, ratio: 1.01, lp: 900, vol: 0.06, am: 18 },
      quad: { w1: 'square', w2: 'sawtooth', base: 58, range: 2.6, ratio: 0.5, lp: 700, vol: 0.07, am: 14 },
      bumper: { w1: 'triangle', w2: 'sine', base: 180, range: 1.6, ratio: 0.333, lp: 1400, vol: 0.045, am: 0 },
      boat: { w1: 'sawtooth', w2: 'square', base: 38, range: 1.8, ratio: 0.5, lp: 420, vol: 0.09, am: 9 },
      sports: { w1: 'sawtooth', w2: 'sawtooth', base: 48, range: 3.2, ratio: 0.5, lp: 600, vol: 0.09, am: 0 },
      bus: { w1: 'sawtooth', w2: 'square', base: 26, range: 1.7, ratio: 0.5, lp: 260, vol: 0.11, am: 0 },
      firetruck: { w1: 'sawtooth', w2: 'square', base: 28, range: 1.9, ratio: 0.5, lp: 280, vol: 0.11, am: 0 },
      tractor: { w1: 'square', w2: 'sawtooth', base: 24, range: 1.6, ratio: 0.5, lp: 360, vol: 0.1, am: 11 },
      scooter: { w1: 'square', w2: 'sawtooth', base: 90, range: 2.6, ratio: 1.01, lp: 1100, vol: 0.05, am: 22 },
      heli: { w1: 'sawtooth', w2: 'triangle', base: 30, range: 0.6, ratio: 2.0, lp: 500, vol: 0.12, am: 13 },
    };
    VOICES.police = VOICES.car;
    const V = VOICES[type] || VOICES.car;
    const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = V.w1; o2.type = V.w2; f.type = 'lowpass'; f.frequency.value = V.lp; f.Q.value = 2;
    g.gain.value = 0;
    const mix = c.createGain(); mix.gain.value = 1;
    o.connect(f); o2.connect(f); f.connect(mix);
    const e = { o, o2, f, g, voice: V, stops: [o, o2] };
    if (V.am) {
      // "brrrr" / "putt-putt": amplitude modulation
      const am = c.createOscillator(), ag = c.createGain();
      am.type = 'square'; am.frequency.value = V.am; ag.gain.value = 0.45; mix.gain.value = 0.55;
      am.connect(ag); ag.connect(mix.gain); am.start();
      e.am = am; e.stops.push(am);
    }
    mix.connect(g);
    let tail = g;
    if (c.createStereoPanner) { const pn = c.createStereoPanner(); g.connect(pn); tail = pn; e.pan = pn; }
    tail.connect(this.sfx);
    if (type === 'boat') {
      const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.7;
      const ng = c.createGain(); ng.gain.value = 0;
      n.connect(nf); nf.connect(ng); ng.connect(tail === g ? this.sfx : tail);
      n.start(); e.wash = ng; e.stops.push(n);
    }
    o.start(); o2.start();
    return e;
  }

  // ---- ambience -----------------------------------------------------------------
  loopNoise(type, freq, q) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.ambBus);
    s.start(0, Math.random() * 1.5);
    return { s, f, g };
  }

  buildAmbience() {
    this.amb = {
      waves: this.loopNoise('lowpass', 500, 0.6),
      surf: this.loopNoise('bandpass', 2400, 0.5),
      crowd: this.loopNoise('bandpass', 700, 1.2),
      wind: this.loopNoise('bandpass', 380, 0.8),
      fountain: this.loopNoise('bandpass', 3200, 0.9),
      w: { sea: 0, park: 0, organ: 0, fountain: 0, wind: 0 },
      swell: 0,
    };
  }

  updateAmbience() {
    const c = this.ctx, t = c.currentTime, A = this.amb;
    if (!A) return;
    const now = performance.now() / 1000;
    const cams = this.cameras();
    if (!cams.length) return;
    if (now - this.ambT > 0.25) {
      this.ambT = now;
      // weights: the strongest over all cameras
      const W = { sea: 0, park: 0, organ: 0, fountain: 0, wind: 0, lake: 0 };
      for (const cam of cams) {
        const p = cam.position;
        const r = Math.hypot(p.x, p.z * 0.95);
        let sea = smooth(250, 335, r);
        // near low ground by the coast
        if (sea > 0 && sea < 1) { const h = heightAt(p.x, p.z); sea *= smooth(12, 1, h); }
        W.sea = Math.max(W.sea, sea * smooth(40, 5, p.y));
        W.park = Math.max(W.park, smooth(150, 50, Math.hypot(p.x - PARK.x, p.z - PARK.z)));
        W.organ = Math.max(W.organ, smooth(90, 10, Math.hypot(p.x - CAROUSEL.x, p.z - CAROUSEL.z)));
        W.fountain = Math.max(W.fountain, smooth(22, 4, Math.hypot(p.x - FOUNTAIN.x, p.z - FOUNTAIN.z)));
        W.wind = Math.max(W.wind, smooth(15, 50, p.y));
      }
      A.w = W;
      const night = this.isNight();
      A.night = night;
      // waves swell
      A.swell = (A.swell + 0.25) % 6.5;
      const sw = 0.55 + 0.45 * Math.sin(A.swell / 6.5 * Math.PI * 2);
      A.waves.g.gain.setTargetAtTime(0.3 * W.sea * sw, t, 0.6);
      A.surf.g.gain.setTargetAtTime(0.06 * W.sea * sw * sw, t, 0.5);
      A.crowd.g.gain.setTargetAtTime(0.05 * W.park * (night ? 0.3 : 1), t, 0.5);
      A.crowd.f.frequency.setTargetAtTime(600 + Math.random() * 400, t, 0.3);
      A.wind.g.gain.setTargetAtTime(0.08 * W.wind * (0.6 + Math.random() * 0.4), t, 0.8);
      A.fountain.g.gain.setTargetAtTime(0.05 * W.fountain, t, 0.4);
    }
    const W = A.w;
    // birds by day, crickets and the odd owl by night
    if (now > this.nextBird) {
      this.nextBird = now + 0.8 + Math.random() * 3;
      const land = 1 - W.sea * 0.7;
      if (!A.night && land > 0.2 && Math.random() < 0.8) this.bird(land * (1 - W.park * 0.5));
      if (A.night && Math.random() < 0.12) this.owl();
    }
    if (A.night && now > this.nextCricket) {
      this.nextCricket = now + 0.35 + Math.random() * 0.6;
      this.cricket();
    }
    if (W.park > 0.2 && now > this.nextCheer) {
      this.nextCheer = now + 4 + Math.random() * 7;
      this.cheer(W.park);
    }
    this.updateOrgan(W.organ * (A.night ? 0.5 : 1));
  }

  bird(v) {
    const c = this.ctx, out = this.ambOut(0.12 * v);
    const kind = Math.random();
    if (kind < 0.5) {
      const n = 2 + ((Math.random() * 4) | 0), f = 2600 + Math.random() * 1800;
      for (let i = 0; i < n; i++) this.tone('sine', f * (1 + i * 0.03), f * (1.25 + Math.random() * 0.2), 0.07, 0.8, i * 0.11, out, 0.004);
    } else if (kind < 0.8) {
      const f = 3200 + Math.random() * 1200;
      this.tone('sine', f, f * 0.6, 0.18, 0.7, 0, out); this.tone('sine', f * 0.9, f * 1.2, 0.12, 0.6, 0.22, out);
    } else {
      // little trill
      const f = 4200 + Math.random() * 800;
      const o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain(), t = c.currentTime;
      o.frequency.value = f; l.frequency.value = 28; lg.gain.value = 500; l.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(out); o.start(t); l.start(t); o.stop(t + 0.42); l.stop(t + 0.42);
    }
  }
  owl() {
    const out = this.ambOut(0.08);
    this.voice(420, 380, 0.35, 0.6, out, 'u'); this.voice(440, 360, 0.6, 0.6, out, 'u', 0.5);
  }
  cricket() {
    const out = this.ambOut(0.03);
    const f = 4300 + Math.random() * 400;
    for (let i = 0; i < 3; i++) this.tone('sine', f, f, 0.03, 0.8, i * 0.05, out, 0.003);
  }
  cheer(v) {
    const out = this.ambOut(0.05 * v);
    this.burst(1.2, 0.8, 1100, 0.8, 'bandpass', 0, out);
    for (let i = 0; i < 3; i++) { const f = 500 + Math.random() * 300; this.voice(f, f * 1.5, 0.5, 0.25, out, 'i', Math.random() * 0.4); }
  }
  ambOut(vol) {
    const c = this.ctx, g = c.createGain(); g.gain.value = vol;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; g.connect(p); p.connect(this.ambBus); }
    else g.connect(this.ambBus);
    return g;
  }

  // The carousel's calliope, a 3/4 waltz, audible near the fun park.
  updateOrgan(w) {
    const c = this.ctx, O = this.organ;
    if (w < 0.02) { O.t = 0; return; }
    const now = c.currentTime;
    if (O.t < now - 0.1) O.t = now + 0.05;
    const beat = 60 / 150;
    if (!O.out) { O.out = c.createGain(); O.out.connect(this.ambBus); O.out.connect(this.reverbIn); }
    O.out.gain.setTargetAtTime(0.07 * w, now, 0.3);
    let guard = 0;
    while (O.t < now + 0.4 && guard++ < 8) {
      const [m, len] = ORGAN[O.i % ORGAN.length];
      const f = 440 * Math.pow(2, (m - 69) / 12), d = beat * len * 0.9;
      this.pipe(f, O.t, d, 0.5);
      // oom-pah-pah
      for (let b = 0; b < len; b++) {
        const bi = O.bar % ORGAN_BASS.length;
        const bm = ORGAN_BASS[bi], bf = 440 * Math.pow(2, (bm - 69 + ((O.bar % 3) ? 12 : 0)) / 12);
        this.pipe(bf, O.t + b * beat, beat * 0.5, (O.bar % 3) ? 0.18 : 0.3);
        O.bar++;
      }
      O.t += beat * len; O.i++;
    }
  }
  pipe(f, t, d, vol) {
    const c = this.ctx;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + Math.max(0.03, d - 0.05)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.organ.out);
    o.start(t); o2.start(t); o.stop(t + d + 0.02); o2.stop(t + d + 0.02);
  }
}
