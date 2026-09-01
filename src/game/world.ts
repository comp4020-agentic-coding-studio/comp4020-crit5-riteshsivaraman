// Room world state: plan.md §6, issue #5. Pure, no browser API, no
// randomness, no clock reads — same discipline as physics.ts/level.ts/
// player.ts (plan.md §5). This module owns the one piece of state that is
// *permanent within a room* — `destroyed` — and the two functions that are
// allowed to change it: `breakTile` (one tile, permanent) and `restart`
// (the whole room, back to nothing broken).
//
// Ownership note (this issue's brief): issue #6 (rewind) does not import
// this file at all — it defines its own minimal structural interface and
// takes it as a parameter, the same way physics.ts defines `PhysicsLevel`
// rather than importing level.ts. `rewind()` therefore has no path to
// `restart` merely by virtue of never seeing this module. See the
// [#6] log entry in notes/agents/log.md for the exact contract:
// **rewind may read `world.destroyed` (pass it through to `canChangeSize`/
// `canOccupy` unchanged) but must never call `breakTile` or `restart`.**
// Only main.ts's restart-room flow may call `restart`; only main.ts's
// per-frame contact resolution (or a future World reducer) may call
// `breakTile`.
import { tileKindAt, type Level } from "./level";
import type { Size } from "./player";
import { TILE } from "./tiles";

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------

/** plan.md §6's `World.destroyed`, in isolation — "x,y" (tile coords) keys
 * of fragile tiles already broken, permanent for the life of the room.
 * `render.ts` and `player.ts` already take exactly this shape
 * (`ReadonlySet<string>`), so this is consumable with no adapter. */
export type World = {
  readonly destroyed: ReadonlySet<string>;
};

/** A fresh room: nothing broken. */
export function createWorld(): World {
  return { destroyed: new Set<string>() };
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

// ---------------------------------------------------------------------------
// breakTile — the one place that decides whether a break may happen
// ---------------------------------------------------------------------------

/**
 * Attempt to break the tile at (x, y). This is the entire plan.md §6 rule,
 * in one place: a no-op unless the tile is currently `fragile`
 * (tiles.ts/level.ts — a destroyed fragile tile no longer reads as
 * `fragile` via `destroyed`, so this checks the *static* kind, not
 * solidity) and `size` is `"large"`. Idempotent by construction: if (x, y)
 * is already in `destroyed`, this returns the same `World` reference
 * unchanged rather than a new Set with the same contents — callers can
 * diff by identity to know whether anything actually happened this call.
 *
 * Permanent within the room (plan.md §6): the only way to remove an entry
 * from `destroyed` is `restart`, never this function.
 */
export function breakTile(world: World, x: number, y: number, size: Size, level: Level): World {
  if (size !== "large") return world;

  const key = tileKey(x, y);
  if (world.destroyed.has(key)) return world;
  if (tileKindAt(level, x, y) !== "fragile") return world;

  const destroyed = new Set(world.destroyed);
  destroyed.add(key);
  return { destroyed };
}

// ---------------------------------------------------------------------------
// Contact detection — which tiles is this AABB pressed against right now?
// ---------------------------------------------------------------------------

const EPS = 1e-6;
// physics.ts's collision resolver stops a body exactly at a solid tile's
// edge (see moveAxisX/moveAxisY) — the body's AABB touches the wall's
// boundary but never overlaps it. A margin of one pixel either side of the
// AABB is therefore enough to pick up the tile the body has just been
// stopped against, without reaching past it into the tile beyond.
const CONTACT_MARGIN_PX = 1;

/** Tile coordinates whose cell the AABB at (x, y, width, height) overlaps
 * or is pressed directly up against. Exported so main.ts's per-frame step
 * can drive `breakTile` from the player's actual position without
 * reimplementing this scan. */
export function tilesInContact(
  x: number,
  y: number,
  width: number,
  height: number,
  tileSize: number,
): { x: number; y: number }[] {
  const colStart = Math.floor((x - CONTACT_MARGIN_PX) / tileSize);
  const colEnd = Math.floor((x + width + CONTACT_MARGIN_PX - EPS) / tileSize);
  const rowStart = Math.floor((y - CONTACT_MARGIN_PX) / tileSize);
  const rowEnd = Math.floor((y + height + CONTACT_MARGIN_PX - EPS) / tileSize);

  const tiles: { x: number; y: number }[] = [];
  for (let ty = rowStart; ty <= rowEnd; ty++) {
    for (let tx = colStart; tx <= colEnd; tx++) {
      tiles.push({ x: tx, y: ty });
    }
  }
  return tiles;
}

export type ContactResolution = {
  world: World;
  /** Fragile, not-yet-destroyed tiles the body is touching this call —
   * whether or not any of them broke (a small body still "touches" a
   * fragile wall it's blocked by; that's the brief's fragileImpact SFX). */
  touchedFragile: { x: number; y: number }[];
  /** The subset of `touchedFragile` that broke this call — main.ts plays
   * "destroy" iff this is non-empty. */
  broken: { x: number; y: number }[];
};

/**
 * The per-frame entry point main.ts wants: given the player's current AABB
 * and size, find every fragile tile it's in contact with, break the ones a
 * large body may break (via `breakTile`, so idempotence/permanence come
 * along for free), and report both the touches and the breaks so the
 * caller can drive SFX/juice without re-deriving contact itself.
 */
export function resolveFragileContact(
  world: World,
  x: number,
  y: number,
  width: number,
  height: number,
  size: Size,
  level: Level,
): ContactResolution {
  const candidates = tilesInContact(x, y, width, height, TILE);
  const touchedFragile: { x: number; y: number }[] = [];
  const broken: { x: number; y: number }[] = [];
  let next = world;

  for (const t of candidates) {
    if (t.x < 0 || t.y < 0 || t.x >= level.width || t.y >= level.height) continue;
    if (next.destroyed.has(tileKey(t.x, t.y))) continue;
    if (tileKindAt(level, t.x, t.y) !== "fragile") continue;

    touchedFragile.push(t);
    const attempted = breakTile(next, t.x, t.y, size, level);
    if (attempted !== next) {
      broken.push(t);
      next = attempted;
    }
  }

  return { world: next, touchedFragile, broken };
}

// ---------------------------------------------------------------------------
// restart — full room reset (plan.md §6), distinct from breakTile
// ---------------------------------------------------------------------------

/**
 * Rebuilds the room from nothing broken. This is the *only* function that
 * clears `destroyed` — it takes no `World` argument, so there is no partial
 * or accidental clear: a caller cannot pass an existing world through this
 * and get anything back but a brand-new, fully-reset one. That asymmetry
 * with `breakTile` (which always takes a `World` and returns a
 * derived one) is deliberate: it makes "which one clears everything" obvious
 * at the call site without reading this file's implementation.
 *
 * issue #6 (rewind) may NOT call this — see this file's header and the
 * [#6] log entry. Only a room-restart flow (main.ts today) may.
 */
export function restart(): World {
  return createWorld();
}
