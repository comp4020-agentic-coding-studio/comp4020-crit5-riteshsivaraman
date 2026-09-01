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

This crit uses Opus to plan and Sonnet to build, deliberately:

- **Opus plans once per crit** --- scope, module boundaries, GitHub issues
  (one per subsystem, criteria written test-shaped) --- then `/clear`
  before building starts. Don't carry Opus's planning back-and-forth into
  a build session as context it didn't ask for.
- **Sonnet builds one subsystem per session**, against `plan.md` and one
  issue at a time. `/clear` between subsystems, not one long session for
  the whole plan.
- **Never commit a red state** (see above) --- a failed `pnpm check` loops
  back into the same session, it doesn't get papered over.
- **Review runs in a fresh session** pointed at the diff, not a
  continuation of the build session. Escalate to Opus only when a bug
  looks architectural, not for routine fixes.
- **Harness changes (this file, skills, tests-as-sensors) get batched with
  Opus**, once real invariants exist --- not added ad hoc in whichever
  session happens to notice something.

## This file is yours

A starting point, not a rulebook: what you add to it is the harness, and the
harness is assessed. This file and the sensors you wire into `check` carry
across the course --- both come with you into next week's repo. The prototype
doesn't: source, and the tests answering this week's published spec, stay
behind. `spec/README.md` draws the line.
