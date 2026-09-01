// Full-room reset: issue #7, the fix for the Reviewer's confirmed defect.
// Pure — no browser API, no randomness, no clock read (plan.md §5's
// dependency rule; spec/pure-modules.test.ts enforces this).
//
// Extracted from main.ts's restartRoom() (issue #7's original, correct,
// but completely untested implementation) so the *completeness* of the
// reset is something a test can assert on, not something a future session
// has to verify by reading the function body. See notes/agents/log.md
// [#7 #8 #9] for why this matters beyond tidiness: rewind() trusts
// arm-time occupancy only because `destroyed` is monotone within a room —
// a guarantee restart is the one operation that breaks. An anchor armed
// before a restart, if not cleared *in the same reset*, can place the
// body inside geometry the restart just re-solidified. Every field this
// module returns is a field that must be reassigned atomically with
// `world` for that invariant to hold; dropping any one of them silently
// reopens the bug. `spec/room.test.ts` asserts on each field individually
// (not one equality over the whole object) so a future field that quietly
// escapes the reset fails loudly instead of escaping review.
//
// Also why this lives in its own module rather than folding into
// world.ts's restart(): world.ts is deliberately narrow (owns only
// `destroyed`, per its own header) and rewind.ts is deliberately isolated
// from world.ts (see rewind.ts's header — issue #6 must not gain a path
// to `restart`). A composing module that imports both, plus player.ts and
// physics.ts, is the one place allowed to know about all four at once;
// main.ts becomes a thin caller that applies this result plus the
// genuinely-DOM parts (setMachineArmed, debris/shakeMs/impactMs, the
// drawn `player` rect) that don't belong in src/game/.
import { restart as restartWorld, type World } from "./world";
import { createBody, type Body } from "./physics";
import {
  HITBOX,
  initialSizeState,
  spawnPosition,
  type PlayerSizeState,
  type Size,
} from "./player";
import type { ArmedState } from "./rewind";
import type { Level } from "./level";

/**
 * Everything a room-restart flow must reassign together for the
 * rewind/destruction invariant to hold. `armed`/`wasOnRewindTile` are
 * always reset to their "nothing armed" values — a restart has no notion
 * of an anchor surviving it, per plan.md §7's Done-when
 * (`destroyed` empty, `anchor`/`armed` null, player at spawn).
 */
export type FreshRoomState = {
  world: World;
  sizeState: PlayerSizeState;
  body: Body;
  armed: ArmedState | null;
  wasOnRewindTile: boolean;
};

/**
 * Rebuild a room from nothing: a brand-new `World` (restartWorld — the
 * only function that clears `destroyed`, see world.ts's header), the
 * player back at `level.spawn` at `size` (default "small", the real spawn
 * size per player.ts), and any armed rewind anchor discarded. Callers
 * (main.ts today) apply this plus whatever DOM/juice state isn't in
 * src/game/'s remit (setMachineArmed(false), debris/shakeMs/impactMs, the
 * drawn PlayerRect).
 */
export function freshRoomState(level: Level, size: Size = "small"): FreshRoomState {
  const spawn = spawnPosition(level.spawn, size);
  const box = HITBOX[size];
  return {
    world: restartWorld(),
    sizeState: initialSizeState(size),
    body: createBody(spawn.x, spawn.y, box.width, box.height),
    armed: null,
    wasOnRewindTile: false,
  };
}
