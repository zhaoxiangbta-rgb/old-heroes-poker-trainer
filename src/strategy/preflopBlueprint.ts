import type { Card } from "../engine/cards";
import type { Position } from "../game/game";
import type { PolicyIntent } from "../policy/types";
import {
  canonicalPreflopHand,
  handPercentile,
  handStrength,
} from "./preflopHands";
import { findPreflopPackNode } from "./preflopPack";
import type {
  PreflopNode,
  PreflopStackBucket,
  StrategySource,
} from "./types";

export type BlueprintAbstractAction =
  | "fold"
  | "check"
  | "call"
  | "raise"
  | "all-in";

export type BlueprintMix = {
  actions: Array<{
    action: BlueprintAbstractAction;
    frequency: number;
    ev: number;
    intent: PolicyIntent;
  }>;
  source: Extract<StrategySource, "blueprint" | "interpolated">;
  nodeId: string;
  confidence: number;
  explanationFacts: Record<string, number | string>;
};

type Thresholds = {
  continue: number;
  aggressive: number;
  allIn?: boolean;
  passiveAction?: "check" | "call";
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothMembership(percentile: number, limit: number, width = 0.025) {
  return 1 / (1 + Math.exp((percentile - limit) / width));
}

function openerAdjustment(position?: Position) {
  if (position === "UTG") return -0.025;
  if (position === "HJ") return -0.01;
  if (position === "BTN" || position === "SB") return 0.025;
  return 0;
}

function thresholds(node: PreflopNode, stack: PreflopStackBucket): Thresholds {
  const packed = findPreflopPackNode(node.spot, node.actingPosition, stack);
  if (node.spot === "blind-defense" || node.spot === "facing-open") {
    const adjustment = openerAdjustment(node.openerPosition);
    return {
      continue: clamp01(packed.continue + adjustment),
      aggressive: clamp01(packed.aggressive + adjustment / 2),
      passiveAction: packed.passiveAction ?? undefined,
      allIn: packed.allIn,
    };
  }
  return {
    continue: packed.continue,
    aggressive: packed.aggressive,
    allIn: packed.allIn,
    passiveAction: packed.passiveAction ?? undefined,
  };
}

function intentFor(action: BlueprintAbstractAction, percentile: number, aggressiveLimit: number): PolicyIntent {
  if (action === "check" || action === "call") return "pot-control";
  if (action === "fold") return "pot-control";
  return percentile <= aggressiveLimit * 0.55 ? "value" : "bluff";
}

function mixForBucket(
  node: PreflopNode,
  hole: [Card, Card],
  stack: PreflopStackBucket,
) {
  const hand = canonicalPreflopHand(hole);
  const percentile = handPercentile(hand);
  const limits = thresholds(node, stack);
  const continueFrequency = percentile <= 0.005
    ? Math.max(0.999, smoothMembership(percentile, limits.continue))
    : smoothMembership(percentile, limits.continue);
  const aggressiveShare = smoothMembership(percentile, limits.aggressive);
  const pureOpen =
    (node.spot === "unopened" && node.actingPosition !== "BB") ||
    node.spot === "isolate-limpers";
  const aggressiveFrequency = pureOpen
    ? continueFrequency
    : continueFrequency * (0.18 + aggressiveShare * 0.72);
  const passiveFrequency = Math.max(0, continueFrequency - aggressiveFrequency);
  const foldFrequency = Math.max(0, 1 - continueFrequency);
  const aggressiveAction: BlueprintAbstractAction = limits.allIn ? "all-in" : "raise";
  const passiveAction = limits.passiveAction;
  const actions: BlueprintMix["actions"] = [];

  if (foldFrequency > 1e-8) {
    actions.push({ action: "fold", frequency: foldFrequency, ev: 0, intent: "pot-control" });
  }
  if (passiveAction && passiveFrequency > 1e-8) {
    actions.push({
      action: passiveAction,
      frequency: passiveFrequency,
      ev: (limits.continue - percentile) * 2,
      intent: "pot-control",
    });
  }
  if (aggressiveFrequency > 1e-8) {
    actions.push({
      action: aggressiveAction,
      frequency: aggressiveFrequency,
      ev: (limits.aggressive - percentile) * (limits.allIn ? 8 : 4) + handStrength(hand) * 0.2,
      intent: intentFor(aggressiveAction, percentile, limits.aggressive),
    });
  }
  if (!passiveAction && continueFrequency - aggressiveFrequency > 1e-8) {
    const action = node.actingPosition === "BB" ? "check" : "fold";
    const existing = actions.find((item) => item.action === action);
    if (existing) existing.frequency += continueFrequency - aggressiveFrequency;
    else actions.push({
      action,
      frequency: continueFrequency - aggressiveFrequency,
      ev: action === "check" ? handStrength(hand) * 0.1 : 0,
      intent: "pot-control",
    });
  }
  const total = actions.reduce((sum, action) => sum + action.frequency, 0);
  return actions.map((action) => ({ ...action, frequency: action.frequency / total }));
}

function interpolateActions(
  lower: BlueprintMix["actions"],
  upper: BlueprintMix["actions"],
  weight: number,
) {
  const actionNames = new Set([...lower, ...upper].map((item) => item.action));
  return [...actionNames].map((action) => {
    const low = lower.find((item) => item.action === action);
    const high = upper.find((item) => item.action === action);
    const frequency = (low?.frequency ?? 0) * (1 - weight) + (high?.frequency ?? 0) * weight;
    const ev = (low?.ev ?? high?.ev ?? 0) * (1 - weight) + (high?.ev ?? low?.ev ?? 0) * weight;
    return {
      action,
      frequency,
      ev,
      intent: (weight < 0.5 ? low?.intent : high?.intent) ?? low?.intent ?? high?.intent ?? "pot-control",
    };
  }).filter((item) => item.frequency > 1e-8);
}

export function lookupPreflopBlueprint(
  node: PreflopNode,
  hole: [Card, Card],
): BlueprintMix {
  const hand = canonicalPreflopHand(hole);
  const lower = mixForBucket(node, hole, node.stack.lower);
  const interpolated = node.stack.lower !== node.stack.upper && node.stack.weight > 0;
  const actions = interpolated
    ? interpolateActions(
        lower,
        mixForBucket(node, hole, node.stack.upper),
        node.stack.weight,
      )
    : lower;
  return {
    actions,
    source: interpolated ? "interpolated" : "blueprint",
    nodeId: `${node.nodeId}:${hand}`,
    confidence: interpolated ? 0.68 : 0.76,
    explanationFacts: {
      preflopSpot: node.spot,
      handClass: hand,
      handPercentile: Number(handPercentile(hand).toFixed(4)),
      effectiveStackBb: Number(node.effectiveStackBb.toFixed(1)),
      stackLower: node.stack.lower,
      stackUpper: node.stack.upper,
      stackWeight: Number(node.stack.weight.toFixed(4)),
    },
  };
}
