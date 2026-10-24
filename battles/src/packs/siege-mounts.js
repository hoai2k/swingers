// Siege engines, mounted units and a flyer (TABS unit mechanics the foot roster lacks):
//   Cavalry (Medieval)  knight with a lance on a physical horse: charges, tramples, wheels round
//   Mammoth (Tribal)    huge animal with a spear-throwing rider and a drummer: tramples, tusk-tosses
//   Catapult (Medieval) crewed cart that lobs boulders on high arcs: crush, then roll and bowl
//   Ballista (Medieval) crewed bolt thrower: flat, fast bolts that skewer a whole line
//   Valkyrie (Legacy)   flies above the fight on lift forces and dives on targets
// Code: sm-core.js (big targets, poses, foot AI), sm-mounts.js, sm-siege.js, sm-valkyrie.js,
// sm-meshes.js. Core hooks used: EXT.pose (src/pose.js) and build.radius (src/body.js).
import { register, EXT } from '../ext.js';
import { makeSkeleton } from '../body.js';
import { S, smPose, stepStuck } from './sm-core.js';
import {
  HORSE, MAMMOTH, mountLayout, mountInit, stepMount, cavalryThink, mammothThink, riderHit, riderDie, riderStep,
  setupRidePoses, rangedEvent,
} from './sm-mounts.js';
import { CATAPULT, BALLISTA, siegeLayout, siegeInit, siegeThink, siegeEvent, stepSiege, siegeCrewDie, PROJ } from './sm-siege.js';
import { valkInit, valkThink, valkStep, stepFlyer, wingLayout, restSt } from './sm-valkyrie.js';
import * as M from './sm-meshes.js';

const UNITS = [
  {
    id: 'sm_cavalry', name: 'Cavalry', faction: 'medieval', cost: 750, hp: 230, speed: 4.0,
    build: { scale: 1, girth: 1.05, mass: 1.3, radius: 1.25 },
    weapon: { kind: 'sm_cavalry', style: 'sm_lance', footStyle: 'spear', anim: 'stab', item: 'sm_lance', damage: 62, reach: 2.6, cooldown: 1.3, force: 900 },
    look: { skin: '#f2c8a0', hat: 'helm_knight', top: 'armor', legs: '#8d939c', armor: true },
    personality: { aggro: 1, bravery: 0, voice: 0.85, chatter: 0.4, cry: 'charge', idle: 'shift' },
    armor: 0.3, stagger: 0.6,
    desc: 'Lance on a horse. Charges through lines, wheels round and charges again. Fights on foot if unhorsed.',
  },
  {
    id: 'sm_mammoth', name: 'Mammoth', faction: 'tribal', cost: 2200, hp: 300, speed: 4.2,
    build: { scale: 1, girth: 1.0, radius: 3.0 },
    weapon: {
      kind: 'sm_mammoth', style: 'sm_mthrow', footStyle: 'throw', anim: 'throw', item: 'spear_hand', proj: 'spear', speed: 22, arc: 'low',
      range: 26, minRange: 4, cooldown: 3.2, damage: 55, force: 220, spread: 0.05, releaseAt: 0.7, windup: 1.0, reach: 4,
    },
    look: { skin: '#e8b48a', hat: 'feather', top: 'fur', legs: '#6b4a2b', bare: true, paint: true },
    personality: { aggro: 1, bravery: 0, voice: 0.7, chatter: 0.7, cry: 'ooga', idle: 'bounce' },
    desc: 'A woolly mountain. Tramples everything and tosses units with its tusks while the rider throws spears.',
  },
  {
    id: 'sm_catapult', name: 'Catapult', faction: 'medieval', cost: 1000, hp: 110, speed: 3.8,
    build: { scale: 0.98, girth: 1.05, radius: 2.6 },
    weapon: { kind: 'sm_catapult', style: 'sword', anim: 'overhead', item: 'sm_mallet', proj: 'sm_boulder', damage: 160, force: 1200, blast: 2.8, range: 62, minRange: 12, cooldown: 7.5, reach: 1.1, spread: 0.035 },
    look: { skin: '#f0c49a', hat: 'cap', top: 'tunic', legs: '#6e5235' },
    personality: { aggro: 0.3, bravery: 0, voice: 1.0, chatter: 0.5, cry: 'hey', idle: 'lean' },
    desc: 'Lobs boulders that crush groups and roll on. Slow to reload. Wreck the cart or kill the crew to stop it.',
  },
  {
    id: 'sm_ballista', name: 'Ballista', faction: 'medieval', cost: 700, hp: 100, speed: 3.8,
    build: { scale: 0.98, girth: 1.0, radius: 2.1 },
    weapon: { kind: 'sm_ballista', style: 'sword', anim: 'overhead', item: 'sm_mallet', proj: 'sm_bolt', speed: 46, damage: 130, force: 800, range: 50, minRange: 5, cooldown: 4.2, reach: 1.1, spread: 0.012 },
    look: { skin: '#f2c8a0', hat: 'cap_metal', top: 'tunic', legs: '#5a4630' },
    personality: { aggro: 0.3, bravery: 0, voice: 1.05, chatter: 0.4, cry: 'charge', idle: 'shift' },
    desc: 'A giant crossbow. Its bolts skewer a whole line of soldiers.',
  },
  {
    id: 'sm_valkyrie', name: 'Valkyrie', faction: 'legacy', cost: 850, hp: 650, speed: 6.5,
    build: { scale: 1.02, girth: 0.95 },
    weapon: { kind: 'sm_valkyrie', style: 'sword', anim: 'overhead', item: 'sword', damage: 80, reach: 1.4, cooldown: 1.5, force: 450, sweep: true },
    look: { skin: '#f2c8a0', hat: 'sm_valk', top: 'tunic', legs: '#5e5048' },
    personality: { aggro: 1, bravery: 0, voice: 1.3, chatter: 0.6, cry: 'charge', idle: 'bounce' },
    armor: 0.25, stagger: 0.45,
    desc: 'Flies above the battle and dives on her targets, sword first.',
  },
];
const DEF = Object.fromEntries(UNITS.map((d) => [d.id, d]));

