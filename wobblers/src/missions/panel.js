// The jobs list (opened from the phone with X, or the pause menu): every job
// grouped by island with its pay, best medal and best time. A marks the job's
// giver on the map and HUD (a waypoint); X cancels the job you're on.
import { PLAYER_CSS } from '../config.js';
import { promptRow, deviceKind } from '../glyphs.js';
import { injectCSS } from '../map.js';
import { recordOf, MEDALS, missionSave } from './state.js';

const CSS = `
.ppanel.jobs { background: rgba(20,50,110,.42); display: flex; align-items: center; justify-content: center; }
.jobsbox { pointer-events: auto; width: 560px; max-height: 94%; background: #fff; border-radius: 22px; box-shadow: 0 8px 0 rgba(0,0,0,.18), 0 0 0 5px var(--acc);
  display: flex; flex-direction: column; overflow: hidden; color: #1f3354; transform: scale(var(--s,1)); animation: cardin .3s cubic-bezier(.3,1.6,.5,1); }
.jobsbox .jbhead { background: var(--acc); color: var(--fg); padding: 7px 16px; font-weight: 900; font-size: 19px; display: flex; justify-content: space-between; align-items: baseline; }
.jobsbox .jbhead small { font-size: 13px; opacity: .9; }
.jobsbox .jblist { overflow: hidden; position: relative; height: 352px; }
.jobsbox .jbin { transition: transform .12s; padding: 4px 8px; }
.jobsbox .jbisle { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #7a8aa8; margin: 6px 6px 2px; height: 14px; }
.jobsbox .jbrow { display: grid; grid-template-columns: 26px 1fr auto 48px 58px; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; margin-bottom: 2px; }
.jobsbox .jbrow.sel { background: var(--acc); color: var(--fg); box-shadow: 0 3px 0 rgba(0,0,0,.18); }
.jobsbox .jbrow .ic { font-size: 17px; text-align: center; } .jobsbox .jbrow .pay { color: #c98a0a; font-size: 12px; } .jobsbox .jbrow.sel .pay { color: inherit; }
.jobsbox .jbrow .md { text-align: center; font-size: 16px; } .jobsbox .jbrow .bt { font-size: 12px; text-align: right; opacity: .8; font-variant-numeric: tabular-nums; }
.jobsbox .jbrow .run { font-size: 10px; background: #55d85a; color: #fff; border-radius: 6px; padding: 1px 5px; margin-left: 6px; }
.jobsbox .jbinfo { border-top: 2px solid #e8eef8; padding: 6px 16px; font-size: 13px; font-weight: 700; min-height: 36px; color: #456; }
.jobsbox .foot { padding: 4px; font-size: 12px; color: #567; display: flex; justify-content: center; flex-wrap: wrap; font-weight: 700; }
`;
let cssDone = false;
const textCol = (c) => (c === 0xffffff || c === 0xffc233 || c === 0x3fe0d0) ? '#234' : '#fff';
const accent = (c) => PLAYER_CSS(c === 0xffffff ? 0x2a62c9 : c);
const fmt1 = (t) => (t < 60 ? `${t.toFixed(1)}s` : `${Math.floor(t / 60)}:${(t % 60).toFixed(0).padStart(2, '0')}`);

