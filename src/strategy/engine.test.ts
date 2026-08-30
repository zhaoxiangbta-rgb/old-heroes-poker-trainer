import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { createLocalStrategyEngine, selectStrategyAction } from "./engine";
import { buildPublicDecisionState } from "./publicState";
import { buildRangeLedger, snapshotRangeLedger } from "./rangeLedger";
import { replayFixture } from "./replayFixtures";
import type { StrategyRequest } from "./types";

function request(seed = 42): StrategyRequest {
  const game = newGame(seed);
  const state = buildPublicDecisionState(game, game.heroSeat);
  return {
    state,
    ranges: snapshotRangeLedger(buildRangeLedger(state)),
    deadlineMs: 250,
  };
}

describe("local strategy engine contract", () => {
  it("routes standard preflop nodes through the explicit V3 matrix", () => {
    const result = createLocalStrategyEngine().decide(request());
    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
    expect(result.actions.every((action) => Number.isFinite(action.ev))).toBe(true);
    expect(result).toMatchObject({
      strategyVersion: "strategy-v4.0.0",
      source: "strategy-pack-v3",
      nodeId: expect.stringContaining("pf1:"),
      confidence: expect.any(Number),
    });
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.explanationFacts.fallback).toBeUndefined();
  });

  it("models a small-blind complete for marginal suited hands when action folds to the blinds", () => {
    const input = request(142);
    const actor = input.state.players.find((player) => player.seat === input.state.actingSeat)!;
    const bigBlind = input.state.players.find((player) => player.seat !== actor.seat)!;
    input.state.players.forEach((player) => {
      player.folded = player.seat !== actor.seat && player.seat !== bigBlind.seat;
      player.position = player.seat === actor.seat ? "SB" : player.seat === bigBlind.seat ? "BB" : player.position;
      player.streetBet = player.seat === actor.seat ? 1 : player.seat === bigBlind.seat ? 2 : 0;
    });
    input.state.smallBlindSeat = actor.seat;
    input.state.bigBlindSeat = bigBlind.seat;
    input.state.heroHole = ["Ks", "2s"];
    input.state.pot = 3;
    input.state.currentBet = 2;
    input.state.actions = [];
    input.state.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 1,
      minRaiseTo: 4,
      maxRaiseTo: 200,
    };

    const result = createLocalStrategyEngine().decide(input);
    const complete = result.actions.find((action) => action.action === "call");
    const fold = result.actions.find((action) => action.action === "fold");
    expect(complete).toEqual(expect.objectContaining({ frequency: expect.any(Number) }));
    expect(complete!.frequency).toBeGreaterThan(0.5);
    expect(complete!.ev).toBeGreaterThan(fold?.ev ?? Number.NEGATIVE_INFINITY);
  });

  it("routes multiway postflop through the range and side-pot resolver", () => {
    const input = replayFixture("four-way-three-checks-to-button");
    input.ranges = snapshotRangeLedger(buildRangeLedger(input.state));
    const result = createLocalStrategyEngine().decide(input);
    expect(result).toMatchObject({
      strategyVersion: "strategy-v4.0.0",
      source: "multiway-resolver",
      nodeId: expect.stringContaining("multiway:flop:4way"),
    });
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.72);
    expect(result.explanationFacts.fallback).toBeUndefined();
  });

  it("replays a multiway decision exactly from the same public state and ranges", () => {
    const input = replayFixture("four-way-three-checks-to-button", 903);
    input.ranges = snapshotRangeLedger(buildRangeLedger(input.state));

    expect(createLocalStrategyEngine().decide(input)).toEqual(
      createLocalStrategyEngine().decide(input),
    );
  });

  it("routes heads-up postflop through the auditable abstract blueprint", () => {
    const result = createLocalStrategyEngine().decide(
      replayFixture("turn-overbet-set"),
    );
    expect(result).toMatchObject({
      strategyVersion: "strategy-v4.0.0",
      source: expect.stringMatching(/blueprint|interpolated|blueprint\+resolver/),
      nodeId: expect.stringContaining("hupf1:"),
    });
    expect(result.explanationFacts.fallback).toBeUndefined();
    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
  });

  it("routes heads-up postflop with known ranges through V3 combo elasticity", () => {
    const input = replayFixture("turn-overbet-set");
    input.ranges = snapshotRangeLedger(buildRangeLedger(input.state));
    const result = createLocalStrategyEngine().decide(input);
    expect(result).toMatchObject({
      strategyVersion: "strategy-v4.0.0",
      source: "strategy-pack-v3+resolver",
      nodeId: expect.stringContaining("pfv3:pfs2:"),
      explanationFacts: {
        algorithm: "combo-elasticity-multistreet-v3",
      },
    });
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
  });

  it("returns only actions allowed by the public rule state", () => {
    const input = request(77);
    const result = createLocalStrategyEngine().decide(input);
    for (const action of result.actions) {
      if (action.action === "fold") expect(input.state.legal.canFold).toBe(true);
      if (action.action === "check") expect(input.state.legal.canCheck).toBe(true);
      if (action.action === "call") expect(input.state.legal.canCall).toBe(true);
      if (["bet", "raise", "all-in"].includes(action.action)) {
        expect(input.state.legal.canRaise).toBe(true);
        expect(action.toAmount).toBeGreaterThanOrEqual(input.state.legal.minRaiseTo);
        expect(action.toAmount).toBeLessThanOrEqual(input.state.legal.maxRaiseTo);
      }
    }
  });

  it("replays exactly from the same request", () => {
    const input = request(913);
    const result = createLocalStrategyEngine().decide(input);
    expect(result).toEqual(createLocalStrategyEngine().decide(input));
    expect(result.rangeFacts.rangeStateHash).toMatch(/^rv4:/);
  });

  it("selects the same mixed-strategy action from the same seed and decision index", () => {
    const input = request(913);
    const result = createLocalStrategyEngine().decide(input);
    expect(selectStrategyAction(result, input.state.seed, input.state.decisionIndex)).toEqual(
      selectStrategyAction(result, input.state.seed, input.state.decisionIndex),
    );
  });

  it("returns the unique safe legal action when the deadline is already exhausted", () => {
    const input = request(101);
    input.deadlineMs = 0;
    input.state.legal = {
      canFold: false,
      canCheck: true,
      canCall: false,
      canRaise: false,
      callAmount: 0,
      minRaiseTo: 0,
      maxRaiseTo: 0,
    };
    expect(createLocalStrategyEngine().decide(input).actions).toEqual([
      expect.objectContaining({ action: "check", frequency: 1 }),
    ]);
  });

  it("maps premium aggression to a blueprint call when a short stack can only call all-in", () => {
    const input = request(86);
    const actor = input.state.players.find((player) => player.seat === input.state.actingSeat)!;
    actor.stack = 2;
    actor.streetBet = 0;
    actor.position = "CO";
    input.state.heroHole = ["As", "Ad"];
    input.state.actions = [];
    input.state.decisionIndex = 0;
    input.state.currentBet = 2;
    input.state.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: false,
      callAmount: 2,
      minRaiseTo: 2,
      maxRaiseTo: 2,
    };
    const result = createLocalStrategyEngine().decide(input);
    expect(result.source).toBe("strategy-pack-v3");
    expect(result.actions).toContainEqual(
      expect.objectContaining({ action: "call", frequency: expect.any(Number) }),
    );
    expect(result.explanationFacts.fallback).toBeUndefined();
  });

  it("degrades to a legal safety result when the preflop package cannot be read", () => {
    const input = request(303);
    const result = createLocalStrategyEngine({
      decidePreflop: () => { throw new Error("策略包哈希校验失败"); },
    }).decide(input);
    expect(result).toMatchObject({
      source: "safe-fallback",
      explanationFacts: { fallback: "策略包哈希校验失败" },
    });
    expect(result.actions).toHaveLength(1);
  });
});
