import type { Card } from "../engine/cards";
import type { GameState } from "../game/game";
import type {
  PublicAction,
  PublicDecisionState,
  PublicPlayer,
} from "./types";

function actingHole(state: GameState, seat: number): [Card, Card] {
  const hole = state.players[seat]?.hole;
  if (!hole || hole.length !== 2) throw new Error("决策座位必须有两张已知底牌");
  return [hole[0], hole[1]];
}

function publicPlayers(state: GameState): PublicPlayer[] {
  return state.players.map((player) => ({
    seat: player.seat,
    playerId: player.playerId,
    position: player.position,
    stack: player.stack,
    streetBet: player.streetBet,
    totalBet: player.totalBet,
    folded: player.folded,
    allIn: player.allIn,
  }));
}

function publicActions(state: GameState): PublicAction[] {
  return state.log.map((entry) => ({
    street: entry.street,
    actorSeat: entry.actorSeat,
    kind: entry.kind,
    amount: entry.amount,
    toAmount: entry.toAmount,
    potBefore: entry.potBefore ?? Math.max(0, entry.potAfter - entry.amount),
    potAfter: entry.potAfter,
  }));
}

export function buildPublicDecisionState(
  state: GameState,
  seat: number,
): PublicDecisionState {
  if (state.phase !== "playing") throw new Error("只能为进行中的牌局构建决策状态");
  if (state.toAct !== seat || state.pending[0] !== seat)
    throw new Error("决策座位与当前说话人不一致");

  return {
    schemaVersion: 1,
    seed: state.seed,
    decisionIndex:
      (state.strategyDecisions?.length ?? state.policyDecisions.length) +
      state.assessments.length,
    actingSeat: seat,
    buttonSeat: state.button,
    smallBlindSeat: state.smallBlind,
    bigBlindSeat: state.bigBlind,
    blindLevel: { small: 1, big: 2 },
    street: state.street,
    heroHole: actingHole(state, seat),
    board: [...state.board],
    pot: state.pot,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    legal: { ...state.legal },
    pendingSeats: [...state.pending],
    players: publicPlayers(state),
    actions: publicActions(state),
    tableProfileId: state.tableProfileId,
  };
}
