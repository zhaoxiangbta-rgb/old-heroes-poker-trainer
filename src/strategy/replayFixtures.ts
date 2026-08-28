import type { Card } from "../engine/cards";
import type { Legal, Position, Street } from "../game/game";
import type {
  PublicAction,
  PublicDecisionState,
  StrategyRequest,
} from "./types";

export type ReplayFixtureName =
  | "four-way-three-checks-to-button"
  | "turn-overbet-set"
  | "turn-overbet-nut-flush-draw"
  | "preflop-deep-reraise";

type FixtureInput = {
  street: Street;
  position: Position;
  hole: [Card, Card];
  board: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  legal: Legal;
  activePlayers: number;
  actions: PublicAction[];
  streetBet?: number;
};

function request(input: FixtureInput, seed: number): StrategyRequest {
  const actingSeat = input.activePlayers - 1;
  const players = Array.from({ length: input.activePlayers }, (_, seat) => ({
    seat,
    playerId: seat === actingSeat ? "hero" : `range-seat-${seat}`,
    position: seat === actingSeat ? input.position : (["UTG", "HJ", "CO"] as Position[])[seat] ?? "BB",
    stack: seat === actingSeat ? input.legal.maxRaiseTo - (input.streetBet ?? 0) : 170,
    streetBet: seat === actingSeat ? input.streetBet ?? 0 : input.currentBet,
    totalBet: seat === actingSeat ? input.streetBet ?? 0 : input.currentBet,
    folded: false,
    allIn: false,
  }));
  const state: PublicDecisionState = {
    schemaVersion: 1,
    seed,
    decisionIndex: input.actions.length,
    actingSeat,
    buttonSeat: actingSeat,
    smallBlindSeat: 0,
    bigBlindSeat: Math.min(1, input.activePlayers - 1),
    blindLevel: { small: 1, big: 2 },
    street: input.street,
    heroHole: input.hole,
    board: input.board,
    pot: input.pot,
    currentBet: input.currentBet,
    minRaise: input.minRaise,
    legal: input.legal,
    pendingSeats: [actingSeat],
    players,
    actions: input.actions,
    tableProfileId: "balanced",
  };
  return {
    state,
    ranges: {
      version: 1,
      lastActionIndex: input.actions.length,
      bySeat: Object.fromEntries(players
        .filter((player) => player.seat !== actingSeat)
        .map((player) => [player.seat, []])),
    },
    deadlineMs: 250,
  };
}

const check = (actorSeat: number): PublicAction => ({
  street: "flop",
  actorSeat,
  kind: "check",
  amount: 0,
  toAmount: 0,
  potBefore: 24,
  potAfter: 24,
});

const overbet: PublicAction = {
  street: "turn",
  actorSeat: 0,
  kind: "bet",
  amount: 30,
  toAmount: 30,
  potBefore: 20,
  potAfter: 50,
};

function fixtureInput(name: ReplayFixtureName): FixtureInput {
  if (name === "four-way-three-checks-to-button") return {
    street: "flop",
    position: "BTN",
    hole: ["Qh", "Jd"],
    board: ["Ah", "7c", "2s"],
    pot: 24,
    currentBet: 0,
    minRaise: 8,
    legal: {
      canFold: false,
      canCheck: true,
      canCall: false,
      canRaise: true,
      callAmount: 0,
      minRaiseTo: 8,
      maxRaiseTo: 200,
    },
    activePlayers: 4,
    actions: [check(0), check(1), check(2)],
  };
  if (name === "turn-overbet-set" || name === "turn-overbet-nut-flush-draw") return {
    street: "turn",
    position: "CO",
    hole: name === "turn-overbet-set" ? ["Ac", "Ad"] : ["Kh", "Qh"],
    board: ["Ah", "7h", "2s", "9d"],
    pot: 50,
    currentBet: 30,
    minRaise: 30,
    legal: {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 30,
      minRaiseTo: 60,
      maxRaiseTo: 170,
    },
    activePlayers: 2,
    actions: [overbet],
  };
  return {
    street: "preflop",
    position: "CO",
    hole: ["Jh", "Th"],
    board: [],
    pot: 62,
    currentBet: 40,
    minRaise: 18,
    legal: {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: true,
      callAmount: 40,
      minRaiseTo: 58,
      maxRaiseTo: 200,
    },
    activePlayers: 2,
    actions: [
      { street: "preflop", actorSeat: 0, kind: "raise", amount: 4, toAmount: 4, potBefore: 3, potAfter: 7 },
      { street: "preflop", actorSeat: 1, kind: "raise", amount: 10, toAmount: 10, potBefore: 7, potAfter: 17 },
      { street: "preflop", actorSeat: 0, kind: "raise", amount: 18, toAmount: 22, potBefore: 17, potAfter: 35 },
      { street: "preflop", actorSeat: 1, kind: "raise", amount: 30, toAmount: 40, potBefore: 35, potAfter: 65 },
    ],
  };
}

export function replayFixture(name: ReplayFixtureName, seed = 1) {
  return request(fixtureInput(name), seed);
}
