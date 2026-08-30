import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import type { WeightedCombo } from "../engine/ranges";
import type { DeepDecisionInput, DeepNodeCalculation } from "./types";
import { buildCoachFacts, combinedContinueRisk, normalizeBuckets } from "./coachFacts";

function combo(cards: [Card, Card], weight = 1): WeightedCombo {
  return { cards, weight, label: cards.join(""), history: [] };
}

const decision: DeepDecisionInput = {
  handNo: 1,
  logIndex: 2,
  street: "flop",
  heroSeat: 0,
  heroHole: ["Ah", "Kd"],
  board: ["Ac", "7s", "2h"],
  pot: 20,
  currentBet: 10,
  tableProfileId: "friends",
  legal: { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 10, minRaiseTo: 30, maxRaiseTo: 190 },
  visiblePlayers: [
    { seat: 0, playerId: "hero", name: "你", position: "BTN", stack: 190, streetBet: 0, totalBet: 10, folded: false, allIn: false, revealed: false, buyIn: 200, rebuys: 0 },
    { seat: 1, playerId: "villain", name: "对手", position: "BB", stack: 180, streetBet: 10, totalBet: 20, folded: false, allIn: false, revealed: false, buyIn: 200, rebuys: 0 },
  ],
  log: [],
  actual: { type: "call" },
};

const calculation: DeepNodeCalculation = {
  equity: 0.6,
  requiredEquity: 0.25,
  candidates: [
    { action: { type: "call" }, ev: 4, frequency: 0.6, intent: "pot-control" },
    { action: { type: "raise", to: 40 }, ev: 5, frequency: 0.4, intent: "value" },
  ],
  precision: "exact",
  samples: 100,
  coverage: 1,
  confidence: 0.8,
  diagnostics: { rejectedConflicts: 0, conflictingSamples: 0 },
};

describe("coach review facts", () => {
  it("normalizes mutually exclusive buckets without NaN", () => {
    const buckets = normalizeBuckets({
      "strong-made": 2, "top-pair": 3, "medium-made": 1,
      "strong-draw": 2, "weak-draw": 1, air: 1,
      "premium-pair": 0, "medium-pair": 0, "strong-ace": 0,
      "suited-connector": 0, "wide-call": 0, "weak-preflop": 0,
    });
    expect(buckets.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
    expect(normalizeBuckets({
      "strong-made": 0, "top-pair": 0, "medium-made": 0,
      "strong-draw": 0, "weak-draw": 0, air: 0,
      "premium-pair": 0, "medium-pair": 0, "strong-ace": 0,
      "suited-connector": 0, "wide-call": 0, "weak-preflop": 0,
    })).toEqual([]);
  });

  it("uses joint probability for players behind", () => {
    expect(combinedContinueRisk([0.2, 0.3])).toBeCloseTo(0.44, 10);
    expect(combinedContinueRisk([])).toBe(0);
  });

  it("builds bounded deterministic facts without hidden holes", () => {
    const input = {
      decision,
      calculation,
      rangesBySeat: {
        1: [
          combo(["As", "Qd"], 2),
          combo(["7c", "7d"], 1),
          combo(["9h", "8h"], 1),
          combo(["Qc", "Jd"], 1),
        ],
      },
      recommended: { type: "raise", to: 40 } as const,
      cleanOuts: 2,
      dirtyOuts: 1,
    };
    const first = buildCoachFacts(input);
    const replay = buildCoachFacts(structuredClone(input));
    expect(first).toEqual(replay);
    expect(first.madeHandLabel).toContain("顶对");
    expect(first.opponentBuckets.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
    expect(first.opponentResponses.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
    expect(first.heroRangePercentile).toBeGreaterThanOrEqual(0);
    expect(first.heroRangePercentile).toBeLessThanOrEqual(1);
    expect(first.equityVsFullRange).toBe(0.6);
    expect(JSON.stringify(first)).not.toContain("hidden-hole");
  });

  it("describes a marginal suited preflop hand without implying it must enter the pot", () => {
    const preflopDecision: DeepDecisionInput = {
      ...decision,
      street: "preflop",
      heroHole: ["Ks", "2s"],
      board: [],
      pot: 3,
      currentBet: 2,
      legal: {
        canFold: true,
        canCheck: false,
        canCall: true,
        canRaise: true,
        callAmount: 1,
        minRaiseTo: 4,
        maxRaiseTo: 199,
      },
      visiblePlayers: decision.visiblePlayers.map((player, index) => ({
        ...player,
        position: index === 0 ? "SB" : "BB",
        streetBet: index === 0 ? 1 : 2,
      })),
    };
    const facts = buildCoachFacts({
      decision: preflopDecision,
      calculation: { ...calculation, equity: 0.38, requiredEquity: 0.25 },
      rangesBySeat: { 1: [combo(["Qc", "7d"])] },
      recommended: { type: "fold" },
      cleanOuts: 0,
      dirtyOuts: 0,
    });

    expect(facts.madeHandLabel).toBe("边缘同花起手牌");
    expect(facts.madeHandLabel).not.toContain("可入池");
  });

  it("describes a paired board as public and the weak hole cards as not improving it", () => {
    const facts = buildCoachFacts({
      decision: {
        ...decision,
        heroHole: ["2h", "3h"],
        board: ["Js", "4d", "Jc"],
      },
      calculation,
      rangesBySeat: { 1: [combo(["As", "Qd"])] },
      recommended: { type: "fold" },
      cleanOuts: 0,
      dirtyOuts: 0,
    });

    expect(facts.madeHandLabel).toBe("公共牌一对，底牌未改善");
    expect(facts.opponentBuckets.find((bucket) => bucket.kind === "medium-made")).toBeUndefined();
  });
});
