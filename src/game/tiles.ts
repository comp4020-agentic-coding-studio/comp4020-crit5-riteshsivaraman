// Tile format: plan.md §8. Pure data + pure queries, no browser API, no
// randomness, no clock reads — importable into vitest with no DOM at all.
// This is the single source of truth for "what does this ASCII character
// mean", shared by level.ts (parsing) and tileset.ts (art).

/** Tile size in pixels. Load-bearing: every clearance constant, hitbox, and
 * room layout is authored against this. See notes/agents/log.md [#2 #9] for
 * the decision to keep this at 10 rather than the 16px CC0 fallback. */
export const TILE = 10;

/** One screen, per plan.md §8. */
export const ROOM_WIDTH_TILES = 32;
export const ROOM_HEIGHT_TILES = 18;

export type TileChar = "." | "#" | "%" | "=" | "G" | "C" | "R" | "P" | "E" | ":";

export type TileKind =
  | "empty"
  | "solidConcrete"
  | "solidMetal"
  | "fragile"
  | "growthPad"
  | "coolant"
  | "rewindMachine"
  | "spawn"
  | "exit"
  | "decor";

const CHAR_TO_KIND: Record<TileChar, TileKind> = {
  ".": "empty",
  "#": "solidConcrete",
  "%": "solidMetal",
  "=": "fragile",
  G: "growthPad",
  C: "coolant",
  R: "rewindMachine",
  P: "spawn",
  E: "exit",
  ":": "decor",
};

const VALID_CHARS = new Set(Object.keys(CHAR_TO_KIND));

/** Kinds that are always solid, regardless of destruction state. */
const ALWAYS_SOLID_KINDS: ReadonlySet<TileKind> = new Set<TileKind>([
  "solidConcrete",
  "solidMetal",
]);

export function isTileChar(ch: string): ch is TileChar {
  return VALID_CHARS.has(ch);
}

export function tileKindForChar(ch: string): TileKind {
  if (!isTileChar(ch)) {
    throw new Error(`level.ts: unknown tile character "${ch}"`);
  }
  return CHAR_TO_KIND[ch];
}

/**
 * Is this tile kind solid geometry right now? `=` (fragile) is solid until
 * destroyed, per plan.md §6/§8 — the caller supplies whether *this specific
 * cell* has been broken. Every other kind's solidity never changes.
 */
export function isSolidKind(kind: TileKind, destroyed: boolean): boolean {
  if (kind === "fragile") return !destroyed;
  return ALWAYS_SOLID_KINDS.has(kind);
}

export function isSolidChar(ch: TileChar, destroyed: boolean): boolean {
  return isSolidKind(tileKindForChar(ch), destroyed);
}

export function isFragileKind(kind: TileKind): boolean {
  return kind === "fragile";
}
