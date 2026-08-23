import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import type { DecisionContext } from "./types";
import { canonicalHand, preflopFrequencies, preflopTier } from "./preflop";

function context(
  overrides: Partial<DecisionContext> & { raises?: number } = {},
): DecisionContext {
  const raises = overrides.raises ?? 0;
  return {
    seed: 1,
    decisionIndex: 0,
    seat: 0,
    street: "preflop",
    position: "CO",
    hole: ["Ah", "9c"],
    board: [],
    pot: 8,
    currentBet: raises ? 6 * raises : 0,
    streetBet: 0,
    stack: 194,
    effectiveStack: 194,
    activePlayers: 6,
    playersBehind: 2,
    minRaiseTo: raises ? 12 * raises : 4,
    maxRaiseTo: 194,
    legal: { fold: raises > 0, check: raises === 0, call: raises ? 6 : 0, raise: true },
    visibleLine: Array.from({ length: raises }, (_, actorSeat) => ({
      street: "preflop",
      actorSeat,
      kind: "raise",
      toAmount: 6 * (actorSeat + 1),
      potAfter: 8 + actorSeat * 6,
    })),
    ...overrides,
  };
}

describe("six-max preflop strategy", () => {
  it("canonicalizes pairs, suited and offsuit hands", () => {
    expect(canonicalHand(["Ah", "Ad"])).toBe("AA");
    expect(canonicalHand(["9h", "8h"])).toBe("98s");
    expect(canonicalHand(["8h", "As"])).toBe("A8o");
  });

  it("opens wider on the button than under the gun", () => {
    const hand: [Card, Card] = ["8h", "7h"];
    expect(preflopTier(hand, "BTN")).toBeLessThan(preflopTier(hand, "UTG"));
  });

  it("folds dominated offsuit hands to a three-bet instead of overcalling", () => {
    const result = preflopFrequencies(context({ raises: 2 }));
    expect(result.find((item) => item.action.type === "fold")!.frequency).toBeGreaterThan(0.7);
  });

  it("keeps premium hands in the four-bet range", () => {
    const result = preflopFrequencies(
      context({ hole: ["As", "Ad"], position: "UTG", raises: 2 }),
    );
    expect(result.some((item) => item.action.type === "raise" && item.frequency > 0.5)).toBe(true);
  });

  it("does not keep min-raising ordinary opening hands through a five-bet war", () => {
    const result = preflopFrequencies(
      context({ hole: ["9h", "9c"], position: "CO", raises: 3 }),
    );
    expect(result.some((item) => item.action.type === "raise")).toBe(false);
  });

  it("covers a short-stack node where calling all-in is the only legal action", () => {
    const result = preflopFrequencies(
      context({
        currentBet: 2,
        stack: 2,
        maxRaiseTo: 2,
        legal: { fold: true, check: false, call: 2, raise: false },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ action: { type: "call" }, frequency: 1 }),
    ]);
  });
});
