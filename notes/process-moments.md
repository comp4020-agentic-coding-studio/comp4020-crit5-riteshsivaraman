# PROCESS.md moments — staging

Drafts for `PROCESS.md` §"The moments that mattered". Each needs a resolving
commit citation before it moves across (`pnpm check:evidence` verifies the SHA),
so moments land here first and graduate once the commit exists.

Format follows PROCESS.md's four jobs: what happened / what I did instead of the
obvious thing / how I knew it was right / the citation.

---

## Moment: an orchestrator pass between the plan and the first build

**What happened.** The Architect had produced `plan.md` and thirteen
test-shaped issues, and the obvious next move was to hand issue 1 to a Sonnet
Builder. Four things would have gone wrong at once. `plan.md` was untracked, so
the first line of every issue --- "read `plan.md` §N" --- pointed at a file
that existed only in one working tree. The staged Astro migration was
uncommitted, so a Builder's first commit would have fused the stack change and
the game shell into one diff, and "close the issue via commit reference" would
have cited nothing legible. Twelve of thirteen issue bodies carried literal
backslash-escaped backticks from the shell quoting that created them, so a
Builder's primary instruction rendered as `\`plan.md\``. And `notes/agents/log.md`
was still header-only at that moment, which is the second step of the Builder
bootstrap sequence.

**What I did instead of the obvious thing.** Added a standing orchestrator
check between planning and building rather than starting the Builder and
letting it discover the mess. The cost asymmetry is what decided it: each of
the four is a two-minute fix now, and each is a `/clear`-ed session's worth of
confusion later, because a Sonnet Builder that hits a missing `plan.md`
improvises rather than stopping. The Architect was still live, so the log gap
went back to the session that held the reasoning instead of being reconstructed
second-hand by me --- and it turned out to have a real gap worth closing (which
of §11's orderings are hard constraints, now logged).

**How I knew it was right.** `git status` showed `?? plan.md` and `?? notes/`
against nine staged migration changes. `gh issue view` on the raw body
confirmed the escapes were in the stored text, not a rendering artifact, and a
per-issue grep bounded it to twelve of thirteen --- issue 2 was clean because it
had been rewritten later with different quoting, which is what identified the
cause as shell quoting rather than the issue template. `pnpm check` was green
(17 tests, 2 files) before any of this, so the baseline was known-good and the
four problems were all coordination, not code.

**The harness change.** `CLAUDE.md` names Architect / Builder-Tester /
Reviewer / human, and explicitly records that a fourth role was tried and cut
for costing more in context-reload than it caught. That reasoning holds for a
per-issue reviewer; it does not hold for a once-per-phase gate that reads
`git status` and the issue bodies. The distinction --- coordination that
reloads context versus coordination that only inspects state --- is the thing
worth carrying forward, and it belongs in `CLAUDE.md` in the next batched
harness change rather than as an ad-hoc edit mid-session.

**Citation.**
[`7e9927d...c74e54f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/compare/7e9927d...c74e54f) --- the stack migration
committed on its own so a Builder's first diff stays legible, then `plan.md`,
the agent log and the issue batch committed as tracked files a `/clear`-ed
session can actually read.

- [`7e9927d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/7e9927d) stack: migrate to Astro, move source under `src/`
- [`c74e54f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-riteshsivaraman/commit/c74e54f) plan: crit-5 plan, agent log, issue batch

---
