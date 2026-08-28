import type { PolicyIntent } from "../policy/types";
import type { MultiwayEquityResult } from "./multiwayEquity";
import type { MultiwayOutFacts } from "./multiwayOuts";
import { multiwayPotExposure, type MultiwayPotExposure } from "./multiwayPots";
import { legalPostflopTarget } from "./postflopSizing";
import type { StrategyAction, StrategyRequest, StrategyResult } from "./types";

type WeightedAction = Omit<StrategyAction, "frequency" | "ev"> & { weight: number };

function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function exposureEv(equity: number, exposure: MultiwayPotExposure) {
  const automatic = exposure.pots
    .filter((pot) => pot.automaticallyWon)
    .reduce((sum, pot) => sum + pot.heroCanWinAmount, 0);
  const contested = exposure.heroWinnableAmount - automatic;
  return automatic + equity * contested - exposure.incrementalCost;
}

function aggressiveIntent(equity: number, strongDraw: boolean): PolicyIntent {
  if (equity >= 0.58) return "value";
  if (strongDraw) return "semi-bluff";
  return "bluff";
}

function responseWeights(
  equity: number,
  strongDraw: boolean,
  reverseRisk: number,
  opponentCount: number,
) {
  const behindRisk = clamp((opponentCount - 1) * 0.14, 0, 0.56);
  if (equity >= 0.75) {
    return { fold: 0, call: 0.25, raise: 0.75 * (1 - behindRisk * 0.3) };
  }
  if (equity >= 0.62) {
    return { fold: 0.03, call: 0.57, raise: 0.4 * (1 - behindRisk) };
  }
  if (equity >= 0.55) {
    return { fold: 0.12, call: 0.68, raise: 0.2 * (1 - behindRisk) };
  }
  if (strongDraw) {
    return {
      fold: 0.2 + reverseRisk * 0.25,
      call: 0.63 - reverseRisk * 0.15,
      raise: 0.17 * (1 - behindRisk) * (1 - reverseRisk),
    };
  }
  if (equity >= 0.42) {
    return { fold: 0.15, call: 0.78, raise: 0.07 * (1 - behindRisk) };
  }
  if (equity >= 0.24) {
    return { fold: 0.55 + reverseRisk * 0.2, call: 0.44 - reverseRisk * 0.2, raise: 0.01 };
  }
  return { fold: 0.98, call: 0, raise: 0.02 / Math.max(1, opponentCount - 0.5) };
}

function openingWeights(equity: number, strongDraw: boolean, opponentCount: number) {
  const opponentPenalty = clamp((opponentCount - 1) * 0.1, 0, 0.4);
  if (equity >= 0.75) return { check: 0.2, bet: 0.8 * (1 - opponentPenalty * 0.25) };
  if (equity >= 0.62) return { check: 0.35, bet: 0.65 * (1 - opponentPenalty) };
  if (equity >= 0.5) return { check: 0.74, bet: 0.26 * (1 - opponentPenalty) };
  if (strongDraw) return { check: 0.62, bet: 0.38 * (1 - opponentPenalty) };
  if (equity < 0.22) return { check: 0.985, bet: 0.015 / Math.max(1, opponentCount - 0.5) };
  return { check: 0.9, bet: 0.1 * (1 - opponentPenalty) };
}

