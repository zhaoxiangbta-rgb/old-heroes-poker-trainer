import { describe, expect, it } from "vitest";
import type { PostflopHandBucket } from "./postflopHandBucket";
import type { HeadsUpPostflopNode } from "./postflopNode";
import { lookupPostflopBlueprint } from "./postflopBlueprint";
import { legalPostflopTarget, sizingInterpolation } from "./postflopSizing";
import { replayFixture } from "./replayFixtures";

function node(overrides: Partial<HeadsUpPostflopNode> = {}): HeadsUpPostflopNode {
  return {
    street: "flop",
    potType: "srp",
    inPosition: true,
    initiative: true,
    line: "cbet",
    facingFraction: 0,
    textureCluster: "pftex1:flop:premium:unpaired:rainbow:disconnected",
    nodeId: "node",
    ...overrides,
  };
}

function bucket(overrides: Partial<PostflopHandBucket> = {}): PostflopHandBucket {
  return {
    tier: "medium",
    made: "top-pair",
    drawClass: "none",
    nutPotential: 0,
    blockerScore: 0,
    cleanOuts: 0,
    equity: 0.66,
    publicMadeHand: false,
    bucketId: "bucket",
    ...overrides,
  };
}

function checkedState() {
  const state = replayFixture("turn-overbet-set").state;
  state.street = "flop";
  state.board = ["Ah", "7c", "2s"];
  state.pot = 30;
  state.currentBet = 0;
  state.players[state.actingSeat].streetBet = 0;
  state.legal = {
    canFold: false,
    canCheck: true,
    canCall: false,
    canRaise: true,
    callAmount: 0,
    minRaiseTo: 10,
    maxRaiseTo: 170,
  };
  return state;
}

describe("heads-up postflop abstract blueprint", () => {
  it("keeps value aggression, bounded dry-board bluffs and pot control", () => {
    const state = checkedState();
    const nuts = lookupPostflopBlueprint(node(), bucket({ tier: "nuts", made: "set", equity: 0.97 }), state);
    const air = lookupPostflopBlueprint(node(), bucket({ tier: "air", made: "high-card", equity: 0.12 }), state);
    const showdown = lookupPostflopBlueprint(node(), bucket({ tier: "showdown", made: "pair", equity: 0.47 }), state);

    expect(nuts.actions.filter((action) => ["bet", "raise", "all-in"].includes(action.action))
      .reduce((sum, action) => sum + action.frequency, 0)).toBeGreaterThan(0.7);
    const bluffFrequency = air.actions.filter((action) => action.action === "bet")
      .reduce((sum, action) => sum + action.frequency, 0);
    expect(bluffFrequency).toBeGreaterThan(0);
    expect(bluffFrequency).toBeLessThan(0.3);
    expect(showdown.actions.find((action) => action.action === "check")?.frequency).toBeGreaterThan(0.6);
  });

  it("does not make a strong draw auto-fold to an overbet", () => {
    const state = replayFixture("turn-overbet-nut-flush-draw").state;
    const result = lookupPostflopBlueprint(
      node({ street: "turn", line: "facing-bet", facingFraction: 1.5 }),
      bucket({ tier: "strong-draw", drawClass: "flush-draw", cleanOuts: 9, equity: 0.43, nutPotential: 0.55 }),
      state,
    );
    const continueFrequency = result.actions
      .filter((action) => action.action === "call" || action.action === "raise" || action.action === "all-in")
      .reduce((sum, action) => sum + action.frequency, 0);

    expect(continueFrequency).toBeGreaterThan(0.2);
    expect(result.actions.find((action) => action.action === "fold")?.frequency).toBeLessThan(0.8);
  });

  it("interpolates continuously between adjacent observed bet sizes", () => {
    const state = replayFixture("turn-overbet-set").state;
    const medium = bucket({ tier: "medium", equity: 0.62 });
    const small = lookupPostflopBlueprint(node({ line: "facing-bet", facingFraction: 1 / 3 }), medium, state);
    const between = lookupPostflopBlueprint(node({ line: "facing-bet", facingFraction: 0.42 }), medium, state);
    const half = lookupPostflopBlueprint(node({ line: "facing-bet", facingFraction: 0.5 }), medium, state);
    const call = (result: ReturnType<typeof lookupPostflopBlueprint>) =>
      result.actions.find((action) => action.action === "call")?.frequency ?? 0;

    expect(call(between)).toBeLessThan(call(small));
    expect(call(between)).toBeGreaterThan(call(half));
    expect(between.source).toBe("interpolated");
  });

  it("maps standard fractions to monotonic legal street totals", () => {
    const state = checkedState();
    expect(legalPostflopTarget(state, 1 / 3)).toBe(10);
    expect(legalPostflopTarget(state, 0.5)).toBe(15);
    expect(legalPostflopTarget(state, 2 / 3)).toBe(20);
    expect(legalPostflopTarget(state, 1)).toBe(30);
    expect(sizingInterpolation(0.42)).toMatchObject({ lower: 1 / 3, upper: 0.5 });
  });

  it("returns normalized finite EV actions only inside the rule limits", () => {
    const state = checkedState();
    const result = lookupPostflopBlueprint(node(), bucket({ tier: "strong-draw", equity: 0.51 }), state);
    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 10);
    for (const action of result.actions) {
      expect(Number.isFinite(action.ev)).toBe(true);
      if (action.toAmount !== undefined) {
        expect(action.toAmount).toBeGreaterThanOrEqual(state.legal.minRaiseTo);
        expect(action.toAmount).toBeLessThanOrEqual(state.legal.maxRaiseTo);
      }
    }
  });
});
