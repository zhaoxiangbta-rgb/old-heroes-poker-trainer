import { describe, expect, it } from "vitest";
import { bestHand } from "../engine/evaluator";
import type { Card } from "../engine/cards";
import {
  actionSizePot,
  inferRange,
  rangeFingerprint,
  type RangeModelInput,
} from "./rangeModel";

function input(overrides: Partial<RangeModelInput> = {}): RangeModelInput {
  return {
    position: "CO",
    heroHole: ["Qh", "Jd"],
    board: ["Ah", "Kd", "7c", "2s", "3h"],
    activePlayers: 2,
    visibleLine: [],
    ...overrides,
  };
}

function strongWeight(range: ReturnType<typeof inferRange>, board: Card[]) {
  return range
    .filter((combo) => bestHand([...combo.cards, ...board]).category >= 2)
    .reduce((sum, combo) => sum + combo.weight, 0);
}

describe("visible-information range model", () => {
  it("preserves the real size of an overbet after chips have entered the pot", () => {
    expect(actionSizePot({
      street: "turn",
      actorSeat: 2,
      kind: "bet",
      amount: 30,
      toAmount: 30,
      potBefore: 20,
      potAfter: 50,
    })).toBeCloseTo(1.5);
  });

  it("narrows a river pot-sized raise toward strong combinations", () => {
    const baseInput = input();
    const prior = inferRange(baseInput);
    const raised = inferRange(
      input({
        visibleLine: [
          { street: "river", actorSeat: 1, kind: "raise", toAmount: 40, potAfter: 80 },
        ],
      }),
    );
    expect(strongWeight(raised, baseInput.board)).toBeGreaterThan(
      strongWeight(prior, baseInput.board),
    );
  });

  it("ignores any accidental hidden-card property", () => {
    const base = input();
    const leaked = { ...base, hiddenOpponentHole: ["As", "Ad"] } as RangeModelInput;
    expect(rangeFingerprint(inferRange(base))).toBe(rangeFingerprint(inferRange(leaked)));
  });

  it("removes hero and board blockers and keeps normalized weights", () => {
    const range = inferRange(input());
    const known = new Set(["Qh", "Jd", "Ah", "Kd", "7c", "2s", "3h"]);
    expect(range.every((combo) => combo.cards.every((card) => !known.has(card)))).toBe(true);
    expect(range.reduce((sum, combo) => sum + combo.weight, 0)).toBeCloseTo(1);
  });
});
