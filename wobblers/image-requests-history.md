# Wobblers image requests — history

Delivered and reviewed requests, newest first, kept for their prompts, sizes and
review notes. Open requests live in `image-requests.md`; final prompts and source
files are recorded in `assets/generation.json`.

## Delivered round 16 — animal model turnarounds

Delivered in batches with built-in imagegen. All sheets are opaque 1920 × 1080,
checked for anatomy, views, decoding and exclusion from the runtime manifest.
Exact prompts and source paths are recorded in `assets/generation.json`.

The game now has sea creatures and jungle animals (`src/world/sealife.js`,
`src/world/regions/jungle/animals.js`) modelled in code. These renders are what the models are
rebuilt to match, so they need to show clear, simple 3D shapes from known angles.

**Owner's art direction (2026-10-27):** use a midpoint between baby-toy animals and
realistic wildlife renders. These are rounded, expressive **stylized game animals** with
recognisable adult anatomy, longer bodies and modestly enlarged heads/eyes. Keep broad
painted markings, clean smooth sculpted forms and simplified materials; no realistic fur,
tiny scales, wrinkles or skin grain. Avoid chibi proportions, blush and human baby-toy grins.
Sharks, crocodiles and big cats should retain some danger through posture, focused eyes,
teeth, claws and their species silhouettes. Keep the tone light-hearted rather than gory.
Plain light grey background, soft studio lighting, no text or ground clutter.

**Layout for every image (1920 × 1080):** the same animal three times, side by side, all at the
same scale: left = exact side view (facing right), middle = exact top view (head toward the
right), right = three-quarter front view. Whole animal in frame in every view.

Files (all in `assets/reference/animals/`), with the animal to draw:

| file | animal |
|---|---|
| `shark.png` | a streamlined adult shark with visible teeth and a predatory silhouette |
| `dolphin.png` | a bottlenose dolphin |
| `whale.png` | a humpback whale with long white flippers |
| `reef_fish.png` | four small fish in one image: clownfish, blue tang, yellow tang, angelfish (each in the 3 views, one row per fish) |
| `pufferfish.png` | a pufferfish, puffed up |
| `plesiosaur.png` | a friendly long-necked plesiosaur |
| `monkey.png` | a monkey walking on all fours, long curly tail |
| `tiger.png` | a tiger walking |
| `leopard.png` | a leopard walking |
| `river_hog.png` | a red river hog (orange-red, black face, white ear tufts) |
| `jellyfish.png` | a jellyfish with a soft bell and wavy tentacles |
| `octopus.png` | an octopus with 8 curling tentacles |
| `sea_turtle.png` | a sea turtle |
| `manta_ray.png` | a manta ray |
| `sea_star_crab_seahorse.png` | a sea star, a crab and a seahorse (one row each) |

## Delivered round 15 — toy-style character repaints

Generated with built-in imagegen on 2026-10-27. Exact prompts and source paths are
in `assets/generation.json`. Checked dimensions, alpha, wording, subjects and
browser loading. Replaced files are preserved in `assets/originals/pre-round15/`.

The game's characters now default to the **toy style** (see *Characters* above and the
re-rendered `assets/reference/ref_character_sheet.png`). These delivered images still show
older looks: yellow faceless blobs (Wobbly Life style) or the peach-skinned look. Repaint
**only the characters** in toy style; keep each image's scene, composition, colours, layout
and **exact words** as they are now (edit the existing file; same path and size; posters stay
opaque, signs keep their board and a background `clean_signs.py` can key out). Suggested
skin / shirt pairs are given so the cast varies; any similar soft-skin + contrasting-shirt
pairing is fine.

