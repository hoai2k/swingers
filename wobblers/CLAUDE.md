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
  as grounded. In the air the legs push off, tuck, then reach down for the landing. While in control the legs
  aren't motor-driven: `poseLegs` sets each leg to its animation target (clamped to `LEG_LIMITS`,
  a comfortable range), places it on its joint and moves its momentum onto the hips; only a
  limp ragdoll drives them with physics (motors this light drifted +-0.5 rad against the body). Legs are visual
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
- Character mesh (`src/player.js`, "the skin"): the body, limbs, mittens and shoes are ONE
  `THREE.SkinnedMesh` per character (`skinTemplate()` builds the rest-pose geometry once; each
  character clones it and only repaints the colour attribute in `paintSkin`). Its bones are the
  part groups (`part.mesh`, posed from the bodies), two squash bones (`sqBones`, Player.sync)
  and one joint bone per joint (`JOINTS`: waist, shoulders, elbows, hips, knees) that
  `poseJoints` puts at the pivot, turned half way between the two parts, just before each
  skeleton upload. Each limb is one tube and torso + hips one bean; weights fade parent ->
  joint bone -> child over `JOINTS[].h`, so bends curve like rubber. Don't move the tubes' rest
  shape off the joint pivots in `PARTS`. The head stays its own mesh (face texture). `part.mesh`
  groups only hold rigid extras: outfits / gadgets (`partMesh`), the head + hat, NPC props, mission
  cargo; the skin hangs in the chest group, so hiding the part groups (forms.js) hides it.
  Rebuild with `player.rebuildMeshes()` (setColor / NPC looks do). Outfits can recolour the body
  instead of covering it: `shirt` / `pants` on an `OUTFIT_LIST` entry (jackets, overalls), and
  `beltRing` fits a belt to the bean. Probe close-ups by rendering `__wob.scene` with your own
  camera (`__wob.frame = () => {}` stops the loop).
