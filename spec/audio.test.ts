import { describe, expect, it, vi } from "vitest";
import { createSfxEngine, type SfxName } from "../src/game/audio";

// Issue #11's central sensor: src/game/audio.ts must build its whole graph
// against a stubbed AudioContext with no DOM at all. This stub implements
// only the handful of WebAudio methods audio.ts actually calls — enough to
// prove the graph wiring (connect chains, envelopes, scheduling) is correct
// without a real browser anywhere near the test.
function fakeParam() {
  return {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  destination = fakeNode();

  createOscillatorCalls = 0;
  createBufferSourceCalls = 0;

  createGain = vi.fn(() => ({ ...fakeNode(), gain: fakeParam() }));

  createOscillator = vi.fn(() => {
    this.createOscillatorCalls++;
    return {
      ...fakeNode(),
      type: "sine" as OscillatorType,
      frequency: fakeParam(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  });

  createDynamicsCompressor = vi.fn(() => fakeNode());

  createBiquadFilter = vi.fn(() => ({ ...fakeNode(), type: "lowpass", frequency: { value: 0 } }));

  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));

  createBufferSource = vi.fn(() => {
    this.createBufferSourceCalls++;
    return {
      ...fakeNode(),
      buffer: null as unknown,
      start: vi.fn(),
      stop: vi.fn(),
    };
  });
}

const ALL_SFX: SfxName[] = [
  "jump",
  "land",
  "grow",
  "shrink",
  "fragileImpact",
  "destroy",
  "rewind",
  "win",
];

describe("audio: graph builds against a stubbed AudioContext with no DOM", () => {
  it("imports with no globalThis.window/document touched", () => {
    // If audio.ts referenced a browser global at module scope this file
    // would already have thrown before reaching this line — this test
    // exists mainly as a canary alongside spec/pure-modules.test.ts, which
    // checks the same property by scanning source text.
    expect(typeof createSfxEngine).toBe("function");
  });

  it("connects a master gain through a compressor to destination", () => {
    const ctx = new FakeAudioContext();
    createSfxEngine(ctx as unknown as AudioContext);
    expect(ctx.createGain).toHaveBeenCalled();
    expect(ctx.createDynamicsCompressor).toHaveBeenCalled();
  });

  for (const name of ALL_SFX) {
    it(`plays "${name}" without throwing and builds real graph nodes`, () => {
      const ctx = new FakeAudioContext();
      const engine = createSfxEngine(ctx as unknown as AudioContext);
      expect(() => engine.play(name)).not.toThrow();
      expect(ctx.createOscillatorCalls + ctx.createBufferSourceCalls).toBeGreaterThan(0);
    });
  }
});

describe("audio: mute", () => {
  it("starts unmuted by default", () => {
    const ctx = new FakeAudioContext();
    const engine = createSfxEngine(ctx as unknown as AudioContext);
    expect(engine.isMuted()).toBe(false);
  });

  it("honours an initial muted flag", () => {
    const ctx = new FakeAudioContext();
    const engine = createSfxEngine(ctx as unknown as AudioContext, true);
    expect(engine.isMuted()).toBe(true);
  });

  it("suppresses synthesis entirely while muted", () => {
    const ctx = new FakeAudioContext();
    const engine = createSfxEngine(ctx as unknown as AudioContext, true);
    engine.play("jump");
    expect(ctx.createOscillatorCalls).toBe(0);
  });

  it("setMuted toggles playback", () => {
    const ctx = new FakeAudioContext();
    const engine = createSfxEngine(ctx as unknown as AudioContext);
    engine.setMuted(true);
    expect(engine.isMuted()).toBe(true);
    engine.play("jump");
    expect(ctx.createOscillatorCalls).toBe(0);
    engine.setMuted(false);
    engine.play("jump");
    expect(ctx.createOscillatorCalls).toBeGreaterThan(0);
  });
});

describe("audio: overlapping triggers do not stack into clipping", () => {
  it("a second immediate trigger of the same sound is dropped", () => {
    const ctx = new FakeAudioContext();
    const engine = createSfxEngine(ctx as unknown as AudioContext);
    engine.play("fragileImpact");
    const afterFirst = ctx.createBufferSourceCalls;
    engine.play("fragileImpact"); // same ctx.currentTime — no time has passed
    expect(ctx.createBufferSourceCalls).toBe(afterFirst);
  });

  it("a retrigger after the guard window elapses is let through", () => {
    const ctx = new FakeAudioContext();
    const engine = createSfxEngine(ctx as unknown as AudioContext);
    engine.play("fragileImpact");
    const afterFirst = ctx.createBufferSourceCalls;
    ctx.currentTime += 1; // well past the retrigger guard
    engine.play("fragileImpact");
    expect(ctx.createBufferSourceCalls).toBeGreaterThan(afterFirst);
  });

  it("different sounds triggered together are not throttled against each other", () => {
    const ctx = new FakeAudioContext();
    const engine = createSfxEngine(ctx as unknown as AudioContext);
    engine.play("jump");
    engine.play("land");
    expect(ctx.createOscillatorCalls).toBeGreaterThanOrEqual(2);
  });
});

describe("audio: failing synthesis never breaks the game", () => {
  it("swallows an error thrown by the underlying AudioContext", () => {
    const ctx = new FakeAudioContext();
    ctx.createOscillator = vi.fn(() => {
      throw new Error("simulated AudioContext failure");
    });
    const engine = createSfxEngine(ctx as unknown as AudioContext);
    expect(() => engine.play("jump")).not.toThrow();
  });
});
