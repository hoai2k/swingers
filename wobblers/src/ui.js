// HUD overlay: title screen, joining, per-view labels/hints, name tags and
// the pause menu.
import * as THREE from 'three';
import { HATS, PLAYER_CSS, MAX_PLAYERS } from './config.js';

const DEV_NAME = (id) => id === 'kb1' ? 'Keyboard' : id === 'kb2' ? 'Keyboard 2' : id.startsWith('gp') ? 'Pad ' + (+id.slice(2) + 1) : id;

export class UI {
  constructor(game) {
    this.game = game;
    this.hud = document.getElementById('hud');
    this.title = document.getElementById('title');
    this.menuEl = document.getElementById('menu');
    this.menu = null; // {player, sel}
    this.pool = [];
    this.viewEls = [];
    this.join = document.createElement('div');
    this.join.className = 'joinhint';
    this.hud.appendChild(this.join);
    this.ready = false;
    game.canvas.addEventListener('click', () => {
      if (game.players.some((p) => p.deviceId === 'kb1')) game.input.lockMouse();
    });
  }

  setReady() {
    this.ready = true;
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('press').classList.remove('hidden');
  }

  layout() {
    for (const e of this.viewEls) e.root.remove();
    this.viewEls = [];
    for (const p of this.game.players) {
      const root = document.createElement('div');
      const label = document.createElement('div'); label.className = 'vplabel';
      const hint = document.createElement('div'); hint.className = 'vphint hidden';
      const border = document.createElement('div'); border.className = 'vpborder';
      root.append(border, label, hint);
      this.hud.appendChild(root);
      this.viewEls.push({ root, label, hint, border, player: p });
    }
    this.refreshTags();
  }

  refreshTags() {
    for (const v of this.viewEls) {
      const p = v.player;
      v.label.textContent = 'P' + (p.index + 1);
      v.label.style.background = PLAYER_CSS(p.color);
      v.label.style.color = p.color === 0xffffff ? '#234' : '#fff';
      v.label.style.borderRadius = '0 0 12px 0';
    }
  }

  tag(i) {
    let t = this.pool[i];
    if (!t) { t = document.createElement('div'); t.className = 'tag'; this.hud.appendChild(t); this.pool[i] = t; }
    return t;
  }

