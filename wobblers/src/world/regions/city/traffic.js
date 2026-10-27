// Bigtown traffic: a city bus and a taxi that drive themselves round a loop
// (right-hand lanes), stop at red lights, wait at bus stops and brake for
// anything in front of them. Hop in as a passenger and ride along, or take
// the driver's seat: while a player drives, it is an ordinary vehicle; when
// they get out near the loop it carries on by itself.
//
// Done with a handling model (vehicles.js registerHandling) that keeps the
// normal wheel physics: without a player driver it sets throttle / steering
// itself and runs updateWheels as if someone were driving.
import { registerHandling, registerVehicle, VEHICLES } from '../../../vehicles.js';
import { Builder, matVC } from '../../../mesh.js';
import { RW } from './layout.js';

const REST = {}; // vehicle type -> body height over routeY while driving (learned; railStep)
const routeY = (R, x, z) => (R.yAt ? R.yAt(x, z) : 3.6);
const AUTO = { auto: true }; // stands in for a driver in updateWheels
const LANE = 2.2;            // lane centre from the road centre line

registerHandling('cityauto', {
  wheels: true,
  update(v, drv, vel, fwd, up, side) {
    if (v.autoDriver) v.autoDriver.visible = !drv;
    if (drv || !v.route) { v.updateWheels(drv, vel, fwd, up, side); return; }
    const on = autopilot(v, fwd);
    if (on && v.speed > 3 && up.y > 0.97) { // learn its ride height for railStep
      const p = v.body.translation();
      REST[v.type] = p.y - routeY(v.route, p.x, p.z);
    }
    v.updateWheels(on ? AUTO : null, vel, fwd, up, side);
  },
});

// self-driving versions of the city bus and the taxi (same looks; the plain types stay for the phone)
export function autoTypes() {
  if (!VEHICLES.autobus) registerVehicle('autobus', { ...VEHICLES.citybus, handling: 'cityauto' });
  if (!VEHICLES.autotaxi) registerVehicle('autotaxi', { ...VEHICLES.taxi, handling: 'cityauto' });
}
// self-driving version of any vehicle type ('car' -> 'autocar'); returns the new type name
export function autoType(base) {
  const name = 'auto' + base;
  if (!VEHICLES[name]) registerVehicle(name, { ...VEHICLES[base], handling: 'cityauto' });
  return name;
}

// A loop of corner points (world x, z) driven in order; stops: [x, z] points on it to wait at.
// The corners are road-centre intersections; the lane offset is applied here.
export function makeRoute(corners, stops = []) {
  const n = corners.length, pts = [];
  for (let i = 0; i < n; i++) {
    const a = corners[(i + n - 1) % n], b = corners[i], c = corners[(i + 1) % n];
    // right-hand offsets of the incoming and outgoing legs, combined at the corner
    const r = (p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); return [-dz / l, dx / l]; };
    const r1 = r(a, b), r2 = r(b, c);
    // heading (dx, dz): right-hand side = (-dz, dx) in this world (x east, z south)
    pts.push([b[0] + (r1[0] + r2[0]) * LANE, b[1] + (r1[1] + r2[1]) * LANE]);
  }
  const segs = pts.map((p, i) => { const q = pts[(i + 1) % n]; return { a: p, b: q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
  let acc = 0;
  for (const s of segs) { s.s0 = acc; acc += s.len; }
  return { segs, total: acc, stops: stops.map(([x, z]) => project(segs, x, z)) };
}

function project(segs, x, z) {
  let best = 0, bd = 1e9;
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / (s.len * s.len)));
    const px = s.a[0] + dx * t, pz = s.a[1] + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < bd) { bd = d; best = s.s0 + t * s.len; }
  }
  return { s: best, d: bd };
}
function at(route, s) {
  s = ((s % route.total) + route.total) % route.total;
  for (const g of route.segs) if (s <= g.s0 + g.len) { const t = (s - g.s0) / g.len; return [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t, g]; }
  const g = route.segs[0]; return [g.a[0], g.a[1], g];
}

