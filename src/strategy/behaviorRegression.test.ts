import { describe, expect, it } from "vitest";
import { createLocalStrategyEngine, selectStrategyAction } from "./engine";
import { buildRangeLedger, snapshotRangeLedger } from "./rangeLedger";
import { replayFixture } from "./replayFixtures";

function decide(name: Parameters<typeof replayFixture>[0], seed = 1) {
  const request = replayFixture(name, seed);
  return createLocalStrategyEngine().decide(request);
}

function frequency(result: ReturnType<typeof decide>, actions: string[]) {
  return result.actions
    .filter((action) => actions.includes(action.action))
    .reduce((sum, action) => sum + action.frequency, 0);
}

describe("strategy behavior regressions", () => {
  it("keeps a non-zero late-position stab range after three checks", () => {
    expect(frequency(decide("four-way-three-checks-to-button"), ["bet", "raise", "all-in"]))
      .toBeGreaterThanOrEqual(0.15);
  });

  it("defends an overbet with strong made hands and strong draws", () => {
    expect(frequency(decide("turn-overbet-set"), ["fold"])).toBeLessThan(0.05);
    expect(frequency(decide("turn-overbet-nut-flush-draw"), ["fold"])).toBeLessThan(0.9);
  });

  it("does not turn a non-premium hand into an automatic deep raise war", () => {
    let allIns = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const request = replayFixture("preflop-deep-reraise", seed);
      const result = createLocalStrategyEngine().decide(request);
      const selected = selectStrategyAction(result, seed, request.state.decisionIndex).action;
      if (selected.action === "all-in") allIns += 1;
    }
    expect(allIns / 500).toBeLessThan(0.15);
  });

  it("keeps the standard postflop answer auditable when a friend-game style is applied", () => {
    const request = replayFixture("turn-overbet-set", 91);
    request.state.tableProfileId = "friends";
    request.ranges = snapshotRangeLedger(buildRangeLedger(request.state));
    const result = createLocalStrategyEngine().decide(request);
    expect(result.strategyVersion).toBe("strategy-v4.0.0");
    expect(result.baselineActions).toBeDefined();
    expect(result.adjustment).toMatchObject({ applied: true, tableProfileId: "friends" });
    result.actions.forEach((action, index) => {
      expect(Math.abs(action.frequency - result.baselineActions![index].frequency))
        .toBeLessThanOrEqual(0.1500001);
    });
  });

  it("lets a loose table profile widen the edge of an unopened late-position range", () => {
    const make = (profile: "balanced" | "friends") => {
      const request = replayFixture("preflop-deep-reraise", 37);
      request.state.heroHole = ["Jh", "8d"];
      request.state.tableProfileId = profile;
      request.state.pot = 3;
      request.state.currentBet = 2;
      request.state.actions = [];
      request.state.decisionIndex = 0;
      const actor = request.state.players.find((player) => player.seat === request.state.actingSeat)!;
      actor.position = "BTN";
      actor.streetBet = 0;
      actor.totalBet = 0;
      actor.stack = 200;
      request.state.legal = {
        canFold: true, canCheck: false, canCall: true, canRaise: true,
        callAmount: 2, minRaiseTo: 4, maxRaiseTo: 200,
      };
      request.ranges = snapshotRangeLedger(buildRangeLedger(request.state));
      return createLocalStrategyEngine().decide(request);
    };
    const continueFrequency = (result: ReturnType<typeof make>) => result.actions
      .filter((action) => action.action !== "fold")
      .reduce((sum, action) => sum + action.frequency, 0);

    expect(continueFrequency(make("balanced"))).toBe(0);
    expect(continueFrequency(make("friends"))).toBeGreaterThanOrEqual(0.14);
  });
});
