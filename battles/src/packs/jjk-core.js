// Jujutsu Kaisen faction: shared core (the characters live in jjk-*.js).
//
// What the character files build on:
//  - the faction (id 'jjk') and the unit id prefix 'jk_'
//  - domains: openDomain() raises a dome where the owner's sure-hit lands on every
//    enemy inside. A closed domain (the default) has a real barrier: a ring of wall
//    colliders units can't walk through, units inside stay in (flyers too), and
//    projectiles stop at the dome's surface either way. An open domain (Sukuna's
//    Malevolent Shrine: barrier: false) has no barrier and a bigger reach.
//    Two enemy domains that overlap clash: the higher power wins (an open domain gets
//    +1 against a barrier: it cuts from outside), the loser's collapses and its owner
//    burns out; a tie collapses both. After a domain its owner is burnt out for a while
//    (u.jkBurnout = until when): no technique, see burntOut().
//  - seal(): the Prison Realm - a unit frozen in a cube, untouchable, for t seconds
//  - Infinity: units with u.jkInfinity = true (Gojo) stop blows and shots short of them
//    unless the attacker has u.jkPierce (Toji's Inverted Spear of Heaven) - enforced
//    for every hit by the Unit.hit wrapper below (call ensureHitHook() in a kind's
//    init so it is in place from the first step); infinityBlocks() for your own checks
//  - u.jkNoCE (Toji, Maki): no cursed energy - sure-hits don't find them
//  - secrets: onSecret(fn) runs fn(b, dt) every step; announce() shows the banner
//    ("SECRET: Meguna!") in the battle and in its replay
// Everything drawn is a marker or a projectile, so replays show it.
import { register } from '../ext.js';
import { THREE, clamp, rand, PART, newId } from './common.js';
import { RAPIER, GROUPS } from '../physics.js';
import { Unit } from '../unit.js';

export const FACTION = { id: 'jjk', name: 'Jujutsu Kaisen', color: '#2b2f6b' };
const UPY = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// ------------------------------------------------------------------ per-battle state
const STATE = new WeakMap();
export function jk(b) {
  let s = STATE.get(b);
  if (!s) STATE.set(b, (s = { domains: [], sealed: [], secrets: new Set() }));
  return s;
}
const SECRETS = [];
// fn(b, dt) runs every battle step (cross-character secret interactions)
export function onSecret(fn) { SECRETS.push(fn); }
// the banner over the battle (also in the replay); once per battle per key if `once`
export function announce(b, text, pos, once = null) {
  const s = jk(b);
  if (once) { if (s.secrets.has(once)) return false; s.secrets.add(once); }
  b.emit('announce', pos ? pos.x : 0, pos ? pos.y : 0, pos ? pos.z : 0, text);
  return true;
}
export const enemyOf = (u, v) => v && v.alive && v.team !== u.team;
export const isA = (v, id) => !!v && v.alive && (v.def.id === id || v.jkAs === id);
export const burntOut = (u) => (u.jkBurnout || 0) > u.battle.time;

