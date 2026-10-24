// Game flow: title -> simultaneous 2-player army setup -> battle -> result -> replay.
import { THREE, clamp, rand, damp, lerp, ballisticAngle } from './util.js';
import { initPhysics } from './physics.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI, btn } from './ui.js';
import { FACTIONS, UNITS, UNIT_BY_ID, unitsOfFaction } from './units.js';
import { MAPS, Terrain, buildScene, zoneMesh, FIELD, ZONE_GAP } from './world.js';
import { buildUnitVisual, disposeVisual, poseVisual, setExpression, renderPortraits, TEAM_COLORS, TEAM_NAMES } from './visual.js';
import { makeSkeleton, PART, NPARTS } from './body.js';
import { CamRig } from './camera.js';
import { Battle, PROJ } from './battle.js';
import { FX } from './fx.js';
import { ProjViz } from './projviz.js';
import { Recorder, Player } from './replay.js';

const BUDGETS = [1000, 2500, 5000, 10000, 25000, Infinity];
const CAPS = [40, 80, 120, 180];
const SPEEDS = [0, 0.1, 0.25, 0.5, 1, 2]; // battle time scales (0 = frozen, photo mode)
const NORMAL = 4, SLOWMO = 2;
const RSPEEDS = [0.1, 0.25, 0.5, 1, 2]; // replay speeds
const LOOK = [0.6, 0.8, 1, 1.25, 1.6];
const QUALITY = [
  { name: 'Low', pr: 0.5, shadow: 1024 },
  { name: 'Medium', pr: 1, shadow: 2048 },
  { name: 'High', pr: 2, shadow: 4096 },
];
// placement brushes: w units across (perpendicular to the attack), d rows deep
const BRUSHES = [
  { name: 'Single', w: 1, d: 1 },
  { name: 'Line ×3', w: 3, d: 1 },
  { name: 'Line ×5', w: 5, d: 1 },
  { name: 'Block 3×3', w: 3, d: 3 },
  { name: 'Block 4×4', w: 4, d: 4 },
];
const STORE = 'tnabs.v1';
const FINAL_SECONDS = 6;

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function saveStore(o) {
  try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* storage unavailable */ }
}
const packArmy = (a) => a.map(({ type, x, z }) => ({ type, x: +x.toFixed(2), z: +z.toFixed(2) }));

const SKEL_CACHE = new Map();
const skelOf = (def) => {
  let s = SKEL_CACHE.get(def.id);
  if (!s) { s = makeSkeleton(def.build); SKEL_CACHE.set(def.id, s); }
  return s;
};
const teamTag = (t) => `<b style="color:${TEAM_COLORS[t]}">${TEAM_NAMES[t]}</b>`;
const onOff = (b) => (b ? 'On' : 'Off');

export class Game {
  constructor(canvas, hud) {
    this.canvas = canvas;
    const st = loadStore();
    this.settings = Object.assign({
      map: 0, budget: 2, cap: 2, blood: true, music: true,
      quality: 2, blind: false, split: false, look: 2, invertY: false,
    }, st.settings || {});
    this.low = /[?&]q=low/.test(location.search);
    this.quality = this.low ? 0 : clamp(this.settings.quality | 0, 0, QUALITY.length - 1);
    const r = new THREE.WebGLRenderer({ canvas, antialias: this.quality > 0, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    this.input = new Input();
    this.audio = new Audio();
    this.ui = new UI(hud);
    this.armies = st.armies || [[], []];
    this.mapArmies = st.maps || {};
    this.rigs = [new CamRig(), new CamRig()];
    this.split = !!this.settings.split;
    this.timeScale = 1;
    this.speedIdx = NORMAL;
    this.hudMode = 0;
    this.state = 'boot';
    this.shake = 0;
    this.ps = [0, 1].map(() => ({
      faction: 0, unit: 0, ready: false, ghosts: [], ghostId: null, last: null, cursor: null, valid: false,
      brush: 0, undo: [], stroke: null, rstroke: null, modal: null, hover: null,
    }));
    const unlock = () => this.audio.unlock();
    addEventListener('keydown', unlock);
    addEventListener('mousedown', unlock);
    addEventListener('touchstart', unlock);
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'battle') this.openPause();
    });
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
    this.loadMap(clamp(this.settings.map | 0, 0, MAPS.length - 1));
    this.applyQuality();
    this.goTitle();
    this.last = performance.now();
    const loop = (t) => { this.frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  save() {
    if (this.map) this.mapArmies[this.map.id] = packArmy2(this.armies);
    saveStore({ settings: this.settings, armies: packArmy2(this.armies), maps: this.mapArmies });
  }

  get budget() { return BUDGETS[this.settings.budget]; }
  get cap() { return CAPS[this.settings.cap]; }
  get lookOpts() { return { lookSpeed: 2.3 * LOOK[this.settings.look], invertY: this.settings.invertY }; }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  applyQuality() {
    const q = QUALITY[this.quality];
    this.renderer.setPixelRatio(q.pr >= 2 ? Math.min(2, devicePixelRatio || 1) : q.pr);
    if (this.env) {
      const sh = this.env.sun.shadow;
      if (sh.mapSize.x !== q.shadow) {
        sh.mapSize.set(q.shadow, q.shadow);
        if (sh.map) { sh.map.dispose(); sh.map = null; }
      }
    }
    this.resize();
  }

  // ---------------------------------------------------------------- map
  loadMap(i) {
    this.disposeBattle();
    // armies are kept per map: park the current ones, pick up the new map's
    if (this.map && this.map !== MAPS[i]) {
      this.mapArmies[this.map.id] = packArmy2(this.armies);
      const saved = this.mapArmies[MAPS[i].id];
      if (saved) this.armies = saved.map((a) => a.map((u) => ({ ...u })));
      for (const p of this.ps) { p.undo = []; p.stroke = p.rstroke = null; }
    }
    const map = MAPS[i];
    this.map = map;
    if (this.scene) {
      for (const p of this.ps) for (const g of p.ghosts) disposeVisual(g);
      for (const t of [0, 1]) for (const v of this.setupVis?.[t] || []) disposeVisual(v);
      for (const v of this.titleUnits || []) disposeVisual(v);
      this.scene.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
    }
    this.scene = new THREE.Scene();
    this.terrain = new Terrain(map, i + 1);
    const env = buildScene(this.scene, map, this.terrain);
    env.sun.shadow.mapSize.set(QUALITY[this.quality].shadow, QUALITY[this.quality].shadow);
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
    // setup cursor rings (one for the brush centre, one for the unit B would remove)
    this.rings = [0, 1].map((p) => {
      const mk = (col, inner) => {
        const g = new THREE.RingGeometry(inner, 1, 40);
        g.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
        m.renderOrder = 5;
        m.visible = false;
        this.scene.add(m);
        return m;
      };
      return { cursor: mk(TEAM_COLORS[p], 0.8), remove: mk('#ff3b30', 0.72), show: false, showRemove: false };
    });
    // rebuild placed unit visuals on the new ground
    this.setupVis = [[], []];
    for (let t = 0; t < 2; t++) {
      const keep = [];
      for (const a of this.armies[t]) if (UNIT_BY_ID[a.type]) { keep.push(a); this.addSetupVis(t, a); }
      this.armies[t] = keep;
    }
    for (const p of this.ps) { p.ghosts = []; p.ghostId = null; }
    this.titleUnits = null;
    this.battleVis = null;
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
    this.frameNo = (this.frameNo || 0) + 1;
    this.ui.root.dataset.state = this.state === 'paused' ? this.pauseFrom : this.state;
    this.ui.root.dataset.hud = this.hudMode === 2 ? 'off' : 'on';
    const dt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    this.input._dt = dt;
    this.input.poll(dt);
    this.audio.beginFrame();
    if (this.input.anyPressed('a') || this.input.anyPressed('start')) this.audio.unlock();
    this.padEvents();
    switch (this.state) {
      case 'title': this.updateTitle(dt); break;
      case 'setup': this.updateSetup(dt); break;
      case 'battle': case 'result': this.updateBattle(dt); break;
      case 'replay': this.updateReplay(dt); break;
      case 'paused': this.updatePause(dt); break;
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

  // controller hot-plug: announce it, and never leave a game running for a pad that vanished
  padEvents() {
    const I = this.input;
    for (const e of I.events.splice(0)) {
      const who = `P${e.player + 1} ${teamTag(e.player)}`;
      if (e.type === 'connect') {
        this.ui.toast(`🎮 ${who}: controller connected`, 2.2);
        I.rumble(e.player, 0.3, 0.6, 180);
      } else {
        this.ui.toast(`⚠ ${who}: controller disconnected`, 3.5);
        if (this.state === 'battle' || this.state === 'result' || this.state === 'replay') this.openPause(`P${e.player + 1}'s controller disconnected. Reconnect it, or keep going with the other pad.`);
        if (this.state === 'setup') this.ps[e.player].ready = false;
      }
    }
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
      const fov = clamp((vs.length > 1 ? 70 : 62) + rig.zoom, 20, 100);
      rig.fov = rig.fov && dt > 0 ? lerp(rig.fov, fov, damp(8, dt)) : fov;
      rig.cam.fov = rig.fov;
      rig.cam.updateProjectionMatrix();
      if (this.shake > 0) rig.cam.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(this.shake * 0.15));
      if (this.preView(v) && i > 0) r.shadowMap.needsUpdate = true;
      r.setViewport(i * vw, 0, vw, h);
      r.setScissor(i * vw, 0, vw, h);
      r.render(this.scene, rig.cam);
      rig.apply();
    });
  }

