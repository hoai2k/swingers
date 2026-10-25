// Distance-based physics culling. The archipelago holds ~1000 loose bodies
// (props, parked vehicles, boats) and most of them never sleep (vehicle wheel
// controllers and buoyancy keep nudging them), so Rapier used to simulate the
// whole world every step. Like the NPC parking in npc.js, anything loose far
// from every player is switched off (body.setEnabled(false): it keeps its last
// pose and mesh) and switched back on as a player approaches. Vehicles that
// are culled skip their update() too (game.step checks vehicle.culled).
//
// Never culled: kinematic bodies (rides, ferries), occupied vehicles, anything
// a player is holding, objects flagged `noCull`.
const FAR = 150, NEAR = 125;   // metres from the nearest player (hysteresis)
const FAR_AUTO = 300, NEAR_AUTO = 270; // self-driving traffic stays live further out: it's the life of the streets
const EVERY = 15;              // steps between checks (~4 per second)

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
          o.culled = true; b.setEnabled(false);
          if (v) v.culled = true;
        } else if (o.culled && (d < near || keep)) {
          o.culled = false; b.setEnabled(true); b.wakeUp();
          if (v) v.culled = false;
        }
        if (o.culled) off++;
      }
      cull.off = off;
    },
  };
  game.steppers.push(() => { if (++tick % EVERY === 0) cull.check(); });
  cull.check();
  return cull;
}
