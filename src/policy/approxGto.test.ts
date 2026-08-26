import { describe, expect, it } from "vitest";
import type { DecisionContext, PolicyAction } from "./types";
import { approxGtoPolicy, candidateActions } from "./approxGto";

function spot(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    seed: 1,
    decisionIndex: 3,
    seat: 1,
    street: "river",
    position: "CO",
    hole: ["Qh", "Jd"],
    board: ["Ah", "Kd", "7c", "2s", "3h"],
    pot: 40,
    currentBet: 30,
    streetBet: 0,
    stack: 170,
    effectiveStack: 170,
    activePlayers: 2,
    playersBehind: 0,
    minRaiseTo: 60,
    maxRaiseTo: 170,
    legal: { fold: true, check: false, call: 30, raise: true },
    visibleLine: [
      { street: "river", actorSeat: 2, kind: "bet", toAmount: 30, potAfter: 40 },
    ],
    ...overrides,
  };
}

function rate(context: DecisionContext, type: PolicyAction["type"]) {
  let matches = 0;
  for (let seed = 1; seed <= 200; seed++) {
    if (approxGtoPolicy.decide({ ...context, seed }).action.type === type) matches++;
  }
  return matches / 200;
}

function isLegal(action: PolicyAction, context: DecisionContext) {
  if (action.type === "fold") return context.legal.fold;
  if (action.type === "check") return context.legal.check;
  if (action.type === "call") return context.legal.call > 0;
  return context.legal.raise && action.to >= context.minRaiseTo && action.to <= context.maxRaiseTo;
}

describe("local approximate GTO policy", () => {
  it("does not continue wide with air against a large river bet", () => {
    expect(rate(spot(), "fold")).toBeGreaterThan(0.85);
  });

  it("value bets strong hands more often than checking", () => {
    const context = spot({
      hole: ["Ac", "Ad"],
      currentBet: 0,
      legal: { fold: false, check: true, call: 0, raise: true },
      minRaiseTo: 14,
      visibleLine: [],
    });
    expect(rate(context, "raise")).toBeGreaterThan(rate(context, "check"));
  });

  it("keeps a meaningful stab frequency after the action checks to a player", () => {
    let bets = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const decision = approxGtoPolicy.decide(spot({
        seed,
        decisionIndex: 4,
        street: "flop",
        hole: [seed % 2 ? "Qh" : "9h", seed % 3 ? "Jd" : "8d"],
        board: ["Ah", "7c", "2s"],
        pot: 18,
        currentBet: 0,
        streetBet: 0,
        activePlayers: 2,
        playersBehind: 0,
        minRaiseTo: 6,
        maxRaiseTo: 194,
        legal: { fold: false, check: true, call: 0, raise: true },
        visibleLine: [
          { street: "flop", actorSeat: 0, kind: "check", toAmount: 0, potAfter: 18 },
        ],
      }));
      if (decision.action.type === "raise") bets++;
    }
    expect(bets / 400).toBeGreaterThanOrEqual(0.2);
  }, 15_000);

  it("bluffs less often multiway than heads-up", () => {
    const bluff = spot({
      street: "turn",
      board: ["Ah", "8d", "3c", "2s"],
      currentBet: 0,
      legal: { fold: false, check: true, call: 0, raise: true },
      minRaiseTo: 14,
      visibleLine: [],
    });
    expect(rate({ ...bluff, activePlayers: 4 }, "raise")).toBeLessThan(
      rate({ ...bluff, activePlayers: 2 }, "raise"),
    );
  });

  it("only generates and selects legal actions", () => {
    const contexts = [
      spot(),
      spot({ legal: { fold: false, check: true, call: 0, raise: false } }),
      spot({ minRaiseTo: 165, maxRaiseTo: 170 }),
    ];
    for (const context of contexts) {
      expect(candidateActions(context).every((action) => isLegal(action, context))).toBe(true);
      for (let seed = 1; seed <= 100; seed++)
        expect(isLegal(approxGtoPolicy.decide({ ...context, seed }).action, context)).toBe(true);
    }
  });

  it("keeps candidate EVs stable when only sampling seed changes", () => {
    const first = approxGtoPolicy.decide(spot({ seed: 1 }));
    const second = approxGtoPolicy.decide(spot({ seed: 2 }));
    expect(first.candidates.map(({ label, ev }) => [label, ev])).toEqual(
      second.candidates.map(({ label, ev }) => [label, ev]),
    );
  });

  it("keeps cold complex-node calculation within the CI-safe 250ms budget", () => {
    const context = spot({
      seed: 991,
      street: "turn",
      board: ["Kh", "9h", "5c", "2s"],
      pot: 43,
      activePlayers: 4,
    });
    const started = performance.now();
    approxGtoPolicy.decide(context);
    // This is a regression tripwire, not a benchmark: shared CI runners can
    // briefly pause a process, so the limit must tolerate scheduler jitter.
    expect(performance.now() - started).toBeLessThan(250);
  });
});
