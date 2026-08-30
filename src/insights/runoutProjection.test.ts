import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import type { WeightedCombo } from "../engine/ranges";
import { calculateExactProjection } from "./runoutProjection";
import type { PreActionInsightInput } from "./types";

function input(heroHole: [Card, Card], board: Card[]): PreActionInsightInput {
  const street = board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  return {
    schemaVersion: 1,
    handNo: 1,
    seed: 77,
    street,
    logIndex: 4,
    heroSeat: 0,
    heroHole,
    board,
    pot: 40,
    currentBet: 10,
    minRaise: 10,
    legal: { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 10, minRaiseTo: 30, maxRaiseTo: 190 },
    pendingSeats: [0, 1],
    tableProfileId: "friends",
    players: [
      { seat: 0, playerId: "hero", position: "BTN", stack: 190, streetBet: 0, totalBet: 10, folded: false, allIn: false },
      { seat: 1, playerId: "friend-01", position: "BB", stack: 180, streetBet: 10, totalBet: 20, folded: false, allIn: false },
    ],
    actions: [],
  };
}

function combo(cards: [Card, Card], weight = 1): WeightedCombo {
  return { cards, weight, label: cards.join(""), history: [] };
}

describe("exact pre-action runout projection", () => {
  it("separates an already-made set from its mutually exclusive river outcomes", () => {
    const result = calculateExactProjection(
      input(["9h", "9d"], ["9c", "3s", "2h"]),
    );

    expect(result.currentHand.name).toBe("三条");
    expect(result.atLeastCurrentByRiver).toBe(1);
    expect(result.handClasses.find((item) => item.name === "三条")?.byRiver)
      .toBeCloseTo(720 / 1081, 10);
    expect(result.handClasses.reduce((sum, item) => sum + item.byRiver, 0)).toBeCloseTo(1, 10);
  });

  it("counts mutually exclusive river hand classes without double counting flush paths", () => {
    const result = calculateExactProjection(
      input(["Ah", "Jh"], ["Kh", "Qh", "4c"]),
      { 1: [combo(["Ks", "Qc"]), combo(["9s", "9d"])] },
    );

    expect(result.exclusiveNextTotal).toBeCloseTo(1, 10);
    expect(result.exclusiveRiverTotal).toBeCloseTo(1, 10);
    expect(result.handClasses.reduce((sum, item) => sum + item.byRiver, 0)).toBeCloseTo(1, 10);
    expect(result.handClasses.filter((item) => item.category >= 5).reduce((sum, item) => sum + item.byRiver, 0))
      .toBeCloseTo(1 - (38 * 37) / (47 * 46), 10);
  });

  it("separates a board-made straight flush tie from exclusive nuts", () => {
    const result = calculateExactProjection(
      input(["Kc", "2d"], ["As", "Ks", "Qs", "Js", "Ts"]),
      { 1: [combo(["3c", "4d"])] },
    );

    expect(result.absoluteNuts).toBe(0);
    expect(result.tiedNuts).toBe(1);
    expect(result.nearNuts).toBe(0);
  });

  it("marks a nominal flush out dirty against a higher flush range", () => {
    const result = calculateExactProjection(
      input(["8h", "7h"], ["2h", "3h", "Kc"]),
      { 1: [combo(["Kh", "Qh"])] },
    );

    expect(result.outs).toContainEqual(expect.objectContaining({
      card: "Ah",
      classification: "dirty",
      riskReason: "higher-flush",
    }));
  });

  it("stops when the caller cancels enumeration", () => {
    expect(() => calculateExactProjection(
      input(["Ah", "Jh"], ["Kh", "Qh", "4c"]),
      { 1: [combo(["Ks", "Qc"])] },
      () => true,
    )).toThrow("下注前精算已取消");
  });
});
