// The wobbly character: an active ragdoll of 11 rigid bodies held upright by
// "magic" balance forces (a hover spring under the hips and world-space
// upright torques on hips and chest) while every joint is driven toward an
// animated pose by PD torques. Turning the forces down makes it go limp.
import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { DT, ALL, groups, playerBit, G_VEH, HATS, PLAYER_COLORS } from './config.js';
import { buildExtraHat } from './hats.js';
import { Builder, faceMaterials, matVC } from './mesh.js';

export const S = 0.8; // overall character scale
const UP = new THREE.Vector3(0, 1, 0);

// Rest pose, standing on y = 0, facing +Z. Left is +X.
const PARTS = [
  { n: 'hips', shape: 'ball', r: 0.22, pos: [0, 0.6, 0], m: 9 },
  { n: 'chest', parent: 'hips', shape: 'cap', r: 0.27, hh: 0.1, pos: [0, 0.93, 0], joint: [0, 0.72, 0], m: 13 },
  { n: 'head', parent: 'chest', shape: 'ball', r: 0.28, pos: [0, 1.52, 0], joint: [0, 1.24, 0], m: 4 },
  { n: 'uArmL', parent: 'chest', shape: 'cap', r: 0.07, hh: 0.06, pos: [0.34, 0.99, 0], joint: [0.34, 1.12, 0], m: 1.4 },
  { n: 'lArmL', parent: 'uArmL', shape: 'cap', r: 0.065, hh: 0.05, pos: [0.34, 0.745, 0], joint: [0.34, 0.86, 0], m: 1.1, hand: true },
  { n: 'uArmR', parent: 'chest', shape: 'cap', r: 0.07, hh: 0.06, pos: [-0.34, 0.99, 0], joint: [-0.34, 1.12, 0], m: 1.4 },
  { n: 'lArmR', parent: 'uArmR', shape: 'cap', r: 0.065, hh: 0.05, pos: [-0.34, 0.745, 0], joint: [-0.34, 0.86, 0], m: 1.1, hand: true },
  { n: 'uLegL', parent: 'hips', shape: 'cap', r: 0.085, hh: 0.035, pos: [0.12, 0.36, 0], joint: [0.12, 0.48, 0], m: 3 },
  { n: 'lLegL', parent: 'uLegL', shape: 'cap', r: 0.085, hh: 0.035, pos: [0.12, 0.12, 0], joint: [0.12, 0.24, 0], m: 2.4, foot: true },
  { n: 'uLegR', parent: 'hips', shape: 'cap', r: 0.085, hh: 0.035, pos: [-0.12, 0.36, 0], joint: [-0.12, 0.48, 0], m: 3 },
  { n: 'lLegR', parent: 'uLegR', shape: 'cap', r: 0.085, hh: 0.035, pos: [-0.12, 0.12, 0], joint: [-0.12, 0.24, 0], m: 2.4, foot: true },
];
const HAND_OFF = -0.13 * S;   // hand centre below the lower-arm centre
const HAND_R = 0.1 * S;
const GRAB_R = HAND_R * 1.75; // how far from the mitten a grab can catch
const ARM_LEN = 0.505 * S;    // shoulder to mitten centre, arm straight
const CARRY_MAX = 30;         // kg of a held object the arms can fully lift
const ARM_MASS = 2.9;         // upper + lower arm + mitten
const STAND_H = 0.62 * S;     // hover height of the hips centre above ground
const RAY_LEN = 1.05 * S;

const WALK = 3.4, RUN = 6.2, SWIM = 2.6, JUMP_V = 5.6;
const GETUP_T = 0.95;         // seconds to stand back up after going limp

// ---- look -----------------------------------------------------------------
const SKIN = 0xffd9b8;
const HEAD_R = 0.31 * S;
// soft plastic sheen so the rounded shapes read
const PLAYER_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 24, specular: 0x2a2a2a });
let _headMats = null;
export function headMaterials() {
  if (!_headMats) {
    const f = faceMaterials();
    const mk = (src) => new THREE.MeshPhongMaterial({ map: src.map, shininess: 24, specular: 0x2a2a2a });
    _headMats = { normal: mk(f.normal), ko: mk(f.ko) };
  }
  return _headMats;
}
// Smooth profile (r, y) through control points, unscaled units.
function smoothProfile(ctrl, n = 36) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  return curve.getPoints(n).map((v) => [Math.max(0, v.x), v.y]);
}
// Lathe a slice [i0..i1] of a profile into a geometry scaled by S.
function latheGeo(prof, i0, i1, seg = 28) {
  const pts = prof.slice(i0, i1 + 1).map(([r, y]) => new THREE.Vector2(r * S, y * S));
  return new THREE.LatheGeometry(pts, seg);
}
// Capsule with different end radii (top r0, bottom r1), centred, unscaled length.
function taperGeo(r0, r1, len) {
  const pts = [];
  const N = 8;
  for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + (i / N) * Math.PI / 2; pts.push([Math.cos(a) * r1, -len / 2 + Math.sin(a) * r1]); }
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI / 2; pts.push([Math.cos(a) * r0, len / 2 + Math.sin(a) * r0]); }
  return latheGeo(pts, 0, pts.length - 1, 18);
}
// Torso (chest-local): wide soft belly and shoulders, tapering into the hips,
// closing under the head. Its foot sits inside the hips mesh.
const TORSO_PROFILE = smoothProfile([
  [0, -0.43], [0.13, -0.415], [0.205, -0.375], [0.245, -0.3], [0.272, -0.18], [0.288, -0.05],
  [0.284, 0.08], [0.264, 0.18], [0.222, 0.26], [0.152, 0.315], [0.07, 0.345], [0, 0.355]]);
const TORSO_SPLIT = TORSO_PROFILE.reduce((best, p, i) => (Math.abs(p[1] + 0.17) < Math.abs(TORSO_PROFILE[best][1] + 0.17) ? i : best), 0);
const HIPS_PROFILE = smoothProfile([
  [0, -0.2], [0.12, -0.188], [0.205, -0.13], [0.238, -0.04], [0.236, 0.05], [0.2, 0.13], [0.11, 0.185], [0, 0.2]], 24);

// scratch
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qd = new THREE.Quaternion();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
const _e = new THREE.Euler();
const _hA = new THREE.Vector3(), _hB = new THREE.Vector3();
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
const qeul = (x, y, z, o = 'XYZ') => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, o));
const toQ = (r, q = _qa) => q.set(r.x, r.y, r.z, r.w);
const toV = (r, v = _va) => v.set(r.x, r.y, r.z);

// Error rotation (as a scaled axis) that turns q into target.
function rotError(target, q, out) {
  _qd.copy(target).multiply(_qc.copy(q).invert());
  if (_qd.w < 0) { _qd.x = -_qd.x; _qd.y = -_qd.y; _qd.z = -_qd.z; _qd.w = -_qd.w; }
  const w = Math.min(1, _qd.w), ang = 2 * Math.acos(w), s = Math.sqrt(1 - w * w);
  if (s < 1e-5) return out.set(0, 0, 0);
  return out.set(_qd.x / s, _qd.y / s, _qd.z / s).multiplyScalar(ang);
}

export class Player {
  constructor(game, index, deviceId) {
    this.game = game;
    this.physics = game.physics;
    this.world = game.physics.world;
    this.index = index;
    this.deviceId = deviceId;
    this.colorIndex = index % PLAYER_COLORS.length;
    this.color = PLAYER_COLORS[this.colorIndex];
    this.hat = index % HATS.length === 0 ? 1 : index % HATS.length;
    this.bit = playerBit(index);
    this.groupsNormal = groups(this.bit, ALL & ~this.bit);
    this.groupsSeated = groups(this.bit, ALL & ~this.bit & ~G_VEH);
    this.queryGroups = groups(ALL, ALL & ~this.bit);
    this.yaw = 0;
    this.state = 'normal'; // normal | limp | seated
    this.limpTimer = 0;    // >0: knocked out (auto recover)
    this.recover = 1;      // 0..1 ramp after limp
    this.phase = 0;
    this.grounded = false;
    this.groundBody = null;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.swimming = false;
    this.hands = { L: { joint: null, body: null, cool: 0 }, R: { joint: null, body: null, cool: 0 } };
    this.punch = { t: 0, hand: 'L', hit: false };
    this.seat = null;
    this.seatJoint = null;
    this.jumpCool = 0;
    this.airTime = 0;
    this.prevChestVel = new THREE.Vector3();
    this.impactGrace = 0;
    this.t = 0;            // own clock (game.time only advances with rendering)
    this.lean = 0;         // filtered forward lean (rad)
    this.roll = 0;         // filtered side lean into turns (rad)
    this.prevYaw = 0;
    this.yawRate = 0;
    this.prevVy = 0;
    this.landDip = 0;      // 0..1 knees give after a landing
    this.sq = 0; this.sqV = 0; // visual squash & stretch spring
    this.getUp = -1;       // >=0: seconds into standing back up
    this.getUpH = 0;       // hips height above ground when the get-up started
    this.stumble = 0;      // >0: wobbly after a bump
    this.mantle = null;    // climbing over a ledge
    this.hangPush = 0;     // time the stick has been held forward while hanging
    this.accFwd = 0;       // forward acceleration commanded last step
    this.reachDown = 0;    // 0..1 bending over to reach the floor
    this.reachArm = { L: false, R: false }; // arm is reaching out to grab
    this.cam = null;
    this.lastInput = null;
    this.parts = {};
    this.bodies = [];
    this.build();
  }

