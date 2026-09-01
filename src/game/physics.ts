// Pure deterministic AABB platformer physics. See plan.md §5: this module,
// `world.ts`, `rules.ts` and `solver.ts` must stay free of browser APIs,
// wall-clock reads and randomness so they can be imported into vitest with
// no canvas and replayed byte-for-byte in tests.
//
// stepBody(body, input, level, destroyed, dtMs) -> Body is the entire public
// surface. Everything else here is either a constant or a private helper.
//
// Dependency-rule note (plan.md §5): `loop.ts` may import from this module,
// never the other way around. `DEFAULT_STEP_MS` below is therefore a
// deliberately *duplicated* literal (1000/60), not an import of
// `loop.ts`'s `STEP_MS` — `spec/physics.test.ts` asserts the two stay equal
// so the duplication can't silently drift.

// ---------------------------------------------------------------------------
// Tunable constants — arcade feel per notes/idea.md §38: responsive
// acceleration, forgiving jump (coyote time + a small input buffer),
// controlled gravity, stable ground detection, no slippery momentum.
// These are a first pass tuned by the numbers alone (no browser was
// available this session to play-test the feel — see the report/log).
// ---------------------------------------------------------------------------

/** Fixed timestep this module assumes when the caller doesn't pass one. */
export const DEFAULT_STEP_MS = 1000 / 60;

/** Horizontal top speed, px/s. */
export const MAX_RUN_SPEED = 70;
/** Horizontal acceleration while grounded and an input direction is held. */
export const GROUND_ACCEL = 800;
/** Horizontal deceleration while grounded and no input is held — deliberately
 * close to GROUND_ACCEL so stopping is crisp rather than sliding. */
export const GROUND_DECEL = 900;
/** Horizontal acceleration while airborne — slightly softer than ground. */
export const AIR_ACCEL = 600;
export const AIR_DECEL = 500;

/** Downward acceleration, px/s². */
export const GRAVITY = 700;
/** Terminal vertical speed, px/s. Chosen so a single fixed step at this
 * speed (~5px at 60Hz) is well under one tile (10px) — belt for the
 * tile-scan sweep below, which is what actually rules out tunnelling at any
 * speed, braces for it too. */
export const MAX_FALL_SPEED = 300;
/** Upward speed applied on a jump, px/s. */
export const JUMP_SPEED = 220;

/** Grace period after leaving a ledge during which a jump still fires. */
export const COYOTE_TIME_MS = 100;
/** Grace period after pressing jump during which a landing still fires it. */
export const JUMP_BUFFER_MS = 120;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Everything physics needs to know about the world it steps a body through.
 * Deliberately not `level.ts`'s eventual `Level` type (that module belongs
 * to another issue and doesn't exist yet) — `level.ts` should construct one
 * of these (or physics should grow an adapter) rather than physics reaching
 * into a grid/ASCII format it has no business parsing. */
export type PhysicsLevel = {
  /** Pixel size of one grid tile — must match the grid `isSolidTile` reads. */
  tileSize: number;
  /** Level bounds in pixels; a body's AABB is clamped inside them. */
  widthPx: number;
  heightPx: number;
  /** Static solidity of a tile, ignoring `destroyed` — fragile walls report
   * solid here until `world.ts` records them destroyed (plan.md §6). */
  isSolidTile(tileX: number, tileY: number): boolean;
};

/** Permanently-broken fragile tiles, keyed `"x,y"` in tile coordinates —
 * exactly world.ts's `destroyed: Set<string>` shape (plan.md §6), so a
 * world reducer can pass its set straight through with no translation. */
export type Destroyed = ReadonlySet<string>;

export type InputState = {
  left: boolean;
  right: boolean;
  /** Raw held-state of the jump button, not an edge — stepBody detects the
   * press edge itself from `jumpHeldPrev`, so callers (tests, input.ts) never
   * have to compute edges themselves. */
  jumpHeld: boolean;
};

