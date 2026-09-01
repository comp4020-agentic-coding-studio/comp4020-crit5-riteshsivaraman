// Bootstrap only: this is the one place allowed to touch the DOM, the
// clock, and requestAnimationFrame (plan.md §5's dependency rule). It wires
// the pure layout() and createLoop() from src/game into the actual canvas
// and window events, and owns nothing that needs to be unit-testable.
import { createLoop, type Loop } from "../game/loop";
import { layout, INTERNAL_WIDTH, INTERNAL_HEIGHT, type Layout } from "../game/layout";
import { isSolidAt, type Level } from "../game/level";
// Issue #9: the real four-room progression, replacing issue #14's
// single-screen fixture (buildDemoRows/demoLevel below no longer exist —
// see notes/agents/log.md [#9] for the room-by-room design notes).
import { rooms } from "../game/rooms/index";
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
// Issue #5: destructible walls. world.ts owns the room's permanent
// `destroyed` set (createWorld/restart) and the one rule for changing it
// (breakTile, wrapped here by resolveFragileContact for per-frame contact
// detection) — see notes/agents/log.md [#5] for why breakTile/restart are
// kept structurally distinct. main.ts owns the juice (squash, debris,
// screen-shake) and the two SFX calls (fragileImpact/destroy) that go with
// it; world.ts itself never touches audio or the DOM (plan.md §5).
import { createWorld, resolveFragileContact, type World } from "../game/world";
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
  spawnPosition,
  transitionScale,
  type PlayerSizeState,
} from "../game/player";
// Issue #7: loss/win. rules.ts's isRoomDead/hasWon are pure functions of a
// RoomState this file assembles fresh every frame from playerBody/sizeState/
// demoWorld/armed — see rules.ts's header for why that shape (not World,
// not Level) is what issue #8's solver needs too.
import { isRoomDead, hasWon, type RoomState, type Status } from "../game/rules";
// Issue #6: rewind machine. Pure module — see notes/agents/log.md [#6] for
// why it takes structural parameters instead of importing world.ts (which
// doesn't exist in this demo wiring either; #5/#6 both replace this file's
// throwaway state once a real World exists).
import { enterRewindTile, rewind, type ArmedState } from "../game/rewind";
// Issue #7's reset, extracted from this file's own restartRoom() so its
// completeness is asserted by spec/room.test.ts, not just read off the
// function body — see room.ts's header and notes/agents/log.md [#7 #8 #9].
import { freshRoomState } from "../game/room";
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

// Issue #9: room progression state. `rooms` (src/game/rooms/index.ts) is
// [room1, room2, room3, finale] — `roomIndex` is the only thing main.ts
// adds on top of it. `currentLevel` is a `let`, not a `const`, precisely
// because it changes on every room transition; every other reference to
// the room's ASCII source below (`demoLevel`) is renamed to this.
let roomIndex = 0;
let currentLevel: Level = rooms[roomIndex];
// Issue #5: real permanent-within-the-room state, replacing the throwaway
// `new Set()` this line used to be (#14's placeholder, before world.ts
// existed). `demoWorld` is reassigned (not mutated) by `step()` — every
// `resolveFragileContact`/`breakTile` call returns a fresh `World` rather
// than editing one in place, so this stays a plain variable, not a class.
let demoWorld: World = createWorld();
// Issue #4: the small hitbox is the real spawn size (8x10), replacing #14's
// throwaway 8x16 placeholder per that issue's own log entry ("do not treat
// it as load-bearing" — this is the Builder that gets to decide).
let sizeState: PlayerSizeState = initialSizeState("small");
const initialSpawn = spawnPosition(currentLevel.spawn, "small");
const player: PlayerRect = {
  x: initialSpawn.x,
  y: initialSpawn.y,
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
  isSolidTile: (tileX, tileY) => isSolidAt(currentLevel, tileX, tileY, demoWorld.destroyed),
};
let playerBody: Body = createBody(player.x, player.y, player.width, player.height);

