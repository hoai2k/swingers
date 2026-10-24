// Phone: call a vehicle to you (Wobbly Life's phone). A small phone in the
// player's own view lists the vehicle types; picking one spawns it next to the
// player on a clear spot facing their way, with a poof. Each player keeps at
// most one called vehicle: calling another removes the previous one if it is
// empty (if someone is riding it, it stays and is simply forgotten).
//
// The panel is a UI panel (ui.js setPanel) and captures its device while open.
// Controls: stick / D-pad (W/S, arrows) choose, A / Enter / Num0 call,
// B / Esc / Num7 hang up, P / Num* close too.
import * as THREE from 'three';
import { RAPIER, yawQuat } from './physics.js';
import { SEA_LEVEL, PLAYER_CSS, ALL, groups } from './config.js';
import { Vehicle, VEHICLES } from './vehicles.js';
import { promptRow, deviceKind } from './glyphs.js';
import { injectCSS } from './map.js';

// Callable types, in phone order. `type` must exist in VEHICLES. Add more with
// registerCallable({ id, type, name, icon, color?, opts?, svg? }) (icon: a key of
// ICONS below, or svg: your own 24x14 pictogram paths), optionally before
// another entry: registerCallable(entry, 'heli').
const CALLABLE = [
  { id: 'car', type: 'car', name: 'Car', icon: 'car' },
  { id: 'sports', type: 'sports', name: 'Sports car', icon: 'sports' },
  { id: 'pickup', type: 'pickup', name: 'Pickup', icon: 'pickup' },
  { id: 'van', type: 'van', name: 'Van', icon: 'van' },
  { id: 'icecream', type: 'van', name: 'Ice-cream van', icon: 'van', opts: { icecream: true }, color: 0xffb7d5 },
  { id: 'bus', type: 'bus', name: 'Bus', icon: 'bus', color: 0xffc233 },
  { id: 'police', type: 'police', name: 'Police car', icon: 'car', color: 0xffffff },
  { id: 'firetruck', type: 'firetruck', name: 'Fire truck', icon: 'bus', color: 0xe8322b },
  { id: 'tractor', type: 'tractor', name: 'Tractor', icon: 'tractor', color: 0xd9342b },
  { id: 'quad', type: 'quad', name: 'Quad bike', icon: 'quad' },
  { id: 'scooter', type: 'scooter', name: 'Scooter', icon: 'bike' },
  { id: 'kart', type: 'kart', name: 'Go-kart', icon: 'quad' },
  { id: 'boat', type: 'boat', name: 'Boat', icon: 'boat' },
  { id: 'heli', type: 'heli', name: 'Helicopter', icon: 'heli', color: 0x3f8cff },
].filter((c) => VEHICLES[c.type]);
export { CALLABLE };
export function registerCallable(entry, before = null) {
  if (!VEHICLES[entry.type]) throw new Error('registerCallable: unknown vehicle type ' + entry.type);
  const old = CALLABLE.findIndex((c) => c.id === entry.id);
  if (old >= 0) CALLABLE.splice(old, 1);
  if (entry.svg) ICONS[entry.id] = entry.svg, entry.icon = entry.id;
  const at = before ? CALLABLE.findIndex((c) => c.id === before) : -1;
  if (at >= 0) CALLABLE.splice(at, 0, entry); else CALLABLE.push(entry);
  return entry;
}

