import { describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { captureHeroDecision } from "./capture";
import { deepReviewStateHash } from "./stateHash";
import type { DeepReviewInput } from "./types";

function input(): DeepReviewInput {
  const game = newGame(91);
  return {
    handNo: game.handNo,
    seed: game.seed,
    strategyVersion: game.strategyVersion,
    calculatorVersion: "deep-review-v1",
    decisions: [captureHeroDecision(game)],
  };
}

describe("deep review state hash", () => {
  it("hashes the same review input identically", () => {
    const original = input();
    expect(deepReviewStateHash(original)).toBe(
      deepReviewStateHash(structuredClone(original)),
    );
  });

  it("changes when a material public fact changes", () => {
    const original = input();
    const changed = structuredClone(original);
    changed.decisions[0].pot += 1;
    expect(deepReviewStateHash(changed)).not.toBe(deepReviewStateHash(original));
  });
});
