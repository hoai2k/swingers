import { SILENT_DEBUG } from '../../src/debug.js';

// Synthesised sound: impacts, weapons, explosions, unit voices and music.
// Everything is generated with WebAudio at run time (no sample files).
//
// Signal flow
//   sfx sounds ─► [air lowpass] ─► panner ─► sfxBus ───────────────┐
//   voices ────► [air lowpass] ─► panner ─► voiceBus ───────────────┤
//   music parts ─► per-mode gain ─► musicBus ─► duck ───────────────┼─► master ─► limiter ─► soft clip ─► out
//   every panner / the music duck also sends to ─► reverb (generated impulse) ─┘
//
// Voices are formant-synthesised gibberish: one glottal oscillator (+ breath noise) through three
// bandpass formants whose frequencies glide between vowels, with wobble/vibrato/growl per
// personality and size. Concurrency is capped (voice stealing by priority); battle cries and
// cheers that overflow the cap are folded into one 'crowd' roar instead of being dropped.
import { THREE, clamp, rand, pick } from './util.js';
import { TRACKS as TRACK_CONFIG, STINGERS as STINGER_CONFIG } from '../assets/music/tracks.js';

// formants F1, F2, F3 (Hz, adult-ish; scaled per creature size)
const VOWELS = {
  a: [760, 1220, 2550], ae: [660, 1720, 2450], e: [530, 1850, 2550], i: [300, 2250, 3000],
  o: [500, 860, 2450], u: [330, 780, 2300], uh: [620, 1180, 2450], er: [500, 1350, 1700],
  // glide / nasal targets used by onsets
  w: [290, 620, 2200], y: [280, 2300, 3000], l: [360, 1050, 2700], m: [260, 1000, 2300], r: [420, 1200, 1600],
};
const KIND = ['idle', 'attack', 'hurt', 'die', 'cry', 'scream', 'sing', 'cheer'];
const CRY = ['ooga', 'roar', 'yip', 'hey', 'la', 'charge', 'cackle', 'royal', 'magic'];
const PRIORITY = { idle: 0, sing: 0, attack: 1, cry: 2, cheer: 2, hurt: 3, scream: 3, die: 4 };
const MAX_VOICES = 14, MAX_VOICES_FRAME = 4, MAX_SFX = 40, MAX_SFX_FRAME = 14, MAX_SAME_FRAME = 3;
const PLOSIVE = { b: 1, d: 1, g: 1, k: 1, p: 1, t: 1 };
const GLIDE = { w: 1, y: 1, l: 1, m: 1, n: 1, r: 1 };

// Look-ahead peak limiter (5 ms): sliding-window max → gain that reaches the target before the
// delayed peak arrives, slow release. Reports its current gain a few times a second.
const LIMITER_SRC = `
class WobblyLimiter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.L = Math.max(16, Math.round(sampleRate * 0.005));
    this.d = [new Float32Array(this.L), new Float32Array(this.L)];
    this.w = 0; this.g = 1; this.thr = 0.84; this.n = 0;
    this.att = 1 - Math.exp(-1 / (this.L * 0.2));
    this.rel = 1 - Math.exp(-1 / (sampleRate * 0.12));
    this.cap = this.L + 4; this.qv = new Float32Array(this.cap); this.qn = new Float64Array(this.cap); this.qh = 0; this.qt = 0;
    this.rep = 0; this.min = 1;
  }
  process(ins, outs) {
    const out = outs[0]; if (!out || !out.length) return true;
    const inp = ins[0] || [], l = inp[0], r = inp[1] || inp[0], N = out[0].length;
    const ol = out[0], or = out[1] || out[0], dl = this.d[0], dr = this.d[1], L = this.L, cap = this.cap;
    for (let i = 0; i < N; i++) {
      const xl = l ? l[i] : 0, xr = r ? r[i] : 0;
      const p = Math.max(xl < 0 ? -xl : xl, xr < 0 ? -xr : xr), n = this.n++;
      while (this.qt > this.qh && this.qv[(this.qt - 1) % cap] <= p) this.qt--;
      this.qv[this.qt % cap] = p; this.qn[this.qt % cap] = n; this.qt++;
      while (this.qn[this.qh % cap] <= n - L - 1) this.qh++;
      const pk = this.qv[this.qh % cap];
      const target = pk > this.thr ? this.thr / pk : 1;
      this.g += (target - this.g) * (target < this.g ? this.att : this.rel);
      const w = this.w;
      ol[i] = dl[w] * this.g; if (or !== ol) or[i] = dr[w] * this.g;
      dl[w] = xl; dr[w] = xr; this.w = w + 1 === L ? 0 : w + 1;
      if (this.g < this.min) this.min = this.g;
    }
    if ((this.rep += N) >= 12000) { this.port.postMessage(this.min); this.rep = 0; this.min = 1; }
    return true;
  }
}
registerProcessor('wobbly-limiter', WobblyLimiter);
`;

const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
// syllable: onset, vowel from→to, duration, pitch from→to, amplitude, extras
const S = (on, v0, v1, d, p0, p1, a = 1, x) => Object.assign({ on, v0, v1, d, p0, p1, a }, x);

// ------------------------------------------------------------------ music data
// chords: [root midi, quality] (quality: M, m, 7); one or two per bar (two = half bars)
const Q = { M: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10] };
const F = 53, C = 48, Dm = 50, Bb = 46, G = 55, A = 45;
const SONGS = {
  // jaunty oom-pah march in F major
  title: {
    bpm: 116, bars: 8,
    chords: [[[F, 'M']], [[C, 'M']], [[Dm, 'm']], [[Bb, 'M']], [[F, 'M']], [[G, 'm'], [C, '7']], [[Bb, 'M'], [C, '7']], [[F, 'M']]],
    mel: [
      [[0, 72, 2], [2, 77, 3], [5, 76, 1], [6, 77, 2]],
      [[0, 79, 3], [3, 77, 1], [4, 76, 2], [6, 72, 2]],
      [[0, 74, 2], [2, 77, 2], [4, 81, 3], [7, 79, 1]],
      [[0, 77, 4], [4, 74, 2], [6, 70, 2]],
      [[0, 72, 2], [2, 77, 3], [5, 76, 1], [6, 77, 2]],
      [[0, 79, 2], [2, 82, 2], [4, 81, 2], [6, 79, 2]],
      [[0, 77, 2], [2, 74, 2], [4, 76, 2], [6, 79, 2]],
      [[0, 77, 5], [6, 72, 1], [7, 74, 1]],
    ],
  },
  // sneaky tip-toe pizzicato in D minor (planning music)
  setup: {
    bpm: 100, bars: 8,
    chords: [[[Dm, 'm']], [[Dm, 'm']], [[G, 'm']], [[A, '7']], [[Dm, 'm']], [[Bb, 'M']], [[G, 'm'], [A, '7']], [[Dm, 'm']]],
    mel: [
      [[0, 74, 1], [2, 73, 1], [3, 74, 1], [4, 77, 1], [6, 74, 1]],
      [[0, 81, 1], [2, 80, 1], [3, 81, 1], [4, 77, 1], [6, 74, 1]],
      [[0, 79, 1], [2, 77, 1], [3, 76, 1], [4, 74, 1], [6, 70, 1]],
      [[0, 73, 1], [2, 76, 1], [4, 79, 1], [6, 81, 2]],
      [[0, 74, 1], [2, 73, 1], [3, 74, 1], [4, 77, 1], [6, 74, 1]],
      [[0, 77, 1], [2, 79, 1], [3, 81, 1], [4, 82, 2], [6, 81, 1], [7, 79, 1]],
      [[0, 77, 1], [1, 76, 1], [2, 74, 1], [4, 73, 1], [5, 74, 1], [6, 76, 1]],
      [[0, 74, 2], [4, 62, 1], [6, 69, 1]],
    ],
  },
  // epic-but-silly: timpani + string ostinato + heroic brass, then a goofy woodwind/trombone B part
  battle: {
    bpm: 144, bars: 16,
    chords: [[[Dm, 'm']], [[Dm, 'm']], [[Bb, 'M']], [[C, 'M']], [[Dm, 'm']], [[Dm, 'm']], [[Bb, 'M']], [[A, '7']],
      [[F, 'M']], [[C, 'M']], [[Dm, 'm']], [[A, '7']], [[F, 'M']], [[C, 'M']], [[Bb, 'M']], [[A, '7']]],
    mel: [
      [[0, 62, 3], [3, 65, 1], [4, 69, 4]],
      [[0, 67, 2], [2, 65, 2], [4, 64, 2], [6, 65, 2]],
      [[0, 62, 3], [3, 65, 1], [4, 70, 4]],
      [[0, 72, 4], [4, 70, 2], [6, 67, 2]],
      [[0, 74, 3], [3, 72, 1], [4, 69, 4]],
      [[0, 70, 2], [2, 69, 2], [4, 67, 2], [6, 65, 2]],
      [[0, 65, 4], [4, 67, 2], [6, 70, 2]],
      [[0, 69, 4], [4, 73, 4]],
      [[0, 77, 2], [2, 76, 1], [3, 77, 1], [4, 81, 4]],
      [[0, 79, 2], [2, 77, 1], [3, 79, 1], [4, 76, 4]],
      [[0, 77, 2], [2, 76, 1], [3, 77, 1], [4, 74, 2], [6, 77, 2]],
      [[0, 76, 6], [6, 73, 2]],
      [[0, 77, 2], [2, 81, 2], [4, 84, 4]],
      [[0, 82, 2], [2, 81, 2], [4, 79, 4]],
      [[0, 77, 2], [2, 74, 2], [4, 70, 2], [6, 73, 2]],
      [[0, 76, 4], [4, 73, 2], [6, 69, 2]],
    ],
  },
};
for (const s of Object.values(SONGS)) s.steps = s.bars * 8;

