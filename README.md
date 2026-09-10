# Echo Loop

> **v1.0.0 — complete MVP.** Title screen → level select → 10 levels across 2 chapters → win screens, with full procedural audio and persistent star ratings.

Echo Loop is a 2D puzzle-platformer where every level is a fixed-length time
loop. Your run is recorded as raw inputs; when the timer runs out the level
resets and your run comes back as an "echo" that re-performs it alongside you.
Stack it up: your past selves hold the switches that let your present self
through.

Vanilla JavaScript + Canvas 2D. **No frameworks, no backend, no network calls,
no asset files, no dependencies at runtime** — the entire game builds to a
single self-contained `index.html`.

```bash
npm install && npm run dev     # play locally
npm run build                  # -> dist/index.html (one file, deploy anywhere)
```

## Controls

| Action           | Keys                            |
| ---------------- | ------------------------------- |
| Move             | ArrowLeft / A, ArrowRight / D   |
| Jump             | Space / W / ArrowUp             |
| Interact         | E (reserved, unused so far)     |
| Quick-restart    | **R** — abort the attempt, keep banked echoes |
| Full level reset | **Shift + R** — clear every echo |
| Back out          | **Esc** — gameplay → level select → title |
| Mute / unmute    | **M** (or click the speaker icon) |
| Menus            | Arrows / mouse to move, **Enter** / click to choose |

## Screens & progress

```
Title  ──Play──▶  Level Select  ──pick──▶  Gameplay  ──reach goal──▶  Level Complete
  ▲                   ▲    ▲                                            │  │  │
  └──────Esc──────────┘    └──────────Levels / Next Level───────────────┘  │  │
                                          └────────────Retry───────────────┘  │
                                                                    (saved here)
```

The game opens on the **title screen** (wordmark, Play, a sound toggle and a
version line, with a live square trailed by two echoes drifting behind it).
Play opens the **level-select grid**: all 10 levels grouped by chapter, each
tile showing its saved star rating and your personal best, plus a running
`★ n / 30` total. Solving a level shows the **level-complete overlay** — stars
popping in one by one, the echoes and time you used, and **Retry / Next Level /
Levels** buttons (Next is disabled on the last level). The frozen level stays
visible behind it, so you can still see the echoes holding the switches that
let you through.

Ratings are written to `localStorage` the instant the goal is reached, so
**progress survives a page reload**.

## Audio

**Every sound is synthesised at runtime with the native Web Audio API — there
are no audio files in this project.** Nothing is downloaded, nothing is
licensed, nothing requires attribution, and the bundle grows by zero bytes.
No third-party audio library and no external/CC0 asset packs were used, so
there is nothing to attribute.

| Cue | Sound |
| --- | ----- |
| **Jump** | sine blip gliding 220 → 440 Hz over ~120 ms (echo jumps play at 40% volume so ghosts stay secondary) |
| **Switch activated** | bright two-note triangle chime (A5 → C♯6), fired on the plate's *rising edge* only |
| **Loop reset** | warm rolled A-minor arpeggio (A3–C4–E4, ~400 ms), on every rewind — timeout and quick-restart alike |
| **Level solved** | ascending A-major arpeggio (A4–C♯5–E5–A5) with the last note ringing out |
| **Ambient bed** | two detuned sine voices on A2 plus a quiet fifth and a barely-there minor third, low-passed at 700 Hz, with a 0.05 Hz LFO breathing the level — subtle, minimal, slightly melancholic |

The pad starts on entering gameplay and stops on leaving it (and steps aside
for the victory fanfare). Mute is toggled with **M** or the on-canvas speaker
icon, and the preference is persisted in `localStorage` alongside star
ratings — under its own `echoLoop.settings` key, deliberately *not* inside the
progress blob (`getAllProgress()` treats every top-level entry there as a level
record, so a stray `muted` field would become a phantom level).

Two practical details: browsers forbid starting an `AudioContext` before a user
gesture, so the context is created lazily on the first click/keypress; and
identical cues are throttled, so a player and two echoes jumping on the same
tick produce one blip rather than three stacked ones.

## Chapter 2 — moving platforms

