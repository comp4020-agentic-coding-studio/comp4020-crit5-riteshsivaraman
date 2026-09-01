// Size system: plan.md §8/§9, issue #4. Pure, no browser API, no
// randomness, no clock reads — importable into vitest with no canvas, same
// discipline as physics.ts/level.ts (plan.md §5). This module owns:
//   - the two hitboxes (small/large) and the colour each size reads as
//   - the safe-growth predicate (`canOccupy`/`canChangeSize`) — the one
//     invariant issue #6 (rewind) and issue #8 (solver) will both need to
//     call, so it is exported standalone rather than buried in a state
//     machine (see this issue's log entry [#4] for why)
//   - the grow/shrink transition timer and its squash/stretch easing curve
//   - the room-authoring clearance check that spec/rooms.test.ts drives
//     (plan.md §8: "2 tiles headroom and 2 tiles width" for every `G`)
import type { Destroyed, PhysicsLevel } from "./physics";
import { isSolidAt as isSolidAtLevel, type Level } from "./level";
import { TILE } from "./tiles";

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

export type Size = "small" | "large";

export type Hitbox = { width: number; height: number };

/** Two states only, per plan.md §8 — 8x10 small, 16x20 large. Load-bearing:
 * spec/size.test.ts's "1-tile gap" assertion is derived from these numbers,
 * not hand-coded as a special case. */
export const HITBOX: Readonly<Record<Size, Hitbox>> = {
  small: { width: 8, height: 10 },
  large: { width: 16, height: 20 },
};

/** Warm vs cool colouring (plan.md's "both visually unmistakable" —
 * the only explanation a no-tutorial player gets). Echoes the mechanic
 * colours reserved in tileset.ts: growth orange for large, coolant cyan
 * for small — never the terrain palette. */
export const PLAYER_COLOR: Readonly<Record<Size, string>> = {
  small: "#34e5ff",
  large: "#ff8c1a",
};

// ---------------------------------------------------------------------------
// Safe-growth predicate — the real invariant (issue #4's trap 3)
// ---------------------------------------------------------------------------

// Tiny inward epsilon, mirroring physics.ts's own EPS: a body edge sitting
// exactly on a tile boundary must sample the tile it's actually standing
// in, not spill into the next one from floating-point roundoff.
const EPS = 1e-6;

// physics.ts's own solid-tile-plus-destroyed check (`isSolidAt`) is a
// private helper, deliberately not exported — physics.ts's public surface
// is just `stepBody` (see its file header). Rather than widen that
// module's surface for this one caller, this mirrors the same three-line
// check here: out-of-bounds is solid, a destroyed fragile tile is not,
// otherwise ask the level. Keep this in sync with physics.ts's version if
// that one ever changes.
function isSolidTileOrOOB(level: PhysicsLevel, destroyed: Destroyed, tileX: number, tileY: number): boolean {
  const cols = Math.ceil(level.widthPx / level.tileSize);
  const rows = Math.ceil(level.heightPx / level.tileSize);
  if (tileX < 0 || tileY < 0 || tileX >= cols || tileY >= rows) return true;
  if (destroyed.has(`${tileX},${tileY}`)) return false;
  return level.isSolidTile(tileX, tileY);
}

/**
 * Does an AABB at (x, y, width, height) overlap zero solid tiles? This is
 * the whole safe-growth rule, generalised: a body only ever occupies free
 * space. Used directly by spec/size.test.ts's "1-tile gap admits small,
 * refuses large" — that assertion is exactly this function called with the
 * two hitboxes, not a special case.
 */
export function canOccupy(
  x: number,
  y: number,
  width: number,
  height: number,
  level: PhysicsLevel,
  destroyed: Destroyed,
): boolean {
  const colStart = Math.floor((x + EPS) / level.tileSize);
  const colEnd = Math.floor((x + width - EPS) / level.tileSize);
  const rowStart = Math.floor((y + EPS) / level.tileSize);
  const rowEnd = Math.floor((y + height - EPS) / level.tileSize);

  for (let tileY = rowStart; tileY <= rowEnd; tileY++) {
    for (let tileX = colStart; tileX <= colEnd; tileX++) {
      if (isSolidTileOrOOB(level, destroyed, tileX, tileY)) return false;
    }
  }
  return true;
}

