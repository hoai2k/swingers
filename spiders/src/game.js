// The Game: owns the canvas, the session's players, the current board and
// everything living on it, and runs the current scene.
//
// Scenes: 'boot' (loading bar) -> 'title' (start screen) -> 'lobby' (join +
// islands that pick a mode) -> 'match' (a Mode: VsMode / SurvivalMode) ->
// back to the lobby. A scene/mode object implements
//   start(), update(dt), draw(ctx) [world space, after entities],
//   drawUI(ctx) [screen space, 1920x1080], end()
// and optional onSpiderKilled(sp, info), onEnemyKilled(e, info).
//
// --- API for weapons, enemies and modes -------------------------------------
//   game.world, game.board, game.fx, game.time, game.input
//   game.players          session players [{slot, inputId, castIndex, color, score, ...}]
//   game.spiders          spiders on the board (alive or dead)
//   game.enemies          survival enemies (objects with x,y,r,vx,vy,alive,team,
//                         hp, update(dt), draw(ctx), hurt(info), impulse(ix,iy))
//   game.projectiles, game.pickups
//   game.actors()                         live spiders + enemies
//   game.actorsOnSegment(ax,ay,bx,by,pad,exclude) -> [{actor, t}] sorted by t
//   game.actorsInRadius(x,y,r,exclude)    -> [actor]
//   game.damage(target, info)             -> true if it landed. info: {amount, from,
//                         cause, x, y, ix, iy, melee, bonk}. Spiders die from any
//                         real hit (a shield absorbs one); bonks stun + knock.
//   game.canHurt(from, target)            team / friendly-fire rule
//   game.explode(x, y, {radius, owner, force, damage})
//   game.addProjectile(p), game.addEnemy(e)
//   game.registerBlade(seg)               plasma blades this frame (deflect/clash)
//   game.spawnPickup(weapon, x, y, vx, vy), game.createWeapon(id)
//   game.breakSolid(solid, x, y)          shatter glass
//   game.hitStop(s), game.slowmo(scale, s)

import { Input, NEUTRAL } from './input.js';
import { FX } from './fx.js';
import { sfx } from './audio.js';
import { Music } from './music.js';
import { settings, onSettingsChange } from './settings.js';
import { Spider } from './spider.js';
import { PLAYER_COLORS, defaultCastFor, CAST, castAt } from './cast.js';
import { Pickup, createWeapon, WEAPONS } from './weapons.js';
import { Board, W, H } from './board.js';
import { segCircle, clamp, rand, TAU, FONT } from './util.js';
import { loadProgress } from './preload.js';

