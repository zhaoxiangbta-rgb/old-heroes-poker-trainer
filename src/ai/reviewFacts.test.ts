import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import type { DeepHandReview } from "../review/types";
import { buildAiReviewFacts } from "./reviewFacts";

describe("AI whole-hand review fact pack", () => {
  it("preserves street order, local recommendations and only decisions that occurred", () => {
    const game = newGame(31);
    game.phase = "review";
    const review = {
      version: 3, status: "completed", handNo: 1, seed: 31, stateHash: "review-state-31",
      strategyVersion: "strategy-v4.0.0", calculatorVersion: "deep-review-v3", completedAt: "2026-08-31T00:00:00Z",
      summary: { grade: "需复盘", totalNormalizedEvLoss: 2, strongestPoint: "翻牌", priorityCorrection: "河牌弃牌", confidence: 0.8, precision: "exact" },
      decisions: [],
      wholeHand: {
        conclusion: "河牌应弃牌", turningPoint: "河牌面对大加注", bestChoice: "河牌弃牌", nextRule: "大加注尊重强价值",
        streets: [
          { street: "flop", board: ["Jh", "9h", "7c"], actionLine: ["对手下注到10"], comment: "跟注价格好", actual: "跟注", recommended: "跟注" },
          { street: "river", board: ["Jh", "9h", "7c", "Qd", "3h"], actionLine: ["对手加注到130"], comment: "权益不足", actual: "跟注", recommended: "弃牌" },
        ], finalRanges: [],
      },
    } as DeepHandReview;

    const facts = buildAiReviewFacts(game, review);
    expect(facts.streets.map((street) => street.street)).toEqual(["flop", "river"]);
    expect(facts.streets[1].recommended).toBe("弃牌");
    expect(facts.recommendationKeys).toContain("river:弃牌");
    expect(facts.conclusionFacts).toContain("河牌应弃牌");
  });
});
