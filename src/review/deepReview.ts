import { bestHand } from "../engine/evaluator";
import { cleanOuts, potOdds } from "../engine/equity";
import { inferRange } from "../policy/rangeModel";
import type { PolicyAction } from "../policy/types";
import { calculateHeadsUpNode } from "./headsUpCalculator";
import { calculateMultiwayNode } from "./multiwayCalculator";
import { calculatePreflopNode } from "./preflopCalculator";
import { deepReviewStateHash } from "./stateHash";
import type {
  DeepCalculationConfig,
  DeepDecisionInput,
  DeepDecisionReview,
  DeepHandReview,
  DeepRangeSummary,
  DeepRangeCombo,
  DeepReviewInput,
  DeepReviewProgress,
  ReviewPrecision,
} from "./types";

export type DeepReviewCallbacks = {
  config: DeepCalculationConfig;
  onProgress(progress: DeepReviewProgress): void;
  shouldCancel?(): boolean;
};

export class ReviewCancelledError extends Error {
  constructor() {
    super("深度精算已取消");
    this.name = "ReviewCancelledError";
  }
}

function effectiveComboCount(weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return 0;
  const entropy = weights.reduce((sum, weight) => {
    const probability = weight / total;
    return probability > 0 ? sum - probability * Math.log(probability) : sum;
  }, 0);
  return Math.exp(entropy);
}

function summarizeRange(
  range: ReturnType<typeof inferRange>,
  board: DeepDecisionInput["board"],
  previous?: DeepRangeSummary,
): DeepRangeSummary {
  let madeWeight = 0;
  for (const combo of range) {
    if (board.length >= 3 && bestHand([...combo.cards, ...board]).category >= 1) {
      madeWeight += combo.weight;
    }
  }
  const comboCount = effectiveComboCount(range.map((combo) => combo.weight));
  return {
    comboCount,
    topPairOrBetter: madeWeight,
    draws: 0,
    air: Math.max(0, 1 - madeWeight),
    change: previous
      ? comboCount < previous.comboCount
        ? `有效组合收窄 ${(previous.comboCount - comboCount).toFixed(1)}`
        : `有效组合放宽 ${(comboCount - previous.comboCount).toFixed(1)}`
      : "位置与翻前行动建立初始范围",
  };
}

function actualOrFallback(input: DeepDecisionInput): PolicyAction {
  if (input.actual) return input.actual;
  if (input.legal.canCheck) return { type: "check" };
  if (input.legal.canFold) return { type: "fold" };
  return { type: "call" };
}

function distance(actual: PolicyAction, candidate: PolicyAction) {
  if (actual.type !== candidate.type) return Number.POSITIVE_INFINITY;
  if (actual.type === "raise" && candidate.type === "raise") {
    return Math.abs(actual.to - candidate.to);
  }
  return 0;
}

function precisionRank(precision: ReviewPrecision) {
  return precision === "sampled" ? 0 : precision === "enumerated" ? 1 : 2;
}