// Issue #5's juice — squash, debris, restrained screen-shake — all owned
// here, not in world.ts (plan.md §5: world.ts stays pure/browser-free).
// None of this affects `demoWorld` or collision; it only affects what
// gets drawn for a few hundred ms after a break.
type Debris = { x: number; y: number; vx: number; vy: number; lifeMs: number };
const DEBRIS_LIFE_MS = 260;
const SHAKE_DURATION_MS = 140;
const SHAKE_MAGNITUDE_PX = 1.5; // restrained, per the brief — this is a 320x180 backbuffer
const IMPACT_SQUASH_MS = 110;
let debris: Debris[] = [];
let shakeMs = 0;
let impactMs = 0; // brief player squash on any fragile contact, break or not

function spawnDebris(tileX: number, tileY: number): void {
  const cx = tileX * TILE + TILE / 2;
  const cy = tileY * TILE + TILE / 2;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.6;
    const speed = 20 + Math.random() * 25;
    debris.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 15,
      lifeMs: DEBRIS_LIFE_MS,
    });
  }
}

let paused = false;
function togglePause(): void {
  paused = !paused;
}

// Issue #6 / Reviewer findings #2,#3: `armed` carries the anchor *and* the
// tile it was armed at (src/game/rewind.ts's ArmedState) — tile identity,
// not the body's sub-pixel position, is what decides "is this the same
// machine I already armed" in the step() loop below. `null` always means
// "no machine armed", never "armed somewhere invalid" (arm()/
// enterRewindTile() refuse rather than store an anchor that doesn't fit).
let armed: ArmedState | null = null;
let wasOnRewindTile = false;

// Issue #7: loss/win/restart. `status` starts "playing" and only ever moves
// via rules.ts's isRoomDead/hasWon (computed at the end of every step() —
// see below) or restartRoom() setting it back. step() itself goes inert
// the instant status leaves "playing" (its first line, below); the only
// way out is the end-screen glyph, wired directly to restartRoom(), never
// routed back through step()/paused.
let status: Status = "playing";

// ---------------------------------------------------------------------------
// End screen — plan.md §6/§9: "no text explains anything, no stats, no
// score." A single glyph, DOM-based (not canvas-drawn: RenderCtx has no
// fillText — see render.ts's header for why its surface stays that narrow
// — so a real glyph needs a real element, the same way input.ts's pause/
// rewind controls are DOM elements rather than canvas blits).
// ---------------------------------------------------------------------------
const endScreenStyle = document.createElement("style");
endScreenStyle.textContent = `
  @keyframes remnant-loss-pulse {
    0%, 100% { background: rgba(18, 3, 14, 0.86); }
    50% { background: rgba(74, 10, 58, 0.62); }
  }
  #end-screen { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; z-index: 20; }
  #end-screen.end-screen--lost { display: flex; animation: remnant-loss-pulse 1.8s ease-in-out infinite; }
  #end-screen.end-screen--won { display: flex; background: #000; }
  #end-screen .end-glyph { font-size: 48px; line-height: 1; color: #e8b8ff; cursor: pointer; user-select: none; }
`;
document.head.appendChild(endScreenStyle);

const endScreen = document.createElement("div");
endScreen.id = "end-screen";
shell.appendChild(endScreen);

function hideEndScreen(): void {
  endScreen.className = "";
  endScreen.replaceChildren();
}

/** One glyph, one job: activating it restarts the room. Same pointer/no-
 * delayed-click convention as input.ts's own controls (pointerdown, not
 * click) — this file doesn't import input.ts's private bindPad, but the
 * effect (immediate, no 300ms tap delay) matters just as much here. */
function makeEndGlyph(glyph: string, label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "end-glyph";
  el.textContent = glyph;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);
  el.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    restartRoom();
  });
  return el;
}

function showLossScreen(): void {
  endScreen.className = "end-screen--lost";
  endScreen.replaceChildren(makeEndGlyph("↻", "Restart"));
}

function showWinScreen(): void {
  endScreen.className = "end-screen--won";
  endScreen.replaceChildren(makeEndGlyph("►", "Play again"));
}

