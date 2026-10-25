// Secret, the joke units: Chicken Man (throws chickens that hop after enemies and
// peck), Banana Thrower (enemies who step on a peel slip and fall),
// Bomb on a Stick (runs in and blows up), Cheerleader (cheers allies on: faster, harder
// hitting, no panic, a little healing), Lightning Gun (arcs that chain through a group),
// Ullr (a skiing archer god: frost volleys slow, three hits freeze solid).
import { register } from '../ext.js';
import {
  THREE, rand, PART, EXPR, rangedThink, crossed, aimPoint, launchVel, addProjectile,
  strike, blast, addStatus, arrowProj, arrowMesh, torus, tube, dome, headBand, tcol, tdark, chestShell, hoodGeo,
} from './common.js';
import { UPY, mark, markAt, refreshBeam, supportMove } from './ges-core.js';

const _p = new THREE.Vector3(), _o = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const YEL = '#ffd93a';

// ------------------------------------------------------------------ per-battle state
const STATE = new WeakMap();
function S(b) {
  let s = STATE.get(b);
  if (!s) STATE.set(b, (s = { peels: [] }));
  return s;
}

// ------------------------------------------------------------------ chickens
// A thrown chicken lands and hops after the nearest enemy, pecking its ankles until
// it runs out of steam. (A projectile, so it is recorded and replayed like one; its
// type is switched to the thrower's team on the first step so it wears their scarf.)
function chickenStep(b, pr, dt) {
  if (!pr.ck) {
    pr.ck = true;
    pr.type = 'sc_chicken' + pr.team;
    pr.peckT = 0; pr.tgtT = 0;
    if (Math.random() < 0.6) b.sound('pop', pr.pos, 0.35, 2.4);
  }
  const gy = b.terrain.height(pr.pos.x, pr.pos.z);
  // never let the core bounce it: the chicken lands on its feet
  if (pr.pos.y < gy + 0.12) {
    pr.pos.y = gy + 0.12;
    if (pr.vel.y < 0) { pr.vel.y = 0; pr.vel.x *= 0.3; pr.vel.z *= 0.3; }
    pr.landed = true;
  }
  if (pr.landed) {
    pr.tgtT -= dt;
    if (!pr.tgt || !pr.tgt.alive || pr.tgtT <= 0) {
      pr.tgtT = 0.8;
      let best = null, bd = 14 * 14;
      b.grid.query(pr.pos.x, pr.pos.z, 14, (v) => {
        if (v.team === pr.team || !v.alive) return;
        const d = (v.pos.x - pr.pos.x) ** 2 + (v.pos.z - pr.pos.z) ** 2;
        if (d < bd) { bd = d; best = v; }
      });
      pr.tgt = best;
    }
    const t = pr.tgt;
    const grounded = pr.pos.y < gy + 0.14;
    if (t) {
      const dx = t.pos.x - pr.pos.x, dz = t.pos.z - pr.pos.z, d = Math.hypot(dx, dz);
      const close = d < t.skel.radius + 0.55;
      if (grounded && pr.vel.y <= 0) {
        const sp = close ? 0.5 : rand(2.8, 4.2);
        pr.vel.set(dx / (d || 1) * sp, close ? rand(1.2, 2) : rand(2.2, 3.2), dz / (d || 1) * sp);
      }
      pr.peckT -= dt;
      if (close && pr.peckT <= 0 && Math.abs(pr.pos.y - (t.pos.y - t.skel.standHeight * 0.6)) < 1.2 * t.s) {
        pr.peckT = 0.45;
        const part = Math.random() < 0.5 ? PART.shinL : PART.shinR;
        _d.set(dx / (d || 1), 0.2, dz / (d || 1));
        t.hit(pr.damage, part, _d.x * 6, 2, _d.z * 6, pr.owner && pr.owner.alive ? pr.owner : null, 'peck');
        const c = t.rag.pos[part];
        b.emit('blood', c.x, c.y, c.z, 2, _d.x, _d.z);
        if (Math.random() < 0.5) b.sound('pop', c, 0.3, rand(2.2, 2.8));
        if (Math.random() < 0.15) b.sound('stab', c, 0.25, 1.6);
      }
    } else if (grounded && pr.vel.y <= 0) pr.vel.set(rand(-1, 1), rand(1.5, 2.5), rand(-1, 1));
  }
  // upright, facing where it hops
  const yaw = Math.atan2(pr.vel.x, pr.vel.z);
  if (pr.vel.x * pr.vel.x + pr.vel.z * pr.vel.z > 0.01) pr.quat.setFromAxisAngle(UPY, yaw);
  // tired chickens wander off (fade out when the life runs out)
  if (pr.life < 0.6 && Math.random() < 0.1) b.emit('dust', pr.pos.x, gy, pr.pos.z, 0.5);
}
const CHICKEN = { g: 9.81, len: 0, r: 0.2, life: 9, step: chickenStep, hit: () => false, ground: () => false };

