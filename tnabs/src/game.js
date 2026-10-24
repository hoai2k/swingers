// Game flow: title -> simultaneous 2-player army setup -> battle -> result -> replay.
import { THREE, clamp, rand, damp, lerp } from './util.js';
import { initPhysics } from './physics.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI, btn } from './ui.js';
import { FACTIONS, UNITS, UNIT_BY_ID, unitsOfFaction } from './units.js';
import { MAPS, Terrain, buildScene, zoneMesh, FIELD, ZONE_GAP } from './world.js';
import { buildUnitVisual, disposeVisual, poseVisual, setExpression, renderPortraits, TEAM_COLORS, TEAM_NAMES } from './visual.js';
import { makeSkeleton, PART, NPARTS } from './body.js';
import { CamRig } from './camera.js';
import { Battle } from './battle.js';
import { FX } from './fx.js';
import { ProjViz } from './projviz.js';
import { Recorder, Player } from './replay.js';

const BUDGETS = [1000, 2500, 5000, 10000, 25000, Infinity];
const CAPS = [40, 80, 120, 180];
const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const STORE = 'tnabs.v1';

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function saveStore(o) {
  try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* storage unavailable */ }
}

const SKEL_CACHE = new Map();
const skelOf = (def) => {
  let s = SKEL_CACHE.get(def.id);
  if (!s) { s = makeSkeleton(def.build); SKEL_CACHE.set(def.id, s); }
  return s;
};

