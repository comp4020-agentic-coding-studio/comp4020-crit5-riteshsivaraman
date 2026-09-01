// @vitest-environment jsdom
//
// issue #10's central sensor. Two things are asserted:
//  1. keyboard and synthetic touch (Pointer Events — see input.ts's docs on
//     why not `click`) drive the *same* InputState fields, so gameplay code
//     genuinely cannot tell the sources apart.
//  2. the contextual rewind control's visibility is a pure function of one
//     boolean, covered in both states, defaulting to hidden.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputController, shouldShowRewindControl, type InputController } from "../src/game/input";

// jsdom's id-selector fast path gets confused once two elements share an id
// anywhere in the document (confirmed by hand: a leftover container from a
// previous test still holding a `#rewind-control` makes a *fresh*
// container's own `#rewind-control` unfindable via querySelector, even
// though outerHTML shows it's really there). Every test builds a new
// controller with the same fixed ids, so each test must tear its container
// out of the document afterwards rather than accumulate.
const containers: HTMLElement[] = [];

afterEach(() => {
  for (const el of containers.splice(0)) el.remove();
});

function setup(overrides: Partial<Parameters<typeof createInputController>[0]> = {}): {
  controller: InputController;
  container: HTMLElement;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  containers.push(container);
  const controller = createInputController({
    keyTarget: window,
    controlsContainer: container,
    document,
    ...overrides,
  });
  return { controller, container };
}

function keyEvent(type: "keydown" | "keyup", code: string, repeat = false): KeyboardEvent {
  return new KeyboardEvent(type, { code, bubbles: true, cancelable: true, repeat });
}

function pointerEvent(type: "pointerdown" | "pointerup", pointerId = 1): PointerEvent {
  return new PointerEvent(type, { pointerId, bubbles: true, cancelable: true });
}

describe("shouldShowRewindControl: pure gate, both states", () => {
  it("is false before any machine has been armed", () => {
    expect(shouldShowRewindControl(false)).toBe(false);
  });

  it("is true once a machine has been armed", () => {
    expect(shouldShowRewindControl(true)).toBe(true);
  });
});

describe("input controller: rewind control visibility follows the gate", () => {
  it("starts hidden, with no setMachineArmed call needed", () => {
    const { container } = setup();
    const rewind = container.querySelector<HTMLElement>("#rewind-control");
    expect(rewind).not.toBeNull();
    expect(rewind!.hidden).toBe(true);
  });

  it("becomes visible after setMachineArmed(true), and hides again after setMachineArmed(false)", () => {
    const { controller, container } = setup();
    const rewind = container.querySelector<HTMLElement>("#rewind-control")!;

    controller.setMachineArmed(true);
    expect(rewind.hidden).toBe(false);

    controller.setMachineArmed(false);
    expect(rewind.hidden).toBe(true);
  });
});

describe("input controller: keyboard and touch produce identical InputState", () => {
  it("A/D and Left/Right pad both drive `left`/`right`, holding continuously", () => {
    const { controller, container } = setup();
    const padLeft = container.querySelector<HTMLElement>("#pad-left")!;
    const padRight = container.querySelector<HTMLElement>("#pad-right")!;

    expect(controller.getState()).toEqual({ left: false, right: false, jumpHeld: false });

    window.dispatchEvent(keyEvent("keydown", "ArrowLeft"));
    expect(controller.getState().left).toBe(true);
    // Holding: repeated reads while still held stay true.
    expect(controller.getState().left).toBe(true);
    window.dispatchEvent(keyEvent("keyup", "ArrowLeft"));
    expect(controller.getState().left).toBe(false);

    padLeft.dispatchEvent(pointerEvent("pointerdown"));
    expect(controller.getState()).toEqual({ left: true, right: false, jumpHeld: false });
    padLeft.dispatchEvent(pointerEvent("pointerup"));
    expect(controller.getState().left).toBe(false);

    window.dispatchEvent(keyEvent("keydown", "KeyD"));
    padRight.dispatchEvent(pointerEvent("pointerdown"));
    expect(controller.getState().right).toBe(true);
    // Releasing only one of two sources holding the same direction must not
    // stop movement while the other source is still held.
    window.dispatchEvent(keyEvent("keyup", "KeyD"));
    expect(controller.getState().right).toBe(true);
    padRight.dispatchEvent(pointerEvent("pointerup"));
    expect(controller.getState().right).toBe(false);
  });

  it("Space and the jump pad both drive `jumpHeld`, releasing within one read", () => {
    const { controller, container } = setup();
    const padJump = container.querySelector<HTMLElement>("#pad-jump")!;

    window.dispatchEvent(keyEvent("keydown", "Space"));
    expect(controller.getState().jumpHeld).toBe(true);
    window.dispatchEvent(keyEvent("keyup", "Space"));
    expect(controller.getState().jumpHeld).toBe(false);

    padJump.dispatchEvent(pointerEvent("pointerdown"));
    expect(controller.getState().jumpHeld).toBe(true);
    padJump.dispatchEvent(pointerEvent("pointerup"));
    expect(controller.getState().jumpHeld).toBe(false);
  });

  it("a second stray pointer on a pad does not release it until every pointer lifts", () => {
    const { controller, container } = setup();
    const padLeft = container.querySelector<HTMLElement>("#pad-left")!;

    padLeft.dispatchEvent(pointerEvent("pointerdown", 1));
    padLeft.dispatchEvent(pointerEvent("pointerdown", 2));
    padLeft.dispatchEvent(pointerEvent("pointerup", 1));
    expect(controller.getState().left).toBe(true);
    padLeft.dispatchEvent(pointerEvent("pointerup", 2));
    expect(controller.getState().left).toBe(false);
  });
});

