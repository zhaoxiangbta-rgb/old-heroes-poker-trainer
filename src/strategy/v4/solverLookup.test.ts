import { describe, expect, it } from "vitest";
import type { SolverPackV4 } from "./solverPack";
import { lookupSolverNodeV4 } from "./solverLookup";

const pack: SolverPackV4 = {
  schemaVersion: 4,
  strategyVersion: "strategy-v4.0.0",
  source: { project: "solver", version: "1", license: "MIT", algorithm: "DCFR", generatedAt: "x", sourceHash: "1".repeat(64) },
  nodes: [10, 20].map((potBb) => ({
    id: `node-${potBb}`,
    street: "river" as const,
    board: ["As", "7c", "2d", "Kh", "5s"] as const,
    boardFamily: "bf3:river:ace-high:unpaired:two-tone:gutshot-rich:s3",
    hero: ["Ah", "Td"] as const,
    opponentHandClasses: ["QQ", "AQo"],
    history: "x",
    actingPlayer: 0 as const,
    potBb,
    effectiveStackBb: 100,
    reachProbability: 1,
    actions: [
      { kind: "check" as const, frequency: potBb === 10 ? 0.7 : 0.5 },
      { kind: "bet" as const, potFraction: 0.75, frequency: potBb === 10 ? 0.3 : 0.5 },
    ],
  })),
};

describe("lookupSolverNodeV4", () => {
  it("returns the exact node when dimensions match", () => {
    const result = lookupSolverNodeV4(pack, {
      board: ["As", "7c", "2d", "Kh", "5s"], hero: ["Ah", "Td"], opponentRange: [{ cards: ["Qh", "Qd"], weight: 1 }], history: "x", potBb: 10, effectiveStackBb: 100, actingPlayer: 0,
    });
    expect(result?.confidence).toBe(1);
    expect(result?.actions[0].frequency).toBeCloseTo(0.7, 8);
  });

  it("interpolates adjacent pot nodes instead of using a hand-specific rule", () => {
    const result = lookupSolverNodeV4(pack, {
      board: ["As", "7c", "2d", "Kh", "5s"], hero: ["Ah", "Td"], opponentRange: [{ cards: ["Qh", "Qd"], weight: 1 }], history: "x", potBb: 15, effectiveStackBb: 100, actingPlayer: 0,
    });
    expect(result?.sourceNodeIds).toEqual(["node-10", "node-20"]);
    expect(result?.actions[0].frequency).toBeCloseTo(0.6, 8);
  });

  it("does not claim a solver match for an uncovered hand class", () => {
    expect(lookupSolverNodeV4(pack, {
      board: ["As", "7c", "2d", "Kh", "5s"], hero: ["3h", "2c"], opponentRange: [{ cards: ["Qh", "Qd"], weight: 1 }], history: "x", potBb: 10, effectiveStackBb: 100, actingPlayer: 0,
    })).toBeUndefined();
  });

  it("does not borrow a node from the opposite postflop position", () => {
    expect(lookupSolverNodeV4(pack, {
      board: ["As", "7c", "2d", "Kh", "5s"], hero: ["Ah", "Td"], opponentRange: [{ cards: ["Qh", "Qd"], weight: 1 }], history: "x", potBb: 10, effectiveStackBb: 100, actingPlayer: 1,
    })).toBeUndefined();
  });

  it("refuses an otherwise matching node when the live opponent range is unrelated", () => {
    expect(lookupSolverNodeV4(pack, {
      board: ["As", "7c", "2d", "Kh", "5s"], hero: ["Ah", "Td"], opponentRange: [{ cards: ["6h", "5h"], weight: 1 }], history: "x", potBb: 10, effectiveStackBb: 100, actingPlayer: 0,
    })).toBeUndefined();
  });
});
