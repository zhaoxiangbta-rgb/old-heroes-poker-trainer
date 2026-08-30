import { TABLE_PROFILES } from "../../policy/tableProfiles";
import { canonicalPreflopHand, handPercentile } from "../preflopHands";
import { recommendedRaiseTo } from "../preflopNode";
import type { PreflopNode, StrategyRequest, StrategyResult } from "../types";

const MAX_SUPPORT_SHIFT = 0.15;

function positionFactor(position: PreflopNode["actingPosition"]) {
  if (position === "UTG") return 0.72;
  if (position === "HJ") return 0.86;
  if (position === "CO") return 1.08;
  if (position === "BTN") return 1.35;
  if (position === "SB") return 1.18;
  return 1.2;
}

function spotFactor(spot: PreflopNode["spot"]) {
  if (spot === "unopened") return 1;
  if (spot === "isolate-limpers") return 0.92;
  if (spot === "blind-defense") return 1.08;
  if (spot === "facing-open") return 0.62;
  if (spot === "squeeze") return 0.38;
  return 0;
}

function normalized(actions: StrategyResult["actions"]) {
  const total = actions.reduce((sum, action) => sum + action.frequency, 0);
  return actions.map((action) => ({ ...action, frequency: action.frequency / total }));
}

/**
 * A profile may widen a solver boundary only when the baseline cell contains no
 * continuing action at all. The widening is driven by table VPIP, position and
 * node family, and remains capped at the same 15-point exploit bound as the
 * regular profile projection.
 */
export function addPreflopProfileSupportV4(
  result: StrategyResult,
  request: StrategyRequest,
  node: PreflopNode,
): StrategyResult {
  if (request.state.tableProfileId === "balanced") return result;
  if (result.actions.some((action) => action.action !== "fold")) return result;
  const factor = spotFactor(node.spot);
  if (factor <= 0) return result;

  const profile = TABLE_PROFILES[request.state.tableProfileId];
  const playerLoose = request.playerProfile
    ? (request.playerProfile.effective.looseness - 50) / 250
    : 0;
  const boundary = Math.max(0, Math.min(
    0.7,
    profile.vpip * positionFactor(node.actingPosition) * factor + playerLoose,
  ));
  const percentile = handPercentile(canonicalPreflopHand(request.state.heroHole));
  const membership = 1 / (1 + Math.exp((percentile - boundary) / 0.025));
  const support = Math.min(MAX_SUPPORT_SHIFT, MAX_SUPPORT_SHIFT * membership);
  if (support < 0.01) return result;

  const fold = result.actions[0];
  const passive = node.spot === "blind-defense" || node.spot === "facing-open" || node.spot === "squeeze";
  const added = passive && request.state.legal.canCall
    ? { action: "call" as const, frequency: support, ev: 0.01, intent: "pot-control" as const }
    : request.state.legal.canRaise
      ? {
          action: "raise" as const,
          toAmount: recommendedRaiseTo(node, request.state),
          frequency: support,
          ev: 0.01,
          intent: "bluff" as const,
        }
      : undefined;
  if (!added) return result;
  const actions = normalized([{ ...fold, frequency: 1 - support }, added]);
  return {
    ...result,
    actions,
    adjustment: {
      applied: true,
      tableProfileId: request.state.tableProfileId,
      playerArchetype: request.playerProfile?.archetype ?? "none",
      maxShift: Number(support.toFixed(6)),
      reasonCodes: [
        ...(result.adjustment?.reasonCodes ?? []),
        `range-support:${node.spot}:${node.actingPosition}`,
      ],
    },
    explanationFacts: {
      ...result.explanationFacts,
      profileRangeBoundary: Number(boundary.toFixed(4)),
      profileRangeSupport: Number(support.toFixed(4)),
    },
  };
}
