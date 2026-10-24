# Agent guidance for SWINGERS

## Deploy state: **DISABLED**

This switch overrides every other instruction in this file about pushing,
merging or fast-forwarding `main`, opening or merging pull requests into it,
and deploying.

- **DISABLED** means `main` is frozen to save GitHub Actions minutes:
  - Commit your work and push **only your working branch** (name it
    `claude/<topic>`; pushes to a working branch run no workflows). Never push,
    merge or fast-forward `main`, and don't merge pull requests into it.
  - Run tests and builds locally as usual (they cost no Actions minutes).
  - End every change with this warning to the owner:
    > ⚠️ Deploys are disabled for this repo: the change is on branch
    > `<branch>`, NOT on `main`, and NOT deployed.
- **ENABLED** means follow the normal push and deploy rules in this file.
- **Turning deploys on** happens only when the owner explicitly asks for a push
  to `main` (or to enable deploys). Then:
  1. Change the heading above to `**ENABLED**` (this is what lets the push
     guard below allow the push).
  2. Merge the pending work: `git fetch origin && git branch -r --no-merged
     origin/main` lists it. Merge oldest first, resolve conflicts, and run the
     tests.
  3. Push `main` once; that push deploys. If the owner disabled the deploy
     workflow in the Actions tab, remind them to re-enable it.
- **Turning deploys off**, when the owner asks: change the heading to
  `**DISABLED**`, commit only that change with `[skip ci]` in the message (so
  the push runs no workflow), and push `main`.
- `.claude/hooks/deploy-guard.sh` enforces this for Claude sessions: while the
  heading says DISABLED it refuses a `git push` to `main` and pull-request
  merges into it, except a `[skip ci]` push that changes only this file and
  `.claude/` (config, no workflow runs). It
  reads the heading at the moment of the push, so flipping it to ENABLED is all
  it takes to let the push through.

## Workflow

- **Always commit to `main` when you finish a task**, and push it. This
  includes docs the owner works from (e.g. `image-requests.md`): they need
  to be on `main` to start using them. If you were working on a feature
  branch, merge it into `main` (fast-forward when possible) and push both.

## Project notes

- No build step: static HTML5/canvas + vendored Matter.js. Serve with
  `python3 -m http.server 8123` (ES modules need http, not `file://`).
- Boards are plain data in `src/levels.js`; the format (solids, ropes,
  balloons, movers, spinners, winds, checkpoints...) is documented at the
  top of `src/level.js`, and measured reach limits at the top of
  `src/levels.js`. Keep each board's challenge distinct from the others.
- `window.__hh` is the live Game; with `__hh.input.mock`, `player.teleport`
  and `__hh.step(1/60)` you can run headless physics probes in Playwright
  to check that a jump, bounce or swing actually lands.
- Swingers is a Rounders spinoff: the cast and music come from the
  `hoai2k/rounders` repo via `node tools/import_rounders.mjs <rounders
  checkout>`. Never hand-edit `src/characters-data.js` — it records the
  body sizing Rounders resolves (fitted ball + the owner's /workbench
  `bodyScale`/`bodyOffset`/`bodyRotation` overrides); re-run the import
  instead. Rounders characters face left/right with the stick and stay
  upright; original Swingers heads roll with the ball. Facing flips only in
  gameplay — non-gameplay animation (title swingers etc.) keeps a fixed facing.
- Guns (`src/guns.js`): grabbed with a trigger, fired with that hand's
  bumper, and locked to the forearm at the angle they were grabbed (wobbly
  aiming is intended). Recoil must never break the shooter's grip; a hit
  breaks the victim's grips and knocks them back but doesn't kill.
- Power-ups (`src/powerups.js`) spawn at random; the rate is a setting
  (off / normal / frequent).
- Settings (`src/settings.js`, localStorage) — Original Swingers defaults
  OFF. Sound must stay muted while the tab is hidden/unfocused.
- Image asset requests for the owner live in `image-requests.md`. Generated
  originals are in `assets/{bg,heads,tiles,ui}`; after any change there run
  `python3 tools/build_assets.py` to rebuild the web copies in
  `assets/web/` that `src/art.js` actually loads. Every image the game loads
  must go through `track()` (`src/preload.js`) so the boot loading bar waits
  for it — the title never shows stand-in drawings.

## Spider Swingers (`spiders/`)

- A second game in the same repo, served at `/spiders/`: a Spider Heck-style
  brawler (wall-walking spiders, webs, plasma sabers, 15 weapons, VS and
  wave survival, up to 8 Xbox pads + keyboard/mouse). Same rules: no build
  step, open `http://localhost:8123/spiders/`.
- It reuses the Rounders cast (`../src/characters-data.js`,
  `../assets/characters`), the music and the shared theme art in
  `../assets/web/`; never copy those into `spiders/`.
- `window.__sp` is the live Game (`manual = true`, `input.mock = [{id, ...}]`,
  `step(1/60)`); `spiders/tools/probe-example.cjs` shows a headless probe.
- Module map: `game.js` (API block at the top), `spider.js` (movement, webs,
  legs), `physics.js` (terrain), `weapons.js` + `weapons/*.js`,
  `boards.js` (10 boards; format in `board.js`), `modes/vs.js`,
  `modes/survival.js` + `enemies/`, `lobby.js`, `title.js`, `ui.js`,
  `pause.js`, `hud.js`.
- Its image requests live in `spiders/image-requests.md`; delivered files go
  in `spiders/assets/web/` and must be listed in its `manifest.json`.

## Tests and deploys

Pushes to `main` build and deploy only; they run no tests. Tests are your job
before you commit:

- There are no automated tests; check the change in a browser (local server)
  before committing. A change to a board can also be checked with the headless
  physics probes described under *Project notes* (`window.__hh`).
- Say in the commit message what you ran and that it passed.

Every deploy is paid for in GitHub Actions minutes while the repository is
private, so batch a task's work into one push to `main` at the end rather than
pushing after every small step. Pushes to a working branch run nothing. A newer
push cancels a deploy still in progress, so a burst of pushes publishes only the
last one.

## Models

- Only a session already running on Fable may start Fable subagents, workers or helper agents. Opus,
  Sonnet and every other model never pass model "fable"; they leave the model unset so it inherits, or
  pick Opus or Sonnet.
- Don't switch a session to Fable on your own. If a task seems to need Fable, ask me first and say why.
- This is enforced in `.claude/settings.json`: sessions in this repository default to Opus, and a
  PreToolUse hook (`.claude/hooks/block-fable.sh`) reads the calling model from the transcript and
  refuses a subagent or workflow call that asks for Fable unless the caller is itself Fable. When I ask
  for Fable, switch the main session with `/model`; don't edit the hook to get round it.
