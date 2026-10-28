// Grabbable animals. Animals are scenery (critters.js: posed maths, no physics), so the few
// near a player borrow a body from a small pool: a kinematic capsule that follows the posed
// animal, in a group players walk through but their hands still find (player.updateHands
// grabs any collider in reach). A grab turns it into a real dynamic body of the animal's
// weight, so holding one is a tug of war like grabbing another wobbler:
// - with its feet on the ground (or swimming) it pulls away from whoever holds it, toward
//   SPECS.run m/s, with a force capped at its weight x traction (SPECS.mu) x its effort of the
//   moment (it heaves and eases: `effort`); the holder pulls back with their own legs. So a
//   monkey or hog is dragged about (and lifted: off the ground it can only kick), a leopard is a
//   fair fight, a tapir or tiger drags one wobbler but slows down if two hold on;
// - small ones (SPECS.pick) tumble freely (carried, punch-thrown: common.js throwHeld); the
//   rest only turn about the vertical so they stay on their feet;
// - let go, it runs on a moment (`loose`), then once it has stopped it gets up and walks back to
//   its way (`return`, animals.js) and is free again.
// Use: const g = animalGrab(game, SPECS); per frame g.drive(a, t, dt, sp) before posing an
// animal (true = it drew it), then g.update(posed, t, dt) after all are posed
// (a.pose = [x, y, z, yaw] of each posed this frame).
import * as THREE from 'three';
import { RAPIER, yawQuat } from '../physics.js';
import { groups, G_PROP, G_STATIC, G_VEH } from '../config.js';

const GRAB_GROUPS = groups(G_PROP, G_STATIC | G_PROP | G_VEH); // not players: walked through, still grabbed
const DT = 1 / 60;
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3();

