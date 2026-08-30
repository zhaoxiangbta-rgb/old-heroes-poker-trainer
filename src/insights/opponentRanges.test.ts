import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import type { PreActionInsightInput } from "./types";
import { inferOpponentRanges } from "./opponentRanges";

function fixture(position: "UTG" | "BTN", actions: PreActionInsightInput["actions"] = []): PreActionInsightInput {
  return {
    schemaVersion: 1,
    handNo: 3,
    seed: 91,
    street: "river",
    logIndex: actions.length,
    heroSeat: 0,
    heroHole: ["Ac", "Jd"] as [Card, Card],
    board: ["Kh", "7c", "4s", "2d", "9h"],
    pot: 80,
    currentBet: 80,
    minRaise: 80,
    legal: { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 80, minRaiseTo: 240, maxRaiseTo: 500 },
    pendingSeats: [0, 1],
    tableProfileId: "friends",
    players: [
      { seat: 0, playerId: "hero", position: "BB", stack: 500, streetBet: 0, totalBet: 40, folded: false, allIn: false },
      {
        seat: 1,
        playerId: "friend-01",
        position,
        stack: 420,
        streetBet: actions.length ? 80 : 0,
        totalBet: actions.length ? 120 : 40,
        folded: false,
        allIn: false,
        profile: {
          version: 1,
          playerId: "friend-01",
          displayName: "青禾",
          archetype: "tight-passive",
          looseness: 34,
          aggression: 28,
          bluff: 12,
          handMood: { loosenessDelta: 0, aggressionDelta: 0, bluffDelta: 0 },
          effective: { looseness: 34, aggression: 28, bluff: 12 },
        },
      },
    ],
    actions,
  };
}

describe("per-opponent public ranges", () => {
  it("narrows a river pot-sized raise toward value for a low-bluff profile", () => {
    const before = inferOpponentRanges(fixture("BTN"))[0];
    const action = { street: "river", actorSeat: 1, kind: "raise", amount: 80, toAmount: 80, potBefore: 80, potAfter: 160 } as const;
    const after = inferOpponentRanges(fixture("BTN", [action]))[0];

    expect(after.buckets.strongValue).toBeGreaterThan(before.buckets.strongValue);
    expect(after.buckets.air).toBeLessThan(before.buckets.air);
    expect(after.changes.some((text) => text.includes("河牌"))).toBe(true);
  });

  it("keeps a late-position checked range wider than an early-position betting range", () => {
    const checkedButton = inferOpponentRanges(fixture("BTN", [
      { street: "river", actorSeat: 1, kind: "check", amount: 0, toAmount: 0, potBefore: 80, potAfter: 80 },
    ]))[0];
    const utgBet = inferOpponentRanges(fixture("UTG", [
      { street: "river", actorSeat: 1, kind: "bet", amount: 60, toAmount: 60, potBefore: 80, potAfter: 140 },
    ]))[0];

    expect(checkedButton.comboCount).toBeGreaterThan(utgBet.comboCount);
    expect(checkedButton.confidence).toBeGreaterThan(0);
  });
});
