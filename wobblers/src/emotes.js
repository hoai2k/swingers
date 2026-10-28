// Emotes, as in Wobbly Life: a radial emote wheel per player (hold the emote
// button, pick a slice with a stick / the mouse / the arrows, release to
// play) and D-pad quick emotes (up wave, right dance; the keyboards' 3 cheers: D-pad left is the pad's ragdoll). Emotes are
// animations of the active ragdoll: each one overrides joint targets and
// gains (and nudges the balance targets, hover height and a few impulses)
// over time, so the PD drives and gravity make them wobbly, not keyframed.
//
// Hooks: game.js creates `game.emotes = new Emotes(game)` and calls
// `emotes.input(player, device)` from handlePlayerInput; ui.js calls
// `emotes.draw(views)` each frame; player.js calls `emoteStep(...)` right
// after Player.animate() and reads `player.emoteBody` (lean, roll, twist,
// dip) in its balance and hover code.
import * as THREE from 'three';
import { DT, PLAYER_CSS } from './config.js';
import { glyph, deviceKind } from './glyphs.js';

const qeul = (x, y, z, o = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));
const qx = (a) => qeul(a, 0, 0);
const qz = (a) => qeul(0, 0, a);
const smooth = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const ARMS = [['L', 1], ['R', -1]];

// little hop through impulses (like a small jump), only from the ground
function hop(p, v) {
  if (!p.grounded || p.jumpCool > 0) return false;
  for (const b of p.bodies) { const bv = b.linvel(); b.applyImpulse({ x: 0, y: (v - bv.y) * b.mass(), z: 0 }, true); }
  p.jumpCool = 0.3; p.sqV -= 1.6; p.landDip = 0;
  return true;
}
const snd = (p, name, k = 1) => p.game.audio?.play(name, p.pos(), k);