/**
 * Where does the body's top-left corner land after swapping from `from`'s
 * hitbox to `to`'s, anchored bottom-centre (feet planted, body grows
 * upward and outward / shrinks inward)? Pure arithmetic, no solidity
 * check — `canChangeSize` below is what makes the move safe.
 */
export function sizeChangeAnchor(x: number, y: number, from: Size, to: Size): { x: number; y: number } {
  const fromBox = HITBOX[from];
  const toBox = HITBOX[to];
  const centerX = x + fromBox.width / 2;
  const feetY = y + fromBox.height;
  return { x: centerX - toBox.width / 2, y: feetY - toBox.height };
}

export type SizeChangeResult = { ok: boolean; x: number; y: number };

/**
 * The safe-growth rule, in the shape callers actually want: "if the body
 * at (x, y) with size `from` changed to `to`, would it land somewhere
 * clear?" Shrinking is always safe by construction (the small box is a
 * strict subset of wherever the large box already legally was, same
 * anchor), but this checks both directions uniformly rather than assuming
 * that — a future room layout with an odd shrink case should fail loudly,
 * not silently pass on an assumption. `ok: false` means the caller must
 * treat the size-change request as a no-op and leave the body exactly
 * where it was.
 */
export function canChangeSize(
  x: number,
  y: number,
  from: Size,
  to: Size,
  level: PhysicsLevel,
  destroyed: Destroyed,
): SizeChangeResult {
  const anchor = sizeChangeAnchor(x, y, from, to);
  const box = HITBOX[to];
  const ok = canOccupy(anchor.x, anchor.y, box.width, box.height, level, destroyed);
  return { ok, x: anchor.x, y: anchor.y };
}

// ---------------------------------------------------------------------------
// Grow/shrink transition state machine
// ---------------------------------------------------------------------------

/** ~0.6s squash/stretch, per plan.md §8. */
export const GROW_SHRINK_DURATION_MS = 600;

export type SizeTransition = { from: Size; to: Size; elapsedMs: number } | null;

export type PlayerSizeState = {
  size: Size;
  transition: SizeTransition;
};

export function initialSizeState(size: Size = "small"): PlayerSizeState {
  return { size, transition: null };
}

export type SizeChangeRequestResult = {
  state: PlayerSizeState;
  triggered: boolean;
  x: number;
  y: number;
};

/**
 * Touching a growth pad (`target: "large"`) or coolant (`target: "small"`)
 * routes through here. No-op — `triggered: false`, state and position
 * unchanged — when already at the target size (issue #4's "touching G
 * while already large is a no-op") or when `canChangeSize` refuses the
 * move. Callers (main.ts today; world.ts once issue #6 lands) own SFX:
 * this module never calls playSfx (plan.md §5 — audio is browser-facing,
 * this stays pure), the caller plays "grow"/"shrink" iff `triggered`.
 */
export function requestSizeChange(
  state: PlayerSizeState,
  target: Size,
  x: number,
  y: number,
  level: PhysicsLevel,
  destroyed: Destroyed,
): SizeChangeRequestResult {
  if (state.size === target) {
    return { state, triggered: false, x, y };
  }
  const change = canChangeSize(x, y, state.size, target, level, destroyed);
  if (!change.ok) {
    return { state, triggered: false, x, y };
  }
  return {
    state: { size: target, transition: { from: state.size, to: target, elapsedMs: 0 } },
    triggered: true,
    x: change.x,
    y: change.y,
  };
}

/** Advance the transition timer by one frame; clears itself once the
 * ~0.6s duration elapses. A no-op (returns the same state) when nothing
 * is transitioning, so callers can call this unconditionally every frame. */
export function advanceSizeTransition(state: PlayerSizeState, dtMs: number): PlayerSizeState {
  if (!state.transition) return state;
  const elapsedMs = state.transition.elapsedMs + dtMs;
  if (elapsedMs >= GROW_SHRINK_DURATION_MS) {
    return { size: state.size, transition: null };
  }
  return { size: state.size, transition: { ...state.transition, elapsedMs } };
}

