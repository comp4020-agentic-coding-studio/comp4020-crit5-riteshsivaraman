// Bootstrap only: this is the one place allowed to touch the DOM, the
// clock, and requestAnimationFrame (plan.md §5's dependency rule). It wires
// the pure layout() and createLoop() from src/game into the actual canvas
// and window events, and owns nothing that needs to be unit-testable.
import { createLoop, type Loop } from "../game/loop";
import { layout, INTERNAL_WIDTH, INTERNAL_HEIGHT, type Layout } from "../game/layout";
import { parseLevel, isSolidAt } from "../game/level";
import { TILE, ROOM_WIDTH_TILES, ROOM_HEIGHT_TILES } from "../game/tiles";
import {
  bakeAtlas,
  renderLevel,
  type RenderCanvas,
  type RenderCtx,
  type PlayerRect,
} from "../game/render";
import { createBody, stepBody, JUMP_SPEED, type Body, type PhysicsLevel } from "../game/physics";
import { createInputController } from "../game/input";
// Issue #4: size system. Pure module — see notes/agents/log.md [#4] for why
// the safe-growth predicate and the transition timer live there and not
// inline here. main.ts's only job is to notice when the player is standing
// on a 'G'/'C' tile and forward that to requestSizeChange.
import {
  advanceSizeTransition,
  HITBOX,
  initialSizeState,
  PLAYER_COLOR,
  requestSizeChange,
  transitionScale,
  type PlayerSizeState,
} from "../game/player";
// Issue #6: rewind machine. Pure module — see notes/agents/log.md [#6] for
// why it takes structural parameters instead of importing world.ts (which
// doesn't exist in this demo wiring either; #5/#6 both replace this file's
// throwaway state once a real World exists).
import { arm, rewind, type Anchor } from "../game/rewind";
// Issue #11's browser half of playSfx, imported directly rather than only
// relying on index.astro's separate <script> tag — see this file's log
// entry [#10] for why that's safe (ESM module identity is per URL, so the
// audio module's gesture-unlock/engine setup still only runs once even
// though two entry points now reference it).
import { playSfx } from "./audio";

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
// Issue #4: the small hitbox is the real spawn size (8x10), replacing #14's
// throwaway 8x16 placeholder per that issue's own log entry ("do not treat
// it as load-bearing" — this is the Builder that gets to decide).
let sizeState: PlayerSizeState = initialSizeState("small");
const player: PlayerRect = {
  x: demoLevel.spawn.x * TILE,
  y: demoLevel.spawn.y * TILE - (HITBOX.small.height - TILE),
  width: HITBOX.small.width,
  height: HITBOX.small.height,
  color: PLAYER_COLOR.small,
};

// world.ts (#6) doesn't exist yet, so there is no real reducer to step —
// but issue #10 needs the player to actually move to unblock the "does the
// jump feel fair" human check, so physics.ts's stepBody is driven directly
// against the demo level here. #4/#6's Builders replace this with a real
// World once size/destruction/rewind exist; nothing here is meant to
// survive that.
const physicsLevel: PhysicsLevel = {
  tileSize: TILE,
  widthPx: ROOM_WIDTH_TILES * TILE,
  heightPx: ROOM_HEIGHT_TILES * TILE,
  isSolidTile: (tileX, tileY) => isSolidAt(demoLevel, tileX, tileY, demoDestroyed),
};
let playerBody: Body = createBody(player.x, player.y, player.width, player.height);

let paused = false;
function togglePause(): void {
  paused = !paused;
}

// Issue #6: no anchor stored yet. `arm()` refuses to store one that
// doesn't fit — see src/game/rewind.ts — so `null` here always means
// "no machine armed", never "armed somewhere invalid".
let anchor: Anchor | null = null;
let wasOnRewindTile = false;

// Runs the player back to `anchor`, per plan.md's brief ("re-entering it,
// or the contextual rewind control, returns the player to that anchor").
// `rewind()` itself never touches `demoDestroyed` — see rewind.ts's file
// header for why that's structural, not just "it doesn't currently do
// it". A no-op (no anchor armed) is silently ignored, same convention as
// every other no-op in this file (requestSizeChange, etc).
function triggerRewind(): void {
  const result = rewind({
    x: playerBody.x,
    y: playerBody.y,
    size: sizeState.size,
    anchor,
    destroyed: demoDestroyed,
  });
  if (!result.triggered) return;
  const box = HITBOX[result.size];
  playerBody = { ...playerBody, x: result.x, y: result.y, width: box.width, height: box.height };
  sizeState = { size: result.size, transition: null };
  player.color = PLAYER_COLOR[result.size];
  playSfx("rewind");
}

