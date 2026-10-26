// Custom units made in the Unit Creator (src/creator.js). A saved unit is a small
// *recipe* (body sliders, look, weapon choice, personality, name); the unit definition
// and its stats are derived from it every time it is loaded, so balance changes reach
// old saves and nothing in storage can set its own hp, damage or cost.
//
// Registration: this pack adds the Custom faction at import time. The units
// themselves are registered by syncCustomUnits() (game boot, and after every save /
// delete in the creator) through units.js's setFactionUnits() runtime hook.
//
// Cost is calibrated against the existing roster (see costOf / rawValue below).
import { register } from '../ext.js';
import { ITEMS } from '../items.js';
import { UNITS, setFactionUnits } from '../units.js';

export const CUSTOM_FACTION = { id: 'custom', name: 'Custom', color: '#ffb84a' };
register({ factions: [CUSTOM_FACTION] });

export const STORE_KEY = 'wobbly-battles.custom.v1';
export const MAX_CUSTOM = 24;
export const NAME_MAX = 16;
const NAME_OK = /[^A-Za-z0-9 '!.\-]/g;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (x, a, b, d) => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, a, b) : d);

// ---------------------------------------------------------------- body + rank
export const BODY = {
  size: { min: 0.6, max: 2.2, step: 0.05, def: 1 },
  girth: { min: 0.8, max: 1.35, step: 0.05, def: 1 },
  head: { min: 0.8, max: 1.4, step: 0.05, def: 1 },
  legs: { min: 0.75, max: 1.3, step: 0.05, def: 1 },
};
// Rank multiplies hp and damage (the cost follows, superlinearly)
export const RANKS = [
  { id: 'recruit', name: 'Recruit', hp: 0.6, dmg: 0.8 },
  { id: 'soldier', name: 'Soldier', hp: 1, dmg: 1 },
  { id: 'veteran', name: 'Veteran', hp: 1.8, dmg: 1.25 },
  { id: 'elite', name: 'Elite', hp: 3, dmg: 1.6 },
  { id: 'champion', name: 'Champion', hp: 5, dmg: 2 },
  { id: 'hero', name: 'Hero', hp: 8, dmg: 2.6 },
  { id: 'legend', name: 'Legend', hp: 13, dmg: 3.3 },
];

// ---------------------------------------------------------------- personality presets
// face: 0 regular, 1 brute, 2 cute (visual.js FACE_VARIANTS)
export const VOICES = [
  { id: 'soldier', name: 'Soldier', desc: 'Steady. Shouts “charge!”', aggro: 0.9, bravery: 0.15, voice: 1.0, chatter: 0.5, cry: 'charge', idle: 'shift', face: 0 },
  { id: 'brute', name: 'Brute', desc: 'Big grunts, never runs', aggro: 1, bravery: 0, voice: 0.8, chatter: 0.6, cry: 'ooga', idle: 'thump', face: 1 },
  { id: 'berserk', name: 'Berserk', desc: 'Roars and charges in', aggro: 1, bravery: 0, voice: 0.75, chatter: 1, cry: 'roar', idle: 'bounce', face: 1 },
  { id: 'peasant', name: 'Grumpy', desc: 'Grumbles “hey!”', aggro: 0.85, bravery: 0.2, voice: 0.9, chatter: 0.5, cry: 'hey', idle: 'lean', face: 0 },
  { id: 'tiny', name: 'Excitable', desc: 'Squeaky, hops about', aggro: 1, bravery: 0.4, voice: 1.8, chatter: 1, cry: 'yip', idle: 'hop', face: 2 },
  { id: 'coward', name: 'Coward', desc: 'Panics when hurt', aggro: 0.6, bravery: 0.6, voice: 1.3, chatter: 0.8, cry: 'yip', idle: 'shake', face: 2 },
  { id: 'maniac', name: 'Maniac', desc: 'Cackles. A lot.', aggro: 1, bravery: 0, voice: 1.2, chatter: 1, cry: 'cackle', idle: 'bounce', face: 1 },
  { id: 'royal', name: 'Royal', desc: 'Deep, regal and proud', aggro: 0.8, bravery: 0, voice: 0.6, chatter: 0.5, cry: 'royal', idle: 'regal', face: 0 },
  { id: 'mystic', name: 'Mystic', desc: 'Hums magic words', aggro: 0.5, bravery: 0.35, voice: 0.95, chatter: 0.7, cry: 'magic', idle: 'float', face: 0 },
  { id: 'singer', name: 'Cheery', desc: 'Sings “la la la”', aggro: 0.8, bravery: 0.3, voice: 1.4, chatter: 1, cry: 'la', idle: 'hop', face: 2 },
];

// ---------------------------------------------------------------- colours
export const SKINS = ['#f2c8a0', '#e8b48a', '#d9a173', '#b97a50', '#8a5634', '#5e3a22', '#f6dcc4', '#a7b88a', '#8fb0c8', '#c7a0d8', '#e0e0e0', '#7ab05a'];
export const CLOTH = ['#5a4630', '#7d6040', '#3d3d3d', '#8d939c', '#4f5a2e', '#2c3c8c', '#8a3a7a', '#7a2a2a', '#e8e8e8', '#1d1a1a', '#c08a3a', '#3a6a6a'];
export const ACCENTS = ['#3a2a1e', '#7a5634', '#1d1a1a', '#7d8691', '#f0c03c', '#e8e8e8', '#b03a2e', '#2e6a3a', '#3a4ab0', '#8a3a9a', '#e07a2a', '#40c0c0'];
export const BEARDS = [null, '#7a5232', '#d27a2c', '#3a2a1e', '#1d1a1a', '#d9d9d9', '#eeeeee', '#f0d070', '#5a8a3a'];

// ---------------------------------------------------------------- weapons
// Weapon kinds a custom unit may use. Pack kinds are listed only when their behaviour
// reads everything from def.weapon (no def.id checks, no extra bodies or mounts).
const GENERIC = new Set(['melee', 'ranged', 'heal', 'bard']);
const SAFE = new Set(['ww_gun', 'pr_gun', 'dy_parry', 'rn_fencer', 'sp_vampire', 'an_phalanx', 'an_zeus', 'vk_jarl',
  'pi_harpoon', 'gd_cleric', 'gd_shield', 'ev_spinner', 'ev_fan', 'ev_necro', 'ev_chrono', 'sc_bombstick', 'sc_cheer', 'sc_zap', 'sc_ullr',
  'jj_brawler', 'ga_blaster', 'ga_saber']);
const NICE = {
  none: 'Fists', club: 'Club', bone: 'Bone', big_axe: 'Giant axe', pitchfork_small: 'Little fork', pitchfork: 'Pitchfork',
  sword: 'Sword', greatsword: 'Greatsword', kingsword: 'Royal sword', axe: 'Axe', lute: 'Lute', bow: 'Bow',
  staff: 'Fire staff', spear_hand: 'Throwing spears', hay_hand: 'Hay bales', potion_hand: 'Potions', bomb_hand: 'Bombs',
  ga_esword: 'Energy sword', ga_esword_red: 'Red energy sword', ga_droid_gun: 'Droid blaster', ga_rifle: 'Blaster rifle',
  ga_pistol: 'Blaster pistol', ga_xbow: 'Crossbow blaster',
};
const NICE_LOOK = {
  helm_knight: 'Knight helm', cap_metal: 'Kettle hat', hood_green: 'Green hood', feathercap: 'Feathered cap', skullcap: 'Skull cap',
  straw: 'Straw hat', curls: 'Curly hair', viking: 'Horned helmet', wizard: 'Wizard hat', nun: 'Wimple', feather: 'Feather band',
  robe_white: 'White robe', robe_blue: 'Wizard robe', robe: 'Robe', bare_belt: 'Bare chest', armor: 'Plate armour', royal: 'Royal robe',
  fur: 'Furs', vest: 'Vest', apron: 'Bomber apron', overalls: 'Overalls', tunic: 'Tunic', loincloth: 'Loincloth',
};
const pretty = (k) => NICE[k] || NICE_LOOK[k] || k.replace(/^[a-z]{2}_/, '').replace(/_hand$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

let CATALOG = null; // built lazily: needs every pack's units and items
const baseUnits = () => UNITS.filter((u) => u.faction !== CUSTOM_FACTION.id);
const clone = (o) => JSON.parse(JSON.stringify(o));

// Rough stats for the cost formula
function statsOf(def) {
  const w = def.weapon;
  return {
    hp: def.hp, armor: def.armor || 0, block: w.shield ? (w.blockMelee || 0.3) : 0, speed: def.speed || 4,
    damage: w.damage || 0, cooldown: w.cooldown || 1, sweep: !!w.sweep, dual: w.style === 'dual',
    blast: w.blast || 0, ranged: w.kind === 'ranged' || (w.range || 0) > 6, range: w.range || 0,
  };
}

// Combat value of a unit. Lanchester-style (value ~ toughness × damage rate), with an
// exponent > 0.5 because one big unit wastes less than many small ones; fitted to the
// base roster (clubber 70, farmer 80, berserker 420, knight 650, king 1500 come out
// within ~10%). Ranged units are worth more for the free hits they get while the
// enemy closes in; blasts hit several units. One huge hit is capped (overkill).
const K_REF = 2087; // clubber: 100 hp × 20.9 dps
// toughness × damage rate
export function power(s) {
  let ehp = (s.hp / (1 - clamp(s.armor, 0, 0.8))) * (1 + s.block);
  if (s.ranged) ehp = 100 * (ehp / 100) ** 0.7; // shooters are hit less often
  const hit = 400 * Math.tanh(s.damage / 400); // overkill: one-shots waste damage
  let dps = (hit / Math.max(0.15, s.cooldown)) * (s.sweep ? 1.3 : 1) * (s.dual ? 1.4 : 1);
  if (s.blast) dps *= 1 + 0.5 * (s.blast / 3) ** 2;
  if (s.ranged) dps *= 1 + s.range / 18;
  return ehp * Math.max(0.5, dps);
}
export function rawValue(s) {
  return 70 * Math.pow(power(s) / K_REF, 0.74) * Math.pow(Math.max(1, s.speed) / 4.4, 0.4);
}
// Scaling one design up (rank, size) is priced more gently than the roster-wide fit:
// in this game one big unit gets mobbed, so headless equal-gold fights of ranked-up
// copies (hero clubber vs clubbers / chieftains, champion fists vs giants, dual axes
// vs berserkers) came out fair at ~0.62 rather than 0.74.
export const SCALE_EXP = 0.62;
const supportCut = (w) => (w.damage || 0) <= 12 || w.kind === 'heal' || w.kind === 'bard';

// one weapon option: template weapon (normalised), the unit it came from, and its
// price premium (how the donor's real cost compares to rawValue)
function entryFrom(key, name, donor, t) {
  const support = supportCut(t);
  let premium = 1, base = { value: 70, power: K_REF, speed: 4.4 };
  if (donor) {
    const ds = statsOf(donor);
    const v = rawValue(ds);
    premium = support ? 1 : clamp(donor.cost / v, 0.8, 5);
    base = { value: v, power: power(ds), speed: ds.speed };
  }
  const it = ITEMS[t.item] || ITEMS.none;
  const melee = t.kind === 'melee';
  const oneHand = melee && (t.style === 'sword' || t.style === 'none') && t.item !== 'none' && it.len <= 1.15 && !it.center;
  return {
    key, name, template: t, donor: donor ? donor.id : null, donorName: donor ? donor.name : '', faction: donor ? donor.faction : '',
    donorScale: donor ? donor.build?.scale ?? 1 : 1, premium, base, support,
    // a shield goes with any one-handed melee weapon or a spear (hoplite style)
    shieldOk: melee && (oneHand || t.style === 'spear' || t.style === 'none'),
    dualOk: oneHand, // a second weapon in the left hand
    cat: support ? 'Support' : t.kind === 'ranged' || (t.range || 0) > 6 ? 'Ranged' : 'Melee',
    ref: donor ? { cost: donor.cost, hp: donor.hp, speed: donor.speed, ehp: (donor.hp / (1 - clamp(donor.armor || 0, 0, 0.8))) * (1 + (donor.weapon.shield ? donor.weapon.blockMelee || 0.3 : 0)) } : null,
  };
}

// a weapon for an item no ordinary unit carries: guessed from its shape
function guessTemplate(item) {
  const it = ITEMS[item];
  const long = it.len >= 1.5;
  const spear = long && (it.grip >= 80 || it.back);
  return {
    kind: 'melee', item, style: spear ? 'spear' : long ? 'twohand' : 'sword', anim: spear ? 'stab' : long ? 'slam' : 'overhead',
    damage: Math.round(18 + 22 * it.len * (it.heavy ? 1.4 : 1)), reach: +(0.6 + it.len * 0.7).toFixed(2),
    cooldown: +(0.9 + 0.35 * it.len).toFixed(2), force: Math.round(150 + 120 * it.len), sweep: long && !spear,
  };
}

export function catalog() {
  if (CATALOG) return CATALOG;
  const units = baseUnits();
  const weapons = [];
  const seen = new Set();
  const pick = (item) => {
    const can = units.filter((u) => (u.weapon.item === item || u.weapon.item2 === item) && !u.mount && !u.build?.radius);
    return can.find((u) => GENERIC.has(u.weapon.kind)) || can.find((u) => SAFE.has(u.weapon.kind)) || null;
  };
  weapons.push(entryFrom('fists', 'Fists', null, { kind: 'melee', style: 'fists', anim: 'slam', item: 'none', damage: 26, reach: 1.0, cooldown: 1.05, force: 220, fistHit: true }));
  const healer = units.find((u) => u.weapon.kind === 'heal');
  if (healer) weapons.push(entryFrom('heal', 'Healing hands', healer, clone(healer.weapon)));
  for (const item of Object.keys(ITEMS)) {
    if (item === 'none' || seen.has(item)) continue;
    seen.add(item);
    const d = pick(item);
    let t;
    if (d) {
      t = clone(d.weapon);
      if (GENERIC.has(t.kind) && t.kind === 'melee') {
        // plain melee: strip the donor's shield / second weapon (offered separately)
        if (t.style === 'dual') { t.style = 'sword'; t.anim = 'overhead'; delete t.item2; }
        if (t.shield) { t.style = t.anim === 'stab' ? 'spear' : 'sword'; delete t.shield; delete t.blockMelee; }
        if (t.item !== item) t.item = item; // carried as the donor's second weapon
      } else if (t.item !== item && t.item2 === item && !GENERIC.has(t.kind)) { /* pack dual: keep */ }
      else if (t.item !== item) t.item = item;
    } else {
      const it = ITEMS[item];
      if (!it || it.len <= 0.01) continue; // hand-held projectiles need their thrower
      t = guessTemplate(item);
    }
    weapons.push(entryFrom(item, pretty(item), d, t));
  }
  // hats and outfits: every one worn in the roster (outfits drawn by a pack need that
  // pack's faction when decorating, see lookFaction in visual.js)
  const hats = [], tops = [], topFaction = {}, topBare = {};
  for (const u of units) {
    const l = u.look || {};
    if (l.hat && !hats.includes(l.hat)) hats.push(l.hat);
    if (l.top && !tops.includes(l.top)) { tops.push(l.top); topFaction[l.top] = u.faction; topBare[l.top] = !!l.bare; }
  }
  if (!hats.includes('none')) hats.unshift('none');
  else { hats.splice(hats.indexOf('none'), 1); hats.unshift('none'); }
  const one = (list) => list.filter((w) => w.dualOk);
  CATALOG = {
    weapons, byKey: Object.fromEntries(weapons.map((w) => [w.key, w])),
    seconds: one(weapons), hats, tops, topFaction, topBare,
    hatName: (h) => (h === 'none' ? 'None' : pretty(h)),
    topName: (t) => (t === 'none' ? 'Plain shirt' : pretty(t)),
  };
  return CATALOG;
}

export const SHIELD_OPTS = [null, 'wood', 'round'];
export const SHIELD_NAMES = { wood: 'Wooden board', round: 'Round shield' };

// ---------------------------------------------------------------- recipes
export function defaultRecipe(name = 'Custom') {
  return {
    id: newId(), name, size: 1, girth: 1, head: 1, legs: 1, rank: 'soldier',
    hat: 'cap_metal', top: 'tunic', skin: SKINS[0], legsCol: CLOTH[0], accent: ACCENTS[0], beard: null,
    weapon: 'sword', shield: null, second: null, voice: 'soldier',
  };
}
export const newId = () => 'cu_' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
export const cleanName = (s) => String(s ?? '').replace(NAME_OK, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

// Make any stored value a valid recipe, or null if it can't be one.
export function sanitize(r) {
  if (!r || typeof r !== 'object') return null;
  const C = catalog();
  const d = defaultRecipe();
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  const color = (v, def) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : def);
  const id = typeof r.id === 'string' && /^cu_[a-z0-9]{1,16}$/.test(r.id) ? r.id : null;
  if (!id) return null;
  const out = {
    id, name: cleanName(r.name) || 'Custom',
    size: num(r.size, BODY.size.min, BODY.size.max, 1), girth: num(r.girth, BODY.girth.min, BODY.girth.max, 1),
    head: num(r.head, BODY.head.min, BODY.head.max, 1), legs: num(r.legs, BODY.legs.min, BODY.legs.max, 1),
    rank: pick(r.rank, RANKS.map((x) => x.id), 'soldier'),
    hat: pick(r.hat, C.hats, d.hat), top: pick(r.top, C.tops, d.top),
    skin: color(r.skin, d.skin), legsCol: color(r.legsCol, d.legsCol), accent: color(r.accent, d.accent),
    beard: r.beard === null || r.beard === undefined ? null : color(r.beard, null),
    weapon: C.byKey[r.weapon] ? r.weapon : d.weapon,
    shield: SHIELD_OPTS.includes(r.shield) ? r.shield : null,
    second: r.second && C.byKey[r.second]?.dualOk ? r.second : null,
    voice: pick(r.voice, VOICES.map((v) => v.id), 'soldier'),
  };
  const w = C.byKey[out.weapon];
  if (!w.shieldOk) out.shield = null;
  if (!w.dualOk) out.second = null;
  if (out.second) out.shield = null;
  return out;
}

const round = (c) => (c < 200 ? Math.round(c / 5) * 5 : c < 1000 ? Math.round(c / 10) * 10 : Math.round(c / 50) * 50);

// The unit definition (same shape as src/units.js entries) for a recipe.
export function buildDef(r) {
  const C = catalog();
  const W = C.byKey[r.weapon] || C.byKey.sword || C.weapons[0];
  const rank = RANKS.find((x) => x.id === r.rank) || RANKS[1];
  const voice = VOICES.find((v) => v.id === r.voice) || VOICES[0];
  const s = r.size, g = r.girth, L = r.legs;
  const hp = Math.max(10, Math.round((100 * s ** 2.2 * g ** 1.2 * rank.hp) / 5) * 5);
  const speed = +clamp(4.4 * L ** 0.9 * g ** -0.7 * s ** -0.12, 2.8, 7).toFixed(1);
  const w = clone(W.template);
  const sk = Math.sqrt(s / W.donorScale);
  w.damage = Math.max(1, Math.round((w.damage || 0) * rank.dmg * sk));
  if (w.force) w.force = Math.round(w.force * rank.dmg * (s / W.donorScale) ** 1.5);
  if (w.amount) w.amount = Math.round(w.amount * rank.dmg);
  if (w.thorns) w.thorns = Math.round(w.thorns * rank.dmg);
  if (r.shield && W.shieldOk) {
    w.shield = r.shield; w.blockMelee = r.shield === 'wood' ? 0.5 : 0.35;
    w.style = 'shield';
  } else if (r.second && W.dualOk && C.byKey[r.second]) {
    w.style = 'dual'; w.anim = 'dual'; w.item2 = C.byKey[r.second].template.item;
    w.cooldown = +(w.cooldown * 0.75).toFixed(2); // two weapons swing in turn
  }
  const pers = { aggro: voice.aggro, bravery: voice.bravery, voice: voice.voice, chatter: voice.chatter, cry: voice.cry, idle: voice.idle };
  if (W.cat === 'Ranged') pers.aggro = Math.min(pers.aggro, 0.45);
  if (W.support) { pers.aggro = Math.min(pers.aggro, 0.15); pers.bravery = Math.max(pers.bravery, 0.4); }
  if (w.kind === 'bard') pers.idle = 'play';
  const look = { skin: r.skin, hat: r.hat, top: r.top, legs: r.legsCol, accent: r.accent };
  if (C.topBare[r.top]) look.bare = true;
  if (r.beard) look.beard = r.beard;
  if (w.style === 'bow' || w.anim === 'bow') look.quiver = true;
  const def = {
    id: r.id, name: r.name || 'Custom', faction: CUSTOM_FACTION.id, cost: 0, hp, speed,
    build: { scale: +s.toFixed(2), girth: +g.toFixed(2), head: +r.head.toFixed(2), legs: +L.toFixed(2) },
    weapon: w, look, personality: pers, face: voice.face, lookFaction: C.topFaction[r.top] || null,
    desc: `Custom ${rank.name.toLowerCase()} with ${W.name.toLowerCase()}${w.shield ? ' and a shield' : w.item2 ? ' in each hand' : ''}.`,
    custom: true,
  };
  def.cost = costOf(def, W, rank);
  return def;
}

// Cost: priced against the weapon's donor unit (the roster unit that carries it): the
// donor's cost (rawValue × its premium, premium clamped to 0.8..5 so no weapon is
// priced below the roster fit) scaled by (power ratio)^SCALE_EXP and (speed ratio)^0.4.
// A custom unit built like an existing one costs about what that one costs; bigger,
// tougher or harder-hitting versions cost more than proportionally.
export function costOf(def, W = catalog().byKey.sword, rank = RANKS[1]) {
  const st = statsOf(def);
  let c;
  if (W.support && W.ref) {
    // support units are priced by their effect (donor cost) scaled by toughness and rank
    const ehp = (st.hp / (1 - clamp(st.armor, 0, 0.8))) * (1 + st.block);
    c = W.ref.cost * Math.pow(ehp / W.ref.ehp, 0.55) * Math.pow(st.speed / W.ref.speed, 0.3) * Math.pow(rank.dmg, 0.9);
  } else {
    const b = W.base;
    c = W.premium * b.value * Math.pow(power(st) / b.power, SCALE_EXP) * Math.pow(Math.max(1, st.speed) / b.speed, 0.4)
      * Math.pow(def.build.scale / W.donorScale, 0.35); // size: reach, mass and knockback
  }
  return Math.max(20, round(c));
}

// ---------------------------------------------------------------- storage
let recipes = [];
export const customRecipes = () => recipes;

export function loadRecipes(storage = globalThis.localStorage) {
  let list = [];
  try {
    const raw = storage?.getItem(STORE_KEY);
    const o = raw ? JSON.parse(raw) : null;
    const arr = Array.isArray(o) ? o : Array.isArray(o?.units) ? o.units : [];
    const ids = new Set();
    for (const r of arr) {
      let ok = null;
      try { ok = sanitize(r); } catch { ok = null; }
      if (ok && !ids.has(ok.id) && list.length < MAX_CUSTOM) { ids.add(ok.id); list.push(ok); }
    }
  } catch { list = []; }
  recipes = list;
  return list;
}

export function saveRecipes(list, storage = globalThis.localStorage) {
  recipes = list.slice(0, MAX_CUSTOM);
  try { storage?.setItem(STORE_KEY, JSON.stringify({ v: 1, units: recipes })); } catch { /* storage full or blocked */ }
}

// Register the saved units with the roster (UNITS / UNIT_BY_ID). Returns the defs.
export function syncCustomUnits() {
  const defs = [];
  for (const r of recipes) {
    try { defs.push(buildDef(r)); } catch (e) { console.warn('custom unit skipped', r?.id, e); }
  }
  setFactionUnits(CUSTOM_FACTION.id, defs);
  return defs;
}
