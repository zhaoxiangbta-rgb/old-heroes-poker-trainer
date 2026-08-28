import { assertUniqueCards, createDeck, parseCard, type Card } from "../engine/cards";
import { bestHand, compareHands } from "../engine/evaluator";
import type { WeightedCombo } from "../engine/ranges";
import { extractHandFeatures, type MadeHand } from "../policy/handFeatures";

export type PostflopHandTier =
  | "nuts"
  | "strong"
  | "medium"
  | "showdown"
  | "strong-draw"
  | "draw"
  | "weak"
  | "air";

export type PostflopDrawClass =
  | "combo-draw"
  | "flush-draw"
  | "open-ended"
  | "gutshot"
  | "backdoor"
  | "none";

export type PostflopHandBucket = {
  tier: PostflopHandTier;
  made: MadeHand;
  drawClass: PostflopDrawClass;
  nutPotential: number;
  blockerScore: number;
  cleanOuts: number;
  equity: number;
  publicMadeHand: boolean;
  bucketId: string;
};

type WeightedPostflopCombo = Pick<WeightedCombo, "cards" | "weight">;

function combinations<T>(items: T[], choose: number): T[][] {
  if (choose === 0) return [[]];
  const result: T[][] = [];
  for (let index = 0; index <= items.length - choose; index += 1) {
    for (const rest of combinations(items.slice(index + 1), choose - 1)) {
      result.push([items[index], ...rest]);
    }
  }
  return result;
}

function boundedRunouts(deck: Card[], missing: number, limit = 24) {
  const all = combinations(deck, missing);
  if (all.length <= limit) return all;
  return Array.from({ length: limit }, (_, index) =>
    all[Math.floor(index * all.length / limit)]);
}

function weightedRepresentatives(range: WeightedPostflopCombo[], limit = 24): WeightedPostflopCombo[] {
  if (range.length <= limit) return range;
  const total = range.reduce((sum, combo) => sum + combo.weight, 0);
  const representatives: WeightedPostflopCombo[] = [];
  let cursor = 0;
  let cumulative = range[0].weight;
  for (let index = 0; index < limit; index += 1) {
    const target = (index + 0.5) * total / limit;
    while (cursor < range.length - 1 && cumulative < target) {
      cursor += 1;
      cumulative += range[cursor].weight;
    }
    representatives.push({ ...range[cursor], weight: total / limit });
  }
  return representatives;
}

function weightedRangeEquity(
  hole: [Card, Card],
  board: Card[],
  opponentRange: WeightedPostflopCombo[],
) {
  const known = [...hole, ...board];
  const valid = opponentRange.filter((combo) =>
    combo.cards.every((card) => !known.includes(card)) && combo.cards[0] !== combo.cards[1]);
  if (!valid.length) return 0.5;
  const sampled = weightedRepresentatives(valid);
  const totalWeight = sampled.reduce((sum, combo) => sum + combo.weight, 0);
  let weighted = 0;
  for (const combo of sampled) {
    const comboKnown = [...known, ...combo.cards];
    assertUniqueCards(comboKnown);
    const deck = createDeck().filter((card) => !comboKnown.includes(card));
    const runouts = boundedRunouts(deck, 5 - board.length);
    let share = 0;
    for (const runout of runouts) {
      const hero = bestHand([...hole, ...board, ...runout]);
      const villain = bestHand([...combo.cards, ...board, ...runout]);
      const comparison = compareHands(hero, villain);
      if (comparison > 0) share += 1;
      else if (comparison === 0) share += 0.5;
    }
    weighted += (share / runouts.length) * combo.weight;
  }
  return weighted / Math.max(Number.EPSILON, totalWeight);
}

function drawClass(draws: ReturnType<typeof extractHandFeatures>["draws"]): PostflopDrawClass {
  const flush = draws.includes("flush-draw");
  const straight = draws.includes("open-ended") || draws.includes("gutshot");
  if (flush && straight) return "combo-draw";
  if (flush) return "flush-draw";
  if (draws.includes("open-ended")) return "open-ended";
  if (draws.includes("gutshot")) return "gutshot";
  if (draws.includes("backdoor-flush")) return "backdoor";
  return "none";
}

function handTier(
  features: ReturnType<typeof extractHandFeatures>,
  equity: number,
): PostflopHandTier {
  if (features.publicMadeHand) return equity >= 0.38 ? "showdown" : "weak";
  if (features.category >= 6 || equity >= 0.92) return "nuts";
  if (features.category >= 3 || equity >= 0.78) return "strong";
  if (
    ["top-pair", "overpair", "two-pair"].includes(features.made) ||
    equity >= 0.58
  ) return "medium";
  if (features.cleanOutEstimate >= 8) return "strong-draw";
  if (features.cleanOutEstimate >= 4) return "draw";
  if (features.category >= 1 || equity >= 0.38) return "showdown";
  if (features.draws.includes("backdoor-flush") || equity >= 0.22) return "weak";
  return "air";
}

export function bucketPostflopHand(
  hole: [Card, Card],
  board: Card[],
  opponentRange: WeightedPostflopCombo[],
): PostflopHandBucket {
  assertUniqueCards([...hole, ...board]);
  const features = extractHandFeatures(hole, board);
  const equity = weightedRangeEquity(hole, board, opponentRange);
  const draw = drawClass(features.draws);
  const boardSuits = new Map<string, number>();
  for (const card of board) {
    const suit = parseCard(card).suit;
    boardSuits.set(suit, (boardSuits.get(suit) ?? 0) + 1);
  }
  const aceFlushBlocker = hole.some((card) => {
    const parsed = parseCard(card);
    return parsed.rank === 14 && (boardSuits.get(parsed.suit) ?? 0) >= 2;
  });
  const nutPotential = Math.min(
    1,
    (features.category >= 5 ? 0.9 : 0) +
      (aceFlushBlocker ? 0.55 : 0) +
      (draw === "combo-draw" ? 0.25 : draw === "open-ended" ? 0.12 : 0),
  );
  const blockerScore = Math.min(1, features.nutBlockers * 0.65 + nutPotential * 0.35);
  const tier = handTier(features, equity);

  return {
    tier,
    made: features.made,
    drawClass: draw,
    nutPotential,
    blockerScore,
    cleanOuts: features.cleanOutEstimate,
    equity,
    publicMadeHand: features.publicMadeHand,
    bucketId: `huhand1:${tier}:${features.made}:${draw}:n${Math.round(nutPotential * 4)}`,
  };
}
