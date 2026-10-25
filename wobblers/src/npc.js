// NPCs: the same wobbly active ragdoll as the players (src/player.js), driven
// by a little AI instead of a pad. They wander, idle, look at and wave to
// players who come close (with a speech bubble), flop when punched or run
// over, get up, and sometimes run off or complain.
//
// Defining characters
//   registerRole(name, def)  — def (every field optional):
//     colors: { shirt, pants, hat }   hex colours (hat: tint for hats that use it)
//     hat: any player hat id (config.js HATS, e.g. 'cap', 'cowboy', 'beanie', 'hardhat'...)
//          or an NPC hat registered with registerHat (built in: 'straw', 'pith', 'chef', 'helmet', 'sunhat')
//     face: index or name in cosmetics.js FACES ('Cool shades', 'Moustache'...)
//     outfit: ['tie' | 'scarf' | 'vest' | 'backpack' | 'apron' | 'belt' | 'lifejacket', ...] or a
//             function (partName, builder, S) adding geometry to a body part (chest/hips local frames)
//     prop: held in the right hand: 'briefcase' | 'rod' | 'surfboard' | 'skis' | 'pitchfork' | 'lasso' |
//           'map' | 'buoy' | 'coffee' | 'camera' | 'shovel' | 'flag', or a function (builder) in hand space
//     behaviour: 'wander' (default; opts.area = { x, z, r } or the spawn point + r 12) | 'idle' / 'stand'
//                (stay put, look around) | 'patrol' (opts.path = [[x, z], ...]) | 'sit' (sits on the
//                nearest free seat near home now and then)
//     lines: greetings shown in a speech bubble when a player comes close; hitLines: when hit
//     emotes: idle emote ids (emotes.js EMOTES: 'wave', 'clap', 'dance', 'point', 'flex', 'cheer', 'laugh', 'bow')
//     speed: walking pace 0..1 of a player's walk (default 0.55); flee: run away after being hit (default true)
//   spawnNPC / game.npcs.spawn(roleOrDef, x, z, opts) — opts override the role (and add area / path / yaw).
//
// Rules: NPCs are never in game.players (no views, tags, menus, presents, map
// dots); they collide with players and props on their own collision bits
// (config.js NPC_BITS, 11..15, five groups, so NPCs in different groups bump
// into each other); only the CAP nearest NPCs within WAKE_R of a player are
// simulated, the rest are parked (bodies disabled, hidden, seats freed).
import * as THREE from 'three';
import { Player, S, headMaterials } from './player.js';
import { HATS } from './config.js';
import { startEmote, stopEmote } from './emotes.js';
import { FACES, faceMaterial } from './cosmetics.js';
import { Builder } from './mesh.js';
import { injectCSS } from './map.js';
import { meshHeight } from './terrain.js';

export const WAKE_R = 70, SLEEP_R = 85, CAP = 16;
const NPC_SLOTS = 5;                 // player indices 8..12 -> collision bits 11..15
const HEAD_R = 0.31 * S, HAND_OFF = -0.13 * S;
const r01 = () => Math.random();
const pick = (a) => a[(Math.random() * a.length) | 0];

