import { describe, expect, it } from "vitest";
import type { WeightedCombo } from "../../engine/ranges";
import { replayFixture } from "../replayFixtures";
import type { PostflopSituation } from "../types";
import { decidePostflopV3 } from "../v3/postflopStrategy";

const opponentRange: WeightedCombo[] = [
  { cards: ["Ks", "Kc"], weight: 0.25, label: "KsKc", history: [] },
  { cards: ["Qh", "Qd"], weight: 0.25, label: "QhQd", history: [] },
  { cards: ["Ad", "Kd"], weight: 0.2, label: "AdKd", history: [] },
  { cards: ["7s", "7c"], weight: 0.15, label: "7s7c", history: [] },
  { cards: ["6s", "5s"], weight: 0.15, label: "6s5s", history: [] },
];

const situation: PostflopSituation = {
  version: 2, street: "flop", headsUp: true, inPosition: false, initiative: false,
  lastToAct: false, line: "facing-bet", potType: "srp", spr: 8, playersBehind: 0,
  textureCluster: "paired-dry", rangeShiftCard: false, nodeId: "golden-general-family",
};

function sharedBoardAir() {
  const request = replayFixture("turn-overbet-set");
  request.state.street = "flop";
  request.state.heroHole = ["2h", "3h"];
  request.state.board = ["Jh", "4d", "Jc"];
  request.state.pot = 8;
  request.state.currentBet = 4;
  request.state.legal = {
    canFold: true, canCheck: false, canCall: true, canRaise: true,
    callAmount: 4, minRaiseTo: 8, maxRaiseTo: 196,
  };
  return request;
}

describe("V4 black-box golden families", () => {
  it("does not confuse a public pair with a private made hand", () => {
    const result = decidePostflopV3({ request: sharedBoardAir(), situation, opponentRange });
    expect(result.actions.some((action) => action.action === "raise" || action.action === "all-in")).toBe(false);
    expect(result.actions.find((action) => action.action === "fold")?.frequency).toBeGreaterThan(0.5);
  });

  it("does not force featureless ace-board air to bluff", () => {
    const request = sharedBoardAir();
    request.state.heroHole = ["Jd", "2d"];
    request.state.board = ["Ac", "9s", "7s"];
    request.state.currentBet = 0;
    request.state.pot = 12;
    request.state.legal = { canFold: false, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 4, maxRaiseTo: 196 };
    const result = decidePostflopV3({
      request,
      situation: { ...situation, inPosition: true, lastToAct: true, line: "checked-to" },
      opponentRange,
    });
    expect([...result.actions].sort((a, b) => b.frequency - a.frequency)[0].action).toBe("check");
  });

  it("keeps paired-board trips on a smaller-value/check mix rather than pot-only", () => {
    const request = sharedBoardAir();
    request.state.heroHole = ["As", "2s"];
    request.state.board = ["Ah", "Ac", "7d"];
    request.state.currentBet = 0;
    request.state.pot = 30;
    request.state.legal = { canFold: false, canCheck: true, canCall: false, canRaise: true, callAmount: 0, minRaiseTo: 10, maxRaiseTo: 170 };
    const result = decidePostflopV3({
      request,
      situation: { ...situation, inPosition: true, lastToAct: true, line: "checked-to" },
      opponentRange,
    });
    const pot = result.actions.find((action) => action.potFraction === 1)?.frequency ?? 0;
    const smaller = result.actions.filter((action) => (action.potFraction ?? 2) < 1)
      .reduce((sum, action) => sum + action.frequency, 0);
    expect(smaller).toBeGreaterThan(pot);
  });
});
