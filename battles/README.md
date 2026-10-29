# Wobbly Battles

A wobbly physics battle game in the style of *Totally Accurate Battle Simulator* for two players on one
screen: both players build their armies **at the same time** in split screen
with Xbox controllers, then watch the wobbly active-ragdoll battle together.

What's left to do is in `TODO.md`; unit balance notes are in `BALANCE.md`. Art requests
are in `image-requests.md` and music requests in `music-requests.md`.

Serve the repo root over http (ES modules) and open `/battles/`:

    python3 -m http.server 8123   # then http://localhost:8123/battles/

`?q=low` forces the Low graphics quality at boot; otherwise *Options → Graphics
quality* (Low / Medium / High: render scale and shadow resolution) is saved with the
other settings.

### Big battles and low frame rates

The game is built not to freeze, however big the battle (`src/perf.js`):

- Each frame runs only as many physics steps as fit in a time budget, so a heavy
  battle **slows down** instead of the controls, camera and menus locking up. When a
  single step is slower than the budget, some frames skip the simulation so the
  picture and UI keep updating. Button taps shorter than a slow frame still count
  (pads are sampled between physics steps, keys latch on press).
- A small badge shows when the battle runs below 80% speed. When the frame rate stays
  under 15 fps (or the battle under 45% speed) for 3 s, a banner says so, and **Menu**
  opens the pause menu straight on its **Performance** page. From there you can resume,
  change settings live, edit the armies or quit to the main menu.
- *Performance* options are in the pause menu, the setup menu and *Options*:
  - graphics quality and resolution (100–35%)
  - auto resolution, which lowers the render scale while frames are slow for reasons
    other than the simulation
  - shadows
  - effects (Reduced means fewer particles and no footstep dust)
  - distant units: in armies of 120+, far-away units are drawn as simple stand-ins
    (~80 triangles instead of ~10,000)
  - fallen units: they vanish 10 s after falling (live and in the replay)
  - under heavy load: *Smooth controls*, *Balanced* or *Full speed*. This sets how
    much of each frame the simulation may take.
  - a frame-rate counter
- Identical units share their baked meshes, so a big army doesn't upload one copy per
  soldier. Battles of 300+ units show "Preparing the battle…" while they're built.
- Replays keep to about 450 MB. A big battle records less than 6 minutes, and a huge
  one (over about 1,000 units) records at 20 or 10 Hz instead of 30.

## Modes

- **Versus** (2 players): army setup in split screen, P1 = Blue on the left half of
  the field, P2 = Red on the right, both building at once → both press **Y** (ready)
  → 3 s countdown (Y cancels) → **battle** (shared or split camera) → **result**
  menu (replay, slow-mo final moments, rematch / next round, edit armies, main menu)
  → **replay**. Match options on the Versus page: single battle or best of 3 / 5
  (round score on the battle HUD and result), *round bonus* (the loser gets +25%
  gold per round lost in a row), *setup timer* (30–120 s; at zero the armies are
  trimmed to their limits, an empty one gets a random army, and the battle starts)
  and *blind setup* (each player only sees their own army until the countdown).
- **Campaign** (1 player, or 2-player co-op where both build the Blue army with one
  shared budget in split screen): fixed enemy armies on a map with a gold budget and
  unit limit. Wins give 1–3 stars by gold spent (★★★ ≤ 70% of the budget, ★★ ≤ 90%);
  levels unlock in order and each world unlocks when the previous one is beaten.
  Worlds limit the factions you may use. Levels are data in `src/campaign.js`
  (unknown unit ids are skipped); progress and your army per level are saved in
  `localStorage` (`wobbly-battles.campaign.v1`).
