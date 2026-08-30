import { parseCard, type Card } from "../engine/cards";
import { bestHand, compareHands } from "../engine/evaluator";
import { calculateActionResponses } from "../insights/actionResponse";
import type { OpponentRangeBuckets, OpponentRangeSummary, PreActionInsightInput } from "../insights/types";
import { extractHandFeatures } from "../policy/handFeatures";
import { inferRange } from "../policy/rangeModel";
import type { PolicyAction } from "../policy/types";
import type {
  CoachDecisionFacts,
  DeepDecisionInput,
  DeepNodeCalculation,
  DeepRangeCombo,
  OpponentBucketFact,
  OpponentBucketKind,
} from "./types";

const BUCKET_KINDS: OpponentBucketKind[] = [
  "strong-made", "top-pair", "medium-made", "strong-draw", "weak-draw", "air",
  "premium-pair", "medium-pair", "strong-ace", "suited-connector", "wide-call", "weak-preflop",
];

export type CoachFactInput = {
  decision: DeepDecisionInput;
  calculation: DeepNodeCalculation;
  rangesBySeat: Readonly<Record<number, readonly DeepRangeCombo[]>>;
  recommended: PolicyAction;
  cleanOuts: number;
  dirtyOuts: number;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function normalizeBuckets(
  weights: Record<OpponentBucketKind, number>,
): OpponentBucketFact[] {
  const total = BUCKET_KINDS.reduce((sum, kind) => sum + Math.max(0, weights[kind] ?? 0), 0);
  if (total <= 0) return [];
  return BUCKET_KINDS
    .filter((kind) => weights[kind] > 0)
    .map((kind) => ({ kind, probability: Math.max(0, weights[kind]) / total }));
}

export function combinedContinueRisk(probabilities: readonly number[]): number {
  return probabilities.length
    ? clamp(1 - probabilities.reduce((allFold, probability) => allFold * (1 - clamp(probability)), 1))
    : 0;
}

function emptyWeights(): Record<OpponentBucketKind, number> {
  return Object.fromEntries(BUCKET_KINDS.map((kind) => [kind, 0])) as Record<OpponentBucketKind, number>;
}

function preflopBucket(cards: readonly [Card, Card]): OpponentBucketKind {
  const parsed = cards.map(parseCard).sort((a, b) => b.rank - a.rank);
  const pair = parsed[0].rank === parsed[1].rank;
  const suited = parsed[0].suit === parsed[1].suit;
  const gap = parsed[0].rank - parsed[1].rank;
  if (pair && parsed[0].rank >= 11) return "premium-pair";
  if (pair) return "medium-pair";
  if (parsed[0].rank === 14 && parsed[1].rank >= 10) return "strong-ace";
  if (suited && gap <= 2) return "suited-connector";
  if (parsed[0].rank >= 10 || suited) return "wide-call";
  return "weak-preflop";
}

function postflopBucket(cards: readonly [Card, Card], board: readonly Card[]): OpponentBucketKind {
  const features = extractHandFeatures([cards[0], cards[1]], [...board]);
  if (features.publicMadeHand) {
    if (features.draws.includes("flush-draw") || features.draws.includes("open-ended")) return "strong-draw";
    if (features.draws.includes("gutshot") || features.draws.includes("backdoor-flush")) return "weak-draw";
    return "air";
  }
  if (features.category >= 2) return "strong-made";
  if (features.made === "top-pair" || features.made === "overpair") return "top-pair";
  if (features.category === 1) return "medium-made";
  if (features.draws.includes("flush-draw") || features.draws.includes("open-ended")) return "strong-draw";
  if (features.draws.includes("gutshot") || features.draws.includes("backdoor-flush")) return "weak-draw";
  return "air";
}

function bucketRange(range: readonly DeepRangeCombo[], board: readonly Card[]): OpponentBucketFact[] {
  const weights = emptyWeights();
  for (const combo of range) {
    const kind = board.length >= 3
      ? postflopBucket(combo.cards, board)
      : preflopBucket(combo.cards);
    weights[kind] += Math.max(0, combo.weight);
  }
  return normalizeBuckets(weights);
}

function mergeRangeBuckets(
  rangesBySeat: Readonly<Record<number, readonly DeepRangeCombo[]>>,
  board: readonly Card[],
): OpponentBucketFact[] {
  const weights = emptyWeights();
  for (const range of Object.values(rangesBySeat)) {
    for (const fact of bucketRange(range, board)) weights[fact.kind] += fact.probability;
  }
  return normalizeBuckets(weights);
}

function preflopStrength(cards: readonly [Card, Card]): number {
  const parsed = cards.map(parseCard).sort((a, b) => b.rank - a.rank);
  const pair = parsed[0].rank === parsed[1].rank;
  const suited = parsed[0].suit === parsed[1].suit;
  return (pair ? 100 : 0) + parsed[0].rank * 3 + parsed[1].rank + (suited ? 2 : 0);
}

function heroRangePercentile(decision: DeepDecisionInput): number | null {
  const hero = decision.visiblePlayers.find((player) => player.seat === decision.heroSeat);
  if (!hero || decision.heroHole.length !== 2) return null;
  const range = inferRange({
    position: hero.position,
    heroHole: [decision.heroHole[0], decision.heroHole[1]],
    board: [...decision.board],
    activePlayers: decision.visiblePlayers.filter((player) => !player.folded).length,
    opponentSeat: decision.heroSeat,
    visibleLine: decision.log.map((entry) => ({
      street: entry.street,
      actorSeat: entry.actorSeat,
      kind: entry.kind,
      amount: entry.amount,
      toAmount: entry.toAmount,
      potBefore: entry.potBefore,
      potAfter: entry.potAfter,
    })),
  });
  const total = range.reduce((sum, combo) => sum + Math.max(0, combo.weight), 0);
  if (total <= 0) return null;
  const actual = [decision.heroHole[0], decision.heroHole[1]] as [Card, Card];
  let notStronger = 0;
  for (const combo of range) {
    const comparison = decision.board.length >= 3
      ? compareHands(bestHand([...actual, ...decision.board]), bestHand([...combo.cards, ...decision.board]))
      : preflopStrength(actual) - preflopStrength(combo.cards);
    if (comparison >= 0) notStronger += Math.max(0, combo.weight);
  }
  return clamp(notStronger / total);
}

function madeHandLabel(decision: DeepDecisionInput): string {
  const hole = [decision.heroHole[0], decision.heroHole[1]] as [Card, Card];
  if (decision.board.length < 3) {
    const bucket = preflopBucket(hole);
    const parsed = hole.map(parseCard).sort((a, b) => b.rank - a.rank);
    const suited = parsed[0].suit === parsed[1].suit;
    const labels: Record<OpponentBucketKind, string> = {
      "premium-pair": "高口袋对子", "medium-pair": "中小口袋对子", "strong-ace": "强 A 高牌",
      "suited-connector": "同花连张", "wide-call": suited ? "边缘同花起手牌" : "边缘起手牌", "weak-preflop": "弱起手牌",
      "strong-made": "强成牌", "top-pair": "顶对", "medium-made": "中等成牌",
      "strong-draw": "强听牌", "weak-draw": "弱听牌", air: "弱牌",
    };
    return labels[bucket];
  }
  const features = extractHandFeatures(hole, [...decision.board]);
  const base: Record<typeof features.made, string> = {
    "high-card": "高牌", pair: "普通一对", "top-pair": "顶对", overpair: "超对",
    "two-pair": "两对", set: "暗三条", trips: "明三条", straight: "顺子", flush: "同花",
    "full-house": "葫芦", quads: "四条", "straight-flush": "同花顺",
  };
  if (features.publicMadeHand) {
    const shared = features.made === "pair" ? "一对" : base[features.made];
    return `公共牌${shared}，底牌未改善`;
  }
  if (features.made === "top-pair") {
    const kicker = Math.max(...hole.map((card) => parseCard(card).rank));
    return `${base[features.made]}${kicker >= 12 ? "强踢脚" : kicker >= 9 ? "中等踢脚" : "弱踢脚"}`;
  }
  return base[features.made];
}

function broadBuckets(facts: readonly OpponentBucketFact[]): OpponentRangeBuckets {
  const value = Object.fromEntries(facts.map((fact) => [fact.kind, fact.probability])) as Partial<Record<OpponentBucketKind, number>>;
  return {
    strongValue: (value["strong-made"] ?? 0) + (value["premium-pair"] ?? 0),
    madeHand: (value["top-pair"] ?? 0) + (value["medium-made"] ?? 0)
      + (value["medium-pair"] ?? 0) + (value["strong-ace"] ?? 0),
    strongDraw: value["strong-draw"] ?? 0,
    weakDraw: (value["weak-draw"] ?? 0) + (value["suited-connector"] ?? 0),
    air: (value.air ?? 0) + (value["wide-call"] ?? 0) + (value["weak-preflop"] ?? 0),
  };
}

export function reviewInsightInput(decision: DeepDecisionInput): PreActionInsightInput {
  return {
    schemaVersion: 1,
    handNo: decision.handNo,
    seed: decision.handNo * 1009 + decision.logIndex,
    street: decision.street,
    logIndex: decision.logIndex,
    heroSeat: decision.heroSeat,
    heroHole: [decision.heroHole[0], decision.heroHole[1]],
    board: [...decision.board],
    pot: decision.pot,
    currentBet: decision.currentBet,
    minRaise: Math.max(1, decision.legal.minRaiseTo - decision.currentBet),
    legal: { ...decision.legal },
    pendingSeats: decision.visiblePlayers.filter((player) => !player.folded && !player.allIn).map((player) => player.seat),
    tableProfileId: decision.tableProfileId ?? "balanced",
    players: decision.visiblePlayers.map((player) => ({
      seat: player.seat, playerId: player.playerId, position: player.position,
      stack: player.stack, streetBet: player.streetBet, totalBet: player.totalBet,
      folded: player.folded, allIn: player.allIn, profile: player.profile,
    })),
    actions: decision.log.map((entry) => ({
      street: entry.street, actorSeat: entry.actorSeat, kind: entry.kind,
      amount: entry.amount, toAmount: entry.toAmount,
      potBefore: entry.potBefore ?? Math.max(0, entry.potAfter - entry.amount), potAfter: entry.potAfter,
    })),
  };
}

function responseFacts(
  decision: DeepDecisionInput,
  rangesBySeat: Readonly<Record<number, readonly DeepRangeCombo[]>>,
  recommended: PolicyAction,
) {
  const summaries: OpponentRangeSummary[] = Object.entries(rangesBySeat).map(([seatText, range]) => {
    const seat = Number(seatText);
    const facts = bucketRange(range, decision.board);
    return {
      seat,
      playerId: decision.visiblePlayers.find((player) => player.seat === seat)?.playerId ?? `seat-${seat}`,
      comboCount: range.length,
      buckets: broadBuckets(facts),
      changes: [],
      confidence: 0.65,
      ranges: range.map((combo) => ({
        cards: [combo.cards[0], combo.cards[1]],
        weight: combo.weight,
        label: combo.cards.join(""),
        history: [],
      })),
    };
  });
  const calculated = decision.preActionInsight?.responses?.length
    ? decision.preActionInsight.responses
    : calculateActionResponses(reviewInsightInput(decision), summaries, {
        seed: decision.handNo * 1009 + decision.logIndex,
        sampleBudget: 512,
        deadlineMs: Number.POSITIVE_INFINITY,
      }).responses;
  if (!calculated.length) return { aggregate: [], bySeat: new Map<number, number>() };
  const seats = [...new Set(calculated.map((response) => response.seat))];
  const selected = seats.map((seat) => {
    const choices = calculated.filter((response) => response.seat === seat);
    if (recommended.type !== "raise") return choices[0];
    return [...choices].sort((first, second) => {
      const firstTo = first.heroAction.type === "raise" ? first.heroAction.to : 0;
      const secondTo = second.heroAction.type === "raise" ? second.heroAction.to : 0;
      return Math.abs(firstTo - recommended.to) - Math.abs(secondTo - recommended.to);
    })[0];
  });
  const divisor = Math.max(1, selected.length);
  const fold = selected.reduce((sum, response) => sum + response.fold, 0) / divisor;
  const call = selected.reduce((sum, response) => sum + response.call, 0) / divisor;
  const raise = Math.max(0, 1 - fold - call);
  return {
    aggregate: [
      { action: "fold" as const, probability: fold },
      { action: "call" as const, probability: call },
      { action: "raise" as const, probability: raise },
    ],
    bySeat: new Map(selected.map((response) => [response.seat, response.call + response.raise])),
  };
}

function runoutSummary(decision: DeepDecisionInput) {
  const exact = decision.preActionInsight?.exact;
  if (!exact) return [];
  return [
    { label: `至少保持${exact.currentHand.name}`, probability: exact.atLeastCurrentByRiver, mutuallyExclusive: false },
    ...exact.handClasses
      .filter((item) => item.byRiver >= 0.005)
      .map((item) => ({
        label: item.category === exact.currentHand.category
          ? `仍为${item.name}`
          : item.category > exact.currentHand.category ? `升级为${item.name}` : `变为${item.name}`,
        probability: item.byRiver,
        mutuallyExclusive: true,
      })),
  ];
}

export function buildCoachFacts(input: CoachFactInput): Omit<CoachDecisionFacts, "narrative"> {
  const responses = responseFacts(input.decision, input.rangesBySeat, input.recommended);
  const behind = input.decision.visiblePlayers.filter((player) =>
    !player.folded && player.seat !== input.decision.heroSeat && player.seat > input.decision.heroSeat);
  const behindProbabilities = behind
    .map((player) => responses.bySeat.get(player.seat))
    .filter((value): value is number => value !== undefined);
  return {
    madeHandLabel: madeHandLabel(input.decision),
    heroRangePercentile: heroRangePercentile(input.decision),
    equityVsFullRange: input.calculation.equity,
    // The current calculators expose full-range equity but not the exact
    // reweighted combinations that continue versus a raise. Keep this absent
    // rather than manufacture a precise-looking number from fold frequency.
    equityVsContinueRange: null,
    opponentBuckets: mergeRangeBuckets(input.rangesBySeat, input.decision.board),
    opponentResponses: responses.aggregate,
    atLeastOnePlayerBehindContinues: behindProbabilities.length
      ? combinedContinueRisk(behindProbabilities)
      : null,
    runoutSummary: runoutSummary(input.decision),
    recommendationReasons: [],
    changeConditions: [],
    confidence: input.calculation.confidence,
  };
}
