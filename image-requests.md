# Image requests

All 45 requested PNGs have been generated and saved at the paths below.
The exact prompts, dimensions, and transparency requirements are recorded in
`assets/generation.json`. This delivery contains art assets; the backgrounds,
tiles, and UI still need rendering integration, and heads need registration
with `registerSpriteHead` before appearing in the lobby picker.

Art that would lift SWINGERS from "flat prototype" to "finished party game".
Everything below is optional. The game draws everything procedurally today,
so each image is a drop-in upgrade, not a blocker.

Items are grouped by **priority**. P1 makes the biggest difference for the
least work. Save files at the paths given; I'll wire them in.

## Style guide (applies to every request)

- **Look:** clean 2D game art, flat shapes with soft gradients and gentle
  rim light. Think *Heave Ho* / *Ori* backdrops crossed with a toy box.
  Readable at a glance, not busy.
- **No text, no logos, no characters** unless the request asks for them.
- **Backgrounds must stay quiet.** The middle 60% of the frame is where play
  happens. Keep it low-contrast and a bit desaturated so platforms, spikes
  and robots pop in front. Put detail along the edges and at the bottom.
- **Palettes:** match each theme's colors (hex codes below) so the art sits
  with the procedural platforms.
- **Formats:** PNG. "Transparent" means a real alpha channel (no
  checkerboard baked in). "Seamless-x" means the left and right edges tile
  with no visible seam.

| Theme | Used by | Sky top → bottom | Platform | Accent |
| --- | --- | --- | --- | --- |
| meadow | Grab School, Playground | `#20304f` → `#3a5a8c` | `#4a5d8f` | `#ffd166` |
| cave | The Wall, Over Under, Down the Well | `#191527` → `#2f2447` | `#4f3f73` | `#ff9de2` |
| sunset | First Swing, Monkey Bars | `#2b1e3d` → `#7a3b5e` | `#5d4a7a` | `#ffb84d` |
| jungle | Stepping Stones, Rope Garden, Long Haul | `#12261e` → `#1e4d33` | `#3a6b45` | `#b6f26d` |
| factory | Gentle Spin, Spin Cycle, Windmill Pass, Spinner Gauntlet | `#1c2226` → `#2e3c44` | `#50646e` | `#66e0ff` |
| sky | Balloon Ascent, Balloon Storm | `#4d8fc4` → `#a8d8f0` | `#e8eef5` | `#ff7eb6` |
| volcano | Lava Lifts, Spike Stairs, Spike Ceiling, Razor Run | `#26090b` → `#511217` | `#6e3b2a` | `#ffae42` |
| night | Pendulum Alley, The Gauntlet, Clock Tower | `#0d1026` → `#232a54` | `#3c477e` | `#9dffb0` |
| candy | Bounce House, Balloon Chimney | `#33203f` → `#5e2f63` | `#7a4d8a` | `#ffd1f0` |
| frost | Ferry Ride, Slip 'n' Slide, Counterweight, Summit | `#16283a` → `#2c4a63` | `#527a99` | `#bdf3ff` |
| desert | Crumble Bridge | `#2a1d1f` → `#6e4631` | `#8a6748` | `#ffcf6b` |
| storm | Updraft | `#1a2130` → `#46566e` | `#5f6f88` | `#9fe3ff` |

---

## P1: Theme backdrops (12 images)

This is the biggest single visual upgrade. Today every board is a two-color
gradient with dots. One painted backdrop per theme gives each board a sense
of place.

- **Path:** `assets/bg/<theme>.png` (e.g. `assets/bg/volcano.png`)
- **Size:** 2400 × 1350 (16:9), opaque
- **Composition:** a horizon/silhouette band across the lower third and
  detail at the edges. The center stays an open, quiet sky.

| File | Prompt |
| --- | --- |
| `meadow.png` | Twilight meadow at dusk: rolling blue hills in three receding layers, a few round trees in silhouette at the edges, soft first stars, a warm yellow glow low on the horizon. Calm, minimal, flat-shaded 2D game background, open sky in the middle. |
| `cave.png` | Inside a vast crystal cave: dark violet rock walls framing the left and right edges, glowing pink crystals clustered along the bottom, faint stalactites at the top edge, soft haze in the middle. Flat-shaded 2D game background. |
| `sunset.png` | Sunset over a desert canyon: layered mesa silhouettes in plum and magenta, a big hazy orange sun low on the right, wispy clouds. Flat-shaded 2D game background, quiet center. |
| `jungle.png` | Dense jungle at night: hanging vines and giant leaves framing the top and sides, misty layered tree silhouettes in deep greens, a few fireflies in lime green. Flat-shaded 2D game background, open middle. |
| `factory.png` | Inside a huge robot factory: big dim gears and pipes in teal-grey silhouette at the edges, conveyor gantries in the far background, cyan indicator lights, light haze. Flat-shaded 2D game background, uncluttered center. |
| `sky.png` | Bright daytime sky high above the clouds: fluffy cloud banks at the bottom and edges, a few distant floating islands, pastel blue fading lighter toward the horizon, tiny pink kites far away. Flat-shaded 2D game background. |
| `volcano.png` | Inside an erupting volcano: jagged dark-red rock silhouettes, rivers of glowing orange lava far in the background, embers drifting up, a hot glow from below. Flat-shaded 2D game background, dark quiet center. |
| `night.png` | A clock-tower city skyline at midnight: tall spires and a giant clock face in deep navy silhouette, a big pale moon, scattered stars, mint-green window lights. Flat-shaded 2D game background, open sky in the middle. |
| `candy.png` | Candy land at dusk: lollipop trees, gumdrop hills and swirly cotton-candy clouds in purples and pinks, sparkles. Playful, soft, flat-shaded 2D game background, quiet center. |
| `frost.png` | Frozen arctic bay at night: icebergs and snowy cliffs in layered blue silhouettes, a soft aurora in pale cyan across the top, a calm icy sea at the bottom. Flat-shaded 2D game background. |
| `desert.png` | Ancient desert ruins at golden hour: crumbling sandstone arches and broken pillars at the edges, dunes in the distance, warm dust in the air. Flat-shaded 2D game background, open center. |
| `storm.png` | A windy storm front over mountains: dark slate clouds swirling in layers, distant lightning, rain streaks blowing sideways at the edges, cool blue-grey light. Flat-shaded 2D game background, quiet center. |

