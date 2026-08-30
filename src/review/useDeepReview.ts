import { useCallback, useEffect, useRef, useState } from "react";
import { deepReviewStateHash } from "./stateHash";
import type {
  DeepCalculationConfig,
  DeepHandReview,
  DeepReviewEvent,
  DeepReviewInput,
  DeepReviewProgress,
  DeepReviewRequest,
  DeepReviewStatus,
} from "./types";

export type ReviewWorkerLike = {
  onmessage: ((event: MessageEvent<DeepReviewEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: DeepReviewRequest): void;
  terminate(): void;
};

function defaultWorker(): ReviewWorkerLike {
  return new Worker(new URL("./deep-review.worker.ts", import.meta.url), { type: "module" });
}

const DEFAULT_CONFIG: Omit<DeepCalculationConfig, "seed" | "calculatorVersion"> = {
  sampleBudget: 20_000,
  batchSize: 512,
  memoryLimitBytes: 96 * 1024 * 1024,
};

export function useDeepReview({
  input,
  onCompleted,
  createWorker = defaultWorker,
}: {
  input: DeepReviewInput;
  onCompleted(review: DeepHandReview): void;
  createWorker?: () => ReviewWorkerLike;
}) {
  const [status, setStatus] = useState<DeepReviewStatus>("not-started");
  const [progress, setProgress] = useState<DeepReviewProgress>();
  const [error, setError] = useState("");
  const workerRef = useRef<ReviewWorkerLike | undefined>(undefined);
  const activeRef = useRef<{ requestId: string; stateHash: string } | undefined>(undefined);
  const sequenceRef = useRef(0);
  const inputRef = useRef(input);
  const completedRef = useRef(onCompleted);
  inputRef.current = input;
  completedRef.current = onCompleted;

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = createWorker();
    worker.onmessage = ({ data }) => {
      const active = activeRef.current;
      if (!active || data.requestId !== active.requestId || data.stateHash !== active.stateHash) return;
      if (data.type === "progress") {
        setProgress((current) => !current || data.progress.completed >= current.completed ? data.progress : current);
      } else if (data.type === "completed") {
        activeRef.current = undefined;
        setStatus("completed");
        setProgress(undefined);
        completedRef.current(data.review);
      } else if (data.type === "cancelled") {
        activeRef.current = undefined;
        setStatus("cancelled");
        setProgress(undefined);
      } else {
        activeRef.current = undefined;
        setStatus("failed");
        setError(data.message);
        setProgress(undefined);
      }
    };
    worker.onerror = () => {
      if (!activeRef.current) return;
      activeRef.current = undefined;
      setStatus("failed");
      setError("深度精算线程异常终止");
      setProgress(undefined);
    };
    workerRef.current = worker;
    return worker;
  }, [createWorker]);

  const cancel = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    ensureWorker().postMessage({ type: "cancel", ...active });
    activeRef.current = undefined;
    setStatus("cancelled");
    setProgress(undefined);
  }, [ensureWorker]);

  const start = useCallback(() => {
    const worker = ensureWorker();
    const previous = activeRef.current;
    if (previous) worker.postMessage({ type: "cancel", ...previous });
    const source = inputRef.current;
    const stateHash = deepReviewStateHash(source);
    const requestId = `${source.seed}:${source.handNo}:${++sequenceRef.current}`;
    activeRef.current = { requestId, stateHash };
    setStatus("calculating");
    setProgress({ stage: "action-line", completed: 0, total: Math.max(1, source.decisions.length * 3 + 2) });
    setError("");
    worker.postMessage({
      type: "start",
      requestId,
      stateHash,
      input: source,
      config: {
        ...DEFAULT_CONFIG,
        seed: source.seed,
        calculatorVersion: source.calculatorVersion,
      },
    });
  }, [ensureWorker]);

  useEffect(() => () => {
    const active = activeRef.current;
    if (active) workerRef.current?.postMessage({ type: "cancel", ...active });
    workerRef.current?.terminate();
    workerRef.current = undefined;
    activeRef.current = undefined;
  }, []);

  return { status, progress, error, start, cancel };
}
