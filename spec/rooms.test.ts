import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLevel } from "../src/game/level";
import { validateGrowthPadClearance } from "../src/game/player";

// Issue 4's Done-when: "every G in every room has 2 tiles headroom and 2
// tiles width — a bad room layout fails the check, not the playtest."
//
// The trap (this issue's brief, and notes/agents/log.md [#4]): issue 9
// hasn't authored any real rooms yet, so a naive
// `for (const room of realRooms) { ... }` loop has zero iterations right
// now and would pass green while checking nothing — exactly the failure
// mode spec/pure-modules.test.ts already shipped once (an allow-list of
// every file that existed, asserted against zero of them). Two things
// guard against that here:
//
//   1. The actual checker (`validateGrowthPadClearance`) is exercised
//      directly against explicit fixtures below, including one
//      deliberately bad `G` (1 tile of headroom) that MUST fail — proven
//      red-first in this issue's report, not just asserted here.
//   2. `src/game/rooms/` is scanned for real room modules. Right now that
//      scan finds none, and the test below asserts exactly that — loudly,
//      by name, not via `.skip` — so the day issue 9 adds
//      `src/game/rooms/room1.ts` etc., this test starts failing and
//      *forces* whoever lands that issue to replace it with a real loop
//      over the authored rooms, rather than the check silently continuing
//      to pass over content it never looked at.
const ROOMS_DIR = join(process.cwd(), "src", "game", "rooms");

function roomFiles(): string[] {
  try {
    return readdirSync(ROOMS_DIR).filter((name) => name.endsWith(".ts"));
  } catch {
    return [];
  }
}

describe("spec/rooms.test.ts: growth-pad clearance (plan.md §8)", () => {
  it("GOOD fixture: a G with 2 tiles headroom and 2 tiles width passes", () => {
    const level = parseLevel([
      "##########",
      "#P......E#",
      "#..G......",
      "#.........",
      "##########",
    ]);
    const result = validateGrowthPadClearance(level);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("BAD fixture: a G with only 1 tile of headroom MUST fail — proven red-first", () => {
    // Ceiling sits directly one tile above the pad's own row, so the
    // 2-tile-tall clearance block (pad row + row above) is blocked.
    const level = parseLevel([
      "##########",
      "#..#......", // ceiling immediately above the G
      "#..G......",
      "#..P....E.",
      "##########",
    ]);
    const result = validateGrowthPadClearance(level);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toMatchObject({ x: 3, y: 2 });
  });

  it("BAD fixture: a G with only 1 tile of width MUST fail", () => {
    // Solid tile immediately to the right of the pad blocks the
    // 2-tile-wide clearance block (pad column + column to its right).
    const level = parseLevel([
      "##########",
      "#P........",
      "#..G#.....", // wall directly beside the pad
      "#.......E.",
      "##########",
    ]);
    const result = validateGrowthPadClearance(level);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("a level with no growth pads at all trivially passes (nothing to violate)", () => {
    const level = parseLevel(["#####", "#P.E#", "#####"]);
    expect(validateGrowthPadClearance(level).ok).toBe(true);
  });

  it("a fragile wall in the clearance zone counts as blocking (undestroyed) — bad", () => {
    const level = parseLevel([
      "##########",
      "#..=......", // fragile directly above the pad
      "#..G......",
      "#P......E.",
      "##########",
    ]);
    expect(validateGrowthPadClearance(level).ok).toBe(false);
  });

  // Issue 9 landed real rooms — the tripwire above has done its job (this
  // suite no longer passes vacuously) and is replaced with the real loop
  // it was demanding. `rooms/index.ts`'s ordering array is the single
  // source of truth main.ts also consumes, so this test and the actual
  // game check the same four levels.
  it("every authored room has at least one file under src/game/rooms/", () => {
    const files = roomFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  it("every G tile in every authored room passes growth-pad clearance", async () => {
    const { rooms } = await import("../src/game/rooms/index");
    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      const result = validateGrowthPadClearance(room);
      expect(result.violations).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });
});
