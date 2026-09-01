// Browser-facing input: keyboard + on-screen touch pads -> one unified
// InputState. Allowed to touch browser APIs — same allowlist entry as
// render.ts (spec/pure-modules.test.ts, plan.md §5's dependency rule).
//
// The whole point of this module: physics.ts's stepBody (and any future
// gameplay code) only ever reads `{left, right, jumpHeld}`. It has no way
// to tell whether a bit is true because a key is held or a finger is on a
// pad — both sources OR into the same three booleans below.
//
// Pause and rewind are not part of InputState because neither is a
// continuous, per-frame signal: pause is a one-shot toggle, and rewind
// (issue #6, doesn't exist yet) will be too. Both are delivered as
// callbacks fired at the moment of the input event, not fields to poll.
import type { InputState as PhysicsInputState } from "./physics";

/** Re-exported rather than redefined: physics.ts owns what stepBody needs,
 * this module only ever produces that shape. */
export type InputState = PhysicsInputState;

const MOVE_LEFT_CODES = new Set(["ArrowLeft", "KeyA"]);
const MOVE_RIGHT_CODES = new Set(["ArrowRight", "KeyD"]);
const JUMP_CODES = new Set(["Space"]);
const PAUSE_CODES = new Set(["Escape"]);
// Finding #1 (Reviewer, crit 5): in landscape, layout.ts returns
// `controlsRect: null` and main.ts sets `controls.hidden = true`, which
// styles.css turns into a real `display: none` on `#game-controls` — the
// on-screen `↺` (rewindControl below) used to live inside that container,
// so it was completely unreachable at that viewport (issues #10/#12 fix:
// see `rewindContainer` below — it now lives in a container main.ts renders
// outside `#game-controls`, positioned via layout.ts's rewindControlRect,
// so it survives `#game-controls` being hidden in landscape). KeyR is the
// second, independent trigger path plan.md §6/§10 assumes exists; it is
// edge-triggered on non-repeat keydown, exactly like Escape/PAUSE_CODES
// above, not a new mechanism.
const REWIND_CODES = new Set(["KeyR"]);

/**
 * Pure gate for the contextual rewind control (issue #10 / plan.md: it
 * "appears only after the first machine has been armed", never as the sole
 * explanation of the mechanic). Kept as a standalone pure function —
 * independent of any DOM or controller instance — so spec/input.test.ts can
 * cover both states with a plain call, no browser API involved, and so a
 * future issue #6 has exactly one thing to flip (the boolean it passes in),
 * not new visibility logic to write.
 */
export function shouldShowRewindControl(hasArmedAMachine: boolean): boolean {
  return hasArmedAMachine;
}

export type InputController = {
  /** Current unified movement/jump state. Call once per fixed step. */
  getState(): InputState;
  /** Update the rewind-control gate (see shouldShowRewindControl). Starts
   * false — the control is hidden from construction until a caller (issue
   * #6, eventually) says otherwise. */
  setMachineArmed(armed: boolean): void;
  /** Remove every listener and DOM node this controller created. */
  destroy(): void;
};

export type InputControllerOptions = {
  /** Keyboard listener target — `window` in the real app, any EventTarget
   * that dispatches KeyboardEvents in tests. */
  keyTarget: EventTarget;
  /** Container the movement/jump/pause pads are built into — normally
   * `#game-controls`. Visible or not is main.ts's/layout's call (portrait
   * vs landscape); this module only ever adds children to it. */
  controlsContainer: HTMLElement;
  /** Container the contextual rewind control (`#rewind-control`) is built
   * into. Deliberately a *separate* element from `controlsContainer`: that
   * container is `#game-controls`, which main.ts/layout.ts make
   * `display: none` in landscape (Finding #1 above) — the rewind control
   * must stay reachable in both orientations once armed, so it needs a
   * container that is never hidden for that reason. Required (not
   * defaulted to controlsContainer) precisely so nothing can silently
   * regress into the old broken-in-landscape wiring by omitting it. */
  rewindContainer: HTMLElement;
  /** Used to create the pad/button elements. */
  document: Document;
  /** Fired once per Escape keydown or on-screen pause-control activation
   * (OS key-repeat while Escape is held does not re-fire). Defaults to a
   * no-op so tests/callers that don't care about pause don't have to pass
   * one. */
  onPauseRequest?: () => void;
  /** Fired once per activation of the (usually hidden) rewind control.
   * Issue #6 doesn't exist yet, so there is nothing meaningful for this to
   * do today beyond exist — deliberately not inventing rewind behaviour
   * here (see notes/agents/log.md [#10]). */
  onRewindRequest?: () => void;
};