/**
 * Rebuilds the room from its ASCII source, per plan.md §6/issue #7's
 * Done-when: `destroyed` empty, `anchor`/`armed` null, player at spawn.
 * The actual reset — `world`, `sizeState`, `body`, `armed`,
 * `wasOnRewindTile`, all reassigned together so nothing that reads any of
 * them mid-restart can observe a torn state — now lives in
 * `freshRoomState` (src/game/room.ts), extracted so its completeness is
 * asserted by spec/room.test.ts rather than read off this function body.
 * This is also the fix for the Reviewer's confirmed-at-module-level
 * finding: `rewind()` trusts arm-time occupancy only because `destroyed`
 * is monotone within a room, and `restart()` (world.ts) is the one
 * operation that breaks that — reusing a pre-restart anchor after this
 * point would place the body inside geometry restart just
 * re-solidified. `restartRoom()` itself is now a thin caller: apply
 * `freshRoomState`'s result, then reset the genuinely-DOM/juice state
 * (`setMachineArmed`, `debris`/`shakeMs`/`impactMs`, the drawn
 * `player` rect) that src/game/ doesn't own.
 */
function restartRoom(): void {
  applyFreshRoomState(currentLevel);
  status = "playing";
  hideEndScreen();
}

// Issue #9: shared by restartRoom() (same room) and goToRoom() (next
// room) — both need every field freshRoomState returns reassigned
// together, plus the DOM/juice state src/game/ doesn't own. Factored out
// so a room *transition* can never accidentally skip a field a same-room
// restart already resets correctly.
function applyFreshRoomState(level: Level): void {
  const fresh = freshRoomState(level, "small");
  demoWorld = fresh.world;
  sizeState = fresh.sizeState;
  playerBody = fresh.body;
  armed = fresh.armed;
  wasOnRewindTile = fresh.wasOnRewindTile;
  inputController.setMachineArmed(false);
  debris = [];
  shakeMs = 0;
  impactMs = 0;
  player.x = fresh.body.x;
  player.y = fresh.body.y;
  player.width = HITBOX.small.width;
  player.height = HITBOX.small.height;
  player.color = PLAYER_COLOR.small;
}

// Issue #9: advance to the next room on reaching a non-finale exit. This
// is the fix for the Reviewer-found defect class this issue was assigned
// to avoid repeating: `armed`'s anchor is module-scope and room-agnostic,
// so carrying it (or `destroyed`, or the player's old tile coordinates)
// into a new room's geometry would be wrong the instant the new room's
// layout differs from the old one — freshRoomState (via
// applyFreshRoomState above) is what guarantees every one of those fields
// is reset together, atomically, on every transition, not just at
// restart.
function goToRoom(index: number): void {
  roomIndex = index;
  currentLevel = rooms[roomIndex];
  applyFreshRoomState(currentLevel);
}

