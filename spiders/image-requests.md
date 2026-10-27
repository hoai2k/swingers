# Spider Swingers — image requests

**Status: Round 2 open — 128 images requested (sections A–H). Nothing is
blocked:** every image below already has a drawn stand-in in the game, so
deliver in any order. Delivered rounds are in `image-requests-history.md`.

This round asks for every piece of art the game could use. An image that
doesn't turn out well can simply stay unused (the drawn version stays), so
generate everything; I'll wire each one in as it arrives and say which ones
I left out and why.

## How to deliver

- Put each file in `spiders/assets/web/` with exactly the filename given.
- Add the filename to the `images` list in
  `spiders/assets/web/manifest.json`. Unlisted files are never requested.
- Record the prompt and size in `spiders/assets/generation.json` as before.
- Tell me which files landed; I add the loader hook and check each in game.

## Shared style

The glossy, bold-outlined painterly cartoon look of the Swingers / Rounders
art and the delivered Spider Swingers backdrops: clean shapes, a thick dark
outline (deep purple-black, not pure black), soft shading with one bright
highlight, saturated but not neon colours. No text, no characters unless
stated.

- **Sprites and icons**: transparent PNG, the subject centred with a few
  pixels of empty margin, lit from the upper left, no drop shadow (the game
  adds its own).
- **Side views** face right; the game mirrors them.
- **Animation strips**: one horizontal PNG, frames of equal width side by
  side, in the order listed, the subject in the same spot in every frame.
- **Glowing parts** (plasma blades, lasers, energy) are drawn in a neutral
  white-cyan core with a soft glow; the game tints them.

## A. Terrain tiles (9 images)

512 × 512 seamless, tileable PNG, even brightness across the tile so the
repeat doesn't show, no horizontal bands (they read as stairs). Fills the
solid terrain of each board; outlines and the bright top edge are drawn
over it, and it is darkened slightly behind the action.

| File | Board | Prompt |
| --- | --- | --- |
| `tile_spider_jungle.png` | Canopy | Seamless tileable texture of mossy jungle tree bark: deep brown furrowed bark with soft green moss patches, a few tiny leaves and lichen spots; painterly cartoon style; even lighting. |
| `tile_spider_cave.png` | Stalactite Hollow | Seamless tileable texture of wet violet cave rock: smooth purple-grey stone with soft darker cracks, faint glints of tiny embedded cyan crystals and damp sheen; painterly cartoon style; even lighting. |
| `tile_spider_volcano.png` | Caldera | Seamless tileable texture of black basalt rock with thin glowing orange-red cracks running between the stones and a few warm ember specks; painterly cartoon style; even lighting. |
| `tile_spider_factory.png` | Gearworks | Seamless tileable texture of dark riveted steel plates: blue-grey metal panels with rows of round rivets, light scuffs and soft rust spots at the seams; painterly cartoon style; even lighting. |
| `tile_spider_sky.png` | Skyway | Seamless tileable texture of a dense puffy cloud surface: soft white and pale lavender cloud puffs packed together with gentle blue shadows; painterly cartoon style; even lighting. |
| `tile_spider_night.png` | Moon Conservatory | Seamless tileable texture of old moonlit garden stonework: worn blue-grey flagstones with soft moss in the joints and faint ivy tendrils; painterly cartoon style; even lighting. |
| `tile_spider_candy.png` | Gumdrop Grove | Seamless tileable texture of candy terrain: soft milk-chocolate with swirls of pink frosting and scattered rainbow sprinkles; painterly cartoon style; even lighting. |
| `tile_spider_storm.png` | Eye of the Storm | Seamless tileable texture of wet dark slate rock: layered blue-grey stone with rain-slick highlights and a few pale streaks; painterly cartoon style; even lighting. |
| `tile_spider_desert.png` | Sunken Ruins | Seamless tileable texture of carved sandstone blocks: warm amber and ochre bricks with worn edges, faint carved glyph patterns and wind-blown sand in the joints; painterly cartoon style; even lighting. |

