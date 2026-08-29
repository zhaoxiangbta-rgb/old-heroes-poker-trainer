import { parseCard } from "../engine/cards";
import { bestHand } from "../engine/evaluator";
import { inferRange } from "../policy/rangeModel";
import { extractHandFeatures } from "../policy/handFeatures";
import type {
  OpponentRangeBuckets,
  OpponentRangeSummary,
  PreActionInsightInput,
} from "./types";

function blankBuckets(): OpponentRangeBuckets {
  return { strongValue: 0, madeHand: 0, strongDraw: 0, weakDraw: 0, air: 0 };
}

function preflopBucket(cards: readonly [string, string]): keyof OpponentRangeBuckets {
  const ranks = cards.map((card) => parseCard(card).rank).sort((a, b) => b - a);
  if (ranks[0] === ranks[1] && ranks[0] >= 10) return "strongValue";
  if (ranks[0] === ranks[1] || ranks[0] >= 12) return "madeHand";
  if (cards[0][1] === cards[1][1] || ranks[0] - ranks[1] <= 2) return "weakDraw";
  return "air";
}

function postflopBucket(cards: readonly [string, string], board: readonly string[]): keyof OpponentRangeBuckets {
  const hand = bestHand([...cards, ...board]);
  if (hand.category >= 3) return "strongValue";
  const features = extractHandFeatures([...cards], [...board]);
  if (hand.category >= 1) return hand.category >= 2 || features.made === "top-pair" || features.made === "overpair"
    ? "strongValue"
    : "madeHand";
  const draws = features.draws;
  if (draws.includes("flush-draw") && (draws.includes("open-ended") || draws.includes("gutshot"))) return "strongDraw";
  if (draws.includes("flush-draw") || draws.includes("open-ended")) return "strongDraw";
  if (draws.includes("gutshot") || draws.includes("backdoor-flush")) return "weakDraw";
  return "air";
}

function describeAction(input: PreActionInsightInput, seat: number): string[] {
  return input.actions.filter((action) => action.actorSeat === seat).map((action) => {
    const street = { preflop: "翻前", flop: "翻牌", turn: "转牌", river: "河牌" }[action.street];
    const kind: Record<string, string> = { fold: "弃牌", check: "过牌", call: "跟注", bet: "下注", raise: "加注", "all-in": "全下" };
    const fraction = action.amount / Math.max(1, action.potBefore);
    return `${street}${kind[action.kind] ?? action.kind}${action.amount > 0 ? ` ${fraction.toFixed(2)} 池` : ""}`;
  });
}

export function inferOpponentRanges(input: PreActionInsightInput): OpponentRangeSummary[] {
  const activePlayers = input.players.filter((player) => !player.folded).length;
  return input.players
    .filter((player) => player.seat !== input.heroSeat && !player.folded)
    .map((player) => {
      const ranges = inferRange({
        position: player.position,
        heroHole: [...input.heroHole],
        board: [...input.board],
        activePlayers,
        visibleLine: [...input.actions],
        opponentSeat: player.seat,
      });
      const buckets = blankBuckets();
      for (const combo of ranges) {
        const key = input.board.length >= 3
          ? postflopBucket(combo.cards, input.board)
          : preflopBucket(combo.cards);
        buckets[key] += combo.weight;
      }
      const actionCount = input.actions.filter((action) => action.actorSeat === player.seat).length;
      const profileKnown = player.profile ? 1 : 0;
      return {
        seat: player.seat,
        playerId: player.playerId,
        comboCount: ranges.length,
        buckets,
        changes: describeAction(input, player.seat),
        confidence: Math.min(0.92, 0.42 + actionCount * 0.1 + profileKnown * 0.1),
        ranges,
      };
    });
}
