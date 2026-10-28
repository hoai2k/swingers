// Grabbable animals. Animals are scenery (critters.js: posed maths, no physics), so the few
// near a player borrow a body from a small pool: a kinematic capsule that follows the posed
// animal, in a group players walk through but their hands still find (player.updateHands
// grabs any collider in reach). What a grab does depends on the animal's size (SPECS.pick):
// - small ones (monkeys, hogs, capybaras) are picked up: the body turns dynamic, the animal
//   is drawn where the body is (legs going), it can be carried and punch-thrown like any loose
//   thing (common.js throwHeld), and once let go and settled it gets up and walks back;
// - big ones (tigers, leopards, tapirs, crocs, snakes) bolt: they run on along their way while
//   held (and a moment after), dragging whoever hangs on (a kinematic body: player.rideCarry).
// Use: const g = animalGrab(game, SPECS); per frame g.drive(a, t, dt, sp) before posing an
// animal (true = it drew it), g.boltS(a, dt) for the extra way a bolting animal covers, then
// g.update(posed, t) after all are posed (a.pose = [x, y, z, yaw] of each posed this frame).
import * as THREE from 'three';
import { RAPIER, yawQuat } from '../physics.js';
import { groups, G_PROP, G_STATIC, G_VEH } from '../config.js';

const GRAB_GROUPS = groups(G_PROP, G_STATIC | G_PROP | G_VEH); // not players: walked through, still grabbed
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

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
  function attach(s, a) {
    const sp = SPECS[a.kind];
    if (s.col) { game.physics.handleOwner.delete(s.col.handle); W.removeCollider(s.col, false); }
    // a capsule along the body (Rapier's capsules stand along y: laid along z)
    const desc = RAPIER.ColliderDesc.capsule(sp.len, sp.r).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
      .setTranslation(0, sp.y, sp.z || 0).setMass(sp.kg).setFriction(0.8).setCollisionGroups(GRAB_GROUPS);
    s.col = W.createCollider(desc, s.body);
    s.owner.animal = a; game.physics.handleOwner.set(s.col.handle, s.owner);
    s.a = a; a.g = { st: 'free', slot: s };
  }
  function detach(s) {
    if (s.col) { game.physics.handleOwner.delete(s.col.handle); W.removeCollider(s.col, false); s.col = null; }
    if (s.body.isDynamic()) s.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    s.body.setTranslation({ x: 0, y: -500, z: 0 }, false);
    if (s.a) s.a.g = null;
    s.a = null; s.owner.animal = null;
  }

  // Draw an animal that is in someone's hands or flying / lying after a throw (true = drawn).
  function drive(a, t, dt, sp) {
    const g = a.g;
    if (!g || (g.st !== 'carried' && g.st !== 'tossed')) return false;
    const b = g.slot.body, tr = b.translation(), rot = b.rotation();   // (the body's origin is the animal's)
    _q.set(rot.x, rot.y, rot.z, rot.w);
    _e.setFromQuaternion(_q, 'YXZ');
    const x = tr.x, y = tr.y, z = tr.z;
    sp.put(x, y, z, _e.y, -_e.x, _e.z, a.s, t * 14, g.st === 'carried' ? 1 : 0.6);
    a.x = x; a.z = z; g.x = x; g.z = z; g.yaw = _e.y;
    return true;
  }
  // extra way along its loop a bolting animal has covered (m)
  function boltS(a, dt) {
    const g = a.g;
    if (g && g.st === 'bolt') a.sBolt = (a.sBolt || 0) + dt * (SPECS[a.kind].run || 4);
    return a.sBolt || 0;
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
      const g = a.g, spec = SPECS[a.kind], p = heldBy(s.body);
      if (g.st === 'free' || g.st === 'bolt' || g.st === 'return') {
        if (p && g.st !== 'return') {
          if (spec.pick) {                                   // picked up
            s.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
            s.body.setAngularDamping(3); s.body.setLinearDamping(0.6);   // a capsule would roll downhill for ever
            s.body.setLinvel({ x: 0, y: 0, z: 0 }, true); s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            g.st = 'carried'; onGrab?.(a, p, 'pick');
            continue;
          }
          if (g.st !== 'bolt') onGrab?.(a, p, 'bolt');
          g.st = 'bolt'; g.until = t + 2;
        } else if (g.st === 'bolt' && t > g.until) g.st = 'free';
        // follow the drawn animal
        const [x, y, z, yaw] = a.pose || [a.x, 0, a.z, 0];
        s.body.setNextKinematicTranslation({ x, y, z });
        s.body.setNextKinematicRotation(yawQuat(yaw));
        continue;
      }
      // carried / tossed: physics has it
      if (p) { g.st = 'carried'; continue; }
      if (g.st === 'carried') { g.st = 'tossed'; g.t0 = t; g.still = 0; }
      const v = s.body.linvel();
      g.still = Math.hypot(v.x, v.y, v.z) < 0.6 ? (g.still || 0) + dt : 0;
      if (g.still > 0.6 || t - g.t0 > 5) {                    // settled: back on its feet, walking home
        s.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        g.st = 'return';
      }
    }
  }
  return { drive, boltS, update, slots };
}