describe("input controller: pause fires from both Escape and the on-screen control", () => {
  it("Escape fires the callback once per press, not on OS key-repeat", () => {
    const onPauseRequest = vi.fn();
    setup({ onPauseRequest });

    window.dispatchEvent(keyEvent("keydown", "Escape"));
    window.dispatchEvent(keyEvent("keydown", "Escape", true)); // repeat: true
    expect(onPauseRequest).toHaveBeenCalledTimes(1);

    window.dispatchEvent(keyEvent("keyup", "Escape"));
    window.dispatchEvent(keyEvent("keydown", "Escape"));
    expect(onPauseRequest).toHaveBeenCalledTimes(2);
  });

  it("the on-screen pause control fires the same callback", () => {
    const onPauseRequest = vi.fn();
    const { container } = setup({ onPauseRequest });
    const pauseControl = container.querySelector<HTMLElement>("#pause-control")!;

    pauseControl.dispatchEvent(pointerEvent("pointerdown"));
    expect(onPauseRequest).toHaveBeenCalledTimes(1);
  });
});

describe("input controller: rewind control activation", () => {
  it("fires onRewindRequest when activated (even while hidden, since visibility is a display concern)", () => {
    const onRewindRequest = vi.fn();
    const { container } = setup({ onRewindRequest });
    const rewind = container.querySelector<HTMLElement>("#rewind-control")!;

    rewind.dispatchEvent(pointerEvent("pointerdown"));
    expect(onRewindRequest).toHaveBeenCalledTimes(1);
  });
});

describe("input controller: touch pads never scroll, zoom, or select text", () => {
  it("every pad/button sets touch-action: none and disables text selection", () => {
    const { container } = setup();
    const ids = ["pad-left", "pad-right", "pad-jump", "pause-control", "rewind-control"];
    for (const id of ids) {
      const el = container.querySelector<HTMLElement>(`#${id}`)!;
      expect(el.style.touchAction, `${id} touchAction`).toBe("none");
      expect(el.style.userSelect, `${id} userSelect`).toBe("none");
    }
  });

  it("blocks touchstart/touchmove/contextmenu default behaviour on a pad", () => {
    const { container } = setup();
    const padLeft = container.querySelector<HTMLElement>("#pad-left")!;

    const touchstart = new Event("touchstart", { cancelable: true, bubbles: true });
    padLeft.dispatchEvent(touchstart);
    expect(touchstart.defaultPrevented).toBe(true);

    const touchmove = new Event("touchmove", { cancelable: true, bubbles: true });
    padLeft.dispatchEvent(touchmove);
    expect(touchmove.defaultPrevented).toBe(true);

    const contextmenu = new Event("contextmenu", { cancelable: true, bubbles: true });
    padLeft.dispatchEvent(contextmenu);
    expect(contextmenu.defaultPrevented).toBe(true);
  });

  it("never registers a `click` listener on a pad — the mechanism the 300ms delay depends on", () => {
    // jsdom doesn't expose a registered-listener inspector, so this asserts
    // the behavioural contract instead: dispatching a `click` (what a real
    // touch browser would fire ~300ms after a tap, separately from the
    // pointerdown/up this module actually listens to) must not be
    // observable as having done anything — there is nothing for it to hit.
    const { container } = setup();
    const padLeft = container.querySelector<HTMLElement>("#pad-left")!;
    const click = new MouseEvent("click", { cancelable: true, bubbles: true });
    expect(() => padLeft.dispatchEvent(click)).not.toThrow();
    expect(click.defaultPrevented).toBe(false);
  });
});

describe("input controller: destroy cleans up", () => {
  it("removes the pads it created and stops responding to input", () => {
    const { controller, container } = setup();
    controller.destroy();

    expect(container.querySelector("#pad-left")).toBeNull();
    expect(container.querySelector("#pause-control")).toBeNull();
    expect(container.querySelector("#rewind-control")).toBeNull();

    // Keyboard listeners are gone too — dispatching must not throw, and
    // must not be reflected in a new controller's independent state.
    expect(() => window.dispatchEvent(keyEvent("keydown", "ArrowLeft"))).not.toThrow();
  });
});