// ------------------------------------------------------------------ bananas
function dropPeel(b, pos, owner) {
  const gy = b.terrain.height(pos.x, pos.z);
  _p.set(pos.x, gy + 0.02, pos.z);
  const s = S(b);
  if (s.peels.length > 60) { const old = s.peels.shift(); old.mk.t = 0; }
  s.peels.push({ pos: _p.clone(), mk: markAt(b, 'sc_peel', _p, 40), owner, team: owner.team, t: 40, arm: 0.2 });
}
function stepPeels(b, dt) {
  const s = STATE.get(b);
  if (!s || !s.peels.length) return;
  for (let i = s.peels.length - 1; i >= 0; i--) {
    const pl = s.peels[i];
    pl.t -= dt; pl.arm -= dt;
    if (pl.t <= 0) { s.peels.splice(i, 1); continue; }
    if (pl.arm > 0) continue;
    let slipped = null;
    b.grid.query(pl.pos.x, pl.pos.z, 1.5, (v) => {
      if (slipped || !v.alive || v.team === pl.team || v.s > 1.6 || v.extras.length || v.sm) return;
      const p = v.pos, dx = p.x - pl.pos.x, dz = p.z - pl.pos.z;
      if (dx * dx + dz * dz > (0.35 + 0.25 * v.s) ** 2 || v.groundGap() > 0.25 * v.s || v.stun > 0.3) return;
      const vel = v.rag.vel[PART.pelvis], hs = Math.hypot(vel.x, vel.z);
      if (hs < 1.0) return;
      slipped = v;
    });
    if (!slipped) continue;
    // whoops: feet fly forward, the body goes over backwards
    const v = slipped, M = v.M, vel = v.rag.vel[PART.pelvis], hs = Math.hypot(vel.x, vel.z);
    const fx = vel.x / hs, fz = vel.z / hs;
    for (const part of [PART.shinL, PART.shinR, PART.thighL, PART.thighR]) v.rag.impulse(part, fx * M * 0.09, M * 0.12, fz * M * 0.09);
    v.rag.impulse(PART.chest, -fx * M * 0.12, 0, -fz * M * 0.12);
    v.rag.impulse(PART.head, -fx * M * 0.03, 0, -fz * M * 0.03);
    v.stun = Math.max(v.stun, 1.6 * (v.def.stagger ?? 1) + 0.4);
    const own = pl.owner && pl.owner.alive ? pl.owner : null;
    v.hit(10, PART.pelvis, 0, 0, 0, own, 'slip');
    b.sound('thud', v.pos, 0.8, 0.8);
    b.sound('pop', v.pos, 0.5, 1.7);
    b.voice(v, 'scream');
    b.emit('dust', pl.pos.x, pl.pos.y, pl.pos.z, 1);
    pl.mk.t = 0;
    s.peels.splice(i, 1);
  }
}

// ------------------------------------------------------------------ kinds
// Bomb on a Stick: sprints at the enemy and blows up in their face. If it is killed
// first, the bomb goes off where it falls.
function bombAt(u) {
  return u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0, _o).addScaledVector(_v.set(0, -0.5, 0.866).applyQuaternion(u.rag.quat[PART.farmR]), 1.23 * u.s);
}
function boom(u, pos) {
  const b = u.battle, w = u.def.weapon;
  blast(b, pos, w.blast, w.damage, w.force, u, { fx: 0, friendly: 0.5, vol: 1.2 });
  b.sound('debris', pos, 0.6, 1.2);
}
// the stick (and what is left of the bomb) is blown to bits: its dropped body is put
// away under the ground so neither the live view nor the replay shows it again
function scrapStick(u) {
  for (const h of u.held) {
    if (!h.body) continue;
    h.pos.set(u.pos.x, -60, u.pos.z);
    h.body.setTranslation(h.pos, false);
    h.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    h.body.sleep();
  }
}
const bombStick = {
  init(u) { u.fuseT = 0; },
  think(u, dt, c) {
    const { t, dirx, dirz, spd } = c;
    u.expr = EXPR.happy;
    u.desired.set(dirx * spd, 0, dirz * spd);
    return t;
  },
  step(u, dt) {
    const b = u.battle;
    u.fuseT -= dt;
    const p = bombAt(u);
    if (u.fuseT <= 0) { u.fuseT = 0.1; b.emit('fuse', p.x, p.y + 0.15, p.z); }
    // goes off on touching an enemy (AI or possessed)
    if (u.boomed || u.stun > 0.3) return;
    let hit = false;
    b.grid.query(p.x, p.z, 3, (v) => {
      if (hit || v.team === u.team || !v.alive) return;
      if (v.chestPos.distanceTo(p) < v.skel.radius + 0.7 || Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z) < v.skel.radius + u.skel.radius + 0.35) hit = true;
    });
    if (!hit) return;
    u.boomed = true;
    boom(u, p.clone());
    u.hp = 0;
    u.die(null);
    scrapStick(u);
  },
  die(u) {
    if (u.boomed) return;
    u.boomed = true;
    const b = u.battle;
    b.delayed.push([0.45, () => { const p = u.chestPos.clone(); p.y += 0.2; boom(u, p); scrapStick(u); }]);
  },
};

