import { assertUniqueCards, createDeck, parseCard, type Card } from "../../engine/cards";
import { bestHand, compareHands } from "../../engine/evaluator";
import type { WeightedCombo } from "../../engine/ranges";
import { extractHandFeatures } from "../../policy/handFeatures";

export type HandCategoryV4 =
  | "high-card"
  | "pair"
  | "two-pair"
  | "trips"
  | "straight"
  | "flush"
  | "full-house"
  | "quads"
  | "straight-flush";

export type PrivateContributionV4 =
  | "none"
  | "kicker"
  | "pair"
  | "two-pair"
  | "trips"
  | "straight"
  | "flush"
  | "full-house"
  | "quads"
  | "straight-flush";

export type DrawFactV4 = {
  kind: "flush" | "straight";
  backdoor: boolean;
  outs: number;
};

export type BlockerFactV4 = {
  kind: "nut-flush" | "straight-high" | "paired-board-kicker";
  card: Card;
  strength: number;
};

export type PokerFactsV4 = {
  absoluteCategory: HandCategoryV4;
  boardCategory: HandCategoryV4 | "none";
  privateContribution: PrivateContributionV4;
  relativeClass: "nuts" | "near-nuts" | "strong-value" | "thin-value" | "showdown" | "draw" | "air";
  kickerBand: "none" | "weak" | "medium" | "strong" | "top";
  draws: DrawFactV4[];
  blockers: BlockerFactV4[];
  cleanOuts: Card[];
  dirtyOuts: Card[];
  counterfeitCards: Card[];
  publicMadeHand: boolean;
};

const CATEGORY_NAMES: HandCategoryV4[] = [
  "high-card",
  "pair",
  "two-pair",
  "trips",
  "straight",
  "flush",
  "full-house",
  "quads",
  "straight-flush",
];

