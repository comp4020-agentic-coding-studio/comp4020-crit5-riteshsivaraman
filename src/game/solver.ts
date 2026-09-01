// The solver sensor: plan.md §7, issue #8. "This is the crit's centrepiece:
// expensive verification lives in `pnpm check`, runtime stays trivial."
// Imported ONLY by spec/ (never by runtime code) — enforced by
// spec/pure-modules.test.ts's browser-API scan plus plain code review; this
// module is a test-only reachability oracle, not part of the shipped game.
//
// BFS over (tileX, tileY, size, destroyedMask, anchor), reusing the real
// occupancy/rewind/loss primitives rather than re-deriving solidity or the
// rewind contract by hand:
//   - canOccupy            (player.ts)  — the one occupancy predicate
//   - tilesInContact       (world.ts)   — the one "which tiles is this box
//                                          touching" predicate
//   - arm / rewind         (rewind.ts)  — the real arm/rewind contract,
//                                          Reviewer finding #4's re-check
//                                          included
//   - isRoomDead / hasWon  (rules.ts)   — the authored predicates this
//                                          whole sensor exists to verify
//   - simulateJumpArc      (physics.ts) — the jump-arc table, derived, not
//                                          hand-copied (plan.md §7)
//
// ---------------------------------------------------------------------------
// Tile-granular footprint: the one modeling decision worth explaining up
// front
// ---------------------------------------------------------------------------
//
// rules.ts's RoomState is tile-granular by construction (playerTileX/Y are
// integers — see that file's header). The real engine is not: HITBOX.large
// is 16x20px, 1.6x2 tiles, so a continuous-physics body can rest flush
// against a wall at a sub-tile x offset no integer tile position can name.
// Modeling the large body's *solver* footprint as the real 16px-wide box,
// left-aligned to its tile, creates a dead zone: at the tile just short of a
// wall the box doesn't yet reach it (16 < 20, doesn't touch), and at the
// next tile the box already overlaps *past* the wall's near face (since 16px
// from a tile-aligned origin extends into the following tile) — so no
// integer tile position is ever "flush" against the wall, and a
// break-while-large edge can never fire. That is a solver artifact, not a
// fact about the room.
//
// The fix used throughout this file: round the large footprint UP to a full
// 2x2 tile block (cols tx..tx+1, rows ty-1..ty), anchored at the feet tile
// (tx, ty). Small rounds up to a full 1x1 tile. Two things make this the
// right call rather than an arbitrary one:
//   1. It is *conservative* in the direction plan.md §7 asks for: a 20px
//      required clearance is a strictly harder bar than the real 16px body
//      ever needs, so the solver can only under-credit reach, never
//      over-credit it (never certifies a room solvable that the real body
//      cannot actually solve).
//   2. It is not a new convention invented for this file — it is *exactly*
//      the block validateGrowthPadClearance (player.ts) already checks for
//      every growth pad ("2 tiles headroom and 2 tiles width"). This module
//      reuses that same 2x2 block for every large-size occupancy query, not
//      just growth pads, so the solver's notion of "large fits here" agrees
//      with the one room-authoring check that already exists.
// Small's 1x1 rounding (8x10 real vs 10x10 rounded) is the same call for the
// same reason, and matches "the tile the player's feet occupy" — rules.ts's
// own description of playerTileX/Y.
//
// ---------------------------------------------------------------------------
// Known limitation: jump edges do not model tiles passed over mid-flight
// ---------------------------------------------------------------------------
//
// A jump edge (below) checks only its destination tile and lands there
// directly — it does not simulate the tiles between takeoff and landing.
// Any growth/coolant/rewind auto-trigger (see resolveAuto) that a real
// player would pass over mid-jump, without ever landing on it, is therefore
// invisible to this solver: a room whose G/C/R tile is only ever *jumped
// over* on the way to somewhere else is modeled as if that tile were never
// touched at all. This is conservative (it can only under-credit reach —
// declare a solvable room unsolvable, loudly — never certify an unsolvable
// one), so it does not violate plan.md §7's bias requirement, but it is a
// real gap: issue #9's rooms must keep every G/C/R reachable by landing on
// it (walking onto it, or jumping such that it IS the destination tile),
// not merely by flying over it as part of a longer jump's arc. See
// notes/agents/log.md [#8 #9] for the room-authoring consequence in full.

