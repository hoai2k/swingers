# Agent guidance for SWINGERS

## Deploy state: **ENABLED**

Deploy branch: `deploy`

This repository deploys from the `deploy` branch, not from `main`. Pushing to
`main` runs no workflow and costs nothing; the site is published only when
`deploy` is moved forward to `main`. This switch overrides every other
instruction in this file about deploying.

- **ENABLED** means deploy after every change, exactly as before the deploy
  branch existed: commit, push `main` as the rest of this file says, then
  publish it with `git push origin main:deploy`. That push deploys. A deploy
  that is already running always finishes, and pushes waiting behind it
  collapse into the newest one.
- **DISABLED** means deploys are off to save GitHub Actions minutes. Commit and
  push `main` as usual, so finished work still lands on `main`, but never push,
  merge or fast-forward `deploy`. End every change with this warning to the
  owner:
  > ⚠️ Deploys are disabled for this repo: the change is on `main` but NOT
  > deployed. The live site is still whatever `deploy` holds.
- **Turning deploys on** happens only when the owner explicitly asks to deploy,
  to enable deploys, or for a push to `main` that should go live. Change the
  heading above to `**ENABLED**`, commit and push `main`, then
  `git push origin main:deploy`. If the owner disabled the deploy workflow in
  the Actions tab, remind them to re-enable it.
- **Turning deploys off**, when the owner asks: change the heading to
  `**DISABLED**`, commit and push `main`. It costs nothing.
- `git push origin main:deploy` is always a fast-forward. Never force-push
  `deploy`. If the push is refused, `deploy` has commits `main` lacks: merge
  `origin/deploy` into `main` first, then push both.
- `.claude/hooks/deploy-guard.sh` enforces this for Claude sessions: while the
  heading says DISABLED it refuses any push to `deploy`. It reads the heading
  at the moment of the push, so flipping it to ENABLED is all it takes to let
  the push through.

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
- Image asset requests for the owner live in `image-requests.md` (each game folder
  has its own, e.g. `battles/image-requests.md`, with delivered rounds in a history
  doc). Commit new requests **early**, in their own small commit that touches only
  the requests doc, before building the feature that uses them, so the art can be
  generated in parallel; agents in worktrees should tell the coordinator so it can
  push that commit right away. Generated
  originals are in `assets/{bg,heads,tiles,ui}`; after any change there run
  `python3 tools/build_assets.py` to rebuild the web copies in
  `assets/web/` that `src/art.js` actually loads. Every image the game loads
  must go through `track()` (`src/preload.js`) so the boot loading bar waits
  for it — the title never shows stand-in drawings.

## Invite gate

- Every game (`/`, `wobblers/`, `spiders/`, `battles/`) boots through
  `src/boot.js`, which opens the shared invite door (`gate/gate.js`) and then
  imports `main.js`. `gate/gate.js` is a byte-identical copy of the gate the
  `hoai2k/mini` games carry (`sites/shared/gate.js` there): never edit it
  here — copy the new version over from mini when it changes.
- The door is off on localhost (append `?gatetest=1` to see it), so local
  testing and headless probes never meet it. `?gatereset=1` forgets a pass.
- The games are prototypes (`ignorePublicAccess: true`); each game's
  `public-access.json` (`{ "followPublicAccess": false }`) can be flipped to
  `true` to let the owner's public-access switch open it.
- A new game in this repo gets the same `src/boot.js` + `public-access.json`
  and loads `src/boot.js` from its `index.html` instead of `main.js`.

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

Deploys (pushes to `deploy`) build and publish only; they run no tests. Tests
are your job before you commit:

- There are no automated tests; check the change in a browser (local server)
  before committing. A change to a board can also be checked with the headless
  physics probes described under *Project notes* (`window.__hh`).
- Say in the commit message what you ran and that it passed.

Every deploy is paid for in GitHub Actions minutes while the repository is
private, so batch a task's work into one deploy at the end rather than
deploying after every small step. Pushes to `main` and to working branches run
nothing. A
deploy that is already running always finishes — never cancel one unless the
owner asks — and pushes waiting behind it collapse into the newest one. The
deploy job also carries a `timeout-minutes`, so a hung run cannot bill for hours. Pushes that only change docs (`*.md`, image
requests), `tools/`, `.claude/` or art source files (`originals/`,
`reference/`) don't deploy at all (`paths-ignore` in
`.github/workflows/deploy.yml`), so no `[skip ci]` is needed for them. The
deploy uploads only what the games load: the workflow's "Assemble site" step
leaves out docs, tools, agent files and unloaded art, and the uploaded artifact
is deleted once Pages has it. Keep new non-site files out of it the same way.

## Models

- Only a session already running on Fable may start Fable subagents, workers or helper agents. Opus,
  Sonnet and every other model never pass model "fable"; they leave the model unset so it inherits, or
  pick Opus or Sonnet.
- Don't switch a session to Fable on your own. If a task seems to need Fable, ask me first and say why.
- This is enforced in `.claude/settings.json`: sessions in this repository default to Opus, and a
  PreToolUse hook (`.claude/hooks/block-fable.sh`) reads the calling model from the transcript and
  refuses a subagent or workflow call that asks for Fable unless the caller is itself Fable. When I ask
  for Fable, switch the main session with `/model`; don't edit the hook to get round it.
