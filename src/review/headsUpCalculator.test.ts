import { describe, expect, it } from "vitest";
import type { DeepNodeInput } from "./types";
import { calculateHeadsUpNode } from "./headsUpCalculator";

function riverFixture(): DeepNodeInput {
  return {
    hero: ["Ah", "Ad"],
    board: ["2c", "3d", "4h", "9s", "Kc"],
    pot: 40,
    heroStreetBet: 0,
    legal: {
      canFold: true,
      canCheck: true,
      canCall: false,
      canRaise: true,
      callAmount: 0,
      minRaiseTo: 2,
      maxRaiseTo: 100,
    },
    rangesBySeat: {
      1: [
        { cards: ["Kh", "Qh"], weight: 0.75 },
        { cards: ["5c", "6c"], weight: 0.25 },
      ],
    },
  };
}

describe("heads-up deep calculator", () => {
  it("matches a hand-derived weighted river enumeration", async () => {
    const result = await calculateHeadsUpNode(riverFixture(), () => {});
    expect(result.precision).toBe("exact");
    expect(result.equity).toBeCloseTo(0.75, 10);
    expect(result.samples).toBe(2);
  });

  it("never emits a raise outside the captured legal bounds", async () => {
    const input = riverFixture();
    input.pot = 30;
    input.heroStreetBet = 4;
    input.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 6,
      minRaiseTo: 18,
      maxRaiseTo: 38,
    };
    const result = await calculateHeadsUpNode(input, () => {});
    const raises = result.candidates.filter((candidate) => candidate.action.type === "raise");
    expect(raises.length).toBeGreaterThan(0);
    for (const candidate of raises) {
      if (candidate.action.type !== "raise") continue;
      expect(candidate.action.to).toBeGreaterThanOrEqual(18);
      expect(candidate.action.to).toBeLessThanOrEqual(38);
    }
  });
});