// Recorded music (see music-requests.md): which file plays in which role is set in
// assets/music/tracks.js; the files keep their delivered names. Songs are streamed (not
// decoded: ~2.5 min each); stingers load once sound is unlocked. Until a recording has
// loaded (or if it's missing) the synthesised music plays.
const MUSIC_DIR = 'assets/music/';
const TRACKS = Object.fromEntries(Object.entries(TRACK_CONFIG).map(([k, t]) => [k, { ...t, url: MUSIC_DIR + t.file }]));
const STINGERS = Object.fromEntries(Object.entries(STINGER_CONFIG).map(([k, f]) => [k, MUSIC_DIR + f]));
// the themes a battle with no clear faction theme may pick ('battle' first; `own` themes stay with their faction)
export const HAS_TRACK = (k) => !!TRACKS[k]; // (a theme a map names may not be delivered yet)
export const BATTLE_THEMES = Object.keys(TRACKS).filter((k) => k.startsWith('battle') && !TRACKS[k].own);
const XFADE = 1.5;
// Faction sample sets, fetched only once a battle has that faction in it (wantSamples).
// jjk: voice lines and signature effects from the owner's jjkbrawler game (README);
// avatar / minecraft / galactic: ElevenLabs effects made by dev/sfx/generate.py.
const SAMPLE_SETS = {
  jjk: 'assets/sfx/jjk/index.json', avatar: 'assets/sfx/avatar/index.json',
  minecraft: 'assets/sfx/minecraft/index.json', galactic: 'assets/sfx/galactic/index.json',
};
// which set a unit's sounds are in, by its id prefix
export const SET_OF = { jk_: 'jjk', av_: 'avatar', mc_: 'minecraft', ga_: 'galactic' };
// Spoken lines (vo_*) are recorded only, so they play with Sound effects: Synthesised
// too; never pitch-shifted (no variation, no slow motion); on the voice bus; heard
// across the field (a floor under the distance falloff; a lower one for the domain
// stingers and barrier). Recorded-only effects (jk_*) have no synthesised version:
// they layer over synth sounds and are skipped without their recording. Faction effects
// (av_*, mc_*, ga_*) are recorded too, but each names the synthesised sound it falls back
// to (its index's `_fallback`: [synth name, pitch]) when there's no recording or Sound
// effects is set to Synthesised.
const isLine = (name) => name.startsWith('vo_');
const recOnly = (name) => /^(vo|jk|av|mc|ga)_/.test(name);

export class Audio {
  constructor() {
    this.ctx = null;
    this.listeners = [];
    this.sfxVol = 0.8;
    this.musicVol = 0.45;
    this.voiceVol = 0.8;
    this.active = 0;          // live sfx + voices (for debugging)
    this.frameCount = 0;
    this.voiceFrame = 0;
    this.sameFrame = new Map();
    this.sfxList = [];        // {end, gain, out}
    this.voiceList = [];      // {end, pri, gain, out}
    this.crowd = { n: 0, gain: 0, x: 0, y: 0, z: 0, cheer: 0, until: 0 };
    this.pluckCache = new Map();
    this.music = null;
    this.musics = [];
    this.musicMode = null;
    this.musicTimer = null;
    this.offline = false;
    this.hidden = false;
    this.timeScale = 1;       // slow motion: new sounds pitch down, sfx and voices muffle
    this.slowPitch = 1;
    const upd = () => {
      this.hidden = document.hidden || !document.hasFocus();
      if (!this.ctx || this.offline) return;
      if (this.hidden) this.ctx.suspend(); else this.ctx.resume();
      this.trackPause(this.hidden);
    };
    document.addEventListener('visibilitychange', upd);
    window.addEventListener('blur', upd);
    window.addEventListener('focus', upd);
  }

  unlock() {
    if (SILENT_DEBUG) return;
    if (this.ctx) { if (!this.hidden && !this.offline) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.attach(new AC());
    if (document.hidden || !document.hasFocus()) this.ctx.suspend();
    if (this.musicMode) this.startMusic(this.musicMode, true);
    this.loadStingers();
    this.loadSamples();
    for (const k of this.wanted || []) this.loadSet(k);
  }

  // Recorded sound effects (assets/sfx/index.json, made by dev/sfx/generate.py):
  // name -> variants. A sound plays its recording once loaded, the synth otherwise.
  loadSamples() {
    this.samples = {};
    this.sampleLevel = {};
    this.setsLoaded = new Set();
    this.loadIndex('assets/sfx/index.json');
  }

  // a faction's sample set (SAMPLE_SETS), loaded once; remembered until sound is unlocked
  wantSamples(set) {
    (this.wanted ||= new Set()).add(set);
    if (this.ctx && this.samples) this.loadSet(set);
  }

  loadSet(set) {
    if (!SAMPLE_SETS[set] || this.setsLoaded.has(set)) return;
    this.setsLoaded.add(set);
    this.loadIndex(SAMPLE_SETS[set]);
  }

  loadIndex(url) {
    fetch(url).then((r) => (r.ok ? r.json() : null)).then((ix) => {
      if (!ix) return;
      Object.assign(this.sampleLevel, ix._levels || {});
      Object.assign((this.fallback ||= {}), ix._fallback || {});
      for (const [name, files] of Object.entries(ix)) {
        if (name.startsWith('_')) continue;
        for (const f of files) {
          fetch(f).then((r) => (r.ok ? r.arrayBuffer() : null))
            .then((b) => b && this.ctx.decodeAudioData(b))
            .then((buf) => { if (buf) (this.samples[name] ||= []).push(buf); })
            .catch(() => {});
        }
      }
    }).catch(() => {});
  }

  // play a recorded variant of `name` into o (never the same one twice running);
  // returns its duration, or 0 when there's no recording
  sample(name, o, t, p) {
    const bank = this.samples?.[name];
    if (!bank?.length || (this.noSamples && !isLine(name))) return 0;
    let i = (Math.random() * bank.length) | 0;
    if (bank.length > 1 && i === bank.last) i = (i + 1) % bank.length;
    bank.last = i;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
    src.buffer = bank[i];
    src.playbackRate.value = clamp(p, 0.5, 2);
    g.gain.value = this.sampleLevel[name] ?? 0.6;
    src.connect(g).connect(o);
    src.start(t);
    return bank[i].duration / src.playbackRate.value;
  }

  loadStingers() {
    this.stingers = {};
    for (const [k, url] of Object.entries(STINGERS)) {
      fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => b && this.ctx.decodeAudioData(b))
        .then((buf) => { if (buf) this.stingers[k] = buf; })
        .catch(() => {});
    }
  }

  // Play a recorded stinger over ducked music; false if it isn't loaded (the
  // caller then plays its synthesised stand-in).
  stinger(name, vol = 0.8) {
    const buf = this.stingers?.[name];
    if (!buf || !this.ctx) return false;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf;
    g.gain.value = vol * this.sfxVol;
    src.connect(g).connect(this.master);
    src.start(c.currentTime + 0.01);
    this.duckMusic(0.75, Math.max(0.5, buf.duration - 1.5), true);
    return true;
  }

