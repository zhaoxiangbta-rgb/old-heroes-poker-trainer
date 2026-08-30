import { canonicalHand } from "../policy/preflop";
import { positionPriorNotation } from "../policy/rangeModel";
import type { StrategyAction, StrategyResult } from "../strategy/types";
import type {
  DecisionAnalysisV2,
  ExactProjection,
  OpponentActionResponse,
  OpponentRangeBuckets,
  OpponentRangeSummary,
  PreActionInsightInput,
} from "./types";

export type PlainLanguageAnalysisFacts = {
  input: PreActionInsightInput;
  exact?: ExactProjection;
  ranges: readonly OpponentRangeSummary[];
  responses: readonly OpponentActionResponse[];
  strategy: StrategyResult;
  sampleBudget: number;
};

const POSITION_CN = {
  UTG: "枪口位", HJ: "劫位", CO: "关煞位", BTN: "庄位", SB: "小盲", BB: "大盲",
} as const;

const POSTFLOP_POSITION_ORDER = ["SB", "BB", "UTG", "HJ", "CO", "BTN"] as const;

function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function actionText(action: StrategyAction) {
  if (action.action === "fold") return "弃牌";
  if (action.action === "check") return "过牌";
  if (action.action === "call") return "跟注";
  if (action.action === "all-in") return "全下";
  return `${action.action === "bet" ? "下注到" : "加注到"}${action.toAmount ?? "合法尺度"}`;
}

function aggregateBuckets(ranges: readonly OpponentRangeSummary[]): OpponentRangeBuckets {
  const empty: OpponentRangeBuckets = {
    strongValue: 0, madeHand: 0, strongDraw: 0, weakDraw: 0, air: 0,
  };
  if (!ranges.length) return empty;
  for (const range of ranges) {
    for (const key of Object.keys(empty) as Array<keyof OpponentRangeBuckets>) {
      empty[key] += range.buckets[key] / ranges.length;
    }
  }
  return empty;
}

function heroRangePosition(input: PreActionInsightInput) {
  const hero = input.players.find((player) => player.seat === input.heroSeat);
  const label = canonicalHand([...input.heroHole]);
  if (!hero) return { label, percentile: null };
  const labels = positionPriorNotation(hero.position).split(",");
  const index = labels.indexOf(label);
  return { label, percentile: index < 0 ? null : (index + 1) / labels.length };
}

function positionSentence(
  input: PreActionInsightInput,
  hero: PreActionInsightInput["players"][number] | undefined,
  strategy: StrategyResult,
) {
  if (!hero) return "当前位置信息不完整";
  if (input.street === "preflop") {
    if (hero.position === "BTN" && strategy.explanationFacts.preflopSpot === "unopened") {
      return "庄位且前面全弃牌，属于可开池范围";
    }
    if (hero.position === "UTG") {
      return "枪口位属于前位，常规开池范围更紧";
    }
    return `${POSITION_CN[hero.position]}的范围要结合前序行动判断`;
  }
  const heroOrder = POSTFLOP_POSITION_ORDER.indexOf(hero.position);
  const liveOpponents = input.players.filter((player) => player.seat !== hero.seat && !player.folded);
  const playersBehind = liveOpponents.filter(
    (player) => POSTFLOP_POSITION_ORDER.indexOf(player.position) > heroOrder,
  );
  if (liveOpponents.length && playersBehind.length === 0) {
    return "你在翻后最后行动，位置有利，更容易兑现权益和控制底池";
  }
  if (playersBehind.length) {
    return `你身后还有${playersBehind.length}名存活玩家，位置并非绝对有利`;
  }
  return strategy.explanationFacts.inPosition === 1
    ? "你在翻后后行动，位置有利"
    : "当前翻后行动顺序信息不完整，不对位置优势作硬判断";
}

function strategySentence(actions: readonly StrategyAction[]) {
  const sorted = [...actions].sort((first, second) => second.frequency - first.frequency);
  if (!sorted.length) return "当前没有可用的标准动作。";
  const main = sorted[0];
  const mixed = sorted[1]?.frequency >= 0.12
    ? `，同时可用${actionText(sorted[1])}混合约${percent(sorted[1].frequency)}`
    : "";
  const ev = Number.isFinite(main.ev)
    ? `，本地模型估计该动作长期 EV 约${main.ev >= 0 ? "+" : ""}${main.ev.toFixed(1)}筹码`
    : "";
  return `标准打法以${actionText(main)}为主（约${percent(main.frequency)}）${mixed}${ev}。主要比较这些动作的长期收益，而不是看这一手最后输赢。`;
}