// Cheerleader: keeps behind the line cheering, which inspires every ally around.
const cheer = {
  init(u) { u.jumpT = rand(0, 2); u.aura = 0; },
  think(u, dt, c) {
    const busy = supportMove(u, c, 3.5);
    if (!busy) { u.st.mode = 'cheer'; u.expr = EXPR.happy; }
    if (!u.battle.allyAnchor(u) && c.gap < 2 && u.cooldown <= 0 && !u.st.attack) u.startAttack('punchy');
    return c.gap < 8 ? c.t : null;
  },
  step(u, dt) {
    const bt = u.battle, w = u.def.weapon, p = u.pos, R2 = w.auraRadius ** 2;
    for (const o of bt.teams[u.team]) {
      if (!o.alive || o === u) continue;
      if ((o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 > R2) continue;
      o.buff = Math.max(o.buff, 0.5);
      o.fleeT = 0;
      if (o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + w.regen * dt);
    }
    u.jumpT -= dt;
    if (u.jumpT <= 0 && u.st.mode === 'cheer' && u.groundGap() < 0.15 && u.stun <= 0) {
      u.jumpT = rand(1.6, 2.6);
      u.rag.impulseAll(0, u.M * 4.2, 0);
      for (const part of [PART.farmL, PART.farmR]) { const h = u.rag.pos[part]; bt.emit('spark', h.x, h.y, h.z, 3); }
      if (Math.random() < 0.3) bt.voice(u, 'cheer');
      const h = u.headPos;
      bt.emit('note', h.x, h.y + 0.3, h.z, u.team ? 1 : 2);
    }
  },
};

// Lightning Gun: a crackling arc jumps from the gun to the target and on through up
// to `chain` more enemies nearby.
const zap = {
  init(u) { u.attackDur = u.def.weapon.windup; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon, bt = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    let t = u.aimAt && u.aimAt.alive ? u.aimAt : null;
    // the muzzle: in front of the hands
    u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset - 0.75 * u.s, 0, _o);
    if (!t) {
      // possessed: the nearest enemy in front within range
      let bd = w.range * w.range;
      for (const v of bt.units) {
        if (!v.alive || v.team === u.team) continue;
        const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = dx * dx + dz * dz;
        if (d < bd && (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) > Math.sqrt(d) * 0.8) { bd = d; t = v; }
      }
      if (!t) return;
    }
    const hit = new Set();
    let from = _o.clone(), dmg = w.damage;
    bt.sound('clang', from, 0.9, 2.6);
    bt.sound('fire', from, 0.6, 2.0);
    for (let k = 0; k <= w.chain && t; k++) {
      hit.add(t);
      const to = t.chestPos.clone();
      const beam = {};
      refreshBeam(bt, beam, u, from, to, 'sc_arc', 0.7, 0.22);
      for (const s of beam.segs) s.t = 0.16;
      _d.copy(to).sub(from).normalize();
      strike(bt, t, dmg, _d, w.force, u, 'zap', PART.chest, null);
      t.stun = Math.max(t.stun, 0.6 * (t.def.stagger ?? 1));
      bt.emit('spark', to.x, to.y, to.z, 8);
      // next: the nearest enemy close to this one not hit yet
      let next = null, bd = w.jump * w.jump;
      bt.grid.query(to.x, to.z, w.jump + 1, (v) => {
        if (!v.alive || v.team === u.team || hit.has(v)) return;
        const d = v.chestPos.distanceToSquared(to);
        if (d < bd) { bd = d; next = v; }
      });
      from = to; t = next; dmg *= 0.75;
    }
  },
};

// Ullr: skis about at a distance and looses volleys of frost arrows; each hit chills,
// and an enemy hit three times in quick succession freezes solid for a moment.
const ullr = {
  init(u) { u.attackDur = u.def.weapon.windup; },
  think: rangedThink,
  event(u, t0, t1) {
    const w = u.def.weapon, bt = u.battle;
    if (!crossed(t0, t1, w.releaseAt)) return;
    u.released = true;
    u.rag.worldPoint(PART.farmR, 0, -u.skel.handOffset, 0, _o);
    aimPoint(u, _p, 0.7, 0.5);
    for (let i = 0; i < w.volley; i++) {
      launchVel(_o, _p, w.speed, 9.81, false, w.spread * (i ? 2.2 : 0.6), _v);
      addProjectile(bt, 'sc_frost_arrow', _o, _v, u, { life: 8 });
    }
    bt.sound('bow', _o, 0.9, 0.8);
  },
};
function frostHit(bt, v, pr) {
  addStatus(bt, v, 'slow', 3.5, 0, pr.owner);
  const now = bt.time;
  if (!v.scFrost || now - v.scFrost.t > 3) v.scFrost = { n: 0, t: now };
  v.scFrost.n++; v.scFrost.t = now;
  if (v.scFrost.n >= 3 && v.alive) {
    v.scFrost.n = 0;
    const dur = 2.4 / Math.max(1, Math.sqrt(v.s));
    v.stun = Math.max(v.stun, dur);
    mark(bt, v, 'sc_iceblock', PART.chest, dur);
    bt.sound('clang', v.chestPos, 0.8, 1.6);
    bt.emit('spark', v.chestPos.x, v.chestPos.y, v.chestPos.z, 6);
  }
}

