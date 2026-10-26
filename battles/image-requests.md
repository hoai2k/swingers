# Wobbly Battles — image requests

**Status: round 7 open — 1 image (the Jujutsu Kaisen faction emblem).** Rounds 1–6 (54
images) are delivered; see `image-requests-history.md`.

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

## Round 7 — Jujutsu Kaisen faction emblem (open)

A big fan faction of the anime's characters (Gojo, Sukuna, Megumi, Yuji, Toji...). The
owner's look references for the units are in `reference/jjk/` (low-poly TABS-style
renders of Toji and Gojo).

| # | File | Size | Status | Brief |
|---|---|---|---|---|
| 55 | `assets/ui/faction-jjk.png` | 128×128, transparent PNG | open | Faction emblem for **Jujutsu Kaisen**: a cursed finger (a withered, dark-red mummified finger with a black nail) crossed with a cursed tool talisman, in front of a dark circle of blue-violet cursed energy flames. Black, deep red (#8a1c1c) and electric blue (#3a7bff). Same flat sticker style and bold outline as the other emblems, no text, readable at 28 px. |
