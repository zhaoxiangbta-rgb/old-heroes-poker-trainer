import { describe, expect, it } from "vitest";
import type { WeightedCombo } from "../../engine/ranges";
import { replayFixture } from "../replayFixtures";
import type { PostflopSituation } from "../types";
import { decidePostflopV3 } from "./postflopStrategy";

const situation: PostflopSituation = {
  version: 2,
  street: "flop",
  headsUp: true,
  inPosition: true,
  initiative: false,
  lastToAct: true,
  line: "checked-to",
  potType: "srp",
  spr: 6,
  playersBehind: 0,
  textureCluster: "paired-dry",
  rangeShiftCard: false,
  nodeId: "paired-trips-test",
};

const range: WeightedCombo[] = [
  { cards: ["Ks", "Kc"], weight: 0.24, label: "KsKc", history: [] },
  { cards: ["Qh", "Qd"], weight: 0.22, label: "QhQd", history: [] },
  { cards: ["Jc", "Tc"], weight: 0.2, label: "JcTc", history: [] },
  { cards: ["Ad", "Kd"], weight: 0.14, label: "AdKd", history: [] },
  { cards: ["7s", "7c"], weight: 0.08, label: "7s7c", history: [] },
  { cards: ["6s", "5s"], weight: 0.12, label: "6s5s", history: [] },
];

function pairedTripsRequest() {
  const request = replayFixture("turn-overbet-set");
  request.state.street = "flop";
  request.state.heroHole = ["As", "2s"];
  request.state.board = ["Ah", "Ac", "7d"];
  request.state.pot = 30;
  request.state.currentBet = 0;
  const actor = request.state.players.find((player) => player.seat === request.state.actingSeat)!;
  actor.streetBet = 0;
  actor.stack = 170;
  request.state.legal = {
    canFold: false,
    canCheck: true,
    canCall: false,
    canRaise: true,
    callAmount: 0,
    minRaiseTo: 10,
    maxRaiseTo: 170,
  };
  return request;
}

function pureAirRequest(facingBet: boolean) {
  const request = replayFixture("turn-overbet-set");
  request.state.street = "flop";
  request.state.heroHole = ["2h", "3h"];
  request.state.board = ["Jh", "4d", "Jc"];
  request.state.pot = facingBet ? 6 : 4;
  request.state.currentBet = facingBet ? 2 : 0;
  const actor = request.state.players.find((player) => player.seat === request.state.actingSeat)!;
  actor.streetBet = 0;
  actor.stack = 198;
  request.state.legal = facingBet ? {
    canFold: true,
    canCheck: false,
    canCall: true,
    canRaise: true,
    callAmount: 2,
    minRaiseTo: 4,
    maxRaiseTo: 198,
  } : {
    canFold: false,
    canCheck: true,
    canCall: false,
    canRaise: true,
    callAmount: 0,
    minRaiseTo: 2,
    maxRaiseTo: 198,
  };
  return request;
}

