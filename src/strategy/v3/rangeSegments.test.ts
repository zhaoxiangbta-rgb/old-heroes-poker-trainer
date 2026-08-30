import { describe, expect, it } from "vitest";
import type { WeightedCombo } from "../../engine/ranges";
import { segmentOpponentRange } from "./rangeSegments";

const range: WeightedCombo[] = [
  { cards: ["Ks", "Kc"], weight: 0.25, label: "KsKc", history: [] },
  { cards: ["Qh", "Jh"], weight: 0.25, label: "QhJh", history: [] },
  { cards: ["9s", "8s"], weight: 0.25, label: "9s8s", history: [] },
  { cards: ["4c", "3c"], weight: 0.25, label: "4c3c", history: [] },
];

describe("V3 opponent range segmentation", () => {
  it("assigns every valid combo to exactly one structural segment", () => {
    const result = segmentOpponentRange({
      heroHole: ["Ah", "Kd"],
      board: ["Kh", "7h", "2c"],
      opponentRange: range,
    });
    const ids = result.segments.flatMap((segment) => segment.comboIds).sort();
    expect(ids).toEqual(range.map((combo) => combo.cards.join("")).sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.totalWeight).toBeCloseTo(1, 10);
  });
});
