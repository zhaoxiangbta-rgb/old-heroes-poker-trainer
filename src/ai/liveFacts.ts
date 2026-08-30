import { positionLabel, type GameState } from "../game/game";
import type { PreActionInsightState } from "../insights/types";
import { extractHandFeatures } from "../policy/handFeatures";
import type { StrategyAction } from "../strategy/types";
import { collectAllowedNumbers, type AiLiveFactPackV1 } from "./types";

const MADE_LABEL: Record<ReturnType<typeof extractHandFeatures>["made"], string> = {
  "high-card": "高牌",
  pair: "一对",
  "top-pair": "顶对",
  overpair: "超对",
  "two-pair": "两对",
  set: "暗三条",
  trips: "三条",
  straight: "顺子",
  flush: "同花",
  "full-house": "葫芦",
  quads: "四条",
  "straight-flush": "同花顺",
};

function percent(value: number, precision = 0) {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(precision)}%`;
}

function actionLabel(action: StrategyAction) {
  if (action.action === "fold") return "弃牌";
  if (action.action === "check") return "过牌";
  if (action.action === "call") return "跟注";
  if (action.action === "all-in") return "ALL IN";
  return `${action.action === "raise" ? "加注" : "下注"}到${action.toAmount ?? 0}`;
}

function recommended(insight: PreActionInsightState) {
  const actions = insight.analysis?.adjusted ?? insight.analysis?.baseline ?? [];
  const action = [...actions].sort((first, second) =>
    second.frequency - first.frequency || second.ev - first.ev,
  )[0];
  return action
    ? { key: action.action, label: actionLabel(action) }
    : { key: "unavailable", label: "等待本地计算" };
}

export function buildAiLiveFacts(game: GameState, insight: PreActionInsightState): AiLiveFactPackV1 {
  const hero = game.players[game.heroSeat];
  const hole = [hero.hole[0], hero.hole[1]] as AiLiveFactPackV1["heroHole"];
  let currentHand = insight.liveCoach?.hero.currentHand ?? "本地牌型尚未就绪";
  let privateContribution = true;
  if (game.board.length >= 3) {
    const features = extractHandFeatures(hole, [...game.board]);
    privateContribution = !features.publicMadeHand;
    currentHand = features.publicMadeHand
      ? `公共牌${MADE_LABEL[features.made]}，底牌未改善`
      : currentHand;
  }
  const factsWithoutNumbers = {
    version: 1 as const,
    kind: "live" as const,
    stateHash: insight.key?.stateHash ?? `hand-${game.handNo}-${game.street}-${game.log.length}`,
    handNo: game.handNo,
    street: game.street,
    position: positionLabel(hero.position).name,
    heroHole: hole,
    board: [...game.board],
    pot: game.pot,
    price: {
      callAmount: game.legal.callAmount,
      pot: game.pot,
      callFractionOfPot: percent(game.pot > 0 ? game.legal.callAmount / game.pot : 0, 1),
    },
    hero: {
      currentHand,
      privateContribution,
      upgrades: (insight.liveCoach?.hero.upgrades ?? []).map((upgrade) => ({
        name: upgrade.name,
        nextCard: percent(upgrade.nextCard, 1),
        byRiver: percent(upgrade.byRiver, 1),
      })),
    },
    opponents: (insight.liveCoach?.opponents ?? []).map((opponent) => ({
      playerId: opponent.playerId,
      name: game.players.find((player) => player.playerId === opponent.playerId)?.name ?? opponent.playerId,
      actionLine: opponent.actionLine,
      buckets: opponent.buckets.map((bucket) => ({
        label: bucket.label,
        probability: percent(bucket.probability),
      })),
      confidence: percent(opponent.confidence),
    })),
    recommendation: recommended(insight),
  };
  return { ...factsWithoutNumbers, allowedNumbers: collectAllowedNumbers(factsWithoutNumbers) };
}