// ---- hats only NPCs wear ---------------------------------------------------------
export const NPC_HATS = {
  straw(b, R) {
    b.cyl(R * 1.45, R * 1.45, 0.03, 0xe8cf7a, [0, R * 0.62, 0], null, 20);
    b.cyl(R * 0.62, R * 0.72, R * 0.55, 0xe8cf7a, [0, R * 0.9, 0], null, 16);
    b.cyl(R * 0.73, R * 0.73, R * 0.12, 0xc8343c, [0, R * 0.72, 0], null, 16);
  },
  pith(b, R) {
    b.sphere(R * 1.08, 0xd8c896, [0, R * 0.45, 0], [1, 0.62, 1.05], 16);
    b.cyl(R * 1.3, R * 1.3, 0.03, 0xd8c896, [0, R * 0.42, 0], null, 20);
    b.cyl(R * 1.09, R * 1.09, R * 0.1, 0x7a5a32, [0, R * 0.5, 0], null, 18);
  },
  chef(b, R) {
    b.cyl(R * 0.82, R * 0.8, R * 0.45, 0xffffff, [0, R * 0.82, 0], null, 18);
    b.sphere(R * 0.62, 0xffffff, [0, R * 1.35, 0], [1.25, 0.85, 1.25], 14);
  },
  helmet(b, R, c) {
    b.sphere(R * 1.07, c, [0, R * 0.3, 0], [1, 0.8, 1.05], 18);
    b.box(R * 1.3, R * 0.32, 0.03, 0x9fd8ff, [0, R * 0.25, R * 0.98], [0.2, 0, 0]);
  },
  sunhat(b, R, c) {
    b.cyl(R * 1.6, R * 1.6, 0.025, c, [0, R * 0.6, 0], null, 22);
    b.sphere(R * 0.8, c, [0, R * 0.75, 0], [1, 0.6, 1], 14);
    b.cyl(R * 0.82, R * 0.82, R * 0.12, 0xffffff, [0, R * 0.72, 0], null, 16);
  },
};
export function registerHat(name, fn) { NPC_HATS[name] = fn; }

// ---- outfits: extra geometry on body parts (part-local frames, metres) -------------
const FRONT = 0.205, BACK = -0.2;
export const OUTFITS = {
  tie(part, b) { if (part === 'chest') { b.box(0.07, 0.24, 0.025, 0xc8343c, [0, -0.02, FRONT], [-0.12, 0, 0]); b.box(0.08, 0.05, 0.03, 0xa02a30, [0, 0.13, FRONT - 0.01]); } },
  scarf(part, b, c = 0xff5a5a) { if (part === 'chest') { b.torus(0.15, 0.05, c, [0, 0.235, 0.0], [Math.PI / 2, 0, 0], 14); b.box(0.08, 0.2, 0.03, c, [0.07, 0.12, FRONT - 0.01], [0.1, 0, 0.15]); } },
  vest(part, b) { if (part === 'chest') for (const s of [-1, 1]) b.rbox(0.16, 0.34, 0.06, 0.03, 0x6b4a2a, [s * 0.11, -0.02, FRONT - 0.03], [0, s * 0.35, 0]); },
  backpack(part, b) { if (part === 'chest') { b.rbox(0.34, 0.38, 0.16, 0.06, 0x8a6a3a, [0, -0.02, BACK - 0.06]); b.rbox(0.28, 0.12, 0.08, 0.03, 0x6b4a2a, [0, -0.12, BACK - 0.15]); } },
  apron(part, b) { if (part === 'chest') b.rbox(0.34, 0.36, 0.03, 0.02, 0xffffff, [0, -0.16, FRONT + 0.01], [-0.12, 0, 0]); },
  belt(part, b) { if (part === 'hips') b.torus(0.17, 0.025, 0x3a2a1a, [0, 0.07, 0], [Math.PI / 2, 0, 0], 16); },
  lifejacket(part, b) { if (part === 'chest') b.rbox(0.48, 0.36, 0.44, 0.1, 0xff8a1a, [0, 0.0, 0.0]); },
};

