# Agent log

Append-only. One entry per session that makes a decision worth another
session knowing about. Newest at the bottom. One or two lines: what you
decided and why --- not a full narration of what you did.

Format, and the tag is not optional:

    - **Role** [#3 #8] --- what you decided, and why.

The `[#n]` list is the issues the decision constrains. `pnpm check:dispatch <n>`
selects entries by that tag and prints them to be pasted into that issue's
Builder prompt, so the log is *delivered* rather than merely findable --- an
untagged entry reaches nobody, and `check:dispatch` warns about it. Tag an
entry with every issue a Builder would get wrong without it, not with the
issue you happened to be working on.

Read the tail of this before starting work if you were told to act as a
role without other context (see CLAUDE.md, "Multi-model workflow").

---

- **Architect** [#9] — cut `notes/idea.md` from 10 min / 5 mechanics to ~3.5 min /
  2 mechanics (size + rewind). The C5 spec requires a stranger to reach an
  ending in 5 minutes and calls two interacting mechanics the better move;
  idea.md's five would each lose their wordless "demonstrate → require" beat.
  Cut: enemies, limited vision, music, checkpoints, side paths.
- **Architect** [#7 #8 #9] — idea.md §15/§19 is explicitly *unlosable* (no lives, no game
  over, softlocks designed out), which fails the spec's "it can be lost" line
  outright. Inverted it: permanent destruction + player-only rewind means a
  wrong break makes the exit unreachable, and *that* is the loss condition.
  One loss channel, zero twitch skill, and it is the design's own centre.
- **Architect** [#7 #8] — loss is evaluated at runtime by small **authored fatal
  predicates** per room, not by a general solver. A general reachability BFS
  exists but is **test-only** (`spec/solver.test.ts`), verifying the predicates
  are neither too eager nor too lax. Runtime stays exact and trivial; the
  expensive verification lives in `pnpm check`. This is deliberately the crit's
  own theme — tests and human judgement doing different jobs.
- **Architect** [#3 #4 #5 #6 #7 #8] — no engine (rejected Phaser / Kaplay / LittleJS / Tiled). The
  reason is harness, not purity: the graded automated test needs game rules
  importable into vitest with no canvas, and every engine hides them behind a
  DOM-dependent runtime. Hence the hard rule that `rules`/`physics`/`world`/
  `solver` touch no browser API and use no randomness or clock reads.
- **Architect** [#1 #10] — idea.md says "landscape only" but marking is Chrome at
  1920×1080 **and 390×844 portrait**, both counting fully. Portrait is
  first-class: canvas band at the top, touch pads below.
- **Architect** [#1 #12 #14] — a fullscreen-canvas rewrite would break three shipped
  invariants. `<h1>` is the title card as real DOM text, `<nav>` stays, and the
  no-instructions rule extends to `README.md` and the meta description —
  enforced by a new sensor in issue 12.
- **Architect (revision, prompted by Ritesh)** [#2 #9 #14] — first pass said "procedural
  canvas drawing", which silently dropped `idea.md` §21–22's actual tileset.
  Corrected: a real 10×10 tile atlas, authored as character-grid literals in
  TS and baked to an offscreen canvas at boot. Under a no-tutorial rule visual
  legibility *is* the tutorial, so rects were too thin an instrument — a player
  must tell fragile from solid with no text to help. Generated rather than a
  PNG keeps zero binary assets, no Pages `base`-path risk, no license audit,
  and makes the art **testable**: `spec/legibility.test.ts` asserts fragile vs
  solid differ by ≥25% of pixels and that the three mechanic colours never
  appear in terrain. `TILE = 10` is load-bearing; the CC0 (Kenney) fallback is
  16 px and would force re-checking every clearance constant, so that call must
  be made before issue 9, never after.
- **Architect** [#2 #3 #7 #8 #9] — §11's list is mostly convenience, but four orderings are hard
  constraints and a Builder should not reshuffle them: **3 before 8** (the
  solver's jump-arc table is derived from the physics constants, not
  hand-copied — building 8 first means inventing numbers that then drift);
  **7 immediately before 8** (they are a pair — predicates without the solver
  are unverified, the solver without predicates has nothing to check);
  **2, 4, 5, 6 all before 9** (room geometry encodes clearance and destruction
  semantics, so authoring rooms against guesses means re-authoring them); and
  **issue 2's tileset fallback resolved before 9** for the same reason — a
  `TILE` change from 10 to 16 invalidates every room. Everything else floats:
  10, 11, 12 and 13 depend only on 1 and can be taken in any order, or in
  parallel by separate sessions.
- **Orchestrator** [#12] — added a gate between the Architect pass and the first
  Builder: check `git status`, the issue bodies as stored, and the log tail
  before dispatching. Caught four things at once (untracked `plan.md` that
  every issue's first line points at, an uncommitted stack migration a Builder
  would have fused with its own diff, escaped backticks in twelve of thirteen
  issue bodies, and the log gap). `CLAUDE.md`'s cut of a fourth role was aimed
  at per-issue review, which reloads context; a once-per-phase gate only
  inspects state, so it doesn't pay that cost. Drafted in
  `notes/process-moments.md`; the `CLAUDE.md` wording goes in the next batched
  harness change, not ad hoc now.
- **Orchestrator (harness batch)** [#12] — wired the pre-dispatch gate into
  `pnpm check:dispatch` rather than leaving it as a habit: clean tree,
  `plan.md` tracked, log-lag by git ancestry (not mtime, which rebases break),
  and issue bodies checked as stored rather than as rendered. Log entries now
  carry `[#n]` tags and the gate *prints* the matching ones for pasting into
  the Builder's prompt --- the read side was the actual failure, since a log
  that is written but not consulted fails silently and no sensor can catch it.
  Rejected a pre-commit hook that blocks commits missing a log entry: it would
  fire on every typo fix, and a hook people learn to `--no-verify` past is
  worse than no hook.
- **Builder-Tester** [#2 #7 #9 #10 #12] — built issue 1's shell: `src/game/layout.ts`
  (pure, `layout(w,h) -> {scale, canvasRect, controlsRect}`) and `src/game/loop.ts`
  (pure fixed-60Hz accumulator, single division + epsilon rather than repeated
  subtraction so float drift can't silently drop a step). `main.ts` is the only
  wiring: creates the 320x180 canvas, sets `imageSmoothingEnabled = false`,
  drives `requestAnimationFrame` + `performance.now()`, and lays out `#game-shell`
  / `#game-canvas` / `#game-controls` from `layout()`. Portrait's controls band
  is an empty styled div for now — issue 10 fills in the actual pads; issue 9's
  rooms and issue 2's render/tileset both render into the same canvas/step hook
  this main.ts already drives. `<h1>Remnant</h1>` is the visible title-card text
  now (was the template placeholder) — issue 12 still owns the head block
  (title/description/card) and the no-instructions sensor, so don't re-touch
  the `<head>` or README for that; just know the h1 text is claimed.
- **Builder-Tester** [#1 #9 #10] — resize computes available height as
  `window.innerHeight - shell.getBoundingClientRect().top`, not the raw window
  height, so the header/h1 above the canvas doesn't push the page into a
  vertical scrollbar on short viewports (e.g. 390x844 minus the header). Any
  future change to header/h1 height needs no code change here, but a much
  taller header would eat into the ≥200px controls-band floor `layout.ts`
  guarantees — worth a glance if #12's head rewrite changes header height.
- **Builder-Tester** [#1] — blocked on the browser-driving step: the
  claude-in-chrome extension reported "not connected" for the whole session
  (`list_connected_browsers` returned `[]` even after opening Chrome to the dev
  URL), and this sandbox has no screen-recording permission either
  (`screencapture` fails with "could not create image from display"), so no
  visual/console check at 1920x1080 or 390x844 was possible this session.
  Verified what was possible without a browser instead: `pnpm check` green
  (typecheck + build + all 46 vitest cases including the new loop/layout/
  pure-modules specs), and `curl`'d the dev server's `/` and `/src/scripts/
  main.ts` for 200s with the expected `<canvas id="game-canvas">` and single
  `<h1>Remnant</h1>` in the served HTML, with no errors in the `astro dev`
  log. The next session with a working browser connection should still do the
  real visual/console pass at both viewports before trusting this closed.
- **Builder-Tester** [#1] — `spec/pure-modules.test.ts` was vacuously green on
  first pass: its allow-list contained every `.ts` file actually present in
  `src/game` (`layout.ts`, `loop.ts`) plus `main.ts`, which isn't even in that
  directory, so the sensor asserted on zero files. Fixed by narrowing the
  allow-list to `render.ts`/`input.ts` only — the modules not yet built that
  will genuinely need the DOM — since `loop.ts` and `layout.ts` are pure by
  construction (that's *why* they're importable into vitest with no canvas)
  and should be checked like any other pure module, not exempted because
  plan.md's prose lists them as browser-allowed. Confirmed red for the right
  reason first: temporarily added `document.title` to `loop.ts`, watched the
  sensor fail naming `loop.ts` specifically, then reverted before fixing the
  allow-list. Also stripped `//` line comments before matching, so a comment
  merely mentioning a browser API doesn't trip it (block comments and string
  contents are left alone — a parser is more sensor than this needs).
- **Builder-Tester** [#1 #10 #12] — Ritesh's real-browser measurement caught a
  genuine `overflow-x: true` that `pnpm check` couldn't see: `main.ts` sized
  `#game-shell` from `window.innerWidth`, which includes the vertical
  scrollbar's width, while the content box doesn't have it — an overflow by
  exactly the scrollbar width. `body { overflow-x: hidden }` (src/styles/
  styles.css) had hidden the symptom instead of the layout being correct, so
  the "no horizontal scroll" criterion was unfalsifiable. Wrote
  `spec/no-scroll-mask.test.ts` first, confirmed it RED against the mask
  (`body sets overflow(-x): hidden/clip` — the exact failure text is in this
  session's report), then removed the mask and switched both width and
  height reads in `main.ts` to `document.documentElement.clientWidth`/
  `clientHeight`, which exclude the scrollbar. Not re-verified in a real
  browser this session (extension still not connected) — logically sound and
  `pnpm check` green, but Ritesh's next real-browser pass should re-measure
  `overflowsX` specifically, not just assume the sensor's presence fixed it.
  Also gave the page chrome (`body`/`header`/`nav a`) the dark palette and
  gave `main h1` a background distinct from `#game-canvas`'s, since white
  chrome with default blue links above a black canvas, and an h1 band
  identical in colour to the canvas, both read as an unfinished template —
  cosmetic only, no game rules touched.
- **Builder-Tester** [#2 #9] — decided `TILE = 10`, keeping the code-authored
  atlas rather than switching to the 16px Kenney CC0 fallback. Reasoning: the
  code-authored art is not "genuinely failing" — the fallback clause in plan.md
  §4/issue 2 is conditional on that, and the legibility sensor (below) passes
  with margin (fragile vs solid differs in 100/100 pixels, well past the 25%
  floor; the three mechanic colours are >200 apart in RGB space, well past the
  80-unit distinguishability threshold the test uses). Switching to 16px buys
  nothing here and would force re-deriving every clearance constant issues
  3–9 haven't written yet. This is the fallback call plan.md required be made
  before issue 9: made now, decided to keep 10, not deferred.
- **Builder-Tester** [#2] — built `src/game/tiles.ts` (`TILE=10`, the
  `TileChar`→`TileKind` table, `isSolidKind`/`isSolidChar`), `src/game/
  tileset.ts` (fixed 9-colour palette + one 10x10 character-grid literal per
  `TileKind`, plus a pure `tilePixels(kind) -> Uint8ClampedArray`), and
  `src/game/level.ts` (`parseLevel(rows, fatal?) -> Level`, `isSolidAt`,
  `tileKindAt`). All three are pure — no canvas, no DOM — and pass
  `spec/pure-modules.test.ts` unmodified, because baking the atlas into an
  actual canvas is left to `render.ts` (not yet built): `tilePixels` hands
  render.ts flat RGBA bytes to `putImageData`/`drawImage` from, so the DOM
  boundary plan.md draws between rules and render falls naturally at
  tileset.ts's edge rather than needing a carve-out. `Level.fatal` is typed
  `Array<(world: unknown) => boolean>` since `world.ts` (issue 6) doesn't
  exist yet — level.ts only carries these opaquely, it never calls them, so
  whoever builds `world.ts`/`rules.ts` can narrow the type without touching
  level.ts's call sites. `parseLevel` also rejects more than one `P` or `E`
  (issue 2 only asked for zero-of-each, but an ambiguous spawn/exit is the
  same failure mode and free to catch at parse time).
  Tests: `spec/level.test.ts` (fixture map covering every §8 character,
  solidity for all ten, fragile destroy/restore, out-of-bounds-as-solid,
  the four rejection cases) and `spec/legibility.test.ts` (grid shape +
  palette-membership for every tile, fragile-vs-solid ≥25% pixel diff,
  mechanic-colour mutual distinguishability, mechanic colours absent from
  terrain, each mechanic tile using only its own reserved colour). `pnpm
  check` green: typecheck, build, and all 9 vitest files / 73 tests total
  (including the new level.test.ts and legibility.test.ts). No browser available
  this session (`list_connected_browsers` returned `[]`) — the rendered
  tiles have not been eyeballed in an actual page; the sensor proves fragile
  and solid *differ*, not that either reads as "industrial" to a human. The
  next session with a working browser (or Ritesh, per plan.md's "then look
  at the rendered tiles" line) should do that visual pass once `render.ts`
  exists to blit the atlas — this issue ships the data and the sensor, not
  a rendered canvas, since `render.ts` is out of issue 2's scope.
- **Builder-Tester** [#11] — `spec/pure-modules.test.ts`'s allow-list is
  `render.ts`/`input.ts` only, and audio is inherently browser-facing
  (`AudioContext`), so `src/game/audio.ts` would trip it. Resolved by *not*
  touching the sensor: split audio into a pure graph builder
  (`src/game/audio.ts`, `createSfxEngine(ctx, muted?)` — takes any
  AudioContext-shaped object and only calls `ctx.createOscillator`/
  `createGain`/etc., never `window`/`document`/`localStorage`) and a browser
  wiring file outside `src/game` (`src/scripts/audio.ts`, sibling to
  `main.ts`, loaded as its own `<script>` tag in `index.astro` so this issue
  never touches `main.ts`) that does the actual `new AudioContext()`, the
  first-gesture unlock, and `localStorage` mute persistence. Confirmed the
  sensor still goes red for the right reason: temporarily appended
  `export const _leak = document.title;` to `audio.ts`, watched
  `pure-modules.test.ts` fail naming `audio.ts` specifically ("audio.ts
  matched a browser API pattern"), then reverted before shipping. Chose this
  over extending the allow-list because the split needed zero weakening of
  the sensor and stays consistent with why `loop.ts`/`layout.ts` are pure —
  the browser-facing half of any subsystem belongs in `src/scripts`, not in
  an exemption list.
- **Builder-Tester** [#11] — the autoplay-gesture requirement without an
  on-screen instruction: `src/scripts/audio.ts` registers one-shot
  `pointerdown`/`keydown`/`touchstart` listeners on `window` at import time
  and only constructs the real `AudioContext` inside the handler, so the
  very first interaction a player makes to actually play the game is the
  same gesture that unlocks sound — no "click to enable audio" prompt, no
  text at all. `AudioContext` construction and `ctx.resume()` are both
  wrapped in try/catch; a missing/blocked/throwing context leaves `engine`
  `null` and `playSfx()` becomes a permanent no-op, per the issue's "failing
  audio must never break the game".
- **Builder-Tester** [#11] — mute is a single icon-only `<button
  id="mute-toggle">` added to `index.astro`'s existing `<nav>` (🔊/🔇, no
  label text), state persisted at `localStorage["remnant.audio.muted"]`.
  Treated as ordinary page chrome (same category as the nav's "Home" link),
  not a mechanic explanation, so it doesn't trip the no-instructions sensor
  issue #12 owns — flagging this explicitly for whoever builds #12's sensor,
  in case it scans nav text and needs to allow a bare emoji glyph.
  Overlapping-trigger clipping is handled two ways in `createSfxEngine`: a
  60 ms same-name retrigger guard (`RETRIGGER_GUARD_S`), and every voice
  fanning into one `DynamicsCompressorNode` before `ctx.destination` so even
  distinct simultaneous sounds (e.g. `destroy`'s crack + a `break`) get
  summed down rather than clipped. `spec/audio.test.ts` builds the whole
  graph against a hand-written `FakeAudioContext` stub (no jsdom `Audio*`
  needed) and covers: all eight SFX build real graph nodes without throwing,
  mute suppresses synthesis entirely, same-sound retrigger within the guard
  window is dropped while one after it is let through, and a throwing
  `ctx.createOscillator` is swallowed rather than propagated. Not yet wired:
  no gameplay code exists in this worktree to call `playSfx()` from (physics/
  world/rooms land in issues #3–#9), so `src/scripts/audio.ts` exports
  `playSfx`/`isMuted`/`setMuted` for those to import later — nothing calls
  `playSfx` yet outside the mute button's own feedback path. Audibility is
  unverified: no browser was connected this session
  (`list_connected_browsers` returned `[]`), so nothing was actually heard —
  Ritesh's next real-browser pass should confirm the eight SFX sound
  distinct and the rewind sweep in particular reads as unmistakable per the
  issue's requirement.
- **Builder-Tester** [#3 #8] — built `src/game/physics.ts` (`stepBody(body,
  input, level, destroyed, dtMs) -> Body`, pure) and `spec/physics.test.ts`.
  Deliberately did **not** import `level.ts`'s eventual `Level` type (that
  module isn't built yet and isn't this issue's job to invent): physics
  defines its own minimal `PhysicsLevel` (`tileSize`, `widthPx`, `heightPx`,
  `isSolidTile(x,y)`) and a `Destroyed = ReadonlySet<string>` keyed `"x,y"`,
  matching plan.md §6's `world.ts` shape exactly so a reducer's `destroyed`
  set can be passed straight through. `level.ts` (issue 9, or whichever
  issue builds it) should construct a `PhysicsLevel` from its ASCII grid
  rather than physics reaching into ASCII parsing itself.
  Collision is a tile-scan sweep (checks every row/column crossed between
  old and new position, snaps exactly to the tile boundary), not a
  fixed-substep loop — this rules out tunnelling at *any* speed or dt, not
  just at the tuned `MAX_FALL_SPEED`, and gives exact, jitter-free
  wall/floor snapping for free. Grounded is re-detected every frame from
  gravity's own tiny downward push while resting (no separate ground probe
  needed) — that's what makes ground detection "stable" without extra state.
  **Issue 8 should import** `simulateJumpArc(tileSize, stepMs?)` from
  `physics.ts`: it replays the exact same fixed-step vertical integration
  `stepBody` uses (same `GRAVITY`, `JUMP_SPEED`, `MAX_FALL_SPEED`,
  `DEFAULT_STEP_MS`) with no horizontal collision, and returns
  `{maxHeightTiles, horizontalRangeAtSameHeightTiles, ...}` already floored
  to whole tiles — conservative numbers for "can this gap/ledge be
  reached," derived from the real discretised engine rather than a
  continuous-physics formula that could disagree with it at the margins.
  Also export the constants directly (`MAX_RUN_SPEED`, `GRAVITY`,
  `JUMP_SPEED`, `MAX_FALL_SPEED`) if the solver needs anything
  `simulateJumpArc` doesn't already give it — do not hand-copy the numbers.
  `physics.ts` cannot import `loop.ts` (plan.md §5's dependency rule is
  one-directional), so `DEFAULT_STEP_MS` is a deliberately duplicated
  `1000/60` literal; `spec/physics.test.ts` asserts it stays equal to
  `loop.ts`'s `STEP_MS` so the duplication can't silently drift unnoticed.
  `spec/pure-modules.test.ts` caught a real near-miss: a JSDoc comment
  said "grace window," and the sensor only strips `//` line comments, not
  `/** */` blocks, so it flagged `physics.ts` as touching `window` — a
  false positive on the *word*, not the API, but it's exactly the kind of
  match the sensor is cheap on purpose about. Confirmed red for that reason
  (`physics.ts matched a browser API pattern`), then reworded the comments
  rather than touching the sensor.
  Constants (`MAX_RUN_SPEED=70`, `GRAVITY=700`, `JUMP_SPEED=220`,
  `COYOTE_TIME_MS=100`, `JUMP_BUFFER_MS=120`, ...) are a first pass tuned
  by arithmetic only — no browser was connected this session
  (`list_connected_browsers` returned `[]`), so the issue's "drive the real
  game and confirm the jump feels fair" half is still open. Next session
  with a working browser connection should play room 1+ once it exists and
  retune `JUMP_SPEED`/`GRAVITY`/`MAX_RUN_SPEED` by feel if needed — `spec/
  physics.test.ts` will still pass after a retune since it asserts
  behaviour (no tunnelling, clean stops, exactly-once landing), not the
  specific numbers.
- **Orchestrator** [#12] — parallel Builders run in git worktrees under
  `.claude/worktrees/`, which are real checkouts *inside* the repo, so vitest's
  default include walked into them: `pnpm check` reported 304 passing tests
  across three stale copies of every spec, each `pure-modules.test.ts` scanning
  its own worktree's `src/game`. Green there was not green here. Excluded them
  in `vitest.config.ts`; the true count after merging issues 2, 3 and 11 is 105.
  Third instance this crit of a check that passed while measuring the wrong
  thing (after the zero-file sensor and `overflow-x: hidden`) — and this one was
  introduced by the isolation that made parallelism possible, so it is worth
  re-running `npx vitest list` after any change to how sessions are isolated.
- **Orchestrator** [#14] — opened issue 14 for `render.ts`. `plan.md` §11 item 2
  included a "procedural tile renderer"; issue 2's Done-when list did not, so
  its Builder correctly shipped `tilePixels()` as pure byte data and deferred
  the bake and blit — and no other issue picked them up. Nothing draws. Kept
  issue 2 closed-as-written rather than reopening it: its contract was met, and
  the gap was in decomposition. `tilePixels()` returns flat RGBA per 10x10 tile,
  so #14 bakes with `putImageData` into a scratch canvas at boot and `drawImage`s
  per tile; `tileset.ts`/`tiles.ts`/`level.ts` must stay pure, only `render.ts`
  is allow-listed. Blocks four accumulated human checks (overflow, tile
  legibility, SFX distinctness, jump feel) — none is discharge-able while the
  screen is blank, which is why this went before #4.

- **Builder-Tester** [#4 #9 #14] — built `src/game/render.ts` (`bakeAtlas`,
  `renderLevel`) and `spec/render.test.ts`. `render.ts` bakes every tile kind
  from `tilePixels()` into one wide atlas canvas at boot via `putImageData` —
  one call per distinct kind, never again — and `renderLevel` draws one
  `drawImage` per non-empty tile per frame, reading from that atlas by kind
  offset, plus one `fillRect` for the player rect on top. Both are typed
  against a narrow structural `RenderCtx`/`RenderCanvas` (not
  `CanvasRenderingContext2D`/`HTMLCanvasElement`), which is what lets
  `spec/render.test.ts` drive the bake and the blit against a plain stub
  object with `vi.fn()` — no jsdom canvas anywhere in the test. Wired into
  `src/scripts/main.ts`, replacing the placeholder `fillRect`: real
  `document.createElement("canvas")` + `new ImageData(...)` are supplied only
  there, keeping `render.ts` itself DOM-constructor-free at the type level.
  `renderLevel` also takes a `destroyed: ReadonlySet<string>` and skips
  blitting a fragile tile once its coordinate is in that set — untested by
  any other module yet since world.ts (#6) doesn't exist, but #5's
  destructible-wall Builder can pass its `destroyed` set straight through
  with no adapter.
  Since `world.ts`/`rooms/*.ts` (#6/#9) don't exist yet, `main.ts` builds one
  throwaway demo room inline (not a real room, not reused by anything) sized
  exactly `ROOM_WIDTH_TILES x ROOM_HEIGHT_TILES` (32x18 = 320x180, the full
  backbuffer, no camera needed) with every tile kind placed at least once —
  border walls in both solid kinds, a floor with two fragile gaps next to
  solid tiles for contrast, one of each mechanic tile, one decor tile — so a
  human pass can judge tile legibility per the issue's Done-when bullet 5.
  **#9's room author should not reuse this layout or its coordinates** —
  it exists only to make something visible, not to model what a real room
  looks like. The player rect is static (no input, no physics step wired) at
  a hardcoded 8x16 placeholder size — **#4's size-system Builder should not
  treat that as load-bearing**; it was picked only so something recognisable
  as a player draws, not as a proposal for actual player dimensions.
  `tileset.ts`/`tiles.ts`/`level.ts` stayed untouched; `spec/pure-modules.
  test.ts` still passes (`render.ts` is on its allow-list already).
  Real-browser check unverified: `list_connected_browsers` returned `[]`
  again this session — Ritesh's next real-browser pass should load the page
  at 1920x1080 and 390x844 and confirm the level is visible, tiles read as
  distinct terrain, and the console is clean, per the issue's Done-when
  bullet 5.
  `pnpm check` green, 111 tests (up from 105 — 6 new in `spec/render.test.ts`).

- **Builder-Tester** [#10 #4 #5 #6 #7] — built `src/game/input.ts`
  (`createInputController`, `shouldShowRewindControl`) and
  `spec/input.test.ts` (14 tests). Keyboard (A/D/Arrows, Space, Escape) and
  on-screen touch pads (`#pad-left`, `#pad-right`, `#pad-jump`, built by
  this module into `#game-controls`, not authored in `index.astro`) OR into
  the same three booleans, so `stepBody`'s `InputState` (re-exported as-is
  from `physics.ts`, not redefined) never carries any hint of source. Pause
  and the future rewind action are deliberately *not* part of `InputState`
  — both are one-shot activations, not continuous per-frame state — and are
  delivered as `onPauseRequest`/`onRewindRequest` callbacks fired at the
  moment of the keydown/pointerdown instead, with `Escape`'s OS key-repeat
  filtered out (`event.repeat`) so a held Escape doesn't rapid-fire pause.
  Touch pads use Pointer Events (not `click`) plus `touch-action: none` /
  `user-select: none` set **inline** (not only via CSS) so the no-scroll/
  no-zoom/no-select/no-300ms-delayed-click contract is verifiable without
  loading `styles.css`; `touchstart`/`touchmove`/`contextmenu` are also
  `preventDefault()`-ed as belt-and-braces for engines that still schedule
  those gestures under a Pointer Event stream. Multiple simultaneous
  pointers on one pad are tracked so it only releases once every pointer
  has lifted.
  **The rewind-control gate**: `shouldShowRewindControl(hasArmedAMachine)`
  is a standalone pure function (no controller, no DOM) so both states are
  covered directly in `spec/input.test.ts` with no browser API involved.
  `createInputController` builds `#rewind-control` `hidden` from
  construction — before `setMachineArmed` is ever called — so "never shown
  yet" is the actual default, not just the test's assumption; issue #6 is
  the only thing that should ever call `setMachineArmed(true)`. Do not
  invent rewind behaviour beyond this gate — no rewind mechanic exists.
  **SFX ownership, so this doesn't get orphaned a second time (`render.ts`
  was, until #14)**: this issue wires `jump` and `land` only, in
  `src/scripts/main.ts`'s `step()`, right where `stepBody`'s returned Body
  is compared against the previous frame's — a jump impulse is the only way
  `vy` becomes exactly `-JUMP_SPEED` (gravity only ever adds to `vy`), and a
  landing is exactly a `grounded: false -> true` transition, so both are
  detected without duplicating `stepBody`'s internal edge logic or touching
  `physics.ts` (which must stay pure and can't call `playSfx` itself).
  `playSfx` is imported directly from `src/scripts/audio.ts` into
  `main.ts` — confirmed via `dist/_astro/*.js` after a real build that this
  does **not** double-instantiate the audio engine: Vite dedupes the shared
  `audio.ts` module into one chunk imported by both `main.ts`'s and
  `index.astro`'s separate `<script>` entry points. **Every other SFX name
  stays unwired and belongs to the issue that owns the mechanic it plays
  for**: grow/shrink to #4, destroy/fragileImpact to #5, rewind to #6, win
  to #7. None of those should assume `main.ts`'s throwaway demo room is
  where their call belongs either — #9's real rooms are.
  Also wired: `main.ts`'s `step()` now actually drives `playerBody` via
  `createBody`/`stepBody` against a `PhysicsLevel` adapter over the
  existing demo level (`isSolidAt` from `level.ts`), so the player visibly
  moves and jumps in the throwaway room for the first time — unblocks the
  "does the jump feel fair" and "are the SFX distinct" human checks that
  were stuck behind there being no input at all. A bare `paused` boolean in
  `main.ts` (toggled by `onPauseRequest`) skips `loop.advance` while true;
  no pause *screen* was built (out of scope, no rules.ts to hang one off).
  **Real jsdom gotcha found and worked around, not by weakening the test**:
  the first cut of `spec/input.test.ts` left each test's `#game-controls`
  container attached to `document.body` — with two elements sharing an id
  (e.g. `#rewind-control`) anywhere in the document, jsdom's `querySelector`
  id fast-path returned `null` for a *freshly created* element with that id
  even though `outerHTML` showed it was really there. Confirmed by dumping
  `outerHTML` alongside the failing query before concluding it was a jsdom
  quirk, not a bug in `input.ts`. Fixed by tearing each test's container out
  of the document in `afterEach`, not by relaxing what the test checks.
  **Browser-dependent criteria left unverified**: `list_connected_browsers`
  returned `[]` again this session. Not verified in a real browser: touch
  emulation at 390x844 (no 300ms delayed click, no scroll/zoom/select in
  practice, pad hit targets actually feel like ≥64px), console/network
  clean on a real load, and the still-open "does the jump feel fair" human
  check from #3's log entry (now unblocked, but nobody has played it).
  Ritesh's next real-browser pass should cover all of these.
  `pnpm check` green, 125 tests (up from 111 — 14 new in `spec/input.test.ts`).

- **Builder-Tester** [#10 #12] — fixed a real bug Ritesh caught by actually
  playing it: on a wide (landscape) viewport the touch pads rendered on top
  of the canvas instead of staying hidden. Root cause was a specificity
  trap, not a logic bug — `main.ts`'s `controls.hidden = true` in the
  landscape branch of `applyLayout` set the attribute correctly, but
  `#game-controls { display: flex; ... }` in `styles.css` (an id selector)
  outranks the UA stylesheet's `[hidden] { display: none }`, so the
  attribute had no visible effect; `position: absolute` is only applied in
  the portrait branch, so the pads then sat in static flow directly over
  the canvas. This is the third time this crit a mechanism looked green
  (typecheck, build, and all 125 tests passed) while silently not working —
  after a sensor that asserted on zero files, and `overflow-x: hidden`
  making an acceptance criterion unfalsifiable — so the fix is a sensor,
  not just an edit.
  Added `spec/hidden-display.test.ts`: for every id a script toggles via
  `el.hidden = ...` (currently `#game-controls` in `main.ts`,
  `#rewind-control` in `input.ts` — hardcoded list, refresh by grepping
  `\.hidden` in `src/`, since these ids reach `hidden` through DOM element
  references rather than string literals a script could follow reliably),
  it parses `styles.css` and fails if that id has a bare rule setting
  `display` with no matching `#id[hidden] { display: none }` guard.
  **Confirmed red first, for the right id**: before the fix, this failed on
  `#game-controls` ("sets 'display' outside a [hidden]-guarded rule...")
  and passed on `#rewind-control` (already guarded from this issue's
  earlier commit) — both halves matter, since a sensor that reds on
  everything is as useless as one that reds on nothing. Fix: added
  `#game-controls[hidden] { display: none; }`, same pattern as
  `#rewind-control`'s existing guard. `display: none` (not
  `visibility: hidden`) also takes the pads fully out of layout in
  landscape, not just out of view, per the orchestrator's note. Re-ran
  `spec/layout.test.ts` alongside it — still green, so the portrait
  positioning path (`applyLayout`'s `controlsRect` branch, unaffected by
  this rule since it only fires when `[hidden]` is present) is untouched.
  Checked the rest of the page for the same trap: `grep -rn hidden src/`
  turns up exactly these two toggled ids and nothing else with a competing
  `display` rule.
  **Tagged for #12**: this stylesheet and `index.astro`'s markup are what a
  no-instructions sensor will be reading; the guard rule's comment
  documents *why* it exists in terms of the bug, not game mechanics, so it
  shouldn't trip anything issue #12 checks for.
  Still `refs #10`, not closing it — the live-browser criteria (touch
  emulation at 390x844, no 300ms delayed click, console clean) remain
  unverified; no browser was connected this session either.
  `pnpm check` green, 127 tests (up from 125 — 2 new in
  `spec/hidden-display.test.ts`).
- **Builder-Tester** [#4 #6 #8 #9] — built `src/game/player.ts`: two
  hitboxes (small 8x10, large 16x20, plan.md §8), warm/cool player colours
  (`PLAYER_COLOR`), a squash/stretch transition timer
  (`initialSizeState`/`requestSizeChange`/`advanceSizeTransition`/
  `transitionScale`, ~0.6s per plan.md §8), and the safe-growth predicate
  this issue's brief calls "the real invariant" — `canOccupy(x, y, width,
  height, level, destroyed)` (an AABB-vs-solid-tiles scan, mirroring
  physics.ts's own private `isSolidAt` since that module doesn't export
  it) and `canChangeSize(x, y, from, to, level, destroyed)` (anchors the
  target hitbox bottom-centre on the current one, feet planted, then
  calls `canOccupy`). Both are standalone exports, not buried in
  `requestSizeChange`'s state machine, specifically so **#6's rewind
  Builder and #8's solver can call them directly** — rewind needs
  "does the restored anchor still fit" and the solver needs "is this
  grow/shrink edge legal" without re-deriving either from scratch.
  `requestSizeChange` is the no-op both ways the issue asks for: same-size
  touch is a no-op by an identity check before `canChangeSize` even runs;
  an unsafe grow is a no-op because `canChangeSize` refuses it — neither
  is a special case bolted on top.
  **The jump-SFX equality trap (this issue's brief, trap 2) does not
  apply**: jump strength (`JUMP_SPEED`) is not varied by size anywhere in
  this change, so `main.ts`'s existing `playerBody.vy === -JUMP_SPEED`
  detection still matches exactly as before. Flagging this explicitly for
  **#9's room author and anyone tuning feel later**: if large/small ever
  get different jump strength, that equality check breaks silently (no
  test covers it) and must be fixed at the same time, not left to rot.
  **spec/rooms.test.ts and the "zero rooms" trap (trap 1)**: no real rooms
  exist yet (#9). `validateGrowthPadClearance(level)` — "2 tiles headroom
  and 2 tiles width" per plan.md §8, defined here as: the pad's own tile
  column + the column to its right, crossed with the pad's own row + the
  row above, must all be non-solid (fragile counts as solid, i.e. as if
  nothing's destroyed yet) — is exercised against explicit fixtures in the
  test file, including a deliberately bad one (1 tile headroom) that is
  proven red-first (temporarily stubbed the validator to always return
  `ok: true`, confirmed the bad-headroom/bad-width/fragile-blocking fixture
  tests failed for exactly that reason, then restored). A separate,
  explicitly named tripwire test asserts `src/game/rooms/` currently has
  zero files — **that assertion is designed to start failing the moment
  #9 adds real room modules**, forcing whoever lands #9 to replace it with
  an actual per-room loop rather than the check quietly continuing to
  pass over rooms it never looked at. **#9: do not delete that test
  without replacing it** — that's the whole point of it being there.
  Wired minimally into `main.ts` (additive, per this session's brief about
  merge risk): the demo room's existing `G`/`C` tiles now actually trigger
  `requestSizeChange` when the player's feet tile matches, resize
  `playerBody` on success, play `grow`/`shrink` via `playSfx`, and drive
  the visual squash/stretch + colour swap through `player.color` (added as
  an *optional* field on `render.ts`'s `PlayerRect`, default unchanged for
  every other caller). The spawn hitbox in `main.ts` now uses
  `HITBOX.small` (8x10) instead of #14's placeholder 8x16, per that
  issue's own log entry inviting #4 to make that call.
  **Unverified**: `list_connected_browsers` returned `[]` again this
  session — no real-browser pass was possible. The grow/shrink SFX,
  squash/stretch feel, and colour legibility in the demo room are
  therefore untested by a human; Ritesh's next real-browser pass should
  cover those alongside the still-open items from #10's log entry.
  `pnpm check` green, 150 tests (up from 125 — 17 new in
  `spec/size.test.ts`, 7 new in `spec/rooms.test.ts`, 1 new in
  `spec/pure-modules.test.ts` since it dynamically adds one "does not
  reference a browser API" check per file under `src/game/` and now
  finds `player.ts` too).