  update(views) {
    const g = this.game, ps = g.players;
    this.join.textContent = ps.length < MAX_PLAYERS ? `Press A / Enter to join  (${ps.length}/${MAX_PLAYERS})` : '';
    this.join.classList.toggle('hidden', !this.ready || !ps.length || ps.length >= MAX_PLAYERS);
    let ti = 0;
    const v3 = new THREE.Vector3();
    ps.forEach((p, i) => {
      const [x, y, w, h] = views[i];
      const ve = this.viewEls[i];
      if (!ve) return;
      Object.assign(ve.label.style, { left: x + 'px', top: y + 'px' });
      Object.assign(ve.border.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', display: ps.length > 1 ? 'block' : 'none' });
      // contextual hint
      let hint = '';
      if (p.seat) hint = p.seat.kind === 'driver' ? (p.seat.vehicle ? 'RT gas · LT brake · Y exit' : 'Y exit') : (p.seat.hint || 'Y exit');
      else if (p.state === 'limp') hint = p.limpTimer > 0 ? 'Ouch!' : 'B / A to get up';
      else { const s = g.nearestSeat(p); if (s) hint = 'Y  ' + (s.label || 'Sit'); }
      ve.hint.textContent = hint;
      ve.hint.classList.toggle('hidden', !hint);
      Object.assign(ve.hint.style, { left: x + w / 2 + 'px', top: y + h - 40 + 'px' });
      // tags for every other player visible in this view
      const cam = p.camera.cam;
      for (const q of ps) {
        if (q === p) continue;
        const hd = q.viewPos(new THREE.Vector3(), 'head');
        v3.set(hd.x, hd.y + 0.45, hd.z).project(cam);
        if (v3.z > 1 || v3.x < -1 || v3.x > 1 || v3.y < -1 || v3.y > 1) continue;
        const dist = cam.position.distanceTo(new THREE.Vector3(hd.x, hd.y, hd.z));
        if (dist > 80) continue;
        const t = this.tag(ti++);
        t.style.display = 'block';
        t.textContent = 'P' + (q.index + 1);
        t.style.background = PLAYER_CSS(q.color);
        t.style.color = q.color === 0xffffff ? '#234' : '#fff';
        t.style.left = x + (v3.x * 0.5 + 0.5) * w + 'px';
        t.style.top = y + (-v3.y * 0.5 + 0.5) * h + 'px';
        t.style.opacity = dist > 50 ? String(1 - (dist - 50) / 30) : '1';
      }
    });
    for (let i = ti; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }

  // ---- input: joining and menu --------------------------------------------
  handleInput() {
    const g = this.game, inp = g.input;
    if (!this.ready) return;
    if (this.menu) { this.menuInput(); return; }
    // open the menu
    for (const p of g.players) {
      const d = inp.get(p.deviceId);
      if (!d) continue;
      const startPressed = p.deviceId === 'kb1' ? (d.pressed.start && inp.held().has('Escape')) : d.pressed.start;
      if (startPressed) { this.openMenu(p); return; }
    }
    const taken = new Set(g.players.map((p) => p.deviceId));
    for (const id of inp.joinPresses()) {
      if (taken.has(id)) continue;
      if (id === 'kb1' && inp.held().has('Escape')) continue;
      const p = g.addPlayer(id);
      if (p) {
        this.title.classList.add('hidden');
        if (id === 'kb1') inp.lockMouse();
        // swallow the join press so it isn't a jump
        const d = inp.get(id); if (d) d.pressed = {};
      }
    }
  }

  items() {
    const p = this.menu.player;
    return [
      { label: 'Resume', act: () => this.closeMenu() },
      { label: 'Respawn', act: () => { p.respawn(); this.closeMenu(); } },
      { label: 'Colour', value: '◀ ' + (p.colorIndex + 1) + ' ▶', adj: (d) => p.setColor(p.colorIndex + d) },
      { label: 'Hat', value: '◀ ' + HATS[p.hat] + ' ▶', adj: (d) => { p.hat = (p.hat + d + HATS.length) % HATS.length; p.buildHat(); } },
      { label: 'Resolution', value: '◀ ' + Math.round(this.game.resScale * 100) + '% ▶', adj: (d) => this.game.setResScale(this.game.resScale + d * 0.25) },
      { label: 'Shadows', value: this.game.shadows ? 'On' : 'Off', adj: () => { this.game.shadows = !this.game.shadows; }, act: () => { this.game.shadows = !this.game.shadows; } },
      { label: 'Respawn all vehicles', act: () => { for (const v of this.game.vehicles) if (!v.seats.some((s) => s.occupant)) v.respawn(); this.closeMenu(); } },
      { label: 'Leave game', act: () => { this.closeMenu(); this.game.removePlayer(p); if (!this.game.players.length) this.title.classList.remove('hidden'); } },
    ];
  }

  openMenu(p) {
    this.menu = { player: p, sel: 0 };
    this.game.paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.drawMenu();
    this.menuEl.classList.remove('hidden');
  }
  closeMenu() {
    this.menu = null;
    this.game.paused = false;
    this.menuEl.classList.add('hidden');
    if (this.game.players.some((p) => p.deviceId === 'kb1')) this.game.input.lockMouse();
  }

  drawMenu() {
    const p = this.menu.player, it = this.items();
    this.menuEl.innerHTML = `<div class="panel"><h2 style="color:${PLAYER_CSS(p.color === 0xffffff ? 0x2a62c9 : p.color)}">Player ${p.index + 1} · ${DEV_NAME(p.deviceId)}</h2>` +
      it.map((x, i) => `<div class="item ${i === this.menu.sel ? 'sel' : ''}"><span>${x.label}</span><span>${x.value || ''}</span></div>`).join('') +
      `<div class="foot">Up/down choose · left/right change · A select · B back</div></div>`;
  }

  menuInput() {
    const m = this.menu, d = this.game.input.get(m.player.deviceId);
    if (!d) { this.closeMenu(); return; }
    const pr = d.pressed, st = d.state;
    // stick navigation with repeat
    const sy = st.moveY, sx = st.moveX;
    const now = performance.now();
    let dy = 0, dx = 0;
    if (pr.dUp) dy = -1; if (pr.dDown) dy = 1; if (pr.dLeft) dx = -1; if (pr.dRight) dx = 1;
    if (!dy && !dx && (Math.abs(sy) > 0.6 || Math.abs(sx) > 0.6) && now - (m.rep || 0) > 220) {
      if (Math.abs(sy) > Math.abs(sx)) dy = sy > 0 ? -1 : 1; else dx = sx > 0 ? 1 : -1;
      m.rep = now;
    }
    if (Math.abs(sy) < 0.3 && Math.abs(sx) < 0.3) m.rep = 0;
    const it = this.items();
    if (dy) m.sel = (m.sel + dy + it.length) % it.length;
    if (dx && it[m.sel].adj) it[m.sel].adj(dx);
    if (pr.jump || (pr.interact && false)) { (it[m.sel].act || (() => it[m.sel].adj?.(1)))(); }
    else if (pr.ragdoll || pr.start || pr.back) { this.closeMenu(); return; }
    if (this.menu) this.drawMenu();
  }
}
