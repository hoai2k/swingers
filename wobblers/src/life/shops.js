// Shop counters (Y at the till, see world/estate.js) open a ShopPanel in that
// player's own view, like the pause menu: stick / D-pad (W/S, arrows) choose,
// A / Enter buy or use, B / Esc leave. Every row shows its price, whether it's
// already owned, and greys out what the wallet can't afford.
//
//   clothes  hats, faces, trousers that are only sold here (unlocks.js SHOP_COSMETICS);
//            the highlighted item is tried on, and bought ones unlock for everybody
//   pets     buy a pet, or swap between the ones you have (life/pets.js)
//   homes    the estate agent (world/estate.js homes)
//   cars     vehicles for the phone (game.unlockedVehicles; the phone checks game.vehicleLock)
import { PLAYER_CSS, HATS } from '../config.js';
import { promptRow, deviceKind } from '../glyphs.js';
import { injectCSS } from '../map.js';
import { SHOP_COSMETICS } from '../unlocks.js';
import { devicePrefs } from '../settings.js';
import { FACES, PANTS, HAT_NAMES, setHat, setFace, setPants, saveLook, restoreLook, rewardName } from '../cosmetics.js';
import { callVehicle, CALLABLE } from '../phone.js';
import { life, markBought, isBought, petsOf, saveLife } from './state.js';
import { PET_KINDS, PET_ORDER } from './pets.js';

// Vehicles the dealer sells (phone ids from phone.js CALLABLE); every other phone vehicle is free.
export const VEHICLE_PRICES = { icecream: 200, bus: 250, sports: 300, police: 350, firetruck: 450, heli: 800 };

export function buildVehicleLocks(game) {
  game.unlockedVehicles = new Set(Object.keys(VEHICLE_PRICES).filter((id) => isBought('veh:' + id)));
  // phone.js hook: null when callable, otherwise the reason it isn't
  game.vehicleLock = (id) => (VEHICLE_PRICES[id] && !game.unlockedVehicles.has(id) ? `Buy it at the CAR DEALER (${VEHICLE_PRICES[id]} coins)` : null);
}
export const isVehicleLocked = (game, id) => !!game.vehicleLock?.(id);

const SHOP_NAMES = { clothes: 'Clothes shop', pets: 'Pet shop', homes: 'Estate agent', cars: 'Car dealer' };
const SHOP_SUB = { clothes: 'try it on, buy it, everyone can wear it', pets: 'a friend who follows you everywhere', homes: 'your home is where you respawn', cars: 'bought vehicles appear in your phone' };

const CSS = `
.ppanel.shop { justify-content: flex-start; background: linear-gradient(90deg, rgba(20,50,110,.5), rgba(20,50,110,0) 62%); }
.ppanel.shop.centre { justify-content: center; background: rgba(20,50,110,.42); }
.ppanel.shop .card { transform-origin: 0 50%; margin-left: calc(18px * var(--s, 1)); min-width: 340px; max-width: 400px; }
.ppanel.shop.centre .card { transform-origin: 50% 50%; margin-left: 0; }
.shop .wallet { display: flex; justify-content: center; align-items: center; gap: 6px; font-weight: 900; font-size: 18px; margin: -4px 0 4px; color: #b07a00; }
.shop .ssub { text-align: center; font-size: 12px; font-weight: 700; opacity: .7; margin: -6px 0 6px; }
.shop .slist { height: 330px; overflow: hidden; position: relative; }
.shop .sin { transition: transform .12s; }
.shop .item { margin: 5px 0; padding: 7px 12px; gap: 10px; flex-wrap: nowrap; font-size: 15px; }
.shop .item .nm { display: flex; flex-direction: column; line-height: 1.1; }
.shop .item .nm small { font-size: 11px; font-weight: 700; opacity: .7; }
.shop .item .tag { font-size: 11px; font-weight: 900; border-radius: 8px; padding: 2px 7px; background: #e4ecf8; color: #345; white-space: nowrap; }
.shop .item .price { display: inline-flex; align-items: center; gap: 4px; font-weight: 900; white-space: nowrap; }
.shop .item.poor .price { color: #d04040; }
.shop .item.sel.poor .price { color: #ffd0d0; }
.shop .item.owned .tag { background: #3cb043; color: #fff; }
.shop .item.sel .tag { background: rgba(255,255,255,.25); color: #fff; }
.shop .item.taken { opacity: .6; }
.shop .scat { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; opacity: .55; margin: 8px 4px 0; }
.shop .smsg { min-height: 20px; text-align: center; font-weight: 800; font-size: 13px; color: #c0392b; margin-top: 4px; }
.shop .smsg.ok { color: #2f9a36; }
.shop .card.shake { animation: phoneshake .35s; }
.shop .dot { width: 14px; height: 14px; border-radius: 50%; flex: none; box-shadow: inset 0 -2px 0 rgba(0,0,0,.2); }
`;
let cssDone = false;
const textCol = (c) => (c === 0xffffff || c === 0xffc233 || c === 0x3fe0d0) ? '#234' : '#fff';
const accent = (c) => PLAYER_CSS(c === 0xffffff ? 0x2a62c9 : c);
const coin = '<i class="coinic"></i>';

