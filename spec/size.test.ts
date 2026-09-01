import { describe, expect, it } from "vitest";
import type { Destroyed, PhysicsLevel } from "../src/game/physics";
import {
  advanceSizeTransition,
  canChangeSize,
  canOccupy,
  GROW_SHRINK_DURATION_MS,
  HITBOX,
  initialSizeState,
  requestSizeChange,
  sizeChangeAnchor,
  transitionScale,
} from "../src/game/player";

// Issue 4's acceptance criteria (gh issue view 4), each covered by one
// `describe` block below.

const TILE = 10;
const NO_DESTROYED: Destroyed = new Set();

/** '#' solid, '.' empty — same convention as spec/physics.test.ts's
 * makeLevel, so a reviewer reading both files doesn't have to learn a
 * second fixture format. */
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
      // '#' is always solid. '=' (fragile) reports solid here too — per
      // physics.ts's PhysicsLevel doc, a fragile tile reports solid from
      // `isSolidTile` until the caller's `destroyed` set says otherwise;
      // that suppression happens one layer up (in canOccupy), not here.
      const ch = row[tileX];
      return ch === "#" || ch === "=";
    },
  };
}

describe("hitboxes", () => {
  it("small is 8x10, large is 16x20 (plan.md §8)", () => {
    expect(HITBOX.small).toEqual({ width: 8, height: 10 });
    expect(HITBOX.large).toEqual({ width: 16, height: 20 });
  });
});

describe("a 1-tile gap admits small, refuses large — from the hitbox arithmetic", () => {
  // A single row corridor with a 1-tile-wide (10px) gap at column 5,
  // walled top and bottom so the only way through is that one column.
  const level = makeLevel(["##########", "####.#####", "##########"]);
  const gapX = 4 * TILE; // column 4 ('.' in "####.#####"), exactly one tile wide
  const gapY = 1 * TILE;

  it("the small hitbox (width 8) fits inside the 10px gap", () => {
    const box = HITBOX.small;
    // Centre the 8px body inside the 10px gap column.
    const x = gapX + (TILE - box.width) / 2;
    expect(canOccupy(x, gapY, box.width, box.height, level, NO_DESTROYED)).toBe(true);
  });

  it("the large hitbox (width 16) cannot fit inside the 10px gap at any horizontal offset", () => {
    const box = HITBOX.large;
    // Sweep every offset that keeps the body's left edge within the gap
    // column's tile — none of them can avoid straddling a solid neighbour,
    // because the body (16px) is wider than the gap (10px). This is the
    // "arithmetic, not a special case" the issue asks for: nothing here
    // hard-codes "large is refused", the geometry does.
    for (let offset = -6; offset <= 6; offset++) {
      expect(canOccupy(gapX + offset, gapY, box.width, box.height, level, NO_DESTROYED)).toBe(false);
    }
  });

  it("width 16 > gap width 10 is exactly why: no offset can avoid straddling a wall", () => {
    expect(HITBOX.large.width).toBeGreaterThan(TILE);
    expect(HITBOX.small.width).toBeLessThanOrEqual(TILE);
  });
});

describe("safe-growth predicate: canChangeSize / canOccupy", () => {
  it("growing in an open room succeeds and lands feet-aligned, centred", () => {
    const level = makeLevel([
      "..........",
      "..........",
      "..........",
      "..........",
      "##########",
    ]);
    // Small body standing on the floor, feet at y=30 (row 3's bottom).
    const x = 40;
    const y = 20; // top-left, so feet = 20 + 10 = 30
    const result = canChangeSize(x, y, "small", "large", level, NO_DESTROYED);
    expect(result.ok).toBe(true);
    // Feet should stay planted: new bottom === old bottom.
    expect(result.y + HITBOX.large.height).toBe(y + HITBOX.small.height);
  });

  it("growing where there is only 1 tile of headroom is refused (red-first case)", () => {
    // Only one clear row (row 1) exists at all — the ceiling sits directly
    // above it, in row 0. The small body fits in that single tile; the
    // large body needs a second tile above it that isn't there. This is
    // exactly the "bad G" shape spec/rooms.test.ts's fixture also
    // exercises, checked here directly against the physics-level
    // predicate rather than the room format.
    const level = makeLevel([
      "##########", // ceiling, directly above the only clear row
      "..........", // the body's feet — the only tile of headroom there is
      "##########", // floor
    ]);
    const x = 40;
    const y = 10; // feet at row 1's bottom (y=20)
    const result = canChangeSize(x, y, "small", "large", level, NO_DESTROYED);
    expect(result.ok).toBe(false);
  });

  it("growing where there are 2 tiles of headroom succeeds", () => {
    const level = makeLevel([
      "##########", // ceiling
      "..........", // headroom tile 1
      "..........", // headroom tile 2 / feet row
      "##########", // floor
    ]);
    const x = 40;
    const y = 20;
    const result = canChangeSize(x, y, "small", "large", level, NO_DESTROYED);
    expect(result.ok).toBe(true);
  });

  it("shrinking is always safe when the larger body already legally occupied that space", () => {
    const level = makeLevel([
      "..........",
      "..........",
      "..........",
      "..........",
      "##########",
    ]);
    const x = 40;
    const y = 10; // large body's feet at y=30
    // Sanity: the large body does legally fit here first.
    expect(canOccupy(x, y, HITBOX.large.width, HITBOX.large.height, level, NO_DESTROYED)).toBe(true);
    const result = canChangeSize(x, y, "large", "small", level, NO_DESTROYED);
    expect(result.ok).toBe(true);
  });

  it("a destroyed fragile tile opens up space that was previously refused", () => {
    const level = makeLevel([
      "##########",
      "###=......",
      "..........",
      "##########",
    ]);
    const x = 30; // column 3, right where the fragile tile ('=') sits
    const y = 10; // row 1 exactly (small body's height is one tile)
    const stillFragile: Destroyed = new Set();
    const broken: Destroyed = new Set(["3,1"]);
    expect(canOccupy(x, y, HITBOX.small.width, HITBOX.small.height, level, stillFragile)).toBe(false);
    expect(canOccupy(x, y, HITBOX.small.width, HITBOX.small.height, level, broken)).toBe(true);
  });
});

