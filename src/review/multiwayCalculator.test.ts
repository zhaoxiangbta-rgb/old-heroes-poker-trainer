import { describe, expect, it } from "vitest";
import { calculateMultiwayNode } from "./multiwayCalculator";
import type { DeepCalculationConfig, DeepNodeInput } from "./types";

const config: DeepCalculationConfig = {
  calculatorVersion: "deep-review-v1",
  sampleBudget: 256,
  batchSize: 64,
  memoryLimitBytes: 8 * 1024 * 1024,
  seed: 73,
};

function fixture(): DeepNodeInput {
  return {
    hero: ["Ah", "Ad"],
    board: ["2c", "3d", "4h", "9s", "Kc"],
    pot: 250,
    heroStreetBet: 0,
    heroSeat: 0,
    players: [
      { seat: 0, totalBet: 100, streetBet: 0, stack: 0, folded: false },
      { seat: 1, totalBet: 50, streetBet: 0, stack: 0, folded: false },
      { seat: 2, totalBet: 100, streetBet: 0, stack: 0, folded: false },
    ],
    legal: {
      canFold: false,
      canCheck: true,
      canCall: false,
      canRaise: false,
      callAmount: 0,
      minRaiseTo: 0,
      maxRaiseTo: 0,
    },
    rangesBySeat: {
      1: [
        { cards: ["Kh", "Qh"], weight: 1 },
        { cards: ["Ah", "Ks"], weight: 1 },
      ],
      2: [{ cards: ["5c", "6c"], weight: 1 }],
    },
  };
}

describe("multiway deep calculator", () => {
  it("rejects blocked combos and never accepts a conflicting sample", async () => {
    const result = await calculateMultiwayNode(fixture(), config, () => {});
    expect(result.diagnostics.rejectedConflicts).toBeGreaterThan(0);
    expect(result.diagnostics.conflictingSamples).toBe(0);
  });

  it("is deterministic for the same seed and budget", async () => {
    const first = await calculateMultiwayNode(fixture(), config, () => {});
    const second = await calculateMultiwayNode(fixture(), config, () => {});
    expect(second).toEqual(first);
  });

  it("scores the hero against each side-pot eligible set", async () => {
    const result = await calculateMultiwayNode(fixture(), config, () => {});
    expect(result.expectedPotReturn).toBe(0);
    expect(result.samples).toBe(256);
    expect(result.precision).toBe("sampled");
  });
});
