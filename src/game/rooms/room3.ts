import { parseLevel } from "../level";
import type { RoomState } from "../rules";

/**
 * Room 3 -- "The Machine". Same one-lane grammar as room 1 (grow, break a
 * mandatory gate, one-tile gap that only small fits through) plus the
 * game's one loss condition (plan.md's room 3: "requires the combination,
 * and can be lost").
 *
 * Intended crossing: arm the machine small at R, grow at G, break wall A
 * (mandatory -- it blocks the lane until broken), rewind back to the small
 * anchor at R, then walk small the entire rest of the lane -- across wall
 * A's now-open gap, past coolant (already small, so it's a no-op), through
 * the one-tile gate at col 25, to E.
 *
 * Coolant/wall-B geometry (cols 16-18, row 13-16), and the two judgment
 * calls it embodies -- both overridable, see the log entry:
 *
 * 1. A low ceiling at (18,13) (a single solid tile, same trick as the
 *    small-only gate at col 25) means a *large* body can never rest with a
 *    footprint that includes column 18. Large's footprint is 2 tiles wide,
 *    so this pins the only large-reachable anchor near coolant to column
 *    16 (footprint cols 16-17) -- there is no second anchor position to
 *    worry about. That's what lets wall B be just the plan.md-specified
 *    *two* fragile tiles, (16,15) and (17,15), instead of three: with only
 *    one anchor column in play, both of its floor tiles must already be
 *    fragile for the "shielding neighbour" problem (a 2-wide footprint
 *    stays supported as long as *one* of its two floor tiles is still
 *    solid) to ever matter.
 *
 * 2. (16,15) specifically -- the tile under the *only* safe large anchor --
 *    is what "the ledge" means mechanically. Losing it is fatal in two
 *    distinct ways the predicate below has to cover separately, both
 *    confirmed empirically against the solver (hand-derivation of this
 *    room's reachability was repeatedly wrong during authoring; only the
 *    solver's own BFS settled it):
 *
 *      - fatalLockout: once (16,15) is gone, *no* large body anywhere in
 *        the room can ever become small again (column 16 no longer holds;
 *        column 17 was already unreachable by construction #1), so any
 *        large state without a small-sized anchor is dead, regardless of
 *        where it's standing.
 *      - fatalRecess: destroying either (16,15) or (17,15) alone opens a
 *        two-tile-deep pit beneath it (rows 15-16, floor at 17) that no
 *        jump can climb back out of -- a jump into a column whose own
 *        floor tile just broke has nothing to land on and falls straight
 *        back down. The *only* escape from inside the pit is `rewind`,
 *        which teleports out irrespective of physical reachability. But
 *        rewinding to a *large* anchor after (16,15) is gone just relands
 *        you in fatalLockout, so "in the recess with a large anchor" is
 *        only safe if (16,15) is still intact -- the predicate's
 *        `canEscapeRecessAndSurvive` check.
 *
 * The wrong move: walk past wall A while still large (no rewind first),
 * rest at column 16 -- the room's one large-reachable anchor next to
 * coolant -- and the contact margin (world.ts's tilesInContact) breaks
 * (16,15) [and/or (17,15), same mechanism]. From here the room is dead
 * without a small anchor already armed, matching plan.md: "Rewind does
 * not help: it returns you, not the ledge." An anchor armed *while small*
 * still rescues either failure mode, because rewind restores size as well
 * as position.
 *
 * Wall B is drawn as the visible floor directly under coolant -- the ledge
 * plan.md describes -- and sits past wall A, off the direct path (the
 * intended route rewinds back to the small alcove long before reaching it).
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
  "#........=........#......#.....#",
  "#P..R.G..=.......C............E#",
  "################==##############",
  "################..##############",
  "################################",
];

const inRecess = (state: RoomState): boolean =>
  (state.playerTileX === 16 || state.playerTileX === 17) && state.playerTileY === 16;

const hasSmallAnchor = (state: RoomState): boolean =>
  state.anchor !== null && state.anchor.size === "small";

const canEscapeRecessAndSurvive = (state: RoomState): boolean =>
  state.anchor !== null && (state.anchor.size === "small" || !state.destroyed.has("16,15"));

const fatalRecess = (state: RoomState): boolean => inRecess(state) && !canEscapeRecessAndSurvive(state);

const fatalLockout = (state: RoomState): boolean =>
  state.size === "large" && state.destroyed.has("16,15") && !hasSmallAnchor(state);

const roomIsDead = (state: RoomState): boolean => fatalRecess(state) || fatalLockout(state);

export const room3 = parseLevel(ROWS, [roomIsDead]);
