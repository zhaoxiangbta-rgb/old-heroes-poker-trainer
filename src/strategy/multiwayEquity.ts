import { assertUniqueCards, createDeck, type Card } from "../engine/cards";
import { bestHand, compareHands } from "../engine/evaluator";

export type MultiwayRangeCombo = {
  cards: readonly [Card, Card];
  weight: number;
};

export type MultiwayEquityBudget = {
  maxJointSamples: number;
  maxRunouts: number;
};

export type MultiwayEquityResult = {
  heroEquity: number;
  opponentEquity: Record<number, number>;
  validJointSamples: number;
  rejectedConflicts: number;
  exact: boolean;
  elapsedMs: number;
};

type JointSample = {
  bySeat: Array<{ seat: number; cards: readonly [Card, Card] }>;
  weight: number;
};

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

function boundedItems<T>(items: T[], limit: number) {
  if (items.length <= limit) return items;
  return Array.from({ length: limit }, (_, index) =>
    items[Math.floor(index * items.length / limit)]);
}

function weightedRepresentatives(range: MultiwayRangeCombo[], limit: number) {
  if (range.length <= limit) return range;
  const total = range.reduce((sum, combo) => sum + combo.weight, 0);
  const result: MultiwayRangeCombo[] = [];
  let cursor = 0;
  let cumulative = range[0].weight;
  for (let index = 0; index < limit; index += 1) {
    const target = (index + 0.5) * total / limit;
    while (cursor < range.length - 1 && cumulative < target) {
      cursor += 1;
      cumulative += range[cursor].weight;
    }
    result.push({ ...range[cursor], weight: total / limit });
  }
  return result;
}

export function estimateMultiwayEquity(
  hero: readonly [Card, Card],
  board: readonly Card[],
  rangesBySeat: Readonly<Record<number, readonly MultiwayRangeCombo[]>>,
  budget: MultiwayEquityBudget,
): MultiwayEquityResult {
  const started = performance.now();
  if (board.length < 3 || board.length > 5) throw new Error("多人权益需要 3 至 5 张公共牌");
  if (budget.maxJointSamples < 1 || budget.maxRunouts < 1) throw new Error("多人权益预算必须为正数");
  assertUniqueCards([...hero, ...board]);
  const known = new Set<Card>([...hero, ...board]);
  const entries = Object.entries(rangesBySeat)
    .map(([seat, range]) => ({
      seat: Number(seat),
      range: range.filter((combo) =>
        combo.weight > 0 &&
        combo.cards[0] !== combo.cards[1] &&
        combo.cards.every((card) => !known.has(card))),
    }))
    .sort((first, second) => first.seat - second.seat);
  if (!entries.length || entries.some((entry) => !entry.range.length)) {
    throw new Error("每位存活对手必须有可用范围");
  }

  const perSeatLimit = Math.max(
    2,
    Math.ceil(Math.pow(budget.maxJointSamples, 1 / entries.length)),
  );
  let exact = entries.every((entry) => entry.range.length <= perSeatLimit);
  const sampledEntries = entries.map((entry) => ({
    ...entry,
    range: weightedRepresentatives([...entry.range], perSeatLimit),
  }));
  if (sampledEntries.reduce((product, entry) => product * entry.range.length, 1) > budget.maxJointSamples) {
    exact = false;
  }
  const samples: JointSample[] = [];
  let rejectedConflicts = 0;
  let jointTruncated = false;

  function visit(index: number, used: Set<Card>, bySeat: JointSample["bySeat"], weight: number) {
    if (samples.length >= budget.maxJointSamples) {
      jointTruncated = true;
      return;
    }
    if (index === sampledEntries.length) {
      samples.push({ bySeat: [...bySeat], weight });
      return;
    }
    const entry = sampledEntries[index];
    for (const combo of entry.range) {
      if (combo.cards.some((card) => used.has(card))) {
        rejectedConflicts += 1;
        continue;
      }
      const nextUsed = new Set(used);
      combo.cards.forEach((card) => nextUsed.add(card));
      visit(
        index + 1,
        nextUsed,
        [...bySeat, { seat: entry.seat, cards: combo.cards }],
        weight * combo.weight,
      );
      if (samples.length >= budget.maxJointSamples) break;
    }
  }
  visit(0, new Set(known), [], 1);
  if (!samples.length) throw new Error("对手范围之间没有无冲突联合组合");
  exact = exact && !jointTruncated;

  let heroShare = 0;
  const opponentShare = Object.fromEntries(entries.map((entry) => [entry.seat, 0])) as Record<number, number>;
  let totalWeight = 0;
  for (const sample of samples) {
    const sampleKnown = [...known, ...sample.bySeat.flatMap((item) => item.cards)];
    assertUniqueCards(sampleKnown);
    const deck = createDeck().filter((card) => !sampleKnown.includes(card));
    const allRunouts = combinations(deck, 5 - board.length);
    const runouts = boundedItems(allRunouts, budget.maxRunouts);
    if (runouts.length !== allRunouts.length) exact = false;
    for (const runout of runouts) {
      const hands = [
        bestHand([...hero, ...board, ...runout]),
        ...sample.bySeat.map((item) => bestHand([...item.cards, ...board, ...runout])),
      ];
      let best = 0;
      for (let index = 1; index < hands.length; index += 1) {
        if (compareHands(hands[index], hands[best]) > 0) best = index;
      }
      const winners = hands
        .map((hand, index) => compareHands(hand, hands[best]) === 0 ? index : -1)
        .filter((index) => index >= 0);
      const weightedShare = sample.weight / runouts.length / winners.length;
      for (const winner of winners) {
        if (winner === 0) heroShare += weightedShare;
        else opponentShare[sample.bySeat[winner - 1].seat] += weightedShare;
      }
    }
    totalWeight += sample.weight;
  }

  return {
    heroEquity: heroShare / totalWeight,
    opponentEquity: Object.fromEntries(
      Object.entries(opponentShare).map(([seat, equity]) => [seat, equity / totalWeight]),
    ),
    validJointSamples: samples.length,
    rejectedConflicts,
    exact,
    elapsedMs: performance.now() - started,
  };
}
