import type { PostflopSituation, StrategyAction, StrategyRequest, StrategyResult } from "../types";
import { lookupSolverNodeV4 } from "./solverLookup";
import type { SolverActionV4, SolverPackV4 } from "./solverPack";

function effectiveStackBb(request: StrategyRequest) {
  const actor = request.state.players.find((player) => player.seat === request.state.actingSeat);
  const opponent = request.state.players.find((player) => player.seat !== request.state.actingSeat && !player.folded);
  return Math.min(actor?.stack ?? 0, opponent?.stack ?? 0) / request.state.blindLevel.big;
}

function actionDistance(action: StrategyAction, solver: SolverActionV4) {
  const passive = action.action === solver.kind;
  if (["fold", "check", "call"].includes(solver.kind)) return passive ? 0 : Number.POSITIVE_INFINITY;
  if (!(action.action === "bet" || action.action === "raise" || action.action === "all-in")) return Number.POSITIVE_INFINITY;
  if (solver.kind === "all-in") return action.action === "all-in" ? 0 : 2;
  return Math.abs((action.potFraction ?? 0) - (solver.potFraction ?? 0));
}

export function applySolverBlueprintV4(
  baseline: StrategyResult,
  request: StrategyRequest,
  pack: SolverPackV4,
  history: string,
  situation: Pick<PostflopSituation, "inPosition">,
): StrategyResult | undefined {
  if (request.state.street === "preflop") return undefined;
  const opponent = request.state.players.find((player) =>
    player.seat !== request.state.actingSeat && !player.folded,
  );
  const opponentRange = opponent ? request.ranges.bySeat[opponent.seat] ?? [] : [];
  const lookup = lookupSolverNodeV4(pack, {
    board: request.state.board,
    hero: request.state.heroHole,
    opponentRange,
    history,
    potBb: request.state.pot / request.state.blindLevel.big,
    effectiveStackBb: effectiveStackBb(request),
    actingPlayer: situation.inPosition ? 0 : 1,
  });
  if (!lookup || lookup.confidence < 0.85) return undefined;
  const weights = baseline.actions.map(() => 0);
  for (const solverAction of lookup.actions) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    baseline.actions.forEach((action, index) => {
      const distance = actionDistance(action, solverAction);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    });
    if (bestIndex >= 0 && Number.isFinite(bestDistance)) weights[bestIndex] += solverAction.frequency;
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return undefined;
  const actions = baseline.actions.map((action, index) => ({ ...action, frequency: weights[index] / total }))
    .filter((action) => action.frequency > 0);
  return {
    ...baseline,
    actions,
    baselineActions: actions.map((action) => ({ ...action })),
    confidence: Math.max(baseline.confidence, lookup.confidence),
    source: "strategy-pack-v4+resolver",
    strategyVersion: pack.strategyVersion,
    nodeId: `v4:${lookup.sourceNodeIds.join("+")}`,
    packFacts: { packKind: "desktop", strategyVersion: pack.strategyVersion, sourceVersion: pack.source.version },
    explanationFacts: {
      ...baseline.explanationFacts,
      algorithm: "solver-dcfr-v4",
      solverNode: lookup.sourceNodeIds.join("+"),
      solverConfidence: lookup.confidence,
      solverBoardFamily: lookup.boardFamily,
      solverRangeSimilarity: Number(lookup.rangeSimilarity.toFixed(4)),
    },
  };
}

export function solverHistoryV4(request: StrategyRequest, situation: PostflopSituation) {
  if (situation.line === "first-to-act") return "";
  if (situation.line === "checked-to") return "x";
  if (situation.line === "facing-bet") {
    const last = [...request.state.actions].reverse().find((action) =>
      action.street === request.state.street &&
      (action.kind === "bet" || action.kind === "raise" || action.kind === "all-in")
    );
    if (!last) return "";
    const fraction = last.amount / Math.max(1, last.potBefore);
    const sizes = [0.33, 0.5, 0.75, 1, 1.5, 2];
    const nearest = sizes.reduce((best, size) =>
      Math.abs(size - fraction) < Math.abs(best - fraction) ? size : best,
      sizes[0],
    );
    return `b${Math.round(nearest * 1000)}`;
  }
  return "";
}