// Properties applied inline (not just via a CSS class) so the "no scroll,
// no zoom, no text selection" contract is verifiable in a test that never
// loads styles.css — see spec/input.test.ts.
function markAsTouchPad(el: HTMLElement): void {
  el.style.touchAction = "none";
  el.style.userSelect = "none";
  (el.style as unknown as { webkitUserSelect: string }).webkitUserSelect = "none";
  (el.style as unknown as { webkitTouchCallout: string }).webkitTouchCallout = "none";
}

function makeControl(doc: Document, id: string, label: string, glyph: string): HTMLElement {
  const el = doc.createElement("div");
  el.id = id;
  el.className = "input-pad";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", label);
  el.textContent = glyph;
  markAsTouchPad(el);
  return el;
}

/** Wire one pad element's pointer/touch handling. Pointer Events (not
 * `click`) are the whole trick behind "no 300ms delayed click": that delay
 * only exists for the synthetic `click` a touch browser schedules after a
 * tap to see if a second tap follows (double-tap-to-zoom detection) — a
 * handler that never listens for `click` at all is never subject to it.
 * `touch-action: none` (set by markAsTouchPad above) is what stops the
 * browser scrolling/zooming the page on this element in the first place;
 * the touchstart/touchmove/contextmenu blocks below are pure belt-and-
 * braces for engines that still schedule those gestures underneath a
 * Pointer Event stream. Multiple simultaneous pointers (e.g. a stray second
 * finger) are tracked so the pad only releases once every pointer touching
 * it has lifted. */
function bindPad(el: HTMLElement, onDown: () => void, onUp: () => void): () => void {
  const activePointers = new Set<number>();

  function down(ev: Event): void {
    ev.preventDefault();
    activePointers.add((ev as PointerEvent).pointerId);
    el.classList.add("input-pad--active");
    onDown();
  }

  function up(ev: Event): void {
    ev.preventDefault();
    activePointers.delete((ev as PointerEvent).pointerId);
    if (activePointers.size === 0) {
      el.classList.remove("input-pad--active");
      onUp();
    }
  }

  const blockDefault = (ev: Event): void => ev.preventDefault();

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
  el.addEventListener("touchstart", blockDefault, { passive: false });
  el.addEventListener("touchmove", blockDefault, { passive: false });
  el.addEventListener("contextmenu", blockDefault);

  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.removeEventListener("pointerleave", up);
    el.removeEventListener("touchstart", blockDefault);
    el.removeEventListener("touchmove", blockDefault);
    el.removeEventListener("contextmenu", blockDefault);
  };
}

/** A one-shot control (pause, rewind): fires its callback on activation,
 * never tracks a held boolean. Shares bindPad's pointer/touch plumbing so
 * it gets the same no-scroll/no-zoom/no-delayed-click behaviour. */
function bindButton(el: HTMLElement, onActivate: () => void): () => void {
  return bindPad(el, onActivate, () => {});
}

