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
- **Architect** [#1 #12] — a fullscreen-canvas rewrite would break three shipped
  invariants. `<h1>` is the title card as real DOM text, `<nav>` stays, and the
  no-instructions rule extends to `README.md` and the meta description —
  enforced by a new sensor in issue 12.
- **Architect (revision, prompted by Ritesh)** [#2 #9] — first pass said "procedural
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
