// Fixed-timestep accumulator loop. Pure: it never reads the clock itself.
// main.ts is the only thing that calls performance.now()/requestAnimationFrame
// and feeds the elapsed milliseconds in; every step this hands out is exactly
// STEP_MS, which is what keeps replayed input sequences deterministic in
// tests (see plan.md §5, "determinism is a hard requirement").
export const STEP_HZ = 60;
export const STEP_MS = 1000 / STEP_HZ;

export type StepFn = (fixedDeltaMs: number) => void;

export type Loop = {
  /** Feed real elapsed milliseconds in; returns how many fixed steps ran. */
  advance(frameMs: number): number;
};

// Guards against a huge elapsed time (e.g. the tab was backgrounded) turning
// into thousands of catch-up steps in one call. main.ts is expected to clamp
// before calling advance, but the loop clamps too so it's safe on its own.
const MAX_FRAME_MS = 250;

// Floating-point division of a duration by STEP_MS can land a hair under
// the true integer (1000/60 is not exact in binary), which would silently
// drop a step. A tiny epsilon absorbs that without ever manufacturing an
// extra step from real accumulated error.
const EPSILON_MS = 1e-9;

export function createLoop(step: StepFn, stepMs: number = STEP_MS): Loop {
  let accumulator = 0;

  return {
    advance(frameMs: number): number {
      accumulator += Math.min(Math.max(frameMs, 0), MAX_FRAME_MS);

      const steps = Math.floor((accumulator + EPSILON_MS) / stepMs);
      for (let i = 0; i < steps; i++) {
        step(stepMs);
      }
      accumulator -= steps * stepMs;

      return steps;
    },
  };
}
