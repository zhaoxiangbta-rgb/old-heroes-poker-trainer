import { describe, expect, it } from "vitest";
import type { PolicyDecision } from "../policy/types";
import { adaptLegacyDecision } from "./legacyAdapter";
import type { StrategyRequest } from "./types";

const request = {
  state: {
    schemaVersion: 1,
    pot: 20,
    currentBet: 0,
    legal: { canFold: false, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 7, maxRaiseTo: 100 },
    players: [{ seat: 0, stack: 100, streetBet: 0 }],
    actingSeat: 0,
  },
  ranges: { version: 1, lastActionIndex: -1, bySeat: {} },
  deadlineMs: 250,
} as StrategyRequest;

describe("legacy strategy adapter", () => {
  it("preserves candidate frequencies, EVs, sizes, and intents", () => {
    const decision: PolicyDecision = {
      action: { type: "raise", to: 10 },
      candidates: [
        { action: { type: "check" }, label: "过牌", ev: 2, probability: 0.4, intent: "pot-control" },
        { action: { type: "raise", to: 10 }, label: "下注", ev: 3, probability: 0.6, intent: "value" },
      ],
      facts: { strength: 0.7, equity: 0.65, requiredEquity: 0, spr: 5, rangeCombos: 100, sampled: 0.4, elapsedMs: 1 },
    };
    expect(adaptLegacyDecision(decision, request)).toMatchObject({
      actions: [
        { action: "check", frequency: 0.4, ev: 2, intent: "pot-control" },
        { action: "bet", toAmount: 10, potFraction: 0.5, frequency: 0.6, ev: 3, intent: "value" },
      ],
      source: "safe-fallback",
      strategyVersion: "legacy-adapter-v1",
      explanationFacts: { equity: 0.65, spr: 5 },
    });
  });
});
