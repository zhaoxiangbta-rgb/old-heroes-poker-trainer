import { describe, expect, it } from "vitest";
import type { HandPlayerProfile } from "../policy/playerProfiles";
import { applyBoundedDeviation } from "./profileDeviation";
import type { StrategyResult } from "./types";

function result(): StrategyResult {
  return {
    actions: [
      { action: "fold", frequency: 0.5, ev: 0, intent: "pot-control" },
      { action: "call", frequency: 0.3, ev: 0.1, intent: "pot-control" },
      { action: "raise", toAmount: 10, frequency: 0.2, ev: 0.15, intent: "bluff" },
    ],
    confidence: 0.76,
    source: "blueprint",
    nodeId: "pf1:test",
    strategyVersion: "preflop-abstract-v1",
    rangeFacts: {},
    explanationFacts: {},
  };
}

function player(overrides: Partial<HandPlayerProfile["effective"]>): HandPlayerProfile {
  return {
    version: 1,
    playerId: "friend-01",
    displayName: "测试玩家",
    archetype: "balanced",
    looseness: 50,
    aggression: 50,
    bluff: 35,
    handMood: { loosenessDelta: 0, aggressionDelta: 0, bluffDelta: 0 },
    effective: { looseness: 50, aggression: 50, bluff: 35, ...overrides },
  };
}

describe("bounded preflop profile deviation", () => {
  it("keeps balanced strategy unchanged without an individual profile", () => {
    const adjusted = applyBoundedDeviation(result(), "balanced");
    expect(adjusted.actions).toEqual(result().actions);
    expect(adjusted.baselineActions).toEqual(result().actions);
    expect(adjusted.adjustment).toMatchObject({ applied: false, maxShift: 0 });
  });

  it("widens friend-game calls and loose-wild aggression", () => {
    const baseline = result();
    const friends = applyBoundedDeviation(baseline, "friends");
    const wild = applyBoundedDeviation(baseline, "loose-wild");
    expect(friends.actions.find((item) => item.action === "call")!.frequency).toBeGreaterThan(0.3);
    expect(wild.actions.find((item) => item.action === "raise")!.frequency).toBeGreaterThan(0.2);
  });

  it("caps every action shift at 15 percentage points and stays normalized", () => {
    const baseline = result();
    const shifted = applyBoundedDeviation(
      baseline,
      "loose-wild",
      player({ looseness: 100, aggression: 100, bluff: 100 }),
    );
    for (const action of shifted.actions) {
      const original = baseline.actions.find((item) => item.action === action.action)!;
      expect(Math.abs(action.frequency - original.frequency)).toBeLessThanOrEqual(0.1500001);
    }
    expect(shifted.actions.reduce((sum, item) => sum + item.frequency, 0)).toBeCloseTo(1, 10);
    expect(shifted.actions.map((item) => item.action)).toEqual(baseline.actions.map((item) => item.action));
    expect(shifted.explanationFacts.profileDeviationMax).toBeLessThanOrEqual(0.15);
    expect(shifted.baselineActions).toEqual(baseline.actions);
    expect(shifted.adjustment).toMatchObject({
      applied: true,
      tableProfileId: "loose-wild",
      playerArchetype: "balanced",
    });
  });

  it("never promotes a negative-EV deviation above every non-negative baseline action", () => {
    const baseline = result();
    baseline.actions = [
      { action: "fold", frequency: 0.38, ev: 0, intent: "pot-control" },
      { action: "call", frequency: 0.36, ev: -4, intent: "pot-control" },
      { action: "raise", toAmount: 10, frequency: 0.26, ev: 0.2, intent: "value" },
    ];
    const shifted = applyBoundedDeviation(
      baseline,
      "friends",
      player({ looseness: 100, aggression: 5, bluff: 0 }),
    );
    const top = [...shifted.actions].sort((first, second) => second.frequency - first.frequency)[0];
    expect(top.ev).toBeGreaterThanOrEqual(0);
  });
});