## B. Weapons — held sprites (15 images)

Transparent PNG, side view, drawn at 4× the in-game size. The grip or handle
sits at the **left-middle** of the image and the barrel or blade points
**right**; the game rotates it around the grip. Chunky toy-like sci-fi
shapes that read at small size.

| File | Size | Prompt |
| --- | --- | --- |
| `wpn_pistol.png` | 160 × 80 | A chunky cartoon sci-fi laser pistol, side view pointing right: rounded white and teal body, short barrel with a glowing cyan emitter tip, small grip at the left. |
| `wpn_shotgun.png` | 200 × 80 | A chunky cartoon sci-fi scattergun, side view pointing right: wide double barrel, orange and dark-grey body, a pump slide underneath, grip at the left. |
| `wpn_railgun.png` | 240 × 70 | A long sleek cartoon rail lance rifle, side view pointing right: twin parallel rails along the barrel with glowing violet coils between them, white and purple body, grip at the left. |
| `wpn_rocket.png` | 260 × 90 | A cartoon rocket tube launcher, side view pointing right: thick olive-green tube with yellow-black hazard stripes, a flared front, a small sight on top, grip at the left. |
| `wpn_minigun.png` | 220 × 100 | A cartoon "hornet gatling" minigun, side view pointing right: a cluster of six spinning barrels, yellow and black striped housing like a hornet, an ammo drum underneath, grip at the left. |
| `wpn_saw.png` | 180 × 100 | A cartoon "ripper" saw-disc launcher, side view pointing right: a red boxy body with a big circular saw blade loaded at the front, grip at the left. |
| `wpn_deathray.png` | 180 × 90 | A cartoon retro "sizzle ray" gun, side view pointing right: bulbous chrome body with three rings around a dish-shaped emitter glowing hot pink, grip at the left. |
| `wpn_tesla.png` | 150 × 100 | A cartoon "arc coil" tesla gun, side view pointing right: a copper coil wound around a short barrel ending in a glass bulb with crackling blue electricity, grip at the left. |
| `wpn_singularity.png` | 180 × 100 | A cartoon "void lobber" gun, side view pointing right: dark purple body cradling a swirling black-and-violet orb at the front, glowing violet seams, grip at the left. |
| `wpn_swarm.png` | 200 × 100 | A cartoon "hive pod" missile launcher, side view pointing right: a honeycomb-shaped amber pod with six small missile tubes at the front, grip at the left. |
| `wpn_grenade.png` | 80 × 80 | A cartoon "pop grenade": a round glossy red bomb with a yellow band, a pull ring and a short lit fuse spark on top. |
| `wpn_mines.png` | 96 × 64 | A cartoon "stick mine": a flat round dark-grey disc with a red light on top and four tiny sticky suction feet underneath, side view. |
| `wpn_saber.png` | 160 × 48 | A cartoon plasma saber **hilt only** (no blade), side view, emitter end pointing right: a chunky silver hilt with black grip ridges, a red button and a flared emitter collar. |
| `wpn_twinsaber.png` | 200 × 48 | A cartoon double-ended plasma saber **hilt only** (no blades), side view: a long silver staff hilt with emitter collars at both ends and black grip bands in the middle. |
| `wpn_glaive.png` | 220 × 64 | A cartoon plasma glaive **pole only** (no blade), side view, head pointing right: a long dark staff with a curved golden mount at the right end where a glowing blade attaches, grip at the left. |

## C. Weapons — pickup icons (15 images)

256 × 256 transparent PNG each. Shown on dropped weapons and in the HUD:
the same weapon as in section B, tilted about 30° upward, filling most of
the square, with blades drawn **lit** this time (cyan saber blades, gold
glaive). Name them `pick_<id>.png`:

`pick_pistol.png`, `pick_shotgun.png`, `pick_railgun.png`,
`pick_rocket.png`, `pick_minigun.png`, `pick_saw.png`,
`pick_deathray.png`, `pick_tesla.png`, `pick_singularity.png`,
`pick_swarm.png`, `pick_grenade.png`, `pick_mines.png`, `pick_saber.png`,
`pick_twinsaber.png`, `pick_glaive.png`.

