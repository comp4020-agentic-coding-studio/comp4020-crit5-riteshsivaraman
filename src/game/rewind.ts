// Rewind machine: issue #6, the game's central invariant (plan.md §6, §10).
// Pure — no browser API, no randomness, no clock read (plan.md §5's
// dependency rule; spec/pure-modules.test.ts enforces this on every file
// under src/game except render.ts/input.ts).
//
// Deliberately does NOT import world.ts. Issue #5 owns `src/game/world.ts`
// (the `destroyed` set, `breakTile`, `restart`) and is building it right
// now in a parallel worktree this session cannot see. Rather than create a
// second, competing world module on the one invariant that matters most,
// this module takes exactly the structural shape it needs as parameters —
// the same pattern physics.ts uses with `PhysicsLevel` (never `level.ts`'s
// `Level`) and render.ts uses with `RenderCtx` (never
// `CanvasRenderingContext2D`). See notes/agents/log.md [#6].
//
// The load-bearing design choice is in `rewind()` below, not in a comment
// promising good behaviour: its `destroyed` parameter is typed as an
// unconstrained generic `D`, not `Destroyed`/`ReadonlySet<string>`. The
// function body therefore has no way to call `.add`/`.delete`/`.clear` (or
// anything else) on it — TypeScript does not know `D` has those methods,
// so a line that tried would fail to compile. "Cannot mutate `destroyed`"
// is a fact about this function's type signature, not a claim about
// today's implementation that a future edit could quietly break. The only
// thing `rewind()` can do with `destroyed` is hand back the exact
// reference it was given, which is what `spec/rules.test.ts` asserts.
import { canOccupy, HITBOX, type Size } from "./player";
import type { Destroyed, PhysicsLevel } from "./physics";

/** What a rewind machine remembers on arming — exactly `world.anchor`'s
 * shape per plan.md §6 (`{ x, y, size } | null`), defined here rather than
 * imported from world.ts per this issue's ownership split (see file
 * header). world.ts's `anchor` field can use this type directly. */
export type Anchor = { x: number; y: number; size: Size };

/**
 * Walking into an `R` machine arms it (plan.md's brief): store `{x, y,
 * size}`. Refuses — returns `null` — when the body at `(x, y)` with
 * `size`'s hitbox does not fit at that exact cell, per plan.md §10
 * ("rewind may never place the player inside solid geometry"). Calls
 * `canOccupy` (player.ts) rather than reimplementing solidity — the same
 * function issue #4's log entry says issues #6 and #8 both need, exported
 * standalone for exactly this call.
 *
 * `null` on refusal, not a thrown error: the caller (world.ts once it
 * merges; main.ts's demo wiring today) is expected to leave any
 * previously armed anchor untouched, the same no-op-on-refusal shape
 * player.ts's `requestSizeChange` already uses for growth pads.
 */
export function arm(
  x: number,
  y: number,
  size: Size,
  level: PhysicsLevel,
  destroyed: Destroyed,
): Anchor | null {
  const box = HITBOX[size];
  if (!canOccupy(x, y, box.width, box.height, level, destroyed)) return null;
  return { x, y, size };
}

/**
 * Everything `rewind()` reads and writes about the player, plus whatever
 * `destroyed` value the caller is carrying — generic in `D` so this module
 * never has to know (or be able to touch) what shape that value is. In
 * practice `D` will be world.ts's `ReadonlySet<string>`, but nothing here
 * says so.
 */
export type RewindInput<D> = {
  /** Player's current position/size — what re-entering the machine (or
   * the contextual rewind control) is about to overwrite. */
  x: number;
  y: number;
  size: Size;
  /** `world.anchor` — `null` means no machine has been armed yet. */
  anchor: Anchor | null;
  /** Passed straight through, untouched, to `RewindOutput.destroyed` —
   * see this file's header for why the type system, not just this
   * function's body, guarantees that. */
  destroyed: D;
  /**
   * Reviewer finding #4: `rewind()` used to trust `arm()`'s canOccupy
   * check unconditionally, which is sound only because `destroyed` is
   * monotone within a room — a guarantee `restart()` (world.ts) can
   * break. Both `level` and `occupancyDestroyed` are typed concretely
   * (`PhysicsLevel`/`Destroyed`), deliberately kept separate from the
   * unconstrained `destroyed: D` above rather than folding the check into
   * it — constraining `D` would weaken the exact structural guarantee
   * this file's header (and spec/rules.test.ts's reference-identity and
   * non-Set round-trip tests) depend on. Optional and omittable: existing
   * callers/tests that don't pass `level` get the old unconditional
   * behaviour (no way to re-check occupancy without a level).
   */
  level?: PhysicsLevel;
  /** Only consulted alongside `level`, above; ignored otherwise. Kept
   * distinct from `destroyed: D` for the same reason. */
  occupancyDestroyed?: Destroyed;
};

