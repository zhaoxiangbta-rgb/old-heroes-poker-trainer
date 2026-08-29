/// <reference lib="webworker" />
import { calculateDeepHandReview, ReviewCancelledError } from "./deepReview";
import type { DeepReviewEvent, DeepReviewRequest } from "./types";

const scope = self as DedicatedWorkerGlobalScope;
const cancelled = new Set<string>();

function send(event: DeepReviewEvent) {
  scope.postMessage(event);
}

scope.onmessage = (message: MessageEvent<DeepReviewRequest>) => {
  const request = message.data;
  if (request.type === "cancel") {
    cancelled.add(request.requestId);
    return;
  }
  cancelled.delete(request.requestId);
  void calculateDeepHandReview(request.input, {
    config: request.config,
    shouldCancel: () => cancelled.has(request.requestId),
    onProgress: (progress) => send({
      type: "progress",
      requestId: request.requestId,
      stateHash: request.stateHash,
      progress,
    }),
  }).then((review) => {
    if (cancelled.has(request.requestId)) {
      send({ type: "cancelled", requestId: request.requestId, stateHash: request.stateHash });
      return;
    }
    send({ type: "completed", requestId: request.requestId, stateHash: request.stateHash, review });
  }).catch((error: unknown) => {
    if (error instanceof ReviewCancelledError || cancelled.has(request.requestId)) {
      send({ type: "cancelled", requestId: request.requestId, stateHash: request.stateHash });
      return;
    }
    send({
      type: "failed",
      requestId: request.requestId,
      stateHash: request.stateHash,
      code: "deep-review-failed",
      message: error instanceof Error ? error.message : "深度精算失败",
    });
  }).finally(() => cancelled.delete(request.requestId));
};