describe("sizeChangeAnchor: feet stay planted, body re-centres horizontally", () => {
  it("small->large keeps the bottom edge fixed and centres the wider box", () => {
    const anchor = sizeChangeAnchor(40, 20, "small", "large");
    expect(anchor.y + HITBOX.large.height).toBe(20 + HITBOX.small.height);
    const oldCenterX = 40 + HITBOX.small.width / 2;
    expect(anchor.x + HITBOX.large.width / 2).toBe(oldCenterX);
  });
});

describe("requestSizeChange: the state machine callers actually drive", () => {
  const openLevel = makeLevel([
    "..........",
    "..........",
    "..........",
    "..........",
    "##########",
  ]);
  const tightLevel = makeLevel(["##########", "..........", "##########"]);

  it("touching a growth pad while already large is a no-op", () => {
    const state = initialSizeState("large");
    const result = requestSizeChange(state, "large", 40, 10, openLevel, NO_DESTROYED);
    expect(result.triggered).toBe(false);
    expect(result.state).toBe(state);
  });

  it("touching coolant while already small is a no-op", () => {
    const state = initialSizeState("small");
    const result = requestSizeChange(state, "small", 40, 20, openLevel, NO_DESTROYED);
    expect(result.triggered).toBe(false);
    expect(result.state).toBe(state);
  });

  it("a legal grow request triggers, swaps size, and starts a transition", () => {
    const state = initialSizeState("small");
    const result = requestSizeChange(state, "large", 40, 20, openLevel, NO_DESTROYED);
    expect(result.triggered).toBe(true);
    expect(result.state.size).toBe("large");
    expect(result.state.transition).toEqual({ from: "small", to: "large", elapsedMs: 0 });
  });

  it("an unsafe grow request (no headroom) does not trigger and does not move the body", () => {
    const state = initialSizeState("small");
    const result = requestSizeChange(state, "large", 40, 5, tightLevel, NO_DESTROYED);
    expect(result.triggered).toBe(false);
    expect(result.state).toBe(state);
    expect(result.x).toBe(40);
    expect(result.y).toBe(5);
  });
});

describe("grow/shrink transition timing", () => {
  it("advances toward completion and then clears itself after ~0.6s", () => {
    let state = requestSizeChange(initialSizeState("small"), "large", 40, 20, makeLevel([
      "..........",
      "..........",
      "..........",
      "..........",
      "##########",
    ]), NO_DESTROYED).state;
    expect(state.transition).not.toBeNull();

    state = advanceSizeTransition(state, GROW_SHRINK_DURATION_MS / 2);
    expect(state.transition?.elapsedMs).toBe(GROW_SHRINK_DURATION_MS / 2);

    state = advanceSizeTransition(state, GROW_SHRINK_DURATION_MS / 2);
    expect(state.transition).toBeNull();
  });

  it("is a no-op when nothing is transitioning", () => {
    const state = initialSizeState("small");
    expect(advanceSizeTransition(state, 100)).toBe(state);
  });

  it("transitionScale is 1/1 outside a transition and bumps away from 1 mid-transition", () => {
    const idle = initialSizeState("small");
    expect(transitionScale(idle)).toEqual({ scaleX: 1, scaleY: 1 });

    const growing = { size: "large" as const, transition: { from: "small" as const, to: "large" as const, elapsedMs: GROW_SHRINK_DURATION_MS / 2 } };
    const scale = transitionScale(growing);
    expect(scale.scaleX).toBeLessThan(1);
    expect(scale.scaleY).toBeGreaterThan(1);
  });
});