// Tiny side-on pictograms (24x14 viewBox), filled with currentColor.
const ICONS = {
  car: '<path d="M2 9 L4 5 L9 4 L15 4 L19 7 L22 8 L22 11 L2 11 Z"/><circle cx="6.5" cy="11.5" r="2"/><circle cx="17.5" cy="11.5" r="2"/>',
  sports: '<path d="M1 10 L3 7 L9 5.5 L14 5.5 L18 8 L23 8.5 L23 11 L1 11 Z"/><circle cx="6" cy="11.5" r="2"/><circle cx="18.5" cy="11.5" r="2"/>',
  pickup: '<path d="M2 11 L2 7 L12 7 L12 3.5 L17 3.5 L20 7 L22 7.5 L22 11 Z"/><circle cx="6" cy="11.5" r="2"/><circle cx="18" cy="11.5" r="2"/>',
  van: '<path d="M2 11 L2 3 L17 3 L21 7 L22 8 L22 11 Z"/><circle cx="6" cy="11.5" r="2"/><circle cx="18" cy="11.5" r="2"/>',
  bus: '<path d="M1 11 L1 2.5 L22 2.5 L23 5 L23 11 Z"/><circle cx="5" cy="11.5" r="2"/><circle cx="19" cy="11.5" r="2"/>',
  tractor: '<path d="M3 9 L3 6 L9 6 L9 1.5 L15 1.5 L15 6 L20 6 L21 9 Z"/><circle cx="7" cy="10" r="3.5"/><circle cx="19" cy="11.5" r="2"/>',
  quad: '<path d="M3 8 L7 5 L16 5 L21 8 L21 9.5 L3 9.5 Z"/><circle cx="6" cy="11" r="2.6"/><circle cx="18" cy="11" r="2.6"/>',
  bike: '<path d="M6 9 L10 4 L13 4 L13 7 L18 7 L18 9 Z"/><circle cx="5.5" cy="11" r="2.4"/><circle cx="18.5" cy="11" r="2.4"/>',
  boat: '<path d="M1 7 L23 7 L19 12 L4 12 Z"/><path d="M9 7 L11 3 L16 3 L16 7 Z"/>',
  heli: '<path d="M3 1.5 L21 1.5 L21 2.5 L3 2.5 Z"/><path d="M11 2.5 L13 2.5 L13 4 L11 4 Z"/><path d="M6 8 Q6 4 11 4 L15 4 Q18 4 18 8 Q18 10 15 10 L9 10 Q6 10 6 8 Z"/><path d="M15 6 L23 6 L23 7.2 L15 7.2 Z"/><path d="M7 12 L18 12 L18 12.8 L7 12.8 Z"/>',
};

const CSS = `
.ppanel.phone { background: linear-gradient(270deg, rgba(20,50,110,.38), rgba(20,50,110,0) 55%); justify-content: flex-end; }
.phonecase { pointer-events: auto; width: 250px; background: #232838; border-radius: 34px; padding: 14px 10px 16px; box-sizing: border-box;
  box-shadow: 0 10px 0 rgba(0,0,0,.25), 0 0 0 4px var(--acc); transform: scale(var(--s,1)); transform-origin: 100% 50%; margin-right: calc(16px * var(--s,1));
  animation: phonein .35s cubic-bezier(.3,1.5,.5,1); position: relative; }
.phonecase.shake { animation: phoneshake .35s; }
@keyframes phonein { from { transform: translateY(40%) scale(calc(var(--s,1) * .8)); opacity: 0; } }
@keyframes phoneshake { 20%,60% { transform: translateX(-8px) scale(var(--s,1)); } 40%,80% { transform: translateX(8px) scale(var(--s,1)); } }
.phonecase .phnotch { width: 70px; height: 7px; border-radius: 4px; background: #3a4155; margin: 0 auto 10px; }
.phonecase .phscreen { background: linear-gradient(180deg, #e9f3ff, #fff 40%); border-radius: 20px; padding: 10px 10px 8px; color: #1f3354; text-shadow: none; }
.phonecase .phtitle { display: flex; justify-content: space-between; align-items: center; font-weight: 900; font-size: 15px; margin: 0 4px 6px; }
.phonecase .phtitle i { font-style: normal; font-size: 11px; opacity: .65; font-weight: 800; }
.phonecase .phlist { height: 258px; overflow: hidden; position: relative; }
.phonecase .phin { transition: transform .12s; }
.phonecase .phitem { display: flex; align-items: center; gap: 10px; padding: 0 10px; height: 36px; margin-bottom: 4px; border-radius: 12px; background: #e8f0ff;
  font-weight: 800; font-size: 14px; cursor: pointer; }
.phonecase .phitem svg { width: 30px; height: 18px; flex: none; fill: currentColor; }
.phonecase .phitem small { margin-left: auto; font-size: 10px; font-weight: 800; opacity: .7; }
.phonecase .phitem.sel { background: var(--acc); color: var(--fg); box-shadow: 0 3px 0 rgba(0,0,0,.2); }
.phonecase .phitem.off { opacity: .55; }
.phonecase .phmsg { min-height: 30px; font-size: 12px; font-weight: 800; text-align: center; color: #c0392b; display: flex; align-items: center; justify-content: center; margin-top: 4px; }
.phonecase .phmsg.ok { color: #2f9a36; }
.phonecase .foot { margin-top: 6px; font-size: 12px; color: #c9d3e6; display: flex; justify-content: center; flex-wrap: wrap; gap: 2px 0; font-weight: 700; }
`;
let cssDone = false;
const textCol = (c) => (c === 0xffffff || c === 0xffc233 || c === 0x3fe0d0) ? '#234' : '#fff';
const accent = (c) => PLAYER_CSS(c === 0xffffff ? 0x2a62c9 : c);

