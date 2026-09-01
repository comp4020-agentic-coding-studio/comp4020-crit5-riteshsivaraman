import { describe, expect, it } from "vitest";
import type { Destroyed, PhysicsLevel } from "../src/game/physics";
import { arm, enterRewindTile, rewind, type Anchor } from "../src/game/rewind";
import { hasWon, isRoomDead, nextStatus, type FatalPredicate, type RoomState } from "../src/game/rules";

// Issue #6's acceptance criteria (gh issue view 6) — the rewind machine,
// which plan.md calls "the game's central invariant". This is the focused
// test the issue's brief specifically asks for.
//
// world.ts (issue #5) does not exist in this worktree — it's being built
// in a parallel session on the same invariant (see notes/agents/log.md
// [#6] and src/game/rewind.ts's file header). So this fixture mimics
// world.ts's shape by hand: a plain `Set<string>` of destroyed
// coordinates, mutated directly (the way world.ts's `breakTile` would) to
// simulate a wall having been broken, rather than importing a module that
// doesn't exist. The assertions below are about rewind.ts's own
// behaviour — that it restores the player and returns the identical
// `destroyed` reference it was handed — and stay valid once the real
// world.ts merges (an integration re-check against the real module is
// still owed after that merge).

const TILE = 10;

/** '#' solid, '=' fragile-but-reports-solid-until-broken, '.' empty — same
 * convention spec/size.test.ts and spec/physics.test.ts already use, so a
 * reviewer reading all three doesn't have to learn a new fixture format. */
function makeLevel(rows: string[]): PhysicsLevel {
  const width = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(width, "."));
  return {
    tileSize: TILE,
    widthPx: width * TILE,
    heightPx: grid.length * TILE,
    isSolidTile(tileX, tileY) {
      const row = grid[tileY];
      if (row === undefined) return true;
      const ch = row[tileX];
      return ch === "#" || ch === "=";
    },
  };
}

describe("after destroying a wall and rewinding, the wall is still destroyed and the player is back at the anchor", () => {
  // Row 1: a corridor with a fragile tile ('=') at column 5. Player stands
  // in the open column 2 (the anchor) at the moment the machine is armed,
  // then walks over and breaks the fragile tile, then rewinds.
  const level = makeLevel(["#########", "#..#.=..#", "#########"]);
  const anchorX = 2 * TILE;
  const anchorY = 1 * TILE;
  const fragileKey = "5,1";

  it("arms cleanly at the open anchor cell", () => {
    const destroyed: Destroyed = new Set();
    const anchor = arm(anchorX, anchorY, "small", level, destroyed);
    expect(anchor).toEqual({ x: anchorX, y: anchorY, size: "small" });
  });

  it("rewinding after the wall breaks: player returns to the anchor, wall stays broken, destroyed is the same set (reference and content)", () => {
    const destroyed = new Set<string>();
    const anchor = arm(anchorX, anchorY, "small", level, destroyed) as Anchor;
    expect(anchor).not.toBeNull();

    // The player walks off (say, to the fragile tile's column) and breaks
    // it — simulating what world.ts's breakTile would do, by hand, since
    // that module isn't importable here.
    destroyed.add(fragileKey);
    const destroyedRefBeforeRewind = destroyed;
    const contentsBeforeRewind = [...destroyed];

    const result = rewind({
      x: 5 * TILE,
      y: 1 * TILE,
      size: "large",
      anchor,
      destroyed,
    });

    // Player restored to the anchor's position and size.
    expect(result.triggered).toBe(true);
    expect(result.x).toBe(anchorX);
    expect(result.y).toBe(anchorY);
    expect(result.size).toBe("small");

    // The wall is still destroyed: same set, by reference, not merely by
    // deep equality — this is the assertion the issue calls out
    // explicitly ("provably does not touch destroyed").
    expect(result.destroyed).toBe(destroyedRefBeforeRewind);
    expect([...result.destroyed]).toEqual(contentsBeforeRewind);
    expect(result.destroyed.has(fragileKey)).toBe(true);
  });
});

