import { describe, expect, it } from "vitest";
import type { Legal, Position } from "../../game/game";
import type { PreflopNode } from "../types";
import { compilePreflopMatrix } from "./preflopCompiler";
import { lookupPreflopV3 } from "./preflopLookup";
import { PREFLOP_SOURCE_V3 } from "./preflopSource";

const legalOpen: Legal = {
  canFold: true,
  canCheck: false,
  canCall: false,
  canRaise: true,
  callAmount: 0,
  minRaiseTo: 4,
  maxRaiseTo: 200,
};

function node(effectiveStackBb = 100, actingPosition: Position = "HJ", inPosition = false): PreflopNode {
  return {
    spot: "unopened",
    actingPosition,
    raiseCount: 0,
    coldCallers: 0,
    limpers: 0,
    effectiveStackBb,
    stack: effectiveStackBb === 80
      ? { lower: 60, upper: 100, weight: 0.5 }
      : { lower: 100, upper: 100, weight: 0 },
    inPosition,
    nodeId: `test:unopened:${actingPosition}:${effectiveStackBb}`,
  };
}

describe("preflop v3 lookup", () => {
  const matrix = compilePreflopMatrix(PREFLOP_SOURCE_V3);

  it("uses the exact matrix cell instead of a percentile threshold", () => {
    const result = lookupPreflopV3(matrix, node(), ["As", "2s"], legalOpen, {
      pot: 3,
      currentBet: 2,
      actorStreetBet: 0,
      actorStack: 200,
      bigBlind: 2,
    });

    expect(result.explanationFacts.handClass).toBe("A2s");
    expect(result.actions.some((action) => action.action === "raise" && action.frequency > 0.2))
      .toBe(true);
    expect(result.source).toBe("strategy-pack-v3");
  });

  it("interpolates stack buckets then renormalizes", () => {
    const result = lookupPreflopV3(matrix, node(80), ["As", "2s"], legalOpen, {
      pot: 3,
      currentBet: 2,
      actorStreetBet: 0,
      actorStack: 200,
      bigBlind: 2,
    });

    expect(result.actions.reduce((sum, action) => sum + action.frequency, 0))
      .toBeCloseTo(1, 10);
    expect(result.explanationFacts.stackWeight).toBe(0.5);
  });

  it("exports the preflop position facts used by coaching copy", () => {
    const context = { pot: 3, currentBet: 2, actorStreetBet: 0, actorStack: 200, bigBlind: 2 };
    const button = lookupPreflopV3(matrix, node(100, "BTN", true), ["2s", "2h"], legalOpen, context);
    const utg = lookupPreflopV3(matrix, node(100, "UTG", false), ["As", "Kh"], legalOpen, context);

    expect(button.explanationFacts).toMatchObject({
      inPosition: 1,
      actingPosition: "BTN",
      preflopSpot: "unopened",
    });
    expect(utg.explanationFacts).toMatchObject({
      inPosition: 0,
      actingPosition: "UTG",
      preflopSpot: "unopened",
    });
  });
});
