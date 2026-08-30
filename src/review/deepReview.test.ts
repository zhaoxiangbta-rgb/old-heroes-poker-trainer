import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { createDeck, type Card } from "../engine/cards";
import { captureHeroDecision } from "./capture";
import { calculateDeepHandReview } from "./deepReview";
import { reviewInsightInput } from "./coachFacts";
import { inferOpponentRanges } from "../insights/opponentRanges";
import { publicDecisionStateFromInsight } from "../insights/actionResponse";
import { createLocalStrategyEngine } from "../strategy/engine";
import type { DeepCalculationConfig, DeepReviewInput } from "./types";

const config: DeepCalculationConfig = {
  calculatorVersion: "deep-review-v1",
  sampleBudget: 64,
  batchSize: 32,
  memoryLimitBytes: 4 * 1024 * 1024,
  seed: 99,
};

function reviewFixture(): { input: DeepReviewInput; hidden: string } {
  const game = newGame(42);
  const dealt = new Set(game.players.flatMap((player) => player.hole));
  game.board = createDeck().filter((card) => !dealt.has(card)).slice(0, 5);
  game.street = "river";
  const opponent = game.players.find((player) => player.seat !== game.heroSeat)!;
  game.players.forEach((player) => {
    player.folded = player.seat !== game.heroSeat && player.seat !== opponent.seat;
  });
  const hidden = opponent.hole.join("");
  const first = captureHeroDecision(game);
  first.actual = { type: "check" };

  game.log.push({
    street: "river",
    actorSeat: opponent.seat,
    actor: opponent.name,
    kind: "raise",
    action: "下注",
    amount: 40,
    toAmount: 40,
    potBefore: 30,
    potAfter: 70,
  });
  game.pot = 70;
  const second = captureHeroDecision(game);
  second.actual = { type: "fold" };
  return {
    hidden,
    input: {
      handNo: game.handNo,
      seed: game.seed,
      strategyVersion: game.strategyVersion,
      calculatorVersion: config.calculatorVersion,
      decisions: [first, second],
    },
  };
}

describe("post-hand deep review", () => {
  it("completes a hand that ends from a preflop decision", async () => {
    const game = newGame(7, 1, undefined, [
      { name: "你", stack: 200, buyIn: 200, rebuys: 0 },
      { name: "对手", stack: 200, buyIn: 200, rebuys: 0 },
    ]);
    const decision = captureHeroDecision(game);
    decision.actual = game.legal.canCheck ? { type: "check" } : { type: "call" };
    const review = await calculateDeepHandReview({
      handNo: game.handNo,
      seed: game.seed,
      strategyVersion: game.strategyVersion,
      calculatorVersion: config.calculatorVersion,
      decisions: [decision],
    }, { config, onProgress() {} });

    expect(review.status).toBe("completed");
    expect(review.version).toBe(3);
    expect(review.decisions).toHaveLength(1);
    expect(review.decisions[0]).toMatchObject({ street: "preflop", precision: "sampled" });
    expect(review.decisions[0].candidates.length).toBeGreaterThan(0);
    if (review.version === 3) {
      expect(review.decisions[0].coach.narrative.length).toBeGreaterThan(20);
      expect(review.decisions[0].coach.opponentBuckets.length).toBeGreaterThan(0);
      expect(review.decisions[0].analysis.sections).toHaveLength(5);
      expect(review.wholeHand?.streets).toHaveLength(1);
      expect(review.wholeHand?.bestChoice).toContain("最佳选择");
    }
  });

  it("completes a multiway preflop decision without requiring a flop board", async () => {
    const game = newGame(19);
    const decision = captureHeroDecision(game);
    decision.actual = game.legal.canCheck ? { type: "check" } : { type: "call" };
    const review = await calculateDeepHandReview({
      handNo: game.handNo,
      seed: game.seed,
      strategyVersion: game.strategyVersion,
      calculatorVersion: config.calculatorVersion,
      decisions: [decision],
    }, { config, onProgress() {} });

    expect(decision.board).toEqual([]);
    expect(decision.visiblePlayers.filter((player) => !player.folded)).toHaveLength(6);
    expect(review.status).toBe("completed");
    expect(review.decisions[0]).toMatchObject({ street: "preflop", precision: "sampled" });
  });

  it("uses visible actions to narrow ranges without leaking hidden holes", async () => {
    const fixture = reviewFixture();
    const review = await calculateDeepHandReview(fixture.input, { config, onProgress() {} });
    const opponentId = Object.keys(review.decisions[0].ranges)[0];
    expect(review.decisions[1].ranges[opponentId].comboCount)
      .toBeLessThan(review.decisions[0].ranges[opponentId].comboCount);
    expect(JSON.stringify(review)).not.toContain(fixture.hidden);
  });

  it("is scored from decision EV deterministically", async () => {
    const fixture = reviewFixture();
    const first = await calculateDeepHandReview(fixture.input, { config, onProgress() {} });
    const replay = await calculateDeepHandReview(structuredClone(fixture.input), { config, onProgress() {} });
    expect(replay.decisions.map((decision) => decision.normalizedEvLoss))
      .toEqual(first.decisions.map((decision) => decision.normalizedEvLoss));
    expect(replay.decisions).toEqual(first.decisions);
    expect(replay.summary).toEqual(first.summary);
    expect(first.summary.totalNormalizedEvLoss).toBeGreaterThanOrEqual(0);
  });

  it("keeps post-hand recommendations on the same V4 strategy candidates shown during the hand", async () => {
    const fixture = reviewFixture();
    const decision = fixture.input.decisions[0];
    const insight = reviewInsightInput(decision);
    const ranges = inferOpponentRanges(insight);
    const live = createLocalStrategyEngine().decide({
      state: publicDecisionStateFromInsight(insight),
      ranges: {
        version: 1,
        lastActionIndex: insight.logIndex,
        bySeat: Object.fromEntries(ranges.map((range) => [range.seat, range.ranges.map((combo) => ({
          cards: [combo.cards[0], combo.cards[1]] as [Card, Card],
          weight: combo.weight,
        }))])),
      },
      deadlineMs: 250,
    });
    const expectedActions = live.actions.map((action) => action.action === "fold" || action.action === "check" || action.action === "call"
      ? { type: action.action }
      : { type: "raise" as const, to: action.toAmount ?? decision.legal.minRaiseTo });

    const review = await calculateDeepHandReview(fixture.input, { config, onProgress() {} });
    expect(review.decisions[0].candidates.map((candidate) => candidate.action)).toEqual(expectedActions);
    expect(review.version).toBe(3);
    if (review.version !== 3) throw new Error("测试需要 V3 复盘");
    expect(review.decisions[0].analysis.audit.strategyVersion).toBe("strategy-v4.0.0");
  });
});
