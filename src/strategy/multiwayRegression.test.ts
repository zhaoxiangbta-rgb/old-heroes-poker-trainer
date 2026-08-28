import { describe, expect, it } from "vitest";
import type { MultiwayEquityResult } from "./multiwayEquity";
import type { MultiwayOutFacts } from "./multiwayOuts";
import { multiwayPotExposure } from "./multiwayPots";
import { resolveMultiwayStrategy } from "./multiwayStrategy";
import type { StrategyRequest } from "./types";

function request(opponents: number): StrategyRequest {
  const actingSeat = opponents;
  return {
    state: {
      schemaVersion: 1,
      seed: 81,
      decisionIndex: 2,
      actingSeat,
      buttonSeat: actingSeat,
      smallBlindSeat: 0,
      bigBlindSeat: 1,
      blindLevel: { small: 1, big: 2 },
      street: "turn",
      heroHole: ["Ah", "Qh"],
      board: ["Jh", "7c", "2s", "9d"],
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
      players: Array.from({ length: opponents + 1 }, (_, seat) => ({
        seat,
        playerId: seat === actingSeat ? "hero" : `villain-${seat}`,
        position: seat === actingSeat ? "BTN" as const : "UTG" as const,
        stack: 90,
        streetBet: seat === actingSeat ? 0 : seat === 0 ? 10 : 0,
        totalBet: seat === actingSeat ? 10 : seat === 0 ? 20 : 10,
        folded: false,
        allIn: false,
      })),
      actions: [],
      tableProfileId: "balanced",
    },
    ranges: { version: 1, lastActionIndex: 0, bySeat: {} },
    deadlineMs: 250,
  };
}

function solve(
  heroEquity: number,
  outFacts: MultiwayOutFacts,
  opponents = 2,
) {
  const input = request(opponents);
  const equity: MultiwayEquityResult = {
    heroEquity,
    opponentEquity: {},
    validJointSamples: 96,
    rejectedConflicts: 2,
    exact: false,
    elapsedMs: 10,
  };
  return resolveMultiwayStrategy(
    input,
    equity,
    outFacts,
    multiwayPotExposure(input.state, 10),
  );
}

const noOuts: MultiwayOutFacts = {
  clean: [], dirty: [], shared: [], counterfeit: [], reverseImpliedRisk: 0,
};

function aggression(result: ReturnType<typeof solve>) {
  return result.actions
    .filter((action) => ["bet", "raise", "all-in"].includes(action.action))
    .reduce((sum, action) => sum + action.frequency, 0);
}

function continuation(result: ReturnType<typeof solve>) {
  return result.actions
    .filter((action) => action.action !== "fold")
    .reduce((sum, action) => sum + action.frequency, 0);
}

describe("multiway practical behavior release gate", () => {
  it("does not overplay top-pair-strength equity into multiple players", () => {
    expect(aggression(solve(0.48, noOuts))).toBeLessThan(0.12);
  });

  it("does not slow-play nut-like equity unconditionally", () => {
    expect(aggression(solve(0.86, noOuts))).toBeGreaterThan(0.5);
  });

  it("keeps a non-zero protection raise with a robust value edge", () => {
    expect(aggression(solve(0.58, noOuts))).toBeGreaterThan(0.05);
  });

  it("continues less often when nominal outs are dirty", () => {
    const clean = solve(0.38, {
      ...noOuts,
      clean: ["2h", "3h", "4h", "5h", "6h", "8h", "9h", "Th", "Kh"],
      reverseImpliedRisk: 0.05,
    });
    const dirty = solve(0.38, {
      ...noOuts,
      dirty: ["2h", "3h", "4h", "5h", "6h", "8h", "9h", "Th", "Kh"],
      reverseImpliedRisk: 0.75,
    });
    expect(continuation(dirty)).toBeLessThan(continuation(clean));
  });

  it("reduces marginal aggression with more players behind", () => {
    expect(aggression(solve(0.58, noOuts, 4)))
      .toBeLessThan(aggression(solve(0.58, noOuts, 2)));
  });
});
