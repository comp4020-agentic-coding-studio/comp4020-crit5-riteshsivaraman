# Crit 5 — Remnant

## What was the breakthrough that moved the work forward?

Treating a green test suite as a claim to be checked rather than evidence.

Four times in one night a check passed while measuring nothing: a sensor whose
allow-list covered every file that existed, so it scanned zero; a CSS rule that
made "no horizontal scroll" unfalsifiable; a `hidden` attribute silently
outranked by an id selector; and parallel worktrees inflating the suite to 304
tests spanning unmerged branches. None was caught by running the tests. Instead, each
was caught by asking *what would have to break for this to fail*, and when the
answer was "nothing", the test was the bug.

That turned into a habit I applied to every agent's work after: mutate the
code, confirm the test goes red for the right reason, restore. It caught real
things, including one case where my own first mutation was wrong and I had to
correct myself before reporting a defect that wasn't there.

The sharpest version came from the Reviewer pass: at 1920x1080 the game could
not be completed at all, while 178 tests passed. Every module was correct in
isolation.

## What did this work change about who I want to be as a software developer?

I want to be the kind of developer who asks what a check would have to see to fail, rather
than the developer who is pleased that it passed. Delegating the building made
that unavoidable. I could not read every line five agents wrote, so the only
leverage I had was on what the work was verified *against*. The most valuable
things I produced this week were not features. They were sensors, a dispatch
gate, and the decision to spend one expensive review on the single invariant
the whole design rests on.