function weightedActions(
  request: StrategyRequest,
  equity: number,
  strongDraw: boolean,
  reverseRisk: number,
  opponentCount: number,
): WeightedAction[] {
  const { state } = request;
  const actions: WeightedAction[] = [];
  if (state.legal.canCheck) {
    const weights = openingWeights(equity, strongDraw, opponentCount);
    actions.push({ action: "check", weight: weights.check, intent: "pot-control" });
    if (state.legal.canRaise && weights.bet > 0) {
      const fraction = equity >= 0.75 ? 2 / 3 : 0.5;
      const toAmount = legalPostflopTarget(state, fraction);
      actions.push({
        action: toAmount === state.legal.maxRaiseTo ? "all-in" : "bet",
        toAmount,
        potFraction: fraction,
        weight: weights.bet,
        intent: aggressiveIntent(equity, strongDraw),
      });
    }
    return actions;
  }

  const weights = responseWeights(equity, strongDraw, reverseRisk, opponentCount);
  if (state.legal.canFold && weights.fold > 0) {
    actions.push({ action: "fold", weight: weights.fold, intent: "pot-control" });
  }
  if (state.legal.canCall && weights.call > 0) {
    actions.push({
      action: "call",
      weight: weights.call,
      intent: strongDraw ? "semi-bluff" : "pot-control",
    });
  }
  if (state.legal.canRaise && weights.raise > 0) {
    const fraction = equity >= 0.75 ? 1 : 0.75;
    const toAmount = legalPostflopTarget(state, fraction);
    actions.push({
      action: toAmount === state.legal.maxRaiseTo ? "all-in" : "raise",
      toAmount,
      potFraction: fraction,
      weight: weights.raise,
      intent: aggressiveIntent(equity, strongDraw),
    });
  }
  return actions;
}

function normalize(
  actions: WeightedAction[],
  request: StrategyRequest,
  equity: number,
  passiveExposure: MultiwayPotExposure,
  opponentCount: number,
) {
  const total = actions.reduce((sum, action) => sum + Math.max(0, action.weight), 0);
  if (total <= 0) throw new Error("多人策略没有合法动作权重");
  return actions.map(({ weight, ...action }): StrategyAction => {
    let ev = 0;
    if (action.action === "check" || action.action === "call") {
      ev = exposureEv(equity, passiveExposure);
    } else if (action.action !== "fold") {
      const aggressiveExposure = multiwayPotExposure(request.state, action.toAmount!);
      const foldEquity = action.intent === "bluff"
        ? 0.12 / opponentCount
        : action.intent === "semi-bluff" ? 0.08 / opponentCount : 0.03;
      ev = foldEquity * request.state.pot +
        (1 - foldEquity) * exposureEv(equity, aggressiveExposure);
    }
    return { ...action, frequency: weight / total, ev };
  });
}

export function resolveMultiwayStrategy(
  request: StrategyRequest,
  equityFacts: MultiwayEquityResult,
  outFacts: MultiwayOutFacts,
  passiveExposure: MultiwayPotExposure,
): StrategyResult {
  const opponentCount = request.state.players.filter(
    (player) => player.seat !== request.state.actingSeat && !player.folded,
  ).length;
  if (opponentCount < 2) throw new Error("多人策略至少需要两位存活对手");
  const usableOuts = outFacts.clean.length + outFacts.shared.length * 0.5;
  const strongDraw = usableOuts >= 8 && outFacts.reverseImpliedRisk < 0.45;
  const actions = normalize(
    weightedActions(
      request,
      equityFacts.heroEquity,
      strongDraw,
      outFacts.reverseImpliedRisk,
      opponentCount,
    ),
    request,
    equityFacts.heroEquity,
    passiveExposure,
    opponentCount,
  );
  return {
    actions,
    confidence: equityFacts.exact ? 0.66 : 0.58,
    source: "multiway-resolver",
    nodeId: `multiway:${request.state.street}:${opponentCount + 1}way`,
    strategyVersion: "multiway-resolver-v1",
    rangeFacts: {
      equity: equityFacts.heroEquity,
      jointSamples: equityFacts.validJointSamples,
      rejectedConflicts: equityFacts.rejectedConflicts,
      cleanOuts: outFacts.clean.length,
      dirtyOuts: outFacts.dirty.length,
      sharedOuts: outFacts.shared.length,
      reverseImpliedRisk: outFacts.reverseImpliedRisk,
    },
    explanationFacts: {
      algorithm: "range-joint-equity+side-pot-ev-v1",
      opponentCount,
      strongDraw: strongDraw ? 1 : 0,
      heroWinnableAmount: passiveExposure.heroWinnableAmount,
      maxLoss: passiveExposure.maxLoss,
    },
  };
}
