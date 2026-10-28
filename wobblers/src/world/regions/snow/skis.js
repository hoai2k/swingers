// Skis: take a pair from a ski rack (Y at the top lift station or in the
// village) and the player skis properly on snow (slopes.js reads p.skis for
// the faster ski feel; powder on the open mountain counts too). They come off
// whenever the player goes ragdoll (a crash / knock-out, or flopping on purpose)
// and lie there as two loose props for LOOSE_T s: Y next to them puts them back
// on (a use spot riding on the left ski). Trying to walk on anything that isn't
// snow for ~1 s dissolves them away (shrink and fade). They are put away
// quietly on respawn, in a vehicle, outside Frostpeak or when the player leaves.
//
// Player hooks (player.js, all `this.skis?.…` / `this.skiMesh?.…`): skiMesh in
// partMesh (the ski meshes hang on the shin groups, so rebuildMeshes keeps
// them), skis.step after the pose (surface, stance, coming off), skis.dip in
// the hover height (knees bent), skis.slick (powder counts as slippery),
// skis.off in knockOut / respawn / destroy, skis.sync after the part poses
// (the skis lie flat on the snow).
import * as THREE from 'three';
import { RAPIER } from '../../../physics.js';
import { DT } from '../../../config.js';
import { Builder, matVC } from '../../../mesh.js';
import { meshHeight, regionAt } from '../../../terrain.js';
import { LIFT, TOP } from './layout.js';
import { snowSurfaces } from './slopes.js';
import { addSeat } from '../../playground.js';

const FOOT_Y = -0.125, FOOT_Z = 0.035; // under the shoe, in the shin's frame
const WALK_OFF = 1.0;                  // s of walking on non-snow before they come off
const LOOSE_T = 25, LOOSE_MAX = 8;     // dropped skis lie about this long; at most this many pairs

// ---- the look ---------------------------------------------------------------
let _geo = null;
export function skiGeometry() {
  if (_geo) return _geo;
  const b = new Builder();
  b.rbox(0.095, 0.025, 1.25, 0.01, 0xe8322b, [0, -0.0125, 0.05]);                 // the ski, binding at the origin
  b.box(0.04, 0.004, 1.1, 0xffd23f, [0, 0.0015, 0.05]);                          // stripe
  b.rbox(0.095, 0.022, 0.2, 0.01, 0xe8322b, [0, 0.031, 0.765], [-0.45, 0, 0]);    // turned-up tip
  b.rbox(0.095, 0.022, 0.12, 0.01, 0xe8322b, [0, 0.006, -0.62], [0.3, 0, 0]);     // tail
  b.rbox(0.11, 0.05, 0.22, 0.015, 0x2a2a33, [0, 0.025, 0]);                      // binding
  b.box(0.115, 0.03, 0.05, 0xb0b6c0, [0, 0.055, -0.1]);                           // heel clip
  _geo = b.geometry();
  return _geo;
}

// Static rack: two posts, a bar and a row of skis leaning on it (kit scenery).
export function skiRack(kit, x, z, y, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
  for (const lx of [-1.5, 1.5]) { const [px, pz] = at(lx, 0); kit.box(px, y + 0.55, pz, 0.12, 1.1, 0.12, 0x6a4a32, { yaw }); }
  kit.box(x, y + 0.6, z, 3.2, 0.08, 0.3, 0x7a5032, { yaw, collide: false });
  kit.box(x, y + 1.05, z, 3.2, 0.06, 0.06, 0x7a5032, { yaw, collide: false });
  const cols = [0xe8322b, 0x3f8cff, 0xffd23f];
  for (let i = 0; i < 6; i++) {
    const [px, pz] = at(-1.25 + i * 0.5, 0.05);
    kit.box(px, y + 0.85, pz, 0.09, 1.7, 0.03, cols[i % 3], { yaw, collide: false, euler: [0.15, yaw, 0] });
  }
}

// ---- per player ---------------------------------------------------------------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _e = new THREE.Euler();
const _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _sd = new THREE.Vector3(), _v = new THREE.Vector3();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const nearStation = (x, z) => Math.abs(x - LIFT.x) < LIFT.gap + 5 && (Math.abs(z - LIFT.zb) < 14 || Math.abs(z - LIFT.zt) < 14);

let G = null;

