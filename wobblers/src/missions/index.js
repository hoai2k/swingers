// Missions: Wobbly Life-style jobs. Walk up to a job giver (an NPC or a JOBS
// board with a floating "!", also on the map) and press Y: a HUD objective, a
// timer and a waypoint (in-world beacon, screen-edge pointer, map pin) guide you
// through the job's steps; finishing pays the shared purse with a results card
// (time, medal, pay). Jobs are repeatable, can be cancelled from the pause menu,
// and are split-screen co-op: press Y at a giver whose job is running to join
// it (each player's HUD shows their own job; different jobs run at once).
//
// Wiring: one buildMissions(game) call in world/index.js (after the regions and
// life, before kit.finish so job boards merge into the static world), plus small
// hooks in ui.js (HUD update, pause-menu items), phone.js (X: jobs list) and
// map.js (game.mapOverlays). Job data: src/missions/jobs/*.js; step types:
// steps.js; NPC brains: ai.js; visuals: fx.js; HUD + cards: hud.js; list: panel.js.
//
//   game.missions.jobs              every job definition (see jobs/index.js for the format)
//   game.missions.runs              running jobs: { job, players, i (step), t (seconds), steps, npcs, ... }
//   game.missions.runOf(player)     the run a player is on, or null
//   game.missions.start(job | id, player) / join(run, player) / cancel(player)
//   game.missions.complete(run)     finish now (probes); game.missions.stepNow(run) completes the current step
//   game.missions.track(player, job) map + HUD pointer to a job's giver (jobs list)
// Saved records: settings.missions (state.js). Idle cost: one giver proximity check
// every 30 physics steps and a marker bob for markers near a player.
import { JOB_OUTFITS } from '../outfits.js';
import { rewardName } from '../cosmetics.js';
import * as THREE from 'three';
import { SEA_LEVEL } from '../config.js';
import { meshHeight } from '../terrain.js';
import { Vehicle, VEHICLES } from '../vehicles.js';
import { findSpot } from '../phone.js';
import { signMesh } from '../mesh.js';
import { useSpot, Local, chime, tone, NOTE, throwable } from '../world/common.js';
import { poster } from '../world/posters.js';
import { STEPS, setCargo } from './steps.js';
import { spawnJobNPC, despawnJobNPC } from './ai.js';
import { markerSprite, Beacon, Hoop, spawnItem, removeItem, ITEMS } from './fx.js';
import { MissionHud } from './hud.js';
import { JobsPanel } from './panel.js';
import { JOBS, ISLANDS } from './jobs/index.js';
import { record, recordOf, missionSave, MEDALS } from './state.js';

const DT = 1 / 60;
const GIVER_WAKE = 170; // spawn a giver's NPC when a player first comes this close

export function medalFor(job, t) { return t <= job.gold ? 3 : t <= job.silver ? 2 : 1; }
export function payFor(job, medal, n = 1) { return Math.round(job.pay * [0, 1, 1.25, 1.5][medal] * (1 + 0.25 * (n - 1))); }

export class Missions {
  constructor(game) {
    this.game = game;
    this.jobs = JOBS;
    this.islands = ISLANDS;
    this.runs = [];
    this.givers = [];
    this.leftovers = [];   // job vehicles still occupied when their job ended
    this.laterQ = [];      // [steps left, fn]
    this.tracked = new Map(); // player -> job (waypoint to a giver)
    this.k = 0;
    this.save = missionSave;
    this.hud = new MissionHud(game, this);
  }

  // ---- world helpers -------------------------------------------------------------------
  groundY(x, z, water = false, from = 8) {
    const m = meshHeight(x, z);
    let y = Math.max(this.game.groundHeight(x, z, m + from), m - 0.2);
    if (water || y < SEA_LEVEL) y = Math.max(y, SEA_LEVEL);
    return y;
  }
  later(steps, fn) { this.laterQ.push([steps, fn]); }
  sound(kind, p) {
    const g = this.game;
    try {
      if (kind === 'start') chime(g, null, [67, 72, 76, 79], 0.25);
      else if (kind === 'step') chime(g, null, [76, 81], 0.22);
      else if (kind === 'done') chime(g, null, [72, 76, 79, 84, 88], 0.3);
      else if (kind === 'fail') [0, 1, 2].forEach((i) => tone(g, null, NOTE(64 - i * 3), NOTE(63 - i * 3), 0.25, 0.22, 'square', i * 0.18));
      else if (kind === 'drop') { g.audio?.play('pop', p || null, 0.8); chime(g, p || null, [79, 84], 0.18); }
      else if (kind === 'found') g.audio?.play('pop', p || null, 1);
      else if (kind === 'board') g.audio?.play('seat', p || null, 1);
    } catch (e) { /* sound is optional */ }
  }
  toastFor(p, text) { this.game.ui?.toast(text, p?.color); }

