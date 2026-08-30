import { describe, expect, it } from "vitest";
import type { WeightedCombo } from "../../engine/ranges";
import type { PostflopSituation } from "../types";
import { estimateElasticResponse } from "./elasticResponse";

const range: WeightedCombo[] = [
  { cards: ["Ks", "Kc"], weight: 0.2, label: "KsKc", history: [] },
  { cards: ["Kc", "Qc"], weight: 0.2, label: "KcQc", history: [] },
  { cards: ["Qh", "Jh"], weight: 0.2, label: "QhJh", history: [] },
  { cards: ["9s", "8s"], weight: 0.2, label: "9s8s", history: [] },
  { cards: ["4c", "3c"], weight: 0.2, label: "4c3c", history: [] },
];

const situation: PostflopSituation = {
  version: 2,
  street: "flop",
  headsUp: true,
  inPosition: true,
  initiative: true,
  lastToAct: true,
  line: "cbet",
  potType: "srp",
  spr: 5,
  playersBehind: 0,
  textureCluster: "test",
  rangeShiftCard: false,
  nodeId: "test",
};

function response(potFraction: number) {
  return estimateElasticResponse({
    heroHole: ["Ah", "Kd"],
    board: ["Kh", "7h", "2c"],
    opponentRange: range,
    situation,
    potFraction,
  });
}

describe("V3 nonlinear size elasticity", () => {
  it("returns six normalized, mutually exclusive action weights", () => {
    const result = response(2 / 3);
    expect(result.fold + result.worseMadeCall + result.drawCall + result.betterCall +
      result.valueRaise + result.bluffRaise).toBeCloseTo(1, 10);
    expect(result.segments.flatMap((segment) => segment.comboIds).sort())
      .toEqual(range.map((combo) => combo.cards.join("")).sort());
    expect(result.equityWhenContinued).toBeGreaterThanOrEqual(0);
    expect(result.equityWhenContinued).toBeLessThanOrEqual(1);
  });

  it("makes weak ranges broadly more elastic without forcing universal folds", () => {
    const half = response(0.5);
    const overbet = response(1.5);
    expect(overbet.fold).toBeGreaterThan(half.fold);
    expect(overbet.fold).toBeLessThan(0.98);
    expect(overbet.betterCall + overbet.valueRaise).toBeGreaterThan(0);
  });

  it("is deterministic over the supported size grid", () => {
    for (const size of [0.5, 2 / 3, 1, 1.5]) expect(response(size)).toEqual(response(size));
  });
});
