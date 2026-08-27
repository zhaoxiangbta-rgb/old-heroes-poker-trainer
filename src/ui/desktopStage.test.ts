import { describe, expect, it } from "vitest";
import { desktopStageScale } from "./desktopStage";

describe("desktopStageScale", () => {
  it("keeps the reference canvas at one-to-one scale when it fits", () => {
    expect(desktopStageScale(1090, 800)).toBe(1);
    expect(desktopStageScale(2000, 1200)).toBe(1);
  });

  it("uses one uniform scale when the reference canvas must shrink", () => {
    expect(desktopStageScale(760, 620)).toBeCloseTo(760 / 1090, 6);
  });
});