export type TransitionScale = { scaleX: number; scaleY: number };

/**
 * Visual-only squash/stretch multiplier for whatever draws the player
 * (main.ts/render.ts) — 1/1 when not transitioning. A single sine bump
 * peaking at the transition's midpoint: growing squashes wide then snaps
 * to full height, shrinking squashes tall then settles, so growth/coolant
 * read as opposite in feel as well as colour. Deliberately not physics —
 * the hitbox itself swaps instantly at the moment `requestSizeChange`
 * succeeds (so collision never has to reason about an in-between size);
 * this only changes what gets drawn.
 */
export function transitionScale(state: PlayerSizeState): TransitionScale {
  if (!state.transition) return { scaleX: 1, scaleY: 1 };
  const t = Math.min(1, state.transition.elapsedMs / GROW_SHRINK_DURATION_MS);
  const bump = Math.sin(t * Math.PI) * 0.18;
  const growing = state.transition.to === "large";
  return growing ? { scaleX: 1 - bump, scaleY: 1 + bump } : { scaleX: 1 + bump, scaleY: 1 - bump };
}

// ---------------------------------------------------------------------------
// spawnPosition — where a fresh (or restarted) player lands
// ---------------------------------------------------------------------------

/**
 * Pixel top-left for a body of `size` spawning at tile `spawn`, feet
 * planted on the spawn tile's floor (bottom edge flush with the bottom of
 * that tile) — the same convention `sizeChangeAnchor` uses for a
 * grow/shrink, applied once at the start of a room instead of on every
 * size change. Issue #7: extracted out of `main.ts`'s original inline
 * `spawn.y * TILE - (HITBOX.small.height - TILE)` (issue #14's original
 * boot wiring) so both boot *and* restart place the player identically,
 * from one tested function rather than two copies of the same arithmetic
 * that could drift apart. Always spawns at the tile's bottom edge
 * regardless of `size` — a room's spawn tile is authored assuming the
 * player starts small (plan.md §9's rooms all open in the small state),
 * but this takes `size` explicitly rather than hard-coding that
 * assumption, matching every other size-aware placement in this module.
 */
export function spawnPosition(spawn: { x: number; y: number }, size: Size): { x: number; y: number } {
  const box = HITBOX[size];
  return {
    x: spawn.x * TILE,
    y: (spawn.y + 1) * TILE - box.height,
  };
}

// ---------------------------------------------------------------------------
// Room-authoring clearance check — spec/rooms.test.ts drives this
// ---------------------------------------------------------------------------

export type ClearanceViolation = { x: number; y: number; blockedAt: { x: number; y: number } };

/**
 * plan.md §8's growth-pad rule: "2 tiles headroom and 2 tiles width" for
 * every `G`. Convention chosen here (documented because the phrase is
 * otherwise ambiguous — issue #9's room author should build against this,
 * not re-derive it): the pad's own tile column and the column to its
 * right, crossed with the pad's own row and the row above it, must all be
 * clear. That 2x2 tile block is exactly big enough to hold the large
 * hitbox (16x20 = 1.6x2 tiles) however it lands within it. Checked against
 * the level's *static* solidity (fragile walls count as solid, i.e. as if
 * nothing has been destroyed yet) — a room shouldn't rely on a wall
 * already being broken just to make its own growth pad legal.
 */
export function validateGrowthPadClearance(level: Level): { ok: boolean; violations: ClearanceViolation[] } {
  const noDestroyed = new Set<string>();
  const violations: ClearanceViolation[] = [];

  for (const entity of level.entities) {
    if (entity.type !== "growth") continue;
    const { x: gx, y: gy } = entity;

    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const cx = gx + dx;
        const cy = gy + dy;
        const blocked =
          cx < 0 || cy < 0 || cx >= level.width || cy >= level.height || isSolidAtLevel(level, cx, cy, noDestroyed);
        if (blocked) {
          violations.push({ x: gx, y: gy, blockedAt: { x: cx, y: cy } });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
