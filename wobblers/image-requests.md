# Wobblers image requests

**Status: round 3 delivered — 3 replacement faces, 2026-10-24.** Round 2 delivered — 4 faces; round 1 delivered — 51 images (45 used in game + 6 reference sheets), 2026-10-24.

## Delivered round 3: replace three faces (3 images) — `assets/faces/`

Replaced the three semi-realistic faces with bold, flat cartoon features,
thick dark outlines and solid fills at the same file names. All three are
transparent 512 × 512 images, framed within the middle ~65% of the square,
and verified through the game's face-texture hook. Final prompts and prior
generation records are preserved in `assets/generation.json`.

| File | Size | Expression |
| --- | --- | --- |
| `face_cheeky.png` | 512 × 512 | One eye winking (a thick happy arc), the other a big round cartoon eye; wide grin with the tongue poking out. |
| `face_lashes.png` | 512 × 512 | Big round cartoon eyes with **three thick, simple curled lashes** on each upper lid, sweet small smile, pink blush ovals. |
| `face_sleepy.png` | 512 × 512 | Heavy half-closed eyelids drawn as thick flat lines over half-circle eyes, tiny relaxed smile. |

**Face style (round 3 and any future faces):** match `face_happy.png`,
`face_surprised.png`, `face_ko.png` and the round 2 faces (`face_winky.png`,
`face_star_eyes.png`...) — flat cartoon features with **thick, dark,
rounded outlines**, solid fills, at most one simple white highlight per eye,
pink blush ovals at most. **No** realistic or anime-style eyes, no thin
individual lashes, no gradients or skin-coloured shading (the head supplies the
skin), nothing near the image edges. Frame them like `face_happy.png` (the
features span the middle ~65% of the square) — the game scales every face the
same way, and they are seen small, from a few metres away.

**Round 1 review (done in game, 2026-10-24):** posters, logo and signs are
in and look right. Signs drawn on a flat background are now keyed out to
transparent and recentred by `python3 tools/clean_signs.py` (originals kept in
`assets/originals/signs/`), so a background around the board is fine in
future signs. Faces are now drawn larger on the head to suit how the art is
framed. Round 2 faces checked in game too: they match the style well.

## Delivered round 2: unlockable faces (4 images) — `assets/faces/`

Four new faces unlock from the hidden presents and replace their procedural
stand-ins. Delivered in the same format and style as the round 1 faces
(512 × 512, transparent, features only, no head outline or skin). The manifest
has been rebuilt, and all four were verified through the game's face-texture hook.

| File | Size | Expression |
| --- | --- | --- |
| `face_star_eyes.png` | 512 × 512 | Starstruck: big yellow five-point stars for eyes with a white sparkle, huge open delighted smile. |
| `face_winky.png` | 512 × 512 | Playful wink: one eye closed in a happy arc, the other big and round, a cheeky grin with one raised eyebrow. |
| `face_robot.png` | 512 × 512 | Toy robot: two glowing cyan square LED eyes, a flat rectangular grille mouth with little lines, a tiny antenna-free bolt on each cheek. |
| `face_moustache.png` | 512 × 512 | A big curly brown handlebar moustache under a round nose, friendly round eyes, small smile peeking out. |


Generated with the built-in image generation tool and saved at the paths and
dimensions below. The final prompts and source files are recorded in
`assets/generation.json`. The game manifest lists the 49 in-game images;
the six reference sheets remain outside the runtime manifest.

Everything already has a procedural stand-in, so these are upgrades, not
blockers. The hooks are built and were tested with placeholder images: drop a
file at its path, run `python3 tools/build_manifest.py` from `wobblers/`, and it
replaces the stand-in the next time the page loads. (The game only requests
files listed in `assets/manifest.json`, so missing art never causes errors.)

**Overall style** (for every in-game image): the bright, soft, toy-like look of
*Wobbly Life*. Rounded chunky shapes, saturated candy colours, clean flat
shading with a gentle highlight, thick soft outlines only where noted. Cheerful
and silly, never realistic. No company logos, no real brand names.

## Faces (9 images) — `assets/faces/`

Each is painted onto the front of a character's round, peach-skinned head
(skin `#ffd9b8`). **Only the features**: eyes, eyebrows, mouth, maybe blush
cheeks, on a **transparent background**. No head outline, no skin fill, no
hair, no hat. Front view, centred, features filling the middle ~70% of the
square (eyes around 40% from the top, mouth around 70%). Big, round, friendly
cartoon eyes with white highlights, in the *Wobbly Life* style.