export type Body = {
  /** Top-left corner, px. */
  x: number;
  y: number;
  /** AABB size, px — player.ts decides this per size state; physics never
   * looks at a Size enum. */
  width: number;
  height: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** Remaining coyote-jump period, ms. */
  coyoteMs: number;
  /** Remaining buffered-jump period, ms. */
  jumpBufferMs: number;
  /** Previous frame's raw jump-held state, for edge detection. */
  jumpHeldPrev: boolean;
};

/** A fresh body at rest at the given top-left corner. Not "the" spawn
 * function (level.ts owns spawn semantics) — just a convenient, correct
 * zero value for tests and callers that don't need anything fancier. */
export function createBody(x: number, y: number, width: number, height: number): Body {
  return {
    x,
    y,
    width,
    height,
    vx: 0,
    vy: 0,
    grounded: false,
    coyoteMs: 0,
    jumpBufferMs: 0,
    jumpHeldPrev: false,
  };
}

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

export function stepBody(
  body: Body,
  input: InputState,
  level: PhysicsLevel,
  destroyed: Destroyed,
  dtMs: number = DEFAULT_STEP_MS,
): Body {
  const dt = dtMs / 1000;

  // --- Horizontal velocity: accelerate toward max speed, decelerate to a
  // crisp stop with no held direction. No momentum carries between
  // grounded/airborne beyond the (slightly softer) air accel/decel.
  const accel = body.grounded ? GROUND_ACCEL : AIR_ACCEL;
  const decel = body.grounded ? GROUND_DECEL : AIR_DECEL;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let vx = body.vx;
  if (dir !== 0) {
    vx = clamp(vx + dir * accel * dt, -MAX_RUN_SPEED, MAX_RUN_SPEED);
  } else if (vx > 0) {
    vx = Math.max(0, vx - decel * dt);
  } else if (vx < 0) {
    vx = Math.min(0, vx + decel * dt);
  }

  // --- Vertical velocity: gravity, then jump (coyote + buffer), using the
  // *previous* frame's grounded/timer state — the timers are what let a
  // jump input still land after the body has already left the ledge, or
  // still fire once the body lands after being pressed slightly early.
  let vy = Math.min(body.vy + GRAVITY * dt, MAX_FALL_SPEED);

  const jumpPressedEdge = input.jumpHeld && !body.jumpHeldPrev;
  const coyoteAvailable = body.grounded ? COYOTE_TIME_MS : Math.max(0, body.coyoteMs - dtMs);
  const jumpBufferAvailable = jumpPressedEdge
    ? JUMP_BUFFER_MS
    : Math.max(0, body.jumpBufferMs - dtMs);

  let coyoteMs = coyoteAvailable;
  let jumpBufferMs = jumpBufferAvailable;
  if (jumpBufferMs > 0 && coyoteMs > 0) {
    vy = -JUMP_SPEED;
    coyoteMs = 0;
    jumpBufferMs = 0;
  }

  // --- Move + collide, one axis at a time (x then y), each swept tile by
  // tile so no speed — however large — can skip over a solid tile in one
  // step (the "cannot tunnel through a 1-tile wall" requirement).
  const afterX = moveAxisX(body.x, body.y, body.width, body.height, vx, dt, level, destroyed);
  const afterY = moveAxisY(afterX.x, body.y, body.width, body.height, vy, dt, level, destroyed);

  let x = afterX.x;
  let y = afterY.y;
  let finalVx = afterX.vx;
  let finalVy = afterY.vy;
  let grounded = afterY.grounded;

  // --- Hard level-bounds clamp: physics never lets a body leave the level
  // in any direction, independent of whatever tiles the level does or
  // doesn't put at its edges.
  const minX = 0;
  const maxX = level.widthPx - body.width;
  if (x < minX) {
    x = minX;
    finalVx = 0;
  } else if (x > maxX) {
    x = maxX;
    finalVx = 0;
  }

  const minY = 0;
  const maxY = level.heightPx - body.height;
  if (y < minY) {
    y = minY;
    finalVy = 0;
  } else if (y > maxY) {
    y = maxY;
    finalVy = 0;
    grounded = true;
  }

  if (grounded) coyoteMs = COYOTE_TIME_MS;

  return {
    x,
    y,
    width: body.width,
    height: body.height,
    vx: finalVx,
    vy: finalVy,
    grounded,
    coyoteMs,
    jumpBufferMs,
    jumpHeldPrev: input.jumpHeld,
  };
}

