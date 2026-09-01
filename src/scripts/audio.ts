// Browser wiring for src/game/audio.ts's pure SFX graph builder: AudioContext
// construction, the first-user-gesture unlock, and mute persistence. This is
// the DOM-touching half of issue #11, kept out of src/game deliberately —
// see notes/agents/log.md [#11] for why, and spec/pure-modules.test.ts /
// plan.md §5 for the rule it's satisfying: src/game stays free of browser
// globals outside render.ts/input.ts, the same way main.ts (not loop.ts or
// layout.ts) owns requestAnimationFrame and window.
//
// Loaded as its own <script> tag in src/pages/index.astro, independent of
// main.ts, so this issue never has to touch the loop/render bootstrap that
// issues #1/#2/#3 own.
import { createSfxEngine, type SfxEngine, type SfxName } from "../game/audio";

const MUTE_KEY = "remnant.audio.muted";

function readStoredMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Storage can be unavailable (private mode, quota, disabled) — default
    // to unmuted rather than letting a storage error touch the game.
    return false;
  }
}

function writeStoredMute(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Not fatal: mute just won't persist across reloads this time.
  }
}

let engine: SfxEngine | null = null;
let unlocked = false;

function tryCreateContext(): AudioContext | null {
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor();
  } catch {
    // AudioContext missing, disabled, or blocked by policy — the game must
    // keep running silently (issue #11's hard requirement).
    return null;
  }
}

function unlock(): void {
  if (unlocked) return;
  unlocked = true;
  const ctx = tryCreateContext();
  if (!ctx) return;
  // Some browsers hand back a context that starts "suspended" even from
  // inside a gesture handler; resume defensively so the very first SFX
  // isn't silently dropped.
  void ctx.resume?.().catch(() => {});
  engine = createSfxEngine(ctx, readStoredMute());
}

// Exactly one of these fires the unlock, then all three remove themselves —
// this is the autoplay-gesture handling the brief's no-instructions rule
// rules out an on-screen prompt for. Nothing is drawn or written for it;
// the very first click/key/touch the player makes to start playing is the
// gesture that unlocks sound too.
const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;
for (const type of GESTURE_EVENTS) {
  window.addEventListener(type, unlock, { once: true, passive: true });
}

/** Never throws and never blocks on init — a missing/blocked engine is a
 * silent no-op, per issue #11's "failing audio must never break the game". */
export function playSfx(name: SfxName): void {
  engine?.play(name);
}

export function isMuted(): boolean {
  return engine?.isMuted() ?? readStoredMute();
}

export function setMuted(muted: boolean): void {
  writeStoredMute(muted);
  engine?.setMuted(muted);
}

// --- mute button wiring -----------------------------------------------
// A single icon-only toggle (src/pages/index.astro's #mute-toggle) — no
// label text explaining what it does or what the game is, so it doesn't
// trip the no-instructions rule (issue #12's sensor scans for words that
// explain the *mechanics*; a mute glyph is ordinary page chrome, same
// category as the nav's Home link).
const button = document.getElementById("mute-toggle");

function syncButton(muted: boolean): void {
  if (!button) return;
  button.textContent = muted ? "\u{1F507}" : "\u{1F50A}"; // 🔇 / 🔊
  button.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
}

syncButton(readStoredMute());
button?.addEventListener("click", () => {
  const next = !isMuted();
  setMuted(next);
  syncButton(next);
});
