# Image requests

**Status: no open requests.** All 62 requested images (rounds 1–4) are delivered and
integrated; see `image-requests-history.md`. Exact prompts are recorded in
`assets/generation.json`.

## How to deliver

Save each original at the path its request gives (in `assets/{bg,heads,tiles,ui}`).
The exact prompts are recorded in `assets/generation.json`. The game loads
web-ready copies from `assets/web/`. After replacing any original, rebuild
them with `python3 tools/build_assets.py`. That script also:

- re-encodes the backdrops and key art as 1920×1080 JPGs (about 30 MB of
  PNG becomes about 3 MB),
- crossfades the edges of tiles with a visible seam (`plat_candy`,
  `plat_volcano` and `lava` had one), so you don't need to regenerate those,
- shrinks heads to 256 px. The heads are tinted per player in code, so keep
  them white-based.

Where each image is used: backdrops behind every board (dimmed toward the
theme color), platform tiles on every grippable platform, lava and ice
water as the floor hazard on volcano and frost boards, the spike strip on
every other hazard, heads as the 8 lobby faces, the logo in the lobby, the
key art behind the board list, and the icons on each board row.

## Open requests

None.

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