// ------------------------------------------------------------------ domains
// o: { name, radius, duration, power (1-10), barrier (true), tick (s between
//      sure-hits), sureHit(b, dom, v) for each enemy inside per tick, step(b, dom, dt),
//      onClose(b, dom, why), burnout (s, default 6), marker (a pack projectile type
//      drawn at the centre for the duration: build it with domeMesh), at (centre,
//      default the owner's feet) }
// Returns the domain (null if a clash kills it at once).
export function openDomain(b, owner, o) {
  ensureHitHook();
  const s = jk(b);
  const at = (o.at || owner.pos).clone();
  at.y = b.terrain.height(at.x, at.z);
  const dom = {
    id: newId(), owner, team: owner.team, name: o.name, pos: at, R: o.radius, t: o.duration,
    power: o.power ?? 5, barrier: o.barrier !== false, tick: o.tick ?? 0.5, tickT: 0.2,
    sureHit: o.sureHit, step: o.step, onClose: o.onClose, burnout: o.burnout ?? 6, cols: [],
    inside: new Set(), mk: null, data: {},
  };
  // a clash with an enemy domain that overlaps this one
  for (const d of [...s.domains]) {
    if (d.team === dom.team || d.pos.distanceTo(dom.pos) > d.R + dom.R) continue;
    const pa = dom.power + (dom.barrier ? 0 : 1) - (d.barrier ? 0 : 0);
    const pb = d.power + (d.barrier ? 0 : 1);
    const mid = _a.copy(d.pos).add(dom.pos).multiplyScalar(0.5);
    mid.y += 2;
    b.emit('spark', mid.x, mid.y, mid.z, 20);
    b.sound('boom', mid, 1.2, 0.6);
    if (pa > pb) { announce(b, `Domain clash: ${dom.name} overwhelms ${d.name}!`, mid); closeDomain(b, d, 'clash'); }
    else if (pb > pa) { announce(b, `Domain clash: ${d.name} overwhelms ${dom.name}!`, mid); owner.jkBurnout = b.time + dom.burnout; return null; }
    else { announce(b, `Domain clash: ${dom.name} and ${d.name} cancel out!`, mid); closeDomain(b, d, 'clash'); owner.jkBurnout = b.time + dom.burnout; return null; }
  }
  if (o.marker) dom.mk = markerAt(b, o.marker, at, o.duration);
  for (const v of b.units) if (v.alive && flat(v.pos, at) < dom.R) dom.inside.add(v);
  if (dom.barrier) buildBarrier(b, dom);
  s.domains.push(dom);
  b.emit('spark', at.x, at.y + 1, at.z, 14);
  b.sound('gong', at, 1.0, 0.5);
  if (owner.alive) b.voice(owner, 'attack', true);
  announce(b, `Domain Expansion: ${o.name}`, at);
  return dom;
}
export function closeDomain(b, dom, why = 'end') {
  const s = jk(b), i = s.domains.indexOf(dom);
  if (i < 0) return;
  s.domains.splice(i, 1);
  for (const c of dom.cols) b.world.removeCollider(c, true);
  dom.cols.length = 0;
  if (dom.mk) dom.mk.t = 0;
  dom.owner.jkBurnout = b.time + dom.burnout;
  dom.onClose?.(b, dom, why);
  const p = dom.pos;
  b.emit('spark', p.x, p.y + 1.5, p.z, 10);
  if (why === 'clash' || why === 'broken') b.sound('debris', p, 1.0, 0.7);
}
// the enemy domain (if any) whose barrier/reach covers this point
export function domainAt(b, pos) {
  for (const d of jk(b).domains) if (flat(pos, d.pos) < d.R) return d;
  return null;
}
const flat = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
function buildBarrier(b, dom) {
  // a ring of thin walls (the dome's lower half is a cylinder for bodies; flyers are
  // held in by stepDomains)
  const N = 32, R = dom.R, H = Math.min(R * 0.8, 7), half = R * Math.sin(Math.PI / N) + 0.08;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const x = dom.pos.x + Math.sin(a) * R, z = dom.pos.z + Math.cos(a) * R;
    const q = new THREE.Quaternion().setFromAxisAngle(UPY, a);
    const desc = RAPIER.ColliderDesc.cuboid(half, H / 2, 0.15)
      .setTranslation(x, b.terrain.height(x, z) + H / 2 - 0.3, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.3).setCollisionGroups(GROUPS.ground);
    dom.cols.push(b.world.createCollider(desc));
  }
}
function stepDomains(b, dt) {
  const s = jk(b);
  for (let i = s.domains.length - 1; i >= 0; i--) {
    const d = s.domains[i];
    d.t -= dt;
    if (d.t <= 0 || !d.owner.alive || d.owner.jkSealedT > b.time) { closeDomain(b, d, d.owner.alive ? 'end' : 'owner'); continue; }
    d.step?.(b, d, dt);
    // units inside a barrier stay in (flyers above the walls too)
    if (d.barrier) {
      for (const v of d.inside) {
        if (!v.alive) continue;
        const c = v.chestPos, r = flat(c, d.pos);
        if (r > d.R - 0.6 && r > 0.01) {
          const k = Math.min(1, (r - d.R + 0.6) * 2) * v.M * 6 * dt;
          v.rag?.impulseAll((d.pos.x - c.x) / r * k, 0, (d.pos.z - c.z) / r * k);
        }
      }
      // projectiles stop at the dome
      for (const pr of b.projectiles) {
        const r0 = flat(pr.prev, d.pos), r1 = flat(pr.pos, d.pos);
        if ((r0 < d.R) !== (r1 < d.R) && pr.pos.y - d.pos.y < d.R) {
          pr.life = -1;
          b.emit('spark', pr.pos.x, pr.pos.y, pr.pos.z, 3);
        }
      }
    }
    d.tickT -= dt;
    if (d.tickT > 0 || !d.sureHit) continue;
    d.tickT = d.tick;
    for (const v of b.units) {
      if (!enemyOf(d.owner, v) || v.jkNoCE || v.jkSealedT > b.time) continue;
      if (flat(v.pos, d.pos) > d.R + v.skel.radius) continue;
      d.sureHit(b, d, v);
    }
  }
}
// a marker at a world point (pack projectile type, drawn for t seconds)
export function markerAt(b, type, pos, t, yaw = 0) {
  const s = { type, unit: null, part: -1, pos: pos.clone(), quat: new THREE.Quaternion().setFromAxisAngle(UPY, yaw), t, id: newId() };
  b.stuck.push(s);
  return s;
}
// a marker riding on a unit part
export function markerOn(b, u, type, part = PART.chest, t = 9999, lp = null) {
  const s = { type, unit: u, part, lp: lp || new THREE.Vector3(), lq: new THREE.Quaternion(), pos: u.rag.pos[part].clone(), quat: u.rag.quat[part].clone(), t, id: newId() };
  b.stuck.push(s);
  return s;
}
// A dome mesh for a domain marker: a translucent shell of radius R tinted `color`,
// with a darker band at the base (build at the domain's radius).
export function domeMesh(H, g, R, color, opacity = 0.35, rim = null) {
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  shell.castShadow = false; shell.renderOrder = 4; g.add(shell);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.002, R * 1.002, 0.5, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: rim || color, transparent: true, opacity: Math.min(1, opacity * 2), side: THREE.DoubleSide, depthWrite: false }));
  band.position.y = 0.25; band.castShadow = false; g.add(band);
  return shell;
}

