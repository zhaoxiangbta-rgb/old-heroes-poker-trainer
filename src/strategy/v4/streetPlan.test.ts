import { describe, expect, it } from "vitest";
import { analyzePokerFactsV4 } from "./pokerFacts";
import { createStreetPlanV4, updateStreetPlanV4 } from "./streetPlan";

describe("StreetPlanV4", () => {
  it("carries a semi-bluff plan forward instead of resetting every street", () => {
    const flopFacts = analyzePokerFactsV4(["9h", "8h"], ["7h", "6h", "Kd"]);
    const plan = createStreetPlanV4({
      street: "flop",
      action: { action: "raise", toAmount: 24, potFraction: 0.75, frequency: 1, ev: 5, intent: "semi-bluff" },
      facts: flopFacts,
      targetCombos: ["one-pair", "draw"],
      foldTargets: ["ace-high", "underpair"],
    });
    const turnFacts = analyzePokerFactsV4(["9h", "8h"], ["7h", "6h", "Kd", "2c"]);
    const updated = updateStreetPlanV4(plan, { street: "turn", facts: turnFacts });

    expect(updated.id).toBe(plan.id);
    expect(updated.status).toBe("continue");
    expect(updated.history).toHaveLength(1);
    expect(updated.abandonOn).toContain("equity-collapse");
  });

  it("abandons an unsupported bluff when its equity and blockers disappear", () => {
    const plan = createStreetPlanV4({
      street: "flop",
      action: { action: "bet", toAmount: 8, potFraction: 0.33, frequency: 1, ev: 0.2, intent: "bluff" },
      facts: analyzePokerFactsV4(["Jd", "2d"], ["Ac", "9s", "7s"]),
      targetCombos: ["air"],
      foldTargets: ["king-high"],
    });
    const updated = updateStreetPlanV4(plan, {
      street: "turn",
      facts: analyzePokerFactsV4(["Jd", "2d"], ["Ac", "9s", "7s", "3c"]),
    });

    expect(updated.status).toBe("abandon");
    expect(updated.history[0].reason).toBe("equity-collapse");
  });

  it("produces a deterministic id from public plan facts", () => {
    const input = {
      street: "turn" as const,
      action: { action: "call" as const, frequency: 1, ev: 2, intent: "pot-control" as const },
      facts: analyzePokerFactsV4(["Ah", "Qh"], ["Kh", "7d", "2c", "3s"]),
      targetCombos: ["one-pair"],
      foldTargets: [] as string[],
    };
    expect(createStreetPlanV4(input).id).toBe(createStreetPlanV4(input).id);
  });
});
