# Wobbly Battles — image request history

Delivered requests (rounds 1–10, 63 image deliveries). Kept for the record: the
briefs, final paths and where each image is used. Open requests live in
`image-requests.md`.

## Delivered round 10 — map layout corrections

Delivered with built-in imagegen. Both 640 × 360 JPG replacements were checked
against the revised layouts, at small preview size and through browser preload.
Previous round-9 PNG/JPG files are preserved in `assets/originals/round9/ui/`.
Exact prompts, source paths and previous generations are in `assets/generation.json`.

### Round 10 — two map previews redone to match the built maps (2 images)

Same brief as rounds 4 and 9 (empty battlefield from a raised three-quarter view, no
soldiers, no text, no UI, point-symmetric, key features readable at 320 px; full-size
16:9 original at `assets/originals/ui/map-<id>.png`, cropped by
`tools/build_battles_assets.py`). The round 9 cards look great; only the layout differs
from what was built, so keep their style and colours and fix the items below. These
**replace** the current files.

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 62 | `assets/ui/map-blocky.jpg` | 640×360 JPG | delivered | "Blocky Plains" (Minecraft), as round 9 but laid out like the map: the **centre is a small square lava pool** (glowing orange, rimmed with grey cobblestone), with **no portal in the middle**. Instead there is **one obsidian nether portal on each half** (purple swirl, on a dark pad), mirrored through the centre, each beside a small cobblestone-and-plank hut. Cobblestone, mossy stone and ore outcrops (coal, iron, gold, diamond flecks) and grass-topped dirt mounds dot both halves; cube oak, birch and spruce trees around the edges; stepped terraced hills and cube mountains beyond, a square sun and square clouds, a few blocky sheep and cows outside the field. |
| 63 | `assets/ui/map-basingse.jpg` | 640×360 JPG | delivered | "Ba Sing Se Walls" (Avatar), as round 9 but with the great Earth Kingdom wall only along **one** side: the far edge, towering (much taller than in round 9, filling the top of the frame), ochre stone with green tile caps, a great arched gate with green doors and the Earth Kingdom emblem in the middle, a three-tier gatehouse and pagoda watchtowers. **No wall along the near edge or the sides**: there the field opens onto green hills cut into terraced farm fields with small farmhouses. In the field: a paved road across the middle to a small stone pavilion with red columns and a two-tier curved green roof at the centre, earthbent rock pillars and slabs jutting at angles on both halves, low ochre stone walls with green caps, bamboo clumps and pines. Warm afternoon light. |

## Delivered round 9 — four faction battleground previews

Delivered with built-in imagegen. Four 640 × 360 opaque JPG previews were checked
for empty battlefields, faction landmarks, balanced layouts and browser preload.
Full-size originals are in `assets/originals/ui/`; prompts and source paths are
recorded in `assets/generation.json`.

### Round 9 — previews for four faction battlegrounds (4 images)

