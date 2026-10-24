# Wobbly Battles

A wobbly physics battle game in the style of *Totally Accurate Battle Simulator* for two players on one
screen: both players build their armies **at the same time** in split screen
with Xbox controllers, then watch the wobbly active-ragdoll battle together.

Serve the repo root over http (ES modules) and open `/battles/`:

    python3 -m http.server 8123   # then http://localhost:8123/battles/

`?q=low` forces the Low graphics quality at boot; otherwise *Options → Graphics
quality* (Low / Medium / High: render scale and shadow resolution) is saved with the
other settings.

## Flow

Title → **army setup** (split screen, P1 = Blue on the left half of the field,
P2 = Red on the right, both building at once) → both press **Y** (ready) → 3 s
countdown (Y cancels) → **battle** (shared or split camera) → **result** menu
(replay, slow-mo final moments, rematch, edit armies, main menu) → **replay**.

Pads bind to players in the order they connect and keep their slot until unplugged;
the title shows which pad is which player, and **View** there swaps sides (the pad
that rumbles is Blue). Unplugging a pad pauses a battle and un-readies a player in
setup. Armies are saved per map in `localStorage` (`wobbly-battles.v1`).

Options: blind setup (each player only sees their own army until the countdown),
default battle screen (shared / split), graphics quality, look speed, invert Y,
blood, music.

## Controls (Xbox pad, standard mapping)

| | Setup | Battle | Replay |
|---|---|---|---|
| Left stick | slide over the field | fly · follow: zoom · possess: walk | fly · follow: zoom |
| Right stick | look | look · follow: orbit · possess: aim | look / orbit |
| LB / RB | down / up | down / up · following: prev / next unit | same |
| L3 | fast | fast fly | fast fly |
| A | place (hold to paint) | follow unit in crosshair · possess: jump | play / pause |
| B | remove (hold) | free camera / let go | free camera, then exit |
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
- `src/units.js` the roster (stats, weapons, looks, personality) · `src/items.js` held items: hit geometry, mass, shields (held items are colliders on the forearm and drop as rigid bodies on death)
- `src/battle.js` simulation: melee sweeps, projectiles, explosions, healing, bard aura; emits events
- `src/replay.js` quantised 30 Hz recording + interpolated playback with event replay
- `src/visual.js` unit meshes (baked per part), faces, hats, weapons, portraits
- `src/world.js` maps/terrain/scenery · `src/fx.js` particles · `src/audio.js` synthesised sfx, voices, music
- `src/camera.js` free/follow/possess/cinematic rigs (unit occlusion, terrain collision) · `src/input.js` pad slots, hot-plug, rumble + keyboard · `src/ui.js` HUD · `src/game.js` state machine

Vendored: three.js r170 (`vendor/three.module.min.js`), Rapier 0.14 compat (`vendor/rapier.es.js`).
`dev/lineup.html` renders every unit for quick visual checks.