| File (`assets/…`) | Size | Characters to repaint |
|---|---|---|
| `posters/arcade_racer.png` | 512 × 716 | the kart driver (TURBO WOBBLE KART): soft blue skin, yellow shirt, red helmet in the shirt colour family |
| `posters/arcade_space.png` | 512 × 716 | the astronaut riding the rocket (SPACE BLOBBERS): mint green skin, white-and-orange space suit, clear bubble helmet |
| `posters/cafe_cake.png` | 512 × 716 | the four little chefs round the cake (CAKE!): rose pink, soft blue, warm gold and lilac skin; white chef jackets and hats |
| `posters/cafe_coffee.png` | 512 × 716 | the barista hugging the cup (COFFEE): coral skin, green apron over a cream shirt |
| `posters/cars_sale.png` | 512 × 716 | the salesperson by the car and the helicopter pilot (BIG DEALS): teal and warm gold skin; red and blue shirts, shades kept |
| `posters/clothes_fashion.png` | 512 × 716 | the model in the sombrero, poncho and heart shades (NEW LOOKS): lilac skin, the striped poncho as the top layer |
| `posters/homes_cottage.png` | 768 × 528 | the waving person by the FOR SALE sign: soft blue skin, purple shirt, straw hat |
| `posters/painting_island.png` | 768 × 528 | everyone on the island painting (the people on the hilltop and in town): varied soft skins, contrasting shirts |
| `posters/portrait_family.png` | 512 × 666 | the family of three (top hat, bow, child): warm gold, rose pink and soft blue skin; yellow, pink and blue shirts kept |
| `posters/wanted_kid.png` | 512 × 716 | CACTUS KID hugging the cactus: mint green skin, green shirt, brown cowboy hat |
| `posters/wanted_pete.png` | 512 × 716 | WOBBLY PETE the outlaw: coral skin, orange shirt, red bandana, black hat |
| `ui/cover.png` | 1600 × 900 | all five Wobblers on the cover (jumping, bouncy ball, carrying a box, waving from the car): varied soft skins (blue, coral, mint, gold, pink) with contrasting shirts; still no text, calm sky at the top |
| `signs/jump.png` | 1024 × 256 | the little diving figure on the right of JUMP: soft blue skin, red-and-white swimsuit |
| `signs/ski_jump.png` | 1024 × 256 | the skier on the right of SKI JUMP: coral skin, red ski jacket and helmet, goggles |
| `signs/wobblecorp.png` | 1024 × 256 | the round mascot face on the left of WOBBLECORP: a toy-style Wobbler head (teal skin, printed smile, pink cheeks) instead of the yellow blob |

## Delivered round 14 — factory and farm signs

Generated with built-in imagegen on 2026-10-27. Exact prompts and source paths are
in `assets/generation.json`. Checked dimensions, alpha, wording, subjects and
browser loading. Replaced files are preserved in `assets/originals/pre-round15/`.
- `signs/wobble_works.png` (1024 × 256) — **WOBBLE WORKS**: the toy factory's big gate sign:
  industrial steel-grey board with yellow-and-black hazard stripes along the edges, chunky
  bright orange letters, a small cog-wheel icon.
- `signs/loading_bay.png` (1024 × 256) — **LOADING BAY**: over the factory's truck dock: dark
  navy board, white stencil-style rounded letters, a small forklift icon.
- `signs/pooh_berry_farm.png` (1024 × 256) — **POOH BERRY FARM**: the farm's entrance arch sign: warm
  wooden board, barn-red letters with a cream outline, a small smiling sunflower icon.
- `signs/corn_maze.png` (1024 × 256) — **CORN MAZE**: at the maze entrance: straw-yellow board,
  deep green letters, a small corn-cob icon.

## Delivered round 13 — painted blink frames

Delivered in batches with built-in imagegen on 2026-10-26. Exact prompts, source
paths and dimensions are in `assets/generation.json`. Checked dimensions, alpha and browser loading.

Characters blink every few seconds. Until these arrive the game makes each blink frame by
wiping the painted eyes and drawing a simple lid curve; a hand-painted frame looks better.
Each file is the **same face with the eyes closed**: identical canvas (512 × 512,
transparent), identical framing and positions for everything else (brows, mouth, blush,
nose, glasses, moustache) so nothing jumps when it swaps in — start from the open file and
only repaint the eyes. Closed eyes: a soft, relaxed downward-curved lid line in the same dark
outline colour and thickness as the face's other lines, about as wide as the open eye, with
any lashes kept on the lid (`lashes`). The game finds them by name
(`faces/face_<name>_closed.png`) and uses them automatically.

| File (`assets/faces/…`) | Open face it matches |
|---|---|
| `face_happy_closed.png` | `face_happy.png` — glossy round eyes, small smile, blush |
| `face_surprised_closed.png` | `face_surprised.png` — tall oval eyes, raised brows, small "o" mouth (keep the brows raised) |
| `face_lashes_closed.png` | `face_lashes.png` — round eyes with lashes (closed lids keep their lashes) |
| `face_grumpy_closed.png` | `face_grumpy.png` — half-lidded eyes under angry brows (keep the brows) |
| `face_star_eyes_closed.png` | `face_star_eyes.png` — star eyes, big open smile (closed: happy curved lids, the smile stays) |
| `face_moustache_closed.png` | `face_moustache.png` — glossy eyes over a moustache and nose |
| `face_tongue_out_closed.png` | `face_tongue_out.png` — big round eyes, brows, tongue out |
| `face_nerd_closed.png` | `face_nerd.png` — dot eyes behind round glasses (the glasses stay, eyes closed behind them) |

## Delivered round 12 — character artwork corrections and cover