// Runs the player back to the armed anchor, per plan.md's brief
// ("re-entering it, or the contextual rewind control, returns the player
// to that anchor"). `rewind()` itself never touches `demoWorld.destroyed`
// — see rewind.ts's file header for why that's structural, not just "it
// doesn't currently do it". A no-op (no anchor armed, or finding #4's
// belt-and-braces occupancy re-check refusing) is silently ignored, same
// convention as every other no-op in this file (requestSizeChange, etc).
function triggerRewind(): void {
  const result = rewind({
    x: playerBody.x,
    y: playerBody.y,
    size: sizeState.size,
    anchor: armed?.anchor ?? null,
    destroyed: demoWorld.destroyed,
    // Finding #4: re-verify the anchor still fits *now*, not just at
    // arm-time — see rewind.ts's RewindInput docs for why this is a
    // separate, concretely-typed pair rather than folding into `destroyed`.
    level: physicsLevel,
    occupancyDestroyed: demoWorld.destroyed,
  });
  if (!result.triggered) return;
  const box = HITBOX[result.size];
  // Finding #5: the teleport must not carry velocity or ground/coyote/
  // jump-buffer state through it. Rewinding mid-fall would otherwise drop
  // the player at the anchor already falling at speed; rewinding while
  // grounded would hand back a free coyote-time jump the player never
  // earned at the anchor.
  playerBody = {
    ...playerBody,
    x: result.x,
    y: result.y,
    width: box.width,
    height: box.height,
    vx: 0,
    vy: 0,
    grounded: false,
    coyoteMs: 0,
    jumpBufferMs: 0,
  };
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
  // Issue #7: once lost/won, the room is frozen — only the end-screen
  // glyph (restartRoom(), wired directly to its own pointerdown handler,
  // never through here) moves status again. This is what "the game never
  // needs a page reload to recover" means operationally: every reachable
  // dead state still has a live event handler waiting on the DOM, even
  // though the fixed-step loop itself has gone inert.
  if (status !== "playing") return;
  if (paused) return;

  const input = inputController.getState();
  const wasGrounded = playerBody.grounded;
  const prevVy = playerBody.vy;

  playerBody = stepBody(playerBody, input, physicsLevel, demoWorld.destroyed, fixedDeltaMs);

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
  const feetRow = currentLevel.grid[feetTileY];
  const feetChar = feetRow ? feetRow[feetTileX] : undefined;
  const target = feetChar === "G" ? "large" : feetChar === "C" ? "small" : null;
  if (target) {
    const change = requestSizeChange(sizeState, target, playerBody.x, playerBody.y, physicsLevel, demoWorld.destroyed);
    if (change.triggered) {
      sizeState = change.state;
      const box = HITBOX[target];
      playerBody = { ...playerBody, x: change.x, y: change.y, width: box.width, height: box.height };
      playSfx(target === "large" ? "grow" : "shrink");
    }
  }
  sizeState = advanceSizeTransition(sizeState, fixedDeltaMs);

  // Issue #5: does the player's current AABB touch a fragile ('=') tile?
  // world.ts's resolveFragileContact is the entire decision (large breaks
  // it, permanently; small is blocked and merely bumps) — this call site
  // only reacts to what it reports, exactly like the growth-pad call
  // above reacts to requestSizeChange's `triggered`.
  const contact = resolveFragileContact(
    demoWorld,
    playerBody.x,
    playerBody.y,
    playerBody.width,
    playerBody.height,
    sizeState.size,
    currentLevel,
  );
  demoWorld = contact.world;
  if (contact.broken.length > 0) {
    playSfx("destroy");
    shakeMs = SHAKE_DURATION_MS;
    impactMs = IMPACT_SQUASH_MS;
    for (const tile of contact.broken) spawnDebris(tile.x, tile.y);
  } else if (contact.touchedFragile.length > 0) {
    // Small body pressed against a wall it can't break yet — the bump
    // feedback, distinct from the "destroy" crack.
    playSfx("fragileImpact");
    impactMs = IMPACT_SQUASH_MS;
  }

  // Juice timers decay every frame regardless of whether anything broke
  // this frame — plain countdowns, no clock reads (dtMs comes from the
  // fixed-step loop, same as every other timer in this file).
  shakeMs = Math.max(0, shakeMs - fixedDeltaMs);
  impactMs = Math.max(0, impactMs - fixedDeltaMs);
  debris = debris
    .map((d) => ({
      ...d,
      x: d.x + d.vx * (fixedDeltaMs / 1000),
      y: d.y + d.vy * (fixedDeltaMs / 1000),
      vy: d.vy + 260 * (fixedDeltaMs / 1000), // light gravity, debris-only
      lifeMs: d.lifeMs - fixedDeltaMs,
    }))
    .filter((d) => d.lifeMs > 0);

  // Issue #6: walking into an 'R' machine arms it; re-entering the SAME
  // tile (having left and come back) rewinds instead. Edge-triggered on
  // the feet tile (entered this frame, wasn't on it last frame) so
  // standing on the tile doesn't re-fire every frame — same shape as the
  // jump/land edge detection above. Reviewer findings #2/#3: "same tile"
  // is decided by enterRewindTile() on tile coordinates, never by
  // comparing the body's sub-pixel float position — see rewind.ts's docs
  // for why that was silently re-arming (and overwriting the anchor's
  // size) on essentially every re-entry.
  const onRewindTile = feetChar === "R";
  if (onRewindTile && !wasOnRewindTile) {
    const result = enterRewindTile(
      armed,
      { x: feetTileX, y: feetTileY },
      playerBody.x,
      playerBody.y,
      sizeState.size,
      physicsLevel,
      demoWorld.destroyed,
    );
    if (result.action === "rewind") {
      triggerRewind();
    } else if (result.action === "armed") {
      armed = { anchor: result.anchor, tile: result.tile };
      inputController.setMachineArmed(true);
      // No-tutorial rule: arming previously gave zero feedback outside
      // portrait (the only signal, the `↺` control appearing, lives
      // inside a container that's `display: none` in landscape — see
      // spec/hidden-display.test.ts). Reuse the mechanic's own "rewind"
      // cue rather than inventing a new sound (src/game/audio.ts is not
      // touched by this fix).
      playSfx("rewind");
    }
    // "refused" (arm() couldn't fit the current hitbox): no-op, same as
    // every other safe-growth-style refusal in this file.
  }
  wasOnRewindTile = onRewindTile;

  // Squash/stretch is drawn-only (plan.md §8): the hitbox above already
  // swapped instantly, so collision never reasons about an in-between
  // size. This just scales what's blitted, keeping feet visually planted.
  const scale = transitionScale(sizeState);
  // A brief, separate squash on fragile contact/impact, on top of the
  // size-change scale — same sine-bump shape, shorter and subtler, so a
  // wall impact reads distinctly from a grow/shrink.
  const impactT = impactMs / IMPACT_SQUASH_MS;
  const impactBump = Math.sin(Math.max(0, impactT) * Math.PI) * 0.12;
  const scaleX = scale.scaleX * (1 + impactBump);
  const scaleY = scale.scaleY * (1 - impactBump);
  const drawWidth = playerBody.width * scaleX;
  const drawHeight = playerBody.height * scaleY;
  player.x = playerBody.x + (playerBody.width - drawWidth) / 2;
  player.y = playerBody.y + playerBody.height - drawHeight;
  player.width = drawWidth;
  player.height = drawHeight;
  player.color = PLAYER_COLOR[sizeState.size];

  // Issue #7/#9: the loss/win check, once per step, from a RoomState
  // assembled fresh from this frame's real values — never a second copy
  // of any of them. `currentLevel.fatal` is empty for rooms 1, 2, and the
  // finale (plan.md §9: only room 3 can be lost), so isRoomDead only ever
  // fires there. `hasWon` fires the moment the feet tile matches
  // `currentLevel.exit` — for rooms 1-3 that means "advance to the next
  // room" (goToRoom, never the real end screen), and only the finale's
  // `E` triggers the actual won status. `status` itself is left "playing"
  // across a room-to-room advance — the fixed-step loop keeps running
  // straight into the next room, no end screen in between (rooms 1-3
  // aren't meant to feel like separate levels with a stop-and-go seam).
  const roomState: RoomState = {
    playerTileX: feetTileX,
    playerTileY: feetTileY,
    size: sizeState.size,
    destroyed: demoWorld.destroyed,
    anchor: armed?.anchor ?? null,
  };
  const isFinale = roomIndex === rooms.length - 1;
  if (isRoomDead(roomState, currentLevel.fatal)) {
    status = "lost";
    showLossScreen();
  } else if (hasWon(roomState, currentLevel.exit)) {
    if (isFinale) {
      status = "won";
      showWinScreen();
    } else {
      goToRoom(roomIndex + 1);
    }
  }
}

function render(): void {
  // Restrained screen-shake: a random +-SHAKE_MAGNITUDE_PX jitter that
  // decays to 0 as shakeMs runs out, applied as a context translate around
  // the whole frame so nothing inside renderLevel needs to know about it.
  const shakeT = shakeMs / SHAKE_DURATION_MS;
  const shakeAmount = Math.max(0, shakeT) * SHAKE_MAGNITUDE_PX;
  const shakeX = shakeAmount > 0 ? (Math.random() * 2 - 1) * shakeAmount : 0;
  const shakeY = shakeAmount > 0 ? (Math.random() * 2 - 1) * shakeAmount : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);
  renderLevel(ctx as unknown as RenderCtx, atlas, currentLevel, demoWorld.destroyed, player);

  // Debris: small fading rects at each particle's current position. Kept
  // here rather than in render.ts's per-tile blit loop — this is transient
  // per-frame juice state, not level geometry.
  for (const d of debris) {
    const alpha = Math.max(0, Math.min(1, d.lifeMs / DEBRIS_LIFE_MS));
    ctx.fillStyle = `rgba(180, 170, 150, ${alpha})`;
    ctx.fillRect(d.x - 1, d.y - 1, 2, 2);
  }
  ctx.restore();
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