| File | Size | Expression |
| --- | --- | --- |
| `face_happy.png` | 512 × 512 | Default: big round eyes looking forward, small closed happy smile, soft pink cheeks. |
| `face_joyful.png` | 512 × 512 | Eyes squeezed into happy upside-down arcs, wide open laughing mouth showing a little tongue. |
| `face_cool_shades.png` | 512 × 512 | Black rounded sunglasses with a white glint, confident lopsided smirk. |
| `face_sleepy.png` | 512 × 512 | Droopy half-closed eyelids, tiny relaxed smile, a small "z"-free drowsy look. |
| `face_surprised.png` | 512 × 512 | Huge wide eyes with tiny pupils, raised eyebrows, small round "o" mouth. |
| `face_cheeky.png` | 512 × 512 | One eye winking, the other open, tongue poking out of a grin. |
| `face_lashes.png` | 512 × 512 | Big sparkly eyes with long curled eyelashes, sweet smile, rosy cheeks. |
| `face_grumpy.png` | 512 × 512 | Frowning angled eyebrows, half-lidded eyes, wobbly frown. |
| `face_ko.png` | 512 × 512 | Knocked out: two cartoon "X" eyes or dizzy spiral eyes, wobbly open mouth. Shown when a player is knocked out. |

## Signs (29 images) — `assets/signs/`

Shop and attraction signboards. Each fills its whole image edge to edge (the
image *is* the board, 4:1), **with the exact words shown below spelled
correctly**, big chunky rounded lettering that is readable from far away, plus
one small fun icon. Opaque background in the listed colour (rounded corners
are fine, with transparent corners).

| File | Size | Words | Board colour + icon |
| --- | --- | --- | --- |
| `burgers.png` | 1024 × 256 | BURGERS | red-orange `#ff5a3c`, a stacked burger |
| `pizza.png` | 1024 × 256 | PIZZA | golden `#e8a12a`, a pizza slice |
| `ice_cream.png` | 1024 × 256 | ICE CREAM | pink `#ff7fc8`, a swirl cone |
| `toys.png` | 1024 × 256 | TOYS | blue `#3f8cff`, a teddy bear |
| `cafe.png` | 1024 × 256 | CAFE | coffee brown `#8a5a3a`, a steaming cup |
| `bank.png` | 1024 × 256 | BANK | green `#2a8a5a`, a piggy bank |
| `gym.png` | 1024 × 256 | GYM | slate `#444a6a`, a dumbbell |
| `market.png` | 1024 × 256 | MARKET | leaf green `#4fae45`, a basket of fruit |
| `bakery.png` | 1024 × 256 | BAKERY | warm orange `#d9824a`, a loaf and croissant |
| `arcade.png` | 1024 × 256 | ARCADE | purple `#b46cff`, a joystick, neon glow edges |
| `donuts.png` | 1024 × 256 | DONUTS | hot pink `#ff6fae`, a sprinkled donut |
| `post.png` | 1024 × 256 | POST | red `#d9534f`, an envelope |
| `town_hall.png` | 1024 × 256 | TOWN HALL | royal blue `#2a62c9`, a little clock |
| `playground.png` | 1024 × 256 | PLAYGROUND | orange `#ff7f3d`, a slide |
| `swimming_pool.png` | 1024 × 256 | SWIMMING POOL | aqua `#2a9ad9`, a rubber ring |
| `fun_park.png` | 1024 × 256 | FUN PARK | pink `#ff5a8a`, a ferris wheel, light bulbs around the edge |
| `bumper_cars.png` | 1024 × 256 | BUMPER CARS | blue `#3f8cff`, a bumper car |
| `loopy_coaster.png` | 1024 × 256 | LOOPY COASTER | purple `#b46cff`, a coaster loop |
| `stunt_park.png` | 1024 × 256 | STUNT PARK | orange `#ff8a3d`, a ramp with a flying car |
| `kart_racing.png` | 1024 × 256 | KART RACING | red `#ff3a3a`, a chequered flag |
| `surf_shack.png` | 1024 × 256 | SURF SHACK | sky blue `#3f8cff`, a surfboard |
| `zip_line.png` | 1024 × 256 | ZIP LINE | as you like, a pulley on a cable |
| `can_toss.png` | 1024 × 256 | CAN TOSS | carnival red and white stripes, a pyramid of cans |
| `bowling.png` | 1024 × 256 | BOWLING | as you like, a pin and ball |
| `hot_dogs.png` | 1024 × 256 | HOT DOGS | red-orange `#ff5a3c`, a hot dog |
| `candy.png` | 1024 × 256 | CANDY | pink `#ff7fc8`, candy floss |
| `drinks.png` | 1024 × 256 | DRINKS | blue `#3f8cff`, a soda cup with straw |
| `prizes.png` | 1024 × 256 | PRIZES | purple `#b46cff`, a star |
| `tickets.png` | 1024 × 256 | TICKETS | green `#55a84a`, a ticket stub |

