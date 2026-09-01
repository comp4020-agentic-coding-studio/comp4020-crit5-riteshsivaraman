# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so the deployed head is the only place a broken one shows up.

## The checks

`pnpm check` runs them, and `pnpm check:evidence` is the extra gate before you
ship. CI runs the same plus links, secrets and the deploy.

`pnpm check:dispatch` is a third gate, and it runs at a different moment: before
an issue is handed to a Builder, not before a commit or a ship. It asserts the
handoff rather than the code --- clean tree, `plan.md` tracked, the agent log
current with the last work commit, issue bodies free of the shell-quoting damage
that makes a Builder's own instructions unreadable. `pnpm check:dispatch <n>`
also prints the log entries tagged `[#n]`, which go into that Builder's opening
prompt. It is deliberately out of `pnpm check`: two of its checks need the
network, and none of them are facts about the code.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## Multi-model workflow

This crit uses Opus to plan and Sonnet to build, deliberately. Three roles,
not more --- a fourth (separate reviewer-per-issue) and heavier coordination
(per-agent artifact directories, chatty issue threads) were tried on paper
and cut: they cost more in context-reload tokens than they catch in bugs,
at this game's scope. Budget for the whole crit is ~$100 and a few hours ---
if a subsystem is eating disproportionate time or spend, cut its scope
(fewer enemies, shorter level, simpler finale) rather than extend either.

**If you are a fresh session and were just told "you are the Architect /
Builder-Tester / Reviewer" with nothing else** --- do this first, in order:

1. Read `plan.md` (module boundaries, tile/entity format, issue list).
2. Read `notes/agents/log.md` --- the entries tagged `[#<your issue>]` are the
   ones that constrain you, and your dispatch prompt should already quote them.
   If it didn't, and no entry is tagged for your issue, say so before building
   rather than guessing: it usually means the gate was skipped.
3. Read your assigned issue: `gh issue view <n>`.
4. Only then start work. Append to `notes/agents/log.md` **in the same commit as
   the work**, tagged with every issue your decision constrains --- one line is
   enough: what you decided and why, not a full narration. Logging afterwards
   trips `check:dispatch`'s staleness check for the next session, which is the
   point: work that landed after the log last moved is work nobody recorded.

Role definitions:

- **Architect** (Opus, once per crit): `notes/idea.md` --> `plan.md` +
  a single batch of GitHub issues, one per subsystem, criteria written
  test-shaped. Created once, not edited incrementally. `/clear` after.
- **Builder-Tester** (Sonnet, one session per issue): build it, `pnpm check`
  for a green baseline, then drive the actual running game
  (claude-in-chrome or manual) --- console and network checked, not just a
  screenshot. Any bug found gets a failing test/sensor written first,
  confirmed red for the right reason, then fixed, then confirmed green.
  Close the issue via commit reference. `/clear` between issues.
- **Reviewer**: capped at one use for the whole crit, on Opus, spent on the
  rewind/destruction interaction specifically (the one cross-cutting
  invariant: does destroying something survive a rewind, can any sequence
  softlock the player). Everything else is reviewed by its own sensors +
  green `pnpm check` + a human playthrough --- no separate reviewer pass.
- **You (human)**: an active tester, not an approver-at-the-end. Take at
  least one issue yourself. After every issue closes, play a *concrete
  user-flow scenario* someone hands you (not an isolated edge case ---
  "grow, break the wall, rewind, is the wall still broken?"). Near the end,
  run the stranger test: play levels cold, no context, report where you
  got stuck --- the no-tutorial rule can't be checked by a sensor, only by
  a human encountering it fresh.
- **Never commit a red state** --- a failed `pnpm check` loops back into the
  same session, it doesn't get papered over.
- **Harness changes** (this file, skills, tests-as-sensors) get batched
  once real invariants exist, not added ad hoc mid-session.
- **Write issue bodies with `--body-file` or a single-quoted heredoc**, never
  an inline double-quoted shell string. Backticks inside one come back
  escaped, and twelve of this crit's thirteen issues shipped that way ---
  a Builder's primary instruction rendering as ``\`plan.md\```. `check:dispatch`
  catches it now; the quoting rule stops it happening.
- **The gate between phases is not a fourth role.** The role that was tried and
  cut above was a reviewer-per-issue, which pays a full context reload to
  re-read work someone already understood. `pnpm check:dispatch` loads no
  context: it reads `git status`, the log, and the issue bodies, and either
  clears the handoff or refuses it. Coordination that only inspects state is
  cheap; coordination that re-derives understanding is what the cut was about.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.