// ---------------------------------------------------------------------------
// Jump-arc derivation for issue 8's solver
//
// plan.md §7 requires the solver's "jump up to J tiles / across H tiles"
// table to be *derived* from these constants, not hand-copied, so gravity or
// jump-speed tuning here can't silently drift out of sync with what the
// solver thinks is reachable. `simulateJumpArc` runs the exact same fixed-
// step integration as `stepBody`'s vertical axis (same GRAVITY, JUMP_SPEED,
// MAX_FALL_SPEED, DEFAULT_STEP_MS) with no horizontal collision, so its
// output is what a real jump in this engine does, discretisation error
// included, not a continuous-physics approximation that could disagree with
// the discrete engine at the margins.
// ---------------------------------------------------------------------------

export type JumpArc = {
  /** Peak rise above the takeoff point, px. */
  maxHeightPx: number;
  /** Peak rise above takeoff, in whole tiles the player's *head* can clear
   * (floor of maxHeightPx / tileSize) — the conservative number issue 8
   * wants for "can this gap's far ledge, N tiles up, be reached". */
  maxHeightTiles: number;
  /** Steps (frames) from takeoff to apex. */
  risingSteps: number;
  /** Total airborne steps for a jump that lands back at the takeoff height. */
  totalStepsAtSameHeight: number;
  /** Horizontal distance covered in that time at MAX_RUN_SPEED, px. */
  horizontalRangeAtSameHeightPx: number;
  /** Same, in whole tiles — conservative (floor) so the solver never credits
   * a jump with clearing a gap it would actually fall just short of. */
  horizontalRangeAtSameHeightTiles: number;
};

/**
 * Simulate one full jump (takeoff at vy = -JUMP_SPEED, under gravity, with
 * MAX_FALL_SPEED capping the descent) using the same per-step integration
 * `stepBody` uses, with no horizontal collision — i.e. free flight — so the
 * numbers match what the engine actually does. `stepMs` defaults to the
 * same fixed step `stepBody` defaults to.
 */