import type { Destroyed, PhysicsLevel } from "./physics";
import { simulateJumpArc, DEFAULT_STEP_MS } from "./physics";
import { canOccupy, type Size } from "./player";
import { tilesInContact } from "./world";
import { arm, rewind, type Anchor } from "./rewind";
import type { RoomState } from "./rules";
import { tileKindForChar, isSolidKind, TILE, type TileKind } from "./tiles";
import type { Level } from "./level";

// ---------------------------------------------------------------------------
// Jump arc table — derived, not hand-copied (plan.md §7's ordering
// constraint on issue 3 exists for exactly this line)
// ---------------------------------------------------------------------------

const ARC = simulateJumpArc(TILE, DEFAULT_STEP_MS);

/** Conservative vertical reach: floor()'d tiles the head can clear, per
 * simulateJumpArc's own doc comment — "the conservative number issue 8
 * wants". */
const JUMP_MAX_HEIGHT_TILES = Math.max(0, ARC.maxHeightTiles);

/** Conservative horizontal reach for a same-height jump — also floor()'d by
 * simulateJumpArc itself. */
const JUMP_MAX_RANGE_TILES = Math.max(0, ARC.horizontalRangeAtSameHeightTiles);

// ---------------------------------------------------------------------------
// Solver state
// ---------------------------------------------------------------------------

/** The currently armed anchor, in the solver's own tile-granular terms.
 * `tileX`/`tileY` are the feet-tile the anchor was armed at (so re-entry and
 * post-rewind settling both have a tile to work from); `size` is the size
 * that was active at arm time, exactly like rewind.ts's `Anchor`. */
export type SolverAnchor = { tileX: number; tileY: number; size: Size };

export type SolverState = {
  readonly tx: number;
  readonly ty: number;
  readonly size: Size;
  /** Bitmask over this room's fragile tiles, indexed by `FragileIndex` below.
   * A room with more than 31 fragile tiles would overflow this — no room in
   * this game gets remotely close (plan.md §9: at most two fragile walls
   * per room), and `solveRoom` throws loudly rather than silently
   * misbehaving if that ever changes (see `buildFragileIndex`). */
  readonly mask: number;
  readonly anchor: SolverAnchor | null;
};

function anchorKey(a: SolverAnchor | null): string {
  return a ? `${a.tileX},${a.tileY},${a.size}` : "-";
}

function stateKey(s: SolverState): string {
  return `${s.tx},${s.ty},${s.size},${s.mask},${anchorKey(s.anchor)}`;
}

// ---------------------------------------------------------------------------
// Fragile-tile index — the bitmask's coordinate system
// ---------------------------------------------------------------------------

type FragileIndex = { keyOf: Map<string, number>; coordsOf: { x: number; y: number }[] };

function buildFragileIndex(level: Level): FragileIndex {
  const coordsOf: { x: number; y: number }[] = [];
  const keyOf = new Map<string, number>();
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (tileKindForChar(level.grid[y][x]) === "fragile") {
        keyOf.set(`${x},${y}`, coordsOf.length);
        coordsOf.push({ x, y });
      }
    }
  }
  if (coordsOf.length > 31) {
    throw new Error(
      `solver.ts: ${coordsOf.length} fragile tiles exceeds the 31-tile bitmask this solver supports — ` +
        "widen the mask representation before authoring a room this destructible.",
    );
  }
  return { keyOf, coordsOf };
}

function maskToDestroyed(mask: number, index: FragileIndex): Set<string> {
  const destroyed = new Set<string>();
  for (let i = 0; i < index.coordsOf.length; i++) {
    if (mask & (1 << i)) {
      const { x, y } = index.coordsOf[i];
      destroyed.add(`${x},${y}`);
    }
  }
  return destroyed;
}

// ---------------------------------------------------------------------------
// Level adapter — Level (ASCII) -> PhysicsLevel, so canOccupy/arm/rewind can
// be called unmodified. Mirrors physics.ts's own doc for `isSolidTile`:
// *static* solidity, ignoring `destroyed` — a fragile tile reports solid
// here regardless of this room's mask; the caller supplies the dynamic
// `Destroyed` set per state, exactly like every other caller of canOccupy.
// ---------------------------------------------------------------------------

