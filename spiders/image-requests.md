# Spider Swingers — image requests

**Status: all 14 hook-ready images delivered and listed in the manifest; no open requests.**
Title/lobby art and all 10 board backgrounds are delivered. Optional extras
below remain deferred. Exact prompts are recorded in `assets/generation.json`.
The final logo uses ice blue and pink/magenta, with no orange or spider character.

How to deliver: put the file in `spiders/assets/web/` and add its filename
to the `images` list in `spiders/assets/web/manifest.json`. Unlisted files
are never requested (no 404s); listed files go through the boot loading bar.
Backgrounds are drawn ~38 % darker so the action reads on top: keep the
middle of the arena calm and low-contrast, put detail at the edges and in
the distance, and avoid hard horizontal lines where terrain sits.

Style for everything: the glossy, bold-outlined painterly cartoon look of
the Swingers / Rounders art. No text, no characters unless stated.

## 1. Title and lobby (3 images) — hooks ready

| File | Size | Prompt |
| --- | --- | --- |
| `logo.png` | 1600 × 640, transparent | Game logo "SPIDER SWINGERS", chunky rounded bubble letters; "SPIDER" in white-to-ice-blue letters each dangling from a silk thread; "SWINGERS" large below in a pink→hot-magenta gradient with a thick dark purple outline and 3D extrusion; no spider character; glossy highlights; transparent background; no other text. |
| `title_bg.jpg` | 1920 × 1080 | Moonlit cartoon night forest for a game title screen: huge glowing cream moon upper right, purple-blue gradient sky with stars, layered silhouette hills and spiky pines, soft pink horizon glow, fireflies, giant dewy cobwebs in both top corners. Centre and top-centre empty and darker for the logo. No characters, no text. |
| `lobby_bg.jpg` | 1920 × 1080 | Cozy cartoon spider-hideout night scene for a game lobby: deep indigo sky, distant gothic town and bridge silhouettes, lanterns and silk threads hanging from the top edge, soft pink glow on the left and cyan glow on the right; low contrast and slightly dark so floating platforms read on top. No characters, no text. |

## 2. Board backgrounds (10 images) — hooks ready

1920 × 1080 JPG each. Until delivered, each board uses the shared Swingers
backdrop for its theme.

| File | Board | Prompt |
| --- | --- | --- |
| `bg_canopy.jpg` | Canopy (jungle) | Looking down into a deep misty jungle gorge at dusk; giant tree trunks frame the left and right edges, lianas hang in the top corners, soft green light shafts from top centre; the bottom fades into dark green fog so it reads as bottomless. |
| `bg_hollow.jpg` | Stalactite Hollow (cave) | Inside a huge violet crystal cave: distant rock spires and a faint underground lake in the lower third, glowing cyan and magenta crystal clusters in the lower corners, soft blue glow in the centre, dim cavern depth above. |
| `bg_caldera.jpg` | Caldera (volcano) | Inside a volcano crater: jagged black crater walls at the sides, distant lava falls, a glowing orange lava lake along the bottom edge, hazy red smoke in the middle, embers and a dark smoky sky at the top. |
| `bg_foundry.jpg` | Gearworks (factory) | A dim industrial hall: giant background gears silhouetted in the centre and corners, pipes, catwalk silhouettes and cyan indicator lights on the far walls, amber work-lamp haze in the middle, darker steel at the bottom. |
| `bg_skyway.jpg` | Skyway (sky) | Bright high-altitude sky: small distant floating islands at the edges, a thick sea of clouds across the bottom fifth, gentle blue gradient with soft wispy clouds above, a couple of tiny distant kites or birds. |
| `bg_glasshouse.jpg` | Moon Conservatory (night) | A moonlit Victorian conservatory seen from inside: gothic city skyline behind the glass at the sides, large pale moon upper right, lush dark ferns and palms in the lower corners, indigo starry sky behind faint iron glazing bars. |
| `bg_glacier.jpg` | Glacier Rift (frost) | Polar night with green and teal aurora in the upper sky, distant snowy peaks in the middle distance, a deep blue ice canyon dropping away in the bottom centre, fine snowfall throughout. |
| `bg_sweets.jpg` | Gumdrop Grove (candy) | Candy land at sunset: lollipop trees, swirl clouds and frosted hills in the side thirds, warm pink-purple sky, a chocolate horizon at the bottom; keep the centre column plain. |
| `bg_storm.jpg` | Eye of the Storm (storm) | A towering storm vortex with its eye slightly above centre, dark misty mountains at the bottom, rain streaks throughout, lightning glowing inside the clouds at the far left and right. |
| `bg_dunes.jpg` | Sunken Ruins (desert) | Desert ruins at dusk: broken sandstone arches and columns silhouetted at the left and right edges, low dunes on the horizon, warm amber-to-violet sky with the first stars, a low sun glowing lower right. |