Same brief as the round 4 map cards (see the history doc): each card shows that map's
**empty battlefield** from a raised three-quarter view, no soldiers, no text, no UI; the
key feature must read at 320 px wide; each field is point-symmetric (the two halves mirror
through the centre), so the art should feel balanced. Deliver a full-size 16:9 original at
`assets/originals/ui/map-<id>.png`; `tools/build_battles_assets.py` crops it to the
640×360 JPG (the ids are already in its map list). The game is private behind the invite
gate, so the franchises' real looks are fine.

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 58 | `assets/ui/map-starbase.jpg` | 640×360 JPG | delivered | "Starbase Hangar" (Galactic, a space-opera faction): a huge sci-fi hangar deck of grey metal floor plates with yellow-and-black hazard stripes and glowing blue landing circles. Low blast barriers and stacks of cargo crates give cover on both halves, a parked fighter ship sits at each end (mirrored), and a raised control platform stands in the centre. Beyond the open hangar mouth: a star field, a big ringed planet and a moon. Cool greys, blue lights, small orange warning lamps. |
| 59 | `assets/ui/map-shibuya.jpg` | 640×360 JPG | delivered | "Shibuya Crossing" (Jujutsu Kaisen's Halloween night): a wide city scramble crossing at night, dark asphalt with bold white zebra stripes in a big X, abandoned cars and taxis left at angles, traffic lights, lamp posts and a subway entrance kiosk in the middle. Glowing neon signs and giant screens on the tall buildings all round, a deep blue-purple night sky with a faint dome-shaped dark barrier shimmering overhead. Neon pinks, cyans and warm street-light yellows. |
| 60 | `assets/ui/map-blocky.jpg` | 640×360 JPG | delivered | "Blocky Plains" (Minecraft): a voxel landscape where everything is made of cubes: grass blocks with dirt sides, blocky oak and birch trees, a small cobblestone-and-plank village hut on each side (mirrored), a little lava pool and a stone outcrop, and a square obsidian portal frame with swirling purple in the centre. Square clouds and a square sun in a bright blue sky, blocky hills beyond. |
| 61 | `assets/ui/map-basingse.jpg` | 640×360 JPG | delivered | "Ba Sing Se Walls" (Avatar: The Last Airbender): the green-and-tan Earth Kingdom outer wall towering beyond the field with a great gate, earthbent rock pillars and slabs jutting from the ground on both halves, a small stone pavilion with a curved green roof in the centre, bamboo and pine trees, a paved road across the middle. Earthy greens, ochre stone, warm afternoon light. |

## Delivered round 8 — Minecraft and Avatar faction emblems

Delivered 2026-10-27 using built-in imagegen. Verified transparent 128 × 128
outputs, small-size readability and browser preload. Originals are preserved
in `assets/originals/ui/`; prompts and source paths in `assets/generation.json`.

### Round 8 — Minecraft and Avatar faction emblems (2 images)

| # | File | Size | Status | Brief |
|---|---|---|---|---|
| 56 | `assets/ui/faction-minecraft.png` (original: `assets/originals/ui/faction-minecraft.png`) | 128×128, transparent PNG | delivered | Faction emblem for **Minecraft**: a front-on pixel-art Creeper face (the classic green mottled square with the black eyes and frown-shaped mouth) over a crossed pixel diamond sword and pickaxe, on a small grass-block square. Blocky 16×16-pixel look scaled up crisply (hard pixel edges), framed in the same flat sticker style and bold outline as the other emblems. Greens (#5d9b3a, #3d7a26), diamond cyan (#4ae0d8), dirt brown (#7a5232). No text, readable at 28 px. (The game is private behind the invite gate, so the real Minecraft look is fine here.) |
| 57 | `assets/ui/faction-avatar.png` (original: `assets/originals/ui/faction-avatar.png`) | 128×128, transparent PNG | delivered | Faction emblem for **Avatar** (*Avatar: The Last Airbender*): the four-nations symbol, a circle split into the four element emblems (air swirl in orange-yellow, water waves in blue, earth square-in-square in green, fire flame in red), with the air nomad arrow faintly behind it. Same flat sticker style and bold outline as the other emblems. Orange (#e8892a), blue (#3a8ae0), green (#4a9a3a), red (#d83a2a). No text, readable at 28 px. (Private game behind the invite gate, so the show's real symbols are fine.) |

## Delivered round 7 — Jujutsu Kaisen faction emblem

Delivered 2026-10-26 with built-in imagegen. Verified 128 × 128 transparent PNG,
small-size readability and browser preload. Original preserved in
`assets/originals/ui/`; prompt and source in `assets/generation.json`.

### Round 7 — Jujutsu Kaisen faction emblem (delivered)

A big fan faction of the anime's characters (Gojo, Sukuna, Megumi, Yuji, Toji...). The
owner's look references for the units are in `reference/jjk/` (low-poly TABS-style
renders of Toji and Gojo).

| # | File | Size | Status | Brief |
|---|---|---|---|---|
| 55 | `assets/ui/faction-jjk.png` | 128×128, transparent PNG | delivered | Faction emblem for **Jujutsu Kaisen**: a cursed finger (a withered, dark-red mummified finger with a black nail) crossed with a cursed tool talisman, in front of a dark circle of blue-violet cursed energy flames. Black, deep red (#8a1c1c) and electric blue (#3a7bff). Same flat sticker style and bold outline as the other emblems, no text, readable at 28 px. |

## Delivered round 6 — new faction emblems (2 images)

Delivered 2026-10-26 with built-in imagegen. Both transparent emblems are 128 × 128.
Full-size originals are preserved in `assets/originals/ui/`; exact prompts and source
paths are recorded in `assets/generation.json`. Checked for dimensions, alpha,
requested subjects and browser loading through the game preload module.

### Round 6 — new faction emblems

Two new factions are being added, inspired by a sorcery anime and a space-opera saga.
The emblems must be **original**: no logos, symbols, lettering, characters or designs
from those franchises (no hand-sign or eye emblems copied from the show, no starbird,
Imperial cog or rebel crest). Same flat sticker style as the other 16 emblems, bold dark
outline, no text, readable at 28 px.

| # | File | Size | Status | Brief |
|---|---|---|---|---|
| 53 | `assets/ui/faction-jujutsu.png` | 128×128, transparent PNG | delivered | Faction emblem for **Jujutsu** (cursed-energy sorcerers): a cracked paper talisman (ofuda) with a swirl of blue-violet cursed flame curling up out of it, and a tiny round straw doll with a nail behind it. Deep indigo (#3b2a7a) and electric violet (#9b5cff), a touch of black. |
| 54 | `assets/ui/faction-galactic.png` | 128×128, transparent PNG | delivered | Faction emblem for **Galactic** (space knights, troopers and droids): a chunky toy-like glowing energy sword hilt (one cyan beam, short) crossed with a stubby ray-gun blaster in front of a small ringed planet and two stars. Night blue (#1d2a5a), cyan glow (#4fe3ff) and white. |

## Delivered round 5 — Unit Creator (2 images)

Delivered 2026-10-24 with built-in imagegen. The transparent emblem is 128 × 128
and the workshop illustration is 640 × 400. Both were checked for decoding,
alpha, requested subjects and browser preload loading. Full-size originals
are preserved in `assets/originals/ui/`; prompts are in `assets/generation.json`.


### Round 5: Unit Creator

The Unit Creator (title menu → *Unit Creator*) builds custom units that appear in a new
**Custom** faction tab in army setup. Both files are optional: the game shows a plain tab
and a text-only empty list until they arrive. Deliver the full-size originals as
`assets/originals/ui/faction-custom.png` and `assets/originals/ui/creator-empty.png`, then
run `tools/build_battles_assets.py`.

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 50 | `assets/ui/faction-custom.png` | 128×128, transparent PNG | **wired** (setup unit-bar tab for the Custom faction; the creator's header) | Faction emblem for player-made units: a tailor's dummy (mannequin bust) in a bean-soldier shape with a measuring tape round its middle, and a sewing needle and a little wrench crossed behind it. Warm orange (#ffb84a) and gold, flat sticker style like the other 15 emblems, bold outline, no text. Must read at 28 px. |
| 51 | `assets/ui/creator-empty.png` | 640×400, transparent PNG | **wired** (shown on the creator's unit list while no custom unit is saved) | A comedic workshop scene: a chubby bean-soldier tailor in an apron, a tape measure round its neck, stitching together a half-finished bean soldier on a workbench. Spare helmets, a sword, a bow and a feathered hat lie about, and bolts of blue and red cloth sit in a basket. Clean flat colours with soft shading, transparent around the scene (no background box), no text. |

## Delivered round 4 — new map art (7 images)

Delivered 2026-10-24 with built-in imagegen. Exact prompts and original paths are
in `assets/generation.json`. Six previews were checked through the game preload
loader at 640 × 360; the mood board was checked against all six map briefs.
The Volcano panel uses jungle mesas and dark tar pits.


### Round 4: new battle maps

Six new maps with terrain that changes the fight: walls, rivers, bridges, plateaus and
breakable crates and fences. Each preview card shows that map's **empty battlefield**
from a raised three-quarter view, with no soldiers, no text and no UI. The game shows
the card beside the Map option and on campaign level cards, so the map's key feature
must read at 320 px wide. Each field is laid out point-symmetrically, so the two
halves mirror each other through the centre. The art can be loose, but it should feel
balanced and not favour a left or right side. Deliver each card as a full-size 16:9
original at `assets/originals/ui/map-<id>.png`. `tools/build_battles_assets.py` crops it
to the 640×360 JPG. The new ids are already in that script's map list.

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 43 | `assets/ui/map-castle.jpg` | 640×360 JPG | **wired** (map preview card; campaign card) | "Castle Courtyard": a grassy castle courtyard with grey-beige cobbles in the middle. Two long, crenellated stone walls run across the field, one on each side, each with two open gateways flanked by round towers. A stone well sits in the centre. There are wooden crates and barrels by the walls, and a low raised stone platform behind each wall. Big outer curtain walls and towers ring the scene, with green hills and blue sky beyond. Neutral grey stone and brown wood; no team colours. |
| 44 | `assets/ui/map-river.jpg` | 640×360 JPG | **wired** | "River Crossing": a gently winding, shallow blue river runs through the middle of a summer meadow, separating the two halves. Two wooden plank bridges with rails cross it, one near each end, and there is a pebbly shallow ford in the middle. There is a soft rounded hill on each bank, low wooden fences near the banks, reeds, round oak trees and willows. |
| 45 | `assets/ui/map-cove.jpg` | 640×360 JPG | **wired** | "Pirate Cove": a sunny sandy beach around a round turquoise lagoon in the centre. A tiny sand island with one palm tree and a treasure chest sits in the middle of the lagoon, and two wooden boardwalks cross the lagoon either side of it. There is a half-buried wrecked wooden hull on each side, stacks of crates and barrels, and palm trees. The open sea is in the background with a cartoon pirate ship (plain sails, no flags or skull). |
| 46 | `assets/ui/map-volcano.jpg` | 640×360 JPG | **wired** | "Volcano Jungle": a lush jungle clearing with rich greens and brown earth. There is a flat-topped rocky mesa with sloped sides on each half, a bubbling dark tar pit on each side, and scattered boulders, palms and big broadleaf jungle trees. A huge cartoon volcano smokes in the distance with a glowing orange crater. Prehistoric mood, slightly warm and hazy sky. |
| 47 | `assets/ui/map-canyon.jpg` | 640×360 JPG | **wired** | "Canyon Ruins": a sandy desert canyon floor between two tall red-orange rock rims (one on each long edge) with sloped ramps up to them. In the middle is a low flat mesa, a king-of-the-hill spot. There are ancient sandstone ruins: broken walls, a ring of standing and toppled columns, and clay pots. Tall rock pillars and a warm sky beyond. |
| 48 | `assets/ui/map-graveyard.jpg` | 640×360 JPG | **wired** | "Spooky Graveyard": a moonlit graveyard at night in deep blue and purple with a soft violet fog. There are rows of grey tombstones and crosses on both halves, a stone mausoleum with columns in the dead centre, short black iron fences, gnarled dead trees, a few jack-o'-lanterns and a crooked church silhouette with a big pale moon. Comedic and cosy-spooky, not scary; keep the ground readable (blue-grey grass), not pitch black. |

### Round 4 reference

| # | File | What |
|---|---|---|
| 49 | `reference/maps-2.png` | One sheet with a colour-palette and mood board for each of the six new maps (castle, river, cove, volcano, canyon, graveyard): ground, path/paving, water (where the map has it), rock/stone, wood, trees, sky gradient and fog colour, plus a small sketch of each map's signature obstacle (wall with gate and towers, plank bridge, boardwalk and wreck, mesa and tar pit, ruined columns, tombstones and mausoleum). Same layout as `reference/maps.png`. |

## Rounds 1–3 delivery and review

**Status: all 43 requested files delivered. No open image requests.**
Round 3 (items 31–42) delivered six faction emblems and six reference sheets for
Pirate, Renaissance, Prehistoric, Good, Evil, Secret and the big beasts.
The six new emblems are built at 128×128 and registered in the preload manifest.
Full-size originals are in `assets/originals/ui/`; sheets are in `reference/`.
Reviewed in the game: all 15 faction emblems load in the setup tabs for both players,
and every round-3 sheet matches its brief. No replacements needed.
Exact built-in imagegen prompts, style references and dimensions are recorded in
`assets/generation.json`. Rebuild with `python3 tools/build_battles_assets.py`.

Earlier rounds: all 31 requested files delivered (18 UI images and 13 reference sheets).
Generated with the built-in imagegen tool. Exact prompts and final dimensions are in
`assets/generation.json`; high-resolution UI originals are in `assets/originals/ui/`.
Run `python3 tools/build_battles_assets.py` (Pillow) to rebuild the requested sizes.
All 18 UI images are now used in the game and were checked in the browser. The map
previews ship as JPEGs (`map-*.jpg`, ~50 KB each instead of ~300 KB) and the logo at
1200×525. The reference sheets were reviewed against their briefs. No replacements are
needed: every image matches its brief, the team colours are right and the transparency
is clean.
Reference sheets stay at generated resolution in `reference/`.

## Shared style

Bright, toy-like, comedic medieval fantasy in the spirit of *Totally Accurate Battle
Simulator*. Soldiers are chubby bean-shaped bodies with stubby arms and legs, big round
heads, simple cartoon faces (white eyes with black pupils, thick eyebrows), and no
noses, fingers or realistic anatomy. Use clean flat colours with soft shading and
saturated grass greens and sky blues. The two armies are **Blue (#3d72e3)** and **Red
(#e2403b)**, and gold accents are **#f2c230**. Do not use real brands, real people or
the TABS logo.

## 1. In-game UI

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 1 | `assets/ui/logo.png` | 1200×525, transparent PNG | **wired** (title screen; replaces the text logo) | The words **WOBBLY BATTLES** on two stacked lines, chunky rounded cartoon letters, slightly wobbly/tilted, "WOBBLY" in light blue (#7fd0ff) and "BATTLES" in red-orange (#ff7b6e), thick dark-navy outline (#1e2c48), small drop shadow. A tiny bean soldier with a sword peeks over one letter and another one is falling off the end. Must read clearly at 600 px wide. |
| 2 | `assets/ui/icon.png` | 512×512, transparent PNG | **wired** (browser tab icon) | Square app icon: one blue bean-soldier head with a dented helmet and an angry face, a red soldier's club bonking it from the side, a round coloured background. Readable at 32 px. |
| 3 | `assets/ui/faction-tribal.png` | 128×128, transparent PNG | **wired** (setup unit-bar tab) | Faction emblem: crossed wooden club and bone with a feather. Flat, bold, no text. |
| 4 | `assets/ui/faction-farmer.png` | 128×128, transparent PNG | **wired** | Faction emblem: pitchfork stuck in a hay bale. |
| 5 | `assets/ui/faction-medieval.png` | 128×128, transparent PNG | **wired** | Faction emblem: heater shield with a crown on it, crossed with a sword. |
| 6 | `assets/ui/faction-legacy.png` | 128×128, transparent PNG | **wired** | Faction emblem: a lit cartoon bomb with a wizard hat on it. |
| 20 | `assets/ui/faction-viking.png` | 128×128, transparent PNG | **wired** | Faction emblem: horned helmet over a round wooden shield, icy-blue accents (#5ec8e0). |
| 21 | `assets/ui/faction-ancient.png` | 128×128, transparent PNG | **wired** | Faction emblem: crested Greek hoplite helmet in front of a laurel wreath, marble/cream and bronze (#f2e4b8). |
| 22 | `assets/ui/faction-dynasty.png` | 128×128, transparent PNG | **wired** | Faction emblem: a katana crossed with a lit firework rocket, red and gold (#e2556b). |
| 23 | `assets/ui/faction-wildwest.png` | 128×128, transparent PNG | **wired** | Faction emblem: cowboy hat on a revolver with a stick of dynamite, sandy gold (#e8b84a). |
| 24 | `assets/ui/faction-spooky.png` | 128×128, transparent PNG | **wired** | Faction emblem: a grinning cartoon skull with a lit candle on top, cool grey (#8c95a8). Comedic, not scary. |
| 7 | `assets/ui/map-grass.jpg` | 640×360 JPG | **wired** (preview beside the Map option; campaign level card) | Map preview card, "Simulation Grassland": rolling green hills, low-poly round trees, flowers, blue sky, empty battlefield in the middle. |
| 8 | `assets/ui/map-desert.jpg` | 640×360 JPG | **wired** | Map preview, "Dusty Dunes": sandy dunes, cacti, sandstone rocks, warm sky. |
| 9 | `assets/ui/map-winter.jpg` | 640×360 JPG | **wired** | Map preview, "Frozen Pass": snowy field, snow-capped pines, light snowfall. |
| 10 | `assets/ui/map-autumn.jpg` | 640×360 JPG | **wired** | Map preview, "Autumn Valley": orange and red trees, golden grass, haystacks. |
| 11 | `assets/ui/loading.jpg` | 1920×1080 JPG | **wired** (loading screen, logo on top) | Loading-screen key art: two bean armies (blue left, red right) charging at each other across a green field, with a giant in the red army, an arrow volley in the sky and a bomb going off. Leave the centre third calm so a logo and progress text can sit on top. |
| 12 | `assets/ui/victory-blue.png`, `assets/ui/victory-red.png` | 1200×400, transparent PNG | **wired** (result screen; the title sits on the ribbon) | Banner art behind the result text: a ribbon banner in the team colour with a few bean soldiers cheering and jumping in front of it. No text. |


### Round 3: new faction emblems

| # | File | Size / format | Status | What |
|---|---|---|---|---|
| 31 | `assets/ui/faction-pirate.png` | 128×128, transparent PNG | **wired** (delivered) | Skull wearing a tricorn hat over two crossed cutlasses, sea green (#2a9d7c) and gold. Flat sticker style like the other emblems. |
| 32 | `assets/ui/faction-renaissance.png` | 128×128, transparent PNG | **wired** (delivered) | Vermilion (#d0503c) shield with a gold quill crossed with a halberd, a small Vitruvian-style circle behind. |
| 33 | `assets/ui/faction-prehistoric.png` | 128×128, transparent PNG | **wired** (delivered) | T-Rex skull over a crossed bone club, jungle green (#3daa6e) with ivory and gold. |
| 34 | `assets/ui/faction-good.png` | 128×128, transparent PNG | **wired** (delivered) | Golden halo over a white tower shield with a sun emblem, soft gold (#ffe680). |
| 35 | `assets/ui/faction-evil.png` | 128×128, transparent PNG | **wired** (delivered) | Purple (#8e4fd6) horned skull with a spiked flail and a small hourglass behind it. Comedic, not scary. |
| 36 | `assets/ui/faction-secret.png` | 128×128, transparent PNG | **wired** (delivered) | A big question mark made from a banana, with a chicken peeking round it, mint (#3fd0a0). |

## 2. Reference art (not shipped, guides future model and colour work)

The units are built procedurally from primitives in `src/visual.js`. These sheets show
how each unit should look so the models can be refined to match. Each sheet should
show the unit front-on and three-quarter, in both team colours, on a plain light
background, with its weapon.

| # | File | What |
|---|---|---|
| 13 | `reference/style-sheet.png` | One sheet of body proportions: a plain bean soldier front, side and back, showing head size (about 40% of height), torso shape, stubby limbs, hands as balls, boots, and where the team colour goes. |
| 14 | `reference/faces.png` | Face expression sheet on a round head: normal, angry, scared (sweat drop), hurt (squeezed >< eyes), dead (X eyes, tongue out), happy/cheering, plus a blink. |
| 15 | `reference/tribal.png` | Clubber (huge club, fur), Protector (big wooden plank shield, skull cap), Spear Thrower (feather headband, war paint, javelins), Chieftain (antler headdress, giant stone axe). |
| 16 | `reference/farmer.png` | Halfling (tiny, curly hair, little pitchfork), Farmer (straw hat, overalls, pitchfork), Hay Baler (big, flat cap, throwing a hay bale), Potion Seller (hooded old man with white beard, green potions). |
| 17 | `reference/medieval.png` | Bard (feathered cap, lute), Squire (round shield and sword, metal cap), Archer (green hood, longbow, quiver), Healer (white nun's robe with red cross), Knight (full plate, bucket helm with plume, greatsword), King (crown, beard, cape, enormous sword). |
| 18 | `reference/legacy.png` | Berserker (bare-chested, horned helmet, orange beard, two axes), Bomber (goggles, apron, holding a lit bomb), Wizard (tall blue hat, white beard, staff with a glowing orb), Giant (green-skinned ogre, 2.3× height, loincloth, bare fists). |
| 19 | `reference/maps.png` | One colour-palette and mood board per map (grass, desert, winter, autumn): ground, trees, rocks, sky gradient and fog colour. |
| 25 | `reference/viking.png` | Brawler (hammer, wooden shield), Headbutter (huge horned helmet, mid-headbutt), Ice Archer (fur hood, frosty bow, ice arrows), Jarl (big beard, cape, axe, leaping), Valkyrie (winged helmet, feathered wings, sword, flying). |
| 26 | `reference/ancient.png` | Hoplite (crested helmet, round bronze shield, spear), Sarissa (very long pike), Snake Archer (snake-scale hood, green poison arrows), Minotaur (bull head, horns, charging), Zeus (toga, huge white beard, floating, lightning in hand). |
| 27 | `reference/dynasty.png` | Monk (orange robe, bald, palm strike), Samurai (lacquered armour, katana in parry stance), Firework Archer (bow with a rocket arrow), Hwacha (soldier carrying a rack of 16 rockets on his back). |
| 28 | `reference/wildwest.png` | Cactus (a living cactus with a cartoon face and cowboy hat), Gunslinger (cowboy hat, poncho, revolver with smoke), Blunderbuss (flared shotgun), Lasso (spinning rope), Dynamite (miner with lit sticks). |
| 29 | `reference/spooky.png` | Skeleton and Skeleton Archer (goofy bones, one falling apart), Candlehead (head is a lit candle), Vampire (cape with high collar, fangs), Reaper (hooded black robe, giant scythe, skull face). Comedic, not scary. |
| 37 | `reference/pirate.png` | Flintlock Pirate (smoking pistol), Harpooner (barbed harpoon and line), Bomb Thrower, Pirate Captain (tricorn, cutlass and pistol), Pirate Queen (two pistols, big hat), and the crewed Cannon on a wheeled carriage with its gunner. |
| 38 | `reference/renaissance.png` | Halberd, Fencer (rapier lunge), Musketeer (volley pose), Balloon Archer (an archer hanging under a striped balloon), Painter (beret, palette, paint splats), and the Da Vinci Tank (wooden cone tank with cannons round the rim, engineer in the hatch). |
| 39 | `reference/prehistoric.png` | Caveman (femur club, shaggy hair, team headband), Velociraptor (olive with a team-coloured feather crest and stripes, mid-leap), Raptor Rider (skull cap, club), Pterodactyl (team-coloured wing membranes and crest, carrying a soldier), T-Rex (team war-paint bands, roaring). |
| 40 | `reference/big-beasts.png` | Ancient War Elephant (bronze armour, team caparison, howdah with two archers), Dynasty Battle Elephant (lacquered plates, spiked head-plate, mahout, banners), Dynasty Dragon (team-coloured scales, gold belly, orange flame mane, ivory horns, bat wings, breathing fire). |
| 41 | `reference/good-evil.png` | Good: Shield Bearer (huge tower shield), Cleric (heal beam), Angel (wings, halo, holy sword), Phoenix (fire bird), Super Peasant (flying fist-first). Evil: Fan Bearer, Mace Spinner (two flails), Necromancer with a zombie, Chronomancer with a slow-time bubble, Tree Giant throwing a tree. |
| 42 | `reference/secret.png` | Banana Thrower with peels on the ground, Cheerleader (pom-poms), Bomb on a Stick, Chicken Man throwing chickens, Lightning Gun with chained arcs, Ullr (archer god on skis with frost arrows). |
| 30 | `reference/siege-mounts.png` | Cavalry knight on a chunky toy horse with a couched lance; a woolly Mammoth with tusks, a rider and a drummer on top; a wooden Catapult cart with its crewman; a Ballista bolt-thrower; show the same bean-soldier proportions as the rest. |

All 43 listed files have arrived. All 24 UI assets are wired into the game.
Reference sheets remain available for future procedural model refinement.

Round 4 review: all six map previews and `reference/maps-2.png` match their briefs (point-symmetric layouts, readable at preview size) and preload in the game; they appear on the map cards once the new maps are merged. Accepted, no replacements.

Round 5 review: the workshop illustration fills the creator's empty list and the Custom emblem reads well in the creator header (checked in headless Chromium). Accepted, no replacements.