const API = {
  // Called by Player.step after the pose: what we stand on, the skiing stance,
  // and coming off on hard ground.
  step(p, inp) {
    const sk = this;
    sk.slick = false; sk.dip = 0; sk.ploughing = false; sk.stopping = false; sk.lean = 0; sk.camYaw = null;
    if (p.state === 'limp') { offSkis(p, 'flop'); return; } // any ragdoll (a flop, a fall): they come off
    if (p.state !== 'normal' || p.mantle) { sk.walkT = 0; sk.kind = null; sk.air = false; return; }
    const near = p.groundCollider && p.groundDist <= 1.0;
    let kind = near ? snowSurfaces.get(p.groundCollider.handle) || null : null;
    if (!kind && p.grounded) {
      const gp = p.groundPoint, h = meshHeight(gp.x, gp.z);
      kind = nearStation(gp.x, gp.z) ? 'deck' // the lift platforms count as snow (boarding with skis on)
        : h > 2.2 && Math.abs(gp.y - h) < 0.35 ? 'powder' : 'hard';
    }
    if (p.swimming) kind = 'water';
    if (kind && kind !== 'hard' && kind !== 'water') sk.air = kind !== 'deck';
    else if (p.grounded || p.swimming) sk.air = false;
    sk.kind = kind;
    const v = p.hips.linvel(), s = Math.hypot(v.x, v.z);
    const cy = p.cam ? p.cam.yaw : p.yaw, mx = inp.moveX || 0, my = inp.moveY || 0, mag = Math.min(1, Math.hypot(mx, my));
    const wx = Math.sin(cy) * my - Math.cos(cy) * mx, wz = Math.cos(cy) * my + Math.sin(cy) * mx;

    // trying to walk on something that isn't snow: they come off
    if (kind === 'hard' || kind === 'water') { if (mag > 0.2 || s > 1) sk.walkT += DT; }
    else sk.walkT = Math.max(0, sk.walkT - DT * 2);
    if (sk.walkT > WALK_OFF) { offSkis(p, 'walk'); return; }

    const snow = kind === 'piste' || kind === 'jump' || kind === 'ice' || kind === 'powder';
    // powder (the open mountain) is slippery on skis, except stepping slowly uphill
    let climbing = false;
    if (kind === 'powder') {
      const n = p.groundNormal, nh = Math.hypot(n.x, n.z);
      climbing = mag > 0.2 && nh > 0.06 && (wx * n.x + wz * n.z) / (mag * nh) < -0.3 && s < 4;
      sk.slick = !climbing;
    }
    // Technique. The skis point along the run (no turning round while moving). Pulling back brakes:
    // slow, a snow plough (wedge: tips in, tails out); faster, a hockey stop (the skis swing round
    // to a sideways stance and skid to a halt). Turns: stem christies at low speed (the outside
    // ski stems out as each turn starts, then comes parallel), parallel turns as it speeds up,
    // carving on the edges at speed (skis tipped onto the inside edge, the body leaning in).
    let edge = 0; // tilt toward the inside of the turn (+ = toward increasing yaw)
    if (snow && s > 1.5) {
      const head = Math.atan2(v.x, v.z);
      const back = mag > 0.2 && (v.x * wx + v.z * wz) / (s * mag) < -0.35;
      let ds = mag > 0.2 ? Math.atan2(wx, wz) - head : 0; ds = Math.atan2(Math.sin(ds), Math.cos(ds)); // stick vs travel
      sk.stopping = back && (s > 6 || !!sk.stopSide); // fast: hockey stop (kept to a standstill once begun)
      sk.ploughing = back && !sk.stopping;       // slow: snow plough
      let d = p.yaw - head; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (sk.stopping) {
        if (!sk.stopSide) sk.stopSide = Math.abs(ds) > 2.9 ? (sk.lastTurn || 1) : Math.sign(ds) || 1;
        const want = head + sk.stopSide * 1.45;  // skis across the travel, turned the way of the stick
        let e = want - p.yaw; e = Math.atan2(Math.sin(e), Math.cos(e));
        p.yaw += Math.sign(e) * Math.min(Math.abs(e), 7 * DT);
        edge = sk.stopSide * 0.55;               // dig the uphill edges in (leaning away from the skid)
      } else {
        sk.stopSide = 0;
        const lim = sk.ploughing ? 0.25 : 1.25;
        if (Math.abs(d) > lim) { p.yaw = head + Math.sign(d) * lim; d = Math.sign(d) * lim; }
        // turning: a new turn starts when the stick swings to the other side
        const tdir = Math.abs(d) > 0.12 ? Math.sign(d) : 0;
        if (tdir && tdir !== sk.lastTurn) { sk.lastTurn = tdir; sk.turnT = 0; }
        sk.turnT = (sk.turnT || 0) + DT;
        const carve = smooth(10, 17, s), christie = 1 - smooth(5, 10, s);
        edge = Math.max(-0.75, Math.min(0.75, d * (0.35 + 0.75 * carve)));
        // the stem: outside ski's tail out at the start of a turn, slow turns only
        sk.stem = christie * Math.min(1, Math.abs(d) * 2.5) * Math.max(0, 1 - sk.turnT / 0.55) * (sk.lastTurn || 0);
      }
      sk.camYaw = head;                          // camera.js follows the run, not the body
    } else { sk.stopSide = 0; if (!snow && sk.air && !p.grounded && s > 3) sk.camYaw = Math.atan2(v.x, v.z); }
    if (!sk.stopping && !(snow && s > 1.5)) sk.stem = 0;
    sk.edge += (edge - sk.edge) * Math.min(1, DT * 6);
    sk.lean = -sk.edge * 0.75;                   // player.js adds it to the body's bank (its turn lean is -yawRate)
    sk.plough += ((sk.ploughing ? 1 : 0) - sk.plough) * Math.min(1, DT * 8);
    sk.stemK += ((sk.stem || 0) - sk.stemK) * Math.min(1, DT * 10);
    sk.side += ((sk.stopping ? 1 : 0) - sk.side) * Math.min(1, DT * 6);

    // stance: knees bent, lower in a tuck at speed; a tuck in the air
    const flying = !p.grounded && sk.air && !p.swimming;
    if ((snow && !climbing) || flying) {
      const tuck = flying ? 1 : smooth(9, 20, s) * (1 - sk.plough) * (1 - sk.side);
      const ux = -0.5 - 0.32 * tuck, lx = 0.8 + 0.45 * tuck, spread = 0.05 + 0.1 * sk.plough;
      const P = p.parts;
      P.uLegL.target.setFromEuler(_e.set(ux, 0, spread)); P.uLegR.target.setFromEuler(_e.set(ux, 0, -spread));
      P.lLegL.target.setFromEuler(_e.set(lx, 0, 0)); P.lLegR.target.setFromEuler(_e.set(lx, 0, 0));
      if (p.grounded) sk.dip = 0.035 + 0.04 * tuck;
    }
  },

  // After the part poses (Player.sync): on the ground the skis lie flat on it,
  // pointing the way the player faces (toes in for the snow plough); in the
  // air or seated they follow the feet.
  sync(p) {
    const sk = this;
    const ground = p.state === 'normal' && p.groundDist < 0.9 && !p.swimming;
    if (ground) {
      _up.copy(p.groundNormal);
      if (_up.y < 0.5) _up.set(0, 1, 0);
    }
    for (const side of ['L', 'R']) {
      const m = sk.meshes[side];
      if (!m || !m.parent) continue;
      const gq = m.parent.quaternion;
      if (ground) {
        // wedge: both tips in; stem christie: the outside ski (right in a left turn) tips in
        const sg = side === 'L' ? -1 : 1, outside = sk.stemK * sg > 0;
        const toe = sk.plough * 0.32 * sg + (outside ? sk.stemK * 0.3 : 0), yaw = p.yaw + toe;
        _fw.set(Math.sin(yaw), 0, Math.cos(yaw));
        _fw.addScaledVector(_up, -_fw.dot(_up)).normalize();
        _sd.crossVectors(_up, _fw);
        _q.setFromRotationMatrix(_m4.makeBasis(_sd, _up, _fw));
        // on edge: tipped over about the ski's length (into the turn; the uphill edge in a stop)
        if (Math.abs(sk.edge) > 0.01) _q.premultiply(_q2.setFromAxisAngle(_fw, -sk.edge)); // (+ about the nose tips the top toward -yaw)
        _q2.copy(gq).invert().multiply(_q); // in the shin's frame
      } else _q2.identity();
      m.quaternion.slerp(_q2, sk.snap ? 1 : 0.45);
    }
    sk.snap = false;
  },

  off(p, why) { offSkis(p, why); },
};