The small POLICE and TOWN LOOP labels on vehicles stay procedural.

## Posters and paintings (6 images) — `assets/posters/`

Framed pictures on interior walls (the game draws the frame). Fill the whole
image, opaque, portrait unless noted. Characters in them are the game's
wobbly bean people: round head, round body, stubby arms and legs, mitten hands.

| File | Size | Where | Prompt |
| --- | --- | --- | --- |
| `cafe_coffee.png` | 512 × 716 | Cafe wall | A retro cafe advert: a giant steaming mug of coffee with a happy face, a wobbly bean person hugging it, the words "COFFEE" at the top. Warm browns and cream. |
| `cafe_cake.png` | 512 × 716 | Cafe wall | A cheerful bakery poster: a tall pink layer cake with a cherry on top and sprinkles, the word "CAKE!" at the top. Pinks and cream. |
| `arcade_space.png` | 512 × 716 | Arcade wall | An 80s arcade game poster for "SPACE BLOBBERS": a bean person in a bubble space helmet flying a tiny rocket past planets, neon pink and cyan on deep purple. |
| `arcade_racer.png` | 512 × 716 | Arcade wall | An arcade racing poster for "TURBO WOBBLE KART": a bean person drifting a go-kart, motion lines, chequered flag, orange and purple. |
| `painting_island.png` | 768 × 528 (landscape) | House living room | A cosy painted landscape of a sunny toy-like island: green hills, a little town, a ferris wheel and a lighthouse by a blue sea. Soft storybook painting. |
| `portrait_family.png` | 512 × 666 | House bedroom | A silly family portrait: three wobbly bean people (two adults and a small one) posing proudly, one wearing a top hat, in front of a plain warm background. |

## Title logo (1 image) — `assets/ui/`

| File | Size | Prompt |
| --- | --- | --- |
| `logo.png` | 1600 × 500, transparent | The word **WOBBLERS** as a big bubbly 3D cartoon game logo: chunky rounded letters in yellow, pink and green, thick dark-blue outline, glossy highlights, letters slightly tilted and bouncing at different heights as if wobbling. No other text. Replaces the CSS logo on the title screen. |

## Reference art (6 images) — `assets/reference/`

Not loaded by the game; they guide future modelling so new characters,
vehicles and buildings stay on-style. Any 16:9 size around 1920 × 1080.

| File | Prompt |
| --- | --- |
| `ref_character_sheet.png` | Character turnaround sheet in the *Wobbly Life* style: one bean-shaped wobbly person shown front, side, back and three-quarter, plus a row of poses (running with arms flailing, jumping, ragdolled flat on the ground, carrying a box over their head, driving). Round head merged softly into a pear-shaped body, stubby limbs, mitten hands, chunky shoes. Plain light background. |
| `ref_outfits.png` | A lineup of eight of those characters in different outfits and hats (cap, top hat, beanie, crown, party hat, cowboy hat, bucket hat, none), different shirt and trouser colours. |
| `ref_vehicles.png` | A sheet of toy-like rounded vehicles in the same style: family car, pickup, ice-cream van, city bus, police car, fire truck, tractor, go-kart, quad bike, scooter, speedboat, helicopter. Side views plus one three-quarter view each, chunky wheels, glossy candy colours. |
| `ref_town.png` | A colourful toy-town street concept: shops with striped awnings and big signs, a town hall with a clock tower, a plaza with a fountain, lamp posts, rounded trees, wobbly people walking about. Three-quarter elevated view. |
| `ref_funpark.png` | A cartoon amusement park concept: ferris wheel, carousel, roller coaster with a loop, swing ride, drop tower, bouncy castle, food stalls with bunting. Bright and busy. |
| `ref_island_map.png` | A top-down illustrated map of the island: town in the middle with a grid of roads and a ring road, playground NE, swimming pool SE, stunt park SW, sports field NW, fun park far west, kart track far east, snowy mountain and a lake to the north, beach with a pier and lighthouse to the south. Labels optional. |