// ------------------------------------------------------------------ summons
// Summons are reserves: list them on the summoner's def (reserve: [{ type, n }]); the
// battle makes them dormant with the army. summon() brings a dormant one of `type`
// into play at `at` (on the ground) for the summoner's current team; dismiss() sends
// it back (it can be summoned again). Returns the unit, or null if none is left.
export function summon(b, owner, type, at, yaw = owner.heading) {
  const s = b.units.find((x) => x.reserveOf === owner && x.def.id === type && x.dormant);
  if (!s) return null;
  const gy = b.terrain.height(at.x, at.z);
  const dx = at.x - s.pos.x, dy = gy + s.skel.standHeight + 0.05 - s.pos.y, dz = at.z - s.pos.z;
  const bodies = [...s.rag.bodies, ...s.extras.map((e) => e.body).filter(Boolean)];
  for (const bd of bodies) {
    const t = bd.translation();
    bd.setTranslation({ x: t.x + dx, y: t.y + dy, z: t.z + dz }, false);
    bd.setLinvel({ x: 0, y: 0, z: 0 }, false);
    bd.setAngvel({ x: 0, y: 0, z: 0 }, false);
    bd.setEnabled(true);
    bd.wakeUp();
  }
  s.rag.read();
  s.dormant = false; s.alive = true; s.hp = s.maxHp;
  s.stun = 0; s.target = null; s.st.attack = null; s.heading = yaw;
  s.team = owner.team;
  b.teams[s.team].push(s);
  b.emit('spark', at.x, gy + 0.5, at.z, 8);
  b.emit('dust', at.x, gy, at.z, 3);
  return s;
}
// (a copy of battle.js park(): a pack must not import battle.js, or battle.js runs before
// the packs after it have registered their projectile types)
export function park(u) {
  u.dormant = true;
  u.alive = false;
  for (const bd of u.rag.bodies) bd.setEnabled(false);
  for (const e of u.extras) e.body?.setEnabled(false);
}
export function dismiss(b, s) {
  if (s.dormant) return;
  for (const t of b.teams) { const i = t.indexOf(s); if (i >= 0) t.splice(i, 1); }
  const c = s.chestPos;
  b.emit('dust', c.x, c.y - 0.5, c.z, 3);
  park(s);
}
// a unit changes sides mid-battle (Meguna)
export function switchTeam(b, u, team) {
  if (u.team === team) return;
  const i = b.teams[u.team].indexOf(u);
  if (i >= 0) b.teams[u.team].splice(i, 1);
  u.team = team;
  b.teams[team].push(u);
  u.target = null;
}

