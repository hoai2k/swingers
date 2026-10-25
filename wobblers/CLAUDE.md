# Agent guidance for WOBBLERS (`/wobblers`)

A Wobbly Life-style open-world sandbox; see `README.md` for controls and the code map.
The repo-level `CLAUDE.md` rules (deploy switch, branches, commits) still apply.

- No build step. three.js and Rapier are vendored in `lib/` and mapped through the
  import map in `index.html` (`three`, `three/addons/`, `rapier`). Serve the folder over
  http (`python3 -m http.server`).
- `window.__wob` is the live Game. For headless probes in Playwright: set
  `__wob.manual = true` (stops the loop's physics), add a player with
  `__wob.addPlayer('mock0')`, drive it through `__wob.input.mock = { mock0: {...state} }`
  and call `input.poll()`, copy `pressed` into the device's `latch`, then
  `handlePlayerInput(player, device)` and `step()` per 1/60 s. Use `player.teleport`,
  `player.sitIn(seat)`, `game.nearestSeat(player)` to set up a test. Check that a change
  still lets the ragdoll stand, walk, jump, go limp and get up, swim, grab and drive.
- Ragdoll tuning (`src/player.js`): the joint drives are an *implicit* PD on each limb's
  own inertia — explicit PD with chain inertia or large `kd` goes unstable in Rapier.
  Raised limbs float (gravity scale 0, weight moved to the torso); hanging arms keep
  gravity. Keep `kp * DT² ≲ 0.3`. Jumps use coyote time and a press buffer (`COYOTE`, `JUMP_BUFFER`),
  and `probeGround` falls back to `FOOT_RAYS` round the hips so standing on an edge still counts
  as grounded. In the air the legs push off, tuck, then reach down for the landing. Legs are visual
  while in control: their colliders skip static scenery and vehicles (`groupsLegs`), so a
  foot can't get caught under the ground; `updateLegs` makes them solid again for a full
  ragdoll and first pulls any leg behind a surface back out. Players duck under low ceilings
  (`headroom`) and pushing the stick for 1.5 s without moving (nothing `blockedAhead`) hops
  them free (`stuckT`). Wall jumps (`wallNear`): a jump in the air next to a wall kicks off
  it; chaining between walls works, the same wall again needs a landing first. Climbing: `player.grip` (GRIP_* constants) drains while
  hanging off the world and refills on the ground; mantling needs a ledge top within reach
  of the hands (`findLedge`), and a jump while hanging only hops up off bars / ropes, never
  off a flat wall (`wallAhead`). Punch-throwing any held loose body is `throwHeld` in
  `world/common.js` (speed from `throwSpeed(mass)`).
- Collision groups (`src/config.js`): static, props, vehicles/rides, one bit per player.
  Seated players stop colliding with vehicles and rides.
- Static scenery goes through `world/kit.js` so it is merged into per-chunk meshes;
  every new static thing should be added with the kit (visual + collider in one call).
- Rides are kinematic bodies animated in `physics.animators`; anything a player can sit
  on is a seat in `game.seats` (`{ body, pos, yaw, kind, label, hint, control() }`; optional
  `exit` (body-local) / `exitWorld`, and `exitPush` (m/s) for rides: getting off mid-ride
  drops you right there with a small push away from the seat). Seats on
  `physics.staticBody` keep world positions in `pos` (`nearestSeat` relies on that for its
  quick reject). `kit.bench` adds two seats per bench; `furn()` adds seats to chairs, stools,
  sofas, armchairs and beanbags (table `SEATS` in `world/furniture.js`; those pieces use the
  vehicle collision group so a seated player doesn't fight them, and tipped-over ones are disabled).
- Presents (`world/presents.js`, `src/unlocks.js`): spots are `[x, z, ray start]` — the box
  sits on the first static surface a ray from that height hits. New cosmetic rewards go in
  `unlocks.js` `PRESENTS` (reward keys `hat:` / `face:` / `pants:`); anything listed there starts
  locked. New hats are built in `src/hats.js`. Outfits (the customiser's Outfit row) are `src/outfits.js`
  `OUTFIT_LIST` (append only; saved looks store indices): free ones, one per job (unlocked by
  finishing that job once, `JOB_OUTFITS`) and shop ones (`SHOP_COSMETICS`). Each player slot
  keeps its own saved look (`settings.devices.slot<N>`, `cosmetics.js` `saveLook` / `restoreLook`);
  A on the join customiser plays straight away.
- Rendering (`src/sky.js`, `src/look.js`, `world/water.js`, `world/detail.js`, `game.render`):
  read `game.timeOfDay` (hours), `game.dayLight` (0..1), `game.nightLight` (0..1) and
  `game.isNight` for anything that should react to the day/night cycle (headlights, lit
  signs); `game.setTimeOfDay(h)` and `game.daySpeed` (0 freezes time) drive it. Builder
  colours listed in `GLOW` (`mesh.js`) light up at night; `kit.lamp` lamps get halos.
  Small top-level scene objects are hidden per view by on-screen size (`game.cullSmall`);
  set `userData.noCull` to opt out. Check draw calls with `game.renderStats` for 1 and 8
  players after adding many meshes.
- World helpers live in `world/common.js`: `Local` (building-local kit placement, `wall`
  with door holes, `stairs`, `rail`), `addDoor` (hinged physics door), `useSpot` (a seat with
  `use(player)` that Y triggers instead of sitting), `throwable` (punch to throw, optional
  `aim`), `ladder`, and `groundAt(x, z)` — the exact terrain mesh height. Place things on
  hills with `groundAt`, not `heightAt` (the analytic surface can be ~0.5 m off the mesh).
- Painted art is optional: `src/assets.js` loads only files listed in `assets/manifest.json`
  (regenerate with `python3 tools/build_manifest.py` after adding/removing images). Hooks:
  faces (`faces/face_<name>.png`), signs (`signs/<text>.png`, any `signMesh` text; run
  `python3 tools/clean_signs.py` after adding signs to key out their backgrounds), posters
  (`world/posters.js`, `posters/<name>.png`) and the title logo (`ui/logo.png`). Open
  requests are in `image-requests.md` (formats + style rules at its top); delivered rounds
  move to `image-requests-history.md`. **Request art early:** as soon as a feature's sign
  words / face / poster names are known, add an `## OPEN round N` entry and commit + push
  it on its own before finishing the feature, so the art is generated in parallel. A
  subagent that may not push sends the entry to its coordinator instead, who commits it.
- Interior lights: rooms call `game.interiorLights.add(x, y, z, opts)` (`world/lights.js`); a
  pool of 6 point lights follows each view's camera, so adding spots costs nothing per frame.
- Vehicles can be removed at runtime with `vehicle.destroy()` (riders and grabbing hands let
  go; body, colliders, wheel controller, seats, buoyancy, render record, meshes and engine
  sound all go). The phone (`src/phone.js`, `callVehicle(game, player, id)`) uses it; called
  vehicles are in `game.calledVehicles` (player -> vehicle). The map picture (`src/map.js`)
  is painted once per island from its terrain grid, `ROADS` and the static colliders, so new
  buildings show up on it by themselves; add a label to `AREAS` (home) or the region's
  `labels` / `R.label()` for a new area; `game.mapFeatures` holds vector lines (bridge, ferry
  routes). Map and phone are per-player UI panels (`ui.openMap` / `ui.openPhone`), like the
  pause menu.
- Life sim (`src/life/`, `world/estate.js`; wired by one `buildLife(game)` call in `world/index.js`):
  one shared coin purse, `game.wallet.add(player, amount, reason)` (pays with sound, a floating
  "+N" over that player and a counter bump; use it for mission rewards), `spend(n, player)`,
  `canAfford(n)`, `onChange(fn)`. Mini-game prizes: `game.life?.reward(player | null, n, reason, pos)`
  (null pays the nearest player to `pos`). Saved state lives in `settings.life` (`life/state.js`).
  Shop items: cosmetics in `unlocks.js` `SHOP_COSMETICS` (append new hats to `EXTRA_HATS`, faces/
  trousers at the end of `FACES` / `PANTS`, so saved looks keep their indices); pets in `pets.js`
  `PET_KINDS`; homes in `estate.js` `HOME_DEFS` (+ `homeFixtures` on the building); vehicles in
  `shops.js` `VEHICLE_PRICES` (the phone asks `game.vehicleLock(id)`). Coin pickup spots are
  `CLUSTERS` in `life/coins.js` (`[x, z, ray start, shape, count, size]`, like present spots).
  Home respawn wraps `game.spawnPoint`; pets are synced from the saved choice every 15 steps.

## Missions (jobs, `src/missions/`)

Wobbly Life-style jobs, wired by one `buildMissions(game)` call in `world/index.js` (after life,
before `kit.finish`: JOBS boards are kit scenery) plus small hooks: `ui.js` (HUD update, pause-menu
items, per-player use-spot prompts via `seat.labelFor(p)`), `phone.js` (X opens the jobs list),
`map.js` (`game.mapOverlays` fns draw givers and targets), `npc.js` (`n.pinned` keeps an NPC awake,
`npcs.despawn(n)`), `settings.js` (`settings.missions`: best time + medal per job, jobs done).
- A job is data in `missions/jobs/<island>.js` (format at the top of `jobs/index.js`): `giver`
  (`at`, `yaw`, `npc` role/def or `board: true`), `pay` (bronze; silver x1.25, gold x1.5, +25% per
  extra co-op player, split), `time` limit, `gold` / `silver` medal times, optional `vehicle`
  (spawned beside the starter, removed when the job ends and it is empty), `cargo`, optional
  `build(M, kit)` for static props (the sheep pen, beach bins) and `steps` (array or fn).
- Step types (`missions/steps.js`): `reach` (optionally in a vehicle / stopped / hoop style; races
  come from `jobs/race.js`), `passenger` (NPC rides in your vehicle), `follow` (rescue: reach an NPC,
  it follows you / hops into your vehicle), `catch` (fleeing NPC: grab, punch over or corner it),
  `items` (physical things to bring into zones; `fx.js` ITEMS, animals flee), `touch` (visit spots or
  NPCs, optionally hidden), `fires` (fire-truck hose / drive through). Each handler has
  `start / update / targets / count`; targets feed the beacons, the HUD pointer and the map.
- `game.missions`: `runs`, `runOf(p)`, `start(id, p)`, `join(run, p)`, `cancel(p)`, `stepNow(run)`,
  `complete(run)`, `track(p, job)`. Givers are use spots (Y); their NPCs spawn lazily within 170 m.
  Mission NPCs (`ai.js`) are pinned and run their own small brain. Idle cost: a giver check every
  30 steps and a marker bob. Probe a job by teleporting (`player.teleport`, move the run's
  `vehicle`, drop `items` into zones) and stepping until `run.state === 'done'`.

## Regions / NPCs / ferries / registerVehicle (the archipelago)

The world is an archipelago: the home island ("Wobbly Island", |x|, |z| <= 400, unchanged)
plus five regions, each a module in `src/world/regions/`. Coordinates: +x east, +z south
(the map's north is -z). Sea level y = -0.5; the open sea floor is y = -8 (one plane + one
collider, `terrain.js` SEA_FLOOR); `WORLD` = +-1400 m.

| id | name (sign text) | bounds [x0, x1, z0, z1], grid | flat areas / notes |
|---|---|---|---|
| `city` | Bigtown (`BIGTOWN`) | 600..1200, -321..321, 3 m | whole plate flat at y = 2 (`CITY_Y`), land x 650..1140, z -262..262; beach SE; park hill NE (1055, -175); the bridge lands at (740, 118); no ferry dock yet |
| `snow` | Frostpeak (`FROSTPEAK`) | -480..480, -1440..-640, 4 m | summit ~165 m at (-40, -1170); ski village flat x -80..80, z -845..-755, y = 8; dock (75, -735) |
| `desert` | Dusty Dunes (`DUSTY DUNES`) | -1440..-680, -440..440, 4 m | town flat x -1020..-900, z -100..40, y = 4; oasis pond (-935, 165); red-rock plateau + canyon on the north coast (floor y ~3 along z = -232 + 28 sin(x / 55)); mesas SW; dunes W; dock (-760, 40) |
| `jungle` | Tiki Jungle (`TIKI JUNGLE`) | -960..-300, 520..1140, 4 m | volcano 92 m with a crater at (-690, 900); gully + sea-level river to the east shore; stilt village flat x -430..-385, z 735..795, y = 1.5; lagoon flat x -385..-350, z 730..800, y = -1.6; dock (-405, 815) |
| `tropical` | Coconut Cove (`COCONUT COVE`) | 300..810, 480..921, 3 m | islets A (470, 620), B (640, 600), C (605, 772, low hill), D (438, 792) in a shallow lagoon; resort flat x 565..645, z 735..790, y = 2; harbour flat x 440..500, z 598..640, y = 1.5; dock (452, 572) |

- **Terrain** (`src/terrain.js`): a region descriptor `region = { id, name, biome, signText,
  centre, bounds, step, height(x, z), color(x, z, h, slope, out), sand(x, z, h), flats, roads,
  pits, labels, docks }` is registered by `world/regions/index.js` (`defineRegion`) before
  `buildTerrain`. Flats are `[x0, x1, z0, z1, y, blend]`; `roads` are sloped strips
  `{ a: [x, z], b: [x, z], w, h0, h1, blend }`; pits `[x0, x1, z0, z1, y]`. Add more in the
  descriptor or in the module's `prepare(T)` hook (`T.addFlat(...)`, `T.addRoadFlat(...)`,
  `T.addPit(...)`), never later: the terrain is built once (grids, LOD tiles, one trimesh of
  the land cells per region, the sea depth texture, map pictures). Shape helpers: `blobDist`,
  `rrectDist`, `coastBlend`, `fbm`, `ridged`, `smooth`, `waterTint`, `BIOME_COLORS`. Bounds
  must not overlap and their edges must already be sea floor. Ground below y = -0.5 is under
  the sea plane (ponds / rivers at sea level come for free); higher water needs `addWater`.
  The home island terrain is fixed (only `HOME_EXTRA_FLAT`, the bridge road, was added).
- **Queries**: `heightAt` (smooth), `meshHeight` = `groundAt` (exact mesh; works before the
  build too: place things with it), `biomeAt(x, z)` ('home' | 'city' | 'snow' | 'desert' |
  'jungle' | 'tropical' | 'sea'), `regionAt(x, z)` (descriptor or null). `game.regions` is
  REGIONS (home first); `player.region` is the region a player is in (`src/regionbanner.js`
  shows "Welcome to ...!" when they enter one). `game.terrain` bundles the queries for probes.
- **Region build** (`build(game, kit, R)` in each region file, after the home island): use
  the kit for static scenery and the helper bag `R` (`world/regions/helpers.js`): `R.groundAt`,
  `R.Local`, `R.common`, `R.addSeat`, `R.addWater`, `R.rng(seed)`, `R.sign(text, ...)`,
  `R.welcomeSign(x, z, yaw)`, `R.tree(x, z, kind, scale)`, `R.vehicle(type, x, z, yaw, color,
  opts)`, `R.npc(role, x, z, opts)`, `R.label(name, x, z, big)`. The region files only hold
  placeholder landmarks (welcome sign, a building, an NPC or two): replace them freely.
  `game.buildTimes` has the ms per build step and per region; keep a region's build well
  under ~300 ms.
- **Draw distance**: day fog reaches ~1600 m; kit chunks further than 760 m from a camera are
  hidden unless tall (`game.farCull`: bbox top > 20 m or height > 16 m), so skyscrapers,
  towers and the bridge stay as silhouettes. Far terrain is one coarse mesh per region.
  Grass / flowers only grow on green ground (per-biome tweaks: `BIOME` in `detail.js`); a
  region's grass coverage mask is rendered the first time a camera comes near it.
- **NPCs** (`src/npc.js`): `game.npcs.spawn(role | def, x, z, opts)` (or `R.npc`). Roles:
  townsfolk, lifeguard, farmer, businessman, taxi, skier, cowboy, explorer, surfer,
  fisherman, chef; add more with `registerRole(name, def)`. def: `colors { shirt, pants,
  hat }`, `hat` (any HATS id, or an NPC hat: straw, pith, chef, helmet, sunhat; `registerHat`),
  `face` (FACES index or name), `outfit` (['tie', 'scarf', 'vest', 'backpack', 'apron', 'belt',
  'lifejacket'] or a fn), `prop` (briefcase, rod, surfboard, skis, pitchfork, lasso, map, buoy,
  coffee, camera, shovel, flag, or a fn), `behaviour` ('wander' with `opts.area {x, z, r}`,
  'idle' / 'stand', 'patrol' with `opts.path`, 'sit'), `lines`, `hitLines`, `emotes`, `speed`,
  `flee`, `yaw`. NPCs are `Player` subclasses on collision bits 11..15 (`NPC_BITS`), never in
  `game.players`; only the 16 (`CAP`) nearest within 70 m of a player are simulated, the rest
  are parked (bodies disabled, hidden, seats and grabbing hands freed). A wandering NPC stays
  on land in its area and walks home if lost. Speech bubbles: `npc.say(text)`.
- **Ferries** (`world/ferries.js`): docks are region data `docks: [{ id, name, x, z, yaw, reach }]`
  (land end of the pier, direction out to sea, optional extra pier length); `buildDock` lays
  the pier to deep water with a T head (top y = 1.4 = the ferry deck), a FERRY sign and a
  berth alongside the head. `ROUTES` lists the lines (stops `[dockId, dir]` + waypoints per
  leg): Island Hopper (home_south -> cove -> jungle), Frostpeak Ferry (home_north <-> snow),
  Desert Ferry (home_west <-> desert). Ferries are kinematic (`physics.animators`), slow
  down for bends, wait 14 s at each dock, close their side gates while sailing (the gates are
  behind the seats; at a berth the hull stops so a gate faces the pier walkway: `Ferry.berthAt`); benches are seats with `seat.ferry`. After
  moving a dock or waypoint, probe the route (sample `groundAt` under the hull along each leg,
  keep more than 3 m of water). Players standing on any kinematic body move with it
  (player.js `groundVelocity`, which uses a kinematic body's origin as its pivot).
- **New vehicles** (`src/vehicles.js`): `registerVehicle(type, def)` (the usual fields;
  `boat: true` for a buoyant hull, `mesh(b, def, color, P, vehicle)` for a custom look,
  `colliders(add, C, def, vehicle)`, `voice` / `engineVoice`, `horn`), and
  `registerHandling(name, { update(vehicle, driver, vel, fwd, up, side), wheels })` with
  `def.handling = name`. Put it on the phone with `registerCallable({ id, type, name, icon | svg,
  color, opts }, beforeId)` (`src/phone.js`). Example: the jet ski in `world/regions/tropical.js`.