Prompt (fill in the description from section B): *"Game pickup icon of
[weapon description], tilted 30° upward, glowing parts lit, glossy
bold-outlined cartoon style, centred on a transparent background, no text."*

## D. Projectiles and effects (12 images)

Transparent PNG, pointing right where it has a direction.

| File | Size | Prompt |
| --- | --- | --- |
| `proj_rocket.png` | 128 × 48 | A cartoon rocket in flight, side view pointing right, olive with a red nose cone and small fins, no exhaust flame. |
| `proj_missile.png` | 96 × 40 | A small cartoon homing missile shaped like a bee, amber and black stripes, tiny wings, pointing right. |
| `proj_saw.png` | 96 × 96 | A spinning cartoon circular saw blade, silver with sharp teeth and a red hub, slight motion blur on the teeth. |
| `proj_grenade.png` | 64 × 64 | The red cartoon pop grenade from the pickup, small, fuse lit. |
| `proj_mine_strip.png` | 128 × 64 (2 frames) | The stick mine stuck flat to a surface, two frames: red light off, red light on and glowing. |
| `proj_void.png` | 128 × 128 | A swirling black-hole orb with a violet glowing ring and specks of light being sucked in. |
| `proj_bomb_strip.png` | 128 × 64 (2 frames) | A dropmoth's round black bomb with a lit fuse, two frames: fuse spark small, fuse spark large with a red glow. |
| `proj_stinger.png` | 64 × 32 | A glowing yellow-green insect stinger shot, a needle shape with a soft glow, pointing right. |
| `fx_explosion_strip.png` | 1536 × 256 (6 frames) | A cartoon explosion: a white flash, then a puffy orange-yellow fireball, then dark smoke puffs dissipating. |
| `fx_web_splat.png` | 128 × 128 | A small white spider-silk splat where a web strand sticks to a surface, a few radiating strands. |
| `fx_slash.png` | 256 × 128 | A white-cyan crescent sword-slash arc, bright core fading at the ends. |
| `fx_hit_spark.png` | 128 × 128 | A white star-burst impact spark with four to six sharp rays. |

## E. Insects and the boss (10 images)

Side view facing right, transparent animation strips (see *Shared style*).
Friendly-menacing cartoon bugs with big expressive eyes, glossy carapaces
and the same bold outline as the spiders. Frame size given per frame.

| File | Frame size × frames | Prompt |
| --- | --- | --- |
| `bug_stinglet.png` | 128 × 128 × 6 | A small cartoon wasp, yellow and black, big angry eyes, translucent wings. Frames: 1–4 wing-flap cycle, 5 wind-up (body curled back, stinger raised), 6 dash (stretched forward, stinger first). |
| `bug_gnatling.png` | 64 × 64 × 4 | A tiny round cartoon gnat, grey-green with huge red eyes and blurry wings. Frames: 4-frame wing-flap cycle. |
| `bug_buzzgunner.png` | 160 × 128 × 6 | A cartoon hornet with a little blaster barrel built into its abdomen, orange and dark brown. Frames: 1–4 wing-flap, 5 charging (barrel glowing), 6 firing recoil. |
| `bug_bladewing.png` | 160 × 160 × 5 | A cartoon praying mantis, leaf green, with two big scythe forearms. Frames: 1–2 idle hover, 3 forearms raised, 4 slash, 5 recover. |
| `bug_shellback.png` | 192 × 160 × 5 | A chunky cartoon rhinoceros beetle with a glossy dark-blue shell and a big horn. Frames: 1–2 walk, 3 lowered for the ram, 4 ramming, 5 dazed (stars over its head). |
| `bug_dropmoth.png` | 192 × 192 × 6 | A fluffy cartoon moth, dusty lilac with eye patterns on its wings. Frames: 1–4 slow flap carrying a round black bomb, 5–6 flap without the bomb. |
| `bug_hexfly.png` | 160 × 128 × 5 | A cartoon dragonfly with shimmering teal and violet wings and a little wizard-like glowing rune on its back. Frames: 1–3 hover, 4 casting (glowing), 5 fading (half transparent). |
| `bug_hexfly_rune.png` | 128 × 128 × 1 | A glowing violet magic rune circle, spiky insect-like symbols around a ring, front view. |
| `boss_tyrant.png` | 512 × 512 × 8 | The Brood Tyrant: a giant armoured cartoon queen insect, part wasp part beetle, purple and gold carapace, a crown-like crest, four wings. Frames: 1–4 wing-flap cycle, 5 roar (mouth open), 6 charge (lowered, horns forward), 7 dazed, 8 egg-laying (abdomen curled down). |
| `boss_tyrant_rage.png` | 512 × 512 × 8 | The same Brood Tyrant in its enraged form, same 8 poses: carapace glowing red-orange, eyes blazing, steam venting from its shell. |

