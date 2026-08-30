import { describe, expect, it } from "vitest";
import { compilePreflopMatrix, type CompiledPreflopMatrix } from "./preflopCompiler";
import { auditPreflopMatrix } from "./preflopAudit";
import { PREFLOP_SOURCE_V3 } from "./preflopSource";

function clonedMatrix() {
  const source = compilePreflopMatrix(PREFLOP_SOURCE_V3);
  return {
    ...source,
    nodes: structuredClone(source.nodes),
  } as CompiledPreflopMatrix;
}

describe("preflop V3 audit", () => {
  it("accepts the complete built-in matrix", () => {
    const report = auditPreflopMatrix(compilePreflopMatrix(PREFLOP_SOURCE_V3));
    expect(report.fatal).toBe(false);
    expect(report.issues).toEqual([]);
    expect(report.nodeCount).toBe(288);
    expect(report.handCellCount).toBe(288 * 169);
  });

  it("reports a missing hand with an exact issue code", () => {
    const matrix = clonedMatrix();
    matrix.nodes[0].hands.pop();
    expect(auditPreflopMatrix(matrix).issues).toContainEqual(
      expect.objectContaining({ code: "PF_HAND_MISSING" }),
    );
  });

  it("reports an action family that is illegal for the spot", () => {
    const matrix = clonedMatrix();
    const node = matrix.nodes.find((candidate) =>
      candidate.spot === "unopened" && candidate.position === "HJ" && candidate.stack === 100)!;
    node.hands[0].actions = [{ kind: "call", frequency: 1, evBb: 0 }];
    expect(auditPreflopMatrix(matrix).issues).toContainEqual(
      expect.objectContaining({ code: "PF_ACTION_ILLEGAL" }),
    );
  });

  it("reports an unexplained position range inversion", () => {
    const matrix = clonedMatrix();
    const node = matrix.nodes.find((candidate) =>
      candidate.spot === "unopened" && candidate.position === "BTN" && candidate.stack === 100)!;
    for (const hand of node.hands) {
      hand.actions = [{ kind: "fold", frequency: 1, evBb: 0 }];
    }
    expect(auditPreflopMatrix(matrix).issues).toContainEqual(
      expect.objectContaining({ code: "PF_POSITION_RANGE_INVERSION" }),
    );
  });
});