export class Game {
  constructor(canvas, hud) {
    this.canvas = canvas;
    this.low = /[?&]q=low/.test(location.search);
    const r = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: 'high-performance' });
    r.setPixelRatio(this.low ? 0.5 : Math.min(2, devicePixelRatio));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    this.input = new Input();
    this.audio = new Audio();
    this.ui = new UI(hud);
    const st = loadStore();
    this.settings = Object.assign({ map: 0, budget: 2, cap: 2, blood: true, music: true }, st.settings || {});
    this.armies = st.armies || [[], []];
    this.rigs = [new CamRig(), new CamRig()];
    this.split = false;
    this.timeScale = 1;
    this.speedIdx = 3;
    this.hints = true;
    this.state = 'boot';
    this.shake = 0;
    this.ps = [0, 1].map(() => ({ faction: 0, unit: 0, ready: false, ghost: null, ghostId: null, last: null, clearT: 0, removeT: 0, cursor: null, valid: false }));
    const unlock = () => this.audio.unlock();
    addEventListener('keydown', unlock);
    addEventListener('mousedown', unlock);
    addEventListener('touchstart', unlock);
    addEventListener('resize', () => this.resize());
    window.__tabs = this;
  }

  async init(progress) {
    progress?.('Warming up the physics…');
    await initPhysics();
    progress?.('Painting the soldiers…');
    await new Promise((r) => setTimeout(r, 20));
    this.ui.portraits = renderPortraits(UNITS, 112);
    this.ui.buildTitle();
    this.ui.buildSetup();
    this.ui.buildBattle();
    this.ui.buildReplay();
    progress?.('Growing the grass…');
    await new Promise((r) => setTimeout(r, 20));
    this.loadMap(this.settings.map);
    this.resize();
    this.goTitle();
    this.last = performance.now();
    const loop = (t) => { this.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  save() { saveStore({ settings: this.settings, armies: this.armies.map((a) => a.map(({ type, x, z }) => ({ type, x: +x.toFixed(2), z: +z.toFixed(2) }))) }); }

  get budget() { return BUDGETS[this.settings.budget]; }
  get cap() { return CAPS[this.settings.cap]; }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  // ---------------------------------------------------------------- map
  loadMap(i) {
    this.disposeBattle();
    const map = MAPS[i];
    this.map = map;
    if (this.scene) this.scene.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
    this.scene = new THREE.Scene();
    this.terrain = new Terrain(map, i + 1);
    const env = buildScene(this.scene, map, this.terrain);
    if (this.low) env.sun.shadow.mapSize.set(1024, 1024);
    this.env = env;
    this.zones = [
      zoneMesh(this.terrain, -FIELD.x, -ZONE_GAP, -FIELD.z, FIELD.z, TEAM_COLORS[0]),
      zoneMesh(this.terrain, ZONE_GAP, FIELD.x, -FIELD.z, FIELD.z, TEAM_COLORS[1]),
    ];
    this.zones.forEach((z) => this.scene.add(z));
    this.fx = new FX(this.scene, this.terrain);
    this.fx.blood = this.settings.blood;
    this.projViz = new ProjViz(this.scene, this.fx);
    this.snow = null;
    if (map.snow) {
      const n = 2500, pos = new Float32Array(n * 3);
      for (let k = 0; k < n * 3; k++) pos[k] = rand(-40, 40);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
      this.snow.frustumCulled = false;
      this.scene.add(this.snow);
    }
    // rebuild placed unit visuals on the new ground
    this.setupVis = [[], []];
    for (let t = 0; t < 2; t++) {
      const keep = [];
      for (const a of this.armies[t]) if (UNIT_BY_ID[a.type]) { keep.push(a); this.addSetupVis(t, a); }
      this.armies[t] = keep;
    }
    for (const p of this.ps) { p.ghost = null; p.ghostId = null; }
    this.titleUnits = null;
  }

  addSetupVis(team, a) {
    const def = UNIT_BY_ID[a.type];
    const vis = buildUnitVisual(def, team, { skel: skelOf(def) });
    vis.entry = a;
    vis.team = team;
    vis.st = { phase: 0, amp: 0, style: def.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0, mode: def.personality.idle === 'play' ? 'play' : 'normal', t: rand(0, 10), bob: 0 };
    this.scene.add(vis.root);
    this.setupVis[team].push(vis);
    return vis;
  }

  poseIdle(vis, dt, yaw) {
    const st = vis.st;
    st.t += dt;
    const def = UNIT_BY_ID[vis.entry.type];
    const idle = def.personality.idle;
    st.bob = idle === 'bounce' || idle === 'hop' ? Math.abs(Math.sin(st.t * (idle === 'hop' ? 7 : 4))) * 0.06 * vis.skel.scale : Math.sin(st.t * 1.7) * 0.012;
    st.headYaw = Math.sin(st.t * 0.6 + vis.entry.x) * 0.35;
    st.headPitch = idle === 'pray' ? 0.35 : 0;
    st.crouch = idle === 'brace' ? 0.15 : 0;
    st.lean = idle === 'regal' ? -0.1 : idle === 'lean' ? 0.12 : 0;
    const a = vis.entry;
    poseVisual(vis, a.x, this.terrain.height(a.x, a.z), a.z, yaw, st);
  }

  // ---------------------------------------------------------------- loop
  frame(now) {
    this.ui.root.dataset.state = this.state;
    this.ui.root.dataset.hud = this.hudMode === 2 ? 'off' : 'on';
    const dt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    this.input._dt = dt;
    this.input.poll(dt);
    this.audio.beginFrame();
    if (this.input.anyPressed('a') || this.input.anyPressed('start')) this.audio.unlock();
    switch (this.state) {
      case 'title': this.updateTitle(dt); break;
      case 'setup': this.updateSetup(dt); break;
      case 'battle': case 'result': case 'paused': this.updateBattle(dt); break;
      case 'replay': this.updateReplay(dt); break;
    }
    if (this.snow) {
      const p = this.snow.geometry.attributes.position;
      const c = this.rigs[0].pos;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 1.5;
        if (y < -10) y += 40;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(y * 0.3 + i) * dt * 0.3);
      }
      p.needsUpdate = true;
      this.snow.position.set(Math.round(c.x / 10) * 10, c.y - 5, Math.round(c.z / 10) * 10);
    }
    this.render(dt);
  }

  views() {
    if (this.state === 'setup') return [0, 1];
    if (this.state === 'title') return [0];
    return this.split ? [0, 1] : [0];
  }

  render(dt) {
    const r = this.renderer;
    const w = r.domElement.width / r.getPixelRatio(), h = r.domElement.height / r.getPixelRatio();
    const vs = this.views();
    r.shadowMap.needsUpdate = true;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.audio.setListeners(vs.map((v) => this.rigs[v]));
    r.setScissorTest(vs.length > 1);
    vs.forEach((v, i) => {
      const rig = this.rigs[v];
      const vw = vs.length > 1 ? w / 2 : w;
      rig.cam.aspect = vw / h;
      rig.cam.fov = vs.length > 1 ? 70 : 62;
      rig.cam.updateProjectionMatrix();
      if (this.shake > 0) rig.cam.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.shake * 0.15));
      r.setViewport(i * vw, 0, vw, h);
      r.setScissor(i * vw, 0, vw, h);
      r.render(this.scene, rig.cam);
      rig.apply();
    });
  }

  // ---------------------------------------------------------------- title
  goTitle() {
    this.disposeBattle();
    this.state = 'title';
    this.ui.only('title');
    this.titleSel = 0;
    this.zones.forEach((z) => (z.visible = false));
    this.hideGhosts();
    this.audio.startMusic('title');
    this.titleT = 0;
    // show the current armies, or a demo line-up if both are empty
    if (!this.armies[0].length && !this.armies[1].length && !this.titleUnits) {
      this.titleUnits = UNITS.map((d, i) => {
        const vis = buildUnitVisual(d, i % 2, { skel: skelOf(d) });
        vis.entry = { type: d.id, x: (i - UNITS.length / 2) * 2.2 + (d.build.scale > 2 ? 0 : 0), z: (i % 2) * 2.5 - 6 };
        vis.st = { phase: 0, amp: 0, style: d.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0, mode: d.personality.idle === 'play' ? 'play' : 'normal', t: rand(0, 10) };
        this.scene.add(vis.root);
        return vis;
      });
    }
  }

  titleItems() {
    const s = this.settings;
    return [
      { label: 'BATTLE!' },
      { label: 'Map', value: MAPS[s.map].name },
      { label: 'Budget per army', value: BUDGETS[s.budget] === Infinity ? 'Unlimited' : BUDGETS[s.budget].toLocaleString('en-US') },
      { label: 'Unit limit per army', value: CAPS[s.cap] },
      { label: 'Blood', value: s.blood ? 'On' : 'Off' },
      { label: 'Music', value: s.music ? 'On' : 'Off' },
      { label: 'Controls' },
    ];
  }

  updateTitle(dt) {
    const I = this.input;
    this.titleT += dt;
    const a = this.titleT * 0.06;
    this.rigs[0].set(Math.sin(a) * 24, 7 + Math.sin(a * 1.3) * 2, Math.cos(a) * 24 - 4, 0, 0);
    this.rigs[0].lookAtPoint(0, 1.5, -4);
    this.rigs[0].apply();
    for (const v of this.titleUnits || []) this.poseIdle(v, dt, Math.atan2(this.rigs[0].pos.x - v.entry.x, this.rigs[0].pos.z - v.entry.z) * 0.6);
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.poseIdle(v, dt, t === 0 ? Math.PI / 2 : -Math.PI / 2);
    if (this.helpOn) {
      if (I.anyPressed('b') || I.anyPressed('a') || I.anyPressed('start')) { this.helpOn = false; this.ui.setHelp(false); }
      return;
    }
    const items = this.titleItems();
    for (let p = 0; p < 2; p++) {
      if (I.repeat(p, 'down') || I.stickDir(p, 'ly', 1)) { this.titleSel = (this.titleSel + 1) % items.length; this.audio.play('click'); }
      if (I.repeat(p, 'up') || I.stickDir(p, 'ly', -1)) { this.titleSel = (this.titleSel + items.length - 1) % items.length; this.audio.play('click'); }
      let d = 0;
      if (I.repeat(p, 'right') || I.stickDir(p, 'lx', 1)) d = 1;
      if (I.repeat(p, 'left') || I.stickDir(p, 'lx', -1)) d = -1;
      const s = this.settings;
      if (d || I.pressed(p, 'a')) {
        const k = d || 1;
        switch (this.titleSel) {
          case 1: s.map = (s.map + k + MAPS.length) % MAPS.length; this.loadMap(s.map); this.goTitle(); break;
          case 2: s.budget = (s.budget + k + BUDGETS.length) % BUDGETS.length; break;
          case 3: s.cap = (s.cap + k + CAPS.length) % CAPS.length; break;
          case 4: s.blood = !s.blood; this.fx.blood = s.blood; break;
          case 5: s.music = !s.music; this.audio.setVolumes(0.8, s.music ? 0.45 : 0); break;
        }
        if (this.titleSel > 0) { this.audio.play('click'); this.save(); }
      }
      if ((I.pressed(p, 'a') && this.titleSel === 0) || I.pressed(p, 'start')) { this.goSetup(); return; }
      if (I.pressed(p, 'a') && this.titleSel === 6) { this.helpOn = true; this.ui.setHelp(true); }
    }
    this.ui.updateTitle(items, this.titleSel, I.padNames, !this.audio.ctx || this.audio.ctx.state !== 'running');
  }

  // ---------------------------------------------------------------- setup
  goSetup() {
    this.disposeBattle();
    if (this.titleUnits) { for (const v of this.titleUnits) disposeVisual(v); this.titleUnits = null; }
    this.state = 'setup';
    this.ui.only('setup');
    this.zones.forEach((z) => (z.visible = true));
    for (const p of this.ps) { p.ready = false; p.last = null; }
    this.countdown = 0;
    // each player starts behind their own army looking at the field
    this.rigs[0].release(); this.rigs[1].release();
    this.rigs[0].set(-FIELD.x - 6, 16, 0, Math.PI / 2, -0.45);
    this.rigs[1].set(FIELD.x + 6, 16, 0, -Math.PI / 2, -0.45);
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.resetVis(v);
    this.audio.startMusic('setup');
    this.audio.setVolumes(0.8, this.settings.music ? 0.45 : 0);
  }

  resetVis(v) {
    setExpression(v, 0);
    for (const it of v.items) it.visible = true;
    v.root.visible = true;
  }

  hideGhosts() { for (const p of this.ps) if (p.ghost) p.ghost.root.visible = false; }

  armyCost(t) { return this.armies[t].reduce((s, a) => s + UNIT_BY_ID[a.type].cost, 0); }

  inZone(t, x, z) {
    if (Math.abs(z) > FIELD.z) return false;
    return t === 0 ? x >= -FIELD.x && x <= -ZONE_GAP : x >= ZONE_GAP && x <= FIELD.x;
  }

  updateSetup(dt) {
    const I = this.input;
    for (let p = 0; p < 2; p++) this.updateSetupPlayer(p, dt);
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.poseIdle(v, dt, t === 0 ? Math.PI / 2 : -Math.PI / 2);
    const bothReady = this.ps[0].ready && this.ps[1].ready;
    if (bothReady) {
      if (this.countdown <= 0) { this.countdown = 3.0; this.audio.play('click', null, 1, 0.7); }
      const prev = this.countdown;
      this.countdown -= dt;
      if (Math.ceil(prev) !== Math.ceil(this.countdown) && this.countdown > 0) this.audio.play('click', null, 1, 0.8);
      if (this.countdown <= 0) { this.startBattle(); return; }
    } else this.countdown = 0;
    this.ui.setCountdown(this.countdown);
    if (I.anyPressed('back') && !bothReady) { /* reserved */ }
  }

  currentDef(p) {
    const ps = this.ps[p];
    const list = unitsOfFaction(FACTIONS[ps.faction].id);
    ps.unit = clamp(ps.unit, 0, list.length - 1);
    return list[ps.unit];
  }

  updateSetupPlayer(p, dt) {
    const I = this.input, s = I.state(p), rig = this.rigs[p], ps = this.ps[p];
    rig.update(s, dt, this.terrain, { speed: 13 });
    // unit selection
    const nf = FACTIONS.length;
    if (I.repeat(p, 'right')) { ps.unit++; if (ps.unit >= unitsOfFaction(FACTIONS[ps.faction].id).length) { ps.unit = 0; ps.faction = (ps.faction + 1) % nf; } this.audio.play('click', null, 0.5, 1.2); }
    if (I.repeat(p, 'left')) { ps.unit--; if (ps.unit < 0) { ps.faction = (ps.faction + nf - 1) % nf; ps.unit = unitsOfFaction(FACTIONS[ps.faction].id).length - 1; } this.audio.play('click', null, 0.5, 1.2); }
    if (I.repeat(p, 'down')) { ps.faction = (ps.faction + 1) % nf; ps.unit = 0; this.audio.play('click', null, 0.5, 1); }
    if (I.repeat(p, 'up')) { ps.faction = (ps.faction + nf - 1) % nf; ps.unit = 0; this.audio.play('click', null, 0.5, 1); }
    const def = this.currentDef(p);
    const skel = skelOf(def);

    // cursor + ghost
    const hit = rig.groundHit(this.terrain, 220);
    ps.cursor = hit;
    const used = this.armyCost(p);
    const army = this.armies[p];
    let valid = false, why = '';
    if (hit) {
      valid = true;
      if (!this.inZone(p, hit.x, hit.z)) { valid = false; why = 'Place units in your own zone'; }
      else if (used + def.cost > this.budget) { valid = false; why = 'Not enough gold'; }
      else if (army.length >= this.cap) { valid = false; why = 'Army is full'; }
      else {
        for (let t = 0; t < 2 && valid; t++) for (const a of this.armies[t]) {
          const r = (skelOf(UNIT_BY_ID[a.type]).radius + skel.radius) * 0.95;
          if ((a.x - hit.x) ** 2 + (a.z - hit.z) ** 2 < r * r) { valid = false; why = ''; break; }
        }
      }
    }
    ps.valid = valid;
    if (ps.ghostId !== def.id) {
      if (ps.ghost) disposeVisual(ps.ghost);
      ps.ghost = buildUnitVisual(def, p, { skel, ghost: true });
      ps.ghost.st = { phase: 0, amp: 0, style: def.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0, mode: 'normal', t: 0 };
      this.scene.add(ps.ghost.root);
      ps.ghostId = def.id;
    }
    const g = ps.ghost;
    g.root.visible = !!hit && !ps.ready;
    if (hit) {
      g.root.userData.ghostMat.color.set(valid ? TEAM_COLORS[p] : '#ff2222');
      g.root.userData.ghostMat.opacity = valid ? 0.5 : 0.35;
      g.st.t += dt;
      poseVisual(g, hit.x, hit.y, hit.z, p === 0 ? Math.PI / 2 : -Math.PI / 2, g.st);
    }

    if (!ps.ready) {
      // place (hold to paint a formation)
      if (I.down(p, 'a') && hit) {
        const spacing = skel.radius * 2.3 + 0.15;
        const far = !ps.last || Math.hypot(ps.last.x - hit.x, ps.last.z - hit.z) >= spacing;
        if (valid && (I.pressed(p, 'a') || far)) {
          const a = { type: def.id, x: hit.x, z: hit.z };
          army.push(a);
          this.addSetupVis(p, a);
          ps.last = { x: hit.x, z: hit.z };
          this.audio.play('place', null, 0.6, 0.9 + Math.random() * 0.2);
          this.save();
        } else if (I.pressed(p, 'a') && why) {
          this.ui.toast(`<span style="color:${TEAM_COLORS[p]}">${TEAM_NAMES[p]}:</span> ${why}`);
          this.audio.play('remove', null, 0.3, 0.6);
        }
      } else ps.last = null;
      // remove
      if (hit && I.repeat(p, 'b', 0.25, 0.08)) {
        let best = -1, bd = 1.6 ** 2;
        army.forEach((a, i) => { const d = (a.x - hit.x) ** 2 + (a.z - hit.z) ** 2; if (d < bd) { bd = d; best = i; } });
        if (best >= 0) {
          disposeVisual(this.setupVis[p].splice(best, 1)[0]);
          army.splice(best, 1);
          this.audio.play('remove', null, 0.6, 1);
          this.save();
        }
      }
      // clear all
      if (I.held(p, 'x') > 0.8 && !ps.cleared && army.length) {
        ps.cleared = true;
        for (const v of this.setupVis[p]) disposeVisual(v);
        this.setupVis[p] = [];
        army.length = 0;
        this.audio.play('remove', null, 0.8, 0.5);
        this.ui.toast(`${TEAM_NAMES[p]} army cleared`);
        this.save();
      }
      if (!I.down(p, 'x')) ps.cleared = false;
    }
    if (I.pressed(p, 'y') || I.pressed(p, 'start')) {
      if (!ps.ready && !army.length) this.ui.toast(`${TEAM_NAMES[p]}: place some units first!`);
      else { ps.ready = !ps.ready; this.audio.play(ps.ready ? 'place' : 'remove', null, 0.8, ps.ready ? 1.4 : 0.8); }
    }
    if (I.pressed(p, 'back')) { this.helpP = p; }

    const other = this.ps[1 - p];
    const xh = I.held(p, 'x');
    let status = '';
    if (ps.ready) status = other.ready ? '' : `Waiting for ${TEAM_NAMES[1 - p]}… ${btn('Y')} to unready`;
    else if (xh > 0.15 && army.length) status = `Clearing army… ${Math.round(Math.min(1, xh / 0.8) * 100)}%`;
    else status = `<b>${def.name}</b> <span class="desc">${def.desc}</span>`;
    this.ui.updateSetup(p, {
      faction: ps.faction, unit: ps.unit, used, budget: this.budget, count: army.length,
      ready: ps.ready, valid: valid || !hit, status,
    });
  }

  // ---------------------------------------------------------------- battle
  startBattle() {
    this.disposeBattle();
    this.hideGhosts();
    this.zones.forEach((z) => (z.visible = false));
    this.fx.clear();
    this.projViz.clear();
    this.battleVis = [...this.setupVis[0], ...this.setupVis[1]];
    for (const v of this.battleVis) this.resetVis(v);
    const armies = this.armies.map((a) => a.map(({ type, x, z }) => ({ type, x, z })));
    this.battle = new Battle(this.terrain, armies, (e) => this.onEvent(e, true));
    this.rec = new Recorder(this.battle);
    this.rec.capture(this.battle);
    this.state = 'battle';
    this.ui.only('battle');
    this.timeScale = 1;
    this.speedIdx = 3;
    this.paused = false;
    this.overShown = false;
    this.overAt = 0;
    for (const r of this.rigs) r.release();
    this.audio.startMusic('battle');
    this.audio.play('horn', null, 0.8, 1);
    this.hintT = 8;
    this.syncLive(0);
  }

  disposeBattle() {
    if (this.battle) {
      for (const u of this.battle.units) u.control = null;
      this.battle.destroy();
      this.battle = null;
    }
    this.player = null;
  }

  onEvent(e, live) {
    if (live && this.rec) this.rec.event(this.battle.time, e);
    const k = e[0];
    const pos = new THREE.Vector3(e[1], e[2], e[3]);
    if (k.startsWith('snd:')) this.audio.play(k.slice(4), pos, e[4], e[5]);
    else if (k === 'voice') this.audio.voice(pos, e[4], e[5], e[6]);
    else if (k === 'over') { /* handled by state */ }
    else {
      this.fx.event(e);
      if (k === 'explode') {
        let d = Infinity;
        for (const v of this.views()) d = Math.min(d, this.rigs[v].pos.distanceTo(pos));
        this.shake = Math.max(this.shake, clamp(1 - d / 40, 0, 1) * e[4] / 3);
      }
    }
  }

  syncLive(dt) {
    const b = this.battle;
    b.units.forEach((u, i) => {
      const vis = this.battleVis[i];
      const r = u.rag;
      for (let j = 0; j < NPARTS; j++) {
        vis.parts[j].position.copy(r.pos[j]);
        vis.parts[j].quaternion.copy(r.quat[j]);
      }
      setExpression(vis, u.expr);
      const w = u.def.weapon;
      if (w.kind === 'ranged' && w.style === 'throw') {
        u.itemHidden = u.st.attack ? u.st.attackT > (w.releaseAt || 0.7) : u.released && u.cooldown > w.cooldown * 0.4;
        for (const it of vis.items) it.visible = !u.itemHidden;
      }
    });
    this.projViz.fromBattle(b, dt);
  }

  mergedState() {
    const a = this.input.state(0), b = this.input.state(1);
    const s = { lx: clamp(a.lx + b.lx, -1, 1), ly: clamp(a.ly + b.ly, -1, 1), rx: clamp(a.rx + b.rx, -2, 2), ry: clamp(a.ry + b.ry, -2, 2), lt: Math.max(a.lt, b.lt), rt: Math.max(a.rt, b.rt), b: {} };
    for (const k of Object.keys(a.b)) s.b[k] = a.b[k] || b.b[k];
    return s;
  }

  // view v is driven by which players
  viewPlayers(v) { return this.split ? [v] : [0, 1]; }
  vPressed(v, k) { return this.viewPlayers(v).some((p) => this.input.pressed(p, k)); }

  updateBattle(dt) {
    const I = this.input, b = this.battle;
    // pause menu
    if (this.state === 'paused') { this.updatePause(); this.ui.updateBattle(this.battleHud()); return; }
    if (I.anyPressed('start') && this.state === 'battle') { this.openPause(); return; }
    if (I.anyPressed('back')) { this.toggleSplit(); }
    if (I.anyPressed('r3')) { this.hudMode = ((this.hudMode || 0) + 1) % 3; this.hints = this.hudMode === 0; }

    // time controls
    if (this.state === 'battle') {
      for (let p = 0; p < 2; p++) {
        if (I.pressed(p, 'y')) { this.speedIdx = this.speedIdx === 3 ? 1 : 3; this.ui.toast(this.speedIdx === 3 ? 'Normal speed' : 'Slow motion'); }
        if (I.repeat(p, 'up')) this.speedIdx = Math.min(SPEEDS.length - 1, this.speedIdx + 1);
        if (I.repeat(p, 'down')) this.speedIdx = Math.max(0, this.speedIdx - 1);
      }
    }
    this.timeScale = SPEEDS[this.speedIdx];

    // simulate
    const simDt = Math.min(dt, 1 / 20) * this.timeScale;
    const n = Math.max(1, Math.ceil(simDt / (1 / 60) - 1e-6));
    for (let i = 0; i < n; i++) {
      this.updateControl();
      b.step(simDt / n);
      this.rec.capture(b);
    }
    this.syncLive(simDt);
    this.fx.update(simDt);

    // cameras
    this.updateViewCams(dt, b.units);

    // battle over?
    if (b.over && this.state === 'battle') {
      if (!this.overAt) this.overAt = b.time;
      if (b.time - this.overAt > 1.2 || this.timeScale < 1 && b.time - this.overAt > 0.5) this.showResult();
    }
    if (this.state === 'result') {
      if (I.anyPressed('a')) { this.startReplay(); return; }
      if (I.anyPressed('x')) { this.startBattle(); return; }
      if (I.anyPressed('y')) { this.goSetup(); return; }
      if (I.anyPressed('b')) { this.goTitle(); return; }
    }
    this.ui.updateBattle(this.battleHud());
  }

  updateViewCams(dt, units, proxies) {
    const I = this.input;
    const vs = this.split ? [0, 1] : [0];
    for (const v of vs) {
      const rig = this.rigs[v];
      const s = this.split ? I.state(v) : this.mergedState();
      const live = this.state === 'battle';
      const list = proxies || units;
      if (live || this.state === 'replay') {
        if (this.vPressed(v, 'a') && rig.mode !== 'possess') {
          const u = rig.pickUnit(list);
          if (u) { rig.follow(u, 'follow'); rig.orbitDist = 5 * (u.s || 1); this.audio.play('click'); }
        }
        if (live && this.vPressed(v, 'x')) {
          const u = rig.mode === 'follow' && rig.unit?.alive ? rig.unit : rig.pickUnit(units, (o) => o.alive && !o.control);
          if (u && u.alive && !u.control) {
            u.control = { mx: 0, mz: 0, attack: false, jump: false, aimYaw: u.heading, aimPitch: 0.3 };
            rig.follow(u, 'possess');
            rig.yaw = u.heading;
            this.ui.toast(`Controlling ${TEAM_NAMES[u.team]} ${u.def.name}`);
          }
        }
        if (this.vPressed(v, 'b') && this.state !== 'replay') {
          if (rig.mode === 'possess' && rig.unit) rig.unit.control = null;
          rig.release();
        }
      }
      if (rig.mode === 'possess') {
        const u = rig.unit;
        if (!u || !u.alive) { if (u) u.control = null; rig.mode = 'follow'; }
        else {
          const fy = rig.yaw;
          const fx = Math.sin(fy), fz = Math.cos(fy), rx = -Math.cos(fy), rz = Math.sin(fy);
          const c = u.control;
          c.mx = fx * -s.ly + rx * s.lx;
          c.mz = fz * -s.ly + rz * s.lx;
          c.aimYaw = fy;
          c.aimPitch = clamp(rig.pitch + 0.35, 0.05, 1.1);
          c.attack = s.rt > 0.4;
          if (this.vPressed(v, 'a')) c.jump = true;
        }
      }
      rig.update(s, dt, this.terrain, { speed: s.lt > 0.3 && rig.mode === 'free' ? 12 * (1 - s.lt * 0.8) : 12, lookSpeed: s.lt > 0.3 ? 1.2 : 2.3 });
    }
  }

  updateControl() { /* possession input is written in updateViewCams; units read it in think() */ }

  battleHud() {
    const b = this.battle;
    const fr = this.state === 'replay' && this.player ? this.player.frameAt(this.player.t)?.a : null;
    const counts = fr ? fr.counts : b.stats().map((s) => s.alive);
    const vs = this.split ? [0, 1] : [0];
    const views = [null, null];
    for (const v of vs) {
      const rig = this.rigs[v];
      let label = this.split ? `<b style="color:${TEAM_COLORS[v]}">P${v + 1}</b> ` : '';
      if (rig.mode === 'follow' && rig.unit) {
        const u = rig.unit;
        label += `Following <b style="color:${TEAM_COLORS[u.team]}">${u.def.name}</b>${u.hp !== undefined ? hpBar(u) : ''}`;
      } else if (rig.mode === 'possess' && rig.unit) {
        const u = rig.unit;
        label += `Controlling <b style="color:${TEAM_COLORS[u.team]}">${u.def.name}</b>${hpBar(u)}`;
      } else label += 'Free camera';
      views[v] = { label, reticle: rig.mode === 'free' && this.state !== 'result' };
    }
    const anyPossess = vs.some((v) => this.rigs[v].mode === 'possess');
    const hintText = this.state === 'replay' ? '' : anyPossess
      ? `Possessing: L-stick walk &nbsp; ${btn('RT')} attack &nbsp; ${btn('A')} jump &nbsp; ${btn('B')} let go`
      : `${btn('A')} follow &nbsp; ${btn('X')} possess &nbsp; ${btn('B')} free cam &nbsp; ${btn('Y')} slow-mo &nbsp; ✥↑↓ speed &nbsp; ${btn('LT')} slow cam &nbsp; ${btn('View')} split screen &nbsp; ${btn('Start')} pause &nbsp; ${btn('R3')} hide tips/HUD`;
    return {
      counts, start: b.startCounts, scale: this.state === 'replay' ? 1 : this.timeScale, paused: this.state === 'paused',
      split: this.split, views, hints: this.hints && this.state !== 'result', hintText,
    };
  }

  toggleSplit() {
    this.split = !this.split;
    if (this.split) {
      // P2 picks up from P1's view
      const a = this.rigs[0], b = this.rigs[1];
      if (b.mode === 'free') b.set(a.pos.x, a.pos.y, a.pos.z, a.yaw, a.pitch);
    } else {
      const r = this.rigs[1];
      if (r.mode === 'possess' && r.unit) r.unit.control = null;
      r.release();
    }
    this.ui.toast(this.split ? 'Split screen' : 'Shared screen');
  }

  showResult() {
    this.state = 'result';
    const b = this.battle;
    this.ui.only('battle', 'result');
    this.ui.showResult({ winner: b.winner, stats: b.stats() });
    this.audio.play('fanfare', null, 0.9, 1);
    this.audio.startMusic('setup');
    for (const r of this.rigs) if (r.mode === 'possess' && r.unit) { r.unit.control = null; r.mode = 'follow'; }
    this.overAt = 0;
  }

  // ---------------------------------------------------------------- pause
  openPause() {
    this.state = 'paused';
    this.pauseSel = 0;
    this.ui.show('pause', true);
  }

  updatePause() {
    const I = this.input;
    const items = ['Resume', 'Restart battle', 'Edit armies', this.split ? 'Shared screen' : 'Split screen', 'Main menu'];
    for (let p = 0; p < 2; p++) {
      if (I.repeat(p, 'down') || I.stickDir(p, 'ly', 1)) this.pauseSel = (this.pauseSel + 1) % items.length;
      if (I.repeat(p, 'up') || I.stickDir(p, 'ly', -1)) this.pauseSel = (this.pauseSel + items.length - 1) % items.length;
      if (I.pressed(p, 'b') || I.pressed(p, 'start')) { this.closePause(); return; }
      if (I.pressed(p, 'a')) {
        this.ui.show('pause', false);
        switch (this.pauseSel) {
          case 0: this.closePause(); break;
          case 1: this.startBattle(); break;
          case 2: this.goSetup(); break;
          case 3: this.toggleSplit(); this.closePause(); break;
          case 4: this.goTitle(); break;
        }
        return;
      }
    }
    this.ui.updatePause(items, this.pauseSel);
  }

  closePause() { this.state = 'battle'; this.ui.show('pause', false); }

  // ---------------------------------------------------------------- replay
  startReplay() {
    this.state = 'replay';
    this.ui.only('battle', 'replay');
    this.player = new Player(this.rec);
    this.player.seek(0);
    this.player.playing = true;
    this.replaySpeedIdx = 3;
    this.fx.clear();
    this.projViz.clear();
    for (const r of this.rigs) { if (r.unit) r.unit.control = null; r.release(); }
    // camera proxies so you can follow units in the replay
    this.proxies = this.battleVis.map((vis, i) => ({
      vis, team: this.rec.units[i].team, def: UNIT_BY_ID[this.rec.units[i].type], s: vis.skel.scale,
      get chestPos() { return vis.parts[PART.chest].position; }, alive: true,
    }));
    this.audio.startMusic('battle');
  }

  updateReplay(dt) {
    const I = this.input, P = this.player;
    if (I.anyPressed('b') && !this.rigs.some((r) => r.mode !== 'free')) {
      // back to the live result screen
      this.state = 'result';
      this.ui.only('battle', 'result');
      this.player = null;
      this.fx.clear();
      this.audio.startMusic('setup');
      return;
    }
    if (I.anyPressed('b')) for (const r of this.rigs) r.release();
    if (I.anyPressed('back')) this.toggleSplit();
    if (I.anyPressed('r3')) this.hudMode = ((this.hudMode || 0) + 1) % 3;
    let scrub = 0;
    for (let p = 0; p < 2; p++) {
      const s = I.state(p);
      scrub += s.rt - s.lt;
      if (I.pressed(p, 'a') && this.rigs[0].mode === 'free') { P.playing = !P.playing; if (P.t >= P.duration) P.seek(0), (P.playing = true); }
      if (I.pressed(p, 'y')) { P.seek(0); P.playing = true; this.fx.clear(); }
      if (I.repeat(p, 'right')) P.seek(P.t + 2);
      if (I.repeat(p, 'left')) P.seek(P.t - 2);
      if (I.repeat(p, 'up')) this.replaySpeedIdx = Math.min(SPEEDS.length - 1, this.replaySpeedIdx + 1);
      if (I.repeat(p, 'down')) this.replaySpeedIdx = Math.max(0, this.replaySpeedIdx - 1);
      if (I.pressed(p, 'x')) {
        const rig = this.rigs[this.split ? p : 0];
        const u = rig.pickUnit(this.proxies);
        if (u) { rig.follow(u, 'follow'); rig.orbitDist = 5 * u.s; }
      }
    }
    P.speed = SPEEDS[this.replaySpeedIdx];
    const evs = P.advance(dt, Math.abs(scrub) > 0.05 ? scrub : 0);
    for (const e of evs) this.onEvent(e, false);
    const fr = P.apply(this.battleVis, this.projViz, dt * P.speed);
    if (fr) {
      this.battleVis.forEach((vis, i) => {
        const f = fr.us[i];
        setExpression(vis, f & 7);
        const hide = !!(f & 16);
        for (const it of vis.items) it.visible = !hide;
      });
    }
    this.fx.update(P.playing ? dt * P.speed : 0);
    // replay cameras: A on a free cam toggles play, so follow is on X here
    const vs = this.split ? [0, 1] : [0];
    for (const v of vs) {
      const s = this.split ? I.state(v) : this.mergedState();
      this.rigs[v].update(s, dt, this.terrain, { speed: 12 });
    }
    this.ui.updateReplay(P.t, P.duration, P.speed, P.playing);
    this.ui.updateBattle(this.battleHud());
  }
}

function hpBar(u) {
  const f = clamp(u.hp / u.maxHp, 0, 1);
  return ` <span class="hp"><i style="width:${f * 100}%"></i></span>${u.alive ? '' : ' <em>(dead)</em>'}`;
}