## F. Lobby, menus and HUD icons (28 images)

256 × 256 transparent PNG, **white glyph** with a dark outline and a soft
inner shade so the game can tint it; simple, bold silhouettes.

| File | Where | Prompt |
| --- | --- | --- |
| `icon_versus.png` | VERSUS island sign | Two glowing plasma sabers crossed in an X. |
| `icon_survival.png` | SURVIVAL island sign | A cartoon beetle seen from above. |
| `icon_trials.png` | TRIALS perch sign | A crown with a spider-web pattern on it. |
| `icon_board.png` | Board island sign | A small floating island with a question mark above it. |
| `icon_settings.png` | Settings sign and corner button | A gear. |
| `icon_range.png` | Practice range | A target with a dart in the bullseye. |
| `btn_fullscreen.png` | Corner button | Four corner arrows pointing outward. |
| `btn_sound.png` | Corner button | A loudspeaker with sound waves. |
| `btn_sound_off.png` | Corner button | A loudspeaker with an X. |
| `btn_music.png` | Corner button | A pair of beamed music notes. |
| `btn_music_off.png` | Corner button | Beamed music notes with a slash. |
| `btn_help.png` | Corner button | A question mark in a speech bubble. |
| `btn_pause.png` | Pause button | Two vertical bars. |
| `hud_heart.png` | Survival lives | A plump cartoon heart. |
| `hud_shield.png` | Shield charges | A round bubble shield. |
| `hud_skull.png` | Kill count | A cute round cartoon skull. |
| `hud_crown.png` | Round / match winner | A three-point crown. |
| `hud_wave.png` | Wave counter | A stylised swarm of three tiny flying bugs. |
| `hud_trophy.png` | Match point / results | A trophy cup. |
| `hud_lock.png` | Locked trials | A padlock. |
| `hud_star.png` | Cleared trials | A five-point star. |
| `tier_hatchling.png` | Trials tier badge 1 | A spider egg cracking open. |
| `tier_webling.png` | Trials tier badge 2 | A tiny spider on a single thread. |
| `tier_hunter.png` | Trials tier badge 3 | A spider with a raised fang. |
| `tier_stalker.png` | Trials tier badge 4 | A spider peeking over a ledge with glowing eyes. |
| `tier_widow.png` | Trials tier badge 5 | A spider with an hourglass mark. |
| `tier_matriarch.png` | Trials tier badge 6 | A spider wearing a crown, eight legs spread. |
| `icon_drop.png` | Weapon drop marker | A downward arrow made of a web strand ending in a glowing orb. |

## G. Perk and modifier cards (29 images)

256 × 256 transparent PNG, **full colour** (unlike section F), a single
bold cartoon object per card in the shared style, on transparent. Shown on
the power-up cards between waves / rounds and on the round modifier cards.

**Perks** (`perk_<id>.png`):

