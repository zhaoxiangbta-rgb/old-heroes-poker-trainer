// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { newGame } from "../game/game";
import type { DeepHandReview } from "../review/types";
import { DeepHandReviewView } from "./DeepHandReview";

function review(): DeepHandReview {
  return {
    version: 1,
    status: "completed",
    handNo: 1,
    seed: 42,
    stateHash: "abc",
    strategyVersion: "test",
    calculatorVersion: "deep-review-v1",
    completedAt: "2026-08-28T00:00:00.000Z",
    summary: {
      grade: "需复盘",
      totalNormalizedEvLoss: 0.05,
      bestDecisionId: "1:0",
      worstDecisionId: "1:0",
      strongestPoint: "跟注赔率判断正确",
      priorityCorrection: "减少低质量跟注",
      confidence: 0.96,
      precision: "exact",
    },
    decisions: [{
      id: "1:0",
      logIndex: 0,
      street: "flop",
      position: "BTN",
      pot: 20,
      spr: 6,
      activePlayers: 2,
      playersBehind: 0,
      actual: { type: "call" },
      recommended: { type: "raise", to: 30 },
      candidates: [
        { action: { type: "call" }, ev: 2, frequency: 0.3, intent: "pot-control" },
        { action: { type: "raise", to: 30 }, ev: 4, frequency: 0.7, intent: "value" },
      ],
      normalizedEvLoss: 0.05,
      equity: 0.58,
      requiredEquity: 0.25,
      cleanOuts: 6,
      dirtyOuts: 2,
      ranges: {
        villain: { comboCount: 88, topPairOrBetter: 0.4, draws: 0.2, air: 0.4, change: "有效组合收窄 12.0" },
      },
      precision: "exact",
      samples: 1200,
      coverage: 1,
      confidence: 1,
      tags: ["overcalling"],
      correctThinking: ["赔率判断正确"],
      corrections: ["跟注损失 5%"],
      coreRule: "核心规则：比较继续投入后的 EV。",
    }],
  };
}

describe("DeepHandReviewView", () => {
  it("renders all detailed review sections and precision", () => {
    const game = newGame(42);
    game.phase = "review";
    render(<DeepHandReviewView game={game} review={review()} onRecalculate={vi.fn()} onNextHand={vi.fn()} />);
    for (const name of ["整手结论", "行动时间线", "范围变化", "候选 EV", "赔率与补牌", "核心规则"])
      expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getAllByText(/精确枚举/).length).toBeGreaterThan(0);
  });
});
