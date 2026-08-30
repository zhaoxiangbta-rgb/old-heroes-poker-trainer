import { describe, expect, it } from "vitest";
import { newGame, type GameAction } from "../game/game";
import type { PolicyAction, PolicyCandidate } from "../policy/types";
import {
  assessHeroDecision,
  assessFromStrategy,
  weaknessPredicates,
  type AssessmentContext,
} from "./assessment";
import type { StrategyResult } from "../strategy/types";
import type { WeaknessTag } from "./types";

function candidate(action: PolicyAction, ev: number): PolicyCandidate {
  return { action, ev, probability: 0.5, label: action.type, intent: "pot-control" };
}

function context(overrides: Partial<AssessmentContext> = {}): AssessmentContext {
  return {
    street: "turn",
    actual: { type: "call" },
    recommended: { type: "fold" },
    candidates: [candidate({ type: "fold" }, 8), candidate({ type: "call" }, -8)],
    severity: "major",
    activePlayers: 2,
    playersBehind: 0,
    facingSqueeze: false,
    handClass: "high-card",
    strength: 0.2,
    pressureRatio: 0.5,
    cleanOuts: 0,
    dirtyOuts: 0,
    facingOrdinaryBet: false,
    hasWorseCallingRange: false,
    showdownValue: false,
    ...overrides,
  };
}

const positiveContexts: Record<WeaknessTag, AssessmentContext> = {
  overcalling: context(),
  "squeeze-call-too-wide": context({ street: "preflop", facingSqueeze: true }),
  "multiway-top-pair": context({
    activePlayers: 4,
    handClass: "one-pair",
    strength: 0.55,
    pressureRatio: 0.8,
  }),
  "slow-play-strong-hand": context({
    actual: { type: "check" },
    recommended: { type: "raise", to: 40 },
    handClass: "three-of-a-kind",
    strength: 0.86,
  }),
  "bet-means-nuts": context({
    actual: { type: "fold" },
    recommended: { type: "call" },
    facingOrdinaryBet: true,
    strength: 0.58,
  }),
  "missed-worse-calls": context({
    street: "river",
    actual: { type: "check" },
    recommended: { type: "raise", to: 30 },
    strength: 0.74,
    hasWorseCallingRange: true,
  }),
  "river-value-bluff-confusion": context({
    street: "river",
    actual: { type: "raise", to: 70 },
    recommended: { type: "check" },
    showdownValue: true,
    hasWorseCallingRange: false,
  }),
  "dirty-outs": context({ cleanOuts: 4, dirtyOuts: 5 }),
  "players-behind": context({ activePlayers: 4, playersBehind: 2 }),
};

describe("decision assessment", () => {
  it.each(Object.keys(positiveContexts) as WeaknessTag[])(
    "tags the %s mistake only when the scene and EV mistake both exist",
    (tag) => {
      expect(weaknessPredicates[tag](positiveContexts[tag])).toBe(true);
      expect(
        weaknessPredicates[tag]({ ...positiveContexts[tag], severity: "good" }),
      ).toBe(false);
    },
  );

  it("does not read future deck cards while assessing a hero action", () => {
    const before = newGame(42);
    const action: GameAction = before.legal.canCall
      ? { type: "call" }
      : before.legal.canCheck
        ? { type: "check" }
        : { type: "fold" };
    const changedFuture = structuredClone(before);
    changedFuture.deck = [...changedFuture.deck].reverse();
    expect(assessHeroDecision(changedFuture, action)).toEqual(
      assessHeroDecision(before, action),
    );
  });

  it("matches a custom raise to the nearest legal candidate", () => {
    const before = newGame(42);
    const assessment = assessHeroDecision(before, {
      type: "raise",
      to: before.legal.minRaiseTo + 1,
    });
    expect(assessment.actual).toEqual({
      type: "raise",
      to: before.legal.minRaiseTo + 1,
    });
    expect(assessment.candidates.some((item) => item.action.type === "raise")).toBe(true);
    expect(assessment.normalizedEvLoss).toBeGreaterThanOrEqual(0);
  });

  it("scores preflop decisions from the unified blueprint result", () => {
    const before = newGame(42);
    const action: GameAction = before.legal.canCall
      ? { type: "call" }
      : before.legal.canCheck
        ? { type: "check" }
        : { type: "fold" };
    const assessment = assessHeroDecision(before, action);
    expect(assessment).toMatchObject({
      scored: true,
      facts: {
        strategyVersion: "strategy-v4.0.0",
        strategySource: "strategy-pack-v3",
      },
    });
  });

  it("scores a multiway resolver result and preserves its audit facts", () => {
    const before = newGame(42);
    const result: StrategyResult = {
      actions: [
        { action: "fold", frequency: 0.25, ev: 0, intent: "pot-control" },
        { action: "call", frequency: 0.75, ev: 4, intent: "pot-control" },
      ],
      confidence: 0.58,
      source: "multiway-resolver",
      strategyVersion: "multiway-resolver-v1",
      rangeFacts: { jointSamples: 96, dirtyOuts: 2 },
      explanationFacts: { algorithm: "range-joint-equity+side-pot-ev-v1" },
    };

    const assessment = assessFromStrategy(before, { type: "call" }, result);
    expect(assessment.scored).toBe(true);
    expect(assessment.facts).toMatchObject({
      strategyVersion: "multiway-resolver-v1",
      strategySource: "multiway-resolver",
      jointSamples: 96,
      dirtyOuts: 2,
      algorithm: "range-joint-equity+side-pot-ev-v1",
    });
  });

  it("keeps an old safety-adapter result explicitly unscored", () => {
    const before = newGame(42);
    const result: StrategyResult = {
      actions: [{ action: "check", frequency: 1, ev: 0, intent: "pot-control" }],
      confidence: 0,
      source: "safe-fallback",
      strategyVersion: "legacy-adapter-v1",
      rangeFacts: {},
      explanationFacts: { fallback: "旧历史没有多人范围快照" },
    };

    const assessment = assessFromStrategy(before, { type: "check" }, result);
    expect(assessment.scored).toBe(false);
    expect(assessment.coreRules).toContain("旧版安全策略仅供参考，本次决策不计入能力评分");
  });
});
