import { describe, expect, it } from "vitest";
import { newGame, type GameAction } from "../game/game";
import type { PolicyAction, PolicyCandidate } from "../policy/types";
import {
  assessHeroDecision,
  weaknessPredicates,
  type AssessmentContext,
} from "./assessment";
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
});
