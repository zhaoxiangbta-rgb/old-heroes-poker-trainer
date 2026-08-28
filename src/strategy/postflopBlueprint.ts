import type { PolicyIntent } from "../policy/types";
import type { PostflopHandBucket, PostflopHandTier } from "./postflopHandBucket";
import type { HeadsUpPostflopNode } from "./postflopNode";
import { legalPostflopTarget, sizingInterpolation } from "./postflopSizing";
import type { PublicDecisionState, StrategyAction, StrategyResult } from "./types";

type WeightedAction = Omit<StrategyAction, "frequency" | "ev"> & { weight: number };

function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function intentFor(tier: PostflopHandTier, aggressive: boolean): PolicyIntent {
  if (!aggressive) return tier === "strong-draw" || tier === "draw" ? "semi-bluff" : "pot-control";
  if (["nuts", "strong", "medium"].includes(tier)) return "value";
  if (tier === "strong-draw" || tier === "draw") return "semi-bluff";
  return "bluff";
}

function openWeights(
  node: HeadsUpPostflopNode,
  bucket: PostflopHandBucket,
): Array<{ fraction: number; weight: number }> {
  if (bucket.tier === "nuts") return [{ fraction: 2 / 3, weight: 0.55 }, { fraction: 1, weight: 0.3 }];
  if (bucket.tier === "strong") return [{ fraction: 0.5, weight: 0.5 }, { fraction: 2 / 3, weight: 0.3 }];
  if (bucket.tier === "medium") return [{ fraction: 0.5, weight: 0.42 }];
  if (bucket.tier === "showdown") return [{ fraction: 1 / 3, weight: 0.18 }];
  if (bucket.tier === "strong-draw") return [{ fraction: 2 / 3, weight: 0.45 }, { fraction: 1.25, weight: 0.2 }];
  if (bucket.tier === "draw") return [{ fraction: 0.5, weight: 0.38 }];
  const dryInitiative = node.initiative && node.textureCluster.includes("disconnected");
  if (bucket.tier === "air" && dryInitiative) return [{ fraction: 1 / 3, weight: 0.12 }];
  if (bucket.tier === "weak" && dryInitiative) return [{ fraction: 1 / 3, weight: 0.15 }];
  return [];
}

function checkWeight(tier: PostflopHandTier) {
  return ({
    nuts: 0.15,
    strong: 0.2,
    medium: 0.58,
    showdown: 0.82,
    "strong-draw": 0.35,
    draw: 0.62,
    weak: 0.85,
    air: 0.88,
  } as Record<PostflopHandTier, number>)[tier];
}

function responseWeights(
  node: HeadsUpPostflopNode,
  bucket: PostflopHandBucket,
): { fold: number; call: number; raise: number } {
  const size = node.facingFraction;
  if (bucket.tier === "nuts") return { fold: 0, call: 0.28, raise: 0.72 };
  if (bucket.tier === "strong") return { fold: 0.03, call: 0.57, raise: 0.4 };
  if (bucket.tier === "medium") {
    const call = clamp(0.9 - size * 0.35, 0.28, 0.82);
    return { fold: 1 - call - 0.04, call, raise: 0.04 };
  }
  if (bucket.tier === "showdown") {
    const call = clamp(0.74 - size * 0.32, 0.12, 0.68);
    return { fold: 1 - call, call, raise: 0 };
  }
  if (bucket.tier === "strong-draw") {
    const keep = clamp(0.74 - size * 0.2 + bucket.nutPotential * 0.14, 0.28, 0.82);
    const raise = Math.min(0.2, keep * (0.16 + bucket.blockerScore * 0.12));
    return { fold: 1 - keep, call: keep - raise, raise };
  }
  if (bucket.tier === "draw") {
    const call = clamp(0.56 - size * 0.25 + bucket.equity * 0.15, 0.08, 0.55);
    return { fold: 1 - call, call, raise: 0 };
  }
  if (bucket.tier === "weak") {
    const call = clamp(0.34 - size * 0.22, 0.03, 0.3);
    return { fold: 1 - call, call, raise: 0 };
  }
  const raise = bucket.blockerScore > 0.45 && size <= 0.67 ? 0.04 : 0;
  return { fold: 1 - raise, call: 0, raise };
}

