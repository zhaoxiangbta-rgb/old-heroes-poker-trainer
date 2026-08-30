import type { Card } from "../engine/cards";
import type { StrategyResult } from "../strategy/types";
import type {
  ExactProjection,
  LiveCoachOpponentBucket,
  LiveCoachSummary,
  OpponentRangeBuckets,
  OpponentRangeSummary,
  PreActionInsightInput,
} from "./types";

const BUCKET_LABELS: Record<keyof OpponentRangeBuckets, string> = {
  strongValue: "强价值",
  madeHand: "普通成牌",
  strongDraw: "强听牌",
  weakDraw: "弱听牌",
  air: "空气",
};

function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function startingHandLabel(hole: readonly [Card, Card]) {
  const first = hole[0][0].toUpperCase();
  const second = hole[1][0].toUpperCase();
  if (first === second) return `${first}${second}口袋对子`;
  return `${first}${second}${hole[0][1] === hole[1][1] ? "同花" : "非同花"}起手牌`;
}

function latestAggressorSeat(input: PreActionInsightInput) {
  const aggressive = (action: PreActionInsightInput["actions"][number]) =>
    action.kind === "bet" || action.kind === "raise" || action.kind === "all-in";
  const onStreet = [...input.actions].reverse().find((action) => action.street === input.street && aggressive(action));
  return onStreet?.actorSeat ?? [...input.actions].reverse().find(aggressive)?.actorSeat;
}

function opponentBuckets(buckets: OpponentRangeBuckets): LiveCoachOpponentBucket[] {
  const total = Object.values(buckets).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return [];
  return (Object.entries(buckets) as Array<[keyof OpponentRangeBuckets, number]>)
    .map(([key, value]) => ({ key, label: BUCKET_LABELS[key], probability: Math.max(0, value) / total }))
    .filter((bucket) => bucket.probability >= 0.01)
    .sort((first, second) => second.probability - first.probability);
}

function heroSummary(input: PreActionInsightInput, exact?: ExactProjection): LiveCoachSummary["hero"] {
  if (!exact || input.street === "preflop") {
    return { currentHand: startingHandLabel(input.heroHole), upgrades: [], upgradeSummary: "翻牌后再计算成牌升级" };
  }
  const upgrades = input.street === "river"
    ? []
    : exact.handClasses
      .filter((item) => item.category > exact.currentHand.category && (item.nextCard > 0 || item.byRiver > 0))
      .sort((first, second) => second.byRiver - first.byRiver)
      .slice(0, 3)
      .map((item) => ({ ...item }));
  const upgradeSummary = upgrades.length
    ? upgrades.map((item) => `${item.name}到河牌${percent(item.byRiver)}`).join("、")
    : input.street === "river" ? "河牌已无后续升级" : "没有明显的更高牌型路径";
  return { currentHand: exact.currentHand.name, upgrades, upgradeSummary };
}

function strategyLabel(strategy: StrategyResult) {
  if (!strategy.strategyVersion.startsWith("strategy-v4")) {
    return strategy.strategyVersion.startsWith("strategy-v3") ? "V3" : strategy.strategyVersion;
  }
  if (strategy.explanationFacts.algorithm === "solver-dcfr-v4") return "V4 · Solver节点";
  if (strategy.explanationFacts.v4Layer === "preflop-matrix") return "V4 · 翻前矩阵";
  if (strategy.explanationFacts.v4Layer === "multiway-range-resolver") return "V4 · 多人范围解析";
  return "V4 · 范围解析";
}

export function buildLiveCoachSummary(facts: {
  input: PreActionInsightInput;
  exact?: ExactProjection;
  ranges: readonly OpponentRangeSummary[];
  strategy: StrategyResult;
}): LiveCoachSummary {
  const { input, exact, ranges, strategy } = facts;
  const primarySeat = latestAggressorSeat(input);
  const opponents = ranges.map((range) => ({
    seat: range.seat,
    playerId: range.playerId,
    primary: range.seat === primarySeat,
    comboCount: range.comboCount,
    confidence: range.confidence,
    actionLine: range.changes.at(-1) ?? "尚无足够行动信息",
    buckets: opponentBuckets(range.buckets),
  })).sort((first, second) => Number(second.primary) - Number(first.primary) || first.seat - second.seat);
  const confidence = Math.min(strategy.confidence, ...(ranges.length ? ranges.map((range) => range.confidence) : [strategy.confidence]));
  return {
    schemaVersion: 1,
    strategy: {
      label: strategyLabel(strategy),
      version: strategy.strategyVersion,
      degraded: Boolean(strategy.degradation),
      ...(strategy.degradation ? { reason: strategy.degradation.reason } : {}),
    },
    hero: heroSummary(input, exact),
    opponents,
    confidence,
  };
}
