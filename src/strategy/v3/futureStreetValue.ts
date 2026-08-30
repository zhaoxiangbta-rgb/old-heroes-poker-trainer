import type { ComboProfileV3 } from "../types";
import type { ElasticResponseV3 } from "./elasticResponse";

export type FutureStreetValueInput = {
  pot: number;
  investment: number;
  potFraction: number;
  streetsRemaining: number;
  inPosition: boolean;
  response: ElasticResponseV3;
  heroProfile: ComboProfileV3;
};

export type MultiStreetActionValue = {
  immediateFold: number;
  worseContinue: number;
  betterContinueCost: number;
  futureStreet: number;
  realizationPenalty: number;
  total: number;
};

export function evaluateCandidateV3(input: FutureStreetValueInput): MultiStreetActionValue {
  const response = input.response;
  const worseProbability = response.worseMadeCall + response.drawCall;
  const betterProbability = response.betterCall + response.valueRaise;
  const continuedPot = input.pot + input.investment * 2;
  const immediateFold = response.fold * input.pot;
  const worseContinue = worseProbability *
    (response.equityWhenContinued * continuedPot - input.investment);
  const betterContinueCost = betterProbability * input.investment *
    (1.05 - response.equityWhenContinued * 0.45) +
    response.valueRaise * input.investment * 0.35;
  const retainedWorseRange = worseProbability * (1 - Math.min(1, input.potFraction) * 0.35);
  const futureStreet = input.streetsRemaining * input.pot *
    (retainedWorseRange * (input.heroProfile.showdownTier === "strong" ||
      input.heroProfile.showdownTier === "near-nuts" || input.heroProfile.showdownTier === "nuts" ? 0.16 : 0.07) -
      input.heroProfile.futureVulnerability * 0.035);
  const positionPenalty = input.inPosition ? 0 : input.investment * 0.08;
  const sizingPenalty = Math.max(0, input.potFraction - 1) * input.investment * 0.08;
  const realizationPenalty = positionPenalty + sizingPenalty +
    input.heroProfile.counterfeitRisk * input.investment * 0.03;
  return {
    immediateFold,
    worseContinue,
    betterContinueCost,
    futureStreet,
    realizationPenalty,
    total: immediateFold + worseContinue - betterContinueCost + futureStreet - realizationPenalty,
  };
}
