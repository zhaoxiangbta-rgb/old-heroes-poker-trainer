import { describe, expect, it } from "vitest";
import { estimateMultiwayEquity } from "./multiwayEquity";

const exactBudget = { maxJointSamples: 128, maxRunouts: 128 };

describe("joint multiway range equity", () => {
  it("enumerates a small three-player river exactly and splits a public straight", () => {
    const result = estimateMultiwayEquity(
      ["9c", "9h"],
      ["Ah", "Kd", "Qc", "Js", "Th"],
      {
        1: [{ cards: ["8c", "8d"], weight: 1 }],
        2: [{ cards: ["7c", "7d"], weight: 1 }],
      },
      exactBudget,
    );

    expect(result.exact).toBe(true);
    expect(result.validJointSamples).toBe(1);
    expect(result.heroEquity).toBeCloseTo(1 / 3, 10);
    expect(result.opponentEquity[1]).toBeCloseTo(1 / 3, 10);
    expect(result.opponentEquity[2]).toBeCloseTo(1 / 3, 10);
  });

  it("rejects card collisions between independent opponent ranges", () => {
    const result = estimateMultiwayEquity(
      ["As", "Kd"],
      ["2h", "7d", "9c", "Js", "Qh"],
      {
        1: [
          { cards: ["3c", "4c"], weight: 0.5 },
          { cards: ["5c", "6c"], weight: 0.5 },
        ],
        2: [
          { cards: ["3c", "8c"], weight: 0.5 },
          { cards: ["Tc", "Td"], weight: 0.5 },
        ],
      },
      exactBudget,
    );

    expect(result.validJointSamples).toBe(3);
    expect(result.rejectedConflicts).toBe(1);
    expect(result.heroEquity + result.opponentEquity[1] + result.opponentEquity[2]).toBeCloseTo(1, 10);
  });

  it("is deterministic for the same weighted ranges and bounded runout budget", () => {
    const args = [
      ["As", "Kd"],
      ["2c", "7d", "9h"],
      {
        1: [
          { cards: ["Ac", "Qd"], weight: 0.6 },
          { cards: ["8c", "8d"], weight: 0.4 },
        ],
        2: [
          { cards: ["Kh", "Qh"], weight: 0.7 },
          { cards: ["6c", "5c"], weight: 0.3 },
        ],
      },
      { maxJointSamples: 3, maxRunouts: 24 },
    ] as const;
    const first = estimateMultiwayEquity(...args);
    const replay = estimateMultiwayEquity(...args);

    expect({ ...replay, elapsedMs: 0 }).toEqual({ ...first, elapsedMs: 0 });
  });

  it("does not increase hero equity when another strong live range is added", () => {
    const hero: [string, string] = ["Ah", "Qd"];
    const board = ["As", "7c", "2d", "9h", "3c"];
    const first = estimateMultiwayEquity(
      hero,
      board,
      { 1: [{ cards: ["Kc", "Qh"], weight: 1 }] },
      exactBudget,
    );
    const multiway = estimateMultiwayEquity(
      hero,
      board,
      {
        1: [{ cards: ["Kc", "Qh"], weight: 1 }],
        2: [{ cards: ["Ac", "Kh"], weight: 1 }],
      },
      exactBudget,
    );

    expect(multiway.heroEquity).toBeLessThanOrEqual(first.heroEquity);
  });
});
