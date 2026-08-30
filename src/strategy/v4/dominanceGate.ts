import type { StrategyAction } from "../types";
import type { PokerFactsV4 } from "./pokerFacts";

export type DominanceRejectReasonV4 =
  | "insufficient-equity"
  | "unsupported-raise"
  | "no-worse-calls"
  | "no-fold-targets"
  | "backdoor-only"
  | "river-bluff-catch-fails"
  | "dominated-ev";

export type RejectedActionV4 = {
  action: StrategyAction;
  reason: DominanceRejectReasonV4;
  evGap: number;
};

export type DominanceGateInputV4 = {
  actions: readonly StrategyAction[];
  facts: PokerFactsV4;
  pot: number;
  requiredEquity: number;
  currentEquity: number;
  facingBet: boolean;
  street?: "flop" | "turn" | "river";
  worseContinueWeight?: number;
  foldTargetWeight?: number;
  opponentBluffWeight?: number;
  solverSupportedActionKeys?: ReadonlySet<string>;
};

export type DominanceGateResultV4 = {
  actions: StrategyAction[];
  rejected: RejectedActionV4[];
};

export function strategyActionKeyV4(action: StrategyAction) {
  return action.toAmount === undefined ? action.action : `${action.action}:${action.toAmount}`;
}

function isAggressive(action: StrategyAction) {
  return action.action === "bet" || action.action === "raise" || action.action === "all-in";
}

function activeDraw(facts: PokerFactsV4) {
  return facts.draws.some((draw) => !draw.backdoor);
}

function privateMade(facts: PokerFactsV4) {
  return facts.privateContribution !== "none" && facts.privateContribution !== "kicker";
}

function reasonFor(
  action: StrategyAction,
  input: DominanceGateInputV4,
  bestEv: number,
): DominanceRejectReasonV4 | undefined {
  const key = strategyActionKeyV4(action);
  const solverSupported = input.solverSupportedActionKeys?.has(key) ?? false;
  const tolerance = Math.max(0.01, input.pot * 0.03);
  const evGap = bestEv - action.ev;
  const hasRealDraw = activeDraw(input.facts);
  const hasBlocker = input.facts.blockers.some((blocker) => blocker.strength >= 0.75);
  const hasPrivateMade = privateMade(input.facts);

  if (action.action === "call" && input.facingBet) {
    if (input.street === "river" && input.facts.relativeClass === "air" &&
      (input.opponentBluffWeight ?? 0) + 0.01 < input.requiredEquity) {
      return "river-bluff-catch-fails";
    }
    if (input.facts.relativeClass === "air" && !hasRealDraw &&
      input.currentEquity + 0.03 < input.requiredEquity) {
      return "insufficient-equity";
    }
    if (!solverSupported && action.ev < -tolerance) return "dominated-ev";
  }

  if (isAggressive(action)) {
    const supported = hasPrivateMade || hasRealDraw || hasBlocker;
    if (input.facingBet && !supported && !solverSupported) return "unsupported-raise";
    if (!input.facingBet && !supported) {
      if (solverSupported && evGap <= tolerance) return undefined;
      if ((input.foldTargetWeight ?? 0) <= 0) return "no-fold-targets";
      return "unsupported-raise";
    }
    if (action.intent === "value" && (input.worseContinueWeight ?? 1) <= 0) return "no-worse-calls";
  }

  return undefined;
}

function normalize(actions: readonly StrategyAction[]) {
  const total = actions.reduce((sum, action) => sum + Math.max(0, action.frequency), 0);
  if (total <= 0) return actions.map((action, index) => ({ ...action, frequency: index === 0 ? 1 : 0 }))
    .filter((action) => action.frequency > 0);
  return actions.map((action) => ({ ...action, frequency: Math.max(0, action.frequency) / total }));
}

export function applyDominanceGateV4(input: DominanceGateInputV4): DominanceGateResultV4 {
  if (!input.actions.length) throw new Error("V4 理性门槛没有收到候选动作");
  const bestEv = Math.max(...input.actions.map((action) => action.ev));
  const rejected: RejectedActionV4[] = [];
  const kept = input.actions.filter((action) => {
    const reason = reasonFor(action, input, bestEv);
    if (!reason) return true;
    rejected.push({ action: { ...action }, reason, evGap: bestEv - action.ev });
    return false;
  });
  if (kept.length) return { actions: normalize(kept), rejected };

  const fallback = [...input.actions]
    .filter((action) => action.action === "check" || action.action === "fold")
    .sort((first, second) => second.ev - first.ev)[0] ??
    [...input.actions].sort((first, second) => second.ev - first.ev)[0];
  return { actions: [{ ...fallback, frequency: 1 }], rejected };
}
