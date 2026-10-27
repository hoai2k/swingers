# WOBBLERS

An open-world physics sandbox in the spirit of **Wobbly Life**: wobbly active-ragdoll
characters, drivable vehicles, rides and an island full of things to grab, throw, climb
and fall off, plus jobs that pay coins. Local split-screen for **up to 8 players** on Xbox
controllers and keyboards.

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
the look is remembered per player slot (Player 1, Player 2...), so **A** plays straight away with it. **24 presents** are hidden around the
island (rooftops, towers, under the pier, on a raft...): touch one to open it and unlock a new
hat, face or pair of trousers for everyone (16 hats, 4 faces, 4 trousers; progress is saved, and
shown in the customiser and menu; *Settings → Reset presents* starts over). Locked items are
skipped in the customiser. **Y** (or **E** / **F1**) on the title
opens the controls overlay.

**Start** / **Esc** opens that player's own menu (resume, customise, respawn, settings,
controls, reset vehicles, leave). With one player it pauses the game; in split screen it
only covers that player's view. Settings (music and sound volume, shadows, resolution, and
per-player invert-Y and camera sensitivity) are saved in `localStorage`. The buttons in the top-right
corner (they fade out while the mouse is idle in play) toggle fullscreen and sound and open the
shared settings with the mouse; leaving the title (the first join) goes fullscreen by itself. Menus work with the
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
| Gadget: jetpack / glider (hold in the air) · laser / grappling hook (fire) | A · X | Space · G | Numpad 0 · Numpad 2 |
| Drive | RT gas, LT brake/reverse, LS steer, A handbrake, X horn (siren on police / fire) | W/S, A/D, Space, H | Arrows, Numpad 0, Numpad + |
| Fly (helicopter) | RT / A up, LT / LB down, LS forward-back + turn | Space up, Shift down, WASD | Numpad 0 up, Numpad . down, Arrows |

