import * as THREE from '../vendor/three.module.min.js';

export { THREE };

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const smooth = (t) => t * t * (3 - 2 * t);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// Shortest signed angle from a to b.
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Frame-rate independent exponential approach factor.
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

// q = Ry(yaw) * Rz(roll) * Rx(pitch). Pitch about +X rotates +Y toward +Z
// (a limb hanging down swings BACK for positive pitch, forward for negative).
export function eulerYZX(out, yaw, roll, pitch) {
  _qa.setFromAxisAngle(AY, yaw);
  _qb.setFromAxisAngle(AZ, roll);
  _qc.setFromAxisAngle(AX, pitch);
  return out.copy(_qa).multiply(_qb).multiply(_qc);
}

// Closest distance squared between segments p1-q1 and p2-q2 (plain xyz objects).
export function segSegDist2(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return rx * rx + ry * ry + rz * rz;
  if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const x = rx + d1x * s - d2x * t, y = ry + d1y * s - d2y * t, z = rz + d1z * s - d2z * t;
  return x * x + y * y + z * z;
}

// Ballistic launch: returns pitch angle (radians) to hit horizontal distance dx and
// height dy with launch speed v, or null if out of range.
export function ballisticAngle(dx, dy, v, g, high) {
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0) return null;
  const r = Math.sqrt(disc);
  return Math.atan2(high ? v2 + r : v2 - r, g * dx);
}
