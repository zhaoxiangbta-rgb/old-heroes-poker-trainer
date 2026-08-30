import type { Card } from "../../engine/cards";
import { bestHand, compareHands } from "../../engine/evaluator";
import type { WeightedCombo } from "../../engine/ranges";
import { extractHandFeatures } from "../../policy/handFeatures";

export type RangeSegmentId = "better-made" | "equal" | "worse-made" | "draw" | "air";

export type SegmentedComboV3 = {
  comboId: string;
  combo: WeightedCombo;
  segment: RangeSegmentId;
  category: number;
  drawOuts: number;
  heroShare: number;
};

export type RangeSegmentV3 = {
  id: RangeSegmentId;
  comboIds: string[];
  weight: number;
};

export type SegmentedRangeV3 = {
  combos: SegmentedComboV3[];
  segments: RangeSegmentV3[];
  totalWeight: number;
};

export type SegmentOpponentRangeInput = {
  heroHole: [Card, Card];
  board: Card[];
  opponentRange: readonly WeightedCombo[];
};

function comboId(combo: WeightedCombo) {
  return combo.cards.join("");
}

export function segmentOpponentRange(input: SegmentOpponentRangeInput): SegmentedRangeV3 {
  const known = [...input.heroHole, ...input.board];
  const valid = input.opponentRange.filter((combo) =>
    combo.weight > 0 && combo.cards[0] !== combo.cards[1] &&
    combo.cards.every((card) => !known.includes(card)));
  const totalWeight = valid.reduce((sum, combo) => sum + combo.weight, 0);
  const hero = bestHand([...input.heroHole, ...input.board]);
  const combos = valid.map((combo): SegmentedComboV3 => {
    const opponent = bestHand([...combo.cards, ...input.board]);
    const comparison = compareHands(opponent, hero);
    const features = extractHandFeatures(combo.cards, input.board);
    const segment: RangeSegmentId = comparison > 0
      ? "better-made"
      : comparison === 0
        ? "equal"
        : features.category >= 1
          ? "worse-made"
          : features.cleanOutEstimate >= 4
            ? "draw"
            : "air";
    return {
      comboId: comboId(combo),
      combo: { ...combo, weight: combo.weight / Math.max(Number.EPSILON, totalWeight) },
      segment,
      category: features.category,
      drawOuts: features.cleanOutEstimate,
      heroShare: comparison < 0 ? 1 : comparison === 0 ? 0.5 : 0,
    };
  });
  const ids: RangeSegmentId[] = ["better-made", "equal", "worse-made", "draw", "air"];
  const segments = ids.map((id): RangeSegmentV3 => {
    const members = combos.filter((combo) => combo.segment === id);
    return {
      id,
      comboIds: members.map((combo) => combo.comboId),
      weight: members.reduce((sum, combo) => sum + combo.combo.weight, 0),
    };
  }).filter((segment) => segment.comboIds.length > 0);
  return { combos, segments, totalWeight };
}
