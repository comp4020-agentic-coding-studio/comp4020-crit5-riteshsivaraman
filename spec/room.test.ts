import { describe, expect, it } from "vitest";
import { parseLevel, isSolidAt, type Level } from "../src/game/level";
import { freshRoomState } from "../src/game/room";
import { breakTile, createWorld } from "../src/game/world";
import { arm, rewind } from "../src/game/rewind";
import { HITBOX, canOccupy, initialSizeState, spawnPosition } from "../src/game/player";
import type { PhysicsLevel } from "../src/game/physics";

// Issue #7's Done-when, made testable: "destroyed empty, anchor/armed null,
// player at spawn" was previously only true because restartRoom() (main.ts)
// happened to say so — nothing failed if a future edit dropped one of its
// five reassignments. freshRoomState() (src/game/room.ts) is that reset,
// extracted so this file can assert on it directly.
//
//   ######
//   #P..E#
//   ######
function makeRoom(): Level {
  return parseLevel(["######", "#P..E#", "######"]);
}

describe("freshRoomState: every field the reset depends on, asserted individually", () => {
  // Each `it` below checks exactly one field of FreshRoomState. That's
  // deliberate, not stylistic: a single `expect(fresh).toEqual({...})`
  // would catch a *wrong* value but not a future field that's simply never
  // written back to by main.ts — splitting the assertions means deleting
  // any one reassignment in the implementation turns exactly one of these
  // tests red, never zero.
  const level = makeRoom();

  it("clears destroyed", () => {
    const fresh = freshRoomState(level, "small");
    expect(fresh.world.destroyed.size).toBe(0);
  });

  it("resets sizeState to the requested spawn size", () => {
    const fresh = freshRoomState(level, "small");
    expect(fresh.sizeState.size).toBe("small");
  });

  it("resets sizeState's transition to null, not just its size", () => {
    const fresh = freshRoomState(level, "small");
    expect(fresh.sizeState).toEqual(initialSizeState("small"));
  });

  it("places the body at spawn, at the requested size's hitbox", () => {
    const fresh = freshRoomState(level, "small");
    const spawn = spawnPosition(level.spawn, "small");
    expect(fresh.body.x).toBe(spawn.x);
    expect(fresh.body.y).toBe(spawn.y);
    expect(fresh.body.width).toBe(HITBOX.small.width);
    expect(fresh.body.height).toBe(HITBOX.small.height);
  });

  it("zeroes the body's velocity and jump state — a restart mid-fall or mid-jump-buffer must not carry over", () => {
    const fresh = freshRoomState(level, "small");
    expect(fresh.body.vx).toBe(0);
    expect(fresh.body.vy).toBe(0);
    expect(fresh.body.grounded).toBe(false);
    expect(fresh.body.coyoteMs).toBe(0);
    expect(fresh.body.jumpBufferMs).toBe(0);
    expect(fresh.body.jumpHeldPrev).toBe(false);
  });

  it("clears the armed anchor — the Reviewer's finding: a stale anchor surviving a restart could place the body inside geometry the restart just re-solidified", () => {
    const fresh = freshRoomState(level, "small");
    expect(fresh.armed).toBeNull();
  });

  it("clears wasOnRewindTile — an edge-trigger bit that must not carry into the new room", () => {
    const fresh = freshRoomState(level, "small");
    expect(fresh.wasOnRewindTile).toBe(false);
  });

  it("respects a non-default requested size (large, at a growth-room spawn)", () => {
    const fresh = freshRoomState(level, "large");
    const spawn = spawnPosition(level.spawn, "large");
    expect(fresh.sizeState.size).toBe("large");
    expect(fresh.body.width).toBe(HITBOX.large.width);
    expect(fresh.body.height).toBe(HITBOX.large.height);
    expect(fresh.body.x).toBe(spawn.x);
    expect(fresh.body.y).toBe(spawn.y);
  });
});

