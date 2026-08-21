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
});
