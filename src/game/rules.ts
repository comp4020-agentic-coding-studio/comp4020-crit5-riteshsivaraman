// The graded rules: plan.md §5 lists this file as "isRoomDead(world),
// hasWon(world)" and §6 as the loss condition's home. Pure — no browser
// API, no randomness, no clock reads (plan.md §5's dependency rule;
// spec/pure-modules.test.ts enforces this on every file under src/game
// except render.ts/input.ts).
//
// Issue #7's brief (notes/agents/log.md), read verbatim: "Design your
// predicates to be callable from a test-only solver: pure, exported,
// taking explicit state rather than reading module-level globals." That
// is the whole reason `RoomState` below exists and is shaped exactly like
// plan.md §7's solver states — `(tileX, tileY, size, destroyedMask,
// anchor)` — rather than like world.ts's `World` (which has no player
// position at all; player.ts/world.ts split position out into
// `main.ts`'s own `playerBody`). A fatal predicate that only reads
// `destroyed`/`anchor` (plan.md §6's own example,
// `room3: (w) => w.destroyed.has("41,9") && !canReachCoolant(w)`) simply
// ignores the position fields; a predicate that needs "is the player
// currently standing in X" has them available. Issue #8 (the solver) is
// expected to import `RoomState`, `FatalPredicate`, and `isRoomDead` from
// this file directly — see this file's tail for the exact shape.
import type { Size } from "./player";
import type { Anchor } from "./rewind";

// ---------------------------------------------------------------------------
// RoomState — the one shape every fatal predicate (and the solver) sees
// ---------------------------------------------------------------------------

/**
 * Everything a fatal predicate — or the solver's BFS (plan.md §7) — needs
 * to decide "is this room dead from here", in tile coordinates (not
 * pixels; a predicate reasons about which cell the player occupies, not
 * sub-pixel position, and the solver's state space is tile-granular by
 * construction). Deliberately does NOT carry a `Level` or `World`
 * reference: a predicate that closed over either would no longer be a
 * pure function of *this* state, which is exactly what would make it
 * uncallable from a solver walking a synthetic state space that was never
 * assembled into a real `Level`/`World` object.
 */
export type RoomState = {
  /** Tile the player's feet currently occupy. */
  readonly playerTileX: number;
  readonly playerTileY: number;
  readonly size: Size;
  /** "x,y" keys of fragile tiles already broken — world.ts's `destroyed`,
   * passed through unchanged (same `ReadonlySet<string>` shape
   * world.ts/rewind.ts/player.ts already share, no adapter needed). */
  readonly destroyed: ReadonlySet<string>;
  /** The currently armed rewind anchor, or `null` if none has been armed
   * yet this room — world.ts's `anchor` field (plan.md §6), or
   * `rewind.ts`'s `ArmedState.anchor` in the actual wiring. */
  readonly anchor: Anchor | null;
};

/**
 * A room's own authored fatal predicate (plan.md §6): "an authored
 * condition that means this room is now dead." Room modules (issue #9)
 * build a small array of these and hand it to `parseLevel` (level.ts's
 * `fatal: FatalPredicate[]`); this file is the one place that both defines
 * the type and evaluates it (`isRoomDead` below) — level.ts only carries
 * the array through opaquely, per its own header comment.
 */
export type FatalPredicate = (state: RoomState) => boolean;

export type Status = "playing" | "lost" | "won";

// ---------------------------------------------------------------------------
// isRoomDead — the runtime loss check
// ---------------------------------------------------------------------------

/**
 * Is `state` dead, per any one of `fatal`'s authored predicates? Runtime
 * evaluation is exact and cheap (plan.md §6: "not a general solver at
 * runtime") — this is a single `.some()` over an authored, room-sized
 * list, never a search. An empty `fatal` list (rooms 1 and 2, per plan.md
 * §9: "no loss is possible here") always returns `false` — there is
 * nothing to evaluate, not a vacuous true.
 */
export function isRoomDead(state: RoomState, fatal: readonly FatalPredicate[]): boolean {
  return fatal.some((predicate) => predicate(state));
}

// ---------------------------------------------------------------------------
// hasWon — reaching the exit
// ---------------------------------------------------------------------------

/**
 * Has the player's feet-tile reached the level's `exit` cell? plan.md §6:
 * "Reaching E in the finale sets won." Exit reachability itself is the
 * solver's job (plan.md §7, bullet 1) — this is only the trivial
 * "are we standing on it" check that fires the transition, same as any
 * other tile-touch decision in this codebase (`requestSizeChange`'s
 * growth/coolant check, `enterRewindTile`'s machine check).
 */
export function hasWon(state: RoomState, exit: { readonly x: number; readonly y: number }): boolean {
  return state.playerTileX === exit.x && state.playerTileY === exit.y;
}

// ---------------------------------------------------------------------------
// nextStatus — the one place "playing" -> "lost"/"won" is decided
// ---------------------------------------------------------------------------

/**
 * plan.md §6's `World.status`, advanced by one frame's worth of `state`.
 * `"lost"`/`"won"` are sticky — once either holds, this returns the same
 * status forever regardless of what `state` says next (only a restart,
 * which rebuilds a fresh `RoomState` from spawn, ever moves off either).
 * That stickiness is what stops a player who is already on the loss
 * screen from being bounced back to "playing" by their own last frame of
 * momentum carrying the feet tile off the fatal cell.
 */
export function nextStatus(
  current: Status,
  state: RoomState,
  fatal: readonly FatalPredicate[],
  exit: { readonly x: number; readonly y: number },
): Status {
  if (current !== "playing") return current;
  if (isRoomDead(state, fatal)) return "lost";
  if (hasWon(state, exit)) return "won";
  return "playing";
}