export const MAX_PLAYERS = 8;
const CAM_MAX = 1.45;        // closest the camera eases in

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.input.attach(window, canvas);
    this.input.toWorld = (cx, cy) => this.screenToWorld(cx, cy);
    this.input.mouseAimOrigin = (id) => { const p = this.players.find((q) => q.inputId === id); return p && p.spider && p.spider.alive ? p.spider : null; };
    this.fx = new FX();
    this.music = new Music();
    this.players = [];
    this.spiders = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.blades = [];
    this.nextBlades = [];
    this.board = null;
    this.world = null;
    this.scene = null;
    this.scenes = {};          // name -> factory(game, opts) (registered in main.js)
    this.time = 0;
    this.realTime = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.stopT = 0;
    this.paused = false;
    this.view = { s: 1, ox: 0, oy: 0, cw: 0, ch: 0, dpr: 1 };
    this.cam = { z: 1, cx: W / 2, cy: H / 2, x0: 0, y0: 0 };
    this.acc = 0;
    this.mods = {};            // match modifiers in effect (modifiers.js): boomMul, bladeExtra, ...
    this.applySettings();
    onSettingsChange(() => this.applySettings());
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.setAway(document.hidden || !document.hasFocus()));
    window.addEventListener('blur', () => this.setAway(true));
    window.addEventListener('focus', () => this.setAway(document.hidden));
    this.resize();
  }

  applySettings() {
    sfx.setEnabled(settings.sound);
    sfx.setVolume(settings.sfxVolume);
    this.music.setEnabled(settings.sound && settings.music);
    this.music.setVolume(settings.musicVolume);
    this.fx.shakeEnabled = settings.screenShake;
  }

  setAway(a) { sfx.setAway(a); this.music.setAway(a); }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = window.innerWidth, ch = window.innerHeight;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    const s = Math.min(cw / W, ch / H);
    this.view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2, cw, ch, dpr };
  }

  screenToWorld(cx, cy) {
    const v = this.view, c = this.cam;
    return { x: ((cx - v.ox) / v.s) / c.z + c.x0, y: ((cy - v.oy) / v.s) / c.z + c.y0 };
  }

  // world point -> UI (arena-design) space, through the camera
  toUI(x, y) { const c = this.cam; return { x: (x - c.x0) * c.z, y: (y - c.y0) * c.z }; }
  // a stand-in for a body at its on-screen spot/size (name tags, ammo bars)
  uiProxy(o) { const c = this.cam; const p = Object.create(o); p.x = (o.x - c.x0) * c.z; p.y = (o.y - c.y0) * c.z; p.r = o.r * c.z; return p; }

  // Camera: shows the whole arena, and eases in (up to CAM_MAX) when the
  // fighters are bunched up, always keeping the view inside the arena. The
  // lobby and menus keep the full view.
  updateCamera(dt, snap = false) {
    const c = this.cam;
    let tz = 1, tx = W / 2, ty = H / 2;
    const dyn = this.board && this.scene && this.scene.dynamicCamera;
    const pts = dyn ? this.spiders.filter((s) => s.alive).map((s) => [s.x, s.y]) : [];
    if (dyn && this.scene.cameraExtra) pts.push(...this.scene.cameraExtra());
    if (pts.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const pad = 380;
      const bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
      tz = clamp(Math.min(W / bw, H / bh), 1, CAM_MAX);
      tx = (x0 + x1) / 2; ty = (y0 + y1) / 2;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.2);
    c.z += (tz - c.z) * k;
    c.cx += (tx - c.cx) * k; c.cy += (ty - c.cy) * k;
    const vw = W / c.z, vh = H / c.z;
    c.x0 = clamp(c.cx - vw / 2, 0, W - vw);
    c.y0 = clamp(c.cy - vh / 2, 0, H - vh);
  }

  // ---- scenes ---------------------------------------------------------------
  go(name, opts = {}) {
    if (this.scene && this.scene.end) this.scene.end();
    const make = this.scenes[name];
    this.scene = make(this, opts);
    this.sceneName = name;
    this.timeScale = 1; this.slowT = 0; this.stopT = 0; this.paused = false;
    if (this.scene.start) this.scene.start();
  }

  // ---- board & entities -------------------------------------------------------
  loadBoard(def) {
    this.board = new Board(def);
    this.cam.z = 1; this.cam.cx = W / 2; this.cam.cy = H / 2; this.cam.x0 = 0; this.cam.y0 = 0;
    this.world = this.board.world;
    this.spiders = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.blades = []; this.nextBlades = [];
    this.fx.clear();
    this.corpses = [];
    this.mods = {};            // a mode re-applies its modifiers after loading
    for (const p of this.players) p.spider = null;
    return this.board;
  }

  // players --------------------------------------------------------------------
  addPlayer(inputId) {
    if (this.players.length >= MAX_PLAYERS || this.players.some((p) => p.inputId === inputId)) return null;
    const used = new Set(this.players.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const usedCast = new Set(this.players.map((p) => p.castIndex));
    let castIndex = defaultCastFor(slot);
    while (usedCast.has(castIndex)) castIndex = (castIndex + 1) % CAST.length;
    const p = { slot, inputId, castIndex, color: PLAYER_COLORS[slot], score: 0, wins: 0, kills: 0, deaths: 0, spider: null, ready: false };
    this.players.push(p);
    this.players.sort((a, b) => a.slot - b.slot);
    sfx.join();
    return p;
  }

  removePlayer(p) {
    if (p.spider) { p.spider.alive = false; if (p.spider.weapon) p.spider.dropWeapon(); this.spiders = this.spiders.filter((s) => s !== p.spider); }
    this.players = this.players.filter((q) => q !== p);
    sfx.leave();
  }

  cycleCast(p, dir) {
    const taken = new Set(this.players.filter((q) => q !== p).map((q) => q.castIndex));
    let i = p.castIndex;
    for (let k = 0; k < CAST.length; k++) {
      i = (i + dir + CAST.length) % CAST.length;
      if (!taken.has(i)) break;
    }
    p.castIndex = i;
    if (p.spider) { p.spider.castIndex = i; p.spider.name = castAt(i).name; p.spider.flash = 1; }
    sfx.ui();
  }

  spawnSpider(p, x, y, { invuln = 1.2 } = {}) {
    const sp = new Spider(this, { slot: p.slot, castIndex: p.castIndex, color: p.color, inputId: p.inputId, team: this.teamFor(p) });
    sp.player = p;
    sp.place(x, y);
    sp.invuln = invuln;
    p.spider = sp;
    this.spiders.push(sp);
    this.fx.ring(x, y, 60, p.color.main, 0.4, 5);
    this.fx.burst(x, y, { n: 14, speed: 300, color: p.color.main, life: 0.4 });
    sfx.spawnIn();
    return sp;
  }

  teamFor(p) { return this.scene && this.scene.teamFor ? this.scene.teamFor(p) : 'p' + p.slot; }

  inputFor(sp) {
    if (!sp.inputId) return sp.ai ? sp.ai(sp) : NEUTRAL;
    return this.input.get(sp.inputId) || NEUTRAL;
  }

  // weapons & pickups ----------------------------------------------------------
  createWeapon(id) { return createWeapon(id, this); }

  spawnPickup(weapon, x, y, vx = 0, vy = 0, { from = null } = {}) {
    const p = new Pickup(this, weapon, x, y, vx, vy);
    p.from = from;
    this.pickups.push(p);
    return p;
  }

  pickupNear(x, y, r, sp, includeFromSelf = false) {
    let best = null, bd = r;
    for (const p of this.pickups) {
      if (!p.canTake) continue;
      if (!includeFromSelf && p.from === sp && p.age < 0.6) continue;
      if (p.thrower === sp && p.age < 0.3) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  takePickup(sp, p) {
    p.removed = true;
    const w = p.weapon;
    w.x = p.x; w.y = p.y;          // it eases from here into the spider's grip
    sp.giveWeapon(w);
    w.angle = sp.aimAngle;
    sfx.pickup();
    this.fx.text(sp.x, sp.y - 34, w.label, w.color, 22, 0.9);
    if (this.scene && this.scene.onPickup) this.scene.onPickup(sp, w);
  }

  // web targets: pickups, enemies, other spiders
  webHitTest(ax, ay, bx, by, self) {
    let best = null;
    for (const p of this.pickups) {
      if (!p.canTake || p.stuck) continue;
      const t = segCircle(ax, ay, bx, by, p.x, p.y, p.r + 8);
      if (t >= 0 && (!best || t < best.t)) best = { t, pickup: p };
    }
    for (const a of this.actors()) {
      if (a === self) continue;
      const t = segCircle(ax, ay, bx, by, a.x, a.y, a.r);
      if (t >= 0 && (!best || t < best.t)) best = { t, body: a };
    }
    return best;
  }

  // actors & damage -------------------------------------------------------------
  actors() {
    const out = [];
    for (const s of this.spiders) if (s.alive) out.push(s);
    for (const e of this.enemies) if (e.alive) out.push(e);
    return out;
  }

  actorsOnSegment(ax, ay, bx, by, pad = 0, exclude = null) {
    const out = [];
    for (const a of this.actors()) {
      if (a === exclude) continue;
      const t = segCircle(ax, ay, bx, by, a.x, a.y, a.r + pad);
      if (t >= 0) out.push({ actor: a, t });
    }
    return out.sort((p, q) => p.t - q.t);
  }

  actorsInRadius(x, y, r, exclude = null) {
    return this.actors().filter((a) => a !== exclude && Math.hypot(a.x - x, a.y - y) < r + a.r);
  }

  canHurt(from, target) {
    if (!from || from === target) return from !== target;
    if (from.team === target.team) {
      if (target.kind === 'spider' && from.kind === 'spider') return this.scene && this.scene.friendlyFire !== undefined ? this.scene.friendlyFire : false;
      return false;
    }
    return true;
  }

  damage(target, info = {}) {
    if (!target || !target.alive) return false;
    const from = info.from || null;
    if (from && from !== target && !this.canHurt(from, target) && !info.selfOk) return false;
    if (from === target && !info.selfOk) return false;
    if (target.kind === 'spider') {
      if (target.invuln > 0) return false;
      if (info.ix || info.iy) target.impulse(info.ix || 0, info.iy || 0, true);
      if (info.bonk) {
        target.stun = Math.max(target.stun, 0.45);
        target.flash = 1;
        sfx.hurt();
        return true;
      }
      if (target.shield > 0) {
        target.shield--;
        target.invuln = 0.4;
        target.flash = 1;
        this.fx.ring(target.x, target.y, 40, '#7fe8ff', 0.3, 5);
        sfx.deflect();
        return true;
      }
      this.killSpider(target, info);
      return true;
    }
    if (target.hurt) return target.hurt(info) !== false;
    return false;
  }

  killSpider(sp, info = {}) {
    if (!sp.alive) return;
    sp.alive = false;
    sp.deathInfo = info;
    const c = castAt(sp.castIndex);
    // drop whatever it held
    if (sp.weapon) { const w = sp.weapon; sp.dropWeapon((info.ix || 0) * 0.4, -300); }
    sp.web = null;
    if (sp.recallable) { const r = sp.recallable; if (r.pickup) r.toLoose(r.pickup); }
    this.fx.splat(sp.x, sp.y, c.color, 26, 600);
    this.fx.burst(sp.x, sp.y, { n: 20, speed: 700, color: sp.color.main, life: 0.5 });
    this.fx.ring(sp.x, sp.y, 70, '#fff', 0.25, 6);
    this.fx.shake(10);
    this.fx.flash(sp.color.main, 0.15);
    // ragdoll: the body and its legs tumble away
    this.corpses.push(new Corpse(this, sp, info));
    this.input.rumble(sp.inputId, 1, 1, 260);
    sfx.kill();
    this.hitStop(0.06);
    const killer = info.from && info.from.kind === 'spider' ? info.from : null;
    if (killer && killer !== sp) { killer.kills++; if (killer.player) killer.player.kills++; }
    if (sp.player) sp.player.deaths++;
    if (this.scene && this.scene.onSpiderKilled) this.scene.onSpiderKilled(sp, info);
  }

  explode(x, y, { radius = 120, owner = null, force = 900, damage = 3, selfOk = true, color } = {}) {
    radius *= (this.mods && this.mods.boomMul) || 1;
    if (owner && owner.blastMul) radius *= owner.blastMul;   // survival perk (Big Bang)
    this.fx.explosion(x, y, radius, color);
    sfx.boom(radius / 120);
    for (const a of this.actors()) {
      const dx = a.x - x, dy = a.y - y, d = Math.hypot(dx, dy) || 1;
      if (d > radius + a.r) continue;
      // terrain shields the blast
      const block = this.world.segment(x, y, a.x, a.y);
      if (block && block.t < d - a.r - 4) continue;
      const k = 1 - Math.min(1, d / (radius + a.r));
      const ix = dx / d * force * (0.4 + k), iy = dy / d * force * (0.4 + k) - 150;
      if (d < radius * 0.85 + a.r) this.damage(a, { amount: damage, from: owner, cause: 'explosion', x, y, ix, iy, selfOk });
      else if (a.impulse) a.impulse(ix, iy, true);
    }
    for (const p of this.pickups) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < radius * 1.5 && !p.stuck) { p.vx += dx / d * force * 0.8; p.vy += dy / d * force * 0.8 - 200; }
    }
    for (const s of this.world.solids) {
      if (s.mat !== 'glass' || s.broken) continue;
      const n = s.nearest(x, y);
      if (n.inside || n.d < radius * 0.8) this.breakSolid(s, n.x, n.y);
    }
    // webs snap in the blast
    for (const sp of this.spiders) {
      if (sp.web && sp.web.state === 'stuck') { const a = sp.webAnchor(); if (Math.hypot(a.x - x, a.y - y) < radius) sp.web = null; }
    }
  }

  breakSolid(s, x, y) {
    if (s.broken) return;
    s.broken = true;
    this.board.dirty = true;
    const bb = s.bb;
    for (let i = 0; i < 26; i++) {
      this.fx.add({ kind: 'shard', x: rand(bb.x0, bb.x1), y: rand(bb.y0, bb.y1), vx: rand(-300, 300), vy: rand(-400, 100), color: 'rgba(190,240,255,0.85)', size: rand(3, 9), life: rand(0.6, 1.2), g: 1600, drag: 0.5, rot: rand(0, TAU), vr: rand(-10, 10) });
    }
    sfx.shatter();
    // things resting on it fall; webs on it drop
    for (const sp of this.spiders) { if (sp.ground && sp.ground.solid === s) sp.ground = null; }
    if (s.def.respawn) setTimeout(() => { s.broken = false; this.board.dirty = true; }, s.def.respawn * 1000);
  }

  addProjectile(p) { this.projectiles.push(p); return p; }
  addEnemy(e) { this.enemies.push(e); return e; }
  registerBlade(seg) { this.nextBlades.push(seg); }
  hitStop(s) { this.stopT = Math.max(this.stopT, s); }
  slowmo(scale, s) { this.timeScale = scale; this.slowT = s; }

  // ---- main loop -----------------------------------------------------------------
  frame(dtReal) {
    dtReal = Math.min(dtReal, 0.1);
    this.realTime += dtReal;
    this.input.poll();
    if (this.input.anyActivity) { sfx.ensure(); this.music.unlock(); }
    if (this.slowT > 0) { this.slowT -= dtReal; if (this.slowT <= 0) this.timeScale = 1; }
    const fixed = 1 / 60;
    this.acc += dtReal;
    let steps = 0;
    while (this.acc >= fixed && steps < 4) {
      this.acc -= fixed;
      steps++;
      if (this.stopT > 0) { this.stopT -= fixed; continue; }
      this.step(fixed);
    }
    if (steps === 4) this.acc = 0;
    this.render();
  }

  // advance the simulation (also the headless test hook)
  step(dt) {
    this.updateCamera(dt);
    const sdt = dt * this.timeScale;
    if (this.overlay) this.overlay.update(dt);   // pause menu / DOM menus / pad notices (pause.js)
    if (this.scene && this.scene.preUpdate) this.scene.preUpdate(dt);
    if (this.paused) { if (this.scene && this.scene.pausedUpdate) this.scene.pausedUpdate(dt); return; }
    this.time += sdt;
    this.fx.update(sdt);
    if (this.board) {
      this.board.update(sdt, this);
      this.blades = this.nextBlades;
      this.nextBlades = [];
      for (const sp of this.spiders) if (sp.alive) sp.update(sdt, this.inputFor(sp));
      for (const e of this.enemies) if (e.alive) e.update(sdt);
      this.enemies = this.enemies.filter((e) => e.alive || (e.lingering && e.lingering(sdt)));
      for (const p of this.pickups) p.update(sdt);
      this.pickups = this.pickups.filter((p) => !p.removed);
      this.projectiles = this.projectiles.filter((p) => p.update(sdt) !== false);
      this.deflectProjectiles();
      for (const c of this.corpses) c.update(sdt);
      this.corpses = this.corpses.filter((c) => c.t < c.life);
    }
    if (this.scene && this.scene.update) this.scene.update(sdt, dt);
  }

  // blades bat back reflectable projectiles that crossed them this step
  deflectProjectiles() {
    const blades = this.nextBlades.length ? this.nextBlades : this.blades;
    if (!blades.length) return;
    for (const p of this.projectiles) {
      if (!p.reflectable || p.prevX === undefined) continue;
      for (const b of blades) {
        if (b.owner === p.owner) continue;
        const px = p.prevX, py = p.prevY;
        const hit = segSegDist(px, py, p.x, p.y, b.x1, b.y1, b.x2, b.y2) < (p.r || 3) + 4;
        if (!hit) continue;
        // send it the way the blade's owner is aiming (or straight back)
        const o = b.owner;
        let dx = o && o.aim ? o.aim.x : -p.vx, dy = o && o.aim ? o.aim.y : -p.vy;
        const m = Math.hypot(dx, dy) || 1;
        p.deflect(b, dx / m, dy / m);
        break;
      }
    }
  }

  // ---- drawing ----------------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    const v = this.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, v.cw, v.ch);
    ctx.save();
    ctx.translate(v.ox + this.fx.shakeX * v.s, v.oy + this.fx.shakeY * v.s);
    ctx.scale(v.s, v.s);
    ctx.save();
    ctx.beginPath(); ctx.rect(-400, -400, W + 800, H + 800); ctx.clip();
    const c = this.cam;
    ctx.scale(c.z, c.z);
    ctx.translate(-c.x0, -c.y0);
    if (this.board) this.drawWorld(ctx);
    ctx.restore();
    if (this.scene && this.scene.drawUI) this.scene.drawUI(ctx);
    if (this.overlay) this.overlay.drawUI(ctx);
    if (this.fx.flashA > 0) {
      ctx.globalAlpha = this.fx.flashA * 0.5;
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // letterbox bars hide anything drawn outside the arena
    ctx.fillStyle = '#05060d';
    if (v.ox > 0) { ctx.fillRect(0, 0, v.ox, v.ch); ctx.fillRect(v.cw - v.ox, 0, v.ox, v.ch); }
    if (v.oy > 0) { ctx.fillRect(0, 0, v.cw, v.oy); ctx.fillRect(0, v.ch - v.oy, v.cw, v.oy); }
    if (this.scene && this.scene.drawOverlay) this.scene.drawOverlay(ctx, v);
  }

  drawWorld(ctx) {
    const b = this.board;
    b.drawBackground(ctx);
    if (this.scene && this.scene.drawBack) this.scene.drawBack(ctx);
    this.fx.drawDecals(ctx);
    for (const c of this.corpses) c.draw(ctx);
    for (const p of this.pickups) p.draw(ctx, this.time);
    for (const e of this.enemies) if (e.alive || e.drawDead) e.draw(ctx);
    for (const sp of this.spiders) if (sp.alive) sp.draw(ctx);
    for (const p of this.projectiles) p.draw(ctx);
    b.drawTerrain(ctx);
    if (b.def.onDraw) b.def.onDraw(ctx, this);
    this.fx.draw(ctx);
    if (this.scene && this.scene.draw) this.scene.draw(ctx);
  }
}