function toPhysicsLevel(level: Level): PhysicsLevel {
  return {
    tileSize: TILE,
    widthPx: level.width * TILE,
    heightPx: level.height * TILE,
    isSolidTile(tileX: number, tileY: number): boolean {
      if (tileX < 0 || tileY < 0 || tileX >= level.width || tileY >= level.height) return true;
      const kind: TileKind = tileKindForChar(level.grid[tileY][tileX]);
      return isSolidKind(kind, false);
    },
  };
}

// ---------------------------------------------------------------------------
// The rounded footprint (see file header) — the one place both the pixel
// box's origin AND its size are decided, so occupancy and contact detection
// can never drift apart from each other.
// ---------------------------------------------------------------------------

type Box = { x: number; y: number; width: number; height: number };

function footprintBox(tx: number, ty: number, size: Size): Box {
  if (size === "small") {
    return { x: tx * TILE, y: ty * TILE, width: TILE, height: TILE };
  }
  // Large: feet at (tx, ty), body extends one tile up and one tile right —
  // the same 2x2 block validateGrowthPadClearance already checks for every
  // growth pad (player.ts).
  return { x: tx * TILE, y: (ty - 1) * TILE, width: 2 * TILE, height: 2 * TILE };
}

// ---------------------------------------------------------------------------
// solveRoom
// ---------------------------------------------------------------------------

export type SolveResult = {
  /** Every state reached by the BFS from spawn. */
  reachable: SolverState[];
  /** Is `s` (assumed reachable) able to reach an exit-tile state via some
   * sequence of edges? Undefined behaviour for a state that isn't in
   * `reachable` — those are answered by definition (no path exists to
   * *evaluate* from an unvisited state's edges, since it was never
   * expanded). */
  canReachExit: (s: SolverState) => boolean;
  /** Convenience: was `spawn` itself able to reach an exit-tile state? */
  solvable: boolean;
  /** SolverState -> RoomState, the shape isRoomDead/hasWon actually take. */
  toRoomState: (s: SolverState) => RoomState;
  /** Total distinct states the BFS visited — plan.md §7's "~32k states". */
  stateCount: number;
};

/**
 * BFS the full reachable state space of `level` and answer, for any visited
 * state, "can this state still reach an exit?" — the primitive
 * spec/solver.test.ts's four properties are all built from.
 *
 * Two passes: a forward BFS from spawn (which states exist at all, and what
 * are their edges), then a reverse traversal seeded from every reachable
 * exit-tile state over those same edges reversed (which of those states can
 * still get out). Both passes only ever touch states already proven
 * reachable from spawn — an edge into a state that's a dead letter to begin
 * with (never reachable) is not this sensor's concern; plan.md's fatal
 * predicates are authored against states the *player can actually be in*.
 */