describe("rewind() provably does not touch destroyed", () => {
  it("returns the exact same destroyed reference it was given, contents unchanged, regardless of anchor state", () => {
    const destroyed = new Set<string>(["3,3", "7,1"]);
    const anchor: Anchor = { x: 0, y: 0, size: "small" };

    const before = [...destroyed];
    const result = rewind({ x: 40, y: 40, size: "large", anchor, destroyed });

    expect(result.destroyed).toBe(destroyed); // reference identity
    expect([...result.destroyed]).toEqual(before); // content identity
  });

  it("cannot call a mutating Set method on `destroyed` even by accident — its type parameter is unconstrained", () => {
    // This is the structural guarantee documented in rewind.ts's header,
    // demonstrated at the type level rather than merely asserted in prose:
    // `rewind<D>`'s `destroyed: D` is an unconstrained generic, so nothing
    // in the module's own source can call `.add`/`.delete`/`.clear` on it
    // without failing to typecheck (`pnpm typecheck`, part of `pnpm
    // check`). A runtime double-check: passing something that is *not* a
    // Set at all still round-trips untouched, which would be impossible if
    // rewind() ever called a Set-specific method on it.
    const notASet = { tag: "definitely not a Set" };
    const result = rewind({ x: 1, y: 2, size: "small", anchor: null, destroyed: notASet });
    expect(result.destroyed).toBe(notASet);
  });
});

describe("arm() refuses to store an anchor whose body does not fit in that cell", () => {
  // Column 5 is a 1-tile-wide gap (10px) — the same "1-tile gap admits
  // small, refuses large" shape spec/size.test.ts already exercises
  // against canOccupy directly. arm() must refuse for exactly the same
  // reason, via the same predicate, not a reimplementation of it.
  const level = makeLevel(["##########", "####.#####", "##########"]);
  const gapX = 4 * TILE;
  const gapY = 1 * TILE;

  it("refuses a large anchor that would overlap the walls either side of the gap", () => {
    const destroyed: Destroyed = new Set();
    expect(arm(gapX, gapY, "large", level, destroyed)).toBeNull();
  });

  it("still arms a small anchor at the same cell, since it fits", () => {
    const destroyed: Destroyed = new Set();
    // Centre the 8px small hitbox inside the 10px gap, same offset
    // spec/size.test.ts uses.
    expect(arm(gapX + 1, gapY, "small", level, destroyed)).toEqual({
      x: gapX + 1,
      y: gapY,
      size: "small",
    });
  });

  it("refuses an anchor sitting squarely inside solid geometry", () => {
    const destroyed: Destroyed = new Set();
    expect(arm(0, 0, "small", level, destroyed)).toBeNull(); // (0,0) is '#'
  });

  it("a fragile tile that has already been broken no longer blocks arming", () => {
    const fragileLevel = makeLevel(["#####", "#.=.#", "#####"]);
    const destroyed = new Set<string>(["2,1"]); // the '=' at (2,1), broken
    expect(arm(2 * TILE, 1 * TILE, "small", fragileLevel, destroyed)).toEqual({
      x: 2 * TILE,
      y: 1 * TILE,
      size: "small",
    });
  });
});

