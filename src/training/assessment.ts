import type { GameAction, GameState } from "../game/game";
import { extractHandFeatures } from "../policy/handFeatures";
import type {
  DecisionContext,
  PolicyAction,
  PolicyCandidate,
} from "../policy/types";
import { createLocalStrategyEngine } from "../strategy/engine";
import { buildPublicDecisionState } from "../strategy/publicState";
import { buildRangeLedger, snapshotRangeLedger } from "../strategy/rangeLedger";
import type { StrategyAction, StrategyResult } from "../strategy/types";
import type {
  AssessmentSeverity,
  DecisionAssessment,
  WeaknessTag,
} from "./types";
import type { DeepDecisionReview } from "../review/types";

export type AssessmentContext = {
  street: GameState["street"];
  actual: PolicyAction;
  recommended: PolicyAction;
  candidates: PolicyCandidate[];
  severity: AssessmentSeverity;
  activePlayers: number;
  playersBehind: number;
  facingSqueeze: boolean;
  handClass: string;
  strength: number;
  pressureRatio: number;
  cleanOuts: number;
  dirtyOuts: number;
  facingOrdinaryBet: boolean;
  hasWorseCallingRange: boolean;
  showdownValue: boolean;
};

function isRaise(action: PolicyAction) {
  return action.type === "raise";
}

export const weaknessPredicates: Record<
  WeaknessTag,
  (context: AssessmentContext) => boolean
> = {
  overcalling: (c) =>
    c.severity !== "good" && c.actual.type === "call" && c.recommended.type !== "call",
  "squeeze-call-too-wide": (c) =>
    c.severity !== "good" &&
    c.street === "preflop" &&
    c.facingSqueeze &&
    c.actual.type === "call",
  "multiway-top-pair": (c) =>
    c.severity !== "good" &&
    c.activePlayers >= 3 &&
    (c.handClass === "top-pair" || c.handClass === "one-pair") &&
    c.pressureRatio >= 0.5 &&
    (c.actual.type === "call" || isRaise(c.actual)),
  "slow-play-strong-hand": (c) =>
    c.severity !== "good" &&
    c.strength >= 0.72 &&
    (c.actual.type === "check" || c.actual.type === "call") &&
    isRaise(c.recommended),
  "bet-means-nuts": (c) =>
    c.severity !== "good" &&
    c.facingOrdinaryBet &&
    c.actual.type === "fold" &&
    c.recommended.type !== "fold",
  "missed-worse-calls": (c) =>
    c.severity !== "good" &&
    c.street === "river" &&
    c.hasWorseCallingRange &&
    (c.actual.type === "check" || c.actual.type === "call") &&
    isRaise(c.recommended),
  "river-value-bluff-confusion": (c) =>
    c.severity !== "good" &&
    c.street === "river" &&
    isRaise(c.actual) &&
    c.showdownValue &&
    !c.hasWorseCallingRange,
  "dirty-outs": (c) =>
    c.severity !== "good" &&
    c.actual.type === "call" &&
    c.dirtyOuts > 0 &&
    c.dirtyOuts >= c.cleanOuts,
  "players-behind": (c) =>
    c.severity !== "good" &&
    c.playersBehind > 0 &&
    (c.actual.type === "call" || isRaise(c.actual)),
};

function distance(action: PolicyAction, candidate: PolicyAction) {
  if (action.type !== candidate.type) return Number.POSITIVE_INFINITY;
  if (action.type === "raise" && candidate.type === "raise")
    return Math.abs(action.to - candidate.to);
  return 0;
}

function policyAction(action: StrategyAction): PolicyAction {
  if (action.action === "fold" || action.action === "check" || action.action === "call")
    return { type: action.action };
  return { type: "raise", to: action.toAmount ?? 0 };
}

function policyCandidates(result: StrategyResult): PolicyCandidate[] {
  return result.actions.map((action) => ({
    action: policyAction(action),
    label: action.action,
    ev: action.ev,
    probability: action.frequency,
    intent: action.intent,
  }));
}

function matchingCandidate(action: GameAction, candidates: PolicyCandidate[]) {
  return [...candidates].sort(
    (first, second) => distance(action, first.action) - distance(action, second.action),
  )[0];
}

function severityFor(loss: number): AssessmentSeverity {
  if (loss <= 0.03) return "good";
  if (loss <= 0.1) return "review";
  return "major";
}

function assessmentContext(
  state: GameState,
  actual: GameAction,
  recommended: PolicyAction,
  candidates: PolicyCandidate[],
  severity: AssessmentSeverity,
): AssessmentContext {
  const activePlayers = state.players.filter((player) => !player.folded).length;
  const playersBehind = Math.max(
    0,
    state.pending.indexOf(state.heroSeat) >= 0
      ? state.pending.length - state.pending.indexOf(state.heroSeat) - 1
      : 0,
  );
  const raises = state.log.filter(
    (entry) =>
      entry.street === "preflop" &&
      (entry.kind === "raise" || entry.kind === "bet" || entry.kind === "all-in"),
  ).length;
  const features =
    state.board.length >= 3
      ? extractHandFeatures(
          state.players[state.heroSeat].hole as DecisionContext["hole"],
          state.board,
        )
      : undefined;
  const pressureRatio = state.legal.callAmount / Math.max(1, state.pot);
  const dirtyOuts = features
    ? Math.max(0, features.cleanOutEstimate - Math.round(features.cleanOutEstimate * (1 - features.texture)))
    : 0;
  const strength = features?.strength ?? 0;
  return {
    street: state.street,
    actual,
    recommended,
    candidates,
    severity,
    activePlayers,
    playersBehind,
    facingSqueeze: raises >= 2,
    handClass: features?.made === "pair" ? "one-pair" : (features?.made ?? "preflop"),
    strength,
    pressureRatio,
    cleanOuts: Math.max(0, (features?.cleanOutEstimate ?? 0) - dirtyOuts),
    dirtyOuts,
    facingOrdinaryBet: state.legal.callAmount > 0 && pressureRatio <= 0.75,
    hasWorseCallingRange: state.street === "river" && strength >= 0.62,
    showdownValue: state.street === "river" && strength >= 0.28,
  };
}

