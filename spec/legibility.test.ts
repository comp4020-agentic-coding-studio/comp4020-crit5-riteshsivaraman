import { describe, expect, it } from "vitest";
import {
  colourDistance,
  MECHANIC_PALETTE_KEYS,
  PALETTE,
  TILE_GRIDS,
  allTileKinds,
  tilePixels,
} from "../src/game/tileset";
import { TILE } from "../src/game/tiles";

// The no-tutorial rule (plan.md §2) means visual legibility *is* the
// tutorial: a player must tell fragile from solid, and one mechanic from
// another, with zero text to help. This sensor is what turns that into a
// check rather than a hope — see notes/agents/log.md [#2 #9].

// A colour distance below which we'd call two hues "not reliably
// distinguishable" at a glance. The three mechanic colours are picked to
// clear this by a wide margin (>200 each, see tileset.ts's comments); this
// threshold is intentionally generous so the test is about a real
// perceptual gap, not a hairline pass.
const DISTINGUISHABLE_THRESHOLD = 80;

const TERRAIN_KINDS = ["empty", "solidConcrete", "solidMetal", "fragile", "spawn", "exit", "decor"] as const;

describe("legibility sensor: tileset.ts", () => {
  it("every tile literal is exactly TILE rows of exactly TILE characters, each resolving to a palette entry", () => {
    for (const kind of allTileKinds()) {
      const grid = TILE_GRIDS[kind];
      expect(grid.length, `${kind} row count`).toBe(TILE);
      for (const [i, row] of grid.entries()) {
        expect(row.length, `${kind} row ${i} length`).toBe(TILE);
        for (const ch of row) {
          expect(ch in PALETTE, `${kind} row ${i} char "${ch}" is a palette key`).toBe(true);
        }
      }
    }
  });

  it("fragile ('=') differs from solid concrete ('#') in at least 25% of its pixels", () => {
    const fragile = tilePixels("fragile");
    const solid = tilePixels("solidConcrete");
    let differing = 0;
    const totalPixels = TILE * TILE;
    for (let p = 0; p < totalPixels; p++) {
      const i = p * 4;
      const same =
        fragile[i] === solid[i] &&
        fragile[i + 1] === solid[i + 1] &&
        fragile[i + 2] === solid[i + 2] &&
        fragile[i + 3] === solid[i + 3];
      if (!same) differing++;
    }
    expect(differing / totalPixels).toBeGreaterThanOrEqual(0.25);
  });

  it("the three mechanic colours are mutually distinguishable", () => {
    const colours = MECHANIC_PALETTE_KEYS.map((key) => PALETTE[key]);
    for (let i = 0; i < colours.length; i++) {
      for (let j = i + 1; j < colours.length; j++) {
        expect(
          colourDistance(colours[i], colours[j]),
          `${MECHANIC_PALETTE_KEYS[i]} vs ${MECHANIC_PALETTE_KEYS[j]}`,
        ).toBeGreaterThan(DISTINGUISHABLE_THRESHOLD);
      }
    }
  });

  it("mechanic colours never appear in a terrain tile", () => {
    for (const kind of TERRAIN_KINDS) {
      const flat = TILE_GRIDS[kind].join("");
      for (const key of MECHANIC_PALETTE_KEYS) {
        expect(flat.includes(key), `${kind} contains mechanic key "${key}"`).toBe(false);
      }
    }
  });

  it("each mechanic tile uses only its own reserved colour, not the other two", () => {
    const owners = { growthPad: "g", coolant: "y", rewindMachine: "v" } as const;
    for (const [kind, ownKey] of Object.entries(owners) as [keyof typeof owners, string][]) {
      const flat = TILE_GRIDS[kind].join("");
      for (const key of MECHANIC_PALETTE_KEYS) {
        if (key === ownKey) continue;
        expect(flat.includes(key), `${kind} contains foreign mechanic key "${key}"`).toBe(false);
      }
    }
  });
});