function constructionText(strategy: StrategyResult) {
  const construction = strategy.explanationFacts.construction;
  if (construction === "board-pair-trips") {
    return "你的底牌参与组成三条，但也占用一张同点数牌，会减少对手拿到较弱同类成牌的组合";
  }
  if (construction === "pocket-set") return "你的口袋对子与牌面组成暗三条，对手较难直接看出你的真实强度";
  if (construction === "hole-flush") return "你的底牌参与组成同花，价值取决于更小同花和成牌是否愿意继续";
  if (construction === "hole-straight") return "你的底牌参与组成顺子，需要留意牌面同花和更高顺子的反超可能";
  if (construction === "one-hole-pair") return "你用一张底牌与公共牌配对，主要价值来自更差对子和听牌继续";
  return "当前牌力必须结合对手愿意继续的范围判断，不能只看牌型名称";
}

function matchingResponse(
  actions: readonly StrategyAction[],
  responses: readonly OpponentActionResponse[],
) {
  const aggressive = [...actions]
    .filter((action) => action.toAmount !== undefined)
    .sort((first, second) => second.frequency - first.frequency)[0];
  if (!aggressive) return undefined;
  return [...responses]
    .filter((response) => response.heroAction.type === "raise")
    .sort((first, second) => {
      const firstDistance = first.heroAction.type === "raise"
        ? Math.abs(first.heroAction.to - aggressive.toAmount!) : Number.POSITIVE_INFINITY;
      const secondDistance = second.heroAction.type === "raise"
        ? Math.abs(second.heroAction.to - aggressive.toAmount!) : Number.POSITIVE_INFINITY;
      return firstDistance - secondDistance;
    })[0];
}

function standardReasonSentence(facts: PlainLanguageAnalysisFacts) {
  const response = matchingResponse(facts.strategy.baselineActions ?? facts.strategy.actions, facts.responses);
  const blocker = constructionText(facts.strategy);
  const responseText = response
    ? `这个尺度下，估计约${percent(response.call)}的对手范围会跟注、${percent(response.raise)}会反加；真正的价值来自更差牌继续，而不是把所有牌都赶走`
    : "目前对手继续范围的可信度有限，尺度应优先保留更差牌继续，而不是默认越大越好";
  const future = facts.input.street === "flop"
    ? "翻牌后还剩两条街，较小尺度可以保留转牌继续取值和调整的空间"
    : facts.input.street === "turn"
      ? "转牌后仍要为河牌计划：安全牌继续取值，明显改变范围优势的牌则重新评估"
      : "河牌没有后续补牌，下注只取决于更差牌会不会付钱以及更好牌会不会继续";
  return `${blocker}。${responseText}。${future}。`;
}

function strategyDisplayVersion(strategy: StrategyResult) {
  if (!strategy.strategyVersion.startsWith("strategy-v4")) {
    return strategy.strategyVersion.startsWith("strategy-v3") ? "V3" : strategy.strategyVersion;
  }
  if (strategy.explanationFacts.algorithm === "solver-dcfr-v4") return "V4 · Solver 节点";
  if (strategy.explanationFacts.v4Layer === "preflop-matrix") return "V4 · 翻前矩阵";
  if (strategy.explanationFacts.v4Layer === "multiway-range-resolver") return "V4 · 多人范围解析";
  return "V4 · 范围解析";
}