function autopilot(v, fwd) {
  const R = v.route, A = v.auto ||= { wait: 0, nextStop: 0, stuck: 0, honk: 0, gone: 0 };
  const game = v.game, p = v.body.translation();
  const pr = project(R.segs, p.x, p.z);
  if (pr.d > 25 || fwd.y > 0.6 || fwd.y < -0.6) { // off the loop (someone parked it elsewhere) or tipped: stay parked
    if ((A.gone += 1 / 60) > 40 && !v.seats.some((s) => s.occupant)) { v.respawn?.(); A.gone = 0; }
    return false;
  }
  A.gone = 0;
  const sp = v.speed, dt = 1 / 60;
  const big = v.def.half[2] > 3;
  // where to aim: a point ahead on the loop (further when going faster)
  const look = (big ? 9 : 7) + Math.max(0, sp) * 0.6;
  const [tx, tz] = at(R, pr.s + look);
  const want = Math.atan2(tx - p.x, tz - p.z), head = Math.atan2(fwd.x, fwd.z);
  let err = want - head; err = Math.atan2(Math.sin(err), Math.cos(err));
  // speed: slow for the corner ahead
  const [cx, cz, seg] = at(R, pr.s);
  const toCorner = seg.s0 + seg.len - pr.s;
  let target = big ? 9 : 11;
  if (toCorner < 22) target = Math.min(target, 4 + toCorner * 0.25);
  if (Math.abs(err) > 0.35) target = Math.min(target, 4);
  let stop = false;
  // bus stops: pull up and wait
  if (R.stops.length) {
    const st = R.stops[A.nextStop % R.stops.length];
    let ds = st.s - pr.s; if (ds < -R.total / 2) ds += R.total;
    if (A.wait > 0) { stop = true; if ((A.wait -= dt) <= 0) { A.nextStop++; A.wait = 0; } }
    else if (ds < 1.5 && ds > -4) { A.wait = 7; stop = true; v.honk?.(); }
    else if (ds > 0 && ds < 25) target = Math.min(target, 2 + ds * 0.35);
    else if (ds < -4 && ds > -60) A.nextStop++; // passed it somehow
  }
  // red lights: a stop line ~9 m before each crossing on our leg
  const L = game.cityLights;
  if (L && !stop) {
    const ph = L.phase(), dx = seg.b[0] - seg.a[0], dz = seg.b[1] - seg.a[1];
    const ns = Math.abs(dz) > Math.abs(dx);
    const red = ns ? (ph === 1 || ph === 2 || ph === 3) : (ph === 3 || ph === 0 || ph === 1);
    if (red) for (const x of game.cityCrossings) {
      // distance along our heading to the crossing centre, and how far off our line it is
      const ux = dx / seg.len, uz = dz / seg.len;
      const along = (x.x - p.x) * ux + (x.z - p.z) * uz, off = Math.abs(-(x.x - p.x) * uz + (x.z - p.z) * ux);
      if (off < RW + 1 && along > RW + 2 && along < RW + 2 + 12 + v.def.half[2]) { stop = along - (RW + 3 + v.def.half[2]) < 3 || stop; target = Math.min(target, Math.max(0, (along - RW - 3 - v.def.half[2]) * 0.6)); }
    }
  }
  // anything in front: players, NPCs, other vehicles
  const fx = Math.sin(head), fz = Math.cos(head), reach = v.def.half[2] + 3 + Math.max(0, sp) * 0.8;
  const blocked = (q) => { const rx = q.x - p.x, rz = q.z - p.z, a = rx * fx + rz * fz; return a > 0 && a < reach && Math.abs(-rx * fz + rz * fx) < v.def.half[0] + 1.0; };
  let block = false;
  for (const pl of game.players) if (!pl.seat && blocked(pl.chest.translation())) { block = true; break; }
  if (!block && game.npcs) for (const n of game.npcs.awake) if (blocked(n.chest.translation())) { block = true; break; }
  if (!block) for (const o of game.vehicles) if (o !== v && blocked(o.body.translation())) { block = true; break; }
  // blocked: wait and honk; after a long wait (two cars nose to nose) creep on anyway for a moment
  if (block) A.blockT = (A.blockT || 0) + dt; else A.blockT = 0;
  if (A.blockT > 10) { block = false; if (A.blockT > 13) A.blockT = 0; }
  if (block) { stop = true; if ((A.honk -= dt) <= 0) { v.honk?.(); A.honk = 4; } }
  // drive
  if (stop) target = 0;
  const steer = Math.max(-1, Math.min(1, -err * 2.2)); // control(): +steer turns right; err > 0 = target to our left
  const gas = sp < target - 0.5 ? Math.min(1, (target - sp) * 0.4 + 0.2) : 0;
  const brake = sp > target + 0.8 || target === 0 ? Math.min(1, (sp - target) * 0.5 + (target === 0 ? 0.6 : 0)) : 0;
  v.control({ gas, brake: Math.max(0, brake), steer, jump: target === 0 && Math.abs(sp) < 0.6 });
  // stuck (pushed into something): nudge back onto the loop after a while
  if (Math.abs(sp) < 0.3 && !stop) { if ((A.stuck += dt) > 12) { A.stuck = 0; placeOnRoute(v, pr.s + 10); } } else A.stuck = 0;
  return true;
}

export function placeOnRoute(v, s) {
  const [x, z] = at(v.route, s), [nx, nz] = at(v.route, s + 3);
  const yaw = Math.atan2(nx - x, nz - z);
  const y = v.route.yAt ? v.route.yAt(x, z) : 3.6; // routes off the flat city plate give their ground height
  v.body.setTranslation({ x, y, z }, true);
  v.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  v.body.setLinvel({ x: 0, y: 0, z: 0 }, true); v.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  if (v.rec) v.rec.snap = true;
  return { x, y, z, yaw };
}

