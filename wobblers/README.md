# WOBBLERS

An open-world physics sandbox in the spirit of **Wobbly Life**: wobbly active-ragdoll
characters, drivable vehicles, rides and an island full of things to grab, throw, climb
and fall off. Local split-screen for **up to 8 players** on Xbox controllers and keyboards.
No missions — just the world.

Pure web tech, no build step: [three.js](https://threejs.org) r170 for rendering and
[Rapier](https://rapier.rs) 0.14 (WASM) for physics, both vendored in `lib/`.

## Run it

ES modules need http, not `file://`:

```bash
cd wobblers && python3 -m http.server 8123   # then open http://localhost:8123
```

Press **A** on a controller (or **Enter** / **Space** on the keyboard) to join. More players
join the same way at any time; the screen splits 2 / 4 / 6 / 8 ways. Each new player first
gets a customiser in their own view (colour, hat, face, trousers; **X** for a random look);
the look is remembered per controller / keyboard. **24 presents** are hidden around the
island (rooftops, towers, under the pier, on a raft...): touch one to open it and unlock a new
hat, face or pair of trousers for everyone (16 hats, 4 faces, 4 trousers; progress is saved, and
shown in the customiser and menu; *Settings → Reset presents* starts over). Locked items are
skipped in the customiser. **Y** (or **E** / **F1**) on the title
opens the controls overlay.

**Start** / **Esc** opens that player's own menu (resume, customise, respawn, settings,
controls, reset vehicles, leave). With one player it pauses the game; in split screen it
only covers that player's view. Settings (music and sound volume, shadows, resolution, and
per-player invert-Y and camera sensitivity) are saved in `localStorage`. Menus work with the
stick / D-pad + **A** / **B**, with **WASD** / arrows + **Enter** / **Esc**, or the mouse.

## Controls

| | Xbox controller | Keyboard 1 | Keyboard 2 |
|---|---|---|---|
| Move / camera | LS / RS | WASD / mouse | Arrows / Numpad 4 6 8 5 |
| Jump | A | Space | Numpad 0 |
| Ragdoll (flop) | B | X (or R) | Numpad 7 |
| Punch | X | G or middle mouse | Numpad 2 |
| Interact: enter / exit, sit, use | Y | F (or E) | Numpad 9 |
| Raise arms & grab (left / right) | LT / RT | left / right mouse (or Q / C) | Numpad 1 / 3 |
| Sprint | LB (or click LS) | Shift | Numpad . |
| Emote wheel (hold, pick, release) | RB + LS / RS | 1 + mouse / WASD | Numpad - + arrows |
| Quick emotes: wave / cheer / dance | D-pad up / left / right | 2 / 3 / 4 | |
| Menu | Start | Esc | Numpad Enter |
| Map (pan LS, zoom LT / RT) | View | M | Numpad / |
| Phone: call a vehicle | D-pad down | P | Numpad * |
| Drive | RT gas, LT brake/reverse, LS steer, A handbrake, X horn (siren on police / fire) | W/S, A/D, Space, H | Arrows, Numpad 0, Numpad + |
| Fly (helicopter) | RT / A up, LT / LB down, LS forward-back + turn | Space up, Shift down, WASD | Numpad 0 up, Numpad . down, Arrows |

**Map** opens the island map in your own view (pan with the stick, zoom with the triggers,
**A** to find yourself). The **phone** calls any vehicle to you: it pops in on a clear spot
beside you, facing your way. Boats need water nearby and helicopters need open space. Each
player has one called vehicle; calling another sends the old one away unless someone is in it.

Hold a trigger to raise that arm; the hand grabs whatever it touches (props, other
players, ledges, bars) until you let go. Punch while holding (or standing at) a ball, can
or teddy to throw it; facing a hoop, the cans or the bowling pins aims the throw. Y also
sits you on benches, chairs, stools, sofas, armchairs and beanbags, and
works machines and buttons (vending machines, jukebox, game resets). Push toward a ladder
to climb it. Grab with both hands and jump to pull yourself
up. Look up with the camera to reach higher.

Browsers on Windows expose at most four XInput (Xbox) pads, so 8 players means mixing
pads with the two keyboard schemes (or using controllers that show up as generic HID).

## The island

- **Town** — plaza with a fountain (spawn), shops, town hall, apartments, suburbs, parked cars,
  bins, cones, crates, shopping trolleys you can ride, wheelie bins you can hide in.
  Walk into the **cafe** (jukebox, rooftop terrace up the outside stairs), the **market**
  (trolleys, vending machine) and the **arcade** (air hockey); the two-storey house by the
  town hall has a playable piano downstairs and a bedroom upstairs. Doors swing on hinges.
- **Playground** (NE) — swings (pump with the stick), slide, see-saws, merry-go-round,
  monkey bars, trampolines, spring riders, sandbox.
- **Swimming pool** (SE) — shallow and deep ends, springy diving board, 5 m high-dive,
  twisting water slide, pool toys and a giant rubber duck.
- **Fun Park** (west) — ferris wheel, carousel, roller coaster, swing ride, drop tower,
  bumper cars, bouncy castle, food stalls, a can-toss stall (win a teddy) and a bowling lane.
- **Stunt park** (SW) — ramps, a jump gap, half-pipe, quarter pipes, crates to smash.
- **Sports field** (NW) — football pitch with a giant ball, basketball court with working
  hoops and a scoreboard, parking lot.
