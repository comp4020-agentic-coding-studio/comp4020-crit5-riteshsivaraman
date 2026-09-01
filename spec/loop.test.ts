import { describe, expect, it } from "vitest";
import { createLoop, STEP_MS } from "../src/game/loop";

describe("loop: fixed-timestep accumulator", () => {
  it("a synthetic 250ms frame produces exactly 15 fixed steps", () => {
    const loop = createLoop(() => {});
    expect(loop.advance(250)).toBe(15);
  });

  it("splits a single big frame across multiple advance calls consistently", () => {
    const loop = createLoop(() => {});
    // Ten frames of 25ms should total the same 15 steps per 250ms as one
    // big frame, since the accumulator carries fractional time forward.
    let total = 0;
    for (let i = 0; i < 10; i++) total += loop.advance(25);
    expect(total).toBe(15);
  });

  it("never advances on a step smaller than one fixed tick", () => {
    const loop = createLoop(() => {});
    expect(loop.advance(1)).toBe(0);
  });

  it("clamps a huge elapsed time instead of running thousands of catch-up steps", () => {
    const loop = createLoop(() => {});
    const steps = loop.advance(10_000);
    expect(steps).toBeLessThan(20);
  });

  it("every step receives the same fixed delta, never the wall-clock frame time", () => {
    const seen: number[] = [];
    const loop = createLoop((dt) => seen.push(dt));
    loop.advance(83); // an arbitrary, non-multiple-of-STEP_MS frame
    expect(seen.length).toBeGreaterThan(0);
    for (const dt of seen) expect(dt).toBe(STEP_MS);
  });

  it("does not read the clock itself — advance is a pure function of its input", () => {
    const loop = createLoop(() => {});
    const a = loop.advance(16.666666666666668);
    const loop2 = createLoop(() => {});
    const b = loop2.advance(16.666666666666668);
    expect(a).toBe(b);
  });
});
