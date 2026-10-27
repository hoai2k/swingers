// Game flow: title -> simultaneous 2-player army setup -> battle -> result -> replay.
import { THREE, clamp, rand, damp, lerp, ballisticAngle } from './util.js';
import { initPhysics } from './physics.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI, btn } from './ui.js';
import { FACTIONS, UNITS, UNIT_BY_ID, unitsOfFaction } from './units.js';
import { loadRecipes, syncCustomUnits, CUSTOM_FACTION } from './packs/custom.js';
import { Creator } from './creator.js';
import { MAPS, Terrain, buildScene, zoneMesh, FIELD, ZONE_GAP } from './world.js';
import { buildUnitVisual, disposeVisual, poseVisual, setExpression, renderPortraits, placeHeld, TEAM_COLORS, TEAM_NAMES, setFar, setGoogly, jiggleEyes } from './visual.js';
import { makeSkeleton, PART, NPARTS } from './body.js';
import { CamRig } from './camera.js';
import { Battle, PROJ } from './battle.js';
import { FX } from './fx.js';
import { ProjViz } from './projviz.js';
import { Recorder, Player } from './replay.js';
import { WORLDS, LEVELS, levelById, enemyArmy, armyValue, starGold, starsFor, loadProgress, saveProgress, worldUnlocked, levelUnlocked, totalStars, nextLevel } from './campaign.js';

import { hasAsset } from './assets.js';
import { Perf, SIM_LOADS, RES } from './perf.js';
import { Corner, setFullscreen, fsElement } from './corner.js';
const mapImg = (id) => (hasAsset(`assets/ui/map-${id}.jpg`) ? `assets/ui/map-${id}.jpg` : '');
const BUDGETS = [1000, 2500, 5000, 10000, 25000, Infinity];
const CAPS = [40, 80, 120, 180, 300, 500, 1000, Infinity];
const LOD_MIN = 120; // armies this big draw distant units as simple stand-ins
const LOD_DIST = [22, 30, 40]; // m, by graphics quality
const CORPSE_SECONDS = 10; // Performance → Fallen units: vanish this long after falling
const BIG_ARMY = 180; // above this the unit limit is flagged as heavy on the frame rate
const capText = (c) => (c === Infinity ? 'Unlimited' : c > BIG_ARMY ? `${c} (heavy)` : `${c}`);
const money = (b) => (b === Infinity ? 'Unlimited' : b.toLocaleString('en-US'));
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
const ROUNDS = [1, 3, 5]; // versus: best of N
const TIMERS = [0, 30, 60, 90, 120]; // versus: setup time limit (s), 0 = none
const BONUS = 0.25; // versus round bonus: the loser gets +25% gold per round lost in a row
const CLEAR_HOLD = 0.8; // seconds to hold View to clear an army
const STORE = 'wobbly-battles.v1';
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
// Possessed, does this unit shoot where the crosshair points (LT aims instead of
// blocking)? Core ranged units, and pack kinds that say so (kind.aim) or that have a
// range and no melee (guns, Zeus, a mammoth's spear thrower...); kind.aim: false opts out.
function aims(u) {
  const w = u?.def.weapon, k = u?.kind;
  if (!w) return false;
  if (w.kind === 'ranged') return true;
  if (k && k.aim !== undefined) return !!k.aim;
  return !!k && !k.melee && w.range > 0 && !u.bc;
}
const onOff = (b) => (b ? 'On' : 'Off');

