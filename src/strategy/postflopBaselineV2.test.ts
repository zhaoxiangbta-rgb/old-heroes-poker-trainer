import { describe, expect, it } from "vitest";
import type { PostflopHandBucket } from "./postflopHandBucket";
import { buildPostflopBaselineV2 } from "./postflopBaselineV2";
import type { RangeAdvantageFacts } from "./rangeAdvantage";
import type { ScaleResponseFacts } from "./responseModel";
import { replayFixture } from "./replayFixtures";
import type { PostflopSituation } from "./types";

const advantage: RangeAdvantageFacts = {
  hero: { equity: 0.67, nutDensity: 0.12, strongDensity: 0.25, mediumDensity: 0.4, drawDensity: 0.1, airDensity: 0.25, equityRealization: 0.7 },
  villain: { equity: 0.48, nutDensity: 0.08, strongDensity: 0.2, mediumDensity: 0.4, drawDensity: 0.1, airDensity: 0.3, equityRealization: 0.43 },
  equityAdvantage: 0.19, nutAdvantage: 0.04, confidence: 0.8, samples: 32,
};

const bucket: PostflopHandBucket = {
  tier: "medium", made: "top-pair", drawClass: "none", nutPotential: 0,
  blockerScore: 0, cleanOuts: 0, equity: 0.67, publicMadeHand: false, bucketId: "medium",
};

const situation: PostflopSituation = {
  version: 2, street: "flop", headsUp: true, inPosition: true, initiative: true,
  lastToAct: true, line: "cbet", potType: "srp", spr: 6, playersBehind: 0,
  textureCluster: "dry", rangeShiftCard: false, nodeId: "fixture",
};

function response(potFraction: number, overrides: Partial<ScaleResponseFacts> = {}): ScaleResponseFacts {
  return {
    toAmount: Math.round(30 * potFraction), potFraction, fold: 0.28,
    worseCall: 0.42, betterContinue: 0.22, raise: 0.08,
    equityWhenContinued: 0.62, confidence: 0.8, ...overrides,
  };
}

function solve(overrides: Partial<PostflopSituation> = {}, responses = [response(0.5), response(2 / 3), response(1)]) {
  const request = replayFixture("turn-overbet-set");
  request.state.street = "flop";
  request.state.board = ["Ah", "7c", "2s"];
  request.state.pot = 30;
  request.state.currentBet = 0;
  request.state.players[request.state.actingSeat].streetBet = 0;
  request.state.legal = { canFold: false, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 10, maxRaiseTo: 170 };
  return buildPostflopBaselineV2({
    request,
    situation: { ...situation, ...overrides },
    bucket,
    rangeAdvantage: advantage,
    responses,
  });
}

function aggression(result: ReturnType<typeof solve>) {
  return result.actions.filter((action) => ["bet", "raise", "all-in"].includes(action.action))
    .reduce((sum, action) => sum + action.frequency, 0);
}

describe("position-aware postflop baseline v2", () => {
  it("bets less from an out-of-position first-to-act flop than in position when checked to", () => {
    const ip = solve({ inPosition: true, lastToAct: true, line: "checked-to" });
    const oop = solve({ inPosition: false, lastToAct: false, initiative: false, line: "first-to-act" });

    expect(aggression(oop)).toBeLessThan(aggression(ip));
    expect(aggression(oop)).toBeLessThanOrEqual(0.35);
  });

  it("allows more turn leading on a range-shifting card than on a blank", () => {
    const blank = solve({ street: "turn", inPosition: false, lastToAct: false, initiative: false, line: "donk", rangeShiftCard: false });
    const shift = solve({ street: "turn", inPosition: false, lastToAct: false, initiative: false, line: "donk", rangeShiftCard: true }, [
      response(0.5), response(2 / 3), response(1),
    ]);

    expect(aggression(blank)).toBeLessThanOrEqual(0.18);
    expect(aggression(shift)).toBeGreaterThan(aggression(blank));
  });

  it("calls a bet value only when enough worse hands continue", () => {
    const thinValue = solve({}, [response(0.5, { worseCall: 0.58, betterContinue: 0.1, fold: 0.25, raise: 0.07 })]);
    const noWorseCalls = solve({}, [response(0.5, { worseCall: 0.02, betterContinue: 0.53, fold: 0.35, raise: 0.1 })]);

    expect(thinValue.actions.some((action) => action.intent === "value" && action.frequency >= 0.1)).toBe(true);
    expect(noWorseCalls.actions.every((action) => action.intent !== "value" || action.frequency < 0.1)).toBe(true);
  });

  it("keeps an induce check with the nuts and emits only legal sizes", () => {
    const request = replayFixture("turn-overbet-set");
    request.state.street = "flop";
    request.state.board = ["Ah", "7c", "2s"];
    request.state.pot = 30;
    request.state.currentBet = 0;
    request.state.players[request.state.actingSeat].streetBet = 0;
    request.state.legal = { canFold: false, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 10, maxRaiseTo: 170 };
    const result = buildPostflopBaselineV2({
      request, situation, rangeAdvantage: advantage, responses: [response(0.5), response(1)],
      bucket: { ...bucket, tier: "nuts", made: "set", equity: 0.96 },
    });
    expect(result.actions).toContainEqual(expect.objectContaining({ action: "check", intent: "induce" }));
    result.actions.filter((action) => action.toAmount !== undefined).forEach((action) => {
      expect(action.toAmount).toBeGreaterThanOrEqual(request.state.legal.minRaiseTo);
      expect(action.toAmount).toBeLessThanOrEqual(request.state.legal.maxRaiseTo);
    });
  });
});