Delivered in batches with built-in imagegen on 2026-10-26. Exact prompts, source
paths and dimensions are in `assets/generation.json`. Replaced artwork is preserved
in `assets/originals/pre-round12/`. Checked dimensions, alpha and browser loading.

| File (`assets/…`) | Size | Brief |
|---|---|---|
| `posters/painting_island.png` | 768 × 528 | A cosy, bright toy-like storybook painting of a sunny island seen from a grassy hilltop with a wooden fence: green hills, a little colourful town with a fountain plaza, a ferris wheel, a red-and-white lighthouse on cliffs, a suspension bridge, piers and boats on a turquoise sea, snowy mountains far off. In the foreground two Wobblers seen from behind and the side, waving at the view: one in a red shirt and red cap with a blue backpack, one in a blue shirt with a straw sun hat, with a small puppy; both with peach-skinned round heads, darker trousers, white mitten hands and dark shoes (see the character sheet). |
| `posters/portrait_family.png` | 512 × 666 | A framed, warm family portrait painting of three Wobblers hugging and waving against a sunny orange backdrop: a tall one in a yellow shirt with a black top hat and red bow tie, one in a pink shirt with a purple bow on the head, a small one in a blue shirt; peach-skinned round heads with happy printed cartoon faces, darker trousers, white mitten hands. |
| `posters/wanted_kid.png` | 512 × 716 | Old west WANTED poster on aged paper with torn edges: the words **WANTED** at the top and **CACTUS KID** / **REWARD 50 COINS** below; in the picture a cheeky Wobbler in a green shirt with a brown cowboy hat and red neckerchief, winking and hugging a cactus in a desert town. Peach-skinned round head with a printed cartoon face, white mitten hands, dark shoes. |
| `posters/wanted_pete.png` | 512 × 716 | Matching WANTED poster: **WANTED** at the top, **WOBBLY PETE** / **REWARD 100 COINS** below; a Wobbler outlaw in an orange shirt and black cowboy hat with a red bandana over the lower face, holding a toy water pistol, in a desert town. Peach-skinned round head with printed cartoon eyes, white mitten hands, dark shoes. |
| `posters/clothes_fashion.png` | 512 × 716 | Bright fashion-shop poster with the words **NEW LOOKS** in big bubbly letters at the top; a Wobbler in a teal shirt striking a happy pose in a colourful sombrero and striped poncho with heart sunglasses, on a sunny plaza. Peach-skinned round head, darker trousers, white mitten hands. |
| `posters/homes_cottage.png` | 768 × 528 | Estate-agent sign poster: a red **FOR SALE** board in front of a cosy cream cottage with a red roof, garden flowers and a white picket fence by the sea; a Wobbler in a purple shirt with a straw hat waving in front. Peach-skinned round head with a printed smiling face, darker trousers, white mitten hands. |
| `ui/cover.png` | 1600 × 900 | NEW. Key art / cover for Wobblers (game libraries and share images): a sunny toy-like island town street with a ferris wheel and the sea behind; in front, five Wobblers in different shirt colours (red, blue, green, yellow, pink) having fun — one mid-jump, one riding a bouncy ball, two carrying a box together, one waving from a little red car. Peach-skinned round heads with printed cartoon faces, darker trousers, white mitten hands, dark shoes, a couple of hats. Leave the top fifth calm sky for a logo; no text. |

## Delivered round 11 — Stratford Fall Fair, arcade cabinets, gadgets, phone booths (22 signs)

The game draws a procedural stand-in for each until the art arrives. The fair is
an autumn county fair (falling leaves, pumpkins, hay bales), so its signs lean on
warm fall colours; arcade marquees are glowing neon on black. No real brand or
game names, logos or characters.

