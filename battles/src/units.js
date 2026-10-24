// The roster. Each unit: build (body proportions), stats, weapon and personality.
//
// weapon.kind:
//   melee  - swing/stab with `anim`; damage scaled by how fast the weapon actually moves
//   ranged - launches projectile `proj` (see combat.js PROJ table)
//   heal   - heals hurt allies around it
//   bard   - plays music that inspires nearby allies (faster, harder hitting)
// personality:
//   aggro    0..1  how eagerly it charges (ranged/support units hang back when low)
//   bravery  0..1  below this fraction of hp the unit panics and runs for a while
//   voice    pitch multiplier of its grunts; chatter = how often it talks
//   cry      battle cry vowel set; idle = what it does while waiting
export const FACTIONS = [
  { id: 'tribal', name: 'Tribal', color: '#c98a4b' },
  { id: 'farmer', name: 'Farmer', color: '#8fbf4a' },
  { id: 'medieval', name: 'Medieval', color: '#7f9ad1' },
  { id: 'legacy', name: 'Legacy', color: '#c66bd1' },
];

export const UNITS = [
  // ---------------- Tribal
  {
    id: 'clubber', name: 'Clubber', faction: 'tribal', cost: 70, hp: 100, speed: 4.6,
    build: { scale: 1, girth: 1.05, head: 1.05 },
    weapon: { kind: 'melee', style: 'sword', anim: 'overhead', item: 'club', damage: 24, reach: 1.3, cooldown: 1.15, force: 260 },
    look: { skin: '#e8b48a', hat: 'headband', top: 'fur', legs: '#6b4a2b', bare: true },
    personality: { aggro: 1, bravery: 0, voice: 0.85, chatter: 0.6, cry: 'ooga', idle: 'thump' },
    desc: 'A big lump with a bigger stick.',
  },
  {
    id: 'protector', name: 'Protector', faction: 'tribal', cost: 80, hp: 170, speed: 3.6,
    build: { scale: 1.05, girth: 1.15 },
    weapon: { kind: 'melee', style: 'shield', anim: 'overhead', item: 'bone', shield: 'wood', damage: 16, reach: 1.15, cooldown: 1.0, force: 340, blockMelee: 0.55 },
    look: { skin: '#e8b48a', hat: 'skullcap', top: 'fur', legs: '#5a3e24', bare: true },
    personality: { aggro: 0.9, bravery: 0, voice: 0.75, chatter: 0.3, cry: 'ooga', idle: 'brace' },
    desc: 'Hides behind a big wooden shield and shoves.',
  },
  {
    id: 'spear_thrower', name: 'Spear Thrower', faction: 'tribal', cost: 120, hp: 90, speed: 4.2,
    build: { scale: 0.98, girth: 0.95 },
    weapon: { kind: 'ranged', style: 'throw', anim: 'throw', item: 'spear_hand', proj: 'spear', speed: 22, arc: 'low', range: 26, minRange: 7, cooldown: 3.2, damage: 60, force: 220, spread: 0.05, releaseAt: 0.7, windup: 1.0 },
    look: { skin: '#e8b48a', hat: 'feather', top: 'fur', legs: '#6b4a2b', bare: true, paint: true },
    personality: { aggro: 0.4, bravery: 0.25, voice: 1.0, chatter: 0.5, cry: 'ooga', idle: 'bounce' },
    desc: 'Throws heavy spears that pin enemies.',
  },
  {
    id: 'chieftain', name: 'Chieftain', faction: 'tribal', cost: 400, hp: 340, speed: 5.4,
    build: { scale: 1.2, girth: 1.15, head: 1.05 },
    weapon: { kind: 'melee', style: 'twohand', anim: 'slam', item: 'big_axe', damage: 70, reach: 1.9, cooldown: 1.7, force: 520, sweep: true },
    look: { skin: '#d9a173', hat: 'antlers', top: 'fur', legs: '#4a321c', bare: true, paint: true },
    personality: { aggro: 1, bravery: 0, voice: 0.65, chatter: 0.8, cry: 'roar', idle: 'thump' },
    desc: 'Sprints in and cleaves with a giant axe.',
  },
  // ---------------- Farmer
  {
    id: 'halfling', name: 'Halfling', faction: 'farmer', cost: 50, hp: 60, speed: 5.8,
    build: { scale: 0.62, girth: 1.05, head: 1.25, legs: 0.9, mass: 1.2 },
    weapon: { kind: 'melee', style: 'sword', anim: 'overhead', item: 'pitchfork_small', damage: 20, reach: 0.9, cooldown: 0.55, force: 90 },
    look: { skin: '#f2c49b', hat: 'curls', top: 'vest', legs: '#6e5235' },
    personality: { aggro: 1, bravery: 0.4, voice: 1.8, chatter: 1, cry: 'yip', idle: 'hop' },
    desc: 'Tiny, fast and very excitable.',
  },
  {
    id: 'farmer', name: 'Farmer', faction: 'farmer', cost: 80, hp: 110, speed: 4.2,
    build: { scale: 1, girth: 1.1 },
    weapon: { kind: 'melee', style: 'spear', anim: 'stab', item: 'pitchfork', damage: 30, reach: 1.9, cooldown: 1.2, force: 230 },
    look: { skin: '#f0c49a', hat: 'straw', top: 'overalls', legs: '#7d6040' },
    personality: { aggro: 0.9, bravery: 0.2, voice: 0.9, chatter: 0.5, cry: 'hey', idle: 'lean' },
    desc: 'Pokes things with a pitchfork. Grumbles.',
  },
  {
    id: 'hay_baler', name: 'Hay Baler', faction: 'farmer', cost: 140, hp: 150, speed: 3.8,
    build: { scale: 1.08, girth: 1.25 },
    weapon: { kind: 'ranged', style: 'throw', anim: 'throw', item: 'hay_hand', proj: 'hay', speed: 15, arc: 'low', range: 20, minRange: 5, cooldown: 3.0, damage: 45, force: 900, spread: 0.06, releaseAt: 0.7, windup: 1.2 },
    look: { skin: '#f0c49a', hat: 'cap', top: 'overalls', legs: '#7d6040' },
    personality: { aggro: 0.5, bravery: 0.2, voice: 0.8, chatter: 0.4, cry: 'hey', idle: 'lean' },
    desc: 'Bowls hay bales that knock over everything.',
  },
  {
    id: 'potion_seller', name: 'Potion Seller', faction: 'farmer', cost: 340, hp: 130, speed: 3.9,
    build: { scale: 0.98, girth: 1.1, head: 1.05 },
    weapon: { kind: 'ranged', style: 'throw', anim: 'throw', item: 'potion_hand', proj: 'potion', speed: 14, arc: 'high', range: 24, minRange: 6, cooldown: 2.6, damage: 90, force: 380, spread: 0.07, releaseAt: 0.7, windup: 0.9, blast: 3.6 },
    look: { skin: '#e9c09a', hat: 'hood', top: 'robe', legs: '#4c3a5e', beard: '#d9d9d9' },
    personality: { aggro: 0.35, bravery: 0.3, voice: 1.2, chatter: 0.9, cry: 'cackle', idle: 'shake' },
    desc: 'My potions are too strong for you, traveller.',
  },
  // ---------------- Medieval
  {
    id: 'bard', name: 'Bard', faction: 'medieval', cost: 60, hp: 60, speed: 4.4,
    build: { scale: 0.95, girth: 0.95 },
    weapon: { kind: 'bard', style: 'lute', anim: 'overhead', item: 'lute', damage: 8, reach: 1.1, cooldown: 1.0, force: 120, auraRadius: 7 },
    look: { skin: '#f2c8a0', hat: 'feathercap', top: 'tunic', legs: '#8a3a7a' },
    personality: { aggro: 0.1, bravery: 0.6, voice: 1.35, chatter: 1, cry: 'la', idle: 'play' },
    desc: 'Plays inspiring music. Runs away from danger.',
  },
  {
    id: 'squire', name: 'Squire', faction: 'medieval', cost: 100, hp: 120, speed: 4.3,
    build: { scale: 1 },
    weapon: { kind: 'melee', style: 'shield', anim: 'overhead', item: 'sword', shield: 'round', damage: 28, reach: 1.35, cooldown: 1.0, force: 200, blockMelee: 0.35 },
    look: { skin: '#f2c8a0', hat: 'cap_metal', top: 'tunic', legs: '#5a4630' },
    personality: { aggro: 0.9, bravery: 0.15, voice: 1.0, chatter: 0.5, cry: 'charge', idle: 'shift' },
    desc: 'Sword, shield, and a little bit of courage.',
  },
  {
    id: 'archer', name: 'Archer', faction: 'medieval', cost: 140, hp: 80, speed: 4.4,
    build: { scale: 0.97, girth: 0.95 },
    weapon: { kind: 'ranged', style: 'bow', anim: 'bow', item: 'bow', proj: 'arrow', speed: 34, arc: 'low', range: 38, minRange: 8, cooldown: 2.0, damage: 36, force: 90, spread: 0.035, releaseAt: 0.78, windup: 1.0 },
    look: { skin: '#f2c8a0', hat: 'hood_green', top: 'tunic', legs: '#4f5a2e', quiver: true },
    personality: { aggro: 0.3, bravery: 0.3, voice: 1.05, chatter: 0.4, cry: 'charge', idle: 'shift' },
    desc: 'Lobs arrows from a safe distance.',
  },
  {
    id: 'healer', name: 'Healer', faction: 'medieval', cost: 180, hp: 90, speed: 4.2,
    build: { scale: 0.97, girth: 1.0 },
    weapon: { kind: 'heal', style: 'heal', anim: 'heal', item: 'none', amount: 40, radius: 5, cooldown: 2.4, damage: 6, reach: 1.0, force: 60 },
    look: { skin: '#f2c8a0', hat: 'nun', top: 'robe_white', legs: '#e8e8e8' },
    personality: { aggro: 0.05, bravery: 0.5, voice: 1.4, chatter: 0.6, cry: 'la', idle: 'pray' },
    desc: 'Heals the wounded. Stays out of the fight.',
  },
  {
    id: 'knight', name: 'Knight', faction: 'medieval', cost: 650, hp: 500, speed: 3.6,
    build: { scale: 1.12, girth: 1.12, mass: 1.6 },
    weapon: { kind: 'melee', style: 'twohand', anim: 'slam', item: 'greatsword', damage: 70, reach: 2.0, cooldown: 1.5, force: 420, sweep: true },
    look: { skin: '#f2c8a0', hat: 'helm_knight', top: 'armor', legs: '#8d939c', armor: true },
    personality: { aggro: 0.85, bravery: 0, voice: 0.8, chatter: 0.2, cry: 'charge', idle: 'shift' },
    armor: 0.45, stagger: 0.4,
    desc: 'Heavily armoured. Shrugs off arrows.',
  },
  {
    id: 'king', name: 'King', faction: 'medieval', cost: 1500, hp: 1200, speed: 3.2,
    build: { scale: 1.45, girth: 1.3, head: 1.05, mass: 1.8 },
    weapon: { kind: 'melee', style: 'twohand', anim: 'slam', item: 'kingsword', damage: 160, reach: 2.8, cooldown: 2.1, force: 1100, sweep: true },
    look: { skin: '#f2c8a0', hat: 'crown', top: 'royal', legs: '#5b2c7a', cape: true, beard: '#7a5232' },
    personality: { aggro: 0.8, bravery: 0, voice: 0.6, chatter: 0.5, cry: 'royal', idle: 'regal' },
    armor: 0.3, stagger: 0.25,
    desc: 'Royal sword. Sends peasants into orbit.',
  },
  // ---------------- Legacy
  {
    id: 'berserker', name: 'Berserker', faction: 'legacy', cost: 420, hp: 320, speed: 6.4,
    build: { scale: 1.1, girth: 1.05 },
    weapon: { kind: 'melee', style: 'dual', anim: 'dual', item: 'axe', item2: 'axe', damage: 46, reach: 1.35, cooldown: 0.65, force: 260 },
    look: { skin: '#f0c4a0', hat: 'viking', top: 'bare_belt', legs: '#5e5048', bare: true, beard: '#d27a2c', paint: true },
    personality: { aggro: 1, bravery: 0, voice: 0.8, chatter: 1, cry: 'roar', idle: 'bounce' },
    stagger: 0.5, frenzy: true,
    desc: 'Dual axes. Feels no pain. Never stops.',
  },
  {
    id: 'bomber', name: 'Bomber', faction: 'legacy', cost: 300, hp: 90, speed: 4.6,
    build: { scale: 0.95, girth: 1.0, head: 1.1 },
    weapon: { kind: 'ranged', style: 'throw', anim: 'throw', item: 'bomb_hand', proj: 'bomb', speed: 13, arc: 'high', range: 22, minRange: 6, cooldown: 2.6, damage: 110, force: 650, spread: 0.08, releaseAt: 0.7, windup: 0.9, blast: 3.8 },
    look: { skin: '#f2c8a0', hat: 'goggles', top: 'apron', legs: '#3d3d3d' },
    personality: { aggro: 0.45, bravery: 0.2, voice: 1.3, chatter: 1, cry: 'cackle', idle: 'shake' },
    deathBomb: true,
    desc: 'Throws bombs. Also explodes when it dies.',
  },
  {
    id: 'wizard', name: 'Wizard', faction: 'legacy', cost: 900, hp: 240, speed: 3.6,
    build: { scale: 1.0, girth: 1.0, head: 1.05 },
    weapon: { kind: 'ranged', style: 'staff', anim: 'cast', item: 'staff', proj: 'fireball', speed: 20, arc: 'flat', range: 34, minRange: 9, cooldown: 2.6, damage: 90, force: 560, spread: 0.02, releaseAt: 0.62, windup: 1.2, blast: 4.0 },
    look: { skin: '#f2c8a0', hat: 'wizard', top: 'robe_blue', legs: '#2c3c8c', beard: '#eeeeee' },
    personality: { aggro: 0.3, bravery: 0.35, voice: 0.95, chatter: 0.7, cry: 'magic', idle: 'float' },
    desc: 'Hurls exploding fireballs.',
  },
  {
    id: 'giant', name: 'Giant', faction: 'legacy', cost: 1600, hp: 1400, speed: 3.4,
    build: { scale: 2.3, girth: 1.2, head: 0.9, legs: 1.05, arms: 1.15, armThick: 1.3, mass: 1.4 },
    weapon: { kind: 'melee', style: 'fists', anim: 'slam', item: 'none', damage: 120, reach: 1.9, cooldown: 2.0, force: 1700, sweep: true, fistHit: true },
    look: { skin: '#a7b88a', hat: 'none', top: 'loincloth', legs: '#7a5a3a', bare: true, brow: true },
    personality: { aggro: 0.9, bravery: 0, voice: 0.45, chatter: 0.5, cry: 'roar', idle: 'thump' },
    armor: 0.1, stagger: 0.1,
    desc: 'Huge. Slaps whole squads across the map.',
  },
];

export const UNIT_BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u]));
export const unitsOfFaction = (f) => UNITS.filter((u) => u.faction === f);