export function equipSkis(p) {
  if (p.skis || p.seat) return false;
  const sk = Object.create(API);
  Object.assign(sk, { walkT: 0, slick: false, dip: 0, kind: null, air: false, plough: 0, ploughing: false, meshes: {}, snap: true,
    stopping: false, stopSide: 0, side: 0, edge: 0, lean: 0, stem: 0, stemK: 0, lastTurn: 0, turnT: 0, camYaw: null });
  p.skis = sk;
  p.skiMesh = (n, g) => {
    if (n !== 'lLegL' && n !== 'lLegR') return;
    const m = new THREE.Mesh(skiGeometry(), matVC);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(0, FOOT_Y, FOOT_Z);
    g.add(m);
    sk.meshes[n[4]] = m;
    sk.snap = true;
  };
  p.skiMesh('lLegL', p.parts.lLegL.mesh); p.skiMesh('lLegR', p.parts.lLegR.mesh);
  G?.audio?.play('clunk', p.pos(), 1);
  return true;
}

// why: 'crash' (knocked out: flung) | 'flop' (any other ragdoll) drop them as a loose pair you can
// put back on; 'walk' (off the snow) dissolves them; 'rack' | 'quiet' | ... put them away.
export function offSkis(p, why = 'quiet') {
  const sk = p.skis;
  if (!sk) return;
  p.skis = null; p.skiMesh = null;
  const drop = why === 'crash' || why === 'flop', pair = [];
  for (const side of ['L', 'R']) {
    const m = sk.meshes[side];
    if (!m) continue;
    if ((drop || why === 'walk') && G) { // from the shin's body (the meshes are only posed when a frame is drawn)
      const b = p.parts['lLeg' + side].body, t = b.translation(), r = b.rotation();
      _q.set(r.x, r.y, r.z, r.w).multiply(m.quaternion);
      _v.set(0, FOOT_Y, FOOT_Z).applyQuaternion(_q2.set(r.x, r.y, r.z, r.w)).add(_up.set(t.x, t.y, t.z));
      if (drop) pair.push(looseSki(p, _v, _q, side, why === 'crash'));
      else dissolve(_v, _q);
    }
    m.parent?.remove(m);
  }
  if (!G) return;
  if (pair.length) pairUp(pair);
  const who = G.players.length > 1 ? `P${p.index + 1}: ` : '';
  if (why === 'crash') { G.ui?.toast(`${who}Wipeout! Your skis flew off: Y next to them puts them back on`, p.color); G.audio?.play('thud', p.pos(), 0.8); }
  else if (why === 'flop') G.ui?.toast(`${who}Skis off: Y next to them puts them back on`, p.color);
  else if (why === 'walk') { G.ui?.toast(`${who}Your skis melted away: they only work on snow`, p.color); G.audio?.play('puff', p.pos(), 0.8); }
  else if (why === 'region') G.ui?.toast(`${who}You left your skis on Frostpeak`, p.color);
}