export class PhonePanel {
  constructor(ui, player) {
    if (!cssDone) { injectCSS(CSS); cssDone = true; }
    this.ui = ui; this.p = player; this.kind = 'phone';
    this.sel = Math.max(0, CALLABLE.findIndex((c) => c.id === (player.lastCall || 'car')));
    this.t0 = performance.now();
    this.msg = ''; this.msgOk = false;
    this.el = document.createElement('div');
    this.el.className = 'ppanel phone';
    ui.hud.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const it = e.target.closest?.('[data-i]');
      if (it) { this.sel = +it.dataset.i; this.call(); }
    });
    this.el.addEventListener('wheel', (e) => { this.move(e.deltaY > 0 ? 1 : -1); e.preventDefault(); }, { passive: false });
    // which special vehicles can come here right now
    this.water = !!findSpot(ui.game, player, VEHICLES.boat, null);
    ui.game.audio?.play('uiOpen');
    this.draw();
  }
  remove() { this.el.remove(); }
  place(rect) {
    const [x, y, w, h] = rect;
    const s = Math.max(0.42, Math.min(1, h / 520, w / 380));
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    this.el.style.setProperty('--s', s.toFixed(3));
  }
  move(d) {
    const N = CALLABLE.length;
    this.sel = (this.sel + d + N) % N;
    this.msg = '';
    this.ui.sfx('uiMove');
    this.draw();
  }
  input(n) {
    if (performance.now() - this.t0 < 250) return;
    const d = this.ui.game.input.get(this.p.deviceId), pr = d?.rawPressed || {};
    const kb = this.p.deviceId === 'kb1' || this.p.deviceId === 'kb2';
    if (n.back || (kb && pr.phone) || (this.p.deviceId === 'kb1' && n.start)) { this.ui.sfx('uiBack'); this.ui.closePanel(this.p); return; }
    if (pr.map) { this.ui.openMap(this.p); return; }
    if (n.up || n.left) this.move(-1);
    if (n.down || n.right) this.move(1);
    if (n.ok) this.call();
  }
  call() {
    const c = CALLABLE[this.sel], g = this.ui.game;
    const res = callVehicle(g, this.p, c);
    if (res.ok) {
      this.p.lastCall = c.id;
      this.ui.closePanel(this.p);
      this.ui.toast(`${c.name} on its way!`, this.p.color);
      return;
    }
    this.msg = res.msg; this.msgOk = false;
    this.ui.sfx('uiBack');
    this.draw();
    const pc = this.el.querySelector('.phonecase');
    pc?.classList.remove('shake'); void pc?.offsetWidth; pc?.classList.add('shake');
  }
  draw() {
    const p = this.p, k = deviceKind(p.deviceId);
    const per = 40, vis = 6.45, N = CALLABLE.length;
    const off = Math.max(0, Math.min(N - vis, this.sel - 2.5)) * per;
    const items = CALLABLE.map((c, i) => {
      const vd = VEHICLES[c.type] || {};
      const note = this.ui.game.vehicleLock?.(c.id) ? '🔒 car dealer' : vd.boat ? (this.water ? 'water nearby' : 'needs water') : vd.heli ? 'needs space' : '';
      const off2 = vd.boat && !this.water;
      return `<div class="phitem ${i === this.sel ? 'sel' : ''} ${off2 ? 'off' : ''}" data-i="${i}"><svg viewBox="0 0 24 14">${ICONS[c.icon] || ICONS.car}</svg>${c.name}${note ? `<small>${note}</small>` : ''}</div>`;
    }).join('');
    const prev = this.ui.game.calledVehicles?.get(p);
    const sub = prev && !prev.destroyed ? 'replaces your ' + (CALLABLE.find((c) => c.id === prev.callId)?.name.toLowerCase() || 'ride') : 'call a ride';
    this.el.innerHTML = `<div class="phonecase" style="--acc:${accent(p.color)};--fg:${textCol(p.color === 0xffffff ? 0x2a62c9 : p.color)}">
      <div class="phnotch"></div><div class="phscreen">
      <div class="phtitle">Vehicles<i>${sub}</i></div>
      <div class="phlist"><div class="phin" style="transform:translateY(${-off}px)">${items}</div></div>
      <div class="phmsg ${this.msgOk ? 'ok' : ''}">${this.msg}</div></div>
      <div class="foot">${promptRow([['OK', 'Call'], ['MENUBACK', 'Hang up']], k)}</div></div>`;
  }
}