- **Sandbox**: free play with no match score. It has its own *Budget* and *Unit limit*,
  separate from Versus, and both default to **Unlimited** (the limit can also be set from
  40 up to 1,000; limits above 180 are marked *heavy*). *Players: 1* is one full-screen setup
  where you build both armies (tap **View** to switch side, **Y** starts the battle).
  *Players: 2* is split screen, each player builds one army and the battle starts when
  both are ready — like Versus without rounds, timer or blind setup.
  *Armies: 2 / 3 / 4* adds **Yellow** and **Green**: with more than two, every army fights
  every other (free-for-all, last army standing wins) and the zones become the four corners
  of the field (Blue and Red still face each other across the middle). **View** (or the
  menu's *Build the … army*) cycles through the armies you can build; in a 2-player sandbox
  each player can build any army but the other player's. The battle HUD shows a count for
  each army. Simulations can have 3-4 sides too (*3-4 armies* row). In code: `Battle` takes
  any number of armies and `battle.foes(team)` lists every enemy unit (use it, not
  `teams[1 - team]`); zones are `zoneRect` / `zonePoint` in `src/world.js`.
- **Simulation** (`src/sims.js`): ready-made battles to watch, picked from a screen laid
  out like the level select, one row per category: **Real battles** (Thermopylae, Cannae,
  Hastings, Stamford Bridge, Agincourt, Sekigahara, Nassau, Waterloo, Little Bighorn),
  **Jujutsu Kaisen** (*Sorcerers vs Curses*: one of every sorcerer against one of every
  curse, sides from each unit's `side`; Shibuya, the Shinjuku Showdown, the Culling Game in
  Sendai and Tokyo No. 2, the Trial, the Goodwill Event, Megumi vs Reggie Star, the Detention
  Centre, Hidden Inventory, Yuki & Choso vs Kenjaku, "Nah, I'd win"), **Avatar** (the Siege
  of Ba Sing Se, the Day of Black Sun, the Crossroads of Destiny, Agni Kai, Sozin's Comet),
  **Sci-fi & games** (Galactic, Minecraft, dinosaurs vs cowboys, the undead) and
  **Crossovers** (Sorcerers vs Benders, Sukuna vs a medieval army, Gods & Monsters, and a
  *Random War* between two random factions with the same gold). **X** sets the army
  size (Small ×½, Normal, Epic ×2: crowds scale, heroes don't), **Y** chooses between
  watching at once and editing the armies first. A simulation plays as a 1-player sandbox
  with no gold or unit limits; the HUD and result name the two sides. Your own sandbox
  armies are parked meanwhile and come back on the main menu (simulation armies are never
  saved). Formations step off walls and water on maps with features. Scenarios are data
  (format at the top of `src/sims.js`; unknown unit ids are skipped);
  `node battles/dev/balance/sims.mjs` fights them headless and prints who wins how often.
- **Unit Creator**: design up to 24 custom units, with a live, turning 3D preview
  that shows the attack. Tabs (**LB/RB**): *Unit* (name with an on-screen keyboard
  or typed, personality/voice, rank), *Body* (size, build, head, legs), *Look* (every
  hat and outfit in the game, skin, trousers, boots, beard) and *Weapon* (any held
  weapon of the base game and the packs, plus an optional shield or second weapon).
  **X** randomises the tab, **Y** previews the other team colour, **Menu** saves. The
  list page edits (**A**), duplicates (**X**) and deletes (**Y**). Stats are derived
  and the gold cost is computed from them (`src/packs/custom.js`), so custom units
  can't be cheap for what they do. Saved units appear under the **Custom** faction tab
  in versus and sandbox setup (not in the campaign). They're stored in `localStorage`
  (`wobbly-battles.custom.v1`) as recipes, not stats. Deleted or unknown custom units
  are dropped from saved armies.

In every setup: **Start → Random army** fills your side with a random mix within
the limits (one undo step), hold **View** to clear your side (undo brings it back),
and the roster at the top right lists each unit type with its count and gold (in
sandbox, the other army's too).

Pads bind to players in the order they connect and keep their slot until unplugged;
the title shows which pad is which player, and **View** there swaps sides (the pad
that rumbles is Blue). Unplugging a pad pauses a battle and un-readies a player in
setup. Settings are saved in `localStorage` (`wobbly-battles.v1`); armies aren't kept
between sessions. A new session starts with an empty field, and so does each game started
from the menu, unless it's the versus / sandbox game you just left with exactly the same
settings (mode, battleground, gold and unit limits, players, armies...): then your armies
come back. Changing the battleground from the setup menu takes the armies along (as far
as they fit).

**Taking control from the start**: in setup, **X** on one of your placed units (the one the
red remove ring is on) tags it (a spinning gold marker over it; X again untags). Undo is **R3** (V; hold to
repeat); the camera reset is in the setup menu. When the battle starts you're in control of it. Each player can tag
one unit; in shared screen only one player can start in control (P1 first).

**Saved battles** (`src/saves.js`): the setup menu has *Save battle…* (8 slots: the
battleground, the armies and the tags) and, in the sandbox, *Load battle…*; the title's
Sandbox page has *Load battle…* too. Every battle that starts is also saved as **Last
battle**. A loaded battle opens in the sandbox (with no gold or unit limit if it wouldn't
fit). A live battle isn't saved: it starts again from its setup.

Options: default battle screen (shared / split), the performance options, look speed,
invert Y, googly eyes (TABS-style 3D eyes with loose pupils, on by default), blood, sound, music, recorded or synthesised sound effects, and going
fullscreen when a game starts. The **corner buttons** (top right, hidden while the
mouse is idle) toggle fullscreen, sound and music, and the gear opens the settings for
the current screen. Leaving the title with a controller (or key) press goes fullscreen,
as in the other games.

Audio: the title, planning and battle songs and the victory / defeat / battle-start
stingers are recorded files in `assets/music/` (see `music-requests.md`), as are eight
world / faction battle themes (Tribal, Medieval, Pirate, Wild West, Viking, Dynasty, JJK,
Avatar). The files keep their delivered names (`tribal-stomp.mp3`...);
`assets/music/tracks.js` maps each role (`title`, `setup`, `battle_tribal`, `victory`...)
to its file, with its loop point. Each battle picks its song
(`battleTheme` in `src/game.js`): the battleground's own theme (`music` on the map, once
delivered: Castle → Medieval, Pirate Cove → Pirate, Volcano Jungle → Tribal, Canyon Ruins →
Wild West), else a campaign world's theme, else the theme of the factions
holding most of the gold on the field (Tribal / Farmer / Prehistoric → Tribal; Medieval /
Legacy / Renaissance → Medieval; Pirate; Wild West; Viking; Dynasty; JJK Sorcerers / JJK Curses → JJK; Avatar), else the
main battle theme or the second one (the cavalry charge) or, half the time, one of the world themes (not JJK's electric one,
which stays with JJK armies). Setup and the result screen play the planning version of the battle
song that's coming (`setupTheme`: the battleground's, a campaign world's, or the factions
holding most of the gold already placed), once that planning song is delivered (Tribal, Medieval,
Wild West, Viking, JJK and Avatar are, and Dynasty borrows Avatar's; Pirate and Dynasty are requests 1-2 in
`music-requests.md`); until then, and
otherwise, the main setup theme. Songs stream and loop with a crossfade before their ending. The sound effects are ElevenLabs
recordings in `assets/sfx/` (several variants each, loudness matched to the synth;
`dev/sfx/generate.py` and `calibrate.cjs` remake them). Voices and the other music are
synthesised, and every recorded sound falls back to its synth if its file is missing.

JJK voice lines and signature sounds come from the owner's **jjkbrawler** game
(`assets/sfx/` there; same files, same preferred takes as its `config_audio.js`), in
`assets/sfx/jjk/` with their own `index.json` (names and levels; separate from
`assets/sfx/index.json`, which the generator rewrites). They load only for a battle with
JJK units in it. Spoken lines (`vo_*`): every Domain Expansion call-out (Gojo, Sukuna,
Megumi, Mahito, Jogo, Dagon, Hakari, Yuta: played from `openDomain` by domain name) and
Inumaki's cursed speech ("Don't move", "Blast away", and "Get crushed" / the "twist and
blast away" ultimate for his "Die"); never pitch-shifted, heard across the field, and
played even with Sound effects: Synthesised (there's no synth for words). Effects
(`jk_*`, recorded only, layered over the synth sounds and skipped when Synthesised): each
domain's stinger, the barrier going up and collapsing, Black Flash, Todo's Boogie Woogie
clap, Mahito reshaping a soul, Nanami's 7:3 seam crack.

Watching the battle: **A** follows the unit in the crosshair (its stats card shows
health, kills and damage), **X** takes control of it (TABS's *Take control*: left
stick walks relative to the camera, right stick looks, **RT** attacks, **LT** blocks (ranged units: aims)
(zoom), **A** jumps; shooters and casters fire at the crosshair, riders steer their mount
with the stick, flyers dive on the crosshair, and a siege crew at its engine lays it on the
crosshair and fires it). Buttons while in control (`src/skills.js`, keyboard in brackets):
**X** (F) the main / melee attack (a ranged-only unit shoves whoever is right in front),
**RT** (C) the ranged attack if it has one (else it attacks like X), **LT** (Z) block /
aim as before, **LB** (Q) a special technique, **RB** (E) the domain or an area technique
(a character with neither puts its second special there), **Y** (Y) one more special;
the D-pad's ↑↓ time speed still works while you're in control. Each has its own cooldown on the skill
bar at the bottom right. E.g. Gojo: X a shove, RT Red, LB Blue, RB Unlimited Void, Y Hollow
Purple; Sukuna: X Dismantle, RT Fuga, LB Cleave, RB Malevolent Shrine; Jogo: RT Ember
Insects, LB Eruption, RB his domain, Y Maximum: Meteor; Megumi: LB the next ready
shikigami (Dogs, Nue, Toad), Y Max Elephant; Yuta: Y calls Rika out or sends her back. Every
JJK character with a technique, the Avatar heroes and the Galactic Dark Lord and Jetpack
Hunter have them; targeted ones go for the enemy under the crosshair, domains open where
you stand. A press during a swing fires when it ends; the tile says why not when it can't
(cooldown, burnt out, no target). While possessed a unit never fires these by itself;
reflexes and last stands stay automatic (Infinity, Iroh's redirection, Mahoraga's wheel,
Rika's full manifestation), **B** on the free camera hands over to the cinematic camera,
**Y** eases into slow motion, **R3** cycles tips / HUD off (photo mode). In shared
screen either pad does all of this; in split screen each pad drives its own view.

## Controls (Xbox pad, standard mapping)

| | Setup | Battle | Replay |
|---|---|---|---|
| Left stick | slide over the field | fly · follow: zoom · possess: walk | fly · follow: zoom |
| Right stick | look | look · follow: orbit · possess: aim | look / orbit |
| LB / RB | faction tab | down / up · following: prev / next unit · possess: LB special, RB domain / area technique | same |
| L3 | fast · hold + right stick ↑↓: camera down / up | fast fly | fast fly |
| A | place (hold to paint) | follow unit in crosshair · possess: jump | play / pause |
| B | remove (hold) | free cam: cinematic camera · else free camera / let go | free camera, then exit |
| X | on one of your units: tag it to take control of when the battle starts | possess unit in crosshair (or the followed one) · possess: main / melee attack | follow unit |
| Y | ready / not ready | slow motion · possess: a special technique | slow-mo final moments |
| LT / RT | previous / next unit in the tab (wraps round) | LT hold: slow smooth cam · possess: LT block / aim, RT ranged attack | scrub back / forward |
| D-pad | ←→ unit (on into the next faction), ↑↓ brush: single, line ×3/×5, block 3×3/4×4 | ↑↓ time speed (down to frozen) · ←→ FOV | ←→ skip 3 s · ↑↓ speed |
| R3 | undo (hold to repeat; reset camera is in the Start menu) | tips / HUD off (photo mode) | same |
| View | clear army (asks) | split / shared screen | split / shared |
| Start (Menu) | menu: ready, map, budget, blind, performance, quit | pause: performance, cinematic camera, screen, HUD, time, restart, edit, quit | menu |

All menus take D-pad or left stick (with repeat), A to select, B to go back. In
shared screen either pad drives the camera; in split screen each player has their
own. The result menu uses the D-pad so the sticks can keep flying the camera.
Keyboard fallback for both players is listed on the title screen's *Controls* page.

## Factions

Each faction is a tab in setup. The base four (Tribal, Farmer, Medieval, Legacy) are in
`src/units.js`; the others are packs in `src/packs/` (Viking, Ancient, Dynasty, Wild
West, Spooky, Pirate, Renaissance, Prehistoric, Good, Evil, Secret, Galactic, plus the
Custom tab of the Unit Creator). Faction tab emblems are `assets/ui/faction-<id>.png`
when delivered; without one the tab shows just the name in the faction colour.

- **Galactic** (`src/packs/galactic.js`, space opera): Battle Droid (cheap swarm, weak
  blaster, falls apart), Blaster Trooper (bursts of glowing bolts, inaccurate), Laser
  Knight (fast energy sword; bats blaster bolts back at the shooter, catches blows and
  arrows), Space Furball (heavy crossbow-blaster, swats anyone close, roars into a rage),
  Jetpack Hunter (hovers over the line, blaster pistol and wrist rockets), Dark Lord
  (red energy sword, force push and force choke) and the Walker (a four-legged mech
  with twin heavy cannons that stomps whatever gets in among its legs). Bolts glow cyan
  for Blue and red for Red.
- **Jujutsu Kaisen: the strongest** (`src/packs/jjk-strongest.js`, on the shared core
  `jjk-core.js`): **Satoru Gojo** (Infinity with short gaps, Red, Blue, Hollow Purple;
  domain *Unlimited Void* freezes everyone inside), **Ryomen Sukuna** (Dismantle and
  Cleave, the Fuga fire arrow; domain *Malevolent Shrine*, no barrier, cuts everything
  inside, his own side a little), **Megumi Fushiguro** (shadow blade; Ten Shadows
  shikigami from his shadow: two Divine Dogs, Nue, Toad, Max Elephant; domain *Chimera
  Shadow Garden*; badly hurt, the Mahoraga ritual) and **Mahoraga** (Sword of
  Extermination; the wheel over its head clicks round each time it adapts to a kind of
  harm, Infinity included). The shikigami are Megumi's reserves (faction `jjk_shiki`, not
  in the shop). Secrets: *Meguna* (an enemy Sukuna near Megumi's ritual may take his
  body: Megumi changes sides with Sukuna's tattoos, techniques and domain, and all his
  shikigami), the Gojo vs Sukuna domain clash, "Nah, I'd win", "Throughout heaven and
  earth…", "Stand proud", all twenty fingers, Mahoraga adapting to Infinity and Sukuna's
  World-Cutting Slash, the King of Curses exorcising Mahoraga.

- **Jujutsu Kaisen: the curses** (`src/packs/jjk-curses.js`, on `jjk-core.js`): Toji
  Fushiguro (no cursed energy, so sure-hits miss him; the Inverted Spear of Heaven cuts
  through Infinity and barriers; Playful Cloud flurry; the Inventory Curse worm), Dagon
  (shikigami fish; domain *Horizon of the Captivating Skandha*, a beach), Mahito (Idle
  Transfiguration turns the people he kills into his transfigured humans; domain
  *Self-Embodiment of Perfection*, hands everywhere), Jogo (Ember Insects, *Maximum:
  Meteor*; domain *Coffin of the Iron Mountain*), Hanami (wooden balls, roots, a flower
  field that saps), Suguru Geto / Kenjaku (Cursed Spirit Manipulation: Stored Curses, then the Rainbow Dragon,
  Kuchisake-onna and two Grasshopper Curses come out of his vortex, Y calls the next one in
  control, and they go back in when he dies; *Maximum: Uzumaki*), Choso (Piercing Blood beam, Supernova), Kinji Hakari (domain *Idle Death
  Gamble*: a JACKPOT makes him all but immortal) and Fly Heads (cheap swarm). Secrets:
  Prison Realm (Geto next to an enemy Gojo), the spear cuts through Infinity, Toji cuts a
  domain open, Mahito can't reshape Yuji (and Yuji's fists hurt his soul), Choso switches
  sides when he meets Yuji ("Big brother!").
- **Jujutsu Kaisen: more sorcerers** (`src/packs/jjk-sorcerers.js`): **Ryu Ishigori** (Granite
  Blast: a charged beam through a whole line), **Takako Uro** (Sky Manipulation: Thin Ice Breaker
  flings a cone of enemies away, and the bent sky turns shots back), **Hajime Kashimo** (lightning
  that can't be parried and arcs on; badly hurt, *Mythical Beast Amber*, and his body burns out
  15 s later), **Hiromi Higuruma** (domain *Deadly Sentencing*: Judgeman tries the costliest enemy
  inside; GUILTY means Confiscation and the Executioner's Sword), **Yuki Tsukumo** (Star Rage
  blows that bowl over everyone round the target, Garuda; at the end, a *Black Hole*), **Mei Mei**
  (great axe, homing crows, Bird Strike), **Noritoshi Kamo** (homing blood arrows; Flowing Red
  Scale), **Naoya Zen'in** (Projection Sorcery: 24-frame blinks that freeze victims in a frame),
  **Ultimate Mechamaru** (Ultra Cannon, thrusters, Absolute Mode) and **Atsuya Kusakabe**
  (Simple Domain: a quick-draw circle, and domain sure-hits can't land on him).
- **Jujutsu Kaisen: more curses** (`src/packs/jjk-spirits.js`): **Kurourushi** (flesh-eating
  bites, swarms of homing cockroaches), **Uraume** (Icefall; Frost Calm freezes a cone solid, and
  a frozen victim shatters), the **Smallpox Deity** (pox aura; shuts the strongest enemy in a coffin and
  counts "One... Two... Three!"), the **Finger Bearer** (swallows a Sukuna finger once when hurt) and
  **Yorozu** (Construction blades, Insect Armour, the True Sphere). Geto's spirits (the
  **Rainbow Dragon**: armoured hide, rams through lines; **Kuchisake-onna**: "Am I beautiful?"
  dazes, then the scissors; the **Grasshopper Curse**: leaps in with a kick) live here too, as
  his summons (faction `jjk_summon`, not sold).
- **Jujutsu Kaisen: villains** (`src/packs/jjk-villains.js`, all JJK Curses): **Shigemo
  Haruta** (knife; *Miracles*: stored lucky breaks, gold stars over his head, each one survives a
  fatal hit), **Jiro Awasaka** (the stronger the blow, the less it does: big hits and techniques
  are cut right down, small hits land), **Reggie Star** (*Contract Re-creation*: a wad of
  receipts fluttering round him buys re-created knives and a car that rams through a line),
  **Ogi Zen'in** (flaming katana, Blazing slash) and **Ogami** (weak; her *Séance* channels Toji
  onto her grandson, and Toji's first blow kills her; near an enemy Megumi he ends it himself:
  "Fushiguro? ...Good for you.").
- **Sorcerers and curses**: JJK is two factions, **JJK Sorcerers** (`jjk_sorcerers`, the good
  side, 21 units) and **JJK Curses** (`jjk_curses`, the evil side, 20 curses and curse users:
  Toji, Geto/Kenjaku, Choso, Uraume and Yorozu fight with the curses); each unit's `side`
  ('sorcerer' / 'curse') matches its faction, and everything JJK-wide checks `isJJK()`. The Simulation *Sorcerers vs Curses* puts one of each on its side and is
  tuned to an even fight (see BALANCE.md).
- **JJK power levels**: one on one the faction follows the anime: Gojo (who teleports
  clear of blows Infinity can't stop, and whose Unlimited Void wins the clash with the
  Shrine) beats Sukuna; Sukuna beats the rest; Toji, Hakari, Yuta and Mahoraga come next
  (Toji is a real threat to Gojo); then the A tier, Nanami / Yuji / Panda, and Nobara /
  Inumaki. Prices follow strength (Gojo 6000, Sukuna 3300). The duel table and its harness
  (`dev/balance/duel.mjs`) are in BALANCE.md, *JJK power levels*.

## Code map

- `src/body.js` skeleton (11 parts, joints, FK) · `src/pose.js` procedural target poses and attack animations
- `src/ragdoll.js` Rapier bodies/joints + muscle servo · `src/unit.js` balance, locomotion, AI, personalities
- `src/units.js` the roster (stats, weapons, looks, personality; `setFactionUnits` swaps a faction's units at runtime and bumps `rosterVersion` / calls `rosterHooks`) · `src/creator.js` the Unit Creator screen · `src/packs/custom.js` custom-unit recipes, storage, derived stats and cost · `src/items.js` held items: hit geometry, mass, shields (held items are colliders on the forearm and drop as rigid bodies on death)
- `src/packs/` faction packs registered through `src/ext.js` (`index.js` lists them): one file per pack faction (`viking.js`, `ancient.js`, `dynasty.js`, `wildwest.js`...), shared helpers in `common.js`, and `classic.js` with the extra Tribal, Farmer and Legacy units (Stoner, Bone Mage, Scarecrow, Harvester, Wheelbarrow, Peasant, Poacher, Barbarian)
- `src/battle.js` simulation: melee sweeps, projectiles, explosions, healing, bard aura; emits events
- `src/replay.js` quantised 30 Hz recording + interpolated playback with event replay
- `src/visual.js` unit meshes (baked per part), faces, hats, weapons, portraits
- `src/world.js` maps/terrain/scenery · `src/fx.js` particles · `src/audio.js` synthesised sfx, voices, music
- `src/maps-new.js` feature maps (castle, river, cove, volcano, canyon, graveyard) · `src/features.js` hills, plateaus, water, bridges, walls and breakables: height grid, colliders, AI steering, placement checks, projectile blocking (all mirrored through the centre for fairness) · `src/mapscene.js` their meshes and set dressing
- `src/packs/` the faction packs (registered through `src/ext.js`, listed in `src/packs/index.js`).
- `src/packs/jjk-*.js` the **Jujutsu Kaisen** factions (JJK Sorcerers `jjk_sorcerers`, JJK Curses `jjk_curses`): `jjk-core.js` (domains with barriers,
  clashes, Prison Realm, Infinity, reserves, secrets) and the characters. `jjk-students.js`: Yuji
  (Divergent Fist, Black Flash), Todo (Boogie Woogie swaps), Nobara (nails, Hairpin, Resonance),
  Nanami (Ratio 7:3, Overtime), Maki (no cursed energy, Split Soul Katana), Panda (Gorilla Core),
  Inumaki (Cursed Speech) and Yuta (Rika, Copy, domain Authentic Mutual Love). Secrets: "Brother!",
  Black Flash × Resonance, Nanami's last words, Rika's full manifestation.
- `src/packs/jjk-sorcerers.js` / `jjk-spirits.js` the 20 JJK characters added with the Simulation
  mode (sorcerer and curse halves; each file is self-contained on `jjk-core.js`);
  `jjk-villains.js` the five human villains (Haruta, Awasaka, Reggie, Ogi, Ogami) and the séance Toji.
- `src/sims.js` the Simulation scenarios (format at its top) · `dev/balance/sims.mjs` fights them headless
- `src/packs/jjk-shared.js` the JJK packs' shared hand-sign/shout animations, Gojo's and Sukuna's
  stances, the curses' claws and the effect markers (Infinity ripple, cuts, shadow pools, Black Flash).
- `src/packs/minecraft.js` the **Minecraft** faction (`minecraft`): Villager (cheap, panics),
  Zombie (arms out, tough), Skeleton (archer that falls to bits), Creeper (walks up, hisses, explodes,
  and still goes off if killed mid-hiss), Witch (splash potions: harming, poison or slowness), Steve
  (diamond sword), Enderman (teleports up to its target and to whoever shoots it) and Iron Golem
  (punches enemies into the sky; the landing hurts). Everyone is built out of boxes in `decorate`,
  with 8×8 pixel faces made of little blocks; with Options → Googly eyes on, the pixel eyes become
  googly ones. Its tab shows a pixel Creeper icon until the emblem (request 56) arrives.
- `src/packs/avatar-*.js` the **Avatar** faction (`avatar`, *Avatar: The Last Airbender*). `avatar-core.js`
  registers the faction and its elemental effects (fire and blue fire, water, ice, air, earth,
  lightning, steam, the Avatar State glow) as pack effects (`EXT.fx`, drawn by `src/fx.js` and
  recorded in replays). `avatar-fire.js`, the Fire Nation: **Fire Nation Soldier** (spear and short
  fire jabs), **Zuko** (twin flaming dao, fire daggers, a spinning kick that throws a ring of fire),
  **Azula** (blue fire jets, a blue-fire dash and spin kick, and charged lightning: knock her down
  to stop it), **Iroh** (fire punches and blasts, fire breath, and lightning redirection: lightning
  that hits him is led through his stomach and sent back) and **Combustion Man** (an explosive
  third-eye beam). Fireballs fizzle into steam against water and ice. `avatar-benders.js`: **Aang**
  (air blasts that throw groups up, an air scooter, his glider staff, and once when badly hurt the
  **Avatar State**: he hovers glowing while fire, water, earth and air pulse out round him),
  **Katara** (water whip, slowing ice spikes, healing water), **Sokka** (a boomerang that comes back,
  then his space sword), **Toph** (rock pillars that launch enemies, thrown boulders, earth armour),
  the **Earthbender** (hurled rock discs) and the **Kyoshi Warrior** (twin war fans; turns blows aside).
- `src/packs/maps-*.js` battlegrounds added by packs (they push into `MAPS` and draw through
  `MAP_H`, `register({ obstacles, scenery })`): **Starbase Hangar** (`maps-starbase.js`, Galactic: a
  sci-fi hangar deck with hazard stripes and glowing landing circles, blast barriers, cargo containers
  and crates, a control platform in the middle, a parked fighter at each end, hangar mouths onto stars,
  a ringed planet and a moon) and **Shibuya Crossing** (`maps-shibuya.js`, JJK: the scramble crossing on
  Halloween night, zebra stripes, abandoned cars and taxis, traffic lights and a subway entrance among
  neon-lit buildings and big screens, under the dark shimmering curtain), **Blocky Plains**
  (`maps-blocky.js`, Minecraft: a voxel meadow of pixel-textured cubes, cobblestone and ore outcrops, a
  village hut and a nether portal on each side, a lava pool in the middle, stepped hills, cube trees,
  mountains, clouds and sun, a village with sheep, cows and pigs) and **Ba Sing Se Walls**
  (`maps-basingse.js`, Avatar: an Earth Kingdom field before the great outer wall, a paved road to a
  green-roofed pavilion, earthbent rock pillars and slabs, low stone walls and bamboo, the wall's gate
  and watchtowers over the far edge, terraced fields on the hills). A map's `music` names its battle
  theme: Shibuya → JJK, Ba Sing Se → Avatar; Starbase and Blocky Plains name the Galactic and
  Minecraft themes for when they're delivered.
- `src/ext.js` the pack API (factions, units, items, weapon-kind hooks, projectiles, meshes) · `src/packs/index.js` lists the packs; big creatures and vehicles share `bc-core.js` (Walker, T-Rex, raptors) or the mount code in `sm-*.js`
- `src/camera.js` free/follow/possess/cinematic rigs (unit occlusion, terrain collision) · `src/input.js` pad slots, hot-plug, rumble + keyboard · `src/ui.js` HUD · `src/game.js` state machine · `src/perf.js` frame-rate watchdog (sim time budget, heavy-load banner, auto resolution)

Vendored: three.js r170 (`vendor/three.module.min.js`), Rapier 0.14 compat (`vendor/rapier.es.js`).
`dev/lineup.html` renders every unit for quick visual checks.
