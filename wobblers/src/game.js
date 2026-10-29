// Game: renderer, split-screen views, fixed-step physics loop, players.
import { buildBlink } from './blink.js';
import { setCharStyle } from './charstyle.js';
import { resetCharCaches } from './player.js';
import { clearFaceCache, setFace } from './cosmetics.js';
import { buildSimCull } from './simcull.js';
import { railStep } from './world/regions/city/traffic.js';
import * as THREE from 'three';
import { settings } from './settings.js';
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
import { Emotes } from './emotes.js';
import { NPCManager } from './npc.js';
import { RegionBanners } from './regionbanner.js';

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
    this.perf = { step: 0, render: 0, frame: 0, dt: 0 }; // ms of the last frame (Settings > Show FPS)
    this.time = 0;
    this.players = [];
    this.vehicles = [];
    this.seats = [];
    this.updaters = [];   // fn(dt) per frame (visual animation)
    this.viewHooks = [];  // fn(camera) before each view draws (level of detail)
    this.steppers = [];   // fn() per physics step
    this.shadows = true;
    this.paused = false;
    this.started = false;
    this.acc = 0;

    this.physics = new Physics();
    this.input = new Input(canvas);
    this.audio = new Audio(this);
    this.setupLights();
    this.npcs = new NPCManager(this); // world builders spawn NPCs into it
    buildWorld(this);
    this.simCull = buildSimCull(this); // far-away props and parked vehicles stop simulating (simcull.js)
    buildBlink(this); // characters blink now and then (blink.js)
    this.ui = new UI(this);
    this.regionBanners = new RegionBanners(this); // "Welcome to Frostpeak!"; sets player.region
    this.emotes = new Emotes(this); // emote wheel + quick emotes
    this.physics.world.step(); // build broad-phase so first queries work
    addEventListener('resize', () => this.resize());
    this.resize();
    this.idleCam = new THREE.PerspectiveCamera(55, 1, 0.1, 2200);
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

  // Pause menu "Teleport to P2": join another player. In a vehicle with a free seat, you take
  // it; otherwise you land 1.6 m behind them on whatever surface is there (the ground below
  // if they're up in the air).
  teleportTo(p, q) {
    if (p.seat) p.leaveSeat();
    const veh = q.seat?.vehicle || ['L', 'R'].map((h) => q.hands?.[h].owner).find((o) => o?.seats && o.def);
    const free = veh?.seats.find((s) => !s.occupant && !s.disabled && s.kind !== 'driver');
    if (free) {
      const t = veh.body.translation();
      p.teleport(t.x, t.y + 1.5, t.z, q.yaw);
      p.sitIn(free);
    } else {
      const c = q.chest.translation(), fx = Math.sin(q.yaw), fz = Math.cos(q.yaw);
      let x = c.x - fx * 1.6, z = c.z - fz * 1.6;
      if (veh) { const t = veh.body.translation(); x = t.x - fx * 4; z = t.z - fz * 4; } // full vehicle: beside it
      const y = this.groundHeight(x, z, c.y + 1.5);
      p.teleport(x, Math.max(y, this.physics.waterLevel?.(x, c.y, z) ?? -1e9) + 1.1, z, q.yaw);
    }
    this.pets?.of(p)?.teleportNear();
    this.audio?.play('pop', p.pos());
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

  // The dressing stage: a player who has just joined stands on their own podium high over the open
  // sea, well outside the world and far from everyone, while they make their Wobbler (ui.js
  // Customiser draws the card beside them); "Let's go!" drops them in at their spawn point.
  stage(p) {
    const S = this.stages ||= [];
    let st = S[p.index];
    if (!st) {
      const x = -60 + p.index * 16, y = 300, z = 2150;
      this.physics.cylinder(x, y - 1, z, 1.3, 2, { friction: 1 });
      const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 40 }), ring = new THREE.MeshPhongMaterial({ color: 0xffd23f, shininess: 60 });
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.15, 2, 40), mat); top.position.y = -1; top.receiveShadow = true;
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.31, 0.07, 10, 48), ring); band.rotation.x = Math.PI / 2; band.position.y = -0.12;
      g.add(top, band); g.position.set(x, y, z); g.name = 'stage' + p.index;
      this.scene.add(g);
      st = S[p.index] = { x, y, z };
    }
    p.staged = true;
    p.teleport(st.x, st.y + 0.05, st.z, 0);
    p.camera.yaw = Math.PI; p.camera.first = true;
  }
  unstage(p) {
    if (!p.staged) return;
    p.staged = false;
    const sp = this.spawnPoint(p.index);
    p.teleport(sp.x, sp.y + 1.3, sp.z, sp.yaw);               // dropped in from a little way up
    p.camera.yaw = sp.yaw; p.camera.first = true;
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
    const q = new THREE.Quaternion(), v = new THREE.Vector3(), sb = this.physics.staticBody;
    for (const s of this.seats) {
      if (s.occupant || s.disabled) continue;
      // cheap reject before the full transform (there are hundreds of seats):
      // static seats store world positions, others sit within |pos| of their
      // body, whose position is read from Rapier at most once per physics step
      if (s.body === sb) { if (Math.abs(s.pos[0] - c.x) > maxD + 1.6 || Math.abs(s.pos[2] - c.z) > maxD + 1.6) continue; }
      else {
        // (stepCount is still undefined before the first step: no cache yet)
        if (s.seenStep !== this.stepCount || !s.seen) { s.seen = s.body.translation(); s.seenStep = this.stepCount; }
        const R = maxD + 1.6 + (s.reach ??= Math.hypot(s.pos[0], s.pos[1], s.pos[2]));
        if (Math.abs(s.seen.x - c.x) > R || Math.abs(s.seen.z - c.z) > R) continue;
      }
      const t = s.body.translation(), r = s.body.rotation();
      v.set(s.pos[0], s.pos[1], s.pos[2]).applyQuaternion(q.set(r.x, r.y, r.z, r.w)).add(new THREE.Vector3(t.x, t.y, t.z));
      const d = v.distanceTo(new THREE.Vector3(c.x, c.y, c.z)) - (s.kind === 'driver' ? 1.5 : 0);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  handlePlayerInput(p, d) {
    this.emotes?.input(p, d); // may zero move/look while the emote wheel is open
    const inp = d.state, pr = d.pressed;
    if (pr.interact) {
      if (p.seat) p.leaveSeat();
      else if (p.state !== 'limp') {
        const s = this.nearestSeat(p);
        if (s) { if (s.use) s.use(p); else p.sitIn(s); } // use spots: buttons, machines
      }
    }
    if (p.seat?.vehicle && p.seat.kind === 'driver') {
      p.seat.vehicle.control(inp);
      if (pr.horn || (pr.punch && !inp.mouse)) p.seat.vehicle.honk();
    }
    if (p.seat?.control) p.seat.control(inp, pr);
  }

  step() {
    this.stepCount = (this.stepCount || 0) + 1; // nearestSeat's position cache
    const pxz = this.playerXZ ||= [];
    pxz.length = 0;
    for (const p of this.players) { const c = p.chest.translation(); pxz.push(c.x, c.z); }
    const blank = { state: {}, pressed: {} };
    for (const p of this.players) {
      const d = this.paused ? null : this.input.get(p.deviceId);
      const st = d ? d.state : blank.state, pr = d && d.latch ? d.latch : blank.pressed;
      if (d) d.latch = null;
      const driving = p.seat && p.seat.kind === 'driver';
      const inp = driving ? { ...st, moveX: 0, moveY: 0, grabL: 0, grabR: 0 } : st;
      p.step(inp, driving ? { ragdoll: false, dash: false, jump: false, punch: false } : pr);
    }
    const held = this._held ||= new Set(); held.clear(); // bodies in someone's hands stay awake (grab-on vehicles)
    for (const p of this.players) for (const h of ['L', 'R']) if (p.hands?.[h]?.body) held.add(p.hands[h].body);
    for (const v of this.vehicles) {
      if (v.culled) continue; // far from every player (simcull.js)
      if (v.rail) { railStep(v, DT); continue; } // far self-driving traffic, out of the physics
      // a parked, empty vehicle at rest sleeps: its wheel controller would
      // otherwise nudge it every step and keep the solver busy forever
      const b = v.body, empty = !v.route && !v.seats.some((s) => s.occupant) && !held.has(b);
      if (b.isSleeping()) { if (empty) continue; b.wakeUp(); } // someone got in: wake it
      v.update();
      if (empty && !v.def.boat) {
        const lv = b.linvel(), av = b.angvel();
        if (lv.x * lv.x + lv.y * lv.y + lv.z * lv.z < 0.04 && av.x * av.x + av.y * av.y + av.z * av.z < 0.02) { if ((v.stillT = (v.stillT || 0) + DT) > 1) { b.sleep(); v.stillT = 0; } }
        else v.stillT = 0;
      }
    }
    for (const f of this.steppers) f();
    this.physics.step();
  }

  // Browsers only start audio after a user action, and the DOM events audio.js
  // listens for (keys, clicks, touches) never fire for a controller. Try on
  // every controller button press until it runs (Chrome counts the press as
  // the gesture); if it still can't start once someone is playing, say how.
  wakeAudio() {
    const a = this.audio;
    if (!a || a.running()) { this.audioHint = false; return; }
    // any button or stick on any controller, read straight from the browser
    // (like Spider Swingers' input.anyActivity), so nothing in our own input
    // mapping can swallow the first press
    const pads = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    for (const pad of pads) {
      if (pad && (pad.buttons.some((b) => b.pressed) || pad.axes.some((v) => Math.abs(v) > 0.5))) { a.start(); break; }
    }
    if (this.players.length && !this.audioHint && this.time > (this.audioHintAt ??= this.time + 3) && !a.running() && a.audible()) {
      this.audioHint = true;
      this.ui.toast('🔇 Sound is off until you click or press a key');
    }
  }

  // Auto resolution (settings.res = 0): frames averaging over ~22 ms for 2 s drop the
  // render scale a step (down to 60%), comfortably fast frames for 6 s raise it again.
  adaptResolution(dt) {
    const A = this.adapt ||= { avg: 1 / 60, slow: 0, fast: 0 };
    A.avg += (dt - A.avg) * 0.1;
    if (settings.res !== 0 || !this.players.length || this.paused) { A.slow = A.fast = 0; return; }
    if (A.avg > 0.022) { A.fast = 0; if ((A.slow += dt) > 1.5 && this.resScale > 0.6) { this.setResScale(Math.round((this.resScale - 0.1) * 10) / 10); A.slow = 0; } }
    else if (A.avg < 0.0172) { A.slow = 0; if ((A.fast += dt) > 6 && this.resScale < 1) { this.setResScale(Math.round((this.resScale + 0.1) * 10) / 10); A.fast = 0; } }
    else A.slow = A.fast = 0;
  }

  frame(dt) {
    dt = Math.max(0, Math.min(dt, 0.1));
    this.adaptResolution(dt);
    const tFrame = performance.now();
    this.time += dt;
    this.input.poll();
    this.wakeAudio();
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
      // at most two physics steps per frame: on a slow frame the world runs a
      // little slow instead of spending even longer catching up (and falling further behind)
      const tStep = performance.now();
      while (this.acc >= DT && n < 2) { this.step(); this.acc -= DT; n++; }
      this.perf.step = performance.now() - tStep;
      if (n === 2) this.acc = Math.min(this.acc, DT);
      this.physics.recover();
      this.physics.alpha = Math.min(1, this.acc / DT);
    } else this.physics.alpha = 1;
    for (const f of this.updaters) f(dt, this.time);
    this.physics.sync();
    for (const p of this.players) p.sync();
    for (const v of this.vehicles) v.sync();
    this.audio.updateEngines(this.vehicles);
    const tRender = performance.now();
    this.render(dt);
    const P = this.perf;
    P.render = performance.now() - tRender; P.frame = performance.now() - tFrame; P.dt = dt;
    if (settings.showFps) this.ui.perfOverlay?.(P);
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
      const props = new Set(this.physics.objects.map((ob) => ob.mesh).filter(Boolean));
      const vehs = new Set(this.vehicles.map((v) => { let a = v.shell || v.group || v.mesh; while (a && a.parent && a.parent !== this.scene) a = a.parent; return a; }));
      const list = [];
      const box = new THREE.Box3(), sph = new THREE.Sphere();
      for (const o of this.scene.children) {
        if (o.isLight || o === this.sky || o.userData.noCull) continue;
        if (o.isMesh && o.position.lengthSq() === 0 && !o.userData.dynamic) continue; // merged static chunk
        if (this.players.some((p) => p.group === o)) continue;
        // besides the size test, details stop at a distance: loose props by 160 m,
        // vehicles by 220 m, any other small thing by 350 m
        const maxD = props.has(o) ? 160 : vehs.has(o) ? 220 : 350;
        box.setFromObject(o);
        if (box.isEmpty()) continue;
        box.getBoundingSphere(sph);
        if (sph.radius > 9) continue;
        list.push({ o, r: Math.max(sph.radius, 0.3), maxD2: maxD * maxD });
      }
      this.cullList = { n: this.scene.children.length, list };
    }
    const k = 260 * viewH / 720; // pixels-ish: cull when radius / distance < 1/k
    const cp = cam.position;
    for (const it of this.cullList.list) {
      const p = it.o.position, d2 = (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2 + (p.y - cp.y) ** 2;
      const lim = it.r * k, show = d2 < lim * lim && d2 < it.maxD2;
      // only undo our own hiding: other code may hide objects too
      if (it.hid) { if (show) { it.o.visible = true; it.hid = false; } }
      else if (!show && it.o.visible) { it.o.visible = false; it.hid = true; }
    }
  }

  // Per-view level of detail for things the chunk / small-object culling misses:
  // - instanced sets laid out once (chairlift chairs, fish, decorations...) were drawn
  //   from anywhere with frustum culling off: they get a bounding sphere (+15 m for
  //   their motion) and hide beyond 700 m (only ever un-hidden by us);
  // - vehicle wheels go beyond 120 m (the body still reads).
  // Switch the characters' look style at runtime (Settings > Toy style characters).
  setCharStyle(id) {
    setCharStyle(id); resetCharCaches(); clearFaceCache();
    for (const p of this.players) { p.restyle(); setFace(p, p.face || 0); }
    for (const n of this.npcs?.list || []) { n.restyle(); n.applyLook(); }
  }

  // Distance gates for animations and per-step checks: true while some player
  // is within r metres (horizontally) of (x, z); positions are sampled at the
  // start of each step. With nobody playing (title screen) everything counts as near.
  nearPlayer(x, z, r) {
    const P = this.playerXZ;
    if (!P || !P.length) return true;
    for (let i = 0; i < P.length; i += 2) { const dx = P[i] - x, dz = P[i + 1] - z; if (dx * dx + dz * dz < r * r) return true; }
    return false;
  }
  // Wraps an animator / stepper / updater so it only runs near a player
  // (re-checked every 15 calls). Animators driven by the clock pick up where
  // they should be when someone comes back.
  whenNear(x, z, r, fn) {
    let k = 0, on = true;
    return (...a) => { if (k++ % 15 === 0) on = this.nearPlayer(x, z, r); if (on) return fn(...a); };
  }

  lodView(cam) {
    if (!this.instLOD || this.instLOD.n !== this.scene.children.length) {
      const list = this.instLOD?.list || [];
      for (const o of this.scene.children) {
        if (!o.isInstancedMesh || o.frustumCulled || o.userData.noCull || o === this.skyRig?.clouds || list.some((it) => it.o === o)) continue;
        o.computeBoundingSphere(); o.boundingSphere.radius += 15; o.frustumCulled = true;
        list.push({ o, hid: false });
      }
      this.instLOD = { n: this.scene.children.length, list };
    }
    const p = cam.position;
    for (const it of this.instLOD.list) {
      const s = it.o.boundingSphere, far = p.distanceTo(s.center) - s.radius > 700;
      if (far && it.o.visible) { it.o.visible = false; it.hid = true; } else if (!far && it.hid) { it.o.visible = true; it.hid = false; }
    }
    const night = this.isNight;
    for (const v of this.vehicles) {
      if (!v.lod) { // once per vehicle: its small parts (wheels, glass, light panels) never cast shadows (they sit in the body's)
        const wheels = new Set(v.wheelMeshes || []), lights = [];
        for (const r of [v.shell, v.group, v.mesh]) r?.traverse((o) => {
          if (!o.isMesh) return;
          const basic = o.material?.type === 'MeshBasicMaterial';
          if (wheels.has(o) || o.material?.transparent || basic) o.castShadow = false;
          if (basic && !wheels.has(o)) lights.push(o);
        });
        v.lod = { lights, lightsShown: true };
      }
      const t = v.body.translation(), d2 = (t.x - p.x) ** 2 + (t.z - p.z) ** 2;
      if (v.wheelMeshes?.length) {
        const near = d2 < 120 * 120;
        if (v.wheelsShown !== near) { v.wheelsShown = near; for (const w of v.wheelMeshes) if (w) w.visible = near; }
      }
      // light panels (head / tail lights, sirens): only up close by day, everywhere at night
      const show = night || d2 < 70 * 70;
      if (v.lod.lightsShown !== show) { v.lod.lightsShown = show; for (const m of v.lod.lights) m.visible = show; }
    }
    // loose props only cast shadows near the camera (each small shadow far off is a draw call)
    for (const o of this.physics.objects) {
      if (o.kind === 'ride' || !o.mesh || o.culled) continue;
      if (!o.casters) { o.casters = []; o.mesh.traverse((m) => { if (m.isMesh && m.castShadow) o.casters.push(m); }); }
      if (!o.casters.length) continue;
      const q = o.mesh.position, cast = (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 35 * 35;
      if (o.shadowNear !== cast) { o.shadowNear = cast; for (const m of o.casters) m.castShadow = cast; }
    }
  }

  // Merged static chunks (world/kit.js) far from this camera are hidden, except
  // tall ones (towers, the bridge, skyscrapers) that read as silhouettes.
  farCull(cam) {
    const list = this.staticChunks;
    if (!list) return;
    const p = cam.position;
    // split screen draws the scene once per view: keep ordinary chunks a bit closer there
    const split = this.players.length > 1, near = split ? 560 : 760, lod = split ? 120 : 160;
    for (const c of list) {
      const d = Math.hypot(c.x - p.x, c.z - p.z) - c.r, show = d < (c.tall ? 2400 : near);
      // past `lod` metres a chunk draws its far version (big pieces only, no shadows; world/kit.js)
      const farOn = show && !!c.far && d > lod;
      c.mesh.visible = show && !farOn;
      if (c.far) c.far.visible = farOn;
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
      else { fog.color.copy(sky.fogColor); fog.near = 80 + 100 * this.dayLight; fog.far = sky.fogFar; }
    };
    r.info.autoReset = false;
    r.info.reset();
    this.sun.castShadow = this.shadows;
    const viewDraw = (cam, x, y, w, h, under) => {
      setFog(cam, under);
      sky.view(cam, under, fog.color);
      this.cullSmall(cam, h);
      this.farCull(cam);
      this.interiorLights?.view(cam);
      for (const h of this.viewHooks) h(cam); // per-view level of detail (e.g. world/fair/common.js)
      this.lodView(cam);
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
      cam.aspect = w / h;
      // a side panel open (the customiser): shift the picture so the character stands beside it
      if (p.viewShift) cam.setViewOffset(w, h, -p.viewShift * w, 0, w, h);
      else if (cam.view?.enabled) cam.clearViewOffset();
      cam.updateProjectionMatrix();
    });
    if (this.players.length) {
      const groups = this.shadowGroups(views);
      // players apart need one shadow pass each: use a smaller map so those passes stay cheap
      const want = this.players.length > 1 ? 1024 : 2048; // split screen: a smaller map for every shadow pass
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
      // (not the vehicle you're hanging off: swinging into it as it flies isn't being run over)
      const holding = a instanceof Player && (a.hands?.L.owner === b || a.hands?.R.owner === b);
      if (a instanceof Player && b instanceof Vehicle && m > 1500 && a.state !== 'seated' && !holding) {
        // speed before this step: the hit itself may already have slowed the car
        if (Math.abs(b.speed) > 3.5) { a.knockOut(2.5); a.impactGrace = 0.5; }
      }
    }
    // people (players and NPCs) have their own land / knock-out sounds: bumping into
    // someone, or them toppling onto the ground, plays no extra thud (it sounded odd);
    // only a vehicle hitting someone still does
    if ((o1 instanceof Player || o2 instanceof Player) && !(o1 instanceof Vehicle || o2 instanceof Vehicle)) return;
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