// ---- props held in the right hand (lower-arm frame, mitten at y = HAND_OFF) -------
export const PROPS = {
  briefcase(b) { b.rbox(0.36, 0.28, 0.1, 0.03, 0x4a2f1f, [0, HAND_OFF - 0.2, 0]); b.box(0.1, 0.04, 0.03, 0x222222, [0, HAND_OFF - 0.05, 0]); },
  rod(b) { b.cyl(0.015, 0.025, 2.2, 0x6b4a2a, [0, HAND_OFF + 0.35, 0.75], [1.15, 0, 0], 6); b.cyl(0.004, 0.004, 1.2, 0xffffff, [0, HAND_OFF + 0.2, 1.75], null, 3); },
  surfboard(b) { b.sphere(0.6, 0x3fe0d0, [-0.2, HAND_OFF + 0.05, 0], [0.42, 1.55, 0.07], 14); b.box(0.02, 1.6, 0.075, 0xffffff, [-0.2, HAND_OFF + 0.05, 0]); },
  skis(b) { for (const x of [-0.06, 0.06]) b.box(0.08, 1.6, 0.03, 0xff3a3a, [x - 0.12, HAND_OFF + 0.2, 0.05]); },
  pitchfork(b) { b.cyl(0.025, 0.025, 1.7, 0x8a5a36, [0, HAND_OFF + 0.35, 0.05], null, 6); for (const x of [-0.08, 0, 0.08]) b.cyl(0.012, 0.012, 0.3, 0x999999, [x, HAND_OFF + 1.3, 0.05], null, 4); b.box(0.2, 0.03, 0.03, 0x999999, [0, HAND_OFF + 1.15, 0.05]); },
  lasso(b) { b.torus(0.22, 0.025, 0xc8a46a, [0, HAND_OFF - 0.15, 0.05], [0, 0, 0], 16); },
  map(b) { b.box(0.32, 0.24, 0.01, 0xf2e6c4, [0, HAND_OFF - 0.02, 0.1], [-0.6, 0, 0]); },
  buoy(b) { b.capsule(0.09, 0.6, 0xff3a3a, [0, HAND_OFF - 0.15, 0.08], [0, 0, Math.PI / 2]); },
  coffee(b) { b.cyl(0.045, 0.04, 0.11, 0xffffff, [0, HAND_OFF + 0.02, 0.07], null, 10); b.cyl(0.047, 0.047, 0.02, 0x6b4a2a, [0, HAND_OFF + 0.08, 0.07], null, 10); },
  camera(b) { b.rbox(0.16, 0.1, 0.07, 0.02, 0x222228, [0, HAND_OFF, 0.08]); b.cyl(0.035, 0.035, 0.06, 0x444450, [0, HAND_OFF, 0.13], [Math.PI / 2, 0, 0], 10); },
  shovel(b) { b.cyl(0.02, 0.02, 1.2, 0x8a5a36, [0, HAND_OFF - 0.1, 0.05], null, 6); b.box(0.2, 0.26, 0.02, 0x8a8f96, [0, HAND_OFF - 0.8, 0.05]); },
  flag(b) { b.cyl(0.015, 0.015, 1.1, 0xdddddd, [0, HAND_OFF + 0.4, 0.05], null, 5); b.box(0.02, 0.28, 0.42, 0xff3a3a, [0, HAND_OFF + 0.8, 0.27]); },
};

