import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import type { WeightedCombo } from "../engine/ranges";
import type { PostflopSituation } from "./types";
import { calculateRangeAdvantage } from "./rangeAdvantage";

function combo(cards: [Card, Card], weight = 1): WeightedCombo {
  return { cards, weight, label: cards.join(""), history: [] };
}

const situation: PostflopSituation = {
  version: 2,
  street: "flop",
  headsUp: true,
  inPosition: true,
  initiative: true,
  lastToAct: true,
  line: "cbet",
  potType: "srp",
  spr: 6,
  playersBehind: 0,
  textureCluster: "pftex1:flop:premium:unpaired:two-tone:disconnected",
  rangeShiftCard: false,
  nodeId: "fixture",
};

const heroRange = [
  combo(["As", "Ks"], 2),
  combo(["Ah", "Qh"]),
  combo(["8h", "7h"]),
  combo(["5c", "4c"]),
];

const villainRange = [
  combo(["Ac", "Jc"]),
  combo(["7d", "7s"]),
  combo(["Kh", "Qh"]),
  combo(["6c", "5c"]),
];

describe("postflop range advantage", () => {
  it("builds mutually exclusive densities for both ranges", () => {
    const facts = calculateRangeAdvantage({
      heroHole: ["As", "Ks"],
      board: ["Ad", "9h", "2h"],
      heroRange,
      villainRange,
      situation,
      sampleBudget: 32,
    });

    expect(facts.hero.strongDensity + facts.hero.mediumDensity +
      facts.hero.drawDensity + facts.hero.airDensity).toBeCloseTo(1, 10);
    expect(facts.villain.strongDensity + facts.villain.mediumDensity +
      facts.villain.drawDensity + facts.villain.airDensity).toBeCloseTo(1, 10);
    expect(facts.confidence).toBeGreaterThan(0);
    expect(facts.samples).toBeLessThanOrEqual(32);
  });

  it("gives the same raw ranges better realization in position than out of position", () => {
    const input = {
      heroHole: ["As", "Ks"] as [Card, Card],
      board: ["Ad", "9h", "2h"] as Card[],
      heroRange,
      villainRange,
      sampleBudget: 32,
    };
    const ip = calculateRangeAdvantage({ ...input, situation });
    const oop = calculateRangeAdvantage({
      ...input,
      situation: { ...situation, inPosition: false, lastToAct: false },
    });

    expect(ip.hero.equityRealization).toBeGreaterThan(oop.hero.equityRealization);
    expect(calculateRangeAdvantage({ ...input, situation })).toEqual(ip);
  });

  it("returns an explicit low-confidence result for missing ranges without NaN", () => {
    const facts = calculateRangeAdvantage({
      heroHole: ["As", "Ks"],
      board: ["Ad", "9h", "2h"],
      heroRange: [],
      villainRange: [],
      situation,
      sampleBudget: 32,
    });

    expect(facts.confidence).toBe(0);
    expect(JSON.stringify(facts)).not.toContain("null");
    expect(Object.values(facts.hero).every(Number.isFinite)).toBe(true);
  });
});
