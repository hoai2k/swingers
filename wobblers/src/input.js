// Input devices: Xbox / standard-mapping gamepads plus two keyboard schemes.
// Every device yields the same state shape each frame; `pressed` holds the
// buttons that went down this frame.

const BUTTONS = ['jump', 'ragdoll', 'punch', 'interact', 'sprint', 'start', 'back', 'emote', 'map', 'phone',
  'dUp', 'dDown', 'dLeft', 'dRight', 'grabLBtn', 'grabRBtn', 'rb', 'ls', 'rs'];

function blank() {
  const s = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, grabL: 0, grabR: 0, mouse: false };
  for (const b of BUTTONS) s[b] = false;
  return s;
}

const dead = (v, d = 0.18) => {
  const a = Math.abs(v);
  if (a < d) return 0;
  return Math.sign(v) * (a - d) / (1 - d);
};

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.taps = new Set(); // keys pressed since the last poll (so quick taps aren't lost)
    this.mouseTaps = 0;
    this.pollTaps = new Set();
    this.pollMouseTaps = 0;
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseButtons = 0;
    this.devices = new Map(); // id -> {state, prev}
    this.canvas = canvas;
    this.mock = null; // tests: { id: partialState }
    // UI capture: a captured device reports blank state/pressed to the game
    // while menus read its real input from `raw` / `rawPressed`.
    this.captured = new Set();
    this.prefs = null; // (id) => { invertY, sens } camera preferences
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      this.taps.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseButtons = 0; });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    addEventListener('mousedown', (e) => { this.mouseButtons |= (1 << e.button); this.mouseTaps |= (1 << e.button); });
    addEventListener('mouseup', (e) => { this.mouseButtons &= ~(1 << e.button); });
    addEventListener('contextmenu', (e) => e.preventDefault());
  }

  lockMouse() {
    if (document.pointerLockElement === this.canvas) return;
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch (e) { /* needs a user gesture; the canvas click retries */ }
  }

  // A key counts as held if it is down now or was tapped since the last poll.
  held() { const k = this.keys, t = this.pollTaps; return { has: (c) => k.has(c) || t.has(c) }; }
  // A key that went down since the last poll.
  tapped(code) { return this.pollTaps.has(code); }
  capture(id, on) {
    if (on) this.captured.add(id); else this.captured.delete(id);
  }

  kb1() {
    const k = this.held(), s = blank();
    s.moveX = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    s.moveY = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const l = Math.hypot(s.moveX, s.moveY); if (l > 1) { s.moveX /= l; s.moveY /= l; }
    s.lookX = this.mouseDX * 0.0025; s.lookY = this.mouseDY * 0.0025; s.mouse = true;
    s.jump = k.has('Space');
    // Wobbly Life's PC layout: X ragdoll, F interact, H horn, 1 emote wheel, M map
    s.ragdoll = k.has('KeyX') || k.has('KeyR');
    s.interact = k.has('KeyF') || k.has('KeyE');
    s.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    s.start = k.has('Escape') || k.has('Enter');
    s.back = k.has('Backspace');
    s.emote = k.has('Digit1');
    s.map = k.has('KeyM');
    s.phone = k.has('KeyP');
    const mb = this.mouseButtons | this.pollMouseTaps;
    s.punch = k.has('KeyG') || !!(mb & 2);
    s.grabL = (mb & 1) || k.has('KeyQ') ? 1 : 0;
    s.grabR = (mb & 4) || k.has('KeyC') ? 1 : 0;
    s.horn = k.has('KeyH');
    // quick emotes (the pad's D-pad): 2 wave, 3 cheer, 4 dance
    s.dUp = k.has('Digit2'); s.dLeft = k.has('Digit3'); s.dRight = k.has('Digit4');
    // Driving: W/S also act as gas/brake, Space handbrake.
    s.gas = s.moveY > 0 ? s.moveY : 0; s.brake = s.moveY < 0 ? -s.moveY : 0;
    s.steer = s.moveX;
    return s;
  }

  kb2() {
    const k = this.held(), s = blank();
    s.moveX = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    s.moveY = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    const l = Math.hypot(s.moveX, s.moveY); if (l > 1) { s.moveX /= l; s.moveY /= l; }
    s.lookX = ((k.has('Numpad6') ? 1 : 0) - (k.has('Numpad4') ? 1 : 0)) * 0.045;
    s.lookY = ((k.has('Numpad5') ? 1 : 0) - (k.has('Numpad8') ? 1 : 0)) * 0.03;
    s.jump = k.has('Numpad0');
    s.punch = k.has('Numpad2');
    s.ragdoll = k.has('Numpad7');
    s.interact = k.has('Numpad9');
    s.sprint = k.has('NumpadDecimal') || k.has('ControlRight');
    s.start = k.has('NumpadEnter');
    s.grabL = k.has('Numpad1') ? 1 : 0;
    s.grabR = k.has('Numpad3') ? 1 : 0;
    s.horn = k.has('NumpadAdd');
    s.emote = k.has('NumpadSubtract');
    s.map = k.has('NumpadDivide');
    s.phone = k.has('NumpadMultiply');
    s.gas = s.moveY > 0 ? s.moveY : 0; s.brake = s.moveY < 0 ? -s.moveY : 0;
    s.steer = s.moveX;
    return s;
  }

  pad(gp) {
    const s = blank(), b = gp.buttons, a = gp.axes;
    const bv = (i) => (b[i] ? (b[i].value || (b[i].pressed ? 1 : 0)) : 0);
    const bp = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
    let mx = dead(a[0] || 0), my = dead(a[1] || 0);
    s.moveX = mx; s.moveY = -my;
    const l = Math.hypot(s.moveX, s.moveY); if (l > 1) { s.moveX /= l; s.moveY /= l; }
    const rx = dead(a[2] || 0, 0.15), ry = dead(a[3] || 0, 0.15);
    s.lookX = rx * Math.abs(rx) * 0.07; s.lookY = ry * Math.abs(ry) * 0.05;
    s.jump = bp(0); s.ragdoll = bp(1); s.punch = bp(2); s.interact = bp(3);
    s.sprint = bp(4) || bp(10); s.rb = bp(5);
    s.grabL = bv(6); s.grabR = bv(7);
    s.back = bp(8); s.start = bp(9); s.rs = bp(11);
    s.dUp = bp(12); s.dDown = bp(13); s.dLeft = bp(14); s.dRight = bp(15);
    // RB held: emote wheel; View: map; D-pad down: phone (call a vehicle)
    s.emote = bp(5); s.map = bp(8); s.phone = bp(13);
    s.gas = bv(7); s.brake = bv(6); s.steer = s.moveX; s.horn = bp(2);
    return s;
  }

  poll() {
    this.pollTaps = this.taps; this.taps = new Set();
    this.pollMouseTaps = this.mouseTaps; this.mouseTaps = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const seen = new Set();
    const set = (id, s) => {
      seen.add(id);
      let d = this.devices.get(id);
      if (!d) { d = { state: blank(), prev: blank(), pressed: {}, raw: blank() }; this.devices.set(id, d); }
      const pf = this.prefs ? this.prefs(id) : null;
      if (pf) {
        s.lookX *= pf.sens;
        s.lookY *= pf.sens * (pf.invertY ? -1 : 1);
      }
      const prev = d.raw || blank();
      const pr = {};
      for (const b of BUTTONS.concat(['horn'])) pr[b] = !!s[b] && !prev[b];
      pr.grabL = s.grabL > 0.5 && !(prev.grabL > 0.5);
      pr.grabR = s.grabR > 0.5 && !(prev.grabR > 0.5);
      d.raw = s; d.rawPressed = pr;
      d.prev = d.state;
      if (this.captured.has(id)) { d.state = Object.assign(blank(), { gas: 0, brake: 0, steer: 0, mouse: s.mouse }); d.pressed = {}; }
      else { d.state = s; d.pressed = pr; }
    };
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      set('gp' + gp.index, this.pad(gp));
    }
    set('kb1', this.kb1());
    set('kb2', this.kb2());
    if (this.mock) {
      for (const id in this.mock) set(id, Object.assign(blank(), { gas: 0, brake: 0, steer: 0 }, this.mock[id]));
    }
    for (const id of [...this.devices.keys()]) if (!seen.has(id)) this.devices.delete(id);
    this.mouseDX = 0; this.mouseDY = 0;
  }

  get(id) { return this.devices.get(id); }
  kind(id) { return id === 'kb1' ? 'kb1' : id === 'kb2' ? 'kb2' : 'pad'; }
  // Device ids that pressed "join" this frame.
  joinPresses() {
    const out = [];
    for (const [id, d] of this.devices) {
      if (id === 'kb1' && (d.pressed.start && this.held().has('Enter') || d.pressed.jump)) out.push(id);
      else if (id === 'kb2' && (d.pressed.start || d.pressed.jump)) out.push(id);
      else if (id.startsWith('gp') && (d.pressed.jump || d.pressed.start)) out.push(id);
      else if (id.startsWith('mock') && d.pressed.start) out.push(id);
    }
    return out;
  }
}
