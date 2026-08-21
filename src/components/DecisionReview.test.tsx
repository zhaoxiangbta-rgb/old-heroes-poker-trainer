// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { DecisionReview } from "./DecisionReview";

describe("DecisionReview", () => {
  it("renders rule-based action comparison without judging the winner", () => {
    const game = newGame(42);
    game.assessments = [{
      id: "1:0", handNo: 1, logIndex: 0, street: "preflop",
      actual: { type: "call" }, recommended: { type: "raise", to: 8 },
      candidates: [
        { action: { type: "call" }, label: "跟注", ev: 1.2, probability: 0.35, intent: "pot-control" },
        { action: { type: "raise", to: 8 }, label: "加注", ev: 1.8, probability: 0.65, intent: "value" },
      ], normalizedEvLoss: 0.02, severity: "review", intent: "pot-control",
      tags: ["overcalling"], coreRules: ["均可，推荐频率不同"], facts: {},
    }];
    render(<DecisionReview game={game} />);
    expect(screen.getByText("均可，推荐频率不同")).toBeTruthy();
    expect(screen.getByText(/实际：跟注/)).toBeTruthy();
    expect(screen.getByText("需复盘")).toBeTruthy();
    expect(screen.getByText("平跟过多")).toBeTruthy();
    expect(screen.getByText(/跟注 ·1\.20/)).toBeTruthy();
    expect(screen.getByText(/加注到 8 ·1\.80/)).toBeTruthy();
  });

  it("shows a non-blocking message when assessment failed", () => {
    const game = newGame(42);
    game.assessmentStatus = "failed";
    render(<DecisionReview game={game} />);
    expect(screen.getByText("本手评分未生成")).toBeTruthy();
  });
});