// ---- roles -------------------------------------------------------------------------
const SHIRTS = [0xff5a5a, 0x3f8cff, 0x55d85a, 0xffc233, 0xb46cff, 0xff8a3d, 0x3fe0d0, 0xff7fc8, 0xffffff, 0x8a8f96];
const PANTS = [0x3b5c9a, 0x2a2a33, 0xc8ad7a, 0x6a3c9a, 0x3c8a3c, 0x7a5a3a];
export const ROLES = {
  townsfolk: { random: true, behaviour: 'wander', lines: ['Hello!', 'Nice day!', 'Hiya!', 'Lovely weather!', 'Wheee!'], emotes: ['wave', 'clap', 'laugh'] },
  lifeguard: { colors: { shirt: 0xe8322b, pants: 0xffd23f, hat: 0xffffff }, hat: 'cap', face: 'Cool shades', prop: 'buoy', behaviour: 'idle',
    lines: ['No running by the water!', 'Swim safe!', 'Stay between the flags!'], emotes: ['point', 'flex'] },
  farmer: { colors: { shirt: 0xc8343c, pants: 0x3b5c9a }, hat: 'straw', outfit: ['belt'], prop: 'pitchfork', behaviour: 'wander',
    lines: ['Howdy!', 'Mind the hay!', 'Lovely day for it.'], emotes: ['wave', 'point'] },
  businessman: { colors: { shirt: 0x2a3550, pants: 0x2a3550 }, hat: 'none', outfit: ['tie'], prop: 'briefcase', behaviour: 'wander', speed: 0.75,
    lines: ['Busy busy!', 'Time is money!', 'Can\'t stop, meeting!'], emotes: ['point'] },
  taxi: { colors: { shirt: 0xffd23f, pants: 0x2a2a33, hat: 0x222228 }, hat: 'cap', behaviour: 'idle', lines: ['Taxi?', 'Where to, pal?', 'Hop in!'], emotes: ['wave'] },
  skier: { colors: { shirt: 0xff5a5a, pants: 0x2a62c9, hat: 0xffffff }, hat: 'beanie', outfit: [(n, b) => OUTFITS.scarf(n, b, 0xffd23f)], prop: 'skis', behaviour: 'wander',
    lines: ['Fresh powder!', 'Brrr!', 'Race you to the top!'], emotes: ['cheer', 'wave'] },
  cowboy: { colors: { shirt: 0xc8975f, pants: 0x3b5c9a, hat: 0x9a6232 }, hat: 'cowboy', face: 'Moustache', outfit: ['vest', 'belt'], prop: 'lasso', behaviour: 'wander',
    lines: ['Howdy, partner!', 'Yeehaw!', 'Hot one today.'], emotes: ['wave', 'point'] },
  explorer: { colors: { shirt: 0xc8ad7a, pants: 0x9a845a }, hat: 'pith', outfit: ['backpack', 'belt'], prop: 'map', behaviour: 'wander',
    lines: ['Seen the volcano?', 'Adventure awaits!', 'I think I\'m lost...'], emotes: ['point', 'cheer'] },
  surfer: { colors: { shirt: 0x3fe0d0, pants: 0xff8a3d }, hat: 'none', face: 'Cool shades', prop: 'surfboard', behaviour: 'wander',
    lines: ['Surf\'s up!', 'Gnarly!', 'Totally tubular!'], emotes: ['dance', 'cheer'] },
  fisherman: { colors: { shirt: 0xffd23f, pants: 0x2a2a33, hat: 0xffd23f }, hat: 'bucket', outfit: ['lifejacket'], prop: 'rod', behaviour: 'idle',
    lines: ['Caught a big one yesterday!', 'Shh, you\'ll scare the fish.', 'Nice day for fishing.'], emotes: ['point'] },
  chef: { colors: { shirt: 0xffffff, pants: 0x2a2a33 }, hat: 'chef', outfit: ['apron'], behaviour: 'idle', lines: ['Hungry?', 'Fresh today!'], emotes: ['wave'] },
};
export function registerRole(name, def) { ROLES[name] = def; return def; }

function resolveDef(role, opts) {
  const base = typeof role === 'string' ? ROLES[role] : role;
  if (!base) throw new Error('unknown NPC role: ' + role);
  const d = { ...base, ...opts, colors: { ...(base.colors || {}), ...(opts.colors || {}) } };
  d.role = typeof role === 'string' ? role : (d.role || 'custom');
  if (d.random) {
    d.colors.shirt ??= pick(SHIRTS); d.colors.pants ??= pick(PANTS);
    if (d.hat === undefined) d.hat = pick(['none', 'none', 'cap', 'beanie', 'bucket', 'sunhat']);
    d.colors.hat ??= pick(SHIRTS);
    if (d.face === undefined) d.face = pick([0, 0, 1, 3, 5, 6, 9]);
  }
  return d;
}

// ---- the NPC -------------------------------------------------------------------------
export class NPC extends Player {
  constructor(game, def, x, z, slot) {
    super(game, 8 + (slot % NPC_SLOTS), 'npc');
    // the group sits at the origin (parts carry world positions), so game.cullSmall's
    // distance test would hide every NPC far from (0, 0); parked NPCs are hidden anyway
    this.group.userData.noCull = true;
    this.isNPC = true;
    this.def = def;
    this.npcSlot = slot;
    this.cam = { yaw: 0, pitch: 0.2 }; // stick input is world-relative (see steer)
    this.home = { x, z, yaw: def.yaw ?? r01() * Math.PI * 2 };
    this.area = def.area || { x, z, r: def.behaviour === 'wander' || !def.behaviour ? 12 : 3 };
    this.ai = { mode: 'idle', t: 1 + r01() * 3, target: null, stuck: 0, greetCool: 0, emoteT: 6 + r01() * 8, path: 0, hurt: false, attacker: null, sitT: 0 };
    this.bubble = null;
    this.applyLook();
    const y = this.groundY(x, z);
    this.teleport(x, y, z, this.home.yaw);
    this.parkPos = { x, y, z };
    this.parked = false;
  }

