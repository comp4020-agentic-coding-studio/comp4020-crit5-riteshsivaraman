import { describe, expect, it } from "vitest";
import { rooms } from "../src/game/rooms/index";
import { isSolidAt } from "../src/game/level";
import { createBody, stepBody, type PhysicsLevel } from "../src/game/physics";
import { HITBOX } from "../src/game/player";

// Room 3's rewind machine must be impossible to skip.
//
// Every dead state in room 3 requires reaching the growth pad without having
// armed the machine: grow with no small anchor and you can never be small
// again, because the coolant sits past a small-only gate. The fix is a ceiling
// over the approach so the machine cannot be jumped over.
//
// The solver cannot verify this. Its jump edge lands directly on a destination
// tile without modelling headroom at the origin (see solver.ts's header), so
// it still believes the hop is available and still reports those states as
// reachable-and-dead. Real physics does check collision, so the guarantee is
// asserted here, against stepBody, where it is actually decidable.
const room3 = rooms[2];
const TILE = 10;
const APPROACH_ROW = 14; // the floor lane P/R/G sit on
const MACHINE_COL = 4;

const level: PhysicsLevel = {
  tileSize: TILE,
  widthPx: room3.width * TILE,
  heightPx: room3.height * TILE,
  isSolidTile: (x, y) => isSolidAt(room3, x, y, new Set()),
};

/** Hold jump (and optionally a direction) from a standing start, and report
 *  the highest point the body reaches. */
function highestReached(startCol: number, dir: "left" | "right" | "none"): number {
  let body = createBody(
    startCol * TILE,
    APPROACH_ROW * TILE + (TILE - HITBOX.small.height),
    HITBOX.small.width,
    HITBOX.small.height,
  );
  const input = { left: dir === "left", right: dir === "right", jumpHeld: true };
  let highest = body.y;
  for (let i = 0; i < 90; i += 1) {
    body = stepBody(body, input, level, new Set());
    highest = Math.min(highest, body.y);
  }
  return highest;
}

describe("room 3: the rewind machine cannot be skipped", () => {
  it("the approach columns are roofed in the map itself", () => {
    for (let col = 1; col <= MACHINE_COL + 1; col += 1) {
      expect(
        isSolidAt(room3, col, APPROACH_ROW - 1, new Set()),
        `column ${col} has open headroom above the approach lane, so the machine can be jumped over`,
      ).toBe(true);
    }
  });

  it("a small body on the approach cannot rise out of the lane, however it jumps", () => {
    const floorTop = APPROACH_ROW * TILE;
    for (let col = 1; col <= MACHINE_COL + 1; col += 1) {
      for (const dir of ["none", "left", "right"] as const) {
        expect(
          highestReached(col, dir),
          `from column ${col} moving ${dir}, the body left the approach lane`,
        ).toBeGreaterThanOrEqual(floorTop - HITBOX.small.height + 1);
      }
    }
  });

  it("the machine and the growth pad are still on that lane, in that order", () => {
    const row = room3.grid[APPROACH_ROW].join("");
    expect(row[MACHINE_COL]).toBe("R");
    expect(row.indexOf("G")).toBeGreaterThan(MACHINE_COL);
  });
});