export function createInputController(options: InputControllerOptions): InputController {
  const { keyTarget, controlsContainer, rewindContainer, document: doc } = options;
  const onPauseRequest = options.onPauseRequest ?? ((): void => {});
  const onRewindRequest = options.onRewindRequest ?? ((): void => {});

  // Two independent sources OR'd together per direction/button, so
  // releasing one source (say, lifting a key) while the other (a pad) is
  // still held does not incorrectly stop movement.
  let kbLeft = false;
  let kbRight = false;
  let kbJump = false;
  let padLeftHeld = false;
  let padRightHeld = false;
  let padJumpHeld = false;

  function keydown(ev: Event): void {
    const e = ev as KeyboardEvent;
    if (MOVE_LEFT_CODES.has(e.code)) {
      kbLeft = true;
    } else if (MOVE_RIGHT_CODES.has(e.code)) {
      kbRight = true;
    } else if (JUMP_CODES.has(e.code)) {
      kbJump = true;
    } else if (PAUSE_CODES.has(e.code)) {
      if (!e.repeat) onPauseRequest();
    } else if (REWIND_CODES.has(e.code)) {
      if (!e.repeat) onRewindRequest();
    } else {
      return;
    }
    e.preventDefault();
  }

  function keyup(ev: Event): void {
    const e = ev as KeyboardEvent;
    if (MOVE_LEFT_CODES.has(e.code)) {
      kbLeft = false;
    } else if (MOVE_RIGHT_CODES.has(e.code)) {
      kbRight = false;
    } else if (JUMP_CODES.has(e.code)) {
      kbJump = false;
    } else {
      return;
    }
    e.preventDefault();
  }

  keyTarget.addEventListener("keydown", keydown);
  keyTarget.addEventListener("keyup", keyup);

  // --- On-screen controls -------------------------------------------------
  const padLeft = makeControl(doc, "pad-left", "Move left", "◀");
  const padRight = makeControl(doc, "pad-right", "Move right", "▶");
  const padJump = makeControl(doc, "pad-jump", "Jump", "▲");
  const pauseControl = makeControl(doc, "pause-control", "Pause", "❚❚");
  const rewindControl = makeControl(doc, "rewind-control", "Rewind", "↺");

  const moveGroup = doc.createElement("div");
  moveGroup.className = "input-pad-group";
  moveGroup.append(padLeft, padRight);

  // Hidden from construction — see shouldShowRewindControl's docs. Only
  // setMachineArmed(true) ever reveals it.
  rewindControl.hidden = true;

  // Movement/jump/pause stay in controlsContainer (#game-controls,
  // portrait-only touch pads); rewindControl goes into its own container so
  // it survives #game-controls being display:none in landscape — see
  // rewindContainer's docs above and Finding #1.
  controlsContainer.append(moveGroup, pauseControl, padJump);
  rewindContainer.append(rewindControl);

  const unbindLeft = bindPad(
    padLeft,
    () => (padLeftHeld = true),
    () => (padLeftHeld = false),
  );
  const unbindRight = bindPad(
    padRight,
    () => (padRightHeld = true),
    () => (padRightHeld = false),
  );
  const unbindJump = bindPad(
    padJump,
    () => (padJumpHeld = true),
    () => (padJumpHeld = false),
  );
  const unbindPause = bindButton(pauseControl, onPauseRequest);
  const unbindRewind = bindButton(rewindControl, onRewindRequest);

  return {
    getState(): InputState {
      return {
        left: kbLeft || padLeftHeld,
        right: kbRight || padRightHeld,
        jumpHeld: kbJump || padJumpHeld,
      };
    },
    setMachineArmed(armed: boolean): void {
      rewindControl.hidden = !shouldShowRewindControl(armed);
    },
    destroy(): void {
      keyTarget.removeEventListener("keydown", keydown);
      keyTarget.removeEventListener("keyup", keyup);
      unbindLeft();
      unbindRight();
      unbindJump();
      unbindPause();
      unbindRewind();
      moveGroup.remove();
      pauseControl.remove();
      padJump.remove();
      rewindControl.remove();
    },
  };
}
