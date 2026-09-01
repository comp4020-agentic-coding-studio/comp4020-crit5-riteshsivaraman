// Pure WebAudio SFX graph builder (issue #11). Zero binary assets — every
// sound is synthesised at trigger time from oscillators/noise. This module
// never touches window/document/localStorage/addEventListener: AudioContext
// construction, the first-gesture unlock, and mute persistence all live in
// src/scripts/audio.ts instead. That split is deliberate (see this issue's
// log entry and spec/pure-modules.test.ts, plan.md §5's dependency rule) —
// audio is inherently browser-facing (AudioContext) but the *graph* it
// builds is plain data-in/data-out over whatever AudioContext it's handed,
// real or stubbed, which is exactly what lets spec/audio.test.ts build this
// graph against a stubbed AudioContext with no DOM at all.
//
// plan.md §12 puts audio second on the cut list, down to three SFX (grow,
// break, rewind) if the budget is tight — the other five here are cheap
// (same handful of primitives reused) but the first three are the ones that
// must not be cut.

export type SfxName =
  | "jump"
  | "land"
  | "grow"
  | "shrink"
  | "fragileImpact"
  | "destroy"
  | "rewind"
  | "win";

export interface SfxEngine {
  play(name: SfxName): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

// Minimum gap between two triggers of the *same* sound before a repeat is
// let through. This is the guard against "overlapping triggers stack into
// clipping": a fragile wall taking two hits in one frame, or two callers
// reacting to the same world event, must not pile a second full-volume
// voice on top of one already ringing.
const RETRIGGER_GUARD_S = 0.06;

export function createSfxEngine(ctx: AudioContext, initiallyMuted = false): SfxEngine {
  let muted = initiallyMuted;
  const lastPlayedAt = new Map<SfxName, number>();

  // Every voice fans into one compressor before the real output. That's the
  // second, cheaper half of the anti-clipping guard: even distinct sounds
  // (e.g. destroy's crack + break) landing in the same instant get summed
  // down instead of clipping the output.
  const master = ctx.createGain();
  master.gain.value = 0.6;
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor);
  compressor.connect(ctx.destination);

  function envelope(
    gain: GainNode,
    t0: number,
    attack: number,
    hold: number,
    release: number,
    peak: number,
  ): void {
    const g = gain.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.setValueAtTime(peak, t0 + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }

  function tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    t0: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    }
    envelope(gain, t0, Math.min(0.02, duration * 0.2), duration * 0.4, duration * 0.4, peak);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function noiseBurst(duration: number, peak: number, filterFreq: number, t0: number): void {
    const sampleRate = ctx.sampleRate || 44100;
    const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    envelope(gain, t0, 0.005, duration * 0.2, duration * 0.6, peak);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  // Recipes read `ctx.currentTime` fresh at trigger time (t0 below), not at
  // module-build time, so scheduling stays correct across calls.
  const recipes: Record<SfxName, (t0: number) => void> = {
    jump: (t0) => tone(440, 660, 0.12, "square", 0.35, t0),
    land: (t0) => tone(180, 90, 0.08, "sine", 0.4, t0),
    // Low warm hum sliding up into the expansion.
    grow: (t0) => tone(90, 220, 0.5, "sawtooth", 0.4, t0),
    // Cool, airy — the coolant-shrink counterpart to grow's warmth.
    shrink: (t0) => tone(900, 1600, 0.35, "sine", 0.25, t0),
    fragileImpact: (t0) => noiseBurst(0.08, 0.3, 3000, t0),
    // Sharp crack: a filtered noise hit plus a falling low thud underneath.
    destroy: (t0) => {
      noiseBurst(0.18, 0.6, 1200, t0);
      tone(160, 40, 0.18, "sawtooth", 0.3, t0);
    },
    // The one sound doing tutorial work (plan.md §7/§9's central beat):
    // a fast downward glide reads as "played backwards" even without any
    // actual time-reversal, and nothing else in the game sounds like it.
    rewind: (t0) => tone(1600, 260, 0.55, "sawtooth", 0.45, t0),
    win: (t0) => {
      tone(523, 523, 0.16, "sine", 0.3, t0);
      tone(659, 659, 0.16, "sine", 0.3, t0 + 0.12);
      tone(784, 784, 0.32, "sine", 0.35, t0 + 0.24);
    },
  };

  return {
    play(name: SfxName): void {
      if (muted) return;
      const t0 = ctx.currentTime;
      const last = lastPlayedAt.get(name);
      if (last !== undefined && t0 - last < RETRIGGER_GUARD_S) return;
      lastPlayedAt.set(name, t0);
      try {
        recipes[name](t0);
      } catch {
        // Synthesis can fail for reasons that have nothing to do with
        // gameplay (a suspended/partial context, a browser quirk) — issue
        // #11 requires failing audio to never break the game, so this is
        // swallowed rather than thrown.
      }
    },
    setMuted(next: boolean): void {
      muted = next;
    },
    isMuted(): boolean {
      return muted;
    },
  };
}