// The actual defect, end to end, across the real modules — same shape as
// spec/rewind-destruction.test.ts, extended one step further to the
// restart the Reviewer pass flagged: an anchor armed in a cell whose own
// footprint overlaps a fragile tile — occupiable only once that tile is
// destroyed — must not survive a restart to be rewound into solid
// geometry once the tile is solid again.
//
//   ..E.     row 0 — anchor's footprint is (2,0)-(3,1)
//   ...=     row 1 — fragile at (3,1): solid until a large body breaks it
//   ####     row 2 — floor
//   P...     row 3 — spawn
describe("restart x rewind: the Reviewer's confirmed defect, closed", () => {
  const ROWS = ["..E.", "...=", "####", "P..."] as const;

  function fixture() {
    const level = parseLevel([...ROWS]);
    const physicsFor = (destroyed: ReadonlySet<string>): PhysicsLevel => ({
      tileSize: 10,
      widthPx: level.width * 10,
      heightPx: level.height * 10,
      isSolidTile: (x, y) => isSolidAt(level, x, y, destroyed),
    });
    return { level, physicsFor };
  }

  it("an anchor armed only because a wall was destroyed is discarded by restart, so a post-restart rewind cannot land inside re-solidified geometry", () => {
    const { level, physicsFor } = fixture();

    // Before the break, a large body's footprint at (20,0) (tiles
    // (2,0)-(3,1)) overlaps the still-solid fragile tile — arm() refuses.
    const beforeBreak = arm(20, 0, "large", physicsFor(new Set()), new Set());
    expect(beforeBreak).toBeNull();

    // A large body breaks the fragile tile at (3, 1), opening the cell.
    let world = createWorld();
    world = breakTile(world, 3, 1, "large", level);
    expect(world.destroyed.has("3,1")).toBe(true);

    // Now the same arm() call succeeds — this anchor only exists because
    // of the break, faithful to the "reachable-but-never-armed" scenario
    // the Reviewer pass reasoned about.
    const anchor = arm(20, 0, "large", physicsFor(world.destroyed), world.destroyed);
    expect(anchor).not.toBeNull();

    // Sanity check: rewinding right now (no restart) is safe — this is
    // exactly what spec/rewind-destruction.test.ts already covers.
    const beforeRestart = rewind({
      x: 30,
      y: 10,
      size: "large" as const,
      anchor,
      destroyed: world.destroyed,
    });
    expect(beforeRestart.triggered).toBe(true);
    expect(
      canOccupy(
        beforeRestart.x,
        beforeRestart.y,
        HITBOX.large.width,
        HITBOX.large.height,
        physicsFor(world.destroyed),
        world.destroyed,
      ),
    ).toBe(true);

    // Restart the room. freshRoomState is what main.ts's restartRoom()
    // actually calls — this proves the *reset*, not a hand-simulated one.
    const fresh = freshRoomState(level, "small");

    // The wall (3,1) is solid again.
    expect(fresh.world.destroyed.has("3,1")).toBe(false);

    // The bug this closes: without freshRoomState clearing `armed`, a
    // caller could still be holding the pre-restart anchor here and feed
    // it into rewind() against the fresh (empty) `destroyed` set. Confirm
    // that would indeed have placed the body inside solid geometry — i.e.
    // this isn't a hypothetical the fix is guarding against nothing.
    const ifAnchorHadSurvived = rewind({
      x: 30,
      y: 10,
      size: anchor!.size,
      anchor,
      destroyed: fresh.world.destroyed,
    });
    expect(ifAnchorHadSurvived.triggered).toBe(true);
    expect(
      canOccupy(
        ifAnchorHadSurvived.x,
        ifAnchorHadSurvived.y,
        HITBOX[anchor!.size].width,
        HITBOX[anchor!.size].height,
        physicsFor(fresh.world.destroyed),
        fresh.world.destroyed,
      ),
    ).toBe(false); // (3,1) is solid again — the stale anchor would land inside it

    // What freshRoomState actually guarantees: `armed` is null, so a
    // caller wired the way main.ts is (feeding `armed?.anchor ?? null`
    // into rewind()) attempts no rewind at all post-restart.
    expect(fresh.armed).toBeNull();
    const afterRestart = rewind({
      x: 30,
      y: 10,
      size: fresh.sizeState.size,
      anchor: fresh.armed?.anchor ?? null,
      destroyed: fresh.world.destroyed,
    });
    expect(afterRestart.triggered).toBe(false);
    // triggered: false means x/y/size pass through unchanged — the body
    // stays wherever it already validly was, never teleported into (3,1).
    expect(afterRestart.x).toBe(30);
    expect(afterRestart.y).toBe(10);
  });
});
