// Procedural background music: a cheerful, bouncy daytime tune (plucked
// ukulele strums, marimba, a whistled melody, upright-ish bass and light
// shaker/woodblock percussion) and a calmer night variation (music box,
// soft pad, gentle arpeggios). Everything is synthesized with WebAudio and
// scheduled a little ahead of the audio clock from the game's frame loop.

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Chord progressions as scale degrees (0 = I). One chord per bar, 4 bars.
const DAY_PROGS = [[0, 4, 5, 3], [3, 4, 2, 5], [0, 5, 1, 4], [3, 0, 1, 4], [0, 3, 4, 0], [5, 3, 0, 4]];
const NIGHT_PROGS = [[0, 5, 3, 4], [3, 2, 1, 4], [0, 2, 3, 1], [5, 3, 1, 4]];
// Melody rhythms over two bars of 8ths: 1 = new note, 0 = hold/rest.
const RHYTHMS = [
  [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0],
  [1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0],
  [0, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  [1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0],
];
const NIGHT_RHYTHMS = [
  [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0],
  [0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
];

export class Music {
  constructor(audio, out) {
    this.a = audio;
    this.ctx = audio.ctx;
    this.out = out;           // music bus
    this.next = 0;            // audio time of the next 8th step
    this.step = 0;            // 8th-note counter within the current section
    this.section = -1;
    this.style = 'day';
    this.want = 'day';
    this.plucks = new Map();
    this.seed = (Math.random() * 1e9) | 0;
    this.prevMel = 0;
    this.newSection();
  }

  setStyle(s) { this.want = s; }

  // --- section planning --------------------------------------------------
  newSection() {
    this.section++;
    if (this.want !== this.style) { this.style = this.want; this.section = 0; }
    const night = this.style === 'night';
    const r = rng(this.seed + this.section * 7919 + (night ? 99 : 0));
    this.r = r;
    this.bpm = night ? 76 : 116;
    this.swing = night ? 0.54 : 0.6;
    this.key = night ? 65 : [60, 60, 65, 62][this.section % 4] ; // C, C, F, D
    const progs = night ? NIGHT_PROGS : DAY_PROGS;
    this.prog = progs[(r() * progs.length) | 0];
    // arrangement: which instruments play this section
    const n = this.section;
    if (night) {
      this.arr = { pad: true, box: n % 3 !== 2, arp: true, bass: n % 2 === 1, shaker: n % 3 === 1, melody: n > 0 };
    } else {
      const k = n % 5;
      this.arr = {
        uke: true,
        bass: k !== 0 || n > 0,
        perc: k !== 0,
        kick: k === 1 || k === 2 || k === 4,
        whistle: k === 1 || k === 3,
        marimbaLead: k === 2 || k === 4,
        marimbaArp: k === 0 || k === 3 || k === 4,
        glock: k === 3 || k === 4,
        clap: k === 4,
      };
    }
    this.melody = this.makeMelody(night);
    this.counter = this.makeMelody(night, true);
  }

  chordAt(bar) {
    const d = this.prog[bar % 4];
    return [0, 2, 4, 6].map((i) => {
      const deg = d + i;
      return this.key + MAJOR[deg % 7] + 12 * Math.floor(deg / 7);
    });
  }

  // 4 bars (32 steps) of melody notes fitting the progression; played twice,
  // with the last bar resolving to the tonic.
  makeMelody(night, counter = false) {
    const r = this.r;
    const rhythms = night ? NIGHT_RHYTHMS : RHYTHMS;
    const rh = rhythms[(r() * rhythms.length) | 0];
    const notes = new Array(32).fill(null);
    // melody pitch as a scale index around the octave above the key
    let idx = counter ? 4 : 7 + ((r() * 3) | 0);
    for (let s = 0; s < 32; s++) {
      if (!rh[s % 16]) continue;
      if (counter && s % 4 !== 0) continue;
      const bar = (s / 8) | 0;
      const chord = this.prog[bar % 4];
      const strong = s % 4 === 0;
      if (strong) {
        // nearest chord tone to the current index
        let best = idx, bd = 99;
        for (let c = 0; c < 3; c++) for (let o = -1; o <= 2; o++) {
          const cand = chord + c * 2 + o * 7;
          const dd = Math.abs(cand - idx) + (r() < 0.3 ? r() * 2 : 0);
          if (dd < bd) { bd = dd; best = cand; }
        }
        idx = best;
      } else {
        const st = [-2, -1, -1, 1, 1, 2, 3][(r() * 7) | 0];
        idx += st;
      }
      const lo = counter ? 0 : 4, hi = counter ? 9 : 14;
      if (idx < lo) idx = lo + 1; if (idx > hi) idx = hi - 1;
      // length until the next onset
      let len = 1;
      while (s + len < 32 && !rh[(s + len) % 16] && len < 4) len++;
      notes[s] = { idx, len };
    }
    return notes;
  }

  noteMidi(idx) { return this.key + 12 + MAJOR[((idx % 7) + 7) % 7] + 12 * Math.floor(idx / 7); }

  stepDur(step) {
    const beat = 60 / this.bpm;
    return beat * (step % 2 === 0 ? this.swing : 1 - this.swing);
  }

  update() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    if (this.next < now - 0.05) this.next = now + 0.06; // resync after a stall / suspension
    let guard = 0;
    while (this.next < now + 0.4 && guard++ < 16) {
      try { this.schedule(this.step, this.next); } catch (e) { /* never break the loop over a note */ }
      this.next += this.stepDur(this.step);
      this.step++;
      if (this.step >= 64) { this.step = 0; this.newSection(); }
    }
  }

  // --- one 8th-note step ---------------------------------------------------
  schedule(step, t) {
    const night = this.style === 'night';
    const bar = (step / 8) | 0, s8 = step % 8;
    const chord = this.chordAt(bar);
    const A = this.arr;
    const last = bar === 7;
    const ed = this.stepDur(step);
    if (!night) {
      // ukulele strum: D . D U . U D U
      if (A.uke && [1, 0, 1, 1, 0, 1, 1, 1][s8] && !(last && s8 > 4)) {
        const down = s8 === 0 || s8 === 2 || s8 === 6;
        this.strum(chord, t, down ? 0.11 : 0.06, down);
      }
      if (last && s8 === 6 && A.uke) this.strum(this.chordAt(0), t, 0.1, true);
      // bass: root on 1, fifth on 3, walk-up pickup
      if (A.bass) {
        const root = chord[0] - 24 + (chord[0] - this.key > 6 ? -12 : 0);
        if (s8 === 0) this.bass(root, t, 0.3);
        else if (s8 === 4) this.bass(root + 7, t, 0.25);
        else if (s8 === 7 && this.r() < 0.5) this.bass(root + (this.r() < 0.5 ? 5 : 9), t, 0.12);
      }
      if (A.perc) {
        this.shaker(t, s8 % 2 === 0 ? 0.05 : 0.08);
        if (s8 === 2 || s8 === 6) this.block(t, s8 === 6 ? 1400 : 1100, 0.12);
        if (A.clap && (s8 === 2 || s8 === 6)) this.clap(t, 0.12);
      }
      if (A.kick && (s8 === 0 || s8 === 4)) this.kick(t, 0.32);
      if (A.marimbaArp && s8 % 2 === 0) {
        const n = chord[[0, 1, 2, 1][s8 / 2]] + 12;
        this.marimba(n, t, 0.09);
      }
      const mel = this.melody[step % 32];
      const isEnd = step >= 56;
      if (mel && !(isEnd && step > 56)) {
        const m = isEnd ? this.key + 12 : this.noteMidi(mel.idx);
        const len = isEnd ? 6 : mel.len;
        if (A.whistle) this.whistle(m + 12, t, ed * len * 1.9, 0.07);
        if (A.marimbaLead) this.marimba(m, t, 0.16);
      }
      if (A.glock) {
        const cn = this.counter[step % 32];
        if (cn && step % 8 === 4) this.glock(this.noteMidi(cn.idx) + 24, t, 0.05);
      }
      if (step === 0 && this.section % 5 === 0) this.glock(this.key + 36, t, 0.04);
    } else {
      if (A.pad && s8 === 0) this.pad(chord, t, ed * 8 * 1.05, 0.06);
      if (A.arp) {
        const order = [0, 1, 2, 3, 2, 1, 0, 2];
        this.pluck(chord[order[s8]], t, 0.085, 0.996);
      }
      if (A.bass && s8 === 0) this.bass(chord[0] - 24, t, 0.32, 2.2);
      if (A.shaker && s8 % 2 === 1) this.shaker(t, 0.025);
      const mel = this.melody[step % 32];
      if (A.melody && mel && step < 60) this.musicBox(this.noteMidi(mel.idx) + 12, t, 0.14);
      if (A.box && step % 16 === 15) this.musicBox(chord[2] + 24, t, 0.07);
    }
  }

  // --- instruments -----------------------------------------------------------
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  // Karplus-Strong plucked string, cached per note and damping.
  pluckBuffer(m, damp) {
    const key = m * 10 + Math.round((1 - damp) * 1000);
    let b = this.plucks.get(key);
    if (b) return b;
    const c = this.ctx, sr = c.sampleRate, f = mtof(m);
    const N = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * 1.4);
    b = c.createBuffer(1, len, sr);
    const d = b.getChannelData(0), ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    for (let i = 0; i < N; i++) ring[i] = (ring[i] + ring[(i + 1) % N]) * 0.5; // softer pick
    let p = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[p], nx = ring[(p + 1) % N];
      d[i] = cur;
      ring[p] = (cur + nx) * 0.5 * damp;
      p = (p + 1) % N;
    }
    this.plucks.set(key, b);
    return b;
  }

  pluck(m, t, vol, damp = 0.994) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.pluckBuffer(m, damp);
    const g = c.createGain(); g.gain.value = vol;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    s.connect(f); f.connect(g); g.connect(this.out); g.connect(this.a.reverbIn);
    s.start(t); s.stop(t + 1.4);
  }

  strum(chord, t, vol, down) {
    // reentrant-ish ukulele voicing in G4..A5
    const notes = [];
    for (const n of chord.slice(0, 3)) { let x = n; while (x < 64) x += 12; while (x > 79) x -= 12; notes.push(x); }
    notes.push(notes[0] + 12 > 81 ? notes[1] : notes[0] + 12);
    notes.sort((a, b) => a - b);
    if (!down) notes.reverse();
    notes.forEach((n, i) => this.pluck(n, t + i * 0.012, vol * (i === 0 ? 1 : 0.8), 0.993));
  }

  marimba(m, t, vol) {
    const c = this.ctx, f = mtof(m);
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 3.93;
    this.env(g, t, 0.004, vol, 0.55);
    this.env(g2, t, 0.002, vol * 0.35, 0.06);
    o.connect(g); o2.connect(g2); g.connect(this.out); g2.connect(this.out); g.connect(this.a.reverbIn);
    o.start(t); o2.start(t); o.stop(t + 0.62); o2.stop(t + 0.1);
  }

  glock(m, t, vol) {
    const c = this.ctx, f = mtof(m);
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.76;
    this.env(g, t, 0.002, vol, 1.0);
    o.connect(g); o2.connect(g); g.connect(this.out); g.connect(this.a.reverbIn);
    o.start(t); o2.start(t); o.stop(t + 1.05); o2.stop(t + 1.05);
  }

  musicBox(m, t, vol) {
    const c = this.ctx, f = mtof(m);
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 5.4;
    this.env(g, t, 0.003, vol, 1.6);
    this.env(g2, t, 0.001, vol * 0.25, 0.15);
    o.connect(g); o2.connect(g2); g.connect(this.out); g2.connect(this.out);
    g.connect(this.a.reverbIn); g.connect(this.a.reverbIn);
    o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 0.2);
  }

  whistle(m, t, dur, vol) {
    const c = this.ctx, f = mtof(m);
    const o = c.createOscillator(), g = c.createGain();
    const lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sine';
    const from = this.prevMel && Math.abs(this.prevMel - f) < f ? this.prevMel : f;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    this.prevMel = f;
    lfo.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.25, dur));
    lfo.connect(lg); lg.connect(o.frequency);
    const end = t + Math.max(0.08, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, end - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    // a little breath
    const n = c.createBufferSource(); n.buffer = this.a.noise;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = f * 1.5; nf.Q.value = 4;
    const ng = c.createGain(); this.env(ng, t, 0.01, vol * 0.25, 0.08);
    n.connect(nf); nf.connect(ng); ng.connect(this.out);
    o.connect(g); g.connect(this.out); g.connect(this.a.reverbIn);
    o.start(t); lfo.start(t); n.start(t, Math.random() * 0.5);
    o.stop(end + 0.02); lfo.stop(end + 0.02); n.stop(t + 0.12);
  }

  bass(m, t, vol, dec = 0.45) {
    const c = this.ctx, f = mtof(m);
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(220, t + 0.2);
    this.env(g, t, 0.006, vol, dec);
    o.connect(lp); lp.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dec + 0.05);
  }

  noiseHit(t, vol, freq, q, type, dur) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.a.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); this.env(g, t, 0.002, vol, dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.05);
  }
  shaker(t, vol) { this.noiseHit(t, vol, 7000, 1.2, 'highpass', 0.05); }
  clap(t, vol) { for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, vol * (i === 2 ? 1 : 0.6), 1500, 1.5, 'bandpass', i === 2 ? 0.12 : 0.02); }
  block(t, f, vol) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.05);
    this.env(g, t, 0.001, vol, 0.06);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.08);
  }
  kick(t, vol) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    this.env(g, t, 0.003, vol, 0.22);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.26);
  }

  pad(chord, t, dur, vol) {
    const c = this.ctx;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(this.out); g.connect(this.a.reverbIn);
    for (const m of chord) for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
  }
}