export class Game {
  constructor(canvas, hud) {
    this.canvas = canvas;
    const st = loadStore();
    this.settings = Object.assign({
      map: 0, budget: 2, cap: 2, sbBudget: 5, sbCap: 7, blood: true, music: true, sound: true, autoFs: true, googly: true, // sandbox: unlimited gold and units
      quality: 2, blind: false, split: false, look: 2, invertY: false,
      rounds: 0, bonus: false, timer: 0, sandboxPlayers: 1,
      // performance options (see perfItems)
      res: 0, autoRes: true, shadows: true, fxLite: false, corpses: 0, simLoad: 1, showFps: false, lod: true, sfxRec: true,
    }, st.settings || {});
    this.perf = new Perf();
    this.mode = 'versus'; // 'versus' (2P) | 'sandbox' (1P builds both sides) | 'campaign'
    this.progress = loadProgress();
    this.level = null; // campaign level being played
    this.stash = null; // versus/sandbox armies parked while in the campaign
    this.match = null; // versus best-of-N score
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
    this.audio.noSamples = this.settings.sfxRec === false;
    setGoogly(this.settings.googly !== false);
    this.audio.setMuted(this.settings.sound === false);
    this.corner = new Corner({
      sound: () => this.adjustSetting('sound', 1),
      music: () => this.adjustSetting('music', 1),
      settings: () => this.openSettings(),
    }, () => ({ sound: this.settings.sound !== false, music: this.settings.music, busy: this.state === 'battle' }));
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
      team: 0, active: true, backT: 0, cleared: false,
    }));
    const unlock = () => this.audio.unlock();
    addEventListener('keydown', unlock);
    addEventListener('mousedown', unlock);
    addEventListener('touchstart', unlock);
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'battle') this.openPause();
    });
    this.creator = new Creator(this);
    window.__battles = window.__tabs = this;
  }

  async init(progress) {
    progress?.('Warming up the physics…');
    await initPhysics();
    progress?.('Painting the soldiers…');
    await new Promise((r) => setTimeout(r, 20));
    // custom units (Unit Creator): register the saved ones before anything reads the roster
    try { loadRecipes(); syncCustomUnits(); } catch (e) { console.warn('custom units skipped', e); }
    this.ui.portraits = renderPortraits(UNITS, 112);
    this.customSig = this.customSigs();
    this.ui.buildTitle();
    this.ui.buildSetup();
    this.ui.buildBattle();
    this.ui.buildReplay();
    this.ui.buildLevels();
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
    if (this.mode === 'campaign' && this.level) {
      // the player's army for this level lives with the campaign progress
      this.progress.armies[this.level.id] = packArmy(this.armies[0]);
      saveProgress(this.progress);
      saveStore({ settings: this.settings, armies: packArmy2(this.stash?.armies || [[], []]), maps: this.mapArmies });
      return;
    }
    if (this.map) this.mapArmies[this.map.id] = packArmy2(this.armies);
    saveStore({ settings: this.settings, armies: packArmy2(this.armies), maps: this.mapArmies });
  }

  // gold and unit limits for one army (campaign: the level's; versus: plus the round bonus)
  budgetOf(t) {
    if (this.mode === 'campaign' && this.level) return t === 0 ? this.level.budget : Infinity;
    const b = BUDGETS[this.settings[this.limKeys()[0]]];
    if (this.mode === 'versus' && this.match && b !== Infinity) return Math.round(b * (1 + BONUS * this.match.bonus[t]));
    return b;
  }
  capOf(t) {
    if (this.mode === 'campaign' && this.level) return t === 0 ? this.level.cap : Infinity;
    return CAPS[this.settings[this.limKeys()[1]]];
  }
  // sandbox keeps its own gold and unit limits (default: unlimited gold)
  limKeys(sb = this.state === 'title' ? this.titlePage === 'sandbox' : this.mode === 'sandbox') {
    return sb ? ['sbBudget', 'sbCap'] : ['budget', 'cap'];
  }
  // which army is fixed (the campaign's enemy)
  locked(t) { return this.mode === 'campaign' && t === 1; }
  activePlayers() { return [0, 1].filter((p) => this.ps[p].active); }
  get solo() { return this.activePlayers().length === 1; }
  // factions a player may build with (campaign worlds limit them; unknown ids are ignored)
  factionList() {
    const ids = this.mode === 'campaign' && this.level ? WORLDS[this.level.world].factions : null;
    const list = ids ? FACTIONS.filter((f) => ids.includes(f.id)) : FACTIONS;
    return (list.length ? list : FACTIONS).filter((f) => unitsOfFaction(f.id).length);
  }
  get lookOpts() { return { lookSpeed: 2.3 * LOOK[this.settings.look], invertY: this.settings.invertY }; }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  applyQuality() {
    const q = QUALITY[this.quality], s = this.settings;
    const base = q.pr >= 2 ? Math.min(2, devicePixelRatio || 1) : q.pr;
    this.renderer.setPixelRatio(Math.max(0.2, base * (RES[s.res] ?? 1) * this.perf.autoScale));
    if (this.fx) this.fx.lite = !!s.fxLite;
    if (this.env) {
      this.env.sun.castShadow = s.shadows !== false;
      const sh = this.env.sun.shadow;
      if (sh.mapSize.x !== q.shadow) {
        sh.mapSize.set(q.shadow, q.shadow);
        if (sh.map) { sh.map.dispose(); sh.map = null; }
      }
    }
    this.resize();
  }

  // ---------------------------------------------------------------- map
  // opts.armies: use these armies instead of the ones saved for the map (campaign)
  loadMap(i, opts = {}) {
    this.disposeBattle();
    if (opts.armies) {
      this.armies = opts.armies;
      for (const p of this.ps) { p.undo = []; p.stroke = p.rstroke = null; }
    } else if (this.map && this.map !== MAPS[i]) {
      // armies are kept per map: park the current ones, pick up the new map's
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
    env.sun.castShadow = this.settings.shadows !== false;
    this.env = env;
    this.zones = [
      zoneMesh(this.terrain, -FIELD.x, -ZONE_GAP, -FIELD.z, FIELD.z, TEAM_COLORS[0]),
      zoneMesh(this.terrain, ZONE_GAP, FIELD.x, -FIELD.z, FIELD.z, TEAM_COLORS[1]),
    ];
    this.zones.forEach((z) => this.scene.add(z));
    this.fx = new FX(this.scene, this.terrain);
    this.fx.blood = this.settings.blood;
    this.fx.lite = !!this.settings.fxLite;
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
      for (const a of this.armies[t]) if (UNIT_BY_ID[a.type] && !this.terrain.blocked(a.x, a.z, 0)) { keep.push(a); this.addSetupVis(t, a); }
      this.armies[t] = keep;
    }
    for (const p of this.ps) { p.ghosts = []; p.ghostId = null; }
    this.titleUnits = null;
    this.battleVis = null;
  }

  addSetupVis(team, a) {
    const def = UNIT_BY_ID[a.type];
    if (a.type.startsWith('jk_')) this.audio.wantSamples('jjk'); // its voice lines load while you plan
    const vis = buildUnitVisual(def, team, { skel: skelOf(def), share: true });
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
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = clamp(raw, 0, 0.1);
    this.last = now;
    const P = this.perf;
    P.tick(raw, this.state === 'battle' && this.timeScale > 0);
    if (P.adapt(raw, this.settings.autoRes)) this.applyQuality();
    this.input._dt = dt;
    this.input.poll(dt);
    this.audio.beginFrame();
    if (this.input.anyPressed('a') || this.input.anyPressed('start')) this.audio.unlock();
    this.padEvents();
    // leaving the title (a controller press counts as the user gesture browsers want):
    // go fullscreen like the other games
    if (this.lastState === 'title' && this.state !== 'title' && this.settings.autoFs !== false && !fsElement()) setFullscreen(true);
    this.lastState = this.state;
    if (!this.prepping) switch (this.state) {
      case 'title': this.updateTitle(dt); break;
      case 'levels': this.updateLevels(dt); break;
      case 'setup': this.updateSetup(dt); break;
      case 'battle': case 'result': this.updateBattle(dt); break;
      case 'replay': this.updateReplay(dt); break;
      case 'paused': this.updatePause(dt); break;
      case 'creator': this.creator.update(dt); break;
    }
    // slow motion slows the sound too (pitch of new sounds, a muffling low-pass)
    const ts = this.state === 'battle' || this.state === 'result' ? this.timeScale
      : this.state === 'replay' && this.player ? (this.player.playing ? this.player.speed : 1) : this.state === 'paused' ? this.audio.wantScale ?? 1 : 1;
    this.audio.setTimeScale(ts);
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
    this.perfHud();
  }

  // heavy-load banner (points to the Performance options) and the fps counter
  perfHud() {
    const P = this.perf, st = this.state === 'paused' ? this.pauseFrom : this.state;
    const live = ['setup', 'battle', 'result', 'replay'].includes(st) && this.state !== 'paused';
    let warn = '';
    if (this.prepping) warn = `⏳ ${this.prepping}`;
    else if (live && P.warn && !this.helpOn) {
      const sim = st === 'battle' && P.speed < 0.9 ? ` · battle at <b>${Math.round(P.speed * 100)}%</b> speed` : '';
      const how = st === 'setup' ? `${btn('Start')} → <b>Performance</b>` : `${btn('Start')} → <b>Performance</b> to lighten the load, or end the battle there`;
      warn = `⚠ Heavy load: <b>${Math.round(P.fps)} fps</b>${sim}. ${how}`;
    } else if (live && st === 'battle' && P.speed < 0.8 && this.timeScale > 0) {
      warn = `<small>⏱ Heavy battle: running at ${Math.round(P.speed * 100)}% speed</small>`;
    }
    const fps = this.settings.showFps ? `${Math.round(P.fps)} fps${this.battle && st === 'battle' ? ` · sim ${P.stepMs.toFixed(0)} ms/step · ${Math.round(P.speed * 100)}%` : ''}` : '';
    this.ui.setPerf(warn, fps);
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
    if (this.state === 'setup') return this.solo ? [0] : [0, 1];
    if (this.state === 'title' || this.state === 'levels' || this.state === 'creator') return [0];
    return this.split ? [0, 1] : [0];
  }

  render(dt) {
    const r = this.renderer;
    const w = r.domElement.width / r.getPixelRatio(), h = r.domElement.height / r.getPixelRatio();
    const vs = this.views();
    this.updateLod(vs, dt);
    r.shadowMap.needsUpdate = true;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.audio.setListeners(vs.map((v) => this.rigs[v]));
    r.setScissorTest(vs.length > 1);
    vs.forEach((v, i) => {
      const rig = this.rigs[v];
      const vw = vs.length > 1 ? w / 2 : w;
      rig.cam.aspect = vw / h;
      const fov = clamp((vs.length > 1 ? 70 : 62) + rig.zoom - 24 * (rig.mode === 'possess' ? rig.aimZoom || 0 : 0), 20, 100);
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

  // Distant units in a big army are drawn as simple stand-ins (Performance → Distant units)
  // (also rattles the googly pupils of units near a camera)
  updateLod(vs, dt) {
    const lists = this.state === 'setup' ? this.setupVis || [] : this.battleVis && this.battle ? [this.battleVis] : this.titleUnits ? [this.titleUnits] : [];
    const n = lists.reduce((a, l) => a + l.length, 0);
    const on = this.settings.lod && n >= LOD_MIN;
    const D = LOD_DIST[this.quality] || 30, cams = vs.map((v) => this.rigs[v].cam.position);
    for (const l of lists) for (const vis of l) {
      const p = vis.parts[0].position;
      let d2 = Infinity;
      for (const c of cams) d2 = Math.min(d2, (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2);
      if (!on) { if (vis.far) setFar(vis, false); } else {
        const k = vis.far ? 0.9 : 1.1; // hysteresis
        setFar(vis, d2 > (D * k) ** 2);
      }
      if (vis.pupils && !vis.far && d2 < 900 && vis.root.visible) jiggleEyes(vis, dt);
    }
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
    for (let t = 0; t < 2; t++) for (const vis of this.setupVis[t]) vis.root.visible = !blind || t === this.ps[v].team;
    return blind;
  }

  blindNow() { return this.state === 'setup' && this.mode === 'versus' && this.settings.blind && !(this.countdown > 0); }

  showAllSetupVis() { for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) v.root.visible = true; }

  // ---------------------------------------------------------------- custom units
  customSigs() {
    const o = {};
    for (const d of unitsOfFaction(CUSTOM_FACTION.id)) o[d.id] = JSON.stringify(d);
    return o;
  }

  // The Unit Creator saved or deleted units: re-register them and refresh everything
  // that caches a unit definition (portraits, skeletons, placement ghosts, placed units).
  customChanged() {
    syncCustomUnits();
    const sig = this.customSigs(), old = this.customSig || {};
    const changed = Object.keys(sig).filter((id) => sig[id] !== old[id]);
    const gone = Object.keys(old).filter((id) => !sig[id]);
    this.customSig = sig;
    const touched = new Set([...changed, ...gone]);
    if (!touched.size) return;
    if (changed.length) Object.assign(this.ui.portraits, renderPortraits(changed.map((id) => UNIT_BY_ID[id]), 112));
    for (const id of touched) SKEL_CACHE.delete(id);
    for (const p of this.ps) { for (const g of p.ghosts) disposeVisual(g); p.ghosts = []; p.ghostId = null; p.undo = []; }
    for (let t = 0; t < 2; t++) {
      // deleted units leave the armies; edited ones are rebuilt with their new look
      this.armies[t] = this.armies[t].filter((a) => UNIT_BY_ID[a.type]);
      for (const v of this.setupVis[t].filter((v) => touched.has(v.entry.type))) disposeVisual(v);
      this.setupVis[t] = this.setupVis[t].filter((v) => !touched.has(v.entry.type));
      for (const a of this.armies[t]) if (changed.includes(a.type)) {
        const v = this.addSetupVis(t, a);
        if (this.state === 'creator') { v.root.visible = false; this.creator.hidden.push(v); }
      }
    }
    if (this.titleUnits) { for (const v of this.titleUnits) disposeVisual(v); this.titleUnits = null; }
    this.save();
  }

  // ---------------------------------------------------------------- title
  goTitle(sel = 0) {
    this.leaveCampaign();
    this.match = null;
    this.disposeBattle();
    this.fx.clear();
    this.projViz.clear();
    this.rec = null;
    this.state = 'title';
    this.ui.only('title');
    this.ui.setHelp(false);
    this.helpOn = false;
    this.titleSel = sel;
    this.titlePage = 'main';
    this.zones.forEach((z) => (z.visible = false));
    this.hideGhosts();
    this.closeModals();
    for (const r of this.rigs) { r.release(); r.zoom = 0; }
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.resetVis(v);
    this.showAllSetupVis();
    this.audio.startMusic('title');
    this.titleT = this.titleT || 0;
    this.showTitleUnits();
    this.input.swallow();
  }

  // the current armies stand on the title field, or a demo line-up if both are empty
  showTitleUnits() {
    if (!this.armies[0].length && !this.armies[1].length && !this.titleUnits) {
      this.titleUnits = UNITS.map((d, i) => {
        const vis = buildUnitVisual(d, i % 2, { skel: skelOf(d) });
        vis.entry = { type: d.id, x: (i - UNITS.length / 2) * 2.2, z: (i % 2) * 2.5 - 6 };
        vis.st = { phase: 0, amp: 0, style: d.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0, mode: d.personality.idle === 'play' ? 'play' : 'normal', t: rand(0, 10) };
        this.scene.add(vis.root);
        return vis;
      });
    }
  }

  // title and level select share the slowly circling camera
  titleScene(dt) {
    this.titleT += dt;
    const a = this.titleT * 0.06;
    this.rigs[0].set(Math.sin(a) * 24, 7 + Math.sin(a * 1.3) * 2, Math.cos(a) * 24 - 4, 0, 0);
    this.rigs[0].lookAtPoint(0, 1.5, -4);
    this.rigs[0].apply();
    for (const v of this.titleUnits || []) this.poseIdle(v, dt, Math.atan2(this.rigs[0].pos.x - v.entry.x, this.rigs[0].pos.z - v.entry.z) * 0.6);
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.poseIdle(v, dt, t === 0 ? Math.PI / 2 : -Math.PI / 2);
  }

  titleItems() {
    const s = this.settings;
    const [bk, ck] = this.limKeys(this.titlePage === 'sandbox');
    const common = [
      { label: 'Map', value: MAPS[s.map].name, key: 'map', preview: mapImg(MAPS[s.map].id) },
      { label: 'Budget per army', value: money(BUDGETS[s[bk]]), key: 'budget' },
      { label: 'Unit limit per army', value: capText(CAPS[s[ck]]), key: 'cap' },
    ];
    switch (this.titlePage) {
      case 'options': return [
        { label: 'Battle screen', value: s.split ? 'Split' : 'Shared', key: 'split' },
        ...this.perfItems(),
        { label: 'Look speed', value: `${LOOK[s.look]}×`, key: 'look' },
        { label: 'Invert look Y', value: onOff(s.invertY), key: 'invertY' },
        { label: 'Googly eyes', value: onOff(s.googly !== false), key: 'googly' },
        { label: 'Blood', value: onOff(s.blood), key: 'blood' },
        { label: 'Sound', value: onOff(s.sound !== false), key: 'sound' },
        { label: 'Music', value: onOff(s.music), key: 'music' },
        { label: 'Fullscreen when a game starts', value: onOff(s.autoFs !== false), key: 'autoFs' },
        { label: 'Sound effects', value: s.sfxRec ? 'Recorded' : 'Synthesised', key: 'sfxRec' },
        { label: 'Back', key: 'back' },
      ];
      case 'versus': return [
        { label: 'START BATTLE!', key: 'go' },
        ...common,
        { label: 'Match', value: ROUNDS[s.rounds] === 1 ? 'Single battle' : `Best of ${ROUNDS[s.rounds]}`, key: 'rounds' },
        { label: 'Round bonus', value: s.bonus ? `Loser +${BONUS * 100}% gold` : 'Off', key: 'bonus' },
        { label: 'Setup timer', value: TIMERS[s.timer] ? `${TIMERS[s.timer]} s` : 'Off', key: 'timer' },
        { label: 'Blind setup', value: s.blind ? 'On — armies hidden' : 'Off', key: 'blind' },
        { label: 'Back', key: 'back' },
      ];
      case 'sandbox': return [
        { label: 'START SANDBOX', key: 'go' },
        { label: 'Players', value: s.sandboxPlayers === 2 ? '2 — one army each' : '1 — build both armies', key: 'sbPlayers' },
        ...common,
        { label: 'Back', key: 'back' },
      ];
    }
    const stars = totalStars(this.progress);
    return [
      { label: 'VERSUS', note: '2 players · build at the same time', key: 'versus' },
      { label: 'CAMPAIGN', note: `1 player or 2-player co-op · ★ ${stars} / ${LEVELS.length * 3}`, key: 'campaign' },
      { label: 'SANDBOX', note: 'free play: 1 player builds both armies, or 2 players one each', key: 'sandbox' },
      { label: 'UNIT CREATOR', note: 'design your own units for every mode but the campaign', key: 'creator' },
      { label: 'Options', key: 'options' },
      { label: 'Controls', key: 'help' },
    ];
  }

  // rebuild every unit's look (Options → Googly eyes): placed armies, title units, portraits
  refreshLooks() {
    if (this.state !== 'title') return; // (Options is only on the title: nothing is fighting)
    this.disposeBattle();
    for (let t = 0; t < 2; t++) {
      for (const v of this.setupVis[t]) disposeVisual(v);
      this.setupVis[t] = [];
      for (const a of this.armies[t]) this.addSetupVis(t, a);
    }
    if (this.titleUnits) { for (const v of this.titleUnits) disposeVisual(v); this.titleUnits = null; }
    this.ui.portraits = renderPortraits(UNITS, 112);
  }

  // the corner gear: the settings for where you are
  openSettings() {
    this.audio.unlock();
    switch (this.state) {
      case 'title': this.titlePage = 'options'; this.titleSel = 0; this.helpOn = false; this.ui.setHelp(false); break;
      case 'setup': if (!this.ps[0].modal) this.ps[0].modal = { kind: 'perf', sel: 0, from: 0 }; else this.ps[0].modal = null; break;
      case 'battle': case 'result': case 'replay': this.openPause(); this.pausePage = 'perf'; break;
      case 'paused': this.closePause(); break;
      case 'levels': this.goTitle(); this.titlePage = 'options'; this.titleSel = 0; break;
    }
    this.audio.play('click');
  }

  // Performance options (title Options, setup menu and pause menu)
  perfItems() {
    const s = this.settings, pct = (x) => `${Math.round(x * 100)}%`;
    const auto = s.autoRes && this.perf.autoScale < 1 ? ` · auto ${pct((RES[s.res] ?? 1) * this.perf.autoScale)}` : '';
    return [
      { label: 'Graphics quality', value: QUALITY[this.quality].name, key: 'quality' },
      { label: 'Resolution', value: pct(RES[s.res] ?? 1) + auto, key: 'res' },
      { label: 'Auto resolution', value: s.autoRes ? 'On (lowers it when frames are slow)' : 'Off', key: 'autoRes' },
      { label: 'Shadows', value: onOff(s.shadows), key: 'shadows' },
      { label: 'Effects', value: s.fxLite ? 'Reduced' : 'Full', key: 'fxLite' },
      { label: 'Distant units', value: s.lod ? `Simple in big battles (${LOD_MIN}+)` : 'Always detailed', key: 'lod' },
      { label: 'Fallen units', value: s.corpses ? `Vanish after ${CORPSE_SECONDS} s` : 'Stay on the field', key: 'corpses' },
      { label: 'Under heavy load', value: SIM_LOADS[s.simLoad]?.name || SIM_LOADS[1].name, key: 'simLoad' },
      { label: 'Frame rate counter', value: onOff(s.showFps), key: 'showFps' },
    ];
  }
  // one line on how the game is coping (performance pages)
  perfLine() {
    const P = this.perf, n = this.battle ? this.battle.units.filter((u) => u.alive).length : this.armies[0].length + this.armies[1].length;
    const sim = this.battle && (this.state === 'battle' || this.pauseFrom === 'battle') ? ` · battle at ${Math.round(P.speed * 100)}% speed` : '';
    return `Now: <b>${Math.round(P.fps)} fps</b>${sim} · ${n} unit${n === 1 ? '' : 's'}${this.battle ? ' standing' : ''}. Lower the resolution, shadows or effects for a faster picture; <i>Fallen units</i> and fewer units for a faster battle.`;
  }

  // change a setting by d (±1); returns true if handled
  adjustSetting(key, d) {
    const s = this.settings;
    const cyc = (v, n) => (v + d + n) % n;
    switch (key) {
      case 'map': s.map = cyc(s.map, MAPS.length); this.changeMap(s.map); break;
      case 'budget': { const k = this.limKeys()[0]; s[k] = cyc(s[k], BUDGETS.length); break; }
      case 'cap': { const k = this.limKeys()[1]; s[k] = cyc(s[k], CAPS.length); break; }
      case 'blind': s.blind = !s.blind; break;
      case 'rounds': s.rounds = cyc(s.rounds | 0, ROUNDS.length); break;
      case 'bonus': s.bonus = !s.bonus; break;
      case 'sbPlayers': s.sandboxPlayers = s.sandboxPlayers === 2 ? 1 : 2; break;
      case 'timer': s.timer = cyc(s.timer | 0, TIMERS.length); break;
      case 'split': s.split = !s.split; this.split = s.split; break;
      case 'quality': this.quality = cyc(this.quality, QUALITY.length); s.quality = this.quality; this.applyQuality(); break;
      case 'look': s.look = clamp(s.look + d, 0, LOOK.length - 1); break;
      case 'invertY': s.invertY = !s.invertY; break;
      case 'blood': s.blood = !s.blood; this.fx.blood = s.blood; break;
      case 'music': s.music = !s.music; this.audio.setVolumes(0.8, s.music ? 0.45 : 0); this.corner?.refresh(); break;
      case 'sound': s.sound = s.sound === false; this.audio.setMuted(!s.sound); this.corner?.refresh(); break;
      case 'autoFs': s.autoFs = s.autoFs === false; break;
      case 'googly': s.googly = s.googly === false; setGoogly(s.googly); this.refreshLooks(); break;
      case 'res': s.res = cyc(s.res | 0, RES.length); this.applyQuality(); break;
      case 'autoRes': s.autoRes = !s.autoRes; this.perf.adapt(0, s.autoRes); this.applyQuality(); break;
      case 'shadows': s.shadows = !s.shadows; this.applyQuality(); break;
      case 'fxLite': s.fxLite = !s.fxLite; this.applyQuality(); break;
      case 'corpses': s.corpses = s.corpses ? 0 : 1; break;
      case 'simLoad': s.simLoad = cyc(s.simLoad | 0, SIM_LOADS.length); this.perf.next = 0; break;
      case 'showFps': s.showFps = !s.showFps; break;
      case 'lod': s.lod = !s.lod; break;
      case 'sfxRec': s.sfxRec = !s.sfxRec; this.audio.noSamples = !s.sfxRec; break;
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
      this.showTitleUnits();
    } else if (st === 'setup') {
      this.zones.forEach((z) => (z.visible = true));
      for (const p of this.ps) p.ready = false;
    }
    this.ui.toast(`Map: <b>${MAPS[i].name}</b>`);
  }

  // start a mode from the title: 'versus' (new match) or 'sandbox'
  startMode(mode) {
    this.mode = mode;
    if (mode === 'versus') this.newMatch();
    else this.match = null;
    this.goSetup();
  }

  newMatch() {
    this.match = { bestOf: ROUNDS[this.settings.rounds | 0], wins: [0, 0], round: 1, bonus: [0, 0], winner: -1 };
  }

  updateTitle(dt) {
    const I = this.input;
    this.titleScene(dt);
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
    const back = () => {
      const page = this.titlePage;
      this.titlePage = 'main';
      this.titleSel = Math.max(0, this.titleItems().findIndex((i) => i.key === page));
      this.audio.play('click');
    };
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
        if (it.key === 'go') { this.startMode(this.titlePage); return; }
        if (it.key === 'campaign') { this.goLevels(); return; }
        if (it.key === 'creator') { this.creator.open(); return; }
        if (it.key === 'versus' || it.key === 'sandbox' || it.key === 'options') { this.titlePage = it.key; this.titleSel = 0; this.audio.play('click'); }
        else if (it.key === 'back') back();
        else if (it.key === 'help') { this.helpOn = true; this.ui.setHelp(true); }
        else this.adjustSetting(it.key, 1);
        I.swallow();
        if (this.state !== 'title') return;
      }
      if (I.pressed(p, 'b') && this.titlePage !== 'main') { back(); I.swallow(); }
      if (I.pressed(p, 'start')) {
        // Start: quick versus from the main page, or start the mode of the open page
        if (this.titlePage === 'main') { this.startMode('versus'); return; }
        if (this.titlePage === 'versus' || this.titlePage === 'sandbox') { this.startMode(this.titlePage); return; }
      }
      items = this.titleItems();
    }
    const heads = { options: 'OPTIONS', versus: 'VERSUS · 2 PLAYERS', sandbox: `SANDBOX · ${this.settings.sandboxPlayers === 2 ? '2 PLAYERS' : '1 PLAYER'}` };
    const startHint = this.titlePage === 'main' ? 'quick versus' : this.titlePage === 'options' ? '' : 'start';
    this.ui.updateTitle({
      head: heads[this.titlePage] || '',
      items, sel: this.titleSel,
      hint: `${btn('dpad')}/${btn('LS')} choose &nbsp; ${items.some((i) => i.value !== undefined) ? '←→ change &nbsp; ' : ''}${btn('A')} select${this.titlePage !== 'main' ? ` &nbsp; ${btn('B')} back` : ''}${startHint ? ` &nbsp; ${btn('Start')} ${startHint}` : ''}`,
      pads: [0, 1].map((p) => ({ name: I.padNames[p], standard: true })),
      soundOff: !this.audio.ctx || this.audio.ctx.state !== 'running',
    });
  }

  // ---------------------------------------------------------------- campaign
  goLevels() {
    if (this.titleUnits) { for (const v of this.titleUnits) disposeVisual(v); this.titleUnits = null; }
    this.disposeBattle();
    this.fx.clear();
    this.projViz.clear();
    this.rec = null;
    this.state = 'levels';
    this.ui.only('levels');
    this.ui.setHelp(false);
    this.helpOn = false;
    this.zones.forEach((z) => (z.visible = false));
    this.hideGhosts();
    this.closeModals();
    for (const r of this.rigs) { r.release(); r.zoom = 0; }
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.resetVis(v);
    this.showAllSetupVis();
    this.audio.startMusic('title');
    this.titleT = this.titleT || 0;
    // select the last level played, else the first one not beaten yet
    const pr = this.progress;
    const want = this.level || levelById(pr.last) || LEVELS.find((l) => !pr.stars[l.id] && levelUnlocked(pr, l)) || LEVELS[0];
    this.lvSel = LEVELS.indexOf(want);
    this.input.swallow();
  }

  updateLevels(dt) {
    const I = this.input, pr = this.progress;
    this.titleScene(dt);
    let sel = this.lvSel;
    const lv = () => LEVELS[sel];
    for (let p = 0; p < 2; p++) {
      if (I.nav(p, 'right')) sel = Math.min(LEVELS.length - 1, sel + 1);
      if (I.nav(p, 'left')) sel = Math.max(0, sel - 1);
      const w = lv().world, i = lv().index;
      const inWorld = (wi, li) => LEVELS.indexOf(WORLDS[wi].levels[clamp(li, 0, WORLDS[wi].levels.length - 1)]);
      if (I.nav(p, 'down') || I.pressed(p, 'rb')) sel = inWorld(Math.min(WORLDS.length - 1, w + 1), i);
      if (I.nav(p, 'up') || I.pressed(p, 'lb')) sel = inWorld(Math.max(0, w - 1), i);
      if (I.pressed(p, 'x') || I.pressed(p, 'y')) { pr.coop = !pr.coop; saveProgress(pr); this.audio.play('click'); }
      if (I.pressed(p, 'b')) { this.lvSel = sel; this.goTitle(1); return; }
      if (I.pressed(p, 'a') || I.pressed(p, 'start')) {
        if (levelUnlocked(pr, lv())) { this.lvSel = sel; this.enterLevel(lv()); return; }
        this.ui.toast(worldUnlocked(pr, lv().world) ? '🔒 Beat the previous level first' : `🔒 Beat every level of ${WORLDS[lv().world - 1].name} first`, 1.6);
        this.audio.play('remove', null, 0.4, 0.6);
      }
    }
    if (sel !== this.lvSel) { this.lvSel = sel; this.audio.play('click', null, 0.5); }
    const L = lv();
    const enemy = enemyArmy(L);
    const counts = new Map();
    for (const a of enemy) counts.set(a.type, (counts.get(a.type) || 0) + 1);
    const facs = WORLDS[L.world].factions;
    this.ui.updateLevels({
      worlds: WORLDS.map((w, wi) => ({
        name: w.name, color: w.color, bonus: !!w.bonus, unlocked: worldUnlocked(pr, wi),
        levels: w.levels.map((l) => ({ name: l.name, wip: !!l.wip, stars: pr.stars[l.id] || 0, unlocked: levelUnlocked(pr, l), sel: l === L })),
      })),
      level: {
        name: L.name, wip: !!L.wip, world: WORLDS[L.world].name, color: WORLDS[L.world].color, tip: L.tip || '', map: (MAPS.find((m) => m.id === L.map) || MAPS[0]).name, mapImg: mapImg((MAPS.find((m) => m.id === L.map) || MAPS[0]).id),
        budget: L.budget, cap: L.cap, enemyValue: armyValue(enemy), enemyCount: enemy.length,
        enemy: [...counts].map(([id, n]) => ({ id, n })), stars: pr.stars[L.id] || 0, best: pr.best[L.id],
        starGold: starGold(L), unlocked: levelUnlocked(pr, L),
        factions: facs ? FACTIONS.filter((f) => facs.includes(f.id)).map((f) => f.name) : ['every faction'],
      },
      coop: pr.coop, total: totalStars(pr), max: LEVELS.length * 3,
    });
  }

  // load a campaign level: its map, the preset enemy and the player's last army for it
  enterLevel(level) {
    if (!this.stash) this.stash = { armies: this.armies, map: this.settings.map };
    this.mode = 'campaign';
    this.match = null;
    this.level = level;
    this.progress.last = level.id;
    const mi = Math.max(0, MAPS.findIndex((m) => m.id === level.map));
    const mine = (this.progress.armies[level.id] || []).filter((a) => UNIT_BY_ID[a.type]).map((a) => ({ ...a }));
    if (this.titleUnits) { for (const v of this.titleUnits) disposeVisual(v); this.titleUnits = null; }
    this.loadMap(mi, { armies: [mine, enemyArmy(level)] });
    saveProgress(this.progress);
    this.goSetup();
  }

  leaveCampaign() {
    if (!this.stash) return;
    const st = this.stash;
    this.stash = null;
    this.level = null;
    this.mode = 'versus';
    this.settings.map = st.map;
    if (this.titleUnits) { for (const v of this.titleUnits) disposeVisual(v); this.titleUnits = null; }
    this.loadMap(st.map, { armies: st.armies });
  }

  // campaign result: stars for a win, best (lowest) gold, unlocks
  scoreLevel(won) {
    const L = this.level, pr = this.progress;
    const spent = this.armyCost(0);
    const res = { won, spent, stars: won ? starsFor(L, spent) : 0, prevStars: pr.stars[L.id] || 0, starGold: starGold(L), budget: L.budget, name: L.name };
    if (won) {
      const nx = nextLevel(L);
      const wasOpen = nx && levelUnlocked(pr, nx);
      pr.stars[L.id] = Math.max(res.prevStars, res.stars);
      if (pr.best[L.id] === undefined || spent < pr.best[L.id]) { res.record = pr.best[L.id] !== undefined; pr.best[L.id] = spent; }
      if (nx && !wasOpen && levelUnlocked(pr, nx)) res.unlocked = nx.index === 0 ? `New world: ${WORLDS[nx.world].name}!` : `Unlocked: ${nx.name}`;
      saveProgress(pr);
    }
    res.next = won ? nextLevel(L) : null;
    return res;
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
    // who builds which army: versus P1 Blue / P2 Red; campaign Blue (both in co-op);
    // sandbox one player builds both sides (and keeps the side they were on)
    const [a, b] = this.ps;
    if (this.mode === 'versus') { a.team = 0; b.team = 1; b.active = true; }
    else if (this.mode === 'campaign') { a.team = 0; b.team = 0; b.active = !!this.progress.coop; }
    else if (this.settings.sandboxPlayers === 2) { a.team = 0; b.team = 1; b.active = true; } // 2-player sandbox: one army each
    else { a.team = a.team === 1 ? 1 : 0; b.team = 1; b.active = false; }
    a.active = true;
    const nf = this.factionList().length;
    for (const p of this.ps) {
      p.ready = false; p.last = null; p.modal = null; p.stroke = p.rstroke = null; p.backT = 0; p.cleared = false;
      if (p.faction >= nf) { p.faction = 0; p.unit = 0; }
    }
    this.countdown = 0;
    this.forcedStart = false;
    this.setupLeft = this.mode === 'versus' ? TIMERS[this.settings.timer | 0] : 0;
    for (const r of this.rigs) { if (r.unit && r.unit.control) r.unit.control = null; r.release(); r.zoom = 0; }
    this.setupCam(0);
    this.setupCam(1);
    for (let t = 0; t < 2; t++) for (const v of this.setupVis[t]) this.resetVis(v);
    this.ui.setSetupLayout(this.solo);
    this.audio.startMusic('setup');
    this.audio.setVolumes(0.8, this.settings.music ? 0.45 : 0);
    if (this.mode === 'versus' && this.match && this.match.bestOf > 1) {
      const m = this.match;
      const bonus = [0, 1].filter((t) => m.bonus[t] > 0).map((t) => `${teamTag(t)} +${Math.round(m.bonus[t] * BONUS * 100)}% gold`).join(' · ');
      this.ui.toast(`Round ${m.round} · ${teamTag(0)} ${m.wins[0]} – ${m.wins[1]} ${teamTag(1)}${bonus ? ` · ${bonus}` : ''}`, 3);
    }
    this.input.swallow();
  }

  // a comfortable default view over the player's own zone (co-op: one each end of it)
  setupCam(p) {
    const t = this.ps[p].team;
    const sx = t === 0 ? -1 : 1;
    const shared = this.ps[0].active && this.ps[1].active && this.ps[0].team === this.ps[1].team;
    const z = shared ? (p === 0 ? -11 : 11) : 0;
    this.rigs[p].set(sx * (FIELD.x + 2), this.terrain.height(sx * FIELD.x, z) + 19, z, sx < 0 ? Math.PI / 2 : -Math.PI / 2, -0.62);
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

  // how a player is named in messages: their army, or P1/P2 when both build one army
  who(p) {
    const t = this.ps[p].team;
    if (this.ps[0].active && this.ps[1].active && this.ps[0].team === this.ps[1].team) return `<b style="color:${TEAM_COLORS[t]}">P${p + 1}</b>`;
    return teamTag(t);
  }

  addEntry(t, a) { this.armies[t].push(a); this.addSetupVis(t, a); }

  removeEntry(t, a) {
    const i = this.armies[t].indexOf(a);
    if (i < 0) return false;
    this.armies[t].splice(i, 1);
    const vi = this.setupVis[t].findIndex((v) => v.entry === a);
    if (vi >= 0) disposeVisual(this.setupVis[t].splice(vi, 1)[0]);
    return true;
  }

  undo(p) {
    const ps = this.ps[p];
    const u = ps.undo.pop();
    if (!u) { this.ui.toast(`${this.who(p)}: nothing to undo`, 1.2, p); return; }
    const t = u.team;
    let n = 0;
    if (u.kind === 'add') { for (const a of u.entries) if (this.removeEntry(t, a)) n++; }
    else if (u.kind === 'replace') {
      for (const a of u.entries) this.removeEntry(t, a);
      for (const a of u.old) { this.addEntry(t, a); n++; }
    } else for (const a of u.entries) if (this.armies[t].length < this.capOf(t)) { this.addEntry(t, a); n++; }
    this.audio.play(u.kind === 'add' ? 'remove' : 'place', null, 0.5, 1.1);
    const what = { add: 'placing', clear: 'clear', remove: 'removing', replace: 'random army' }[u.kind];
    this.ui.toast(`${this.who(p)}: undo ${what}${u.kind === 'replace' ? '' : ` · ${n} unit${n === 1 ? '' : 's'}`}`, 1.2, p);
    this.save();
  }

  clearArmy(p, t = this.ps[p].team) {
    const army = this.armies[t];
    if (this.locked(t)) return;
    if (!army.length) { this.ui.toast(`${teamTag(t)} army is already empty`, 1.2, p); return; }
    this.ps[p].undo.push({ kind: 'clear', team: t, entries: army.slice() });
    for (const v of this.setupVis[t]) disposeVisual(v);
    this.setupVis[t] = [];
    army.length = 0;
    this.audio.play('remove', null, 0.8, 0.5);
    this.ui.toast(`${teamTag(t)} army cleared <small>(${btn('X')} undo)</small>`, 2, p);
    this.save();
  }

  // Fill an army with a random mix of 1-3 unit types within its gold and unit
  // limits: melee in front, ranged and support behind. One undo step.
  randomArmy(p, t = this.ps[p].team, quiet = false) {
    if (this.locked(t)) return;
    const pool = this.factionList().flatMap((f) => unitsOfFaction(f.id));
    const budget = this.budgetOf(t) === Infinity ? 3000 : this.budgetOf(t);
    const cap = Math.min(this.capOf(t), 60);
    // at least a handful of the first type; extra types may be pricier
    let cheap = pool.filter((d) => d.cost * 5 <= budget);
    if (!cheap.length) cheap = pool.filter((d) => d.cost <= budget);
    if (!cheap.length) return;
    const types = [cheap[Math.floor(Math.random() * cheap.length)]];
    const extra = pool.filter((d) => d.cost * 2 <= budget);
    for (let k = Math.floor(rand(0, 2.6)); k > 0 && extra.length; k--) types.push(extra[Math.floor(Math.random() * extra.length)]);
    const n = new Map();
    let left = budget, count = 0;
    for (let i = 0; i < 400 && count < cap; i++) {
      const ok = types.filter((d) => d.cost <= left);
      if (!ok.length) break;
      const d = ok[Math.floor(Math.random() * ok.length)];
      n.set(d, (n.get(d) || 0) + 1);
      left -= d.cost;
      count++;
    }
    const order = [...n.keys()].sort((a, b) => (a.weapon.kind === 'melee' ? 0 : 1) - (b.weapon.kind === 'melee' ? 0 : 1) || b.hp - a.hp);
    const sx = t === 0 ? -1 : 1;
    const added = [];
    let d = 8, prevSp = 0;
    for (const def of order) {
      const sp = skelOf(def).radius * 2.3 + 0.35;
      d += (prevSp + sp) / 2;
      let todo = n.get(def);
      const perRow = clamp(Math.floor((FIELD.z * 2 - 4) / sp), 1, 12);
      while (todo > 0 && d <= FIELD.x - 1) {
        const k = Math.min(todo, perRow);
        // fill the row from the middle out, skipping spots in walls or water
        let placed = 0;
        for (let i = 0; i < perRow && placed < k; i++) {
          const z = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * sp + (k % 2 ? 0 : sp / 2);
          if (Math.abs(z) > FIELD.z - 1 || this.terrain.blocked(sx * d, z, skelOf(def).radius)) continue;
          added.push({ type: def.id, x: sx * d, z });
          placed++;
        }
        todo -= placed;
        if (todo > 0) d += sp;
      }
      prevSp = sp;
    }
    const old = this.armies[t].slice();
    for (const v of this.setupVis[t]) disposeVisual(v);
    this.setupVis[t] = [];
    this.armies[t].length = 0;
    for (const a of added) this.addEntry(t, a);
    this.ps[p].undo.push({ kind: 'replace', team: t, old, entries: added });
    this.audio.play('place', null, 0.8, 1.2);
    if (!quiet) this.ui.toast(`${teamTag(t)}: random army · ${added.length} units · ${this.armyCost(t).toLocaleString('en-US')} gold <small>(${btn('X')} undo)</small>`, 2.2, p);
    this.save();
  }

  // solo (sandbox): switch which army you're building
  canSwitch(p) { return this.solo && !this.locked(1 - this.ps[p].team); }
  switchSide(p) {
    const ps = this.ps[p];
    ps.team = 1 - ps.team;
    ps.stroke = ps.rstroke = null;
    ps.last = null;
    this.setupCam(p);
    this.audio.play('click', null, 0.8, 0.9);
    this.ui.toast(`Now building the ${teamTag(ps.team)} army`, 1.4, p);
  }

  // what stops this player from readying up ('' if nothing)
  readyProblem(p) {
    const ps = this.ps[p];
    const teams = this.mode === 'sandbox' && this.solo ? [ps.team, 1 - ps.team] : [ps.team];
    for (const t of teams) {
      const n = this.armies[t].length, used = this.armyCost(t);
      const name = teams.length > 1 ? `${teamTag(t)} army: ` : '';
      if (!n) return t === ps.team ? `${name}place some units first!` : `${name}empty — ${btn('View')} switch side, or ${btn('Start')} → Random army`;
      if (used > this.budgetOf(t)) return `${name}over budget (${used.toLocaleString('en-US')} / ${this.budgetOf(t).toLocaleString('en-US')})`;
      if (n > this.capOf(t)) return `${name}too many units (limit ${this.capOf(t)})`;
    }
    return '';
  }

  updateSetup(dt) {
    for (const p of this.activePlayers()) { this.updateSetupPlayer(p, dt); if (this.state !== 'setup') return; }
    // a big army animates its distant (stand-in) units every 4th frame, staggered
    const many = this.setupVis[0].length + this.setupVis[1].length >= LOD_MIN;
    for (let t = 0; t < 2; t++) {
      this.setupVis[t].forEach((v, i) => {
        if (many && v.far && (i + this.frameNo) % 4) return;
        this.poseIdle(v, many && v.far ? dt * 4 : dt, t === 0 ? Math.PI / 2 : -Math.PI / 2);
      });
    }
    // versus setup timer: when it runs out the battle starts with whatever is placed
    if (this.setupLeft > 0 && !(this.countdown > 0)) {
      const prev = this.setupLeft;
      this.setupLeft = Math.max(0, this.setupLeft - dt);
      if (this.setupLeft <= 10 && Math.ceil(prev) !== Math.ceil(this.setupLeft)) this.audio.play('click', null, 0.7, 1.5);
      if (this.setupLeft <= 0) this.timeUp();
    }
    const allReady = this.activePlayers().every((p) => this.ps[p].ready);
    if (allReady) {
      if (this.countdown <= 0) {
        this.countdown = 3.0;
        this.audio.play('click', null, 1, 0.7);
        if (this.settings.blind && this.mode === 'versus') this.ui.toast('Armies revealed!', 1.8);
      }
      const prev = this.countdown;
      this.countdown -= dt;
      if (Math.ceil(prev) !== Math.ceil(this.countdown) && this.countdown > 0) this.audio.play('click', null, 1, 0.8);
      if (this.countdown <= 0) { this.startBattle(); return; }
    } else {
      if (this.countdown > 0) this.ui.toast('Countdown cancelled');
      this.countdown = 0;
    }
    this.ui.setCountdown(this.countdown, this.forcedStart ? "Time's up!" : `${btn('Y')} cancel`);
    this.ui.setTimer(this.setupLeft > 0 && !(this.countdown > 0) ? this.setupLeft : 0);
  }

  // setup timer ran out: trim armies to their limits, give empty ones a random army, go
  timeUp() {
    for (const t of [0, 1]) {
      const army = this.armies[t];
      while (army.length && (this.armyCost(t) > this.budgetOf(t) || army.length > this.capOf(t))) this.removeEntry(t, army[army.length - 1]);
      if (!army.length) this.randomArmy(t, t, true);
    }
    for (const p of this.activePlayers()) { this.ps[p].ready = true; this.ps[p].modal = null; }
    this.forcedStart = true;
    this.helpOn = false;
    this.ui.setHelp(false);
    this.ui.toast("⏰ Time's up!", 2);
    this.save();
  }

  currentDef(p) {
    const ps = this.ps[p];
    const fl = this.factionList();
    ps.faction = clamp(ps.faction, 0, fl.length - 1);
    const list = unitsOfFaction(fl[ps.faction].id);
    ps.unit = clamp(ps.unit, 0, list.length - 1);
    return list[ps.unit];
  }

  ensureGhosts(p, def, n) {
    const ps = this.ps[p];
    const key = `${def.id}:${ps.team}`;
    if (ps.ghostId !== key) {
      for (const g of ps.ghosts) disposeVisual(g);
      ps.ghosts = [];
      ps.ghostId = key;
    }
    while (ps.ghosts.length < n) {
      const g = buildUnitVisual(def, ps.team, { skel: skelOf(def), ghost: true });
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
    const back = this.ps[p].team === 0 ? -1 : 1; // rows extend away from the enemy
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
    const items = [
      { label: 'Resume', key: 'resume' },
      { label: ps.ready ? 'Not ready' : this.solo ? 'Start battle' : 'Ready', key: 'ready' },
    ];
    if (this.canSwitch(p)) items.push({ label: `Build the ${TEAM_NAMES[1 - ps.team]} army`, key: 'switch' });
    items.push({ label: 'Random army', key: 'random' });
    items.push({ label: `Clear ${this.mode === 'campaign' ? 'my' : TEAM_NAMES[ps.team]} army…`, key: 'clear' });
    if (this.mode !== 'campaign') {
      items.push({ label: 'Map', value: MAPS[s.map].name, key: 'map', preview: mapImg(MAPS[s.map].id) });
      items.push({ label: 'Budget', value: money(BUDGETS[s[this.limKeys()[0]]]), key: 'budget' });
      items.push({ label: 'Unit limit', value: capText(CAPS[s[this.limKeys()[1]]]), key: 'cap' });
      if (this.mode === 'versus') items.push({ label: 'Blind setup', value: onOff(s.blind), key: 'blind' });
    }
    items.push({ label: 'Performance…', key: 'perf' });
    items.push({ label: 'Controls', key: 'help' });
    if (this.mode === 'campaign') items.push({ label: 'Level select', key: 'levels' });
    items.push({ label: 'Main menu', key: 'quit' });
    return items;
  }

  openSetupMenu(p) { this.ps[p].modal = { kind: 'menu', sel: 0 }; this.audio.play('click'); }
  openClearConfirm(p) {
    if (!this.armies[this.ps[p].team].length) { this.ui.toast(`${this.who(p)}: the army is already empty`, 1.4, p); return; }
    this.ps[p].modal = { kind: 'clear', sel: 0 };
    this.audio.play('click');
  }

  modalView(p) {
    const m = this.ps[p].modal;
    if (!m) return null;
    const t = this.ps[p].team;
    if (m.kind === 'clear') {
      const n = this.armies[t].length;
      return { title: `Clear ${TEAM_NAMES[t]} army?`, text: `Removes all ${n} unit${n === 1 ? '' : 's'} (${this.armyCost(t).toLocaleString('en-US')} gold). ${btn('X')} undo brings them back. <small>Tip: hold ${btn('View')} to clear without asking.</small>`, items: [{ label: 'No, keep them', key: 'no' }, { label: 'Yes, clear', key: 'yes', cls: 'danger' }], sel: m.sel };
    }
    if (m.kind === 'perf') return { title: 'PERFORMANCE', text: this.perfLine(), items: [...this.perfItems(), { label: 'Back', key: 'back' }], sel: m.sel };
    const title = this.mode === 'campaign' ? `${this.level.name.toUpperCase()}${this.solo ? '' : ` · P${p + 1}`}` : `${TEAM_NAMES[t].toUpperCase()} · MENU`;
    return { title, items: this.setupMenuItems(p), sel: m.sel };
  }

  updateModal(p) {
    const I = this.input, ps = this.ps[p], m = ps.modal;
    const view = this.modalView(p);
    const items = view.items;
    if (I.nav(p, 'down')) { m.sel = (m.sel + 1) % items.length; this.audio.play('click', null, 0.4); }
    if (I.nav(p, 'up')) { m.sel = (m.sel + items.length - 1) % items.length; this.audio.play('click', null, 0.4); }
    m.sel = clamp(m.sel, 0, items.length - 1);
    const it = items[m.sel];
    if (I.pressed(p, 'b') && m.kind === 'perf') { ps.modal = { kind: 'menu', sel: m.from || 0 }; I.swallow(); return; }
    if (I.pressed(p, 'b') || (I.pressed(p, 'start') && m.kind !== 'clear')) { ps.modal = null; I.swallow(); return; }
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
    if (m.kind === 'perf' && it.key === 'back') { ps.modal = { kind: 'menu', sel: m.from || 0 }; return; }
    switch (it.key) {
      case 'perf': ps.modal = { kind: 'perf', sel: 0, from: m.sel }; this.audio.play('click'); break;
      case 'resume': ps.modal = null; break;
      case 'ready': ps.modal = null; this.toggleReady(p); break;
      case 'switch': ps.modal = null; this.switchSide(p); break;
      case 'random': ps.modal = null; if (ps.ready) this.toggleReady(p); this.randomArmy(p); break;
      case 'clear': this.openClearConfirm(p); break;
      case 'help': ps.modal = null; this.helpOn = true; this.ui.setHelp(true); break;
      case 'levels': this.goLevels(); break;
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
      if (!this.solo) this.ui.toast(`${this.who(p)} set ${lbl}: <b>${it.value}</b>`, 1.6, 1 - p);
    }
  }

  toggleReady(p) {
    const ps = this.ps[p];
    if (!ps.ready) {
      const why = this.readyProblem(p);
      if (why) { this.ui.toast(`${this.solo ? '' : `${this.who(p)}: `}${why}`, 2, p); this.audio.play('remove', null, 0.4, 0.6); return; }
    } else if (this.forcedStart) { this.ui.toast("Time's up — no changes now!", 1.4, p); return; }
    ps.ready = !ps.ready;
    this.audio.play(ps.ready ? 'place' : 'remove', null, 0.8, ps.ready ? 1.4 : 0.8);
    if (ps.ready && !this.solo) this.ui.toast(`${this.who(p)} is ready!`, 1.4, 1 - p);
    this.input.rumble(p, 0.2, 0.4, 90);
  }

  setupHints(p) {
    const ps = this.ps[p];
    const view = this.canSwitch(p) ? `${btn('View')} switch side <small>(hold: clear)</small>` : `${btn('View')} <small>hold:</small> clear`;
    return [
      `${btn('A')} place <small>(hold: paint)</small> ${btn('B')} remove ${btn('X')} undo ${btn('Y')} ${this.solo ? 'start battle' : 'ready'}`,
      `${btn('LB')}${btn('RB')} faction &nbsp;${btn('LT')}${btn('RT')} unit &nbsp;${btn('dpad')}↑↓ brush &nbsp;${btn('L3')}+${btn('RS')} up/down &nbsp;${view} &nbsp;${btn('Start')} menu`,
    ];
  }

  updateSetupPlayer(p, dt) {
    const I = this.input, s = I.state(p), rig = this.rigs[p], ps = this.ps[p];
    const t = ps.team;
    const army = this.armies[t];
    const fl = this.factionList();
    let def = this.currentDef(p);
    const busy = !!ps.modal || this.helpOn;
    if (this.helpOn) {
      if (I.pressed(p, 'b') || I.pressed(p, 'a') || I.pressed(p, 'start')) { this.helpOn = false; this.ui.setHelp(false); I.swallow(); }
    } else if (ps.modal) {
      this.updateModal(p);
      if (this.state !== 'setup') return;
    } else {
      rig.update(s, dt, this.terrain, { speed: 13, minHeight: 1.5, planar: true, stickHeight: true, ...this.lookOpts });
      if (I.pressed(p, 'r3')) this.setupCam(p);
      // unit selection: LB/RB faction tabs (as in the Unit Creator and the level
      // select), LT/RT or D-pad left/right step through units, D-pad up/down the brush
      const nf = fl.length;
      const nIn = (f) => unitsOfFaction(fl[f].id).length;
      if (I.repeat(p, 'right') || I.repeat(p, 'rt')) { ps.unit++; if (ps.unit >= nIn(ps.faction)) { ps.unit = 0; ps.faction = (ps.faction + 1) % nf; } this.audio.play('click', null, 0.5, 1.2); }
      if (I.repeat(p, 'left') || I.repeat(p, 'lt')) { ps.unit--; if (ps.unit < 0) { ps.faction = (ps.faction + nf - 1) % nf; ps.unit = nIn(ps.faction) - 1; } this.audio.play('click', null, 0.5, 1.2); }
      if (I.repeat(p, 'rb')) { ps.faction = (ps.faction + 1) % nf; ps.unit = 0; this.audio.play('click', null, 0.5, 1); }
      if (I.repeat(p, 'lb')) { ps.faction = (ps.faction + nf - 1) % nf; ps.unit = 0; this.audio.play('click', null, 0.5, 1); }
      if (I.pressed(p, 'down')) { ps.brush = (ps.brush + 1) % BRUSHES.length; this.audio.play('click', null, 0.5, 1.4); }
      if (I.pressed(p, 'up')) { ps.brush = (ps.brush + BRUSHES.length - 1) % BRUSHES.length; this.audio.play('click', null, 0.5, 1.4); }
      def = this.currentDef(p);
    }
    const skel = skelOf(def);

    // cursor + brush ghosts
    const hit = busy || ps.ready ? null : rig.groundHit(this.terrain, 220);
    ps.cursor = hit;
    const used = this.armyCost(t);
    const budget = this.budgetOf(t), cap = this.capOf(t);
    let budgetLeft = budget - used, capLeft = cap - army.length;
    const { slots } = hit ? this.brushSlots(p, hit, skel) : { slots: [] };
    const ok = [];
    let why = '';
    for (let k = 0; k < slots.length; k++) {
      const sl = slots[k];
      sl.ok = false;
      let w = '';
      if (!this.inZone(t, sl.x, sl.z)) w = `Place units in the ${TEAM_NAMES[t]} zone`;
      else if (this.terrain.blocked(sl.x, sl.z, skel.radius)) w = "Can't place units in water or walls";
      else {
        let clash = false;
        for (const a of army) {
          const r = (skelOf(UNIT_BY_ID[a.type]).radius + skel.radius) * 0.95;
          if ((a.x - sl.x) ** 2 + (a.z - sl.z) ** 2 < r * r) { clash = true; break; }
        }
        if (clash) w = '';
        else if (def.cost > budgetLeft) w = 'Not enough gold';
        else if (capLeft <= 0) w = `Army is full (limit ${cap})`;
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
      g.root.userData.ghostMat.color.set(sl.ok ? TEAM_COLORS[t] : '#ff2222');
      g.root.userData.ghostMat.opacity = sl.ok ? 0.5 : 0.28;
      g.st.t += dt;
      poseVisual(g, sl.x, this.terrain.height(sl.x, sl.z), sl.z, t === 0 ? Math.PI / 2 : -Math.PI / 2, g.st);
    });
    // which unit B would remove
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
      rg.cursor.material.color.set(valid ? TEAM_COLORS[t] : '#ff4040');
    }
    rg.showRemove = !!hover;
    if (hover) {
      const r = skelOf(UNIT_BY_ID[hover.type]).radius * 1.6 + 0.15;
      rg.remove.position.set(hover.x, this.terrain.height(hover.x, hover.z) + 0.07, hover.z);
      rg.remove.scale.setScalar(r);
    }

    let clearing = 0;
    if (!ps.ready && !busy) {
      // place (hold to paint); one held stroke is one undo step
      // strokes only start with a fresh press (not an A still held from the previous screen)
      if (I.pressed(p, 'a')) { ps.stroke = null; ps.painting = true; }
      if (!I.down(p, 'a')) ps.painting = false;
      if (ps.painting && hit) {
        const spacing = skel.radius * 2.3 + 0.15;
        const far = !ps.last || Math.hypot(ps.last.x - hit.x, ps.last.z - hit.z) >= spacing;
        if (valid && (I.pressed(p, 'a') || far)) {
          if (!ps.stroke) { ps.stroke = { kind: 'add', team: t, entries: [] }; ps.undo.push(ps.stroke); }
          for (const sl of ok) {
            const a = { type: def.id, x: sl.x, z: sl.z };
            this.addEntry(t, a);
            ps.stroke.entries.push(a);
          }
          ps.last = { x: hit.x, z: hit.z };
          this.audio.play('place', null, 0.6, 0.9 + Math.random() * 0.2);
          this.save();
        } else if (I.pressed(p, 'a') && why) {
          this.ui.toast(`${this.who(p)}: ${why}`, 1.4, p);
          this.audio.play('remove', null, 0.3, 0.6);
        }
      } else ps.last = null;
      // remove (hold to keep erasing); one held stroke is one undo step
      if (I.pressed(p, 'b')) { ps.rstroke = null; ps.erasing = true; }
      if (!I.down(p, 'b')) ps.erasing = false;
      if (hover && ps.erasing && I.repeat(p, 'b', 0.25, 0.08)) {
        if (!ps.rstroke) { ps.rstroke = { kind: 'remove', team: t, entries: [] }; ps.undo.push(ps.rstroke); }
        this.removeEntry(t, hover);
        ps.rstroke.entries.push(hover);
        ps.hover = null;
        this.audio.play('remove', null, 0.6, 1);
        this.save();
      }
      if (I.repeat(p, 'x', 0.4, 0.12)) this.undo(p);
      // View: hold to clear this army; a tap switches side when building alone
      if (I.down(p, 'back')) {
        // real time, so a slow frame rate doesn't stretch the hold
        const now = performance.now();
        if (!ps.backT) ps.backAt = now;
        ps.backT = Math.max(1e-3, (now - ps.backAt) / 1000);
        if (!ps.cleared && ps.backT >= CLEAR_HOLD) { ps.cleared = true; this.clearArmy(p); }
        if (!ps.cleared && ps.backT > 0.12 && army.length) clearing = ps.backT / CLEAR_HOLD;
      } else {
        if (I.released(p, 'back') && !ps.cleared) {
          if (this.canSwitch(p)) this.switchSide(p);
          else this.ui.toast(`Hold ${btn('View')} to clear ${this.mode === 'campaign' ? 'your' : `the ${teamTag(t)}`} army`, 1.4, p);
        }
        ps.backT = 0;
        ps.cleared = false;
      }
      if (ps.undo.length > 60) ps.undo.splice(0, ps.undo.length - 60);
    } else { ps.backT = 0; ps.cleared = false; }
    if (!busy) {
      if (I.pressed(p, 'y')) this.toggleReady(p);
      if (I.pressed(p, 'start')) this.openSetupMenu(p);
      if (ps.ready && I.pressed(p, 'b')) this.toggleReady(p);
    }

    const others = this.activePlayers().filter((q) => q !== p);
    const waiting = others.filter((q) => !this.ps[q].ready);
    let status = '';
    if (clearing > 0) status = `Clearing ${teamTag(t)} army… <span class="hold"><i style="width:${Math.min(100, clearing * 100)}%"></i></span>`;
    else if (ps.ready) status = waiting.length ? `Waiting for ${waiting.map((q) => this.who(q)).join(', ')}… ${btn('Y')} not ready` : '';
    else if (ps.hover) status = `${btn('B')} remove ${UNIT_BY_ID[ps.hover.type].name}`;
    else if (hit && !valid && why) status = `<span class="bad">${why}</span>`;
    // roster: unit counts (and gold) in order of first placement
    const roster = (a) => {
      const m = new Map();
      for (const e of a) m.set(e.type, (m.get(e.type) || 0) + 1);
      return [...m].map(([id, n]) => ({ id, n, gold: n * (UNIT_BY_ID[id]?.cost || 0) }));
    };
    const ot = 1 - t;
    const enemy = this.armies[ot];
    let foeTag = TEAM_NAMES[ot], foeState = '';
    if (this.mode === 'versus' || (this.mode === 'sandbox' && !this.solo)) foeState = this.ps[1 - p].ready ? '<b class="ok">✔ READY</b>' : '<small class="busy">building…</small>';
    else if (this.mode === 'campaign') { foeTag += ' (enemy)'; foeState = others.length ? (this.ps[others[0]].ready ? `<b class="ok">P${others[0] + 1} ✔</b>` : `<small class="busy">P${others[0] + 1} building…</small>`) : ''; }
    this.ui.updateSetup(p, {
      pad: I.hasPad(p), team: t, coop: this.mode === 'campaign' && !this.solo, solo: this.solo,
      title: this.mode === 'campaign' ? this.level.name : '',
      def, factions: fl, faction: ps.faction, unit: ps.unit, used, budget, cap, count: army.length,
      ready: ps.ready, valid: valid || !hit, status, brush: BRUSHES[ps.brush].name,
      roster: roster(army),
      enemy: { name: foeTag, hidden: this.blindNow(), count: enemy.length, value: this.armyCost(ot), state: foeState, roster: this.solo ? roster(enemy) : null },
      modal: this.modalView(p), hints: this.setupHints(p),
    });
  }

  // ---------------------------------------------------------------- battle
  startBattle(now) {
    // a huge battle takes a moment to build: say so first, build it once that's drawn
    const n = this.armies[0].length + this.armies[1].length;
    if (!now && n >= 300) {
      if (!this.prepping) {
        this.prepping = `Preparing the battle: ${n} units…`;
        this.ui.show('pause', false);
        requestAnimationFrame(() => requestAnimationFrame(() => { this.prepping = null; this.startBattle(true); }));
      }
      return;
    }
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
    // the JJK voice lines and signature effects load only for a battle with JJK in it
    // (from setup already: addSetupVis)
    if (this.battle.units.some((u) => u.def.id.startsWith('jk_'))) this.audio.wantSamples('jjk');
    // reserves (summons made with the army, dormant until called) get their own visuals
    this.extraVis = [];
    for (let i = this.battleVis.length; i < this.battle.units.length; i++) {
      const u = this.battle.units[i];
      const v = buildUnitVisual(u.def, u.team, { skel: skelOf(u.def), share: true });
      v.root.visible = false;
      this.scene.add(v.root);
      this.battleVis.push(v);
      this.extraVis.push(v);
    }
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
    if (!this.audio.stinger('start')) this.audio.play('horn', null, 0.8, 1);
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
    for (const v of this.extraVis || []) disposeVisual(v);
    this.extraVis = [];
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
    else if (k === 'announce') { if (!this.muteEvents) this.ui.toast(`<span class="announce">${e[4]}</span>`, 2.6); } // packs: domains, secrets
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
    const b = this.battle, gone = this.settings.corpses ? b.time - CORPSE_SECONDS : -Infinity;
    b.units.forEach((u, i) => {
      const vis = this.battleVis[i];
      if (!vis) return;
      // Performance → Fallen units: a unit down for a while leaves the picture
      const hide = u.dormant || (!u.alive && u.diedAt < gone && !u.kind?.standing?.(u));
      vis.root.visible = !hide;
      if (hide) return;
      const r = u.rag;
      for (let j = 0; j < NPARTS; j++) {
        vis.parts[j].position.copy(r.pos[j]);
        vis.parts[j].quaternion.copy(r.quat[j]);
      }
      const ex = vis.extraParts || [];
      for (let j = 0; j < u.extras.length && j < ex.length; j++) {
        ex[j].group.position.copy(u.extras[j].pos);
        ex[j].group.quaternion.copy(u.extras[j].quat);
      }
      for (let j = 0; j < u.held.length; j++) { const h = u.held[j]; placeHeld(vis, j, h.body ? h.pos : null, h.quat); }
      setExpression(vis, u.expr);
      const w = u.def.weapon;
      // a thrown weapon leaves the hand (core throwers, and pack kinds that throw their
      // held item: the Mammoth rider's spear, the Harpooner's harpoon...)
      if (w.anim === 'throw' && w.proj) {
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
    // ease into and out of slow motion (TABS-style), but stop dead when freezing
    const goal = SPEEDS[this.speedIdx];
    if (goal === 0) this.timeScale = 0;
    else {
      this.timeScale = lerp(this.timeScale || 0.05, goal, damp(goal < this.timeScale ? 7 : 4, dt));
      if (Math.abs(this.timeScale - goal) < 0.01 * goal) this.timeScale = goal;
    }

    // simulate
    // Within a wall-clock budget (Performance → Under heavy load): a heavy battle
    // runs slower than real time instead of freezing the controls and the UI.
    if (this.timeScale > 0) {
      const want = Math.min(dt, 1 / 20) * this.timeScale;
      const n = Math.max(1, Math.ceil(want / (1 / 60) - 1e-6));
      const h = want / n, load = SIM_LOADS[this.settings.simLoad] || SIM_LOADS[1], P = this.perf;
      const t0 = performance.now();
      let steps = 0;
      if (P.due(t0)) {
        for (; steps < n; steps++) {
          if (steps && performance.now() - t0 + P.stepMs > load.ms) break;
          b.step(h);
          this.rec.capture(b);
          this.input.sample(); // don't lose a short button tap during a long frame
        }
      }
      P.ran((steps * h) / this.timeScale, steps, performance.now() - t0, load);
      this.syncLive(steps * h);
      this.fx.update(steps * h);
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
      let bUsed = false;
      if (rig.mode === 'cine') {
        const moved = Math.max(Math.abs(s.lx), Math.abs(s.ly), Math.abs(s.rx), Math.abs(s.ry)) > 0.5;
        if (moved || P('b')) { rig.release(); bUsed = true; this.ui.toast('Free camera', 0.8); }
        else if (P('rb') || P('lb')) rig.cine.next = 0; // next shot
      } else if (!replay && rig.mode === 'free' && P('b')) {
        // B on the free camera: let the cinematic director take over
        rig.startCine();
        bUsed = true;
        this.ui.toast('🎬 Cinematic camera', 1);
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
        if (P('b') && !bUsed && rig.mode !== 'cine') {
          if (rig.mode === 'possess' && rig.unit) rig.unit.control = null;
          if (rig.mode !== 'free') rig.release();
        }
      } else if (this.state === 'result' && P('b') && !bUsed && rig.mode !== 'free' && rig.mode !== 'cine') {
        if (rig.unit && rig.unit.control) rig.unit.control = null;
        rig.release();
      }
      if (rig.mode === 'possess') this.possessControl(v, rig, s, units);
      const slow = rig.mode === 'free' || rig.mode === 'follow' ? clamp((s.lt - 0.15) / 0.7, 0, 1) : 0;
      // possessing: LT aims (zooms in, finer look) with ranged units, blocks with the rest
      const aiming = rig.mode === 'possess' && s.lt > 0.3 && aims(rig.unit);
      rig.aimZoom = lerp(rig.aimZoom || 0, aiming ? 1 : 0, damp(10, dt));
      const look = this.lookOpts;
      if (rig.mode === 'possess') look.lookSpeed *= 1 - 0.55 * rig.aimZoom;
      rig.update(s, dt, this.terrain, { speed: 12, slow, units: list, ...look });
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
    // the crosshair point itself: pack kinds aim their shots / spells at it
    // (common.js aimPoint), siege crews lay their engine on it
    c.aimPt = (c.aimPt || new THREE.Vector3()).copy(tgt);
    const w = u.def.weapon, aimer = aims(u);
    rig.aimInfo = null;
    const dx = Math.hypot(tgt.x - cp.x, tgt.z - cp.z);
    if (aimer && w.speed) {
      const dy = tgt.y - (cp.y + 0.3 * (u.s || 1));
      const g = PROJ[w.proj]?.g ?? 9.81;
      let ang = g <= 0.01 ? Math.atan2(dy, dx) : ballisticAngle(dx, dy, w.speed, g, w.arc === 'high');
      const reach = ang !== null && !(w.range && dx > w.range * 1.5);
      if (ang === null) ang = Math.PI / 4;
      c.aimPitch = clamp(ang, -0.7, 1.45);
      rig.aimInfo = { dist: dx, ok: reach };
    } else {
      c.aimPitch = clamp(rig.pitch + 0.35, 0.05, 1.1);
      if (aimer && w.range) rig.aimInfo = { dist: dx, ok: dx <= w.range * 1.2 };
    }
    c.attack = s.rt > 0.4;
    c.block = !aimer && s.lt > 0.3;
    if (this.vPressed(v, 'a')) c.jump = true;
    if (rig.lastHp !== undefined && u.hp < rig.lastHp - 0.5) {
      const f = clamp((rig.lastHp - u.hp) / u.maxHp * 4, 0.15, 1);
      for (const p of this.viewPlayers(v)) this.input.rumble(p, f, f, 160);
    }
    rig.lastHp = u.hp;
  }

  hintFor(rig) {
    const replay = this.state === 'replay', live = this.state === 'battle';
    switch (rig.mode) {
      case 'possess':
        return `${btn('LS')} walk &nbsp; ${btn('RS')} look &nbsp; ${btn('RT')} attack &nbsp; ${btn('LT')} ${aims(rig.unit) ? 'aim' : 'block'} &nbsp; ${btn('A')} jump &nbsp; ${btn('Y')} slow-mo &nbsp; ${btn('B')} let go`;
      case 'follow':
        return `${btn('RS')} orbit &nbsp; ${btn('LS')} zoom &nbsp; ${btn('LB')}${btn('RB')} prev / next unit${live ? ` &nbsp; ${btn('X')} take control` : ''} &nbsp; ${btn('B')} free cam`;
      case 'cine':
        return `🎬 Cinematic camera &nbsp; ${btn('RB')} next shot${replay ? ` &nbsp; ${btn('X')} follow` : ` &nbsp; ${btn('A')} follow`} &nbsp; move a stick or ${btn('B')} to take over`;
      default:
        if (this.state === 'result') return `${btn('LS')} fly ${btn('RS')} look ${btn('LB')}${btn('RB')} down/up &nbsp; ${btn('B')} cinematic &nbsp; ${btn('dpad')}↑↓ choose &nbsp; ${btn('A')} select`;
        return `${btn('A')} follow &nbsp; ${btn('X')} take control &nbsp; ${btn('B')} cinematic &nbsp; ${btn('Y')} slow-mo &nbsp; ${btn('dpad')}↑↓ speed ←→ zoom &nbsp; ${btn('LT')} smooth cam &nbsp; ${btn('View')} ${this.split ? 'shared' : 'split'} &nbsp; ${btn('R3')} HUD &nbsp; ${btn('Start')} pause`;
    }
  }

  // stats card for the followed / possessed unit
  unitCard(u) {
    if (!u || !u.def) return null;
    const live = this.state !== 'replay';
    return {
      id: u.def.id, team: u.team, name: u.def.name, hp: Math.max(0, u.hp), maxHp: u.maxHp || u.def.hp, alive: u.alive !== false,
      kills: live ? u.kills : undefined, dmg: live ? u.damageDealt : undefined, cost: u.def.cost,
      buff: live && u.buff > 0,
    };
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
      let reticle = '', card = null;
      if (rig.mode === 'follow' && rig.unit) {
        const u = rig.unit;
        label += `Following ${teamTag(u.team)} ${u.def.name}`;
        card = this.unitCard(u);
      } else if (rig.mode === 'possess' && rig.unit) {
        const u = rig.unit;
        label += `🎮 Controlling ${teamTag(u.team)} ${u.def.name}`;
        if (rig.aimInfo) label += ` <small class="${rig.aimInfo.ok ? '' : 'bad'}">${Math.round(rig.aimInfo.dist)} m${rig.aimInfo.ok ? '' : ' · out of range'}</small>`;
        reticle = 'aim';
        card = this.unitCard(u);
      } else if (rig.mode === 'cine') {
        label += '🎬 Cinematic camera';
        if (rig.cine?.target?.def) card = this.unitCard(rig.cine.target);
      } else { label += 'Free camera'; if (this.state !== 'result') reticle = 'dot'; }
      if (Math.abs(rig.zoom) > 0.5) label += ` <small>· FOV ${Math.round(rig.fov)}°</small>`;
      views[v] = { label, reticle, card, hint: this.hintFor(rig) };
    }
    const sc = this.state === 'replay' ? 1 : SPEEDS[this.speedIdx];
    const scaleText = this.state === 'result' ? '' : sc === 0 ? 'TIME FROZEN <small>✥↑ resume</small>' : sc !== 1 ? `${sc < 1 ? 'SLOW MOTION' : 'FAST'} ${sc}×` : '';
    let banner = '';
    if (this.mode === 'campaign' && this.level) banner = `${this.level.name}`;
    else if (this.mode === 'versus' && this.match && this.match.bestOf > 1) banner = `Round ${b.scored ? this.match.lastRound : this.match.round} · <b style="color:${TEAM_COLORS[0]}">${this.match.wins[0]}</b> – <b style="color:${TEAM_COLORS[1]}">${this.match.wins[1]}</b> · best of ${this.match.bestOf}`;
    return {
      counts, start: b.startCounts, scaleText, banner,
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
    const watch = [
      { label: 'Watch replay', key: 'replay' },
      { label: 'Final moments (slow-mo)', key: 'final' },
    ];
    if (this.mode === 'campaign' && this.level) {
      const r = this.levelResult;
      return [
        ...(r && r.next ? [{ label: `Next level: ${r.next.name}`, key: 'next' }] : []),
        ...watch,
        { label: r && r.won ? 'Play again' : 'Retry', key: 'rematch' },
        { label: 'Edit army', key: 'edit' },
        { label: 'Level select', key: 'levels' },
        { label: 'Main menu', key: 'title' },
      ];
    }
    const m = this.match;
    if (this.mode === 'versus' && m && m.bestOf > 1) {
      return [
        m.winner >= 0 ? { label: 'New match', key: 'newmatch' } : { label: `Next round (${m.round})`, key: 'edit' },
        ...watch,
        { label: 'Main menu', key: 'title' },
      ];
    }
    return [
      ...watch,
      { label: 'Rematch', key: 'rematch' },
      { label: 'Edit armies', key: 'edit' },
      { label: 'Main menu', key: 'title' },
    ];
  }

  // versus: count the round (once per battle)
  scoreRound(w) {
    const m = this.match;
    if (!m) return null;
    if (w >= 0) {
      m.wins[w]++;
      if (this.settings.bonus) { m.bonus[1 - w]++; m.bonus[w] = 0; }
      if (m.wins[w] >= Math.floor(m.bestOf / 2) + 1) m.winner = w;
    }
    const round = m.round;
    m.lastRound = round;
    if (m.winner < 0) m.round++;
    return { round, wins: m.wins.slice(), bestOf: m.bestOf, winner: m.winner, bonus: this.settings.bonus && w >= 0 && m.winner < 0 ? 1 - w : -1 };
  }

  showResult() {
    this.state = 'result';
    const b = this.battle;
    this.resultSel = 0;
    let match = null, level = null;
    if (!b.scored) {
      b.scored = true;
      if (this.mode === 'campaign' && this.level) this.levelResult = level = this.scoreLevel(b.winner === 0);
      else if (this.mode === 'versus') match = this.scoreRound(b.winner);
    }
    this.ui.only('battle', 'result');
    const names = this.mode === 'campaign' ? ['You', 'Enemy'] : this.mode === 'sandbox' && this.solo ? [...TEAM_NAMES] : null;
    this.ui.showResult({ winner: b.winner, stats: b.stats(), duration: this.overTime || b.time, match: match && match.bestOf > 1 ? match : null, level, names, coop: this.mode === 'campaign' && !this.solo });
    this.ui.updateResultMenu(this.resultItems(), this.resultSel);
    this.audio.startMusic('setup');
    // the recorded stingers: defeat when the campaign player loses, or nobody wins
    const lost = b.winner < 0 || (this.mode === 'campaign' && b.winner !== 0);
    if (!this.audio.stinger(lost ? 'defeat' : 'victory')) this.audio.play('fanfare', null, 0.9, 1);
    for (const r of this.rigs) if (r.mode === 'possess' && r.unit) { r.unit.control = null; r.mode = 'follow'; }
    for (let p = 0; p < 2; p++) this.input.rumble(p, 0.3, 0.3, 300);
    if (SPEEDS[this.speedIdx] === 0) this.speedIdx = NORMAL;
    if (level && level.unlocked) this.ui.toast(`🔓 ${level.unlocked}`, 3);
    this.input.swallow();
  }

  updateResultMenu() {
    const I = this.input;
    const items = this.resultItems();
    this.resultSel = clamp(this.resultSel, 0, items.length - 1);
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
          case 'newmatch': this.newMatch(); this.goSetup(); return;
          case 'next': this.enterLevel(this.levelResult.next); return;
          case 'levels': this.goLevels(); return;
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
    // under heavy load the menu opens on the Performance page
    this.pausePage = this.perf.warn && !sub ? 'perf' : 'main';
    this.ui.show('pause', true);
    this.input.swallow();
  }

  pauseItems(page = this.pausePage) {
    if (page !== this.pausePage) { const p = this.pausePage; this.pausePage = page; const r = this.pauseItems(); this.pausePage = p; return r; }
    const from = this.pauseFrom;
    const cine = this.rigs[0].mode === 'cine';
    const items = [{ label: 'Resume', key: 'resume' }];
    if (this.pausePage === 'perf') {
      items.push(...this.perfItems(), { label: 'More options…', key: 'main' });
      for (const it of this.pauseItems('main')) if (['edit', 'levels', 'title'].includes(it.key)) items.push(it);
      return items;
    }
    items.push({ label: 'Performance…', key: 'perf' });
    items.push({ label: 'Camera', value: cine ? 'Cinematic' : 'Free', key: 'cine' });
    items.push({ label: 'Screen', value: this.split ? 'Split' : 'Shared', key: 'split' });
    items.push({ label: 'HUD', value: ['Full', 'No tips', 'Hidden (photo)'][this.hudMode], key: 'hud' });
    if (from === 'battle') items.push({ label: 'Time', value: SPEEDS[this.speedIdx] === 0 ? 'Frozen' : `${SPEEDS[this.speedIdx]}×`, key: 'speed' });
    if (from === 'replay') items.push({ label: 'Exit replay', key: 'exitreplay' });
    const m = this.mode === 'versus' && this.match && this.match.bestOf > 1 ? this.match : null;
    if (from === 'battle') items.push({ label: m ? 'Restart round' : 'Restart battle', key: 'rematch' });
    else if (!m) items.push({ label: this.mode === 'campaign' ? 'Retry' : 'Rematch', key: 'rematch' });
    if (!m || from === 'battle' || m.winner < 0) items.push({ label: this.mode === 'campaign' ? 'Edit army' : m && from !== 'battle' ? 'Next round' : 'Edit armies', key: 'edit' });
    if (this.mode === 'campaign') items.push({ label: 'Level select', key: 'levels' });
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
      if (I.pressed(p, 'b') && this.pausePage === 'perf' && !this.perf.warn) { this.pausePage = 'main'; this.pauseSel = 1; items = this.pauseItems(); I.swallow(); this.audio.play('click', null, 0.4); continue; }
      if (I.pressed(p, 'b') || I.pressed(p, 'start')) { this.closePause(); return; }
      let d = 0;
      if (I.nav(p, 'right')) d = 1;
      if (I.nav(p, 'left')) d = -1;
      if ((d || I.pressed(p, 'a')) && it.value !== undefined) {
        this.pauseAdjust(it.key, d || 1);
        items = this.pauseItems();
        continue;
      }
      if (I.pressed(p, 'a') && (it.key === 'perf' || it.key === 'main')) {
        this.pausePage = it.key;
        this.pauseSel = it.key === 'main' ? 1 : 0;
        items = this.pauseItems();
        I.swallow();
        this.audio.play('click', null, 0.5);
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
          case 'levels': this.goLevels(); break;
          case 'title': this.goTitle(); break;
        }
        return;
      }
    }
    this.pauseSel = clamp(this.pauseSel, 0, items.length - 1);
    const perf = this.pausePage === 'perf';
    this.ui.updatePause(perf ? 'PERFORMANCE' : 'PAUSED', items, this.pauseSel, perf ? `${this.pauseSub ? this.pauseSub + '<br>' : ''}${this.perfLine()}` : this.pauseSub);
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
      default: this.adjustSetting(key, d);
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
      vis, team: this.rec.units[i].team, def: UNIT_BY_ID[this.rec.units[i].type], def0: UNIT_BY_ID[this.rec.units[i].type], s: vis.skel.scale,
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
        vis.root.visible = !(f & 128) && (!this.settings.corpses || px.alive || P.fallenFor(i) <= CORPSE_SECONDS);
        // a raised zombie fights for the side that raised it from then on
        px.team = f & 32 ? 1 : 0;
        px.def = f & 64 ? px.zdef || (px.zdef = { ...px.def0, name: 'Zombie ' + px.def0.name }) : px.def0;
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
