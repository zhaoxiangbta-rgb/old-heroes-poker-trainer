import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import type { WeaknessTag } from "./types";
import { matchesTargetScene, newTargetedGame } from "./targetedScenario";

const extendedHitRateTags: WeaknessTag[] = [
  "missed-worse-calls",
  "river-value-bluff-confusion",
  "dirty-outs",
  "players-behind",
];

describe("targeted full-hand generation extended hit rates", () => {
  it.each(extendedHitRateTags)("raises the deterministic setup hit rate for %s", (tag) => {
    let targetedHits = 0;
    let balancedHits = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const target = { mode: "manual" as const, tag };
      const targeted = newTargetedGame(seed, "friends", target);
      if (targeted.matched) targetedHits += 1;
      if (matchesTargetScene(newGame(seed), target)) balancedHits += 1;
      expect(targeted.attempts).toBeLessThanOrEqual(24);
      expect(targeted.game.trainingTarget).toEqual(target);
      expect(newTargetedGame(seed, "friends", target)).toEqual(targeted);
    }
    expect(targetedHits).toBeGreaterThan(balancedHits);
  }, 60_000);
});