export function simulateJumpArc(tileSize: number, stepMs: number = DEFAULT_STEP_MS): JumpArc {
  const dt = stepMs / 1000;
  let vy = -JUMP_SPEED;
  let heightAboveStart = 0;
  let maxHeightPx = 0;
  let risingSteps = 0;
  let steps = 0;
  let sawApex = false;

  // Run until the body would be back at (or below) takeoff height, moving
  // downward — i.e. one full up-down cycle. Guard against infinite loop if
  // constants are ever tuned to something degenerate.
  const MAX_STEPS = 100_000;
  while (steps < MAX_STEPS) {
    vy = Math.min(vy + GRAVITY * dt, MAX_FALL_SPEED);
    heightAboveStart -= vy * dt; // vy negative (up) increases height
    steps += 1;
    if (!sawApex && vy >= 0) {
      sawApex = true;
      risingSteps = steps;
    }
    if (heightAboveStart > maxHeightPx) maxHeightPx = heightAboveStart;
    if (sawApex && heightAboveStart <= 0) break;
  }

  const totalStepsAtSameHeight = steps;
  const horizontalRangeAtSameHeightPx = MAX_RUN_SPEED * (totalStepsAtSameHeight * dt);

  return {
    maxHeightPx,
    maxHeightTiles: Math.floor(maxHeightPx / tileSize),
    risingSteps,
    totalStepsAtSameHeight,
    horizontalRangeAtSameHeightPx,
    horizontalRangeAtSameHeightTiles: Math.floor(horizontalRangeAtSameHeightPx / tileSize),
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function tileIndex(px: number, tileSize: number): number {
  return Math.floor(px / tileSize);
}

// Tiny inward epsilon so a body whose edge sits exactly on a tile boundary
// samples the row/column it's actually standing in rather than spilling
// into the next one due to floating-point roundoff.
const EPS = 1e-6;

function isSolidAt(
  level: PhysicsLevel,
  destroyed: Destroyed,
  tileX: number,
  tileY: number,
): boolean {
  const cols = Math.ceil(level.widthPx / level.tileSize);
  const rows = Math.ceil(level.heightPx / level.tileSize);
  if (tileX < 0 || tileY < 0 || tileX >= cols || tileY >= rows) return true;
  if (destroyed.has(`${tileX},${tileY}`)) return false;
  return level.isSolidTile(tileX, tileY);
}

function colSolidAcrossRows(
  col: number,
  rowStart: number,
  rowEnd: number,
  level: PhysicsLevel,
  destroyed: Destroyed,
): boolean {
  for (let row = rowStart; row <= rowEnd; row++) {
    if (isSolidAt(level, destroyed, col, row)) return true;
  }
  return false;
}

function rowSolidAcrossCols(
  row: number,
  colStart: number,
  colEnd: number,
  level: PhysicsLevel,
  destroyed: Destroyed,
): boolean {
  for (let col = colStart; col <= colEnd; col++) {
    if (isSolidAt(level, destroyed, col, row)) return true;
  }
  return false;
}

function moveAxisX(
  x: number,
  y: number,
  w: number,
  h: number,
  vx: number,
  dt: number,
  level: PhysicsLevel,
  destroyed: Destroyed,
): { x: number; vx: number } {
  const dx = vx * dt;
  if (dx === 0) return { x, vx };

  const rowStart = tileIndex(y + EPS, level.tileSize);
  const rowEnd = tileIndex(y + h - EPS, level.tileSize);

  if (dx > 0) {
    const fromCol = tileIndex(x + w, level.tileSize);
    const toCol = tileIndex(x + w + dx, level.tileSize);
    for (let col = fromCol; col <= toCol; col++) {
      if (colSolidAcrossRows(col, rowStart, rowEnd, level, destroyed)) {
        return { x: col * level.tileSize - w, vx: 0 };
      }
    }
    return { x: x + dx, vx };
  }

  const fromCol = tileIndex(x, level.tileSize);
  const toCol = tileIndex(x + dx, level.tileSize);
  for (let col = fromCol; col >= toCol; col--) {
    if (colSolidAcrossRows(col, rowStart, rowEnd, level, destroyed)) {
      return { x: (col + 1) * level.tileSize, vx: 0 };
    }
  }
  return { x: x + dx, vx };
}

function moveAxisY(
  x: number,
  y: number,
  w: number,
  h: number,
  vy: number,
  dt: number,
  level: PhysicsLevel,
  destroyed: Destroyed,
): { y: number; vy: number; grounded: boolean } {
  const dy = vy * dt;
  if (dy === 0) return { y, vy, grounded: false };

  const colStart = tileIndex(x + EPS, level.tileSize);
  const colEnd = tileIndex(x + w - EPS, level.tileSize);

  if (dy > 0) {
    const fromRow = tileIndex(y + h, level.tileSize);
    const toRow = tileIndex(y + h + dy, level.tileSize);
    for (let row = fromRow; row <= toRow; row++) {
      if (rowSolidAcrossCols(row, colStart, colEnd, level, destroyed)) {
        return { y: row * level.tileSize - h, vy: 0, grounded: true };
      }
    }
    return { y: y + dy, vy, grounded: false };
  }

  const fromRow = tileIndex(y, level.tileSize);
  const toRow = tileIndex(y + dy, level.tileSize);
  for (let row = fromRow; row >= toRow; row--) {
    if (rowSolidAcrossCols(row, colStart, colEnd, level, destroyed)) {
      return { y: (row + 1) * level.tileSize, vy: 0, grounded: false };
    }
  }
  return { y: y + dy, vy, grounded: false };
}
