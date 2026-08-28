import { assertUniqueCards, parseCard, type Card } from "../engine/cards";
import type { Street } from "../game/game";

export type PostflopTexture = {
  street: Exclude<Street, "preflop">;
  canonicalBoard: string[];
  highCard: number;
  paired: boolean;
  monotone: boolean;
  twoTone: boolean;
  connectedness: number;
  wetness: number;
  clusterId: string;
};

function canonicalizeSuits(board: Card[]) {
  const aliases = new Map<string, string>();
  const canonical = ["a", "b", "c", "d"];
  return board.map((card) => {
    const parsed = parseCard(card);
    if (!aliases.has(parsed.suit)) {
      aliases.set(parsed.suit, canonical[aliases.size]);
    }
    return `${card[0]}${aliases.get(parsed.suit)}`;
  });
}

function countBy<T>(values: T[]) {
  const result = new Map<T, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function boardConnectedness(ranks: number[]) {
  const unique = new Set(ranks);
  if (unique.has(14)) unique.add(1);
  let maximum = 1;
  for (let low = 1; low <= 10; low += 1) {
    let present = 0;
    for (let rank = low; rank < low + 5; rank += 1) {
      if (unique.has(rank)) present += 1;
    }
    maximum = Math.max(maximum, present);
  }
  return Math.max(0, Math.min(1, (maximum - 1) / 4));
}

function highCardGroup(rank: number) {
  if (rank >= 13) return "premium";
  if (rank >= 11) return "broadway";
  if (rank >= 8) return "middle";
  return "low";
}

export function classifyPostflopTexture(board: Card[]): PostflopTexture {
  if (board.length < 3 || board.length > 5) {
    throw new Error("翻后牌面需要 3 至 5 张公共牌");
  }
  assertUniqueCards(board);
  const parsed = board.map(parseCard);
  const ranks = parsed.map((card) => card.rank);
  const rankCounts = countBy(ranks);
  const suitCounts = [...countBy(parsed.map((card) => card.suit)).values()]
    .sort((a, b) => b - a);
  const highCard = Math.max(...ranks);
  const paired = [...rankCounts.values()].some((count) => count >= 2);
  const monotone = suitCounts[0] === board.length;
  const twoTone = !monotone && suitCounts[0] >= 2;
  const connectedness = boardConnectedness(ranks);
  const suitPressure = monotone ? 1 : suitCounts[0] >= 3 ? 0.72 : twoTone ? 0.38 : 0;
  const wetness = Math.min(
    1,
    connectedness * 0.56 + suitPressure * 0.34 + (paired ? 0.1 : 0),
  );
  const street: Exclude<Street, "preflop"> = board.length === 3
    ? "flop"
    : board.length === 4 ? "turn" : "river";
  const pairing = Math.max(...rankCounts.values()) >= 3
    ? "trips"
    : paired ? "paired" : "unpaired";
  const suitClass = monotone ? "mono" : suitCounts[0] >= 3 ? "three-flush" : twoTone ? "two-tone" : "rainbow";
  const connectionClass = connectedness >= 0.75
    ? "connected"
    : connectedness >= 0.5 ? "semi-connected" : "disconnected";

  return {
    street,
    canonicalBoard: canonicalizeSuits(board),
    highCard,
    paired,
    monotone,
    twoTone,
    connectedness,
    wetness,
    clusterId: `pftex1:${street}:${highCardGroup(highCard)}:${pairing}:${suitClass}:${connectionClass}`,
  };
}