// A little bean driver sitting in the driver's seat while nobody else drives.
export function addAutoDriver(v, color = 0xffd23f) {
  const seat = v.def.seats.find((s) => s.kind === 'driver');
  const b = new Builder(), [x, y, z] = seat.pos;
  b.sphere(0.32, color, [x, y + 0.35, z], [1, 1.15, 0.9], 10);
  b.sphere(0.27, 0xffe08a, [x, y + 0.95, z], null, 12);
  b.cyl(0.29, 0.29, 0.12, 0x222228, [x, y + 1.18, z], null, 12);
  b.box(0.36, 0.04, 0.2, 0x222228, [x, y + 1.13, z + 0.22]);
  b.sphere(0.04, 0x111111, [x - 0.09, y + 1.0, z + 0.25], null, 6);
  b.sphere(0.04, 0x111111, [x + 0.09, y + 1.0, z + 0.25], null, 6);
  const m = b.mesh(matVC);
  v.shell.add(m);
  v.autoDriver = m;
}

// Far from every player a self-driving vehicle runs "on rails" (simcull.js sets v.rail): its
// body is out of the physics and this moves it along the loop at cruising speed, slowing for
// corners and keeping behind whatever is in front, so the streets still look alive from afar
// for almost nothing. Coming back within range it is handed back to the wheel physics at the
// same speed (exitRail). Red lights and bus stops only matter up close.
export function railStep(v, dt) {
  const R = v.route, A = v.auto ||= { wait: 0, nextStop: 0, stuck: 0, honk: 0, gone: 0 };
  const b = v.body, p = b.translation();
  if (A.railS === undefined) { A.railS = project(R.segs, p.x, p.z).s; A.railV = Math.max(0, v.speed || 0); }
  if (A.railDy === undefined) {
    // ride height: as last seen driving, else from the wheels (sitting at rest on its springs)
    const a = v.def.axles?.[0];
    A.railDy = REST[v.type] ?? (a ? -a.y + a.rest * 0.6 + a.r - 1.6 : p.y - routeY(R, p.x, p.z));
  }
  const big = v.def.half[2] > 3;
  const [, , seg] = at(R, A.railS);
  const toCorner = seg.s0 + seg.len - A.railS;
  let target = big ? 9 : 11;
  if (toCorner < 22) target = Math.min(target, 4 + toCorner * 0.25);
  // keep behind anything ahead on the road (another car, a crowd)
  const [hx, hz] = at(R, A.railS + 2), fx = hx - p.x, fz = hz - p.z, fl = Math.hypot(fx, fz) || 1;
  const reach = v.def.half[2] + 4 + A.railV * 0.8;
  let block = false;
  for (const o of v.game.vehicles) {
    if (o === v || o.culled) continue;
    const q = o.body.translation(), rx = q.x - p.x, rz = q.z - p.z, a = (rx * fx + rz * fz) / fl;
    if (a > 0 && a < reach && Math.abs((-rx * fz + rz * fx) / fl) < v.def.half[0] + 1) { block = true; break; }
  }
  A.railBlock = block ? (A.railBlock || 0) + dt : 0; // stuck behind a parked one: pass through after a while
  if (block && A.railBlock < 10) target = 0;
  A.railV += Math.max(-6 * dt, Math.min(3 * dt, target - A.railV));
  A.railS = (A.railS + A.railV * dt) % R.total;
  const [x, z] = at(R, A.railS), [nx, nz] = at(R, A.railS + 4);
  const yaw = Math.atan2(nx - x, nz - z);
  b.setTranslation({ x, y: routeY(R, x, z) + A.railDy, z }, false);
  b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, false);
}
// Beyond simcull's FAR_AUTO nothing of it runs at all: suspendRoute notes where it was on the
// loop and when; resumeRoute (coming back into range) puts it where it would have got to by
// now at an average pace, already on rails, so the roads aren't frozen as you arrive.
export function suspendRoute(v, time) {
  const A = v.auto ||= { wait: 0, nextStop: 0, stuck: 0, honk: 0, gone: 0 }, p = v.body.translation();
  A.offS = A.railS ?? project(v.route.segs, p.x, p.z).s; A.offT = time; A.railS = undefined;
}
export function resumeRoute(v, time, pts = []) {
  const A = v.auto, R = v.route;
  if (!A || A.offT === undefined) return;
  const cruise = v.def.half[2] > 3 ? 9 : 11;
  // never pop it in where someone could see it appear: back off along the loop until it's 150 m away
  let s = A.offS + (time - A.offT) * cruise * 0.7;
  for (let k = 0; k < R.total / 20; k++, s -= 20) {
    const [x, z] = at(R, s);
    if (pts.every((q) => (x - q.x) ** 2 + (z - q.z) ** 2 > 150 * 150)) break;
  }
  A.railS = ((s % R.total) + R.total) % R.total; A.railV = cruise; A.offT = undefined;
  railStep(v, 0);
}
export function exitRail(v) {
  const A = v.auto, b = v.body;
  if (!A || A.railS === undefined) return;
  const q = b.rotation(), yaw = 2 * Math.atan2(q.y, q.w), s = A.railV;
  b.setLinvel({ x: Math.sin(yaw) * s, y: 0, z: Math.cos(yaw) * s }, true);
  b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  A.railS = undefined;
}
