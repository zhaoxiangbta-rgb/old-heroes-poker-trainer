/// <reference lib="webworker" />
import { calculateActionResponses } from "./actionResponse";
import { inferOpponentRanges } from "./opponentRanges";
import { calculateExactProjection } from "./runoutProjection";
import type { InsightWorkerEvent, InsightWorkerRequest } from "./types";

const cancelled = new Set<string>();

function post(event: InsightWorkerEvent) {
  self.postMessage(event);
}

self.onmessage = ({ data }: MessageEvent<InsightWorkerRequest>) => {
  if (data.type === "cancel") {
    cancelled.add(data.requestId);
    return;
  }
  const { requestId, key, input } = data;
  cancelled.delete(requestId);
  const shouldCancel = () => cancelled.has(requestId);
  try {
    const ranges = inferOpponentRanges(input);
    if (input.board.length >= 3) {
      const rangesBySeat = Object.fromEntries(ranges.map((range) => [range.seat, range.ranges]));
      const exact = calculateExactProjection(input, rangesBySeat, shouldCancel);
      if (shouldCancel()) return;
      post({ type: "exact-completed", requestId, key, exact });
    }
    if (shouldCancel()) return;
    const responseResult = calculateActionResponses(input, ranges, {
      seed: input.seed,
      sampleBudget: data.sampleBudget,
      deadlineMs: data.deadlineMs,
    });
    if (shouldCancel()) return;
    post({
      type: "ranges-completed",
      requestId,
      key,
      ranges,
      responses: responseResult.responses,
      confidence: responseResult.confidence,
    });
  } catch (error) {
    if (shouldCancel()) return;
    post({
      type: "failed",
      requestId,
      key,
      message: error instanceof Error ? error.message : "下注前分析失败",
    });
  } finally {
    cancelled.delete(requestId);
  }
};