export type RewindOutput<D> = {
  x: number;
  y: number;
  size: Size;
  /** The identical reference `input.destroyed` was. Never a copy, never a
   * new Set — literally the same value, echoed back so a caller (world.ts)
   * can spread this result over its own state without having to
   * separately remember to carry `destroyed` forward itself. */
  destroyed: D;
  /** True iff an anchor existed and the player state actually changed.
   * Callers gate the "rewind" SFX and the desaturate/ghost-afterimage
   * visual effect on this — the same `triggered` convention player.ts's
   * `requestSizeChange` uses, so "no anchor armed" reads as an ordinary
   * no-op everywhere, not a special case only this module knows about. */
  triggered: boolean;
};

/**
 * Return the player to `anchor`. Plan.md's brief, verbatim: "the world
 * visibly does not change — that contrast is the entire point." This
 * function is how that promise is kept structurally rather than by
 * discipline: see the file header for why its `destroyed` parameter
 * cannot be mutated even by a careless edit.
 *
 * `anchor: null` (no machine armed yet) is a safe no-op: `input.x/y/size`
 * pass straight through unchanged, `triggered: false`.
 */
export function rewind<D>(input: RewindInput<D>): RewindOutput<D> {
  const noop = (): RewindOutput<D> => ({
    x: input.x,
    y: input.y,
    size: input.size,
    destroyed: input.destroyed,
    triggered: false,
  });

  if (!input.anchor) return noop();

  // Finding #4: belt-and-braces re-check. Only runs when a caller opts in
  // by passing `level` (main.ts always will; existing tests that predate
  // this fix and never pass it keep their original unconditional
  // behaviour, per the field's docs on RewindInput).
  if (input.level) {
    const box = HITBOX[input.anchor.size];
    const fits = canOccupy(
      input.anchor.x,
      input.anchor.y,
      box.width,
      box.height,
      input.level,
      input.occupancyDestroyed ?? (new Set<string>() as Destroyed),
    );
    if (!fits) return noop();
  }

  return {
    x: input.anchor.x,
    y: input.anchor.y,
    size: input.anchor.size,
    destroyed: input.destroyed,
    triggered: true,
  };
}

// ---------------------------------------------------------------------------
// enterRewindTile — the per-frame "feet just entered an R tile" decision
// ---------------------------------------------------------------------------

/** Tile coordinates (not pixels) of the machine cell an anchor was armed
 * at. Reviewer finding #2: the re-entry guard must compare this, never
 * `anchor.x === body.x` on sub-pixel floats — a player who walks off and
 * back essentially never reproduces the exact float the body sat at when
 * it armed. */
export type Tile = { x: number; y: number };

/** What main.ts (or any caller) persists across frames: the currently
 * armed anchor, tagged with the tile it was armed at. `null` means no
 * machine has ever armed successfully. */
export type ArmedState = { anchor: Anchor; tile: Tile };

export type EnterRewindTileResult =
  | { action: "rewind" }
  | { action: "armed"; anchor: Anchor; tile: Tile }
  | { action: "refused" };

/**
 * The whole "player's feet entered an R tile this frame" decision, called
 * once per edge-trigger (entered this frame, wasn't on it last frame —
 * main.ts's existing wasOnRewindTile bookkeeping is unchanged). Re-
 * entering the SAME tile an anchor is already armed at always rewinds,
 * never re-arms — independent of the body's current size or its exact
 * sub-pixel position. This is what fixes finding #3 as a side effect of
 * fixing #2: since re-arming never happens on a repeat visit to the same
 * tile, the anchor's size can never be silently overwritten by growing and
 * walking back over it, which is the mechanism plan.md §9's room 3 (arm
 * small, grow, take the long way, rewind small through the one-tile gap)
 * depends on.
 *
 * A different tile always attempts a fresh `arm()` — including when one
 * is already armed elsewhere; multiple machines each keep their own tile
 * identity, but this module (like `arm`/`rewind`) only tracks the single
 * "currently armed" anchor plan.md §6 describes, same as before this fix.
 */
export function enterRewindTile(
  armed: ArmedState | null,
  feetTile: Tile,
  x: number,
  y: number,
  size: Size,
  level: PhysicsLevel,
  destroyed: Destroyed,
): EnterRewindTileResult {
  if (armed && armed.tile.x === feetTile.x && armed.tile.y === feetTile.y) {
    return { action: "rewind" };
  }
  const anchor = arm(x, y, size, level, destroyed);
  if (!anchor) return { action: "refused" };
  return { action: "armed", anchor, tile: feetTile };
}