// A dropped pair: Y next to them puts them back on (a use spot riding on one ski, while both last).
function pairUp(pair) {
  const seat = addSeat(G, { body: pair[0].body, pos: [0, 0.25, 0], label: 'Put skis on', kind: 'use', use: (p) => {
    if (p.skis || p.seat) return;
    for (const o of pair) if (!o.gone) removeLoose(o);
    equipSkis(p);
  } });
  for (const o of pair) { o.pair = pair; o.seat = seat; }
}

// Walking off the snow: the skis shrink and fade away where they are.
const fading = [];
function dissolve(pos, rot) {
  const mat = matVC.clone(); mat.transparent = true; mat.depthWrite = false;
  const m = new THREE.Mesh(skiGeometry(), mat);
  m.position.copy(pos); m.quaternion.copy(rot); m.userData.noCull = true;
  G.scene.add(m);
  fading.push({ m, t: 0 });
}

// A dropped ski: a loose prop (grab it, throw it) that goes after LOOSE_T s.
const loose = [];
let steps = 0; // physics steps (the dropped skis' clock)
function looseSki(p, pos, rot, side, fling) {
  const ph = G.physics, mesh = new THREE.Mesh(skiGeometry(), matVC);
  mesh.castShadow = true; mesh.receiveShadow = true;
  G.scene.add(mesh);
  // a little up off the ground so it never starts inside it
  const gy = meshHeight(pos.x, pos.z);
  const y = Math.max(pos.y, gy + 0.08) + 0.06;
  const desc = RAPIER.ColliderDesc.cuboid(0.05, 0.02, 0.66).setTranslation(0, -0.0125, 0.06).setMass(1.6).setFriction(1.1); // grippy: they stay about where they fell, to be put back on
  const o = ph.dynamic({ x: pos.x, y, z: pos.z }, desc, mesh, { rot: { x: rot.x, y: rot.y, z: rot.z, w: rot.w }, kind: 'skis', buoy: { r: 0.12, volume: 0.004 } });
  const v = p.hips.linvel(), k = fling ? 0.75 : 0.2, sgn = side === 'L' ? 1 : -1;
  o.body.setLinvel({ x: v.x * k + Math.cos(p.yaw) * sgn * (fling ? 1.5 : 0.4), y: fling ? 3 + Math.random() * 2 : 0.6, z: v.z * k - Math.sin(p.yaw) * sgn * (fling ? 1.5 : 0.4) }, true);
  if (fling) o.body.setAngvel({ x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 10 }, true);
  o.body.setLinearDamping(0.8); o.body.setAngularDamping(1.5);
  o.t = steps; o.ski = true;
  loose.push(o);
  while (loose.length > LOOSE_MAX * 2) removeLoose(loose[0]);
  return o;
}
function removeLoose(o) {
  if (o.gone) return;
  o.gone = true;
  const ph = G.physics, i = loose.indexOf(o);
  if (i >= 0) loose.splice(i, 1);
  if (o.seat) { const k = G.seats.indexOf(o.seat); if (k >= 0) G.seats.splice(k, 1); o.seat.disabled = true; } // the pair's 'Put skis on' spot
  for (const q of o.pair || []) if (q !== o) { q.seat = null; removeLoose(q); }        // a pair goes together
  for (const pl of G.players) for (const h of ['L', 'R']) if (pl.hands?.[h]?.body === o.body) pl.releaseHand?.(h);
  if (o.rec) ph.untrack(o.rec);
  const j = ph.objects.indexOf(o); if (j >= 0) ph.objects.splice(j, 1);
  for (const c of o.colliders) ph.handleOwner.delete(c.handle);
  ph.world.removeRigidBody(o.body);
  G.scene.remove(o.mesh);
}
const heldBy = (o) => G.players.some((pl) => pl.hands?.L?.body === o.body || pl.hands?.R?.body === o.body);

