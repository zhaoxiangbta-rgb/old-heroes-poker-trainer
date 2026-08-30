import { useEffect, useMemo, useRef, useState } from "react";
import type { DesktopRepository } from "../data/repository";
import type { ModelSettings } from "../data/types";
import type { GameState } from "../game/game";
import type { PreActionInsightState } from "../insights/types";
import { buildAiLiveFacts } from "./liveFacts";
import { parseAiLiveOutput } from "./parseModelOutput";
import type { AiLiveExplanationV1, AiLiveFactPackV1 } from "./types";

export type AiLiveCoachState =
  | { status: "idle" | "unavailable" | "rejected"; facts?: AiLiveFactPackV1; error?: string }
  | { status: "loading"; facts: AiLiveFactPackV1 }
  | { status: "ready"; facts: AiLiveFactPackV1; explanation: AiLiveExplanationV1; model: string; elapsedMs: number };

function deadline<T>(promise: Promise<T>, milliseconds: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => globalThis.setTimeout(() => reject(new Error("AI 讲解超时")), milliseconds)),
  ]);
}

export function useAiLiveCoach({
  repository,
  settings,
  game,
  insight,
  active,
}: {
  repository: DesktopRepository;
  settings: ModelSettings;
  game: GameState;
  insight: PreActionInsightState;
  active: boolean;
}) {
  const [state, setState] = useState<AiLiveCoachState>({ status: "idle" });
  const cache = useRef(new Map<string, Extract<AiLiveCoachState, { status: "ready" }>>());
  const request = useRef(0);
  const facts = useMemo(() => {
    if (!active || !settings.enabled || repository.mode !== "native" || !insight.key || !insight.analysis || !insight.liveCoach)
      return undefined;
    return buildAiLiveFacts(game, insight);
  }, [active, game, insight, repository.mode, settings.enabled]);
  const stateHash = facts?.stateHash;

  useEffect(() => {
    const identity = ++request.current;
    if (!facts) {
      setState(settings.enabled && repository.mode !== "native" ? { status: "unavailable" } : { status: "idle" });
      return;
    }
    const saved = cache.current.get(facts.stateHash);
    if (saved) {
      setState(saved);
      return;
    }
    setState({ status: "loading", facts });
    void deadline(repository.generateAiExplanation({ kind: "live", facts: facts as unknown as Record<string, unknown> }), 4_200)
      .then((result) => {
        if (identity !== request.current) return;
        const explanation = parseAiLiveOutput(result.content, facts);
        const ready = { status: "ready" as const, facts, explanation, model: result.model, elapsedMs: result.elapsedMs };
        cache.current.set(facts.stateHash, ready);
        setState(ready);
      })
      .catch((error: unknown) => {
        if (identity !== request.current) return;
        setState({ status: error instanceof Error && /\u8fc7\u671f|\u51b2\u7a81|\u672a\u77e5\u5e95\u724c|\u672a\u7ecf\u672c\u5730/.test(error.message) ? "rejected" : "unavailable", facts, error: error instanceof Error ? error.message : "AI 讲解不可用" });
      });
    return () => { if (identity === request.current) request.current += 1; };
  }, [facts, repository, repository.mode, settings.enabled, stateHash]);

  return state;
}
