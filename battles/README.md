# Wobbly Battles

A wobbly physics battle game in the style of *Totally Accurate Battle Simulator* for two players on one
screen: both players build their armies **at the same time** in split screen
with Xbox controllers, then watch the wobbly active-ragdoll battle together.

Serve the repo root over http (ES modules) and open `/battles/`:

    python3 -m http.server 8123   # then http://localhost:8123/battles/

`?q=low` forces the Low graphics quality at boot; otherwise *Options → Graphics
quality* (Low / Medium / High: render scale and shadow resolution) is saved with the
other settings.

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
- **Sandbox**: free play with no match score. *Players: 1* is one full-screen setup
  where you build both armies (tap **View** to switch side, **Y** starts the battle).
  *Players: 2* is split screen, each player builds one army and the battle starts when
  both are ready — like Versus without rounds, timer or blind setup.
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
setup. Armies are saved per map in `localStorage` (`wobbly-battles.v1`).

Options: default battle screen (shared / split), graphics quality, look speed,
invert Y, blood, music.

Watching the battle: **A** follows the unit in the crosshair (its stats card shows
health, kills and damage), **X** takes control of it (TABS's *Take control*: left
stick walks relative to the camera, right stick looks, **RT** attacks, **LT** blocks (ranged units: aims)
(zoom), **A** jumps; shooters and casters fire at the crosshair, riders steer their mount
with the stick, flyers dive on the crosshair, and a siege crew at its engine lays it on the
crosshair and fires it), **B** on the free camera hands over to the cinematic camera,
**Y** eases into slow motion, **R3** cycles tips / HUD off (photo mode). In shared
screen either pad does all of this; in split screen each pad drives its own view.

## Controls (Xbox pad, standard mapping)

| | Setup | Battle | Replay |
|---|---|---|---|
| Left stick | slide over the field | fly · follow: zoom · possess: walk | fly · follow: zoom |
| Right stick | look | look · follow: orbit · possess: aim | look / orbit |
| LB / RB | down / up | down / up · following: prev / next unit | same |
| L3 | fast | fast fly | fast fly |
| A | place (hold to paint) | follow unit in crosshair · possess: jump | play / pause |
| B | remove (hold) | free cam: cinematic camera · else free camera / let go | free camera, then exit |
| X | undo (hold to repeat) | possess unit in crosshair (or the followed one) | follow unit |
| Y | ready / not ready | slow motion | slow-mo final moments |
| LT / RT | brush: single, line ×3/×5, block 3×3/4×4 | LT hold: slow smooth cam · RT: attack (possess) | scrub back / forward |
| D-pad | ←→ unit, ↑↓ faction | ↑↓ time speed (down to frozen) · ←→ FOV | ←→ skip 3 s · ↑↓ speed |
| R3 | reset camera | tips / HUD off (photo mode) | same |
| View | clear army (asks) | split / shared screen | split / shared |
| Start (Menu) | menu: ready, map, budget, blind, quit | pause: cinematic camera, screen, HUD, time, restart, edit, quit | menu |

All menus take D-pad or left stick (with repeat), A to select, B to go back. In
shared screen either pad drives the camera; in split screen each player has their
own. The result menu uses the D-pad so the sticks can keep flying the camera.
Keyboard fallback for both players is listed on the title screen's *Controls* page.

## Code map

- `src/body.js` skeleton (11 parts, joints, FK) · `src/pose.js` procedural target poses and attack animations
- `src/ragdoll.js` Rapier bodies/joints + muscle servo · `src/unit.js` balance, locomotion, AI, personalities
- `src/units.js` the roster (stats, weapons, looks, personality; `setFactionUnits` swaps a faction's units at runtime and bumps `rosterVersion` / calls `rosterHooks`) · `src/creator.js` the Unit Creator screen · `src/packs/custom.js` custom-unit recipes, storage, derived stats and cost · `src/items.js` held items: hit geometry, mass, shields (held items are colliders on the forearm and drop as rigid bodies on death)
- `src/battle.js` simulation: melee sweeps, projectiles, explosions, healing, bard aura; emits events
- `src/replay.js` quantised 30 Hz recording + interpolated playback with event replay
- `src/visual.js` unit meshes (baked per part), faces, hats, weapons, portraits
- `src/world.js` maps/terrain/scenery · `src/fx.js` particles · `src/audio.js` synthesised sfx, voices, music
- `src/maps-new.js` feature maps (castle, river, cove, volcano, canyon, graveyard) · `src/features.js` hills, plateaus, water, bridges, walls and breakables: height grid, colliders, AI steering, placement checks, projectile blocking (all mirrored through the centre for fairness) · `src/mapscene.js` their meshes and set dressing
- `src/camera.js` free/follow/possess/cinematic rigs (unit occlusion, terrain collision) · `src/input.js` pad slots, hot-plug, rumble + keyboard · `src/ui.js` HUD · `src/game.js` state machine

Vendored: three.js r170 (`vendor/three.module.min.js`), Rapier 0.14 compat (`vendor/rapier.es.js`).
`dev/lineup.html` renders every unit for quick visual checks.
