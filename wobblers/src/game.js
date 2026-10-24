// Game: renderer, split-screen views, fixed-step physics loop, players.
import * as THREE from 'three';
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
    const hemi = new THREE.HemisphereLight(0xcfeaff, 0x6a8a4a, 1.25);
    this.scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
    this.scene.add(sun, sun.target);
    // sky dome
    const skyGeo = new THREE.SphereGeometry(800, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3d9cff) }, bottom: { value: new THREE.Color(0xd8f1ff) }, sun: { value: this.sunDir } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; varying vec3 vP;
        void main(){ float h = clamp(vP.y*1.4+0.15,0.0,1.0); vec3 c = mix(bottom, top, pow(h,0.8));
        float s = max(dot(normalize(vP), sun),0.0); c += vec3(1.0,0.9,0.6)*pow(s,400.0)*1.5 + vec3(1.0,0.85,0.5)*pow(s,8.0)*0.18;
        gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
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

  render(dt) {
    const r = this.renderer;
    const views = this.views();
    // shadow follows the players' centre
    const c = new THREE.Vector3();
    if (this.players.length) {
      for (const p of this.players) { const t = p.chest.translation(); c.add(new THREE.Vector3(t.x, t.y, t.z)); }
      c.divideScalar(this.players.length);
    } else c.copy(this.idleTarget || new THREE.Vector3());
    // snap to texel grid to avoid shimmering
    const snap = 120 / 2048;
    c.x = Math.round(c.x / snap) * snap; c.z = Math.round(c.z / snap) * snap;
    this.sun.position.copy(c).addScaledVector(this.sunDir, 200);
    this.sun.target.position.copy(c);
    this.sun.castShadow = this.shadows;
    r.shadowMap.needsUpdate = this.shadows;
    const H = innerHeight;
    if (!this.players.length) {
      const cam = this.idleCam;
      const t = this.time * 0.05;
      cam.position.set(Math.sin(t) * 60, 28, Math.cos(t) * 60 + 10);
      cam.lookAt(0, 4, 0);
      cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
      this.sky.position.copy(cam.position);
      r.setViewport(0, 0, innerWidth, innerHeight); r.setScissor(0, 0, innerWidth, innerHeight);
      r.render(this.scene, cam);
    }
    this.players.forEach((p, i) => {
      const [x, y, w, h] = views[i];
      const d = this.input.get(p.deviceId);
      p.camera.update(d && !this.paused ? d.state : { lookX: 0, lookY: 0 }, dt);
      const cam = p.camera.cam;
      cam.aspect = w / h; cam.updateProjectionMatrix();
      this.sky.position.copy(cam.position);
      this.scene.fog.color.set(p.camera.underwater ? 0x2a7fb0 : 0xbfe6ff);
      this.scene.fog.near = p.camera.underwater ? 1 : 140; this.scene.fog.far = p.camera.underwater ? 28 : 620;
      r.setViewport(x, H - y - h, w, h);
      r.setScissor(x, H - y - h, w, h);
      r.render(this.scene, cam);
      r.shadowMap.needsUpdate = false;
    });
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
