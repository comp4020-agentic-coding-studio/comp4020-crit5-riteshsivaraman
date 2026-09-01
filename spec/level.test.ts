import { describe, expect, it } from "vitest";
import { isSolidAt, parseLevel, tileKindAt } from "../src/game/level";
import { TILE } from "../src/game/tiles";

// Fixture map exercising every character in plan.md §8's alphabet.
const FIXTURE = [
  "##########",
  "#P.:..G..#",
  "#.####...#",
  "#.=..C...#",
  "#.=..R..E#",
  "##########",
];

describe("level.ts: parseLevel", () => {
  it("TILE is 10 (load-bearing, see notes/agents/log.md [#2 #9])", () => {
    expect(TILE).toBe(10);
  });

  it("parses a fixture map to the expected grid dimensions, spawn, and exit", () => {
    const level = parseLevel(FIXTURE);
    expect(level.width).toBe(10);
    expect(level.height).toBe(6);
    expect(level.spawn).toEqual({ x: 1, y: 1 });
    expect(level.exit).toEqual({ x: 8, y: 4 });
  });

  it("collects G/C/R as entities, not the spawn or exit", () => {
    const level = parseLevel(FIXTURE);
    expect(level.entities).toEqual(
      expect.arrayContaining([
        { type: "growth", x: 6, y: 1 },
        { type: "coolant", x: 5, y: 3 },
        { type: "rewind", x: 5, y: 4 },
      ]),
    );
    expect(level.entities).toHaveLength(3);
  });

  it("passes fatal predicates through unevaluated", () => {
    const fatal = [() => true];
    const level = parseLevel(FIXTURE, fatal);
    expect(level.fatal).toBe(fatal);
  });

  const empty = new Set<string>();

  it("# and % are solid", () => {
    const level = parseLevel(FIXTURE);
    expect(isSolidAt(level, 0, 0, empty)).toBe(true); // '#'
    const withMetal = parseLevel(["P.%", "...", "..E"]);
    expect(isSolidAt(withMetal, 2, 0, empty)).toBe(true); // '%'
  });

  it(". : G C R E are not solid", () => {
    const level = parseLevel(FIXTURE);
    expect(isSolidAt(level, 2, 1, empty)).toBe(false); // '.'
    expect(isSolidAt(level, 3, 1, empty)).toBe(false); // ':'
    expect(isSolidAt(level, 6, 1, empty)).toBe(false); // 'G'
    expect(isSolidAt(level, 5, 3, empty)).toBe(false); // 'C'
    expect(isSolidAt(level, 5, 4, empty)).toBe(false); // 'R'
    expect(isSolidAt(level, 8, 4, empty)).toBe(false); // 'E'
  });

  it("= is solid until destroyed, then not", () => {
    const level = parseLevel(FIXTURE);
    expect(isSolidAt(level, 2, 3, empty)).toBe(true);
    const destroyed = new Set(["2,3"]);
    expect(isSolidAt(level, 2, 3, destroyed)).toBe(false);
    // A different fragile cell at the same coordinates in another room is
    // untouched by that destroyed-set entry.
    expect(isSolidAt(level, 2, 4, destroyed)).toBe(true);
  });

  it("treats out-of-bounds as solid", () => {
    const level = parseLevel(FIXTURE);
    expect(isSolidAt(level, -1, 0, empty)).toBe(true);
    expect(isSolidAt(level, level.width, 0, empty)).toBe(true);
    expect(isSolidAt(level, 0, -1, empty)).toBe(true);
    expect(isSolidAt(level, 0, level.height, empty)).toBe(true);
  });

  it("tileKindAt resolves the tile kind for every character", () => {
    const level = parseLevel(FIXTURE);
    expect(tileKindAt(level, 0, 0)).toBe("solidConcrete");
    expect(tileKindAt(level, 2, 3)).toBe("fragile");
    expect(tileKindAt(level, 6, 1)).toBe("growthPad");
    expect(tileKindAt(level, 5, 3)).toBe("coolant");
    expect(tileKindAt(level, 5, 4)).toBe("rewindMachine");
    expect(tileKindAt(level, 8, 4)).toBe("exit");
    expect(tileKindAt(level, 1, 1)).toBe("spawn");
    expect(tileKindAt(level, 3, 1)).toBe("decor");
  });

  it("rejects a map with no spawn", () => {
    expect(() => parseLevel(["###", "#.E", "###"])).toThrow(/spawn/i);
  });

  it("rejects a map with no exit", () => {
    expect(() => parseLevel(["###", "#P.", "###"])).toThrow(/exit/i);
  });

  it("rejects ragged rows", () => {
    expect(() => parseLevel(["####", "#P.E", "###"])).toThrow(/ragged/i);
  });

  it("rejects an unknown character", () => {
    expect(() => parseLevel(["###", "#P?", "#.E"])).toThrow(/unknown tile character/i);
  });

  it("rejects an empty level", () => {
    expect(() => parseLevel([])).toThrow(/no rows/i);
  });

  it("rejects more than one spawn or exit", () => {
    expect(() => parseLevel(["PPE"])).toThrow(/more than one spawn/i);
    expect(() => parseLevel(["PEE"])).toThrow(/more than one exit/i);
  });
});
