# SWINGERS

A local-competition physics party game in the spirit of **Heave Ho** — up to 4
players on Xbox controllers race grabby round robots across 8 boards of
platforms, ropes, spinners, balloons, moving ferries and spikes. Pure
HTML5/canvas + [Matter.js](https://brm.io/matter-js/) (vendored), no build
step.

## Run it

Any static file server works (ES modules need http, not `file://`):

```bash
python3 -m http.server 8123      # then open http://localhost:8123
# or: npx serve
```

Connect controllers, press **A** to join, **START** to race.

## Controls (Xbox layout)

| Input | Action |
| --- | --- |
| **Left stick** | left arm — point it where you want the hand |
| **Right stick** | right arm (one stick steers both arms if the other is idle) |
| **LT / LB (hold)** | close left hand — latches onto anything it touches |
| **RT / RB (hold)** | close right hand |
| **B** | punch — knocks nearby players flying and breaks their grip |
| **START** | pause (X restart board, BACK quit to lobby) |

Keyboard (for testing / a 5th friend): **WASD** + **Arrows** = sticks,
**LShift/Q** + **RShift/E** = grabs, **Space** = punch, **Enter** = A,
**Esc** = START, **1/2** = pick a face. Dev keys: **R** restart board,
**N** skip board, **M** mute.

### How movement works (the whole game)

Your robot is a ball with two physically simulated noodle arms (4 jointed
segments each, left and right attached at opposite shoulders). Free arms
point along the stick (magnitude matters — a half-tilted stick half-extends
the arm). The moment a hand grips, **the stick steers your body: push where
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

Hands stick to the first thing they touch while the trigger is held —
including other players' bodies and hands (human chains work). Punch (B)
knocks players flying and breaks their grip; grab a ⭐ glove for a super
punch.

## The race

Everyone spawns together; first to the **GOAL** ring scores 5, then 3/2/1.
Once someone finishes the rest have 15 seconds. Spikes/lava/falling = respawn
at the start (costs time, not points). Most points after board 8 wins.

Boards: Grab School → The Wall → Monkey Bars → Rope Chasm → Spin Cycle →
Balloon Ascent → Lava Ferry → The Gauntlet.

## Customizing

**Head sprites** — heads are placeholder solid circles with faces. Drop a PNG
in `assets/heads/` and register it in `src/main.js`:

```js
import { registerSpriteHead } from './heads.js';
registerSpriteHead('assets/heads/mine.png', 'mine');
```

It appears in the lobby face picker and is drawn scaled to the body circle.

**Boards** — `src/levels.js` is plain data (centers + sizes, y grows down):
`solids` (add `deadly: true` for spikes, `grab: false` for slippery),
`ropes`, `balloons`, `movers`, `spinners`, `powerups`, `texts`. Rules of
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
| `src/levels.js` | the 8 board definitions (data only) |
| `src/game.js` | lobby → countdown → race → results → podium, HUD |
| `src/input.js` | Gamepad API + keyboard as identical virtual controllers |
| `src/heads.js` | head styles + future sprite registry |
| `src/particles.js`, `src/audio.js`, `src/util.js`, `src/main.js` | fx, synth sfx, helpers, boot |
| `lib/matter.min.js` | vendored Matter.js 0.20.0 (MIT) |
