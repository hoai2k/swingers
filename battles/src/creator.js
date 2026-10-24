// Unit Creator (TABS-style): build custom units from body sliders, hats, outfits,
// colours, any held weapon of the base game and the packs, and a personality. The
// stats are derived (src/packs/custom.js), the cost is computed from them. Saved units
// go to localStorage and show up in setup under the Custom faction.
//
// Pad: ✥ / left stick choose and change, A select, B back, LB/RB tabs, X randomise the
// tab, Y preview in the other team colour, right stick turns the preview, Menu saves.
// The keyboard drives it through the usual P1/P2 layouts (src/input.js); the name
// editor also takes typed letters.
import { THREE, clamp, lerp } from './util.js';
import { btn, weaponLine } from './ui.js';
import { buildUnitVisual, disposeVisual, poseVisual, setExpression, TEAM_COLORS, TEAM_NAMES } from './visual.js';
import { STYLE_ANIM } from './pose.js';
import { hasAsset } from './assets.js';
import {
  catalog, BODY, RANKS, VOICES, SKINS, CLOTH, ACCENTS, BEARDS, SHIELD_OPTS, SHIELD_NAMES, MAX_CUSTOM, NAME_MAX,
  defaultRecipe, sanitize, buildDef, newId, cleanName, customRecipes, saveRecipes, loadRecipes, CUSTOM_FACTION,
} from './packs/custom.js';

const TABS = [
  { id: 'unit', name: 'Unit' },
  { id: 'body', name: 'Body' },
  { id: 'look', name: 'Look' },
  { id: 'weapon', name: 'Weapon' },
];
const COLS = 3; // unit list grid
const OSK = ['ABCDEFGHIJ', 'KLMNOPQRST', "UVWXYZ.-!'", '0123456789'];
const OSK_KEYS = [['shift', '⇧ abc'], ['space', 'Space'], ['del', '⌫ Delete'], ['random', '🎲 Random'], ['done', '✔ Done']];
const NAME_A = ['Sir', 'Big', 'Lil', 'Mad', 'Grumpy', 'Sneaky', 'Mega', 'Old', 'Brave', 'Wobbly', 'Lord', 'Tiny', 'Angry', 'Lucky'];
const NAME_B = ['Bonk', 'Wobbles', 'Biscuit', 'Turnip', 'Gus', 'Pickle', 'Noodle', 'Boris', 'Muffin', 'Tank', 'Bean', 'Spud', 'Smash', 'Pudding'];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cyc = (list, v, d) => list[(Math.max(0, list.indexOf(v)) + d + list.length) % list.length];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const swatch = (c) => (c ? `<i class="cr-sw" style="background:${c}"></i>` : '<i class="cr-sw none">∅</i>');

export function randomName() {
  for (let i = 0; i < 10; i++) { const n = `${rnd(NAME_A)} ${rnd(NAME_B)}`; if (n.length <= NAME_MAX) return n; }
  return 'Bean';
}

export class Creator {
  constructor(game) {
    this.g = game;
    this.page = 'list';
    this.sel = 0;
    this.tab = 0;
    this.row = 0;
    this.modal = null;
    this.vis = null;
    this.visKey = '';
    this.team = 0;
    this.spin = 0.6;
    this.t = 0;
    this.attackT = -1;
    this.onKey = (e) => this.typeKey(e);
  }

  // ------------------------------------------------------------- open / close
  open() {
    const g = this.g;
    loadRecipes(); // pick up anything another tab saved
    this.list = customRecipes().map((r) => ({ ...r }));
    g.state = 'creator';
    g.ui.only('creator');
    g.ui.setHelp(false);
    g.helpOn = false;
    g.zones.forEach((z) => (z.visible = false));
    g.hideGhosts?.();
    // clear the stage: the title line-up and the armies step aside
    this.hidden = [];
    for (const v of [...(g.titleUnits || []), ...g.setupVis[0], ...g.setupVis[1]]) if (v.root.visible) { v.root.visible = false; this.hidden.push(v); }
    this.page = 'list';
    this.sel = Math.min(this.sel, this.list.length);
    this.modal = null;
    this.L = g.ui.layers.creator;
    this.L.innerHTML = `<div class="cr-panel"><div class="cr-head"></div><div class="cr-tabs"></div><div class="cr-body"></div><div class="cr-stats"></div></div>
      <div class="cr-name"></div><div class="cr-hint menuhint"></div><div class="cr-modal"></div>`;
    const q = (c) => this.L.querySelector(c);
    this.el = { head: q('.cr-head'), tabs: q('.cr-tabs'), body: q('.cr-body'), stats: q('.cr-stats'), name: q('.cr-name'), hint: q('.cr-hint'), modal: q('.cr-modal') };
    // a fixed spot in the middle of the field (between the two deployment zones)
    this.at = new THREE.Vector3(0, g.terrain.height(0, 0), 0);
    addEventListener('keydown', this.onKey);
    g.input.swallow();
  }