function relevantTagsFor(context: AssessmentContext): WeaknessTag[] {
  const relevant: WeaknessTag[] = [];
  if (context.actual.type === "call" || context.recommended.type === "call")
    relevant.push("overcalling");
  if (context.street === "preflop" && context.facingSqueeze)
    relevant.push("squeeze-call-too-wide");
  if (
    context.activePlayers >= 3 &&
    (context.handClass === "top-pair" || context.handClass === "one-pair")
  )
    relevant.push("multiway-top-pair");
  if (context.strength >= 0.72) relevant.push("slow-play-strong-hand");
  if (context.facingOrdinaryBet) relevant.push("bet-means-nuts");
  if (context.street === "river" && context.hasWorseCallingRange)
    relevant.push("missed-worse-calls");
  if (context.street === "river" && context.showdownValue)
    relevant.push("river-value-bluff-confusion");
  if (context.cleanOuts + context.dirtyOuts > 0) relevant.push("dirty-outs");
  if (context.playersBehind > 0) relevant.push("players-behind");
  return relevant;
}

export function assessHeroDecision(
  before: GameState,
  action: GameAction,
): DecisionAssessment {
  const publicState = buildPublicDecisionState(before, before.heroSeat);
  const ranges = snapshotRangeLedger(buildRangeLedger(publicState));
  const result = createLocalStrategyEngine().decide({
    state: publicState,
    ranges,
    deadlineMs: 250,
  });
  return assessFromStrategy(before, action, result);
}

export function assessFromStrategy(
  before: GameState,
  action: GameAction,
  result: StrategyResult,
): DecisionAssessment {
  const candidates = policyCandidates(result);
  const best = [...candidates].sort((a, b) => b.ev - a.ev)[0];
  const actualCandidate = matchingCandidate(action, candidates) ?? best;
  const risk = Math.max(1, before.pot, before.legal.callAmount);
  const normalizedEvLoss = Math.max(0, (best.ev - actualCandidate.ev) / risk);
  const scored = result.source !== "safe-fallback";
  const severity = scored ? severityFor(normalizedEvLoss) : "good";
  const context = assessmentContext(
    before,
    action,
    best.action,
    candidates,
    severity,
  );
  const tags = scored
    ? (Object.keys(weaknessPredicates) as WeaknessTag[]).filter((tag) =>
        weaknessPredicates[tag](context),
      )
    : [];
  const coreRules = !scored
    ? ["旧版安全策略仅供参考，本次决策不计入能力评分"]
    : severity === "good" && best.probability >= 0.2 && actualCandidate.probability >= 0.2
      ? ["均可，推荐频率不同"]
      : tags.length
        ? tags.map((tag) => `核心规则：${tag}`)
        : [];
  return {
    id: `${before.handNo}:${before.log.length}`,
    handNo: before.handNo,
    logIndex: before.log.length,
    street: before.street,
    actual: action,
    recommended: best.action,
    candidates,
    normalizedEvLoss: scored ? normalizedEvLoss : 0,
    severity,
    intent: actualCandidate.intent,
    tags,
    coreRules,
    facts: {
      activePlayers: context.activePlayers,
      playersBehind: context.playersBehind,
      pressureRatio: context.pressureRatio,
      cleanOuts: context.cleanOuts,
      dirtyOuts: context.dirtyOuts,
      handClass: context.handClass,
      relevantTags: relevantTagsFor(context),
      ...result.rangeFacts,
      ...result.explanationFacts,
      strategyVersion: result.strategyVersion,
      strategySource: result.source,
      strategyConfidence: result.confidence,
    },
    scored,
  };
}

export function assessmentFromDeepDecision(
  handNo: number,
  decision: DeepDecisionReview,
): DecisionAssessment {
  const best = decision.candidates.find((candidate) =>
    JSON.stringify(candidate.action) === JSON.stringify(decision.recommended),
  ) ?? decision.candidates[0];
  const severity = severityFor(decision.normalizedEvLoss);
  return {
    id: decision.id,
    handNo,
    logIndex: decision.logIndex,
    street: decision.street,
    actual: decision.actual,
    recommended: decision.recommended,
    candidates: decision.candidates.map((candidate) => ({
      action: candidate.action,
      label: candidate.action.type,
      ev: candidate.ev,
      probability: candidate.frequency,
      intent: candidate.intent,
    })),
    normalizedEvLoss: decision.normalizedEvLoss,
    severity,
    intent: best?.intent ?? "pot-control",
    tags: decision.tags,
    coreRules: [decision.coreRule],
    facts: {
      relevantTags: decision.tags,
      equity: decision.equity,
      requiredEquity: decision.requiredEquity,
      cleanOuts: decision.cleanOuts,
      dirtyOuts: decision.dirtyOuts,
      reviewPrecision: decision.precision,
      reviewSamples: decision.samples,
      reviewConfidence: decision.confidence,
    },
    scored: true,
  };
}
