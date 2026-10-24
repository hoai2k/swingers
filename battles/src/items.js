// Held items: hit geometry and mass (shared by combat, physics and the visuals).
// The item's long axis is its local +Y; it is mounted at the hand of the forearm
// rotated so +Y points along grip = (0, -sin a, cos a) in the forearm frame
// (a = 0: perpendicular to the forearm, pointing forward when the arm hangs;
//  a = 90: straight on along the forearm).
// Held items are real colliders on the forearm body, so heavy weapons drag the arm
// and swing the unit about, clash with enemy weapons and shields, and fall off as
// rigid bodies of their own when the unit dies (see Unit.dropHeld).
//   mass: kg at unit scale 1 (scaled by s^3; default from len and r)
//   phys: false keeps an item massless and glued to the hand (zero-length items always are)
export const ITEMS = {
  none: { len: 0.22, r: 0.12, grip: 90 },
  club: { len: 0.95, r: 0.11, grip: 30, heavy: true, mass: 3.2 },
  bone: { len: 0.7, r: 0.08, grip: 30, mass: 1.2 },
  big_axe: { len: 1.55, r: 0.2, grip: 25, heavy: true, blade: 'axe', mass: 6.5 },
  pitchfork_small: { len: 0.7, r: 0.06, grip: 30, mass: 0.7 },
  pitchfork: { len: 1.9, r: 0.08, grip: 95, back: 0.6, mass: 2.4 },
  sword: { len: 1.0, r: 0.07, grip: 30, metal: true, mass: 1.6 },
  greatsword: { len: 1.65, r: 0.1, grip: 25, metal: true, mass: 4.2 },
  kingsword: { len: 2.1, r: 0.14, grip: 25, metal: true, mass: 7 },
  axe: { len: 0.85, r: 0.12, grip: 30, metal: true, blade: 'axe', mass: 2 },
  lute: { len: 0.9, r: 0.14, grip: 20, mass: 1.5 },
  bow: { len: 1.4, r: 0.04, grip: 0, center: true, mass: 0.8 },
  staff: { len: 1.8, r: 0.05, grip: 0, center: true, mass: 1.6 },
  spear_hand: { len: 1.8, r: 0.05, grip: 90, back: 0.6, mass: 1.8 },
  hay_hand: { len: 0.0, r: 0.0, grip: 90 },
  potion_hand: { len: 0.0, r: 0.0, grip: 90 },
  bomb_hand: { len: 0.0, r: 0.0, grip: 90 },
};

// Shields: a board strapped to the outside of the left forearm (forearm-local +X),
// as a box collider with these half extents (at scale 1) and mass.
export const SHIELDS = {
  wood: { half: [0.04, 0.38, 0.33], mass: 3.5 },
  round: { half: [0.035, 0.34, 0.34], mass: 3.0 },
};

import './packs/index.js';
import { EXT } from './ext.js';
Object.assign(ITEMS, EXT.items);
export const shieldDef = (kind) => SHIELDS[kind] || SHIELDS.round;

export function gripDir(item, out) {
  const a = (item.grip * Math.PI) / 180;
  return out.set(0, -Math.sin(a), Math.cos(a));
}

// Mass of a held item (kg) at unit scale s.
export function itemMass(it, s = 1) {
  const m = it.mass ?? Math.max(0.4, it.len * it.r * 25);
  return m * s * s * s;
}

// What a unit holds, in a fixed order shared by the sim (Unit.held) and the visuals
// (vis.held): [{ shield: bool, name, part }] with part 8 = left forearm, 10 = right.
export function heldLayout(def) {
  const w = def.weapon, out = [];
  const add = (name, part) => { if (name && name !== 'none' && ITEMS[name]) out.push({ shield: false, name, part }); };
  if (w.style === 'dual') { add(w.item, 8); add(w.item2 || w.item, 10); }
  else if (w.item) add(w.item, w.style === 'bow' ? 8 : 10);
  if (w.shield) out.push({ shield: true, name: w.shield, part: 8 });
  return out;
}

// Span of an item along its local +Y, from the hand: [y0, y1] at scale s.
export function itemSpan(it, s = 1) {
  const L = it.len * s, back = (it.back || 0) * L;
  return it.center ? [-L / 2, L / 2] : [-back, L - back];
}
