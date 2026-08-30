import { describe, expect, it } from "vitest";
import { extractHandFeatures } from "./handFeatures";

describe("postflop hand features", () => {
  it("distinguishes top pair from an overpair and records kicker quality", () => {
    expect(extractHandFeatures(["Ah", "Qd"], ["As", "8c", "3d"]).made).toBe("top-pair");
    expect(extractHandFeatures(["Kh", "Kd"], ["Qs", "8c", "3d"]).made).toBe("overpair");
    expect(extractHandFeatures(["Ah", "Qd"], ["As", "8c", "3d"]).kicker).toBeGreaterThan(0.7);
  });

  it("finds open-ended and flush draws", () => {
    const features = extractHandFeatures(["9h", "8h"], ["7h", "6h", "Kd"]);
    expect(features.draws).toContain("open-ended");
    expect(features.draws).toContain("flush-draw");
  });

  it("marks monotone connected boards wetter than dry rainbow boards", () => {
    expect(extractHandFeatures(["As", "Kd"], ["Jh", "Th", "9h"]).texture).toBeGreaterThan(
      extractHandFeatures(["As", "Kd"], ["Kc", "7d", "2s"]).texture,
    );
  });

  it("recognizes when the best five cards are already on the board", () => {
    expect(extractHandFeatures(["2c", "3d"], ["Ah", "Kh", "Qh", "Jh", "Th"]).publicMadeHand).toBe(true);
  });

  it("recognizes a paired flop as a public made hand when hole cards do not improve it", () => {
    const air = extractHandFeatures(["2h", "3h"], ["Js", "4d", "Jc"]);
    const improved = extractHandFeatures(["4h", "3h"], ["Js", "4d", "Jc"]);

    expect(air.made).toBe("pair");
    expect(air.publicMadeHand).toBe(true);
    expect(improved.made).toBe("two-pair");
    expect(improved.publicMadeHand).toBe(false);
  });

  it("keeps an unpaired ace-high flop separate from a public made hand", () => {
    expect(extractHandFeatures(["Jd", "2d"], ["Ac", "9s", "7s"]).publicMadeHand).toBe(false);
  });
});
