// Input: every source (each gamepad, plus keyboard+mouse) produces the same
// virtual controller each poll:
//   { id, kind, l:{x,y,mag}, r:{x,y,mag}, lt, rt, lb, rb, a,b,x,y,
//     start, back, dpad:{up,down,left,right}, pressed:{...edges}, released:{...} }
// Gamepads use the standard (Xbox) mapping; up to 8 are supported.
//
// Keyboard + mouse: WASD move, mouse aims, left click = RT (use weapon),
// Space or right click = jump / web (A / LT), Q = throw (LB), E = recall (RB),
// F = swap (X), R = B, Esc = start, Z/X = d-pad left/right.

const DEADZONE = 0.2;

function readStick(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return { x: 0, y: 0, mag: 0 };
  const n = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
  return { x: (x / m) * n, y: (y / m) * n, mag: n };
}

const EDGE_KEYS = ['a', 'b', 'x', 'y', 'start', 'back', 'du', 'dd', 'dl', 'dr', 'lt', 'rt', 'lb', 'rb', 'ls', 'rs'];

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, l: false, r: false, seen: false };
    this.prev = new Map();
    this.states = [];
    this.keyboardSeen = false;
    this.anyActivity = false;
    this.mock = null;       // test hook: {id, ...fields} merged into that source
    this.toWorld = null;    // set by the game: (clientX, clientY) -> {x, y}
    this.mouseAimOrigin = null; // (id) -> {x,y} world point the mouse aims from
  }

  attach(win, canvas) {
    win.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.keyboardSeen = true;
      this.anyActivity = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    win.addEventListener('keyup', (e) => this.keys.delete(e.code));
    win.addEventListener('blur', () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true;
      this.anyActivity = true;
      if (e.button === 0) this.mouse.l = true;
      if (e.button === 2) this.mouse.r = true;
    });
    win.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.l = false;
      if (e.button === 2) this.mouse.r = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  keyboardState() {
    const k = (c) => this.keys.has(c);
    const ax = (neg, pos) => (k(pos) ? 1 : 0) - (k(neg) ? 1 : 0);
    const l = readStick(ax('KeyA', 'KeyD'), ax('KeyW', 'KeyS'));
    let r = readStick(ax('ArrowLeft', 'ArrowRight'), ax('ArrowUp', 'ArrowDown'));
    let mouseAim = false;
    if (!r.mag && this.mouse.seen && this.toWorld && this.mouseAimOrigin) {
      const o = this.mouseAimOrigin('keys');
      if (o) {
        const w = this.toWorld(this.mouse.x, this.mouse.y);
        const dx = w.x - o.x, dy = w.y - o.y, m = Math.hypot(dx, dy);
        if (m > 4) { r = { x: dx / m, y: dy / m, mag: 1 }; mouseAim = true; }
      }
    }
    return {
      id: 'keys', kind: 'keyboard', mouseAim,
      l, r,
      lt: this.mouse.r || k('ShiftLeft') ? 1 : 0,
      rt: this.mouse.l || k('ControlLeft') ? 1 : 0,
      lb: k('KeyQ'), rb: k('KeyE'),
      a: k('Space'), b: k('KeyR'), x: k('KeyF'), y: k('KeyC'),
      ls: false, rs: false,
      start: k('Escape') || k('Enter'), back: k('Backspace'),
      dpad: { up: k('Digit1'), down: k('Digit2'), left: k('KeyZ'), right: k('KeyX') },
    };
  }

  padState(pad) {
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const val = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
    return {
      id: 'pad' + pad.index, kind: 'pad', name: pad.id,
      l: readStick(pad.axes[0] || 0, pad.axes[1] || 0),
      r: readStick(pad.axes[2] || 0, pad.axes[3] || 0),
      lt: val(6), rt: val(7),
      lb: btn(4), rb: btn(5),
      a: btn(0), b: btn(1), x: btn(2), y: btn(3),
      ls: btn(10), rs: btn(11),
      start: btn(9), back: btn(8),
      dpad: { up: btn(12), down: btn(13), left: btn(14), right: btn(15) },
    };
  }

  poll() {
    const out = [];
    const pads = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      out.push(this.padState(pad));
    }
    if (this.keyboardSeen || this.mouse.l) out.push(this.keyboardState());
    if (this.mock) {
      const mocks = Array.isArray(this.mock) ? this.mock : [this.mock];
      for (const m of mocks) {
        const i = out.findIndex((s) => s.id === m.id);
        const base = i >= 0 ? out[i] : { ...NEUTRAL, id: m.id, kind: 'pad' };
        const merged = { ...base, ...m };
        if (i >= 0) out[i] = merged; else out.push(merged);
      }
    }
    for (const s of out) {
      const raw = {
        a: s.a, b: s.b, x: s.x, y: s.y, start: s.start, back: s.back,
        du: s.dpad.up, dd: s.dpad.down, dl: s.dpad.left, dr: s.dpad.right,
        lt: s.lt > 0.45, rt: s.rt > 0.45, lb: !!s.lb, rb: !!s.rb, ls: !!s.ls, rs: !!s.rs,
      };
      const prev = this.prev.get(s.id) || {};
      s.pressed = {};
      s.released = {};
      s.held = raw;
      for (const key of EDGE_KEYS) {
        s.pressed[key] = !!raw[key] && !prev[key];
        s.released[key] = !raw[key] && !!prev[key];
      }
      s.anyPressed = EDGE_KEYS.some((key) => s.pressed[key]);
      this.prev.set(s.id, raw);
      if (s.anyPressed) this.anyActivity = true;
    }
    this.states = out;
    return out;
  }

  get(id) {
    return this.states.find((s) => s.id === id) || null;
  }

  rumble(id, strong = 0.5, weak = 0.5, ms = 120) {
    if (!id || !id.startsWith('pad')) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[+id.slice(3)];
    const act = pad && pad.vibrationActuator;
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
}

const NOEDGE = Object.fromEntries(EDGE_KEYS.map((k) => [k, false]));
export const NEUTRAL = {
  id: 'none', kind: 'none',
  l: { x: 0, y: 0, mag: 0 }, r: { x: 0, y: 0, mag: 0 },
  lt: 0, rt: 0, lb: false, rb: false, a: false, b: false, x: false, y: false, ls: false, rs: false,
  start: false, back: false,
  dpad: { up: false, down: false, left: false, right: false },
  pressed: { ...NOEDGE }, released: { ...NOEDGE }, held: { ...NOEDGE }, anyPressed: false,
};