export function animalGrab(game, SPECS, { pool = 8, near = 7, onGrab } = {}) {
  const W = game.physics.world;
  const slots = [];
  for (let i = 0; i < pool; i++) {
    const body = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, i * 3));
    slots.push({ body, col: null, a: null, owner: { kind: 'animal', animal: null } });
  }
  const heldBy = (body) => {
    for (const p of game.players) for (const h of ['L', 'R']) if (p.hands[h].body === body) return p;
    return null;
  };
  // the drawn feet sit this far above the body origin once physics has it (the capsule rests
  // on the ground: its centre is SPECS.y above the feet when posed, r above the ground when lying)
  const footUp = (sp) => sp.y - sp.r;
  function attach(s, a) {
    const sp = SPECS[a.kind];
    if (s.col) { game.physics.handleOwner.delete(s.col.handle); W.removeCollider(s.col, false); }
    // a capsule along the body (Rapier's capsules stand along y: laid along z)
    const desc = RAPIER.ColliderDesc.capsule(sp.len, sp.r).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
      .setTranslation(0, sp.y, sp.z || 0).setMass(sp.kg).setFriction(0.8).setCollisionGroups(GRAB_GROUPS);
    s.col = W.createCollider(desc, s.body);
    s.owner.animal = a; game.physics.handleOwner.set(s.col.handle, s.owner);
    s.a = a; a.g = { st: 'free', slot: s, seed: Math.random() * 100 };
  }
  function toKinematic(s) {
    s.col?.setFriction(0.8);
    s.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    s.body.setEnabledRotations(true, true, true, true);
  }
  function detach(s) {
    if (s.col) { game.physics.handleOwner.delete(s.col.handle); W.removeCollider(s.col, false); s.col = null; }
    if (s.body.isDynamic()) toKinematic(s);
    s.body.setTranslation({ x: 0, y: -500, z: 0 }, false);
    if (s.a) s.a.g = null;
    s.a = null; s.owner.animal = null;
  }
  function grabbed(s, a, p, t) {
    const sp = SPECS[a.kind], g = a.g, b = s.body;
    const [x, y, z, yaw] = a.pose || [a.x, 0, a.z, 0];
    b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    // it walks, it doesn't slide: its legs (the pull below) are its grip on the ground; a
    // capsule's own friction (0.8 x its weight) would out-pull any animal
    s.col.setFriction(sp.pick ? 0.4 : 0.05);
    b.setTranslation({ x, y: y - footUp(sp) + 0.02, z }, true);
    b.setRotation(yawQuat(yaw), true);
    if (!sp.pick) b.setEnabledRotations(false, true, false, true);   // stays on its feet
    b.setAngularDamping(sp.pick ? 3 : 6); b.setLinearDamping(0.2);
    // carry on at the speed it was walking
    b.setLinvel({ x: g.vx || 0, y: 0, z: g.vz || 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    g.st = 'held'; g.ph = 0; g.still = 0;
    // pull away from the grabber, mostly the way it was facing
    const c = p.chest.translation();
    let dx = x - c.x, dz = z - c.z; const d = Math.hypot(dx, dz) || 1;
    dx = dx / d + Math.sin(yaw) * 0.8; dz = dz / d + Math.cos(yaw) * 0.8;
    const l = Math.hypot(dx, dz) || 1; g.dx = dx / l; g.dz = dz / l;
    onGrab?.(a, p, sp.pick ? 'pick' : 'pull');
  }

  // per physics step: the animal's own pull (and buoyancy) while physics has it
  game.steppers.push(() => {
    const t = game.time;
    for (const s of slots) {
      const a = s.a, g = a?.g;
      if (!g || (g.st !== 'held' && g.st !== 'loose')) continue;
      const sp = SPECS[a.kind], b = s.body, tr = b.translation(), v = b.linvel(), m = sp.kg;
      // water: float the body, and swim instead of walk
      const wl = game.physics.waterLevel(tr.x, tr.y, tr.z);
      const mid = tr.y + sp.y;
      const wet = wl != null && mid < wl + 0.1;
      if (wet) b.applyImpulse({ x: 0, y: m * (9.81 * Math.min(1.6, 1 + (wl - mid) * 1.5) - v.y * 2) * DT, z: 0 }, true);
      const gh = game.groundHeight(tr.x, tr.z, tr.y + 1);
      const r = b.rotation(), upY = 1 - 2 * (r.x * r.x + r.z * r.z);
      const footing = wet || (tr.y + footUp(sp) - gh < 0.3 && upY > 0.6);
      g.footing = footing;
      if (!footing) continue;                    // lifted / tumbling: only kicks
      // which way: picked at the grab (away from the grabber, `grabbed`), wandering slowly
      // (the holder stands right beside it: re-aiming away from them every step only spins it)
      const turn = Math.sin(t * 0.9 + g.seed * 7) * 0.6 * DT, cs = Math.cos(turn), sn = Math.sin(turn);
      [g.dx, g.dz] = [g.dx * cs + g.dz * sn, g.dz * cs - g.dx * sn];
      // effort: heaves and eases (two slow waves), harder in the first seconds of a fright
      const fresh = g.st === 'loose' ? 1 : Math.max(0.75, 1 - (t - g.t0) * 0.03);
      const effort = (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.3 + g.seed)) * (0.7 + 0.3 * Math.sin(t * 0.7 + g.seed * 3))) * fresh;
      g.effort = effort;
      const run = g.st === 'loose' && t > g.until ? 0 : (sp.run || 3) * (wet ? 0.5 : 1);   // done running: plants its feet
      const ix = g.dx * run - v.x, iz = g.dz * run - v.z;
      const cap = m * 9.81 * (sp.mu ?? 0.9) * effort * (wet ? 0.5 : 1) * DT;
      let jx = ix * m, jz = iz * m; const jl = Math.hypot(jx, jz);
      if (jl > cap) { jx *= cap / jl; jz *= cap / jl; }
      b.applyImpulse({ x: jx, y: 0, z: jz }, true);
      // turn to face where it's going
      if (!sp.pick || upY > 0.9) {
        const hs = Math.hypot(v.x, v.z), want = hs > 0.6 ? Math.atan2(v.x, v.z) : Math.atan2(g.dx, g.dz);
        _q.set(r.x, r.y, r.z, r.w); _e.setFromQuaternion(_q, 'YXZ');
        let dy = want - _e.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const av = b.angvel();
        b.setAngvel({ x: av.x, y: Math.max(-4, Math.min(4, dy * 6)), z: av.z }, true);
      }
    }
  });

  // Draw an animal physics has (held or running off) (true = drawn).
  function drive(a, t, dt, sp) {
    const g = a.g;
    if (!g || (g.st !== 'held' && g.st !== 'loose')) return false;
    const spec = SPECS[a.kind], b = g.slot.body, tr = b.translation(), rot = b.rotation(), v = b.linvel();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _e.setFromQuaternion(_q, 'YXZ');
    _v.set(0, footUp(spec), 0).applyQuaternion(_q);           // feet: below the capsule
    const x = tr.x + _v.x, y = tr.y + _v.y, z = tr.z + _v.z;
    const hs = Math.hypot(v.x, v.z);
    g.ph += dt * (g.footing ? 1.5 + hs * 3 : 12);             // legs run with the ground covered, flail when lifted
    const amp = g.footing ? Math.min(1.3, 0.25 + hs / 2.5) : 1;
    sp.put(x, y, z, _e.y, -_e.x, _e.z, a.s, g.ph, amp);
    a.x = x; a.z = z; g.x = x; g.z = z; g.yaw = _e.y;
    return true;
  }

  function update(posed, t, dt = 1 / 60) {
    // 1. slots: keep the busy ones, free those whose animal went out of reach / wasn't drawn
    for (const s of slots) {
      const a = s.a;
      if (!a) continue;
      if (a.g.st !== 'free') continue;
      let keep = posed.has(a);
      if (keep) { keep = false; for (const p of game.players) { const c = p.chest.translation(); if ((c.x - a.x) ** 2 + (c.z - a.z) ** 2 < (near + 2) ** 2) { keep = true; break; } } }
      if (!keep) detach(s);
    }
    // 2. hand free slots to the nearest free animals within reach of a player
    let free = slots.filter((s) => !s.a);
    if (free.length) {
      const cand = [];
      for (const a of posed) {
        if (a.g || !SPECS[a.kind]) continue;
        let d = 1e9;
        for (const p of game.players) { const c = p.chest.translation(); d = Math.min(d, (c.x - a.x) ** 2 + (c.z - a.z) ** 2); }
        if (d < near * near) cand.push([d, a]);
      }
      cand.sort((u, v) => u[0] - v[0]);
      for (const [, a] of cand) { const s = free.pop(); if (!s) break; attach(s, a); }
    }
    // 3. per state
    for (const s of slots) {
      const a = s.a;
      if (!a) continue;
      const g = a.g, p = heldBy(s.body);
      if (g.st === 'free' || g.st === 'return') {
        const [x, y, z, yaw] = a.pose || [a.x, 0, a.z, 0];
        if (g.px != null && dt > 0) { g.vx = (x - g.px) / dt; g.vz = (z - g.pz) / dt; }
        g.px = x; g.pz = z; g.yaw = yaw;
        if (p) { g.by = p; g.t0 = t; grabbed(s, a, p, t); continue; }
        // follow the drawn animal
        s.body.setNextKinematicTranslation({ x, y, z });
        s.body.setNextKinematicRotation(yawQuat(yaw));
        continue;
      }
      // held / loose: physics has it
      if (p) { g.st = 'held'; g.by = p; continue; }
      if (g.st === 'held') { g.st = 'loose'; g.until = t + (SPECS[a.kind].pick ? 1.2 : 2.5); g.tl = t; g.still = 0; }
      const v = s.body.linvel();
      g.still = Math.hypot(v.x, v.y, v.z) < 0.7 ? (g.still || 0) + dt : 0;
      if (t > g.until && (g.still > 0.5 || t - g.tl > 7)) {   // stopped: back on its feet, walking home
        toKinematic(s);
        g.st = 'return'; g.by = null; g.px = null;
      }
    }
  }
  return { drive, update, slots };
}
