import type { GameState } from "../game/game";
import {
  WEAKNESS_DEFINITIONS,
  type DecisionAssessment,
  type TrainingTarget,
  type WeaknessTag,
} from "./types";

export type WeaknessStatus = "collecting" | "clear" | "weakness";
export type WeaknessTrend = "improving" | "stable" | "worsening";

export type WeaknessSummary = {
  tag: WeaknessTag;
  name: string;
  status: WeaknessStatus;
  samples: number;
  recentAccuracy: number;
  recencyWeightedLoss: number;
  errorRate: number;
  confidence: number;
  priority: number;
  trend: WeaknessTrend;
  representativeHandKeys: string[];
};

function relevantTags(assessment: DecisionAssessment): WeaknessTag[] {
  const fromFacts = assessment.facts.relevantTags;
  if (Array.isArray(fromFacts)) return fromFacts as WeaknessTag[];
  return assessment.tags;
}

function trendOf(assessments: DecisionAssessment[]): WeaknessTrend {
  if (assessments.length < 6) return "stable";
  const previous = assessments.slice(-6, -3);
  const recent = assessments.slice(-3);
  const mean = (items: DecisionAssessment[]) =>
    items.reduce((sum, item) => sum + item.normalizedEvLoss, 0) / items.length;
  const previousMean = mean(previous);
  const recentMean = mean(recent);
  if (recentMean < previousMean * 0.8) return "improving";
  if (recentMean > previousMean * 1.2) return "worsening";
  return "stable";
}

export function summarizeWeaknesses(hands: GameState[]): WeaknessSummary[] {
  const indexed = hands.flatMap((hand) =>
    hand.assessments.map((assessment) => ({
      assessment,
      handKey: `${hand.seed}:${hand.handNo}`,
    })),
  );
  return (Object.keys(WEAKNESS_DEFINITIONS) as WeaknessTag[])
    .map((tag): WeaknessSummary => {
      const relevant = indexed.filter(({ assessment }) =>
        relevantTags(assessment).includes(tag),
      );
      const relevantHands = new Set(relevant.map(({ handKey }) => handKey)).size;
      const assessments = relevant.map(({ assessment }) => assessment);
      const samples = assessments.length;
      const errors = assessments.filter((item) => item.severity !== "good");
      const errorRate = samples ? errors.length / samples : 0;
      const weightedTotal = assessments.reduce(
        (sum, item, index) => sum + item.normalizedEvLoss * (index + 1),
        0,
      );
      const weight = (samples * (samples + 1)) / 2;
      const recencyWeightedLoss = weight ? weightedTotal / weight : 0;
      const confidence = Math.min(1, samples / 12);
      const priority = recencyWeightedLoss * errorRate * confidence;
      const recent = assessments.slice(-5);
      const recentAccuracy = recent.length
        ? recent.filter((item) => item.severity === "good").length / recent.length
        : 0;
      const status: WeaknessStatus =
        samples < 5 || relevantHands < 3
          ? "collecting"
          : errorRate >= 0.4 || recencyWeightedLoss > 0.08
            ? "weakness"
            : "clear";
      return {
        tag,
        name: WEAKNESS_DEFINITIONS[tag].name,
        status,
        samples,
        recentAccuracy,
        recencyWeightedLoss,
        errorRate,
        confidence,
        priority,
        trend: trendOf(assessments),
        representativeHandKeys: relevant
          .filter(({ assessment }) => assessment.severity !== "good")
          .sort(
            (a, b) =>
              b.assessment.normalizedEvLoss - a.assessment.normalizedEvLoss,
          )
          .slice(0, 3)
          .map(({ handKey }) => handKey),
      };
    })
    .sort((first, second) => second.priority - first.priority);
}

export function chooseAutomaticTarget(
  summaries: WeaknessSummary[],
): TrainingTarget {
  const weakness = summaries.find((summary) => summary.status === "weakness");
  return weakness
    ? { mode: "automatic", tag: weakness.tag }
    : { mode: "none" };
}
