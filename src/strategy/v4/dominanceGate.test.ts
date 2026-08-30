import { describe, expect, it } from "vitest";
import type { StrategyAction } from "../types";
import { analyzePokerFactsV4 } from "./pokerFacts";
import { applyDominanceGateV4 } from "./dominanceGate";

const actions: StrategyAction[] = [
  { action: "fold", frequency: 0.25, ev: 0, intent: "pot-control" },
  { action: "call", frequency: 0.35, ev: -12, intent: "pot-control" },
  { action: "raise", toAmount: 40, potFraction: 1, frequency: 0.4, ev: -18, intent: "bluff" },
];

describe("DominanceGateV4", () => {
  it("removes a severely losing air call and unsupported raise before sampling", () => {
    const result = applyDominanceGateV4({
      actions,
      facts: analyzePokerFactsV4(["2h", "3h"], ["Jh", "4d", "Jc"]),
      pot: 20,
      requiredEquity: 1 / 3,
      currentEquity: 0.08,
      facingBet: true,
    });

    expect(result.actions).toEqual([
      { action: "fold", frequency: 1, ev: 0, intent: "pot-control" },
    ]);
    expect(result.rejected.map((item) => item.reason)).toEqual(expect.arrayContaining([
      "insufficient-equity",
      "unsupported-raise",
    ]));
  });

  it("does not treat a backdoor-only draw as support for facing-bet aggression", () => {
    const result = applyDominanceGateV4({
      actions: [actions[0], actions[2]],
      facts: analyzePokerFactsV4(["2h", "3h"], ["Jh", "4d", "Jc"]),
      pot: 20,
      requiredEquity: 1 / 3,
      currentEquity: 0.08,
      facingBet: true,
    });

    expect(result.actions.map((action) => action.action)).toEqual(["fold"]);
    expect(result.rejected).toContainEqual(expect.objectContaining({ reason: "unsupported-raise" }));
  });

  it("keeps a real combo draw continue when equity clears the price", () => {
    const result = applyDominanceGateV4({
      actions: [
        actions[0],
        { ...actions[1], ev: 5 },
        { ...actions[2], ev: 7, intent: "semi-bluff" },
      ],
      facts: analyzePokerFactsV4(["9h", "8h"], ["7h", "6h", "Kd"]),
      pot: 20,
      requiredEquity: 0.25,
      currentEquity: 0.42,
      facingBet: true,
    });

    expect(result.actions.some((action) => action.action === "call")).toBe(true);
    expect(result.actions.some((action) => action.action === "raise")).toBe(true);
  });

  it("preserves a solver-supported close mixed action inside the three-percent pot tolerance", () => {
    const result = applyDominanceGateV4({
      actions: [
        { action: "check", frequency: 0.7, ev: 10, intent: "pot-control" },
        { action: "bet", toAmount: 7, potFraction: 1 / 3, frequency: 0.3, ev: 9.6, intent: "bluff" },
      ],
      facts: analyzePokerFactsV4(["Jd", "2d"], ["Ac", "9s", "7s"]),
      pot: 20,
      requiredEquity: 0,
      currentEquity: 0.12,
      facingBet: false,
      solverSupportedActionKeys: new Set(["bet:7"]),
    });

    expect(result.actions.map((action) => action.action)).toEqual(["check", "bet"]);
  });
});
