// Bootstrap only: this is the one place allowed to touch the DOM, the
// clock, and requestAnimationFrame (plan.md §5's dependency rule). It wires
// the pure layout() and createLoop() from src/game into the actual canvas
// and window events, and owns nothing that needs to be unit-testable.
import { createLoop, type Loop } from "../game/loop";
import { layout, INTERNAL_WIDTH, INTERNAL_HEIGHT, type Layout } from "../game/layout";
import { parseLevel } from "../game/level";
import { TILE, ROOM_WIDTH_TILES, ROOM_HEIGHT_TILES } from "../game/tiles";
import {
  bakeAtlas,
  renderLevel,
  type RenderCanvas,
  type RenderCtx,
  type PlayerRect,
} from "../game/render";

function required<T>(el: T | null, what: string): T {
  if (!el) throw new Error(`main.ts: expected ${what} in the page`);
  return el;
}

const shell = required(document.getElementById("game-shell"), "#game-shell");
const canvas = required(
  document.getElementById("game-canvas") as HTMLCanvasElement | null,
  "#game-canvas",
);
const controls = required(document.getElementById("game-controls"), "#game-controls");

canvas.width = INTERNAL_WIDTH;
canvas.height = INTERNAL_HEIGHT;

const ctx = required(canvas.getContext("2d"), "a 2d canvas context");
ctx.imageSmoothingEnabled = false;

function applyLayout(current: Layout): void {
  const { canvasRect, controlsRect } = current;

  canvas.style.position = "absolute";
  canvas.style.left = `${canvasRect.x}px`;
  canvas.style.top = `${canvasRect.y}px`;
  canvas.style.width = `${canvasRect.width}px`;
  canvas.style.height = `${canvasRect.height}px`;

  if (controlsRect) {
    controls.hidden = false;
    controls.style.position = "absolute";
    controls.style.left = `${controlsRect.x}px`;
    controls.style.top = `${controlsRect.y}px`;
    controls.style.width = `${controlsRect.width}px`;
    controls.style.height = `${controlsRect.height}px`;
    shell.style.height = `${canvasRect.height + controlsRect.height}px`;
  } else {
    controls.hidden = true;
    shell.style.height = `${document.documentElement.clientHeight}px`;
  }
}

function resize(): void {
  // clientWidth/clientHeight are the content box of the root element —
  // they exclude the vertical scrollbar's own width (window.innerWidth
  // does not), so sizing the shell to this never overflows horizontally
  // by the scrollbar's width the way window.innerWidth did.
  const viewportWidth = document.documentElement.clientWidth;
  shell.style.width = `${viewportWidth}px`;
  // Lay the game out in whatever height remains below the header/h1, not
  // the full viewport height, so the page never grows taller than the
  // viewport and never needs a vertical scrollbar either.
  const availableHeight =
    document.documentElement.clientHeight - shell.getBoundingClientRect().top;
  applyLayout(layout(viewportWidth, Math.max(1, Math.floor(availableHeight))));
}

window.addEventListener("resize", resize);
resize();

// Issue 14: bake the tileset atlas once at boot (never per frame — see
// render.ts's bakeAtlas docs) using the real DOM canvas + ImageData ctors.
function createCanvas(width: number, height: number): RenderCanvas {
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  return el as unknown as RenderCanvas;
}

const atlas = bakeAtlas(
  createCanvas,
  (data, width, height) => new ImageData(data as unknown as Uint8ClampedArray<ArrayBuffer>, width, height),
);

// Demo room: world.ts/rooms/*.ts (issues #6/#9) don't exist yet, so this is
// a throwaway fixture built here in the bootstrap file, not a real room —
// its only job is to put every tile kind on screen at once so a human can
// judge legibility (issue 14's Done-when bullet 5) and to unblock the four
// human checks issue 14 exists to unblock (notes/agents/log.md [#14]).
// Exactly ROOM_WIDTH_TILES x ROOM_HEIGHT_TILES so it fills the 320x180
// backbuffer with no camera/scroll needed.
function buildDemoRows(): string[] {
  const rows: string[][] = Array.from({ length: ROOM_HEIGHT_TILES }, () =>
    Array.from({ length: ROOM_WIDTH_TILES }, () => "."),
  );
  const last = ROOM_HEIGHT_TILES - 1;
  const right = ROOM_WIDTH_TILES - 1;

  for (let x = 0; x < ROOM_WIDTH_TILES; x++) {
    rows[0][x] = "%";
    rows[last][x] = "%";
  }
  for (let y = 0; y < ROOM_HEIGHT_TILES; y++) {
    rows[y][0] = "#";
    rows[y][right] = "#";
  }

  // A floor to stand on, one row up from the bottom border, with a couple
  // of fragile gaps so "=" reads next to solid "#" for comparison.
  const floorY = last - 2;
  for (let x = 1; x < right; x++) {
    rows[floorY][x] = x === 10 || x === 11 ? "=" : "#";
  }

  rows[floorY - 1][6] = "G"; // growth pad
  rows[floorY - 1][15] = "C"; // coolant
  rows[floorY - 1][24] = "R"; // rewind machine
  rows[floorY - 3][20] = ":"; // decor pipe, non-colliding

  rows[floorY - 1][2] = "P"; // spawn
  rows[floorY - 1][right - 2] = "E"; // exit

  return rows.map((row) => row.join(""));
}

const demoLevel = parseLevel(buildDemoRows());
const demoDestroyed = new Set<string>();
const player: PlayerRect = {
  x: demoLevel.spawn.x * TILE,
  y: demoLevel.spawn.y * TILE - (16 - TILE),
  width: 8,
  height: 16,
};

// Rules/physics/world land in later issues; nothing to simulate yet, so the
// step function stays empty and the player rect above is static.
function step(_fixedDeltaMs: number): void {
  // Nothing to simulate yet — see the comment above.
}

function render(): void {
  renderLevel(ctx as unknown as RenderCtx, atlas, demoLevel, demoDestroyed, player);
}

const loop: Loop = createLoop(step);

let last = performance.now();
function frame(now: number): void {
  const elapsed = now - last;
  last = now;
  loop.advance(elapsed);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
