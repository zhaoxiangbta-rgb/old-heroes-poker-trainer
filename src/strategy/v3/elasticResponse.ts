import type { Card } from "../../engine/cards";
import type { WeightedCombo } from "../../engine/ranges";
import type { HandPlayerProfile } from "../../policy/playerProfiles";
import type { PostflopSituation } from "../types";
import { segmentOpponentRange, type RangeSegmentV3 } from "./rangeSegments";

export type ElasticResponseInputV3 = {
  heroHole: [Card, Card];
  board: Card[];
  opponentRange: readonly WeightedCombo[];
  situation: PostflopSituation;
  potFraction: number;
  playerProfile?: HandPlayerProfile;
};

export type ElasticResponseV3 = {
  fold: number;
  worseMadeCall: number;
  drawCall: number;
  betterCall: number;
  valueRaise: number;
  bluffRaise: number;
  equityWhenContinued: number;
  segments: RangeSegmentV3[];
  profileShift: number;
};

type ComboMix = Omit<ElasticResponseV3, "equityWhenContinued" | "segments" | "profileShift">;

function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function profileShift(profile?: HandPlayerProfile) {
  if (!profile) return { loose: 0, aggressive: 0, magnitude: 0 };
  const loose = clamp((profile.effective.looseness - 50) / 250, -0.15, 0.15);
  const aggressive = clamp((profile.effective.aggression - 50) / 250, -0.15, 0.15);
  return { loose, aggressive, magnitude: Math.max(Math.abs(loose), Math.abs(aggressive)) };
}

function mixFor(
  segment: "better-made" | "equal" | "worse-made" | "draw" | "air",
  category: number,
  size: number,
  street: PostflopSituation["street"],
  loose: number,
  aggressive: number,
): ComboMix {
  const empty = { fold: 0, worseMadeCall: 0, drawCall: 0, betterCall: 0, valueRaise: 0, bluffRaise: 0 };
  if (segment === "better-made") {
    const fold = clamp(0.008 + Math.max(0, size - 1) * 0.012, 0.004, 0.035);
    const valueRaise = clamp(0.13 + category * 0.045 + aggressive, 0.08, 0.62);
    return { ...empty, fold, valueRaise, betterCall: 1 - fold - valueRaise };
  }
  if (segment === "equal") {
    const fold = clamp(0.08 + size * 0.18 - loose, 0.03, 0.55);
    const valueRaise = clamp(0.025 + aggressive * 0.25, 0.005, 0.08);
    return { ...empty, fold, valueRaise, betterCall: 1 - fold - valueRaise };
  }
  if (segment === "worse-made") {
    const continueWeight = clamp(0.86 - size * 0.34 + loose, 0.08, 0.86);
    const bluffRaise = clamp(0.018 + aggressive * 0.22, 0.003, 0.09);
    return {
      ...empty,
      fold: 1 - continueWeight,
      bluffRaise: Math.min(bluffRaise, continueWeight * 0.25),
      worseMadeCall: continueWeight - Math.min(bluffRaise, continueWeight * 0.25),
    };
  }
  if (segment === "draw" && street !== "river") {
    const continueWeight = clamp(0.74 - size * 0.25 + loose, 0.07, 0.78);
    const bluffRaise = clamp(0.055 + aggressive * 0.3, 0.01, 0.16);
    return {
      ...empty,
      fold: 1 - continueWeight,
      bluffRaise: Math.min(bluffRaise, continueWeight * 0.4),
      drawCall: continueWeight - Math.min(bluffRaise, continueWeight * 0.4),
    };
  }
  const bluffRaise = clamp(0.018 + aggressive * 0.2 - size * 0.004, 0.003, 0.07);
  return { ...empty, fold: 1 - bluffRaise, bluffRaise };
}

export function estimateElasticResponse(input: ElasticResponseInputV3): ElasticResponseV3 {
  const segmented = segmentOpponentRange(input);
  if (!segmented.combos.length) {
    return {
      fold: 0.5,
      worseMadeCall: 0.15,
      drawCall: 0.1,
      betterCall: 0.18,
      valueRaise: 0.05,
      bluffRaise: 0.02,
      equityWhenContinued: 0.5,
      segments: [],
      profileShift: 0,
    };
  }
  const shift = profileShift(input.playerProfile);
  const result: ComboMix = {
    fold: 0,
    worseMadeCall: 0,
    drawCall: 0,
    betterCall: 0,
    valueRaise: 0,
    bluffRaise: 0,
  };
  let continuedShare = 0;
  let continuedWeight = 0;
  for (const combo of segmented.combos) {
    const mix = mixFor(
      combo.segment,
      combo.category,
      Math.max(0, input.potFraction),
      input.situation.street,
      shift.loose,
      shift.aggressive,
    );
    const weight = combo.combo.weight;
    for (const key of Object.keys(result) as Array<keyof ComboMix>) result[key] += mix[key] * weight;
    const continuation = 1 - mix.fold;
    continuedShare += combo.heroShare * continuation * weight;
    continuedWeight += continuation * weight;
  }
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  for (const key of Object.keys(result) as Array<keyof ComboMix>) result[key] /= total;
  return {
    ...result,
    equityWhenContinued: continuedWeight > 0 ? clamp(continuedShare / continuedWeight) : 0.5,
    segments: segmented.segments,
    profileShift: shift.magnitude,
  };
}
