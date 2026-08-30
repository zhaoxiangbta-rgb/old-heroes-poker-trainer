import { positionLabel, type GameState, type Street } from "../game/game";
import type { PolicyAction } from "../policy/types";
import type { DeepDecisionReview, DeepHandReview } from "../review/types";
import { collectAllowedNumbers, type AiReviewFactPackV1 } from "./types";

function actionLabel(action: PolicyAction) {
  if (action.type === "fold") return "弃牌";
  if (action.type === "check") return "过牌";
  if (action.type === "call") return "跟注";
  return `加注到${action.to}`;
}

function decisionFacts(decision: DeepDecisionReview) {
  const facts = [
    `位置${positionLabel(decision.position).name}，存活玩家${decision.activePlayers}人，身后还有${decision.playersBehind}人`,
    `底池${decision.pot}`,
    `权益${(decision.equity * 100).toFixed(1)}%`,
    `继续所需胜率${(decision.requiredEquity * 100).toFixed(1)}%`,
    `SPR ${decision.spr.toFixed(1)}`,
  ];
  if ("coach" in decision) {
    facts.push(decision.coach.madeHandLabel, decision.coach.narrative);
    if (decision.coach.heroRangePercentile !== null)
      facts.push(`自己在当前范围中的分位${(decision.coach.heroRangePercentile * 100).toFixed(1)}%`);
    facts.push(...decision.coach.opponentBuckets.map((bucket) =>
      `对手${bucket.kind}${(bucket.probability * 100).toFixed(1)}%`,
    ));
    facts.push(...decision.coach.opponentResponses.map((response) =>
      `对手对建议动作的${response.action}概率${(response.probability * 100).toFixed(1)}%`,
    ));
    facts.push(...decision.coach.runoutSummary.map((runout) =>
      `${runout.label}${(runout.probability * 100).toFixed(1)}%`,
    ));
    facts.push(...decision.coach.recommendationReasons, ...decision.coach.changeConditions);
  }
  return facts;
}

function boardForStreet(board: GameState["board"], street: Street) {
  if (street === "preflop") return [];
  if (street === "flop") return board.slice(0, 3);
  if (street === "turn") return board.slice(0, 4);
  return board.slice(0, 5);
}

export function buildAiReviewFacts(game: GameState, review: DeepHandReview): AiReviewFactPackV1 {
  const wholeHand = review.version === 3 ? review.wholeHand : undefined;
  const streets = wholeHand
    ? wholeHand.streets.map((street) => ({
        street: street.street,
        board: [...street.board],
        actionLine: [...street.actionLine],
        actual: street.actual,
        recommended: street.recommended,
        facts: [
          street.comment,
          ...review.decisions
            .filter((decision) => decision.street === street.street)
            .flatMap(decisionFacts),
        ],
      }))
    : review.decisions.map((decision) => ({
        street: decision.street,
        board: boardForStreet(game.board, decision.street),
        actionLine: game.log
          .filter((entry) => entry.street === decision.street && entry.actorSeat === game.heroSeat)
          .map((entry) => `${entry.actor}${entry.action}`),
        actual: actionLabel(decision.actual),
        recommended: actionLabel(decision.recommended),
        facts: decisionFacts(decision),
      }));
  const conclusionFacts = wholeHand
    ? [wholeHand.conclusion, wholeHand.turningPoint, wholeHand.bestChoice, wholeHand.nextRule]
    : [review.summary.strongestPoint, review.summary.priorityCorrection];
  if (wholeHand) {
    const playerNames = new Map(game.players.map((player) => [player.playerId, player.name]));
    for (const range of wholeHand.finalRanges) {
      conclusionFacts.push(
        `${playerNames.get(range.playerId) ?? range.playerId}最近${range.latestAction}，${range.buckets.map((bucket) => `${bucket.label}${(bucket.probability * 100).toFixed(1)}%`).join("、")}，范围估计可信度${(range.confidence * 100).toFixed(1)}%`,
      );
    }
  }
  const factsWithoutNumbers = {
    version: 1 as const,
    kind: "review" as const,
    stateHash: review.stateHash,
    handNo: review.handNo,
    seed: review.seed,
    conclusionFacts,
    streets,
    recommendationKeys: streets.map((street) => `${street.street}:${street.recommended}`),
  };
  return { ...factsWithoutNumbers, allowedNumbers: collectAllowedNumbers(factsWithoutNumbers) };
}
