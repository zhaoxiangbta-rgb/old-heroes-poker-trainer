import { describe, expect, it } from "vitest";
import { candidateActions } from "./approxGto";
import {
  TABLE_PROFILES,
  actionKey,
  decideWithProfile,
  type TableProfileId,
} from "./tableProfiles";
import type { DecisionContext } from "./types";
import {
  DEFAULT_PLAYER_PROFILES,
  effectivePlayerProfile,
  type HandPlayerProfile,
} from "./playerProfiles";

function preflopSpot(seed: number): DecisionContext {
  return {
    seed,
    decisionIndex: 2,
    seat: 4,
    street: "preflop",
    position: "CO",
    hole: ["Ah", "9h"],
    board: [],
    pot: 11,
    currentBet: 6,
    streetBet: 0,
    stack: 200,
    effectiveStack: 194,
    activePlayers: 5,
    playersBehind: 2,
    minRaiseTo: 18,
    maxRaiseTo: 200,
    legal: { fold: true, check: false, call: 6, raise: true },
    visibleLine: [
      { street: "preflop", actorSeat: 1, kind: "raise", toAmount: 6, potAfter: 11 },
    ],
  };
}

function distribution(profileId: TableProfileId, playerProfile?: HandPlayerProfile) {
  let calls = 0;
  let voluntary = 0;
  let raises = 0;
  let totalRaiseToPot = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    const context = preflopSpot(seed);
    const decision = decideWithProfile(context, profileId, playerProfile);
    const legalKeys = candidateActions(context).map(actionKey);
    expect(legalKeys).toContain(actionKey(decision.action));
    if (decision.action.type !== "fold") voluntary += 1;
    if (decision.action.type === "call") calls += 1;
    if (decision.action.type === "raise") {
      raises += 1;
      totalRaiseToPot += decision.action.to / context.pot;
    }
  }
  return {
    callRate: calls / 400,
    vpip: voluntary / 400,
    raiseRate: raises / 400,
    meanRaiseToPot: raises ? totalRaiseToPot / raises : 0,
  };
}

describe("table profiles", () => {
  it("exposes the three Chinese table styles", () => {
    expect(Object.keys(TABLE_PROFILES)).toEqual(["balanced", "friends", "loose-wild"]);
    expect(TABLE_PROFILES.balanced.name).toBe("标准均衡局");
    expect(TABLE_PROFILES.friends.name).toBe("普通朋友局");
    expect(TABLE_PROFILES["loose-wild"].name).toBe("宽松疯狂局");
  });

  it("makes friend games call wider and loose-wild games participate and raise most", () => {
    const balanced = distribution("balanced");
    const friends = distribution("friends");
    const looseWild = distribution("loose-wild");

    expect(friends.callRate).toBeGreaterThan(balanced.callRate);
    expect(looseWild.vpip).toBeGreaterThan(friends.vpip);
    expect(looseWild.raiseRate).toBeGreaterThan(friends.raiseRate);
    expect(looseWild.meanRaiseToPot + 1e-12).toBeGreaterThanOrEqual(
      friends.meanRaiseToPot,
    );
  });

  it("replays the same profile decision from the same seed", () => {
    const first = decideWithProfile(preflopSpot(913), "friends");
    const replay = decideWithProfile(preflopSpot(913), "friends");
    expect(replay).toEqual(first);
  });

  it("makes the loose-aggressive profile continue and raise more than the tight-passive profile", () => {
    const looseAggressive = distribution(
      "balanced",
      effectivePlayerProfile(DEFAULT_PLAYER_PROFILES[0], "balanced", 9),
    );
    const tightPassive = distribution(
      "balanced",
      effectivePlayerProfile(DEFAULT_PLAYER_PROFILES[5], "balanced", 9),
    );

    expect(looseAggressive.vpip).toBeGreaterThan(tightPassive.vpip + 0.15);
    expect(looseAggressive.raiseRate).toBeGreaterThan(tightPassive.raiseRate + 0.1);
  });

  it("raises bluff candidates without reducing value weight", () => {
    const context: DecisionContext = {
      ...preflopSpot(81),
      street: "flop",
      hole: ["Ah", "3c"],
      board: ["As", "7c", "Kd"],
      pot: 24,
      currentBet: 16,
      streetBet: 0,
      legal: { fold: true, check: false, call: 16, raise: true },
      minRaiseTo: 32,
      maxRaiseTo: 194,
      activePlayers: 3,
      playersBehind: 0,
      visibleLine: [],
    };
    const base = effectivePlayerProfile(DEFAULT_PLAYER_PROFILES[3], "balanced", 81);
    const low = decideWithProfile(context, "balanced", {
      ...base,
      effective: { ...base.effective, bluff: 5 },
    });
    const high = decideWithProfile(context, "balanced", {
      ...base,
      effective: { ...base.effective, bluff: 95 },
    });
    const total = (decision: typeof low, intents: string[]) =>
      decision.candidates
        .filter((candidate) => intents.includes(candidate.intent))
        .reduce((sum, candidate) => sum + candidate.probability, 0);

    expect(total(high, ["bluff", "semi-bluff"])).toBeGreaterThan(
      total(low, ["bluff", "semi-bluff"]),
    );
    expect(total(high, ["value"])).toBeGreaterThanOrEqual(total(low, ["value"]));
  });
});
