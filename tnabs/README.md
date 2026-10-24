# TNABS — Totally Not Accurate Battle Simulator

A browser clone of *Totally Accurate Battle Simulator* for two players on one
screen: both players build their armies **at the same time** in split screen
with Xbox controllers, then watch the wobbly active-ragdoll battle together.

Serve the repo root over http (ES modules) and open `/tnabs/`:

    python3 -m http.server 8123   # then http://localhost:8123/tnabs/

`?q=low` lowers the render resolution and shadows for weak GPUs.

## Flow

Title → **army setup** (split screen, P1 = Blue on the left half of the field,
P2 = Red on the right) → both press **Y** (ready) → 3 s countdown → **battle**
(shared or split camera) → **result** → **replay** (scrub, slow-mo, follow).

## Controls (Xbox pad, standard mapping)

| | Setup | Battle |
|---|---|---|
| Left stick | fly | fly / walk when possessing |
| Right stick | look | look |
| LB / RB | down / up | down / up |
| L3 | fast fly | fast fly |
| A | place unit (hold to paint lines) | follow unit in crosshair / jump |
| B | remove unit (hold) | free camera / stop possessing |
| X | hold: clear army | possess unit in crosshair |
| Y | ready | slow motion |
| RT | | attack while possessing |
| LT | | hold: slow cinematic camera |
| D-pad | ←→ unit, ↑↓ faction | ↑↓ time speed |
| View | | split / shared screen |
| Start | ready | pause menu |
| R3 | | cycle tips / HUD off |

Replay: LT/RT scrub, A play/pause, D-pad ←→ skip, ↑↓ speed, X follow, Y restart, B exit.
Keyboard fallback for both players is listed on the title screen's *Controls* page.

## Code map

- `src/body.js` skeleton (11 parts, joints, FK) · `src/pose.js` procedural target poses and attack animations
- `src/ragdoll.js` Rapier bodies/joints + muscle servo · `src/unit.js` balance, locomotion, AI, personalities
- `src/units.js` the roster (stats, weapons, looks, personality) · `src/items.js` weapon hit geometry
- `src/battle.js` simulation: melee sweeps, projectiles, explosions, healing, bard aura; emits events
- `src/replay.js` quantised 30 Hz recording + interpolated playback with event replay
- `src/visual.js` unit meshes (baked per part), faces, hats, weapons, portraits
- `src/world.js` maps/terrain/scenery · `src/fx.js` particles · `src/audio.js` synthesised sfx, voices, music
- `src/camera.js` free/follow/possess rigs · `src/input.js` pads + keyboard · `src/ui.js` HUD · `src/game.js` state machine

Vendored: three.js r170 (`vendor/three.module.min.js`), Rapier 0.14 compat (`vendor/rapier.es.js`).
`dev/lineup.html` renders every unit for quick visual checks.