  // Per-view visibility in setup: each player only sees their own ghost and
  // cursor, and in blind mode only their own army. Returns true if visibility
  // differs between views in a way that affects shadows.
  preView(v) {
    if (this.state !== 'setup') return false;
    for (let p = 0; p < 2; p++) {
      const ps = this.ps[p];
      for (const g of ps.ghosts) g.root.visible = p === v && !!g.show;
      const rg = this.rings[p];
      rg.cursor.visible = p === v && rg.show;
      rg.remove.visible = p === v && rg.showRemove;
    }
    const blind = this.blindNow();
    for (let t = 0; t < 2; t++) for (const vis of this.setupVis[t]) vis.root.visible = !blind || t === v;
    return blind;
  }

  blindNow() { return this.state === 'setup' && this.settings.blind && !(this.countdown > 0); }

  showAllSetupVis() { for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) v.root.visible = true; }

  // ---------------------------------------------------------------- title
  goTitle() {
    this.disposeBattle();
    this.fx.clear();
    this.projViz.clear();
    this.rec = null;
    this.state = 'title';
    this.ui.only('title');
    this.ui.setHelp(false);
    this.helpOn = false;
    this.titleSel = 0;
    this.titlePage = 'main';
    this.zones.forEach((z) => (z.visible = false));
    this.hideGhosts();
    this.closeModals();
    for (const r of this.rigs) { r.release(); r.zoom = 0; }
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.resetVis(v);
    this.showAllSetupVis();
    this.audio.startMusic('title');
    this.titleT = 0;
    // show the current armies, or a demo line-up if both are empty
    if (!this.armies[0].length && !this.armies[1].length && !this.titleUnits) {
      this.titleUnits = UNITS.map((d, i) => {
        const vis = buildUnitVisual(d, i % 2, { skel: skelOf(d) });
        vis.entry = { type: d.id, x: (i - UNITS.length / 2) * 2.2, z: (i % 2) * 2.5 - 6 };
        vis.st = { phase: 0, amp: 0, style: d.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0, mode: d.personality.idle === 'play' ? 'play' : 'normal', t: rand(0, 10) };
        this.scene.add(vis.root);
        return vis;
      });
    }
    this.input.swallow();
  }

  titleItems() {
    const s = this.settings;
    if (this.titlePage === 'options') {
      return [
        { label: 'Blind setup', value: s.blind ? 'On — armies hidden' : 'Off', key: 'blind' },
        { label: 'Battle screen', value: s.split ? 'Split' : 'Shared', key: 'split' },
        { label: 'Graphics quality', value: QUALITY[this.quality].name, key: 'quality' },
        { label: 'Look speed', value: `${LOOK[s.look]}×`, key: 'look' },
        { label: 'Invert look Y', value: onOff(s.invertY), key: 'invertY' },
        { label: 'Blood', value: onOff(s.blood), key: 'blood' },
        { label: 'Music', value: onOff(s.music), key: 'music' },
        { label: 'Back', key: 'back' },
      ];
    }
    return [
      { label: 'BATTLE!', key: 'battle' },
      { label: 'Map', value: MAPS[s.map].name, key: 'map' },
      { label: 'Budget per army', value: BUDGETS[s.budget] === Infinity ? 'Unlimited' : BUDGETS[s.budget].toLocaleString('en-US'), key: 'budget' },
      { label: 'Unit limit per army', value: CAPS[s.cap], key: 'cap' },
      { label: 'Options', key: 'options' },
      { label: 'Controls', key: 'help' },
    ];
  }

  // change a setting by d (±1); returns true if handled
  adjustSetting(key, d) {
    const s = this.settings;
    const cyc = (v, n) => (v + d + n) % n;
    switch (key) {
      case 'map': s.map = cyc(s.map, MAPS.length); this.changeMap(s.map); break;
      case 'budget': s.budget = cyc(s.budget, BUDGETS.length); break;
      case 'cap': s.cap = cyc(s.cap, CAPS.length); break;
      case 'blind': s.blind = !s.blind; break;
      case 'split': s.split = !s.split; this.split = s.split; break;
      case 'quality': this.quality = cyc(this.quality, QUALITY.length); s.quality = this.quality; this.applyQuality(); break;
      case 'look': s.look = clamp(s.look + d, 0, LOOK.length - 1); break;
      case 'invertY': s.invertY = !s.invertY; break;
      case 'blood': s.blood = !s.blood; this.fx.blood = s.blood; break;
      case 'music': s.music = !s.music; this.audio.setVolumes(0.8, s.music ? 0.45 : 0); break;
      default: return false;
    }
    this.audio.play('click');
    this.save();
    return true;
  }

  changeMap(i) {
    const st = this.state;
    this.loadMap(i);
    if (st === 'title') {
      this.state = 'title';
      this.zones.forEach((z) => (z.visible = false));
      if (!this.armies[0].length && !this.armies[1].length) { this.titleUnits = null; this.goTitle(); this.titleSel = 1; }
    } else if (st === 'setup') {
      this.zones.forEach((z) => (z.visible = true));
      for (const p of this.ps) p.ready = false;
    }
    this.ui.toast(`Map: <b>${MAPS[i].name}</b>`);
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
      if (I.anyPressed('b') || I.anyPressed('a') || I.anyPressed('start')) { this.helpOn = false; this.ui.setHelp(false); I.swallow(); }
      return;
    }
    if (I.anyPressed('back')) {
      I.swap();
      const dev = (p) => (I.padNames[p] ? `pad ${I.slots[p] + 1}` : 'keyboard');
      this.ui.toast(`Sides swapped: ${teamTag(0)} = ${dev(0)}, ${teamTag(1)} = ${dev(1)}`, 2.2);
      I.rumble(0, 0.6, 0.6, 250); // the pad that buzzes is now Blue
      this.audio.play('click');
      return;
    }
    let items = this.titleItems();
    for (let p = 0; p < 2; p++) {
      if (I.nav(p, 'down')) { this.titleSel = (this.titleSel + 1) % items.length; this.audio.play('click', null, 0.5); }
      if (I.nav(p, 'up')) { this.titleSel = (this.titleSel + items.length - 1) % items.length; this.audio.play('click', null, 0.5); }
      this.titleSel = clamp(this.titleSel, 0, items.length - 1);
      const it = items[this.titleSel];
      let d = 0;
      if (I.nav(p, 'right')) d = 1;
      if (I.nav(p, 'left')) d = -1;
      if (d && it.value !== undefined) this.adjustSetting(it.key, d);
      if (I.pressed(p, 'a')) {
        if (it.key === 'battle') { this.goSetup(); return; }
        if (it.key === 'options') { this.titlePage = 'options'; this.titleSel = 0; this.audio.play('click'); }
        else if (it.key === 'back') { this.titlePage = 'main'; this.titleSel = 4; this.audio.play('click'); }
        else if (it.key === 'help') { this.helpOn = true; this.ui.setHelp(true); }
        else this.adjustSetting(it.key, 1);
        I.swallow();
        if (this.state !== 'title') return;
      }
      if (I.pressed(p, 'b') && this.titlePage === 'options') { this.titlePage = 'main'; this.titleSel = 4; this.audio.play('click'); I.swallow(); }
      if (I.pressed(p, 'start') && this.titlePage === 'main') { this.goSetup(); return; }
      items = this.titleItems();
    }
    this.ui.updateTitle({
      head: this.titlePage === 'options' ? 'OPTIONS' : '',
      items, sel: this.titleSel,
      hint: `${btn('dpad')}/${btn('LS')} choose &nbsp; ←→ change &nbsp; ${btn('A')} select${this.titlePage === 'options' ? ` &nbsp; ${btn('B')} back` : ` &nbsp; ${btn('Start')} battle`}`,
      pads: [0, 1].map((p) => ({ name: I.padNames[p], standard: true })),
      soundOff: !this.audio.ctx || this.audio.ctx.state !== 'running',
    });
  }

  // ---------------------------------------------------------------- setup
  goSetup() {
    this.disposeBattle();
    this.fx.clear();
    this.projViz.clear();
    this.rec = null;
    if (this.titleUnits) { for (const v of this.titleUnits) disposeVisual(v); this.titleUnits = null; }
    this.state = 'setup';
    this.ui.only('setup');
    this.ui.setHelp(false);
    this.helpOn = false;
    this.zones.forEach((z) => (z.visible = true));
    for (const p of this.ps) { p.ready = false; p.last = null; p.modal = null; p.stroke = p.rstroke = null; }
    this.countdown = 0;
    for (const r of this.rigs) { if (r.unit && r.unit.control) r.unit.control = null; r.release(); r.zoom = 0; }
    this.setupCam(0);
    this.setupCam(1);
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.resetVis(v);
    this.audio.startMusic('setup');
    this.audio.setVolumes(0.8, this.settings.music ? 0.45 : 0);
    this.input.swallow();
  }

  // a comfortable default view over the player's own zone
  setupCam(p) {
    const sx = p === 0 ? -1 : 1;
    this.rigs[p].set(sx * (FIELD.x + 2), this.terrain.height(sx * FIELD.x, 0) + 19, 0, sx < 0 ? Math.PI / 2 : -Math.PI / 2, -0.62);
  }

  resetVis(v) {
    setExpression(v, 0);
    for (const it of v.items) it.visible = true;
    v.root.visible = true;
  }

  hideGhosts() {
    for (const p of this.ps) for (const g of p.ghosts) { g.show = false; g.root.visible = false; }
    for (const r of this.rings || []) { r.show = r.showRemove = false; r.cursor.visible = r.remove.visible = false; }
  }

  closeModals() { for (const p of this.ps) p.modal = null; }

  armyCost(t) { return this.armies[t].reduce((s, a) => s + (UNIT_BY_ID[a.type]?.cost || 0), 0); }

  inZone(t, x, z) {
    if (Math.abs(z) > FIELD.z) return false;
    return t === 0 ? x >= -FIELD.x && x <= -ZONE_GAP : x >= ZONE_GAP && x <= FIELD.x;
  }

  addEntry(p, a) { this.armies[p].push(a); this.addSetupVis(p, a); }

  removeEntry(p, a) {
    const i = this.armies[p].indexOf(a);
    if (i < 0) return false;
    this.armies[p].splice(i, 1);
    const vi = this.setupVis[p].findIndex((v) => v.entry === a);
    if (vi >= 0) disposeVisual(this.setupVis[p].splice(vi, 1)[0]);
    return true;
  }

  undo(p) {
    const ps = this.ps[p];
    const u = ps.undo.pop();
    if (!u) { this.ui.toast(`${teamTag(p)}: nothing to undo`, 1.2, p); return; }
    let n = 0;
    if (u.kind === 'add') { for (const a of u.entries) if (this.removeEntry(p, a)) n++; }
    else for (const a of u.entries) if (this.armies[p].length < this.cap) { this.addEntry(p, a); n++; }
    this.audio.play(u.kind === 'add' ? 'remove' : 'place', null, 0.5, 1.1);
    this.ui.toast(`${teamTag(p)}: undo ${u.kind === 'add' ? 'placing' : u.kind === 'clear' ? 'clear' : 'removing'} ${n} unit${n === 1 ? '' : 's'}`, 1.2, p);
    this.save();
  }

  clearArmy(p) {
    const army = this.armies[p];
    if (!army.length) return;
    this.ps[p].undo.push({ kind: 'clear', entries: army.slice() });
    for (const v of this.setupVis[p]) disposeVisual(v);
    this.setupVis[p] = [];
    army.length = 0;
    this.audio.play('remove', null, 0.8, 0.5);
    this.ui.toast(`${teamTag(p)} army cleared <small>(${btn('X')} undo)</small>`, 2, p);
    this.save();
  }

  updateSetup(dt) {
    for (let p = 0; p < 2; p++) { this.updateSetupPlayer(p, dt); if (this.state !== 'setup') return; }
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.poseIdle(v, dt, t === 0 ? Math.PI / 2 : -Math.PI / 2);
    const bothReady = this.ps[0].ready && this.ps[1].ready;
    if (bothReady) {
      if (this.countdown <= 0) {
        this.countdown = 3.0;
        this.audio.play('click', null, 1, 0.7);
        if (this.settings.blind) this.ui.toast('Armies revealed!', 1.8);
      }
      const prev = this.countdown;
      this.countdown -= dt;
      if (Math.ceil(prev) !== Math.ceil(this.countdown) && this.countdown > 0) this.audio.play('click', null, 1, 0.8);
      if (this.countdown <= 0) { this.startBattle(); return; }
    } else {
      if (this.countdown > 0) this.ui.toast('Countdown cancelled');
      this.countdown = 0;
    }
    this.ui.setCountdown(this.countdown, `${btn('Y')} cancel`);
  }

  currentDef(p) {
    const ps = this.ps[p];
    const list = unitsOfFaction(FACTIONS[ps.faction].id);
    ps.unit = clamp(ps.unit, 0, list.length - 1);
    return list[ps.unit];
  }

  ensureGhosts(p, def, n) {
    const ps = this.ps[p];
    if (ps.ghostId !== def.id) {
      for (const g of ps.ghosts) disposeVisual(g);
      ps.ghosts = [];
      ps.ghostId = def.id;
    }
    while (ps.ghosts.length < n) {
      const g = buildUnitVisual(def, p, { skel: skelOf(def), ghost: true });
      g.st = { phase: 0, amp: 0, style: def.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0, mode: 'normal', t: rand(0, 3) };
      g.root.visible = false;
      this.scene.add(g.root);
      ps.ghosts.push(g);
    }
  }

  // brush slot positions around the cursor, centre first
  brushSlots(p, hit, skel) {
    const b = BRUSHES[this.ps[p].brush];
    const sp = skel.radius * 2.3 + 0.2;
    const back = p === 0 ? -1 : 1; // rows extend away from the enemy
    const out = [];
    for (let j = 0; j < b.d; j++) {
      for (let i = 0; i < b.w; i++) {
        const across = (i - (b.w - 1) / 2) * sp;
        const depth = (j - (b.d - 1) / 2) * sp;
        out.push({ x: hit.x + back * depth, z: hit.z + across, d: across * across + depth * depth });
      }
    }
    out.sort((a, c) => a.d - c.d);
    return { slots: out, sp };
  }

  setupMenuItems(p) {
    const s = this.settings, ps = this.ps[p];
    return [
      { label: 'Resume', key: 'resume' },
      { label: ps.ready ? 'Not ready' : 'Ready', key: 'ready' },
      { label: 'Map', value: MAPS[s.map].name, key: 'map' },
      { label: 'Budget', value: BUDGETS[s.budget] === Infinity ? 'Unlimited' : BUDGETS[s.budget].toLocaleString('en-US'), key: 'budget' },
      { label: 'Unit limit', value: CAPS[s.cap], key: 'cap' },
      { label: 'Blind setup', value: onOff(s.blind), key: 'blind' },
      { label: 'Clear my army…', key: 'clear' },
      { label: 'Controls', key: 'help' },
      { label: 'Main menu', key: 'quit' },
    ];
  }

  openSetupMenu(p) { this.ps[p].modal = { kind: 'menu', sel: 0 }; this.audio.play('click'); }
  openClearConfirm(p) {
    if (!this.armies[p].length) { this.ui.toast(`${teamTag(p)}: your army is already empty`, 1.4, p); return; }
    this.ps[p].modal = { kind: 'clear', sel: 0 };
    this.audio.play('click');
  }

  modalView(p) {
    const m = this.ps[p].modal;
    if (!m) return null;
    if (m.kind === 'clear') {
      const n = this.armies[p].length;
      return { title: `Clear ${TEAM_NAMES[p]} army?`, text: `Removes all ${n} unit${n === 1 ? '' : 's'} (${this.armyCost(p).toLocaleString('en-US')} gold). ${btn('X')} undo brings them back.`, items: [{ label: 'No, keep them', key: 'no' }, { label: 'Yes, clear', key: 'yes', cls: 'danger' }], sel: m.sel };
    }
    return { title: `${TEAM_NAMES[p].toUpperCase()} · MENU`, items: this.setupMenuItems(p), sel: m.sel };
  }

  updateModal(p) {
    const I = this.input, ps = this.ps[p], m = ps.modal;
    const view = this.modalView(p);
    const items = view.items;
    if (I.nav(p, 'down')) { m.sel = (m.sel + 1) % items.length; this.audio.play('click', null, 0.4); }
    if (I.nav(p, 'up')) { m.sel = (m.sel + items.length - 1) % items.length; this.audio.play('click', null, 0.4); }
    const it = items[m.sel];
    if (I.pressed(p, 'b') || (I.pressed(p, 'start') && m.kind === 'menu')) { ps.modal = null; I.swallow(); return; }
    let d = 0;
    if (I.nav(p, 'right')) d = 1;
    if (I.nav(p, 'left')) d = -1;
    if (d && it.value !== undefined) { this.setupSetting(p, it.key, d); return; }
    if (!I.pressed(p, 'a')) return;
    I.swallow();
    if (m.kind === 'clear') {
      ps.modal = null;
      if (it.key === 'yes') this.clearArmy(p);
      return;
    }
    switch (it.key) {
      case 'resume': ps.modal = null; break;
      case 'ready': ps.modal = null; this.toggleReady(p); break;
      case 'clear': this.openClearConfirm(p); break;
      case 'help': ps.modal = null; this.helpOn = true; this.ui.setHelp(true); break;
      case 'quit': this.goTitle(); break;
      default: this.setupSetting(p, it.key, 1);
    }
  }

  // a match setting changed from one player's setup menu: affects both players
  setupSetting(p, key, d) {
    const before = this.settings.map;
    this.adjustSetting(key, d);
    if (key === 'map' && before !== this.settings.map) return;
    if (key === 'budget' || key === 'cap' || key === 'blind') {
      const lbl = { budget: 'Budget', cap: 'Unit limit', blind: 'Blind setup' }[key];
      const it = this.setupMenuItems(p).find((x) => x.key === key);
      this.ui.toast(`${teamTag(p)} set ${lbl}: <b>${it.value}</b>`, 1.6, 1 - p);
    }
  }

  toggleReady(p) {
    const ps = this.ps[p];
    if (!ps.ready) {
      const used = this.armyCost(p);
      let why = '';
      if (!this.armies[p].length) why = 'place some units first!';
      else if (used > this.budget) why = `over budget (${used.toLocaleString('en-US')} / ${this.budget.toLocaleString('en-US')})`;
      else if (this.armies[p].length > this.cap) why = `too many units (limit ${this.cap})`;
      if (why) { this.ui.toast(`${teamTag(p)}: ${why}`, 1.8, p); this.audio.play('remove', null, 0.4, 0.6); return; }
    }
    ps.ready = !ps.ready;
    this.audio.play(ps.ready ? 'place' : 'remove', null, 0.8, ps.ready ? 1.4 : 0.8);
    if (ps.ready) this.ui.toast(`${teamTag(p)} is ready!`, 1.4, 1 - p);
    this.input.rumble(p, 0.2, 0.4, 90);
  }

  updateSetupPlayer(p, dt) {
    const I = this.input, s = I.state(p), rig = this.rigs[p], ps = this.ps[p];
    const army = this.armies[p];
    let def = this.currentDef(p);
    const busy = !!ps.modal || this.helpOn;
    if (this.helpOn) {
      if (I.pressed(p, 'b') || I.pressed(p, 'a') || I.pressed(p, 'start')) { this.helpOn = false; this.ui.setHelp(false); I.swallow(); }
    } else if (ps.modal) {
      this.updateModal(p);
      if (this.state !== 'setup') return;
    } else {
      rig.update(s, dt, this.terrain, { speed: 13, minHeight: 1.5, planar: true, ...this.lookOpts });
      if (I.pressed(p, 'r3')) this.setupCam(p);
      // unit selection
      const nf = FACTIONS.length;
      if (I.repeat(p, 'right')) { ps.unit++; if (ps.unit >= unitsOfFaction(FACTIONS[ps.faction].id).length) { ps.unit = 0; ps.faction = (ps.faction + 1) % nf; } this.audio.play('click', null, 0.5, 1.2); }
      if (I.repeat(p, 'left')) { ps.unit--; if (ps.unit < 0) { ps.faction = (ps.faction + nf - 1) % nf; ps.unit = unitsOfFaction(FACTIONS[ps.faction].id).length - 1; } this.audio.play('click', null, 0.5, 1.2); }
      if (I.repeat(p, 'down')) { ps.faction = (ps.faction + 1) % nf; ps.unit = 0; this.audio.play('click', null, 0.5, 1); }
      if (I.repeat(p, 'up')) { ps.faction = (ps.faction + nf - 1) % nf; ps.unit = 0; this.audio.play('click', null, 0.5, 1); }
      if (I.pressed(p, 'rt')) { ps.brush = (ps.brush + 1) % BRUSHES.length; this.audio.play('click', null, 0.5, 1.4); }
      if (I.pressed(p, 'lt')) { ps.brush = (ps.brush + BRUSHES.length - 1) % BRUSHES.length; this.audio.play('click', null, 0.5, 1.4); }
      def = this.currentDef(p);
    }
    const skel = skelOf(def);

    // cursor + brush ghosts
    const hit = busy || ps.ready ? null : rig.groundHit(this.terrain, 220);
    ps.cursor = hit;
    const used = this.armyCost(p);
    let budgetLeft = this.budget - used, capLeft = this.cap - army.length;
    const { slots } = hit ? this.brushSlots(p, hit, skel) : { slots: [] };
    const ok = [];
    let why = '';
    for (let k = 0; k < slots.length; k++) {
      const sl = slots[k];
      sl.ok = false;
      let w = '';
      if (!this.inZone(p, sl.x, sl.z)) w = 'Place units in your own zone';
      else {
        let clash = false;
        for (const a of army) {
          const r = (skelOf(UNIT_BY_ID[a.type]).radius + skel.radius) * 0.95;
          if ((a.x - sl.x) ** 2 + (a.z - sl.z) ** 2 < r * r) { clash = true; break; }
        }
        if (clash) w = '';
        else if (def.cost > budgetLeft) w = 'Not enough gold';
        else if (capLeft <= 0) w = `Army is full (limit ${this.cap})`;
        else { sl.ok = true; budgetLeft -= def.cost; capLeft--; ok.push(sl); }
      }
      if (k === 0) why = w;
    }
    const valid = ok.length > 0;
    ps.valid = valid;
    this.ensureGhosts(p, def, slots.length);
    ps.ghosts.forEach((g, k) => {
      const sl = slots[k];
      g.show = !!sl;
      if (!sl) return;
      g.root.userData.ghostMat.color.set(sl.ok ? TEAM_COLORS[p] : '#ff2222');
      g.root.userData.ghostMat.opacity = sl.ok ? 0.5 : 0.28;
      g.st.t += dt;
      poseVisual(g, sl.x, this.terrain.height(sl.x, sl.z), sl.z, p === 0 ? Math.PI / 2 : -Math.PI / 2, g.st);
    });
    // which of my units B would remove
    let hover = null;
    if (hit) {
      let bd = 1.6 ** 2;
      for (const a of army) { const d = (a.x - hit.x) ** 2 + (a.z - hit.z) ** 2; if (d < bd) { bd = d; hover = a; } }
    }
    ps.hover = hover;
    const rg = this.rings[p];
    rg.show = !!hit;
    if (hit) {
      rg.cursor.position.set(hit.x, hit.y + 0.06, hit.z);
      rg.cursor.scale.setScalar(Math.max(0.35, skel.radius * 1.25));
      rg.cursor.material.color.set(valid ? TEAM_COLORS[p] : '#ff4040');
    }
    rg.showRemove = !!hover;
    if (hover) {
      const r = skelOf(UNIT_BY_ID[hover.type]).radius * 1.6 + 0.15;
      rg.remove.position.set(hover.x, this.terrain.height(hover.x, hover.z) + 0.07, hover.z);
      rg.remove.scale.setScalar(r);
    }

    if (!ps.ready && !busy) {
      // place (hold to paint); one held stroke is one undo step
      if (I.pressed(p, 'a')) ps.stroke = null;
      if (I.down(p, 'a') && hit) {
        const spacing = skel.radius * 2.3 + 0.15;
        const far = !ps.last || Math.hypot(ps.last.x - hit.x, ps.last.z - hit.z) >= spacing;
        if (valid && (I.pressed(p, 'a') || far)) {
          if (!ps.stroke) { ps.stroke = { kind: 'add', entries: [] }; ps.undo.push(ps.stroke); }
          for (const sl of ok) {
            const a = { type: def.id, x: sl.x, z: sl.z };
            this.addEntry(p, a);
            ps.stroke.entries.push(a);
          }
          ps.last = { x: hit.x, z: hit.z };
          this.audio.play('place', null, 0.6, 0.9 + Math.random() * 0.2);
          this.save();
        } else if (I.pressed(p, 'a') && why) {
          this.ui.toast(`${teamTag(p)}: ${why}`, 1.4, p);
          this.audio.play('remove', null, 0.3, 0.6);
        }
      } else ps.last = null;
      // remove (hold to keep erasing); one held stroke is one undo step
      if (I.pressed(p, 'b')) ps.rstroke = null;
      if (hover && I.repeat(p, 'b', 0.25, 0.08)) {
        if (!ps.rstroke) { ps.rstroke = { kind: 'remove', entries: [] }; ps.undo.push(ps.rstroke); }
        this.removeEntry(p, hover);
        ps.rstroke.entries.push(hover);
        ps.hover = null;
        this.audio.play('remove', null, 0.6, 1);
        this.save();
      }
      if (I.repeat(p, 'x', 0.4, 0.12)) this.undo(p);
      if (I.pressed(p, 'back')) this.openClearConfirm(p);
      if (ps.undo.length > 60) ps.undo.splice(0, ps.undo.length - 60);
    }
    if (!busy) {
      if (I.pressed(p, 'y')) this.toggleReady(p);
      if (I.pressed(p, 'start')) this.openSetupMenu(p);
      if (ps.ready && I.pressed(p, 'b')) this.toggleReady(p);
    }

    const other = this.ps[1 - p];
    let status = '';
    if (ps.ready) status = other.ready ? '' : `Waiting for ${teamTag(1 - p)}… ${btn('Y')} not ready`;
    else if (ps.hover) status = `${btn('B')} remove ${UNIT_BY_ID[ps.hover.type].name}`;
    else if (hit && !valid && why) status = `<span class="bad">${why}</span>`;
    // roster: unit counts in order of first placement
    const counts = new Map();
    for (const a of army) counts.set(a.type, (counts.get(a.type) || 0) + 1);
    const enemy = this.armies[1 - p];
    this.ui.updateSetup(p, {
      pad: I.hasPad(p), def, faction: ps.faction, unit: ps.unit, used, budget: this.budget, cap: this.cap, count: army.length,
      ready: ps.ready, otherReady: other.ready, valid: valid || !hit, status, brush: BRUSHES[ps.brush].name,
      roster: [...counts].map(([id, n]) => ({ id, n })),
      enemy: { hidden: this.blindNow(), count: enemy.length, value: this.armyCost(1 - p) },
      modal: this.modalView(p),
    });
  }

  // ---------------------------------------------------------------- battle
  startBattle() {
    const from = this.state === 'paused' ? this.pauseFrom : this.state;
    this.disposeBattle();
    this.hideGhosts();
    this.closeModals();
    this.ui.setHelp(false);
    this.helpOn = false;
    this.zones.forEach((z) => (z.visible = false));
    this.fx.clear();
    this.projViz.clear();
    this.showAllSetupVis();
    this.battleVis = [...this.setupVis[0], ...this.setupVis[1]];
    for (const v of this.battleVis) this.resetVis(v);
    const armies = this.armies.map((a) => a.map(({ type, x, z }) => ({ type, x, z })));
    this.battle = new Battle(this.terrain, armies, (e) => this.onEvent(e, true));
    this.rec = new Recorder(this.battle);
    this.rec.capture(this.battle);
    this.state = 'battle';
    this.ui.only('battle');
    this.timeScale = 1;
    this.speedIdx = NORMAL;
    this.overAt = 0;
    this.overTime = 0;
    for (const r of this.rigs) { r.release(); r.lastHp = undefined; }
    if (from === 'setup') {
      // split: each player keeps their own setup view; shared: a side-on overview
      if (!this.split) this.overviewCam(this.rigs[0]);
    }
    this.audio.startMusic('battle');
    this.audio.play('horn', null, 0.8, 1);
    this.syncLive(0);
    this.input.swallow();
  }

  // side-on view framing both armies
  overviewCam(rig) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const a of [...this.armies[0], ...this.armies[1]]) { x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); z0 = Math.min(z0, a.z); z1 = Math.max(z1, a.z); }
    if (x0 > x1) { x0 = -20; x1 = 20; z0 = -10; z1 = 10; }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const span = Math.max(x1 - x0 + 6, (z1 - z0 + 6) * 1.4, 16);
    const d = span * 0.5 + 5;
    // from the +z side, so Blue (P1) is on the left of the screen like the HUD
    const z = Math.min(110, z1 + d);
    rig.set(cx, this.terrain.height(cx, z) + Math.max(5, d * 0.4), z, Math.PI, -0.3);
    rig.lookAtPoint(cx, this.terrain.height(cx, cz) + 1, cz);
    rig.apply();
  }

  disposeBattle() {
    if (this.battle) {
      for (const u of this.battle.units) u.control = null;
      this.battle.destroy();
      this.battle = null;
    }
    for (const r of this.rigs) if (r.mode !== 'free') r.release();
    this.player = null;
    this.proxies = null;
  }

  onEvent(e, live) {
    if (live && this.rec) this.rec.event(this.battle.time, e);
    const k = e[0];
    const pos = new THREE.Vector3(e[1], e[2], e[3]);
    if (k.startsWith('snd:')) { if (!this.muteEvents) this.audio.play(k.slice(4), pos, e[4], e[5]); }
    else if (k === 'voice') { if (!this.muteEvents) this.audio.voice(pos, e[4], e[5], e[6]); }
    else if (k === 'over') { /* handled by state */ }
    else {
      this.fx.event(e);
      if (k === 'explode') {
        let d = Infinity;
        for (const v of this.views()) {
          const dv = this.rigs[v].pos.distanceTo(pos);
          d = Math.min(d, dv);
          const f = clamp(1 - dv / 35, 0, 1) * e[4] / 3;
          if (f > 0.05 && !this.muteEvents) for (const p of this.viewPlayers(v)) this.input.rumble(p, f, f * 0.6, 220);
        }
        this.shake = Math.max(this.shake, clamp(1 - d / 40, 0, 1) * e[4] / 3);
      }
    }
  }

  syncLive(dt) {
    const b = this.battle;
    b.units.forEach((u, i) => {
      const vis = this.battleVis[i];
      if (!vis) return;
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

  // view v is driven by which players (shared screen: either pad)
  viewPlayers(v) { return this.split ? [v] : [0, 1]; }
  vPressed(v, k) { return this.viewPlayers(v).some((p) => this.input.pressed(p, k)); }
  vRepeat(v, k) { return this.viewPlayers(v).some((p) => this.input.repeat(p, k)); }
  viewState(v) { return this.split ? this.input.state(v) : this.mergedState(); }

  // common to battle, result and replay
  globalCamKeys() {
    const I = this.input;
    if (I.anyPressed('back')) this.toggleSplit();
    if (I.anyPressed('r3')) {
      this.hudMode = (this.hudMode + 1) % 3;
      if (this.hudMode !== 2) this.ui.toast(['HUD on', 'Tips hidden', ''][this.hudMode], 1);
    }
  }

  updateBattle(dt) {
    const I = this.input, b = this.battle;
    if (I.anyPressed('start')) { this.openPause(); return; }
    this.globalCamKeys();

    // time controls (also while the result is up: the field stays live)
    for (let p = 0; p < 2; p++) {
      if (I.pressed(p, 'y') && this.state === 'battle') {
        this.speedIdx = this.speedIdx === NORMAL ? SLOWMO : NORMAL;
        this.ui.toast(this.speedIdx === NORMAL ? 'Normal speed' : 'Slow motion', 1);
      }
      if (this.state === 'battle') {
        if (I.repeat(p, 'up')) this.speedIdx = Math.min(SPEEDS.length - 1, this.speedIdx + 1);
        if (I.repeat(p, 'down')) this.speedIdx = Math.max(0, this.speedIdx - 1);
      }
    }
    this.timeScale = SPEEDS[this.speedIdx];

    // simulate
    if (this.timeScale > 0) {
      const simDt = Math.min(dt, 1 / 20) * this.timeScale;
      const n = Math.max(1, Math.ceil(simDt / (1 / 60) - 1e-6));
      for (let i = 0; i < n; i++) {
        b.step(simDt / n);
        this.rec.capture(b);
      }
      this.syncLive(simDt);
      this.fx.update(simDt);
    } else this.projViz.fromBattle(b, 0);

    // cameras
    this.updateViewCams(dt, b.units);

    // battle over?
    if (b.over && !this.overTime) this.overTime = b.time;
    if (b.over && this.state === 'battle') {
      if (!this.overAt) this.overAt = performance.now();
      if (performance.now() - this.overAt > 1600) this.showResult();
    }
    if (this.state === 'result') this.updateResultMenu();
    if (this.state === 'battle' || this.state === 'result') this.ui.updateBattle(this.battleHud());
  }

  cycleFollow(rig, list, dir) {
    const alive = list.filter((u) => u.alive !== false);
    if (!alive.length) return;
    let i = alive.indexOf(rig.unit);
    i = i < 0 ? (dir > 0 ? 0 : alive.length - 1) : (i + dir + alive.length) % alive.length;
    const goal = rig.orbitGoal;
    rig.follow(alive[i], 'follow');
    rig.orbitGoal = goal;
    this.audio.play('click', null, 0.4, 1.3);
  }

  updateViewCams(dt, units, proxies) {
    const replay = this.state === 'replay';
    const live = this.state === 'battle';
    const list = proxies || units;
    for (const v of this.split ? [0, 1] : [0]) {
      const rig = this.rigs[v];
      const s = this.viewState(v);
      const P = (k) => this.vPressed(v, k);
      if (!replay) { // d-pad left/right: field of view (in the replay they skip instead)
        if (this.vRepeat(v, 'left')) rig.addZoom(5);
        if (this.vRepeat(v, 'right')) rig.addZoom(-5);
      }
      if (rig.mode === 'cine') {
        const moved = Math.max(Math.abs(s.lx), Math.abs(s.ly), Math.abs(s.rx), Math.abs(s.ry)) > 0.5;
        if (moved || P('b')) { rig.release(); this.ui.toast('Free camera', 0.8); }
        else if (P('rb') || P('lb')) rig.cine.next = 0; // next shot
      }
      if (live || replay) {
        if (rig.mode === 'follow') {
          if (P('rb')) this.cycleFollow(rig, list, 1);
          if (P('lb')) this.cycleFollow(rig, list, -1);
        }
        const followKey = replay ? 'x' : 'a';
        if (P(followKey) && (rig.mode === 'free' || rig.mode === 'cine')) {
          const u = rig.pickUnit(list, (o) => o.alive !== false) || rig.pickUnit(list);
          if (u) { rig.follow(u, 'follow'); this.audio.play('click'); }
        }
        if (live && P('x')) {
          const cur = rig.mode === 'follow' && rig.unit?.alive ? rig.unit : null;
          const u = cur && !cur.control ? cur : rig.mode === 'possess' ? null : rig.pickUnit(units, (o) => o.alive && !o.control);
          if (u && u.alive && !u.control) {
            u.control = { mx: 0, mz: 0, attack: false, jump: false, aimYaw: u.heading, aimPitch: 0.3 };
            rig.follow(u, 'possess');
            rig.yaw = u.heading;
            rig.lastHp = u.hp;
            this.ui.toast(`Controlling ${teamTag(u.team)} ${u.def.name}`, 1.4);
            for (const p of this.viewPlayers(v)) this.input.rumble(p, 0.2, 0.5, 120);
          }
        }
        if (P('b') && rig.mode !== 'cine') {
          if (rig.mode === 'possess' && rig.unit) rig.unit.control = null;
          if (rig.mode !== 'free') rig.release();
        }
      } else if (this.state === 'result' && P('b') && rig.mode !== 'free') {
        if (rig.unit && rig.unit.control) rig.unit.control = null;
        rig.release();
      }
      if (rig.mode === 'possess') this.possessControl(v, rig, s, units);
      const slow = rig.mode === 'free' || rig.mode === 'follow' ? clamp((s.lt - 0.15) / 0.7, 0, 1) * (rig.mode === 'possess' ? 0 : 1) : 0;
      rig.update(s, dt, this.terrain, { speed: 12, slow, units: list, ...this.lookOpts });
    }
  }

  possessControl(v, rig, s, units) {
    const u = rig.unit;
    if (!u || !u.alive) {
      if (u) u.control = null;
      rig.mode = 'follow';
      if (u) this.ui.toast(`${u.def.name} is down`, 1.2);
      return;
    }
    const c = u.control;
    const fy = rig.yaw;
    const fx = Math.sin(fy), fz = Math.cos(fy), rx = -Math.cos(fy), rz = Math.sin(fy);
    c.mx = fx * -s.ly + rx * s.lx;
    c.mz = fz * -s.ly + rz * s.lx;
    // aim at whatever is under the crosshair (the camera sits over the shoulder)
    const tgt = rig.aimPoint(this.terrain, units, u, 90);
    const cp = u.chestPos;
    c.aimYaw = Math.atan2(tgt.x - cp.x, tgt.z - cp.z);
    const w = u.def.weapon;
    rig.aimInfo = null;
    if (w.kind === 'ranged' && w.speed) {
      const dx = Math.hypot(tgt.x - cp.x, tgt.z - cp.z), dy = tgt.y - (cp.y + 0.3 * (u.s || 1));
      const g = PROJ[w.proj]?.g ?? 9.81;
      let ang = g <= 0.01 ? Math.atan2(dy, dx) : ballisticAngle(dx, dy, w.speed, g, w.arc === 'high');
      const reach = ang !== null;
      if (ang === null) ang = Math.PI / 4;
      c.aimPitch = clamp(ang, -0.7, 1.45);
      rig.aimInfo = { dist: dx, ok: reach };
    } else c.aimPitch = clamp(rig.pitch + 0.35, 0.05, 1.1);
    c.attack = s.rt > 0.4;
    if (this.vPressed(v, 'a')) c.jump = true;
    if (rig.lastHp !== undefined && u.hp < rig.lastHp - 0.5) {
      const f = clamp((rig.lastHp - u.hp) / u.maxHp * 4, 0.15, 1);
      for (const p of this.viewPlayers(v)) this.input.rumble(p, f, f, 160);
    }
    rig.lastHp = u.hp;
  }

  hintFor(rig) {
    const replay = this.state === 'replay';
    switch (rig.mode) {
      case 'possess':
        return `${btn('LS')} walk &nbsp; ${btn('RS')} aim &nbsp; ${btn('RT')} attack &nbsp; ${btn('A')} jump &nbsp; ${btn('B')} let go`;
      case 'follow':
        return `${btn('RS')} orbit &nbsp; ${btn('LS')} zoom &nbsp; ${btn('LB')}${btn('RB')} prev / next unit${replay ? '' : ` &nbsp; ${btn('X')} possess`} &nbsp; ${btn('B')} free cam`;
      case 'cine':
        return `🎬 Cinematic camera &nbsp; ${btn('RB')} next shot &nbsp; move a stick or ${btn('B')} to take over`;
      default:
        if (this.state === 'result') return `${btn('LS')} fly ${btn('RS')} look ${btn('LB')}${btn('RB')} down/up &nbsp; ${btn('dpad')}↑↓ choose &nbsp; ${btn('A')} select`;
        return `${btn('A')} follow &nbsp; ${btn('X')} possess &nbsp; ${btn('Y')} slow-mo &nbsp; ${btn('dpad')}↑↓ speed ←→ zoom &nbsp; ${btn('LT')} slow cam &nbsp; ${btn('View')} ${this.split ? 'shared' : 'split'} &nbsp; ${btn('Start')} pause &nbsp; ${btn('R3')} HUD`;
    }
  }

  battleHud() {
    const b = this.battle;
    const fr = this.state === 'replay' && this.player ? this.player.frameAt(this.player.t)?.a : null;
    const counts = fr ? fr.counts : b.stats().map((s) => s.alive);
    const vs = this.split ? [0, 1] : [0];
    const views = [null, null];
    for (const v of vs) {
      const rig = this.rigs[v];
      let label = this.split ? `<b style="color:${TEAM_COLORS[v]}">P${v + 1}</b> ` : '';
      let reticle = '';
      if (rig.mode === 'follow' && rig.unit) {
        const u = rig.unit;
        label += `Following ${teamTag(u.team)} ${u.def.name}${u.hp !== undefined ? hpBar(u) : ''}`;
      } else if (rig.mode === 'possess' && rig.unit) {
        const u = rig.unit;
        label += `Controlling ${teamTag(u.team)} ${u.def.name}${hpBar(u)}`;
        if (rig.aimInfo) label += ` <small class="${rig.aimInfo.ok ? '' : 'bad'}">${Math.round(rig.aimInfo.dist)} m${rig.aimInfo.ok ? '' : ' · out of range'}</small>`;
        reticle = 'aim';
      } else if (rig.mode === 'cine') label += '🎬 Cinematic camera';
      else { label += 'Free camera'; if (this.state !== 'result') reticle = 'dot'; }
      if (Math.abs(rig.zoom) > 0.5) label += ` <small>· FOV ${Math.round(rig.fov)}°</small>`;
      views[v] = { label, reticle, hint: this.hintFor(rig) };
    }
    const sc = this.state === 'replay' ? 1 : this.timeScale;
    const scaleText = this.state === 'result' ? '' : sc === 0 ? 'TIME FROZEN <small>✥↑ resume</small>' : sc !== 1 ? `${sc < 1 ? 'SLOW MOTION' : 'FAST'} ${sc}×` : '';
    return {
      counts, start: b.startCounts, scaleText,
      split: this.split, views, hints: this.hudMode === 0 && this.state !== 'replay',
    };
  }

  toggleSplit() {
    this.split = !this.split;
    this.settings.split = this.split;
    this.save();
    if (this.split) {
      // P2 picks up from P1's view
      const a = this.rigs[0], b = this.rigs[1];
      if (b.mode === 'free') b.copyFrom(a);
    } else {
      const r = this.rigs[1];
      if (r.mode === 'possess' && r.unit) r.unit.control = null;
      r.release();
    }
    this.ui.toast(this.split ? 'Split screen' : 'Shared screen', 1);
  }

  resultItems() {
    return [
      { label: 'Watch replay', key: 'replay' },
      { label: 'Final moments (slow-mo)', key: 'final' },
      { label: 'Rematch', key: 'rematch' },
      { label: 'Edit armies', key: 'edit' },
      { label: 'Main menu', key: 'title' },
    ];
  }

  showResult() {
    this.state = 'result';
    const b = this.battle;
    this.resultSel = 0;
    this.ui.only('battle', 'result');
    this.ui.showResult({ winner: b.winner, stats: b.stats(), duration: this.overTime || b.time });
    this.ui.updateResultMenu(this.resultItems(), this.resultSel);
    this.audio.play('fanfare', null, 0.9, 1);
    this.audio.startMusic('setup');
    for (const r of this.rigs) if (r.mode === 'possess' && r.unit) { r.unit.control = null; r.mode = 'follow'; }
    for (let p = 0; p < 2; p++) this.input.rumble(p, 0.3, 0.3, 300);
    if (SPEEDS[this.speedIdx] === 0) this.speedIdx = NORMAL;
    this.input.swallow();
  }

  updateResultMenu() {
    const I = this.input;
    const items = this.resultItems();
    for (let p = 0; p < 2; p++) {
      // d-pad only: the sticks still fly the camera
      if (I.repeat(p, 'down')) { this.resultSel = (this.resultSel + 1) % items.length; this.audio.play('click', null, 0.4); }
      if (I.repeat(p, 'up')) { this.resultSel = (this.resultSel + items.length - 1) % items.length; this.audio.play('click', null, 0.4); }
      if (I.pressed(p, 'a')) {
        I.swallow();
        switch (items[this.resultSel].key) {
          case 'replay': this.startReplay(); return;
          case 'final': this.startReplay({ final: true }); return;
          case 'rematch': this.startBattle(); return;
          case 'edit': this.goSetup(); return;
          case 'title': this.goTitle(); return;
        }
      }
    }
    this.ui.updateResultMenu(items, this.resultSel);
  }

  // ---------------------------------------------------------------- pause
  openPause(sub) {
    if (this.state === 'paused') { if (sub) this.pauseSub = sub; return; }
    if (!['battle', 'result', 'replay'].includes(this.state)) return;
    this.pauseFrom = this.state;
    this.state = 'paused';
    this.pauseSel = 0;
    this.pauseSub = sub || '';
    this.ui.show('pause', true);
    this.input.swallow();
  }

  pauseItems() {
    const from = this.pauseFrom;
    const cine = this.rigs[0].mode === 'cine';
    const items = [{ label: 'Resume', key: 'resume' }];
    items.push({ label: 'Camera', value: cine ? 'Cinematic' : 'Free', key: 'cine' });
    items.push({ label: 'Screen', value: this.split ? 'Split' : 'Shared', key: 'split' });
    items.push({ label: 'HUD', value: ['Full', 'No tips', 'Hidden (photo)'][this.hudMode], key: 'hud' });
    if (from === 'battle') items.push({ label: 'Time', value: SPEEDS[this.speedIdx] === 0 ? 'Frozen' : `${SPEEDS[this.speedIdx]}×`, key: 'speed' });
    if (from === 'replay') items.push({ label: 'Exit replay', key: 'exitreplay' });
    items.push({ label: from === 'battle' ? 'Restart battle' : 'Rematch', key: 'rematch' });
    items.push({ label: 'Edit armies', key: 'edit' });
    items.push({ label: 'Main menu', key: 'title' });
    return items;
  }

  updatePause() {
    const I = this.input;
    let items = this.pauseItems();
    for (let p = 0; p < 2; p++) {
      if (I.nav(p, 'down')) { this.pauseSel = (this.pauseSel + 1) % items.length; this.audio.play('click', null, 0.4); }
      if (I.nav(p, 'up')) { this.pauseSel = (this.pauseSel + items.length - 1) % items.length; this.audio.play('click', null, 0.4); }
      const it = items[this.pauseSel];
      if (I.pressed(p, 'b') || I.pressed(p, 'start')) { this.closePause(); return; }
      let d = 0;
      if (I.nav(p, 'right')) d = 1;
      if (I.nav(p, 'left')) d = -1;
      if ((d || I.pressed(p, 'a')) && it.value !== undefined) {
        this.pauseAdjust(it.key, d || 1);
        items = this.pauseItems();
        continue;
      }
      if (I.pressed(p, 'a')) {
        I.swallow();
        this.ui.show('pause', false);
        switch (it.key) {
          case 'resume': this.closePause(); break;
          case 'exitreplay': this.state = 'replay'; this.exitReplay(); break;
          case 'rematch': this.startBattle(); break;
          case 'edit': this.goSetup(); break;
          case 'title': this.goTitle(); break;
        }
        return;
      }
    }
    this.pauseSel = clamp(this.pauseSel, 0, items.length - 1);
    this.ui.updatePause('PAUSED', items, this.pauseSel, this.pauseSub);
    if (this.pauseFrom !== 'replay' && this.battle) this.ui.updateBattle(this.battleHud());
  }

  pauseAdjust(key, d) {
    this.audio.play('click', null, 0.5);
    switch (key) {
      case 'cine':
        for (const v of this.split ? [0, 1] : [0]) {
          const r = this.rigs[v];
          if (r.mode === 'cine') r.release();
          else { if (r.mode === 'possess' && r.unit) r.unit.control = null; r.startCine(); }
        }
        break;
      case 'split': this.toggleSplit(); break;
      case 'hud': this.hudMode = (this.hudMode + d + 3) % 3; break;
      case 'speed': this.speedIdx = clamp(this.speedIdx + d, 0, SPEEDS.length - 1); this.timeScale = SPEEDS[this.speedIdx]; break;
    }
  }

  closePause() {
    this.state = this.pauseFrom || 'battle';
    this.ui.show('pause', false);
    this.input.swallow();
  }

  // ---------------------------------------------------------------- replay
  startReplay(opts = {}) {
    if (!this.rec || !this.rec.frames.length) return;
    this.state = 'replay';
    this.ui.only('battle', 'replay');
    this.player = new Player(this.rec);
    const P = this.player;
    this.replaySpeedIdx = opts.final ? 1 : 3;
    this.replayFinal = !!opts.final;
    P.playing = true;
    this.fx.clear();
    this.projViz.clear();
    for (const r of this.rigs) { if (r.unit && r.unit.control) r.unit.control = null; r.release(); }
    // camera proxies so you can follow units in the replay
    this.proxies = this.battleVis.map((vis, i) => ({
      vis, team: this.rec.units[i].team, def: UNIT_BY_ID[this.rec.units[i].type], s: vis.skel.scale,
      get chestPos() { return vis.parts[PART.chest].position; }, alive: true, hp: 1, maxHp: 1,
    }));
    const overT = this.overTime || P.duration;
    const deaths = P.deaths();
    this.ui.setReplayMarkers(deaths, P.duration, this.overTime);
    if (opts.final) {
      // slow-mo from a few seconds before the last unit fell, following the victim
      const last = deaths.filter((d) => d.t <= overT + 0.05).pop();
      const t0 = Math.max(0, (last ? last.t : overT) - FINAL_SECONDS + 1.5);
      if (last) {
        P.seek(last.t);
        P.apply(this.battleVis, this.projViz, 0);
        let best = null, bd = Infinity;
        for (const px of this.proxies) {
          const d = px.chestPos.distanceToSquared(new THREE.Vector3(last.x, last.y, last.z));
          if (d < bd) { bd = d; best = px; }
        }
        P.seek(t0);
        P.apply(this.battleVis, this.projViz, 0);
        if (best) { this.rigs[0].follow(best, 'follow'); this.rigs[0].orbitGoal = this.rigs[0].orbitDist = 7 * best.s; this.rigs[0].snap = true; }
      } else P.seek(t0);
      this.projViz.clear();
    } else P.seek(0);
    this.audio.startMusic('battle');
    this.input.swallow();
  }

  exitReplay() {
    // back to the live result screen
    this.state = 'result';
    this.ui.only('battle', 'result');
    this.ui.updateResultMenu(this.resultItems(), this.resultSel || 0);
    for (const r of this.rigs) r.release();
    this.player = null;
    this.proxies = null;
    this.fx.clear();
    this.projViz.clear();
    this.syncLive(0);
    this.audio.startMusic('setup');
    this.input.swallow();
  }

  updateReplay(dt) {
    const I = this.input, P = this.player;
    if (I.anyPressed('start')) { this.openPause(); return; }
    // B exits once the presser's own camera is already free (otherwise it frees it)
    for (let p = 0; p < 2; p++) {
      const mine = this.split ? [this.rigs[p]] : [this.rigs[0]];
      if (I.pressed(p, 'b') && mine.every((r) => r.mode === 'free')) { this.exitReplay(); return; }
    }
    this.globalCamKeys();
    const ended = !P.playing && P.t >= P.duration - 1e-3;
    let scrub = 0;
    for (let p = 0; p < 2; p++) {
      const s = I.state(p);
      scrub += s.rt - s.lt;
      if (I.pressed(p, 'a')) {
        if (ended) { P.seek(this.replayFinal ? Math.max(0, P.duration - FINAL_SECONDS) : 0); P.playing = true; }
        else P.playing = !P.playing;
      }
      if (I.pressed(p, 'y')) { this.startReplay({ final: true }); return; }
      if (I.repeat(p, 'right')) P.seek(P.t + 3);
      if (I.repeat(p, 'left')) P.seek(P.t - 3);
      if (I.repeat(p, 'up')) this.replaySpeedIdx = Math.min(RSPEEDS.length - 1, this.replaySpeedIdx + 1);
      if (I.repeat(p, 'down')) this.replaySpeedIdx = Math.max(0, this.replaySpeedIdx - 1);
    }
    P.speed = RSPEEDS[this.replaySpeedIdx];
    const scrubbing = Math.abs(scrub) > 0.05;
    const t0 = P.t;
    const evs = P.advance(dt, scrubbing ? scrub : 0);
    // seeking/scrubbing backwards: drop particles from other moments instead of letting them hang
    if (P.jumped || P.t < t0) { this.fx.clear(); this.projViz.clear(); }
    this.muteEvents = scrubbing;
    for (const e of evs) this.onEvent(e, false);
    this.muteEvents = false;
    const step = Math.max(0, P.t - t0);
    const fr = P.apply(this.battleVis, this.projViz, step);
    if (fr) {
      this.battleVis.forEach((vis, i) => {
        const f = fr.us[i];
        setExpression(vis, f & 7);
        const hide = !!(f & 16);
        for (const it of vis.items) it.visible = !hide;
        const px = this.proxies[i];
        px.alive = !!(f & 8);
        px.maxHp = px.def.hp;
        px.hp = (fr.hp[i] / 255) * px.def.hp;
      });
    }
    this.fx.update(step);
    // replay cameras: A toggles play, so follow is on X here
    this.updateViewCams(dt, this.proxies, this.proxies);
    const label = this.replayFinal ? `● FINAL MOMENTS <small>${P.speed}×</small>` : '● REPLAY';
    this.ui.updateReplay(P.t, P.duration, P.speed, P.playing, label, !P.playing && P.t >= P.duration - 1e-3);
    this.ui.updateBattle(this.battleHud());
  }
}

function packArmy2(armies) { return armies.map(packArmy); }

function hpBar(u) {
  const f = clamp(u.hp / u.maxHp, 0, 1);
  return ` <span class="hp"><i style="width:${f * 100}%"></i></span>${u.alive ? '' : ' <em>(down)</em>'}`;
}
