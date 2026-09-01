// Pure viewport-to-layout mapping. No browser API: takes plain numbers,
// returns plain data. main.ts (which does touch the DOM) reads window
// dimensions and calls this; nothing else in the game needs to know the
// difference between landscape and portrait.
//
// Internal game resolution, shared with render.ts (issue 2) and physics.
export const INTERNAL_WIDTH = 320;
export const INTERNAL_HEIGHT = 180;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Layout = {
  scale: number;
  canvasRect: Rect;
  controlsRect: Rect | null;
};

// Minimum height reserved for the touch pads in portrait, per plan.md §3
// ("two large left/right pads and a jump pad, ≥64 px targets").
const MIN_CONTROLS_HEIGHT = 200;

/**
 * Map a viewport size to where the canvas and (if any) the touch controls
 * go. Landscape: canvas centred and letterboxed at the largest integer
 * scale that fits, no controls. Portrait: canvas is a full-width band
 * across the top, touch controls fill the rest below it.
 */
export function layout(viewportWidth: number, viewportHeight: number): Layout {
  const isPortrait = viewportHeight > viewportWidth;

  if (!isPortrait) {
    const scale = Math.max(
      1,
      Math.floor(
        Math.min(viewportWidth / INTERNAL_WIDTH, viewportHeight / INTERNAL_HEIGHT),
      ),
    );
    const width = INTERNAL_WIDTH * scale;
    const height = INTERNAL_HEIGHT * scale;
    const x = Math.floor((viewportWidth - width) / 2);
    const y = Math.floor((viewportHeight - height) / 2);
    return {
      scale,
      canvasRect: { x, y, width, height },
      controlsRect: null,
    };
  }

  // Portrait: fill the width, let the canvas band be as tall as that scale
  // implies, and give everything below it to the controls. Not forced to
  // an integer scale — a full-width band matters more here than crisp
  // pixels, and render.ts still draws the 320x180 backbuffer then scales it
  // up with imageSmoothingEnabled = false regardless of the multiplier.
  const scale = viewportWidth / INTERNAL_WIDTH;
  const canvasHeight = Math.min(
    Math.round(INTERNAL_HEIGHT * scale),
    Math.max(0, viewportHeight - MIN_CONTROLS_HEIGHT),
  );
  const controlsHeight = viewportHeight - canvasHeight;

  return {
    scale,
    canvasRect: { x: 0, y: 0, width: viewportWidth, height: canvasHeight },
    controlsRect: { x: 0, y: canvasHeight, width: viewportWidth, height: controlsHeight },
  };
}

// Size/margin for the contextual rewind control (issue #10/#12's fix: the
// control used to live inside #game-controls, which this same module makes
// `display:none` in landscape — see input.ts's Finding #1 note). 64px
// matches plan.md §3's touch-target minimum, reused here even though this
// control is not one of the movement pads.
const REWIND_CONTROL_SIZE = 64;
const REWIND_CONTROL_MARGIN = 12;

/**
 * Pure placement for the rewind control, independent of the touch-pad band:
 * it must be reachable in *both* orientations (main.ts renders it outside
 * `controlsRect`'s container entirely), so it needs its own rect rather than
 * reusing controlsRect's. Takes the already-computed Layout plus the same
 * viewport numbers layout() was called with, so it never has to touch the
 * DOM to find out where the letterbox margins are.
 *
 * - Portrait (`controlsRect` present): anchored inside the controls band,
 *   clear of the canvas above it.
 * - Landscape (`controlsRect` null): anchored in whichever letterbox margin
 *   around the centred canvas has room (below it, then beside it), so it
 *   never sits over the rendered game view. If the canvas happens to fill
 *   the viewport exactly (no margin either side), it falls back to the
 *   canvas's own top-right corner — a HUD-style overlay, not ideal, but
 *   still never over the `<h1>` above the shell, which is outside this
 *   coordinate space entirely.
 */
export function rewindControlRect(
  current: Layout,
  viewportWidth: number,
  viewportHeight: number,
): Rect {
  const { canvasRect, controlsRect } = current;
  const size = REWIND_CONTROL_SIZE;
  const margin = REWIND_CONTROL_MARGIN;

  if (controlsRect) {
    return {
      x: controlsRect.x + controlsRect.width - size - margin,
      y: controlsRect.y + margin,
      width: size,
      height: size,
    };
  }

  const bottomMargin = viewportHeight - (canvasRect.y + canvasRect.height);
  const rightMargin = viewportWidth - (canvasRect.x + canvasRect.width);
  const needed = size + margin * 2;

  if (bottomMargin >= needed) {
    return {
      x: viewportWidth - size - margin,
      y: canvasRect.y + canvasRect.height + margin,
      width: size,
      height: size,
    };
  }
  if (rightMargin >= needed) {
    return {
      x: canvasRect.x + canvasRect.width + margin,
      y: margin,
      width: size,
      height: size,
    };
  }
  return {
    x: canvasRect.x + canvasRect.width - size - margin,
    y: canvasRect.y + margin,
    width: size,
    height: size,
  };
}
