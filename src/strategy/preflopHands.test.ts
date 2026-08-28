import { describe, expect, it } from "vitest";
import {
  ALL_PREFLOP_HANDS,
  canonicalPreflopHand,
  handPercentile,
  handStrength,
} from "./preflopHands";

describe("169 preflop hand abstraction", () => {
  it("enumerates every canonical hand exactly once", () => {
    expect(ALL_PREFLOP_HANDS).toHaveLength(169);
    expect(new Set(ALL_PREFLOP_HANDS).size).toBe(169);
    expect(ALL_PREFLOP_HANDS).toEqual(expect.arrayContaining(["AA", "AKs", "AKo", "72o"]));
  });

  it("orders premiums, suited broadways and trash consistently", () => {
    expect(handStrength("AA")).toBeGreaterThan(handStrength("AKs"));
    expect(handStrength("AKs")).toBeGreaterThan(handStrength("AKo"));
    expect(handStrength("AKo")).toBeGreaterThan(handStrength("72o"));
    expect(handPercentile("AA")).toBe(0);
    expect(handPercentile("72o")).toBeGreaterThan(0.85);
  });

  it("maps suit permutations to the same hand class and percentile", () => {
    expect(canonicalPreflopHand(["Ah", "Kh"])).toBe("AKs");
    expect(canonicalPreflopHand(["As", "Ks"])).toBe("AKs");
    expect(canonicalPreflopHand(["Ah", "Kc"])).toBe("AKo");
    expect(handPercentile(canonicalPreflopHand(["Ah", "Kh"]))).toBe(
      handPercentile(canonicalPreflopHand(["As", "Ks"])),
    );
  });
});
