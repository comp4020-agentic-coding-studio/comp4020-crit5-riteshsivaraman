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
