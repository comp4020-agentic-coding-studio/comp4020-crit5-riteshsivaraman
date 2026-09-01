import { describe, expect, it } from "vitest";
import type { Destroyed, PhysicsLevel } from "../src/game/physics";
import { arm, rewind, type Anchor } from "../src/game/rewind";

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
