import { describe, expect, it } from "vitest";
import { act, newGame } from "../game/game";
import type { TableProfileId } from "../policy/tableProfiles";
import type { WeaknessTag } from "./types";
import {
  matchesTargetScene,
  newTargetedGame,
  projectedCommunityCards,
} from "./targetedScenario";

const tags: WeaknessTag[] = [
  "overcalling",
  "squeeze-call-too-wide",
  "multiway-top-pair",
  "slow-play-strong-hand",
  "bet-means-nuts",
  "missed-worse-calls",
  "river-value-bluff-confusion",
  "dirty-outs",
  "players-behind",
];

describe("targeted full-hand generation", () => {
  it.each([
    "multiway-top-pair",
    "slow-play-strong-hand",
    "missed-worse-calls",
    "river-value-bluff-confusion",
    "dirty-outs",
  ] as WeaknessTag[])("only marks %s matched from the predetermined community-card setup", (tag) => {
    const target = { mode: "manual" as const, tag };
    const result = newTargetedGame(17, "friends", target);
    expect(result.matched).toBe(matchesTargetScene(result.game, target));
    if (result.matched) {
      expect(result.game.street).toBe("preflop");
      expect(projectedCommunityCards(result.game)).toHaveLength(5);
    }
  });

  it.each(tags)("raises the deterministic setup hit rate for %s", (tag) => {
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

  it("falls back to a legal replayable game when the matcher cannot hit", () => {
    const result = newTargetedGame(
      77,
      "balanced",
      { mode: "manual", tag: "dirty-outs" },
      undefined,
      () => false,
    );
    expect(result).toMatchObject({ matched: false, attempts: 24 });
    expect(result.game.version).toBe(9);
    expect(new Set(result.game.players.flatMap((player) => player.hole)).size).toBe(
      result.game.players.length * 2,
    );
  });

  it("completes a legal short-stack hand for every profile and training target", () => {
    const profiles: TableProfileId[] = ["balanced", "friends", "loose-wild"];
    const roster = ["你", "阿岚", "北辰", "墨川", "青禾", "老周"].map(
      (name) => ({ name, stack: 2, buyIn: 2, rebuys: 0 }),
    );
    for (const profile of profiles) {
      for (const [index, tag] of tags.entries()) {
        let state = newTargetedGame(
          1_000 + index,
          profile,
          { mode: "manual", tag },
          roster,
        ).game;
        for (let guard = 0; state.phase === "playing" && guard < 10; guard += 1) {
          state = act(
            state,
            state.legal.canCall
              ? { type: "call" }
              : state.legal.canCheck
                ? { type: "check" }
                : { type: "fold" },
          );
        }
        expect(state.phase).toBe("review");
        expect(state.players.reduce((sum, player) => sum + player.stack, 0)).toBe(12);
      }
    }
  });
});
