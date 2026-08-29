import type { Card } from "../engine/cards";
import type { GameState } from "../game/game";
import { sha256Hex } from "../strategy/sha256";
import type { PublicAction } from "../strategy/types";
import type { PreActionInsightInput } from "./types";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function heroHole(game: GameState): readonly [Card, Card] {
  const hole = game.players[game.heroSeat]?.hole;
  if (!hole || hole.length !== 2) throw new Error("英雄决策必须有两张已知底牌");
  return [hole[0], hole[1]];
}

function publicActions(game: GameState): PublicAction[] {
  return game.log.map((entry) => ({
    street: entry.street,
    actorSeat: entry.actorSeat,
    kind: entry.kind,
    amount: entry.amount,
    toAmount: entry.toAmount,
    potBefore: entry.potBefore ?? Math.max(0, entry.potAfter - entry.amount),
    potAfter: entry.potAfter,
  }));
}

export function buildPreActionInsightInput(game: GameState): PreActionInsightInput {
  if (game.phase !== "playing") throw new Error("只能为进行中的牌局构建下注前分析");
  return {
    schemaVersion: 1,
    handNo: game.handNo,
    seed: game.seed,
    street: game.street,
    logIndex: game.log.length,
    heroSeat: game.heroSeat,
    heroHole: heroHole(game),
    board: [...game.board],
    pot: game.pot,
    currentBet: game.currentBet,
    minRaise: game.minRaise,
    legal: { ...game.legal },
    pendingSeats: [...game.pending],
    tableProfileId: game.tableProfileId,
    players: game.players.map((player) => ({
      seat: player.seat,
      playerId: player.playerId,
      position: player.position,
      stack: player.stack,
      streetBet: player.streetBet,
      totalBet: player.totalBet,
      folded: player.folded,
      allIn: player.allIn,
      profile: player.profile ? structuredClone(player.profile) : undefined,
    })),
    actions: publicActions(game),
  };
}

export function preActionInsightHash(input: PreActionInsightInput): string {
  return sha256Hex(JSON.stringify(stableValue(input)));
}
