import { RANKS, type Card } from "../engine/cards";
import type { DecisionContext, PolicyAction } from "./types";

export type PreflopFrequency = {
  action: PolicyAction;
  frequency: number;
  reason: string;
};

const POSITION_BONUS: Record<DecisionContext["position"], number> = {
  UTG: 0,
  HJ: 5,
  CO: 10,
  BTN: 16,
  SB: 8,
  BB: 6,
};

function rank(card: Card) {
  return RANKS.indexOf(card[0] as (typeof RANKS)[number]);
}

export function canonicalHand(hole: [Card, Card]) {
  const [first, second] = [...hole].sort((a, b) => rank(b) - rank(a));
  const high = first[0];
  const low = second[0];
  if (high === low) return `${high}${low}`;
  return `${high}${low}${first[1] === second[1] ? "s" : "o"}`;
}

function handScore(hole: [Card, Card]) {
  const sorted = [...hole].sort((a, b) => rank(b) - rank(a)) as [Card, Card];
  const high = rank(sorted[0]);
  const low = rank(sorted[1]);
  const pair = high === low;
  const suited = sorted[0][1] === sorted[1][1];
  const gap = high - low;
  if (pair) return Math.min(100, 40 + high * 5);
  let score = high * 4 + low * 1.8;
  if (suited) score += 8;
  if (gap === 1) score += 7;
  else if (gap === 2) score += 3;
  else if (gap >= 4) score -= 5;
  if (high === 12) score += 10;
  if (high >= 10 && low >= 8) score += 8;
  return Math.max(0, Math.min(99, score));
}

export function preflopTier(
  hole: [Card, Card],
  position: DecisionContext["position"],
) {
  return Math.max(0, 100 - handScore(hole) - POSITION_BONUS[position]);
}

function raiseCount(context: DecisionContext) {
  return context.visibleLine.filter(
    (action) =>
      action.street === "preflop" &&
      (action.kind === "raise" || action.kind === "bet" || action.kind === "all-in"),
  ).length;
}

function normalize(
  items: PreflopFrequency[],
  legalActions: DecisionContext["legal"],
): PreflopFrequency[] {
  const legal = items.filter((item) => {
    if (item.action.type === "fold") return legalActions.fold;
    if (item.action.type === "check") return legalActions.check;
    if (item.action.type === "call") return legalActions.call > 0;
    return legalActions.raise;
  });
  if (!legal.length) {
    if (legalActions.check)
      return [{ action: { type: "check" }, frequency: 1, reason: "唯一合法过牌" }];
    if (legalActions.call > 0)
      return [{ action: { type: "call" }, frequency: 1, reason: "短筹码跟注全下" }];
    if (legalActions.fold)
      return [{ action: { type: "fold" }, frequency: 1, reason: "无其他合法继续" }];
  }
  const total = legal.reduce((sum, item) => sum + item.frequency, 0);
  return legal.map((item) => ({ ...item, frequency: item.frequency / total }));
}

export function preflopFrequencies(context: DecisionContext): PreflopFrequency[] {
  const score = handScore(context.hole);
  const raises = raiseCount(context);
  let items: PreflopFrequency[];

  if (raises >= 3) {
    if (score >= 88)
      items = [
        { action: { type: "raise", to: context.maxRaiseTo }, frequency: 0.55, reason: "顶端范围 5-bet 全下" },
        { action: { type: "call" }, frequency: 0.45, reason: "顶端范围控制深筹码波动" },
      ];
    else if (score >= 82)
      items = [
        { action: { type: "call" }, frequency: 0.62, reason: "强牌关闭再加注循环" },
        { action: { type: "fold" }, frequency: 0.38, reason: "面对 5-bet 收紧范围" },
      ];
    else
      items = [
        { action: { type: "fold" }, frequency: 0.9, reason: "深层加注只保留顶端范围" },
        { action: { type: "call" }, frequency: 0.1, reason: "低频率防守" },
      ];
  } else if (raises >= 2) {
    if (score >= 85)
      items = [
        { action: { type: "raise", to: context.minRaiseTo }, frequency: 0.78, reason: "顶端范围 4-bet" },
        { action: { type: "call" }, frequency: 0.22, reason: "顶端范围保留跟注" },
      ];
    else if (score >= 72)
      items = [
        { action: { type: "raise", to: context.minRaiseTo }, frequency: 0.38, reason: "极化 4-bet" },
        { action: { type: "call" }, frequency: 0.32, reason: "强牌继续" },
        { action: { type: "fold" }, frequency: 0.3, reason: "面对挤压控制范围" },
      ];
    else
      items = [
        { action: { type: "fold" }, frequency: 0.88, reason: "受压后淘汰被支配牌" },
        { action: { type: "call" }, frequency: 0.12, reason: "低频率防守" },
      ];
  } else if (raises === 1) {
    if (score >= 78)
      items = [
        { action: { type: "raise", to: context.minRaiseTo }, frequency: 0.66, reason: "价值 3-bet" },
        { action: { type: "call" }, frequency: 0.34, reason: "保留强跟注范围" },
      ];
    else if (score + POSITION_BONUS[context.position] >= 58)
      items = [
        { action: { type: "call" }, frequency: 0.58, reason: "位置和可玩性足够" },
        { action: { type: "raise", to: context.minRaiseTo }, frequency: 0.14, reason: "低频半诈唬 3-bet" },
        { action: { type: "fold" }, frequency: 0.28, reason: "控制边缘继续" },
      ];
    else
      items = [{ action: { type: "fold" }, frequency: 1, reason: "不足以对抗开池范围" }];
  } else {
    const open = score + POSITION_BONUS[context.position] >= 55;
    items = open
      ? [
          { action: { type: "raise", to: context.minRaiseTo }, frequency: 0.82, reason: "位置开池范围" },
          { action: { type: "check" }, frequency: 0.18, reason: "大盲低频过牌" },
        ]
      : context.legal.check
        ? [{ action: { type: "check" }, frequency: 1, reason: "免费看牌" }]
        : [{ action: { type: "fold" }, frequency: 1, reason: "不在开池范围" }];
  }
  return normalize(items, context.legal);
}
