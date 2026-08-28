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

describe("local V2 strategy engine contract", () => {
  it("routes standard preflop nodes through the auditable blueprint", () => {
    const result = createLocalStrategyEngine().decide(request());
    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
    expect(result.actions.every((action) => Number.isFinite(action.ev))).toBe(true);
    expect(result).toMatchObject({
      strategyVersion: "preflop-abstract-v1",
      source: expect.stringMatching(/blueprint|interpolated/),
      nodeId: expect.stringContaining("pf1:"),
      confidence: expect.any(Number),
    });
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.explanationFacts.fallback).toBeUndefined();
  });

  it("routes multiway postflop through the range and side-pot resolver", () => {
    const input = replayFixture("four-way-three-checks-to-button");
    input.ranges = snapshotRangeLedger(buildRangeLedger(input.state));
    const result = createLocalStrategyEngine().decide(input);
    expect(result).toMatchObject({
      strategyVersion: "multiway-resolver-v1",
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
      strategyVersion: "hu-postflop-abstract-v1",
      source: expect.stringMatching(/blueprint|interpolated|blueprint\+resolver/),
      nodeId: expect.stringContaining("hupf1:"),
    });
    expect(result.explanationFacts.fallback).toBeUndefined();
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
    expect(createLocalStrategyEngine().decide(input)).toEqual(
      createLocalStrategyEngine().decide(input),
    );
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
    expect(result.source).toMatch(/blueprint|interpolated/);
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