// Issue #10: unified keyboard + touch input. Neither physics.ts nor this
// step function below can tell A/Left from a finger on #pad-left — both
// arrive already OR'd into the same InputState (src/game/input.ts).
const inputController = createInputController({
  keyTarget: window,
  controlsContainer: controls,
  document,
  onPauseRequest: togglePause,
  // Issue #10 built the contextual control gated on setMachineArmed;
  // issue #6 (this file's change) is the first caller with something
  // real for it to do.
  onRewindRequest: triggerRewind,
});

function step(fixedDeltaMs: number): void {
  if (paused) return;

  const input = inputController.getState();
  const wasGrounded = playerBody.grounded;
  const prevVy = playerBody.vy;

  playerBody = stepBody(playerBody, input, physicsLevel, demoDestroyed, fixedDeltaMs);

  // Jump/land are "decided" right here, the instant stepBody's new Body
  // comes back — not inside physics.ts (which must stay pure, plan.md §5)
  // and not guessed at from outside via a second copy of stepBody's jump
  // logic. A jump impulse is the *only* way vy can become exactly
  // -JUMP_SPEED (gravity only ever adds to vy), so comparing against the
  // previous frame's vy catches exactly the step a jump fires, no edge
  // detection duplicated from physics.ts. A landing is exactly a
  // grounded:false -> grounded:true transition.
  if (playerBody.vy === -JUMP_SPEED && prevVy !== -JUMP_SPEED) {
    playSfx("jump");
  }
  if (!wasGrounded && playerBody.grounded) {
    playSfx("land");
  }

  // Issue #4: touching a growth pad or coolant tile requests a size
  // change. The tile sampled is the one at the body's feet, centre
  // column — same "tiny inward epsilon" convention physics.ts itself uses
  // so a body sitting exactly on a tile boundary samples the tile it's
  // actually standing in. requestSizeChange is the no-op when already at
  // the target size or when the safe-growth predicate refuses the move
  // (e.g. no headroom) — this call site doesn't special-case either.
  const feetTileX = Math.floor((playerBody.x + playerBody.width / 2) / TILE);
  const feetTileY = Math.floor((playerBody.y + playerBody.height - 1e-6) / TILE);
  const feetRow = demoLevel.grid[feetTileY];
  const feetChar = feetRow ? feetRow[feetTileX] : undefined;
  const target = feetChar === "G" ? "large" : feetChar === "C" ? "small" : null;
  if (target) {
    const change = requestSizeChange(sizeState, target, playerBody.x, playerBody.y, physicsLevel, demoDestroyed);
    if (change.triggered) {
      sizeState = change.state;
      const box = HITBOX[target];
      playerBody = { ...playerBody, x: change.x, y: change.y, width: box.width, height: box.height };
      playSfx(target === "large" ? "grow" : "shrink");
    }
  }
  sizeState = advanceSizeTransition(sizeState, fixedDeltaMs);

  // Issue #6: walking into an 'R' machine arms it; re-entering it (having
  // left and come back) rewinds instead. Edge-triggered on the feet tile
  // (entered this frame, wasn't on it last frame) so standing on the tile
  // doesn't re-fire every frame — same shape as the jump/land edge
  // detection above. `arm()` is the safe-growth-style no-op: a cell the
  // current hitbox doesn't fit in leaves any existing anchor untouched.
  const onRewindTile = feetChar === "R";
  if (onRewindTile && !wasOnRewindTile) {
    const alreadyArmedHere =
      anchor !== null &&
      anchor.x === playerBody.x &&
      anchor.y === playerBody.y &&
      anchor.size === sizeState.size;
    if (alreadyArmedHere) {
      triggerRewind();
    } else {
      const armed = arm(playerBody.x, playerBody.y, sizeState.size, physicsLevel, demoDestroyed);
      if (armed) {
        anchor = armed;
        inputController.setMachineArmed(true);
      }
    }
  }
  wasOnRewindTile = onRewindTile;

  // Squash/stretch is drawn-only (plan.md §8): the hitbox above already
  // swapped instantly, so collision never reasons about an in-between
  // size. This just scales what's blitted, keeping feet visually planted.
  const scale = transitionScale(sizeState);
  const drawWidth = playerBody.width * scale.scaleX;
  const drawHeight = playerBody.height * scale.scaleY;
  player.x = playerBody.x + (playerBody.width - drawWidth) / 2;
  player.y = playerBody.y + playerBody.height - drawHeight;
  player.width = drawWidth;
  player.height = drawHeight;
  player.color = PLAYER_COLOR[sizeState.size];
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
