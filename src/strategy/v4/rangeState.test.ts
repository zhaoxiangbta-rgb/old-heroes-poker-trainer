import { describe, expect, it } from "vitest";
import { normalizeRangeStateV4 } from "./rangeState";

describe("RangeStateV4", () => {
  it("removes card collisions and normalizes every opponent range", () => {
    const state = normalizeRangeStateV4({
      version: 1,
      lastActionIndex: 7,
      bySeat: {
        1: [
          { cards: ["As", "Kd"], weight: 2 },
          { cards: ["Qc", "Qd"], weight: 1 },
          { cards: ["Jh", "Jd"], weight: -1 },
        ],
      },
    }, ["As", "2c", "3d", "4h", "5s"]);

    expect(state.bySeat[1]).toEqual([{ cards: ["Qc", "Qd"], weight: 1 }]);
    expect(state.comboCount).toBe(1);
    expect(state.hash).toMatch(/^rv4:/);
  });

  it("is deterministic regardless of input combo order", () => {
    const first = normalizeRangeStateV4({
      version: 1,
      lastActionIndex: 2,
      bySeat: { 4: [
        { cards: ["Ah", "Kh"], weight: 3 },
        { cards: ["9c", "9d"], weight: 1 },
      ] },
    }, ["2s", "3s", "4d"]);
    const second = normalizeRangeStateV4({
      version: 1,
      lastActionIndex: 2,
      bySeat: { 4: [...first.bySeat[4]].reverse() },
    }, ["2s", "3s", "4d"]);

    expect(second.hash).toBe(first.hash);
    expect(second.bySeat).toEqual(first.bySeat);
  });
});
