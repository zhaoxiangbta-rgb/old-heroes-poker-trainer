import { describe, expect, it } from "vitest";
import { adjustProfileV4 } from "./profileAdjustment";

describe("ProfileAdjustmentV4", () => {
  it("never creates an action that the standard strategy removed", () => {
    const baseline = [
      { action: "fold" as const, frequency: 0.8, ev: 0, intent: "pot-control" as const },
      { action: "raise" as const, toAmount: 40, frequency: 0.2, ev: 2, intent: "value" as const },
    ];
    const result = adjustProfileV4({ actions: baseline, tableProfileId: "friends", street: "flop" });
    expect(result.actions.map((action) => action.action)).toEqual(["fold", "raise"]);
    expect(result.actions.some((action) => action.action === "call")).toBe(false);
  });

  it("caps every frequency move at fifteen percentage points", () => {
    const baseline = [
      { action: "fold" as const, frequency: 0.5, ev: 0, intent: "pot-control" as const },
      { action: "call" as const, frequency: 0.25, ev: 1, intent: "pot-control" as const },
      { action: "raise" as const, toAmount: 40, frequency: 0.25, ev: 2, intent: "semi-bluff" as const },
    ];
    const result = adjustProfileV4({ actions: baseline, tableProfileId: "loose-wild", street: "turn" });
    for (let index = 0; index < baseline.length; index += 1) {
      expect(Math.abs(result.actions[index].frequency - baseline[index].frequency)).toBeLessThanOrEqual(0.1500001);
    }
    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
  });

  it("never increases river large-raise bluffs", () => {
    const baseline = [
      { action: "check" as const, frequency: 0.7, ev: 3, intent: "pot-control" as const },
      { action: "raise" as const, toAmount: 100, potFraction: 1.25, frequency: 0.3, ev: 3.1, intent: "bluff" as const },
    ];
    const result = adjustProfileV4({ actions: baseline, tableProfileId: "loose-wild", street: "river" });
    expect(result.actions[1].frequency).toBeLessThanOrEqual(0.3);
  });
});
