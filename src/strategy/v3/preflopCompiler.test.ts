import { describe, expect, it } from "vitest";
import { PREFLOP_SOURCE_V3 } from "./preflopSource";
import { compilePreflopMatrix } from "./preflopCompiler";

describe("preflop v3 matrix compiler", () => {
  it("expands every source node to exactly 169 normalized hands", () => {
    const matrix = compilePreflopMatrix(PREFLOP_SOURCE_V3);

    expect(matrix.nodes.length).toBeGreaterThan(0);
    for (const node of matrix.nodes) {
      expect(node.hands).toHaveLength(169);
      expect(new Set(node.hands.map((hand) => hand.hand)).size).toBe(169);
      for (const hand of node.hands) {
        expect(hand.actions.reduce((sum, action) => sum + action.frequency, 0))
          .toBeCloseTo(1, 10);
      }
    }
  });

  it("preserves explicit non-monotonic mixed hands", () => {
    const matrix = compilePreflopMatrix(PREFLOP_SOURCE_V3);
    const a2s = matrix.cell("unopened", "HJ", 100, "A2s");

    expect(a2s.actions.find((action) => action.kind === "raise")!.frequency)
      .toBeGreaterThan(0.2);
    expect(a2s.source).toBe("expert-baseline-v3");
  });

  it("rejects duplicate explicit hand assignments", () => {
    const broken = structuredClone(PREFLOP_SOURCE_V3);
    const node = broken.nodes.find((candidate) =>
      candidate.spot === "unopened" && candidate.position === "HJ" && candidate.stack === 100)!;
    node.groups.push(structuredClone(node.groups[0]));

    expect(() => compilePreflopMatrix(broken)).toThrow(/重复/);
  });
});
