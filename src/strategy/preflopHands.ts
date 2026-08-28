import { RANKS, type Card } from "../engine/cards";

const DESCENDING_RANKS = [...RANKS].reverse();

export type CanonicalPreflopHand = string;

function rankValue(rank: string) {
  return RANKS.indexOf(rank as (typeof RANKS)[number]) + 2;
}

function rawStrength(hand: CanonicalPreflopHand) {
  const first = rankValue(hand[0]);
  const second = rankValue(hand[1]);
  if (hand.length === 2) return 40 + first * 5;
  const suited = hand.endsWith("s");
  const gap = first - second;
  let score = first * 4 + second * 2;
  if (suited) score += 4;
  if (gap === 1) score += 3;
  else if (gap === 2) score += 1;
  else if (gap >= 4) score -= Math.min(8, gap + 1);
  if (first === 14) score += 2;
  if (first >= 11 && second >= 10) score += 3;
  return score;
}

function enumerateHands() {
  const hands: CanonicalPreflopHand[] = [];
  for (let high = 0; high < DESCENDING_RANKS.length; high += 1) {
    hands.push(`${DESCENDING_RANKS[high]}${DESCENDING_RANKS[high]}`);
    for (let low = high + 1; low < DESCENDING_RANKS.length; low += 1) {
      hands.push(`${DESCENDING_RANKS[high]}${DESCENDING_RANKS[low]}s`);
      hands.push(`${DESCENDING_RANKS[high]}${DESCENDING_RANKS[low]}o`);
    }
  }
  return hands.sort((first, second) =>
    rawStrength(second) - rawStrength(first) || first.localeCompare(second)
  );
}

export const ALL_PREFLOP_HANDS = Object.freeze(enumerateHands());

const HAND_INDEX = new Map(
  ALL_PREFLOP_HANDS.map((hand, index) => [hand, index]),
);

export function canonicalPreflopHand(hole: [Card, Card]): CanonicalPreflopHand {
  const sorted = [...hole].sort(
    (first, second) => rankValue(second[0]) - rankValue(first[0]),
  );
  const high = sorted[0][0];
  const low = sorted[1][0];
  if (high === low) return `${high}${low}`;
  return `${high}${low}${sorted[0][1] === sorted[1][1] ? "s" : "o"}`;
}

export function handPercentile(hand: CanonicalPreflopHand) {
  const index = HAND_INDEX.get(hand);
  if (index === undefined) throw new Error(`未知翻前手牌类：${hand}`);
  return index / (ALL_PREFLOP_HANDS.length - 1);
}

export function handStrength(hand: CanonicalPreflopHand) {
  return 1 - handPercentile(hand);
}