// Reviewer findings #2/#3: the previous re-entry guard (main.ts) compared
// `anchor.x === playerBody.x` — sub-pixel floats — which essentially never
// matches after the player has walked off and back, so every pass re-armed
// instead of rewinding, silently overwriting the anchor's *size* too
// (breaking plan.md §9 room 3's "arm small, grow, walk back past the
// machine, rewind small through the gap" solution). `enterRewindTile`
// replaces that comparison with tile identity, never `===` on a float.
describe("enterRewindTile: tile-identity re-entry guard (findings #2/#3)", () => {
  const level = makeLevel(["#########", "#..#....#", "#########"]);
  const tileX = 6;
  const tileY = 1;
  const feetTile = { x: tileX, y: tileY };
  const px = tileX * TILE;
  const py = tileY * TILE;

  it("first entry with nothing armed yet: arms at this tile", () => {
    const destroyed: Destroyed = new Set();
    const result = enterRewindTile(null, feetTile, px, py, "small", level, destroyed);
    expect(result).toEqual({ action: "armed", anchor: { x: px, y: py, size: "small" }, tile: feetTile });
  });

  it("re-entering the SAME tile always rewinds, never re-arms — even at a different sub-pixel position", () => {
    const destroyed: Destroyed = new Set();
    const armed = enterRewindTile(null, feetTile, px, py, "small", level, destroyed);
    if (armed.action !== "armed") throw new Error("expected armed");

    // Same tile, but the body's exact float position has drifted slightly
    // (e.g. re-entering while still decelerating) — a `===` comparison on
    // x/y would miss this; tile identity must not.
    const second = enterRewindTile(
      { anchor: armed.anchor, tile: armed.tile },
      feetTile,
      px + 0.0001,
      py,
      "small",
      level,
      destroyed,
    );
    expect(second).toEqual({ action: "rewind" });
  });

  it("regression for #3: arm small, grow, walk back over the SAME tile — the anchor's size must not be overwritten", () => {
    const destroyed: Destroyed = new Set();

    // Arm small.
    const armed = enterRewindTile(null, feetTile, px, py, "small", level, destroyed);
    if (armed.action !== "armed") throw new Error("expected armed");
    const state = { anchor: armed.anchor, tile: armed.tile };
    expect(state.anchor.size).toBe("small");

    // Player grows to large elsewhere, then walks back over the *same*
    // machine tile at the *same* pixel position it originally armed at
    // (the worst case for a floats-based guard: identical position, still
    // must not re-arm because the size differs) plus a case with a
    // different position too.
    const secondPass = enterRewindTile(state, feetTile, px, py, "large", level, destroyed);
    expect(secondPass).toEqual({ action: "rewind" });

    // A different tile entirely arms independently and does not disturb
    // the original anchor's stored state (main.ts only updates its local
    // `anchor`/`armedTile` on an "armed" action, never on "rewind").
    const untouchedAnchor = armed.anchor;
    expect(untouchedAnchor.size).toBe("small");

    // Actually rewinding with that untouched anchor returns the player to
    // small, proving room 3's design survives: growth never leaks into
    // the anchor once armed.
    const rewound = rewind({ x: 999, y: 999, size: "large", anchor: untouchedAnchor, destroyed });
    expect(rewound.triggered).toBe(true);
    expect(rewound.size).toBe("small");
  });

  it("a different tile arms a fresh anchor rather than being treated as a re-entry", () => {
    const destroyed: Destroyed = new Set();
    const armed = enterRewindTile(null, feetTile, px, py, "small", level, destroyed);
    if (armed.action !== "armed") throw new Error("expected armed");
    const state = { anchor: armed.anchor, tile: armed.tile };

    const otherTile = { x: 2, y: 1 };
    const result = enterRewindTile(state, otherTile, 2 * TILE, 1 * TILE, "small", level, destroyed);
    expect(result.action).toBe("armed");
  });

  it("arm() refusing (body doesn't fit) reports 'refused', not a re-arm or a rewind", () => {
    const tightLevel = makeLevel(["##########", "####.#####", "##########"]);
    const destroyed: Destroyed = new Set();
    const result = enterRewindTile(null, { x: 4, y: 1 }, 4 * TILE, 1 * TILE, "large", tightLevel, destroyed);
    expect(result).toEqual({ action: "refused" });
  });
});

// Reviewer finding #4: rewind() trusted arm-time canOccupy unconditionally.
// That trust breaks the moment `destroyed` shrinks between arm and rewind
// (only reachable via world.ts's restart(), not wired to any caller today,
// but the Reviewer confirmed the placement-inside-solid-geometry bug exists
// at the module level regardless of reachability). rewind() must re-check
// occupancy itself so the invariant holds by construction, not by "nothing
// calls restart() yet".
describe("rewind(): occupancy is re-checked at rewind time (finding #4)", () => {
  // A 1-tile gap at column 4 — wide enough for the small hitbox once
  // centred, per the same fixture size.test.ts/rules.test.ts already use.
  const level = makeLevel(["##########", "####.#####", "##########"]);
  const gapX = 4 * TILE + 1;
  const gapY = 1 * TILE;

  it("still triggers when the anchor cell is (still) clear", () => {
    const destroyed: Destroyed = new Set();
    const anchor = arm(gapX, gapY, "small", level, destroyed) as Anchor;
    expect(anchor).not.toBeNull();

    const result = rewind({
      x: 0,
      y: 0,
      size: "large",
      anchor,
      destroyed,
      level,
      occupancyDestroyed: destroyed,
    });
    expect(result.triggered).toBe(true);
    expect(result.x).toBe(gapX);
    expect(result.y).toBe(gapY);
  });

  it("refuses (triggered: false, position untouched) when the anchor cell no longer fits", () => {
    // Simulate the only way this can happen: geometry the anchor relied on
    // no longer being clear (e.g. a hypothetical restart() re-solidifying
    // a tile that was destroyed when this anchor armed). Here we just hand
    // rewind() a level where that same cell is now solid, standing in for
    // "the world changed out from under the anchor".
    const destroyed: Destroyed = new Set();
    const anchor = arm(gapX, gapY, "small", level, destroyed) as Anchor;
    expect(anchor).not.toBeNull();

    const nowSolidLevel = makeLevel(["##########", "##########", "##########"]);

    const result = rewind({
      x: 30,
      y: 30,
      size: "large",
      anchor,
      destroyed,
      level: nowSolidLevel,
      occupancyDestroyed: destroyed,
    });

    expect(result.triggered).toBe(false);
    // Player's current state passes straight through, untouched — same
    // no-op shape as "no anchor armed".
    expect(result.x).toBe(30);
    expect(result.y).toBe(30);
    expect(result.size).toBe("large");
    expect(result.destroyed).toBe(destroyed);
  });

  it("omitting level (existing callers) skips the re-check — old behaviour, existing tests untouched", () => {
    const destroyed: Destroyed = new Set();
    const anchor: Anchor = { x: 0, y: 0, size: "small" };
    const result = rewind({ x: 5, y: 5, size: "large", anchor, destroyed });
    expect(result.triggered).toBe(true);
  });
});

