// Car damage (Settings > Car damage, default on). Any vehicle a player can use takes damage from
// serious collisions: each physics step its velocity change, gravity taken out, is compared with
// the step before, and anything over DV0 m/s (a wall, another car, a hard landing; braking or a
// bump never comes near) adds (dv - DV0) x K (at most HIT_MAX) to `v.dmg.hp`. As it builds up the vehicle smokes
// (grey from 35, black from 60) and from 60 wobbles while driven; at 100 it catches fire, burns
// for FIRE_T s (flames, crackle) and explodes: a flash, fireball, sparks and a smoke cloud, the
// vehicle thrown up, its riders thrown out and knocked out, people close by flung. The charred
// wreck smokes for WRECK_T s, then a phone-called vehicle is removed (call another) and any other
// goes home repaired (Vehicle.respawn repairs too). Self-driving traffic, bumper cars and the
// bouncy ball are never damaged. Particles: two pooled THREE.Points (smoke, additive fire).
import * as THREE from 'three';
import { DT } from '../config.js';
import { Vehicle } from '../vehicles.js';
import { settings } from '../settings.js';

const DV0 = 5, K = 2.6, HIT_MAX = 40, FIRE_T = 5, WRECK_T = 12; // a 20 m/s head-on crash ~ 39: about three to set it alight
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _s = new THREE.Vector3();
const _vp = new THREE.Vector4();