// ------------------------------------------------------------------ units
const units = [
  {
    id: 'sc_banana', name: 'Banana Thrower', faction: 'secret', cost: 60, hp: 85, speed: 4.6,
    build: { scale: 0.95, girth: 1.05, head: 1.05 },
    weapon: { line: 'Ranged · enemies who step on its peels slip and fall', kind: 'ranged', style: 'throw', anim: 'throw', item: 'sc_banana_hand', proj: 'sc_banana', speed: 13, arc: 'high', range: 22, minRange: 5, cooldown: 1.8, damage: 28, force: 90, spread: 0.07, releaseAt: 0.7, windup: 0.8 },
    look: { skin: '#f2c8a0', hat: 'sc_banana_hood', top: 'sc_banana_suit', legs: '#e8c02a' },
    personality: { aggro: 0.35, bravery: 0.3, voice: 1.4, chatter: 0.9, cry: 'yip', idle: 'bounce' },
    desc: 'Lobs bananas and leaves the peels lying about. Mind your step.',
  },
  {
    id: 'sc_cheerleader', name: 'Cheerleader', faction: 'secret', cost: 80, hp: 80, speed: 5.0,
    build: { scale: 0.92, girth: 0.92, head: 1.08 },
    weapon: { line: 'Support · cheers nearby allies on: faster, harder, braver', kind: 'sc_cheer', style: 'dual', anim: 'punch', item: 'sc_pompom', item2: 'sc_pompom', damage: 6, reach: 0.9, cooldown: 1.0, force: 60, auraRadius: 9, regen: 4 },
    look: { skin: '#f6d2b4', hat: 'sc_ponytail', top: 'sc_cheer', legs: '#f4f0ea' },
    personality: { aggro: 0.05, bravery: 0.5, voice: 1.6, chatter: 1, cry: 'yip', idle: 'hop' },
    desc: 'Gimme a W! Allies nearby fight faster, hit harder and never run.',
  },
  {
    id: 'sc_bomb_stick', name: 'Bomb on a Stick', faction: 'secret', cost: 100, hp: 70, speed: 6.4,
    build: { scale: 0.9, girth: 0.95, head: 1.1 },
    weapon: { line: 'Kamikaze · runs in and explodes', kind: 'sc_bombstick', style: 'sword', anim: 'overhead', item: 'sc_bomb_stick', damage: 100, blast: 2.8, force: 650, reach: 1.0, cooldown: 1.0 },
    look: { skin: '#f2c8a0', hat: 'sc_bandana', top: 'sc_rags', legs: '#5a4630' },
    personality: { aggro: 1, bravery: 0, voice: 1.5, chatter: 1, cry: 'cackle', idle: 'bounce' },
    desc: 'Has a bomb. On a stick. Will deliver it personally.',
  },
  {
    id: 'sc_chicken_man', name: 'Chicken Man', faction: 'secret', cost: 200, hp: 110, speed: 4.4,
    build: { scale: 1.0, girth: 1.08, head: 1.05 },
    weapon: { line: 'Ranged · throws chickens that hop after enemies and peck', kind: 'ranged', style: 'throw', anim: 'throw', item: 'sc_chicken_hand', proj: 'sc_chicken', speed: 11, arc: 'low', range: 18, minRange: 3, cooldown: 1.7, damage: 6, force: 30, spread: 0.08, releaseAt: 0.7, windup: 0.7 },
    look: { skin: '#f2c8a0', hat: 'sc_chicken_head', top: 'sc_feathers', legs: '#f4c23a' },
    personality: { aggro: 0.4, bravery: 0.2, voice: 1.7, chatter: 1, cry: 'cackle', idle: 'hop' },
    desc: 'Throws chickens. The chickens are angry about it.',
  },
  {
    id: 'sc_lightning_gun', name: 'Lightning Gun', faction: 'secret', cost: 490, hp: 140, speed: 4.2,
    build: { scale: 1.0, girth: 1.0, head: 1.05 },
    weapon: { line: 'Ranged · lightning arcs chain through groups', kind: 'sc_zap', style: 'spear', anim: 'punch', item: 'sc_tesla', damage: 52, range: 16, minRange: 4, cooldown: 2.4, force: 260, releaseAt: 0.5, windup: 0.6, chain: 3, jump: 4.5 },
    look: { skin: '#f2c8a0', hat: 'sc_goggles', top: 'sc_labcoat', legs: '#3a3a44' },
    personality: { aggro: 0.35, bravery: 0.3, voice: 1.15, chatter: 0.7, cry: 'cackle', idle: 'shake' },
    desc: 'Science! Lightning leaps from enemy to enemy.',
  },
  {
    id: 'sc_ullr', name: 'Ullr', faction: 'secret', cost: 800, hp: 480, speed: 5.4,
    build: { scale: 1.15, girth: 1.05, mass: 1.2 },
    weapon: { line: 'Ranged · frost volleys slow; three hits freeze solid', kind: 'sc_ullr', style: 'bow', anim: 'bow', item: 'sc_ullr_bow', speed: 36, range: 40, minRange: 9, cooldown: 2.0, damage: 34, force: 110, spread: 0.035, releaseAt: 0.78, windup: 0.9, volley: 3 },
    look: { skin: '#f0d2c0', hat: 'sc_ullr', top: 'sc_ullr', legs: '#5a6a7a', beard: '#e8f0f4', quiver: true },
    personality: { aggro: 0.3, bravery: 0, voice: 0.75, chatter: 0.5, cry: 'royal', idle: 'regal' },
    armor: 0.15, stagger: 0.5,
    desc: 'God of winter and archery, on skis. Freezes whatever he hits three times.',
  },
];

// ------------------------------------------------------------------ visuals
function chickenMesh(H, g, team, k = 1) {
  const { mesh, sphere, cone, box, mat } = H;
  const fe = mat('#fbfaf4');
  mesh(sphere(0.17 * k, 12, 10), fe, 0, 0.05 * k, 0, g).scale.set(0.9, 0.85, 1.15);
  mesh(sphere(0.1 * k, 10, 8), fe, 0, 0.2 * k, 0.12 * k, g);
  mesh(cone(0.035 * k, 0.09 * k, 6), mat('#f4b02a'), 0, 0.19 * k, 0.24 * k, g).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) mesh(sphere(0.03 * k, 6, 5), mat('#e2302a'), 0, (0.29 + (i === 1 ? 0.02 : 0)) * k, (0.08 + i * 0.035) * k, g);
  mesh(sphere(0.025 * k, 6, 5), mat('#e2302a'), 0, 0.13 * k, 0.21 * k, g);
  for (const sd of [-1, 1]) {
    mesh(sphere(0.018 * k, 6, 5), mat('#1a1414'), sd * 0.06 * k, 0.23 * k, 0.19 * k, g);
    const w = mesh(sphere(0.1 * k, 8, 6), mat('#efeadc'), sd * 0.15 * k, 0.06 * k, -0.02 * k, g); w.scale.set(0.3, 0.7, 1.1);
    mesh(H.cyl(0.012 * k, 0.012 * k, 0.12 * k, 4), mat('#f4b02a'), sd * 0.06 * k, -0.1 * k, 0, g);
  }
  const t = mesh(cone(0.08 * k, 0.16 * k, 6), fe, 0, 0.12 * k, -0.2 * k, g); t.rotation.x = -0.8;
  if (team !== null) { const sc = mesh(H.cyl(0.075 * k, 0.085 * k, 0.04 * k, 10), mat(H.TEAM_COLORS[team]), 0, 0.14 * k, 0.1 * k, g); sc.rotation.x = 0.4; }
}

