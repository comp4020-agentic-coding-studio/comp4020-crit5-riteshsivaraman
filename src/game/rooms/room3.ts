import { parseLevel } from "../level";
import type { RoomState } from "../rules";

/**
 * Room 3 -- "The Machine". Same one-lane grammar as room 1 (grow, break a
 * mandatory gate, one-tile gap that only small fits through) plus the
 * game's one loss condition (plan.md's room 3: "requires the combination,
 * and can be lost").
 *
 * Intended crossing: arm the machine small at R, grow at G, break wall A
 * (mandatory -- it blocks the lane until broken), rewind IMMEDIATELY back
 * to the small anchor at R (before ever walking further right while
 * large), then walk small the entire rest of the lane -- across wall A's
 * now-open gap, past coolant (already small, so it's a no-op), through
 * the low-ceiling gates at cols 18 and 25 (row 13 solid there, so a large
 * body's 2-tall footprint can never pass -- small doesn't care), to E.
 *
 * ---------------------------------------------------------------------
 * #15 fix: the coolant used to sit at (17,14), inside the *only*
 * large-reachable resting column next to wall B (see below) -- footprint
 * cols 16-17 for a body resting at col 16. That meant merely walking
 * right after growing and breaking wall A auto-shrank you back to small
 * on contact with the coolant, with no rewind required at all: the
 * combination plan.md §9 describes was never actually enforced. Fixed by
 * relocating coolant to (21,14) -- past the col-18 low-ceiling gate that
 * blocks large from ever reaching that column, so it is reachable by
 * landing on it (small, walking the lane after the intended rewind) but
 * NEVER by a large body, and can therefore never substitute for the
 * rewind. spec/solver.test.ts's "unsolvable without rewind" assertion is
 * exactly the regression test for this: restoring the old coolant
 * position flips it back to solvable-without-rewind (see the log entry
 * [#9 #15] for the confirmed-red output).
 *
 * Consequence for the fatal predicate (also #15): since coolant is now
 * physically unreachable while large, ANY large state without a small
 * rewind anchor is unrecoverable -- there is no longer a second,
 * position-specific escape hatch (the old fatalLockout/fatalRecess pair,
 * keyed off destroying (16,15) specifically) to reason about separately.
 * Verified against the solver directly: `size === "large" &&
 * !hasSmallAnchor` matches the BFS's actual dead-state set exactly (0
 * mismatches either direction, 156 dead states / 156 flagged, out of 394
 * total reachable states) -- see the log entry for the run. This
 * subsumes the wrong-move case plan.md §9 describes (break wall B while
 * large with no small anchor armed) as a special case of the general
 * rule, rather than a second predicate alongside it.
 *
 * Wall B (the ledge under coolant's old position, (16,15)/(17,15)) is
 * still real geometry and still the visible "wrong move" plan.md
 * describes: a low ceiling at (18,13) means the only large-reachable
 * resting column next to it is col 16 (footprint cols 16-17), and
 * world.ts's 1px contact margin puts wall B's tiles in breaking range
 * from there. Breaking it opens a two-tile-deep recess (rows 15-16) that
 * only a rewind can climb out of (a jump into a column whose own floor
 * just broke has nothing to land on). But this is no longer a distinct
 * failure mode from "large with no small anchor": if a small anchor IS
 * armed (the intended flow, since R sits before G in the lane), breaking
 * wall B mid-detour is still recoverable -- rewind returns you to R
 * regardless of physical reachability, and the broken ledge is off the
 * path you take from there. If no anchor was ever armed (R was jumped
 * over rather than landed on -- solver.ts's jump-arc range comfortably
 * clears it), reaching wall B, or even just staying large anywhere past
 * G with no anchor, is already fatal by the general rule.
 *
 * The wrong move, restated: walk past wall A while still large (no
 * rewind first), rest at column 16 -- the room's one large-reachable
 * anchor next to where coolant used to sit -- and the contact margin
 * breaks wall B. From here the room is dead unless a small anchor was
 * already armed, matching plan.md: "Rewind does not help: it returns
 * you, not the ledge" for the no-anchor case, while an anchor armed
 * *while small* still rescues either failure mode, because rewind
 * restores size as well as position.
 *
 * Wall B is drawn as the visible floor directly under where coolant used
 * to sit -- the ledge plan.md describes -- and sits past wall A, off the
 * direct path (the intended route rewinds back to the small alcove long
 * before reaching it).
 */

const ROWS = [
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "################################",
  "#........#######################",
  "#........#######################",
  "#........#######################",
  "#........#######################",
  "######...=........#......#.....#",
  "#P..R..G.=...........C........E#",
  "################==##############",
  "################..##############",
  "################################",
];

const hasSmallAnchor = (state: RoomState): boolean =>
  state.anchor !== null && state.anchor.size === "small";

/**
 * The room's single fatal predicate, per the file header: large with no
 * small anchor armed is unrecoverable, full stop -- coolant is no longer
 * reachable while large (the #15 fix), so there is no second way back to
 * small. Verified exactly against the solver's own dead-state set (see
 * header and notes/agents/log.md [#9 #15]).
 */
const roomIsDead = (state: RoomState): boolean => state.size === "large" && !hasSmallAnchor(state);

export const room3 = parseLevel(ROWS, [roomIsDead]);