  // ---- look ----
  applyLook() {
    const d = this.def, c = d.colors || {};
    this.color = c.shirt ?? 0xff5a5a;
    this.pantsColor = c.pants;
    this.hatKind = d.hat ?? 'none';
    this.hatColor = c.hat;
    const fi = typeof d.face === 'string' ? FACES.indexOf(d.face) : d.face;
    this.face = fi > 0 ? fi : 0;
    const outs = (d.outfit || []).map((o) => (typeof o === 'function' ? o : OUTFITS[o])).filter(Boolean);
    this.outfit = outs.length ? (n, b) => { for (const f of outs) f(n, b, S); } : null; // read by Player.partMesh
    for (const n in this.parts) {
      const part = this.parts[n];
      if (n === 'head') { this.buildHat(); continue; }
      this.group.remove(part.mesh);
      part.mesh = this.partMesh(part.def);
      this.group.add(part.mesh);
    }
    const prop = typeof d.prop === 'function' ? d.prop : PROPS[d.prop];
    if (prop) { const b = new Builder(); prop(b); const m = b.mesh(); m.castShadow = true; this.parts.lArmR.mesh.add(m); }
    this.headMesh.material = this.face ? faceMaterial(this.face) : headMaterials().normal;
  }

  buildHat() {
    const kind = this.hatKind;
    if (kind == null || HATS.includes(kind)) {
      if (kind != null) this.hat = HATS.indexOf(kind);
      const c = this.color;
      if (this.hatColor != null) this.color = this.hatColor;
      super.buildHat();
      this.color = c;
      return;
    }
    const hm = this.hatMesh;
    while (hm.children.length) { const ch = hm.children.pop(); ch.geometry?.dispose(); }
    const b = new Builder();
    NPC_HATS[kind]?.(b, HEAD_R, this.hatColor ?? this.color, hm);
    hm.add(b.mesh());
  }

  groundY(x, z, fromY) {
    // static world under the spot (piers, decks), else the terrain
    const gy = this.game.groundHeight(x, z, fromY ?? meshHeight(x, z) + 6);
    return Math.max(gy, meshHeight(x, z) - 0.2) + 0.05;
  }

  where() { if (this.parked) return this.parkPos; const t = this.hips.translation(); return t; }

  // ---- LOD ----
  park() {
    if (this.parked) return;
    for (const p of this.game.players) for (const h of ['L', 'R']) if (p.hands[h].body && this.bodies.includes(p.hands[h].body)) p.releaseHand(h);
    if (this.seat) this.leaveSeat();
    this.releaseAll();
    stopEmote(this);
    const t = this.hips.translation();
    const ok = Number.isFinite(t.x) && t.y > -6 && Math.hypot(t.x - this.home.x, t.z - this.home.z) < this.area.r + 60;
    this.parkPos = ok ? { x: t.x, y: t.y, z: t.z } : { x: this.home.x, y: 0, z: this.home.z };
    for (const b of this.bodies) b.setEnabled(false);
    this.group.visible = false;
    this.bubble = null;
    this.parked = true;
  }
  activate() {
    if (!this.parked) return;
    const { x, z } = this.parkPos;
    for (const b of this.bodies) b.setEnabled(true);
    this.wake(false); this.recover = 1; this.state = 'normal'; this.mantle = null;
    this.teleport(x, this.groundY(x, z, (this.parkPos.y || 0) + 2.5), z, this.yaw);
    this.group.visible = true;
    this.parked = false;
    this.ai.mode = 'idle'; this.ai.t = 0.5 + r01() * 2;
  }
  respawn() {
    if (this.seat) this.leaveSeat();
    this.releaseAll(); stopEmote(this); this.wake(false); this.recover = 1;
    this.teleport(this.home.x, this.groundY(this.home.x, this.home.z), this.home.z, this.home.yaw);
  }

