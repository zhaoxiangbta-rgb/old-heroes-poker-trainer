import { describe, expect, it } from "vitest";
import type { StrategyResult } from "../strategy/types";
import { buildLiveCoachSummary } from "./liveCoachSummary";
import type { ExactProjection, OpponentRangeSummary, PreActionInsightInput } from "./types";

const strategy: StrategyResult = {
  actions: [{ action: "check", frequency: 1, ev: 2, intent: "pot-control" }],
  confidence: 0.82,
  source: "strategy-pack-v3",
  strategyVersion: "strategy-v3",
  rangeFacts: {},
  explanationFacts: {},
};

const input: PreActionInsightInput = {
  schemaVersion: 1,
  handNo: 1,
  seed: 42,
  street: "flop",
  logIndex: 2,
  heroSeat: 0,
  heroHole: ["9h", "9d"],
  board: ["9c", "3s", "2h"],
  pot: 16,
  currentBet: 0,
  minRaise: 2,
  legal: { canFold: true, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 2, maxRaiseTo: 195 },
  pendingSeats: [0, 2],
  tableProfileId: "balanced",
  players: [
    { seat: 0, playerId: "hero", position: "BTN", stack: 195, streetBet: 0, totalBet: 5, folded: false, allIn: false },
    { seat: 2, playerId: "villain", position: "BB", stack: 195, streetBet: 0, totalBet: 5, folded: false, allIn: false },
  ],
  actions: [
    { street: "preflop", actorSeat: 2, kind: "raise", amount: 4, toAmount: 5, potBefore: 3, potAfter: 7 },
    { street: "preflop", actorSeat: 0, kind: "call", amount: 3, toAmount: 5, potBefore: 7, potAfter: 10 },
  ],
};

const exact: ExactProjection = {
  precision: "exact",
  currentHand: { category: 3, name: "三条" },
  atLeastCurrentByRiver: 1,
  handClasses: [
    { category: 3, name: "三条", nextCard: 0.851, byRiver: 0.666 },
    { category: 6, name: "葫芦", nextCard: 0.128, byRiver: 0.291 },
    { category: 7, name: "四条", nextCard: 0.021, byRiver: 0.043 },
  ],
  exclusiveNextTotal: 1,
  exclusiveRiverTotal: 1,
  absoluteNuts: 0.2,
  tiedNuts: 0,
  nearNuts: 0.3,
  outs: [],
  elapsedMs: 12,
};

const ranges: OpponentRangeSummary[] = [{
  seat: 2,
  playerId: "villain",
  comboCount: 120,
  buckets: { strongValue: 0.18, madeHand: 0.42, strongDraw: 0.15, weakDraw: 0.1, air: 0.15 },
  changes: ["翻前加注 1.33 池"],
  confidence: 0.72,
  ranges: [],
}];

describe("live coach summary", () => {
  it("only shows strict upgrades above the already-made hand", () => {
    const summary = buildLiveCoachSummary({ input, exact, ranges, strategy });

    expect(summary.hero.currentHand).toBe("三条");
    expect(summary.hero.upgrades.map((item) => item.name)).toEqual(["葫芦", "四条"]);
    expect(summary.hero.upgrades.map((item) => item.name)).not.toContain("三条");
  });

  it("keeps each opponent independent and marks the latest aggressor", () => {
    const summary = buildLiveCoachSummary({ input, exact, ranges, strategy });

    expect(summary.opponents).toHaveLength(1);
    expect(summary.opponents[0]).toMatchObject({ seat: 2, primary: true, actionLine: "翻前加注 1.33 池" });
    expect(summary.opponents[0].buckets).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "普通成牌", probability: 0.42 }),
      expect.objectContaining({ label: "强价值", probability: 0.18 }),
    ]));
    expect(summary.strategy).toMatchObject({ label: "V3", degraded: false });
  });

  it("uses a readable starting-hand label and no fake upgrades before the flop", () => {
    const preflop = { ...input, street: "preflop" as const, heroHole: ["As", "2s"] as const, board: [] as const };
    const summary = buildLiveCoachSummary({ input: preflop, ranges, strategy });

    expect(summary.hero.currentHand).toBe("A2同花起手牌");
    expect(summary.hero.upgrades).toEqual([]);
  });

  it("distinguishes an exact V4 Solver node from the general range resolver", () => {
    const solver = buildLiveCoachSummary({
      input,
      exact,
      ranges,
      strategy: {
        ...strategy,
        strategyVersion: "strategy-v4.0.0",
        source: "strategy-pack-v4+resolver",
        explanationFacts: { algorithm: "solver-dcfr-v4" },
      },
    });
    const resolver = buildLiveCoachSummary({
      input,
      exact,
      ranges,
      strategy: {
        ...strategy,
        strategyVersion: "strategy-v4.0.0",
        explanationFacts: { v4Layer: "heads-up-solver-resolver" },
      },
    });
    expect(solver.strategy.label).toBe("V4 · Solver节点");
    expect(resolver.strategy.label).toBe("V4 · 范围解析");
  });
});