export class JobsPanel {
  constructor(ui, player, M) {
    if (!cssDone) { injectCSS(CSS); cssDone = true; }
    this.ui = ui; this.p = player; this.M = M; this.kind = 'jobs';
    this.t0 = performance.now();
    this.order = [];
    for (const isl of M.islands) for (const j of M.jobs) if (j.island === isl.id) this.order.push(j);
    const tr = M.tracked.get(player), run = M.runOf(player);
    this.sel = Math.max(0, this.order.indexOf(run?.job || tr || this.nearestJob()));
    this.el = document.createElement('div');
    this.el.className = 'ppanel jobs';
    ui.hud.appendChild(this.el);
    this.el.addEventListener('click', (e) => { const it = e.target.closest?.('[data-i]'); if (it) { this.sel = +it.dataset.i; this.pick(); } });
    this.el.addEventListener('wheel', (e) => { this.move(e.deltaY > 0 ? 1 : -1); e.preventDefault(); }, { passive: false });
    this.draw();
  }
  nearestJob() {
    const c = this.p.chest.translation();
    let best = null, bd = 1e9;
    for (const j of this.order) { const g = j.giverRef; const d = Math.hypot(g.x - c.x, g.z - c.z); if (d < bd) { bd = d; best = j; } }
    return best;
  }
  remove() { this.el.remove(); }
  place(rect) {
    const [x, y, w, h] = rect;
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    this.el.style.setProperty('--s', Math.max(0.4, Math.min(1, w / 600, h / 520)).toFixed(3));
  }
  move(d) { const N = this.order.length; this.sel = (this.sel + d + N) % N; this.ui.sfx('uiMove'); this.draw(); }
  input(n) {
    if (performance.now() - this.t0 < 250) return;
    if (n.back || (this.p.deviceId === 'kb1' && n.start)) { this.ui.sfx('uiBack'); this.ui.closePanel(this.p); return; }
    if (n.up || n.left) this.move(-1);
    if (n.down || n.right) this.move(1);
    if (n.ok) this.pick();
    if (n.x && this.M.runOf(this.p)) { this.M.cancel(this.p); this.ui.closePanel(this.p); }
  }
  pick() {
    const j = this.order[this.sel];
    if (this.M.runOf(this.p)) { this.ui.sfx('uiBack'); return; }
    this.M.track(this.p, j);
    this.ui.sfx('uiSelect');
    this.ui.closePanel(this.p);
    this.ui.toast(`Waypoint set: <b>${j.icon} ${j.name}</b> <small>${this.M.islands.find((i) => i.id === j.island)?.name}</small>`, this.p.color);
  }
  draw() {
    const p = this.p, k = deviceKind(p.deviceId), M = this.M, run = M.runOf(p);
    let html = '', last = null, row = 0, selTop = 0;
    this.order.forEach((j, i) => {
      if (j.island !== last) { last = j.island; html += `<div class="jbisle">${M.islands.find((s) => s.id === j.island)?.name || j.island}</div>`; row += 22 / 32; }
      if (i === this.sel) selTop = row;
      const r = recordOf(j.id), on = M.runs.some((q) => q.job === j);
      html += `<div class="jbrow ${i === this.sel ? 'sel' : ''}" data-i="${i}"><span class="ic">${j.icon}</span><span>${j.name}${on ? '<span class="run">ON</span>' : ''}</span>
        <span class="pay">💰${j.pay}</span><span class="md">${r?.medal ? ['', '🥉', '🥈', '🥇'][r.medal] : '·'}</span><span class="bt">${r?.time ? fmt1(r.time) : '–'}</span></div>`;
      row++;
    });
    const off = Math.max(0, selTop - 4.5) * 32;
    const j = this.order[this.sel], r = recordOf(j.id);
    const info = `${j.blurb}${r?.medal ? ` · best: ${MEDALS[r.medal]}` : ''} · gold under ${fmt1(j.gold)}`;
    this.el.innerHTML = `<div class="jobsbox" style="--acc:${accent(p.color)};--fg:${textCol(p.color === 0xffffff ? 0x2a62c9 : p.color)}">
      <div class="jbhead">📋 Jobs<small>${M.medalCount()}/${M.jobs.length} medals · ${missionSave.done} done</small></div>
      <div class="jblist"><div class="jbin" style="transform:translateY(${-off}px)">${html}</div></div>
      <div class="jbinfo">${run ? `On a job: <b>${run.job.name}</b>. Finish it, or cancel it to pick another.` : info}</div>
      <div class="foot">${promptRow(run ? [['X', 'Cancel job'], ['MENUBACK', 'Close']] : [['OK', 'Set waypoint'], ['MENUBACK', 'Close']], k)}</div></div>`;
  }
}
