// Distance-based physics culling. The archipelago holds ~1000 loose bodies
// (props, parked vehicles, boats) and most of them never sleep (vehicle wheel
// controllers and buoyancy keep nudging them), so Rapier used to simulate the
// whole world every step. Like the NPC parking in npc.js, anything loose far
// from every player is switched off (body.setEnabled(false): it keeps its last
// pose and mesh) and switched back on as a player approaches. Vehicles that
// are culled skip their update() too (game.step checks vehicle.culled).
//
// Never culled: occupied vehicles, anything a player is holding, objects
// flagged `noCull`.
//
// Kinematic bodies (rides, lifts, elevators, doors, ferries) have two ranges:
//  - within KIN_PHYS of a player they are real physics (you can touch, ride,
//    grab them): a moving ride costs the solver every step;
//  - beyond that, out to their animation range (KIN_FAR, or what was given
//    with `physics.kinRange.set(body.handle, metres)`: big landmarks seen
//    from afar, Infinity for ferries on a timetable) they keep moving as a
//    picture: the body is switched off and the animator's next-kinematic
//    pose is applied directly (physics.js), so the mesh still follows it;
//  - past the animation range the animator stops too and the ride stands
//    still where it was (physics.animate / kinAnim).
import { exitRail, suspendRoute, resumeRoute } from './world/regions/city/traffic.js';

const FAR = 150, NEAR = 125;   // metres from the nearest player (hysteresis)
const FAR_AUTO = 300, NEAR_AUTO = 270; // self-driving traffic stays live further out: it's the life of the streets
const RAIL_FAR = 110, RAIL_NEAR = 95;  // ...but beyond this it drives "on rails" (no physics: traffic.js railStep)
const EVERY = 15;              // steps between checks (~4 per second)
const KIN_FAR = 220, KIN_NEAR = 200; // kinematic animation range (unless physics.kinRange says otherwise)
const KIN_PHYS = 90, KIN_PHYS_IN = 75; // kinematic bodies are real physics within this of a player

export function buildSimCull(game) {
  const ph = game.physics;
  let tick = 0;
  const vehOf = new Map();
  const cull = {
    off: 0,
    check() {
      const pts = game.players.map((p) => p.chest.translation());
      if (!pts.length) pts.push({ x: 0, z: 0 }); // title screen: keep the town around the idle camera
      vehOf.clear();
      for (const v of game.vehicles) vehOf.set(v.body, v);
      const held = new Set();
      for (const p of game.players) for (const h of ['L', 'R']) if (p.hands?.[h]?.body) held.add(p.hands[h].body);
      let off = 0;
      for (const o of ph.objects) {
        const b = o.body;
        if (o.noCull || !b || b.isKinematic()) continue;
        const t = b.translation();
        let d = Infinity;
        for (const q of pts) d = Math.min(d, Math.hypot(t.x - q.x, t.z - q.z));
        const v = vehOf.get(b);
        const keep = held.has(b) || (v && v.seats.some((s) => s.occupant));
        const far = v?.route ? FAR_AUTO : FAR, near = v?.route ? NEAR_AUTO : NEAR;
        if (!o.culled && d > far && !keep) {
          o.culled = true; b.setEnabled(false); if (o.rec) o.rec.off = true;
          if (v) { v.culled = true; if (v.route) { v.rail = false; suspendRoute(v, ph.time); } }
        } else if (o.culled && (d < near || keep)) {
          o.culled = false; if (o.rec) { o.rec.off = false; o.rec.snap = true; }
          if (v) v.culled = false;
          if (v?.route && !keep && d > RAIL_FAR) { v.rail = true; resumeRoute(v, ph.time, pts); } // straight back on rails
          else { b.setEnabled(true); b.wakeUp(); }
        }
        // self-driving traffic between RAIL_FAR and FAR_AUTO: still moving, but not simulated
        // (each one with its wheel raycasts cost ~0.6 ms a step even far out of reach)
        if (v?.route && !o.culled) {
          const rail = !keep && (v.rail ? d > RAIL_NEAR : d > RAIL_FAR);
          if (rail !== !!v.rail) { v.rail = rail; b.setEnabled(!rail); if (!rail) { exitRail(v); b.wakeUp(); } }
        }
        if (o.culled) off++;
      }
      cull.off = off;
      cull.checkKinematic(pts);
    },
    kin: null,
    kinOff: 0,
    checkKinematic(pts) {
      if (!cull.kin || tick % 600 === 0) { // the kinematic list (rides built later, ferries)
        const list = [];
        const objs = new Map(ph.objects.filter((o) => o.body).map((o) => [o.body.handle, o]));
        ph.world.forEachRigidBody((b) => { if (b.isKinematic()) list.push({ b, off: !b.isEnabled(), o: objs.get(b.handle) }); });
        cull.kin = list;
      }
      const title = !game.players.length; // title screen: the idle camera flies about, keep everything going
      let off = 0, still = 0;
      for (const k of cull.kin) {
        const range = ph.kinRange.get(k.b.handle) ?? KIN_FAR;
        const t = k.b.translation();
        let d2 = title ? 0 : Infinity;
        for (const q of pts) d2 = Math.min(d2, (t.x - q.x) ** 2 + (t.z - q.z) ** 2);
        // animated at all? (hysteresis: stop beyond range, start again inside range - 20)
        const anim = k.anim === false ? d2 < (range - (KIN_FAR - KIN_NEAR)) ** 2 : d2 <= range * range;
        // real physics? only near a player
        const phys = anim && (k.off ? d2 < KIN_PHYS_IN * KIN_PHYS_IN : d2 <= KIN_PHYS * KIN_PHYS);
        if (phys === k.off) { k.off = !phys; k.b.setEnabled(phys); }
        k.anim = anim;
        ph.kinAnim.set(k.b.handle, anim);
        if (k.o?.rec) k.o.rec.off = !anim; // standing still: physics.capture / sync skip it
        if (k.off) off++;
        if (!anim) still++;
      }
      cull.kinOff = off; cull.kinStill = still;
    },
  };
  game.steppers.push(() => { if (++tick % EVERY === 0) cull.check(); });
  cull.check();
  return cull;
}
