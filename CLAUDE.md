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
2. Read the tail of `notes/agents/log.md` (decisions, why sensors exist).
3. Read your assigned issue: `gh issue view <n>`.
4. Only then start work. Append to `notes/agents/log.md` before you finish
   --- one line is enough: what you decided and why, not a full narration.

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

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.
