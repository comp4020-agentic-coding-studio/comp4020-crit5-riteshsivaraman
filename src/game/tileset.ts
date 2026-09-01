// The tileset itself: a fixed palette and one 10x10 character-grid literal
// per tile kind, per plan.md §4 ("Art: a real tileset, authored as code").
//
// This module is deliberately pure — it produces plain pixel data
// (Uint8ClampedArray, RGBA) and never touches a canvas. Baking that pixel
// data into an actual offscreen-canvas atlas is a render-time concern and
// belongs in render.ts (issue 2's constraints; spec/pure-modules.test.ts
// enforces it structurally by not allow-listing this file for browser
// APIs). Keeping tileset.ts pure is also what makes spec/legibility.test.ts
// possible without a DOM: it compares pixel arrays directly.
//
// Each tile literal is a row of the character grid mirrored in
// notes/agents/log.md's example. Palette keys are single characters that
// index PALETTE; they are independent of the ASCII level-format characters
// in tiles.ts ('a' here has nothing to do with any TileChar).
import { TILE, type TileKind } from "./tiles";

export type RGBA = readonly [number, number, number, number];

// Fixed palette. Terrain lives in charcoal / grey / muted brown / concrete
// beige / rust. The three mechanic colours (growth orange, coolant cyan,
// rewind violet) are reserved exclusively for their own tiles below —
// spec/legibility.test.ts asserts they never appear in a terrain tile, and
// that assertion holds by construction: only growthPad/coolant/
// rewindMachine's literals below use 'g'/'y'/'v'.
export const PALETTE: Record<string, RGBA> = {
  ".": [0, 0, 0, 0], // transparent — lets the floor/background show through
  a: [43, 43, 43, 255], // charcoal
  b: [90, 95, 102, 255], // slate grey
  c: [107, 74, 53, 255], // muted brown
  d: [168, 159, 140, 255], // concrete beige
  e: [138, 74, 43, 255], // rust
  g: [255, 140, 26, 255], // growth orange — mechanic colour, reserved
  y: [34, 229, 255, 255], // coolant cyan — mechanic colour, reserved
  v: [155, 48, 255, 255], // rewind violet — mechanic colour, reserved
};

export const MECHANIC_PALETTE_KEYS = ["g", "y", "v"] as const;

export type TileGrid = readonly string[]; // exactly TILE rows of exactly TILE chars