  say(text, t = 3.2) { if (text) this.bubble = { text, t }; }

  // ---- AI: produces this step's stick / button input ----
  think() {
    const ai = this.ai, d = this.def, dt = 1 / 60;
    const inp = { moveX: 0, moveY: 0, sprint: false }, pr = {};
    ai.t -= dt; ai.greetCool -= dt; ai.emoteT -= dt;
    if (this.bubble && (this.bubble.t -= dt) <= 0) this.bubble = null;
    if (this.state === 'limp') {
      if (!ai.hurt) { ai.hurt = true; ai.attacker = this.nearestPlayer(6)?.p || null; }
      // flopped on purpose (no knock-out timer): get up after a moment
      if (this.limpTimer <= 0 && ai.t < -2) pr.jump = true;
      return [inp, pr];
    }
    if (ai.hurt) {
      ai.hurt = false;
      this.say(pick(d.hitLines || ['Hey!', 'Ouch!', 'Rude!', 'What was that for?!']));
      if (d.flee !== false && ai.attacker) { ai.mode = 'flee'; ai.t = 2.5 + r01() * 1.5; }
      else { ai.mode = 'idle'; ai.t = 2; }
    }
    if (this.state === 'seated') {
      ai.sitT -= dt;
      const np = this.nearestPlayer(5);
      if (np && ai.greetCool <= 0) this.greet(np.p);
      if (ai.sitT <= 0) { this.leaveSeat(); ai.mode = 'idle'; ai.t = 8 + r01() * 10; }
      return [inp, pr];
    }
    const hp = this.hips.translation();
    // react to players close by
    const np = this.nearestPlayer(7);
    if (np && np.d < 4.5 && ai.greetCool <= 0 && ai.mode !== 'flee') this.greet(np.p);
    let target = null, speed = d.speed ?? 0.55;
    if (ai.mode === 'flee') {
      const a = ai.attacker?.chest?.translation();
      if (a) { const dx = hp.x - a.x, dz = hp.z - a.z, l = Math.hypot(dx, dz) || 1; target = { x: hp.x + dx / l * 5, z: hp.z + dz / l * 5 }; }
      speed = 1; inp.sprint = true;
      if (ai.t <= 0) { ai.mode = 'idle'; ai.t = 2 + r01() * 2; }
    } else if (ai.mode === 'greet') {
      if (np) this.faceTo(np.p.chest.translation(), dt);
      if (ai.t <= 0) { ai.mode = 'idle'; ai.t = 1 + r01() * 2; }
    } else if (ai.mode === 'walk') {
      target = ai.target;
      if (Math.hypot(target.x - hp.x, target.z - hp.z) < 1.2) {
        if (ai.seat && !ai.seat.occupant && Math.hypot(ai.seat.pos[0] - hp.x, ai.seat.pos[2] - hp.z) < 2.2) {
          this.sitIn(ai.seat); ai.sitT = 15 + r01() * 25; ai.seat = null; return [inp, pr];
        }
        ai.mode = 'idle'; ai.t = 2 + r01() * 4; target = null;
      }
    } else { // idle
      if (np && np.d < 7) this.faceTo(np.p.chest.translation(), dt);
      if (ai.emoteT <= 0 && d.emotes?.length) { ai.emoteT = 9 + r01() * 12; if (!np) startEmote(this, pick(d.emotes)); }
      if (ai.t <= 0) this.nextGoal(hp);
    }
    // stay near home: lost, swimming or wandered off -> head back
    const far = Math.hypot(hp.x - this.home.x, hp.z - this.home.z);
    if (this.swimming || far > this.area.r + 25) { target = { x: this.home.x, z: this.home.z }; ai.mode = 'walk'; ai.target = target; }
    if (far > this.area.r + 120 || hp.y < -6) { this.respawn(); return [inp, pr]; }
    if (target) {
      const dx = target.x - hp.x, dz = target.z - hp.z, l = Math.hypot(dx, dz);
      if (l > 0.3) {
        const k = speed / l;
        inp.moveX = -dx * k; inp.moveY = dz * k; // world-relative (cam yaw 0)
        // stuck: hop, then give up on this goal
        const v = this.hips.linvel();
        if (Math.hypot(v.x, v.z) < 0.35 && this.grounded) { ai.stuck += dt; if (ai.stuck > 1.0 && ai.stuck < 1.03) pr.jump = true; if (ai.stuck > 2.5) { ai.stuck = 0; ai.mode = 'idle'; ai.t = 1; ai.seat = null; } }
        else ai.stuck = Math.max(0, ai.stuck - dt);
      }
    }
    return [inp, pr];
  }