  close() {
    const g = this.g;
    removeEventListener('keydown', this.onKey);
    this.dropVis();
    for (const v of this.hidden || []) v.root.visible = true;
    this.hidden = [];
    g.goTitle(g.titleItems().findIndex((i) => i.key === 'creator'));
  }

  dropVis() { if (this.vis) { disposeVisual(this.vis); this.vis = null; this.visKey = ''; } }

  // the recipe shown in the preview
  current() {
    if (this.page === 'edit') return this.r;
    return this.sel > 0 ? this.list[this.sel - 1] : null;
  }

  // ------------------------------------------------------------- input
  update(dt) {
    const I = this.g.input;
    for (let p = 0; p < 2; p++) {
      if (this.g.state !== 'creator') return;
      if (this.modal) this.modalInput(p);
      else if (this.page === 'list') this.listInput(p);
      else this.editInput(p);
      const rx = I.state(p).rx;
      if (Math.abs(rx) > 0.15) { this.spinHold = 1.5; this.yaw = (this.yaw || 0) + rx * dt * 3; }
    }
    if (this.g.state !== 'creator') return;
    this.updatePreview(dt);
    this.render();
  }

  listInput(p) {
    const I = this.g.input, n = this.list.length + 1;
    let s = this.sel;
    if (I.nav(p, 'right')) s = Math.min(n - 1, s + 1);
    if (I.nav(p, 'left')) s = Math.max(0, s - 1);
    if (I.nav(p, 'down')) s = Math.min(n - 1, s + COLS);
    if (I.nav(p, 'up')) s = Math.max(0, s - COLS);
    if (s !== this.sel) { this.sel = s; this.click(0.5); }
    const r = this.current();
    if (I.pressed(p, 'a')) {
      if (r) this.edit({ ...r }, false);
      else if (this.list.length >= MAX_CUSTOM) this.toast(`You can keep up to ${MAX_CUSTOM} custom units. Delete one first.`);
      else {
        const nr = defaultRecipe(randomName());
        this.edit(nr, true);
      }
      I.swallow();
      return;
    }
    if (r && I.pressed(p, 'x')) {
      if (this.list.length >= MAX_CUSTOM) this.toast(`You can keep up to ${MAX_CUSTOM} custom units.`);
      else {
        const copy = { ...r, id: newId(), name: cleanName(r.name.slice(0, NAME_MAX - 2) + ' 2') };
        this.list.splice(this.sel, 0, copy);
        this.sel++;
        this.commit(`Duplicated <b>${esc(r.name)}</b>`);
      }
    }
    if (r && I.pressed(p, 'y')) {
      this.modal = {
        title: `Delete ${esc(r.name)}?`, text: 'It disappears from every saved army too.', sel: 1,
        items: [{ label: 'Delete', key: 'yes', cls: 'danger' }, { label: 'Keep it', key: 'no' }],
        pick: (k) => {
          if (k !== 'yes') return;
          this.list = this.list.filter((x) => x.id !== r.id);
          this.sel = Math.min(this.sel, this.list.length);
          this.commit(`Deleted <b>${esc(r.name)}</b>`);
        },
      };
      this.click();
    }
    if (I.pressed(p, 'b')) { this.click(); this.close(); }
  }

  edit(r, isNew) {
    this.r = sanitize(r) || defaultRecipe(randomName());
    this.isNew = isNew;
    this.orig = JSON.stringify(this.r);
    this.page = 'edit';
    this.tab = isNew ? 1 : 0;
    this.row = 0;
    this.click();
  }

