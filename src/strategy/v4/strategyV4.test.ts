import { describe, expect, it } from "vitest";
import type { PostflopSituation, StrategyRequest, StrategyResult } from "../types";
import type { SolverPackV4 } from "./solverPack";
import { applySolverBlueprintV4 } from "./strategyV4";

const request = {
  state: {
    street: "river", heroHole: ["Ah", "Td"], board: ["As", "7c", "2d", "Kh", "5s"], pot: 20,
    blindLevel: { small: 1, big: 2 }, actingSeat: 0,
    players: [{ seat: 0, position: "BTN", stack: 180, streetBet: 0 }, { seat: 1, position: "BB", stack: 180, streetBet: 0 }],
    legal: { canCheck: true, canFold: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 2, maxRaiseTo: 180 },
  },
  ranges: { version: 1, lastActionIndex: 0, bySeat: { 1: [{ cards: ["Qh", "Qd"], weight: 1 }] } },
} as unknown as StrategyRequest;

const base: StrategyResult = {
  actions: [
    { action: "check", frequency: 0.5, ev: 10, intent: "pot-control" },
    { action: "bet", toAmount: 15, potFraction: 0.75, frequency: 0.5, ev: 10.2, intent: "value" },
  ],
  confidence: 0.7, source: "strategy-pack-v3+resolver", strategyVersion: "strategy-v3",
  rangeFacts: {}, explanationFacts: {},
};

const pack: SolverPackV4 = {
  schemaVersion: 4, strategyVersion: "strategy-v4.0.0",
  source: { project: "solver", version: "1", license: "MIT", algorithm: "DCFR", generatedAt: "x", sourceHash: "1".repeat(64) },
  nodes: [{
    id: "exact", street: "river", board: ["As", "7c", "2d", "Kh", "5s"],
    boardFamily: "bf3:river:ace-high:unpaired:two-tone:gutshot-rich:s3", hero: ["Ah", "Td"], history: "x",
    opponentHandClasses: ["QQ", "AQo"],
    actingPlayer: 0, potBb: 10, effectiveStackBb: 90, reachProbability: 1,
    actions: [{ kind: "check", frequency: 0.8 }, { kind: "bet", potFraction: 0.75, frequency: 0.2 }],
  }],
};

const situation = {
  street: "river",
  inPosition: true,
} as PostflopSituation;

describe("applySolverBlueprintV4", () => {
  it("reweights only existing legal candidates from a matching solver node", () => {
    const result = applySolverBlueprintV4(base, request, pack, "x", situation);
    expect(result?.strategyVersion).toBe("strategy-v4.0.0");
    expect(result?.actions.map((action) => action.action)).toEqual(["check", "bet"]);
    expect(result?.actions[0].frequency).toBeCloseTo(0.8, 8);
    expect(result?.explanationFacts.solverNode).toBe("exact");
  });

  it("falls back honestly when no solver node covers the hand", () => {
    const changed = structuredClone(request);
    changed.state.heroHole = ["3h", "2c"];
    expect(applySolverBlueprintV4(base, changed, pack, "x", situation)).toBeUndefined();
  });

  it("uses the actual heads-up action order instead of inferring it from the 6-max position name", () => {
    const changed = structuredClone(request);
    changed.state.players[0].position = "HJ";
    expect(applySolverBlueprintV4(base, changed, pack, "x", { ...situation, inPosition: false })).toBeUndefined();
  });
});
