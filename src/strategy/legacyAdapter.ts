import type {
  DecisionContext,
  PolicyCandidate,
  PolicyDecision,
} from "../policy/types";
import type {
  StrategyAction,
  StrategyRequest,
  StrategyResult,
} from "./types";

function actionName(
  candidate: PolicyCandidate,
  request: StrategyRequest,
): StrategyAction["action"] {
  const action = candidate.action;
  if (action.type !== "raise") return action.type;
  if (action.to === request.state.legal.maxRaiseTo) return "all-in";
  return request.state.currentBet === 0 ? "bet" : "raise";
}

function strategyAction(
  candidate: PolicyCandidate,
  request: StrategyRequest,
): StrategyAction {
  const action = candidate.action;
  if (action.type !== "raise") {
    return {
      action: action.type,
      frequency: candidate.probability,
      ev: candidate.ev,
      intent: candidate.intent,
    };
  }
  const actor = request.state.players.find(
    (player) => player.seat === request.state.actingSeat,
  );
  const investment = action.to - (actor?.streetBet ?? 0);
  return {
    action: actionName(candidate, request),
    toAmount: action.to,
    potFraction: investment / Math.max(1, request.state.pot),
    frequency: candidate.probability,
    ev: candidate.ev,
    intent: candidate.intent,
  };
}

function facts(
  decision: PolicyDecision,
  request: StrategyRequest,
): Pick<StrategyResult, "rangeFacts" | "explanationFacts"> {
  return {
    rangeFacts: {
      opponentSeats: Object.keys(request.ranges.bySeat).length,
      lastActionIndex: request.ranges.lastActionIndex,
      rangeCombos: decision.facts.rangeCombos,
    },
    explanationFacts: {
      strength: decision.facts.strength,
      equity: decision.facts.equity,
      requiredEquity: decision.facts.requiredEquity,
      spr: decision.facts.spr,
    },
  };
}

export function adaptLegacyDecision(
  decision: PolicyDecision,
  request: StrategyRequest,
): StrategyResult {
  return {
    actions: decision.candidates.map((candidate) => strategyAction(candidate, request)),
    confidence: 0.35,
    source: "safe-fallback",
    strategyVersion: "legacy-adapter-v1",
    ...facts(decision, request),
  };
}

export function toLegacyContext(request: StrategyRequest): DecisionContext {
  const { state } = request;
  const actor = state.players.find((player) => player.seat === state.actingSeat);
  if (!actor) throw new Error("公开状态缺少决策玩家");
  const liveOpponents = state.players.filter(
    (player) => player.seat !== actor.seat && !player.folded,
  );
  return {
    seed: state.seed,
    decisionIndex: state.decisionIndex,
    seat: state.actingSeat,
    street: state.street,
    position: actor.position,
    hole: [...state.heroHole],
    board: [...state.board],
    pot: state.pot,
    currentBet: state.currentBet,
    streetBet: actor.streetBet,
    stack: actor.stack,
    effectiveStack: Math.min(
      actor.stack,
      Math.max(0, ...liveOpponents.map((player) => player.stack)),
    ),
    activePlayers: liveOpponents.length + 1,
    playersBehind: Math.max(0, state.pendingSeats.indexOf(actor.seat) >= 0
      ? state.pendingSeats.length - 1
      : 0),
    minRaiseTo: state.legal.minRaiseTo,
    maxRaiseTo: state.legal.maxRaiseTo,
    legal: {
      fold: state.legal.canFold,
      check: state.legal.canCheck,
      call: state.legal.canCall ? state.legal.callAmount : 0,
      raise: state.legal.canRaise,
    },
    visibleLine: state.actions.map((action) => ({ ...action })),
  };
}
