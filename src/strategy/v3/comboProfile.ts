import { assertUniqueCards, createDeck, parseCard, type Card } from "../../engine/cards";
import { bestHand, compareHands } from "../../engine/evaluator";
import type { WeightedCombo } from "../../engine/ranges";
import { extractHandFeatures } from "../../policy/handFeatures";
import type { BlockerEffectV3, ComboProfileV3 } from "../types";
import { classifyBoardFamily } from "./boardFamily";

const CATEGORY_NAMES: ComboProfileV3["madeCategory"][] = [
  "high-card",
  "pair",
  "two-pair",
  "three-of-a-kind",
  "straight",
  "flush",
  "full-house",
  "four-of-a-kind",
  "straight-flush",
];

function rankCounts(cards: readonly Card[]) {
  const result = new Map<number, number>();
  for (const card of cards) {
    const rank = parseCard(card).rank;
    result.set(rank, (result.get(rank) ?? 0) + 1);
  }
  return result;
}

function construction(
  hole: [Card, Card],
  board: Card[],
  category: number,
  publicMadeHand: boolean,
): ComboProfileV3["construction"] {
  const holeRanks = hole.map((card) => parseCard(card).rank);
  const boardCounts = rankCounts(board);
  if (publicMadeHand) return "board-only";
  if (category === 8) return "straight-flush";
  if (category === 7) return "quads";
  if (category === 6) return "full-house";
  if (category === 5) return "hole-flush";
  if (category === 4) return "hole-straight";
  if (category === 3) {
    if (holeRanks[0] === holeRanks[1] && boardCounts.get(holeRanks[0]) === 1) return "pocket-set";
    if (holeRanks.some((rank) => boardCounts.get(rank) === 2)) return "board-pair-trips";
  }
  if (category === 2 && holeRanks.every((rank) => boardCounts.has(rank))) return "two-hole-two-pair";
  if (category >= 1 && holeRanks[0] === holeRanks[1]) return "pocket-pair";
  if (category >= 1 && holeRanks.some((rank) => boardCounts.has(rank))) return "one-hole-pair";
  return "hole-high";
}

function kickerBand(hole: [Card, Card], category: number): ComboProfileV3["kickerBand"] {
  if (category >= 4) return "none";
  const high = Math.max(...hole.map((card) => parseCard(card).rank));
  return high === 14 ? "top" : high >= 12 ? "strong" : high >= 9 ? "medium" : "weak";
}

function showdownTier(
  category: number,
  constructionType: ComboProfileV3["construction"],
  kicker: ComboProfileV3["kickerBand"],
): ComboProfileV3["showdownTier"] {
  if (constructionType === "board-only") {
    return kicker === "top" || kicker === "strong" ? "bluff-catcher" : "air";
  }
  if (category >= 7) return "nuts";
  if (category >= 5) return "near-nuts";
  if (category >= 3) return "strong";
  if (category === 2 || constructionType === "pocket-pair" || constructionType === "one-hole-pair") return "medium";
  if (category === 1) return "bluff-catcher";
  return category === 0 ? "air" : "weak";
}

function improvementOuts(
  hole: [Card, Card],
  board: Card[],
  opponentRange: readonly Pick<WeightedCombo, "cards" | "weight">[],
) {
  if (board.length === 5) return { clean: 0, dirty: 0 };
  const known = [...hole, ...board];
  const current = bestHand(known);
  let clean = 0;
  let dirty = 0;
  const representatives = opponentRange.slice(0, 64);
  for (const card of createDeck()) {
    if (known.includes(card)) continue;
    const nextBoard = [...board, card];
    const improved = bestHand([...hole, ...nextBoard]);
    if (compareHands(improved, current) <= 0) continue;
    const beaten = representatives.some((combo) => {
      if (combo.cards.some((candidate) => known.includes(candidate) || candidate === card)) return false;
      return compareHands(bestHand([...combo.cards, ...nextBoard]), improved) > 0;
    });
    if (beaten) dirty += 1;
    else clean += 1;
  }
  return { clean, dirty };
}

export function profileCombo(
  hole: [Card, Card],
  board: Card[],
  opponentRange: readonly Pick<WeightedCombo, "cards" | "weight">[] = [],
): ComboProfileV3 {
  if (board.length < 3 || board.length > 5) throw new Error("组合特征需要 3 至 5 张公共牌");
  assertUniqueCards([...hole, ...board]);
  const hand = bestHand([...hole, ...board]);
  const features = extractHandFeatures(hole, board);
  const constructionType = construction(hole, board, hand.category, features.publicMadeHand);
  const kicker = kickerBand(hole, hand.category);
  const family = classifyBoardFamily(board);
  const boardRanks = rankCounts(board);
  const pairedRanks = [...boardRanks.values()].filter((count) => count >= 2).length;
  const counterfeitRisk = Math.min(1, pairedRanks * 0.22 + (hand.category === 2 ? 0.28 : 0));
  const futureVulnerability = board.length === 5
    ? 0
    : Math.min(1, (family.straightPressure - 2) * 0.16 +
      (family.suitStructure === "two-tone" || family.suitStructure === "monotone" ? 0.24 : 0) +
      (hand.category <= 3 ? 0.22 : 0));
  return {
    hole: [...hole],
    board: [...board],
    madeCategory: CATEGORY_NAMES[hand.category],
    currentMade: hand.category > 0 && !features.publicMadeHand,
    construction: constructionType,
    kickerBand: kicker,
    showdownTier: showdownTier(hand.category, constructionType, kicker),
    drawVector: [...features.draws],
    improvementOuts: improvementOuts(hole, board, opponentRange),
    nutBlockers: features.nutBlockers,
    counterfeitRisk,
    futureVulnerability,
    publicMadeHand: features.publicMadeHand,
  };
}

export function compareBlockerEffects(
  hero: ComboProfileV3,
  opponentRange: readonly Pick<WeightedCombo, "cards" | "weight">[],
): BlockerEffectV3 {
  const heroHand = bestHand([...hero.hole, ...hero.board]);
  let worseCallBlocked = 0;
  let betterContinueBlocked = 0;
  let bluffBlocked = 0;
  for (const combo of opponentRange) {
    if (combo.cards.some((card) => hero.board.includes(card))) continue;
    if (!combo.cards.some((card) => hero.hole.includes(card))) continue;
    const opponent = bestHand([...combo.cards, ...hero.board]);
    const comparison = compareHands(opponent, heroHand);
    if (comparison < 0 && opponent.category >= 1) worseCallBlocked += combo.weight;
    else if (comparison > 0) betterContinueBlocked += combo.weight;
    else if (opponent.category === 0) bluffBlocked += combo.weight;
  }
  return { worseCallBlocked, betterContinueBlocked, bluffBlocked };
}
