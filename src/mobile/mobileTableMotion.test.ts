import { describe, expect, it } from "vitest";
import type { Result } from "../game/game";
import type { VisualToken } from "../game/useGamePlayback";
import { mobileActionFlights, mobileSettlementFlights } from "./mobileTableMotion";

function token(
  id: number,
  effect: VisualToken["effect"],
  actorSeat: number,
  amount = 0,
  kind: "call" | "raise" | "all-in" | "fold" = "call",
): VisualToken {
  return {
    id,
    effect,
    actorSeat,
    expiresAt: Date.now() + 400,
    action: {
      street: "flop",
      actorSeat,
      actor: "测试玩家",
      kind,
      action: kind === "fold" ? "弃牌" : kind === "all-in" ? "全下" : "跟注",
      amount,
      toAmount: amount,
      potAfter: 80,
    },
  };
}

describe("mobile table motion model", () => {
  it("maps chip and fold tokens to hero-relative seats with bounded assets", () => {
    const flights = mobileActionFlights([
      token(1, "chips", 4, 50, "raise"),
      token(2, "fold", 1, 0, "fold"),
      token(3, "thinking", 2),
    ], 4, 6);

    expect(flights).toEqual([
      { key: "chips-1", kind: "chips", actorSeat: 4, visualSeat: 0, chipCount: 4 },
      { key: "fold-2", kind: "fold", actorSeat: 1, visualSeat: 3, cardCount: 2 },
    ]);
    expect(flights.reduce((sum, flight) => sum + (flight.kind === "chips" ? flight.chipCount : 0), 0)).toBeLessThanOrEqual(12);
  });

  it("uses six visible chips only for a real all-in action", () => {
    expect(mobileActionFlights([token(7, "chips", 0, 200, "all-in")], 0, 6)[0])
      .toEqual({ key: "chips-7", kind: "chips", actorSeat: 0, visualSeat: 0, chipCount: 6 });
  });

  it("uses settled pots without recalculating split or side-pot winners", () => {
    const result: Result = {
      winners: [0, 2],
      summary: "平分",
      reason: "showdown",
      pots: [
        { label: "主池", amount: 120, eligible: [0, 1, 2], winners: [0, 2] },
        { label: "边池 1", amount: 40, eligible: [1, 2], winners: [2] },
      ],
    };

    expect(mobileSettlementFlights(result, 0, 6)).toEqual([
      { key: "collect-0-0-0", winnerSeat: 0, visualSeat: 0, amount: 60, chipCount: 2 },
      { key: "collect-0-1-2", winnerSeat: 2, visualSeat: 2, amount: 60, chipCount: 2 },
      { key: "collect-1-0-2", winnerSeat: 2, visualSeat: 2, amount: 40, chipCount: 2 },
    ]);
  });

  it("caps settlement bundles at twelve visible chips", () => {
    const result: Result = {
      winners: [0, 1, 2, 3, 4, 5],
      summary: "平分",
      reason: "showdown",
      pots: [{ label: "主池", amount: 120, eligible: [0, 1, 2, 3, 4, 5], winners: [0, 1, 2, 3, 4, 5] }],
    };
    expect(mobileSettlementFlights(result, 0, 6)).toHaveLength(6);
  });
});
