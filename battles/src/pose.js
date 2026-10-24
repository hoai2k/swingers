// Procedural target poses. Everything is in the unit frame (+Z forward, +X left);
// the controller rotates these by the unit's heading and drives each ragdoll part
// toward them with "muscle" torques, so the pose is only ever approximately hit.
import { THREE, eulerYZX, clamp, lerp, smooth } from './util.js';
import { PART, NPARTS } from './body.js';
import { EXT } from './ext.js';

const P = PART;
const tmp = () => new THREE.Quaternion();
export const newPose = () => Array.from({ length: NPARTS }, tmp);

// One keyframe for an arm: [inward yaw, outward roll, upper pitch, fore pitch]
// (pitch < 0 swings forward/up; -PI points straight up).
export const GUARD = {
  none: { L: [0.1, 0.18, 0.05, -0.15], R: [0.1, 0.18, 0.05, -0.15] },
  sword: { L: [0.1, 0.25, 0.1, -0.5], R: [0.15, 0.15, -0.35, -1.45] },
  shield: { L: [0.75, 0.15, -0.55, -1.5], R: [0.15, 0.15, -0.35, -1.45] },
  twohand: { L: [0.7, 0.0, -0.45, -1.3], R: [0.55, 0.0, -0.45, -1.3] },
  spear: { L: [0.55, 0.0, -0.35, -1.45], R: [0.25, 0.05, -0.2, -1.5] },
  bow: { L: [0.1, 0.1, -1.35, -1.45], R: [0.6, 0.1, -1.0, -1.7] },
  throw: { L: [0.1, 0.3, -0.1, -0.5], R: [0.1, 0.3, -0.2, -0.9] },
  staff: { L: [0.1, 0.25, 0.05, -0.4], R: [0.15, 0.2, -0.3, -1.2] },
  lute: { L: [0.9, 0.0, -0.6, -1.2], R: [0.5, 0.15, -0.25, -0.9] },
  dual: { L: [0.15, 0.15, -0.35, -1.45], R: [0.15, 0.15, -0.35, -1.45] },
  fists: { L: [0.2, 0.25, -0.4, -1.3], R: [0.2, 0.25, -0.4, -1.3] },
  heal: { L: [0.1, 0.25, 0.05, -0.4], R: [0.15, 0.2, -0.3, -1.2] },
};

