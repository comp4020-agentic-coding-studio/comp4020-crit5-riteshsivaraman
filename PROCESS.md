# Process overview

## What I built

A small browser game about a creature that changes size inside an abandoned
facility. Two mechanics are at play: growing/shrinking, and a rewind machine that returns
*you* but not the world. A wrong break can strand you, and rewinding does
not undo it. No tutorial, no text, no HUD. Four rooms, about three minutes.
The environment is the tutorial, which is why the tileset is authored as code
and checked for legibility rather than eyeballed.

I ran it as three roles: an Opus Architect once, Sonnet Builder-Testers one
per issue, and a single Opus Reviewer, with an orchestrator session holding
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

### 2. Verification that finds design errors, not just code errors

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