// ---- item lists -----------------------------------------------------------
function clothesItems(game, p) {
  const saved = devicePrefs(p.deviceId).look || {};
  return SHOP_COSMETICS.map(([key, price]) => {
    const [type, id] = key.split(':');
    const idx = type === 'hat' ? HATS.indexOf(id) : type === 'face' ? FACES.indexOf(id) : PANTS.findIndex((q) => q.name === id);
    const col = type === 'pants' ? PANTS[idx]?.color : null;
    const name = type === 'hat' ? (HAT_NAMES[id] || id) : rewardName(key).replace(/^./, (c) => c.toUpperCase());
    const wearing = (type === 'hat' && saved.hat === idx) || (type === 'face' && saved.face === idx) || (type === 'pants' && saved.pants === idx);
    return {
      cat: { hat: 'Hats', face: 'Faces', pants: 'Trousers' }[type], key, name, price, dot: col,
      owned: isBought(key), tag: isBought(key) ? (wearing ? 'Wearing' : 'Owned') : null,
      apply: () => { if (idx < 0) return; if (type === 'hat') setHat(p, idx); else if (type === 'face') setFace(p, idx); else setPants(p, idx); },
      act(panel) {
        if (!isBought(key)) {
          if (!game.wallet.spend(price, p, name)) return panel.fail(`Not enough coins: ${name} costs ${price}`);
          markBought(key);
          game.audio?.play('buy');
          game.ui.toast(`P${p.index + 1} bought <b>${name}</b>! <small>everyone can wear it now</small>`, p.color);
        }
        this.apply(); saveLook(p);
        panel.ok(`Wearing the ${name}`);
      },
    };
  });
}

function petItems(game, p) {
  const rec = petsOf(p.deviceId);
  const items = PET_ORDER.map((kind) => {
    const d = PET_KINDS[kind], owned = rec.owned.includes(kind), active = rec.active === kind;
    return {
      cat: 'Pets', name: `${d.name} <small>${d.pet} · ${d.desc}</small>`, plain: d.name, price: d.price, owned, tag: active ? 'With you' : owned ? 'Yours' : null, pet: kind,
      act(panel) {
        if (!owned) {
          if (!game.wallet.spend(d.price, p, d.name)) return panel.fail(`Not enough coins: a ${d.name.toLowerCase()} costs ${d.price}`);
          rec.owned.push(kind);
          game.audio?.play('buy');
          game.ui.toast(`P${p.index + 1} adopted <b>${d.pet}</b> the ${d.name.toLowerCase()}!`, p.color);
        }
        if (active) { game.pets?.call(p); return panel.ok(`${d.pet} is right here!`); }
        rec.active = kind; saveLife(); game.pets?.sync();
        game.pets?.of(p)?.say(2);
        panel.ok(`${d.pet} is coming with you`);
      },
    };
  });
  if (rec.owned.length) items.push({ cat: 'Pets', name: 'Leave my pet at home', price: 0, owned: true, tag: rec.active ? null : 'Home', act(panel) { rec.active = null; saveLife(); game.pets?.sync(); panel.ok('Your pet is napping at home'); } });
  return items;
}

