import { describe, expect, it } from "vitest";
import { layout, rewindControlRect } from "../src/game/layout";

describe("layout: 1920x1080 (marking viewport, landscape)", () => {
  const result = layout(1920, 1080);

  it("is letterboxed with an integer scale", () => {
    expect(Number.isInteger(result.scale)).toBe(true);
    expect(result.scale).toBeGreaterThan(0);
  });

  it("centres the canvas rect within the viewport", () => {
    expect(result.canvasRect.x).toBeGreaterThanOrEqual(0);
    expect(result.canvasRect.y).toBeGreaterThanOrEqual(0);
    expect(result.canvasRect.x + result.canvasRect.width).toBeLessThanOrEqual(1920);
    expect(result.canvasRect.y + result.canvasRect.height).toBeLessThanOrEqual(1080);
  });

  it("keeps the 320x180 aspect ratio", () => {
    expect(result.canvasRect.width / result.canvasRect.height).toBeCloseTo(320 / 180, 5);
  });

  it("has no controls rect", () => {
    expect(result.controlsRect).toBeNull();
  });
});

describe("layout: 390x844 (marking viewport, portrait)", () => {
  const result = layout(390, 844);

  it("gives the canvas the full viewport width", () => {
    expect(result.canvasRect.x).toBe(0);
    expect(result.canvasRect.width).toBe(390);
  });

  it("puts the canvas band at the top", () => {
    expect(result.canvasRect.y).toBe(0);
  });

  it("has a controls rect below the canvas, at least 200px tall", () => {
    expect(result.controlsRect).not.toBeNull();
    expect(result.controlsRect!.y).toBe(result.canvasRect.y + result.canvasRect.height);
    expect(result.controlsRect!.height).toBeGreaterThanOrEqual(200);
  });

  it("has a controls rect spanning the full width", () => {
    expect(result.controlsRect!.x).toBe(0);
    expect(result.controlsRect!.width).toBe(390);
  });

  it("canvas band and controls rect together fill the viewport height exactly", () => {
    expect(result.canvasRect.height + result.controlsRect!.height).toBe(844);
  });
});

// issue #10/#12's fix: the contextual rewind control must be positioned so
// it never overlaps the rendered canvas art (the `<h1>` title card is
// outside this coordinate space entirely — main.ts's shell always starts
// below it — so it can't be checked here, only by eye in the real page).
describe("rewindControlRect: never overlaps the canvas rect", () => {
  function assertOutsideCanvas(
    rect: { x: number; y: number; width: number; height: number },
    canvasRect: { x: number; y: number; width: number; height: number },
  ): void {
    const rectRight = rect.x + rect.width;
    const rectBottom = rect.y + rect.height;
    const canvasRight = canvasRect.x + canvasRect.width;
    const canvasBottom = canvasRect.y + canvasRect.height;
    // Two axis-aligned rects are disjoint iff one is entirely to a side of
    // the other on at least one axis.
    const disjoint =
      rectRight <= canvasRect.x ||
      rect.x >= canvasRight ||
      rectBottom <= canvasRect.y ||
      rect.y >= canvasBottom;
    expect(disjoint, `rect ${JSON.stringify(rect)} overlaps canvasRect ${JSON.stringify(canvasRect)}`).toBe(true);
  }

  it("390x844 (portrait, the required mobile viewport): sits inside the controls band, below the canvas", () => {
    const result = layout(390, 844);
    const rect = rewindControlRect(result, 390, 844);
    assertOutsideCanvas(rect, result.canvasRect);
    // Also fully contained within the controls band itself, not just clear
    // of the canvas — a stray negative offset would still pass the disjoint
    // check above by accident.
    expect(rect.x).toBeGreaterThanOrEqual(result.controlsRect!.x);
    expect(rect.y).toBeGreaterThanOrEqual(result.controlsRect!.y);
    expect(rect.x + rect.width).toBeLessThanOrEqual(result.controlsRect!.x + result.controlsRect!.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(result.controlsRect!.y + result.controlsRect!.height);
  });

  it("1920x900 (landscape with a right-hand letterbox margin): sits beside the canvas", () => {
    const result = layout(1920, 900);
    expect(result.controlsRect).toBeNull(); // sanity: this is the landscape branch
    const rect = rewindControlRect(result, 1920, 900);
    assertOutsideCanvas(rect, result.canvasRect);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1920);
    expect(rect.y + rect.height).toBeLessThanOrEqual(900);
  });

  it("1920x1280 (landscape with a top/bottom letterbox margin): sits below the canvas", () => {
    const result = layout(1920, 1280);
    const rect = rewindControlRect(result, 1920, 1280);
    assertOutsideCanvas(rect, result.canvasRect);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1920);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1280);
  });

  it("1920x1080 (landscape, the required desktop viewport, exact-fill edge case): still returns an in-bounds rect", () => {
    // At exactly the game's own 16:9 aspect ratio the canvas fills the
    // viewport with zero letterbox margin on either axis — there is no
    // margin left to place anything in without touching the canvas at all.
    // rewindControlRect's documented fallback (its own top-right corner)
    // is what's asserted here: in-bounds and still a HUD-style overlay, not
    // an off-screen or negative rect.
    const result = layout(1920, 1080);
    expect(result.canvasRect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    const rect = rewindControlRect(result, 1920, 1080);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1920);
    expect(rect.y + rect.height).toBeLessThanOrEqual(1080);
  });
});

describe("layout: general properties", () => {
  it("never returns a negative or zero scale", () => {
    for (const [w, h] of [[1920, 1080], [390, 844], [768, 1024], [1280, 720]]) {
      expect(layout(w, h).scale).toBeGreaterThan(0);
    }
  });
});