**Map** opens the island map in your own view (pan with the stick, zoom with the triggers,
**A** to find yourself). The **phone** calls any vehicle to you: it pops in on a clear spot
beside you, facing your way. Boats need water nearby and helicopters need open space. Each
player has one called vehicle; calling another sends the old one away unless someone is in it.
Red **phone booths** (in town, at the Fun Park, by the ferry piers and in every island's
village or harbour; shown on the map) are a garage: **Y** at a booth lists every vehicle you
have (locked car-dealer ones aren't offered) and the one you pick pops in right outside the
booth (it counts as your called vehicle).

The **bouncy ball** (on the phone, and parked by the playground, the Fun Park and on each
island) is a big space hopper: sit on it with **Y** and it hops by itself; the stick leans
(forward / back) and turns, and holding **A** at a landing bounces it about 3.5 m high. It
floats, bumps people over and carries a second rider.

**Moving rides can be grabbed**: hold LT / RT on a roller-coaster car, ferris-wheel gondola,
carousel pole, swing-ride chair or chain, drop-tower seat, ferry... and you hang on while it
moves (even when every seat is taken). Your grip still tires (slower than on a wall, ~20 s), so
eventually you drop; let go of the triggers to fall off, or **Y** to climb into a free seat.
Being dragged into the ground at speed knocks you off.

Hold a trigger to raise that arm; the hand grabs whatever it touches (props, other
players, ledges, bars) until you let go. Punch while holding something to throw it: light
things fly far, a crate a few metres, a sofa not much further than you can stagger. Punching
at a ball, can or teddy throws it too; facing a hoop, the cans or the bowling pins aims the
throw. Y also sits you on benches, chairs (indoors and the outdoor cafe chairs), stools,
sofas, armchairs and beanbags, and works machines and buttons (vending machines, jukebox,
game resets). Push toward a ladder to climb it. Grab a ledge's top edge with both hands
and jump (or push forward) to pull yourself over it; flat walls can't be scaled, and
hanging tires your arms, so you drop after a while and need a rest on the ground. Jumping
while hanging from bars or ropes hops you up and forward. Look up with the camera to reach
higher. Leaving a ride (Y) drops you off right where you are.

Browsers on Windows expose at most four XInput (Xbox) pads, so 8 players means mixing
pads with the two keyboard schemes (or using controllers that show up as generic HID).

## Coins, shops, homes and pets

Everybody playing on the machine shares one **coin purse** (the counter in the top-right
corner of every view). Earn coins by collecting the spinning coins scattered around the
island (trails along the roads, rings in the parks, little stacks on rooftops and other
hard-to-reach spots, a line in the air over the stunt-park jump; they come back after a
while, and big ones are worth 10), opening presents (+25), discovering a map area for the
first time (+10), big air in a car ("Stunt!", +5 or more), scoring baskets, bowling strikes
and knocking down the cans. Spend them in the four shops on the north-east town block. Walk
up to the till and press **Y**:

- **CLOTHES**: hats, faces and trousers that you can only buy here (presents keep their own
  rewards). You try on whatever you highlight, and anything bought unlocks for everyone.
- **PET SHOP**: a dog, cat, bunny or penguin of your own. It follows you everywhere: it
  hops up kerbs, paddles through water, sits when you stop, jumps into your car with you,
  and you can pick it up and carry it. Your menu can call it back to you.
- **HOMES** (the estate agent): three bungalows in the suburbs and the two-storey house by
  the town hall. Your home is where you join and respawn. Its name plate shows your colour,
  the wardrobe opens the customiser, and the bed skips to morning (or to the evening).
  The FOR SALE board in each garden sells the house too.
- **CAR DEALER**: the sports car, ice-cream van, bus, police car, fire truck and helicopter.
  Once bought they show up in everyone's phone.

## Gadgets

The **GADGETS** shop stands in the yard of the north-east town block, behind the four
shops above, its door on the outer town road. Walk up to the till and press **Y**: you try on
whatever you highlight, and a bought gadget is everyone's for good. Each player wears one
gadget at a time, chosen in the shop or on the customiser's **Gadget** row (bought ones only),
and it is remembered with that player slot's look. Your view shows how to use it for a few
seconds after you put it on.

| Gadget | Price | How it works |
|---|---|---|
| High-jump boots | 160 | jumps go about three times as high; springy soles, so the landing doesn't knock you over |
| Speed boots | 220 | walk and sprint about 1.65x faster, with a sparkly trail |
| Glider | 260 | hold **A** / **Space** while falling: the wing opens, you sink slowly and sail forward (steer with the stick) |
| Laser gun | 320 | held in your right hand (that hand can't grab): **X** / **G** fires a bolt that knocks people and NPCs over (they get back up) and shoves props. Holding something loose in the other hand, **X** throws it as usual |
| Grappling hook | 380 | right hand: **X** / **G** shoots the hook where the camera looks (look up to aim higher) and reels you in; **A** lets go early. Hooking a loose prop or a person pulls it to you |
| Jetpack | 450 | jump, then keep holding **A** / **Space**: thrust up and fly with the stick. About 3 s of fuel (the bar in your prompt), refilled after a moment on the ground. Mind the fall when it runs dry! |

Coins, purchases, homes, pets and discovered areas are saved. *Settings → Reset coins,
homes & pets* starts over.

## Jobs

Walk up to anyone with a floating **!** over their head (or a **JOBS** board) and press **Y**
to start a job; the givers are on the map too. Your view shows the objective, a timer and an
arrow with the distance to the next target, and a light beam marks it in the world. Finish in
time to get paid into the shared purse; a results card shows your time, medal (bronze, silver,
gold: faster pays more) and best time. Jobs are repeatable; best medals and times are saved.
In split screen, press **Y** at a giver whose job is already running to join in (each player who
helps gets a share, and co-op pays 25% more per extra player), or do different jobs at the same
time. Cancel a job from your menu (**Start**); the menu also shows how many jobs you've done.
The phone's **X** opens the jobs list (all jobs with their best medal; **A** sets a waypoint).

| Island | Job | What you do | Pay |
|---|---|---|---|
| Wobbly Island | 🍕 Pizza Rush | ride the scooter to three front doors | 40 |
| | 🚒 Fire Brigade | drive the fire truck up to three fires and hose them | 55 |
| | 🛟 Beach Rescue | swim (or boat) out to a struggling swimmer and bring them back | 45 |
| | 🐑 Sheep Round-up | herd or carry four skittish sheep into the pen | 45 |
| Bigtown | 🚕 Bigtown Cab | two taxi fares across town | 70 |
| | 📦 Parcel Round | stop the delivery van at four drop-offs | 60 |
| | 🏗️ Building Site | carry girders and crates to the crane's hook pad | 50 |
| | ⚽ Stadium Shoot-out | score three goals | 40 |
| Frostpeak | ⛷️ Downhill Dash | race down the piste through the gates | 50 |
| | ☕ Hot Cocoa Run | find four chilly skiers | 40 |
| | 🏔️ Mountain Rescue | fetch a climber from the ice cave on the snowmobile | 60 |
| Dusty Dunes | 🤠 Wanted: Cactus Kid | chase the outlaw, grab him, march him to jail | 70 |
| | 🏁 Dune Buggy Rally | checkpoint race in the buggy | 45 |
| | 🦴 Fossil Dig | find three buried bones and bring them back | 40 |
| Tiki Jungle | 🛶 River Rapids | raft down the river through the hoops | 50 |
| | 🗿 Temple Treasure | climb the temple, carry the golden idol to the village | 55 |
| Coconut Cove | 🌊 Ring Racer | jet ski through the rings round Resort Isle | 50 |
| | 🧹 Beach Clean-up | put the litter in the bins | 45 |
| | 🚤 Water Taxi | speedboat a guest from the jetty to the resort | 45 |

## The island

- **Town** — plaza with a fountain (spawn), shops, town hall, apartments, suburbs, parked cars,
  bins, cones, crates, shopping trolleys you can ride, wheelie bins you can hide in.
  Walk into the **cafe** (jukebox, rooftop terrace up the outside stairs), the **market**
  (trolleys, vending machine) and the **arcade** (air hockey and playable cabinets, below); the two-storey house by the
  town hall has a playable piano downstairs and a bedroom upstairs. Doors swing on hinges.
- **Playground** (NE) — swings (pump with the stick), slide, see-saws, merry-go-round,
  monkey bars, trampolines, spring riders, sandbox.
- **Swimming pool** (SE) — shallow and deep ends, springy diving board, 5 m high-dive,
  twisting water slide, pool toys and a giant rubber duck.
- **Wobble Works** (the west meadow, down the road west from town) — a toy factory: walk into the
  saw-tooth-roofed hall where conveyor belts carry toy boxes through a wrapping machine into
  bins (ride a belt yourself), climb the catwalk, the stacked shipping containers or the water
  tower, and drive the **forklifts** (A raises the forks, B lowers them) to lift pallets of crates
  at the LOADING BAY. Two smokestacks puff away.
- **Pooh Berry Farm** (just south of the factory, a lane off the west ring road) — a farm with a red
  barn and hayloft, silos and a machinery shed full of giant machines: a **combine harvester**
  that really cuts the wheat field as you drive through it (dropping round straw bales; the
  wheat grows back), a huge **4WD tractor** and a **crop sprayer**. Wheat, sunflowers and corn
  sway in the wind and bend out of your way as you push through.
- **Corn Maze** (south-west of the farm) — tall corn you can push through (slowly), with paths
  to the lookout in the middle (coins on top) and a scarecrow.
- **Fun Park** (on its own grassy shelf at Bigtown's west shore, just north of the bridge;
  a ramp road runs up from its gate to Brick Row) — ferris wheel, carousel, roller coaster
  (catch hold of a car's side handles and hang on for the ride), swing ride, drop tower,
  bumper cars, bouncy castle, food stalls, a can-toss stall (win a teddy) and a bowling lane.
  The striped **MAGIC TENT** (west side, between the ferris wheel and the drop tower) has a
  crystal ball: press **Y** at it to turn into a **goat** (X: charging headbutt), a
  **velociraptor** (X: bite; people nearby run away screaming) or a **giant grasshopper**
  (A: enormous jumps with a long hop forward). A shape lasts one minute (the countdown in your
  view flashes and you flicker for the last 5 seconds); animals can't grab or climb, but walk,
  swim, flop and drive. Respawning (or the crystal ball's *Back to normal*) turns you back.
- **Stratford Fall Fair** (south, on the beach road just past the ring road) — an autumn
  fairground under maples in red and gold, with falling leaves, pumpkins, hay bales, stalls and
  lots of teenagers. Fourteen rides to sit on (Y; Y again to hop off, even mid-ride): Pirate Ship
  and Viking Ship (swinging ships), Ring of Fire (a train that loops the loop), Gravitron and
  Starship 2000 (spinning saucers that pin you to the wall), Zipper (flipping cages on a turning
  boom), Top Spin, Drop Tower, Tilt-a-Whirl, Himalaya (forwards and backwards over the hills),
  Sizzler, a Ferris Wheel, a classic Carousel with up-and-down horses and a Mini Train. A pumpkin
  patch with a scarecrow and pumpkins to kick about outside the east fence.
- **Stunt park** (SW) — ramps, a jump gap, half-pipe, quarter pipes, crates to smash.
- **Sports field** (NW) — football pitch with a giant ball, basketball court with working
  hoops and a scoreboard, parking lot.
- **Kart track** (east) with six go-karts; **farm** with hay bales and a pickup;
  **mountain** with a lookout, boulders to roll, quad bikes and a **zip line** down to the
  lake; **lake** with a camp, boats, log rafts and a rope swing;
  **beach** with a pier, boats, palms and a lighthouse.

## The arcade

Four playable cabinets stand along the back wall of the town arcade, each showing a demo on
its screen. Walk up and press **Y** to play: the game fills your own view (split screen works;
everyone can play a different cabinet at once). Stick / D-pad (WASD or arrows) to move,
**A** / **X** (Space, G or the mouse) to fire, **Start** / **B** (Esc) to leave.

- **CHOMP MAZE** — eat every dot in the maze while four ghosts hunt you, each its own way;
  power pellets turn them blue so you can eat them. Bonus berries, lives, levels.
- **SPACE RAIDERS** — a marching grid of raiders that speeds up as it shrinks, crumbling
  shields, a bonus saucer, waves.
- **BUG BLASTER** — a segmented bug winds down through the mushrooms; shot segments become
  mushrooms and split it. Spider and flea too.
- **PADDLE BALL** — first to 11. With more than one player, starting it invites the others
  (**Y** join / **B** no thanks, in their view); after 10 s without a taker you play the CPU.
  Anyone can also press **Y** at the cabinet to take over the CPU's paddle.

High scores (top 5 per game, and wins against the CPU) are saved; good scores pay coins
into the purse.

## The archipelago

Around the home island lie five more islands, each with its own landscape, people and things
to do (a banner welcomes you as you arrive; the map zooms out to show them all):

- **Bigtown** (east) — the city, over a drivable suspension bridge from the home island's
  east road. Skyscrapers, traffic lights and a self-driving bus and taxis you can ride or take
  over; the 150 m Bigtown Tower with a glass elevator up to a rooftop helipad and a jump-off
  plank; a stadium with a giant ball, a building site with a tower crane you can climb and ride,
  a three-level parking garage, City Park, Market Street, a cinema, diner and harbour beach.
  Taxis, limos, delivery vans, garbage trucks and city buses.
- **Frostpeak** (north) — icy mountains. A ski village with a walk-in ski lodge (hot cocoa),
  a 22-chair chairlift to the top station, a ski run you carve down at speed, a ski jump, a
  frozen lake to skate on, an ice cave, an observatory, snowmen and snowball fights, and a
  fishing hamlet by the ferry. Snowmobiles, a snowcat and sleds.
- **Dusty Dunes** (west) — the wild-west town of Dustville (saloon with swinging doors and a
  piano, sheriff's office with a jail, general store, water tower, windmill), a mine-cart ride
  through the gold mine in Red Rock Canyon, a swaying rope bridge, a pyramid with a hidden
  treasure room, a dinosaur dig, an oasis, bouncy cacti, rolling tumbleweeds and dune-buggy
  ramps. Dune buggies, a monster truck, horses and camels.
- **Tiki Jungle** (south-west) — a volcano with a lava lake that flings you out, a river with
  rapids and a raft ride, a waterfall with a crystal cave behind it, a stilt village with
  treehouses, rope bridges, zip lines and vines, a temple with a lever puzzle, and bouncy
  mushrooms. Jeeps, canoes and log rafts.
- **Coconut Cove** (south-east) — tropical islets in a turquoise lagoon: a resort hotel with a
  pool and swim-up bar, beach volleyball, surfing, a harbour full of boats (speedboats, a
  sailboat, pedalos, a banana boat, jet skis), a lighthouse, a snorkel reef with fish and
  turtles, and a pirate shipwreck. Beach buggies and golf carts.

Every island has its own people (sheriffs, skiers, tiki villagers, taxi drivers...), coins
to collect, presents to find and jobs to do.

**Ferries** sail between them: the *Island Hopper* (home beach, Coconut Cove, Tiki Jungle),
the *Frostpeak Ferry* (home north coast) and the *Desert Ferry* (home west coast). Walk on
board at a dock (straight down the pier), stand on deck or sit on a bench, and get
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
| `src/world/booths.js` | phone booths (`BOOTHS`): the phone panel as a garage list spawning outside the booth, map icons |
| `src/world/bouncy.js` | the bouncy ball vehicle (`hopper`: ball collider with locked tilt, hop handling, rolling look) and its parked spots |
| `src/world/ridegrab.js` | grab blocks on ride seats whose kinematic body has no colliders (every ride can be hung from) |
| `src/ui.js` | HUD, title, join + customiser, per-player menus, controls overlay, prompts, toasts |
| `src/forms.js` | the Magic Tent and shape-shifting (goat / velociraptor / giant grasshopper): animal looks on the ragdoll, attacks, timer HUD, chooser panel, magic puffs |
| `src/emotes.js` | emotes (wave, point, dance, clap, flex, bow, sit, flop, cheer, laugh) as ragdoll pose overrides, the per-view emote wheel and quick emotes |
| `src/glyphs.js` | Xbox-style button glyphs / key caps |
| `src/gadgets.js`, `src/world/gadgetshop.js` | gadgets (jetpack, boots, glider, laser gun, grappling hook): behaviour, meshes, sounds, HUD hint; the GADGETS shop building |
| `src/cosmetics.js`, `src/settings.js` | faces, trousers and saved looks (locked items skipped); persistent settings |
| `src/hats.js`, `src/unlocks.js`, `src/world/presents.js` | unlockable hats; which present unlocks what (saved progress); the presents in the world (placement, bob/glow, touch to open, confetti) |
| `src/audio.js`, `src/music.js` | synthesized SFX, engines, rides and ambience; procedural day / night music |
| `src/world/interiors.js`, `furniture.js` | enterable buildings (hollow shells, physics doors, stairs) and loose furniture |
| `src/world/fair/` | the Stratford Fall Fair: layout, ride helpers (`common.js`), rides (`rides-a.js`, `rides-b.js`, `train.js`), decor + falling leaves, the `teen` NPCs |
| `src/world/fun.js`, `music.js` | trolleys, bins, beach balls, can toss, bowling, rope swing, rafts, zip line; jukebox, piano, vending machines |
| `src/world/lights.js`, `posters.js` | interior light pool (per-view nearest lights) and framed posters |
| `src/assets.js`, `tools/build_manifest.py` | optional painted art (faces, signs, posters, logo) swapped in when listed in `assets/manifest.json`; see `image-requests.md` |
| `src/world/common.js` | world helpers: building-local placement, walls/stairs/rails, doors, use spots, punch-to-throw, ladders, `groundAt` |
| `src/life/` | life sim: `state.js` (saved coins/purchases/homes/pets), `wallet.js` (shared purse, `game.wallet`), `hud.js` (coin counters, floaters), `coins.js` (pickups), `earn.js` (areas, stunts, mini-game prizes), `shops.js` (shop panels, vehicle locks), `pets.js` (pets), `index.js` (wiring) |
| `src/missions/` | jobs: `index.js` (manager: givers, runs, pay, map overlay), `steps.js` (objective step types), `ai.js` (mission NPC brains), `fx.js` (markers, beacons, hoops, fires, job items, cargo), `hud.js` (objective, pointer, results cards), `panel.js` (jobs list), `state.js` (saved medals), `jobs/*.js` (the jobs per island) |
| `src/arcade/` | arcade cabinets: `index.js` (cabinet build, sessions, fixed-step loop, invites, high scores, bleeps), `panel.js` (per-player game panel, invite prompt), one file per game (`chomp.js`, `raiders.js`, `bugs.js`, `paddle.js`); `tools/arcade-sim.mjs` runs their attract AI headless in node |
| `src/world/estate.js` | the CLOTHES / PET SHOP / HOMES / CAR DEALER buildings, the bungalows for sale, name plates, beds, wardrobes, `game.homes` |
