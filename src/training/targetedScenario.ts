import { parseCard, type Card } from "../engine/cards";
import { extractHandFeatures } from "../policy/handFeatures";
import {
  newGame,
  type GameState,
  type NewGameOptions,
  type Player,
} from "../game/game";
import type { TableProfileId } from "../policy/tableProfiles";
import type { TrainingTarget, WeaknessTag } from "./types";

export type TargetedGameResult = {
  game: GameState;
  matched: boolean;
  attempts: number;
};

type RosterEntry = Pick<Player, "name" | "stack" | "buyIn" | "rebuys"> & {
  playerId?: string;
};
type SceneMatcher = (game: GameState, target: TrainingTarget) => boolean;

const TAG_SALTS: Record<WeaknessTag, number> = {
  overcalling: 101,
  "squeeze-call-too-wide": 211,
  "multiway-top-pair": 307,
  "slow-play-strong-hand": 401,
  "bet-means-nuts": 503,
  "missed-worse-calls": 601,
  "river-value-bluff-confusion": 701,
  "dirty-outs": 809,
  "players-behind": 907,
};

function heroRanks(game: GameState) {
  return game.players[game.heroSeat].hole.map((card) => parseCard(card).rank);
}

export function projectedCommunityCards(game: GameState) {
  if (game.board.length) return [...game.board];
  return [game.deck[1], game.deck[2], game.deck[3], game.deck[5], game.deck[7]];
}

export function matchesTargetScene(game: GameState, target: TrainingTarget) {
  if (target.mode === "none") return true;
  const hero = game.players[game.heroSeat];
  const ranks = heroRanks(game);
  const high = Math.max(...ranks);
  const activePlayers = game.players.filter((player) => !player.folded).length;
  const playersBehind = Math.max(
    0,
    game.pending.indexOf(game.heroSeat) >= 0
      ? game.pending.length - game.pending.indexOf(game.heroSeat) - 1
      : 0,
  );
  switch (target.tag) {
    case "overcalling":
      return game.street === "preflop" && game.legal.canCall && high <= 12;
    case "squeeze-call-too-wide":
      return game.street === "preflop" && game.legal.canCall && game.currentBet > 2 && playersBehind > 0;
    case "bet-means-nuts":
      return game.legal.canCall && high >= 10;
    case "players-behind":
      return playersBehind >= 3 && (hero.position === "UTG" || hero.position === "HJ");
    default: {
      const projected = projectedCommunityCards(game);
      if (projected.length < 5 || projected.some((card) => !card)) return false;
      const hole = hero.hole as [Card, Card];
      const flop = extractHandFeatures(hole, projected.slice(0, 3));
      const turn = extractHandFeatures(hole, projected.slice(0, 4));
      const river = extractHandFeatures(hole, projected);
      if (target.tag === "multiway-top-pair")
        return activePlayers >= 4 && flop.made === "top-pair";
      if (target.tag === "slow-play-strong-hand")
        return flop.category >= 2 || flop.made === "overpair" || turn.category >= 3;
      if (target.tag === "missed-worse-calls")
        return !river.publicMadeHand && river.category >= 1 && river.category <= 2;
      if (target.tag === "river-value-bluff-confusion")
        return !river.publicMadeHand && river.category <= 2;
      return [flop, turn].some((features) =>
        features.draws.length > 0
        && (features.pairedBoard || features.texture >= 0.45));
    }
  }
}

export function newTargetedGame(
  seed: number,
  profileId: TableProfileId,
  target: TrainingTarget,
  roster?: RosterEntry[],
  matcher: SceneMatcher = matchesTargetScene,
  options: Pick<
    NewGameOptions,
    "playerProfiles" | "friendBankrolls" | "heroBankroll"
  > = {},
): TargetedGameResult {
  if (target.mode === "none") {
    return {
      game: newGame(seed, 1, undefined, roster, {
        tableProfileId: profileId,
        trainingTarget: target,
        ...options,
      }),
      matched: true,
      attempts: 1,
    };
  }
  const salt = TAG_SALTS[target.tag];
  let fallback: GameState | undefined;
  for (let attempt = 1; attempt <= 24; attempt += 1) {
    const candidateSeed = (seed + Math.imul(salt, attempt)) >>> 0;
    const game = newGame(candidateSeed, 1, undefined, roster, {
      tableProfileId: profileId,
      trainingTarget: target,
      ...options,
    });
    fallback ??= game;
    if (matcher(game, target)) return { game, matched: true, attempts: attempt };
  }
  return { game: fallback!, matched: false, attempts: 24 };
}
