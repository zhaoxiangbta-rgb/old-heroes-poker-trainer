import { createDeck, parseCard, type Card } from "../engine/cards";
import type { WeightedCombo } from "../engine/ranges";
import type { ExactProjection, OutAssessment, PreActionInsightInput } from "./types";

const CATEGORY_NAMES = ["高牌", "一对", "两对", "三条", "顺子", "同花", "葫芦", "四条", "同花顺"] as const;

type OpponentRanges = Readonly<Record<number, readonly WeightedCombo[]>>;

const CARD_META = Object.fromEntries(createDeck().map((card, index) => [
  card,
  { rank: index % 13 + 2, suit: Math.floor(index / 13) },
])) as Record<Card, { rank: number; suit: number }>;

// This evaluator is synchronous inside one worker. Reusing its fixed-size
// scratch buffers avoids millions of tiny allocations during exact flop nuts
// enumeration without changing the enumerated card space or score ordering.
const SCORE_COUNTS = new Uint8Array(15);
const SCORE_SUIT_COUNTS = new Uint8Array(4);
const SCORE_SUIT_MASKS = new Uint16Array(4);

function encodeScore(category: number, ranks: readonly number[]): number {
  let score = category << 24;
  for (let index = 0; index < Math.min(5, ranks.length); index += 1)
    score |= ranks[index] << (20 - index * 4);
  return score;
}

function straightHighFromMask(source: number): number {
  let mask = source;
  if (mask & (1 << 14)) mask |= 1 << 1;
  for (let high = 14; high >= 5; high -= 1) {
    const sequence = 0b11111 << (high - 4);
    if ((mask & sequence) === sequence) return high;
  }
  return 0;
}

// Packed numeric evaluation avoids allocating maps and HandRank objects in the
// million-comparison nuts loop. Higher score always means a stronger hand.
function rankScorePair(firstHole: Card, secondHole: Card, board: readonly Card[]): number {
  const counts = SCORE_COUNTS;
  const suitCounts = SCORE_SUIT_COUNTS;
  const suitMasks = SCORE_SUIT_MASKS;
  counts.fill(0);
  suitCounts.fill(0);
  suitMasks.fill(0);
  let rankMask = 0;
  for (let index = 0; index < 2 + board.length; index += 1) {
    const card = index === 0 ? firstHole : index === 1 ? secondHole : board[index - 2];
    const { rank, suit } = CARD_META[card];
    counts[rank] += 1;
    suitCounts[suit] += 1;
    rankMask |= 1 << rank;
    suitMasks[suit] |= 1 << rank;
  }
  for (let suit = 0; suit < 4; suit += 1) {
    if (suitCounts[suit] < 5) continue;
    const high = straightHighFromMask(suitMasks[suit]);
    if (high) return encodeScore(8, [high]);
  }
  for (let rank = 14; rank >= 2; rank -= 1) if (counts[rank] === 4) {
    let kicker = 0;
    for (let candidate = 14; candidate >= 2; candidate -= 1) if (candidate !== rank && counts[candidate]) { kicker = candidate; break; }
    return encodeScore(7, [rank, kicker]);
  }
  let trips = 0;
  let pair = 0;
  for (let rank = 14; rank >= 2; rank -= 1) {
    if (!trips && counts[rank] >= 3) trips = rank;
    else if (!pair && counts[rank] >= 2) pair = rank;
  }
  if (trips && pair) return encodeScore(6, [trips, pair]);
  for (let suit = 0; suit < 4; suit += 1) if (suitCounts[suit] >= 5) {
    const ranks: number[] = [];
    for (let rank = 14; rank >= 2 && ranks.length < 5; rank -= 1) if (suitMasks[suit] & (1 << rank)) ranks.push(rank);
    return encodeScore(5, ranks);
  }
  const straight = straightHighFromMask(rankMask);
  if (straight) return encodeScore(4, [straight]);
  if (trips) {
    const kickers: number[] = [];
    for (let rank = 14; rank >= 2 && kickers.length < 2; rank -= 1) if (rank !== trips && counts[rank]) kickers.push(rank);
    return encodeScore(3, [trips, ...kickers]);
  }
  const pairs: number[] = [];
  for (let rank = 14; rank >= 2; rank -= 1) if (counts[rank] >= 2) pairs.push(rank);
  if (pairs.length >= 2) {
    let kicker = 0;
    for (let rank = 14; rank >= 2; rank -= 1) if (rank !== pairs[0] && rank !== pairs[1] && counts[rank]) { kicker = rank; break; }
    return encodeScore(2, [pairs[0], pairs[1], kicker]);
  }
  const highCards: number[] = [];
  for (let rank = 14; rank >= 2 && highCards.length < (pairs.length ? 3 : 5); rank -= 1)
    if (rank !== pairs[0] && counts[rank]) highCards.push(rank);
  return pairs.length ? encodeScore(1, [pairs[0], ...highCards]) : encodeScore(0, highCards);
}