describe("rewinding with no anchor armed is a safe no-op", () => {
  it("passes the player's current x/y/size straight through, untouched, and destroyed is still the same reference", () => {
    const destroyed = new Set<string>(["9,9"]);
    const result = rewind({ x: 17, y: 23, size: "large", anchor: null, destroyed });

    expect(result.triggered).toBe(false);
    expect(result.x).toBe(17);
    expect(result.y).toBe(23);
    expect(result.size).toBe("large");
    expect(result.destroyed).toBe(destroyed);
  });
});

// ---------------------------------------------------------------------------
// Issue #7: loss/win rules (plan.md §6/§9). `RoomState` fixtures below are
// built by hand, not by driving physics.ts/world.ts — isRoomDead/hasWon are
// pure functions of the state shape rules.ts defines, and this is exactly
// the "explicit state, not module-level globals" contract issue #8's
// solver depends on (see rules.ts's file header). Room fixtures mirror
// plan.md §9's designs closely enough to exercise the real shapes each
// room's fatal-predicate list would take, but are NOT the real rooms —
// issue 9 authors those; spec/rooms.test.ts's tripwire is what forces that
// distinction to stay visible.
function makeState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    playerTileX: 0,
    playerTileY: 0,
    size: "small",
    destroyed: new Set(),
    anchor: null,
    ...overrides,
  };
}

describe("isRoomDead / hasWon: the primitives in isolation", () => {
  it("isRoomDead is false when fatal is empty, regardless of state — rooms 1 and 2's list", () => {
    expect(isRoomDead(makeState({ size: "large" }), [])).toBe(false);
  });

  it("isRoomDead is true the moment any one predicate in the list holds", () => {
    const neverFires: FatalPredicate = () => false;
    const fires: FatalPredicate = (state) => state.destroyed.has("9,9");
    const state = makeState({ destroyed: new Set(["9,9"]) });
    expect(isRoomDead(state, [neverFires, fires])).toBe(true);
  });

  it("isRoomDead does not short-circuit past a predicate that would throw on a mismatched state — every predicate in the list is authored against the same RoomState shape", () => {
    // Not a throw test — just documents that predicates are plain
    // functions evaluated left-to-right via Array#some; order in the
    // authored list has no bearing on correctness, only on which one a
    // human would look at first when debugging a false loss.
    const first: FatalPredicate = () => false;
    const second: FatalPredicate = () => false;
    expect(isRoomDead(makeState(), [first, second])).toBe(false);
  });

  it("hasWon is true exactly when the player's feet-tile matches the exit cell", () => {
    const exit = { x: 12, y: 4 };
    expect(hasWon(makeState({ playerTileX: 12, playerTileY: 4 }), exit)).toBe(true);
    expect(hasWon(makeState({ playerTileX: 12, playerTileY: 5 }), exit)).toBe(false);
    expect(hasWon(makeState({ playerTileX: 11, playerTileY: 4 }), exit)).toBe(false);
  });

  it("nextStatus is sticky: once lost or won, later frames never move it back to playing", () => {
    const exit = { x: 0, y: 0 };
    const alwaysDead: FatalPredicate = () => true;
    const lost = nextStatus("playing", makeState(), [alwaysDead], exit);
    expect(lost).toBe("lost");
    // Same call, but current status is already "lost" and the state no
    // longer matches any fatal predicate — must stay "lost".
    const stillLost = nextStatus("lost", makeState(), [], exit);
    expect(stillLost).toBe("lost");
  });

  it("nextStatus: won beats playing the instant the exit tile is reached, with no fatal predicates involved", () => {
    const exit = { x: 3, y: 3 };
    const state = makeState({ playerTileX: 3, playerTileY: 3 });
    expect(nextStatus("playing", state, [], exit)).toBe("won");
  });
});

