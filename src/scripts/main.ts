// Bootstrap only: this is the one place allowed to touch the DOM, the
// clock, and requestAnimationFrame (plan.md §5's dependency rule). It wires
// the pure layout() and createLoop() from src/game into the actual canvas
// and window events, and owns nothing that needs to be unit-testable.
import { createLoop, type Loop } from "../game/loop";
import { layout, INTERNAL_WIDTH, INTERNAL_HEIGHT, type Layout } from "../game/layout";

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
    shell.style.height = `${window.innerHeight}px`;
  }
}

function resize(): void {
  shell.style.width = `${window.innerWidth}px`;
  // Lay the game out in whatever height remains below the header/h1, not
  // the full viewport height, so the page never grows taller than the
  // viewport and never needs a vertical scrollbar either.
  const availableHeight = window.innerHeight - shell.getBoundingClientRect().top;
  applyLayout(layout(window.innerWidth, Math.max(1, Math.floor(availableHeight))));
}

window.addEventListener("resize", resize);
resize();

// Placeholder render: render.ts (issue 2) owns the real tile atlas and the
// game's visuals. This just proves the canvas is live and the fixed step
// is actually running, without drawing anything that looks like a finished
// scene yet.
function step(_fixedDeltaMs: number): void {
  // Rules/physics/world land in later issues; nothing to simulate yet.
}

function render(): void {
  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
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
