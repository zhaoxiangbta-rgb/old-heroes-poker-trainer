import { assertUniqueCards, createDeck, type Card } from "../engine/cards";
import { bestHand, compareHands } from "../engine/evaluator";
import type { PolicyAction, PolicyIntent } from "../policy/types";
import type {
  DeepCandidateReview,
  DeepNodeCalculation,
  DeepNodeInput,
} from "./types";

const ENUMERATION_BATCH = 2_048;

function runouts(deck: Card[], count: number): Card[][] {
  if (count === 0) return [[]];
  const result: Card[][] = [];
  for (let index = 0; index <= deck.length - count; index += 1) {
    for (const rest of runouts(deck.slice(index + 1), count - 1)) {
      result.push([deck[index], ...rest]);
    }
  }
  return result;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function raiseTargets(input: DeepNodeInput) {
  if (!input.legal.canRaise) return [];
  const potAfterCall = input.pot + input.legal.callAmount;
  const calledTo = input.heroStreetBet + input.legal.callAmount;
  const raw = [
    input.legal.minRaiseTo,
    calledTo + Math.round(potAfterCall * 0.5),
    calledTo + Math.round(potAfterCall * 2 / 3),
    calledTo + potAfterCall,
    calledTo + Math.round(potAfterCall * 1.5),
    input.legal.maxRaiseTo,
  ];
  return [...new Set(raw.map((target) => clamp(
    target,
    input.legal.minRaiseTo,
    input.legal.maxRaiseTo,
  )))].sort((first, second) => first - second);
}

function intentFor(action: PolicyAction, equity: number): PolicyIntent {
  if (action.type === "check") return equity > 0.62 ? "induce" : "pot-control";
  if (action.type === "call") return equity > 0.5 ? "pot-control" : "semi-bluff";
  if (action.type === "raise") {
    if (equity >= 0.68) return "value";
    if (equity >= 0.42) return "protection";
    if (equity >= 0.25) return "semi-bluff";
    return "bluff";
  }
  return "pot-control";
}

export function buildDeepCandidates(input: DeepNodeInput, equity: number): DeepCandidateReview[] {
  const result: Array<Omit<DeepCandidateReview, "frequency">> = [];
  if (input.legal.canFold) {
    result.push({ action: { type: "fold" }, ev: 0, intent: "pot-control" });
  }
  if (input.legal.canCheck) {
    result.push({ action: { type: "check" }, ev: equity * input.pot, intent: intentFor({ type: "check" }, equity) });
  }
  if (input.legal.canCall) {
    result.push({
      action: { type: "call" },
      ev: equity * (input.pot + input.legal.callAmount) - input.legal.callAmount,
      intent: intentFor({ type: "call" }, equity),
    });
  }
  for (const target of raiseTargets(input)) {
    const investment = target - input.heroStreetBet;
    const size = investment / Math.max(1, input.pot + input.legal.callAmount);
    const foldEquity = clamp(0.08 + size * 0.14 + (0.5 - equity) * 0.12, 0.03, 0.42);
    const calledPot = input.pot + investment * 2;
    const ev = foldEquity * input.pot + (1 - foldEquity) * (equity * calledPot - investment);
    const action = { type: "raise", to: target } as const;
    result.push({ action, ev, intent: intentFor(action, equity) });
  }
  const best = Math.max(...result.map((candidate) => candidate.ev));
  const scores = result.map((candidate) => Math.exp((candidate.ev - best) / Math.max(1, input.pot * 0.08)));
  const total = scores.reduce((sum, score) => sum + score, 0);
  return result.map((candidate, index) => ({ ...candidate, frequency: scores[index] / total }));
}

export async function calculateHeadsUpNode(
  input: DeepNodeInput,
  onBatch: (completed: number, total: number) => void,
): Promise<DeepNodeCalculation> {
  if (input.board.length < 3 || input.board.length > 5) {
    throw new Error("单挑深度权益需要 3 至 5 张公共牌");
  }
  const entries = Object.entries(input.rangesBySeat);
  if (entries.length !== 1) throw new Error("单挑深度权益必须只有一位对手");
  assertUniqueCards([...input.hero, ...input.board]);
  const known = new Set<Card>([...input.hero, ...input.board]);
  const range = entries[0][1].filter((combo) =>
    combo.weight > 0 && combo.cards[0] !== combo.cards[1] &&
    combo.cards.every((card) => !known.has(card)),
  );
  if (!range.length) throw new Error("对手范围没有可用组合");
  const totalWeight = range.reduce((sum, combo) => sum + combo.weight, 0);
  let weightedShare = 0;
  let samples = 0;
  const runoutCount = 5 - input.board.length;
  const estimatedTotal = range.reduce((sum, combo) => {
    const remaining = 52 - known.size - combo.cards.length;
    return sum + (runoutCount === 2 ? remaining * (remaining - 1) / 2 : runoutCount === 1 ? remaining : 1);
  }, 0);
  for (const combo of range) {
    const blocked = new Set<Card>([...known, ...combo.cards]);
    const deck = createDeck().filter((card) => !blocked.has(card));
    const possibleBoards = runouts(deck, runoutCount);
    const sampleWeight = combo.weight / totalWeight / possibleBoards.length;
    for (const rest of possibleBoards) {
      const board = [...input.board, ...rest];
      const comparison = compareHands(
        bestHand([...input.hero, ...board]),
        bestHand([...combo.cards, ...board]),
      );
      weightedShare += sampleWeight * (comparison > 0 ? 1 : comparison === 0 ? 0.5 : 0);
      samples += 1;
      if (samples % ENUMERATION_BATCH === 0) {
        onBatch(samples, estimatedTotal);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  onBatch(samples, estimatedTotal);
  return {
    equity: weightedShare,
    requiredEquity: input.legal.callAmount / Math.max(1, input.pot + input.legal.callAmount),
    candidates: buildDeepCandidates(input, weightedShare),
    precision: "exact",
    samples,
    coverage: 1,
    confidence: 1,
    diagnostics: { rejectedConflicts: 0, conflictingSamples: 0 },
  };
}
