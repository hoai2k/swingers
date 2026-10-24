// Held items: hit geometry (shared by combat and the visuals).
// The item's long axis is its local +Y; it is mounted at the hand of the forearm
// rotated so +Y points along grip = (0, -sin a, cos a) in the forearm frame
// (a = 0: perpendicular to the forearm, pointing forward when the arm hangs;
//  a = 90: straight on along the forearm).
export const ITEMS = {
  none: { len: 0.22, r: 0.12, grip: 90 },
  club: { len: 0.95, r: 0.11, grip: 30, heavy: true },
  bone: { len: 0.7, r: 0.08, grip: 30 },
  big_axe: { len: 1.55, r: 0.2, grip: 25, heavy: true, blade: 'axe' },
  pitchfork_small: { len: 0.7, r: 0.06, grip: 30 },
  pitchfork: { len: 1.9, r: 0.08, grip: 95, back: 0.6 },
  sword: { len: 1.0, r: 0.07, grip: 30, metal: true },
  greatsword: { len: 1.65, r: 0.1, grip: 25, metal: true },
  kingsword: { len: 2.1, r: 0.14, grip: 25, metal: true },
  axe: { len: 0.85, r: 0.12, grip: 30, metal: true, blade: 'axe' },
  lute: { len: 0.9, r: 0.14, grip: 20 },
  bow: { len: 1.4, r: 0.04, grip: 0, center: true },
  staff: { len: 1.8, r: 0.05, grip: 0, center: true },
  spear_hand: { len: 1.8, r: 0.05, grip: 90, back: 0.6 },
  hay_hand: { len: 0.0, r: 0.0, grip: 90 },
  potion_hand: { len: 0.0, r: 0.0, grip: 90 },
  bomb_hand: { len: 0.0, r: 0.0, grip: 90 },
};

import './packs/index.js';
import { EXT } from './ext.js';
Object.assign(ITEMS, EXT.items);

export function gripDir(item, out) {
  const a = (item.grip * Math.PI) / 180;
  return out.set(0, -Math.sin(a), Math.cos(a));
}