// Attack animations: list of [t, armL keyframe or null (guard), armR keyframe or null,
// chestTwist, lean, crouch]. Swings have an anticipation (wind-up with the weight
// back and knees bent) and a follow-through past the strike before recovering.
export const ATTACKS = {
  overhead: [
    [0.0, null, null, 0, 0, 0],
    [0.42, null, [0.2, 0.15, -2.75, -3.25], 0.4, -0.22, 0.12],
    [0.62, null, [0.3, 0.05, -0.55, -0.3], -0.45, 0.4, 0.08],
    [0.76, null, [0.35, 0.0, -0.15, -0.05], -0.6, 0.5, 0.18],
    [1.0, null, null, 0, 0, 0],
  ],
  slam: [ // two-handed overhead
    [0.0, null, null, 0, 0, 0],
    [0.42, [0.45, 0, -2.8, -3.2], [0.4, 0, -2.8, -3.2], 0, -0.32, 0.12],
    [0.64, [0.45, 0, -0.55, -0.35], [0.4, 0, -0.55, -0.35], 0, 0.5, 0.1],
    [0.78, [0.45, 0, -0.2, -0.05], [0.4, 0, -0.2, -0.05], 0, 0.62, 0.25],
    [1.0, null, null, 0, 0, 0],
  ],
  stab: [
    [0.0, null, null, 0, 0, 0],
    [0.38, [0.5, 0, 0.25, -1.2], [0.2, 0.05, 0.4, -1.2], 0.3, -0.15, 0.1],
    [0.55, [0.45, 0, -1.25, -1.55], [0.15, 0.05, -1.35, -1.6], -0.25, 0.4, 0.05],
    [0.7, [0.45, 0, -1.3, -1.6], [0.15, 0.05, -1.4, -1.6], -0.3, 0.45, 0.12],
    [1.0, null, null, 0, 0, 0],
  ],
  throw: [
    [0.0, null, null, 0, 0, 0],
    [0.3, [0.0, 0.3, -1.0, -1.2], [-0.2, 0.3, -0.6, -1.6], 0.35, -0.1, 0.08],
    [0.58, [0.0, 0.3, -1.35, -1.5], [0.0, 0.25, -2.6, -3.5], 0.65, -0.3, 0.15],
    [0.72, [0.0, 0.3, 0.1, -0.4], [0.2, 0.1, -1.3, -1.1], -0.5, 0.4, 0.05],
    [0.84, [0.0, 0.3, 0.2, -0.3], [0.3, 0.05, -0.5, -0.4], -0.6, 0.45, 0.15],
    [1.0, null, null, 0, 0, 0],
  ],
  bow: [ // bow arm out at the target, string drawn to the cheek, released with a flick
    [0.0, null, null, 0, 0, 0],
    [0.3, [0.25, 0, -1.6, -1.6], [0.6, 0.1, -1.5, -1.75], -0.15, 0, 0],
    [0.72, [0.25, 0, -1.6, -1.6], [0.9, -1.4, -1.55, -3.9], -0.45, -0.05, 0.08],
    [0.8, [0.25, 0, -1.55, -1.55], [-0.3, -0.9, -1.2, -1.3], -0.3, 0, 0.04],
    [1.0, null, null, 0, 0, 0],
  ],
  cast: [
    [0.0, null, null, 0, 0, 0],
    [0.5, [0.0, 0.5, -2.4, -2.8], [0.0, 0.5, -2.4, -2.8], 0, -0.3, 0.1],
    [0.65, [0.2, 0.1, -1.4, -1.5], [0.2, 0.1, -1.5, -1.6], 0, 0.3, 0.05],
    [0.8, [0.2, 0.1, -1.3, -1.4], [0.2, 0.1, -1.35, -1.45], 0, 0.35, 0.1],
    [1.0, null, null, 0, 0, 0],
  ],
  dual: [
    [0.0, null, null, 0, 0, 0],
    [0.3, [0.2, 0.2, -2.7, -3.2], null, -0.3, -0.12, 0.08],
    [0.45, [0.2, 0.1, -0.7, -0.6], [0.2, 0.2, -2.7, -3.2], 0.3, 0.2, 0.05],
    [0.62, [0.25, 0.05, -0.3, -0.2], [0.2, 0.1, -0.7, -0.6], -0.3, 0.3, 0.1],
    [0.75, null, [0.3, 0.05, -0.25, -0.15], -0.45, 0.35, 0.15],
    [1.0, null, null, 0, 0, 0],
  ],
  punch: [
    [0.0, null, null, 0, 0, 0],
    [0.35, null, [0.05, 0.2, 0.3, -0.9], 0.4, -0.08, 0.08],
    [0.5, null, [0.25, 0.05, -1.5, -1.55], -0.4, 0.3, 0.05],
    [0.65, null, [0.3, 0.05, -1.55, -1.6], -0.5, 0.35, 0.1],
    [1.0, null, null, 0, 0, 0],
  ],
  heal: [
    [0.0, null, null, 0, 0, 0],
    [0.4, [-0.3, 0.7, -2.5, -2.9], [-0.3, 0.7, -2.5, -2.9], 0, -0.2, 0],
    [0.75, [-0.3, 0.7, -2.5, -2.9], [-0.3, 0.7, -2.5, -2.9], 0, -0.2, 0],
    [1.0, null, null, 0, 0, 0],
  ],
};

function sampleAnim(anim, t, guard, out) {
  let i = 0;
  while (i < anim.length - 2 && t > anim[i + 1][0]) i++;
  const a = anim[i], b = anim[i + 1];
  const f = smooth(clamp((t - a[0]) / Math.max(1e-4, b[0] - a[0]), 0, 1));
  for (let k = 0; k < 2; k++) {
    const ga = a[1 + k] || guard[k ? 'R' : 'L'];
    const gb = b[1 + k] || guard[k ? 'R' : 'L'];
    const o = out[k];
    for (let n = 0; n < 4; n++) o[n] = lerp(ga[n], gb[n], f);
  }
  out.twist = lerp(a[3], b[3], f);
  out.lean = lerp(a[4], b[4], f);
  out.crouch = lerp(a[5] || 0, b[5] || 0, f);
  return out;
}

const _arms = [[0, 0, 0, 0], [0, 0, 0, 0]];

function setArm(pose, side, k, extraPitch = 0) {
  // side +1 = left (x+), -1 = right. Inward yaw turns the arm toward the body midline.
  const yaw = -side * k[0];
  const roll = side * k[1];
  eulerYZX(pose[side > 0 ? P.uarmL : P.uarmR], yaw, roll, k[2] + extraPitch);
  eulerYZX(pose[side > 0 ? P.farmL : P.farmR], yaw, roll, Math.min(k[3] + extraPitch, k[2] + extraPitch));
}

// Raised-shield and on-guard arm keys (st.brace blends toward them).
const BRACE_SHIELD = [0.8, 0.1, -1.05, -1.8], BLOCK_SHIELD = [0.85, 0.05, -1.4, -2.0];
const BLOCK_WEAPON = [0.55, 0.1, -1.25, -2.45];

