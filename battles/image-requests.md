# Wobbly Battles — image requests

Images the game can use, plus reference art. Drop each finished file at the path given
(relative to `battles/`). Everything in the game currently has a drawn or procedural
fallback, so nothing breaks while an image is missing. Items marked **wired** are
picked up automatically as soon as the file exists.

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
| 1 | `assets/ui/logo.png` | ~1600×700, transparent PNG | **wired** (title screen; replaces the text logo) | The words **WOBBLY BATTLES** on two stacked lines, chunky rounded cartoon letters, slightly wobbly/tilted, "WOBBLY" in light blue (#7fd0ff) and "BATTLES" in red-orange (#ff7b6e), thick dark-navy outline (#1e2c48), small drop shadow. A tiny bean soldier with a sword peeks over one letter and another one is falling off the end. Must read clearly at 600 px wide. |
| 2 | `assets/ui/icon.png` | 512×512, transparent PNG | **wired** (browser tab icon) | Square app icon: one blue bean-soldier head with a dented helmet and an angry face, a red soldier's club bonking it from the side, a round coloured background. Readable at 32 px. |
| 3 | `assets/ui/faction-tribal.png` | 128×128, transparent PNG | **wired** (setup unit-bar tab) | Faction emblem: crossed wooden club and bone with a feather. Flat, bold, no text. |
| 4 | `assets/ui/faction-farmer.png` | 128×128, transparent PNG | **wired** | Faction emblem: pitchfork stuck in a hay bale. |
| 5 | `assets/ui/faction-medieval.png` | 128×128, transparent PNG | **wired** | Faction emblem: heater shield with a crown on it, crossed with a sword. |
| 6 | `assets/ui/faction-legacy.png` | 128×128, transparent PNG | **wired** | Faction emblem: a lit cartoon bomb with a wizard hat on it. |
| 7 | `assets/ui/map-grass.png` | 640×360 PNG/JPG | not wired yet | Map preview card, "Simulation Grassland": rolling green hills, low-poly round trees, flowers, blue sky, empty battlefield in the middle. |
| 8 | `assets/ui/map-desert.png` | 640×360 | not wired yet | Map preview, "Dusty Dunes": sandy dunes, cacti, sandstone rocks, warm sky. |
| 9 | `assets/ui/map-winter.png` | 640×360 | not wired yet | Map preview, "Frozen Pass": snowy field, snow-capped pines, light snowfall. |
| 10 | `assets/ui/map-autumn.png` | 640×360 | not wired yet | Map preview, "Autumn Valley": orange and red trees, golden grass, haystacks. |
| 11 | `assets/ui/loading.jpg` | 1920×1080 JPG | not wired yet | Loading-screen key art: two bean armies (blue left, red right) charging at each other across a green field, with a giant in the red army, an arrow volley in the sky and a bomb going off. Leave the centre third calm so a logo and progress text can sit on top. |
| 12 | `assets/ui/victory-blue.png`, `assets/ui/victory-red.png` | 1200×400, transparent PNG | not wired yet | Banner art behind the result text: a ribbon banner in the team colour with a few bean soldiers cheering and jumping in front of it. No text. |

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

When you add images, tell me which ones arrived. I'll wire up the "not wired yet"
ones (map select previews, loading screen, victory banners) and tune the models
against the reference sheets.