// ------------------------------------------------------------------ Infinity
// true when Infinity stops this attack on v (the attacker has no way through)
export function infinityBlocks(v, attacker) {
  return !!v && v.jkInfinity && !(attacker && attacker.jkPierce) && !(v.jkSealedT > v.battle.time);
}
// Every hit goes through Unit.hit: a sealed unit takes nothing, and Infinity stops
// any blow, shot or blast (a ripple where it stopped) unless the attacker pierces it.
// Sure-hits (kind 'domain') and the unit's own Infinity off-time get through.
// (installed on first use: unit.js is still loading when this module runs)
let hit0 = null;
export function ensureHitHook() {
  if (hit0) return;
  hit0 = Unit.prototype.hit;
  Unit.prototype.hit = jkHit;
}
function jkHit(amount, part, ix, iy, iz, attacker, kind) {
  if (this.jkSealedT > this.battle.time) return;
  if (this.jkInfinity && kind !== 'domain' && attacker !== this && infinityBlocks(this, attacker)) {
    const c = this.chestPos;
    if (Math.random() < 0.5) this.battle.emit('spark', c.x, c.y, c.z, 2);
    this.jkStopped = (this.jkStopped || 0) + amount; // (Gojo's file can show it)
    return;
  }
  return hit0.call(this, amount, part, ix, iy, iz, attacker, kind);
}

// ------------------------------------------------------------------ Prison Realm
// seal v for t seconds: frozen in a cube, can't act, nothing hurts it
export function seal(b, v, t) {
  ensureHitHook();
  if (!v.alive) return;
  v.jkSealedT = b.time + t;
  v.jkSealHp = v.hp;
  jk(b).sealed.push(v);
  v.jkSealMk = markerOn(b, v, 'jk_prison', PART.chest, t);
  b.emit('spark', v.chestPos.x, v.chestPos.y, v.chestPos.z, 12);
  b.sound('gong', v.chestPos, 1.2, 0.3);
}
function stepSealed(b) {
  const s = jk(b);
  for (let i = s.sealed.length - 1; i >= 0; i--) {
    const v = s.sealed[i];
    if (!v.alive || v.jkSealedT <= b.time) { s.sealed.splice(i, 1); continue; }
    v.hp = Math.max(v.hp, v.jkSealHp);
    v.stun = Math.max(v.stun, 0.3);
    v.st.attack = null;
    if (v.desired) v.desired.set(0, 0, 0);
  }
}

register({
  factions: [FACTION],
  proj: {
    jk_prison: { g: 0, len: 0, r: 0, life: 1 }, // the Prison Realm cube around a sealed unit
  },
  buildProj(type, g, H) {
    if (type === 'jk_prison') {
      const m = H.mat('#3a2f2a', { spec: 0.3 });
      const box = H.mesh(H.box(1.1, 1.6, 1.1), H.mat('#5c4a3e', { transparent: true, opacity: 0.55 }), 0, 0, 0, g);
      box.castShadow = false;
      for (const x of [-0.55, 0.55]) for (const z of [-0.55, 0.55]) H.mesh(H.box(0.08, 1.64, 0.08), m, x, 0, z, g);
      // the eye on its face
      H.mesh(H.sphere(0.12, 10, 8), H.mat('#f2efe6'), 0, 0.2, 0.56, g);
      H.mesh(H.sphere(0.06, 8, 6), H.mat('#1a1010'), 0, 0.2, 0.62, g);
      return true;
    }
    return false;
  },
  battleStep(b, dt) {
    ensureHitHook();
    const s = STATE.get(b);
    for (const f of SECRETS) f(b, dt);
    if (!s) return;
    if (s.domains.length) stepDomains(b, dt);
    if (s.sealed.length) stepSealed(b);
  },
});

export { THREE, clamp, rand, PART, newId, _b as _tmp };
