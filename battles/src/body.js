// The wobbly-unit skeleton: 11 parts, their sizes, joints and forward kinematics.
// Unit frame: +Y up, +Z forward, +X is the unit's LEFT side.
import { THREE } from './util.js';

export const PART = {
  pelvis: 0, chest: 1, head: 2,
  thighL: 3, shinL: 4, thighR: 5, shinR: 6,
  uarmL: 7, farmL: 8, uarmR: 9, farmR: 10,
};
export const PART_NAMES = Object.keys(PART);
export const NPARTS = PART_NAMES.length;

// build: { scale, girth, head, legs, arms, mass }
export function makeSkeleton(build = {}) {
  const s = build.scale ?? 1;
  const G = build.girth ?? 1;
  const H = build.head ?? 1;
  const L = build.legs ?? 1;
  const A = build.arms ?? 1;
  const M = (build.mass ?? 1) * s * s * s;

  const rShin = 0.085 * s * Math.sqrt(G), rThigh = 0.095 * s * Math.sqrt(G);
  const shinLen = 0.38 * L * s, thighLen = 0.32 * L * s;
  const kneeY = rShin + shinLen;
  const hipY = kneeY + thighLen;
  const rPelvis = 0.19 * G * s;
  const pelvisY = hipY + 0.05 * s;
  const waistY = pelvisY + 0.09 * s;
  const rChest = 0.24 * G * s, hhChest = 0.12 * s;
  const chestY = waistY + 0.2 * s;
  const neckY = chestY + hhChest + rChest * 0.55;
  const rHead = 0.22 * H * s;
  const headY = neckY + rHead * 0.85;
  const shoulderY = chestY + hhChest * 0.9;
  const shoulderX = rChest + 0.05 * s;
  const rArm = 0.068 * s * (build.armThick ?? 1), uLen = 0.27 * A * s, fLen = 0.27 * A * s;
  const hipX = 0.11 * s * G;

  const parts = [];
  const add = (name, shape, r, hh, pos, mass, limb) =>
    parts.push({ name, shape, r, hh, pos: new THREE.Vector3(...pos), mass: mass * M, limb });
  add('pelvis', 'ball', rPelvis, 0, [0, pelvisY, 0], 13, false);
  add('chest', 'capsule', rChest, hhChest, [0, chestY, 0], 24, false);
  add('head', 'ball', rHead, 0, [0, headY, 0], 6, false);
  for (const side of [1, -1]) {
    add(side > 0 ? 'thighL' : 'thighR', 'capsule', rThigh, thighLen / 2, [side * hipX, hipY - thighLen / 2, 0], 7, true);
    add(side > 0 ? 'shinL' : 'shinR', 'capsule', rShin, shinLen / 2, [side * hipX, kneeY - shinLen / 2, 0], 4.5, true);
  }
  for (const side of [1, -1]) {
    add(side > 0 ? 'uarmL' : 'uarmR', 'capsule', rArm, uLen / 2, [side * shoulderX, shoulderY - uLen / 2, 0], 2.6, true);
    add(side > 0 ? 'farmL' : 'farmR', 'capsule', rArm * 0.92, fLen / 2, [side * shoulderX, shoulderY - uLen - fLen / 2, 0], 2.0, true);
  }
  // Reorder into PART index order.
  const ordered = PART_NAMES.map((n) => parts.find((p) => p.name === n));

  const joints = [];
  const J = (a, b, y, x, type) => joints.push({ a: PART[a], b: PART[b], pos: new THREE.Vector3(x, y, 0), type });
  J('pelvis', 'chest', waistY, 0, 'sph');
  J('chest', 'head', neckY, 0, 'sph');
  J('pelvis', 'thighL', hipY, hipX, 'sph');
  J('thighL', 'shinL', kneeY, hipX, 'knee');
  J('pelvis', 'thighR', hipY, -hipX, 'sph');
  J('thighR', 'shinR', kneeY, -hipX, 'knee');
  J('chest', 'uarmL', shoulderY, shoulderX, 'sph');
  J('uarmL', 'farmL', shoulderY - uLen, shoulderX, 'elbow');
  J('chest', 'uarmR', shoulderY, -shoulderX, 'sph');
  J('uarmR', 'farmR', shoulderY - uLen, -shoulderX, 'elbow');
  for (const j of joints) {
    j.anchorA = j.pos.clone().sub(ordered[j.a].pos);
    j.anchorB = j.pos.clone().sub(ordered[j.b].pos);
  }
  // parent of each part (for FK) = the joint whose b is that part
  const parentJoint = new Array(NPARTS).fill(null);
  for (const j of joints) parentJoint[j.b] = j;

  const totalMass = ordered.reduce((a, p) => a + p.mass, 0);
  return {
    parts: ordered, joints, parentJoint, totalMass, scale: s,
    standHeight: pelvisY, height: headY + rHead, rHead, rChest,
    handOffset: fLen / 2, // hand is at local (0,-handOffset,0) of the forearm
    radius: Math.max(rChest, 0.25 * s),
  };
}

// FK: given per-part orientations in unit frame and the pelvis position, write
// part positions. quats: array of Quaternion, out: array of Vector3.
const _v = new THREE.Vector3();
const FK_ORDER = [PART.chest, PART.head, PART.thighL, PART.shinL, PART.thighR, PART.shinR,
  PART.uarmL, PART.farmL, PART.uarmR, PART.farmR];
export function forwardKinematics(skel, pelvisPos, quats, out) {
  out[PART.pelvis].copy(pelvisPos);
  for (const i of FK_ORDER) {
    const j = skel.parentJoint[i];
    // joint world = parentPos + qParent*anchorA ; childPos = joint - qChild*anchorB
    _v.copy(j.anchorA).applyQuaternion(quats[j.a]).add(out[j.a]);
    out[i].copy(j.anchorB).applyQuaternion(quats[i]).negate().add(_v);
  }
  return out;
}
