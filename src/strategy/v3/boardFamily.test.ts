import { describe, expect, it } from "vitest";
import { classifyBoardFamily } from "./boardFamily";

describe("V3 board families", () => {
  it("is invariant under suit-isomorphic substitutions", () => {
    expect(classifyBoardFamily(["Ah", "Ac", "7d"]).familyId)
      .toBe(classifyBoardFamily(["As", "Ad", "7c"]).familyId);
  });

  it("distinguishes top-paired, low-paired, monotone and connected boards", () => {
    expect(new Set([
      classifyBoardFamily(["Ah", "Ac", "7d"]).familyId,
      classifyBoardFamily(["7h", "7c", "Ad"]).familyId,
      classifyBoardFamily(["Ah", "9h", "3h"]).familyId,
      classifyBoardFamily(["9h", "8c", "7d"]).familyId,
    ])).toHaveLength(4);
  });

  it("preserves dynamic turn and river transitions", () => {
    const flop = classifyBoardFamily(["Kh", "8c", "2d"]);
    const turn = classifyBoardFamily(["Kh", "8c", "2d", "7h"]);
    expect(flop.street).toBe("flop");
    expect(turn.street).toBe("turn");
    expect(turn.familyId).not.toBe(flop.familyId);
  });
});
