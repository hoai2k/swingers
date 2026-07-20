# SWINGERS

A local-competition physics party game in the spirit of **Heave Ho** — up to 4
players on Xbox controllers race grabby round robots across 30 boards of
platforms, ropes, spinners, balloons, moving ferries and spikes. Pure
HTML5/canvas + [Matter.js](https://brm.io/matter-js/) (vendored), no build
step.

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
**1/2** = pick a face. In the pause menu, **Backspace** (or **Space**)
quits to the menu, **X** restarts. Dev keys: **R** restart board,
**N** skip board, **M** mute.

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
the route. **Easy** teaches one mechanic with safe floors (Grab School,
Stepping Stones, Rope Garden, Gentle Spin...). **Medium** adds spikes and
combinations (Monkey Bars, Pendulum Alley, Balloon Chimney, Windmill
Pass...). **Hard** demands chained techniques over mostly-lethal ground
(Spike Ceiling, Spinner Gauntlet, Clock Tower, Razor Run, Summit...).
Every board carries an authored solution route checked against measured
physics reach envelopes (see the design rules atop `src/levels.js`), so
every board is completable. The reverse is checked too: a reachability
audit verifies there's no *trivial* path — boundary walls have unclimbable
gaps where they'd otherwise be free ladders, and safe floors never lead to
a cheap hop onto the goal.

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
| `src/levels.js` | the practice playground + 30 board definitions (data only) |
| `src/game.js` | lobby → countdown → race → results → podium, HUD |
| `src/input.js` | Gamepad API + keyboard as identical virtual controllers |
| `src/heads.js` | head styles + future sprite registry |
| `src/particles.js`, `src/audio.js`, `src/util.js`, `src/main.js` | fx, synth sfx, helpers, boot |
| `lib/matter.min.js` | vendored Matter.js 0.20.0 (MIT) |
