import type { PolicyAction } from "../policy/types";
import type { Street } from "../game/game";
import type {
  CoachDecisionFacts,
  DeepCandidateReview,
  OpponentBucketKind,
} from "./types";

type NarrativeFacts = Omit<CoachDecisionFacts, "narrative" | "recommendationReasons" | "changeConditions">;

export type CoachNarrativeInput = {
  facts: NarrativeFacts;
  requiredEquity: number;
  playersBehind: number;
  street: Street;
  recommended: PolicyAction;
  candidates: readonly DeepCandidateReview[];
};

const BUCKET_LABELS: Record<OpponentBucketKind, string> = {
  "strong-made": "两对及以上",
  "top-pair": "顶对或超对",
  "medium-made": "中小对子",
  "strong-draw": "强听牌",
  "weak-draw": "弱听牌",
  air: "弱牌或诈唬",
  "premium-pair": "高口袋对子",
  "medium-pair": "中小口袋对子",
  "strong-ace": "强 A 高牌",
  "suited-connector": "同花连张",
  "wide-call": "宽跟注牌",
  "weak-preflop": "弱起手牌",
};

function percent(value: number, digits = 1): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(digits)}%`;
}

function actionLabel(action: PolicyAction): string {
  if (action.type === "fold") return "弃牌";
  if (action.type === "check") return "过牌";
  if (action.type === "call") return "跟注";
  return `加注到 ${action.to}`;
}

function confidenceLead(confidence: number): string {
  if (confidence < 0.55) return "本地模型只能粗略估计";
  if (confidence <= 0.75) return "本地模型倾向估计";
  return "本地模型较有把握地估计";
}

function rangeSentence(facts: NarrativeFacts): string {
  if (!facts.opponentBuckets.length) return "当前行动信息不足，暂时无法可靠拆分对手范围类型。";
  const parts = [...facts.opponentBuckets]
    .sort((first, second) => second.probability - first.probability)
    .filter((item) => item.probability >= 0.01)
    .map((item) => `${BUCKET_LABELS[item.kind]}约 ${percent(item.probability, 0)}`);
  return `${confidenceLead(facts.confidence)}，对手范围包括${parts.join("、")}。`;
}

function runoutSentence(facts: NarrativeFacts, street: Street): string {
  if (street === "river" || !facts.runoutSummary.length) return "";
  const items = facts.runoutSummary
    .filter((item) => item.probability >= 0.005)
    .slice(0, 4)
    .map((item) => `${item.label} ${percent(item.probability)}`);
  return items.length ? `后续牌方面，${items.join("，")}。` : "";
}

function candidateFor(candidates: readonly DeepCandidateReview[], action: PolicyAction) {
  return [...candidates].sort((first, second) => {
    const firstDistance = first.action.type !== action.type
      ? Number.POSITIVE_INFINITY
      : first.action.type === "raise" && action.type === "raise" ? Math.abs(first.action.to - action.to) : 0;
    const secondDistance = second.action.type !== action.type
      ? Number.POSITIVE_INFINITY
      : second.action.type === "raise" && action.type === "raise" ? Math.abs(second.action.to - action.to) : 0;
    return firstDistance - secondDistance;
  })[0];
}

export function buildCoachNarrative(input: CoachNarrativeInput): {
  narrative: string;
  recommendationReasons: string[];
  changeConditions: string[];
} {
  const { facts } = input;
  const topShare = facts.heroRangePercentile === null ? null : 1 - facts.heroRangePercentile;
  const strength = topShare === null
    ? `你目前是${facts.madeHandLabel}。`
    : `你目前是${facts.madeHandLabel}，在自己走到这里的合理范围中约处于前 ${percent(topShare, 0)}。`;
  const range = rangeSentence(facts);
  const price = input.requiredEquity > 0
    ? `面对当前价格，预计权益 ${percent(facts.equityVsFullRange)}，跟注只需要约 ${percent(input.requiredEquity)}。`
    : `当前可以免费过牌，预计对对手完整范围有 ${percent(facts.equityVsFullRange)} 权益。`;
  const behind = input.playersBehind > 0
    ? `身后还有 ${input.playersBehind} 人未完成行动${facts.atLeastOnePlayerBehindContinues === null
      ? "，需要额外保留他们跟注或加注的风险"
      : `，至少一人继续的估计概率约为 ${percent(facts.atLeastOnePlayerBehindContinues)}`}。`
    : "身后已经没有待行动玩家，决策不需要再为挤压风险额外折价。";
  const recommendedCandidate = candidateFor(input.candidates, input.recommended);
  const bestAlternative = [...input.candidates]
    .filter((candidate) => candidate.action.type !== input.recommended.type)
    .sort((first, second) => second.ev - first.ev)[0];
  const comparison = recommendedCandidate && bestAlternative
    ? `推荐${actionLabel(input.recommended)}：本地 EV 为 ${recommendedCandidate.ev.toFixed(2)}，高于主要备选${actionLabel(bestAlternative.action)}的 ${bestAlternative.ev.toFixed(2)}。`
    : `推荐${actionLabel(input.recommended)}，因为它在当前范围和价格下保留了最高的本地估计 EV。`;
  const continueRange = facts.equityVsContinueRange === null
    ? ""
    : `如果主动加注后只剩愿意继续的更强范围，你的预计权益约为 ${percent(facts.equityVsContinueRange)}。`;
  const runout = runoutSentence(facts, input.street);

  const recommendationReasons = [
    `当前牌力为${facts.madeHandLabel}，自身范围位置${topShare === null ? "暂不可得" : `约前 ${percent(topShare, 0)}`}`,
    `对对手完整范围预计权益 ${percent(facts.equityVsFullRange)}`,
    input.requiredEquity > 0 ? `当前价格需要约 ${percent(input.requiredEquity)} 胜率` : "当前无需支付跟注成本",
  ];
  if (input.playersBehind > 0) recommendationReasons.push(`身后仍有 ${input.playersBehind} 人，存在继续或加注风险`);
  if (facts.equityVsContinueRange !== null) recommendationReasons.push(`对手继续后权益约 ${percent(facts.equityVsContinueRange)}`);

  const changeConditions: string[] = [];
  if (input.requiredEquity > 0) changeConditions.push("如果对手下注显著增大、所需胜率接近或超过你的预计权益，应提高弃牌频率");
  if (input.playersBehind > 0) changeConditions.push("如果身后玩家已经弃牌，跟注或控池线会更轻松");
  if (facts.opponentResponses.some((response) => response.action === "raise" && response.probability >= 0.12))
    changeConditions.push("如果对手反加注，其继续范围会明显变强，需要重新评估顶对和普通听牌");
  if (!changeConditions.length) changeConditions.push("如果对手范围或下注尺度明显改变，应按新的价格重新比较权益与 EV");

  return {
    narrative: [strength, range, price, behind, runout, comparison, continueRange].filter(Boolean).join(" "),
    recommendationReasons,
    changeConditions,
  };
}