function homeItems(game, p) {
  const H = game.homes;
  if (!H) return [];
  return H.list.map((h) => {
    const owner = H.ownerOf(h.id), mine = owner === p.deviceId;
    const op = owner && game.players.find((q) => q.deviceId === owner);
    return {
      cat: 'Homes for sale', name: `${h.name} <small>${h.note}</small>`, plain: h.name, price: h.price, owned: mine,
      tag: mine ? 'Your home' : owner ? (op ? `P${op.index + 1}'s home` : 'Sold') : null, taken: owner && !mine,
      act(panel) {
        if (mine) { H.goHome(p); return panel.close(); }
        if (owner) return panel.fail(op ? `That's P${op.index + 1}'s home` : 'Someone already lives there');
        const res = H.buy(p, h.id);
        if (!res.ok) return panel.fail(res.msg);
        panel.ok(`Welcome home! You'll respawn at ${h.name}`);
      },
    };
  });
}

function carItems(game, p) {
  return Object.entries(VEHICLE_PRICES).map(([id, price]) => {
    const c = CALLABLE.find((q) => q.id === id);
    if (!c) return null;
    const owned = game.unlockedVehicles.has(id);
    return {
      cat: 'Vehicles', name: `${c.name} <small>${owned ? 'A: call it now' : 'then call it with the phone'}</small>`, plain: c.name, price, owned, tag: owned ? 'In your phone' : null,
      act(panel) {
        if (!owned) {
          if (!game.wallet.spend(price, p, c.name)) return panel.fail(`Not enough coins: the ${c.name.toLowerCase()} costs ${price}`);
          markBought('veh:' + id); game.unlockedVehicles.add(id);
          game.audio?.play('buy');
          game.ui.toast(`P${p.index + 1} bought the <b>${c.name}</b>! <small>call it from the phone</small>`, p.color);
          return panel.ok(`${c.name} added to everyone's phone`);
        }
        const r = callVehicle(game, p, c);
        if (r.ok) { game.ui.toast(`${c.name} on its way!`, p.color); panel.close(); } else panel.fail(r.msg);
      },
    };
  }).filter(Boolean);
}

const LISTS = { clothes: clothesItems, pets: petItems, homes: homeItems, cars: carItems };