  rows() {
    const r = this.r, C = catalog();
    const W = C.byKey[r.weapon];
    const pct = (v) => `×${v.toFixed(2)}`;
    switch (TABS[this.tab].id) {
      case 'unit': return [
        { key: 'name', label: 'Name', value: `${esc(r.name)} <small>✎</small>`, note: `${btn('A')} edit`, edit: true },
        { key: 'voice', label: 'Personality', value: VOICES.find((v) => v.id === r.voice).name, note: VOICES.find((v) => v.id === r.voice).desc },
        { key: 'rank', label: 'Rank', value: RANKS.find((x) => x.id === r.rank).name, note: 'more health and damage, for more gold' },
        { key: 'save', label: this.isNew ? 'SAVE NEW UNIT' : 'SAVE CHANGES', button: true, big: true },
        { key: 'cancel', label: this.isNew ? 'Discard' : 'Discard changes', button: true },
      ];
      case 'body': return [
        { key: 'size', label: 'Size', value: pct(r.size), bar: (r.size - BODY.size.min) / (BODY.size.max - BODY.size.min) },
        { key: 'girth', label: 'Build', value: pct(r.girth), bar: (r.girth - BODY.girth.min) / (BODY.girth.max - BODY.girth.min), note: 'wider = tougher but slower' },
        { key: 'head', label: 'Head size', value: pct(r.head), bar: (r.head - BODY.head.min) / (BODY.head.max - BODY.head.min) },
        { key: 'legs', label: 'Leg length', value: pct(r.legs), bar: (r.legs - BODY.legs.min) / (BODY.legs.max - BODY.legs.min), note: 'longer = faster' },
      ];
      case 'look': return [
        { key: 'hat', label: 'Head / hat', value: C.hatName(r.hat), count: `${C.hats.indexOf(r.hat) + 1}/${C.hats.length}` },
        { key: 'top', label: 'Outfit', value: C.topName(r.top), count: `${C.tops.indexOf(r.top) + 1}/${C.tops.length}` },
        { key: 'skin', label: 'Skin', value: swatch(r.skin) },
        { key: 'legsCol', label: 'Trousers', value: swatch(r.legsCol) },
        { key: 'accent', label: 'Boots', value: swatch(r.accent) },
        { key: 'beard', label: 'Beard', value: r.beard ? swatch(r.beard) : 'None' },
      ];
      case 'weapon': return [
        { key: 'weapon', label: 'Weapon', value: W.name, count: `${C.weapons.indexOf(W) + 1}/${C.weapons.length}`, note: `${W.cat}${W.donorName ? ` · as the ${esc(W.donorName)} uses it` : ''}` },
        { key: 'shield', label: 'Shield', value: !W.shieldOk ? '<small>— not with this weapon</small>' : r.second ? '<small>— hands full</small>' : r.shield ? SHIELD_NAMES[r.shield] : 'None', off: !W.shieldOk || !!r.second },
        { key: 'second', label: 'Second weapon', value: !W.dualOk ? '<small>— not with this weapon</small>' : r.second ? C.byKey[r.second].name : 'None', off: !W.dualOk, note: W.dualOk ? 'one in each hand (no shield)' : '' },
      ];
    }
    return [];
  }

  change(key, d) {
    const r = this.r, C = catalog();
    const step = (k) => { const b = BODY[k]; r[k] = +clamp(Math.round((r[k] + d * b.step) / b.step) * b.step, b.min, b.max).toFixed(2); };
    switch (key) {
      case 'size': case 'girth': case 'head': case 'legs': step(key); break;
      case 'voice': r.voice = cyc(VOICES.map((v) => v.id), r.voice, d); break;
      case 'rank': r.rank = RANKS[clamp(RANKS.findIndex((x) => x.id === r.rank) + d, 0, RANKS.length - 1)].id; break;
      case 'hat': r.hat = cyc(C.hats, r.hat, d); break;
      case 'top': r.top = cyc(C.tops, r.top, d); break;
      case 'skin': r.skin = cyc(SKINS, r.skin, d); break;
      case 'legsCol': r.legsCol = cyc(CLOTH, r.legsCol, d); break;
      case 'accent': r.accent = cyc(ACCENTS, r.accent, d); break;
      case 'beard': r.beard = cyc(BEARDS, r.beard, d); break;
      case 'weapon': {
        r.weapon = cyc(C.weapons.map((w) => w.key), r.weapon, d);
        const W = C.byKey[r.weapon];
        if (!W.shieldOk) r.shield = null;
        if (!W.dualOk) r.second = null;
        break;
      }
      case 'shield': if (C.byKey[r.weapon].shieldOk) { r.shield = cyc(SHIELD_OPTS, r.shield, d); if (r.shield) r.second = null; } else return false; break;
      case 'second': if (C.byKey[r.weapon].dualOk) { r.second = cyc([null, ...C.seconds.map((w) => w.key)], r.second, d); if (r.second) r.shield = null; } else return false; break;
      default: return false;
    }
    this.click(0.5);
    return true;
  }

