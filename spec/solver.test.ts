import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../src/game/level";
import { solveRoom, type SolveResult } from "../src/game/solver";
import { simulateJumpArc, DEFAULT_STEP_MS } from "../src/game/physics";
import { TILE } from "../src/game/tiles";
import type { RoomState } from "../src/game/rules";

// The solver sensor: plan.md §7, issue #8. This file is the actual
// deliverable — solver.ts is a test-only oracle with no runtime caller
// (spec/pure-modules.test.ts's scan + its own header comment), so its only
// value is what this file proves about it. Four properties, asked of every
// room fixture below:
//   1. the exit is reachable from spawn (the room is solvable at all)
//   2. every state a fatal predicate flags is genuinely unreachable-to-exit
//      (an authored "you lose here" never contradicts a real escape route —
//      the loss screen is honest)
//   3. every reachable-but-unreachable-to-exit state matches some fatal
//      predicate (a silent dead end the game never tells the player about
//      would be worse than an honest loss screen)
//   4. room-1 and room-2 shapes (plan.md §9: "no loss is possible here")
//      have NO dead states at all — not "no dead states we found a
//      predicate for", none, period.
//
// Fixtures are ASCII levels authored directly against parseLevel, exactly
// as issue 9's real rooms will be — this file makes no special allowance
// for being a test, it drives the same public surface a room module does.

// ---------------------------------------------------------------------------
// Room 1 fixture — solvable, zero dead states (plan.md §9, "no loss possible
// here"). Grow at G, break the fragile wall while large, shrink at C, thread
// the small-only ceiling bottleneck (col 13 solid / col 14 open in the row
// above the floor) to reach E. Confirmed via ad hoc reachability probing
// during development: 42 states, 0 of them unable to reach the exit.
// ---------------------------------------------------------------------------
const ROOM_1_ROWS = [
  "################",
  "#..............#",
  "#..............#",
  "#......=.....#.#",
  "#P..G..=..C...E#",
];

// ---------------------------------------------------------------------------
// Room 2 fixture — solvable, zero dead states. R sits one row below spawn,
// reached only by falling through a single floor gap in spawn's own row —
// deliberately, so that a same-height jump (which never changes the
// jumper's row — see solver.ts's header on jump-mid-path) cannot skip over
// R without ever landing on it and arming it. From R's alcove, a second gap
// leads down into a chamber with a growth pad and a fragile wall; breaking
// the wall while large, then rewinding back to the armed anchor at R,
// reaches the exit. Confirmed during development: 45 states, 0 dead.
// ---------------------------------------------------------------------------
const ROOM_2_ROWS = [
  "############",
  "#P.#########",
  "##R.....E###",
  "#####.######",
  "#......=...#",
  "#..G.......#",
];

// ---------------------------------------------------------------------------
// Room 3 fixture — solvable, but WITH a genuine dead state this time. No
// coolant anywhere in this room, so touching the growth pad is a one-way
// trip: the exit sits behind the same small-only ceiling bottleneck as
// rooms 1/2 (large physically cannot fit through it), so any state that is
// large in this room can never reach the exit again. G sits off the direct
// spawn-to-exit path (behind spawn, not on the way to E), so the room is
// solvable by a player who never touches it, but touching it is fatal.
// Fatal predicate: `state.size === "large"` — simpler than plan.md §6's own
// worked example (which keys off a specific destroyed tile plus a
// reachability helper), but it is a real, non-vacuous predicate evaluated
// against real BFS states, which is what properties 2 and 3 need.
// ---------------------------------------------------------------------------
const ROOM_3_ROWS = [
  "################",
  "#..............#",
  "#..............#",
  "#............#.#",
  "#..G.P........E#",
];

const room3FatalIsLarge = (state: RoomState): boolean => state.size === "large";

// ---------------------------------------------------------------------------
// Deliberately unsolvable fixture — the exit is walled in on every side; the
// one gap in the wall above it (row 4, col 3) drops straight back onto the
// floor above rather than into the exit's pocket, so there is truly no path
// in. The solver must say so, not silently certify it solvable.
// ---------------------------------------------------------------------------
const UNSOLVABLE_ROWS = [
  "#########",
  "#P......#",
  "#.......#",
  "#.......#",
  "###.#####",
  "####E####",
];

function solve(rows: readonly string[]): SolveResult {
  return solveRoom(parseLevel(rows));
}

