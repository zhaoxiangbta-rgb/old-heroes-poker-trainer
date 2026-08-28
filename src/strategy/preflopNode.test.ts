import { describe, expect, it } from "vitest";
import type { Card } from "../engine/cards";
import type { Legal, Position } from "../game/game";
import {
  classifyPreflopNode,
  nearestStackBuckets,
  recommendedRaiseTo,
} from "./preflopNode";
import type { PublicAction, PublicDecisionState } from "./types";

function action(
  actorSeat: number,
  kind: PublicAction["kind"],
  toAmount: number,
  potBefore = 3,
): PublicAction {
  const amount = kind === "call" ? Math.max(0, toAmount - 2) : toAmount;
  return {
    street: "preflop",
    actorSeat,
    kind,
    amount,
    toAmount,
    potBefore,
    potAfter: potBefore + amount,
  };
}

function state(input: {
  actorSeat?: number;
  actorPosition?: Position;
  actions?: PublicAction[];
  stack?: number;
  streetBet?: number;
  currentBet?: number;
  legal?: Partial<Legal>;
} = {}): PublicDecisionState {
  const actorSeat = input.actorSeat ?? 3;
  const positions: Position[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
  const players = positions.map((position, seat) => ({
    seat,
    playerId: `seat-${seat}`,
    position: seat === actorSeat ? (input.actorPosition ?? position) : position,
    stack: seat === actorSeat ? (input.stack ?? 198) : 198,
    streetBet: seat === actorSeat ? (input.streetBet ?? 0) : 0,
    totalBet: seat === actorSeat ? (input.streetBet ?? 0) : 0,
    folded: false,
    allIn: false,
  }));
  const currentBet = input.currentBet ?? 2;
  const legal: Legal = {
    canFold: currentBet > (input.streetBet ?? 0),
    canCheck: currentBet === (input.streetBet ?? 0),
    canCall: currentBet > (input.streetBet ?? 0),
    canRaise: true,
    callAmount: Math.max(0, currentBet - (input.streetBet ?? 0)),
    minRaiseTo: Math.max(4, currentBet * 2),
    maxRaiseTo: input.stack ?? 198,
    ...input.legal,
  };
  return {
    schemaVersion: 1,
    seed: 42,
    decisionIndex: input.actions?.length ?? 0,
    actingSeat: actorSeat,
    buttonSeat: 3,
    smallBlindSeat: 4,
    bigBlindSeat: 5,
    blindLevel: { small: 1, big: 2 },
    street: "preflop",
    heroHole: ["Ah", "Kd"] as [Card, Card],
    board: [],
    pot: 12,
    currentBet,
    minRaise: 2,
    legal,
    pendingSeats: [actorSeat],
    players,
    actions: input.actions ?? [],
    tableProfileId: "balanced",
  };
}

describe("preflop blueprint node classifier", () => {
  it("classifies unopened and blind-defense nodes from public actions", () => {
    expect(classifyPreflopNode(state()).spot).toBe("unopened");
    const facingOpen = state({
      actorSeat: 5,
      actorPosition: "BB",
      streetBet: 2,
      currentBet: 5,
      actions: [action(2, "raise", 5)],
    });
    expect(classifyPreflopNode(facingOpen)).toMatchObject({
      spot: "blind-defense",
      actingPosition: "BB",
      openerPosition: "CO",
      raiseCount: 1,
    });
  });

  it("detects isolation, squeeze, three-bet, four-bet and all-in pressure", () => {
    expect(classifyPreflopNode(state({
      actions: [action(0, "call", 2)],
    })).spot).toBe("isolate-limpers");
    expect(classifyPreflopNode(state({
      actions: [action(0, "raise", 5), action(1, "call", 5, 8)],
      currentBet: 5,
    })).spot).toBe("squeeze");
    expect(classifyPreflopNode(state({
      actions: [action(0, "raise", 5), action(1, "raise", 16, 8)],
      currentBet: 16,
    })).spot).toBe("facing-3bet");
    expect(classifyPreflopNode(state({
      actions: [action(0, "raise", 5), action(1, "raise", 16), action(0, "raise", 38)],
      currentBet: 38,
    })).spot).toBe("facing-4bet");
    expect(classifyPreflopNode(state({
      actions: [action(0, "raise", 5), action(1, "all-in", 60)],
      currentBet: 60,
      legal: { canRaise: false },
    })).spot).toBe("facing-all-in");
  });

  it("interpolates only between the six supported stack buckets", () => {
    expect(nearestStackBuckets(25)).toEqual({ lower: 25, upper: 25, weight: 0 });
    expect(nearestStackBuckets(70)).toEqual({ lower: 60, upper: 100, weight: 0.25 });
    expect(nearestStackBuckets(8)).toEqual({ lower: 25, upper: 25, weight: 0 });
    expect(nearestStackBuckets(260)).toEqual({ lower: 200, upper: 200, weight: 0 });
  });

  it("always returns a rule-engine legal raise-to amount", () => {
    const unopened = state({ legal: { minRaiseTo: 4, maxRaiseTo: 198 } });
    expect(recommendedRaiseTo(classifyPreflopNode(unopened), unopened)).toBe(5);

    const squeeze = state({
      actions: [action(0, "raise", 6), action(1, "call", 6, 9)],
      currentBet: 6,
      legal: { minRaiseTo: 10, maxRaiseTo: 22 },
    });
    expect(recommendedRaiseTo(classifyPreflopNode(squeeze), squeeze)).toBe(22);

    const fourBet = state({
      actions: [action(0, "raise", 5), action(1, "raise", 16)],
      currentBet: 16,
      legal: { minRaiseTo: 27, maxRaiseTo: 31 },
    });
    expect(recommendedRaiseTo(classifyPreflopNode(fourBet), fourBet)).toBe(31);
  });
});