function buildItem(name, s, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, wood, darkWood, leather, glow } = H;
  const tc = tcol(H, team);
  if (name === 'sc_chicken_hand') { const c = new THREE.Group(); chickenMesh(H, c, team, s); c.rotation.x = -Math.PI / 2; c.position.y = 0.05 * s; g.add(c); return true; }
  if (name === 'sc_banana_hand') { mesh(tube(H, 'scban' + s.toFixed(3), [[0, 0, -0.1], [0, 0.12, 0], [0, 0.16, 0.12], [0, 0.1, 0.24]].map((p) => p.map((q) => q * s)), 0.04 * s, 0.02 * s, 8), mat(YEL), 0, 0, 0, g); return true; }
  if (name === 'sc_pompom') { // a fluffy pom-pom in the team colour
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, e = Math.acos(1 - 2 * (i + 0.5) / 14);
      const o = mesh(sphere(0.07 * s, 6, 5), i % 3 ? tc : mat('#ffffff'), Math.sin(e) * Math.cos(a) * 0.1 * s, 0.1 * s + Math.cos(e) * 0.1 * s, Math.sin(e) * Math.sin(a) * 0.1 * s, g);
      o.scale.set(0.7, 1.3, 0.7);
    }
    return true;
  }
  if (name === 'sc_bomb_stick') { // a long stick with a bomb tied to the end, fuse lit
    const L = 1.15 * s;
    mesh(cyl(0.022 * s, 0.026 * s, L, 7), wood(), 0, L / 2, 0, g);
    mesh(cyl(0.03 * s, 0.03 * s, 0.12 * s, 7), tc, 0, 0.12 * s, 0, g);
    mesh(sphere(0.17 * s, 14, 10), mat('#1d1a1a', { spec: 0.4 }), 0, L + 0.08 * s, 0.02 * s, g);
    mesh(sphere(0.04 * s, 6, 5), mat('#ffffff'), 0.06 * s, L + 0.15 * s, 0.13 * s, g);
    mesh(cyl(0.05 * s, 0.055 * s, 0.05 * s, 8), mat('#7d8691', { spec: 0.8 }), 0, L + 0.25 * s, 0.02 * s, g);
    mesh(cyl(0.012 * s, 0.012 * s, 0.1 * s, 4), mat('#c8a060'), 0, L + 0.32 * s, 0.03 * s, g).rotation.x = 0.4;
    mesh(octa(0.035 * s), glow('#ffd040'), 0, L + 0.37 * s, 0.05 * s, g);
    for (const y of [L - 0.05 * s, L - 0.12 * s]) mesh(torus(H, 0.03 * s, 0.008 * s, Math.PI * 2, 8), mat('#c8a46a'), 0, y, 0, g).rotation.x = Math.PI / 2;
    return true;
  }
  if (name === 'sc_tesla') { // a chunky brass gun with copper coils and a glowing orb
    const brass = mat('#c8a050', { spec: 0.9 }), cop = mat('#c87a3a', { spec: 0.8 });
    mesh(box(0.08 * s, 0.16 * s, 0.1 * s), mat('#4a3a2a'), 0, -0.05 * s, 0, g);
    mesh(cyl(0.065 * s, 0.075 * s, 0.6 * s, 10), brass, 0, 0.3 * s, 0, g).rotation.set(0, 0, 0);
    for (let i = 0; i < 4; i++) mesh(torus(H, 0.08 * s, 0.018 * s, Math.PI * 2, 12), cop, 0, (0.12 + i * 0.1) * s, 0, g).rotation.x = Math.PI / 2;
    mesh(sphere(0.09 * s, 12, 10), glow('#9fe8ff'), 0, 0.65 * s, 0, g);
    mesh(cone(0.04 * s, 0.14 * s, 6), cop, 0, 0.78 * s, 0, g);
    mesh(cyl(0.03 * s, 0.03 * s, 0.25 * s, 6), tc, 0.07 * s, 0.25 * s, 0, g);
    return true;
  }
  if (name === 'sc_ullr_bow') { // a big recurve bow of ice and pale wood
    const R = 0.78 * s, half = Math.PI * 0.37;
    const tg = H.geo('scubow' + s.toFixed(3), () => {
      const t = new THREE.TorusGeometry(R, 0.034 * s, 6, 22, half * 2);
      t.rotateZ(-half); t.rotateY(-Math.PI / 2); t.translate(0, 0, -R);
      return t;
    });
    mesh(tg, mat('#e8f4fa', { spec: 0.8, emit: 0.15 }), 0, 0, 0, g);
    mesh(cyl(0.04 * s, 0.04 * s, 0.18 * s, 8), tc, 0, 0, 0, g);
    for (const sd of [-1, 1]) {
      const y = sd * R * Math.sin(half), z = -R * (1 - Math.cos(half));
      const o = mesh(octa(0.08 * s), glow('#9fe8ff'), 0, y, z, g); o.scale.set(0.6, 1.7, 0.6);
    }
    const str = mesh(cyl(0.005 * s, 0.005 * s, 2 * R * Math.sin(half), 3), mat('#f4f4f4'), 0, 0, -R * (1 - Math.cos(half)), g); str.castShadow = false;
    g.userData.bowTips = [new THREE.Vector3(0, R * Math.sin(half), -R * (1 - Math.cos(half))), new THREE.Vector3(0, -R * Math.sin(half), -R * (1 - Math.cos(half)))];
    return true;
  }
  return false;
}

