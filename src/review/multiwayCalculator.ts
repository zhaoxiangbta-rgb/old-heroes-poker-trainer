import { assertUniqueCards, createDeck, type Card } from "../engine/cards";
import { bestHand, compareHands, type HandRank } from "../engine/evaluator";
import { buildPots } from "../engine/pots";
import { buildDeepCandidates } from "./headsUpCalculator";
import type {
  DeepCalculationConfig,
  DeepNodeCalculation,
  DeepNodeInput,
  DeepRangeCombo,
} from "./types";

function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function weightedPick(range: readonly DeepRangeCombo[], random: () => number) {
  const total = range.reduce((sum, combo) => sum + combo.weight, 0);
  let target = random() * total;
  for (const combo of range) {
    target -= combo.weight;
    if (target <= 0) return combo;
  }
  return range[range.length - 1];
}

function sampleRunout(deck: Card[], count: number, random: () => number) {
  const available = [...deck];
  const result: Card[] = [];
  for (let index = 0; index < count; index += 1) {
    const selected = Math.floor(random() * available.length);
    result.push(available[selected]);
    available.splice(selected, 1);
  }
  return result;
}

function winnerSeats(hands: Map<number, HandRank>, eligible: number[]) {
  const present = eligible.filter((seat) => hands.has(seat));
  if (!present.length) return [];
  let bestSeat = present[0];
  for (const seat of present.slice(1)) {
    if (compareHands(hands.get(seat)!, hands.get(bestSeat)!) > 0) bestSeat = seat;
  }
  return present.filter((seat) => compareHands(hands.get(seat)!, hands.get(bestSeat)!) === 0);
}

function expectedReturnForSample(input: DeepNodeInput, hands: Map<number, HandRank>) {
  if (input.heroSeat === undefined || !input.players?.length) {
    return 0;
  }
  const seatCount = Math.max(...input.players.map((player) => player.seat)) + 1;
  const contributions = Array<number>(seatCount).fill(0);
  const folded = new Set<number>();
  for (const player of input.players) {
    contributions[player.seat] = player.totalBet;
    if (player.folded) folded.add(player.seat);
  }
  return buildPots(contributions, folded).reduce((sum, pot) => {
    const winners = winnerSeats(hands, pot.eligible);
    return winners.includes(input.heroSeat!) ? sum + pot.amount / winners.length : sum;
  }, 0);
}

async function calculateSampledNode(
  input: DeepNodeInput,
  config: DeepCalculationConfig,
  onBatch: (completed: number, total: number) => void,
  requirements: { minimumOpponents: number; minimumBoardCards: number; label: string },
): Promise<DeepNodeCalculation> {
  if (input.board.length < requirements.minimumBoardCards || input.board.length > 5) {
    throw new Error(`${requirements.label}需要 ${requirements.minimumBoardCards} 至 5 张公共牌`);
  }
  if (config.sampleBudget < 1 || config.batchSize < 1 || config.memoryLimitBytes < 256) {
    throw new Error("多人精算预算无效");
  }
  assertUniqueCards([...input.hero, ...input.board]);
  const known = new Set<Card>([...input.hero, ...input.board]);
  let rejectedConflicts = 0;
  const entries = Object.entries(input.rangesBySeat)
    .map(([seat, source]) => {
      const range = source.filter((combo) => {
        const valid = combo.weight > 0 && combo.cards[0] !== combo.cards[1] &&
          combo.cards.every((card) => !known.has(card));
        if (!valid) rejectedConflicts += 1;
        return valid;
      });
      return { seat: Number(seat), range };
    })
    .sort((first, second) => first.seat - second.seat);
  if (entries.length < requirements.minimumOpponents || entries.some((entry) => !entry.range.length)) {
    throw new Error(`${requirements.label}需要至少${requirements.minimumOpponents === 1 ? "一" : "两"}位可用对手范围`);
  }
  const maximumByMemory = Math.max(1, Math.floor(config.memoryLimitBytes / 256));
  const budget = Math.min(config.sampleBudget, maximumByMemory);
  const random = randomGenerator(config.seed);
  let heroShare = 0;
  let expectedPotReturn = 0;
  let accepted = 0;
  for (let sample = 0; sample < budget; sample += 1) {
    const used = new Set<Card>(known);
    const opponents: Array<{ seat: number; cards: readonly [Card, Card] }> = [];
    for (const entry of entries) {
      let selected: DeepRangeCombo | undefined;
      for (let attempt = 0; attempt < Math.max(16, entry.range.length * 2); attempt += 1) {
        const candidate = weightedPick(entry.range, random);
        if (candidate.cards.every((card) => !used.has(card))) {
          selected = candidate;
          break;
        }
        rejectedConflicts += 1;
      }
      if (!selected) throw new Error("对手范围之间没有足够的无冲突联合组合");
      selected.cards.forEach((card) => used.add(card));
      opponents.push({ seat: entry.seat, cards: selected.cards });
    }
    const deck = createDeck().filter((card) => !used.has(card));
    const board = [...input.board, ...sampleRunout(deck, 5 - input.board.length, random)];
    const heroSeat = input.heroSeat ?? -1;
    const hands = new Map<number, HandRank>([
      [heroSeat, bestHand([...input.hero, ...board])],
      ...opponents.map(({ seat, cards }) => [seat, bestHand([...cards, ...board])] as [number, HandRank]),
    ]);
    const winners = winnerSeats(hands, [heroSeat, ...opponents.map(({ seat }) => seat)]);
    if (winners.includes(heroSeat)) heroShare += 1 / winners.length;
    expectedPotReturn += input.players?.length
      ? expectedReturnForSample(input, hands)
      : (winners.includes(heroSeat) ? input.pot / winners.length : 0);
    accepted += 1;
    if (accepted % config.batchSize === 0) {
      onBatch(accepted, budget);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  onBatch(accepted, budget);
  const equity = heroShare / accepted;
  return {
    equity,
    requiredEquity: input.legal.callAmount / Math.max(1, input.pot + input.legal.callAmount),
    candidates: buildDeepCandidates(input, equity),
    precision: "sampled",
    samples: accepted,
    coverage: Math.min(1, accepted / config.sampleBudget),
    confidence: Math.max(0, Math.min(0.99, 1 - 1 / Math.sqrt(accepted))),
    expectedPotReturn: expectedPotReturn / accepted,
    diagnostics: { rejectedConflicts, conflictingSamples: 0 },
  };
}

export function calculateMultiwayNode(
  input: DeepNodeInput,
  config: DeepCalculationConfig,
  onBatch: (completed: number, total: number) => void,
) {
  return calculateSampledNode(input, config, onBatch, {
    minimumOpponents: 2,
    minimumBoardCards: 3,
    label: "多人深度权益",
  });
}

export function calculatePreflopSampledNode(
  input: DeepNodeInput,
  config: DeepCalculationConfig,
  onBatch: (completed: number, total: number) => void,
) {
  return calculateSampledNode(input, config, onBatch, {
    minimumOpponents: 1,
    minimumBoardCards: 0,
    label: "翻前深度权益",
  });
}
