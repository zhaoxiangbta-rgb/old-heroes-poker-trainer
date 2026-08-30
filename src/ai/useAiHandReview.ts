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
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error("AI 复盘超时")), milliseconds);
    void promise.then(
      (value) => { globalThis.clearTimeout(timer); resolve(value); },
      (error: unknown) => { globalThis.clearTimeout(timer); reject(error); },
    );
  });
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
    if (!localReview) {
      setState({ status: "not-started" });
      return;
    }
    if (!settings.enabled) {
      setState({ status: "not-started", error: "AI 解读尚未启用；请在设置中开启后重试。" });
      return;
    }
    if (repository.mode !== "native") {
      setState({ status: "not-started", error: "开发预览页不调用本地模型；请打开 macOS 应用查看 AI 复盘。" });
      return;
    }
    const facts = buildAiReviewFacts(game, localReview);
    setState({ status: "calculating" });
    const generate = async () => {
      const first = await deadline(repository.generateAiExplanation({ kind: "review", facts: facts as unknown as Record<string, unknown> }), 45_500);
      try {
        return { result: first, parsed: parseAiReviewOutput(first.content, facts) };
      } catch (error: unknown) {
        const validationFeedback = error instanceof Error ? error.message : "模型输出未通过本地审核";
        const correctedFacts = { ...facts, validationFeedback: `上一次输出被拒绝：${validationFeedback}。请严格重新生成，不要引入任何新事实。` };
        const second = await deadline(repository.generateAiExplanation({ kind: "review", facts: correctedFacts as unknown as Record<string, unknown> }), 45_500);
        return { result: { ...second, elapsedMs: first.elapsedMs + second.elapsedMs }, parsed: parseAiReviewOutput(second.content, facts) };
      }
    };
    void generate()
      .then(({ result, parsed }) => {
        if (identity.current !== current) return;
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