  // Build the graph on a context (also used with an OfflineAudioContext by dev harnesses).
  attach(ctx) {
    const c = this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    const sr = c.sampleRate;
    // master: gain → look-ahead limiter (AudioWorklet; compressor fallback) → soft clipper
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const clip = c.createWaveShaper();
    const N = 2048, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const s = (i / (N - 1)) * 2 - 1, a = Math.abs(s); // shaper input range ±1 maps the signal ±2
      const x = a * 2;
      const y = x < 0.7 ? x : 0.7 + 0.28 * Math.tanh((x - 0.7) / 0.28);
      curve[i] = Math.sign(s) * y;
    }
    clip.curve = curve; clip.oversample = '2x';
    const pre = c.createGain(); pre.gain.value = 0.5;
    pre.connect(clip).connect(c.destination);
    this.master.connect(pre);
    this.limGain = 1; this.limMin = 1;
    const fallback = () => {
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 3; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
      this.master.disconnect(); this.master.connect(lim).connect(pre);
      this.limiter = lim;
    };
    if (c.audioWorklet && typeof AudioWorkletNode !== 'undefined' && typeof Blob !== 'undefined') {
      const url = URL.createObjectURL(new Blob([LIMITER_SRC], { type: 'application/javascript' }));
      this.ready = c.audioWorklet.addModule(url).then(() => {
        const lim = new AudioWorkletNode(c, 'wobbly-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        lim.port.onmessage = (e) => { this.limGain = e.data; if (e.data < this.limMin) this.limMin = e.data; };
        this.master.disconnect(); this.master.connect(lim).connect(pre);
        this.limiter = lim;
      }).catch(fallback);
    } else { fallback(); this.ready = Promise.resolve(); }
    // reverb
    this.revIn = c.createGain(); this.revIn.gain.value = 1;
    const conv = c.createConvolver();
    conv.buffer = this.impulse(2.4, 2.8);
    const revOut = c.createGain(); revOut.gain.value = 0.55;
    const revHp = c.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 180;
    this.revIn.connect(revHp).connect(conv).connect(revOut).connect(this.master);
    // buses (sfx and voices through the slow-motion low-pass, see setTimeScale)
    this.slowLp = c.createBiquadFilter(); this.slowLp.type = 'lowpass'; this.slowLp.Q.value = 0.6;
    this.slowLp.frequency.value = 20000;
    this.slowLp.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.slowLp);
    this.voiceBus = c.createGain(); this.voiceBus.gain.value = this.sfxVol * this.voiceVol;
    this.voiceBus.connect(this.slowLp);
    this.timeScale = 1;
    this.setTimeScale(this.wantScale ?? 1);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVol;
    this.duck = c.createGain(); this.duck.gain.value = 1;
    const mSend = c.createGain(); mSend.gain.value = 0.32;
    this.musicBus.connect(this.duck).connect(this.master);
    this.duck.connect(mSend).connect(this.revIn);
    // shared buffers
    const len = sr * 2;
    this.noise = c.createBuffer(1, len, sr);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.crackle = this.makeCrackle(2, 0.0016, false);
    this.debris = this.makeCrackle(2.2, 0.006, true);
    // glottal source: harmonics falling ~ -8 dB/oct (warmer than a saw)
    const H = 48, re = new Float32Array(H), im = new Float32Array(H);
    for (let n = 1; n < H; n++) im[n] = 1 / Math.pow(n, 1.35);
    this.glottal = c.createPeriodicWave(re, im);
    // brassy wave: strong upper harmonics
    for (let n = 1; n < H; n++) im[n] = (n % 2 ? 1 : 0.8) / Math.pow(n, 0.95);
    this.brassWave = c.createPeriodicWave(re, im);
  }

  impulse(dur, decay) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * dur);
    const b = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const tt = i / sr;
        const k = 0.15 + 0.8 * Math.exp(-tt * 1.5); // tail darkens over time
        lp += (Math.random() * 2 - 1 - lp) * k;
        const early = tt < 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 2 : 0;
        d[i] = (lp + early) * Math.exp(-tt * decay) * Math.min(1, tt / 0.006);
      }
    }
    return b;
  }

  makeCrackle(dur, density, decaying) {
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * dur);
    const b = c.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const tt = i / len;
      const dens = decaying ? density * Math.pow(1 - tt, 2.2) + 0.0002 * (1 - tt) : density;
      if (Math.random() < dens) {
        const amp = (decaying ? Math.pow(1 - tt, 1.5) : 1) * rand(0.3, 1) * (Math.random() < 0.5 ? -1 : 1);
        const L = Math.floor(rand(8, decaying ? 220 : 60)), fr = rand(0.05, 0.5);
        for (let k = 0; k < L && i + k < len; k++) d[i + k] += amp * Math.exp(-k / (L * 0.3)) * Math.sin(k * fr * 3);
      }
    }
    return b;
  }

  // all sound on/off (the corner button)
  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(sfx * this.voiceVol, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music, t, 0.08);
  }

  // cameras: [{position, right(Vector3)}]
  setListeners(list) { this.listeners = list; }

  // Slow motion (x = the game's time scale, 1 = normal): sounds started from now on are
  // pitched down (and so played slower), and the sfx / voice buses get a gentle
  // low-pass, so a slowed battle sounds heavy and muffled. Cheap to call every frame.
  setTimeScale(x) {
    x = clamp(x, 0, 1);
    this.wantScale = x;
    if (Math.abs(x - this.timeScale) < 0.005) return;
    this.timeScale = x;
    const k = Math.max(0.1, x);
    this.slowPitch = clamp(Math.pow(k, 0.33), 0.5, 1);
    if (!this.ctx) return;
    const f = x >= 0.99 ? 20000 : 900 + 17000 * Math.pow(k, 1.6);
    this.slowLp.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
  }

  beginFrame() {
    this.frameCount = 0;
    this.voiceFrame = 0;
    this.sameFrame.clear();
    this.flushCrowd();
  }

  get usable() {
    const c = this.ctx;
    return !!c && !this.hidden && (this.offline || c.state === 'running');
  }

  // nearest listener wins: gain falloff, pan, distance (for air absorption + reverb send)
  spatial(pos, vol) {
    if (!pos || !this.listeners.length) return { gain: vol, pan: 0, dist: 0 };
    let best = null, bd = Infinity;
    for (const l of this.listeners) {
      if (!l || !l.position) continue;
      const d = l.position.distanceTo(pos);
      if (d < bd) { bd = d; best = l; }
    }
    if (!best) return { gain: vol, pan: 0, dist: 0 };
    const gain = vol / (1 + Math.max(0, bd - 3) / 10) * clamp(1.25 - bd / 160, 0, 1);
    let pan = 0;
    if (best.right && bd > 0.01) {
      const dx = pos.x - best.position.x, dy = pos.y - best.position.y, dz = pos.z - best.position.z;
      pan = clamp((dx * best.right.x + dy * best.right.y + dz * best.right.z) / bd, -1, 1) * 0.85 * Math.min(1, bd / 2.5);
    }
    return { gain, pan, dist: bd };
  }

  // per-sound output: gain → (air lowpass) → panner → bus, + reverb send
  out(gain, pan, dist = 0, bus = this.sfx, wet = 0) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    let tail = g;
    if (dist > 7) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.5;
      f.frequency.value = clamp(20000 / (1 + (dist - 7) / 9), 1400, 20000);
      tail = tail.connect(f);
    }
    if (c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = pan; tail = tail.connect(p);
    }
    tail.connect(bus);
    const send = c.createGain(); send.gain.value = clamp(wet + 0.05 + dist / 70, 0, 0.6);
    tail.connect(send).connect(this.revIn);
    return g;
  }

  prune(list) {
    const now = this.ctx.currentTime;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end < now) list.splice(i, 1);
  }

  // sfx admission: frame caps, per-name caps, load-adaptive quiet threshold, steal quietest
  admitSfx(name, gain) {
    if (!this.usable) return false;
    this.prune(this.sfxList);
    const load = this.sfxList.length / MAX_SFX;
    if (gain < 0.012 * (1 + 6 * load * load)) return false;
    if (this.frameCount >= MAX_SFX_FRAME) return false;
    const same = this.sameFrame.get(name) || 0;
    if (same >= MAX_SAME_FRAME) return false;
    if (this.sfxList.length >= MAX_SFX) {
      let qi = -1, qg = Infinity;
      for (let i = 0; i < this.sfxList.length; i++) if (this.sfxList[i].gain < qg) { qg = this.sfxList[i].gain; qi = i; }
      if (qg >= gain) return false;
      this.kill(this.sfxList[qi]);
      this.sfxList.splice(qi, 1);
    }
    this.sameFrame.set(name, same + 1);
    this.frameCount++;
    return true;
  }

  kill(e) {
    const t = this.ctx.currentTime;
    try { e.out.gain.cancelScheduledValues(t); e.out.gain.setTargetAtTime(0, t, 0.015); } catch (_) { /* gone */ }
  }

  canPlay(gain) { return this.usable && gain >= 0.012; } // kept for old callers

  noiseSrc(t, dur, rate = 1, buf = this.noise, loop = true, offset) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.loop = loop;
    s.start(t, offset ?? Math.random() * (buf.duration * 0.6));
    s.stop(t + dur + 0.05);
    return s;
  }

  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // building blocks ------------------------------------------------
  filt(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  // oscillator with pitch glide and percussive envelope
  tone(dest, t, type, f0, f1, glide, a, peak, dur, wave) {
    const c = this.ctx, s = c.createOscillator(), e = c.createGain();
    if (wave) s.setPeriodicWave(wave); else s.type = type;
    s.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) s.frequency.exponentialRampToValueAtTime(f1, t + glide);
    this.env(e, t, a, peak, dur);
    s.connect(e).connect(dest);
    s.start(t); s.stop(t + dur + 0.02);
    return s;
  }

  // filtered noise burst with a frequency sweep
  nz(dest, t, dur, type, f0, f1, q, a, peak, rate = 1, buf, loop = true) {
    const n = this.noiseSrc(t, dur, rate, buf || this.noise, loop, loop ? undefined : 0), f = this.filt(type, f0, q), e = this.ctx.createGain();
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(e, t, a, peak, dur);
    n.connect(f).connect(e).connect(dest);
    return f;
  }

  shaper(amount) {
    const ws = this.ctx.createWaveShaper(), N = 512, cv = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; cv[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    ws.curve = cv;
    return ws;
  }

  duckMusic(depth, hold, stinger) {
    if (!this.duck) return;
    const t = this.ctx.currentTime;
    // a stinger's longer duck isn't cut short by the impacts under it
    if (stinger) this.stingerUntil = t + hold;
    else if (t < (this.stingerUntil || 0)) return;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(1 - depth, t, 0.03);
    this.duck.gain.setTargetAtTime(1, t + hold, 0.5);
  }

  // ------------------------------------------------------------------ sfx
  play(name, pos, vol = 1, pitch = 1) {
    if (!this.ctx) return;
    const line = isLine(name);
    if (recOnly(name) && (!this.samples?.[name]?.length || (this.noSamples && !line))) {
      const fb = this.fallback?.[name];
      if (!fb) return;
      name = fb[0]; pitch *= fb[1]; // its synthesised stand-in
    }
    let { gain, pan, dist } = this.spatial(pos, vol);
    if (line) { gain = Math.max(gain, vol * 0.45); dist = Math.min(dist, 12); }
    else if (name.startsWith('jk_dom') || name === 'jk_barrier') { gain = Math.max(gain, vol * 0.25); dist = Math.min(dist, 25); } // domains are big moments
    if (!this.admitSfx(name, gain)) return;
    const c = this.ctx, t = c.currentTime + 0.005;
    const wet = name === 'boom' ? 0.35 : name === 'horn' || name === 'fanfare' ? 0.25 : name === 'clang' ? 0.15 : line ? 0.08 : 0.04;
    const o = this.out(gain, pan, dist, line ? this.voiceBus : this.sfx, wet);
    const p = line ? 1 : pitch * rand(0.96, 1.04) * this.slowPitch;
    const dur = this.sample(name, o, t, p) || this.synth(name, o, t, p, gain) || 0.3;
    if (line) this.duckMusic(0.35, dur, false);
    this.sfxList.push({ end: t + dur, gain, out: o });
    this.active = this.sfxList.length + this.voiceList.length;
  }

  // returns the duration of the sound
  synth(name, o, t, p, gain) {
    const c = this.ctx;
    switch (name) {
      case 'whoosh': {
        // swing: resonant noise sweep up-and-down, plus a low air layer; bigger swings (lower pitch) are longer
        const d = clamp(0.24 / Math.sqrt(p), 0.16, 0.42);
        const f = this.nz(o, t, d, 'bandpass', 350 * p, 0, 3, d * 0.55, 1.4, 1);
        f.frequency.setValueAtTime(350 * p, t);
        f.frequency.exponentialRampToValueAtTime(2200 * p, t + d * 0.55);
        f.frequency.exponentialRampToValueAtTime(600 * p, t + d);
        this.nz(o, t, d, 'lowpass', 300 * p, 700 * p, 0.7, d * 0.5, 0.45, 0.5);
        return d;
      }
      case 'throw': {
        // spinning throw: flutter (AM) on a whoosh
        const d = 0.3;
        const am = c.createGain(); am.gain.value = 0.55;
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.setValueAtTime(rand(14, 20), t); lfo.frequency.linearRampToValueAtTime(rand(9, 12), t + d);
        lg.gain.value = 0.45; lfo.connect(lg).connect(am.gain); lfo.start(t); lfo.stop(t + d + 0.05);
        am.connect(o);
        const f = this.nz(am, t, d, 'bandpass', 500 * p, 0, 2, 0.06, 1.6, 1);
        f.frequency.setValueAtTime(500 * p, t);
        f.frequency.exponentialRampToValueAtTime(1600 * p, t + 0.12);
        f.frequency.exponentialRampToValueAtTime(700 * p, t + d);
        return d;
      }
      case 'flyby': {
        // projectile passing close (new)
        const d = 0.35;
        this.nz(o, t, d, 'bandpass', 3000 * p, 900 * p, 4, d * 0.45, 1.1, 1);
        this.tone(o, t, 'sine', 900 * p, 600 * p, d, d * 0.45, 0.08, d);
        return d;
      }
      case 'thud': case 'punch': {
        // blunt hit: snappy click + punchy kick + mid "smack" through saturation
        const ws = this.shaper(2.5), sg = c.createGain(); sg.gain.value = 0.8;
        ws.connect(sg).connect(o);
        this.tone(ws, t, 'sine', 170 * p, 48 * p, 0.12, 0.002, 1.0, 0.22);
        this.nz(o, t, 0.035, 'highpass', 2500, 0, 0.7, 0.001, 0.5);
        this.nz(ws, t, 0.09, 'bandpass', 420 * p, 250 * p, 1.6, 0.002, 1.1);
        if (name === 'thud') this.nz(o, t + 0.01, 0.16, 'lowpass', 900 * p, 200, 0.8, 0.004, 0.35, 0.6);
        return 0.25;
      }
      case 'crunch': {
        // heavy blunt hit with a bony crackle (new)
        const ws = this.shaper(3), sg = c.createGain(); sg.gain.value = 0.75; ws.connect(sg).connect(o);
        this.tone(ws, t, 'sine', 130 * p, 38 * p, 0.18, 0.002, 1.1, 0.35);
        this.nz(ws, t, 0.12, 'bandpass', 350 * p, 180, 1.2, 0.002, 1.2);
        this.nz(o, t + 0.01, 0.2, 'bandpass', 2200 * p, 1200, 1.2, 0.003, 0.9, 1, this.crackle);
        return 0.38;
      }
      case 'thump': {
        // something landing on the ground: soft low thump + dirt
        this.tone(o, t, 'sine', 95 * p, 40 * p, 0.15, 0.004, 0.75, 0.25);
        this.nz(o, t, 0.14, 'lowpass', 700 * p, 200, 0.8, 0.003, 0.5, 0.7);
        this.nz(o, t + 0.02, 0.18, 'bandpass', 1800, 900, 1, 0.01, 0.12, 1, this.crackle);
        return 0.28;
      }
      case 'slash': {
        // blade through flesh: fast downward swish + wet "chk" + body thump
        this.nz(o, t, 0.12, 'highpass', 4500 * p, 1500 * p, 0.9, 0.002, 0.55);
        this.nz(o, t + 0.005, 0.07, 'bandpass', 1300 * p, 700 * p, 2.5, 0.002, 1.0);
        this.tone(o, t, 'sine', 160 * p, 55 * p, 0.12, 0.002, 0.65, 0.18);
        this.nz(o, t + 0.03, 0.12, 'bandpass', 600 * p, 300, 3, 0.005, 0.35, 1, this.crackle);
        return 0.2;
      }
      case 'stab': {
        // arrow/point into flesh: "thwick" + short thunk
        this.nz(o, t, 0.045, 'bandpass', 2600 * p, 1400 * p, 2, 0.001, 0.9);
        this.tone(o, t, 'triangle', 220 * p, 90 * p, 0.06, 0.002, 0.65, 0.12);
        this.nz(o, t + 0.01, 0.08, 'lowpass', 600 * p, 0, 1, 0.003, 0.4);
        return 0.15;
      }
      case 'clang': {
        // metal on armour/shield: inharmonic bell partials + bright transient + a dull body knock
        const f0 = 430 * p * rand(0.92, 1.08);
        const parts = [[1, 0.32, 0.55], [2.76, 0.24, 0.4], [5.4, 0.16, 0.25], [8.93, 0.1, 0.15], [1.5, 0.12, 0.2]];
        for (const [r, a, d] of parts) {
          const s = c.createOscillator(), e = c.createGain();
          s.frequency.value = f0 * r * rand(0.99, 1.01);
          this.env(e, t, 0.001, a, d * rand(0.8, 1.2) / Math.sqrt(p));
          s.connect(e).connect(o); s.start(t); s.stop(t + 0.7);
        }
        this.nz(o, t, 0.03, 'highpass', 5000, 0, 0.7, 0.0008, 0.8);
        this.tone(o, t, 'sine', 240 * p, 120 * p, 0.06, 0.002, 0.35, 0.1);
        return 0.65;
      }
      case 'block': case 'shield': {
        // wooden shield: hollow "thock" (resonant body) + rattle; 'shield' (new) adds a metal rim ring
        this.tone(o, t, 'triangle', 210 * p, 140 * p, 0.08, 0.002, 0.7, 0.2);
        this.nz(o, t, 0.08, 'bandpass', 850 * p, 600 * p, 3.5, 0.001, 1.3);
        this.nz(o, t + 0.005, 0.03, 'highpass', 3000, 0, 0.7, 0.001, 0.35);
        this.nz(o, t + 0.02, 0.15, 'bandpass', 1500, 800, 2, 0.005, 0.2, 1, this.crackle);
        if (name === 'shield') {
          for (const r of [1, 2.71]) this.tone(o, t, 'sine', 760 * p * r, 0, 0, 0.001, 0.12 / r, 0.35);
        }
        return 0.3;
      }
      case 'bow': {
        // string twang (plucked buffer + wobble) and arrow "thwip"
        const b = this.pluck(98 * p, 0.992);
        const s = c.createBufferSource(); s.buffer = b;
        s.playbackRate.setValueAtTime(1.12, t); s.playbackRate.exponentialRampToValueAtTime(1, t + 0.05);
        const lp = this.filt('lowpass', 3000, 2), e = c.createGain();
        lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
        this.env(e, t, 0.002, 0.9, 0.35);
        s.connect(lp).connect(e).connect(o); s.start(t); s.stop(t + 0.4);
        this.tone(o, t, 'sine', 196 * p, 180 * p, 0.2, 0.002, 0.25, 0.25);
        this.nz(o, t + 0.01, 0.16, 'bandpass', 4500, 1800, 3, 0.01, 0.45);
        return 0.4;
      }
      case 'fire': {
        // fireball: roaring whoosh + crackles + low body
        const d = 0.75;
        const f = this.nz(o, t, d, 'lowpass', 500, 0, 1.2, 0.07, 0.8, 0.8);
        f.frequency.setValueAtTime(500, t);
        f.frequency.exponentialRampToValueAtTime(2200, t + 0.15);
        f.frequency.exponentialRampToValueAtTime(350, t + d);
        this.nz(o, t, d, 'highpass', 1800, 0, 0.7, 0.03, 0.6, 1, this.crackle);
        this.tone(o, t, 'sine', 70 * p, 45, d, 0.05, 0.4, d);
        return d;
      }
      case 'boom': return this.boom(o, t, p, gain);
      case 'debris': {
        // rubble raining down (new; also part of 'boom')
        this.nz(o, t, 1.8, 'bandpass', 1600 * p, 900, 0.8, 0.02, 0.9, 1, this.debris, false);
        this.nz(o, t, 1.8, 'lowpass', 500 * p, 200, 1, 0.02, 1.0, 0.7, this.debris, false);
        return 1.9;
      }
      case 'pop': {
        // potion: glass shatter tinkles + bubbly pop + fizz
        for (let i = 0; i < 6; i++) {
          const st = t + rand(0, 0.09), fr = rand(2400, 6500) * p * 0.75;
          this.tone(o, st, 'sine', fr, fr * 0.97, 0.1, 0.001, rand(0.08, 0.16), rand(0.12, 0.3));
        }
        this.nz(o, t, 0.06, 'highpass', 4000, 0, 0.7, 0.001, 0.7);
        this.tone(o, t, 'sine', 260 * p, 1100 * p, 0.09, 0.004, 0.55, 0.16);
        this.nz(o, t + 0.05, 0.5, 'bandpass', 1400 * p, 3000, 1.5, 0.05, 0.3, 1, this.crackle);
        return 0.55;
      }
      case 'heal': {
        // shimmering chime arpeggio with a soft chorus + sparkle
        [523, 659, 784, 1047, 1319].forEach((fr, i) => {
          const st = t + i * 0.065;
          this.tone(o, st, 'sine', fr * p, 0, 0, 0.008, 0.24, 0.7);
          this.tone(o, st, 'sine', fr * p * 1.004, 0, 0, 0.02, 0.08, 0.6);
          this.tone(o, st, 'triangle', fr * p * 2, 0, 0, 0.004, 0.03, 0.25);
        });
        this.nz(o, t, 0.8, 'highpass', 6000, 0, 0.7, 0.2, 0.08);
        return 1.05;
      }
      case 'lute': {
        // plucked string with a wooden body resonance
        const b = this.pluck(196 * p, 0.996);
        const s = c.createBufferSource(); s.buffer = b;
        const body = this.filt('peaking', 260, 1.5); body.gain.value = 6;
        const lp = this.filt('lowpass', 3200, 0.7);
        const e = c.createGain(); e.gain.value = 0.75;
        s.connect(body).connect(lp).connect(e).connect(o); s.start(t);
        return 1.0;
      }
      case 'click': {
        // UI tick: short woodblock
        this.tone(o, t, 'sine', 1500 * p, 1100 * p, 0.03, 0.001, 0.28, 0.05);
        this.nz(o, t, 0.02, 'bandpass', 3000 * p, 0, 2, 0.001, 0.15);
        return 0.08;
      }
      case 'tick': {
        // countdown tick (new)
        this.tone(o, t, 'square', 880 * p, 0, 0, 0.002, 0.12, 0.09);
        this.tone(o, t, 'sine', 1760 * p, 0, 0, 0.002, 0.1, 0.15);
        return 0.18;
      }
      case 'place': {
        // plop + rising blip
        this.tone(o, t, 'sine', 300 * p, 620 * p, 0.07, 0.002, 0.4, 0.14);
        this.tone(o, t, 'triangle', 150 * p, 90 * p, 0.05, 0.002, 0.35, 0.08);
        this.nz(o, t, 0.03, 'bandpass', 1800, 0, 2, 0.001, 0.12);
        return 0.16;
      }
      case 'remove': {
        // "fwip" down
        this.tone(o, t, 'sine', 600 * p, 220 * p, 0.12, 0.002, 0.35, 0.16);
        this.nz(o, t, 0.12, 'bandpass', 2500 * p, 700 * p, 2, 0.01, 0.2);
        return 0.18;
      }
      case 'horn': {
        // battle horn: two-voice "BWAAAMP" with scoop, filter swell and a little vibrato
        const d = 1.9;
        for (const [fr, v, st] of [[110, 0.4, 0], [165, 0.22, 0.04], [55, 0.25, 0]]) {
          const s = c.createOscillator(); s.setPeriodicWave(this.brassWave);
          s.frequency.setValueAtTime(fr * p * 0.88, t + st);
          s.frequency.exponentialRampToValueAtTime(fr * p, t + st + 0.14);
          const lfo = c.createOscillator(), lg = c.createGain();
          lfo.frequency.value = 5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(12, t + 1.2);
          lfo.connect(lg).connect(s.detune); lfo.start(t); lfo.stop(t + d + 0.1);
          const f = this.filt('lowpass', 250, 1.5);
          f.frequency.setValueAtTime(250, t + st);
          f.frequency.exponentialRampToValueAtTime(1500, t + st + 0.35);
          f.frequency.exponentialRampToValueAtTime(900, t + d);
          const e = c.createGain();
          e.gain.setValueAtTime(0.0001, t + st);
          e.gain.exponentialRampToValueAtTime(v, t + st + 0.12);
          e.gain.setValueAtTime(v, t + d - 0.35);
          e.gain.exponentialRampToValueAtTime(0.0001, t + d);
          s.connect(f).connect(e).connect(o); s.start(t + st); s.stop(t + d + 0.05);
        }
        this.nz(o, t, 0.25, 'bandpass', 900, 0, 1, 0.02, 0.08);
        return d;
      }
      case 'fanfare': {
        // victory: brass triplet → chord, timpani roll, cymbal
        const notes = [[67, 0, 0.16], [67, 0.18, 0.16], [67, 0.36, 0.16], [72, 0.56, 1.3], [76, 0.56, 1.3], [79, 0.56, 1.5], [60, 0.56, 1.3]];
        for (const [n, st, d] of notes) this.inst(o, 'brass', n, t + st, d, 0.16);
        this.inst(o, 'roll', 0, t, 0.56, 0.25);
        this.inst(o, 'timp', 48, t + 0.56, 1.2, 0.7);
        this.inst(o, 'crash', 0, t + 0.56, 1.8, 0.35);
        this.inst(o, 'timp', 43, t + 1.6, 1.0, 0.5);
        return 2.4;
      }
      case 'crowd': case 'hooray': {
        // many voices at once: "waaaaah" (crowd) or "yaaaay" (hooray). Callers may use it directly.
        const cheer = name === 'hooray';
        const d = cheer ? 1.2 : 1.5;
        const bus = c.createGain(); bus.gain.value = 1;
        const [v0, v1] = cheer ? [VOWELS.e, VOWELS.i] : [VOWELS.u, VOWELS.a];
        for (let k = 0; k < 3; k++) {
          const bp = this.filt('bandpass', v0[k], [5, 9, 12][k]);
          bp.frequency.setValueAtTime(v0[k], t); bp.frequency.linearRampToValueAtTime(v1[k], t + 0.35);
          const fg = c.createGain(); fg.gain.value = [1, 0.6, 0.25][k] * 2.2;
          bus.connect(bp).connect(fg).connect(o);
        }
        const n = 6;
        for (let i = 0; i < n; i++) {
          const st = t + rand(0, 0.25), b = rand(90, 280) * p, dd = d * rand(0.7, 1);
          const s = c.createOscillator(); s.setPeriodicWave(this.glottal);
          s.frequency.setValueAtTime(b * 0.9, st);
          s.frequency.exponentialRampToValueAtTime(b * (cheer ? 1.5 : 1.25), st + dd * 0.6);
          s.frequency.exponentialRampToValueAtTime(b * (cheer ? 1.3 : 1.05), st + dd);
          const lfo = c.createOscillator(), lg = c.createGain();
          lfo.frequency.value = rand(4.5, 7); lg.gain.value = rand(20, 60);
          lfo.connect(lg).connect(s.detune);
          const e = c.createGain();
          e.gain.setValueAtTime(0, st);
          e.gain.linearRampToValueAtTime(0.35, st + 0.12);
          e.gain.setValueAtTime(0.35, st + dd * 0.7);
          e.gain.linearRampToValueAtTime(0, st + dd);
          s.connect(e).connect(bus);
          s.start(st); s.stop(st + dd + 0.05); lfo.start(st); lfo.stop(st + dd + 0.05);
        }
        this.nz(bus, t, d, 'bandpass', 900, 1200, 0.8, 0.2, 0.25);
        return d + 0.3;
      }
      case 'gong': {
        // big low metal (new)
        for (const [r, a] of [[1, 0.3], [1.48, 0.2], [2.1, 0.15], [2.9, 0.1], [4.2, 0.06]]) this.tone(o, t, 'sine', 110 * p * r, 108 * p * r, 2.5, 0.01, a, 3);
        return 3;
      }
    }
    return 0.3;
  }

  boom(o, t, p, gain) {
    // explosion: crack + sub thump + saturated body + long rumble + debris patter
    const c = this.ctx;
    const ws = this.shaper(3), sg = c.createGain(); sg.gain.value = 0.7; ws.connect(sg).connect(o);
    this.nz(o, t, 0.07, 'highpass', 1200, 0, 0.7, 0.001, 0.9);
    this.tone(ws, t, 'sine', 95 * p, 30 * p, 0.45, 0.003, 1.2, 1.0);
    this.nz(ws, t, 1.3, 'lowpass', 3500 * p, 110, 0.8, 0.004, 1.3, 0.7);
    this.nz(o, t + 0.04, 2.8, 'lowpass', 240 * p, 55, 1.2, 0.12, 0.9, 0.22);
    this.nz(o, t + 0.25, 1.8, 'bandpass', 1500 * p, 800, 0.8, 0.05, 0.55, 1, this.debris, false);
    this.nz(o, t + 0.2, 1.8, 'lowpass', 450 * p, 200, 1, 0.05, 0.7, 0.7, this.debris, false);
    if (gain > 0.2) this.duckMusic(clamp(gain * 0.5, 0.15, 0.5), 0.4);
    return 3.0;
  }

  pluck(freq, decay = 0.996) {
    const key = Math.round(freq * 4) + ':' + decay;
    let b = this.pluckCache.get(key);
    if (b) return b;
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 1.0);
    b = this.ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const N = Math.max(2, Math.floor(sr / freq));
    const buf = new Float32Array(N);
    let mean = 0;
    for (let i = 0; i < N; i++) { buf[i] = Math.random() * 2 - 1; mean += buf[i]; }
    mean /= N;
    for (let i = 0; i < N; i++) buf[i] -= mean;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const nx = (idx + 1) % N;
      const v = (buf[idx] + buf[nx]) * 0.5 * decay;
      d[i] = buf[idx];
      buf[idx] = v;
      idx = nx;
    }
    if (this.pluckCache.size > 200) this.pluckCache.clear();
    this.pluckCache.set(key, b);
    return b;
  }

  // ------------------------------------------------------------------ voices
  // kind index (see KIND), pitch multiplier (~0.3 giant .. ~2.3 halfling), cry type index (see CRY)
  voice(pos, kindIdx, pitchMul, cryIdx) {
    if (!this.ctx) return;
    const kind = KIND[kindIdx] || 'idle';
    const cry = CRY[cryIdx] || 'charge';
    pitchMul = clamp((pitchMul || 1) * this.slowPitch, 0.2, 3);
    const pri = PRIORITY[kind];
    const kindVol = { idle: 0.55, attack: 0.8, hurt: 0.9, die: 1, cry: 1, scream: 0.9, sing: 0.6, cheer: 0.9 }[kind];
    const big = pitchMul < 0.6 ? 1.6 : 1;
    const sp = this.spatial(pos, 0.9 * kindVol * big);
    if (!this.usable) return;
    this.prune(this.voiceList);
    const n = this.voiceList.length;
    // quieter when many are already talking
    const gain = sp.gain / Math.sqrt(1 + n * 0.12);
    const crowdable = kind === 'cry' || kind === 'cheer';
    if (gain < 0.02 * (1 + n / 6)) { if (crowdable) this.crowdAdd(pos, sp.gain, kind); return; }
    if (this.voiceFrame >= MAX_VOICES_FRAME || n >= MAX_VOICES) {
      if (crowdable) { this.crowdAdd(pos, sp.gain, kind); return; }
      if (this.voiceFrame >= MAX_VOICES_FRAME + 2 || pri < 3) return;
    }
    if (this.voiceList.length >= MAX_VOICES) {
      // steal the lowest-priority / quietest voice
      let wi = -1, ws = Infinity;
      for (let i = 0; i < n; i++) { const v = this.voiceList[i], s = v.pri * 10 + v.gain; if (s < ws) { ws = s; wi = i; } }
      if (wi < 0 || this.voiceList[wi].pri >= pri) return;
      this.kill(this.voiceList[wi]);
      this.voiceList.splice(wi, 1);
    }
    this.voiceFrame++;
    const o = this.out(gain, sp.pan, sp.dist, this.voiceBus, 0.06);
    const t0 = this.ctx.currentTime + 0.005;
    const phrase = this.phrase(kind, cry, pitchMul);
    const end = this.speak(o, t0, phrase, pitchMul, kind, cry);
    this.voiceList.push({ end, pri, gain, out: o });
    this.active = this.sfxList.length + this.voiceList.length;
  }

  // build a list of syllables for a kind of utterance
  phrase(kind, cry, pm) {
    const r = Math.random();
    const V = (...a) => pick(a);
    switch (kind) {
      case 'idle': {
        // mumbled gibberish: "bleh-mah-hoo?"
        const n = 1 + Math.floor(Math.random() * 3), out = [];
        let p = rand(0.92, 1.08);
        const vs = cry === 'yip' ? ['i', 'e', 'ae'] : cry === 'royal' ? ['o', 'uh', 'a'] : ['a', 'e', 'o', 'u', 'uh', 'ae'];
        for (let i = 0; i < n; i++) {
          const v = pick(vs), v1 = Math.random() < 0.4 ? pick(vs) : v;
          const np = p * rand(0.88, 1.15);
          out.push(S(pick(['b', 'm', 'h', 'w', 'd', 'g', 'y', 'l', '']), v, v1, rand(0.09, 0.17), p, np, rand(0.6, 0.9)));
          p = np;
        }
        if (Math.random() < 0.3) out[out.length - 1].p1 *= 1.25; // questioning "huh?"
        if (cry === 'la') for (const s of out) { s.on = 'l'; s.vib = 25; }
        return out;
      }
      case 'attack': {
        if (cry === 'cackle') return [S('h', 'e', 'e', 0.07, 1.6, 1.5), S('h', 'e', 'e', 0.09, 1.7, 1.45)];
        if (cry === 'roar' || pm < 0.6) return [S('r', 'uh', 'a', 0.26, 0.95, 0.8, 1, { growl: 0.5 })];
        if (r < 0.35) return [S('h', 'uh', 'uh', 0.13, 1.2, 0.9)];             // "HUH!"
        if (r < 0.7) return [S('h', 'y', 'a', 0.2, 1.1, 1.3, 1, { fall: 0.85 })]; // "HYAH!"
        return [S('h', 'ae', 'uh', 0.1, 1.15, 1.0), S('', 'a', 'a', 0.16, 1.3, 1.0)]; // "hi-YAH"
      }
      case 'hurt': {
        if (pm > 1.5 || r < 0.25) return [S('', 'i', 'i', 0.12, 1.9, 2.3, 1, { scoop: 1 })];             // "EEP!"
        if (r < 0.55) return [S('', 'a', 'u', 0.2, 1.7, 1.25, 1, { scoop: 1 })];                          // "OW!"
        if (r < 0.8) return [S('', 'u', 'u', 0.11, 1.15, 0.8, 1, { br: 0.4 }), S('f', 'u', 'u', 0.05, 0.8, 0.7, 0.3, { br: 1 })]; // "OOF"
        return [S('y', 'e', 'e', 0.09, 1.6, 1.9), S('', 'ae', 'ae', 0.14, 1.9, 1.5)];                   // "yee-ow"
      }
      case 'die': {
        // comedic, long and wobbly
        if (r < 0.3) return [S('', 'a', 'o', 0.3, 1.5, 1.35, 1, { scoop: 1, vib: 40 }), S('', 'o', 'u', 0.65, 1.3, 0.5, 0.9, { vib: 60, fry: 1 })]; // "AAAoooughh"
        if (r < 0.55) return [S('n', 'o', 'o', 0.75, 1.25, 0.6, 1, { vib: 70, wob: 2 })];                   // "nooooo"
        if (r < 0.8) return [S('b', 'e', 'a', 0.18, 1.3, 1.4), S('', 'a', 'u', 0.5, 1.4, 0.6, 0.9, { vib: 50, fry: 1 })]; // "bleaugh"
        return [S('w', 'a', 'a', 0.25, 1.6, 1.8, 1, { scoop: 1 }), S('', 'a', 'uh', 0.55, 1.8, 0.7, 0.9, { vib: 80 })];   // "waaaah-uh"
      }
      case 'scream': {
        const v = r < 0.5 ? 'a' : 'i';
        return [S('', v, v, rand(0.7, 1.0), 2.0, 2.1, 1, { vib: 90, vibRate: 9, br: 0.35, scoop: 1, trem: 1 })];
      }
      case 'sing': {
        const scale = [1, 1.122, 1.26, 1.498, 1.682, 2];
        const n = 3 + Math.floor(Math.random() * 2), out = [];
        let k = Math.floor(rand(0, 3));
        for (let i = 0; i < n; i++) {
          const last = i === n - 1;
          out.push(S(pick(['l', 'd', 'l']), 'a', last ? 'o' : 'a', last ? 0.35 : 0.16, scale[k], scale[k], 0.85, { vib: last ? 35 : 10, legato: 1 }));
          k = clamp(k + pick([-1, 1, 2]), 0, scale.length - 1);
        }
        return out;
      }
      case 'cheer': {
        if (r < 0.35) return [S('y', 'e', 'i', 0.5, 1.2, 1.7, 1, { scoop: 1, vib: 40 })];                                 // "YAAAY!"
        if (r < 0.7) return [S('w', 'u', 'u', 0.18, 1.3, 1.5), S('h', 'u', 'u', 0.35, 1.6, 2.0, 1, { vib: 30 })];          // "woo-HOO!"
        return [S('h', 'u', 'uh', 0.1, 1.1, 1.2, 0.8), S('r', 'e', 'e', 0.1, 1.25, 1.3), S('', 'ae', 'i', 0.4, 1.45, 1.6, 1, { vib: 35 })]; // "hoo-ray!"
      }
      case 'cry': default: return this.cryPhrase(cry);
    }
  }

  cryPhrase(cry) {
    const r = Math.random();
    switch (cry) {
      case 'ooga': {
        const one = [S('', 'u', 'u', 0.2, 1.0, 1.1), S('g', 'a', 'a', 0.3, 1.2, 0.85, 1, { growl: 0.25 })];
        return r < 0.4 ? [...one, ...one.map((s) => Object.assign({}, s, { p0: s.p0 * 1.12, p1: s.p1 * 1.12 }))] : one;
      }
      case 'roar': return [S('r', 'a', 'o', rand(0.75, 0.95), 0.9, 0.6, 1, { growl: 0.6, br: 0.5, scoop: 1 })];
      case 'yip': {
        const n = 2 + Math.floor(Math.random() * 2), out = [];
        for (let i = 0; i < n; i++) out.push(S('y', 'i', 'i', 0.1, 1.6 + i * 0.1, 2.0 + i * 0.1, 1, { gap: 0.04 }));
        return out;
      }
      case 'hey': return r < 0.5 ? [S('h', 'ae', 'i', 0.4, 1.05, 1.3, 1, { scoop: 1 })]
        : [S('h', 'ae', 'i', 0.22, 1.05, 1.15), S('h', 'ae', 'i', 0.4, 1.2, 1.4, 1, { gap: 0.06 })];
      case 'la': return [S('l', 'a', 'a', 0.18, 1.2, 1.2, 0.9, { legato: 1 }), S('l', 'a', 'a', 0.18, 1.35, 1.35, 0.9, { legato: 1 }), S('l', 'a', 'a', 0.45, 1.5, 1.5, 1, { vib: 45 })];
      case 'cackle': {
        const n = 4 + Math.floor(Math.random() * 3), out = [];
        for (let i = 0; i < n; i++) out.push(S('h', 'e', 'e', 0.075, 1.9 - i * 0.07, 1.75 - i * 0.07, 1 - i * 0.08, { gap: 0.03 }));
        out[n - 1].d = 0.16;
        return out;
      }
      case 'royal': return r < 0.5
        ? [S('h', 'u', 'u', 0.14, 0.95, 1.0), S('z', 'a', 'a', 0.5, 1.2, 1.0, 1, { vib: 45, scoop: 1 })]          // "huz-ZAAH"
        : [S('f', 'o', 'er', 0.18, 1.0, 1.0), S('d', 'uh', 'uh', 0.1, 1.0, 1.0, 0.7), S('k', 'i', 'i', 0.45, 1.15, 0.95, 1, { vib: 40 })]; // "for the KIIING"
      case 'magic': return [S('', 'u', 'o', 0.4, 1.0, 1.4, 1, { vib: 70, vibRate: 4 }), S('w', 'o', 'u', 0.55, 1.4, 1.2, 0.9, { vib: 90, vibRate: 4, legato: 1 })]; // "ooOOOOooo"
      case 'charge': default:
        // the classic "WAAAAAAAGH!"
        return [S('w', 'u', 'a', rand(0.7, 0.95), 0.95, 1.35, 1, { vib: 55, growl: 0.15, scoop: 1, br: 0.15 })];
    }
  }

  // synthesise syllables; returns end time
  speak(o, t0, phrase, pm, kind, cry) {
    const c = this.ctx, nyq = c.sampleRate * 0.45;
    const base = 135 * pm;
    const fs = clamp(Math.pow(pm, 0.32), 0.68, 1.35);     // formant scale: small creatures sound small
    const ds = clamp(Math.pow(pm, -0.22), 0.8, 1.3);      // small creatures talk faster
    const big = pm < 0.6;
    // total length
    let total = 0;
    for (const s of phrase) total += (s.gap || (PLOSIVE[s.on] ? 0.03 : 0.012)) + s.d * ds;
    const tEnd = t0 + total + 0.06;
    // source chain: osc → growl AM → amp → [formants] → out ; noise → breath → [formants]
    const src = c.createOscillator(); src.setPeriodicWave(this.glottal);
    const amp = c.createGain(); amp.gain.value = 0;
    const gr = c.createGain(); gr.gain.value = 1;
    src.connect(gr).connect(amp);
    const vib = c.createOscillator(), vg = c.createGain(); vg.gain.value = 0;
    vib.frequency.value = (phrase[0].vibRate || (pm > 1.4 ? 7.5 : 5.5)) * rand(0.9, 1.1);
    vib.connect(vg).connect(src.detune);
    const wob = c.createOscillator(), wg = c.createGain();
    wob.type = 'triangle'; wob.frequency.value = rand(1.5, 3.2);
    wg.gain.value = (cry === 'magic' ? 60 : 25) * rand(0.6, 1.4);
    wob.connect(wg).connect(src.detune);
    const nzs = this.noiseSrc(t0, total + 0.1, 1);
    const breath = c.createGain(); breath.gain.value = 0;
    nzs.connect(breath);
    const mix = c.createGain(); mix.gain.value = 1;
    amp.connect(mix); breath.connect(mix);
    const FQ = [5.5, 8, 11], FG = [1, 0.55, 0.22];
    const fl = [];
    const mk = 5; // makeup for the narrow formant bands
    for (let k = 0; k < 3; k++) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = FQ[k];
      const g = c.createGain(); g.gain.value = FG[k] * mk;
      mix.connect(bp).connect(g).connect(o);
      fl.push(bp);
    }
    // chest: a bit of the raw low end so giants boom
    const chest = this.filt('lowpass', Math.min(900, base * 3), 0.7), cg = c.createGain();
    cg.gain.value = big ? 0.5 : 0.22;
    amp.connect(chest).connect(cg).connect(o);
    // growl (giant, roar)
    const growlAmt = Math.max(big ? 0.3 : 0, ...phrase.map((s) => s.growl || 0));
    let glfo = null;
    if (growlAmt > 0) {
      glfo = c.createOscillator(); const gg = c.createGain();
      glfo.frequency.value = big ? rand(18, 26) : rand(28, 36);
      gr.gain.value = 1 - growlAmt * 0.5; gg.gain.value = growlAmt * 0.5;
      glfo.connect(gg).connect(gr.gain);
      glfo.start(t0); glfo.stop(tEnd);
    }
    const setF = (time, vw, ramp) => {
      const F = VOWELS[vw] || VOWELS.a;
      for (let k = 0; k < 3; k++) {
        const f = Math.min(nyq, F[k] * fs);
        if (ramp) fl[k].frequency.linearRampToValueAtTime(f, time); else fl[k].frequency.setValueAtTime(f, time);
      }
    };
    let t = t0;
    let prevLegato = false;
    for (const s of phrase) {
      const gap = s.gap || (PLOSIVE[s.on] ? 0.03 : s.legato && prevLegato ? 0 : 0.012);
      t += gap;
      const d = s.d * ds;
      const A = s.a * 0.5;
      const f0 = base * s.p0, f1 = base * s.p1;
      // pitch contour
      src.frequency.setValueAtTime(f0 * (s.scoop ? 0.8 : 1), t);
      if (s.scoop) src.frequency.exponentialRampToValueAtTime(f0, t + Math.min(0.06, d * 0.3));
      if (s.fall) {
        src.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
        src.frequency.exponentialRampToValueAtTime(f1 * s.fall, t + d);
      } else src.frequency.exponentialRampToValueAtTime(f1, t + d);
      // formants: glide onsets start at the consonant target
      if (GLIDE[s.on] && VOWELS[s.on]) { setF(t, s.on); setF(t + Math.min(0.06, d * 0.4), s.v0, true); }
      else if (s.on === 'n') { setF(t, 'm'); setF(t + 0.06, s.v0, true); }
      else setF(t, s.v0);
      setF(t + d, s.v1, true);
      // amplitude
      const att = PLOSIVE[s.on] ? 0.008 : s.on === 'h' ? 0.05 : GLIDE[s.on] || s.on === 'n' ? 0.04 : 0.025;
      const g = amp.gain;
      g.setValueAtTime(s.legato && prevLegato ? A * 0.5 : 0, t);
      if (s.on === 'm' || s.on === 'n') { g.linearRampToValueAtTime(A * 0.35, t + 0.04); g.linearRampToValueAtTime(A, t + 0.07); }
      else g.linearRampToValueAtTime(A, t + att);
      if (s.trem) {
        // trembling scream
        for (let k = t + 0.1; k < t + d * 0.8; k += 0.06) { g.linearRampToValueAtTime(A * 0.65, k); g.linearRampToValueAtTime(A, k + 0.03); }
      }
      g.linearRampToValueAtTime(A * (s.fry ? 0.7 : 0.85), t + d * 0.78);
      g.linearRampToValueAtTime(s.legato ? A * 0.4 : 0, t + d);
      if (!s.legato) g.linearRampToValueAtTime(0, t + d + 0.004);
      // breath / consonant noise
      const b = breath.gain, br = (s.br || 0.06) * A;
      b.setValueAtTime(0, t);
      if (s.on === 'h' || s.on === 'f' || s.on === 'k' || s.on === 'z') {
        b.linearRampToValueAtTime(A * (s.on === 'z' ? 0.6 : 1.1), t + 0.01);
        b.linearRampToValueAtTime(br, t + 0.06);
      } else if (PLOSIVE[s.on]) {
        b.linearRampToValueAtTime(A * 0.8, t + 0.003);
        b.linearRampToValueAtTime(br, t + 0.02);
      } else b.linearRampToValueAtTime(br, t + att);
      b.linearRampToValueAtTime(s.fry ? br * 2 : br, t + d * 0.8);
      b.linearRampToValueAtTime(0, t + d);
      // vibrato depth grows through long syllables
      const vd = (s.vib || 8) * (kind === 'die' ? 1.3 : 1);
      vg.gain.setValueAtTime(vd * 0.3, t);
      vg.gain.linearRampToValueAtTime(vd, t + d);
      if (s.wob) wg.gain.setValueAtTime(wg.gain.value * s.wob, t);
      // death fry: growl in the last part
      if (s.fry && !glfo) {
        const fl2 = c.createOscillator(), fg = c.createGain();
        fl2.frequency.value = rand(14, 22); fg.gain.value = 0;
        fg.gain.setValueAtTime(0, t + d * 0.4); fg.gain.linearRampToValueAtTime(0.45, t + d);
        fl2.connect(fg).connect(gr.gain);
        fl2.start(t); fl2.stop(tEnd);
      }
      prevLegato = !!s.legato;
      t += d;
    }
    for (const s of [src, vib, wob]) { s.start(t0); s.stop(tEnd); }
    return tEnd;
  }

  crowdAdd(pos, gain, kind) {
    const cr = this.crowd;
    cr.n++; cr.gain += gain;
    if (kind === 'cheer') cr.cheer++;
    if (pos) { cr.x += pos.x * gain; cr.y += pos.y * gain; cr.z += pos.z * gain; cr.w = (cr.w || 0) + gain; }
  }

  flushCrowd() {
    const cr = this.crowd;
    if (!this.ctx || cr.n < 3) return;
    const now = this.ctx.currentTime;
    if (now < cr.until) return;
    const cheer = cr.cheer * 2 > cr.n;
    const vol = clamp(Math.sqrt(cr.gain) * 0.6, 0.15, 1.1);
    const pos = cr.w ? new THREE.Vector3(cr.x / cr.w, cr.y / cr.w, cr.z / cr.w) : null;
    // play at the listener-relative level we already computed (gain), but panned at the centroid
    const sp = pos ? this.spatial(pos, 1) : { pan: 0, dist: 0 };
    if (this.usable) {
      const o = this.out(vol, sp.pan * 0.6, Math.min(sp.dist, 20), this.voiceBus, 0.12);
      const t = now + 0.005;
      const d = this.synth(cheer ? 'hooray' : 'crowd', o, t, rand(0.9, 1.1), vol);
      this.voiceList.push({ end: t + d, pri: 2, gain: vol, out: o });
      cr.until = now + 0.7;
    }
    Object.assign(cr, { n: 0, gain: 0, x: 0, y: 0, z: 0, w: 0, cheer: 0 });
  }

  // ------------------------------------------------------------------ music
  // A look-ahead sequencer on the audio clock. Each mode is a looping song; switching modes
  // crossfades (old keeps playing while it fades), so loops and transitions are seamless.
  startMusic(mode, force) {
    if (this.musicMode === mode && !force) return;
    this.musicMode = mode;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const m of this.musics) {
      if (m.dying) continue;
      m.dying = true;
      m.endAt = now + 1.4;
      m.gain.gain.cancelScheduledValues(now);
      m.gain.gain.setValueAtTime(m.gain.gain.value, now);
      m.gain.gain.linearRampToValueAtTime(0, now + 1.3);
    }
    this.music = null;
    this.trackFadeOut(now);
    if (mode && TRACKS[mode] && !this.trackFailed?.[mode]) {
      this.trackStart(mode);
    } else if (mode && (SONGS[mode] || SONGS[TRACKS[mode]?.synth])) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + (mode.startsWith('battle') ? 0.4 : 1.2));
      gain.connect(this.musicBus);
      const song = SONGS[mode] || SONGS[TRACKS[mode].synth];
      const m = { gain, mode, song, step: 0, next: now + 0.08, stepDur: 60 / song.bpm / 2, dying: false, endAt: Infinity };
      this.musics.push(m);
      this.music = m;
    }
    if (!this.musicTimer && !this.offline) this.musicTimer = setInterval(() => this.musicTick(), 50);
  }

  // ---- recorded songs: two media elements per song, swapped at each loop
  trackDeck(mode) {
    this.decks ||= {};
    if (this.decks[mode]) return this.decks[mode];
    const c = this.ctx, deck = { mode, players: [], cur: 0, on: false, loop: TRACKS[mode].loop };
    for (let i = 0; i < 2; i++) {
      const el = new window.Audio(TRACKS[mode].url);
      el.preload = i ? 'none' : 'auto';
      el.crossOrigin = 'anonymous';
      const g = c.createGain(); g.gain.value = 0;
      c.createMediaElementSource(el).connect(g).connect(this.musicBus);
      el.addEventListener('error', () => {
        // missing / undecodable: fall back to the synthesised song
        (this.trackFailed ||= {})[mode] = true;
        if (this.musicMode === mode && deck.on) { deck.on = false; this.startMusic(mode, true); }
      });
      deck.players.push({ el, g });
    }
    return (this.decks[mode] = deck);
  }
  trackStart(mode) {
    const deck = this.trackDeck(mode), now = this.ctx.currentTime;
    deck.on = true;
    const p = deck.players[deck.cur];
    p.g.gain.cancelScheduledValues(now);
    p.g.gain.setValueAtTime(p.g.gain.value, now);
    p.g.gain.linearRampToValueAtTime(1, now + (mode.startsWith('battle') ? 0.4 : 1.2));
    if (p.el.paused) { p.el.currentTime = 0; if (!this.hidden) p.el.play().catch(() => {}); }
    this.track = deck;
  }
  trackFadeOut(now) {
    const deck = this.track;
    if (!deck) return;
    this.track = null;
    deck.on = false;
    for (const p of deck.players) {
      p.g.gain.cancelScheduledValues(now);
      p.g.gain.setValueAtTime(p.g.gain.value, now);
      p.g.gain.linearRampToValueAtTime(0, now + 1.3);
    }
    setTimeout(() => { if (!deck.on) for (const p of deck.players) p.el.pause(); }, 1500);
  }
  trackPause(hidden) {
    const deck = this.track;
    if (!deck) return;
    for (const p of deck.players) {
      if (hidden) { p.wasPlaying = !p.el.paused; p.el.pause(); } else if (p.wasPlaying) p.el.play().catch(() => {});
    }
  }
  // near the song's ending: start the other player from the top and crossfade
  trackTick() {
    const deck = this.track;
    if (!deck || this.hidden) return;
    const cur = deck.players[deck.cur], loop = deck.loop;
    if (cur.el.paused && !cur.el.ended) { if (cur.el.readyState > 0) cur.el.play().catch(() => {}); return; }
    if (cur.el.currentTime < loop - XFADE && !cur.el.ended) return;
    const now = this.ctx.currentTime, nx = deck.players[1 - deck.cur];
    nx.el.currentTime = 0;
    nx.el.play().catch(() => {});
    nx.g.gain.cancelScheduledValues(now);
    nx.g.gain.setValueAtTime(0, now);
    nx.g.gain.linearRampToValueAtTime(1, now + 0.25);
    cur.g.gain.cancelScheduledValues(now);
    cur.g.gain.setValueAtTime(cur.g.gain.value, now);
    cur.g.gain.linearRampToValueAtTime(0, now + XFADE);
    const old = cur.el;
    setTimeout(() => { if (deck.players[deck.cur].el !== old) old.pause(); }, XFADE * 1000 + 200);
    deck.cur = 1 - deck.cur;
  }

  // schedule notes up to `ahead` seconds in the future
  musicTick(ahead = 0.3) {
    const c = this.ctx;
    if (!c) return;
    this.trackTick();
    const now = c.currentTime;
    for (let i = this.musics.length - 1; i >= 0; i--) {
      const m = this.musics[i];
      if (m.dying && now > m.endAt + 0.5) { m.gain.disconnect(); this.musics.splice(i, 1); continue; }
      if (!this.offline && c.state !== 'running') continue;
      if (m.next < now - 0.1) m.next = now + 0.05; // stalled (tab hidden/frozen): resume without a burst
      while (m.next < now + ahead && m.next < m.endAt) {
        this.musicStep(m, m.next);
        m.next += m.stepDur;
        m.step++;
      }
    }
    if (!this.musics.length && !this.track && this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }

  musicStep(m, t) {
    const song = m.song, S8 = m.stepDur;
    const sl = m.step % song.steps, loop = Math.floor(m.step / song.steps);
    const bar = Math.floor(sl / 8), i = sl % 8;
    const ch = song.chords[bar], half = ch.length > 1 && i >= 4 ? 1 : 0;
    const [root, q] = ch[half];
    const tones = Q[q].map((x) => root + x);
    const o = m.gain;
    const mel = song.mel[bar].filter((n) => n[0] === i);
    const swing = m.mode.startsWith('battle') ? 0 : (i % 2) * S8 * 0.08; // a touch of lilt
    t += swing;
    if (m.mode === 'title') {
      // oom-pah: tuba on 1 and 3, pizz chord on the off beats
      if (i === 0 || i === 4) this.inst(o, 'tuba', (i === 0 ? root : root + 7) - 12, t, S8 * 1.6, 0.3);
      if (i === 2 || i === 6) for (const n of tones.slice(0, 3)) this.inst(o, 'pizz', n + 12, t, 0.3, 0.4);
      if (i === 2 || i === 6) this.inst(o, 'snare', 0, t, 0.1, 0.07);
      if (bar === 7 && i >= 4) this.inst(o, 'roll', 0, t, S8, 0.06 + (i - 4) * 0.025);
      if (sl === 0) { this.inst(o, 'crash', 0, t, 1.4, 0.12); this.inst(o, 'timp', root - 12, t, 1, 0.5); }
      if (bar === 4 && i === 0) this.inst(o, 'timp', root - 12, t, 1, 0.4);
      for (const [, n, len] of mel) {
        if (loop % 2 === 0) this.inst(o, 'brass', n, t, len * S8 * 0.92, 0.16);
        else { this.inst(o, 'flute', n + 12, t, len * S8 * 0.9, 0.12); this.inst(o, 'clar', n, t, len * S8 * 0.9, 0.08); }
        if (loop % 2 === 1 && bar >= 4) this.inst(o, 'glock', n + 12, t, 0.8, 0.05);
      }
      if (loop % 2 === 1 && i === 0) for (const n of tones.slice(0, 3)) this.inst(o, 'pad', n, t, S8 * 8, 0.035);
    } else if (m.mode === 'setup') {
      // walking pizz bass, tip-toe pizz melody, woodblock tick-tock
      const walk = [0, null, 7, null, 12, null, 7, null][i];
      if (walk !== null) this.inst(o, 'pizz', root - 12 + walk, t, 0.45, 1.1);
      if (i === 2 || i === 6) this.inst(o, 'block', i === 2 ? 1 : 0.8, t, 0.05, 0.12);
      for (const [, n, len] of mel) {
        this.inst(o, 'pizz', n, t, 0.35, 0.8);
        if (loop % 2 === 1) this.inst(o, 'bassoon', n - 12, t, len * S8 * 0.8, 0.12);
      }
      if (loop % 2 === 1 && i === 0) {
        this.inst(o, 'pad', tones[1] + 12, t, S8 * 8, 0.035);
        this.inst(o, 'pad', tones[0] + 12, t, S8 * 8, 0.03);
        this.inst(o, 'glock', tones[2] + 24, t, 0.9, 0.035);
      }
      if (sl === 0) this.inst(o, 'timp', root - 12, t, 0.9, 0.25);
    } else {
      // battle
      const B = bar >= 8;
      const ost = [0, 0, 7, 0, 3, 0, 7, 12][i];
      const third = tones[1] - root;
      this.inst(o, 'str', root - 12 + (ost === 3 ? third : ost), t, S8 * 0.85, 0.13);
      if (i === 0 || i === 3 || i === 6) this.inst(o, 'timp', (i === 3 ? root + 7 : root) - 12, t, 0.7, 0.38);
      if (i === 0 || i === 4) this.inst(o, 'bdrum', 0, t, 0.4, 0.3);
      if (i === 2 || i === 6) this.inst(o, 'snare', 0, t, 0.14, 0.2);
      if (B && (i === 1 || i === 5)) this.inst(o, 'snare', 0, t, 0.08, 0.06);
      if ((bar === 7 || bar === 15) && i >= 4) this.inst(o, 'roll', 0, t, S8, 0.08 + (i - 4) * 0.04);
      if (sl === 0 || sl === 64) this.inst(o, 'crash', 0, t, 1.8, 0.22);
      if (i === 0) for (const n of tones.slice(0, 3)) this.inst(o, 'pad', n, t, S8 * 8, 0.035);
      for (const [, n, len] of mel) {
        if (!B) {
          this.inst(o, 'brass', n, t, len * S8 * 0.92, 0.17);
          if (loop % 2 === 1) this.inst(o, 'brass', n - 12, t, len * S8 * 0.92, 0.09);
        } else {
          this.inst(o, 'flute', n, t, len * S8 * 0.85, 0.12);
          this.inst(o, 'clar', n - 12, t, len * S8 * 0.85, 0.07);
        }
      }
      if (B && (i === 0 || i === 3)) for (const n of tones.slice(0, 3)) this.inst(o, 'brass', n + 12, t, S8 * 0.6, 0.06);
      if (B && (bar === 11 || bar === 15) && i === 0) this.inst(o, 'gliss', root - 12, t, S8 * 3.5, 0.16); // silly trombone "bwaaah"
    }
  }

  // orchestral-ish instruments (dest gain, midi note, start, duration, volume)
  inst(dest, name, n, t, dur, vol) {
    const c = this.ctx;
    const f = hz(n);
    const osc = (type, fr, wave) => { const s = c.createOscillator(); if (wave) s.setPeriodicWave(wave); else s.type = type; s.frequency.value = fr; return s; };
    const adsr = (g, a, peak, sus, rel) => {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setTargetAtTime(peak * sus, t + a, 0.08);
      g.gain.setValueAtTime(peak * sus, t + Math.max(a, dur));
      g.gain.linearRampToValueAtTime(0, t + Math.max(a, dur) + rel);
    };
    const vibrato = (targets, depth, delay) => {
      if (dur < 0.3) return null;
      const l = osc('sine', 5.2), lg = c.createGain();
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(depth, t + delay + 0.2);
      l.connect(lg); for (const tg of targets) lg.connect(tg.detune);
      l.start(t); l.stop(t + dur + 0.4);
      return l;
    };
    switch (name) {
      case 'pizz': {
        const s = c.createBufferSource(); s.buffer = this.pluck(f, 0.985);
        const lp = this.filt('lowpass', Math.min(4000, f * 6), 0.7), e = c.createGain();
        e.gain.setValueAtTime(vol, t); e.gain.setTargetAtTime(0, t + 0.05, dur * 0.35);
        s.connect(lp).connect(e).connect(dest); s.start(t); s.stop(t + dur + 0.3);
        break;
      }
      case 'brass': {
        const a = osc('', f, this.brassWave), b = osc('', f, this.brassWave);
        a.detune.value = -6; b.detune.value = 6;
        const lp = this.filt('lowpass', 400, 1.8), e = c.createGain();
        lp.frequency.setValueAtTime(350, t);
        lp.frequency.exponentialRampToValueAtTime(Math.min(5000, f * 7), t + 0.05);
        lp.frequency.exponentialRampToValueAtTime(Math.min(3000, f * 4), t + 0.2);
        adsr(e, 0.03, vol, 0.75, 0.08);
        a.connect(lp); b.connect(lp); lp.connect(e).connect(dest);
        vibrato([a, b], 14, 0.15);
        for (const s of [a, b]) { s.start(t); s.stop(t + dur + 0.15); }
        break;
      }
      case 'gliss': {
        // comedic trombone slide up
        const a = osc('', f, this.brassWave), lp = this.filt('lowpass', 300, 3), e = c.createGain();
        a.frequency.setValueAtTime(f * 0.7, t);
        a.frequency.exponentialRampToValueAtTime(f * 2, t + dur * 0.8);
        lp.frequency.setValueAtTime(300, t);
        lp.frequency.exponentialRampToValueAtTime(2200, t + dur * 0.8);
        const l = osc('sine', 6), lg = c.createGain(); lg.gain.value = 30; l.connect(lg).connect(a.detune);
        adsr(e, 0.08, vol, 0.9, 0.1);
        a.connect(lp).connect(e).connect(dest);
        a.start(t); a.stop(t + dur + 0.15); l.start(t); l.stop(t + dur + 0.15);
        break;
      }
      case 'str': {
        const a = osc('sawtooth', f), b = osc('sawtooth', f);
        a.detune.value = -8; b.detune.value = 9;
        const lp = this.filt('lowpass', Math.min(2400, f * 8), 0.8), e = c.createGain();
        e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(vol, t + 0.008);
        e.gain.setTargetAtTime(0, t + 0.02, dur * 0.4);
        a.connect(lp); b.connect(lp); lp.connect(e).connect(dest);
        for (const s of [a, b]) { s.start(t); s.stop(t + dur + 0.2); }
        break;
      }
      case 'pad': {
        const a = osc('sawtooth', f), b = osc('sawtooth', f);
        a.detune.value = -10; b.detune.value = 11;
        const lp = this.filt('lowpass', 1100, 0.7), e = c.createGain();
        adsr(e, 0.25, vol, 0.85, 0.35);
        a.connect(lp); b.connect(lp); lp.connect(e).connect(dest);
        for (const s of [a, b]) { s.start(t); s.stop(t + dur + 0.4); }
        break;
      }
      case 'flute': {
        const a = osc('triangle', f), lp = this.filt('lowpass', 4000, 0.7), e = c.createGain();
        adsr(e, 0.04, vol, 0.85, 0.07);
        a.connect(lp).connect(e).connect(dest);
        vibrato([a], 18, 0.12);
        a.start(t); a.stop(t + dur + 0.12);
        break;
      }
      case 'clar': case 'bassoon': {
        const a = osc('square', f), lp = this.filt('lowpass', name === 'clar' ? Math.min(2500, f * 4) : Math.min(900, f * 3.5), 1), e = c.createGain();
        adsr(e, 0.03, vol, 0.8, 0.06);
        a.connect(lp).connect(e).connect(dest);
        vibrato([a], 10, 0.15);
        a.start(t); a.stop(t + dur + 0.1);
        break;
      }
      case 'tuba': {
        const a = osc('triangle', f), b = osc('', f, this.brassWave), lp = this.filt('lowpass', 450, 1.2), e = c.createGain(), bg = c.createGain();
        bg.gain.value = 0.4;
        adsr(e, 0.02, vol, 0.6, 0.06);
        a.connect(lp); b.connect(bg).connect(lp); lp.connect(e).connect(dest);
        for (const s of [a, b]) { s.start(t); s.stop(t + dur + 0.1); }
        break;
      }
      case 'glock': {
        this.tone(dest, t, 'sine', f, 0, 0, 0.002, vol, dur);
        this.tone(dest, t, 'sine', f * 2.76, 0, 0, 0.001, vol * 0.4, dur * 0.3);
        break;
      }
      case 'timp': {
        this.tone(dest, t, 'sine', f * 1.03, f, 0.08, 0.004, vol, dur);
        this.tone(dest, t, 'sine', f * 1.51, f * 1.5, 0.08, 0.003, vol * 0.3, dur * 0.5);
        this.nz(dest, t, 0.06, 'lowpass', 400, 0, 1, 0.001, vol * 0.5);
        break;
      }
      case 'bdrum': {
        this.tone(dest, t, 'sine', 75, 42, 0.15, 0.003, vol, dur);
        this.nz(dest, t, 0.05, 'lowpass', 250, 0, 1, 0.001, vol * 0.4);
        break;
      }
      case 'snare': {
        this.nz(dest, t, dur, 'bandpass', 3200, 2500, 0.7, 0.001, vol);
        this.tone(dest, t, 'triangle', 190, 160, 0.05, 0.001, vol * 0.7, 0.07);
        break;
      }
      case 'roll': {
        // one noise burst amplitude-modulated into a roll
        const n = this.noiseSrc(t, dur, 1), bp = this.filt('bandpass', 3000, 0.7), e = c.createGain();
        e.gain.setValueAtTime(0, t);
        const hit = 1 / 26;
        for (let k = 0; k * hit < dur; k++) {
          const tk = t + k * hit, v = vol * (0.7 + 0.3 * (k * hit / dur)) * (k % 2 ? 0.8 : 1);
          e.gain.setValueAtTime(v, tk); e.gain.setTargetAtTime(v * 0.15, tk + 0.004, 0.012);
        }
        e.gain.setTargetAtTime(0, t + dur, 0.03);
        n.connect(bp).connect(e).connect(dest);
        break;
      }
      case 'crash': {
        this.nz(dest, t, dur, 'highpass', 5000, 0, 0.7, 0.002, vol);
        this.nz(dest, t, dur * 0.6, 'bandpass', 8000, 6000, 1.5, 0.002, vol * 0.6);
        break;
      }
      case 'block': {
        this.tone(dest, t, 'sine', 1250 * n, 1100 * n, 0.03, 0.001, vol, dur);
        this.nz(dest, t, 0.02, 'bandpass', 2500 * n, 0, 3, 0.001, vol * 0.5);
        break;
      }
    }
  }
}
