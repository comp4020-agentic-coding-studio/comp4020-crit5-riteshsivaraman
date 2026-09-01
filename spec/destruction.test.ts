import { describe, expect, it } from "vitest";
import { parseLevel, isSolidAt, type Level } from "../src/game/level";
import {
  breakTile,
  createWorld,
  resolveFragileContact,
  restart,
  tilesInContact,
  type World,
} from "../src/game/world";

// Issue 5's acceptance criteria (gh issue view 5), each covered by one
// `describe` block below.

const TILE = 10;

// A small room: solid border, one fragile tile ('=') in the middle of the
// floor. '.' empty, '#' solid concrete, '=' fragile, 'P'/'E' spawn/exit
// (parseLevel requires both; irrelevant to this test beyond satisfying the
// parser).
function makeRoom(): Level {
  return parseLevel([
    "######",
    "#....#",
    "#P.=E#",
    "######",
  ]);
}

const FRAGILE = { x: 3, y: 2 };

describe("breakTile — the plan.md §6 rule in one place", () => {
  it("a small body does not break a fragile tile — destroyed stays empty and the tile stays solid", () => {
    const level = makeRoom();
    const world = createWorld();

    const next = breakTile(world, FRAGILE.x, FRAGILE.y, "small", level);

    expect(next.destroyed.size).toBe(0);
    expect(next).toBe(world); // no-op: same reference back, not a rebuilt empty Set
    expect(isSolidAt(level, FRAGILE.x, FRAGILE.y, next.destroyed)).toBe(true);
  });

  it("a large body breaks a fragile tile — it enters destroyed and the tile becomes passable", () => {
    const level = makeRoom();
    const world = createWorld();

    const next = breakTile(world, FRAGILE.x, FRAGILE.y, "large", level);

    expect(next.destroyed.has(`${FRAGILE.x},${FRAGILE.y}`)).toBe(true);
    expect(isSolidAt(level, FRAGILE.x, FRAGILE.y, next.destroyed)).toBe(false);
  });

  it("a large body cannot break a solid ('#') tile — it is not fragile", () => {
    const level = makeRoom();
    const world = createWorld();

    const next = breakTile(world, 0, 0, "large", level); // (0,0) is '#'

    expect(next.destroyed.size).toBe(0);
    expect(next).toBe(world);
  });

  it("is idempotent — breaking the same tile twice changes nothing the second time", () => {
    const level = makeRoom();
    const world = createWorld();

    const once = breakTile(world, FRAGILE.x, FRAGILE.y, "large", level);
    const twice = breakTile(once, FRAGILE.x, FRAGILE.y, "large", level);

    expect(twice).toBe(once); // same World reference — nothing rebuilt
    expect(twice.destroyed.size).toBe(1);
  });
});

describe("tilesInContact — which tiles an AABB is pressed against", () => {
  it("includes the tile a body is stopped flush against, not overlapping", () => {
    // Body's right edge sits exactly on the fragile tile's left edge —
    // physics.ts's collision resolver stops a body exactly here, with no
    // overlap (see moveAxisX). Contact detection must still find it.
    const bodyX = FRAGILE.x * TILE - 8; // width-8 body, right edge at FRAGILE.x*TILE
    const bodyY = FRAGILE.y * TILE;
    const tiles = tilesInContact(bodyX, bodyY, 8, 10, TILE);

    expect(tiles).toEqual(expect.arrayContaining([{ x: FRAGILE.x, y: FRAGILE.y }]));
  });

  it("does not include a tile one full tile further away", () => {
    const farX = (FRAGILE.x - 3) * TILE;
    const tiles = tilesInContact(farX, FRAGILE.y * TILE, 8, 10, TILE);

    expect(tiles).not.toEqual(expect.arrayContaining([{ x: FRAGILE.x, y: FRAGILE.y }]));
  });
});

describe("resolveFragileContact — a small body colliding with '=' leaves destroyed empty and is blocked; a large body breaks it and the tile becomes passable", () => {
  const bodyX = FRAGILE.x * TILE - 8; // pressed flush against the fragile tile's left edge
  const bodyY = FRAGILE.y * TILE;

  it("small: touches the fragile tile, does not break it, tile stays solid (blocked)", () => {
    const level = makeRoom();
    const world = createWorld();

    const result = resolveFragileContact(world, bodyX, bodyY, 8, 10, "small", level);

    expect(result.touchedFragile).toEqual(expect.arrayContaining([FRAGILE]));
    expect(result.broken).toEqual([]);
    expect(result.world.destroyed.size).toBe(0);
    expect(isSolidAt(level, FRAGILE.x, FRAGILE.y, result.world.destroyed)).toBe(true);
  });

  it("large: touches the fragile tile and breaks it, tile becomes passable", () => {
    const level = makeRoom();
    const world = createWorld();

    const result = resolveFragileContact(world, bodyX, bodyY, 16, 20, "large", level);

    expect(result.broken).toEqual(expect.arrayContaining([FRAGILE]));
    expect(result.world.destroyed.has(`${FRAGILE.x},${FRAGILE.y}`)).toBe(true);
    expect(isSolidAt(level, FRAGILE.x, FRAGILE.y, result.world.destroyed)).toBe(false);
  });

  it("a body nowhere near the fragile tile touches and breaks nothing", () => {
    const level = makeRoom();
    const world = createWorld();

    const result = resolveFragileContact(world, TILE, TILE, 8, 10, "large", level);

    expect(result.touchedFragile).toEqual([]);
    expect(result.broken).toEqual([]);
    expect(result.world).toBe(world);
  });
});

describe("restart — full room reset, distinct from breakTile", () => {
  it("clears destroyed entirely, independent of whatever was broken before", () => {
    const level = makeRoom();
    let world: World = createWorld();
    world = breakTile(world, FRAGILE.x, FRAGILE.y, "large", level);
    expect(world.destroyed.size).toBe(1);

    const reset = restart();

    expect(reset.destroyed.size).toBe(0);
  });

  it("takes no World argument — there is no call shape that partially clears one", () => {
    // Type-level guarantee, asserted at runtime too: restart() always
    // returns a brand-new World, never a derivative of an existing one.
    const a = restart();
    const b = restart();
    expect(a).not.toBe(b);
    expect(a.destroyed).not.toBe(b.destroyed);
    expect(a).toEqual({ destroyed: new Set() });
  });
});