| File | Perk | Prompt |
| --- | --- | --- |
| `perk_shell.png` | Hard Shell | A glossy blue beetle-shell shield. |
| `perk_legs.png` | Quick Legs | A spider leg with speed lines and a sneaker. |
| `perk_spring.png` | Spring Legs | A coiled yellow spring with a spider leg on top. |
| `perk_silk.png` | Long Silk | A long spool of glowing white silk thread unrolling. |
| `perk_venom.png` | Venom Fangs | Two purple fangs dripping glowing venom. |
| `perk_saber.png` | Born Duelist | A plasma saber standing upright, blade lit cyan. |
| `perk_armory.png` | Armory | A red weapon crate with a laser pistol on top. |
| `perk_boom.png` | Last Laugh | A grinning cartoon bomb with a lit fuse. |
| `perk_wind.png` | Second Wind | A pink swirl of wind carrying a feather. |
| `perk_heart.png` | Spare Heart | Two hearts, one a little behind the other. |
| `perk_aegis.png` | Last Stand | A cracked pale-blue shield still holding. |
| `perk_focus.png` | Blade Focus | An hourglass with a saber blade through it. |
| `perk_blast.png` | Big Bang | A big orange cartoon explosion burst. |
| `perk_lull.png` | Lullaby Silk | A sleeping bug in a silk hammock with a "z". |
| `perk_air.png` | Glider Hairs | A fluffy hairy spider leg gliding with wind lines. |
| `perk_pull.png` | Steel Silk | A silver steel cable twisted like a web strand. |

**Round modifiers** (`mod_<id>.png`):

| File | Modifier | Prompt |
| --- | --- | --- |
| `mod_scuttle.png` | Scuttle Rush | Eight spider legs blurred in motion. |
| `mod_pogo.png` | Pogo Legs | A pogo stick with springy coils. |
| `mod_floaty.png` | Featherfall | A white feather drifting down. |
| `mod_heavy.png` | Lead Belly | A grey iron weight marked with a spider. |
| `mod_thick.png` | Fat Plasma | An extra-thick glowing pink saber blade. |
| `mod_booms.png` | Big Booms | Three stacked explosions, small to big. |
| `mod_bubble.png` | Bubble Wrap | A sheet of bubble wrap with a shine. |
| `mod_tiny.png` | Pocket Size | A tiny spider next to a big magnifying glass. |
| `mod_giant.png` | Colossal | A huge spider foot stamping down. |
| `mod_silk.png` | Endless Silk | An infinity sign made of silk thread. |
| `mod_ammo.png` | Bottomless | A bottomless glowing ammo box overflowing. |
| `mod_bladesOnly.png` | Blade Dance | Three plasma blades fanned out. |
| `mod_vacuum.png` | Magnet Mode | A red horseshoe magnet pulling small weapons. |

## H. Board props and lobby pieces (10 images)

Transparent PNG. Decoration the game layers in front of or behind the
terrain; keep them readable but not busy.

| File | Size | Prompt |
| --- | --- | --- |
| `prop_crystal.png` | 256 × 256 | A cluster of glowing cyan and magenta cave crystals growing from a rock base. |
| `prop_lamp.png` | 256 × 384 | An industrial hanging work lamp on a chain, warm amber light glowing downward. |
| `prop_fern.png` | 384 × 256 | A lush dark-green fern / palm frond cluster, growing from the bottom edge. |
| `prop_liana.png` | 128 × 512 | A hanging jungle vine with leaves, hanging from the top edge. |
| `prop_lollipop.png` | 192 × 384 | A big swirly pink-and-white lollipop tree. |
| `prop_column.png` | 192 × 512 | A broken sandstone ruin column with carvings. |
| `prop_gear.png` | 384 × 384 | A large bronze cog gear, slightly worn. |
| `prop_icicles.png` | 384 × 192 | A row of hanging icicles of different lengths, from the top edge. |
| `lobby_island.png` | 768 × 384 | A floating rock island for the lobby: grassy flat top, rocky underside tapering to a point, a few roots and hanging silk threads, lanterns on posts at both ends. |
| `lobby_signboard.png` | 640 × 256 | A blank hanging wooden signboard with a silk-wrapped frame, hung by two threads from the top, no text. |
