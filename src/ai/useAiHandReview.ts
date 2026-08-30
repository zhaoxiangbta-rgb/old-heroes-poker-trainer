import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopRepository } from "../data/repository";
import type { ModelSettings } from "../data/types";
import type { GameState } from "../game/game";
import type { DeepHandReview, PersistedAiHandReview } from "../review/types";
import { parseAiReviewOutput } from "./parseModelOutput";
import { buildAiReviewFacts } from "./reviewFacts";

export type AiHandReviewRuntime = {
  status: "not-started" | "calculating" | "completed" | "failed";
  review?: PersistedAiHandReview;
  error?: string;
  retry(): void;
};

function deadline<T>(promise: Promise<T>, milliseconds: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => globalThis.setTimeout(() => reject(new Error("AI 复盘超时")), milliseconds)),
  ]);
}

export function useAiHandReview({
  repository,
  settings,
  game,
  localReview,
  onCompleted,
}: {
  repository: DesktopRepository;
  settings: ModelSettings;
  game: GameState;
  localReview?: DeepHandReview;
  onCompleted(review: PersistedAiHandReview): void;
}): AiHandReviewRuntime {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<AiHandReviewRuntime, "retry">>({ status: "not-started" });
  const identity = useRef(0);
  const completed = useRef(onCompleted);
  completed.current = onCompleted;
  const hash = localReview?.stateHash;

  useEffect(() => {
    const current = ++identity.current;
    if (game.aiReview && game.aiReview.stateHash === hash) {
      setState({ status: "completed", review: game.aiReview });
      return;
    }
    if (!settings.enabled || repository.mode !== "native" || !localReview) {
      setState({ status: "not-started" });
      return;
    }
    const facts = buildAiReviewFacts(game, localReview);
    setState({ status: "calculating" });
    void deadline(repository.generateAiExplanation({ kind: "review", facts: facts as unknown as Record<string, unknown> }), 30_500)
      .then((result) => {
        if (identity.current !== current) return;
        const parsed = parseAiReviewOutput(result.content, facts);
        const review: PersistedAiHandReview = { ...parsed, factsVersion: 1, model: result.model, elapsedMs: result.elapsedMs };
        setState({ status: "completed", review });
        completed.current(review);
      })
      .catch((error: unknown) => {
        if (identity.current !== current) return;
        setState({ status: "failed", error: error instanceof Error ? error.message : "AI 复盘不可用" });
      });
    return () => { if (identity.current === current) identity.current += 1; };
  }, [attempt, game, hash, localReview, repository, repository.mode, settings.enabled]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