## P1: Robot head sprites (6–8 images)

The engine already supports sprite heads. Drop PNGs in `assets/heads/` and
they show up in the lobby face picker. Heads spin with the body, so they
should look good at any rotation (a face on a round head, not a full body).

- **Path:** `assets/heads/<name>.png`
- **Size:** 512 × 512, transparent, the head fills the circle edge to edge
- **Shared prompt:** "A round robot head for a 2D party game, perfect
  circle silhouette filling the frame, front view, bold dark outline, flat
  cel shading with one highlight, big expressive face, white/neutral base
  color (the game tints it per player), transparent background, no body."

| File | Personality |
| --- | --- |
| `happy.png` | Wide grin, round LED eyes |
| `visor.png` | Sleek visor band with two glowing eye dots |
| `grump.png` | Furrowed metal brows, flat mouth |
| `wink.png` | One eye winking, cheeky smile |
| `shades.png` | Cool sunglasses, smirk |
| `screen.png` | CRT screen face showing pixel eyes `^ ^` |
| `antenna.png` | Little antenna on top, surprised "o" mouth |
| `cyclops.png` | One big camera-lens eye |

> Tip: if tinting looks wrong, make four color variants per head
> (red `#ff5d6c`, blue `#4da3ff`, gold `#ffd94d`, green `#5fe08b`) and name
> them `happy_red.png` and so on.

## P2: Hazard textures (3 images)

Right now lava, icy water and spikes all look the same (red teeth). Themed
hazards make danger read instantly.

| File | Size | Prompt |
| --- | --- | --- |
| `assets/tiles/lava.png` | 1024 × 256, seamless-x, opaque | Molten lava surface seen from the side: a bright yellow-orange glowing crust at the top edge fading to deep red and black below, cracked cooling plates, a few bubbles. 2D game texture, flat-shaded. |
| `assets/tiles/icewater.png` | 1024 × 256, seamless-x, opaque | Freezing arctic water seen from the side: a pale-cyan foamy surface line at the top, floating ice chips, dark blue depths below. 2D game texture, flat-shaded. |
| `assets/tiles/spikes.png` | 512 × 128, seamless-x, transparent | A row of chunky metal spikes pointing up, bold dark outline, red-tipped, cartoon style, transparent background. |

## P2: Platform material tiles (one per theme, 12 images)

Platforms are flat rounded rectangles in one color. A material per theme
(mossy stone, riveted metal, candy, ice) is the second-biggest "place" cue
after backdrops.

- **Path:** `assets/tiles/plat_<theme>.png`
- **Size:** 512 × 128, **seamless-x**, opaque. The top 20 px is the
  "walkable" rim (grass, snow, frosting), the rest is the body material.
- **Prompt template:** "Seamless horizontal 2D game platform texture,
  side view, `<material>`, a distinct `<rim>` along the top edge, flat
  shading, bold readable shapes, colors around `<platform hex>`."

| Theme | Material | Rim |
| --- | --- | --- |
| meadow | blue-grey stone blocks | short grass |
| cave | violet rock | small pink crystals |
| sunset | plum sandstone | smooth worn edge |
| jungle | mossy stone | moss and tiny leaves |
| factory | riveted steel plates | yellow-black hazard stripe |
| sky | white cloud-marble | fluffy cloud puff |
| volcano | dark basalt with glowing cracks | charred crust |
| night | navy brick | stone coping |
| candy | wafer biscuit | pink frosting drip |
| frost | packed snow over blue ice | snow cap with icicles hanging below |
| desert | cracked sandstone brick | sand dusting |
| storm | wet slate | dark rain-soaked edge |

## P2: Title logo (1 image)

- **Path:** `assets/ui/logo.png`
- **Size:** 1600 × 500, transparent
- **Prompt:** "Game logo wordmark reading 'SWINGERS', chunky rounded
  bubble letters in warm yellow `#ffd94d` with a thick dark-purple outline
  and a drop shadow, one letter hanging from a robot claw-hand as if being
  swung, playful party-game style, transparent background."

## P3: Gimmick icons for the board picker (8 images)

For the card-style level select mockup: a small icon per mechanic.

- **Path:** `assets/ui/icon_<name>.png`
- **Size:** 128 × 128, transparent, white line icon with a soft drop shadow
- Names and subjects: `rope` (a hanging rope), `wheel` (a spinning bar
  with motion arcs), `balloon`, `lift` (a platform with up/down arrows),
  `bounce` (a spring pad with an up chevron), `ice` (a snowflake),
  `crumble` (a cracked brick), `wind` (three swoosh lines)

## P3: Lobby / board-select key art (1 image)

- **Path:** `assets/ui/keyart.png`
- **Size:** 2400 × 1350, opaque
- **Prompt:** "Key art for a 2D physics party game: four round robots
  (red, blue, gold, green) with long noodly segmented arms grabbing each
  other, swinging from ropes and spinning bars over a spike pit, one being
  flung through the air, joyful chaos, bright flat-shaded style, dark navy
  background with a warm spotlight, room for a title in the top third."