  build() {
    const scene = this.game.scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    for (const p of PARTS) {
      const bd = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.pos[0] * S, p.pos[1] * S + 2, p.pos[2] * S)
        .setLinearDamping(0.05).setAngularDamping(1.5).setCanSleep(false);
      if (p.n === 'hips' || p.n === 'chest') bd.setCcdEnabled(true);
      const body = this.world.createRigidBody(bd);
      const cd = p.shape === 'ball' ? RAPIER.ColliderDesc.ball(p.r * S) : RAPIER.ColliderDesc.capsule(p.hh * S, p.r * S);
      cd.setMass(p.m).setFriction(p.foot ? 0.15 : 0.6).setRestitution(0.05).setCollisionGroups(this.groupsNormal)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(1500);
      const cols = [this.world.createCollider(cd, body)];
      if (p.hand) {
        const hd = RAPIER.ColliderDesc.ball(HAND_R).setTranslation(0, HAND_OFF, 0).setMass(0.4).setFriction(1.0).setCollisionGroups(this.groupsNormal);
        cols.push(this.world.createCollider(hd, body));
      }
      for (const c of cols) this.physics.handleOwner.set(c.handle, this);
      const part = { def: p, body, cols, mesh: this.partMesh(p), target: new THREE.Quaternion(), kp: 0, kd: 0, maxT: 1e9, rec: this.physics.track(body),
        rest: new THREE.Vector3(p.pos[0] * S, p.pos[1] * S, p.pos[2] * S) };
      const I = body.principalInertia();
      part.I = (I.x + I.y + I.z) / 3;
      this.group.add(part.mesh);
      this.parts[p.n] = part;
      this.bodies.push(body);
    }
    for (const p of PARTS) {
      if (!p.parent) continue;
      const a = this.parts[p.parent], b = this.parts[p.n];
      const j = p.joint.map((v) => v * S);
      const pa = a.def.pos.map((v) => v * S), pb = p.pos.map((v) => v * S);
      const data = RAPIER.JointData.spherical(
        { x: j[0] - pa[0], y: j[1] - pa[1], z: j[2] - pa[2] },
        { x: j[0] - pb[0], y: j[1] - pb[1], z: j[2] - pb[2] });
      b.joint = this.world.createImpulseJoint(data, a.body, b.body, true);
      b.joint.setContactsEnabled(false);
      b.parent = a;
    }
    this.totalMass = PARTS.reduce((s, p) => s + p.m, 0) + 0.8;
    // Effective inertia each joint has to swing: the whole limb below it,
    // about the joint. Twist about the bone axis only sees the part itself.
    const kids = (n) => PARTS.filter((q) => q.parent === n).flatMap((q) => [q.n, ...kids(q.n)]);
    for (const p of PARTS) {
      if (!p.parent) continue;
      const part = this.parts[p.n];
      const J = new THREE.Vector3(p.joint[0] * S, p.joint[1] * S + 2, p.joint[2] * S);
      const b = part.body, c = b.worldCom(), I = b.principalInertia();
      part.Iswing = (I.x + I.z) / 2 + b.mass() * J.distanceToSquared(new THREE.Vector3(c.x, c.y, c.z)) * 0.25;
      part.Itwist = I.y;
      part.sub = [p.n, ...kids(p.n)].map((n) => this.parts[n]);
      part.anchor = new THREE.Vector3(p.joint[0] - p.pos[0], p.joint[1] - p.pos[1], p.joint[2] - p.pos[2]).multiplyScalar(S);
    }
  }

  // One mesh per physics part, shaped so the parts read as a single soft
  // "bean": the torso is a lathed jelly-bean that tapers down into the hips
  // (its lower end hides inside the hips mesh, so bending at the waist never
  // opens a seam), a big round head, stubby tapered limbs and mitten hands.
  partMesh(p) {
    const b = new Builder();
    const shirt = this.color;
    const pants = this.pantsColor ?? new THREE.Color(this.color).multiplyScalar(0.55).getHex(); // pantsColor: customiser (cosmetics.js)
    const skin = SKIN;
    const shoe = 0x3a3340;
    const g = new THREE.Group();
    const side = p.n.endsWith('L') ? 1 : -1;
    if (p.n === 'hips') {
      // rounded seat: a squashed ball, slightly wider than deep
      b.add(latheGeo(HIPS_PROFILE, 0, HIPS_PROFILE.length - 1), pants, [0, 0, 0], null, [1, 1, 0.9]);
    } else if (p.n === 'chest') {
      const split = TORSO_SPLIT;
      b.add(latheGeo(TORSO_PROFILE, 0, split), pants, [0, 0, 0], null, [1, 1, 0.88]);
      b.add(latheGeo(TORSO_PROFILE, split, TORSO_PROFILE.length - 1), shirt, [0, 0, 0], null, [1, 1, 0.88]);
    } else if (p.n === 'head') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 32, 24), headMaterials().normal);
      m.scale.set(1, 0.97, 0.98);
      m.castShadow = true;
      this.headMesh = m;
      g.add(m);
      this.hatMesh = new THREE.Group();
      g.add(this.hatMesh);
      this.buildHat();
      return g;
    } else if (p.n.startsWith('uArm')) {
      // short sleeve: fat at the shoulder, tapering to the elbow
      b.add(taperGeo(0.085, 0.068, 0.2), shirt, [0, 0.005 * S, 0]);
    } else if (p.n.startsWith('lArm')) {
      b.add(taperGeo(0.066, 0.058, 0.16), skin, [0, 0.01 * S, 0]);
      // mitten: a fat rounded paddle with a thumb pointing forward-in
      b.sphere(HAND_R * 1.08, 0xffffff, [0, HAND_OFF, 0], [0.95, 1.12, 0.82], 16);
      b.sphere(HAND_R * 0.48, 0xffffff, [-side * 0.045 * S, HAND_OFF + 0.035 * S, 0.055 * S], [1, 1.25, 1], 10);
      b.cyl(HAND_R * 0.82, HAND_R * 0.9, 0.035 * S, 0xf1f1f1, [0, HAND_OFF + 0.075 * S, 0], null, 14);
    } else if (p.n.startsWith('uLeg')) {
      b.add(taperGeo(0.105, 0.088, 0.21), pants, [0, 0.01 * S, 0]);
    } else if (p.n.startsWith('lLeg')) {
      b.add(taperGeo(0.088, 0.082, 0.17), pants, [0, 0.03 * S, 0]);
      // round chunky shoe, toe forward
      b.sphere(0.105 * S, shoe, [0, -0.075 * S, 0.045 * S], [1, 0.68, 1.45], 16);
      b.sphere(0.102 * S, 0xe8e8e8, [0, -0.098 * S, 0.045 * S], [1, 0.3, 1.47], 16);
    }
    const m = b.mesh(PLAYER_MAT);
    g.add(m);
    return g;
  }

  buildHat() {
    const hm = this.hatMesh;
    while (hm.children.length) { const c = hm.children.pop(); c.geometry?.dispose(); }
    const kind = HATS[this.hat];
    if (kind === 'none') return;
    const b = new Builder(), R = HEAD_R, c = this.color;
    const dark = new THREE.Color(c).multiplyScalar(0.6).getHex();
    if (kind === 'cap') {
      b.sphere(R * 1.02, c, [0, R * 0.35, 0], [1, 0.62, 1], 16);
      b.cyl(R * 0.75, R * 0.75, 0.02, dark, [0, R * 0.42, R * 0.55], [0.2, 0, 0], 16);
    } else if (kind === 'tophat') {
      b.cyl(R * 0.9, R * 0.9, 0.03, 0x222222, [0, R * 0.8, 0], null, 18);
      b.cyl(R * 0.58, R * 0.6, R * 0.95, 0x222222, [0, R * 1.3, 0], null, 18);
      b.cyl(R * 0.61, R * 0.61, R * 0.18, c, [0, R * 0.95, 0], null, 18);
    } else if (kind === 'beanie') {
      b.sphere(R * 1.04, c, [0, R * 0.3, 0], [1, 0.7, 1], 16);
      b.sphere(R * 0.25, 0xffffff, [0, R * 1.05, 0]);
    } else if (kind === 'crown') {
      b.cyl(R * 0.6, R * 0.55, R * 0.4, 0xffd23f, [0, R * 1.0, 0], null, 10);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.cone(R * 0.12, R * 0.3, 0xffd23f, [Math.sin(a) * R * 0.55, R * 1.32, Math.cos(a) * R * 0.55]); }
      b.sphere(R * 0.09, 0xff3355, [0, R * 1.0, R * 0.6]);
    } else if (kind === 'party') {
      b.cone(R * 0.45, R * 1.1, c, [0, R * 1.35, 0], [-0.1, 0, 0]);
      b.sphere(R * 0.14, 0xffffff, [0, R * 1.93, -0.04]);
    } else if (kind === 'cowboy') {
      b.cyl(R * 1.35, R * 1.35, 0.03, 0x9a6232, [0, R * 0.7, 0], null, 20);
      b.cyl(R * 0.6, R * 0.68, R * 0.6, 0x9a6232, [0, R * 1.0, 0], null, 16);
      b.cyl(R * 0.69, R * 0.69, R * 0.12, 0x4a2a12, [0, R * 0.8, 0], null, 16);
    } else if (kind === 'bucket') {
      b.cyl(R * 0.78, R * 1.05, R * 0.55, c, [0, R * 0.75, 0], null, 18);
      b.cyl(R * 1.25, R * 1.25, 0.02, c, [0, R * 0.5, 0], null, 18);
    } else buildExtraHat(b, kind, R, c, hm); // unlockable hats (src/hats.js)
    hm.add(b.mesh());
  }

  setColor(ci) {
    this.colorIndex = (ci + PLAYER_COLORS.length) % PLAYER_COLORS.length;
    this.color = PLAYER_COLORS[this.colorIndex];
    for (const n in this.parts) {
      const part = this.parts[n];
      if (n === 'head') { this.buildHat(); continue; }
      this.group.remove(part.mesh);
      part.mesh = this.partMesh(part.def);
      this.group.add(part.mesh);
    }
    this.game.ui?.refreshTags();
  }

  // ---- helpers ----------------------------------------------------------
  pos() { return this.parts.chest.body.translation(); }
  get chest() { return this.parts.chest.body; }
  get hips() { return this.parts.hips.body; }

  setGroups(g) {
    for (const n in this.parts) for (const c of this.parts[n].cols) c.setCollisionGroups(g);
  }

  // Places the ragdoll in its rest pose at a position (feet) and facing.
  teleport(x, y, z, yaw = this.yaw) {
    this.yaw = yaw;
    _qa.setFromAxisAngle(UP, yaw);
    const rot = { x: _qa.x, y: _qa.y, z: _qa.z, w: _qa.w };
    for (const n in this.parts) {
      const p = this.parts[n];
      _vb.copy(p.rest).applyQuaternion(_qa);
      p.body.setTranslation({ x: x + _vb.x, y: y + _vb.y, z: z + _vb.z }, true);
      p.body.setRotation(rot, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      p.rec.snap = true;
    }
    this.prevChestVel.set(0, 0, 0);
    this.impactGrace = 0.3;
  }

  setVelocity(v) {
    for (const b of this.bodies) b.setLinvel(v, true);
  }

  knockOut(t) {
    if (this.state === 'seated') return;
    this.releaseAll();
    this.mantle = null;
    this.state = 'limp';
    this.limpTimer = Math.max(this.limpTimer, t);
    this.headMesh.material = headMaterials().ko;
    this.game.audio?.play('ko', this.pos());
  }

  // Back to normal control. With getUp the body stands up from wherever it
  // lies over GETUP_T seconds instead of popping straight up.
  wake(getUp = true) {
    this.state = 'normal';
    this.limpTimer = 0;
    this.recover = getUp ? 1 : 0;
    this.getUp = getUp ? 0 : -1;
    this.getUpH = Math.max(0.05, Math.min(STAND_H, this.groundDist ?? STAND_H));
    this.headMesh.material = headMaterials().normal;
  }

  // Let go. With fling, a light object we were swinging keeps the arm's
  // swing (plus a bit) so releasing mid-swing throws it.
  releaseHand(h, fling = false) {
    const hand = this.hands[h];
    if (hand.joint) {
      if (hand.joint.isValid()) this.world.removeImpulseJoint(hand.joint, true);
      const b = hand.body;
      if (fling && b && b.isDynamic() && !(hand.owner instanceof Player) && b.mass() < 60 && this.flung !== b) {
        // the swing we give it, relative to our body, gets a boost along our facing
        const cv = this.chest.linvel(), bv = b.linvel();
        const rx = bv.x - cv.x, ry = bv.y - cv.y, rz = bv.z - cv.z;
        const rs = Math.hypot(rx, ry, rz);
        if (rs > 1.2) {
          const k = Math.min(1, (rs - 1.2) / 2.5);
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          b.setLinvel({ x: bv.x + (rx * 0.4 + fx * rs * 0.7) * k, y: bv.y + (ry * 0.2 + rs * 0.35) * k, z: bv.z + (rz * 0.4 + fz * rs * 0.7) * k }, true);
          this.flung = b;
          this.game.audio?.play('swish', b.translation());
        }
      }
      hand.joint = null; hand.body = null; hand.owner = null;
    }
  }
  releaseAll() { this.releaseHand('L'); this.releaseHand('R'); }

  handPos(h, out) {
    const b = this.parts['lArm' + h].body;
    toQ(b.rotation(), _qb);
    out.set(0, HAND_OFF, 0).applyQuaternion(_qb).add(toV(b.translation(), _vc));
    return out;
  }

  // ---- seats ------------------------------------------------------------
  sitIn(seat) {
    this.releaseAll();
    this.mantle = null;
    if (this.state === 'limp') this.wake(false);
    this.seat = seat;
    seat.occupant = this;
    this.state = 'seated';
    this.setGroups(this.groupsSeated);
    // put hips at the seat, then lock them there
    const sb = seat.body;
    toQ(sb.rotation(), _qa);
    _e.setFromQuaternion(_qa.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, seat.yaw || 0)), 'YXZ');
    const p = _vb.set(seat.pos[0], seat.pos[1], seat.pos[2]).applyQuaternion(_qa).add(toV(sb.translation(), _vc));
    this.teleport(p.x, p.y - this.parts.hips.rest.y, p.z, _e.y);
    const lq = new THREE.Quaternion().setFromAxisAngle(UP, seat.yaw || 0);
    const data = RAPIER.JointData.fixed({ x: seat.pos[0], y: seat.pos[1], z: seat.pos[2] }, { x: lq.x, y: lq.y, z: lq.z, w: lq.w },
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    this.seatJoint = this.world.createImpulseJoint(data, sb, this.hips, true);
    this.game.audio?.play('seat', this.pos());
    seat.onEnter?.(this);
  }

  leaveSeat() {
    const seat = this.seat;
    if (!seat) return;
    if (this.seatJoint && this.seatJoint.isValid()) this.world.removeImpulseJoint(this.seatJoint, true);
    this.seatJoint = null;
    seat.occupant = null;
    this.seat = null;
    this.state = 'normal';
    this.recover = 0.4;
    this.setGroups(this.groupsNormal);
    const sb = seat.body;
    toQ(sb.rotation(), _qa);
    const ex = seat.exit || [seat.pos[0] + (seat.pos[0] >= 0 ? 1.2 : -1.2), seat.pos[1] + 0.3, seat.pos[2]];
    const p = seat.exitWorld ? _vb.set(seat.exitWorld.x, seat.exitWorld.y, seat.exitWorld.z)
      : _vb.set(ex[0], ex[1], ex[2]).applyQuaternion(_qa).add(toV(sb.translation(), _vc));
    // make sure we don't drop out under the ground
    const gy = this.game.groundHeight(p.x, p.z, p.y + 2);
    const y = Math.max(p.y - 0.3, gy + 0.05);
    const v = sb.linvel();
    this.teleport(p.x, y, p.z, this.yaw);
    this.setVelocity({ x: v.x * 0.8, y: v.y * 0.8 + 1, z: v.z * 0.8 });
    seat.onExit?.(this);
  }

  // ---- control ------------------------------------------------------------
  // Drives the joint `part` toward `target` (relative to its parent).
  drive(part, kp, kd, maxT = 1e9) {
    const b = part.body, pb = part.parent.body;
    toQ(pb.rotation(), _qa);
    _qb.copy(_qa).multiply(part.target);
    rotError(_qb, toQ(b.rotation(), _qc.clone()), _va);
    const w = b.angvel(), pw = pb.angvel();
    _vb.set(w.x - pw.x, w.y - pw.y, w.z - pw.z);
    // split into twist (about the bone) and swing
    const ax = _vc.set(0, 1, 0).applyQuaternion(toQ(b.rotation(), _qd));
    const et = _va.dot(ax), wt = _vb.dot(ax);
    _va.addScaledVector(ax, -et); _vb.addScaledVector(ax, -wt);
    // implicit PD: relative angular velocity we want after this step
    const sI = 1 / (1 + DT * kd);
    _va.multiplyScalar(DT * kp * sI).addScaledVector(_vb, sI - 1).multiplyScalar(part.Iswing)
      .addScaledVector(ax, ((wt + DT * kp * et) * sI - wt) * part.Itwist);
    const l = _va.length(), lim = maxT * DT;
    if (l > lim) _va.multiplyScalar(lim / l);
    b.applyTorqueImpulse({ x: _va.x, y: _va.y, z: _va.z }, true);
    pb.applyTorqueImpulse({ x: -_va.x, y: -_va.y, z: -_va.z }, true);
  }

  // Raised limbs float (their weight moves onto the torso) so the joint drives
  // only handle motion and can stay soft and stable. Hanging arms keep their
  // weight and swing like pendulums.
  gravityComp(limp) {
    const w = -9.81 * DT;
    let hipsW = 0, chestW = 0;
    for (const n in this.parts) {
      const p = this.parts[n];
      if (!p.parent) continue;
      const float = !limp && (p.float !== false);
      if (p.gs !== float) { p.gs = float; p.body.setGravityScale(float ? 0 : 1, true); }
      if (float) { if (n.includes('Leg')) hipsW += p.body.mass(); else chestW += p.body.mass(); }
    }
    if (hipsW) this.hips.applyImpulse({ x: 0, y: hipsW * w, z: 0 }, true);
    if (chestW) this.chest.applyImpulse({ x: 0, y: chestW * w, z: 0 }, true);
  }

  // World-space upright/facing torque on a root body.
  upright(body, target, kp, kd, I) {
    rotError(target, toQ(body.rotation(), _qc.clone()), _va);
    const w = body.angvel();
    _va.multiplyScalar(kp * I).addScaledVector(_vb.set(w.x, w.y, w.z), -kd * I).multiplyScalar(DT);
    body.applyTorqueImpulse({ x: _va.x, y: _va.y, z: _va.z }, true);
  }

  probeGround() {
    const hp = this.hips.translation();
    const ray = new RAPIER.Ray({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, RAY_LEN, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
    if (!hit) { this.grounded = false; this.groundBody = null; this.groundCollider = null; this.groundDist = 99; return; }
    this.groundDist = hit.timeOfImpact;
    this.grounded = hit.timeOfImpact < STAND_H + 0.2 * S;
    this.groundCollider = hit.collider;
    this.groundBody = hit.collider.parent();
    this.groundNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    this.groundPoint = { x: hp.x, y: hp.y - hit.timeOfImpact, z: hp.z };
  }

  groundVelocity(out) {
    out.set(0, 0, 0);
    const gb = this.groundBody;
    if (!gb || gb.isFixed()) return out;
    const v = gb.linvel(), w = gb.angvel(), c = gb.worldCom(), p = this.groundPoint;
    _vc.set(p.x - c.x, p.y - c.y, p.z - c.z);
    out.set(w.x, w.y, w.z).cross(_vc).add(_vb.set(v.x, v.y, v.z));
    return out;
  }

  // Called every physics step before world.step.
  step(inp, pressed) {
    const parts = this.parts;
    const chest = parts.chest.body, hips = parts.hips.body;
    this.t += DT;
    this.flung = null;
    this.jumpCool -= DT; this.impactGrace -= DT;
    this.hands.L.cool -= DT; this.hands.R.cool -= DT;
    if (this.punch.t > 0) this.punch.t -= DT;
    if (this.stumble > 0) this.stumble -= DT;

    // --- state transitions
    if (this.state === 'limp') {
      if (this.limpTimer > 0) { this.limpTimer -= DT; if (this.limpTimer <= 0) this.wake(); }
      else if (pressed.ragdoll || pressed.jump) this.wake();
    } else if (this.state === 'normal' && pressed.ragdoll) {
      this.state = 'limp'; this.limpTimer = 0; this.releaseAll(); this.mantle = null;
    }
    if (this.recover < 1) this.recover = Math.min(1, this.recover + DT * 1.6);

    const limp = this.state === 'limp';
    const seated = this.state === 'seated';

    // getting up: balance comes back on an ease-in curve while the hover
    // height climbs from where we lie, so the body rises through a crouch
    let rise = 1, riseUp = 1;
    if (this.getUp >= 0) {
      if (limp || seated) this.getUp = -1;
      else {
        this.getUp += DT;
        const u = Math.min(1, this.getUp / GETUP_T);
        rise = u * u * (3 - 2 * u);
        const u2 = Math.min(1, u * 1.7);
        riseUp = 0.2 + 0.8 * u2 * u2 * (3 - 2 * u2);
        if (u >= 1) this.getUp = -1;
      }
    }

    const cam = this.cam;
    const camYaw = cam ? cam.yaw : this.yaw;
    // camera-relative stick: forward is away from camera
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let mx = inp.moveX || 0, my = inp.moveY || 0;
    const mvx = fx * my - fz * mx, mvz = fz * my + fx * mx;
    const mag = Math.min(1, Math.hypot(mx, my));

    const cp = chest.translation();
    this.probeGround();
    const water = this.physics.waterLevel(cp.x, cp.y, cp.z);
    // wading is not swimming: needs about a metre of water over the ground
    const floorY = this.groundDist < 50 ? this.hips.translation().y - this.groundDist : -1e9;
    const wasSwimming = this.swimming;
    this.swimming = water != null && cp.y < water + 0.05 && water - floorY > 0.85 && !seated;
    if (this.swimming && !wasSwimming && chest.linvel().y < -2) this.game.audio?.play('splash', cp, Math.min(1.5, -chest.linvel().y / 6));
    this.waterLevel = water;

    // --- landings: knees give, the body squashes
    const v = hips.linvel();
    if (!this.grounded && !this.swimming && !seated) this.airTime += DT;
    else {
      if (this.airTime > 0.18 && !limp && !seated && this.grounded) {
        const lv = Math.max(0, -this.prevVy);
        this.landDip = Math.max(this.landDip, Math.min(1, lv / 7));
        this.sqV += Math.min(5, lv * 0.6);
      }
      this.airTime = 0;
    }
    this.landDip = Math.max(0, this.landDip - DT * 3.2);

    // --- grabbing
    if (!seated && !limp) { this.updateHands(inp); this.carryAssist(); }
    // looking down while reaching bends over to pick things off the floor
    const camPitch = cam ? cam.pitch : 0.2;
    const reachingNow = !limp && !seated && ((inp.grabL || 0) > 0.3 || (inp.grabR || 0) > 0.3);
    const rdT = reachingNow && this.grounded && !this.swimming ? Math.max(0, Math.min(1, (camPitch - 0.45) / 0.75)) : 0;
    this.reachDown += (rdT - this.reachDown) * Math.min(1, DT * 6);

    // --- facing
    if (!limp && !seated && mag > 0.1 && !this.mantle) {
      const want = Math.atan2(mvx, mvz);
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const rate = (this.grounded || this.swimming ? 9 : 4) * DT;
      this.yaw += Math.max(-rate, Math.min(rate, d));
    }
    if (seated) {
      toQ(this.seat.body.rotation(), _qa);
      _e.setFromQuaternion(_qa, 'YXZ');
      this.yaw = _e.y + (this.seat.yaw || 0);
    }
    let dyaw = this.yaw - this.prevYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.prevYaw = this.yaw;
    this.yawRate += (dyaw / DT - this.yawRate) * Math.min(1, DT * 12);

    // --- balance
    const gv = this.groundVelocity(new THREE.Vector3());
    const stumbleK = this.stumble > 0 ? 1 - 0.6 * Math.min(1, this.stumble / 0.5) : 1;
    const strength = limp ? 0 : this.recover * riseUp * stumbleK;
    const speed = this.swimming ? SWIM : (inp.sprint ? RUN : WALK);
    const hv = _vc.set(v.x - gv.x, 0, v.z - gv.z);
    const hspeed = hv.length();
    const fwdSpeed = hv.x * Math.sin(this.yaw) + hv.z * Math.cos(this.yaw);
    const hanging = !this.grounded && !!(this.hands.L.joint || this.hands.R.joint);
    const amp = Math.min(1, Math.abs(fwdSpeed) / 5.5) * 0.95;

    // lean into speed and acceleration, bank into turns, waddle with each step
    let leanT = 0, rollT = 0, waddle = 0, twist = 0;
    if (!limp && !seated) {
      if (this.swimming) leanT = mag > 0.1 ? 1.15 : 0.5;
      else if (this.grounded) {
        leanT = Math.max(-0.35, Math.min(0.5, fwdSpeed * 0.045 + this.accFwd * 0.03)) + this.reachDown * 1.0;
        rollT = Math.max(-0.35, Math.min(0.35, -this.yawRate * Math.min(hspeed, RUN) * 0.05));
        waddle = Math.sin(this.phase) * 0.1 * Math.max(amp, mag > 0.1 ? 0.3 : 0);
        twist = Math.sin(this.phase) * 0.14 * amp;
      } else if (!hanging) leanT = 0.12;
      if (this.mantle) leanT = 0.5;
    }
    const lk = Math.min(1, DT * (this.swimming ? 4 : 9));
    this.lean += (leanT - this.lean) * lk;
    this.roll += (rollT - this.roll) * lk;

    if (!limp) {
      const yq = _qb.setFromAxisAngle(UP, this.yaw);
      const chestT = yq.clone().multiply(qeul(this.lean, -twist * 0.6, this.roll + waddle, 'YXZ'));
      const hipsT = yq.clone().multiply(qeul(this.lean * 0.4, twist, (this.roll + waddle) * 0.5, 'YXZ'));
      const air = this.grounded || this.swimming || seated ? 1 : 0.55;
      const k = strength * air * (hanging ? 0.35 : 1) * (this.mantle ? 0.5 : 1);
      this.upright(chest, chestT, 260 * k, 26 * Math.sqrt(k), parts.chest.I * 4.5);
      this.upright(hips, hipsT, 200 * k, 22 * Math.sqrt(k), parts.hips.I * 4.5);
    }

    // --- limp bodies float: per-part buoyancy and water drag
    if (limp && water != null) {
      for (const n in parts) {
        const p = parts[n], b = p.body, t = b.translation();
        const r = p.def.r * S, depth = water - t.y;
        if (depth <= -r) continue;
        const k = Math.min(1, (depth + r) / (2 * r)), m = b.mass(), bv = b.linvel();
        const drag = Math.min(1, k * 2.5 * DT);
        b.applyImpulse({ x: -bv.x * m * drag, y: k * m * 9.81 * 1.3 * DT - bv.y * m * drag, z: -bv.z * m * drag }, true);
      }
    }

    // --- trampolines and bouncy castles
    if (this.grounded && !seated && this.groundCollider && this.jumpCool <= 0) {
      const bounce = this.physics.bouncy.get(this.groundCollider.handle);
      if (bounce && v.y < -1.2) {
        const up = Math.max(-v.y * 0.92, inp.jump ? bounce : bounce * 0.55);
        for (const b of this.bodies) { const bv = b.linvel(); b.applyImpulse({ x: 0, y: (up - bv.y) * b.mass(), z: 0 }, true); }
        this.jumpCool = 0.25;
        this.impactGrace = 0.3;
        this.sqV -= 2.5;
        this.game.audio?.play('boing', cp, Math.min(1, -v.y / 8));
      }
    }

    // --- hover spring / swimming lift
    if (!limp && !seated && !this.mantle) {
      if (this.swimming) {
        const target = water - 0.12;
        const err = target - cp.y;
        const cv = chest.linvel();
        const a = Math.max(-5, Math.min(25, 40 * err - 6 * cv.y + 9.81));
        chest.applyImpulse({ x: 0, y: a * this.totalMass * DT * 0.75, z: 0 }, true);
        hips.applyImpulse({ x: 0, y: a * this.totalMass * DT * 0.25, z: 0 }, true);
      } else if (this.grounded && this.jumpCool <= 0) {
        // bouncy walk: the hips bob up as the legs pass each other
        const bob = (Math.abs(Math.cos(this.phase)) - 0.55) * 0.2 * S * amp;
        let h = STAND_H + bob - this.landDip * 0.16 * S - this.reachDown * 0.12 * S;
        if (this.getUp >= 0) h = this.getUpH + (h - this.getUpH) * rise;
        const err = h - this.groundDist;
        const vy = v.y - gv.y;
        let a = 140 * err - 16 * vy + 9.81;
        a = Math.max(0, Math.min(45, a)) * Math.max(strength, this.getUp >= 0 ? 1 : 0);
        const imp = a * this.totalMass * DT;
        hips.applyImpulse({ x: 0, y: imp * 0.7, z: 0 }, true);
        chest.applyImpulse({ x: 0, y: imp * 0.3, z: 0 }, true);
        // equal and opposite push on whatever we stand on (boats, see-saws...)
        const gb = this.groundBody;
        if (gb && gb.isDynamic()) gb.applyImpulseAtPoint({ x: 0, y: -imp * 0.8, z: 0 }, this.groundPoint, true);
      }
    }

    // --- climbing over a ledge
    if (this.mantle) this.updateMantle();

    // --- locomotion
    this.accFwd = 0;
    if (!limp && !seated && !this.mantle) {
      const slippery = this.grounded && this.groundCollider && this.physics.slippery.has(this.groundCollider.handle);
      const tvx = mvx * speed + gv.x, tvz = mvz * speed + gv.z;
      let dvx = (mag > 0.05 ? tvx : (this.grounded ? gv.x : v.x)) - v.x;
      let dvz = (mag > 0.05 ? tvz : (this.grounded ? gv.z : v.z)) - v.z;
      // snappy but not instant: ~0.25 s to walking pace, quicker to turn round
      let accel;
      if (this.swimming) accel = 6;
      else if (!this.grounded) accel = hanging ? 5 : 6;
      else if (slippery) accel = 1;
      else {
        const opp = hspeed > 0.5 && mag > 0.05 ? Math.max(0, -(hv.x * mvx + hv.z * mvz) / (hspeed * mag)) : 0;
        accel = (mag > 0.05 ? 14 : 12) + 12 * opp;
      }
      if (slippery) {
        // slide down the slope: tangential part of gravity
        const n = this.groundNormal;
        const gx = n.x * n.y * 9.81, gz = n.z * n.y * 9.81;
        hips.applyImpulse({ x: gx * this.totalMass * DT * 0.55, y: 0, z: gz * this.totalMass * DT * 0.55 }, true);
        chest.applyImpulse({ x: gx * this.totalMass * DT * 0.45, y: 0, z: gz * this.totalMass * DT * 0.45 }, true);
        if (mag < 0.05) { dvx = 0; dvz = 0; }
      }
      if (this.punch.t > 0.12 && mag < 0.05) { dvx = 0; dvz = 0; } // don't brake the lunge
      const maxDv = accel * DT;
      const dl = Math.hypot(dvx, dvz);
      if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
      const M = this.totalMass * strength * (this.getUp >= 0 ? rise : 1);
      hips.applyImpulse({ x: dvx * M * 0.55, y: 0, z: dvz * M * 0.55 }, true);
      chest.applyImpulse({ x: dvx * M * 0.45, y: 0, z: dvz * M * 0.45 }, true);
      if (this.grounded) this.accFwd = (dvx * Math.sin(this.yaw) + dvz * Math.cos(this.yaw)) / DT;

      // climbing: hold forward (or press jump) while hanging off a ledge
      const bothHeld = !!(this.hands.L.joint && this.hands.R.joint);
      const pushing = bothHeld && mag > 0.5 && (mvx * Math.sin(this.yaw) + mvz * Math.cos(this.yaw)) / mag > 0.5;
      this.hangPush = pushing ? this.hangPush + DT : 0;
      // a ledge under our grip: jump (or keep pushing forward) to climb over it
      const wantClimb = bothHeld && this.jumpCool <= 0 && (pressed.jump || this.hangPush > 0.35);
      const ledge = wantClimb ? this.findLedge() : null;

      // jump
      if (ledge != null) {
        this.startMantle(ledge);
        this.hangPush = 0;
        this.game.audio?.play('jump', cp);
      } else if (pressed.jump && this.jumpCool <= 0 && (this.getUp < 0 || this.getUp > GETUP_T * 0.6)) {
        if (this.grounded || this.swimming) {
          const jv = this.swimming ? 4.2 : JUMP_V;
          for (const b of this.bodies) {
            const bv = b.linvel();
            b.applyImpulse({ x: 0, y: (gv.y + jv - bv.y) * b.mass(), z: 0 }, true);
          }
          this.jumpCool = 0.35;
          this.impactGrace = Math.max(this.impactGrace, 0.08);
          this.sqV -= 3;
          this.landDip = 0;
          this.game.audio?.play('jump', cp);
        } else if (hanging) {
          // let go and fling yourself up and forward (monkey bars, ropes)
          this.releaseAll();
          this.hands.L.cool = this.hands.R.cool = 0.4;
          for (const b of this.bodies) b.applyImpulse({ x: Math.sin(this.yaw) * 2.5 * b.mass(), y: 6.5 * b.mass(), z: Math.cos(this.yaw) * 2.5 * b.mass() }, true);
          this.sqV -= 2;
          this.impactGrace = Math.max(this.impactGrace, 0.08);
          this.jumpCool = 0.35;
          this.game.audio?.play('jump', cp);
        }
      }
      if (pressed.punch && this.punch.t <= 0) {
        this.punch.hand = this.punch.hand === 'L' ? 'R' : 'L';
        if (inp.grabL > 0.5 && inp.grabR <= 0.5) this.punch.hand = 'R';
        if (inp.grabR > 0.5 && inp.grabL <= 0.5) this.punch.hand = 'L';
        this.punch.t = 0.32; this.punch.hit = false;
        this.impactGrace = Math.max(this.impactGrace, 0.08);
        const la = parts['lArm' + this.punch.hand].body;
        la.applyImpulse({ x: Math.sin(this.yaw) * 1.5, y: 0, z: Math.cos(this.yaw) * 1.5 }, true);
        // lunge into the punch
        const lv = this.grounded ? 2.2 : 1.0;
        chest.applyImpulse({ x: Math.sin(this.yaw) * lv * this.totalMass * 0.5, y: 0, z: Math.cos(this.yaw) * lv * this.totalMass * 0.5 }, true);
        hips.applyImpulse({ x: Math.sin(this.yaw) * lv * this.totalMass * 0.3, y: 0, z: Math.cos(this.yaw) * lv * this.totalMass * 0.3 }, true);
        this.game.audio?.play('swish', cp);
      }
    }
    if (this.punch.t > 0.08 && this.punch.t < 0.26 && !this.punch.hit && !limp) this.punchHit();

    // --- pose
    this.animate(inp, fwdSpeed, limp, seated, mag, amp, hanging);
    const kLimb = limp ? 0.06 : strength * 0.85 + 0.15;
    if (!limp && !seated) for (const h of ['L', 'R']) if (this.reachArm[h] && !this.hands[h].joint) this.handAssist(h, kLimb);
    this.gravityComp(limp);
    for (const n in parts) {
      const p = parts[n];
      if (!p.parent) continue;
      let kp = p.kp * kLimb, kd = p.kd * Math.sqrt(kLimb);
      if (limp) { kp = Math.max(kp, 4); kd = Math.max(kd, 1.2); }
      this.drive(p, kp, kd, p.maxT);
    }

    // --- impacts: big ones knock you out, smaller ones make you stumble
    const cv = chest.linvel();
    _va.set(cv.x, cv.y, cv.z);
    const dv = _va.distanceTo(this.prevChestVel);
    this.prevChestVel.copy(_va);
    if (!seated && this.impactGrace <= 0) {
      if (dv > 9) this.knockOut(Math.min(4, 1.2 + (dv - 9) * 0.25));
      else if (dv > 4.5 && !limp) { this.stumble = Math.max(this.stumble, 0.25 + (dv - 4.5) * 0.08); this.sqV += 1.5; }
    }
    if (!seated && !limp && this.impactGrace <= 0) this.hitCheck();
    this.prevVy = hips.linvel().y;

    // --- squash & stretch spring (visual only)
    this.sqV += (-260 * this.sq - 10 * this.sqV) * DT;
    this.sq += this.sqV * DT;
    this.sq = Math.max(-0.2, Math.min(0.22, this.sq));

    // respawn if lost
    if (cp.y < -25) this.respawn();
  }

  // Loose things flying into our upper body: a stumble, or a knockout when
  // it's heavy and fast (a thrown crate, a rolling boulder...). Vehicles are
  // handled by the game's contact-force events.
  hitCheck() {
    const chest = this.chest, cv = chest.linvel();
    let worst = 0;
    for (const n of ['chest', 'head']) {
      this.world.contactPairsWith(this.parts[n].cols[0], (other) => {
        const b = other.parent();
        if (!b || !b.isDynamic() || this.bodies.includes(b)) return;
        if (b === this.hands.L.body || b === this.hands.R.body) return;
        const owner = this.physics.handleOwner.get(other.handle);
        if (owner && owner.constructor?.name === 'Vehicle') return;
        const v = b.linvel();
        const rv = Math.hypot(v.x - cv.x, v.y - cv.y, v.z - cv.z);
        const m = Math.min(b.mass(), 200);
        if (rv > 3.5) worst = Math.max(worst, m * rv);
      });
    }
    if (worst > 160) { this.knockOut(Math.min(3, 1 + worst / 300)); this.impactGrace = 0.4; }
    else if (worst > 35) { this.stumble = Math.max(this.stumble, 0.3 + Math.min(0.4, worst / 300)); this.sqV += 1.5; this.impactGrace = 0.25; }
  }

  // A ledge under one of our grips: returns the height of its top surface, or null.
  findLedge() {
    let best = null;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const h of ['L', 'R']) {
      const hand = this.hands[h];
      if (!hand.joint || !hand.body || hand.owner instanceof Player) continue;
      if (hand.body.isDynamic() && hand.body.mass() < 150) continue;
      const gp = this.handPos(h, new THREE.Vector3());
      for (const off of [0.12, 0.3]) {
        const o = { x: gp.x + fx * off, y: gp.y + 0.95, z: gp.z + fz * off };
        const hit = this.world.castRayAndGetNormal(new RAPIER.Ray(o, { x: 0, y: -1, z: 0 }), 1.35, true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
        if (!hit || hit.normal.y < 0.6) continue;
        const top = o.y - hit.timeOfImpact;
        if (top > gp.y - 0.3 && top < gp.y + 0.8) { best = Math.max(best ?? -1e9, top); break; }
      }
    }
    return best;
  }

  startMantle(top) {
    this.mantle = { t: 0, top, stage: 0 };
    this.impactGrace = Math.max(this.impactGrace, 0.3);
    this.sqV -= 1.5;
  }

  // Pull up until the hips clear the ledge, then let go and flop forward over it.
  updateMantle() {
    const m = this.mantle;
    m.t += DT;
    const chest = this.chest, hips = this.hips;
    const cpos = chest.translation();
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hy = hips.translation().y;
    // stage 0: pull up on the arms until the shoulders are over the edge (or we stall)
    if (m.stage === 0) {
      const vy = chest.linvel().y;
      m.stall = vy < 0.4 && m.t > 0.25 ? (m.stall || 0) + DT : 0;
      if (cpos.y > m.top + 0.12 || m.stall > 0.12 || m.t > 0.9) {
        m.stage = 1; m.t1 = m.t;
        const h0 = hips.translation(); m.x1 = h0.x; m.z1 = h0.z;
        this.releaseAll();
        this.hands.L.cool = this.hands.R.cool = 0.45;
      }
    }
    // stage 1: hands off, hips up over the edge and flop forward onto the top
    if (m.stage === 1) {
      const hp = hips.translation();
      const moved = (hp.x - m.x1) * fx + (hp.z - m.z1) * fz;
      m.done = m.t - m.t1 > 0.8 || (hy > m.top + 0.15 && moved > 0.4);
    }
    if (m.stage === 1 && m.done) { this.mantle = null; this.jumpCool = 0.2; return; }
    let vt;
    if (m.stage === 0) vt = { x: -fx * 0.15, y: 3.4, z: -fz * 0.15 };
    else {
      const over = hy > m.top - 0.05;
      vt = { x: fx * (over ? 2.4 : 0.1), y: hy < m.top + 0.2 ? 3.2 : 0.4, z: fz * (over ? 2.4 : 0.1) };
    }
    // carry our own weight (the hover spring is off in the air) and steer the velocity
    const k = Math.min(1, DT * 14);
    for (const [b, share] of [[chest, 0.55], [hips, 0.45]]) {
      const bv = b.linvel(), M = this.totalMass * share;
      b.applyImpulse({ x: (vt.x - bv.x) * M * k, y: (vt.y - bv.y) * M * k + M * 9.81 * DT, z: (vt.z - bv.z) * M * k }, true);
    }
  }

  animate(inp, fwdSpeed, limp, seated, mag, amp, hanging) {
    const P = this.parts;
    const set = (n, q, kp, kd, maxT = 1e9, float = true) => { const p = P[n]; p.target.copy(q); p.kp = kp; p.kd = kd; p.maxT = maxT; p.float = float; };
    const sp = Math.abs(fwdSpeed);
    const prevC = Math.cos(this.phase);
    if (this.grounded && !limp && !seated) this.phase += DT * (sp * 2.6 + (mag > 0.1 ? 1.5 : 0));
    else if (this.swimming) this.phase += DT * 5;
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    // a little squash on each footfall
    if (this.grounded && !limp && !seated && sp > 0.8 && Math.sign(c) !== Math.sign(prevC)) this.sqV += 0.5 * amp;
    const camPitch = this.cam ? this.cam.pitch : 0.2;
    const T = this.t;
    const vy = this.hips.linvel().y;
    const getUp = this.getUp >= 0 ? 1 - Math.min(1, this.getUp / (GETUP_T * 0.85)) : 0;

    // head: soft spring so it bobbles; keeps looking ahead as the body leans,
    // and looks up with the camera while reaching
    const reaching = (inp.grabL > 0.3 || inp.grabR > 0.3) && !limp;
    const headPitch = this.swimming ? -0.7 : -this.lean * 0.55 - (reaching ? Math.max(0, 0.35 - camPitch) * 0.6 : 0);
    set('head', qeul(headPitch, 0, -this.roll * 0.4), 300, 15);

    if (seated) {
      set('uLegL', qeul(-1.45, 0, 0.08), 120, 12); set('uLegR', qeul(-1.45, 0, -0.08), 120, 12);
      set('lLegL', qx(1.35), 100, 10); set('lLegR', qx(1.35), 100, 10);
      if (this.seat.kind === 'driver') {
        const st = (this.seat.vehicle?.steer || 0) * 0.5;
        set('uArmL', qeul(-1.15 - st * 0.3, 0, -0.25), 440, 22); set('uArmR', qeul(-1.15 + st * 0.3, 0, 0.25), 440, 22);
        set('lArmL', qeul(-0.35, 0, -0.35), 360, 18); set('lArmR', qeul(-0.35, 0, 0.35), 360, 18);
      } else {
        const up = inp.grabL > 0.5 || inp.grabR > 0.5;
        set('uArmL', up && inp.grabL > 0.5 ? qeul(-2.9, 0, 0.3) : qeul(-0.35, 0, 0.12), 360, 18);
        set('uArmR', up && inp.grabR > 0.5 ? qeul(-2.9, 0, -0.3) : qeul(-0.35, 0, -0.12), 360, 18);
        set('lArmL', qx(-0.4), 280, 14); set('lArmR', qx(-0.4), 280, 14);
      }
      return;
    }

    // legs
    const flail = !this.grounded && !this.swimming && !hanging && !limp;
    const fall = flail ? Math.min(1, Math.max(0, (-vy - 1) / 5)) * Math.min(1, this.airTime / 0.35) : 0;
    if (this.swimming) {
      const k = Math.sin(ph * 2) * 0.45;
      set('uLegL', qx(-0.15 + k), 90, 9); set('uLegR', qx(-0.15 - k), 90, 9);
      set('lLegL', qx(0.3), 70, 7); set('lLegR', qx(0.3), 70, 7);
    } else if (this.mantle) {
      // knees up to clear the edge
      set('uLegL', qx(-1.5), 160, 14); set('uLegR', qx(-1.3), 160, 14);
      set('lLegL', qx(1.7), 140, 12); set('lLegR', qx(1.6), 140, 12);
    } else if (getUp > 0) {
      // crouch and push up from the floor
      const g = getUp;
      set('uLegL', qx(-1.35 * g), 170, 14); set('uLegR', qx(-1.25 * g), 170, 14);
      set('lLegL', qx(1.9 * g + 0.05), 150, 12); set('lLegR', qx(1.8 * g + 0.05), 150, 12);
    } else if (this.grounded) {
      const dip = Math.max(this.landDip, this.reachDown * 0.7);
      set('uLegL', qx(-s * amp * 1.15 - dip * 0.6), 160, 14); set('uLegR', qx(s * amp * 1.15 - dip * 0.6), 160, 14);
      set('lLegL', qx(Math.max(0, c) * amp * 1.25 + 0.05 + dip * 1.1), 130, 12);
      set('lLegR', qx(Math.max(0, -c) * amp * 1.25 + 0.05 + dip * 1.1), 130, 12);
    } else {
      // tucked on the way up, pedalling as we fall
      const f = Math.sin(T * 13) * (0.25 + 0.45 * fall);
      set('uLegL', qx(-0.55 + f), 90, 9); set('uLegR', qx(-0.3 - f), 90, 9);
      set('lLegL', qx(0.9 - f * 0.6), 80, 8); set('lLegR', qx(0.6 + f * 0.6), 80, 8);
    }

    // arms
    const reach = -(Math.PI / 2 + 0.25 - camPitch * 0.9);
    this.reachArm.L = this.reachArm.R = false;
    const stumbling = this.stumble > 0 && !limp;
    for (const h of ['L', 'R']) {
      const sign = h === 'L' ? 1 : -1;
      const grab = (h === 'L' ? inp.grabL : inp.grabR) > 0.3 && !limp;
      const punching = this.punch.t > 0 && this.punch.hand === h && !limp;
      const ph2 = h === 'L' ? 0 : 2.1;
      if (punching) {
        const ext = this.punch.t > 0.12;
        set('uArm' + h, qeul(ext ? -1.55 : -0.9, 0, -sign * 0.45), 1000, 30);
        set('lArm' + h, qx(ext ? -0.05 : -1.2), 800, 26);
      } else if (grab || (this.mantle && this.mantle.stage === 0)) {
        const held = this.hands[h].joint;
        this.reachArm[h] = grab;
        const r = this.mantle ? -0.6 : Math.max(-3.0, reach);
        set('uArm' + h, qeul(r, 0, -sign * 0.12), held ? 660 : 540, 36, 600);
        set('lArm' + h, qx(-0.1), held ? 540 : 420, 30, 500);
      } else if (this.swimming) {
        const a = ph + (h === 'L' ? 0 : Math.PI);
        set('uArm' + h, qeul(-1.6 + Math.sin(a) * 1.1, 0, sign * (0.6 + Math.cos(a) * 0.5)), 480, 20);
        set('lArm' + h, qx(-0.3), 320, 16);
      } else if (getUp > 0.3) {
        // hands push on the floor
        set('uArm' + h, qeul(-0.9, 0, sign * 0.35), 300, 14);
        set('lArm' + h, qx(-0.3), 240, 12);
      } else if (stumbling) {
        // windmill to catch our balance
        const a = T * 15 + ph2;
        set('uArm' + h, qeul(-1.4 + Math.sin(a) * 0.9, 0, sign * (1.0 + Math.cos(a) * 0.4)), 260, 12);
        set('lArm' + h, qx(-0.5), 200, 10);
      } else if (this.grounded) {
        const sw = (h === 'L' ? s : -s) * amp * 0.95;
        const idle = Math.sin(T * 2.1 + ph2) * 0.04;
        set('uArm' + h, qeul(sw, 0, sign * (0.14 + idle + amp * 0.12)), 200, 10, 1e9, false);
        set('lArm' + h, qx(-0.25 - Math.abs(sw) * 0.35), 160, 8, 1e9, false);
      } else {
        // flail: arms up and out, faster and wilder the longer we fall
        const a = T * (10 + 6 * fall) + ph2;
        const f = Math.sin(a) * (0.45 + 0.5 * fall);
        set('uArm' + h, qeul(-0.6 - fall * 1.6 + f, 0, sign * (1.15 + Math.cos(a) * 0.35 * fall)), 240, 12);
        set('lArm' + h, qx(-0.4 - fall * 0.4), 180, 10);
      }
    }
  }

  // Carried things follow the arms. The arm drives are deliberately soft (they
  // only move the limb's own inertia), so on their own they can't lift or
  // swing a crate. Instead the grip point of a held loose object is pulled
  // toward where the posed hand would be, with the reaction on the chest:
  // carrying, lifting and throwing by swinging the arms then just work.
  carryAssist() {
    const chest = this.chest;
    for (const h of ['L', 'R']) {
      const hand = this.hands[h];
      const b = hand.body;
      if (!hand.joint || !b || !b.isDynamic() || hand.owner instanceof Player || !hand.local || b.mass() > CARRY_MAX * 3) continue;
      const share = (this.hands.L.body === b && this.hands.R.body === b) ? 0.5 : 1;
      const m = Math.min(b.mass(), CARRY_MAX) * share;
      // where the posed hand would be: shoulder + arm direction * arm length
      const tgt = this.poseHand(h, _hA);
      // current grip point and its velocity
      toQ(b.rotation(), _qc);
      const gp = _vc.set(hand.local.x, hand.local.y, hand.local.z).applyQuaternion(_qc);
      const bt = b.translation(), bv = b.linvel(), bw = b.angvel();
      const gvx = bv.x + bw.y * gp.z - bw.z * gp.y, gvy = bv.y + bw.z * gp.x - bw.x * gp.z, gvz = bv.z + bw.x * gp.y - bw.y * gp.x;
      gp.x += bt.x; gp.y += bt.y; gp.z += bt.z;
      const cv = chest.linvel();
      let fx = (tgt.x - gp.x) * 110 + (cv.x - gvx) * 16;
      let fy = (tgt.y - gp.y) * 110 + (cv.y - gvy) * 16 + 9.81;
      let fz = (tgt.z - gp.z) * 110 + (cv.z - gvz) * 16;
      const a = Math.hypot(fx, fy, fz), amax = 60;
      if (a > amax) { fx *= amax / a; fy *= amax / a; fz *= amax / a; }
      const imp = { x: fx * m * DT, y: fy * m * DT, z: fz * m * DT };
      b.applyImpulse(imp, true);
      // reaction: the load's weight and swing push on us, but pressing a
      // stuck object down never lifts us off the ground
      chest.applyImpulse({ x: -imp.x, y: Math.min(0, -imp.y), z: -imp.z }, true);
    }
  }

  // Where the posed mitten would be: shoulder + arm direction * arm length.
  poseHand(h, out) {
    const u = this.parts['uArm' + h], chest = this.chest;
    toQ(chest.rotation(), _qa);
    out.copy(u.rest).add(u.anchor).sub(this.parts.chest.rest).applyQuaternion(_qa).add(toV(chest.translation(), _vc));
    _qb.copy(_qa).multiply(u.target);
    return out.add(_vc.set(0, -ARM_LEN, 0).applyQuaternion(_qb));
  }

  // A reaching arm is a light chain hanging off a soft joint drive and
  // whirls about for a second before it settles. Steer the mitten straight
  // to where the pose puts it (reaction on the chest) so grabs land.
  handAssist(h, k) {
    const la = this.parts['lArm' + h].body, chest = this.chest;
    const tgt = this.poseHand(h, _hA);
    const hp = this.handPos(h, _hB);
    const hv = la.linvel(), cv = chest.linvel();
    let fx = (tgt.x - hp.x) * 160 + (cv.x - hv.x) * 18;
    let fy = (tgt.y - hp.y) * 160 + (cv.y - hv.y) * 18;
    let fz = (tgt.z - hp.z) * 160 + (cv.z - hv.z) * 18;
    const a = Math.hypot(fx, fy, fz), amax = 90;
    if (a > amax) { fx *= amax / a; fy *= amax / a; fz *= amax / a; }
    const m = ARM_MASS * k * DT;
    const imp = { x: fx * m, y: fy * m, z: fz * m };
    la.applyImpulseAtPoint(imp, { x: hp.x, y: hp.y, z: hp.z }, true);
    chest.applyImpulse({ x: -imp.x, y: -imp.y, z: -imp.z }, true);
  }

  // Is this upper arm pointing roughly where its drive wants it?
  armReady(h) {
    const u = this.parts['uArm' + h];
    toQ(this.chest.rotation(), _qa).multiply(u.target);
    _va.set(0, -1, 0).applyQuaternion(_qa);
    _vb.set(0, -1, 0).applyQuaternion(toQ(u.body.rotation(), _qb));
    return _va.dot(_vb) > 0.8;
  }

  updateHands(inp) {
    for (const h of ['L', 'R']) {
      const hand = this.hands[h];
      const want = (h === 'L' ? inp.grabL : inp.grabR) > 0.5;
      if (hand.joint && !hand.joint.isValid()) this.releaseHand(h);
      if (hand.joint && !want) this.releaseHand(h, true);
      hand.hold = want ? (hand.hold || 0) + DT : 0;
      // the mitten only closes once the arm is up where it is reaching (or
      // has been pressing on something for a moment), so walking into a
      // wall with the trigger held doesn't grab it at the hip
      if (want && !hand.joint && hand.cool <= 0 && !this.mantle && (hand.hold > 0.4 || this.armReady(h))) {
        const hp = this.handPos(h, new THREE.Vector3());
        // nearest thing within reach of the mitten
        let found = null, bestD = 1e9;
        this.world.intersectionsWithShape({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(GRAB_R),
          (col) => {
            const pr = col.projectPoint({ x: hp.x, y: hp.y, z: hp.z }, false);
            const d = pr ? Math.hypot(pr.point.x - hp.x, pr.point.y - hp.y, pr.point.z - hp.z) : 0;
            if (d < bestD) { bestD = d; found = col; }
            return true;
          }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, this.queryGroups);
        if (found) {
          const tb = found.parent();
          if (!tb) continue;
          // pull the grab point onto the surface
          const proj = found.projectPoint({ x: hp.x, y: hp.y, z: hp.z }, false);
          const gp = proj ? proj.point : hp;
          toQ(tb.rotation(), _qa).invert();
          const t = tb.translation();
          _vb.set(gp.x - t.x, gp.y - t.y, gp.z - t.z).applyQuaternion(_qa);
          const data = RAPIER.JointData.spherical({ x: 0, y: HAND_OFF, z: 0 }, { x: _vb.x, y: _vb.y, z: _vb.z });
          hand.joint = this.world.createImpulseJoint(data, this.parts['lArm' + h].body, tb, true);
          hand.joint.setContactsEnabled(false);
          hand.body = tb;
          hand.owner = this.physics.handleOwner.get(found.handle) || null;
          hand.local = { x: _vb.x, y: _vb.y, z: _vb.z };
          this.game.audio?.play('grab', hp);
        }
      }
    }
  }

  punchHit() {
    const h = this.punch.hand;
    const hp = this.handPos(h, new THREE.Vector3());
    hp.x += Math.sin(this.yaw) * 0.12; hp.z += Math.cos(this.yaw) * 0.12;
    let hit = null;
    this.world.intersectionsWithShape({ x: hp.x, y: hp.y, z: hp.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(HAND_R * 2.4),
      (col) => { hit = col; return false; }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_FIXED, this.queryGroups);
    if (!hit) return;
    this.punch.hit = true;
    const owner = this.physics.handleOwner.get(hit.handle);
    const dir = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const body = hit.parent();
    if (owner && owner instanceof Player) {
      if (owner.state !== 'seated') {
        for (const b of owner.bodies) b.applyImpulse({ x: dir.x * 4 * b.mass(), y: 2.2 * b.mass(), z: dir.z * 4 * b.mass() }, true);
        owner.knockOut(1.4);
        owner.impactGrace = 0.2;
      }
    } else if (body && body.isDynamic()) {
      const m = Math.min(body.mass(), 80);
      body.applyImpulseAtPoint({ x: dir.x * m * 4, y: m * 1.5, z: dir.z * m * 4 }, hp, true);
    }
    this.game.audio?.play('punch', hp);
  }

  respawn() {
    if (this.seat) this.leaveSeat();
    this.releaseAll();
    this.mantle = null;
    this.wake(false);
    this.recover = 1;
    const sp = this.game.spawnPoint(this.index);
    this.teleport(sp.x, sp.y, sp.z, sp.yaw);
  }

  sync() {
    for (const n in this.parts) { const p = this.parts[n]; this.physics.pose(p.rec, p.mesh); }
    // squash & stretch the torso about the shoulders so the neck stays covered
    const q = this.sq, m = this.parts.chest.mesh.children[0];
    if (m) { m.scale.set(1 + q * 0.5, 1 - q, 1 + q * 0.5); m.position.y = 0.22 * S * q; }
    const hm = this.parts.hips.mesh.children[0];
    if (hm) hm.scale.set(1 + q * 0.3, 1 - q * 0.5, 1 + q * 0.3);
  }
  // Interpolated chest position (for cameras and tags).
  viewPos(out, part = 'chest') { return this.physics.ipos(this.parts[part].rec, out); }

  destroy() {
    if (this.seat) this.leaveSeat();
    this.releaseAll();
    for (const n in this.parts) {
      const p = this.parts[n];
      for (const c of p.cols) this.physics.handleOwner.delete(c.handle);
      this.physics.untrack(p.rec);
      this.world.removeRigidBody(p.body);
    }
    this.game.scene.remove(this.group);
  }
}