describe("V3 postflop strategy", () => {
  it("prices flop equity over future runouts instead of treating the current snapshot as the river", () => {
    const request = pairedTripsRequest();
    request.state.heroHole = ["As", "Ks"];
    request.state.board = ["Js", "Ts", "2c"];
    request.state.street = "flop";
    request.state.pot = 10;
    request.state.currentBet = 2;
    request.state.legal = {
      canFold: true, canCheck: false, canCall: true, canRaise: true,
      callAmount: 2, minRaiseTo: 4, maxRaiseTo: 100,
    };
    const result = decidePostflopV3({
      request,
      situation: { ...situation, street: "flop", line: "facing-bet" },
      opponentRange: [{ cards: ["Qh", "Qd"], weight: 1, label: "QhQd", history: [] }],
    });
    expect(Number(result.rangeFacts.currentEquity)).toBeGreaterThan(0.35);
    expect(result.rangeFacts.equityMode).toBe("fixed-budget-runout");
    expect(Number(result.rangeFacts.equityJointSamples)).toBeGreaterThan(0);
  });

  it("gives live bot decisions enough deterministic range coverage to avoid six-combo guesses", () => {
    const request = pairedTripsRequest();
    request.deadlineMs = 80;
    const expanded = Array.from({ length: 20 }, (_, index): WeightedCombo => {
      const ranks = ["K", "Q", "J", "T", "9"] as const;
      const suits = ["s", "h", "d", "c"] as const;
      const first = `${ranks[index % ranks.length]}${suits[index % suits.length]}`;
      const second = `${ranks[(index + 2) % ranks.length]}${suits[(index + 1) % suits.length]}`;
      return { cards: [first, second] as WeightedCombo["cards"], weight: 1, label: `${first}${second}`, history: [] };
    });
    const unique = [...new Map(expanded.map((combo) => [combo.cards.join(""), combo])).values()];
    const result = decidePostflopV3({ request, situation, opponentRange: unique });

    expect(Number(result.rangeFacts.equityJointSamples)).toBeGreaterThanOrEqual(12);
  });

  it("retains checking or small value when trips block worse continues on a paired dry board", () => {
    const result = decidePostflopV3({ request: pairedTripsRequest(), situation, opponentRange: range });
    const primary = result.actions.reduce((best, action) => action.frequency > best.frequency ? action : best);
    expect(primary.potFraction ?? 0).toBeLessThan(1);
    expect(result.actions.some((action) => action.action === "check" && action.frequency > 0.1))
      .toBe(true);
    const half = result.actions.find((action) => action.potFraction === 0.5)!;
    const pot = result.actions.find((action) => action.potFraction === 1)!;
    expect(half.frequency).toBeGreaterThan(pot.frequency);
  });

  it("returns only legal normalized candidates", () => {
    const request = pairedTripsRequest();
    const result = decidePostflopV3({ request, situation, opponentRange: range });
    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
    for (const action of result.actions.filter((item) => item.toAmount !== undefined)) {
      expect(action.toAmount).toBeGreaterThanOrEqual(request.state.legal.minRaiseTo);
      expect(action.toAmount).toBeLessThanOrEqual(request.state.legal.maxRaiseTo);
    }
  });

  it("does not turn shared-board air without a draw or blocker into a check-raise", () => {
    const request = pureAirRequest(true);
    const result = decidePostflopV3({
      request,
      situation: { ...situation, inPosition: false, lastToAct: false, line: "facing-bet" },
      opponentRange: range,
    });

    expect(result.actions.some((action) => action.action === "raise" || action.action === "all-in"))
      .toBe(false);
  });

  it("checks pure air without a draw or useful blocker instead of calling a bluff mandatory", () => {
    const request = pureAirRequest(false);
    request.state.heroHole = ["Jd", "2d"];
    request.state.board = ["Ac", "9s", "7s"];
    const result = decidePostflopV3({ request, situation, opponentRange: range });
    const best = [...result.actions].sort((first, second) => second.ev - first.ev)[0];

    expect(best.action).toBe("check");
  });

  it("does not mix a river fold when an exact call has clearly positive EV", () => {
    const request = pairedTripsRequest();
    request.state.street = "river";
    request.state.heroHole = ["Ah", "Kd"];
    request.state.board = ["As", "7c", "2d", "9s", "3c"];
    request.state.pot = 60;
    request.state.currentBet = 30;
    request.state.legal = {
      canFold: true, canCheck: false, canCall: true, canRaise: true,
      callAmount: 30, minRaiseTo: 60, maxRaiseTo: 170,
    };
    const result = decidePostflopV3({
      request,
      situation: { ...situation, street: "river", line: "facing-bet" },
      opponentRange: [
        { cards: ["Ac", "Qc"], weight: 0.6, label: "AcQc", history: [] },
        { cards: ["7h", "7d"], weight: 0.4, label: "7h7d", history: [] },
      ],
    });

    expect(result.rangeFacts.currentEquity).toBe(0.6);
    expect(result.actions.find((action) => action.action === "fold")?.frequency ?? 0)
      .toBeLessThan(0.01);
  });
});