export async function calculateDeepHandReview(
  input: DeepReviewInput,
  callbacks: DeepReviewCallbacks,
): Promise<DeepHandReview> {
  const decisions: DeepDecisionReview[] = [];
  const previousRanges: Record<string, DeepRangeSummary> = {};
  const totalTasks = Math.max(1, input.decisions.length * 3 + 2);
  let completed = 0;
  const progress = (stage: DeepReviewProgress["stage"]) => {
    if (callbacks.shouldCancel?.()) throw new ReviewCancelledError();
    completed += 1;
    callbacks.onProgress({ stage, completed: Math.min(completed, totalTasks), total: totalTasks });
  };
  progress("action-line");

  for (const decision of [...input.decisions].sort((a, b) => a.logIndex - b.logIndex)) {
    const active = decision.visiblePlayers.filter((player) => !player.folded);
    const opponents = active.filter((player) => player.seat !== decision.heroSeat);
    const ranges: DeepDecisionReview["ranges"] = {};
    const rangesBySeat: Record<number, DeepRangeCombo[]> = {};
    for (const opponent of opponents) {
      const inferred = inferRange({
        position: opponent.position,
        heroHole: [decision.heroHole[0], decision.heroHole[1]],
        board: [...decision.board],
        activePlayers: active.length,
        opponentSeat: opponent.seat,
        visibleLine: decision.log.map((entry) => ({
          street: entry.street,
          actorSeat: entry.actorSeat,
          kind: entry.kind,
          amount: entry.amount,
          toAmount: entry.toAmount,
          potBefore: entry.potBefore,
          potAfter: entry.potAfter,
        })),
      });
      rangesBySeat[opponent.seat] = inferred.map((combo) => ({ cards: combo.cards, weight: combo.weight }));
      const key = opponent.playerId;
      ranges[key] = summarizeRange(inferred, decision.board, previousRanges[key]);
      previousRanges[key] = ranges[key];
    }
    progress("ranges");
    if (!opponents.length) continue;
    const nodeInput = {
      hero: [decision.heroHole[0], decision.heroHole[1]] as const,
      board: decision.board,
      pot: decision.pot,
      heroStreetBet: decision.visiblePlayers.find((player) => player.seat === decision.heroSeat)?.streetBet ?? 0,
      heroSeat: decision.heroSeat,
      players: decision.visiblePlayers.map((player) => ({
        seat: player.seat,
        totalBet: player.totalBet,
        streetBet: player.streetBet,
        stack: player.stack,
        folded: player.folded,
      })),
      legal: decision.legal,
      rangesBySeat,
    };
    let calculation;
    try {
      calculation = decision.street === "preflop"
        ? await calculatePreflopNode(decision, nodeInput, callbacks.config, () => {
            if (callbacks.shouldCancel?.()) throw new ReviewCancelledError();
          })
        : opponents.length === 1
          ? await calculateHeadsUpNode(nodeInput, () => {
            if (callbacks.shouldCancel?.()) throw new ReviewCancelledError();
          })
          : await calculateMultiwayNode(nodeInput, callbacks.config, () => {
              if (callbacks.shouldCancel?.()) throw new ReviewCancelledError();
            });
    } catch (error) {
      if (error instanceof ReviewCancelledError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${decision.street}（公共牌 ${decision.board.length} 张）的精算节点失败：${message}`);
    }
    progress("equity-ev");
    const actual = actualOrFallback(decision);
    const recommended = [...calculation.candidates].sort((a, b) => b.ev - a.ev)[0];
    const actualCandidate = [...calculation.candidates].sort(
      (a, b) => distance(actual, a.action) - distance(actual, b.action),
    )[0] ?? recommended;
    const normalizedEvLoss = Math.max(
      0,
      (recommended.ev - actualCandidate.ev) / Math.max(1, decision.pot, decision.legal.callAmount),
    );
    const representative = Object.values(rangesBySeat)
      .map((range) => [...range].sort((a, b) => b.weight - a.weight)[0]?.cards)
      .filter(Boolean) as Array<readonly [string, string]>;
    let outs = { clean: [] as string[], dirty: [] as string[] };
    if (decision.board.length >= 3 && decision.board.length < 5 && representative.length) {
      try {
        outs = cleanOuts(decision.heroHole, decision.board, representative.map((cards) => [...cards]));
      } catch {
        outs = { clean: [], dirty: [] };
      }
    }
    const tags = [] as DeepDecisionReview["tags"];
    if (actual.type === "call" && recommended.action.type !== "call") tags.push("overcalling");
    const playersBehind = opponents.filter((player) => player.seat > decision.heroSeat).length;
    if (playersBehind > 0 && (actual.type === "call" || actual.type === "raise")) tags.push("players-behind");
    const correctThinking = normalizedEvLoss <= 0.03
      ? ["实际动作处于可接受的低损失范围"]
      : [];
    const corrections = normalizedEvLoss > 0.03
      ? [`实际动作比最佳候选少 ${(normalizedEvLoss * 100).toFixed(1)}% 节点风险 EV`]
      : [];
    decisions.push({
      id: `${input.handNo}:${decision.logIndex}`,
      logIndex: decision.logIndex,
      street: decision.street,
      position: decision.visiblePlayers.find((player) => player.seat === decision.heroSeat)!.position,
      pot: decision.pot,
      spr: (decision.visiblePlayers.find((player) => player.seat === decision.heroSeat)?.stack ?? 0) /
        Math.max(1, decision.pot),
      activePlayers: active.length,
      playersBehind,
      actual,
      recommended: recommended.action,
      candidates: calculation.candidates,
      normalizedEvLoss,
      equity: calculation.equity,
      requiredEquity: potOdds(decision.legal.callAmount, decision.pot),
      cleanOuts: outs.clean.length,
      dirtyOuts: outs.dirty.length,
      ranges,
      precision: calculation.precision,
      samples: calculation.samples,
      coverage: calculation.coverage,
      confidence: calculation.confidence,
      tags: [...new Set(tags)],
      correctThinking,
      corrections,
      coreRule: normalizedEvLoss <= 0.03
        ? "核心规则：低损失混合动作均可接受，不按单手输赢评价。"
        : `核心规则：比较继续投入后的 EV，再选择 ${recommended.intent} 线。`,
    });
    progress("teaching");
  }

  const totalLoss = decisions.reduce((sum, decision) => sum + decision.normalizedEvLoss, 0);
  const sorted = [...decisions].sort((a, b) => a.normalizedEvLoss - b.normalizedEvLoss);
  const worst = sorted.at(-1);
  const lowestPrecision = decisions.reduce<ReviewPrecision>(
    (lowest, decision) => precisionRank(decision.precision) < precisionRank(lowest) ? decision.precision : lowest,
    "exact",
  );
  progress("saving");
  return {
    version: 1,
    status: "completed",
    handNo: input.handNo,
    seed: input.seed,
    stateHash: deepReviewStateHash(input),
    strategyVersion: input.strategyVersion,
    calculatorVersion: input.calculatorVersion,
    completedAt: new Date().toISOString(),
    summary: {
      grade: totalLoss <= 0.03 ? "良好" : totalLoss <= 0.1 ? "需复盘" : "重点纠正",
      totalNormalizedEvLoss: totalLoss,
      bestDecisionId: sorted[0]?.id,
      worstDecisionId: worst?.id,
      strongestPoint: sorted[0]?.correctThinking[0] ?? "行动线已完整记录",
      priorityCorrection: worst?.corrections[0] ?? "保持按范围和 EV 决策",
      confidence: decisions.length
        ? decisions.reduce((sum, decision) => sum + decision.confidence, 0) / decisions.length
        : 0,
      precision: lowestPrecision,
    },
    decisions,
  };
}
