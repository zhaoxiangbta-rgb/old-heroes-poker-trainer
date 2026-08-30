import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import type { PreActionInsightState } from "../insights/types";
import { buildAiLiveFacts } from "./liveFacts";

function insight(currentHand: string, recommendation: "fold" | "check" | "call" | "raise" = "fold"): PreActionInsightState {
  return {
    status: "ready",
    key: { handNo: 1, seed: 7, street: "flop", logIndex: 3, stateHash: "live-state-7" },
    liveCoach: {
      schemaVersion: 1,
      strategy: { label: "V4 · 范围解析", version: "strategy-v4.0.0", degraded: false },
      hero: { currentHand, upgrades: [], upgradeSummary: "没有明显升级" },
      opponents: [{
        seat: 1, playerId: "friend-02", primary: true, comboCount: 120,
        confidence: 0.72, actionLine: "翻牌下注到2",
        buckets: [
          { key: "strongValue", label: "强价值", probability: 0.31 },
          { key: "madeHand", label: "普通成牌", probability: 0.24 },
          { key: "air", label: "空气", probability: 0.45 },
        ],
      }],
      confidence: 0.72,
    },
    analysis: {
      schemaVersion: 2, sections: [], heroRange: { label: "范围底部", percentile: 0.1 },
      opponentBuckets: { strongValue: 0.31, madeHand: 0.24, strongDraw: 0, weakDraw: 0, air: 0.45 },
      baseline: [],
      adjusted: [{
        action: recommendation, frequency: 1, ev: recommendation === "fold" ? 0 : 1,
        intent: "pot-control",
      }],
      confidence: 0.72,
      audit: { strategyVersion: "strategy-v4.0.0", sampleBudget: 384, seed: 7 },
    },
  } as PreActionInsightState;
}

describe("AI live fact pack", () => {
  it("does not call a public-board pair a private pair and precomputes the price", () => {
    const game = newGame(7);
    const hero = game.players[game.heroSeat];
    hero.hole = ["Jh", "2d"];
    hero.position = "BTN";
    game.street = "flop";
    game.board = ["Ac", "4s", "4h"];
    game.pot = 6;
    game.legal.callAmount = 2;

    const facts = buildAiLiveFacts(game, insight("一对"));

    expect(facts.hero.currentHand).toBe("公共牌一对，底牌未改善");
    expect(facts.hero.privateContribution).toBe(false);
    expect(facts.position).toBe("庄位");
    expect(facts.price).toEqual({ callAmount: 2, pot: 6, callFractionOfPot: "33.3%" });
    expect(facts.recommendation.key).toBe("fold");
    expect(facts.opponents[0].buckets).toEqual([
      { label: "强价值", probability: "31%" },
      { label: "普通成牌", probability: "24%" },
      { label: "空气", probability: "45%" },
    ]);
  });

  it("describes a pocket-pair flop hit as trips with private contribution", () => {
    const game = newGame(9);
    game.players[game.heroSeat].hole = ["9h", "9d"];
    game.street = "flop";
    game.board = ["9c", "3s", "2h"];
    const facts = buildAiLiveFacts(game, insight("三条", "raise"));
    expect(facts.hero.currentHand).toBe("三条");
    expect(facts.hero.privateContribution).toBe(true);
    expect(facts.recommendation.key).toBe("raise");
  });
});
