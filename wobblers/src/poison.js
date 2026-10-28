// Poisoned: a status effect any hazard can give a character (the rattlesnake's bite: wildlife.js).
//   game.poison.apply(p, secs)   poison p for secs (a fresh dose tops it up, never shortens it)
//   game.poison.clear(p)         cure at once
//   game.poison.of(p)            current strength 0..1 (0 = fine)
// While poisoned (player.poisoned = the record):
//  - the skin turns sick green (player.skinTint, painted by paintSkin; the face's skin tone follows);
//  - green bubbles rise and swirl round the head (one InstancedMesh for everyone);
//  - walking is a stagger: the stick's direction wanders, no sprinting (filter, called from
//    player.step), balance is weakened with a lurch to one side every few seconds
//    (player.stumble + a sideways push) and now and then the legs give way (a short knock-out).
// Strength is full for the first two thirds and fades out over the last third.
import * as THREE from 'three';

const GREEN = new THREE.Color(0x7fdc4f);
const TINT = 0.6;          // how green at full strength
const MAXP = 120;          // bubbles in the pool

export function installPoison(game) {
  const active = new Set();

  function strength(P, t) {
    const left = P.until - t, fade = P.dur / 3;
    return left <= 0 ? 0 : Math.min(1, left / fade);
  }
  function apply(p, secs = 12) {
    const t = game.time;
    let P = p.poisoned;
    if (!P) { P = p.poisoned = { t0: t, until: t, dur: secs, seed: Math.random() * 100, lurch: t + 1.5, trip: t + 4, painted: -1, puff: 0 }; active.add(p); }
    if (t + secs > P.until) { P.until = t + secs; P.dur = Math.max(P.dur, P.until - t); }
    game.audio?.play('queasy', p.pos?.());
  }
  function clear(p) {
    if (!p.poisoned) return;
    p.poisoned = null; active.delete(p);
    if (p.skinTint) { p.skinTint = null; p.skin && p.paintSkin(); }
  }
  // the stick wanders and won't sprint (called from player.step with that step's input)
  function filter(p, inp) {
    const P = p.poisoned, k = strength(P, game.time);
    if (k <= 0) return inp;
    const m = Math.hypot(inp.moveX || 0, inp.moveY || 0);
    if (m < 0.1) return { ...inp, sprint: false };
    const t = game.time + P.seed, a = (Math.sin(t * 1.3) * 0.75 + Math.sin(t * 0.47 + 2) * 0.45) * k;
    const c = Math.cos(a), s = Math.sin(a), sc = 1 - 0.3 * k;
    return { ...inp, moveX: (inp.moveX * c - inp.moveY * s) * sc, moveY: (inp.moveX * s + inp.moveY * c) * sc, sprint: false };
  }
  // per physics step: lurches and trips, wearing off
  game.steppers.push(() => {
    if (!active.size) return;
    const t = game.time;
    for (const p of active) {
      const P = p.poisoned;
      if (!P || !p.chest) { active.delete(p); continue; }
      const k = strength(P, t);
      if (k <= 0) { clear(p); continue; }
      if (p.state !== 'normal' || p.seat || p.swimming) continue;
      const v = p.chest.linvel(), moving = Math.hypot(v.x, v.z) > 0.8;
      if (t > P.lurch) {
        P.lurch = t + 2.2 + Math.random() * 2;
        p.stumble = Math.max(p.stumble || 0, 0.45 * k);
        const side = Math.random() < 0.5 ? -1 : 1, m = p.chest.mass();
        p.chest.applyImpulse({ x: Math.cos(p.yaw) * side * m * 1.6 * k, y: 0, z: -Math.sin(p.yaw) * side * m * 1.6 * k }, true);
        if (moving && t > P.trip && Math.random() < 0.3 * k) { P.trip = t + 8; p.knockOut(1.1); }
      }
    }
  });
  // per frame: the green tint and the bubbles
  const geo = new THREE.IcosahedronGeometry(0.075, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, MAXP);
  mesh.name = 'poisonBubbles'; mesh.frustumCulled = false; mesh.count = 0; mesh.userData.noCull = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, GREEN); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  game.scene.add(mesh);
  const bubbles = [], _m = new THREE.Matrix4(), _c = new THREE.Color(), _h = new THREE.Vector3();
  const COLS = [0x7ee04f, 0x4fb52e, 0xa8f070, 0x3c8f24];
  game.updaters.push((dt, t) => {
    for (const p of active) {
      const P = p.poisoned; if (!P) continue;
      const k = strength(P, t);
      if (Math.abs(k - P.painted) > 0.06 || (k === 0 && P.painted)) { // repaint the skin only as the tint steps
        P.painted = k; p.skinTint = k > 0 ? { color: GREEN, k: TINT * k } : null; p.skin && p.paintSkin();
      }
      if (!p.headMesh) continue;
      P.puff += dt * 9 * Math.max(0.3, k);
      p.headMesh.getWorldPosition(_h);
      while (P.puff >= 1 && bubbles.length < MAXP) {
        P.puff -= 1;
        const a = Math.random() * 6.283, r = 0.18 + Math.random() * 0.12;
        bubbles.push({ x: _h.x + Math.cos(a) * r, y: _h.y + (Math.random() - 0.3) * 0.25, z: _h.z + Math.sin(a) * r, a, r, w: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random()),
          vy: 0.35 + Math.random() * 0.3, age: 0, life: 1.1 + Math.random() * 0.7, s: 0.6 + Math.random() * 0.8, col: COLS[(Math.random() * COLS.length) | 0], p, cx: _h.x, cz: _h.z });
      }
      if (P.puff > 1) P.puff = 1;
    }
    let n = 0;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.age += dt;
      if (b.age >= b.life) { bubbles[i] = bubbles[bubbles.length - 1]; bubbles.pop(); continue; }
      if (b.p.headMesh) { b.p.headMesh.getWorldPosition(_h); b.cx += (_h.x - b.cx) * Math.min(1, dt * 6); b.cz += (_h.z - b.cz) * Math.min(1, dt * 6); }
      b.a += b.w * dt; b.y += b.vy * dt;
      const u = b.age / b.life, s = b.s * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.4);
      _m.makeScale(s, s, s).setPosition(b.cx + Math.cos(b.a) * b.r, b.y, b.cz + Math.sin(b.a) * b.r);
      mesh.setMatrixAt(n, _m); mesh.setColorAt(n, _c.set(b.col)); n++;
    }
    mesh.count = n; mesh.visible = n > 0;
    if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  });
  return { apply, clear, filter, of: (p) => (p.poisoned ? strength(p.poisoned, game.time) : 0), bubbles };
}