- `signs/stratford_fall_fair.png` (1024 × 256) — **STRATFORD FALL FAIR**: the fairground's big entrance arch sign: warm autumn palette (pumpkin orange, maple red, golden yellow) with a cream border, a small maple-leaf icon; extra festive, like a county fair banner.
- `signs/pirate_ship.png` (1024 × 256) — **PIRATE SHIP**: swinging pirate-ship ride: deep red board, gold letters, small skull-and-crossbones flag icon.
- `signs/viking_ship.png` (1024 × 256) — **VIKING SHIP**: swinging Viking longship ride: dark wood-brown board, ice-blue letters, small horned-helmet icon.
- `signs/ring_of_fire.png` (1024 × 256) — **RING OF FIRE**: looping ring coaster: black board, flaming orange-red letters, small flame-ring icon.
- `signs/gravitron.png` (1024 × 256) — **GRAVITRON**: spinning saucer ride: chrome-silver board, electric purple letters, small flying-saucer icon.
- `signs/starship_2000.png` (1024 × 256) — **STARSHIP 2000**: retro space-age spinning ride: navy board, neon cyan letters, small rocket icon.
- `signs/zipper.png` (1024 × 256) — **ZIPPER**: flipping-cage ride: zig-zag yellow and black board, small lightning-bolt icon.
- `signs/top_spin.png` (1024 × 256) — **TOP SPIN**: flipping gondola ride: hot pink board, white letters, small curly-arrow icon.
- `signs/drop_tower.png` (1024 × 256) — **DROP TOWER**: free-fall tower ride: sky-blue board, bold red letters, small down-arrow icon.
- `signs/tilt-a-whirl.png` (1024 × 256) — **TILT-A-WHIRL**: spinning tub ride: candy-striped red and white board, small swirl icon.
- `signs/himalaya.png` (1024 × 256) — **HIMALAYA**: fast music-ride on hills: snowy white board with mountain silhouette, icy-blue letters, small snowflake icon.
- `signs/sizzler.png` (1024 × 256) — **SIZZLER**: spinning-arm ride: orange board, yellow letters with a sizzle outline, small sun icon.
- `signs/ferris_wheel.png` (1024 × 256) — **FERRIS WHEEL**: big wheel: warm gold board, maroon letters, small wheel icon (autumn-fair version).
- `signs/carousel.png` (1024 × 256) — **CAROUSEL**: classic carousel: cream board with gold scroll trim, red letters, small carousel-horse icon.
- `signs/mini_train.png` (1024 × 256) — **MINI TRAIN**: kiddie train ride: green board, yellow letters, small steam-engine icon.
- `signs/magic_tent.png` (1024 × 256) — **MAGIC TENT**: fortune-teller style tent where players change shape: deep purple board with gold stars, glowing gold letters, small crystal-ball icon.
- `signs/gadgets.png` (1024 × 256) — **GADGETS**: gadget shop (jetpacks, boots, laser gun): teal board, white letters, small jetpack icon.
- `signs/phone.png` (1024 × 256) — **PHONE**: phone booth where players fetch their vehicles: red board, white letters, small old-style telephone icon.
- `signs/chomp_maze.png` (1024 × 256) — **CHOMP MAZE**: arcade cabinet marquee for a maze-chomping game: black board, glowing yellow letters, small round-chomper icon (original character, not any real game's).
- `signs/space_raiders.png` (1024 × 256) — **SPACE RAIDERS**: arcade cabinet marquee for a shoot-the-aliens game: black board, glowing green letters, small pixel-alien icon (original design).
- `signs/bug_blaster.png` (1024 × 256) — **BUG BLASTER**: arcade cabinet marquee for a shoot-the-bugs game: black board, glowing magenta letters, small cartoon-bug icon (original design).
- `signs/paddle_ball.png` (1024 × 256) — **PADDLE BALL**: arcade cabinet marquee for a two-player paddle game: black board, glowing white letters, small paddle-and-ball icon.

Delivered with built-in imagegen, 2026-10-25. Exact dimensions, alpha, lettering and icons reviewed; loaded through the game manifest in the browser. Prompts and original sources are in `assets/generation.json`.

TILT-A-WHIRL is also saved as `signs/tilt_a_whirl.png`, matching the game sign loader; the requested hyphenated filename is preserved.

## Delivered round 10 — jobs / missions (1 sign, 1 poster, 1 UI marker)

The game draws a procedural stand-in for each until the art arrives.

- `signs/jobs.png` (1024 × 256) — **JOBS**: bright job-board header, sunny yellow board with a chunky white rounded border, big dark-blue rounded letters, small clipboard-with-tick icon (on the job board on every island).
- `posters/job_board.png` (716 × 512, landscape, opaque) — a cork notice board crammed with cheerful pinned job notes and doodles (a pizza slice, a fire truck, a sheep, a taxi, a snowflake, a cactus, a palm tree), coloured push-pins, a few coins drawn on the notes; toy-like, no readable small text except the word **JOBS** at the top. Hangs under the JOBS sign.
- `ui/job_marker.png` (256 × 256, transparent) — floating quest marker: a big chunky yellow-orange exclamation mark "!" with a thick dark-blue rounded outline inside a soft white round badge, glossy toy look, centred with a little margin. Floats over job-giver NPCs and job boards.

Delivered 2026-10-25 with built-in imagegen. Exact dimensions, transparency, text and subjects were reviewed, and runtime loading was checked in the browser. Prompts and sources are in `assets/generation.json`.

## Delivered round 9 — Dusty Dunes and Frostpeak extras (3 signs, 2 posters)

The game draws a procedural stand-in for each until the art arrives.

### Signs (`assets/signs/`, 1024 × 256, exact words)

- `dustville_hotel.png` — **DUSTVILLE HOTEL**: Wild-West hotel false-front board, weathered teal-blue wood planks, cream western-style letters, small bed or key icon.
- `dustville.png` — **DUSTVILLE**: town-entrance arch board over the main street, sun-bleached brown planks hung on ropes, cream western letters, small cactus-and-sun icon.
- `ski_lodge.png` — **SKI LODGE** (Frostpeak): ski-lodge chalet board, dark red with a snowy top edge, chunky cream rounded letters, small crossed-skis icon.

### Posters (`assets/posters/`, 512 × 716, opaque, filling the frame; in the sheriff's office)

- `wanted_pete.png` — old-west WANTED poster on aged parchment: big **WANTED** at the top, a goofy wobbly bean-person outlaw with a black hat and red bandana in the middle, **WOBBLY PETE** underneath, and "REWARD 100 COINS". Toy-like and silly, not scary.
- `wanted_kid.png` — same parchment WANTED layout: big **WANTED**, a cheeky little bean-person cowboy hugging a cactus, **CACTUS KID** underneath, and "REWARD 50 COINS".

Delivered 2026-10-25 with built-in imagegen. Exact dimensions, transparency, text and subjects were reviewed, and runtime loading was checked in the browser. Prompts and sources are in `assets/generation.json`.

## Delivered round 8 — region signs: Tiki Jungle, Coconut Cove (14 signs)

All `assets/signs/<file>`, 1024 × 256, the exact words in big chunky rounded
letters plus one small icon (style rules above). The game draws a procedural
stand-in for each until the art arrives.

### Tiki Jungle (jungle)

- `volcano_trail.png` — **VOLCANO TRAIL**: rough bamboo-framed wooden board, cream letters, small smoking volcano icon.
- `raft_ride.png` — **RAFT RIDE**: lashed log-raft board, white letters, small paddle-and-splash icon.
- `temple_ruins.png` — **TEMPLE RUINS**: mossy grey carved-stone tablet, yellow-gold letters, small stepped pyramid icon.
- `hot_lava.png` — **HOT LAVA**: orange-red warning board with black hazard stripes on the edges, white letters, small flame icon.
- `jungle_tours.png` — **JUNGLE TOURS**: olive-green safari board, cream letters, small green jeep icon.
- `waterfall.png` — **WATERFALL**: teal-blue wooden board with vines on the corners, white letters, small waterfall icon.

### Coconut Cove (tropical)

- `coconut_resort.png` — **COCONUT RESORT**: sunny turquoise board with a thatched-straw top edge, white letters, small palm-tree-and-coconut icon.
- `pool_bar.png` — **POOL BAR**: bamboo-framed pink board, white letters, small coconut cocktail with umbrella icon.
- `boat_hire.png` — **BOAT HIRE**: white board with navy rope border, navy letters, small speedboat icon.
- `lighthouse.png` — **LIGHTHOUSE**: red-and-white striped board, white letters on a red band, small lighthouse icon.
- `volleyball.png` — **VOLLEYBALL**: sandy-yellow board, blue letters, small volleyball icon.
- `snorkel_reef.png` — **SNORKEL REEF**: aqua board with little bubbles, white letters, small snorkel mask and fish icon.
- `shipwreck.png` — **SHIPWRECK**: weathered dark driftwood planks, bone-white pirate-style letters, small skull-and-crossbones icon.
- `lifeguard.png` — **LIFEGUARD**: bright red board, white letters, small red-and-white life-ring icon.

Delivered 2026-10-24 with built-in imagegen. Exact sizes, alpha, sign text and browser asset loading checked; prompts and sources are in `assets/generation.json`.

## Delivered round 7 — region signs: Bigtown, Frostpeak, Dusty Dunes (36 signs)

All `assets/signs/<file>`, 1024 × 256, the exact words in big chunky rounded
letters plus one small icon (style rules above). The game draws a procedural
stand-in for each until the art arrives.

### Bigtown (city)

- `bigtown_tower.png` — **BIGTOWN TOWER**: sky-blue glass board, white letters, tiny skyscraper icon.
- `stadium.png` — **STADIUM**: green board, white letters, football icon.
- `parking.png` — **PARKING**: blue board, big white letters, white "P" roundel icon.
- `cinema.png` — **CINEMA**: red marquee board with light bulbs round the edge, yellow letters, film-reel icon.
- `diner.png` — **DINER**: retro turquoise/teal and cream-pink roadside diner board with a chrome edge, red rounded letters, small burger-and-milkshake icon (used in Bigtown and Dusty Dunes).
- `hotel.png` — **HOTEL**: deep purple board, gold letters, little bell icon.
- `books.png` — **BOOKS**: warm brown board, cream letters, open-book icon.
- `flowers.png` — **FLOWERS**: pastel pink board, white letters, tulip icon.
- `news.png` — **NEWS**: white board, black letters, rolled newspaper icon.
- `city_park.png` — **CITY PARK**: leafy green board, white letters, round tree icon.
- `harbour.png` — **HARBOUR**: navy board, white letters, anchor icon.
- `wobble_cola.png` — **WOBBLE COLA**: billboard, red board, white swirly letters, fizzy cola bottle icon (invented brand).
- `bouncy_beans.png` — **BOUNCY BEANS**: billboard, yellow board, orange bubbly letters, smiling jelly bean icon.
- `taxi.png` — **TAXI**: yellow board with a black-and-white checker strip, black letters.
- `delivery.png` — **DELIVERY**: orange board, white letters, cardboard box icon.
- `building_site.png` — **BUILDING SITE**: yellow-and-black hazard-striped board, black letters, hard-hat icon.
- `elevator.png` — **ELEVATOR**: steel-grey board, white letters, up/down arrows icon.
- `market_street.png` — **MARKET STREET**: gateway arch banner, orange board, white letters, shopping basket icon.
- `city_bus.png` — **CITY BUS**: dark board, amber LED-style letters (bus destination display), small bus icon.

- `jump.png` — **JUMP**: bright red board, white letters, small diving-bean icon (the jump-off plank on top of Bigtown Tower).
- `wobblecorp.png` — **WOBBLECORP**: teal glass-office board, white letters, little wobbly-bean logo icon (invented company).
- `police.png` — **POLICE**: navy board, white letters, gold star badge icon (also shown on the sides of the police car).
- `play_me.png` — **PLAY ME**: pink board, white letters, piano-keys icon (street piano).

### Frostpeak (snow)

- `ski_lift.png` — **SKI LIFT**: bright red board with snow on top, white letters, chairlift-chair icon.
- `hot_cocoa.png` — **HOT COCOA**: cosy wooden-plank board, cream letters, steaming mug with marshmallows.
- `ice_cave.png` — **ICE CAVE**: icy pale-blue board with icicles hanging off the bottom edge, white letters, ice-crystal icon.
- `ski_jump.png` — **SKI JUMP**: bright blue board, white letters, skier flying off a ramp.
- `observatory.png` — **OBSERVATORY**: dark navy board with tiny stars, pale yellow letters, domed-telescope icon.
- `skating.png` — **SKATING**: light-blue board with frosty edges, white letters, ice-skate icon.
- `sled_hire.png` — **SLED HIRE**: red-and-white striped wooden board, white letters, red sled icon.
- `tackle_shop.png` — **TACKLE SHOP**: weathered blue-green harbour board, white letters, fish-on-a-hook icon.

### Dusty Dunes (desert)

- `sheriff.png` — **SHERIFF**: weathered brown wood planks, cream western-style letters, small gold star.
- `general_store.png` — **GENERAL STORE**: faded red-painted wood, cream western letters, barrel or sack icon.
- `gas.png` — **GAS**: red roadside board, white rounded letters, fuel-pump icon.
- `gold_mine.png` — **GOLD MINE**: rough nailed timber planks, yellow-gold letters, pickaxe icon.
- `dig_site.png` — **DIG SITE**: sandy-beige wooden board with rope edging, dark brown letters, dinosaur-bone icon.

Delivered 2026-10-24 with built-in imagegen. Exact sizes, alpha, sign text and browser asset loading checked; prompts and sources are in `assets/generation.json`.

## Delivered round 6 — ferry nameplates and saloon (4 signs)

The game draws a procedural stand-in for each until the art arrives.

### Signs (`assets/signs/`, 1024 × 256, exact words)

- `island_hopper.png` — **ISLAND HOPPER**: ferry hull nameplate (red-trimmed ferry): white board, navy rounded letters, small anchor.
- `frostpeak_ferry.png` — **FROSTPEAK FERRY**: same nameplate style (blue-trimmed ferry), small snowflake.
- `desert_ferry.png` — **DESERT FERRY**: same nameplate style (yellow-trimmed ferry), small cactus.
- `saloon.png` — **SALOON**: Dusty Dunes saloon front: weathered wood-plank board, cream western-style letters.

Delivered 2026-10-24 with built-in imagegen; exact dimensions, transparency and game loader verified. Prompts and sources are in `assets/generation.json`.

## Delivered round 5 — shops, homes and pets (12 images)

All twelve images were delivered at their requested sizes and verified through the game asset loader.

### Signs (`assets/signs/`, 1024 × 256, exact words)

- `clothes.png` — **CLOTHES**: chunky rounded letters on a pink board, small coat-hanger and T-shirt icon.
- `pet_shop.png` — **PET SHOP**: rounded letters on a sky-blue board, small paw-print icon.
- `homes.png` — **HOMES**: rounded letters on a green board, small house-and-key icon (the estate agent).
- `car_dealer.png` — **CAR DEALER**: rounded letters on an orange board, small toy-car icon.

### Faces (`assets/faces/`, 512 × 512, transparent, features only — new clothes-shop faces)

- `face_heart_eyes.png` — two big red heart-shaped eyes and a wide happy smile.
- `face_tongue_out.png` — round eyes, open grin with a pink tongue sticking out.
- `face_dizzy.png` — spiral swirl eyes and a wavy zig-zag mouth.
- `face_nerd.png` — small eyes behind big thick round glasses, buck-tooth grin.

### Posters (`assets/posters/`)

- `pets_adopt.png` (512 × 716) — pet-shop poster saying **ADOPT A PAL!**, a cute toy-like dog, cat, bunny and penguin together.
- `clothes_fashion.png` (512 × 716) — fashion poster saying **NEW LOOKS**, a wobbly bean person posing in a sombrero and heart sunglasses.
- `homes_cottage.png` (768 × 528) — estate-agent landscape picture of a cute pastel bungalow with a red roof and garden, a **FOR SALE** tag in one corner.
- `cars_sale.png` (512 × 716) — car-dealer poster saying **BIG DEALS**, a chunky toy sports car and a helicopter.

Delivered 2026-10-24 with built-in imagegen. Prompts are in `assets/generation.json`.

Summary: round 11 — 22 fair, arcade and shop signs;
round 10 — 3 mission images; round 9 — 5 regional extras;
round 8 — 14 region signs; round 7 — 36 region signs;
round 6 — 4 ferry/saloon signs;
round 5 — 12 images (4 signs + 4 faces + 4 posters);
round 4 — 16 images (6 region/ferry signs + 10 reference sheets);
round 3 — 3 replacement faces; round 2 — 4 unlockable faces; round 1 — 51 images
(45 in game + 6 reference sheets). All delivered and checked in game, 2026-10-24.

## Delivered round 4: new regions — signs and reference sheets (16 images)

All six signs and ten reference sheets are saved below. Sign originals are kept
in `assets/originals/signs/`, and cleaned 1024 × 256 copies are registered in
the game manifest. Exact prompts are recorded in `assets/generation.json`.

The world is growing into an archipelago around the home island: **Bigtown**
(a skyscraper city to the east, over a long bridge), **Frostpeak** (icy
mountains and a ski village to the north), **Dusty Dunes** (desert, canyon,
oasis and a Wild-West town to the west), **Tiki Jungle** (volcano jungle
island with a waterfall, temple ruins and a stilt village to the south-west)
and **Coconut Cove** (tropical beach islets with a resort and fishing harbour
to the south-east). Ferries sail between them.

### Signs (6 images) — `assets/signs/`, used in game

Same format as the round 1 signs: 1024 × 256, the exact words spelled
correctly in big chunky rounded letters, one small icon. A plain background
around the board is fine (`tools/clean_signs.py` keys it out).

| File | Words | Board look + icon |
| --- | --- | --- |
| `bigtown.png` | BIGTOWN | glossy city blue and silver, a little skyscraper skyline |
| `frostpeak.png` | FROSTPEAK | icy white-blue with snow on top of the board, a snowy peak |
| `dusty_dunes.png` | DUSTY DUNES | weathered wooden plank board, sandy orange letters, a cactus |
| `tiki_jungle.png` | TIKI JUNGLE | carved jungle wood with leaves and vines, a tiki mask |
| `coconut_cove.png` | COCONUT COVE | bright turquoise and sand, a palm tree with coconuts |
| `ferry.png` | FERRY | navy and white nautical, a little ferry boat and a life ring |

### Reference sheets (10 images) — `assets/reference/`, not loaded by the game

They guide the people building these regions so everything stays in the
toy-like *Wobbly Life* style of `ref_town.png` and `ref_character_sheet.png`.
Any 16:9 size around 1920 × 1080, no text needed.

| File | Prompt |
| --- | --- |
| `ref_region_city.png` | Bigtown concept: a toy-like cartoon downtown with chunky rounded skyscrapers in candy colours, rooftop helipad and water towers, a glass office tower, a construction crane, wide streets with yellow taxis and buses, a park with a pond, a long suspension bridge leading in over the sea. Three-quarter elevated view. |
| `ref_region_snow.png` | Frostpeak concept: big rounded icy mountains with snow caps, a cosy ski village of wooden chalets with snowy roofs, a chairlift going up the slope, a frozen lake used as an ice rink, pine trees, skiers and sledders, snowmobiles. |
| `ref_region_desert.png` | Dusty Dunes concept: golden sand dunes, red-rock mesas and a canyon, a palm oasis with a pool, a toy-like pyramid, and a little Wild-West town (saloon with swinging doors, sheriff's office, water tower, wooden boardwalks), dune buggies and jeeps, cacti and tumbleweeds. |
| `ref_region_jungle.png` | Tiki Jungle concept: a lush volcano island with a gentle smoking peak, a tall waterfall into a lagoon, mossy stone temple ruins with steps, hanging vines and rope bridges, a stilt-house village on the water's edge with tiki torches, a jungle jeep on a dirt track. |
| `ref_region_tropical.png` | Coconut Cove concept: small tropical islets with white sand, turquoise lagoons, palm trees, a colourful beach resort with cabanas and a pool bar, a fishing harbour with wooden jetties and little boats, jet skis and a sailboat. |
| `ref_npcs_city_snow.png` | A character lineup in the game's wobbly bean-person style (round head, pear body, stubby limbs, mitten hands): city folk — businessperson with briefcase, taxi driver with cap, construction worker with hard hat, police officer, chef; snow folk — skier with goggles and bobble hat, snowboarder, ski-lift operator, hot-cocoa vendor, mountain rescuer. |
| `ref_npcs_desert_jungle.png` | Same style lineup: desert folk — cowboy, sheriff with badge, prospector with pickaxe, desert explorer, camel herder; jungle folk — explorer with safari hat and binoculars, tiki villager with flower necklace, fisher, park ranger, adventurer with a backpack. |
| `ref_npcs_beach.png` | Same style lineup: beach folk — surfer with board, lifeguard, sunbather with sunglasses, fisher with rod, resort waiter with tray, sailor with captain's hat, ice-cream seller. |
| `ref_vehicles_regions.png` | A sheet of toy-like rounded vehicles for the new regions, side and three-quarter views: yellow taxi, city bus, delivery truck, snowmobile, snowcat groomer, dune buggy, desert jeep, jungle jeep with roll bar, jet ski, small sailboat, fishing boat, island ferry with an open passenger deck. |
| `ref_archipelago_map.png` | An illustrated top-down map of the whole archipelago: the green home island in the middle (town, fun park, lake, mountain), a city island to the east linked by a long bridge, a snowy mountain island to the north, a desert island to the west, a volcano jungle island to the south-west and a scatter of tropical islets to the south-east, with dotted ferry routes between them. Labels optional. |

## Delivered round 3: replace three faces (3 images) — `assets/faces/`

Replaced the three semi-realistic faces with bold, flat cartoon features,
thick dark outlines and solid fills at the same file names. All three are
transparent 512 × 512 images, framed within the middle ~65% of the square,
and verified through the game's face-texture hook. Final prompts and prior
generation records are preserved in `assets/generation.json`.

In-game review: on-style and readable. They were framed smaller than the
round 1 faces, so the game now crops every face to its visible features and
scales them to the same width — framing no longer needs to match between
images.

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
`assets/generation.json`. The game manifest lists the 55 in-game images;
the sixteen reference sheets remain outside the runtime manifest.

Everything already has a procedural stand-in, so these are upgrades, not
blockers. The hooks are built and were tested with placeholder images: drop a
file at its path, run `python3 tools/build_manifest.py` from `wobblers/`, and it
replaces the stand-in the next time the page loads. (The game only requests
files listed in `assets/manifest.json`, so missing art never causes errors.)

**Overall style** (for every in-game image): the bright, soft, toy-like look of
*Wobbly Life*. Rounded chunky shapes, saturated candy colours, clean flat
shading with a gentle highlight, thick soft outlines only where noted. Cheerful
and silly, never realistic. No company logos, no real brand names.

## Delivered round 1 (51 images)

### Faces (9 images) — `assets/faces/`

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

### Signs (29 images) — `assets/signs/`

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

### Posters and paintings (6 images) — `assets/posters/`

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

### Title logo (1 image) — `assets/ui/`

| File | Size | Prompt |
| --- | --- | --- |
| `logo.png` | 1600 × 500, transparent | The word **WOBBLERS** as a big bubbly 3D cartoon game logo: chunky rounded letters in yellow, pink and green, thick dark-blue outline, glossy highlights, letters slightly tilted and bouncing at different heights as if wobbling. No other text. Replaces the CSS logo on the title screen. |

### Reference art (6 images) — `assets/reference/`

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