  nextGoal(hp) {
    const ai = this.ai, d = this.def, b = d.behaviour || 'wander';
    if (b === 'patrol' && d.path?.length) {
      const [x, z] = d.path[ai.path++ % d.path.length];
      ai.mode = 'walk'; ai.target = { x, z };
    } else if (b === 'sit') {
      const s = this.findSeat();
      if (s) { ai.mode = 'walk'; ai.seat = s; const t = s.body.translation(); ai.target = s.body === this.game.physics.staticBody ? { x: s.pos[0], z: s.pos[2] } : { x: t.x, z: t.z }; }
      else { ai.mode = 'idle'; ai.t = 5 + r01() * 5; }
    } else if (b === 'wander') {
      for (let k = 0; k < 8; k++) {
        const a = r01() * Math.PI * 2, r = Math.sqrt(r01()) * this.area.r;
        const x = this.area.x + Math.sin(a) * r, z = this.area.z + Math.cos(a) * r;
        if (meshHeight(x, z) < 0) continue; // no wading into the sea
        ai.mode = 'walk'; ai.target = { x, z };
        return;
      }
      ai.t = 2;
    } else { // idle / stand: drift back to the spot, look around
      if (Math.hypot(hp.x - this.home.x, hp.z - this.home.z) > 2.5) { ai.mode = 'walk'; ai.target = { x: this.home.x, z: this.home.z }; }
      else { ai.t = 3 + r01() * 5; this.yaw += (r01() - 0.5) * 1.6; }
    }
  }

  findSeat() {
    let best = null, bd = 10;
    for (const s of this.game.seats) {
      if (s.occupant || s.disabled || s.kind === 'driver' || s.use || s.body !== this.game.physics.staticBody) continue;
      const dd = Math.hypot(s.pos[0] - this.home.x, s.pos[2] - this.home.z);
      if (dd < bd) { bd = dd; best = s; }
    }
    return best;
  }

