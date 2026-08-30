import { positionLabel, streetName, type GameLog, type Street } from "../game/game";
import type { PolicyAction } from "../policy/types";
import type { DeepDecisionInput, DeepDecisionReviewV3, WholeHandCoachReview } from "./types";

const RANGE_LABELS = {
  strongValue: "强价值",
  madeHand: "普通成牌",
  strongDraw: "强听牌",
  weakDraw: "弱听牌",
  air: "空气或诈唬",
} as const;

const PREFLOP_RANGE_LABELS = {
  "premium-pair": "高对子",
  "medium-pair": "中小对子",
  "strong-ace": "强A高牌",
  "suited-connector": "同花连张",
  "wide-call": "边缘高牌或同花牌",
  "weak-preflop": "弱起手牌",
  "strong-made": "强牌",
  "top-pair": "成对类牌",
  "medium-made": "中等牌",
  "strong-draw": "强潜力牌",
  "weak-draw": "弱潜力牌",
  air: "弱起手牌",
} as const;

function percent(value: number, digits = 0) {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(digits)}%`;
}

function actionLabel(action: PolicyAction) {
  if (action.type === "fold") return "弃牌";
  if (action.type === "check") return "过牌";
  if (action.type === "call") return "跟注";
  return `加注到${action.to}`;
}

function isSmallBlindComplete(entry: GameLog, input: DeepDecisionInput) {
  if (entry.street !== "preflop" || entry.kind !== "call") return false;
  const actor = input.visiblePlayers.find((player) => player.seat === entry.actorSeat);
  const index = input.log.indexOf(entry);
  const facedRaise = input.log.slice(0, index < 0 ? input.log.length : index).some((action) =>
    action.street === "preflop" && (action.kind === "raise" || action.kind === "bet" || action.kind === "all-in"));
  return actor?.position === "SB" && !facedRaise;
}

function logLabel(entry: GameLog, input: DeepDecisionInput) {
  if (isSmallBlindComplete(entry, input)) return `${entry.actor} 补齐到 ${entry.toAmount || entry.amount}`;
  const action = entry.kind === "fold" ? "弃牌"
    : entry.kind === "check" ? "过牌"
      : entry.kind === "call" ? "跟注"
        : entry.kind === "all-in" ? "全下到"
          : entry.kind === "bet" ? "下注到" : "加注到";
  const amount = entry.kind === "fold" || entry.kind === "check" ? "" : ` ${entry.toAmount || entry.amount}`;
  return `${entry.actor} ${action}${amount}`;
}

function uniqueActionLines(inputs: readonly DeepDecisionInput[]) {
  const seen = new Set<string>();
  const byStreet = new Map<Street, string[]>();
  for (const input of [...inputs].sort((a, b) => a.logIndex - b.logIndex)) {
    for (const entry of input.log) {
      const key = [entry.street, entry.actorSeat, entry.kind, entry.amount, entry.toAmount, entry.potAfter].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const lines = byStreet.get(entry.street) ?? [];
      lines.push(logLabel(entry, input));
      byStreet.set(entry.street, lines);
    }
  }
  return byStreet;
}

function dominantOpponentText(decision: DeepDecisionReviewV3) {
  if (decision.street === "preflop" && decision.coach.opponentBuckets.length) {
    const primary = [...decision.coach.opponentBuckets]
      .sort((first, second) => second.probability - first.probability)[0];
    return `对手起手牌主要是${PREFLOP_RANGE_LABELS[primary.kind]}约${percent(primary.probability)}`;
  }
  const primary = decision.opponentRanges[0];
  if (!primary) return "对手范围信息不足";
  const [key, probability] = Object.entries(primary.buckets)
    .sort((first, second) => second[1] - first[1])[0] as [keyof typeof RANGE_LABELS, number];
  return `对手主要是${RANGE_LABELS[key]}约${percent(probability)}`;
}

function decisionComment(decision: DeepDecisionReviewV3, input?: DeepDecisionInput) {
  const position = positionLabel(decision.position).name;
  const hero = input?.visiblePlayers.find((player) => player.seat === input.heroSeat);
  const smallBlindComplete = decision.street === "preflop" && decision.position === "SB" &&
    decision.actual.type === "call" && !!input && (hero?.streetBet ?? 0) > 0 &&
    !input.log.some((action) => action.street === "preflop" &&
      (action.kind === "raise" || action.kind === "bet" || action.kind === "all-in"));
  const actual = smallBlindComplete ? `补齐到${input.currentBet}` : actionLabel(decision.actual);
  const recommended = actionLabel(decision.recommended);
  const verdict = actual === recommended
    ? `你的${actual}处在可接受范围`
    : decision.normalizedEvLoss <= 0.03
      ? `你选择${actual}，属于可接受的低损失偏离；标准主频线是${recommended}`
      : `你选择${actual}，更好的是${recommended}`;
  const price = smallBlindComplete
    ? `补齐${input.legal.callAmount}筹码到${input.currentBet}，投入后底池${input.pot + input.legal.callAmount}，底池赔率门槛${percent(decision.requiredEquity, 1)}；这只是直接赔率，还要考虑大盲加注和翻后位置劣势`
    : decision.requiredEquity > 0 ? `继续需要约${percent(decision.requiredEquity, 1)}胜率` : "当前可以免费过牌";
  return `${position}，你当前是${decision.coach.madeHandLabel}。${dominantOpponentText(decision)}；${price}。${verdict}。`;
}

export function buildWholeHandNarrative(
  decisions: readonly DeepDecisionReviewV3[],
  inputs: readonly DeepDecisionInput[],
): WholeHandCoachReview {
  const sorted = [...decisions].sort((first, second) => first.logIndex - second.logIndex);
  const inputByKey = new Map(inputs.map((input) => [`${input.street}:${input.logIndex}`, input]));
  const linesByStreet = uniqueActionLines(inputs);
  const streetOrder: Street[] = ["preflop", "flop", "turn", "river"];
  const streets = streetOrder.flatMap((street) => {
    const streetDecisions = sorted.filter((decision) => decision.street === street);
    if (!streetDecisions.length) return [];
    const latest = streetDecisions.at(-1)!;
    const input = inputByKey.get(`${latest.street}:${latest.logIndex}`);
    return {
      street,
      board: [...(input?.board ?? [])],
      actionLine: linesByStreet.get(street) ?? [],
      comment: streetDecisions.map((decision) => decisionComment(
        decision,
        inputByKey.get(`${decision.street}:${decision.logIndex}`),
      )).join(" "),
      actual: streetDecisions.map((decision) => actionLabel(decision.actual)).join(" → "),
      recommended: streetDecisions.map((decision) => actionLabel(decision.recommended)).join(" → "),
    };
  });
  const worst = [...sorted].sort((first, second) => second.normalizedEvLoss - first.normalizedEvLoss)[0];
  const finalDecision = sorted.at(-1);
  const turningPoint = worst
    ? `${streetName(worst.street)}是本手关键转折：你选择${actionLabel(worst.actual)}，模型更推荐${actionLabel(worst.recommended)}，这是本手最大的长期收益差异。`
    : "本手没有可评估的英雄决策。";
  const finalRanges = (finalDecision?.opponentRanges ?? []).map((range) => ({
    playerId: range.playerId,
    latestAction: range.latestAction,
    buckets: (Object.entries(range.buckets) as Array<[keyof typeof RANGE_LABELS, number]>)
      .map(([key, probability]) => ({ label: RANGE_LABELS[key], probability }))
      .filter((bucket) => bucket.probability >= 0.01)
      .sort((first, second) => second.probability - first.probability),
    confidence: range.confidence,
  }));
  const bestChoice = worst
    ? `${streetName(worst.street)}最佳选择是${actionLabel(worst.recommended)}。${worst.requiredEquity > 0
      ? `继续需要${percent(worst.requiredEquity, 1)}胜率，你对完整范围的估计权益约${percent(worst.equity, 1)}。`
      : "当前无需支付跟注成本，应比较过牌与主动下注能从哪些更差牌获得价值。"}`
    : "暂无最佳动作。";
  const nextRule = worst?.actual.type === "call" && worst.recommended.type === "fold"
    ? "下次先看对手的行动强度和你需要的胜率：便宜不等于必须跟，强行动线要收紧继续范围。"
    : "下次先问：这个尺寸能让哪些更差的牌继续，又会让哪些更好的牌反加？";
  const conclusion = worst && worst.normalizedEvLoss > 0.03
    ? `整手主要问题在${streetName(worst.street)}，其他街道不必重复展开。`
    : "整手没有明显的高损失决策，重点保留当前的范围思路。";
  return { conclusion, streets, turningPoint, finalRanges, bestChoice, nextRule };
}
