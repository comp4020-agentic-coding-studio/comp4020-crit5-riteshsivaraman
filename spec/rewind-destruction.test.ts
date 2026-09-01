import { describe, expect, it } from "vitest";
import { parseLevel, isSolidAt } from "../src/game/level";
import { createWorld, breakTile, restart } from "../src/game/world";
import { arm, rewind } from "../src/game/rewind";
import { HITBOX } from "../src/game/player";
import type { PhysicsLevel } from "../src/game/physics";

// The crit's central invariant, end to end across the REAL modules.
//
// Issues 5 and 6 were built in parallel worktrees and could not import each
// other: `spec/rules.test.ts` proves rewind's half against a hand-made Set,
// and `spec/destruction.test.ts` proves world's half on its own. Neither runs
// the two together, so "destroy a wall, rewind, wall is still destroyed" was
// until now only ever asserted in simulation. This closes that seam.
//
//   R . . .      P spawn / anchor cell, R rewind machine
//   . . = .      = fragile wall, breakable by a large body only
//   # # # #
const ROWS = ["R..E", "..=.", "####", "P..."] as const;

function fixture() {
  const level = parseLevel([...ROWS]);
  const physics: PhysicsLevel = {
    tileSize: 10,
    widthPx: level.width * 10,
    heightPx: level.height * 10,
    isSolidTile: (x, y) => isSolidAt(level, x, y, new Set()),
  };
  return { level, physics };
}

describe("rewind x destruction: the invariant the Reviewer pass is reserved for", () => {
  it("a wall destroyed before a rewind is still destroyed after it", () => {
    const { level, physics } = fixture();
    let world = createWorld();

    // A large body breaks the fragile tile at (2,1).
    world = breakTile(world, 2, 1, "large", level);
    expect(world.destroyed.has("2,1")).toBe(true);

    // Arm an anchor somewhere the small body genuinely fits.
    const anchor = arm(0, 0, "small", physics, world.destroyed);
    expect(anchor).not.toBeNull();

    // Move away, then rewind.
    const out = rewind({
      x: 30, y: 10, size: "small", anchor, destroyed: world.destroyed,
    });

    expect(out.triggered).toBe(true);
    expect(out.x).toBe(anchor!.x);
    expect(out.y).toBe(anchor!.y);
    expect(out.size).toBe(anchor!.size);

    // The world did not move. Reference identity, not just contents.
    expect(out.destroyed).toBe(world.destroyed);
    expect(out.destroyed.has("2,1")).toBe(true);
  });

  it("a rewind cannot reach the one path that does clear destruction", () => {
    const { level } = fixture();
    let world = createWorld();
    world = breakTile(world, 2, 1, "large", level);

    // restart() takes no World: there is no call shape by which a caller
    // holding only a World can partially clear it, and rewind() is handed
    // a `destroyed` set, never the World itself.
    const fresh = restart();
    expect(fresh.destroyed.size).toBe(0);
    expect(world.destroyed.has("2,1")).toBe(true);
  });

  it("a small body cannot break what a large body can", () => {
    const { level } = fixture();
    const world = createWorld();
    const after = breakTile(world, 2, 1, "small", level);
    expect(after.destroyed.size).toBe(0);
    expect(after).toBe(world); // idempotent by identity
  });

  it("the hitboxes the invariant depends on are the ones issue 4 published", () => {
    expect(HITBOX.small).toEqual({ width: 8, height: 10 });
    expect(HITBOX.large).toEqual({ width: 16, height: 20 });
  });
});
