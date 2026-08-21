import type { GameAction, GameState } from "../game/game";
import { extractHandFeatures } from "../policy/handFeatures";
import { decideWithProfile } from "../policy/tableProfiles";
import type {
  DecisionContext,
  PolicyAction,
  PolicyCandidate,
} from "../policy/types";
import type {
  AssessmentSeverity,
  DecisionAssessment,
  WeaknessTag,
} from "./types";

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

function policyContext(state: GameState): DecisionContext {
  const seat = state.heroSeat;
  const player = state.players[seat];
  const opponentStacks = state.players
    .filter((opponent) => !opponent.folded && opponent.seat !== seat)
    .map((opponent) => opponent.stack);
  return {
    seed: state.seed,
    decisionIndex: state.policyDecisions.length + state.assessments.length,
    seat,
    street: state.street,
    position: player.position,
    hole: player.hole as DecisionContext["hole"],
    board: [...state.board],
    pot: state.pot,
    currentBet: state.currentBet,
    streetBet: player.streetBet,
    stack: player.stack,
    effectiveStack: Math.min(player.stack, Math.max(0, ...opponentStacks)),
    activePlayers: state.players.filter((opponent) => !opponent.folded).length,
    playersBehind: Math.max(0, state.pending.indexOf(seat) >= 0 ? state.pending.length - 1 : 0),
    minRaiseTo: state.legal.minRaiseTo,
    maxRaiseTo: state.legal.maxRaiseTo,
    legal: {
      fold: state.legal.canFold,
      check: state.legal.canCheck,
      call: state.legal.canCall ? state.legal.callAmount : 0,
      raise: state.legal.canRaise,
    },
    visibleLine: state.log.map((entry) => ({
      street: entry.street,
      actorSeat: entry.actorSeat,
      kind: entry.kind,
      toAmount: entry.toAmount,
      potAfter: entry.potAfter,
    })),
  };
}

function distance(action: PolicyAction, candidate: PolicyAction) {
  if (action.type !== candidate.type) return Number.POSITIVE_INFINITY;
  if (action.type === "raise" && candidate.type === "raise")
    return Math.abs(action.to - candidate.to);
  return 0;
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
  const decision = decideWithProfile(policyContext(before), before.tableProfileId);
  const best = [...decision.candidates].sort((a, b) => b.ev - a.ev)[0];
  const actualCandidate = matchingCandidate(action, decision.candidates) ?? best;
  const risk = Math.max(1, before.pot, before.legal.callAmount);
  const normalizedEvLoss = Math.max(0, (best.ev - actualCandidate.ev) / risk);
  const severity = severityFor(normalizedEvLoss);
  const context = assessmentContext(
    before,
    action,
    best.action,
    decision.candidates,
    severity,
  );
  const tags = (Object.keys(weaknessPredicates) as WeaknessTag[]).filter((tag) =>
    weaknessPredicates[tag](context),
  );
  const coreRules =
    severity === "good" &&
    best.probability >= 0.2 &&
    actualCandidate.probability >= 0.2
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
    candidates: decision.candidates,
    normalizedEvLoss,
    severity,
    intent: actualCandidate.intent,
    tags,
    coreRules,
    facts: {
      ...decision.facts,
      activePlayers: context.activePlayers,
      playersBehind: context.playersBehind,
      pressureRatio: context.pressureRatio,
      cleanOuts: context.cleanOuts,
      dirtyOuts: context.dirtyOuts,
      handClass: context.handClass,
      relevantTags: relevantTagsFor(context),
    },
  };
}
