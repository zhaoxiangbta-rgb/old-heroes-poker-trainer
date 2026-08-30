import { describe, expect, it } from "vitest";
import type { DeepDecisionInput, DeepDecisionReviewV3 } from "./types";
import { buildWholeHandNarrative } from "./wholeHandNarrative";

function decision(street: "preflop" | "flop" | "turn" | "river", logIndex: number, loss: number): DeepDecisionReviewV3 {
  return {
    id: `1:${logIndex}`, logIndex, street, position: "BTN", pot: 20, spr: 5,
    activePlayers: 2, playersBehind: 0,
    actual: street === "river" ? { type: "call" } : { type: "check" },
    recommended: street === "river" ? { type: "fold" } : { type: "check" },
    candidates: [], normalizedEvLoss: loss, equity: 0.2, requiredEquity: 0.273,
    cleanOuts: 0, dirtyOuts: 0, ranges: {}, precision: "sampled", samples: 20000,
    coverage: 1, confidence: 0.72, tags: [], correctThinking: [], corrections: [], coreRule: "比较范围",
    coach: {
      madeHandLabel: street === "river" ? "J高同花" : "顶对",
      heroRangePercentile: 0.7, equityVsFullRange: 0.2, equityVsContinueRange: null,
      opponentBuckets: [], opponentResponses: [], atLeastOnePlayerBehindContinues: null,
      runoutSummary: [], recommendationReasons: [], changeConditions: [], confidence: 0.72,
      narrative: "旧的单点叙述",
    },
    analysis: {
      schemaVersion: 2, sections: [], heroRange: { label: "T8s", percentile: 0.4 },
      opponentBuckets: { strongValue: 0.5, madeHand: 0.2, strongDraw: 0.1, weakDraw: 0.05, air: 0.15 },
      baseline: [], adjusted: [], confidence: 0.72,
      audit: { strategyVersion: "strategy-v3", sampleBudget: 20000, seed: 42 },
    },
    opponentRanges: [{
      playerId: "villain", comboCount: 80,
      buckets: { strongValue: 0.62, madeHand: 0.18, strongDraw: 0.05, weakDraw: 0.03, air: 0.12 },
      latestAction: "河牌加注 1.30 池", confidence: 0.76,
    }],
  };
}

function input(street: "preflop" | "flop" | "turn" | "river", logIndex: number): DeepDecisionInput {
  return {
    handNo: 1, logIndex, street, heroSeat: 0, heroHole: ["Th", "8h"],
    board: street === "river" ? ["9h", "7h", "6s", "Qd", "3h"] : [],
    pot: 100, currentBet: 130,
    legal: { canFold: true, canCheck: false, canCall: true, canRaise: true, callAmount: 30, minRaiseTo: 160, maxRaiseTo: 148 },
    visiblePlayers: [],
    log: [
      { street: "river", actorSeat: 2, actor: "对手", kind: "raise", action: "加注到", amount: 100, toAmount: 130, potBefore: 100, potAfter: 200 },
    ],
  };
}

describe("whole hand narrative", () => {
  it("produces one connected street story and a single turning point", () => {
    const decisions = [decision("preflop", 0, 0), decision("river", 6, 0.18)];
    const inputs = [input("preflop", 0), input("river", 6)];
    const result = buildWholeHandNarrative(decisions, inputs);

    expect(result.streets.map((item) => item.street)).toEqual(["preflop", "river"]);
    expect(result.streets[1].actionLine).toEqual(["对手 加注到 130"]);
    expect(result.turningPoint).toContain("河牌");
    expect(result.turningPoint).toContain("跟注");
    expect(result.turningPoint).toContain("弃牌");
    expect(result.bestChoice).toContain("需要27.3%");
    expect(result.finalRanges[0].buckets[0]).toEqual({ label: "强价值", probability: 0.62 });
  });

  it("does not repeat cumulative log entries across decisions", () => {
    const river = input("river", 6);
    const duplicate = { ...input("turn", 4), log: [...river.log] };
    const result = buildWholeHandNarrative([decision("turn", 4, 0), decision("river", 6, 0.18)], [duplicate, river]);
    const lines = result.streets.flatMap((item) => item.actionLine);
    expect(lines.filter((line) => line.includes("对手 加注到 130"))).toHaveLength(1);
  });

  it("explains a small-blind complete as a priced low-loss deviation instead of contradicting itself", () => {
    const sbDecision = {
      ...decision("preflop", 4, 0.01),
      position: "SB" as const,
      pot: 3,
      actual: { type: "call" as const },
      recommended: { type: "fold" as const },
      requiredEquity: 0.25,
      coach: {
        ...decision("preflop", 4, 0.01).coach,
        madeHandLabel: "边缘同花起手牌",
        opponentBuckets: [
          { kind: "weak-preflop" as const, probability: 0.7 },
          { kind: "medium-pair" as const, probability: 0.3 },
        ],
      },
    };
    const sbInput: DeepDecisionInput = {
      ...input("preflop", 4),
      heroSeat: 4,
      heroHole: ["Ks", "2s"],
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
      visiblePlayers: [
        { seat: 4, playerId: "hero", name: "你", position: "SB", stack: 199, streetBet: 1, totalBet: 1, folded: false, allIn: false, revealed: false, buyIn: 200, rebuys: 0 },
        { seat: 5, playerId: "bb", name: "大盲", position: "BB", stack: 198, streetBet: 2, totalBet: 2, folded: false, allIn: false, revealed: false, buyIn: 200, rebuys: 0 },
      ],
      log: [],
    };

    const result = buildWholeHandNarrative([sbDecision], [sbInput]);
    const comment = result.streets[0].comment;
    expect(comment).toContain("补齐1筹码到2");
    expect(comment).toContain("底池赔率门槛25.0%");
    expect(comment).toContain("低损失偏离");
    expect(comment).toContain("弱起手牌约70%");
    expect(comment).not.toContain("普通成牌");
    expect(comment).not.toContain("更好的是弃牌");
  });
});
