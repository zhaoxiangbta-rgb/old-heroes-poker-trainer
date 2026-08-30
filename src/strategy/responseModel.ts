import type { Card } from "../engine/cards";
import { bestHand, compareHands } from "../engine/evaluator";
import type { WeightedCombo } from "../engine/ranges";
import type { HandPlayerProfile } from "../policy/playerProfiles";
import { extractHandFeatures } from "../policy/handFeatures";
import type { RangeAdvantageFacts } from "./rangeAdvantage";
import type { PostflopSituation } from "./types";

export type ScaleResponseFacts = {
  toAmount: number;
  potFraction: number;
  fold: number;
  worseCall: number;
  betterContinue: number;
  raise: number;
  equityWhenContinued: number;
  confidence: number;
};

export type ScaleResponseInput = {
  heroHole: [Card, Card];
  board: Card[];
  opponentRange: readonly WeightedCombo[];
  situation: PostflopSituation;
  rangeAdvantage: RangeAdvantageFacts;
  pot: number;
  toAmount: number;
  potFraction: number;
  playerProfile?: HandPlayerProfile;
};

function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function profileValues(profile?: HandPlayerProfile) {
  return {
    loose: ((profile?.effective.looseness ?? 50) - 50) / 50,
    aggressive: ((profile?.effective.aggression ?? 50) - 50) / 50,
    bluff: ((profile?.effective.bluff ?? 35) - 35) / 65,
  };
}

function comboResponse(
  combo: WeightedCombo,
  input: ScaleResponseInput,
): { fold: number; worseCall: number; betterContinue: number; raise: number; heroShare: number } {
  const hero = bestHand([...input.heroHole, ...input.board]);
  const opponent = bestHand([...combo.cards, ...input.board]);
  const comparison = compareHands(opponent, hero);
  const features = extractHandFeatures(combo.cards, input.board);
  const size = Math.max(0, input.potFraction);
  const profile = profileValues(input.playerProfile);
  const riverStrength = input.situation.street === "river" ? 0.05 : 0;

  if (comparison > 0) {
    const raise = clamp(
      0.16 + features.category * 0.045 + profile.aggressive * 0.08 + riverStrength,
      0.08,
      0.62,
    );
    const fold = clamp(0.012 + Math.max(0, size - 1) * 0.008, 0.005, 0.04);
    return { fold, worseCall: 0, betterContinue: 1 - fold - raise, raise, heroShare: 0 };
  }

  if (comparison === 0) {
    const raise = clamp(0.025 + profile.aggressive * 0.02, 0.005, 0.07);
    const keep = clamp(0.76 - size * 0.2 + profile.loose * 0.08, 0.28, 0.82);
    return {
      fold: 1 - keep,
      worseCall: 0,
      betterContinue: keep - raise,
      raise,
      heroShare: 0.5,
    };
  }

  if (features.category >= 1) {
    const raise = clamp(0.025 + profile.aggressive * 0.035, 0.003, 0.09);
    const keep = clamp(0.76 - size * 0.3 + profile.loose * 0.13, 0.08, 0.82);
    return {
      fold: 1 - keep,
      worseCall: Math.max(0, keep - raise),
      betterContinue: 0,
      raise,
      heroShare: 1,
    };
  }

  if (features.cleanOutEstimate >= 4 && input.situation.street !== "river") {
    const raise = clamp(
      0.04 + profile.aggressive * 0.045 + features.nutBlockers * 0.025,
      0.005,
      0.14,
    );
    const keep = clamp(0.62 - size * 0.24 + profile.loose * 0.1, 0.06, 0.72);
    return {
      fold: 1 - keep,
      worseCall: Math.max(0, keep - raise),
      betterContinue: 0,
      raise,
      heroShare: clamp(1 - features.cleanOutEstimate / 46),
    };
  }

  const raise = clamp(0.012 + profile.aggressive * 0.018 + profile.bluff * 0.025, 0, 0.07);
  return { fold: 1 - raise, worseCall: 0, betterContinue: 0, raise, heroShare: 1 };
}

export function estimateScaleResponse(input: ScaleResponseInput): ScaleResponseFacts {
  const known = [...input.heroHole, ...input.board];
  const valid = input.opponentRange.filter((combo) =>
    combo.weight > 0 && combo.cards[0] !== combo.cards[1] &&
    combo.cards.every((card) => !known.includes(card)));
  if (!valid.length) {
    return {
      toAmount: input.toAmount,
      potFraction: input.potFraction,
      fold: 0.5,
      worseCall: 0.25,
      betterContinue: 0.2,
      raise: 0.05,
      equityWhenContinued: input.rangeAdvantage.hero.equityRealization,
      confidence: 0,
    };
  }
  const totalWeight = valid.reduce((sum, combo) => sum + combo.weight, 0);
  let fold = 0;
  let worseCall = 0;
  let betterContinue = 0;
  let raise = 0;
  let continuedShare = 0;
  let continuedWeight = 0;
  for (const combo of valid) {
    const response = comboResponse(combo, input);
    const weight = combo.weight / totalWeight;
    fold += response.fold * weight;
    worseCall += response.worseCall * weight;
    betterContinue += response.betterContinue * weight;
    raise += response.raise * weight;
    const comboContinue = response.worseCall + response.betterContinue + response.raise;
    continuedShare += response.heroShare * comboContinue * weight;
    continuedWeight += comboContinue * weight;
  }
  const sum = fold + worseCall + betterContinue + raise;
  fold /= sum;
  worseCall /= sum;
  betterContinue /= sum;
  raise /= sum;
  return {
    toAmount: input.toAmount,
    potFraction: input.potFraction,
    fold,
    worseCall,
    betterContinue,
    raise,
    equityWhenContinued: continuedWeight > 0
      ? clamp(continuedShare / continuedWeight)
      : input.rangeAdvantage.hero.equityRealization,
    confidence: clamp(input.rangeAdvantage.confidence * Math.min(1, valid.length / 12)),
  };
}