Steel decks with an amber top edge slide along a fixed path. They are solid to
land and stand on, and they **carry whatever is riding them** — including your
echoes, which is the whole point: a platform is in the same place at tick N of
every loop, so an echo that rode it while recording rides it identically on
replay.

| Level | Teaches | Intended solution |
| ----- | ------- | ----------------- |
| **2-1** | Lifts scoop you up | Loop 1: hold the floor plate. Loop 2: walk right, wait at the wall, ride the lift to the terrace. |
| **2-2** | One echo per direction | Loop 1: hold **LEFT** — ride the west lift and park on the high plate. Loop 2: hold **RIGHT** — ride the east lift to the goal. |
| **2-3** | Ferries; standing still is a move | Loop 1: hold RIGHT onto the floor plate. Loop 2: step onto the ferry, **stand still** while it crosses, then walk off east. |
| **2-4** | Two lifts, two plates, one gate | Loop 1: hold LEFT (west plate). Loop 2: hold RIGHT — you hold the east plate yourself, the gate opens, walk on to the goal. |
| **2-5** | Everything at once | Loop 1: LEFT. Loop 2: RIGHT. Loop 3: stand still on the centre lift and ride it to the summit between your two echoes. |

Two design rules keep the platforming fair rather than frame-perfect: a lift's
apex sits ~20px **above** the ledge it serves (turning a one-tick step-off into
a ~30-tick window), and every lift has a wall on the side you exit toward, so
simply *holding a direction* presses you against it for the whole ride and
walks you out at the top. Measured windows are 0.5–3 seconds.

### Star ratings

Stars measure *economy of echoes* against each level's `minEchoesForThreeStars`:

| Stars | Condition |
| ----- | --------- |
| ★★★ | solved using **at most** the level's three-star echo target |
| ★★ | solved using exactly **one echo more** than the target |
| ★ | solved at all (any more than that) |

Saves keep your **best** result: a sloppier replay can never downgrade a
rating, and the fewest-echoes and fastest-time records are tracked separately.

## HUD

- **Circular loop timer** (top-center) — a full ring that empties clockwise
  from 12 o'clock as `currentTick` approaches `loopDurationTicks`, with the
  seconds remaining in the middle. It turns red and glows harder in the final
  quarter of the loop, and shows a green ✓ once the level is solved.
- **Echo dots** — one dot per echo slot beneath the timer: filled and glowing
  in that echo's own color for banked echoes, a faded outline for unused
  slots. Dot colors come from a shared palette (`src/render/palette.js`) that
  the world renderer uses too, so "the blue dot" is always the blue ghost.
- **Rewind flash** — every loop reset fires a ~200ms radial flash with two
  outward-sliding scan bands. Cyan for a banked loop, red for an aborted one,
  so the two resets feel different at a glance.

Reaching the teal goal logs `LEVEL SOLVED` and freezes the game (win-screen UI
is a later phase).

### Why R doesn't bank an echo

Quick-restart runs the *exact same reset path* as a natural timeout — world
reset, respawn, clock rewind, fresh recording — and skips only the
freeze-recording-into-an-`Echo` step. An echo represents a loop the player
deliberately spent; a bailed-out attempt is by definition not that. Banking it
would burn one of their limited `maxEchoes` slots on a useless ghost and force
a full restart to clear it. The loop counter still advances, so the attempt
isn't pretended away.

## The five Chapter 1 levels

Each level escalates the same vocabulary: **yellow plates** open **red gates**
(green = open), and a gate wired to several plates needs **all** of them held
at once. Gates are 240px tall against a ~128px jump apex, so they can never be
hopped — plates are the only way through.

| Level | Teaches | Intended solution |
| ----- | ------- | ----------------- |
| **1-1** | A past self can hold a switch for you | Loop 1: stand on the plate. Loop 2: walk through the gate your echo holds open. |
| **1-2** | Two plates, one gate (AND logic) | Loop 1: hold plate A. Loop 2: hold plate B. Loop 3: both echoes hold, you walk. |
| **1-3** | Dependency chains | Loop 1: hold A (opens gate D). Loop 2: echo #1 holds D open **for you** — run through and hold B. Loop 3: both echoes replay, both gates open. |
| **1-4** | Echoes occupy space, not just time | Loop 1: jump onto the ledge plate. Loop 2: hold the ground plate. Loop 3: walk under the ledge and out. |
| **1-5** | Chain + verticality, longer map | Loop 1: hold A. Loop 2: sprint through the gate it opens and jump to the ledge plate. Loop 3: run the whole corridor. |

