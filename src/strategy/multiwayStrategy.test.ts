import { describe, expect, it } from "vitest";
import type { MultiwayEquityResult } from "./multiwayEquity";
import type { MultiwayOutFacts } from "./multiwayOuts";
import { multiwayPotExposure } from "./multiwayPots";
import { resolveMultiwayStrategy } from "./multiwayStrategy";
import type { PublicDecisionState, StrategyRequest } from "./types";

function request(opponents = 2): StrategyRequest {
  const actingSeat = opponents;
  const players = Array.from({ length: opponents + 1 }, (_, seat) => ({
    seat,
    playerId: seat === actingSeat ? "hero" : `villain-${seat}`,
    position: seat === actingSeat ? "BTN" as const : "UTG" as const,
    stack: 90,
    streetBet: seat === actingSeat ? 0 : seat === 0 ? 10 : 0,
    totalBet: seat === actingSeat ? 10 : seat === 0 ? 20 : 10,
    folded: false,
    allIn: false,
  }));
  const state: PublicDecisionState = {
    schemaVersion: 1,
    seed: 77,
    decisionIndex: 4,
    actingSeat,
    buttonSeat: actingSeat,
    smallBlindSeat: 0,
    bigBlindSeat: 1,
    blindLevel: { small: 1, big: 2 },
    street: "flop",
    heroHole: ["Ah", "Qh"],
    board: ["Jh", "7c", "2s"],
    pot: 40,
    currentBet: 10,
    minRaise: 15,
    legal: {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 10,
      minRaiseTo: 25,
      maxRaiseTo: 90,
    },
    pendingSeats: [actingSeat],
    players,
    actions: [],
    tableProfileId: "balanced",
  };
  return {
    state,
    ranges: { version: 1, lastActionIndex: 0, bySeat: {} },
    deadlineMs: 250,
  };
}

function equity(heroEquity: number, opponents = 2): MultiwayEquityResult {
  return {
    heroEquity,
    opponentEquity: Object.fromEntries(
      Array.from({ length: opponents }, (_, seat) => [seat, (1 - heroEquity) / opponents]),
    ),
    validJointSamples: 120,
    rejectedConflicts: 3,
    exact: false,
    elapsedMs: 12,
  };
}

function outs(overrides: Partial<MultiwayOutFacts> = {}): MultiwayOutFacts {
  return {
    clean: [],
    dirty: [],
    shared: [],
    counterfeit: [],
    reverseImpliedRisk: 0,
    ...overrides,
  };
}

function solve(heroEquity: number, outFacts = outs(), opponents = 2) {
  const input = request(opponents);
  const actor = input.state.players.find((player) => player.seat === input.state.actingSeat)!;
  const callTo = actor.streetBet + input.state.legal.callAmount;
  return resolveMultiwayStrategy(
    input,
    equity(heroEquity, opponents),
    outFacts,
    multiwayPotExposure(input.state, callTo),
  );
}

function frequency(result: ReturnType<typeof solve>, action: string) {
  return result.actions
    .filter((item) => item.action === action)
    .reduce((sum, item) => sum + item.frequency, 0);
}

describe("range-based multiway strategy", () => {
  it("keeps a multiway top-pair-strength hand mostly in call and pot-control mode", () => {
    const result = solve(0.48);

    expect(frequency(result, "call")).toBeGreaterThan(frequency(result, "raise"));
    expect(frequency(result, "raise")).toBeLessThan(0.12);
  });

  it("still raises nut-like equity for value", () => {
    const result = solve(0.86);

    expect(frequency(result, "raise") + frequency(result, "all-in"))
      .toBeGreaterThan(frequency(result, "call"));
    expect(result.actions.some((action) => action.intent === "value")).toBe(true);
  });

  it("continues a clean strong draw when the price is reasonable", () => {
    const result = solve(0.38, outs({
      clean: ["2h", "3h", "4h", "5h", "6h", "8h", "9h", "Th", "Kh"],
      reverseImpliedRisk: 0.05,
    }));

    expect(frequency(result, "call") + frequency(result, "raise"))
      .toBeGreaterThan(frequency(result, "fold"));
  });

  it("keeps pure-air bluff raises rare in a multiway pot", () => {
    const result = solve(0.13);

    expect(frequency(result, "raise") + frequency(result, "all-in")).toBeLessThanOrEqual(0.03);
  });

  it("removes a materially negative call before a loose profile can sample it", () => {
    const result = solve(0.08);
    expect(result.actions.some((action) => action.action === "call")).toBe(false);
  });

  it("reduces marginal aggression as more live opponents remain", () => {
    const threeWay = solve(0.58, outs(), 2);
    const fiveWay = solve(0.58, outs(), 4);

    expect(frequency(fiveWay, "raise") + frequency(fiveWay, "all-in"))
      .toBeLessThan(frequency(threeWay, "raise") + frequency(threeWay, "all-in"));
  });

  it("returns finite legal actions with normalized frequencies", () => {
    const result = solve(0.52);

    expect(result.source).toBe("multiway-resolver");
    expect(result.strategyVersion).toBe("multiway-resolver-v1");
    expect(result.confidence).toBeLessThan(0.72);
    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1);
    expect(result.actions.every((action) => Number.isFinite(action.ev))).toBe(true);
    expect(result.actions.filter((action) => action.toAmount !== undefined).every((action) =>
      action.toAmount! >= 25 && action.toAmount! <= 90)).toBe(true);
  });
});
