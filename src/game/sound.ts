import type { ActionKind } from "./game";
import type { VisualEffectKind } from "./playback";

export type SoundCue =
  | "confirm"
  | "check"
  | "fold"
  | "chip-light"
  | "chip-medium"
  | "chip-heavy"
  | "deal"
  | "all-in";

export function soundCueForPlayback(
  effect: VisualEffectKind,
  actionKind?: ActionKind,
): SoundCue | undefined {
  if (
    effect === "receipt" ||
    effect === "thinking" ||
    effect === "action-label" ||
    effect === "collect"
  )
    return;
  if (effect === "all-in") return "all-in";
  if (effect === "deal" || effect === "reveal") return "deal";
  if (effect === "fold") return "fold";
  if (actionKind === "check") return "check";
  if (actionKind === "call") return "chip-light";
  if (actionKind === "all-in") return "chip-heavy";
  return "chip-medium";
}

type ParamLike = {
  setValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
};
type NodeLike = { connect(destination: unknown): void };
type OscillatorLike = NodeLike & {
  type: OscillatorType | string;
  frequency: ParamLike;
  start(time?: number): void;
  stop(time?: number): void;
};
type GainLike = NodeLike & { gain: ParamLike };
type SoundContext = {
  currentTime: number;
  state: string;
  destination: unknown;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
  resume?(): Promise<void>;
  close?(): Promise<void> | void;
};

type SoundPlayerOptions = {
  enabled?: boolean;
  contextFactory?: () => SoundContext;
};

const CUE: Record<SoundCue, [number, number, number, OscillatorType]> = {
  confirm: [620, 760, 0.055, "sine"],
  check: [210, 170, 0.07, "triangle"],
  fold: [360, 180, 0.09, "sine"],
  "chip-light": [760, 520, 0.06, "triangle"],
  "chip-medium": [640, 360, 0.085, "triangle"],
  "chip-heavy": [480, 190, 0.12, "square"],
  deal: [900, 650, 0.04, "triangle"],
  "all-in": [180, 70, 0.22, "sawtooth"],
};

function browserContext(): SoundContext {
  const Constructor = window.AudioContext;
  if (!Constructor) throw new Error("Web Audio unavailable");
  return new Constructor() as unknown as SoundContext;
}

export function createSoundPlayer(options: SoundPlayerOptions = {}) {
  let enabled = options.enabled ?? true;
  let context: SoundContext | undefined;
  const factory = options.contextFactory ?? browserContext;
  return {
    play(cue: SoundCue) {
      if (!enabled) return;
      try {
        context ??= factory();
        if (context.state === "suspended") void context.resume?.();
        const [from, to, length, wave] = CUE[cue];
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(from, now);
        oscillator.frequency.exponentialRampToValueAtTime(to, now + length);
        gain.gain.setValueAtTime(cue === "all-in" ? 0.09 : 0.045, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + length);
      } catch {
        // Audio is optional and must never block the rules or presentation queue.
      }
    },
    setEnabled(value: boolean) {
      enabled = value;
    },
    dispose() {
      try {
        void context?.close?.();
      } catch {
        // Silent fallback is intentional for missing or already-closed devices.
      }
      context = undefined;
    },
  };
}