// ---- particles: soft round points, per-particle size / colour / alpha -------------------------
function particles(game, N, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), size = new Float32Array(N), col = new Float32Array(N * 3), alpha = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uH: { value: 600 } },
    vertexShader: `attribute float aSize; attribute vec3 aColor; attribute float aAlpha; uniform float uH;
      varying vec3 vC; varying float vA;
      void main() { vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv; gl_PointSize = aSize * projectionMatrix[1][1] * uH * 0.5 / max(0.1, -mv.z); }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, ${additive ? '0.0' : '0.45'}, d) * vA;
        if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.userData.noCull = true; pts.renderOrder = additive ? 6 : 5;
  pts.onBeforeRender = (r) => { r.getCurrentViewport(_vp); mat.uniforms.uH.value = _vp.w || 600; };
  game.scene.add(pts);
  const P = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, c0: new THREE.Color(), c1: new THREE.Color(), a0: 1, g: 0, drag: 0 }));
  let next = 0, alive = 0;
  const _c = new THREE.Color();
  return {
    emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0 = 1, g = 0, drag = 1) {
      const p = P[next]; next = (next + 1) % N;
      Object.assign(p, { x, y, z, vx, vy, vz, life, max: life, s0, s1, a0, g, drag });
      p.c0.setHex(c0); p.c1.setHex(c1);
      alive = N;
    },
    update(dt) {
      if (!alive) return;
      let n = 0;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life <= 0) { size[i] = 0; alpha[i] = 0; continue; }
        n++;
        p.life -= dt;
        const k = 1 - Math.max(0, p.life) / p.max, dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        size[i] = p.s0 + (p.s1 - p.s0) * k;
        _c.copy(p.c0).lerp(p.c1, k); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
        alpha[i] = p.a0 * Math.min(1, (1 - k) * 2.5) * Math.min(1, k * 12 + 0.3);
      }
      alive = n;
      for (const a of ['position', 'aSize', 'aColor', 'aAlpha']) geo.attributes[a].needsUpdate = true;
    },
  };
}

export function buildCarDamage(game) {
  const smoke = particles(game, 700, false), fire = particles(game, 900, true);
  // flashes: a big additive sprite that blooms and fades
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  { const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,0.8)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const flashTex = new THREE.CanvasTexture(cv);
  const flashes = [];
  const flash = (x, y, z) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.position.set(x, y, z); s.userData.noCull = true; s.renderOrder = 7;
    game.scene.add(s); flashes.push({ s, t: 0 });
  };

  const damageable = (v) => !v.destroyed && !v.def.bumper && v.type !== 'hopper' && (!v.route || game.players.includes(v.driver?.()));
  // engine spot (body-local): the front of the bonnet, a helicopter's rotor housing
  const engine = (v, out) => {
    const h = v.def.half, t = v.body.translation(), r = v.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    out.set((Math.random() - 0.5) * h[0], v.def.heli ? h[1] : h[1] * 0.9, v.def.heli ? 0 : h[2] * 0.7).applyQuaternion(_q);
    return out.add(_v.set(t.x, t.y, t.z));
  };

  // charred look: every mesh gets a dark copy of its material (cached per original)
  const charMats = new Map();
  function char(v, on) {
    v.mesh.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        if (o.userData.mat0) return;
        o.userData.mat0 = o.material;
        let m = charMats.get(o.material);
        if (!m) {
          m = o.material.clone();
          if (m.color) m.color.setHex(0x2c2724);
          if (m.emissive) m.emissive.setHex(0x000000);
          charMats.set(o.material, m);
        }
        o.material = m;
      } else if (o.userData.mat0) { o.material = o.userData.mat0; delete o.userData.mat0; }
    });
  }
  function repair(v) {
    const d = v.dmg;
    if (!d) return;
    if (d.wreck >= 0) { char(v, false); for (const s of v.seats) s.disabled = false; }
    v.dmg = null; v.wrecked = false;
  }
  const origRespawn = Vehicle.prototype.respawn;
  Vehicle.prototype.respawn = function () { origRespawn.call(this); repair(this); };

  function hit(v, d, dv) {
    // one collision spreads over a few steps (and bounces): within 0.3 s only its peak counts
    const amt = (x) => Math.min(HIT_MAX, (x - DV0) * K), now = game.time;
    let add;
    if (d.win && now - d.win.t < 0.3) { if (dv <= d.win.dv) return; add = amt(dv) - amt(d.win.dv); d.win.dv = dv; }
    else { d.win = { t: now, dv }; add = amt(dv); }
    const before = d.hp;
    d.hp = Math.min(100, d.hp + add);
    const t = v.body.translation();
    // a crunch and a puff of dust / smoke at the hit
    if (add > 3) {
      game.audio?.play('thud', t, Math.min(1.5, 0.6 + add / 30));
      for (let i = 0; i < Math.min(14, add / 2); i++) smoke.emit(t.x + (Math.random() - 0.5) * 2, t.y + Math.random(), t.z + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.9 + Math.random() * 0.6, 0.6, 2.2, 0x8a8478, 0xb8b2a8, 0.55, 0.5, 2);
      for (let i = 0; i < Math.min(16, add); i++) fire.emit(t.x, t.y + 0.4, t.z, (Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9, 0.3 + Math.random() * 0.3, 0.14, 0.05, 0xfff2a0, 0xff6a10, 1, -12, 0.5);
    }
    if (d.hp >= 100 && before < 100 && d.fire < 0) { d.fire = 0; game.audio?.play('fire', t, 1.2); }
  }

  function explode(v, d) {
    const t = v.body.translation(), m = v.def.mass, x = t.x, y = t.y + 0.5, z = t.z;
    game.audio?.play('explode', { x, y, z }, 1.6);
    flash(x, y + 0.5, z);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 6.283, e = Math.random() * 1.2, sp = 3 + Math.random() * 8;
      fire.emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp, 0.5 + Math.random() * 0.6, 1.4, 4.5, 0xfffbe0, 0xff3a00, 1, 2, 2.5);
    }
    for (let i = 0; i < 45; i++) {
      const a = Math.random() * 6.283, sp = 1 + Math.random() * 4;
      smoke.emit(x, y + Math.random(), z, Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp, 2.5 + Math.random() * 2.5, 1.2, 5, 0x3a332c, 0x7a746c, 0.55, 0.8, 1.2);
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, sp = 6 + Math.random() * 10;
      fire.emit(x, y, z, Math.cos(a) * sp, 4 + Math.random() * 9, Math.sin(a) * sp, 0.6 + Math.random() * 0.8, 0.22, 0.08, 0xffffc0, 0xff7a10, 1, -14, 0.3);
    }
    // the vehicle jumps and tumbles
    const b = v.body;
    b.applyImpulse({ x: (Math.random() - 0.5) * m * 2, y: m * (v.def.heli ? 3 : 7), z: (Math.random() - 0.5) * m * 2 }, true);
    b.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 3, y: (Math.random() - 0.5) * m * 2, z: (Math.random() - 0.5) * m * 3 }, true);
    // riders thrown out, people nearby flung
    const riders = v.seats.map((s) => s.occupant).filter(Boolean);
    for (const p of riders) p.leaveSeat();
    const people = new Set([...riders, ...game.players]);
    for (const p of people) {
      if (!p.chest || (p.seat && p.seat.vehicle !== v)) continue;
      const c = p.chest.translation(), dx = c.x - x, dz = c.z - z, dist = Math.hypot(dx, dz);
      const k = riders.includes(p) ? 1 : 1 - dist / 9;
      if (k <= 0.15) continue;
      for (const h of ['L', 'R']) if (p.hands[h].body === b) p.releaseHand(h);
      const ux = dist > 0.3 ? dx / dist : Math.random() - 0.5, uz = dist > 0.3 ? dz / dist : Math.random() - 0.5;
      for (const pb of p.bodies) pb.setLinvel({ x: ux * 8 * k + (Math.random() - 0.5) * 2, y: 10 * k + Math.random() * 2, z: uz * 8 * k + (Math.random() - 0.5) * 2 }, true);
      p.impactGrace = 0.6;
      p.knockOut(1.5 + 2 * k);
    }
    d.fire = -1; d.wreck = 0;
    v.wrecked = true;
    char(v, true);
  }

  // per physics step: impacts, wobble, the fire's fuse, the wreck's timer
  game.steppers.push(() => {
    const on = settings.carDamage !== false, t = game.time;
    for (const v of game.vehicles) {
      if (!on) { if (v.dmg) repair(v); continue; }
      if (v.culled || v.rail || !damageable(v)) continue;
      const b = v.body, d = v.dmg ||= { hp: 0, fire: -1, wreck: -1, lv: null, seed: Math.random() * 50, crackle: 0 };
      const lv = b.linvel();
      if (d.lv && !v.rec.snap && d.wreck < 0) {
        const dv = Math.hypot(lv.x - d.lv.x, lv.y - d.lv.y + 9.81 * DT, lv.z - d.lv.z);
        if (dv > DV0) hit(v, d, dv);
      }
      d.lv ||= { x: 0, y: 0, z: 0 }; d.lv.x = lv.x; d.lv.y = lv.y; d.lv.z = lv.z;
      if (d.wreck >= 0) {
        d.wreck += DT;
        for (const s of v.seats) s.disabled = true;
        if (d.wreck > WRECK_T) {
          const calls = game.calledVehicles;
          const caller = calls && [...calls].find(([, cv]) => cv === v)?.[0];
          if (caller) { calls.delete(caller); v.destroy(); } else v.respawn();
        }
        continue;
      }
      // badly damaged: it wobbles while driven
      const drv = v.driver?.();
      if (d.hp > 60 && drv && Math.abs(v.speed) > 1.5) {
        const k = (d.hp - 60) / 40, n1 = Math.sin(t * 7.3 + d.seed) * Math.sin(t * 2.1 + d.seed * 2), n2 = Math.sin(t * 9.1 + d.seed * 3);
        const r = b.rotation(); _q.set(r.x, r.y, r.z, r.w); _f.set(0, 0, 1).applyQuaternion(_q);
        const av = b.angvel(), roll = n2 * k * 0.09, yaw = n1 * k * 0.07;
        b.setAngvel({ x: av.x + _f.x * roll, y: av.y + yaw + _f.y * roll, z: av.z + _f.z * roll }, true);
      }
      if (d.fire >= 0) {
        d.fire += DT;
        if ((d.crackle -= DT) <= 0) { d.crackle = 0.55; game.audio?.play('fire', b.translation(), 0.6 + d.fire / FIRE_T); }
        if (d.fire > FIRE_T) explode(v, d);
      }
    }
  });

  // per frame: smoke and flames from damaged vehicles, particles, flashes
  game.updaters.push((dt) => {
    if (settings.carDamage !== false) for (const v of game.vehicles) {
      const d = v.dmg;
      if (!d || v.culled || (d.hp < 35 && d.fire < 0 && d.wreck < 0)) continue;
      const near = game.players.some((p) => p.camera?.cam && p.camera.cam.position.distanceToSquared(v.mesh.position) < 160 * 160);
      if (!near) continue;
      const lv = v.body.linvel();
      if (d.wreck >= 0) {
        const k = 1 - d.wreck / WRECK_T;
        if (Math.random() < 16 * dt * k) { engine(v, _s); smoke.emit(_s.x, _s.y, _s.z, (Math.random() - 0.5) * 0.6, 1.6, (Math.random() - 0.5) * 0.6, 3 + Math.random() * 2, 0.7, 3.5, 0x2a2622, 0x6a665e, 0.45 * k + 0.15, 0.6, 0.6); }
        if (d.wreck < 4 && Math.random() < 40 * dt) { engine(v, _s); fire.emit(_s.x, _s.y, _s.z, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 0.4 + Math.random() * 0.3, 0.9, 0.3, 0xffd060, 0xff2a00, 0.9, 1, 1); }
        continue;
      }
      // smoke thickens and darkens with the damage
      const k = Math.min(1, (d.hp - 35) / 65), dark = d.hp >= 60;
      if (Math.random() < (5 + 18 * k) * dt) {
        engine(v, _s);
        smoke.emit(_s.x, _s.y, _s.z, lv.x * 0.3 + (Math.random() - 0.5) * 0.5, 1.2 + Math.random(), lv.z * 0.3 + (Math.random() - 0.5) * 0.5,
          1.4 + k * 1.4, 0.35 + k * 0.3, 1.4 + k * 1.6, dark ? 0x3a3530 : 0x9a968e, dark ? 0x6a665e : 0xc8c4bc, 0.25 + k * 0.3, 0.5, 0.8);
      }
      if (d.fire >= 0) {
        const f = Math.min(1, d.fire / FIRE_T);
        for (let i = 0; i < 3 + f * 5; i++) {
          if (Math.random() > 60 * dt) continue;
          engine(v, _s);
          fire.emit(_s.x, _s.y, _s.z, lv.x * 0.6 + (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 2, lv.z * 0.6 + (Math.random() - 0.5) * 0.8,
            0.4 + Math.random() * 0.4, 1.0 + f * 1.5, 0.3, 0xfff0b0, 0xff3000, 1, 1.5, 1.2);
        }
      }
    }
    smoke.update(dt); fire.update(dt);
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.t += dt;
      const k = f.t / 0.45;
      f.s.scale.setScalar(4 + k * 14); f.s.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { game.scene.remove(f.s); f.s.material.dispose(); flashes.splice(i, 1); }
    }
  });

  game.carDamage = { repair, explode: (v) => explode(v, v.dmg ||= { hp: 100, fire: -1, wreck: -1, lv: null, seed: 1, crackle: 0 }), smoke, fire };
}
