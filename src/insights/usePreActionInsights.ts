import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isHeroTurn, type GameState } from "../game/game";
import { buildPreActionInsightInput, preActionInsightHash } from "./snapshot";
import type {
  InsightTaskKey,
  InsightWorkerEvent,
  InsightWorkerRequest,
  PreActionInsightState,
} from "./types";

export type { InsightWorkerEvent, InsightWorkerRequest } from "./types";

export type InsightWorkerLike = {
  onmessage: ((event: MessageEvent<InsightWorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: InsightWorkerRequest): void;
  terminate(): void;
};

function defaultWorker(): InsightWorkerLike {
  if (typeof Worker === "undefined") {
    let active = true;
    const fallback: InsightWorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(message) {
        if (message.type !== "start") return;
        queueMicrotask(() => {
          if (!active) return;
          fallback.onmessage?.({
            data: {
              type: "failed",
              requestId: message.requestId,
              key: message.key,
              message: "当前环境不支持后台分析线程",
            },
          } as MessageEvent<InsightWorkerEvent>);
        });
      },
      terminate() { active = false; },
    };
    return fallback;
  }
  return new Worker(new URL("./pre-action.worker.ts", import.meta.url), { type: "module" });
}

export function usePreActionInsights(
  game: GameState,
  enabled: boolean,
  createWorker: () => InsightWorkerLike = defaultWorker,
): { state: PreActionInsightState; cancel(): void } {
  const [state, setState] = useState<PreActionInsightState>({ status: "idle" });
  const workerRef = useRef<InsightWorkerLike | undefined>(undefined);
  const activeRef = useRef<{ requestId: string; key: InsightTaskKey } | undefined>(undefined);
  const sequenceRef = useRef(0);
  const factoryRef = useRef(createWorker);
  factoryRef.current = createWorker;

  const prepared = useMemo(() => {
    if (!enabled || !isHeroTurn(game)) return undefined;
    const input = buildPreActionInsightInput(game);
    const stateHash = preActionInsightHash(input);
    const key: InsightTaskKey = {
      handNo: input.handNo,
      seed: input.seed,
      street: input.street,
      logIndex: input.logIndex,
      stateHash,
    };
    return { input, key };
  }, [enabled, game]);
  const stateHash = prepared?.key.stateHash;

  const stopWorker = useCallback(() => {
    const active = activeRef.current;
    if (active) workerRef.current?.postMessage({ type: "cancel", ...active });
    workerRef.current?.terminate();
    workerRef.current = undefined;
    activeRef.current = undefined;
  }, []);

  const cancel = useCallback(() => {
    stopWorker();
    setState({ status: "idle" });
  }, [stopWorker]);

  useEffect(() => {
    stopWorker();
    if (!prepared) {
      setState({ status: "idle" });
      return;
    }
    const worker = factoryRef.current();
    const requestId = `${prepared.key.seed}:${prepared.key.handNo}:${++sequenceRef.current}`;
    const active = { requestId, key: prepared.key };
    workerRef.current = worker;
    activeRef.current = active;
    setState({
      key: prepared.key,
      status: prepared.input.board.length >= 3 ? "calculating-exact" : "calculating-ranges",
    });
    worker.onmessage = ({ data }) => {
      const current = activeRef.current;
      if (!current || data.requestId !== current.requestId || data.key.stateHash !== current.key.stateHash) return;
      if (data.type === "exact-completed") {
        setState((previous) => ({ ...previous, exact: data.exact, status: "calculating-ranges", error: undefined }));
      } else if (data.type === "ranges-completed") {
        setState((previous) => ({
          ...previous,
          status: "ready",
          ranges: data.ranges,
          responses: data.responses,
          confidence: data.confidence,
          error: undefined,
        }));
      } else if (data.type === "analysis-completed") {
        activeRef.current = undefined;
        setState((previous) => ({
          ...previous,
          status: "ready",
          analysis: data.analysis,
          liveCoach: data.liveCoach,
          confidence: data.analysis.confidence,
          error: undefined,
        }));
      } else if (data.type === "partial") {
        activeRef.current = undefined;
        setState((previous) => ({ ...previous, status: "partial", exact: data.exact ?? previous.exact, error: data.message }));
      } else {
        activeRef.current = undefined;
        setState((previous) => ({ ...previous, status: previous.exact ? "partial" : "failed", error: data.message }));
      }
    };
    worker.onerror = () => {
      if (activeRef.current?.requestId !== requestId) return;
      activeRef.current = undefined;
      setState((previous) => ({ ...previous, status: previous.exact ? "partial" : "failed", error: "下注前分析线程异常终止" }));
    };
    worker.postMessage({
      type: "start",
      requestId,
      key: prepared.key,
      input: prepared.input,
      sampleBudget: 384,
      deadlineMs: 800,
    });
    return stopWorker;
  // The stable public hash, rather than object identity, owns this calculation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateHash, stopWorker]);

  return { state, cancel };
}