  nearestPlayer(maxD) {
    const c = this.chest.translation();
    let best = null, bd = maxD;
    for (const p of this.game.players) {
      const t = p.chest.translation(), dd = Math.hypot(t.x - c.x, t.y - c.y, t.z - c.z);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best ? { p: best, d: bd } : null;
  }

  faceTo(t, dt) {
    const c = this.chest.translation();
    let dy = Math.atan2(t.x - c.x, t.z - c.z) - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += Math.max(-3 * dt, Math.min(3 * dt, dy));
  }

  greet(p) {
    const ai = this.ai;
    ai.greetCool = 20 + r01() * 15;
    this.say(pick(this.def.lines || ['Hi!']));
    if (this.state !== 'seated') { ai.mode = 'greet'; ai.t = 2.4; }
    startEmote(this, 'wave');
    this.game.audio?.play('pop', this.pos(), 0.5);
  }

  npcStep() {
    const [inp, pr] = this.think();
    this.step(inp, pr);
  }
}

// ---- the manager: spawning, LOD, sync, speech bubbles -------------------------------
const CSS = `
.npcbubble { position: absolute; transform: translate(-50%, -100%); background: #fff; color: #1f3354; font-weight: 800; font-size: 14px;
  padding: 4px 11px; border-radius: 14px; white-space: nowrap; box-shadow: 0 3px 0 rgba(0,0,0,.18); pointer-events: none; }
.npcbubble::after { content: ''; position: absolute; left: 50%; bottom: -7px; margin-left: -7px; border: 7px solid transparent; border-bottom: 0; border-top-color: #fff; }
`;

export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.awake = new Set();
    this.k = 0;
    this.pool = [];
    injectCSS(CSS);
    game.steppers.push(() => this.step());
    game.updaters.push(() => this.sync());
  }

  spawn(role, x, z, opts = {}) {
    const def = resolveDef(role, opts);
    const n = new NPC(this.game, def, x, z, this.list.length);
    this.list.push(n);
    n.park();
    return n;
  }

  // Remove an NPC for good (mission passengers, outlaws...): hands let go, seat freed, bodies gone.
  despawn(n) {
    const i = this.list.indexOf(n);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.awake.delete(n);
    for (const p of this.game.players) for (const h of ['L', 'R']) if (p.hands[h].body && n.bodies.includes(p.hands[h].body)) p.releaseHand(h);
    n.bubble = null;
    n.destroy();
  }

  step() {
    if (this.k++ % 15 === 0) this.updateLOD();
    for (const n of this.awake) n.npcStep();
  }

  // Wake the CAP nearest NPCs within WAKE_R of any player, park the rest.
  updateLOD() {
    const ps = this.game.players.map((p) => p.chest.translation());
    const cand = [];
    for (const n of this.list) {
      if (n.pinned) { cand.push([-1, n]); continue; } // mission NPCs (src/missions/) stay awake while their job runs
      const q = n.where();
      let d = 1e9;
      for (const p of ps) d = Math.min(d, Math.hypot(q.x - p.x, q.z - p.z));
      if (d < (n.parked ? WAKE_R : SLEEP_R)) cand.push([d, n]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const want = new Set(cand.slice(0, CAP).map((c) => c[1]));
    for (const n of [...this.awake]) if (!want.has(n)) { n.park(); this.awake.delete(n); }
    for (const n of want) if (!this.awake.has(n)) { n.activate(); this.awake.add(n); }
  }

  sync() {
    const normal = headMaterials().normal;
    for (const n of this.awake) {
      n.sync();
      // keep the chosen face unless knocked out (like cosmetics.syncFace)
      if (n.face && n.headMesh.material === normal) n.headMesh.material = faceMaterial(n.face);
    }
  }

  // Speech bubbles over NPCs near each view's camera (called from ui.update).
  drawBubbles(views) {
    const g = this.game, v3 = new THREE.Vector3(), hd = new THREE.Vector3();
    let k = 0;
    g.players.forEach((p, i) => {
      const [x, y, w, h] = views[i] || [];
      if (w == null || g.ui.panels?.get(p)) return;
      const cam = p.camera.cam;
      for (const n of this.awake) {
        if (!n.bubble) continue;
        n.viewPos(hd, 'head');
        if (cam.position.distanceTo(hd) > 22) continue;
        v3.set(hd.x, hd.y + 0.55, hd.z).project(cam);
        if (v3.z > 1 || v3.x < -1 || v3.x > 1 || v3.y < -1 || v3.y > 1) continue;
        let el = this.pool[k];
        if (!el) { el = document.createElement('div'); el.className = 'npcbubble'; g.ui.hud.appendChild(el); this.pool[k] = el; }
        k++;
        el.style.display = 'block';
        if (el.textContent !== n.bubble.text) el.textContent = n.bubble.text;
        el.style.left = x + (v3.x * 0.5 + 0.5) * w + 'px';
        el.style.top = y + (-v3.y * 0.5 + 0.5) * h + 'px';
        el.style.opacity = String(Math.min(1, n.bubble.t / 0.4));
      }
    });
    for (let i = k; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }
}

// convenience
export function spawnNPC(game, role, x, z, opts) { return game.npcs.spawn(role, x, z, opts); }
