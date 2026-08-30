import { parseCard, type Card } from "../../engine/cards";
import { classifyBoardFamily } from "../v3/boardFamily";
import type { SolverActionV4, SolverPackV4, SolverNodeV4 } from "./solverPack";

export type SolverQueryV4 = {
  board: Card[];
  hero: [Card, Card];
  opponentRange: ReadonlyArray<{ cards: [Card, Card]; weight: number }>;
  history: string;
  potBb: number;
  effectiveStackBb: number;
  actingPlayer: 0 | 1;
};

export type SolverLookupV4 = {
  actions: SolverActionV4[];
  confidence: number;
  sourceNodeIds: string[];
  boardFamily: string;
  rangeSimilarity: number;
};

function handClass(cards: [Card, Card]) {
  const parsed = cards.map(parseCard).sort((first, second) => second.rank - first.rank);
  const ranks = parsed.map((card) => "--23456789TJQKA"[card.rank]).join("");
  if (parsed[0].rank === parsed[1].rank) return ranks;
  return `${ranks}${parsed[0].suit === parsed[1].suit ? "s" : "o"}`;
}

function sameCards(first: readonly Card[], second: readonly Card[]) {
  return first.length === second.length && first.every((card, index) => card === second[index]);
}

function distance(node: SolverNodeV4, query: SolverQueryV4) {
  return Math.abs(node.potBb - query.potBb) / Math.max(1, query.potBb) +
    Math.abs(node.effectiveStackBb - query.effectiveStackBb) / Math.max(1, query.effectiveStackBb) +
    (1 - rangeSimilarity(node, query)) * 0.5;
}

function rangeSimilarity(node: SolverNodeV4, query: SolverQueryV4) {
  const allowed = new Set(node.opponentHandClasses);
  const total = query.opponentRange.reduce((sum, combo) => sum + Math.max(0, combo.weight), 0);
  if (total <= 0) return 0;
  const covered = query.opponentRange.reduce((sum, combo) =>
    sum + (allowed.has(handClass(combo.cards)) ? Math.max(0, combo.weight) : 0), 0);
  return covered / total;
}

function interpolate(nodes: SolverNodeV4[], query: SolverQueryV4) {
  const sorted = [...nodes].sort((first, second) => first.potBb - second.potBb);
  const lower = [...sorted].reverse().find((node) => node.potBb <= query.potBb) ?? sorted[0];
  const upper = sorted.find((node) => node.potBb >= query.potBb) ?? sorted[sorted.length - 1];
  const sources = lower.id === upper.id ? [lower] : [lower, upper];
  const span = upper.potBb - lower.potBb;
  const weight = span > 0 ? (query.potBb - lower.potBb) / span : 0;
  const actionKeys = new Set(sources.flatMap((node) => node.actions.map((action) => `${action.kind}:${action.potFraction ?? ""}`)));
  const actions = [...actionKeys].map((key) => {
    const from = (node: SolverNodeV4) => node.actions.find((action) => `${action.kind}:${action.potFraction ?? ""}` === key);
    const low = from(lower);
    const high = from(upper);
    const template = low ?? high!;
    return {
      ...template,
      frequency: (low?.frequency ?? 0) * (1 - weight) + (high?.frequency ?? 0) * weight,
      ...(low?.evBb !== undefined || high?.evBb !== undefined
        ? { evBb: (low?.evBb ?? 0) * (1 - weight) + (high?.evBb ?? 0) * weight }
        : {}),
    };
  });
  const total = actions.reduce((sum, action) => sum + action.frequency, 0);
  return {
    actions: actions.map((action) => ({ ...action, frequency: action.frequency / total })),
    sourceNodeIds: sources.map((node) => node.id),
  };
}

export function lookupSolverNodeV4(pack: SolverPackV4, query: SolverQueryV4): SolverLookupV4 | undefined {
  const family = classifyBoardFamily(query.board).familyId;
  const candidates = pack.nodes.filter((node) =>
    node.street === (query.board.length === 3 ? "flop" : query.board.length === 4 ? "turn" : "river") &&
    node.boardFamily === family &&
    node.history === query.history &&
    node.actingPlayer === query.actingPlayer &&
    handClass(node.hero) === handClass(query.hero)
  );
  if (!candidates.length) return undefined;
  const bestRangeSimilarity = Math.max(...candidates.map((node) => rangeSimilarity(node, query)));
  if (bestRangeSimilarity < 0.35) return undefined;
  const exactCards = candidates.filter((node) => sameCards(node.board, query.board) && sameCards(node.hero, query.hero));
  const usable = exactCards.length ? exactCards : candidates;
  const closestDistance = Math.min(...usable.map((node) => distance(node, query)));
  const nearby = usable.filter((node) => distance(node, query) <= Math.max(closestDistance + 0.01, 1));
  const result = interpolate(nearby, query);
  return {
    ...result,
    confidence: (exactCards.length && closestDistance < 1e-9 ? 1 : exactCards.length ? 0.94 : 0.86) *
      (0.85 + 0.15 * bestRangeSimilarity),
    boardFamily: family,
    rangeSimilarity: bestRangeSimilarity,
  };
}