function rankScore(hole: readonly Card[], board: readonly Card[]): number {
  return rankScorePair(hole[0], hole[1], board);
}

function scoreCategory(score: number): number {
  return score >>> 24;
}

function checkCancelled(cancelled?: () => boolean): void {
  if (cancelled?.()) throw new Error("下注前精算已取消");
}

function availableDeck(known: readonly Card[]): Card[] {
  const blocked = new Set(known);
  return createDeck().filter((card) => !blocked.has(card));
}

function validCombo(combo: WeightedCombo, blocked: ReadonlySet<Card>): boolean {
  return combo.cards[0] !== combo.cards[1]
    && !blocked.has(combo.cards[0])
    && !blocked.has(combo.cards[1]);
}

function weightedResultAgainstRanges(
  hero: number,
  board: readonly Card[],
  ranges: OpponentRanges,
): { beatProbability: number; equity: number; reason?: OutAssessment["riskReason"] } {
  let allHold = 1;
  let allEquity = 1;
  let strongestReason: OutAssessment["riskReason"];
  const blocked = new Set(board);

  for (const range of Object.values(ranges)) {
    const candidates = range.filter((combo) => validCombo(combo, blocked));
    const total = candidates.reduce((sum, combo) => sum + Math.max(0, combo.weight), 0);
    if (total <= 0) continue;
    let beat = 0;
    let tie = 0;
    for (const combo of candidates) {
      const opponent = rankScore(combo.cards, board);
      const comparison = opponent - hero;
      const weight = Math.max(0, combo.weight) / total;
      if (comparison > 0) {
        beat += weight;
        strongestReason ??= classifyRisk(hero, opponent, board);
      } else if (comparison === 0) {
        tie += weight;
      }
    }
    allHold *= 1 - beat;
    allEquity *= 1 - beat - tie / 2;
  }
  return { beatProbability: 1 - allHold, equity: allEquity, reason: strongestReason };
}

function classifyRisk(hero: number, opponent: number, board: readonly Card[]): OutAssessment["riskReason"] {
  if (scoreCategory(hero) === 5 && scoreCategory(opponent) === 5) return "higher-flush";
  if (scoreCategory(hero) === 4 && scoreCategory(opponent) === 4) return "higher-straight";
  if (scoreCategory(opponent) === 6) return "full-house";
  const boardRanks = board.map((card) => parseCard(card).rank);
  if (new Set(boardRanks).size < boardRanks.length) return "paired-board";
  return "players-behind";
}

function universalNutsStatus(
  heroHole: readonly [Card, Card],
  board: readonly Card[],
  candidateDeck: readonly Card[],
  originalBoardLength: number,
): "absolute" | "tied" | "not" {
  const hero = rankScore(heroHole, board);
  const newlyDealt = board.slice(originalBoardLength);
  const blockedFirst = newlyDealt[0];
  const blockedSecond = newlyDealt[1];
  let tied = false;
  for (let first = 0; first < candidateDeck.length - 1; first += 1) {
    if (candidateDeck[first] === blockedFirst || candidateDeck[first] === blockedSecond) continue;
    for (let second = first + 1; second < candidateDeck.length; second += 1) {
      if (candidateDeck[second] === blockedFirst || candidateDeck[second] === blockedSecond) continue;
      const opponent = rankScorePair(candidateDeck[first], candidateDeck[second], board);
      const comparison = opponent - hero;
      if (comparison > 0) return "not";
      if (comparison === 0) tied = true;
    }
  }
  return tied ? "tied" : "absolute";
}

