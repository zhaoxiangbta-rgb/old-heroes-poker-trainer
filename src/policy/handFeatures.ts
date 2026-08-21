import { bestHand, compareHands } from "../engine/evaluator";
import { parseCard, type Card } from "../engine/cards";

export type MadeHand =
  | "high-card"
  | "pair"
  | "top-pair"
  | "overpair"
  | "two-pair"
  | "set"
  | "trips"
  | "straight"
  | "flush"
  | "full-house"
  | "quads"
  | "straight-flush";

export type HandFeatures = {
  made: MadeHand;
  category: number;
  strength: number;
  kicker: number;
  draws: Array<"flush-draw" | "open-ended" | "gutshot" | "backdoor-flush">;
  cleanOutEstimate: number;
  nutBlockers: number;
  texture: number;
  pairedBoard: boolean;
  publicMadeHand: boolean;
};

function counts(values: Array<number | string>) {
  const result = new Map<number | string, number>();
  values.forEach((value) => result.set(value, (result.get(value) ?? 0) + 1));
  return result;
}

function straightDraw(values: number[]) {
  const unique = new Set(values);
  if (unique.has(14)) unique.add(1);
  let open = false;
  let gutshot = false;
  for (let low = 1; low <= 10; low++) {
    const present = Array.from({ length: 5 }, (_, offset) => low + offset).filter((rank) => unique.has(rank));
    if (present.length !== 4) continue;
    const missing = Array.from({ length: 5 }, (_, offset) => low + offset).find((rank) => !unique.has(rank))!;
    if (missing === low || missing === low + 4) open = true;
    else gutshot = true;
  }
  return { open, gutshot };
}

function madeName(hole: [Card, Card], board: Card[], category: number): MadeHand {
  const holeRanks = hole.map((card) => parseCard(card).rank);
  const boardRanks = board.map((card) => parseCard(card).rank);
  const boardCounts = counts(boardRanks);
  if (category === 0) return "high-card";
  if (category === 1) {
    if (holeRanks[0] === holeRanks[1] && holeRanks[0] > Math.max(...boardRanks)) return "overpair";
    const matched = holeRanks.find((rank) => boardCounts.has(rank));
    if (matched === Math.max(...boardRanks)) return "top-pair";
    return "pair";
  }
  if (category === 2) return "two-pair";
  if (category === 3) {
    if (holeRanks[0] === holeRanks[1] && boardCounts.get(holeRanks[0]) === 1) return "set";
    return "trips";
  }
  return (["straight", "flush", "full-house", "quads", "straight-flush"] as MadeHand[])[category - 4];
}

export function extractHandFeatures(hole: [Card, Card], board: Card[]): HandFeatures {
  if (board.length < 3 || board.length > 5) throw new Error("翻后特征需要 3 至 5 张公共牌");
  const all = [...hole, ...board];
  const parsed = all.map(parseCard);
  const boardParsed = board.map(parseCard);
  const hand = bestHand(all);
  const rankValues = parsed.map((card) => card.rank);
  const suitCounts = counts(parsed.map((card) => card.suit));
  const boardSuitCounts = counts(boardParsed.map((card) => card.suit));
  const boardRankCounts = counts(boardParsed.map((card) => card.rank));
  const maxSuit = Math.max(...[...suitCounts.values()]);
  const maxBoardSuit = Math.max(...[...boardSuitCounts.values()]);
  const straight = straightDraw(rankValues);
  const draws: HandFeatures["draws"] = [];
  if (hand.category < 5 && maxSuit === 4) draws.push("flush-draw");
  else if (maxSuit === 3 && board.length === 3) draws.push("backdoor-flush");
  if (hand.category < 4 && straight.open) draws.push("open-ended");
  else if (hand.category < 4 && straight.gutshot) draws.push("gutshot");

  const boardUnique = [...new Set(boardParsed.map((card) => card.rank))].sort((a, b) => a - b);
  const span = boardUnique.at(-1)! - boardUnique[0];
  const connected = Math.max(0, 5 - span / Math.max(1, boardUnique.length - 1));
  const pairedBoard = [...boardRankCounts.values()].some((count) => count >= 2);
  const texture = Math.min(
    1,
    maxBoardSuit * 0.13 + connected * 0.09 + (pairedBoard ? 0.08 : 0),
  );
  const kicker = Math.max(...hole.map((card) => parseCard(card).rank)) / 14;
  const publicMadeHand =
    board.length === 5 && compareHands(hand, bestHand(board)) === 0;
  const nutBlockers = hole.filter((card) => {
    const parsedCard = parseCard(card);
    return parsedCard.rank === 14 && (boardSuitCounts.get(parsedCard.suit) ?? 0) >= 2;
  }).length;
  const cleanOutEstimate =
    (draws.includes("flush-draw") ? 9 : 0) +
    (draws.includes("open-ended") ? 8 : draws.includes("gutshot") ? 4 : 0);
  const strength = Math.min(1, hand.category / 8 + hand.tiebreak[0] / 120);

  return {
    made: madeName(hole, board, hand.category),
    category: hand.category,
    strength,
    kicker,
    draws,
    cleanOutEstimate,
    nutBlockers,
    texture,
    pairedBoard,
    publicMadeHand,
  };
}
