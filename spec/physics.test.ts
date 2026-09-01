import { describe, expect, it } from "vitest";
import { STEP_MS } from "../src/game/loop";
import {
  createBody,
  DEFAULT_STEP_MS,
  MAX_FALL_SPEED,
  simulateJumpArc,
  stepBody,
  type Body,
  type Destroyed,
  type InputState,
  type PhysicsLevel,
} from "../src/game/physics";

// Issue 3's acceptance criteria (gh issue view 3), each covered by one
// `describe` block below.

const TILE = 10;

/** '#' solid, '.' empty. Row 0 is the top. Rectangular grid, ragged rows
 * padded with '.' so a short test level doesn't need to be perfectly
 * rectangular in its source. */
function makeLevel(rows: string[]): PhysicsLevel {
  const width = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(width, "."));
  return {
    tileSize: TILE,
    widthPx: width * TILE,
    heightPx: grid.length * TILE,
    isSolidTile(tileX, tileY) {
      const row = grid[tileY];
      if (row === undefined) return true;
      return row[tileX] === "#";
    },
  };
}

const NO_INPUT: InputState = { left: false, right: false, jumpHeld: false };
const NO_DESTROYED: Destroyed = new Set();

function run(
  body: Body,
  inputs: InputState[],
  level: PhysicsLevel,
  destroyed: Destroyed = NO_DESTROYED,
): Body {
  let current = body;
  for (const input of inputs) {
    current = stepBody(current, input, level, destroyed);
  }
  return current;
}