// One literal per TileKind. Chunky/industrial per notes/idea.md §21: mortar
// coursing and rivets on the solids, a genuinely different silhouette
// (voids, not just a recolour) on the fragile wall so it reads as breakable
// rather than merely "a different solid", and a soft glow ring for each
// mechanic tile so growth/coolant/rewind read as interactive at a glance.
export const TILE_GRIDS: Record<TileKind, TileGrid> = {
  empty: [
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],

  solidConcrete: [
    "dddddddddd",
    "dbdddbdddb",
    "dddddddddd",
    "aaaaaaaaaa",
    "dddddddddd",
    "dbdddbdddb",
    "dddddddddd",
    "aaaaaaaaaa",
    "dddddddddd",
    "dbdddbdddb",
  ],

  solidMetal: [
    "dbbbbbbbbd",
    "baabbbbaab",
    "bbbbbbbbbb",
    "bbccccccbb",
    "bbccccccbb",
    "bbccccccbb",
    "bbccccccbb",
    "bbbbbbbbbb",
    "baabbbbaab",
    "dbbbbbbbbd",
  ],

  // Cracked wall: brown/rust with void gaps, sharing no palette key at all
  // with solidConcrete's beige/grey/charcoal coursing. That makes the two
  // differ in effectively every pixel, comfortably clearing the ≥25%
  // legibility threshold — a player must tell fragile from solid without a
  // single word of help.
  fragile: [
    "eeee..eeee",
    "ece.ee.cec",
    "eeeeeee.ee",
    ".ecccccec.",
    "ecc.ee.cce",
    "ecc.ee.cce",
    ".ecccccec.",
    "eeeeeee.ee",
    "ece.ee.cec",
    "eeee..eeee",
  ],

  growthPad: [
    ".aaaaaaaa.",
    "agggggggga",
    "agg....gga",
    "ag.gggg.ga",
    "ag.gggg.ga",
    "ag.gggg.ga",
    "ag.gggg.ga",
    "agg....gga",
    "agggggggga",
    ".aaaaaaaa.",
  ],

  coolant: [
    ".aaaaaaaa.",
    "ayyyyyyyya",
    "ayy....yya",
    "ay.yyyy.ya",
    "ay.yyyy.ya",
    "ay.yyyy.ya",
    "ay.yyyy.ya",
    "ayy....yya",
    "ayyyyyyyya",
    ".aaaaaaaa.",
  ],

  rewindMachine: [
    ".aaaaaaaa.",
    "avvvvvvvva",
    "avv....vva",
    "av.vvvv.va",
    "av.vvvv.va",
    "av.vvvv.va",
    "av.vvvv.va",
    "avv....vva",
    "avvvvvvvva",
    ".aaaaaaaa.",
  ],

  // Spawn has no visual of its own — the player entity is drawn on top of
  // it — so it renders as an empty floor cell, same as "empty".
  spawn: [
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],

  // Exit: a dark doorway with a beige frame. Deliberately not one of the
  // reserved mechanic colours — reaching it is the goal, not a mechanic.
  exit: [
    "dddddddddd",
    "da......ad",
    "da......ad",
    "da......ad",
    "da......ad",
    "da......ad",
    "da......ad",
    "da......ad",
    "da......ad",
    "dddddddddd",
  ],

  // Non-colliding decor: a thin pipe/cable band across an otherwise
  // transparent tile.
  decor: [
    "..........",
    "..........",
    "..........",
    ".bbbbbbbb.",
    ".bccccccb.",
    ".bccccccb.",
    ".bbbbbbbb.",
    "..........",
    "..........",
    "..........",
  ],
};

function assertGrid(kind: TileKind, grid: TileGrid): void {
  if (grid.length !== TILE) {
    throw new Error(`tileset.ts: "${kind}" has ${grid.length} rows, expected ${TILE}`);
  }
  for (const [i, row] of grid.entries()) {
    if (row.length !== TILE) {
      throw new Error(
        `tileset.ts: "${kind}" row ${i} has ${row.length} chars, expected ${TILE}`,
      );
    }
    for (const ch of row) {
      if (!(ch in PALETTE)) {
        throw new Error(`tileset.ts: "${kind}" row ${i} uses unknown palette key "${ch}"`);
      }
    }
  }
}

for (const [kind, grid] of Object.entries(TILE_GRIDS) as [TileKind, TileGrid][]) {
  assertGrid(kind, grid);
}

/**
 * Render one tile's character grid to flat RGBA pixel data, row-major,
 * TILE*TILE*4 bytes. Pure — no canvas. render.ts bakes these into the
 * actual offscreen-canvas atlas at boot via ImageData/putImageData; this
 * function is what makes that bake-step trivial, and what lets
 * spec/legibility.test.ts assert on pixels without a DOM.
 */
export function tilePixels(kind: TileKind): Uint8ClampedArray {
  const grid = TILE_GRIDS[kind];
  const out = new Uint8ClampedArray(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    const row = grid[y];
    for (let x = 0; x < TILE; x++) {
      const [r, g, b, a] = PALETTE[row[x]];
      const i = (y * TILE + x) * 4;
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  }
  return out;
}

export function allTileKinds(): TileKind[] {
  return Object.keys(TILE_GRIDS) as TileKind[];
}

/** Simple Euclidean RGB distance — enough to confirm three reserved hues
 * are nowhere near each other; not intended as a full perceptual model. */
export function colourDistance(a: RGBA, b: RGBA): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
