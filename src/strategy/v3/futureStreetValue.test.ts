import { describe, expect, it } from "vitest";
import { profileCombo } from "./comboProfile";
import { evaluateCandidateV3 } from "./futureStreetValue";

const response = {
  fold: 0.38,
  worseMadeCall: 0.3,
  drawCall: 0.12,
  betterCall: 0.12,
  valueRaise: 0.05,
  bluffRaise: 0.03,
  equityWhenContinued: 0.72,
  segments: [],
  profileShift: 0,
};

describe("V3 deterministic future-street value", () => {
  it("sums the five EV components deterministically", () => {
    const input = {
      pot: 40,
      investment: 20,
      potFraction: 0.5,
      streetsRemaining: 2,
      inPosition: true,
      response,
      heroProfile: profileCombo(["As", "2s"], ["Ah", "Ac", "7d"]),
    };
    const value = evaluateCandidateV3(input);
    expect(value.total).toBeCloseTo(value.immediateFold + value.worseContinue -
      value.betterContinueCost + value.futureStreet - value.realizationPenalty, 10);
    expect(evaluateCandidateV3(input)).toEqual(value);
  });
});