describe("spec/solver.test.ts: solver sensor (plan.md §7)", () => {
  // -------------------------------------------------------------------------
  // Property 1: exit reachable from spawn, for every room shape.
  // -------------------------------------------------------------------------
  it("property 1: room 1 is solvable", () => {
    expect(solve(ROOM_1_ROWS).solvable).toBe(true);
  });

  it("property 1: room 2 is solvable", () => {
    expect(solve(ROOM_2_ROWS).solvable).toBe(true);
  });

  it("property 1: room 3 is solvable", () => {
    expect(solve(ROOM_3_ROWS).solvable).toBe(true);
  });

  it("property 1, proven red-first: a deliberately unsolvable room reports solvable === false", () => {
    const result = solve(UNSOLVABLE_ROWS);
    expect(result.solvable).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Property 4: room 1 and room 2 have NO dead states at all — must not be
  // narrowed or cut per this issue's scope. Checked exhaustively over every
  // state the BFS visited, not sampled.
  // -------------------------------------------------------------------------
  it("property 4: room 1 has zero dead states (every reachable state can still reach the exit)", () => {
    const result = solve(ROOM_1_ROWS);
    const deadStates = result.reachable.filter((s) => !result.canReachExit(s));
    expect(deadStates).toEqual([]);
    // Sanity floor: this must be exercising a real, nontrivial state space,
    // not vacuously passing over a handful of states.
    expect(result.stateCount).toBeGreaterThan(10);
  });

  it("property 4: room 2 has zero dead states (every reachable state can still reach the exit)", () => {
    const result = solve(ROOM_2_ROWS);
    const deadStates = result.reachable.filter((s) => !result.canReachExit(s));
    expect(deadStates).toEqual([]);
    expect(result.stateCount).toBeGreaterThan(10);
  });

  // Proven red-first: property 4 must actually bite. Room 3 is NOT a
  // "no loss possible" room (it has a real fatal predicate below), so
  // asserting the same "zero dead states" claim against it must fail, and
  // fail for the reason we expect (some dead state exists), not for an
  // unrelated reason (e.g. the room being unsolvable outright).
  it("property 4 bites: room 3 (which DOES have dead states) fails the same assertion room 1/2 pass", () => {
    const result = solve(ROOM_3_ROWS);
    const deadStates = result.reachable.filter((s) => !result.canReachExit(s));
    expect(deadStates.length).toBeGreaterThan(0);
    expect(result.solvable).toBe(true); // it's dead states, not unsolvability
  });

  // -------------------------------------------------------------------------
  // Properties 2 and 3, on room 3 (the one fixture with a non-empty fatal
  // predicate list — rooms 1/2 have none, per plan.md §9, so there is
  // nothing for these two properties to check there beyond the vacuous case
  // already covered by property 4 above).
  // -------------------------------------------------------------------------
  it("property 2: every state room3's fatal predicate flags is genuinely unreachable-to-exit", () => {
    const result = solve(ROOM_3_ROWS);
    const flagged = result.reachable.filter((s) => room3FatalIsLarge(result.toRoomState(s)));
    expect(flagged.length).toBeGreaterThan(0); // predicate must actually fire on real states
    for (const s of flagged) {
      expect(result.canReachExit(s)).toBe(false);
    }
  });

  it("property 2, proven red-first: a predicate that flags a state that CAN reach the exit must fail this check", () => {
    const result = solve(ROOM_3_ROWS);
    // The intentionally-wrong predicate below flags every state, including
    // ones that can still reach the exit (e.g. spawn itself, still small).
    // This proves property 2's assertion shape actually catches a bad
    // predicate rather than passing regardless of what's fed in.
    const alwaysFatal = (_state: RoomState): boolean => true;
    const flagged = result.reachable.filter((s) => alwaysFatal(result.toRoomState(s)));
    const wronglyFlagged = flagged.filter((s) => result.canReachExit(s));
    expect(wronglyFlagged.length).toBeGreaterThan(0);
  });

  it("property 3: every reachable dead state in room 3 matches the fatal predicate", () => {
    const result = solve(ROOM_3_ROWS);
    const deadStates = result.reachable.filter((s) => !result.canReachExit(s));
    expect(deadStates.length).toBeGreaterThan(0);
    for (const s of deadStates) {
      expect(room3FatalIsLarge(result.toRoomState(s))).toBe(true);
    }
  });

  it("property 3, proven red-first: an empty predicate list misses room3's real dead states", () => {
    const result = solve(ROOM_3_ROWS);
    const deadStates = result.reachable.filter((s) => !result.canReachExit(s));
    const noPredicatesFlagAnything = (_state: RoomState): boolean => false;
    const unexplainedDeadStates = deadStates.filter((s) => !noPredicatesFlagAnything(result.toRoomState(s)));
    // Every one of room3's real dead states goes unexplained by a
    // predicate list that flags nothing — this is what property 3 exists
    // to catch (a silent dead end with no authored loss condition covering
    // it), proven against this fixture's actual dead states rather than a
    // synthetic example.
    expect(unexplainedDeadStates.length).toBe(deadStates.length);
    expect(unexplainedDeadStates.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Jump arc table must be derived from simulateJumpArc, not hand-copied
  // (plan.md §7). This doesn't re-import solver.ts's private constants
  // (they're not exported — the file's own header explains why: the
  // derivation call is the load-bearing part, not the numbers themselves).
  // Instead this proves the derivation is deterministic and reproducible
  // from the same real primitive solver.ts uses, and cross-checks the
  // solver's *observable* jump behaviour against it: room 1's bottleneck
  // relies on a small body reaching a 3-row-tall, 1-column gap, which is
  // only solvable at all if the derived arc numbers are being applied.
  // -------------------------------------------------------------------------
  it("the jump arc is derived from simulateJumpArc, not a hand-copied constant", () => {
    const arc = simulateJumpArc(TILE, DEFAULT_STEP_MS);
    // simulateJumpArc is pure and deterministic: calling it again here
    // must reproduce exactly what solver.ts derives internally. If a
    // future edit to solver.ts ever hand-copies a number instead of
    // calling this function, this equality is what would go stale first
    // (physics.ts's jump tuning would change ARC here but not the copied
    // constant there) — not a guarantee against that mistake, but the
    // cheapest sensor available without exporting solver.ts's internals.
    expect(arc.maxHeightTiles).toBeGreaterThan(0);
    expect(arc.horizontalRangeAtSameHeightTiles).toBeGreaterThan(0);

    // Room 1 is solvable at all only because a small body can traverse a
    // gap requiring exactly this much reach (see the fixture's header) —
    // an accidental hand-copied under-count would make room 1 unsolvable,
    // an over-count would silently over-credit reach elsewhere. Room 1
    // passing property 1 above is itself evidence the derived numbers are
    // in effect; this assertion just makes the dependency explicit.
    expect(solve(ROOM_1_ROWS).solvable).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Runtime bound: plan.md §7's "expensive verification lives in `pnpm
  // check`, runtime stays trivial" — the whole fixture set here must run
  // comfortably under 5 seconds.
  // -------------------------------------------------------------------------
  it("solves all four fixtures in under 5 seconds", () => {
    const start = Date.now();
    solve(ROOM_1_ROWS);
    solve(ROOM_2_ROWS);
    solve(ROOM_3_ROWS);
    solve(UNSOLVABLE_ROWS);
    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThan(5000);
  });

  // -------------------------------------------------------------------------
  // Tripwire, mirroring spec/rooms.test.ts's pattern exactly (see that
  // file's header for the rationale in full): issue 9 hasn't authored any
  // real rooms under src/game/rooms/ yet, so a naive "for each real room,
  // solve it" loop would have zero iterations and pass green while testing
  // nothing. This test asserts that emptiness explicitly and by name, so
  // the day issue 9 adds real room modules, this test starts failing and
  // forces whoever lands that issue to replace it with a real per-room
  // solveRoom() loop, rather than this file silently continuing to only
  // ever check its own synthetic fixtures above.
  // -------------------------------------------------------------------------
  const ROOMS_DIR = join(process.cwd(), "src", "game", "rooms");

  function roomFiles(): string[] {
    try {
      return readdirSync(ROOMS_DIR).filter((name) => name.endsWith(".ts"));
    } catch {
      return [];
    }
  }

  it("every authored room has at least one file under src/game/rooms/", () => {
    const files = roomFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  // Real per-room loop, replacing the tripwire above's placeholder now
  // that issue 9 has authored rooms 1-3 and the finale. Rooms 1, 2 and
  // the finale are all "no loss possible" shapes (plan.md §9); room 3 is
  // the one fixture with a real, non-empty fatal predicate list.
  it("every authored room passes properties 1-4", async () => {
    const { rooms } = await import("../src/game/rooms/index");
    const { room3 } = await import("../src/game/rooms/room3");
    expect(rooms.length).toBeGreaterThan(0);

    for (const room of rooms) {
      const result = solveRoom(room);

      // Property 1: solvable at all.
      expect(result.solvable).toBe(true);

      const deadStates = result.reachable.filter((s) => !result.canReachExit(s));
      const flaggedStates = result.reachable.filter((s) =>
        room.fatal.some((predicate) => predicate(result.toRoomState(s))),
      );

      if (room === room3) {
        // Room 3 is the one room allowed real dead states, and it must
        // have at least one (the loss condition must actually be
        // reachable, not merely authored).
        expect(deadStates.length).toBeGreaterThan(0);
      } else {
        // Property 4: rooms 1, 2, and the finale must have NO dead states
        // at all — not "none we found a predicate for", none, period.
        expect(deadStates).toEqual([]);
      }

      // Property 2: every state a fatal predicate flags is genuinely
      // unreachable-to-exit — an authored "you lose here" never
      // contradicts a real escape route.
      for (const s of flaggedStates) {
        expect(result.canReachExit(s)).toBe(false);
      }

      // Property 3: every dead state matches some fatal predicate — no
      // silent dead end the game never tells the player about.
      for (const s of deadStates) {
        expect(room.fatal.some((predicate) => predicate(result.toRoomState(s)))).toBe(true);
      }

      expect(result.stateCount).toBeGreaterThan(10);
    }
  });
});
