import { positionLabel, type GameState, type Street } from "../game/game";
import type { PolicyAction } from "../policy/types";
import type { DeepDecisionReview, DeepHandReview } from "../review/types";
import { collectAllowedNumbers, type AiReviewFactPackV1 } from "./types";
import { PLAYER_ARCHETYPES } from "../policy/playerProfiles";
import { TABLE_PROFILES } from "../policy/tableProfiles";
import { createDeck, type Card } from "../engine/cards";
import { bestHand, compareHands } from "../engine/evaluator";

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

function possibleBetterHands(heroHole: [Card, Card], board: Card[]) {
  if (board.length < 3) return { betterHandClasses: [], betterHandExamples: [] };
  const hero = bestHand([...heroHole, ...board]);
  const deck = createDeck().filter((card) => !heroHole.includes(card) && !board.includes(card));
  const byClass = new Map<string, string[]>();
  for (let first = 0; first < deck.length - 1; first += 1) {
    for (let second = first + 1; second < deck.length; second += 1) {
      const hole: [Card, Card] = [deck[first], deck[second]];
      const rank = bestHand([...hole, ...board]);
      if (compareHands(rank, hero) <= 0) continue;
      const examples = byClass.get(rank.name) ?? [];
      if (examples.length < 2) examples.push(hole.join(" "));
      byClass.set(rank.name, examples);
    }
  }
  return {
    betterHandClasses: [...byClass.keys()],
    betterHandExamples: [...byClass.entries()].flatMap(([name, examples]) => examples.map((cards) => `${name}：${cards}`)).slice(0, 8),
  };
}

function structuredDecisionFacts(decision: DeepDecisionReview, heroHole: [Card, Card], board: Card[]): AiReviewFactPackV1["streets"][number]["decisions"][number] {
  const coach = "coach" in decision ? decision.coach : undefined;
  const heroHand = coach?.madeHandLabel ?? "本地牌型未分类";
  return {
    position: positionLabel(decision.position).name,
    heroHand,
    privateContribution: !heroHand.includes("公共牌"),
    equity: `${(decision.equity * 100).toFixed(1)}%`,
    requiredEquity: `${(decision.requiredEquity * 100).toFixed(1)}%`,
    pot: decision.pot,
    playersBehind: decision.playersBehind,
    opponentBuckets: coach?.opponentBuckets.map((bucket) => ({ label: bucket.kind, probability: `${(bucket.probability * 100).toFixed(1)}%` })) ?? [],
    opponentResponses: coach?.opponentResponses.map((response) => ({ action: response.action, probability: `${(response.probability * 100).toFixed(1)}%` })) ?? [],
    recommendationReasons: coach?.recommendationReasons ?? [],
    changeConditions: coach?.changeConditions ?? [],
    ...possibleBetterHands(heroHole, board),
  };
}

function boardForStreet(board: GameState["board"], street: Street) {
  if (street === "preflop") return [];
  if (street === "flop") return board.slice(0, 3);
  if (street === "turn") return board.slice(0, 4);
  return board.slice(0, 5);
}

export function buildAiReviewFacts(game: GameState, review: DeepHandReview): AiReviewFactPackV1 {
  const heroHole = [...game.players[game.heroSeat].hole] as [Card, Card];
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
        decisions: review.decisions.filter((decision) => decision.street === street.street).map((decision) => structuredDecisionFacts(decision, heroHole, street.board)),
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
        decisions: [structuredDecisionFacts(decision, heroHole, boardForStreet(game.board, decision.street))],
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
    tableProfile: `${TABLE_PROFILES[game.tableProfileId].name}：${TABLE_PROFILES[game.tableProfileId].description}`,
    heroHole,
    playerProfiles: game.playerProfiles.map((profile) => ({
      playerId: profile.playerId,
      name: profile.displayName,
      style: `${PLAYER_ARCHETYPES[profile.archetype].name}，松紧${profile.looseness}，进攻${profile.aggression}，诈唬${profile.bluff}`,
    })),
    conclusionFacts,
    streets,
    recommendationKeys: streets.map((street) => `${street.street}:${street.recommended}`),
  };
  return { ...factsWithoutNumbers, allowedNumbers: collectAllowedNumbers(factsWithoutNumbers) };
}
