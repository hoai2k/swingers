# SWINGERS

A **[Rounders](https://github.com/hoai2k/rounders) spinoff**: a local-competition
physics party game in the spirit of **Heave Ho**. Up to 4 players on Xbox
controllers pick a Rounders character (all 24 of the cast, from Vex to Luna),
give them two grabby noodle arms, and race across 30 boards of platforms,
ropes, spinners, balloons, moving ferries and spikes — to the Rounders
soundtrack. Pure HTML5/canvas + [Matter.js](https://brm.io/matter-js/)
(vendored), no build step.

## Run it

Any static file server works (ES modules need http, not `file://`):

```bash
python3 -m http.server 8123      # then open http://localhost:8123
# or: npx serve
```

Connect controllers and press **A** to join — you spawn straight into the
lobby **playground** (a live practice arena with a bar, rope, balloon and
climbing tower). Pick a mode from the dropdown next to PLAY (or press **Y**):
**VS** (first to the goal wins the round) or **CO-OP** (the round is only won
when *everyone* reaches the goal — the team gets congratulated and the team
clock stops when the last robot gets in). Hit **PLAY** (or START) to open the
board list: **30 boards, 10 each of Easy / Medium / Hard**, organized in
columns — browse with stick/dpad, pick with A, or just click one. Races
return to the board list; session scores persist, and best times are kept
**separately per mode** for every board.

In the lobby, **◀ ▶** (dpad) picks your character; each slot shows their
Rounders title. Characters face the way you're pushing the sticks. Their arms
match them — a rubber-hose noodle for most of the cast, a glowing wisp for the
spooky ones (Wraith, Nyx, Jinx, Nova, Shade, Vex), and a tinted segmented
robot arm for the machines and bruisers (Rook, Sprocket, Diesel, Havoc, Duke,
Onyx, Blitz). Arms are cosmetic: everyone has the same reach and grip. Hands
are always **blue = left, red = right**, and a thin ring in your player color
sits behind your character.

**Settings** (gear button, top right; **X** in the lobby and board list, **Y**
in the pause menu): sound on/off, music on/off, sound effects on/off, and
**Original Swingers** (default off), which adds the 8 original robot heads
back into the character picker. Settings are remembered in the browser.

**Sound:** the speaker button (or **M**) switches all sound. Music follows the
game: the title track in the lobby, then from your first race a playlist that
opens on the song for that board's theme and works through every theme before
repeating one. It's quieter on the board list and the results screen, and
quieter still when paused. Everything goes silent while the tab is hidden or
the window loses focus, and a race in progress pauses itself.

## Controls (Xbox layout)

| Input | Action |
| --- | --- |
| **Left stick** | left arm — point it where you want the hand |
| **Right stick** | right arm — each stick drives only its own arm |
| **LT / LB (hold)** | close left hand — latches onto anything it touches |
| **RT / RB (hold)** | close right hand |
| **B** | punch (fires on release) — tap for a quick shove, **hold ~1s to charge** a huge blast; always shakes off anyone holding you |
| **START** | pause — the pause menu has clickable **RESUME / RESTART / QUIT** buttons, or use **A**/**START** resume, **X** restart, **B**/**BACK** quit to the menu |

Keyboard (for testing / a 5th friend): **WASD** + **Arrows** = sticks,
**LShift/Q** + **RShift/E** = grabs, **Space** = punch/B, **Enter** = A,
**Esc/P** = START, **X** = X, **Backspace** = BACK, **C** = Y (mode),
**1/2** = pick a character. In the pause menu, **Backspace** (or **Space**)
quits to the menu, **X** restarts. Dev keys: **R** restart board,
**N** skip board. **M** sound on/off, **X** settings in the lobby.

### How movement works (the whole game)

Your robot is a ball with two physically simulated noodle arms (4 jointed
segments each, left and right attached at opposite shoulders). Each free arm
points along its OWN stick (magnitude matters — a half-tilted stick
half-extends the arm; an idle stick's arm dangles). The moment a hand grips, **the stick steers your body: push where
you want to go**, and the free hand points the same way, leading to the
next hold. Everything follows from that, exactly like Heave Ho:

- hanging + stick sideways swings you that way, hard: dead hang to
  horizontal in about a quarter second, and you can hold there
- **windmill**: roll the stick in circles while gripping a bar, corner or
  rope and your body whips around the grip, building big fling speed
  (the grip motor tracks your stick even when it laps ahead of your body)
- **monkey bars / climbing**: hold the travel direction and alternate the
  triggers — your body swings ahead while the free hand lands on the next
  hold
- grip the floor and push up = one-arm handstand; ease the stick gently
  toward a hanging grip = **chin-up**
- grab a ledge and push up-toward it to climb over
- press open hands into floors/walls and the reaction shoves your body —
  hops, crawls and wall-vaults are emergent, not scripted
- release the trigger at the top of the arc to fling; grips are pin joints
  so momentum carries perfectly
- riding a balloon? relax the stick and hang — climbing above your own
  balloon just presses it down

Your grippers are color-coded so you always know which is which: the
**left hand is blue, the right hand is red**.

Hands stick to the first thing they touch while the trigger is held —
including other players' bodies and hands (human chains work). Grabbing a
teammate gives your arm a big strength boost so you can be a **living
anchor**: hang from a ledge and haul a friend up over a gap, or swing them
to safety, Heave Ho-style. Punch (B) shoves players flying and, the instant
you press it, **shakes off anyone gripping you** — hold it to charge a blast
that rivals the ⭐ super glove (which makes any punch huge, instantly).

## The race

Everyone spawns together. In **VS**, first to the **GOAL** ring **wins the
round on the spot** (5 pts) and gets their name in lights. In **CO-OP**, the
round is won when the whole team is in — everyone scores 5 and the team time
(last robot in) goes on the board's co-op record. Spikes/lava/falling =
respawn at the start (costs time, not the round).

The 30 boards follow Heave Ho's design language: single-screen rooms with
the goal visible from spawn, one gimmick per room, and hazards that frame
the route — and every board has its own challenge (no two boards ask for
the same thing). **Easy** teaches one mechanic with safe floors (Grab
School, Stepping Stones, Rope Garden, Gentle Spin, Bounce House's
trampolines, Slip 'n' Slide's ungrabbable ice...). **Medium** adds spikes
and twists (Monkey Bars, Lava Lifts, Balloon Chimney, Crumble Bridge, Down
the Well — climbing *down*...). **Hard** demands chained techniques over
mostly-lethal ground (Spike Ceiling, Spinner Gauntlet, Balloon Storm's
gusts, Clock Tower, Updraft's wind vents, Summit...). Long hard boards have
a **checkpoint flag** — touch it and you respawn there.
Every board carries an authored solution route checked against measured
physics reach envelopes (see the design rules atop `src/levels.js`), so
every board is completable. The reverse is checked too: a reachability
audit verifies there's no *trivial* path — boundary walls have unclimbable
gaps where they'd otherwise be free ladders, and safe floors never lead to
a cheap hop onto the goal.

## Customizing

**Art** — backdrops, platform tiles, hazards, heads, logo and icons are
generated images (prompts in `image-requests.md` / `assets/generation.json`).
Originals live in `assets/{bg,heads,tiles,ui}`; the game loads web-ready
copies from `assets/web/`, rebuilt with `python3 tools/build_assets.py`
(needs Pillow). `src/art.js` loads them and every draw call falls back to
the old procedural look if an image is missing. Each theme in
`src/levels.js` names its art via `theme`.

**Characters + music from Rounders** — `node tools/import_rounders.mjs
/path/to/rounders` re-imports the cast and soundtrack. It runs Rounders' own
rig code headlessly so every body keeps the size and alignment authored in
Rounders' /workbench (fitted ball + `bodyScale` / `bodyOffset` /
`bodyRotation`), writes the 256px bodies to `assets/characters/` and the
sizing to `src/characters-data.js` (generated — don't hand-edit), and copies
`assets/music/*.mp3`. Arm styles per character are in `src/heads.js`;
the opening song per board theme is in `src/music.js`.

**Original Swingers heads** — the 8 generated robot heads (white robots,
tinted to the player color at runtime) appear when the setting is on. To add
another, drop a PNG in `assets/heads/` and register it in `src/main.js`:

```js
import { registerSpriteHead } from './heads.js';
registerSpriteHead('assets/heads/mine.png', 'mine');
```

It appears in the lobby face picker and is drawn scaled to the body circle.

**Boards** — `src/levels.js` is plain data (centers + sizes, y grows down):
`solids` (add `deadly: true` for spikes, `grab: false` for slippery,
`ice: true` for slick + ungrabbable, `bounce: 16` for a trampoline,
`crumble: true` for blocks that fall away when touched, `angle` for slopes),
`ropes`, `balloons`, `movers`, `spinners`, `powerups`, `winds` (gust /
updraft zones, optionally pulsing), `checkpoints`, `texts`. Rules of
thumb: a standing robot latches ~120 px above the ground it stands on and
~90 px around its body while hanging; keep climbs under that and make bigger
leaps swing-assisted.

**Feel** — every physics constant (arm force, grab range, punch power,
respawn timing...) lives in `CFG` at the top of `src/player.js`.

## Code map

| File | What's in it |
| --- | --- |
| `src/player.js` | the control system: arms, latching, swing motor, punch |
| `src/level.js` | builds/updates/draws boards (ropes, balloons, movers...) |
| `src/levels.js` | the practice playground + 30 board definitions (data only) |
| `src/game.js` | lobby → countdown → race → results → podium, HUD |
| `src/input.js` | Gamepad API + keyboard as identical virtual controllers |
| `src/heads.js` | the character roster (Rounders cast + optional originals), body drawing, arm styles |
| `src/characters-data.js` | Rounders body sizing (generated by `tools/import_rounders.mjs`) |
| `src/music.js`, `src/settings.js` | soundtrack playback, saved settings |
| `src/particles.js`, `src/audio.js`, `src/util.js`, `src/main.js` | fx, synth sfx, helpers, boot |
| `lib/matter.min.js` | vendored Matter.js 0.20.0 (MIT) |