Press **R** any time to wipe the echoes and retry; **1**–**5** to jump around.

## Install & run

```bash
npm install
npm run dev      # open the printed URL (default http://localhost:5173)
npm run build    # outputs a self-contained dist/index.html
```

## Architecture

- **`GameLoop.js`** — `requestAnimationFrame` + delta-time accumulator,
  simulating at a constant 60Hz (`tick(fixedDt)` 0..N times per frame,
  `render()` once). Fixed timestep is what makes echo replay possible at all:
  a recorded input stream only reproduces the same trajectory if every step
  advances by the same `dt`, regardless of the display's refresh rate.
- **`Movement.js`** — the single source of truth for character physics.
  `applyMovement(body, input, dt)` (run/friction, gravity, edge-triggered
  jump) is called by **both** the live player and every echo, so there is
  exactly one movement implementation that can never drift between them.
  Deterministic: reads only `(body, input, dt)`, no clock, no randomness.
- **`Player.js` / `Echo.js`** — thin bodies over that shared physics. An echo
  stores **inputs, not positions**: `physicsStep(fixedDt, currentLoopTick)`
  looks up `recordedInputs[tick % length]` and runs it through
  `applyMovement`. Because it is really being simulated, an echo reacts to a
  changed world (a door now open) instead of blindly following a path.
- **`LoopManager.js`** — the loop clock and echo stack. Each tick it records
  the live input (`recording[i]` is always the input used on tick `i`), steps
  the player, then steps every echo in lockstep with the same tick index. At
  loop end it calls `level.reset()`, respawns every entity to the level start,
  freezes the recording into an `Echo`, rewinds the clock, and begins a new
  recording — enforcing the level's `maxEchoes` budget (over-budget recordings
  are discarded with a console note). Its `onAfterStep` hook runs after
  everything has moved but before the clock advances, and returning `true`
  halts the loop — that is how a goal touched on a loop's final tick survives
  instead of being erased by the reset.
- **`audio/AudioManager.js`** — procedural synthesis (oscillator → envelope →
  `sfx`/`pad` bus → master), lazy context creation on first gesture, per-cue
  throttling, tab-visibility suspend, and a safe no-op path for every method
  when Web Audio is unavailable — sound can never break gameplay. Gameplay
  events reach it through two **output-only** flags, `body.jumpedThisTick`
  (set in `Movement.js`) and `switch.justPressed` (set in `Level.js`); nothing
  in the simulation ever reads them back, so echo determinism is untouched.
- **`game/MovingPlatform.js`** — a deck whose position is a **pure function of
  the loop tick** (`positionAt(tick)`, a triangle wave), never of accumulated
  real time. That is a hard requirement, not a style choice: echoes replay
  against the tick counter, so if a platform's position drifted by even a few
  pixels between loops, an echo that jumped for it while recording would miss
  it on replay. `updateTo(tick)` also records the per-tick delta that riders
  are carried by. `Level` advances them, includes them in `getSolids()`, and
  `carryRiders()` displaces anything standing on one before physics runs.
