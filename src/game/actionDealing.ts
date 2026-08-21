import type { Card } from "../engine/cards";
import { preflopTier } from "../policy/preflop";
import {
  newGame,
  nextHandAtSeed,
  type GameState,
  type NewGameOptions,
  type Player,
} from "./game";

const MAX_CANDIDATES = 12;

type RosterEntry = Pick<Player, "name" | "stack" | "buyIn" | "rebuys"> & {
  playerId?: string;
};

export function isActionCandidate(state: GameState) {
  return state.players.filter((player) =>
    preflopTier(player.hole as [Card, Card], player.position) <= 45,
  ).length >= 2;
}

export function selectActionCandidate(
  baseSeed: number,
  create: (seed: number) => GameState,
) {
  let candidate = create(baseSeed >>> 0);
  for (let offset = 0; offset < MAX_CANDIDATES; offset += 1) {
    candidate = create((baseSeed + offset) >>> 0);
    if (isActionCandidate(candidate)) return candidate;
  }
  return candidate;
}

export function newActionGame(
  baseSeed: number,
  handNo = 1,
  stacks?: number[],
  roster?: RosterEntry[],
  options: NewGameOptions = {},
) {
  return selectActionCandidate(baseSeed, (seed) =>
    newGame(seed, handNo, stacks, roster, options),
  );
}

export function nextActionHand(
  state: GameState,
  options: NewGameOptions = {},
) {
  return selectActionCandidate(state.seed + 1, (seed) =>
    nextHandAtSeed(state, seed, {
      tableProfileId: options.tableProfileId ?? state.tableProfileId,
      trainingTarget: { mode: "none" },
      playerProfiles: options.playerProfiles,
    }),
  );
}