// Room 1 (plan.md §9): growth pad -> mandatory fragile wall -> coolant ->
// one-tile gap -> exit. "No loss is possible here" — fatal is empty, so
// every state along the intended path (and any other reachable state) must
// read as alive.
describe("room 1 fixture (plan.md §9): no loss is possible", () => {
  const ROOM1_FATAL: FatalPredicate[] = [];
  const wallKey = "5,1";

  const solutionPath: RoomState[] = [
    makeState({ playerTileX: 1, playerTileY: 1 }), // spawn, small
    makeState({ playerTileX: 3, playerTileY: 1 }), // walked onto the growth pad
    makeState({ playerTileX: 3, playerTileY: 1, size: "large" }), // grew
    makeState({ playerTileX: 5, playerTileY: 1, size: "large", destroyed: new Set([wallKey]) }), // broke the mandatory wall
    makeState({ playerTileX: 7, playerTileY: 1, size: "small", destroyed: new Set([wallKey]) }), // dropped into coolant, shrank
    makeState({ playerTileX: 9, playerTileY: 1, size: "small", destroyed: new Set([wallKey]) }), // through the one-tile gap
    makeState({ playerTileX: 10, playerTileY: 1, size: "small", destroyed: new Set([wallKey]) }), // at the exit
  ];

  it("isRoomDead is false at every state along the intended solution path", () => {
    for (const state of solutionPath) {
      expect(isRoomDead(state, ROOM1_FATAL)).toBe(false);
    }
  });
});

// Room 2 (plan.md §9): rewind machine -> drop -> growth pad -> fragile wall
// (dead end behind it) -> rewind -> the broken wall is now a route.
// "No loss is possible here" — fatal is empty per plan.md, even though the
// intended path deliberately walks the player into what would look like a
// dead end (a wrong predicate might have flagged this; the room's real
// list, correctly, has none).
describe("room 2 fixture (plan.md §9): no loss is possible, even mid-\"dead end\"", () => {
  const ROOM2_FATAL: FatalPredicate[] = [];
  const wallKey = "4,3";

  const solutionPath: RoomState[] = [
    makeState({ playerTileX: 1, playerTileY: 0 }), // spawn, small
    makeState({ playerTileX: 1, playerTileY: 0, anchor: { x: 10, y: 0, size: "small" } }), // armed the machine
    makeState({ playerTileX: 2, playerTileY: 3, anchor: { x: 10, y: 0, size: "small" } }), // one-way drop
    makeState({ playerTileX: 2, playerTileY: 3, size: "large", anchor: { x: 10, y: 0, size: "small" } }), // grew
    makeState({
      playerTileX: 4,
      playerTileY: 3,
      size: "large",
      destroyed: new Set([wallKey]),
      anchor: { x: 10, y: 0, size: "small" },
    }), // broke the wall — a dead end from here
    makeState({ playerTileX: 10, playerTileY: 0, size: "small", destroyed: new Set([wallKey]) }), // rewound to the alcove
    makeState({ playerTileX: 4, playerTileY: 3, size: "small", destroyed: new Set([wallKey]) }), // the broken wall, now a route
  ];

  it("isRoomDead is false at every state along the intended solution path, including standing at the 'dead end'", () => {
    for (const state of solutionPath) {
      expect(isRoomDead(state, ROOM2_FATAL)).toBe(false);
    }
  });
});