export function solveRoom(level: Level): SolveResult {
  const physLevel = toPhysicsLevel(level);
  const fragile = buildFragileIndex(level);

  const growthTiles = level.entities.filter((e) => e.type === "growth");
  const coolantTiles = level.entities.filter((e) => e.type === "coolant");
  const rewindTiles = level.entities.filter((e) => e.type === "rewind");

  function canOccupyAt(tx: number, ty: number, size: Size, destroyed: Destroyed): boolean {
    const box = footprintBox(tx, ty, size);
    return canOccupy(box.x, box.y, box.width, box.height, physLevel, destroyed);
  }

  /** Free-fall straight down from (tx, ty) until grounded (blocked below),
   * or `null` if (tx, ty) itself isn't even clear. Out-of-bounds below the
   * level counts as solid (physics.ts/player.ts's own convention), so this
   * always terminates within the level — there is no "fell forever" state,
   * matching stepBody's hard bounds clamp. This is also, deliberately, the
   * ONLY place a rewind's destination is trusted: every edge below routes
   * its result through this before it becomes a state, which is what makes
   * "rewind to an anchor whose floor has since been destroyed" fall through
   * to wherever the real floor now is, rather than being certified as a
   * safe landing merely because the cell itself is clear (the Reviewer's
   * finding — arm() proves the cell is clear, not that anything holds you
   * up; see this file's report/log entry).
   */
  function settle(tx: number, ty: number, size: Size, destroyed: Destroyed): { tx: number; ty: number } | null {
    if (!canOccupyAt(tx, ty, size, destroyed)) return null;
    let cy = ty;
    // Bound the descent at the level height plus a small margin — the OOB
    // floor guarantees termination well before this fires; it exists only
    // to turn a hypothetical bug into a thrown-away null instead of an
    // infinite loop.
    const limit = level.height + 4;
    while (cy < limit) {
      if (!canOccupyAt(tx, cy + 1, size, destroyed)) {
        return { tx, ty: cy };
      }
      cy += 1;
    }
    return null;
  }

  function entityFootprintHit(
    tx: number,
    ty: number,
    size: Size,
    entities: { x: number; y: number }[],
  ): { x: number; y: number } | null {
    const box = footprintBox(tx, ty, size);
    const colStart = box.x / TILE;
    const colEnd = (box.x + box.width) / TILE - 1;
    const rowStart = box.y / TILE;
    const rowEnd = (box.y + box.height) / TILE - 1;
    for (const e of entities) {
      if (e.x >= colStart && e.x <= colEnd && e.y >= rowStart && e.y <= rowEnd) return e;
    }
    return null;
  }

  /**
   * Settle a raw movement target, then apply every *automatic* tile-entry
   * transition (growth, coolant, arm, rewind) until nothing more fires —
   * mirroring the real per-frame contract exactly, not a discrete "choice".
   *
   * This exists because `enterRewindTile`'s own doc comment (rewind.ts) is
   * explicit that arming/rewinding is "the whole 'player's feet entered an
   * R tile this frame' decision" — edge-triggered and unconditional, the
   * same shape `requestSizeChange`'s growth/coolant check already has
   * (player.ts: "touching a growth pad... routes through here", no separate
   * button). An earlier version of this file modeled arm/growth/coolant as
   * OPTIONAL edges alongside walk/jump — which meant "standing on R without
   * having armed it" was a distinct, persisted BFS state that could go on
   * to get large-stuck with no anchor at all. That is not a state the real
   * game can ever be in (the tile-entry is automatic), and it manufactured
   * dead states in room 2 that a correct model doesn't have — this is
   * exactly the bug the property-4 "no dead states" check is designed to
   * catch, and it did.
   *
   * `rewoundThisSettle` blocks exactly one thing: re-triggering a rewind at
   * the anchor's own tile immediately after landing there *from* a rewind
   * (that landing is the same single "entered" event already being
   * resolved, not a fresh entry — main.ts's wasOnRewindTile bookkeeping is
   * what prevents this at runtime by never seeing an "entered this frame,
   * wasn't on it last frame" edge for a tile you're continuously standing
   * on). Growth/coolant chains and arming at a *different* tile afterward
   * are still allowed to chain within the same resolution.
   */
  function resolveAuto(
    rawTx: number,
    rawTy: number,
    size0: Size,
    mask: number,
    anchor0: SolverAnchor | null,
  ): SolverState | null {
    const destroyed0 = maskToDestroyed(mask, fragile);
    const initial = settle(rawTx, rawTy, size0, destroyed0);
    if (!initial) return null;

    let tx = initial.tx;
    let ty = initial.ty;
    let size = size0;
    let anchor = anchor0;
    let rewoundThisSettle = false;

    for (let i = 0; i < 20; i++) {
      const destroyed = maskToDestroyed(mask, fragile);
      let moved = false;

      if (size === "small" && entityFootprintHit(tx, ty, "small", growthTiles)) {
        if (canOccupyAt(tx, ty, "large", destroyed)) {
          const landed = settle(tx, ty, "large", destroyed);
          if (landed) {
            tx = landed.tx;
            ty = landed.ty;
            size = "large";
            moved = true;
          }
        }
      }
      if (!moved && size === "large" && entityFootprintHit(tx, ty, "large", coolantTiles)) {
        const landed = settle(tx, ty, "small", destroyed);
        if (landed) {
          tx = landed.tx;
          ty = landed.ty;
          size = "small";
          moved = true;
        }
      }
      if (moved) continue;

      const hitRewind = entityFootprintHit(tx, ty, size, rewindTiles);
      if (hitRewind) {
        const alreadyArmedHere = anchor !== null && anchor.tileX === hitRewind.x && anchor.tileY === hitRewind.y;
        if (alreadyArmedHere && anchor && !rewoundThisSettle) {
          const anchorBox = footprintBox(anchor.tileX, anchor.tileY, anchor.size);
          const currentBox = footprintBox(tx, ty, size);
          const result = rewind({
            x: currentBox.x,
            y: currentBox.y,
            size,
            anchor: { x: anchorBox.x, y: anchorBox.y, size: anchor.size },
            destroyed,
            level: physLevel,
            occupancyDestroyed: destroyed,
          });
          if (result.triggered) {
            const landed = settle(anchor.tileX, anchor.tileY, anchor.size, destroyed);
            if (landed) {
              tx = landed.tx;
              ty = landed.ty;
              size = anchor.size;
              rewoundThisSettle = true;
              continue;
            }
          }
        } else if (!alreadyArmedHere) {
          const box = footprintBox(hitRewind.x, hitRewind.y, size);
          const armedAnchor = arm(box.x, box.y, size, physLevel, destroyed);
          if (armedAnchor) {
            anchor = { tileX: hitRewind.x, tileY: hitRewind.y, size };
          }
        }
      }
      break;
    }

    return { tx, ty, size, mask, anchor };
  }

  function edgesOf(s: SolverState): SolverState[] {
    const destroyed = maskToDestroyed(s.mask, fragile);
    const out: SolverState[] = [];

    const push = (tx: number, ty: number, size: Size, mask: number, anchor: SolverAnchor | null) => {
      const resolved = resolveAuto(tx, ty, size, mask, anchor);
      if (!resolved) return;
      out.push(resolved);
    };

    // --- Walk: one tile left or right, at the current size. ---
    for (const dx of [-1, 1]) {
      push(s.tx + dx, s.ty, s.size, s.mask, s.anchor);
    }

    // --- Jump: two conservative shapes only (see file header rationale in
    // the report for why diagonal jumps are deliberately excluded) —
    // straight up onto a ledge within JUMP_MAX_HEIGHT_TILES, or straight
    // across a gap at the same height within JUMP_MAX_RANGE_TILES. Both
    // stop at the first row/column that isn't clear, which is what makes
    // "conservative" mean something here: a real diagonal arc might clear
    // an obstacle this straight-line check refuses, so this can only
    // under-credit reach, never over-credit it. ---
    for (let dy = 1; dy <= JUMP_MAX_HEIGHT_TILES; dy++) {
      const row = s.ty - dy;
      if (!canOccupyAt(s.tx, row, s.size, destroyed)) break;
      push(s.tx, row, s.size, s.mask, s.anchor);
    }
    for (const dir of [1, -1] as const) {
      for (let dx = 1; dx <= JUMP_MAX_RANGE_TILES; dx++) {
        const col = s.tx + dir * dx;
        if (!canOccupyAt(col, s.ty, s.size, destroyed)) break;
        push(col, s.ty, s.size, s.mask, s.anchor);
      }
    }

    // Growth/coolant tile-entry is NOT a separate optional edge — it is
    // automatic on landing, and `resolveAuto` (called from every `push`
    // above, and from the initial spawn settle below) already applies it.
    // A state that is "standing on a growth pad, still small" or "standing
    // on coolant, still large" cannot exist in `visited` at all; modeling
    // it as an extra edge here would resurrect the exact bug this file's
    // header/report describes (a persisted "untriggered" state with no
    // real-game counterpart).

    // --- Break-while-large: every fragile tile in the contact ring around
    // the (rounded) large footprint. Reuses world.ts's own tilesInContact
    // against that same rounded box, so "which tiles is this body touching"
    // is one answer, not two — see file header for why the box is rounded
    // in the first place. ---
    if (s.size === "large") {
      const box = footprintBox(s.tx, s.ty, "large");
      for (const t of tilesInContact(box.x, box.y, box.width, box.height, TILE)) {
        if (t.x < 0 || t.y < 0 || t.x >= level.width || t.y >= level.height) continue;
        const key = `${t.x},${t.y}`;
        const idx = fragile.keyOf.get(key);
        if (idx === undefined) continue;
        if (s.mask & (1 << idx)) continue; // already broken
        push(s.tx, s.ty, s.size, s.mask | (1 << idx), s.anchor);
      }
    }

    // Arming is likewise not a separate edge: `s` itself, by construction
    // (every state in `visited` was produced by `resolveAuto`, including
    // spawn), already reflects whatever arm/rewind resolution landing here
    // triggered. A state "standing on R, unarmed" cannot exist to branch
    // from in the first place.

    // --- Rewind-to-anchor: available from ANY state with an armed anchor
    // (plan.md's contextual rewind control, not a "walk back to the
    // machine" requirement — room 2's whole beat depends on triggering it
    // from the dead end below, not at the machine). Reuses the real
    // `rewind()`, occupancy re-check (Reviewer finding #4) included, so a
    // stale anchor whose cell has since been resolidified is refused here
    // exactly as it would be at runtime. Critically: the landing tile is
    // NOT trusted as a resting state — it is fed through `settle()` via
    // `push`, exactly like every other edge, which is what models "the
    // anchor cell is clear" as distinct from "the anchor cell has a floor".
    // ---
    if (s.anchor) {
      const currentBox = footprintBox(s.tx, s.ty, s.size);
      const anchorBox = footprintBox(s.anchor.tileX, s.anchor.tileY, s.anchor.size);
      const anchor: Anchor = { x: anchorBox.x, y: anchorBox.y, size: s.anchor.size };
      const result = rewind({
        x: currentBox.x,
        y: currentBox.y,
        size: s.size,
        anchor,
        destroyed,
        level: physLevel,
        occupancyDestroyed: destroyed,
      });
      if (result.triggered) {
        push(s.anchor.tileX, s.anchor.tileY, s.anchor.size, s.mask, s.anchor);
      }
    }

    return out;
  }

  // --- Forward BFS from spawn. Routed through resolveAuto (not a bare
  // settle) for the same reason every edge is: if a room's spawn tile ever
  // happened to overlap a growth/coolant/rewind entity, that must resolve
  // automatically here too, rather than producing an "untriggered" spawn
  // state no other edge could ever reach or reproduce. ---
  const spawnResolved = resolveAuto(level.spawn.x, level.spawn.y, "small", 0, null);
  if (!spawnResolved) {
    throw new Error(`solver.ts: spawn tile (${level.spawn.x},${level.spawn.y}) is not clear for a small body`);
  }
  const spawn: SolverState = spawnResolved;

  const visited = new Map<string, SolverState>();
  const forwardEdges = new Map<string, string[]>(); // stateKey -> [stateKey]
  const queue: SolverState[] = [spawn];
  visited.set(stateKey(spawn), spawn);

  while (queue.length > 0) {
    const current = queue.shift() as SolverState;
    const currentKey = stateKey(current);
    const neighbors = edgesOf(current);
    const neighborKeys: string[] = [];
    for (const next of neighbors) {
      const nextKey = stateKey(next);
      neighborKeys.push(nextKey);
      if (!visited.has(nextKey)) {
        visited.set(nextKey, next);
        queue.push(next);
      }
    }
    forwardEdges.set(currentKey, neighborKeys);
  }

  // --- Reverse traversal seeded from every reachable exit-tile state. ---
  const reverseEdges = new Map<string, string[]>();
  for (const [fromKey, toKeys] of forwardEdges) {
    for (const toKey of toKeys) {
      const list = reverseEdges.get(toKey);
      if (list) list.push(fromKey);
      else reverseEdges.set(toKey, [fromKey]);
    }
  }

  const canReach = new Set<string>();
  const exitSeeds: string[] = [];
  for (const [key, state] of visited) {
    if (state.tx === level.exit.x && state.ty === level.exit.y) exitSeeds.push(key);
  }
  const revQueue = [...exitSeeds];
  for (const key of exitSeeds) canReach.add(key);
  while (revQueue.length > 0) {
    const key = revQueue.shift() as string;
    for (const pred of reverseEdges.get(key) ?? []) {
      if (!canReach.has(pred)) {
        canReach.add(pred);
        revQueue.push(pred);
      }
    }
  }

  const reachable = [...visited.values()];

  return {
    reachable,
    canReachExit: (s: SolverState) => canReach.has(stateKey(s)),
    solvable: canReach.has(stateKey(spawn)),
    toRoomState: (s: SolverState): RoomState => ({
      playerTileX: s.tx,
      playerTileY: s.ty,
      size: s.size,
      destroyed: maskToDestroyed(s.mask, fragile),
      anchor: s.anchor ? { x: s.anchor.tileX * TILE, y: s.anchor.tileY * TILE, size: s.anchor.size } : null,
    }),
    stateCount: reachable.length,
  };
}
