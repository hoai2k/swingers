// Input abstraction: every "source" (a gamepad, or the keyboard) produces the
// same virtual controller state each poll:
//   { id, l:{x,y,mag}, r:{x,y,mag}, lt, rt, a,b,x,y,start,back,
//     dpad:{up,down,left,right}, pressed:{...edge-triggered booleans} }
//
// Gamepads use the standard mapping (Xbox layout). Bumpers also count as
// grabs for controllers with mushy triggers.

const DEADZONE = 0.22;

function readStick(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return { x: 0, y: 0, mag: 0 };
  const n = Math.min(1, (m - DEADZONE) / (1 - DEADZONE));
  return { x: (x / m) * n, y: (y / m) * n, mag: n };
}

const EDGE_KEYS = ['a', 'b', 'x', 'y', 'start', 'back', 'du', 'dd', 'dl', 'dr', 'ltd', 'rtd'];

export class Input {
  constructor() {
    this.keys = new Set();
    this.prev = new Map();       // sourceId -> previous raw button snapshot
    this.states = [];            // last poll result
    this.keyboardSeen = false;
    this.anyActivity = false;    // true after first button anywhere (for audio unlock)
  }

  attach(target) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.keyboardSeen = true;
      this.anyActivity = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  // ---- keyboard as a virtual controller ------------------------------------
  keyboardState() {
    const k = (c) => this.keys.has(c);
    const ax = (neg, pos) => (k(pos) ? 1 : 0) - (k(neg) ? 1 : 0);
    const l = readStick(ax('KeyA', 'KeyD'), ax('KeyW', 'KeyS'));
    const r = readStick(ax('ArrowLeft', 'ArrowRight'), ax('ArrowUp', 'ArrowDown'));
    return {
      id: 'keys', kind: 'keyboard',
      l, r,
      lt: k('ShiftLeft') || k('KeyQ') ? 1 : 0,
      rt: k('ShiftRight') || k('KeyE') ? 1 : 0,
      a: k('Enter'), b: k('Space'), x: k('KeyX'), y: k('KeyC'),
      start: k('Escape') || k('KeyP'), back: k('Backspace'),
      dpad: { up: k('Digit3'), down: k('Digit4'), left: k('Digit1'), right: k('Digit2') },
    };
  }

  padState(pad) {
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const val = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
    return {
      id: 'pad' + pad.index, kind: 'pad',
      l: readStick(pad.axes[0] || 0, pad.axes[1] || 0),
      r: readStick(pad.axes[2] || 0, pad.axes[3] || 0),
      lt: Math.max(val(6), btn(4) ? 1 : 0),
      rt: Math.max(val(7), btn(5) ? 1 : 0),
      a: btn(0), b: btn(1), x: btn(2), y: btn(3),
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
    if (this.keyboardSeen) out.push(this.keyboardState());

    // Edge detection.
    for (const s of out) {
      const raw = {
        a: s.a, b: s.b, x: s.x, y: s.y, start: s.start, back: s.back,
        du: s.dpad.up, dd: s.dpad.down, dl: s.dpad.left, dr: s.dpad.right,
        ltd: s.lt > 0.5, rtd: s.rt > 0.5,
      };
      const prev = this.prev.get(s.id) || {};
      s.pressed = {};
      for (const key of EDGE_KEYS) s.pressed[key] = !!raw[key] && !prev[key];
      this.prev.set(s.id, raw);
      if (raw.a || raw.b || raw.start || raw.ltd || raw.rtd) this.anyActivity = true;
    }

    this.states = out;
    return out;
  }

  get(id) {
    return this.states.find((s) => s.id === id) || null;
  }
}

// Neutral controller for players whose pad disconnected mid-round.
export const NEUTRAL = {
  id: 'none', kind: 'none',
  l: { x: 0, y: 0, mag: 0 }, r: { x: 0, y: 0, mag: 0 },
  lt: 0, rt: 0, a: false, b: false, x: false, y: false, start: false, back: false,
  dpad: { up: false, down: false, left: false, right: false },
  pressed: { a: false, b: false, x: false, y: false, start: false, back: false, du: false, dd: false, dl: false, dr: false, ltd: false, rtd: false },
};
