import type { Card } from "../engine/cards";
import type { Street } from "../game/game";

export type AiLiveFactPackV1 = {
  version: 1;
  kind: "live";
  stateHash: string;
  handNo: number;
  street: Street;
  position: string;
  heroHole: [Card, Card];
  board: Card[];
  pot: number;
  price: { callAmount: number; pot: number; callFractionOfPot: string };
  hero: {
    currentHand: string;
    privateContribution: boolean;
    upgrades: Array<{ name: string; nextCard: string; byRiver: string }>;
  };
  opponents: Array<{
    playerId: string;
    name: string;
    actionLine: string;
    buckets: Array<{ label: string; probability: string }>;
    confidence: string;
  }>;
  recommendation: { key: string; label: string };
  allowedNumbers: string[];
};

export type AiReviewFactPackV1 = {
  version: 1;
  kind: "review";
  stateHash: string;
  handNo: number;
  seed: number;
  tableProfile: string;
  heroHole: [Card, Card];
  playerProfiles: Array<{
    playerId: string;
    name: string;
    style: string;
  }>;
  conclusionFacts: string[];
  streets: Array<{
    street: Street;
    board: Card[];
    actionLine: string[];
    actual: string;
    recommended: string;
    facts: string[];
    decisions: Array<{
      position: string;
      heroHand: string;
      privateContribution: boolean;
      equity: string;
      requiredEquity: string;
      pot: number;
      playersBehind: number;
      opponentBuckets: Array<{ label: string; probability: string }>;
      opponentResponses: Array<{ action: string; probability: string }>;
      recommendationReasons: string[];
      changeConditions: string[];
      betterHandClasses: string[];
      betterHandExamples: string[];
    }>;
  }>;
  recommendationKeys: string[];
  allowedNumbers: string[];
};

export type AiLiveExplanationV1 = {
  version: 1;
  stateHash: string;
  currentHand: string;
  reasoning: string[];
  opponentRead: string[];
  risks: string[];
  recommendationRestatement: string;
};

export type AiHandReviewV1 = {
  version: 1;
  stateHash: string;
  summary: string;
  streets: Array<{ street: Street; analysis: string }>;
  turningPoint: string;
  keyLesson: string;
};

export function collectAllowedNumbers(value: unknown): string[] {
  const serialized = JSON.stringify(value);
  const numbers = serialized.match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(numbers.map((number) => number.replace(/^0+(?=\d)/, "")))].sort(
    (first, second) => Number(first) - Number(second) || first.localeCompare(second),
  );
}
