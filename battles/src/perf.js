// Frame-rate watchdog for big battles.
//
// The game never blocks on the simulation: each frame runs only as many physics
// steps as fit in a wall-clock budget, so a heavy battle slows down instead of
// the controls freezing. When even one step is slower than the budget, some
// frames skip the simulation so the camera, menus and HUD keep updating. This
// module measures the frame rate and how fast the battle really runs, decides
// when to warn (the banner points to the Performance options) and drives the
// automatic resolution scale.
export const SIM_LOADS = [
  // ms: simulation time per frame before the rest of the steps are dropped;
  // duty: share of wall time the simulation may take when a single step is slower
  { name: 'Smooth controls', ms: 18, duty: 0.5 },
  { name: 'Balanced', ms: 40, duty: 0.7 },
  { name: 'Full speed', ms: 100, duty: 1 },
];
export const RES = [1, 0.75, 0.5, 0.35]; // render resolution scales (Options → Resolution)
const AUTO = [1, 0.8, 0.65, 0.5]; // automatic resolution steps (on top of RES)
const WINDOW = 0.5; // s: fps and battle speed are measured over this window

export class Perf {
  constructor() {
    this.fps = 60;
    this.speed = 1; // simulated time / wanted time (1 = the battle keeps up)
    this.simMs = 0; // wall ms the simulation took in the last frame that ran it
    this.stepMs = 0; // average wall ms of one physics step
    this.renderMs = 0; // frame time not spent in the simulation (render, GPU, UI)
    this.next = 0; // performance.now() before which the simulation sits out
    this.heavyT = 0; // s the load has been too high
    this.warn = false;
    this.auto = 0; // index into AUTO
    this.autoT = 0;
    this.w = { t: 0, n: 0, want: 0, done: 0, sim: 0 };
  }

  get autoScale() { return AUTO[this.auto]; }

  // once per frame: raw = real seconds since the last frame; sim = whether the
  // battle is meant to be running (time not frozen, not paused)
  tick(raw, sim) {
    const w = this.w;
    w.t += raw; w.n++;
    this.raw = raw;
    if (w.t >= WINDOW) {
      this.fps = w.n / w.t;
      this.speed = w.want > 0 ? Math.min(1, w.done / w.want) : 1;
      this.renderMs = Math.max(0, (w.t * 1000 - w.sim) / w.n);
      w.t = w.n = w.want = w.done = w.sim = 0;
    }
    const heavy = this.fps < 15 || (sim && this.speed < 0.45);
    // (one long frame - building a battle, loading a map - doesn't count on its own)
    this.heavyT = heavy ? this.heavyT + Math.min(raw, 0.25) : Math.max(0, this.heavyT - raw * 2);
    if (this.heavyT > 3) this.warn = true;
    else if (this.heavyT <= 0) this.warn = false;
  }

  // may the simulation run this frame?
  due(now) { return now >= this.next; }

  // a frame's simulation: done = sim seconds simulated (before the time scale),
  // compared with the real time that passed; steps = physics steps run, ms = wall
  // time they took
  ran(done, steps, ms, load) {
    const w = this.w;
    w.want += this.raw || 0; w.done += done; w.sim += ms;
    if (!steps) return;
    this.simMs = ms;
    this.stepMs = this.stepMs ? this.stepMs * 0.8 + (ms / steps) * 0.2 : ms / steps;
    // a step slower than the budget: give the next frames the rest of the time
    this.next = load.duty < 1 && ms > load.ms ? performance.now() + (ms * (1 - load.duty)) / load.duty : 0;
  }

  // automatic resolution: returns true when the scale changed. Lowers it while
  // the frames are slow for reasons other than the simulation (render / GPU),
  // raises it again once there's plenty of headroom.
  adapt(raw, on) {
    if (!on) { const ch = this.auto !== 0; this.auto = 0; return ch; }
    this.autoT += raw;
    if (this.autoT < 2.5) return false;
    if (this.renderMs > 45 && this.auto < AUTO.length - 1) { this.auto++; this.autoT = 0; return true; }
    if (this.renderMs < 12 && this.fps > 50 && this.auto > 0) { this.auto--; this.autoT = 0; return true; }
    return false;
  }
}