## 4. NEW: integration review of the delivered art (delivered)

All 13 delivered images were checked in the game (title, lobby, every board
mid-round). They load through the boot bar (board backdrops are now
preloaded, so they no longer pop in), and none need replacing. Changes made
around them:

- Procedural stand-in props that the paintings now show themselves (clouds,
  stars, silhouettes, background gears, vortex, glazing frame, ferns,
  crystals, light rays) are skipped on boards whose backdrop is delivered.
- Stalactite Hollow and Gumdrop Grove are busier behind the action, so their
  backdrops are darkened a little more (`bgDim` in `src/boards.js`).
- The glacier's ice slopes no longer use the shared striped water tile (it
  read as stairs); they are drawn as procedural glossy ice as a fallback. The texture
  below is now delivered and registered.

| File | Size | How the game uses it | Prompt | Status |
| --- | --- | --- | --- | --- |
| `tile_spider_frost_ice.png` | 512 × 512, seamless PNG | Fills every ice solid (Glacier Rift's big slopes, the ice bridge, icicles), tiled at half size; outlines and the white top edge are drawn over it. Must read as slippery, not as steps. | Seamless tileable texture of glossy glacier ice: translucent pale-cyan to mid-blue, soft diagonal light streaks and a few thin white cracks and trapped air bubbles; no horizontal bands, no stripes, no hard edges; even brightness across the tile so the repeat doesn't show. | Delivered |

## 3. Optional extras — would each need a small loader hook

These are nice-to-haves; the procedural versions work. Ask before
generating and I'll add the hook with them.

- **Terrain textures** (512 × 512 seamless PNG): `tile_spider_cave.png` wet
  violet rock; `tile_spider_volcano.png` basalt with glowing cracks;
  (`tile_spider_frost_ice.png` moved to section 4, hook ready);
  `tile_spider_sky.png` puffy cloud
  texture; `tile_spider_desert.png` carved sandstone.
- **Board props** (≈ 256 × 256 transparent): crystal cluster, hanging work
  lamp, fern / palm frond.
- **Lobby sign icons** (128 × 128 white glyph on transparent):
  `icon_versus.png` two crossed glowing plasma sabers, `icon_survival.png`
  cartoon beetle, `icon_settings.png` gear, `icon_board.png` small floating
  island with a question mark.
- **Survival insects** (side view facing right, transparent, 4–6 frame
  wing-flap strip): Stinglet wasp 64 × 64 (+ windup/dash pose); Gnatling fly
  32 × 32; Buzzgunner hornet 80 × 64 (+ glowing-barrel charge frame);
  Bladewing mantis 80 × 80 body only (idle, raise, slash); Shellback beetle
  96 × 80 (idle, ram, dazed); Dropmoth 96 × 96 slow flap, with and without
  its bomb; Hexfly dragonfly 80 × 64 (idle, cast, fade); Brood Tyrant boss
  256 × 256 (flap strip + roar, charge, dazed, and an enraged red variant).
  Extras: Hexfly rune circle 64 × 64, bomb 32 × 32 (two blink frames).
- **Weapons**: held sprites with the grip at left-middle and the barrel
  pointing right, ~2× in-game size (pistol 30 px long, shotgun 40, rail 46,
  rocket 58, gatling 44, ripper 34, ray 36, arc coil 30, void 36, hive 40,
  glaive 112 × 16, twin-saber hilt 26); projectile sprites 64 × 64 (rocket,
  homing missile, saw disc, grenade, mine light on/off, void orb); and a
  96 × 96 pickup icon for each of the 15 weapons.
