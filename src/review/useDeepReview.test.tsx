// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DeepHandReview, DeepReviewEvent, DeepReviewInput } from "./types";
import { useDeepReview, type ReviewWorkerLike } from "./useDeepReview";
import { deepReviewStateHash } from "./stateHash";

class FakeWorker implements ReviewWorkerLike {
  onmessage: ((event: MessageEvent<DeepReviewEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  starts: Array<{ requestId: string; stateHash: string }> = [];
  postMessage(message: { type: string; requestId: string; stateHash?: string }) {
    if (message.type === "start") {
      this.starts.push({ requestId: message.requestId, stateHash: message.stateHash! });
    }
  }
  terminate() {}
  emit(event: DeepReviewEvent) {
    this.onmessage?.({ data: event } as MessageEvent<DeepReviewEvent>);
  }
}

function input(): DeepReviewInput {
  return {
    handNo: 1,
    seed: 42,
    strategyVersion: "test",
    calculatorVersion: "deep-review-v1",
    decisions: [],
  };
}

function review(source: DeepReviewInput): DeepHandReview {
  return {
    version: 1,
    status: "completed",
    handNo: source.handNo,
    seed: source.seed,
    stateHash: deepReviewStateHash(source),
    strategyVersion: source.strategyVersion,
    calculatorVersion: source.calculatorVersion,
    completedAt: "2026-08-28T00:00:00.000Z",
    summary: {
      grade: "良好",
      totalNormalizedEvLoss: 0,
      strongestPoint: "测试",
      priorityCorrection: "测试",
      confidence: 1,
      precision: "exact",
    },
    decisions: [],
  };
}

describe("useDeepReview", () => {
  it("ignores a completed event from an older request", () => {
    const worker = new FakeWorker();
    const onCompleted = vi.fn();
    const source = input();
    const { result } = renderHook(() => useDeepReview({
      input: source,
      onCompleted,
      createWorker: () => worker,
    }));
    act(() => result.current.start());
    const old = worker.starts.at(-1)!;
    act(() => result.current.start());
    act(() => worker.emit({
      type: "completed",
      requestId: old.requestId,
      stateHash: old.stateHash,
      review: review(source),
    }));
    expect(result.current.status).toBe("calculating");
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("becomes cancelled and rejects later partial completion", () => {
    const worker = new FakeWorker();
    const onCompleted = vi.fn();
    const source = input();
    const { result } = renderHook(() => useDeepReview({
      input: source,
      onCompleted,
      createWorker: () => worker,
    }));
    act(() => result.current.start());
    const active = worker.starts.at(-1)!;
    act(() => result.current.cancel());
    act(() => worker.emit({
      type: "completed",
      requestId: active.requestId,
      stateHash: active.stateHash,
      review: review(source),
    }));
    expect(result.current.status).toBe("cancelled");
    expect(onCompleted).not.toHaveBeenCalled();
  });
});
