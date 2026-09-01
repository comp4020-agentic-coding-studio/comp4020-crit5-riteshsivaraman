# Agent log

Append-only. One entry per session that makes a decision worth another
session knowing about. Newest at the bottom. One or two lines: what you
decided and why --- not a full narration of what you did.

Read the tail of this before starting work if you were told to act as a
role without other context (see CLAUDE.md, "Multi-model workflow").

---

- **Architect** — cut `notes/idea.md` from 10 min / 5 mechanics to ~3.5 min /
  2 mechanics (size + rewind). The C5 spec requires a stranger to reach an
  ending in 5 minutes and calls two interacting mechanics the better move;
  idea.md's five would each lose their wordless "demonstrate → require" beat.
  Cut: enemies, limited vision, music, checkpoints, side paths.
- **Architect** — idea.md §15/§19 is explicitly *unlosable* (no lives, no game
  over, softlocks designed out), which fails the spec's "it can be lost" line
  outright. Inverted it: permanent destruction + player-only rewind means a
  wrong break makes the exit unreachable, and *that* is the loss condition.
  One loss channel, zero twitch skill, and it is the design's own centre.
- **Architect** — loss is evaluated at runtime by small **authored fatal
  predicates** per room, not by a general solver. A general reachability BFS
  exists but is **test-only** (`spec/solver.test.ts`), verifying the predicates
  are neither too eager nor too lax. Runtime stays exact and trivial; the
  expensive verification lives in `pnpm check`. This is deliberately the crit's
  own theme — tests and human judgement doing different jobs.
- **Architect** — no engine (rejected Phaser / Kaplay / LittleJS / Tiled). The
  reason is harness, not purity: the graded automated test needs game rules
  importable into vitest with no canvas, and every engine hides them behind a
  DOM-dependent runtime. Hence the hard rule that `rules`/`physics`/`world`/
  `solver` touch no browser API and use no randomness or clock reads.
- **Architect** — idea.md says "landscape only" but marking is Chrome at
  1920×1080 **and 390×844 portrait**, both counting fully. Portrait is
  first-class: canvas band at the top, touch pads below.
- **Architect** — a fullscreen-canvas rewrite would break three shipped
  invariants. `<h1>` is the title card as real DOM text, `<nav>` stays, and the
  no-instructions rule extends to `README.md` and the meta description —
  enforced by a new sensor in issue 12.
- **Architect (revision, prompted by Ritesh)** — first pass said "procedural
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
- **Architect** — §11's list is mostly convenience, but four orderings are hard
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
- **Orchestrator** — added a gate between the Architect pass and the first
  Builder: check `git status`, the issue bodies as stored, and the log tail
  before dispatching. Caught four things at once (untracked `plan.md` that
  every issue's first line points at, an uncommitted stack migration a Builder
  would have fused with its own diff, escaped backticks in twelve of thirteen
  issue bodies, and the log gap). `CLAUDE.md`'s cut of a fourth role was aimed
  at per-issue review, which reloads context; a once-per-phase gate only
  inspects state, so it doesn't pay that cost. Drafted in
  `notes/process-moments.md`; the `CLAUDE.md` wording goes in the next batched
  harness change, not ad hoc now.