export function buildPlainLanguageAnalysis(
  facts: PlainLanguageAnalysisFacts,
): DecisionAnalysisV2 {
  const { input, exact, ranges, strategy } = facts;
  const hero = input.players.find((player) => player.seat === input.heroSeat);
  const heroRange = heroRangePosition(input);
  const opponentBuckets = aggregateBuckets(ranges);
  const confidence = Math.min(
    strategy.confidence,
    ranges.length ? Math.min(...ranges.map((range) => range.confidence)) : 0,
  );
  const lowConfidence = confidence < 0.45;
  const required = input.legal.callAmount /
    Math.max(1, input.pot + input.legal.callAmount);
  const positionText = hero ? POSITION_CN[hero.position] : "当前位置";
  const positionEdge = positionSentence(input, hero, strategy);
  const currentHand = exact ? `当前已成${exact.currentHand.name}` : "当前牌力仍在估算";
  const price = input.legal.callAmount
    ? `，面对${input.legal.callAmount}筹码下注，所需胜率约${percent(required)}`
    : "，当前可以过牌";
  const heroRangeText = heroRange.percentile === null
    ? `你的${heroRange.label}不在${positionText}常规继续范围的核心部分`
    : `你的${heroRange.label}位于${positionText}常规范围约前${percent(heroRange.percentile)}`;
  const confidenceLead = lowConfidence ? "信息有限，以下范围仅作方向判断。" : "按位置和已发生行动估计，";
  const rangeText = `${confidenceLead}${heroRangeText}；对手大约有强价值${percent(opponentBuckets.strongValue)}、普通成牌${percent(opponentBuckets.madeHand)}、强听牌${percent(opponentBuckets.strongDraw)}、弱听牌${percent(opponentBuckets.weakDraw)}、空气${percent(opponentBuckets.air)}。`;
  const baseline = strategy.baselineActions ?? strategy.actions;
  const adjusted = strategy.actions;
  const adjustment = strategy.adjustment;
  const adjustmentText = adjustment?.applied
    ? `标准答案保持不变；结合${adjustment.tableProfileId === "friends" ? "朋友局跟注偏宽、诈唬偏少" : "当前牌局风格"}，实际频率最多调整${percent(adjustment.maxShift)}。本次主要动作仍以调整后最高频选择为准。`
    : strategy.degradation
      ? `当前完整策略包未能使用（${strategy.degradation.reason}），本次只给低置信的安全建议，不用于评分。`
      : "当前没有足够依据偏离标准打法，先按标准频率执行。";
  const bestUpgrade = exact?.handClasses
    .filter((item) => item.category > exact.currentHand.category && item.byRiver > 0)
    .sort((first, second) => second.byRiver - first.byRiver)[0];
  const dirty = exact?.outs.filter((out) => out.classification === "dirty") ?? [];
  const watchParts = [
    bestUpgrade ? `到河牌升级为${bestUpgrade.name}约${percent(bestUpgrade.byRiver)}` : "没有明显的高概率升级路径",
    dirty.length ? `${dirty.slice(0, 4).map((out) => out.card).join("、")}虽会改善牌型，但属于脏补牌` : "暂未发现需要单独扣除的脏补牌",
    "若对手突然反加，重点判断其价值牌与诈唬比例，不要把任何下注都等同于坚果",
    input.pendingSeats.filter((seat) => seat !== input.heroSeat).length
      ? `身后还有${input.pendingSeats.filter((seat) => seat !== input.heroSeat).length}人可能行动` : "你身后没有待行动玩家",
  ];
  return {
    schemaVersion: 2,
    sections: [
      { kind: "situation", title: "你现在处于什么局面", text: `${currentHand}，你在${positionText}。${positionEdge}${price}。` },
      { kind: "ranges", title: "双方大概有什么牌", text: rangeText },
      { kind: "baseline", title: "标准打法", text: `${strategySentence(baseline)}${standardReasonSentence(facts)}` },
      { kind: "adjustment", title: "面对这名玩家的调整", text: adjustmentText },
      { kind: "watch", title: "继续行动前要留意什么", text: `${watchParts.join("；")}。` },
    ],
    heroRange,
    opponentBuckets,
    baseline: baseline.map((action) => ({ ...action })),
    adjusted: adjusted.map((action) => ({ ...action })),
    adjustment,
    confidence,
    audit: {
      strategyVersion: strategy.strategyVersion,
      displayVersion: strategyDisplayVersion(strategy),
      degraded: Boolean(strategy.degradation),
      sampleBudget: facts.sampleBudget,
      seed: input.seed,
      nodeId: strategy.nodeId,
      source: strategy.source,
      degradationReason: strategy.degradation?.reason,
    },
  };
}
