# Process overview

A reading-guide to how *Remnant* came together over one night, and to the four
moments where a correction landed in the harness rather than in a retry.

## What I built

A small browser game about a creature that changes size inside an abandoned
facility. Two mechanics — growing/shrinking, and a rewind machine that returns
*you* but not the world — that interact to produce the only loss in the game:
destruction is permanent, so a wrong break can strand you, and rewinding does
not undo it. No tutorial, no text, no HUD. Four rooms, about three minutes.
The environment is the tutorial, which is why the tileset is authored as code
and checked for legibility rather than eyeballed.

I ran it as three roles — an Opus Architect once, Sonnet Builder-Testers one
per issue, and a single Opus Reviewer — with an orchestrator session holding
the plan, dispatching work, and verifying every claim before merging.

## The moments that mattered

### 1. The gate between planning and building

The Architect produced [`plan.md`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/blob/main/plan.md) and thirteen
test-shaped issues, and the obvious next move was to hand issue 1 to a Builder.
Four things would have gone wrong at once: `plan.md` was untracked, so every
issue's opening line — "read plan.md" — pointed at a file that existed in one
working copy; the staged stack migration was uncommitted, so a Builder's first
commit would have absorbed it and "closes #1" would have cited an unreadable
diff; twelve of thirteen issue bodies carried backslash-escaped backticks from
the shell quoting that created them; and the agent log was unread.

Instead of starting the Builder and letting it discover the mess, I added a
standing pre-dispatch check. The cost asymmetry decided it: each is a
two-minute fix before dispatch and a `/clear`-ed session's worth of confusion
after, because a Builder that hits a missing `plan.md` improvises rather than
stopping.

That became [`scripts/check-dispatch.ts`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/blob/main/scripts/check-dispatch.ts)
in [`ed0a23d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/ed0a23d) — clean tree, `plan.md` tracked, log-lag by
git ancestry rather than mtime, issue bodies checked *as stored* rather than as
rendered. The part I'd defend hardest is the read side: log entries carry
`[#n]` tags and `pnpm check:dispatch <n>` **prints** the matching entries to
paste into that Builder's prompt. A log that is written but never consulted
fails silently, and no sensor can catch that — so the fix was to deliver it
rather than trust a session to go looking.

### 2. Four checks that passed while measuring nothing

The recurring failure of the night was never a red test. It was green checks
that measured nothing, and none was found by running the suite:

- `spec/pure-modules.test.ts` allow-listed every file that existed, so it
  asserted on **zero** files and passed. Found by asking which files it
  actually scanned, not by running it. Fixed in
  [`35bffd3`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/35bffd3).
- `body { overflow-x: hidden }` made issue 1's "no horizontal scroll"
  criterion unfalsifiable — the mask and the criterion were written in the same
  session by the same agent. A real overflow was hiding behind it, caused by
  sizing the shell from `window.innerWidth` (which includes the scrollbar).
  [`49ae8c3`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/49ae8c3).
- `controls.hidden = true` was correct, tested, and did nothing: an
  id-selector `display: flex` outranks the UA `[hidden]` rule. Found by
  looking at the running game on a phone, not by a test.
  [`bc2d9de`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/bc2d9de).
- Running Builders in parallel git worktrees put real checkouts *inside* the
  repo, so vitest collected every worktree's copy of every spec: **304**
  "passing" tests spanning unmerged branches. The isolation that enabled
  parallelism silently broke the suite that validated it.
  [`5396205`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/5396205).

Each fix shipped as a sensor that generalises past its own bug rather than a
patch: `spec/no-scroll-mask.test.ts` forbids suppressing the observable
instead of satisfying the condition, and `spec/hidden-display.test.ts` greps
`src/` for every id the code toggles via `.hidden` and requires a
`[hidden]`-guarded rule — so it already covers elements nobody has written yet.

The habit that came out of this: after a Builder reports green, I mutate the
code and check the test goes red **for the right reason**. Every acceptance in
this repo was verified that way — including with a different field than the
Builder used, so the proof wasn't just a replay of theirs.

### 3. The Reviewer found the game uncompletable while 178 tests passed

`CLAUDE.md` caps the Reviewer at one use for the whole crit, reserved for the
rewind/destruction interaction. Spending it after issues 5 and 6 merged — and
telling it explicitly to treat *my own* merge resolution as suspect — returned
the single worst finding of the night: **at 1920x1080 there was no way to
trigger a rewind at all.** Both triggers were unavailable; the on-screen
control lived inside the container my own earlier fix correctly hides in
landscape, and no rewind key existed. Every module was right in isolation.

It also found that the re-entry guard compared sub-pixel floats, so re-entering
a machine silently *re-armed* instead of rewinding — which converts a small
anchor into a large one and kills room 3's intended solution with no recovery.
Fixes in [`ce863c1`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/ce863c1); the room-3 protection is a regression
test over the whole *sequence*, not the comparison.

The lesson I'd keep: the Reviewer earned its cost because it was pointed at one
cross-cutting invariant and told what was newest and least reviewed, not asked
to "review the code".

### 4. Verification that finds design errors, not just code errors

`plan.md` §7 made a test-only BFS solver the centrepiece: expensive
verification in `pnpm check`, trivial runtime. It paid off twice.
[`7728091`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/7728091) — while building it, the Builder found it had
modelled growth, coolant and arming as *optional* edges when the game makes
them automatic on tile entry, which manufactures dead-ends that don't exist and
would have made its own correctness properties confidently wrong.

Then in [`8531e46`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/8531e46), room 3 — the only losable room — took
four attempts, every hand-derivation wrong, each corrected by reading
`solveRoom()`'s actual output. A single fragile tile under the coolant is
never load-bearing, because a large body's two-wide footprint is always
shielded by whichever neighbouring column survives. The room the crit is judged
on was authored against a machine-checked oracle instead of intuition, and the
solver asserts `dead === flagged` exactly: 64 of 64, no mismatch either way.

## What I cut, and what is still missing

Two things were cut deliberately rather than quietly.

**The rewind's arming ghost and rewind effect (issue 15).** `plan.md` §6/§9
call for a violet pulse at the machine, a stored ghost of you at the anchor,
and a desaturated reversed sweep on the rewind itself. They were never in
issue 6's Done-when list, so nobody built them, and by the time that surfaced
the week's budget was at $109 of $120. The mechanic therefore has an arming
sound and a contextual `↺` control and nothing else. That is a real gap in the
no-tutorial rule, not a cosmetic one: a player who walks past the machine gets
no signal that anything happened. It is filed as
[issue 15](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/issues/15) with the diagnosis in it.

**Room 3's residual dead states.** Roofing the approach lane
([`6277865`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/6277865)) cut them from 156 of 394 reachable states to
50 of 267 and eliminated the "armed while already large" class entirely. The
50 that remain are a *solver artefact*: its jump edge lands on a destination
tile without modelling headroom at the origin, so it still believes a hop over
the machine exists that real collision forbids. Rather than trust either layer,
the guarantee is asserted where it is decidable — `spec/room3-approach.test.ts`
drives `stepBody` itself and proves a body on that lane cannot rise out of it,
verified by deleting the ceiling and watching it go red.

The general rule I would keep: when one layer cannot decide something, assert
it at the layer that can, and say so — rather than lowering the first layer's
standard until it agrees.

## Before you ship

`pnpm check` runs the suite; `pnpm check:dispatch` gates a handoff to a
Builder; `pnpm check:evidence` verifies these citations resolve.