function buildHat(kind, r, team, g, H) {
  const { mesh, cyl, box, sphere, cone, octa, mat, metal, gold, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team);
  switch (kind) {
    case 'sc_chicken_head': { // a chicken mask over the head: beak, comb, wattle
      g.userData.hidesFace = true;
      const fe = mat('#fbfaf4');
      mesh(sphere(r * 1.08, 16, 12), fe, 0, r * 0.05, 0, g);
      const bk = mesh(cone(r * 0.3, r * 0.65, 8), mat('#f4b02a', { spec: 0.4 }), 0, -r * 0.05, r * 1.25, g); bk.rotation.x = Math.PI / 2;
      for (let i = 0; i < 4; i++) mesh(sphere(r * 0.24, 8, 6), mat('#e2302a'), 0, r * (1.0 + (i % 2) * 0.12), r * (0.45 - i * 0.28), g).scale.set(0.5, 1, 0.9);
      mesh(sphere(r * 0.2, 8, 6), mat('#e2302a'), 0, -r * 0.45, r * 1.05, g).scale.set(0.7, 1.3, 0.6);
      for (const sd of [-1, 1]) { mesh(sphere(r * 0.2, 10, 8), mat('#ffffff'), sd * r * 0.42, r * 0.3, r * 0.85, g); mesh(sphere(r * 0.1, 8, 6), mat('#1a1414'), sd * r * 0.45, r * 0.3, r * 1.0, g); }
      headBand(H, r, -0.6, 0.18, tc, g, 0.2);
      return true;
    }
    case 'sc_banana_hood': { // the face poking out of a banana costume
      const ban = mat(YEL, { spec: 0.3 });
      mesh(hoodGeo(H, r, 1.25, 0.95), ban, 0, r * 0.1, -r * 0.05, g);
      mesh(tube(H, 'scbt' + r.toFixed(3), [[0, 1.1, -0.1], [0, 1.6, 0.0], [0, 1.95, 0.25], [0, 2.1, 0.5]].map((p) => p.map((q) => q * r)), r * 0.55, r * 0.12), ban, 0, 0, 0, g);
      mesh(cyl(r * 0.1, r * 0.12, r * 0.25, 6), mat('#5a4020'), 0, r * 2.2, r * 0.58, g).rotation.x = 1.0;
      headBand(H, r, 0.55, 0.14, tc, g, 0.3);
      return true;
    }
    case 'sc_ponytail': { // a high ponytail tied with a big team bow
      const hair = mat('#e8b84a', { spec: 0.3 });
      mesh(sphere(r * 1.04, 16, 12), hair, 0, r * 0.2, -r * 0.14, g).scale.set(1.03, 0.9, 1.0);
      mesh(tube(H, 'scpt' + r.toFixed(3), [[0, 0.95, -0.55], [0, 1.25, -0.95], [0, 0.9, -1.35], [0, 0.3, -1.4]].map((p) => p.map((q) => q * r)), r * 0.3, r * 0.08), hair, 0, 0, 0, g);
      for (const sd of [-1, 1]) { const bw = mesh(sphere(r * 0.25, 8, 6), tc, sd * r * 0.25, r * 1.05, -r * 0.7, g); bw.scale.set(1.2, 0.7, 0.5); }
      mesh(sphere(r * 0.12, 8, 6), tc, 0, r * 1.05, -r * 0.7, g);
      return true;
    }
    case 'sc_bandana': { // a team bandana, knot at the back
      mesh(dome(H, r * 1.05, 0.5), tc, 0, r * 0.2, 0, g).scale.set(1, 0.85, 1);
      headBand(H, r, 0.25, 0.2, td, g, 0.06);
      for (const sd of [-1, 1]) { const t = mesh(box(r * 0.12, r * 0.5, r * 0.2), tc, sd * r * 0.15, r * 0.0, -r * 1.1, g); t.rotation.set(0.4, 0, sd * 0.3); }
      return true;
    }
    case 'sc_goggles': { // wild white hair and big brass goggles
      const hair = mat('#f4f4f4', { spec: 0.05 });
      for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; const o = mesh(cone(r * 0.22, r * 0.75, 6), hair, Math.sin(a) * r * 0.75, r * 0.55, Math.cos(a) * r * 0.65 - r * 0.15, g); o.rotation.set(Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0); }
      headBand(H, r, 0.3, 0.14, leather(), g, 0.04);
      for (const sd of [-1, 1]) { const lr = mesh(cyl(r * 0.26, r * 0.26, r * 0.2, 12), mat('#c8a050', { spec: 0.9 }), sd * r * 0.38, r * 0.3, r * 0.92, g); lr.rotation.x = Math.PI / 2; mesh(sphere(r * 0.2, 10, 8), glow('#9fe8ff'), sd * r * 0.38, r * 0.3, r * 1.02, g).scale.set(1, 1, 0.3); }
      mesh(sphere(r * 0.13, 8, 6), tc, r * 0.98, r * 0.3, 0, g);
      return true;
    }
    case 'sc_ullr': { // a fur hood under a helmet with great curling horns; frosty crown
      const fur = mat('#eef2f4', { spec: 0 });
      mesh(hoodGeo(H, r, 1.15, 1.05), fur, 0, r * 0.06, -r * 0.06, g);
      mesh(dome(H, r * 1.08, 0.45), mat('#c8d4dc', { spec: 0.9 }), 0, r * 0.42, 0, g);
      headBand(H, r, 0.45, 0.18, tc, g, 0.12);
      for (const sd of [-1, 1]) mesh(tube(H, 'scuh' + sd + r.toFixed(3), [[sd * 0.8, 0.75, 0], [sd * 1.45, 1.0, -0.2], [sd * 1.7, 1.55, 0.05], [sd * 1.35, 1.85, 0.4]].map((p) => p.map((q) => q * r)), r * 0.24, r * 0.05), mat('#dfe8ee', { spec: 0.4 }), 0, 0, 0, g);
      for (const [x, y, k] of [[0, 1.3, 1], [-0.35, 1.18, 0.7], [0.35, 1.18, 0.7]]) { const o = mesh(octa(r * 0.2 * k), glow('#9fe8ff'), x * r, y * r, r * 0.2, g); o.scale.set(0.6, 1.6, 0.6); }
      return true;
    }
  }
  return false;
}

