// Two players, each an Xbox-style pad (standard mapping) merged with a keyboard
// layout so the game is also playable/testable without controllers.
const BTN = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right', 'guide'];

const KEYS = [
  { // Player 1 keyboard (left side)
    move: { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] },
    look: { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] },
    btn: {
      Space: 'a', KeyR: 'b', KeyF: 'x', KeyY: 'y', KeyQ: 'lb', KeyE: 'rb', KeyZ: 'lt', KeyC: 'rt',
      Tab: 'back', Enter: 'start', Escape: 'start', ShiftLeft: 'l3', KeyV: 'r3',
      Digit1: 'left', Digit2: 'right', Digit3: 'up', Digit4: 'down',
    },
  },
  { // Player 2 keyboard (right side / numpad)
    move: { KeyI: [0, -1], KeyK: [0, 1], KeyJ: [-1, 0], KeyL: [1, 0] },
    look: { Numpad8: [0, -1], Numpad5: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0] },
    btn: {
      Numpad0: 'a', NumpadDecimal: 'b', NumpadEnter: 'x', NumpadAdd: 'y', KeyU: 'lb', KeyO: 'rb',
      Numpad7: 'lt', Numpad9: 'rt', NumpadSubtract: 'back', NumpadMultiply: 'start', ShiftRight: 'l3', NumpadDivide: 'r3',
      Numpad1: 'left', Numpad3: 'right', Digit8: 'up', Digit9: 'down', KeyH: 'a', KeyN: 'b', KeyM: 'x', KeyP: 'y',
    },
  },
];

function blank() {
  const b = {};
  for (const k of BTN) b[k] = false;
  return { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, b };
}

function dead(x, y, dz = 0.16) {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k];
}

export class Input {
  constructor() {
    this.keys = new Set();
    this.players = [this.mk(), this.mk()];
    this.inject = [null, null];
    this.mouse = { dx: 0, dy: 0, right: false, left: false, wheel: 0 };
    this.padNames = [null, null];
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
      this.anyInput = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (this.mouse.right || document.pointerLockElement) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    addEventListener('mousedown', (e) => {
      if (e.button === 2) this.mouse.right = true;
      if (e.button === 0) this.mouse.left = true;
      this.anyInput = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this.mouse.right = false;
      if (e.button === 0) this.mouse.left = false;
    });
    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  mk() { return { cur: blank(), prev: blank(), held: {}, source: 'keyboard' }; }

  poll(dt) {
    const pads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter((p) => p && p.connected);
    for (let i = 0; i < 2; i++) {
      const pl = this.players[i];
      const prev = pl.prev; pl.prev = pl.cur; pl.cur = prev;
      const s = pl.cur;
      const z = blank();
      Object.assign(s, z); s.b = z.b;
      const pad = pads[i];
      this.padNames[i] = pad ? pad.id : null;
      pl.source = pad ? 'pad' : 'keyboard';
      if (pad) {
        const ax = pad.axes;
        [s.lx, s.ly] = dead(ax[0] || 0, ax[1] || 0);
        [s.rx, s.ry] = dead(ax[2] || 0, ax[3] || 0);
        const bt = pad.buttons;
        for (let k = 0; k < BTN.length; k++) if (bt[k] && (bt[k].pressed || bt[k].value > 0.5)) s.b[BTN[k]] = true;
        s.lt = bt[6] ? bt[6].value : 0;
        s.rt = bt[7] ? bt[7].value : 0;
        if (s.b.a || s.b.start || Math.abs(s.lx) > 0.5) this.anyInput = true;
      }
      // keyboard layout
      const km = KEYS[i];
      let mx = 0, my = 0, lx = 0, ly = 0;
      for (const [k, v] of Object.entries(km.move)) if (this.keys.has(k)) { mx += v[0]; my += v[1]; }
      for (const [k, v] of Object.entries(km.look)) if (this.keys.has(k)) { lx += v[0]; ly += v[1]; }
      if (mx || my) { const m = Math.hypot(mx, my); s.lx = mx / m; s.ly = my / m; }
      if (lx || ly) { s.rx = lx * 0.8; s.ry = ly * 0.8; }
      for (const [k, v] of Object.entries(km.btn)) if (this.keys.has(k)) s.b[v] = true;
      if (s.b.lt) s.lt = 1;
      if (s.b.rt) s.rt = 1;
      if (i === 0) {
        // mouse look / click for player 1
        if (this.mouse.right || document.pointerLockElement) { s.rx += this.mouse.dx * 0.08; s.ry += this.mouse.dy * 0.08; }
        if (this.mouse.left) s.b.a = true;
        if (this.mouse.wheel > 0) s.b.right = true;
        if (this.mouse.wheel < 0) s.b.left = true;
        this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
      }
      const inj = this.inject[i];
      if (inj) {
        for (const k of ['lx', 'ly', 'rx', 'ry', 'lt', 'rt']) if (inj[k] !== undefined) s[k] = inj[k];
        if (inj.b) for (const k of Object.keys(inj.b)) s.b[k] = inj.b[k];
      }
      s.b.lt = s.b.lt || s.lt > 0.5;
      s.b.rt = s.b.rt || s.rt > 0.5;
      for (const k of BTN) pl.held[k] = s.b[k] ? (pl.held[k] || 0) + dt : 0;
    }
  }

  // queries
  down(p, k) { return this.players[p].cur.b[k]; }
  pressed(p, k) { return this.players[p].cur.b[k] && !this.players[p].prev.b[k]; }
  released(p, k) { return !this.players[p].cur.b[k] && this.players[p].prev.b[k]; }
  held(p, k) { return this.players[p].held[k] || 0; }
  anyPressed(k) { return this.pressed(0, k) || this.pressed(1, k); }
  state(p) { return this.players[p].cur; }
  // auto-repeat for menus / unit bar: true on press and then every `rate` s while held
  repeat(p, k, delay = 0.35, rate = 0.12) {
    const h = this.players[p].held[k] || 0;
    if (this.pressed(p, k)) return true;
    if (h > delay) {
      const prev = h - (this._dt || 1 / 60);
      return Math.floor((h - delay) / rate) !== Math.floor((prev - delay) / rate);
    }
    return false;
  }
  // stick as discrete direction with repeat (for menus)
  stickDir(p, axis, sign) {
    const s = this.players[p];
    const v = s.cur[axis] * sign, pv = s.prev[axis] * sign;
    return v > 0.6 && pv <= 0.6;
  }
}