// Room 3 (plan.md §9): the room that CAN be lost. Two fragile walls: A
// (opens the intended upper route) and B (the ledge that carries the only
// approach to the coolant — breaking it while large permanently forecloses
// ever being small again, and the one-tile gap on the intended route needs
// the small hitbox). B's fatal predicate matches plan.md §6's own worked
// example shape almost exactly: "destroyed.has(wallB) [and no other route
// to coolant exists, which in this fixture's geometry is unconditional —
// B genuinely is the only approach, per plan.md §9's room 3 description]."
describe("room 3 fixture (plan.md §9): the wrong break is fatal, the intended break is not", () => {
  const wallAKey = "8,2"; // intended: opens the upper route
  const wallBKey = "3,5"; // wrong: the coolant-ledge break

  // Authored exactly like plan.md §6's own example — the room's one fatal
  // condition is "wall B has been broken" (in this fixture, B truly is the
  // only approach to coolant, so no separate canReachCoolant() helper is
  // needed to express plan.md's "and !canReachCoolant(w)" clause; a real
  // room-3 with a more complex layout might need one).
  const ROOM3_FATAL: FatalPredicate[] = [(state) => state.destroyed.has(wallBKey)];

  const solutionPath: RoomState[] = [
    makeState({ playerTileX: 1, playerTileY: 5 }), // spawn, small
    makeState({ playerTileX: 2, playerTileY: 5, anchor: { x: 10, y: 50, size: "small" } }), // armed the machine, small
    makeState({ playerTileX: 4, playerTileY: 5, size: "large", anchor: { x: 10, y: 50, size: "small" } }), // grew
    makeState({
      playerTileX: 8,
      playerTileY: 2,
      size: "large",
      destroyed: new Set([wallAKey]),
      anchor: { x: 10, y: 50, size: "small" },
    }), // broke wall A — opens the upper route
    makeState({
      playerTileX: 10,
      playerTileY: 50,
      size: "small",
      destroyed: new Set([wallAKey]),
      anchor: { x: 10, y: 50, size: "small" },
    }), // rewound — back small, at the alcove
    makeState({ playerTileX: 8, playerTileY: 2, size: "small", destroyed: new Set([wallAKey]) }), // through the upper route, one-tile gap
    makeState({ playerTileX: 20, playerTileY: 0, size: "small", destroyed: new Set([wallAKey]) }), // at the exit
  ];

  it("isRoomDead is false at every state along the intended solution path", () => {
    for (const state of solutionPath) {
      expect(isRoomDead(state, ROOM3_FATAL)).toBe(false);
    }
  });

  it("breaking wall A alone (the intended break) never triggers loss, at any size or position", () => {
    const destroyed = new Set([wallAKey]);
    expect(isRoomDead(makeState({ size: "large", destroyed }), ROOM3_FATAL)).toBe(false);
    expect(isRoomDead(makeState({ size: "small", destroyed, playerTileX: 99, playerTileY: 99 }), ROOM3_FATAL)).toBe(
      false,
    );
  });

  it("THE WRONG BREAK: breaking wall B while large is fatal — the room-3 wrong-break state", () => {
    const wrongBreakState = makeState({
      playerTileX: 3,
      playerTileY: 5,
      size: "large",
      destroyed: new Set([wallBKey]),
      anchor: null,
    });
    expect(isRoomDead(wrongBreakState, ROOM3_FATAL)).toBe(true);
  });

  it("breaking both walls (A intended, B wrong) is still fatal — B alone is sufficient, A doesn't excuse it", () => {
    const state = makeState({ size: "large", destroyed: new Set([wallAKey, wallBKey]) });
    expect(isRoomDead(state, ROOM3_FATAL)).toBe(true);
  });

  it("rewind cannot undo the wrong break — the fatal state is still fatal after an anchor is armed and used", () => {
    // plan.md §9, verbatim: "Rewind does not help: it returns you, not the
    // ledge." A rewind changes playerTileX/Y/size/anchor but never
    // `destroyed` (rewind.ts's whole contract) — so the same destroyed set
    // stays fatal no matter what the other fields say.
    const destroyed = new Set([wallBKey]);
    const beforeRewind = makeState({ playerTileX: 3, playerTileY: 5, size: "large", destroyed });
    const afterRewind = makeState({
      playerTileX: 1,
      playerTileY: 5,
      size: "small",
      destroyed, // same reference — rewind.ts never touches this
      anchor: { x: 10, y: 50, size: "small" },
    });
    expect(isRoomDead(beforeRewind, ROOM3_FATAL)).toBe(true);
    expect(isRoomDead(afterRewind, ROOM3_FATAL)).toBe(true);
  });
});