function decorate(def, team, vis, H) {
  if (def.faction !== 'secret') return;
  const { parts, skel } = vis;
  const { mesh, sphere, box, cyl, cone, mat, gold, metal, leather, glow } = H;
  const tc = tcol(H, team), td = tdark(H, team), wh = mat('#fbfaf4');
  const ch = skel.parts[PART.chest], r = ch.r, hh = ch.hh, pel = skel.parts[PART.pelvis];
  const C = parts[PART.chest], P = parts[PART.pelvis];
  const top = def.look.top;
  const sleeves = (m, wide = 1.3) => {
    for (const p of [PART.uarmL, PART.farmL, PART.uarmR, PART.farmR]) {
      const sp = skel.parts[p], fore = p === PART.farmL || p === PART.farmR;
      mesh(cyl(sp.r * 1.2, sp.r * (fore ? wide * 1.3 : 1.25), sp.hh * (fore ? 1.6 : 2.0), 10), m, 0, fore ? sp.hh * 0.2 : 0, 0, parts[p]);
    }
  };
  if (top === 'sc_feathers') { // feathery white body, a team belt, wing-ish sleeves
    chestShell(H, ch, wh, C);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, y = (i % 3 - 1) * hh * 0.8; const f = mesh(sphere(r * 0.3, 8, 6), mat('#efeadc'), Math.sin(a) * r * 1.05, y, Math.cos(a) * r * 0.95, C); f.scale.set(0.7, 1.1, 0.25); f.rotation.y = a; }
    mesh(cyl(r * 1.14, r * 1.16, r * 0.18, 14), tc, 0, -hh - r * 0.38, 0, C);
    sleeves(wh, 1.6);
    for (const p of [PART.farmL, PART.farmR]) { const sp = skel.parts[p]; for (let k = 0; k < 3; k++) { const f = mesh(sphere(sp.r * 0.8, 6, 5), wh, 0, -sp.hh * (0.2 + k * 0.4), -sp.r * 1.4, parts[p]); f.scale.set(0.4, 1.3, 1.4); } }
    const tail = mesh(cone(pel.r * 0.6, pel.r * 1.6, 6), wh, 0, pel.r * 0.2, -pel.r * 1.2, P); tail.rotation.x = -2.1;
  }
  if (top === 'sc_banana_suit') { // a yellow banana costume with brown spots
    const ban = mat(YEL, { spec: 0.3 });
    chestShell(H, ch, ban, C, 1.08);
    const sk = mesh(cyl(pel.r * 1.15, pel.r * 1.25, pel.r * 1.6, 14), ban, 0, -pel.r * 0.5, 0, P); sk.scale.set(1, 1, 0.95);
    for (const [x, y, z] of [[0.5, 0.3, 0.9], [-0.6, -0.4, 0.8], [0.2, -0.9, 1.0], [-0.3, 0.8, -0.9], [0.7, -0.5, -0.7]]) mesh(sphere(r * 0.1, 6, 5), mat('#8a6a2a'), x * r, y * r, z * r, C).scale.set(1, 1, 0.3);
    mesh(cyl(r * 1.2, r * 1.22, r * 0.14, 14), tc, 0, -hh - r * 0.38, 0, C);
    sleeves(ban);
  }
  if (top === 'sc_cheer') { // team top with white chevrons and a pleated skirt
    chestShell(H, ch, tc, C);
    for (const sd of [-1, 1]) { const st = mesh(box(r * 0.16, r * 0.9, r * 0.05), wh, sd * r * 0.3, hh * 0.1, r * 1.04, C); st.rotation.z = sd * 0.7; }
    const sk = mesh(cyl(pel.r * 1.1, pel.r * 1.75, pel.r * 1.3, 16), tc, 0, -pel.r * 0.55, 0, P); sk.scale.set(1, 1, 0.95);
    mesh(H.geo('scskirt' + pel.r.toFixed(3), () => new THREE.TorusGeometry(pel.r * 1.72, pel.r * 0.07, 6, 20)), wh, 0, -pel.r * 1.15, 0, P).rotation.x = Math.PI / 2;
    for (const p of [PART.shinL, PART.shinR]) { const sp = skel.parts[p]; mesh(cyl(sp.r * 1.25, sp.r * 1.2, sp.hh * 0.9, 10), wh, 0, -sp.hh * 0.4, 0, parts[p]); }
  }
  if (top === 'sc_rags') { // a patched tunic and a belt of spare fuses
    chestShell(H, ch, mat('#8a7a5a'), C);
    for (const [x, y, c] of [[0.4, 0.3, '#6a5a3a'], [-0.5, -0.4, '#a08a5a']]) mesh(box(r * 0.4, r * 0.4, r * 0.05), mat(c), x * r, y * r, r * 1.03, C);
    mesh(cyl(r * 1.13, r * 1.15, r * 0.16, 14), tc, 0, -hh - r * 0.38, 0, C);
    for (let k = -2; k <= 2; k++) { const a = k * 0.4; mesh(sphere(r * 0.13, 8, 6), mat('#1d1a1a'), Math.sin(a) * r * 1.15, -hh - r * 0.35, Math.cos(a) * r * 1.05, C); }
  }
  if (top === 'sc_labcoat') { // a long white lab coat, team tie
    chestShell(H, ch, wh, C);
    const coat = mesh(cyl(pel.r * 1.15, pel.r * 1.45, pel.r * 2.6, 14, ), wh, 0, -pel.r * 1.15, 0, P); coat.scale.set(1, 1, 0.95);
    mesh(box(r * 0.16, (hh + r) * 1.3, r * 0.05), tc, 0, hh * 0.1, r * 1.03, C);
    for (const sd of [-1, 1]) { const l = mesh(box(r * 0.3, (hh + r) * 1.1, r * 0.05), mat('#e8e6e0'), sd * r * 0.35, hh * 0.3, r * 0.98, C); l.rotation.z = sd * 0.2; }
    sleeves(wh);
    mesh(box(r * 0.25, r * 0.3, r * 0.05), mat('#c8c6c0'), r * 0.5, -r * 0.4, r * 1.03, C);
  }
  if (top === 'sc_ullr') { // fur coat with a team sash, and skis
    const fur = mat('#d8c8a8', { spec: 0 });
    chestShell(H, ch, mat('#5a6a7a'), C);
    const m = mesh(torus(H, r * 0.8, r * 0.3, Math.PI * 2, 16), mat('#eef2f4', { spec: 0 }), 0, hh + r * 0.45, -r * 0.05, C); m.rotation.x = Math.PI / 2;
    const sash = mesh(box(r * 0.3, (hh + r) * 2.3, r * 0.06), tc, 0, 0, r * 1.03, C); sash.rotation.z = -0.5;
    const coat = mesh(cyl(pel.r * 1.15, pel.r * 1.5, pel.r * 2.2, 14), fur, 0, -pel.r * 0.95, 0, P); coat.scale.set(1, 1, 0.95);
    for (const p of [PART.farmL, PART.farmR]) mesh(cyl(skel.parts[p].r * 1.35, skel.parts[p].r * 1.35, skel.parts[p].hh * 0.8, 10), mat('#eef2f4', { spec: 0 }), 0, -skel.parts[p].hh * 0.2, 0, parts[p]);
    for (const p of [PART.shinL, PART.shinR]) { // skis under the boots
      const sp = skel.parts[p], y = -sp.hh - sp.r * 1.1;
      mesh(box(sp.r * 1.1, sp.r * 0.25, sp.r * 14), tc, 0, y, sp.r * 1.5, parts[p]);
      const tip = mesh(box(sp.r * 1.1, sp.r * 0.25, sp.r * 1.6), tc, 0, y + sp.r * 0.35, sp.r * 9.0, parts[p]); tip.rotation.x = -0.5;
      mesh(box(sp.r * 1.2, sp.r * 0.3, sp.r * 0.6), mat('#2a2a30'), 0, y + sp.r * 0.2, sp.r * 0.5, parts[p]);
    }
  }
}