function finalRunouts(board: readonly Card[], deck: readonly Card[]): Card[][] {
  if (board.length === 5) return [[...board]];
  if (board.length === 4) return deck.map((card) => [...board, card]);
  const runouts: Card[][] = [];
  for (let first = 0; first < deck.length - 1; first += 1) {
    for (let second = first + 1; second < deck.length; second += 1) {
      runouts.push([...board, deck[first], deck[second]]);
    }
  }
  return runouts;
}

function nextBoards(board: readonly Card[], deck: readonly Card[]): Card[][] {
  return board.length === 5 ? [[...board]] : deck.map((card) => [...board, card]);
}

function categoryDistribution(heroHole: readonly [Card, Card], boards: readonly Card[][]): number[] {
  const counts = Array<number>(9).fill(0);
  for (const board of boards) counts[scoreCategory(rankScore(heroHole, board))] += 1;
  return counts.map((count) => count / boards.length);
}

function assessOuts(
  input: PreActionInsightInput,
  deck: readonly Card[],
  ranges: OpponentRanges,
  cancelled?: () => boolean,
): OutAssessment[] {
  if (input.board.length === 5) return [];
  const currentHero = rankScore(input.heroHole, input.board);
  const currentRangeResult = weightedResultAgainstRanges(currentHero, input.board, ranges);
  return deck.map((card, index) => {
    if (index % 8 === 0) checkCancelled(cancelled);
    const nextBoard = [...input.board, card];
    const nextHero = rankScore(input.heroHole, nextBoard);
    const result = weightedResultAgainstRanges(nextHero, nextBoard, ranges);
    const improved = nextHero > currentHero;
    const dirty = improved && result.beatProbability > 0;
    return {
      card,
      classification: improved ? (dirty ? "dirty" : "clean") : "neutral",
      equityDelta: result.equity - currentRangeResult.equity,
      ...(dirty ? { riskReason: result.reason ?? "players-behind" } : {}),
    } satisfies OutAssessment;
  });
}

export function calculateExactProjection(
  input: PreActionInsightInput,
  opponentRanges: OpponentRanges = {},
  cancelled?: () => boolean,
): ExactProjection {
  const startedAt = performance.now();
  checkCancelled(cancelled);
  if (input.board.length < 3 || input.board.length > 5) {
    throw new Error("下注前精算仅适用于翻牌后");
  }

  const deck = availableDeck([...input.heroHole, ...input.board]);
  const next = nextBoards(input.board, deck);
  const finals = finalRunouts(input.board, deck);
  const nextDistribution = categoryDistribution(input.heroHole, next);
  const finalDistribution = categoryDistribution(input.heroHole, finals);
  const currentCategory = scoreCategory(rankScore(input.heroHole, input.board));
  let absoluteNuts = 0;
  let tiedNuts = 0;
  let nearNuts = 0;

  for (let index = 0; index < finals.length; index += 1) {
    if (index % 8 === 0) checkCancelled(cancelled);
    const board = finals[index];
    const status = universalNutsStatus(input.heroHole, board, deck, input.board.length);
    if (status === "absolute") absoluteNuts += 1;
    else if (status === "tied") tiedNuts += 1;
    else {
      const hero = rankScore(input.heroHole, board);
      if (weightedResultAgainstRanges(hero, board, opponentRanges).beatProbability <= 0.05) nearNuts += 1;
    }
  }

  const handClasses = CATEGORY_NAMES.map((name, category) => ({
    category,
    name,
    nextCard: nextDistribution[category],
    byRiver: finalDistribution[category],
  }));
  const atLeastCurrentByRiverRaw = finalDistribution
    .slice(currentCategory)
    .reduce((sum, probability) => sum + probability, 0);
  return {
    precision: "exact",
    currentHand: { category: currentCategory, name: CATEGORY_NAMES[currentCategory] },
    atLeastCurrentByRiver: Math.abs(1 - atLeastCurrentByRiverRaw) < 1e-12
      ? 1
      : atLeastCurrentByRiverRaw,
    handClasses,
    exclusiveNextTotal: nextDistribution.reduce((sum, probability) => sum + probability, 0),
    exclusiveRiverTotal: finalDistribution.reduce((sum, probability) => sum + probability, 0),
    absoluteNuts: absoluteNuts / finals.length,
    tiedNuts: tiedNuts / finals.length,
    nearNuts: nearNuts / finals.length,
    outs: assessOuts(input, deck, opponentRanges, cancelled),
    elapsedMs: performance.now() - startedAt,
  };
}
