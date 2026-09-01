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

  // Tripwire, not a vacuous pass — see file header. This is expected to
  // start FAILING the moment issue 9 lands real rooms; that failure is the
  // point, not a bug in this test.
  it("has no authored rooms yet (issue 9) — replace this with a real per-room loop once rooms exist", () => {
    const files = roomFiles();
    expect(files).toEqual([]);
  });

  it("(forward-looking) once rooms exist, every one of their G tiles must pass clearance", () => {
    const files = roomFiles();
    if (files.length === 0) {
      // Nothing to check yet — the tripwire test above is what makes that
      // fact visible, not this one going quietly green over zero rooms.
      return;
    }
    // No dynamic import here: issue 9's room modules don't have an agreed
    // export shape yet (plan.md §5 lists `rooms/room1.ts` etc. but issue 9
    // is the one that decides what they export). Fail loudly so a human
    // wires this up for real instead of it staying a silent no-op forever.
    throw new Error(
      `spec/rooms.test.ts: found room files ${JSON.stringify(files)} but this test was never ` +
        "updated to import and validate them — fix this test, don't skip it.",
    );
  });
});
