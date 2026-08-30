import { assertUniqueCards, parseCard, type Card } from "../../engine/cards";
import type { BoardFamilyV3 } from "../types";

function counts(values: Array<number | string>) {
  const result = new Map<number | string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function straightPressure(ranks: number[]) {
  const unique = new Set(ranks);
  if (unique.has(14)) unique.add(1);
  let best = 0;
  for (let low = 1; low <= 10; low += 1) {
    let present = 0;
    for (let rank = low; rank < low + 5; rank += 1) if (unique.has(rank)) present += 1;
    best = Math.max(best, present);
  }
  return best;
}

export function classifyBoardFamily(board: Card[]): BoardFamilyV3 {
  if (board.length < 3 || board.length > 5) throw new Error("牌面族需要 3 至 5 张公共牌");
  assertUniqueCards(board);
  const parsed = board.map(parseCard);
  const ranks = parsed.map((card) => card.rank);
  const rankCounts = [...counts(ranks).entries()]
    .map(([rank, count]) => ({ rank: Number(rank), count }))
    .sort((first, second) => second.count - first.count || second.rank - first.rank);
  const suitCounts = [...counts(parsed.map((card) => card.suit)).values()].sort((a, b) => b - a);
  const high = Math.max(...ranks);
  const highCardBand = high === 14
    ? "ace-high"
    : high >= 11 ? "broadway-high" : high >= 8 ? "mid" : "low";
  const paired = rankCounts.filter((group) => group.count >= 2);
  let pairedStructure: BoardFamilyV3["pairedStructure"] = "unpaired";
  if (rankCounts[0].count >= 3) pairedStructure = "trips";
  else if (paired.length >= 2) pairedStructure = "two-pair";
  else if (paired.length === 1) pairedStructure = paired[0].rank === high ? "top-paired" : "low-paired";
  const maxSuit = suitCounts[0];
  const suitStructure: BoardFamilyV3["suitStructure"] = maxSuit >= 4
    ? "four-flush"
    : maxSuit === 3 ? "monotone" : maxSuit === 2 ? "two-tone" : "rainbow";
  const pressure = straightPressure(ranks);
  const connectivity: BoardFamilyV3["connectivity"] = pressure >= 4
    ? "connected"
    : pressure === 3 ? "gutshot-rich" : "disconnected";
  const street = board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  return {
    street,
    highCardBand,
    pairedStructure,
    suitStructure,
    connectivity,
    straightPressure: pressure,
    familyId: ["bf3", street, highCardBand, pairedStructure, suitStructure, connectivity, `s${pressure}`].join(":"),
  };
}