// st: { phase, amp (0..1 walking), lean, style, attack (anim name or null), attackT,
//       headPitch, headYaw, mode ('normal'|'cheer'|'flail'|'play'|'cower'), t,
//       optional: airborne (flung: windmill), swing, rock (gait), brace (0..1 raise the guard / shield),
//       block (0..1 full block), flinch (0..1) with flinchX/flinchZ (unit-frame push
//       direction: +X left, +Z forward), wobble (0..1 groggy), seed }
// Writes st.crouchOut (how much the pose wants to crouch, for the balance controller).
export function computePose(st, pose) {
  const amp = st.amp;
  const ph = st.phase;
  const sn = Math.sin(ph), cs = Math.cos(ph);
  const guard = GUARD[st.style] || GUARD.none;
  let twist = 0, lean = st.lean || 0, crouch = st.crouch || 0, roll = 0;
  let headYaw = st.headYaw || 0, headPitch = st.headPitch || 0;
  const t = st.t || 0, seed = st.seed || 0;

  // Arms
  let arms = _arms;
  if (st.attack && ATTACKS[st.attack]) {
    sampleAnim(ATTACKS[st.attack], st.attackT, guard, arms);
    twist = arms.twist; lean += arms.lean; crouch += arms.crouch;
  } else {
    for (let n = 0; n < 4; n++) { arms[0][n] = guard.L[n]; arms[1][n] = guard.R[n]; }
    // bracing: shield up in front of the chest (or the face when blocking), or the
    // weapon raised across the body; knees bent, weight forward
    const br = st.brace || 0, bl = st.block || 0;
    if (br > 0 || bl > 0) {
      const shield = st.style === 'shield';
      const k = shield ? arms[0] : arms[1];
      const a = shield ? BRACE_SHIELD : BLOCK_WEAPON, b = shield ? BLOCK_SHIELD : BLOCK_WEAPON;
      for (let n = 0; n < 4; n++) k[n] = lerp(lerp(k[n], a[n], br), b[n], bl);
      crouch += 0.12 * br + 0.12 * bl;
      lean += 0.12 * br + 0.08 * bl;
      headPitch += 0.1 * bl;
    }
  }
  let swingL = 0, swingR = 0, armUp = 0;
  if (st.mode === 'cheer') {
    // victory: both arms up, waving side to side out of step, bouncing
    const c = Math.sin(t * 8 + seed), c2 = Math.sin(t * 8 + seed + 2.2);
    arms[0][0] = -0.2 + c * 0.35; arms[0][1] = 0.55 + c * 0.35; arms[0][2] = -2.75 + c2 * 0.2; arms[0][3] = -2.95 + c * 0.3;
    arms[1][0] = -0.2 - c2 * 0.35; arms[1][1] = 0.55 + c2 * 0.35; arms[1][2] = -2.75 + c * 0.2; arms[1][3] = -2.95 + c2 * 0.3;
    headPitch -= 0.35;
    lean -= 0.12;
    roll += Math.sin(t * 4 + seed) * 0.08;
  } else if (st.mode === 'flail' && st.airborne) {
    // flung through the air: TABS windmilling - both arms whirl round in big circles
    // out to the sides, out of step with each other (and the legs pedal, below)
    const c = t * 10 + seed;
    for (let n = 0; n < 2; n++) {
      const a = c * (n ? 1.13 : 1) + n * 2.4, A = arms[n];
      A[0] = 0.2; A[1] = 0.75 + Math.sin(a * 0.5) * 0.3;
      A[2] = -(a % (Math.PI * 2)); A[3] = A[2] - 0.35 - Math.sin(a) * 0.25;
    }
    headPitch -= 0.3;
  } else if (st.mode === 'flail') {
    // knocked about on the ground: arms flap
    const c = t * 14 + seed;
    arms[0][0] = 0; arms[0][1] = 1.3 + Math.sin(c) * 0.5; arms[0][2] = -1.4 + Math.cos(c * 1.3) * 1.2; arms[0][3] = arms[0][2] - 0.4;
    arms[1][0] = 0; arms[1][1] = 1.3 + Math.cos(c) * 0.5; arms[1][2] = -1.4 + Math.sin(c * 1.1) * 1.2; arms[1][3] = arms[1][2] - 0.4;
    headPitch -= 0.2;
  } else if (st.mode === 'cower') {
    arms[0][0] = 0.9; arms[0][1] = 0.3; arms[0][2] = -2.2; arms[0][3] = -2.9;
    arms[1][0] = 0.9; arms[1][1] = 0.3; arms[1][2] = -2.2; arms[1][3] = -2.9;
    lean += 0.3;
  } else if (st.mode === 'play') {
    // strum
    arms[1][2] += Math.sin(t * 18) * 0.25;
    arms[1][3] += Math.sin(t * 18) * 0.3;
  } else {
    // arm swing while walking, opposite to the feet (st.swing comes from the
    // stepping feet; the phase is the fallback for previews). Weapon arms swing less.
    const sw = st.swing !== undefined ? st.swing : sn * amp;
    const free = st.style === 'none' || st.style === 'throw' || st.style === 'staff' || st.style === 'heal';
    swingL = sw * (free ? 0.8 : 0.3);
    swingR = -sw * (free && st.style === 'none' ? 0.8 : 0.25);
    // idle: breathing, a slow weight shift and a look around while standing
    const idle = (1 - amp) * (st.attack ? 0.3 : 1);
    if (idle > 0.01) {
      twist += Math.sin(t * 0.8 + seed) * 0.1 * idle;
      roll += Math.sin(t * 1.1 + seed * 2) * 0.05 * idle;
      lean += Math.sin(t * 2.3 + seed) * 0.025 * idle;
      headYaw += Math.sin(t * 0.55 + seed * 3) * 0.3 * idle * (st.brace ? 0.2 : 1);
      armUp += Math.sin(t * 2.3 + seed) * 0.05 * idle;
    }
  }
  // flinch: the body recoils along the push (head and arms thrown with it)
  const fl = st.flinch || 0;
  if (fl > 0) {
    lean += (st.flinchZ || 0) * 0.55 * fl;
    roll -= (st.flinchX || 0) * 0.45 * fl;
    headPitch += (st.flinchZ || 0) * 0.5 * fl;
    if (!st.attack && st.mode !== 'cheer') armUp -= 0.6 * fl;
  }
  // groggy after getting up: unsteady sway
  const wb = st.wobble || 0;
  if (wb > 0) {
    roll += Math.sin(t * 6.5 + seed) * 0.16 * wb;
    lean += Math.sin(t * 4.3 + seed * 2) * 0.12 * wb;
    headPitch += Math.sin(t * 5.1) * 0.2 * wb;
  }
  setArm(pose, 1, arms[0], (st.attack ? 0 : swingL) + armUp);
  setArm(pose, -1, arms[1], (st.attack ? 0 : swingR) + armUp);

  // Legs
  const stride = 0.75 * amp;
  let thL = -sn * stride, thR = sn * stride;
  let bendL = 0.12 + Math.max(0, cs) * 1.1 * amp;
  let bendR = 0.12 + Math.max(0, -cs) * 1.1 * amp;
  if (st.mode === 'flail' && st.airborne) {
    // pedalling in the air
    const c = t * 9 + seed;
    thL = -0.35 + Math.sin(c) * 0.6; thR = -0.35 - Math.sin(c) * 0.6;
    bendL = 0.5 + Math.max(0, Math.cos(c)) * 0.9; bendR = 0.5 + Math.max(0, -Math.cos(c)) * 0.9;
  }
  const spread = 0.06 + (st.mode === 'flail' ? 0.4 : 0);
  st.crouchOut = crouch;
  eulerYZX(pose[P.thighL], 0, spread, thL - crouch);
  eulerYZX(pose[P.shinL], 0, spread, thL - crouch + bendL + crouch * 2);
  eulerYZX(pose[P.thighR], 0, -spread, thR - crouch);
  eulerYZX(pose[P.shinR], 0, -spread, thR - crouch + bendR + crouch * 2);

  // Torso
  const bob = st.mode === 'cheer' ? 0 : Math.sin(ph * 2) * 0.04 * amp;
  const sw = st.swing !== undefined ? st.swing : sn * amp;
  // hips twist with the stride, shoulders counter-twist, body rocks side to side (waddle)
  const rock = st.rock !== undefined ? st.rock : Math.sin(ph) * amp;
  // (rock > 0: weight on the right foot; positive roll leans toward -X = right)
  eulerYZX(pose[P.pelvis], -twist * 0.3 - sw * 0.22, rock * 0.05 + roll * 0.4, lean * 0.3);
  eulerYZX(pose[P.chest], twist + sw * 0.16, rock * 0.1 + roll, lean + bob);
  eulerYZX(pose[P.head], headYaw + twist * 0.3, roll * -0.3, headPitch - lean * 0.4);
  for (const f of EXT.pose) f(st, pose); // pack stances (src/ext.js)
  return pose;
}

// Which anim + weapon style a weapon kind uses.
export const STYLE_ANIM = {
  sword: 'overhead', shield: 'overhead', twohand: 'slam', spear: 'stab', bow: 'bow',
  throw: 'throw', staff: 'cast', lute: 'overhead', dual: 'dual', fists: 'slam', none: 'punch',
  heal: 'heal',
};
