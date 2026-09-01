import { describe, expect, it } from "vitest";
import { layout } from "../src/game/layout";

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

describe("layout: general properties", () => {
  it("never returns a negative or zero scale", () => {
    for (const [w, h] of [[1920, 1080], [390, 844], [768, 1024], [1280, 720]]) {
      expect(layout(w, h).scale).toBeGreaterThan(0);
    }
  });
});