// ---- racks + housekeeping -------------------------------------------------------
export function buildSkis(game, kit, R) {
  G = game;
  const racks = [];
  const rack = (x, z, yaw = 0) => {
    const y = R.groundAt(x, z);
    skiRack(kit, x, z, y, yaw);
    // the use spot in front of the rack (local +z)
    const sx = x + Math.sin(yaw) * 0.9, sz = z + Math.cos(yaw) * 0.9;
    const seat = R.common.useSpot(game, sx, y + 0.9, sz, 'Take skis', (p) => {
      if (p.skis) { offSkis(p, 'rack'); game.audio?.play('clunk', p.pos(), 0.8); } else equipSkis(p);
    });
    seat.labelFor = (p) => (p.skis ? 'Return skis' : 'Take skis');
    racks.push({ x, z, y, yaw, seat });
  };
  rack(TOP.x1 - 3, TOP.z1 - 10, 0);  // top of the lift, by the start of the blue run
  rack(20, -846, 0);          // bottom of the blue run (village)
  rack(-14, -808, 0);         // by the ski lodge

  // put skis away in a vehicle / outside Frostpeak; tidy up dropped ones
  game.steppers.push(() => {
    steps++;
    for (const p of game.players) {
      if (!p.skis) continue;
      if (p.seat?.vehicle) offSkis(p, 'vehicle');
      else { const c = p.chest.translation(); if (regionAt(c.x, c.z)?.id !== 'snow') offSkis(p, 'region'); }
    }
    if (steps % 30 || !loose.length) return;
    for (const o of loose.slice()) if ((steps - o.t) * DT > LOOSE_T && !heldBy(o)) removeLoose(o);
  });
  // skis dissolving away off the snow
  game.updaters.push((dt) => {
    for (let i = fading.length - 1; i >= 0; i--) {
      const f = fading[i]; f.t += dt;
      const k = Math.min(1, f.t / 0.7);
      f.m.scale.set(1 - k * 0.6, 1 - k * 0.8, 1 - k);
      f.m.position.y += dt * 0.3;
      f.m.material.opacity = 1 - k;
      if (k >= 1) { game.scene.remove(f.m); f.m.material.dispose(); fading.splice(i, 1); }
    }
  });
  game.skis = { racks, equip: equipSkis, off: offSkis, loose };
}
