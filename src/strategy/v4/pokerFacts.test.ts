import { describe, expect, it } from "vitest";
import { analyzePokerFactsV4 } from "./pokerFacts";

describe("PokerFactsV4", () => {
  it("separates a public pair from private hole-card contribution", () => {
    expect(analyzePokerFactsV4(["2h", "3h"], ["Jh", "4d", "Jc"]))
      .toMatchObject({
        absoluteCategory: "pair",
        boardCategory: "pair",
        privateContribution: "none",
        relativeClass: "air",
        kickerBand: "weak",
      });
  });

  it("recognizes when a hole card improves a paired board to two pair", () => {
    expect(analyzePokerFactsV4(["4h", "3h"], ["Jh", "4d", "Jc"]))
      .toMatchObject({
        absoluteCategory: "two-pair",
        boardCategory: "pair",
        privateContribution: "two-pair",
      });
  });

  it("keeps pure air on an ace-high board distinct from a made hand", () => {
    const facts = analyzePokerFactsV4(["Jd", "2d"], ["Ac", "9s", "7s"]);
    expect(facts.absoluteCategory).toBe("high-card");
    expect(facts.boardCategory).toBe("none");
    expect(facts.privateContribution).toBe("none");
    expect(facts.relativeClass).toBe("air");
    expect(facts.draws.filter((draw) => !draw.backdoor)).toEqual([]);
  });

  it("does not promote a backdoor flush possibility to a real draw", () => {
    const facts = analyzePokerFactsV4(["2h", "3h"], ["Jh", "4d", "Jc"]);
    expect(facts.draws).toContainEqual({ kind: "flush", backdoor: true, outs: 0 });
    expect(facts.relativeClass).toBe("air");
  });

  it("recognizes an active combo draw separately from a made hand", () => {
    const facts = analyzePokerFactsV4(["9h", "8h"], ["7h", "6h", "Kd"]);
    expect(facts.privateContribution).toBe("none");
    expect(facts.relativeClass).toBe("draw");
    expect(facts.draws).toEqual(expect.arrayContaining([
      { kind: "flush", backdoor: false, outs: 9 },
      { kind: "straight", backdoor: false, outs: 8 },
    ]));
  });

  it("recognizes public river straights without claiming private contribution", () => {
    const facts = analyzePokerFactsV4(["2c", "3d"], ["Ah", "Kh", "Qh", "Jh", "Th"]);
    expect(facts.absoluteCategory).toBe("straight-flush");
    expect(facts.boardCategory).toBe("straight-flush");
    expect(facts.privateContribution).toBe("none");
  });
});
