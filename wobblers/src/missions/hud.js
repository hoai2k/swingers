// Job HUD in each player's own split-screen view: the objective box (job name,
// timer, objective, progress), a pointer to the current target (on screen over
// the target, or pinned to the view edge pointing at it, with the distance), a
// start banner, "Nice!" flashes between steps and the results card (time,
// medal, pay, best). ui.update(views) calls update(views) every frame; with no
// job, card or tracked giver anywhere it only hides what is left.
import * as THREE from 'three';
import { injectCSS } from '../map.js';
import { PLAYER_CSS } from '../config.js';
import { STEPS, vehicleOK } from './steps.js';
import { recordOf, MEDALS } from './state.js';

const CSS = `
.jobhud { position: absolute; transform: translateX(-50%); min-width: 230px; max-width: 46%; background: rgba(20,32,70,.72); color: #fff; border-radius: 0 0 16px 16px;
  padding: 5px 14px 8px; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,.5); pointer-events: none; border-top: 4px solid var(--acc); box-sizing: border-box; }
.jobhud .jh-top { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; opacity: .92; white-space: nowrap; }
.jobhud .jh-time { font-variant-numeric: tabular-nums; color: #ffe36a; }
.jobhud .jh-time.low { color: #ff7a7a; animation: jhblink .6s infinite alternate; }
@keyframes jhblink { to { opacity: .45; } }
.jobhud .jh-obj { font-size: 17px; margin-top: 2px; line-height: 1.15; }
.jobhud .jh-sub { font-size: 12px; color: #ffd27a; margin-top: 2px; }
.jobhud .jh-bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,.2); margin-top: 5px; overflow: hidden; }
.jobhud .jh-bar i { display: block; height: 100%; background: linear-gradient(90deg, #ffd23f, #ff8a3d); }
.jobhud.small { min-width: 150px; padding: 3px 9px 5px; } .jobhud.small .jh-obj { font-size: 13px; } .jobhud.small .jh-top { font-size: 11px; }
.jobptr { position: absolute; transform: translate(-50%, -50%); pointer-events: none; display: flex; flex-direction: column; align-items: center; gap: 1px; }
.jobptr .jp-arrow { width: 0; height: 0; border-left: 11px solid transparent; border-right: 11px solid transparent; border-bottom: 20px solid var(--acc); filter: drop-shadow(0 2px 0 rgba(0,0,0,.35)); }
.jobptr span { font-size: 12px; font-weight: 900; color: #fff; text-shadow: 0 1px 2px #000, 0 0 4px #000; white-space: nowrap; }
.jobflash { position: absolute; transform: translate(-50%, -50%); font-size: 34px; font-weight: 900; color: #ffe36a; text-shadow: 0 3px 0 #a86a00, 0 0 10px rgba(0,0,0,.4);
  pointer-events: none; animation: jobflash 1.2s ease-out forwards; white-space: nowrap; }
@keyframes jobflash { 0% { transform: translate(-50%, -50%) scale(.4); opacity: 0; } 20% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; } 75% { opacity: 1; } 100% { transform: translate(-50%, -90%) scale(1); opacity: 0; } }
.jobcard { position: absolute; transform: translate(-50%, -50%) scale(var(--s,1)); background: #fff; color: #1f3354; border-radius: 22px; padding: 12px 22px 14px; min-width: 260px;
  box-shadow: 0 8px 0 rgba(0,0,0,.18), 0 0 0 5px var(--acc); text-align: center; pointer-events: none; animation: jobcardin .35s cubic-bezier(.3,1.6,.5,1); }
@keyframes jobcardin { from { transform: translate(-50%, -50%) scale(calc(var(--s,1) * .6)); opacity: 0; } }
.jobcard h3 { margin: 0 0 2px; font-size: 24px; font-weight: 900; } .jobcard .jc-job { font-size: 14px; font-weight: 800; opacity: .75; }
.jobcard .jc-medal { width: 84px; height: 84px; margin: 8px auto 4px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 900; color: #fff;
  text-shadow: 0 2px 0 rgba(0,0,0,.25); box-shadow: inset 0 -6px 0 rgba(0,0,0,.18), 0 4px 0 rgba(0,0,0,.15); }
.jobcard .m3 { background: radial-gradient(circle at 35% 30%, #fff6b0, #ffd23f 45%, #e8a20c); } .jobcard .m2 { background: radial-gradient(circle at 35% 30%, #fff, #c9d3e6 45%, #8a97ad); }
.jobcard .m1 { background: radial-gradient(circle at 35% 30%, #ffd8b0, #d9824a 45%, #9a5a2a); } .jobcard .m0 { background: radial-gradient(circle at 35% 30%, #ffb0b0, #e2393a 50%, #8a1a1a); }
.jobcard .jc-stars { font-size: 22px; letter-spacing: 3px; color: #ffc21a; text-shadow: 0 2px 0 #a86a00; } .jobcard .jc-stars i { color: #d8deea; text-shadow: none; font-style: normal; }
.jobcard .jc-rows { display: grid; grid-template-columns: auto auto; gap: 2px 16px; justify-content: center; font-size: 15px; font-weight: 800; margin-top: 6px; text-align: left; }
.jobcard .jc-rows b { text-align: right; } .jobcard .jc-pay { color: #c98a0a; } .jobcard .jc-new { color: #2f9a36; font-size: 13px; font-weight: 900; margin-top: 4px; }
.jobbanner { position: absolute; transform: translate(-50%, 0) scale(var(--s,1)); transform-origin: 50% 0; background: var(--acc); color: #fff; padding: 6px 18px; border-radius: 16px; font-weight: 900; font-size: 20px;
  text-shadow: 0 1px 2px rgba(0,0,0,.4); pointer-events: none; animation: jobbannerin .35s cubic-bezier(.3,1.6,.5,1); white-space: nowrap; text-align: center; }
@keyframes jobbannerin { from { transform: translate(-50%, 0) scale(calc(var(--s,1) * .6)); opacity: 0; } }
.jobbanner small { display: block; font-size: 13px; font-weight: 800; opacity: .9; }
`;