function counts(values: readonly number[]) {
  const result = new Map<number, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function boardCategoryIndex(board: Card[]) {
  if (board.length === 5) return bestHand(board).category;
  const groups = [...counts(board.map((card) => parseCard(card).rank)).values()]
    .sort((first, second) => second - first);
  if (groups[0] === 4) return 7;
  if (groups[0] === 3 && groups[1] === 2) return 6;
  if (groups[0] === 3) return 3;
  if (groups[0] === 2 && groups[1] === 2) return 2;
  if (groups[0] === 2) return 1;
  return 0;
}

function kickerBand(hole: [Card, Card], category: number): PokerFactsV4["kickerBand"] {
  if (category >= 4) return "none";
  const high = Math.max(...hole.map((card) => parseCard(card).rank));
  return high === 14 ? "top" : high >= 12 ? "strong" : high >= 9 ? "medium" : "weak";
}

function contribution(
  hole: [Card, Card],
  board: Card[],
  absolute: number,
  boardCategory: number,
): PrivateContributionV4 {
  if (boardCategory > 0 && absolute === boardCategory) {
    if (board.length === 5 && compareHands(bestHand([...hole, ...board]), bestHand(board)) > 0) return "kicker";
    return "none";
  }
  if (absolute === 0) return "none";
  return (["pair", "two-pair", "trips", "straight", "flush", "full-house", "quads", "straight-flush"] as const)[absolute - 1];
}

function drawFacts(hole: [Card, Card], board: Card[]): DrawFactV4[] {
  const features = extractHandFeatures(hole, board);
  const result: DrawFactV4[] = [];
  if (features.draws.includes("flush-draw")) result.push({ kind: "flush", backdoor: false, outs: 9 });
  else if (features.draws.includes("backdoor-flush")) result.push({ kind: "flush", backdoor: true, outs: 0 });
  if (features.draws.includes("open-ended")) result.push({ kind: "straight", backdoor: false, outs: 8 });
  else if (features.draws.includes("gutshot")) result.push({ kind: "straight", backdoor: false, outs: 4 });
  return result;
}

function blockerFacts(hole: [Card, Card], board: Card[], publicMadeHand: boolean): BlockerFactV4[] {
  const boardSuits = new Map<string, number>();
  for (const card of board) {
    const suit = parseCard(card).suit;
    boardSuits.set(suit, (boardSuits.get(suit) ?? 0) + 1);
  }
  const result: BlockerFactV4[] = [];
  for (const card of hole) {
    const parsed = parseCard(card);
    if (parsed.rank === 14 && (boardSuits.get(parsed.suit) ?? 0) >= 2) {
      result.push({ kind: "nut-flush", card, strength: 1 });
    }
    if (parsed.rank >= 12 && board.some((boardCard) => parseCard(boardCard).rank >= 9)) {
      result.push({ kind: "straight-high", card, strength: parsed.rank / 14 });
    }
    if (publicMadeHand && parsed.rank >= 12) {
      result.push({ kind: "paired-board-kicker", card, strength: parsed.rank / 14 });
    }
  }
  return result;
}

function improvementCards(
  hole: [Card, Card],
  board: Card[],
  opponentRange: readonly Pick<WeightedCombo, "cards" | "weight">[],
) {
  if (board.length === 5) return { cleanOuts: [] as Card[], dirtyOuts: [] as Card[], counterfeitCards: [] as Card[] };
  const known = [...hole, ...board];
  const current = bestHand(known);
  const cleanOuts: Card[] = [];
  const dirtyOuts: Card[] = [];
  const counterfeitCards: Card[] = [];
  const representatives = opponentRange.filter((combo) => combo.weight > 0).slice(0, 64);
  for (const card of createDeck()) {
    if (known.includes(card)) continue;
    const nextBoard = [...board, card];
    const next = bestHand([...hole, ...nextBoard]);
    const nextBoardCategory = boardCategoryIndex(nextBoard);
    if (nextBoardCategory >= current.category && next.category === nextBoardCategory && current.category >= 1) {
      counterfeitCards.push(card);
    }
    if (compareHands(next, current) <= 0) continue;
    const dirty = representatives.some((combo) => {
      if (combo.cards.some((candidate) => known.includes(candidate) || candidate === card)) return false;
      return compareHands(bestHand([...combo.cards, ...nextBoard]), next) > 0;
    });
    (dirty ? dirtyOuts : cleanOuts).push(card);
  }
  return { cleanOuts, dirtyOuts, counterfeitCards };
}

function relativeClass(
  category: number,
  privateContribution: PrivateContributionV4,
  kicker: PokerFactsV4["kickerBand"],
  draws: DrawFactV4[],
): PokerFactsV4["relativeClass"] {
  if (privateContribution === "none" || privateContribution === "kicker") {
    if (category > 0 && (kicker === "top" || kicker === "strong")) return "showdown";
    return draws.some((draw) => !draw.backdoor) ? "draw" : "air";
  }
  if (category >= 7) return "nuts";
  if (category >= 5) return "near-nuts";
  if (category >= 3) return "strong-value";
  if (category === 2) return "strong-value";
  if (category === 1) return "thin-value";
  return draws.some((draw) => !draw.backdoor) ? "draw" : "air";
}

export function analyzePokerFactsV4(
  hole: [Card, Card],
  board: Card[],
  opponentRange: readonly Pick<WeightedCombo, "cards" | "weight">[] = [],
): PokerFactsV4 {
  if (board.length < 3 || board.length > 5) throw new Error("V4 组合事实需要 3 至 5 张公共牌");
  assertUniqueCards([...hole, ...board]);
  const hand = bestHand([...hole, ...board]);
  const boardIndex = boardCategoryIndex(board);
  const boardCategory = boardIndex > 0 ? CATEGORY_NAMES[boardIndex] : "none";
  const privateContribution = contribution(hole, board, hand.category, boardIndex);
  const kicker = kickerBand(hole, hand.category);
  const draws = drawFacts(hole, board);
  const publicMadeHand = boardIndex > 0 && hand.category === boardIndex;
  const improvements = improvementCards(hole, board, opponentRange);
  return {
    absoluteCategory: CATEGORY_NAMES[hand.category],
    boardCategory,
    privateContribution,
    relativeClass: relativeClass(hand.category, privateContribution, kicker, draws),
    kickerBand: kicker,
    draws,
    blockers: blockerFacts(hole, board, publicMadeHand),
    ...improvements,
    publicMadeHand,
  };
}
