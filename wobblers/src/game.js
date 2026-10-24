// Game: renderer, split-screen views, fixed-step physics loop, players.
import * as THREE from 'three';
import './look.js';
import { Sky } from './sky.js';
import { Physics, RAPIER } from './physics.js';
import { DT, MAX_PLAYERS, CAMERA_QUERY, SPAWN, HATS } from './config.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { FollowCam } from './camera.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { buildWorld } from './world/index.js';
import { Vehicle } from './vehicles.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.resScale = 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setScissorTest(true);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbfe6ff, 140, 620);
    this.renderStats = { calls: 0, triangles: 0 };
    this.time = 0;
    this.players = [];
    this.vehicles = [];
    this.seats = [];
    this.updaters = [];   // fn(dt) per frame (visual animation)
    this.steppers = [];   // fn() per physics step
    this.shadows = true;
    this.paused = false;
    this.started = false;
    this.acc = 0;

    this.physics = new Physics();
    this.input = new Input(canvas);
    this.audio = new Audio(this);
    this.setupLights();
    buildWorld(this);
    this.ui = new UI(this);
    this.physics.world.step(); // build broad-phase so first queries work
    addEventListener('resize', () => this.resize());
    this.resize();
    this.idleCam = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
    this.physics.onContactForce = (e) => this.contactSound(e);
  }

  setupLights() {
    this.skyRig = new Sky(this);
    this.sun = this.skyRig.sun;
    this.sunDir = this.skyRig.sunDir;
    this.sky = this.skyRig.dome;
  }

  setResScale(s) {
    this.resScale = Math.max(0.5, Math.min(1, s));
    this.resize();
  }

  resize() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * this.resScale);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.ui?.layout();
  }

  // Height of the static world under (x, z), casting down from y.
  groundHeight(x, z, fromY = 200) {
    const ray = new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.physics.world.castRay(ray, fromY + 50, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, CAMERA_QUERY);
    return hit ? fromY - hit.timeOfImpact : -10;
  }

  spawnPoint(i) {
    const a = i / MAX_PLAYERS * Math.PI * 2;
    return { x: SPAWN.x + Math.sin(a) * 2.5, y: SPAWN.y, z: SPAWN.z + Math.cos(a) * 2.5, yaw: Math.PI };
  }

  addPlayer(deviceId) {
    if (this.players.length >= MAX_PLAYERS) return null;
    const used = new Set(this.players.map((p) => p.index));
    let idx = 0; while (used.has(idx)) idx++;
    const p = new Player(this, idx, deviceId);
    p.hat = [1, 2, 3, 5, 4, 6, 7, 1][idx] % HATS.length;
    p.buildHat();
    p.camera = new FollowCam(this, p);
    p.cam = p.camera;
    const sp = this.spawnPoint(idx);
    p.teleport(sp.x, sp.y, sp.z, sp.yaw);
    p.camera.yaw = sp.yaw;
    this.players.push(p);
    this.players.sort((a, b) => a.index - b.index);
    this.audio.play('join');
    this.ui.layout();
    this.ui.refreshTags();
    return p;
  }

  removePlayer(p) {
    p.destroy();
    this.players = this.players.filter((q) => q !== p);
    this.ui.layout();
    this.ui.refreshTags();
  }

  // Nearest free seat in reach of a player.
  nearestSeat(p, maxD = 2.6) {
    const c = p.chest.translation();
    let best = null, bd = maxD;
    const q = new THREE.Quaternion(), v = new THREE.Vector3();
    for (const s of this.seats) {
      if (s.occupant || s.disabled) continue;
      const t = s.body.translation(), r = s.body.rotation();
      v.set(s.pos[0], s.pos[1], s.pos[2]).applyQuaternion(q.set(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
      const d = v.distanceTo(new THREE.Vector3(c.x, c.y, c.z)) - (s.kind === 'driver' ? 1.5 : 0);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  handlePlayerInput(p, d) {
    const inp = d.state, pr = d.pressed;
    if (pr.interact) {
      if (p.seat) p.leaveSeat();
      else if (p.state !== 'limp') {
        const s = this.nearestSeat(p);
        if (s) p.sitIn(s);
      }
    }
    if (p.seat?.vehicle && p.seat.kind === 'driver') {
      p.seat.vehicle.control(inp);
      if (pr.horn || (pr.punch && !inp.mouse)) this.audio.play('horn', p.pos());
    }
    if (p.seat?.control) p.seat.control(inp, pr);
    if (pr.dLeft) p.setColor(p.colorIndex - 1);
    if (pr.dRight) p.setColor(p.colorIndex + 1);
    if (pr.dUp || pr.dDown) { p.hat = (p.hat + (pr.dUp ? 1 : HATS.length - 1)) % HATS.length; p.buildHat(); }
  }

  step() {
    const blank = { state: {}, pressed: {} };
    for (const p of this.players) {
      const d = this.paused ? null : this.input.get(p.deviceId);
      const st = d ? d.state : blank.state, pr = d && d.latch ? d.latch : blank.pressed;
      if (d) d.latch = null;
      const driving = p.seat && p.seat.kind === 'driver';
      const inp = driving ? { ...st, moveX: 0, moveY: 0, grabL: 0, grabR: 0 } : st;
      p.step(inp, driving ? { ragdoll: false, jump: false, punch: false } : pr);
    }
    for (const v of this.vehicles) v.update();
    for (const f of this.steppers) f();
    this.physics.step();
  }

  frame(dt) {
    dt = Math.max(0, Math.min(dt, 0.1));
    this.time += dt;
    this.input.poll();
    this.ui.handleInput();
    if (!this.paused && !this.manual) {
      for (const p of this.players) {
        const d = this.input.get(p.deviceId);
        if (!d) continue;
        d.latch = d.latch || {};
        for (const k in d.pressed) if (d.pressed[k]) d.latch[k] = true;
        this.handlePlayerInput(p, d);
      }
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 3) { this.step(); this.acc -= DT; n++; }
      if (n === 3) this.acc = 0;
      this.physics.recover();
      this.physics.alpha = Math.min(1, this.acc / DT);
    } else this.physics.alpha = 1;
    for (const f of this.updaters) f(dt, this.time);
    this.physics.sync();
    for (const p of this.players) p.sync();
    for (const v of this.vehicles) v.sync();
    this.audio.updateEngines(this.vehicles);
    this.render(dt);
  }

  views() {
    const n = this.players.length, W = innerWidth, H = innerHeight;
    if (n <= 1) return [[0, 0, W, H]];
    let cols, rows;
    if (n === 2) { cols = 2; rows = 1; }
    else if (n <= 4) { cols = 2; rows = 2; }
    else if (n <= 6) { cols = 3; rows = 2; }
    else { cols = 4; rows = 2; }
    const out = [];
    const w = W / cols, h = H / rows;
    for (let i = 0; i < n; i++) {
      const cx = i % cols, cy = (i / cols) | 0;
      out.push([cx * w, cy * h, w, h]);
    }
    return out;
  }

  // Players whose cameras are close share one shadow-map render; each
  // further group re-renders the (world-space) shadow map before its views.
  shadowGroups(views) {
    const groups = [];
    const R = this.players.length > 4 ? 28 : 36;
    this.players.forEach((p, i) => {
      const t = p.camera.target;
      let g = groups.find((q) => Math.hypot(q.x - t.x, q.z - t.z) < R);
      if (!g) { g = { x: t.x, y: t.y, z: t.z, sx: 0, sz: 0, n: 0, views: [] }; groups.push(g); }
      g.views.push(i); g.n++; g.sx += t.x; g.sz += t.z;
    });
    for (const g of groups) { g.x = g.sx / g.n; g.z = g.sz / g.n; }
    return groups;
  }

  placeShadow(c, half) {
    const sun = this.sun, sc = sun.shadow.camera;
    const size = sun.shadow.mapSize.x;
    if (sc.right !== half) { sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.updateProjectionMatrix(); }
    // snap to the shadow texel grid so edges don't shimmer as the centre moves
    const snap = (half * 2) / size;
    const x = Math.round(c.x / snap) * snap, z = Math.round(c.z / snap) * snap;
    sun.target.position.set(x, c.y || 0, z);
    sun.position.set(x, c.y || 0, z).addScaledVector(this.sunDir, 200);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  }

  // Hide small dynamic things (props, parked cars) that would be a few pixels
  // in this view; the static world is merged into chunks and never culled here.
  cullSmall(cam, viewH) {
    this.cullAge = (this.cullAge || 0) + 1;
    if (!this.cullList || this.cullList.n !== this.scene.children.length || this.cullAge > 600) {
      this.cullAge = 0;
      if (this.cullList) for (const it of this.cullList.list) if (it.hid) it.o.visible = true;
      const list = [];
      const box = new THREE.Box3(), sph = new THREE.Sphere();
      for (const o of this.scene.children) {
        if (o.isLight || o === this.sky || o.userData.noCull) continue;
        if (o.isMesh && o.position.lengthSq() === 0 && !o.userData.dynamic) continue; // merged static chunk
        if (this.players.some((p) => p.group === o)) continue;
        box.setFromObject(o);
        if (box.isEmpty()) continue;
        box.getBoundingSphere(sph);
        if (sph.radius > 9) continue;
        list.push({ o, r: Math.max(sph.radius, 0.3) });
      }
      this.cullList = { n: this.scene.children.length, list };
    }
    const k = 260 * viewH / 720; // pixels-ish: cull when radius / distance < 1/k
    const cp = cam.position;
    for (const it of this.cullList.list) {
      const p = it.o.position, d2 = (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2 + (p.y - cp.y) ** 2;
      const lim = it.r * k, show = d2 < lim * lim;
      // only undo our own hiding: other code may hide objects too
      if (it.hid) { if (show) { it.o.visible = true; it.hid = false; } }
      else if (!show && it.o.visible) { it.o.visible = false; it.hid = true; }
    }
  }

  render(dt) {
    const r = this.renderer;
    const views = this.views();
    const sky = this.skyRig;
    sky.update(this.paused ? 0 : dt);
    const H = innerHeight;
    const fog = this.scene.fog;
    const setFog = (cam, under) => {
      // underwater: murky blue that dims with the daylight
      if (under) { fog.color.set(0x1f7fa8).multiplyScalar(0.35 + 0.65 * this.dayLight); fog.near = 1; fog.far = 30; }
      else { fog.color.copy(sky.fogColor); fog.near = 70 + 70 * this.dayLight; fog.far = sky.fogFar; }
    };
    r.info.autoReset = false;
    r.info.reset();
    this.sun.castShadow = this.shadows;
    const viewDraw = (cam, x, y, w, h, under) => {
      setFog(cam, under);
      sky.view(cam, under, fog.color);
      this.cullSmall(cam, h);
      this.detail?.view(cam);
      this.scene.userData.terrainLOD?.view(cam);
      r.setViewport(x, H - y - h, w, h);
      r.setScissor(x, H - y - h, w, h);
      r.render(this.scene, cam);
      r.shadowMap.needsUpdate = false;
    };
    if (!this.players.length) {
      const cam = this.idleCam;
      const t = this.time * 0.05;
      cam.position.set(Math.sin(t) * 60, 28, Math.cos(t) * 60 + 10);
      cam.lookAt(0, 4, 0);
      cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
      if (this.shadows) { this.placeShadow(this.idleTarget || new THREE.Vector3(), 60); r.shadowMap.needsUpdate = true; }
      viewDraw(cam, 0, 0, innerWidth, innerHeight, false);
    }
    // cameras first, so shadow groups use this frame's targets
    this.players.forEach((p, i) => {
      const [, , w, h] = views[i];
      const d = this.input.get(p.deviceId);
      p.camera.update(d && !this.paused ? d.state : { lookX: 0, lookY: 0 }, dt);
      const cam = p.camera.cam;
      cam.aspect = w / h; cam.updateProjectionMatrix();
    });
    if (this.players.length) {
      const groups = this.shadowGroups(views);
      // with many separate groups use a smaller map so 8 shadow passes stay cheap
      const want = groups.length > 2 ? 1024 : 2048;
      if (this.sun.shadow.mapSize.x !== want) {
        this.sun.shadow.mapSize.set(want, want);
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
      const half = groups.length > 2 ? 42 : 60;
      for (const g of groups) {
        if (this.shadows) { this.placeShadow(g, half); r.shadowMap.needsUpdate = true; }
        for (const i of g.views) {
          const p = this.players[i], [x, y, w, h] = views[i];
          viewDraw(p.camera.cam, x, y, w, h, p.camera.underwater);
        }
      }
    }
    this.renderStats.calls = r.info.render.calls;
    this.renderStats.triangles = r.info.render.triangles;
    r.info.autoReset = true;
    this.ui.update(views);
  }

  // Big contact forces: thuds, and players run over by vehicles get knocked out.
  contactSound(e) {
    const m = e.totalForceMagnitude();
    const h1 = e.collider1(), h2 = e.collider2();
    const c1 = this.physics.world.getCollider(h1);
    if (!c1) return;
    const o1 = this.physics.handleOwner.get(h1), o2 = this.physics.handleOwner.get(h2);
    for (const [a, b] of [[o1, o2], [o2, o1]]) {
      if (a instanceof Player && b instanceof Vehicle && m > 2500 && a.state !== 'seated') {
        const v = b.body.linvel();
        if (Math.hypot(v.x, v.z) > 3.5) { a.knockOut(2.5); a.impactGrace = 0.5; }
      }
    }
    const t = c1.translation();
    this.audio.play('thud', t, Math.min(1.5, m / 6000));
  }

  run() {
    let last = performance.now();
    const loop = (now) => {
      this.frame((now - last) / 1000);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