const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const fmt1 = (t) => (t < 60 ? `${t.toFixed(1)}s` : `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`);
const _v = new THREE.Vector3();
const accent = (c) => PLAYER_CSS(c === 0xffffff ? 0x2a62c9 : c);

export class MissionHud {
  constructor(game, M) {
    injectCSS(CSS);
    this.game = game; this.M = M;
    this.els = new Map();    // player -> { box, ptr, ... }
    this.cards = new Map();  // player -> { el, until }
    this.banners = new Map();
    this.flashes = [];
  }

  el(p) {
    let e = this.els.get(p);
    if (!e) {
      const hud = this.game.ui.hud;
      const box = document.createElement('div'); box.className = 'jobhud';
      box.innerHTML = '<div class="jh-top"><span class="jh-name"></span><span class="jh-time"></span></div><div class="jh-obj"></div><div class="jh-sub"></div><div class="jh-bar"><i></i></div>';
      const ptr = document.createElement('div'); ptr.className = 'jobptr'; ptr.innerHTML = '<div class="jp-arrow"></div><span></span>';
      hud.append(box, ptr);
      e = { box, ptr, name: box.querySelector('.jh-name'), time: box.querySelector('.jh-time'), obj: box.querySelector('.jh-obj'), sub: box.querySelector('.jh-sub'), bar: box.querySelector('.jh-bar'), fill: box.querySelector('.jh-bar i'), arrow: ptr.firstChild, dist: ptr.lastChild, cache: {} };
      this.els.set(p, e);
    }
    return e;
  }
  set(e, k, el, v, html = false) { if (e.cache[k] === v) return; e.cache[k] = v; if (html) el.innerHTML = v; else el.textContent = v; }

  // objective text for a player
  objective(run, p) {
    const s = run.steps[run.i];
    if (!s) return '';
    const h = STEPS[s.type];
    let t = h.text ? h.text(run, s) : s.text || '';
    return t;
  }
  subline(run, p) {
    const s = run.steps[run.i];
    if (!s) return '';
    const want = s.vehicle || (s.type === 'passenger' || s.type === 'fires' ? s.vehicle : null);
    if (want && !vehicleOK(p, want)) return `Hop in ${s.vehicleName || run.job.vehicleName || 'a vehicle'} (Y)`;
    if (s.type === 'items') {
      const anyHeld = run.players.some((q) => q.hands.L.body || q.hands.R.body);
      if (!anyHeld) return s.hint || 'Hold LT / RT to grab, carry it over';
    }
    return s.hint || '';
  }

