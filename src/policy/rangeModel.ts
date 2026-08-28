import type { Card } from "../engine/cards";
import { parseCard } from "../engine/cards";
import { bestHand } from "../engine/evaluator";
import {
  buildWeightedRange,
  removeBlocked,
  updateRange,
  type WeightedCombo,
} from "../engine/ranges";
import type { DecisionContext, VisiblePolicyAction } from "./types";

export type RangeModelInput = {
  position: DecisionContext["position"];
  heroHole: [Card, Card];
  board: Card[];
  activePlayers: number;
  visibleLine: VisiblePolicyAction[];
  opponentSeat?: number;
};

const PRIORS: Record<DecisionContext["position"], string> = {
  UTG: "AA,KK,QQ,JJ,TT,99,88,AKs,AQs,AJs,ATs,KQs,KJs,QJs,AKo,AQo",
  HJ: "AA,KK,QQ,JJ,TT,99,88,77,66,AKs,AQs,AJs,ATs,A9s,KQs,KJs,KTs,QJs,QTs,JTs,T9s,AKo,AQo,AJo,KQo",
  CO: "AA,KK,QQ,JJ,TT,99,88,77,66,55,44,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A5s,KQs,KJs,KTs,K9s,QJs,QTs,Q9s,JTs,J9s,T9s,98s,87s,76s,AKo,AQo,AJo,ATo,KQo,KJo,QJo",
  BTN: "AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,QJs,QTs,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,98s,97s,87s,86s,76s,65s,54s,AKo,AQo,AJo,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo",
  SB: "AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,QJs,QTs,Q9s,JTs,J9s,T9s,98s,87s,76s,65s,AKo,AQo,AJo,ATo,KQo,KJo,QJo",
  BB: "AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,QJs,QTs,Q9s,Q8s,JTs,J9s,J8s,T9s,T8s,98s,97s,87s,86s,76s,75s,65s,64s,54s,AKo,AQo,AJo,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo",
};

export function positionPriorNotation(position: DecisionContext["position"]) {
  return PRIORS[position];
}

function preflopStrength(combo: WeightedCombo) {
  const ranks = combo.cards.map((card) => parseCard(card).rank).sort((a, b) => b - a);
  const pair = ranks[0] === ranks[1];
  const suited = combo.cards[0][1] === combo.cards[1][1];
  return Math.min(1, (pair ? 0.38 : 0) + ranks[0] / 22 + ranks[1] / 50 + (suited ? 0.06 : 0));
}

function comboStrength(combo: WeightedCombo, board: Card[]) {
  if (board.length < 3) return preflopStrength(combo);
  const hand = bestHand([...combo.cards, ...board]);
  return Math.min(1, hand.category / 8 + (hand.tiebreak[0] ?? 0) / 120);
}

export function actionSizePot(action: VisiblePolicyAction) {
  const amount = action.amount ?? action.toAmount;
  const before = Math.max(1, action.potBefore ?? action.potAfter - amount);
  return amount / before;
}

export function inferRange(input: RangeModelInput): WeightedCombo[] {
  const base = buildWeightedRange(PRIORS[input.position]);
  let range: WeightedCombo[];
  try {
    range = removeBlocked(base, [...input.heroHole, ...input.board]);
  } catch {
    range = removeBlocked(buildWeightedRange(PRIORS.BTN), [...input.heroHole, ...input.board]);
  }

  const relevantLine = input.opponentSeat === undefined
    ? input.visibleLine
    : input.visibleLine.filter((action) => action.actorSeat === input.opponentSeat);
  for (const action of relevantLine) {
    const aggressive = action.kind === "raise" || action.kind === "bet" || action.kind === "all-in";
    const calling = action.kind === "call";
    if (!aggressive && !calling) continue;
    const size = actionSizePot(action);
    range = updateRange(
      range,
      (combo) => {
        const strength = comboStrength(combo, input.board);
        if (calling) return Math.max(0.08, 1.1 - size * 0.28 + strength * 0.55);
        const riverLarge = action.street === "river" && size >= 0.75;
        const valueBias = riverLarge ? strength * strength * 3.2 : strength * 1.55;
        const bluffTail = riverLarge ? 0.06 : 0.2;
        return bluffTail + valueBias + size * strength * 0.35;
      },
      `${action.street} ${action.kind} ${size.toFixed(2)} pot`,
    );
  }

  if (input.activePlayers > 2) {
    range = updateRange(
      range,
      (combo) => 0.65 + comboStrength(combo, input.board) * 0.7,
      `multiway ${input.activePlayers}`,
    );
  }
  return range;
}

export function rangeFingerprint(range: WeightedCombo[]) {
  return [...range]
    .sort((a, b) => a.cards.join("").localeCompare(b.cards.join("")))
    .map((combo) => `${combo.cards.join("")}:${combo.weight.toFixed(9)}`)
    .join("|");
}
