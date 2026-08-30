import { describe, expect, it } from "vitest";
import { compareStrategyPackSources } from "./packDiff";
import { compileStrategyPackSources } from "./packCompiler";

describe("desktop/mobile V3 pack differences", () => {
  it("keeps primary actions and provenance aligned", () => {
    const { desktop, mobile } = compileStrategyPackSources();
    const report = compareStrategyPackSources(desktop, mobile);
    expect(report.fatal).toEqual([]);
    expect(report.primaryActionDifferences).toBe(0);
    expect(report.comparedHands).toBe(288 * 169);
  });
});
