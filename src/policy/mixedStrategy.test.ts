import { describe, expect, it } from "vitest";
import type { PolicyAction, PolicyCandidate } from "./types";
import { probabilitiesFromEv, sampleCandidate } from "./mixedStrategy";

function candidate(label: string, ev: number): PolicyCandidate {
  const action: PolicyAction =
    label === "fold"
      ? { type: "fold" }
      : label === "call"
        ? { type: "call" }
        : { type: "raise", to: 20 };
  return { action, label, ev, probability: 0, intent: "pot-control" };
}

describe("deterministic mixed strategy", () => {
  it("removes dominated actions and normalizes remaining frequencies", () => {
    const result = probabilitiesFromEv(
      [candidate("fold", 0), candidate("call", 1), candidate("raise", -10)],
      0.8,
      2,
    );
    expect(result.find((x) => x.label === "raise")?.probability).toBe(0);
    expect(result.reduce((n, x) => n + x.probability, 0)).toBeCloseTo(1);
  });

  it("samples the same action from the same seed and decision index", () => {
    const candidates = probabilitiesFromEv(
      [candidate("call", 1), candidate("raise", 1.1)],
      0.8,
      2,
    );
    expect(sampleCandidate(candidates, 42, 7)).toEqual(
      sampleCandidate(candidates, 42, 7),
    );
  });
});