- **Kart track** (east) with six go-karts; **farm** with hay bales and a pickup;
  **mountain** with a lookout, boulders to roll, quad bikes and a **zip line** down to the
  lake; **lake** with a camp, boats, log rafts and a rope swing;
  **beach** with a pier, boats, palms and a lighthouse.

## The archipelago

Around the home island lie five more islands, each with its own landscape, people and things
to do (a banner welcomes you as you arrive; the map zooms out to show them all):

- **Bigtown** (east) — the city, reached over a drivable suspension bridge from the home
  island's east road.
- **Frostpeak** (north) — icy mountains, a ski village on the southern foothills.
- **Dusty Dunes** (west) — dunes, a red-rock canyon and mesas, an oasis, a wild-west town.
- **Tiki Jungle** (south-west) — a volcano, a river, beaches and a stilt village.
- **Coconut Cove** (south-east) — little tropical islets in a turquoise lagoon.

**Ferries** sail between them: the *Island Hopper* (home beach, Coconut Cove, Tiki Jungle),
the *Frostpeak Ferry* (home north coast) and the *Desert Ferry* (home west coast). Walk on
board at a dock (the gate is behind the seats), stand on deck or sit on a bench, and get
off at the next stop. Islanders wander about, wave and chat when you come close, and flop
over when punched or run over. The phone calls vehicles anywhere (including a jet ski).

## Code map

| File | What |
|---|---|
| `src/main.js` | boot: init Rapier, create the game |
| `src/game.js` | renderer, split-screen views (shared/per-group shadows, per-view culling), fixed 60 Hz physics loop, seats |
| `src/sky.js` | sky dome, clouds, sun/moon lights and the 16-minute day/night cycle |
| `src/look.js` | soft wrapped shading + rim light for all Lambert materials, night glow of windows/lamps |
| `src/player.js` | the active ragdoll: hover spring, upright torques, joint drives, grabbing, punching, swimming, seats |
| `src/vehicles.js` | vehicles: ray-cast wheels + arcade handling assists (cars, police, sports, pickup, van, bus, fire truck, tractor, kart, quad, scooter, bumper car), boats, helicopter; `registerVehicle` / `registerHandling` add new types from other files |
| `src/world/garage.js` | placement of the bus, police, fire truck, sports cars, scooters, tractor, helipad |
| `src/camera.js` | third-person orbit camera |
| `src/input.js` | gamepads + two keyboard schemes |
| `src/physics.js` | Rapier wrapper, buoyancy, water volumes, kinematic animators |
| `src/terrain.js` | the archipelago terrain: regions (home island + islands) with height functions, biomes, flat areas; ground colours, LOD tiles, colliders; `heightAt`, `groundAt`, `biomeAt`, `regionAt` |
| `src/world/regions/` | one module per island (city, snow, desert, jungle, tropical): terrain descriptor + `build(game, kit, R)`; `helpers.js` is the `R` helper bag |
| `src/world/bridge.js`, `src/world/ferries.js` | the Bigtown suspension bridge; ferry docks, routes and the kinematic `Ferry` |
| `src/npc.js`, `src/world/folk.js` | NPCs (AI-driven ragdolls with roles, outfits, props, speech bubbles, LOD); the home island's islanders |
| `src/regionbanner.js` | "Welcome to ...!" banners per view; `player.region` |
| `src/world/water.js` | sea / lake / pool water shader: depth tint, foam, reflections |
| `src/world/detail.js` | instanced grass, flowers and pebbles per camera, road edges, lamp glow |
| `src/world/*.js` | the island: roads, town, playground, pool, park rides, stunts, outskirts, props |
| `src/map.js` | archipelago map: an illustrated picture per island painted once from its terrain grid, roads, zones and static colliders, plus vector features (bridge, ferry routes); per-player map panel with players, vehicles, ferries, labels |
| `src/phone.js` | phone panel: call any vehicle type to a clear spot beside you (one called vehicle per player; `Vehicle.destroy()` removes the old one); `registerCallable` adds entries |
| `src/ui.js` | HUD, title, join + customiser, per-player menus, controls overlay, prompts, toasts |
| `src/emotes.js` | emotes (wave, point, dance, clap, flex, bow, sit, flop, cheer, laugh) as ragdoll pose overrides, the per-view emote wheel and quick emotes |
| `src/glyphs.js`, `src/title.js` | Xbox-style button glyphs / key caps; the title screen's wobbling characters |
| `src/cosmetics.js`, `src/settings.js` | faces, trousers and saved looks (locked items skipped); persistent settings |
| `src/hats.js`, `src/unlocks.js`, `src/world/presents.js` | unlockable hats; which present unlocks what (saved progress); the presents in the world (placement, bob/glow, touch to open, confetti) |
| `src/audio.js`, `src/music.js` | synthesized SFX, engines, rides and ambience; procedural day / night music |
| `src/world/interiors.js`, `furniture.js` | enterable buildings (hollow shells, physics doors, stairs) and loose furniture |
| `src/world/fun.js`, `music.js` | trolleys, bins, beach balls, can toss, bowling, rope swing, rafts, zip line; jukebox, piano, vending machines |
| `src/world/lights.js`, `posters.js` | interior light pool (per-view nearest lights) and framed posters |
| `src/assets.js`, `tools/build_manifest.py` | optional painted art (faces, signs, posters, logo) swapped in when listed in `assets/manifest.json`; see `image-requests.md` |
| `src/world/common.js` | world helpers: building-local placement, walls/stairs/rails, doors, use spots, punch-to-throw, ladders, `groundAt` |
