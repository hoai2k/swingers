// Every moving ride can be grabbed onto. Players hang off kinematic bodies
// with LT / RT (player.js rideCarry), but a ride part that only carries seats
// and no colliders (a chair drawn round a seat) has nothing to catch hold of,
// so a full ride couldn't be ridden at all. After the world is built, each
// kinematic body with seats and no colliders gets a small solid block round
// every seat (vehicle group: seated riders don't collide with it), so the
// chair itself is something to hang from.
import { RAPIER } from '../physics.js';
import { VEH_GROUPS } from '../config.js';

export function addGrabHandles(game) {
  const world = game.physics.world, bySeat = new Map();
  for (const s of game.seats) {
    const b = s.body;
    if (!b || s.use || !b.isKinematic?.() || b.numColliders() > 0) continue;
    if (!bySeat.has(b)) bySeat.set(b, []);
    bySeat.get(b).push(s);
  }
  let n = 0;
  for (const [b, seats] of bySeat) {
    for (const s of seats) {
      // a seat pan under the hips and a back behind them (seat-local, turned by seat.yaw)
      const yaw = s.yaw || 0, c = Math.cos(yaw), sn = Math.sin(yaw), q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
      const at = (lx, ly, lz) => ({ x: s.pos[0] + lx * c + lz * sn, y: s.pos[1] + ly, z: s.pos[2] - lx * sn + lz * c });
      for (const [half, off] of [[[0.28, 0.05, 0.26], [0, -0.22, 0]], [[0.28, 0.25, 0.05], [0, 0.05, -0.3]]]) {
        const p = at(...off);
        world.createCollider(RAPIER.ColliderDesc.cuboid(...half).setTranslation(p.x, p.y, p.z).setRotation(q).setCollisionGroups(VEH_GROUPS), b);
        n++;
      }
    }
  }
  return n;
}
