import { describe, expect, it } from "vitest";
import { createLocalStrategyEngine } from "./engine";
import { replayFixture } from "./replayFixtures";
import type { PublicAction, StrategyRequest } from "./types";

function action(
  street: PublicAction["street"],
  actorSeat: number,
  kind: PublicAction["kind"],
  amount: number,
  toAmount: number,
  potBefore: number,
): PublicAction {
  return { street, actorSeat, kind, amount, toAmount, potBefore, potAfter: potBefore + amount };
}

function checkedToRequest(street: "flop" | "turn" = "flop"): StrategyRequest {
  const request = replayFixture("turn-overbet-set");
  request.state.street = street;
  request.state.board = street === "flop"
    ? ["Ah", "7c", "2s"]
    : ["Ah", "7c", "2s", "9d"];
  request.state.heroHole = ["Qh", "Jd"];
  request.state.pot = 12;
  request.state.currentBet = 0;
  request.state.legal = {
    canFold: false,
    canCheck: true,
    canCall: false,
    canRaise: true,
    callAmount: 0,
    minRaiseTo: 4,
    maxRaiseTo: 170,
  };
  request.state.actions = [
    action("preflop", 1, "raise", 4, 4, 3),
    action("flop", 0, "check", 0, 0, 12),
  ];
  if (street === "turn") {
    request.state.actions.push(
      action("flop", 1, "check", 0, 0, 12),
      action("turn", 0, "check", 0, 0, 12),
    );
  }
  return request;
}

describe("heads-up postflop behavior regressions", () => {
  it("keeps a bounded stab instead of checking every street behind", () => {
    for (const street of ["flop", "turn"] as const) {
      const result = createLocalStrategyEngine().decide(checkedToRequest(street));
      const bet = result.actions.filter((item) => item.action === "bet")
        .reduce((sum, item) => sum + item.frequency, 0);
    expect(result.strategyVersion).toBe("strategy-v4.0.0");
      expect(bet).toBeGreaterThan(0);
      expect(bet).toBeLessThan(0.3);
    }
  });

  it("classifies a nut flush draw as a draw and keeps a continue versus an overbet", () => {
    const result = createLocalStrategyEngine().decide(
      replayFixture("turn-overbet-nut-flush-draw"),
    );
    const continueFrequency = result.actions
      .filter((item) => item.action === "call" || item.action === "raise" || item.action === "all-in")
      .reduce((sum, item) => sum + item.frequency, 0);
    expect(result.explanationFacts.tier).toBe("strong-draw");
    expect(continueFrequency).toBeGreaterThan(0.2);
  });

  it("does not mechanically re-raise every time after facing a raise", () => {
    const request = replayFixture("turn-overbet-set");
    request.state.street = "flop";
    request.state.board = ["Kh", "7c", "2s"];
    request.state.heroHole = ["Kc", "Qd"];
    request.state.pot = 60;
    request.state.currentBet = 35;
    request.state.players[request.state.actingSeat].streetBet = 15;
    request.state.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 20,
      minRaiseTo: 55,
      maxRaiseTo: 170,
    };
    request.state.actions = [
      action("preflop", 1, "raise", 4, 4, 3),
      action("flop", 1, "bet", 15, 15, 10),
      action("flop", 0, "raise", 35, 35, 25),
    ];
    const result = createLocalStrategyEngine().decide(request);
    const reraise = result.actions
      .filter((item) => item.action === "raise" || item.action === "all-in")
      .reduce((sum, item) => sum + item.frequency, 0);
    expect(reraise).toBeLessThan(0.5);
    expect(result.actions.some((item) => item.action === "call" && item.frequency > 0)).toBe(true);
  });
});