  banner(p, job) {
    const el = document.createElement('div'); el.className = 'jobbanner';
    el.innerHTML = `${job.icon} ${job.name}<small>${job.blurb}</small>`;
    this.game.ui.hud.appendChild(el);
    this.banners.get(p)?.el.remove();
    this.banners.set(p, { el, until: performance.now() + 3200 });
  }
  flash(run, text) {
    for (const p of run.players) {
      const el = document.createElement('div'); el.className = 'jobflash'; el.textContent = text;
      this.game.ui.hud.appendChild(el);
      this.flashes.push({ el, p, until: performance.now() + 1200 });
    }
  }
  card(p, o) {
    const job = o.job, r = recordOf(job.id);
    const el = document.createElement('div'); el.className = 'jobcard';
    el.style.setProperty('--acc', accent(p.color));
    if (o.fail) {
      el.innerHTML = `<h3>${o.why || 'Job failed'}</h3><div class="jc-job">${job.icon} ${job.name}</div><div class="jc-medal m0">✗</div>
        <div class="jc-rows"><span>Time</span><b>${fmt1(o.t)}</b>${r?.medal ? `<span>Best</span><b>${MEDALS[r.medal]} · ${fmt1(r.time)}</b>` : ''}</div><div class="jc-new" style="color:#567">Try again at the ! marker</div>`;
    } else {
      const stars = [1, 2, 3].map((k) => (k <= o.medal ? '★' : '<i>★</i>')).join('');
      el.innerHTML = `<h3>Job complete!</h3><div class="jc-job">${job.icon} ${job.name}</div>
        <div class="jc-medal m${o.medal}">${['', 'B', 'S', 'G'][o.medal]}</div><div class="jc-stars">${stars}</div>
        <div class="jc-rows"><span>${MEDALS[o.medal]} medal</span><b></b><span>Time</span><b>${fmt1(o.t)}</b>
        <span>Pay</span><b class="jc-pay">+${o.pay}${o.n > 1 ? ` <small>(team ${o.total})</small>` : ''}</b>
        <span>Best</span><b>${r?.time != null ? fmt1(r.time) : '-'}</b></div>
        ${o.best && o.prevTime != null ? '<div class="jc-new">New best time!</div>' : o.medalUp && o.medal < 3 ? `<div class="jc-new">Gold in under ${fmt(job.gold)}</div>` : o.medal < 3 ? `<div class="jc-new" style="color:#567">Gold in under ${fmt(job.gold)}</div>` : ''}`;
    }
    this.game.ui.hud.appendChild(el);
    this.cards.get(p)?.el.remove();
    this.cards.set(p, { el, until: performance.now() + 6500 });
  }

  // the target the pointer shows for a player
  pointerTarget(run, p) {
    const ts = this.M.targets(run).filter((t) => !t.ghost);
    if (!ts.length) return null;
    const c = p.chest.translation();
    const s = run.steps[run.i];
    let list = ts;
    if (s?.type === 'items') {
      const held = ts.some((t) => t.item && t.held);
      list = held ? ts.filter((t) => !t.item) : ts.filter((t) => t.item);
      if (!list.length) list = ts;
    }
    let best = null, bd = 1e9;
    for (const t of list) { const d = Math.hypot(t.x - c.x, t.z - c.z); if (d < bd) { bd = d; best = t; } }
    return best && { ...best, d: bd };
  }

