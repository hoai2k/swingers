# Wobblers image requests

**Status: round 7 open (32 signs).** Rounds 1–6 are delivered and integrated;
see `image-requests-history.md` for those requests and their review notes.

## How delivery works

Every image has a procedural stand-in, so requests are upgrades, not blockers.
Save each file at its path under `wobblers/assets/`, then from `wobblers/` run
`python3 tools/clean_signs.py` (only if signs were added) and
`python3 tools/build_manifest.py`. The game loads only files listed in
`assets/manifest.json`, so missing art never causes errors. Reference sheets go
in `assets/reference/` and are never loaded by the game. Record prompts in
`assets/generation.json`, and when a round is delivered move it from this file
to the top of `image-requests-history.md`.

## Style and formats (apply to every round)

- **Overall style:** the bright, soft, toy-like look of *Wobbly Life*: rounded
  chunky shapes, saturated candy colours, clean flat shading with a gentle
  highlight. Cheerful and silly, never realistic. No company logos or real
  brand names. Characters are the game's wobbly bean people (round head, pear
  body, stubby limbs, mitten hands) — see `assets/reference/ref_character_sheet.png`.
- **Signs** (`assets/signs/<words>.png`, 1024 × 256): the exact words, spelled
  correctly, in big chunky rounded letters plus one small icon. A plain
  background around the board is fine (`clean_signs.py` keys it out). The file
  name is the words in lower case with spaces as underscores
  (`HOT DOGS` → `hot_dogs.png`); the game finds it from the sign's text.
- **Faces** (`assets/faces/face_<name>.png`, 512 × 512, transparent): features
  only (eyes, brows, mouth, maybe blush), no head outline or skin. Flat cartoon
  features with thick, dark, rounded outlines and solid fills, like
  `face_happy.png` and `face_winky.png`; no realistic or anime eyes, no thin
  lashes, no gradients. The game crops to the features and scales them, so
  framing doesn't need to match exactly.
- **Posters / paintings** (`assets/posters/<name>.png`): opaque, filling the
  frame, at the exact size given in the request (the game stretches to the
  frame's proportions).
- **Reference sheets** (`assets/reference/`): any 16:9 around 1920 × 1080.

## For agents adding requests

Add requests **as early as possible**: as soon as you know the exact sign words,
face names or poster names your feature uses (even before the feature is
finished), write them here under a new `## OPEN round N` heading and commit and
push that change right away on its own, so the art can be generated while you
keep building. Use the formats above, give every file an exact path, size and
prompt, and keep the procedural stand-in in the game until the art arrives.

## OPEN round 7 — region signs: Bigtown, Frostpeak, Dusty Dunes (32 signs)

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
