import { describe, expect, it } from "vitest";
import type { CoachDecisionFacts, DeepCandidateReview } from "./types";
import { buildCoachNarrative } from "./coachNarrative";

const facts: Omit<CoachDecisionFacts, "narrative" | "recommendationReasons" | "changeConditions"> = {
  madeHandLabel: "顶对中等踢脚",
  heroRangePercentile: 0.68,
  equityVsFullRange: 0.367,
  equityVsContinueRange: 0.24,
  opponentBuckets: [
    { kind: "strong-made", probability: 0.18 },
    { kind: "top-pair", probability: 0.21 },
    { kind: "medium-made", probability: 0.16 },
    { kind: "strong-draw", probability: 0.19 },
    { kind: "weak-draw", probability: 0.09 },
    { kind: "air", probability: 0.17 },
  ],
  opponentResponses: [
    { action: "fold", probability: 0.32 },
    { action: "call", probability: 0.58 },
    { action: "raise", probability: 0.1 },
  ],
  atLeastOnePlayerBehindContinues: 0.22,
  runoutSummary: [{ label: "升级为两对或三条", probability: 0.11, mutuallyExclusive: false }],
  confidence: 0.7,
};

const candidates: DeepCandidateReview[] = [
  { action: { type: "fold" }, ev: 0, frequency: 0.1, intent: "pot-control" },
  { action: { type: "call" }, ev: 3.5, frequency: 0.7, intent: "pot-control" },
  { action: { type: "raise", to: 40 }, ev: 2.1, frequency: 0.2, intent: "protection" },
];

describe("coach narrative", () => {
  it("explains strength, range, price, players behind, and the recommended action", () => {
    const result = buildCoachNarrative({
      facts,
      requiredEquity: 0.188,
      playersBehind: 2,
      street: "flop",
      recommended: { type: "call" },
      candidates,
    });
    expect(result.narrative).toContain("顶对中等踢脚");
    expect(result.narrative).toContain("两对及以上约 18%");
    expect(result.narrative).toContain("预计权益 36.7%");
    expect(result.narrative).toContain("只需要约 18.8%");
    expect(result.narrative).toContain("身后还有 2 人");
    expect(result.recommendationReasons.length).toBeGreaterThanOrEqual(3);
    expect(result.changeConditions.length).toBeGreaterThan(0);
  });

  it("does not describe future outs on the river and is deterministic", () => {
    const input = {
      facts,
      requiredEquity: 0.25,
      playersBehind: 0,
      street: "river" as const,
      recommended: { type: "call" } as const,
      candidates,
    };
    const first = buildCoachNarrative(input);
    expect(first).toEqual(buildCoachNarrative(structuredClone(input)));
    expect(first.narrative).not.toContain("后续牌");
  });

  it("describes an already-made set as keeping or upgrading, not hitting a set", () => {
    const result = buildCoachNarrative({
      facts: {
        ...facts,
        madeHandLabel: "暗三条",
        runoutSummary: [
          { label: "至少保持三条", probability: 1, mutuallyExclusive: false },
          { label: "仍为三条", probability: 0.666, mutuallyExclusive: true },
          { label: "升级为葫芦", probability: 0.291, mutuallyExclusive: true },
        ],
      },
      requiredEquity: 0,
      playersBehind: 0,
      street: "flop",
      recommended: { type: "check" },
      candidates,
    });
    expect(result.narrative).toContain("至少保持三条 100.0%");
    expect(result.narrative).not.toContain("击中三条");
  });
});
