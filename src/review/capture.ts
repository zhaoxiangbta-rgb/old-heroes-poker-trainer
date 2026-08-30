import type { GameState } from "../game/game";
import type { DeepDecisionInput, VisibleReviewPlayer } from "./types";

function visiblePlayer(
  state: GameState,
  player: GameState["players"][number],
): VisibleReviewPlayer {
  const { hole, ...publicPlayer } = structuredClone(player);
  return player.seat === state.heroSeat || player.revealed
    ? { ...publicPlayer, hole }
    : publicPlayer;
}

export function captureHeroDecision(state: GameState): DeepDecisionInput {
  return {
    handNo: state.handNo,
    logIndex: state.log.length,
    street: state.street,
    heroSeat: state.heroSeat,
    heroHole: structuredClone(state.players[state.heroSeat].hole),
    board: structuredClone(state.board),
    pot: state.pot,
    currentBet: state.currentBet,
    tableProfileId: state.tableProfileId,
    legal: structuredClone(state.legal),
    visiblePlayers: state.players.map((player) => visiblePlayer(state, player)),
    log: structuredClone(state.log),
  };
}