// ---- the panel ----------------------------------------------------------------
export class ShopPanel {
  constructor(ui, player, shop) {
    if (!cssDone) { injectCSS(CSS); cssDone = true; }
    this.ui = ui; this.p = player; this.shop = shop; this.kind = 'shop'; this.sel = 0;
    this.faceCam = shop === 'clothes'; // ui.update swings the camera round like the customiser
    this.t0 = performance.now();
    this.msg = ''; this.msgOk = false;
    this.el = document.createElement('div');
    this.el.className = 'ppanel shop' + (this.faceCam ? '' : ' centre');
    ui.hud.appendChild(this.el);
    this.el.addEventListener('pointermove', (e) => { const it = e.target.closest?.('[data-i]'); if (it && +it.dataset.i !== this.sel) { this.sel = +it.dataset.i; this.changed(); } });
    this.el.addEventListener('click', (e) => { const it = e.target.closest?.('[data-i]'); if (it) { this.sel = +it.dataset.i; this.buy(); } });
    this.el.addEventListener('wheel', (e) => { this.move(e.deltaY > 0 ? 1 : -1); e.preventDefault(); }, { passive: false });
    if (shop === 'clothes') saveLook(player); // what to go back to after trying things on
    ui.game.audio?.play('uiOpen');
    this.changed();
  }
  items() { return LISTS[this.shop](this.ui.game, this.p); }
  remove() {
    this.el.remove();
    if (this.shop === 'clothes') restoreLook(this.p); // take off anything only tried on
  }
  place(rect) {
    const [x, y, w, h] = rect;
    const s = this.faceCam ? Math.max(0.38, Math.min(1, w * 0.45 / 420, h / 600)) : Math.max(0.4, Math.min(1, w / 520, h / 600));
    Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    this.el.style.setProperty('--s', s.toFixed(3));
  }
  changed() {
    const it = this.items()[this.sel];
    if (this.shop === 'clothes') { restoreLook(this.p); it?.apply?.(); }
    this.draw();
  }
  move(d) {
    const N = this.items().length;
    if (!N) return;
    this.sel = (this.sel + d + N) % N; this.msg = '';
    this.ui.sfx('uiMove');
    this.changed();
  }
  ok(m) { this.msg = m; this.msgOk = true; this.draw(); }
  fail(m) {
    this.msg = m; this.msgOk = false;
    this.draw();
    const c = this.el.querySelector('.card');
    c?.classList.remove('shake'); void c?.offsetWidth; c?.classList.add('shake');
  }
  close() { this.ui.sfx('uiBack'); this.ui.closePanel(this.p); }
  buy() { const it = this.items()[this.sel]; if (it) { this.ui.sfx('uiSelect'); it.act(this); if (this.ui.panels.get(this.p) === this) this.draw(); } }
  input(n) {
    if (performance.now() - this.t0 < 250) return;
    if (n.back || (n.start && this.p.deviceId !== 'kb1')) { this.close(); return; }
    if (n.up || n.left) this.move(-1);
    if (n.down || n.right) this.move(1);
    if (n.ok) this.buy();
  }
  draw() {
    const p = this.p, k = deviceKind(p.deviceId), its = this.items(), g = this.ui.game;
    let cat = '', rows = '';
    its.forEach((it, i) => {
      if (it.cat !== cat) { cat = it.cat; if (its.some((q) => q.cat !== its[0].cat)) rows += `<div class="scat">${cat}</div>`; }
      const poor = !it.owned && it.price > life.coins;
      const right = it.tag ? `<span class="tag">${it.tag}</span>` : it.price ? `<span class="price">${coin}${it.price}</span>` : '';
      const dot = it.dot != null ? `<i class="dot" style="background:${PLAYER_CSS(it.dot)}"></i>` : '';
      rows += `<div class="item ${i === this.sel ? 'sel' : ''} ${poor ? 'poor' : ''} ${it.owned ? 'owned' : ''} ${it.taken ? 'taken' : ''}" data-i="${i}"><span class="nm">${dot ? `<span style="display:flex;gap:8px;align-items:center">${dot}${it.name}</span>` : it.name}</span>${right}</div>`;
    });
    if (!its.length) rows = '<div class="item">Nothing for sale here yet</div>';
    const per = 44, vis = 7.4, N = its.length + (its.some((q) => q.cat !== its[0]?.cat) ? 3 : 0);
    const off = Math.max(0, Math.min(N - vis, this.sel + 1 - 3)) * per;
    const it = its[this.sel];
    const act = !it ? 'Buy' : it.owned ? (this.shop === 'clothes' ? 'Wear' : this.shop === 'pets' ? (it.tag === 'With you' ? 'Call' : 'Choose') : this.shop === 'homes' ? 'Go home' : this.shop === 'cars' ? 'Call it' : 'Use') : it.taken ? 'Sold' : 'Buy';
    this.el.innerHTML = `<div class="card" style="--acc:${accent(p.color)}">
      <div class="phead" style="background:${accent(p.color)};color:${textCol(p.color === 0xffffff ? 0x2a62c9 : p.color)}">Player ${p.index + 1}<small>${SHOP_NAMES[this.shop]}</small></div>
      <h2>${SHOP_NAMES[this.shop]}</h2><div class="ssub">${SHOP_SUB[this.shop]}</div>
      <div class="wallet">${coin}${life.coins.toLocaleString('en-US')} <small style="font-size:11px;opacity:.7">team coins</small></div>
      <div class="slist"><div class="sin" style="transform:translateY(${-off}px)">${rows}</div></div>
      <div class="smsg ${this.msgOk ? 'ok' : ''}">${this.msg}</div>
      <div class="foot">${promptRow([['LS', 'Choose'], ['A', act], ['B', 'Leave']], k)}</div></div>`;
    void g;
  }
}
