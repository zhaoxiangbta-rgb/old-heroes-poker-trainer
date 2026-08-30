import { describe, expect, it } from "vitest";
import type { StrategyResult } from "../types";
import { auditPostflopStrategy, representativePostflopV3Fixtures } from "./postflopAudit";
import { decidePostflopV3 } from "./postflopStrategy";

describe("V3 postflop property audit", () => {
  it("accepts representative paired, dry and draw-heavy states", () => {
    const report = auditPostflopStrategy(representativePostflopV3Fixtures());
    expect(report.fatal).toBe(false);
    expect(report.issues).toEqual([]);
    expect(report.fixtureCount).toBeGreaterThanOrEqual(3);
    expect(report.unverifiedExpertBaseline).toBe(report.fixtureCount);
  });

  it("reports non-normalized and illegal strategy results", () => {
    const broken = (input: Parameters<typeof decidePostflopV3>[0]): StrategyResult => {
      const result = decidePostflopV3(input);
      return {
        ...result,
        actions: [
          { action: "bet", toAmount: -1, frequency: 0.7, ev: Number.NaN, intent: "value" },
          { action: "check", frequency: 0.7, ev: 0, intent: "pot-control" },
        ],
      };
    };
    const report = auditPostflopStrategy(representativePostflopV3Fixtures().slice(0, 1), broken);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PF3_FREQUENCY_INVALID" }));
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PF3_ACTION_ILLEGAL" }));
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "PF3_EV_INVALID" }));
  });
});