import { segSegDist } from './util.js';

// A dead spider: the body bounces off and the legs scatter.
class Corpse {
  constructor(game, sp, info) {
    this.game = game;
    this.castIndex = sp.castIndex;
    this.facing = sp.facing;
    this.x = sp.x; this.y = sp.y; this.r = sp.r;
    const ix = info.ix || 0, iy = info.iy || 0;
    this.vx = sp.vx * 0.3 + ix * 0.8 + rand(-150, 150);
    this.vy = sp.vy * 0.3 + iy * 0.8 - 500;
    this.a = 0; this.va = rand(-14, 14);
    this.t = 0; this.life = 3.2;
    const c = castAt(sp.castIndex);
    this.legs = sp.legs.map((L) => ({ x: L.fx, y: L.fy, x2: sp.x, y2: sp.y, vx: rand(-500, 500), vy: rand(-700, -100), a: 0, va: rand(-20, 20) }));
    this.color = c.dark;
  }
  update(dt) {
    this.t += dt;
    this.vy += 2000 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.a += this.va * dt;
    const cs = this.game.world.collideCircle(this, { bounce: 0.45, friction: 0.2 });
    if (cs.length) this.va *= 0.8;
    for (const l of this.legs) {
      l.vy += 2000 * dt; l.x += l.vx * dt; l.y += l.vy * dt; l.a += l.va * dt;
      const hit = this.game.world.inside(l.x, l.y);
      if (hit) { l.vy *= -0.3; l.vx *= 0.5; l.y -= 4; l.va *= 0.5; }
    }
  }
  draw(ctx) {
    const k = Math.min(1, (this.life - this.t) / 0.6);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const l of this.legs) {
      ctx.beginPath();
      ctx.moveTo(l.x - Math.cos(l.a) * 18, l.y - Math.sin(l.a) * 18);
      ctx.lineTo(l.x + Math.cos(l.a) * 18, l.y + Math.sin(l.a) * 18);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.a);
    ctx.translate(-this.x, -this.y);
    drawBodyGray(ctx, this);
    ctx.restore();
  }
}

import { drawBody } from './cast.js';
function drawBodyGray(ctx, c) {
  ctx.filter = 'saturate(0.4) brightness(0.8)';
  drawBody(ctx, c.x, c.y, c.r * 1.08, c.castIndex, { facing: c.facing });
  ctx.filter = 'none';
  // X eyes
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  for (const s of [-1, 1]) {
    const ex = c.x + s * 6, ey = c.y - 4;
    ctx.beginPath(); ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3); ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3); ctx.stroke();
  }
}