// ---------------------------------------------------------------------------
// Finding a spot and spawning
// ---------------------------------------------------------------------------
const QUERY = groups(ALL, ALL);
const _q = new THREE.Quaternion();

// Body-frame extents of a vehicle: half width/length (with a margin), how far
// the wheels / hull reach below the body origin, and the roof height above it.
function extents(def) {
  const h = def.half;
  if (def.heli) return { hx: 4.1, hz: 4.6, cz: -1.2, below: 1.18, above: 1.45 };
  if (def.boat) return { hx: h[0] + 0.3, hz: h[2] + 0.3, cz: 0, below: 0.35, above: 0.8 };
  const below = def.axles ? Math.max(...def.axles.map((a) => -(a.y - a.rest - a.r))) : h[1] + 0.2;
  const above = def.cabin ? def.cabin.off[1] + def.cabin.half[1] : def.tractor ? 2.1 : h[1] + (def.open ? 0.5 : 0.2);
  return { hx: h[0] + 0.25, hz: h[2] + 0.3, cz: 0, below, above };
}

function waterSurface(game, x, z) {
  for (const w of game.physics.waterBoxes) if (x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) return w.level;
  return SEA_LEVEL;
}

// A clear spot near the player for vehicle `def`, or null. Returns { x, y, z, yaw }.
export function findSpot(game, player, def, excludeBody) {
  const ph = game.physics, world = ph.world;
  const c = player.chest.translation();
  const yaw = player.yaw;
  const E = extents(def);
  const footY = c.y - 1.0;
  const boat = !!def.boat, heli = !!def.heli;
  const R0 = Math.max(E.hx, E.hz);
  const dists = boat ? [R0 + 2, R0 + 5, R0 + 9, R0 + 14, R0 + 20, R0 + 27, R0 + 35] : [R0 + 1.6, R0 + 3.5, R0 + 6.5, R0 + 10, R0 + 15];
  const angs = [0.6, -0.6, 1.2, -1.2, 0, 1.9, -1.9, Math.PI];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1], [0, -1]];
  for (const d of dists) for (const a of angs) {
    const ax = Math.sin(yaw + a), az = Math.cos(yaw + a);
    // vehicle centre (the heli's body sits ahead of its footprint centre)
    const x = c.x + ax * d, z = c.z + az * d;
    if (Math.abs(x) > 1380 || Math.abs(z) > 1380) continue;
    // ground under the footprint (static world only)
    const hs = [];
    let ok = true, wet = 0;
    for (const [u, v] of corners) {
      const lx = u * (E.hx - 0.2), lz = E.cz + v * (E.hz - 0.2);
      const wx = x + lx * cy + lz * sy, wz = z - lx * sy + lz * cy;
      const lvl = waterSurface(game, wx, wz);
      const gy = game.groundHeight(wx, wz, boat ? lvl + 1.5 : Math.max(c.y + 2.5, lvl + 1));
      hs.push(gy);
      if (gy < lvl - (boat ? 0.7 : 0.15)) wet++;
      if (boat && gy > lvl - 0.7) { ok = false; break; }
    }
    if (!ok) continue;
    let y;
    if (boat) {
      if (wet < corners.length) continue;
      y = waterSurface(game, x, z) + 0.2;
    } else {
      if (wet) continue;
      const mx = Math.max(...hs), mn = Math.min(...hs);
      if (mx - mn > (heli ? 1.0 : 0.25 + 0.12 * Math.max(E.hx, E.hz))) continue; // too steep or a kerb/step
      if (Math.abs(mx - footY) > 2.2) continue; // a roof, a ledge or a pit
      y = mx + E.below + 0.12;
    }
    // nothing in the way (buildings, props, vehicles, players)
    const lo = y - E.below + (boat ? 0.25 : 0.3), hi = y + E.above + (heli ? 1.5 : 0.25);
    const shape = new RAPIER.Cuboid(E.hx, Math.max(0.2, (hi - lo) / 2), E.hz);
    const rot = yawQuat(yaw);
    _q.set(rot.x, rot.y, rot.z, rot.w);
    const off = new THREE.Vector3(0, 0, E.cz).applyQuaternion(_q);
    const hit = world.intersectionWithShape({ x: x + off.x, y: (lo + hi) / 2, z: z + off.z }, rot, shape,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, QUERY, undefined, excludeBody || undefined);
    if (hit) continue;
    // vehicles spawned this frame aren't in the query pipeline yet
    if (game.vehicles.some((v) => v.body !== excludeBody && v.spawnedAt === game.time && Math.hypot(v.body.translation().x - x, v.body.translation().z - z) < R0 + 4)) continue;
    return { x, y, z, yaw };
  }
  return null;
}