  randomiseTab() {
    const r = this.r, C = catalog();
    const pickNum = (k) => { const b = BODY[k]; r[k] = +(Math.round((b.min + Math.random() * (b.max - b.min)) / b.step) * b.step).toFixed(2); };
    switch (TABS[this.tab].id) {
      case 'unit': r.voice = rnd(VOICES).id; r.name = randomName(); break;
      case 'body': for (const k of ['girth', 'head', 'legs']) pickNum(k); r.size = +(0.7 + Math.random() * 0.7).toFixed(2); break;
      case 'look': r.hat = rnd(C.hats); r.top = rnd(C.tops); r.skin = rnd(SKINS); r.legsCol = rnd(CLOTH); r.accent = rnd(ACCENTS); r.beard = Math.random() < 0.6 ? null : rnd(BEARDS); break;
      case 'weapon': {
        const W = rnd(C.weapons);
        r.weapon = W.key; r.shield = null; r.second = null;
        if (W.shieldOk && Math.random() < 0.35) r.shield = rnd(SHIELD_OPTS.slice(1));
        else if (W.dualOk && Math.random() < 0.3) r.second = rnd(C.seconds).key;
        break;
      }
    }
    this.click();
  }

  editInput(p) {
    const I = this.g.input;
    if (I.pressed(p, 'rb')) { this.tab = (this.tab + 1) % TABS.length; this.row = 0; this.click(); }
    if (I.pressed(p, 'lb')) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.row = 0; this.click(); }
    const rows = this.rows();
    if (I.nav(p, 'down')) { this.row = (this.row + 1) % rows.length; this.click(0.4); }
    if (I.nav(p, 'up')) { this.row = (this.row + rows.length - 1) % rows.length; this.click(0.4); }
    this.row = clamp(this.row, 0, rows.length - 1);
    const it = rows[this.row];
    if (I.nav(p, 'right')) this.change(it.key, 1);
    if (I.nav(p, 'left')) this.change(it.key, -1);
    if (I.pressed(p, 'a')) {
      if (it.key === 'name') this.openName();
      else if (it.key === 'save') { this.save(); return; }
      else if (it.key === 'cancel') { this.leaveEdit(); return; }
      else this.change(it.key, 1);
      I.swallow();
    }
    if (I.pressed(p, 'x')) this.randomiseTab();
    if (I.pressed(p, 'y')) { this.team = 1 - this.team; this.click(); }
    if (I.pressed(p, 'start')) { this.save(); return; }
    if (I.pressed(p, 'b')) {
      if (JSON.stringify(this.r) === this.orig && !this.isNew) this.leaveEdit();
      else {
        this.modal = {
          title: this.isNew ? 'Save this new unit?' : 'Save your changes?', sel: 0,
          items: [{ label: 'Save', key: 'save' }, { label: this.isNew ? 'Discard it' : 'Discard changes', key: 'drop', cls: 'danger' }, { label: 'Keep editing', key: 'keep' }],
          pick: (k) => { if (k === 'save') this.save(); else if (k === 'drop') this.leaveEdit(); },
        };
        this.click();
      }
      I.swallow();
    }
  }

  leaveEdit() {
    this.page = 'list';
    const i = this.list.findIndex((x) => x.id === this.r.id);
    this.sel = i >= 0 ? i + 1 : Math.min(this.sel, this.list.length);
    this.r = null;
    this.click();
    this.g.input.swallow();
  }

  save() {
    const r = sanitize(this.r);
    if (!r) return;
    const i = this.list.findIndex((x) => x.id === r.id);
    if (i >= 0) this.list[i] = r;
    else if (this.list.length >= MAX_CUSTOM) { this.toast(`You can keep up to ${MAX_CUSTOM} custom units.`); return; }
    else this.list.push(r);
    this.r = r;
    this.commit(`Saved <b>${esc(r.name)}</b> · <span class="coin"></span>${fmt(buildDef(r).cost)} <small>— find it under <b>Custom</b> in army setup</small>`);
    this.leaveEdit();
    this.g.audio.play('place', null, 0.8, 1.2);
  }

  // store the list and re-register the units (game.customChanged refreshes caches)
  commit(msg) {
    saveRecipes(this.list);
    this.list = customRecipes().map((r) => ({ ...r }));
    this.g.customChanged();
    if (msg) this.toast(msg, 2.4);
  }

  // ------------------------------------------------------------- modals
  modalInput(p) {
    const I = this.g.input, m = this.modal;
    if (m.kind === 'name') return this.nameInput(p);
    if (I.nav(p, 'down')) { m.sel = (m.sel + 1) % m.items.length; this.click(0.4); }
    if (I.nav(p, 'up')) { m.sel = (m.sel + m.items.length - 1) % m.items.length; this.click(0.4); }
    if (I.pressed(p, 'a')) { this.modal = null; this.click(); m.pick(m.items[m.sel].key); I.swallow(); return; }
    if (I.pressed(p, 'b')) { this.modal = null; this.click(); I.swallow(); }
  }

  openName() {
    this.modal = { kind: 'name', text: this.r.name, row: 0, col: 0, lower: false };
    this.click();
  }

  oskRows(m) {
    const rows = OSK.map((s) => [...(m.lower ? s.toLowerCase() : s)].map((c) => [c, c]));
    rows.push(OSK_KEYS);
    return rows;
  }

  nameKey(k) {
    const m = this.modal;
    if (k === 'done') { this.r.name = cleanName(m.text) || this.r.name; this.modal = null; this.click(); this.g.input.swallow(); return; }
    if (k === 'shift') m.lower = !m.lower;
    else if (k === 'space') m.text = (m.text + ' ').slice(0, NAME_MAX);
    else if (k === 'del') m.text = m.text.slice(0, -1);
    else if (k === 'random') m.text = randomName();
    else if (k.length === 1 && m.text.length < NAME_MAX) {
      m.text += k;
      if (m.text.length === 1 && !m.lower) m.lower = true; // Capitalised, then lower case
    }
    this.click(0.5);
  }

  nameInput(p) {
    const I = this.g.input, m = this.modal, rows = this.oskRows(m);
    if (I.nav(p, 'down')) m.row = (m.row + 1) % rows.length;
    if (I.nav(p, 'up')) m.row = (m.row + rows.length - 1) % rows.length;
    const n = rows[m.row].length;
    if (I.nav(p, 'right')) m.col = (m.col + 1) % n;
    if (I.nav(p, 'left')) m.col = (m.col + n - 1) % n;
    m.col = clamp(m.col, 0, n - 1);
    if (I.pressed(p, 'a')) { this.nameKey(rows[m.row][m.col][0]); I.swallow(); return; }
    if (I.pressed(p, 'x')) this.nameKey('del');
    if (I.pressed(p, 'y')) this.nameKey('space');
    if (I.pressed(p, 'start')) { this.nameKey('done'); return; }
    if (I.pressed(p, 'b')) { this.modal = null; this.click(); I.swallow(); }
  }

  // physical keyboard typing in the name editor (the key is then hidden from the pad
  // layouts, so typing "s" doesn't also move the cursor)
  typeKey(e) {
    const m = this.modal;
    if (this.g.state !== 'creator' || !m || m.kind !== 'name') return;
    let used = true;
    if (e.key === 'Enter' || e.key === 'Escape') this.nameKey('done');
    else if (e.key === 'Backspace') this.nameKey('del');
    else if (e.key.length === 1 && cleanName(e.key.replace(' ', 'x'))) {
      if (m.text.length < NAME_MAX) { m.text += e.key; this.click(0.4); }
    } else used = false;
    if (used) {
      e.preventDefault();
      this.g.input.keys.delete(e.code);
    }
  }

  // ------------------------------------------------------------- preview
  updatePreview(dt) {
    const g = this.g, r = this.current();
    this.t += dt;
    const key = r ? JSON.stringify(r) + this.team : '';
    if (key !== this.visKey) {
      this.dropVis();
      this.visKey = key;
      this.def = null;
      if (r) {
        try {
          this.def = buildDef(r);
          this.vis = buildUnitVisual(this.def, this.team, {});
          this.vis.st = { phase: 0, amp: 0, style: this.def.weapon.style, attack: null, attackT: 0, headPitch: 0, headYaw: 0, mode: this.def.personality.idle === 'play' ? 'play' : 'normal', t: 0, bob: 0 };
          g.scene.add(this.vis.root);
          this.attackT = -0.8;
        } catch (e) { console.warn('creator preview', e); this.dropVis(); this.visKey = key; }
      }
    }
    const P = this.at;
    const hgt = this.vis ? this.vis.skel.height : 2;
    // turn slowly (the right stick takes over for a moment)
    if (this.spinHold > 0) this.spinHold -= dt; else this.yaw = (this.yaw || 0) + dt * this.spin;
    if (this.vis) {
      const st = this.vis.st, def = this.def;
      st.t += dt;
      // show the attack every few seconds
      this.attackT += dt / 1.1;
      if (this.attackT >= 2.4) this.attackT = -0.2;
      const a = this.attackT;
      st.attack = a >= 0 && a < 1 ? (def.weapon.anim || STYLE_ANIM[def.weapon.style] || 'punch') : null;
      st.attackT = clamp(a, 0, 1);
      const idle = def.personality.idle;
      st.bob = idle === 'bounce' || idle === 'hop' ? Math.abs(Math.sin(st.t * (idle === 'hop' ? 7 : 4))) * 0.05 * this.vis.skel.scale : Math.sin(st.t * 1.7) * 0.012;
      st.crouch = idle === 'brace' ? 0.15 : 0;
      st.lean = idle === 'regal' ? -0.1 : idle === 'lean' ? 0.1 : 0;
      st.headYaw = Math.sin(st.t * 0.7) * 0.3;
      poseVisual(this.vis, P.x, P.y, P.z, this.yaw, st);
      setExpression(this.vis, st.attack ? 1 : 0);
    }
    // camera: the unit stands in the right part of the screen, beside the panel
    const rig = g.rigs[0];
    const D = Math.max(2.8, hgt * 1.3 + 1.3);
    this.camD = this.camD ? lerp(this.camD, D, Math.min(1, dt * 4)) : D;
    const aspect = innerWidth / Math.max(1, innerHeight);
    const off = 0.42 * this.camD * Math.tan((31 * Math.PI) / 180) * aspect * (innerWidth < 900 ? 0 : 1);
    const cy = P.y + hgt * 0.52;
    rig.set(P.x - off, cy + this.camD * 0.12, P.z + this.camD, Math.PI, 0);
    rig.lookAtPoint(P.x - off, cy, P.z);
    rig.zoom = 0;
    rig.apply();
  }

  // ------------------------------------------------------------- DOM
  render() {
    const e = this.el, ui = this.g.ui;
    const r = this.current();
    const n = this.list.length;
    const ficon = hasAsset('assets/ui/faction-custom.png') ? '<img class="ficon" src="assets/ui/faction-custom.png" alt="">' : '';
    ui.setText(e.head, `${ficon}UNIT CREATOR <small>${n} / ${MAX_CUSTOM} saved</small>`);
    if (this.page === 'list') {
      ui.setText(e.tabs, '');
      const cards = [`<div class="cr-card new ${this.sel === 0 ? 'sel' : ''}"><b>＋</b><span>New unit</span></div>`];
      this.list.forEach((u, i) => {
        let cost = '';
        try { cost = fmt(buildDef(u).cost); } catch { cost = '?'; }
        cards.push(`<div class="cr-card ${this.sel === i + 1 ? 'sel' : ''}"><img src="${ui.portraits[u.id + ':0'] || ''}" alt=""><span>${esc(u.name)}</span><small><span class="coin"></span>${cost}</small></div>`);
      });
      const empty = n ? '' : `<div class="cr-empty">${hasAsset('assets/ui/creator-empty.png') ? '<img src="assets/ui/creator-empty.png" alt="">' : ''}<p>No custom units yet. Make one: pick a body, a look and any weapon in the game. The gold cost works itself out.</p></div>`;
      ui.setText(e.body, `<div class="cr-grid">${cards.join('')}</div>${empty}`);
      const selCard = e.body.querySelector('.cr-card.sel');
      if (selCard && selCard !== this.lastSel) { selCard.scrollIntoView?.({ block: 'nearest' }); this.lastSel = selCard; }
      ui.setText(e.hint, `${btn('dpad')} choose &nbsp; ${btn('A')} ${r ? 'edit' : 'create'}${r ? ` &nbsp; ${btn('X')} duplicate &nbsp; ${btn('Y')} delete` : ''} &nbsp; ${btn('RS')} turn &nbsp; ${btn('B')} back`);
    } else {
      ui.setText(e.tabs, `${btn('LB')}${TABS.map((t, i) => `<span class="cr-tab ${i === this.tab ? 'on' : ''}">${t.name}</span>`).join('')}${btn('RB')}`);
      const rows = this.rows();
      ui.setText(e.body, `<div class="cr-rows">${rows.map((it, i) => {
        const sel = i === this.row;
        if (it.button) return `<div class="mi cr-row act ${sel ? 'sel' : ''} ${it.big ? 'big' : ''}"><span class="ml">${it.label}</span>${it.value ? `<span class="mv">${it.value}</span>` : ''}</div>`;
        return `<div class="mi cr-row ${sel ? 'sel' : ''} ${it.off ? 'off' : ''}"><span class="ml">${it.label}${it.note ? `<small class="cr-note">${it.note}</small>` : ''}</span>
          <span class="mv">${sel && !it.off && !it.edit ? '◀ ' : ''}${it.value}${sel && !it.off && !it.edit ? ' ▶' : ''}${it.count ? `<small class="cr-count">${it.count}</small>` : ''}</span>${it.bar !== undefined ? `<i class="cr-bar"><b style="width:${(it.bar * 100).toFixed(0)}%"></b></i>` : ''}</div>`;
      }).join('')}</div>`);
      ui.setText(e.hint, `${btn('LB')}${btn('RB')} tabs &nbsp; ${btn('dpad')} choose / change &nbsp; ${btn('A')} select &nbsp; ${btn('X')} randomise tab &nbsp; ${btn('Y')} ${TEAM_NAMES[1 - this.team]} colours &nbsp; ${btn('Start')} save &nbsp; ${btn('B')} back`);
    }
    // live stats of the unit on show
    const d = this.def;
    if (d && r) {
      const w = d.weapon;
      const dmg = w.kind === 'heal' ? `+${w.amount} heal` : `${w.damage} dmg`;
      ui.setText(e.stats, `<div class="cr-cost"><span class="coin"></span>${fmt(d.cost)}</div>
        <div class="cr-st"><span title="health">❤ ${fmt(d.hp)}</span><span title="damage">⚔ ${dmg} <small>/${(+w.cooldown || 1).toFixed(1)}s</small></span><span title="speed">👟 ${d.speed.toFixed(1)}</span></div>
        <div class="cr-weap">${weaponLine(d)}</div>`);
      ui.setText(e.name, `<b style="--tc:${TEAM_COLORS[this.team]}">${esc(d.name)}</b><small>${esc(d.desc)}</small>`);
    } else {
      ui.setText(e.stats, '<div class="cr-weap">Stats are worked out from the body, rank and weapon you pick, and the gold cost follows from the stats.</div>');
      ui.setText(e.name, '');
    }
    // modal
    const m = this.modal;
    e.modal.style.display = m ? '' : 'none';
    if (m && m.kind === 'name') {
      const rows = this.oskRows(m);
      ui.setText(e.modal, `<div class="mbox cr-osk"><h3>Name your unit</h3><div class="cr-nametext">${esc(m.text)}<i class="caret"></i><small>${m.text.length}/${NAME_MAX}</small></div>
        ${rows.map((row, ri) => `<div class="cr-oskrow">${row.map(([k, l], ci) => `<span class="cr-key ${k.length > 1 ? 'wide' : ''} ${ri === m.row && ci === m.col ? 'sel' : ''}">${esc(l)}</span>`).join('')}</div>`).join('')}
        <div class="mhint">${btn('dpad')} choose &nbsp; ${btn('A')} type &nbsp; ${btn('X')} delete &nbsp; ${btn('Y')} space &nbsp; ${btn('Start')} done &nbsp; ${btn('B')} cancel &nbsp;·&nbsp; or type on the keyboard</div></div>`);
    } else if (m) {
      ui.setText(e.modal, `<div class="mbox"><h3>${m.title}</h3>${m.text ? `<p>${m.text}</p>` : ''}${ui.menuHtml(m.items, m.sel)}<div class="mhint">${btn('dpad')} choose &nbsp; ${btn('A')} select &nbsp; ${btn('B')} back</div></div>`);
    }
  }

  click(v = 0.7) { this.g.audio.play('click', null, v); }
  toast(msg, t = 1.8) { this.g.ui.toast(msg, t); }
}

export { CUSTOM_FACTION };
