import type { Card } from "../engine/cards";
import type { WeightedCombo } from "../engine/ranges";
import { extractHandFeatures } from "../policy/handFeatures";
import type { PostflopSituation } from "./types";

export type RangeSideFacts = {
  equity: number;
  nutDensity: number;
  strongDensity: number;
  mediumDensity: number;
  drawDensity: number;
  airDensity: number;
  equityRealization: number;
};

export type RangeAdvantageFacts = {
  hero: RangeSideFacts;
  villain: RangeSideFacts;
  equityAdvantage: number;
  nutAdvantage: number;
  confidence: number;
  samples: number;
};

export type RangeAdvantageInput = {
  heroHole: [Card, Card];
  board: Card[];
  heroRange: readonly WeightedCombo[];
  villainRange: readonly WeightedCombo[];
  situation: PostflopSituation;
  sampleBudget: number;
};

type RangeClass = "strong" | "medium" | "draw" | "air";

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function validRange(range: readonly WeightedCombo[], blocked: readonly Card[]) {
  return range.filter((combo) => combo.weight > 0 && combo.cards[0] !== combo.cards[1] &&
    combo.cards.every((card) => !blocked.includes(card)));
}

function representatives(range: readonly WeightedCombo[], limit: number) {
  if (range.length <= limit) return [...range];
  const total = range.reduce((sum, combo) => sum + combo.weight, 0);
  const result: WeightedCombo[] = [];
  let cursor = 0;
  let cumulative = range[0].weight;
  for (let index = 0; index < limit; index += 1) {
    const target = (index + 0.5) * total / limit;
    while (cursor < range.length - 1 && cumulative < target) {
      cursor += 1;
      cumulative += range[cursor].weight;
    }
    result.push({ ...range[cursor], weight: total / limit });
  }
  return result;
}

function classify(combo: WeightedCombo, board: Card[]) {
  const features = extractHandFeatures(combo.cards, board);
  const kind: RangeClass = features.category >= 2
    ? "strong"
    : features.category >= 1
      ? "medium"
      : features.cleanOutEstimate >= 4
        ? "draw"
        : "air";
  const equity = clamp(
    features.category / 8 * 0.78 +
    features.kicker * 0.14 +
    Math.min(12, features.cleanOutEstimate) / 12 * 0.08,
  );
  const nutLike = features.category >= 4 ||
    (features.category >= 3 && features.nutBlockers > 0);
  return { kind, equity, nutLike };
}

function emptySide(): RangeSideFacts {
  return {
    equity: 0.5,
    nutDensity: 0,
    strongDensity: 0,
    mediumDensity: 0,
    drawDensity: 0,
    airDensity: 1,
    equityRealization: 0.5,
  };
}

function sideFacts(
  range: readonly WeightedCombo[],
  board: Card[],
  realizationAdjustment: number,
): RangeSideFacts {
  if (!range.length) return emptySide();
  const total = range.reduce((sum, combo) => sum + combo.weight, 0);
  const densities: Record<RangeClass, number> = { strong: 0, medium: 0, draw: 0, air: 0 };
  let equity = 0;
  let nutDensity = 0;
  for (const combo of range) {
    const fact = classify(combo, board);
    const share = combo.weight / total;
    densities[fact.kind] += share;
    equity += fact.equity * share;
    if (fact.nutLike) nutDensity += share;
  }
  return {
    equity,
    nutDensity,
    strongDensity: densities.strong,
    mediumDensity: densities.medium,
    drawDensity: densities.draw,
    airDensity: densities.air,
    equityRealization: clamp(equity + realizationAdjustment),
  };
}

export function calculateRangeAdvantage(input: RangeAdvantageInput): RangeAdvantageFacts {
  const budget = Math.max(2, Math.floor(input.sampleBudget));
  const sideBudget = Math.max(1, Math.floor(budget / 2));
  const heroAvailable = validRange(input.heroRange, input.board);
  const villainAvailable = validRange(input.villainRange, [...input.board, ...input.heroHole]);
  const heroRange = representatives(heroAvailable, sideBudget);
  const villainRange = representatives(villainAvailable, sideBudget);
  const positional = input.situation.inPosition ? 0.05 : -0.05;
  const deepOopPenalty = !input.situation.inPosition && input.situation.spr >= 8 ? -0.01 : 0;
  const multiwayPenalty = input.situation.headsUp ? 0 : -0.03;
  const hero = sideFacts(heroRange, input.board, positional + deepOopPenalty + multiwayPenalty);
  const villain = sideFacts(villainRange, input.board, -positional + multiwayPenalty);
  const samples = heroRange.length + villainRange.length;
  const availability = heroAvailable.length && villainAvailable.length ? 1 : 0;
  const coverage = availability
    ? Math.min(1, samples / Math.max(2, Math.min(budget, heroAvailable.length + villainAvailable.length)))
    : 0;
  return {
    hero,
    villain,
    equityAdvantage: hero.equity - villain.equity,
    nutAdvantage: hero.nutDensity - villain.nutDensity,
    confidence: coverage,
    samples,
  };
}
