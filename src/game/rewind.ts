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
  if (!input.anchor) {
    return { x: input.x, y: input.y, size: input.size, destroyed: input.destroyed, triggered: false };
  }
  return {
    x: input.anchor.x,
    y: input.anchor.y,
    size: input.anchor.size,
    destroyed: input.destroyed,
    triggered: true,
  };
}
