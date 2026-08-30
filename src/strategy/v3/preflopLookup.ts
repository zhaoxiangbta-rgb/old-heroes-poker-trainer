import type { Card } from "../../engine/cards";
import type { Legal } from "../../game/game";
import { canonicalPreflopHand } from "../preflopHands";
import type { PreflopNode, StrategyAction, StrategyResult } from "../types";
import type { CompiledPreflopAction, CompiledPreflopMatrix } from "./preflopCompiler";

export type PreflopLookupContext = {
  pot: number;
  currentBet: number;
  actorStreetBet: number;
  actorStack: number;
  bigBlind: number;
};

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function actionKey(action: Pick<CompiledPreflopAction, "kind" | "sizeClass">) {
  return `${action.kind}:${action.sizeClass ?? ""}`;
}

function interpolatedActions(
  lower: readonly CompiledPreflopAction[],
  upper: readonly CompiledPreflopAction[],
  weight: number,
) {
  const keys = new Set([...lower, ...upper].map(actionKey));
  return [...keys].map((key): CompiledPreflopAction => {
    const low = lower.find((action) => actionKey(action) === key);
    const high = upper.find((action) => actionKey(action) === key);
    return {
      kind: (low ?? high)!.kind,
      sizeClass: (low ?? high)!.sizeClass,
      frequency: (low?.frequency ?? 0) * (1 - weight) + (high?.frequency ?? 0) * weight,
      evBb: (low?.evBb ?? high?.evBb ?? 0) * (1 - weight) +
        (high?.evBb ?? low?.evBb ?? 0) * weight,
    };
  }).filter((action) => action.frequency > 1e-12);
}

function raiseTarget(node: PreflopNode, legal: Legal, context: PreflopLookupContext) {
  let target: number;
  if (node.spot === "unopened") target = Math.round(context.bigBlind * 2.5);
  else if (node.spot === "isolate-limpers") target = Math.round(context.bigBlind * (4 + node.limpers));
  else if (["facing-3bet", "facing-4bet", "facing-all-in"].includes(node.spot)) {
    target = Math.round(context.currentBet * 2.25);
  } else {
    target = Math.round(context.currentBet * ((node.inPosition ? 3 : 4) + node.coldCallers));
  }
  return clamp(target, legal.minRaiseTo, legal.maxRaiseTo);
}

function legalMapped(
  action: CompiledPreflopAction,
  node: PreflopNode,
  legal: Legal,
  context: PreflopLookupContext,
): StrategyAction | undefined {
  const base = {
    frequency: action.frequency,
    ev: action.evBb * context.bigBlind,
    intent: action.kind === "raise" || action.kind === "all-in" ? "value" as const : "pot-control" as const,
  };
  if (action.kind === "fold") return legal.canFold ? { action: "fold", ...base } : undefined;
  if (action.kind === "check") return legal.canCheck ? { action: "check", ...base } : undefined;
  if (action.kind === "call") return legal.canCall ? { action: "call", ...base } : undefined;
  if (!legal.canRaise) {
    if (legal.canCall && legal.callAmount >= context.actorStack) {
      return { action: "call", ...base };
    }
    return undefined;
  }
  const toAmount = action.kind === "all-in" ? legal.maxRaiseTo : raiseTarget(node, legal, context);
  return {
    action: toAmount === legal.maxRaiseTo ? "all-in" : "raise",
    toAmount,
    potFraction: Math.max(0, toAmount - context.actorStreetBet) / Math.max(1, context.pot),
    ...base,
  };
}

function fallback(legal: Legal): StrategyAction {
  const base = { frequency: 1, ev: 0, intent: "pot-control" as const };
  if (legal.canCheck) return { action: "check", ...base };
  if (legal.canCall) return { action: "call", ...base };
  if (legal.canFold) return { action: "fold", ...base };
  return { action: "all-in", toAmount: legal.maxRaiseTo, ...base };
}

export function lookupPreflopV3(
  matrix: CompiledPreflopMatrix,
  node: PreflopNode,
  hole: [Card, Card],
  legal: Legal,
  context: PreflopLookupContext,
): StrategyResult {
  const hand = canonicalPreflopHand(hole);
  const lower = matrix.cell(node.spot, node.actingPosition, node.stack.lower, hand);
  const upper = matrix.cell(node.spot, node.actingPosition, node.stack.upper, hand);
  const sourceActions = node.stack.lower === node.stack.upper
    ? lower.actions
    : interpolatedActions(lower.actions, upper.actions, node.stack.weight);
  const mapped = sourceActions
    .map((action) => legalMapped(action, node, legal, context))
    .filter((action): action is StrategyAction => action !== undefined);
  const merged = new Map<string, StrategyAction>();
  for (const action of mapped) {
    const key = `${action.action}:${action.toAmount ?? ""}`;
    const existing = merged.get(key);
    if (!existing) merged.set(key, { ...action });
    else {
      const frequency = existing.frequency + action.frequency;
      existing.ev = (existing.ev * existing.frequency + action.ev * action.frequency) / frequency;
      existing.frequency = frequency;
    }
  }
  const actions = [...merged.values()];
  const total = actions.reduce((sum, action) => sum + action.frequency, 0);
  const normalized = total > 0
    ? actions.map((action) => ({ ...action, frequency: action.frequency / total }))
    : [fallback(legal)];
  return {
    actions: normalized,
    baselineActions: normalized.map((action) => ({ ...action })),
    confidence: 0.72,
    source: "strategy-pack-v3",
    nodeId: `${node.nodeId}:${hand}`,
    strategyVersion: "strategy-v3",
    rangeFacts: {},
    explanationFacts: {
      algorithm: "explicit-matrix-v3",
      handClass: hand,
      inPosition: node.inPosition ? 1 : 0,
      actingPosition: node.actingPosition,
      preflopSpot: node.spot,
      effectiveStackBb: Number(node.effectiveStackBb.toFixed(1)),
      stackLower: node.stack.lower,
      stackUpper: node.stack.upper,
      stackWeight: Number(node.stack.weight.toFixed(4)),
      provenance: lower.source,
      sourceVersion: matrix.sourceVersion,
    },
  };
}