  npc(run, key, spec, x, z) {
    const sp = typeof spec === 'string' ? { role: spec } : spec;
    const { role, ...opts } = sp;
    const n = spawnJobNPC(this.game, role || 'townsfolk', x, z, opts);
    n.job.run = run;
    run.npcs[key] = n;
    return n;
  }
  item(run, kind, x, y, z) {
    const it = spawnItem(this.game, kind, x, y, z, Math.random() * 6);
    it.home = { x, y: y + 0.6, z };
    const th = ITEMS[kind].throwSpeed;
    if (th) throwable(this.game, it.obj, { speed: th, r: ITEMS[kind].h + 0.1 });
    run.items.push(it);
    return it;
  }
  resetItem(it) {
    for (const p of this.game.players) for (const h of ['L', 'R']) if (p.hands[h].body === it.body) p.releaseHand(h);
    it.body.setTranslation(it.home, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // ---- givers ------------------------------------------------------------------------------
  build() {
    const g = this.game, kit = g.kit;
    for (const job of this.jobs) {
      const gv = job.giver, [x, z] = gv.at, yaw = gv.yaw || 0;
      const y = Math.max(meshHeight(x, z), SEA_LEVEL) + (gv.dy || 0);
      const giver = { job, x, z, y, yaw, npc: null };
      if (gv.board) giver.boardMeshes = this.board(kit, x, z, yaw, y);
      job.build?.(this, kit);
      const fx = x + Math.sin(yaw) * (gv.board ? 1.3 : 0), fz = z + Math.cos(yaw) * (gv.board ? 1.3 : 0);
      giver.seat = useSpot(g, fx, y + 1.0, fz, `Job: <b>${job.name}</b>`, (p) => this.interact(p, job));
      Object.defineProperty(giver.seat, 'label', { get: () => this.labelFor(job), configurable: true });
      giver.seat.labelFor = (p) => this.labelFor(job, p); // ui.js hintFor: per-player prompt
      giver.marker = markerSprite();
      giver.marker.position.set(x, y + (gv.board ? 3.6 : 2.85), z);
      giver.marker.visible = false;
      giver.baseY = giver.marker.position.y;
      g.scene.add(giver.marker);
      this.givers.push(giver);
      job.giverRef = giver;
    }
    g.steppers.push(() => this.step());
    g.updaters.push((dt, t) => this.frame(dt, t));
    (g.mapOverlays ||= []).push((ctx, sx, sy, p, z, s) => this.drawMap(ctx, sx, sy, p, z, s));
  }

  // A JOBS board on two posts with a notice poster (painted art: signs/jobs.png, posters/job_board.png).
  board(kit, x, z, yaw, y) {
    const L = new Local(kit, x, z, yaw, y);
    for (const s of [-1, 1]) L.cyl(s * 1.25, 1.35, 0, 0.09, 2.7, 0x8a5a32, { seg: 6 });
    L.box(0, 1.55, -0.05, 2.7, 1.5, 0.12, 0x9a6a3a);
    const pm = poster(this.game, L, 'job_board', 0, 1.55, 0.03, 0, 2.3, 1.3, { bg: '#c8955a', title: 'JOBS', sub: 'press Y', fg: '#5a3a1a', frame: 0x6b4a2a });
    const sg = signMesh('JOBS', 2.8, '#ffd23f', '#1f3a7a');
    const p = L.v3(0, 2.75, 0.02);
    sg.position.set(p.x, p.y, p.z); sg.rotation.y = yaw;
    sg.userData.noCull = true;
    this.game.scene.add(sg);
    return [pm, sg]; // shown only near players, like the markers
  }

  labelFor(job, p) {
    const r = recordOf(job.id), run = this.runs.find((q) => q.job === job), mine = p && this.runOf(p);
    if (mine && mine.job === job) return `<b>${job.icon} ${job.name}</b> <small>you're on it!</small>`;
    if (mine) return `Job: <b>${job.icon} ${job.name}</b> <small>finish ${mine.job.name} first</small>`;
    const medal = r?.medal ? ' ' + ['', '🥉', '🥈', '🥇'][r.medal] : '';
    return `${run ? 'Join job' : 'Job'}: <b>${job.icon} ${job.name}</b> <small>💰${job.pay}${medal}</small>`;
  }

  spawnGivers() {
    const ps = this.game.players;
    if (!ps.length) return;
    for (const gv of this.givers) {
      if (gv.npc || gv.job.giver.board) continue;
      const near = ps.some((p) => { const c = p.chest.translation(); return Math.abs(c.x - gv.x) < GIVER_WAKE && Math.abs(c.z - gv.z) < GIVER_WAKE; });
      if (!near) continue;
      const spec = gv.job.giver.npc || 'townsfolk';
      const { role, ...opts } = typeof spec === 'string' ? { role: spec } : spec;
      gv.npc = this.game.npcs.spawn(role, gv.x, gv.z, { behaviour: 'idle', flee: false, yaw: gv.yaw, lines: gv.job.giver.lines || [`Fancy a job? ${gv.job.name}!`], ...opts });
      gv.npc.group.userData.noCull = true;
      return; // one ragdoll build (~25 ms) per check
    }
  }

  // ---- runs ---------------------------------------------------------------------------------
  runOf(p) { return this.runs.find((r) => r.players.includes(p)) || null; }
  jobById(id) { return this.jobs.find((j) => j.id === id) || null; }

  interact(p, job) {
    const mine = this.runOf(p);
    if (mine && mine.job === job) { this.toastFor(p, `You're on <b>${job.name}</b>: ${this.hud.objective(mine, p)}`); return; }
    if (mine) { this.toastFor(p, `Finish or cancel <b>${mine.job.name}</b> first <small>(menu → Cancel job)</small>`); this.game.audio?.play('nope'); return; }
    const run = this.runs.find((r) => r.job === job);
    if (run) this.join(run, p); else this.start(job, p);
  }

  start(job, p) {
    if (typeof job === 'string') job = this.jobById(job);
    if (!job || this.runOf(p)) return null;
    const run = {
      job, players: [p], i: 0, t: 0, npcs: {}, items: [], disposables: [], beacons: [], hoops: [],
      color: p.color, cargo: job.cargo || null, vehicle: null, state: 'running',
    };
    const steps = typeof job.steps === 'function' ? job.steps(this, run) : job.steps;
    run.steps = steps.map((s) => ({ ...s }));
    this.runs.push(run);
    this.tracked.delete(p);
    if (job.vehicle) run.vehicle = this.spawnVehicle(job.vehicle, p);
    if (run.cargo) setCargo(p, run.cargo);
    this.startStep(run);
    this.sound('start');
    const gn = job.giverRef?.npc;
    if (gn && !gn.parked) gn.say(job.giver.go || 'Off you go!', 3);
    this.hud.banner(p, job);
    this.game.ui?.toast(`P${p.index + 1} started <b>${job.icon} ${job.name}</b>${run.vehicle ? ` <small>your ${VEHICLES[job.vehicle.type]?.name || job.vehicle.name || job.vehicle.type} is here</small>` : ''}`, p.color);
    return run;
  }

  join(run, p) {
    if (this.runOf(p) || run.state !== 'running') return;
    run.players.push(p);
    this.tracked.delete(p);
    if (run.cargo) setCargo(p, run.cargo);
    this.hud.banner(p, run.job);
    this.game.ui?.toast(`P${p.index + 1} joined <b>${run.job.name}</b>! <small>co-op pays more</small>`, p.color);
    this.sound('step');
  }

  spawnVehicle(vd, p) {
    const g = this.game, def = VEHICLES[vd.type];
    if (!def) return null;
    let spot = findSpot(g, p, def, null);
    if (!spot && vd.at) { const [x, z, yaw = 0] = vd.at; spot = { x, y: this.groundY(x, z, def.boat) + (def.boat ? 0.3 : 1.4), z, yaw }; }
    if (!spot) return null;
    const v = new Vehicle(g, vd.type, spot.x, spot.y, spot.z, spot.yaw, vd.color ?? p.color, vd.opts || {});
    v.jobVehicle = true; v.spawnedAt = g.time;
    g.vehicles.push(v);
    return v;
  }

  startStep(run) {
    const s = run.steps[run.i];
    STEPS[s.type].start(run, s, this);
    run.stepT = 0;
  }

  // Completes the current step right away (probes).
  stepNow(run) { this.advance(run); }
  complete(run) { while (run.state === 'running') this.advance(run); }

  advance(run) {
    const s = run.steps[run.i];
    if (s.give) { run.cargo = s.give; for (const p of run.players) setCargo(p, s.give); }
    if (s.take) { run.cargo = null; for (const p of run.players) setCargo(p, null); }
    run.i++;
    if (run.i >= run.steps.length) { this.finish(run); return; }
    this.sound('step');
    this.hud.flash(run, s.done || 'Nice!');
    this.startStep(run);
  }

  cancel(p) {
    const run = this.runOf(p);
    if (!run) return false;
    if (run.players.length > 1) {
      run.players = run.players.filter((q) => q !== p);
      setCargo(p, null);
      this.game.ui?.toast(`P${p.index + 1} left <b>${run.job.name}</b>`, p.color);
      return true;
    }
    this.end(run, 'cancel');
    this.game.ui?.toast(`<b>${run.job.name}</b> cancelled`, p.color);
    return true;
  }

  fail(run, why) {
    this.end(run, 'fail');
    this.sound('fail');
    for (const p of run.players) this.hud.card(p, { fail: true, job: run.job, why, t: run.t });
  }

  finish(run) {
    const job = run.job, t = run.t, n = run.players.length;
    const medal = medalFor(job, t), pay = payFor(job, medal, n), share = Math.ceil(pay / n);
    const prev = recordOf(job.id), prevTime = prev?.time;
    const rec = record(job.id, t, medal);
    this.end(run, 'done');
    this.sound('done');
    for (const p of run.players) {
      this.game.wallet?.add(p, share, job.name);
      this.hud.card(p, { job, t, medal, pay: share, total: pay, n, best: rec.newBest, prevTime, medalUp: rec.medalUp });
    }
    const gn = job.giverRef?.npc;
    if (gn && !gn.parked) gn.say(job.giver.thanks || 'Great work!', 3);
    // the first finish unlocks this job's outfit (src/outfits.js) for everyone
    const outfit = JOB_OUTFITS[job.id];
    if (outfit && !prev?.wins) this.later(150, () => this.game.ui?.toast(`👕 New outfit: <b>${rewardName(outfit)}</b> <small>Settings → Customise</small>`));
  }

  end(run, how) {
    run.state = how;
    const i = this.runs.indexOf(run); if (i >= 0) this.runs.splice(i, 1);
    for (const s of run.steps) STEPS[s.type].end?.(run, s, this);
    for (const it of run.items) removeItem(this.game, it);
    for (const d of run.disposables) d.dispose();
    for (const b of run.beacons) b.dispose();
    for (const h of run.hoops) h.dispose();
    run.beacons = []; run.hoops = [];
    for (const p of run.players) setCargo(p, null);
    const npcs = Object.values(run.npcs);
    for (const n of npcs) { n.job.run = null; if (n.seat) n.leaveSeat(); }
    this.later(how === 'done' ? 200 : 30, () => { for (const n of npcs) despawnJobNPC(this.game, n); });
    if (run.vehicle) this.leftovers.push(run.vehicle);
  }

  cleanLeftovers() {
    this.leftovers = this.leftovers.filter((v) => {
      if (v.destroyed) return false;
      if (v.seats.some((s) => s.occupant)) return true;
      v.destroy();
      return false;
    });
  }

  // ---- per step ---------------------------------------------------------------------------------
  step() {
    this.k++;
    if (this.k % 30 === 0) this.spawnGivers();
    if (this.k % 120 === 0 && this.leftovers.length) this.cleanLeftovers();
    if (this.laterQ.length) this.laterQ = this.laterQ.filter((e) => (--e[0] > 0 ? true : (e[1](), false)));
    if (!this.runs.length) return;
    for (const run of [...this.runs]) {
      run.players = run.players.filter((p) => this.game.players.includes(p));
      if (!run.players.length) { this.end(run, 'abandon'); continue; }
      run.t += DT; run.stepT += DT;
      if (run.job.time && run.t > run.job.time) { this.fail(run, 'Out of time!'); continue; }
      const s = run.steps[run.i];
      if (STEPS[s.type].update(run, s, this)) this.advance(run);
    }
  }

  // current targets of a run (beacons, map pins, HUD pointer)
  targets(run) {
    const s = run.steps[run.i];
    return s ? STEPS[s.type].targets(run, s, this) : [];
  }

  frame(dt, t) {
    const g = this.game;
    // markers: shown near players, bobbing
    if ((this.k & 7) === 0 || this.markersDirty) {
      this.markersDirty = false;
      const ps = g.players.map((p) => p.chest.translation());
      for (const gv of this.givers) {
        gv.marker.visible = ps.some((c) => Math.abs(c.x - gv.x) < 260 && Math.abs(c.z - gv.z) < 260);
        if (gv.boardMeshes) for (const m of gv.boardMeshes) m.visible = gv.marker.visible;
      }
    }
    for (const gv of this.givers) if (gv.marker.visible) gv.marker.position.y = gv.baseY + Math.sin(t * 2.4 + gv.x) * 0.14;
    for (const run of this.runs) {
      const ts = this.targets(run);
      let bi = 0, hi = 0;
      for (const tg of ts) {
        if (tg.style === 'dot') continue;
        if (tg.style === 'hoop') {
          const h = run.hoops[hi] || (run.hoops[hi] = new Hoop(g, tg.ghost ? 0xffffff : 0xff7a1a));
          h.set(tg.x, tg.y, tg.z, Math.max(2.5, tg.r * 0.7), tg.yaw); h.anim(t); hi++;
          if (tg.ghost) continue;
        }
        const b = run.beacons[bi] || (run.beacons[bi] = new Beacon(g, run.color === 0xffffff ? 0xffd23f : run.color));
        b.set(tg.x, tg.y, tg.z, tg.small ? 1.2 : Math.min(tg.r, 12), { arrowY: tg.style === 'hoop' ? tg.r * 1.6 + 2 : 3.4 });
        b.anim(t); bi++;
      }
      for (let i = bi; i < run.beacons.length; i++) run.beacons[i].hide();
      for (let i = hi; i < run.hoops.length; i++) run.hoops[i].hide();
      const s = run.steps[run.i];
      if (s) STEPS[s.type].anim?.(run, s, t);
    }
  }

  // ---- map overlay (map.js calls this with the panel's projection) -------------------------------
  drawMap(ctx, sx, sy, p, z, s) {
    const W = ctx.canvas.width, H = ctx.canvas.height, run = this.runOf(p), tr = this.tracked.get(p);
    const r0 = 7 * Math.max(0.7, s);
    for (const gv of this.givers) {
      const X = sx(gv.x), Y = sy(gv.z);
      if (X < -20 || X > W + 20 || Y < -20 || Y > H + 20) continue;
      const big = tr === gv.job, rr = big ? r0 * 1.5 : r0;
      ctx.beginPath(); ctx.arc(X, Y, rr, 0, Math.PI * 2);
      ctx.fillStyle = run?.job === gv.job ? '#55d85a' : '#ffc21a'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1f3a7a'; ctx.stroke();
      ctx.fillStyle = '#1f3a7a'; ctx.font = `900 ${Math.round(rr * 1.4)}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', X, Y + 1);
      if (big || z > 1.2) {
        ctx.font = `800 ${Math.round(11 * Math.max(0.7, s))}px "Trebuchet MS", sans-serif`;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(20,30,60,.8)'; ctx.lineWidth = 3;
        ctx.strokeText(gv.job.name, X, Y + rr + 9); ctx.fillText(gv.job.name, X, Y + rr + 9);
      }
    }
    if (!run) return;
    const pulse = 1 + 0.25 * Math.sin(performance.now() / 180);
    for (const tg of this.targets(run)) {
      if (tg.ghost) continue;
      let X = sx(tg.x), Y = sy(tg.z);
      const dot = tg.style === 'dot';
      X = Math.max(10, Math.min(W - 10, X)); Y = Math.max(10, Math.min(H - 10, Y));
      ctx.beginPath(); ctx.arc(X, Y, (dot ? 4 : 8) * Math.max(0.7, s) * (dot ? 1 : pulse), 0, Math.PI * 2);
      ctx.fillStyle = dot ? '#ffffff' : '#ff3a8a'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#1f3354'; ctx.stroke();
    }
  }

  // ---- UI entry points ------------------------------------------------------------------------------
  openList(p) { this.game.ui.setPanel(p, new JobsPanel(this.game.ui, p, this)); this.game.ui.sfx('uiOpen'); }
  track(p, job) { if (job) this.tracked.set(p, job); else this.tracked.delete(p); }
  doneCount() { return missionSave.done; }
  medalCount() { let n = 0; for (const j of this.jobs) if (recordOf(j.id)?.medal) n++; return n; }

  // pause-menu items (ui.js PauseMenu.items)
  menuItems(p, menu) {
    const run = this.runOf(p), ui = this.game.ui;
    const items = [{ label: '📋 Jobs', sub: true, value: `${this.medalCount()}/${this.jobs.length}`, act: () => this.openList(p) }];
    if (run) items.push({ label: menu.confirmJob ? `Press again: quit ${run.job.name}` : `Cancel job: ${run.job.name}`, danger: true, act: () => {
      if (!menu.confirmJob) { menu.confirmJob = true; return; }
      menu.confirmJob = false; this.cancel(p); ui.closePanel(p);
    } });
    items.push({ label: 'Jobs done', value: String(missionSave.done) });
    return items;
  }
}

export function buildMissions(game) {
  const m = new Missions(game);
  game.missions = m;
  m.build();
  return m;
}
export { MEDALS };
void THREE;