describe("determinism", () => {
  it("replaying an identical input sequence twice yields byte-identical body state", () => {
    const level = makeLevel([
      "..........",
      "..........",
      "..........",
      "..........",
      "##########",
    ]);
    const inputs: InputState[] = [
      { left: false, right: true, jumpHeld: false },
      { left: false, right: true, jumpHeld: false },
      { left: false, right: true, jumpHeld: true },
      { left: false, right: true, jumpHeld: true },
      { left: false, right: false, jumpHeld: false },
      { left: true, right: false, jumpHeld: false },
      { left: true, right: false, jumpHeld: true },
      { left: false, right: false, jumpHeld: false },
    ];

    const start = createBody(20, 10, 8, 10);
    const first = run(start, inputs, level);
    const second = run(start, inputs, level);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("stays byte-identical step by step, not just at the end", () => {
    const level = makeLevel(["..........", "##########"]);
    const inputs: InputState[] = Array.from({ length: 30 }, (_, i) => ({
      left: i % 7 === 0,
      right: i % 3 === 0,
      jumpHeld: i % 5 === 0,
    }));

    let a = createBody(15, 0, 8, 10);
    let b = createBody(15, 0, 8, 10);
    for (const input of inputs) {
      a = stepBody(a, input, level, NO_DESTROYED);
      b = stepBody(b, input, level, NO_DESTROYED);
      expect(b).toEqual(a);
    }
  });
});

describe("no tunnelling through a 1-tile wall", () => {
  it("does not fall through a one-tile-thick floor at maximum fall speed", () => {
    // Floor is a single solid row (one tile thick) far below the body.
    const rows = Array.from({ length: 20 }, () => "..........");
    rows[19] = "##########";
    const level = makeLevel(rows);

    let body: Body = { ...createBody(20, 0, 8, 10), vy: MAX_FALL_SPEED };
    // A large dt (well beyond a real 60Hz frame, and enough that dy at max
    // fall speed covers the whole gap to the floor in one call) so the
    // naive dy is far bigger than one tile — this is what would tunnel a
    // point-sample check straight through the floor if the sweep weren't
    // scanning every row crossed.
    body = stepBody(body, NO_INPUT, level, NO_DESTROYED, 1000);

    const floorTopPx = 19 * TILE;
    expect(body.y + body.height).toBeLessThanOrEqual(floorTopPx + 1e-9);
    expect(body.grounded).toBe(true);
    expect(body.vy).toBe(0);
  });

  it("does not tunnel sideways through a one-tile-thick wall at high speed", () => {
    const level = makeLevel(["....#.....", "....#.....", "##########"]);
    let body: Body = { ...createBody(0, 0, 8, 10), vx: 1000, grounded: true };
    body = stepBody(body, { left: false, right: true, jumpHeld: false }, level, NO_DESTROYED, 500);

    const wallLeftPx = 4 * TILE;
    expect(body.x + body.width).toBeLessThanOrEqual(wallLeftPx + 1e-9);
    expect(body.vx).toBe(0);
  });
});

describe("level bounds", () => {
  it("never leaves the level to the left, right, or bottom", () => {
    const level = makeLevel(["..........", "..........", ".........."]);
    let left = createBody(0, 0, 8, 10);
    let right = createBody(level.widthPx - 8, 0, 8, 10);
    for (let i = 0; i < 60; i++) {
      left = stepBody(left, { left: true, right: false, jumpHeld: false }, level, NO_DESTROYED);
      right = stepBody(right, { left: false, right: true, jumpHeld: false }, level, NO_DESTROYED);
    }
    expect(left.x).toBeGreaterThanOrEqual(0);
    expect(right.x + right.width).toBeLessThanOrEqual(level.widthPx);

    let falling = createBody(20, 0, 8, 10);
    for (let i = 0; i < 60; i++) {
      falling = stepBody(falling, NO_INPUT, level, NO_DESTROYED);
    }
    expect(falling.y + falling.height).toBeLessThanOrEqual(level.heightPx);
    expect(falling.grounded).toBe(true);
  });

  it("never leaves the level upward through the top", () => {
    const level = makeLevel(["..........", "##########"]);
    let body: Body = { ...createBody(20, 5, 8, 10), vy: -1000 };
    body = stepBody(body, NO_INPUT, level, NO_DESTROYED, 200);
    expect(body.y).toBeGreaterThanOrEqual(0);
  });
});

describe("wall collision has no jitter or embedding", () => {
  it("stops horizontal motion cleanly and holds position against a wall", () => {
    const level = makeLevel(["....#.....", "....#.....", "##########"]);
    let body = createBody(0, 0, 8, 10);
    const positions: number[] = [];
    for (let i = 0; i < 40; i++) {
      body = stepBody(body, { left: false, right: true, jumpHeld: false }, level, NO_DESTROYED);
      positions.push(body.x);
    }

    const wallLeftPx = 4 * TILE;
    expect(body.x + body.width).toBeLessThanOrEqual(wallLeftPx + 1e-9);
    expect(body.vx).toBe(0);

    // Once against the wall, position must be exactly stable frame to
    // frame — no back-and-forth jitter and no creeping into the wall.
    const settled = positions.slice(-5);
    expect(new Set(settled).size).toBe(1);
    expect(settled[0]).toBe(wallLeftPx - body.width);
  });
});

describe("landing", () => {
  it("sets grounded and zeroes vertical velocity exactly once on touchdown", () => {
    const level = makeLevel(["..........", "..........", "..........", "##########"]);
    let body: Body = { ...createBody(20, 0, 8, 10), vy: 50 };

    let landingFrame = -1;
    let vyAtLanding = NaN;
    for (let i = 0; i < 60; i++) {
      const wasGrounded = body.grounded;
      body = stepBody(body, NO_INPUT, level, NO_DESTROYED);
      if (!wasGrounded && body.grounded) {
        if (landingFrame !== -1) {
          throw new Error("grounded transitioned false->true more than once");
        }
        landingFrame = i;
        vyAtLanding = body.vy;
      }
    }

    expect(landingFrame).toBeGreaterThanOrEqual(0);
    expect(vyAtLanding).toBe(0);
    expect(body.grounded).toBe(true);
    expect(body.vy).toBe(0);
    expect(body.y + body.height).toBe(30);
  });
});

describe("timestep constant stays in sync with loop.ts", () => {
  it("DEFAULT_STEP_MS matches loop.ts's STEP_MS", () => {
    // physics.ts must not import loop.ts (plan.md §5's dependency rule runs
    // one way), so the two modules each define this literal independently.
    // This is the guard against them drifting apart.
    expect(DEFAULT_STEP_MS).toBe(STEP_MS);
  });
});

describe("jump arc (for issue 8's solver)", () => {
  it("produces a positive, finite arc issue 8 can build a reachability table from", () => {
    const arc = simulateJumpArc(TILE);
    expect(arc.maxHeightPx).toBeGreaterThan(0);
    expect(arc.maxHeightTiles).toBeGreaterThanOrEqual(1);
    expect(arc.horizontalRangeAtSameHeightPx).toBeGreaterThan(0);
    expect(arc.horizontalRangeAtSameHeightTiles).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(arc.totalStepsAtSameHeight)).toBe(true);
    expect(arc.risingSteps).toBeGreaterThan(0);
    expect(arc.risingSteps).toBeLessThan(arc.totalStepsAtSameHeight);
  });

  it("is a pure function of the exported constants: same tile size, same arc", () => {
    expect(simulateJumpArc(TILE)).toEqual(simulateJumpArc(TILE));
  });
});

describe("grounded input produces no horizontal drift when idle", () => {
  it("a body with no input decelerates to exactly zero, not an asymptotic crawl", () => {
    const level = makeLevel(["..........", "##########"]);
    let body: Body = { ...createBody(20, 0, 8, 10), vx: 40, grounded: true };
    for (let i = 0; i < 30; i++) {
      body = stepBody(body, NO_INPUT, level, NO_DESTROYED);
    }
    expect(body.vx).toBe(0);
  });
});
