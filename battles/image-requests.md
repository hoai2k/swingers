# Wobbly Battles — image requests

Images the game can use, plus reference art. Drop each finished file at the path given
(relative to `battles/`). Everything in the game currently has a drawn or procedural
fallback, so nothing breaks while an image is missing. Items marked **wired** are used
as soon as the file is listed in `assets/manifest.json` (I add it when the image
arrives; the game preloads only what the manifest lists, so missing files never cause
broken images or 404s).

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
