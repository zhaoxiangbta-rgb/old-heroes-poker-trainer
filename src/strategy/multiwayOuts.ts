import { assertUniqueCards, createDeck, type Card } from "../engine/cards";
import { bestHand, compareHands } from "../engine/evaluator";
import type { MultiwayRangeCombo } from "./multiwayEquity";

export type MultiwayOutFacts = {
  clean: Card[];
  dirty: Card[];
  shared: Card[];
  counterfeit: Card[];
  reverseImpliedRisk: number;
};

type OpponentRepresentative = {
  seat: number;
  cards: readonly [Card, Card];
};

function uniqueRepresentatives(
  known: ReadonlySet<Card>,
  rangesBySeat: Readonly<Record<number, readonly MultiwayRangeCombo[]>>,
): OpponentRepresentative[] {
  const representatives: OpponentRepresentative[] = [];
  for (const [seatText, range] of Object.entries(rangesBySeat).sort(
    ([first], [second]) => Number(first) - Number(second),
  )) {
    const seat = Number(seatText);
    const usable = range
      .filter((combo) =>
        combo.weight > 0 &&
        combo.cards[0] !== combo.cards[1] &&
        combo.cards.every((card) => !known.has(card)),
      )
      .sort((first, second) =>
        second.weight - first.weight || first.cards.join("").localeCompare(second.cards.join("")),
      );
    if (!usable.length) throw new Error(`座位 ${seat} 没有可用范围组合`);
    for (const combo of usable.slice(0, 12)) {
      representatives.push({ seat, cards: combo.cards });
    }
  }
  if (!representatives.length) throw new Error("多人补牌分类至少需要一位对手范围");
  return representatives;
}

export function classifyMultiwayOuts(
  hero: readonly [Card, Card],
  board: readonly Card[],
  rangesBySeat: Readonly<Record<number, readonly MultiwayRangeCombo[]>>,
): MultiwayOutFacts {
  if (board.length < 3 || board.length > 4) {
    throw new Error("多人补牌分类需要翻牌或转牌公共牌");
  }
  assertUniqueCards([...hero, ...board]);
  const known = new Set<Card>([...hero, ...board]);
  const representatives = uniqueRepresentatives(known, rangesBySeat);
  const currentHero = bestHand([...hero, ...board]);
  const clean: Card[] = [];
  const dirty: Card[] = [];
  const shared: Card[] = [];
  const counterfeit: Card[] = [];

  for (const candidate of createDeck()) {
    if (known.has(candidate)) continue;
    const available = representatives.filter((opponent) => !opponent.cards.includes(candidate));
    if (!available.length) continue;

    const nextHero = bestHand([...hero, ...board, candidate]);
    const heroImproves = compareHands(nextHero, currentHero) > 0;
    let currentlyAheadOfAll = true;
    let nextWinsAll = true;
    let nextTiesAny = false;
    let nextLosesAny = false;

    for (const opponent of available) {
      assertUniqueCards([...hero, ...board, ...opponent.cards, candidate]);
      const currentOpponent = bestHand([...opponent.cards, ...board]);
      if (compareHands(currentHero, currentOpponent) <= 0) currentlyAheadOfAll = false;

      const nextOpponent = bestHand([...opponent.cards, ...board, candidate]);
      const nextComparison = compareHands(nextHero, nextOpponent);
      if (nextComparison <= 0) nextWinsAll = false;
      if (nextComparison === 0) nextTiesAny = true;
      if (nextComparison < 0) nextLosesAny = true;
    }

    if (heroImproves) {
      if (nextWinsAll) clean.push(candidate);
      else if (nextTiesAny && !nextLosesAny) shared.push(candidate);
      else dirty.push(candidate);
    }
    if (currentlyAheadOfAll && !nextWinsAll) counterfeit.push(candidate);
  }

  const outCount = clean.length + dirty.length + shared.length;
  const reverseImpliedRisk = Math.min(
    1,
    (dirty.length + counterfeit.length * 0.5) / Math.max(1, outCount),
  );
  return { clean, dirty, shared, counterfeit, reverseImpliedRisk };
}
