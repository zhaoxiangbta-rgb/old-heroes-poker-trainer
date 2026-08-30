// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../data/memoryRepository";
import { newGame } from "../game/game";
import type { DeepHandReview } from "../review/types";
import { buildAiReviewFacts } from "./reviewFacts";
import { useAiHandReview } from "./useAiHandReview";

afterEach(cleanup);

function localReview(): DeepHandReview {
  return { version: 3, status: "completed", handNo: 1, seed: 1, stateHash: "review-1", strategyVersion: "v4", calculatorVersion: "v4", completedAt: "now", summary: { grade: "良好", totalNormalizedEvLoss: 0, strongestPoint: "翻牌", priorityCorrection: "河牌", confidence: 1, precision: "exact" }, decisions: [], wholeHand: { conclusion: "河牌应弃牌", streets: [{ street: "river", board: ["2c", "3d", "4h", "5s", "7c"], actionLine: ["对手下注到7"], comment: "权益不足", actual: "跟注", recommended: "弃牌" }], turningPoint: "河牌", finalRanges: [], bestChoice: "弃牌", nextRule: "尊重大注" } };
}

describe("useAiHandReview", () => {
  it("explains why AI review cannot run in the browser preview instead of silently showing the local template", async () => {
    const repository = createMemoryRepository();
    const game = newGame(1); game.phase = "review";
    const review = localReview();
    const completed = vi.fn();
    const { result } = renderHook(() => useAiHandReview({ repository, settings: { baseUrl: "x", model: "qwen", enabled: true }, game, localReview: review, onCompleted: completed }));
    await waitFor(() => expect(result.current.status).toBe("not-started"));
    expect(result.current.error).toMatch(/开发预览.*macOS 应用/);
  });

  it("waits for local facts and then persists one valid AI review", async () => {
    const repository = createMemoryRepository(); Object.defineProperty(repository, "mode", { value: "native" });
    const game = newGame(1); game.phase = "review";
    let resolve!: (value: { content: string; model: string; elapsedMs: number }) => void;
    const generate = vi.spyOn(repository, "generateAiExplanation").mockReturnValue(new Promise((done) => { resolve = done; }));
    const completed = vi.fn();
    const review = localReview();
    const { result, rerender } = renderHook(({ value }) => useAiHandReview({ repository, settings: { baseUrl: "x", model: "qwen", enabled: true }, game, localReview: value, onCompleted: completed }), { initialProps: { value: undefined as DeepHandReview | undefined } });
    expect(generate).not.toHaveBeenCalled();
    rerender({ value: review });
    await waitFor(() => expect(result.current.status).toBe("calculating"));
    const facts = buildAiReviewFacts(game, review);
    act(() => resolve({ model: "qwen", elapsedMs: 500, content: JSON.stringify({ version: 1, stateHash: facts.stateHash, summary: "河牌应弃牌", streets: [{ street: "river", analysis: "面对下注到7应弃牌" }], turningPoint: "河牌", keyLesson: "尊重大注" }) }));
    await waitFor(() => expect(result.current.status).toBe("completed"));
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({ model: "qwen", stateHash: "review-1" }));
  });

  it("retries once with validation feedback when the first model answer changes the recommendation", async () => {
    const repository = createMemoryRepository(); Object.defineProperty(repository, "mode", { value: "native" });
    const game = newGame(1); game.phase = "review";
    const review = localReview();
    const facts = buildAiReviewFacts(game, review);
    const valid = { version: 1, stateHash: facts.stateHash, summary: "河牌应弃牌", streets: [{ street: "river", analysis: "面对下注到7应弃牌" }], turningPoint: "河牌", keyLesson: "尊重大注" };
    const generate = vi.spyOn(repository, "generateAiExplanation")
      .mockResolvedValueOnce({ model: "qwen", elapsedMs: 300, content: JSON.stringify({ ...valid, streets: [{ street: "river", analysis: "面对下注到7应跟注" }] }) })
      .mockResolvedValueOnce({ model: "qwen", elapsedMs: 400, content: JSON.stringify(valid) });
    const { result } = renderHook(() => useAiHandReview({ repository, settings: { baseUrl: "x", model: "qwen", enabled: true }, game, localReview: review, onCompleted: vi.fn() }));
    await waitFor(() => expect(result.current.status).toBe("completed"));
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].facts).toHaveProperty("validationFeedback");
    expect(result.current.review?.elapsedMs).toBe(700);
  });
});