function legalWeightedActions(
  node: HeadsUpPostflopNode,
  bucket: PostflopHandBucket,
  state: PublicDecisionState,
): WeightedAction[] {
  if (state.legal.canCheck) {
    const actions: WeightedAction[] = [{ action: "check", weight: checkWeight(bucket.tier), intent: intentFor(bucket.tier, false) }];
    if (state.legal.canRaise) {
      for (const sizing of openWeights(node, bucket)) {
        const toAmount = legalPostflopTarget(state, sizing.fraction);
        actions.push({
          action: toAmount === state.legal.maxRaiseTo ? "all-in" : "bet",
          toAmount,
          potFraction: sizing.fraction,
          weight: sizing.weight,
          intent: intentFor(bucket.tier, true),
        });
      }
    }
    return actions;
  }

  const response = responseWeights(node, bucket);
  const actions: WeightedAction[] = [];
  if (state.legal.canFold && response.fold > 0) {
    actions.push({ action: "fold", weight: response.fold, intent: "pot-control" });
  }
  if (state.legal.canCall && response.call > 0) {
    actions.push({ action: "call", weight: response.call, intent: intentFor(bucket.tier, false) });
  }
  if (state.legal.canRaise && response.raise > 0) {
    const toAmount = legalPostflopTarget(state, bucket.tier === "nuts" ? 1 : 0.75);
    actions.push({
      action: toAmount === state.legal.maxRaiseTo ? "all-in" : "raise",
      toAmount,
      potFraction: (toAmount - (state.players.find((player) => player.seat === state.actingSeat)?.streetBet ?? 0)) / Math.max(1, state.pot),
      weight: response.raise,
      intent: intentFor(bucket.tier, true),
    });
  }
  return actions;
}

function actionEv(action: WeightedAction, bucket: PostflopHandBucket, state: PublicDecisionState) {
  if (action.action === "fold") return 0;
  if (action.action === "check") return bucket.equity * state.pot;
  if (action.action === "call") {
    return bucket.equity * (state.pot + state.legal.callAmount) - state.legal.callAmount;
  }
  const actor = state.players.find((player) => player.seat === state.actingSeat);
  const investment = Math.max(0, (action.toAmount ?? 0) - (actor?.streetBet ?? 0));
  const foldEquity = action.intent === "bluff" ? 0.42 : action.intent === "semi-bluff" ? 0.3 : 0.16;
  return foldEquity * state.pot + (1 - foldEquity) *
    (bucket.equity * (state.pot + investment * 2) - investment);
}

function normalize(actions: WeightedAction[], bucket: PostflopHandBucket, state: PublicDecisionState) {
  const merged = new Map<string, WeightedAction>();
  for (const action of actions.filter((item) => item.weight > 0)) {
    const key = `${action.action}:${action.toAmount ?? ""}`;
    const existing = merged.get(key);
    if (existing) existing.weight += action.weight;
    else merged.set(key, { ...action });
  }
  const total = [...merged.values()].reduce((sum, action) => sum + action.weight, 0);
  return [...merged.values()].map(({ weight, ...action }) => ({
    ...action,
    frequency: weight / total,
    ev: actionEv({ ...action, weight }, bucket, state),
  }));
}

export function lookupPostflopBlueprint(
  node: HeadsUpPostflopNode,
  bucket: PostflopHandBucket,
  state: PublicDecisionState,
): StrategyResult {
  const interpolation = node.facingFraction > 0
    ? sizingInterpolation(node.facingFraction)
    : undefined;
  const interpolated = interpolation !== undefined && interpolation.lower !== interpolation.upper &&
    interpolation.weight > 0.001 && interpolation.weight < 0.999;
  const actions = normalize(legalWeightedActions(node, bucket, state), bucket, state);
  if (!actions.length) throw new Error("单挑翻后蓝图未返回合法动作");
  return {
    actions,
    confidence: 0.72,
    source: interpolated ? "interpolated" : "blueprint",
    nodeId: node.nodeId,
    strategyVersion: "hu-postflop-abstract-v1",
    rangeFacts: {
      equity: bucket.equity,
      cleanOuts: bucket.cleanOuts,
      blockerScore: bucket.blockerScore,
    },
    explanationFacts: {
      tier: bucket.tier,
      made: bucket.made,
      drawClass: bucket.drawClass,
      line: node.line,
      potType: node.potType,
      facingFraction: node.facingFraction,
      algorithm: "abstract-blueprint-v1",
    },
  };
}