  update(views) {
    const g = this.game, ps = g.players, now = performance.now();
    for (const [p, e] of this.els) if (!ps.includes(p)) { e.box.remove(); e.ptr.remove(); this.els.delete(p); }
    for (const m of [this.cards, this.banners]) for (const [p, r] of m) if (!ps.includes(p) || now > r.until) { r.el.remove(); m.delete(p); }
    this.flashes = this.flashes.filter((f) => { if (now > f.until || !ps.includes(f.p)) { f.el.remove(); return false; } return true; });
    if (!this.M.runs.length && !this.els.size && !this.cards.size && !this.banners.size && !this.flashes.length && !this.M.tracked.size) return;
    ps.forEach((p, i) => {
      const v = views[i]; if (!v) return;
      const [x, y, w, h] = v, small = w < 520 || h < 320;
      const panel = g.ui.panels.get(p);
      const run = this.M.runOf(p), tr = !run && this.M.tracked.get(p);
      const sc = Math.max(0.55, Math.min(1, w / 760, h / 500));
      const c = this.cards.get(p); if (c) { Object.assign(c.el.style, { left: x + w / 2 + 'px', top: y + h * 0.45 + 'px', display: panel ? 'none' : '' }); c.el.style.setProperty('--s', sc.toFixed(3)); }
      const bn = this.banners.get(p); if (bn) { Object.assign(bn.el.style, { left: x + w / 2 + 'px', top: y + h * 0.3 + 'px', display: panel ? 'none' : '' }); bn.el.style.setProperty('--s', sc.toFixed(3)); }
      for (const f of this.flashes) if (f.p === p) Object.assign(f.el.style, { left: x + w / 2 + 'px', top: y + h * 0.32 + 'px', fontSize: (small ? 22 : 34) + 'px' });
      if (!run && !tr) { const e = this.els.get(p); if (e) { e.box.style.display = 'none'; e.ptr.style.display = 'none'; } return; }
      const e = this.el(p);
      e.box.style.setProperty('--acc', accent(run ? run.color : p.color));
      e.ptr.style.setProperty('--acc', accent(run ? run.color : 0xffc21a));
      if (panel) { e.box.style.display = 'none'; e.ptr.style.display = 'none'; return; }
      e.box.style.display = '';
      e.box.classList.toggle('small', small);
      Object.assign(e.box.style, { left: x + w / 2 + 'px', top: y + 'px' });
      let target;
      if (run) {
        const job = run.job;
        this.set(e, 'name', e.name, `${job.icon} ${job.name}${run.players.length > 1 ? ' · ' + run.players.map((q) => 'P' + (q.index + 1)).join('+') : ''}`);
        const left = job.time ? job.time - run.t : run.t;
        this.set(e, 'time', e.time, (job.time ? '⏱ ' : '') + fmt(left));
        e.time.classList.toggle('low', !!job.time && left < 15);
        const s = run.steps[run.i], cnt = s && STEPS[s.type].count?.(run, s);
        this.set(e, 'obj', e.obj, this.objective(run, p) + (cnt ? `  ${cnt[0]}/${cnt[1]}` : ''));
        this.set(e, 'sub', e.sub, this.subline(run, p));
        e.sub.style.display = e.cache.sub ? '' : 'none';
        const frac = cnt ? cnt[0] / cnt[1] : run.i / run.steps.length;
        e.fill.style.width = Math.round(frac * 100) + '%';
        target = this.pointerTarget(run, p);
      } else {
        const gv = tr.giverRef;
        this.set(e, 'name', e.name, `${tr.icon} ${tr.name}`);
        this.set(e, 'time', e.time, '💰' + tr.pay);
        e.time.classList.remove('low');
        this.set(e, 'obj', e.obj, 'Go to the job giver (!)');
        this.set(e, 'sub', e.sub, ''); e.sub.style.display = 'none';
        e.fill.style.width = '0%';
        const c = p.chest.translation();
        target = { x: gv.x, y: gv.y + 1, z: gv.z, d: Math.hypot(gv.x - c.x, gv.z - c.z) };
        if (target.d < 4) { this.M.tracked.delete(p); }
      }
      this.pointer(e, p, target, x, y, w, h, small);
    });
  }

  pointer(e, p, t, x, y, w, h, small) {
    if (!t || !p.camera?.cam) { e.ptr.style.display = 'none'; return; }
    const cam = p.camera.cam;
    _v.set(t.x, t.y + Math.max(2.5, (t.r || 0) * 0.5 + 2), t.z).project(cam);
    let sx = _v.x, sy = _v.y;
    const behind = _v.z > 1;
    if (behind) { sx = -sx; sy = -sy; }
    const m = 0.88;
    const off = behind || Math.abs(sx) > m || Math.abs(sy) > m;
    if (off) { const k = m / Math.max(Math.abs(sx), Math.abs(sy), 1e-6); sx *= k; sy *= k; if (behind && Math.abs(sy) < m) sy = -m; }
    if (sy > 0.62 && Math.abs(sx) < 0.45) sy = 0.62; // not under the objective box
    const px = x + (sx * 0.5 + 0.5) * w, py = y + (-sy * 0.5 + 0.5) * h;
    e.ptr.style.display = '';
    Object.assign(e.ptr.style, { left: px + 'px', top: py + 'px' });
    // arrow: points down at an on-screen target, otherwise out toward it
    const ang = off ? Math.atan2(sx, sy) : Math.PI;
    e.arrow.style.transform = `rotate(${ang}rad) scale(${small ? 0.7 : 1})`;
    this.set(e, 'dist', e.dist, t.d > 1000 ? (t.d / 1000).toFixed(1) + ' km' : Math.round(t.d) + ' m');
  }
}
