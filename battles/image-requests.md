# Wobbly Battles — image requests

**Status: 1 open request (round 8). Rounds 1–7 (55 images) are delivered; see `image-requests-history.md`.**

## How to deliver

Drop each finished file at the path given (relative to `battles/`). UI art goes in as a
full-size original at `assets/originals/ui/<name>.png`. Then run
`python3 tools/build_battles_assets.py`, which builds the in-game sizes and lists them in
`assets/manifest.json`. Reference sheets go straight into `reference/`. The game keeps
its drawn fallback until an image arrives, so nothing breaks while one is missing.
Record prompts and dimensions in `assets/generation.json` as before.

## Shared style

Bright, toy-like, comedic medieval fantasy in the spirit of *Totally Accurate Battle
Simulator*. Soldiers are chubby bean-shaped bodies with stubby arms and legs, big round
heads, simple cartoon faces (white eyes with black pupils, thick eyebrows), and no
noses, fingers or realistic anatomy. Use clean flat colours with soft shading and
saturated grass greens and sky blues. The two armies are **Blue (#3d72e3)** and **Red
(#e2403b)**, and gold accents are **#f2c230**. Do not use real brands, real people or
the TABS logo.

## Round 8 — Minecraft faction emblem (1 image)

| # | File | Size | Status | Brief |
|---|---|---|---|---|
| 56 | `assets/ui/faction-minecraft.png` (original: `assets/originals/ui/faction-minecraft.png`) | 128×128, transparent PNG | requested | Faction emblem for **Minecraft**: a front-on pixel-art Creeper face (the classic green mottled square with the black eyes and frown-shaped mouth) over a crossed pixel diamond sword and pickaxe, on a small grass-block square. Blocky 16×16-pixel look scaled up crisply (hard pixel edges), framed in the same flat sticker style and bold outline as the other emblems. Greens (#5d9b3a, #3d7a26), diamond cyan (#4ae0d8), dirt brown (#7a5232). No text, readable at 28 px. (The game is private behind the invite gate, so the real Minecraft look is fine here.) |
