import { describe, expect, it, vi } from "vitest";
import { createSoundPlayer, soundCueForPlayback } from "./sound";

describe("offline table sound", () => {
  it.each([
    ["reveal", undefined, "deal"],
    ["deal", undefined, "deal"],
    ["collect", undefined, undefined],
    ["chips", "call", "chip-light"],
    ["chips", "all-in", "chip-heavy"],
  ] as const)("maps %s playback to %s", (effect, actionKind, expected) => {
    expect(soundCueForPlayback(effect, actionKind)).toBe(expected);
  });

  it("plays a synthesized cue without fetching media", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const context = {
      currentTime: 1,
      state: "running",
      destination: {},
      createOscillator: () => ({
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start,
        stop,
      }),
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      close: vi.fn(),
    };
    const player = createSoundPlayer({ contextFactory: () => context });
    player.play("chip-medium");
    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("silently degrades when audio is unavailable or disabled", () => {
    const unavailable = createSoundPlayer({
      contextFactory: () => {
        throw new Error("no audio device");
      },
    });
    expect(() => unavailable.play("all-in")).not.toThrow();
    unavailable.setEnabled(false);
    expect(() => unavailable.play("confirm")).not.toThrow();
    expect(() => unavailable.dispose()).not.toThrow();
  });
});