// Spawn `entry` (a CALLABLE item) for player. Returns { ok, vehicle } or { ok: false, msg }.
export function callVehicle(game, player, entry) {
  if (typeof entry === 'string') entry = CALLABLE.find((c) => c.id === entry || c.type === entry);
  if (!entry) return { ok: false, msg: 'Unknown vehicle' };
  const locked = game.vehicleLock?.(entry.id); if (locked) return { ok: false, msg: locked }; // car dealer (src/life/shops.js)
  const def = VEHICLES[entry.type];
  const calls = game.calledVehicles ||= new Map();
  let prev = calls.get(player);
  if (prev && (prev.destroyed || !game.vehicles.includes(prev))) prev = null;
  const prevEmpty = prev && !prev.seats.some((s) => s.occupant);
  const spot = findSpot(game, player, def, prevEmpty ? prev.body : null);
  if (!spot) {
    if (def.boat) return { ok: false, msg: 'Boats need water: try the beach, the lake or the pier' };
    if (def.heli) return { ok: false, msg: 'Not enough open space for a helicopter here' };
    return { ok: false, msg: 'No room here, try somewhere more open' };
  }
  if (prev) { if (prevEmpty) prev.destroy(); calls.delete(player); }
  const color = entry.color ?? (['police', 'firetruck', 'bus', 'tractor'].includes(entry.type) ? undefined : player.color);
  const v = new Vehicle(game, entry.type, spot.x, spot.y, spot.z, spot.yaw, color, entry.opts || {});
  v.callId = entry.id; v.called = player; v.spawnedAt = game.time;
  game.vehicles.push(v);
  calls.set(player, v);
  poof(game, v, spot);
  return { ok: true, vehicle: v };
}

// White puffs and a springy scale-in for the new vehicle, plus a pop.
function poof(game, v, spot) {
  const E = extents(v.def), R = Math.max(E.hx, E.hz);
  const puffs = new THREE.Group();
  puffs.userData.noCull = true;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const parts = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2 + Math.random() * 0.3;
    const m = new THREE.Mesh(geo, mat);
    const r = R * (0.55 + Math.random() * 0.35);
    m.position.set(spot.x + Math.sin(a) * r, spot.y - E.below + 0.4 + Math.random() * 0.6, spot.z + Math.cos(a) * r);
    parts.push({ m, vx: Math.sin(a) * 2.2, vz: Math.cos(a) * 2.2, vy: 1 + Math.random() * 1.5, s: 0.5 + Math.random() * 0.5 });
    puffs.add(m);
  }
  game.scene.add(puffs);
  v.mesh.scale.setScalar(0.2);
  let t = 0;
  const fn = (dt) => {
    t += dt;
    const k = Math.min(1, t / 0.45);
    // overshooting spring 0.2 -> 1
    const s = k >= 1 ? 1 : 1 - 0.8 * Math.exp(-7 * k) * Math.cos(k * 11);
    if (!v.destroyed) v.mesh.scale.setScalar(s);
    for (const p of parts) {
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(p.s * (0.6 + t * 2.6));
    }
    mat.opacity = Math.max(0, 0.9 * (1 - t / 0.8));
    if (t >= 0.8 && !parts.done) {
      parts.done = true;
      game.scene.remove(puffs); geo.dispose(); mat.dispose();
      if (!v.destroyed) v.mesh.scale.setScalar(1);
      // (not while game.frame is iterating the updaters)
      queueMicrotask(() => { const i = game.updaters.indexOf(fn); if (i >= 0) game.updaters.splice(i, 1); });
    }
  };
  game.updaters.push(fn);
  const a = game.audio, pos = { x: spot.x, y: spot.y, z: spot.z };
  a?.play('swish', pos, 1);
  a?.play('pop', pos, 1);
  try {
    if (a?.ctx && a.ctx.state === 'running') {
      const g = a.gainAt ? a.gainAt(pos) : 1;
      a.burst(0.35, 0.22 * g, 1400, 0.7, 'bandpass', 0, a.sfx, 300);
      [784, 1175].forEach((f, i) => a.tone('triangle', f, f * 1.02, 0.12, 0.08 * g, 0.08 + i * 0.07));
    }
  } catch (e) { /* sound is optional */ }
}
