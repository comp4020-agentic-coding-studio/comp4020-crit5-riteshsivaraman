// ASCII rows -> Level, per plan.md §5/§8. Pure: no browser API, no
// randomness, no clock reads. Rooms (issue 9, src/game/rooms/*.ts) call
// parseLevel with their ASCII art and their own fatal predicates.
import { isSolidChar, isTileChar, tileKindForChar, type TileChar, type TileKind } from "./tiles";
// Issue #7: rules.ts now exists and defines the concrete shape a fatal
// predicate actually takes (`RoomState` — see that file's header for why
// it's shaped like the solver's state, not like `World`/`Level`).
// Type-only import: rules.ts imports `Size`/`Anchor` (type-only) from
// player.ts/rewind.ts, neither of which imports level.ts at the type
// level in a way that would make this a real (value) cycle — see
// notes/agents/log.md [#7].
import type { RoomState } from "./rules";

export type EntityType = "growth" | "coolant" | "rewind";

export type Entity = {
  type: EntityType;
  x: number;
  y: number;
};

const ENTITY_TYPE_FOR_CHAR: Partial<Record<TileChar, EntityType>> = {
  G: "growth",
  C: "coolant",
  R: "rewind",
};

/**
 * A room's own fatal predicate — narrowed (issue #7) from the original
 * `(world: unknown) => boolean` placeholder to the real shape rules.ts's
 * `isRoomDead` evaluates against: `RoomState`, not `World`/`Level`. See
 * rules.ts's header for why the state is tile-position + size + destroyed
 * + anchor, rather than either of those richer types. level.ts still only
 * carries these opaquely from a room definition through to rules.ts —
 * this file never calls one itself.
 */
export type FatalPredicate = (state: RoomState) => boolean;

export type Level = {
  width: number;
  height: number;
  /** grid[y][x], row-major. Includes every cell, including P/E/entity
   * cells — solidity for any of those is always false (see tiles.ts). */
  grid: TileChar[][];
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  entities: Entity[];
  fatal: FatalPredicate[];
};

/**
 * Parse ASCII rows (plan.md §8's alphabet) into a Level. Throws on:
 *  - no rows at all
 *  - ragged rows (not all the same length)
 *  - an unknown character
 *  - no `P` (spawn) anywhere
 *  - no `E` (exit) anywhere
 * `fatal` is passed through unevaluated — parseLevel does not know what a
 * World looks like, only rules.ts (issue 7) does.
 */
export function parseLevel(rows: readonly string[], fatal: FatalPredicate[] = []): Level {
  if (rows.length === 0) {
    throw new Error("level.ts: level has no rows");
  }

  const width = rows[0].length;
  for (const [y, row] of rows.entries()) {
    if (row.length !== width) {
      throw new Error(
        `level.ts: ragged level — row 0 has ${width} chars, row ${y} has ${row.length}`,
      );
    }
  }

  const grid: TileChar[][] = [];
  const entities: Entity[] = [];
  let spawn: { x: number; y: number } | null = null;
  let exit: { x: number; y: number } | null = null;

  for (let y = 0; y < rows.length; y++) {
    const gridRow: TileChar[] = [];
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      if (!isTileChar(ch)) {
        throw new Error(`level.ts: unknown tile character "${ch}" at (${x}, ${y})`);
      }
      gridRow.push(ch);

      if (ch === "P") {
        if (spawn !== null) {
          throw new Error(`level.ts: more than one spawn ("P") — first at ${spawn.x},${spawn.y}, also at ${x},${y}`);
        }
        spawn = { x, y };
      } else if (ch === "E") {
        if (exit !== null) {
          throw new Error(`level.ts: more than one exit ("E") — first at ${exit.x},${exit.y}, also at ${x},${y}`);
        }
        exit = { x, y };
      }

      const entityType = ENTITY_TYPE_FOR_CHAR[ch];
      if (entityType) {
        entities.push({ type: entityType, x, y });
      }
    }
    grid.push(gridRow);
  }

  if (spawn === null) {
    throw new Error('level.ts: level has no spawn ("P")');
  }
  if (exit === null) {
    throw new Error('level.ts: level has no exit ("E")');
  }

  return {
    width,
    height: rows.length,
    grid,
    spawn,
    exit,
    entities,
    fatal,
  };
}

/**
 * Is the cell at (x, y) solid right now? `destroyed` holds "x,y" keys of
 * fragile tiles already broken in this room — see plan.md §6, world.ts.
 * Out-of-bounds counts as solid (a wall around the room), matching how a
 * physics step or the solver would want to treat the edge of the level.
 */
export function isSolidAt(level: Level, x: number, y: number, destroyed: ReadonlySet<string>): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
    return true;
  }
  const ch = level.grid[y][x];
  return isSolidChar(ch, destroyed.has(`${x},${y}`));
}

export function tileKindAt(level: Level, x: number, y: number): TileKind {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
    return "solidConcrete";
  }
  return tileKindForChar(level.grid[y][x]);
}
