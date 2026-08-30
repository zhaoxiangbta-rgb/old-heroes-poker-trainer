import { describe, expect, it } from "vitest";
import type { WeightedCombo } from "../../engine/ranges";
import { compareBlockerEffects, profileCombo } from "./comboProfile";

function combo(cards: WeightedCombo["cards"], weight: number): WeightedCombo {
  return { cards, weight, label: cards.join(""), history: [] };
}

describe("V3 combo profiles", () => {
  it("separates pocket-set construction from board-pair trips", () => {
    expect(profileCombo(["7s", "7c"], ["7h", "Ad", "2c"]).construction)
      .toBe("pocket-set");
    expect(profileCombo(["As", "2s"], ["Ah", "Ac", "7d"]).construction)
      .toBe("board-pair-trips");
  });

  it("does not describe already-made trips as a future probability", () => {
    const profile = profileCombo(["9h", "9d"], ["9c", "3s", "2h"]);
    expect(profile.madeCategory).toBe("three-of-a-kind");
    expect(profile.currentMade).toBe(true);
    expect(profile.improvementOuts.clean).toBeGreaterThanOrEqual(0);
  });

  it("treats a board pair with weak hole cards as shared-board air rather than a private pair", () => {
    const profile = profileCombo(["2h", "3h"], ["Js", "4d", "Jc"]);

    expect(profile.madeCategory).toBe("pair");
    expect(profile.publicMadeHand).toBe(true);
    expect(profile.construction).toBe("board-only");
    expect(profile.currentMade).toBe(false);
    expect(profile.showdownTier).toBe("air");
  });

  it("measures blockers to worse calls separately from better continues", () => {
    const profile = profileCombo(["As", "2s"], ["Ah", "Ac", "7d"]);
    const range = [
      combo(["2s", "Kh"], 0.45),
      combo(["As", "7h"], 0.15),
      combo(["7s", "7c"], 0.4),
    ];
    const fact = compareBlockerEffects(profile, range);
    expect(fact.worseCallBlocked).toBeGreaterThan(0);
    expect(fact.worseCallBlocked).not.toBe(fact.betterContinueBlocked);
  });
});