function buildProj(type, g, H) {
  const { mesh, cyl, sphere, cone, box, octa, mat, glow } = H;
  if (type === 'sc_chicken' || type === 'sc_chicken0' || type === 'sc_chicken1') {
    chickenMesh(H, g, type === 'sc_chicken' ? null : +type.slice(-1), 1.25);
    return true;
  }
  if (type === 'sc_banana') {
    mesh(tube(H, 'scbanp', [[0, -0.15, -0.05], [0, -0.02, 0.05], [0, 0.12, 0.05], [0, 0.22, -0.05]], 0.05, 0.025, 8), mat(YEL), 0, 0, 0, g);
    mesh(cyl(0.015, 0.02, 0.06, 5), mat('#5a4020'), 0, 0.25, -0.06, g);
    return true;
  }
  if (type === 'sc_peel') { // a splayed peel on the ground
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const p = mesh(sphere(0.12, 8, 6), mat(YEL, { spec: 0.4 }), Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12, g);
      p.scale.set(1.5, 0.15, 0.55); p.rotation.y = -a;
    }
    mesh(sphere(0.07, 8, 6), mat('#f4e8a8'), 0, 0.04, 0, g).scale.set(1, 0.6, 1);
    mesh(cyl(0.015, 0.02, 0.06, 5), mat('#5a4020'), 0, 0.08, 0, g);
    return true;
  }
  if (type === 'sc_frost_arrow') { arrowMesh(H, g, '#bff4ff', '#9fe8ff', true); return true; }
  if (type === 'sc_iceblock') { // frozen solid: a cluster of ice around the chest
    const ice = mat('#cff6ff', { emit: 0.35, spec: 1, transparent: true, opacity: 0.6, depthWrite: false });
    const core = mesh(octa(0.55), ice, 0, 0.05, 0, g); core.scale.set(0.9, 1.5, 0.9); core.castShadow = false; core.renderOrder = 4;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const o = mesh(octa(0.25), ice, Math.cos(a) * 0.4, (i % 3 - 1) * 0.3, Math.sin(a) * 0.4, g); o.scale.set(0.6, 1.6, 0.6); o.rotation.set(rand(-0.4, 0.4), a, rand(-0.4, 0.4)); o.castShadow = false; o.renderOrder = 4; }
    return true;
  }
  if (type === 'sc_arc') { // a crackling lightning segment
    mesh(cyl(0.035, 0.035, 0.74, 5), glow('#f4fbff'), 0, 0, 0, g).castShadow = false;
    mesh(cyl(0.12, 0.12, 0.74, 6), mat('#8fd0ff', { emit: 1, transparent: true, opacity: 0.5, depthWrite: false }), 0, 0, 0, g).castShadow = false;
    return true;
  }
  return false;
}

register({
  factions: [{ id: 'secret', name: 'Secret', color: '#3fd0a0' }],
  units,
  items: {
    sc_chicken_hand: { len: 0.0, r: 0.0, grip: 90 },
    sc_banana_hand: { len: 0.0, r: 0.0, grip: 90 },
    sc_pompom: { len: 0.2, r: 0.12, grip: 90, phys: false },
    sc_bomb_stick: { len: 1.25, r: 0.08, grip: 30, mass: 1.2 },
    sc_tesla: { len: 0.8, r: 0.08, grip: 90, mass: 3.0 },
    sc_ullr_bow: { len: 1.5, r: 0.04, grip: 0, center: true, mass: 0.9 },
  },
  kinds: { sc_bombstick: bombStick, sc_cheer: cheer, sc_zap: zap, sc_ullr: ullr },
  proj: {
    sc_chicken: CHICKEN, sc_chicken0: CHICKEN, sc_chicken1: CHICKEN,
    sc_banana: {
      g: 9.81, len: 0, r: 0.12, life: 6,
      hit(bt, pr, v) { _d.copy(pr.vel).normalize(); strike(bt, v, pr.damage, _d, pr.force, pr.owner, 'sc_banana', PART.chest, 'thud'); dropPeel(bt, v.pos, pr.owner); return true; },
      ground(bt, pr) { dropPeel(bt, pr.pos, pr.owner); return true; },
    },
    sc_peel: { g: 0, len: 0, r: 0, life: 1 },
    sc_iceblock: { g: 0, len: 0, r: 0, life: 1 },
    sc_arc: { g: 0, len: 0, r: 0, life: 1 },
    sc_frost_arrow: arrowProj({ onHit(bt, v, pr) { frostHit(bt, v, pr); } }),
  },
  buildItem, buildHat, decorate, buildProj,
  battleStep: stepPeels,
});