- **`storage/SaveData.js`** — all persistence, in one JSON blob under
  `"echoLoop.progress"`. Storage is treated as untrusted and optional: missing
  / disabled / full localStorage and corrupt or hand-edited JSON all degrade
  to sane defaults plus an in-memory fallback (the level select then warns
  that ratings won't persist). **No function here throws.**
- **`game/scoring.js`** — pure star-threshold calculation, so the rule is
  testable independently of the UI.
- **`ui/Menu.js`** — pure focus / hit-test / navigation logic with no drawing
  or DOM references. Directional movement is *geometric* (nearest item in that
  direction, penalising off-axis drift), so the same class drives both the
  level grid and the win-screen button row. Hover syncs focus, so mouse and
  keyboard never disagree about the highlighted item.
- **`screens/*` + `render/ui.js`** — the level-select and level-complete
  screens, plus shared canvas primitives (panels, buttons, star glyphs).
- **`render/HUD.js` + `render/palette.js`** — all on-screen UI, drawn on top
  of the world every frame. The HUD is purely presentational: it reads a
  state snapshot and never mutates it, so it cannot affect the deterministic
  simulation. Its animations run on **real frame time**, not simulation ticks,
  so a fade lasts the same ~200ms no matter how many fixed steps ran that
  frame. `LoopManager.abortLoop()` / `endLoop({ bankEcho })` share one reset
  path, and `onLoopEnd` reports a `reason` (`"timeout"` / `"abort"`) that
  drives the flash color.
- **`Level.js` + `levels/levelData.js`** — levels are plain, JSON-serializable
  data (verified by a round-trip test); `Level` instantiates the runtime
  geometry, plates, gates and goal from one definition. It owns all dynamic
  world state and exposes `getSolids()` (static geometry + only the *closed*
  doors, which is what makes open doors passable), `updateSwitches(entities)`,
  `isGoalReached(entity)`, and the `reset()` that LoopManager calls every loop.
  A plate honours `echoesCanActivate`, and `startsOpen` inverts a gate's logic
  into a hold-to-close door. Dangling `activatesDoorId` references throw at
  load time rather than silently doing nothing.
- **`Input.js`** — keyboard state as a per-tick `{ left, right, jump,
  interact }` snapshot from `getCurrentInputState()`. Game logic never reads
  key events, which is exactly why a recording can be substituted for a human.
- **`Physics.js`** — AABB overlap + `resolveAABBCollision()`, resolving the
  entry face from the entity's start-of-tick position with a smallest-overlap
  fallback. The live player and echoes go through the identical resolver.

### Screen state

`main.js` holds one `gameState` string — `"menu"` → `"select"` → `"playing"` →
`"complete"` — that decides which screen receives input, updates, and draws.
The simulation only ticks in `"playing"`.

One subtlety worth noting: the Enter/Space that starts a level is often still
physically held on the first tick, which would read as a jump. That is fixed
at the **input layer** (`Input.suppressHeldKeys()` ignores already-held keys
until they are released) rather than by patching the player's jump state — so
the recorded input stream never contains the phantom press and echo replay
stays bit-identical.

### Tick order (`main.js`)

`level.updatePlatforms(tick)` + `level.carryRiders()` (the world moves first,
so entities then act against this tick's world) → live player steps + collides
→ each echo steps + collides → `level.updateSwitches()` (a plate is held if
**any** eligible entity overlaps it; gates recompute) → goal check → loop-end
check/reset.

### Why moving platforms are one-way

Platforms are solid from **above** only (`resolveOneWayTop`). This fixed a real
bug rather than dodging one: `resolveAABBCollision` infers which face was hit
from where the *entity* came from, which is meaningless when the entity stood
still and the *platform* moved into it. A lift descending onto a waiting player
was resolved downward into the floor and then, as the overlap grew, ejected
sideways — in testing it shoved the player clean out of the level. Treating
decks as the standard "jump-through" platform removes the entire class of
problem: nothing can be crushed, riders still land, stand, ride and jump off
exactly like static geometry, and you can now hop up through a deck from below.

### Verification

Validated headlessly. Phase 2 (engine): echo replay is **bit-identical** to
the original live run, the echo opens the door on the very same tick the
player did, the live player passes through while the echo holds the plate,
echoes stay in sync on repeat replays, the `maxEchoes` budget is enforced, and
a door re-closing on the player pushes them clear instead of trapping them.

Phase 3 (content): all 5 levels are **played to completion by scripted input
plans**, each solving on the intended loop with the intended number of echoes;
no level can be beaten by a naive first-loop sprint (so the mechanic is truly
required); doors re-shut on loop boundaries; and the jump timing windows in
1-4 / 1-5 were measured at ~22 ticks (≈0.37s) so the platforming is not
frame-perfect. Loader tests cover `echoesCanActivate`, `startsOpen` inversion,
multi-switch AND gates, JSON round-tripping, and invalid-data rejection.

Phase 4 (HUD): quick-restart resets exactly like a timeout but banks nothing,
banked echoes survive an abort and still replay identically afterwards, and
repeated aborts cannot farm echoes past the budget. The HUD was rendered
against a recording fake 2D context to assert the timer arc starts at 12
o'clock, sweeps clockwise, and depletes monotonically (full circle → exactly
π at the midpoint), that dot colors match the world ghost colors, and that the
flash alpha decreases and expires within its 150–250ms budget. All 5 levels
were re-verified as solvable to confirm the HUD never touches the simulation.

Phase 5 (progress/UI): all 5 levels were solved headlessly, scored, saved, and
re-read through a **fresh module instance** to prove ratings survive a reload;
best-result merging was checked to never downgrade a rating. `SaveData` was
attacked with corrupt JSON, a non-object root, out-of-range and junk field
values, write failures (quota/private mode) and a completely absent
`localStorage` — none throw, all degrade to defaults or the memory fallback.
Menu navigation, hit-testing and hover/focus sync were tested on a 3×2 grid,
both screens were rendered against a fake 2D context (asserting tiles stay
on-canvas and never overlap, and that a disabled "Next Level" cannot be
activated), and input suppression was verified to swallow a held menu key —
including its auto-repeat — until a genuine new press.

Phase 6 (moving platforms): platform motion was checked for purity (same tick
⇒ same position, regardless of history) and path bounds; riders were shown to
move **exactly** with a deck's delta while idle and at walk+deck speed while
walking, to stop being carried when they step off, and to jump up through a
deck and land on it. The decisive test records a live player riding a lift for
a whole loop and asserts the resulting echo's trajectory is **bit-identical**
across two further replays, with the platform path identical tick-for-tick.
An anti-crush regression runs 2000 ticks of a lift cycling through a standing
entity, asserting it is never pushed below the floor or ejected from the shaft.
All 10 levels are then played to completion, each earning 3 stars with its
intended plan, with no level beatable by a naive one-loop sprint in any
direction; the level-select grid was verified to lay out 10 non-overlapping
on-canvas tiles across two chapters.

Phase 7 (audio): `AudioManager` was driven against a fake Web Audio
implementation asserting the actual synthesis — the jump voice sweeps 220→440
Hz with an exponential glide, the chime is two rising notes offset in time, the
reset and victory arpeggios ascend and span the intended durations, and no
exponential ramp ever targets exactly `0` (which throws in real browsers).
Also covered: no context exists before a user gesture (and every cue is a safe
no-op until then), 25 simultaneous jumps collapse to one voice, the pad is
detuned/slow/quiet and its start-stop is idempotent, muting produces *zero*
oscillators, mute round-trips through `localStorage` across a reload without
polluting level progress, corrupt settings fall back to defaults, hidden tabs
suspend audio, and a browser with no Web Audio at all breaks nothing. Finally,
the event flags were checked to fire exactly once per jump/activation, echo
replay was re-confirmed **bit-identical**, and all 10 levels still solve at 3
stars.

Phase 8 (release): the decisive check runs the **actual production artifact** —
`dist/index.html` is served over HTTP, its inlined module is extracted and
booted against a DOM stub, then driven through the real key handlers: title →
level select → level 1-1 → played to completion. It solves with one echo,
writes `{"stars":3,"echoesUsed":1,...}` to `localStorage`, persists the mute
toggle, renders the win screen, and logs **zero console errors** start to
finish. The served bytes are byte-identical to the build output and contain no
external references (the only `href` is the empty `data:,` favicon), which is
what makes the deploy path-independent. Also covered: title-screen layout,
navigation and actions; the echo fade reaching full opacity in exactly 12
frames (~200ms); reset feedback ordering (flash ends before the ring pulse,
which settles as the arpeggio ends); and canvas sizing across eight window
shapes, asserting the canvas plus caption always fit vertically, the 16:9
ratio holds, and pointer clicks still map onto internal 960×540 coordinates at
any scale.

## Project structure

```
echo-loop/
  index.html
  vite.config.js
  src/
    main.js             # loads a level by id, wires loop + renders it
    game/
      GameLoop.js       # fixed-timestep loop (rAF + accumulator, 60Hz)
      Input.js          # keyboard -> { left, right, jump, interact }
      Movement.js       # shared character physics (Player + Echo)
      Player.js         # live player body
      Echo.js           # recorded-input ghost of a previous loop
      LoopManager.js    # loop clock, recorder, echo stack, reset
      MovingPlatform.js # tick-pure oscillating platform
      Physics.js        # AABB resolution + one-way platform landing
      scoring.js        # star thresholds
      Level.js          # level loader: runtime geometry/plates/gates/goal
      levels/
        levelData.js    # declarative level definitions (Chapter 1: 1-1..1-5)
    render/
      Renderer.js       # clear() + drawRect(x, y, w, h, color)
      HUD.js            # loop timer ring, echo dots, rewind flash
      palette.js        # shared echo/UI colors (world + HUD agree)
      ui.js             # panels, buttons, star glyphs, text helpers
    screens/
      MainMenuScreen.js      # title screen (entry point)
      LevelSelectScreen.js   # grid of levels + saved stars, by chapter
      LevelCompleteScreen.js # win overlay: stars, stats, navigation
    ui/
      Menu.js           # pure focus/hit-test/navigation logic
    storage/
      SaveData.js       # localStorage-backed progress + settings (never throws)
    audio/
      AudioManager.js   # procedural Web Audio SFX + ambient pad
```

## Deploying for free

`npm run build` inlines **everything** — JS and CSS — into a single
`dist/index.html`. There are no `/assets/*` requests, no fonts to fetch and no
API calls, which has one very convenient consequence: **the build works at any
URL path**, so you never have to set Vite's `base` option, even on a GitHub
Pages project site served from `/<repo>/`.

### GitHub Pages via GitHub Actions (recommended)

The simplest reliable option — no `gh-pages` branch to maintain, no build
output committed to git. Push to `main` and the site redeploys itself.

**1.** Commit this file as `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**2.** Push it:

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Pages deployment"
git push origin main
```

**3.** In your repo: **Settings → Pages → Build and deployment → Source:
`GitHub Actions`**. (Set this once; no branch selection needed.)

**4.** Watch the **Actions** tab. When it finishes, the game is live at
`https://<your-username>.github.io/<your-repo>/`.

> Using `npm ci` requires `package-lock.json` to be committed — it is.

### GitHub Pages without Actions (drag-and-drop simple)

Because the build is one file, you can also just commit it:

```bash
npm run build
mkdir -p docs && cp dist/index.html docs/index.html
git add docs && git commit -m "Publish build" && git push
```

Then set **Settings → Pages → Source: `Deploy from a branch`**, branch `main`,
folder `/docs`. Re-run those three commands whenever you want to publish.

### Vercel / Netlify / Cloudflare Pages

All three free tiers are equally viable drop-in alternatives and need **zero
configuration**: sign in with GitHub, click "Import"/"Add new site" and pick
the repo. Each one auto-detects Vite and fills in the build command
(`npm run build`) and output directory (`dist`) for you — just accept the
defaults and deploy. You get automatic redeploys on every push and a free
HTTPS subdomain, exactly like the Actions workflow above. Since the game is
purely static with no server code, no environment variables or secrets are
needed anywhere.

### Verifying a build locally

```bash
npm run build
npx serve dist          # or: npx http-server dist, or: python3 -m http.server -d dist
```

Open the printed URL. Star ratings are written to `localStorage`, so they
persist per-origin — note that `file://` origins are treated inconsistently by
browsers, so always test through a local server rather than double-clicking
the HTML file.

## Level data schema

Levels are plain data in `src/game/levels/levelData.js` — no code, fully
JSON-serializable (there's a test asserting that), so new levels can be
hand-authored without touching the engine. Append an object to the `LEVELS`
array and it appears in the level select automatically.

```js
{
  id: "2-6",                     // unique string id, shown on the tile
  chapter: 2,                    // groups the level in the select screen
  loopDurationTicks: 900,        // loop length; 900 ticks = 15s at the fixed 60Hz step
  maxEchoes: 2,                  // echo budget; further recordings are discarded
  minEchoesForThreeStars: 1,     // three-star target (see Star ratings)
  playerStart: { x: 60, y: 440 },// top-left spawn of the 22x30 player

  geometry: [                    // static solid rectangles
    { x: 0, y: 500, w: 960, h: 40, type: "solid" },
  ],

  switches: [{                   // pressure plates
    id: "sw1",
    x: 240, y: 484, w: 140, h: 16,
    activatesDoorId: "gate1",    // which door this plate is wired to
    echoesCanActivate: true,     // false => only the live player can press it
  }],

  doors: [{                      // gates
    id: "gate1",
    x: 660, y: 260, w: 26, h: 240,
    startsOpen: false,           // true => a hold-to-CLOSE gate (logic inverts)
  }],

  movingPlatforms: [{            // optional; omit for a Chapter 1-style level
    id: "lift1",
    x: 660, y: 500, w: 110, h: 20,   // the path ANCHOR (position at offset 0)
    pathType: "vertical",            // "horizontal" | "vertical"
    range: 220,                      // path length in px; negative flips direction
    speed: 1.4,                      // PIXELS PER TICK (not per second)
    startOffset: 0,                  // phase offset in px along the path
  }],

  goal: { x: 850, y: 240, w: 40, h: 60 },  // touch it with the live player to win
}
```

### Field reference

| Field | Meaning |
| ----- | ------- |
| `id` / `chapter` | Identity and grouping. Ids must be unique. |
| `loopDurationTicks` | Ticks before the loop rewinds. The sim runs at a fixed 60Hz, so `ticks / 60 = seconds`. |
| `maxEchoes` | How many past runs can be banked at once. Once full, later recordings are discarded. |
| `minEchoesForThreeStars` | Echo count for a 3-star rating; `+1` scores 2 stars, anything more scores 1. |
| `playerStart` | Spawn point, shared by the player and every echo. Keep it clear of geometry. |
| `geometry[]` | Always-solid rectangles. Only `type: "solid"` is collidable today. |
| `switches[]` | Non-solid plates. Held while **any** eligible entity's AABB overlaps. |
| `switches[].activatesDoorId` | Must match a door `id`, or the level throws on load (deliberately loud). |
| `switches[].echoesCanActivate` | Defaults to `true`; set `false` to require the live player. |
| `doors[]` | Solid while closed, removed from collision while open. |
| `doors[].startsOpen` | Inverts the wiring into a hold-to-close gate. |
| `movingPlatforms[]` | One-way platforms (solid from above) that carry riders. Position is a pure function of the loop tick. |
| `goal` | Win trigger. Only the **live** player can finish a level. |

### Authoring rules of thumb

- **A door wired to several switches needs all of them held** (AND logic).
  Never require more simultaneous holds than `maxEchoes`, or the level is
  unsolvable — the last actor has to be free to walk to the goal.
- **Gates should be ~240px tall** on the standard `y: 500` floor. A jump peaks
  at ~128px, so anything shorter can simply be hopped over.
- **Put a lift's apex ~20px above the ledge it serves.** Level with the ledge,
  the rider can only step off on a single tick; the overshoot turns that into
  a comfortable ~30-tick window.
- **Anchor lifts inside the floor slab** (`y: 500`) so they rise up through it
  and scoop up whatever is standing over them, and **put a wall on the side
  the rider exits toward** — then simply holding a direction rides the lift and
  walks the rider off at the top, no timing required.
- Test a new level by pressing its number key on the level-select grid.

## Roadmap

- [x] Phase 0 — scaffold, one static rectangle
- [x] Phase 1 — fixed-timestep loop, input, movement physics
- [x] Phase 2 — echo record / replay / stack, switch + door
- [x] Phase 3 — level data schema & loader, 5 Chapter 1 levels
- [x] Phase 4 — HUD (loop timer, echo dots), quick-restart, rewind flash
- [x] Phase 5 — star ratings + localStorage, level select, level-complete screen
- [x] Phase 6 — moving platforms + 5 Chapter 2 levels
- [x] Phase 7 — procedural audio, ambient pad, persisted mute
- [x] Phase 8 — title screen, polish pass, production build, deploy docs

**v1.0.0 — the MVP is complete.** Deliberately out of scope (candidates for
future work): hazards/spikes, echo variants, a level editor, leaderboards,
replay-clip export, daily challenges, and mobile touch controls. The input
layer was built as a swappable `getCurrentInputState()` snapshot specifically
so touch controls can be added later without touching game logic.