- Performance: `src/simcull.js` switches off loose bodies (props, parked vehicles) more than
  150 m from every player (self-driving traffic: 300 m) and back on within 125 / 270 m; culled
  vehicles skip `update()`. Parked empty vehicles at rest are put to sleep and skip their wheel
  update (game.step). At most two physics steps run per frame. Kit chunks get a far version (only parts
  with bounding radius >= 1.4 m, no shadows) drawn instead beyond 160 m (120 m in split screen);
  `game.farCull` switches `chunk.mesh` / `chunk.far`. Parked NPCs stay visible
  (frozen, standing) out to `SHOW_R`; `CAP` / `WAKE_R` in `npc.js` set how many are simulated.
  Audio starts on the first controller press too (`game.wakeAudio`).
  Resolution defaults to Auto (`settings.res = 0`, `game.adaptResolution`: 60-100% by frame
  time); Settings > Show FPS shows `game.perf` (ms per frame, physics+game, render, draw calls,
  triangles). Instanced meshes that never move far should get a bounding sphere and
  `frustumCulled = true` (the fair's rides were drawn in every view and shadow pass); keep
  world-wide instanced sets (coins) out of the shadow pass.
- Recorded sound effects: `dev/sfx/sfx.json` lists the sounds (one-shots named like the synth sounds
  in `audio.js` `playInner`, which a recording replaces; `loop: true` ambient beds placed with
  `audio.ambientSpot(name, x, z, r)`). `ELEVENLABS_API_KEY=... python3 dev/sfx/generate.py [name ...]`
  makes originals in `assets/originals/sfx/` (not deployed) and the processed `assets/sfx/` +
  `index.json` the game loads; nothing delivered = synth only.
- Traffic: any vehicle type can self-drive (`autoType(base)` in `regions/city/traffic.js`, a
  route from `makeRoute`, `placeOnRoute`, `addAutoDriver`); routes off the city plate set
  `route.yAt(x, z)`. Bigtown loops are in `city/people.js`, the home ring road in
  `world/hometraffic.js`.
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
  set `userData.noCull` to opt out. It also hides loose props beyond 160 m, vehicles beyond
  220 m and anything else small beyond 350 m. `game.lodView(cam)` gives top-level instanced
  sets a bounding sphere (hidden beyond 700 m) and hides vehicle wheels beyond 120 m;
  `game.viewHooks` (fn(cam) per view) lets a region add its own level of detail (the fair
  hides its small instanced parts beyond 170 m, 130 m split screen). Coins pack only the
  ones within 160 m of a camera into the instance list. Check draw calls with `game.renderStats` for 1 and 8
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
- Gadgets (`src/gadgets.js`, shop building `world/gadgetshop.js`, list in `life/shops.js` 'gadgets'):
  `GADGETS` (id, price...); bought = `'gadget:<id>'` in `life.bought`; worn one is `player.gadget`
  (saved in the slot look, `cosmetics.js`), its runtime is `player.gear`. Player hooks are all
  `this.gear?.…` (NPCs never have gear): `gear.speed` / `gear.jump` multipliers, `gear.filter(inp)`
  (the tool hand can't grab), `gear.punch(p, inp)` (true = fired instead of punching), `gear.step`
  after the pose (thrust / glide / aim arm / hook), `player.gearMesh` in `partMesh`. ui.js asks
  `game.gadgets.hint(p, kind)`. A new gadget: an entry in `GADGETS`, geometry in `gearGeo`, a
  step fn in `STEPS`. Probe with `setGadget(player, id)` (needs no purchase).

- Shape-shifting (`src/forms.js`, the Magic Tent at `TENT` in the Fun Park; built by
  `buildMagicTent` in `world/index.js`'s home step): `game.forms.transform(p, kind)` /
  `revert(p)` / `of(p)`; `p.form` is the live record. Forms keep the same ragdoll: the human part
  meshes are hidden and the form's meshes copy their poses each `Player.sync` (front legs copy the
  opposite rear leg shifted forward; `knee` / `hip` stiffen the visual stride), so the player's look
  is never modified and comes back exactly. Hooks marked `forms.js`: `player.js` (input filter =
  no grabbing, `form.speed` / `jump` / `kick`, X calls `form.attack()`, sync, `respawn` and
  `destroy` revert), `npc.js` (NPCs within `SCARE_R` of a raptor flee), `ui.js` (HUD), `map.js`
  (label). Attack hits are collected in the Rapier query callback and applied after it (pushing
  bodies inside the callback throws). New forms: add to `FORMS` with a look builder.

- Arcade cabinets (`src/arcade/`, built by one `buildArcade(game, L, spots)` call in
  `world/interiors.js` ARCADE; hooks: one line in `ui.handleInput` for invites, `settings.arcade`).
  A game is a class with `W`/`H`, `reset()`, `step(inputs)` (60 Hz; `inputs[i]` null = the game's
  AI plays that slot), `draw(g)`, `score`, `over`, `snd` (interface at the top of `arcade/common.js`);
  add one to `GAMES` in `arcade/index.js` and a spot in the ARCADE interior. Cabinet screens are
  CanvasTextures repainted at 15 Hz only while a camera is within 16 m (idle demos freeze
  otherwise). `game.arcade` has `cabinets` (`machine`, `session`, `pos`, `yaw`), `start(p, cab)`,
  `join(p, cab)`, `invites`, `tick(cab)`; probe game logic by stepping `cab.machine` directly, or
  headless in node with `node tools/arcade-sim.mjs`. Marquees are `signMesh` texts (art requested
  in round 11).

## Stratford Fall Fair (`src/world/fair/`)

The fairground on the home island in the flat strip south of the ring road, either side of the
south avenue (x -120..120, z 166..287, ground y = 0; the avenue |x| < 9 stays clear for traffic,
the entrance arch spans it at z = 164, the midway crosses it at z = 227). One `buildFair(game, kit)`
call in `world/index.js` (its own `fair` build step). Layout in `fair/layout.js` (`RIDES` centres).
- 14 rides, each static kit scenery plus kinematic bodies posed by one animator (`fair/common.js`
  `FairRides`: `F.body`, `F.instanced` draws many same-looking bodies (cabins, cages, cars, horses,
  tubs) as one InstancedMesh, `F.seat` adds a ride seat with `exitPush` and `seat.fair`, `F.animate`,
  `F.sign`; timing helpers `power` / `travel` / `vmaxFor` make each cycle end where it started).
  `rides-a.js`: pirate / viking ship, ring of fire (`F.ringFire` is its pendulum state), ferris wheel,
  carousel, drop tower; `rides-b.js`: gravitron, starship 2000, zipper, top spin, tilt-a-whirl,
  himalaya, sizzler; `train.js`: mini train. Ride parts live in one scene group far-culled with the
  kit chunks; the animators only run while a player is within 400 m (`F.active`).
- `decor.js`: arch, fences, midway lights, stalls (existing sign words), maples (pre-merged
  templates stamped with `stamp`), leaf litter, pumpkins, hay (some bales are seats), the pumpkin
  patch outside the east fence, coins, and falling leaves (one Points cloud round the players).
- `npcs.js`: the `teen` role; ~50 teens spawned lazily (one per physics step) once a player is
  within 260 m. `game.fair` = { times, rides }.

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
  Grass has three distance bands: 3D tufts/flowers up close (`KINDS` radii, ~40 m),
  camera-facing billboard clumps from a canvas atlas out to ~115 m (`CLUMP`, one quad each,
  grey texels tinted by the ground colour, flower heads keep theirs), and beyond that only
  the world-space grass texture the terrain material paints on green ground (`grassGround`
  in `terrain.js`, canvas-made, normalised so far ground keeps its colour).
- **NPCs** (`src/npc.js`): `game.npcs.spawn(role | def, x, z, opts)` (or `R.npc`). Roles:
  townsfolk, lifeguard, farmer, businessman, taxi, skier, cowboy, explorer, surfer,
  fisherman, chef (and `teen`, world/fair/npcs.js); add more with `registerRole(name, def)`. def: `colors { shirt, pants,
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
- **Phone booths / bouncy ball / grab-on rides**: booths are `BOOTHS` in `world/booths.js`
  (`[name, x, z, yaw]`, yaw = open front; pick spots with a clearance probe: flat ground, an empty
  1.8 m box, room for a car 5 m ahead) and reuse the phone: `new PhonePanel(ui, p, { list, from,
  title })` and `callVehicle(game, p, entry, from)` / `findSpot(..., from)` spawn round `from`
  (`{ x, y: ground + 1, z, yaw }`) instead of the player. The bouncy ball is vehicle `hopper`
  (`world/bouncy.js`; its own `vehicle.control`, the 'hopper' handling, tilt locked with
  `setEnabledRotations`). Hanging off kinematic bodies is `player.rideCarry()`: the body eases
  to the grip point's velocity, limbs are clamped relative to it, the arm drives soften, the
  player stops colliding with rides while hanging (`rideGroups`, like seated riders: a ragdoll
  squeezed between kinematic cars jitters), the grip joint's anchor is led by 0.8 step of
  travel (Rapier solves it against the ride's start-of-step pose), it tears if a hand is
  dragged 0.75 m off its grip, and dragging along the ground at > 7 m/s knocks you off; grip
  drains at `RIDE_DRAIN` x the climbing rate. NB: Rapier reports tens of m/s of `linvel` on a
  forearm pinned to a fast ride that is really keeping pace (measure limb speed by position
  differences); `releaseHand` resets the arm to the chest's velocity so letting go doesn't
  fling it. A ride part needs colliders to be grabbed: `world/ridegrab.js` adds seat blocks to
  kinematic seat bodies that have none; give new rides real colliders (rails, chains, poles).
  Held vehicles never get put to sleep (game.step), so grabbing a parked car works.
