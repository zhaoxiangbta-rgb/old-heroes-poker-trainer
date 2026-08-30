import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import type { WeightedCombo } from "../engine/ranges";
import type { HandPlayerProfile } from "../policy/playerProfiles";
import type { RangeAdvantageFacts } from "./rangeAdvantage";
import { estimateScaleResponse } from "./responseModel";
import type { PostflopSituation } from "./types";

function combo(cards: [Card, Card], weight = 1): WeightedCombo {
  return { cards, weight, label: cards.join(""), history: [] };
}

const situation: PostflopSituation = {
  version: 2, street: "river", headsUp: true, inPosition: true, initiative: true,
  lastToAct: true, line: "checked-to", potType: "srp", spr: 4, playersBehind: 0,
  textureCluster: "river", rangeShiftCard: false, nodeId: "river-fixture",
};

const advantage: RangeAdvantageFacts = {
  hero: { equity: 0.62, nutDensity: 0.12, strongDensity: 0.25, mediumDensity: 0.35, drawDensity: 0, airDensity: 0.4, equityRealization: 0.67 },
  villain: { equity: 0.48, nutDensity: 0.08, strongDensity: 0.2, mediumDensity: 0.4, drawDensity: 0, airDensity: 0.4, equityRealization: 0.43 },
  equityAdvantage: 0.14, nutAdvantage: 0.04, confidence: 0.8, samples: 32,
};

const opponentRange = [
  combo(["Ad", "Qd"], 2),
  combo(["9c", "9d"]),
  combo(["Kd", "Qd"], 2),
  combo(["7c", "6c"], 2),
  combo(["4c", "3c"]),
];

function profile(archetype: HandPlayerProfile["archetype"], looseness: number, aggression: number): HandPlayerProfile {
  return {
    version: 1,
    playerId: archetype,
    displayName: archetype,
    archetype,
    looseness,
    aggression,
    bluff: 25,
    handMood: { loosenessDelta: 0, aggressionDelta: 0, bluffDelta: 0 },
    effective: { looseness, aggression, bluff: 25 },
  };
}

function response(potFraction: number, playerProfile?: HandPlayerProfile) {
  return estimateScaleResponse({
    heroHole: ["Ah", "Kh"],
    board: ["As", "8d", "5c", "2h", "2s"],
    opponentRange,
    situation,
    rangeAdvantage: advantage,
    pot: 100,
    toAmount: Math.round(100 * potFraction),
    potFraction,
    playerProfile,
  });
}

describe("scale-aware response model", () => {
  it("folds more and calls worse less as the size grows without making an overbet automatic", () => {
    const half = response(0.5);
    const pot = response(1);
    const overbet = response(1.5);

    expect(pot.fold).toBeGreaterThan(half.fold);
    expect(pot.worseCall).toBeLessThan(half.worseCall);
    expect(overbet.fold).toBeLessThan(0.98);
    expect(overbet.fold + overbet.worseCall + overbet.betterContinue + overbet.raise)
      .toBeCloseTo(1, 10);
  });

  it("keeps strong ranges continuing more than weak ranges on the river", () => {
    const strong = estimateScaleResponse({
      heroHole: ["Kh", "Qh"],
      board: ["As", "9d", "5c", "2h", "2s"],
      opponentRange: [combo(["Ah", "Ad"]), combo(["9c", "9s"])],
      situation,
      rangeAdvantage: advantage,
      pot: 100,
      toAmount: 100,
      potFraction: 1,
    });
    const weak = estimateScaleResponse({
      heroHole: ["Kh", "Qh"],
      board: ["As", "9d", "5c", "2h", "2s"],
      opponentRange: [combo(["8c", "7c"]), combo(["6d", "4d"])],
      situation,
      rangeAdvantage: advantage,
      pot: 100,
      toAmount: 100,
      potFraction: 1,
    });

    expect(strong.betterContinue + strong.raise).toBeGreaterThan(
      weak.betterContinue + weak.raise,
    );
  });

  it("lets a loose-passive player call worse more and a tight-aggressive player raise more", () => {
    const loosePassive = response(0.67, profile("loose-passive", 85, 25));
    const tightAggressive = response(0.67, profile("tight-aggressive", 30, 85));

    expect(loosePassive.worseCall).toBeGreaterThan(tightAggressive.worseCall);
    expect(tightAggressive.raise).toBeGreaterThan(loosePassive.raise);
  });
});