setupRidePoses({
  sm_lance: { cfg: HORSE, standHeight: makeSkeleton(DEF.sm_cavalry.build).standHeight },
  sm_mthrow: { cfg: MAMMOTH, standHeight: makeSkeleton(DEF.sm_mammoth.build).standHeight },
});
EXT.pose.push(smPose);

// extra bodies per unit, in creation order (shared by decorate and init)
function layoutFor(def, skel) {
  switch (def.id) {
    case 'sm_cavalry': return mountLayout(HORSE);
    case 'sm_mammoth': return mountLayout(MAMMOTH);
    case 'sm_catapult': return siegeLayout(CATAPULT);
    case 'sm_ballista': return siegeLayout(BALLISTA);
    case 'sm_valkyrie': return wingLayout(skel, restSt(def));
  }
  return null;
}

register({
  units: UNITS,
  items: {
    sm_lance: { len: 3.2, r: 0.08, grip: 90, back: 0.22, metal: true },
    sm_mallet: { len: 0.85, r: 0.1, grip: 30, heavy: true },
  },
  buildItem(name, s, team, g, H) {
    if (name === 'sm_lance') { const L = 3.2 * s; M.lance(H, s, team, g, L, 0.22 * L); return true; }
    if (name === 'sm_mallet') { M.mallet(H, s, team, g); return true; }
    return false;
  },
  buildHat(kind, r, team, g, H) {
    if (kind !== 'sm_valk') return false;
    M.valkHelm(H, r, team, g);
    return true;
  },
  decorate(def, team, vis, H) {
    const lay = layoutFor(def, vis.skel);
    if (!lay) return;
    for (const l of lay) vis.extraParts.push({ group: l.mesh(H, team), pos: l.pos, quat: l.quat });
  },
  kinds: {
    sm_cavalry: { melee: true, init: (u) => mountInit(u, HORSE), think: cavalryThink, step: riderStep, hit: riderHit, die: riderDie },
    sm_mammoth: { init: (u) => mountInit(u, MAMMOTH), think: mammothThink, step: riderStep, hit: riderHit, die: riderDie, event: rangedEvent },
    sm_catapult: { melee: true, init: (u) => siegeInit(u, CATAPULT), think: siegeThink, event: siegeEvent, die: siegeCrewDie },
    sm_ballista: { melee: true, init: (u) => siegeInit(u, BALLISTA), think: siegeThink, event: siegeEvent, die: siegeCrewDie },
    sm_valkyrie: { melee: true, init: valkInit, think: valkThink, step: valkStep },
  },
  proj: PROJ,
  buildProj(type, g, H) {
    if (type === 'sm_boulder') { g.add(M.rock(H)); return true; }
    if (type === 'sm_bolt') { g.add(M.bolt(H, 'y')); return true; }
    return false;
  },
  battleStep(b, dt) {
    const s = b._sm;
    if (!s) return;
    for (const m of s.mounts) stepMount(b, m, dt);
    for (const c of s.sieges) stepSiege(b, c, dt);
    for (const f of s.flyers) stepFlyer(b, f);
    stepStuck(s);
  },
});

export { S };