// ---- icons: little stick figures in the emote's pose (48x48) --------------
const fig = (body) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const HEAD = (x = 24, y = 10, r = 6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
const LEGS = '<path d="M24 31 L18 43 M24 31 L30 43"/>';
const ICONS = {
  wave: fig(HEAD() + '<path d="M24 17 V31"/>' + LEGS + '<path d="M24 20 L15 29 M24 20 L33 14 L35 5"/><path d="M40 4 q3 4 0 8 M43 2 q4 6 0 12" stroke-width="2.4"/>'),
  cheer: fig(HEAD(24, 12) + '<path d="M24 19 V31"/><path d="M24 31 L19 40 M24 31 L29 40"/><path d="M24 22 L14 7 M24 22 L34 7"/><path d="M14 46 H34" stroke-width="2.4"/>'),
  dance: fig(HEAD(25, 10) + '<path d="M25 17 L22 31"/><path d="M22 31 L14 37 L17 44 M22 31 L30 43"/><path d="M24 20 L35 12 M24 20 L14 25"/><path d="M38 40 V28 l6 -2" stroke-width="2.6"/><circle cx="36" cy="40" r="2.6" fill="currentColor" stroke="none"/>'),
  clap: fig(HEAD() + '<path d="M24 17 V31"/>' + LEGS + '<path d="M24 20 L14 25 L22 27 M24 20 L34 25 L26 27"/><path d="M10 15 l-3 -3 M38 15 l3 -3 M24 33 v0" stroke-width="2.6"/><path d="M8 22 h-4 M40 22 h4" stroke-width="2.6"/>'),
  point: fig(HEAD(20, 10) + '<path d="M20 17 V31"/><path d="M20 31 L14 43 M20 31 L26 43"/><path d="M20 20 L43 18 M20 20 L13 29"/><path d="M38 13 L44 18 L38 23" stroke-width="2.6"/>'),
  flex: fig(HEAD(24, 12) + '<path d="M24 19 V31"/>' + LEGS + '<path d="M24 21 H12 V10 M24 21 H36 V10"/><circle cx="12" cy="8" r="3.4" fill="currentColor" stroke="none"/><circle cx="36" cy="8" r="3.4" fill="currentColor" stroke="none"/>'),
  laugh: fig('<circle cx="24" cy="24" r="17"/><path d="M14 19 q3 -4 6 0 M28 19 q3 -4 6 0" stroke-width="3"/><path d="M14 27 Q24 40 34 27 Z" fill="currentColor"/>'),
  sit: fig(HEAD(16, 14) + '<path d="M16 21 L18 35"/><path d="M18 35 L32 31 L40 40"/><path d="M17 24 L9 36"/><path d="M4 42 H44" stroke-width="2.4"/>'),
  flop: fig(HEAD(9, 34, 5.5) + '<path d="M15 35 H31"/><path d="M31 35 L42 30 M31 35 L42 41"/><path d="M18 35 L22 26 M18 35 L23 43"/><path d="M30 8 h6 l-6 7 h6 M39 16 h4 l-4 5 h4" stroke-width="2.4"/>'),
  bow: fig(HEAD(36, 20, 5.5) + '<path d="M18 29 L31 20"/><path d="M18 29 L16 44 M18 29 L22 44"/><path d="M27 23 L27 34"/>'),
};

// ---- the emotes -------------------------------------------------------------
// pose(p, t, A): A.set(part, quat, kp, kd) overrides a joint drive, A.body is
// p.emoteBody (lean / roll / twist / dip), A.e the emote's own scratch state.
// seat: also playable as a passenger (arms only). dur: seconds (null loops).
export const EMOTES = [
  {
    id: 'wave', name: 'Wave', seat: true, dur: 2.3, sound: 'pop',
    pose(p, t, A) {
      const w = Math.sin(t * 11);
      A.assist = 2;
      A.set('uArmR', qeul(-0.25 + 0.08 * w, 0, -2.3), 520, 22);
      A.set('lArmR', qz(-0.5 + 0.5 * w), 380, 12); // forearm swings past upright
      if (!A.seated) {
        A.set('uArmL', qeul(0.1, 0, 0.2), 200, 10, false);
        A.body.roll = -0.08; A.body.lean = -0.05;
      }
      A.set('head', qeul(-0.1, 0, 0.18 * Math.sin(t * 5.5)), 260, 12);
    },
  },
  {
    id: 'point', name: 'Point', seat: true, dur: 2.0, sound: 'pop',
    pose(p, t, A) {
      // jab forward twice, then hold it there
      const jab = Math.max(0, Math.sin(Math.min(t, 0.9) * Math.PI / 0.45)) * 0.25;
      A.assist = 2;
      A.set('uArmR', qeul(-1.45 - jab, 0, 0.12), 640, 24);
      A.set('lArmR', qx(-0.05), 520, 18);
      if (!A.seated) {
        A.set('uArmL', qeul(0.25, 0, 0.75), 300, 12);
        A.set('lArmL', qeul(0, 0, -1.9), 260, 10); // hand on the hip
        A.body.lean = 0.12 + jab * 0.4; A.body.twist = 0.1;
      }
      A.set('head', qeul(0.1 + jab * 0.6, -0.1, 0), 300, 14);
    },
  },
  {
    id: 'dance', name: 'Dance', dur: null, sound: 'boing',
    pose(p, t, A) {
      const b = t * Math.PI * 2 * 1.9; // ~114 bpm
      const bar = Math.floor(t * 1.9 / 4) % 2; // switch moves every 4 beats
      const s = Math.sin(b), s2 = Math.sin(b * 0.5);
      A.body.roll = 0.22 * s; A.body.twist = 0.35 * s2; A.body.dip = 0.035 * (1 + Math.cos(b * 2)) * 0.8;
      A.body.lean = 0.05;
      // knees pump in turn
      const kl = Math.max(0, s), kr = Math.max(0, -s);
      A.set('uLegL', qx(-0.55 * kl), 170, 12); A.set('lLegL', qx(0.9 * kl + 0.1), 140, 10);
      A.set('uLegR', qx(-0.55 * kr), 170, 12); A.set('lLegR', qx(0.9 * kr + 0.1), 140, 10);
      if (bar === 0) {
        // disco: point up to one side, down to the other, swapping on the beat
        const up = s2 > 0 ? 'L' : 'R';
        for (const [h, sg] of ARMS) {
          if (h === up) { A.set('uArm' + h, qeul(-0.6, 0, sg * 2.5), 460, 18); A.set('lArm' + h, qx(-0.05), 340, 12); }
          else { A.set('uArm' + h, qeul(-0.3, 0, -sg * 0.35), 360, 14); A.set('lArm' + h, qx(-0.2), 280, 10); }
        }
      } else {
        // arms out, waving side to side like noodles
        for (const [h, sg] of ARMS) {
          A.set('uArm' + h, qeul(-0.5 + 0.4 * s, 0, sg * (1.2 + 0.5 * Math.sin(b + (h === 'L' ? 0 : Math.PI)))), 300, 10);
          A.set('lArm' + h, qz(sg * (0.7 * s)), 220, 7);
        }
      }
      A.set('head', qeul(0.22 * Math.sin(b * 2), 0, -0.2 * s), 280, 12);
    },
  },
  {
    id: 'clap', name: 'Clap', seat: true, dur: 2.6, sound: null,
    pose(p, t, A) {
      const w = t * Math.PI * 2 * 2.4;
      const open = 0.5 + 0.5 * Math.cos(w);
      const cyc = Math.floor(t * 2.4 + 0.5);
      if (cyc !== A.e.clap && t > 0.15) { A.e.clap = cyc; snd(p, 'clack', 1.2); }
      for (const [h, sg] of ARMS) {
        A.set('uArm' + h, qeul(-1.15, 0, -sg * (0.95 - 0.75 * open)), 620, 20);
        A.set('lArm' + h, qeul(-0.35, 0, -sg * 0.35), 440, 14);
      }
      if (!A.seated) { A.body.lean = 0.06; A.body.dip = 0.02 * open; }
      A.set('head', qeul(0.1 * open, 0, 0), 280, 12);
    },
  },
  {
    id: 'flex', name: 'Flex', seat: true, dur: 2.6, sound: 'grab',
    pose(p, t, A) {
      // strike a pose, then squeeze on a pulse
      const k = (t % 0.65) / 0.65, pulse = k < 0.3 ? Math.sin(k / 0.3 * Math.PI) : 0;
      const pi = Math.floor(t / 0.65);
      if (pi !== A.e.pulse && t > 0.3) { A.e.pulse = pi; p.sqV += 1.6; snd(p, 'pop', 0.5); }
      for (const [h, sg] of ARMS) {
        A.set('uArm' + h, qeul(-0.15, 0, sg * (1.5 + 0.12 * pulse)), 600, 18);
        A.set('lArm' + h, qz(sg * (1.75 + 0.35 * pulse)), 480, 14);
      }
      if (!A.seated) { A.body.lean = -0.12 - 0.08 * pulse; A.body.dip = -0.02 * pulse; }
      A.set('head', qeul(-0.25, 0.25 * Math.sin(t * 2), 0), 280, 12);
    },
  },
  {
    id: 'bow', name: 'Bow', dur: 2.2, sound: 'swish',
    pose(p, t, A) {
      const down = smooth((t - 0.25) / 0.5) * (1 - smooth((t - 1.4) / 0.5));
      A.body.lean = 0.95 * down; A.body.dip = 0.04 * down;
      A.set('uArmR', qeul(-0.8 * down - 0.1, 0, 0.55 * down), 420, 16);
      A.set('lArmR', qz(1.4 * down), 320, 12); // hand across the belly
      A.set('uArmL', qeul(0.6 * down, 0, 0.2), 360, 14);
      A.set('lArmL', qz(-1.2 * down), 280, 10); // behind the back
      A.set('head', qeul(0.35 * down, 0, 0), 260, 12);
    },
  },
  {
    id: 'sit', name: 'Sit', dur: null, sound: 'seat',
    pose(p, t, A) {
      const u = smooth(t / 0.6);
      A.body.dip = 0.31 * u; A.body.lean = -0.2 * u;
      for (const [h, sg] of ARMS) {
        A.set('uLeg' + h, qeul(-1.45 * u, 0, sg * 0.12), 170, 14);
        A.set('lLeg' + h, qx(0.25 + 0.1 * Math.sin(t * 1.3 + sg)), 130, 10);
        A.set('uArm' + h, qeul(0.65 * u, 0, sg * 0.4), 260, 12);
        A.set('lArm' + h, qx(-0.05), 200, 10);
      }
      // look around now and then, idle foot tap
      A.set('head', qeul(0.05, 0.5 * Math.sin(t * 0.6), 0.08 * Math.sin(t * 0.9)), 220, 12);
    },
  },
  {
    id: 'flop', name: 'Flop', dur: 0.01, sound: 'wheee',
    // flop over backwards into a full ragdoll (get up with A / B as usual)
    start(p) {
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      p.state = 'limp'; p.limpTimer = 0; p.releaseAll(); p.mantle = null;
      p.chest.applyImpulse({ x: -fx * 2.6 * p.chest.mass(), y: 1.2 * p.chest.mass(), z: -fz * 2.6 * p.chest.mass() }, true);
      p.parts.head.body.applyImpulse({ x: -fx * 2.5 * p.parts.head.body.mass(), y: 0, z: -fz * 2.5 * p.parts.head.body.mass() }, true);
      for (const h of ['L', 'R']) { const b = p.parts['uArm' + h].body; b.applyImpulse({ x: 0, y: 2.5 * b.mass(), z: 0 }, true); }
      p.impactGrace = 0.6;
    },
    pose() {},
  },
  {
    id: 'cheer', name: 'Cheer', seat: true, dur: 2.5, sound: 'wheee',
    pose(p, t, A) {
      const w = Math.sin(t * 9);
      for (const [h, sg] of ARMS) {
        A.set('uArm' + h, qeul(-0.35, 0, sg * (2.65 + 0.22 * (h === 'L' ? w : -w))), 520, 18);
        A.set('lArm' + h, qz(sg * (0.25 + 0.3 * w)), 360, 10);
      }
      A.set('head', qeul(-0.35, 0, 0.12 * w), 260, 12);
      if (A.seated) return;
      // little hops with the knees tucked in the air
      const hi = Math.floor((t - 0.2) / 0.55);
      if (t > 0.2 && hi !== A.e.hop && t < 2.1 && hop(p, 2.6)) { A.e.hop = hi; snd(p, 'jump', 0.6); }
      if (!p.grounded) for (const [h] of ARMS) { A.set('uLeg' + h, qx(-0.7), 140, 10); A.set('lLeg' + h, qx(1.2), 120, 9); }
      A.body.lean = -0.1;
    },
  },
  {
    id: 'laugh', name: 'Laugh', seat: true, dur: 2.7, sound: null,
    pose(p, t, A) {
      const sh = Math.sin(t * 21), double = smooth((t - 0.9) / 0.4);
      // "ha ha ha ha"
      const hi = Math.floor(t / 0.24);
      if (hi !== A.e.ha && hi < 7) { A.e.ha = hi; snd(p, 'jump', 0.55); }
      for (const [h, sg] of ARMS) {
        // hands on the belly
        A.set('uArm' + h, qeul(-0.55 - 0.1 * sh, 0, -sg * 0.1), 420, 14);
        A.set('lArm' + h, qeul(-1.2, 0, -sg * 0.6), 340, 12);
      }
      A.set('head', qeul(-0.45 * (1 - double) + 0.25 * double + 0.12 * sh, 0, 0.1 * Math.sin(t * 7)), 300, 10);
      if (A.seated) return;
      A.body.lean = -0.2 * (1 - double) + 0.5 * double;
      A.body.twist = 0.1 * sh; A.body.roll = 0.07 * Math.sin(t * 17);
      A.body.dip = 0.035 * Math.abs(sh) + 0.05 * double;
    },
  },
];
const BY_ID = Object.fromEntries(EMOTES.map((e) => [e.id, e]));
const QUICK = { dUp: 'wave', dLeft: 'cheer', dRight: 'dance' };

// ---- physics side: called by Player.step after animate() ---------------------
export function canEmote(p, def) {
  if (p.state === 'limp' || p.swimming || p.mantle || p.stumble > 0) return false;
  if (p.state === 'seated') return p.seat?.kind !== 'driver' && !!def.seat;
  return true;
}

export function startEmote(p, id) {
  const def = BY_ID[id];
  if (!def || !canEmote(p, def)) return false;
  p.emote = { def, t: 0 };
  p.emoteBody = { lean: 0, roll: 0, twist: 0, dip: 0 };
  if (def.sound) snd(p, def.sound, 0.9);
  def.start?.(p);
  return true;
}

export function stopEmote(p) { p.emote = null; p.emoteBody = null; }

export function emoteStep(p, inp, pressed, mag, limp, seated) {
  const e = p.emote, def = e.def;
  e.t += DT;
  const grab = (inp.grabL || 0) > 0.3 || (inp.grabR || 0) > 0.3;
  const cancel = (def.dur && e.t > def.dur) || mag > 0.3 || pressed.jump || pressed.punch || pressed.ragdoll || pressed.dash || grab
    || limp || p.swimming || p.mantle || p.stumble > 0
    || (seated ? (p.seat?.kind === 'driver' || !def.seat) : p.airTime > 0.8);
  if (cancel) { stopEmote(p); return; }
  const P = p.parts;
  const body = p.emoteBody;
  body.lean = body.roll = body.twist = body.dip = 0;
  const A = {
    e, body, seated,
    set(n, q, kp, kd, float = true) {
      if (seated && (n.includes('Leg'))) return; // passengers keep their seated legs
      const part = P[n]; part.target.copy(q); part.kp = kp; part.kd = kd; part.maxT = 1e9; part.float = float;
      if (n.startsWith('lArm') && float) A.arms[n.slice(4)] = A.assist ?? 1;
    },
  };
  A.arms = {};
  def.pose(p, e.t, A);
  for (const h in A.arms) armAssist(p, h, A.arms[h]);
}

// Arms are light chains on soft drives and whirl about rather than settle
// into a pose (see Player.handAssist). Steer the elbow and the mitten toward
// where the posed arm puts them, reaction on the chest, so the pose reads
// while the drives still wobble around it. k: assist strength (0..1).
const HAND_DROP = 0.104; // mitten centre below the lower-arm centre (HAND_OFF)
const _q = new THREE.Quaternion(), _qu = new THREE.Quaternion(), _v = new THREE.Vector3(), _sh = new THREE.Vector3(), _el = new THREE.Vector3(), _hd = new THREE.Vector3(), _ae = new THREE.Vector3(), _ah = new THREE.Vector3();
function armAssist(p, h, k) {
  const u = p.parts['uArm' + h], l = p.parts['lArm' + h], chest = p.chest, cr = chest.rotation(), ct = chest.translation();
  if (!u.len) { u.len = _v.copy(l.rest).add(l.anchor).sub(u.rest).sub(u.anchor).length(); l.len = -l.anchor.y + HAND_DROP; }
  _q.set(cr.x, cr.y, cr.z, cr.w);
  _sh.copy(u.rest).add(u.anchor).sub(p.parts.chest.rest).applyQuaternion(_q).add(_v.set(ct.x, ct.y, ct.z));
  _qu.copy(_q).multiply(u.target);
  _el.set(0, -u.len, 0).applyQuaternion(_qu).add(_sh);
  _hd.set(0, -l.len, 0).applyQuaternion(_qu.multiply(l.target)).add(_el);
  // where they are now
  const lr = l.body.rotation(), lt = l.body.translation();
  _q.set(lr.x, lr.y, lr.z, lr.w);
  _ae.copy(l.anchor).applyQuaternion(_q).add(_v.set(lt.x, lt.y, lt.z));
  _ah.set(0, -HAND_DROP, 0).applyQuaternion(_q).add(_v.set(lt.x, lt.y, lt.z));
  const cv = chest.linvel(), KP = 60, KD = 24, AM = 80; // soft: the pose still wobbles
  for (const [body, tgt, cur, m] of [[u.body, _el, _ae, 1.4], [l.body, _hd, _ah, 1.5]]) {
    const bv = body.linvel();
    let fx = (tgt.x - cur.x) * KP + (cv.x - bv.x) * KD;
    let fy = (tgt.y - cur.y) * KP + (cv.y - bv.y) * KD;
    let fz = (tgt.z - cur.z) * KP + (cv.z - bv.z) * KD;
    const a = Math.hypot(fx, fy, fz), amax = AM;
    if (a > amax) { fx *= amax / a; fy *= amax / a; fz *= amax / a; }
    const s = m * k * DT, imp = { x: fx * s, y: fy * s, z: fz * s };
    body.applyImpulseAtPoint(imp, { x: cur.x, y: cur.y, z: cur.z }, true);
    chest.applyImpulse({ x: -imp.x, y: -imp.y, z: -imp.z }, true);
  }
}

// ---- the wheel ----------------------------------------------------------------
const N = EMOTES.length;
export class Emotes {
  constructor(game) {
    this.game = game;
    this.w = new Map(); // player -> { open, sel, cx, cy, lock, el }
  }

  st(p) {
    let s = this.w.get(p);
    if (!s) { s = { open: false, sel: -1, cx: 0, cy: 0, lock: false, el: null, html: '' }; this.w.set(p, s); }
    return s;
  }

  // Per frame from Game.handlePlayerInput, before the game reads the device.
  input(p, d) {
    const g = this.game, ui = g.ui, s = this.st(p);
    const raw = d.raw || d.state, pr = d.rawPressed || d.pressed;
    const blocked = g.paused || ui?.panels?.has(p) || (ui?.help && ui.help.id === p.deviceId);
    const driver = p.seat && p.seat.kind === 'driver';
    if (s.open && (blocked || !raw.emote || p.state === 'limp' || driver)) {
      const play = !blocked && !raw.emote && s.sel >= 0;
      s.open = false; s.lock = true;
      if (play) { if (!startEmote(p, EMOTES[s.sel].id)) g.audio?.play('uiBack'); }
      else g.audio?.play('uiBack');
    } else if (!s.open && !blocked && pr.emote && p.state !== 'limp' && !driver) {
      s.open = true; s.sel = -1; s.cx = s.cy = 0;
      g.audio?.play('uiOpen');
    }
    if (s.open) {
      // pick with whichever stick (or the mouse) is pushed furthest
      const pf = g.input.prefs ? g.input.prefs(p.deviceId) : null;
      const sens = pf?.sens || 1, inv = pf?.invertY ? -1 : 1;
      let vx = raw.moveX || 0, vy = raw.moveY || 0;
      if (raw.mouse) {
        s.cx += (raw.lookX || 0) / (0.0025 * sens); s.cy += (raw.lookY || 0) / (0.0025 * sens);
        const l = Math.hypot(s.cx, s.cy); if (l > 120) { s.cx *= 120 / l; s.cy *= 120 / l; }
        if (Math.hypot(s.cx, s.cy) > 40 && Math.hypot(vx, vy) < 0.3) { vx = s.cx / 120; vy = -s.cy / 120; }
      } else {
        const lk = deviceKind(p.deviceId) === 'kb2' ? [0.045, 0.03] : [0.07, 0.05];
        const lx = (raw.lookX || 0) / (lk[0] * sens), ly = -(raw.lookY || 0) * inv / (lk[1] * sens);
        if (Math.hypot(lx, ly) > Math.hypot(vx, vy)) { vx = lx; vy = ly; }
      }
      if (Math.hypot(vx, vy) > 0.4) {
        const a = (Math.atan2(vx, vy) + Math.PI * 2) % (Math.PI * 2);
        const sel = Math.round(a / (Math.PI * 2 / N)) % N;
        if (sel !== s.sel) { s.sel = sel; g.audio?.play('uiMove'); }
      }
    } else if (!blocked && !driver) {
      for (const k in QUICK) if (pr[k] && !(k === 'dLeft' && pr.ragdoll)) { if (startEmote(p, QUICK[k])) break; }
    }
    // while the wheel is open (and until the stick that picked comes back to
    // the centre) the game sees no move / look input from this device
    if (s.lock && !s.open && Math.hypot(raw.moveX || 0, raw.moveY || 0) < 0.25) s.lock = false;
    if (s.lookLock && !s.open && Math.hypot(raw.lookX || 0, raw.lookY || 0) < 0.004) s.lookLock = false;
    if (s.open) s.lookLock = !raw.mouse; // the mouse may look around straight away
    if (s.open || s.lock || s.lookLock) {
      const z = { ...d.state };
      if (s.open || s.lock) { z.moveX = 0; z.moveY = 0; z.steer = 0; }
      if (s.open || s.lookLock) { z.lookX = 0; z.lookY = 0; }
      d.state = z;
    }
  }

  // Per frame from UI.update: one wheel per player view.
  draw(views) {
    const ps = this.game.players;
    for (const [p, s] of this.w) if (!ps.includes(p)) { s.el?.remove(); this.w.delete(p); }
    ps.forEach((p, i) => {
      const s = this.w.get(p);
      if (!s) return;
      if (!s.open) { if (s.el) s.el.classList.add('hidden'); return; }
      if (!s.el) s.el = this.build(p);
      const [x, y, w, h] = views[i];
      const D = Math.round(Math.min(460, Math.min(w, h) * 0.8));
      const el = s.el;
      el.classList.remove('hidden');
      el.classList.toggle('small', D < 230);
      el.style.cssText = `left:${x + w / 2}px;top:${y + h / 2}px;--d:${D}px;--acc:${PLAYER_CSS(p.color === 0xffffff ? 0x2a62c9 : p.color)}`;
      const key = s.sel + '|' + p.color;
      if (key !== s.html) {
        s.html = key;
        el.querySelectorAll('.eslice').forEach((sl, j) => sl.classList.toggle('sel', j === s.sel));
        const def = EMOTES[s.sel];
        el.querySelector('.ename').textContent = def ? def.name : 'Emotes';
        const ptr = el.querySelector('.eptr');
        ptr.style.display = def ? 'block' : 'none';
        if (def) ptr.style.transform = `rotate(${s.sel * 360 / N}deg)`;
        el.querySelector('.ehint').innerHTML = def ? `Release ${glyph('EMOTE', deviceKind(p.deviceId))}` : this.pickHint(p);
      }
    });
  }

  pickHint(p) {
    const k = deviceKind(p.deviceId);
    return k === 'kb1' ? 'Mouse to pick' : k === 'kb2' ? 'Arrows to pick' : `${glyph('LS')} pick`;
  }

  build(p) {
    const el = document.createElement('div');
    el.className = 'ewheel';
    const slices = EMOTES.map((e, j) => `<div class="eslice" style="--a:${j * 360 / N}deg"><div class="eitem"><div class="eicon">${ICONS[e.id]}</div><div class="elabel">${e.name}</div></div></div>`).join('');
    el.innerHTML = `<div class="edisc"></div><div class="eptr"></div>${slices}<div class="ehub"><div class="ename">Emotes</div><div class="ehint"></div></div>`;
    this.game.ui.hud.appendChild(el);
    return el;
  }

  isOpen(p) { return !!this.w.get(p)?.open; }
}
